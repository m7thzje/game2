import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, PLAYER_CSS } from '../engine/chars.js';
import { buildStall, buildModel, buildPinwheel, buildPlate, ROWS, BOUNDS } from './duckshoot_world.js';

// Schiettent — duel: schiet de meeste punten bij elkaar op de kermis-doelwitten.
// A = schieten, B (ingedrukt houden) = zoom: snel herladen en snel schieten, maar een traag vizier.

const TIME = 45, FINAL = 10, OVERTIME = 20;
const AMMO_MAX = 6;
const X_MAX = 14.4;
const ZOOM_SPEED = 0.38;

const KINDS = {
  duck: { pts: 1, r: 0.72, cy: 0.7, name: 'eend' },
  baby: { pts: 1, r: 0.5, cy: 0.4, speedMul: 1.15, shy: 0.8, name: 'kuiken' },
  gold: { pts: 5, r: 0.66, cy: 0.62, speedMul: 2.1, shy: 0.35, name: 'gouden eend' },
  fat: { pts: 4, r: 1.05, cy: 0.95, speedMul: 0.8, hp: 2, name: 'mama-eend' },
  bunny: { pts: 2, r: 0.72, cy: 0.85, shy: 1, name: 'konijn' },
  dragon: { pts: 2, r: 0.78, cy: 0.85, name: 'draakje' },
  bomb: { pts: -3, r: 0.7, cy: 0.75, name: 'bom' },
};
const ROW_MIX = [
  [['duck', 48], ['bunny', 24], ['bomb', 8], ['fat', 9], ['dragon', 5]],
  [['duck', 52], ['bunny', 10], ['bomb', 9], ['fat', 8], ['dragon', 12]],
  [['duck', 42], ['dragon', 24], ['bomb', 9], ['bunny', 8], ['fat', 8]],
];
function weighted(list) { let t = 0; for (const [, w] of list) t += w; let r = Math.random() * t; for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; }

const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

function crossTex(css, zoom) {
  return canvasTex(128, 128, (g, w, h) => {
    const draw = (col, lw) => {
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round';
      if (!zoom) {
        g.beginPath(); g.arc(64, 64, 40, 0, TAU); g.stroke();
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { g.beginPath(); g.moveTo(64 + dx * 26, 64 + dy * 26); g.lineTo(64 + dx * 56, 64 + dy * 56); g.stroke(); }
        g.beginPath(); g.arc(64, 64, 5, 0, TAU); g.fill();
      } else {
        g.beginPath(); g.arc(64, 64, 30, 0, TAU); g.stroke(); g.beginPath(); g.arc(64, 64, 52, 0, TAU); g.stroke();
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { g.beginPath(); g.moveTo(64 + dx * 8, 64 + dy * 8); g.lineTo(64 + dx * 52, 64 + dy * 52); g.stroke(); }
        g.beginPath(); g.arc(64, 64, 3, 0, TAU); g.fill();
      }
    };
    draw('rgba(0,0,0,.85)', zoom ? 10 : 14); draw(css, zoom ? 5 : 8); draw('rgba(255,255,255,.65)', zoom ? 1.6 : 2.4);
  });
}

export default {
  id: 'duckshoot',
  name: 'Schiettent',
  giver: 'Kermis-Koos',
  icon: '🦆',
  mode: 'pvp',
  time: TIME,
  pay: 1,
  music: 'game',
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'bodyswap', 'deurman'],
  blurb: 'Welkom in de <b>kermis-schiettent</b> van de Speelhal! Op lopende banden ploffen eenden, konijnen en draakjes voorbij. Wie het doelwit het eerst raakt, krijgt de punten! Pas op voor de <b>bommen</b> (-3) en de <b>kogel die terugkaatst</b> van de draaiende borden. Let op de <b>spook-eend</b> die maar even zichtbaar is, en in de laatste 10 seconden verschijnt de <b>Reuzeneend</b> van 10 punten!',
  controls: ['{move} vizier bewegen', '{a} schieten (6 kogels, vult langzaam bij)', '{b} ingedrukt = zoom: snel herladen & snel schieten, maar trager vizier'],
  tip: 'Gouden eend = 5 punten. Konijntjes rennen weg als je dichtbij mikt. Raak je de Reuzeneend allebei tegelijk, dan delen jullie de 10 punten!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pvp = ctx.pvp;
    const names = players.map((p) => p.name);
    const L = ctx.lights('indoor', { shadows: false, fogNear: 80, fogFar: 200 });
    L.hemi.intensity = 1.5; L.hemi.color.set(0xfff0e0); L.hemi.groundColor.set(0x9a7a5a);
    L.sun.intensity = 1.6; L.sun.color.set(0xfff0d0); L.sun.position.set(-6, 14, 26); L.sun.target.position.set(0, 5, 0);
    camera.fov = 40; camera.updateProjectionMatrix();
    const W = buildStall(ctx);
    const camBase = new THREE.Vector3(0, 7.0, 23.5), camLook = new THREE.Vector3(0, 4.7, 0);
    camera.position.copy(camBase); camera.lookAt(camLook);

    let T = 0, introT = 0, done = false, over = false, overT = 0, winnerIdx = -1, resultT = 0, finishAt = -1, finishing = false;
    const score = [0, 0];
    const stats = { hits: [0, 0], shots: [0, 0], bombs: [0, 0], gold: [0, 0], ricochet: [0, 0], giant: [0, 0], ghost: [0, 0], clown: [0, 0] };
    const targets = [];
    const rowState = ROWS.map((r) => ({ t: 0 }));
    const glow = glowTex();

    // ------------------------------------------------------------------ vizieren
    const chTex = PLAYER_CSS.map((c) => [crossTex(c, false), crossTex(c, true)]);
    const ch = players.map((pp, i) => {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: chTex[i][0], transparent: true, depthTest: false })); spr.renderOrder = 30; spr.position.z = 2; scene.add(spr);
      const ammoC = document.createElement('canvas'); ammoC.width = 256; ammoC.height = 64; const ammoT = new THREE.CanvasTexture(ammoC); ammoT.colorSpace = THREE.SRGBColorSpace;
      const ammoS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ammoT, transparent: true, depthTest: false })); ammoS.scale.set(2.6, 0.65, 1); ammoS.renderOrder = 31; scene.add(ammoS);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: PLAYER_COLORS[i], transparent: true, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })); flash.renderOrder = 29; flash.scale.set(3, 3, 1); scene.add(flash);
      return { i, css: PLAYER_CSS[i], spr, ammoC, ammoT, ammoS, flash, x: i ? 4 : -4, y: 5.2, vx: 0, vy: 0, ammo: AMMO_MAX, cd: 0, stun: 0, soot: 0, zoomK: 0, size: 1, regen: 0, clickT: 0, recoil: 0, ammoKey: '', frozenFx: 0 };
    });
    function drawAmmo(c) {
      const key = Math.floor(c.ammo) + '|' + c.stun.toFixed(0); if (key === c.ammoKey) return; c.ammoKey = key;
      const g = c.ammoC.getContext('2d'); g.clearRect(0, 0, 256, 64);
      g.fillStyle = 'rgba(15,10,30,.65)'; g.beginPath(); g.roundRect(2, 8, 252, 48, 22); g.fill();
      g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = c.css; g.textAlign = 'center'; g.fillText(names[c.i][0], 30, 33);
      for (let k = 0; k < AMMO_MAX; k++) { const x = 66 + k * 30; g.fillStyle = k < Math.floor(c.ammo) ? c.css : 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(x, 32, 10, 0, TAU); g.fill(); if (k < Math.floor(c.ammo)) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x - 3, 28, 3.5, 0, TAU); g.fill(); } }
      c.ammoT.needsUpdate = true;
    }

    // spelers (poppetjes aan de kraam)
    const chars = players.map((pp, i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const gun = new THREE.Group();
      gun.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.85, 6), mat(0x8a8a9a, { metalness: 0.6 }), { cast: false, pos: [0, -0.35, 0] }));
      gun.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6), mat(0xd9b27a), { cast: false, pos: [0, -0.82, 0] }));
      gun.add(mesh(new THREE.BoxGeometry(0.1, 0.4, 0.14), mat(0x9b6a2e), { cast: false, pos: [0, 0.1, -0.02] }));
      gun.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), mat(PLAYER_COLORS[i]), { cast: false, pos: [0, -0.18, 0.0] }));
      c.hold(gun, 'r'); c.pose = 'point';
      return { c, holder, x: i ? 4 : -4, gun };
    });

    // ------------------------------------------------------------------ doelwitten
    function removeTarget(t) { scene.remove(t.group); const k = targets.indexOf(t); if (k >= 0) targets.splice(k, 1); }
    function spawnBelt(kind, row, x, opts = {}) {
      const def = KINDS[kind]; const R = ROWS[row]; const mdl = buildModel(kind);
      const t = { kind, def, mdl, group: mdl.group, row, x, yOff: 0, vy: 0, baseY: R.y, y: R.y + def.cy, r: def.r, pts: def.pts, hp: def.hp || 1, dir: R.dir, vx: R.dir * R.speed * (def.speedMul || 1) * (opts.speedMul || 1), fleeV: 0, ph: Math.random() * 6.28, state: 'alive', dead: 0, face: R.dir, wob: 0, hitFlash: 0, fire: rand(1, 4) };
      t.group.position.set(x, R.y, 0.2); scene.add(t.group); targets.push(t);
      if (opts.hop) { t.vy = opts.hop; t.yOff = 0.01; }
      return t;
    }
    function populate() {
      ROWS.forEach((R, ri) => {
        let x = -X_MAX + 1 + Math.random() * 2;
        while (x < X_MAX - 1) { spawnBelt(weighted(ROW_MIX[ri]), ri, x); x += rand(2.9, 4.2); }
        rowState[ri].t = rand(0.3, 1.2);
      });
    }
    function spawnTraffic(dt) {
      ROWS.forEach((R, ri) => {
        const rs = rowState[ri]; rs.t -= dt;
        if (rs.t <= 0) {
          const kind = weighted(ROW_MIX[ri]); spawnBelt(kind, ri, R.dir > 0 ? -X_MAX : X_MAX);
          rs.t = rand(2.9, 4.2) / R.speed * (kind === 'fat' ? 1.3 : 1);
        }
      });
    }

    // speciale doelwitten
    // -- spook-eend
    const ghostM = buildModel('ghost'); ghostM.group.scale.setScalar(1.15); ghostM.group.visible = false; scene.add(ghostM.group);
    const ghost = { kind: 'ghost', mdl: ghostM, group: ghostM.group, x: 0, y: 5, r: 0.95, pts: 4, state: 'wait', t: 2.5, op: 0, alive: false, ph: 0, def: { name: 'spook-eend' } };
    // -- clown in het raam
    const WINDOWS = [{ x: -9.6, y: 8.7 }, { x: 9.6, y: 8.7 }];
    WINDOWS.forEach((w) => {
      const g = new THREE.Group(); g.position.set(w.x, w.y, -0.9);
      g.add(mesh(new THREE.BoxGeometry(2.6, 0.2, 0.3), mat(0x6b3a1e), { cast: false, pos: [0, 1.35, 0.1] }));
      g.add(mesh(new THREE.BoxGeometry(2.6, 0.25, 0.4), mat(0x6b3a1e), { cast: false, pos: [0, -1.0, 0.15] }));
      for (const s of [-1, 1]) { g.add(mesh(new THREE.BoxGeometry(0.2, 2.6, 0.3), mat(0x6b3a1e), { cast: false, pos: [s * 1.2, 0.15, 0.1] })); g.add(mesh(new THREE.BoxGeometry(0.7, 2.3, 0.08), mat(0x7a3ab8), { cast: false, pos: [s * 1.55, 0.15, 0.2], rot: [0, -s * 0.9, 0] })); }
      g.add(mesh(new THREE.PlaneGeometry(2.3, 2.4), new THREE.MeshBasicMaterial({ color: 0x1a0f2a }), { cast: false, pos: [0, 0.15, -0.1] }));
      scene.add(g);
    });
    const clown = { kind: 'clown', mdl: null, group: null, state: 'wait', t: 3.5, x: 0, y: 0, r: 0.8, pts: 3, alive: false, win: 0, ph: 0, rise: 0, def: { name: 'clown' } };
    clown.mdl = buildModel('clown'); clown.group = clown.mdl.group; clown.group.visible = false; scene.add(clown.group);
    // -- pinwheel
    const PIN_S = 0.9; const pin = buildPinwheel(); pin.group.position.set(0, 8.7, -1.0); pin.group.scale.setScalar(PIN_S); scene.add(pin.group);
    const discT = pin.discs.map((d, i) => ({ kind: 'disc', idx: i, d, x: 0, y: 0, r: 0.46, pts: 2, alive: true, back: 0, ph: 0, scale: 1, def: { name: 'schijf' } }));
    let pinSpin = 0, pinPh = rand(0, 6);
    // -- bordjes
    const plates = [-5.5, 5.5].map((x, i) => { const p = buildPlate(); p.group.position.set(x, 8.7, -0.7); scene.add(p.group); return { kind: 'plate', p, x, y: 8.7, r: 0.88, pts: 1, alive: true, ang: i * 1.6, w: 2.6 + i * 0.5, face: 1, wob: 0, def: { name: 'bord' } }; });
    // -- reuzeneend
    let giant = null, giantDone = false;

    // ------------------------------------------------------------------ punten & effecten
    function award(pi, pts, x, y, label, col) {
      const before = score[pi]; score[pi] = Math.max(0, score[pi] + pts);
      const txt = label || (pts > 0 ? `+${pts}` : String(pts));
      fx.texts.add(txt, x, y + 1.3, 3, col || (pts > 0 ? (pi ? '#8fb8ff' : '#7dffa8') : '#ff6a6a'), clamp(0.9 + Math.abs(pts) * 0.07, 0.9, 1.6));
      if (pts > 0) stats.hits[pi]++;
      sync();
      if (over) checkOvertimeEnd();
    }
    function feathers(x, y, cols, n = 14) { fx.particles.burst(x, y, 1, { count: n, speed: 5, up: 1.2, life: 1.1, size: 0.34, colors: cols, gravity: 9 }); }
    function puff(x, y, col = 0xffffff, n = 8) { fx.particles.burst(x, y, 1, { count: n, speed: 3, up: 0.8, life: 0.6, size: 0.4, color: col, gravity: 2 }); }
    function killTarget(t) { t.state = 'dying'; t.dead = 0; }
    function pings(f, vol = 0.18) { audio.tone(f, 0.18, { type: 'triangle', vol, slide: f * 0.6 }); }

    function explodeBomb(t, pi, chain = false) {
      const x = t.x, y = t.y;
      killTarget(t); t.exploded = true;
      fx.particles.burst(x, y, 1.5, { count: 60, speed: 9, up: 1, life: 0.9, size: 0.6, colors: [0xff7a1a, 0xffd24a, 0x333333, 0xff3a2a], gravity: 2 });
      fx.particles.ring(x, y, 1.5, { count: 30, speed: 8, color: 0xffb02a, size: 0.45, life: 0.5 });
      audio.sfx('explode', { vol: chain ? 0.5 : 0.8 }); ctx.shake(chain ? 0.35 : 0.75);
      for (const o of targets) {
        if (o === t || o.state !== 'alive') continue;
        if (Math.hypot(o.x - x, o.y - y) < 2.6) { if (o.kind === 'bomb') explodeBomb(o, pi, true); else { killTarget(o); o.blast = true; puff(o.x, o.y, 0xffa040, 8); } }
      }
      if (!chain) {
        stats.bombs[pi]++; award(pi, -3, x, y, '-3 BOEM!');
        const c = ch[pi]; c.stun = Math.max(c.stun, 0.7); c.soot = 1.6;
        chars[pi].c.pose = 'scared'; setTimeout(() => { if (!done) chars[pi].c.pose = 'point'; }, 700);
      }
    }
    function hitTarget(t, pi, hx, hy) {
      const col = pi ? 0x8fb8ff : 0x7dffa8;
      switch (t.kind) {
        case 'duck': case 'baby':
          award(pi, 1, t.x, t.y); feathers(t.x, t.y, [0xffd83a, 0xffffff, 0xfff07a]); audio.sfx('pop', { vol: 0.5, rate: t.kind === 'baby' ? 1.5 : 1 }); audio.tone(t.kind === 'baby' ? 900 : 620, 0.12, { type: 'square', vol: 0.12, slide: 300 }); killTarget(t); break;
        case 'bunny': award(pi, 2, t.x, t.y); puff(t.x, t.y, 0xffffff, 12); feathers(t.x, t.y, [0xffffff, 0xff9ab0, 0xf4f0ee], 8); audio.sfx('boing', { vol: 0.45, rate: 1.4 }); killTarget(t); break;
        case 'dragon': award(pi, 2, t.x, t.y); fx.particles.burst(t.x, t.y, 1, { count: 18, speed: 5, up: 1, life: 0.9, size: 0.4, colors: [0xc08cff, 0xff6fa5, 0xffd24a, 0xff8a3a], gravity: 6 }); audio.sfx('hit', { vol: 0.4 }); audio.sfx('pop', { vol: 0.4, rate: 0.8 }); killTarget(t); break;
        case 'gold': award(pi, 5, t.x, t.y, '+5 GOUD!', '#ffe14a'); stats.gold[pi]++; fx.particles.burst(t.x, t.y, 1, { count: 36, speed: 7, up: 1.3, life: 1.3, size: 0.45, colors: [0xffe14a, 0xffffff, 0xffb02a, col], gravity: 6 }); audio.sfx('coin', { vol: 0.8 }); audio.sfx('powerup', { vol: 0.5 }); ctx.shake(0.25); killTarget(t); break;
        case 'bomb': explodeBomb(t, pi); break;
        case 'fat':
          t.hp--; t.wob = 1; t.hitFlash = 0.25;
          if (t.hp > 0) { award(pi, 1, t.x, t.y, '+1  AU!'); audio.sfx('hit', { vol: 0.5 }); audio.tone(300, 0.2, { type: 'sawtooth', vol: 0.12, slide: 180 }); feathers(t.x, t.y + 0.4, [0xffd83a, 0xffffff], 8); }
          else {
            award(pi, 3, t.x, t.y, '+3 KWAK!'); audio.sfx('boing', { vol: 0.6 }); audio.sfx('pop', { vol: 0.6 }); feathers(t.x, t.y, [0xffd83a, 0xffffff, 0xff6fa5], 22);
            for (let k = 0; k < 3; k++) spawnBelt('baby', t.row, t.x + (k - 1) * 0.8, { hop: rand(6, 9) });
            fx.texts.add('3 kuikens!', t.x, t.y + 2.4, 3, '#fff07a', 0.9);
            killTarget(t);
          }
          break;
        case 'clown': award(pi, 3, clown.x, clown.y + 0.5, '+3 HONK!', '#ff9ad5'); stats.clown[pi]++; fx.particles.burst(clown.x, clown.y + 1, 1, { count: 40, speed: 7, up: 1.2, life: 1.4, size: 0.4, colors: [0xe8353c, 0xffe14a, 0x3d82ff, 0x35c46f, 0xff9ad5], gravity: 6 }); audio.sfx('boing', { vol: 0.7 }); audio.tone(520, 0.15, { type: 'square', vol: 0.15 }); clown.state = 'down'; clown.alive = false; break;
        case 'ghost': award(pi, 4, ghost.x, ghost.y, '+4 BOEH!', '#bfe0ff'); stats.ghost[pi]++; fx.particles.burst(ghost.x, ghost.y, 1, { count: 26, speed: 4, up: 0.8, life: 1.2, size: 0.5, colors: [0xcfe8ff, 0xffffff, 0x9ac8ff], gravity: -1 }); audio.sfx('sparkle', { vol: 0.7 }); audio.tone(700, 0.4, { type: 'sine', vol: 0.14, slide: 200 }); ghost.state = 'gone'; ghost.t = rand(2.2, 3.4); ghost.alive = false; break;
        case 'disc': award(pi, 2, t.x, t.y); t.alive = false; t.back = 4; fx.particles.burst(t.x, t.y, 1, { count: 14, speed: 4, up: 1, life: 0.7, size: 0.32, colors: [0xe8353c, 0xffffff, 0xffd24a], gravity: 8 }); audio.sfx('ding', { vol: 0.6 }); break;
        case 'plate': award(pi, 1, t.x, t.y); t.wob = 1; ricochet(t.x, t.y, pi); audio.sfx('hit', { vol: 0.3 }); break;
        case 'king': kingHit(t, pi); break;
        default: break;
      }
    }

    // ------------------------------------------------------------------ kogel die terugkaatst
    const bullets = [];
    function ricochet(x, y, pi) {
      const a = rand(0, TAU); const sp = 13;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: PLAYER_COLORS[pi], transparent: true, depthTest: false, blending: THREE.AdditiveBlending })); spr.scale.set(1.1, 1.1, 1); spr.renderOrder = 28; spr.position.set(x, y, 2); scene.add(spr);
      bullets.push({ spr, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pi, age: 0, bounces: 0 });
      stats.ricochet[pi]++; audio.sfx('whoosh', { vol: 0.3, rate: 2 }); pings(1900, 0.2);
      fx.texts.add('PING!', x, y + 1.0, 3, '#ffffff', 0.9);
    }
    function updateBullets(dt) {
      for (let k = bullets.length - 1; k >= 0; k--) {
        const b = bullets[k]; b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -BOUNDS.x) { b.x = -BOUNDS.x; b.vx = Math.abs(b.vx); b.bounces++; pings(1500 + b.bounces * 200, 0.1); }
        if (b.x > BOUNDS.x) { b.x = BOUNDS.x; b.vx = -Math.abs(b.vx); b.bounces++; pings(1500 + b.bounces * 200, 0.1); }
        if (b.y < BOUNDS.y0) { b.y = BOUNDS.y0; b.vy = Math.abs(b.vy); b.bounces++; pings(1500 + b.bounces * 200, 0.1); }
        if (b.y > BOUNDS.y1) { b.y = BOUNDS.y1; b.vy = -Math.abs(b.vy); b.bounces++; pings(1500 + b.bounces * 200, 0.1); }
        b.spr.position.set(b.x, b.y, 2);
        if (Math.random() < dt * 40) fx.particles.emit(b.x, b.y, 1.6, 0, 0, 0, { life: 0.35, size: 0.26, color: PLAYER_COLORS[b.pi], gravity: 0 });
        let dead = false;
        // vizieren raken
        for (const c of ch) {
          if (c.i === b.pi && b.age < 0.7) continue;
          if (Math.hypot(c.x - b.x, c.y - b.y) < 0.65 * c.size) {
            c.stun = Math.max(c.stun, 1.0); c.ammo = Math.max(0, c.ammo - 1); c.soot = 0.8;
            fx.texts.add(c.i === b.pi ? 'AUW! Eigen kogel!' : 'PING! Auw!', c.x, c.y + 1.2, 3, '#ffe14a', 1.0);
            fx.particles.burst(c.x, c.y, 2, { count: 16, speed: 4, up: 0.6, life: 0.6, size: 0.3, colors: [0xffffff, PLAYER_COLORS[b.pi]], gravity: 3 });
            audio.sfx('hurt', { vol: 0.5 }); ctx.shake(0.3); dead = true;
            if (c.i !== b.pi) { score[b.pi] += 0; }
            break;
          }
        }
        // doelwitten raken
        if (!dead) for (const t of targets) {
          if (t.state !== 'alive') continue;
          if (Math.hypot(t.x - b.x, t.y - b.y) < t.r + 0.2) { hitTarget(t, b.pi, b.x, b.y); dead = true; break; }
        }
        if (!dead && ghost.alive && Math.hypot(ghost.x - b.x, ghost.y - b.y) < ghost.r) { hitTarget(ghost, b.pi); dead = true; }
        if (dead || b.age > 3.2 || b.bounces > 5) { scene.remove(b.spr); b.spr.material.dispose(); bullets.splice(k, 1); if (!dead) puff(b.x, b.y, 0xffffff, 4); }
      }
    }

    // ------------------------------------------------------------------ reuzeneend
    function spawnGiant() {
      if (giant || giantDone) return;
      const mdl = buildModel('king'); mdl.group.position.set(-12.5, 5.2, 0.4); scene.add(mdl.group);
      giant = { kind: 'king', mdl, group: mdl.group, x: -12.5, y: 5.2, r: 1.95, pts: 10, state: 'alive', dir: 1, win: -1, by: [false, false], alive: true, t: 0, wob: 0, def: { name: 'reuzeneend' } };
      targets.push(giant);
      hud.showBig('REUZENEEND!', 900, '#ffe14a'); audio.sfx('powerup', { vol: 0.9 }); audio.sfx('bell', { vol: 0.6 }); ctx.shake(0.5);
      hud.setHint('Reuzeneend = 10 punten! Raken jullie hem tegelijk? Dan delen jullie!');
    }
    function kingHit(t, pi) {
      if (t.win < 0) { t.win = 0.45; t.by = [false, false]; t.first = pi; audio.sfx('hit', { vol: 0.8 }); audio.sfx('boing', { vol: 0.6, rate: 0.7 }); ctx.shake(0.4); }
      t.by[pi] = true; t.wob = 1;
      fx.particles.burst(t.x + rand(-1, 1), t.y + rand(-1, 1), 1.5, { count: 14, speed: 5, up: 1, life: 0.8, size: 0.45, colors: [0xffd83a, 0xffffff, pi ? 0x8fb8ff : 0x7dffa8], gravity: 5 });
    }
    function updateGiant(t, dt) {
      t.t += dt; t.wob = Math.max(0, t.wob - dt * 2.5);
      if (t.win >= 0) {
        t.win -= dt;
        if (t.win < 0 && t.state === 'alive') {
          t.state = 'dying'; t.dead = 0; t.alive = false; giantDone = true;
          const both = t.by[0] && t.by[1];
          if (both) { score[0] += 5; score[1] += 5; stats.giant[0]++; stats.giant[1]++; fx.texts.add('+5', t.x - 1, t.y + 2.5, 3, '#7dffa8', 1.6); fx.texts.add('+5', t.x + 1, t.y + 2.8, 3, '#8fb8ff', 1.6); fx.texts.add('DELEN!', t.x, t.y + 4.0, 3, '#ffe14a', 1.5); hud.showBig('SAMEN GERAAKT: 5 - 5!', 1200, '#ffe14a'); sync(); }
          else { const w = t.by[0] ? 0 : 1; stats.giant[w]++; award(w, 10, t.x, t.y + 1.5, '+10 REUZEN!', '#ffe14a'); hud.showBig(`${names[w]} +10!`, 1000, w ? '#8fb8ff' : '#7dffa8'); }
          fx.particles.burst(t.x, t.y, 1.5, { count: 120, speed: 11, up: 1.4, life: 1.6, size: 0.6, colors: [0xffd83a, 0xffffff, 0xff6fa5, 0x8fb8ff, 0x7dffa8, 0xffb02a], gravity: 8 });
          audio.sfx('explode', { vol: 0.6 }); audio.sfx('win', { vol: 0.7 }); ctx.shake(0.9);
          hud.setHint(null);
          if (over) checkOvertimeEnd();
        }
        return;
      }
      t.x += t.dir * 2.3 * dt; if (t.x > 10.5) t.dir = -1; if (t.x < -10.5 && t.t > 3) t.dir = 1;
      t.y = 5.0 + Math.sin(t.t * 1.2) * 1.3;
    }

    // ------------------------------------------------------------------ schieten
    function tryFire(i) {
      const c = ch[i];
      if (c.stun > 0 || c.cd > 0) return false;
      if (c.ammo < 1) { if (c.clickT <= 0) { audio.sfx('click', { vol: 0.4, rate: 0.6 }); fx.texts.add('LEEG!', c.x, c.y + 1.0, 3, '#ffcc66', 0.7); c.clickT = 0.5; } return false; }
      c.ammo -= 1; c.cd = c.zoomK > 0.5 ? 0.15 : 0.38; c.recoil = 1; stats.shots[i]++;
      chars[i].c.swing();
      audio.sfx('shoot', { vol: 0.5, rate: c.zoomK > 0.5 ? 1.3 : 1 });
      fx.particles.burst(c.x, c.y, 1.8, { count: 6, speed: 3, up: 0.3, life: 0.35, size: 0.3, color: PLAYER_COLORS[i], gravity: 0 });
      c.flash.material.opacity = 0.9; c.flash.position.set(c.x, c.y, 2.5);
      const hitR = (c.zoomK > 0.5 ? 0.3 : 0.55) * c.size;
      let best = null, bs = 1e9;
      const consider = (t, bias = 1) => { const d = Math.hypot(t.x - c.x, t.y - c.y); const lim = t.r + hitR; if (d > lim) return; const s = (d / lim) * bias; if (s < bs) { bs = s; best = t; } };
      for (const t of targets) { if (t.state !== 'alive' || t.kind === 'king' && t.win >= 0 && t.by[i]) continue; consider(t); }
      if (clown.alive) consider(clown, 0.95);
      if (ghost.alive && ghost.op > 0.3) consider(ghost, 0.8);
      for (const d of discT) if (d.alive) consider(d, 1.35);
      for (const p of plates) if (p.alive && p.face > 0.28) consider(p, 1.2);
      if (best) hitTarget(best, i, c.x, c.y);
      else {
        // miste: gaatje + stofwolkje
        puff(c.x, c.y, 0xd8c8a8, 3); audio.sfx('thud', { vol: 0.12, rate: 2 });
        if (Math.random() < 0.35) fx.texts.add('mis', c.x, c.y + 0.7, 3, '#d8d0c0', 0.55);
      }
      return true;
    }

    function updateCrosshair(c, dt) {
      const i = c.i; const inp = pvp.input(i);
      c.size = damp(c.size, pvp.size(i), 6, dt);
      c.stun = Math.max(0, c.stun - dt); c.cd = Math.max(0, c.cd - dt); c.clickT = Math.max(0, c.clickT - dt); c.soot = Math.max(0, c.soot - dt); c.recoil = Math.max(0, c.recoil - dt * 5);
      const wantZoom = inp.b && c.stun <= 0; c.zoomK = damp(c.zoomK, wantZoom ? 1 : 0, 14, dt);
      const spd = 9.5 * pvp.speed(i) * lerp(1, ZOOM_SPEED, c.zoomK);
      const lam = lerp(16, 2.4, pvp.slip);
      const can = c.stun <= 0 && !finishing;
      c.vx = damp(c.vx, can ? inp.x * spd : 0, can ? lam : 5, dt); c.vy = damp(c.vy, can ? -inp.y * spd : 0, can ? lam : 5, dt);
      c.x = clamp(c.x + c.vx * dt, -BOUNDS.x, BOUNDS.x); c.y = clamp(c.y + c.vy * dt, BOUNDS.y0, BOUNDS.y1);
      if (c.x <= -BOUNDS.x || c.x >= BOUNDS.x) c.vx *= 0.3; if (c.y <= BOUNDS.y0 || c.y >= BOUNDS.y1) c.vy *= 0.3;
      // herladen
      const behind = score[1 - i] - score[i] >= 6 ? 1.6 : 1;
      c.regen += dt * behind / lerp(1.5, 0.5, c.zoomK);
      if (c.regen >= 1) { c.regen = 0; if (c.ammo < AMMO_MAX) { c.ammo = Math.min(AMMO_MAX, Math.floor(c.ammo) + 1); audio.sfx('tick', { vol: 0.2, rate: 1.6 + c.ammo * 0.08 }); } }
      if (c.ammo >= AMMO_MAX) c.regen = 0;
      // schieten: A tikken (zoom: ingedrukt houden = snelvuur)
      if (can && (inp.aP || (c.zoomK > 0.5 && inp.a))) tryFire(i);
      // visueel
      const sc = 1.55 * c.size * lerp(1, 0.78, c.zoomK) * (1 + c.recoil * 0.25);
      c.spr.scale.set(sc, sc, 1); c.spr.position.set(c.x, c.y, 2);
      c.spr.material.map = chTex[i][c.zoomK > 0.5 ? 1 : 0];
      c.spr.material.opacity = c.cd > 0 ? 0.62 : 1;
      if (c.stun > 0) { c.spr.material.color.setRGB(0.5, 0.5, 0.5); c.spr.material.rotation += dt * 8; } else if (c.soot > 0) { c.spr.material.color.setRGB(0.45, 0.4, 0.4); c.spr.material.rotation = 0; } else { c.spr.material.color.setRGB(1, 1, 1); c.spr.material.rotation = 0; }
      c.flash.material.opacity = Math.max(0, c.flash.material.opacity - dt * 6);
      drawAmmo(c);
      c.ammoS.position.set(c.x, c.y - 1.05 * c.size, 2); c.ammoS.material.opacity = c.ammo < 1 ? 0.8 + Math.sin(T * 12) * 0.2 : 1;
      if (c.stun > 0 && Math.random() < dt * 14) fx.particles.emit(c.x + rand(-0.5, 0.5), c.y + rand(-0.3, 0.6), 2, 0, 1, 0, { life: 0.5, size: 0.28, color: 0xffe14a, gravity: -1 });
    }

    // ------------------------------------------------------------------ doelwit-animaties
    function updateTargets(dt, t) {
      for (let k = targets.length - 1; k >= 0; k--) {
        const tg = targets[k];
        if (tg.kind === 'king') {
          if (tg.state === 'dying') { tg.dead += dt; tg.group.scale.setScalar(Math.max(0.001, 1 - tg.dead * 1.4)); tg.group.rotation.z += dt * 8; if (tg.dead > 0.7) { removeTarget(tg); giant = null; } continue; }
          updateGiant(tg, dt);
          tg.group.position.set(tg.x, tg.y - 0.8, 0.5); tg.group.rotation.y = tg.dir * 0.35; tg.group.rotation.z = Math.sin(t * 5) * 0.08 + (tg.wob ? Math.sin(t * 40) * 0.12 * tg.wob : 0);
          tg.mdl.wings.forEach(([w, s]) => { w.rotation.z = s * (0.2 + Math.sin(t * 9) * 0.5); });
          tg.group.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = tg.win >= 0 ? 1.2 : 0.45; });
          continue;
        }
        if (tg.state === 'dying') {
          tg.dead += dt;
          if (tg.exploded) { tg.group.scale.setScalar(Math.max(0.001, 1 - tg.dead * 6)); if (tg.dead > 0.2) removeTarget(tg); continue; }
          tg.group.rotation.x = -tg.dead * 7; tg.group.position.y -= dt * (3 + tg.dead * 14); tg.group.position.z += dt * 2;
          const s = Math.max(0.001, 1 - Math.max(0, tg.dead - 0.12) * 4.5); tg.group.scale.setScalar(s);
          if (tg.dead > 0.34) removeTarget(tg);
          continue;
        }
        // --- vluchten voor een vizier
        const def = tg.def; const R = ROWS[tg.row];
        let desired = 0;
        if (def.shy) {
          let nd = 1e9, nc = null;
          for (const c of ch) { if (c.stun > 0) continue; const d = Math.hypot(c.x - tg.x, (c.y - tg.y) * 0.7); if (d < nd) { nd = d; nc = c; } }
          if (nc && nd < 3.6) { desired = Math.sign(tg.x - nc.x || 1) * 6.5 * def.shy * (1 - nd / 3.6); if (tg.yOff <= 0.001 && tg.kind === 'bunny' && Math.random() < dt * 5) tg.vy = 6; }
        }
        tg.fleeV = damp(tg.fleeV, desired, 7, dt);
        tg.x += (tg.vx + tg.fleeV) * dt;
        // hop / spring
        if (tg.yOff > 0 || tg.vy !== 0) { tg.vy -= 22 * dt; tg.yOff += tg.vy * dt; if (tg.yOff <= 0) { tg.yOff = 0; tg.vy = 0; } }
        else if (tg.kind === 'bunny' || tg.kind === 'baby') { if (Math.random() < dt * 0.7) tg.vy = 3.2; }
        let wy = 0;
        if (tg.kind === 'dragon') wy = 0.55 + Math.sin(t * 2.4 + tg.ph) * 0.55;
        if (tg.kind === 'gold') wy = Math.sin(t * 5 + tg.ph) * 0.35;
        tg.y = tg.baseY + tg.def.cy + tg.yOff + wy;
        const sgn = (tg.vx + tg.fleeV) >= 0 ? 1 : -1; tg.face = damp(tg.face, sgn, 8, dt);
        tg.wob = Math.max(0, tg.wob - dt * 2.5);
        const g = tg.group; g.position.set(tg.x, tg.baseY + tg.yOff + wy, 0.2); g.rotation.y = tg.face * 1.12;
        const wal = Math.sin(t * (tg.kind === 'baby' ? 14 : 7.5) + tg.ph);
        g.rotation.z = wal * (tg.kind === 'bunny' ? 0.04 : 0.1) + Math.sin(t * 38) * 0.14 * tg.wob;
        if (tg.kind === 'fat') g.scale.set(1 + tg.wob * 0.12, 1 - tg.wob * 0.1, 1 + tg.wob * 0.12);
        if (tg.mdl.wings.length) tg.mdl.wings.forEach(([w, s]) => { w.rotation.z = s * (0.12 + Math.sin(t * (tg.kind === 'dragon' ? 11 : 7) + tg.ph) * (tg.kind === 'dragon' ? 0.6 : 0.22)); });
        if (tg.mdl.ears) tg.mdl.ears.rotation.x = -0.1 + (tg.yOff > 0 ? -0.4 : 0) + Math.sin(t * 4 + tg.ph) * 0.06;
        if (tg.kind === 'bomb') {
          tg.mdl.spark.scale.setScalar(0.8 + Math.sin(t * 30 + tg.ph) * 0.35); tg.mdl.halo.material.opacity = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 6 + tg.ph));
          if (Math.random() < dt * 22) fx.particles.emit(tg.x + 0.17, tg.baseY + 1.85, 0.5, rand(-0.5, 0.5), rand(1, 2.2), 0, { life: 0.45, size: 0.2, color: Math.random() < 0.5 ? 0xffb02a : 0xffe880, gravity: 0 });
        }
        if (tg.kind === 'dragon') { tg.fire -= dt; if (tg.fire < 0) { tg.fire = rand(1.5, 3.5); for (let q = 0; q < 8; q++) fx.particles.emit(tg.x + sgn * 0.9, tg.baseY + wy + 1.2, 0.6, sgn * rand(2, 4.5), rand(-0.2, 0.6), 0, { life: 0.5, size: 0.36, color: pick([0xff8a1a, 0xffd24a, 0xff4a2a]), gravity: -0.5 }); } }
        if (tg.kind === 'gold' && Math.random() < dt * 30) fx.particles.emit(tg.x - sgn * 0.5 + rand(-0.3, 0.3), tg.baseY + wy + rand(0.4, 1.4), 0.6, 0, rand(0, 0.5), 0, { life: 0.6, size: 0.26, color: pick([0xffe14a, 0xffffff]), gravity: 1 });
        // van beeld
        if (Math.abs(tg.x) > X_MAX + 1.5) removeTarget(tg);
      }
    }

    // gouden eend regelmatig, clown, spook
    let goldT = 3.5, goldCount = 0;
    function specials(dt, t) {
      goldT -= dt;
      if (goldT <= 0) { goldT = over ? rand(2.6, 3.6) : rand(7.5, 10.5); const row = Math.floor(Math.random() * 3); const R = ROWS[row]; spawnBelt('gold', row, R.dir > 0 ? -X_MAX : X_MAX); goldCount++; audio.sfx('sparkle', { vol: 0.4 }); }
      // clown
      clown.t -= dt;
      if (clown.state === 'wait' && clown.t <= 0) {
        const wi = Math.floor(Math.random() * 2); const win = WINDOWS[wi];
        clown.state = 'up'; clown.win = wi; clown.rise = 0; clown.x = win.x; clown.group.visible = true; clown.alive = false; clown.life = 2.7; audio.sfx('door', { vol: 0.4 }); audio.tone(660, 0.18, { type: 'square', vol: 0.12, slide: 200 });
      }
      if (clown.state === 'up' || clown.state === 'stay' || clown.state === 'down') {
        const win = WINDOWS[clown.win];
        if (clown.state === 'up') { clown.rise = Math.min(1, clown.rise + dt * 3); if (clown.rise >= 1) clown.state = 'stay'; clown.alive = clown.rise > 0.6; }
        else if (clown.state === 'stay') { clown.life -= dt; clown.alive = true; if (clown.life <= 0) clown.state = 'down'; }
        else { clown.rise = Math.max(0, clown.rise - dt * 3.5); clown.alive = false; if (clown.rise <= 0) { clown.state = 'wait'; clown.t = rand(3.5, 5.5); clown.group.visible = false; } }
        const e = clown.rise * clown.rise * (3 - 2 * clown.rise);
        clown.mdl.body.position.y = -2.1 + e * 2.0; clown.mdl.spring.scale.y = 0.4 + e * 1.2; clown.mdl.spring.position.y = -2.2 + e * 0.1;
        clown.mdl.body.rotation.z = Math.sin(t * 6) * 0.15; clown.group.position.set(win.x, win.y - 0.1, -0.4); clown.group.rotation.y = 0;
        clown.x = win.x; clown.y = win.y + (-2.1 + e * 2.0) + 1.4;
      }
      // spook-eend
      ghost.t -= dt;
      if (ghost.state === 'wait' && ghost.t <= 0) {
        ghost.state = 'show'; ghost.t = 1.0; ghost.x = rand(-9.5, 9.5); ghost.y = rand(2.8, 8.2); ghost.ph = rand(0, 6); ghost.group.visible = true; ghost.alive = true;
        fx.particles.burst(ghost.x, ghost.y, 1, { count: 18, speed: 3, up: 0.8, life: 0.9, size: 0.4, colors: [0xcfe8ff, 0xffffff], gravity: -1 });
        audio.tone(280, 0.5, { type: 'sine', vol: 0.12, slide: 420 }); audio.tone(285, 0.5, { type: 'sine', vol: 0.1, slide: 430 });
        ghost.face = ghost.x > 0 ? -1 : 1;
      }
      if (ghost.state === 'show') {
        ghost.op = Math.min(1, ghost.op + dt * 6); if (ghost.t <= 0) { ghost.state = 'fade'; }
      } else if (ghost.state === 'fade') {
        ghost.op = Math.max(0, ghost.op - dt * 5); ghost.alive = ghost.op > 0.3; if (ghost.op <= 0) { ghost.state = 'wait'; ghost.t = rand(2.0, 3.0); ghost.group.visible = false; ghost.alive = false; }
      } else if (ghost.state === 'gone') {
        ghost.op = Math.max(0, ghost.op - dt * 14); if (ghost.op <= 0) { ghost.state = 'wait'; ghost.group.visible = false; }
      }
      if (ghost.group.visible) {
        ghost.mdl.mat.opacity = 0.7 * ghost.op; ghost.mdl.aura.material.opacity = 0.22 * ghost.op;
        ghost.group.position.set(ghost.x, ghost.y - 0.9 + Math.sin(t * 3 + ghost.ph) * 0.25, 0.4); ghost.group.rotation.y = (ghost.face || 1) * 0.5; ghost.group.rotation.z = Math.sin(t * 4) * 0.12;
        if (Math.random() < dt * 14) fx.particles.emit(ghost.x + rand(-0.4, 0.4), ghost.y - 0.6, 0.6, 0, -0.8, 0, { life: 0.8, size: 0.3, color: 0xbfd8ff, gravity: 0 });
      }
      // pinwheel
      pinSpin += (2.3 * Math.sin(t * 0.55 + pinPh) + 0.5 * Math.sin(t * 1.7)) * dt; pin.hub.rotation.z = pinSpin;
      discT.forEach((d, i) => {
        const a = pinSpin + i * Math.PI / 2; const R = 1.5;
        d.d.holder.position.set(-Math.sin(a) * R, Math.cos(a) * R, 0.15); d.d.holder.rotation.z = -pinSpin;
        d.x = pin.group.position.x + -Math.sin(a) * R * PIN_S; d.y = pin.group.position.y + Math.cos(a) * R * PIN_S;
        if (!d.alive) { d.back -= dt; d.scale = damp(d.scale, 0, 18, dt); if (d.back <= 0) { d.alive = true; d.scale = 0.01; puff(d.x, d.y, 0xffffff, 6); audio.sfx('pop', { vol: 0.2, rate: 1.8 }); } } else d.scale = damp(d.scale, 1, 12, dt);
        d.d.mesh.scale.setScalar(Math.max(0.001, d.scale));
      });
      // bordjes
      plates.forEach((p, i) => {
        p.ang += p.w * dt; p.p.spin.rotation.y = p.ang; p.face = Math.abs(Math.cos(p.ang)); p.wob = Math.max(0, p.wob - dt * 2);
        p.p.group.rotation.z = Math.sin(t * 2 + i) * 0.06 + Math.sin(t * 30) * 0.2 * p.wob;
      });
    }

    // ------------------------------------------------------------------ HUD en einde
    function sync() {
      hud.setScore(null);
      W.board.draw(names, score, PLAYER_CSS);
    }
    function checkOvertimeEnd() { if (over && score[0] !== score[1] && !finishing) { finishing = true; finishAt = T + 0.9; } }
    function finish() {
      if (done) return; done = true;
      const a = score[0], b = score[1]; winnerIdx = a > b ? 0 : b > a ? 1 : -1;
      const diff = Math.abs(a - b);
      let line;
      if (winnerIdx < 0) line = 'Gelijkspel! Allebei even scherp.';
      else {
        const win = names[winnerIdx], lose = names[1 - winnerIdx];
        if (over) line = `Sudden death! ${win} schiet het beslissende punt.`;
        else if (diff <= 2) line = pick([`Op het nippertje! ${win} wint met maar ${diff} punt${diff === 1 ? '' : 'en'}.`, `Wat een spanning, ${lose} miste het net.`]);
        else if (diff >= 15) line = pick([`${win} is de schietkoning van de kermis!`, `${lose} schoot vooral gaten in de lucht.`]);
        else line = pick([`${win} heeft de scherpste ogen van het kasteel!`, `Goed gericht, ${win}! ${lose} wil een herkansing.`, `${lose} schoot een paar eenden te kort.`]);
      }
      const bits = [];
      if (stats.bombs[0] + stats.bombs[1] > 0) bits.push(`Bommen: ${names[0]} ${stats.bombs[0]}, ${names[1]} ${stats.bombs[1]}.`);
      if (stats.gold[0] + stats.gold[1] > 0) bits.push(`Gouden eenden: ${stats.gold[0]} - ${stats.gold[1]}.`);
      const acc = (i) => (stats.shots[i] ? Math.round(stats.hits[i] / stats.shots[i] * 100) : 0);
      bits.push(`Trefzekerheid: ${names[0]} ${acc(0)}%, ${names[1]} ${acc(1)}%.`);
      pl2.forEach((c, i) => { c.c.pose = winnerIdx < 0 ? 'point' : winnerIdx === i ? 'cheer' : 'sad'; });
      hud.setTimer(0); hud.setHint(null);
      ctx.finishPvp({ winner: winnerIdx < 0 ? null : winnerIdx, score: [a, b], delay: 1200, summary: `<b>${a} – ${b}</b><br>${line}<br><small>${bits.join(' ')}</small>` });
    }
    const pl2 = chars;

    // ------------------------------------------------------------------ poppetjes aan de kraam
    function updateChars(dt) {
      chars.forEach((o, i) => {
        const c = ch[i]; const tx = clamp(c.x * 0.8, -9.5, 9.5);
        o.x = damp(o.x, tx, 6, dt);
        const other = chars[1 - i]; if (Math.abs(o.x - other.x) < 2.6) o.x += (i ? 1 : -1) * (2.6 - Math.abs(o.x - other.x)) * 0.5;
        const S = 1.6; o.holder.scale.setScalar(S); o.holder.position.set(o.x, 0.2, 5.2);
        const dx = c.x - o.x, dy = c.y - 2.4;
        o.c.faceDir(dx, -9); o.c.speed = 0;
        o.holder.rotation.x = clamp(dy * 0.035, -0.1, 0.45) + c.recoil * 0.1;
        if (!done) { o.c.pose = c.stun > 0 ? 'scared' : 'point'; }
        o.c.update(dt);
      });
    }

    // ------------------------------------------------------------------ hoofdlus
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt;
      const timeLeft = TIME - T;
      if (!over) {
        if (timeLeft <= FINAL && !giantDone && !giant) spawnGiant();
        if (timeLeft <= 0 && !finishing) {
          if (giant && giant.win >= 0 && giant.state === 'alive') { /* wacht tot de verdeling klaar is */ }
          else if (score[0] === score[1]) { over = true; overT = OVERTIME; hud.showBig('SUDDEN DEATH!', 1000, '#ff7a5a'); hud.setHint('Gelijk! De eerste die scoort wint!'); audio.sfx('bell', { vol: 0.7 }); goldT = 0.5; }
          else { finishing = true; finishAt = T + 0.6; }
        }
      }
      if (over) { overT -= dt; hud.setTimer(Math.max(0, overT), 99); if (overT <= 0 && !finishing) { finishing = true; finishAt = T + 0.3; } }
      else hud.setTimer(Math.max(0, timeLeft), 10);
      if (finishing && T >= finishAt) { finish(); return; }
      for (const c of ch) updateCrosshair(c, dt);
      spawnTraffic(dt);
      specials(dt, T + introT);
      updateTargets(dt, T + introT); updateBullets(dt);
      updateChars(dt);
      W.update(T + introT, dt);
      ch.forEach((c, i) => { const key = Math.floor(c.ammo) + '|' + score[i]; if (c.hudKey !== key) { c.hudKey = key; hud.setPlayerInfo(i, `🔫 ${Math.floor(c.ammo)}/${AMMO_MAX}  ·  ${score[i]} punten`); } });
      sway(T + introT);
    }
    function resultUpdate(dt) {
      resultT += dt; spawnTraffic(dt); updateTargets(dt, T + introT + resultT); updateBullets(dt); updateChars(dt); W.update(T + introT + resultT, dt);
      for (const c of ch) { c.stun = 0; c.vx = damp(c.vx, 0, 5, dt); c.vy = damp(c.vy, 0, 5, dt); c.x += c.vx * dt; c.y += c.vy * dt; c.spr.position.set(c.x, c.y, 2); c.flash.material.opacity = 0; }
      if (winnerIdx >= 0 && Math.random() < dt * 5) fx.particles.burst(chars[winnerIdx].x + rand(-2, 2), 3 + rand(0, 3), 4, { count: 16, speed: 5, up: 1, life: 1.2, size: 0.4, colors: [PLAYER_COLORS[winnerIdx], 0xffe14a, 0xffffff, 0xff6fa5], gravity: 4 });
      sway(T + introT + resultT);
    }
    function introUpdate(dt) {
      introT += dt; chars.forEach((o) => { o.c.pose = 'point'; });
      spawnTraffic(dt); updateTargets(dt, introT); updateChars(dt); W.update(introT, dt);
      ch.forEach((c, i) => { c.x = i ? 4 : -4; c.y = 5.2 + Math.sin(introT * 1.3 + i) * 1.2; c.spr.position.set(c.x, c.y, 2); c.ammoS.position.set(c.x, c.y - 1.05, 2); drawAmmo(c); const s = 1.55 * c.size; c.spr.scale.set(s, s, 1); });
      sway(introT);
    }
    function sway(t) { camera.position.set(camBase.x + Math.sin(t * 0.25) * 0.5, camBase.y + Math.sin(t * 0.33) * 0.12, camBase.z); camera.lookAt(camLook); }

    populate();
    chars.forEach((o) => o.c.update(0.016));
    sync(); ch.forEach((c) => { drawAmmo(c); c.spr.position.set(c.x, c.y, 2); c.spr.scale.set(1.55, 1.55, 1); c.ammoS.position.set(c.x, c.y - 1.05, 2); });
    updateChars(0.016); sway(0);
    hud.setTimer(TIME);

    return {
      update, resultUpdate, introUpdate,
      onCountdown() { hud.setTimer(TIME); sync(); hud.setHint('Bommen -3 · Gouden eend +5 · Borden kaatsen je kogel terug!'); },
      onStart() { hud.setHint('Bommen -3 · Gouden eend +5 · Borden kaatsen je kogel terug!'); setTimeout(() => { if (!giant && !done) hud.setHint(null); }, 6000); },
      celebrate(w) { winnerIdx = w; },
      onSwap() { ctx.shake(0.25); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m) { score[i] = Math.max(0, score[i] - 2); fx.texts.add('-2 bewogen!', ch[i].x, ch[i].y + 1.3, 3, '#ff7a7a', 1.1); } }); sync(); },
      dispose() { bullets.length = 0; },
      dbg: {
        state: () => ({ T, done, over, finishing, score: score.slice(), winnerIdx, giant: !!giant, giantDone, targets: targets.length, kinds: targets.reduce((a, t) => { a[t.kind] = (a[t.kind] || 0) + 1; return a; }, {}), stats, ch: ch.map((c) => ({ x: c.x, y: c.y, ammo: c.ammo, cd: c.cd, stun: c.stun, zoomK: c.zoomK, size: c.size })), ghost: { state: ghost.state, alive: ghost.alive }, clown: { state: clown.state, alive: clown.alive }, bullets: bullets.length }),
        ch, targets, ghost, clown, plates, discT, score, tryFire, spawnBelt, hitTarget, spawnGiant, kingHit, ricochet,
        aimAt: (i, x, y) => { ch[i].x = x; ch[i].y = y; ch[i].vx = ch[i].vy = 0; },
      },
    };
  },
};

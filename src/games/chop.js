import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, smoothstep, rand, pick, TAU } from '../engine/util.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { buildForest, makePieceMats, pieceGeo, hazardGeos, bombGeo, hazMat, PIECE_H, TRUNK_R } from './chop_world.js';
import { makeBars } from './screws_bars.js';

// Houthakkers-Duel (Timberman/Skyline-Hack-achtig): hak je totempaal om, ontwijk stekels, takken en bijennesten.
// A = hakken, links/rechts (of B) = van kant wisselen. Eerst 40 stammen gehakt wint.

const TOTAL = 40, MAXT = 90;
const TX = [-6.4, 6.4];
const BASE_Y = 0.5;
const WIN_H = 21;                // stukken met hun voet lager dan dit krijgen een mesh
const SIDE_X = 2.2;
const STUN = 1.75;
const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');
const HZ = ['spikes', 'branch', 'hive'];

export default {
  id: 'chop',
  name: 'Houthakkers-Duel',
  giver: 'Boswachter Berk',
  icon: '🪓',
  mode: 'pvp',
  time: 40,
  music: 'game_fast',
  twists: ['invert', 'swapab', 'drunk', 'bodyswap', 'turbo', 'slowmo', 'deurman'],
  blurb: 'Twee torenhoge <b>totempalen</b>, twee houthakkers! Hak je stammen weg: de <b>eerste met 40 stammen</b> wint. Maar pas op voor <b>stekels, takken en bijennesten</b>: sta je aan de verkeerde kant als zo\'n stuk naar beneden valt, dan ben je even uitgeschakeld. <b>Snel hakken</b> bouwt tempo op (jij wordt sneller!). Gouden stammen tellen 3, en bommen zorgen voor gekke dingen...',
  controls: ['{a} hakken', '{move} links/rechts: van kant wisselen', '{b} van kant wisselen'],
  tip: 'Kijk naar het stuk BOVEN je: dat valt zo naar beneden. Groene bom = schoonmaak, rode bom = stekels voor je broer!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name), css = players.map((p) => p.css);
    const rng = ctx.rng;
    const L = ctx.lights('day', { shadow: 20, center: [0, 6, 0], fogNear: 60, fogFar: 170 });
    L.hemi.intensity = 1.1; L.sun.intensity = 2.3; L.sun.position.set(-18, 40, 26);
    camera.fov = 50; camera.updateProjectionMatrix();
    scene.fog.color.set(0xcfe6ff);
    const forest = buildForest(ctx, { trunkX: TX, names, css });
    const HZG = hazardGeos();
    const bombG = { green: bombGeo('green'), red: bombGeo('red') };

    // ---------- stammen-reeks (voor allebei hetzelfde) ----------
    function genSequence() {
      const items = []; let units = 0; let lastSide = 0;
      const goldMarks = [7 + Math.floor(rng() * 3), 17 + Math.floor(rng() * 3), 28 + Math.floor(rng() * 3)];
      const bombMarks = [12 + Math.floor(rng() * 3), 23 + Math.floor(rng() * 3), 33 + Math.floor(rng() * 2)];
      let bombIdx = 0;
      while (units < TOTAL) {
        const k = items.length; let it;
        const prevSpecial = k > 0 && (items[k - 1].type === 'gold' || items[k - 1].type === 'bomb');
        if (k >= 3 && !prevSpecial && goldMarks.length && units >= goldMarks[0] && units + 3 <= TOTAL) { goldMarks.shift(); it = { type: 'gold', units: 3, hp: 1, side: 0 }; lastSide = 0; }
        else if (k >= 3 && !prevSpecial && bombMarks.length && units >= bombMarks[0]) { bombMarks.shift(); it = { type: 'bomb', units: 1, hp: 1, side: 0, bomb: bombIdx++ % 2 === 0 ? 'green' : 'red' }; lastSide = 0; }
        else {
          const knot = k >= 3 && rng() < 0.18;
          it = { type: knot ? 'knot' : 'n', units: 1, hp: knot ? 3 : 1, side: 0 };
          if (k >= 3 && rng() < 0.58) {
            const s = lastSide !== 0 ? lastSide : (rng() < 0.5 ? -1 : 1);
            it.side = s; it.hz = pick(HZ); lastSide = s;
          } else lastSide = 0;
        }
        it.face = it.type === 'n' ? (rng() < 0.55 ? Math.floor(rng() * 4) : 4) : 4;
        items.push(it); units += it.units;
      }
      return items;
    }
    const seq = genSequence();

    // ---------- spelers ----------
    const pl = [0, 1].map((i) => {
      const c = ctx.make.brother(i); const sz = ctx.pvp.size(i), base = 2.9 / c.height;
      c.group.scale.setScalar(base * sz); scene.add(c.group);
      // bijl
      const axe = new THREE.Group();
      axe.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 6), mat(0x8a5a2e), { cast: false, pos: [0, -0.42, 0] }));
      axe.add(mesh(new THREE.BoxGeometry(0.08, 0.3, 0.34), mat(0xaeb6c4, { metalness: 0.7, roughness: 0.3 }), { cast: false, pos: [0, -0.86, -0.05] }));
      axe.add(mesh(new THREE.BoxGeometry(0.03, 0.34, 0.07), mat(0xf2f6ff, { metalness: 0.8, roughness: 0.2 }), { cast: false, pos: [0, -0.86, -0.25] }));
      axe.add(mesh(new THREE.TorusGeometry(0.07, 0.025, 5, 8), mat(PLAYER_COLORS[i]), { cast: false, pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0] }));
      c.hold(axe, 'r'); axe.rotation.x = 0.0;
      const mats = makePieceMats(css[i], i);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(TRUNK_R, TRUNK_R * 1.03, 1, 18, 1, true), mats.tail); tail.castShadow = false; scene.add(tail);
      const tag = nameTag(names[i], css[i]); scene.add(tag);
      const p = {
        i, c, axe, mats, tail, tag, base, sz,
        list: seq.map((s) => ({ ...s })), chopped: 0, total: TOTAL,
        side: i === 0 ? -1 : 1, x: TX[i] + (i === 0 ? -1 : 1) * SIDE_X, hopT: -1, hopFrom: 0,
        lock: 0, bufT: 0, switchT: 0, stun: 0, tempo: 0, streak: 0, lastChop: -9, swingT: -1, hits: 0, prevX: 0, stag: 3 + rng() * 2, wob: 0,
        cbCd: 4, cbUses: 0, flash: 0, tailLen: 0, finishedAt: -1, bestStreak: 0, kick: 0,
      };
      return p;
    });
    function nameTag(name, cssCol) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
      g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(name, 128, 48); g.fillStyle = cssCol; g.fillText(name, 128, 48);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(2.4, 0.9, 1); s.renderOrder = 15; return s;
    }
    const bars = makeBars(ctx, { colors: PLAYER_COLORS, vertical: false, length: 0.4 });

    // ---------- toestand ----------
    let T = 0, done = false, phase = 'play', winner = null, winT = 0, introT = 0, cine = 1, counting = false, punch = 0, finishCalled = false;
    const debris = [];
    const E = { squirrelT: 7 + rng() * 3, sq: null, cbT: 0 };
    let hudT = 0;
    const gSpeed = (i) => ctx.pvp.speed(i);
    const vec = new THREE.Vector3();
    const remaining = (p) => p.list.reduce((a, it) => a + it.units, 0);
    const done_ = (p) => p.chopped;
    function note(i, text, color = '#ffe14a', s = 1, dy = 4.6, dx = 0) { fx.texts.add(text, TX[i] + dx, dy, 2.2, color, s); }

    // ---------- stukken bouwen en plaatsen ----------
    function setHazMesh(it) {
      if (it.hazMesh) { it.obj.remove(it.hazMesh); it.hazMesh = null; }
      if (it.side !== 0 && it.obj) {
        const m = new THREE.Mesh(HZG[it.hz], hazMat); m.castShadow = true; m.scale.x = it.side; it.hazMesh = m; it.obj.add(m);
        if (it.hz === 'hive') it.hive = true;
      }
    }
    function buildItem(p, it) {
      const g = new THREE.Group(); it.obj = g;
      let m;
      if (it.type === 'gold') m = p.mats.gold; else if (it.type === 'knot') m = p.mats.knot; else if (it.type === 'long') m = p.mats.long; else m = p.mats.bark[it.face];
      const body = new THREE.Mesh(pieceGeo(it.units), m); body.castShadow = true; body.receiveShadow = true; g.add(body); it.body = body;
      if (it.type === 'bomb') { const b = new THREE.Mesh(bombG[it.bomb], hazMat); g.add(b); it.bombMesh = b; }
      setHazMesh(it);
      scene.add(g); g.position.set(TX[p.i], it.ty, 0); it.y = it.ty;
      it.pop = 0;
      if (it.isLast) addFlag(p, it);
    }
    function addFlag(p, it) {
      const f = new THREE.Group();
      f.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.0, 5), mat(0x5b3d24), { cast: false, pos: [0, PIECE_H * it.units / 2 + 1.4, 0] }));
      const cl = mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[p.i], side: THREE.DoubleSide }), { cast: false, pos: [0.85, PIECE_H * it.units / 2 + 2.6, 0] }); f.add(cl);
      it.obj.add(f); it.flag = f;
    }
    function destroyObj(it) { if (it.obj) { scene.remove(it.obj); it.obj = null; it.hazMesh = null; it.flag = null; } }
    function layout(p, snap = false) {
      let cum = 0; const n = p.list.length;
      p.list.forEach((it, k) => {
        it.isLast = k === n - 1;
        it.ty = BASE_Y + cum + it.units * PIECE_H / 2;
        if (!it.obj && cum < WIN_H) buildItem(p, it);
        else if (it.obj && it.isLast && !it.flag) addFlag(p, it);
        else if (it.obj && !it.isLast && it.flag) { it.obj.remove(it.flag); it.flag = null; }
        if (it.obj && snap) { it.y = it.ty; it.obj.position.y = it.ty; }
        cum += it.units * PIECE_H;
      });
      p.topCum = cum;
    }
    for (const p of pl) layout(p, true);

    // ---------- bommen / sabotage ----------
    function canPlace(list, idx, side) {
      const it = list[idx]; if (!it || it.type === 'gold' || it.type === 'bomb' || it.type === 'long') return false;
      for (const j of [idx - 1, idx + 1]) { const q = list[j]; if (q && q.side !== 0 && q.side !== side) return false; }
      return true;
    }
    function boomAt(p, y, big = 1) {
      fx.particles.burst(TX[p.i], y, 1.2, { count: Math.round(50 * big), speed: 8, up: 1.1, life: 0.9, size: 0.55, colors: [0xffd23f, 0xff7a1a, 0xffffff, 0x555555], gravity: 6 });
      fx.particles.ring(TX[p.i], y, 1.2, { count: 24, speed: 9, color: 0xffcf6a, size: 0.4, life: 0.5 });
    }
    function bombEffect(p, it, y) {
      const o = pl[1 - p.i];
      audio.sfx('explode', { vol: 0.9 }); ctx.shake(0.7); punch = 1;
      boomAt(p, y, 1.2);
      if (it.bomb === 'green') {
        let cleared = 0;
        for (const q of pl) for (let k = 0; k < Math.min(7, q.list.length); k++) { const t = q.list[k]; if (t.side !== 0) { t.side = 0; t.hz = null; cleared++; if (t.obj) { setHazMesh(t); fx.particles.burst(TX[q.i] + 1.8, t.ty, 1, { count: 8, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0x9dff7a, 0xffffff], gravity: 5 }); } } }
        note(p.i, 'SCHOON! 💚', '#7dff6a', 1.3, 6.5); hud.toast(`Groene bom! De stekels van de volgende stukken zijn weggeblazen (voor allebei)`, 2200);
        for (const q of pl) q.flash = 1;
      } else {
        let added = 0;
        const tries = [3, 4, 5, 6, 7, 8, 9, 10].sort(() => rng() - 0.5);
        for (const idx of tries) {
          if (added >= 3) break; const t = o.list[idx]; if (!t) continue;
          if (t.side !== 0) continue;
          const side = rng() < 0.5 ? -1 : 1; const s2 = canPlace(o.list, idx, side) ? side : canPlace(o.list, idx, -side) ? -side : 0;
          if (!s2) continue;
          t.side = s2; t.hz = pick(HZ); added++; if (t.obj) { setHazMesh(t); t.pop = 1; fx.particles.burst(TX[o.i], t.ty, 1.4, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xff5a4a, 0xffd23f], gravity: 6 }); }
        }
        note(o.i, 'STEKELS! 💥', '#ff6a5a', 1.3, 6.5); hud.toast(`Rode bom! ${names[o.i]} krijgt extra stekels van ${names[p.i]}!`, 2200);
        o.flash = 1;
      }
    }

    // ---------- hakken ----------
    function launchDebris(p, it) {
      if (!it.obj) return;
      const o = it.obj; it.obj = null; it.hazMesh = null;
      const dir = -p.side;
      debris.push({ o, vx: dir * (7 + rand(0, 3)), vy: 6 + rand(0, 3), vz: 0.5 + rand(0, 1.5), rz: dir * -(7 + rand(0, 6)), rx: rand(-3, 3), t: 0, life: 1.25 });
    }
    function chipBurst(p, y, big = 1, color = null) {
      fx.particles.burst(TX[p.i] + p.side * 0.9, y, 1.1, { count: Math.round(12 * big), speed: 4.5, up: 1.1, life: 0.7, size: 0.28, colors: color || [0xe6c07a, 0xc89a5a, 0xffe6b0, 0x8a5a2e], gravity: 11 });
    }
    function tryChop(p) {
      if (p.stun > 0 || phase !== 'play') return;
      if (p.lock > 0 || p.switchT > 0) { p.bufT = 0.15; return; }
      doChop(p);
    }
    function doChop(p) {
      const it = p.list[0]; if (!it) return;
      const spd = gSpeed(p.i);
      if (T - p.lastChop < 0.6 / Math.min(1.3, spd)) p.tempo = Math.min(1, p.tempo + 0.1); else p.tempo = Math.max(0, p.tempo - 0.3);
      p.lastChop = T; p.lock = lerp(0.45, 0.29, p.tempo) / spd; p.swingT = 0; p.kick = 1;
      p.c.faceDir(-p.side, 0);
      const y0 = it.ty;
      if (p.tempo >= 0.9 && !p.fire) { p.fire = true; note(p.i, 'TEMPO!', '#ffb040', 1.1, 7.2, p.side * 0.5); audio.sfx('powerup', { vol: 0.4 }); }
      if (p.tempo < 0.6) p.fire = false;
      audio.sfx('chop', { vol: 0.7, rate: 0.85 + p.tempo * 0.35 });
      if (it.hp > 1) {
        it.hp--; it.shake = 0.25; chipBurst(p, y0, 0.8, [0xdfe6f2, 0xffe9a0, 0xffffff]); ctx.shake(0.12); audio.sfx('hit', { vol: 0.5, rate: 1.4 });
        fx.texts.add(it.hp === 2 ? 'knoest!' : 'bijna!', TX[p.i] + p.side * 0.2, y0 + 1.6, 1.8, '#dfe6f2', 0.7);
        return;
      }
      p.list.shift(); p.chopped += it.units; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak);
      launchDebris(p, it); chipBurst(p, y0, 1 + p.tempo * 0.8);
      ctx.shake(0.06 + p.tempo * 0.08);
      if (it.type === 'gold') {
        fx.particles.burst(TX[p.i], y0, 1.2, { count: 36, speed: 6, up: 1.3, life: 1, size: 0.4, colors: [0xffe14a, 0xffd23f, 0xffffff, 0xffb02a], gravity: 6 });
        note(p.i, '+3 GOUD!', '#ffe14a', 1.3, y0 + 2.2); audio.sfx('coin'); audio.sfx('powerup', { vol: 0.6 }); ctx.shake(0.2);
      } else if (it.type === 'long') {
        note(p.i, '+2 lang!', '#7dff9a', 1.1, y0 + 2); audio.sfx('good', { vol: 0.5 });
      }
      if (it.type === 'bomb') bombEffect(p, it, y0);
      layout(p);
      const nx = p.list[0];
      if (!nx) { finishChopper(p); return; }
      if (nx.side === p.side) hitBy(p, nx);
    }
    function hitBy(p, hz) {
      p.stun = STUN; p.tempo = 0; p.streak = 0; p.hits++; p.fire = false; p.bufT = 0; p.lock = 0; p.switchT = 0;
      const from = p.side; p.side = -p.side; p.kick = 0; p.fly = 0.45; p.flyFrom = p.x;
      const bee = hz.hz === 'hive';
      note(p.i, bee ? 'BZZZ! AU!' : hz.hz === 'branch' ? 'AU! TAK!' : 'AU! STEKELS!', '#ff6a5a', 1.2, 7.0, p.side * 0.5);
      audio.sfx('hurt', { vol: 0.8 }); if (bee) { audio.sfx('buzz', { vol: 0.5 }); } ctx.shake(0.45);
      fx.particles.burst(TX[p.i] + from * 1.5, hz.ty, 1.2, { count: bee ? 26 : 16, speed: 4, up: 1.2, life: 0.8, size: 0.3, colors: bee ? [0xffd23f, 0x2a2a2a, 0xffe680] : [0xff5a4a, 0xffffff, 0xffd23f], gravity: 6 });
    }
    function setSide(p, s, forced = false) {
      if (phase !== 'play' || p.stun > 0 || p.side === s) return;
      const old = p.side; p.side = s; p.switchT = 0.13 / gSpeed(p.i); p.hopT = 0; p.hopFrom = p.x;
      audio.sfx('whoosh', { vol: 0.3, rate: 1.3 });
      fx.particles.dust(TX[p.i] + old * SIDE_X, BASE_Y, 0.5, 3, 0xe0c898);
      const it = p.list[0]; if (it && it.side === s) hitBy(p, it);
    }
    function finishChopper(p) {
      if (p.finishedAt < 0) p.finishedAt = T;
    }

    // ---------- eekhoorn ----------
    const sqMesh = (() => {
      const g = new THREE.Group(); const fur = mat(0xc4682a, { flatShading: false }), cream = mat(0xf4e2c0, { flatShading: false });
      g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), fur, { cast: false, scale: [1.35, 0.95, 0.9] }));
      g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), cream, { cast: false, pos: [0.18, -0.12, 0.2], scale: [1.1, 0.9, 0.7] }));
      g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), fur, { cast: false, pos: [0.62, 0.3, 0] }));
      for (const sz2 of [-1, 1]) { g.add(mesh(new THREE.ConeGeometry(0.09, 0.26, 4), fur, { cast: false, pos: [0.58, 0.58, sz2 * 0.12] })); g.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [0.8, 0.36, sz2 * 0.13] })); }
      g.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0x2a1a0a), { cast: false, pos: [0.9, 0.3, 0] }));
      const tail = new THREE.Group(); tail.position.set(-0.55, 0.2, 0); g.add(tail);
      tail.add(mesh(new THREE.CapsuleGeometry(0.22, 0.85, 4, 8), fur, { cast: false, pos: [-0.1, 0.55, 0], rot: [0, 0, 0.35], scale: [1, 1, 0.8] }));
      tail.add(mesh(new THREE.SphereGeometry(0.26, 8, 6), cream, { cast: false, pos: [0.15, 1.1, 0], scale: [0.9, 1.1, 0.7] }));
      const legs = [-0.3, 0.3].map((x) => { const l = mesh(new THREE.CapsuleGeometry(0.08, 0.2, 3, 5), fur, { cast: false, pos: [x, -0.35, 0.2] }); g.add(l); return l; });
      const acorn = new THREE.Group(); acorn.position.set(0.95, 0.05, 0.1); acorn.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), mat(0x8a5a2a), { cast: false })); acorn.add(mesh(new THREE.SphereGeometry(0.15, 6, 5, 0, TAU, 0, 1.2), mat(0x5a3a1a), { cast: false, pos: [0, 0.05, 0] })); g.add(acorn);
      g.userData = { tail, legs, acorn }; g.visible = false; scene.add(g); return g;
    })();
    function spawnSquirrel() {
      const lead = pl[0].chopped - pl[1].chopped;
      const ti = Math.abs(lead) >= 3 && rng() < 0.65 ? (lead > 0 ? 0 : 1) : (rng() < 0.5 ? 0 : 1);
      const p = pl[ti];
      E.sq = { ti, state: 'run', t: 0, x: TX[ti] + (rng() < 0.5 ? -11 : 11), y: BASE_Y + 0.5, tgt: null, done: false, climbY: BASE_Y + 0.5 };
      E.sq.dir = Math.sign(TX[ti] - E.sq.x);
      sqMesh.visible = true; sqMesh.userData.acorn.visible = true;
      hud.toast(`Een eekhoorn rent naar de boom van ${names[ti]}!`, 1800); audio.tone(900, 0.1, { type: 'square', vol: 0.06, slide: 500 });
    }
    function pickSqTarget(p) {
      const cand = []; for (let k = 2; k <= 7 && k < p.list.length; k++) { const it = p.list[k]; if (it.type === 'n' || it.type === 'knot') cand.push(k); }
      if (!cand.length) return null;
      const withHz = cand.filter((k) => p.list[k].side !== 0);
      const k = (withHz.length && rng() < 0.75) ? pick(withHz) : pick(cand); return p.list[k];
    }
    function updateSquirrel(dt) {
      const s = E.sq; if (!s) return;
      const p = pl[s.ti], u = sqMesh.userData; s.t += dt;
      const pos = sqMesh.position;
      u.tail.rotation.z = Math.sin(T * 9) * 0.25;
      if (s.state === 'run') {
        s.x += s.dir * 9 * dt; pos.set(s.x, BASE_Y + 0.45 + Math.abs(Math.sin(T * 18)) * 0.25, 2.0); sqMesh.rotation.set(0, s.dir > 0 ? 0 : Math.PI, 0);
        if ((s.dir > 0 && s.x >= TX[s.ti] - 1.4) || (s.dir < 0 && s.x <= TX[s.ti] + 1.4)) { s.state = 'climb'; s.t = 0; s.tgt = pickSqTarget(p); if (!s.tgt) { s.state = 'leave'; s.dir = -s.dir; } }
        if (s.state === 'climb') { s.x = TX[s.ti]; }
      } else if (s.state === 'climb') {
        if (!s.tgt || !p.list.includes(s.tgt)) { s.tgt = pickSqTarget(p); if (!s.tgt) { s.state = 'leave'; s.t = 0; s.dir = Math.random() < 0.5 ? -1 : 1; return; } }
        const ty = s.tgt.ty; s.climbY += clamp(ty - s.climbY, -9 * dt, 9 * dt);
        pos.set(TX[s.ti] + Math.sin(T * 16) * 0.08, s.climbY, TRUNK_R + 0.35); sqMesh.rotation.set(0, 0, Math.PI / 2); u.legs.forEach((l, k) => { l.position.y = -0.35 + Math.sin(T * 25 + k * 3) * 0.1; });
        if (Math.abs(ty - s.climbY) < 0.12) { s.state = 'work'; s.t = 0; s.did = false; }
      } else if (s.state === 'work') {
        const it = s.tgt; const y = it && p.list.includes(it) ? it.ty : s.climbY; s.climbY = y; pos.set(TX[s.ti], y, TRUNK_R + 0.35); sqMesh.rotation.set(0, 0, Math.PI / 2 + Math.sin(T * 24) * 0.12);
        if (s.t > 0.6 && !s.did) {
          s.did = true;
          if (it && p.list.includes(it)) {
            const idx = p.list.indexOf(it);
            const old = it.side; let msg;
            if (old !== 0 && canPlace(p.list, idx, -old)) { it.side = -old; msg = 'verplaatst!'; }
            else if (old !== 0) { it.side = 0; it.hz = null; msg = 'weggehaald!'; }
            else { const sd = rng() < 0.5 ? -1 : 1; const s2 = canPlace(p.list, idx, sd) ? sd : canPlace(p.list, idx, -sd) ? -sd : 0; if (s2) { it.side = s2; it.hz = pick(HZ); msg = 'nieuw takje!'; } else msg = null; }
            if (it.obj) { setHazMesh(it); it.pop = 1; }
            fx.particles.burst(TX[s.ti], y, 1.8, { count: 14, speed: 3.5, up: 1, life: 0.6, size: 0.3, colors: [0xffffff, 0xd8a050, 0x7ccd55], gravity: 5 });
            audio.tone(1100, 0.08, { type: 'square', vol: 0.07, slide: -400 }); audio.sfx('pop', { vol: 0.6 });
            if (msg) note(s.ti, `Eekhoorn: ${msg}`, '#ffd9a0', 0.9, Math.min(y + 1.6, 11.5), 0);
          }
        }
        if (s.t > 1.1) { s.state = 'leave'; s.t = 0; s.dir = TX[s.ti] < 0 ? -1 : 1; s.vy = 6; s.x = TX[s.ti]; s.y = s.climbY; s.z = TRUNK_R + 0.35; u.acorn.visible = true; }
      } else if (s.state === 'leave') {
        if (s.vy !== undefined && s.y > BASE_Y + 0.5) { s.vy -= 20 * dt; s.y += s.vy * dt; s.x += s.dir * 5 * dt; s.z = lerp(s.z ?? 2, 2.0, 0.1); sqMesh.rotation.set(0, s.dir > 0 ? 0 : Math.PI, 0); pos.set(s.x, Math.max(BASE_Y + 0.45, s.y), s.z); }
        else { s.x += s.dir * 11 * dt; pos.set(s.x, BASE_Y + 0.45 + Math.abs(Math.sin(T * 18)) * 0.25, 2.0); sqMesh.rotation.set(0, s.dir > 0 ? 0 : Math.PI, 0); s.vy = undefined; s.y = BASE_Y; }
        if (Math.abs(s.x - TX[s.ti]) > 14) { E.sq = null; sqMesh.visible = false; }
      }
    }

    // ---------- comeback: Bosgeest geeft lange stammen ----------
    function comebackCheck(dt) {
      for (const p of pl) {
        p.cbCd -= dt;
        const o = pl[1 - p.i];
        if (p.cbCd > 0 || p.cbUses >= 2 || o.chopped - p.chopped < 6 || phase !== 'play') continue;
        let conv = 0, k = 7;
        while (k < p.list.length - 2 && conv < 4) {
          const a = p.list[k], b = p.list[k + 1];
          if (a.type === 'n' && b.type === 'n') {
            destroyObj(a); destroyObj(b);
            p.list.splice(k, 2, { type: 'long', units: 2, hp: 1, side: 0, face: 4 }); conv++; k += 1;
          } else k++;
        }
        if (!conv) continue;
        p.cbUses++; p.cbCd = 14; layout(p);
        note(p.i, 'Bosgeest helpt!', '#7dff9a', 1.2, 8.2); hud.toast(`De Bosgeest helpt ${names[p.i]}: lange stammen zonder stekels komen eraan!`, 2200); audio.sfx('sparkle', { vol: 0.7 }); audio.sfx('powerup', { vol: 0.5 });
        fx.particles.burst(TX[p.i], 9, 1, { count: 36, speed: 5, up: 1, life: 1.2, size: 0.4, colors: [0x7dff9a, 0xffffff, 0xd8ffb0], gravity: -0.5 });
        p.flash = 1;
      }
    }

    // ---------- deurman ----------
    function onDeurman(movers) {
      movers.forEach((m, i) => {
        if (!m) return; const p = pl[i];
        const add = 2; for (let k = 0; k < add; k++) p.list.push({ type: 'n', units: 1, hp: 1, side: 0, face: 4 });
        p.total += add; p.stun = Math.max(p.stun, 0.8); layout(p);
        note(i, 'De Deurman! +2 stammen', '#ff6a6a', 1.2, 7);
      });
    }

    // ---------- eind ----------
    function endGame(w) {
      if (finishCalled) return; finishCalled = true; phase = 'won'; winner = w; winT = 0;
      const sc = pl.map((p) => p.chopped);
      let summary;
      if (w == null) summary = 'Allebei evenveel stammen gehakt. Gelijkspel!';
      else if (pl[w].list.length > 0) summary = `Tijd om! ${names[w]} heeft de meeste stammen gehakt (${sc[w]} tegen ${sc[1 - w]}).`;
      else {
        const l = 1 - w; const jokes = [`TIMBER! ${names[w]} hakt als een echte bosreus.`, `${names[w]} is de snelste houthakker van het bos. ${names[l]} heeft nog ${remaining(pl[l])} stammen te gaan.`, `De eekhoorns joelen voor ${names[w]}!`];
        summary = pick(jokes) + `<br>${Math.round(T)} sec · ${pl[w].hits} keer geraakt tegen ${pl[l].hits}`;
      }
      ctx.finishPvp({ winner: w, score: sc, summary, delay: 2600 });
    }

    // ---------- spelers per frame ----------
    function playerStep(p, dt, active) {
      const i = p.i, inp = ctx.pvp.input(i);
      p.lock = Math.max(0, p.lock - dt); p.switchT = Math.max(0, p.switchT - dt); p.bufT = Math.max(0, p.bufT - dt);
      if (p.stun > 0) { p.stun = Math.max(0, p.stun - dt); if (p.stun === 0) { p.c.pose = 'idle'; } }
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2);
      if (active) {
        // links/rechts (op basis van x, zodat de twists werken)
        const lx = inp.x < -0.35, rx = inp.x > 0.35, pl_ = p.prevX < -0.35, pr_ = p.prevX > 0.35;
        p.prevX = inp.x;
        if (lx && !pl_) setSide(p, -1);
        if (rx && !pr_) setSide(p, 1);
        if (inp.bP) setSide(p, -p.side);
        if (inp.aP) tryChop(p);
        if (p.bufT > 0 && p.lock <= 0 && p.switchT <= 0 && p.stun <= 0) { p.bufT = 0; doChop(p); }
        if (p.tempo > 0 && T - p.lastChop > 0.55) p.tempo = Math.max(0, p.tempo - dt * 0.9);
        // dronken: wankelt soms naar de andere kant
        if (ctx.twist.id === 'drunk' && p.stun <= 0) {
          p.stag -= dt;
          if (p.stag < 0.6 && p.stag > 0) p.wob = 1;
          if (p.stag <= 0) { p.wob = 0; p.stag = 3 + rng() * 2.5; note(i, 'hik!', '#d8ffa0', 0.9, 6.5); audio.sfx('boing', { vol: 0.5 }); setSide(p, -p.side, true); }
        }
      }
    }

    // ---------- visuals ----------
    const WIN_FLASH = new THREE.Color();
    function visuals(dt) {
      for (const p of pl) {
        const i = p.i, c = p.c;
        // stam-stukken
        for (const it of p.list) {
          if (!it.obj) continue;
          it.y = damp(it.y, it.ty, 34, dt); const g = it.obj;
          let sx = 1, sy = 1;
          if (it.shake > 0) { it.shake = Math.max(0, it.shake - dt); g.rotation.z = Math.sin(T * 60) * it.shake * 0.35; } else g.rotation.z = 0;
          if (it.pop > 0) { it.pop = Math.max(0, it.pop - dt * 3); if (it.hazMesh) { const k = 1 + Math.sin(it.pop * Math.PI) * 0.5; it.hazMesh.scale.set(it.side * k, k, k); } }
          g.position.set(TX[i], it.y, 0);
          if (it.type === 'gold' && Math.random() < dt * 6 && it.y < 14) fx.particles.emit(TX[i] + (Math.random() - 0.5) * 2, it.y + (Math.random() - 0.5) * 3, 1.2, 0, 0.6, 0, { life: 0.7, size: 0.28, color: 0xfff2a0, gravity: -0.3 });
          if (it.type === 'bomb' && it.bombMesh) { it.bombMesh.scale.setScalar(1 + Math.sin(T * 8 + i) * 0.04); if (Math.random() < dt * 14) fx.particles.emit(TX[i] + 0.05, it.y + 0.9, TRUNK_R + 0.35, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), 0.5, { life: 0.35, size: 0.2, color: Math.random() < 0.5 ? 0xffd23f : 0xff7a1a, gravity: 2 }); }
          if (it.hz === 'hive' && it.side !== 0 && it.y < 14 && Math.random() < dt * 8) { const a = Math.random() * TAU; fx.particles.emit(TX[i] + it.side * (TRUNK_R + 1.05) + Math.cos(a) * 0.7, it.y + 0.2 + Math.sin(a) * 0.7, 0.3, Math.cos(a + 1.6) * 2, Math.sin(a + 1.6) * 2, 0, { life: 0.5, size: 0.17, color: 0xffd23f, gravity: 0 }); }
          if (it.flag) it.flag.children[1].rotation.y = Math.sin(T * 5) * 0.3;
        }
        // tail (de rest van de toren)
        let beyond = 0; for (const it of p.list) if (!it.obj) beyond += it.units;
        const len = beyond * PIECE_H;
        p.tail.visible = len > 0.01;
        if (p.tail.visible) { const topY = BASE_Y + p.topCum - len; p.tail.scale.set(1, len, 1); p.tail.position.set(TX[i], topY + len / 2, 0); p.mats.tail.map.repeat.set(1, len / PIECE_H); }
        // hakker
        const targetX = TX[i] + p.side * SIDE_X;
        let yy = BASE_Y, zz = 0.3;
        if (p.fly > 0) { p.fly = Math.max(0, p.fly - dt); const k = 1 - p.fly / 0.45; p.x = lerp(p.flyFrom, targetX, k); yy += Math.sin(k * Math.PI) * 2.0; zz += Math.sin(k * Math.PI) * 1.2; }
        else if (p.hopT >= 0) { p.hopT += dt; const dur = 0.13 / gSpeed(i); const k = clamp(p.hopT / dur, 0, 1); p.x = lerp(p.hopFrom, targetX, smoothstep(0, 1, k)); yy += Math.sin(k * Math.PI) * 1.1; zz += Math.sin(k * Math.PI) * 1.8; if (k >= 1) p.hopT = -1; }
        else p.x = damp(p.x, targetX, 30, dt);
        if (p.wob > 0) { yy += Math.abs(Math.sin(T * 25)) * 0.12; }
        const won = phase === 'won';
        const mood = won ? (winner === i ? 'cheer' : winner == null ? 'idle' : 'sad') : p.stun > 0 ? 'scared' : 'idle';
        c.pose = mood;
        if (won && winner === i) yy += Math.abs(Math.sin(winT * 7)) * 0.5;
        c.group.position.set(p.x, yy, zz);
        c.faceDir(won ? 0 : -p.side, won ? 1 : 0);
        c.speed = 0; c.air = (p.fly > 0 || p.hopT >= 0);
        c.update(dt);
        // armen overschrijven: bijl omhoog klaar / slag
        if (!won && p.stun <= 0) {
          let ar = -2.35 + Math.sin(T * 3 + i) * 0.04;
          if (p.swingT >= 0) { p.swingT += dt; const t = p.swingT; ar = t < 0.05 ? lerp(-2.45, -1.05, t / 0.05) : lerp(-1.05, -2.35, clamp((t - 0.05) / 0.17, 0, 1)); if (t > 0.22) p.swingT = -1; }
          c.armR.rotation.x = ar; c.armR.rotation.z = -0.1; c.armL.rotation.x = ar * 0.55 - 0.4; c.armL.rotation.z = 0.15;
          c.torso.rotation.x = p.swingT >= 0 && p.swingT < 0.09 ? 0.4 : 0.08;
        } else if (p.stun > 0) { c.armR.rotation.x = -0.5; c.armL.rotation.x = -0.5; c.torso.rotation.x = 0.35; }
        p.kick = Math.max(0, p.kick - dt * 8);
        c.body.rotation.z = p.stun > 0 ? Math.sin(T * 14) * 0.18 : p.wob > 0 ? Math.sin(T * 30) * 0.12 : 0;
        // tempovlammen aan de bijl
        if (p.tempo > 0.75 && !won) { c.handR.getWorldPosition(vec); if (Math.random() < dt * 40) fx.particles.emit(vec.x + p.side * (-0.4), vec.y - 0.4, vec.z, 0, 1.5, 0, { life: 0.35, size: 0.3, color: Math.random() < 0.5 ? 0xff9a2a : 0xffe14a, gravity: -2 }); }
        // dizzy-sterretjes bij stun
        if (p.stun > 0 && Math.random() < dt * 22) { const a = T * 9; fx.particles.emit(p.x + Math.cos(a) * 0.9, yy + 3.5, zz + Math.sin(a) * 0.9, 0, 0.3, 0, { life: 0.4, size: 0.3, color: 0xffe14a, gravity: 0 }); }
        // naamkaartje
        p.tag.position.set(p.x, yy + 3.9, zz); p.tag.visible = !won;
        // gekleurde flits (bom)
        if (p.flash > 0) { L.hemi.intensity = 1.1 + (p.flash > 0 ? 0.4 * p.flash : 0); }
      }
      L.hemi.intensity = lerp(L.hemi.intensity, 1.1, Math.min(1, dt * 6));
      // rondvliegende stukken
      for (let k = debris.length - 1; k >= 0; k--) {
        const d = debris[k]; d.t += dt; d.vy -= 24 * dt; const o = d.o;
        o.position.x += d.vx * dt; o.position.y += d.vy * dt; o.position.z += d.vz * dt; o.rotation.z += d.rz * dt; o.rotation.x += d.rx * dt;
        const s = d.t > d.life - 0.3 ? Math.max(0.01, (d.life - d.t) / 0.3) : 1; o.scale.setScalar(s);
        if (d.t >= d.life || o.position.y < -3) { scene.remove(o); debris.splice(k, 1); }
      }
      // HUD
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.12;
        for (const p of pl) { const tm = p.tempo > 0.75 ? ' TEMPO!' : p.tempo > 0.3 ? ' tempo+' : ''; hud.setPlayerInfo(p.i, `${p.chopped}/${p.total} stammen${p.stun > 0 ? '  AU!' : tm}`); }
      }
      bars.update([pl[0].chopped / pl[0].total, pl[1].chopped / pl[1].total]);
      if (phase === 'play') hud.setTimer(Math.max(0, MAXT - T), 12);
    }

    // ---------- camera ----------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), gp = new THREE.Vector3(), gl = new THREE.Vector3(), ip = new THREE.Vector3(), il = new THREE.Vector3();
    let camInit = false;
    function cam(dt) {
      punch = Math.max(0, punch - dt * 3);
      let px = 0, py = 6.2, pz = 19.6 - punch * 1.2, lx = 0, ly = 5.8;
      if (phase === 'won' && winner != null) { const k = smoothstep(0.2, 2.0, winT); px = lerp(0, TX[winner] * 0.6, k); pz = lerp(pz, 13, k); py = lerp(py, 4.2, k); lx = lerp(0, TX[winner] * 0.8, k); ly = lerp(5.8, 4.0, k); }
      gp.set(px + Math.sin(T * 0.4) * 0.25, py, pz); gl.set(lx, ly, 0);
      ip.set(-12 + Math.sin(introT * 0.3) * 6, 24 - Math.min(introT, 6) * 0.9, 40); il.set(0, 11, 0);
      gp.lerp(ip, cine); gl.lerp(il, cine);
      if (!camInit) { camP.copy(gp); camL.copy(gl); camInit = true; }
      const f = 1 - Math.exp(-6 * dt); camP.lerp(gp, f); camL.lerp(gl, f);
      camera.position.copy(camP); camera.lookAt(camL);
    }

    // ---------- hoofdlus ----------
    function tick(dt, active) {
      T += dt;
      if (cine > 0) cine = counting || active ? damp(cine, 0, active ? 3 : 1.3, dt) : 1;
      if (active && phase === 'play') {
        for (const p of pl) playerStep(p, dt, true);
        E.squirrelT -= dt; if (!E.sq && E.squirrelT <= 0) { spawnSquirrel(); E.squirrelT = 9 + rng() * 6; }
        updateSquirrel(dt); comebackCheck(dt);
        const f = pl.filter((p) => p.list.length === 0);
        if (f.length) endGame(f.length === 1 ? f[0].i : (pl[0].finishedAt <= pl[1].finishedAt ? 0 : 1));
        else if (T >= MAXT) { const d = pl[0].chopped - pl[1].chopped; endGame(d === 0 ? null : d > 0 ? 0 : 1); }
      } else {
        for (const p of pl) playerStep(p, dt, false);
        if (E.sq) updateSquirrel(dt);
      }
      if (phase === 'won') { winT += dt; if (!pl.wonFx) { pl.wonFx = true; wonFx(); } }
      forest.update(T + introT, dt);
      visuals(dt); cam(dt);
    }
    function wonFx() {
      audio.sfx('win'); ctx.shake(0.5);
      if (winner != null) hud.showBig('TIMBER!', 1300, winner ? '#4a8cff' : '#35c46f');
      for (let q = 0; q < 7; q++) setTimeout(() => { try { fx.particles.burst(TX[winner == null ? q % 2 : winner] + (Math.random() - 0.5) * 8, 7 + Math.random() * 5, 3, { count: 44, speed: 8, up: 1.1, life: 1.8, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff, 0xff9a3a], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, q * 260);
    }
    function update(dt) { tick(dt, true); }
    function resultUpdate(dt) { tick(dt, false); }
    function introUpdate(dt) {
      introT += dt; cine = counting ? damp(cine, 0, 1.3, dt) : 1;
      forest.update(introT, dt); visuals(dt); cam(dt);
    }
    visuals(0.016); cam(0.016);
    return {
      update, resultUpdate, introUpdate,
      onCountdown() { counting = true; hud.setTimer(MAXT, 12); hud.setScore('🪓 Hak je totempaal om!'); },
      onStart() { hud.setTimer(MAXT, 12); hud.setScore('🪓 Hak je totempaal om!'); },
      onDeurman,
      celebrate(w) { pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; },
      onSwap() { for (const p of pl) fx.particles.ring(p.x, 3, 0.3, { count: 18, speed: 3, color: 0xffe14a, size: 0.3, life: 0.5 }); },
      dispose() { },
      dbg: {
        state: () => ({ T, phase, winner, chopped: pl.map((p) => p.chopped), left: pl.map(remaining), side: pl.map((p) => p.side), stun: pl.map((p) => p.stun), tempo: pl.map((p) => p.tempo), hits: pl.map((p) => p.hits), lock: pl.map((p) => p.lock), sw: pl.map((p) => p.switchT), uses: pl.map((p) => p.cbUses), sq: !!E.sq, fin: finishCalled, nxt: pl.map((p) => p.list.slice(0, 5).map((it) => [it.type, it.side, it.hp])), len: pl.map((p) => p.list.length) }),
        force: { squirrel() { E.squirrelT = 0; }, setChopped(i, n) { /* testhulp: hak n units snel weg */ const p = pl[i]; let g = 0; while (p.chopped < n && p.list.length > 3 && g++ < 100) { const it = p.list.shift(); p.chopped += it.units; destroyObj(it); } layout(p, true); }, hit(i) { hitBy(pl[i], pl[i].list[0]); } },
        pl, E, seq,
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_CSS } from '../engine/chars.js';
import { FL, POW, makeCourse, buildLane } from './flappy_world.js';
import { makeDragon, animateDragon } from './flappy_dragon.js';

// Wolkenrace — duel: flappy-bird-race met twee draken, boven elkaar, twee banen met hetzelfde parcours (sidescroller met parallax).
//  * A = klapwiek (omhoog), zwaartekracht trekt omlaag; links/rechts = iets sneller/trager vliegen
//  * B = vuurspuw (sloopt roze breekwolken, braadt vogels, jaagt stormwolken weg); met een BLIKSEM-power-up schiet B een bliksem naar je broer
//  * power-ups: schild, magneet, reus (sloopt alles), bliksem. Munten = punten. Botsen = duizelig + teruggeslingerd (geen game over)
//  * comeback: de achterligger vliegt in de zuiging (slipstream) van de leider
const { L, H, X0 } = FL;
const G = 30, FLAP = 9.7, VFALL = -14.5, BASE_V = 11, RAD = 0.62;
const FLOOR_Y = 1.75, CEIL_Y = H - 0.85;
const FIRE_CD = 2.4, FIRE_T = 0.6, FIRE_LEN = 8.5;
const MATCH_TIME = 85, FINISH_BONUS = 60;
const PNAME = ['Wes', 'Jor'];

export default {
  id: 'flappy', name: 'Wolkenrace', giver: 'Wolkenwachter Wim', icon: '🐉', mode: 'pvp', time: 85, music: 'game_fast',
  blurb: 'Draken-race door de wolken! Jullie vliegen <b>boven elkaar</b> door hetzelfde parcours. <b>Klapwiek</b> om te stijgen, <b>vang munten</b> en vlieg door de gaten tussen de wolken-pilaren. Met <b>vuur</b> sloop je roze breekwolken en braad je vogels. Eerste over de finish krijgt een bonus; de meeste <b>punten</b> winnen!',
  controls: ['{a} KLAPWIEK (tikken = omhoog)', '{move} links/rechts = trager/sneller vliegen', '{b} VUURSPUW (of BLIKSEM als je die hebt)'],
  tip: 'Botsen kost tijd maar je gaat niet af. Wie achterligt vliegt in de zuiging van de leider en gaat sneller. Een bliksem-power-up laat je broer duizelen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const rng = ctx.rng;

    ctx.lights('day', { shadows: false, fogNear: 400, fogFar: 900 });
    scene.fog = null; scene.background = new THREE.Color(0xffd9b0);
    camera.fov = 50; camera.updateProjectionMatrix(); camera.position.set(0, 0, FL.DZ); camera.lookAt(0, 0, 0); scene.add(camera);
    const course = makeCourse(rng);
    const lanes = [0, 1].map((i) => buildLane(ctx, i, course, rng));

    // ---------------- draken ----------------
    const D = [0, 1].map((i) => {
      const m = makeDragon(i); scene.add(m.root); const size = pv.size(i);
      const tag = canvasTex(256, 96, () => {}); const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag, transparent: true, depthTest: false })); spr.scale.set(3.4, 1.275, 1); spr.renderOrder = 15; scene.add(spr);
      const fire = new THREE.Group(); const fo = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); const fi = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      fo.rotation.z = fi.rotation.z = Math.PI / 2; fire.add(fo, fi); fire.visible = false; scene.add(fire);
      // stormwolkje boven de draak (bliksem-effect)
      const sc = new THREE.Group(); for (const [x, y, r] of [[0, 0, 0.9], [0.9, -0.1, 0.7], [-0.9, -0.15, 0.7], [0.3, 0.45, 0.65]]) sc.add(mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x4a4868), { cast: false, receive: false, pos: [x, y, 0] })); sc.visible = false; scene.add(sc);
      return { i, m, size, y: H / 2, vy: 0, progress: 0, ctl: 0, lean: 0, flapT: -1, dizzy: 0, inv: 0, heavy: 0, slow: 0, shield: 0, magnet: 0, giant: 0, zap: false, fireT: 0, fireCd: 0, knock: 0, coins: 0, roasts: 0, smashes: 0, bonus: 0, hits: 0, slipB: 0, slipMsg: 0, combo: 0, comboT: 0, cheer: 0,
        tag, spr, tagKey: '', fire, fo, fi, storm: sc, stormT: 0, inStorm: false, t: rand(0, 6), done: false, scoreShown: -1, hudTxt: '', trail: 0, bounceCd: 0, sz: 1, szT: size };
    });

    // ---------------- toestand ----------------
    let T = 0, introT = 0, started = false, finished = false, ended = false, endT = 0, winner = -1, timeLeft = MATCH_TIME, why = '', shakeCd = 0;
    const stats = { hits: 0, roasts: 0, zaps: 0, smashes: 0, pows: 0 };
    const cxOf = (d) => d.progress + X0 + d.lean;                 // cursus-x van de draak
    const wy = (d) => lanes[d.i].y0 + d.y;                         // wereld-y
    const pts = (d) => Math.floor(clamp(d.progress, 0, L) / 10) + d.coins * 5 + d.roasts * 15 + d.smashes * 5 + d.bonus;
    const text = (t, x, y, col, sc = 1) => fx.texts.add(t, x, y, 1.5, col, sc);

    // ---------------- bliksem-pool ----------------
    const boltSeg = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xfff6a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); m.visible = false; m.renderOrder = 20; scene.add(m); return m; });
    let boltT = 0;
    function showBolt(ax, ay, bx, by) {
      const n = boltSeg.length; let px = ax, py = ay; boltT = 0.45;
      for (let k = 0; k < n; k++) { const u = (k + 1) / n; const nx = lerp(ax, bx, u) + (k < n - 1 ? rand(-1.0, 1.0) : 0), ny = lerp(ay, by, u) + (k < n - 1 ? rand(-1.0, 1.0) : 0); const m = boltSeg[k]; const dx = nx - px, dy = ny - py; const len = Math.hypot(dx, dy); m.position.set((px + nx) / 2, (py + ny) / 2, 1.2); m.rotation.z = Math.atan2(dy, dx); m.scale.set(len * 1.05, 1, 1); m.visible = true; px = nx; py = ny; }
    }

    // ---------------- achtergrond-strook: voortgangsbalk op de scheiding ----------------
    const barC = document.createElement('canvas'); barC.width = 1100; barC.height = 56; const bg2 = barC.getContext('2d');
    const barTex = new THREE.CanvasTexture(barC); barTex.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: barTex, transparent: true, depthWrite: false, fog: false })); bar.renderOrder = 30; scene.add(bar);
    function placeBar() { const z = 2.0, k = (FL.DZ - z) / FL.DZ; const th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const w = 2 * th * (FL.DZ - z) * (camera.aspect || 1.7); bar.scale.set(w, 1.25 * k, 1); bar.position.set(0, 0, z); }
    let barT = 0;
    function drawBar() {
      const W2 = 1100, Hh = 56; bg2.clearRect(0, 0, W2, Hh);
      const cols = ['#ff6a6a', '#ffb03a', '#ffe14a', '#6fe05a', '#4aa8ff', '#9a6bff']; cols.forEach((c, k) => { bg2.fillStyle = c; bg2.fillRect(0, 4 + k * 8, W2, 8); });
      bg2.fillStyle = 'rgba(20,12,40,.55)'; bg2.fillRect(0, 4, W2, 48);
      const x0 = 70, x1 = 1030, y = 28; bg2.lineCap = 'round'; bg2.strokeStyle = 'rgba(255,255,255,.8)'; bg2.lineWidth = 5; bg2.beginPath(); bg2.moveTo(x0, y); bg2.lineTo(x1, y); bg2.stroke();
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { bg2.fillStyle = (r + c) % 2 ? '#111' : '#fff'; bg2.fillRect(x1 + 8 + c * 9, y - 18 + r * 9, 9, 9); }
      for (const d of D) { const u = clamp(d.progress / L, 0, 1), cx = x0 + u * (x1 - x0); bg2.fillStyle = PLAYER_CSS[d.i]; bg2.strokeStyle = '#fff'; bg2.lineWidth = 3; bg2.beginPath(); bg2.arc(cx, y + (d.i ? 5 : -5), 12, 0, TAU); bg2.fill(); bg2.stroke(); bg2.fillStyle = '#fff'; bg2.font = 'bold 15px Fredoka, Arial, sans-serif'; bg2.textAlign = 'center'; bg2.textBaseline = 'middle'; bg2.fillText(PNAME[d.i][0], cx, y + (d.i ? 6 : -4)); }
      bg2.font = 'bold 20px Fredoka, Arial, sans-serif'; bg2.textBaseline = 'middle'; bg2.textAlign = 'left'; bg2.fillStyle = PLAYER_CSS[0]; bg2.fillText(`${pts(D[0])}`, 12, y - 1); bg2.textAlign = 'right'; bg2.fillStyle = PLAYER_CSS[1]; bg2.fillText(`${pts(D[1])}`, W2 - 12, y - 1);
      barTex.needsUpdate = true;
    }

    // ---------------- tag ----------------
    function drawTag(d) {
      const fcd = d.fireCd <= 0 ? 6 : Math.ceil((1 - d.fireCd / FIRE_CD) * 5);
      const key = `${fcd}|${d.zap ? 1 : 0}|${d.shield > 0 ? 1 : 0}|${d.magnet > 0 ? Math.ceil(d.magnet) : 0}|${d.giant > 0 ? Math.ceil(d.giant) : 0}|${d.heavy > 0 ? 1 : 0}`; if (key === d.tagKey) return; d.tagKey = key;
      const c = d.tag.image, g = c.getContext('2d'); g.clearRect(0, 0, 256, 96);
      g.font = 'bold 48px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(20,10,40,.9)'; g.strokeText(names[d.i], 128, 26); g.fillStyle = PLAYER_CSS[d.i]; g.fillText(names[d.i], 128, 26);
      g.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      const items = []; items.push(d.zap ? '⚡' : fcd >= 6 ? '🔥' : '·'); if (d.shield > 0) items.push('🛡️'); if (d.magnet > 0) items.push('🧲'); if (d.giant > 0) items.push('🦖'); if (d.heavy > 0) items.push('🌧️');
      items.forEach((ic, k) => { g.globalAlpha = ic === '·' || (ic === '🔥' && false) ? 0.5 : 1; g.fillText(ic, 128 + (k - (items.length - 1) / 2) * 44, 68); }); g.globalAlpha = 1;
      if (fcd < 6) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(40, 86, 176 * fcd / 5, 5); }
      d.tag.needsUpdate = true;
    }

    // ---------------- hulpfuncties ----------------
    function refreshHud() {
      hud.setScore(`${names[0]} ${pts(D[0])} – ${pts(D[1])} ${names[1]}`); hud.setTimer(Math.max(0, Math.ceil(timeLeft)), 10);
      for (const d of D) { const f = d.zap ? '⚡klaar!' : d.fireCd > 0 ? `🔥${d.fireCd.toFixed(0)}s` : '🔥klaar'; const txt = `${pts(d)} pt · 🪙${d.coins} · ${f}${d.slipB > 0.05 ? ' 💨' : ''}`; if (txt !== d.hudTxt) { d.hudTxt = txt; hud.setPlayerInfo(d.i, txt); } }
    }
    function puff(x, y, n = 12, cols = [0xffffff, 0xe8e0ff], sp = 3.5) { fx.particles.burst(x, y, 1, { count: n, speed: sp, up: 0.5, life: 0.7, size: 0.5, colors: cols, gravity: 1 }); }
    function hurt(d, dirY) {
      if (ended || d.inv > 0) return; const sx = X0 + d.lean;
      if (d.shield > 0) { d.shield = 0; d.inv = 1.0; d.knock = 0; text('SCHILD WEG!', sx, wy(d) + 2, '#6fd8ff', 1.2); puff(sx, wy(d), 20, [0x6fd8ff, 0xffffff]); audio.sfx('pop', { vol: 0.6 }); ctx.shake(0.15); return; }
      d.dizzy = 1.1; d.inv = 2.0; d.knock = 4.5; d.vy = dirY * 5.5; d.slow = 0.8; d.hits++; stats.hits++; d.combo = 0; d.flapT = -1;
      text('AU!', sx, wy(d) + 2, '#ff8a6a', 1.5); audio.sfx('hurt', { vol: 0.7 }); audio.sfx('thud', { vol: 0.5 }); ctx.shake(0.35); puff(sx, wy(d), 18, [0xffffff, 0xffe14a, 0xffb0a0], 4.5);
    }
    function takePow(d, k) {
      const p = course.pows[k], P = POW[p.type]; lanes[d.i].st.pow[k] = false; stats.pows++; const sx = X0 + d.lean;
      if (p.type === 'shield') d.shield = 99; else if (p.type === 'magnet') d.magnet = 7; else if (p.type === 'giant') { d.giant = 6; d.szT = 1.75; } else d.zap = true;
      text(P.name + '!', sx, wy(d) + 2.3, P.col, 1.5); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('sparkle', { vol: 0.5 }); puff(sx, wy(d), 26, [P.hex, 0xffffff, 0xffe14a], 6); d.cheer = 1.2;
    }
    function collectCoin(d, k) {
      const st = lanes[d.i].st; st.coinAlive[k] = 0; d.coins++; d.combo++; d.comboT = 1.2; const sx = X0 + d.lean;
      audio.sfx('coin', { vol: 0.4, rate: 1 + Math.min(d.combo, 10) * 0.05 });
      fx.particles.burst(sx + 0.5, wy(d), 1, { count: 5, speed: 2.5, up: 1, life: 0.4, size: 0.3, colors: [0xffd23f, 0xffffff], gravity: 3 });
      if (d.combo >= 5 && d.combo % 5 === 0) text(`${d.combo}x!`, sx + 1, wy(d) + 1.5, '#ffe14a', 1);
    }
    function roastBird(d, k, how) {
      const s = lanes[d.i].st.bird[k]; if (s.s !== 0) return; s.s = 1; s.vy = 4; s.rot = 0; const b = course.birds[k];
      const bx = b.x - d.progress; if (how === 'fire') { d.roasts++; stats.roasts++; text('GEBRADEN! +15', bx, lanes[d.i].y0 + s.y + 1.5, '#ffb04a', 1.1); audio.sfx('sizzle', { vol: 0.5 }); } else { d.smashes++; stats.smashes++; text('KNOF! +5', bx, lanes[d.i].y0 + s.y + 1.5, '#8dff6a', 1.1); audio.sfx('thud', { vol: 0.4 }); }
      fx.particles.burst(bx, lanes[d.i].y0 + s.y, 1, { count: 20, speed: 4, up: 1, life: 0.9, size: 0.45, colors: how === 'fire' ? [0xff7a1a, 0xffd23f, 0x6a4a3a] : [0xffffff, 0xaaaaaa], gravity: 4 });
    }
    function birdY(b, s) { return b.y0 + b.amp * Math.sin(s.t * TAU / b.per + b.ph); }

    // ---------------- ronde-flow ----------------
    function endRace(w, reason) {
      if (ended) return; ended = true; endT = 0; winner = w; why = reason;
      hud.showBig(`${names[w]} WINT!`, 1800, w ? '#8fb8ff' : '#7dffb0'); audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.5 }); ctx.shake(0.5);
      const d = D[w]; fx.particles.burst(X0 + d.lean + 2, wy(d), 1, { count: 70, speed: 9, up: 1.2, life: 1.5, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
      D[w].cheer = 99;
    }
    function finishMatch() {
      if (finished) return; finished = true; const w = winner;
      const a = pts(D[0]), b = pts(D[1]);
      const sum = why === 'finish' ? `<b>${names[w]}</b> vloog als eerste over de finish (+${FINISH_BONUS})!` : `Tijd om! <b>${names[w]}</b> had de meeste punten.`;
      ctx.finishPvp({ winner: w, score: [a, b], summary: `${sum}<br>🪙 munten ${D[0].coins}/${D[1].coins} · 🔥 gebraden ${D[0].roasts}/${D[1].roasts} · 💥 botsingen ${D[0].hits}/${D[1].hits}` });
    }
    function judge(reason) { const a = pts(D[0]), b = pts(D[1]); let w = a > b ? 0 : b > a ? 1 : (D[0].progress >= D[1].progress ? 0 : 1); if (a === b && D[0].progress === D[1].progress) w = Math.random() < 0.5 ? 0 : 1; endRace(w, reason); }

    // ---------------- spelstap per draak ----------------
    function dragonStep(d, dt) {
      const i = d.i, st = lanes[i].st, o = D[1 - i]; const inp = pv.input(i); const y0 = lanes[i].y0;
      d.t += dt; d.dizzy = Math.max(0, d.dizzy - dt); d.inv = Math.max(0, d.inv - dt); d.heavy = Math.max(0, d.heavy - dt); d.slow = Math.max(0, d.slow - dt); d.magnet = Math.max(0, d.magnet - dt); d.giant = Math.max(0, d.giant - dt); d.fireCd = Math.max(0, d.fireCd - dt); d.fireT = Math.max(0, d.fireT - dt); d.bounceCd -= dt;
      d.comboT -= dt; if (d.comboT <= 0) d.combo = 0; if (d.giant <= 0 && d.szT > 1) d.szT = 1; d.stormT = Math.max(0, d.stormT - dt);
      // zuiging (comeback)
      const lead = o.progress - d.progress; d.slipB = lead > 8 ? Math.min(0.3, (lead - 8) * 0.0105) : 0;
      if (d.slipB > 0.05 && d.slipMsg <= 0) { d.slipMsg = 7; text('ZUIGING!', X0, wy(d) + 2.2, '#bfe8ff', 1.1); audio.sfx('whoosh', { vol: 0.3 }); } d.slipMsg -= dt;
      // snelheid
      const spd = pv.speed(i); d.ctl = damp(d.ctl, clamp(inp.x, -1, 1), lerp(9, 2, SLIP), dt);
      let mult = 1 + 0.2 * d.ctl + d.slipB; if (d.dizzy > 0) mult *= 0.55; if (d.heavy > 0) mult *= 0.92; if (d.slow > 0) mult *= 0.75;
      d.progress += BASE_V * (1 + (spd - 1) * 0.4) * mult * dt;
      if (d.knock > 0) { const k = Math.min(d.knock, 24 * dt); d.progress = Math.max(0, d.progress - k); d.knock -= k; }
      d.lean = damp(d.lean, 2.2 * d.ctl, 6, dt);
      d.sz = damp(d.sz, d.szT, 7, dt);
      const R = RAD * d.size * (d.giant > 0 ? 1.75 : 1);
      const cx = cxOf(d); const sx = X0 + d.lean;
      // verticaal
      const grav = G * GRAV * (d.heavy > 0 ? 1.7 : 1);
      if (inp.aP && !ended) { d.vy = FLAP * Math.sqrt(GRAV) * (d.heavy > 0 ? 0.88 : 1) * (d.dizzy > 0 ? 0.65 : 1); d.flapT = 0; audio.sfx('whoosh', { vol: 0.12, rate: 1.9 + d.i * 0.1 }); if (Math.random() < 0.5) fx.particles.emit(sx - 0.6, wy(d) - 0.6, 1, rand(-1, 0.5), -1.5, 0, { life: 0.4, size: 0.35, color: 0xffffff, gravity: 0 }); }
      let ay = 0; for (const w of course.winds) if (cx > w.x0 && cx < w.x1) { ay += w.dir * 36; if (Math.random() < dt * 25) fx.particles.emit(sx + rand(-4, 6), y0 + d.y + rand(-2, 2), 0.5, -rand(4, 9), w.dir * rand(4, 8), 0, { life: 0.5, size: 0.22, color: 0xffffff, gravity: 0 }); }
      d.vy = Math.max(VFALL, d.vy - grav * dt + ay * dt); d.y += d.vy * dt;
      if (d.y < FLOOR_Y) { d.y = FLOOR_Y; if (d.vy < -2 && d.bounceCd <= 0) { d.bounceCd = 0.5; d.slow = Math.max(d.slow, 0.35); puff(sx, y0 + FLOOR_Y - 0.4, 10, [0xffffff, 0xe8e0ff], 3); audio.sfx('boing', { vol: 0.3, rate: 1.3 }); } d.vy = Math.max(d.vy, 4.5); }
      if (d.y > CEIL_Y) { d.y = CEIL_Y; d.vy = Math.min(d.vy, -1.5); }
      if (d.flapT >= 0) { d.flapT += dt / 0.4; if (d.flapT >= 1) d.flapT = -1; }
      if (ended) return;
      // vuur / bliksem
      if (inp.bP && d.fireCd <= 0 && d.dizzy < 0.6) {
        if (d.zap) {
          d.zap = false; d.fireCd = 1.0; stats.zaps++; const t = o; showBolt(sx, wy(d) + 0.8, X0 + t.lean, wy(t) + 0.5); audio.sfx('buzz', { vol: 0.5 }); audio.sfx('static', { vol: 0.4 }); audio.sfx('explode', { vol: 0.35 }); ctx.shake(0.5);
          if (t.shield > 0) { t.shield = 0; t.inv = 1.0; text('GEBLOKKEERD!', X0 + t.lean, wy(t) + 2, '#6fd8ff', 1.2); puff(X0 + t.lean, wy(t), 24, [0x6fd8ff, 0xffffff]); }
          else { t.dizzy = Math.max(t.dizzy, 1.4); t.heavy = 4.5; t.stormT = 4.5; t.inv = Math.max(t.inv, 0.6); t.vy = -3; t.flapT = -1; text('BLIKSEM!', X0 + t.lean, wy(t) + 2.2, '#ffe14a', 1.6); puff(X0 + t.lean, wy(t), 30, [0xffe14a, 0xffffff], 7); }
          text('ZAP!', sx + 2, wy(d) + 1.5, '#ffe14a', 1.2);
        } else { d.fireT = FIRE_T; d.fireCd = FIRE_CD; audio.sfx('shoot', { vol: 0.5 }); audio.sfx('explode', { vol: 0.2, rate: 1.4 }); audio.tone(120, 0.5, { type: 'sawtooth', vol: 0.12, slide: 60 }); }
      }
      if (d.fireT > 0) {
        const fx0 = cx + 0.9 * d.sz, fx1 = fx0 + FIRE_LEN;
        const inFire = (ox, oy, rr) => { const rel = ox - fx0; if (rel < -rr || ox > fx1 + rr) return false; const w = 0.7 + 0.3 * clamp(rel, 0, FIRE_LEN) + rr; return Math.abs(oy - (d.y + 0.35)) < w; };
        course.pillars.forEach((p, k) => { if (p.x < fx0 - 3 || p.x > fx1 + 3) return; const ps = st.pil[k];
          if (p.brTop && ps.top && Math.abs(p.x - (fx0 + fx1) / 2) < (fx1 - fx0) / 2 + 1.6 && Math.abs(d.y + 0.35 - ((p.gy1 + H) / 2)) < (H - p.gy1) / 2 + 1.3 + 0.8 * Math.abs(p.x - fx0) / FIRE_LEN) breakPart(d, k, 'top');
          if (p.brBot && ps.bot && Math.abs(p.x - (fx0 + fx1) / 2) < (fx1 - fx0) / 2 + 1.6 && Math.abs(d.y + 0.35 - (p.gy0 / 2)) < p.gy0 / 2 + 1.3 + 0.8 * Math.abs(p.x - fx0) / FIRE_LEN) breakPart(d, k, 'bot'); });
        course.birds.forEach((b, k) => { const s = st.bird[k]; if (s.s !== 0 || b.x < fx0 - 3 || b.x > fx1 + 3) return; if (inFire(b.x, birdY(b, s), 0.7)) roastBird(d, k, 'fire'); });
        course.storms.forEach((s, k) => { if (st.storm[k] && s.x > fx0 - 3 && s.x < fx1 + 3 && inFire(s.x, s.y, 1.6)) { lanes[i].destroyStorm(k); d.smashes++; text('WEG ERMEE! +5', s.x - d.progress, y0 + s.y + 1, '#bfe8ff', 1); puff(s.x - d.progress, y0 + s.y, 24, [0x8a88a8, 0xffffff], 4); audio.sfx('pop', { vol: 0.4 }); } });
        course.treas.forEach((s, k) => { if (st.treas[k] && s.x > fx0 - 3 && s.x < fx1 + 3 && inFire(s.x, s.y, 1.2)) popTreas(d, k); });
      }
      // botsingen
      if (d.inv <= 0 && d.dizzy <= 0) {
        for (let k = 0; k < course.pillars.length; k++) {
          const p = course.pillars[k]; const dx = p.x - cx; if (dx > 3.2) break; if (dx < -3.2) continue; const ps = st.pil[k];
          if (Math.abs(dx) < p.w / 2 + R * 0.55) {
            const topHit = ps.top && d.y + R * 0.72 > p.gy1, botHit = ps.bot && d.y - R * 0.72 < p.gy0;
            if (topHit || botHit) {
              if (d.giant > 0) { if (topHit) breakPart(d, k, 'top', true); if (botHit) breakPart(d, k, 'bot', true); }
              else hurt(d, topHit ? -1 : 1);
            }
          }
        }
        course.treas.forEach((s, k) => { if (!st.treas[k]) return; if (Math.hypot(s.x - cx, s.y - d.y) < s.r + R * 0.6) { if (d.giant > 0) popTreas(d, k, true); else hurt(d, d.y > s.y ? 1 : -1); } });
        course.birds.forEach((b, k) => { const s = st.bird[k]; if (s.s !== 0) return; if (Math.abs(b.x - cx) > 2) return; if (Math.hypot(b.x - cx, birdY(b, s) - d.y) < 0.7 + R * 0.65) { if (d.giant > 0) roastBird(d, k, 'smash'); else { roastBird(d, k, 'bump'); s.s = 1; hurt(d, d.y > birdY(b, s) ? 1 : -1); } } });
      }
      // stormwolken (verzwaren)
      let inS = false; course.storms.forEach((s, k) => { if (!st.storm[k] || Math.abs(s.x - cx) > 3.6) return; if (Math.hypot(s.x - cx, s.y - d.y) < s.r + R * 0.5) { inS = true; if (d.giant <= 0 && d.heavy < 2.5) d.heavy = 2.5; } });
      if (inS && !d.inStorm) { text('BRRR! ZWAAR...', sx, wy(d) + 2, '#aab0d8', 1.1); audio.sfx('buzz', { vol: 0.25, rate: 0.7 }); } d.inStorm = inS;
      // munten
      if (d.magnet > 0 || true) {
        for (let k = 0; k < course.coins.length; k++) { const c = course.coins[k]; if (c.x < cx - 9) continue; if (c.x > cx + 9) break; if (!st.coinAlive[k]) continue; if (c.t >= 0 && st.treas[c.t]) continue;
          if (st.coinFly[k]) { const fxx = st.coinFx[k], fyy = st.coinFy[k]; const dxx = cx - fxx, dyy = d.y - fyy; const dd = Math.hypot(dxx, dyy) || 1; const sp = Math.min(dd, 26 * dt); st.coinFx[k] += dxx / dd * sp; st.coinFy[k] += dyy / dd * sp; if (dd < 0.7) collectCoin(d, k); continue; }
          const dd = Math.hypot(c.x - cx, c.y - d.y); const rr = R + 0.45;
          if (dd < rr + (d.giant > 0 ? 0.4 : 0)) collectCoin(d, k); else if (d.magnet > 0 && dd < 7.5) { st.coinFly[k] = 1; st.coinFx[k] = c.x; st.coinFy[k] = c.y; } }
      }
      course.pows.forEach((p, k) => { if (!st.pow[k] || Math.abs(p.x - cx) > 2) return; if (Math.hypot(p.x - cx, p.y - d.y) < 1.2 + R * 0.7) takePow(d, k); });
      // finish
      if (cx >= L && !ended && !d.done) { d.done = true; d.bonus += FINISH_BONUS; text(`FINISH! +${FINISH_BONUS}`, X0 + 2, wy(d) + 2, '#ffe14a', 1.7); judge('finish'); }
    }
    function breakPart(d, k, side, smash = false) {
      const st = lanes[d.i].st; if (!st.pil[k][side]) return; lanes[d.i].destroyPillarPart(k, side); d.smashes++; stats.smashes++; const p = course.pillars[k];
      const px = p.x - d.progress, py = lanes[d.i].y0 + (side === 'top' ? (p.gy1 + H) / 2 : p.gy0 / 2);
      puff(px, py, 30, [0xffc4d8, 0xffffff, 0xff9ab8], 6); fx.particles.burst(px, py, 1, { count: 14, speed: 5, up: 1, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 3 }); text('BOEM! +5', px, lanes[d.i].y0 + (side === 'top' ? p.gy1 - 1 : p.gy0 + 1), '#ff9ab8', 1.2); audio.sfx('explode', { vol: 0.4, rate: 1.3 }); ctx.shake(0.25);
    }
    function popTreas(d, k, smash = false) {
      const st = lanes[d.i].st; if (!st.treas[k]) return; lanes[d.i].destroyTreas(k); d.smashes++; stats.smashes++; const s = course.treas[k];
      puff(s.x - d.progress, lanes[d.i].y0 + s.y, 26, [0xffd0e0, 0xffffff, 0xffe14a], 5); text('SCHAT! +5', s.x - d.progress, lanes[d.i].y0 + s.y + 1.4, '#ffd23f', 1.2); audio.sfx('powerup', { vol: 0.5, rate: 1.4 }); audio.sfx('pop', { vol: 0.4 });
    }

    // ---------------- hoofdupdate ----------------
    function startMatch() { started = true; refreshHud(); }
    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      T += dt; if (!started) startMatch();
      if (!ended) {
        timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; judge('time'); }
        for (const d of D) dragonStep(d, dt);
      } else {
        endT += dt; for (const d of D) glide(d, dt); if (endT > 2.5) finishMatch();
      }
      visuals(dt);
    }
    function glide(d, dt) { d.t += dt; d.progress += BASE_V * 0.9 * dt; d.lean = damp(d.lean, 0, 3, dt); d.vy = d.vy - 20 * dt; if (d.flapT < 0 && d.vy < -3 && d.y < H * 0.45) { d.vy = 7; d.flapT = 0; } d.y = clamp(d.y + d.vy * dt, FLOOR_Y, CEIL_Y); if (d.y <= FLOOR_Y) d.vy = Math.max(0, d.vy); if (d.flapT >= 0) { d.flapT += dt / 0.4; if (d.flapT >= 1) d.flapT = -1; } d.dizzy = Math.max(0, d.dizzy - dt); d.sz = damp(d.sz, 1, 7, dt); d.fireT = 0; }

    // ---------------- visuals ----------------
    function visuals(dt) {
      const tt = T + introT;
      for (const d of D) {
        const i = d.i, y0 = lanes[i].y0, m = d.m; const sx = X0 + d.lean, y = y0 + d.y;
        m.root.position.set(sx, y, 0.4); const sc = d.size * d.sz; m.root.scale.setScalar(sc);
        m.root.visible = d.inv > 0 && d.dizzy <= 0 ? Math.sin(tt * 40) > -0.3 : true;
        animateDragon(m, dt, { flapT: d.flapT, vy: d.vy, fire: d.fireT > 0, dizzy: d.dizzy, heavy: d.heavy, t: d.t, cheer: d.cheer > 0 });
        if (d.cheer > 0 && d.cheer < 90) d.cheer -= dt;
        m.shield.visible = d.shield > 0; if (d.shield > 0) { m.shield.scale.setScalar(1 + Math.sin(tt * 6) * 0.04); }
        // vuur
        if (d.fireT > 0) {
          const u = 1 - d.fireT / FIRE_T; const len = FIRE_LEN * Math.min(1, u * 5) * (d.fireT < 0.15 ? d.fireT / 0.15 : 1); const wid = 1.3 + len * 0.28; const fx0 = sx + 1.7 * sc * 0.95, fy = y + 0.7 * sc;
          d.fire.visible = true; d.fire.position.set(fx0 + len / 2, fy, 0.5);
          d.fo.scale.set(wid * (0.9 + Math.random() * 0.2), len, wid); d.fi.scale.set(wid * 0.55, len * 0.75, wid * 0.55); d.fi.position.x = len * 0.1;
          if (Math.random() < 0.8) fx.particles.emit(fx0 + rand(0, len), fy + rand(-wid * 0.4, wid * 0.4), 0.6, rand(1, 4), rand(-0.5, 1), 0, { life: 0.5, size: 0.7, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: -1 });
        } else d.fire.visible = false;
        // storm-over (bliksem-effect)
        d.storm.visible = d.stormT > 0; if (d.stormT > 0) { d.storm.position.set(sx, y + 2.3 * sc, 0.8); d.storm.rotation.z = Math.sin(tt * 3) * 0.05; if (Math.random() < dt * 40) fx.particles.emit(sx + rand(-1.2, 1.2), y + 1.8, 0.8, -1, -10, 0, { life: 0.4, size: 0.2, color: 0x9ac0ff, gravity: 0 }); }
        // zuiging-lijnen + kielzog
        if (d.slipB > 0.05 && Math.random() < dt * 30) fx.particles.emit(sx - 1 + rand(-0.5, 0.5), y + rand(-1, 1), 0.2, -rand(8, 14), 0, 0, { life: 0.35, size: 0.28, color: 0xdff4ff, gravity: 0 });
        if (d.giant > 0 && Math.random() < dt * 20) fx.particles.emit(sx + rand(-1.5, 1.5), y - 1, 0.5, 0, 1, 0, { life: 0.5, size: 0.4, color: 0x8dff6a, gravity: -1 });
        if (d.magnet > 0 && Math.random() < dt * 12) { const a = Math.random() * TAU; fx.particles.emit(sx + Math.cos(a) * 3, y + Math.sin(a) * 3, 0.5, -Math.cos(a) * 4, -Math.sin(a) * 4, 0, { life: 0.5, size: 0.25, color: 0xff6a6a, gravity: 0 }); }
        if (d.dizzy > 0 && Math.random() < dt * 14) fx.particles.emit(sx + rand(-0.8, 0.8), y + 1, 0.5, 0, 0.5, 0, { life: 0.5, size: 0.3, color: 0xffe14a, gravity: 0 });
        drawTag(d); d.spr.position.set(sx, y + 2.2 * Math.max(1, sc * 0.9), 0.8);
        lanes[i].render(d.progress, tt, dt);
        // wolkenspetters + snelheid
        if (Math.random() < dt * 14) fx.particles.emit(X0 + 26, y0 + rand(1.5, H - 1), 0.1, -(14 + d.ctl * 3), 0, 0, { life: 1.8, size: 0.16, color: 0xffffff, gravity: 0 });
      }
      // vogels (positie/animatie) en storm-regen per baan
      for (const d of D) {
        const st = lanes[d.i].st, ln = lanes[d.i]; const cx = X0 + d.lean + d.progress;
        course.birds.forEach((b, k) => { const s = st.bird[k], g = ln.birdsM[k].group; const rel = b.x - d.progress;
          if (s.s === 0) { if (rel > -22 && rel < 30) s.t += dt; g.position.set(b.x, birdY(b, s), 0); g.rotation.z = Math.cos(s.t * TAU / b.per + b.ph) * 0.15; }
          else if (s.s === 1) { s.vy -= 22 * dt; s.y = (s.y || birdY(b, { t: s.t })) + s.vy * dt; g.position.set(b.x + s.rot * 2, s.y, 0); s.rot += dt; g.rotation.z += dt * 9; if (s.y < -2) { s.s = 2; g.visible = false; } if (Math.random() < dt * 30) fx.particles.emit(b.x - d.progress, ln.y0 + s.y, 0.5, 0, 1, 0, { life: 0.5, size: 0.4, color: Math.random() < 0.5 ? 0xff7a1a : 0x444444, gravity: -1 }); }
        });
        course.storms.forEach((s, k) => { if (!st.storm[k]) return; const rel = s.x - d.progress; if (rel < -8 || rel > 28) return; if (Math.random() < dt * 28) fx.particles.emit(rel + rand(-2, 2), ln.y0 + s.y - 0.8, 0.5, -1, -8, 0, { life: 0.55, size: 0.2, color: 0x9ac0ff, gravity: 0 }); });
      }
      if (boltT > 0) { boltT -= dt; for (const m of boltSeg) { m.material.opacity = clamp(boltT / 0.3, 0, 1) * (Math.random() < 0.3 ? 0.4 : 1); if (boltT <= 0) m.visible = false; } }
      placeBar(); barT -= dt; if (barT <= 0) { barT = 0.06; drawBar(); }
      refreshHud();
    }
    function resultUpdate(dt) { T += dt; for (const d of D) { glide(d, dt); } visuals(dt); }
    function introUpdate(dt) { introT += dt; for (const d of D) { d.t += dt; d.y = H / 2 + Math.sin(introT * 2 + d.i) * 0.4; d.flapT = Math.sin(introT * 2 + d.i) > 0.9 ? Math.max(d.flapT, 0) : d.flapT; if (d.flapT >= 0) { d.flapT += dt / 0.4; if (d.flapT >= 1) d.flapT = -1; } } visuals(dt); }
    placeBar(); drawBar(); visuals(0.016);

    return {
      update, resultUpdate, introUpdate,
      onResize() { placeBar(); },
      onSwap() { for (const d of D) puff(X0 + d.lean, wy(d), 16, [0xffe14a, 0xffffff], 4); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && !ended) { const d = D[i]; d.dizzy = 2.0; d.heavy = 3; d.stormT = 3; d.inv = 0.3; d.vy = -4; text('DEURMAN!', X0 + d.lean, wy(d) + 2.2, '#ff8a6a', 1.5); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } }); },
      celebrate(w) { D[w].cheer = 99; },
      dispose() {},
      dbg: {
        state: () => ({ T, timeLeft, started, ended, finished, winner, why, d: D.map((d) => ({ progress: +d.progress.toFixed(1), y: +d.y.toFixed(2), vy: +d.vy.toFixed(1), coins: d.coins, pts: pts(d), hits: d.hits, roasts: d.roasts, smashes: d.smashes, dizzy: +d.dizzy.toFixed(1), shield: d.shield > 0, magnet: +d.magnet.toFixed(1), giant: +d.giant.toFixed(1), zap: d.zap, heavy: +d.heavy.toFixed(1), fireCd: +d.fireCd.toFixed(1), slipB: +d.slipB.toFixed(2), done: d.done })), stats: { ...stats } }),
        D, course, lanes, setTime: (t) => { timeLeft = t; }, setProgress: (i, p) => { D[i].progress = p; }, give: (i, type) => { const k = course.pows.findIndex((p, kk) => p.type === type && lanes[i].st.pow[kk]); if (k >= 0) takePow(D[i], k); else { const P = POW[type]; if (type === 'shield') D[i].shield = 99; else if (type === 'magnet') D[i].magnet = 7; else if (type === 'giant') { D[i].giant = 6; D[i].szT = 1.75; } else D[i].zap = true; } },
        hurt: (i) => hurt(D[i], 1), cx: cxOf,
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, shuffle, TAU, canvasTex, mulberry32 } from '../engine/util.js';
import { Animal } from '../engine/chars.js';
import { buildWorld, ROWS, LW, T, RS, DOORH, LANE_CX, rowZ, FINISH_Z, START_Z, kraakPhase, doorGeo, doorX } from './deurenrace_world.js';
import { friendlyDeurman, deurmanHead } from './deurenrace_man.js';

// Deurenrace — Fall Guys "Door Dash" voor twee broers: twee banen naast elkaar met 14 rijen deuren. Achter maar één deur per rij is de weg open,
// de rest is nep (boem, kip, taart, of de Deurman die een handtekening wil). Het patroon is voor beide banen hetzelfde: kijk dus ook naar je broer!
//  * richtingen = rennen, A = schouderduw (opent de echte deur), B = duik (cooldown)
//  * hints: krassen op de vloer, een lichtstreep onder de deur, een krakende deur, of de Deurman die z'n hoofd uit de goede deur steekt
//  * items (vraagtekenblokken): kijkgat (toont de goede deur), turbo, zandzak (op het hoofd van je broer)
//  * comeback: wie ver achterligt rent iets sneller, krijgt kijkgatten i.p.v. zandzakken en vaker een Deurman-hint
//  * winnaar: eerst over de finish; na 80 s wie het verst is (rijen, dan afstand)

const SPEED = 5.6, CH_T = 0.26, CH_SP = 11.5, CH_CD = 0.75, DIVE_T = 0.5, DIVE_SP = 10.5, DIVE_CD = 2.2, RACE_T = 80;
const FAKES = [['boom', 30], ['kip', 22], ['taart', 22], ['deurman', 18], ['slot', 8]];
const CLUES = [['none', 28], ['krassen', 26], ['licht', 22], ['kraak', 24]];
const wpick = (list, rng) => { const tot = list.reduce((a, b) => a + b[1], 0); let r = rng() * tot; for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; };

function genRows(rng) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const n = r % 3 === 0 || r === ROWS - 1 ? 3 : 4, real = Math.floor(rng() * n);
    const clue = r === 0 ? 'krassen' : wpick(CLUES, rng);
    const fakes = [], cols = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng).slice(0, n);
    for (let d = 0; d < n; d++) fakes.push(d === real ? null : wpick(FAKES, rng));
    rows.push({ n, real, clue, fakes, colors: cols, z: rowZ(r) });
  }
  const orbs = [], kinds = ['kijk', 'turbo', 'zand'];
  for (let g = 0; g < ROWS; g++) {
    const z = g === 0 ? rowZ(0) + 5.4 : rowZ(g) + RS / 2, a = Math.floor(rng() * 3), b = (a + 1 + Math.floor(rng() * 2)) % 3;
    const dx = 1.6 + rng() * 2.2;
    orbs.push({ dx: -dx, z, kind: kinds[a] }, { dx: dx, z, kind: kinds[b] });
  }
  rows.orbs = orbs; return rows;
}
const tagTex = (name, css) => canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(name, w / 2, hh / 2); g.fillStyle = css; g.fillText(name, w / 2, hh / 2); });

export default {
  id: 'deurenrace',
  name: 'Deurenrace',
  giver: 'De Deurman',
  icon: '🚪',
  mode: 'pvp',
  time: 80,
  music: 'game_fast',
  blurb: 'Renn door de kasteelgang vol <b>deuren</b>! Achter maar <b>één deur per rij</b> is de weg open, de rest is nep: <b>boem</b>, een <b>kip</b>, een <b>taart</b> of de <b>Deurman</b> die een handtekening wil. Jullie banen hebben <b>hetzelfde patroon</b>: kijk ook naar je broer! Pak vraagtekenblokken voor <b>kijkgat</b>, <b>turbo</b> of een <b>zandzak</b>.',
  controls: ['{move} rennen', '{a} deur openduwen', '{b} duik (even wachten)'],
  tip: 'Hints: krassen op de vloer, een lichtstreepje onder de deur, een krakende deur of de Deurman die kijkt. Een NEP-bordje? Niet duwen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name);
    const GRAV = pv.gravity || 1, SLIP = pv.slip || 0;
    const rng = mulberry32(Math.floor(ctx.rng() * 1e9) + 1);
    const rows = genRows(rng);

    const L = ctx.lights('indoor', { shadow: 18, center: [0, 0, -4], fogNear: 48, fogFar: 118 });
    L.hemi.intensity = 1.25; L.hemi.color.set(0xfff0dc); L.hemi.groundColor.set(0x7a5a9a);
    L.sun.color.set(0xffe2b8); L.sun.intensity = 1.5;
    const warm = new THREE.PointLight(0xffc880, 1.1, 40, 1.3); scene.add(warm);
    camera.fov = 52; camera.updateProjectionMatrix();
    const W = buildWorld(ctx, rows);

    // ---------------- spelers ----------------
    const sandGeo = new THREE.SphereGeometry(0.55, 10, 8), sandM = mat(0xc9a56a, { flatShading: false }), knotG = new THREE.ConeGeometry(0.2, 0.3, 6);
    const P = players.map((pp, p) => {
      const c = ctx.make.brother(p), sz = pv.size(p); c.group.scale.setScalar(1.5 * sz);
      const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      c.faceDir(0, -1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const ring = new THREE.Mesh(new THREE.CircleGeometry(0.9 * sz, 20), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; scene.add(ring);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(pp.name, pp.css), transparent: true, depthTest: false })); tag.scale.set(2.0, 0.75, 1); tag.renderOrder = 15; scene.add(tag);
      // taart op het hoofd
      const cream = new THREE.Group(); cream.visible = false; c.head.add(cream);
      cream.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(0xfff6e0, { flatShading: false }), { cast: false, pos: [0, 0.02, 0.1], scale: [1, 0.85, 1] }));
      cream.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0xd8232a), { cast: false, pos: [0, 0.3, 0.1] }));
      const sbag = new THREE.Group(); sbag.visible = false; c.head.add(sbag);
      return { p, c, holder, ring, tag, cream, sz, rad: 0.46 * sz, x: LANE_CX[p], z: START_Z, vx: 0, vz: 0, y: 0, row: 0, done: false,
        chargeT: 0, chargeCd: 0, chargeUsed: false, cdir: [0, -1], diveT: 0, diveCd: 0, ddir: [0, -1], stunT: 0, slowT: 0, turboT: 0, hiT: 0, signT: 0, creamT: 0, kijkT: 0,
        peekT: 5.5 + p * 0.7, peek: null, stepT: 0, wrong: 0, items: 0, info: '', sign: null, facing: 0 };
    });
    // Deurman-handtekening: per baan een eigen Deurman (pas gemaakt als hij nodig is) + kijkhoofd om uit de deur te steken
    const heads = [0, 1].map(() => { const g = deurmanHead(1.0); g.visible = false; scene.add(g); return g; });
    const signers = [0, 1].map(() => ({ hold: null, dm: null, t: 0, show: 0 }));
    function ensureSigner(p) {
      const s = signers[p]; if (s.dm) return s;
      const dm = friendlyDeurman(1.0); const hold = new THREE.Group(); hold.add(dm.group); hold.visible = false; hold.scale.setScalar(1.05); scene.add(hold);
      const board = new THREE.Group(); board.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.04), mat(0x8a5a2b), { cast: false })); board.add(mesh(new THREE.BoxGeometry(0.34, 0.45, 0.02), mat(0xffffff), { cast: false, pos: [0, 0, 0.03] }));
      board.position.set(0, -1.7, 0.2); board.rotation.x = 0.4; dm.arms[1].add(board);
      s.dm = dm; s.hold = hold; return s;
    }
    const chickens = [0, 1, 2, 3].map(() => { const an = new Animal('chicken'); an.group.scale.setScalar(1.9); an.group.visible = false; scene.add(an.group); return { an, t: 0, on: false, vx: 0, vz: 0, x: 0, z: 0, y: 0, lane: 0 }; });
    const sandbags = [];

    // ---------------- toestand ----------------
    let winner = -1, T0 = 0, introT = 0, started = false, finished = false, raceT = 0, timeLeft = RACE_T, lastDt = 0.016, camInit = false;
    const stats = { wrong: [0, 0], kip: [0, 0], taart: [0, 0], sign: [0, 0], boom: [0, 0], sand: [0, 0], hits: [0, 0], items: [0, 0], peeks: 0 };
    const timers = []; const later = (s, fn) => timers.push({ t: s, fn });
    const door = (p, r, d) => W.doors[p][r][d];
    const prog = (q) => START_Z - q.z;
    const lead = (p) => prog(P[1 - p]) - prog(P[p]);          // > 0: je ligt achter
    const behind = (p) => lead(p) >= 13;

    // eigen kleine DOM-voortgangsbalk onderaan (wie waar is)
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);width:min(420px,60vw);height:30px;pointer-events:none;z-index:5;font:700 12px Fredoka,Arial,sans-serif;color:#fff;text-shadow:0 1px 3px #000';
    bar.innerHTML = '<div style="position:absolute;left:0;right:0;top:12px;height:6px;border-radius:3px;background:rgba(20,10,40,.7);border:1px solid rgba(255,255,255,.5)"></div><div style="position:absolute;right:-2px;top:2px;font-size:16px">🏁</div>';
    const dots = players.map((pp, i) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;top:${i ? 14 : 6}px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:${pp.css};border:2px solid #fff;transition:left .1s`; bar.append(d); return d; });
    bar.style.display = 'none'; document.body.append(bar);

    // ---------------- hulp ----------------
    function say(x, z, txt, col = '#ffe14a', sc = 1.2, y = 3.4) { fx.texts.add(txt, x, y, z, col, sc); }
    function sayP(q, txt, col, sc) { say(q.x, q.z, txt, col, sc, 3.8 * q.sz + 0.4); }
    function doorAtX(w, p, x) { const { gapHalf } = doorGeo(w.n); for (let d = 0; d < w.n; d++) if (Math.abs(x - doorX(p, w.n, d)) <= gapHalf) return d; return -1; }
    function setPose(q, pose) { q.c.pose = pose; }
    function stun(q, t, pose = 'scared') { q.stunT = Math.max(q.stunT, t); q.chargeT = 0; q.diveT = 0; q.pose = pose; }

    function openReal(q, dr) {
      dr.pass = true; dr.target = 1; dr.mark.visible = false; stats.hits[q.p]++;
      audio.sfx('door', { vol: 0.7 }); audio.sfx('good', { vol: 0.35 });
      fx.particles.burst(dr.cx, 1.6, rowZ(dr.r) + 0.6, { count: 22, speed: 5, up: 1, life: 0.7, size: 0.3, colors: [0xffe14a, 0xffffff, 0x8dff6a], gravity: 3 });
      say(dr.cx, rowZ(dr.r) + 0.8, 'OPEN!', '#8dff6a', 1.3, 3.8); q.c.swing();
    }
    function hitDoor(q, dr) {
      if (dr.pass) return;
      q.chargeUsed = true;
      if (dr.real) { openReal(q, dr); return; }
      stats.wrong[q.p]++; q.wrong++;
      const z = rowZ(dr.r) + T / 2, firstTime = !dr.mark.visible; dr.mark.visible = true;
      fx.particles.burst(dr.cx, 1.8, z + 0.3, { count: 16, speed: 4, up: 0.8, life: 0.6, size: 0.3, colors: [0xff5a5a, 0xffffff], gravity: 3 });
      switch (dr.fake) {
        case 'boom':
          dr.shakeT = 0.7; dr.peek = 0.6; later(0.22, () => { dr.peek = 0; });
          q.vz = 12.5; q.vx = (q.x - dr.cx) * 3; stun(q, 0.8); stats.boom[q.p]++; ctx.shake(0.4);
          audio.sfx('thud', { vol: 0.8 }); audio.sfx('hit', { vol: 0.5 }); say(dr.cx, z, 'BOEM!', '#ff9a4a', 1.6, 3.2);
          fx.particles.ring(dr.cx, 1.3, z + 0.5, { count: 20, speed: 6, color: 0xffe14a, size: 0.3, life: 0.5 });
          break;
        case 'kip': {
          dr.peek = 1.2; later(1.2, () => { dr.peek = 0; });
          const ch = chickens.find((c) => !c.on) || chickens[0]; ch.on = true; ch.t = 0; ch.lane = q.p; ch.x = dr.cx; ch.z = z + 0.4; ch.y = 1.6; ch.vx = (Math.random() < 0.5 ? -1 : 1) * rand(3, 5); ch.vz = rand(3, 6); ch.an.group.visible = true;
          q.vz = 5; q.vx = (q.x - dr.cx) * 2; stun(q, 0.95); stats.kip[q.p]++; ctx.shake(0.25);
          audio.sfx('boing', { vol: 0.5 }); for (let i = 0; i < 4; i++) audio.tone(520 + i * 70 + Math.random() * 60, 0.09, { type: 'square', vol: 0.12, delay: i * 0.1, slide: 380 });
          say(dr.cx, z, 'KO-KO-KODEK!', '#ffffff', 1.5, 3.4);
          for (let i = 0; i < 12; i++) fx.particles.emit(dr.cx, 1.6, z + 0.5, rand(-3, 3), rand(1, 5), rand(0, 4), { life: 1.1, size: 0.22, color: 0xffffff, gravity: 5 });
          break;
        }
        case 'taart':
          dr.peek = 0.7; later(0.9, () => { dr.peek = 0; });
          q.creamT = 2.8; q.slowT = 2.8; stun(q, 0.4, 'sad'); stats.taart[q.p]++; q.vz = 3;
          audio.sfx('splash', { vol: 0.6 }); audio.sfx('pop', { vol: 0.5 }); say(q.x, q.z, 'PLAF! TAART!', '#ffd0e8', 1.5, 3.4); ctx.shake(0.2);
          fx.particles.burst(q.x, 1.8 * q.sz, q.z, { count: 30, speed: 5, up: 1, life: 0.9, size: 0.34, colors: [0xfff6e0, 0xffd0e8, 0xff8aa8], gravity: 5 });
          break;
        case 'deurman': {
          const s = ensureSigner(q.p); s.t = 0; s.show = 1; s.door = dr; s.hold.visible = true; dr.peek = 1.35;
          q.signT = 3.2; q.vx = q.vz = 0; stats.sign[q.p]++; q.chargeT = 0;
          audio.sfx('knock', { vol: 0.4 }); audio.sfx('bell', { vol: 0.3 }); say(dr.cx, z, 'Handtekening?', '#ffffff', 1.5, 4.2); say(q.x, q.z, 'Druk A/B!', '#ffe14a', 1.1, 3.0);
          break;
        }
        default:   // slot
          dr.shakeT = 0.5; stun(q, 0.4, 'sad'); audio.sfx('click2', { vol: 0.5 }); audio.sfx('wood', { vol: 0.4 }); say(dr.cx, z, 'KLIK! Op slot!', '#c8c8d8', 1.3, 3.2); q.vz = 3;
      }
      if (firstTime) say(dr.cx, z, 'NEP!', '#ff5a5a', 0.9, 2.2);
    }
    function endSign(q, ok = true) {
      const s = signers[q.p]; q.signT = 0;
      if (s.door) { later(0.5, () => { s.door.peek = 0; }); }
      if (ok) {
        q.hiT = 1.4; sayP(q, 'HOGE VIJF! Turbo!', '#ffe14a', 1.4); audio.sfx('good', { vol: 0.5 }); audio.sfx('powerup', { vol: 0.4 }); q.c.pose = 'cheer'; q.cheerT = 0.7;
        fx.particles.burst(q.x, 2, q.z, { count: 26, speed: 6, up: 1, life: 0.9, size: 0.35, colors: [0xffd23f, 0xffffff, 0xff6ac0], gravity: 4 });
      }
      s.leave = 0.6;
    }
    function giveItem(q, o) {
      let kind = o.kind; if (kind === 'zand' && behind(q.p)) kind = 'kijk';
      q.items++; stats.items[q.p]++; o.alive = false; o.pop = 0;
      fx.particles.burst(o.x, 1.3, o.z, { count: 18, speed: 5, up: 1, life: 0.8, size: 0.3, colors: [0xffe14a, 0xff6ac0, 0x3ad0e8], gravity: 3 });
      audio.sfx('powerup', { vol: 0.5 });
      if (kind === 'kijk') { q.kijkT = 5; sayP(q, 'KIJKGAT! Zie je de goede deur?', '#6aff9a', 1.2); }
      else if (kind === 'turbo') { q.turboT = 3.2; sayP(q, 'TURBO!', '#ffe14a', 1.5); audio.sfx('whoosh', { vol: 0.5 }); }
      else {
        const t = P[1 - q.p]; sayP(q, `ZANDZAK naar ${names[1 - q.p]}!`, '#ffb060', 1.2); audio.sfx('throw', { vol: 0.6 });
        if (!t.done) {
          const sx = clamp(t.x + t.vx * 0.9, LANE_CX[t.p] - LW / 2 + 1, LANE_CX[t.p] + LW / 2 - 1), sz = t.z + Math.min(0, t.vz) * 0.9;
          const g = new THREE.Group(); g.add(new THREE.Mesh(sandGeo, sandM), mesh(knotG, sandM, { pos: [0, 0.6, 0] })); g.scale.setScalar(1.5); scene.add(g);
          const sh = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(sx, 0.08, sz); scene.add(sh);
          sandbags.push({ to: t.p, from: q.p, t: 0, dur: 1.15, x: sx, z: sz, g, sh });
        }
      }
    }
    function passRow(q) {
      q.row++; audio.sfx('ding', { vol: 0.5, rate: 1 + q.row * 0.04 }); fx.particles.ring(q.x, 0.3, q.z + 0.4, { count: 16, speed: 5, color: q.p ? 0x6fa8ff : 0x6aff9a, size: 0.25, life: 0.5 });
      sayP(q, q.row >= ROWS ? 'LAATSTE DEUR!' : `Rij ${q.row}!`, '#ffffff', 1.0);
      if (q.peek && q.peek.r < q.row) stopPeek(q);
    }
    function stopPeek(q) { if (!q.peek) return; const dr = door(q.p, q.peek.r, rows[q.peek.r].real); if (!dr.pass) dr.peek = 0; q.peek = null; heads[q.p].visible = false; }

    // ---------------- bewegen ----------------
    function movePlayer(q, dt, inp, active) {
      let mx = 0, my = 0;
      if (active) { mx = inp.x; my = inp.y; const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; } }
      const act = active && q.stunT <= 0 && q.signT <= 0;
      if (act) {
        if (inp.aP && q.chargeCd <= 0 && q.diveT <= 0) { q.chargeT = CH_T; q.chargeCd = CH_CD; q.chargeUsed = false; const m = Math.hypot(mx * 0.4, -1); q.cdir = [mx * 0.4 / m, -1 / m]; q.c.swing(); audio.sfx('swing', { vol: 0.45 }); }
        else if (inp.bP && q.diveCd <= 0 && q.chargeT <= 0 && q.diveT <= 0) {
          q.diveT = DIVE_T * (GRAV < 1 ? 1.5 : 1); q.diveDur = q.diveT; q.diveCd = DIVE_CD; const m = Math.hypot(mx, my); q.ddir = m > 0.3 ? [mx / m, my / m] : [0, -1]; q.c.jump(); audio.sfx('jump', { vol: 0.45 });
          fx.particles.dust(q.x, 0.2, q.z, 6, 0xd8c8a8);
        }
      } else if (q.signT > 0 && (inp.aP || inp.bP)) { q.signT -= 0.55; audio.sfx('scrape', { vol: 0.25 }); fx.particles.emit(q.x, 2.4, q.z - 0.5, rand(-1, 1), 2, 0, { life: 0.5, size: 0.2, color: 0x5a8cff, gravity: 3 }); }
      // doelsnelheid
      const rub = lead(q.p) >= 22 ? 1.15 : behind(q.p) ? 1.08 : 1;
      const mul = pv.speed(q.p) * (q.turboT > 0 ? 1.55 : 1) * (q.slowT > 0 ? 0.55 : 1) * (q.hiT > 0 ? 1.3 : 1) * rub;
      let tx = mx * SPEED * mul, tz = my * SPEED * mul, lam = lerp(16, 1.6, SLIP);
      if (!active) { tx = tz = 0; lam = 8; }
      else if (q.stunT > 0 || q.signT > 0) { tx = tz = 0; lam = q.signT > 0 ? 12 : 3.2; }
      else if (q.chargeT > 0) { tx = q.cdir[0] * CH_SP * Math.min(1.3, mul); tz = q.cdir[1] * CH_SP * Math.min(1.3, mul); lam = 40; }
      else if (q.diveT > 0) { tx = q.ddir[0] * DIVE_SP * Math.min(1.3, mul); tz = q.ddir[1] * DIVE_SP * Math.min(1.3, mul); lam = 30; }
      q.vx = damp(q.vx, tx, lam, dt); q.vz = damp(q.vz, tz, lam, dt);
      q.x += q.vx * dt; q.z += q.vz * dt;
      // grenzen: baanbreedte, niet terug door een gepasseerde muur
      const cx = LANE_CX[q.p], rw = Math.min(q.rad, 0.7);
      q.x = clamp(q.x, cx - LW / 2 + q.rad, cx + LW / 2 - q.rad);
      const back = q.row > 0 ? rows[q.row - 1].z - T / 2 - rw : START_Z + 2.4; if (q.z > back) { q.z = back; if (q.vz > 0) q.vz = 0; }
      const w = rows[q.row];
      if (w) {
        const wz = w.z;
        if (q.z - rw < wz + T / 2) {
          const g = doorAtX(w, q.p, q.x), dr = g >= 0 ? door(q.p, q.row, g) : null;
          if (dr && dr.pass) {
            const { gapHalf } = doorGeo(w.n); q.x = clamp(q.x, dr.cx - gapHalf + rw * 0.6, dr.cx + gapHalf - rw * 0.6);
            if (q.z + 0 < wz - T / 2 - rw) passRow(q);
          } else { q.z = wz + T / 2 + rw; if (q.vz < 0) q.vz = 0; }
        }
        // schouderduw: raakt de deur als je er vlakbij bent
        if (q.chargeT > 0 && !q.chargeUsed) {
          const gap = q.z - rw - (wz + T / 2);
          if (gap < 0.85) { const d = doorAtX(w, q.p, q.x); if (d >= 0) hitDoor(q, door(q.p, q.row, d)); else if (gap < 0.2) { q.chargeUsed = true; audio.sfx('click', { vol: 0.4 }); fx.particles.dust(q.x, 0.5, q.z - 0.3, 4, 0xd8c8a8); } }
        }
      }
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      lastDt = dt; T0 += dt; if (!started) started = true;
      if (!finished) { raceT += dt; timeLeft = Math.max(0, RACE_T - raceT); hud.setTimer(timeLeft, 15); }
      runTimers(dt);
      for (const q of P) {
        const inp = pv.input(q.p);
        q.chargeCd = Math.max(0, q.chargeCd - dt); q.diveCd = Math.max(0, q.diveCd - dt); q.stunT = Math.max(0, q.stunT - dt); q.slowT = Math.max(0, q.slowT - dt); q.turboT = Math.max(0, q.turboT - dt); q.hiT = Math.max(0, q.hiT - dt); q.kijkT = Math.max(0, q.kijkT - dt); q.creamT = Math.max(0, q.creamT - dt);
        if (q.chargeT > 0) q.chargeT -= dt; if (q.diveT > 0) q.diveT -= dt;
        if (q.signT > 0) { q.signT -= dt; if (q.signT <= 0) endSign(q, true); }
        movePlayer(q, dt, inp, !q.done && !finished);
        if (q.done || finished) continue;
        // orbs
        for (const o of W.orbs[q.p]) if (o.alive && Math.hypot(o.x - q.x, o.z - q.z) < 1.15) giveItem(q, o);
        // dust / turbo-spoor / voetstappen
        const sp = Math.hypot(q.vx, q.vz);
        if (q.turboT > 0 && Math.random() < dt * 30) fx.particles.emit(q.x, 0.6, q.z + 0.3, rand(-0.5, 0.5), rand(0, 1), rand(0.5, 2), { life: 0.5, size: 0.3, color: 0xffd23f, gravity: 0 });
        q.stepT -= dt * sp; if (q.stepT <= 0 && sp > 2 && q.diveT <= 0) { q.stepT = 3.2; audio.sfx('step', { vol: 0.1 }); }
        // kraak-hint: de echte deur kraakt en je hoort het als je dichtbij bent
        const w = rows[q.row];
        if (w && w.clue === 'kraak') { const ph = kraakPhase(T0, q.row), pp = kraakPhase(T0 - dt, q.row); if (ph < 0.5 && (pp >= 0.5 || ph < pp) && q.z - w.z < 14) audio.sfx('creak', { vol: 0.35 }); }
        // Deurman steekt z'n hoofd uit de goede deur
        q.peekT -= dt;
        if (q.peekT <= 0 && !q.peek && w && q.signT <= 0) {
          if (q.z - w.z > 13) q.peekT = 0.7;
          else {
            const dr = door(q.p, q.row, w.real); if (!dr.pass) { q.peek = { r: q.row, t: 0, dur: 2.6 }; dr.peek = 0.7; stats.peeks++; audio.sfx('knock', { vol: 0.35 }); say(dr.cx, w.z + 0.5, 'KOEKOEK!', '#ffffff', 1.1, 4.1); }
            q.peekT = behind(q.p) ? rand(5, 7) : rand(9.5, 13);
          }
        }
        if (q.peek) { q.peek.t += dt; if (q.peek.t > q.peek.dur) stopPeek(q); }
        // finish
        if (q.z < FINISH_Z) q.done = true;
      }
      // beide over de finish in dezelfde frame: wie verder is wint; na 80 s: wie verst is
      if (!finished) {
        const d = P.filter((q) => q.done);
        if (d.length) endRace(d.length === 2 ? (P[0].z <= P[1].z ? 0 : 1) : d[0].p, 'finish');
        else if (timeLeft <= 0) endRace(winnerByProgress(), 'tijd');
      }
      sandbagsUpdate(dt); chickensUpdate(dt); signersUpdate(dt);
      visuals(dt);
    }
    function winnerByProgress() {
      const a = prog(P[0]), b = prog(P[1]);
      if (P[0].row !== P[1].row) return P[0].row > P[1].row ? 0 : 1;
      if (Math.abs(a - b) > 0.05) return a > b ? 0 : 1;
      if (P[0].wrong !== P[1].wrong) return P[0].wrong < P[1].wrong ? 0 : 1;
      return Math.random() < 0.5 ? 0 : 1;
    }
    function sandbagsUpdate(dt) {
      for (let i = sandbags.length - 1; i >= 0; i--) {
        const s = sandbags[i]; s.t += dt; const u = Math.min(1, s.t / s.dur);
        s.g.position.set(s.x, lerp(11, 0.5, u * u), s.z); s.g.rotation.y += dt * 4; s.sh.scale.setScalar(0.4 + u * 0.8); s.sh.material.opacity = 0.2 + u * 0.4;
        if (u >= 1) {
          const t = P[s.to]; scene.remove(s.g, s.sh); s.sh.geometry.dispose(); s.sh.material.dispose(); sandbags.splice(i, 1);
          fx.particles.burst(s.x, 0.5, s.z, { count: 20, speed: 5, up: 1, life: 0.8, size: 0.35, colors: [0xc9a56a, 0xe8d0a0], gravity: 6 }); audio.sfx('thud', { vol: 0.7 }); ctx.shake(0.3);
          if (!t.done && t.diveT <= 0 && Math.hypot(t.x - s.x, t.z - s.z) < 1.5 + t.rad) { stun(t, 1.15, 'sad'); stats.sand[s.from]++; say(t.x, t.z, 'PLOF! ZANDZAK!', '#ffb060', 1.5, 3.2); audio.sfx('hurt', { vol: 0.5 }); }
          else say(s.x, s.z, 'Zandzak mist!', '#ffffff', 1.0, 1.8);
        }
      }
    }
    function chickensUpdate(dt) {
      for (const ch of chickens) {
        if (!ch.on) continue; ch.t += dt; ch.vy = (ch.vy || 0);
        ch.x += ch.vx * dt; ch.z += ch.vz * dt; ch.vz = damp(ch.vz, 0, 1.2, dt);
        const cx = LANE_CX[ch.lane]; if (Math.abs(ch.x - cx) > LW / 2 - 0.6) ch.vx *= -1;
        ch.y = Math.max(0, ch.y + (ch.t < 0.5 ? -dt * 4 : 0)); const bounce = ch.t > 0.5 ? Math.abs(Math.sin(ch.t * 9)) * 0.35 : ch.y;
        ch.an.group.position.set(ch.x, bounce, ch.z); ch.an.targetYaw = Math.atan2(ch.vx, Math.max(0.2, ch.vz)); ch.an.speed = 1; ch.an.update(dt);
        if (ch.t > 3.4) { ch.on = false; ch.an.group.visible = false; fx.particles.burst(ch.x, 0.6, ch.z, { count: 8, speed: 2, up: 1, life: 0.5, size: 0.3, color: 0xffffff, gravity: 2 }); }
      }
    }
    function signersUpdate(dt) {
      for (let p = 0; p < 2; p++) {
        const s = signers[p]; if (!s.dm || !s.hold.visible) continue; const q = P[p], dr = s.door;
        s.t += dt; const pop = s.leave > 0 ? Math.max(0, s.leave / 0.6) : Math.min(1, s.t / 0.35);
        if (s.leave > 0) { s.leave -= dt; if (s.leave <= 0) { s.hold.visible = false; s.leave = 0; continue; } }
        const k = 1.05 * (pop < 1 ? pop * (1.5 - 0.5 * pop) : 1);
        s.hold.scale.setScalar(Math.max(0.01, k)); s.hold.position.set(dr.cx, 0, rowZ(dr.r) + 0.2);
        const dm = s.dm; dm.speed = 0; dm.update(dt);
        if (q.signT > 0) { dm.arms[1].rotation.x = -1.3 + Math.sin(T0 * 14) * 0.15; dm.arms[1].rotation.z = -0.05; dm.arms[0].rotation.x = -0.6; dm.head.rotation.x = 0.3; }
        else { dm.arms[1].rotation.x = -2.9; dm.arms[1].rotation.z = -0.3 + Math.sin(T0 * 12) * 0.2; }
      }
    }

    // ---------------- beelden ----------------
    const camTgt = new THREE.Vector3(), camPos = new THREE.Vector3();
    function placeCamera(dt, snap) {
      const zs = winner >= 0 ? [P[winner].z + 2, P[winner].z + 2] : [P[0].z, P[1].z], lead0 = Math.min(zs[0], zs[1]), trail = Math.max(zs[0], zs[1]);
      const mid = lerp(trail, lead0, 0.4), gap = trail - lead0, extra = clamp(gap - 4, 0, 40);
      let tz = mid - 4.5 - extra * 0.1, py = 13.2 + extra * 0.62, pz = mid + 11.5 + extra * 0.5, ty = 0.5;
      if (winner >= 0) { tz = mid - 20; py = 9.5; pz = mid + 11; ty = 3.2; }          // na de finish: kijk naar de boog en de Deurman
      const k = snap ? 1 : 1 - Math.exp(-3.2 * dt);
      camPos.set(0, lerp(camera.position.y, py, k), lerp(camera.position.z, pz, k)); camTgt.set(0, lerp(camTgt.y, ty, k), lerp(camTgt.z, tz, k));
      if (snap) { camTgt.z = tz; camPos.set(0, py, pz); }
      camera.position.copy(camPos); camera.lookAt(camTgt);
      L.sun.target.position.set(0, 0, mid); L.sun.position.set(9, 26, mid + 10); L.sun.target.updateMatrixWorld();
      warm.position.set(0, 7, mid - 2);
    }
    function poseAll(dt, bt) {
      for (const q of P) {
        const c = q.c, sp = Math.hypot(q.vx, q.vz);
        q.y = 0; let lean = 0;
        if (q.diveT > 0) { const u = 1 - q.diveT / q.diveDur; q.y = Math.sin(Math.PI * Math.min(1, u)) * 0.9 * (GRAV < 1 ? 1.8 : 1); lean = -0.95 * Math.sin(Math.PI * Math.min(1, u)); c.air = false; c.pose = 'hands_up'; }
        else { c.air = false; }
        if (!finished) {
          if (q.signT > 0) c.pose = 'carry';
          else if (q.stunT > 0) c.pose = q.creamT > 0 ? 'sad' : 'scared';
          else if (q.chargeT > 0) c.pose = 'push';
          else if (q.diveT > 0) c.pose = 'hands_up';
          else if (q.cheerT > 0) { q.cheerT -= dt; c.pose = 'cheer'; }
          else c.pose = q.done ? 'cheer' : 'idle';
        }
        c.speed = clamp(sp / 6, 0, 1.2);
        if (sp > 0.8 && !q.signT) c.faceDir(q.vx, q.vz); else if (q.stunT <= 0) c.faceDir(0, -1);
        if (q.signT > 0) c.faceDir(0, 1);
        c.update(dt);
        q.holder.position.set(q.x, q.y, q.z); q.holder.rotation.x = lean;
        q.cream.visible = q.creamT > 0; q.ring.position.set(q.x, 0.06, q.z); q.ring.material.opacity = 0.35 + 0.15 * Math.sin(bt * 6);
        q.tag.position.set(q.x, 3.5 * q.sz + 0.3, q.z);
      }
    }
    function hudInfo() {
      for (const q of P) {
        const bits = [`Rij ${Math.min(q.row + (q.done ? 0 : 1), ROWS)}/${ROWS}`];
        if (q.done) bits.push('🏁 FINISH!'); else {
          if (q.kijkT > 0) bits.push('🔍 kijkgat'); if (q.turboT > 0) bits.push('⚡ turbo'); if (q.hiT > 0) bits.push('✋ hoge vijf');
          if (q.signT > 0) bits.push('✍ handtekening!'); else if (q.stunT > 0) bits.push('😵'); else if (q.slowT > 0) bits.push('🎂');
          bits.push(q.diveCd <= 0 ? 'B: duik klaar' : '');
        }
        const t = bits.filter(Boolean).join(' · '); if (t !== q.info) { q.info = t; hud.setPlayerInfo(q.p, t); }
      }
      hud.setScore(`${names[0]} rij ${P[0].row} – rij ${P[1].row} ${names[1]}`);
      for (let i = 0; i < 2; i++) { const f = clamp((START_Z - P[i].z) / (START_Z - FINISH_Z), 0, 1); dots[i].style.left = (f * 100) + '%'; }
    }
    function visuals(dt) {
      const bt = T0 + introT;
      poseAll(dt, bt);
      // kijkgat: de goede deur gloeit
      for (const q of P) {
        const gl = W.glow[q.p], w = rows[q.row];
        if (q.kijkT > 0 && w && !q.done) { const dr = door(q.p, q.row, w.real); gl.visible = !dr.pass; gl.position.set(dr.cx, 1.7, rowZ(q.row) + T / 2 + 0.2); gl.scale.setScalar(1 + Math.sin(bt * 8) * 0.06); gl.userData.arrow.position.y = 3.1 + Math.abs(Math.sin(bt * 6)) * 0.4; }
        else gl.visible = false;
        // kijkhoofd
        const hd = heads[q.p];
        if (q.peek) {
          const dr = door(q.p, q.peek.r, rows[q.peek.r].real), u = q.peek.t, pop = Math.min(1, u / 0.35) * (u > q.peek.dur - 0.35 ? Math.max(0, (q.peek.dur - u) / 0.35) : 1);
          hd.visible = pop > 0.01; hd.position.set(dr.cx, 0, rowZ(q.peek.r) + T / 2 - 0.1); hd.scale.setScalar(Math.max(0.01, 2.5 * pop * (1.4 - 0.4 * pop)));
          hd.userData.head.rotation.z = Math.sin(bt * 5) * 0.18; hd.userData.head.rotation.y = Math.sin(bt * 3) * 0.3; hd.userData.hand.rotation.z = Math.sin(bt * 12) * 0.5;
        } else hd.visible = false;
      }
      W.update(dt, bt, camTgt.z);
      placeCamera(dt, !camInit); camInit = true;
      hudInfo();
    }
    function runTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } }
    function resultUpdate(dt) { T0 += dt; runTimers(dt); for (const q of P) { q.vx = damp(q.vx, 0, 6, dt); q.vz = damp(q.vz, 0, 6, dt); } sandbagsUpdate(dt); chickensUpdate(dt); signersUpdate(dt); visuals(dt); }
    function introUpdate(dt) { introT += dt; for (const q of P) { q.c.pose = 'idle'; } visuals(dt); }

    function endRace(w, why) {
      if (finished) return; finished = true; winner = w;
      for (const q of P) { q.signT = 0; q.stunT = 0; q.chargeT = 0; q.diveT = 0; }
      const q = P[w], o = P[1 - w];
      hud.setTimer(null); hud.showBig(`${names[w]} wint!`, 1800, players[w].css); audio.sfx('win'); ctx.shake(0.4);
      for (let k = 0; k < 5; k++) later(k * 0.25, () => fx.particles.burst(q.x + rand(-4, 4), 6, q.z - 2, { count: 40, speed: 8, up: 1, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff4fa8, 0x4fd8ff, 0x8dff6a], gravity: 6 }));
      const tie = why !== 'finish' && P[0].row === P[1].row && Math.abs(prog(P[0]) - prog(P[1])) <= 0.05;
      const J = tie ? [`De tijd is om en niemand durfde echt ver... De Deurman gooit een munt op: ${names[w]} wint!`] : why === 'finish'
        ? [`${names[w]} stormt als eerste door de laatste deur en krijgt een hoge vijf van de Deurman!`, `${names[w]} wist de goede deuren (of had gewoon geluk). ${names[1 - w]} stond nog te kloppen.`, `De Deurman tekent een handtekening op ${names[w]}'s voorhoofd. ${names[1 - w]} krijgt een pleister.`]
        : [`De tijd is om! ${names[w]} kwam het verst (rij ${q.row} tegen rij ${o.row}).`, `${names[w]} was het verst toen de bel ging. De Deurman fluit af.`];
      const bits = [`${names[0]}: ${stats.wrong[0]}x een nepdeur`, `${names[1]}: ${stats.wrong[1]}x een nepdeur`];
      if (stats.kip[0] + stats.kip[1]) bits.push(`${stats.kip[0] + stats.kip[1]}x kip`); if (stats.taart[0] + stats.taart[1]) bits.push(`${stats.taart[0] + stats.taart[1]}x taart`); if (stats.sign[0] + stats.sign[1]) bits.push(`${stats.sign[0] + stats.sign[1]}x handtekening`); if (stats.sand[0] + stats.sand[1]) bits.push(`${stats.sand[0] + stats.sand[1]} zandzak-treffers`);
      const sc = why === 'finish' ? [w === 0 ? ROWS : P[0].row, w === 1 ? ROWS : P[1].row] : [P[0].row, P[1].row];
      ctx.finishPvp({ winner: w, score: sc, delay: 1500, summary: `${pick(J)} ${bits.join(' · ')}.` });
    }

    introUpdate(0.016);
    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onResize() { camera.updateProjectionMatrix(); },
      onCountdown() { for (const q of P) q.info = ''; },
      onStart() { for (const q of P) q.info = ''; bar.style.display = ''; },
      onSwap() { for (const q of P) fx.particles.burst(q.x, 2, q.z, { count: 24, speed: 4, up: 1, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 2 }); hud.toast('🔄 Wissel! Wes rent met Jor z\'n knoppen en andersom', 2200); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m || P[i].done) return; const q = P[i]; q.vz = 11; stun(q, 1.3, 'scared'); say(q.x, q.z, 'DEURMAN ZAG JE! Terug!', '#ff6a4a', 1.3, 3.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.35); });
      },
      celebrate(w) { P[w].c.pose = 'cheer'; P[w].cheerT = 999; P[1 - w].c.pose = 'sad'; },
      dispose() { bar.remove(); },
      dbg: {
        state: () => ({ T: T0, started, finished, timeLeft, rows, P: P.map((q) => ({ x: q.x, z: q.z, vx: q.vx, vz: q.vz, row: q.row, done: q.done, stunT: q.stunT, signT: q.signT, chargeCd: q.chargeCd, diveCd: q.diveCd, kijkT: q.kijkT, turboT: q.turboT, hiT: q.hiT, wrong: q.wrong, items: q.items, rad: q.rad })), stats: JSON.parse(JSON.stringify(stats)), sandbags: sandbags.length, doors: W.doors.map((lane) => lane.map((row) => row.map((d) => ({ cx: d.cx, pass: !!d.pass, fake: d.fake, real: d.real, marked: d.mark.visible })))), orbs: W.orbs.map((l) => l.map((o) => ({ x: o.x, z: o.z, alive: o.alive, kind: o.kind }))) }),
        setTime(s) { raceT = RACE_T - s; },
        put(p, z, row) { P[p].z = z; if (row != null) P[p].row = row; },
        give(p, kind) { giveItem(P[p], { kind, alive: true, x: P[p].x, z: P[p].z, pop: 0 }); },
        peek(p) { P[p].peekT = 0; },
        hit(p, d) { hitDoor(P[p], door(p, P[p].row, d)); },
      },
    };
  },
};

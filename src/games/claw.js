import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildWorld, CB, prizeGeo, BULB_COLS } from './claw_world.js';

// Grijpkraan-Gekte — duel: één reusachtige kermis-grijpkast met twee wiebelige klauwen en één hoop prijzen.
//  * richtingen = klauw sturen, A = zakken (en daarna op tijd nog eens A = krachtiger grijpen), A met prijs = loslaten
//  * B = RUK (schudt de klauw van je broer los en de hoop in de war) — met een prijs in je klauw: KRACHTGRIP (even niet te schudden)
//  * prijzen zijn punten waard, pas op voor bommen (tikken!) en de Deurman-pop (min punten). Wie na 75 s het meest heeft, wint.
//  * gimmicks: een kip die in de kast springt, een kroon op de lopende band, de laatste 15 s tellen dubbel

const { X, ZB, ZF, CEIL, HOLE_W, HOLE_D } = CB;
const HOLE_Z0 = ZF - HOLE_D;
const MATCH_TIME = 75, DOUBLE_AT = 15, FUSE_T = 4.0;
const TROLLEY_Y = CEIL - 0.55, HUB_TOP = 7.3;
const GRAV = -27;
const BELT_V = 2.5;
const SWING_K = 20, SWING_KA = 0.17;
const SLIP_BASE = 0.05;

// type: aantal, waarde, straal, gewicht
const TYPES = {
  teddy: { n: 7, val: 10, r: 0.84, w: 1.0, name: 'Knuffel' },
  teddy2: { n: 6, val: 10, r: 0.84, w: 1.0, name: 'Knuffel' },
  eend: { n: 6, val: 8, r: 0.7, w: 0.7, name: 'Badeend' },
  bal: { n: 7, val: 5, r: 0.62, w: 0.5, name: 'Bal', tint: true },
  kist: { n: 5, val: 25, r: 0.84, w: 2.0, name: 'Schatkist' },
  goudkip: { n: 2, val: 50, r: 0.72, w: 1.3, name: 'Gouden kip', metal: true },
  bom: { n: 3, val: -25, r: 0.66, w: 1.5, name: 'Bom', tint: true },
  deurman: { n: 2, val: -15, r: 0.72, w: 1.2, name: 'Deurman-pop' },
  kroon: { n: 0, cap: 3, val: 60, r: 0.64, w: 0.6, name: 'Kroon', metal: true },
};
const PS = 1.2; for (const d of Object.values(TYPES)) d.r *= PS;
const BALL_TINTS = [0xff4a4a, 0xffd23f, 0x4a9aff, 0x6aff7a, 0xff8a1c, 0xd070ff];
const _ax = new THREE.Vector3(), _dq = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _yq = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1), _sP = new THREE.Vector3(PS, PS, PS), _s0 = new THREE.Vector3(0, 0, 0), _up = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();
const labelCache = new Map();
function labelTex(text, color) {
  const k = text + color; let t = labelCache.get(k);
  if (!t) {
    t = canvasTex(256, 64, (g, w, h) => { g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(10,5,30,.92)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2, w - 8); g.fillStyle = color; g.fillText(text, w / 2, h / 2, w - 8); });
    labelCache.set(k, t);
  }
  return t;
}

export default {
  id: 'claw',
  name: 'Grijpkraan-Gekte',
  giver: 'Kermisman Kees',
  icon: '🕹️',
  mode: 'pvp',
  time: 75,
  music: 'game_fast',
  blurb: 'Eén <b>grijpkast</b>, twee wiebelige klauwen! Laat <b>knuffels, kisten en gouden kippen</b> in <b>jouw gat</b> vallen. Pas op voor <b>bommen</b> (tikken!) en de <b>Deurman-pop</b> (min punten). Meeste punten na 75 s wint.',
  controls: ['{move} klauw sturen', '{a} zakken (2e keer = sterker)', '{a} met prijs = loslaten', '{b} RUK je broer / KRACHTGRIP'],
  tip: 'Een bom naar het gat van je broer slepen? Hij tikt!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const SLIP = pv.slip || 0, GR = pv.gravity || 1;
    const L = ctx.lights('night', { shadow: 17, center: [0, 5, 0], fogNear: 90, fogFar: 220 });
    L.sun.position.set(5, 34, 22); L.sun.intensity = 1.5; L.sun.color.set(0xffe8ff);
    L.hemi.intensity = 1.45; L.hemi.color.set(0xb8a8ff); L.hemi.groundColor.set(0x6a4a8a);
    const W = buildWorld(ctx, L);

    // ---------------- prijzen (geïnstancet) ----------------
    const prizes = []; const tintMap = {};
    const matStd = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const matMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.75, emissive: 0x553300, emissiveIntensity: 0.4 });
    for (const [key, d] of Object.entries(TYPES)) {
      d.key = key; d.cap = d.cap || d.n;
      d.im = new THREE.InstancedMesh(prizeGeo(key), d.metal ? matMetal : matStd, Math.max(1, d.cap));
      d.im.castShadow = true; d.im.receiveShadow = true; d.im.frustumCulled = false; d.im.userData.dynamic = true;
      for (let i = 0; i < d.im.count; i++) { d.im.setMatrixAt(i, _m.makeScale(0, 0, 0)); d.im.setColorAt(i, _col.set(0xffffff)); }
      d.im.instanceColor.needsUpdate = true; scene.add(d.im);
      d.pool = [];
      for (let i = 0; i < d.im.count; i++) {
        const p = { type: key, d, idx: i, alive: false, held: -1, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, r: d.r, w: d.w, val: d.val, tilt: new THREE.Quaternion(), yaw: 0, gr: false, fuse: -1, im: d.im, wob: Math.random() * 6, tint: 0xffffff, flash: 0, tickN: 0 };
        d.pool.push(p); prizes.push(p);
      }
    }
    // levende kip (geen instance): Animal-model
    const chickens = [];
    for (let k = 0; k < 2; k++) {
      const a = new Animal('chicken'); a.group.scale.setScalar(2.3); a.group.visible = false; scene.add(a.group);
      const p = { type: 'kip', d: { key: 'kip', name: 'Kip' }, alive: false, held: -1, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, r: 0.58 * PS, w: 0.6, val: 20, tilt: new THREE.Quaternion(), yaw: 0, gr: false, fuse: -1, obj: a, wob: 0, ai: 0, flash: 0 };
      chickens.push(p); prizes.push(p);
    }
    function spawn(key, x, y, z, vx = 0, vy = 0, vz = 0) {
      const d = TYPES[key]; const p = d ? d.pool.find((q) => !q.alive) : chickens.find((q) => !q.alive);
      if (!p) return null;
      Object.assign(p, { alive: true, held: -1, x, y, z, vx, vy, vz, fuse: -1, flash: 0, gr: false, yaw: Math.random() * TAU, ai: 0 });
      p.tilt.identity();
      if (p.type === 'bal') { p.tint = pick(BALL_TINTS); p.im.setColorAt(p.idx, _col.set(p.tint)); p.im.instanceColor.needsUpdate = true; }
      if (p.type === 'bom') { p.im.setColorAt(p.idx, _col.set(0xffffff)); p.im.instanceColor.needsUpdate = true; }
      if (p.obj) p.obj.group.visible = true;
      return p;
    }
    function kill(p) { p.alive = false; p.held = -1; p.y = -50; if (p.obj) p.obj.group.visible = false; else p.im.setMatrixAt(p.idx, _m.makeScale(0, 0, 0)), (p.im.instanceMatrix.needsUpdate = true); }

    // ---------------- toestand ----------------
    const score = [0, 0], counts = [0, 0];
    let T = 0, introT = 0, timeLeft = MATCH_TIME, finished = false, started = false, over = false, overT = 0;
    let beltDir = 1, beltPrizeT = 0, glassShake = 0, doubleOn = false, banner = 0;
    const stats = { grabs: [0, 0], slips: [0, 0], perfects: [0, 0], rucks: [0, 0], bombs: 0, deurmans: 0, chickens: 0, crowns: 0, powers: [0, 0], stolen: [0, 0] };
    const lastTxt = ['', ''];
    const events = [
      { t: 13 + rand(0, 5), f: () => spawnChicken() },
      { t: 24 + rand(0, 3), f: () => spawnCrown() },
      { t: 40 + rand(0, 5), f: () => spawnChicken() },
      { t: 53 + rand(0, 3), f: () => spawnCrown() },
      { t: 33 + rand(0, 3), f: () => rain(7, true) },
    ];
    let refillT = 12;

    // ---------------- hoop vullen en laten bezinken ----------------
    {
      const list = [];
      for (const [key, d] of Object.entries(TYPES)) for (let i = 0; i < d.n; i++) list.push(key);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(ctx.rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      list.forEach((key, i) => spawn(key, (ctx.rng() - 0.5) * 12, 1.2 + (i % 4) * 1.5 + ctx.rng() * 0.5, -2.2 + ctx.rng() * 4.4));
      for (let rep = 0; rep < 3; rep++) {
        for (let k = 0; k < 240; k++) stepPhys(1 / 60, true);
        for (const p of prizes) if (p.alive && (p.y < -0.3 || holeSide(p.x, p.z) >= 0)) { p.x = (ctx.rng() - 0.5) * 8; p.z = -1.5 + ctx.rng() * 3; p.y = 5 + ctx.rng() * 3; p.vx = p.vy = p.vz = 0; }
      }
      for (let k = 0; k < 120; k++) stepPhys(1 / 60, true);
      for (const p of prizes) if (p.alive) { p.vx = p.vy = p.vz = 0; }
    }

    // ---------------- fysica ----------------
    function holeSide(x, z) { if (z < HOLE_Z0 + 0.3) return -1; if (x < -(X - HOLE_W + 0.3)) return 0; if (x > X - HOLE_W + 0.3) return 1; return -1; }
    function stepPhys(dt, quiet = false) {
      const g = GRAV * GR;
      const n = prizes.length;
      for (let i = 0; i < n; i++) {
        const p = prizes[i]; if (!p.alive || p.held >= 0) continue;
        p.vy += g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const hs = holeSide(p.x, p.z);
        // wanden
        if (p.x < -X + p.r) { p.x = -X + p.r; if (p.vx < 0) p.vx *= -0.3; } else if (p.x > X - p.r) { p.x = X - p.r; if (p.vx > 0) p.vx *= -0.3; }
        if (p.z < ZB + p.r) { p.z = ZB + p.r; if (p.vz < 0) p.vz *= -0.3; } else if (p.z > ZF - p.r) { p.z = ZF - p.r; if (p.vz > 0) p.vz *= -0.3; }
        // vloer
        p.gr = false;
        if (hs < 0 && p.y < p.r) {
          p.y = p.r; if (p.vy < 0) { p.vy = p.vy < -3 ? -p.vy * 0.22 : 0; }
          p.gr = true;
          const f = Math.exp(-3.4 * dt); p.vx *= f; p.vz *= f;
          if (p.z < ZB + 1.2 && p.y < p.r + 0.1) { const k = 1 - Math.exp(-5 * dt); p.vx += (beltDir * BELT_V - p.vx) * k; p.vz += (0 - p.vz) * k * 0.3; p.onBelt = true; } else p.onBelt = false;
        }
        const sp2 = p.vx * p.vx + p.vz * p.vz;
        if (sp2 < 0.2 && p.gr) { const f = Math.exp(-5 * dt); p.vx *= f; p.vz *= f; }
        else { const f = Math.exp(-0.12 * dt); p.vx *= f; p.vz *= f; }
      }
      // botsingen
      for (let i = 0; i < n; i++) {
        const a = prizes[i]; if (!a.alive || a.held >= 0) continue;
        for (let j = i + 1; j < n; j++) {
          const b = prizes[j]; if (!b.alive || b.held >= 0) continue;
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, rr = a.r + b.r;
          if (dx > rr || dx < -rr || dz > rr || dz < -rr || dy > rr || dy < -rr) continue;
          const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= rr * rr || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, pen = rr - d;
          const wa = 1 / a.w, wb = 1 / b.w, ws = wa + wb;
          const ka = wa / ws, kb = wb / ws;
          a.x -= nx * pen * ka; a.y -= ny * pen * ka; a.z -= nz * pen * ka;
          b.x += nx * pen * kb; b.y += ny * pen * kb; b.z += nz * pen * kb;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
          if (vn < 0) {
            const e = vn < -2.5 ? 0.2 : 0, jn = -(1 + e) * vn / ws;
            a.vx -= jn * wa * nx; a.vy -= jn * wa * ny; a.vz -= jn * wa * nz;
            b.vx += jn * wb * nx; b.vy += jn * wb * ny; b.vz += jn * wb * nz;
            // wrijving: tangentiële snelheid dempen
            const tx = (b.vx - a.vx) - ((b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz) * nx;
            const ty = (b.vy - a.vy) - ((b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz) * ny;
            const tz = (b.vz - a.vz) - ((b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz) * nz;
            const fr = Math.min(1, 0.9 * dt * 10) * 0.35;
            a.vx += tx * fr * ka; a.vy += ty * fr * ka; a.vz += tz * fr * ka; b.vx -= tx * fr * kb; b.vy -= ty * fr * kb; b.vz -= tz * fr * kb;
            if (!quiet && vn < -4 && Math.random() < 0.4) audio.sfx('wood', { vol: 0.12, rate: 1.3 + Math.random() * 0.4 });
          }
        }
      }
      // in de put? -> scoren
      if (!quiet) for (const p of prizes) {
        if (p.alive && p.held < 0 && p.y < -2.4) collect(p.x < 0 ? 0 : 1, p);
        else if (p.alive && p.held < 0 && p.onBelt && Math.abs(p.x) > X - 0.9 && p.z < ZB + 1.3) {
          fx.particles.burst(p.x, 0.8, p.z, { count: 10, speed: 3, up: 1, life: 0.5, size: 0.35, color: 0xcccccc, gravity: 4 });
          if (p.type === 'kroon') fx.texts.add('WEG!', p.x - Math.sign(p.x) * 1.5, 2.2, p.z + 1, '#ff8a8a', 1.1);
          kill(p);
        }
      }
    }
    function topAt(x, z, rad) {
      let top = 0;
      for (const p of prizes) {
        if (!p.alive || p.held >= 0) continue;
        const d = Math.hypot(p.x - x, p.z - z); if (d > rad + p.r) continue;
        const dm = Math.max(0, d - rad); const yy = p.y + Math.sqrt(Math.max(0, p.r * p.r - dm * dm));
        if (yy > top) top = yy;
      }
      return top;
    }

    // ---------------- scoren ----------------
    function addScore(i, v, x, z, label) {
      score[i] += v;
      fx.texts.add((v > 0 ? '+' : '') + v, x, 2.6, z, v > 0 ? '#ffe14a' : '#ff6a6a', 1.5);
      refreshHud(); redrawBoard(i);
    }
    function collect(i, p) {
      const mult = doubleOn ? 2 : 1; const cx = (i ? 1 : -1) * (X - HOLE_W / 2), cz = (HOLE_Z0 + ZF) / 2;
      const v = p.val * mult; const key = p.type;
      kill(p);
      if (key === 'bom') {
        stats.bombs++; addScore(i, v, cx, cz); explode(cx, 0.5, cz, -1); fx.texts.add('BOEM!', cx, 4.2, cz, '#ff9a3a', 1.6);
        chars[i].c.pose = 'sad'; chars[i].poseT = 1.5;
      } else if (key === 'deurman') {
        stats.deurmans++; addScore(i, v, cx, cz); audio.sfx('bad'); audio.sfx('scare', { vol: 0.25 }); ctx.shake(0.4); chars[i].c.pose = 'scared'; chars[i].poseT = 1.4;
        fx.texts.add('DEURMAN!', cx, 4.2, cz, '#c8b8ff', 1.4);
      } else {
        counts[i]++; addScore(i, v, cx, cz); audio.sfx(v >= 25 ? 'sparkle' : 'coin'); chars[i].c.pose = 'cheer'; chars[i].poseT = 1.2;
        fx.particles.burst(cx, 1.5, cz, { count: v >= 25 ? 26 : 12, speed: 5, up: 2, life: 0.9, size: 0.34, colors: v >= 25 ? [0xffe14a, 0xffffff, 0xff9ad5] : [0xffe14a, 0xffffff], gravity: 5 });
        if (key === 'goudkip' || key === 'kroon') fx.texts.add(TYPES[key].name.toUpperCase() + '!', cx, 4.6, cz, '#ffe14a', 1.3);
        W.lamps[i].material.opacity = 1.4;
      }
    }
    function explode(x, y, z, byClaw) {
      fx.particles.burst(x, y + 0.6, z, { count: 46, speed: 10, up: 1.4, life: 0.9, size: 0.7, colors: [0xff9a3a, 0xffe14a, 0xff4a2a, 0x555555], gravity: 3 });
      fx.particles.ring(x, y + 0.5, z, { count: 22, speed: 8, life: 0.5, size: 0.4, color: 0xffe9a0 });
      audio.sfx('explode'); ctx.shake(0.75); glassShake = Math.max(glassShake, 1);
      for (const p of prizes) {
        if (!p.alive || p.held >= 0) continue;
        const dx = p.x - x, dy = p.y - y, dz = p.z - z, d = Math.hypot(dx, dy, dz); if (d > 4.2) continue;
        const k = (1 - d / 4.2) * 15 / p.w, dd = d + 0.01;
        p.vx += dx / dd * k; p.vy += (dy / dd * 0.5 + 0.9) * k * 0.9; p.vz += dz / dd * k;
      }
      for (const c of claws) {
        if (Math.hypot(c.hx - x, c.hz - z) < 4.2 && c.hy - 1 < y + 6 && c.hy > y - 2 && Math.hypot(c.hx - x, c.hy - y, c.hz - z) < 6) {
          if (c.hold) releasePrize(c, 'BOEM!'); c.stun = 1.2; c.wx += (Math.random() - 0.5) * 6; c.wz += (Math.random() - 0.5) * 6;
        }
      }
    }
    function bombLit(p) { return p.fuse > 0; }

    // ---------------- klauwen ----------------
    const clawMat = (i) => new THREE.MeshStandardMaterial({ color: 0xc8ccd8, roughness: 0.35, metalness: 0.75, emissive: 0x000000 });
    const claws = players.map((pp, i) => {
      const sd = i ? 1 : -1, col = PLAYER_COLORS[i];
      const sc = lerp(1, pv.size(i), 0.55) * 1.25;
      const cm = clawMat(i);
      const band = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.2, emissive: col, emissiveIntensity: 0.25 });
      const grp = new THREE.Group(); grp.scale.setScalar(sc);
      grp.add(mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.55, 12), cm, { pos: [0, 0, 0] }));
      grp.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 12), band, { pos: [0, 0.12, 0] }));
      grp.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), cm, { pos: [0, 0.38, 0] }));
      grp.add(mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 10), cm, { cast: false, pos: [0, 0.62, 0], rot: [Math.PI / 2, 0, 0] }));
      const fingers = [];
      for (let k = 0; k < 3; k++) {
        const holder = new THREE.Group(); holder.rotation.y = k / 3 * TAU; holder.position.y = -0.2; grp.add(holder);
        const pivot = new THREE.Group(); pivot.position.z = 0.42; holder.add(pivot);
        pivot.add(mesh(new THREE.BoxGeometry(0.2, 1.05, 0.13), cm, { pos: [0, -0.5, 0] }));
        const elbow = new THREE.Group(); elbow.position.y = -1.0; pivot.add(elbow);
        elbow.add(mesh(new THREE.ConeGeometry(0.11, 0.9, 5), cm, { pos: [0, -0.4, 0] }));
        fingers.push({ pivot, elbow });
      }
      scene.add(grp);
      const cable = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5), mat(0x222233), { cast: false, receive: false }); scene.add(cable);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.55, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.renderOrder = 4; scene.add(beam);
      const aim = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.98, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide })); aim.rotation.x = -Math.PI / 2; aim.renderOrder = 12; scene.add(aim);
      const tring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide })); tring.rotation.x = -Math.PI / 2; tring.renderOrder = 13; tring.visible = false; scene.add(tring);
      const tcore = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.05, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide })); tcore.rotation.x = -Math.PI / 2; tcore.renderOrder = 14; tcore.visible = false; scene.add(tcore);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(' ', '#fff'), transparent: true, depthTest: false })); lab.scale.set(4.2, 1.05, 1); lab.renderOrder = 15; scene.add(lab);
      const home = [sd * 8.0, 0.6];
      return { i, sd, sc, grp, fingers, cable, beam, aim, tring, tcore, lab, cm, band, col, x: home[0], z: home[1], vx: 0, vz: 0, ax: 0, az: 0, thx: 0, thz: 0, wx: 0, wz: 0, hy: HUB_TOP, hx: home[0], hz: home[1], state: 'idle', t: 0, hold: null, strength: 0.4, pressT: -1, cdB: 0, powerT: 0, stun: 0, g: 0, gTarget: 0, rg: 1.4 * sc, lastLab: '', assist: false, openT: 0, speedAbs: 0, perfectT: 0 };
    });
    const board = [0, 1].map((i) => null);

    // ---------------- poppetjes naast de kast ----------------
    const chars = players.map((pp, i) => {
      const sd = i ? 1 : -1; const c = makeBrother(i); const k = 5.2 / c.height; const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(k);
      holder.position.set(sd * 15.0, -4.2, ZF + 3.0); scene.add(holder);
      c.faceDir(-sd * 0.8, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; c.pose = 'carry';
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(3.2, 1.2, 1); tag.position.set(sd * 15.0, 1.9, ZF + 3.0); tag.renderOrder = 15; scene.add(tag);
      return { c, holder, poseT: 0 };
    });

    // ---------------- scorebordjes op de kast ----------------
    const boardTex = [0, 1].map(() => null);
    function redrawBoard(i) {
      const b = board[i]; if (!b) return;
      const g = b.g, w = 320, h = 160;
      g.fillStyle = '#12081e'; g.fillRect(0, 0, w, h); g.strokeStyle = players[i].css; g.lineWidth = 8; g.strokeRect(5, 5, w - 10, h - 10);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.fillStyle = players[i].css; g.fillText(names[i].toUpperCase(), w / 2, 36);
      g.font = 'bold 84px Fredoka, Arial Black, sans-serif'; g.fillStyle = score[i] < 0 ? '#ff6a6a' : '#ffe14a'; g.fillText(String(score[i]), w / 2, 100);
      g.font = 'bold 26px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#9ac8ff'; g.fillText(`${counts[i]} prijzen`, w / 2, 144);
      b.tex.needsUpdate = true;
    }
    for (let i = 0; i < 2; i++) {
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 160; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      board[i] = { g: cv.getContext('2d'), tex };
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: tex })); pl.position.set((i ? 1 : -1) * 8.2, -1.6, ZF + 3.36); scene.add(pl);
      redrawBoard(i);
    }
    // gat-zuilen (waar je moet loslaten)
    const columns = [0, 1].map((i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(HOLE_W - 0.3, CEIL - 1, HOLE_D - 0.3), new THREE.MeshBasicMaterial({ color: i ? 0x58a0ff : 0x58ff9a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set((i ? 1 : -1) * (X - HOLE_W / 2), CEIL / 2 + 0.5, (HOLE_Z0 + ZF) / 2); m.renderOrder = 3; scene.add(m); return m;
    });

    // ---------------- camera ----------------
    const tgt = new THREE.Vector3(0, 2.4, 1.0), PITCH = 0.4, camDir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const fitPts = [[-X - 1.8, -4.2, ZF + 3.6], [X + 1.8, -4.2, ZF + 3.6], [-X - 1.8, CEIL + 0.6, ZB], [X + 1.8, CEIL + 0.6, ZB], [-16.6, 1.2, ZF + 3.0], [16.6, 1.2, ZF + 3.0], [-16.6, -4.2, ZF + 3.0], [16.6, -4.2, ZF + 3.0]];
    let camD = 40;
    function fitCamera() {
      const v = new THREE.Vector3(); let lo = 12, hi = 120;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(camDir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.97 || v.y > 0.8 || v.y < -0.96) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camD = hi; camera.position.copy(tgt).addScaledVector(camDir, camD); camera.lookAt(tgt);
    }
    camera.fov = 46; camera.aspect = (ctx.renderer.domElement.width || 1100) / (ctx.renderer.domElement.height || 650); camera.updateProjectionMatrix(); fitCamera();

    // ---------------- acties ----------------
    function say(i, text, color = '#ffe14a', s = 1.1) { const c = claws[i]; fx.texts.add(text, c.hx, Math.min(c.hy + 1.4, CEIL - 0.4), c.hz + 0.5, color, s); }
    function releasePrize(c, why) {
      const p = c.hold; if (!p) return;
      p.held = -1; p.vx = c.vx * 0.9 + (Math.random() - 0.5) * 1.5; p.vz = c.vz * 0.9 + (Math.random() - 0.5) * 1.5; p.vy = 1;
      c.hold = null; c.powerT = 0;
      if (why) say(c.i, why, '#ff9a9a');
    }
    function startFuse(p) {
      if (p.type !== 'bom' || p.fuse > 0) return;
      p.fuse = FUSE_T; p.tickN = Math.ceil(FUSE_T); audio.sfx('buzz', { vol: 0.5, rate: 1.6 }); fx.texts.add('TIK TIK!', p.x, p.y + 1.7, p.z, '#ff9a3a', 1.3);
    }
    function tryGrab(c) {
      const hx = c.hx, hz = c.hz;
      let best = null, bd = 1e9;
      for (const p of prizes) {
        if (!p.alive || p.held >= 0) continue;
        const d = Math.hypot(p.x - hx, p.z - hz);
        if (d > c.rg + p.r * 0.25) continue;
        if (p.y < c.hy - 2.6 || p.y > c.hy + 0.2) continue;
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) { say(c.i, 'NIKS!', '#c8c8d8', 1.0); audio.sfx('miss', { vol: 0.5 }); return; }
      const acc = 1 - clamp(bd / (c.rg + 0.3), 0, 1) * 0.75;
      const lead = score[1 - c.i] - score[c.i];
      c.assist = lead >= 25;
      let pr = 0.2 + c.strength * acc * (1.12 - 0.3 * best.w) + (c.assist ? 0.12 : 0);
      if (best.type === 'kip') pr -= 0.12;
      pr = clamp(pr, 0.12, 0.97);
      if (Math.random() < pr) {
        c.hold = best; best.held = c.i; stats.grabs[c.i]++; startFuse(best);
        say(c.i, c.strength > 0.88 ? 'STEVIG!' : 'GEGRABBELD!', c.strength > 0.88 ? '#7affb0' : '#ffe14a', 1.0); audio.sfx('click', { vol: 0.7 });
        if (best.type === 'kip') { audio.sfx('boing', { vol: 0.5, rate: 1.5 }); fx.particles.burst(hx, c.hy - 1, hz, { count: 10, speed: 3, up: 1, life: 0.8, size: 0.25, colors: [0xffffff, 0xf0e8d0], gravity: 3 }); }
      } else {
        stats.slips[c.i]++; say(c.i, 'SLIP!', '#ff9a9a', 1.2); audio.sfx('pop', { vol: 0.6, rate: 0.7 });
        best.vy = 3.5; best.vx += (Math.random() - 0.5) * 3; best.vz += (Math.random() - 0.5) * 3;
      }
    }
    function ruk(c) {
      const o = claws[1 - c.i];
      c.cdB = 4.0; stats.rucks[c.i]++;
      audio.sfx('thud', { vol: 0.8 }); audio.sfx('buzz', { vol: 0.3, rate: 1.4 }); ctx.shake(0.35); glassShake = Math.max(glassShake, 0.8);
      c.wx += (Math.random() - 0.5) * 5; c.wz += (Math.random() - 0.5) * 5;
      fx.particles.ring(c.hx, Math.max(0.5, c.hy - 1.2), c.hz, { count: 16, speed: 6, life: 0.4, size: 0.3, color: c.col });
      // hoop door elkaar schudden
      for (const p of prizes) {
        if (!p.alive || p.held >= 0) continue;
        const dx = p.x - c.hx, dz = p.z - c.hz, d = Math.hypot(dx, dz); if (d > 3.4 || p.y > c.hy) continue;
        const k = (1 - d / 3.4);
        p.vy += (4 + 6 * k) / p.w; p.vx += (dx / (d + 0.1)) * 3 * k; p.vz += (dz / (d + 0.1)) * 3 * k;
      }
      // de klauw van de ander
      const d = Math.hypot(o.hx - c.hx, o.hz - c.hz);
      if (d < 5.2 && o.hold) {
        if (o.powerT > 0) { say(o.i, 'KRACHT!', '#7affb0', 1.2); audio.sfx('ding'); o.wx += (Math.random() - 0.5) * 3; }
        else { releasePrize(o, 'GERUKT!'); stats.stolen[o.i]++; ctx.shake(0.5); audio.sfx('hurt', { vol: 0.5 }); chars[o.i].c.pose = 'scared'; chars[o.i].poseT = 0.9; chars[c.i].c.pose = 'cheer'; chars[c.i].poseT = 0.8; }
      }
      if (d < 6) { o.wx += (Math.random() - 0.5) * 6; o.wz += (Math.random() - 0.5) * 6; }
    }
    function updateClaw(c, dt) {
      const inp = pv.input(c.i), o = claws[1 - c.i];
      const tm = clamp(pv.speed(c.i), 0.65, 1.6);
      c.cdB = Math.max(0, c.cdB - dt); c.powerT = Math.max(0, c.powerT - dt); c.stun = Math.max(0, c.stun - dt); c.perfectT = Math.max(0, c.perfectT - dt);
      const busy = c.state === 'drop' || c.state === 'close' || c.state === 'rise';
      const locked = busy || c.stun > 0;
      // beweging
      const sp = 7.6 * tm;
      const tx = locked ? 0 : inp.x * sp, tz = locked ? 0 : inp.y * sp;
      const lam = locked ? 12 : lerp(9, 1.3, SLIP);
      const pvx = c.vx, pvz = c.vz;
      const k = 1 - Math.exp(-lam * dt);
      c.vx += (tx - c.vx) * k; c.vz += (tz - c.vz) * k;
      c.ax = (c.vx - pvx) / Math.max(dt, 1e-3); c.az = (c.vz - pvz) / Math.max(dt, 1e-3);
      const mg = 0.55 + 0.45 * c.sc;
      c.x = clamp(c.x + c.vx * dt, -X + mg, X - mg); c.z = clamp(c.z + c.vz * dt, ZB + mg + 0.1, ZF - mg);
      c.speedAbs = Math.hypot(c.vx, c.vz);
      // pendulum
      const Cd = (c.state === 'drop' || c.state === 'close') ? 8 : lerp(2.4, 0.7, SLIP);
      c.wx += (-SWING_K * c.thx - Cd * c.wx - c.ax * SWING_KA) * dt; c.wz += (-SWING_K * c.thz - Cd * c.wz - c.az * SWING_KA) * dt;
      if (c.stun > 0) { c.wx += (Math.random() - 0.5) * 30 * dt; c.wz += (Math.random() - 0.5) * 30 * dt; }
      c.thx = clamp(c.thx + c.wx * dt, -0.42, 0.42); c.thz = clamp(c.thz + c.wz * dt, -0.42, 0.42);
      const Lc = TROLLEY_Y - c.hy;
      c.hx = clamp(c.x + Math.sin(c.thx) * Lc, -X + 0.6, X - 0.6); c.hz = clamp(c.z + Math.sin(c.thz) * Lc, ZB + 0.5, ZF - 0.5);

      // toestanden
      const A = inp.aP && c.stun <= 0, Bp = inp.bP && c.stun <= 0;
      if (c.state === 'idle') {
        c.gTarget = 0;
        if (A) { c.state = 'drop'; c.t = 0; audio.sfx('whoosh', { vol: 0.4, rate: 0.8 }); c.pressT = -1; c.gTarget = 0; }
      } else if (c.state === 'drop') {
        const vd = 10.5 * tm, ny = c.hy - vd * dt;
        const top = topAt(c.hx, c.hz, 0.6 * c.sc);
        c.t += dt;
        if (ny - 0.55 <= top + 0.02 || ny <= 0.6) {
          c.hy = Math.max(0.6, top + 0.57); c.state = 'close'; c.t = 0; c.pressT = -1; audio.sfx('thud', { vol: 0.35, rate: 1.6 });
          for (const p of prizes) if (p.alive && p.held < 0 && Math.hypot(p.x - c.hx, p.z - c.hz) < 0.9) p.vy -= 1.2;
          fx.particles.dust(c.hx, c.hy - 0.5, c.hz, 4, 0xe0d0ff);
        } else c.hy = ny;
      } else if (c.state === 'close') {
        c.t += dt;
        if (A && c.pressT < 0 && c.t > 0.04) c.pressT = c.t;
        c.gTarget = smoothstep(0.3, 0.74, c.t);
        if (c.t >= 0.78) {
          if (c.pressT >= 0) { const e = Math.abs(c.pressT - 0.62); c.strength = 1 - Math.min(e / 0.42, 1) * 0.62; if (e < 0.075) { c.strength = 1; c.perfectT = 0.8; stats.perfects[c.i]++; } }
          else c.strength = 0.38;
          c.gTarget = 1; tryGrab(c);
          if (c.strength >= 1 && c.perfectT > 0) { fx.particles.burst(c.hx, c.hy - 1, c.hz, { count: 12, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0x7affb0, 0xffffff], gravity: 2 }); audio.sfx('sparkle', { vol: 0.5 }); }
          c.state = 'rise'; c.t = 0;
        }
      } else if (c.state === 'rise') {
        c.hy = Math.min(HUB_TOP, c.hy + 9.2 * tm * dt);
        if (c.hy >= HUB_TOP) { c.state = c.hold ? 'carry' : 'idle'; c.t = 0; if (!c.hold) c.gTarget = 0; }
      } else if (c.state === 'carry') {
        if (A) { const p = c.hold; releasePrize(c); c.state = 'open'; c.t = 0; c.gTarget = 0; audio.sfx('click', { vol: 0.5, rate: 0.8 }); void p; }
      } else if (c.state === 'open') {
        c.t += dt; c.gTarget = 0; if (c.t > 0.3) { c.state = 'idle'; c.t = 0; }
      }
      // B
      if (Bp && c.stun <= 0 && !(c.state === 'close' && c.t < 0.05)) {
        if (c.cdB > 0) { audio.sfx('click2', { vol: 0.4 }); }
        else if (c.hold) { c.powerT = 2.2; c.cdB = 5.0; stats.powers[c.i]++; say(c.i, 'KRACHTGRIP!', '#7affb0', 1.1); audio.sfx('powerup', { vol: 0.5 }); fx.particles.burst(c.hx, c.hy - 1, c.hz, { count: 12, speed: 3, up: 1, life: 0.6, size: 0.28, colors: [0x7affb0, 0xffffff], gravity: 1 }); }
        else ruk(c);
      }
      // gegrepen prijs volgt de klauw; kan glippen
      if (c.hold) {
        const p = c.hold; const hang = 1.1 * c.sc + p.r * 0.35;
        p.x = c.hx + Math.sin(c.thx) * 0.3; p.y = c.hy - 0.3 - hang; p.z = c.hz + Math.sin(c.thz) * 0.3; p.vx = p.vy = p.vz = 0;
        p.y = Math.max(p.y, p.r);
        if (c.powerT <= 0) {
          const rate = (SLIP_BASE + 0.22 * (1 - c.strength)) * p.w * (p.type === 'kip' ? 3.2 : 1) * (c.assist ? 0.65 : 1) * (1 + SLIP * 0.6);
          const jerk = Math.max(0, Math.hypot(c.ax, c.az) - 16) * 0.004;
          if (Math.random() < (rate + jerk) * dt * (c.state === 'rise' ? 1.3 : 1)) { stats.slips[c.i]++; releasePrize(c, 'GLIPT!'); audio.sfx('pop', { vol: 0.6, rate: 0.7 }); if (c.state === 'carry') { c.state = 'idle'; c.gTarget = 0; } else if (c.state === 'rise') c.gTarget = 0.0; }
        }
        // bom lit: de klauw trilt
        if (p.type === 'bom' && p.fuse > 0) { c.wx += (Math.random() - 0.5) * 12 * dt; c.wz += (Math.random() - 0.5) * 12 * dt; }
      }
      if (c.state === 'idle' && c.hold) { c.hold = null; }
      c.g = damp(c.g, c.gTarget, 14, dt);
    }

    // ---------------- gimmicks ----------------
    function spawnChicken() {
      const p = spawn('kip', (Math.random() - 0.5) * 8, CEIL - 1.2, -1 + Math.random() * 2.4, (Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 3);
      if (!p) return; stats.chickens++;
      fx.texts.add('KIP IN DE KAST!', 0, CEIL - 2.2, 2, '#fff3a0', 1.6); audio.sfx('boing', { vol: 0.7, rate: 1.3 }); audio.sfx('note', { vol: 0.4, rate: 2 });
      fx.particles.burst(p.x, CEIL - 1.2, p.z, { count: 14, speed: 4, up: 1, life: 1.0, size: 0.3, colors: [0xffffff, 0xf0e8d0], gravity: 2 });
      hud.toast('🐔 Een kip springt in de kast!', 1800);
    }
    function spawnCrown() {
      const lead = score[1] - score[0];
      beltDir = Math.abs(lead) >= 15 ? (lead > 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);   // achterstaander krijgt hem eerst
      // beltDir>0: kroon rijdt naar rechts (Jor); laat hem links beginnen als de achterstaander rechts zit
      const startX = -beltDir * (X - 1.4);
      const p = spawn('kroon', startX, 1.2, ZB + 0.7, 0, 0, 0);
      if (!p) return; stats.crowns++;
      fx.texts.add('KROON OP DE BAND!', startX * 0.3, 3.5, ZB + 1.5, '#ffe14a', 1.5); audio.sfx('bell'); audio.sfx('sparkle', { vol: 0.5 });
      hud.toast('👑 Een kroon (+60) op de lopende band!', 2000);
    }
    function rain(n, banner) {
      const kinds = ['teddy', 'teddy2', 'eend', 'bal', 'kist', 'teddy', 'teddy2', 'eend', 'goudkip', 'bom', 'deurman'];
      let k = 0;
      for (let i = 0; i < n; i++) {
        const key = i === 0 && banner ? 'kist' : pick(kinds);
        const p = spawn(key, (Math.random() - 0.5) * 12, CEIL - 1.0 - i * 1.1, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 1.5); if (p) k++;
      }
      if (k && banner) { fx.texts.add('PRIJZENREGEN!', 0, CEIL - 2.0, 2, '#7af0ff', 1.6); hud.toast('🎁 Het regent prijzen!', 1800); audio.sfx('sparkle'); audio.sfx('bell', { vol: 0.5 }); }
    }
    function updateChicken(p, dt) {
      if (p.held >= 0) { p.ai = 0; return; }
      p.ai -= dt;
      if (p.gr && p.ai <= 0) { p.ai = 0.9 + Math.random() * 1.6; const a = Math.random() * TAU, sp = 1.4 + Math.random() * 1.6; p.hx = Math.cos(a) * sp; p.hz = Math.sin(a) * sp; if (Math.random() < 0.3) { p.vy = 5 + Math.random() * 3; audio.sfx('boing', { vol: 0.15, rate: 1.8 }); } if (Math.random() < 0.4) audio.sfx('note', { vol: 0.12, rate: 2.2 + Math.random() * 0.6 }); }
      if (p.gr && p.hx !== undefined) { p.vx += (p.hx - p.vx) * Math.min(1, dt * 6); p.vz += (p.hz - p.vz) * Math.min(1, dt * 6); }
    }

    // ---------------- visuals ----------------
    const _lookV = new THREE.Vector3(), _dirV = new THREE.Vector3();
    let bulbT = 0, glintT = 0;
    function updateVisuals(dt, tt) {
      // prijzen
      for (const p of prizes) {
        if (!p.alive) continue;
        const sp = Math.hypot(p.vx, p.vz);
        // rollen / oprichten
        if (p.held >= 0) {
          const c = claws[p.held]; p.wob += dt * 6; _ax.set(Math.sin(p.wob) * 0.15, 0, Math.cos(p.wob * 1.3) * 0.15);
          p.tilt.setFromEuler(new THREE.Euler(c.thz * 1.4 + _ax.x, 0, -c.thx * 1.4 + _ax.z));
          if (p.type === 'kip') { p.tilt.setFromEuler(new THREE.Euler(Math.sin(tt * 30) * 0.4, 0, Math.sin(tt * 26) * 0.4)); }
        } else {
          if (sp > 0.3 && p.gr) { _ax.set(p.vz, 0, -p.vx).normalize(); _dq.setFromAxisAngle(_ax, sp * dt / p.r * 0.45); p.tilt.premultiply(_dq); }
          else if (sp < 1.0) p.tilt.slerp(_dq.identity(), 1 - Math.exp(-2.2 * dt));
          if (p.fuse > 0 || p.flash > 0) p.wob += dt;
        }
        _yq.setFromAxisAngle(_up, p.yaw); _q2.copy(p.tilt).multiply(_yq);
        if (p.obj) {
          p.obj.speed = p.gr && sp > 0.5 ? 1 : 0; p.obj.update(dt);
          p.obj.group.position.set(p.x, p.y - p.r + 0.05, p.z);
          if (sp > 0.5) p.obj.targetYaw = Math.atan2(p.vx, p.vz);
          p.obj.group.rotation.x = p.held >= 0 ? Math.sin(tt * 30) * 0.4 : 0; p.obj.group.rotation.z = p.held >= 0 ? Math.sin(tt * 26) * 0.4 : 0;
        } else {
          _p.set(p.x, p.y, p.z); _m.compose(_p, _q2, _sP); p.im.setMatrixAt(p.idx, _m);
        }
        if (p.type === 'bom' && p.fuse > 0) {
          const f = 0.5 + 0.5 * Math.sin(tt * (8 + (FUSE_T - p.fuse) * 5)); p.im.setColorAt(p.idx, _col.setRGB(1, 1 - f * 0.8, 1 - f * 0.8)); p.im.instanceColor.needsUpdate = true;
        }
      }
      for (const d of Object.values(TYPES)) d.im.instanceMatrix.needsUpdate = true;
      // klauwen
      for (const c of claws) {
        const Lc = TROLLEY_Y - c.hy;
        c.grp.position.set(c.hx, c.hy, c.hz);
        c.grp.rotation.set(c.thz * 0.9, 0, -c.thx * 0.9);
        // vingers
        const open = 0.75 - c.g * 1.05, elb = 0.1 + c.g * 0.75;
        for (const f of c.fingers) { f.pivot.rotation.x = -open; f.elbow.rotation.x = elb; }
        const power = c.powerT > 0 ? 0.6 + 0.4 * Math.sin(tt * 20) : 0;
        c.cm.emissive.setRGB(power * 0.2, power * 0.9, power * 0.4);
        if (c.stun > 0) c.cm.emissive.setRGB(0.7 * (Math.sin(tt * 30) > 0), 0.1, 0.1);
        // kabel: van wagentje naar klauw
        const tx = c.x, ty = TROLLEY_Y, tz = c.z;
        _lookV.set(c.hx, c.hy + 0.6, c.hz); _dirV.set(tx, ty, tz).sub(_lookV); const len = _dirV.length();
        c.cable.position.set((_lookV.x + tx) / 2, (_lookV.y + ty) / 2, (_lookV.z + tz) / 2); c.cable.scale.set(1, Math.max(0.01, len), 1);
        c.cable.quaternion.setFromUnitVectors(_up, _dirV.normalize());
        W.trolleys[c.i].position.x = c.x; W.trolleys[c.i].position.z = c.z;
        // mikstraal en mikcirkel
        const top = topAt(c.hx, c.hz, 0.55 * c.sc);
        const bl = Math.max(0.1, c.hy - 0.5 - top);
        c.beam.position.set(c.hx, top + bl / 2, c.hz); c.beam.scale.set(1, bl, 1); c.beam.scale.x = c.beam.scale.z = c.sc;
        c.aim.position.set(c.hx, top + 0.06, c.hz); c.aim.scale.setScalar(c.sc * (1 + 0.06 * Math.sin(tt * 6 + c.i)));
        c.aim.visible = c.state === 'idle' || c.state === 'carry' || c.state === 'open' || c.state === 'drop';
        const closing = c.state === 'close';
        c.tring.visible = c.tcore.visible = closing;
        if (closing) {
          const k = clamp(c.t / 0.62, 0, 1.4), rr = lerp(3.0, 1.0, Math.min(k, 1)) + (k > 1 ? (k - 1) * -0.6 : 0);
          c.tring.scale.setScalar(Math.max(0.3, rr) * c.sc); c.tcore.scale.setScalar(c.sc); c.tring.position.set(c.hx, c.hy - 0.9, c.hz); c.tcore.position.copy(c.tring.position);
          const near = Math.abs(c.t - 0.62) < 0.075; c.tring.material.color.setHex(near ? 0x7affb0 : 0xffffff);
        }
        // label
        const o = claws[1 - c.i];
        let txt;
        if (c.stun > 0) txt = 'AU!'; else if (c.state === 'idle' || c.state === 'open') txt = c.cdB > 0 ? `A zak · B ${c.cdB.toFixed(0)}s` : 'A zakken · B RUK'; else if (c.state === 'carry') txt = c.cdB > 0 ? `A los · B ${c.cdB.toFixed(0)}s` : 'A los · B KRACHT'; else if (c.state === 'close') txt = 'NU OP TIJD: A!'; else txt = '';
        if (c.powerT > 0) txt = 'KRACHTGRIP!';
        if (txt !== c.lastLab) { c.lastLab = txt; c.lab.material.map = labelTex(txt || ' ', c.powerT > 0 ? '#7affb0' : c.cdB > 0 ? '#b0b0c8' : '#ffffff'); c.lab.material.needsUpdate = true; }
        c.lab.position.set(c.hx, Math.min(c.hy + 1.9, CEIL - 0.7), c.hz + 0.6); c.lab.visible = !!txt && started && !over;
      }
      // poppetjes
      for (let i = 0; i < 2; i++) {
        const ch = chars[i], c = claws[i];
        ch.poseT -= dt; if (ch.poseT <= 0 && !over) ch.c.pose = 'carry';
        ch.c.speed = clamp(c.speedAbs / 10, 0, 0.5);
        ch.c.update(dt);
      }
      // lampjes, band, glas
      W.updateWheel(tt);
      bulbT -= dt;
      if (bulbT <= 0) { bulbT = 0.14; const ph = Math.floor(tt * 7); for (let k = 0; k < W.bulbN; k++) { const on = (k + ph) % 3 !== 0; _col.setHex(BULB_COLS[(k + (ph >> 1)) % 5]); if (!on) _col.multiplyScalar(0.28); W.bulbs.setColorAt(k, _col); } W.bulbs.instanceColor.needsUpdate = true; }
      W.beltT.offset.x -= beltDir * dt * (BELT_V / 4.6);
      glassShake = Math.max(0, glassShake - dt * 2.2);
      for (let k = 0; k < W.glass.length; k++) { const gm = W.glass[k]; const s = glassShake * 0.16; gm.position.x = (k === 0 ? 0 : (k === 1 ? -1 : 1) * (X + 0.45)) + (Math.random() - 0.5) * s * (k === 0 ? 1 : 0); gm.position.y = CEIL / 2 + (Math.random() - 0.5) * s; if (k === 0) gm.position.z = ZF + 0.3 + (Math.random() - 0.5) * s * 0.5; else gm.position.z = (ZB + ZF) / 2 + (Math.random() - 0.5) * s * 0.5; }
      W.glints[0].position.x = -9 + Math.sin(tt * 0.25) * 4; W.glints[1].position.x = -7 + Math.sin(tt * 0.25) * 4;
      for (let i = 0; i < 2; i++) { const lm = W.lamps[i].material; lm.opacity = damp(lm.opacity, 0.5 + 0.1 * Math.sin(tt * 3 + i), 4, dt); columns[i].material.opacity = 0.1 + 0.05 * Math.sin(tt * 3 + i * 2); }
      W.pl.intensity = 52 + Math.sin(tt * 2) * 4;
    }

    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${doubleOn ? '  (DUBBEL!)' : ''}`);
    }
    function playerInfo(i) {
      const c = claws[i]; let st = c.stun > 0 ? 'Versuft!' : c.hold ? `Heeft: ${c.hold.d.name}` : c.state === 'idle' ? 'Zoek een prijs' : c.state === 'drop' ? 'Zakt...' : c.state === 'close' ? 'Grijpt!' : c.state === 'rise' ? 'Omhoog' : '';
      const txt = `${score[i]} pnt · ${st}${c.cdB > 0 ? ` · B ${c.cdB.toFixed(0)}s` : ''}`;
      if (txt !== lastTxt[i]) { lastTxt[i] = txt; hud.setPlayerInfo(i, txt); }
    }

    // ---------------- einde ----------------
    function endGame() {
      if (finished) return; finished = true;
      for (const c of claws) if (c.hold) releasePrize(c);
      let winner = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : counts[0] > counts[1] ? 0 : counts[1] > counts[0] ? 1 : (Math.random() < 0.5 ? 0 : 1);
      const tie = score[0] === score[1];
      const jokes = ['De kermisman wrijft in zijn ogen: zoveel prijzen weg!', 'De knuffels in de kast hebben nog nooit zo gescholden.', 'Alleen de kip heeft nergens spijt van.', 'De Deurman keek mee en was niet onder de indruk.'];
      const bits = [];
      if (stats.bombs) bits.push(`${stats.bombs}× BOEM`); if (stats.deurmans) bits.push(`${stats.deurmans}× Deurman-pop`); if (stats.stolen[0] + stats.stolen[1]) bits.push(`${stats.stolen[0] + stats.stolen[1]}× geruk uit de klauw`);
      bits.push(`slips: ${names[0]} ${stats.slips[0]}, ${names[1]} ${stats.slips[1]}`);
      hud.showBig('TIJD OP!', 900, '#ffe14a');
      ctx.finishPvp({ winner, score: [score[0], score[1]], delay: 1100, summary: `${names[winner]} wint de grijpkast met <b>${score[winner]}</b> tegen ${score[1 - winner]} punten${tie ? ' (gelijk: de meeste prijzen beslisten)' : ''}.<br><small>${bits.join(' · ')}. ${pick(jokes)}</small>` });
      over = true; overT = 0;
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      started = true;
      T += dt; timeLeft -= dt;
      if (!doubleOn && timeLeft <= DOUBLE_AT) { doubleOn = true; hud.showBig('DUBBELE PUNTEN!', 1400, '#ff9ad5'); audio.sfx('powerup'); ctx.shake(0.3); refreshHud(); }
      for (const e of events) if (!e.done && T >= e.t) { e.done = true; e.f(); }
      refillT -= dt; if (refillT <= 0) { refillT = 6; const good = prizes.filter((p) => p.alive && p.val > 0 && p.type !== 'kip').length; if (good < 16) rain(5, true); }
      hud.setTimer(Math.max(0, timeLeft), 15);
      const n = 2; for (let s = 0; s < n; s++) { for (const p of chickens) if (p.alive) updateChicken(p, dt / n); stepPhys(dt / n); }
      for (const c of claws) updateClaw(c, dt);
      // bommen
      for (const p of prizes) {
        if (!p.alive || p.type !== 'bom' || p.fuse <= 0) continue;
        p.fuse -= dt;
        if (Math.random() < dt * 22) fx.particles.emit(p.x + 0.15, p.y + 0.95, p.z, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5, { life: 0.4, size: 0.25, color: pick([0xffe14a, 0xff8a1c]), gravity: 0 });
        const tn = Math.ceil(p.fuse); if (tn < p.tickN && tn >= 1) { p.tickN = tn; audio.sfx('tick', { vol: 0.7, rate: 1.2 }); fx.texts.add(String(tn), p.x, p.y + 1.8, p.z, '#ff6a3a', 1.1); }
        if (p.fuse <= 0) {
          const holder = p.held >= 0 ? claws[p.held] : null; const bx = p.x, by = p.y, bz = p.z;
          if (holder) { addScore(holder.i, -10 * (doubleOn ? 2 : 1), bx, bz); holder.hold = null; }
          kill(p); explode(bx, by, bz, holder ? holder.i : -1); fx.texts.add('BOEM!', bx, by + 2.4, bz, '#ff9a3a', 1.6);
        }
      }
      for (let i = 0; i < 2; i++) playerInfo(i);
      if (timeLeft <= 0) endGame();
      updateVisuals(dt, T + introT);
      camera.position.copy(tgt).addScaledVector(camDir, camD); camera.lookAt(tgt);
    }
    function resultUpdate(dt) {
      overT += dt; T += dt;
      for (let s = 0; s < 2; s++) stepPhys(dt / 2, true);
      for (const c of claws) { c.g = damp(c.g, 0, 6, dt); c.x += (c.sd * 8 - c.x) * 0.03; }
      for (const c of claws) { const Lc = TROLLEY_Y - c.hy; c.hx = c.x; c.hz = c.z; }
      updateVisuals(dt, T + introT);
    }
    function introUpdate(dt) {
      introT += dt;
      for (const c of claws) { c.x = c.sd * 8 + Math.sin(introT * 0.9 + c.i * 2) * 1.5; c.z = 0.6 + Math.cos(introT * 0.7 + c.i) * 1.2; c.hx = c.x; c.hz = c.z; c.hy = HUB_TOP + Math.sin(introT * 1.3 + c.i) * 0.3; c.thx = Math.sin(introT * 1.5 + c.i) * 0.06; c.gTarget = 0; c.g = damp(c.g, 0.2 + 0.3 * Math.sin(introT * 2), 4, dt); }
      updateVisuals(dt, introT);
    }
    refreshHud(); hud.setTimer(MATCH_TIME, 15); for (let i = 0; i < 2; i++) playerInfo(i);
    updateVisuals(0.016, 0);

    return {
      update, resultUpdate, introUpdate,
      onResize() { fitCamera(); },
      onSwap() { for (const c of claws) { fx.particles.burst(c.hx, c.hy, c.hz, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); } },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m && !finished) { const c = claws[i]; score[i] -= 10; refreshHud(); redrawBoard(i); fx.texts.add('-10', c.hx, c.hy + 1, c.hz, '#ff6a6a', 1.5); if (c.hold) { releasePrize(c, 'SCHRIK!'); if (c.state === 'carry') { c.state = 'idle'; } } c.stun = 1.2; audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) {
        chars[w].c.pose = 'cheer'; chars[1 - w].c.pose = 'sad'; chars[0].poseT = chars[1].poseT = 1e9;
        for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst((Math.random() - 0.5) * 20, 8 + Math.random() * 6, 6, { count: 24, speed: 7, up: 1, life: 1.2, size: 0.5, colors: BULB_COLS, gravity: 4 }); } catch (e) { /* scene al weg */ } }, k * 250);
      },
      dispose() {},
      dbg: {
        state: () => ({
          T, timeLeft, finished, started, score: [...score], counts: [...counts], doubleOn, beltDir, stats,
          claws: claws.map((c) => ({ x: c.x, z: c.z, hx: c.hx, hz: c.hz, hy: c.hy, state: c.state, t: c.t, hold: c.hold ? c.hold.type : null, cdB: c.cdB, powerT: c.powerT, stun: c.stun, strength: c.strength, thx: c.thx, thz: c.thz })),
          prizes: prizes.filter((p) => p.alive).map((p) => ({ type: p.type, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, r: p.r, val: p.val, held: p.held, fuse: p.fuse })),
        }),
        setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); redrawBoard(0); redrawBoard(1); },
        setTime: (t) => { timeLeft = t; },
        spawnChicken, spawnCrown, spawn, rain, explode: (x, y, z) => explode(x, y, z, -1), prizes, claws, TYPES, X, ZB, ZF, HOLE_Z0, HOLE_W, HUB_TOP,
        kill, collect, endGame,
      },
    };
  },
};

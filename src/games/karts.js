import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep, angDiff } from '../engine/util.js';
import { makeBrother, Animal, Dragon, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildCourse, locate, pointAt, HALF_W, WALL_M } from './karts_track.js';
import { buildWorld, makeKartModel, questionTex, emojiTex } from './karts_world.js';

// Kasteel-Kartrace — Mario Kart-lite voor 2 op één scherm. Gas is automatisch.
//   links/rechts = sturen · A = voorwerp gebruiken · B = remmen (rechtdoor) of driften (met sturen, loslaten = turbo)

const LAPS = 3;
const TIME_LIMIT = 105;            // harde grens in seconden (daarna wint de leider)
const BASE = 10.2, ACC = 1.5, TURN = 2.35, BRAKE = 20;
const SURF = [
  { v: 1.0, grip: 9, turn: 1 },       // 0 weg
  { v: 1.0, grip: 0.95, turn: 0.9 },  // 1 ijs
  { v: 0.58, grip: 13, turn: 0.85 },  // 2 modder
  { v: 1.0, grip: 9, turn: 1 },       // 3 brug
  { v: 0.5, grip: 7, turn: 0.9 },     // 4 gras
];
const ITEMS = {
  banana: { e: '🍌', n: 'Banaan', d: 'A = laat achter je vallen' },
  fire: { e: '🔥', n: 'Vuurbal', d: 'A = schiet vooruit' },
  shroom: { e: '🍄', n: 'Turbo-paddenstoel', d: 'A = turbo!' },
  ketchup: { e: '🍅', n: 'Ketchup-kanon', d: 'A = maakt de ander blind' },
  gold: { e: '🌟', n: 'Gouden paddenstoel', d: 'A = megaturbo!' },
};

export default {
  id: 'karts',
  name: 'Kasteel-Kartrace',
  giver: 'Koning Klopper',
  icon: '🏎️',
  mode: 'pvp',
  time: 75,
  music: 'game_fast',
  blurb: 'Race 3 rondes om het <b>kasteel</b>! Gas geven gaat vanzelf. Pak <b>vraagtekenblokken</b> voor bananen, vuurballen, turbo\'s en een <b>ketchup-kanon</b>. Pas op voor de <b>draak</b> die vuur laat vallen en voor de <b>koeien</b> op de weg!',
  controls: ['{move} sturen', '{a} voorwerp gebruiken', '{b} remmen · of driften (met sturen, loslaten = turbo)'],
  tip: 'Wie ver achterligt krijgt sneller een <b>gouden paddenstoel</b> en een inhaalboost. Drift door de bochten voor mini-turbo\'s!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('day', { shadow: 40, center: [0, 0, -2], fogNear: 130, fogFar: 330 });
    L.sun.position.set(24, 55, 20); L.hemi.intensity = 1.2;
    camera.fov = 50; camera.updateProjectionMatrix();
    const C = buildCourse(), N = C.N;
    const world = buildWorld(ctx, C);
    const gravityK = ctx.pvp.gravity, slip = ctx.pvp.slip;
    const G = 26 * gravityK;

    // ---------------- karts ----------------
    const iconSprites = [];
    const karts = players.map((pp, i) => {
      const model = makeKartModel(PLAYER_COLORS[i]); scene.add(model.root);
      const ch = makeBrother(i); ch.pose = 'sit'; const hs = 0.62 * (i ? 1.19 : 1);
      ch.group.scale.setScalar(hs); ch.group.position.set(0, 0.72, -0.28); model.tilt.add(ch.group);
      const size = ctx.pvp.size(i), spd = ctx.pvp.speed(i);
      model.root.scale.setScalar(size);
      const blob = P.shadowBlob(1.9); scene.add(blob);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); }), transparent: true, depthTest: false }));
      tag.scale.set(2.6, 0.97, 1); tag.renderOrder = 15; scene.add(tag);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('❔'), transparent: true, depthTest: false })); icon.scale.set(1.9, 1.9, 1); icon.renderOrder = 16; icon.visible = false; scene.add(icon);
      // ketchup (blind)
      const splats = [0, 1, 2].map((n) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ketchupTex(n), transparent: true, depthTest: false, opacity: 0 })); s.renderOrder = 30 + n; s.visible = false; scene.add(s); return s; });
      return {
        i, name: pp.name, css: pp.css, model, ch, size, spdM: 1 + (spd - 1) * 0.7, accM: Math.sqrt(spd), turnM: 1 - (spd - 1) * 0.2, mass: size * size,
        R: 1.15 * size, blob, tag, icon, splats,
        x: 0, z: 0, th: 0, vx: 0, vz: 0, y: 0, vy: 0, hop: 0, loc: { idx: 0, lat: 0, px: 0, pz: 0, tx: 1, tz: 0, dist: 0 },
        prog: 0, lap: -1, done: false, doneT: 0, drift: { on: false, dir: 0, t: 0, lvl: 0 }, driftCd: 0, steerV: 0,
        boostT: 0, boostStrong: false, spinT: 0, spinDur: 1, invT: 0, blindT: 0, freezeT: 0, padCd: 0, rubber: 1,
        item: null, rollT: 0, rollShow: 0, wrongT: 0, wrongMsgT: 0, fwd: 0, wheelRot: 0, trick: 0, dustT: 0,
      };
    });
    function ketchupTex(n) {
      return canvasTex(256, 256, (g, w, h) => {
        const rg = (s) => { let a = s * 9301 + 49297; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; }; const r = rg(n + 3);
        g.translate(w / 2, h / 2);
        for (let k = 0; k < 14; k++) { const a = r() * TAU, d = r() * 70, rad = 22 + r() * 40; g.fillStyle = k % 3 ? '#c8221a' : '#e0301f'; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, rad, rad * (0.7 + r() * 0.4), r() * 3, 0, TAU); g.fill(); }
        for (let k = 0; k < 8; k++) { const a = r() * TAU; g.strokeStyle = '#b81a14'; g.lineWidth = 6 + r() * 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(Math.cos(a) * 50, Math.sin(a) * 50); g.lineTo(Math.cos(a) * (95 + r() * 25), Math.sin(a) * (95 + r() * 25) + 20); g.stroke(); }
        g.fillStyle = 'rgba(255,200,190,.5)'; g.beginPath(); g.ellipse(-24, -26, 18, 9, -0.6, 0, TAU); g.fill();
      });
    }

    const placeStart = () => {
      karts.forEach((k, i) => {
        const p = pointAt(C, N - 5, (i ? 1 : -1) * 1.75);
        k.x = p.x; k.z = p.z; k.th = Math.atan2(p.tx, p.tz); k.vx = k.vz = 0; k.prog = -5; k.loc.idx = N - 5; k.fwd = 0;
        locate(C, k.x, k.z, N - 5, k.loc);
      });
    };
    placeStart();

    // ---------------- toestand ----------------
    let hintState = -1;
    let T = 0, done = false, state = 'race', started = false, finishT = 0, winnerK = null, shakeCd = 0;
    const timeLeftFn = () => Math.max(0, TIME_LIMIT - T);
    const tmp = { idx: 0, lat: 0, px: 0, pz: 0, tx: 1, tz: 0, dist: 0 };
    const textUp = (t, x, y, z, c = '#ffe14a', s = 1) => fx.texts.add(t, x, y, z, c, s);

    // ---------------- vraagtekenblokken ----------------
    const boxes = [];
    {
      const qt = questionTex(), bm = new THREE.MeshStandardMaterial({ map: qt, emissive: 0xffaa33, emissiveMap: qt, emissiveIntensity: 0.55, roughness: 0.4 });
      const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
      for (const f of [0.1, 0.33, 0.58, 0.8]) {
        const idx = Math.round(f * N);
        for (const lat of [-2.2, 0, 2.2]) {
          const p = pointAt(C, idx, lat); const m = new THREE.Mesh(geo, bm); m.castShadow = true; m.position.set(p.x, 1.4, p.z); scene.add(m);
          const gl = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 20), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); gl.rotation.x = -Math.PI / 2; gl.position.set(p.x, 0.15, p.z); scene.add(gl);
          boxes.push({ x: p.x, z: p.z, m, gl, on: true, t: 0, ph: Math.random() * 6 });
        }
      }
    }

    // ---------------- voorwerpen in de wereld ----------------
    const bananas = [], shots = [], patches = [], bombs = [];
    const bananaGeo = new THREE.TorusGeometry(0.42, 0.14, 6, 10, Math.PI * 1.15), bananaMat = mat(0xffd92a, { flatShading: false });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa020 }), fireCore = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    const ketMat = new THREE.MeshStandardMaterial({ color: 0xd8261a, emissive: 0x8a0f08, emissiveIntensity: 0.5, roughness: 0.3 });
    function spawnBanana(x, z, owner) {
      if (bananas.length >= 10) { const o = bananas.shift(); scene.remove(o.m); }
      const g = new THREE.Group(); const b = new THREE.Mesh(bananaGeo, bananaMat); b.castShadow = true; b.rotation.set(Math.PI / 2, 0, 0); b.position.y = 0.2; g.add(b); const tip = mesh(new THREE.SphereGeometry(0.1, 5, 4), mat(0x5a3a1a), { cast: false, pos: [0.42, 0.2, 0] }); g.add(tip);
      g.position.set(x, 0, z); scene.add(g); bananas.push({ m: g, x, z, age: 0, owner });
    }
    function spawnShot(kind, k) {
      const f = [Math.sin(k.th), Math.cos(k.th)];
      const g = new THREE.Group();
      if (kind === 'fire') { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), fireMat)); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), fireCore)); }
      else { const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), ketMat); s.castShadow = true; g.add(s); const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), fireCore); h2.position.set(-0.2, 0.25, 0.3); g.add(h2); }
      const x = k.x + f[0] * (1.8 * k.size + 0.6), z = k.z + f[1] * (1.8 * k.size + 0.6); g.position.set(x, 0.9, z); scene.add(g);
      const sp = (kind === 'fire' ? 30 : 34) + Math.max(0, k.vx * f[0] + k.vz * f[1]);
      shots.push({ kind, m: g, x, z, vx: f[0] * sp, vz: f[1] * sp, life: kind === 'fire' ? 2.8 : 2.4, owner: k.i, age: 0, hint: null, h: { idx: 0, lat: 0, px: 0, pz: 0, tx: 1, tz: 0, dist: 0 } });
    }

    // ---------------- boost / schade ----------------
    function boost(k, secs, strong = false) {
      k.boostT = Math.max(k.boostT, secs); k.boostStrong = k.boostStrong || strong;
      fx.particles.burst(k.x, 0.8, k.z, { count: 14, speed: 4, up: 0.5, life: 0.5, size: 0.4, colors: [0xffd23f, 0xff7a1a, 0xffffff], gravity: 0 });
    }
    function spinOut(k, why, dur = 1.15) {
      if (k.invT > 0 || k.spinT > 0 || k.done) return false;
      k.spinT = dur; k.spinDur = dur; k.invT = dur + 1.3; k.drift.on = false; k.boostT = 0; k.boostStrong = false;
      const f = Math.sin(k.th) * k.vx + Math.cos(k.th) * k.vz; k.vx *= 0.4; k.vz *= 0.4; k.fwd = f * 0.4;
      audio.sfx('hurt', { vol: 0.7 }); ctx.shake(0.45);
      fx.particles.burst(k.x, 1.0, k.z, { count: 16, speed: 5, up: 1.3, life: 0.7, size: 0.35, colors: [0xffe14a, 0xffffff, 0xff6fa5], gravity: 9 });
      textUp(why || 'AUW!', k.x, 3.4 * k.size, k.z, '#ff7a5a', 1.2);
      k.ch.pose = 'scared';
      return true;
    }
    function giveItem(k, forced) {
      const other = karts[1 - k.i], gap = other.prog - k.prog;       // >0: k ligt achter
      let w;
      if (gap > 14) w = { gold: 30, fire: 26, shroom: 24, ketchup: 12, banana: 8 };
      else if (gap < -14) w = { banana: 42, shroom: 24, ketchup: 16, fire: 18 };
      else w = { banana: 26, fire: 22, shroom: 28, ketchup: 16, gold: 8 };
      if (forced) { k.item = forced; return; }
      let tot = 0; for (const key in w) tot += w[key]; let r2 = Math.random() * tot, pickK = 'shroom';
      for (const key in w) { r2 -= w[key]; if (r2 <= 0) { pickK = key; break; } }
      k.item = pickK;
    }
    function useItem(k) {
      const it = k.item; if (!it) return; k.item = null;
      const f = [Math.sin(k.th), Math.cos(k.th)];
      if (it === 'banana') { spawnBanana(k.x - f[0] * (2.0 * k.size + 0.4), k.z - f[1] * (2.0 * k.size + 0.4), k.i); audio.sfx('pop', { vol: 0.6 }); }
      else if (it === 'fire') { spawnShot('fire', k); audio.sfx('shoot', { vol: 0.8 }); }
      else if (it === 'ketchup') { spawnShot('ketchup', k); audio.sfx('shoot', { vol: 0.7, rate: 0.7 }); textUp('SPLAT!', k.x + f[0] * 3, 3, k.z + f[1] * 3, '#ff5a4a', 0.9); }
      else if (it === 'shroom') { boost(k, 1.7); audio.sfx('powerup', { vol: 0.7 }); textUp('TURBO!', k.x, 3.6 * k.size, k.z, '#ff9a3a', 1.1); ctx.shake(0.15); }
      else if (it === 'gold') { boost(k, 3.6, true); audio.sfx('powerup', { vol: 0.9 }); audio.sfx('sparkle', { vol: 0.7 }); textUp('MEGATURBO!', k.x, 3.6 * k.size, k.z, '#ffe14a', 1.3); ctx.shake(0.3); fx.particles.ring(k.x, 0.6, k.z, { count: 24, speed: 6, color: 0xffe14a, size: 0.35, life: 0.6 }); }
    }

    // ---------------- koeien ----------------
    const cows = C.zones.cows.map((idx, n) => {
      const a = new Animal('cow'); a.group.scale.setScalar(1.7); scene.add(a.group);
      const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('⚠️'), transparent: true, depthTest: false })); warn.scale.set(2.2, 2.2, 1); warn.renderOrder = 17; warn.visible = false; scene.add(warn);
      return { a, idx, warn, state: 'wait', t: 6 + n * 5 + Math.random() * 4, side: n % 2 ? 1 : -1, lat: 0, x: 0, z: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0 };
    });
    const COW_L = HALF_W + WALL_M + 1.6;
    function cowStep(cw, dt) {
      const a = cw.a;
      if (cw.state === 'wait') {
        a.group.visible = false; cw.warn.visible = false; cw.t -= dt;
        if (cw.t < 1.8 && T > 4) { cw.warn.visible = Math.sin(T * 14) > -0.3; const p = pointAt(C, cw.idx, -cw.side * COW_L); cw.warn.position.set(p.x, 3.4, p.z); }
        if (cw.t <= 0 && T > 4) { cw.state = 'cross'; cw.lat = -cw.side * COW_L; a.group.visible = true; cw.warn.visible = false; audio.sfx('boing', { vol: 0.4, rate: 0.6 }); }
      } else if (cw.state === 'cross') {
        cw.lat += cw.side * 2.7 * dt; const p = pointAt(C, cw.idx, cw.lat);
        cw.x = p.x; cw.z = p.z; a.group.position.set(p.x, 0, p.z); a.targetYaw = Math.atan2(cw.side * -p.tz, cw.side * p.tx); a.speed = 1; a.update(dt);
        cw.warn.visible = false;
        if (Math.abs(cw.lat) > COW_L + 0.2 && cw.lat * cw.side > 0) { cw.state = 'wait'; cw.t = rand(8, 13); cw.side = -cw.side; }
        if (Math.random() < dt * 0.12) audio.sfx('boing', { vol: 0.25, rate: 0.5 });
      } else if (cw.state === 'fly') {
        cw.vy -= 24 * dt; cw.y += cw.vy * dt; cw.x += cw.vx * dt; cw.z += cw.vz * dt; cw.spin += dt * 9;
        a.group.position.set(cw.x, Math.max(0, cw.y), cw.z); a.group.rotation.set(cw.spin, a.yaw, cw.spin * 0.6); a.group.rotation.order = 'YXZ';
        if (cw.y <= 0 && cw.vy < 0) { cw.state = 'gone'; cw.t = 0.8; fx.particles.dust(cw.x, 0, cw.z, 10, 0x9fd070); audio.sfx('thud', { vol: 0.7 }); textUp('MOE!', cw.x, 3, cw.z, '#ffffff', 1); a.group.rotation.set(0, a.yaw, 0); }
      } else if (cw.state === 'gone') {
        cw.t -= dt; a.group.scale.setScalar(Math.max(0.01, cw.t / 0.8 * 1.7));
        if (cw.t <= 0) { a.group.visible = false; a.group.scale.setScalar(1.7); cw.state = 'wait'; cw.t = rand(9, 14); cw.side = -cw.side; }
      }
    }
    function cowHit(cw, vx, vz, power = 1) {
      if (cw.state !== 'cross') return;
      cw.state = 'fly'; cw.y = 0.5; cw.vy = 12 * power; cw.vx = vx * 0.6 + rand(-3, 3); cw.vz = vz * 0.6 + rand(-3, 3); cw.spin = 0;
      audio.sfx('boing', { vol: 0.8 }); audio.sfx('hit', { vol: 0.7 }); textUp('MOEEEE!', cw.x, 4.2, cw.z, '#ffffff', 1.4); ctx.shake(0.35);
      fx.particles.burst(cw.x, 1.2, cw.z, { count: 16, speed: 5, up: 1.2, life: 0.8, size: 0.4, colors: [0xffffff, 0x222222, 0xf0a8a8], gravity: 9 });
    }

    // ---------------- draak ----------------
    const dragon = new Dragon(0x7a2fd4, 1.5); dragon.group.visible = false; scene.add(dragon.group);
    const dShadow = P.shadowBlob(3.4); dShadow.visible = false; scene.add(dShadow);
    const D = { state: 'wait', t: 13, u: 0, sx: 0, sz: 0, ex: 0, ez: 0, dur: 9, bombs: 0, nextBomb: 0 };
    const patchGeo = new THREE.ConeGeometry(0.5, 1.7, 5), patchMatA = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.92 }), patchMatB = new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.95 });
    function startDragon() {
      const west = Math.random() < 0.5, zc = rand(-8, 8);
      D.state = 'fly'; D.u = 0; D.dur = 9.5; D.sx = west ? -64 : 64; D.ex = -D.sx; D.sz = zc - 14; D.ez = zc + 14; D.bombs = 0; D.nextBomb = 0.28; dragon.group.visible = true; dShadow.visible = true;
      audio.sfx('creak', { vol: 0.5 }); hud.toast('🐉 De draak komt eraan!', 1800);
    }
    function dragonStep(dt) {
      if (D.state === 'wait') { D.t -= dt; if (D.t <= 0 && T > 5) startDragon(); return; }
      D.u += dt / D.dur;
      const x = lerp(D.sx, D.ex, D.u), z = lerp(D.sz, D.ez, D.u) + Math.sin(D.u * 9) * 3, y = 15 + Math.sin(D.u * 7) * 1.2;
      const nx = lerp(D.sx, D.ex, D.u + 0.01), nz = lerp(D.sz, D.ez, D.u + 0.01);
      dragon.group.position.set(x, y, z); dragon.group.rotation.y = Math.atan2(nx - x, nz - z); dragon.group.rotation.z = Math.sin(D.u * 7) * 0.12; dragon.update(dt);
      dShadow.position.set(x, 0.05, z); dShadow.scale.setScalar(1.4);
      if (Math.random() < dt * 5) fx.particles.emit(x, y + 1.5, z, rand(-1, 1), 1, rand(-1, 1), { life: 0.8, size: 0.6, color: 0xff8a2a, gravity: -1 });
      if (D.bombs < 2 && D.u > D.nextBomb && Math.abs(x) < 45) {
        D.bombs++; D.nextBomb += 0.28;
        const victim = Math.random() < 0.65 ? (karts[0].prog > karts[1].prog ? karts[0] : karts[1]) : pick(karts);
        const tp = pointAt(C, victim.loc.idx + 12 + rand(0, 8), rand(-2.2, 2.2));
        const mb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), fireMat); const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), fireCore); mb.add(core); scene.add(mb);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.55, 28), new THREE.MeshBasicMaterial({ color: 0xff4a1a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(tp.x, 0.2, tp.z); scene.add(ring);
        bombs.push({ m: mb, ring, sx: x, sy: y + 1, sz: z, tx: tp.x, tz: tp.z, t: 0, dur: 1.15 }); audio.sfx('shoot', { vol: 0.6, rate: 0.5 }); textUp('!', tp.x, 3.5, tp.z, '#ff5a3a', 1.4);
      }
      if (D.u >= 1) { D.state = 'wait'; D.t = rand(16, 24); dragon.group.visible = false; dShadow.visible = false; }
    }
    function bombStep(dt) {
      for (let n = bombs.length - 1; n >= 0; n--) {
        const b = bombs[n]; b.t += dt; const u = Math.min(1, b.t / b.dur);
        b.m.position.set(lerp(b.sx, b.tx, u), lerp(b.sy, 0.6, u) + Math.sin(u * Math.PI) * 6, lerp(b.sz, b.tz, u)); b.m.scale.setScalar(1 + Math.sin(T * 30) * 0.1);
        b.ring.scale.setScalar(1 + (1 - u) * 5.5); b.ring.material.opacity = 0.35 + u * 0.5;
        if (Math.random() < dt * 40) fx.particles.emit(b.m.position.x, b.m.position.y, b.m.position.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), { life: 0.4, size: 0.5, color: 0xffa020, gravity: 0 });
        if (u >= 1) {
          scene.remove(b.m); scene.remove(b.ring); bombs.splice(n, 1);
          fx.particles.burst(b.tx, 0.8, b.tz, { count: 40, speed: 8, up: 1.4, life: 0.9, size: 0.6, colors: [0xff7a1a, 0xffe070, 0xff4a1a, 0x444444], gravity: 6 }); audio.sfx('explode', { vol: 0.9 }); ctx.shake(0.55);
          const g2 = new THREE.Group(); for (let c = 0; c < 6; c++) { const cn = new THREE.Mesh(patchGeo, c % 2 ? patchMatA : patchMatB); const a = c / 6 * TAU; cn.position.set(Math.cos(a) * 1.5, 0.8, Math.sin(a) * 1.5); g2.add(cn); } g2.position.set(b.tx, 0, b.tz); scene.add(g2);
          patches.push({ m: g2, x: b.tx, z: b.tz, t: 0, life: 4 });
          for (const k of karts) if (k.y < 1.2 && Math.hypot(k.x - b.tx, k.z - b.tz) < 3.4 + k.size) spinOut(k, 'VUUR!');
        }
      }
      for (let n = patches.length - 1; n >= 0; n--) {
        const p = patches[n]; p.t += dt; p.m.children.forEach((c, i) => { c.scale.set(1, 0.7 + Math.sin(T * 14 + i * 2) * 0.35, 1); });
        if (p.t > p.life - 0.8) p.m.scale.setScalar(Math.max(0.01, (p.life - p.t) / 0.8));
        if (Math.random() < dt * 14) fx.particles.emit(p.x + rand(-1.5, 1.5), 1, p.z + rand(-1.5, 1.5), 0, 2, 0, { life: 0.6, size: 0.4, color: 0xff9a2a, gravity: -1 });
        for (const k of karts) if (p.t < p.life - 0.5 && k.y < 1.0 && Math.hypot(k.x - p.x, k.z - p.z) < 2.3 + k.size * 0.8) spinOut(k, 'HEET!', 0.9);
        if (p.t >= p.life) { scene.remove(p.m); patches.splice(n, 1); }
      }
    }

    // ---------------- kart-fysica ----------------
    function startDrift(k, dir) {
      const Dr = k.drift; Dr.on = true; Dr.dir = dir; Dr.t = 0; Dr.lvl = 0; k.hop = 0.25; audio.sfx('whoosh', { vol: 0.25, rate: 1.4 });
    }
    function endDrift(k, release) {
      const Dr = k.drift; if (!Dr.on) return; Dr.on = false; k.driftCd = 0.25;
      if (release && Dr.lvl > 0) { boost(k, Dr.lvl === 2 ? 1.15 : 0.65); audio.sfx('powerup', { vol: 0.4, rate: Dr.lvl === 2 ? 1.5 : 1.2 }); textUp(Dr.lvl === 2 ? 'SUPER TURBO!' : 'turbo!', k.x, 3.2 * k.size, k.z, Dr.lvl === 2 ? '#ff8a2a' : '#7fe8ff', 0.9); }
      Dr.t = 0; Dr.lvl = 0;
    }
    function clampWall(k, locked) {
      const Lc = k.loc; locate(C, k.x, k.z, Lc.idx, Lc);
      const inBridge = Lc.idx >= C.zones.bridge[0] - 1 && Lc.idx <= C.zones.bridge[1] + 1, sn = Math.sin(k.th), cs = Math.cos(k.th);
      const lim = inBridge ? HALF_W + 0.2 : HALF_W + WALL_M;
      if (Math.abs(Lc.lat) > lim) {
        const sg = Lc.lat > 0 ? 1 : -1, nx = -Lc.tz * sg, nz = Lc.tx * sg;
        k.x = Lc.px + nx * lim; k.z = Lc.pz + nz * lim;
        const vn = k.vx * nx + k.vz * nz;
        if (vn > 0) {
          k.vx -= 1.35 * vn * nx; k.vz -= 1.35 * vn * nz;
          if (vn > 3.5) { audio.sfx('thud', { vol: clamp(vn / 12, 0.25, 0.8) }); ctx.shake(clamp(vn / 40, 0.05, 0.3)); fx.particles.burst(k.x, 1, k.z, { count: 8, speed: 3, up: 1, life: 0.5, size: 0.35, colors: [0x3f9e3a, 0x2f7a34, 0x8ac060], gravity: 8 }); }
          if (!locked) { const f2 = k.vx * sn + k.vz * cs; if (f2 > 3) { k.vx *= 0.93; k.vz *= 0.93; } }
        }
        locate(C, k.x, k.z, Lc.idx, Lc);
      }
    }
    function stepKart(k, h, active) {
      const inp = ctx.pvp.input(k.i);
      const locked = !active || k.spinT > 0 || k.freezeT > 0 || k.done;
      const air = k.y > 0.02 || k.vy > 0;
      const sn = Math.sin(k.th), cs = Math.cos(k.th), rx = -cs, rz = sn;
      let fwd = k.vx * sn + k.vz * cs, lat = k.vx * rx + k.vz * rz;
      const Lc = k.loc, inBridge = Lc.idx >= C.zones.bridge[0] - 1 && Lc.idx <= C.zones.bridge[1] + 1;
      const onRoad = Math.abs(Lc.lat) <= HALF_W + 0.3;
      let sIdx = onRoad ? C.surf[Math.round(Lc.idx) % N] : 4;
      if (air) sIdx = 0;
      const S = SURF[sIdx], boosting = k.boostT > 0;
      const vmax = BASE * k.spdM * Math.max(S.v, boosting ? 0.93 : 0) * (boosting ? (k.boostStrong ? 1.62 : 1.4) : 1) * k.rubber;
      if (!locked) {
        const braking = inp.b && !k.drift.on && Math.abs(inp.x) < 0.35;
        if (braking && !air) fwd = Math.max(0, fwd - BRAKE * (1 - slip * 0.55) * h);
        else if (!air || fwd < vmax * 0.5) { const rate = boosting ? 4.5 : ACC * k.accM * (sIdx === 2 ? 1.6 : 1); fwd += (vmax - fwd) * Math.min(1, rate * h); }
        if (fwd > vmax) fwd += (vmax - fwd) * Math.min(1, (boosting ? 0.5 : 1.8) * h);
      } else fwd *= Math.exp(-(k.spinT > 0 ? 2.4 : 1.2) * h);
      let grip = S.grip; if (k.drift.on) grip = Math.min(grip, 2.7); grip = lerp(grip, 0.8, slip);
      if (!air) lat *= Math.exp(-grip * h);
      k.fwd = fwd;
      k.vx = sn * fwd + rx * lat; k.vz = cs * fwd + rz * lat;
      // sturen
      const st = locked ? 0 : clamp(inp.x, -1, 1);
      let eff = st; if (k.drift.on) eff = k.drift.dir * (0.72 + 0.28 * st * k.drift.dir);
      const auth = clamp(fwd / 4.5, 0.15, 1) * (air ? 0.3 : 1) * S.turn;
      k.th -= eff * TURN * (k.drift.on ? 1.32 : 1) * auth * k.turnM * h;
      k.steerV = damp(k.steerV, eff, 10, h);
      // bewegen
      const px0 = Lc.idx; k.x += k.vx * h; k.z += k.vz * h;
      clampWall(k, locked);
      // voortgang (ononderbroken)
      let d = Lc.idx - (((k.prog % N) + N) % N); if (d > N / 2) d -= N; else if (d < -N / 2) d += N; k.prog += d;
      // schans
      const zr = C.zones.ramp;
      if (!air && px0 < zr[1] && Lc.idx >= zr[1] && Math.abs(Lc.lat) < HALF_W - 0.4 && fwd > 4 && !locked) {
        k.vy = 4.8 + fwd * 0.32; k.y = 0.05; k.drift.on = false; audio.sfx('boing', { vol: 0.7 }); textUp('HOP!', k.x, 3.6, k.z, '#ffffff', 1);
        fx.particles.burst(k.x, 0.6, k.z, { count: 12, speed: 4, up: 0.6, life: 0.5, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 3 });
      }
      // turbopijl
      k.padCd -= h;
      if (!air && C.padAt[Math.round(Lc.idx) % N] && Math.abs(Lc.lat) < HALF_W * 0.85 && k.padCd <= 0 && !locked) { k.padCd = 1.0; boost(k, 1.0); audio.sfx('whoosh', { vol: 0.6 }); }
      // hoogte
      if (air) {
        k.vy -= G * h; k.y += k.vy * h;
        if (k.y <= 0 && k.vy < 0) {
          const hv = k.y; k.y = 0; const vyl = k.vy; k.vy = 0;
          fx.particles.ring(k.x, 0.3, k.z, { count: 14, speed: 5, color: 0xffffff, size: 0.3, life: 0.4 }); audio.sfx('land', { vol: 0.6 });
          const tang = Math.atan2(Lc.tx, Lc.tz), ad = Math.abs(angDiff(k.th, tang));
          if (vyl < -4 && !locked && ad < 0.5) { boost(k, 0.8); textUp('MOOIE LANDING!', k.x, 3.6, k.z, '#7fe8ff', 1); audio.sfx('ding', { vol: 0.5 }); } else if (ad > 1.3) { k.vx *= 0.6; k.vz *= 0.6; }
          if (hv < 0) k.hop = 0.2;
        }
      }
    }
    function bump(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3, md = a.R + b.R;
      if (d >= md || a.y > 1 || b.y > 1) return;
      const nx = dx / d, nz = dz / d, over = md - d, wa = b.mass / (a.mass + b.mass);
      a.x -= nx * over * wa; a.z -= nz * over * wa; b.x += nx * over * (1 - wa); b.z += nz * over * (1 - wa);
      const vr = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vr > 0) {
        const j = (1.45 * vr) / (1 / a.mass + 1 / b.mass);
        a.vx -= j / a.mass * nx; a.vz -= j / a.mass * nz; b.vx += j / b.mass * nx; b.vz += j / b.mass * nz;
        if (vr > 2.5) { const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2; fx.particles.burst(cx, 1, cz, { count: 8, speed: 3, up: 1, life: 0.4, size: 0.35, colors: [0xffffff, 0xffe14a], gravity: 6 }); audio.sfx('hit', { vol: clamp(vr / 12, 0.2, 0.7) }); ctx.shake(clamp(vr / 40, 0.05, 0.25)); }
      }
    }

    // ---------------- per frame: items, botsingen, rondes ----------------
    function perFrame(dt) {
      // vraagtekenblokken
      for (const b of boxes) {
        b.m.rotation.y += dt * 1.8; b.m.rotation.x = 0.35; b.m.position.y = 1.5 + Math.sin(T * 3 + b.ph) * 0.18; b.gl.scale.setScalar(1 + Math.sin(T * 4 + b.ph) * 0.1);
        if (!b.on) { b.t -= dt; b.m.scale.setScalar(Math.max(0.01, 1 - b.t / 4)); if (b.t <= 0) { b.on = true; b.m.visible = true; b.gl.visible = true; b.m.scale.setScalar(1); } continue; }
        for (const k of karts) {
          if (k.item || k.rollT > 0 || k.done || k.y > 1.2) continue;
          if (Math.hypot(k.x - b.x, k.z - b.z) < 1.5 + k.R * 0.7) {
            b.on = false; b.t = 4; b.m.visible = false; b.gl.visible = false; k.rollT = 0.9; audio.sfx('coin', { vol: 0.5 }); audio.sfx('sparkle', { vol: 0.35 });
            fx.particles.burst(b.x, 1.5, b.z, { count: 16, speed: 4, up: 1.2, life: 0.6, size: 0.35, colors: [0xffd23f, 0xff7a3a, 0xd83a8a, 0xffffff], gravity: 6 });
          }
        }
      }
      // roulette + gebruik
      for (const k of karts) {
        const inp = ctx.pvp.input(k.i);
        if (k.rollT > 0) { k.rollT -= dt; k.rollShow -= dt; if (k.rollShow <= 0) { k.rollShow = 0.07; k.rollIcon = pick(Object.keys(ITEMS)); if (Math.random() < 0.7) audio.tone && audio.tone(500 + Math.random() * 400, 0.04, { type: 'square', vol: 0.03 }); } if (k.rollT <= 0) { giveItem(k); audio.sfx('ding', { vol: 0.5 }); fx.texts.add(ITEMS[k.item].n + '!', k.x, 3.8 * k.size, k.z, '#ffffff', 0.9); } }
        else if (inp.aP && k.item && !k.done && k.spinT <= 0 && k.freezeT <= 0 && state === 'race') useItem(k);
      }
      // projectielen
      for (let n = shots.length - 1; n >= 0; n--) {
        const s = shots[n]; s.age += dt; s.life -= dt;
        const tgt = karts[1 - s.owner];
        // lichte zelfzoeker
        if (s.age > 0.12) {
          const dx = tgt.x - s.x, dz = tgt.z - s.z, dl = Math.hypot(dx, dz) || 1, sp = Math.hypot(s.vx, s.vz), cur = Math.atan2(s.vx, s.vz), want = Math.atan2(dx, dz), ad = angDiff(cur, want);
          if (Math.abs(ad) < 0.6 && dl < 28) { const na = cur + clamp(ad, -1, 1) * Math.min(1, dt * 3.2); s.vx = Math.sin(na) * sp; s.vz = Math.cos(na) * sp; }
        }
        s.x += s.vx * dt; s.z += s.vz * dt; s.m.position.set(s.x, 0.9 + Math.sin(T * 20) * 0.08, s.z); s.m.rotation.y += dt * 8;
        fx.particles.emit(s.x - s.vx * 0.02, 0.9, s.z - s.vz * 0.02, rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), { life: 0.4, size: s.kind === 'fire' ? 0.55 : 0.4, color: s.kind === 'fire' ? (Math.random() < 0.5 ? 0xff8a1a : 0xffd23f) : 0xd8261a, gravity: s.kind === 'fire' ? -1 : 2 });
        let dead = s.life <= 0;
        locate(C, s.x, s.z, s.hint, s.h); s.hint = s.h.idx;
        if (Math.abs(s.h.lat) > HALF_W + WALL_M + 0.3) dead = true;
        // koe
        for (const cw of cows) if (cw.state === 'cross' && Math.hypot(cw.x - s.x, cw.z - s.z) < 1.6) { cowHit(cw, s.vx, s.vz, 1.2); dead = true; }
        // banaan opblazen
        if (s.kind === 'fire') for (let b = bananas.length - 1; b >= 0; b--) if (Math.hypot(bananas[b].x - s.x, bananas[b].z - s.z) < 1.2) { scene.remove(bananas[b].m); bananas.splice(b, 1); dead = true; fx.particles.burst(s.x, 0.6, s.z, { count: 12, speed: 4, up: 1, life: 0.5, size: 0.4, colors: [0xffd92a, 0xffffff], gravity: 8 }); }
        for (const k of karts) {
          if (k.i === s.owner && s.age < 0.45) continue;
          if (k.y > 1.3 || k.done) continue;
          if (Math.hypot(k.x - s.x, k.z - s.z) < k.R + 0.7) {
            if (s.kind === 'fire') { if (k.invT <= 0) { spinOut(k, 'BOEM!', 1.3); dead = true; fx.particles.burst(s.x, 1, s.z, { count: 30, speed: 7, up: 1.3, life: 0.8, size: 0.55, colors: [0xff7a1a, 0xffe070, 0xff4a1a], gravity: 6 }); audio.sfx('explode', { vol: 0.8 }); } }
            else if (k.blindT <= 0 || k.blindT < 1.5) { k.blindT = 4.8; dead = true; audio.sfx('splash', { vol: 0.6, rate: 1.4 }); textUp('KETCHUP!', k.x, 3.8 * k.size, k.z, '#ff5a4a', 1.3); ctx.shake(0.3); fx.particles.burst(s.x, 1, s.z, { count: 26, speed: 6, up: 1.2, life: 0.8, size: 0.5, colors: [0xd8261a, 0xff4a3a, 0xa81410], gravity: 9 }); }
          }
        }
        if (dead) { scene.remove(s.m); shots.splice(n, 1); if (s.life <= 0 || Math.abs(s.h.lat) > HALF_W + WALL_M + 0.3) fx.particles.burst(s.x, 0.8, s.z, { count: 10, speed: 4, up: 1, life: 0.5, size: 0.4, color: s.kind === 'fire' ? 0xff8a1a : 0xd8261a, gravity: 8 }); }
      }
      // bananen
      for (let n = bananas.length - 1; n >= 0; n--) {
        const b = bananas[n]; b.age += dt; b.m.rotation.y += dt * 1.4;
        for (const k of karts) {
          if (k.y > 0.8 || k.done) continue;
          if (b.age < 0.5 && k.i === (b.owner ?? -1)) continue;
          if (Math.hypot(k.x - b.x, k.z - b.z) < k.R + 0.55) {
            if (k.invT > 0) continue;
            scene.remove(b.m); bananas.splice(n, 1); spinOut(k, 'GLIBBER!'); audio.sfx('buzz', { vol: 0.4 }); break;
          }
        }
      }
      // koeien
      for (const cw of cows) {
        cowStep(cw, dt);
        if (cw.state === 'cross') for (const k of karts) {
          if (k.y > 1.0 || k.done) continue;
          if (Math.hypot(k.x - cw.x, k.z - cw.z) < k.R + 1.0) { cowHit(cw, k.vx, k.vz, 1); k.vx *= 0.55; k.vz *= 0.55; k.fwd *= 0.55; k.hop = 0.3; }
        }
      }
      dragonStep(dt); bombStep(dt);
      // rubber band + positie
      const [a, b2] = karts;
      for (const k of karts) {
        const o = karts[1 - k.i], gap = o.prog - k.prog;
        k.rubber = gap > 15 ? 1 + Math.min(0.2, (gap - 15) * 0.011) : gap < -32 ? 0.965 : 1;
        k.invT = Math.max(0, k.invT - dt); k.blindT = Math.max(0, k.blindT - dt); k.driftCd = Math.max(0, k.driftCd - dt);
        if (k.spinT > 0) { k.spinT -= dt; if (k.spinT <= 0) k.ch.pose = 'sit'; }
        if (k.freezeT > 0) { k.freezeT -= dt; k.vx *= 0.8; k.vz *= 0.8; if (k.freezeT <= 0) k.ch.pose = 'sit'; }
        if (k.boostT > 0) { k.boostT -= dt; if (k.boostT <= 0) k.boostStrong = false; }
        // lap-detectie
        const lap = Math.floor(k.prog / N);
        if (lap > k.lap) {
          k.lap = lap;
          if (lap >= LAPS) { if (state === 'race') finishRace(k, 'ronde'); }
          else if (lap >= 1) { audio.sfx('bell', { vol: 0.5 }); textUp(lap === LAPS - 1 ? 'LAATSTE RONDE!' : `RONDE ${lap + 1}`, k.x, 4.2, k.z, k.css, 1.4); hud.toast(`${k.name}: ${lap === LAPS - 1 ? 'laatste ronde!' : 'ronde ' + (lap + 1) + ' van ' + LAPS}`, 1400); }
        } else if (lap < k.lap) k.lap = lap;
        // verkeerde kant op
        const tang = Math.atan2(k.loc.tx, k.loc.tz), ad = Math.abs(angDiff(k.th, tang));
        if (ad > 2.2 && k.fwd > 2 && !k.done) { k.wrongT += dt; if (k.wrongT > 1.6 && T - k.wrongMsgT > 4) { k.wrongMsgT = T; textUp('↩ ANDERS OM!', k.x, 3.6, k.z, '#ff7a5a', 1.1); } } else k.wrongT = 0;
      }
      // hints
      const hintNow = T < 4.5 ? 1 : T < 9 ? 2 : 0;
      if (hintNow !== hintState) { hintState = hintNow; hud.setHint(hintNow === 1 ? `<b>Gas gaat vanzelf</b> · links/rechts sturen · <b>A</b> = voorwerp · <b>B</b> = rem / drift` : hintNow === 2 ? `Rij door de <b>vraagtekens</b> voor voorwerpen · drift met <b>B</b> + sturen, laat los voor een turbo` : null); }
      // HUD
      const rank0 = a.prog >= b2.prog;
      for (const k of karts) {
        const rk = (k.i === 0) === rank0 ? 1 : 2; const lapN = clamp(k.lap + 1, 1, LAPS);
        hud.setPlayerInfo(k.i, `${rk}e plek · ronde ${lapN}/${LAPS}${k.item ? ' · ' + ITEMS[k.item].e + ' ' + ITEMS[k.item].n : k.rollT > 0 ? ' · 🎲' : ''}`);
      }
      hud.setScore(`🏁 ${names[0]}: ${clamp(a.lap + 1, 1, LAPS)}/${LAPS}   –   ${names[1]}: ${clamp(b2.lap + 1, 1, LAPS)}/${LAPS}`);
      hud.setTimer(timeLeftFn(), 15);
    }

    // ---------------- visuals per kart ----------------
    function visuals(dt, stopped = false) {
      for (const k of karts) {
        const m = k.model, sn = Math.sin(k.th), cs = Math.cos(k.th);
        let yaw = k.th, spinA = 0;
        if (k.spinT > 0) { const u = 1 - k.spinT / k.spinDur; spinA = (1 - Math.pow(1 - u, 2)) * TAU * 2; }
        yaw += spinA - (k.drift.on ? k.drift.dir * 0.32 : 0) - k.steerV * 0.05;
        m.root.rotation.y = yaw;
        k.hop = Math.max(0, k.hop - dt * 1.2);
        const hopY = Math.sin(clamp(k.hop / 0.25, 0, 1) * Math.PI) * 0.35;
        m.root.position.set(k.x, k.y + hopY, k.z);
        const spd = Math.hypot(k.vx, k.vz);
        m.tilt.rotation.z = damp(m.tilt.rotation.z, clamp(-k.steerV * 0.16 * clamp(spd / 10, 0.2, 1.3), -0.3, 0.3) + (k.drift.on ? -k.drift.dir * 0.08 : 0), 10, dt);
        m.tilt.rotation.x = damp(m.tilt.rotation.x, k.y > 0.05 ? clamp(-k.vy * 0.04, -0.4, 0.4) : 0, 10, dt);
        k.wheelRot += (k.fwd || 0) * dt / 0.45;
        for (const w of m.wheels) { w.spin.rotation.x = k.wheelRot; if (w.front) w.pivot.rotation.y = -k.steerV * 0.5; }
        m.sw.rotation.z = -k.steerV * 1.2;
        const fl = k.boostT > 0; for (const f of m.flames) { f.visible = fl; if (fl) { f.scale.set(1 + Math.sin(T * 40) * 0.15, 1 + Math.sin(T * 33 + 1) * 0.35 + (k.boostStrong ? 0.8 : 0), 1); } }
        m.flameM.color.setHex(k.boostStrong ? 0xffe14a : 0xff8a1a);
        m.flag.rotation.z = Math.sin(T * 12 + k.i) * 0.3;
        // bestuurder
        const c = k.ch; c.pose = k.spinT > 0 || k.freezeT > 0 ? 'scared' : k.done ? (k === winnerK ? 'cheer' : 'sad') : 'sit'; c.speed = 0; c.update(dt);
        if (c.pose === 'sit') { c.armL.rotation.x = c.armR.rotation.x = -1.25; c.head.rotation.z = -k.steerV * 0.18; }
        // knipperen bij onkwetsbaar
        m.root.visible = !(k.invT > 0 && k.spinT <= 0 && Math.sin(T * 30) > 0.4 && k.invT < 1.2);
        // schaduw
        const sc = (1.5 - clamp(k.y * 0.08, 0, 0.7)) * k.size; k.blob.position.set(k.x, 0.06, k.z); k.blob.scale.setScalar(sc); k.blob.rotation.z = -k.th;
        // tag + icoon
        k.tag.position.set(k.x, 3.4 * k.size + k.y, k.z); k.icon.position.set(k.x, 5.3 * k.size + k.y, k.z);
        const showIcon = (k.item || k.rollT > 0) && !k.done; k.icon.visible = !!showIcon;
        if (showIcon) { const e = k.rollT > 0 ? ITEMS[k.rollIcon || 'banana'].e : ITEMS[k.item].e; if (k.icon.userData.e !== e) { k.icon.userData.e = e; k.icon.material.map = emojiTex(e); k.icon.material.needsUpdate = true; } k.icon.scale.setScalar(1.7 + Math.sin(T * 8) * 0.12); }
        // ketchup (blind)
        k.splats.forEach((s, n) => {
          const on = k.blindT > 0; s.visible = on; if (!on) return;
          const fade = clamp(k.blindT / 1.2, 0, 1), grow = clamp((4.8 - k.blindT) * 6, 0, 1);
          s.position.set(k.x + [0, 1.2, -1.4][n], 1.6 + n * 0.4, k.z + [0, 0.8, 0.5][n]); s.scale.setScalar((n ? 6 : 8.5) * (0.6 + 0.4 * grow)); s.material.opacity = 0.92 * fade; s.material.rotation = n;
        });
        // deeltjes
        const gr = k.y < 0.05, onRoad = Math.abs(k.loc.lat) <= HALF_W + 0.3, surf = onRoad ? C.surf[Math.round(k.loc.idx) % N] : 4;
        const rear = [k.x - sn * 1.2 * k.size, k.z - cs * 1.2 * k.size];
        if (gr && spd > 4 && !stopped) {
          if (!onRoad && Math.random() < dt * 28) fx.particles.emit(rear[0], 0.3, rear[1], rand(-1, 1), rand(1, 2.5), rand(-1, 1), { life: 0.5, size: 0.5, color: 0x6aa84a, gravity: 6 });
          else if (surf === 2 && Math.random() < dt * 36) fx.particles.emit(rear[0], 0.3, rear[1], rand(-1.5, 1.5), rand(1.5, 3.5), rand(-1.5, 1.5), { life: 0.7, size: 0.5, color: 0x5b4328, gravity: 10 });
          else if (surf === 1 && Math.random() < dt * 24) fx.particles.emit(rear[0], 0.3, rear[1], rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), { life: 0.5, size: 0.35, color: 0xe8f8ff, gravity: 2 });
          else if (Math.random() < dt * 8) fx.particles.emit(rear[0], 0.3, rear[1], rand(-0.5, 0.5), 0.5, rand(-0.5, 0.5), { life: 0.5, size: 0.4, color: 0xc8bca8, gravity: -0.4 });
        }
        if (k.drift.on) {
          const col = k.drift.lvl === 2 ? 0xff8a2a : k.drift.lvl === 1 ? 0x6fe0ff : 0xffffff;
          for (const sx of [-1, 1]) if (Math.random() < dt * 55) fx.particles.emit(k.x - sn * 1.1 + cs * sx * 0.8 * -1, 0.35, k.z - cs * 1.1 + sn * sx * 0.8, rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5), { life: 0.35, size: 0.3, color: col, gravity: 8 });
        }
        if (k.boostT > 0 && Math.random() < dt * 60) fx.particles.emit(rear[0] + rand(-0.4, 0.4), 0.7, rear[1] + rand(-0.4, 0.4), -sn * 5, rand(0, 1), -cs * 5, { life: 0.35, size: 0.5, color: k.boostStrong ? 0xffe14a : 0xff9a2a, gravity: 0 });
      }
    }

    // ---------------- camera ----------------
    const camP = new THREE.Vector3(0, 30, 20), camT = new THREE.Vector3(), wantP = new THREE.Vector3(), wantT = new THREE.Vector3();
    let camInit = false, camCine = 0;
    function cam(dt) {
      const a = karts[0], b = karts[1];
      const cx = (a.x + b.x) / 2 + (a.vx + b.vx) * 0.08, cz = (a.z + b.z) / 2 + (a.vz + b.vz) * 0.08;
      const d = Math.hypot(a.x - b.x, a.z - b.z), k = smoothstep(6, 40, d);
      const H = lerp(23, 44, k), Dz = lerp(15, 26, k);
      wantP.set(cx, H, cz + Dz); wantT.set(cx, 0, cz - 1.5);
      if (state === 'finish' && winnerK) {   // winnaarsfoto: dichtbij en schuin
        const w = winnerK; const u = smoothstep(0.2, 1.2, finishT);
        wantP.lerp(new THREE.Vector3(w.x + 3.5, 10.5, w.z + 8.5), u); wantT.lerp(new THREE.Vector3(w.x, 1.8, w.z), u);
      }
      if (!camInit) { camP.copy(wantP); camT.copy(wantT); camInit = true; }
      const f = 1 - Math.exp(-(state === 'finish' ? 3.2 : 4.5) * dt);
      camP.lerp(wantP, f); camT.lerp(wantT, f); camera.position.copy(camP); camera.lookAt(camT);
    }

    // ---------------- einde ----------------
    let photoEl = null, confettiT = 0;
    function finishRace(winner, why) {
      if (state !== 'race') return;
      state = 'finish'; winnerK = winner; finishT = 0; const loser = karts[1 - winner.i];
      karts.forEach((k) => { k.done = true; k.drift.on = false; });
      hud.showBig('FINISH!', 1300, winner.css); audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.6 }); hud.setHint(null);
      const sc = karts.map((k) => clamp(Math.floor(k.prog / N), 0, LAPS));
      const lead = Math.round(Math.abs(winner.prog - loser.prog));
      const jokes = [`${winner.name} snelt als een kasteelspook over de finish!`, `${loser.name} stond nog te praten met een koe...`, `Een volle ronde ketchup voor ${loser.name}? Volgende keer beter!`, `${winner.name} is de snelste van het kasteel!`];
      ctx.finishPvp({ winner: winner.i, score: sc, delay: 4200, summary: `${why === 'tijd' ? 'Tijd is om: ' : ''}<b>${winner.name}</b> wint met ${lead} meter voorsprong!<br>${pick(jokes)}` });
    }
    function makePhoto() {
      try {
        const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:44;box-sizing:border-box;border:16px solid #fffdf5;border-bottom:78px solid #fffdf5;box-shadow:inset 0 0 40px rgba(0,0,0,.35),0 0 60px rgba(0,0,0,.5);opacity:0;transition:opacity .25s;display:flex;align-items:flex-end;justify-content:center';
        const cap = document.createElement('div'); cap.style.cssText = "position:absolute;left:0;right:0;bottom:-70px;height:62px;text-align:center;font-family:'MedievalSharp',serif;font-size:30px;line-height:62px;color:#3a2a1a"; cap.textContent = `📸 ${winnerK.name} wint de Kasteel-Kartrace!`;
        el.append(cap); (document.getElementById('hud') || document.body).append(el); photoEl = el; requestAnimationFrame(() => { el.style.opacity = '1'; });
        const fl = document.createElement('div'); fl.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.9;transition:opacity .5s;pointer-events:none;z-index:46'; (document.getElementById('hud') || document.body).append(fl); requestAnimationFrame(() => { fl.style.opacity = '0'; }); setTimeout(() => fl.remove(), 700);
      } catch (e) { /* geen DOM: geen foto */ }
    }
    let photoDone = false, trophy = null;
    function makeTrophy() {
      const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffa500, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.25 });
      g.add(mesh(new THREE.CylinderGeometry(0.95, 0.45, 1.1, 14), gold, { pos: [0, 1.5, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 8), gold, { pos: [0, 0.75, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.25, 12), gold, { pos: [0, 0.3, 0] }));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 12), gold, { pos: [sx * 1.0, 1.55, 0], rot: [0, 0, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0, 2.2, 0] }));
      g.scale.setScalar(1.25); scene.add(g); return g;
    }
    function finishStep(dt) {
      finishT += dt;
      for (const k of karts) { const w = k === winnerK; if (w) { k.fwd *= Math.exp(-1.1 * dt); k.vx *= Math.exp(-1.1 * dt); k.vz *= Math.exp(-1.1 * dt); } else { k.vx *= Math.exp(-1.6 * dt); k.vz *= Math.exp(-1.6 * dt); } k.x += k.vx * dt; k.z += k.vz * dt; clampWall(k, true); k.boostT = 0; k.spinT = Math.max(0, k.spinT - dt);
        if (w) { k.hop = 0.25 * (Math.sin(finishT * 7) > 0.6 ? 1 : 0); k.th += dt * 0.9 * clamp(finishT / 1.4, 0, 1); } }
      if (finishT > 0.5 && !trophy && winnerK) trophy = makeTrophy();
      if (trophy) { const w = winnerK; const u = clamp((finishT - 0.5) / 0.5, 0, 1); trophy.position.set(w.x, 3.2 + Math.sin(finishT * 3) * 0.2 + (1 - u) * 4, w.z); trophy.rotation.y = finishT * 2.2; trophy.scale.setScalar(1.25 * u); }
      if (finishT > 1.2 && !photoDone) { photoDone = true; makePhoto(); audio.sfx('sparkle', { vol: 0.8 }); audio.sfx('bell', { vol: 0.5 }); ctx.shake(0.2); }
      if (finishT > 0.4) { confettiT -= dt; if (confettiT <= 0) { confettiT = 0.14; const w = winnerK; for (let q = 0; q < 2; q++) fx.particles.burst(w.x + rand(-3, 3), 7 + rand(0, 3), w.z + rand(-3, 3), { count: 14, speed: 3, up: 0.2, spread: 1.2, life: 2.0, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff, 0xff8a3a], gravity: 3.5 }); } }
      world.cheerCrowd();
    }
    function postUpdate(dt) { T += dt; finishStep(dt); visuals(dt, true); world.update(T, dt); cam(dt); for (const cw of cows) if (cw.state === 'cross' || cw.state === 'fly') cowStep(cw, dt); dragonStep(dt); bombStep(dt); }

    // ---------------- hoofdlus ----------------
    function driftEvents(k, dt) {
      const inp = ctx.pvp.input(k.i), Dr = k.drift, locked = k.spinT > 0 || k.freezeT > 0 || k.done;
      const fwd = k.vx * Math.sin(k.th) + k.vz * Math.cos(k.th), air = k.y > 0.02;
      if (locked || air) { if (Dr.on) endDrift(k, false); return; }
      if (!Dr.on) {
        if (k.driftCd <= 0 && inp.b && fwd > 6 && Math.abs(inp.x) > (inp.bP ? 0.2 : 0.55)) startDrift(k, Math.sign(inp.x));
      } else {
        const prevLvl = Dr.lvl; Dr.t += dt; Dr.lvl = Dr.t > 1.35 ? 2 : Dr.t > 0.6 ? 1 : 0;
        if (Dr.lvl > prevLvl) { audio.sfx('click', { vol: 0.4, rate: 1.4 + Dr.lvl * 0.4 }); fx.particles.ring(k.x, 0.5, k.z, { count: 10, speed: 3, color: Dr.lvl === 2 ? 0xff8a2a : 0x6fe0ff, size: 0.3, life: 0.3 }); }
        if (!inp.b || fwd < 4 || (Math.sign(inp.x) === -Dr.dir && Math.abs(inp.x) > 0.85)) endDrift(k, true);
      }
    }
    function update(dt) {
      if (done) return;
      if (state === 'finish') { postUpdate(dt); return; }
      T += dt;
      for (const k of karts) driftEvents(k, dt);
      const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
      for (let s = 0; s < n; s++) { for (const k of karts) stepKart(k, h, true); bump(karts[0], karts[1]); }
      perFrame(dt);
      if (T >= TIME_LIMIT && state === 'race') { const w = karts[0].prog >= karts[1].prog ? karts[0] : karts[1]; hud.toast('Tijd is om!', 1500); finishRace(w, 'tijd'); }
      visuals(dt); world.update(T, dt); cam(dt);
    }
    let introT = 0;
    function introUpdate(dt) {
      introT += dt; T = 0;
      karts.forEach((k) => { k.ch.pose = 'sit'; });
      visuals(dt, true); world.update(introT, dt);
      // filmische blik over het circuit, daarna naar de startopstelling
      const a = Math.min(1, introT / 6), ang = -0.6 + introT * 0.12;
      const sp = pointAt(C, 0, 0);
      camera.position.set(lerp(Math.sin(ang) * 40, sp.x + 4, a * a * 0.6), lerp(34, 26, a), lerp(Math.cos(ang) * 30 + 8, sp.z + 20, a * a * 0.6));
      camera.lookAt(lerp(0, sp.x + 8, a * a * 0.6), 0, lerp(0, sp.z - 2, a * a * 0.6));
      camP.copy(camera.position); camT.set(lerp(0, sp.x + 8, a * a * 0.6), 0, lerp(0, sp.z - 2, a * a * 0.6)); camInit = true;
      hud.setTimer(TIME_LIMIT); hud.setScore(`🏁 ${LAPS} rondes · ${names[0]} tegen ${names[1]}`);
    }
    function resultUpdate(dt) { postUpdate(dt); }

    hud.setTimer(TIME_LIMIT); hud.setScore(`🏁 ${LAPS} rondes`);
    visuals(0.016, true); world.update(0, 0.016);
    return {
      update, introUpdate, resultUpdate,
      onStart() { started = true; hud.setHint(null); },
      celebrate(w) { karts[w].ch.pose = 'cheer'; karts[1 - w].ch.pose = 'sad'; world.cheerCrowd(); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && !karts[i].done) { karts[i].freezeT = 1.6; karts[i].vx = karts[i].vz = 0; karts[i].fwd = 0; textUp('BEWOOOGD!', karts[i].x, 3.6, karts[i].z, '#ff5a5a', 1.2); audio.sfx('hurt'); } }); },
      onSwap() { karts.forEach((k) => { fx.particles.ring(k.x, 1, k.z, { count: 20, speed: 5, color: 0xffe14a, size: 0.4, life: 0.5 }); textUp('WISSEL!', k.x, 3.8, k.z, '#ffe14a', 1.2); }); },
      dispose() { try { photoEl && photoEl.remove(); } catch (e) { /* weg */ } },
      dbg: {
        C, karts, cows, boxes, bananas, shots, patches, bombs, D,
        state: () => ({ T, state, finishT, winner: winnerK ? winnerK.i : -1, dragon: D.state, k: karts.map((k) => ({ x: k.x, z: k.z, th: k.th, vx: k.vx, vz: k.vz, fwd: k.fwd, y: k.y, prog: k.prog, lap: k.lap, idx: k.loc.idx, lat: k.loc.lat, item: k.item, roll: k.rollT, boost: k.boostT, spin: k.spinT, blind: k.blindT, drift: k.drift.on, dlvl: k.drift.lvl, done: k.done, freeze: k.freezeT, rubber: k.rubber })) }),
        use: (i) => useItem(karts[i]),
        giveItem: (i, it) => { karts[i].item = it; karts[i].rollT = 0; },
        warp: (i, idx, lat = 0, fwd = 8) => { const k = karts[i], p = pointAt(C, idx, lat); k.x = p.x; k.z = p.z; k.th = Math.atan2(p.tx, p.tz); k.vx = p.tx * fwd; k.vz = p.tz * fwd; k.fwd = fwd; locate(C, k.x, k.z, idx, k.loc); k.prog = Math.max(0, Math.floor(k.prog / N)) * N + (((idx % N) + N) % N); },
        cowAt: (n) => { cows[n].state = 'wait'; cows[n].t = 0; },
        dragonNow: () => { D.t = 0; },
        finishNow: (i, why) => finishRace(karts[i], why),
      },
    };
  },
};

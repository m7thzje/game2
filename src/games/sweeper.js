import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, TAU, glow, angDiff, canvasTex } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { KEY_LABELS } from '../engine/input.js';
import * as P from '../engine/props.js';

// Zwaaibalk (à la Fall Guys "Sweeper"): een draaiende toren met zwaaibalken op een steen platform in de slotgracht.
// Lage balk = SPRINGEN (A), hoge balk = BUKKEN (B vasthouden). Wie geraakt wordt vliegt in de gracht.
// Terugkeer: partner redt (A vasthouden bij de rand, 1,5 s), levensbron-orb, of na 8 s met het vlot.

const DURATION = 60;
const WATER_Y = -1.0;
const CORE_R = 4;
const TOWER_PAD = 2.0;
const RINGS = [[4, 6.5, 12], [6.5, 9, 16], [9, 11.5, 20]];   // [r0, r1, aantal tegels]
const BEAM_L = 11.2;
const GRAV = 26, JUMP_V = 9.6;
const RAFT_TIME = 8, RESCUE_TIME = 1.5, RESCUE_DIST = 4.0;
const WALL_R = 26.5;

const LOW = { y: 0.38, top: 0.64 };      // lage balk: raakt je als je voeten lager dan 'top' zijn
const HIGH = { y: 1.3, bottom: 1.02 };   // hoge balk: raakt je als je hoofd hoger dan 'bottom' komt

const deg = (d) => d * Math.PI / 180;

function stripeTex(c1, c2) {
  return canvasTex(32, 64, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,.16)'; for (let i = 0; i < 10; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 8 + Math.random() * 10);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, h / 2 - 2, w, 3); g.fillRect(0, h - 2, w, 3);
  }, { repeat: [1, 7] });
}

function sectorGeo(r0, r1, a0, a1, depth) {
  const sh = new THREE.Shape();
  const seg = Math.max(2, Math.ceil((a1 - a0) / 0.14));
  for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; const x = Math.cos(a) * r1, y = -Math.sin(a) * r1; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
  for (let i = seg; i >= 0; i--) { const a = a0 + (a1 - a0) * i / seg; sh.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0); }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -depth - 0.05, 0);
  return g;
}

export default {
  id: 'sweeper',
  name: 'Zwaaibalk',
  giver: 'Kapitein Karel',
  icon: '🏰',
  mode: 'coop',
  time: DURATION,
  pay: 1.1,
  music: 'game_fast',
  blurb: 'De wachters van <b>Kapitein Karel</b> trainen hun reflexen! Op het platform in de slotgracht draait een toren met <b>zwaaibalken</b>. <b>Spring</b> over de lage balk en <b>buk</b> onder de hoge. Wie geraakt wordt, vliegt in de gracht, dus help elkaar eruit! Houd het samen <b>60 seconden</b> vol.',
  controls: ['{move} lopen', '{a} springen (vasthouden bij de rand = broer redden)', '{b} bukken (vasthouden)'],
  tip: 'Geel gestreept = lage balk, springen! Rood gestreept = hoge balk, bukken! Zwemt je broer? Ga bij de rand staan en houd A vast.',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const R = ctx.rng;
    const rr = (a, b) => a + R() * (b - a);
    const diff = ctx.difficulty || 1;
    ctx.lights('day', { shadow: 21, center: [0, 0, 0], fogNear: 70, fogFar: 190 });

    const group = new THREE.Group(); scene.add(group);
    const anims = [];   // functies (t, dt) die elke frame lopen
    let T = 0;          // wereldklok voor animaties

    // =====================================================================
    //  WERELD
    // =====================================================================
    // ---- water (kolkend) ----
    const wTex = tex.water(9, 9).clone(); wTex.needsUpdate = true;
    const water = mesh(new THREE.CircleGeometry(28, 64), new THREE.MeshStandardMaterial({ map: wTex, color: 0x5e97c8, roughness: 0.3, metalness: 0.1, emissive: 0x08264a, emissiveIntensity: 0.5 }), { cast: false });
    water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; group.add(water);
    const wTex2 = tex.water(5, 5).clone(); wTex2.needsUpdate = true;
    const water2 = mesh(new THREE.CircleGeometry(28, 64), new THREE.MeshBasicMaterial({ map: wTex2, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), { cast: false, receive: false });
    water2.rotation.x = -Math.PI / 2; water2.position.y = WATER_Y + 0.03; group.add(water2);
    anims.push((t, dt) => { water.rotation.z += dt * 0.05; water2.rotation.z -= dt * 0.09; wTex.offset.x += dt * 0.012; wTex2.offset.y -= dt * 0.02; });

    // ---- buitenwereld ----
    const grass = mesh(new THREE.RingGeometry(26, 150, 48, 1), new THREE.MeshStandardMaterial({ map: tex.grass(70, 70), roughness: 1 }), { cast: false });
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.4; group.add(grass);
    for (let i = 0; i < 12; i++) {
      const a = deg(190 + (i / 11) * 160) + rr(-0.05, 0.05), r = rr(36, 62);
      const tr = i % 4 === 0 ? P.pine(rr(6, 9)) : P.tree(rr(5, 8));
      tr.position.set(Math.cos(a) * r, -0.4, Math.sin(a) * r); group.add(tr);
    }
    for (let i = 0; i < 7; i++) {
      const a = deg(200 + i * 22), r = rr(88, 105);
      const m = mesh(new THREE.ConeGeometry(rr(14, 22), rr(22, 36), 6), mat(i % 2 ? 0x7a8aa6 : 0x6d7d9a), { cast: false, receive: false, pos: [Math.cos(a) * r, 8, Math.sin(a) * r] }); group.add(m);
    }
    for (const [x, y, z, s] of [[-30, 34, -60, 1.6], [25, 40, -70, 2], [60, 30, -30, 1.4], [-60, 32, -20, 1.5]]) { const c = P.cloud(s); c.position.set(x, y, z); group.add(c); anims.push((t, dt) => { c.position.x += dt * 0.6; if (c.position.x > 90) c.position.x = -90; }); }

    // ---- kasteelmuur rondom ----
    const wallMat = new THREE.MeshStandardMaterial({ map: tex.stone(2.5, 1.8), roughness: 0.95, flatShading: true });
    const NSEG = 20, segW = 2 * WALL_R * Math.tan(Math.PI / NSEG) + 0.5;
    for (let i = 0; i < NSEG; i++) {
      const a = i / NSEG * TAU;
      const w = mesh(new THREE.BoxGeometry(segW, 7, 2.4), wallMat, { cast: false, pos: [Math.cos(a) * WALL_R, 2.5, Math.sin(a) * WALL_R], rot: [0, -(a + Math.PI / 2), 0] });
      group.add(w);
    }
    // tinnen
    {
      const N = 66, merlon = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.2, 0.9), mat(0xa4a5ad), N);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < N; i++) {
        const a = (i + 0.5) / N * TAU; q.setFromAxisAngle(up, -(a + Math.PI / 2));
        p.set(Math.cos(a) * (WALL_R + 0.75), 6.6, Math.sin(a) * (WALL_R + 0.75)); m4.compose(p, q, s); merlon.setMatrixAt(i, m4);
      }
      merlon.castShadow = false; group.add(merlon);
    }
    // torens met vlaggen
    const flags = [];
    const flagColors = [0xd8372c, 0x2b5fd8, 0xf2c230, 0x2f9e5b];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU;
      const tw = P.tower(9.5, 2.5); tw.position.set(Math.cos(a) * WALL_R, -1, Math.sin(a) * WALL_R);
      tw.traverse((o) => { if (o.isMesh) o.castShadow = false; }); group.add(tw);
      const f = P.banner(flagColors[i % 4], 2.6, 1.6); f.position.set(Math.cos(a) * WALL_R, 13.8, Math.sin(a) * WALL_R); f.rotation.y = -a + 0.6; group.add(f); flags.push(f);
    }
    // vlaggen/banieren aan de muur
    for (let i = 0; i < 16; i++) {
      const a = (i + 0.0) / 16 * TAU + 0.12;
      const b = mesh(new THREE.BoxGeometry(1.5, 3.2, 0.1), mat(i % 2 ? 0xb8322a : 0x2b4fa8, { side: THREE.DoubleSide }), { cast: false, pos: [Math.cos(a) * (WALL_R - 1.28), 3.2, Math.sin(a) * (WALL_R - 1.28)], rot: [0, -(a + Math.PI / 2), 0] });
      group.add(b);
    }
    // vuurkommen/fakkels op de muur
    const torches = [];
    for (let i = 0; i < 9; i++) {
      const a = deg(8 + i * 40);
      const tc = P.torch(); if (tc.userData.light) { tc.remove(tc.userData.light); delete tc.userData.light; }
      tc.position.set(Math.cos(a) * (WALL_R - 0.9), 6, Math.sin(a) * (WALL_R - 0.9)); tc.scale.setScalar(1.3); group.add(tc); torches.push(tc);
    }
    // de grote burcht achter de noordmuur
    {
      const keep = mesh(new THREE.BoxGeometry(26, 18, 12), wallMat, { cast: false, pos: [0, 8, -40] }); group.add(keep);
      for (const x of [-15, 15]) { const tw = P.tower(24, 3.4); tw.position.set(x, -1, -40); tw.traverse((o) => { if (o.isMesh) o.castShadow = false; }); group.add(tw); const f = P.banner(0xd8372c, 3, 2); f.position.set(x, 31, -40); group.add(f); flags.push(f); }
      const mid = P.tower(32, 3.8); mid.position.set(0, -1, -44); mid.traverse((o) => { if (o.isMesh) o.castShadow = false; }); group.add(mid);
      const f = P.banner(0xf2c230, 4, 2.6); f.position.set(0, 39.6, -44); group.add(f); flags.push(f);
      for (let i = 0; i < 6; i++) group.add(mesh(new THREE.BoxGeometry(1.1, 1.6, 0.2), glow(0xffd27a, 0.9), { cast: false, pos: [-8 + i * 3.2, 9 + (i % 2) * 3, -33.9] }));
    }
    // koninklijke loge met Kapitein Karel (links van het midden, zodat de timer hem niet bedekt)
    const royals = [];
    let karel, laughT = 0, karelPos = new THREE.Vector3();
    {
      const phi = deg(233), r0 = WALL_R - 1.25;
      const box = new THREE.Group(); box.position.set(Math.cos(phi) * r0, 0, Math.sin(phi) * r0); box.rotation.y = Math.atan2(-Math.cos(phi), -Math.sin(phi)); group.add(box);
      box.add(mesh(new THREE.BoxGeometry(8, 0.3, 4), new THREE.MeshStandardMaterial({ map: tex.planks(3, 1), roughness: 0.9 }), { cast: false, pos: [0, 5.9, 1.8] }));
      for (const x of [-3.6, 3.6]) box.add(mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), mat(0x5b3d24), { cast: false, pos: [x, 4.6, 3.6] }));
      const rail = P.fence(8, 1); rail.position.set(0, 6.0, 3.7); box.add(rail);
      box.add(mesh(new THREE.BoxGeometry(5.6, 1.2, 0.12), new THREE.MeshStandardMaterial({ map: tex.sign('Kapitein Karel', { w: 384, h: 80, size: 40, bg: '#6b1f1f', fg: '#ffe9a0' }) }), { cast: false, pos: [0, 4.4, 0.1] }));
      for (const x of [-4.2, 4.2]) box.add(mesh(new THREE.BoxGeometry(1.2, 3.4, 0.1), mat(0xb8322a, { side: THREE.DoubleSide }), { cast: false, pos: [x, 7.4, 0.1] }));
      const kar = makeNPC('captain'); kar.group.position.set(0, 6.05, 1.8); kar.faceDir(0, 1); box.add(kar.group);
      const pr = makeNPC('princess'); pr.group.position.set(-2.8, 6.05, 1.8); pr.faceDir(0.3, 1); box.add(pr.group);
      const jes = makeNPC('jester'); jes.group.position.set(2.8, 6.05, 1.8); jes.faceDir(-0.3, 1); jes.pose = 'dance'; box.add(jes.group);
      royals.push(kar, pr, jes); karel = kar; royals.forEach((c) => c.group.traverse((o) => { if (o.isMesh) o.castShadow = false; }));
      karelPos.set(Math.cos(phi) * (r0 - 1.8), 10.8, Math.sin(phi) * (r0 - 1.8));
    }
    // toeschouwende wachters op de muur
    const guards = [];
    {
      const spots = [198, 214, 252, 290, 306, 322, 338];
      spots.forEach((d, i) => {
        const a = deg(d); const g = makeNPC(i % 3 === 0 ? 'captain' : 'guard', i % 3 === 0 ? { scale: 1.0, hatColor: 0x2b5fd8, cape: 0x2b5fd8 } : {});
        g.group.position.set(Math.cos(a) * (WALL_R - 0.9), 6, Math.sin(a) * (WALL_R - 0.9)); g.faceTowards(0, 0);
        g.group.traverse((o) => { if (o.isMesh) o.castShadow = false; }); group.add(g.group); guards.push({ c: g, ph: R() * 6, cheerT: 0 });
      });
    }

    // ---- platform: kern + tegels ----
    const stoneTex = tex.stone(0.2, 0.2);
    const coreMat = new THREE.MeshStandardMaterial({ map: tex.stone(1.8, 1.8), roughness: 0.95, flatShading: true });
    const core = mesh(new THREE.CylinderGeometry(CORE_R, CORE_R, 1.25, 40), coreMat, { pos: [0, -0.625, 0] }); group.add(core);
    // gouden ring-rand en runen rond de toren
    group.add(mesh(new THREE.RingGeometry(2.25, 2.45, 48), new THREE.MeshBasicMaterial({ color: 0xffcf3a }), { cast: false, receive: false, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] }));
    const runes = mesh(new THREE.RingGeometry(3.3, 3.45, 48, 1), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.55 }), { cast: false, receive: false, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] }); group.add(runes);
    anims.push((t) => { runes.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.2; });
    const CORE = { state: 'solid', core: true };
    const tiles = RINGS.map(([r0, r1, n], k) => {
      const arr = [];
      for (let j = 0; j < n; j++) {
        const a0 = j / n * TAU, a1 = (j + 1) / n * TAU - 0.012;
        const m = new THREE.Mesh(sectorGeo(r0, r1 - 0.012, a0, a1, 1.2), new THREE.MeshStandardMaterial({ map: stoneTex, color: (j + k) % 2 ? 0xf0ece6 : 0xd6d0c6, roughness: 0.95, flatShading: true, emissive: 0x000000 }));
        m.castShadow = true; m.receiveShadow = true; group.add(m);
        const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
        arr.push({ mesh: m, ring: k, idx: j, state: 'solid', t: 0, vy: 0, cx: Math.cos(am) * rm, cz: Math.sin(am) * rm, spin: [rr(-2, 2), rr(-1, 1), rr(-2, 2)] });
      }
      return arr;
    });
    function tileAt(x, z) {
      const r = Math.hypot(x, z);
      if (r < CORE_R) return CORE;
      for (let k = 0; k < RINGS.length; k++) {
        const [r0, r1, n] = RINGS[k];
        if (r >= r0 && r < r1) { let a = Math.atan2(z, x); if (a < 0) a += TAU; return tiles[k][Math.min(n - 1, Math.floor(a / (TAU / n)))]; }
      }
      return null;
    }
    const solid = (t) => !!t && (t.state === 'solid' || t.state === 'warn');
    const onGround = (x, z) => solid(tileAt(x, z));

    // ---- toren ----
    const towerBase = mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.6, 20), mat(0x8a8b93), { pos: [0, 0.3, 0] }); group.add(towerBase);
    const spinner = new THREE.Group(); group.add(spinner);
    spinner.add(mesh(new THREE.CylinderGeometry(0.95, 1.15, 5.2, 16), new THREE.MeshStandardMaterial({ map: tex.stone(3, 2), roughness: 0.9, flatShading: true }), { pos: [0, 3.2, 0] }));
    for (const y of [LOW.y, HIGH.y]) spinner.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.45, 16), mat(0x6b4a2e), { pos: [0, y + 0.6, 0] }));
    for (const y of [2.4, 3.4, 4.5]) spinner.add(mesh(new THREE.TorusGeometry(1.0, 0.07, 6, 18), mat(0x4a4a55, { metalness: 0.6 }), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] }));
    // schietgaten/ramen in de toren
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; spinner.add(mesh(new THREE.BoxGeometry(0.22, 0.6, 0.12), glow(0xffa030, 0.9), { cast: false, pos: [Math.cos(a) * 1.0, 3.7, Math.sin(a) * 1.0], rot: [0, -a + Math.PI / 2, 0] })); }
    const roof = new THREE.Group(); group.add(roof);
    roof.add(mesh(new THREE.CylinderGeometry(1.35, 1.0, 0.5, 16), mat(0x6b4a2e), { pos: [0, 6.0, 0] }));
    roof.add(mesh(new THREE.ConeGeometry(1.5, 1.9, 12), mat(0xb8322a), { pos: [0, 7.2, 0] }));
    roof.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(0xffcf3a, 1), { pos: [0, 8.25, 0] }));
    const towerFlag = P.banner(0xf2c230, 1.4, 1.2); towerFlag.position.set(0, 8.2, 0); roof.add(towerFlag); flags.push(towerFlag);

    // ---- zwaaibalken ----
    const beamTexLow = stripeTex('#f2c230', '#2b2118'), beamTexHigh = stripeTex('#e8e2d6', '#c0281f');
    const spikeGeo = new THREE.ConeGeometry(0.17, 0.62, 6);
    function makeBeam(type, off) {
      const lowT = type === 'low';
      const y = lowT ? LOW.y : HIGH.y;
      const g = new THREE.Group(); group.add(g);
      const logGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 12); logGeo.rotateZ(-Math.PI / 2); logGeo.translate(0.5, 0, 0);
      const log = mesh(logGeo, new THREE.MeshStandardMaterial({ map: lowT ? beamTexLow : beamTexHigh, roughness: 0.8 }), { pos: [0.7, y, 0] }); g.add(log);
      // stekels (instanced) - 3 richtingen per station
      const stations = []; for (let x = 1.9; x < BEAM_L - 0.6; x += 1.05) stations.push(x);
      const dirs = lowT ? [[0, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0]] : [[Math.PI, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0]];
      const spikes = new THREE.InstancedMesh(spikeGeo, mat(0x4a4d58, { metalness: 0.7, roughness: 0.4 }), stations.length * 3);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
      let n = 0;
      stations.forEach((x) => dirs.forEach(([rx]) => { e.set(rx, 0, 0); q.setFromEuler(e); const off2 = 0.42; pp.set(x, y + (rx === 0 ? off2 : rx === Math.PI ? -off2 : 0), rx === Math.PI / 2 ? off2 : rx === -Math.PI / 2 ? -off2 : 0); m4.compose(pp, q, one); spikes.setMatrixAt(n++, m4); }));
      spikes.castShadow = true; g.add(spikes);
      const capMat = lowT ? mat(0x3a3a44, { metalness: 0.6 }) : glow(0xff3a2a, 1.6);
      const cap = mesh(new THREE.SphereGeometry(lowT ? 0.55 : 0.5, 12, 8), capMat, { pos: [BEAM_L, y, 0] }); g.add(cap);
      if (lowT) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const sp = mesh(spikeGeo, mat(0x6a6d78, { metalness: 0.7 }), { pos: [BEAM_L + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, 0], rot: [0, 0, a - Math.PI / 2] }); g.add(sp); cap.userData.sp = (cap.userData.sp || []).concat(sp); }
      const shadow = mesh(new THREE.PlaneGeometry(1, 1.0), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0] });
      const sg = new THREE.PlaneGeometry(1, 1); sg.translate(0.5, 0, 0); shadow.geometry = sg; g.add(shadow);
      return { type, lowT, y, off, g, log, spikes, cap, shadow, stations, len: 0, active: false, ang: 0, prev: 0, grow: 0, nextAdd: 0 };
    }
    const beams = [makeBeam('low', 0), makeBeam('high', Math.PI), makeBeam('low', Math.PI / 2)];
    function setBeamLen(b, len) {
      b.len = len; b.g.visible = len > 0.8;
      const bl = Math.max(0.01, len - 0.7);
      b.log.scale.x = bl;
      b.cap.position.x = len; if (b.cap.userData.sp) b.cap.userData.sp.forEach((s, i) => { const a = i / 6 * TAU; s.position.x = len + Math.cos(a) * 0.5; });
      b.cap.visible = len > 2;
      b.shadow.scale.set(len, 1.0, 1);
      let c = 0; b.stations.forEach((x) => { if (x < len - 0.4) c++; });
      b.spikes.count = c * 3;
    }
    beams.forEach((b) => setBeamLen(b, 0));

    // ---- spelers ----
    const START = [[-4.4, 3.8], [4.4, 3.8]];
    const pl = players.map((pi, i) => {
      const c = makeBrother(i); c.group.position.set(START[i][0], 0, START[i][1]); c.faceDir(-START[i][0], -START[i][1]); group.add(c.group);
      const ring = mesh(new THREE.TorusGeometry(0.62, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i] }), { cast: false, receive: false, pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0] }); group.add(ring);
      // markering die krimpt voor het vlot
      const mark = mesh(new THREE.TorusGeometry(1, 0.09, 6, 32), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9 }), { cast: false, receive: false, rot: [Math.PI / 2, 0, 0] }); mark.visible = false; group.add(mark);
      const prog = mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x7affd0, transparent: true, opacity: 0.55, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); prog.visible = false; group.add(prog);
      return { i, c, ring, mark, prog, name: pi.name, x: START[i][0], z: START[i][1], y: 0, vx: 0, vz: 0, vy: 0, duck: 0, state: 'play', inv: 1.2, swimT: 0, rescue: 0, helpT: 0, poseT: 0, nearMissCd: 0, ft: 0, last: { x: 0, z: 0 }, hop: null, raft: null, tick: 0, ripT: 0 };
    });

    // ---- redding: touw, vlot, levensbron, munten ----
    const rope = mesh(new THREE.BoxGeometry(0.1, 0.1, 1), glow(0x7affd0, 1.2), { cast: false, receive: false }); rope.visible = false; group.add(rope);
    function makeRaft() {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.25, 2.0), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1), roughness: 0.9 }), { pos: [0, 0, 0] }));
      for (const x of [-1.0, 1.0]) g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.1, 8), mat(0x8a5a2b), { pos: [x, 0.05, 0], rot: [Math.PI / 2, 0, 0] }));
      const mast = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat(0x5b3d24), { pos: [-0.9, 0.9, -0.7] }); g.add(mast);
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), mat(0xf2c230, { side: THREE.DoubleSide }), { cast: false, pos: [-0.55, 1.45, -0.7] }));
      group.add(g); return g;
    }
    const orb = new THREE.Group(); group.add(orb); orb.visible = false;
    {
      orb.add(mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: 0x7affd0, emissive: 0x2affb0, emissiveIntensity: 1.6, flatShading: true }), { cast: false, pos: [0, 1.2, 0] }));
      const halo = mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 24), new THREE.MeshBasicMaterial({ color: 0xbfffe8 }), { cast: false, pos: [0, 1.2, 0], rot: [Math.PI / 2, 0, 0] }); orb.add(halo); orb.userData.halo = halo;
      orb.add(mesh(new THREE.CylinderGeometry(0.55, 0.9, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7affd0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), { cast: false, receive: false, pos: [0, 3.5, 0] }));
      orb.add(mesh(new THREE.CircleGeometry(1.3, 20), new THREE.MeshBasicMaterial({ color: 0x7affd0, transparent: true, opacity: 0.35, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0] }));
    }
    const orbS = { on: false, x: 0, z: 0, life: 0, used: false };
    const coinsL = [];   // { obj, x, z, life }

    // ---- splash-effecten (gepoold) ----
    const rippleGeo = new THREE.RingGeometry(0.8, 1, 32);
    const ripples = [];
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; group.add(m); ripples.push({ m, t: 0, life: 1, max: 3, on: false }); }
    let ripN = 0;
    function ripple(x, z, max = 4, life = 1.0) { const r = ripples[ripN++ % ripples.length]; r.on = true; r.t = 0; r.life = life; r.max = max; r.m.position.set(x, WATER_Y + 0.07, z); r.m.visible = true; }
    const colGeo = new THREE.CylinderGeometry(0.7, 1.1, 1, 14, 1, true);
    const cols = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; group.add(m); cols.push({ m, t: 0, on: false, s: 1 }); }
    let colN = 0;
    function splash(x, z, big = 1) {
      fx.particles.burst(x, WATER_Y + 0.2, z, { count: Math.round(34 * big), speed: 6.5 * big, up: 1.9, life: 1.1, size: 0.55, colors: [0xffffff, 0xcdeaff, 0x8fcfff], gravity: 15 });
      fx.particles.burst(x, WATER_Y + 0.2, z, { count: 14, speed: 3, up: 3.2, life: 1.3, size: 0.4, color: 0xffffff, gravity: 12 });
      fx.particles.ring(x, WATER_Y + 0.2, z, { count: 22, speed: 6, life: 0.7, size: 0.4, color: 0xe8f6ff });
      ripple(x, z, 5.5 * big, 1.3); ripple(x, z, 3.5 * big, 0.8);
      const c = cols[colN++ % cols.length]; c.on = true; c.t = 0; c.s = big; c.m.position.set(x, WATER_Y, z); c.m.visible = true;
      audio.sfx('splash', { vol: 0.9 * Math.min(1, big) });
    }

    // ---- inslagen (rotsen/pijlen) ----
    const fillGeo = new THREE.CircleGeometry(1, 28), outGeo = new THREE.RingGeometry(0.9, 1, 28);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.45, depthWrite: false });
    const outMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.9, depthWrite: false });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c7880, roughness: 0.9, flatShading: true, emissive: 0x3a1000, emissiveIntensity: 0.6 });
    const strikes = [];
    const decals = [];
    function addStrike(x, z, kind, delay = 0, warn = 1.5) {
      const rad = kind === 'rock' ? 1.7 : 0.85;
      const gg = new THREE.Group(); gg.position.set(x, 0.06, z);
      const f = new THREE.Mesh(fillGeo, fillMat); f.rotation.x = -Math.PI / 2; f.position.y = 0.01; gg.add(f);
      const o = new THREE.Mesh(outGeo, outMat); o.rotation.x = -Math.PI / 2; o.scale.setScalar(rad); gg.add(o);
      f.scale.setScalar(0.01);
      gg.visible = false; group.add(gg);
      let obj;
      if (kind === 'rock') { obj = new THREE.Mesh(rockGeo, rockMat); obj.scale.set(rad * 0.85, rad * 0.8, rad * 0.85); obj.castShadow = true; }
      else {
        obj = new THREE.Group();
        obj.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), mat(0x8a6a3a), { cast: false, pos: [0, 0.9, 0] }));
        obj.add(mesh(new THREE.ConeGeometry(0.13, 0.4, 5), mat(0xb8bcc8, { metalness: 0.7 }), { cast: false, pos: [0, -0.05, 0], rot: [Math.PI, 0, 0] }));
        obj.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), mat(0xd8372c), { cast: false, pos: [0, 1.7, 0] }));
        obj.scale.setScalar(1.3);
      }
      obj.visible = false; group.add(obj);
      strikes.push({ x, z, kind, rad, delay, warn, t: warn, gg, f, o, obj, falling: false, wait: delay });
    }
    function launchPattern() {
      const alive = pl.filter((p) => p.state === 'play');
      const aim = () => {
        if (alive.length && R() < 0.6) { const p = alive[Math.floor(R() * alive.length)]; return [p.x + p.vx * 0.5 + rr(-1.2, 1.2), p.z + p.vz * 0.5 + rr(-1.2, 1.2)]; }
        for (let k = 0; k < 20; k++) { const a = R() * TAU, r = rr(2.6, 10); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (onGround(x, z)) return [x, z]; }
        return [4, 4];
      };
      const warn = clamp(1.6 - t * 0.008, 1.1, 1.6);
      if (R() < 0.55 || t < 24) { const [x, z] = aim(); addStrike(x, z, 'rock', 0, warn); if (t > 34 && R() < 0.5) { const [x2, z2] = aim(); addStrike(x2, z2, 'rock', 0.35, warn); } }
      else { // pijlenregen langs een lijn
        const [x, z] = aim(); const a = R() * TAU; const n = 5;
        for (let i = 0; i < n; i++) { const d = (i - (n - 1) / 2) * 1.9; addStrike(x + Math.cos(a) * d, z + Math.sin(a) * d, 'arrow', i * 0.13, warn); }
        hud.toast('Pijlen!', 1000);
      }
    }
    function updateStrikes(dt) {
      for (let n = strikes.length - 1; n >= 0; n--) {
        const s = strikes[n];
        if (s.wait > 0) { s.wait -= dt; continue; }
        s.gg.visible = true; s.t -= dt;
        const k = clamp(1 - s.t / s.warn, 0, 1);
        s.f.scale.setScalar(Math.max(0.02, k * s.rad));
        s.o.visible = s.t > 0.3 || Math.floor(T * 14) % 2 === 0;
        if (!s.falling && s.t < 0.55) { s.falling = true; s.obj.visible = true; if (s.kind === 'arrow') audio.sfx('shoot', { vol: 0.5 }); else audio.sfx('whoosh', { vol: 0.5, rate: 0.6 }); }
        if (s.falling) {
          const u = Math.max(0, s.t / 0.55);
          const y = (s.kind === 'rock' ? 17 : 15) * u * u;
          s.obj.position.set(s.x, y + (s.kind === 'rock' ? s.rad * 0.7 : 0.2), s.z);
          if (s.kind === 'rock') { s.obj.rotation.x += dt * 5; s.obj.rotation.z += dt * 3; if (y > 1 && R() < 0.8) fx.particles.emit(s.x + rr(-0.3, 0.3), y + 1, s.z + rr(-0.3, 0.3), 0, 1.5, 0, { life: 0.5, size: 0.7, color: 0xff8a3a, gravity: -1 }); }
        }
        if (s.t <= 0) {
          impact(s);
          group.remove(s.gg); group.remove(s.obj); strikes.splice(n, 1);
        }
      }
      for (let n = decals.length - 1; n >= 0; n--) {
        const d = decals[n]; d.t -= dt; d.m.material.opacity = Math.max(0, d.t / 4) * 0.45;
        if (d.t <= 0) { group.remove(d.m); d.m.material.dispose(); decals.splice(n, 1); }
      }
    }
    const decalGeo = new THREE.CircleGeometry(1, 16);
    function impact(s) {
      const big = s.kind === 'rock';
      fx.particles.burst(s.x, 0.3, s.z, { count: big ? 30 : 10, speed: big ? 7 : 4, up: 1.3, life: 0.9, size: 0.55, colors: [0x8a8790, 0xb9b4a8, 0x6d5a48, 0xffa040], gravity: 16 });
      fx.particles.ring(s.x, 0.15, s.z, { count: big ? 20 : 8, speed: big ? 6 : 3.5, life: 0.5, size: 0.4, color: 0xd8cdb8 });
      fx.particles.dust(s.x, 0, s.z, big ? 8 : 3, 0xcfc4ae);
      audio.sfx(big ? 'thud' : 'hit', { vol: big ? 0.8 : 0.4 }); ctx.shake(big ? 0.5 : 0.18);
      const dm = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.45, depthWrite: false })); dm.rotation.x = -Math.PI / 2; dm.position.set(s.x, 0.045, s.z); dm.scale.setScalar(s.rad * 0.9); group.add(dm); decals.push({ m: dm, t: 4 });
      for (const p of pl) if (p.state === 'play' && p.inv <= 0 && p.y < 1.4 && Math.hypot(p.x - s.x, p.z - s.z) < s.rad + 0.3) knock(p, 0, 0, big ? 'Pletsj! Een rots!' : 'Au! Een pijl!');
    }

    // =====================================================================
    //  SPELLOGICA
    // =====================================================================
    let t = 0, done = false, started = false, coins = 0, rescues = 0, falls = 0, endT = -1;
    let theta = 0, omega = 0, dirV = 1, dirT = 1, mulV = 1, mulT = 1, mulUntil = 0;
    let tileT = 11, strikeT = 14, coinT = 6, hintT = 0;
    let evi = 0;
    const EVENTS = [
      { t: 2.0, fn: () => { activate(0); hud.toast('Lage balk: SPRINGEN met A!', 2600); } },
      { t: 15.0, fn: () => { activate(1); hud.toast('Hoge balk: BUKKEN met B (vasthouden)!', 2800); } },
      { t: 22.0, fn: () => { mulT = 0.4; mulUntil = t + 3.2; hud.showBig('Rustig...', 900, '#9fd4ff'); } },
      { t: 26.2, fn: () => { mulT = 1.55; mulUntil = t + 3.2; hud.showBig('Sneller!', 900, '#ff9a3a'); audio.sfx('whoosh'); } },
      { t: 32.0, fn: () => { dirT = -dirV; hud.showBig('Omkeren!', 900, '#ffe14a'); audio.sfx('bell'); } },
      { t: 38.0, fn: () => { activate(2); hud.toast('Nóg een lage balk!', 2200); } },
      { t: 43.0, fn: () => { mulT = 0.45; mulUntil = t + 2.6; hud.showBig('Rustig...', 800, '#9fd4ff'); } },
      { t: 46.0, fn: () => { dirT = -dirV; hud.showBig('Omkeren!', 900, '#ffe14a'); audio.sfx('bell'); } },
      { t: 51.5, fn: () => { mulT = 1.5; mulUntil = t + 3.5; hud.showBig('Sneller!', 900, '#ff9a3a'); audio.sfx('whoosh'); } },
    ];
    function activate(i) { const b = beams[i]; b.active = true; b.grow = 0; b.ang = b.prev = theta + b.off; audio.sfx('wood'); audio.sfx('scrape', { vol: 0.5 }); ctx.shake(0.25); fx.particles.ring(0, 0.3, 0, { count: 24, speed: 5, life: 0.6, size: 0.4, color: 0xffcf3a }); }

    const down = (p) => p.state === 'fly' || p.state === 'drop' || p.state === 'swim' || p.state === 'raft';
    function setPose(p, pose, dur = 0) { p.c.pose = pose; p.poseT = dur; }

    function karelLaugh() {
      laughT = 1.8; karel.pose = 'cheer';
      fx.texts.add('HAHAHA!', karelPos.x, karelPos.y, karelPos.z, '#ffe14a', 2.4);
      audio.sfx('note', { rate: 0.6, vol: 0.5 }); audio.sfx('note', { rate: 0.7, vol: 0.5 });
      guards.forEach((g) => { g.cheerT = 1.2 + R(); });
    }

    function knock(p, phi, tangSign, msg) {
      const r = Math.hypot(p.x, p.z);
      const Rl = 12.6 + R() * 1.2;
      const ang = Math.atan2(p.z, p.x) + tangSign * 0.35 * (0.6 + R() * 0.8) + (tangSign === 0 ? rr(-0.3, 0.3) : 0);
      const tx = Math.cos(ang) * Rl, tz = Math.sin(ang) * Rl;
      const Tt = clamp((Rl - r) / 8.5, 1.0, 1.45);
      p.state = 'fly'; p.ft = 0; p.duck = 0; p.rescue = 0;
      p.vx = (tx - p.x) / Tt; p.vz = (tz - p.z) / Tt;
      p.vy = (WATER_Y + 0.1 - p.y + 0.5 * 24 * Tt * Tt) / Tt;
      setPose(p, 'scared');
      p.c.air = true;
      audio.sfx('hit'); audio.sfx('boing', { vol: 0.6 }); ctx.shake(0.55);
      fx.particles.burst(p.x, p.y + 1, p.z, { count: 18, speed: 5, up: 1, life: 0.6, size: 0.5, colors: [0xffe14a, 0xffffff, 0xff9a3a], gravity: 6 });
      fx.texts.add(msg || 'Au!', p.x, p.y + 2.8, p.z, '#ff7a6a', 1.2);
      if (!done) hud.toast(`${p.name} vliegt de gracht in!`, 1700);
      falls++;
    }

    function enterWater(p) {
      p.state = 'swim'; p.swimT = 0; p.y = WATER_Y - 0.55; p.vy = 0; p.vx *= 0.1; p.vz *= 0.1; p.c.group.rotation.z = 0; p.c.group.rotation.x = 0;
      p.c.air = false; setPose(p, 'wave'); p.helpT = 0.6; p.rescue = 0;
      splash(p.x, p.z, 1.15); karelLaugh();
      if (!orbS.on && !orbS.used && !done) orbS.spawnIn = 2.2;
    }

    function revive(p, tx, tz, how) {
      p.state = 'hop'; p.hop = { t: 0, dur: 0.8, fx: p.x, fy: p.y, fz: p.z, tx, tz }; p.rescue = 0; setPose(p, 'cheer');
      if (p.raft) { const rf = p.raft; p.raft = null; rf.userData.leaving = 1; rafts.push(rf); }
      audio.sfx(how === 'orb' ? 'powerup' : 'good');
    }
    const rafts = [];

    function targetNear(x, z) {
      // een veilig punt op het platform richting het midden vanaf (x,z)
      const a = Math.atan2(z, x);
      for (let r = 11.3; r > 3; r -= 0.3) { const px = Math.cos(a) * r, pz = Math.sin(a) * r; if (onGround(px, pz)) { const rr2 = Math.max(3.1, r - 1.3); return [Math.cos(a) * rr2, Math.sin(a) * rr2, r]; } }
      return [Math.cos(a) * 3.3, Math.sin(a) * 3.3, 3.3];
    }

    // ---- tegels laten instorten ----
    function pickTile() {
      for (let k = RINGS.length - 1; k >= 0; k--) {
        const alive = tiles[k].filter((q) => q.state === 'solid');
        if (!alive.length) continue;
        if (R() < 0.65) {   // bij voorkeur naast een gat
          const nb = alive.filter((q) => { const n = RINGS[k][2]; return tiles[k][(q.idx + 1) % n].state !== 'solid' || tiles[k][(q.idx + n - 1) % n].state !== 'solid' || (k > 0 && false); });
          if (nb.length) return nb[Math.floor(R() * nb.length)];
        }
        return alive[Math.floor(R() * alive.length)];
      }
      return null;
    }
    function updateTiles(dt) {
      for (const arr of tiles) for (const q of arr) {
        if (q.state === 'warn') {
          q.t -= dt;
          const pulse = 0.5 + 0.5 * Math.sin(T * 24);
          q.mesh.material.emissive.setRGB(0.55 * pulse + 0.25, 0.04, 0.0);
          q.mesh.position.set((R() - 0.5) * 0.07, 0, (R() - 0.5) * 0.07);
          if (R() < dt * 14) fx.particles.dust(q.cx + rr(-1, 1), 0.1, q.cz + rr(-1, 1), 1, 0xbdb4a0);
          if (q.t <= 0) { q.state = 'fall'; q.vy = 0; q.mesh.position.set(0, 0, 0); audio.sfx('thud', { vol: 0.6 }); ctx.shake(0.25); }
        } else if (q.state === 'fall') {
          q.vy -= 22 * dt; q.mesh.position.y += q.vy * dt; q.mesh.rotation.x += q.spin[0] * dt * 0.5; q.mesh.rotation.z += q.spin[2] * dt * 0.5;
          if (q.mesh.position.y < WATER_Y - 1.2 && q.state === 'fall') { q.state = 'gone'; q.mesh.visible = false; splash(q.cx, q.cz, 1.3); }
        }
      }
    }

    // ---- balk-botsing ----
    function beamHit(b, p) {
      const rp = Math.hypot(p.x, p.z);
      if (rp > b.len + 0.35 || rp < 1.3) return 0;
      let hit = false;
      const hh = p.c.height * (1 - 0.55 * p.duck);
      if (b.lowT) hit = p.y < LOW.top;
      else hit = (p.y + hh) > HIGH.bottom && p.y < 1.7;
      const phi = Math.atan2(p.z, p.x);
      const halfW = Math.atan2(0.4 + 0.3, Math.max(rp, 0.9));
      const d0 = angDiff(b.prev, phi), d1 = angDiff(b.ang, phi);
      const crossed = (d0 * d1 < 0 && Math.abs(d0 - d1) < 1.2) || Math.abs(d1) < halfW;
      if (!crossed) return 0;
      return hit ? 1 : 2;   // 2 = veilig gepasseerd
    }

    function updateBeams(dt) {
      // snelheid
      const base = lerp(0.95, 1.6, clamp(t / DURATION, 0, 1)) * (0.88 + 0.12 * diff);
      if (mulUntil > 0 && t > mulUntil) { mulT = 1; mulUntil = 0; }
      mulV = damp(mulV, mulT, 2.2, dt);
      dirV = damp(dirV, dirT, 2.6, dt);
      omega = base * mulV * dirV;
      theta += omega * dt;
      for (const b of beams) {
        if (!b.active) continue;
        b.prev = b.ang; b.ang = theta + b.off;
        if (b.grow < 1) { b.grow = Math.min(1, b.grow + dt / 2.0); setBeamLen(b, BEAM_L * (1 - Math.pow(1 - b.grow, 3))); }
        b.g.rotation.y = -b.ang;
      }
      spinner.rotation.y = -theta;
    }

    function checkBeams(p) {
      if (p.state !== 'play') return;
      for (const b of beams) {
        if (!b.active || b.len < 2.2) continue;
        const h = beamHit(b, p);
        if (h === 1 && p.inv <= 0) { knock(p, 0, Math.sign(omega) || 1, b.lowT ? 'Te laag!' : 'Bukken!'); return; }
        if (h === 2 && p.nearMissCd <= 0) { p.nearMissCd = 1.4; audio.sfx('swing', { vol: 0.4, rate: 1 + R() * 0.2 }); fx.texts.add(b.lowT ? 'Mooi gesprongen!' : 'Mooi gebukt!', p.x, p.y + 2.6, p.z, '#9fffb0', 0.9); }
      }
    }

    // =====================================================================
    //  SPELER-UPDATE
    // =====================================================================
    function stepPlatform(p, dt) {
      let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
      let r = Math.hypot(nx, nz);
      if (r < TOWER_PAD) { nx *= TOWER_PAD / Math.max(r, 0.001); nz *= TOWER_PAD / Math.max(r, 0.001); }
      if (onGround(nx, nz)) { p.x = nx; p.z = nz; }
      else if (onGround(nx, p.z) && Math.hypot(nx, p.z) > TOWER_PAD) { p.x = nx; p.vz = 0; }
      else if (onGround(p.x, nz) && Math.hypot(p.x, nz) > TOWER_PAD) { p.z = nz; p.vx = 0; }
      else { p.vx = 0; p.vz = 0; }
    }

    function updatePlayer(p, dt) {
      const i = p.i, inp = input.p[i], c = p.c;
      p.inv = Math.max(0, p.inv - dt); p.nearMissCd = Math.max(0, p.nearMissCd - dt);
      if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0 && p.state === 'play') c.pose = 'idle'; }
      switch (p.state) {
        case 'play': {
          const grounded = p.y <= 0.001 && p.vy <= 0;
          p.duck = damp(p.duck, inp.b && grounded ? 1 : 0, 22, dt);
          const sp = 7.4 * (1 - 0.42 * p.duck);
          p.vx = damp(p.vx, inp.x * sp, 13, dt); p.vz = damp(p.vz, inp.y * sp, 13, dt);
          stepPlatform(p, dt);
          if (inp.aP && grounded && p.duck < 0.35) { p.vy = JUMP_V; c.jump(); audio.sfx('jump', { vol: 0.7 }); fx.particles.dust(p.x, 0, p.z, 3); }
          if (p.y > 0 || p.vy > 0) {
            p.vy -= GRAV * dt; p.y += p.vy * dt;
            if (p.y <= 0) { if (p.vy < -4) { audio.sfx('land', { vol: 0.5 }); fx.particles.dust(p.x, 0, p.z, 3); c.squash = 0.12; } p.y = 0; p.vy = 0; }
          }
          c.air = p.y > 0.06;
          c.speed = Math.min(1, Math.hypot(p.vx, p.vz) / 7.4) * (1 - 0.5 * p.duck);
          if (Math.hypot(p.vx, p.vz) > 0.6) c.faceDir(p.vx, p.vz);
          if (c.speed > 0.5 && p.y === 0 && R() < dt * 5) fx.particles.dust(p.x, 0, p.z, 1);
          if (p.y <= 0 && !onGround(p.x, p.z)) { // tegel valt weg onder je voeten
            p.state = 'drop'; p.vy = -1; p.vx *= 0.3; p.vz *= 0.3; setPose(p, 'scared'); audio.sfx('miss');
            fx.texts.add('Oeps!', p.x, 2.6, p.z, '#ff7a6a', 1.1); falls++;
            if (!done) hud.toast(`${p.name} valt van het platform!`, 1700);
          }
          c.group.scale.set(1 + 0.22 * p.duck, 1 - 0.55 * p.duck, 1 + 0.22 * p.duck);
          break;
        }
        case 'drop': {
          p.vy -= 24 * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt;
          c.group.scale.set(1, 1, 1);
          if (p.y < WATER_Y + 0.3) enterWater(p);
          break;
        }
        case 'fly': {
          p.ft += dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= 24 * dt; p.y += p.vy * dt;
          c.group.rotation.z += 9 * dt; c.group.scale.set(1, 1, 1);
          if (R() < 0.7) fx.particles.emit(p.x, p.y + 1, p.z, 0, 0.5, 0, { life: 0.45, size: 0.5, color: 0xffffff, gravity: 0 });
          if (p.y <= 0 && p.vy < 0 && p.ft > 0.2 && onGround(p.x, p.z)) { p.state = 'play'; p.y = 0; p.vy = 0; p.inv = 1; c.group.rotation.z = 0; }   // noodlanding (zou niet moeten gebeuren)
          else if (p.y < WATER_Y + 0.1 && p.vy < 0) enterWater(p);
          break;
        }
        case 'swim': {
          p.swimT += dt; p.helpT -= dt;
          c.group.scale.set(1, 1, 1);
          const sp = 5.2;
          p.vx = damp(p.vx, inp.x * sp, 8, dt); p.vz = damp(p.vz, inp.y * sp, 8, dt);
          const ok = (x, z) => !solid(tileAt(x, z)) && Math.hypot(x, z) < 15.5;
          const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
          if (ok(nx, nz)) { p.x = nx; p.z = nz; } else if (ok(nx, p.z)) { p.x = nx; p.vz = 0; } else if (ok(p.x, nz)) { p.z = nz; p.vx = 0; } else { p.vx = p.vz = 0; }
          p.y = WATER_Y - 0.6 + Math.sin(T * 3 + i) * 0.07;
          c.speed = Math.min(1, Math.hypot(p.vx, p.vz) / sp) * 0.5;
          if (Math.hypot(p.vx, p.vz) > 0.6) c.faceDir(p.vx, p.vz);
          p.ripT -= dt; if (p.ripT <= 0) { p.ripT = Math.hypot(p.vx, p.vz) > 1 ? 0.3 : 0.7; ripple(p.x, p.z, 1.6, 0.9); }
          if (R() < dt * 4) fx.particles.emit(p.x + rr(-0.4, 0.4), WATER_Y, p.z + rr(-0.4, 0.4), 0, 1.2, 0, { life: 0.7, size: 0.3, color: 0xdff2ff, gravity: 3 });
          if (p.helpT <= 0) { p.helpT = 2.4; fx.texts.add('Help!', p.x, 1.4, p.z, '#ffffff', 1.0); }
          if (p.swimT >= RAFT_TIME) startRaft(p);
          break;
        }
        case 'raft': {
          const rf = p.raft; rf.userData.t += dt; const u = clamp(rf.userData.t / 1.25, 0, 1), e = u * u * (3 - 2 * u);
          rf.position.set(lerp(rf.userData.fx, rf.userData.tx, e), WATER_Y + 0.15 + Math.sin(T * 5) * 0.05, lerp(rf.userData.fz, rf.userData.tz, e));
          
          p.x = rf.position.x; p.z = rf.position.z; p.y = WATER_Y + 0.25; p.vx = p.vz = 0;
          c.speed = 0; setPose(p, 'cheer');
          fx.particles.emit(p.x + rr(-0.8, 0.8), WATER_Y + 0.1, p.z + rr(-0.8, 0.8), 0, 0.6, 0, { life: 0.5, size: 0.4, color: 0xffffff });
          if (u >= 1) { const [tx, tz] = targetNear(p.x, p.z); revive(p, tx, tz, 'raft'); }
          break;
        }
        case 'hop': {
          const h = p.hop; h.t += dt; const u = clamp(h.t / h.dur, 0, 1);
          p.x = lerp(h.fx, h.tx, u); p.z = lerp(h.fz, h.tz, u);
          p.y = lerp(h.fy, 0, u) + Math.sin(u * Math.PI) * 3.2;
          c.group.scale.set(1, 1, 1); c.air = true; c.faceDir(h.tx - h.fx, h.tz - h.fz);
          if (u >= 1) {
            p.state = 'play'; p.y = 0; p.vy = 0; p.vx = p.vz = 0; p.inv = 2.2; setPose(p, 'cheer', 1.0); c.air = false;
            fx.particles.burst(p.x, 0.3, p.z, { count: 20, speed: 4, up: 1.5, life: 0.8, size: 0.5, colors: [0x7affd0, 0xffffff, 0xffe14a], gravity: 6 });
            audio.sfx('land'); fx.texts.add('Terug!', p.x, 2.8, p.z, '#7affd0', 1.2);
          }
          break;
        }
      }
      c.group.position.set(p.x, p.y, p.z);
      if (p.state === 'play') p.ring.visible = true; else p.ring.visible = false;
      p.ring.position.set(p.x, 0.07, p.z); p.ring.scale.setScalar(p.y > 0.1 ? 0.7 : 1);
      c.group.visible = p.state !== 'play' || p.inv <= 0 || Math.floor(T * 16) % 2 === 0;
    }

    function startRaft(p) {
      const rf = makeRaft(); const [tx, tz, redge] = targetNear(p.x, p.z); const a = Math.atan2(tz, tx);
      rf.userData = { t: 0, fx: p.x, fz: p.z, tx: Math.cos(a) * (redge + 1.4), tz: Math.sin(a) * (redge + 1.4) };
      rf.position.set(p.x, WATER_Y, p.z); rf.scale.setScalar(0.1);
      p.raft = rf; p.state = 'raft'; audio.sfx('pop'); audio.sfx('sparkle', { vol: 0.5 });
      fx.particles.burst(p.x, WATER_Y + 0.3, p.z, { count: 20, speed: 4, up: 1.4, life: 0.8, size: 0.5, colors: [0xffffff, 0xcdeaff], gravity: 10 });
      fx.texts.add('Het vlot!', p.x, 2.2, p.z, '#ffe14a', 1.1);
    }

    function updateRescue(dt) {
      for (const s of pl) {
        const q = pl[1 - s.i];
        const near = s.state === 'swim' && q.state === 'play' && Math.hypot(q.x - s.x, q.z - s.z) < RESCUE_DIST;
        if (s.state !== 'swim') { s.rescue = 0; s.prog.visible = false; continue; }
        if (near && input.p[q.i].a) {
          const before = s.rescue; s.rescue += dt;
          if (Math.floor(before * 5) !== Math.floor(s.rescue * 5)) audio.sfx('note', { rate: 0.8 + s.rescue * 0.5, vol: 0.5 });
          if (q.c.pose !== 'push') q.c.pose = 'push';
        } else {
          s.rescue = Math.max(0, s.rescue - dt * (near ? 0.5 : 1.0));
          if (q.state === 'play' && q.c.pose === 'push' && q.poseT <= 0) q.c.pose = 'idle';
        }
        // visueel
        const k = clamp(s.rescue / RESCUE_TIME, 0, 1);
        s.prog.visible = near; if (near) { s.prog.position.set(q.x, 0.09, q.z); s.prog.scale.setScalar(0.3 + 1.3 * k); s.prog.material.opacity = 0.25 + 0.4 * k; }
        if (near && k > 0.02) {
          rope.visible = true;
          const ax = q.x, ay = 1.1, az = q.z, bx = s.x, by = WATER_Y + 0.9, bz = s.z;
          const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
          rope.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); rope.lookAt(bx, by, bz); rope.scale.set(1 + k * 2, 1 + k * 2, len);
        }
        if (s.rescue >= RESCUE_TIME) {
          const [tx, tz] = (() => { const a = Math.atan2(q.z, q.x), r = Math.max(3.0, Math.hypot(q.x, q.z) - 1.5); const x = Math.cos(a) * r, z = Math.sin(a) * r; return onGround(x, z) ? [x, z] : [q.x, q.z]; })();
          revive(s, tx, tz, 'rescue'); rescues++; setPose(q, 'cheer', 1.2); ctx.bonus(2);
          fx.texts.add('Gered! +2 🪙', q.x, 3.2, q.z, '#7affd0', 1.3); fx.particles.burst(s.x, WATER_Y + 0.3, s.z, { count: 20, speed: 4, up: 1.5, life: 0.8, size: 0.5, colors: [0x7affd0, 0xffffff], gravity: 8 });
          guards.forEach((g) => { g.cheerT = 1.4; });
        }
      }
      if (!pl.some((s) => s.state === 'swim' && s.rescue > 0.02 && pl[1 - s.i].state === 'play')) rope.visible = false;
    }

    function updateOrbAndCoins(dt) {
      // levensbron
      const swimmer = pl.filter((p) => p.state === 'swim').sort((a, b) => b.swimT - a.swimT)[0];
      if (orbS.spawnIn > 0 && swimmer) {
        orbS.spawnIn -= dt;
        if (orbS.spawnIn <= 0) {
          for (let k = 0; k < 30; k++) { const a = R() * TAU, r = rr(2.7, 5.6); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (onGround(x, z)) { orbS.x = x; orbS.z = z; break; } }
          orbS.on = true; orbS.life = 7.5; orbS.used = true; orb.visible = true; orb.position.set(orbS.x, 0, orbS.z);
          audio.sfx('sparkle'); fx.texts.add('Levensbron!', orbS.x, 3.4, orbS.z, '#7affd0', 1.3);
        }
      } else if (!swimmer) { orbS.spawnIn = 0; orbS.used = false; }
      if (orbS.on) {
        orbS.life -= dt; orb.children[0].position.y = 1.3 + Math.sin(T * 3) * 0.2; orb.userData.halo.rotation.z += dt * 3; orb.userData.halo.position.y = orb.children[0].position.y; orb.rotation.y += dt;
        orb.visible = orbS.life > 2 || Math.floor(T * 10) % 2 === 0;
        if (R() < dt * 25) fx.particles.emit(orbS.x + rr(-0.5, 0.5), 0.2, orbS.z + rr(-0.5, 0.5), 0, 2.5, 0, { life: 0.9, size: 0.3, color: 0x7affd0 });
        const sw = pl.filter((p) => p.state === 'swim')[0];
        for (const p of pl) if (p.state === 'play' && sw && p !== sw && Math.hypot(p.x - orbS.x, p.z - orbS.z) < 1.3 && p.y < 2.2) {
          revive(sw, orbS.x, orbS.z, 'orb'); orbS.on = false; orb.visible = false; rescues++; ctx.bonus(2);
          fx.texts.add('Levensbron! +2 🪙', orbS.x, 3.4, orbS.z, '#7affd0', 1.3); setPose(p, 'cheer', 1);
          fx.particles.burst(orbS.x, 1, orbS.z, { count: 30, speed: 6, up: 1.6, life: 1, size: 0.5, colors: [0x7affd0, 0xffffff], gravity: 6 }); ctx.shake(0.3);
          guards.forEach((g) => { g.cheerT = 1.4; });
        }
        if (orbS.life <= 0 || !sw) { orbS.on = false; orb.visible = false; }
      }
      // munten
      coinT -= dt;
      if (coinT <= 0 && coinsL.length < 2 && t < DURATION - 4) {
        coinT = rr(4.5, 7);
        for (let k = 0; k < 30; k++) {
          const a = R() * TAU, r = rr(2.7, 9); const x = Math.cos(a) * r, z = Math.sin(a) * r; const tl = tileAt(x, z);
          if (tl && tl.state === 'solid' && (tl.core || tl.ring < 2 || R() < 0.3)) {
            const obj = P.coin(0.5); obj.scale.setScalar(1.5); obj.position.set(x, 0.1, z); group.add(obj); coinsL.push({ obj, x, z, life: 11 });
            fx.particles.burst(x, 1, z, { count: 8, speed: 2, color: 0xffe14a, size: 0.3, gravity: 2 });
            break;
          }
        }
      }
      for (let n = coinsL.length - 1; n >= 0; n--) {
        const cn = coinsL[n]; cn.life -= dt; cn.obj.rotation.y += dt * 4; cn.obj.position.y = 0.35 + Math.abs(Math.sin(T * 3 + n)) * 0.25;
        cn.obj.visible = cn.life > 2 || Math.floor(T * 10) % 2 === 0;
        let got = null; for (const p of pl) if (p.state === 'play' && Math.hypot(p.x - cn.x, p.z - cn.z) < 1.15 && p.y < 2) got = p;
        if (got) {
          coins++; ctx.bonus(1); audio.sfx('coin'); fx.texts.add('+1 🪙', cn.x, 2.4, cn.z, '#ffe14a', 1.1);
          fx.particles.burst(cn.x, 1, cn.z, { count: 12, speed: 3.5, colors: [0xffe14a, 0xffffff], size: 0.35, gravity: 6 });
        }
        if (got || cn.life <= 0) { group.remove(cn.obj); coinsL.splice(n, 1); }
      }
    }

    // =====================================================================
    //  ANIMATIE (altijd)
    // =====================================================================
    // zeeslang in de gracht
    const serp = new THREE.Group(); group.add(serp);
    const humps = [];
    for (let i = 0; i < 5; i++) { const m = mesh(new THREE.SphereGeometry(1.0 - i * 0.1, 10, 8), mat(0x3f9e5a, { flatShading: false }), { cast: false, scale: [1, 1.1, 1.4] }); serp.add(m); humps.push(m); }
    const serpHead = new THREE.Group(); serp.add(serpHead);
    serpHead.add(mesh(new THREE.SphereGeometry(0.8, 12, 8), mat(0x4fb06a, { flatShading: false }), { cast: false, scale: [1, 0.9, 1.3] }));
    serpHead.add(mesh(new THREE.ConeGeometry(0.28, 0.9, 6), mat(0xd83a2a), { cast: false, pos: [0, -0.2, 1.2], rot: [Math.PI / 2, 0, 0] }));
    for (const sd of [1, -1]) { serpHead.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [sd * 0.45, 0.4, 0.7] })); serpHead.add(mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [sd * 0.5, 0.42, 0.88] })); serpHead.add(mesh(new THREE.ConeGeometry(0.12, 0.5, 5), mat(0xffd23f), { cast: false, pos: [sd * 0.3, 0.85, 0.2], rot: [-0.3, 0, -sd * 0.4] })); }
    // drijvende tonnen en planken
    const floaters = [];
    for (let i = 0; i < 6; i++) { const b = P.barrel(1); const a = i / 6 * TAU + 0.3, r = rr(15.5, 22); b.userData = { a, r, sp: rr(0.03, 0.07) * (i % 2 ? 1 : -1) }; group.add(b); floaters.push(b); }
    let emberT = 0;

    function animate(dt) {
      T += dt;
      for (const f of anims) f(T, dt);
      for (const f of flags) P.animateBanner(f, T);
      torches.forEach((tc) => P.animateFire(tc, T));
      emberT -= dt; if (emberT <= 0) { emberT = 0.12; const tc = torches[Math.floor(Math.random() * torches.length)]; const wp = tc.position; fx.particles.emit(wp.x + rr(-0.1, 0.1), wp.y + 2.0, wp.z + rr(-0.1, 0.1), rr(-0.3, 0.3), 1.2, rr(-0.3, 0.3), { life: 1.6, size: 0.22, color: 0xffa040, gravity: -0.5 }); }
      // zeeslang
      const sa = T * 0.17 + 1;
      humps.forEach((m, i) => { const a = sa - i * 0.11; m.position.set(Math.cos(a) * 21.5, WATER_Y - 0.9 + Math.max(0, Math.sin(T * 1.7 - i * 1.0)) * 1.6, Math.sin(a) * 21.5); m.rotation.y = -a; });
      serpHead.position.set(Math.cos(sa + 0.14) * 21.5, WATER_Y + 0.9 + Math.sin(T * 1.7 + 1) * 0.45, Math.sin(sa + 0.14) * 21.5); serpHead.rotation.y = -(sa + 0.14) + Math.PI; serpHead.rotation.y = -(sa + 0.14) + 0.0;
      // tonnen
      floaters.forEach((b) => { b.userData.a += b.userData.sp * dt; const u = b.userData; b.position.set(Math.cos(u.a) * u.r, WATER_Y - 0.25 + Math.sin(T * 2 + u.r) * 0.12, Math.sin(u.a) * u.r); b.rotation.z = Math.sin(T * 1.5 + u.r) * 0.15; });
      // ripples & kolommen
      for (const r of ripples) if (r.on) { r.t += dt; const u = r.t / r.life; if (u >= 1) { r.on = false; r.m.visible = false; continue; } r.m.scale.setScalar(0.3 + u * r.max); r.m.material.opacity = (1 - u) * 0.7; }
      for (const c of cols) if (c.on) { c.t += dt; const u = c.t / 0.8; if (u >= 1) { c.on = false; c.m.visible = false; continue; } const h = Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.8) * 3.8 * c.s; c.m.scale.set(1 + u * 1.5, Math.max(0.01, h), 1 + u * 1.5); c.m.position.y = WATER_Y + h / 2; c.m.material.opacity = (1 - u) * 0.55; }
      for (let n = rafts.length - 1; n >= 0; n--) { const rf = rafts[n]; rf.userData.leaving += dt; rf.position.y -= dt * 0.8; rf.rotation.z += dt * 0.5; if (rf.userData.leaving > 2.2) { group.remove(rf); rafts.splice(n, 1); } }
      for (const p of pl) if (p.raft) { const s = p.raft.scale.x; p.raft.scale.setScalar(Math.min(1, s + dt * 4)); }
      // karel & wachters
      if (laughT > 0) { laughT -= dt; karel.group.position.y = 6.05 + Math.abs(Math.sin(T * 14)) * 0.12; if (laughT <= 0) { karel.pose = 'idle'; karel.group.position.y = 6.05; } }
      royals.forEach((c) => c.update(dt));
      for (const g of guards) { if (g.cheerT > 0) { g.cheerT -= dt; g.c.pose = 'cheer'; } else g.c.pose = Math.sin(T * 0.4 + g.ph) > 0.85 ? 'wave' : 'idle'; g.c.update(dt); }
      for (const p of pl) {
        p.c.update(dt);
        if (p.state === 'swim' || p.state === 'raft') { // marker
          const k = p.state === 'swim' ? 1 - p.swimT / RAFT_TIME : 0;
          p.mark.visible = true; p.mark.position.set(p.x, WATER_Y + 0.1, p.z); p.mark.scale.setScalar(0.8 + 1.2 * k); p.mark.material.opacity = 0.5 + 0.4 * Math.sin(T * 8);
        } else p.mark.visible = false;
        if (p.state !== 'swim') p.prog.visible = false;
      }
    }

    // =====================================================================
    //  CAMERA
    // =====================================================================
    camera.fov = 52; camera.updateProjectionMatrix();
    const camBase = new THREE.Vector3(0, 27, 22), camLook = new THREE.Vector3(0, 1.5, -0.2);
    function placeCamera(dt, extra = 0) {
      const asp = camera.aspect || 1.7;
      const f = clamp(1.72 / asp, 1, 1.7);
      const sway = Math.sin(T * 0.25) * 0.6;
      camera.position.set(camBase.x * f + sway, camBase.y * f - extra, camBase.z * f + extra * 0.8);
      camera.lookAt(camLook.x + sway * 0.3, camLook.y, camLook.z);
    }
    placeCamera(0);

    // =====================================================================
    //  HOOFDLUS
    // =====================================================================
    function finishGame(win) {
      if (done) return; done = true;
      const secs = Math.min(DURATION, t);
      const stars = win ? 3 : secs >= 40 ? 2 : secs >= 25 ? 1 : 0;
      hud.setTimer(win ? 0 : DURATION - secs);
      pl.forEach((p) => { if (p.state === 'play') setPose(p, win ? 'cheer' : 'sad'); });
      if (win) { audio.sfx('bell'); guards.forEach((g) => { g.cheerT = 99; }); royals[0].pose = 'cheer'; }
      else { karelLaugh(); }
      const summary = win
        ? `Wat een reflexen! Jullie hielden de volle <b>60 seconden</b> vol${rescues ? `, redden elkaar ${rescues}x` : ''}${coins ? ` en pakten ${coins} munt${coins > 1 ? 'en' : ''}` : ''}. Kapitein Karel is onder de indruk!`
        : `Allebei in de gracht na <b>${Math.floor(secs)} seconden</b>${rescues ? ` (${rescues}x gered)` : ''}${coins ? `, ${coins} munt${coins > 1 ? 'en' : ''}` : ''}. ${secs >= 25 ? 'Kapitein Karel lacht, maar knikt goedkeurend.' : 'Kapitein Karel lacht zich een deuk...'}`;
      ctx.finish({ stars, score: Math.floor(secs * 10) + coins * 5, summary, delay: win ? 900 : 1500 });
    }

    function updateHud() {
      hud.setTimer(Math.max(0, DURATION - t), 10);
      hud.setScore(`Overleefd: ${Math.floor(t)} s` + (coins ? `   🪙 ${coins}` : ''));
      for (const p of pl) {
        const o = pl[1 - p.i];
        let txt;
        if (p.state === 'swim') txt = `Zwemt! Vlot over ${Math.max(0, Math.ceil(RAFT_TIME - p.swimT))} s`;
        else if (p.state === 'raft') txt = 'Op het vlot...';
        else if (p.state === 'fly' || p.state === 'drop') txt = 'Platsj!';
        else if (o.state === 'swim') txt = Math.hypot(p.x - o.x, p.z - o.z) < RESCUE_DIST ? `Houd ${KEY_LABELS[p.i].a} vast: redden!` : `Ga naar ${o.name} bij de rand`;
        else txt = p.duck > 0.5 ? 'Gebukt' : p.inv > 0 ? 'Veilig even...' : 'Aan het werk';
        hud.setPlayerInfo(p.i, txt);
      }
    }

    function update(dt) {
      if (done) { animate(dt); updateBeams(dt * 0.4); return; }
      if (!started) onStart();
      t += dt;
      while (evi < EVENTS.length && t >= EVENTS[evi].t) EVENTS[evi++].fn();
      updateBeams(dt);
      // tegels
      tileT -= dt;
      if (tileT <= 0) {
        tileT = lerp(2.5, 1.5, clamp(t / DURATION, 0, 1));
        const q = pickTile(); if (q) { q.state = 'warn'; q.t = 1.9; audio.sfx('scrape', { vol: 0.5 }); fx.texts.add('!', q.cx, 1.8, q.cz, '#ff5a3a', 1.2); }
      }
      updateTiles(dt);
      // inslagen
      strikeT -= dt;
      if (strikeT <= 0 && t < DURATION - 3) { strikeT = lerp(6.5, 3.4, clamp(t / DURATION, 0, 1)) * rr(0.8, 1.2); launchPattern(); }
      updateStrikes(dt);
      // spelers
      for (const p of pl) updatePlayer(p, dt);
      // spelers duwen elkaar zachtjes weg
      {
        const a = pl[0], b = pl[1];
        if (a.state === 'play' && b.state === 'play') {
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
          if (d < 0.85 && d > 0.001 && Math.abs(a.y - b.y) < 1.2) {
            const pu = (0.85 - d) * 0.5, nx = dx / d, nz = dz / d;
            if (onGround(a.x - nx * pu, a.z - nz * pu)) { a.x -= nx * pu; a.z -= nz * pu; }
            if (onGround(b.x + nx * pu, b.z + nz * pu)) { b.x += nx * pu; b.z += nz * pu; }
          }
        }
      }
      for (const p of pl) checkBeams(p);
      updateRescue(dt);
      updateOrbAndCoins(dt);
      animate(dt);
      placeCamera(dt);
      updateHud();
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) hud.setHint(null); }
      // einde?
      if (pl.every(down)) {
        if (endT < 0) { endT = 0.9; hud.showBig('Allebei in de gracht!', 1500, '#ff7a6a'); }
        else { endT -= dt; if (endT <= 0) finishGame(false); }
      } else if (endT > 0 && !pl.every(down)) endT = -1;
      if (t >= DURATION && !done) finishGame(true);
    }

    function onStart() {
      started = true;
      hud.setTimer(DURATION); hud.setScore('Overleefd: 0 s');
      hud.setHint(`<b>${KEY_LABELS[0].a}/${KEY_LABELS[1].a}</b> = springen &nbsp;·&nbsp; <b>${KEY_LABELS[0].b}/${KEY_LABELS[1].b}</b> vasthouden = bukken &nbsp;·&nbsp; Zwemt je broer? Houd je A-knop vast bij de rand!`);
      hintT = 9;
      // demo-balk uit het intro weghalen
      beams.forEach((b) => { b.active = false; setBeamLen(b, 0); }); theta = 0; omega = 0;
    }

    // demo in intro: een langzame lage balk
    beams[0].active = true; beams[0].grow = 1; setBeamLen(beams[0], BEAM_L);
    function idleAnim(dt) {
      theta += dt * 0.55; for (const b of beams) if (b.active) { b.ang = theta + b.off; b.g.rotation.y = -b.ang; }
      spinner.rotation.y = -theta; animate(dt); placeCamera(dt);
    }
    pl.forEach((p) => { p.c.pose = 'idle'; });

    return {
      update,
      introUpdate: (dt) => idleAnim(dt),
      resultUpdate: (dt) => { if (!started) return; updateBeams(dt * 0.3); animate(dt); placeCamera(dt); },
      onStart,
      dispose() {},
      // voor tests
      debug: { pl, beams, tiles, get t() { return t; }, get theta() { return theta; }, get omega() { return omega; }, get done() { return done; }, knock, strikes, coinsL, orbS, get coins() { return coins; }, get rescues() { return rescues; }, addStrike },
    };
  },
};

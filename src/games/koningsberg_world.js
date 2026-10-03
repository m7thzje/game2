import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { skyTexture } from '../engine/lights.js';

// Wereld van "Koning van de Berg": een ronde stenen heuveltop in een meer van lava.
// De top bestaat uit N taartpunten (sectoren) met elk een eigen straal: zo kan de rand brokkelen.
export const KB = { R0: 9.5, N: 24, MIN_R: 4.7, CROWN_R: 2.4, H: 2.2 };
const DA = TAU / KB.N;

// ronde vloer-textuur (in schijf-coordinaten): flagstones, ringen en een gouden kroon-embleem in het midden
function topTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(31), c = w / 2;
    g.fillStyle = '#9a948c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { const l = 118 + r() * 60; g.fillStyle = `rgba(${l},${l - 6},${l - 14},.55)`; g.fillRect(r() * w, r() * h, 6 + r() * 22, 4 + r() * 14); }
    // ringen + spaken
    g.strokeStyle = 'rgba(40,32,28,.55)'; g.lineWidth = 3;
    for (const rad of [0.22, 0.4, 0.58, 0.76, 0.94]) { g.beginPath(); g.arc(c, c, rad * c, 0, TAU); g.stroke(); }
    for (let k = 0; k < 24; k++) { const a = k * TAU / 24; g.beginPath(); g.moveTo(c + Math.cos(a) * 0.22 * c, c + Math.sin(a) * 0.22 * c); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke(); }
    // kroonzone
    const zr = KB.CROWN_R / KB.R0 * c;
    const gr = g.createRadialGradient(c, c, 4, c, c, zr); gr.addColorStop(0, 'rgba(255,225,90,.95)'); gr.addColorStop(0.8, 'rgba(255,190,40,.6)'); gr.addColorStop(1, 'rgba(255,170,30,.25)');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, zr, 0, TAU); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, zr, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(120,70,0,.6)';
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; g.beginPath(); g.moveTo(c + Math.cos(a) * zr * 0.7, c + Math.sin(a) * zr * 0.7); g.lineTo(c + Math.cos(a + 0.3) * zr * 0.3, c + Math.sin(a + 0.3) * zr * 0.3); g.lineTo(c + Math.cos(a - 0.3) * zr * 0.3, c + Math.sin(a - 0.3) * zr * 0.3); g.fill(); }
    // scheurtjes
    g.strokeStyle = 'rgba(30,20,20,.4)'; g.lineWidth = 2;
    for (let i = 0; i < 30; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  });
}
// lava: oranje gloed met donkere korstplaten (tegelbaar: alles wordt ook aan de overkant getekend)
function lavaTexture(rx, ry, seed = 5) {
  const t = canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = '#f0560e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rr = 14 + r() * 36; for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { const q = g.createRadialGradient(x + ox, y + oy, 1, x + ox, y + oy, rr); q.addColorStop(0, 'rgba(255,230,90,.85)'); q.addColorStop(1, 'rgba(255,160,30,0)'); g.fillStyle = q; g.beginPath(); g.arc(x + ox, y + oy, rr, 0, TAU); g.fill(); } }
    for (let i = 0; i < 20; i++) {
      const x = r() * w, y = r() * h, rx_ = 30 + r() * 50, ry_ = 22 + r() * 36, rot = r() * 3;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h], [w, h], [-w, -h]]) {
        g.save(); g.translate(x + ox, y + oy); g.rotate(rot);
        g.fillStyle = 'rgba(48,14,6,.92)'; g.strokeStyle = 'rgba(255,170,40,.9)'; g.lineWidth = 3;
        g.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr = 0.8 + r() * 0.3; g.lineTo(Math.cos(a) * rx_ * rr, Math.sin(a) * ry_ * rr); } g.closePath(); g.fill(); g.stroke(); g.restore();
      }
    }
  }, { repeat: [rx, ry] });
  return t;
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

export function crownMesh(scale = 1) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0xb87800, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.28, flatShading: true });
  g.add(mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.42, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0xb87800, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.28, side: THREE.DoubleSide }), { cast: false, pos: [0, 0.21, 0] }));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    g.add(mesh(new THREE.ConeGeometry(0.15, 0.5, 4), gold, { cast: false, pos: [Math.cos(a) * 0.6, 0.62, Math.sin(a) * 0.6] }));
    g.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff3b3b : 0x3ab4ff, emissive: i % 2 ? 0xaa0000 : 0x0060c0, emissiveIntensity: 0.7 }), { cast: false, pos: [Math.cos(a) * 0.6, 0.92, Math.sin(a) * 0.6] }));
  }
  g.scale.setScalar(scale);
  return g;
}

export function buildWorld(ctx, L) {
  const { scene } = ctx;
  const { R0, N, H } = KB;
  const rng = mulberry32(2024);
  const W = { t: 0 };
  scene.background = skyTexture('#2a0a18', '#c24a1c');
  scene.fog = new THREE.Fog(0x8a2a14, 46, 120);

  // ---------------- lava ----------------
  const lavaT = lavaTexture(6, 6);
  W.lavaT = lavaT;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({ map: lavaT, color: 0xe89060 }));
  lava.rotation.x = -Math.PI / 2; lava.position.y = -3.0; scene.add(lava);
  const lava2 = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({ map: lavaTexture(4, 4, 7), color: 0xffc080, transparent: true, opacity: 0.35, depthWrite: false }));
  lava2.rotation.x = -Math.PI / 2; lava2.position.y = -2.92; scene.add(lava2);
  W.lava2T = lava2.material.map;
  // gloed rond de heuvel (ring op lavaniveau)
  const glow = new THREE.Mesh(new THREE.RingGeometry(R0 - 1, R0 + 7, 40), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xff6a1a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -2.8; scene.add(glow);

  // ---------------- heuveltop ----------------
  const topT = topTexture();
  const mk = (c, o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, ...o, color: c });
  const side = mk(0x5a463a), sideB = mk(0x4a382e), bot = mk(0x2a2020);
  const topA = new THREE.MeshStandardMaterial({ map: topT, color: 0xffffff, roughness: 0.95 });
  const topB = new THREE.MeshStandardMaterial({ map: topT, color: 0xd8d0cc, roughness: 0.95 });
  const topW = new THREE.MeshStandardMaterial({ map: topT, color: 0xffb0a0, emissive: 0xff2a10, emissiveIntensity: 0.55, roughness: 0.95 });
  const sideW = mk(0xa04030, { emissive: 0xff2a10, emissiveIntensity: 0.4 });
  const setsA = [side, topA, bot], setsB = [sideB, topB, bot], setsW = [sideW, topW, bot];
  W.sectors = [];
  for (let k = 0; k < N; k++) {
    const geo = new THREE.CylinderGeometry(1, 0.86, H, 1, 1, false, k * DA, DA);
    const m = new THREE.Mesh(geo, k % 2 ? setsB : setsA);
    m.position.y = -H / 2; m.scale.set(R0, 1, R0); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    W.sectors.push({ m, r: R0, target: R0, warn: 0, setsN: k % 2 ? setsB : setsA, shake: 0 });
  }
  W.sectorAt = (x, z) => { let a = Math.atan2(x, z); if (a < 0) a += TAU; return Math.min(N - 1, Math.floor(a / DA)); };
  W.radiusAt = (x, z) => W.sectors[W.sectorAt(x, z)].r;
  W.setWarn = (k, on) => { const s = W.sectors[k]; s.warn = on ? 1 : 0; s.m.material = on ? setsW : s.setsN; };

  // ---------------- kroon in het midden ----------------
  const crown = crownMesh(1.5); crown.position.y = 2.3; scene.add(crown); W.crown = crown;
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const zone = new THREE.Mesh(new THREE.RingGeometry(KB.CROWN_R - 0.28, KB.CROWN_R, 40), zoneMat); zone.rotation.x = -Math.PI / 2; zone.position.y = 0.05; scene.add(zone); W.zone = zone; W.zoneMat = zoneMat;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(KB.CROWN_R * 0.95, KB.CROWN_R * 0.95, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 3; scene.add(beam); W.beam = beam;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(KB.CROWN_R - 0.28, 32), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffd23f, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; scene.add(disc); W.disc = disc;

  // ---------------- decor: pilaren met toeschouwers, vulkanen, draak ----------------
  W.crowd = [];
  const pillars = [[-15, -8, 'goblin'], [14, -10, 'skeleton'], [-17, 6, 'goblin'], [16, 7, 'skeleton'], [0, -17, 'goblin'], [3, 16, 'skeleton']];
  for (const [x, z, kind] of pillars) {
    const ph = 2.2 + rng() * 1.6;
    scene.add(mesh(new THREE.CylinderGeometry(1.5, 2.0, ph + 3, 8), mat(0x4a3a34), { pos: [x, ph / 2 - 3 - 0.0, z] }));
    scene.add(mesh(new THREE.CylinderGeometry(1.7, 1.5, 0.3, 8), mat(0x6a5a50), { pos: [x, ph - 3 + 0.1, z] }));
    const c = makeNPC(kind); const s = 2.0; c.group.scale.setScalar(s); c.group.position.set(x, ph - 3 + 0.25, z);
    c.faceTowards(0, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group); W.crowd.push({ c, ph: rng() * 6, cheer: 0 });
  }
  // vulkanen op de achtergrond
  for (const [x, z, s] of [[-34, -44, 1.2], [30, -48, 1.5], [-60, -20, 1.0], [58, -24, 1.1], [4, -64, 1.8]]) {
    const cone = mesh(new THREE.ConeGeometry(14 * s, 24 * s, 10), mat(0x2a1a1a), { cast: false, receive: false, pos: [x, 8 * s, z] }); scene.add(cone);
    scene.add(new THREE.Mesh(new THREE.CylinderGeometry(3.6 * s, 4.4 * s, 1.0, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1a })).translateX(x).translateY(19.8 * s).translateZ(z));
  }
  // kleine rotsen in de lava
  for (let i = 0; i < 8; i++) { const a = rng() * TAU, d = 16 + rng() * 24; const rk = P.rock(0.8 + rng() * 1.6, 0x3a2a26); rk.position.set(Math.sin(a) * d, -3.4, Math.cos(a) * d); scene.add(rk); }
  const dragon = new Dragon(0xb02a2a, 0.9); dragon.group.position.set(24, 11, 0); scene.add(dragon.group); W.dragon = dragon;

  // brokstukken (pool): vallen in de lava
  W.chunks = Array.from({ length: 10 }, () => { const m = mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), mat(0x6a564a), { visible: false }); m.visible = false; scene.add(m); return { m, on: false, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0 }; });
  W.dropChunk = (x, z, vx, vz) => {
    const c = W.chunks.find((q) => !q.on); if (!c) return; c.on = true; c.m.visible = true; c.m.position.set(x, -0.3, z); c.vx = vx; c.vz = vz; c.vy = 1.5; c.rx = (Math.random() - 0.5) * 6; c.rz = (Math.random() - 0.5) * 6;
    c.m.scale.setScalar(0.6 + Math.random() * 0.9);
  };

  // ---------------- update ----------------
  W.update = (t, dt, st) => {
    W.t = t;
    lavaT.offset.set(t * 0.012, t * 0.008); W.lava2T.offset.set(-t * 0.02, t * 0.014);
    glow.material.opacity = 0.55 + Math.sin(t * 2) * 0.12;
    for (let k = 0; k < N; k++) {
      const s = W.sectors[k];
      if (s.r !== s.target) { s.r += Math.sign(s.target - s.r) * Math.min(Math.abs(s.target - s.r), dt * 7); }
      const wob = s.warn ? Math.sin(t * 40 + k) * 0.06 : 0;
      s.m.scale.set(s.r, 1, s.r); s.m.position.y = -H / 2 + wob;
    }
    crown.rotation.y = t * 1.6; crown.position.y = 2.3 + Math.sin(t * 2.4) * 0.22;
    W.zoneMat.opacity = 0.32 + Math.sin(t * 5) * 0.12;
    W.beam.material.opacity = 0.08 + Math.sin(t * 3) * 0.03;
    for (const c of W.chunks) if (c.on) {
      c.vy -= 22 * dt; c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt; c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
      if (c.m.position.y < -3) { c.on = false; c.m.visible = false; if (st && st.splash) st.splash(c.m.position.x, c.m.position.z, 0.8); }
    }
    for (const w of W.crowd) { w.ph += dt; w.cheer = Math.max(0, w.cheer - dt); w.c.pose = w.cheer > 0 || Math.sin(w.ph * 0.7) > 0.8 ? 'cheer' : 'idle'; w.c.update(dt); }
    dragon.update(dt); const da = t * 0.35; dragon.group.position.set(Math.cos(da) * 27, 11 + Math.sin(t * 0.9) * 1.2, Math.sin(da) * 27 - 6); dragon.group.rotation.y = -da + Math.PI;
  };
  W.cheer = (s = 1.5) => { for (const w of W.crowd) w.cheer = s + Math.random(); };
  return W;
}

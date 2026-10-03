import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, rand, pick, clamp, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { Dragon } from '../engine/chars.js';
import { mergeStatic } from './quickdraw_merge.js';
import { gradTex, glowTex, makeClouds, mkPlat } from './brawl_world.js';
import { STAGES } from './brawl_data.js';

// Twee extra podia voor Smash-Arena: de Drakenrug (bewegende platforms op een draak) en de Vulkaantoren (lava, brokkelende platforms, geisers).
// Beide leveren hetzelfde stage-object als brawl_world.buildIsland. `api` (door brawl.js ingevuld): fs, hurt(f,o), say(t,x,y,col,s), fireProj(...), shake(a), toast(t,ms), big(t,col), sfx(n,o), fx

const sprite = (map, color, sx, sy, x, y, z, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.scale.set(sx, sy, 1); s.position.set(x, y, z); return s; };

// ============================================================================
// DRAKENRUG
// ============================================================================
function bonePlate(w, trim = 0x2fa88a) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.42, 2.6), mat(0xe6dcc0), { cast: false, pos: [0, -0.21, 0] }));
  g.add(mesh(new THREE.BoxGeometry(w + 0.25, 0.1, 2.8), mat(trim, { metalness: 0.3, roughness: 0.5 }), { cast: false, pos: [0, -0.02, 0] }));
  const n = Math.max(2, Math.round(w / 1.4));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (w - 0.8) / Math.max(1, n - 1);
    g.add(mesh(new THREE.ConeGeometry(0.3, 1.0, 5), mat(0xf4ecd0), { cast: false, pos: [x, 0.42, -1.15] }));
    g.add(mesh(new THREE.ConeGeometry(0.26, 0.9, 5), mat(trim), { cast: false, pos: [x, -0.85, 0], rot: [Math.PI, 0, 0] }));
  }
  mergeStatic(g);
  return g;
}
function wingShape() {
  const pts = [[0, 0], [-1.6, 3.0], [-2.7, 6.4], [-0.9, 5.2], [0.3, 7.6], [1.5, 4.8], [3.2, 6.6], [3.1, 3.4], [4.4, 4.2], [3.6, 0.8], [0, 0]];
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return new THREE.ShapeGeometry(s);
}

export function buildDragon(ctx, api) {
  const { scene } = ctx; const rng = mulberry32(777);
  scene.background = gradTex([[0, '#2f6ad0'], [0.4, '#6aaaf0'], [0.75, '#b8dcff'], [1, '#ffe9c8']]);
  scene.fog = new THREE.Fog(0xbddcf6, 90, 260);
  const gt = glowTex();
  scene.add(sprite(gt, 0xfff0b0, 90, 90, 36, 22, -130, 0.8), sprite(gt, 0xffffff, 28, 28, 36, 22, -129, 1));
  const clouds = makeClouds(scene, rng, { N: 22, flow: -4.2, tint: [0xffffff, 0xeaf4ff, 0xfff4e6], near: 0xffffff });
  // verre eilandjes
  const far = new THREE.Group(); scene.add(far);
  for (const [x, y, z, r] of [[-48, 4, -80, 5], [52, 12, -90, 6], [-30, -14, -70, 4], [30, -20, -75, 5]]) {
    const prof = [[0, 0], [r, 0], [r * 0.8, -r * 0.4], [r * 0.4, -r * 1.2], [0, -r * 1.8]].map(([a, b]) => new THREE.Vector2(a, b));
    const m = mesh(new THREE.LatheGeometry(prof, 8), mat(0x8a78b8), { cast: false, receive: false, scale: [1, 1, 0.6], pos: [x, y, z] }); far.add(m);
    far.add(mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.4, 8), mat(0x6cc058), { cast: false, receive: false, scale: [1, 1, 0.6], pos: [x, y + 0.1, z] }));
  }
  mergeStatic(far);

  // de draak: lichaam/hals/staart uit Dragon (zijaanzicht, kop naar rechts), eigen vlakke vleugels
  const SC = 2.4;
  const dr = new Dragon(0x2fa88a, SC); dr.wings.forEach((w) => { w.p.visible = false; });
  const dgroup = new THREE.Group(); dgroup.add(dr.group); dr.group.rotation.y = Math.PI / 2; scene.add(dgroup);
  const wingGeo = wingShape(), wingM = new THREE.MeshStandardMaterial({ color: 0x57c9a8, side: THREE.DoubleSide, roughness: 0.8, flatShading: true });
  const wings = [-5.6, -7.0].map((z, k) => { const g = new THREE.Group(); const m = new THREE.Mesh(wingGeo, wingM); m.scale.setScalar(k ? 1.15 : 1); g.add(m); g.position.z = z; scene.add(g); return g; });
  const plateDefs = [{ rx: 0, ry: 0, w: 11 }, { rx: -9.4, ry: 1.3, w: 3.8, sy: 0.35, f: 1.3 }, { rx: 9.4, ry: 2.2, w: 3.4, sy: 0.5, f: 1.1 }, { rx: -0.8, ry: 5.7, w: 4.4, sy: 0.5, f: 0.9 }];
  const plats = plateDefs.map((d, i) => { const p = mkPlat(d.rx, d.ry, d.w, { nodrop: i === 0, def: d, moving: true }); p.g = bonePlate(d.w); scene.add(p.g); return p; });

  const A = { x: 0, y: 0, px: 0, py: 0 };
  let tt = 0, windT = 11, windWarn = 0, windDir = 1, fireT = 17, fireN = 0, diveWarned = false, dvy = 0;
  const diveAt = (t) => { const ph = t % 30; if (ph < 22 || ph > 26.5) return 0; const u = (ph - 22) / 4.5; return -4.2 * Math.pow(Math.sin(Math.PI * u), 2); };
  const anchor = (t) => ({ x: 4.2 * Math.sin(t * 0.27), y: 1.5 * Math.sin(t * 0.45 + 1) + 0.7 * Math.sin(t * 1.0) + diveAt(t) });
  function place(t, dt) {
    const a = anchor(t); A.px = A.x; A.py = A.y; A.x = a.x; A.y = a.y;
    for (const p of plats) {
      const d = p.def; p.py = p.y; const ox = p.x;
      p.x = A.x + d.rx; p.y = A.y + d.ry + (d.sy ? d.sy * Math.sin(t * d.f + p.def.rx) : 0);
      p.dx = p.x - ox; p.dy = p.y - p.py;
    }
    return [A.x - A.px, A.y - A.py];
  }
  place(0, 0.016);
  for (const p of plats) { p.dx = p.dy = 0; p.py = p.y; }
  function pose(t, dt) {
    dgroup.position.set(A.x, A.y - SC * 0.7, -3.3);
    dgroup.rotation.z = clamp(-dvy * 0.05, -0.25, 0.25); dgroup.rotation.x = Math.sin(t * 0.8) * 0.02;
    const f = Math.sin(t * 2.6);
    wings.forEach((w, k) => { w.position.x = A.x + 0.5; w.position.y = A.y + SC * 0.55; w.rotation.z = f * 0.45 + 0.15 + (k ? 0.25 : 0); w.scale.x = 1; });
    for (const p of plats) { p.g.position.set(p.x, p.y, 0); }
  }

  const S = {
    kind: 'dragon', ...STAGES.dragon, solid: null, plats, BLAST: { x: 28, bot: -17, top: 25 },
    mood: { hemi: 0xdcecff, ground: 0x7a8ab8, hemiI: 1.45, sun: 0xfff0d0, sunI: 2.1, sunPos: [10, 28, 24], fogNear: 90, fogFar: 260 },
    fdx: 0, fdy: 0, wind: 0,
    camBase: () => ({ x0: A.x - 12.5, x1: A.x + 12.5, y0: A.y - 3.6, y1: A.y + 11.2 }),
    resp: (i) => ({ x: A.x + (i ? 3.4 : -3.4), y: A.y + 11 }), start: (i) => ({ x: A.x + (i ? 3.4 : -3.4), y: A.y }),
    itemX: () => { const p = plats[Math.random() < 0.55 ? 0 : 1 + Math.floor(Math.random() * 3)]; return p.x + rand(-p.w / 3, p.w / 3); },
    mainP: plats[0],
    step(dt) {
      tt += dt; const oldY = A.y;
      [S.fdx, S.fdy] = place(tt, dt); dvy = (A.y - oldY) / Math.max(dt, 1e-4);
      // waarschuwing duik
      const ph = tt % 30;
      if (ph > 19.8 && ph < 22 && !diveWarned) { diveWarned = true; api.big('🐉 DUIK!', '#7fe0ff'); api.toast('De draak duikt! Houd je vast!', 2000); api.sfx('whoosh', { vol: 0.6, rate: 0.6 }); }
      if (ph < 19) diveWarned = false;
      // windvlaag
      if (windWarn > 0) { windWarn -= dt; if (windWarn <= 0) { S.wind = windDir * 5.5; windT = 4.2; api.sfx('whoosh', { vol: 0.7, rate: 0.5 }); } }
      else if (S.wind !== 0) { windT -= dt; if (windT <= 0) { S.wind = 0; windT = rand(16, 24); } else if (Math.random() < dt * 40) api.fx.particles.emit(A.x - windDir * 18 + rand(-4, 4), A.y + rand(-2, 12), 1, windDir * rand(22, 30), 0, 0, { life: 0.6, size: 0.5, color: 0xffffff, gravity: 0 }); }
      else { windT -= dt; if (windT <= 0) { windDir = Math.random() < 0.5 ? -1 : 1; windWarn = 1.3; api.big('💨 WIND!', '#bfe8ff'); api.toast(windDir > 0 ? 'Een rukwind blaast naar rechts!' : 'Een rukwind blaast naar links!', 2200); } }
      // vuurstoot uit de bek
      fireT -= dt;
      if (fireT <= 0 && fireN === 0) { fireN = 4; fireT = 0.5; api.big('🔥 VUUR!', '#ff9a3a'); api.sfx('buzz', { vol: 0.6, rate: 0.8 }); }
      else if (fireN > 0 && fireT <= 0) { fireN--; fireT = fireN ? 0.28 : rand(20, 28); const hx = A.x + 6.4, hy = A.y + 1.5; api.fireProj('fire', hx, hy, 8 + rand(-1.5, 3), 8 + rand(-1, 3), null); api.fx.particles.burst(hx, hy, 0, { count: 8, speed: 4, up: 0.3, life: 0.4, size: 0.6, colors: [0xff7a1a, 0xffd070], gravity: 0 }); }
    },
    update(t, dt) {
      dr.update(dt); pose(tt + t * 0, dt); clouds.update(dt);
      for (const k of [0, 1]) if (S.wind !== 0) { /* wolken sneller bij wind */ }
      far.position.x = Math.sin(t * 0.1) * 2;
    },
  };
  pose(0, 0);
  return S;
}

// ============================================================================
// VULKAANTOREN
// ============================================================================
function lavaTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffb02a'); gr.addColorStop(0.5, '#ff6a14'); gr.addColorStop(1, '#d8360c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry32(31);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rx = 14 + r() * 30, ry = 6 + r() * 14; g.fillStyle = `rgba(110,24,8,${0.35 + r() * 0.4})`; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x - w, y, rx, ry, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x + w, y, rx, ry, 0, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(255,230,120,.8)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y + (r() - 0.5) * 16, x + 30, y + (r() - 0.5) * 10); g.stroke(); }
  }, { repeat: [10, 5] });
}
function lavaEdgeTex() {
  return canvasTex(256, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe070'); gr.addColorStop(0.3, '#ffa020'); gr.addColorStop(1, '#ff6a14'); g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, 12 + Math.sin(x / w * TAU * 4) * 5 + Math.sin(x / w * TAU * 9) * 2.5);
    g.lineTo(w, h); g.closePath(); g.fill();
  }, { repeat: [14, 1] });
}

export function buildVolcano(ctx, api) {
  const { scene } = ctx; const rng = mulberry32(991);
  scene.background = gradTex([[0, '#12060e'], [0.35, '#3a0e1c'], [0.65, '#9a2a18'], [0.88, '#ff7a2a'], [1, '#ffb34a']]);
  scene.fog = new THREE.Fog(0x3c1410, 70, 210);
  const gt = glowTex();
  // ---- achtergrond: vulkaan met gloeiende krater en lavastromen ----
  const far = new THREE.Group(); scene.add(far);
  const rockM = mat(0x33232e), lavaM = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  {
    const prof = [[0, 24], [2.6, 23.4], [6, 18], [13, 7], [26, -8], [34, -26]].map(([x, y]) => new THREE.Vector2(x, y));
    const m = mesh(new THREE.LatheGeometry(prof, 9), rockM, { cast: false, receive: false, scale: [1, 1, 0.8] }); m.position.set(6, -3, -66); m.scale.set(1.3, 1.3, 1.0); far.add(m);
    for (const [x, y, z, s, c] of [[-46, -6, -80, 0.85, 0x2a1c28], [58, -4, -84, 0.9, 0x2a1c28], [-24, -8, -76, 0.5, 0x2a1c28]]) {
      const mm = mesh(new THREE.LatheGeometry(prof, 7), mat(c), { cast: false, receive: false }); mm.position.set(x, y, z); mm.scale.set(s, s, 0.8); far.add(mm);
    }
    // lavastromen over de helling (vlak voor de berg)
    for (const [ox, a] of [[-0.3, -0.5], [0.15, 0.15], [0.5, 0.65]]) {
      let px = 6 + ox * 2, py = -3 + 24 * 1.3;
      for (let k = 0; k < 6; k++) { const len = 4.2; const nx = px + Math.sin(a + k * 0.2) * 2.0 * (1 + k * 0.25), ny = py - len * 1.5; far.add(mesh(new THREE.BoxGeometry(0.6 + k * 0.12, len * 1.7, 0.2), lavaM, { cast: false, receive: false, pos: [(px + nx) / 2, (py + ny) / 2, -66 + 6 + k * 3.0], rot: [0, 0, Math.atan2(nx - px, py - ny) * 0.9] })); px = nx; py = ny; }
    }
    far.add(mesh(new THREE.CylinderGeometry(3.1, 2.7, 1, 9), lavaM, { cast: false, receive: false, pos: [6, -3 + 24 * 1.3 - 0.4, -66] }));
    mergeStatic(far);
  }
  scene.add(sprite(gt, 0xff7a2a, 60, 46, 6, 28, -62, 0.9), sprite(gt, 0xffc060, 22, 18, 6, 28, -61, 1), sprite(gt, 0xff5a1a, 150, 40, 0, -6, -50, 0.35));
  // rook en vonken (geinstantieerd)
  const SM = 9, smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x4a3038, transparent: true, opacity: 0.55, fog: false }), SM); smoke.frustumCulled = false; scene.add(smoke);
  const EM = 56, embers = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false }), EM); embers.frustumCulled = false; scene.add(embers);
  const smk = Array.from({ length: SM }, (_, i) => ({ y: i * 3.5, x: 0, s: 1 })), emb = Array.from({ length: EM }, () => ({ x: (rng() - 0.5) * 70, y: -12 + rng() * 40, z: -2 - rng() * 14, v: 1.5 + rng() * 3, ph: rng() * 6, s: 0.6 + rng() }));
  const dum = new THREE.Object3D();

  // ---- de toren (vast blok) ----
  const HW = 5.2;
  const tower = new THREE.Group(); scene.add(tower);
  tower.add(mesh(new THREE.CylinderGeometry(HW, HW, 44, 12), new THREE.MeshStandardMaterial({ map: tex.stone(3, 8), color: 0x9a8a9a, roughness: 1, flatShading: true }), { cast: false, receive: true, pos: [0, -22, 0], scale: [1, 1, 0.5] }));
  tower.add(mesh(new THREE.CylinderGeometry(HW + 0.25, HW + 0.25, 0.5, 12), mat(0x5a4a5e), { cast: false, pos: [0, -0.22, 0], scale: [1, 1, 0.5] }));
  tower.add(mesh(new THREE.CylinderGeometry(HW - 0.1, HW - 0.1, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x6a5a6e, roughness: 1, flatShading: true }), { cast: false, receive: true, pos: [0, -0.04, 0], scale: [1, 1, 0.5] }));
  for (let i = 0; i < 9; i++) tower.add(mesh(new THREE.BoxGeometry(0.8, 0.9, 0.7), mat(0x5a4a5e), { cast: false, pos: [-4.3 + i * 1.08, 0.45, -1.35] }));
  for (const sx of [-1, 1]) { tower.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.7, 6), mat(0x3a2a2a), { pos: [sx * 4.7, 0.85, -1.1] })); }
  const flameMs = [];
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 6), new THREE.MeshBasicMaterial({ color: 0xff8a20 })); f.position.set(sx * 4.7, 2.0, -1.1); f.userData.dyn = true; tower.add(f); flameMs.push(f); }
  // runen die gloeien
  for (const [x, y] of [[-2.5, -3], [2.2, -5.5], [-1, -8], [3, -11], [-3, -13]]) tower.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.1), lavaM, { cast: false, pos: [x, y, 1.4] }));
  mergeStatic(tower);
  // geisers: vent + kolom
  const gx = [-2.7, 2.7];
  const ventM = [0, 1].map((k) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.14, 12), new THREE.MeshBasicMaterial({ color: 0x5a2a1a })); m.position.set(gx[k], 0.08, 0.1); scene.add(m); return m; });
  const colM = [0, 1].map((k) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 15, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(gx[k], 7.5, 0.1); m.visible = false; scene.add(m); return m; });
  const gey = [{ t: 4.5, ph: 'idle' }, { t: 9, ph: 'idle' }];

  // ---- platforms die brokkelen ----
  const mkSlab = (w) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w, 0.45, 2.6), new THREE.MeshStandardMaterial({ map: tex.stone(2, 1), color: 0x8a7a8a, roughness: 1, flatShading: true }), { cast: false, pos: [0, -0.22, 0] }));
    g.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.1, 2.7), mat(0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 0.9 }), { cast: false, pos: [0, -0.3, 0] }));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.4, 1.3, 5), mat(0x4a3a4a), { cast: false, pos: [sx * (w / 2 - 0.6), -1.0, 0], rot: [Math.PI, 0, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.45, 1.7, 5), mat(0xff6a1a, { emissive: 0xff4a10, emissiveIntensity: 0.8 }), { cast: false, pos: [0, -1.2, 0], rot: [Math.PI, 0, 0] }));
    mergeStatic(g); return g;
  };
  const plats = [[-8.4, 3.4, 4.6], [8.4, 3.4, 4.6], [0, 7.6, 4.6], [-9.2, -1.2, 3.4], [9.2, -1.2, 3.4]].map(([x, y, w]) => {
    const p = mkPlat(x, y, w, { crumble: { stand: 0, st: 'ok', t: 0, fy: 0, vy: 0 } }); p.g = mkSlab(w); p.g.position.set(x, y, 0); scene.add(p.g); return p;
  });
  const mainP = { x: 0, y: 0, w: HW * 2, solid: true, on: true, dx: 0, dy: 0, py: 0 };

  // ---- lava ----
  const lt = lavaTex(), le = lavaEdgeTex();
  const lavaBody = new THREE.Mesh(new THREE.PlaneGeometry(190, 60), new THREE.MeshBasicMaterial({ map: lt, fog: false })); lavaBody.position.z = 3.0; scene.add(lavaBody);
  const lavaEdge = new THREE.Mesh(new THREE.PlaneGeometry(190, 2.2), new THREE.MeshBasicMaterial({ map: le, transparent: true, fog: false })); lavaEdge.position.z = 3.05; scene.add(lavaEdge);
  const lavaGlow = sprite(gt, 0xff6a1a, 150, 16, 0, 0, 3.1, 0.5); scene.add(lavaGlow);
  const clouds = null;

  let tt = 0, lavaY = -9.5, spitT = 8, bubT = 0; const lavaCd = [0, 0];
  const lavaAt = (t) => lerp(-9.6, -3.4, 0.5 - 0.5 * Math.cos(t / 46 * TAU));
  const S = {
    kind: 'volcano', ...STAGES.volcano, solid: { hw: HW, top: 0, bot: -44 }, plats, mainP, BLAST: { x: 27, bot: -16, top: 25 },
    mood: { hemi: 0xffa070, ground: 0x4a2018, hemiI: 1.15, sun: 0xff9a5a, sunI: 1.8, sunPos: [-6, 24, 22], fogNear: 70, fogFar: 210 },
    fdx: 0, fdy: 0, wind: 0,
    get lavaY() { return lavaY; },
    camBase: () => ({ x0: -11.8, x1: 11.8, y0: -3.6, y1: 11 }),
    resp: (i) => ({ x: i ? 3.6 : -3.6, y: 10.5 }), start: (i) => ({ x: i ? 4 : -4, y: 0 }),
    itemX: () => { if (Math.random() < 0.6) return rand(-4, 4); const ok = plats.filter((p) => p.on && p.y > 0); const p = ok.length ? pick(ok) : plats[2]; return p.x + rand(-1.5, 1.5); },
    step(dt) {
      tt += dt; lavaY = lavaAt(tt);
      // brokkelen
      for (const p of plats) {
        const c = p.crumble;
        if (c.st === 'ok') {
          let on = false; for (const f of api.fs) if (f.st !== 'dead' && f.grounded && f.ground === p) on = true;
          c.stand = on ? c.stand + dt : Math.max(0, c.stand - dt * 0.5);
          if (c.stand > 0.9) { c.st = 'shake'; c.t = 0; api.sfx('thud', { vol: 0.4, rate: 0.6 }); api.say('KRAK!', p.x, p.y + 1.6, '#ffb070', 1.1); }
        } else if (c.st === 'shake') {
          c.t += dt; if (Math.random() < dt * 20) api.fx.particles.burst(p.x + rand(-p.w / 2, p.w / 2), p.y - 0.4, 0, { count: 3, speed: 2, up: -0.2, life: 0.6, size: 0.35, colors: [0x7a6a7a, 0xff8a30], gravity: 8 });
          if (c.t > 0.7) { c.st = 'fall'; c.t = 0; c.vy = 0; p.on = false; api.sfx('explode', { vol: 0.3, rate: 1.6 }); api.fx.particles.burst(p.x, p.y, 0, { count: 16, speed: 5, up: 0.5, life: 0.7, size: 0.45, colors: [0x7a6a7a, 0xff8a30], gravity: 8 }); }
        } else if (c.st === 'fall') {
          c.t += dt; c.vy -= 30 * dt; c.fy += c.vy * dt; if (c.t > 1.4) { c.st = 'gone'; c.t = 0; p.g.visible = false; }
        } else if (c.st === 'gone') {
          c.t += dt; if (c.t > 4.2) { c.st = 'ok'; c.stand = 0; c.fy = 0; c.vy = 0; p.on = true; p.g.visible = true; api.fx.particles.burst(p.x, p.y, 0, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.4, colors: [0xffffff, 0xffb040], gravity: 2 }); }
        }
      }
      // geisers
      for (let k = 0; k < 2; k++) {
        const g = gey[k]; g.t -= dt;
        if (g.ph === 'idle' && g.t <= 0) { g.ph = 'warn'; g.t = 1.5; api.sfx('buzz', { vol: 0.35, rate: 1.6 }); api.say('!', gx[k], 2.2, '#ffb040', 1.4); }
        else if (g.ph === 'warn') { if (Math.random() < dt * 25) api.fx.particles.emit(gx[k] + rand(-0.6, 0.6), 0.3, 0.3, rand(-0.5, 0.5), rand(2, 4), 0, { life: 0.5, size: 0.4, color: 0xff9a2a, gravity: -1 }); if (g.t <= 0) { g.ph = 'erupt'; g.t = 1.05; api.shake(0.45); api.sfx('explode', { vol: 0.5, rate: 1.2 }); } }
        else if (g.ph === 'erupt') {
          if (Math.random() < dt * 40) api.fx.particles.emit(gx[k] + rand(-0.6, 0.6), rand(1, 12), 0.3, rand(-1, 1), rand(4, 9), 0, { life: 0.5, size: 0.5, color: pick([0xffd070, 0xff7a1a]), gravity: 0 });
          for (const f of api.fs) if (f.st !== 'dead' && Math.abs(f.x - gx[k]) < 1.15 + f.hw && f.y < 14.5 && f.y + f.hh > 0 && (f.geyCd || 0) <= 0) {
            if (api.hurt(f, { dmg: 9, bkb: 15, kbg: 0.07, ang: 84, dirx: f.x >= gx[k] ? 1 : -1, x: f.x, y: f.y + 1, big: 1, snd: 'sizzle', hs: 0.1, hazard: 1 })) { f.geyCd = 0.8; api.say('GEISER!', f.x, f.y + f.hh + 1, '#ff9a3a', 1.3); }
          }
          if (g.t <= 0) { g.ph = 'idle'; g.t = rand(7, 9); }
        }
      }
      for (const f of api.fs) f.geyCd = Math.max(0, (f.geyCd || 0) - dt);
      // lava raakt je
      for (let i = 0; i < 2; i++) {
        const f = api.fs[i]; lavaCd[i] = Math.max(0, lavaCd[i] - dt);
        if (f.st !== 'dead' && f.y + 0.4 < lavaY && lavaCd[i] <= 0 && f.y > S.BLAST.bot + 3) {
          if (api.hurt(f, { dmg: 12, bkb: 22, kbg: 0.05, ang: 88, dirx: f.x > 0 ? -1 : 1, x: f.x, y: lavaY, big: 1, snd: 'sizzle', hs: 0.12, hazard: 1 })) { lavaCd[i] = 1.0; api.say('HEET!', f.x, lavaY + 2.2, '#ff7a1a', 1.5); api.fx.particles.burst(f.x, lavaY, 0.5, { count: 24, speed: 8, up: 1.2, life: 0.8, size: 0.6, colors: [0xff7a1a, 0xffd070, 0xff4a2a], gravity: 6 }); }
          else lavaCd[i] = 0.3;
        }
      }
      // lava spuugt vuurballen
      spitT -= dt;
      if (spitT <= 0) { spitT = rand(7, 10); const n = 2 + (Math.random() < 0.4 ? 1 : 0); api.sfx('sizzle', { vol: 0.5 }); for (let k = 0; k < n; k++) { const x = (Math.random() < 0.5 ? -1 : 1) * rand(7, 15); api.fireProj('fire', x, lavaY + 0.4, -Math.sign(x) * rand(1, 4), rand(22, 28), null); } }
    },
    update(t, dt) {
      // lava mesh volgt lavaY
      lavaBody.position.y = lavaY - 0.8 - 30; lavaEdge.position.y = lavaY - 0.1; lavaGlow.position.y = lavaY + 1.6; lavaGlow.material.opacity = 0.42 + Math.sin(t * 2) * 0.08;
      lt.offset.x = (t * 0.012) % 1; le.offset.x = (t * 0.02) % 1;
      bubT -= dt; if (bubT <= 0) { bubT = 0.12; api.fx.particles.emit(rand(-14, 14), lavaY + 0.2, 1.6, rand(-0.5, 0.5), rand(2, 4), 0, { life: 0.7, size: 0.5, color: pick([0xffd070, 0xff7a1a]), gravity: 4 }); }
      for (const p of plats) { const c = p.crumble; const sh = c.st === 'shake' ? 0.08 : 0; p.g.position.set(p.x + (sh ? (Math.random() - 0.5) * sh * 2 : 0), p.y + c.fy + (sh ? (Math.random() - 0.5) * sh : 0), 0); if (c.st === 'fall') p.g.rotation.z += dt * 1.5; else p.g.rotation.z = 0; }
      for (let k = 0; k < 2; k++) {
        const g = gey[k], v = ventM[k], c = colM[k];
        v.material.color.setHex(g.ph === 'warn' ? (Math.sin(t * 30) > 0 ? 0xffa030 : 0xff4a10) : g.ph === 'erupt' ? 0xffd070 : 0x5a2a1a);
        c.visible = g.ph === 'erupt'; if (c.visible) { c.scale.set(1 + Math.sin(t * 40) * 0.12, 0.85 + Math.min(1, (1.05 - g.t) * 6) * 0.15, 1); c.material.opacity = 0.55 + Math.sin(t * 25) * 0.25; }
      }
      for (let i = 0; i < flameMs.length; i++) { const f = flameMs[i]; f.scale.y = 1 + Math.sin(t * 13 + i * 2) * 0.16; f.rotation.y = t * 2; }
      for (let i = 0; i < SM; i++) { const o = smk[i]; o.y += dt * 2.2; if (o.y > 26) { o.y = 0; o.x = rand(-1, 1); } const u = o.y / 26; dum.position.set(6 + o.x + u * 7 + Math.sin(t * 0.5 + i) * 1.2, -3 + 24 * 1.3 + o.y, -64 + (i % 3)); dum.scale.setScalar(2.2 + u * 5); dum.updateMatrix(); smoke.setMatrixAt(i, dum.matrix); }
      smoke.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < EM; i++) { const o = emb[i]; o.y += o.v * dt; if (o.y > 30) { o.y = -14; o.x = (Math.random() - 0.5) * 70; } dum.position.set(o.x + Math.sin(t + o.ph) * 1.2, o.y, o.z); dum.rotation.set(t * 2 + o.ph, t, 0); dum.scale.setScalar(o.s * (0.7 + 0.3 * Math.sin(t * 5 + o.ph))); dum.updateMatrix(); embers.setMatrixAt(i, dum.matrix); }
      embers.instanceMatrix.needsUpdate = true;
      far.position.y = Math.sin(t * 0.3) * 0.3;
    },
  };
  return S;
}

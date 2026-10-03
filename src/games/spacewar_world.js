import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, lerp } from '../engine/util.js';

// Omgeving en bouwstenen voor "Ruimtegevecht": neon-sterrenhemel, arena-rand met "portalen", de Toverster (zwaartekracht)
// in het midden en de twee schepen (drakenschip en heksenbezem). Camera kijkt recht van boven.

export const AX = 27, AZ = 16;        // halve breedte / hoogte van de arena (wrap-around)

const glowTex = () => canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });

function bgTexture() {
  return canvasTex(1024, 640, (g, w, h) => {
    const r = mulberry32(99);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0a0828'); gr.addColorStop(0.5, '#160c3a'); gr.addColorStop(1, '#07142e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const cols = ['255,60,200', '60,200,255', '150,90,255', '255,140,60', '60,255,170'];
    for (let i = 0; i < 16; i++) { const x = r() * w, y = r() * h, rad = 90 + r() * 200, c = cols[i % cols.length]; const rg = g.createRadialGradient(x, y, 4, x, y, rad); rg.addColorStop(0, `rgba(${c},${0.2 + r() * 0.15})`); rg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 520; i++) { const s = r() < 0.06 ? 2.4 : 1.2; g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.65})`; g.fillRect(r() * w, r() * h, s, s); }
  });
}
function gridTexture() {
  return canvasTex(512, 320, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const sx = w / (2 * AX), sz = h / (2 * AZ);
    g.strokeStyle = 'rgba(120,200,255,.5)'; g.lineWidth = 1.5;
    for (let x = -AX; x <= AX; x += 3) { g.beginPath(); g.moveTo((x + AX) * sx, 0); g.lineTo((x + AX) * sx, h); g.stroke(); }
    for (let z = -AZ; z <= AZ; z += 3.2) { g.beginPath(); g.moveTo(0, (z + AZ) * sz); g.lineTo(w, (z + AZ) * sz); g.stroke(); }
    g.strokeStyle = 'rgba(255,120,220,.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}
function dashTexture(col) {
  return canvasTex(128, 16, (g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 2, 0, 22, h); }, { repeat: [1, 1] });
}
// Gezicht van de Toverster: ogen en mond liggen op een plat vlak dat naar boven kijkt
function faceTexture(mood) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineCap = 'round';
    g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(128 + sx * 52, 100, 30, 38, 0, 0, TAU); g.fill(); g.lineWidth = 5; g.strokeStyle = '#3a1a00'; g.stroke(); }
    g.strokeStyle = '#3a1a00'; g.lineWidth = 12;
    if (mood === 'happy') { g.beginPath(); g.arc(128, 150, 48, 0.25, Math.PI - 0.25); g.stroke(); }
    else if (mood === 'oh') { g.fillStyle = '#5a1020'; g.beginPath(); g.ellipse(128, 176, 26, 34, 0, 0, TAU); g.fill(); g.stroke(); }
    else { g.beginPath(); g.arc(128, 214, 48, Math.PI + 0.3, TAU - 0.3); g.stroke(); g.lineWidth = 10; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(128 + sx * 90, 52); g.lineTo(128 + sx * 22, 78); g.stroke(); } }
  });
}
function rayTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.translate(128, 128);
    for (let i = 0; i < 12; i++) { g.rotate(TAU / 12); const gr = g.createLinearGradient(0, 0, 0, -124); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(-9 - (i % 2) * 3, 0); g.lineTo(0, -(i % 2 ? 90 : 124)); g.lineTo(9 + (i % 2) * 3, 0); g.fill(); }
  });
}

export function buildSpace(ctx) {
  const { scene } = ctx;
  const W = { t: 0 };
  scene.background = new THREE.Color(0x070520);
  scene.fog = null;
  // sterrenhemel (platte plaat) + nevels
  const bgT = bgTexture();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(150, 94), new THREE.MeshBasicMaterial({ map: bgT, fog: false, depthWrite: false })); bg.rotation.x = -Math.PI / 2; bg.position.set(0, -6, -3); scene.add(bg); W.bg = bg;
  // schemerende sterren op twee lagen (parallax)
  const starLayers = [];
  for (const [n, y, size, op] of [[160, -4, 2.2, 0.9], [90, -2.5, 3.2, 0.7]]) {
    const p = new Float32Array(n * 3), r = mulberry32(n);
    for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 120; p[i * 3 + 1] = y; p[i * 3 + 2] = (r() - 0.5) * 76; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: false, transparent: true, opacity: op, fog: false })); scene.add(pts); starLayers.push(pts);
  }
  // raster op de arena-vloer
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(2 * AX, 2 * AZ), new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = -0.5; scene.add(grid);
  // zachte arena-gloed (donkerder vlak waar het spel zich afspeelt)
  const arena = new THREE.Mesh(new THREE.PlaneGeometry(2 * AX, 2 * AZ), new THREE.MeshBasicMaterial({ color: 0x0a0630, transparent: true, opacity: 0.45, depthWrite: false, fog: false })); arena.rotation.x = -Math.PI / 2; arena.position.y = -0.8; scene.add(arena);

  // arena-rand: lopende neon-streepjes ("portalen" naar de andere kant)
  W.dashes = [];
  const edge = (len, x, z, rotY, col, css) => {
    const t = dashTexture(css); t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 4, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: t, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rotY; m.position.set(x, -0.2, z); scene.add(m); W.dashes.push({ t, dir: Math.sign(x + z) || 1 });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); line.rotation.x = -Math.PI / 2; line.rotation.z = rotY; line.position.set(x * 1.0, -0.15, z); scene.add(line);
  };
  edge(2 * AX + 1, 0, -AZ - 0.9, 0, 0x6fe8ff, 'rgba(255,255,255,1)'); edge(2 * AX + 1, 0, AZ + 0.9, 0, 0xff6fd8, 'rgba(255,255,255,1)');
  edge(2 * AZ + 1, -AX - 0.9, 0, Math.PI / 2, 0xffe14a, 'rgba(255,255,255,1)'); edge(2 * AZ + 1, AX + 0.9, 0, Math.PI / 2, 0x8dff9a, 'rgba(255,255,255,1)');
  // hoekpalen
  const gt = glowTex();
  for (const [x, z, c] of [[-AX - 0.9, -AZ - 0.9, 0x6fe8ff], [AX + 0.9, -AZ - 0.9, 0xffe14a], [-AX - 0.9, AZ + 0.9, 0xff6fd8], [AX + 0.9, AZ + 0.9, 0x8dff9a]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9 })); s.scale.set(5, 5, 1); s.position.set(x, 0.5, z); scene.add(s);
  }
  // startpads
  W.pads = [-1, 1].map((sd, i) => {
    const col = i ? 0x4a8cff : 0x35c46f, g = new THREE.Group(); g.position.set(sd * AX * 0.72, -0.4, -sd * 6);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.2, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); disc.rotation.x = -Math.PI / 2; g.add(disc);
    scene.add(g); return g;
  });

  // ---- de Toverster ----
  const star = new THREE.Group(); star.position.set(0, 0.2, 0); scene.add(star); W.star = star;
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: rayTexture(), color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); rays.rotation.x = -Math.PI / 2; rays.position.y = 0.1; star.add(rays); W.rays = rays;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffa83a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9 })); halo.scale.set(11, 11, 1); halo.position.y = 0.3; star.add(halo); W.halo = halo;
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd24a, fog: false })); star.add(core); W.core = core;
  const faceMats = { happy: faceTexture('happy'), oh: faceTexture('oh'), grump: faceTexture('grump') };
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: faceMats.happy, transparent: true, depthWrite: false, fog: false })); face.rotation.x = -Math.PI / 2; face.position.y = 1.4; star.add(face); W.face = face; W.faceMats = faceMats;
  // pupillen kijken naar de dichtstbijzijnde speler
  W.pupils = [-1, 1].map((sx) => { const p = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), new THREE.MeshBasicMaterial({ color: 0x1a0a00, fog: false })); p.rotation.x = -Math.PI / 2; p.position.y = 1.43; star.add(p); p.userData.sx = sx; return p; });
  W.rings = [0, 1, 2].map((k) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.3 })); m.rotation.x = -Math.PI / 2; m.position.y = -0.3; scene.add(m); return m; });
  W.accretion = new THREE.Mesh(new THREE.RingGeometry(1.6, 3.2, 40), new THREE.MeshBasicMaterial({ color: 0xb06bff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); W.accretion.rotation.x = -Math.PI / 2; W.accretion.position.y = 0.2; scene.add(W.accretion);

  W.starMood = 'happy';
  W.setMood = (m) => { if (W.starMood === m) return; W.starMood = m; face.material.map = faceMats[m]; face.material.needsUpdate = true; };
  W.setHole = (k, r) => {          // k 0..1: zwart-gat-modus (sudden death)
    core.material.color.setRGB(lerp(1, 0.08, k), lerp(0.82, 0.0, k), lerp(0.29, 0.2, k));
    rays.material.color.setRGB(lerp(1, 0.6, k), lerp(0.82, 0.3, k), lerp(0.29, 1, k)); halo.material.color.setRGB(lerp(1, 0.55, k), lerp(0.66, 0.2, k), lerp(0.23, 1, k));
    core.scale.setScalar(r / 1.35); W.accretion.material.opacity = k * 0.8; W.accretion.scale.setScalar(r / 1.6 * 1.0);
    for (const r2 of W.rings) r2.material.color.setRGB(lerp(0.5, 0.75, k), lerp(0.85, 0.3, k), 1);
  };
  W.update = (t, dt, nearest) => {
    W.t = t;
    for (const d of W.dashes) d.t.offset.x = (t * 0.4 * d.dir) % 1;
    bgT.offset.x = (t * 0.002) % 1; starLayers[0].position.x = Math.sin(t * 0.05) * 2; starLayers[1].position.x = Math.sin(t * 0.05) * 4; starLayers[1].position.z = Math.cos(t * 0.04) * 2;
    rays.rotation.z = t * 0.5; W.accretion.rotation.z = -t * 1.4;
    halo.material.opacity = 0.8 + Math.sin(t * 3) * 0.12;
    for (let k = 0; k < 3; k++) { const ph = ((t * 0.28 + k / 3) % 1); const r = lerp(13, 2.2, ph * ph * 0.5 + ph * 0.5); W.rings[k].scale.setScalar(r); W.rings[k].material.opacity = 0.32 * Math.sin(ph * Math.PI); }
    if (nearest) for (const p of W.pupils) { const dx = nearest.x, dz = nearest.z, l = Math.hypot(dx, dz) || 1; p.position.set(p.userData.sx * 0.45 * 0.9 + dx / l * 0.12, 1.43, -0.07 + dz / l * 0.12 + 0.0); }
    star.position.y = 0.2 + Math.sin(t * 2) * 0.05;
  };
  return W;
}

// ---------------- schepen ----------------
// forward = +z. Lengte ~3.2, hitbox-straal 1.0 (in game).
function wingGeo(span, back, front) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, front, 0, 0, -back, span, 0, -back * 1.15, 0, 0, front * 0.2, span * 0.55, 0, -back * 0.2, span, 0, -back * 1.15], 3));
  g.setIndex([0, 2, 1, 3, 4, 5]); g.computeVertexNormals(); return g;
}
const stdM = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, flatShading: true, ...o });

export function buildDragonShip(color = 0x35c46f) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const hull = stdM(color), belly = stdM(0xffd23f, { emissive: 0xff9a10, emissiveIntensity: 0.35 }), glow = new THREE.MeshBasicMaterial({ color: 0x9dffb0 });
  body.add(mesh(new THREE.CapsuleGeometry(0.55, 1.6, 4, 10), hull, { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.3, 0], scale: [1.1, 1, 0.8] }));
  body.add(mesh(new THREE.CapsuleGeometry(0.42, 1.4, 4, 8), belly, { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.18, 0.05], scale: [1.0, 1, 0.7] }));
  // drakenkop vooraan
  const head = new THREE.Group(); head.position.set(0, 0.45, 1.75); body.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.85), hull, { cast: false, pos: [0, 0, 0.2] }));
  head.add(mesh(new THREE.ConeGeometry(0.18, 0.55, 5), glow, { cast: false, pos: [0, 0.05, 0.75], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) { head.add(mesh(new THREE.ConeGeometry(0.1, 0.55, 5), stdM(0xf5ecd0), { cast: false, pos: [sx * 0.24, 0.35, -0.05], rot: [-0.7, 0, sx * 0.3] })); head.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffff60 }), { cast: false, pos: [sx * 0.22, 0.12, 0.38] })); }
  // vleugels
  const wm = new THREE.MeshStandardMaterial({ color: 0xb8ffd0, emissive: color, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.6, flatShading: true, transparent: true, opacity: 0.93 });
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(wingGeo(2.1, 0.9, 0.7), wm); w.scale.x = sx; w.position.set(sx * 0.35, 0.45, 0.2); body.add(w); }
  // staart met punten
  for (let i = 0; i < 4; i++) body.add(mesh(new THREE.ConeGeometry(0.32 - i * 0.06, 0.8, 5), hull, { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.3, -1.25 - i * 0.55] }));
  body.add(mesh(new THREE.ConeGeometry(0.2, 0.55, 4), belly, { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.3, -3.5] }));
  // vlam achteraan
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 7), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.3, -2.2); fl.visible = false; body.add(fl);
  g.userData = { body, flame: fl, seat: new THREE.Vector3(0, 0.75, 0.25), wm };
  return g;
}
export function buildBroomShip(color = 0x4a8cff) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const wood = stdM(0x8a5a2b), straw = stdM(0xe8c060), main = stdM(color, { emissive: color, emissiveIntensity: 0.3 });
  body.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 7), wood, { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.3, 0.3] }));
  // bezemhaar
  for (let k = -3; k <= 3; k++) body.add(mesh(new THREE.ConeGeometry(0.1, 1.5, 4), k % 2 ? straw : stdM(0xd8a840), { cast: false, rot: [-Math.PI / 2 + k * 0.12, 0, 0], pos: [k * 0.1, 0.3 - Math.abs(k) * 0.02, -2.0], }));
  body.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 5, 10), main, { cast: false, rot: [0, Math.PI / 2, 0], pos: [0, 0.3, -1.3] }));
  // glim-orb vooraan + puntige neus
  body.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbfe0ff }), { cast: false, pos: [0, 0.3, 2.05] }));
  body.add(mesh(new THREE.ConeGeometry(0.18, 0.6, 6), main, { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.3, 1.7] }));
  // kleine "vleugels": heksenhoed-rand + sterretjes aan de zijkant
  const cape = new THREE.Mesh(wingGeo(1.3, 0.7, 0.4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, side: THREE.DoubleSide, roughness: 0.6, flatShading: true, transparent: true, opacity: 0.9 }));
  for (const sx of [-1, 1]) { const w = cape.clone(); w.scale.x = sx; w.position.set(sx * 0.25, 0.4, 0.1); body.add(w); }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.6, 7), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.3, -2.9); fl.visible = false; body.add(fl);
  g.userData = { body, flame: fl, seat: new THREE.Vector3(0, 0.55, 0.3) };
  return g;
}

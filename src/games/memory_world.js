import * as THREE from 'three';
import { mat, mesh, glow, canvasTex, clamp, lerp, damp, rand, pick, TAU, mulberry32, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { mergeStatic } from './quickdraw_merge.js';

// De magische bibliotheek voor het Geheugen-Duel: tafel met een gigantisch toverboek, kandelaars, zwevende boeken, uil, poltergeist.
export const BOOK_TOP = 0.42;          // bovenkant van de pagina's
const FONT = (s) => `bold ${s}px Fredoka, Arial Black, Arial, sans-serif`;

function flameTex() {
  return canvasTex(64, 96, (g, w, h) => {
    const gr = g.createRadialGradient(32, 62, 2, 32, 58, 34); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,200,80,.95)'); gr.addColorStop(0.7, 'rgba(255,120,30,.45)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 40, 62, 78, 32, 90); g.bezierCurveTo(2, 78, 4, 40, 32, 4); g.fill();
  });
}
function glowTex(color = '255,230,160') {
  return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${color},.9)`); gr.addColorStop(0.4, `rgba(${color},.35)`); gr.addColorStop(1, `rgba(${color},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}

function shelfTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(99);
    g.fillStyle = '#2a170c'; g.fillRect(0, 0, w, h);
    const rows = 6, rh = h / rows;
    const cols = ['#8a2a2a', '#2a4a8a', '#2a7a4a', '#8a6a1a', '#5a2a7a', '#7a3a1a', '#1a5a6a', '#a04a6a', '#4a4a5a', '#b08a3a'];
    for (let row = 0; row < rows; row++) {
      let x = 4;
      while (x < w - 8) {
        const bw = 14 + r() * 22, bh = rh * (0.62 + r() * 0.3), c = cols[Math.floor(r() * cols.length)];
        g.fillStyle = c; g.fillRect(x, row * rh + rh - 12 - bh, bw, bh);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + bw - 4, row * rh + rh - 12 - bh, 4, bh);
        g.fillStyle = 'rgba(255,230,150,.55)'; g.fillRect(x + 3, row * rh + rh - 12 - bh + 8, bw - 8, 3); g.fillRect(x + 3, row * rh + rh - 12 - bh + bh * 0.6, bw - 8, 2);
        if (r() < 0.12) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, row * rh + rh - 12 - bh, bw, 4); }
        x += bw + 1 + (r() < 0.12 ? 10 : 0);
      }
      g.fillStyle = '#4a2a14'; g.fillRect(0, row * rh + rh - 12, w, 12); g.fillStyle = '#6a3e1e'; g.fillRect(0, row * rh + rh - 12, w, 3);
    }
  });
}
function windowTex(moon) {
  return canvasTex(256, 512, (g, w, h) => {
    const r = mulberry32(moon ? 5 : 9);
    g.fillStyle = '#3a3050'; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.moveTo(14, h); g.lineTo(14, 120); g.arc(w / 2, 120, w / 2 - 14, Math.PI, 0); g.lineTo(w - 14, h); g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a1038'); gr.addColorStop(0.6, '#2a3a8a'); gr.addColorStop(1, '#5a74c8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.beginPath(); g.arc(r() * w, r() * h * 0.8, 0.8 + r() * 1.8, 0, TAU); g.fill(); }
    if (moon) { const mg = g.createRadialGradient(128, 130, 4, 128, 130, 70); mg.addColorStop(0, 'rgba(255,255,230,1)'); mg.addColorStop(0.3, 'rgba(255,255,220,.95)'); mg.addColorStop(1, 'rgba(255,255,220,0)'); g.fillStyle = mg; g.fillRect(0, 40, w, 200); g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(128, 130, 38, 0, TAU); g.fill(); g.fillStyle = 'rgba(180,170,140,.35)'; for (const [x, y, rr2] of [[116, 120, 9], [140, 142, 7], [130, 112, 5]]) { g.beginPath(); g.arc(x, y, rr2, 0, TAU); g.fill(); } }
    // silhouet van een dorp/kasteel
    g.fillStyle = '#0a1030'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, 400); g.lineTo(50, 400); g.lineTo(50, 360); g.lineTo(70, 340); g.lineTo(90, 360); g.lineTo(90, 395); g.lineTo(150, 395); g.lineTo(150, 330); g.lineTo(165, 330); g.lineTo(165, 300); g.lineTo(190, 280); g.lineTo(215, 300); g.lineTo(215, 400); g.lineTo(w, 400); g.lineTo(w, h); g.fill();
    g.fillStyle = '#ffd27a'; for (const [x, y] of [[170, 345], [60, 380], [118, 440]]) g.fillRect(x, y, 6, 8);
    g.restore();
    g.strokeStyle = '#2a2038'; g.lineWidth = 9; g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h); g.moveTo(14, 250); g.lineTo(w - 14, 250); g.moveTo(14, 380); g.lineTo(w - 14, 380); g.stroke();
    g.strokeStyle = '#6a5a7a'; g.lineWidth = 12; g.beginPath(); g.moveTo(14, h); g.lineTo(14, 120); g.arc(w / 2, 120, w / 2 - 14, Math.PI, 0); g.lineTo(w - 14, h); g.stroke();
  });
}
function pageTex(flip) {
  return canvasTex(512, 256, (g, w, h) => {
    const r = mulberry32(flip ? 11 : 22);
    const bg = g.createLinearGradient(0, 0, w, 0); bg.addColorStop(flip ? 0 : 1, '#efdcab'); bg.addColorStop(flip ? 1 : 0, '#e2c88a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(140,90,30,.08)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(r() * w, r() * h, 8 + r() * 26, 0, TAU); g.fill(); }
    // regels tekst (krabbels)
    g.strokeStyle = 'rgba(70,40,20,.28)'; g.lineWidth = 2;
    for (let y = 22; y < h - 10; y += 15) { let x = 22; while (x < w - 40) { const len = 14 + r() * 46; g.beginPath(); g.moveTo(x, y + Math.sin(x * 0.4) * 1.5); g.lineTo(x + len, y + Math.sin((x + len) * 0.4) * 1.5); g.stroke(); x += len + 8; } }
    // magische runen langs de rand
    g.strokeStyle = 'rgba(120,70,180,.4)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(120,70,180,.4)'; for (let i = 0; i < 26; i++) { const x = 20 + i * 18.5; g.fillRect(x, 10, 6, 5); g.fillRect(x + 2, h - 16, 4, 6); }
  });
}

export function buildLibrary(ctx, L) {
  const { scene, fx } = ctx;
  const ups = [];
  const Wd = { ups };
  const v3 = new THREE.Vector3();
  const flameT = flameTex(), glowT = glowTex();
  const flames = [];
  function addFlame(parent, x, y, z, size = 0.5) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.scale.set(size * 0.7, size, 1); sp.position.set(x, y, z); parent.add(sp);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.6 }));
    gl.scale.set(size * 3.4, size * 3.4, 1); gl.position.set(x, y + size * 0.1, z); parent.add(gl);
    const f = { sp, gl, size, ph: rand(0, 6), base: size }; flames.push(f); return f;
  }
  function candle(h = 0.9, r = 0.16, col = 0xf4ecd0) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 8), mat(col, { flatShading: false }), { pos: [0, h / 2, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 4), mat(0x2a1a10), { cast: false, pos: [0, h + 0.05, 0] }));
    const f = addFlame(g, 0, h + 0.28, 0, 0.5); g.userData.flame = f; return g;
  }

  // ---------------- vloer, muren, pilaren ----------------
  const floor = mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ map: tex.checker(40, 30, '#3a2b27', '#241a17'), roughness: 0.8 }), { cast: false, pos: [0, -5.5, -10], rot: [-Math.PI / 2, 0, 0] });
  scene.add(floor);
  const shelf = shelfTexture(); shelf.wrapS = shelf.wrapT = THREE.RepeatWrapping; shelf.repeat.set(10, 4.5);
  const wall = mesh(new THREE.PlaneGeometry(110, 40), new THREE.MeshStandardMaterial({ map: shelf, roughness: 0.9 }), { cast: false, pos: [0, 14.5, -16] });
  scene.add(wall);
  for (const sx of [-1, 1]) { const w2 = mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: shelf, roughness: 0.9 }), { cast: false, pos: [sx * 42, 14.5, -10], rot: [0, -sx * Math.PI / 2 * 0.98, 0] }); scene.add(w2); }
  // bogen met nachtelijke ramen
  [[-14, false], [0, true], [14, false]].forEach(([x, moon]) => {
    const wt = windowTex(moon);
    const w = mesh(new THREE.PlaneGeometry(6.4, 12.8), new THREE.MeshBasicMaterial({ map: wt, fog: false }), { cast: false, receive: false, pos: [x, 6.6, -15.85] });
    scene.add(w);
    scene.add(mesh(new THREE.BoxGeometry(7.4, 0.5, 0.7), mat(0x6a5a7a), { pos: [x, 0.35, -15.6] }));
    // lichtbundel
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 24), new THREE.MeshBasicMaterial({ map: canvasTex(32, 128, (g, ww, hh) => { const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(170,200,255,.5)'); gr.addColorStop(1, 'rgba(170,200,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, ww, hh); }), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    shaft.position.set(x + 2.5, 0.5, -9.5); shaft.rotation.set(-0.38, 0, 0.0); shaft.userData.dyn = true; scene.add(shaft);
    ups.push((t) => { shaft.material.opacity = 0.17 + Math.sin(t * 0.6 + x) * 0.04; });
  });
  for (const x of [-7, 7, -22, 22]) {
    const col = mesh(new THREE.CylinderGeometry(1.1, 1.3, 40, 12), new THREE.MeshStandardMaterial({ map: tex.stone(1, 6), roughness: 0.95, flatShading: true }), { pos: [x, 14.5, -15.2] });
    scene.add(col); scene.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.9, 12), mat(0x7a7a84), { pos: [x, -5.1, -15.2] }));
  }

  // ---------------- tafel ----------------
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(6, 3, '#6a3e20'), roughness: 0.75 });
  scene.add(mesh(new THREE.BoxGeometry(22.4, 0.8, 15.6), wood, { pos: [0, -0.4, 0], cast: false }));
  const gold = mat(0xe0a820, { metalness: 0.75, roughness: 0.35, flatShading: false });
  scene.add(mesh(new THREE.BoxGeometry(22.8, 0.16, 0.2), gold, { cast: false, pos: [0, -0.02, 7.85] }), mesh(new THREE.BoxGeometry(22.8, 0.16, 0.2), gold, { cast: false, pos: [0, -0.02, -7.85] }));
  scene.add(mesh(new THREE.BoxGeometry(0.2, 0.16, 15.6), gold, { cast: false, pos: [11.3, -0.02, 0] }), mesh(new THREE.BoxGeometry(0.2, 0.16, 15.6), gold, { cast: false, pos: [-11.3, -0.02, 0] }));
  scene.add(mesh(new THREE.BoxGeometry(21.2, 1.0, 14.4), wood, { pos: [0, -1.3, 0], cast: false }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 9.8, 0, sz * 6.2);
    lg.add(mesh(new THREE.CylinderGeometry(0.8, 0.55, 4.6, 10), wood, { pos: [0, -3.1, 0] }));
    lg.add(mesh(new THREE.SphereGeometry(0.95, 10, 8), gold, { pos: [0, -1.7, 0] }));
    lg.add(mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.5, 10), gold, { pos: [0, -5.25, 0] }));
    scene.add(lg);
  }
  // fluwelen kleed onder het boek
  const cloth = mesh(new THREE.PlaneGeometry(14.4, 13.6), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6a1626'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e0a820'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40); g.fillStyle = 'rgba(224,168,32,.35)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(30 + (i * 53) % (w - 60), 30 + (i * 91) % (h - 60), 2, 0, TAU); g.fill(); } }), roughness: 1 }), { cast: false, pos: [0, 0.012, 0], rot: [-Math.PI / 2, 0, 0] });
  scene.add(cloth);

  // ---------------- het toverboek ----------------
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2412, roughness: 0.6, metalness: 0.1 });
  scene.add(mesh(new THREE.BoxGeometry(12.0, 0.2, 12.0), leather, { pos: [0, 0.12, 0] }));
  const gold2 = mat(0xf2c230, { metalness: 0.8, roughness: 0.3, flatShading: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.9, 0.24, 0.9), gold2, { pos: [sx * 5.7, 0.14, sz * 5.7], cast: false }));
  const pages = new THREE.MeshStandardMaterial({ color: 0xe8d4a0, roughness: 0.9 });
  for (const sz of [-1, 1]) {
    scene.add(mesh(new THREE.BoxGeometry(11.2, 0.22, 5.5), pages, { pos: [0, 0.3, sz * 2.95] }));
    scene.add(mesh(new THREE.PlaneGeometry(11.0, 5.4), new THREE.MeshStandardMaterial({ map: pageTex(sz < 0), roughness: 0.9 }), { cast: false, pos: [0, BOOK_TOP - 0.004, sz * 2.95], rot: [-Math.PI / 2, 0, 0] }));
  }
  scene.add(mesh(new THREE.BoxGeometry(11.2, 0.17, 0.5), mat(0x3a1c0c), { cast: false, pos: [0, 0.3, 0] }));
  scene.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 3.0), mat(0xc42a3a), { cast: false, pos: [-1.4, 0.43, 5.0], rot: [0, 0.1, 0] }));      // lintje
  // leesstandaard-sfeer: gloeiende runenring om het raster
  const runeRing = new THREE.Mesh(new THREE.RingGeometry(6.3, 6.5, 64), new THREE.MeshBasicMaterial({ color: 0xb08aff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  runeRing.rotation.x = -Math.PI / 2; runeRing.position.y = BOOK_TOP + 0.01; runeRing.scale.set(1.0, 0.98, 1); runeRing.userData.dyn = true; scene.add(runeRing);
  ups.push((t) => { runeRing.material.opacity = 0.22 + Math.sin(t * 1.5) * 0.1; runeRing.rotation.z = t * 0.05; });

  // ---------------- decor op de tafel ----------------
  for (const [x, z, s] of [[-9.6, -5.6, 1], [9.6, -5.6, 1]]) {   // kandelaars
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 10), gold, { pos: [0, 0.15, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 8), gold, { pos: [0, 1.3, 0] }));
    for (const ax of [-1, 0, 1]) {
      const arm = mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 10, Math.PI), gold, { pos: [ax * 0.55, 1.9, 0], rot: [0, 0, 0] }); if (ax !== 0) g.add(arm);
      const c = candle(ax === 0 ? 1.0 : 0.8, 0.14); c.position.set(ax * 1.1, ax === 0 ? 2.3 : 2.1, 0); c.userData.dyn = true; g.add(c);
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.12, 8), gold, { cast: false, pos: [ax * 1.1, ax === 0 ? 2.3 : 2.1, 0] }));
    }
  }
  { // stapel boeken
    const sb = new THREE.Group(); sb.position.set(-9.7, 0, 5.2); scene.add(sb);
    [[0x8a2a2a, 2.0, 0.5, 1.5, 0.1], [0x2a4a8a, 1.8, 0.45, 1.4, -0.2], [0x2a7a4a, 1.6, 0.4, 1.2, 0.25]].forEach(([c, w, h, d, ry], i) => { const b = mesh(new THREE.BoxGeometry(w, h, d), mat(c), { pos: [0, 0.25 + i * 0.47, 0], rot: [0, ry, 0] }); sb.add(b); sb.add(mesh(new THREE.BoxGeometry(w * 0.98, h * 0.6, d * 0.98), mat(0xf0e0b0), { cast: false, pos: [0.04, 0.25 + i * 0.47, 0.02], rot: [0, ry, 0] })); });
  }
  { // inktpot met ganzenveer
    const ik = new THREE.Group(); ik.position.set(9.6, 0, 5.4); scene.add(ik);
    ik.add(mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a3a, roughness: 0.2, metalness: 0.4 }), { pos: [0, 0.3, 0] }));
    ik.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4), mat(0xf4f0e0), { pos: [0.5, 1.6, 0.2], rot: [0.0, 0, -0.35] }));
    ik.add(mesh(new THREE.PlaneGeometry(0.5, 1.8), new THREE.MeshStandardMaterial({ color: 0xfff8e8, side: THREE.DoubleSide }), { pos: [0.85, 2.0, 0.2], rot: [0, 0.4, -0.35] }));
  }

  // ---------------- zwevende kaarsen ----------------
  const floaters = [];
  for (let i = 0; i < 7; i++) {
    const c = candle(0.9 + rand(0, 0.5), 0.17); c.userData.dyn = true;
    const x = -16 + i * 5.3 + rand(-1, 1), y = 2.4 + rand(0, 3.2), z = -9 - rand(0, 4);
    c.position.set(x, y, z); scene.add(c); floaters.push({ c, x, y, z, ph: rand(0, 6) });
  }
  ups.push((t) => { for (const f of floaters) { f.c.position.y = f.y + Math.sin(t * 0.9 + f.ph) * 0.35; f.c.position.x = f.x + Math.sin(t * 0.4 + f.ph * 2) * 0.3; } });
  // een paar gloeiende lampen als echt licht
  const candleLights = [];
  for (const x of [-9.6, 9.6]) { const pl = new THREE.PointLight(0xffa850, 1.4, 22, 1.4); pl.position.set(x, 3.4, -5.4); scene.add(pl); candleLights.push(pl); }
  ups.push((t) => { candleLights.forEach((l, i) => { l.intensity = (Wd.dim ? 0.5 : 1.35) + Math.sin(t * 9 + i * 3) * 0.12 + Math.sin(t * 5.3 + i) * 0.1; }); });

  // ---------------- zwevende boeken ----------------
  const fbooks = [];
  [[-12, 6, -6, 0x8a2a2a], [11.5, 7.5, -7, 0x2a4a8a], [-6.5, 8.5, -10, 0x2a7a4a], [6, 9.5, -11, 0x7a3a8a], [0, 11, -12, 0xb07a1a]].forEach(([x, y, z, c], i) => {
    const g = new THREE.Group(); g.userData.dyn = true;
    const covL = new THREE.Group(), covR = new THREE.Group(); g.add(covL, covR);
    covL.add(mesh(new THREE.BoxGeometry(1.0, 0.08, 1.4), mat(c), { pos: [-0.5, 0, 0] })); covR.add(mesh(new THREE.BoxGeometry(1.0, 0.08, 1.4), mat(c), { pos: [0.5, 0, 0] }));
    covL.add(mesh(new THREE.BoxGeometry(0.92, 0.05, 1.3), mat(0xefe0b8), { cast: false, pos: [-0.5, 0.06, 0] })); covR.add(mesh(new THREE.BoxGeometry(0.92, 0.05, 1.3), mat(0xefe0b8), { cast: false, pos: [0.5, 0.06, 0] }));
    g.position.set(x, y, z); scene.add(g); fbooks.push({ g, covL, covR, x, y, z, ph: i * 1.3 });
  });
  ups.push((t) => { for (const b of fbooks) { const f = Math.sin(t * 3 + b.ph) * 0.5 + 0.55; b.covL.rotation.z = f * 0.6; b.covR.rotation.z = -f * 0.6; b.g.position.y = b.y + Math.sin(t * 0.7 + b.ph) * 0.5; b.g.position.x = b.x + Math.sin(t * 0.3 + b.ph) * 1.2; b.g.rotation.y = Math.sin(t * 0.4 + b.ph) * 0.6; } });

  // ---------------- uil ----------------
  const owl = new THREE.Group(); owl.userData.dyn = true; owl.position.set(15.5, 1.5, -11); scene.add(owl);
  scene.add(mesh(new THREE.CylinderGeometry(0.18, 0.2, 4.4, 6), mat(0x5a3a1c), { pos: [15.5, 0.6, -11], rot: [0, 0, 1.45] }));
  { const bm = mat(0x7a5a3a, { flatShading: false }), bel = mat(0xe8d4a8, { flatShading: false });
    owl.add(mesh(new THREE.SphereGeometry(0.85, 12, 10), bm, { pos: [0, 0.95, 0], scale: [1, 1.15, 0.9] }));
    owl.add(mesh(new THREE.SphereGeometry(0.62, 10, 8), bel, { pos: [0, 0.85, 0.35], scale: [1, 1.2, 0.6] }));
    const head = new THREE.Group(); head.position.set(0, 2.05, 0.05); owl.add(head); owl.userData.head = head;
    head.add(mesh(new THREE.SphereGeometry(0.62, 12, 10), bm, { scale: [1.15, 0.95, 0.95] }));
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.CircleGeometry(0.3, 12), bel, { cast: false, pos: [s * 0.3, 0.05, 0.56], rot: [0, s * 0.25, 0] }));
      head.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23a }), { cast: false, pos: [s * 0.3, 0.05, 0.6] }));
      const pu = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [s * 0.3, 0.05, 0.76] }); head.add(pu);
      head.add(mesh(new THREE.ConeGeometry(0.14, 0.45, 4), bm, { pos: [s * 0.5, 0.62, 0], rot: [0, 0, -s * 0.35] }));
    }
    head.add(mesh(new THREE.ConeGeometry(0.1, 0.26, 4), mat(0xe8a020), { cast: false, pos: [0, -0.12, 0.7], rot: [Math.PI / 2 + 0.3, 0, 0] }));
    owl.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 0.7), mat(0x5a4028), { cast: false, pos: [0, 0.1, -0.2] })); }
  ups.push((t) => { const hd = owl.userData.head; hd.rotation.y = damp(hd.rotation.y, Wd.owlTarget || 0, 4, 0.016) + Math.sin(t * 0.5) * 0.002; if (Math.sin(t * 0.8) > 0.97) hd.rotation.z = 0.3; else hd.rotation.z = damp(hd.rotation.z, 0, 6, 0.016); });
  Wd.owlLook = (dir) => { Wd.owlTarget = dir * 0.9; };

  // ---------------- poltergeist ----------------
  const ghost = new THREE.Group(); ghost.visible = false; ghost.userData.dyn = true; scene.add(ghost);
  { const gm = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, emissive: 0x8a98ff, emissiveIntensity: 0.55, transparent: true, opacity: 0.88, roughness: 0.5 });
    const pts = []; for (let i = 0; i <= 14; i++) { const k = i / 14; pts.push(new THREE.Vector2(0.15 + Math.sin(k * Math.PI * 0.95) * 1.3 * (0.35 + 0.65 * Math.min(1, k * 1.6)), k * 3.0)); }
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), gm); body.scale.y = 1; ghost.add(body);
    ghost.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10, 0, TAU, 0, Math.PI / 2), gm)); ghost.children[1].position.y = 3.0;
    for (const s of [-1, 1]) { ghost.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111122 }), { cast: false, pos: [s * 0.36, 2.55, 0.92], scale: [1, 1.5, 0.6] })); const arm = mesh(new THREE.SphereGeometry(0.3, 8, 6), gm, { cast: false, pos: [s * 1.35, 1.7, 0.2], scale: [1.4, 0.8, 0.8] }); ghost.add(arm); ghost.userData['arm' + s] = arm; }
    ghost.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111122 }), { cast: false, pos: [0, 2.0, 1.0], scale: [1, 1.4, 0.5] }));
    ghost.scale.setScalar(1.25); }
  let gT = -1, gDur = 2.4;
  Wd.ghostStart = (dur = 2.4) => { gT = 0; gDur = dur; ghost.visible = true; };
  Wd.ghostActive = () => gT >= 0;
  ups.push((t, dt) => {
    if (gT < 0) return;
    gT += dt; const u = gT / gDur;
    if (u >= 1) { gT = -1; ghost.visible = false; return; }
    const x = lerp(-15, 15, u) + Math.sin(u * 14) * 2.2, z = Math.sin(u * 9 + 1) * 3.4 + 0.5, y = 3.4 + Math.sin(u * 20) * 0.7 + Math.sin(u * Math.PI) * 1.8;
    ghost.position.set(x, y, z); ghost.rotation.y = Math.PI / 2 * (u < 0.5 ? 1 : -1) * 0.2 + Math.sin(u * 14) * 0.4; ghost.rotation.z = Math.cos(u * 14) * 0.25;
    const sc = Math.min(1, u * 8, (1 - u) * 8); ghost.scale.setScalar(1.25 * Math.max(0.01, sc));
    ghost.userData['arm1'].position.y = 1.7 + Math.sin(gT * 12) * 0.4; ghost.userData['arm-1'].position.y = 1.7 + Math.cos(gT * 12) * 0.4;
    if (Math.random() < 0.7) fx.particles.emit(x + rand(-1, 1), y + rand(0, 2.5), z + rand(-1, 1), rand(-0.5, 0.5), rand(-0.3, 0.8), rand(-0.5, 0.5), { life: 0.9, size: 0.45, color: pick([0xcfd8ff, 0xffffff, 0xb0a0ff]), gravity: -0.4 });
  });
  Wd.ghostPos = () => ghost.position;

  // ---------------- stofdeeltjes in de lichtbundels ----------------
  ups.push((t, dt) => { if (Math.random() < dt * 6) fx.particles.emit(rand(-14, 14), rand(0.5, 7), rand(-12, -4), rand(-0.1, 0.1), rand(-0.05, 0.15), 0, { life: 4, size: 0.2, color: 0xfff0c0, gravity: 0, shrink: false }); });

  // ---------------- vlammen laten flikkeren ----------------
  ups.push((t) => { for (const f of flames) { const k = 1 + Math.sin(t * 13 + f.ph) * 0.1 + Math.sin(t * 7.7 + f.ph * 2) * 0.08; f.sp.scale.set(f.base * 0.7 * k, f.base * (Wd.dim ? 0.55 : 1) * (1.05 - (k - 1)), 1); f.gl.material.opacity = (Wd.dim ? 0.25 : 0.6) * (0.85 + (k - 1) * 2); } });

  Wd.mergedCount = mergeStatic(scene);
  Wd.update = (t, dt) => { for (const f of ups) f(t, dt); };
  return Wd;
}

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, TAU, canvasTex, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC, makeBrother } from '../engine/chars.js';
import { TILE, W, H, OX, OZ, tx, tz, isSolidC, rayDist } from './heist_map.js';

// Visuele bouwstenen voor "Schatkamer-Overval": kasteelvloer (één canvas-tekening), instanced muren, kisten, wachters, kegels.

export const WALL_H = 1.9;

// ---------------- kleine hulpjes ----------------
const glowTex = () => glowTex.t || (glowTex.t = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
export function glowDisc(color, size, opacity = 0.5, y = 0.06) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}
export function textSprite(text, color = '#fff', w = 3.4, outline = 'rgba(15,8,25,.92)') {
  const t = canvasTex(256, 96, (g, W_, H_) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 11; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(text, W_ / 2, H_ / 2, W_ - 12); g.fillStyle = color; g.fillText(text, W_ / 2, H_ / 2, W_ - 12); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(w, w * 96 / 256, 1); s.renderOrder = 14; return s;
}
// sprite waarvan de tekst later te wijzigen is
export function liveSprite(w = 3.4) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
  const tx_ = new THREE.CanvasTexture(cv); tx_.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx_, transparent: true, depthTest: false })); s.scale.set(w, w * 96 / 256, 1); s.renderOrder = 14;
  s.userData.set = (name, col, amount) => {
    g.clearRect(0, 0, 256, 96); g.font = 'bold 48px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(15,8,25,.92)';
    const t = amount > 0 ? `${name} ${amount}` : name; g.strokeText(t, 128, 48, 240); g.fillStyle = amount > 0 ? '#ffe14a' : col; g.fillText(t, 128, 48, 240); tx_.needsUpdate = true;
  };
  return s;
}

// ---------------- vloer ----------------
function floorTexture(M) {
  const PX = 80; const w = W * PX, h = H * PX;
  return canvasTex(w, h, (g) => {
    const r = mulberry32(77);
    g.fillStyle = '#25232e'; g.fillRect(0, 0, w, h);
    const zone = (c, rr) => (c >= 9 && c <= 15 ? (rr <= 3 ? 'lair' : rr <= 7 ? 'vault' : 'gallery') : (c <= 4 ? 'hatchL' : c >= 20 ? 'hatchR' : 'room'));
    for (let rr = 0; rr < H; rr++) for (let c = 0; c < W; c++) {
      if (M.ch[rr][c] === '#') continue;
      const z = zone(c, rr), x0 = c * PX, y0 = rr * PX, hatchRoom = (c >= 1 && c <= 3 && rr >= 5 && rr <= 7) ? 'hatchL' : (c >= 21 && c <= 23 && rr >= 5 && rr <= 7) ? 'hatchR' : null;
      const pal = hatchRoom === 'hatchL' ? ['#3d6a52', '#37604a'] : hatchRoom === 'hatchR' ? ['#3a558a', '#34508a'] : z === 'lair' ? ['#6a403a', '#5e3832'] : z === 'vault' ? ['#702f60', '#64295a'] : z === 'gallery' ? ['#35596a', '#305366'] : ['#58566c', '#4e4c62'];
      g.fillStyle = pal[(c + rr) % 2]; g.fillRect(x0, y0, PX, PX);
      // stenen/tegelrandjes en vlekjes
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, PX - 2, PX - 2);
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.strokeRect(x0 + 4, y0 + 4, PX - 8, PX - 8);
      for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`; g.beginPath(); g.ellipse(x0 + r() * PX, y0 + r() * PX, 3 + r() * 10, 2 + r() * 6, r() * 3, 0, TAU); g.fill(); }
      if (z === 'vault') { g.strokeStyle = 'rgba(230,190,70,.35)'; g.lineWidth = 3; g.strokeRect(x0 + 8, y0 + 8, PX - 16, PX - 16); }
    }
    // schatten rond de muren (donkerder langs de randen)
    for (let rr = 0; rr < H; rr++) for (let c = 0; c < W; c++) {
      if (M.ch[rr][c] === '#') continue;
      const x0 = c * PX, y0 = rr * PX;
      const sh = (cond, gx0, gy0, gx1, gy1, rx, ry, rw, rh) => { if (!cond) return; const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
      sh(M.ch[rr - 1] && M.ch[rr - 1][c] === '#', x0, y0, x0, y0 + 24, x0, y0, PX, 24);
      sh(M.ch[rr][c - 1] === '#', x0, y0, x0 + 20, y0, x0, y0, 20, PX);
      sh(M.ch[rr][c + 1] === '#', x0 + PX, y0, x0 + PX - 20, y0, x0 + PX - 20, y0, 20, PX);
    }
    // gouden pad naar de kroon
    g.fillStyle = 'rgba(230,190,70,.14)'; g.fillRect(9 * PX, 6 * PX + 10, 7 * PX, PX - 20);
    // kistmarkeringen en luiken
    for (const ch of M.chests) { const x = (ch.c + 0.5) * PX, y = (ch.r + 0.5) * PX; const gr = g.createRadialGradient(x, y, 4, x, y, PX * 0.7); gr.addColorStop(0, ch.kind === 'K' ? 'rgba(255,230,120,.5)' : 'rgba(255,200,80,.28)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, PX * 0.7, 0, TAU); g.fill(); }
    for (const hh of M.hatches) {
      const x = (hh.c + 0.5) * PX, y = (hh.r + 0.5) * PX, col = hh.side ? '90,150,255' : '90,230,140';
      g.fillStyle = `rgba(${col},.22)`; g.beginPath(); g.arc(x, y, PX * 1.15, 0, TAU); g.fill();
      g.strokeStyle = `rgba(${col},.85)`; g.lineWidth = 6; g.setLineDash([14, 10]); g.beginPath(); g.arc(x, y, PX * 1.1, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    // fakkelgloed (ingebakken)
    g.globalCompositeOperation = 'lighter';
    for (const [c, rr] of torchSpots(M)) { const x = (c + 0.5) * PX, y = (rr + 0.9) * PX; const gr = g.createRadialGradient(x, y, 2, x, y, PX * 2.6); gr.addColorStop(0, 'rgba(255,170,70,.30)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, PX * 2.6, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  });
}
// plekken (tegel waarvan de noordmuur een fakkel krijgt)
export function torchSpots(M) {
  const out = [];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) { const c = 4 * j + 2, r = 4 * i; if (M.ch[r][c] === '#') out.push([c, r]); }
  return out;
}

// ---------------- het hele kasteel ----------------
export function buildCastleScene(ctx, M, L) {
  const scene = ctx.scene; const root = new THREE.Group(); scene.add(root);
  const FW = W * TILE, FH = H * TILE;
  // vloer
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(M), roughness: 0.95 });
  const fl = mesh(new THREE.PlaneGeometry(FW, FH), floorMat, { cast: false, rot: [-Math.PI / 2, 0, 0] }); root.add(fl);
  // buitenvloer (donker, voorbij de muren)
  root.add(mesh(new THREE.PlaneGeometry(FW + 80, FH + 60), mat(0x120e1a, { flatShading: false }), { cast: false, receive: false, pos: [0, -0.05, 0], rot: [-Math.PI / 2, 0, 0] }));
  // rode alarm-waas
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  wash.rotation.x = -Math.PI / 2; wash.position.y = 0.09; root.add(wash);
  // muren (instanced, alleen zichtbare)
  const walls = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (M.ch[r][c] !== '#') continue;
    let vis = false; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const ch = M.ch[r + dr] && M.ch[r + dr][c + dc]; if (ch && ch !== '#') vis = true; }
    if (vis) walls.push([c, r]);
  }
  const side = new THREE.MeshStandardMaterial({ map: tex.bricks(1, 1.3), color: 0xd8d0e0, roughness: 0.95, flatShading: true });
  const top = new THREE.MeshStandardMaterial({ color: 0xc4bcd4, roughness: 0.9, flatShading: true });
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), [side, side, top, side, side, side], walls.length);
  const m4 = new THREE.Matrix4();
  walls.forEach(([c, r], k) => { m4.makeTranslation(tx(c), WALL_H / 2, tz(r)); wm.setMatrixAt(k, m4); });
  wm.castShadow = true; wm.receiveShadow = true; wm.frustumCulled = false; root.add(wm);
  // kantelen op de buitenmuur
  const merlons = []; for (const [c, r] of walls) if (c === 0 || r === 0 || c === W - 1 || r === H - 1) merlons.push([c, r]);
  const mm = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.5, 0.5, TILE * 0.5), top, merlons.length * 2);
  merlons.forEach(([c, r], k) => { for (let s = 0; s < 2; s++) { const ox = (c === 0 || c === W - 1) ? 0 : (s ? 0.5 : -0.5) * TILE; const oz = (c === 0 || c === W - 1) ? (s ? 0.5 : -0.5) * TILE : 0; m4.makeTranslation(tx(c) + ox, WALL_H + 0.25, tz(r) + oz); mm.setMatrixAt(k * 2 + s, m4); } });
  mm.frustumCulled = false; mm.castShadow = true; root.add(mm);
  // pilaren
  const pil = new THREE.InstancedMesh(new THREE.CylinderGeometry(TILE * 0.42, TILE * 0.46, WALL_H, 12), new THREE.MeshStandardMaterial({ color: 0xb8b0c4, roughness: 0.8, flatShading: false }), M.pillars.length);
  M.pillars.forEach(([c, r], k) => { m4.makeTranslation(tx(c), WALL_H / 2, tz(r)); pil.setMatrixAt(k, m4); });
  pil.castShadow = true; pil.receiveShadow = true; pil.frustumCulled = false; root.add(pil);
  const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(TILE * 0.52, TILE * 0.52, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 0.4, roughness: 0.5 }), M.pillars.length);
  M.pillars.forEach(([c, r], k) => { m4.makeTranslation(tx(c), WALL_H + 0.1, tz(r)); cap.setMatrixAt(k, m4); }); cap.frustumCulled = false; root.add(cap);
  // fakkels (instanced vlammen + beugels)
  const spots = torchSpots(M);
  const bracket = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), mat(0x3a2a1e), spots.length);
  const flame = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xffb040 }), spots.length);
  spots.forEach(([c, r], k) => { m4.makeTranslation(tx(c), 1.35, tz(r) + TILE / 2 + 0.12); bracket.setMatrixAt(k, m4); });
  bracket.frustumCulled = flame.frustumCulled = false; root.add(bracket, flame);
  const tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const updTorches = (t) => spots.forEach(([c, r], k) => { const f = 0.85 + Math.sin(t * 11 + k * 1.7) * 0.15 + Math.sin(t * 23 + k) * 0.08; tmpP.set(tx(c), 1.85, tz(r) + TILE / 2 + 0.12); tmpS.set(f, f * 1.15, f); m4.compose(tmpP, tmpQ, tmpS); flame.setMatrixAt(k, m4); flame.instanceMatrix.needsUpdate = true; });
  // luiken
  const hatches = M.hatches.map((hh) => {
    const col = hh.side ? 0x5a96ff : 0x5ae68c; const g = new THREE.Group(); g.position.set(tx(hh.c), 0, tz(hh.r));
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 20), mat(0x3a2a1e), { cast: false, pos: [0, 0.06, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.14, 20), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.4 }), { cast: false, pos: [0, 0.08, 0] }));
    for (const a of [0, 1]) g.add(mesh(new THREE.BoxGeometry(1.4, 0.05, 0.12), mat(0x222222), { cast: false, pos: [0, 0.16, 0], rot: [0, a * Math.PI / 2 + 0.78, 0] }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 3.2, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.y = 1.6; g.add(beam);
    const hole = glowDisc(col, 4.2, 0.4, 0.1); g.add(hole);
    root.add(g); return { g, beam, hole, col };
  });
  // goudhoop van de draak
  const hoard = new THREE.Group(); hoard.position.set(tx(M.dragon.c), 0, tz(M.dragon.r));
  const gm = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xaa6a00, emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.35, flatShading: true });
  hoard.add(mesh(new THREE.ConeGeometry(2.3, 1.1, 9), gm, { pos: [0, 0.5, 0], cast: false }));
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; hoard.add(mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: [0xff4a6a, 0x4ae0ff, 0x8aff6a][k % 3], emissive: [0xff4a6a, 0x4ae0ff, 0x8aff6a][k % 3], emissiveIntensity: 0.6 }), { cast: false, pos: [Math.cos(a) * 1.5, 0.35 + (k % 2) * 0.3, Math.sin(a) * 1.5] })); }
  root.add(hoard);
  // lasers
  const lasers = M.lasers.map((lz) => {
    const g = new THREE.Group(); g.position.set(tx(lz.c), 0, tz(lz.r)); if (!lz.horiz) g.rotation.y = Math.PI / 2;   // straal loopt altijd langs +z (lokaal)
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, TILE), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); beam.position.y = 0.75; g.add(beam);
    const beam2 = beam.clone(); beam2.position.y = 1.35; g.add(beam2);
    const halo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, TILE), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })); halo.position.y = 1.05; g.add(halo);
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.34, 1.9, 0.24), mat(0x2a2a34), { cast: false, pos: [0, 0.95, s * (TILE / 2 + 0.1)] }), mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff4444 }), { cast: false, pos: [0, 1.05, s * (TILE / 2 - 0.05)] }));
    root.add(g); return { g, beam, beam2, halo };
  });
  return { root, wash, hatches, lasers, updTorches, floorMat, wallsMesh: wm, hoard };
}

// ---------------- kisten ----------------
const CHEST_COL = { c: [0x8a5a2b, 0xd8b04a], C: [0x6a3a1e, 0xffd23a], G: [0x7a1e2a, 0xffd23a], M: [0x4a2a7a, 0xffe14a] };
export function makeChest(kind) {
  const g = new THREE.Group();
  if (kind === 'K') {   // kroon op zuiltje
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.9, 10), mat(0xb8b0c4, { flatShading: false }), { pos: [0, 0.45, 0] }));
    const crown = new THREE.Group(); crown.position.y = 1.15; g.add(crown);
    const gm = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffaa00, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 });
    crown.add(mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.34, 10, 1, true), Object.assign(gm.clone(), { side: THREE.DoubleSide }), { cast: false }));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; crown.add(mesh(new THREE.ConeGeometry(0.11, 0.38, 4), gm, { cast: false, pos: [Math.cos(a) * 0.47, 0.34, Math.sin(a) * 0.47] })); crown.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshStandardMaterial({ color: [0xff3a5a, 0x3ab0ff, 0x6aff6a][k % 3], emissive: [0xff3a5a, 0x3ab0ff, 0x6aff6a][k % 3], emissiveIntensity: 0.8 }), { cast: false, pos: [Math.cos(a) * 0.5, 0.58, Math.sin(a) * 0.5] })); }
    g.userData.crown = crown; g.userData.glow = glowDisc(0xffe070, 4.2, 0.6, 0.08); g.add(g.userData.glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 4, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.y = 2.4; g.add(beam); g.userData.beam = beam;
    return g;
  }
  const [wc, gc] = CHEST_COL[kind]; const s = kind === 'c' ? 0.95 : kind === 'C' ? 1.15 : 1.3;
  const body = mesh(new THREE.BoxGeometry(1.1 * s, 0.6 * s, 0.8 * s), mat(wc), { pos: [0, 0.3 * s, 0] }); g.add(body);
  const lid = new THREE.Group(); lid.position.set(0, 0.6 * s, -0.4 * s); g.add(lid);
  lid.add(mesh(new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 1.1 * s, 8, 1, false, 0, Math.PI), mat(wc), { pos: [0, 0, 0.4 * s], rot: [0, 0, Math.PI / 2] }));
  const gold = new THREE.MeshStandardMaterial({ color: gc, metalness: 0.7, roughness: 0.35, emissive: gc, emissiveIntensity: 0.15 });
  g.add(mesh(new THREE.BoxGeometry(1.14 * s, 0.12 * s, 0.84 * s), gold, { cast: false, pos: [0, 0.38 * s, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.16 * s, 0.2 * s, 0.06), gold, { cast: false, pos: [0, 0.52 * s, 0.41 * s] }));
  // gloeiende munten erin (zichtbaar als open)
  const hoard = mesh(new THREE.BoxGeometry(0.95 * s, 0.1, 0.65 * s), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa800, emissiveIntensity: 0.9 }), { cast: false, pos: [0, 0.58 * s, 0] }); g.add(hoard);
  g.userData.lid = lid; g.userData.hoard = hoard; g.userData.glow = glowDisc(kind === 'M' ? 0xc08aff : 0xffd070, kind === 'c' ? 2.6 : 3.4, 0.45, 0.07); g.add(g.userData.glow);
  return g;
}
export function makePile() {
  const g = new THREE.Group(); const gm = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xaa6a00, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.35, flatShading: true });
  g.add(mesh(new THREE.ConeGeometry(0.7, 0.55, 8), gm, { pos: [0, 0.27, 0], cast: false }));
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.5; g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8), gm, { pos: [Math.cos(a) * 0.62, 0.04 + (k % 2) * 0.03, Math.sin(a) * 0.62], cast: false })); }
  g.userData.glow = glowDisc(0xffe070, 2.8, 0.55, 0.07); g.add(g.userData.glow);
  const lbl = liveSprite(2.6); lbl.position.y = 1.6; g.add(lbl); g.userData.lbl = lbl;
  return g;
}

// ---------------- wezens ----------------
export function makeKnight(kind) {
  const c = kind === 'captain' ? makeNPC('captain', { scale: 1.0, hatColor: 0xcc2222, cape: 0xaa1122 }) : makeNPC('guard', { scale: 0.95 });
  const lantern = new THREE.Group();
  lantern.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }), { cast: false }), mesh(new THREE.BoxGeometry(0.2, 0.04, 0.2), mat(0x222222), { cast: false, pos: [0, 0.12, 0] }));
  c.hold(lantern, 'l'); lantern.position.y = -0.05;
  const spear = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), mat(0x6a4a2a), { cast: false, pos: [0, 0.1, 0] }); const tip = mesh(new THREE.ConeGeometry(0.07, 0.25, 5), mat(0xcfd4dc, { metalness: 0.7 }), { cast: false, pos: [0, 1.15, 0] }); spear.add(tip); spear.rotation.x = 0; c.hold(spear, 'r');
  return c;
}
export function makeDog() {
  const g = new THREE.Group(); const body = mat(0x8a6a48, { flatShading: false }), dark = mat(0x5a4028, { flatShading: false });
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.5, 1.15), body, { pos: [0, 0.62, 0] }));
  const head = new THREE.Group(); head.position.set(0, 0.85, 0.7); g.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), body), mesh(new THREE.BoxGeometry(0.26, 0.2, 0.3), dark, { pos: [0, -0.08, 0.3] }), mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), dark, { pos: [0.2, 0.22, -0.05], rot: [0, 0, -0.3] }), mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), dark, { pos: [-0.2, 0.22, -0.05], rot: [0, 0, 0.3] }));
  for (const sx of [1, -1]) head.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }), { cast: false, pos: [sx * 0.13, 0.08, 0.2] }));
  const tail = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), body, { pos: [0, 0.82, -0.75], rot: [0.7, 0, 0] }); g.add(tail);
  const legs = [[0.2, 0.45], [-0.2, 0.45], [0.2, -0.45], [-0.2, -0.45]].map(([x, z]) => { const l = mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), dark, { pos: [x, 0.21, z] }); g.add(l); return l; });
  g.userData = { head, tail, legs }; g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.7); return g;
}
export function makeDisguiseHat() {
  const h = new THREE.Group();
  h.add(mesh(new THREE.ConeGeometry(0.22, 0.6, 7), mat(0xd8357f), { cast: false, pos: [0, 0.3, 0] }), mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(0xffe14a), { cast: false, pos: [0, 0.64, 0] }), mesh(new THREE.TorusGeometry(0.2, 0.05, 5, 10), mat(0x2f6fe0), { cast: false, pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0] }));
  return h;
}
export function makeHatPickup() {
  const g = new THREE.Group(); const h = makeDisguiseHat(); h.scale.setScalar(2.4); h.position.y = 0.5; g.add(h); g.userData.hat = h;
  g.add(glowDisc(0xff80c0, 2.6, 0.55, 0.07)); return g;
}
export function makeBandit(i) {
  const c = makeBrother(i); const hr = 0.3 * c.s * (c.spec.headScale ?? 1);
  c.head.add(mesh(new THREE.BoxGeometry(hr * 1.9, 0.11 * c.s, 0.12 * c.s), new THREE.MeshBasicMaterial({ color: 0x0c0c12 }), { cast: false, pos: [0, 0.1 * c.s + 0.04, hr * 0.78] }));
  const sack = P.sack(1.0, 0xb89a60); sack.position.set(0, 0.25 * c.s, -0.42 * c.s); sack.visible = false; c.group.add(sack); c.sack = sack;
  const hat = makeDisguiseHat(); hat.position.y = hr * 0.95; hat.visible = false; c.head.add(hat); c.dhat = hat;
  return c;
}

// ---------------- zichtkegel ----------------
export function makeCone(N = 14) {
  const pos = new Float32Array((N + 2) * 3), col = new Float32Array((N + 2) * 4);
  const idx = []; for (let k = 0; k < N; k++) idx.push(0, k + 1, k + 2);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 3;
  const cone = { mesh: m, N, color: new THREE.Color(0xffe9a0), lastCol: -1, a0: 0.5 };
  cone.setColor = (hex, a0 = 0.5) => { if (cone.lastCol === hex && cone.a0 === a0) return; cone.lastCol = hex; cone.a0 = a0; cone.color.set(hex); for (let k = 0; k < N + 2; k++) { col[k * 4] = cone.color.r; col[k * 4 + 1] = cone.color.g; col[k * 4 + 2] = cone.color.b; col[k * 4 + 3] = k === 0 ? a0 : a0 * 0.25; } geo.attributes.color.needsUpdate = true; };
  cone.update = (M, x, z, yaw, range, half) => {
    const y = 0.14; pos[0] = x; pos[1] = y; pos[2] = z;
    for (let k = 0; k <= N; k++) { const a = yaw - half + (2 * half) * k / N; const dx = Math.sin(a), dz = Math.cos(a); const d = rayDist(M, x, z, dx, dz, range, 0.3); pos[(k + 1) * 3] = x + dx * d; pos[(k + 1) * 3 + 1] = y; pos[(k + 1) * 3 + 2] = z + dz * d; }
    geo.attributes.position.needsUpdate = true;
  };
  cone.setColor(0xffe9a0);
  return cone;
}

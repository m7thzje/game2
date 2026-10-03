import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, TAU, mulberry32 } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, PLAYER_CSS } from '../engine/chars.js';
import * as P from '../engine/props.js';

// Kristal-kluis: twee borden naast elkaar, een slot-kist in het midden, een slot-golem erachter, een brandende lont boven.
// Kristallen en pinnetjes zijn instanced (6 + 3 draw calls), het bord zelf is een handvol meshes.
export const NCOL = 6;
export const CRYS = [
  { name: 'Robijn', hex: 0xff4a5a, css: '#ff4a5a' }, { name: 'Aqua', hex: 0x3ad8e8, css: '#3ad8e8' }, { name: 'Smaragd', hex: 0x4adf6a, css: '#4adf6a' },
  { name: 'Topaas', hex: 0xffd23f, css: '#ffd23f' }, { name: 'Amethist', hex: 0xb266ff, css: '#b266ff' }, { name: 'Oranje', hex: 0xff8a2a, css: '#ff8a2a' },
];
export const ROWS = 8, COLS = 4;
const FONT = 'Fredoka, Arial Black, Arial, sans-serif';
export const BOARD_X = [-8.2, 8.2], BOARD_Y = 0.5;
export const slotPos = (b, r, c) => ({ x: BOARD_X[b] + (-2.2 + c * 1.1), y: BOARD_Y + 4.2 - r * 1.05 });
export const pegPos = (b, r, k) => ({ x: BOARD_X[b] + 2.05 + (k % 2) * 0.5, y: BOARD_Y + 4.2 - r * 1.05 + (k < 2 ? 0.22 : -0.22) });
export const hintPos = (b, c) => ({ x: BOARD_X[b] + (-2.2 + c * 1.1), y: BOARD_Y + 5.75 });
const PEG_COL = [new THREE.Color(0x2a2058), new THREE.Color(0xffd23f), new THREE.Color(0xf4f8ff)];

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star(g, cx, cy, R, fill) { g.fillStyle = fill; g.beginPath(); for (let j = 0; j < 5; j++) { const b = j / 5 * TAU - Math.PI / 2; g.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R); g.lineTo(cx + Math.cos(b + TAU / 10) * R * 0.45, cy + Math.sin(b + TAU / 10) * R * 0.45); } g.closePath(); g.fill(); }
function geoms() {
  const oct = new THREE.OctahedronGeometry(0.46); oct.scale(0.85, 1.3, 0.85);
  const tet = new THREE.TetrahedronGeometry(0.58); tet.rotateX(0.2);
  const box = new THREE.BoxGeometry(0.6, 0.6, 0.6); box.rotateY(Math.PI / 4); box.rotateX(0.5); box.rotateZ(0.4);
  return [oct, new THREE.CylinderGeometry(0.34, 0.34, 0.85, 6), new THREE.ConeGeometry(0.5, 1.0, 4), box, new THREE.IcosahedronGeometry(0.48, 0), tet];
}

export function buildVault(ctx, L) {
  const { scene, fx } = ctx;
  const rng = mulberry32(99);
  const V = { t: 0 };
  scene.background = new THREE.Color(0x1a1040); scene.fog = new THREE.Fog(0x1a1040, 45, 110);

  // ---------------- grot ----------------
  const wallT = canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1a5a'); gr.addColorStop(1, '#4a2a8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { const l = 20 + rng() * 40; g.fillStyle = `rgba(${l + 30},${l + 10},${l + 90},${0.15 + rng() * 0.2})`; g.beginPath(); g.ellipse(rng() * w, rng() * h, 10 + rng() * 40, 5 + rng() * 22, rng() * 3, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(140,110,255,.2)'; g.lineWidth = 2; for (let i = 0; i < 30; i++) { let x = rng() * w, y = rng() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 80; y += (rng() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
  }, { repeat: [4, 2] });
  scene.add(mesh(new THREE.PlaneGeometry(90, 40), new THREE.MeshStandardMaterial({ map: wallT, roughness: 1 }), { cast: false, receive: false, pos: [0, 6, -9] }));
  scene.add(mesh(new THREE.PlaneGeometry(90, 40), new THREE.MeshStandardMaterial({ color: 0x3a2a70, roughness: 0.35, metalness: 0.45 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, -4.4, 4] }));
  // grot-kristallen langs de rand (tweemaal instanced)
  const cg = new THREE.ConeGeometry(0.5, 1, 5); const cmat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6a4aff, emissiveIntensity: 0.6, roughness: 0.2, flatShading: true });
  const cave = new THREE.InstancedMesh(cg, cmat, 26); const dm = new THREE.Object3D();
  for (let i = 0; i < 26; i++) { const sx = i % 2 ? 1 : -1; const x = sx * (15 + rng() * 10), z = -6 - rng() * 2; const h = 2 + rng() * 5; dm.position.set(x, -4.4 + h / 2, z); dm.scale.set(0.8 + rng(), h, 0.8 + rng()); dm.rotation.set(0, rng() * 6, (rng() - 0.5) * 0.5); dm.updateMatrix(); cave.setMatrixAt(i, dm.matrix); cave.setColorAt(i, new THREE.Color(CRYS[Math.floor(rng() * 6)].hex)); }
  scene.add(cave);
  for (let i = 0; i < 5; i++) { const t = P.torch(0xffa030); t.position.set((i - 2) * 7.5, -4.4, -8.4); t.scale.setScalar(2.2); if (t.userData.light) t.remove(t.userData.light); scene.add(t); }
  // lichtbundels
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(2.2, 18, 12, 1, true), new THREE.MeshBasicMaterial({ color: [0x9a7aff, 0x7aeaff][i % 2], transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(-12 + i * 8, 11, -7); scene.add(m); (V.beams ||= []).push(m); }

  // ---------------- kristallen (instanced) ----------------
  const geos = geoms(); const CAP = 120;
  V.cm = geos.map((g, k) => { const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: CRYS[k].hex, emissive: CRYS[k].hex, emissiveIntensity: 0.75, roughness: 0.15, metalness: 0.2, flatShading: true }), CAP); m.count = 0; m.frustumCulled = false; scene.add(m); return m; });
  const cnt = [0, 0, 0, 0, 0, 0]; const dum = new THREE.Object3D(); const dcol = new THREE.Color();
  V.beginCrystals = () => { cnt.fill(0); };
  V.crystal = (type, x, y, z, s = 1, ry = 0, dim = 0) => {
    const m = V.cm[type]; const i = cnt[type]; if (i >= CAP) return; cnt[type]++;
    dum.position.set(x, y, z); dum.rotation.set(0, ry, 0); dum.scale.setScalar(s); dum.updateMatrix(); m.setMatrixAt(i, dum.matrix);
    dcol.setScalar(1 - dim * 0.7); m.setColorAt(i, dcol);
  };
  V.endCrystals = () => { V.cm.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); };

  // ---------------- borden ----------------
  const plateG = new THREE.BoxGeometry(5.7, 0.92, 0.12), sockG = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 14); sockG.rotateX(Math.PI / 2);
  const pegG = new THREE.SphereGeometry(0.13, 8, 6);
  const plates = new THREE.InstancedMesh(plateG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 }), ROWS * 2);
  const socks = new THREE.InstancedMesh(sockG, new THREE.MeshBasicMaterial({ color: 0xffffff }), (ROWS + 1) * COLS * 2);
  const pegs = new THREE.InstancedMesh(pegG, new THREE.MeshBasicMaterial({ color: 0xffffff }), ROWS * 4 * 2);
  scene.add(plates, socks, pegs);
  const sockCol = new THREE.Color(0x3a2a78);
  for (let b = 0; b < 2; b++) {
    for (let r = 0; r < ROWS; r++) {
      dum.rotation.set(0, 0, 0); dum.scale.setScalar(1);
      dum.position.set(BOARD_X[b] + 0.15, slotPos(b, r, 0).y, -0.1); dum.updateMatrix(); plates.setMatrixAt(b * ROWS + r, dum.matrix); plates.setColorAt(b * ROWS + r, new THREE.Color(0x3a2a80));
      for (let c = 0; c < COLS; c++) { const p = slotPos(b, r, c); dum.position.set(p.x, p.y, -0.02); dum.updateMatrix(); socks.setMatrixAt((b * (ROWS + 1) + r) * COLS + c, dum.matrix); socks.setColorAt((b * (ROWS + 1) + r) * COLS + c, sockCol); }
      for (let k = 0; k < 4; k++) { const p = pegPos(b, r, k); dum.position.set(p.x, p.y, 0.02); dum.updateMatrix(); pegs.setMatrixAt((b * ROWS + r) * 4 + k, dum.matrix); pegs.setColorAt((b * ROWS + r) * 4 + k, PEG_COL[0]); }
    }
    for (let c = 0; c < COLS; c++) { const p = hintPos(b, c); dum.position.set(p.x, p.y, -0.02); dum.scale.setScalar(0.8); dum.updateMatrix(); socks.setMatrixAt((b * (ROWS + 1) + ROWS) * COLS + c, dum.matrix); socks.setColorAt((b * (ROWS + 1) + ROWS) * COLS + c, sockCol); dum.scale.setScalar(1); }
    // achterplaat + lijst in spelerskleur
    const col = PLAYER_COLORS[b];
    scene.add(mesh(new THREE.BoxGeometry(6.5, 11.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a1a60, roughness: 0.7, metalness: 0.2 }), { cast: false, pos: [BOARD_X[b] + 0.1, BOARD_Y + 2.1, -0.45] }));
    scene.add(mesh(new THREE.BoxGeometry(6.9, 12.0, 0.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.4 }), { cast: false, pos: [BOARD_X[b] + 0.1, BOARD_Y + 2.1, -0.7] }));
  }
  const setPlate = (b, r, color) => { plates.setColorAt(b * ROWS + r, color); plates.instanceColor.needsUpdate = true; };
  V.plateColors = { idle: new THREE.Color(0x3a2a80), cur: new THREE.Color(0x7a5ae8), stale: new THREE.Color(0x4a3a50), done: new THREE.Color(0x2c1e66) };
  V.setPlate = setPlate;
  V.setPeg = (b, r, k, v) => { pegs.setColorAt((b * ROWS + r) * 4 + k, PEG_COL[v]); pegs.instanceColor.needsUpdate = true; };
  V.setSock = (b, r, c, color) => { socks.setColorAt((b * (ROWS + 1) + r) * COLS + c, color); socks.instanceColor.needsUpdate = true; };

  // cursor + hint-sleuteltje per speler
  const curT = canvasTex(128, 128, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 14; rr(g, 10, 10, 108, 108, 22); g.stroke(); g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, 10, 10, 108, 108, 22); g.fill(); });
  V.cursor = [0, 1].map((b) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.12), new THREE.MeshBasicMaterial({ map: curT, color: PLAYER_COLORS[b], transparent: true, depthWrite: false })); m.visible = false; scene.add(m); return m; });
  // header-canvas per bord
  V.hdr = [0, 1].map((b) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 170; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.75), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false })); m.position.set(BOARD_X[b] + 0.1, BOARD_Y + 7.15, 0.0); scene.add(m);
    return { c, g, t, key: '' };
  });
  V.drawHeader = (b, st) => {
    const H = V.hdr[b]; const key = JSON.stringify(st); if (H.key === key) return; H.key = key; const g = H.g, css = PLAYER_CSS[b];
    g.clearRect(0, 0, 640, 170); g.fillStyle = 'rgba(18,10,48,.92)'; rr(g, 4, 4, 632, 162, 26); g.fill(); g.lineWidth = 8; g.strokeStyle = css; g.stroke();
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `bold 62px ${FONT}`; g.fillStyle = css; g.fillText(st.name, 26, 52);
    for (let k = 0; k < 2; k++) star(g, 540 + k * 52, 50, 24, k < st.wins ? '#ffd23f' : '#3a2f70');
    g.font = `bold 30px ${FONT}`; g.fillStyle = '#c8b8ff'; g.fillText(st.line1 || '', 26, 112);
    g.textAlign = 'right'; g.fillStyle = st.line2Col || '#ffd23f'; g.fillText(st.line2 || '', 618, 112);
    H.t.needsUpdate = true;
  };
  // midden-banner
  V.bn = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 300; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const m = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.17), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false })); m.position.set(0, 4.6, 0.6); scene.add(m); return { c, g, t, key: '', m }; })();
  V.drawBanner = (st) => {
    const B = V.bn; const key = JSON.stringify(st); if (B.key === key) return; B.key = key; const g = B.g;
    g.clearRect(0, 0, 1024, 300); g.fillStyle = st.warn ? 'rgba(90,10,20,.92)' : 'rgba(18,10,48,.9)'; rr(g, 6, 6, 1012, 288, 40); g.fill(); g.lineWidth = 10; g.strokeStyle = st.warn ? '#ff5a4a' : '#ffd23f'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold 84px ${FONT}`; g.fillStyle = st.warn ? '#ffb0a0' : '#ffd23f'; g.fillText(st.title, 512, 90, 960);
    g.font = `bold 46px ${FONT}`; g.fillStyle = '#ffffff'; g.fillText(st.sub || '', 512, 175, 960);
    // legenda
    g.font = `bold 34px ${FONT}`; g.textAlign = 'left'; g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(70, 245, 17, 0, TAU); g.fill(); g.fillStyle = '#e8e0ff'; g.fillText('goede plek', 100, 247);
    g.fillStyle = '#f4f8ff'; g.beginPath(); g.arc(440, 245, 17, 0, TAU); g.fill(); g.fillStyle = '#e8e0ff'; g.fillText('goede kleur, andere plek', 470, 247, 520);
    B.t.needsUpdate = true;
  };

  // ---------------- nevel + zandloper + spook-kristallen ----------------
  const fogT = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#2a1060'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 50 + rng() * 40); gr.addColorStop(0, `rgba(${150 + rng() * 80},${110 + rng() * 60},255,.55)`); gr.addColorStop(1, 'rgba(120,80,255,0)'); g.save(); g.translate(rng() * w, rng() * h); g.fillStyle = gr; g.fillRect(-100, -100, 200, 200); g.restore(); } });
  V.fog = [0, 1].map((b) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 10.6), new THREE.MeshBasicMaterial({ map: fogT, transparent: true, opacity: 0, depthWrite: false })); m.position.set(BOARD_X[b] + 0.1, BOARD_Y + 1.6, 0.7); m.visible = false; scene.add(m); return m; });
  const ghostI = new THREE.InstancedMesh(geos[0], new THREE.MeshBasicMaterial({ color: 0xd8b8ff, transparent: true, opacity: 0.55, depthWrite: false }), 16); ghostI.frustumCulled = false; scene.add(ghostI); V.ghost = { m: ghostI, on: [0, 0] };
  V.hg = [0, 1].map((b) => {
    const g = new THREE.Group(); g.position.set(BOARD_X[b] + 0.1, BOARD_Y + 1.6, 1.4); g.visible = false; scene.add(g);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, roughness: 0.1 }); const gold = mat(0xe8c24a, { metalness: 0.7 });
    g.add(mesh(new THREE.ConeGeometry(1.0, 1.6, 10), glass, { cast: false, pos: [0, 0.85, 0], rot: [Math.PI, 0, 0] }), mesh(new THREE.ConeGeometry(1.0, 1.6, 10), glass, { cast: false, pos: [0, -0.85, 0] }), mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 10), gold, { cast: false, pos: [0, 1.75, 0] }), mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 10), gold, { cast: false, pos: [0, -1.75, 0] }));
    const sand = mesh(new THREE.ConeGeometry(0.7, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0xffd86b }), { cast: false, pos: [0, -1.1, 0] }); g.add(sand); g.userData.sand = sand;
    return g;
  });
  // vliegend spook-kristal
  V.proj = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xd8b8ff, transparent: true, opacity: 0.8 })); V.proj.visible = false; scene.add(V.proj);

  // ---------------- kist + code-paneel ----------------
  const chest = P.chest(false, 0x7a4a24); chest.scale.setScalar(4.2); chest.position.set(0, -4.4, 1.6); scene.add(chest); V.chest = chest;
  const lid = chest.userData.lid; V.chestU = 0;
  const cpC = document.createElement('canvas'); cpC.width = 512; cpC.height = 160; const cpG = cpC.getContext('2d'); const cpT = new THREE.CanvasTexture(cpC); cpT.colorSpace = THREE.SRGBColorSpace;
  V.codePanel = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.75), new THREE.MeshBasicMaterial({ map: cpT, transparent: true, toneMapped: false })); V.codePanel.position.set(0, -0.55, 2.0); scene.add(V.codePanel);
  V.codeX = (c) => -2.1 + c * 1.4; V.codeY = -0.55;
  V.drawCodePanel = (txt, open) => { const g = cpG; g.clearRect(0, 0, 512, 160); g.fillStyle = 'rgba(18,10,48,.9)'; rr(g, 4, 4, 504, 152, 28); g.fill(); g.lineWidth = 8; g.strokeStyle = '#ffd23f'; g.stroke(); if (!open) { g.font = `bold 84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#6a58b8'; for (let c = 0; c < 4; c++) g.fillText('?', 74 + c * 121, 84); } else { g.fillStyle = 'rgba(255,210,60,.15)'; g.fillRect(8, 8, 496, 144); } cpT.needsUpdate = true; };
  V.drawCodePanel('', false);
  // fakkel-schijn en gloed rond de kist
  const glowT = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  V.chestGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffd23f, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })); V.chestGlow.scale.set(9, 5, 1); V.chestGlow.position.set(0, -2.6, 2.2); scene.add(V.chestGlow);
  V.setChest = (u) => { V.chestU = u; lid.rotation.x = -1.9 * u; V.chestGlow.material.opacity = u * 0.7; };

  // ---------------- slot-golem ----------------
  const gol = new THREE.Group(); gol.position.set(0, -4.4, -3.2); gol.scale.setScalar(1.12); scene.add(gol); V.golem = gol;
  const rock = new THREE.MeshStandardMaterial({ color: 0x77708a, roughness: 0.95, flatShading: true });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x66f0ff });
  const body = new THREE.Group(); gol.add(body);
  body.add(mesh(new THREE.BoxGeometry(3.4, 3.0, 2.0), rock, { pos: [0, 3.6, 0] }), mesh(new THREE.BoxGeometry(2.4, 1.3, 1.6), rock, { pos: [0, 1.7, 0] }));
  for (const sx of [-1, 1]) { body.add(mesh(new THREE.BoxGeometry(1.3, 3.0, 1.3), rock, { pos: [sx * 2.5, 3.2, 0.1] }), mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), rock, { pos: [sx * 2.6, 1.3, 0.3] }), mesh(new THREE.BoxGeometry(1.1, 1.2, 1.1), rock, { pos: [sx * 0.9, 0.6, 0] })); }
  const head = new THREE.Group(); head.position.set(0, 5.9, 0.2); body.add(head);
  head.add(mesh(new THREE.BoxGeometry(2.0, 1.6, 1.6), rock), mesh(new THREE.BoxGeometry(2.2, 0.3, 1.7), rock, { pos: [0, 0.9, 0] }));
  const eyes = [-1, 1].map((sx) => { const e = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.1), eyeM, { cast: false, pos: [sx * 0.5, 0.15, 0.82] }); head.add(e); return e; });
  const runeM = new THREE.MeshBasicMaterial({ color: 0x66f0ff });
  for (let i = 0; i < 4; i++) body.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.05), runeM, { cast: false, pos: [(i % 2 ? 0.8 : -0.8), 4.4 - i * 0.5, 1.03] }));
  V.golemParts = { body, head, eyes, eyeM, runeM };
  V.golemMode = 'idle';

  // ---------------- lont ----------------
  const fuseG = new THREE.Group(); fuseG.position.set(0, BOARD_Y + 7.0, 0.2); scene.add(fuseG);
  const rope = mesh(new THREE.BoxGeometry(6.4, 0.16, 0.16), mat(0x5a4028), { cast: false }); fuseG.add(rope);
  const glowLine = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.07, 0.2), new THREE.MeshBasicMaterial({ color: 0xffa030 })); fuseG.add(glowLine);
  const bomb = mesh(new THREE.SphereGeometry(0.7, 12, 10), mat(0x14141c, { metalness: 0.5, roughness: 0.3 }), { cast: false, pos: [-3.95, -0.2, 0] }); fuseG.add(bomb); V.bomb = bomb;
  fuseG.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 8), mat(0x888899, { metalness: 0.7 }), { cast: false, pos: [-3.65, 0.45, 0] }));
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffb040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); flame.scale.set(1.5, 1.5, 1); fuseG.add(flame);
  // de lont brandt van rechts naar links: het resterende touw loopt van de bom (links) tot de vlam
  V.setFuse = (u) => {
    u = clamp(u, 0, 1); const len = 6.4, left = -len / 2;
    rope.scale.x = glowLine.scale.x = Math.max(0.001, u); rope.position.x = glowLine.position.x = left + len * u / 2;
    flame.position.x = left + len * u; flame.visible = u > 0.001; V.fuseTip = flame.position.x; V.fuseU = u;
    flame.material.opacity = 0.7 + Math.random() * 0.3; flame.scale.setScalar(1.2 + Math.random() * 0.5);
  };
  V.setFuse(1);

  // ---------------- poppetjes ----------------
  V.chars = [0, 1].map((i) => {
    const c = makeBrother(i); const k = 3.6 / c.height; const hold = new THREE.Group(); hold.add(c.group); hold.scale.setScalar(k);
    const x = i ? 12.6 : -12.6; hold.position.set(x, -4.4, 1.0); scene.add(hold); c.faceDir(i ? -0.5 : 0.5, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; return c;
  });
  // sfeerlicht
  const l1 = new THREE.PointLight(0x4aff9a, 0.8, 30, 1.4); l1.position.set(-8, 4, 6); const l2 = new THREE.PointLight(0x4a8cff, 0.8, 30, 1.4); l2.position.set(8, 4, 6); const l3 = new THREE.PointLight(0xffd23f, 0.6, 20, 1.5); l3.position.set(0, -1, 6); scene.add(l1, l2, l3); V.l3 = l3;

  // ---------------- update ----------------
  V.update = (dt, st = {}) => {
    V.t += dt; const t = V.t;
    V.beams.forEach((m, i) => { m.rotation.z = Math.sin(t * 0.3 + i) * 0.15; m.material.opacity = 0.06 + Math.sin(t * 0.7 + i * 2) * 0.02; });
    for (const c of V.chars) c.update(dt);
    // golem
    const G = V.golemParts; const mode = V.golemMode;
    const warn = mode === 'warn', smash = mode === 'smash';
    G.body.position.y = Math.sin(t * 1.5) * 0.06 + (warn ? Math.sin(t * 40) * 0.05 : 0);
    G.head.rotation.y = Math.sin(t * 0.7) * 0.25; G.head.rotation.x = warn ? -0.15 : 0;
    G.eyeM.color.setHex(warn ? (Math.sin(t * 24) > 0 ? 0xff3a2a : 0xffd0a0) : smash ? 0xff3a2a : 0x66f0ff);
    G.runeM.color.setHex(warn ? 0xff6a4a : 0x66f0ff);
    V.chest.rotation.z = warn ? Math.sin(t * 35) * 0.03 : 0;
    // dromerig stof
    if (Math.random() < dt * 5) fx.particles.emit((Math.random() - 0.5) * 36, -3 + Math.random() * 12, -2 + Math.random() * 6, 0, 0.3, 0, { life: 4, size: 0.12, color: 0xb8a0ff, gravity: -0.05, shrink: false });
    V.l3.intensity = 0.5 + V.chestU * 1.2 + Math.sin(t * 3) * 0.1;
    V.bomb.scale.setScalar(1 + (V.fuseU < 0.2 ? Math.sin(t * 20) * 0.06 : 0));
  };
  // camera passend op beeldverhouding
  V.fitCamera = (camera) => {
    const asp = camera.aspect || 1.7, th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dV = 8.6 / th * 0.5 * 1.18, dH = 14.2 / (th * asp);
    const d = Math.max(dV, dH, 14);
    camera.position.set(0, 2.5, d); camera.lookAt(0, 2.4, 0); camera.updateProjectionMatrix();
  };
  V.dispose = () => {};
  return V;
}

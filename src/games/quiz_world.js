import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, TAU, mulberry32 } from '../engine/util.js';
import { makeNPC, makeBrother, Animal, makeDeurman, PLAYER_COLORS, PLAYER_CSS } from '../engine/chars.js';

// Tv-studio van "Heitjesmiljonair": podium, groot scherm met de vraag, twee lessenaars, presentator, publiek, kip en de Deurman-deur.
export const ACOL = ['#ef4b4b', '#ffd23f', '#b266ff', '#37d3e8'];          // links, omhoog, rechts, omlaag
export const ACOLH = [0xef4b4b, 0xffd23f, 0xb266ff, 0x37d3e8];
const FONT = 'Fredoka, Arial Black, Arial, sans-serif';
const BW = 20, BH = 7.4;                                                    // bord (wereld-eenheden)
const BX = 0, BY = 7.2, BZ = -6.6;

// pijl-knop (richting 0 links, 1 omhoog, 2 rechts, 3 omlaag)
export function arrowIcon(g, d, cx, cy, r, fill, ink = '#1b1030') {
  g.save(); g.translate(cx, cy);
  g.fillStyle = fill; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.lineWidth = Math.max(2, r * 0.12); g.strokeStyle = 'rgba(0,0,0,.45)'; g.stroke();
  g.restore();
  g.save(); g.translate(cx, cy); g.rotate([Math.PI, -Math.PI / 2, 0, Math.PI / 2][d]);
  g.fillStyle = ink; g.beginPath(); g.moveTo(r * 0.5, 0); g.lineTo(-r * 0.25, -r * 0.5); g.lineTo(-r * 0.25, r * 0.5); g.closePath(); g.fill();
  g.restore();
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// tekst die automatisch kleiner wordt tot hij past; regelt ook regeleinden
function fitText(g, text, x, y, maxW, size, { bold = true, color = '#fff', maxLines = 1, lh = 1.15, align = 'center', stroke = null } = {}) {
  let s = size, lines = [text];
  for (; s >= 18; s -= 3) {
    g.font = `${bold ? 'bold ' : ''}${s}px ${FONT}`;
    lines = wrapLines(g, text, maxW);
    if (lines.length <= maxLines) break;
  }
  g.textAlign = align; g.textBaseline = 'middle';
  const th = lines.length * s * lh; let yy = y - th / 2 + s * lh / 2;
  for (const l of lines) { if (stroke) { g.lineWidth = s * 0.16; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(l, x, yy); } g.fillStyle = color; g.fillText(l, x, yy); yy += s * lh; }
  return s;
}
function wrapLines(g, text, maxW) {
  const words = text.split(' '); const out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); return out;
}

export function buildStudio(ctx, L) {
  const { scene, fx } = ctx;
  const rng = mulberry32(4242);
  const S = { t: 0, cheerT: 0, groanT: 0 };
  scene.background = new THREE.Color(0x0b0620); scene.fog = new THREE.Fog(0x0b0620, 40, 90);

  // ---------------- vloer + podium ----------------
  const floorT = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#120a2e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,90,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  }, { repeat: [14, 10] });
  scene.add(mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.3, metalness: 0.5 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, -0.05, -6] }));
  const podT = canvasTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#5a2fb8'); gr.addColorStop(0.7, '#2a1470'); gr.addColorStop(1, '#1a0c4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,210,90,.8)'; g.lineWidth = 6;
    for (const r of [240, 190, 120, 60]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(255,230,140,.85)';
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, r = 215; g.save(); g.translate(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); g.rotate(a); g.beginPath(); for (let j = 0; j < 5; j++) { const b = j / 5 * TAU - Math.PI / 2; g.lineTo(Math.cos(b) * 14, Math.sin(b) * 14); g.lineTo(Math.cos(b + TAU / 10) * 6, Math.sin(b + TAU / 10) * 6); } g.fill(); g.restore(); }
  });
  const podium = mesh(new THREE.CylinderGeometry(14, 14.6, 0.5, 40), [mat(0x2a1470, { metalness: 0.4, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: podT, roughness: 0.25, metalness: 0.4 }), mat(0x2a1470)], { cast: false, pos: [0, 0.2, -2] });
  podium.scale.set(1, 1, 0.8); scene.add(podium);

  // ---------------- achterwand ----------------
  const wallT = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a0f45'); gr.addColorStop(1, '#3b1a86'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(255,90,200,.28)'; g.lineWidth = 14; for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 90, h); g.lineTo(i * 90 + 150, 0); g.stroke(); }
    g.strokeStyle = 'rgba(80,200,255,.22)'; g.lineWidth = 8; for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 90 + 40, h); g.lineTo(i * 90 + 190, 0); g.stroke(); }
  });
  scene.add(mesh(new THREE.PlaneGeometry(80, 26), new THREE.MeshBasicMaterial({ map: wallT }), { cast: false, receive: false, pos: [0, 11, -7.2] }));
  // gordijnen links en rechts
  const curT = canvasTex(128, 64, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#8a1830' : '#a82040'; g.fillRect(i * 8, 0, 8, h); } }, { repeat: [3, 1] });
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(5, 20, 1.2), new THREE.MeshStandardMaterial({ map: curT, roughness: 0.9 }), { cast: false, pos: [sx * 21, 10, -5.5] }));
  // neon-titel boven het bord
  const titleT = canvasTex(1024, 160, (g, w, h) => { g.font = `bold 110px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 16; g.strokeStyle = '#7a2a00'; g.strokeText('HEITJESMILJONAIR', w / 2, h / 2); g.fillStyle = '#ffd23f'; g.fillText('HEITJESMILJONAIR', w / 2, h / 2); });
  const title = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshBasicMaterial({ map: titleT, transparent: true })); title.position.set(0, 11.9, -6.9); scene.add(title);

  // ---------------- het grote bord ----------------
  const bc = document.createElement('canvas'); bc.width = 1360; bc.height = 512; const bg = bc.getContext('2d');
  const bTex = new THREE.CanvasTexture(bc); bTex.colorSpace = THREE.SRGBColorSpace; bTex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: bTex, toneMapped: false })); board.position.set(BX, BY, BZ); scene.add(board);
  const frame = mesh(new THREE.BoxGeometry(BW + 1.0, BH + 1.0, 0.5), mat(0xd8a820, { metalness: 0.7, roughness: 0.3 }), { cast: false, pos: [BX, BY, BZ - 0.3] }); scene.add(frame);
  S.board = board;
  // tijd-balk onder het bord
  const barBack = new THREE.Mesh(new THREE.PlaneGeometry(BW, 0.34), new THREE.MeshBasicMaterial({ color: 0x120a2e })); barBack.position.set(BX, BY - BH / 2 - 0.55, BZ + 0.02); scene.add(barBack);
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(BW, 0.28), new THREE.MeshBasicMaterial({ color: 0x6aff8a })); barFill.position.set(BX, BY - BH / 2 - 0.55, BZ + 0.03); scene.add(barFill);
  S.setTimerBar = (u, col) => { u = clamp(u, 0, 1); barFill.scale.x = Math.max(0.001, u); barFill.position.x = BX - BW / 2 * (1 - u); if (col != null) barFill.material.color.setHex(col); };
  S.setTimerBar(0);
  // lampjes rond het bord en de rand van het podium (instanced)
  const bulbPos = [];
  for (let i = 0; i < 34; i++) { const u = i / 34; bulbPos.push([BX - BW / 2 - 0.4 + u * (BW + 0.8), BY + BH / 2 + 0.45, BZ + 0.0], [BX - BW / 2 - 0.4 + u * (BW + 0.8), BY - BH / 2 - 0.9, BZ + 0.0]); }
  for (let i = 0; i < 9; i++) { const v = i / 9; for (const sx of [-1, 1]) bulbPos.push([BX + sx * (BW / 2 + 0.45), BY - BH / 2 - 0.9 + v * (BH + 1.8), BZ]); }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPos.length);
  const dm = new THREE.Object3D(); bulbPos.forEach((p, i) => { dm.position.set(...p); dm.updateMatrix(); bulbs.setMatrixAt(i, dm.matrix); bulbs.setColorAt(i, new THREE.Color(0xffd23f)); });
  scene.add(bulbs);
  const ringN = 40, ringPos = []; for (let i = 0; i < ringN; i++) { const a = i / ringN * TAU; ringPos.push([Math.cos(a) * 13.6, 0.55, -2 + Math.sin(a) * 13.6 * 0.8]); }
  const ring = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), ringN);
  ringPos.forEach((p, i) => { dm.position.set(...p); dm.updateMatrix(); ring.setMatrixAt(i, dm.matrix); ring.setColorAt(i, new THREE.Color(0xff4fa8)); });
  scene.add(ring);
  const colA = new THREE.Color(), cols = [new THREE.Color(0xffd23f), new THREE.Color(0xff4fa8), new THREE.Color(0x4fd8ff), new THREE.Color(0x3a2a60)];

  // ---------------- schijnwerper-bundels ----------------
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const x = -15 + i * 6, pivot = new THREE.Group(); pivot.position.set(x, 15, -4); scene.add(pivot);
    const m = new THREE.MeshBasicMaterial({ color: [0xffe9a0, 0xff9ad8, 0x9ad8ff][i % 3], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 18, 14, 1, true), m); cone.position.y = -9; pivot.add(cone);
    pivot.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.0, 8), mat(0x222233, { metalness: 0.6 }), { cast: false, pos: [0, 0.2, 0] }));
    beams.push({ pivot, ph: i * 1.3, sp: 0.35 + rng() * 0.3 });
  }
  scene.add(mesh(new THREE.BoxGeometry(44, 0.4, 0.4), mat(0x2a2a3c, { metalness: 0.6 }), { cast: false, pos: [0, 15.4, -4] }));

  // ---------------- presentator: Koning Klopper ----------------
  const host = makeNPC('captain', { scale: 1.0, bodyW: 1.25, shirt: 0xb5242e, sleeve: 0xb5242e, tunic: 0xb5242e, pants: 0x22204a, hat: 'crown', hair: 0xf0f0f0, beard: 'full', cape: 0x6a0f26, skin: 0xf2c3a0, hairStyle: 'short' });
  const hk = 3.4 / host.height; const hold = new THREE.Group(); hold.add(host.group); hold.scale.setScalar(hk); hold.position.set(0, 0.45, -3.0); scene.add(hold); host.faceDir(0, 1);
  scene.add(mesh(new THREE.CylinderGeometry(2.0, 2.3, 0.3, 24), mat(0xd8a820, { metalness: 0.7, roughness: 0.3 }), { cast: false, pos: [0, 0.4, -3.0] }));
  const mic = mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x333344, { metalness: 0.5 }), { cast: false });
  S.host = host; S.hostBase = hold;
  // spraakwolkje
  const sc = document.createElement('canvas'); sc.width = 640; sc.height = 200; const sg = sc.getContext('2d');
  const sTex = new THREE.CanvasTexture(sc); sTex.colorSpace = THREE.SRGBColorSpace;
  const speech = new THREE.Sprite(new THREE.SpriteMaterial({ map: sTex, transparent: true, depthTest: false })); speech.scale.set(6.4, 2.0, 1); speech.position.set(4.6, 3.3, -2.5); speech.renderOrder = 18; speech.visible = false; scene.add(speech);
  let speechT = 0;
  S.say = (text, secs = 2.2) => {
    sg.clearRect(0, 0, 640, 200);
    sg.fillStyle = '#fffbe8'; rr(sg, 8, 8, 624, 150, 34); sg.fill(); sg.lineWidth = 8; sg.strokeStyle = '#2a1470'; sg.stroke();
    sg.beginPath(); sg.moveTo(90, 156); sg.lineTo(50, 196); sg.lineTo(140, 156); sg.closePath(); sg.fillStyle = '#fffbe8'; sg.fill(); sg.stroke();
    fitText(sg, text, 320, 82, 570, 50, { color: '#2a1470', maxLines: 2 });
    sTex.needsUpdate = true; speech.visible = true; speechT = secs;
  };

  // ---------------- lessenaars ----------------
  S.desks = [0, 1].map((i) => {
    const sx = i ? 1 : -1; const g = new THREE.Group(); g.position.set(sx * 6.1, 0.45, 3.2); g.rotation.y = -sx * 0.22; scene.add(g);
    const col = PLAYER_COLORS[i];
    g.add(mesh(new THREE.BoxGeometry(3.6, 1.9, 1.5), mat(0x1c1440, { metalness: 0.4, roughness: 0.4 }), { pos: [0, 0.95, 0] }));
    g.add(mesh(new THREE.BoxGeometry(3.9, 0.16, 1.8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 }), { pos: [0, 1.95, 0.05] }));
    const pc = document.createElement('canvas'); pc.width = 640; pc.height = 300; const pg = pc.getContext('2d');
    const pT = new THREE.CanvasTexture(pc); pT.colorSpace = THREE.SRGBColorSpace; pT.anisotropy = 4;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.6), new THREE.MeshBasicMaterial({ map: pT, toneMapped: false })); panel.position.set(0, 0.98, 0.76); g.add(panel);
    // buzzer
    const bz = new THREE.Group(); bz.position.set(0, 2.03, 0.45); g.add(bz);
    const buzM = new THREE.MeshStandardMaterial({ color: 0xe02a2a, emissive: 0xff2020, emissiveIntensity: 0.25, roughness: 0.3 });
    bz.add(mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.14, 16), mat(0x222233, { metalness: 0.6 }), { cast: false, pos: [0, 0.07, 0] }));
    const dome = mesh(new THREE.SphereGeometry(0.4, 14, 8, 0, TAU, 0, Math.PI / 2), buzM, { cast: false, pos: [0, 0.14, 0] }); bz.add(dome);
    const ringM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const ringL = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 24), ringM); ringL.rotation.x = -Math.PI / 2; ringL.position.y = 0.16; bz.add(ringL);
    // het poppetje achter de lessenaar
    const c = makeBrother(i); const k = 3.3 / c.height; const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(k); holder.position.set(sx * 6.1, 0.7, 1.9); scene.add(holder); c.faceDir(0, 1);
    const stand = mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 16), mat(0x2a1470), { cast: false, pos: [sx * 6.1, 0.45, 1.9] }); scene.add(stand);
    return { i, g, panel, pg, pT, buzM, ringM, ringL, bz, c, holder, k, key: '', baseX: sx * 6.1, freezeFx: 0 };
  });

  // ---------------- publiek (instanced) ----------------
  const crowd = [];
  const tiers = 3, perTier = 5;
  for (const sx of [-1, 1]) for (let t = 0; t < tiers; t++) for (let k = 0; k < perTier; k++) {
    const x = sx * (11.8 + t * 1.6) + (rng() - 0.5) * 0.4, z = 2.4 - k * 1.5 + (rng() - 0.5) * 0.3, y = 0.3 + t * 1.1;
    crowd.push({ x, y, z, yaw: sx > 0 ? -Math.PI / 2 - 0.35 : Math.PI / 2 + 0.35, ph: rng() * 6.28, s: 0.95 + rng() * 0.35, col: new THREE.Color().setHSL(rng(), 0.55, 0.55), skin: new THREE.Color([0xf2c29b, 0xd9a27a, 0x8a5a3a, 0xf6d2b5][Math.floor(rng() * 4)]), cheer: 0 });
  }
  for (const sx of [-1, 1]) for (let t = 0; t < tiers; t++) scene.add(mesh(new THREE.BoxGeometry(1.6, 0.3 + t * 1.1, 8), mat(0x241a4a), { cast: false, pos: [sx * (11.8 + t * 1.6), (0.3 + t * 1.1) / 2 - 0.25, -1.3] }));
  const bodiesI = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.5, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), crowd.length);
  const headsI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowd.length);
  const armsI = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.08, 0.55, 2, 4), new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowd.length * 2);
  crowd.forEach((p, i) => { bodiesI.setColorAt(i, p.col); headsI.setColorAt(i, p.skin); armsI.setColorAt(i * 2, p.col); armsI.setColorAt(i * 2 + 1, p.col); });
  scene.add(bodiesI, headsI, armsI);
  // neon-bordjes (APPLAUS / OEEH) boven het publiek
  const signs = [-1, 1].map((sx) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(sx * 14.6, 8.4, -4.5); m.rotation.y = -sx * 0.5; scene.add(m);
    return { c, g, t, m, txt: '' };
  });
  S.sign = (txt, color = '#ffd23f') => { for (const s of signs) { if (s.txt === txt + color) continue; s.txt = txt + color; s.g.clearRect(0, 0, 256, 96); s.g.font = `bold 62px ${FONT}`; s.g.textAlign = 'center'; s.g.textBaseline = 'middle'; s.g.lineWidth = 12; s.g.strokeStyle = 'rgba(20,0,40,.9)'; s.g.lineJoin = 'round'; s.g.strokeText(txt, 128, 50, 240); s.g.fillStyle = color; s.g.fillText(txt, 128, 50, 240); s.t.needsUpdate = true; } };
  S.sign('QUIZ!');
  let signT = 0;
  S.cheer = (secs = 2.5) => { for (const p of crowd) p.cheer = secs * (0.6 + Math.random() * 0.8); S.sign('JAAA!', '#6aff8a'); signT = secs + 0.8; };
  S.groan = (secs = 1.6) => { for (const p of crowd) p.groan = secs * (0.6 + Math.random() * 0.8); S.sign('OEEEH!', '#ff7a6a'); signT = secs + 0.8; };
  S.signLater = (secs) => { signT = secs; };

  // ---------------- de kip ----------------
  const chicken = new Animal('chicken'); chicken.group.scale.setScalar(1.7); chicken.group.visible = false; scene.add(chicken.group);
  const ck = { on: false, t: 0, from: new THREE.Vector3(), desk: 0, stage: 'in', landed: false, onLand: null, onDone: null };
  S.chickenBusy = () => ck.on;
  S.chickenStart = (deskI, onLand, onDone) => {
    const d = S.desks[deskI]; const sx = deskI ? 1 : -1;
    ck.on = true; ck.t = 0; ck.desk = deskI; ck.stage = 'in'; ck.landed = false; ck.onLand = onLand; ck.onDone = onDone;
    ck.from.set(sx * 17, 0.45, 5.4); chicken.group.visible = true; chicken.group.position.copy(ck.from);
  };

  // ---------------- de deur met de Deurman ----------------
  const doorG = new THREE.Group(); doorG.position.set(-13.4, 3.6, -7.0); scene.add(doorG);
  scene.add(mesh(new THREE.BoxGeometry(4.0, 0.5, 2.2), mat(0x2a1a50, { metalness: 0.3 }), { cast: false, pos: [-13.4, 3.35, -6.4] }));
  doorG.add(mesh(new THREE.BoxGeometry(2.8, 4.6, 0.25), mat(0x1a1030), { cast: false, pos: [0, 2.3, 0] }));
  doorG.add(mesh(new THREE.BoxGeometry(0.3, 4.8, 0.5), mat(0xd8a820, { metalness: 0.6 }), { cast: false, pos: [-1.45, 2.4, 0.1] }), mesh(new THREE.BoxGeometry(0.3, 4.8, 0.5), mat(0xd8a820, { metalness: 0.6 }), { cast: false, pos: [1.45, 2.4, 0.1] }), mesh(new THREE.BoxGeometry(3.2, 0.3, 0.5), mat(0xd8a820, { metalness: 0.6 }), { cast: false, pos: [0, 4.75, 0.1] }));
  const dm_ = makeDeurman(0.82); dm_.group.position.set(0, 0, 0.3); doorG.add(dm_.group); dm_.group.visible = false; dm_.faceDir(0, 1);
  const leafPivot = new THREE.Group(); leafPivot.position.set(-1.25, 0, 0.45); doorG.add(leafPivot);
  leafPivot.add(mesh(new THREE.BoxGeometry(2.5, 4.5, 0.14), mat(0x6b4226), { cast: false, pos: [1.25, 2.25, 0] }), mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(0xe8c24a, { metalness: 0.7 }), { cast: false, pos: [2.1, 2.2, 0.12] }));
  const dr = { open: 0, target: 0, peekT: 0, glow: 0 };
  S.deurPeek = (secs = 3) => { dr.target = 1; dr.peekT = secs; ctx.audio.sfx('creak', { vol: 0.5 }); };
  S.deurHere = () => dr.target > 0;
  const deurLight = new THREE.PointLight(0xff2a1a, 0, 14, 1.5); deurLight.position.set(-12.2, 6.5, -5.0); scene.add(deurLight);

  // ---------------- zachte sfeerlichten ----------------
  const l1 = new THREE.PointLight(0xff5ac8, 1.0, 40, 1.3); l1.position.set(-9, 9, 0); const l2 = new THREE.PointLight(0x5ac8ff, 1.0, 40, 1.3); l2.position.set(9, 9, 0); scene.add(l1, l2);

  // ======================= teken-functies =======================
  S.drawBoard = (st) => { drawBoardInner(st); bTex.needsUpdate = true; };
  const drawBoardInner = (st) => {
    const g = bg, W = 1360, H = 512;
    const gold = st.q && st.q.type === 'gold';
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, gold ? '#6a4a08' : '#1b1060'); gr.addColorStop(1, gold ? '#2a1a02' : '#0c0830'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,100,255,.18)'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(i * 110 - 60, H); g.lineTo(i * 110 + 80, 0); g.stroke(); }
    g.lineWidth = gold ? 18 : 10; g.strokeStyle = gold ? '#fff0a0' : '#ffd23f'; rr(g, 6, 6, W - 12, H - 12, 24); g.stroke();
    if (st.mode === 'title') {
      fitText(g, st.big, W / 2, 190, 1200, 120, { color: '#ffd23f', stroke: '#5a2a00' });
      fitText(g, st.small || '', W / 2, 340, 1150, 56, { color: '#ffffff', maxLines: 2 });
      if (st.sub) fitText(g, st.sub, W / 2, 430, 1100, 38, { color: '#a8c8ff' });
      return;
    }
    const q = st.q; if (!q) return;
    // kop
    const catCol = { dier: '#6aff8a', aarde: '#6ac8ff', eten: '#ffb04a', film: '#ff7ad8', spel: '#ffe14a', geluid: '#c89aff', schat: '#ff9a6a', volgorde: '#9affe0' }[q.cat] || '#fff';
    const typeTxt = { buzz: 'SNELLE VRAAG', gold: 'GOUDEN VRAAG - DUBBELE PUNTEN!', sound: 'LUISTERVRAAG', estimate: 'SCHAT HET GETAL', order: 'ZET OP VOLGORDE' }[q.type];
    g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, 24, 22, 250, 54, 27); g.fill(); fitText(g, `VRAAG ${st.qn} / ${st.total}`, 149, 50, 230, 32, { color: '#ffffff' });
    g.fillStyle = q.type === 'gold' ? '#c8921a' : catCol; rr(g, 300, 22, W - 330, 54, 27); g.fill(); fitText(g, st.sd ? 'BESLISSENDE VRAAG!' : typeTxt, 300 + (W - 330) / 2, 50, W - 380, 34, { color: q.type === 'gold' ? '#fff6c0' : '#1b1030' });
    if (gold) { g.fillStyle = '#ffd23f'; g.beginPath(); for (let j = 0; j < 12; j++) { const b = j / 12 * TAU; g.lineTo(W - 90 + Math.cos(b) * (j % 2 ? 44 : 58), 168 + Math.sin(b) * (j % 2 ? 44 : 58)); } g.closePath(); g.fill(); fitText(g, 'x2', W - 90, 168, 80, 44, { color: '#5a2a00' }); }
    // vraag
    fitText(g, q.q, W / 2, 158, 1260, 58, { color: '#ffffff', maxLines: 2, stroke: 'rgba(0,0,20,.8)' });
    const rev = st.reveal;
    if (q.type === 'buzz' || q.type === 'gold' || q.type === 'sound') {
      const tw = 646, th = 118;
      q.opts.forEach((o, d) => {
        const x = 24 + (d % 2) * (tw + 20), y = 232 + (d >> 1) * (th + 18);
        const isOk = o.ok; let fill = ACOL[d] + '40', stroke = ACOL[d];
        if (rev) { if (isOk) { fill = '#2fd86a'; stroke = '#d8ffe6'; } else { fill = 'rgba(40,30,70,.7)'; stroke = '#5a4a80'; } }
        g.fillStyle = fill; rr(g, x, y, tw, th, 22); g.fill(); g.lineWidth = 8; g.strokeStyle = stroke; g.stroke();
        arrowIcon(g, d, x + 62, y + th / 2, 40, rev && !isOk ? '#5a4a80' : ACOL[d]);
        fitText(g, o.t, x + 120 + (tw - 150) / 2, y + th / 2, tw - 170, 46, { color: rev && !isOk ? '#9a8ac0' : '#ffffff', maxLines: 2 });
        // markeringen van spelers (fout = rood kruis, goed = vinkje)
        const mk = (st.marks && st.marks[d]) || [];
        mk.forEach((m, j) => { const cx = x + tw - 36 - j * 70, cy = y + th / 2; g.fillStyle = '#1a0c3a'; g.beginPath(); g.arc(cx, cy, 30, 0, TAU); g.fill(); g.lineWidth = 9; g.strokeStyle = PLAYER_CSS[m.p]; g.stroke(); g.strokeStyle = m.ok ? '#6aff8a' : '#ff4a4a'; g.lineWidth = 9; g.beginPath(); if (m.ok) { g.moveTo(cx - 13, cy); g.lineTo(cx - 4, cy + 11); g.lineTo(cx + 14, cy - 11); } else { g.moveTo(cx - 12, cy - 12); g.lineTo(cx + 12, cy + 12); g.moveTo(cx + 12, cy - 12); g.lineTo(cx - 12, cy + 12); } g.stroke(); });
      });
      if (q.type === 'sound' && !rev) { g.fillStyle = '#c89aff'; for (let k = 0; k < 7; k++) { const hh = 14 + Math.abs(Math.sin(k * 1.7 + st.beat * 2)) * 26; g.fillRect(W - 120 + k * 14 - 50, 110 - hh / 2, 8, hh); } }
    } else if (q.type === 'order') {
      const tw = 400, th = 190;
      for (let p = 0; p < 3; p++) {
        const x = 32 + p * (tw + 44), y = 250; const d = [0, 1, 2][p]; const item = q.perm[p];
        let fill = ACOL[d] + '40', stroke = ACOL[d];
        if (rev) { fill = '#2fd86a'; stroke = '#d8ffe6'; }
        g.fillStyle = fill; rr(g, x, y, tw, th, 26); g.fill(); g.lineWidth = 8; g.strokeStyle = stroke; g.stroke();
        arrowIcon(g, d, x + 60, y + 52, 38, ACOL[d]);
        fitText(g, q.items[item], x + tw / 2 + 30, y + 112, tw - 60, 54, { color: '#fff', maxLines: 2 });
        if (rev) { g.fillStyle = '#fff'; g.font = `bold 60px ${FONT}`; g.textAlign = 'center'; g.fillText(String(item + 1), x + tw - 52, y + 50); }
      }
      fitText(g, rev ? 'Zo hoort het!' : 'Druk de pijlen in de goede volgorde: eerst nummer 1!', W / 2, 470, 1200, 36, { color: '#a8c8ff' });
    } else if (q.type === 'estimate') {
      const x0 = 120, x1 = W - 120, y = 340;
      g.fillStyle = '#2a2070'; rr(g, x0 - 20, y - 22, x1 - x0 + 40, 44, 22); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#a8c8ff'; rr(g, x0 - 20, y - 22, x1 - x0 + 40, 44, 22); g.stroke();
      const X = (v) => x0 + (v - q.min) / (q.max - q.min) * (x1 - x0);
      g.fillStyle = '#fff'; g.font = `bold 38px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(q.min), x0, y + 40); g.fillText(String(q.max), x1, y + 40);
      for (let k = 0; k <= 10; k++) { g.fillStyle = 'rgba(168,200,255,.6)'; g.fillRect(x0 + k * (x1 - x0) / 10 - 2, y - 14, 4, 28); }
      if (st.picks) st.picks.forEach((v, p) => { if (v == null) return; const px = X(clamp(v, q.min, q.max)); g.fillStyle = PLAYER_CSS[p]; g.beginPath(); g.moveTo(px, y + (p ? 24 : -24)); g.lineTo(px - 18, y + (p ? 54 : -54)); g.lineTo(px + 18, y + (p ? 54 : -54)); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); fitText(g, String(Math.round(v)), px, y + (p ? 82 : -78), 220, 36, { color: PLAYER_CSS[p], stroke: '#10082a' }); });
      if (rev) { const px = X(q.ans); g.fillStyle = '#ffd23f'; g.beginPath(); for (let j = 0; j < 5; j++) { const b = j / 5 * TAU - Math.PI / 2; g.lineTo(px + Math.cos(b) * 34, y + Math.sin(b) * 34); g.lineTo(px + Math.cos(b + TAU / 10) * 14, y + Math.sin(b + TAU / 10) * 14); } g.closePath(); g.fill(); g.lineWidth = 5; g.strokeStyle = '#7a4a00'; g.stroke(); fitText(g, `Antwoord: ${q.ans} ${q.unit}`, W / 2, 482, 1100, 44, { color: '#ffd23f', stroke: '#2a1000' }); }
      else fitText(g, st.hint || `Stel in met je pijlen (grof/fijn), A = vastzetten`, W / 2, 468, 1200, 36, { color: '#a8c8ff' });
    }
  };

  // lessenaar-paneel: st = { name, score, delta, status, jokers, hint, est, frozen, swappedBy }
  S.drawDesk = (i, st) => {
    const D = S.desks[i]; const key = JSON.stringify(st); if (D.key === key) return; D.key = key;
    const g = D.pg, W = 640, H = 300, css = PLAYER_CSS[i];
    g.fillStyle = '#120a34'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, css + '55'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, 70);
    g.lineWidth = 12; g.strokeStyle = css; g.strokeRect(6, 6, W - 12, H - 12);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `bold 54px ${FONT}`; g.fillStyle = css; g.fillText(st.name, 28, 42);
    g.textAlign = 'right'; g.font = `bold 78px ${FONT}`; g.fillStyle = '#ffd23f'; g.lineWidth = 10; g.strokeStyle = '#3a1a00'; g.strokeText(String(st.score), W - 30, 48); g.fillText(String(st.score), W - 30, 48);
    if (st.delta) { g.font = `bold 40px ${FONT}`; g.fillStyle = st.delta > 0 ? '#6aff8a' : '#ff6a6a'; g.fillText((st.delta > 0 ? '+' : '') + st.delta, W - 30, 100); }
    // midden
    if (st.est) {
      const e = st.est; g.textAlign = 'center'; g.font = `bold 84px ${FONT}`; g.fillStyle = e.locked ? '#6aff8a' : '#ffffff'; g.fillText(`${e.val}`, W / 2, 130);
      g.font = `bold 30px ${FONT}`; g.fillStyle = '#a8c8ff'; g.fillText(e.locked ? 'VASTGEZET!' : (e.hint || `tussen ${e.lo} en ${e.hi}`), W / 2, 190);
      g.fillStyle = '#2a2070'; rr(g, 60, 214, W - 120, 14, 7); g.fill(); g.fillStyle = css; const u = (e.val - e.lo) / Math.max(1, e.hi - e.lo); g.beginPath(); g.arc(60 + clamp(u, 0, 1) * (W - 120), 221, 16, 0, TAU); g.fill();
    } else if (st.pips != null) {
      g.textAlign = 'center'; for (let k = 0; k < 3; k++) { g.fillStyle = k < st.pips ? '#6aff8a' : '#3a2f70'; g.beginPath(); g.arc(W / 2 - 90 + k * 90, 130, 30, 0, TAU); g.fill(); }
      g.font = `bold 32px ${FONT}`; g.fillStyle = '#fff'; g.fillText(st.status || '', W / 2, 190);
    } else {
      g.textAlign = 'center'; g.font = `bold 44px ${FONT}`; g.fillStyle = st.statusCol || '#ffffff'; g.fillText(st.status || '', W / 2, st.hint5 ? 110 : 140);
      if (st.hint5) { for (let d = 0; d < 4; d++) { const cx = W / 2 - 135 + d * 90; arrowIcon(g, d, cx, 175, 32, st.hint5.includes(d) ? ACOL[d] : '#3a2f70'); if (!st.hint5.includes(d)) { g.strokeStyle = '#ff5050'; g.lineWidth = 8; g.beginPath(); g.moveTo(cx - 22, 153); g.lineTo(cx + 22, 197); g.moveTo(cx + 22, 153); g.lineTo(cx - 22, 197); g.stroke(); } } }
      else if (st.hintArrow != null) { arrowIcon(g, st.hintArrow, W / 2, 185, 34, ACOL[st.hintArrow]); }
    }
    // jokers
    g.textAlign = 'left'; g.font = `bold 26px ${FONT}`; g.fillStyle = '#a8c8ff'; g.fillText('JOKERS', 26, 262);
    (st.jokers || []).forEach((j, k) => { const cx = 190 + k * 70, cy = 262; g.fillStyle = j.used ? '#2a2255' : '#3a2f90'; g.beginPath(); g.arc(cx, cy, 26, 0, TAU); g.fill(); g.strokeStyle = j.used ? '#554a88' : '#ffd23f'; g.lineWidth = 4; g.stroke(); g.globalAlpha = j.used ? 0.35 : 1; g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.textAlign = 'center'; g.font = `bold 22px ${FONT}`; g.fillText('?', cx, cy + 1); g.globalAlpha = 1; });
    if (st.frozen > 0) { g.fillStyle = st.kip ? 'rgba(255,220,120,.6)' : 'rgba(150,230,255,.55)'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = `bold 66px ${FONT}`; g.textAlign = 'center'; g.fillText(st.kip ? 'KIP OP DE KNOP!' : 'IJSBLOK!', W / 2, 150, W - 40); g.font = `bold 40px ${FONT}`; g.fillText(st.frozen.toFixed(1) + 's', W / 2, 208); }
    if (st.swappedBy) { g.fillStyle = '#ffe14a'; g.font = `bold 26px ${FONT}`; g.textAlign = 'right'; g.fillText(`${st.swappedBy} bestuurt!`, W - 24, 262); }
    D.pT.needsUpdate = true;
  };

  // ======================= update =======================
  const dummy = new THREE.Object3D();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  S.update = (dt, st = {}) => {
    S.t += dt; const t = S.t;
    // lampjes
    for (let i = 0; i < bulbPos.length; i++) { bulbs.setColorAt(i, ((Math.floor(t * 6) + i) % 3 === 0) ? cols[0] : cols[1 + (i % 2)]); }
    bulbs.instanceColor.needsUpdate = true;
    for (let i = 0; i < ringN; i++) ring.setColorAt(i, ((i - Math.floor(t * 9)) % 5 + 5) % 5 < 2 ? cols[1] : cols[3]);
    ring.instanceColor.needsUpdate = true;
    for (const b of beams) { b.pivot.rotation.z = Math.sin(t * b.sp + b.ph) * 0.35; b.pivot.rotation.x = Math.cos(t * b.sp * 0.8 + b.ph) * 0.2; }
    l1.intensity = 0.9 + Math.sin(t * 2.1) * 0.25; l2.intensity = 0.9 + Math.sin(t * 1.7 + 2) * 0.25;
    // host
    host.update(dt); if (speechT > 0) { speechT -= dt; if (speechT <= 0) speech.visible = false; }
    // lessenaars
    for (const D of S.desks) {
      D.c.update(dt);
      D.buzM.emissiveIntensity = damp(D.buzM.emissiveIntensity, D.lit || 0.25, 10, dt);
      D.ringM.opacity = 0.45 + Math.sin(t * 4 + D.i) * 0.15 + (D.lit ? 0.3 : 0);
      D.bz.position.y = 2.03 - (D.press || 0) * 0.08; D.press = Math.max(0, (D.press || 0) - dt * 6);
    }
    // publiek
    S.cheerT = Math.max(0, S.cheerT - dt);
    for (let i = 0; i < crowd.length; i++) {
      const p = crowd[i]; p.cheer = Math.max(0, p.cheer - dt); p.groan = Math.max(0, (p.groan || 0) - dt);
      const hop = p.cheer > 0 ? Math.abs(Math.sin(t * 9 + p.ph)) * 0.55 : p.groan > 0 ? -0.1 : Math.abs(Math.sin(t * 1.7 + p.ph)) * 0.05;
      const arm = p.cheer > 0 ? 2.6 + Math.sin(t * 12 + p.ph) * 0.4 : p.groan > 0 ? 0.3 : 0.2;
      dummy.position.set(p.x, p.y + 0.8 * p.s + hop, p.z); dummy.rotation.set(0, p.yaw, p.groan > 0 ? 0.2 : 0); dummy.scale.setScalar(p.s); dummy.updateMatrix(); bodiesI.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, p.y + 1.62 * p.s + hop, p.z); dummy.rotation.set(p.groan > 0 ? 0.4 : 0, p.yaw, 0); dummy.updateMatrix(); headsI.setMatrixAt(i, dummy.matrix);
      for (const sd of [-1, 1]) {
        const ax = Math.cos(p.yaw) * 0.38 * sd * p.s, az = -Math.sin(p.yaw) * 0.38 * sd * p.s;
        dummy.position.set(p.x + ax, p.y + 1.0 * p.s + hop + (p.cheer > 0 ? 0.35 : 0), p.z + az); dummy.rotation.set(0, p.yaw, sd * (p.cheer > 0 ? arm * 0.25 : arm)); dummy.scale.setScalar(p.s); dummy.updateMatrix(); armsI.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), dummy.matrix);
      }
    }
    bodiesI.instanceMatrix.needsUpdate = true; headsI.instanceMatrix.needsUpdate = true; armsI.instanceMatrix.needsUpdate = true;
    // kip
    if (ck.on) {
      ck.t += dt; chicken.update(dt); const D = S.desks[ck.desk]; const sx = ck.desk ? 1 : -1; const gp = chicken.group.position;
      const buz = _v1.set(D.baseX, 2.55, 3.65), spot = _v2.set(D.baseX + sx * 2.6, 0.45, 5.4), tgt = _v3.set(sx * 18, 0.45, 5.4);
      if (ck.stage === 'in') {
        const u = Math.min(1, ck.t / 1.3); gp.lerpVectors(ck.from, spot, u); gp.y = 0.45 + Math.abs(Math.sin(ck.t * 12)) * 0.25; chicken.speed = 1; chicken.targetYaw = -sx * Math.PI / 2;
        if (u >= 1) { ck.stage = 'hop'; ck.t = 0; }
      } else if (ck.stage === 'hop') {
        const u = Math.min(1, ck.t / 0.5); gp.lerpVectors(spot, buz, u); gp.y += Math.sin(u * Math.PI) * 1.6; chicken.speed = 0; chicken.targetYaw = 0;
        if (u >= 1) {
          ck.stage = 'sit'; ck.t = 0;
          if (!ck.landed) { ck.landed = true; D.press = 1; ctx.audio.sfx('boing'); ctx.audio.sfx('buzz', { vol: 0.5 }); ctx.audio.tone(900, 0.5, { type: 'square', vol: 0.18, slide: 500 }); ck.onLand && ck.onLand(); fx.particles.burst(gp.x, gp.y + 0.3, gp.z, { count: 20, speed: 4, up: 1.2, life: 0.7, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 8 }); }
        }
      } else if (ck.stage === 'sit') {
        gp.copy(buz); gp.y += Math.abs(Math.sin(ck.t * 8)) * 0.08; chicken.head.rotation.x = Math.sin(ck.t * 22) > 0 ? 0.9 : 0; D.lit = 1.2; chicken.targetYaw = 0;
        if (Math.floor(ck.t * 4) !== Math.floor((ck.t - dt) * 4) && ck.t < 2.2) ctx.audio.tone(600 + Math.random() * 300, 0.07, { type: 'square', vol: 0.1 });
        if (ck.t > 2.4) { ck.stage = 'out'; ck.t = 0; D.lit = 0.25; }
      } else if (ck.stage === 'out') {
        if (ck.t < 0.4) { gp.lerpVectors(buz, spot, ck.t / 0.4); gp.y += Math.sin(ck.t / 0.4 * Math.PI) * 1.0; }
        else { gp.lerpVectors(spot, tgt, Math.min(1, (ck.t - 0.4) / 1.1)); gp.y = 0.45 + Math.abs(Math.sin(ck.t * 12)) * 0.25; chicken.speed = 1; chicken.targetYaw = sx * Math.PI / 2; }
        if (ck.t > 1.5) { ck.on = false; chicken.group.visible = false; ck.onDone && ck.onDone(); }
      }
    }
    // deur
    if (dr.target > 0) { dr.peekT -= dt; if (dr.peekT <= 0) { dr.target = 0; ctx.audio.sfx('door', { vol: 0.5 }); } }
    dr.open = damp(dr.open, dr.target, 3.5, dt);
    leafPivot.rotation.y = -dr.open * 1.55;
    dm_.group.visible = dr.open > 0.45; dm_.update(dt); dm_.head.rotation.y = Math.sin(t * 2.2) * 0.35 * dr.open;
    deurLight.intensity = dr.open * (1.2 + Math.sin(t * 20) * 0.4);
    if (signT > 0) { signT -= dt; if (signT <= 0) S.sign('QUIZ!'); }
    // titel
    title.material.opacity = 0.85 + Math.sin(t * 3) * 0.15;
  };
  S.deurman = dm_; S.doorState = dr;
  S.dispose = () => {};
  return S;
}

import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, lerp, damp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';

// Omgeving van "Vier op een Rij: Drakenmunten": de schatkamer van een draak. Een groot betoverd bord op een stenen sokkel,
// toortsen, banieren, een draak op zijn goudberg, kijklustige kobolden en een vallende deken van stof en vonkjes.

export const COLS = 7, ROWS = 6;
export const CELL = 1.3, BY0 = 0.95;                 // celgrootte, onderkant van het speelvlak
export const BOARD_CY = BY0 + 3 * CELL;              // middelpunt van het bord (draaipunt bij "draai het bord")
export const cx = (c) => (c - 3) * CELL;
export const ry = (r) => BY0 + CELL * (r + 0.5);
export const TOP_Y = BY0 + ROWS * CELL;              // bovenkant van het speelvlak
export const COL_HEX = [0x35c46f, 0x4a8cff];

function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
// emblem op de munten (grijstinten: wordt door de spelerskleur ingekleurd)
export function coinFaceTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c4c4c4'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 44, 0, TAU); g.stroke();
    g.fillStyle = '#cfcfcf';
    // drakenkop (kleurloos) als embleem
    g.beginPath(); g.moveTo(30, 78); g.lineTo(44, 50); g.lineTo(50, 60); g.lineTo(64, 40); g.lineTo(78, 60); g.lineTo(84, 50); g.lineTo(98, 78); g.lineTo(84, 90); g.lineTo(64, 98); g.lineTo(44, 90); g.closePath(); g.fill();
    g.fillStyle = '#f4f4f4'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(64 + sx * 13, 72, 6, 3.5, sx * 0.4, 0, TAU); g.fill(); }
    g.strokeStyle = '#e0e0e0'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(64 + Math.cos(a) * 47, 64 + Math.sin(a) * 47); g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); g.stroke(); }
  });
}
function starTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(8); g.fillStyle = '#100a24'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h, gr = g.createRadialGradient(x, y, 1, x, y, 40 + r() * 40); gr.addColorStop(0, `rgba(${100 + r() * 100 | 0},${60 + r() * 60 | 0},${180 + r() * 60 | 0},.28)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,${220 + r() * 35 | 0},${150 + r() * 100 | 0},${0.4 + r() * 0.6})`; const s = 1 + r() * 2.2; g.fillRect(r() * w, r() * h, s, s); }
  });
}
function windowTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#05030c'; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.moveTo(8, h - 8); g.lineTo(8, 90); g.quadraticCurveTo(8, 8, 64, 8); g.quadraticCurveTo(120, 8, 120, 90); g.lineTo(120, h - 8); g.closePath(); g.clip();
    const cols = ['#6a3fd8', '#d8447a', '#e8b83a', '#3ab8d8', '#5ad86a'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = cols[(x * 3 + y * 2) % cols.length]; g.globalAlpha = 0.55 + ((x + y) % 3) * 0.15; g.fillRect(8 + x * 28, 8 + y * 31, 27, 30); }
    g.restore(); g.globalAlpha = 1; g.strokeStyle = '#1a1020'; g.lineWidth = 4;
    for (let x = 1; x < 4; x++) { g.beginPath(); g.moveTo(8 + x * 28, 8); g.lineTo(8 + x * 28, h); g.stroke(); }
    for (let y = 1; y < 8; y++) { g.beginPath(); g.moveTo(8, 8 + y * 31); g.lineTo(120, 8 + y * 31); g.stroke(); }
  });
}

// ---------------- het bord zelf ----------------
export function buildBoard(scene) {
  const B = {};
  const plate = new THREE.Group(); plate.position.set(0, BOARD_CY, 0); scene.add(plate); B.plate = plate;
  // voorplaat met 42 gaten
  const W = COLS * CELL + 0.7, Hh = ROWS * CELL + 0.5, rr = 0.45;
  const s = new THREE.Shape();
  s.moveTo(-W / 2 + rr, -Hh / 2); s.lineTo(W / 2 - rr, -Hh / 2); s.quadraticCurveTo(W / 2, -Hh / 2, W / 2, -Hh / 2 + rr); s.lineTo(W / 2, Hh / 2 - rr); s.quadraticCurveTo(W / 2, Hh / 2, W / 2 - rr, Hh / 2);
  s.lineTo(-W / 2 + rr, Hh / 2); s.quadraticCurveTo(-W / 2, Hh / 2, -W / 2, Hh / 2 - rr); s.lineTo(-W / 2, -Hh / 2 + rr); s.quadraticCurveTo(-W / 2, -Hh / 2, -W / 2 + rr, -Hh / 2);
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const p = new THREE.Path(); p.absarc(cx(c), ry(r) - BOARD_CY, 0.56, 0, TAU, true); s.holes.push(p); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 14 });
  const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a36b0, roughness: 0.45, metalness: 0.25 }));
  front.position.z = 0.17; plate.add(front); front.castShadow = true; B.front = front;
  // achterplaat: sterrenhemel in de gaten
  const bt = starTex(); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(2, 2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, Hh - 0.1), new THREE.MeshBasicMaterial({ map: bt, color: 0xb0a8d0 })); back.position.z = -0.17; plate.add(back);
  // gouden randjes om de gaten (1 instanced mesh)
  const ringGeo = new THREE.TorusGeometry(0.58, 0.055, 6, 22);
  const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xffd25a, metalness: 0.8, roughness: 0.3, emissive: 0x553300, emissiveIntensity: 0.5 }), COLS * ROWS);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { m4.makeTranslation(cx(c), ry(r) - BOARD_CY, 0.5); rings.setMatrixAt(k++, m4); }
  plate.add(rings);
  // gouden rand rond de plaat (kleurt mee met de speler die aan de beurt is)
  B.edgeMat = new THREE.MeshBasicMaterial({ color: COL_HEX[0] });
  const e = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), B.edgeMat); m.position.set(x, y, 0.55); plate.add(m); };
  e(W + 0.1, 0.12, 0, Hh / 2 - 0.02); e(W + 0.1, 0.12, 0, -Hh / 2 + 0.02); e(0.12, Hh, -W / 2 + 0.02, 0); e(0.12, Hh, W / 2 - 0.02, 0);
  // betoverde vakken (tovermunt): gouden gloed in de gaten
  const mt = glowTex();
  B.magic = Array.from({ length: 4 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, color: 0xffd23f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.scale.set(1.9, 1.9, 1); sp.position.z = 0.62; plate.add(sp); return sp; });
  // sokkel + pilaren
  const stone = new THREE.MeshStandardMaterial({ map: tex.stone(4, 1), color: 0xb8aedc, roughness: 0.9, flatShading: true });
  const base = mesh(new THREE.BoxGeometry(COLS * CELL + 2.4, BY0, 2.6), stone, { cast: true, pos: [0, BY0 / 2, 0] }); scene.add(base);
  scene.add(mesh(new THREE.BoxGeometry(COLS * CELL + 2.6, 0.12, 2.8), mat(0xe8c24a, { metalness: 0.7, roughness: 0.35 }), { cast: false, pos: [0, BY0 + 0.03, 0] }));
  B.orbMat = new THREE.MeshBasicMaterial({ color: COL_HEX[0] });
  const pm = new THREE.MeshStandardMaterial({ map: tex.stone(1, 3), color: 0xa89ed0, roughness: 0.9, flatShading: true });
  for (const sx of [-1, 1]) {
    const px = sx * (COLS * CELL / 2 + 0.55);
    scene.add(mesh(new THREE.BoxGeometry(0.75, TOP_Y + 0.5, 1.1), pm, { pos: [px, (TOP_Y + 0.5) / 2, 0] }));
    scene.add(mesh(new THREE.BoxGeometry(0.95, 0.3, 1.3), mat(0xe8c24a, { metalness: 0.7, roughness: 0.35 }), { cast: false, pos: [px, TOP_Y + 0.55, 0] }));
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), B.orbMat); orb.position.set(px, TOP_Y + 1.1, 0); scene.add(orb);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    lamp.scale.set(3.4, 3.4, 1); lamp.position.set(px, TOP_Y + 1.1, 0.2); scene.add(lamp); (B.lamps ||= []).push(lamp);
    // klauwtjes (drakentanden) aan de pilaar
    for (let i = 0; i < 3; i++) scene.add(mesh(new THREE.ConeGeometry(0.14, 0.5, 5), mat(0xf5ecd0), { cast: false, pos: [px + sx * 0.5, 1.8 + i * 2.6, 0.4], rot: [0, 0, -sx * 1.2] }));
  }
  // timer-balk op de sokkel
  B.timerMat = new THREE.MeshBasicMaterial({ color: COL_HEX[0] });
  B.timer = new THREE.Mesh(new THREE.BoxGeometry(COLS * CELL + 1.6, 0.22, 0.12), B.timerMat); B.timer.position.set(0, 0.45, 1.32); scene.add(B.timer);
  scene.add(mesh(new THREE.BoxGeometry(COLS * CELL + 1.9, 0.34, 0.08), mat(0x1a1030), { cast: false, pos: [0, 0.45, 1.29] }));
  // lichtbundel in de gekozen kolom (additief)
  const bm = new THREE.MeshBasicMaterial({ color: COL_HEX[0], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  B.beam = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.98, ROWS * CELL + 0.3), bm); B.beam.position.set(0, BOARD_CY, 0.62); scene.add(B.beam);
  return B;
}

// ---------------- de schatkamer eromheen ----------------
export function buildHall(ctx) {
  const { scene, fx } = ctx;
  const rng = mulberry32(4242);
  const H = { flames: [], banners: [], watchers: [], t: 0, ember: 0 };
  // vloer en muren
  scene.add(mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ map: tex.planks(16, 10, '#5a3d2c'), roughness: 0.9, color: 0xc8b0e0 }), { cast: false, pos: [0, 0, 4], rot: [-Math.PI / 2, 0, 0] }));
  const wall = new THREE.MeshStandardMaterial({ map: tex.bricks(18, 5), color: 0x9a8cc0, roughness: 0.95, flatShading: true });
  scene.add(mesh(new THREE.PlaneGeometry(100, 34), wall, { cast: false, pos: [0, 15, -8] }));
  // loper (tapijt) onder het bord
  scene.add(mesh(new THREE.PlaneGeometry(15, 7), new THREE.MeshStandardMaterial({ map: tex.carpet(3, 1.4), color: 0xc0a0d8, roughness: 1 }), { cast: false, pos: [0, 0.02, 1.6], rot: [-Math.PI / 2, 0, 0] }));
  // glas-in-lood ramen met gloed
  const wt = windowTex();
  for (const x of [-15.5, -8.2, 8.2, 15.5]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 7.2), new THREE.MeshBasicMaterial({ map: wt, color: 0xb8b0d8, fog: true })); w.position.set(x, 10.5, -7.9); scene.add(w);
    scene.add(mesh(new THREE.BoxGeometry(4.0, 0.3, 0.3), mat(0x3a2a52), { cast: false, pos: [x, 6.9, -7.8] }));
  }
  // pilaren in de achtergrond
  for (const x of [-20, -11.8, 0, 11.8, 20]) scene.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 24, 8), new THREE.MeshStandardMaterial({ map: tex.stone(1, 4), color: 0x8a7eb0, roughness: 1, flatShading: true }), { cast: false, pos: [x, 11, -7.2] }));
  // toortsen
  for (const [x, y] of [[-12.2, 4.6], [12.2, 4.6], [-5.5, 11.8], [5.5, 11.8]]) {
    const t = P.torch(0xffa030); t.position.set(x, y - 1.4, -7.4); t.scale.setScalar(1.3);
    if (y > 8) { t.userData.light.intensity = 0; } else t.userData.light.intensity = 1.5;
    scene.add(t); H.flames.push(t);
  }
  // banieren
  const bcols = [0x7a2fd4, 0x35c46f, 0xd8372c, 0x4a8cff];
  [-17.5, -3.2, 3.2, 17.5].forEach((x, i) => { const b = P.banner(bcols[i], 5.4, 1.5); b.position.set(x - 0.75, 11.2, -7.7); scene.add(b); H.banners.push(b); });
  // goudberg links (instanced munten + edelstenen) en een open schatkist
  const mound = []; for (let i = 0; i < 170; i++) { const a = rng() * TAU, d = Math.pow(rng(), 0.7) * 3.6; mound.push([Math.cos(a) * d, Math.max(0.05, 1.7 - d * 0.5 + rng() * 0.3), Math.sin(a) * d * 0.7]); }
  const gold = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.8, roughness: 0.3, emissive: 0x6a3a00, emissiveIntensity: 0.4 }), mound.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
  mound.forEach((p, i) => { e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e); ps.set(-12.3 + p[0], p[1], -3.4 + p[2]); m4.compose(ps, q, sc); gold.setMatrixAt(i, m4); });
  scene.add(gold);
  const gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.3, flatShading: true, emissive: 0x222244 }), 16);
  const gc = [0xff4a7a, 0x4ae0ff, 0x7aff8a, 0xb06bff];
  for (let i = 0; i < 16; i++) { const a = rng() * TAU, d = rng() * 2.4; e.set(rng(), rng() * 3, rng()); q.setFromEuler(e); ps.set(-12.3 + Math.cos(a) * d, Math.max(0.3, 1.9 - d * 0.5), -3.4 + Math.sin(a) * d * 0.7); m4.compose(ps, q, sc); gems.setMatrixAt(i, m4); gems.setColorAt(i, new THREE.Color(gc[i % 4])); }
  scene.add(gems);
  const ch = P.chest(true); ch.position.set(10.4, 0, -3.6); ch.rotation.y = -0.5; ch.scale.setScalar(1.8); scene.add(ch);
  for (const [bx, bz, s] of [[12.6, -3.2, 1.3], [13.6, -4.2, 1.1], [8.8, -5.2, 1.2]]) { const b = P.barrel(s); b.position.set(bx, 0, bz); scene.add(b); }
  // draak op zijn berg (rechts) — kijkt mee met wie aan de beurt is
  const dragon = new Dragon(0x7a2fd4, 1.35); dragon.group.position.set(-11.4, 1.5, -5.2); dragon.group.rotation.y = 1.0; scene.add(dragon.group); H.dragon = dragon; H.dragonYaw = 1.0;
  const dm = mesh(new THREE.CylinderGeometry(3.2, 4.2, 1.2, 9), new THREE.MeshStandardMaterial({ color: 0xe8b82a, metalness: 0.7, roughness: 0.4, flatShading: true, emissive: 0x5a3400, emissiveIntensity: 0.4 }), { cast: false, pos: [-11.4, 0.5, -5.2] }); scene.add(dm);
  // kijkers: kobolden en dwergen op krukjes
  const kinds = [['goblin', -14.4, 3.2, 0.5], ['dwarf', 14.4, 3.4, -0.5]];
  for (const [kind, x, z, yaw] of kinds) {
    const c = ctx.make.npc(kind); c.group.position.set(x, 0, z); c.group.scale.setScalar(1.7); c.faceDir(Math.sin(yaw) * -1, 1); scene.add(c.group); H.watchers.push({ c, ph: rng() * 6, cheer: 0 });
    scene.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.7, 8), mat(0x6a4a30), { cast: false, pos: [x, 0.35, z - 0.05] }));
  }
  // lichtjes
  const l1 = new THREE.PointLight(0xffb060, 1.4, 22, 1.4); l1.position.set(-10, 7, -4); scene.add(l1);
  const l2 = new THREE.PointLight(0xa070ff, 1.2, 24, 1.4); l2.position.set(10, 9, 3); scene.add(l2);
  H.lights = [l1, l2];
  H.cheer = (secs = 2) => { for (const w of H.watchers) w.cheer = secs * (0.7 + Math.random() * 0.6); };
  H.update = (dt, activeSide) => {
    H.t += dt; const t = H.t;
    for (let i = 0; i < H.flames.length; i++) { const f = H.flames[i].userData; f.flame.scale.set(1 + Math.sin(t * 11 + i) * 0.15, 1 + Math.sin(t * 17 + i * 2) * 0.25, 1); if (f.light.intensity > 0) f.light.intensity = 1.4 + Math.sin(t * 9 + i) * 0.3; }
    H.banners.forEach((b) => P.animateBanner(b, t));
    H.lights[0].intensity = 1.3 + Math.sin(t * 1.7) * 0.2;
    // draak draait mee naar de speler aan de beurt
    const want = activeSide === 0 ? 0.6 : activeSide === 1 ? 1.3 : 1.0;
    H.dragonYaw = damp(H.dragonYaw, want, 2.2, dt); H.dragon.group.rotation.y = H.dragonYaw; H.dragon.update(dt);
    for (const w of H.watchers) { w.cheer = Math.max(0, w.cheer - dt); w.c.pose = w.cheer > 0 ? 'cheer' : 'idle'; w.c.update(dt); }
    // vonkjes uit de toortsen
    H.ember += dt * 5; while (H.ember > 1) { H.ember -= 1; const f = H.flames[Math.floor(Math.random() * 2)]; fx.particles.emit(f.position.x + (Math.random() - 0.5) * 0.3, f.position.y + 2.1, f.position.z + 0.2, (Math.random() - 0.5) * 0.5, 1 + Math.random(), 0, { life: 1.3, size: 0.2, color: Math.random() < 0.5 ? 0xffb040 : 0xff7a20, gravity: -0.4 }); }
  };
  return H;
}

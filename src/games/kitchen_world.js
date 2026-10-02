import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, TAU, rand } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { Character, makeNPC, Animal } from '../engine/chars.js';
import { ingMesh, labelSprite, ING } from './kitchen_items.js';

// De taverne-keuken van 'De Gouden Griffioen': indeling, meubilair en decor.
// x: links -> rechts, z: achter (-) -> voor (+). Het serveerluik zit in de achterwand, daarachter de eetzaal.

export const CY = 1.02;                       // hoogte aanrechtblad
export const ROOM = { x0: -9, x1: 9.3, zBack: -5, zFront: 4.7 };
export const L = {
  crates: [['ui', -8.4, -2.9], ['wortel', -8.4, -1.4], ['vlees', -8.4, 0.1], ['brood', -8.4, 1.6], ['kaas', -8.4, 3.1]],
  boards: [[-6.3, -4.4], [-3.5, -4.4]],
  slots: [[-4.9, -4.4], [-2.2, -4.4], [0, -3.6], [0, -1.9], [0, -0.2], [0, 1.4], [2.3, -4.4], [5.5, -4.4]],
  cookers: [['pot', 8.2, -1.8], ['pot', 8.2, 0.4], ['pan', 8.2, 2.6]],
  plates: [6.8, -4.4],
  hatch: [3.95, -4.4],
  trash: [8.35, -3.5],
  seats: [2.3, 4.2, 6.1, 8.0].map((x) => ({ x, z: -6.8 })),
  door: [9.0, -8.3],
};

export function buildWorld(ctx) {
  const { scene } = ctx;
  const anim = [];
  const obstacles = [];
  const add = (o) => { scene.add(o); return o; };
  const B = (w, h, d, material, x, y, z, o = {}) => add(mesh(new THREE.BoxGeometry(w, h, d), material, { pos: [x, y, z], ...o }));
  const Cy = (rt, rb, h, material, x, y, z, o = {}, n = 12) => add(mesh(new THREE.CylinderGeometry(rt, rb, h, n), material, { pos: [x, y, z], ...o }));
  const plank = (rx, ry, hex, o = {}) => new THREE.MeshStandardMaterial({ map: tex.planks(rx, ry, hex), roughness: 0.9, ...o });
  const plaster = (rx, ry, hex) => new THREE.MeshStandardMaterial({ map: tex.plaster(rx, ry, hex), roughness: 0.95, flatShading: true });
  const woodD = mat(0x4a3220), woodM = mat(0x7a4f2c), iron = mat(0x2b2d33, { metalness: 0.6, roughness: 0.45 }), ironL = mat(0x5a5e70, { metalness: 0.5, roughness: 0.45 });
  const copper = mat(0xc87533, { metalness: 0.75, roughness: 0.35, flatShading: false });
  const obs = (x0, x1, z0, z1) => obstacles.push({ x0, x1, z0, z1 });

  // ================= vloer, wanden =================
  add(mesh(new THREE.PlaneGeometry(18.6, 9.9), new THREE.MeshStandardMaterial({ map: tex.planks(9, 5, '#9b6a40'), roughness: 1 }), { cast: false, pos: [0.15, 0, -0.15], rot: [-Math.PI / 2, 0, 0] }));
  B(19.2, 0.8, 10.5, mat(0x3a2616), 0.15, -0.41, -0.1, { cast: false });
  B(19.2, 0.3, 0.3, woodD, 0.15, 0.15, 5.0, { cast: false });
  // kleed
  add(mesh(new THREE.PlaneGeometry(4.6, 2.4), new THREE.MeshStandardMaterial({ map: tex.carpet(3, 1.6), roughness: 1, color: 0xd8b0a0 }), { cast: false, pos: [4.6, 0.012, 1.0], rot: [-Math.PI / 2, 0, 0] }));
  add(mesh(new THREE.PlaneGeometry(3.4, 1.9), new THREE.MeshStandardMaterial({ map: tex.carpet(2, 1.2), roughness: 1, color: 0xa8b0c8 }), { cast: false, pos: [-4.6, 0.012, 1.3], rot: [-Math.PI / 2, 0, 0] }));

  // achterwand links (hoog, vakwerk)
  B(10.8, 4.8, 0.5, plaster(5, 2, '#ead8ae'), -4.0, 2.4, -5.25);
  for (const [y, h] of [[0.18, 0.36], [2.55, 0.22], [4.7, 0.3]]) B(10.9, h, 0.14, woodD, -4.0, y, -4.97, { cast: false });
  for (const x of [-9.25, -6.5, -3.8, -1.1, 1.3]) B(0.26, 4.8, 0.2, woodD, x, 2.4, -4.95, { cast: false });
  for (const [x, s] of [[-7.9, 1], [-5.15, -1], [-2.45, 1]]) { const m = B(0.14, 2.45, 0.1, woodD, x, 3.6, -4.95, { cast: false }); m.rotation.z = s * 0.6; }
  // linkerwand
  B(0.4, 4.8, 10.5, plaster(5, 2, '#e4cfa2'), -9.2, 2.4, -0.1);
  for (const [y, h] of [[0.18, 0.36], [2.55, 0.22], [4.7, 0.3]]) B(0.14, h, 10.4, woodD, -8.97, y, -0.1, { cast: false });
  for (const z of [-5, -2, 1, 4, 5.0]) B(0.2, 4.8, 0.26, woodD, -8.95, 2.4, z, { cast: false });
  // rechterwand
  B(0.4, 4.8, 10.5, plaster(5, 2, '#e4cfa2'), 9.5, 2.4, -0.1);
  for (const [y, h] of [[0.18, 0.36], [4.7, 0.3]]) B(0.14, h, 10.4, woodD, 9.28, y, -0.1, { cast: false });
  // raam in de linkerwand (met avondlucht)
  {
    const sky = canvasTex(128, 192, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#16224a'); gr.addColorStop(1, '#6a5a9a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(80, 50, 20, 0, 7); g.fill(); g.fillStyle = '#16224a'; g.beginPath(); g.arc(90, 44, 18, 0, 7); g.fill();
      g.fillStyle = '#fff'; for (let i = 0; i < 18; i++) g.fillRect((i * 53) % w, (i * 37) % (h * 0.6), 2, 2);
      g.fillStyle = '#0c0f22'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, 150); g.lineTo(30, 130); g.lineTo(60, 150); g.lineTo(100, 120); g.lineTo(128, 145); g.lineTo(128, h); g.fill();
    });
    const win = new THREE.Group(); win.position.set(-8.76, 2.9, 0.9); add(win);
    win.add(mesh(new THREE.PlaneGeometry(1.9, 2.5), new THREE.MeshBasicMaterial({ map: sky }), { cast: false, rot: [0, Math.PI / 2, 0] }));
    for (const [w, h, y, z] of [[0.14, 2.7, 0, 0], [0.14, 0.12, 0, 0]]) win.add(mesh(new THREE.BoxGeometry(w, h, 2.1), woodD, { cast: false, pos: [0.02, y, z] }));
    win.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 2.1), woodD, { cast: false, pos: [0.02, 1.3, 0] }));
    win.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 2.1), woodD, { cast: false, pos: [0.02, -1.3, 0] }));
    win.add(mesh(new THREE.BoxGeometry(0.16, 2.6, 0.1), woodD, { cast: false, pos: [0.02, 0, 0] }));
    for (const sz of [-1, 1]) win.add(mesh(new THREE.BoxGeometry(0.16, 2.6, 0.12), woodD, { cast: false, pos: [0.02, 0, sz * 1.0] }));
    for (const sz of [-1, 1]) win.add(mesh(new THREE.BoxGeometry(0.1, 2.3, 0.55), mat(0xa8323a, { side: THREE.DoubleSide }), { cast: false, pos: [0.12, -0.05, sz * 1.15] }));
  }

  // ================= aanrechten =================
  function counter(x0, x1, z0, z1, doors = 'z') {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B(w, 0.92, d, plank(Math.max(1, w / 1.6), 0.6, '#8a5a32'), cx, 0.46, cz);
    B(w + 0.1, 0.1, d + 0.1, plank(Math.max(1, w / 2.2), 1, '#d2a468'), cx, 0.97, cz);
    const N = Math.max(1, Math.round((doors === 'z' ? w : d) / 1.5));
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      if (doors === 'z') { const x = x0 + u * w; B(0.05, 0.8, 0.04, woodD, x, 0.46, z1 + 0.02, { cast: false }); if (i < N) B(0.08, 0.08, 0.04, mat(0xe8c24a, { metalness: 0.6 }), x + w / N / 2 + 0.2, 0.62, z1 + 0.04, { cast: false }); }
      else { const z = z0 + u * d; for (const sx of [x0, x1]) B(0.04, 0.8, 0.05, woodD, sx + (sx === x0 ? -0.02 : 0.02), 0.46, z, { cast: false }); }
    }
    obs(x0, x1, z0, z1);
  }
  counter(-7.6, -1.4, -5.0, -3.8);       // werkblad links
  counter(1.4, 7.4, -5.0, -3.8);          // werkblad rechts (bij het luik)
  counter(-0.65, 0.65, -5.0, 3.0, 'x');   // doorgeef-aanrecht in het midden
  // hoek links-achter: kast met kruiken
  B(1.4, 1.6, 1.3, plank(1, 1, '#7a4f2c'), -8.3, 0.8, -4.35);
  obs(-9.0, -7.6, -5.0, -3.65);
  for (const [x, y] of [[-8.6, 1.9], [-8.1, 1.9]]) Cy(0.22, 0.28, 0.5, mat([0xb85a3a, 0x5a7a9a][x < -8.4 ? 0 : 1]), x, y, -4.35, {}, 10);
  // ================= het bar-gedeelte naar de eetzaal =================
  B(8.0, 1.35, 0.35, plank(4, 0.8, '#6a4326'), 5.3, 0.675, -5.2);
  B(8.2, 0.12, 0.9, plank(4, 1, '#c9955a'), 5.3, 1.41, -5.45);
  for (const x of [1.3, 9.3]) B(0.34, 4.75, 0.34, woodD, x, 2.38, -5.2);
  for (const [x, s] of [[1.75, 1], [8.85, -1]]) { const c = B(0.5, 2.5, 0.14, mat(0xa8323a, { side: THREE.DoubleSide }), x, 3.1, -5.0, { cast: false }); c.rotation.z = s * 0.08; B(0.1, 0.1, 0.1, mat(0xe8c24a), x + s * 0.2, 2.0, -4.95, { cast: false }); }

  // uithangbord (op de achterwand, boven het doorgeef-aanrecht)
  {
    const sign = new THREE.Group(); sign.position.set(0.0, 3.75, -4.86); add(sign);
    sign.add(mesh(new THREE.BoxGeometry(2.5, 0.85, 0.1), new THREE.MeshStandardMaterial({ map: tex.sign('De Gouden Griffioen', { w: 512, h: 170, size: 52, bg: '#4a2a14', fg: '#ffd35a' }) }), { pos: [0, 0, 0] }));
    for (const x of [-1.0, 1.0]) sign.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), iron, { pos: [x, 0.65, 0], cast: false }));
    B(2.7, 0.07, 0.07, iron, 0.0, 4.4, -4.86, { cast: false });
    anim.push((t) => { sign.rotation.z = Math.sin(t * 0.9) * 0.02; });
  }

  // ================= hangende pannen, kruiden, worsten =================
  {
    const rodY = 3.55, rodZ = -4.62;
    B(4.4, 0.06, 0.06, iron, -5.5, rodY, rodZ, { cast: false });
    for (const x of [-7.6, -3.4]) B(0.06, 0.06, 0.4, iron, x, rodY, rodZ - 0.2, { cast: false });
    const hang = (x, build, ph) => { const g = new THREE.Group(); g.position.set(x, rodY, rodZ); add(g); build(g); anim.push((t) => { g.rotation.z = Math.sin(t * 0.9 + ph) * 0.045; }); return g; };
    const pan = (r) => (g) => {
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), iron, { pos: [0, -0.15, 0] }));
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.5, 0.05), iron, { pos: [0, -0.55, 0] }));
      const d = mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.1, 14), copper, { pos: [0, -0.8 - r, 0], rot: [Math.PI / 2, 0, 0] }); g.add(d);
      g.add(mesh(new THREE.TorusGeometry(r * 0.97, 0.025, 5, 14), copper, { pos: [0, -0.8 - r, 0.05] }));
    };
    hang(-7.2, pan(0.42), 0); hang(-6.2, pan(0.34), 1.3);
    hang(-5.2, (g) => { // ketel
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4), iron, { pos: [0, -0.17, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.4, 10, 1, true), copper, { pos: [0, -0.62, 0] }));
      g.add(mesh(new THREE.TorusGeometry(0.34, 0.03, 5, 12), copper, { pos: [0, -0.42, 0], rot: [Math.PI / 2, 0, 0] }));
    }, 2.1);
    hang(-4.5, (g) => { // pollepel
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), iron, { pos: [0, -0.45, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.15, 8, 6, 0, TAU, 0, Math.PI / 2), copper, { pos: [0, -1.0, 0], rot: [Math.PI, 0, 0] }));
    }, 0.7);
    hang(-3.9, (g) => { // schuimspaan
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), mat(0x6b4a2e), { pos: [0, -0.4, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10), iron, { pos: [0, -0.9, 0], rot: [Math.PI / 2, 0, 0] }));
    }, 3.3);
    // knoflookslinger + worstjes + kruiden
    hang(-7.55, (g) => { for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry(0.13 - i * 0.008, 7, 5), mat(0xf3ecd8), { pos: [(i % 2) * 0.05, -0.2 - i * 0.2, 0], scale: [1, 1.1, 1] })); }, 1.9);
    hang(-3.45, (g) => { for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.3, 3, 6), mat(0xa8483a), { pos: [(i % 2) * 0.04, -0.3 - i * 0.42, 0], rot: [0, 0, 0.1 * (i % 2 ? 1 : -1)] })); }, 0.4);
    for (const [x, c] of [[-5.9, 0x4caa3a], [-4.9, 0x8aaa3a]]) { B(0.02, 0.3, 0.02, iron, x, 3.35, -4.9, { cast: false }); add(mesh(new THREE.ConeGeometry(0.17, 0.6, 6), mat(c), { pos: [x, 3.0, -4.88], rot: [Math.PI, 0, 0] })); }
    // plankje met potten
    B(4.2, 0.08, 0.4, woodM, -5.3, 2.15, -4.78);
    for (const sx of [-2.0, 0, 2.0]) B(0.08, 0.3, 0.3, woodD, -5.3 + sx, 2.0, -4.8, { cast: false });
    const jarCols = [0xd24a3a, 0x58a84a, 0xe8b030, 0x6a8ad8, 0xb85aa8];
    for (let i = 0; i < 12; i++) {
      const x = -7.2 + i * 0.35, h = 0.25 + (i % 3) * 0.08;
      Cy(0.11, 0.11, h, new THREE.MeshStandardMaterial({ color: jarCols[i % 5], roughness: 0.35, transparent: true, opacity: 0.88 }), x, 2.19 + h / 2, -4.76, { cast: false }, 8);
      Cy(0.12, 0.12, 0.05, woodM, x, 2.2 + h, -4.76, { cast: false }, 8);
    }
    // wandkast rechts van de pannen
    B(1.8, 1.3, 0.5, plank(1, 1, '#7a4f2c'), -2.3, 3.0, -4.75);
    B(0.04, 1.2, 0.04, woodD, -2.3, 3.0, -4.49, { cast: false });
    for (const sx of [-0.45, 0.45]) B(0.1, 0.1, 0.05, mat(0xe8c24a, { metalness: 0.6 }), -2.3 + sx * 0.3, 3.0, -4.47, { cast: false });
  }
  // planken met potten links
  B(0.5, 0.08, 4.4, woodM, -8.7, 2.3, -2.5);
  B(0.5, 0.08, 4.4, woodM, -8.7, 3.4, -2.5);
  for (let i = 0; i < 9; i++) { const z = -4.2 + i * 0.5, h = 0.22 + (i % 3) * 0.1; Cy(0.12, 0.12, h, mat([0xd9b070, 0x9ab0c8, 0xc86a4a][i % 3]), -8.7, 2.34 + h / 2, z, { cast: false }, 8); }
  for (let i = 0; i < 5; i++) { const z = -4.0 + i * 0.85; add(mesh(new THREE.SphereGeometry(0.2, 8, 6, 0, TAU, Math.PI / 2, Math.PI / 2), mat([0xe8e0d0, 0x5a7a9a][i % 2], { side: THREE.DoubleSide }), { cast: false, pos: [-8.7, 3.52, z] })); }

  // ================= krat-rij links =================
  const crates = [];
  for (const [kind, x, z] of L.crates) {
    const g = new THREE.Group(); g.position.set(x, 0, z); add(g);
    g.add(mesh(new THREE.BoxGeometry(1.15, 0.75, 1.4), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#b98a54'), roughness: 0.9 }), { pos: [0, 0.375, 0] }));
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), woodD, { pos: [sx * 0.55, 0.4, sz * 0.67] }));
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.08, 1.45), woodD, { pos: [0, 0.75, 0], scale: [1, 1, 1] }));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.04, 1.25), mat(0x24160c), { cast: false, pos: [0, 0.77, 0] }));
    // voorraad
    const pile = new THREE.Group(); pile.position.y = 0.78; g.add(pile);
    const spots = [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0], [0.2, 0], [-0.2, 0.45], [0.2, 0.45], [0, -0.2], [0, 0.22]];
    spots.forEach(([sx, sz], i) => {
      const m = ingMesh(kind, false); m.position.set(sx, (i > 5 ? 0.18 : 0), sz); m.rotation.y = i * 1.3;
      m.scale.setScalar(kind === 'brood' ? 0.9 : kind === 'kaas' ? 0.95 : 0.85);
      pile.add(m);
    });
    const lab = labelSprite(ING[kind].icon, ING[kind].name, 1.05); lab.position.set(x + 0.45, 2.0, z); add(lab);
    anim.push((t) => { lab.position.y = 2.0 + Math.sin(t * 2 + z) * 0.05; });
    crates.push({ kind, x, z, group: g });
  }
  obs(-9.0, -7.75, -3.55, 3.8);

  // ================= hakplanken =================
  const boards = L.boards.map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, CY, z); add(g);
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.1, 0.95), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#e0bb82'), roughness: 0.8 }), { pos: [0, 0.05, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), woodM, { pos: [0.55, 0.06, -0.3], rot: [Math.PI / 2, 0, 0], cast: false }));
    const knife = new THREE.Group(); knife.position.set(-0.55, 0.14, 0.2); g.add(knife);
    knife.add(mesh(new THREE.BoxGeometry(0.5, 0.025, 0.14), mat(0xdfe4ee, { metalness: 0.8, roughness: 0.2 }), { pos: [0.22, 0, 0] }));
    knife.add(mesh(new THREE.BoxGeometry(0.25, 0.05, 0.08), mat(0x4a2e17), { pos: [-0.14, 0.01, 0] }));
    const anchor = new THREE.Group(); anchor.position.y = 0.1; g.add(anchor);
    return { x, z, group: g, knife, anchor };
  });

  // ================= losse plekken op het aanrecht =================
  const slots = L.slots.map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, CY, z); add(g);
    g.add(mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.2, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.006, 0], rot: [-Math.PI / 2, 0, 0] }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.95, 0.95)), new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.55 }));
    edge.rotation.x = -Math.PI / 2; edge.position.y = 0.012; g.add(edge);
    const anchor = new THREE.Group(); g.add(anchor);
    return { x, z, group: g, anchor };
  });
  // doorgeef-markering (pijltjes op het middenaanrecht)
  for (const z of [-2.75, -1.05, 0.65]) add(mesh(new THREE.ConeGeometry(0.16, 0.3, 3), new THREE.MeshBasicMaterial({ color: 0xffd23f }), { cast: false, receive: false, pos: [0, CY + 0.02, z], rot: [-Math.PI / 2, 0, -Math.PI / 2] }));

  { const dl = labelSprite('🤝', 'Doorgeven', 1.15); dl.position.set(0, 1.85, 3.4); add(dl); anim.push((t) => { dl.position.y = 1.85 + Math.sin(t * 2 + 3) * 0.05; }); }
  // ================= serveerluik, bel, bordenstapel =================
  const [hx, hz] = L.hatch;
  const hatchG = new THREE.Group(); hatchG.position.set(hx, CY, hz); add(hatchG);
  const hatchTile = mesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshBasicMaterial({ color: 0x6bff8a, transparent: true, opacity: 0.35, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.008, 0], rot: [-Math.PI / 2, 0, 0] });
  hatchG.add(hatchTile);
  const bell = new THREE.Group(); bell.position.set(0.9, 0, -0.1); hatchG.add(bell);
  bell.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 12), mat(0x8a6a2a, { metalness: 0.5 }), { pos: [0, 0.03, 0] }));
  bell.add(mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, TAU, 0, Math.PI / 2), mat(0xf2c230, { metalness: 0.8, roughness: 0.3, flatShading: false }), { pos: [0, 0.06, 0] }));
  bell.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0xf2c230, { metalness: 0.8 }), { pos: [0, 0.31, 0] }));
  const hl = labelSprite('🔔', 'Serveren', 1.35); hl.position.set(hx, 1.95, hz - 0.2); add(hl);
  anim.push((t) => { hl.position.y = 1.95 + Math.sin(t * 2.2) * 0.06; hatchTile.material.opacity = 0.28 + Math.sin(t * 3) * 0.08; });

  const [px, pz] = L.plates;
  const plateG = new THREE.Group(); plateG.position.set(px, CY, pz); add(plateG);
  const plateDiscs = [];
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Group(); d.position.y = i * 0.075; plateG.add(d);
    d.add(mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.07, 16), mat(0xf4f1e8, { roughness: 0.4, flatShading: false }), { cast: i === 0 }));
    d.add(mesh(new THREE.TorusGeometry(0.45, 0.025, 5, 16), mat(0x4a78c8), { cast: false, pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0] }));
    plateDiscs.push(d);
  }
  const pl = labelSprite('🍽️', 'Borden', 1.3); pl.position.set(px, 1.95, pz - 0.1); add(pl);
  anim.push((t) => { pl.position.y = 1.95 + Math.sin(t * 2 + 1) * 0.05; });
  const plates = { x: px, z: pz, group: plateG, setCount(n) { plateDiscs.forEach((d, i) => { d.visible = i < n; }); } };

  // prullenbak
  const [tx, tz] = L.trash;
  const trashG = new THREE.Group(); trashG.position.set(tx, 0, tz); add(trashG);
  trashG.add(mesh(new THREE.CylinderGeometry(0.46, 0.38, 0.9, 10), mat(0x5a5a64, { metalness: 0.5, roughness: 0.5 }), { pos: [0, 0.45, 0] }));
  for (const y of [0.2, 0.7]) trashG.add(mesh(new THREE.TorusGeometry(0.44, 0.03, 5, 12), mat(0x333340), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
  trashG.add(mesh(new THREE.CircleGeometry(0.4, 12), mat(0x0c0a08), { cast: false, pos: [0, 0.905, 0], rot: [-Math.PI / 2, 0, 0] }));
  const lid = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 12), mat(0x6a6a74, { metalness: 0.5 }), { pos: [0.55, 0.46, 0], rot: [0, 0, Math.PI / 2 - 0.2] }); trashG.add(lid);
  obs(tx - 0.45, tx + 0.45, tz - 0.45, tz + 0.45);
  const tl = labelSprite('🗑️', 'Weggooien', 1.25); tl.position.set(tx - 0.3, 1.9, tz + 0.2); add(tl);
  anim.push((t) => { tl.position.y = 1.9 + Math.sin(t * 2 + 2) * 0.05; });

  // ================= het fornuis / haard =================
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(2, 2), roughness: 1, flatShading: true });
  const range = new THREE.Group(); add(range);
  B(1.8, 1.0, 6.9, stoneM, 8.4, 0.5, 0.35);
  B(1.9, 0.07, 7.0, mat(0x7a7a84, { metalness: 0.4, roughness: 0.6 }), 8.4, 1.035, 0.35, { cast: false });
  obs(7.5, 9.3, -3.1, 3.8);
  B(0.9, 1.5, 6.2, new THREE.MeshStandardMaterial({ map: tex.bricks(3, 0.6), roughness: 1, flatShading: true }), 8.85, 4.0, 0.35);
  B(0.9, 2.2, 1.6, new THREE.MeshStandardMaterial({ map: tex.bricks(1, 1), roughness: 1, flatShading: true }), 8.85, 5.6, 0.35);
  B(1.3, 0.3, 6.5, new THREE.MeshStandardMaterial({ map: tex.stone(3, 1), roughness: 1 }), 8.65, 3.2, 0.35);
  const fireLight = new THREE.PointLight(0xff9a40, 3.2, 15, 1.6); fireLight.position.set(7.4, 1.0, 0.4); add(fireLight);
  const flames = [];
  const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 40, 2, 32, 40, 32); gr.addColorStop(0, 'rgba(255,240,150,1)'); gr.addColorStop(0.4, 'rgba(255,140,30,.9)'); gr.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const [, , z] of L.cookers) {
    add(mesh(new THREE.PlaneGeometry(1.5, 0.7), new THREE.MeshBasicMaterial({ color: 0x050302 }), { cast: false, receive: false, pos: [7.595, 0.47, z], rot: [0, -Math.PI / 2, 0] }));
    add(mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }), { cast: false, receive: false, pos: [7.585, 0.45, z], rot: [0, -Math.PI / 2, 0] }));
    for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.ConeGeometry(0.16 - k * 0.02, 0.5 - k * 0.07, 6), new THREE.MeshBasicMaterial({ color: [0xff7a1a, 0xffb02e, 0xfff0a0][k] }), { cast: false, receive: false, pos: [7.85, 0.25, z + (k - 1) * 0.3] });
      f.userData.dyn = true; add(f); flames.push({ f, ph: Math.random() * 6, base: f.position.y });
    }
    for (let k = 0; k < 4; k++) add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 5), mat(0x4a3220), { cast: false, pos: [7.9, 0.1, z - 0.4 + k * 0.28], rot: [Math.PI / 2, 0, 0.2 * k] }));
  }
  anim.push((t) => {
    for (const fl of flames) { const s = 1 + Math.sin(t * 13 + fl.ph) * 0.18 + Math.sin(t * 7.3 + fl.ph) * 0.1; fl.f.scale.set(1, s, 1); fl.f.rotation.y = t * 2 + fl.ph; }
    fireLight.intensity = 3.2 * (0.86 + Math.sin(t * 11) * 0.08 + Math.sin(t * 4.1) * 0.05 + Math.random() * 0.04);
  });
  // brandhout
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3 - r; i++) Cy(0.16, 0.16, 1.1, mat(0x6a4a2c), 8.35, 0.17 + r * 0.3, 4.15 + (i - (2 - r) / 2) * 0.32 + 0.16, { rot: [0, 0, Math.PI / 2] }, 7);
  obs(7.7, 9.3, 3.85, 4.7);

  // ---- kookpotten en braadpan (de visuele delen; logica in kitchen.js) ----
  const potM = mat(0xb87333, { metalness: 0.7, roughness: 0.35, flatShading: false });
  const cookers = L.cookers.map(([kind, x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 1.07, z); add(g);
    const liquidMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, roughness: 0.35 });
    let liquid;
    if (kind === 'pot') {
      g.add(mesh(new THREE.CylinderGeometry(0.66, 0.52, 0.7, 16), potM, { pos: [0, 0.35, 0] }));
      g.add(mesh(new THREE.TorusGeometry(0.66, 0.07, 6, 18), potM, { pos: [0, 0.7, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
      for (const sz of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.16, 0.035, 5, 10), ironL, { pos: [0, 0.55, sz * 0.7], rot: [0, 0, 0], cast: false }));
      liquid = mesh(new THREE.CircleGeometry(0.6, 16), liquidMat, { cast: false, receive: false, pos: [0, 0.6, 0], rot: [-Math.PI / 2, 0, 0] });
      for (const [sx, sz] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 5), ironL, { pos: [sx, -0.03, sz], cast: false }));
    } else {
      g.add(mesh(new THREE.CylinderGeometry(0.84, 0.74, 0.17, 18), ironL, { pos: [0, 0.09, 0] }));
      g.add(mesh(new THREE.TorusGeometry(0.84, 0.05, 5, 18), ironL, { pos: [0, 0.17, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.09, 0.2), mat(0x3a2a1e), { pos: [-1.3, 0.14, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6), ironL, { pos: [-1.9, 0.14, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
      liquid = mesh(new THREE.CircleGeometry(0.78, 18), liquidMat, { cast: false, receive: false, pos: [0, 0.172, 0], rot: [-Math.PI / 2, 0, 0] });
    }
    g.add(liquid);
    const content = new THREE.Group(); content.position.y = kind === 'pot' ? 0.62 : 0.18; g.add(content);
    // vuur wanneer het aanbrandt
    const fire = new THREE.Group(); fire.visible = false; fire.position.y = kind === 'pot' ? 0.7 : 0.2; g.add(fire);
    const ff = [];
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU, r = k === 4 ? 0 : 0.35;
      const c = mesh(new THREE.ConeGeometry(0.22 - (k === 4 ? 0 : 0.03), 0.8 + (k === 4 ? 0.3 : 0), 6), new THREE.MeshBasicMaterial({ color: k === 4 ? 0xffd040 : k % 2 ? 0xff7a1a : 0xff4a10, transparent: true, opacity: 0.92 }), { cast: false, receive: false, pos: [Math.cos(a) * r, 0.4, Math.sin(a) * r] });
      fire.add(c); ff.push({ c, ph: k * 1.3 });
    }
    return { kind, x, z, group: g, liquid, liquidMat, content, fire, fireParts: ff, baseY: 1.07 };
  });

  // ================= eetzaal achter het luik =================
  const D = { z0: -14.2 };
  B(19.4, 0.5, 9.2, plank(10, 4, '#a8733f'), 0.15, -0.26, -9.6, { cast: false });
  B(19.4, 6.0, 0.5, plaster(8, 2, '#e6d2a4'), 0.15, 3.0, -14.2);
  for (const x of [-9, -5, -1, 3, 7, 9.5]) B(0.3, 6, 0.3, woodD, x, 3, -13.9, { cast: false });
  for (const y of [0.3, 3.2, 5.9]) B(19.4, 0.3, 0.3, woodD, 0.15, y, -13.9, { cast: false });
  B(0.4, 6.0, 9.2, plaster(4, 2, '#dcc596'), 9.7, 3.0, -9.6);
  B(0.4, 6.0, 9.2, plaster(4, 2, '#dcc596'), -9.4, 3.0, -9.6);
  // loper
  add(mesh(new THREE.PlaneGeometry(2.2, 8.4), new THREE.MeshStandardMaterial({ map: tex.carpet(1.2, 5), roughness: 1 }), { cast: false, pos: [5.2, 0.006, -9.2], rot: [-Math.PI / 2, 0, 0] }));
  // ramen met nachtlucht
  {
    const sky = canvasTex(128, 192, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#101a44'); gr.addColorStop(1, '#4a4a8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; for (let i = 0; i < 22; i++) g.fillRect((i * 47 + 9) % w, (i * 31) % (h * 0.7), 2, 2);
      g.fillStyle = '#ffeaa0'; g.beginPath(); g.arc(40, 56, 16, 0, 7); g.fill();
    });
    for (const x of [-4, 1.3, 7.2]) {
      const win = new THREE.Group(); win.position.set(x, 3.0, -13.9); add(win);
      win.add(mesh(new THREE.PlaneGeometry(1.7, 2.6), new THREE.MeshBasicMaterial({ map: sky }), { cast: false, pos: [0, 0, 0.0] }));
      win.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 12, 1, false, 0, Math.PI), woodD, { cast: false, pos: [0, 1.3, 0.04], rot: [Math.PI / 2, 0, Math.PI / 2] }));
      win.add(mesh(new THREE.BoxGeometry(1.9, 0.12, 0.14), woodD, { cast: false, pos: [0, -1.35, 0.05] }));
      win.add(mesh(new THREE.BoxGeometry(0.1, 2.7, 0.12), woodD, { cast: false, pos: [0, 0, 0.05] }));
      win.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.12), woodD, { cast: false, pos: [0, 0.1, 0.05] }));
      for (const sx of [-1, 1]) win.add(mesh(new THREE.BoxGeometry(0.12, 2.7, 0.14), woodD, { cast: false, pos: [sx * 0.9, 0, 0.05] }));
    }
    // banier met griffioen
    const ban = P.banner(0x9a1f2a, 2.8, 1.1); ban.position.set(-1.5, 2.2, -13.6); ban.rotation.y = 0; add(ban);
    anim.push((t) => P.animateBanner(ban, t));
  }
  // tafels en krukken
  const tableM = plank(1, 1, '#8a5a32');
  function table(x, z) {
    Cy(1.0, 1.0, 0.1, plank(1, 1, '#b07a42'), x, 1.0, z, {}, 16);
    Cy(0.18, 0.28, 0.95, woodM, x, 0.5, z, {}, 8);
    Cy(0.6, 0.6, 0.06, woodM, x, 0.03, z, { cast: false }, 10);
    const cdl = Cy(0.05, 0.05, 0.22, mat(0xf4ecd0), x - 0.3, 1.16, z + 0.1, { cast: false }, 6);
    const fl = add(mesh(new THREE.ConeGeometry(0.045, 0.14, 5), new THREE.MeshBasicMaterial({ color: 0xffc040 }), { cast: false, receive: false, pos: [x - 0.3, 1.34, z + 0.1] })); fl.userData.dyn = true;
    anim.push((t) => { fl.scale.y = 1 + Math.sin(t * 15 + x) * 0.2; });
    for (let i = 0; i < 2; i++) Cy(0.08, 0.07, 0.16, mat(0xb0b0b8, { metalness: 0.6 }), x + 0.3 + i * 0.25, 1.13, z - 0.2 + i * 0.3, { cast: false }, 8);
  }
  function stool(x, z, r = 0) { Cy(0.32, 0.28, 0.1, woodM, x, 0.45, z, {}, 8); for (const a of [0, 2.1, 4.2]) Cy(0.04, 0.04, 0.45, woodD, x + Math.cos(a + r) * 0.2, 0.22, z + Math.sin(a + r) * 0.2, { cast: false }, 4); }
  table(3.2, -10.2); table(7.4, -10.6); table(2.5, -12.2);
  const ambient = [];
  for (const [x, z, kind] of [[3.2, -11.6, 'farmer'], [7.4, -12.0, 'mason']]) {
    stool(x, z); stool(x - 1.5, z + 1.2, 1);
    const c = makeNPC(kind); c.group.position.set(x, 0.12, z + 0.0); c.pose = 'sit'; c.targetYaw = c.yaw = 0; add(c.group); ambient.push(c);
  }
  stool(2.5, -13.3); stool(4.3, -12.3, 2); stool(0.9, -11.6, 3); stool(5.4, -9.0); stool(9.0 - 0.6, -10.0, 1);
  // kroonluchter
  {
    const ch = new THREE.Group(); ch.position.set(5.0, 4.9, -9.2); add(ch);
    ch.add(mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 20), iron, { rot: [Math.PI / 2, 0, 0] }));
    ch.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 4), iron, { pos: [0, 1.0, 0] }));
    const fl = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU; const cx = Math.cos(a) * 1.1, cz = Math.sin(a) * 1.1;
      ch.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 6), mat(0xf4ecd0), { cast: false, pos: [cx, 0.16, cz] }));
      const f = mesh(new THREE.ConeGeometry(0.06, 0.17, 5), new THREE.MeshBasicMaterial({ color: 0xffc040 }), { cast: false, receive: false, pos: [cx, 0.38, cz] }); ch.add(f); fl.push(f);
    }
    const cl = new THREE.PointLight(0xffc070, 2.0, 16, 1.4); cl.position.set(0, -0.3, 0); ch.add(cl);
    anim.push((t) => { ch.rotation.y = t * 0.2; ch.rotation.z = Math.sin(t * 0.7) * 0.03; fl.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 14 + i * 2) * 0.2; }); cl.intensity = 2.0 * (0.9 + Math.sin(t * 9) * 0.06 + Math.random() * 0.04); });
  }
  // deur (rechts, daar komen gasten binnen)
  { const d = P.door(1.5, 2.6, 0x6b4226); d.position.set(9.45, 0, L.door[1]); d.rotation.y = -Math.PI / 2; add(d); const leaf = d.userData.leaf; leaf.rotation.y = 1.1; }
  B(0.5, 0.2, 2.0, woodD, 9.35, 2.8, L.door[1], { cast: false });
  // kip in de eetzaal
  const chicken = new Animal('chicken'); chicken.group.position.set(1.0, 0, -8.2); chicken.group.scale.setScalar(1.3); add(chicken.group);
  let chickT = 0, chickGoal = [1.5, -8.2];
  anim.push((t, dt) => {
    chickT -= dt;
    const cp = chicken.group.position;
    if (chickT <= 0) { chickT = rand(1.5, 4.5); chickGoal = Math.random() < 0.4 ? [cp.x, cp.z] : [rand(-1, 9), rand(-12, -6.8)]; }
    const dx = chickGoal[0] - cp.x, dz = chickGoal[1] - cp.z, d = Math.hypot(dx, dz);
    if (d > 0.15) { cp.x += dx / d * 1.1 * dt; cp.z += dz / d * 1.1 * dt; chicken.targetYaw = Math.atan2(dx, dz); chicken.speed = 1; } else chicken.speed = 0;
    chicken.update(dt);
  });

  // gordijn-licht en stof in de lucht
  // ---- algemeen geanimeerd ----
  function update(t, dt) { for (const f of anim) f(t, dt); for (const c of ambient) c.update(dt); }

  // ---- samenvoegen van statisch decor ----
  for (const c of crates) mergeInto(c.group, { deep: true });
  mergeInto(scene);
  return { obstacles, crates, boards, slots, cookers, plates, hatchG, hatchPos: { x: hx, z: hz }, bell, trashG, trashLid: lid, update, fireLight, ambient };
}


// Voeg statische meshes met hetzelfde materiaal samen (minder draw calls).
export function mergeInto(parent, { skip = (m) => m.userData.dyn, deep = false } = {}) {
  parent.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const buckets = new Map(); const rel = new THREE.Matrix4();
  parent.traverse((o) => {
    if (!o.isMesh || o === parent || skip(o) || Array.isArray(o.material) || !o.visible) return;
    if (!deep && o.parent !== parent) return;
    // alleen meshes waarvan de hele keten (tot parent) niet dynamisch is
    for (let q = o.parent; q && q !== parent; q = q.parent) if (q.userData.dyn) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    let b = buckets.get(key); if (!b) { b = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, list: [] }; buckets.set(key, b); }
    b.list.push(o);
  });
  // alleen groepen die in een dynamische sub-groep zitten overslaan: Groups zonder dyn-vlag mogen mee
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const parts = [];
    let total = 0;
    for (const o of b.list) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(rel);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      parts.push(g); total += g.attributes.position.count;
    }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let off = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, b.material); m.castShadow = b.cast; m.receiveShadow = b.receive; parent.add(m);
    for (const o of b.list) { o.parent.remove(o); o.geometry.dispose && o.userData.noDispose !== true && o.geometry.dispose(); }
  }
}

// Klanten in de eetzaal
export function makeCustomerPool() {
  const specs = [
    { name: 'Ridder', make: () => makeNPC('captain', { scale: 1.1, hat: 'helmet', hatColor: 0x3a6ac8, cape: 0x3a6ac8 }) },
    { name: 'Elf', make: () => new Character({ scale: 1.0, ears: 'pointy', skin: 0xf6e4cc, shirt: 0x2f8a5a, tunic: 0x2f8a5a, pants: 0x6a5a3a, hair: 0xefe6a0, hairStyle: 'long', cape: 0x1f6a4a, eyeColor: 0x2a8a4a }) },
    { name: 'Dwerg', make: () => makeNPC('dwarf') },
    { name: 'Tovenaar', make: () => makeNPC('elder', { shirt: 0x5b2a86, tunic: 0x5b2a86, hatColor: 0x5b2a86, hatColor2: 0xffd24a }) },
    { name: 'Bard', make: () => makeNPC('bard') },
    { name: 'Boer', make: () => makeNPC('farmer') },
  ];
  return specs;
}

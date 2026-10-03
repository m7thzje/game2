import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, TAU, rand, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { Animal, makeNPC, makeHatMesh } from '../engine/chars.js';
import { S } from '../save.js';
import { groundY, isWater, onBridge } from './terrain.js';
import { JOBS, JOB_BY_ID, ARCADE, HOME, PLAZA, TIPKRAAM, BOARD, CAVE, CASTLE, POORT, ICE, SWAMP, FARM, PASTURE, BRIDGE, riverX, ARCADE_TRAIL, HERALD, HAT_SHOP, STRAAT } from './layout.js';
import { stall, tent, bench, table, mug, cart, milkCan, scarecrow, dummy, target, wheelbarrow, snowman, brazier, cabbageRows, stripedTex, floatLabel, questMark } from './build.js';

const PI = Math.PI;

// Speelhal-poster (banieren op het plein, tipkraam)
let _poster = null;
function speelhalPoster() {
  return _poster || (_poster = canvasTex(256, 384, (g, w, hh) => {
    const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#ff3d81'); gr.addColorStop(1, '#3a1170'); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#ffe14a'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, hh - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '110px serif'; g.fillText('🎮', w / 2, 120);
    g.font = 'bold 50px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#fff'; g.fillText('SPEELHAL', w / 2, 225);
    g.font = 'bold 26px Fredoka, sans-serif'; g.fillStyle = '#ffe14a'; g.fillText('Koning Klopper', w / 2, 272); g.fillText('44 duels!', w / 2, 306);
    g.font = '22px Fredoka, sans-serif'; g.fillStyle = '#fff'; g.fillText('★ ★ ★', w / 2, 346);
  }));
}

export function buildVillage(W) {
  buildPlaza(W); buildHome(W); buildBakery(W); buildTavern(W); buildWarehouse(W); buildFarm(W); buildMud(W); buildPasture(W);
  buildPier(W); buildArcadeGate(W); buildArcadeGuide(W); buildHatShop(W); buildHerald(W); buildStreetNpcs(W); buildWitch(W); buildCave(W); buildCastleYard(W); buildCastle(W); buildWall(W); buildIce(W); buildBridge(W);
  buildJobNpcs(W);
}

// ---------------------------------------------------------------- plein
function buildPlaza(W) {
  // fontein
  const f = new THREE.Group(); const st = new THREE.MeshStandardMaterial({ map: tex.stone(2, 1), roughness: 0.9 });
  f.add(mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.9, 16), st, { pos: [0, 0.45, 0] }));
  f.add(mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0x5ab4ff, emissive: 0x0b3a6a, emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.9 }), { cast: false, pos: [0, 0.82, 0] }));
  f.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 10), st, { pos: [0, 1.7, 0] }));
  f.add(mesh(new THREE.CylinderGeometry(1.5, 0.8, 0.4, 12), st, { pos: [0, 2.7, 0] }));
  f.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), glow(0x7fd8ff, 0.8), { cast: false, pos: [0, 3.1, 0] }));
  W.put(f, 0, 1, 0); W.circle(0, 1, 3.7);
  W.waterfx.push({ x: 0, y: groundY(0, 1) + 3.1, z: 1 });
  W.interact.push({ type: 'fountain', x: 0, z: 1, r: 5.6, label: 'Munt in de fontein gooien' });
  // marktkramen
  const stalls = [[-9, -3, 0.9, '#e8453c', 'apples'], [9, 7.5, -2.3, '#3a78e0', 'bread'], [-9.5, 6, 1.2, '#2f9e5b', 'fish'], [5, -9, 2.8, '#d8357f', 'apples'], [-12, -11, 0.4, '#e8a33d', 'bread']];
  for (const [x, z, yaw, c, goods] of stalls) { const s = stall(c, '#fff3d6', goods); W.put(s, x, z, yaw); W.box(x, z, 3.4, 1.8, yaw); }
  // lantaarnpalen
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; const x = Math.cos(a) * 12.6, z = Math.sin(a) * 12.6; const lp = P.lampPost(); W.put(lp, x, z, 0); W.circle(x, z, 0.3); W.glowMats.push(lp.children[1].material); W.lamps.push({ x, y: groundY(x, z) + 2.75, z, mat: lp.children[1].material }); }
  // banieren met Speelhal-poster
  for (const [x, z, yaw] of [[-5, 9, 0.3], [5, 9, -0.3], [-13, -4, 1.6], [13, -9, -1.6], [-5, -13, 0], [6, -13, 0]]) {
    const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4, 5), mat(0x4a3220), { pos: [0, 1.7, 0] }));
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.95, 0.08), new THREE.MeshStandardMaterial({ map: speelhalPoster(), roughness: 0.8 }), { pos: [0, 2.3, 0.05] }));
    W.put(g, x, z, yaw);
  }
  // banken
  for (const [x, z, yaw] of [[-6, 11, PI], [6.5, 11, PI], [11.5, -2, -PI / 2], [-12, 2, PI / 2]]) { const b = bench(); W.put(b, x, z, yaw); W.box(x, z, 1.9, 0.8, yaw); }
  // podium (Bard Bas)
  const stage = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ map: tex.planks(3, 1), roughness: 0.9 });
  stage.add(mesh(new THREE.BoxGeometry(9, 0.55, 5), wood, { pos: [0, 0.27, 0] }));
  stage.add(mesh(new THREE.BoxGeometry(9.2, 4.5, 0.3), mat(0x3a2a52), { pos: [0, 2.8, -2.4] }));
  for (const sx of [-1, 1]) { stage.add(mesh(new THREE.BoxGeometry(1.2, 4.6, 0.4), mat(0x9a1f3a), { pos: [sx * 4.2, 2.8, -2.0] })); stage.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 5), mat(0x4a3220), { pos: [sx * 4.6, 2.5, 2.2] })); }
  stage.add(mesh(new THREE.BoxGeometry(9.4, 0.6, 0.4), mat(0x9a1f3a), { pos: [0, 5.0, 2.2] }));
  stage.add(mesh(new THREE.PlaneGeometry(4.6, 1.2), new THREE.MeshStandardMaterial({ map: tex.sign('Open Podium', { w: 512, h: 128, size: 56, bg: '#2a1c3e', fg: '#ffd23f' }), roughness: 0.8 }), { cast: false, pos: [0, 3.2, -2.2] }));
  W.put(stage, 0, -9.5, 0); W.box(0, -9.5, 9, 5);
  // lampionnen slingers boven plein (statisch)
  const cols = [0xff5a5a, 0xffd23f, 0x5ab4ff, 0x7be07b, 0xd86bff];
  const pts = [[-12, 3], [-6, 8], [0, 10], [6, 8], [12, 3]];
  for (let i = 0; i < pts.length; i++) for (let k = 0; k < 6; k++) { const t = k / 6; const nx = pts[i][0] + (pts[(i + 1) % pts.length][0] - pts[i][0]) * t, nz = pts[i][1] + (pts[(i + 1) % pts.length][1] - pts[i][1]) * t; if (i === pts.length - 1) break; const l = mesh(new THREE.SphereGeometry(0.22, 6, 5), glow(cols[(i + k) % 5], 1.0), { cast: false, pos: [nx, groundY(nx, nz) + 4.4 - Math.sin(t * PI) * 0.7, nz] }); W.add(l); W.glowMats.push(l.material); }
  // tipkraam van Lotte (Speelhal-tips; was het kaartjesloket)
  const booth = new THREE.Group();
  booth.add(mesh(new THREE.BoxGeometry(3.2, 2.4, 2.2), new THREE.MeshStandardMaterial({ map: tex.plaster(2, 1, '#f3d9a4'), roughness: 0.9 }), { pos: [0, 1.2, 0] }));
  booth.add(mesh(new THREE.ConeGeometry(2.7, 1.6, 4), mat(0xd8357f), { pos: [0, 3.2, 0], rot: [0, PI / 4, 0] }));
  booth.add(mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), mat(0x111111), { pos: [0, 1.5, 1.12] }));
  booth.add(mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: tex.sign('TIPKRAAM\nSpeelhal-tips!', { w: 768, h: 192, size: 56, bg: '#5a1fd1', fg: '#ffe14a' }) }), { cast: false, pos: [0, 2.3, 1.13] }));
  booth.add(mesh(new THREE.PlaneGeometry(1.1, 1.65), new THREE.MeshStandardMaterial({ map: speelhalPoster() }), { cast: false, pos: [-1.65, 1.5, 0.3], rot: [0, -PI / 2, 0] }));
  W.put(booth, TIPKRAAM.x, TIPKRAAM.z, 0.4); W.box(TIPKRAAM.x, TIPKRAAM.z, 3.4, 2.4, 0.4);
  // klussenbord
  const bd = new THREE.Group();
  for (const sx of [-1, 1]) bd.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 6), mat(0x5b3d24), { pos: [sx * 1.6, 1.6, 0] }));
  bd.add(mesh(new THREE.BoxGeometry(3.8, 2.2, 0.2), mat(0x7a5530), { pos: [0, 2.0, 0] }));
  bd.add(mesh(new THREE.BoxGeometry(3.4, 1.8, 0.05), mat(0xc9a86a), { pos: [0, 2.0, 0.12] }));
  const papers = [0xffffff, 0xfff1b0, 0xffd1d1, 0xd1e8ff];
  for (let i = 0; i < 9; i++) bd.add(mesh(new THREE.PlaneGeometry(0.7, 0.9), mat(papers[i % 4], { side: THREE.DoubleSide }), { cast: false, pos: [-1.2 + (i % 3) * 1.2, 2.4 - Math.floor(i / 3) * 0.6, 0.16], rot: [0, 0, (i * 0.37) % 0.3 - 0.15] }));
  bd.add(mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), new THREE.MeshStandardMaterial({ map: tex.sign('KLUSSENBORD', { w: 512, h: 100, size: 52 }) }), { cast: false, pos: [0, 3.5, 0.0] }));
  W.put(bd, BOARD.x, BOARD.z, 0); W.box(BOARD.x, BOARD.z, 4, 0.8);
  W.interact.push({ type: 'board', x: BOARD.x, z: BOARD.z + 2, r: 3.2, label: 'Klussenbord lezen' });
  // wegwijzer
  const sp = P.signpost(['Bakkerij ←', '→ Taverne', '↑ Kasteel', '↓ Boerderij'], 3.0); W.put(sp, 3, 12, -0.5); W.circle(3, 12, 0.4);
  // een paar kisten en tonnen
  for (const [x, z] of [[-15, 9], [-14.2, 9.8], [15, 3], [14.2, 4], [4.5, -9]]) { const b = Math.random() < 0.5 ? P.barrel() : P.crate(0.9); W.put(b, x, z, rand(0, 6)); W.circle(x, z, 0.5); }
}

// ---------------------------------------------------------------- thuis
function buildHome(W) {
  const yaw = HOME.yaw; const L = (lx, lz) => W.local(HOME.x, HOME.z, yaw, lx, lz);
  W.house(HOME.x, HOME.z, yaw, 7, 6, 3.2, { thatch: true, name: 'Thuis', wall: '#f1e0bd', doorColor: 0x3a6a9a });
  // tuintje voor de deur
  for (let i = -1; i <= 1; i++) { const [x, z] = L(i * 3.4, 7); const f = P.fence(3.4); W.put(f, x, z, yaw); }
  const [fx1, fz1] = L(-3, 5); const fl = P.flowerPatch(0xff6fa5, 10, 1.4); W.put(fl, fx1, fz1, 0);
  const [fx2, fz2] = L(3, 5); const fl2 = P.flowerPatch(0xffe14a, 10, 1.4); W.put(fl2, fx2, fz2, 0);
  const [mx, mz] = L(2.6, 7.6); const mb = new THREE.Group(); mb.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), mat(0x5b3d24), { pos: [0, 0.6, 0] })); mb.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), mat(0xd8372c), { pos: [0, 1.3, 0] })); W.put(mb, mx, mz, yaw);
  const [wx, wz] = L(-4.2, 1); const wp = new THREE.Group(); for (let i = 0; i < 6; i++) wp.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6), mat(0x8a5a2b), { pos: [(i % 3) * 0.32 - 0.32, 0.15 + Math.floor(i / 3) * 0.28, 0], rot: [0, 0, PI / 2] })); W.put(wp, wx, wz, yaw + 1.5);
  const [sx, sz] = L(0, 3.15); const sg = W.sign('Wes & Jor', 2.4, 0.7, sx, groundY(HOME.x, HOME.z) + 3.0, sz, yaw, { size: 70 }); W.add(sg);
  const [ix, iz] = L(0, 5.2); W.interact.push({ type: 'home', x: ix, z: iz, r: 3.4, label: 'Naar binnen (slapen)' });
  const [tx, tz] = L(-1, -8); const tr = P.tree(6); W.put(tr, tx, tz, 0); W.circle(tx, tz, 0.8);
}

// ---------------------------------------------------------------- bakkerij
function buildBakery(W) {
  const x = -27, z = -6; W.house(x, z, PI / 2, 10, 8, 4.2, { wall: '#f7e8c9', roof: '#c04a3a', name: 'Bakkerij' });
  const s = W.sign('Bakkerij Bram', 4.4, 0.9, -21.45, groundY(x, z) + 3.6, -6, PI / 2, { size: 62, bg: '#6b3f1c' }); W.add(s);
  // kraam buiten
  const tb = table(2.6); W.put(tb, -22, -9.5, PI / 2); W.box(-22, -9.5, 1.2, 2.8);
  for (let i = 0; i < 5; i++) { const b = P.bread(['loaf', 'bun', 'pretzel', 'croissant', 'loaf'][i]); b.position.set(-22 + ((i % 2) - 0.5) * 0.3, groundY(-22, -9.5) + 0.95, -9.5 - 1 + i * 0.5); W.add(b); }
  for (const [bx, bz] of [[-23, -1.5], [-22.2, -0.9]]) { const sk = P.sack(); W.put(sk, bx, bz, rand(0, 6)); W.circle(bx, bz, 0.5); }
  const bq = P.barrel(); W.put(bq, -23, -12.5, 0); W.circle(-23, -12.5, 0.5);
  const fp = P.flowerPatch(0xffe14a, 6, 0.6); W.put(fp, -21, -10.5, 0);
}

// ---------------------------------------------------------------- taverne
function buildTavern(W) {
  const x = 30, z = -8; W.house(x, z, -PI / 2, 16, 11, 5.4, { wall: '#e8d3a8', roof: '#7a3b2e', name: 'Taverne' });
  W.add(W.sign('De Gouden Griffioen', 5.6, 1.1, 21.4, groundY(x, z) + 4.4, -8, -PI / 2, { size: 56, bg: '#4a1f1f', fg: '#ffd23f' }));
  // uithangbord arm + griffioen figuur (gouden blokken)
  const gr = new THREE.Group(); gr.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), mat(0xffc93c, { metalness: 0.7, roughness: 0.3 }), { pos: [0, 0, 0] })); gr.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xffc93c, { metalness: 0.7 }), { pos: [0.5, 0.25, 0] })); gr.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat(0xe86a1c), { pos: [0.78, 0.22, 0], rot: [0, 0, -PI / 2] })); for (const sz of [-1, 1]) gr.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), mat(0xffd23f, { metalness: 0.6 }), { pos: [-0.1, 0.4, sz * 0.4], rot: [0.5 * sz, 0, 0.4] }));
  W.put(gr, 21.4, -4.0, PI / 2, 4.1);
  for (const [tx, tz] of [[18, -2.5], [18, -13.5], [16, 3]]) { const t = table(2.4); W.put(t, tx, tz, PI / 2); W.box(tx, tz, 1.1, 2.6); for (const sz of [-1.1, 1.1]) { const b = bench(); W.put(b, tx - 0.2, tz + sz, PI / 2); } const m = mug(); m.position.set(tx, groundY(tx, tz) + 0.95, tz - 0.6); W.add(m); const m2 = mug(); m2.position.set(tx - 0.1, groundY(tx, tz) + 0.95, tz + 0.5); W.add(m2); }
  for (const [bx, bz] of [[22, -17], [23.2, -17.4], [22.5, -1]]) { const b = P.barrel(); W.put(b, bx, bz, 0); W.circle(bx, bz, 0.5); }
  const t1 = P.torch(); W.put(t1, 21, -11, 0); W.torches.push(t1); const t2 = P.torch(); W.put(t2, 21, -5, 0); W.torches.push(t2);
}

// ---------------------------------------------------------------- magazijn
function buildWarehouse(W) {
  const x = 33, z = 21;
  const g = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ map: tex.planks(5, 2, '#9a6f3f'), roughness: 0.95 });
  g.add(mesh(new THREE.BoxGeometry(16, 6.5, 11), wood, { pos: [0, 3.25, 0] }));
  const sh = new THREE.Shape(); sh.moveTo(-8.6, 0); sh.lineTo(0, 3.4); sh.lineTo(8.6, 0); sh.lineTo(-8.6, 0);
  g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 12, bevelEnabled: false }), new THREE.MeshStandardMaterial({ map: tex.roof(4, 2, '#4a5a7a'), roughness: 0.95, flatShading: true }), { pos: [0, 6.5, -6] }));
  g.add(mesh(new THREE.BoxGeometry(5, 4.2, 0.3), mat(0x4a3220), { pos: [0, 2.1, 5.55] }));
  g.add(mesh(new THREE.BoxGeometry(0.15, 4.2, 0.35), mat(0x2a1a10), { pos: [0, 2.1, 5.58] }));
  g.add(mesh(new THREE.BoxGeometry(5.6, 0.5, 0.4), mat(0x2a1a10), { pos: [0, 4.4, 5.55] }));
  g.add(mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshStandardMaterial({ map: tex.sign('Magazijn De Kist', { w: 512, h: 112, size: 52 }) }), { cast: false, pos: [0, 5.4, 5.55] }));
  W.put(g, x, z, PI); W.box(x, z, 16.4, 11.4, PI);
  const wp = W.local(x, z, PI, 0, 5.8); W.doors.push({ x: wp[0], z: wp[1], yaw: PI, leaf: null, owner: 'Magazijn', big: true, hx: x, hz: z, w: 5, h: 4.2 });
  for (const [cx, cz, s] of [[25, 14.5, 1.2], [26.4, 14.7, 1.0], [25.6, 15.0, 0.9], [38, 12.5, 1.3], [39.4, 12.4, 1.0], [38.6, 12.6, 1.0]]) { const c = P.crate(s); W.put(c, cx, cz, rand(-0.3, 0.3)); W.box(cx, cz, s, s, 0); }
  const k = P.crate(1); W.put(k, 38.6, 12.6, 0.3, 1.0);
  const c = cart(); W.put(c, 24, 19, 0.6); W.box(24, 19, 2.4, 1.6, 0.6);
  // kraan
  const cr = new THREE.Group(); cr.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), mat(0x5b3d24), { pos: [0, 3.5, 0] })); const arm = new THREE.Group(); arm.userData.dynamic = true; arm.position.y = 7; cr.add(arm); arm.add(mesh(new THREE.BoxGeometry(5, 0.2, 0.2), mat(0x5b3d24), { pos: [2.2, 0, 0] })); const rope = mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), mat(0x8a7a5a), { pos: [4, -1.5, 0] }); arm.add(rope); const hk = P.crate(0.8); hk.position.set(4, -3.8, 0); arm.add(hk);
  W.put(cr, 41, 17, 0); W.circle(41, 17, 0.5); W.updaters.push((dt, t) => { arm.rotation.y = Math.sin(t * 0.3) * 0.8; });
}

// ---------------------------------------------------------------- boerderij
function buildFarm(W) {
  const bx = -26, bz = 44;
  W.house(bx, bz, PI / 2, 9, 13, 5.5, { wall: '#b24a35', roof: '#5a3a2a', name: 'Schuur' });
  W.add(W.sign('Boerderij Boris', 4.6, 0.9, bx + 6.7, groundY(bx, bz) + 3.8, bz, PI / 2, { size: 56, bg: '#3a5a2a' }));
  // akker (hekken en gewassen)
  const fx = FARM.x, fz = FARM.z + 4;
  for (const [sx, sz, w, rot] of [[0, -10.5, 28, 0], [0, 10.5, 28, 0], [-14.5, 0, 21, PI / 2], [14.5, 0, 21, PI / 2]]) { const f = P.fence(w); W.put(f, fx + sx, fz + sz, rot); }
  for (let r = 0; r < 4; r++) { const c = cabbageRows(14, 2, r % 2 ? 'carrot' : 'cabbage'); W.put(c, fx, fz - 7 + r * 4.6, 0); }
  const sc = scarecrow(); W.put(sc, fx + 1, fz - 1, 0.4); W.circle(fx + 1, fz - 1, 0.5);
  // molen
  const wm = P.windmill(1.1); W.put(wm, -42, 52, 0.5); W.circle(-42, 52, 3.6); W.updaters.push((dt, t) => { wm.userData.blades.rotation.z += dt * 0.7; });
  // koeienwei
  const cows = [];
  for (let i = 0; i < 3; i++) { const a = new Animal('cow'); a.home = { x: -2 + i * 3, z: 54 + (i % 2) * 3 }; W.put(a.group, a.home.x, a.home.z, rand(0, 6)); cows.push(a); }
  for (const [px, pz, w, rot] of [[1, 49, 16, 0], [1, 60, 16, 0], [-7, 54.5, 11, PI / 2], [9, 54.5, 11, PI / 2]]) W.put(P.fence(w), px, pz, rot);
  for (let i = 0; i < 8; i++) { const a = new Animal('chicken'); const cx = -12 + rand(-6, 6), cz = 28 + rand(-3, 6); a.home = { x: cx, z: cz }; W.put(a.group, cx, cz, rand(0, 6)); cows.push(a); }
  W.animals = (W.animals || []).concat(cows);
  for (const [hx, hz] of [[-6, 36], [-7.2, 35.3], [-6.5, 37.3]]) { const h = new THREE.Group(); h.add(mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), mat(0xd9b84a), { pos: [0, 0.45, 0] })); h.add(mesh(new THREE.BoxGeometry(1.4, 0.15, 0.9), mat(0xb8962f), { pos: [0, 0.95, 0] })); W.put(h, hx, hz, rand(0, 3)); W.box(hx, hz, 1.5, 1, 0); }
}

// ---------------------------------------------------------------- modderpad
function buildMud(W) {
  const x = -17, z = 13.5;
  const mud = mesh(new THREE.CircleGeometry(6, 20), new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.4, metalness: 0.0 }), { cast: false, pos: [0, 0.04, 0], rot: [-PI / 2, 0, 0] });
  const mg = new THREE.Group(); mg.add(mud); for (let i = 0; i < 5; i++) mg.add(mesh(new THREE.CircleGeometry(0.7 + Math.random() * 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x3a4a60, roughness: 0.1, metalness: 0.4 }), { cast: false, pos: [(Math.random() - 0.5) * 7, 0.06, (Math.random() - 0.5) * 7], rot: [-PI / 2, 0, 0] }));
  W.put(mg, x, z, 0);
  const c = cart(); W.put(c, x - 2.4, z + 1.2, 0.5, -0.3); c.rotation.x = 0.1; c.rotation.z = -0.12; W.box(x - 2.4, z + 1.2, 2.6, 1.8, 0.5);
  for (let i = 0; i < 3; i++) { const m = milkCan(); m.position.set(x - 2.4 + (i - 1) * 0.5, groundY(x, z) + 0.65, z + 1.2 - 0.4 + i * 0.35); W.add(m); }
  const sp = P.signpost(['Pas op: modder!', '→ Dorp'], 2.0); W.put(sp, x + 5.5, z - 4.5, -0.3);
  W.circle(x + 5.5, z - 4.5, 0.4);
}

// ---------------------------------------------------------------- schapenweide
function buildPasture(W) {
  const cx = PASTURE.x, cz = PASTURE.z;
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; if (Math.abs(a - PI * 1.5) < 0.3) continue; const f = P.fence(2.9); W.put(f, cx + Math.cos(a) * 15, cz + Math.sin(a) * 15, -a + PI / 2); }
  const cf = P.campfire(); W.put(cf, cx, cz - 3, 0); W.campfires.push(cf); W.circle(cx, cz - 3, 0.9);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; const lg = new THREE.Group(); lg.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 7), mat(0x6b4a2e), { rot: [0, 0, PI / 2], pos: [0, 0.3, 0] })); W.put(lg, cx + Math.cos(a) * 3.2, cz - 3 + Math.sin(a) * 3.2, a + PI / 2); }
  // woonwagen
  const w = new THREE.Group(); w.add(mesh(new THREE.BoxGeometry(5, 2.6, 2.8), new THREE.MeshStandardMaterial({ map: tex.planks(2, 1, '#3a78a8'), roughness: 0.9 }), { pos: [0, 1.9, 0] })); w.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 10, 1, false, 0, PI), mat(0xe8d6a0), { pos: [0, 3.2, 0], rot: [0, 0, PI / 2] })); for (const sx of [-1.5, 1.5]) for (const sz of [-1.5, 1.5]) { const wh = mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 12), mat(0x5b3d24), { pos: [sx, 0.65, sz] }); w.add(wh); }
  const wl = mesh(new THREE.BoxGeometry(0.7, 0.8, 0.1), glow(0xffd27a, 0.7), { cast: false, pos: [0.8, 2.2, 1.43] }); w.add(wl); W.glowMats.push(wl.material);
  W.put(w, cx + 9, cz - 9, 2.4); W.box(cx + 9, cz - 9, 5.2, 3, 2.4);
  const sheep = [];
  for (let i = 0; i < 8; i++) { const a = new Animal('sheep'); const sx = cx + rand(-9, 9), sz = cz + rand(-3, 10); a.home = { x: sx, z: sz }; W.put(a.group, sx, sz, rand(0, 6)); sheep.push(a); }
  W.animals = (W.animals || []).concat(sheep);
  const l1 = P.lampPost(0xff9a3a); W.put(l1, cx - 6, cz - 12, 0); W.glowMats.push(l1.children[1].material); W.lamps.push({ x: cx - 6, y: groundY(cx - 6, cz - 12) + 2.75, z: cz - 12, mat: l1.children[1].material });
}

// ---------------------------------------------------------------- steiger
function buildPier(W) {
  const x0 = -36.5, z0 = -18; const wm = new THREE.MeshStandardMaterial({ map: tex.planks(4, 1), roughness: 0.9 });
  const pier = new THREE.Group(); pier.add(mesh(new THREE.BoxGeometry(11, 0.25, 2.8), wm, { pos: [-5, 0.3, 0] }));
  for (let i = 0; i < 6; i++) for (const sz of [-1.3, 1.3]) pier.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5), mat(0x5b3d24), { pos: [-i * 2, -0.2, sz] }));
  const gy = 0; pier.position.set(x0, 0, z0); W.add(pier);
  const boat = new THREE.Group(); boat.userData.dynamic = true; boat.add(mesh(new THREE.BoxGeometry(3.2, 0.5, 1.5), mat(0x8a5a2b), { pos: [0, 0.1, 0] })); boat.add(mesh(new THREE.ConeGeometry(0.75, 1.2, 4), mat(0x8a5a2b), { pos: [1.9, 0.1, 0], rot: [0, 0, -PI / 2] })); boat.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), mat(0x5b3d24), { pos: [0.2, 0.4, 0] }));
  boat.position.set(x0 - 8, -0.55, z0 + 3); boat.rotation.y = 0.3; W.add(boat); W.updaters.push((dt, t) => { boat.position.y = -0.5 + Math.sin(t * 1.3) * 0.06; boat.rotation.z = Math.sin(t * 1.1) * 0.04; });
  const hut = W.house(-30, -23, -PI / 2 + 0.3, 4.4, 4, 2.6, { thatch: true, name: 'Vissershut', wall: '#cdb48a' });
  const nets = new THREE.Group(); for (let i = 0; i < 4; i++) nets.add(mesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), mat(0x5b3d24), { pos: [i * 0.9, 0.8, 0] })); nets.add(mesh(new THREE.PlaneGeometry(2.7, 1.2), new THREE.MeshStandardMaterial({ color: 0x8ac0a0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, wireframe: true }), { cast: false, pos: [1.35, 1.0, 0] })); W.put(nets, -29, -15, 0.4);
  const bk = P.bucket(); W.put(bk, -35, -15.5, 0); for (let i = 0; i < 3; i++) { const f = P.fish(); f.scale.setScalar(0.8); f.position.set(-35 + i * 0.05, groundY(-35, -15.5) + 0.35 + i * 0.05, -15.5); f.rotation.y = i; W.add(f); }
  // lelies
  for (let i = 0; i < 18; i++) { const lz = -40 + Math.random() * 70; const lx = riverX(lz) + (Math.random() - 0.5) * 6; const lp = mesh(new THREE.CircleGeometry(0.5 + Math.random() * 0.3, 8, 0, TAU * 0.92), mat(0x3b9a45, { side: THREE.DoubleSide }), { cast: false, pos: [lx, -0.58, lz], rot: [-PI / 2, 0, Math.random() * 6] }); W.add(lp); if (Math.random() < 0.4) W.add(Object.assign(mesh(new THREE.SphereGeometry(0.15, 6, 5), mat(0xff9ad5), { cast: false }), {})).position.set(lx, -0.45, lz); }
}

// ---------------------------------------------------------------- speelhal in de berg
function buildArcadeGate(W) {
  const g = new THREE.Group(); const sm = new THREE.MeshStandardMaterial({ map: tex.stone(4, 2), roughness: 0.95, flatShading: true, emissive: 0x3a3a52, emissiveIntensity: 0.9 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x77727c, roughness: 1, flatShading: true, emissive: 0x2c2a34, emissiveIntensity: 0.9 });
  // rotsmassief achter de gevel (loopt over in de berg)
  for (const [rx, rz, r, hh] of [[0, -9, 12, 20], [-13, -7, 10, 17], [13, -7, 10, 17], [-22, -4, 8, 12], [22, -4, 8, 12], [0, -16, 14, 26]]) g.add(mesh(new THREE.DodecahedronGeometry(r, 0), rock, { pos: [rx, hh * 0.3, rz], scale: [1, hh / r * 0.6, 1.1] }));
  // gevel
  g.add(mesh(new THREE.BoxGeometry(24, 9, 3), sm, { pos: [0, 4.5, -2] }));
  for (let i = 0; i < 12; i++) g.add(mesh(new THREE.BoxGeometry(1.4, 1.1, 1.6), sm, { pos: [-11 + i * 2, 9.5, -2] }));
  for (const sx of [-1, 1]) {
    const t = P.tower(13, 2.8); t.position.set(sx * 12.5, 0, -1.5); g.add(t);
    for (let k = 0; k < 3; k++) { const w = mesh(new THREE.BoxGeometry(0.9, 1.5, 0.3), glow([0xff5ad8, 0x5ad8ff, 0xffe14a][k], 1.6), { cast: false, pos: [sx * 12.5, 4 + k * 3, 1.4] }); g.add(w); W.glowMats.push(w.material); }
  }
  // grote boog-poort met gloed
  g.add(mesh(new THREE.BoxGeometry(7, 7, 0.6), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#ff5ad8'); gr.addColorStop(0.5, '#7a3bff'); gr.addColorStop(1, '#ffe14a'); x.fillStyle = gr; x.fillRect(0, 0, 64, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }), { cast: false, pos: [0, 3.5, -0.3] }));
  g.add(mesh(new THREE.TorusGeometry(3.5, 0.7, 6, 16, PI), sm, { pos: [0, 7, -0.2] }));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(1.4, 7.5, 1.6), sm, { pos: [sx * 3.9, 3.75, -0.2] }));
  // neonbord
  g.add(mesh(new THREE.PlaneGeometry(14, 2.4), new THREE.MeshBasicMaterial({ map: tex.sign('🎮 SPEELHAL 🎮\nKoning Klopper', { w: 1024, h: 180, size: 64, bg: '#1a0a3a', fg: '#ff9aef', border: '#5ad8ff' }), fog: false }), { cast: false, pos: [0, 12.2, -0.4] }));
  // lampionnen langs de ingang
  for (let i = 0; i < 9; i++) { const l = mesh(new THREE.SphereGeometry(0.32, 8, 6), glow([0xff5a5a, 0xffd23f, 0x5ab4ff, 0x7be07b, 0xd86bff][i % 5], 1.4), { cast: false, pos: [-8 + i * 2, 10.8 + Math.sin(i * 1.2) * 0.2, 0.3] }); g.add(l); W.glowMats.push(l.material); }
  // beelden: draak links, ridder rechts (grappig: de ridder houdt een joystick vast)
  const dr = new THREE.Group(); dr.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.6, 8), sm, { pos: [0, 0.8, 0] })); dr.add(mesh(new THREE.SphereGeometry(0.8, 8, 6), mat(0x8a6aff), { pos: [0, 2.3, 0] })); dr.add(mesh(new THREE.ConeGeometry(0.2, 0.8, 5), mat(0xf5ecd0), { pos: [0.4, 3.0, 0], rot: [0, 0, -0.4] })); dr.add(mesh(new THREE.ConeGeometry(0.2, 0.8, 5), mat(0xf5ecd0), { pos: [-0.4, 3.0, 0], rot: [0, 0, 0.4] }));
  dr.position.set(-7, 0, 3); g.add(dr);
  const kn = new THREE.Group(); kn.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.6, 8), sm, { pos: [0, 0.8, 0] })); kn.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.6, 8), mat(0xb7bcc6, { metalness: 0.7 }), { pos: [0, 2.4, 0] })); kn.add(mesh(new THREE.SphereGeometry(0.45, 8, 6), mat(0xb7bcc6, { metalness: 0.7 }), { pos: [0, 3.5, 0] })); kn.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), mat(0x222222), { pos: [0.7, 2.6, 0.4] })); kn.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xd8372c), { pos: [0.7, 3.3, 0.4] }));
  kn.position.set(7, 0, 3); g.add(kn);
  for (const sx of [-1, 1]) { const b = P.banner(0x7a2fd4, 5.5, 1.5); b.position.set(sx * 9, 3, 0.6); g.add(b); W.updaters.push((dt, t) => P.animateBanner(b, t + sx)); }
  W.put(g, ARCADE.x, ARCADE.z, ARCADE.yaw);
  const L = (lx, lz) => W.local(ARCADE.x, ARCADE.z, ARCADE.yaw, lx, lz);
  for (const [lx, lz, w, d] of [[0, -2, 24, 3], [-12.5, -1.5, 5, 5], [12.5, -1.5, 5, 5], [-3.9, -0.2, 1.8, 1.8], [3.9, -0.2, 1.8, 1.8], [-7, 3, 2.2, 2.2], [7, 3, 2.2, 2.2]]) { const [wx, wz] = L(lx, lz); W.box(wx, wz, w, d, ARCADE.yaw); }
  const [ix, iz] = L(0, 5); W.interact.push({ type: 'arcade', x: ix, z: iz, r: 5.5, label: 'Naar de Speelhal' });
  const [bx, bz] = L(0, 2); W.arcadeDoor = { x: bx, z: bz };
  // sfeer: gekleurde gloed voor de poort
  W.glowMats.push(...[]);
}

// ---------------------------------------------------------------- de weg naar de Speelhal: lichtzuil, groot bord, gloeiende pijlen, borden, heraut
// Alles goedkoop: een paar cilinders/sprite + twee InstancedMeshes (pijlen, lantaarntjes) + 3 bordjes.
function glowBeamTex() {
  return canvasTex(8, 256, (g, w, hh) => { const gr = g.createLinearGradient(0, hh, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.85)'); gr.addColorStop(0.7, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
}
function dirSignTex(angle) {   // angle = schermhoek van de pijl (0 = rechts, PI/2 = omhoog)
  return canvasTex(512, 256, (g, w, hh) => {
    const gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, '#3a1170'); gr.addColorStop(1, '#8a1f8a'); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#ffe14a'; g.lineWidth = 12; g.strokeRect(8, 8, w - 16, hh - 16); g.strokeStyle = '#5ad8ff'; g.lineWidth = 4; g.strokeRect(22, 22, w - 44, hh - 44);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '84px serif'; g.fillText('🎮', 80, 96);
    g.font = 'bold 70px Fredoka, Arial Black, sans-serif'; g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = '#1a0a3a'; g.strokeText('Speelhal', 238, 100); g.fillStyle = '#fff'; g.fillText('Speelhal', 238, 100);
    g.font = 'bold 34px Fredoka, Arial, sans-serif'; g.fillStyle = '#ffe14a'; g.fillText('Koning Klopper wacht!', 200, 196);
    g.save(); g.translate(430, 128); g.rotate(-angle); g.fillStyle = '#ffe14a'; g.strokeStyle = '#1a0a3a'; g.lineWidth = 8; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(52, 0); g.lineTo(6, -44); g.lineTo(6, -18); g.lineTo(-52, -18); g.lineTo(-52, 18); g.lineTo(6, 18); g.lineTo(6, 44); g.closePath(); g.stroke(); g.fill(); g.restore();
  });
}
function buildArcadeGuide(W) {
  const LA = (lx, lz) => W.local(ARCADE.x, ARCADE.z, ARCADE.yaw, lx, lz);
  const [bx, bz] = LA(0, 1.5); const by = groundY(bx, bz);
  // 1. lichtzuil boven de poort: twee ineengeschoven cilinders, additief, zichtbaar van ver (ook overdag)
  const bt = glowBeamTex();
  const mkBeam = (r0, r1, hgt, color, op) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, hgt, 20, 1, true), new THREE.MeshBasicMaterial({ map: bt, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.position.set(bx, by + hgt / 2 - 2, bz); m.renderOrder = 6; m.frustumCulled = false; W.add(m); return m; };
  const beamOut = mkBeam(5.2, 2.8, 150, 0xff3ad8, 0.5), beamIn = mkBeam(1.8, 0.9, 160, 0xff9af0, 0.8);
  // 2. groot knipperend bord hoog boven de poort (sprite: kijkt altijd naar de camera)
  const st = canvasTex(1024, 300, (g, w, hh) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 128px Fredoka, Arial Black, sans-serif'; g.lineJoin = 'round';
    g.shadowColor = '#ff2bd6'; g.shadowBlur = 40; g.lineWidth = 20; g.strokeStyle = '#2a0a5a'; g.strokeText('🎮 SPEELHAL', w / 2, hh / 2 + 6); g.fillStyle = '#fff6a8'; g.fillText('🎮 SPEELHAL', w / 2, hh / 2 + 6); g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.strokeText('🎮 SPEELHAL', w / 2, hh / 2 + 6);
  });
  const signSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, fog: false })); signSp.scale.set(46, 13.5, 1); signSp.position.set(bx, by + 42, bz); signSp.renderOrder = 7; W.add(signSp);
  // 3. pad van pijlen (instanced) en lantaarntjes naast het pad
  const pts = [], tr = ARCADE_TRAIL; let acc = 1.5; const STEP = 4.6;
  for (let i = 0; i < tr.length - 1; i++) {
    const [ax, az] = tr[i], [cx, cz] = tr[i + 1]; const len = Math.hypot(cx - ax, cz - az), dx = (cx - ax) / len, dz = (cz - az) / len;
    let d = acc; while (d < len) { pts.push({ x: ax + dx * d, z: az + dz * d, yaw: Math.atan2(dx, dz), dx, dz }); d += STEP; } acc = d - len;
  }
  const ag = new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); [[0, 1.1], [0.95, -0.05], [0.95, -0.55], [0, 0.2], [-0.95, -0.55], [-0.95, -0.05]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); return sh; })());
  ag.rotateX(Math.PI / 2);   // punt wijst nu naar +z, plat op de grond
  const am = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, fog: false }); am.polygonOffset = true; am.polygonOffsetFactor = -4;
  const om = new THREE.MeshBasicMaterial({ color: 0x2a0a4a, side: THREE.DoubleSide, transparent: true, opacity: 0.8, fog: false }); om.polygonOffset = true; om.polygonOffsetFactor = -2;
  const arrows = new THREE.InstancedMesh(ag, am, pts.length); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3(1.15, 1, 1.15), col = new THREE.Color();
  pts.forEach((p, i) => { E.set(0, p.yaw, 0); Q.setFromEuler(E); V.set(p.x, groundY(p.x, p.z) + 0.16, p.z); M.compose(V, Q, SC); arrows.setMatrixAt(i, M); arrows.setColorAt(i, col.setHex(0xff2bd6)); });
  arrows.instanceMatrix.needsUpdate = true; arrows.frustumCulled = false; arrows.renderOrder = 4; W.add(arrows);
  const outl = new THREE.InstancedMesh(ag, om, pts.length);   // donkere rand eronder voor contrast op zand en gras
  pts.forEach((p, i) => { E.set(0, p.yaw, 0); Q.setFromEuler(E); V.set(p.x - p.dx * 0.12, groundY(p.x, p.z) + 0.14, p.z - p.dz * 0.12); M.compose(V, Q, SC.set(1.4, 1, 1.4)); outl.setMatrixAt(i, M); });
  outl.instanceMatrix.needsUpdate = true; outl.frustumCulled = false; outl.renderOrder = 3; W.add(outl);
  // lantaarntjes: elke 3e pijl, om en om links/rechts van het pad
  const lampPts = pts.filter((_, i) => i % 3 === 1).map((p, k) => { const side = k % 2 ? 1 : -1; return { x: p.x + p.dz * 2.4 * side, z: p.z - p.dx * 2.4 * side }; }).filter((p) => !isWater(p.x, p.z) && !onBridge(p.x, p.z));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 5), new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 }), lampPts.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), lampPts.length);
  lampPts.forEach((p, i) => { const gy = groundY(p.x, p.z); M.compose(V.set(p.x, gy + 0.85, p.z), Q.identity(), SC.set(1, 1, 1)); poles.setMatrixAt(i, M); M.compose(V.set(p.x, gy + 1.95, p.z), Q.identity(), SC.set(1, 1, 1)); bulbs.setMatrixAt(i, M); bulbs.setColorAt(i, col.setHex([0xff5ad8, 0x5ad8ff, 0xffe14a][i % 3])); });
  poles.instanceMatrix.needsUpdate = true; bulbs.instanceMatrix.needsUpdate = true; poles.frustumCulled = false; bulbs.frustumCulled = false; W.add(poles); W.add(bulbs);
  // animatie: golf van licht richting poort; sterker zolang de Speelhal nog niet bezocht is
  const cA = new THREE.Color(0xff1fc8), cB = new THREE.Color(0xffc400), tmp = new THREE.Color();
  W.updaters.push((dt, t) => {
    const fresh = !S.flags.met_king;
    for (let i = 0; i < pts.length; i++) { const k = fresh ? 0.5 + 0.5 * Math.sin(t * 4.5 - i * 0.7) : 0.25; arrows.setColorAt(i, tmp.copy(cA).lerp(cB, k)); }
    arrows.instanceColor.needsUpdate = true; am.opacity = fresh ? 1 : 0.55; om.opacity = fresh ? 0.8 : 0.4;
    const cam = W.camera, near = cam ? 0.15 + 0.85 * smoothstep(14, 55, Math.hypot(cam.position.x - bx, cam.position.z - bz)) : 1;   // vlak bij de zuil niet het hele scherm vullen
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2), amp = (fresh ? 1 : 0.42) * near;
    beamOut.material.opacity = (0.4 + pulse * 0.25) * amp; beamIn.material.opacity = (0.65 + pulse * 0.3) * amp;
    beamOut.scale.set(1 + pulse * 0.08, 1, 1 + pulse * 0.08);
    const on = fresh ? (Math.sin(t * 7) > -0.25 ? 1 : 0.35) : 0.9;   // knipperen
    signSp.material.opacity = on; const sc = 1 + (fresh ? 0.05 * Math.sin(t * 7) : 0); signSp.scale.set(46 * sc, 13.5 * sc, 1);
    bulbs.material.opacity = 1;
  });
  // 4. drie wegwijzers: bij de spawn, bij het plein (west) en na de brug
  const place = (x, z, from, text) => {
    const nx = tr[from + 1]; const ang = Math.atan2(-(nx[1] - z), nx[0] - x);   // pijl in schermrichting (omhoog = noord)
    const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 6), mat(0x5b3d24), { pos: [0, 1.6, 0] }));
    const bd = mesh(new THREE.BoxGeometry(3.3, 1.7, 0.1), mat(0x3a2412), { pos: [0, 3.5, 0.1], rot: [-0.45, 0, 0] }); g.add(bd);
    g.add(mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: dirSignTex(ang) }), { cast: false, pos: [0, 3.524, 0.15], rot: [-0.45, 0, 0] }));   // los object: mergeStatic voegt de plank samen en zou kinderen meenemen
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [0, 4.5, 0.05] }));
    W.put(g, x, z, 0); W.circle(x, z, 0.45);
  };
  place(-5.6, 17.2, 0); place(-18.6, 2.0, 5); place(-45.5, 3.4, 8);
}

// ---------------------------------------------------------------- Heraut Hans (nodigt uit voor de Speelhal)
function buildHerald(W) {
  const n = W.npc('bard', HERALD.x, HERALD.z, HERALD.yaw, { spec: { scale: 1.08, shirt: 0xd8372c, sleeve: 0xffd23f, tunic: 0xffd23f, pants: 0x2f3a8a, hat: 'bard', hatColor: 0xd8372c, hatColor2: 0xffd23f, hair: 0x6a4a2a, hairStyle: 'short', beard: 'stache', glasses: null, skin: 0xf2c3a0 }, lookR: 14 });
  const tp = new THREE.Group(); tp.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), mat(0xe8c24a, { metalness: 0.6, roughness: 0.35 }), { pos: [0, 0, 0.45], rot: [Math.PI / 2, 0, 0] })); tp.add(mesh(new THREE.ConeGeometry(0.16, 0.34, 10, 1, true), mat(0xf2c230, { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }), { pos: [0, 0, 0.98], rot: [Math.PI / 2, 0, 0] })); tp.rotation.x = -0.5; n.hold(tp, 'r');
  const lbl = floatLabel('📯 Heraut Hans', 'Speelhal-nieuws!', '#ffe14a'); lbl.position.y = n.height + 1.2; n.group.add(lbl);
  const q = questMark(); q.position.y = n.height + 2.7; n.group.add(q); n.userData = { mark: q };
  W.heraldNpc = n; W.interact.push({ type: 'herald', x: HERALD.x, z: HERALD.z, r: 3.6, label: 'Heraut Hans aanspreken' }); W.circle(HERALD.x, HERALD.z, 0.7);
}

// ---------------------------------------------------------------- straatpraatjes (kleine NPC's met Speelhal-grappen; Lotte staat bij de tipkraam)
function buildStreetNpcs(W) {
  for (const s of STRAAT) {
    const n = W.npc(s.kind, s.x, s.z, s.yaw, { spec: s.spec, lookR: 10, lift: s.lift || 0 }); n.userData = n.userData || {};
    const lbl = floatLabel(`${s.icon} ${s.who}`, 'Praatje!', '#9ad8ff'); lbl.position.y = n.height + 1.2; n.group.add(lbl);
    W.interact.push({ type: 'chat', id: s.id, x: s.at ? s.at[0] : s.x, z: s.at ? s.at[1] : s.z, r: 3.2, label: s.who + ' aanspreken', npc: n });
    if (!s.at) W.circle(s.x, s.z, 0.6);
    W.chatNpc = W.chatNpc || {}; W.chatNpc[s.id] = n;
  }
}

// ---------------------------------------------------------------- Hoedenmaker Hettie: kraam op het plein
// Voegt alle plain-gekleurde meshes onder `root` samen tot één vertexkleuren-mesh (hoedjes bestaan uit veel kleine stukjes)
function bakeColors(root) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const list = [];
  root.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.type === 'MeshStandardMaterial' && !o.material.map) list.push(o); });
  if (list.length < 2) return;
  const geos = list.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); return [g, o.material.color]; });
  const n = geos.reduce((a, [g]) => a + g.attributes.position.count, 0); const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let off = 0;
  for (const [g, c] of geos) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); for (let i = 0; i < k; i++) { col[(off + i) * 3] = c.r; col[(off + i) * 3 + 1] = c.g; col[(off + i) * 3 + 2] = c.b; } off += k; g.dispose(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(mg, mat(0xffffff, { vertexColors: true, flatShading: false })); m.castShadow = true; m.receiveShadow = true;
  for (const o of list) o.parent && o.parent.remove(o);
  root.add(m);
}
function buildHatShop(W) {
  const { x, z } = HAT_SHOP; const g = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ map: tex.planks(2, 1, '#8a5a2b'), roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(3.4, 1.0, 1.2), wood, { pos: [0, 0.5, 0.4] }));
  g.add(mesh(new THREE.BoxGeometry(3.5, 0.08, 1.35), mat(0xf4e4bc), { pos: [0, 1.04, 0.4] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 5), mat(0x7a5530), { pos: [sx * 1.7, 1.5, 0.4 + sz * 0.9] }));
  const stripes = new THREE.MeshStandardMaterial({ map: stripedTex('#8a3fd8', '#ffe9a0', 8) });
  g.add(mesh(new THREE.BoxGeometry(3.9, 0.12, 2.5), stripes, { pos: [0, 3.05, 0.4], rot: [0.14, 0, 0] }));
  g.add(mesh(new THREE.BoxGeometry(3.9, 0.45, 0.06), new THREE.MeshStandardMaterial({ map: stripedTex('#8a3fd8', '#ffe9a0', 16) }), { pos: [0, 2.78, 1.62] }));
  g.add(mesh(new THREE.PlaneGeometry(3.1, 0.62), new THREE.MeshStandardMaterial({ map: tex.sign('Hoedenmaker Hettie', { w: 768, h: 160, size: 62, bg: '#5a1f7a', fg: '#ffe14a' }), roughness: 0.8 }), { cast: false, pos: [0, 2.2, 1.04] }));
  // hoeden op de toonbank, op houten standaardjes
  const show = [['wizard', 0x5b2a86, 0xffd24a], ['crown', 0xffd24a, 0xffd24a], ['pirate', 0x1a1820, 0xffffff], ['party', 0xff4aa8, 0xffe14a], ['cowboy', 0x8a5a2b, 0xffd24a]];
  const hats = new THREE.Group(); g.add(hats);
  show.forEach(([k, c, c2], i) => { const hx = -1.4 + i * 0.7; hats.add(mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.32, 6), mat(0x6b4a2e), { pos: [hx, 1.24, 0.75] })); const hm = makeHatMesh(k, c, c2, 0.85); hm.position.set(hx, 1.5, 0.75); hats.add(hm); });
  // hoedenrek naast het kraam
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 5), mat(0x6b4a2e), { pos: [2.5, 1.3, 0.2] }));
  [['chef', 0xffffff, 0xffffff], ['tophat', 0x1e1c24, 0xd8372c], ['jester', 0xd8357f, 0x2f6fe0]].forEach(([k, c, c2], i) => { const hm = makeHatMesh(k, c, c2, 0.8); hm.position.set(2.5, 2.3 - i * 0.65, 0.2); hm.rotation.y = i * 2; hats.add(hm); });
  bakeColors(hats);
  W.put(g, x, z, 0); W.box(x, z + 0.4, 3.9, 1.5, 0);
  // een grote draaiende hoed op het dak (dynamisch, dus niet samengevoegd)
  const big = makeHatMesh('wizard', 0x8a3fd8, 0xffd24a, 2.4); bakeColors(big); big.userData.dynamic = true; big.position.set(x, groundY(x, z) + 3.9, z + 0.4); W.add(big); W.updaters.push((dt, t) => { big.rotation.y = t * 1.2; big.position.y = groundY(x, z) + 4.3 + Math.sin(t * 2) * 0.12; });
  // Hettie zelf, achter de toonbank
  const hn = W.npc('innkeeper', x - 0.3, z - 0.95, 0, { spec: { shirt: 0xb04aa8, apron: 0xffe9a0, hat: 'tophat', hatColor: 0x6a2a8a, hatColor2: 0xff9aef, hair: 0xf2d28a, hairStyle: 'bun', glasses: 0xd4a84a, scale: 1.0 }, lookR: 12 });
  const lbl = floatLabel('👒 Hoedenmaker Hettie', 'hoeden & kleuren', '#ff9aef'); lbl.position.y = hn.height + 1.2; hn.group.add(lbl);
  W.hettie = hn; W.interact.push({ type: 'shop', x: x, z: z + 2.9, r: 3.6, label: 'Hoeden & kleuren kopen' });
}

// ---------------------------------------------------------------- heksenhut
function buildWitch(W) {
  const x = -62, z = 4;
  const h = W.house(x, z, PI / 2, 5.4, 5.4, 3.0, { thatch: true, name: 'Heksenhut', wall: '#6a5a46', doorColor: 0x3a1f4a });
  h.rotation.z = 0.04;
  const cl = P.cauldron(0x7affb0); W.put(cl, -56.5, 10, 0); W.circle(-56.5, 10, 1.1);
  const lig = new THREE.PointLight(0x6affb0, 1.4, 12, 1.6); lig.position.set(-56.5, groundY(-56.5, 10) + 2, 10); W.add(lig); W.lamps.push({ light: lig, base: 1.4, night: true });
  W.cauldronPos = { x: -56.5, y: groundY(-56.5, 10) + 1.1, z: 10 };
  for (const [mx, mz, s, c] of [[-54, 0, 2.2, 0xd8403a], [-59, 9, 1.8, 0x9a4ad8], [-52, 14, 2.6, 0x3ab0d8]]) { const m = P.mushroom(s, c); W.put(m, mx, mz, 0); W.circle(mx, mz, 0.5 * s); }
  const sk = new THREE.Group(); sk.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0xeeeadd), { pos: [0, 0.3, 0] })); sk.add(mesh(new THREE.BoxGeometry(0.3, 0.15, 0.2), mat(0xeeeadd), { pos: [0, 0.1, 0.05] })); for (const sx of [-1, 1]) sk.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), glow(0x6affb0, 1.5), { cast: false, pos: [sx * 0.1, 0.33, 0.22] })); W.put(sk, -58, 0, 1.2, 0.6); const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5), mat(0x5b3d24)); W.put(post, -58, 0, 0);
  // herbs hangend
  const hb = new THREE.Group(); for (let i = 0; i < 5; i++) hb.add(mesh(new THREE.ConeGeometry(0.1, 0.45, 5), mat([0x5ab04a, 0xb04ad8, 0xd8b04a][i % 3]), { pos: [i * 0.5 - 1, 0.1, 0], rot: [PI, 0, 0] })); hb.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), mat(0x5b3d24), { rot: [0, 0, PI / 2] })); W.put(hb, -59, -1.8, PI / 2, 2.5);
  const owl = new THREE.Group(); owl.add(mesh(new THREE.SphereGeometry(0.35, 8, 6), mat(0x8a6a4a), { scale: [1, 1.2, 1], pos: [0, 0.4, 0] })); for (const sx of [-1, 1]) { owl.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), mat(0xffd23f), { cast: false, pos: [sx * 0.14, 0.55, 0.27] })); owl.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), mat(0x111111), { cast: false, pos: [sx * 0.14, 0.55, 0.37] })); } W.put(owl, -62.5, 4, PI / 2, 3.05);
}

// ---------------------------------------------------------------- grot
function buildCave(W) {
  const x = CAVE.x, z = CAVE.z; const rm = mat(0x6e6a70);
  const g = new THREE.Group();
  const ridge = [[0, 0, 7, 8], [5, 4, 6, 10], [5, -4, 6, 10], [9, 8, 5, 8], [9, -8, 5, 8], [2, 8, 4, 6], [2, -8, 4, 6], [10, 0, 7, 12], [14, 5, 6, 10], [14, -5, 6, 10]];
  for (const [rx, rz, r, hh] of ridge) g.add(mesh(new THREE.DodecahedronGeometry(r, 0), rm, { pos: [rx, hh * 0.35, rz], scale: [1, hh / r * 0.6, 1.1] }));
  // ingang: donkere boog
  g.add(mesh(new THREE.BoxGeometry(0.5, 5, 6), new THREE.MeshStandardMaterial({ color: 0x000000 }), { cast: false, pos: [-1.6, 2.6, 0] }));
  g.add(mesh(new THREE.TorusGeometry(3.2, 0.7, 6, 14, PI), mat(0x55525a), { pos: [-1.3, 2.7, 0], rot: [0, PI / 2, 0] }));
  for (const sz of [-3.2, 3.2]) g.add(mesh(new THREE.BoxGeometry(1.2, 2.8, 1.3), mat(0x55525a), { pos: [-1.3, 1.4, sz] }));
  g.add(mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshStandardMaterial({ map: tex.sign('Drakengrot\nNiet wakker maken!', { w: 512, h: 200, size: 44, bg: '#2a2030', fg: '#ff9a5a' }) }), { cast: false, pos: [-2.2, 6.6, 0], rot: [0, -PI / 2, 0] }));
  W.put(g, x, z, 0); W.circle(x + 6, z, 9); W.circle(x + 4, z - 8, 6); W.circle(x + 4, z + 8, 6);
  // kristallen
  for (const [cx, cz, c] of [[-5, 3, 0x9d6bff], [-4.5, -4.5, 0x58e0ff], [-3, 6.5, 0xff6bd8]]) { const cr = P.crystal(c, 2.0); W.put(cr, x + cx - 3, z + cz, rand(0, 6)); W.circle(x + cx - 3, z + cz, 0.8); }
  // rails + kar
  for (let i = 0; i < 6; i++) { const t = mesh(new THREE.BoxGeometry(2.4, 0.08, 0.2), mat(0x5b3d24), { cast: false }); W.put(t, x - 9 + i * 1.2, z + 4, PI / 2, 0.06); }
  const mc = new THREE.Group(); mc.add(mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.9, 8, 1, true), mat(0x555a66, { side: THREE.DoubleSide, metalness: 0.5 }), { pos: [0, 0.8, 0] })); for (let i = 0; i < 5; i++) mc.add(mesh(new THREE.DodecahedronGeometry(0.28), mat(0xffd23f, { metalness: 0.8, roughness: 0.3 }), { pos: [(i - 2) * 0.28, 1.35, Math.sin(i) * 0.2] })); W.put(mc, x - 8, z + 4, 0.3); W.circle(x - 8, z + 4, 1);
  const pk = P.hammer(0x8a8a90); W.put(pk, x - 6, z - 2, 1, 0.1); pk.rotation.z = 1.4;
  const tl = P.torch(0xff9a3a); W.put(tl, x - 4.5, z - 3.6, 0); W.torches.push(tl);
  const tl2 = P.torch(0xff9a3a); W.put(tl2, x - 4.5, z + 3.6, 0); W.torches.push(tl2);
}

// ---------------------------------------------------------------- kasteelplein en kasteel
function buildCastleYard(W) {
  const cx = -2, cz = -49; const sm = new THREE.MeshStandardMaterial({ map: tex.stone(4, 1), roughness: 0.95, flatShading: true });
  for (const [x, z, w, d] of [[cx - 13, cz - 2, 1.6, 14], [cx + 13, cz - 2, 1.6, 14], [cx, cz - 9.2, 26, 1.6]]) { const wl = mesh(new THREE.BoxGeometry(w, 3.2, d), sm, { pos: [0, 1.6, 0] }); const gp = new THREE.Group(); gp.add(wl); for (let i = 0; i < Math.floor(Math.max(w, d) / 1.8); i++) gp.add(mesh(new THREE.BoxGeometry(w > d ? 1.0 : w, 0.7, w > d ? d : 1.0), sm, { pos: w > d ? [-w / 2 + 0.9 + i * 1.8, 3.55, 0] : [0, 3.55, -d / 2 + 0.9 + i * 1.8] })); W.put(gp, x, z, 0); W.box(x, z, w, d); }
  for (const [x, z] of [[cx - 13, cz + 5], [cx + 13, cz + 5]]) { const t = P.tower(6, 1.6); W.put(t, x, z, 0); W.circle(x, z, 2.2); }
  for (const [x, z] of [[cx - 7, cz - 6], [cx + 6, cz - 7], [cx + 9, cz - 1]]) { const d = dummy(); W.put(d, x, z, rand(-0.5, 0.5)); W.circle(x, z, 0.6); }
  for (const [x, z] of [[cx - 9, cz + 2], [cx - 8, cz - 3]]) { const t = target(); W.put(t, x, z, 0.6); }
  for (const [x, z, c] of [[cx - 4, cz - 8.5, 0xd8372c], [cx + 4, cz - 8.5, 0xd8372c]]) { const b = P.banner(c, 2.6, 1.0); W.put(b, x, z, 0); W.updaters.push((dt, t) => P.animateBanner(b, t + x)); }
  const wr = new THREE.Group(); for (let i = 0; i < 4; i++) { wr.add(mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), mat(0x6b4a2e), { pos: [i * 0.5 - 0.7, 0.8, 0] })); wr.add(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.02), mat(0xdfe4ee, { metalness: 0.8 }), { pos: [i * 0.5 - 0.7, 1.9, 0] })); } wr.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 0.4), mat(0x5b3d24), { pos: [0, 0.6, 0] })); W.put(wr, cx + 5, cz - 8, 0); 
  const brz = brazier(); W.put(brz, cx + 2, cz + 4, 0); W.torches.push(brz);
}

function buildCastle(W) {
  const cx = CASTLE.x, cz = CASTLE.z; const y = CASTLE.y;
  const sm = new THREE.MeshStandardMaterial({ map: tex.stone(5, 3), roughness: 0.95, flatShading: true });
  const keep = new THREE.Group();
  keep.add(mesh(new THREE.BoxGeometry(18, 18, 14), sm, { pos: [0, 9, 0] }));
  for (let i = 0; i < 9; i++) keep.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), sm, { pos: [-8 + i * 2, 18.6, 6.6] }));
  keep.add(mesh(new THREE.BoxGeometry(6, 8, 6), sm, { pos: [0, 22, 0] })); keep.add(mesh(new THREE.ConeGeometry(5, 7, 4), mat(0x3b58a8), { pos: [0, 29, 0], rot: [0, PI / 4, 0] }));
  for (const [tx, tz] of [[-10, 8], [10, 8], [-10, -8], [10, -8]]) { const t = P.tower(15, 2.6); t.position.set(tx, 0, tz); keep.add(t); }
  keep.add(mesh(new THREE.BoxGeometry(5, 6.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x000000 }), { pos: [0, 3.25, 7.2] }));
  keep.add(mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 12, PI), mat(0x55525a), { pos: [0, 6.5, 7.2] }));
  for (let i = 0; i < 6; i++) keep.add(mesh(new THREE.BoxGeometry(0.2, 6.5, 0.3), mat(0x2a2a30), { cast: false, pos: [-2.4 + i * 0.96, 3.25, 7.5] }));
  for (const sx of [-5, 5]) { const w = mesh(new THREE.BoxGeometry(1.1, 2.4, 0.3), glow(0xffd27a, 0.8), { cast: false, pos: [sx * 1.4, 12, 7.1] }); keep.add(w); W.glowMats.push(w.material); }
  W.add(keep); keep.position.set(cx, y, cz); W.box(cx, cz, 20, 16); 
  for (const [wx, wz, w, d] of [[cx - 22, cz + 3, 1.8, 24], [cx + 22, cz + 3, 1.8, 24], [cx, cz - 14, 46, 1.8]]) { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(w, 5, d), sm, { pos: [0, 2.5, 0] })); W.put(g, wx, wz, 0); g.position.y = y; }
  for (const [tx, tz] of [[cx - 22, cz + 15], [cx + 22, cz + 15], [cx - 22, cz - 14], [cx + 22, cz - 14]]) { const t = P.tower(10, 2.4); t.position.set(tx, y, tz); W.add(t); }
  for (const [bx, bz, c] of [[cx - 7, cz + 8.5, 0x3b58a8], [cx + 7, cz + 8.5, 0x3b58a8]]) { const b = P.banner(c, 5, 1.6); b.position.set(bx, y + 9, bz); W.add(b); W.updaters.push((dt, t) => P.animateBanner(b, t)); }
  // kasteelpoort (decor): de koning zit in de Speelhal, dus de poort is dicht
  const gate = new THREE.Group(); gate.add(mesh(new THREE.BoxGeometry(0.8, 6, 0.8), mat(0x3a2a52), { pos: [-3.5, 3, 0] })); gate.add(mesh(new THREE.BoxGeometry(0.8, 6, 0.8), mat(0x3a2a52), { pos: [3.5, 3, 0] })); gate.add(mesh(new THREE.BoxGeometry(8.4, 1.4, 0.8), mat(0x3a2a52), { pos: [0, 6.2, 0] }));
  gate.add(mesh(new THREE.PlaneGeometry(7.4, 1.1), new THREE.MeshStandardMaterial({ map: tex.sign('Kasteel dicht: de koning\nzit in de Speelhal!', { w: 768, h: 160, size: 48, bg: '#5a1fd1', fg: '#ffe14a' }) }), { cast: false, pos: [0, 6.2, 0.45] }));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const l = mesh(new THREE.SphereGeometry(0.28, 6, 5), glow([0xff5a5a, 0xffd23f, 0x5ab4ff][i], 1.2), { cast: false, pos: [sx * 3.5, 1.2 + i * 1.8, 0.6] }); gate.add(l); W.glowMats.push(l.material); }
  W.put(gate, POORT.x, POORT.z, 0); W.circle(-3.5, POORT.z, 0.6); W.circle(3.5, POORT.z, 0.6);
}

// ---------------------------------------------------------------- oude muur (Metselaar Mo)
function buildWall(W) {
  const cx = -26, cz = -52; const sm = new THREE.MeshStandardMaterial({ map: tex.bricks(3, 1), roughness: 0.95, flatShading: true });
  const wall = new THREE.Group();
  for (let i = 0; i < 9; i++) { const hh = 1.4 + Math.abs(Math.sin(i * 1.7)) * 2.8; wall.add(mesh(new THREE.BoxGeometry(1.6, hh, 1.2), sm, { pos: [-7 + i * 1.7, hh / 2, 0] })); }
  W.put(wall, cx, cz - 2, 0.2); W.box(cx, cz - 2, 15, 1.6, 0.2);
  for (let i = 0; i < 12; i++) { const b = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.25), sm, { pos: [0, 0.12 + (i % 4) * 0.25, 0] }); W.put(b, cx + 3 + (i % 3) * 0.55, cz + 2 + Math.floor(i / 4) * 0.3, rand(0, 3)); }
  const sc = new THREE.Group(); for (const sx of [-1, 1]) sc.add(mesh(new THREE.BoxGeometry(0.12, 6, 0.12), mat(0x7a5530), { pos: [sx * 2, 3, 0] })); for (let i = 1; i < 4; i++) sc.add(mesh(new THREE.BoxGeometry(4, 0.1, 1.4), mat(0x9a6f3f), { pos: [0, i * 1.5, 0.4] })); W.put(sc, cx - 5, cz + 0.5, 0.2);
  const wb = wheelbarrow(); W.put(wb, cx + 5, cz + 0.5, 0.8); const hm = P.hammer(); W.put(hm, cx + 1, cz + 1.4, 0.5, 0.05); hm.rotation.z = 1.5;
}

// ---------------------------------------------------------------- bevroren vijver
function buildIce(W) {
  const cx = ICE.x, cz = ICE.z;
  const ice = mesh(new THREE.CylinderGeometry(ICE.r, ICE.r, 0.2, 28), new THREE.MeshStandardMaterial({ map: tex.ice(3, 3), roughness: 0.08, metalness: 0.2, color: 0xdff4ff, emissive: 0x6aa8d8, emissiveIntensity: 0.15 }), { cast: false, pos: [0, 0.05, 0] }); W.put(ice, cx, cz, 0);
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; const s = snowman(); if (i % 5 === 0) { W.put(s, cx + Math.cos(a) * (ICE.r + 3), cz + Math.sin(a) * (ICE.r + 3), a + PI); W.circle(cx + Math.cos(a) * (ICE.r + 3), cz + Math.sin(a) * (ICE.r + 3), 0.8); } else { const r = P.rock(1 + Math.random(), 0xdde8f4); W.put(r, cx + Math.cos(a) * (ICE.r + 0.8), cz + Math.sin(a) * (ICE.r + 0.8), a); } }
  const bz = brazier(); W.put(bz, cx - 15, cz + 4, 0); W.torches.push(bz); W.circle(cx - 15, cz + 4, 0.6);
  const ig = new THREE.Group(); ig.add(mesh(new THREE.SphereGeometry(3, 12, 8, 0, TAU, 0, PI / 2), mat(0xf4f9ff, { flatShading: false }), { pos: [0, 0, 0] })); ig.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 8, 1, false, -PI / 2, PI), mat(0xf4f9ff, { flatShading: false }), { pos: [0, 0.8, 2.6], rot: [0, PI / 2, 0], scale: [1, 1, 1] })); ig.add(mesh(new THREE.CircleGeometry(0.9, 10), new THREE.MeshBasicMaterial({ color: 0x050a14 }), { cast: false, pos: [0, 0.8, 3.1] }));
  W.put(ig, cx + 5, cz - 17, 0.4); W.circle(cx + 5, cz - 17, 3);
}

// ---------------------------------------------------------------- brug
function buildBridge(W) {
  const b = P.bridge(BRIDGE.len, BRIDGE.w); b.position.set(BRIDGE.x, BRIDGE.y - 0.4, BRIDGE.z); W.add(b);
  // bruggebieden langs de randen zodat je er niet vanaf loopt: colliders worden in hub geregeld via isWater
}

// ---------------------------------------------------------------- klus-NPC's
function buildJobNpcs(W) {
  for (const j of JOBS) {
    const o = {}; if (j.lift) o.lift = j.lift;
    if (j.id === 'sumo') o.spec = { shirt: 0xf0b990, bodyW: 2.0, pants: 0x1d6aa5 };
    const n = W.npc(j.npc, j.x, j.z, j.yaw, o); n.jobId = j.id; n.who = j.who; W.jobNpc[j.id] = n;
    W.interact.push({ type: 'job', id: j.id, x: j.x, z: j.z, r: 3.6, label: j.who + ' aanspreken', npc: n });
    W.circle(j.x, j.z, 0.7);
    // vastgehouden prop
    const held = { catch: () => P.bread('loaf'), whack: () => { const hm = P.hammer(); return hm; }, fishing: () => { const r = new THREE.Group(); r.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.4, 4), mat(0x8a5a2b), { pos: [0, 1.2, 0], rot: [0.3, 0, 0] })); return r; }, mudcart: null, rhythm: () => { const g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), mat(0xc89a52), { pos: [0, 0.1, 0.1], scale: [1, 1.2, 0.5] })); g.add(mesh(new THREE.BoxGeometry(0.06, 0.8, 0.05), mat(0x4a3220), { pos: [0, 0.5, 0.1] })); return g; }, breakout: () => P.hammer(), sweeper: () => { const s = P.sword(); return s; }, goblins: () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 5), mat(0x6b4a2e), { pos: [0, 1.0, 0] })); g.add(mesh(new THREE.TorusGeometry(0.2, 0.04, 5, 8, PI * 1.5), mat(0x6b4a2e), { pos: [0, 2.0, 0] })); return g; }, plates: () => P.hammer(0x777777) }[j.id];
    if (held) { const hobj = held(); if (hobj) { hobj.scale.setScalar(j.id === 'fishing' ? 1 : 1.0); n.hold(hobj, 'r'); } }
  }
}

import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, TAU, rand } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { Animal, makeNPC } from '../engine/chars.js';
import { groundY } from './terrain.js';
import { JOBS, JOB_BY_ID, ARCADE, HOME, PLAZA, BOOTH, BOARD, CAVE, CASTLE, CONCERT_GATE, ICE, SWAMP, FARM, PASTURE, BRIDGE, riverX } from './layout.js';
import { stall, tent, bench, table, mug, cart, milkCan, scarecrow, dummy, target, wheelbarrow, snowman, brazier, cabbageRows, stripedTex } from './build.js';

const PI = Math.PI;

export function buildVillage(W) {
  buildPlaza(W); buildHome(W); buildBakery(W); buildTavern(W); buildWarehouse(W); buildFarm(W); buildMud(W); buildPasture(W);
  buildPier(W); buildArcadeGate(W); buildWitch(W); buildCave(W); buildCastleYard(W); buildCastle(W); buildWall(W); buildIce(W); buildBridge(W);
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
  // banieren met DutchTuber-poster
  for (const [x, z, yaw] of [[-5, 9, 0.3], [5, 9, -0.3], [-13, -4, 1.6], [13, -9, -1.6], [-5, -13, 0], [6, -13, 0]]) {
    const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4, 5), mat(0x4a3220), { pos: [0, 1.7, 0] }));
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.95, 0.08), new THREE.MeshStandardMaterial({ map: tex.poster('DutchTuber'), roughness: 0.8 }), { pos: [0, 2.3, 0.05] }));
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
  // kaartverkoop-kraam
  const booth = new THREE.Group();
  booth.add(mesh(new THREE.BoxGeometry(3.2, 2.4, 2.2), new THREE.MeshStandardMaterial({ map: tex.plaster(2, 1, '#f3d9a4'), roughness: 0.9 }), { pos: [0, 1.2, 0] }));
  booth.add(mesh(new THREE.ConeGeometry(2.7, 1.6, 4), mat(0xd8357f), { pos: [0, 3.2, 0], rot: [0, PI / 4, 0] }));
  booth.add(mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), mat(0x111111), { pos: [0, 1.5, 1.12] }));
  booth.add(mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: tex.sign('KAARTJES DutchTuber LIVE', { w: 768, h: 160, size: 56, bg: '#5a1fd1', fg: '#ffe14a' }) }), { cast: false, pos: [0, 2.3, 1.13] }));
  booth.add(mesh(new THREE.PlaneGeometry(1.1, 1.65), new THREE.MeshStandardMaterial({ map: tex.poster('DutchTuber') }), { cast: false, pos: [-1.65, 1.5, 0.3], rot: [0, -PI / 2, 0] }));
  W.put(booth, BOOTH.x, BOOTH.z, 0.4); W.box(BOOTH.x, BOOTH.z, 3.4, 2.4, 0.4);
  const lotte = W.npc('princess', BOOTH.x + 0.6, BOOTH.z + 0.9, 0.4, { spec: { hat: 'beanie', hatColor: 0x5a1fd1, hatColor2: 0xffe14a, shirt: 0xd8357f, tunic: 0xd8357f, hair: 0x2a1a30 } });
  lotte.group.position.y += 0.1; W.jobNpc.booth = lotte;
  W.interact.push({ type: 'booth', x: BOOTH.x + 0.4, z: BOOTH.z + 2.4, r: 3.2, label: 'Kaartjes kopen' });
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
  // poort van het concert
  const gate = new THREE.Group(); gate.add(mesh(new THREE.BoxGeometry(0.8, 6, 0.8), mat(0x3a2a52), { pos: [-3.5, 3, 0] })); gate.add(mesh(new THREE.BoxGeometry(0.8, 6, 0.8), mat(0x3a2a52), { pos: [3.5, 3, 0] })); gate.add(mesh(new THREE.BoxGeometry(8.4, 1.4, 0.8), mat(0x3a2a52), { pos: [0, 6.2, 0] }));
  gate.add(mesh(new THREE.PlaneGeometry(7.4, 1.1), new THREE.MeshStandardMaterial({ map: tex.sign('DutchTuber LIVE', { w: 768, h: 128, size: 66, bg: '#5a1fd1', fg: '#ffe14a' }) }), { cast: false, pos: [0, 6.2, 0.45] }));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const l = mesh(new THREE.SphereGeometry(0.28, 6, 5), glow([0xff5a5a, 0xffd23f, 0x5ab4ff][i], 1.2), { cast: false, pos: [sx * 3.5, 1.2 + i * 1.8, 0.6] }); gate.add(l); W.glowMats.push(l.material); }
  W.put(gate, CONCERT_GATE.x, CONCERT_GATE.z, 0); W.circle(-3.5, CONCERT_GATE.z, 0.6); W.circle(3.5, CONCERT_GATE.z, 0.6);
  W.interact.push({ type: 'gate', x: CONCERT_GATE.x, z: CONCERT_GATE.z + 2.5, r: 5, label: 'Naar het concert' });
  W.gateBeam = mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
  W.gateBeam.position.set(CONCERT_GATE.x, groundY(CONCERT_GATE.x, CONCERT_GATE.z) + 30, CONCERT_GATE.z + 2.5); W.gateBeam.visible = false; W.add(W.gateBeam);
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

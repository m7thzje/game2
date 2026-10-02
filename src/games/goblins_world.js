import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, mulberry32, TAU, rand } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC } from '../engine/chars.js';
import * as P from '../engine/props.js';

// De schaapsweide van "Goblin-jacht": kooi, kampvuur, windmolen, bossen, poorten waar de goblins uit komen.
export const GATES = [
  [-21.5, -5.5], [-21.5, 4.5], [21.5, -5.5], [21.5, 4.5], [-9, -13.2], [8, -13.2], [-11.5, 13.2], [10.5, 13.2],
];
export const CAMP = { x: 8.2, z: 3.4 };
export const PEN_R = 4.4;

function instanced(geo, material, items, cast = false) {
  const im = new THREE.InstancedMesh(geo, material, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); p.set(it.x, it.y, it.z);
    s.set(it.sx ?? it.s, it.sy ?? it.s, it.sz ?? it.s); m.compose(p, q, s); im.setMatrixAt(i, m);
    if (it.color != null) { c.set(it.color); im.setColorAt(i, c); }
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = false; im.frustumCulled = false;
  return im;
}

// Voegt alle statische meshes van een groep samen (1 draw call per materiaal)
export function bake(root, cast = true) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { let a = byMat.get(o.material); if (!a) byMat.set(o.material, a = []); a.push(o); } });
  const out = new THREE.Group();
  const v = new THREE.Vector3(), n = new THREE.Vector3(); const nm = new THREE.Matrix3();
  for (const [m, list] of byMat) {
    let nv = 0, ni = 0;
    for (const o of list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const o of list) {
      const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        if (na) { n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor[(vo + i) * 3] = n.x; nor[(vo + i) * 3 + 1] = n.y; nor[(vo + i) * 3 + 2] = n.z; }
        if (ua) { uv[(vo + i) * 2] = ua.getX(i); uv[(vo + i) * 2 + 1] = ua.getY(i); }
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < pa.count; i++) idx[io++] = vo + i;
      vo += pa.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const me = new THREE.Mesh(geo, m); me.castShadow = cast; me.receiveShadow = true; me.frustumCulled = false; out.add(me);
  }
  return out;
}
// Meshes die direct kinderen van `parent` zijn en hetzelfde materiaal delen samenvoegen
export function mergeChildren(parent, material) {
  const list = parent.children.filter((o) => o.isMesh && o.material === material);
  if (list.length < 2) return;
  const tmp = new THREE.Group(); for (const o of list) { o.updateMatrix(); tmp.add(o.clone()); }
  const b = bake(tmp, true).children[0]; for (const o of list) parent.remove(o); parent.add(b);
}

let _soft = null;
function softDirt() {
  if (_soft) return _soft;
  _soft = canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(4);
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    gr.addColorStop(0, 'rgba(120,92,60,0.95)'); gr.addColorStop(0.6, 'rgba(110,84,54,0.75)'); gr.addColorStop(1, 'rgba(100,76,48,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? 'rgba(70,50,30,.35)' : 'rgba(170,140,100,.3)'; g.fillRect(20 + r() * 88, 20 + r() * 88, 2 + r() * 3, 2 + r() * 3); }
  });
  _soft.userData.keep = true; return _soft;
}

export function buildWorld(ctx) {
  const { scene, fx } = ctx;
  const rng = mulberry32(2024);
  const R = (a, b) => a + rng() * (b - a);
  const obstacles = [];   // {x,z,r}
  const anim = { flames: [], flameIM: null, banners: [], blades: null, fire: null, fireflies: null, fireflyBase: [], lanterns: [] };
  const S = new THREE.Group();   // alles wat statisch is wordt aan het eind samengevoegd

  // ---------- grond ----------
  const ground = mesh(new THREE.PlaneGeometry(170, 120), new THREE.MeshStandardMaterial({ map: tex.grass(42, 30), color: 0xc4d6e6, roughness: 1 }), { cast: false, pos: [0, 0, -4], rot: [-Math.PI / 2, 0, 0] });
  scene.add(ground);

  // zachte vlekken van platgelopen aarde: paden van de poorten naar de kooi
  const dirtMat = new THREE.MeshBasicMaterial({ map: softDirt(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0xb8b4c8 });
  const dirtItems = [];
  for (const [gx, gz] of GATES) {
    const full = Math.hypot(gx, gz), len = full - PEN_R - 1.5, n = Math.floor(len / 2.2);
    for (let i = 0; i < n; i++) {
      const k = i / n * (len / full);
      dirtItems.push({ x: gx * (1 - k) + R(-0.6, 0.6), y: 0.03, z: gz * (1 - k) + R(-0.6, 0.6), rx: -Math.PI / 2, rz: R(0, TAU), sx: R(3.2, 4.4), sy: R(3.2, 4.4), sz: 1 });
    }
  }
  const dirtIM = instanced(new THREE.PlaneGeometry(1, 1), dirtMat, dirtItems); dirtIM.renderOrder = 1; scene.add(dirtIM);

  // ---------- schaapskooi ----------
  scene.add(mesh(new THREE.CircleGeometry(PEN_R - 0.2, 40), new THREE.MeshStandardMaterial({ map: tex.dirt(2.5, 2.5), color: 0xc8b8a8, roughness: 1 }), { cast: false, pos: [0, 0.04, 0], rot: [-Math.PI / 2, 0, 0] }));
  const straw = [];
  for (let i = 0; i < 46; i++) { const a = R(0, TAU), d = Math.sqrt(rng()) * (PEN_R - 0.8); straw.push({ x: Math.cos(a) * d, y: 0.08, z: Math.sin(a) * d, ry: R(0, TAU), sx: R(0.5, 1.0), sy: 1, sz: 1, color: [0xe4cc7a, 0xd6b85a, 0xefdc92][i % 3] }); }
  scene.add(instanced(new THREE.BoxGeometry(0.8, 0.04, 0.09), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), straw));
  // hekwerk
  const SEG = 16, gateA = Math.PI / 2;
  const woodM = mat(0x9b7348), postM = mat(0x7a5a38);
  for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * TAU, a1 = (i + 1) / SEG * TAU, am = (a0 + a1) / 2;
    const x0 = Math.cos(a0) * PEN_R, z0 = Math.sin(a0) * PEN_R, x1 = Math.cos(a1) * PEN_R, z1 = Math.sin(a1) * PEN_R;
    const post = mesh(new THREE.BoxGeometry(0.2, 1.3, 0.2), postM, { pos: [x0, 0.65, z0] }); S.add(post);
    const gap = Math.abs(Math.atan2(Math.sin(am - gateA), Math.cos(am - gateA))) < 0.2;
    if (gap) { post.scale.y = 1.5; post.position.y = 0.97; continue; }
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
    for (const y of [0.45, 0.95]) S.add(mesh(new THREE.BoxGeometry(len + 0.05, 0.12, 0.08), woodM, { pos: [(x0 + x1) / 2, y, (z0 + z1) / 2], rot: [0, ang, 0] }));
  }
  // lantaarns bij de poort
  const lanM = glow(0xffd27a, 2.0);
  for (const sd of [-1, 1]) {
    const a = gateA + sd * (TAU / SEG) * 0.5; const lx = Math.cos(a) * PEN_R, lz = Math.sin(a) * PEN_R;
    S.add(mesh(new THREE.SphereGeometry(0.26, 8, 6), lanM, { cast: false, pos: [lx, 2.2, lz] }));
    S.add(mesh(new THREE.TorusGeometry(0.28, 0.04, 4, 10), mat(0x2e2e3a), { pos: [lx, 2.2, lz], rot: [Math.PI / 2, 0, 0] }));
  }
  const gl = new THREE.PointLight(0xffc878, 1.1, 11, 1.7); gl.position.set(0, 2.2, PEN_R + 0.6); scene.add(gl);
  // bordje
  const sg = new THREE.Group(); sg.position.set(2.8, 0, PEN_R + 1.4); S.add(sg);
  sg.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), mat(0x6b4a2e), { pos: [0, 0.85, 0] }));
  sg.add(mesh(new THREE.BoxGeometry(2.1, 0.9, 0.08), new THREE.MeshStandardMaterial({ map: tex.sign('Schapen\n🐑 Sjoerd', { w: 256, h: 104, size: 34, bg: '#7a5230' }), roughness: 0.9 }), { pos: [0, 1.7, 0], rot: [-0.75, 0.1, 0] }));
  // drinkbak + hooibalen
  const trough = new THREE.Group(); trough.position.set(-5.4, 0, 1.8); trough.rotation.y = 0.5; S.add(trough);
  trough.add(mesh(new THREE.BoxGeometry(2.2, 0.55, 0.8), mat(0x8a6238), { pos: [0, 0.28, 0] }));
  trough.add(mesh(new THREE.BoxGeometry(2.0, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: 0x3d7fc0, emissive: 0x143458, roughness: 0.2 }), { cast: false, pos: [0, 0.52, 0] }));
  const hayM = mat(0xd9b95a, { flatShading: false }), hoopM = mat(0x7a5a2a);
  const hay = (x, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0.55, z); g.rotation.y = ry; g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 12), hayM, { rot: [0, 0, Math.PI / 2] })); for (const sx of [-0.2, 0.2]) g.add(mesh(new THREE.TorusGeometry(0.625, 0.025, 4, 14), hoopM, { pos: [sx, 0, 0], rot: [0, Math.PI / 2, 0] })); S.add(g); };
  hay(-6.4, -3.0, 0.4); hay(-7.6, -2.4, 1.2); hay(-7.0, -3.8, 0.1);
  obstacles.push({ x: -7, z: -3.1, r: 1.6 });

  // ---------- kampvuur ----------
  const camp = P.campfire(); camp.position.set(CAMP.x, 0, CAMP.z); scene.add(camp); anim.fire = camp;
  obstacles.push({ x: CAMP.x, z: CAMP.z, r: 1.1 });
  for (const a of [0.7, 2.4, 4.2]) S.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), mat(0x6b4a2e), { pos: [CAMP.x + Math.cos(a) * 2.2, 0.25, CAMP.z + Math.sin(a) * 2.2], rot: [Math.PI / 2, 0, a + Math.PI / 2] }));
  // herder Sjoerd (bevroren pose, samengevoegd = weinig draw calls; hij reageert met hupjes)
  const sjC = makeNPC('shepherd'); sjC.faceDir(-CAMP.x, -CAMP.z); sjC.pose = 'wave';
  for (let k = 0; k < 40; k++) sjC.update(0.05);
  const sjFrozen = bake(sjC.group, true);
  const sjGroup = new THREE.Group(); sjGroup.add(sjFrozen); sjGroup.position.set(CAMP.x + 1.9, 0, CAMP.z - 1.5); scene.add(sjGroup);
  const sjoerd = { group: sjGroup, pose: 'wave', t: 0, hop: 0,
    update(dt) {
      this.t += dt; const P_ = this.pose;
      let y = 0, rz = 0, sy = 1;
      if (P_ === 'scared') { y = Math.abs(Math.sin(this.t * 16)) * 0.25; rz = Math.sin(this.t * 30) * 0.05; }
      else if (P_ === 'cheer') { y = Math.abs(Math.sin(this.t * 7)) * 0.5; rz = Math.sin(this.t * 7) * 0.06; }
      else if (P_ === 'sad') { sy = 0.93; rz = 0.08; }
      else { rz = Math.sin(this.t * 2) * 0.03; y = Math.abs(Math.sin(this.t * 1.3)) * 0.04; }
      sjGroup.position.y = y; sjGroup.rotation.z = rz; sjGroup.scale.y = sy;
    } };
  const staff = new THREE.Group(); staff.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.1, 5), mat(0x6b4a2e), { pos: [0, 1.0, 0] })); staff.add(mesh(new THREE.TorusGeometry(0.17, 0.035, 5, 10, Math.PI * 1.4), mat(0x6b4a2e), { pos: [0, 2.1, 0], rot: [0, 0, 0.3] }));
  staff.position.set(CAMP.x + 2.5, 0, CAMP.z - 1.1); S.add(staff);

  // ---------- windmolen ----------
  const wm = P.windmill(1.15); wm.position.set(-14.2, 0, -8.2); wm.rotation.y = 0.5;
  obstacles.push({ x: -14.2, z: -8.2, r: 3.1 });
  scene.add(wm); wm.updateMatrixWorld(true);
  const hub = wm.userData.blades; scene.attach(hub); anim.blades = hub;
  scene.remove(wm); S.add(wm);
  

  // ---------- rotsen, paddenstoelen, bloemen ----------
  const rocks = [[6.5, -6.6, 1.4], [-9, 6.4, 1.2], [13.5, 7.2, 1.0], [-3.2, 8.6, 0.85], [-16.5, 2.6, 1.4], [3.0, -9.4, 1.1], [15.5, -3.8, 1.3], [-5.2, -9.0, 0.95]];
  for (const [x, z, s] of rocks) {
    const r = P.rock(s, [0x8a8c94, 0x7a7c86, 0x9a9ca6][Math.floor(rng() * 3)]); r.position.set(x, 0, z); r.rotation.y = R(0, TAU); S.add(r);
    obstacles.push({ x, z, r: s * 0.95 });
    if (s > 1.2) { const b = P.bush(0.8); b.position.set(x + s * 0.9, 0, z + 0.3); S.add(b); }
  }
  // feeënkring van gloeiende paddenstoelen
  const mshA = new THREE.MeshStandardMaterial({ color: 0x58d8ff, emissive: 0x58d8ff, emissiveIntensity: 0.6, flatShading: false }), mshB = new THREE.MeshStandardMaterial({ color: 0xb070ff, emissive: 0xb070ff, emissiveIntensity: 0.6, flatShading: false });
  const stemM = mat(0xf4ecd8);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU, cx = 11.8, cz = -8.0, sz = 0.9 + rng() * 0.4;
    const g = new THREE.Group(); g.position.set(cx + Math.cos(a) * 1.6, 0, cz + Math.sin(a) * 1.6);
    g.add(mesh(new THREE.CylinderGeometry(0.12 * sz, 0.16 * sz, 0.5 * sz, 7), stemM, { pos: [0, 0.25 * sz, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.45 * sz, 10, 7, 0, TAU, 0, Math.PI / 2), i % 2 ? mshA : mshB, { pos: [0, 0.5 * sz, 0] }));
    S.add(g);
  }
  for (const [x, z, c] of [[-4, 6.0, 0xff6fa5], [4.6, 6.2, 0xffe14a], [10.5, -1.5, 0x8fb8ff], [-10, -1.5, 0xff6fa5], [-1, -7, 0xffffff], [14.5, 2.2, 0xffe14a], [-17, -3, 0xff9a3a]]) {
    const f = P.flowerPatch(c, 9, 1.4); f.position.set(x, 0, z); S.add(f);
  }
  // kratten & vaten
  for (const [x, z] of [[12.8, 4.9], [13.9, 5.7]]) { const c = P.crate(1.0); c.position.set(x, 0, z); c.rotation.y = R(0, 1); S.add(c); }
  obstacles.push({ x: 13.4, z: 5.3, r: 1.1 });
  const bar = P.barrel(1.1); bar.position.set(11.8, 0, 6.4); S.add(bar); obstacles.push({ x: 11.8, z: 6.4, r: 0.6 });

  // ---------- vijver ----------
  const pond = new THREE.Group(); pond.position.set(-15.3, 0, 8.2); scene.add(pond);
  const waterTex = tex.water(2, 2);
  const water = mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshStandardMaterial({ map: waterTex, color: 0xa8c8ff, emissive: 0x1a3a6a, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.1 }), { cast: false, pos: [0, 0.07, 0], rot: [-Math.PI / 2, 0, 0], scale: [1.35, 1.0, 1] });
  water.scale.set(1.35, 0.95, 1); pond.add(water); anim.water = waterTex;
  const rimM = mat(0x8a8c94);
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; S.add(mesh(new THREE.DodecahedronGeometry(R(0.28, 0.45), 0), rimM, { pos: [-15.3 + Math.cos(a) * 3.6, 0.12, 8.2 + Math.sin(a) * 2.55], rot: [R(0, 3), R(0, 3), 0], scale: [1, 0.6, 1] })); }
  const padM = mat(0x3a9a4a, { flatShading: false, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) S.add(mesh(new THREE.CircleGeometry(0.36, 8), padM, { cast: false, pos: [-15.3 + R(-2.3, 2.3), 0.1, 8.2 + R(-1.4, 1.4)], rot: [-Math.PI / 2, 0, R(0, 6)] }));
  const reedM = mat(0x4f8f3a);
  for (let i = 0; i < 12; i++) { const a = R(2.5, 5.9); S.add(mesh(new THREE.ConeGeometry(0.05, R(0.9, 1.5), 4), reedM, { pos: [-15.3 + Math.cos(a) * 3.3, 0.6, 8.2 + Math.sin(a) * 2.3], rot: [R(-0.2, 0.2), 0, R(-0.2, 0.2)] })); }
  // kar met hooi
  const cart = new THREE.Group(); cart.position.set(-1.4, 0, -10.2); cart.rotation.y = 0.35; S.add(cart);
  cart.add(mesh(new THREE.BoxGeometry(2.4, 0.2, 1.4), mat(0x8a6238), { pos: [0, 0.75, 0] }));
  for (const sz of [-0.7, 0.7]) cart.add(mesh(new THREE.BoxGeometry(2.4, 0.45, 0.1), mat(0x7a5530), { pos: [0, 1.0, sz] }));
  cart.add(mesh(new THREE.SphereGeometry(0.85, 8, 6), hayM, { pos: [0, 1.15, 0], scale: [1.2, 0.55, 0.75] }));
  for (const sz of [-0.8, 0.8]) { cart.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), mat(0x5b3d24), { pos: [0.3, 0.5, sz], rot: [Math.PI / 2, 0, 0] })); }
  cart.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), mat(0x5b3d24), { pos: [-2.1, 0.7, 0], rot: [0, 0, Math.PI / 2 - 0.1] }));
  obstacles.push({ x: -1.4, z: -10.2, r: 1.4 });

  // ---------- grastufjes ----------
  const tufts = [];
  for (let i = 0; i < 240; i++) { const x = R(-26, 26), z = R(-16, 16); if (Math.hypot(x, z) < PEN_R - 0.3) continue; tufts.push({ x, y: 0.22, z, ry: R(0, TAU), s: R(0.6, 1.3), color: [0x4c8f45, 0x5aa04a, 0x3e7d3e][i % 3] }); }
  scene.add(instanced(new THREE.ConeGeometry(0.1, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), tufts));

  // ---------- bos aan de randen ----------
  const dg = (x, z) => GATES.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 3.4);
  const pines = [], rounds = [], bushes = [];
  const PC = [0x1f5a3c, 0x24663f, 0x2c7a4b, 0x1b4f3a, 0x2a6a52];
  for (let gx = -44; gx <= 44; gx += 3.0) for (let gz = -32; gz <= 30; gz += 3.0) {
    const x = gx + R(-1, 1), z = gz + R(-1, 1);
    if (Math.abs(x) <= 23.2 && Math.abs(z) <= 14.6) continue;
    const out = Math.hypot(Math.max(0, Math.abs(x) - 23.2), Math.max(0, Math.abs(z) - 14.6));
    if (dg(x, z)) continue;
    if (rng() < 0.2) continue;
    const s = R(0.9, 1.7) * (1 + Math.min(out, 8) * 0.03);
    if (rng() < 0.7) pines.push({ x, y: 0, z, ry: R(0, TAU), s, color: PC[Math.floor(rng() * PC.length)] });
    else rounds.push({ x, y: 0, z, ry: R(0, TAU), s: s * 0.95, color: [0x3f9e3a, 0x2f8a46, 0x4aa844][Math.floor(rng() * 3)] });
  }
  for (let i = 0; i < 80; i++) {
    const side = Math.floor(rng() * 4); let x, z;
    if (side === 0) { x = R(-23, 23); z = -14.6 + R(-1, 0.8); } else if (side === 1) { x = R(-23, 23); z = 14.6 + R(0, 1.2); } else if (side === 2) { x = -23.2 + R(-1, 0.5); z = R(-14, 14); } else { x = 23.2 + R(-0.5, 1); z = R(-14, 14); }
    if (dg(x, z)) continue;
    bushes.push({ x, y: 0.3, z, s: R(0.8, 1.5), color: [0x3b9a45, 0x2f7a3a, 0x4aa850][i % 3] });
  }
  scene.add(instanced(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x5b3d24, flatShading: true }), [...pines, ...rounds].map((t) => ({ x: t.x, y: 0.8 * t.s, z: t.z, s: t.s }))));
  const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
  scene.add(instanced(new THREE.ConeGeometry(2.0, 3.6, 7), pm, pines.map((t) => ({ ...t, y: 3.0 * t.s }))));
  scene.add(instanced(new THREE.ConeGeometry(1.3, 2.8, 7), pm, pines.map((t) => ({ ...t, y: 5.0 * t.s }))));
  scene.add(instanced(new THREE.IcosahedronGeometry(1.6, 1), pm, rounds.map((t) => ({ ...t, y: 2.7 * t.s }))));
  scene.add(instanced(new THREE.IcosahedronGeometry(0.9, 1), pm, bushes));

  // ---------- poorten (waar de goblins vandaan komen) ----------
  const flamePos = [], clothMat = mat(0x6b2a2a, { side: THREE.DoubleSide, flatShading: false });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffe14a });
  for (const [gx, gz] of GATES) {
    const g = new THREE.Group(); g.position.set(gx, 0, gz);
    g.rotation.y = Math.abs(gx) > 20 ? (gx > 0 ? -Math.PI / 2 : Math.PI / 2) : (gz > 0 ? Math.PI : 0);
    for (const sd of [-1, 1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.0, 6), mat(0x4a3220), { pos: [sd * 2.1, 1.5, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 6), mat(0x333333), { pos: [sd * 2.1, 3.0, 0] }));
      flamePos.push(new THREE.Vector3(sd * 2.1, 3.35, 0).applyMatrix4(new THREE.Matrix4().compose(g.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.rotation.y, 0)), new THREE.Vector3(1, 1, 1))));
    }
    g.add(mesh(new THREE.BoxGeometry(4.6, 0.22, 0.22), mat(0x4a3220), { pos: [0, 2.7, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 6), mat(0x5b3d24), { pos: [-0.5, 1.0, 0.0] }));
    for (const sd of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.09, 5, 4), eyeM, { cast: false, pos: [sd * 0.25, 1.1, -1.8] }));
    S.add(g);
    // vlag (animeert)
    const cloth = mesh(new THREE.PlaneGeometry(0.9, 0.9, 4, 6), clothMat, { pos: [0, 0, 0] });
    cloth.userData.base = cloth.geometry.attributes.position.array.slice();
    const holder = new THREE.Group(); holder.position.set(gx, 1.5, gz); holder.rotation.y = g.rotation.y; holder.add(cloth); cloth.position.set(-0.05, 0.0, 0);
    scene.add(holder); anim.banners.push(cloth);
  }
  scene.add(bake(S));
  // vlammen: 1 instanced mesh
  const flameIM = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xff9a30 }), flamePos.length);
  flameIM.frustumCulled = false; scene.add(flameIM); anim.flameIM = flameIM;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

  // ---------- vuurvliegjes ----------
  const NF = 70; const fpos = new Float32Array(NF * 3);
  for (let i = 0; i < NF; i++) anim.fireflyBase.push({ x: R(-20, 20), y: R(0.6, 3.2), z: R(-12, 12), ph: R(0, TAU), sp: R(0.3, 0.8) });
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const ff = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xe6ff7a, size: 0.34, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  ff.frustumCulled = false; scene.add(ff); anim.fireflies = ff;

  let sparkT = 0, bannerT = 0;
  function update(dt, t) {
    if (anim.blades) anim.blades.rotation.z += dt * (0.7 + Math.sin(t * 0.3) * 0.2);
    P.animateFire(anim.fire, t);
    for (let i = 0; i < flamePos.length; i++) { _e.set(0, t * 3 + i, 0); _q.setFromEuler(_e); _s.set(1, 1 + Math.sin(t * 12 + i * 2) * 0.22, 1); _m.compose(flamePos[i], _q, _s); flameIM.setMatrixAt(i, _m); }
    flameIM.instanceMatrix.needsUpdate = true;
    bannerT -= dt;
    if (bannerT <= 0) { bannerT = 0.05; for (let k = 0; k < anim.banners.length; k++) { const c = anim.banners[k], p = c.geometry.attributes.position, b = c.userData.base; for (let i = 0; i < p.count; i++) { const x = b[i * 3] + 0.45; p.setZ(i, Math.sin(t * 3 + x * 4 + k) * 0.1 * x); } p.needsUpdate = true; } }
    if (anim.water) { anim.water.offset.x = t * 0.02; anim.water.offset.y = Math.sin(t * 0.3) * 0.03; }
    const pa = anim.fireflies.geometry.attributes.position;
    for (let i = 0; i < NF; i++) { const b = anim.fireflyBase[i]; pa.setXYZ(i, b.x + Math.sin(t * b.sp + b.ph) * 2.2, b.y + Math.sin(t * b.sp * 1.7 + b.ph) * 0.5, b.z + Math.cos(t * b.sp * 0.8 + b.ph) * 2.2); }
    pa.needsUpdate = true;
    anim.fireflies.material.opacity = 0.65 + Math.sin(t * 2.3) * 0.25;
    sparkT -= dt;
    if (sparkT <= 0) {
      sparkT = 0.07;
      fx.particles.emit(CAMP.x + rand(-0.2, 0.2), 0.9, CAMP.z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(1.4, 2.8), rand(-0.3, 0.3), { life: rand(0.8, 1.5), size: 0.2, color: Math.random() < 0.5 ? 0xffb040 : 0xff7a20, gravity: -0.3 });
      if (Math.random() < 0.35) fx.particles.emit(CAMP.x, 1.5, CAMP.z, rand(-0.2, 0.2), rand(0.8, 1.3), rand(-0.2, 0.2), { life: 2.0, size: 0.8, color: 0x555a6a, gravity: -0.2, shrink: false });
    }
  }
  return { obstacles, update, sjoerd, gates: GATES };
}

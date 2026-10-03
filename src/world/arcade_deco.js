// Deco: bouwt veel kleine primitieven (dozen, cilinders, bollen...) met een eigen kleur en voegt ze samen tot een paar meshes
// (vertexkleuren). Zo kost een hele hal vol decor maar een handvol draw calls.
//   const D = new Deco();  D.box(w,h,d, x,y,z, 0xff0000);  D.at(x,y,z,ry, () => {...lokale coordinaten...});  D.build(scene)
// kind: 'lit' (standaard, belicht), 'metal', 'dbl' (dubbelzijdig), 'glow' (onbelicht/stralend), 'p0' 'p1' 'p2' (stralend + pulserend in fases), 'win' (geen mist)
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _n = new THREE.Matrix3(), _nv = new THREE.Vector3();
const GEO = new Map();
const geo = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };

export class Deco {
  constructor() { this.items = {}; this.M = new THREE.Matrix4(); this.stack = []; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    this.stack.push(this.M.clone());
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _l.compose(_p.set(x, y, z), _q, _s.set(s, s, s)); this.M.multiply(_l); return this;
  }
  pop() { this.M.copy(this.stack.pop()); return this; }
  at(x, y, z, ry, fn, rx = 0, rz = 0, s = 1) { this.push(x, y, z, ry, rx, rz, s); fn(this); this.pop(); return this; }
  // basis: een (gecachte) geometrie met kleur, positie en optionele rotatie/schaal
  add(g, color, x = 0, y = 0, z = 0, o = {}) {
    o = o || {}; const kind = o.kind || 'lit';
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _l.compose(_p.set(x, y, z), _q, _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));
    const m = new THREE.Matrix4().multiplyMatrices(this.M, _l);
    (this.items[kind] ||= []).push({ g, m, c: new THREE.Color(color) });
    return this;
  }
  box(w, h, d, x, y, z, color, o) { return this.add(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), color, x, y, z, o); }
  cyl(rt, rb, h, seg, x, y, z, color, o) { return this.add(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), color, x, y, z, o); }
  cone(r, h, seg, x, y, z, color, o) { return this.add(geo(`n${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), color, x, y, z, o); }
  sph(r, x, y, z, color, o, seg = 8) { return this.add(geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2))), color, x, y, z, o); }
  tor(R, r, x, y, z, color, o, seg = 10, arc = Math.PI * 2) { return this.add(geo(`t${R},${r},${seg},${arc}`, () => new THREE.TorusGeometry(R, r, 5, seg, arc)), color, x, y, z, o); }
  pln(w, h, x, y, z, color, o) { return this.add(geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), color, x, y, z, o); }
  disc(r, x, y, z, color, o, seg = 24) { return this.add(geo(`d${r},${seg}`, () => new THREE.CircleGeometry(r, seg)), color, x, y, z, { rx: -Math.PI / 2, ...o }); }
  ring(r0, r1, x, y, z, color, o, seg = 28) { return this.add(geo(`r${r0},${r1},${seg}`, () => new THREE.RingGeometry(r0, r1, seg)), color, x, y, z, { rx: -Math.PI / 2, ...o }); }
  tri(w, h, x, y, z, color, o) { return this.add(geo(`tri${w},${h}`, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); return g; }), color, x, y, z, o); }

  // alle items van een soort samenvoegen tot een BufferGeometry met vertexkleuren
  merged(kind) {
    const list = this.items[kind]; if (!list || !list.length) return null;
    let nv = 0, ni = 0; for (const it of list) { nv += it.g.attributes.position.count; ni += it.g.index ? it.g.index.count : it.g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const it of list) {
      const g = it.g, pa = g.attributes.position, na = g.attributes.normal, n = pa.count; _n.getNormalMatrix(it.m);
      for (let i = 0; i < n; i++) {
        _p.fromBufferAttribute(pa, i).applyMatrix4(it.m); pos[(vo + i) * 3] = _p.x; pos[(vo + i) * 3 + 1] = _p.y; pos[(vo + i) * 3 + 2] = _p.z;
        _nv.fromBufferAttribute(na, i).applyMatrix3(_n).normalize(); nor[(vo + i) * 3] = _nv.x; nor[(vo + i) * 3 + 1] = _nv.y; nor[(vo + i) * 3 + 2] = _nv.z;
        col[(vo + i) * 3] = it.c.r; col[(vo + i) * 3 + 1] = it.c.g; col[(vo + i) * 3 + 2] = it.c.b;
      }
      if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; } else for (let i = 0; i < n; i++) idx[io++] = vo + i;
      vo += n;
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3)); mg.setIndex(new THREE.BufferAttribute(idx, 1));
    mg.computeBoundingSphere(); return mg;
  }
  // voegt alle meshes toe aan de scene; retourneert { lit, metal, ... } (alleen de soorten die gebruikt zijn)
  build(scene, { shadow = true } = {}) {   // scene = elke Object3D
    const out = {}; const vc = { vertexColors: true };
    const mats = {
      lit: () => new THREE.MeshStandardMaterial({ ...vc, flatShading: true, roughness: 0.85 }),
      metal: () => new THREE.MeshStandardMaterial({ ...vc, flatShading: true, roughness: 0.35, metalness: 0.6 }),
      dbl: () => new THREE.MeshStandardMaterial({ ...vc, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }),
      glow: () => new THREE.MeshBasicMaterial({ ...vc }),
      p0: () => new THREE.MeshBasicMaterial({ ...vc }), p1: () => new THREE.MeshBasicMaterial({ ...vc }), p2: () => new THREE.MeshBasicMaterial({ ...vc }),
      win: () => new THREE.MeshBasicMaterial({ ...vc, fog: false }),
    };
    for (const kind of Object.keys(this.items)) {
      const g = this.merged(kind); if (!g) continue;
      const m = new THREE.Mesh(g, mats[kind]()); const lit = kind === 'lit' || kind === 'metal' || kind === 'dbl';
      m.castShadow = lit && shadow; m.receiveShadow = lit; m.matrixAutoUpdate = false; m.userData.deco = kind;
      scene.add(m); out[kind] = m;
    }
    return out;
  }
}

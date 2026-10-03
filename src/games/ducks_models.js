import * as THREE from 'three';
import { mat, mesh, TAU, clamp } from '../engine/util.js';
import { makeBrother, makeDeurman, PLAYER_COLORS } from '../engine/chars.js';

// Modellen voor de Eendenrace: eend (met poppetje), krokodil, roeiboot met Deurman, gouden eend, zeepbel, waterkanon.
const SH = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true, ...o });

// Gedeelde eend-geometrie (lokaal +z = vooruit)
let _duck = null;
function duckGeo() {
  if (_duck) return _duck;
  _duck = {
    body: new THREE.SphereGeometry(0.7, 16, 12), head: new THREE.SphereGeometry(0.4, 14, 10), tail: new THREE.ConeGeometry(0.3, 0.6, 7),
    beak: new THREE.BoxGeometry(0.36, 0.1, 0.34), eye: new THREE.SphereGeometry(0.095, 8, 6), pupil: new THREE.SphereGeometry(0.05, 6, 5),
    wing: new THREE.SphereGeometry(0.42, 10, 8), ring: new THREE.TorusGeometry(0.74, 0.17, 8, 24), hat: new THREE.ConeGeometry(0.2, 0.5, 8), ball: new THREE.SphereGeometry(0.07, 6, 5),
  };
  // zwemband met strepen (vertexkleuren)
  const g = _duck.ring, col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) { const a = Math.atan2(g.attributes.position.getZ(i) * 0 + g.attributes.position.getY(i), g.attributes.position.getX(i)) + Math.PI; const on = Math.floor(a / TAU * 8) % 2; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = on ? 1 : 0.55; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return _duck;
}

// Eend: { group (positie/heading), tilt (rol/squash), body, wings[], rider (Character) }
export function makeDuck(i, { gold = false, rider = true } = {}) {
  const G = duckGeo(); const pc = PLAYER_COLORS[i];
  const bodyC = gold ? 0xffc928 : [0x62d94a, 0x3b82ff][i];
  const bm = SH(bodyC, { roughness: 0.45, emissive: gold ? 0xff9a10 : 0x000000, emissiveIntensity: gold ? 0.55 : 0 });
  const group = new THREE.Group(), tilt = new THREE.Group(); group.add(tilt);
  const add = (geo, m, p, s, r) => { const o = mesh(geo, m, { cast: false, receive: false, pos: p, scale: s, rot: r }); tilt.add(o); return o; };
  const body = add(G.body, bm, [0, 0.42, 0], [0.88, 0.72, 1.2]);
  add(G.tail, bm, [0, 0.62, -0.88], null, [-1.9, 0, 0]);
  add(G.body, bm, [0, 0.85, 0.45], [0.42, 0.55, 0.42]);                       // nek
  const head = add(G.head, bm, [0, 1.12, 0.62]);
  const bkm = SH(0xff8a1a);
  add(G.beak, bkm, [0, 1.07, 1.0]); add(G.beak, bkm, [0, 0.99, 0.98], [0.9, 0.7, 0.85]);
  for (const s of [-1, 1]) { add(G.eye, SH(0xffffff, { roughness: 0.3 }), [s * 0.22, 1.22, 0.86]); add(G.pupil, SH(0x101010), [s * 0.235, 1.22, 0.93]); }
  const wings = [-1, 1].map((s) => { const w = add(G.wing, bm, [s * 0.66, 0.52, -0.05], [0.28, 0.5, 0.78], [0, 0, s * 0.35]); w.userData.s = s; return w; });
  const ringM = new THREE.MeshStandardMaterial({ color: pc, roughness: 0.5, vertexColors: true });
  const ring = add(G.ring, ringM, [0, 0.3, 0], [1, 1, 1], [Math.PI / 2, 0, 0]); ring.scale.set(0.9, 1.25, 1);
  ring.rotation.set(Math.PI / 2, 0, 0); ring.scale.set(0.95, 1.3, 1);
  const hat = add(G.hat, SH(pc, { roughness: 0.4 }), [0, 1.62, 0.6], null, [0.18, 0, 0]); add(G.ball, SH(0xffffff), [0, 1.9, 0.62]);
  let rider_ = null;
  if (rider) {
    rider_ = makeBrother(i); const holder = new THREE.Group(); holder.add(rider_.group); holder.scale.setScalar(0.44);
    holder.position.set(0, 0.92, -0.2); tilt.add(holder); rider_.pose = 'sit'; rider_.group.position.y = 0;
  }
  return { group, tilt, body, head, wings, ring, rider: rider_ };
}

// Krokodil: kijkt naar -x (stroomopwaarts). { group, jaw, update(t, open) }
export function makeCroc() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); inner.rotation.y = -Math.PI / 2;     // lokaal +z wordt -x
  const gm = SH(0x4aa63a, { roughness: 0.55 }), dk = SH(0x2f7a2a), bel = SH(0xd8e8a0), wh = SH(0xffffff, { roughness: 0.3 });
  const put = (geo, m, p, s, r) => { const o = mesh(geo, m, { cast: false, receive: false, pos: p, scale: s, rot: r }); inner.add(o); return o; };
  put(new THREE.CapsuleGeometry(0.78, 3.0, 4, 10), gm, [0, 0.1, -0.6], [1, 1, 1], [Math.PI / 2, 0, 0]);
  put(new THREE.ConeGeometry(0.62, 2.4, 8), gm, [0, 0.05, -3.2], null, [-Math.PI / 2, 0, 0]);             // staart
  put(new THREE.BoxGeometry(1.0, 0.38, 1.6), gm, [0, 0.12, 1.75]);                                          // snuit boven
  put(new THREE.BoxGeometry(0.9, 0.32, 0.5), dk, [0, 0.3, 2.45]);
  for (const s of [-1, 1]) { put(new THREE.SphereGeometry(0.26, 8, 6), wh, [s * 0.42, 0.92, 0.85]); put(new THREE.SphereGeometry(0.13, 6, 5), SH(0x101010), [s * 0.44, 0.97, 1.02]); put(new THREE.SphereGeometry(0.15, 6, 5), dk, [s * 0.36, 0.98, 2.3]); }
  for (let k = 0; k < 6; k++) put(new THREE.ConeGeometry(0.2, 0.42, 5), dk, [0, 0.95 - k * 0.04, -0.4 - k * 0.55]);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.12, 0.7); inner.add(jaw);
  const jm = mesh(new THREE.BoxGeometry(0.95, 0.26, 1.7), bel, { cast: false, receive: false, pos: [0, 0, 1.0] }); jaw.add(jm);
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) { jaw.add(mesh(new THREE.ConeGeometry(0.07, 0.24, 4), wh, { cast: false, receive: false, pos: [s * 0.4, 0.2, 0.45 + k * 0.32] })); inner.add(mesh(new THREE.ConeGeometry(0.07, 0.24, 4), wh, { cast: false, receive: false, pos: [s * 0.4, -0.02, 0.9 + k * 0.32], rot: [Math.PI, 0, 0] })); }
  return { group: g, inner, jaw, update(t, open) { jaw.rotation.x = open * 0.6; inner.position.y = Math.sin(t * 2) * 0.05; } };
}

// Roeiboot met de Deurman als stuurloze visser
export function makeBoat() {
  const g = new THREE.Group();
  const wd = SH(0x9a6a3c), wd2 = SH(0x6e4a28);
  g.add(mesh(new THREE.BoxGeometry(2.8, 0.5, 1.3), wd, { cast: false, pos: [0, 0.2, 0] }));
  for (const s of [-1, 1]) { g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 1.1), wd, { cast: false, pos: [s * 1.7, 0.4, 0], rot: [0, 0, -s * 0.5] })); }
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.1, 1.1), wd2, { cast: false, pos: [0, 0.48, 0] }));
  g.add(mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 12), SH(0xffffff), { cast: false, pos: [1.2, 0.6, 0.67] }));
  const man = makeDeurman(0.36); man.group.position.set(-0.1, 0.5, 0); man.group.rotation.y = Math.PI / 2; g.add(man.group);
  const oars = [-1, 1].map((s) => { const o = new THREE.Group(); o.position.set(0.1, 0.7, s * 0.7); o.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5), wd2, { cast: false, pos: [0, 0, s * 1.0], rot: [Math.PI / 2, 0, 0] })); o.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), wd2, { cast: false, pos: [0, 0, s * 2.1] })); g.add(o); return o; });
  return { group: g, man, oars, update(t, dt) { man.update(dt); oars[0].rotation.y = Math.sin(t * 2.3) * 0.6; oars[1].rotation.y = Math.sin(t * 2.0 + 2) * 0.6; man.arms[0].rotation.x = Math.sin(t * 3) * 0.6 - 0.8; man.arms[1].rotation.x = Math.cos(t * 2.6) * 0.6 - 0.8; } };
}

// Zeepbel: transparante bol met regenboog-rand (kleine shader)
let _bubbleMat = null;
export function bubbleMaterial() {
  if (_bubbleMat) return _bubbleMat;
  _bubbleMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uCol: { value: new THREE.Color(0xffffff) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float uT; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); vec3 rb = 0.5+0.5*cos(6.283*(f*1.3+uT*0.15+vec3(0.0,0.33,0.67))); gl_FragColor = vec4(mix(uCol, rb, 0.75), 0.16 + f*0.75); }',
  });
  return _bubbleMat;
}

// Waterkanon op een rail langs de oever
export function makeCannon(i) {
  const pc = PLAYER_COLORS[i]; const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.5, 1.2), SH(0x5a4a3a), { cast: false, pos: [0, 0.45, 0] }));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 10), SH(0x2a2a30), { cast: false, pos: [s * 0.9, 0.4, 0], rot: [0, 0, Math.PI / 2] }));
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 12), SH(pc), { cast: false, pos: [0, 0.95, 0] }));
  const barrel = new THREE.Group(); barrel.position.set(0, 1.25, 0); g.add(barrel);
  barrel.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.5, 10), SH(0xd8d8e0, { metalness: 0.5, roughness: 0.3 }), { cast: false, pos: [0, 0, 0.7], rot: [Math.PI / 2, 0, 0] }));
  barrel.add(mesh(new THREE.TorusGeometry(0.25, 0.07, 6, 12), SH(pc), { cast: false, pos: [0, 0, 1.45] }));
  const tank = mesh(new THREE.SphereGeometry(0.5, 12, 9), SH(0xbfe8ff, { transparent: true, opacity: 0.8 }), { cast: false, pos: [0, 1.5, -0.45] }); g.add(tank);
  return { group: g, barrel, tank };
}

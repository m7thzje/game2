import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, TAU, mulberry32, smoothstep } from '../engine/util.js';

// Wereld van de Eendenrace: een brede kermis-vaart met stroming, trappen (watervallen), bruggen, rotsen, waterlelies,
// draaikolken, een stuk of wat kermiskramen, een reuzenrad, draaimolens en publiek. Alles procedureel, weinig draw calls.

export const TRK = { L: 330, W: 7.0, START: 4, CASC: [{ x: 118, d: 1.6 }, { x: 236, d: 3.2 }], BRIDGES: [66, 176, 300] };
const { L, W } = TRK;

const ss = (a, b, v) => smoothstep(a, b, v);
// waterhoogte (de trappen/watervallen)
export function hY(x) { return -(TRK.CASC[0].d * ss(TRK.CASC[0].x - 2.5, TRK.CASC[0].x + 2.5, x) + TRK.CASC[1].d * ss(TRK.CASC[1].x - 2.5, TRK.CASC[1].x + 2.5, x)); }

// stroming op (x,z): symmetrisch in z (eerlijk voor beide banen)
export function flowAt(x, z, out) {
  const zz = Math.abs(z) / W;
  let c = 3.0 * (1.12 - 0.5 * zz * zz), fz = 0;
  for (const k of TRK.CASC) {
    const u = ss(k.x - 20, k.x - 3, x) * (1 - ss(k.x + 1, k.x + 8, x)); c += 5.5 * u;
    const r = ss(k.x + 1, k.x + 4, x) * (1 - ss(k.x + 10, k.x + 16, x)); fz += Math.sin(x * 1.1 + Math.abs(z) * 0.9) * 2.4 * r * Math.sign(z || 1);
  }
  out.x = c; out.z = fz; return out;
}

// ---------------- baker: veel kleine vormen -> één geometrie met vertexkleuren ----------------
class Bake {
  constructor() { this.pos = []; this.col = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.c = new THREE.Color(); }
  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, alt = null, altN = 0) {
    this.e.set(rx, ry, rz); this.q.setFromEuler(this.e); this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(this.m);
    const P = g.attributes.position.array; const n = P.length / 3;
    this.c.set(color); const c1 = [this.c.r, this.c.g, this.c.b]; this.c.set(alt ?? color); const c2 = [this.c.r, this.c.g, this.c.b];
    for (let i = 0; i < P.length; i++) this.pos.push(P[i]);
    for (let v = 0; v < n; v++) { const f = Math.floor(v / 3); const cc = alt != null && f < altN && f % 2 ? c2 : c1; this.col.push(cc[0], cc[1], cc[2]); }
    g.dispose();
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.ConeGeometry(1, 1, 8), cone4: new THREE.ConeGeometry(1, 1, 4),
  sph: new THREE.IcosahedronGeometry(1, 1), sph0: new THREE.IcosahedronGeometry(1, 0), tri: new THREE.CircleGeometry(1, 3), tor: new THREE.TorusGeometry(1, 0.05, 5, 24),
};
const PAL = [0xff4d6d, 0xffd23f, 0x3bd16f, 0x4aa8ff, 0xff8a3a, 0xb06bff, 0xff7ad9, 0x35d8d0];

// ---------------- parcours (gespiegeld voor beide banen) ----------------
export function makeCourse(rng) {
  const obs = [], whirls = [], pads = [];
  const mirror = (fn) => { fn(1); fn(-1); };
  const inCasc = (x) => TRK.CASC.some((c) => x > c.x - 22 && x < c.x + 18);
  const nearBr = (x) => TRK.BRIDGES.some((b) => Math.abs(x - b) < 10);
  // bruggen: pilaren
  for (const b of TRK.BRIDGES) mirror((s) => obs.push({ x: b, z: s * 3.3, r: 0.85, kind: 'pillar', e: 0.55 }));
  // trappen: stenen na de val (ruim genoeg om langs te komen: gat >= 2 eendbreedtes)
  for (const k of TRK.CASC) mirror((s) => { obs.push({ x: k.x + 7, z: s * 3.5, r: 1.1, kind: 'rock', e: 0.55 }); obs.push({ x: k.x + 12, z: s * 4.0, r: 0.9, kind: 'rock', e: 0.55 }); });
  let x = 26; let last = '';
  while (x < L - 26) {
    if (inCasc(x) || nearBr(x)) { x += 6; continue; }
    let r = rng(); let kind = r < 0.34 ? 'rock' : r < 0.54 ? 'pad' : r < 0.74 ? 'whirl' : r < 0.9 ? 'buoy' : 'center';
    if (kind === last && rng() < 0.6) kind = 'rock';
    last = kind;
    if (kind === 'rock') { const rr = 0.8 + rng() * 0.7, zz = rr + 1.8 + rng() * Math.max(0, W - rr - 1.9 - rr - 1.8); mirror((s) => obs.push({ x, z: s * zz, r: rr, kind: 'rock', e: 0.55 })); if (rng() < 0.4) { const z2 = 2.5 + rng() * 1.9; mirror((s) => obs.push({ x: x + 4.5, z: s * z2, r: 0.7, kind: 'rock', e: 0.55 })); } }
    else if (kind === 'pad') { const zz = 2 + rng() * 3.4; mirror((s) => { pads.push({ x, z: s * zz, r: 1.7 + rng() * 0.5 }); pads.push({ x: x + 3, z: s * (zz + (rng() - 0.5) * 2.4), r: 1.3 + rng() * 0.4 }); }); }
    else if (kind === 'whirl') { const zz = 2.6 + rng() * 2.4; mirror((s) => whirls.push({ x, z: s * zz, r: 3.2, dir: s })); }
    else if (kind === 'buoy') { const zz = 2.5 + rng() * 1.9; mirror((s) => { obs.push({ x, z: s * zz, r: 0.65, kind: 'buoy', e: 1.05 }); obs.push({ x: x + 2.4, z: s * Math.min(4.4, zz + 1.2), r: 0.65, kind: 'buoy', e: 1.05 }); }); }
    else obs.push({ x, z: 0, r: 1.15, kind: 'rock', e: 0.55 });
    x += 12 + rng() * 6;
  }
  obs.sort((a, b) => a.x - b.x);
  return { obs, whirls, pads };
}

// ---------------- water-shader ----------------
const WVS = `
uniform float uT; uniform vec3 uWave; attribute float aSlope; varying vec3 vW; varying float vSlope; varying float vWave;
void main(){
  vec3 p = position;
  float w = sin(p.x*0.35 + uT*1.3 + p.z*0.2)*0.05 + sin(p.z*0.9 - uT*1.7 + p.x*0.15)*0.035;
  float wm = exp(-pow((p.x-uWave.x)/max(uWave.y,0.01), 2.0)) * uWave.z;
  p.y += w*(1.0-aSlope) + wm*0.55; vW = p; vSlope = aSlope; vWave = wm;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
}`;
const WFS = `
precision highp float;
uniform float uT; uniform vec4 uRip[8]; uniform float uWd; uniform vec2 uCas[2];
varying vec3 vW; varying float vSlope; varying float vWave;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 p = vW.xz; float az = abs(p.y)/uWd;
  vec3 deep = vec3(0.04,0.50,0.74), shal = vec3(0.26,0.84,0.88);
  float dp = 1.0 - smoothstep(0.45, 1.0, az);
  vec3 col = mix(shal, deep, dp*0.92);
  col *= 0.9 + 0.1*sin(p.x*0.05 + 1.0);
  float sp = 1.0 - 0.4*az*az;
  vec2 q = vec2(p.x - uT*2.8*sp, p.y);
  float n1 = vn(q*vec2(0.55,1.1) + vec2(0.0, uT*0.2)), n2 = vn(q*vec2(1.4,2.3) + 7.3 + vec2(-uT*0.3, 0.0));
  col += smoothstep(0.62,0.80, n1*0.62+n2*0.5)*0.22;
  col += smoothstep(0.84,0.94, vn(p*2.9 + vec2(uT*1.4, -uT*0.8)))*0.25;
  float e = smoothstep(0.86, 0.985, az + (vn(p*1.3+uT*0.4)-0.5)*0.12);
  col = mix(col, vec3(0.96,1.0,1.0), e*0.9);
  // trappen/watervallen: wit schuim
  for(int k=0;k<2;k++){
    float xc = uCas[k].x; float zone = smoothstep(xc-3.5, xc-0.5, p.x)*(1.0-smoothstep(xc+3.0, xc+13.0, p.x));
    float st = vn(vec2(p.x*0.35 - uT*7.0, p.y*2.4)) + vn(vec2(p.x*0.8 - uT*10.0, p.y*4.0))*0.5;
    float foot = exp(-pow((p.x-(xc+3.2))/2.4, 2.0));
    col = mix(col, vec3(0.96,1.0,1.0), clamp(zone*smoothstep(0.55,1.1,st)*0.9 + foot*0.75*smoothstep(0.2,0.9,vn(p*vec2(1.8,3.0)+uT*3.0)), 0.0, 1.0)*uCas[k].y);
  }
  col += vSlope*0.25;
  // rimpels
  for(int i=0;i<8;i++){ vec4 r=uRip[i]; if(r.z>0.001){ float d=distance(p,r.xy); float m=(1.0-smoothstep(0.0,r.w,d))*r.z; float ring=smoothstep(0.55,0.95,sin(d*5.5 - uT*6.0)*0.5+0.5); col = mix(col, vec3(1.0), ring*m*0.5 + m*0.12); } }
  col = mix(col, vec3(1.0), vWave*0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: WVS, fragmentShader: WFS,
    uniforms: { uT: { value: 0 }, uWd: { value: W }, uWave: { value: new THREE.Vector3(-999, 3, 0) }, uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 1)) }, uCas: { value: TRK.CASC.map((k) => new THREE.Vector2(k.x, 1)) } },
  });
}

function waterChunks(material, parent) {
  const CH = 40; const x0 = -24, x1 = L + 40;
  for (let a = x0; a < x1; a += CH) {
    const sx = CH, sz = 14, hw = W + 0.5;
    const pos = new Float32Array((sx + 1) * (sz + 1) * 3), slope = new Float32Array((sx + 1) * (sz + 1)); const idx = [];
    for (let i = 0; i <= sx; i++) for (let j = 0; j <= sz; j++) {
      const x = a + i, z = -hw + (j / sz) * hw * 2, k = i * (sz + 1) + j;
      pos[k * 3] = x; pos[k * 3 + 1] = hY(x); pos[k * 3 + 2] = z; slope[k] = clamp(Math.abs(hY(x + 0.5) - hY(x - 0.5)) * 1.4, 0, 1);
    }
    for (let i = 0; i < sx; i++) for (let j = 0; j < sz; j++) { const q = i * (sz + 1) + j; idx.push(q, q + 1, q + sz + 1, q + 1, q + sz + 2, q + sz + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSlope', new THREE.BufferAttribute(slope, 1)); g.setIndex(idx); g.computeBoundingSphere();
    g.boundingSphere.radius += 2;
    const m = new THREE.Mesh(g, material); m.frustumCulled = true; parent.add(m);
  }
}

// ---------------- oevers (gras + stenen muur) ----------------
function bank(sign, parent) {
  const prof = [[W - 0.02, -0.7, 0x6a6f86], [W - 0.02, 0.7, 0x9aa0b8], [W + 0.9, 0.7, 0xc9ccdc], [W + 1.0, 0.55, 0xc8a46a], [W + 3.2, 0.8, 0x79d05a], [W + 8, 1.0, 0x66bf4a], [W + 22, 1.3, 0x55ad40], [W + 60, 1.0, 0x4a9a3a]];
  const xs = []; for (let x = -24; x <= L + 40; x += 2) xs.push(x);
  const pos = [], col = [], idx = []; const c = new THREE.Color(); const np = prof.length;
  xs.forEach((x, i) => {
    prof.forEach(([zz, dy, color], j) => {
      pos.push(x, hY(x) + dy, sign * zz); c.set(color);
      const v = 0.92 + 0.16 * (((i * 7 + j * 3) % 5) / 5) + (j <= 2 ? ((i % 2) ? -0.07 : 0.05) : 0); col.push(c.r * v, c.g * v, c.b * v);
    });
  });
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < np - 1; j++) { const a = i * np + j, b = a + 1, cc = a + np, d = cc + 1; if (sign > 0) idx.push(a, cc, b, b, cc, d); else idx.push(a, b, cc, b, d, cc); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  parent.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide })));
}

// ---------------- hoofdbouw ----------------
export function buildWorld(ctx, course, rng) {
  const { scene } = ctx; const root = new THREE.Group(); scene.add(root);
  const waterMat = makeWaterMaterial(); waterChunks(waterMat, root); bank(1, root); bank(-1, root);

  // ---- vaste decoratie (gebakken) ----
  const S = new Bake(), Gl = new Bake(), Dk = new Bake();
  const stall = (x, z, face, c1, c2) => {   // kraam: face = +1 kijkt naar +z
    const bz = z, f = face;
    S.add(GEO.box, 0xb98a54, x, 0.55, bz, 3.4, 1.1, 1.3); S.add(GEO.box, 0xe8d8b0, x, 1.15, bz - f * 0.15, 3.6, 0.12, 1.5);
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.55, 0.55]) S.add(GEO.cyl, 0xf5f0e0, x + sx, 1.6, bz + sz * 1.0 - f * 0.7, 0.07, 3.2, 0.07);
    S.add(GEO.box, c2, x, 1.9, bz - f * 1.3, 3.5, 2.6, 0.15);
    for (let k = 0; k < 6; k++) S.add(GEO.box, k % 2 ? c1 : 0xfff6e8, x - 1.45 + k * 0.58, 3.25, bz + f * 0.15 + f * 0.12, 0.58, 0.1, 2.2, -f * 0.32, 0, 0);
    S.add(GEO.box, c1, x, 3.7, bz - f * 0.95, 2.4, 0.7, 0.1);
    for (let k = 0; k < 5; k++) S.add(GEO.sph0, PAL[(k + Math.floor(x)) % PAL.length], x - 1.2 + k * 0.6, 1.4, bz + f * 0.2, 0.22, 0.22, 0.22);
    const nb = Math.floor(rng() * 3) + 1; for (let k = 0; k < nb; k++) Gl.add(GEO.sph0, PAL[Math.floor(rng() * PAL.length)], x - 1.2 + k * 1.2, 3.55, bz + f * 1.1, 0.14, 0.14, 0.14);
  };
  const tree = (x, z, h) => { S.add(GEO.cyl, 0x7a5232, x, h * 0.25, z, 0.25 * h / 4, h * 0.5, 0.25 * h / 4); S.add(GEO.sph, 0x3fae44, x, h * 0.72, z, h * 0.34, h * 0.3, h * 0.34); S.add(GEO.sph, 0x52c24f, x + h * 0.14, h * 0.58, z + 0.2, h * 0.24, h * 0.22, h * 0.24); };
  const balloons = (x, z) => { const n = 4 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) { const bx = x + (rng() - 0.5) * 1.6, by = 4.6 + rng() * 1.6, bz = z + (rng() - 0.5) * 1.2; S.add(GEO.sph, PAL[Math.floor(rng() * PAL.length)], bx, by, bz, 0.42, 0.5, 0.42); S.add(GEO.cyl, 0xeeeeee, bx, by / 2 - 0.3, bz, 0.012, by - 0.6, 0.012); } };
  const lamp = (x, z) => { S.add(GEO.cyl, 0x3a3a48, x, 1.7, z, 0.1, 3.4, 0.1); Gl.add(GEO.sph, 0xfff0a8, x, 3.5, z, 0.28, 0.28, 0.28); };
  const tent = (x, z, r, h) => { S.add(GEO.cyl, 0xfff2d8, x, h * 0.35, z, r, h * 0.7, r); S.add(GEO.cone, PAL[Math.floor(rng() * PAL.length)], x, h * 0.7 + h * 0.32, z, r * 1.2, h * 0.65, r * 1.2, 0, 0, 0, 0xfff6e8, 8); };
  // oever-decor: beide kanten, x van -10 .. L+30
  for (const sd of [1, -1]) {
    let x = -8 + rng() * 4;
    while (x < L + 30) {
      const r = rng(); const zb = W + (sd > 0 ? 3.6 : 4.2);
      if (r < 0.42) stall(x, sd * (zb + rng() * 1.2), sd > 0 ? -1 : 1, PAL[Math.floor(rng() * PAL.length)], PAL[Math.floor(rng() * PAL.length)]);
      else if (r < 0.58) { tree(x, sd * (zb + 1 + rng() * 5), 4 + rng() * 2.5); }
      else if (r < 0.72) { balloons(x, sd * (zb + 0.4)); }
      else if (r < 0.86) { tent(x, sd * (zb + 3 + rng() * 5), 2.2 + rng() * 0.8, 3 + rng() * 1.2); }
      else { tree(x, sd * (zb + 2 + rng() * 6), 3.5 + rng() * 2); tree(x + 3, sd * (zb + 5 + rng() * 6), 4 + rng() * 2); }
      x += 6.5 + rng() * 4.5;
    }
    // lantaarnpalen + vlaggetjes
    for (let lx = 0; lx < L + 30; lx += 14) {
      const lz = sd * (W + 1.6); lamp(lx, lz);
      if (lx + 14 < L + 30) for (let k = 1; k < 8; k++) { const u = k / 8, fx = lx + 14 * u, sag = Math.sin(u * Math.PI) * 0.7; S.add(GEO.tri, PAL[(k + lx / 14) % PAL.length | 0], fx, 3.25 - sag - 0.12, lz, 0.2, 0.26, 1, 0, 0, Math.PI / 2 * 3); }
    }
    // rails voor de waterkanonnen
    Dk.add(GEO.box, 0x444455, (L + 30 - 24) / 2 - 4, hY(0) + 0.8, sd * (W + 1.4), L + 54, 0.06, 0.12);
  }
  // achtergrond: verre bomen en tenten
  for (let x = -10; x < L + 40; x += 11 + rng() * 6) { tree(x, -(W + 17 + rng() * 14), 6 + rng() * 4); if (rng() < 0.5) tent(x + 4, -(W + 13 + rng() * 6), 3 + rng(), 4 + rng() * 2); }
  for (let x = -10; x < L + 40; x += 13 + rng() * 8) { tree(x, W + 15 + rng() * 14, 6 + rng() * 4); }
  // bruggen (pilaren in het water + doorzichtig dek)
  const Deck = new Bake();
  for (const b of TRK.BRIDGES) {
    const hb = hY(b);
    for (const s of [-1, 1]) { Dk.add(GEO.cyl, 0x9a9aa8, b, hb + 1.2, s * 3.3, 0.85, 2.8, 0.85); S.add(GEO.cyl, 0xb8b8c8, b, hb + 2.7, s * 3.3, 0.95, 0.35, 0.95); for (const dz of [0]) S.add(GEO.cyl, 0x8a8a9a, b, hb + 2.0, s * (W + 1.0), 0.5, 4, 0.5); }
    Deck.add(GEO.box, 0xc89a60, b, hb + 3.1, 0, 3.0, 0.25, 2 * (W + 1.5));
    for (const s of [-1, 1]) { S.add(GEO.box, 0x6b4a2e, b + s * 1.45, hb + 3.7, 0, 0.12, 0.16, 2 * (W + 1.5)); for (let k = -6; k <= 6; k++) S.add(GEO.box, 0x6b4a2e, b + s * 1.45, hb + 3.4, k * 1.2, 0.1, 0.6, 0.1); }
    for (let k = 0; k < 6; k++) Gl.add(GEO.sph, PAL[k % PAL.length], b + 1.6, hb + 4.0, -6.5 + k * 2.6, 0.2, 0.2, 0.2);
  }
  // start- en finishpoort
  const gate = (gx, c1) => { const sd = -1; S.add(GEO.cyl, 0xffffff, gx, 3.4, sd * (W + 1.2), 0.22, 6.8, 0.22); S.add(GEO.sph, c1, gx, 7, sd * (W + 1.2), 0.4, 0.4, 0.4); };
  gate(L, 0x222222); gate(TRK.START - 1.5, 0x3bd16f);
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
  const sm = S.build(solid); root.add(sm);
  root.add(Dk.build(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })));
  root.add(Gl.build(new THREE.MeshBasicMaterial({ vertexColors: true })));
  const dm = Deck.build(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.4, depthWrite: false })); dm.renderOrder = 3; root.add(dm);

  // start-/finish-lijn op het water (dambord) + grote borden op de verre oever
  const checker = canvasTex(64, 256, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(j * 16, i * 16, 16, 16); } });
  const line = (lx, tint) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2 * W), new THREE.MeshBasicMaterial({ map: checker, transparent: true, opacity: 0.85, color: tint, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(lx, hY(lx) + 0.07, 0); m.renderOrder = 2; root.add(m); };
  line(L, 0xffffff); line(TRK.START - 1.5, 0xaaffbb);
  const signTex = (txt, bg) => canvasTex(512, 160, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.2)'; for (let i = 0; i < 8; i++) g.fillRect(i * 64, 0, 32, h); g.lineWidth = 12; g.strokeStyle = '#fff'; g.strokeRect(6, 6, w - 12, h - 12); g.font = 'bold 96px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineJoin = 'round'; g.strokeText(txt, w / 2, h / 2 + 4); g.fillStyle = '#fff'; g.fillText(txt, w / 2, h / 2 + 4); });
  const sign = (lx, txt, bg) => { for (const sd of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({ map: signTex(txt, bg), side: THREE.DoubleSide })); m.position.set(lx, hY(lx) + 7.2 + (sd > 0 ? -1.4 : 0.6), sd * (W + 1.3)); root.add(m); } };
  sign(L - 4.5, 'FINISH!', '#c8283c'); sign(TRK.START + 5, 'START', '#2f9e5b');

  // ---- rotsen, boeien, waterlelies, schuimrandjes, draaikolken (instanced) ----
  const rocks = course.obs.filter((o) => o.kind === 'rock' || o.kind === 'pillar'), buoys = course.obs.filter((o) => o.kind === 'buoy');
  const dm4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const place = (im, k, x, y, z, sx, sy, sz, ry = 0, color = null) => { e4.set(0, ry, 0); q4.setFromEuler(e4); dm4.compose(v3.set(x, y, z), q4, s3.set(sx, sy, sz)); im.setMatrixAt(k, dm4); if (color != null) im.setColorAt(k, new THREE.Color(color)); };
  const rockI = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), Math.max(1, rocks.length)); rockI.frustumCulled = false;
  rocks.forEach((o, k) => { if (o.kind === 'pillar') { place(rockI, k, o.x, -5, o.z, 0.01, 0.01, 0.01); } else place(rockI, k, o.x, hY(o.x) + o.r * 0.25, o.z, o.r * 1.05, o.r * 0.85, o.r, k * 1.3, [0x8a8c98, 0x9c9486, 0x78808c][k % 3]); });
  root.add(rockI);
  const buoyG = new THREE.SphereGeometry(1, 12, 9); const bc = new Float32Array(buoyG.attributes.position.count * 3);
  for (let i = 0; i < buoyG.attributes.position.count; i++) { const on = Math.floor((buoyG.attributes.position.getY(i) + 1) * 2.5) % 2; bc[i * 3] = 1; bc[i * 3 + 1] = on ? 1 : 0.25; bc[i * 3 + 2] = on ? 1 : 0.25; }
  buoyG.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  const buoyI = new THREE.InstancedMesh(buoyG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), Math.max(1, buoys.length)); buoyI.frustumCulled = false;
  buoys.forEach((o, k) => place(buoyI, k, o.x, hY(o.x) + 0.1, o.z, o.r, o.r, o.r)); root.add(buoyI);
  // schuim-ringen
  const foamG = new THREE.RingGeometry(0.92, 1.3, 20); foamG.rotateX(-Math.PI / 2);
  const rings = [...rocks.filter((o) => o.kind !== 'pillar'), ...buoys, ...rocks.filter((o) => o.kind === 'pillar')];
  const foamI = new THREE.InstancedMesh(foamG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), Math.max(1, rings.length)); foamI.frustumCulled = false; foamI.renderOrder = 2;
  rings.forEach((o, k) => place(foamI, k, o.x, hY(o.x) + 0.06, o.z, o.r * 1.15, 1, o.r * 1.15)); root.add(foamI);
  // waterlelies
  const padG = new THREE.CircleGeometry(1, 16); padG.rotateX(-Math.PI / 2);
  const padI = new THREE.InstancedMesh(padG, new THREE.MeshStandardMaterial({ color: 0x3fbf4a, roughness: 0.8, flatShading: true, side: THREE.DoubleSide }), Math.max(1, course.pads.length)); padI.frustumCulled = false;
  course.pads.forEach((p, k) => place(padI, k, p.x, hY(p.x) + 0.09, p.z, p.r, 1, p.r, k * 0.9, k % 2 ? 0x3fbf4a : 0x56d05c)); root.add(padI);
  const flowG = new THREE.IcosahedronGeometry(0.28, 0); const flI = new THREE.InstancedMesh(flowG, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), Math.max(1, course.pads.length)); flI.frustumCulled = false;
  course.pads.forEach((p, k) => place(flI, k, p.x + p.r * 0.25, hY(p.x) + 0.3, p.z - p.r * 0.2, 1, 1.3, 1, 0, k % 3 ? 0xff7ad9 : 0xffffff)); root.add(flI);
  // kikkers op sommige lelies
  const frogs = [];
  course.pads.forEach((p, k) => { if (k % 3 !== 0 || frogs.length >= 10) return; const g = new THREE.Group(); const gm = mat(0x4adc4a, { flatShading: false });
    g.add(mesh(new THREE.SphereGeometry(0.34, 8, 6), gm, { cast: false, pos: [0, 0.25, 0], scale: [1, 0.8, 1.2] })); for (const s of [-1, 1]) { g.add(mesh(new THREE.SphereGeometry(0.11, 6, 5), mat(0xffffff), { cast: false, pos: [s * 0.15, 0.5, 0.2] })); g.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), mat(0x101010), { cast: false, pos: [s * 0.15, 0.52, 0.29] })); }
    g.position.set(p.x - p.r * 0.1, hY(p.x) + 0.1, p.z + p.r * 0.2); root.add(g); frogs.push({ g, p, hop: 0, bx: g.position.x, bz: g.position.z, y0: g.position.y }); });
  // draaikolken
  const spiral = canvasTex(256, 256, (g, w, h) => { g.translate(w / 2, h / 2); for (let arm = 0; arm < 3; arm++) { g.beginPath(); for (let a = 0; a < 6.2; a += 0.1) { const r = 6 + a * 19; const x = Math.cos(a + arm * 2.094) * r, y = Math.sin(a + arm * 2.094) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 9; g.lineCap = 'round'; g.stroke(); } const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128); gr.addColorStop(0, 'rgba(10,40,90,.9)'); gr.addColorStop(0.3, 'rgba(10,40,90,.0)'); g.fillStyle = gr; g.fillRect(-128, -128, 256, 256); });
  const spMat = new THREE.MeshBasicMaterial({ map: spiral, transparent: true, depthWrite: false, opacity: 0.8 });
  const whirlM = course.whirls.map((w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w.r * 2.1, w.r * 2.1), spMat); m.rotation.x = -Math.PI / 2; m.position.set(w.x, hY(w.x) + 0.08, w.z); m.renderOrder = 2; root.add(m); return m; });

  // ---- reuzenrad + draaimolens (op de verre oever) ----
  const rotating = [];
  const wheels = [];
  for (const wx of [92, 262]) {
    const Wb = new Bake(); const R = 6.2;
    Wb.add(GEO.tor, 0xffffff, 0, 0, 0, R, R, 1, 0, 0, 0); Wb.add(GEO.tor, 0xff7ad9, 0, 0, 0, R * 0.55, R * 0.55, 1);
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; Wb.add(GEO.cyl, 0xeeeeee, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0.06, R, 0.06, 0, 0, a - Math.PI / 2); }
    const wm = Wb.build(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 })); const cy = hY(wx) + 8.4, cz = -(W + 13.5);
    wm.position.set(wx, cy, cz); root.add(wm);
    const leg = new Bake(); for (const sx of [-1, 1]) leg.add(GEO.cyl, 0x8a8aa0, wx + sx * 2.6, cy / 2 - 0.2 + hY(wx) / 2, cz, 0.18, cy + 0.4, 0.18, 0, 0, sx * 0.34); leg.add(GEO.cyl, 0xff4d6d, wx, cy, cz, 0.5, 0.9, 0.5, Math.PI / 2, 0, 0);
    root.add(leg.build(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true })));
    const gond = []; for (let k = 0; k < 10; k++) { const m = mesh(new THREE.BoxGeometry(1.0, 0.9, 0.8), mat(PAL[k % PAL.length]), { cast: false, receive: false }); root.add(m); gond.push(m); }
    wheels.push({ wm, gond, cx: wx, cy, cz, R, spd: 0.18 });
  }
  const carousels = [];
  for (const cx of [38, 156, 330]) {
    const Cb = new Bake(); const cz = -(W + 9.5), y0 = hY(cx) + 1.0;
    Cb.add(GEO.cyl, 0xe8d8b0, 0, 0, 0, 3.6, 0.35, 3.6); Cb.add(GEO.cyl, 0xffd23f, 0, 1.6, 0, 0.35, 3.2, 0.35);
    Cb.add(GEO.cone, 0xff4d6d, 0, 3.7, 0, 4.3, 1.6, 4.3, 0, 0, 0, 0xfff6e8, 8); Cb.add(GEO.sph0, 0xffd23f, 0, 4.7, 0, 0.35, 0.35, 0.35);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU, px = Math.cos(a) * 2.5, pz = Math.sin(a) * 2.5; Cb.add(GEO.cyl, 0xffd23f, px, 1.6, pz, 0.06, 2.8, 0.06); Cb.add(GEO.box, PAL[k % PAL.length], px, 1.0, pz, 0.55, 0.5, 1.0, 0, -a, 0); Cb.add(GEO.sph0, PAL[(k + 2) % PAL.length], px, 1.45, pz, 0.28, 0.28, 0.28); }
    const m = Cb.build(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true })); m.position.set(cx, y0, cz); root.add(m); carousels.push(m);
  }

  // ---- publiek (instanced, springt mee) ----
  const NA = 90; const crowdBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.28, 0.6, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), NA);
  const crowdHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 7, 6), new THREE.MeshStandardMaterial({ color: 0xf2c29b, roughness: 0.8, flatShading: true }), NA);
  crowdBody.frustumCulled = crowdHead.frustumCulled = false;
  const crowd = [];
  for (let k = 0; k < NA; k++) { const sd = k % 2 ? 1 : -1; const x = (k / NA) * (L + 30) + rng() * 4, z = sd * (W + 2.2 + rng() * 2.5); crowd.push({ x, z, ph: rng() * 6, sd }); crowdBody.setColorAt(k, new THREE.Color(PAL[k % PAL.length])); }
  root.add(crowdBody, crowdHead);

  // ---- wolkjes (schaduw-achtig sfeertje) overgeslagen: camera kijkt schuin omlaag ----
  let T = 0;
  const wv = waterMat.uniforms;
  function update(dt, camX, rip, cheer, wave, cascOn = 1) {
    T += dt; wv.uT.value = T;
    for (let i = 0; i < 8; i++) { const r = rip[i]; if (r) wv.uRip.value[i].set(r[0], r[1], r[2], r[3]); else wv.uRip.value[i].z = 0; }
    if (wave) wv.uWave.value.set(wave.x, 2.2, wave.k); else wv.uWave.value.z = 0;
    whirlM.forEach((m, i) => { m.rotation.z += dt * 1.4 * course.whirls[i].dir; });
    for (const w of wheels) {
      w.wm.rotation.z += dt * w.spd;
      w.gond.forEach((g, k) => { const a = k / 10 * TAU + w.wm.rotation.z; g.position.set(w.cx + Math.cos(a) * w.R, w.cy + Math.sin(a) * w.R - 0.8, w.cz); });
    }
    for (const c of carousels) c.rotation.y += dt * 0.7;
    // publiek
    for (let k = 0; k < NA; k++) {
      const c = crowd[k]; const near = Math.abs(c.x - camX) < 48; const hop = near ? Math.abs(Math.sin(T * (4 + (k % 3)) + c.ph)) * (0.1 + cheer * 0.9) : 0; const y = hY(c.x) + 1.0 + hop;
      e4.set(0, c.sd > 0 ? Math.PI : 0, 0); q4.setFromEuler(e4);
      dm4.compose(v3.set(c.x, y + 0.45, c.z), q4, s3.set(near ? 1 : 0.001, near ? 1 : 0.001, near ? 1 : 0.001)); crowdBody.setMatrixAt(k, dm4);
      dm4.compose(v3.set(c.x, y + 1.28, c.z), q4, s3.set(near ? 1 : 0.001, near ? 1 : 0.001, near ? 1 : 0.001)); crowdHead.setMatrixAt(k, dm4);
    }
    crowdBody.instanceMatrix.needsUpdate = crowdHead.instanceMatrix.needsUpdate = true;
  }
  function frogUpdate(dt, ducks, fx, audio) {
    for (const f of frogs) {
      let near = false; for (const d of ducks) if (Math.abs(d.x - f.p.x) < 3.2 && Math.abs(d.z - f.g.position.z) < 3.2) near = true;
      if (near && f.hop <= 0 && Math.random() < dt * 3) { f.hop = 0.55; fx.texts.add('KWAAK!', f.g.position.x, f.g.position.y + 1.6, f.g.position.z, '#b8ff7a', 0.8); audio.sfx('boing', { vol: 0.25, rate: 1.5 }); }
      if (f.hop > 0) { f.hop -= dt; const u = 1 - f.hop / 0.55; f.g.position.y = f.y0 + Math.sin(u * Math.PI) * 1.4; f.g.rotation.y += dt * 9; } else f.g.position.y = f.y0 + Math.sin(T * 2 + f.bx) * 0.02;
    }
  }
  return { root, update, frogUpdate, waterMat, wv };
}

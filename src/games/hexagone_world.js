import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { skyTexture } from '../engine/lights.js';
import { mergeStatic } from './quickdraw_merge.js';

// Omgeving + tegelvloer van "Zinkende Vloer": een vulkaangrot onder het kasteel met drie lagen zeshoekige tegels boven de lava.

export const HX = { S: 1.2, COLS: 12, ROWS: 8, Y: [0, -3.2, -6.4], TH: 0.9, LAVA: -14.5 };
const SQ3 = Math.sqrt(3);
const LAYER_COL = [[0.22, 0.92, 0.98], [0.9, 0.42, 1.0], [1.0, 0.68, 0.16]];   // cyaan, paars, amber
const HOT = [1.9, 0.45, 0.12], FIRE = [2.2, 1.1, 0.2];

function tileTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(11);
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
    const hexPath = (R) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R); } g.closePath(); };
    g.fillStyle = '#d9d9de'; hexPath(124); g.fill();
    g.strokeStyle = '#8f8f9c'; g.lineWidth = 10; hexPath(122); g.stroke();
    g.fillStyle = '#ffffff'; hexPath(98); g.fill();
    g.strokeStyle = '#c4c4d0'; g.lineWidth = 5; hexPath(98); g.stroke();
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(110,110,130,${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 3 + r() * 9, 2 + r() * 5); }
    g.strokeStyle = 'rgba(80,80,100,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { let x = w / 2 + (r() - 0.5) * 120, y = h / 2 + (r() - 0.5) * 120; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = '#9a9aa8'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.52; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 108, h / 2 + Math.sin(a) * 108, 4, 0, TAU); g.fill(); }
  });
}
function rockTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(21);
    g.fillStyle = '#3a2430'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 170; i++) { const l = 30 + r() * 45; g.fillStyle = `rgba(${l + 25},${l},${l + 10},${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 4 + r() * 16, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(255,120,40,.22)'; g.lineWidth = 1.5; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  });
}
function lavaTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(31);
    g.fillStyle = '#ff6a12'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, R = 30 + r() * 70; const gr = g.createRadialGradient(x, y, 2, x, y, R); gr.addColorStop(0, 'rgba(255,200,60,.55)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill(); }
    // donkere korstplaten met gloeiende randen
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, R = 26 + r() * 60, n = 6 + Math.floor(r() * 3);
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        g.beginPath(); for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = R * (0.7 + r() * 0.5 * 0 + 0.3 * Math.sin(k * 2.3 + i)); g.lineTo(x + ox + Math.cos(a) * rr, y + oy + Math.sin(a) * rr * 0.8); } g.closePath();
        g.fillStyle = 'rgba(96,22,8,.82)'; g.fill(); g.strokeStyle = 'rgba(255,170,40,.85)'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
      }
    }
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
export const glowSprite = (color, size, op = 0.8) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(size, size, 1); return s; };

// ---------------------------------------------------------------------------
// TileField: alle tegels van alle lagen in één InstancedMesh.
// toestanden: 0 heel, 1 trilt (timer), 2 valt, 3 weg, 4 komt terug (groeit)
// ---------------------------------------------------------------------------
export class TileField {
  constructor(scene, shadows) {
    // rechthoekig rooster van zeshoeken: even rijen 12 tegels, oneven rijen 11 (volledig spiegelsymmetrisch)
    this.list = [];
    for (let r = 0; r < HX.ROWS; r++) {
      const n = r % 2 ? HX.COLS - 1 : HX.COLS;
      for (let c = 0; c < n; c++) { const x = HX.S * SQ3 * (c - (n - 1) / 2), z = HX.S * 1.5 * (r - (HX.ROWS - 1) / 2); this.list.push({ r, c, x, z, d: Math.hypot(x, z) / 2.1 }); }
    }
    this.rowStart = []; { let o = 0; for (let r = 0; r < HX.ROWS; r++) { this.rowStart.push(o); o += r % 2 ? HX.COLS - 1 : HX.COLS; } }
    this.K = this.list.length; this.L = HX.Y.length; this.n = this.K * this.L;
    const n = this.n;
    this.st = new Uint8Array(n); this.tm = new Float32Array(n); this.tmax = new Float32Array(n); this.vy = new Float32Array(n); this.oy = new Float32Array(n);
    this.rot = new Float32Array(n * 3); this.spin = new Float32Array(n * 3); this.burn = new Uint8Array(n); this.seed = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    this.active = new Set();
    const geo = new THREE.CylinderGeometry(HX.S * 0.97, HX.S * 0.88, HX.TH, 6); geo.translate(0, -HX.TH / 2, 0);
    // zijkant donker + vaste uv-hoek, bovenkant licht met het tegelplaatje
    const uv = geo.attributes.uv, cols = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) { const side = i < 14, bot = i >= 27; const v = side ? 0.62 : bot ? 0.4 : 1; cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = v; if (side || bot) uv.setXY(i, 0.5, 0.97); }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.MeshStandardMaterial({ map: tileTexture(), vertexColors: true, roughness: 0.7, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, m, n); this.mesh.castShadow = shadows; this.mesh.receiveShadow = shadows; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    // doorzichtige 'spooktegels': tegels in een hogere laag boven een speler worden glazig zodat je hem ziet
    const gm = new THREE.MeshStandardMaterial({ map: m.map, vertexColors: true, roughness: 0.4, transparent: true, opacity: 0.26, depthWrite: false });
    this.ghost = new THREE.InstancedMesh(geo, gm, 120); this.ghost.count = 0; this.ghost.frustumCulled = false; this.ghost.renderOrder = 3; scene.add(this.ghost);
    this.gflag = new Uint8Array(n); this.ghostSet = new Set();
    const rng = mulberry32(5), c = new THREE.Color();
    for (let l = 0; l < this.L; l++) for (let k = 0; k < this.K; k++) {
      const i = l * this.K + k, v = 0.9 + rng() * 0.2, b = LAYER_COL[l];
      this.base[i * 3] = b[0] * v; this.base[i * 3 + 1] = b[1] * v; this.base[i * 3 + 2] = b[2] * v; this.seed[i] = rng() * 100;
      c.setRGB(b[0] * v, b[1] * v, b[2] * v); this.mesh.setColorAt(i, c);
    }
    this._o = new THREE.Object3D(); this._c = new THREE.Color();
    this.onShake = null; this.onFall = null; this.onLava = null;
    for (let i = 0; i < n; i++) this._write(i);
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
    this.stats = { fallen: 0 };
  }
  // tegel onder (x,z) of -1
  kAt(x, z) {
    const S = HX.S, row = Math.round(z / (1.5 * S) + (HX.ROWS - 1) / 2);
    let best = -1, bd = 1e9;
    for (let r = row - 1; r <= row + 1; r++) {
      if (r < 0 || r >= HX.ROWS) continue;
      const n = r % 2 ? HX.COLS - 1 : HX.COLS, cf = x / (S * SQ3) + (n - 1) / 2;
      for (let c = Math.floor(cf); c <= Math.floor(cf) + 1; c++) {
        if (c < 0 || c >= n) continue;
        const k = this.rowStart[r] + c, t = this.list[k], d = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
        if (d < bd) { bd = d; best = k; }
      }
    }
    if (best < 0) return -1;
    const t = this.list[best], dx = Math.abs(x - t.x), dz = Math.abs(z - t.z);
    return dx <= S * SQ3 / 2 && dz <= S - dx / SQ3 ? best : -1;
  }
  solid(l, k) { const s = this.st[l * this.K + k]; return s === 0 || s === 1; }
  // hoogste draagvlak onder (x,z) dat niet hoger ligt dan y+tol; retourneert laagindex of -1
  support(x, z, y, tol = 0.35) {
    const k = this.kAt(x, z); if (k < 0) return -1;
    for (let l = 0; l < this.L; l++) if (HX.Y[l] <= y + tol && this.solid(l, k)) return l;
    return -1;
  }
  shake(l, k, dur, burn = false) {
    const i = l * this.K + k; if (this.st[i] !== 0) { if (this.st[i] === 1 && dur < this.tm[i]) this.tm[i] = dur; return false; }
    this.st[i] = 1; this.tm[i] = this.tmax[i] = dur; this.burn[i] = burn ? 1 : 0; this.active.add(i);
    if (this.onShake) this.onShake(l, k, burn);
    return true;
  }
  shakeArea(l, cx, cz, rad, dur, burn = true) {
    let n = 0; for (let k = 0; k < this.K; k++) { const t = this.list[k]; if (Math.hypot(t.x - cx, t.z - cz) <= rad && this.shake(l, k, dur * (0.8 + Math.random() * 0.4), burn)) n++; } return n;
  }
  restoreArea(cx, cz, rad, layers = null) {
    let n = 0;
    for (let l = 0; l < this.L; l++) {
      if (layers && !layers.includes(l)) continue;
      for (let k = 0; k < this.K; k++) {
        const t = this.list[k], i = l * this.K + k;
        if (Math.hypot(t.x - cx, t.z - cz) > rad) continue;
        if (this.st[i] === 0) continue;
        if (this.st[i] === 1) { this.st[i] = 0; this.active.add(i); this.oy[i] = 0; this.rot.fill(0, i * 3, i * 3 + 3); this._setBase(i); continue; }
        this._spawn(i, -Math.hypot(t.x - cx, t.z - cz) * 0.06); n++;
      }
    }
    return n;
  }
  _spawn(i, delay = 0) { this.st[i] = 4; this.tm[i] = delay; this.oy[i] = 0; this.vy[i] = 0; this.rot.fill(0, i * 3, i * 3 + 3); this.active.add(i); this._setBase(i); }
  resetAll() { for (let i = 0; i < this.n; i++) { const t = this.list[i % this.K]; this._spawn(i, -(t.d * 0.07 + Math.random() * 0.15)); } }
  _setBase(i) { this._c.setRGB(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]); this.mesh.setColorAt(i, this._c); this.mesh.instanceColor.needsUpdate = true; }
  solidCount(l) { let n = 0; for (let k = 0; k < this.K; k++) if (this.solid(l, k)) n++; return n; }
  randomSolid(layer = -1) {
    for (let tries = 0; tries < 40; tries++) { const l = layer >= 0 ? layer : Math.floor(Math.random() * this.L), k = Math.floor(Math.random() * this.K); if (this.st[l * this.K + k] === 0) return [l, k]; }
    return null;
  }
  _mat(i, hide = false) {
    const k = i % this.K, l = (i / this.K) | 0, t = this.list[k], o = this._o, st = this.st[i];
    let sc = 1, sx = 0, sy = 0, sz = 0;
    if (st === 3 || hide) sc = 0.0001;
    else if (st === 4) { const u = clamp(this.tm[i] / 0.5, 0, 1); sc = this.tm[i] < 0 ? 0.0001 : Math.max(0.0001, 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2)); }
    else if (st === 1) { const a = 0.04 + 0.1 * (1 - this.tm[i] / this.tmax[i]); const s = this.seed[i], tt = performance.now() * 0.001; sx = Math.sin(tt * 53 + s) * a; sz = Math.cos(tt * 47 + s * 2) * a; sy = Math.sin(tt * 61 + s) * a * 0.5; }
    o.position.set(t.x + sx, HX.Y[l] + this.oy[i] + sy, t.z + sz);
    o.rotation.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2]); o.scale.setScalar(sc);
    o.updateMatrix(); return o.matrix;
  }
  _write(i) { this.mesh.setMatrixAt(i, this._mat(i, this.gflag[i] === 1)); }
  // zet de lijst tegels die glazig getekend moeten worden (elke frame aanroepen)
  setGhosts(arr) {
    const next = new Set(arr); let dirty = false;
    for (const i of this.ghostSet) if (!next.has(i)) { this.gflag[i] = 0; this._write(i); dirty = true; }
    let j = 0; const ca = this.mesh.instanceColor.array;
    for (const i of next) {
      if (j >= 120) break;
      if (!this.gflag[i]) { this.gflag[i] = 1; this._write(i); dirty = true; }
      this.ghost.setMatrixAt(j, this._mat(i)); this._c.setRGB(ca[i * 3], ca[i * 3 + 1], ca[i * 3 + 2]); this.ghost.setColorAt(j, this._c); j++;
    }
    this.ghostSet = next; this.ghost.count = j;
    if (j || dirty) { this.ghost.instanceMatrix.needsUpdate = true; if (this.ghost.instanceColor) this.ghost.instanceColor.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true; }
  }
  update(dt) {
    if (!this.active.size) return;
    const c = this._c; let colDirty = false;
    for (const i of this.active) {
      const st = this.st[i];
      if (st === 1) {
        this.tm[i] -= dt;
        const u = 1 - clamp(this.tm[i] / this.tmax[i], 0, 1), hot = this.burn[i] ? FIRE : HOT, f = u * u;
        c.setRGB(lerp(this.base[i * 3], hot[0], f), lerp(this.base[i * 3 + 1], hot[1], f), lerp(this.base[i * 3 + 2], hot[2], f)); this.mesh.setColorAt(i, c); colDirty = true;
        if (this.tm[i] <= 0) {
          this.st[i] = 2; this.vy[i] = -1; this.spin[i * 3] = (Math.random() - 0.5) * 3; this.spin[i * 3 + 1] = (Math.random() - 0.5) * 2; this.spin[i * 3 + 2] = (Math.random() - 0.5) * 3;
          this.stats.fallen++; if (this.onFall) this.onFall((i / this.K) | 0, i % this.K);
        }
      } else if (st === 2) {
        this.vy[i] -= 34 * dt; this.oy[i] += this.vy[i] * dt;
        this.rot[i * 3] += this.spin[i * 3] * dt; this.rot[i * 3 + 1] += this.spin[i * 3 + 1] * dt; this.rot[i * 3 + 2] += this.spin[i * 3 + 2] * dt;
        if (HX.Y[(i / this.K) | 0] + this.oy[i] < HX.LAVA + 0.4) {
          this.st[i] = 3; this.active.delete(i);
          if (this.onLava) { const t = this.list[i % this.K]; this.onLava(t.x, t.z); }
        }
      } else if (st === 4) {
        this.tm[i] += dt;
        if (this.tm[i] >= 0.5) { this.st[i] = 0; this.active.delete(i); }
      } else if (st === 0 || st === 3) { this.active.delete(i); }
      this._write(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (colDirty) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Wereld: lavameer, rotswand, zuilen met vuurschalen, spitse rotsen, banieren
// ---------------------------------------------------------------------------
export function buildWorld(ctx, colors) {
  const { scene, fx } = ctx;
  const rng = mulberry32(404);
  const W = { banners: [], flames: null, geysers: [], t: 0 };
  scene.background = skyTexture('#14040c', '#4a1408');
  scene.fog = new THREE.Fog(0x3a1008, 38, 120);

  // grotwand met verloop (onder oranje gloed van de lava, boven donker)
  const rockT = rockTexture(); rockT.wrapS = rockT.wrapT = THREE.RepeatWrapping; rockT.repeat.set(9, 3);
  const sg = new THREE.CylinderGeometry(52, 52, 80, 32, 8, true), cp = sg.attributes.position, cc = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) { const k = clamp((cp.getY(i) + 40) / 80, 0, 1), f = Math.pow(1 - k, 2.2); cc[i * 3] = 0.45 + f * 1.4; cc[i * 3 + 1] = 0.38 + f * 0.55; cc[i * 3 + 2] = 0.45 + f * 0.1; }
  sg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const shell = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: rockT, vertexColors: true, side: THREE.BackSide, roughness: 1, flatShading: true })); shell.position.y = -14; scene.add(shell);

  // lavameer
  const lavaT = lavaTexture(); lavaT.wrapS = lavaT.wrapT = THREE.RepeatWrapping; lavaT.repeat.set(4, 4);
  const lavaM = new THREE.MeshStandardMaterial({ map: lavaT, emissive: 0xff5a14, emissiveMap: lavaT, emissiveIntensity: 1.15, roughness: 0.5 });
  const lava = mesh(new THREE.PlaneGeometry(130, 130), lavaM, { cast: false, receive: false, pos: [0, HX.LAVA, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(lava); W.lava = lava; W.lavaT = lavaT;
  const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glowDisc.rotation.x = -Math.PI / 2; glowDisc.position.y = HX.LAVA + 0.1; scene.add(glowDisc); W.glowDisc = glowDisc;

  const root = new THREE.Group(); scene.add(root);
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(2, 6), color: 0xb8a8c0, roughness: 0.95, flatShading: true });
  const darkM = mat(0x4a2226, { roughness: 1 }), bowlM = mat(0x2a2a34, { metalness: 0.5, roughness: 0.5 });
  // zuilen rondom met vuurschalen
  const flames = [];
  const nP = 10;
  for (let k = 0; k < nP; k++) {
    const a = k / nP * TAU + 0.3, rr = 23 + (k % 3) * 2.5, top = -3.5 + (k % 4) * 0.9, h = top - HX.LAVA;
    const x = Math.cos(a) * rr * 1.15, z = Math.sin(a) * rr * 0.75 - 1;
    root.add(mesh(new THREE.CylinderGeometry(0.95, 1.35, h, 8), stoneM, { cast: false, receive: false, pos: [x, HX.LAVA + h / 2, z] }));
    root.add(mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.5, 8), stoneM, { cast: false, receive: false, pos: [x, top + 0.2, z] }));
    root.add(mesh(new THREE.CylinderGeometry(1.1, 0.6, 0.55, 8), bowlM, { cast: false, receive: false, pos: [x, top + 0.75, z] }));
    flames.push([x, top + 1.25, z]);
    // lage tegelring: gouden randen
    root.add(mesh(new THREE.TorusGeometry(1.32, 0.12, 5, 14), mat(0xd8a830, { metalness: 0.6, roughness: 0.4 }), { cast: false, receive: false, pos: [x, top - 0.6, z], rot: [Math.PI / 2, 0, 0] }));
  }
  // spitse rotsen in de lava
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU, rr = 16 + rng() * 34, hh = 2 + rng() * 9, rd = 0.9 + rng() * 1.8;
    root.add(mesh(new THREE.ConeGeometry(rd, hh, 5), darkM, { cast: false, receive: false, pos: [Math.cos(a) * rr, HX.LAVA + hh / 2 - 0.4, Math.sin(a) * rr * 0.85 - 2], rot: [0, rng() * 6, (rng() - 0.5) * 0.25] }));
  }
  // kasteelmuur in de verte met verlichte raampjes
  const winM = new THREE.MeshBasicMaterial({ color: 0xffc060 });
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * (1.0 + k / 13 * 1.0), x = Math.cos(a) * 44, z = Math.sin(a) * 44;
    const hh = 9 + (k % 3) * 4; const g = new THREE.Group(); g.position.set(x, HX.LAVA, z); g.rotation.y = -a + Math.PI / 2;
    g.add(mesh(new THREE.BoxGeometry(5, hh, 3), stoneM, { cast: false, receive: false, pos: [0, hh / 2, 0] }));
    g.add(mesh(new THREE.ConeGeometry(3.4, 4, 4), mat(0x6a3a58), { cast: false, receive: false, pos: [0, hh + 2, 0], rot: [0, Math.PI / 4, 0] }));
    for (let w = 0; w < 2; w++) g.add(mesh(new THREE.BoxGeometry(0.6, 1.2, 0.2), winM, { cast: false, receive: false, pos: [(w - 0.5) * 1.8, hh * 0.7, 1.55] }));
    root.add(g);
  }
  mergeStatic(root);

  // vuur in de schalen (instanced) + banieren in spelerskleur aan de zijkanten
  const fm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 }), flames.length); fm.frustumCulled = false; scene.add(fm);
  W.flames = { mesh: fm, pos: flames }; for (const f of flames) { const gs = glowSprite(0xff8a30, 6, 0.45); gs.position.set(f[0], f[1] + 0.2, f[2]); scene.add(gs); }
  [-1, 1].forEach((sd, i) => {
    for (const zz of [-5, 5]) {
      const g = new THREE.Group(); g.position.set(sd * 14.4, -1.2, zz * 1.1);
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), mat(0x4a3322), { cast: false, pos: [0, 2.5, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xe8c24a, { metalness: 0.6 }), { cast: false, pos: [0, 5.1, 0] }));
      const cl = mesh(new THREE.PlaneGeometry(1.7, 2.7, 4, 6), new THREE.MeshStandardMaterial({ color: colors[i], side: THREE.DoubleSide, roughness: 0.8 }), { cast: false, pos: [sd * -0.9, 3.5, 0] });
      g.add(cl); g.userData.cloth = cl; g.userData.base = cl.geometry.attributes.position.array.slice(); g.userData.dir = -sd;
      scene.add(g); W.banners.push(g);
    }
  });
  // glimmende vonken boven de lava
  W.update = (t, dt) => {
    W.t = t;
    lavaT.offset.set(t * 0.012, t * 0.02); glowDisc.material.opacity = 0.3 + Math.sin(t * 1.3) * 0.06;
    const o = W._o || (W._o = new THREE.Object3D());
    W.flames.pos.forEach((p, i) => { const s = 1 + Math.sin(t * 11 + i * 2.1) * 0.15 + Math.sin(t * 6.3 + i) * 0.1; o.position.set(p[0], p[1] + 0.35 * s, p[2]); o.scale.set(1, s, 1); o.rotation.y = t * 2 + i; o.updateMatrix(); fm.setMatrixAt(i, o.matrix); });
    fm.instanceMatrix.needsUpdate = true;
    for (const b of W.banners) {
      const c = b.userData.cloth, p = c.geometry.attributes.position, bs = b.userData.base;
      for (let i = 0; i < p.count; i++) { const x = (bs[i * 3] * b.userData.dir + 0.9) / 1.8; p.setZ(i, Math.sin(t * 3 + x * 4 + b.position.z) * 0.18 * x); }
      p.needsUpdate = true;
    }
    // vonken en lavablubs
    if (Math.random() < dt * 14) { const a = Math.random() * TAU, rr = 6 + Math.random() * 30; fx.particles.emit(Math.cos(a) * rr, HX.LAVA + 0.2, Math.sin(a) * rr, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 4, (Math.random() - 0.5) * 0.6, { life: 2.5, size: 0.28, color: Math.random() < 0.5 ? 0xff9a30 : 0xffd060, gravity: -0.2 }); }
    if (Math.random() < dt * 5) { const f = flames[Math.floor(Math.random() * flames.length)]; fx.particles.emit(f[0] + (Math.random() - 0.5), f[1] + 0.8, f[2] + (Math.random() - 0.5), (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), { life: 1.4, size: 0.22, color: 0xffb040, gravity: -0.5 }); }
    // lava-geisers
    for (const g of W.geysers) {
      g.t += dt;
      if (g.t > 0 && g.t < g.dur && Math.random() < dt * 60) fx.particles.emit(g.x + (Math.random() - 0.5) * 0.8, HX.LAVA + 0.3, g.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2, 11 + Math.random() * 7, (Math.random() - 0.5) * 2, { life: 1.6, size: 0.55, color: Math.random() < 0.5 ? 0xff6a20 : 0xffc040, gravity: 9 });
      if (g.t > g.dur + 0.1) { g.t = -(3 + Math.random() * 6); const a = Math.random() * TAU, rr = 10 + Math.random() * 22; g.x = Math.cos(a) * rr; g.z = Math.sin(a) * rr * 0.8; g.dur = 0.7 + Math.random() * 0.8; }
    }
  };
  for (let i = 0; i < 3; i++) W.geysers.push({ t: -2 - i * 2.2, dur: 1, x: 15 * (i - 1), z: -14 + i * 4 });
  return W;
}

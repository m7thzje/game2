import * as THREE from 'three';
import { mat, mesh, clamp, lerp, rand, TAU, canvasTex, mulberry32, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';

// Wereld-bouwstenen voor het Kanonnenduel: verwoestbaar landschap, kastelen, projectielen, decor.

// ---------------------------------------------------------------- landschap
let dirtTex = null;
function terrainTexture() {
  if (dirtTex) return dirtTex;
  dirtTex = canvasTex(128, 256, (g, w, h) => {
    const r = mulberry32(5);
    // 0..0.22 gras met druipende rand, daaronder aarde met steentjes
    g.fillStyle = '#8a6540'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = ['#7c5a38', '#98724a', '#6d4e30', '#a47e54'][Math.floor(r() * 4)]; g.fillRect(r() * w, 40 + r() * (h - 40), 2 + r() * 4, 2 + r() * 3); }
    for (let i = 0; i < 26; i++) { g.fillStyle = ['#9c9a94', '#7e7c78', '#b5b0a4'][Math.floor(r() * 3)]; g.beginPath(); g.ellipse(r() * w, 60 + r() * (h - 60), 3 + r() * 5, 2 + r() * 3, r() * 3, 0, TAU); g.fill(); }
    const gr = g.createLinearGradient(0, 0, 0, 62); gr.addColorStop(0, '#79c94d'); gr.addColorStop(0.75, '#5aa63a'); gr.addColorStop(1, '#4a8a2e');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 50);
    for (let x = w; x >= 0; x -= 8) g.lineTo(x, 50 + (Math.sin(x * 0.4) * 0.5 + 0.5) * 12 + r() * 6);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,100,30,.5)'; g.lineWidth = 1.5; for (let i = 0; i < 30; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, 3); g.lineTo(x + (r() - 0.5) * 4, 14 + r() * 10); g.stroke(); }
    // donkerder naar beneden
    const sh = g.createLinearGradient(0, 80, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(20,10,0,.55)'); g.fillStyle = sh; g.fillRect(0, 80, w, h - 80);
  });
  dirtTex.wrapS = THREE.RepeatWrapping; dirtTex.wrapT = THREE.ClampToEdgeWrapping; dirtTex.userData.keep = true;
  return dirtTex;
}

export class Terrain {
  constructor(scene, { x0 = -50, x1 = 50, n = 400, zF = 3.2, zB = 3.2, bottom = -40 } = {}) {
    this.x0 = x0; this.x1 = x1; this.n = n; this.dx = (x1 - x0) / n; this.zF = zF; this.zB = zB; this.bottom = bottom;
    this.h = new Float32Array(n + 1); this.burn = new Float32Array(n + 1); this.lockMin = new Float32Array(n + 1).fill(-1.5);
    const V = (n + 1) * 4;
    this.pos = new Float32Array(V * 3); this.nor = new Float32Array(V * 3); this.uv = new Float32Array(V * 2); this.col = new Float32Array(V * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const TF = i * 4, TB = i * 4 + 1, MF = i * 4 + 2, BF = i * 4 + 3, TF2 = TF + 4, TB2 = TB + 4, MF2 = MF + 4, BF2 = BF + 4;
      idx.push(TF, TF2, TB, TF2, TB2, TB);
      idx.push(TF, MF, TF2, TF2, MF, MF2);
      idx.push(MF, BF, MF2, MF2, BF, BF2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setIndex(idx); this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: terrainTexture(), vertexColors: true, roughness: 0.95, metalness: 0 }));
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = false; scene.add(this.mesh);
    this.dirty = true;
  }
  xAt(i) { return this.x0 + i * this.dx; }
  heightAt(x) {
    const f = clamp((x - this.x0) / this.dx, 0, this.n - 0.0001); const i = Math.floor(f);
    return lerp(this.h[i], this.h[i + 1], f - i);
  }
  slopeAt(x) { const f = clamp((x - this.x0) / this.dx, 0.0001, this.n - 1.0001); const i = Math.floor(f); return (this.h[i + 1] - this.h[i]) / this.dx; }
  // Kuil een krater (bol) uit het landschap. Retourneert true als er iets veranderde.
  carve(cx, cy, r) {
    let changed = false;
    const i0 = Math.max(0, Math.ceil((cx - r * 1.5 - this.x0) / this.dx)), i1 = Math.min(this.n, Math.floor((cx + r * 1.5 - this.x0) / this.dx));
    for (let i = i0; i <= i1; i++) {
      const d = this.xAt(i) - cx, ad = Math.abs(d);
      if (ad < r) {
        const yb = cy - Math.sqrt(r * r - d * d);
        if (yb < this.h[i]) { this.h[i] = Math.max(yb, this.lockMin[i], -1.5); changed = true; }
      }
      const b = 0.95 * (1 - ad / (r * 1.5)) * clamp(1 - (cy - this.h[i]) / (r * 1.3), 0, 1); if (b > this.burn[i]) { this.burn[i] = b; changed = true; }
    }
    if (changed) this.dirty = true;
    return changed;
  }
  scorch(x, amt = 0.6, rad = 1.4) {
    const i0 = Math.max(0, Math.floor((x - rad - this.x0) / this.dx)), i1 = Math.min(this.n, Math.ceil((x + rad - this.x0) / this.dx));
    for (let i = i0; i <= i1; i++) { const b = amt * (1 - Math.abs(this.xAt(i) - x) / rad); if (b > this.burn[i]) { this.burn[i] = b; this.dirty = true; } }
  }
  rebuild() {
    const { pos, nor, uv, col, h, burn, n, dx, zF, zB, bottom } = this;
    for (let i = 0; i <= n; i++) {
      const x = this.x0 + i * dx, y = h[i], b = burn[i];
      const sl = (h[Math.min(n, i + 1)] - h[Math.max(0, i - 1)]) / (dx * (i === 0 || i === n ? 1 : 2));
      const nl = Math.hypot(sl, 1), nx = -sl / nl, ny = 1 / nl;
      const mf = Math.max(y - 0.9, bottom + 0.5);
      const k = i * 4;
      const set = (v, px, py, pz, nx_, ny_, nz_, u, vv, r, g, bl) => {
        pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz; nor[v * 3] = nx_; nor[v * 3 + 1] = ny_; nor[v * 3 + 2] = nz_;
        uv[v * 2] = u; uv[v * 2 + 1] = vv; col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = bl;
      };
      const dark = 1 - b * 0.72, tint = b * 0.06;
      set(k, x, y, zF, nx, ny, 0, x * 0.1, 0.07, dark + tint, dark, dark);
      set(k + 1, x, y, -zB, nx, ny, 0, x * 0.1, 0.07, dark + tint, dark, dark);
      set(k + 2, x, mf, zF, 0, 0, 1, x * 0.1, 0.0 + (y - mf) * 0.25 / 0.9 * 0.9 + 0.0, 1 - b * 0.55, 1 - b * 0.55, 1 - b * 0.55);
      set(k + 3, x, bottom, zF, 0, 0, 1, x * 0.1, 1.0, 0.16, 0.14, 0.16);
      // v-coordinaat: boven 0, grasrand bij 0.22
      uv[(k) * 2 + 1] = 0.98; uv[(k + 1) * 2 + 1] = 0.98; uv[(k + 2) * 2 + 1] = 0.74; uv[(k + 3) * 2 + 1] = 0.0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.dirty = false;
  }
}

// ---------------------------------------------------------------- achtergrond
function rangeTex(base, snow, seed, jag) {
  return canvasTex(1024, 256, (g, w, h) => {
    const r = mulberry32(seed); const h0 = 128;
    const pts = [];
    for (let x = 0; x <= w; x += 16) pts.push([x, h0 + Math.sin(x * 0.011 + seed) * jag + Math.sin(x * 0.037 + seed * 2) * jag * 0.5 + (r() - 0.5) * jag * 0.35]);
    const gr = g.createLinearGradient(0, h0 - jag * 1.6, 0, h); gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h); for (const [x, yy] of pts) g.lineTo(x, yy); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = snow;
    for (let i = 1; i < pts.length - 1; i++) {
      if (pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1] && pts[i][1] < h0 - jag * 0.25) {
        const [px, py] = pts[i]; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 26, py + 30); g.lineTo(px - 10, py + 24); g.lineTo(px, py + 38); g.lineTo(px + 12, py + 24); g.lineTo(px + 28, py + 32); g.closePath(); g.fill();
      }
    }
  });
}
// de grote berg met het Speelhal-kasteel erin
function castleMountainTex() {
  return canvasTex(512, 384, (g, w, h) => {
    const cx = w / 2;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9aa6cc'); gr.addColorStop(0.5, '#7684ac'); gr.addColorStop(1, '#5d6a92');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h); g.lineTo(60, 250); g.lineTo(130, 190); g.lineTo(190, 120); g.lineTo(225, 60); g.lineTo(256, 26); g.lineTo(290, 70); g.lineTo(330, 130); g.lineTo(390, 185); g.lineTo(450, 250); g.lineTo(w, h); g.closePath(); g.fill();
    g.fillStyle = '#f2f6ff'; g.beginPath(); g.moveTo(256, 26); g.lineTo(225, 60); g.lineTo(240, 62); g.lineTo(250, 80); g.lineTo(262, 64); g.lineTo(280, 66); g.lineTo(290, 70); g.closePath(); g.fill();
    // kasteel (uitgehakt in de berg)
    const by = 330;
    g.fillStyle = '#4d4666'; g.fillRect(cx - 120, by - 118, 240, 118);
    for (const [dx, hh, ww, rc] of [[-130, 120, 38, '#c0392b'], [130, 120, 38, '#2f6fe0'], [-72, 158, 34, '#2f6fe0'], [72, 158, 34, '#c0392b'], [0, 196, 56, '#e8b83a']]) {
      g.fillStyle = '#5c5578'; g.fillRect(cx + dx - ww / 2, by - hh, ww, hh);
      g.fillStyle = rc; g.beginPath(); g.moveTo(cx + dx - ww / 2 - 6, by - hh); g.lineTo(cx + dx, by - hh - ww * 1.0); g.lineTo(cx + dx + ww / 2 + 6, by - hh); g.closePath(); g.fill();
      g.fillStyle = '#ffd86a'; g.fillRect(cx + dx - 3, by - hh + 14, 7, 12); g.fillRect(cx + dx - 3, by - hh + 44, 7, 12);
    }
    g.fillStyle = '#2a1830'; g.beginPath(); g.moveTo(cx - 24, by); g.lineTo(cx - 24, by - 40); g.arc(cx, by - 40, 24, Math.PI, 0); g.lineTo(cx + 24, by); g.closePath(); g.fill();
    g.fillStyle = '#ffe9a0'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('SPEELHAL', cx, by - 78);
    g.strokeStyle = '#d8372c'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, by - 196 - 56); g.lineTo(cx, by - 196 - 100); g.stroke(); g.fillStyle = '#d8372c'; g.beginPath(); g.moveTo(cx, by - 196 - 100); g.lineTo(cx + 30, by - 196 - 90); g.lineTo(cx, by - 196 - 80); g.fill();
  });
}

export function buildBackdrop(scene) {
  const grp = new THREE.Group(); scene.add(grp);
  const bands = [
    { z: -60, y: 21, w: 340, h: 62, tex: rangeTex(['#5f86ae', '#86aac4'], '#eef6ff', 41, 26) },
    { z: -110, y: 33, w: 470, h: 80, tex: rangeTex(['#8196c2', '#aebbdc'], '#f4f7ff', 27, 30) },
    { z: -170, y: 46, w: 620, h: 98, tex: rangeTex(['#aab6dc', '#d6def2'], '#ffffff', 11, 34) },
  ];
  const out = [];
  for (const L of bands) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, fog: false, depthWrite: false }));
    m.position.set(0, L.y, L.z); grp.add(m); out.push(m);
  }
  const big = new THREE.Mesh(new THREE.PlaneGeometry(76, 57), new THREE.MeshBasicMaterial({ map: castleMountainTex(), transparent: true, fog: false, depthWrite: false }));
  big.position.set(-4, 24, -92); grp.add(big);
  // zon
  const sunT = canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,240,170,.95)'); gr.addColorStop(1, 'rgba(255,230,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunT, transparent: true, depthWrite: false, fog: false })); sun.scale.set(34, 34, 1); sun.position.set(-62, 62, -175); grp.add(sun);
  return { group: grp, layers: out, sun };
}

// ---------------------------------------------------------------- kasteel
// side: +1 = kanon wijst naar rechts (linker kasteel), -1 = naar links. Oorsprong op de grond (y=base).
export function buildCastle(color, side) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: tex.stone(2, 2), roughness: 0.95, flatShading: true });
  const stone2 = new THREE.MeshStandardMaterial({ map: tex.stone(1, 3), roughness: 0.95, flatShading: true });
  const body = new THREE.Group(); g.add(body);
  // fundament + keep
  body.add(mesh(new THREE.BoxGeometry(7.6, 1.2, 4.6), stone, { pos: [0, 0.2, 0] }));
  const keep = new THREE.Group(); body.add(keep);
  keep.add(mesh(new THREE.BoxGeometry(5.4, 4.2, 4.0), stone, { pos: [0, 2.9, 0] }));
  keep.add(mesh(new THREE.BoxGeometry(5.9, 0.35, 4.5), mat(0x8a6a4a), { pos: [0, 5.1, 0] }));
  // kantelen
  for (let i = 0; i < 7; i++) keep.add(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), stone, { pos: [-2.6 + i * 0.87, 5.6, 2.05] }));
  for (let i = 0; i < 7; i++) keep.add(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), stone, { pos: [-2.6 + i * 0.87, 5.6, -2.05] }));
  // poort
  const gate = mesh(new THREE.BoxGeometry(1.5, 2.0, 0.2), mat(0x3a2414), { pos: [0, 1.7, 2.02], cast: false }); keep.add(gate);
  keep.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 10, 1, false, 0, Math.PI), mat(0x3a2414), { pos: [0, 2.7, 2.02], rot: [Math.PI / 2, 0, 0], cast: false }));
  keep.add(mesh(new THREE.BoxGeometry(0.12, 2.0, 0.24), mat(0xb8a070), { pos: [0, 1.7, 2.04], cast: false }));
  // ramen
  const winM = new THREE.MeshStandardMaterial({ color: 0xffd86a, emissive: 0xffb030, emissiveIntensity: 0.9 });
  for (const wx of [-1.9, 1.9]) { keep.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.12), winM, { pos: [wx, 3.5, 2.03], cast: false })); keep.add(mesh(new THREE.ConeGeometry(0.26, 0.3, 4), winM, { pos: [wx, 4.1, 2.03], cast: false, rot: [0, Math.PI / 4, 0] })); }
  // torens (binnen = naar de vijand, buiten = achter)
  const mkTower = (x, h, r) => {
    const t = new THREE.Group(); t.position.set(x, 0, 0);
    t.add(mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 10), stone2, { pos: [0, h / 2 + 0.7, 0] }));
    t.add(mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.0, 0.45, 10), mat(0x7e7e86), { pos: [0, h + 0.9, 0] }));
    t.add(mesh(new THREE.ConeGeometry(r * 1.35, r * 2.4, 10), mat(color), { pos: [0, h + 0.9 + r * 1.2 + 0.2, 0] }));
    t.add(mesh(new THREE.BoxGeometry(0.3, 0.55, 0.12), winM, { pos: [0, h * 0.6 + 0.7, r * 0.95], cast: false }));
    body.add(t); return t;
  };
  const towerOut = mkTower(-side * 3.35, 5.6, 1.15);  // buitenste toren (achter het kanon)
  const towerIn = mkTower(side * 3.35, 4.6, 1.0);     // binnenste toren (naar de vijand)
  // vlag
  const flag = P.banner(color, 2.2, 1.3); flag.position.set(-side * 3.35, 5.6 + 0.9 + 2.9, 0); flag.scale.setScalar(0.8); if (side < 0) flag.scale.x = -0.8; body.add(flag);
  // kanon-platform: de montage ligt op het dak van de keep, aan de vijandkant
  const mount = new THREE.Group(); mount.position.set(side * 1.3, 5.45, 0.2); body.add(mount);
  mount.add(mesh(new THREE.BoxGeometry(2.1, 0.35, 1.2), mat(0x6b4a2e), { pos: [0, 0.18, 0] }));
  for (const wz of [-0.55, 0.55]) mount.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.22, 12), mat(0x4a3220), { pos: [0, 0.5, wz], rot: [Math.PI / 2, 0, 0] }));
  const pivot = new THREE.Group(); pivot.position.set(0, 0.8, 0); mount.add(pivot);
  const barrel = new THREE.Group(); pivot.add(barrel);
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.45, metalness: 0.7, flatShading: false });
  const tube = mesh(new THREE.CylinderGeometry(0.38, 0.52, 2.5, 12), iron, { pos: [1.15, 0, 0], rot: [0, 0, -Math.PI / 2] }); barrel.add(tube);
  barrel.add(mesh(new THREE.TorusGeometry(0.42, 0.09, 6, 14), mat(color, { flatShading: false }), { pos: [1.9, 0, 0], rot: [0, Math.PI / 2, 0] }));
  barrel.add(mesh(new THREE.TorusGeometry(0.5, 0.09, 6, 14), mat(0xd7b24a, { metalness: 0.6 }), { pos: [0.2, 0, 0], rot: [0, Math.PI / 2, 0] }));
  barrel.add(mesh(new THREE.SphereGeometry(0.55, 12, 8), iron, { pos: [-0.1, 0, 0] }));
  barrel.scale.x = side; // wijst naar +x (rechts) bij side=1, naar -x bij side=-1
  // schade-rook
  return {
    group: g, body, keep, towerOut, towerIn, flag, mount, pivot, barrel, gate,
    muzzleLocal: new THREE.Vector3(2.5, 0, 0),
  };
}

// ---------------------------------------------------------------- projectielen
export function makeProjectile(id) {
  const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
  const sm = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: false, ...o });
  let radius = 0.55;
  if (id === 'ball') {
    inner.add(mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshStandardMaterial({ color: 0x23252c, roughness: 0.3, metalness: 0.8 })));
    inner.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), mat(0xffffff, { flatShading: false }), { pos: [0.25, 0.3, 0.42], cast: false }));
    const fuse = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), mat(0xb08a50), { pos: [0, 0.65, 0] }); inner.add(fuse);
    inner.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb030 }), { pos: [0, 0.85, 0], cast: false }));
  } else if (id === 'cabbage') {
    inner.add(mesh(new THREE.SphereGeometry(0.58, 12, 9), sm(0x9ed36a), { cast: true }));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; inner.add(mesh(new THREE.SphereGeometry(0.62, 8, 6, 0, 2.2, 0.3, 1.6), sm(i % 2 ? 0x6fb04a : 0x86c55a, { side: THREE.DoubleSide }), { rot: [0.2, a, 0.1], cast: false })); }
    inner.add(mesh(new THREE.SphereGeometry(0.2, 6, 5), sm(0xdff3a8), { pos: [0, 0.5, 0.1], cast: false }));
    radius = 0.6;
  } else if (id === 'cake') {
    inner.add(mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.5, 14), sm(0xf3c88a), { pos: [0, -0.3, 0] }));
    inner.add(mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 14), sm(0xff7aa8), { pos: [0, 0.0, 0] }));
    inner.add(mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.42, 14), sm(0xffffff), { pos: [0, 0.28, 0] }));
    inner.add(mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.1, 14), sm(0xff7aa8), { pos: [0, 0.52, 0] }));
    inner.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), sm(0xe03a3a), { pos: [0, 0.68, 0] }));
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; inner.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 5), sm([0x3a78e0, 0xffd23f, 0x35c46f][i]), { pos: [Math.cos(a) * 0.35, 0.72, Math.sin(a) * 0.35], cast: false })); inner.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffd060 }), { pos: [Math.cos(a) * 0.35, 0.9, Math.sin(a) * 0.35], cast: false })); }
    radius = 0.8;
  } else if (id === 'fire') {
    inner.add(mesh(new THREE.SphereGeometry(0.55, 12, 9), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.2, roughness: 0.5 }), { cast: false }));
    inner.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe27a }), { cast: false }));
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; inner.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff9a1a : 0xffc93a, transparent: true, opacity: 0.85 }), { pos: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], rot: [0, 0, a - Math.PI / 2], cast: false })); }
  } else if (id === 'egg') {
    const eggM = sm(0xf4eecf);
    inner.add(mesh(new THREE.SphereGeometry(0.62, 14, 10), eggM, { scale: [0.82, 1.1, 0.82] }));
    for (const [x, y, z, r, c] of [[0.25, 0.1, 0.42, 0.17, 0x7a46d4], [-0.3, 0.3, 0.32, 0.14, 0x3fae6a], [0.0, -0.3, 0.47, 0.15, 0xd8372c], [-0.15, -0.05, -0.5, 0.15, 0x7a46d4], [0.35, 0.35, -0.3, 0.12, 0x3fae6a]]) inner.add(mesh(new THREE.SphereGeometry(r, 7, 6), sm(c), { pos: [x, y, z], scale: [1, 1, 0.5], cast: false }));
    radius = 0.62;
  } else if (id === 'cow') {
    const cow = new Animal('cow'); cow.group.scale.setScalar(0.78); cow.group.position.set(0, -0.8, 0); cow.group.rotation.y = Math.PI / 2; inner.add(cow.group); g.userData.cow = cow;
    radius = 0.8;
  }
  g.userData.inner = inner; g.userData.radius = radius;
  return g;
}

// ---------------------------------------------------------------- tekstlabels
export function labelSprite(text, css = '#fff', { w = 256, h = 80, size = 46, scaleX = 3.2 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
  s.scale.set(scaleX, scaleX * h / w, 1); s.renderOrder = 24;
  s.userData.draw = (t, col = css) => {
    if (s.userData.last === t + col) return; s.userData.last = t + col;
    const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
    g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(20,8,30,.9)'; g.lineJoin = 'round'; g.strokeText(t, w / 2, h / 2, w - 10);
    g.fillStyle = col; g.fillText(t, w / 2, h / 2, w - 10); tx.needsUpdate = true;
  };
  s.userData.draw(text, css);
  return s;
}

// windpijl (3D, boven het midden)
export function windArrowSprite() {
  const w = 384, h = 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, opacity: 0.88 }));
  s.scale.set(10, 3.33, 1); s.renderOrder = 6; s.material.depthTest = false;
  s.userData.draw = (wind, extra = '') => {
    const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
    const dir = wind >= 0 ? 1 : -1, len = Math.min(1, Math.abs(wind) / 10);
    g.fillStyle = 'rgba(20,12,40,.55)'; g.beginPath(); g.roundRect(6, 10, w - 12, h - 20, 26); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#bfe8ff'; g.font = 'bold 30px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`WIND ${Math.abs(Math.round(wind))}${extra}`, w / 2, 34);
    const cx = w / 2, cy = 82, L = 40 + len * 120;
    g.fillStyle = Math.abs(wind) > 14 ? '#ff7a5a' : '#fff';
    g.beginPath(); g.moveTo(cx - dir * L, cy - 10); g.lineTo(cx + dir * (L - 22), cy - 10); g.lineTo(cx + dir * (L - 22), cy - 24); g.lineTo(cx + dir * (L + 10), cy); g.lineTo(cx + dir * (L - 22), cy + 24); g.lineTo(cx + dir * (L - 22), cy + 10); g.lineTo(cx - dir * L, cy + 10); g.closePath(); g.fill();
    tx.needsUpdate = true;
  };
  s.userData.draw(0);
  return s;
}

// windzak
export function buildWindsock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.5, 6), mat(0xeeeeee), { pos: [0, 2.75, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xd7b24a), { pos: [0, 5.55, 0] }));
  const sock = new THREE.Group(); sock.position.set(0, 5.0, 0); g.add(sock);
  const segs = [];
  let prev = sock;
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Group(); s.position.set(i === 0 ? 0 : 0.62, 0, 0); prev.add(s);
    const r0 = 0.45 - i * 0.07;
    s.add(mesh(new THREE.CylinderGeometry(r0 - 0.07, r0, 0.64, 8, 1, true), mat(i % 2 ? 0xffffff : 0xff6a2a, { side: THREE.DoubleSide, flatShading: false }), { rot: [0, 0, Math.PI / 2], pos: [0.32, 0, 0], cast: false }));
    segs.push(s); prev = s;
  }
  g.userData = { sock, segs };
  return g;
}
export function animateWindsock(ws, wind, t) {
  const { sock, segs } = ws.userData;
  const dir = wind >= 0 ? 1 : -1, k = Math.min(1, Math.abs(wind) / 8);
  sock.rotation.y = dir > 0 ? 0 : Math.PI;
  sock.rotation.z = lerp(-1.25, 0.04, smoothstep(0, 1, k));
  segs.forEach((s, i) => { s.rotation.z = Math.sin(t * 6 + i * 0.9) * 0.07 * (0.4 + k) * (i + 1) * 0.5; s.rotation.y = Math.sin(t * 5 + i) * 0.05 * k; });
}

// ---------------------------------------------------------------- decor langs het landschap
export function buildDecor(scene, terrain, rng, avoid = []) {
  const items = [];
  const add = (obj, x, kind) => { obj.position.set(x, terrain.heightAt(x) - 0.05, 0.8 + (rng() - 0.5) * 3.6); scene.add(obj); items.push({ obj, x, kind }); };
  for (let i = 0; i < 26; i++) {
    const x = -33 + rng() * 66; if (avoid.some((a) => Math.abs(x - a) < 5.2)) continue;
    const r = rng();
    if (r < 0.34) { const t = P.tree(2.8 + rng() * 2.2, [0x3f9e3a, 0x4fae3a, 0x5aa83c][Math.floor(rng() * 3)]); t.rotation.y = rng() * 6; add(t, x, 'tree'); }
    else if (r < 0.52) { const t = P.pine(3.0 + rng() * 2.2); add(t, x, 'tree'); }
    else if (r < 0.7) { add(P.bush(0.9 + rng() * 0.5), x, 'bush'); }
    else if (r < 0.85) { add(P.rock(0.5 + rng() * 0.7), x, 'rock'); }
    else { add(P.flowerPatch([0xff6fa5, 0xffe14a, 0xffffff, 0xb08aff][Math.floor(rng() * 4)], 6, 1.0), x, 'flower'); }
  }
  for (let i = 0; i < 4; i++) { const x = -30 + rng() * 60; if (avoid.some((a) => Math.abs(x - a) < 5)) continue; const m = P.mushroom(0.8 + rng() * 0.5); add(m, x, 'mush'); }
  return items;
}

// kleine vogeltjes in de lucht
export function makeBird(color = 0x2a2438) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), m));
  const wings = [1, -1].map((sd) => { const w = new THREE.Group(); const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), m); q.position.x = sd * 0.45; w.add(q); g.add(w); return { w, sd }; });
  g.userData.wings = wings;
  return g;
}

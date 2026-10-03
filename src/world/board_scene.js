// FEESTBORD: de 3D-wereld (eiland, vakjes, kasteel, decor, trofee, Deurman-deur, dobbelsteen, poppetjes).
// Alles procedureel; statische rommel wordt met de Merger tot één mesh samengevoegd (weinig draw calls).
import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, lerp, clamp, damp } from '../engine/util.js';
import { makeBrother, makeDeurman, makeHatMesh, PLAYER_COLORS, Dragon } from '../engine/chars.js';
import { setupLights, skyTexture } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { floatLabel } from './build.js';
import { GRAPH, TILES, TILE_ORDER } from './board_data.js';

export const ISLE = { A: 25, B: 19.5 };   // halve assen van het eiland
export const TOKEN_S = 1.3;               // formaat van de poppetjes op het bord
export const TILE_TOP = 0.32;            // hoogte van de bovenkant van een vakje
// per speler (0 Wes, 1 Jor, 2 Juul): pijl-, label- en ringkleur (met vaste terugval als de kern nog geen derde kleur heeft)
const TOK = [{ arrow: 0x5aef90, label: '#8dffb5', ring: 0x2f9e5b }, { arrow: 0x6ab0ff, label: '#9cc8ff', ring: 0x3a78e0 }, { arrow: 0xffa05a, label: '#ffc09a', ring: 0xff8a3a }];
const TOKEN_NAMES = ['Wes', 'Jor', 'Juul'];

// ---------------------------------------------------------------- Merger: veel kleine stukjes -> één geometrie met vertexkleuren
const GC = new Map();
const G = (k, f) => { let g = GC.get(k); if (!g) { g = f(); GC.set(k, g); } return g; };
class Merger {
  constructor() { this.parts = []; this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.q = new THREE.Quaternion(); this.m = new THREE.Matrix4(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); }
  add(geo, x, y, z, color, o = {}) {
    this.e.set(o.rx || 0, o.ry || 0, o.rz || 0); this.q.setFromEuler(this.e); this.v.set(x, y, z); this.s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    this.m.compose(this.v, this.q, this.s);
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(this.m);
    this.parts.push({ g, c: new THREE.Color(color) });
  }
  box(w, h, d, x, y, z, c, o) { this.add(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), x, y + h / 2, z, c, o); }
  cyl(rt, rb, h, seg, x, y, z, c, o) { this.add(G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), x, y + h / 2, z, c, o); }
  cone(r, h, seg, x, y, z, c, o) { this.add(G(`n${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), x, y + h / 2, z, c, o); }
  sph(r, x, y, z, c, o, ws = 8, hs = 6) { this.add(G(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), x, y, z, c, o); }
  build() {
    let n = 0; for (const p of this.parts) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const p of this.parts) { const k = p.g.attributes.position.count; pos.set(p.g.attributes.position.array, o * 3); nor.set(p.g.attributes.normal.array, o * 3); for (let i = 0; i < k; i++) { col[(o + i) * 3] = p.c.r; col[(o + i) * 3 + 1] = p.c.g; col[(o + i) * 3 + 2] = p.c.b; } o += k; p.g.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere(); this.parts = []; return g;
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
let VMAT = null;
const vmat = () => VMAT || (VMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }));
function mergedMesh(M, { cast = true, recv = true } = {}) { const m = new THREE.Mesh(M.build(), vmat()); m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; return m; }

// ---------------------------------------------------------------- losse bouwstenen
const numTexCache = new Map();
export function numTex(text, color = '#ffffff', stroke = '#2a1850') {
  const k = text + color; let t = numTexCache.get(k);
  if (!t) { t = canvasTex(128, 128, (g, w, h) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 92px Fredoka, Arial Black, sans-serif'; g.lineWidth = 16; g.lineJoin = 'round'; g.strokeStyle = stroke; g.strokeText(text, w / 2, h / 2 + 6, w - 8); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 6, w - 8); }); t.userData.keep = true; numTexCache.set(k, t); }
  return t;
}
export function numSprite(text, color, scale = 1.3) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(String(text), color), transparent: true, depthTest: false })); s.scale.set(scale, scale, 1); s.renderOrder = 30; return s; }
export const setSpriteText = (s, text, color) => { s.material.map = numTex(String(text), color); s.material.needsUpdate = true; };

function friendlyFace() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, 170); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(170,160,190,.45)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,120,150,.6)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + sx * 84, 142, 24, 14, 0, 0, 7); g.fill(); }
    for (const sx of [-1, 1]) {   // blije dichtgeknepen ogen (^ ^) met wenkbrauwen
      const cx = w / 2 + sx * 52, cy = 104;
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + 14, 24, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.arc(cx, cy - 38, 24, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    }
    // een veel te brede, vriendelijke glimlach met tanden
    g.fillStyle = '#7a1f2a'; g.beginPath(); g.moveTo(26, 150); g.bezierCurveTo(70, 252, 186, 252, 230, 150); g.bezierCurveTo(186, 178, 70, 178, 26, 150); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(34, 156); g.bezierCurveTo(78, 184, 178, 184, 222, 156); g.bezierCurveTo(178, 206, 78, 206, 34, 156); g.fill();
    g.strokeStyle = '#333'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(26, 150); g.bezierCurveTo(70, 252, 186, 252, 230, 150); g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#bbb'; for (let i = 1; i < 14; i++) { const x = 34 + i * 14; g.beginPath(); g.moveTo(x, 168 + Math.sin(i / 14 * Math.PI) * 6); g.lineTo(x, 188 + Math.sin(i / 14 * Math.PI) * 10); g.stroke(); }
  }); t.userData.keep = false; return t;
}
// De lieve Deurman: dezelfde lange, bleke meneer, maar met een vriendelijk gezicht (geen rode ogen)
export function makeFriendlyDeurman(scale = 0.9) {
  const d = makeDeurman(scale);
  for (const c of d.head.children) { if (c.material && c.material.isMeshBasicMaterial) { if (c.material.map) c.material = new THREE.MeshBasicMaterial({ map: friendlyFace() }); else c.visible = false; } }
  return d;
}

function atlasTexture() {
  const cell = 128, cols = 8;
  const t = canvasTex(cols * cell, 2 * cell, (g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    [...TILE_ORDER, 'start'].forEach((id, i) => {
      const cx = (i % cols) * cell + cell / 2, cy = Math.floor(i / cols) * cell + cell / 2;
      if (id === 'blue' || id === 'red') { g.font = 'bold 74px Fredoka, Arial Black, sans-serif'; const s = id === 'blue' ? '+3' : '−3'; g.lineWidth = 15; g.strokeStyle = 'rgba(15,20,70,.8)'; g.strokeText(s, cx, cy + 4, 110); g.fillStyle = '#fff'; g.fillText(s, cx, cy + 4, 110); }
      else { g.font = '78px serif'; g.fillText(id === 'start' ? '🏁' : TILES[id].icon, cx, cy + 6); }
    });
  }); return t;
}

// ---------------------------------------------------------------- de wereld
export class BoardWorld {
  constructor(scene, { low = false, fx = null, n = 2 } = {}) {
    this.scene = scene; this.low = low; this.n = n; this.fx = fx; this.t = 0; this.rng = mulberry32(2024); this.dyn = [];
    const L = setupLights(scene, 'day', { shadow: 36, center: [0, 0, 0], fog: true, fogNear: 110, fogFar: 300, shadows: !low });
    this.sun = L.sun; this.hemi = L.hemi; L.sun.position.set(-26, 46, 30); L.sun.intensity = 2.3; L.hemi.intensity = 1.25;
    scene.background = skyTexture('#4aa6ff', '#ffe6f4'); scene.fog.color.set(0xdff0ff);
    this.nodes = GRAPH.nodes;
    this.buildSea(); this.buildIsland(); this.buildTiles(); this.buildDecor(); this.buildCastle(); this.buildLandmarks(); this.buildSky();
    this.buildTrophy(); this.buildDeurDoor(); this.buildDice(); this.buildTokens();
    this.traps = new Map();
  }

  // ---- zee + eiland
  buildSea() {
    const wt = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#35b6ea'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.lineCap = 'round'; const r = mulberry32(5); for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, l = 14 + r() * 22; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 5, x + l, y); g.stroke(); } }, { repeat: [34, 34] });
    this.seaTex = wt;
    const sea = mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.3, metalness: 0.05 }), { cast: false, pos: [0, -2.4, 0], rot: [-Math.PI / 2, 0, 0] });
    this.scene.add(sea);
    const foam = mesh(new THREE.RingGeometry(1.0, 1.12, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), { cast: false, receive: false, pos: [0, -2.3, 0], rot: [-Math.PI / 2, 0, 0], scale: [ISLE.A * 1.04, ISLE.B * 1.04, 1] });
    this.foam = foam; this.scene.add(foam);
  }
  buildIsland() {
    const { A, B } = ISLE; const sc = this.scene;
    const grass = tex.grass(9, 7); const sand = tex.sand(6, 4);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.4, 72), [new THREE.MeshStandardMaterial({ map: tex.dirt(10, 1), roughness: 1 }), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95, color: 0xdfffd0 }), new THREE.MeshStandardMaterial({ color: 0x6a4a2a })]);
    top.scale.set(A, 1, B); top.position.y = -0.7; top.receiveShadow = true; sc.add(top);
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.1, 0.7, 72), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
    beach.scale.set(A, 1, B); beach.position.y = -1.0; beach.receiveShadow = true; sc.add(beach);
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 0.62, 3.2, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0xa88a62, roughness: 1, flatShading: true }));
    rock.scale.set(A, 1, B); rock.position.y = -2.7; sc.add(rock);
    // vijver met de brug
    const wt = tex.water(3, 6); this.pondTex = wt;
    const pond = mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ map: wt, color: 0xbfeaff, roughness: 0.25, metalness: 0.1 }), { cast: false, pos: [0, 0.04, 0], rot: [-Math.PI / 2, 0, 0], scale: [4.6, 9.4, 1] });
    sc.add(pond);
  }

  // ---- vakjes (instanced), weggetjes, pijltjes en icoon-plaatjes
  buildTiles() {
    const nodes = this.nodes, N = nodes.length, sc = this.scene;
    this.plates = new THREE.InstancedMesh(G('plate', () => new THREE.CylinderGeometry(1.05, 1.12, 0.3, 24)), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), N);
    this.rims = new THREE.InstancedMesh(G('rim', () => new THREE.CylinderGeometry(1.22, 1.3, 0.2, 24)), new THREE.MeshStandardMaterial({ color: 0xfff6e2, roughness: 0.8 }), N);
    const m = new THREE.Matrix4();
    nodes.forEach((n, i) => { m.makeTranslation(n.x, n.y + 0.15, n.z); this.plates.setMatrixAt(i, m); m.makeTranslation(n.x, n.y + 0.1, n.z); this.rims.setMatrixAt(i, m); });
    this.plates.castShadow = this.rims.castShadow = false; this.plates.receiveShadow = this.rims.receiveShadow = true; this.plates.frustumCulled = this.rims.frustumCulled = false;
    sc.add(this.rims, this.plates);
    // weggetjes tussen de vakjes + richtingspijltjes
    const edges = []; for (const n of nodes) for (const k of n.next) edges.push([n, nodes[k]]);
    const roads = new THREE.InstancedMesh(G('road', () => new THREE.BoxGeometry(1, 0.1, 1)), new THREE.MeshStandardMaterial({ color: 0xffeec4, roughness: 0.9 }), edges.length);
    const arrows = new THREE.InstancedMesh(G('arrow', () => new THREE.ConeGeometry(0.3, 0.6, 3).rotateX(Math.PI / 2)), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x555544 }), edges.length);
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    edges.forEach(([a, b], i) => {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
      q.setFromAxisAngle(up, ang); s.set(1.0, 1, len); v.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.05, (a.z + b.z) / 2); m.compose(v, q, s); roads.setMatrixAt(i, m);
      s.set(1, 1, 1); v.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.2, (a.z + b.z) / 2); m.compose(v, q, s); arrows.setMatrixAt(i, m);
    });
    roads.receiveShadow = true; roads.frustumCulled = arrows.frustumCulled = false; sc.add(roads, arrows);
    // icoon-plaatjes: één geometrie, UV's wisselen als een vakje van type verandert
    const pos = new Float32Array(N * 12), uv = new Float32Array(N * 8), idx = new Uint16Array(N * 6), nor = new Float32Array(N * 12);
    nodes.forEach((n, i) => {
      const y = n.y + TILE_TOP + 0.012, s2 = 0.78;
      const x = n.x, z = n.z; pos.set([x - s2, y, z - s2, x + s2, y, z - s2, x - s2, y, z + s2, x + s2, y, z + s2], i * 12);
      for (let k = 0; k < 4; k++) nor[i * 12 + k * 3 + 1] = 1;
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); dg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); dg.setIndex(new THREE.BufferAttribute(idx, 1));
    this.decalGeo = dg; this.atlas = atlasTexture();
    const dm = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: this.atlas, transparent: true, alphaTest: 0.35, depthWrite: false })); dm.frustumCulled = false; dm.renderOrder = 2; sc.add(dm);
    this.kinds = nodes.map((n) => n.type); this.refreshTiles(-1);
    // start-boog
    const sn = nodes[GRAPH.start], M = new Merger(); const ox = sn.x, oz = sn.z;
    for (const sx of [-1, 1]) M.cyl(0.16, 0.2, 4.2, 8, ox + sx * 2.7, 0, oz, 0xff5a5a);
    M.box(6.0, 0.7, 0.3, ox, 4.0, oz, 0x35c46f); M.sph(0.34, ox - 2.7, 4.5, oz, 0xffd23f); M.sph(0.34, ox + 2.7, 4.5, oz, 0xffd23f);
    this.scene.add(mergedMesh(M));
    const lb = floatLabel('START', '', '#ffffff'); lb.scale.set(3, 0.95, 1); lb.position.set(ox, 4.0, oz + 0.25); sc.add(lb);
  }
  // typ per vakje bijwerken (kleur + icoon); trophyNode = actieve trofee-plek
  refreshTiles(trophyNode) {
    const nodes = this.nodes, col = new THREE.Color(); const uv = this.decalGeo.attributes.uv; const cols = 8;
    nodes.forEach((n, i) => {
      const type = i === trophyNode ? 'trophy' : n.type;
      col.setHex(TILES[type].color); if (i === GRAPH.start) col.setHex(0x4ac85a); this.plates.setColorAt(i, col);
      const cell = i === GRAPH.start ? TILE_ORDER.length : TILE_ORDER.indexOf(type); const cx = cell % cols, cy = Math.floor(cell / cols);
      const u0 = cx / cols, u1 = (cx + 1) / cols, v1 = 1 - cy / 2, v0 = 1 - (cy + 1) / 2;
      uv.setXY(i * 4, u0, v1); uv.setXY(i * 4 + 1, u1, v1); uv.setXY(i * 4 + 2, u0, v0); uv.setXY(i * 4 + 3, u1, v0);
    });
    this.plates.instanceColor.needsUpdate = true; uv.needsUpdate = true;
  }

  // ---- decor: bomen, struiken, bloemen, stalletjes, vlaggetjes, brug
  nearNode(x, z, d) { for (const n of this.nodes) if (Math.hypot(n.x - x, n.z - z) < d) return true; return false; }
  free(x, z, d = 2.7) {
    if (this.nearNode(x, z, d)) return false;
    if (Math.abs(x) < 5.9 && Math.abs(z) < 12.3) return false;                // vijver + brug
    if (z < -13.2 && Math.abs(x) < 10.5) return false;                         // kasteel
    if (z > 12.5 && Math.abs(x) < 7) return false;                             // podium-plek
    if (Math.hypot(x + 15.5, z + 13.4) < 4.5 || Math.hypot(x - 16.2, z + 13.6) < 6.2 || Math.hypot(x + 21.6, z + 6.4) < 4.6) return false;   // molen, reuzenrad, tent
    return (x * x) / (ISLE.A * ISLE.A * 0.8) + (z * z) / (ISLE.B * ISLE.B * 0.8) < 1;
  }
  buildDecor() {
    const M = new Merger(), r = this.rng; const rnd = (a, b) => a + r() * (b - a);
    const place = (n, fn, d) => { let k = 0, tries = 0; while (k < n && tries++ < n * 40) { const x = rnd(-ISLE.A * 0.9, ISLE.A * 0.9), z = rnd(-ISLE.B * 0.9, ISLE.B * 0.9); if (this.free(x, z, d)) { fn(x, z); k++; } } };
    const leaf = G('leaf', () => new THREE.BoxGeometry(0.4, 0.07, 2.2).translate(0, 0, 1.1));
    const palm = (x, z) => {
      const h = rnd(2.4, 3.3), lean = rnd(0, TAU), lx = Math.sin(lean) * 0.5, lz = Math.cos(lean) * 0.5; let px = x, py = 0, pz = z;
      for (let s = 0; s < 4; s++) { M.cyl(0.2 - s * 0.025, 0.24 - s * 0.025, h / 4 + 0.05, 6, px, py, pz, s % 2 ? 0x9a6a3a : 0x8a5a2e); px += lx * 0.3; pz += lz * 0.3; py += h / 4; }
      for (let i = 0; i < 7; i++) M.add(leaf, px, py, pz, i % 2 ? 0x3ab85a : 0x2fa04c, { ry: i / 7 * TAU, rx: 0.5 });
      M.sph(0.28, px, py - 0.1, pz, 0x6a4a28); M.sph(0.2, px + 0.2, py - 0.3, pz, 0x6a4a28);
    };
    const tree = (x, z) => { const h = rnd(0.9, 1.4), c = [0x3fb04a, 0x59c04a, 0x2f9a58, 0x7ac84e][Math.floor(r() * 4)]; M.cyl(0.24, 0.32, h, 6, x, 0, z, 0x8a5a30); M.sph(rnd(1.0, 1.4), x, h + 0.8, z, c, { sy: 0.9 }, 8, 6); M.sph(0.7, x + 0.45, h + 1.4, z - 0.2, c + 0x080808, {}, 7, 5); };
    const pine = (x, z) => { const h = rnd(2.0, 2.9); M.cyl(0.2, 0.28, 0.8, 6, x, 0, z, 0x7a4a28); M.cone(1.3, h * 0.55, 7, x, 0.8, z, 0x1f8a52); M.cone(1.0, h * 0.5, 7, x, 0.8 + h * 0.3, z, 0x279a5c); M.cone(0.7, h * 0.4, 7, x, 0.8 + h * 0.58, z, 0x31ab66); };
    const bush = (x, z) => { const c = [0x4cc05a, 0x37a84e, 0x6ad060][Math.floor(r() * 3)]; M.sph(rnd(0.55, 0.9), x, 0.4, z, c, { sy: 0.7 }, 7, 5); M.sph(0.4, x + 0.6, 0.3, z + 0.2, c, { sy: 0.7 }, 6, 4); };
    const flower = (x, z) => { const c = [0xff5a8a, 0xffd23f, 0xffffff, 0xb05aff, 0xff8a3a][Math.floor(r() * 5)]; for (let i = 0; i < 4; i++) { const fx = x + rnd(-0.6, 0.6), fz = z + rnd(-0.6, 0.6); M.cyl(0.03, 0.03, 0.4, 3, fx, 0, fz, 0x3a9a40); M.sph(0.14, fx, 0.46, fz, c, {}, 5, 4); } };
    const rock = (x, z) => M.sph(rnd(0.4, 0.9), x, 0.2, z, 0x9a9ca8, { sy: 0.6, sx: rnd(0.8, 1.3) }, 5, 4);
    const shroom = (x, z) => { M.cyl(0.12, 0.14, 0.45, 5, x, 0, z, 0xfff0d8); M.cone(0.42, 0.4, 7, x, 0.4, z, 0xe8453c); M.sph(0.07, x + 0.15, 0.7, z, 0xffffff, {}, 4, 3); };
    place(10, palm, 3.2); place(9, tree, 3.0); place(7, pine, 3.0); place(16, bush, 2.4); place(20, flower, 2.2); place(8, rock, 2.2); place(6, shroom, 2.2);
    // brug: planken, leuningen
    for (let z = -12; z <= 12; z += 0.62) M.box(3.2, 0.14, 0.5, 0, 0.12, z, (z * 7 | 0) % 2 ? 0xb98a54 : 0xa87a46);
    for (const sx of [-1, 1]) { M.box(0.12, 0.12, 24.4, sx * 1.65, 1.1, 0, 0xffffff); for (let z = -12; z <= 12; z += 3.05) M.cyl(0.1, 0.1, 1.2, 6, sx * 1.65, 0, z, 0xe8453c); }
    // stalletjes bij de winkels
    this.nodes.forEach((n) => {
      if (n.type !== 'shop') return; const nx = n.x / (17 * 17), nz = n.z / (11.5 * 11.5), nl = Math.hypot(nx, nz) || 1; const ox = n.x + nx / nl * 2.8, oz = n.z + nz / nl * 2.8, ang = Math.atan2(-nx, -nz);
      M.box(2.6, 0.9, 1.1, ox, 0, oz, 0xc88a4a, { ry: ang }); const ca = Math.cos(ang), sa = Math.sin(ang);
      for (const sx of [-1, 1]) M.cyl(0.07, 0.07, 2.3, 5, ox + sx * 1.2 * ca, 0, oz - sx * 1.2 * sa, 0xf0e0c0);
      for (let i = 0; i < 6; i++) M.box(0.45, 0.14, 1.5, ox + (i - 2.5) * 0.43 * ca, 2.3, oz - (i - 2.5) * 0.43 * sa, i % 2 ? 0xffffff : 0xff5aa8, { ry: ang, rx: -0.18 });
      M.sph(0.22, ox + 0.5 * ca, 1.15, oz - 0.5 * sa, 0xffd23f); M.sph(0.22, ox - 0.5 * ca, 1.15, oz + 0.5 * sa, 0xff6a3a);
    });
    // vlaggetjesslinger op palen rond het eiland
    const poles = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.15; poles.push([Math.cos(a) * 21.8, Math.sin(a) * 15.8]); }
    poles.forEach(([x, z], i) => { M.cyl(0.1, 0.14, 4.4, 5, x, 0, z, 0xf8f0e0); M.sph(0.25, x, 4.5, z, 0xffd23f); const [x2, z2] = poles[(i + 1) % 10]; let px = x, py = 4.4, pz = z; for (let k = 1; k <= 9; k++) { const t = k / 9, fx = lerp(x, x2, t), fz = lerp(z, z2, t), fy = 4.4 - Math.sin(t * Math.PI) * 0.9; const dx = fx - px, dy = fy - py, dz = fz - pz, L = Math.hypot(dx, dy, dz); M.box(0.06, 0.06, L, (px + fx) / 2, (py + fy) / 2 - 0.03, (pz + fz) / 2, 0xfff4d8, { ry: Math.atan2(dx, dz), rx: -Math.atan2(dy, Math.hypot(dx, dz)) }); if (k < 9) M.cone(0.3, 0.55, 3, fx, fy - 0.5, fz, [0xff4a6a, 0xffd23f, 0x3a9aff, 0x4ad86a, 0xb05aff][(i + k) % 5], { rx: Math.PI }); px = fx; py = fy; pz = fz; } });
    this.scene.add(mergedMesh(M));
  }

  // ---- kasteel op de achtergrond, molen, reuzenrad, circustent
  buildCastle() {
    const M = new Merger(), cz = -17.4; const wall = 0xf5e0b4, wall2 = 0xe8cf9a;
    M.box(11, 5.2, 3.2, 0, 0, cz, wall); for (let i = 0; i < 9; i++) M.box(0.75, 0.7, 0.7, -4.4 + i * 1.1, 5.2, cz + 1.2, wall2);
    M.box(5.4, 7.8, 4.2, 0, 0, cz - 0.8, wall); M.cone(3.4, 3.8, 4, 0, 7.8, cz - 0.8, 0xe8453c, { ry: Math.PI / 4 }); M.sph(0.35, 0, 11.9, cz - 0.8, 0xffd23f);
    const tc = [0x3a82f0, 0xff5ab0, 0x8a5ad8, 0xffb81c];
    [[-5.8, 1], [5.8, 1], [-3.6, -2.2], [3.6, -2.2]].forEach(([x, dz], i) => { const h = i < 2 ? 7.4 : 9.6; M.cyl(1.35, 1.5, h, 10, x, 0, cz + dz, wall2); M.cone(1.9, 2.8, 10, x, h, cz + dz, tc[i]); M.sph(0.25, x, h + 2.9, cz + dz, 0xffd23f); M.cyl(0.05, 0.05, 1.2, 4, x, h + 2.8, cz + dz, 0x555555); M.box(0.9, 0.5, 0.05, x + 0.5, h + 3.6, cz + dz, [0xff4a6a, 0x3a9aff][i % 2]); for (const wy of [h * 0.55]) M.box(0.45, 0.8, 0.2, x, wy, cz + dz + 1.4, 0x33406a); });
    M.box(1.9, 2.8, 0.4, 0, 0, cz + 1.7, 0x5a3820); M.cyl(0.95, 0.95, 0.4, 12, 0, 2.8, cz + 1.7, 0x5a3820, { rx: Math.PI / 2 });
    for (const sx of [-1, 1]) for (const wy of [3.6, 5.4]) M.box(0.5, 0.9, 0.2, sx * 1.6, wy, cz + 1.65, 0x33406a);
    // heuvel onder het kasteel
    M.sph(9, 0, -3.2, cz - 1, 0x5ec04c, { sy: 0.38, sx: 1.5 }, 14, 8);
    this.scene.add(mergedMesh(M));
  }
  buildLandmarks() {
    const M = new Merger(), sc = this.scene;
    // alles hoge staat buiten de ring (achter/zijkant), zodat de camera nooit door een reuzenrad kijkt
    const mx = -15.5, mz = -13.4;   // molen
    M.cyl(1.2, 1.9, 5.2, 8, mx, 0, mz, 0xfff0d0); M.cone(1.7, 1.9, 8, mx, 5.2, mz, 0xe8453c); M.box(0.9, 1.5, 0.3, mx, 0, mz + 1.6, 0x5a3820);
    M.sph(1.0, mx - 3.4, 0.4, mz + 2.4, 0x4cc05a, { sy: 0.6 }); M.sph(0.8, mx + 3.2, 0.3, mz + 2.0, 0x37a84e, { sy: 0.6 });
    const wx = 16.2, wz = -13.6, WH = 5.6, WR = 4.5;   // reuzenrad
    this.wheelC = [wx, WH, wz + 0.6, WR];
    for (const sz of [-1, 1]) { M.box(0.35, WH + 0.6, 0.35, wx - 0.9, 0, wz + sz * 1.1, 0xd8d8e8, { rz: 0.3 }); M.box(0.35, WH + 0.6, 0.35, wx + 0.9, 0, wz + sz * 1.1, 0xd8d8e8, { rz: -0.3 }); }
    M.box(7, 0.3, 3.2, wx, 0, wz, 0x8a6a4a);
    const tx = -21.6, tz = -6.4;   // circustent links
    M.cyl(3.0, 3.0, 2.0, 16, tx, 0, tz, 0xfff0d8);
    for (let i = 0; i < 8; i++) { const wg = G(`wedge${i}`, () => new THREE.ConeGeometry(3.5, 3.2, 1, 1, false, i / 8 * TAU, TAU / 8)); M.add(wg, tx, 2.0 + 1.6, tz, i % 2 ? 0xffffff : 0xe8453c); }
    M.cyl(0.06, 0.06, 1.5, 4, tx, 5.2, tz, 0x555555); M.box(0.9, 0.5, 0.05, tx + 0.5, 6.3, tz, 0xffd23f); M.box(1.4, 1.9, 0.2, tx + 3.0, 0, tz, 0x5a2a6a, { ry: Math.PI / 2 });
    sc.add(mergedMesh(M));
    // draaiende delen: molenwieken en reuzenrad (één mesh elk)
    const MB = new Merger(); for (let i = 0; i < 4; i++) { MB.box(0.35, 4.4, 0.12, 0, 0, 0, 0xffffff, { rz: i * Math.PI / 2 }); MB.box(0.9, 2.2, 0.05, 0.6, 1.8, 0.04, 0xf2f2f2, { rz: i * Math.PI / 2 }); }
    this.blades = mergedMesh(MB, { recv: false }); this.blades.position.set(mx, 4.9, mz + 1.7); sc.add(this.blades);
    const MW = new Merger(); for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; MW.box(1.0, 0.2, 0.3, Math.cos(a) * WR, Math.sin(a) * WR - 0.1, 0, 0xff5a8a, { rz: a + Math.PI / 2 }); }
    for (let i = 0; i < 8; i++) MW.box(WR * 2, 0.14, 0.14, 0, -0.07, 0, 0xffffff, { rz: i / 8 * Math.PI }); MW.sph(0.5, 0, 0, 0, 0xffd23f);
    this.wheel = mergedMesh(MW, { recv: false }); this.wheel.position.set(wx, WH, wz + 0.6); sc.add(this.wheel);
    this.gondolas = new THREE.InstancedMesh(G('gond', () => new THREE.BoxGeometry(0.9, 0.7, 0.8)), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 8); this.gondolas.frustumCulled = false; this.gondolas.castShadow = true;
    for (let i = 0; i < 8; i++) this.gondolas.setColorAt(i, new THREE.Color([0xff4a6a, 0xffd23f, 0x3a9aff, 0x4ad86a, 0xb05aff, 0xff8a3a, 0x2fd0d0, 0xff7ad0][i]));
    sc.add(this.gondolas);
  }
  buildSky() {
    const sc = this.scene; this.clouds = []; const r = this.rng;
    for (let i = 0; i < 7; i++) {
      const M = new Merger(); const n = 4 + Math.floor(r() * 3); for (let k = 0; k < n; k++) M.sph(1.3 + r() * 1.3, (k - n / 2) * 1.9, r() * 0.8, (r() - 0.5) * 1.4, 0xffffff, { sy: 0.7 }, 8, 6);
      const c = new THREE.Mesh(M.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.93 })); c.position.set(-70 + i * 24, 20 + r() * 12, -26 - r() * 22); c.userData.v = 0.5 + r() * 0.9; c.frustumCulled = false; sc.add(c); this.clouds.push(c);
    }
    // luchtballonnen
    this.balloons = [];
    [[-24, 12, 4, 0xff4a6a], [22, 15, -6, 0x3a9aff], [-10, 17, -24, 0xffd23f]].forEach(([x, y, z, c], i) => {
      const M = new Merger(); M.sph(2.0, 0, 0, 0, c, { sy: 1.15 }, 10, 8); M.sph(2.02, 0, 0, 0, 0xffffff, { sy: 1.15, sx: 0.35 }, 10, 8); M.cyl(0.05, 0.05, 1.4, 4, 0.5, -3.2, 0, 0x6a4a28); M.cyl(0.05, 0.05, 1.4, 4, -0.5, -3.2, 0, 0x6a4a28); M.box(1.1, 0.7, 1.1, 0, -4.2, 0, 0xb8864a);
      const b = new THREE.Mesh(M.build(), vmat()); b.position.set(x, y, z); b.castShadow = true; b.userData.ph = i * 2; sc.add(b); this.balloons.push(b);
    });
    // vriendelijke draak
    this.dragon = new Dragon(0xff8a3a, 0.75); this.dragon.group.traverse((o) => { if (o.isMesh) o.castShadow = false; }); sc.add(this.dragon.group);
  }

  // ---- de Trofee
  buildTrophy() {
    const g = new THREE.Group(); const gold = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.75, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.6 });
    const prof = [[0, 0], [0.7, 0], [0.7, 0.15], [0.35, 0.3], [0.2, 0.55], [0.2, 0.9], [0.55, 1.15], [0.95, 1.9], [0.9, 2.05], [0.7, 1.95], [0.0, 1.5]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), gold); cup.castShadow = true; g.add(cup);
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 14, Math.PI), gold); h.position.set(sx * 0.92, 1.65, 0); h.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(h); }
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffc000, emissiveIntensity: 1.2 })); star.position.y = 2.6; g.add(star); this.trophyStar = star;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 4.8; g.add(beam); this.beam = beam;
    this.trophy = new THREE.Group(); this.trophy.add(g); this.trophyBody = g; g.position.y = 0; g.scale.setScalar(0.85); this.scene.add(this.trophy);
    this.trophyNode = -1;
  }
  nodeTop(id) { const n = this.nodes[id]; return new THREE.Vector3(n.x, n.y + TILE_TOP, n.z); }
  setTrophyNode(id) { this.trophyNode = id; const n = this.nodes[id]; this.trophy.position.set(n.x, n.y + TILE_TOP, n.z); this.refreshTiles(id); }

  // ---- Deurman-deur bij zijn vakje
  buildDeurDoor() {
    const id = this.nodes.findIndex((n) => n.type === 'deur'); this.deurNode = id; const n = this.nodes[id];
    const nx = n.x / (17 * 17), nz = n.z / (11.5 * 11.5), nl = Math.hypot(nx, nz); const ox = nx / nl, oz = nz / nl;
    // de deur kijkt schuin naar de camera, zodat je zijn gezicht ziet
    const fx = -ox * 0.5, fz = -oz * 0.5 + 0.9, fl = Math.hypot(fx, fz); this.deurFace = new THREE.Vector3(fx / fl, 0, fz / fl);
    const g = new THREE.Group(); g.position.set(n.x + ox * 3.6, 0, n.z + oz * 3.6); g.rotation.y = Math.atan2(this.deurFace.x, this.deurFace.z);
    const door = P.door(2.1, 4.2, 0x8a4fd0); g.add(door); this.doorLeaf = door.userData.leaf;
    const glow = canvasTex(8, 64, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a1a6a'); gr.addColorStop(1, '#b07aff'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    g.add(mesh(new THREE.PlaneGeometry(2.1, 4.2), new THREE.MeshBasicMaterial({ map: glow }), { cast: false, receive: false, pos: [0, 2.1, 0.045] }));   // gloeiende deuropening
    g.add(mesh(new THREE.BoxGeometry(3.0, 0.5, 0.5), mat(0xffd23f), { pos: [0, 4.75, -0.1] }));
    const lb = floatLabel('🚪 Deurman', '', '#d8b8ff'); lb.scale.set(3.4, 1.05, 1); lb.position.set(0, 6.0, 0); g.add(lb);
    this.doorGroup = g; this.scene.add(g);
    this.deurman = makeFriendlyDeurman(1.12); this.deurman.group.visible = false; this.deurman.group.userData.dynamic = true; this.scene.add(this.deurman.group);
    this.deurHome = new THREE.Vector3(g.position.x, 0, g.position.z); this.deurOut = new THREE.Vector3(n.x + ox * 2.0 + 0.3, 0, n.z + oz * 2.0 + 0.9); this.deurDir = this.deurFace.clone(); this.deurLook = new THREE.Vector3(0.2, 0, 0.98).normalize();
    this.deurOpen = 0; this.deurTarget = 0; this.deurOutK = 0; this.deurOutTarget = 0; this.deurIdle = 4 + Math.random() * 4;
    this.deurman.group.position.copy(this.deurHome);
  }
  openDeur(open, out = false) { this.deurTarget = open ? 1 : 0; this.deurOutTarget = out ? 1 : 0; }

  // ---- dobbelstenen (dodecaëders met een zwevend getal)
  buildDice() {
    this.dice = new THREE.Group(); this.dice.visible = false; this.diceMeshes = [];
    for (let i = 0; i < 2; i++) {
      const d = new THREE.Group(); const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62), new THREE.MeshStandardMaterial({ color: i ? 0xffe7ff : 0xfff6d8, roughness: 0.35, flatShading: true, emissive: 0x332244, emissiveIntensity: 0.4 })); body.castShadow = false; d.add(body);
      const sp = numSprite('1', '#ffffff', 1.5); sp.position.y = 1.15; d.add(sp); d.userData = { body, sp }; this.dice.add(d); this.diceMeshes.push(d);
    }
    this.scene.add(this.dice);
  }
  // ---- poppetjes
  buildTokens() {
    this.tokens = Array.from({ length: this.n }, (_, i) => {
      let c; try { c = makeBrother(i); } catch (e) { c = makeBrother(1); }   // terugval zolang de kern nog geen Juul kent
      c.group.scale.setScalar(TOKEN_S); this.scene.add(c.group);
      const ring = mesh(new THREE.RingGeometry(0.62, 0.8, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i] ?? TOK[i].ring, transparent: true, opacity: 0.85, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); this.scene.add(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.65, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: TOK[i].arrow })); arrow.visible = false; this.scene.add(arrow);
      const label = floatLabel(TOKEN_NAMES[i], '', TOK[i].label); label.scale.set(2.2, 0.68, 1); label.material.depthTest = false; this.scene.add(label);
      const cnt = numSprite('', '#ffe14a', 1.5); cnt.visible = false; this.scene.add(cnt);
      return { c, ring, arrow, label, cnt, pos: new THREE.Vector3(), y: 0, hat: null };
    });
  }
  // plek van een poppetje op een vakje (twee of drie poppetjes naast elkaar): idx = volgorde onder de aanwezigen, cnt = aantal
  slotAt(id, idx, cnt) {
    const n = this.nodes[id]; if (cnt <= 1) return new THREE.Vector3(n.x, n.y + TILE_TOP, n.z);
    if (cnt === 2) return new THREE.Vector3(n.x + (idx ? 0.55 : -0.55), n.y + TILE_TOP, n.z + 0.1);
    return new THREE.Vector3(n.x + (idx - 1) * 0.85, n.y + TILE_TOP, n.z + (idx === 1 ? -0.3 : 0.3));
  }
  slot(id, i, shared) { return this.slotAt(id, i ? 1 : 0, shared ? 2 : 1); }
  setHat(i, kind) {
    const t = this.tokens[i]; if (t.hat) { t.c.head.remove(t.hat); t.hat = null; }
    if (kind) { const h = makeHatMesh(kind, kind === 'crown' ? 0xffd23f : 0x1e1c24, 0xd8372c, 1.1); h.position.y = 0.04 + 0.3 * 0.9 * (t.c.spec.scale ?? 1); t.c.head.add(h); t.hat = h; }
  }
  // banaan-val
  addTrap(node) {
    const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.5, flatShading: true });
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 6, 12, Math.PI * 1.15), m); b.rotation.set(Math.PI / 2 - 0.3, 0, 0.3); b.position.y = 0.22; b.castShadow = true; g.add(b);
    g.add(mesh(new THREE.SphereGeometry(0.09, 5, 4), mat(0x5a3a18), { pos: [0.34, 0.2, 0.15] }));
    const n = this.nodes[node]; g.position.set(n.x + 0.5, n.y + TILE_TOP, n.z - 0.45); this.scene.add(g); this.traps.set(node, g);
  }
  removeTrap(node) { const g = this.traps.get(node); if (g) { this.scene.remove(g); this.traps.delete(node); } }

  // ---- animatie per frame
  update(dt) {
    this.t += dt; const t = this.t;
    this.seaTex.offset.set(t * 0.012, t * 0.007); this.pondTex.offset.set(t * 0.02, -t * 0.03); this.foam.scale.set(ISLE.A * (1.04 + Math.sin(t * 1.3) * 0.006), ISLE.B * (1.04 + Math.sin(t * 1.3) * 0.006), 1);
    this.blades.rotation.z = -t * 0.9; this.wheel.rotation.z = t * 0.22; const [wx, wy, wz, wr] = this.wheelC;
    const m = _m, q = _q, v = _v, s1 = _s1;
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.22; v.set(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr - 0.7, wz); m.compose(v, q, s1); this.gondolas.setMatrixAt(i, m); }
    this.gondolas.instanceMatrix.needsUpdate = true;
    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 90) c.position.x = -90; }
    for (const b of this.balloons) { b.position.y += Math.sin(t * 0.7 + b.userData.ph) * dt * 0.5; b.rotation.y = Math.sin(t * 0.3 + b.userData.ph) * 0.4; }
    const da = t * 0.22; const dg = this.dragon.group; dg.position.set(Math.cos(da) * 30 - 2, 15 + Math.sin(t * 0.9) * 1.2, -4 + Math.sin(da) * 17); dg.rotation.y = -da + Math.PI; dg.rotation.z = -0.3; this.dragon.update(dt);
    // trofee: draait en zweeft
    this.trophyBody.rotation.y += dt * 1.6; this.trophyBody.position.y = 0.3 + Math.sin(t * 2.2) * 0.12; this.trophyStar.rotation.y -= dt * 3; this.beam.material.opacity = 0.16 + Math.sin(t * 3) * 0.05;
    // de Deurman: deur gaat open, hij loopt naar buiten of kijkt even
    const d = this.deurman;
    if (this.deurTarget === 0 && this.deurOutTarget === 0) { this.deurIdle -= dt; if (this.deurIdle < 0) { this.deurIdle = 7 + Math.random() * 7; this.idlePeek = 2.2; } }
    if (this.idlePeek > 0) { this.idlePeek -= dt; this.deurTarget = 1; if (this.idlePeek <= 0) this.deurTarget = 0; }
    this.deurOpen = damp(this.deurOpen, this.deurTarget, 4, dt); this.deurOutK = damp(this.deurOutK, this.deurOutTarget, 3.5, dt);
    this.doorLeaf.rotation.y = -1.7 * this.deurOpen;
    const k = this.deurOutK; d.group.position.set(lerp(this.deurHome.x + this.deurDir.x * 0.3, this.deurOut.x, k), 0, lerp(this.deurHome.z + this.deurDir.z * 0.3, this.deurOut.z, k));
    d.targetYaw = Math.atan2(this.deurLook.x, this.deurLook.z); d.speed = k > 0.05 && k < 0.95 ? 0.7 : 0; d.update(dt); d.group.visible = this.deurOpen > 0.55 || this.deurOutK > 0.02;
    if (d.arms && this.deurDance) { const b = Math.sin(t * 7); d.arms[0].rotation.z = 0.7 + b * 0.5; d.arms[1].rotation.z = -0.7 - b * 0.5; d.torso.rotation.z = b * 0.12; }
    // poppetjes volgen hun plek
    for (const tk of this.tokens) {
      tk.c.group.position.copy(tk.pos); tk.c.group.position.y = tk.pos.y + tk.y; tk.c.update(dt);
      tk.ring.position.set(tk.pos.x, tk.pos.y + 0.03, tk.pos.z); tk.ring.visible = tk.y < 0.6;
      const hy = tk.c.height * TOKEN_S + 0.7; tk.label.position.set(tk.pos.x, tk.pos.y + tk.y + hy + 0.1, tk.pos.z);
      tk.arrow.position.set(tk.pos.x, tk.pos.y + tk.y + hy + 1.0 + Math.sin(t * 5) * 0.18, tk.pos.z); tk.arrow.rotation.y = t * 2;
      tk.cnt.position.set(tk.pos.x, tk.pos.y + tk.y + hy + 1.0, tk.pos.z);
    }
  }
}

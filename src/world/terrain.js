import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm, noise2, canvasTex, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { WORLD, riverX, BRIDGE, PATHS, ICE, CASTLE, SWAMP, FARM, PASTURE, PLAZA, JOBS } from './layout.js';

const gauss = (dx, dz, s) => Math.exp(-(dx * dx + dz * dz) / (2 * s * s));

export function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm(x * 0.018 + 5, z * 0.018 + 3, 3) * 3.2;
  const vill = 1 - smoothstep(50, 85, r);
  h *= lerp(1, 0.08, vill);
  // omringende bergen
  const m = smoothstep(86, 135, r);
  h += m * (22 + fbm(x * 0.03 + 9, z * 0.03 - 4, 4) * 26 + Math.abs(noise2(x * 0.05, z * 0.05)) * 14);
  // kasteelheuvel (plateau op CASTLE.y)
  const dc = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  const plate = 1 - smoothstep(16, 36, dc);
  h = lerp(h, CASTLE.y + noise2(x * 0.2, z * 0.2) * 0.15, plate);
  // vlakke plekken voor de ijsvijver
  const di = Math.hypot(x - ICE.x, z - ICE.z);
  h = lerp(h, 0, 1 - smoothstep(ICE.r + 2, ICE.r + 14, di));
  // heuvels in de verte
  h += gauss(x - 75, z - 40, 18) * 7 + gauss(x + 70, z + 40, 16) * 6 + gauss(x - 40, z + 70, 16) * 5;
  return h;
}
const BRIDGE_HALF = BRIDGE.len / 2;
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const d = Math.abs(x - riverX(z));
  const carve = 1 - smoothstep(2.5, 8.5, d);
  h = h - carve * 2.8;
  // zwakke moeras-dip in het westen
  h -= gauss(x - SWAMP.x, z - SWAMP.z, 16) * 0.35;
  return h;
}
export const WATER_Y = -0.65;
export function onBridge(x, z) { return Math.abs(z - BRIDGE.z) < BRIDGE.w / 2 + 0.2 && Math.abs(x - BRIDGE.x) < BRIDGE_HALF; }
export function groundY(x, z) {
  if (onBridge(x, z)) return BRIDGE.y;
  return Math.max(heightAt(x, z), WATER_Y - 0.5);
}
export function isWater(x, z) { return !onBridge(x, z) && heightAt(x, z) < WATER_Y + 0.15; }

// ------- geschilderde grondtextuur -------
function paintSplat(N = 2048) {
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const S = N / WORLD; const cx = (x) => (x + WORLD / 2) * S, cz = (z) => (z + WORLD / 2) * S;
  const r = mulberry32(77);
  g.fillStyle = '#69b84a'; g.fillRect(0, 0, N, N);
  // grote kleurvlekken
  for (let i = 0; i < 2600; i++) {
    const x = r() * N, y = r() * N, rad = 30 + r() * 90;
    const pick = r();
    g.fillStyle = pick < 0.4 ? 'rgba(90,170,60,.28)' : pick < 0.7 ? 'rgba(130,200,80,.26)' : pick < 0.9 ? 'rgba(70,140,60,.28)' : 'rgba(190,210,90,.2)';
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  // moeras in het westen (donkerder, modderig)
  const sw = g.createRadialGradient(cx(SWAMP.x), cz(SWAMP.z), 5, cx(SWAMP.x), cz(SWAMP.z), SWAMP.r * S * 1.25);
  sw.addColorStop(0, 'rgba(60,70,40,.95)'); sw.addColorStop(0.7, 'rgba(70,95,50,.7)'); sw.addColorStop(1, 'rgba(70,95,50,0)');
  g.fillStyle = sw; g.fillRect(0, 0, N, N);
  // sneeuw rond de vijver
  const sn = g.createRadialGradient(cx(ICE.x), cz(ICE.z), 5, cx(ICE.x), cz(ICE.z), (ICE.r + 20) * S);
  sn.addColorStop(0, 'rgba(245,250,255,1)'); sn.addColorStop(0.65, 'rgba(240,247,255,.95)'); sn.addColorStop(1, 'rgba(240,247,255,0)');
  g.fillStyle = sn; g.fillRect(0, 0, N, N);
  // akkers boerderij
  g.save(); g.translate(cx(FARM.x), cz(FARM.z + 4)); g.fillStyle = '#8a6a44'; g.fillRect(-14 * S, -9 * S, 28 * S, 20 * S);
  g.strokeStyle = '#6e5233'; g.lineWidth = 3;
  for (let i = -13; i <= 13; i += 1.8) { g.beginPath(); g.moveTo(i * S, -9 * S); g.lineTo(i * S, 11 * S); g.stroke(); }
  g.restore();
  // schapenweide: lichter gras
  const pw = g.createRadialGradient(cx(PASTURE.x), cz(PASTURE.z), 5, cx(PASTURE.x), cz(PASTURE.z), PASTURE.r * S);
  pw.addColorStop(0, 'rgba(150,215,95,.8)'); pw.addColorStop(1, 'rgba(150,215,95,0)'); g.fillStyle = pw; g.fillRect(0, 0, N, N);
  // paden
  const road = (w, col) => {
    g.strokeStyle = col; g.lineWidth = w * S; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const p of PATHS) { g.beginPath(); p.forEach(([x, z], i) => (i ? g.lineTo(cx(x), cz(z)) : g.moveTo(cx(x), cz(z)))); g.stroke(); }
  };
  road(5.2, 'rgba(120,150,70,.55)'); road(4.0, '#a98660'); road(3.2, '#b8956a');
  // kiezels in paden
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const [a, b] = [p[i], p[i + 1]]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k < len * 5; k++) { const t = r(); const ox = (r() - .5) * 3, oz = (r() - .5) * 3; g.fillStyle = r() < .5 ? '#8f7350' : '#c9a97c'; g.fillRect(cx(a[0] + (b[0] - a[0]) * t + ox), cz(a[1] + (b[1] - a[1]) * t + oz), 2 + r() * 4, 2 + r() * 3); }
  }
  // plein: kasseien
  const cob = tex.cobble(1, 1).image;
  g.save(); g.beginPath(); g.arc(cx(PLAZA.x), cz(PLAZA.z), PLAZA.r * S, 0, 7); g.clip();
  const pat = g.createPattern(cob, 'repeat'); g.scale(1, 1); g.fillStyle = pat; g.fillRect(0, 0, N, N); g.restore();
  g.strokeStyle = 'rgba(70,60,50,.8)'; g.lineWidth = 6; g.beginPath(); g.arc(cx(PLAZA.x), cz(PLAZA.z), PLAZA.r * S, 0, 7); g.stroke();
  // kasteelplein + grote cirkels van steen
  g.fillStyle = pat; g.beginPath(); g.arc(cx(0), cz(-63), 7 * S, 0, 7); g.fill();
  g.fillStyle = pat; g.beginPath(); g.ellipse(cx(-2), cz(-48), 13 * S, 9 * S, 0, 0, 7); g.fill();
  // zandkanten langs de rivier
  for (let z = -WORLD / 2; z < WORLD / 2; z += 1.5) { const x = riverX(z); g.fillStyle = 'rgba(226,210,150,.8)'; g.beginPath(); g.ellipse(cx(x), cz(z), 9.5 * S, 3 * S, 0, 0, 7); g.fill(); }
  // grashalmen / speckles
  for (let i = 0; i < 90000; i++) {
    const x = r() * N, y = r() * N; const k = r();
    g.fillStyle = k < 0.35 ? 'rgba(60,130,40,.35)' : k < 0.7 ? 'rgba(150,215,90,.35)' : 'rgba(255,255,255,.08)';
    g.fillRect(x, y, 2 + r() * 3, 2 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.keep = true;
  return t;
}
function detailTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#aaa'; g.fillRect(0, 0, w, h); const r = mulberry32(5);
    for (let i = 0; i < 4000; i++) { const v = 150 + r() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 4); }
  }, { repeat: [1, 1], srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.keep = true; return t;
}

export function buildTerrain() {
  const seg = 150;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const col = new Float32Array(pos.count * 3); const nrm = geo.attributes.normal;
  const rock = new THREE.Color(0x8c8a90), snow = new THREE.Color(0xf4f8ff), grass = new THREE.Color(0xffffff), dark = new THREE.Color(0x5e5a58);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nrm.getY(i);
    tmp.copy(grass);
    const steep = smoothstep(0.85, 0.62, ny);
    const high = smoothstep(10, 22, y);
    tmp.lerp(rock, Math.max(steep, high * 0.8));
    if (y > 24) tmp.lerp(snow, smoothstep(24, 34, y));
    if (y < -0.9) tmp.lerp(dark, 0.5);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const splat = paintSplat(2048), detail = detailTexture();
  const mat = new THREE.MeshStandardMaterial({ map: splat, vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb *= (texture2D(detailMap, vMapUv * 110.0).rgb * 1.45 + 0.05);`);
    sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader;
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
  return mesh;
}

export function buildWater() {
  const t = tex.water(WORLD / 6, WORLD / 6);
  const m = new THREE.MeshStandardMaterial({ map: t, color: 0x9fd6ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, emissive: 0x12304a, emissiveIntensity: 0.4 });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), m); w.rotation.x = -Math.PI / 2; w.position.y = WATER_Y; w.receiveShadow = true;
  w.userData.anim = (t) => { m.map.offset.set(t * 0.012, t * 0.008); };
  return w;
}

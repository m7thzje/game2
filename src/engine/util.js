import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
export function dampAngle(a, b, lambda, dt) { return a + angDiff(a, b) * (1 - Math.exp(-lambda * dt)); }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// ---- value noise (deterministic) ----
const _p = new Uint8Array(512);
{ const r = mulberry32(1337); const b = [...Array(256).keys()]; shuffle(b, r); for (let i = 0; i < 512; i++) _p[i] = b[i & 255]; }
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
export function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const a = _p[X] + Y, b = _p[X + 1] + Y;
  return lerp(lerp(grad(_p[a], x, y), grad(_p[b], x - 1, y), u),
              lerp(grad(_p[a + 1], x, y - 1), grad(_p[b + 1], x - 1, y - 1), u), v);
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}

// ---- materials ----
const _matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
    _matCache.set(key, m);
  }
  return m;
}
export function glow(color, intensity = 1.5) {
  const key = 'glow' + color + intensity;
  let m = _matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5, flatShading: true }); _matCache.set(key, m); }
  return m;
}

export function canvasTex(w, h, draw, { repeat = null, nearest = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  t.anisotropy = 4;
  return t;
}

export function mesh(geo, material, { cast = true, receive = true, pos, rot, scale } = {}) {
  const m = new THREE.Mesh(geo, typeof material === 'number' || typeof material === 'string' ? mat(material) : material);
  m.castShadow = cast; m.receiveShadow = receive;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) { if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(...scale); }
  return m;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        // shared cached materials are fine to dispose; they recreate on next use via cache miss avoidance
        for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData.keep) v.dispose(); }
      }
    }
  });
}

// DOM helper
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') el.className = props[k];
    else if (k === 'html') el.innerHTML = props[k];
    else if (k === 'style' && typeof props[k] === 'object') Object.assign(el.style, props[k]);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else el.setAttribute(k, props[k]);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

import * as THREE from 'three';
import { canvasTex } from './util.js';

const vs = `
attribute float size; attribute vec3 pcolor; attribute float alpha;
varying vec3 vC; varying float vA;
uniform float scale;
void main(){
  vC = pcolor; vA = alpha;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const fs = `
varying vec3 vC; varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d);
  if(r>0.5) discard;
  float a = smoothstep(0.5,0.15,r) * vA;
  gl_FragColor = vec4(vC, a);
}`;

// Zacht-bolletjes-deeltjessysteem. burst(), emit(), update(dt)
export class Particles {
  static ratio = 1;   // pixel ratio van de renderer, voor punt-groottes
  constructor(max = 1500, { additive = false } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.siz = new Float32Array(max);
    this.alp = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.shrink = new Uint8Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { scale: { value: 600 } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
  }
  setViewportHeight(h) { this.mat.uniforms.scale.value = h * 0.9 * Particles.ratio; }
  emit(x, y, z, vx, vy, vz, { life = 1, size = 0.3, color = 0xffffff, gravity = 0, shrink = true } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const c = new THREE.Color(color);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life; this.size0[i] = size; this.siz[i] = size; this.alp[i] = 1;
    this.grav[i] = gravity; this.shrink[i] = shrink ? 1 : 0;
  }
  burst(x, y, z, { count = 12, speed = 3, up = 1, spread = 1, life = 0.8, size = 0.25, color = 0xffffff, colors = null, gravity = 8 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random();
      const sp = speed * (0.4 + Math.random() * 0.8);
      const col = colors ? colors[Math.floor(Math.random() * colors.length)] : color;
      this.emit(x, y, z, Math.cos(a) * sp * spread * (0.3 + e), up * sp * (0.5 + Math.random()), Math.sin(a) * sp * spread * (0.3 + e), { life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color: col, gravity });
    }
  }
  ring(x, y, z, { count = 18, speed = 4, life = 0.5, size = 0.2, color = 0xffffff } = {}) {
    for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2; this.emit(x, y, z, Math.cos(a) * speed, 0.2, Math.sin(a) * speed, { life, size, color, gravity: 0 }); }
  }
  dust(x, y, z, n = 4, color = 0xd8c8a8) {
    for (let i = 0; i < n; i++) this.emit(x + (Math.random() - .5) * .4, y + 0.05, z + (Math.random() - .5) * .4, (Math.random() - .5) * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - .5) * 0.8, { life: 0.5 + Math.random() * 0.3, size: 0.35, color, gravity: -0.5 });
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alp[i] !== 0) { this.alp[i] = 0; this.pos[i * 3 + 1] = -9999; } continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alp[i] = Math.min(1, t * 2.5);
      this.siz[i] = this.shrink[i] ? this.size0[i] * (0.3 + 0.7 * t) : this.size0[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Zwevende tekst (+10, Goed!) als sprite in de 3D-wereld
export class FloatTexts {
  constructor(scene) { this.scene = scene; this.items = []; this.cache = new Map(); }
  _tex(text, color) {
    const key = text + color;
    let t = this.cache.get(key);
    if (!t) {
      t = canvasTex(256, 96, (g, w, h) => {
        g.font = 'bold 64px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 10; g.strokeStyle = 'rgba(30,10,40,.9)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2, w - 10);
        g.fillStyle = color; g.fillText(text, w / 2, h / 2, w - 10);
      });
      this.cache.set(key, t);
    }
    return t;
  }
  add(text, x, y, z, color = '#ffe14a', scale = 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._tex(text, color), transparent: true, depthTest: false }));
    sp.scale.set(2.6 * scale, 0.975 * scale, 1); sp.position.set(x, y, z); sp.renderOrder = 20;
    this.scene.add(sp);
    this.items.push({ sp, t: 0, life: 1.1 });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      it.sp.position.y += dt * 1.6;
      const k = it.t / it.life;
      it.sp.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (it.t >= it.life) { this.scene.remove(it.sp); it.sp.material.dispose(); this.items.splice(i, 1); }
    }
  }
  dispose() { for (const it of this.items) { this.scene.remove(it.sp); it.sp.material.dispose(); } this.items.length = 0; for (const t of this.cache.values()) t.dispose(); }
}

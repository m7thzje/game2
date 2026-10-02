import * as THREE from 'three';
import { mat, glow, mesh, rand, TAU } from '../engine/util.js';
import * as P from '../engine/props.js';
import { groundY } from './terrain.js';
import { coinTrail, CHESTS, DOORKNOBS } from './layout.js';
import { S } from '../save.js';

// Muntjes, kisten en gouden deurknoppen in de wereld
export class Pickups {
  constructor(scene, fx, onCollect) {
    this.scene = scene; this.fx = fx; this.onCollect = onCollect; this.t = 0;
    const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 14); geo.rotateX(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xff9a00, emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.25 });
    this.cap = 320;
    this.im = new THREE.InstancedMesh(geo, m, this.cap); this.im.frustumCulled = false; this.im.castShadow = false; scene.add(this.im);
    this.coins = [];
    for (const c of coinTrail()) if (!S.collected[c.id]) this.coins.push({ id: c.id, x: c.x, z: c.z, y: groundY(c.x, c.z) + 1.0, v: c.v, ph: rand(0, 6), st: true });
    this.chests = CHESTS.map((c) => {
      const g = P.chest(S.collected[c.id]); g.position.set(c.x, groundY(c.x, c.z), c.z); g.rotation.y = rand(0, 6); scene.add(g);
      return { ...c, g, open: !!S.collected[c.id], t: 0 };
    });
    this.knobs = DOORKNOBS.map((k) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.2 }), { cast: false, pos: [0, 0.9, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12), mat(0xffd23f, { metalness: 0.8 }), { cast: false, pos: [0, 0.55, 0], rot: [0, 0, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8), mat(0xffd23f, { metalness: 0.8 }), { cast: false, pos: [0, 0.7, 0] }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, map: haloTex() })); halo.scale.set(3.4, 3.4, 1); halo.position.y = 0.9; g.add(halo); g.userData.halo = halo;
      g.position.set(k.x, groundY(k.x, k.z), k.z); g.visible = !S.collected[k.id]; scene.add(g);
      return { ...k, g, got: !!S.collected[k.id] };
    });
    this.D = new THREE.Object3D(); this.tmpq = 0;
  }
  drop(x, z, total, pieces = 6, y0 = 1.2) {
    const per = Math.max(1, Math.round(total / pieces));
    for (let i = 0; i < pieces && this.coins.length < this.cap - 5; i++) {
      const a = Math.random() * TAU, d = 1 + Math.random() * 2.5;
      this.coins.push({ id: null, x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: groundY(x, z) + y0, v: per, ph: rand(0, 6), st: false, vy: 5 + Math.random() * 3, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, born: this.t, life: 90, bounce: true, gx: groundY(x, z) + 1.0 });
    }
  }
  update(dt, players, focus) {
    this.t += dt; const t = this.t;
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c.st) {
        c.life -= dt; if (c.life <= 0) { this.coins.splice(i, 1); continue; }
        if (c.bounce) { c.vy -= 20 * dt; c.y += c.vy * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= 0.97; c.vz *= 0.97; const gy = groundY(c.x, c.z) + 1.0; if (c.y < gy) { c.y = gy; c.vy = Math.abs(c.vy) * 0.45; if (c.vy < 1) { c.bounce = false; c.gy = gy; } } }
      }
      // opgepakt?
      let hit = null;
      for (const p of players) { if (Math.hypot(p.x - c.x, p.z - c.z) < 1.6 && Math.abs((p.y + 1) - c.y) < 2.4 && (c.st || t - (c.born || 0) > 0.4)) { hit = p; break; } }
      if (hit) {
        if (c.id) S.collected[c.id] = true;
        this.fx.burst(c.x, c.y, c.z, { count: 7, colors: [0xffe14a, 0xffffff, 0xffa500], speed: 2.5, size: 0.2, life: 0.6 });
        this.onCollect('coin', c.v, c.x, c.y, c.z, hit); this.coins.splice(i, 1); continue;
      }
      const near = Math.hypot(c.x - focus.x, c.z - focus.z) < 90;
      if (!near) continue;
      const bob = c.bounce ? 0 : Math.sin(t * 3 + c.ph) * 0.12;
      this.D.position.set(c.x, c.y + bob, c.z); this.D.rotation.set(0, t * 2.5 + c.ph, 0); this.D.scale.setScalar(c.v > 2 ? 1.3 : 1); this.D.updateMatrix(); this.im.setMatrixAt(n++, this.D.matrix);
    }
    this.im.count = n; this.im.instanceMatrix.needsUpdate = true;
    for (const ch of this.chests) {
      if (ch.open) { ch.g.userData.lid.rotation.x = Math.max(ch.g.userData.lid.rotation.x - dt * 5, -1.8); continue; }
      for (const p of players) if (Math.hypot(p.x - ch.x, p.z - ch.z) < 2.2) {
        ch.open = true; S.collected[ch.id] = true;
        this.fx.burst(ch.x, groundY(ch.x, ch.z) + 1, ch.z, { count: 30, colors: [0xffe14a, 0xffffff, 0xffa500, 0xff7ad5], speed: 5, size: 0.3, life: 1 });
        this.drop(ch.x, ch.z, ch.v, 8, 1.5); this.onCollect('chest', ch.v, ch.x, 1, ch.z, p);
      }
    }
    for (const k of this.knobs) {
      if (k.got) continue;
      k.g.rotation.y += dt * 1.6; k.g.userData.halo.material.opacity = 0.4 + Math.sin(t * 3 + k.x) * 0.2;
      k.g.children[0].position.y = 0.9 + Math.sin(t * 2 + k.x) * 0.12;
      if (Math.random() < 0.25 && Math.hypot(k.x - focus.x, k.z - focus.z) < 60) this.fx.emit(k.x + rand(-.5, .5), groundY(k.x, k.z) + rand(0.4, 1.6), k.z + rand(-.5, .5), 0, 0.5, 0, { life: 1, size: 0.2, color: 0xffe14a, gravity: -0.2 });
      for (const p of players) if (Math.hypot(p.x - k.x, p.z - k.z) < 1.9) {
        k.got = true; k.g.visible = false; S.collected[k.id] = true;
        this.fx.burst(k.x, groundY(k.x, k.z) + 1, k.z, { count: 40, colors: [0xffd23f, 0xffffff, 0xff9a00], speed: 6, size: 0.35, life: 1.2 });
        this.onCollect('knob', 1, k.x, 1, k.z, p);
      }
    }
  }
  knobsFound() { return this.knobs.filter((k) => k.got).length; }
}
let _halo = null;
function haloTex() {
  if (_halo) return _halo; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,240,150,1)'); gr.addColorStop(1, 'rgba(255,200,50,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _halo = new THREE.CanvasTexture(c); _halo.userData.keep = true; return _halo;
}

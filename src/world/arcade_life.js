// Leven in de speelhal: wandelend publiek (instanced, goedkoop), dieren, ballonnen, confetti-kanonnen, pulserende lampjes,
// middenplein-animaties (fontein / lichtshow-dansvloer / draaimolen) en kleine verborgen easter eggs.
import * as THREE from 'three';
import { Animal, Slime } from '../engine/chars.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { Deco } from './arcade_deco.js';
import { clamp, damp, dampAngle, rand, pick, TAU, lerp, canvasTex } from '../engine/util.js';

const SKIN = [0xf4c9a0, 0xe2b08a, 0xc98e63, 0x8d5a3a, 0xf7d2ae, 0xffe0c0];
const SHIRT = [0xd8372c, 0x2f6fe0, 0xffd23f, 0x2fae5b, 0xb05aff, 0xff7ab0, 0xff8a1c, 0x00b8d4, 0xf6f0e0, 0x7bff7b];
const PANTS = [0x3d4a73, 0x5b4636, 0x2a2a38, 0x4a6a9a, 0x6a3a5a, 0x2f7a5a];
const HAIR = [0x2a1a10, 0x7a4a24, 0xe8b84a, 0xcfcfcf, 0x111111, 0xc0392b];
const CONF = [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b, 0xff8a1c, 0xb05aff, 0xffffff];
const COUNT = [9, 11, 10];

const _B = new THREE.Matrix4(), _L = new THREE.Matrix4(), _M = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class ArcadeLife {
  constructor(a) {
    this.a = a; this.t = 0; this.hall = a.hallId; this.partyT = 0; this.cannonT = rand(6, 10); this.signT = 0; this.ledT = 0; this.frame = 0; this.mood = 0;
    this.W = a.W; this.Dp = a.Dp; this.sc = a.scene; this.low = S.settings.quality === 'low';
    this.collectPulse(); this.buildPools(); this.buildCannons(); this.buildBalloons(); this.buildCrowd(); this.buildCritters(); this.buildEggs();
    this.fountT = 0; this.waterMat = a.waterMat;
  }
  // ------------------------------------------------------------ pulserende lampjes (p0..p2 in de Deco's)
  collectPulse() {
    this.pm = [[], [], []];
    const add = (o) => { if (!o) return; for (const k of [0, 1, 2]) if (o['p' + k]) this.pm[k].push(o['p' + k].material); };
    add(this.a.deco); add(this.a.carouselDeco);
  }
  // ------------------------------------------------------------ discolichtvlekken op de vloer (volgen de gekleurde lichten, ook op 'low')
  buildPools() {
    const t = canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    this.pools = this.a.theme.lights.map((c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: t, color: c, transparent: true, opacity: this.hall === 1 ? 0.3 : 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = 0.1; m.renderOrder = 2; this.sc.add(m); return m; });
  }
  // ------------------------------------------------------------ confetti-kanonnen
  buildCannons() {
    this.cannons = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group(); const x = sx * (this.W / 2 - 1.7), z = 7;
      const R = new Deco(); R.cyl(0.5, 0.75, 2.4, 10, 0, 1.2 + 0.0, 0, 0xd8372c, { rx: 0 }); R.cyl(0.7, 0.55, 0.3, 10, 0, 2.45, 0, 0xffd23f, { kind: 'metal' }); R.cyl(0.62, 0.62, 0.5, 8, -0.7, 0.55, 0.0, 0x222233, { rz: Math.PI / 2 }); R.cyl(0.62, 0.62, 0.5, 8, 0.7, 0.55, 0.0, 0x222233, { rz: Math.PI / 2 }); R.box(1.6, 0.4, 1.4, 0, 0.5, 0, 0x7a4a24);
      for (let i = 0; i < 6; i++) R.sph(0.12, Math.cos(i * 1.05) * 0.55, 1.2 + i * 0.1, Math.sin(i * 1.05) * 0.55, CONF[i], null, 5);
      R.build(g);
      // loop: kantel richting het midden van de hal
      g.position.set(x, 0, z); const bar = new THREE.Group(); g.children.slice().forEach((c) => { g.remove(c); bar.add(c); }); bar.position.y = 0; g.add(bar); bar.rotation.z = sx * 0.9;   // 52 graden omhoog richting midden
      this.sc.add(g); this.cannons.push({ g, bar, x, z, sx, kick: 0 });
    }
  }
  fire(i, count = 55) {
    const c = this.cannons[i]; if (!c) return; const fx = this.a.fx; c.kick = 1;
    const ax = -c.sx * Math.sin(0.9), ay = Math.cos(0.9);   // looprichting
    const bx = c.x - c.sx * 0.9 * 1.0, by = 2.6, bz = c.z;
    for (let k = 0; k < count; k++) { const sp = rand(9, 17), sd = rand(-0.18, 0.18), el = rand(-0.2, 0.2); fx.emit(bx + ax * 1.0, by + ay * 1.0, bz, (ax + sd) * sp, (ay + el) * sp, rand(-4, 4), { life: rand(1.6, 2.6), size: rand(0.25, 0.5), color: pick(CONF), gravity: 7, shrink: false }); }
    for (let k = 0; k < 10; k++) fx.emit(bx + ax, by + ay, bz, ax * rand(2, 5), ay * rand(2, 5), rand(-1, 1), { life: 0.7, size: 0.7, color: 0xe8e8f0, gravity: -0.5 });
    audio.sfx('pop', { vol: 0.5 }); audio.sfx('whoosh', { vol: 0.25 });
  }
  party(seconds = 8, withCannons = true) {
    this.partyT = Math.max(this.partyT, seconds);
    if (withCannons) { this.fire(0, 70); setTimeout(() => this.fire(1, 70), 250); setTimeout(() => { this.fire(0, 40); this.fire(1, 40); }, 900); }
    for (const v of this.vis || []) if (v.state !== 'scared') { v.cheerT = rand(2, 4); }
  }
  cheer() { for (const v of this.vis || []) if (v.state !== 'scared') v.cheerT = rand(1.5, 3.2); this.fire(Math.random() < 0.5 ? 0 : 1, 40); }
  // ------------------------------------------------------------ ballonnen + touwtjes
  buildBalloons() {
    const a = this.a; const anchors = [];
    for (const z of a.zones) { const sx = Math.sign(z.cx); anchors.push([z.cx + sx * z.R * 0.78, z.cz + z.R * 0.52], [z.cx - sx * z.R * 0.7, z.cz + z.R * 0.62]); }
    anchors.push([-7.4, 11.5], [7.4, 11.5], [-9.6, -9], [9.6, -9]);
    const per = 4; const n = anchors.length * per; this.bal = [];
    const geo = new THREE.SphereGeometry(0.42, 8, 6); const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, emissive: 0x333333, flatShading: false }), n); im.frustumCulled = false; im.castShadow = false;
    const lineGeo = new THREE.BufferGeometry(); const lp = new Float32Array(n * 6); lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    const cols = [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b, 0xff8a1c, 0xb05aff, 0xff4a4a];
    let k = 0; anchors.forEach(([ax, az], ai) => { for (let i = 0; i < per; i++) { const c = cols[(ai * 3 + i) % cols.length]; im.setColorAt(k, _c.set(c)); this.bal.push({ ax, az, dx: rand(-0.7, 0.7), dz: rand(-0.7, 0.7), h: rand(5.2, 8.2), ph: rand(0, 6.3), k }); k++; } });
    im.instanceColor.needsUpdate = true; this.sc.add(im); this.balMesh = im; this.balLine = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xf6f0e0, transparent: true, opacity: 0.7 })); this.balLine.frustumCulled = false; this.sc.add(this.balLine);
  }
  updBalloons(t) {
    const im = this.balMesh, lp = this.balLine.geometry.attributes.position;
    for (const b of this.bal) {
      const x = b.ax + b.dx + Math.sin(t * 0.7 + b.ph) * 0.35, y = b.h + Math.sin(t * 1.3 + b.ph) * 0.3, z = b.az + b.dz + Math.cos(t * 0.6 + b.ph) * 0.35;
      _q.identity(); _l_set(_M, x, y, z, 1, 1.22, 1); im.setMatrixAt(b.k, _M);
      lp.setXYZ(b.k * 2, b.ax, 0.05, b.az); lp.setXYZ(b.k * 2 + 1, x, y - 0.5, z);
    }
    im.instanceMatrix.needsUpdate = true; lp.needsUpdate = true;
  }
  // ------------------------------------------------------------ publiek
  buildCrowd() {
    const a = this.a; const n = COUNT[this.hall]; this.vis = [];
    const mk = (geo, cnt) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), Math.max(1, cnt)); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = !this.low; this.sc.add(im); im.count = cnt; return im; };
    const tr = (g, x, y, z) => { g.translate(x, y, z); return g; };
    for (let i = 0; i < n; i++) {
      const kid = i % 4 === 3; this.vis.push({ x: 0, z: 0, yaw: rand(0, TAU), state: 'walk', timer: 0, ph: rand(0, 6), sp: 0, s: kid ? rand(0.68, 0.8) : rand(0.95, 1.18), skin: pick(SKIN), shirt: pick(SHIRT), pants: pick(PANTS), hair: pick(HAIR), hat: i % 3 === 0 ? 1 + (i / 3 | 0) % 3 : 0, hatCol: pick(SHIRT), cab: null, tx: 0, tz: 0, stuck: 0, lastD: 1e9, cheerT: 0, walkSp: kid ? rand(3.0, 3.8) : rand(2.1, 3.0), look: 0 });
    }
    this.vis.forEach((v) => { for (let tries = 0; tries < 30; tries++) { v.x = rand(-this.W / 2 + 3, this.W / 2 - 3); v.z = rand(-this.Dp / 2 + 8, this.Dp / 2 - 4); if (this.free(v.x, v.z, 1.2)) break; } this.pickGoal(v); v.timer = rand(0, 3); });
    const hats = [0, 0, 0, 0]; this.vis.forEach((v) => { v.hi = hats[v.hat]++; });
    this.parts = {
      legs: mk(tr(new THREE.CylinderGeometry(0.1, 0.085, 0.55, 6), 0, -0.275, 0), n * 2), torso: mk(tr(new THREE.CylinderGeometry(0.27, 0.3, 0.62, 8), 0, 0.31, 0), n),
      arms: mk(tr(new THREE.CapsuleGeometry(0.075, 0.3, 2, 6), 0, -0.2, 0), n * 2), head: mk(new THREE.SphereGeometry(0.3, 10, 8), n),
      eyes: mk(new THREE.SphereGeometry(0.05, 5, 4), n * 2), hair: mk(new THREE.SphereGeometry(0.315, 8, 5, 0, TAU, 0, 1.7), n),
      hat1: mk(tr(new THREE.ConeGeometry(0.2, 0.5, 8), 0, 0.25, 0), hats[1]), hat2: mk(new THREE.SphereGeometry(0.33, 8, 5, 0, TAU, 0, 1.45), hats[2]), hat3: mk(tr(new THREE.CylinderGeometry(0.2, 0.22, 0.42, 8), 0, 0.21, 0), hats[3]),
    };
    for (const k of ['legs', 'arms', 'torso', 'head', 'eyes', 'hair']) this.parts[k].count = k === 'legs' || k === 'arms' || k === 'eyes' ? n * 2 : n;
    for (const k of ['hat1', 'hat2', 'hat3']) this.parts[k].visible = this.parts[k].count > 0;
    this.vis.forEach((v, i) => {
      const P = this.parts; P.legs.setColorAt(i * 2, _c.set(v.pants)); P.legs.setColorAt(i * 2 + 1, _c.set(v.pants)); P.torso.setColorAt(i, _c.set(v.shirt)); P.arms.setColorAt(i * 2, _c.set(v.shirt)); P.arms.setColorAt(i * 2 + 1, _c.set(v.shirt));
      P.head.setColorAt(i, _c.set(v.skin)); P.eyes.setColorAt(i * 2, _c.set(0x15121a)); P.eyes.setColorAt(i * 2 + 1, _c.set(0x15121a)); P.hair.setColorAt(i, _c.set(v.hat === 2 ? v.hatCol : v.hair));
      if (v.hat) P['hat' + v.hat].setColorAt(v.hi, _c.set(v.hatCol));
    });
    for (const k in this.parts) if (this.parts[k].instanceColor) this.parts[k].instanceColor.needsUpdate = true;
  }
  free(x, z, r = 0.6) { for (const c of this.a.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false; return true; }
  pickGoal(v) {
    const a = this.a; const r = Math.random(); v.cab && (v.cab.occ = null); v.cab = null; v.mode = 'hang'; v.look = 0;
    if (r < 0.58 && a.cabs.length) {
      const free = a.cabs.filter((c) => !c.occ); const c = free.length ? pick(free) : pick(a.cabs); const fx = c.ix - c.x, fz = c.iz - c.z, d = Math.hypot(fx, fz) || 1;
      if (!c.occ) { c.occ = v; v.cab = c; v.mode = 'play'; v.tx = c.x + fx / d * (d - 1.5) + rand(-0.3, 0.3); v.tz = c.z + fz / d * (d - 1.5) + rand(-0.3, 0.3); }
      else { v.mode = 'watch'; const side = Math.random() < 0.5 ? -1 : 1; v.tx = c.ix + (fz / d) * side * 1.8 + fx / d * 0.8; v.tz = c.iz - (fx / d) * side * 1.8 + fz / d * 0.8; v.cab = null; v.look = c; }
    } else if (r < 0.86) {
      const a2 = rand(0, TAU); const R = [7.7, 0, 6.6][this.hall];
      if (this.hall === 1) { v.mode = 'dance'; v.tx = rand(-7, 7); v.tz = a.centerZ + rand(-7, 7); if (Math.hypot(v.tx, v.tz - a.centerZ) < 4.4) { v.tx *= 1.8; v.tz = a.centerZ + (v.tz - a.centerZ) * 1.8; } }
      else { v.tx = Math.cos(a2) * R; v.tz = a.centerZ + Math.sin(a2) * R; }
    } else { const z = pick(a.zones); v.tx = z.cx + rand(-6, 6); v.tz = z.cz + rand(-1, 6); }
    v.tx = clamp(v.tx, -this.W / 2 + 2, this.W / 2 - 2); v.tz = clamp(v.tz, -this.Dp / 2 + 5, this.Dp / 2 - 2.5); v.state = 'walk'; v.stuck = 0; v.lastD = 1e9;
  }
  updCrowd(dt, t) {
    const a = this.a; const P = this.parts; const scared = this.mood > 0.35; const k = this.mood;
    this.vis.forEach((v, i) => {
      let pose = 'idle', speedN = 0;
      if (scared) {   // de Deurman is er: iedereen verstijft en kijkt naar de deur
        v.state = 'scared'; v.yaw = dampAngle(v.yaw, Math.atan2(-v.x, -6 - v.z), 6, dt); pose = 'scared';
      } else {
        if (v.state === 'scared') this.pickGoal(v);
        if (v.cheerT > 0) { v.cheerT -= dt; pose = 'cheer'; }
        else if (this.partyT > 0) pose = 'dance';
        else if (v.state === 'walk') {
          const dx = v.tx - v.x, dz = v.tz - v.z, d = Math.hypot(dx, dz);
          if (d < 0.5) { v.state = v.mode; v.timer = v.mode === 'play' ? rand(7, 15) : v.mode === 'dance' ? rand(7, 13) : rand(3, 7); v.look = v.look || 0; }
          else {
            const sp = v.walkSp; v.sp = damp(v.sp, 1, 6, dt); const tyaw = Math.atan2(dx, dz); v.yaw = dampAngle(v.yaw, tyaw, 9, dt);
            v.x += Math.sin(v.yaw) * sp * v.sp * dt; v.z += Math.cos(v.yaw) * sp * v.sp * dt; speedN = Math.min(1, sp / 3.2); pose = 'walk';
            v.stuck += dt; if (d < v.lastD - 0.4) { v.lastD = d; v.stuck = 0; } if (v.stuck > 3.5) this.pickGoal(v);
          }
        } else {
          v.sp = damp(v.sp, 0, 10, dt); v.timer -= dt; pose = v.state === 'dance' ? 'dance' : v.state === 'play' ? 'play' : 'idle';
          if (v.state === 'play' && v.cab) v.yaw = dampAngle(v.yaw, Math.atan2(v.cab.x - v.x, v.cab.z - v.z), 8, dt);
          else if (v.look && v.look.x != null) v.yaw = dampAngle(v.yaw, Math.atan2(v.look.x - v.x, v.look.z - v.z), 6, dt);
          if (v.timer <= 0) { if (v.state === 'play' && Math.random() < 0.45) v.cheerT = rand(1.5, 2.6); this.pickGoal(v); }
        }
      }
      // colliders: wegduwen (zoals de spelers)
      for (const c of a.colliders) { const dx = v.x - c.x, dz = v.z - c.z, d = Math.hypot(dx, dz), m = c.r + 0.45; if (d < m && d > 1e-4) { v.x = c.x + dx / d * m; v.z = c.z + dz / d * m; } }
      v.x = clamp(v.x, -this.W / 2 + 1.2, this.W / 2 - 1.2); v.z = clamp(v.z, -this.Dp / 2 + 5.0, this.Dp / 2 - 1.5);
      // pose -> lichaamsdelen
      v.ph += dt * (5 + speedN * 9) * (pose === 'walk' ? 1 : 0.4);
      const sw = Math.sin(v.ph) * 0.9 * (pose === 'walk' ? speedN : 0); let alx = -sw * 0.9, arx = sw * 0.9, alz = 0.08, arz = -0.08, bob = Math.abs(Math.sin(v.ph)) * 0.07 * (pose === 'walk' ? speedN : 0), lean = pose === 'walk' ? 0.1 : 0, lx = sw, rx = -sw, tilt = 0;
      const tt = t * 8 + v.ph;
      if (pose === 'cheer') { alx = -2.9 + Math.sin(t * 14 + i) * 0.4; arx = -2.9 - Math.sin(t * 14 + i) * 0.4; alz = 0.3; arz = -0.3; bob = Math.abs(Math.sin(t * 7 + i)) * 0.2; }
      else if (pose === 'dance') { const b = Math.sin(tt); alx = -2.2 + b; arx = -2.2 - b; alz = 0.5; arz = -0.5; lx = b * 0.5; rx = -b * 0.5; bob = Math.abs(b) * 0.12; tilt = b * 0.12; }
      else if (pose === 'play') { alx = -1.3 + Math.sin(t * 9 + i) * 0.15; arx = -1.3 + Math.cos(t * 7 + i * 2) * 0.15; lean = 0.18; bob = Math.abs(Math.sin(t * 5 + i)) * 0.015; }
      else if (pose === 'scared') { alx = -1.9; arx = -1.9; alz = 0.5; arz = -0.5; bob = Math.sin(t * 40 + i) * 0.015; }
      else { alx = Math.sin(t * 1.3 + i) * 0.05; arx = -alx; }
      const s = v.s; _e.set(0, v.yaw, 0); _q.setFromEuler(_e); _B.compose(_p.set(v.x, bob * s, v.z), _q, _s.set(s, s, s));
      const part = (im, idx, lx2, ly, lz, rx2, ry, rz) => { _e.set(rx2, ry, rz); _q.setFromEuler(_e); _L.compose(_p.set(lx2, ly, lz), _q, _s.set(1, 1, 1)); _M.multiplyMatrices(_B, _L); im.setMatrixAt(idx, _M); };
      part(P.legs, i * 2, 0.15, 0.6, 0, lx, 0, 0); part(P.legs, i * 2 + 1, -0.15, 0.6, 0, rx, 0, 0);
      part(P.torso, i, 0, 0.6, 0, lean, 0, tilt);
      part(P.arms, i * 2, 0.34, 1.12, 0, alx, 0, alz); part(P.arms, i * 2 + 1, -0.34, 1.12, 0, arx, 0, arz);
      part(P.head, i, 0, 1.52, 0, pose === 'cheer' ? -0.15 : 0, 0, 0);
      part(P.eyes, i * 2, 0.105, 1.6, 0.27, 0, 0, 0); part(P.eyes, i * 2 + 1, -0.105, 1.6, 0.27, 0, 0, 0);
      if (v.hat === 2) part(P.hat2, v.hi, 0, 1.55, 0, -0.1, 0, 0); else part(P.hair, i, 0, 1.55, -0.01, -0.25, 0, 0);
      if (v.hat === 1) part(P.hat1, v.hi, 0, 1.78, 0, -0.12, 0, 0); else if (v.hat === 3) part(P.hat3, v.hi, 0, 1.8, 0, 0, 0, 0);
    });
    for (const key in P) P[key].instanceMatrix.needsUpdate = true;
    // het haar van mensen met een pet verdwijnt achter de pet: haar-instantie buiten beeld
    this.vis.forEach((v, i) => { if (v.hat === 2) { _M.makeScale(0.0001, 0.0001, 0.0001); P.hair.setMatrixAt(i, _M); } });
  }
  // ------------------------------------------------------------ dieren
  buildCritters() {
    this.crit = []; const a = this.a; const h = this.hall;
    const spots = () => { for (let i = 0; i < 40; i++) { const x = rand(-this.W / 2 + 3, this.W / 2 - 3), z = rand(-this.Dp / 2 + 8, this.Dp / 2 - 3); if (this.free(x, z, 1.0)) return [x, z]; } return [0, 12]; };
    const add = (obj, kind) => { const [x, z] = spots(); obj.group.position.set(x, 0, z); this.sc.add(obj.group); const o = { obj, kind, x, z, tx: x, tz: z, pause: rand(0, 2), yaw: rand(0, TAU), hop: 0 }; this.crit.push(o); return o; };
    if (h === 1) { add(new Slime(0x39ffb0, 0.9), 'slime'); add(new Slime(0xff2bd6, 0.7), 'slime'); }
    else { add(new Animal('chicken'), 'chicken'); add(new Animal('chicken'), 'chicken'); }
    if (h === 2) this.chickenEgg = this.crit[0];
  }
  updCritters(dt, t) {
    const a = this.a; const scared = this.mood > 0.35;
    for (const c of this.crit) {
      const o = c.obj;
      if (c.kind === 'slime') {
        c.hop += dt * (scared ? 0 : 1); const ph = c.hop * 1.6; const moving = c.pause <= 0;
        if (c.pause > 0) { c.pause -= dt; if (c.pause <= 0) { const [x, z] = this.pick2(); c.tx = x; c.tz = z; } }
        else { const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz); if (d < 0.6) { c.pause = rand(1.2, 3.5); } else { const hopk = Math.max(0, Math.sin(ph * TAU * 0.5)); c.x += dx / d * 3.2 * hopk * dt; c.z += dz / d * 3.2 * hopk * dt; } }
        o.group.position.set(c.x, Math.abs(Math.sin(ph * TAU * 0.25)) * (moving ? 0.55 : 0.08), c.z); o.update(dt, moving ? 1.6 : 0.8);
      } else {
        const sc = scared ? 0 : 1; o.speed = 0;
        if (c.pause > 0) { c.pause -= dt * sc; if (c.pause <= 0) { const [x, z] = this.pick2(); c.tx = x; c.tz = z; } }
        else { const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz); if (d < 0.5) c.pause = rand(2, 5); else if (sc) { const sp = c.flap > 0 ? 3.4 : 1.5; c.x += dx / d * sp * dt; c.z += dz / d * sp * dt; o.targetYaw = Math.atan2(dx, dz); o.speed = 1; } }
        if (c.flap > 0) { c.flap -= dt; o.speed = 1; }
        for (const k of a.colliders) { const dx = c.x - k.x, dz = c.z - k.z, d = Math.hypot(dx, dz), m = k.r + 0.4; if (d < m && d > 1e-4) { c.x = k.x + dx / d * m; c.z = k.z + dz / d * m; } }
        c.x = clamp(c.x, -this.W / 2 + 1, this.W / 2 - 1); c.z = clamp(c.z, -this.Dp / 2 + 5, this.Dp / 2 - 1.5);
        o.update(dt); o.group.position.x = c.x; o.group.position.z = c.z; if (c.hopY) { c.hopY = Math.max(0, c.hopY - dt * 6); o.group.position.y += Math.sin((1 - c.hopY) * Math.PI) * 0.8; }
      }
    }
    if (this.chickenEgg && this.chickenEggIt) { this.chickenEggIt.x = this.chickenEgg.x; this.chickenEggIt.z = this.chickenEgg.z; }
  }
  pick2() { for (let i = 0; i < 30; i++) { const x = rand(-this.W / 2 + 3, this.W / 2 - 3), z = rand(-this.Dp / 2 + 8, this.Dp / 2 - 3); if (this.free(x, z, 1.0)) return [x, z]; } return [0, 12]; }
  // ------------------------------------------------------------ easter eggs
  buildEggs() {
    const a = this.a; const D = new Deco(); const h = this.hall; this.egg = {};
    const hidden = [{ x: -22.5, z: -10.8 }, { x: 24.9, z: -19.1 }, { x: -4.8, z: -19.0 }][h];   // het muntje achter een kast / speaker / kraam
    this.coin = new THREE.Group(); const R = new Deco(); R.cyl(0.4, 0.4, 0.09, 14, 0, 0, 0, 0xffd23f, { kind: 'metal', rx: Math.PI / 2 }); R.cyl(0.28, 0.28, 0.11, 12, 0, 0, 0, 0xfff0a0, { kind: 'metal', rx: Math.PI / 2 }); R.build(this.coin);
    this.coin.position.set(hidden.x, 0.8, hidden.z); this.sc.add(this.coin); this.coinPos = hidden;
    a.interact.push({ type: 'egg', egg: 'munt', x: hidden.x, z: hidden.z, r: 2.1, label: 'Het glimmende muntje oppakken' });
    if (h === 1) {   // DJ-knop naast de booth
      D.cyl(0.35, 0.45, 1.0, 8, -4.9, 0.5, -a.Dp / 2 + 5.6, 0x333344, { kind: 'metal' }); D.cyl(0.3, 0.3, 0.16, 10, -4.9, 1.05, -a.Dp / 2 + 5.6, 0x7bff00, { kind: 'p0' }); D.box(0.7, 0.3, 0.05, -4.9, 1.4, -a.Dp / 2 + 5.2, 0xffffff, { rx: -0.6 });
      a.colliders.push({ x: -4.9, z: -a.Dp / 2 + 5.6, r: 0.5 });
      a.interact.push({ type: 'egg', egg: 'party', x: -4.9, z: -a.Dp / 2 + 7.0, r: 2.2, label: 'De geheime DJ-knop indrukken' });
    }
    if (h === 2) { this.chickenEggIt = { type: 'egg', egg: 'kip', x: 0, z: 0, r: 2.0, label: 'De kip aaien' }; a.interact.push(this.chickenEggIt); }
    const o = D.build(this.sc); for (const k of [0, 1, 2]) if (o['p' + k]) this.pm[k].push(o['p' + k].material);
  }
  reward(key, n, text) {
    const k = 'egg_' + this.hall + '_' + key; if (S.flags[k]) return false; S.flags[k] = true; S.coins += n; S.totalEarned += n; persist(); ui.hud.toast(`${text} +${n} heitjes!`, 3200); audio.sfx('coin'); this.a.refreshHud && this.a.refreshHud(); return true;
  }
  doEgg(it) {
    const a = this.a; const h = this.hall;
    if (it.egg === 'munt') {
      this.coin.visible = false; a.fx.burst(this.coinPos.x, 1.2, this.coinPos.z, { count: 24, colors: [0xffd23f, 0xfff0a0], speed: 5, size: 0.3, life: 0.9 });
      if (!this.reward('munt', 5, 'Een muntje achter de kast! Daar zat hij dus.')) { ui.hud.toast('Het muntje is weer terug. Het komt altijd terug.', 2600); audio.sfx('coin'); }
      setTimeout(() => { this.coin.visible = true; }, 9000);
    } else if (it.egg === 'knop') {
      this.party(9); if (!this.reward('knop', 5, 'Je drukte op de rode knop. Er gebeurde iets. Iets leuks!')) ui.hud.toast('Je drukte weer op de knop. Confetti! Dat blijft leuk.', 2600);
      if (a.king) a.king.pose = 'wave';
    } else if (it.egg === 'gong') {
      audio.sfx('bell'); audio.sfx('thud'); a.camShake = 0.35; a.fx.burst(it.x, 3, it.z, { count: 30, colors: [0xffd23f, 0xffe14a, 0xffffff], speed: 6, size: 0.35, life: 1.0 }); this.cheer();
      if (!this.reward('gong', 5, 'BONG! Ronde één... vechten maar.')) ui.hud.toast('BONG! Het publiek schrikt zich een hoedje.', 2200);
    } else if (it.egg === 'party') {
      this.party(14); a.king.pose = 'wave'; audio.sfx('powerup'); if (!this.reward('party', 5, 'De geheime DJ-knop! Disco-feest voor iedereen.')) ui.hud.toast('DISCO-FEEST! De DJ doet alsof hij dit niet gepland had.', 2600);
    } else if (it.egg === 'kip') {
      const c = this.chickenEgg; c.flap = 2.5; c.hopY = 1; c.pause = 0; const [x, z] = this.pick2(); c.tx = x; c.tz = z; audio.sfx('boing'); a.fx.burst(c.x, 1.2, c.z, { count: 14, colors: [0xffffff, 0xf8f4ea], speed: 3, size: 0.25, life: 0.9, gravity: 4 });
      this.pets = (this.pets || 0) + 1;
      if (this.pets >= 3 && this.reward('kip', 5, 'KO-KOT! De kip legde een gouden ei.')) { a.fx.burst(c.x, 1.0, c.z, { count: 30, colors: [0xffd23f, 0xfff0a0], speed: 5, size: 0.35, life: 1.2 }); this.pets = 0; }
      else ui.hud.toast(pick(['Kok kok!', 'De kip is niet gewend aan aandacht.', 'Kip-kip-kip... ze rent weg.', 'Dit is een kip met kapsones.']), 1800);
    }
  }
  // ------------------------------------------------------------ frame
  update(dt) {
    this.t += dt; const t = this.t, a = this.a; this.frame++;
    this.mood = a.deur ? a.deur.k : 0; const k = this.mood; this.partyT = Math.max(0, this.partyT - dt);
    // lampjes in drie fasen (klokvormig), rood/donker bij de Deurman
    const party = this.partyT > 0 ? 2.5 : 1;
    for (let i = 0; i < 3; i++) { const b = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * 3.2 * party - i * 2.1)); const fl = k > 0.3 ? (Math.sin(t * 31 + i) * Math.sin(t * 17) > 0.55 ? 0.1 : 1) : 1; for (const m of this.pm[i]) m.color.setRGB(b * fl, b * fl * (1 - 0.8 * k), b * fl * (1 - 0.8 * k)); }
    this.pools.forEach((m, i) => { const an = t * 0.7 + i * TAU / 3; m.position.x = Math.cos(an) * 12; m.position.z = 2 + Math.sin(an) * 8; m.material.opacity = (this.hall === 1 ? 0.3 : 0.4) * (1 - k) * (this.partyT > 0 ? 1.5 : 1); });
    // schermen flikkeren zachtjes (sneller en feller als een bezoeker speelt)
    a.cabs.forEach((c, i) => { const m = c.scr.material, b = c.occ ? 0.92 + 0.08 * Math.sin(t * 15 + i) : 0.78 + 0.22 * Math.sin(t * 2.2 + i * 1.7); m.color.setScalar(b); });
    // fakkels
    const fl = a.flames; if (fl) { const pos = fl.userData.pos; for (let i = 0; i < pos.length; i++) { const sy = 1 + Math.sin(t * 12 + pos[i][0] * 3 + i) * 0.22 + Math.sin(t * 23 + i * 2) * 0.1; _l_set(_M, pos[i][0], pos[i][1] + (sy - 1) * 0.2, pos[i][2], 1, sy, 1); fl.setMatrixAt(i, _M); } fl.instanceMatrix.needsUpdate = true; }
    this.updBalloons(t); this.updCrowd(dt, t); this.updCritters(dt, t);
    // kanonnen: terugslag + af en toe vuren (niet bij de Deurman)
    for (const c of this.cannons) { c.kick = Math.max(0, c.kick - dt * 3); c.bar.scale.y = 1 - c.kick * 0.12; }
    if (k < 0.2 && !a.busy) { this.cannonT -= dt; if (this.cannonT <= 0) { this.cannonT = rand(14, 24); if (Math.random() < 0.3) this.party(5); else this.fire(Math.random() < 0.5 ? 0 : 1, 45); } }
    // gouden glinstering rond de zonebordjes
    this.signT -= dt; if (this.signT <= 0 && k < 0.3) { this.signT = rand(0.25, 0.6); const z = pick(a.zones); a.fx.emit(z.cx + rand(-4.5, 4.5), 10.2 + rand(0, 2), z.cz - 1 + rand(-0.5, 0.5), 0, rand(0.2, 0.8), 0, { life: rand(0.8, 1.4), size: rand(0.25, 0.5), color: z.color2 === 0x1a1a22 ? z.color : z.color2, gravity: -0.2 }); }
    if (this.coin.visible) { this.coin.rotation.y += dt * 2; this.coin.position.y = 0.9 + Math.sin(t * 2.5) * 0.12; if (Math.random() < dt * 1.5) a.fx.emit(this.coinPos.x + rand(-0.3, 0.3), 0.9 + rand(0, 0.6), this.coinPos.z + rand(-0.3, 0.3), 0, 0.5, 0, { life: 0.8, size: 0.3, color: 0xfff0a0, gravity: 0 }); }
    // middenplein
    if (!a.spin) a.wheelDisc.rotation.y += dt * [0.12, 0.35, 0.45][this.hall] * (1 - k);
    if (this.hall === 0) {
      if (this.waterMat) { this.waterMat.map.offset.x = t * 0.02; this.waterMat.map.offset.y = t * 0.012; }
      this.fountT -= dt; if (this.fountT <= 0 && k < 0.5) { this.fountT = 0.07; for (const n of a.nozzles) a.fx.emit(n.x, n.y, n.z, n.dx * rand(2.3, 3.0) + rand(-0.2, 0.2), rand(7, 8.6), n.dz * rand(2.3, 3.0) + rand(-0.2, 0.2), { life: 1.2, size: 0.28, color: 0xbfe8ff, gravity: 15 }); }
    } else if (this.hall === 1) {
      this.ledT -= dt; if (this.ledT <= 0 && a.led) { this.ledT = 1 / 20; this.updLed(t, k, party); }
      for (const b of a.beams) { b.gr.visible = k < 0.3; b.gr.rotation.x = Math.sin(t * 0.9 * party + b.ph) * 0.5; b.gr.rotation.z = Math.cos(t * 0.7 * party + b.ph * 1.3) * 0.55; b.gr.children[0].material.opacity = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 4 + b.ph)); }
    }
  }
  updLed(t, k, party) {
    const led = this.a.led, n = 8; const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2 * party)), 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 2.6 * party + (i + j) * 0.9), ring = Math.hypot(i - 3.5, j - 3.5), pulse = 0.5 + 0.5 * Math.sin(t * 3 * party - ring * 1.1), chk = (i + j + Math.floor(t * 2 * party)) % 2;
      _c.setHSL((i * 0.11 + j * 0.13 + t * 0.15) % 1, 1, (0.1 + 0.34 * (chk ? wave : pulse * 0.6) + beat * 0.12) * (1 - 0.8 * k)); led.setColorAt(i * n + j, _c);
    }
    led.instanceColor.needsUpdate = true;
  }
}
function _l_set(m, x, y, z, sx, sy, sz) { _q.identity(); m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); return m; }

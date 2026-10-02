import * as THREE from 'three';
import { mat, mesh, rand, pick, clamp, damp, TAU, dampAngle } from '../engine/util.js';
import { Butterfly, makeNPC } from '../engine/chars.js';
import { groundY, isWater, WATER_Y } from './terrain.js';
import { riverX, PATHS, PLAZA, BRIDGE } from './layout.js';

// Levende wereld: dieren, dorpelingen, vlinders, eenden, rook, fontein
export class Life {
  constructor(W, scene, particles) {
    this.W = W; this.scene = scene; this.fx = particles; this.t = 0;
    this.butterflies = [];
    for (let i = 0; i < 22; i++) {
      const b = new Butterfly([0xff9ad5, 0xffd23f, 0x9ad5ff, 0xffffff, 0xb08aff][i % 5]);
      const cx = rand(-60, 60), cz = rand(-40, 70); b.c = { x: cx, z: cz }; b.a = rand(0, 6); b.r = rand(2, 5); b.h = rand(1, 2.5); b.sp = rand(0.4, 1);
      scene.add(b.group); this.butterflies.push(b);
    }
    this.ducks = [];
    for (let i = 0; i < 7; i++) {
      const d = new THREE.Group(); d.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0xf4f0e0, { flatShading: false }), { scale: [1.2, 0.8, 0.9] })); d.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0x2f8a4a, { flatShading: false }), { pos: [0.3, 0.3, 0] })); d.add(mesh(new THREE.ConeGeometry(0.06, 0.15, 4), mat(0xf2a33a), { pos: [0.47, 0.28, 0], rot: [0, 0, -Math.PI / 2] }));
      d.userData = { z: rand(-60, 70), sp: rand(0.6, 1.2) * (Math.random() < 0.5 ? 1 : -1), off: rand(-2, 2), ph: rand(0, 6) }; scene.add(d); this.ducks.push(d);
    }
    // wandelende dorpelingen
    this.villagers = [];
    const kinds = [['kid', { shirt: 0xe8a33d }], ['kid', { shirt: 0xd8357f, hair: 0xe8b84a }], ['elder', {}], ['guard', {}], ['farmer', { shirt: 0x3a78a8 }], ['baker', { hat: null }], ['princess', { shirt: 0x6bb86a, tunic: 0x6bb86a, pants: 0x6bb86a }], ['kid', { shirt: 0x6b4ad8, scale: 0.75 }], ['fisher', {}], ['jester', { hatColor: 0x3a78e0 }], ['mason', {}], ['shepherd', {}]];
    kinds.forEach(([k, spec], i) => {
      const c = makeNPC(k, spec); const wp = this.randWaypoint(); c.group.position.set(wp.x, groundY(wp.x, wp.z), wp.z); scene.add(c.group);
      c.walk = { tx: wp.x, tz: wp.z, wait: rand(0, 4), speed: rand(1.3, 2.2) }; c.isVillager = true; c.lookR = 7; c.chat = i; this.villagers.push(c);
    });
    this.smokeT = 0; this.fountT = 0;
  }
  randWaypoint() {
    const p = pick(PATHS); const q = pick(p); const nx = q[0] + rand(-2, 2), nz = q[1] + rand(-2, 2);
    return { x: nx, z: nz };
  }
  update(dt, time, players, camFocus) {
    this.t += dt;
    const near = (x, z, r) => Math.hypot(x - camFocus.x, z - camFocus.z) < r;
    // dieren
    for (const a of this.W.animals || []) {
      const av = near(a.group.position.x, a.group.position.z, 60); a.group.visible = av; if (!av) continue;
      a.wait = (a.wait ?? rand(0, 3)) - dt;
      if (a.wait <= 0 && !a.tgt) { const r = a.kind === 'cow' ? 3 : 5; a.tgt = { x: a.home.x + rand(-r, r), z: a.home.z + rand(-r, r) }; }
      if (a.tgt) {
        const dx = a.tgt.x - a.group.position.x, dz = a.tgt.z - a.group.position.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { a.tgt = null; a.wait = rand(1.5, 6); a.speed = 0; }
        else { const sp = a.kind === 'chicken' ? 2.0 : 1.1; const nx = a.group.position.x + dx / d * sp * dt, nz = a.group.position.z + dz / d * sp * dt; if (!isWater(nx, nz)) { a.group.position.x = nx; a.group.position.z = nz; } a.targetYaw = Math.atan2(dx, dz); a.speed = 1; }
      } else a.speed = 0;
      a.update(dt); a.group.position.y += groundY(a.group.position.x, a.group.position.z);
    }
    // dorpelingen
    for (const v of this.villagers) {
      const p = v.group.position; const w = v.walk;
      const vis = near(p.x, p.z, 42); v.group.visible = vis; if (!vis) continue;
      let talking = false;
      for (const pl of players) if (Math.hypot(pl.x - p.x, pl.z - p.z) < 3.2) talking = true;
      if (talking) { v.speed = 0; const pl = players.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b)); v.faceTowards(pl.x, pl.z); }
      else if (w.wait > 0) { w.wait -= dt; v.speed = 0; }
      else {
        const dx = w.tx - p.x, dz = w.tz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.5) { const n = this.randWaypoint(); w.tx = n.x; w.tz = n.z; w.wait = rand(1, 7); v.speed = 0; }
        else { const nx = p.x + dx / d * w.speed * dt, nz = p.z + dz / d * w.speed * dt; if (isWater(nx, nz) && !(Math.abs(nz - BRIDGE.z) < 2)) { const n = this.randWaypoint(); w.tx = n.x; w.tz = n.z; } else { p.x = nx; p.z = nz; } v.faceDir(dx, dz); v.speed = clamp(w.speed / 3, 0, 1) + 0.15; }
      }
      p.y = groundY(p.x, p.z); v.update(dt);
    }
    // vlinders
    for (const b of this.butterflies) {
      b.a += dt * b.sp; const x = b.c.x + Math.cos(b.a) * b.r, z = b.c.z + Math.sin(b.a * 1.3) * b.r; b.group.position.set(x, groundY(x, z) + b.h + Math.sin(b.a * 3) * 0.4, z); b.group.rotation.y = -b.a * 1.3 + Math.PI / 2; b.update(dt);
      b.group.visible = near(x, z, 70);
    }
    // eenden
    for (const d of this.ducks) {
      const u = d.userData; u.z += u.sp * dt * 0.8; if (u.z > 90) u.z = -90; if (u.z < -90) u.z = 90;
      const x = riverX(u.z) + u.off; d.position.set(x, WATER_Y + 0.05 + Math.sin(time * 2 + u.ph) * 0.02, u.z); d.rotation.y = u.sp > 0 ? Math.PI / 2 + 0.2 : -Math.PI / 2 + 0.2; d.rotation.z = Math.sin(time * 2 + u.ph) * 0.05;
      d.visible = near(x, u.z, 80);
    }
    // schoorsteenrook
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.22;
      for (const c of this.W.chimneys) if (near(c.x, c.z, 55)) this.fx.emit(c.x + rand(-.1, .1), c.y, c.z + rand(-.1, .1), rand(-.1, .3) + 0.2, rand(0.9, 1.5), rand(-.1, .1), { life: 2.6, size: 0.9, color: 0xd8d8e0, gravity: -0.05, shrink: false });
    }
    // fontein
    this.fountT -= dt;
    if (this.fountT <= 0) {
      this.fountT = 0.04;
      for (const f of this.W.waterfx) { if (!near(f.x, f.z, 50)) continue; const a = Math.random() * TAU; this.fx.emit(f.x, f.y, f.z, Math.cos(a) * 1.2, 4.2 + Math.random(), Math.sin(a) * 1.2, { life: 0.9, size: 0.22, color: 0xa8e0ff, gravity: 9 }); }
    }
    // heksenketel + kampvuur vonken
    if (this.W.cauldronPos && near(this.W.cauldronPos.x, this.W.cauldronPos.z, 45) && Math.random() < 0.25) { const c = this.W.cauldronPos; this.fx.emit(c.x + rand(-.4, .4), c.y, c.z + rand(-.4, .4), rand(-.2, .2), rand(0.8, 1.6), rand(-.2, .2), { life: 1.4, size: 0.35, color: [0x7affb0, 0xb0ff7a, 0xd8a0ff][Math.floor(Math.random() * 3)], gravity: -0.3 }); }
    for (const cf of this.W.campfires) { const x = cf.position.x, z = cf.position.z; if (near(x, z, 45) && Math.random() < 0.5) this.fx.emit(x + rand(-.2, .2), cf.position.y + 0.8, z + rand(-.2, .2), rand(-.3, .3), rand(1.2, 2.4), rand(-.3, .3), { life: 1.1, size: 0.2, color: [0xffa020, 0xffd060, 0xff6020][Math.floor(Math.random() * 3)], gravity: -0.4 }); }
  }
}

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, rand, pick, TAU, smoothstep } from '../engine/util.js';
import { Animal } from '../engine/chars.js';

// De grappige "bullet-time"-animaties bij de winnende klap van Snelle Vingers.
// createGag(kind, E) -> { D, t, done, update(gdt), cam(out), dispose() }
// E = { scene, fx, audio, world, ctx, W, L, dir, headY(p), tip(p, out), muzzle(p) }
//   W = winnaar (speler-object), L = verliezer, dir = +1/-1 (van winnaar naar verliezer in x)

export const GAG_KINDS = ['pie', 'cow', 'hats', 'glove', 'chickens'];

const V = THREE.Vector3;
const tmp = new V();

function pieMesh() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.44, 0.34, 0.17, 14), mat(0xc89a52), { pos: [0, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 14), mat(0xfff0cf, { flatShading: false }), { pos: [0, 0.12, 0] }));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.09, 6, 12), mat(0xffffff, { flatShading: false }), { pos: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xd82a3a, { flatShading: false }), { pos: [0, 0.34, 0] }));
  return g;
}
function hatMesh(kind) {
  const g = new THREE.Group();
  const cols = [0x1a1a22, 0x5a2a8a, 0xb02a2a, 0x2a6a4a, 0xc89a52, 0xe8c24a];
  const c = pick(cols);
  if (kind === 0) { g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), mat(c), { pos: [0, 0.27, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 12), mat(c))); g.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 10), mat(0xd8372c), { pos: [0, 0.1, 0] })); }
  else if (kind === 1) { g.add(mesh(new THREE.ConeGeometry(0.34, 0.9, 9), mat(0x5a2a8a), { pos: [0, 0.45, 0], rot: [0, 0, 0.15] })); g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12), mat(0x5a2a8a))); g.add(mesh(new THREE.TorusGeometry(0.34, 0.04, 5, 12), mat(0xffd24a), { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0] })); }
  else if (kind === 2) { g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 10, 1, true), mat(0xf2c230, { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), { pos: [0, 0.1, 0] })); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(mesh(new THREE.ConeGeometry(0.07, 0.24, 4), mat(0xf2c230, { metalness: 0.7 }), { pos: [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4] })); } }
  else if (kind === 3) { g.add(mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, TAU, 0, 1.4), mat(0xb0702a), { pos: [0, 0.05, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 14), mat(0xb0702a), { pos: [0, 0.03, 0] })); }
  else { g.add(mesh(new THREE.SphereGeometry(0.36, 10, 6, 0, TAU, 0, 1.5), mat(0x2a8ad0), { pos: [0, 0.05, 0] })); const p = new THREE.Group(); p.position.y = 0.42; p.add(mesh(new THREE.BoxGeometry(0.8, 0.03, 0.12), mat(0xff5a5a))); p.add(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.8), mat(0xffd24a))); g.add(p); g.userData.prop = p; }
  return g;
}
function gloveMesh() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xd8222a, roughness: 0.45, flatShading: false });
  const gl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), red); gl.scale.set(1.05, 0.92, 1.05); gl.castShadow = true; g.add(gl);
  const th = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), red); th.position.set(0.1, 0.38, 0.28); g.add(th);
  const cuff = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.34, 10), mat(0xf4f0e0), { rot: [0, 0, Math.PI / 2], pos: [-0.55, 0, 0] }); g.add(cuff);
  return g;
}

export function createGag(kind, E) {
  const { scene, fx, audio, world, W, L, dir } = E;
  const objs = [];
  const add = (o) => { scene.add(o); objs.push(o); return o; };
  const gag = { kind, t: 0, D: 1.6, done: false, fov: 40, pos: new V(), look: new V() };
  const start = new V(), end = new V();
  const say = (t, x, y, z, o) => world.say(t, x, y, z, o);
  const lx = () => L.holder.position.x;
  let fired = false;
  const fire = () => { fired = true; E.muzzle(W); };
  const splatCols = [0xfff2d0, 0xffffff, 0xffd8a0, 0xf0507a];

  if (kind === 'pie') {
    gag.D = 1.5;
    const pie = add(pieMesh()); pie.scale.setScalar(1.8); pie.visible = false;
    let hit = false, hitT = 0, cream = null;
    gag.update = (gdt) => {
      const t = gag.t;
      if (!fired && t > 0.1) { fire(); E.tip(W, start); end.set(lx(), E.headY(L) - 0.15, 0.1); pie.visible = true; audio.sfx('whoosh', { vol: 0.5 }); }
      if (fired && !hit) {
        const u = clamp((t - 0.1) / 0.8, 0, 1);
        pie.position.lerpVectors(start, end, u); pie.position.y += 1.3 * Math.sin(Math.PI * u);
        pie.rotation.set(t * 2, t * 6, 0.4);
        if (Math.random() < 0.8) fx.particles.emit(pie.position.x, pie.position.y, pie.position.z, 0, 0.2, 0, { life: 0.5, size: 0.3, color: 0xfff2d0, gravity: 0 });
        if (u >= 1) {
          hit = true; hitT = t; pie.visible = false;
          fx.particles.burst(end.x, end.y, end.z + 0.3, { count: 90, speed: 7, up: 0.7, spread: 1.1, life: 1.1, size: 0.5, colors: splatCols, gravity: 10 });
          audio.sfx('thud', { vol: 0.8 }); audio.sfx('hit', { vol: 0.6 }); audio.tone(300, 0.25, { type: 'sine', vol: 0.3, slide: 90 });
          say('SPLAT!', lx(), E.headY(L) + 1.5, 0.8, { dur: 1.2, scale: 1.3, color: '#c0306a' }); E.ctx.shake(0.7);
          cream = new THREE.Group(); const s = L.c.height * 0.17;
          cream.add(mesh(new THREE.SphereGeometry(s * 1.7, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0.55, roughness: 0.6 }), { cast: false, pos: [0, 0.03, 0.04], scale: [1, 0.95, 1] }));
          cream.add(mesh(new THREE.SphereGeometry(s * 0.45, 8, 6), mat(0xd82a3a, { flatShading: false }), { cast: false, pos: [0, s * 1.8, 0] }));
          for (const sx of [-1, 1]) cream.add(mesh(new THREE.SphereGeometry(s * 0.55, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0.55, roughness: 0.6 }), { cast: false, pos: [sx * s * 1.1, -s * 1.7, s * 1.0], scale: [1, 1.8, 1] }));
          L.c.head.add(cream); L.cream = cream; L.bump(dir * 3.5); L.c.pose = 'scared'; L.hurt = 1;
        }
      }
    };
    gag.cam = (o) => {
      if (!fired || !hit) { const p = fired ? pie.position : tmp.set(lerp(W.holder.position.x, lx(), 0.5), 1.8, 0); o.pos.set(p.x * 0.8 + dir * 0.6, p.y * 0.6 + 0.8, 6.6); o.look.copy(p); o.fov = 38; }
      else { o.pos.set(lx() - dir * 1.8, E.headY(L) + 0.3, 4.4); o.look.set(lx(), E.headY(L) - 0.2, 0); o.fov = 34; }
    };
  } else if (kind === 'cow') {
    gag.D = 2.0;
    const cow = add(new Animal('cow').group); cow.scale.setScalar(2.1); cow.visible = false;
    
    let vy = 0, landed = false, landT = 0, spawned = false;
    gag.update = (gdt) => {
      const t = gag.t;
      if (!fired && t > 0.1) { fire(); E.tip(W, start); for (let i = 0; i < 24; i++) fx.particles.emit(start.x + (lx() - start.x) * 0.05, start.y + i * 0.6, 0.2, 0, 8, 0, { life: 0.4, size: 0.3, color: 0xfff2a0, gravity: 0 }); say('PANG!', start.x, start.y + 1.6, 0.6, { dur: 0.7, color: '#c4501a' }); }
      if (!spawned && t > 0.3) { spawned = true; cow.visible = true; cow.position.set(lx(), 16, 0); cow.rotation.y = 0.4; say('MOEEEE!', lx(), 9, 1, { dur: 1.6, scale: 1.5, color: '#3a2a1a' }); audio.tone(190, 1.1, { type: 'sawtooth', vol: 0.22, slide: 120, filter: 900, attack: 0.1 }); audio.tone(95, 1.1, { type: 'sine', vol: 0.3, slide: 80 }); }
      if (spawned && !landed) {
        vy -= 34 * gdt; cow.position.y += vy * gdt; cow.rotation.z = Math.sin(t * 7) * 0.3; cow.rotation.x = Math.sin(t * 5) * 0.2;
        const top = E.headY(L) + 0.05;
        if (cow.position.y <= top) {
          landed = true; landT = t; cow.position.y = 0.05; cow.rotation.set(0, 0.5, 0);
          L.holder.scale.set(L.size * 1.6, L.size * 0.16, L.size * 1.6); L.c.pose = 'scared'; L.hurt = 1;
          fx.particles.ring(lx(), 0.2, 0, { count: 30, speed: 7, color: 0xd8c8a8, size: 0.6, life: 0.8 }); fx.particles.burst(lx(), 0.4, 0.3, { count: 40, speed: 5, up: 1, life: 1, size: 0.6, colors: [0xd8c8a8, 0xffffff], gravity: 6 });
          audio.sfx('thud', { vol: 1 }); audio.sfx('land', { vol: 0.9 }); audio.sfx('boing', { vol: 0.5, rate: 0.6 }); E.ctx.shake(1);
        }
      }
      if (landed) { cow.rotation.y = lerp(cow.rotation.y, 0, 0.05); cow.position.y = 0.05 + Math.abs(Math.sin((t - landT) * 6)) * Math.max(0, 0.25 - (t - landT) * 0.3); }
    };
    gag.cam = (o) => {
      if (!spawned) { o.pos.set(lx() * 0.5, 1.8, 8.2); o.look.set(lx(), 3, 0); o.fov = 42; }
      else if (!landed) { o.pos.set(lx() + 1.2, 1.0, 9.0); o.look.set(lx(), Math.max(cow.position.y, 2.5), 0); o.fov = 46; }
      else { o.pos.set(lx() - dir * 1.5, 2.8, 11.5); o.look.set(lx(), 1.5, 0); o.fov = 42; }
    };
  } else if (kind === 'hats' || kind === 'chickens') {
    const chick = kind === 'chickens';
    const N = chick ? 8 : 13;
    gag.D = chick ? 1.9 : 1.7;
    const items = [];
    for (let k = 0; k < N; k++) {
      let o, animal = null;
      if (chick) { animal = new Animal('chicken'); o = animal.group; o.scale.setScalar(1.5); } else o = hatMesh(k % 5);
      o.visible = false; add(o);
      items.push({ o, animal, delay: 0.1 + k * (chick ? 0.1 : 0.05), state: 'wait', spin: new V(rand(-9, 9), rand(-9, 9), rand(-9, 9)), vel: new V(), t0: 0, dur: rand(0.5, 0.7), sc: 1 });
    }
    const stack = [];
    let landed = 0, bumped = false;
    gag.update = (gdt) => {
      const t = gag.t;
      if (!fired && t > 0.1) { fire(); }
      for (const it of items) {
        const o = it.o;
        if (it.state === 'wait' && fired && t >= it.delay) {
          it.state = 'fly'; it.t0 = t; E.tip(W, start); it.start = start.clone(); o.visible = true; o.position.copy(start);
          it.end = new V(lx() + rand(-0.4, 0.4), E.headY(L) + rand(-0.4, 0.5), rand(-0.3, 0.5));
          audio.tone(chick ? 700 + Math.random() * 400 : 500 + Math.random() * 500, 0.1, { type: chick ? 'square' : 'triangle', vol: 0.09, slide: chick ? 400 : 900 });
        }
        if (it.state === 'fly') {
          const u = clamp((t - it.t0) / it.dur, 0, 1);
          o.position.lerpVectors(it.start, it.end, u); o.position.y += 0.9 * Math.sin(Math.PI * u) * (chick ? 1.4 : 1);
          if (chick) { o.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; o.rotation.z = Math.sin(t * 40) * 0.4; it.animal.update(gdt); } else { o.rotation.x += it.spin.x * gdt; o.rotation.y += it.spin.y * gdt; o.rotation.z += it.spin.z * 0.4 * gdt; if (o.userData.prop) o.userData.prop.rotation.y += gdt * 30; }
          if (u >= 1) {
            landed++;
            if (!bumped) { bumped = true; L.c.pose = 'scared'; L.hurt = 1; }
            L.bump(dir * 0.9); E.ctx.shake(0.25); audio.sfx(chick ? 'pop' : 'wood', { vol: 0.5, rate: 0.8 + Math.random() * 0.6 });
            fx.particles.burst(o.position.x, o.position.y, o.position.z, { count: chick ? 12 : 8, speed: 3, up: 1, life: 0.7, size: 0.3, colors: chick ? [0xffffff, 0xf6f1e4, 0xf2a33a] : [0xffe14a, 0xffffff, 0xff6fa5], gravity: 8 });
            if (!chick && stack.length < 6) {
              it.state = 'stack'; stack.push(it); L.holder.add(o); o.position.set(0, (L.c.height * 1.0) + (stack.length - 1) * 0.3 / L.size * 0.9, 0); o.scale.setScalar(0.8 / L.size * (1 - stack.length * 0.03)); o.rotation.set(rand(-0.1, 0.1), rand(0, TAU), rand(-0.12, 0.12));
            } else if (chick && stack.length < 3) {
              it.state = 'stack'; stack.push(it); L.holder.add(o); const k = stack.length; o.position.set([0, -0.5, 0.5][k - 1] / L.size * 0.6, [L.c.height + 0.2, L.c.height * 0.75, L.c.height * 0.78][k - 1], [0, 0.2, -0.25][k - 1]); o.scale.setScalar(1.3 / L.size); o.rotation.set(0, rand(0, TAU), 0); it.animal.speed = 0;
            } else {
              it.state = 'bounce'; it.vel.set(dir * rand(1, 4) + rand(-2, 2), rand(5, 10), rand(-2, 3)); it.bt = 0;
            }
          }
        } else if (it.state === 'bounce') {
          it.vel.y -= 26 * gdt; o.position.addScaledVector(it.vel, gdt);
          if (!chick) { o.rotation.x += it.spin.x * 0.5 * gdt; o.rotation.z += it.spin.z * 0.5 * gdt; }
          if (chick) it.animal.update(gdt);
          if (o.position.y < (chick ? 0 : 0.12)) { o.position.y = chick ? 0 : 0.12; if (Math.abs(it.vel.y) > 3) it.vel.y *= -0.45; else { it.vel.y = 0; it.state = 'rest'; it.vel.set(0, 0, 0); } it.vel.x *= 0.7; it.vel.z *= 0.7; if (!chick) o.rotation.x = o.rotation.z = 0; if (chick) { o.rotation.set(0, rand(0, TAU), 0); it.animal.speed = 1; it.vel.set(rand(-1.5, 1.5), 0, rand(-0.8, 0.8)); it.state = 'run'; } }
        } else if (it.state === 'run') {
          o.position.addScaledVector(it.vel, gdt); it.animal.update(gdt); it.animal.targetYaw = Math.atan2(it.vel.x, it.vel.z); o.rotation.y = it.animal.yaw; o.position.y = Math.abs(Math.sin(t * 14 + it.spin.x)) * 0.2;
          if (Math.abs(o.position.x) > 11) it.vel.x *= -1;
          if (Math.random() < gdt * 0.4) say(pick(['KO-KO!', 'KAKEL!', 'KOKKOK!']), o.position.x, 2.6, o.position.z + 0.5, { dur: 0.6, scale: 0.7, color: '#a02a2a' });
        } else if (it.state === 'stack' && chick) { it.animal.update(gdt); }
      }
    };
    gag.cam = (o) => {
      if (!fired) { o.pos.set(lerp(W.holder.position.x, lx(), 0.2), 2.0, 6.0); o.look.set(lerp(W.holder.position.x, lx(), 0.5), 1.8, 0); o.fov = 40; }
      else { o.pos.set(lx() - dir * 2.5, E.headY(L) + 0.4, 5.6); o.look.set(lx(), E.headY(L) + 0.2, 0); o.fov = 38; }
    };
  } else { // glove
    gag.D = 2.3;
    const glove = add(gloveMesh()); glove.scale.setScalar(1.15); glove.visible = false;
    const rings = []; for (let i = 0; i < 10; i++) { const r = add(mesh(new THREE.TorusGeometry(0.2, 0.045, 5, 10), mat(0xb8bcc8, { metalness: 0.7, roughness: 0.3 }), { rot: [0, Math.PI / 2, 0] })); r.visible = false; rings.push(r); }
    let hit = false, launched = false, ping = false, hitT = 0;
    const lv = new V(), lrot = new V();
    gag.update = (gdt) => {
      const t = gag.t;
      if (!fired && t > 0.1) { fire(); E.tip(W, start); end.set(lx() - dir * 0.9, E.headY(L) - 0.5, 0); glove.visible = true; rings.forEach((r) => { r.visible = true; }); audio.tone(200, 0.5, { type: 'sine', vol: 0.3, slide: 700, vib: 0.05 }); audio.sfx('whoosh', { vol: 0.6 }); }
      if (fired) {
        const u = hit ? clamp(1 - (t - hitT - 0.25) / 0.35, 0, 1) : clamp((t - 0.1) / 0.38, 0, 1);
        const e = u * u * (3 - 2 * u);
        glove.position.lerpVectors(start, end, e); glove.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); glove.rotation.x = Math.sin(t * 30) * 0.05 * (1 - e);
        rings.forEach((r, i) => { const k = i / (rings.length - 1); r.position.lerpVectors(start, glove.position, k * 0.92); r.position.y += Math.sin(k * Math.PI * 2 * 3 + t * 40 * (1 - e)) * 0.03; r.scale.setScalar(1 - k * 0.2); });
        if (!hit && u >= 1) {
          hit = true; hitT = t; launched = true;
          lv.set(dir * 11, 17, 0); lrot.set(0, 0, -dir * 8);
          L.c.pose = 'scared'; L.hurt = 1; L.c.air = true; L.flying = true;
          fx.particles.burst(end.x + dir * 0.4, end.y + 0.3, 0.3, { count: 60, speed: 8, up: 0.6, life: 0.9, size: 0.6, colors: [0xffffff, 0xffe14a, 0xff7a3a], gravity: 4 });
          fx.particles.ring(end.x + dir * 0.4, end.y, 0.2, { count: 24, speed: 8, color: 0xfff2a0, size: 0.5, life: 0.5 });
          say('BAF!', end.x, end.y + 1.7, 1, { dur: 1.0, scale: 1.5, color: '#d02020' }); audio.sfx('hit', { vol: 1 }); audio.sfx('thud', { vol: 1 }); E.ctx.shake(1);
        }
        if (hit && t > hitT + 0.55 && glove.visible && u <= 0.01) { glove.visible = false; rings.forEach((r) => { r.visible = false; }); }
      }
      if (launched) {
        lv.y -= 20 * gdt; L.holder.position.x += lv.x * gdt; L.holder.position.y += lv.y * gdt; L.holder.position.z += lv.z * gdt;
        L.holder.rotation.z += lrot.z * gdt; L.holder.rotation.x += 6 * gdt;
        if (Math.random() < 0.6) fx.particles.emit(L.holder.position.x, L.holder.position.y + 1, L.holder.position.z, rand(-1, 1), rand(-1, 1), 0, { life: 0.6, size: 0.5, color: pick([0xffffff, 0xfff2a0]), gravity: 0 });
        if (!ping && L.holder.position.y > 13) { ping = true; const px = clamp(L.holder.position.x, -9, 9), py = 11.2; fx.particles.burst(px, py, -2, { count: 70, speed: 6, up: 0.1, spread: 1, life: 1.3, size: 0.8, colors: [0xffffff, 0xffe14a, 0xffb0e0], gravity: 0 }); say('PING!', px, py - 1.5, -1, { dur: 1.4, scale: 1.6, color: '#c08a10' }); audio.tone(1568, 0.8, { type: 'sine', vol: 0.25, send: 0.4 }); audio.tone(2349, 0.6, { type: 'sine', vol: 0.15, delay: 0.1, send: 0.4 }); L.holder.visible = false; }
      }
    };
    gag.cam = (o) => {
      if (!hit) { o.pos.set(lerp(W.holder.position.x, lx(), 0.5), 1.7, 6.4); o.look.set(lerp(W.holder.position.x, lx(), 0.5), 1.9, 0); o.fov = 38; }
      else { const y = clamp(L.holder.position.y, 1.5, 9); o.pos.set(lx() * 0.6, y * 0.7 + 1, 11); o.look.set(L.holder.position.x * 0.7, y, 0); o.fov = 46; }
    };
  }

  gag.dispose = () => { for (const o of objs) { if (o.parent) o.parent.remove(o); } objs.length = 0; };
  return gag;
}

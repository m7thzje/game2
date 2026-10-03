import * as THREE from 'three';
import { mesh, mat, clamp, rand, pick, TAU } from '../engine/util.js';
import { FT } from './brawl_data.js';

// De vier SUPER-zetten van Smash-Arena (A+B als de meter vol is).
//  Zwaardstorm (zwaardvechter) - Meteoor-regen (magier) - Aardbeving (reus) - Schaduwklonen (ninja)
// G = hulpfuncties uit brawl.js: { fs, opp, hurt, say, fx, audio, shake, S(), slash, explode, surfaceBelow, setPose, clearStun }
const sgn = (v) => (v < 0 ? -1 : 1);

export function createSupers(G) {
  const { scene, fx, audio } = G;
  const rains = [];

  // ----- meteoren (gepoold) -----
  const meteors = [];
  const mGeo = new THREE.IcosahedronGeometry(0.62, 1), cGeo = new THREE.IcosahedronGeometry(0.34, 0), tGeo = new THREE.ConeGeometry(0.5, 3.2, 7), rGeo = new THREE.RingGeometry(0.7, 1.05, 18);
  function mkMeteor() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false })));
    g.add(new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({ color: 0xffe070, fog: false })));
    const tail = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); tail.position.y = 1.9; g.add(tail);
    const mk = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false })); mk.rotation.x = -Math.PI / 2;
    g.visible = false; mk.visible = false; scene.add(g, mk);
    return { g, mk, live: false };
  }
  function launchMeteor(owner, tx, ty) {
    let m = meteors.find((q) => !q.live); if (!m) { if (meteors.length >= 14) return; m = mkMeteor(); meteors.push(m); }
    const T = 0.9, sx = tx + 8, sy = ty + 24;
    Object.assign(m, { live: true, owner, t: 0, T, sx, sy, tx, ty, x: sx, y: sy });
    m.g.visible = true; m.mk.visible = true; m.mk.position.set(tx, ty + 0.08, 0.5);
    m.g.rotation.z = Math.atan2(-(tx - sx), -(ty - sy)) * -1 + Math.PI; // staart wijst naar achteren
    m.g.rotation.z = Math.atan2(sx - tx, sy - ty) * -1;
    m.g.position.set(sx, sy, 0.5);
  }

  // ----- schaduwklonen (gepoold) -----
  const clones = [];
  function mkClone() {
    const g = new THREE.Group(), dk = new THREE.MeshBasicMaterial({ color: 0x1a1426, transparent: true, opacity: 0.92, fog: false });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 3, 8), dk); body.position.y = 1.05; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), dk); head.position.y = 2.0; g.add(head);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 5, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); band.rotation.x = Math.PI / 2; band.position.y = 2.1; g.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.9), band.material); tail.position.set(0, 2.05, -0.7); g.add(tail);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.04), new THREE.MeshBasicMaterial({ color: 0xe8f4ff, fog: false })); blade.position.set(0.6, 1.4, 0.2); blade.rotation.z = -0.5; g.add(blade);
    g.visible = false; scene.add(g); return { g, band, t: 9 };
  }
  const getClone = () => { let c = clones.find((q) => q.t >= 0.35); if (!c && clones.length < 4) { c = mkClone(); clones.push(c); } return c; };

  // ----- start: wordt aangeroepen na de cinematic -----
  function go(f) {
    const o = G.opp(f), kind = FT[f.type].sup.id, col = f.col;
    f.st = 'super'; f.atk = null; f.sup = { kind, t: 0, n: 0, hitT: 0, phase: 'go' };
    f.inv = Math.max(f.inv, 0.3);
    if (kind === 'storm') { f.sup.dur = 1.9; f.c.pose = 'push'; }
    else if (kind === 'meteor') { f.sup.dur = 0.6; f.c.pose = 'hands_up'; f.vx = f.vy = 0; }
    else if (kind === 'quake') { f.sup.phase = 'up'; f.sup.dur = 3; f.vy = 27; f.vx = 0; f.grounded = false; f.c.pose = 'hands_up'; f.c.jump(); audio.sfx('jump', { vol: 0.6, rate: 0.6 }); }
    else if (kind === 'clones') { f.sup.dur = 9; f.sup.next = 0.05; f.sup.total = 6; f.holder.visible = false; f.sup.hid = true; fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: 30, speed: 6, up: 0.6, life: 0.7, size: 0.8, colors: [0x2a2438, 0x6a5a88, 0xffffff], gravity: -1 }); audio.sfx('whoosh', { vol: 0.8, rate: 1.6 }); }
  }

  function finish(f, hurtTo) {
    f.st = 'free'; f.sup = null; f.holder.visible = true; f.holder.rotation.y = 0; f.c.pose = f.item ? 'carry' : 'idle'; f.jumps = f.maxJumps; f.boostUsed = false; f.inv = Math.max(f.inv, 0.5); f.lag = 0.1;
  }

  // ----- per frame voor een vechter in st='super'; geeft 1 terug als de gewone natuurkunde moet draaien, 2 = natuurkunde zonder zwaartekracht (zweven), 0 = eigen beweging -----
  function step(f, dt) {
    const s = f.sup, o = G.opp(f); s.t += dt; f.inv = Math.max(f.inv, 0.1);
    if (s.kind === 'storm') {
      f.holder.rotation.y += dt * 26; f.c.swing();
      const tx = o.st !== 'dead' ? o.x : f.x, ty = o.st !== 'dead' ? o.y + o.hh * 0.3 : f.y;
      const off = Math.abs(f.x) > G.S().BLAST.x - 6;
      f.vx = clamp((tx - f.x) * 3, -11, 11) * (off && Math.sign(tx - f.x) === Math.sign(f.x) ? 0 : 1) * f.spd; f.vy = clamp((ty - f.y) * 4, -10, 10);
      f.x += f.vx * dt; f.y += f.vy * dt; f.face = sgn(f.vx || f.face); f.grounded = false;
      s.hitT -= dt;
      if (Math.random() < 0.5) fx.particles.emit(f.x + rand(-1.5, 1.5), f.y + rand(0, f.hh), 0.5, rand(-3, 3), rand(-1, 3), 0, { life: 0.4, size: 0.5, color: pick([0xffffff, f.col, 0xffe14a]), gravity: 0 });
      if (s.hitT <= 0) {
        s.hitT = 0.17; G.slash(f.x, f.y + f.hh / 2, 5.4 * f.size, 3.2 * f.size, s.t * 40, 0xffffff); audio.sfx('swing', { vol: 0.4, rate: 1.3 + Math.random() * 0.4 });
        if (o.st !== 'dead' && Math.abs(o.x - f.x) < 2.7 * f.size + o.hw && Math.abs(o.y + o.hh / 2 - (f.y + f.hh / 2)) < 2.6 * f.size + o.hh / 2) {
          const ok = G.hurt(o, { dmg: 3.2, bkb: 3, kbg: 0.0, ang: 70, dirx: sgn(o.x - f.x), att: f, x: o.x, y: o.y + o.hh / 2, hs: 0.012, sup: 1 });
          if (ok && o.st === 'hit') { o.vx = (f.x - o.x) * 5; o.vy = 5; s.n++; }
        }
      }
      if (s.t >= s.dur) {
        if (o.st !== 'dead' && Math.abs(o.x - f.x) < 3.4 * f.size + o.hw) {
          G.hurt(o, { dmg: 11, bkb: 16, kbg: 0.2, ang: 40, dirx: sgn(o.x - f.x) || f.face, att: f, x: o.x, y: o.y + o.hh / 2, big: 1, hs: 0.2, snd: 'explode', sup: 1 });
          G.say('FINALE!', o.x, o.y + o.hh + 1, '#ffe14a', 1.8);
        }
        fx.particles.ring(f.x, f.y + f.hh / 2, 0.8, { count: 30, speed: 14, color: 0xffffff, size: 0.5, life: 0.5 }); finish(f);
      }
      return false;
    }
    if (s.kind === 'meteor') {
      f.vx = 0; f.vy = 0; f.c.pose = 'hands_up';
      if (Math.random() < 0.7) fx.particles.emit(f.x + rand(-1, 1), f.y + f.hh + rand(0, 2.5), 0.5, rand(-1, 1), rand(-0.5, 2), 0, { life: 0.5, size: 0.5, color: pick([0xffd070, 0xff7a1a, 0xffffff]), gravity: 0 });
      if (s.t >= s.dur) { rains.push({ owner: f, t: 0, dur: 3.3, next: 0.05, n: 0 }); G.say('METEOREN!', f.x, f.y + f.hh + 1.2, '#ff9a3a', 1.7); audio.sfx('buzz', { vol: 0.8, rate: 0.7 }); finish(f); }
      return 2;
    }
    if (s.kind === 'quake') {
      if (s.phase === 'up') {
        if (f.vy <= 3 || s.t > 0.75) { s.phase = 'slam'; s.t2 = 0; f.vy = -50; f.vx = 0; f.c.pose = 'scared'; f.c.squash = -0.2; audio.sfx('whoosh', { vol: 0.8, rate: 0.5 }); }
        return 1;
      }
      if (s.phase === 'slam') {
        s.t2 += dt; f.vx = 0; f.vy = Math.min(f.vy, -50); fx.particles.emit(f.x + rand(-0.6, 0.6), f.y + f.hh, 0.5, 0, rand(2, 6), 0, { life: 0.3, size: 0.6, color: 0xffd0a0, gravity: 0 });
        if (f.grounded || s.t > 3) { impact(f); }
        return 1;
      }
      return 1;
    }
    if (s.kind === 'clones') {
      f.vx = f.vy = 0; f.grounded = false;
      s.next -= dt;
      if (s.next <= 0 && s.n < s.total) {
        s.n++; const last = s.n === s.total; s.next = 0.27;
        if (o.st === 'dead') { s.n = s.total; }
        else {
          const side = s.n % 2 ? -1 : 1, dy = (s.n % 3 === 0 ? 1.6 : s.n % 3 === 1 ? 0 : 0.7);
          const cx = o.x + side * 2.0 * f.size, cy = o.y + dy, c = getClone();
          if (c) { c.t = 0; c.g.visible = true; c.g.position.set(cx, cy, 0.3); const cs = f.hh / 2.45; c.g.scale.set(side * cs, cs, cs); c.g.rotation.z = -side * 0.5; }
          G.slash(o.x, o.y + o.hh / 2, 3.8, 2.6, side > 0 ? Math.PI * 0.85 : Math.PI * 0.15, 0xffffff);
          audio.sfx(last ? 'explode' : 'swing', { vol: last ? 0.7 : 0.5, rate: 1.2 + Math.random() * 0.4 });
          const ok = G.hurt(o, last ? { dmg: 9, bkb: 15, kbg: 0.2, ang: 45, dirx: -side, att: f, x: o.x, y: o.y + o.hh / 2, big: 1, hs: 0.18, snd: 'thud', sup: 1 }
            : { dmg: 3, bkb: 3, kbg: 0, ang: 70, dirx: -side, att: f, x: o.x, y: o.y + o.hh / 2, hs: 0.02, sup: 1 });
          if (ok && !last && o.st === 'hit') { o.vx = -side * 2; o.vy = 5.5; }
          fx.particles.burst(cx, cy + 1, 0.5, { count: 8, speed: 4, up: 0.6, life: 0.4, size: 0.5, colors: [0x2a2438, 0xffffff], gravity: 0 });
        }
      }
      if (s.n >= s.total && s.next <= 0.1 || s.t > s.dur) {
        const st = G.S().start(f.i); const sp = st.x + (f.i ? 1 : -1) * 0.5;
        fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: 20, speed: 5, up: 0.6, life: 0.6, size: 0.7, colors: [0x2a2438, 0x6a5a88, 0xffffff], gravity: -1 });
        f.x = clamp(o.st !== 'dead' ? o.x : sp, st.x - 7, st.x + 7); f.y = Math.max(G.surfaceBelow(f.x, 30, f.hw) ?? st.y, st.y); f.vx = f.vy = 0; finish(f);
        fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: 20, speed: 6, up: 0.8, life: 0.6, size: 0.7, colors: [0xffffff, f.col], gravity: 2 }); G.say('Hihi!', f.x, f.y + f.hh + 1, '#bff8e8', 1.3);
      }
      return false;
    }
    return false;
  }

  function impact(f) {
    const o = G.opp(f), s = f.sup;
    G.shake(1.0); G.camPunch(1); audio.sfx('explode', { vol: 1, rate: 0.6 }); audio.sfx('thud', { vol: 0.9, rate: 0.5 });
    G.say('AARDBEVING!', f.x, f.y + f.hh + 1.4, '#ffb070', 1.9);
    for (let k = -1; k <= 1; k += 2) for (let i = 0; i < 14; i++) fx.particles.emit(f.x + k * (0.5 + i * 0.35), f.y + 0.3, 0.5, k * rand(10, 16), rand(1, 5), 0, { life: 0.6, size: 0.7, color: pick([0xd8c8a8, 0xa89878, 0xffb070]), gravity: 10 });
    fx.particles.ring(f.x, f.y + 0.4, 0.8, { count: 40, speed: 16, color: 0xffd0a0, size: 0.5, life: 0.5 });
    if (o.st !== 'dead' && Math.abs(o.y - f.y) < 1.5 && Math.abs(o.x - f.x) < 15) {
      const wasS = o.st === 'shield';
      G.hurt(o, { dmg: 16, bkb: 14, kbg: 0.17, ang: 76, dirx: sgn(o.x - f.x) || f.face, att: f, x: o.x, y: o.y + 1, big: 1, hs: 0.2, snd: 'explode', sup: 1, quake: 1 });
    } else if (o.st !== 'dead' && Math.abs(o.x - f.x) < 15) G.say('Gemist!', o.x, o.y + o.hh + 1, '#ffffff', 1.2);
    f.c.squash = 0.3; f.sup.phase = 'done'; finish(f); f.lag = 0.4;
  }

  // ----- lopende effecten (regen) en meteoren -----
  function tick(dt) {
    for (const r of rains) {
      r.t += dt; r.next -= dt;
      if (r.next <= 0 && r.t < r.dur) {
        r.next = 0.2; r.n++; const o = G.opp(r.owner), S = G.S(), cb = S.camBase();
        let tx;
        if (o.st !== 'dead' && (r.n % 3 !== 0)) tx = o.x + o.vx * 0.5 + rand(-2.4, 2.4); else tx = rand(cb.x0 + 1, cb.x1 - 1);
        const ty = G.surfaceBelow(tx, o.st !== 'dead' && Math.abs(tx - o.x) < 3 ? o.y + o.hh : 30, 0) ?? (o.st !== 'dead' ? o.y : 0);
        launchMeteor(r.owner, tx, ty);
      }
    }
    for (let i = rains.length - 1; i >= 0; i--) if (rains[i].t >= rains[i].dur) rains.splice(i, 1);
    for (const m of meteors) {
      if (!m.live) continue;
      m.t += dt; const u = Math.min(1, m.t / m.T);
      m.x = m.sx + (m.tx - m.sx) * u; m.y = m.sy + (m.ty - m.sy) * u; m.g.position.set(m.x, m.y, 0.5);
      m.mk.scale.setScalar(1.3 - u * 0.5 + Math.sin(m.t * 30) * 0.08); m.mk.material.opacity = 0.35 + u * 0.55;
      fx.particles.emit(m.x + rand(-0.3, 0.3), m.y + rand(-0.3, 0.3), 0.5, rand(-1, 1) + 4, rand(0, 4), 0, { life: 0.4, size: 0.6, color: pick([0xff7a1a, 0xffd070, 0xffffff]), gravity: 0 });
      if (u >= 1) { m.live = false; m.g.visible = false; m.mk.visible = false; G.explode(m.tx, m.ty + 0.3, m.owner, 0.62, { dmg: 8, bkb: 11, skip: m.owner }); }
    }
    for (const c of clones) { if (c.t < 0.35) { c.t += dt; c.g.visible = c.t < 0.3; const k = c.t / 0.3; c.band.material.opacity = 1 - k; } }
  }
  function reset() { for (const m of meteors) { m.live = false; m.g.visible = false; m.mk.visible = false; } rains.length = 0; }
  return { go, step, tick, reset, rains, meteors };
}

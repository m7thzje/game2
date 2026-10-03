import * as THREE from 'three';
import { clamp, lerp, damp, rand, TAU, mat, mesh } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';
import { ui } from '../engine/ui.js';
import { buildWorld, RA, pol } from './sneeuwgevecht_world.js';
import { glowSprite } from './dodgeball_world.js';

// Sneeuwballen-Slag — drie sneeuwforten in een driehoek, iedereen tegen iedereen.
// A: sneeuwbal maken (als je er geen hebt) en gooien (ingedrukt houden = verder/harder, boogbaan!), B: tikken = sneeuwmuur bouwen, ingedrukt = schild.
// Geraakt = -1 leven en 2 s verdoofd; 3 levens. Power-ups: ijsbal, reuzenbal, sneeuwscooter. Gimmicks: sneeuwstorm (zicht weg + wind),
// de yeti die rondstommelt (en de leider opzoekt) en de Deurman-sneeuwpop in het midden. Comeback: wie achterstaat krijgt een GOUDEN sneeuwbal (dubbele schade).
const GR = 30, PR = 0.9, SPEED = 6.4, CHAR_S = 1.45;
const MAKE_T = 0.8, CHARGE_T = 0.85, AMMO_MAX = 3, STUN = 2.0, INV_AFTER = 2.2, T_LIMIT = 90;
const NB = 40, NWALL = 12;
const POWER_COL = { ice: 0x7ad8ff, giant: 0xffffff, scooter: 0xff8a1a, gold: 0xffd23f };
const POWER_NAME = { ice: 'IJSBAL', giant: 'REUZENBAL', scooter: 'SNEEUWSCOOTER', gold: 'GOUDEN SNEEUWBAL' };

export default {
  id: 'sneeuwgevecht',
  name: 'Sneeuwballen-Slag',
  giver: 'Sneeuwpop de Deurman',
  icon: '❄️',
  mode: 'pvp',
  players: [3],
  time: 90,
  music: 'game_fast',
  blurb: 'Drie sneeuwforten, drie gooiers! Maak <b>sneeuwballen</b> en gooi ze: <b>houd A ingedrukt</b> voor een verre boogworp. <b>Geraakt = -1 leven</b> en 2 sec verdoofd (3 levens). Pas op voor de <b>yeti</b> en de <b>sneeuwstorm</b>! Laatste met levens wint.',
  controls: ['{move} lopen en richten', '{a} maken / gooien (houd = verder)', '{b} tik = muur, houd = schild'],
  tip: 'Lange worpen vliegen hoog: kijk naar de ring waar ze landen! Wie achterstaat krijgt een gouden bal.',

  create(ctx) {
    const { scene, camera, hud, fx } = ctx, pv = ctx.pvp, n = ctx.players.length, names = ctx.players.map((p) => p.name);
    ctx.lights('ice', { shadow: 20 });
    camera.position.set(0, 20.5, 16.3); camera.lookAt(0, 0, -3.5);
    const W = buildWorld(ctx);
    const rng = ctx.rng, sfx = (a, o) => ctx.sfx(a, o);

    // ---------------- spelers ----------------
    const hv = new THREE.Vector3();
    const handBall = (c) => { const m = mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), { cast: false }); m.visible = false; c.hold(m, 'r'); return m; };
    const P = ctx.players.map((pl, i) => {
      const c = makeBrother(i); c.group.scale.setScalar(CHAR_S); scene.add(c.group);
      const f = W.fort[i];
      const ring = mesh(new THREE.TorusGeometry(0.95, 0.09, 6, 22), new THREE.MeshBasicMaterial({ color: pl.color }), { cast: false, receive: false, rot: [Math.PI / 2, 0, 0] }); scene.add(ring);
      const tri = mesh(new THREE.ConeGeometry(0.34, 0.6, 3), new THREE.MeshBasicMaterial({ color: pl.color, fog: false, depthTest: false }), { cast: false, receive: false, rot: [Math.PI, 0, 0] }); tri.renderOrder = 15; scene.add(tri);
      const aim = mesh(new THREE.RingGeometry(0.55, 0.75, 20), new THREE.MeshBasicMaterial({ color: pl.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); aim.visible = false; scene.add(aim);
      const bar = mesh(new THREE.PlaneGeometry(1, 0.2), new THREE.MeshBasicMaterial({ color: 0xffe14a, fog: false, depthTest: false }), { cast: false, receive: false }); bar.renderOrder = 14; bar.visible = false; scene.add(bar);
      const dome = mesh(new THREE.SphereGeometry(1.55, 14, 10, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.42, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }), { cast: false, receive: false }); dome.visible = false; scene.add(dome);
      const sled = mesh(new THREE.BoxGeometry(1.5, 0.22, 1.9), mat(0xff8a1a), { cast: false }); sled.visible = false; scene.add(sled);
      const hb = handBall(c);
      return { i, c, ring, tri, aim, bar, dome, sled, hb, x: f.x + f.dx * 0.8, z: f.z + f.dz * 0.8, vx: 0, vz: 0, kx: 0, kz: 0, fx: f.dx, fz: f.dz, lives: 3, hits: 0, taken: 0, ammo: 2, charge: 0, charging: false, make: 0, bDown: false, bHold: 0, shield: false, shieldHp: 0, shieldCd: 0, wallCd: 0, throwCd: 0, stun: 0, frozen: 0, inv: 0, scooter: 0, power: null, alive: true, sz: 1, fortT: 0, mag: 0, koT: 0, lastGold: -99, mk: 0, yetiCd: 0 };
    });
    const statues = [];   // ijsblokken van uitgeschakelde spelers (bots-cirkels)

    // ---------------- ballen (geinstantieerd) ----------------
    const ballIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.36, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), NB); ballIM.castShadow = true; ballIM.frustumCulled = false;
    const shIM = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.35, depthWrite: false }), NB); shIM.frustumCulled = false;
    const mkIM = new THREE.InstancedMesh(new THREE.RingGeometry(0.62, 0.8, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), NB); mkIM.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), qx = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
    const HID = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let i = 0; i < NB; i++) { ballIM.setMatrixAt(i, HID); shIM.setMatrixAt(i, HID); mkIM.setMatrixAt(i, HID); ballIM.setColorAt(i, col.set(0xffffff)); mkIM.setColorAt(i, col.set(0xffffff)); }
    scene.add(ballIM, shIM, mkIM);
    const balls = []; for (let i = 0; i < NB; i++) balls.push({ alive: false, i });

    // ---------------- sneeuwmuren (dynamisch) ----------------
    const wallIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xeaf4ff, roughness: 0.9, flatShading: true }), NWALL); wallIM.castShadow = true; wallIM.receiveShadow = true; wallIM.frustumCulled = false;
    for (let i = 0; i < NWALL; i++) wallIM.setMatrixAt(i, HID);
    scene.add(wallIM);
    const dyn = [];   // levende sneeuwmuren
    const starIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffe14a, fog: false }), n * 3); starIM.frustumCulled = false; scene.add(starIM);
    for (let i = 0; i < n * 3; i++) starIM.setMatrixAt(i, HID);

    // ---------------- overige toestand ----------------
    let T = 0, clock = 0, over = false, overT = 0, ts = 1, tsT = 0, winner = null, done = false, koCount = 0, ended = false;
    const storm = { active: false, k: 0, t: 0, next: 21 + rng() * 5, wx: 0, wz: 0, left: 0, n: 0 };
    const Y = { on: false, x: 0, z: 0, vx: 0, vz: 0, state: 'wander', t: 0, tx: 0, tz: 0, target: -1, next: 16, face: 0, hit: 0, ph: 0, cd: [0, 0, 0], roar: 0 };
    const D = { cool: 0, boing: 0 };
    let nextPick = 6, nextGold = 24, goldN = 0, stormOverlay = null, prevHud = '';
    const fog = scene.fog; const fog0 = fog ? [fog.near, fog.far] : [40, 140];
    const stat = { throws: 0, hits: 0, shield: 0, walls: 0, gold: 0, powers: 0, yetiBumps: 0, storms: 0, ko: 0 };
    const circles = () => W.circles.concat(statues);
    const allWalls = () => W.walls.concat(dyn);

    const puff = (x, y, z, k = 8, cols = [0xffffff, 0xdbeaff], sp = 3) => fx.particles.burst(x, y, z, { count: k, speed: sp, up: 0.9, life: 0.6, size: 0.45, colors: cols, gravity: 7 });
    const floatT = (x, z, txt, c = '#ffffff', s = 1, y = 3.6) => fx.texts.add(txt, x, y, z, c, s);
    const last = () => { const key = (p) => (p.alive ? p.lives * 100 + p.hits * 3 - p.taken : -1000); const alive = P.filter((p) => p.alive); if (alive.length < 2) return []; const lo = Math.min(...alive.map(key)), hi = Math.max(...alive.map(key)); return lo < hi ? alive.filter((p) => key(p) === lo) : []; };
    const isLast = (p) => last().includes(p);

    // ---------------- botsingen ----------------
    // duw cirkel (x,z,r) uit cirkels/blokken; retourneert nieuwe positie in-place op obj {x,z}
    function pushOut(o, r, extraYetiR = 0) {
      for (const c of circles()) { const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m) { const k = d > 0.001 ? 1 / d : 0; o.x = c.x + (d > 0.001 ? dx * k : 1) * m; o.z = c.z + (d > 0.001 ? dz * k : 0) * m; } }
      for (const w of allWalls()) {
        const ca = Math.cos(w.ang), sa = Math.sin(w.ang), dx = o.x - w.x, dz = o.z - w.z, lx = dx * ca + dz * sa, lz = -dx * sa + dz * ca;
        const ox = w.hl + r - Math.abs(lx), oz = w.ht + r - Math.abs(lz);
        if (ox > 0 && oz > 0) { if (ox < oz) { const s = lx >= 0 ? 1 : -1; o.x += ca * s * ox; o.z += sa * s * ox; } else { const s = lz >= 0 ? 1 : -1; o.x += -sa * s * oz; o.z += ca * s * oz; } }
      }
      const rr = Math.hypot(o.x, o.z), lim = RA - r * 0.3; if (rr > lim) { o.x *= lim / rr; o.z *= lim / rr; }
    }
    const inWall = (b, w, br) => { const ca = Math.cos(w.ang), sa = Math.sin(w.ang), dx = b.x - w.x, dz = b.z - w.z, lx = dx * ca + dz * sa, lz = -dx * sa + dz * ca; return Math.abs(lx) < w.hl + br && Math.abs(lz) < w.ht + br; };

    // ---------------- acties ----------------
    function hurt(p, dmg, owner, dx, dz, o = {}) {
      if (!p.alive || p.inv > 0 || over) return false;
      p.lives = Math.max(0, p.lives - dmg); p.taken++;
      if (owner >= 0 && owner !== p.i) { P[owner].hits++; stat.hits++; }
      const frz = !!o.freeze; p.stun = frz ? 3.4 : o.stun ?? STUN; p.frozen = frz ? 3.4 : 0; p.inv = p.stun + INV_AFTER;
      p.charging = false; p.charge = 0; p.make = 0; p.shield = false; p.bDown = false;
      const l = Math.hypot(dx, dz) || 1; p.kx = dx / l * (o.kb ?? 8); p.kz = dz / l * (o.kb ?? 8);
      puff(p.x, 1.6, p.z, 16, frz ? [0x9fe0ff, 0xffffff] : [0xffffff, 0xffe14a, 0xdbeaff], 5);
      floatT(p.x, p.z, dmg > 1 ? 'DUBBEL! -2' : (frz ? 'BEVROREN! -1' : ['AUW! -1', 'PATS! -1', 'OEF! -1', 'BOEM! -1'][Math.floor(rng() * 4)]), dmg > 1 ? '#ffd23f' : '#ff8a7a', dmg > 1 ? 1.3 : 1.1);
      ctx.shake(dmg > 1 ? 0.5 : 0.28); sfx('hit'); sfx('hurt', { vol: 0.5, rate: 1 + p.i * 0.1 });
      if (owner >= 0) P[owner].c.swing();
      if (p.lives <= 0) ko(p);
      return true;
    }
    function ko(p) {
      p.alive = false; p.stun = 99; p.charging = false; koCount++; stat.ko++; p.koT = clock;
      const ice = W.iceBlocks[p.i]; ice.visible = true; ice.position.set(p.x, 1.6, p.z); statues.push({ x: p.x, z: p.z, r: 0.95, h: 3.2, kind: 'statue' });
      p.c.pose = 'sad'; p.hb.visible = false; p.dome.visible = false; p.aim.visible = false; p.bar.visible = false; p.sled.visible = false;
      hud.showBig(`${names[p.i].toUpperCase()} IS UIT!`, 1400, "#9fe0ff"); sfx('lose', { vol: 0.6 }); ctx.shake(0.6);
      ts = 0.4; tsT = 0.9;
      for (let k = 0; k < 24; k++) fx.particles.emit(p.x, 1 + Math.random() * 2, p.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, { life: 0.9, size: 0.4, color: Math.random() < 0.5 ? 0xa8e4ff : 0xffffff, gravity: 9 });
      const alive = P.filter((q) => q.alive);
      if (alive.length <= 1) endGame(alive.length === 1 ? alive[0].i : null, 'ko');
    }
    function endGame(w, why) {
      if (over) return; over = true; overT = 0; ts = Math.min(ts, 0.45); tsT = 1.2; hud.setTimer(null); hud.setHint(null);
      const alive = P.filter((p) => p.alive);
      const pool = w != null ? [P[w]] : (alive.length ? alive : P.slice().sort((a, b) => b.koT - a.koT).slice(0, 1));
      let cand = pool.length === 1 && w != null ? pool : alive.length ? alive : P;
      cand = cand.slice().sort((a, b) => b.hits - a.hits || b.lives - a.lives || a.taken - b.taken || (b.koT - a.koT));
      const top = cand.filter((p) => p.hits === cand[0].hits && p.lives === cand[0].lives && p.taken === cand[0].taken);
      winner = (w != null ? w : top[Math.floor(rng() * top.length)].i);
      P.forEach((p) => { if (p.alive) p.c.pose = p.i === winner ? 'cheer' : 'sad'; });
      hud.showBig(why === 'time' ? 'TIJD OM!' : 'DE SLAG IS GESLAGEN!', 1400, '#ffe14a'); sfx('bell');
    }
    function finish() {
      if (done) return; done = true;
      const w = winner, sc = P.map((p) => p.hits);
      const why = P.filter((p) => p.alive).length <= 1 ? 'is als laatste overgebleven' : 'heeft na afloop van de tijd de meeste treffers';
      ctx.finishPvp({ winner: w, score: sc, delay: 500, summary: `<b style="color:${ctx.players[w].css}">${names[w]}</b> ${why}!<br>Treffers: ${P.map((p) => `${names[p.i]} ${p.hits}`).join(' · ')} · Levens over: ${P.map((p) => p.lives).join('-')}` });
    }
    function giveAmmo(p, k) { p.ammo = Math.min(AMMO_MAX, p.ammo + k); }
    function giveGold(p) {
      p.power = 'gold'; p.ammo = Math.max(1, p.ammo); stat.gold++; floatT(p.x, p.z, 'GOUDEN BAL!', '#ffd23f', 1.4, 4.4);
      fx.particles.burst(p.x, 2, p.z, { count: 30, speed: 6, up: 1.4, life: 1.1, size: 0.5, colors: [0xffd23f, 0xfff2a0, 0xffffff], gravity: 5 }); sfx('powerup'); sfx('sparkle');
      hud.toast(`${names[p.i]} staat achter en krijgt een GOUDEN sneeuwbal (dubbele schade)!`, 2400);
    }

    function throwBall(p, pw) {
      const b = balls.find((q) => !q.alive); if (!b) return;
      const type = p.power || 'snow'; p.power = null; p.ammo = Math.max(0, p.ammo - 1); stat.throws++;
      const giant = type === 'giant';
      const R = (3.5 + pw * 13.5) * (giant ? 0.8 : 1), Tm = (0.4 + pw * 0.65) * (giant ? 1.25 : 1) / Math.sqrt(pv.gravity), g = GR * pv.gravity, y0 = 2.3 * p.sz;
      b.alive = true; b.type = type; b.owner = p.i; b.r = giant ? 1.0 : 0.38; b.dmg = type === 'gold' ? 2 : 1; b.g = g; b.age = 0; b.T = Tm;
      b.x = p.x + p.fx * 0.9; b.z = p.z + p.fz * 0.9; b.y = y0; b.vx = p.fx * R / Tm; b.vz = p.fz * R / Tm; b.vy = g * Tm / 2 - y0 / Tm; b.tx = p.x + p.fx * R; b.tz = p.z + p.fz * R; b.big = Tm > 0.62;
      p.c.swing(); p.c.pose = 'idle'; sfx('throw', { rate: 1.1 - pw * 0.4 + p.i * 0.05 }); puff(b.x, 2, b.z, 3, [0xffffff], 1.5);
    }
    function land(b, x, z) {
      b.alive = false; const giant = b.type === 'giant', rad = giant ? 2.5 : 1.2;
      puff(x, 0.3, z, giant ? 26 : 12, b.type === 'ice' ? [0x9fe0ff, 0xffffff] : b.type === 'gold' ? [0xffd23f, 0xffffff] : [0xffffff, 0xdbeaff], giant ? 6 : 3.4);
      fx.particles.ring(x, 0.25, z, { count: giant ? 22 : 12, speed: giant ? 6 : 3.5, color: 0xffffff, size: 0.3, life: 0.4 }); sfx('thud', { vol: giant ? 0.7 : 0.3, rate: giant ? 0.7 : 1.3 });
      if (giant) ctx.shake(0.4);
      for (const p of P) { if (!p.alive || p.i === b.owner) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < rad + PR * p.sz * 0.35) hurt(p, b.dmg, b.owner, p.x - x, p.z - z, { freeze: b.type === 'ice', kb: giant ? 11 : 7 }); }
      if (giant) for (let k = dyn.length - 1; k >= 0; k--) if (Math.hypot(dyn[k].x - x, dyn[k].z - z) < rad + dyn[k].hl * 0.5) breakWall(dyn[k], k);
      if (Y.on && Math.hypot(Y.x - x, Y.z - z) < rad + 1.2) yetiHit(b.owner);
    }
    function breakWall(w, k) { puff(w.x, 1, w.z, 14, [0xffffff, 0xdbeaff], 4); sfx('wood', { vol: 0.5, rate: 0.7 }); dyn.splice(k, 1); }
    function buildWall(p) {
      const wx = p.x + p.fx * (1.9 + p.sz * 0.3), wz = p.z + p.fz * (1.9 + p.sz * 0.3);
      if (Math.hypot(wx, wz) > RA - 1.2) return;
      const mine = dyn.filter((w) => w.owner === p.i); if (mine.length >= 2) { const o = dyn.indexOf(mine[0]); breakWall(mine[0], o); }
      if (dyn.length >= NWALL) dyn.shift();
      dyn.push({ x: wx, z: wz, ang: Math.atan2(p.fx, -p.fz), hl: 1.4, ht: 0.4, h: 1.9, hp: 3, life: 11, born: clock, owner: p.i, kind: 'snow' });
      p.wallCd = isLast(p) ? 3.2 : 5; stat.walls++; puff(wx, 0.6, wz, 12, [0xffffff, 0xdbeaff], 3); sfx('scrape', { vol: 0.5 }); sfx('pop', { vol: 0.5, rate: 0.7 });
    }

    // ---------------- yeti ----------------
    function yetiHit(owner) {
      Y.hit++; floatT(Y.x, Y.z, ['BOEF!', 'GRRR!', 'AUW!'][Y.hit % 3], '#cfe8ff', 1.1, 5.2); sfx('thud', { vol: 0.6, rate: 0.6 });
      if (Y.state === 'wander' && owner >= 0 && T > (Y.angryT || 0)) { Y.angryT = T + 10; Y.state = 'charge'; Y.t = 0; Y.target = owner; Y.roar = 0.6; hud.toast(`De yeti is boos op ${names[owner]}!`, 1700); sfx('scare', { vol: 0.3 }); }
    }
    function leader() { const alive = P.filter((p) => p.alive); if (!alive.length) return -1; alive.sort((a, b) => b.hits - a.hits || b.lives - a.lives); return alive[0].i; }
    function yetiUpdate(dt) {
      if (Y.off) return;
      if (!Y.on) { if (T >= 10) { Y.on = true; const [x, z] = pol(RA + 1.5, -30 + rng() * 60 + (rng() < 0.5 ? 0 : 180)); Y.x = x; Y.z = z; W.yeti.visible = true; hud.toast('Er loopt een YETI rond in de sneeuw!', 2200); sfx('scare', { vol: 0.25 }); Y.tx = 0; Y.tz = 0; } return; }
      Y.t += dt; Y.ph += dt;
      let sp = 2.4;
      if (Y.state === 'wander') {
        if (Y.t > 3.6 || Math.hypot(Y.tx - Y.x, Y.tz - Y.z) < 1.5) { const [x, z] = pol(rand(2, 10), rand(0, 360)); Y.tx = x; Y.tz = z; Y.t = 0.01; }
        if (T > Y.next) { Y.state = 'roar'; Y.t = 0; Y.target = leader(); }
      } else if (Y.state === 'roar') {
        sp = 0; Y.roar = Math.max(Y.roar, 0.5);
        if (Y.t < 0.05) { hud.showBig('DE YETI BRULT!', 900, '#cfe8ff'); sfx('airhorn', { vol: 0.35, rate: 0.6 }); ctx.shake(0.5); }
        if (Y.t > 0.9) { Y.state = 'charge'; Y.t = 0; Y.roar = 0; }
      } else if (Y.state === 'charge') {
        sp = 5.6; const tp = P[Y.target]; if (tp && tp.alive) { Y.tx = tp.x; Y.tz = tp.z; } else { Y.state = 'wander'; Y.t = 0; }
        if (Y.t > 3.0) { Y.state = 'wander'; Y.t = 0; Y.next = T + 15 + rng() * 6; }
      }
      const dx = Y.tx - Y.x, dz = Y.tz - Y.z, d = Math.hypot(dx, dz) || 1;
      Y.vx = damp(Y.vx, dx / d * sp, 5, dt); Y.vz = damp(Y.vz, dz / d * sp, 5, dt);
      Y.x += Y.vx * dt; Y.z += Y.vz * dt;
      const o = { x: Y.x, z: Y.z }; for (const c of circles()) { if (c.kind === 'deurman') continue; const ddx = o.x - c.x, ddz = o.z - c.z, dd = Math.hypot(ddx, ddz), m = c.r + 1.3; if (dd < m && dd > 0.01) { o.x = c.x + ddx / dd * m; o.z = c.z + ddz / dd * m; } }
      const rr = Math.hypot(o.x, o.z); if (rr > RA + 2.5) { o.x *= (RA + 2.5) / rr; o.z *= (RA + 2.5) / rr; } Y.x = o.x; Y.z = o.z;
      for (let k = dyn.length - 1; k >= 0; k--) if (Math.hypot(dyn[k].x - Y.x, dyn[k].z - Y.z) < dyn[k].hl * 0.6 + 1.3) { floatT(dyn[k].x, dyn[k].z, 'KRAK!', '#ffffff', 1, 2.5); breakWall(dyn[k], k); }
      for (const p of P) {
        Y.cd[p.i] -= dt; if (!p.alive || Y.cd[p.i] > 0) continue;
        const dd = Math.hypot(p.x - Y.x, p.z - Y.z);
        if (dd < 1.5 + PR * p.sz && Y.state !== 'charge' && Y.state !== 'roar') { Y.cd[p.i] = 1.0; const l = dd || 1; p.kx = (p.x - Y.x) / l * 7; p.kz = (p.z - Y.z) / l * 7; continue; }   // gewoon even wegduwen
        if (dd < 1.5 + PR * p.sz && p.inv <= 0.3) {
          Y.cd[p.i] = 3.0; stat.yetiBumps++; const l = dd || 1; p.kx = (p.x - Y.x) / l * 14; p.kz = (p.z - Y.z) / l * 14; p.stun = Math.max(p.stun, 0.9); p.inv = Math.max(p.inv, 1.9); p.charging = false; p.charge = 0; p.make = 0;
          floatT(p.x, p.z, 'BONK!', '#cfe8ff', 1.2); sfx('thud', { vol: 0.9, rate: 0.55 }); ctx.shake(0.5); puff(p.x, 1.4, p.z, 14, [0xffffff, 0xdbeaff], 5); Y.roar = 0.4;
        }
      }
      // animatie
      const ya = Math.atan2(Y.vx, Y.vz); if (Math.hypot(Y.vx, Y.vz) > 0.3) Y.face = ya; W.yeti.rotation.y += (((Y.face - W.yeti.rotation.y + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 6);
      const spd = Math.hypot(Y.vx, Y.vz), sw = Math.sin(Y.ph * (3 + spd * 1.4)) * 0.6 * Math.min(1, spd / 2);
      W.yb.legs[0].rotation.x = sw; W.yb.legs[1].rotation.x = -sw; Y.roar = Math.max(0, Y.roar - dt);
      W.yb.arms[0].rotation.x = -sw * 0.8 - Y.roar * 2.4; W.yb.arms[1].rotation.x = sw * 0.8 - Y.roar * 2.4;
      W.yb.body.position.y = Math.abs(sw) * 0.18; W.yb.head.rotation.x = Y.roar * -0.5 + 0.1; W.yeti.position.set(Y.x, 0, Y.z);
    }

    // ---------------- power-ups ----------------
    function spawnPickup(type, ax, az) {
      const s = W.pick.find((q) => !q.on); if (!s) return null;
      if (!type) { const r = rng(); type = r < 0.38 ? 'ice' : r < 0.72 ? 'giant' : 'scooter'; }
      let x = ax, z = az;
      if (x == null) { for (let t = 0; t < 20; t++) { const [px, pz] = pol(3.5 + rng() * (RA - 6), rng() * 360); if (W.fort.every((f) => Math.hypot(f.x - px, f.z - pz) > 4.2) && circles().every((c) => Math.hypot(c.x - px, c.z - pz) > c.r + 1.5) && allWalls().every((w) => Math.hypot(w.x - px, w.z - pz) > 3)) { x = px; z = pz; break; } } if (x == null) { x = 0; z = 4; } }
      s.on = true; s.type = type; s.x = x; s.z = z; s.t = 0; s.g.visible = true; s.g.position.set(x, 0, z); s.ice.visible = type === 'ice'; s.giant.visible = type === 'giant'; s.sc.visible = type === 'scooter';
      s.halo.material.color.set(POWER_COL[type] === 0xffffff ? 0xaadfff : POWER_COL[type]); s.beam.material.color.set(POWER_COL[type] === 0xffffff ? 0xaadfff : POWER_COL[type]);
      puff(x, 1, z, 14, [POWER_COL[type], 0xffffff], 4); sfx('bell', { vol: 0.3, rate: 1.4 });
      return s;
    }
    function pickupUpdate(dt) {
      if (!over) { nextPick -= dt; if (nextPick <= 0) { if (W.pick.filter((q) => q.on).length < 2) spawnPickup(); nextPick = 10 + rng() * 5; } }
      for (const s of W.pick) {
        if (!s.on) continue; s.t += dt; s.g.rotation.y += dt * 2; s.g.position.y = Math.sin(s.t * 3) * 0.15; s.halo.scale.setScalar(1 + Math.sin(s.t * 5) * 0.08);
        if (s.t > 16) { s.on = false; s.g.visible = false; continue; }
        for (const p of P) if (p.alive && p.stun <= 0 && Math.hypot(p.x - s.x, p.z - s.z) < 1.5 + p.sz * 0.3) {
          s.on = false; s.g.visible = false; stat.powers++;
          if (s.type === 'scooter') { p.scooter = 7; } else { p.power = s.type; p.ammo = Math.max(1, p.ammo); }
          floatT(p.x, p.z, POWER_NAME[s.type] + '!', '#' + new THREE.Color(POWER_COL[s.type]).getHexString(), 1.2, 4.3); sfx('powerup'); puff(p.x, 1.5, p.z, 16, [POWER_COL[s.type], 0xffffff], 5);
          break;
        }
      }
    }

    // ---------------- sneeuwstorm ----------------
    function stormUpdate(dt) {
      if (!storm.active && T >= storm.next && !over && T < T_LIMIT - 12) {
        storm.active = true; storm.left = 8; storm.n++; stat.storms++; const a = rng() * TAU; storm.wx = Math.cos(a); storm.wz = Math.sin(a);
        hud.showBig('SNEEUWSTORM!', 1300, '#dff2ff'); sfx('whoosh', { vol: 0.8, rate: 0.5 });
      }
      if (storm.active) { storm.left -= dt; if (storm.left <= 0) { storm.active = false; storm.next = T + 20 + rng() * 8; hud.setHint(null); } }
      storm.k = damp(storm.k, storm.active ? 1 : 0, 2.2, dt);
      if (fog) { fog.near = lerp(fog0[0], 22, storm.k); fog.far = lerp(fog0[1], 54, storm.k); }
      if (stormOverlay) stormOverlay.style.opacity = String(storm.k * 0.5);
      W.flakeUpdate(dt, storm.k, storm.wx * 10, storm.wz * 10);
      if (storm.active && !over) { const dirTxt = Math.abs(storm.wx) > Math.abs(storm.wz) ? (storm.wx > 0 ? 'naar rechts →' : 'naar links ←') : (storm.wz > 0 ? 'naar je toe ↓' : 'van je af ↑'); const h = `❄ SNEEUWSTORM! Wind ${dirTxt} — ballen waaien scheef`; if (h !== prevHud) { hud.setHint(h); prevHud = h; } }
    }

    // ---------------- ballen bijwerken ----------------
    function ballsUpdate(dt) {
      const steps = 2, h = dt / steps, wa = 6.5 * storm.k;
      for (const b of balls) {
        if (!b.alive) continue;
        for (let s = 0; s < steps && b.alive; s++) {
          b.age += h; b.vy -= b.g * h; b.vx += storm.wx * wa * h; b.vz += storm.wz * wa * h;
          b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
          if (b.y <= 0.15 && b.vy < 0) { land(b, b.x, b.z); break; }
          if (Math.hypot(b.x, b.z) > RA + 16) { b.alive = false; break; }
          // spelers
          for (const p of P) {
            if (!p.alive || p.i === b.owner) continue;
            const rad = PR * p.sz + b.r, dx = p.x - b.x, dz = p.z - b.z;
            if (dx * dx + dz * dz < rad * rad && b.y < 2.7 * p.sz && b.y > 0.1) {
              const sp = Math.hypot(b.vx, b.vz) || 1;
              if (p.shield && (b.vx * p.fx + b.vz * p.fz) / sp < -0.15 && p.inv <= 0) {   // geblokkeerd door schild
                p.shieldHp -= b.dmg; stat.shield++; floatT(p.x, p.z, 'BLOK!', '#9fe0ff', 1.1); sfx('ding', { rate: 0.8 }); puff(b.x, b.y, b.z, 10, [0x9fe0ff, 0xffffff], 3.5); b.alive = false;
                if (p.shieldHp <= 0 || b.type === 'giant') { p.shield = false; p.shieldCd = 3; p.bDown = false; floatT(p.x, p.z, 'SCHILD KAPOT', '#ffffff', 0.9, 4.2); sfx('wood'); }
                break;
              }
              if (p.inv > 0) continue;   // onkwetsbaar: bal vliegt erdoorheen
              hurt(p, b.dmg, b.owner, b.vx, b.vz, { freeze: b.type === 'ice', kb: b.type === 'giant' ? 12 : 8 }); b.alive = false; break;
            }
          }
          if (!b.alive) break;
          // dekking
          for (const c of circles()) if (b.y < c.h && (b.x - c.x) ** 2 + (b.z - c.z) ** 2 < (c.r + b.r) ** 2) {
            b.alive = false; puff(b.x, b.y, b.z, 8, [0xffffff, 0xdbeaff], 3);
            if (c.kind === 'deurman') deurmanHit(b.owner); else if (c.kind === 'statue') sfx('click', { vol: 0.6 }); else sfx('thud', { vol: 0.3, rate: 1.5 });
            break;
          }
          if (!b.alive) break;
          for (let k = 0; k < dyn.length + W.walls.length; k++) {
            const w = k < W.walls.length ? W.walls[k] : dyn[k - W.walls.length];
            if (b.y < w.h && inWall(b, w, b.r)) {
              b.alive = false; puff(b.x, b.y, b.z, 8, [0xffffff, 0xdbeaff], 3); sfx('thud', { vol: 0.35, rate: 1.4 });
              if (w.kind === 'snow') { w.hp -= b.type === 'giant' ? 9 : 1; if (w.hp <= 0) breakWall(w, dyn.indexOf(w)); }
              break;
            }
          }
          if (!b.alive) break;
          if (Y.on && b.y < 4.2 && (b.x - Y.x) ** 2 + (b.z - Y.z) ** 2 < (1.45 + b.r) ** 2) { b.alive = false; puff(b.x, b.y, b.z, 10, [0xffffff, 0xcfe8ff], 3); yetiHit(b.owner); }
        }
        // spoor
        if (b.alive && Math.random() < dt * 40) fx.particles.emit(b.x, b.y, b.z, 0, 0, 0, { life: 0.3, size: b.type === 'giant' ? 0.7 : 0.32, color: b.type === 'gold' ? 0xffd23f : b.type === 'ice' ? 0x9fe0ff : 0xffffff, gravity: 0 });
      }
    }
    function deurmanHit(owner) {
      D.boing = 1; if (D.cool > 0) { floatT(0, 0, 'HOI!', '#ff8ad0', 1, 5.6); return; }
      D.cool = 7; floatT(0, 0, ['DEURMAN ZEGT: CADEAU!', 'BOEM! HOI!'][Math.floor(rng() * 2)], '#ff8ad0', 1.2, 5.6); sfx('squeak'); sfx('tada', { vol: 0.4 }); ctx.shake(0.3);
      fx.particles.burst(0, 3.5, 0, { count: 30, speed: 6, up: 1.4, life: 1.1, size: 0.4, colors: [0xff4aa8, 0xffe14a, 0x4ac8ff, 0x7bff7b], gravity: 8 });
      const [px, pz] = pol(2.5, rng() * 360); spawnPickup(null, px, pz);
    }

    // ---------------- speler bijwerken ----------------
    function playerUpdate(p, dt) {
      const inp = pv.input(p.i), sz = pv.size(p.i); p.sz = sz; const pr = PR * sz;
      p.inv = Math.max(0, p.inv - dt); p.shieldCd = Math.max(0, p.shieldCd - dt); p.throwCd = Math.max(0, p.throwCd - dt); p.wallCd = Math.max(0, p.wallCd - dt); p.scooter = Math.max(0, p.scooter - dt);
      if (!p.alive) return;
      if (p.stun > 0) { p.stun -= dt; p.frozen = Math.max(0, p.frozen - dt); if (p.stun <= 0) { p.stun = 0; p.frozen = 0; } }
      const stunned = p.stun > 0 || over;
      const mx0 = stunned ? 0 : inp.x, mz0 = stunned ? 0 : inp.y, len = Math.hypot(mx0, mz0), mag = Math.min(1, len);
      const mx = len > 0.001 ? mx0 / Math.max(1, len) : 0, mz = len > 0.001 ? mz0 / Math.max(1, len) : 0;
      let sp = SPEED * pv.speed(p.i) * (p.scooter > 0 ? 1.8 : 1) * (p.shield ? 0.45 : 1) * (p.charging ? 0.7 : 1) * (p.make > 0 ? 0.4 : 1);
      const acc = lerp(15, 1.6, pv.slip);
      p.vx = damp(p.vx, mx * sp, acc, dt); p.vz = damp(p.vz, mz * sp, acc, dt);
      if (len > 0.25) { p.fx = mx0 / len; p.fz = mz0 / len; }
      p.x += (p.vx + p.kx) * dt; p.z += (p.vz + p.kz) * dt; const kd = Math.exp(-5 * dt); p.kx *= kd; p.kz *= kd;
      pushOut(p, pr);
      p.mag = Math.hypot(p.vx, p.vz) / (SPEED * 1.2);
      // spelers duwen elkaar zacht weg
      for (const q of P) if (q !== p && q.alive) { const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz), m = pr + PR * q.sz; if (d < m && d > 0.001) { const push = (m - d) * 0.5; p.x += dx / d * push; p.z += dz / d * push; } }
      // munitie: eigen fort + stapels op de grond
      const f = W.fort[p.i]; if (!stunned) {
        if (Math.hypot(p.x - f.x, p.z - f.z) < 2.7) { p.fortT += dt; if (p.fortT > (isLast(p) ? 0.55 : 0.9) && p.ammo < AMMO_MAX) { p.fortT = 0; giveAmmo(p, 1); sfx('pop', { vol: 0.3, rate: 1.4 }); } } else p.fortT = 0;
        W.pileSpots.forEach((pl, k) => { if (pl.on && p.ammo < AMMO_MAX && Math.hypot(p.x - pl.x, p.z - pl.z) < 1.5) { pl.on = false; pl.t = 9; W.setPile(k, false); giveAmmo(p, 2); floatT(p.x, p.z, '+2 ballen', '#ffffff', 0.9, 3.6); sfx('pop', { vol: 0.5 }); } });
      }
      // A: maken / opladen / gooien
      if (!stunned) {
        const a = inp.a;
        if (p.shield) { p.charging = false; p.charge = 0; p.make = 0; }
        else if (a) {
          if (p.ammo <= 0) { p.charging = false; p.charge = 0; const prev = p.make; p.make += dt / (MAKE_T * (isLast(p) ? 0.7 : 1)); if (Math.floor(p.make * 4) !== Math.floor(prev * 4)) sfx('scrape', { vol: 0.25, rate: 1.6 }); if (p.make > 0.4 && Math.random() < dt * 22) fx.particles.emit(p.x + p.fx * 0.6, 0.4, p.z + p.fz * 0.6, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, { life: 0.35, size: 0.3, color: 0xffffff, gravity: 5 }); if (p.make >= 1) { p.ammo = 1; p.make = 0; sfx('pop'); puff(p.x + p.fx * 0.7, 1.2, p.z + p.fz * 0.7, 6, [0xffffff], 2); } }
          else { p.make = 0; if (!p.charging) { p.charging = true; p.charge = 0; } p.charge = Math.min(1, p.charge + dt / CHARGE_T); }
        } else p.make = 0;
        if (p.charging && !p.shield && (inp.aR || !a)) { if (p.throwCd <= 0) { throwBall(p, Math.max(0.04, p.charge)); p.throwCd = 0.45; } p.charging = false; p.charge = 0; }
        if (!a && !inp.aR) p.charging = false;
        // B: tik = muur, ingedrukt = schild
        if (inp.bP) { p.bDown = true; p.bHold = 0; }
        if (p.bDown) {
          if (inp.b) { p.bHold += dt; if (p.bHold > 0.2 && !p.shield && p.shieldCd <= 0) { p.shield = true; p.shieldHp = 2; p.charging = false; p.charge = 0; sfx('ding', { vol: 0.4, rate: 1.5 }); } }
          if (inp.bR || !inp.b) { if (!p.shield && p.bHold <= 0.2 && p.wallCd <= 0) buildWall(p); else if (!p.shield && p.bHold <= 0.2 && p.wallCd > 0) { floatT(p.x, p.z, `muur ${p.wallCd.toFixed(0)}s`, '#ffffff', 0.7, 3.6); } p.shield = false; p.bDown = false; }
        }
      }
    }

    // ---------------- weergave ----------------
    const tmpC = new THREE.Color();
    function syncVisuals(dt) {
      for (const p of P) {
        const c = p.c, g = c.group;
        g.position.set(p.x, p.scooter > 0 ? 0.25 : 0, p.z); g.scale.setScalar(CHAR_S * p.sz);
        c.speed = p.stun > 0 || !p.alive ? 0 : clamp(p.mag, 0, 1); if (p.alive) c.faceDir(p.fx, p.fz);
        if (p.alive && !over) c.pose = p.stun > 0 ? 'scared' : (p.charging || p.make > 0) ? 'carry' : p.shield ? 'push' : 'idle';
        g.visible = !(p.inv > 0 && p.stun <= 0 && Math.floor(clock * 14) % 2 === 0 && p.alive);
        c.update(dt);
        p.ring.position.set(p.x, 0.07, p.z); p.ring.scale.setScalar(p.sz * (p.alive ? 1 : 0.01));
        p.tri.position.set(p.x, 3.9 * p.sz + 0.3 + Math.sin(clock * 5 + p.i) * 0.12, p.z); p.tri.visible = p.alive;
        const ch = p.charging && p.alive && !p.shield;
        p.aim.visible = ch;
        if (ch) { const pw = Math.max(0.04, p.charge), R = (3.5 + pw * 13.5) * (p.power === 'giant' ? 0.8 : 1); p.aim.position.set(p.x + p.fx * R, 0.09, p.z + p.fz * R); p.aim.scale.setScalar(1 + Math.sin(clock * 14) * 0.08 + (p.power === 'giant' ? 1 : 0)); }
        p.bar.visible = (ch || p.make > 0) && p.alive; if (p.bar.visible) { const k = ch ? p.charge : p.make; p.bar.position.set(p.x, 4.2 * p.sz + 0.5, p.z + 0.01); p.bar.scale.set(Math.max(0.02, 2.2 * k), 1, 1); p.bar.material.color.set(ch ? (k > 0.85 ? 0xff5a3a : 0xffe14a) : 0x9fe0ff); }
        p.dome.visible = p.shield && p.alive; if (p.dome.visible) { p.dome.position.set(p.x, 0.2, p.z); p.dome.rotation.y = Math.atan2(p.fx, p.fz) - Math.PI / 2; p.dome.material.opacity = 0.3 + p.shieldHp * 0.12; }
        p.sled.visible = p.scooter > 0 && p.alive; if (p.sled.visible) { p.sled.position.set(p.x, 0.12, p.z); p.sled.rotation.y = Math.atan2(p.fx, p.fz); if (Math.random() < dt * 30) fx.particles.emit(p.x - p.fx, 0.3, p.z - p.fz, 0, 1, 0, { life: 0.4, size: 0.4, color: 0xffffff, gravity: 2 }); }
        // bal in de hand
        const hasB = p.alive && p.ammo > 0 && !over; p.hb.visible = hasB;
        if (hasB) { const pw = p.power; p.hb.material.color.set(pw === 'gold' ? 0xffd23f : pw === 'ice' ? 0x9fe0ff : 0xffffff); p.hb.material.emissive.set(pw === 'gold' ? 0x6a4800 : pw === 'ice' ? 0x1a5a8a : 0x000000); p.hb.scale.setScalar((pw === 'giant' ? 2.3 : 1) * (1 + (p.charging ? p.charge * 0.35 : 0))); }
        if (p.alive && p.power && Math.random() < dt * 14) fx.particles.emit(p.x + (Math.random() - 0.5), 3 + Math.random(), p.z + (Math.random() - 0.5), 0, 1.5, 0, { life: 0.5, size: 0.3, color: POWER_COL[p.power] === 0xffffff ? 0xbfe4ff : POWER_COL[p.power], gravity: 0 });
        // sterretjes boven verdoofde spelers
        for (let k = 0; k < 3; k++) { const idx = p.i * 3 + k; if (p.stun > 0 && p.stun < 90 && p.alive) { const a = clock * 6 + k * TAU / 3; v3.set(p.x + Math.cos(a) * 0.9, 4.2 * p.sz + 0.2, p.z + Math.sin(a) * 0.9); s3.setScalar(1); m4.compose(v3, q0, s3); starIM.setMatrixAt(idx, m4); } else starIM.setMatrixAt(idx, HID); }
        if (p.frozen > 0 && p.alive) { const ice = W.iceBlocks[p.i]; ice.visible = true; ice.position.set(p.x, 1.6, p.z); } else if (p.alive) W.iceBlocks[p.i].visible = false;
      }
      starIM.instanceMatrix.needsUpdate = true;
      // ballen
      let hasMark = false;
      for (const b of balls) {
        if (!b.alive) { ballIM.setMatrixAt(b.i, HID); shIM.setMatrixAt(b.i, HID); mkIM.setMatrixAt(b.i, HID); continue; }
        v3.set(b.x, b.y, b.z); s3.setScalar(b.r / 0.38 * 0.84); m4.compose(v3, q0, s3); ballIM.setMatrixAt(b.i, m4);
        ballIM.setColorAt(b.i, tmpC.set(b.type === 'gold' ? 0xffd23f : b.type === 'ice' ? 0x8fd8ff : 0xffffff));
        const hk = clamp(1 - b.y / 7, 0.3, 1); v3.set(b.x, 0.06, b.z); s3.setScalar(b.r / 0.38 * hk * 1.2); m4.compose(v3, qx, s3); shIM.setMatrixAt(b.i, m4);
        if (b.big) { const rem = clamp((b.T - b.age) / b.T, 0, 1); v3.set(b.tx, 0.08, b.tz); s3.setScalar((b.type === 'giant' ? 2.2 : 1.15) * (1 + rem * 0.6) * (1 + Math.sin(clock * 16) * 0.05)); m4.compose(v3, qx, s3); mkIM.setMatrixAt(b.i, m4); mkIM.setColorAt(b.i, tmpC.set(ctx.players[b.owner].color)); hasMark = true; } else mkIM.setMatrixAt(b.i, HID);
      }
      ballIM.instanceMatrix.needsUpdate = true; if (ballIM.instanceColor) ballIM.instanceColor.needsUpdate = true; shIM.instanceMatrix.needsUpdate = true; mkIM.instanceMatrix.needsUpdate = true; if (mkIM.instanceColor) mkIM.instanceColor.needsUpdate = true;
      // muren
      for (let k = 0; k < NWALL; k++) {
        const w = dyn[k]; if (!w) { wallIM.setMatrixAt(k, HID); continue; }
        const age = clock - w.born, grow = clamp(age / 0.25, 0.05, 1), fade = clamp(w.life / 1.2, 0, 1);
        v3.set(w.x, w.h * 0.5 * grow * fade, w.z); q0.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -w.ang); s3.set(w.hl * 2, w.h * grow * fade, w.ht * 2); m4.compose(v3, q0, s3); wallIM.setMatrixAt(k, m4);
      }
      q0.identity(); wallIM.instanceMatrix.needsUpdate = true;
      // Deurman-sneeuwpop
      D.boing = Math.max(0, D.boing - dt * 2.2); const bs = 1 + Math.sin(D.boing * 14) * 0.12 * D.boing; W.dm.scale.set(2 - bs, bs, 2 - bs); W.dmGlow.material.opacity = 0.25 + 0.15 * Math.sin(clock * 3) + D.boing * 0.4;
    }
    const hearts = (p) => '♥'.repeat(p.lives) + '·'.repeat(3 - p.lives);
    const hudUpdate = () => {
      P.forEach((p) => hud.setPlayerInfo(p.i, `${hearts(p)}  ●${p.ammo}  treffers ${p.hits}` + (p.power ? ` [${POWER_NAME[p.power]}]` : '') + (p.scooter > 0 ? ' [SCOOTER]' : '') + (!p.alive ? '  IJSBLOK' : '')));
      hud.setScore(storm.active ? 'SNEEUWSTORM!' : `Treffers ${P.map((p) => p.hits).join(' - ')}`);
    };

    // start: spelers in hun fort, scene in beweging
    P.forEach((p) => { p.c.update(0.01); p.c.faceDir(p.fx, p.fz); p.c.targetYaw = p.c.yaw = Math.atan2(p.fx, p.fz); });
    syncVisuals(0.016);

    return {
      onStart() {
        hud.setTimer(T_LIMIT, 10); hudUpdate();
        stormOverlay = document.createElement('div'); stormOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(235,246,255,.25) 20%,rgba(235,246,255,.85) 100%);z-index:0'; ui.hudEl.prepend(stormOverlay);
      },
      introUpdate(dt) { W.flakeUpdate(dt, 0, 0, 0); P.forEach((p) => p.c.update(dt)); clock += dt; syncVisuals(dt); },
      update(dt0) {
        if (tsT > 0) { tsT -= dt0; if (tsT <= 0) ts = 1; } else ts = Math.min(1, ts + dt0 * 2);
        const dt = dt0 * ts; clock += dt;
        if (!over) { T += dt; hud.setTimer(Math.max(0, T_LIMIT - T), 10); }
        D.cool = Math.max(0, D.cool - dt);
        if (!over) {
          stormUpdate(dt); yetiUpdate(dt); pickupUpdate(dt);
          W.pileSpots.forEach((pl, k) => { if (!pl.on) { pl.t -= dt; if (pl.t <= 0) { W.setPile(k, true); } } });
          if (T >= nextGold) { nextGold += 26; const lw = last(); if (lw.length) { lw.forEach((p) => { if (p.power !== 'gold') { giveGold(p); goldN++; } }); } }
        } else { overT += dt0; stormUpdate(dt); W.flakeUpdate(dt, storm.k, 0, 0); }
        for (const p of P) playerUpdate(p, dt);
        ballsUpdate(dt);
        for (let k = dyn.length - 1; k >= 0; k--) { dyn[k].life -= dt; if (dyn[k].life <= 0) { puff(dyn[k].x, 0.6, dyn[k].z, 6, [0xffffff], 2); dyn.splice(k, 1); } }
        if (!over && T >= T_LIMIT) endGame(null, 'time');
        if (over && overT > 2.4) finish();
        if (over && Math.random() < dt * 5 && winner != null) { const w = P[winner]; fx.particles.burst(w.x + rand(-2, 2), 4 + Math.random() * 2, w.z + rand(-2, 2), { count: 14, speed: 5, up: 1, life: 1.1, size: 0.45, colors: [0xffd23f, 0xff6fb5, 0x4ac8ff, 0xffffff], gravity: 6 }); }
        syncVisuals(dt); hudUpdate();
      },
      onDeurman(movers) {
        movers.forEach((m, i) => { const p = P[i]; if (!m || !p || !p.alive) return; if (p.lives > 1) { p.lives--; p.taken++; floatT(p.x, p.z, 'BEWOOGD! -1', '#ff9a3c', 1.1, 4.2); } p.stun = Math.max(p.stun, 1); p.inv = Math.max(p.inv, 1.8); p.charging = false; p.charge = 0; });
      },
      onSwap() { P.forEach((p) => p.c.jump()); },
      celebrate(w) { P.forEach((p, i) => { if (p.alive || i === w) p.c.pose = i === w ? 'cheer' : 'sad'; }); },
      resultUpdate(dt) { clock += dt; W.flakeUpdate(dt, 0, 0, 0); P.forEach((p) => p.c.update(dt)); },
      dispose() { if (stormOverlay) stormOverlay.remove(); },
      dbg: {
        state: () => ({
          T, over, winner, done, ts, koCount, stat, storm: { active: storm.active, k: storm.k, n: storm.n, left: storm.left, wx: storm.wx, wz: storm.wz },
          yeti: { on: Y.on, x: Y.x, z: Y.z, state: Y.state, hit: Y.hit },
          P: P.map((p) => ({ i: p.i, x: p.x, z: p.z, fx: p.fx, fz: p.fz, lives: p.lives, hits: p.hits, taken: p.taken, ammo: p.ammo, charge: p.charge, charging: p.charging, make: p.make, stun: p.stun, frozen: p.frozen, inv: p.inv, power: p.power, shield: p.shield, shieldHp: p.shieldHp, shieldCd: p.shieldCd, wallCd: p.wallCd, alive: p.alive, scooter: p.scooter, sz: p.sz })),
          balls: balls.filter((b) => b.alive).map((b) => ({ x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz, tx: b.tx, tz: b.tz, owner: b.owner, type: b.type, T: b.T, age: b.age })),
          pick: W.pick.filter((q) => q.on).map((q) => ({ x: q.x, z: q.z, type: q.type })), walls: dyn.map((w) => ({ x: w.x, z: w.z, ang: w.ang, hp: w.hp, owner: w.owner })),
          piles: W.pileSpots.map((q) => ({ x: q.x, z: q.z, on: q.on })), forts: W.fort.map((f) => ({ x: f.x, z: f.z, dx: f.dx, dz: f.dz })), circles: W.circles.map((c) => ({ x: c.x, z: c.z, r: c.r, h: c.h })),
        }),
        hurt: (i, dmg = 1, owner = -1, o = {}) => hurt(P[i], dmg, owner, 1, 0, o), give: (i, kind) => { if (kind === 'gold') giveGold(P[i]); else { P[i].power = kind; P[i].ammo = Math.max(1, P[i].ammo); } },
        ammo: (i, k) => { P[i].ammo = k; }, place: (i, x, z) => { P[i].x = x; P[i].z = z; P[i].vx = P[i].vz = 0; }, face: (i, fx, fz) => { P[i].fx = fx; P[i].fz = fz; }, setT: (t) => { T = t; }, setNext: (a) => { nextGold = a; },
        spawnPickup, startStorm: () => { storm.next = 0; }, quiet: () => { Y.off = true; Y.on = false; W.yeti.visible = false; storm.next = 1e9; nextPick = 1e9; nextGold = 1e9; },
        yetiAt: (x, z, st = 'wander', tg = 0) => { Y.target = tg; Y.off = false; Y.on = true; W.yeti.visible = true; Y.x = x; Y.z = z; Y.state = st; Y.t = 0; Y.tx = x; Y.tz = z; }, endGame, throwBall: (i, pw) => throwBall(P[i], pw), buildWall: (i) => buildWall(P[i]), deurmanHit,
      },
    };
  },
};

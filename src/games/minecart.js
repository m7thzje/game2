import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, randInt, pick, TAU, canvasTex, smoothstep, mulberry32, shuffle } from '../engine/util.js';
import { Dragon, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildMine, laneX, LANES, S0, VIEW, makeCart, makeSpark, makeRock, makePit, makePad, makeFire, makeWall, makeFinishArch, makeStation } from './minecart_world.js';

// Mijnkar-Race — duel: race door een kristalmijn. Eigen baan met 3 rails per broer, springen over gaten en vonkjes,
// remmen = turbo opladen. Wie als eerste 1000 m (virtueel) haalt wint. De achterligger krijgt vaker turbo-pads.

const COURSE = 1000, BASE_V = 20, MAX_T = 95;
const RAIL_GAP = 2;

// ---------------- parcours (voor beide spelers identiek) ----------------
export function genCourse(rng) {
  const out = []; let id = 1, D = 72, lastWall = -999;
  const add = (o) => { o.id = id++; out.push(o); return o; };
  const sparkAt = (D0, lane, amp = 0.8) => add({ type: 'spark', D: D0, c: lane + (rng() - 0.5) * 0.5, amp: amp + rng() * 0.3, period: 1.7 + rng() * 0.8, ph: rng() * TAU });
  const gapAt = (D0, lane, len = 4.2 + rng() * 1.0) => add({ type: 'gap', D: D0, lane, len });
  while (D < COURSE - 48) {
    const p = D / COURSE;
    const table = [['sparks', 3.2], ['gap', 2.1], ['rock', p > 0.08 ? 1.9 : 0], ['fire', p > 0.14 ? 1.7 : 0], ['pad', 1.2], ['mixed', p > 0.06 ? 1.5 : 0], ['wall', p > 0.14 && D - lastWall > 150 ? 1.5 : 0]];
    let tot = table.reduce((a, t) => a + t[1], 0), r = rng() * tot, kind = 'gap';
    for (const [k, w] of table) { r -= w; if (r <= 0) { kind = k; break; } }
    const lanes = shuffle([0, 1, 2], rng); const [a, b, c] = lanes;
    if (kind === 'sparks') { sparkAt(D, 1, 0.9 + p * 0.2); if (p > 0.45 && rng() < 0.5) sparkAt(D + 10, rng() < 0.5 ? 0.5 : 1.5, 0.5); }
    else if (kind === 'gap') { gapAt(D, a); if (p > 0.1 && rng() < 0.4) gapAt(D + (rng() < 0.5 ? 0 : 4), b); }
    else if (kind === 'rock') { add({ type: 'rock', D, ph: rng() * TAU, period: 2.5 + rng() * 0.5 }); }
    else if (kind === 'fire') { add({ type: 'fire', D, lane: a }); if (p > 0.5 && rng() < 0.6) add({ type: 'fire', D, lane: b }); }
    else if (kind === 'pad') { add({ type: 'pad', D, lane: a }); if (rng() < 0.35) gapAt(D + 15, a, 5); if (rng() < 0.4) sparkAt(D + 8, b, 0.5); }
    else if (kind === 'mixed') { gapAt(D, a); sparkAt(D + 2, b, 0.45); if (rng() < 0.4) add({ type: 'pad', D: D - 9, lane: c }); }
    else if (kind === 'wall') { add({ type: 'wall', D: D + 24, lane: a, bonus: 26 }); if (rng() < 0.55) add({ type: 'pad', D: D, lane: a }); gapAt(D + 22, b); sparkAt(D + 26, c, 0.5); lastWall = D; D += 24; }
    D += 30 + rng() * 10 - p * 8;
  }
  out.sort((x, y) => x.D - y.D);
  return out;
}

const warnSprite = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, () => {}), transparent: true }));

export default {
  id: 'minecart',
  name: 'Mijnkar-Race',
  giver: 'Mijnmeester Pikhouweel',
  icon: '🚃',
  mode: 'pvp',
  time: 50,
  pay: 1,
  music: 'game_fast',
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  blurb: 'Een wilde race door de <b>Kristalmijn</b>! Jullie zitten elk in een mijnkar op een eigen spoor met <b>3 rails</b>. Wissel van rail, spring over gaten en <b>elektrische vonkjes</b>, ontwijk zwaaiende rotsen en het vuur van de draak. Rem om je <b>turbo op te laden</b>, rij over turbo-pads en wie als eerste de finish van <b>1 kilometer</b> haalt, wint!',
  controls: ['{move} links/rechts = van rail wisselen', '{a} springen', '{b} ingedrukt = remmen & turbo opladen (loslaten = turbo!)'],
  tip: 'Een turbo breekt ook de brokkelmuur van de Snelweg: dat scheelt 26 meter! Wie achterstaat krijgt meer turbo-pads.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('cave', { shadow: 14, center: [0, 0, -4], fogNear: 40, fogFar: 125 });
    L.hemi.color.set(0xb4a8ff); L.hemi.groundColor.set(0x5a4a8a); L.hemi.intensity = 2.3;
    L.sun.color.set(0xfff0d8); L.sun.intensity = 2.0; L.sun.position.set(-8, 24, 14);
    camera.fov = 56; camera.updateProjectionMatrix();
    const rng = mulberry32(90210);
    const Mw = buildMine(ctx, mulberry32(777));
    const B = Mw.B;
    const course = genCourse(mulberry32(31337));
    const gT = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

    // start-station + finish-bogen
    const station = makeStation(); scene.add(station);
    const arches = [0, 1].map((i) => { const a = makeFinishArch(7.4); scene.add(a); return a; });

    // ---------------- spelers ----------------
    const sizes = [1, 1];
    const pl = players.map((pp, i) => {
      const cart = makeCart(i); scene.add(cart);
      const blob = P.shadowBlob(1.5); scene.add(blob);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.2, 0.82, 1); tag.renderOrder = 15; scene.add(tag);
      // turbo-meter (ring boven de kar)
      const meter = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 28, 1, 0, TAU), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })); meter.rotation.x = -Math.PI / 2; scene.add(meter);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 7), new THREE.MeshBasicMaterial({ color: 0x7ae8ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); flame.rotation.x = -Math.PI / 2; flame.visible = false; scene.add(flame);
      const pools = { spark: [], rock: [], gap: [], pad: [], fire: [], wall: [] };
      const mk = (type, fn, n) => { for (let k = 0; k < n; k++) { const m = fn(); m.visible = false; scene.add(m); pools[type].push(m); } };
      mk('spark', makeSpark, 7); mk('rock', makeRock, 3); mk('gap', makePit, 7); mk('pad', makePad, 10); mk('fire', makeFire, 4); mk('wall', makeWall, 2);
      const dragon = new Dragon(i ? 0x2f7ad4 : 0x7a2fd4, 0.62); dragon.group.visible = false; scene.add(dragon.group);
      const breath = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); breath.visible = false; scene.add(breath);
      return {
        i, cart, blob, tag, meter, flame, pools, dragon, breath, lane: 1, x: laneX(i, 1), vx: 0, d: 0, v: 0, y: 0, vy: 0, state: 'run', stateT: 0, inv: 0, slowT: 0, slowDur: 1, slowF: 1, boostT: 0, boostF: 1, charge: 0, braking: false,
        burn: 0, fall: 0, fallEnd: 0, warp: 0, finished: false, crossT: 0, prevLeft: false, prevRight: false, zc: 0, wheelRot: 0, scan: 0, extras: [], nextChunk: 90, broken: new Set(), fireT: new Map(), padUsed: new Set(), hits: 0, stats: { pads: 0, zaps: 0, falls: 0, walls: 0, crashes: 0 }, tilt: 0, dragonY: 14, dragonX: laneX(i, 1), dragonOn: false, wob: 0, sizeMul: 1,
      };
    });
    let extraId = 20000;

    // ---------------- toestand ----------------
    let atFinish = null, T = 0, introT = 0, done = false, endAt = -1, finishOrder = [], resT = 0, camBase = 0, startT = 0, rubberLog = 0;
    hud.setTimer(null);
    function bar(d) { const n = Math.round(clamp(d / COURSE, 0, 1) * 8); return '█'.repeat(n) + '░'.repeat(8 - n); }
    function refreshHud() {
      hud.setScore(`${names[0]} ${bar(pl[0].d)}   🏁   ${bar(pl[1].d)} ${names[1]}`);
      pl.forEach((p, i) => hud.setPlayerInfo(i, `${Math.min(COURSE, Math.floor(p.d))} m  ${'●'.repeat(Math.round(p.charge * 5))}${'○'.repeat(5 - Math.round(p.charge * 5))}${p.boostT > 0 ? ' TURBO!' : ''}`));
    }

    // ---------------- hindernissen per speler ----------------
    function obstaclesNear(p, lo, hi) {
      const res = [];
      for (let k = p.scan; k < course.length; k++) { const o = course[k]; if (o.D > hi) break; if (o.D + (o.len || 0) + 8 < lo) continue; res.push(o); }
      for (const o of p.extras) if (o.D < hi && o.D + 8 > lo) res.push(o);
      return res;
    }
    function maybeSpawnExtras(p) {
      const q = pl[1 - p.i];
      while (p.nextChunk - 80 < p.d && p.nextChunk < COURSE - 30) {
        const D0 = p.nextChunk; p.nextChunk += 45;
        const lead = p.d - q.d;
        let n = 0;
        if (lead < -60) n = 1 + (rng() < 0.7 ? 1 : 0); else if (lead < -25) n = rng() < 0.75 ? 1 : 0; else if (lead < -8) n = rng() < 0.4 ? 1 : 0; else if (lead < 12) n = rng() < 0.12 ? 1 : 0; else n = 0;
        for (let k = 0; k < n; k++) {
          for (let tr = 0; tr < 6; tr++) {
            const lane = randInt(0, 2), D = D0 + k * 11 + rand(0, 9);
            const clash = course.some((o) => Math.abs(o.D - D) < 9 && (o.lane === lane || o.type === 'rock' || o.type === 'spark')) || p.extras.some((o) => Math.abs(o.D - D) < 8);
            if (!clash) { p.extras.push({ type: 'pad', D, lane, id: extraId++, extra: true }); break; }
          }
        }
      }
    }

    // ---------------- effecten ----------------
    function say(p, t, color = '#ffffff', sc = 1.1) { fx.texts.add(t, p.x, 3.6, p.zc, color, sc); }
    function hurt(p, kind) {
      if (p.state !== 'run' && kind !== 'fall') return;
      if (p.inv > 0 && kind !== 'wallok') return;
      const sz = p.sizeMul;
      p.hits++; p.inv = 1.5; p.charge = 0; p.braking = false;
      if (kind === 'spark') { p.slowT = p.slowDur = 1.15; p.slowF = 0.32; p.stats.zaps++; audio.sfx('buzz', { vol: 0.8 }); audio.sfx('hurt', { vol: 0.6 }); ctx.shake(0.6); say(p, pick(['ZAP!', 'BZZT!', 'AU!']), '#7ae8ff', 1.3); p.cart.userData.c.pose = 'scared'; p.stateT = 1.15; p.wob = 1;
        fx.particles.burst(p.x, 1.2, p.zc, { count: 44, speed: 7, up: 1.3, life: 0.7, size: 0.35, colors: [0x7ae8ff, 0xffffff, 0xffe14a], gravity: 6 }); }
      else if (kind === 'rock') { p.slowT = p.slowDur = 1.3; p.slowF = 0.18; p.stats.crashes++; audio.sfx('hit', { vol: 1 }); audio.sfx('thud', { vol: 0.8 }); ctx.shake(0.85); say(p, pick(['BONK!', 'KRAK!', 'BOEM!']), '#ffd24a', 1.4); p.cart.userData.c.pose = 'scared'; p.vy = 7; p.y = 0.05; p.wob = 1;
        fx.particles.burst(p.x, 1.0, p.zc, { count: 36, speed: 6, up: 1.0, life: 0.9, size: 0.45, colors: [0x8a7a9a, 0x5a4e72, 0xd0c8e0], gravity: 14 }); }
      else if (kind === 'fire') { p.slowT = p.slowDur = 1.0; p.slowF = 0.45; p.burn = 1.4; p.stats.crashes++; audio.sfx('sizzle', { vol: 0.9 }); audio.sfx('hurt', { vol: 0.7 }); ctx.shake(0.4); say(p, pick(['AU, HEET!', 'FFFFT!', 'BRAND!']), '#ff9a3a', 1.3); p.cart.userData.c.pose = 'scared'; p.wob = 1; }
      else if (kind === 'wall') { p.slowT = p.slowDur = 1.6; p.slowF = 0.08; p.stats.crashes++; audio.sfx('explode', { vol: 0.6 }); audio.sfx('hurt', { vol: 0.7 }); ctx.shake(1); say(p, 'KRAK! Geen turbo...', '#ffd24a', 1.1); p.cart.userData.c.pose = 'scared'; p.vy = 6; p.y = 0.05; p.wob = 1;
        fx.particles.burst(p.x, 1.2, p.zc - 1, { count: 40, speed: 7, up: 1.2, life: 0.9, size: 0.45, colors: [0x8a7a9a, 0x5a4e72, 0xffd23a], gravity: 14 }); }
      else if (kind === 'fall') { p.state = 'fall'; p.stateT = 0; p.fall = 0; p.stats.falls++; p.inv = 2.2; audio.sfx('miss', { vol: 0.9 }); audio.sfx('splash', { vol: 0.4, rate: 0.6 }); ctx.shake(0.5); say(p, 'AAAAH!', '#ff7a5a', 1.3); p.cart.userData.c.pose = 'scared'; p.vy = -1; }
    }
    function boost(p, secs, f, why) {
      p.boostT = Math.max(p.boostT, secs); p.boostF = Math.max(p.boostF, f);
      audio.sfx('powerup', { vol: 0.7 }); audio.sfx('whoosh', { vol: 0.6, rate: 1.3 });
      say(p, why, '#7affea', 1.2);
      fx.particles.burst(p.x, 0.8, p.zc, { count: 28, speed: 6, up: 0.6, life: 0.6, size: 0.35, colors: [0x7affea, 0xffffff, 0x58e0ff], gravity: 0 });
      p.cart.userData.c.pose = 'cheer'; setTimeout(() => { if (p.cart.userData.c.pose === 'cheer' && !done) p.cart.userData.c.pose = 'push'; }, 500);
    }
    function smashWall(p, o) {
      p.broken.add(o.id); p.stats.walls++; p.warp = o.bonus || 26; p.inv = Math.max(p.inv, 1.2);
      audio.sfx('explode', { vol: 0.9 }); audio.sfx('win', { vol: 0.5 }); ctx.shake(0.9);
      say(p, 'SNELWEG! +' + (o.bonus || 26) + ' m', '#ffe14a', 1.5);
      fx.particles.burst(p.x, 1.4, p.zc - 1.5, { count: 80, speed: 9, up: 1.2, life: 1.1, size: 0.5, colors: [0xffd23a, 0xffffff, 0x8a7a9a, 0x5a4e72], gravity: 10 });
      fx.particles.ring(p.x, 1.2, p.zc - 1, { count: 36, speed: 9, color: 0xffe14a, size: 0.4, life: 0.8 });
    }

    // ---------------- spelerlogica ----------------
    const spdTw = (i) => 1 + (ctx.pvp.speed(i) - 1) * 0.5;
    function control(p, dt) {
      const inp = ctx.pvp.input(p.i);
      const left = inp.x < -0.4, right = inp.x > 0.4;
      const canAct = p.state === 'run' && !done && !(p.stunT > 0);
      if (canAct) {
        if (left && !p.prevLeft) { if (p.lane > 0) { p.lane--; audio.sfx('click2', { vol: 0.5 }); p.vx -= 2; } }
        if (right && !p.prevRight) { if (p.lane < LANES - 1) { p.lane++; audio.sfx('click2', { vol: 0.5 }); p.vx += 2; } }
        if (inp.aP && p.y <= 0.001 && p.vy <= 0) {
          p.vy = 12.2 * (0.62 + 0.38 * Math.sqrt(ctx.pvp.gravity)); p.y = 0.002; audio.sfx('jump', { vol: 0.5 });
          fx.particles.burst(p.x, 0.15, p.zc, { count: 8, speed: 3, up: 0.6, life: 0.4, size: 0.3, color: 0xe8d8ff, gravity: 3 }); p.cart.userData.c.jump();
        }
        // remmen & turbo opladen
        p.braking = inp.b && p.y <= 0.05;
        if (p.braking) { p.charge = Math.min(1, p.charge + dt * 0.7); if (Math.random() < dt * 30) fx.particles.emit(p.x + (Math.random() - 0.5) * 1.4, 0.2, p.zc + 1.0, (Math.random() - 0.5) * 2, 1.2, 2 + Math.random() * 3, { life: 0.4, size: 0.22, color: 0xffd23a, gravity: 6 }); }
        if (inp.bR && p.charge > 0.2) { boost(p, 0.5 + p.charge * 1.5, 1.52, p.charge > 0.9 ? 'SUPER-TURBO!' : 'TURBO!'); }
        if (inp.bR || !inp.b) { if (!p.braking) p.charge = inp.b ? p.charge : (inp.bR ? 0 : Math.max(0, p.charge - dt * 0.15)); }
      } else { p.braking = false; }
      p.prevLeft = left; p.prevRight = right;
    }
    function physics(p, dt) {
      const slip = ctx.pvp.slip, gr = ctx.pvp.gravity;
      p.inv = Math.max(0, p.inv - dt); p.boostT = Math.max(0, p.boostT - dt); if (p.boostT <= 0) p.boostF = 1; p.burn = Math.max(0, p.burn - dt);
      p.stateT = Math.max(0, p.stateT - dt);
      if (p.state === 'fall') {
        p.fall += dt; p.vy -= 28 * dt; p.y += p.vy * dt;
        p.v = damp(p.v, 3, 4, dt);
        if (p.fall > 1.0) {
          // een veer slingert de kar weer op de rails
          const o = p.fallObs; p.state = 'run'; p.y = 0.2; p.vy = 12; p.v = 9; if (o) p.d = Math.max(p.d, o.D + o.len + 0.6); p.slowT = p.slowDur = 0.8; p.slowF = 0.7;
          audio.sfx('boing', { vol: 0.9 }); say(p, 'BOING!', '#ffe14a', 1.2); p.cart.userData.c.pose = 'push'; ctx.shake(0.3);
          fx.particles.burst(p.x, 0.5, p.zc, { count: 30, speed: 6, up: 1.5, life: 0.8, size: 0.4, colors: [0xffd23a, 0xff7a1a, 0xffffff], gravity: 8 });
        }
        return;
      }
      // snelheid
      let tv = BASE_V * spdTw(p.i) * p.rubber;
      if (p.boostT > 0) tv *= p.boostF;
      if (p.braking) tv *= 0.55;
      if (p.slowT > 0) { p.slowT -= dt; tv *= lerp(p.slowF, 1, smoothstep(0, 1, 1 - Math.max(0, p.slowT) / p.slowDur)); }
      if (p.stunT > 0) tv *= 0.2;
      const lam = (tv > p.v ? lerp(2.8, 1.0, slip) : lerp(5, 1.8, slip)) * (p.boostT > 0 && tv > p.v ? 2.2 : 1);
      p.v = damp(p.v, tv, lam, dt);
      let dd = p.v * dt;
      if (p.warp > 0) { const w = Math.min(p.warp, 48 * dt); p.warp -= w; dd += w; }
      p.d += dd;
      // zijwaartse beweging (veer-demper; bij slip meer overshoot)
      const tx = laneX(p.i, p.lane); const k = 340, c = lerp(2 * Math.sqrt(k), 11, slip);
      p.vx += ((tx - p.x) * k - p.vx * c) * dt; p.x += p.vx * dt;
      // springen
      if (p.y > 0 || p.vy > 0) { p.vy -= 28 * gr * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; if (p.vy < -3) { audio.sfx('land', { vol: 0.5 }); fx.particles.burst(p.x, 0.1, p.zc, { count: 10, speed: 3, up: 0.7, life: 0.4, size: 0.3, color: 0xe8d8ff, gravity: 3 }); p.cart.userData.c.squash = -0.12; } p.vy = 0; } }
      if (p.stateT <= 0 && p.state === 'run' && p.cart.userData.c.pose === 'scared') p.cart.userData.c.pose = 'push';
    }
    function collisions(p, d0, d1) {
      if (p.state !== 'run') return;
      const q = pl[1 - p.i];
      const near = obstaclesNear(p, d0 - 3, d1 + 8);
      const cm = p.sizeMul;     // grotere kar = groter doel
      for (const o of near) {
        const ox = o.type === 'spark' ? laneX(p.i, 1) + (o.c + o.amp * Math.sin(T * TAU / o.period + o.ph) - 1) * RAIL_GAP : o.type === 'rock' ? laneX(p.i, 1) + 6.8 * Math.sin(0.56 * Math.sin(T * TAU / o.period + o.ph)) : laneX(p.i, o.lane);
        const dx = Math.abs(p.x - ox);
        if (o.type === 'pad') {
          if (d1 > o.D - 1.8 && d0 < o.D + 1.8 && dx < 1.05 && p.y < 1.4 && !p.padUsed.has(o.id)) { p.padUsed.add(o.id); p.stats.pads++; boost(p, 1.45, 1.55, 'TURBO!'); }
        } else if (p.warp > 0) continue;
        else if (o.type === 'spark') {
          if (d1 > o.D - 1.0 && d0 < o.D + 1.0 && dx < 0.95 * cm + 0.45 && p.y < 1.55) hurt(p, 'spark');
        } else if (o.type === 'rock') {
          const th = 0.56 * Math.sin(T * TAU / o.period + o.ph); const ry = 8 - 6.8 * Math.cos(th);
          if (d1 > o.D - 1.1 && d0 < o.D + 1.1 && dx < 1.15 + 0.5 * cm && p.y < ry + 0.55) hurt(p, 'rock');
        } else if (o.type === 'gap') {
          if (d1 > o.D + 0.5 && d0 < o.D + o.len - 0.5 && dx < 0.95 && p.y < 0.45) { p.fallObs = o; hurt(p, 'fall'); }
        } else if (o.type === 'fire') {
          const ft = p.fireT.get(o.id);
          if (ft && ft.burn && d1 > o.D - 5 && d0 < o.D + 5 && dx < 1.0 && p.y < 1.1) hurt(p, 'fire');
        } else if (o.type === 'wall') {
          if (!p.broken.has(o.id) && d1 > o.D - 0.8 && d0 < o.D + 0.9 && dx < 1.45) { if (p.boostT > 0) smashWall(p, o); else { p.broken.add(o.id); hurt(p, 'wall'); } }
        }
      }
    }

    // ---------------- weergave van de hindernissen ----------------
    const sc1 = new THREE.Vector3();
    function showObstacles(p, dt) {
      const idx = { spark: 0, rock: 0, gap: 0, pad: 0, fire: 0, wall: 0 };
      const lo = p.d + S0 - 4, hi = p.d + VIEW;
      p.fireActive = null;
      for (const o of obstaclesNear(p, lo, hi)) {
        const pool = p.pools[o.type]; const m = pool[idx[o.type]]; if (!m) continue;
        const s = o.D - p.d; if (s < S0 - 8 || s > VIEW) continue;
        const bx = B.bx(s), hy = B.hy(s), z = p.zc - s;
        if (o.type === 'spark') {
          idx.spark++; const lx = o.c + o.amp * Math.sin(T * TAU / o.period + o.ph);
          m.visible = true; m.position.set(laneX(p.i, 1) + (lx - 1) * RAIL_GAP + bx, 0.95 + hy + Math.sin(T * 6 + o.id) * 0.1, z);
          const ud = m.userData; ud.core.rotation.y = T * 3; ud.shell.rotation.set(T * 2, T * 3, 0); ud.glow.material.opacity = 0.65 + Math.sin(T * 20 + o.id) * 0.2;
          ud.bolts.forEach((b, k) => { const a = T * 8 + ud.bolts[k].userData.a; b.position.set(Math.cos(a) * 0.8, Math.sin(a * 1.3) * 0.5, Math.sin(a) * 0.6); b.rotation.set(a, a * 2, a * 0.5); b.visible = Math.random() < 0.8; });
          if (s < 50 && Math.random() < dt * 14) fx.particles.emit(m.position.x, m.position.y, m.position.z, (Math.random() - 0.5) * 2, Math.random() * 2, 3 + Math.random() * 4, { life: 0.4, size: 0.2, color: 0x9af0ff, gravity: 0 });
        } else if (o.type === 'rock') {
          idx.rock++; const th = 0.56 * Math.sin(T * TAU / o.period + o.ph);
          m.visible = true; m.position.set(laneX(p.i, 1) + bx, 8 + hy, z); const ud = m.userData; ud.swing.rotation.z = th; ud.chain.scale.y = 6.8; ud.chain.position.y = -3.4; ud.rock.position.set(0, -6.8, 0); ud.rock.rotation.set(0, 0, -th);
          ud.shadow.position.set(6.8 * Math.sin(th), 0.08 - 8, 0); ud.shadow.position.y = -7.9; ud.shadow.visible = true;
        } else if (o.type === 'gap') {
          idx.gap++; m.visible = true; const ud = m.userData; m.position.set(laneX(p.i, o.lane) + bx, hy, z - o.len / 2 + (o.D - o.D) - 0); m.position.z = p.zc - (s + o.len / 2);
          ud.plane.scale.set(1, o.len, 1); ud.l1.position.z = o.len / 2; ud.l2.position.z = -o.len / 2; ud.warn.position.z = o.len / 2 + 0.6; ud.warn.scale.y = 1; ud.warn.material.opacity = s > 3 ? 0.3 + Math.sin(T * 10) * 0.2 : 0;
        } else if (o.type === 'pad') {
          idx.pad++; m.visible = !p.padUsed.has(o.id) || s > 0; m.position.set(laneX(p.i, o.lane) + bx, hy, z); m.userData.tex.offset.y = -T * 1.4; m.userData.plane.material.opacity = 0.75 + 0.25 * Math.sin(T * 8 + o.id);
        } else if (o.type === 'fire') {
          idx.fire++;
          let ft = p.fireT.get(o.id); if (!ft && s < 40 && s > -2) { ft = { t0: T, burn: false }; p.fireT.set(o.id, ft); }
          m.visible = true; m.position.set(laneX(p.i, o.lane) + bx, hy, z); const ud = m.userData;
          let phase = 0; if (ft) { const t = T - ft.t0; phase = t < 0.9 ? 1 : t < 3.6 ? 2 : 3; ft.burn = phase === 2; }
          ud.warn.visible = phase === 1 || (phase === 0 && s < 70); ud.warn.position.y = 3.2 + Math.sin(T * 12) * 0.2; ud.warn.material.opacity = 1;
          ud.flames.forEach((f, k) => { f.visible = phase === 2; const sc = (0.8 + 0.4 * Math.sin(T * 14 + f.userData.ph)) * (phase === 2 ? 1 : 0); f.scale.set(sc, sc * (1 + 0.3 * Math.sin(T * 9 + k)), sc); });
          ud.base.visible = phase === 2 || phase === 1; ud.base.material.opacity = phase === 2 ? 0.5 + 0.15 * Math.sin(T * 16) : 0.2 + 0.2 * Math.sin(T * 24);
          if (phase === 2 && Math.random() < dt * 40) fx.particles.emit(m.position.x + (Math.random() - 0.5) * 1.5, 0.4, m.position.z + (Math.random() - 0.5) * 9, (Math.random() - 0.5), 2 + Math.random() * 2, 0, { life: 0.6, size: 0.45, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, gravity: -2 });
          if (phase === 1 || phase === 2) p.fireActive = { x: m.position.x, z: m.position.z, burning: phase === 2, s };
          if (phase === 3 && s < -6) { /* voorbij */ }
        } else if (o.type === 'wall') {
          idx.wall++; m.visible = !p.broken.has(o.id); m.position.set(laneX(p.i, o.lane) + bx, hy, z); m.userData.sign.position.y = 3.9 + Math.sin(T * 3) * 0.06;
        }
      }
      for (const k of Object.keys(idx)) { const pool = p.pools[k]; for (let q = idx[k]; q < pool.length; q++) pool[q].visible = false; }
    }

    // ---------------- draak ----------------
    function updateDragon(p, dt) {
      const f = p.fireActive; const dr = p.dragon;
      const want = f ? 6.6 : 15; p.dragonY = damp(p.dragonY, want, f ? 4 : 2, dt);
      const tx = f ? f.x : p.dragonX; p.dragonX = damp(p.dragonX, tx, 5, dt);
      dr.group.visible = p.dragonY < 13.5;
      if (dr.group.visible) {
        const zf = f ? f.z - 4.5 : p.zc - 40;
        dr.group.position.set(p.dragonX, p.dragonY, zf); dr.group.rotation.set(0.35, Math.sin(T * 1.2) * 0.12 + Math.PI * 0 , 0); dr.update(dt);
        dr.group.rotation.y = Math.PI * 0 + Math.sin(T * 0.8) * 0.1;
        // ademhaling
        const burn = f && f.burning;
        p.breath.visible = !!burn;
        if (burn) {
          const mouthY = p.dragonY + 1.4, mouthZ = zf + 2.4, tz = f.z + 1.5, len = Math.hypot(mouthY, tz - mouthZ);
          p.breath.position.set(p.dragonX, mouthY / 2, (mouthZ + tz) / 2); p.breath.scale.set(1.3 + Math.sin(T * 25) * 0.15, len, 1.3); p.breath.rotation.set(Math.atan2(tz - mouthZ, mouthY) * -1 + 0.0, 0, 0);
          p.breath.rotation.set(Math.atan2(tz - mouthZ, mouthY), 0, 0);
          if (Math.random() < dt * 60) fx.particles.emit(p.dragonX + (Math.random() - 0.5) * 0.6, mouthY - Math.random() * mouthY * 0.9, mouthZ + (tz - mouthZ) * Math.random(), (Math.random() - 0.5) * 1.5, -1 + Math.random() * 2, 1, { life: 0.5, size: 0.5, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, gravity: -1 });
        }
        // kop op en neer + kleine gloed bij inademen
        dr.neck.rotation.x = f && !f.burning ? -0.9 : -0.3 + Math.sin(T * 1.6) * 0.1;
        if (f && !p.dragonRoar && f.burning) { audio.sfx('explode', { vol: 0.25, rate: 1.6 }); audio.tone(110, 0.9, { type: 'sawtooth', vol: 0.15, filter: 500, slide: 80 }); p.dragonRoar = true; }
        if (!f || !f.burning) p.dragonRoar = false;
      } else p.breath.visible = false;
    }

    // ---------------- zichtbaarheid van karren ----------------
    function updateCart(p, dt, animate = true) {
      const c = p.cart, ud = c.userData;
      const sc = Math.pow(ctx.pvp.size(p.i), 0.7); p.sizeMul = sc;
      c.scale.setScalar(sc * 1.1);
      const bobS = p.state === 'run' ? Math.sin(T * 30 + p.i) * 0.018 * Math.min(1, p.v / 18) : 0;
      let yy = p.y + bobS; if (p.state === 'fall') yy = Math.min(p.y, 0) ;
      c.position.set(p.x, p.state === 'fall' ? Math.max(-6, p.y) : yy, p.zc);
      p.tilt = damp(p.tilt, clamp(-p.vx * 0.05, -0.35, 0.35), 12, dt);
      p.wob = damp(p.wob, 0, 3, dt);
      c.rotation.set(clamp(-p.vy * 0.012, -0.2, 0.2) + Math.sin(T * 40) * 0.05 * p.wob, Math.sin(T * 33) * 0.06 * p.wob, p.tilt + Math.sin(T * 45) * 0.08 * p.wob);
      if (p.state === 'fall') c.rotation.set(0.5, p.fall * 2, -0.5);
      p.wheelRot += p.v * dt / 0.3; for (const w of ud.wheels) w.rotation.x = p.wheelRot;
      ud.flag.rotation.y = Math.sin(T * 12) * 0.2; ud.cloth.rotation.y = Math.sin(T * 14) * 0.25;
      ud.lamp.rotation.y += dt * 3; ud.lamp.material.emissiveIntensity = 1 + Math.sin(T * 6 + p.i) * 0.3;
      ud.c.faceDir(0, -1); ud.c.speed = 0; ud.c.air = p.y > 0.3 && p.state === 'run'; if (animate) ud.c.update(dt);
      // schaduw
      p.blob.visible = p.state === 'run'; p.blob.position.set(p.x, 0.12, p.zc); p.blob.scale.setScalar(Math.max(0.5, 1.2 - p.y * 0.25) * sc);
      p.tag.visible = true; p.tag.position.set(p.x, 3.7 + (p.state === 'fall' ? Math.max(-8, p.y) : p.y), p.zc); p.tag.visible = p.state !== 'fall' || p.y > -2;
      // turbo-vlam en meter
      const boosting = p.boostT > 0;
      p.flame.visible = boosting; if (boosting) { p.flame.position.set(p.x, 0.7 + p.y, p.zc + 2.2); p.flame.scale.set(1 + Math.sin(T * 40) * 0.12, 1 + Math.sin(T * 33) * 0.25, 1); p.flame.material.color.setHex(p.boostF > 1.54 ? 0x7affea : 0x7ae8ff); }
      p.meter.visible = p.charge > 0.02; p.meter.material.opacity = 0.9; p.meter.position.set(p.x, 0.13, p.zc); p.meter.scale.setScalar(0.9 + p.charge * 0.8); p.meter.material.color.setHSL(0.14 - p.charge * 0.14, 1, 0.55);
      if (boosting && Math.random() < dt * 80) fx.particles.emit(p.x + (Math.random() - 0.5) * 0.8, 0.8 + p.y, p.zc + 1.8, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5), 8 + Math.random() * 8, { life: 0.4, size: 0.4, color: Math.random() < 0.5 ? 0x7affea : 0xffffff, gravity: 0 });
      if (p.burn > 0 && Math.random() < dt * 60) fx.particles.emit(p.x + (Math.random() - 0.5), 0.8 + Math.random() * 1.2, p.zc + (Math.random() - 0.5), 0, 2, 2, { life: 0.5, size: 0.45, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, gravity: -2 });
      // wielvonken (hoge snelheid) op de rails
      if (p.state === 'run' && p.y < 0.05 && p.v > 8 && Math.random() < dt * p.v * 0.9) fx.particles.emit(p.x + (Math.random() < 0.5 ? -0.78 : 0.78), 0.15, p.zc + 0.8, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, p.v * 0.18 + Math.random() * 3, { life: 0.35, size: 0.2, color: Math.random() < 0.6 ? 0xffb02a : 0xfff0a0, gravity: 8 });
      if (p.v > 21 && Math.random() < dt * 10) fx.particles.emit(p.x + (Math.random() - 0.5) * 12, 1 + Math.random() * 7, p.zc - 30, 0, 0, 38, { life: 0.5, size: 0.14, color: 0xcfd8ff, gravity: 0 });
    }

    // ---------------- camera ----------------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3();
    let aspect = 1.7;
    function fitFov() { const hf = 74 * Math.PI / 360; camera.fov = clamp(2 * Math.atan(Math.tan(hf) / aspect) * 180 / Math.PI, 52, 80); camera.updateProjectionMatrix(); }
    function cam(dt, mode) {
      const sway = Math.sin(introT * 0.3 + T * 0.2);
      let pos, look, roll = 0;
      if (mode === 'intro') { const k = 0.5 + 0.5 * Math.sin(introT * 0.45); pos = [sway * 5, 4.5 + k * 3, 16 - k * 3]; look = [0, 1.5, -18]; }
      else if (mode === 'result') { pos = [sway * 2, 6.0, 13.5]; look = [0, 1.2, -14]; }
      else {
        const lead = Math.abs(pl[0].d - pl[1].d) > 25 ? 0.8 : 0.4;
        pos = [B.bx(10) * 0.5 + sway * 0.25, 6.9 + B.hy(8) * 0.4, 12.4 + (pl[0].v + pl[1].v) * 0.012]; look = [B.bx(28) * 0.35, 1.2 + B.hy(30) * 0.45, -16]; roll = -B.cx * 28;
      }
      if (!camP.lengthSq()) { camP.set(...pos); camL.set(...look); }
      const f = 1 - Math.exp(-4 * dt);
      camP.set(lerp(camP.x, pos[0], f), lerp(camP.y, pos[1], f), lerp(camP.z, pos[2], f)); camL.set(lerp(camL.x, look[0], f), lerp(camL.y, look[1], f), lerp(camL.z, look[2], f));
      camera.position.copy(camP); camera.up.set(Math.sin(roll), Math.cos(roll), 0); camera.lookAt(camL);
    }

    // ---------------- wereld bijwerken ----------------
    function world(dt, mode) {
      const dAvg = (pl[0].d + pl[1].d) / 2;
      const intensity = mode === 'play' ? smoothstep(2, 9, T) : 0;
      B.update(T * 0.9 + 3, intensity);
      for (const p of pl) {
        p.zc = clamp((dAvg - p.d) * 0.22, -5, 5);
        Mw.updateTrack(p.i, p.d, p.zc);
        showObstacles(p, dt);
        updateDragon(p, dt);
        // finishboog
        const a = arches[p.i]; const s = COURSE - p.d; a.visible = s > S0 - 6 && s < VIEW; a.position.set(laneX(p.i, 1) + B.bx(s), B.hy(s), p.zc - s);
        updateCart(p, dt, mode !== 'frozen');
      }
      Mw.updateDecor(dAvg, T + introT, 0);
      station.position.set(0, B.hy(-dAvg) * 0, 0 + dAvg); station.visible = dAvg < 40;
    }

    // ---------------- hoofd-update ----------------
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt;
      for (const p of pl) {
        const q = pl[1 - p.i];
        // comeback: achterligger krijgt een licht snelheidsvoordeel
        const behind = q.d - p.d; p.rubber = 1 + clamp(behind / 400, 0, 0.05);
        if (p.stunT > 0) p.stunT -= dt;
        const d0 = p.d;
        if (!p.finished) control(p, dt);
        physics(p, dt);
        if (!p.finished) collisions(p, d0, p.d);
        maybeSpawnExtras(p);
        while (p.scan < course.length && course[p.scan].D + (course[p.scan].len || 0) + 9 < p.d - 14) p.scan++;
        if (!p.finished && p.d >= COURSE) {
          p.finished = true; p.crossT = T - (p.d - COURSE) / Math.max(1, p.v);
          finishOrder.push(p.i); audio.sfx('win', { vol: 0.7 });
          if (finishOrder.length === 1) { atFinish = [Math.min(COURSE, Math.round(pl[0].d)), Math.min(COURSE, Math.round(pl[1].d))]; atFinish[p.i] = COURSE; hud.showBig('FINISH!', 1400, '#ffe14a'); hud.toast(`${names[p.i]} is als eerste binnen!`, 2200); endAt = T + 2.6; }
          p.cart.userData.c.pose = 'cheer';
        }
      }
      world(dt, 'play');
      cam(dt, 'play');
      refreshHud();
      if (finishOrder.length === 2) endAt = Math.min(endAt, T + 0.6);
      if (T > MAX_T && endAt < 0) endAt = T;
      if (endAt >= 0 && T >= endAt) finishRace();
    }
    function finishRace() {
      if (done) return; done = true;
      let w = null;
      const a = pl[0], b = pl[1];
      if (a.finished && b.finished) w = a.crossT < b.crossT ? 0 : 1;
      else if (a.finished) w = 0; else if (b.finished) w = 1;
      else if (Math.abs(a.d - b.d) > 1) w = a.d > b.d ? 0 : 1;
      const sc = atFinish || [Math.round(Math.min(COURSE, a.d)), Math.round(Math.min(COURSE, b.d))];
      pl.forEach((p, i) => { p.cart.userData.c.pose = i === w ? 'cheer' : 'sad'; });
      const gap = Math.abs(sc[0] - sc[1]);
      const champ = w != null ? names[w] : null, other = w != null ? names[1 - w] : null;
      const jokes = champ ? [
        `${champ} raast als een kristal-komeet over de finish! ${other} stond nog ${gap} m te zwoegen.`,
        `${champ} wint de Mijnkar-Race${gap < 25 ? ' op het nippertje!' : '!'} ${other} heeft zijn kar nog vol stof.`,
        `Wat een snelheid, ${champ}! Zelfs de draak moest er een keer van niezen.`,
        `${champ} pakte de snelste rails. ${other} zag de brokkelmuur te laat...`,
      ] : ['Precies gelijk! De kristallen weten niet wie er won.'];
      for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst(rand(-6, 6), 5 + rand(0, 3), -4 + rand(-3, 3), { count: 36, speed: 7, up: 1.2, life: 1.5, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 250);
      ctx.finishPvp({ winner: w, score: sc, delay: 1300, summary: `${pick(jokes)}<br><small>Pads: ${pl[0].stats.pads} - ${pl[1].stats.pads} · Snelweg: ${pl[0].stats.walls} - ${pl[1].stats.walls}</small>` });
    }
    function resultUpdate(dt) { T += dt; for (const p of pl) { p.v = damp(p.v, p.finished ? 6 : 0, 2, dt); p.d += p.v * dt * 0.5; } world(dt, 'result'); cam(dt, 'result'); }
    function introUpdate(dt) { introT += dt; pl.forEach((p) => { p.cart.userData.c.pose = 'push'; p.v = 0; }); world(dt, 'intro'); cam(dt, 'intro'); }

    pl.forEach((p) => { p.rubber = 1; p.stunT = 0; });
    aspect = (ctx.renderer.domElement.width || 1100) / (ctx.renderer.domElement.height || 650); fitFov();
    introUpdate(0.016); refreshHud();
    return {
      update, resultUpdate, introUpdate,
      onStart() { startT = T; refreshHud(); },
      onCountdown() { refreshHud(); },
      onResize(w, h) { aspect = w / h; fitFov(); },
      onSwap(sw) { for (const p of pl) { fx.particles.burst(p.x, 1.6, p.zc, { count: 26, speed: 5, up: 1.2, life: 0.7, size: 0.35, colors: [0xffe14a, 0xff9ad5, 0x9fe4ff], gravity: 3 }); fx.texts.add('WISSEL!', p.x, 3.8, p.zc, '#ffe14a', 1.0); } },
      onDeurman(movers) { movers.forEach((m, i) => { if (!m) return; const p = pl[i]; p.stunT = 1.6; say(p, 'BEWOOOG!', '#ff5a5a', 1.2); audio.sfx('hurt', { vol: 0.5 }); p.cart.userData.c.pose = 'scared'; setTimeout(() => { if (!done) p.cart.userData.c.pose = 'push'; }, 1600); }); },
      celebrate(w) { pl.forEach((p, i) => { p.cart.userData.c.pose = i === w ? 'cheer' : 'sad'; }); },
      dispose() {},
      dbg: {
        state: () => ({ T, done, finished: pl.map((p) => p.finished), finishOrder, d: pl.map((p) => p.d), v: pl.map((p) => p.v), lane: pl.map((p) => p.lane), x: pl.map((p) => p.x), y: pl.map((p) => p.y), st: pl.map((p) => p.state), boost: pl.map((p) => p.boostT), charge: pl.map((p) => p.charge), hits: pl.map((p) => p.hits), stats: pl.map((p) => p.stats), inv: pl.map((p) => p.inv), slow: pl.map((p) => p.slowT) }),
        players: pl, course, near: (i, lo, hi) => obstaclesNear(pl[i], pl[i].d + lo, pl[i].d + hi), hurt, boost, finishRace, B, T: () => T,
        sparkX: (o, i) => laneX(i, 1) + (o.c + o.amp * Math.sin(T * TAU / o.period + o.ph) - 1) * RAIL_GAP, rockTh: (o) => 0.56 * Math.sin(T * TAU / o.period + o.ph),
        fireBurn: (i, id) => { const f = pl[i].fireT.get(id); return f ? (f.burn ? 2 : (T - f.t0 < 0.9 ? 1 : 3)) : 0; },
      },
    };
  },
};

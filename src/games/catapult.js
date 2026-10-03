import * as THREE from 'three';
import { clamp, lerp, damp, rand, pick, TAU, mat, mesh } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';
import { Body, World, buildCastle, MATS } from './catapult_phys.js';
import { buildLandscape, makeFlag, makeCatapult, BlockField, AMMO, makeProjMesh, makeKing, makeFlyingDragon, makeBalloonChest, labelSprite, windSprite, ammoSprite } from './catapult_world.js';

// Kasteelbelegering — twee katapulten, twee kastelen van hout/steen/glas met een koning erin. Tegelijk schieten (geen beurten!).
//  * ↑/↓ = hoek, A ingedrukt = kracht, loslaten = schieten (laadtijd ±2,5 s), B = andere munitie (ingedrukt houden = repareren)
//  * koning geraakt of zijn torentje stort in = verloren; na 90 s wint het kasteel met de minste schade
//  * gimmicks: wind, een draak die projectielen opvreet en vuur spuwt (op de leider), ballonkist met bonus, reparatie als comeback

const MATCH_TIME = 90;
const CX = [-24, 24];             // kasteelmidden
const CAT_X = [-9, 9];            // katapult
const PIVOT_Y = 3.0, ARM = 3.4;
const A_MIN = 0.17, A_MAX = 1.42;
const CHARGE_T = 1.5;
const WIND_MAX = 8, WIND_K = 0.35;
const SUBSTEP = 1 / 120;

export default {
  id: 'catapult',
  name: 'Kasteelbelegering',
  giver: 'Burchtheer Bonk',
  icon: '🏰',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Twee kastelen, twee <b>katapulten</b> en in elk kasteel een bange <b>koning</b>. Schiet <b>tegelijk</b>, stort zijn torentje in of raak de koning! Pas op voor <b>wind</b>, <b>draak</b> en <b>ballonkist</b>.',
  controls: ['{move} hoek (omhoog/omlaag)', '{a} houden = kracht, loslaten = schieten', '{b} munitie (houden = repareren)'],
  tip: 'Taart = glad, vuurbal = brand, kip = stuiter. Wie achterstaat mag repareren!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const GM = pv.gravity || 1;                       // zwaartekrachtfactor
    const VK = Math.sqrt(GM);                         // lanceersnelheid mee-schalen: zelfde banen, alleen trager
    const SLIP = pv.slip || 0;
    ctx.lights('day', { shadow: 46, center: [0, 8, 0], fogNear: 120, fogFar: 330 });
    camera.fov = 38; camera.updateProjectionMatrix();
    const land = buildLandscape(scene);

    // ---------------- natuurkunde ----------------
    const world = new World({ gravity: 20 * GM, iters: 10 });
    const evq = [];
    world.onImpact = (A, B, s, x, y, nx, ny) => { if (evq.length < 80) evq.push({ A, B, s, x, y, nx, ny }); };
    const groundB = world.add(new Body({ static: true, w: 400, h: 20, x: 0, y: -10, mu: 0.8 * (1 - SLIP * 0.55) }));
    groundB.user = { kind: 'ground' };
    const field = new BlockField(scene, 64);
    const entries = [];            // {side, mat, idx, w, h, body, slot}
    const castles = [0, 1].map((i) => {
      const c = buildCastle(world, CX[i], i === 0 ? 1 : -1, 1 - SLIP * 0.6);
      for (const b of c.blocks) { b.user.side = i; entries.push({ side: i, mat: b.user.mat, idx: field.alloc(b.user.mat), w: b.user.w, h: b.user.h, body: b, area: b.user.w * b.user.h }); b.user.entry = entries[entries.length - 1]; }
      c.king.user.side = i; c.king.user.startY = c.king.y;
      return c;
    });
    const totalArea = [0, 1].map((i) => entries.filter((e) => e.side === i).reduce((a, e) => a + e.area, 0));

    // ---------------- visuals: kasteelversiering ----------------
    const flags = [], kings = [];
    castles.forEach((c, i) => {
      const f = makeFlag(i ? 0x3a78e0 : 0x2f9e5b); scene.add(f); flags.push(f);
      const kg = makeKing(i ? 0x3a78e0 : 0x2f9e5b); scene.add(kg.holder); kings.push(kg);
      kg.c.faceDir(0, 1);
    });
    const wsprite = windSprite(); wsprite.position.set(0, 27.5, 3); scene.add(wsprite);

    // ---------------- spelers / katapulten ----------------
    const cats = [], ops = [];
    const CSS = players.map((p) => p.css);
    const colorsHex = [0x2f9e5b, 0x3a78e0];
    const ST = players.map((pp, i) => {
      const dir = i === 0 ? 1 : -1;
      const cat = makeCatapult(colorsHex[i]); cat.position.set(CAT_X[i], 0, 0); cat.rotation.y = i === 0 ? 0 : Math.PI; scene.add(cat); cats.push(cat);
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group);
      const k = (3.5 * lerp(1, pv.size(i), 0.5)) / c.height; holder.scale.setScalar(k); holder.position.set(CAT_X[i] - dir * 3.9, 0, 1.8); scene.add(holder);
      c.faceDir(dir, 0.3); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; ops.push({ c, holder });
      const tag = labelSprite(pp.name, pp.css, 4.6); tag.position.set(CAT_X[i] - dir * 3.9, 3.5 * 1.25 * lerp(1, pv.size(i), 0.5) + 1.2, 1.8); scene.add(tag);
      // kracht/laadbalk
      const bar = new THREE.Group(); bar.position.set(CAT_X[i], 8.4, 2.2);
      const bg = mesh(new THREE.PlaneGeometry(6.2, 0.95), new THREE.MeshBasicMaterial({ color: 0x120a22, transparent: true, opacity: 0.8, depthTest: false }), { cast: false, receive: false }); bg.renderOrder = 12;
      const fill = mesh(new THREE.PlaneGeometry(6.0, 0.7), new THREE.MeshBasicMaterial({ color: 0x8dff6a, depthTest: false }), { cast: false, receive: false }); fill.renderOrder = 13; fill.position.z = 0.01;
      bar.add(bg, fill); scene.add(bar);
      const am = ammoSprite(pp.css); am.position.set(CAT_X[i], 10.9, 2.2); scene.add(am);
      const rep = labelSprite('REPAREER!', '#ffe14a', 4.4); rep.position.set(CAT_X[i], 12.6, 2.2); rep.visible = false; scene.add(rep);
      // richtstippen
      const N = 22, pp3 = new Float32Array(N * 3);
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp3, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: colorsHex[i] === 0x2f9e5b ? 0x9dffb8 : 0xa6c6ff, size: 0.8, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false })); pts.renderOrder = 11; pts.frustumCulled = false; scene.add(pts);
      return { i, dir, cat, c, holder, tag, bar, fill, am, rep, pts, pp3, N, aim: 0.78, power: 0, charging: false, cd: 2.0, cdMax: 2.0, arm: Math.PI + 0.25, armT: 0, swing: 0, ammo: 0, mega: false, rapid: 0, tokens: 0, lastTok: 100, bDown: false, bT: 0, bUsed: false, repP: 0, stuck: 0, shots: 0, hits: 0, comeback: 0, pct: 100, lastAmmoDraw: -1 };
    });
    const flagPos = (i) => { const top = castles[i].blocks.find((b) => b.user.sy === 7.9 && b.alive); return top; };

    // ---------------- toestand ----------------
    let T = 0, started = false, finished = false, ended = false, endT = 0, timeScale = 1, introT = 0;
    let wind = 0, windTarget = 0, windT = 3;
    const projs = [];
    const stats = { shots: [0, 0], blocks: [0, 0], balloons: 0, dragons: 0, bonus: [0, 0], repairs: [0, 0], hitKing: 0 };
    let result = null;
    const dragon = { on: false, t: 0, dir: 1, y: 17, target: 0, breathed: false, mesh: makeFlyingDragon(), next: 17 + Math.random() * 6, breath: 0 };
    dragon.mesh.g.visible = false; scene.add(dragon.mesh.g);
    const balloon = { on: false, x: 0, y: 14, t: 0, life: 0, mesh: makeBalloonChest(), next: 12 + Math.random() * 5 };
    balloon.mesh.visible = false; scene.add(balloon.mesh);
    const projMeshes = AMMO.map((a) => Array.from({ length: 6 }, () => { const m = makeProjMesh(a.id); m.visible = false; scene.add(m); return m; }));
    const projColor = new THREE.Color();

    const pctOf = (i) => { let s = 0; for (const e of entries) if (e.side === i && e.body && e.body.alive) s += (e.body.user.hp / e.body.user.maxHp) * e.area; return Math.round(s / totalArea[i] * 100); };
    const kingHp = (i) => castles[i].king.user.hp;
    function refreshHud() {
      hud.setScore(`${names[0]} ${ST[0].pct}%  –  ${ST[1].pct}% ${names[1]}`);
    }
    function infoTxt(p) { const a = AMMO[p.ammo]; return `${a.name}${p.mega ? ' MEGA' : ''} · ${Math.round(p.aim * 180 / Math.PI)}°${p.tokens ? ` · 🔧×${p.tokens}` : ''}${p.rapid > 0 ? ' · ⚡' : ''}`; }

    // ---------------- helpers ----------------
    const sfx = (n, o) => audio.sfx(n, o);
    function windAccel(pr) { return wind * WIND_K * AMMO[pr.user.t].windK * (pr.user.mega ? 0.6 : 1); }
    function breakBlock(b, by) {
      const u = b.user; const e = u.entry; if (!b.alive) return;
      world.remove(b); if (e) { e.body = null; field.hide(e.mat, e.idx); }
      stats.blocks[u.side]++;
      const cols = u.mat === 'wood' ? [0x9a6a3a, 0xc08a52, 0x6b4a2e] : u.mat === 'stone' ? [0x8a8a92, 0xb0b0b8, 0x6a6a72] : [0xcff4ff, 0x8fdcff, 0xffffff];
      fx.particles.burst(b.x, b.y, 1.6, { count: 12 + Math.round(u.w * u.h * 3), speed: 7, up: 1.1, life: 1.0, size: u.mat === 'glass' ? 0.35 : 0.5, colors: cols, gravity: 14 });
      sfx(u.mat === 'glass' ? 'pop' : u.mat === 'stone' ? 'thud' : 'wood', { vol: 0.7, rate: u.mat === 'glass' ? 2.2 : 0.9 });
      if (u.mat === 'glass') sfx('ding', { vol: 0.25, rate: 1.8 });
      if (u.w * u.h > 2.5 || u.mat === 'glass') fx.texts.add(u.mat === 'glass' ? 'KLINK!' : u.mat === 'stone' ? 'BONK!' : 'KRAK!', b.x, b.y + 1.5, 3, u.mat === 'glass' ? '#9fe8ff' : '#ffd24a', 1.2);
      ctx.shake(u.mat === 'stone' ? 0.3 : 0.18);
    }
    function dmgBlock(b, d) {
      if (!b.alive || d <= 0) return;
      const u = b.user; if (u.kind === 'king') { u.hp -= d; return; }
      u.hp -= d; if (u.hp <= 0) breakBlock(b);
    }
    function ignite(b) { const u = b.user; if (u.kind === 'block' && MATS[u.mat].burn && u.burn <= 0 && b.alive) { u.burn = 6; fx.particles.burst(b.x, b.y, 1.6, { count: 8, speed: 3, up: 1.5, life: 0.6, size: 0.5, colors: [0xff7a1a, 0xffd23f], gravity: -2 }); } }
    function igniteArea(x, y, r) { for (const b of world.bodies) if (b.user && b.user.kind === 'block' && Math.hypot(b.x - x, b.y - y) < r + b.rad * 0.5) ignite(b); }
    function splat(x, y) {
      fx.particles.burst(x, y, 2, { count: 36, speed: 8, up: 1.0, life: 1.1, size: 0.65, colors: [0xffffff, 0xff8ac0, 0xffe0f0, 0xe8b878], gravity: 10 });
      fx.texts.add('SPLAT!', x, y + 2, 3, '#ff8ac0', 1.5); sfx('splash', { vol: 0.7 }); ctx.shake(0.2);
      world.query(x, y, 3.4, (b) => { if (b.user && b.user.kind === 'block') { b.user.slick = 14; b.mu = 0.05; b.wake(); } });
      world.blast(x, y, 3.6, 14);
    }
    function explodeFire(x, y) {
      fx.particles.burst(x, y, 2, { count: 40, speed: 9, up: 1.0, life: 0.9, size: 0.7, colors: [0xff7a1a, 0xffd23f, 0xff3a0a, 0x442200], gravity: 2 });
      fx.particles.ring(x, y, 2, { count: 22, speed: 10, color: 0xffc040, size: 0.5, life: 0.5 });
      fx.texts.add('POEF!', x, y + 2, 3, '#ff9a3a', 1.4); sfx('explode', { vol: 0.7 }); ctx.shake(0.35);
      igniteArea(x, y, 2.6); world.blast(x, y, 3.4, 30);
      world.query(x, y, 2.6, (b, d) => { if (b.user && b.user.kind === 'block') dmgBlock(b, 16 * (1 - d / 3.4)); });
    }
    function killProj(pr, poof = true) {
      if (!pr.alive) return; const u = pr.user;
      if (poof) fx.particles.burst(pr.x, pr.y, 1.8, { count: 8, speed: 3, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xcccccc], gravity: 4 });
      world.remove(pr); u.mesh.visible = false; const k = projs.indexOf(pr); if (k >= 0) projs.splice(k, 1);
    }
    function kingHitBy(side, how, pr) { if (ended) return; endGame(1 - side, how, pr ? AMMO[pr.user.t].name : ''); }

    // ---------------- inslag verwerken ----------------
    const kind = (b) => (b.user ? b.user.kind : 'ground');
    const dbgLog = [];
    function handleImpact(ev) {
      const { A, B, s, x, y } = ev;
      if (s > 2.5) { dbgLog.push(`T${T.toFixed(1)} ${A.user ? A.user.kind + (A.user.mat || A.user.t || '') : 'ground'}~${B.user ? B.user.kind + (B.user.mat || B.user.t || '') : 'ground'}@${x.toFixed(1)},${y.toFixed(1)} s${s.toFixed(0)}`); if (dbgLog.length > 300) dbgLog.shift(); }
      if (!A.alive || !B.alive) return;
      const ka = kind(A), kb = kind(B);
      if (ka === 'proj' || kb === 'proj') {
        const pr = ka === 'proj' ? A : B, o = ka === 'proj' ? B : A, ko = kind(o);
        if (ko === 'proj') { if (s > 3) { fx.particles.burst(x, y, 2, { count: 14, speed: 5, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xffe14a], gravity: 6 }); fx.texts.add('KLETS!', x, y + 1.5, 3, '#fff', 1.0); sfx('hit', { vol: 0.5 }); } return; }
        const t = pr.user.t, am = AMMO[t];
        pr.user.touch = (pr.user.touch || 0) + 1;
        if (ko === 'king') { if (s > 2.5) { stats.hitKing++; const ks = o.user.side; fx.particles.burst(o.x, o.y, 2, { count: 40, speed: 8, up: 1.2, life: 1.0, size: 0.6, colors: [0xffe14a, 0xffffff, 0xff6a3a], gravity: 8 }); kingHitBy(ks, 'direct', pr); } return; }
        if (ko === 'block') {
          const ob = o.user;
          if (s > 3 && pr.user.owner !== undefined) { const mm = Math.min(pr.mass, 8); const boost = 1 + ST[pr.user.owner].comeback; dmgBlock(o, (s - 3) * mm * 0.5 * am.dmg * boost * (pr.user.mega ? 1 : 1)); if (ob.side !== pr.user.owner || true) ST[pr.user.owner].hits++; }
          if (s > 4) { sfx(ob.mat === 'stone' ? 'thud' : 'wood', { vol: clamp(s / 30, 0.2, 0.8), rate: 0.8 + Math.random() * 0.4 }); if (s > 12) fx.particles.burst(x, y, 2, { count: 6 + Math.round(s / 4), speed: 4 + s / 8, up: 0.8, life: 0.5, size: 0.4, colors: ob.mat === 'wood' ? [0xc08a52, 0xffffff] : [0xcccccc, 0xffffff], gravity: 10 }); }
          if (t === 1) { if (pr.alive) { splat(x, y); killProj(pr, false); } }
          else if (t === 2) { if (pr.alive) { explodeFire(x, y); killProj(pr, false); } }
          else if (t === 3 && s > 5) { sfx('boing', { vol: 0.3, rate: 1.5 }); audio.tone(500 + Math.random() * 300, 0.12, { type: 'square', vol: 0.1, slide: -250 }); fx.texts.add('KO-KO!', x, y + 1.6, 3, '#fff6c0', 0.9); }
          else if (t === 0 && s > 14) { world.blast(x, y, 2.2, 8); }
        } else if (ko === 'ground') {
          if (s > 4) { fx.particles.dust(x, 0.2, 2, 10, 0xa88860); sfx('thud', { vol: clamp(s / 30, 0.15, 0.6), rate: 0.7 }); }
          if (t === 1 && pr.alive && s > 2) { splat(x, 0.3); killProj(pr, false); }
          else if (t === 2 && pr.alive && s > 4) { explodeFire(x, 0.8); killProj(pr, false); }
          else if (t === 3 && s > 5) { audio.tone(450 + Math.random() * 300, 0.12, { type: 'square', vol: 0.1, slide: -250 }); }
        }
        return;
      }
      // blokken / koning / grond onderling
      if (s < 4) return;
      const bk = (b) => (kind(b) === 'ground' ? 4 : Math.min(8, b.mass));
      if (ka === 'king' || kb === 'king') {
        const kg = ka === 'king' ? A : B, o = ka === 'king' ? B : A;
        if (kind(o) === 'ground') return;
        const d = (s - 3.5) * bk(o) * 0.9; if (d > 0) { kg.user.hp -= d; fx.particles.burst(kg.x, kg.y, 2, { count: 6, speed: 3, up: 1, life: 0.4, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 6 }); if (d > 5) { sfx('hurt', { vol: 0.4, rate: 1.4 }); fx.texts.add('AU!', kg.x, kg.y + 2, 3, '#ff8a6a', 1.1); } }
        return;
      }
      for (const [self, other] of [[A, B], [B, A]]) if (kind(self) === 'block') { const d = (s - 5) * bk(other) * 0.25; if (d > 0) dmgBlock(self, d); }
      if (s > 9) { sfx('thud', { vol: clamp(s / 40, 0.1, 0.5), rate: 0.9 + Math.random() * 0.3 }); }
    }

    // ---------------- schieten ----------------
    function launchVel(p, power) { return (14 + 28 * power) * VK; }
    function fire(i, power, aim = ST[i].aim, ammoIdx = ST[i].ammo) {
      const p = ST[i], am = AMMO[ammoIdx];
      const mega = p.mega; p.mega = false;
      const sz = lerp(1, pv.size(i), 0.5); const rr = am.r * (mega ? 1.55 : 1) * sz; const mass = am.mass * (mega ? 2.6 : 1) * sz * sz;
      const af = 0.9; const x0 = CAT_X[i] + p.dir * ARM * Math.cos(af), y0 = PIVOT_Y + ARM * Math.sin(af);
      const b = new Body({ shape: 'circle', r: rr, mass, x: x0, y: y0, mu: 0.5, e: am.e });
      const v = launchVel(p, power);
      b.vx = p.dir * Math.cos(aim) * v; b.vy = Math.sin(aim) * v; b.av = -p.dir * 6 * (am.id === 'chicken' ? 2 : 1); b.noSleep = true; b.damp = 0.03; b.roll = am.id === 'chicken' ? 0.8 : 1.6;
      const pm = projMeshes[ammoIdx].find((m) => !m.visible) || projMeshes[ammoIdx][0]; pm.visible = true; pm.scale.setScalar(rr / am.r);
      b.user = { kind: 'proj', t: ammoIdx, owner: i, mega, mesh: pm, age: 0, rest: 0, touch: 0, trail: 0 };
      world.add(b); projs.push(b);
      p.cd = p.cdMax = am.cd / (pv.speed(i) * (p.rapid > 0 ? 2 : 1)); p.swing = 0.14; p.power = 0; p.charging = false; p.shots++; stats.shots[i]++;
      ops[i].c.swing();
      sfx('whoosh', { vol: 0.5, rate: 0.8 }); sfx('throw', { vol: 0.5 }); audio.tone(110, 0.25, { type: 'triangle', vol: 0.25, slide: -60 });
      fx.particles.burst(x0, y0, 2, { count: 14, speed: 5, up: 0.6, life: 0.5, size: 0.5, colors: [0xffffff, 0xd8c8a8], gravity: 4 });
      ctx.shake(0.12 + power * 0.1);
      return b;
    }
    function cycleAmmo(i) { const p = ST[i]; p.ammo = (p.ammo + 1) % AMMO.length; sfx('click', { vol: 0.5, rate: 1.2 }); fx.texts.add(AMMO[p.ammo].name.toUpperCase(), CAT_X[i], 13.4, 2.4, AMMO[p.ammo].col, 1.3); }
    function repair(i) {
      const p = ST[i]; let n = 0;
      const lost = entries.filter((e) => e.side === i && !e.body).sort((a, b) => a.proto.sy - b.proto.sy);
      if (!lost.length) { fx.texts.add('Niks stuk!', CX[i], 6, 3, '#fff', 1.0); p.tokens++; return; }
      for (const e of lost) {
        if (n >= 3) break;
        const u = e.proto; if (!u) continue;
        let y = u.sy + u.h / 2 + 0.15, x = u.cx + u.sx * u.dir;
        for (let k = 0; k < 14; k++) { let hit = false; for (const b of world.bodies) if (!b.static && Math.abs(b.x - x) < (b.hw || b.r) + u.w / 2 && Math.abs(b.y - y) < (b.hh || b.r) + u.h / 2) { hit = true; break; } if (!hit) break; y += 0.9; }
        const m = MATS[u.mat];
        const b = new Body({ w: u.w, h: u.h, x, y, density: m.density, mu: u.mu0, user: { ...u, hp: m.hp, maxHp: m.hp, burn: 0, slick: 0, entry: e } });
        world.add(b); e.body = b; n++;
        fx.particles.burst(x, y, 2, { count: 16, speed: 4, up: 1, life: 0.8, size: 0.5, colors: [0xffe14a, 0xffffff, 0x9fe8ff], gravity: -1 });
      }
      stats.repairs[i] += n;
      fx.texts.add('GEREPAREERD!', CX[i], 11, 3, '#8dff6a', 1.6); sfx('powerup', { vol: 0.7 }); sfx('wood', { vol: 0.6 });
      ops[i].c.pose = 'cheer'; setTimeout(() => { if (!finished) ops[i].c.pose = 'carry'; }, 900);
    }
    // sla de sjablonen op zodat blokken later hersteld kunnen worden
    for (const e of entries) e.proto = { ...e.body.user, entry: null };

    // ---------------- einde ----------------
    function endGame(winner, how, what) {
      if (ended) return; ended = true; endT = 0; result = { winner, how, what };
      timeScale = 0.3;
      const loser = 1 - winner;
      ops[winner].c.pose = 'cheer'; ops[loser].c.pose = 'sad';
      hud.setTimer(null);
      const msg = how === 'time' ? 'TIJD OM!' : how === 'direct' ? 'KONING GERAAKT!' : how === 'fall' ? 'TORENTJE INGESTORT!' : 'KONING PLATGEDRUKT!';
      hud.showBig(msg, 2200, '#ff6a4a'); sfx('explode', { vol: 0.7 }); sfx('bell', { vol: 0.6 });
      ctx.shake(0.8);
      const ck = castles[loser].king;
      fx.particles.burst(ck.x, ck.y, 2.5, { count: 60, speed: 10, up: 1.2, life: 1.4, size: 0.7, colors: [0xffe14a, 0xffffff, 0xff6a3a, 0xff6fa5], gravity: 6 });
      fx.texts.add(how === 'time' ? 'TIJD!' : 'AU AU AU!', ck.x, ck.y + 3, 3, '#ffe14a', 2.0);
    }
    function finishGame() {
      if (finished) return; finished = true;
      const w = result.winner, l = 1 - w;
      const how = result.how;
      const joke = how === 'direct' ? [`Een ${result.what.toLowerCase()} op de kroon! De koning van ${names[l]} ziet sterretjes.`, `${names[l]}s koning werd vol geraakt en tolt als een tol door zijn eigen kasteel.`]
        : how === 'fall' ? [`Het torentje van ${names[l]} stortte in. De koning viel van zijn troon (en zijn trap).`, `Alles stortte in bij ${names[l]}! De koning zit nu in de kelder.`]
          : how === 'crush' ? [`De koning van ${names[l]} werd door zijn eigen dak geplet. Au!`]
            : [`Tijd om! Het kasteel van ${names[w]} stond er nog het best bij (${ST[w].pct}% tegen ${ST[l].pct}%).`, `Na 90 seconden bouwwerkzaamheden won ${names[w]} met het mooiste kasteel.`];
      ctx.finishPvp({ winner: w, score: [ST[0].pct, ST[1].pct], delay: 600, summary: `${pick(joke)} ${stats.shots[0] + stats.shots[1]} schoten, ${stats.blocks[0] + stats.blocks[1]} blokken kapot.${stats.balloons ? ` ${stats.balloons} ballonkist(en) leeggeschoten.` : ''}` });
    }
    function timeUp() {
      const a = ST[0].pct, b = ST[1].pct; let w;
      if (a !== b) w = a > b ? 0 : 1; else if (Math.abs(kingHp(0) - kingHp(1)) > 0.5) w = kingHp(0) > kingHp(1) ? 0 : 1; else w = Math.random() < 0.5 ? 0 : 1;
      endGame(w, 'time');
    }

    // ---------------- spelers bijwerken ----------------
    function inputPlayer(p, dt) {
      const i = p.i, inp = pv.input(i), sp = pv.speed(i);
      if (p.stuck > 0 && p.cd > 0) { /* klef: extra wachten zit al in cd */ }
      // richten
      const up = -inp.y; if (Math.abs(up) > 0.15) p.aim = clamp(p.aim + up * dt * 0.95 * sp, A_MIN, A_MAX);
      p.rapid = Math.max(0, p.rapid - dt);
      // laden
      p.cd = Math.max(0, p.cd - dt);
      if (p.cd <= 0) {
        if (inp.a) { if (!p.charging) { p.charging = true; p.power = 0; sfx('click', { vol: 0.4, rate: 0.8 }); } p.power = Math.min(1, p.power + dt * sp / CHARGE_T); }
        else if (p.charging) fire(i, Math.max(0.12, p.power));
      } else { p.charging = false; p.power = 0; }
      // B: munitie / repareren
      if (inp.bP) { if (p.tokens === 0) cycleAmmo(i); else { p.bDown = true; p.bT = 0; p.bUsed = false; } }
      if (p.bDown) {
        if (inp.b) { p.bT += dt; if (p.bT > 0.4 && !p.bUsed) { p.repP += dt / 0.9; if (p.repP >= 1) { p.repP = 0; p.bUsed = true; p.tokens--; repair(i); } } }
        else { if (!p.bUsed && p.bT < 0.4) cycleAmmo(i); p.bDown = false; p.repP = 0; }
      }
      // comeback: herstelpunten + schadebonus
      const pct = p.pct;
      if (pct <= p.lastTok - 18 && p.tokens < 3) { p.tokens++; p.lastTok = pct; fx.texts.add('REPARATIE!', CX[i], 12, 3, '#ffe14a', 1.4); hud.toast(`${names[i]} mag repareren! Houd B ingedrukt.`, 2200); sfx('powerup', { vol: 0.5 }); }
      else if (pct <= p.lastTok - 18) p.lastTok = pct;
      p.comeback = ST[1 - i].pct - pct >= 25 ? 0.25 : 0;
    }

    // ---------------- evenementen ----------------
    function startDragon() {
      if (dragon.on) return; dragon.on = true; dragon.t = 0; dragon.dir = Math.random() < 0.5 ? 1 : -1; dragon.y = 15 + Math.random() * 5; dragon.breathed = false; dragon.breath = 0; stats.dragons++;
      const a = ST[0].pct, b = ST[1].pct; dragon.target = Math.abs(a - b) >= 3 ? (a > b ? 0 : 1) : (Math.random() < 0.5 ? 0 : 1);
      dragon.mesh.g.visible = true; hud.toast('🐉 Een draak vliegt over! Hij eet projectielen en spuwt vuur op de leider!', 2600); sfx('creak', { vol: 0.6 }); audio.tone(90, 0.8, { type: 'sawtooth', vol: 0.2, slide: 60 });
    }
    function startBalloon() {
      balloon.on = true; balloon.x = (Math.random() - 0.5) * 16; balloon.y = 12 + Math.random() * 7; balloon.t = 0; balloon.life = 13; balloon.vx = (Math.random() - 0.5) * 1.5; balloon.mesh.visible = true; balloon.mesh.position.set(balloon.x, balloon.y, 0);
      hud.toast('🎈 Een ballonkist! Schiet hem kapot voor een bonus.', 2200); sfx('sparkle', { vol: 0.6 });
    }
    function balloonPop(owner) {
      balloon.on = false; balloon.mesh.visible = false; stats.balloons++; stats.bonus[owner]++;
      const p = ST[owner]; const r = Math.random();
      fx.particles.burst(balloon.x, balloon.y + 2, 2, { count: 50, speed: 8, up: 1.2, life: 1.3, size: 0.6, colors: [0xffe14a, 0xff5a8a, 0xffffff, 0x9fe8ff], gravity: 8 });
      sfx('powerup', { vol: 0.8 }); sfx('coin', { vol: 0.6 }); ctx.shake(0.25);
      if (r < 0.34) { p.mega = true; fx.texts.add('MEGA-SCHOT!', balloon.x, balloon.y + 3, 3, '#ffe14a', 1.6); hud.toast(`${names[owner]}: de volgende schot is een MEGA-schot!`, 2200); }
      else if (r < 0.67) { p.rapid = 12; p.cd = Math.min(p.cd, 0.5); fx.texts.add('SNEL LADEN!', balloon.x, balloon.y + 3, 3, '#6fe8ff', 1.6); hud.toast(`${names[owner]} laadt 12 seconden twee keer zo snel!`, 2200); }
      else { p.tokens = Math.min(3, p.tokens + 2); fx.texts.add('REPARATIE x2!', balloon.x, balloon.y + 3, 3, '#8dff6a', 1.6); hud.toast(`${names[owner]} krijgt 2 reparaties!`, 2200); }
    }
    function dragonBreath() {
      const ci = dragon.target; const tgt = CX[ci]; dragon.breath = 1.3; dragon.breathed = true;
      hud.toast(`🔥 De draak spuwt vuur op het kasteel van ${names[ci]}!`, 2200); sfx('explode', { vol: 0.6 }); audio.tone(80, 0.9, { type: 'sawtooth', vol: 0.25, slide: 40 }); ctx.shake(0.4);
      const bl = world.bodies.filter((b) => b.user && b.user.kind === 'block' && b.user.side === ci && Math.abs(b.x - tgt) < 9).sort((a, b) => b.y - a.y);
      for (let k = 0; k < Math.min(4, bl.length); k++) { const b = bl[k]; ignite(b); if (k === 0) dmgBlock(b, 70); else dmgBlock(b, 14); }
      for (const b of bl.slice(0, 4)) b.wake();
    }

    // ---------------- hoofdupdate ----------------
    const tmpC = new THREE.Color();
    function update(dt) {
      if (!started) started = true;
      const real = dt; dt *= timeScale; T += real;
      if (ended) { endT += real; if (endT > 1.6 && timeScale < 1) timeScale = Math.min(1, timeScale + real * 0.3); if (endT > 2.8) { finishGame(); return; } }
      else {
        const left = MATCH_TIME - T; hud.setTimer(Math.max(0, left), 12);
        if (left <= 0) timeUp();
        for (const p of ST) inputPlayer(p, dt);
        if (!ended && left < 10.5 && left > 10 && !stats.lastCall) { stats.lastCall = true; hud.showBig('LAATSTE 10 SECONDEN!', 1200, '#ffb84a'); sfx('bell', { vol: 0.4 }); }
        // wind
        windT -= dt; if (windT <= 0) { windT = 8 + Math.random() * 6; windTarget = (Math.random() < 0.18 ? 0 : (Math.random() * 2 - 1)) * WIND_MAX; if (Math.random() < 0.5) windTarget *= 0.5; }
        // draak / ballon
        if (!dragon.on) { dragon.next -= dt; if (dragon.next <= 0 && T > 10) { dragon.next = 18 + Math.random() * 8; startDragon(); } }
        if (!balloon.on) { balloon.next -= dt; if (balloon.next <= 0) { balloon.next = 15 + Math.random() * 7; startBalloon(); } }
      }
      wind = damp(wind, windTarget, 0.9, dt);
      // natuurkunde
      const steps = clamp(Math.ceil(dt / SUBSTEP), 1, 9); const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const pr of projs) { const a = windAccel(pr); pr.vx += a * h; }
        world.step(h);
      }
      for (const ev of evq) handleImpact(ev); evq.length = 0;
      logic(dt, real);
      visuals(dt, real);
    }

    function logic(dt, real) {
      if (!ended) {
        // projectielen opruimen en bijzondere botsingen
        for (let k = projs.length - 1; k >= 0; k--) {
          const pr = projs[k], u = pr.user; u.age += dt;
          const sp = Math.hypot(pr.vx, pr.vy);
          if (pr.y < -6 || Math.abs(pr.x) > 70 || u.age > 11) { killProj(pr, false); continue; }
          if (sp < 0.7 && pr.touch) { u.rest += dt; if (u.rest > 1.6) { killProj(pr, true); continue; } } else u.rest = 0;
          // katapult geraakt?
          for (const q of ST) {
            if (q.i === u.owner && u.age < 0.6) continue;
            if (Math.abs(pr.x - CAT_X[q.i]) < 2.2 && pr.y < 5.2 && pr.y > 0 && sp > 3) {
              q.stuck += AMMO[u.t].id === 'cake' ? 2.4 : 1.4; if (q.cd > 0) q.cd += AMMO[u.t].id === 'cake' ? 2.4 : 1.4; else { q.cd = q.cdMax = 1.4; }
              q.charging = false; q.power = 0;
              fx.particles.burst(pr.x, pr.y, 2, { count: 20, speed: 6, up: 1, life: 0.7, size: 0.5, colors: AMMO[u.t].id === 'cake' ? [0xff8ac0, 0xffffff] : [0xc08a52, 0xffffff], gravity: 8 });
              fx.texts.add(AMMO[u.t].id === 'cake' ? 'KLEF!' : 'KATAPULT KAPOT!', CAT_X[q.i], 7, 3, '#ffd24a', 1.2); sfx('wood', { vol: 0.7 }); ctx.shake(0.3);
              if (AMMO[u.t].id === 'fire') igniteArea(pr.x, pr.y, 1.5);
              killProj(pr, false); break;
            }
          }
          if (!pr.alive) continue;
          // draak vreet op
          if (dragon.on) { const dp = dragon.mesh.g.position; if (Math.hypot(pr.x - dp.x, pr.y - (dp.y + 0.5)) < 3.4) { fx.texts.add('HAP! SLURP!', dp.x, dp.y + 3, 3, '#ff9a6a', 1.5); fx.particles.burst(dp.x, dp.y, 2, { count: 16, speed: 4, up: 1, life: 0.6, size: 0.5, colors: [0xff7a1a, 0xffe14a], gravity: 0 }); sfx('creak', { vol: 0.4, rate: 1.6 }); sfx('hurt', { vol: 0.3, rate: 0.7 }); killProj(pr, false); continue; } }
          // ballonkist
          if (balloon.on && Math.hypot(pr.x - balloon.mesh.position.x, pr.y - (balloon.mesh.position.y + 1.8)) < 2.4) { balloonPop(u.owner); }
          // sporen
          u.trail -= dt; if (u.trail <= 0 && sp > 8) { u.trail = 0.04; const t = u.t; fx.particles.emit(pr.x, pr.y, 1.8, 0, 0.3, 0, { life: t === 2 ? 0.6 : 0.35, size: t === 2 ? 0.7 : 0.4, color: t === 2 ? (Math.random() < 0.5 ? 0xff7a1a : 0xffd23f) : t === 1 ? 0xff8ac0 : 0xffffff, gravity: t === 2 ? -3 : 0 }); }
        }
        // brand en gladheid
        for (const b of world.bodies.slice()) {
          const u = b.user; if (!u || u.kind !== 'block') continue;
          if (u.burn > 0) {
            u.burn -= dt; dmgBlock(b, 9 * dt); if (!b.alive) continue;
            if (Math.random() < dt * 14) fx.particles.emit(b.x + (Math.random() - 0.5) * u.w * 0.8, b.y + (Math.random() - 0.3) * u.h * 0.8, 1.9, (Math.random() - 0.5) * 0.8, 2.2, 0, { life: 0.6, size: 0.7, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: -2 });
            if (Math.random() < dt * 1.6) for (const o of world.bodies) if (o !== b && o.user && o.user.kind === 'block' && o.user.burn <= 0 && MATS[o.user.mat].burn && Math.hypot(o.x - b.x, o.y - b.y) < 3.1 && Math.random() < 0.5) { ignite(o); break; }
          }
          if (u.slick > 0) { u.slick -= dt; if (u.slick <= 0) { b.mu = u.mu0; } }
        }
        // koning
        for (let i = 0; i < 2; i++) {
          const k = castles[i].king; const u = k.user;
          if (u.hp <= 0) { kingHitBy(i, 'crush'); break; }
          if (k.y < u.startY - 2.9 || k.y < 1.2) { kingHitBy(i, 'fall'); break; }
        }
        // percentages
        for (const p of ST) p.pct = pctOf(p.i);
        // draak vliegt
        if (dragon.on) {
          dragon.t += dt; const u = dragon.t / 9.5; const x = lerp(-62, 62, dragon.dir > 0 ? u : 1 - u);
          const dp = dragon.mesh.g.position; dp.set(x, dragon.y + Math.sin(dragon.t * 2.2) * 1.0, -1); dragon.mesh.g.rotation.y = dragon.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (!dragon.breathed && Math.abs(x - CX[dragon.target]) < 2.5) dragonBreath();
          if (dragon.breath > 0) { dragon.breath -= dt; const f = CX[dragon.target]; for (let k = 0; k < 3; k++) fx.particles.emit(dp.x + dragon.dir * 2.5, dp.y - 1, 1.5, (f - dp.x) * 0.1 + (Math.random() - 0.5) * 4, -8 - Math.random() * 5, 0, { life: 0.8, size: 0.9, color: Math.random() < 0.5 ? 0xff5a1a : 0xffd23f, gravity: -1 }); }
          if (u >= 1) { dragon.on = false; dragon.mesh.g.visible = false; }
        }
        // ballon
        if (balloon.on) { balloon.t += dt; balloon.life -= dt; balloon.mesh.position.x += (balloon.vx + wind * 0.25) * dt; balloon.mesh.position.y = balloon.y + Math.sin(balloon.t * 1.4) * 1.1; if (balloon.life <= 0 || Math.abs(balloon.mesh.position.x) > 30) { balloon.on = false; balloon.mesh.visible = false; fx.particles.burst(balloon.mesh.position.x, balloon.mesh.position.y, 2, { count: 10, speed: 3, up: 1, life: 0.6, size: 0.5, colors: [0xff5a8a, 0xffffff], gravity: 4 }); } }
      }
    }

    // ---------------- visuals ----------------
    let camZoom = 0, camTx = 0, camTy = 15.5;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max(35.5 / (tanH * asp), 19.5 / tanH);
      let tx = 0, ty = 15.5, zoom = 0;
      if (ended && result && result.how !== 'time') { const lk = castles[1 - result.winner].king; tx = lk.x * 0.7; ty = 11 + lk.y * 0.2; zoom = Math.min(1, endT / 0.8) * 0.4; }
      camTx = damp(camTx, tx, 3, dt); camTy = damp(camTy, ty, 3, dt); camZoom = damp(camZoom, zoom, 3, dt);
      const d = dist * (1 - camZoom);
      camera.position.set(camTx + Math.sin((T + introT) * 0.12) * 1.2, camTy + 1.5, d);
      camera.lookAt(camTx, camTy, 0);
    }
    function blockColor(b, e) {
      const u = b.user, f = clamp(u.hp / u.maxHp, 0, 1);
      let r = 1, g = 1, bl = 1;
      if (u.mat !== 'glass') { const d = 0.55 + 0.45 * f; r = g = bl = d; }
      if (u.slick > 0) { r = 1.7; g = 1.45; bl = 1.6; }
      if (u.burn > 0) { const fl = 0.8 + 0.2 * Math.sin(T * 20 + b.id); r = 1.5 * fl; g = 0.7 * fl; bl = 0.35; }
      return tmpC.setRGB(r, g, bl);
    }
    function visuals(dt, real) {
      const tt = T + introT;
      land.update(real, wind);
      // blokken
      for (const e of entries) { const b = e.body; if (b && b.alive) field.set(e.mat, e.idx, b.x, b.y, b.ang, e.w, e.h, blockColor(b, e), 0); }
      // vlaggen en koningen
      for (let i = 0; i < 2; i++) {
        const top = flagPos(i); const f = flags[i];
        if (top) { f.visible = true; f.position.set(top.x, top.y + top.user.h / 2, 0); f.rotation.z = top.ang; f.userData.anim(tt, wind); } else f.visible = false;
        const k = castles[i].king; const kg = kings[i];
        kg.holder.position.set(k.x, k.y, 0.2); kg.holder.rotation.z = k.ang;
        kg.c.pose = ended && result && result.winner === i ? 'cheer' : (k.asleep ? 'idle' : 'scared'); kg.c.update(dt);
      }
      // projectielen
      for (const pr of projs) { const m = pr.user.mesh; m.position.set(pr.x, pr.y, 0.2); m.rotation.z = pr.ang; if (pr.user.t === 2) m.rotation.z = Math.atan2(pr.vy, pr.vx); if (pr.user.t === 3) { m.scale.x = Math.abs(m.scale.x) * (pr.vx < 0 ? -1 : 1); } }
      // spelers
      for (const p of ST) {
        const i = p.i, inp = pv.input(i);
        // arm van de katapult
        const ready = p.cd <= 0;
        if (p.swing > 0) { p.swing -= real; p.arm = damp(p.arm, 0.9, 40, real); }
        else if (ready) p.arm = damp(p.arm, Math.PI + 0.25 + (p.charging ? p.power * 0.55 : 0), 8, real);
        else { const pr = 1 - p.cd / Math.max(0.1, p.cdMax); p.arm = damp(p.arm, lerp(0.9, Math.PI + 0.25, clamp((pr - 0.3) / 0.6, 0, 1)), 10, real); }
        p.cat.userData.arm.rotation.z = p.arm; p.cat.userData.flag.userData.anim(tt, wind * p.dir);
        // balk: laden = groen->rood, wachten = oranje voortgang
        const fillV = ready ? Math.max(0.02, p.power) : 1 - p.cd / Math.max(0.1, p.cdMax);
        p.fill.scale.x = Math.max(0.02, fillV); p.fill.position.x = -3.0 * (1 - p.fill.scale.x);
        p.fill.material.color.setRGB(ready ? lerp(0.3, 1, p.power) : 0.9, ready ? lerp(1, 0.2, p.power) : 0.55, ready ? 0.3 : 0.2);
        p.bar.visible = true;
        if (p.lastAmmoDraw !== p.ammo + (p.mega ? 10 : 0)) { p.lastAmmoDraw = p.ammo + (p.mega ? 10 : 0); p.am.userData.draw(AMMO[p.ammo], p.mega); }
        p.rep.visible = p.tokens > 0; if (p.rep.visible) { p.rep.position.y = 12.6 + Math.sin(tt * 4) * 0.2; p.rep.scale.setScalar(1 + (p.bDown ? p.repP * 0.2 : 0)); }
        // operator
        const c = ops[i].c; c.pose = ended ? c.pose : (p.charging ? 'push' : 'carry'); c.speed = 0; c.update(real);
        ops[i].holder.position.y = p.charging ? Math.sin(tt * 40) * 0.03 : 0;
        // stippen
        const a = AMMO[p.ammo]; const v = launchVel(p, ready ? Math.max(0.05, p.power || 0.45) : 0.45);
        let px = CAT_X[i] + p.dir * ARM * Math.cos(0.9), py = PIVOT_Y + ARM * Math.sin(0.9), vx = p.dir * Math.cos(p.aim) * v, vy = Math.sin(p.aim) * v;
        const ax = wind * WIND_K * a.windK * (p.mega ? 0.6 : 1), ay = -20 * GM;
        for (let k = 0; k < p.N; k++) { p.pp3[k * 3] = px; p.pp3[k * 3 + 1] = py; p.pp3[k * 3 + 2] = 1.5; for (let s = 0; s < 6; s++) { vx += ax * 0.02; vy += ay * 0.02; px += vx * 0.02; py += vy * 0.02; } }
        p.pts.geometry.attributes.position.needsUpdate = true; p.pts.visible = !ended && ready;
        p.pts.material.opacity = p.charging ? 0.95 : 0.6;
        p.tag.visible = !ended;
        // HUD-tekst (alleen bij verandering)
        const txt = infoTxt(p) + (ready ? '' : ' · laden'); if (txt !== p.lastTxt) { p.lastTxt = txt; hud.setPlayerInfo(i, txt); }
      }
      // wind
      if (Math.abs(wind - (wsprite.userData.lw ?? 99)) > 0.35) { wsprite.userData.lw = wind; wsprite.userData.draw(wind); }
      // draak
      if (dragon.on) { dragon.mesh.d.update(dt); }
      // ballon
      if (balloon.on) { balloon.mesh.rotation.z = Math.sin(balloon.t * 1.7) * 0.08; }
      if (T - (refreshHud.t || 0) > 0.25) { refreshHud.t = T; refreshHud(); }
      updateCamera(real);
    }

    refreshHud();
    function resultUpdate(dt) { T += dt; timeScale = 1; for (const o of ops) o.c.update(dt); for (const k of kings) k.c.update(dt); updateCamera(dt); land.update(dt, wind); }
    function introUpdate(dt) {
      introT += dt; for (const o of ops) o.c.update(dt); for (const k of kings) k.c.update(dt);
      for (const p of ST) { p.cat.userData.flag.userData.anim(introT, wind * p.dir); p.cat.userData.arm.rotation.z = Math.PI + 0.25; }
      for (let i = 0; i < 2; i++) { const f = flags[i]; const top = flagPos(i); if (top) { f.position.set(top.x, top.y + top.user.h / 2, 0); f.userData.anim(introT, 0); } }
      for (const p of ST) if (p.lastAmmoDraw !== p.ammo) { p.lastAmmoDraw = p.ammo; p.am.userData.draw(AMMO[p.ammo], false); }
      // één keer de blokken laten zien
      for (const e of entries) { const b = e.body; if (b) field.set(e.mat, e.idx, b.x, b.y, b.ang, e.w, e.h, blockColor(b, e), 0); }
      for (let i = 0; i < 2; i++) { const k = castles[i].king; kings[i].holder.position.set(k.x, k.y, 0.2); }
      land.update(dt, 0); updateCamera(dt);
    }
    introUpdate(0.001);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of ST) fx.particles.burst(CAT_X[p.i], 6, 2, { count: 24, speed: 5, up: 1, life: 0.7, size: 0.5, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = ST[i]; p.stuck += 3; p.cd = Math.max(p.cd, 3.2); p.cdMax = Math.max(p.cdMax, 3.2); p.charging = false; p.power = 0; fx.texts.add('KATAPULT KLEMT!', CAT_X[i], 8, 3, '#ff8a6a', 1.3); sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { ops[w].c.pose = 'cheer'; ops[1 - w].c.pose = 'sad'; },
      dispose() {},
      dbg: {
        world, ST, entries, log: dbgLog, castles, projs, stats, AMMO, dragon, balloon,
        state: () => ({
          T, ended, finished, wind, left: MATCH_TIME - T, pct: ST.map((p) => p.pct), kingHp: [kingHp(0), kingHp(1)], kingY: castles.map((c) => +c.king.y.toFixed(2)),
          p: ST.map((p) => ({ aim: +p.aim.toFixed(3), power: +p.power.toFixed(2), cd: +p.cd.toFixed(2), ammo: p.ammo, tokens: p.tokens, mega: p.mega, charging: p.charging, rapid: p.rapid, shots: p.shots, hits: p.hits })),
          projs: projs.length, bodies: world.bodies.length, awake: world.bodies.filter((b) => !b.asleep && !b.static).length, dragon: dragon.on, balloon: balloon.on ? { x: balloon.mesh.position.x, y: balloon.mesh.position.y } : null, stats, result,
          kings: castles.map((c) => ({ x: c.king.x, y: c.king.y })), cats: CAT_X,
        }),
        fire, setTime: (t) => { T = MATCH_TIME - t; }, setWind: (w) => { wind = windTarget = w; windT = 99; }, startDragon, startBalloon, balloonPop, repair,
        killKing: (i) => { castles[i].king.user.hp = -1; }, damageSide: (i, frac) => { for (const e of entries) if (e.side === i && e.body && e.mat !== 'stone') dmgBlock(e.body, e.body.user.maxHp * frac); },
        ignite, splat, explodeFire, launchVel, giveTokens: (i, n) => { ST[i].tokens = n; }, setAmmo: (i, a) => { ST[i].ammo = a; }, mega: (i) => { ST[i].mega = true; },
      },
    };
  },
};

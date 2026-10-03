import * as THREE from 'three';
import { clamp, lerp, damp, rand, pick, TAU, mat, mesh, canvasTex } from '../engine/util.js';
import { Animal, Dragon, makeDeurman } from '../engine/chars.js';
import { TILE, W, H, OX, OZ, tx, tz, cx_, cz_, CHEST_KINDS, buildMap, isSolidC, isSolidW, los, rayDist, pushOut, bfsField, stepDir } from './heist_map.js';
import { buildCastleScene, makeChest, makePile, makeKnight, makeDog, makeBandit, makeCone, makeHatPickup, glowDisc, textSprite, liveSprite } from './heist_world.js';

// Schatkamer-Overval — twee dieven in een symmetrisch kasteel vol wachters. Wie na 80 s de meeste buit veilig in zijn luik heeft, wint.
//  * richtingen = lopen, A = pak buit / open kist (ingedrukt houden), leg buit neer (lang houden), B = gooi een munt (lokt wachters)
//  * wachters (ridders, honden, een slapende draak) hebben een zichtbare kegel; gezien = alarm, achtervolging en buit kwijt
//  * gimmicks: gouden kroon (wekt iedereen), lasers, kip die buit steelt, de Deurman als stalker, verkleedhoeden, inhaalbonus

const MATCH_TIME = 80, TARGET = 500;
const R0 = 0.5, SPEED = 5.0, COIN_CD = 6, CHEST_REFILL = 20;
const CYCLE = 3.2;

export default {
  id: 'heist',
  name: 'Schatkamer-Overval',
  giver: 'Schatmeester Goudoog',
  icon: '🗝️',
  mode: 'pvp',
  time: 80,
  music: 'game_minor',
  blurb: 'Dieven in een kasteel vol goud! Sluip langs <b>ridders, honden en de draak</b>, open kisten en breng je buit naar je eigen <b>luik</b>. Na 80 s wint de rijkste (of wie als eerste <b>500</b> heeft).',
  controls: ['{move} sluipen', '{a} houden = kist openen', '{b} munt gooien (lokt wachters)'],
  tip: 'Gezien = alarm! Gooi een munt bij je broer om de wachters op hém af te sturen.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const GRAV = pv.gravity || 1, SLIP = pv.slip || 0;
    const TEMPO = pv.speed(0) === pv.speed(1) ? pv.speed(0) : 1;
    const GSP = lerp(1, TEMPO, 0.5);                        // wachters schalen een beetje mee met turbo/slowmo
    const M = buildMap();
    const L = ctx.lights('night', { shadow: 30, center: [0, 0, 0], fogNear: 70, fogFar: 160 });
    L.hemi.intensity = 1.6; L.hemi.color.set(0x9aa4d8); L.hemi.groundColor.set(0x3a2a4a); L.sun.color.set(0xc8d0ff); L.sun.intensity = 1.1; L.sun.position.set(-14, 34, 16);
    camera.fov = 48; camera.updateProjectionMatrix();
    const baseHemi = L.hemi.color.clone(), baseSun = L.sun.color.clone(), red = new THREE.Color(0xff3020);
    const sfx = (n, o) => audio.sfx(n, o);
    const S = buildCastleScene(ctx, M, L);

    // ---------------- toestand ----------------
    let T = 0, introT = 0, finished = false, ended = false, endT = 0, winner = -1, alarm = 0, lastCall = false, crownT = 0;
    const stats = { chests: [0, 0], alarms: [0, 0], caught: [0, 0], coins: [0, 0], hats: [0, 0], lasers: [0, 0], pickpocket: [0, 0], chicken: 0, dragon: 0, deurman: 0, crown: 0 };
    const rnd = Math.random;
    const floorTiles = []; for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (!M.solid[r * W + c] && M.ch[r][c] !== 'l') floorTiles.push([c, r]);
    const tileSide = (c) => (c < 12 ? 0 : c > 12 ? 1 : -1);

    // ---------------- dieven ----------------
    const th = [0, 1].map((i) => {
      const c = makeBandit(i); const holder = new THREE.Group(); holder.add(c.group);
      const h = M.hatches[i]; const k = 3.1 / c.height * lerp(1, pv.size(i), 0.7); holder.scale.setScalar(k); scene.add(holder);
      const tag = liveSprite(3.6); tag.userData.set(names[i], players[i].css, 0); scene.add(tag);
      const bg = mesh(new THREE.PlaneGeometry(2.4, 0.34), new THREE.MeshBasicMaterial({ color: 0x120a22, transparent: true, opacity: 0.85, depthTest: false }), { cast: false, receive: false }); bg.renderOrder = 12; bg.rotation.x = -0.9;
      const fill = mesh(new THREE.PlaneGeometry(2.3, 0.24), new THREE.MeshBasicMaterial({ color: 0xffe14a, depthTest: false }), { cast: false, receive: false }); fill.renderOrder = 13; fill.rotation.x = -0.9;
      scene.add(bg, fill);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 24), new THREE.MeshBasicMaterial({ color: players[i].color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; scene.add(ring);
      const bang = textSprite('!', '#ff4a3a', 1.6); bang.visible = false; scene.add(bang);
      const sx = tx(h.c) + (i ? -1 : 1) * TILE, sz = tz(h.r);
      return { i, c, holder, tag, bg, fill, ring, bang, x: sx, z: sz, vx: 0, vz: 0, fx: i ? -1 : 1, fz: 0, R: R0 * lerp(1, pv.size(i), 0.6), carry: 0, bank: 0, alert: 0, invuln: 0, stun: 0, disguise: 0, bCd: 3, prog: 0, progT: null, laserImm: 0, pickCd: 0, dropT: 0, depT: 0, comeback: false, lastTag: '', crown: false, hatch: h, pose: 'idle', lastTxt: '', opened: 0, caughtT: 0 };
    });
    const hatchPos = (i) => ({ x: tx(M.hatches[i].c), z: tz(M.hatches[i].r) });

    // ---------------- kisten ----------------
    const chests = M.chests.map((d) => {
      const g = makeChest(d.kind); g.position.set(tx(d.c), 0, tz(d.r)); scene.add(g);
      const K = CHEST_KINDS[d.kind]; return { d, x: tx(d.c), z: tz(d.r), g, full: true, val: K.val, hold: K.hold, refill: 0, kind: d.kind, prog: [0, 0], open: 0 };
    });
    const piles = Array.from({ length: 10 }, () => { const g = makePile(); g.visible = false; scene.add(g); return { on: false, x: 0, z: 0, val: 0, life: 0, g, crown: false }; });
    function dropPile(x, z, val, scatter = 0.8) {
      if (val < 1) return;
      const p = piles.find((q) => !q.on) || piles.reduce((a, b) => (a.life < b.life ? a : b));
      const a = rnd() * TAU; let px = x + Math.cos(a) * scatter * rnd(), pz = z + Math.sin(a) * scatter * rnd(); const q = { x: px, z: pz }; if (isSolidW(M, px, pz)) { q.x = x; q.z = z; }
      // samenvoegen met een pile vlakbij
      const near = piles.find((o) => o.on && o !== p && Math.hypot(o.x - q.x, o.z - q.z) < 1.4);
      if (near) { near.val += val; near.life = 16; near.g.userData.lbl.userData.set('', '#ffe14a', near.val); return; }
      p.on = true; p.x = q.x; p.z = q.z; p.val = val; p.life = 16; p.g.visible = true; p.g.position.set(p.x, 0, p.z); p.g.userData.lbl.userData.set('', '#ffe14a', val);
      fx.particles.burst(p.x, 0.6, p.z, { count: 10, speed: 3, up: 1.5, life: 0.6, size: 0.3, colors: [0xffd23f, 0xffe680], gravity: 8 });
    }

    // ---------------- wachters ----------------
    const iconTex = {};
    const mkIcon = (t, col) => { const s = textSprite(t, col, 1.5); iconTex[t] = s.material.map; return s; };
    const guards = M.guards.map((d, k) => {
      const dog = d.type === 'dog', cap = d.type === 'captain';
      const model = dog ? makeDog() : makeKnight(cap ? 'captain' : 'guard');
      const grp = new THREE.Group(); grp.add(dog ? model : model.group);
      if (!dog) { const kk = (cap ? 3.6 : 3.3) / model.height; grp.scale.setScalar(kk); }
      scene.add(grp);
      const cone = makeCone(14); scene.add(cone.mesh);
      const icon = mkIcon('?', '#ffe14a'); icon.visible = false; scene.add(icon);
      const [c0, r0] = d.route[0];
      return { k, type: d.type, model, grp, cone, icon, dog, x: tx(c0), z: tz(r0), yaw: 0, ty: 0, route: d.route, wpi: 0, state: 'patrol', stateT: 0, goal: null, field: new Int16Array(W * H), fgc: -1, fgr: -1, speed: dog ? 3.2 : cap ? 2.0 : 2.4, chase: dog ? 6.0 : cap ? 4.3 : 4.2, range: dog ? 6.5 : cap ? 9 : 8, half: dog ? 0.7 : cap ? 0.44 : 0.52, sus: [0, 0], target: -1, last: null, wait: 0, chaseT: 0, sw: rnd() * 6, moving: 0 };
    });
    // draak (slaapt)
    const drag = (() => {
      const d = new Dragon(0xd8402a, 1.0); const grp = new THREE.Group(); grp.add(d.group); grp.scale.setScalar(1.15); scene.add(grp);
      const cone = makeCone(14); scene.add(cone.mesh); cone.mesh.visible = false;
      const icon = textSprite('ZZZ', '#aee0ff', 2.2); scene.add(icon);
      return { type: 'dragon', model: d, grp, cone, icon, x: tx(M.dragon.c), z: tz(M.dragon.r), yaw: Math.PI, home: [M.dragon.c, M.dragon.r], state: 'sleep', meter: 0, stateT: 0, cool: 0, field: new Int16Array(W * H), fgc: -1, fgr: -1, speed: 2.5, chase: 3.4, range: 9, half: 0.5, target: -1, sus: [0, 0], sw: 0, zT: 0 };
    })();
    drag.grp.position.set(drag.x, 0, drag.z); drag.grp.rotation.y = Math.PI;
    const allG = [...guards, drag];

    // ---------------- kip, deurman, hoeden, munten ----------------
    const chickens = [11, 13].map((c) => {
      const a = new Animal('chicken'); const grp = new THREE.Group(); grp.add(a.group); grp.scale.setScalar(1.9); scene.add(grp);
      return { a, grp, x: tx(c), z: tz(10), yaw: 0, state: 'wander', goal: null, field: new Int16Array(W * H), fgc: -1, fgr: -1, wait: rnd() * 2, carry: 0, t: 0, cool: 6 };
    });
    const dm = { on: false, g: makeDeurman(0.85), x: 0, z: 0, t: 0, next: 24 + rnd() * 10, field: new Int16Array(W * H), fgc: -1, fgr: -1, fade: 0 };
    dm.g.group.visible = false; scene.add(dm.g.group);
    const hats = [0, 1].map(() => { const g = makeHatPickup(); g.visible = false; scene.add(g); return { on: false, x: 0, z: 0, g, life: 0 }; });
    let hatT = 10;
    const coins = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.7, metalness: 0.7 })); m.visible = false; scene.add(m); return { on: false, m, t: 0, sx: 0, sz: 0, ex: 0, ez: 0, owner: 0 }; });
    const coinMarks = [0, 1].map(() => { const g = glowDisc(0xffe070, 3.4, 0.55, 0.1); g.visible = false; scene.add(g); return g; });

    // ---------------- hulp: paden ----------------
    function navigate(o, gc, gr, speed, dt) {
      if (o.fgc !== gc || o.fgr !== gr) { bfsField(M, gc, gr, o.field); o.fgc = gc; o.fgr = gr; }
      const c = cx_(o.x), r = cz_(o.z);
      const nx = stepDir(o.field, c, r);
      let tcx, tcz, arrived = false;
      if (!nx) { tcx = tx(gc); tcz = tz(gr); const d = Math.hypot(tcx - o.x, tcz - o.z); if (d < 0.25) arrived = true; }
      else { tcx = tx(nx[0]); tcz = tz(nx[1]); }
      const dx = tcx - o.x, dz = tcz - o.z, d = Math.hypot(dx, dz) || 1;
      if (!arrived) { const s = Math.min(speed * dt, d); o.x += dx / d * s; o.z += dz / d * s; o.mx = dx / d; o.mz = dz / d; o.moving = 1; } else o.moving = 0;
      return arrived;
    }
    const faceTo = (o, dx, dz, dt, lam = 8) => { if (Math.abs(dx) + Math.abs(dz) < 1e-4) return; const a = Math.atan2(dx, dz); let d = a - o.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); o.yaw += d * (1 - Math.exp(-lam * dt)); };
    const tileOf = (o) => [clamp(cx_(o.x), 0, W - 1), clamp(cz_(o.z), 0, H - 1)];
    function nearestFloor(x, z) { let c = cx_(x), r = cz_(z); if (!isSolidC(M, c, r)) return [c, r]; for (let d = 1; d < 4; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) if (!isSolidC(M, c + dc, r + dr)) return [c + dc, r + dr]; return [1, 1]; }

    // ---------------- alarm en straf ----------------
    function inSafe(t) { const h = hatchPos(t.i); return Math.hypot(t.x - h.x, t.z - h.z) < 1.5; }
    function setAlarm(v) { alarm = Math.max(alarm, v); }
    function raise(i, by) {
      const t = th[i]; if (t.alert > 2.0 || t.invuln > 0) { t.alert = Math.max(t.alert, 5); return; }
      t.alert = 7; stats.alarms[i]++; setAlarm(1);
      const lose = Math.floor(t.carry * 0.3); if (lose > 0) { t.carry -= lose; dropPile(t.x, t.z, lose, 1.2); fx.texts.add(`-${lose}`, t.x, 3.2, t.z, '#ff6a5a', 1.3); }
      hud.toast(`ALARM! ${names[i]} is gezien!`, 1800); hud.showBig('ALARM!', 900, '#ff4a3a');
      sfx('bell', { vol: 0.7 }); sfx('bell', { vol: 0.5, rate: 0.8 }); audio.tone(660, 0.5, { type: 'sawtooth', vol: 0.18, slide: -300 }); ctx.shake(0.45);
      for (const g of guards) { if (g.state === 'tired') continue; if (Math.hypot(g.x - t.x, g.z - t.z) < 34) { g.state = 'chase'; g.target = i; g.chaseT = 0; g.last = [t.x, t.z]; } }
      if (drag.state === 'awake') drag.target = i;
    }
    function jail(i, by) {
      const t = th[i]; if (t.invuln > 0 || ended) return;
      stats.caught[i]++;
      if (t.carry > 0) { dropPile(t.x, t.z, t.carry, 0.6); fx.texts.add(`-${t.carry}`, t.x, 3.2, t.z, '#ff6a5a', 1.5); }
      t.carry = 0; t.crown = false; t.alert = 0; t.disguise = 0;
      fx.particles.burst(t.x, 1, t.z, { count: 30, speed: 6, up: 1.2, life: 0.8, size: 0.5, colors: [0xffffff, 0xffe14a, 0xff6a3a], gravity: 5 });
      fx.texts.add('GEPAKT!', t.x, 3.6, t.z, '#ff5a3a', 1.7); sfx('hurt', { vol: 0.8 }); sfx('slam', { vol: 0.5 }); ctx.shake(0.6);
      const h = hatchPos(i); t.x = h.x + (i ? -1 : 1) * TILE; t.z = h.z; t.vx = t.vz = 0; t.stun = 1.4; t.invuln = 3.2; t.prog = 0; t.progT = null;
      fx.particles.burst(t.x, 1, t.z, { count: 20, speed: 4, up: 1.4, life: 0.7, size: 0.4, colors: [0xffffff, 0x9fe8ff], gravity: 3 });
      for (const g of guards) if (g.target === i && g.state === 'chase') { g.state = 'search'; g.stateT = 0; g.goal = null; g.last = [by ? by.x : t.x, by ? by.z : t.z]; }
      if (drag.target === i) drag.target = -1;
      hud.toast(`${names[i]} is gepakt en moet terug naar zijn luik!`, 1800);
    }
    function noise(x, z, who, radius = 24) {
      const [gc, gr] = nearestFloor(x, z);
      for (const g of guards) { if (g.state === 'chase' || g.state === 'tired') continue; if (Math.hypot(g.x - x, g.z - z) < radius) { g.state = 'investigate'; g.goal = [gc, gr]; g.stateT = 0; g.wait = 0; } }
      if (Math.hypot(drag.x - x, drag.z - z) < 8 && drag.state === 'sleep') drag.meter += 0.4;
    }

    // ---------------- inputs en acties ----------------
    function trailing(i) { return th[1 - i].bank - th[i].bank >= 80; }
    function openChest(i, ch) {
      const t = th[i];
      const mult = t.comeback ? 1.35 : 1; const val = Math.round(ch.val * mult);
      ch.full = false; ch.refill = ch.kind === 'K' ? 28 : CHEST_REFILL; ch.prog = [0, 0]; t.carry += val; t.opened++; stats.chests[i]++;
      fx.particles.burst(ch.x, 1, ch.z, { count: 26, speed: 5, up: 1.6, life: 0.9, size: 0.4, colors: [0xffd23f, 0xffe680, 0xffffff, 0xff8a3a], gravity: 8 });
      fx.texts.add(`+${val}`, ch.x, 3.0, ch.z, '#ffe14a', 1.5); sfx('coin', { vol: 0.8 }); sfx('sparkle', { vol: 0.4 }); sfx('door', { vol: 0.3, rate: 1.4 });
      t.c.swing();
      if (ch.kind === 'K') {
        t.crown = true; stats.crown++; setAlarm(1.2); crownT = 9; hud.showBig('DE KROON IS GEPAKT!', 1500, '#ffd23f'); hud.toast(`${names[i]} heeft de KROON! Alle wachters worden wakker!`, 2600);
        sfx('bell', { vol: 0.8 }); sfx('explode', { vol: 0.4 }); ctx.shake(0.8);
        t.alert = 9; stats.alarms[i]++;
        for (const g of guards) { g.state = 'chase'; g.target = i; g.chaseT = 0; g.last = [t.x, t.z]; }
        wakeDragon(i);
      }
      if (ch.kind === 'G' || ch.kind === 'M') ctx.shake(0.15);
    }
    function wakeDragon(i) {
      if (drag.state === 'awake') { drag.target = i; return; }
      drag.state = 'awake'; drag.stateT = 0; drag.target = i; drag.meter = 0; stats.dragon++; drag.cone.mesh.visible = true;
      hud.toast('🐉 De draak is wakker! Rennen!', 2000); hud.showBig('DE DRAAK WAKKER!', 1100, '#ff7a3a'); sfx('creak', { vol: 0.8 }); audio.tone(70, 1.0, { type: 'sawtooth', vol: 0.3, slide: 40 }); ctx.shake(0.7); setAlarm(1);
    }
    function throwCoin(i) {
      const t = th[i]; const q = coins.find((c) => !c.on); if (!q) return;
      const rng = 11 * (GRAV < 1 ? 1.5 : 1); const d = rayDist(M, t.x, t.z, t.fx, t.fz, rng, 0.3) - 0.5;
      q.on = true; q.t = 0; q.sx = t.x; q.sz = t.z; q.ex = t.x + t.fx * Math.max(1, d); q.ez = t.z + t.fz * Math.max(1, d); q.owner = i; q.m.visible = true;
      t.bCd = COIN_CD * (t.comeback ? 0.7 : 1); stats.coins[i]++; sfx('throw', { vol: 0.5 }); t.c.swing();
    }
    function coinLand(q) {
      q.on = false; q.m.visible = false; const mk = coinMarks[q.owner]; mk.visible = true; mk.position.set(q.ex, 0.1, q.ez); q.mark = 3.5;
      sfx('ding', { vol: 0.5, rate: 1.1 }); sfx('coin', { vol: 0.5 }); fx.particles.burst(q.ex, 0.5, q.ez, { count: 12, speed: 3, up: 1.4, life: 0.6, size: 0.3, colors: [0xffd23f, 0xffffff], gravity: 8 });
      fx.texts.add('KLING!', q.ex, 2.2, q.ez, '#ffe14a', 1.0); noise(q.ex, q.ez, q.owner, 24); coinMarks[q.owner].userData.t = 3.5;
    }

    function updateThief(t, dt) {
      const i = t.i, inp = pv.input(i);
      t.alert = Math.max(0, t.alert - dt); t.invuln = Math.max(0, t.invuln - dt); t.stun = Math.max(0, t.stun - dt); t.disguise = Math.max(0, t.disguise - dt); t.bCd = Math.max(0, t.bCd - dt); t.laserImm = Math.max(0, t.laserImm - dt); t.pickCd = Math.max(0, t.pickCd - dt);
      const was = t.comeback; t.comeback = trailing(i);
      if (t.comeback && !was) { fx.texts.add('INHAAL-BONUS!', t.x, 3.6, t.z, '#8dff6a', 1.5); hud.toast(`${names[i]} krijgt inhaalbonus: sneller en kisten +35%!`, 2200); sfx('powerup', { vol: 0.5 }); }
      // lopen
      const stunned = t.stun > 0;
      const sp = SPEED * pv.speed(i) * (1 - Math.min(0.38, t.carry / 700)) * (t.comeback ? 1.07 : 1) * (t.crown ? 0.92 : 1);
      const busy = t.progT != null && inp.a;
      const mx = stunned ? 0 : inp.x, mz = stunned ? 0 : inp.y;
      const lam = lerp(14, 1.5, SLIP);
      t.vx = damp(t.vx, mx * sp, lam, dt); t.vz = damp(t.vz, mz * sp, lam, dt);
      t.x += t.vx * dt; t.z += t.vz * dt;
      if (Math.hypot(mx, mz) > 0.25) { const l = Math.hypot(mx, mz); t.fx = mx / l; t.fz = mz / l; }
      const p = { x: t.x, z: t.z }; if (pushOut(M, p, t.R)) { t.x = p.x; t.z = p.z; }
      const o = th[1 - i]; const dx = t.x - o.x, dz = t.z - o.z, dd = Math.hypot(dx, dz), mm = t.R + o.R;
      if (dd < mm && dd > 1e-4) { const k = (mm - dd) / 2; t.x += dx / dd * k; t.z += dz / dd * k; o.x -= dx / dd * k; o.z -= dz / dd * k; }
      // interactie (A)
      let prompt = '';
      let target = null, tkind = null, bd = 1e9;
      if (!stunned) {
        for (const q of piles) if (q.on) { const d = Math.hypot(q.x - t.x, q.z - t.z); if (d < 1.9 && d < bd) { bd = d; target = q; tkind = 'pile'; } }
        if (!target) for (const ch of chests) if (ch.full) { const d = Math.hypot(ch.x - t.x, ch.z - t.z); if (d < 1.9 && d < bd) { bd = d; target = ch; tkind = 'chest'; } }
        if (!target && o.carry >= 10 && t.pickCd <= 0 && Math.hypot(o.x - t.x, o.z - t.z) < 1.6 && o.invuln <= 0 && !inSafe(o)) { target = o; tkind = 'rob'; }
      }
      if (tkind === 'pile') { prompt = `A: pak ${target.val} goud`; if (inp.aP) { t.carry += target.val; target.on = false; target.g.visible = false; fx.texts.add(`+${target.val}`, target.x, 3, target.z, '#ffe14a', 1.2); sfx('coin', { vol: 0.7 }); t.c.swing(); } }
      else if (tkind === 'chest') {
        prompt = 'A houden: open kist';
        if (inp.a && Math.hypot(inp.x, inp.y) < 0.4) { if (t.progT !== target) { t.progT = target; t.prog = 0; } t.prog += dt / target.hold; target.prog[i] = t.prog; if (Math.random() < dt * 10) fx.particles.emit(target.x, 1.1, target.z, (rnd() - 0.5) * 2, 1.5, (rnd() - 0.5) * 2, { life: 0.5, size: 0.25, color: 0xffe680, gravity: 0 }); if (t.prog >= 1) { t.prog = 0; t.progT = null; openChest(i, target); } }
        else { t.prog = Math.max(0, t.prog - dt * 2); if (t.prog <= 0) t.progT = null; }
      } else if (tkind === 'rob') { prompt = 'A: pik zijn buit!'; if (inp.aP) { const amt = Math.max(10, Math.round(o.carry * 0.3)); const a2 = Math.min(o.carry, amt); o.carry -= a2; t.carry += a2; o.stun = Math.max(o.stun, 0.4); t.pickCd = 4; stats.pickpocket[i]++; fx.texts.add(`ZAKKENROLLER! +${a2}`, t.x, 3.4, t.z, '#ff9ae0', 1.3); sfx('whoosh', { vol: 0.6 }); sfx('coin', { vol: 0.6 }); ctx.shake(0.2); fx.particles.burst(o.x, 1, o.z, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffd23f], gravity: 6 }); } }
      else { t.prog = Math.max(0, t.prog - dt * 2); if (t.prog <= 0) t.progT = null; }
      if (t.progT && (!t.progT.full)) { t.progT = null; t.prog = 0; }
      // buit neerleggen (lang A houden zonder iets in de buurt)
      if (!target && inp.a && t.carry > 0 && !stunned && !inSafe(t)) { t.dropT += dt; prompt = 'A houden: buit neerleggen'; if (t.dropT > 0.7) { t.dropT = 0; dropPile(t.x, t.z, t.carry, 0.4); fx.texts.add('NEERGELEGD', t.x, 3, t.z, '#fff', 1.0); t.carry = 0; t.crown = false; sfx('thud', { vol: 0.4 }); } } else t.dropT = 0;
      // inleveren bij het eigen luik
      const h = hatchPos(i);
      if (t.carry > 0 && Math.hypot(t.x - h.x, t.z - h.z) < 1.3 && !stunned) { t.depT += dt; prompt = 'Inleveren...'; if (t.depT > 0.45) bankIt(i); } else t.depT = 0;
      // B: munt
      if (inp.bP && t.bCd <= 0 && !stunned) throwCoin(i);
      // hoed oppakken
      for (const hh of hats) if (hh.on && Math.hypot(hh.x - t.x, hh.z - t.z) < 1.4) { hh.on = false; hh.g.visible = false; t.disguise = 9; stats.hats[i]++; fx.texts.add('VERKLEED!', t.x, 3.4, t.z, '#ff9ae0', 1.4); sfx('powerup', { vol: 0.6 }); sfx('boing', { vol: 0.4 }); fx.particles.burst(t.x, 1.4, t.z, { count: 24, speed: 4, up: 1.2, life: 0.8, size: 0.4, colors: [0xff9ae0, 0xffe14a, 0x6fd8ff], gravity: 3 }); if (t.alert > 0) { t.alert = 0; for (const g of guards) if (g.target === i && g.state === 'chase') { g.state = 'search'; g.stateT = 0; g.last = [t.x, t.z]; } } }
      // lasers
      for (let k = 0; k < M.lasers.length; k++) {
        const lz = M.lasers[k]; if (cx_(t.x) !== lz.c || cz_(t.z) !== lz.r) continue;
        if (laserOn(lz) && t.laserImm <= 0 && t.invuln <= 0) {
          t.laserImm = 1.6; stats.lasers[i]++; const lose = Math.floor(t.carry * 0.2); if (lose) { t.carry -= lose; dropPile(t.x, t.z, lose, 1.0); }
          fx.texts.add('ZAP!', t.x, 3.2, t.z, '#ff4a4a', 1.6); sfx('buzz', { vol: 0.7 }); ctx.shake(0.4); fx.particles.burst(t.x, 1, t.z, { count: 16, speed: 5, up: 1, life: 0.5, size: 0.3, colors: [0xff4a4a, 0xffffff], gravity: 4 }); setAlarm(0.7);
          noise(t.x, t.z, i, 22); t.vx *= -0.5; t.vz *= -0.5;
        }
      }
      t.prompt = prompt;
    }
    function bankIt(i) {
      const t = th[i]; const v = t.carry; t.carry = 0; t.bank += v; t.depT = 0; t.crown = false;
      const h = hatchPos(i);
      fx.particles.burst(h.x, 1, h.z, { count: 40, speed: 7, up: 1.6, life: 1.2, size: 0.45, colors: [0xffd23f, 0xffe680, 0xffffff, i ? 0x8fb8ff : 0x7dffb0], gravity: 7 });
      fx.texts.add(`+${v} VEILIG!`, h.x, 3.4, h.z, '#8dff6a', 1.5); sfx('win', { vol: 0.4 }); sfx('coin', { vol: 0.8 }); sfx('sparkle', { vol: 0.5 }); t.c.pose = 'cheer'; t.cheerT = 0.9;
      refreshHud();
      if (t.bank >= TARGET && !ended) endGame(i, 'target');
    }
    const laserOn = (lz) => ((T + lz.phase * 0.9) % CYCLE) < CYCLE * 0.5;

    // ---------------- wachters bijwerken ----------------
    function canSee(g, t) {
      if (t.invuln > 0 || inSafe(t) || t.stun > 0.9) return false;
      const dx = t.x - g.x, dz = t.z - g.z, d = Math.hypot(dx, dz);
      const close = t.disguise > 0 ? 1.5 : 1.4; const smell = g.dog && t.carry > 0 && d < 3.6;
      if (d > g.range && !smell) return false;
      if (t.disguise > 0 && d > close) return false;
      if (!(d < close || smell)) { let da = Math.atan2(dx, dz) - g.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > g.half) return false; }
      return los(M, g.x, g.z, t.x, t.z);
    }
    function goChase(g, dt, tg) {
      const t = th[tg]; const dx = t.x - g.x, dz = t.z - g.z, d = Math.hypot(dx, dz);
      const sp = g.chase * GSP;
      if (d < 6 && los(M, g.x, g.z, t.x, t.z)) { const s = Math.min(sp * dt, d); g.x += dx / d * s; g.z += dz / d * s; g.mx = dx / d; g.mz = dz / d; g.moving = 1; g.last = [t.x, t.z]; }
      else { const [c, r] = tileOf(t); navigate(g, c, r, sp, dt); }
      faceTo(g, g.mx || dx, g.mz || dz, dt, 10);
      return d;
    }
    function updateGuard(g, dt) {
      g.moving = 0; g.sw += dt;
      for (const t of th) {
        const see = canSee(g, t);
        if (see) { g.sus[t.i] += dt * (1.9 + (1 - Math.min(1, Math.hypot(t.x - g.x, t.z - g.z) / g.range)) * 1.6); g.last = [t.x, t.z]; if (g.state === 'chase' && g.target === t.i) { t.alert = Math.max(t.alert, 3); } }
        else g.sus[t.i] = Math.max(0, g.sus[t.i] - dt * 1.2);
        if (g.sus[t.i] >= 1) { g.sus[t.i] = 0; if (g.state !== 'chase' || g.target !== t.i) { raise(t.i, g); } if (g.state !== 'tired') { g.state = 'chase'; g.target = t.i; g.chaseT = 0; } }
      }
      let sweep = 0;
      if (g.state === 'patrol') {
        const [c, r] = g.route[g.wpi]; const arr = g.wait > 0 ? false : navigate(g, c, r, g.speed * GSP, dt);
        if (g.wait > 0) { g.wait -= dt; sweep = Math.sin(g.sw * 1.7) * 0.9; if (g.wait <= 0) g.wpi = (g.wpi + 1) % g.route.length; }
        else if (arr) g.wait = 0.7 + rnd() * 0.8;
        else faceTo(g, g.mx, g.mz, dt, 7);
      } else if (g.state === 'investigate') {
        const arr = g.wait > 0 ? false : navigate(g, g.goal[0], g.goal[1], g.speed * 1.5 * GSP, dt);
        if (g.wait > 0) { g.wait -= dt; sweep = Math.sin(g.sw * 2.2) * 1.1; if (g.wait <= 0) { g.state = 'patrol'; g.goal = null; } }
        else if (arr) g.wait = 3.2; else faceTo(g, g.mx, g.mz, dt, 8);
      } else if (g.state === 'chase') {
        const t = th[g.target]; g.chaseT += dt;
        const d = goChase(g, dt, g.target);
        if (g.dog && g.chaseT > 4.2) { g.state = 'tired'; g.stateT = 0; }
        else if (t.alert <= 0 && !canSee(g, t) && g.chaseT > 1.5) { g.state = 'search'; g.stateT = 0; g.goal = null; }
        if (d < 1.0 && g.state === 'chase') jail(g.target, g);
      } else if (g.state === 'search') {
        g.stateT += dt; const l = g.last || [g.x, g.z]; const [c, r] = nearestFloor(l[0], l[1]);
        const arr = navigate(g, c, r, g.speed * 1.4 * GSP, dt);
        if (arr) sweep = Math.sin(g.sw * 2) * 1.2; else faceTo(g, g.mx, g.mz, dt, 8);
        if (g.stateT > 4.5) { g.state = 'patrol'; }
      } else if (g.state === 'tired') { g.stateT += dt; sweep = 0; if (g.stateT > 2.6) { g.state = 'patrol'; g.chaseT = 0; } }
      // touch-vangst door elke wakkere wachter
      if (g.state !== 'tired') for (const t of th) if (Math.hypot(t.x - g.x, t.z - g.z) < 0.95 && t.invuln <= 0 && !inSafe(t) && t.stun <= 0.9) jail(t.i, g);
      const p = { x: g.x, z: g.z }; if (pushOut(M, p, 0.35)) { g.x = p.x; g.z = p.z; }
      g.ys = sweep;
    }
    function updateDragon(dt) {
      const d = drag; d.zT -= dt; d.cool = Math.max(0, d.cool - dt);
      if (d.state === 'sleep') {
        let near = 0;
        for (const t of th) { const dist = Math.hypot(t.x - d.x, t.z - d.z); if (dist < 7.5 && t.invuln <= 0) near = Math.max(near, (Math.hypot(t.vx, t.vz) > 1 ? 0.14 : 0.04) + (t.progT ? 0.45 : 0)); }
        if (d.cool <= 0) d.meter = clamp(d.meter + (near > 0 ? near * dt : -0.12 * dt), 0, 1.2);
        if (d.zT <= 0) { d.zT = 1.6; fx.texts.add('Zzz', d.x + 1, 3.4, d.z - 1, '#aee0ff', 1.0); }
        if (d.meter >= 1) wakeDragon(th[0].progT || Math.hypot(th[0].x - d.x, th[0].z - d.z) < Math.hypot(th[1].x - d.x, th[1].z - d.z) ? 0 : 1);
        d.icon.visible = true; d.icon.position.set(d.x, 4.2, d.z); d.icon.scale.setScalar(1 + d.meter * 0.5); d.icon.material.color.setRGB(1, 1 - d.meter * 0.6, 1 - d.meter * 0.8);
        d.model.update(dt * 0.3);
      } else {
        d.icon.visible = false; d.stateT += dt; d.moving = 0;
        if (d.state === 'awake') {
          // dichtstbijzijnde dief jagen
          let tg = d.target; if (tg < 0 || Math.hypot(th[1 - tg].x - d.x, th[1 - tg].z - d.z) < Math.hypot(th[tg].x - d.x, th[tg].z - d.z) * 0.6) tg = Math.hypot(th[0].x - d.x, th[0].z - d.z) < Math.hypot(th[1].x - d.x, th[1].z - d.z) ? 0 : 1; d.target = tg;
          const t = th[tg]; const dx = t.x - d.x, dz = t.z - d.z, dist = Math.hypot(dx, dz);
          if (dist < 7 && los(M, d.x, d.z, t.x, t.z)) { const s = Math.min(d.chase * GSP * dt, dist); d.x += dx / dist * s; d.z += dz / dist * s; d.mx = dx / dist; d.mz = dz / dist; d.moving = 1; } else { const [c, r] = tileOf(t); navigate(d, c, r, d.chase * GSP, dt); }
          faceTo(d, d.mx || dx, d.mz || dz, dt, 5);
          if (Math.random() < dt * 22) fx.particles.emit(d.x + Math.sin(d.yaw) * 1.8, 1.6, d.z + Math.cos(d.yaw) * 1.8, Math.sin(d.yaw) * 4, 0.4, Math.cos(d.yaw) * 4, { life: 0.5, size: 0.8, color: Math.random() < 0.5 ? 0xff6a1a : 0xffd23f, gravity: -2 });
          if (dist < 1.7 && t.invuln <= 0 && !inSafe(t) && t.stun <= 0.9) jail(tg, d);
          if (d.stateT > 9.5) { d.state = 'return'; d.stateT = 0; d.target = -1; hud.toast('De draak gaat weer slapen...', 1400); }
        } else if (d.state === 'return') {
          const arr = navigate(d, d.home[0], d.home[1], d.speed * GSP, dt); if (!arr) faceTo(d, d.mx, d.mz, dt, 5);
          else { d.yaw = damp(d.yaw, Math.PI, 3, dt); if (d.stateT > 2) { d.state = 'sleep'; d.cool = 10; d.meter = 0; d.cone.mesh.visible = false; } }
          if (d.stateT > 14) { d.state = 'sleep'; d.x = tx(d.home[0]); d.z = tz(d.home[1]); d.cool = 10; d.meter = 0; d.cone.mesh.visible = false; }
        }
        d.model.update(dt);
      }
      const p = { x: d.x, z: d.z }; if (d.state !== 'sleep' && pushOut(M, p, 0.5)) { d.x = p.x; d.z = p.z; }
    }
    function updateChicken(c, dt) {
      c.t += dt; c.cool = Math.max(0, c.cool - dt);
      let moved = 0;
      if (c.state === 'wander') {
        if (c.wait > 0) c.wait -= dt;
        else {
          if (!c.goal) { const o = floorTiles[(rnd() * floorTiles.length) | 0]; c.goal = o; }
          const arr = navigate(c, c.goal[0], c.goal[1], 1.9 * GSP, dt); moved = 1; if (arr) { c.goal = null; c.wait = 1 + rnd() * 2.5; }
        }
        if (c.cool <= 0) for (const t of th) if (t.carry > 0 && !inSafe(t) && Math.hypot(t.x - c.x, t.z - c.z) < 4 && t.invuln <= 0) { c.state = 'chase'; c.tg = t.i; c.t = 0; fx.texts.add('KO-KO-KODET!', c.x, 2.6, c.z, '#fff6c0', 1.1); sfx('boing', { vol: 0.4, rate: 1.6 }); }
      } else if (c.state === 'chase') {
        const t = th[c.tg]; const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
        if (t.carry <= 0 || inSafe(t) || c.t > 6) { c.state = 'wander'; c.goal = null; c.cool = 5; }
        else if (d < 0.95) {
          const amt = Math.min(t.carry, Math.max(15, Math.round(t.carry * 0.25))); t.carry -= amt; c.carry = amt; c.state = 'flee'; c.t = 0; c.goal = null; stats.chicken++;
          fx.texts.add(`KIP STAAL ${amt}!`, c.x, 3, c.z, '#ffd23f', 1.4); sfx('hurt', { vol: 0.4, rate: 1.5 }); fx.particles.burst(c.x, 1, c.z, { count: 14, speed: 4, up: 1.2, life: 0.6, size: 0.3, colors: [0xffffff, 0xffd23f], gravity: 6 });
        } else { const [cc, rr] = tileOf(t); if (d < 3 && los(M, c.x, c.z, t.x, t.z)) { const s = Math.min(3.8 * GSP * dt, d); c.x += dx / d * s; c.z += dz / d * s; c.mx = dx / d; c.mz = dz / d; } else navigate(c, cc, rr, 3.6 * GSP, dt); moved = 1; }
      } else if (c.state === 'flee') {
        if (!c.goal) { let best = null, bd = -1; for (let k = 0; k < 8; k++) { const o = floorTiles[(rnd() * floorTiles.length) | 0]; const dd = Math.min(Math.hypot(tx(o[0]) - th[0].x, tz(o[1]) - th[0].z), Math.hypot(tx(o[0]) - th[1].x, tz(o[1]) - th[1].z)); if (dd > bd) { bd = dd; best = o; } } c.goal = best; }
        const arr = navigate(c, c.goal[0], c.goal[1], 4.8 * GSP, dt); moved = 1; if (arr) c.goal = null;
        for (const t of th) if (Math.hypot(t.x - c.x, t.z - c.z) < 1.1 && t.stun <= 0) { t.carry += c.carry + 5; fx.texts.add(`TERUG! +${c.carry + 5}`, c.x, 3, c.z, '#8dff6a', 1.3); sfx('powerup', { vol: 0.5 }); c.carry = 0; c.state = 'wander'; c.goal = null; c.cool = 8; break; }
        if (c.state === 'flee' && c.t > 8) { dropPile(c.x, c.z, c.carry, 0.5); c.carry = 0; c.state = 'wander'; c.goal = null; c.cool = 10; }
      }
      const p = { x: c.x, z: c.z }; if (pushOut(M, p, 0.3)) { c.x = p.x; c.z = p.z; }
      if (moved) faceTo(c, c.mx || 0, c.mz || 0, dt, 10);
      c.a.speed = moved ? (c.state === 'wander' ? 0.5 : 1) : 0; c.a.targetYaw = c.yaw; c.a.update(dt);
    }
    function updateDeurman(dt) {
      if (!dm.on) {
        dm.next -= dt;
        if (dm.next <= 0 && T > 15) {
          let o, tries = 0; do { o = floorTiles[(rnd() * floorTiles.length) | 0]; tries++; } while (tries < 40 && (Math.hypot(tx(o[0]) - th[0].x, tz(o[1]) - th[0].z) < 14 || Math.hypot(tx(o[0]) - th[1].x, tz(o[1]) - th[1].z) < 14));
          dm.on = true; dm.t = 0; dm.x = tx(o[0]); dm.z = tz(o[1]); dm.g.group.visible = true; dm.next = 35; stats.deurman++;
          hud.toast('Wie klopt daar...? De Deurman komt kijken. Niet beginnen te schreeuwen!', 2600); sfx('knock', { vol: 0.6 }); sfx('creak', { vol: 0.4 });
          fx.particles.burst(dm.x, 1, dm.z, { count: 20, speed: 3, up: 1, life: 1, size: 0.5, colors: [0xffffff, 0x8888aa], gravity: -1 });
        }
        return;
      }
      dm.t += dt;
      let tg = th[0].carry === th[1].carry ? (Math.hypot(th[0].x - dm.x, th[0].z - dm.z) < Math.hypot(th[1].x - dm.x, th[1].z - dm.z) ? 0 : 1) : (th[0].carry > th[1].carry ? 0 : 1);
      const t = th[tg]; const [c, r] = tileOf(t); const sp = 2.2 * GSP;
      const arr = navigate(dm, c, r, sp, dt); dm.g.faceDir(dm.mx || 0, dm.mz || 0); dm.g.speed = 0.6; dm.g.update(dt);
      if (inSafe(t)) { /* in je luik ben je veilig */ }
      else if (Math.hypot(t.x - dm.x, t.z - dm.z) < 1.1 && t.invuln <= 0) { jail(tg, null); fx.texts.add('DEURMAN!', dm.x, 4, dm.z, '#c8c8d8', 1.5); }
      if (dm.t > 14) { dm.on = false; dm.g.group.visible = false; fx.particles.burst(dm.x, 1.5, dm.z, { count: 24, speed: 3, up: 1, life: 1, size: 0.5, colors: [0xffffff, 0x8888aa], gravity: -1 }); hud.toast('De Deurman is weer weg. Rustig maar.', 1500); }
      dm.g.group.position.set(dm.x, 0, dm.z);
    }
    function spawnHat() {
      const h = hats.find((q) => !q.on); if (!h) return;
      const trail = th[0].bank === th[1].bank ? -1 : th[0].bank < th[1].bank ? 0 : 1;
      let o, tries = 0; do { o = floorTiles[(rnd() * floorTiles.length) | 0]; tries++; } while (tries < 40 && ((o[0] >= 9 && o[0] <= 15 && o[1] <= 3) || M.ch[o[1]][o[0]] !== '.' || (trail >= 0 && rnd() < 0.7 && tileSide(o[0]) !== trail)));
      h.on = true; h.x = tx(o[0]); h.z = tz(o[1]); h.life = 18; h.g.visible = true; h.g.position.set(h.x, 0, h.z);
      fx.particles.ring(h.x, 0.4, h.z, { count: 16, speed: 3, color: 0xff9ae0, size: 0.3, life: 0.6 }); sfx('sparkle', { vol: 0.4 });
      if (!stats.hatTold) { stats.hatTold = true; hud.toast('🎩 Een verkleedhoed! Met hoed zien wachters je niet (alleen van dichtbij).', 2400); }
    }

    // ---------------- einde ----------------
    function endGame(w, how) {
      if (ended) return; ended = true; endT = 0; winner = w; stats.how = how;
      th[w].c.pose = 'cheer'; th[1 - w].c.pose = 'sad'; hud.setTimer(null);
      hud.showBig(how === 'target' ? `${names[w]} HEEFT ${TARGET}!` : 'TIJD OM!', 2000, '#ffd23f'); sfx('bell', { vol: 0.8 });
      const h = hatchPos(w); fx.particles.burst(h.x, 2, h.z, { count: 70, speed: 9, up: 1.4, life: 1.5, size: 0.6, colors: [0xffd23f, 0xffffff, 0xff6fa5, 0x6fd8ff], gravity: 5 });
    }
    function finishGame() {
      if (finished) return; finished = true;
      const w = winner, l = 1 - w;
      const jokes = [`${names[w]} ging er met ${th[w].bank} goud vandoor. ${names[l]} had ${th[l].bank} en een hoofd vol alarmbellen.`, `Het kasteel is leeg! ${names[w]} (${th[w].bank}) is de slimste dief, ${names[l]} (${th[l].bank}) stond vooral in de gevangenis.`, `${names[w]} sloop als een kat. ${names[l]} sloop als een olifant. ${th[w].bank} tegen ${th[l].bank}.`];
      ctx.finishPvp({ winner: w, score: [th[0].bank, th[1].bank], delay: 600, summary: `${pick(jokes)} (${stats.alarms[0] + stats.alarms[1]} alarmen, ${stats.caught[0] + stats.caught[1]}x gepakt${stats.crown ? ', de kroon is gestolen' : ''}${stats.chicken ? `, de kip stal ${stats.chicken}x` : ''}.)` });
    }
    function timeUp() {
      const a = th[0], b = th[1]; let w;
      if (a.bank !== b.bank) w = a.bank > b.bank ? 0 : 1;
      else if (a.carry !== b.carry) w = a.carry > b.carry ? 0 : 1;
      else if (a.opened !== b.opened) w = a.opened > b.opened ? 0 : 1;
      else w = rnd() < 0.5 ? 0 : 1;
      endGame(w, 'time');
    }
    function refreshHud() { hud.setScore(`${names[0]} ${th[0].bank}  –  ${th[1].bank} ${names[1]}`); }

    // ---------------- hoofdupdate ----------------
    function update(dt) {
      T += dt;
      if (ended) { endT += dt; if (endT > 2.6) { finishGame(); return; } }
      else {
        const left = MATCH_TIME - T; hud.setTimer(Math.max(0, left), 12);
        if (left <= 0) timeUp();
        if (!lastCall && left < 12) { lastCall = true; hud.showBig('LAATSTE 12 SECONDEN!', 1300, '#ff6a4a'); hud.toast('Breng je buit naar je luik! Wat je draagt telt niet mee.', 2400); sfx('bell', { vol: 0.5 }); }
        for (const t of th) updateThief(t, dt);
        for (const g of guards) updateGuard(g, dt);
        updateDragon(dt);
        for (const c of chickens) updateChicken(c, dt);
        updateDeurman(dt);
        // hoeden
        hatT -= dt; if (hatT <= 0) { hatT = 11 + rnd() * 5; spawnHat(); }
        for (const h of hats) if (h.on) { h.life -= dt; if (h.life <= 0) { h.on = false; h.g.visible = false; } }
        // kisten verversen
        for (const ch of chests) if (!ch.full) { ch.refill -= dt; if (ch.refill <= 0) { ch.full = true; fx.particles.ring(ch.x, 0.5, ch.z, { count: 14, speed: 3, color: 0xffe680, size: 0.3, life: 0.6 }); sfx('sparkle', { vol: 0.25, rate: 1.4 }); } }
        for (const p of piles) if (p.on) { p.life -= dt; if (p.life <= 0) { p.on = false; p.g.visible = false; fx.particles.burst(p.x, 0.5, p.z, { count: 8, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffd23f], gravity: 6 }); } }
        crownT = Math.max(0, crownT - dt);
      }
      for (const q of coins) if (q.on) { q.t += dt / 0.55; const u = Math.min(1, q.t); q.m.position.set(lerp(q.sx, q.ex, u), 0.8 + Math.sin(u * Math.PI) * 2.2, lerp(q.sz, q.ez, u)); q.m.rotation.x += dt * 14; if (u >= 1) coinLand(q); }
      for (const m of coinMarks) if (m.visible) { m.userData.t -= dt; m.material.opacity = 0.5 * Math.min(1, m.userData.t); if (m.userData.t <= 0) m.visible = false; }
      alarm = Math.max(0, alarm - dt * 0.4);
      visuals(dt);
    }

    // ---------------- visuals ----------------
    let camX = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max((W * TILE / 2 + 2.5) / (tanH * asp), 20.5 / tanH) * 0.98;
      const sway = Math.sin((T + introT) * 0.2) * 0.6;
      camera.position.set(sway, dist * 0.96, dist * 0.27 + 0.5); camera.lookAt(sway * 0.5, 0, -1.6);
    }
    const tmpC = new THREE.Color();
    function visuals(dt) {
      const tt = T + introT;
      const base = (crownT > 0 ? 0.7 : 0) + (!ended && T > MATCH_TIME - 12 ? 0.25 : 0);
      const al = Math.min(1, Math.max(alarm, base)) * (0.75 + 0.25 * Math.sin(tt * 8));
      L.hemi.color.copy(baseHemi).lerp(red, al * 0.7); L.sun.color.copy(baseSun).lerp(red, al * 0.6); L.hemi.intensity = 1.6 + al * 0.3;
      S.wash.material.opacity = al * 0.2; S.updTorches(tt);
      for (const h of S.hatches) { h.beam.material.opacity = 0.16 + Math.sin(tt * 3) * 0.05 + (T > MATCH_TIME - 12 ? 0.12 : 0); h.hole.material.opacity = 0.35 + Math.sin(tt * 3) * 0.1; }
      S.lasers.forEach((l, k) => { const lz = M.lasers[k]; const ph = (T + lz.phase * 0.9) % CYCLE; const on = ph < CYCLE * 0.5, warn = ph > CYCLE - 0.45; const vis = on || (warn && Math.sin(tt * 40) > 0); l.beam.visible = l.beam2.visible = l.halo.visible = vis; });
      // kisten
      for (const ch of chests) {
        const u = ch.g.userData;
        if (ch.kind === 'K') { u.crown.visible = ch.full; u.crown.rotation.y += dt * 1.5; u.crown.position.y = 1.15 + Math.sin(tt * 2) * 0.1; u.beam.visible = ch.full; u.glow.visible = ch.full; continue; }
        ch.open = damp(ch.open, ch.full ? Math.max(ch.prog[0], ch.prog[1]) * 0.5 : 1, 10, dt);
        u.lid.rotation.x = -ch.open * 1.7; u.hoard.visible = ch.full && ch.open > 0.05; u.glow.visible = ch.full; u.glow.material.opacity = 0.35 + Math.sin(tt * 3 + ch.x) * 0.12;
        ch.prog[0] = Math.max(0, ch.prog[0] - dt * 0.5); ch.prog[1] = Math.max(0, ch.prog[1] - dt * 0.5);
      }
      for (const p of piles) if (p.on) { p.g.rotation.y += dt; p.g.userData.glow.material.opacity = 0.4 + Math.sin(tt * 5) * 0.15; }
      for (const h of hats) if (h.on) { h.g.userData.hat.rotation.y += dt * 2; h.g.userData.hat.position.y = 0.55 + Math.sin(tt * 3) * 0.12; h.g.visible = h.life > 3 || Math.sin(h.life * 16) > 0; }
      // dieven
      for (const t of th) {
        t.holder.position.set(t.x, Math.abs(Math.sin(tt * 9)) * (Math.hypot(t.vx, t.vz) > 1 ? 0.12 / GRAV : 0), t.z);
        t.c.faceDir(t.fx, t.fz); t.c.speed = clamp(Math.hypot(t.vx, t.vz) / 5, 0, 1);
        if (t.cheerT > 0) t.cheerT -= dt;
        t.c.pose = ended ? t.c.pose : t.cheerT > 0 ? 'cheer' : t.stun > 0.5 ? 'scared' : t.progT ? 'push' : t.carry > 0 ? 'carry' : 'idle';
        t.c.update(dt);
        t.c.sack.visible = t.carry > 0; t.c.sack.scale.setScalar(clamp(0.7 + t.carry / 140, 0.7, 2.0) * 0.9);
        t.c.dhat.visible = t.disguise > 0 && (t.disguise > 1.5 || Math.sin(tt * 20) > 0);
        t.c.group.visible = t.invuln > 0 && t.stun <= 0 ? Math.sin(tt * 30) > -0.4 : true;
        t.ring.position.set(t.x, 0.12, t.z); t.ring.scale.setScalar(t.R / R0 * (1 + Math.sin(tt * 6 + t.i) * 0.04));
        t.tag.position.set(t.x, 4.5, t.z - 0.2); const key = `${t.carry}|${t.crown}`; if (key !== t.lastTag) { t.lastTag = key; t.tag.userData.set(names[t.i] + (t.crown ? ' (KROON)' : ''), players[t.i].css, t.carry); }
        const showBar = t.prog > 0.02 || t.depT > 0.02 || t.dropT > 0.05; const pr = t.prog > 0.02 ? t.prog : t.depT > 0.02 ? t.depT / 0.45 : t.dropT / 0.7;
        t.bg.visible = t.fill.visible = showBar; t.bg.position.set(t.x, 2.9, t.z - 1.0); t.fill.position.set(t.x - 1.15 * (1 - clamp(pr, 0.02, 1)), 2.9, t.z - 1.0); t.fill.scale.x = clamp(pr, 0.02, 1);
        t.fill.material.color.set(t.depT > 0.02 ? 0x8dff6a : t.dropT > 0.05 ? 0xff8a5a : 0xffe14a);
        t.bang.visible = t.alert > 0 && !ended; t.bang.position.set(t.x, 4.3 + Math.sin(tt * 12) * 0.15, t.z); t.bang.scale.setScalar(1 + Math.sin(tt * 12) * 0.1);
        const bt = `${t.carry ? `Zak ${t.carry} · ` : ''}${t.bCd > 0 ? `munt ${t.bCd.toFixed(0)}s` : 'munt klaar'}${t.disguise > 0 ? ' · hoed' : ''}${t.comeback ? ' · inhaal!' : ''}${t.prompt ? ` · ${t.prompt}` : ''}`;
        if (bt !== t.lastTxt) { t.lastTxt = bt; hud.setPlayerInfo(t.i, bt); }
      }
      refreshHudThrottle();
      // wachters
      for (const g of guards) {
        g.grp.position.set(g.x, 0, g.z);
        const look = g.yaw + (g.ys || 0);
        if (g.dog) { g.grp.rotation.y = look; const u = g.model.userData; const f = Math.sin(tt * (g.state === 'chase' ? 22 : 11) + g.k); u.legs.forEach((l, k) => { l.rotation.x = (g.moving ? f * 0.7 : 0) * (k % 2 ? 1 : -1); }); u.tail.rotation.z = Math.sin(tt * 14) * 0.5; u.head.rotation.x = g.state === 'tired' ? 0.5 : Math.sin(tt * 3 + g.k) * 0.05; g.grp.position.y = g.moving ? Math.abs(f) * 0.08 : 0; }
        else { g.model.faceDir(Math.sin(look), Math.cos(look)); g.model.speed = g.moving ? (g.state === 'chase' ? 1 : 0.5) : 0; g.model.pose = g.state === 'chase' ? 'scared' : 'idle'; g.model.update(dt); }
        const col = g.state === 'chase' ? 0xff3a2a : g.state === 'investigate' || g.state === 'search' ? 0xffa030 : g.state === 'tired' ? 0x8888aa : g.dog ? 0xffc8a0 : 0xffeea0;
        g.cone.setColor(col, g.state === 'chase' ? 0.62 : 0.5); g.cone.mesh.visible = g.state !== 'tired';
        g.cone.update(M, g.x, g.z, look, g.range, g.half);
        const sus = Math.max(g.sus[0], g.sus[1]);
        const ic = g.state === 'chase' ? '!' : (g.state === 'investigate' || g.state === 'search' || sus > 0.05) ? '?' : null;
        g.icon.visible = !!ic; if (ic) { g.icon.material.map = iconTex[ic]; g.icon.position.set(g.x, 4.0 + Math.sin(tt * 8) * 0.1, g.z); g.icon.scale.setScalar(ic === '!' ? 1.6 : 0.9 + sus * 1.0); g.icon.material.color.set(ic === '!' ? 0xff5a4a : 0xffe14a); }
      }
      // draak
      if (drag.state !== 'sleep') { drag.grp.position.set(drag.x, 0, drag.z); drag.grp.rotation.y = drag.yaw + (drag.state === 'awake' ? Math.sin(tt * 2) * 0.1 : 0); drag.cone.setColor(0xff4a1a, 0.55); drag.cone.update(M, drag.x, drag.z, drag.yaw, drag.range, drag.half); }
      // kippen
      for (const c of chickens) { c.grp.position.set(c.x, 0, c.z); if (c.carry > 0 && Math.random() < dt * 8) fx.particles.emit(c.x, 1.6, c.z, 0, 1, 0, { life: 0.4, size: 0.3, color: 0xffd23f, gravity: 0 }); }
      if (dm.on) dm.g.group.position.set(dm.x, 0, dm.z);
      updateCamera(dt);
    }
    function refreshHudThrottle() { if (T - (refreshHudThrottle.t || 0) > 0.3) { refreshHudThrottle.t = T; refreshHud(); } }

    function resultUpdate(dt) { T += dt; for (const t of th) { t.c.update(dt); } updateCamera(dt); S.updTorches(T); }
    function introUpdate(dt) {
      introT += dt; for (const t of th) { t.c.pose = 'wave'; t.holder.position.set(t.x, 0, t.z); t.c.faceDir(0, 1); t.c.update(dt); t.ring.position.set(t.x, 0.12, t.z); t.tag.position.set(t.x, 4.5, t.z - 0.2); t.bang.visible = false; t.bg.visible = t.fill.visible = false; }
      for (const g of guards) { g.sw += dt; g.ys = Math.sin(g.sw * 0.9) * 0.6; g.grp.position.set(g.x, 0, g.z); const look = g.yaw + g.ys; if (g.dog) g.grp.rotation.y = look; else { g.model.faceDir(Math.sin(look), Math.cos(look)); g.model.update(dt); } g.cone.update(M, g.x, g.z, look, g.range, g.half); }
      drag.model.update(dt * 0.3); drag.icon.position.set(drag.x, 4.2, drag.z); S.updTorches(introT);
      for (const ch of chests) if (ch.kind === 'K') ch.g.userData.crown.rotation.y += dt * 1.5;
      updateCamera(dt);
    }
    refreshHud(); introUpdate(0.001);
    S.lasers.forEach((l) => { l.beam.visible = false; });

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const t of th) fx.particles.burst(t.x, 1.5, t.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const t = th[i]; const lose = Math.ceil(t.carry * 0.3); if (lose > 0) { t.carry -= lose; dropPile(t.x, t.z, lose, 1); } t.stun = 0.6; fx.texts.add('BEWOOG!', t.x, 3.6, t.z, '#c8c8d8', 1.4); sfx('static', { vol: 0.4 }); ctx.shake(0.3); } });
      },
      celebrate(w) { th[w].c.pose = 'cheer'; th[1 - w].c.pose = 'sad'; },
      dispose() {},
      dbg: {
        M, th, guards, drag, chests, piles, chickens, dm, hats, stats, TILE,
        state: () => ({ T, ended, finished, winner, left: MATCH_TIME - T, bank: th.map((t) => t.bank), carry: th.map((t) => t.carry), alert: th.map((t) => +t.alert.toFixed(1)), caught: [...stats.caught], alarms: [...stats.alarms], stun: th.map((t) => t.stun), pos: th.map((t) => [t.x, t.z]), gstates: guards.map((g) => g.state), dragon: drag.state, meter: +drag.meter.toFixed(2), crownT, stats, hatCd: th.map((t) => t.bCd), full: chests.map((c) => c.full), disguise: th.map((t) => t.disguise) }),
        setTime: (t) => { T = MATCH_TIME - t; }, give: (i, n) => { th[i].carry += n; }, setBank: (i, n) => { th[i].bank = n; refreshHud(); }, raise, jail, wakeDragon, spawnHat, bankIt, openChest,
        startDeurman: () => { dm.next = 0; T = Math.max(T, 16); }, noise, throwCoin, tp: (i, x, z) => { th[i].x = x; th[i].z = z; },
        fieldTo: (gc, gr) => bfsField(M, gc, gr), stepDir, cx_, cz_, tx, tz, setCrownPile: () => {},
      },
    };
  },
};

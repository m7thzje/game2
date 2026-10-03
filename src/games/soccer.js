import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildArena, ARENA, PADS, makeCar, makeBall, makeUfo } from './soccer_world.js';

// Raket-Voetbal — duel: mini-voetbal met bumper-karretjes in een neon-stadion. Eerste tot 5 goals of 80 s, daarna gouden goal.
//  * richtingen = sturen (met slip/gas-gevoel), A = TURBO (tank vult bij boost-pads), B = SCHOT (springt + beukt de bal weg)
//  * doelpunten met slow-motion herhaling; power-ups: reuzenbal, magneet, tweede bal; een UFO die de bal verplaatst
//  * comeback: wie 2 of meer achterstaat krijgt gratis turbo en een harder schot; items verschijnen vaker aan zijn kant

const { LX, LZ, GW, GD, GH, SEG } = ARENA;
const BR0 = 1.05, CR0 = 1.05;           // straal bal / auto
const WIN = 5, MATCH_TIME = 80, GOLD_MAX = 40;
const CAR_V = 14.5, BOOST_V = 23, BALL_VMAX = 44;
const KICK_T = 0.3;
const REPLAY_FPS = 30, REPLAY_LEN = 54;
// muren waar de bal alleen tegenaan stuitert als hij boven de lat vliegt (de "lat" van het doel)
const BAR = [[LX, -GW, LX, GW], [-LX, -GW, -LX, GW]];

const ITEMS = [
  { id: 'giant', name: 'REUZENBAL!', col: '#ffb24a', w: 1 },
  { id: 'magnet', name: 'MAGNEET!', col: '#8fb8ff', w: 1 },
  { id: 'twin', name: 'TWEEDE BAL!', col: '#7dffb0', w: 1 },
];
function iconTex(id) {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineJoin = 'round'; g.lineCap = 'round';
    const ball = (x, y, r, c) => { g.fillStyle = c; g.strokeStyle = '#1a1030'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke(); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x, y, r * 0.35, 0, TAU); g.fill(); };
    if (id === 'giant') { ball(64, 70, 42, '#ffe9c0'); g.strokeStyle = '#ff7a2a'; g.lineWidth = 9; for (const a of [-1, 1]) { g.beginPath(); g.moveTo(64 + a * 30, 22); g.lineTo(64 + a * 52, 4); g.moveTo(64 + a * 52, 22); g.lineTo(64 + a * 52, 4); g.lineTo(64 + a * 34, 4); g.stroke(); } }
    else if (id === 'magnet') { g.strokeStyle = '#d83a2a'; g.lineWidth = 22; g.beginPath(); g.arc(64, 60, 34, Math.PI, 0); g.lineTo(98, 96); g.moveTo(30, 60); g.lineTo(30, 96); g.stroke(); g.strokeStyle = '#f0f0ff'; g.lineWidth = 22; g.beginPath(); g.moveTo(30, 90); g.lineTo(30, 108); g.moveTo(98, 90); g.lineTo(98, 108); g.stroke(); g.strokeStyle = '#8fb8ff'; g.lineWidth = 5; g.beginPath(); g.arc(64, 60, 52, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else { ball(40, 48, 28, '#ffffff'); ball(84, 82, 28, '#ffd23f'); }
  });
}

export default {
  id: 'soccer',
  name: 'Raket-Voetbal',
  giver: 'Scheids Rocky',
  icon: '⚽',
  mode: 'pvp',
  time: 80,
  music: 'game_fast',
  blurb: 'Mini-voetbal met <b>bumper-karretjes</b> in het neon-stadion! Beuk de grote bal in het doel van je broer: eerste tot <b>5 goals</b> of de meeste na 80 s. Pak <b>power-ups</b> en pas op voor de <b>UFO</b>!',
  controls: ['{move} sturen', '{a} TURBO (tank vullen op pads)', '{b} SCHOT: beuk de bal weg'],
  tip: 'Rij met turbo over de gloeiende pads om bij te tanken. Wie 2 achterstaat krijgt gratis turbo en een harder schot.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = ctx.twist.speed && (tw === 'turbo' || tw === 'slowmo') ? ctx.twist.speed : 1;
    const PHYS_T = 1 + (TEMPO - 1) * 0.45;
    const GBALL = 26 * lerp(1, GRAV, 0.8);
    const colorsCss = ['rgba(60,200,120,1)', 'rgba(70,140,255,1)'];

    const L = ctx.lights('cave', { shadow: 28, center: [0, 0, 0], fog: false });
    L.hemi.intensity = 1.2; L.hemi.color.set(0x9a8cff); L.hemi.groundColor.set(0x3a1a6a);
    L.sun.color.set(0xffe6ff); L.sun.intensity = 1.9; L.sun.position.set(-10, 40, 22);
    camera.fov = 40; camera.updateProjectionMatrix();
    scene.add(camera);                                    // nodig voor de herhaling-balken die aan de camera hangen
    const A = buildArena(ctx, L, colorsCss);

    // ---------------- ballen ----------------
    const balls = [0, 1].map((k) => {
      const m = makeBall(); const shadow = P.shadowBlob(1.4); const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 28), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2;
      scene.add(m, shadow, ring); m.visible = shadow.visible = ring.visible = k === 0;
      return { k, on: k === 0, m, shadow, ring, x: 0, z: 0, h: BR0, vx: 0, vz: 0, vh: 0, r: BR0, r0: BR0, last: -1, frozen: false, life: 0, rotQ: new THREE.Quaternion(), trailT: 0 };
    });
    balls[1].m.material = balls[1].m.material.clone(); balls[1].m.material.emissive.set(0xff7a2a); balls[1].m.material.emissiveIntensity = 0.45;
    const main = balls[0];

    // ---------------- auto's ----------------
    const cars = players.map((pp, i) => {
      const dir = i ? -1 : 1; const m = makeCar(i); scene.add(m.g);
      const shadow = P.shadowBlob(1.9); scene.add(shadow);
      const tagTex = canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(10,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(pp.name, w / 2, hh / 2); c.fillStyle = pp.css; c.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(3.0, 1.12, 1); tag.renderOrder = 15; scene.add(tag);
      const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x10102a, transparent: true, opacity: 0.8, depthTest: false })); barBg.scale.set(2.6, 0.34, 1); barBg.renderOrder = 16; barBg.center.set(0.5, 0.5);
      const barFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd23f, transparent: true, depthTest: false })); barFill.scale.set(2.4, 0.2, 1); barFill.renderOrder = 17; barFill.center.set(0, 0.5);
      scene.add(barBg, barFill);
      const R = CR0 * lerp(1, pv.size(i), 0.6);
      m.g.scale.setScalar(lerp(1, pv.size(i), 0.6));
      return { i, dir, m, shadow, tag, barBg, barFill, R, R0: R, x: -dir * 8.5, z: 0, vx: 0, vz: 0, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, fx: dir, fz: 0, boost: 60, boosting: false, kickT: 9, kickDone: true, cd: 0, hop: 0, stun: 0, frozen: 0, assist: false, magnet: 0, mood: 'play', touches: 0, kicks: 0, ix: 0, iz: 0, mag: 0, wheelRot: 0, infoTxt: '', flameT: 0, bump: 0 };
    });
    cars.forEach((c) => { c.m.g.position.set(c.x, 0, c.z); c.m.g.rotation.y = c.yaw; });

    // ---------------- toestand ----------------
    const score = [0, 0];
    let T = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0, camShake = 0;
    const G = { state: 'kick', t: 0, timeLeft: MATCH_TIME, golden: false, goldT: 0, scorer: -1, end: false, winner: -1, lastGoalSide: 1, kickCount: 4, camX: 0, camPunch: 0, noTouchT: 0, tiebreak: false, goalT: 0 };
    const FX = { giant: 0, magnet: [0, 0], twin: 0 };
    const stats = { goals: [0, 0], kicks: [0, 0], items: 0, ufos: 0, bonks: 0, pads: [0, 0], replays: 0 };
    const lead = (i) => score[1 - i] - score[i];
    // power-up op het veld
    let item = null, itemT = 7; const itemTex = Object.fromEntries(ITEMS.map((it) => [it.id, iconTex(it.id)]));
    const itemG = new THREE.Group(); itemG.visible = false; scene.add(itemG);
    const itemOrb = mesh(new THREE.SphereGeometry(1.1, 14, 10), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, emissive: 0x6a9aff, emissiveIntensity: 0.6, roughness: 0.1 }), { cast: false, pos: [0, 1.5, 0] }); itemG.add(itemOrb);
    const itemIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTex.giant, transparent: true, depthWrite: false })); itemIcon.scale.set(1.9, 1.9, 1); itemIcon.position.y = 1.5; itemG.add(itemIcon);
    const itemRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); itemRing.rotation.x = -Math.PI / 2; itemRing.position.y = 0.06; itemG.add(itemRing);
    // pad-status
    const padT = PADS.map(() => 0);
    // UFO
    const ufoM = makeUfo(); ufoM.g.visible = false; scene.add(ufoM.g);
    const ufoShadow = P.shadowBlob(3); ufoShadow.visible = false; scene.add(ufoShadow);
    const U = { on: false, st: '', t: 0, x: 0, z: 0, y: 13, sx: 0, sz: 0, tx: 0, tz: 0, ball: null };
    let ufoT = rand(15, 21);
    // herhaling
    const rec = new Float32Array(REPLAY_FPS * 4 * 16); let recN = 0, recAcc = 0;
    const R = { on: false, t: 0, i0: 0, n: 0, sg: 0 };
    const REC_N = REPLAY_FPS * 4;
    const frameData = new Float32Array(16);
    // letterbox + REC-label aan de camera
    const ov = new THREE.Group(); ov.visible = false; camera.add(ov);
    const barM = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, fog: false });
    const barT = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barM), barB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barM); barT.renderOrder = barB.renderOrder = 60; ov.add(barT, barB);
    const recLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(384, 96, (c, w, hh) => { c.font = 'bold 54px Fredoka, Arial Black, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 10; c.strokeStyle = 'rgba(0,0,0,.9)'; c.lineJoin = 'round'; c.strokeText('HERHALING', 70, hh / 2); c.fillStyle = '#ffffff'; c.fillText('HERHALING', 70, hh / 2); c.fillStyle = '#ff3a3a'; c.beginPath(); c.arc(36, hh / 2, 20, 0, TAU); c.fill(); }), transparent: true, depthTest: false })); recLabel.renderOrder = 61; ov.add(recLabel);

    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${G.golden ? '  (GOUDEN GOAL)' : ''}`);
      A.scoreboard(names, score, G.timeLeft, G.golden ? 'GOUDEN GOAL' : null);
    }
    function refreshInfo(c) {
      const txt = c.frozen > 0 ? 'Verstijfd!' : c.stun > 0 ? 'Duizelig!' : `⚡${Math.round(c.boost)}% · ${c.cd > 0 ? `schot ${c.cd.toFixed(1)}s` : 'schot klaar'}${c.assist ? ' · EXTRA TURBO' : ''}${c.magnet > 0 ? ' · 🧲' : ''}`;
      if (txt !== c.infoTxt) { c.infoTxt = txt; hud.setPlayerInfo(c.i, `${score[c.i]} goals · ${txt}`); }
    }

    // ---------------- flow ----------------
    function resetKickoff() {
      for (const c of cars) { c.x = -c.dir * 8.5; c.z = 0; c.vx = c.vz = 0; c.yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; c.fx = c.dir; c.fz = 0; c.stun = 0; c.kickT = 9; c.kickDone = true; c.boosting = false; c.mood = 'play'; c.boost = Math.max(c.boost, 45); c.magnet = 0; }
      main.x = 0; main.z = 0; main.h = main.r; main.vx = main.vz = main.vh = 0; main.last = -1; main.frozen = false;
      balls[1].on = false; balls[1].m.visible = balls[1].shadow.visible = balls[1].ring.visible = false;
      FX.giant = 0; FX.magnet[0] = FX.magnet[1] = 0; FX.twin = 0;
      if (item) removeItem(false); itemT = Math.max(itemT, 4);
      G.state = 'kick'; G.t = 0; G.kickCount = 4; main.m.visible = main.shadow.visible = main.ring.visible = true;
      if (U.on) abortUfo(true);
      slow = 1; R.on = false; ov.visible = false;
    }
    function startPlay() { G.state = 'play'; G.t = 0; G.noTouchT = 0; audio.sfx('go', { vol: 0.4 }); fx.texts.add('GA!', 0, 4, 0, '#7dffb0', 2.6); ctx.shake(0.2); }
    function goal(b, scorer) {
      const side = scorer === 0 ? 1 : -1;
      score[scorer]++; stats.goals[scorer]++; G.state = 'goal'; G.t = 0; G.scorer = scorer; G.lastGoalSide = side; slow = 0.28; slowHold = 0.9; G.camPunch = 1; G.goalT = 0;
      G.end = score[scorer] >= WIN || G.golden; if (U.on) abortUfo(false);
      refreshHud();
      const col = scorer ? '#8fb8ff' : '#7dffb0';
      hud.showBig(G.end ? `${names[scorer]} WINT!` : 'GOAAAL!', 1400, col);
      fx.texts.add('GOAL!', side * (LX - 2), 5.5, 0, col, 2.4);
      audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.5 }); audio.sfx('explode', { vol: 0.35 }); ctx.shake(0.9);
      A.cheer(4); A.goalFlash(scorer === 0 ? 1 : 0);
      const gx = side * (LX + 1.5);
      fx.particles.burst(gx, 2, 0, { count: 80, speed: 10, up: 1.3, life: 1.5, size: 0.6, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 7 });
      fx.particles.ring(gx, 1, 0, { count: 32, speed: 9, color: PLAYER_COLORS[scorer], size: 0.5, life: 0.9 });
      cars[scorer].mood = 'cheer'; cars[1 - scorer].mood = 'sad';
      applyAssist();
    }
    function startReplay() {
      R.on = true; R.t = 0; R.n = Math.min(recN, REPLAY_LEN); R.i0 = recN - R.n; G.state = 'replay'; G.t = 0; slow = 1; stats.replays++; ov.visible = true;
      audio.sfx('whoosh', { vol: 0.5 }); audio.tone(520, 0.3, { type: 'triangle', vol: 0.08, slide: 260 });
      for (const c of cars) { c.m.flame.visible = false; }
    }
    function endMatch(winner) {
      G.state = 'end'; G.t = 0; G.winner = winner; slow = 1; R.on = false; ov.visible = false; hud.setTimer(null);
      if (winner != null) { cars[winner].mood = 'cheer'; cars[1 - winner].mood = 'sad'; A.cheer(5); }
    }
    function decideByCloseness() {
      G.tiebreak = true; const d = cars.map((c) => Math.hypot(c.x - main.x, c.z - main.z));
      return Math.abs(d[0] - d[1]) < 0.01 ? (Math.random() < 0.5 ? 0 : 1) : (d[0] < d[1] ? 0 : 1);
    }
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const w = winner, l = winner == null ? null : 1 - winner;
      const jokes = [`${names[w]} vliegt naar de beker! ${names[l]} rijdt nog steeds in cirkels.`, `${names[w]} is de Raket-Koning van de Neonkelder. ${names[l]} zoekt de uitgang.`, `Wat een knal! ${names[w]} wint en ${names[l]} toetert van frustratie.`, `${names[w]} schoot de bal bijna de berg uit. ${names[l]} mist de bal... en het doel.`];
      const extra = [stats.ufos ? `De UFO pikte de bal ${stats.ufos}x mee` : '', stats.items ? `${stats.items} power-ups gepakt` : ''].filter(Boolean).join(' · ');
      ctx.finishPvp({ winner, score: [score[0], score[1]], delay: 800, summary: `${pick(jokes)}${G.tiebreak ? ' Bij precies gelijk besliste: wie het dichtst bij de bal stond.' : ''}${extra ? ` (${extra}.)` : ''}` });
    }
    function applyAssist() {
      for (const c of cars) {
        const want = lead(c.i) >= 2;
        if (want !== c.assist) {
          c.assist = want;
          if (want) { fx.texts.add('EXTRA TURBO!', c.x, 3.4, c.z, '#ffd23f', 1.5); hud.toast(`✨ ${names[c.i]} krijgt gratis turbo en een harder schot!`, 2200); audio.sfx('powerup', { vol: 0.7 }); fx.particles.burst(c.x, 1, c.z, { count: 30, speed: 5, up: 1.4, life: 0.9, size: 0.4, colors: [0xffd23f, 0xffffff], gravity: 3 }); }
        }
      }
    }

    // ---------------- natuurkunde: muren ----------------
    // duwt een cirkel uit alle muren; geeft de laatste normaal terug (of null)
    const hitN = { x: 0, z: 0, hit: false };
    function wallPush(o, r, list, e, tang) {
      hitN.hit = false;
      for (let pass = 0; pass < 2; pass++) for (const [x1, z1, x2, z2] of list) {
        const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz; let t = ((o.x - x1) * dx + (o.z - z1) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = x1 + dx * t, cz = z1 + dz * t, ex = o.x - cx, ez = o.z - cz, d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-4; let nx = ex / d, nz = ez / d;
          if (d < 1e-3) { const L = Math.hypot(dx, dz); nx = -dz / L; nz = dx / L; if (nx * o.x + nz * o.z > 0) { nx = -nx; nz = -nz; } }   // precies op de lijn: duw naar binnen
          o.x = cx + nx * r; o.z = cz + nz * r;
          const vn = o.vx * nx + o.vz * nz;
          if (vn < 0) { const tx = o.vx - vn * nx, tz = o.vz - vn * nz; o.vx = tx * tang - vn * e * nx; o.vz = tz * tang - vn * e * nz; if (!hitN.hit || -vn > hitN.sp) { hitN.sp = -vn; } hitN.hit = true; hitN.x = nx; hitN.z = nz; }
        }
      }
    }
    // ---------------- auto-bal ----------------
    function carBall(c, b) {
      if (b.frozen || b.h - b.r > 1.6) return;
      const dx = b.x - c.x, dz = b.z - c.z, mm = c.R + b.r, d2 = dx * dx + dz * dz; if (d2 >= mm * mm) return;
      let d = Math.sqrt(d2), nx, nz; if (d < 1e-4) { nx = c.fx; nz = c.fz; d = 0; } else { nx = dx / d; nz = dz / d; }
      b.x = c.x + nx * mm; b.z = c.z + nz * mm;
      const vn = (b.vx - c.vx) * nx + (b.vz - c.vz) * nz;
      if (vn < 0) {
        const e = c.boosting ? 0.95 : 0.78, j = -(1 + e) * vn / (1 + 1 / 3.4);
        b.vx += j * nx; b.vz += j * nz; c.vx -= j / 3.4 * nx; c.vz -= j / 3.4 * nz;
        b.vh += Math.min(7, -vn * 0.11); b.last = c.i; c.touches++; G.noTouchT = 0;
        const imp = clamp(-vn / 26, 0, 1);
        if (imp > 0.08) { fx.particles.burst(b.x - nx * b.r, b.h, b.z - nz * b.r, { count: 4 + Math.round(imp * 12), speed: 2 + imp * 5, up: 0.8, life: 0.45, size: 0.3, colors: [0xffffff, PLAYER_COLORS[c.i]], gravity: 7 }); audio.sfx('hit', { vol: 0.15 + imp * 0.55, rate: 0.9 + imp * 0.5 }); if (imp > 0.5) ctx.shake(0.1 + imp * 0.2); }
      }
    }
    function tryKick(c) {
      if (c.kickDone || c.kickT > KICK_T) return;
      let best = null, bd = 1e9;
      for (const b of balls) { if (!b.on || b.frozen || b.h > 3.6) continue; const d = Math.hypot(b.x - c.x, b.z - c.z); if (d < c.R + b.r + 1.15 && d < bd) { bd = d; best = b; } }
      if (!best) return;
      const b = best, dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
      let ax = c.dir * LX - b.x, az = -b.z * 0.55; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      let ox = nx * 0.55 + ax * 0.45, oz = nz * 0.55 + az * 0.45; if (ox * ax + oz * az < 0.35) { ox += ax; oz += az; } const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const sp = Math.min(BALL_VMAX, (25 + Math.max(0, c.vx * ox + c.vz * oz) * 0.4) * (c.assist ? 1.12 : 1) * (FX.giant > 0 ? 0.9 : 1));
      b.vx = ox * sp; b.vz = oz * sp; b.vh = Math.max(b.vh, 7.2 + (c.boosting ? 1.5 : 0)); b.last = c.i; c.touches++; c.kicks++; stats.kicks[c.i]++; c.kickDone = true; G.noTouchT = 0;
      c.cd = c.assist ? 0.5 : 0.75; c.vx -= ox * 3; c.vz -= oz * 3;
      fx.particles.burst(b.x, b.h, b.z, { count: 26, speed: 8, up: 0.7, life: 0.6, size: 0.5, colors: [0xffffff, 0xffe14a, PLAYER_COLORS[c.i]], gravity: 6 });
      fx.particles.ring(b.x, b.h, b.z, { count: 22, speed: 9, color: 0xffe14a, size: 0.38, life: 0.45 });
      fx.texts.add('BAM!', b.x, b.h + 2.4, b.z, '#ffd24a', 1.4);
      audio.sfx('hit', { vol: 0.9 }); audio.sfx('explode', { vol: 0.22 }); audio.sfx('whoosh', { vol: 0.4 }); ctx.shake(0.4);
    }
    function carCar() {
      const a = cars[0], b = cars[1]; const dx = b.x - a.x, dz = b.z - a.z, mm = a.R + b.R, d2 = dx * dx + dz * dz; if (d2 >= mm * mm) return;
      const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d, ov = (mm - d) / 2; a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
      const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; if (vn <= 0) return;
      const ma = 1, mb = 1;
      a.vx -= vn * nx * 0.75; a.vz -= vn * nz * 0.75; b.vx += vn * nx * 0.75; b.vz += vn * nz * 0.75;
      if (vn > 4) {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; audio.sfx('thud', { vol: clamp(vn / 22, 0.15, 0.6), rate: 1.2 }); fx.particles.burst(mx, 0.8, mz, { count: 8 + Math.round(vn), speed: 4, up: 1, life: 0.5, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 6 }); ctx.shake(0.15 + clamp(vn / 40, 0, 0.35));
        // beuk met turbo: de ander wordt even duizelig
        for (const [x, y] of [[a, b], [b, a]]) if (x.boosting && !y.boosting && vn > 8 && y.stun <= 0) { y.stun = 0.7; y.vx += (y.x - x.x) / d * 7; y.vz += (y.z - x.z) / d * 7; stats.bonks++; fx.texts.add('BONK!', y.x, 3, y.z, '#ff7a5a', 1.5); audio.sfx('boing', { vol: 0.5 }); }
      }
    }
    function stepCar(c, h) {
      const speedMul = pv.speed(c.i) * (c.assist ? 1.05 : 1);
      const vmax = (c.boosting ? BOOST_V : CAR_V) * speedMul;
      let tx = 0, tz = 0;
      if (c.mag > 0.1) { tx = c.ix / c.mag * vmax * Math.min(1, c.mag * 1.25); tz = c.iz / c.mag * vmax * Math.min(1, c.mag * 1.25); } else if (c.boosting) { tx = c.fx * vmax; tz = c.fz * vmax; }
      const accel = (c.mag > 0.1 || c.boosting) && c.stun <= 0 && c.frozen <= 0;
      const lam = accel ? lerp(c.boosting ? 8.5 : 5.2, 1.0, SLIP) : lerp(2.6, 0.3, SLIP);
      const k = 1 - Math.exp(-lam * h); c.vx += (tx - c.vx) * k; c.vz += (tz - c.vz) * k;
      c.x += c.vx * h; c.z += c.vz * h;
      wallPush(c, c.R, SEG, 0.25, 0.97);
      if (hitN.hit && hitN.sp > 8 && c.bump <= 0) { c.bump = 0.2; audio.sfx('thud', { vol: clamp(hitN.sp / 30, 0.1, 0.4), rate: 1.5 }); fx.particles.burst(c.x, 0.7, c.z, { count: 6, speed: 3, up: 1, life: 0.4, size: 0.25, colors: [0xffffff, 0xaab0ff], gravity: 6 }); }
    }
    function stepBall(b, h) {
      if (b.frozen) return;
      const onGround = b.h <= b.r + 0.03;
      b.vh -= GBALL * h; b.h += b.vh * h; b.x += b.vx * h; b.z += b.vz * h;
      const f = Math.exp(-(onGround ? 0.5 : 0.1) * h); b.vx *= f; b.vz *= f;
      const sp = Math.hypot(b.vx, b.vz); if (sp > BALL_VMAX) { b.vx *= BALL_VMAX / sp; b.vz *= BALL_VMAX / sp; }
      if (b.h < b.r) { b.h = b.r; if (b.vh < 0) { const imp = -b.vh; b.vh = imp > 3 ? imp * 0.62 : 0; if (imp > 5) { audio.sfx('boing', { vol: clamp(imp / 22, 0.1, 0.4), rate: 1.1 + imp * 0.01 }); fx.particles.dust(b.x, 0.1, b.z, 3, 0xaaffdd); } } }
      if (b.h > 9) { b.h = 9; if (b.vh > 0) b.vh = -b.vh * 0.4; }
      wallPush(b, b.r, SEG, 0.8, 0.97);
      if (hitN.hit && hitN.sp > 7 && b.wallCd <= 0) { b.wallCd = 0.1; audio.sfx('thud', { vol: clamp(hitN.sp / 40, 0.1, 0.45), rate: 1.3 }); fx.particles.burst(b.x - hitN.x * b.r, b.h, b.z - hitN.z * b.r, { count: 4 + Math.round(hitN.sp / 5), speed: 2 + hitN.sp / 10, up: 0.8, life: 0.4, size: 0.28, colors: [0xffffff, 0x9fe8ff], gravity: 6 }); if (hitN.sp > 22) ctx.shake(0.1); }
      if (b.h - 0.3 > GH) wallPush(b, b.r, BAR, 0.6, 0.97);        // lat: boven het doel kaats je terug
      // magneet
      for (const c of cars) if (FX.magnet[c.i] > 0 && b.h < 5) {
        const px = c.x + c.fx * (c.R + b.r + 0.5), pz = c.z + c.fz * (c.R + b.r + 0.5), dx = px - b.x, dz = pz - b.z, d = Math.hypot(dx, dz);
        if (d < 12 && d > 0.2) { const k = (1 - d / 12), a = 70 * k; b.vx += dx / d * a * h; b.vz += dz / d * a * h; const kk = 1 - Math.exp(-2.4 * k * h); b.vx += (c.vx - b.vx) * kk; b.vz += (c.vz - b.vz) * kk; }
      }
      for (const c of cars) carBall(c, b);
    }
    // ---------------- invoer ----------------
    function readInput(c, dt) {
      const inp = pv.input(c.i);
      c.cd = Math.max(0, c.cd - dt); c.stun = Math.max(0, c.stun - dt); c.bump = Math.max(0, c.bump - dt); c.kickT += dt; c.magnet = FX.magnet[c.i];
      if (c.frozen > 0) { c.frozen -= dt; c.mag = 0; c.boosting = false; return; }
      if (c.stun > 0) { c.mag = 0; c.boosting = false; return; }
      c.ix = inp.x; c.iz = inp.y; c.mag = Math.min(1, Math.hypot(inp.x, inp.y));
      if (c.mag > 0.25) { const l = Math.hypot(inp.x, inp.y); c.fx = damp(c.fx, inp.x / l, 14, dt); c.fz = damp(c.fz, inp.y / l, 14, dt); const fl = Math.hypot(c.fx, c.fz) || 1; c.fx /= fl; c.fz /= fl; }
      else if (Math.hypot(c.vx, c.vz) > 2) { const sp = Math.hypot(c.vx, c.vz); c.fx = damp(c.fx, c.vx / sp, 8, dt); c.fz = damp(c.fz, c.vz / sp, 8, dt); const fl = Math.hypot(c.fx, c.fz) || 1; c.fx /= fl; c.fz /= fl; }
      const wasB = c.boosting; c.boosting = !!inp.a && c.boost > 0.5;
      if (c.boosting) { c.boost = Math.max(0, c.boost - 30 * dt); if (!wasB) { audio.sfx('whoosh', { vol: 0.35, rate: 1.4 }); } }
      else if (c.assist) c.boost = Math.min(100, c.boost + 9 * dt);
      if (inp.aP && c.boost <= 0.5) audio.sfx('click', { vol: 0.15, rate: 0.6 });
      if (inp.bP) {
        if (c.cd <= 0) { c.kickT = 0; c.kickDone = false; c.hop = 0.001; c.vx += c.fx * 7; c.vz += c.fz * 7; audio.sfx('swing', { vol: 0.5, rate: 1.2 }); audio.sfx('jump', { vol: 0.25, rate: 1.2 }); c.cd = 0.5; }
        else audio.sfx('click', { vol: 0.12, rate: 0.6 });
      }
      if (!c.kickDone && c.kickT > KICK_T) c.kickDone = true;
    }
    // ---------------- boost-pads / items ----------------
    function updatePads(dt) {
      PADS.forEach(([x, z, big], k) => {
        padT[k] = Math.max(0, padT[k] - dt);
        if (padT[k] > 0) return;
        for (const c of cars) if (c.stun <= 0 && Math.hypot(c.x - x, c.z - z) < c.R + (big ? 1.4 : 0.9)) {
          padT[k] = big ? 9 : 5; const add = big ? 100 : 36; c.boost = Math.min(100, c.boost + add); stats.pads[c.i]++;
          fx.particles.burst(x, 0.6, z, { count: big ? 30 : 16, speed: 5, up: 1.6, life: 0.8, size: 0.4, colors: big ? [0xffd23f, 0xffffff, 0xff9a2a] : [0x4fe8ff, 0xffffff], gravity: 3 });
          fx.texts.add(big ? '+TURBO!' : '+turbo', x, 2.4, z, big ? '#ffd23f' : '#4fe8ff', big ? 1.3 : 0.9); audio.sfx('powerup', { vol: big ? 0.5 : 0.3, rate: big ? 1 : 1.5 });
          break;
        }
      });
    }
    function spawnItem() {
      const trailing = score[0] === score[1] ? -1 : (score[0] < score[1] ? 0 : 1);
      const tot = ITEMS.reduce((a, t) => a + t.w, 0); let r = Math.random() * tot, type = ITEMS[0]; for (const t of ITEMS) { r -= t.w; if (r <= 0) { type = t; break; } }
      let x = 0, z = 0;
      for (let tries = 0; tries < 12; tries++) {
        const side = trailing >= 0 && Math.random() < 0.7 ? cars[trailing].dir : (Math.random() < 0.5 ? 1 : -1);      // aan de kant van de achterstaander (die in zijn aanvalshelft)
        x = side * rand(2, 9); z = rand(-LZ + 3, LZ - 3);
        if (cars.every((c) => Math.hypot(c.x - x, c.z - z) > 4) && PADS.every(([px, pz]) => Math.hypot(px - x, pz - z) > 3)) break;
      }
      item = { x, z, t: 0, life: 14, type }; itemG.visible = true; itemG.position.set(x, 0, z); itemIcon.material.map = itemTex[type.id];
      itemRing.material.color.set(type.col); itemOrb.material.emissive.set(type.col);
      fx.particles.ring(x, 0.4, z, { count: 20, speed: 4, color: 0xffffff, size: 0.35, life: 0.6 }); audio.sfx('sparkle', { vol: 0.5 });
      if (!stats.itemTold) { stats.itemTold = true; hud.toast('✨ Een power-up! Rij erdoorheen', 1800); }
    }
    function removeItem(poof = true) { if (!item) return; if (poof) fx.particles.burst(item.x, 1.2, item.z, { count: 14, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffffff, 0xaaccff], gravity: 4 }); item = null; itemG.visible = false; }
    function takeItem(c) {
      const it = item.type; removeItem(false); itemT = rand(9, 13); stats.items++;
      fx.particles.burst(c.x, 1.2, c.z, { count: 36, speed: 6, up: 1.3, life: 0.9, size: 0.45, colors: [0xffffff, 0xaaccff, 0xffe14a], gravity: 4 });
      fx.texts.add(it.name, c.x, 3.4, c.z, it.col, 1.6); hud.toast(`${names[c.i]} pakt een power-up: ${it.name}`, 1800); audio.sfx('powerup', { vol: 0.8 }); ctx.shake(0.25);
      if (it.id === 'giant') FX.giant = 11;
      else if (it.id === 'magnet') FX.magnet[c.i] = 9;
      else if (it.id === 'twin') {
        const b = balls[1]; b.on = true; b.m.visible = b.shadow.visible = b.ring.visible = true; b.r0 = b.r = BR0 * 0.85; b.x = 0; b.z = rand(-3, 3); b.h = 6; b.vx = c.dir * 6; b.vz = rand(-6, 6); b.vh = 0; b.last = -1; b.life = 15; b.frozen = false;
        fx.particles.ring(0, 5, b.z, { count: 24, speed: 5, color: 0xffa040, size: 0.4, life: 0.6 });
      }
    }
    // ---------------- UFO ----------------
    function startUfo() {
      if (U.on || main.frozen) return; stats.ufos++; U.on = true; U.st = 'in'; U.t = 0; U.ball = main;
      U.dirIn = Math.random() < 0.5 ? 1 : -1; U.sx = U.dirIn * (LX + 16); U.sz = rand(-8, 8); U.x = U.sx; U.z = U.sz; U.y = 13;
      ufoM.g.visible = true; ufoShadow.visible = true; hud.toast('🛸 Een UFO! Hij pikt de bal mee...', 2000); audio.tone(300, 1.4, { type: 'sine', vol: 0.12, slide: 120 }); audio.sfx('creak', { vol: 0.3, rate: 1.6 });
    }
    function abortUfo(instant) {
      if (!U.on) return; if (U.ball) { U.ball.frozen = false; U.ball.vh = 0; } U.st = instant ? 'off' : 'out'; U.t = 0; U.sx = U.x; U.sz = U.z; ufoM.beam.visible = false;
      if (instant) { U.on = false; ufoM.g.visible = false; ufoShadow.visible = false; }
    }
    function updateUfo(dt) {
      if (!U.on) return; U.t += dt; const b = U.ball;
      if (U.st === 'in') {
        const u = clamp(U.t / 1.5, 0, 1), e = u * u * (3 - 2 * u); U.x = lerp(U.sx, b.x, e); U.z = lerp(U.sz, b.z, e); U.y = lerp(13, 9, e);
        if (u >= 1) { U.st = 'beam'; U.t = 0; b.frozen = true; audio.tone(180, 1.0, { type: 'sawtooth', vol: 0.07, slide: 520 }); }
      } else if (U.st === 'beam') {
        const u = clamp(U.t / 1.1, 0, 1); U.x = damp(U.x, b.x, 6, dt); U.z = damp(U.z, b.z, 6, dt); b.x = damp(b.x, U.x, 8, dt); b.z = damp(b.z, U.z, 8, dt);
        b.h = lerp(b.h, 7.5, 1 - Math.exp(-4 * dt)); b.vx = b.vz = b.vh = 0;
        if (u >= 1) {
          U.st = 'carry'; U.t = 0; U.sx = U.x; U.sz = U.z; const trailing = score[0] === score[1] ? -1 : (score[0] < score[1] ? 0 : 1);
          U.tx = (trailing >= 0 ? cars[trailing].dir : (Math.random() < 0.5 ? 1 : -1)) * rand(1, 7); U.tz = rand(-5.5, 5.5);
        }
      } else if (U.st === 'carry') {
        const u = clamp(U.t / 1.3, 0, 1), e = u * u * (3 - 2 * u); U.x = lerp(U.sx, U.tx, e); U.z = lerp(U.sz, U.tz, e); b.x = U.x; b.z = U.z; b.h = 7.5 + Math.sin(U.t * 7) * 0.25; b.vx = b.vz = b.vh = 0;
        if (u >= 1) { U.st = 'drop'; U.t = 0; }
      } else if (U.st === 'drop') {
        if (U.t < 0.05) { b.frozen = false; b.vx = b.vz = 0; b.vh = 0; fx.texts.add('PLOEF!', b.x, 8.5, b.z, '#9fffd8', 1.4); audio.sfx('pop', { vol: 0.6, rate: 0.7 }); }
        if (U.t > 0.5) { U.st = 'out'; U.t = 0; U.sx = U.x; U.sz = U.z; }
      } else if (U.st === 'out') {
        const u = clamp(U.t / 1.4, 0, 1), e = u * u; U.x = U.sx + U.dirIn * -1 * e * 36; U.y = lerp(9, 16, e);
        if (u >= 1) { U.on = false; ufoM.g.visible = false; ufoShadow.visible = false; ufoT = rand(20, 28); }
      }
      ufoM.beam.visible = U.st === 'beam' || U.st === 'carry' || (U.st === 'drop' && U.t < 0.4);
      if (ufoM.beam.visible) { const hgt = U.y; ufoM.beam.scale.set(1, hgt, 1); ufoM.beam.position.y = -hgt / 2; ufoM.beam.material.opacity = 0.28 + Math.sin(U.t * 20) * 0.08; if (Math.random() < dt * 40) fx.particles.emit(U.x + rand(-2, 2), rand(0.5, U.y - 1), U.z + rand(-2, 2), 0, 3, 0, { life: 0.5, size: 0.25, color: 0xbfffe8, gravity: 0 }); }
    }

    // ---------------- herhaling ----------------
    function record(dt) {
      recAcc += dt; if (recAcc < 1 / REPLAY_FPS) return; recAcc -= 1 / REPLAY_FPS; if (recAcc > 0.1) recAcc = 0;
      const o = (recN % REC_N) * 16, d = rec;
      d[o] = main.x; d[o + 1] = main.h; d[o + 2] = main.z; d[o + 3] = main.r; d[o + 4] = balls[1].on ? 1 : 0; d[o + 5] = balls[1].x; d[o + 6] = balls[1].h; d[o + 7] = balls[1].z;
      cars.forEach((c, i) => { const k = o + 8 + i * 4; d[k] = c.x; d[k + 1] = c.z; d[k + 2] = c.yaw; d[k + 3] = (c.boosting ? 1 : 0) + c.hop * 2; });
      recN++;
    }
    function playReplay(dt) {
      R.t += dt; const fi = R.t * REPLAY_FPS * 0.8; const i = Math.min(R.n - 1, Math.floor(fi)), j = Math.min(R.n - 1, i + 1), u = fi - Math.floor(fi);
      const A0 = ((R.i0 + i) % REC_N) * 16, B0 = ((R.i0 + j) % REC_N) * 16;
      const g = (k) => lerp(rec[A0 + k], rec[B0 + k], u);
      main.x = g(0); main.h = g(1); main.z = g(2); main.r = rec[A0 + 3];
      const b1 = balls[1]; b1.on = rec[A0 + 4] > 0.5; b1.x = g(5); b1.h = g(6); b1.z = g(7);
      cars.forEach((c, k) => { const o = 8 + k * 4; c.x = g(o); c.z = g(o + 1); let ya = rec[A0 + o + 2], yb = rec[B0 + o + 2]; let dy = yb - ya; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU; c.yaw = ya + dy * u; const fl = rec[A0 + o + 3]; c.boosting = fl >= 1; c.hop = (fl - (c.boosting ? 1 : 0)) / 2; });
      return fi >= R.n - 1 + 8;
    }

    // ---------------- update ----------------
    let lastSb = -1;
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; resetKickoff(); hud.toast('Eerste tot 5 goals! Turbo met A, schieten met B', 2200); refreshHud(); }
      if (T > 330 && !finished && G.state !== 'end') endMatch(score[0] === score[1] ? decideByCloseness() : (score[0] > score[1] ? 0 : 1));
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3, dt);
      const sdt = dt * slow * PHYS_T;
      G.t += dt;
      for (const c of cars) if (G.state !== 'replay') { c.hop = c.hop > 0 ? c.hop + dt : 0; if (c.hop > 0.34) c.hop = 0; }

      if (G.state === 'kick') {
        const prev = G.kickCount; G.kickCount = 3.0 - G.t * 2.2;       // 1.35 s aftellen: 3, 2, 1
        const n = Math.ceil(G.kickCount), pn = Math.ceil(prev);
        if (n !== pn && n >= 1 && n <= 3) { fx.texts.add(String(n), 0, 4.2, 0, '#ffe14a', 3.0); audio.sfx('countdown', { vol: 0.3, rate: 0.8 + (3 - n) * 0.2 }); }
        if (G.t >= 1.35) startPlay();
        for (const c of cars) { c.mag = 0; c.boosting = false; c.vx = damp(c.vx, 0, 10, dt); c.vz = damp(c.vz, 0, 10, dt); }
      }
      // klok
      if (G.state === 'play') {
        if (!G.golden) {
          G.timeLeft -= dt; hud.setTimer(Math.max(0, G.timeLeft), 10);
          if (Math.floor(G.timeLeft) !== lastSb) { lastSb = Math.floor(G.timeLeft); A.scoreboard(names, score, G.timeLeft, null); }
          if (G.timeLeft <= 0) {
            G.timeLeft = 0; audio.sfx('bell', { vol: 1 });
            if (score[0] !== score[1]) { hud.showBig('TIJD!', 1100, '#ffd23f'); endMatch(score[0] > score[1] ? 0 : 1); }
            else { G.golden = true; G.goldT = 0; hud.showBig('GOUDEN GOAL!', 1500, '#ffd23f'); hud.toast('Gelijkspel! Het volgende doelpunt wint', 2200); refreshHud(); }
          }
        } else {
          G.goldT += dt; hud.setTimer(Math.max(0, GOLD_MAX - G.goldT), 8);
          if (G.goldT >= GOLD_MAX) { audio.sfx('bell', { vol: 1 }); endMatch(decideByCloseness()); }
        }
        G.noTouchT += dt;
      }
      // lezen + natuurkunde
      if (G.state === 'play' || G.state === 'goal' || G.state === 'kick') {
        if (G.state !== 'kick') for (const c of cars) readInput(c, dt * (G.state === 'goal' ? slow : 1));
        let vmax = 20; for (const b of balls) if (b.on && !b.frozen) vmax = Math.max(vmax, Math.hypot(b.vx, b.vz, b.vh)); for (const c of cars) vmax = Math.max(vmax, Math.hypot(c.vx, c.vz));
        const n = clamp(Math.ceil(vmax * sdt / 0.26), 1, 24), h = sdt / n;
        for (const b of balls) b.wallCd = Math.max(0, (b.wallCd || 0) - sdt);
        for (let s = 0; s < n; s++) {
          for (const c of cars) { stepCar(c, h); tryKick(c); }
          carCar();
          for (const b of balls) if (b.on) {
            stepBall(b, h);
            if (G.state === 'play' && !b.frozen && Math.abs(b.z) < GW + 0.2) {
              if (b.x > LX + 0.5 && b.h < GH + b.r) { goal(b, 0); break; }
              if (b.x < -LX - 0.5 && b.h < GH + b.r) { goal(b, 1); break; }
            }
          }
          if (G.state !== 'play' && G.state !== 'kick') { if (G.state === 'goal') { /* de bal rolt uit in het net */ } }
        }
        // tweede bal verdwijnt na zijn levensduur
        const b1 = balls[1]; if (b1.on) { b1.life -= dt; if (b1.life <= 0) { b1.on = false; b1.m.visible = b1.shadow.visible = b1.ring.visible = false; fx.particles.burst(b1.x, b1.h, b1.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.4, colors: [0xffa040, 0xffffff], gravity: 4 }); audio.sfx('pop', { vol: 0.5 }); } }
        FX.giant = Math.max(0, FX.giant - dt); FX.magnet[0] = Math.max(0, FX.magnet[0] - dt); FX.magnet[1] = Math.max(0, FX.magnet[1] - dt);
        main.r = damp(main.r, FX.giant > 0 ? BR0 * 1.7 : BR0, 6, dt);
        if (G.state === 'play') {
          updatePads(dt);
          // item
          if (item) { item.t += dt; item.life -= dt; for (const c of cars) if (Math.hypot(c.x - item.x, c.z - item.z) < c.R + 1.3) { takeItem(c); break; } if (item && item.life <= 0) { removeItem(); itemT = rand(7, 10); } }
          else { itemT -= dt; if (itemT <= 0 && !main.frozen) spawnItem(); }
          // UFO
          ufoT -= dt; const slowBall = Math.hypot(main.vx, main.vz) < 1.2 && main.h < main.r + 0.1;
          const nearGoal = Math.abs(main.x) > LX - 6 && Math.abs(main.z) < GW + 3;
          if (!U.on && ((ufoT <= 0 && !nearGoal && T > 10) || (slowBall && G.noTouchT > 7 && !nearGoal))) { startUfo(); G.noTouchT = 0; }
          // zwemmen in het niets: de bal staat stil in een hoek? de UFO redt dat (zie boven)
        }
        updateUfo(dt);
        if (G.state === 'play' || (G.state === 'goal' && G.t < 0.3)) record(dt);
        if (G.state === 'goal') {
          G.goalT += dt;
          if (Math.random() < dt * 5) fx.particles.burst(rand(-14, 14), 6 + rand(0, 4), rand(-6, 6), { count: 20, speed: 6, up: 1.2, life: 1.3, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
          if (G.t > 0.95) startReplay();
        }
      } else if (G.state === 'replay') {
        const done = playReplay(dt);
        for (const c of cars) { c.hop = c.hop > 0 ? c.hop : 0; }
        if (done) { if (G.end) endMatch(G.scorer); else resetKickoff(); }
      } else if (G.state === 'end') {
        if (G.t > (G.winner == null ? 1.6 : 2.4) && !finished) finishMatch(G.winner);
      }
      applyAssist();
      visuals(dt);
    }

    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(), tmpV = new THREE.Vector3(); let camX = 0, camZ = 0, camD = 40;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * asp;
      let D = clamp((LX + GD + 3.4) / tanH, 28, 70), lx = 0, lz = 0.5, el = 57 * Math.PI / 180, zoom = 1;
      if (G.state === 'goal') { G.camPunch = Math.max(0, G.camPunch - dt * 0.5); zoom = 1 - 0.18 * Math.min(1, G.t / 0.6); lx = G.lastGoalSide * 9; }
      if (G.state === 'replay') { zoom = 0.6; lx = lerp(main.x, G.lastGoalSide * LX, 0.35); lz = main.z * 0.5; el = 48 * Math.PI / 180; }
      camX = damp(camX, lx, G.state === 'replay' ? 6 : 2.5, dt); camZ = damp(camZ, lz, 3, dt); camD = damp(camD, D * zoom, 3.5, dt);
      const sway = Math.sin((T + introT) * 0.22) * 0.8;
      camera.position.set(camX + sway, Math.sin(el) * camD, camZ + Math.cos(el) * camD); camLook.set(camX * 0.9, 0, camZ); camera.lookAt(camLook);
      if (ov.visible) {
        const th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.0, hh = th * 2, ww = hh * asp, bh = hh * 0.1;
        barT.scale.set(ww, bh, 1); barT.position.set(0, hh / 2 - bh / 2, -1); barB.scale.set(ww, bh, 1); barB.position.set(0, -hh / 2 + bh / 2, -1);
        recLabel.scale.set(hh * 0.3, hh * 0.075, 1); recLabel.position.set(0, -hh / 2 + bh / 2, -1);
        recLabel.material.opacity = Math.sin(T * 8) > -0.3 ? 1 : 0.6;
      }
    }
    function visuals(dt) {
      const tt = T + introT;
      // ballen
      for (const b of balls) {
        if (!b.on) continue;
        b.m.position.set(b.x, b.h, b.z); b.m.scale.setScalar(b.r);
        // rollen: draai rond de as loodrecht op de snelheid
        const sp = Math.hypot(b.vx, b.vz); if (sp > 0.2 && !b.frozen) { tmpV.set(b.vz, 0, -b.vx).normalize(); b.m.rotateOnWorldAxis(tmpV, sp * dt / b.r * 0.9); }
        else if (b.frozen) b.m.rotation.y += dt * 3;
        const hh = clamp(1 - (b.h - b.r) / 9, 0.3, 1);
        b.shadow.position.set(b.x, 0.04, b.z); b.shadow.scale.setScalar(b.r * 1.25 * hh); b.shadow.material.opacity = 0.35 + hh * 0.55;
        b.ring.position.set(b.x, 0.05, b.z); b.ring.scale.setScalar(b.r * (1 + (1 - hh) * 0.5)); b.ring.material.opacity = 0.25 + (1 - hh) * 0.5;
        b.ring.material.color.setHex(b.last === 0 ? 0x7dffb0 : b.last === 1 ? 0x8fb8ff : 0xffffff);
        if (sp > 14 && !R.on && Math.random() < dt * (10 + sp)) fx.particles.emit(b.x - b.vx * 0.02, b.h, b.z - b.vz * 0.02, 0, 0, 0, { life: 0.4, size: b.r * 0.7, color: b.last === 0 ? 0x7dffb0 : b.last === 1 ? 0x8fb8ff : 0xffffff, gravity: 0 });
      }
      main.m.material.emissiveIntensity = FX.giant > 0 ? 0.5 + Math.sin(tt * 10) * 0.2 : 0.18;
      // auto's
      for (const c of cars) {
        const spd = Math.hypot(c.vx, c.vz);
        if (G.state !== 'replay' && spd > 1.2) c.yaw = dampAngle(c.yaw, Math.atan2(c.vx, c.vz), 10, dt);
        else if (G.state !== 'replay' && c.mag < 0.2) c.yaw = dampAngle(c.yaw, Math.atan2(c.fx, c.fz), 6, dt);
        const hopY = c.hop > 0 ? Math.sin(Math.min(1, c.hop / 0.34) * Math.PI) * 1.0 : 0;
        const tilt = clamp(spd * 0.006, 0, 0.1);
        c.m.g.position.set(c.x, hopY + (c.stun > 0 ? Math.abs(Math.sin(tt * 30)) * 0.15 : 0), c.z); c.m.g.rotation.y = c.yaw + (c.stun > 0 ? Math.sin(tt * 25) * 0.4 : 0);
        c.m.body.rotation.x = -tilt - (c.hop > 0 ? 0.25 * Math.sin(Math.min(1, c.hop / 0.34) * Math.PI) : 0); c.m.body.rotation.z = c.stun > 0 ? Math.sin(tt * 30) * 0.12 : 0;
        const fl = c.boosting && c.boost > 0;
        c.m.flame.visible = fl; if (fl) { const s = 0.8 + Math.random() * 0.5; c.m.f1.scale.set(s, 1 + Math.random() * 0.4, s); c.m.f2.scale.set(s, 1 + Math.random() * 0.3, s); if (Math.random() < dt * 40) fx.particles.emit(c.x - c.fx * 1.6, 0.6, c.z - c.fz * 1.6, -c.fx * 4 + rand(-1, 1), 0.6, -c.fz * 4 + rand(-1, 1), { life: 0.4, size: 0.5, color: Math.random() < 0.5 ? 0xffa020 : 0xffe9a0, gravity: -1 }); }
        c.m.under.material.opacity = 0.55 + (fl ? 0.4 : 0) + Math.sin(tt * 6 + c.i) * 0.1; c.m.paint.emissiveIntensity = 0.15 + (c.kickT < KICK_T ? 0.8 : 0) + (c.assist ? 0.3 + Math.sin(tt * 8) * 0.12 : 0) + (c.frozen > 0 ? 0.6 : 0);
        c.m.paint.color.setHex(c.frozen > 0 ? 0x9fd8ff : PLAYER_COLORS[c.i]);
        if (c.assist && Math.random() < dt * 12) fx.particles.emit(c.x + rand(-1, 1), 0.5 + Math.random(), c.z + rand(-1, 1), 0, 1.2, 0, { life: 0.6, size: 0.3, color: 0xffd23f, gravity: -1 });
        if (c.magnet > 0 && Math.random() < dt * 20) { const a = Math.random() * TAU; fx.particles.emit(c.x + Math.cos(a) * 3.5, 0.8, c.z + Math.sin(a) * 3.5, -Math.cos(a) * 5, 0.4, -Math.sin(a) * 5, { life: 0.6, size: 0.3, color: 0x8fb8ff, gravity: 0 }); }
        if (G.state !== 'replay') c.m.c.pose = c.mood === 'cheer' ? 'cheer' : c.mood === 'sad' ? 'sad' : 'carry'; c.m.c.speed = 0; c.m.c.update(dt);
        c.shadow.position.set(c.x, 0.04, c.z); c.shadow.scale.setScalar(c.R * 1.3 * (1 - hopY * 0.15)); c.shadow.material.opacity = 0.75 - hopY * 0.3;
        c.tag.position.set(c.x, 3.7 + hopY, c.z + 0.2); c.tag.visible = G.state !== 'replay';
        c.barBg.position.set(c.x, 2.35 + hopY, c.z + 0.6); c.barFill.position.set(c.x - 1.2, 2.35 + hopY, c.z + 0.61);
        c.barFill.scale.x = Math.max(0.001, 2.4 * c.boost / 100); c.barFill.material.color.setHex(c.boost < 20 ? 0xff5a3a : fl ? 0xffffff : 0xffd23f);
        c.barBg.visible = c.barFill.visible = G.state !== 'replay';
        refreshInfo(c);
      }
      // pads
      A.pads.forEach((p, k) => { const ready = padT[k] <= 0; const pulse = 0.7 + Math.sin(tt * 4 + k) * 0.25; p.ring.material.opacity = ready ? 0.95 : 0.2; p.fill.material.opacity = ready ? 0.35 + pulse * 0.3 : 0.05; p.bolt.material.opacity = ready ? 0.95 : 0.15; p.bolt.rotation.z = 0; p.g.scale.setScalar(ready ? 1 + Math.sin(tt * 4 + k) * 0.03 : 0.94); });
      // item
      if (item) { itemG.position.y = 0; itemOrb.position.y = 1.5 + Math.sin(item.t * 3) * 0.2; itemIcon.position.y = itemOrb.position.y; itemOrb.rotation.y += dt * 2; itemRing.scale.setScalar(1 + Math.sin(item.t * 5) * 0.08); itemG.visible = item.life > 3 || Math.sin(item.life * 18) > 0; if (Math.random() < dt * 8) fx.particles.emit(item.x + rand(-1, 1), 0.5 + Math.random() * 2, item.z + rand(-1, 1), 0, 0.8, 0, { life: 0.7, size: 0.25, color: 0xcfe8ff, gravity: -0.5 }); }
      // UFO
      if (U.on) { ufoM.g.position.set(U.x, U.y, U.z); ufoM.g.rotation.z = Math.sin(tt * 3) * 0.06; ufoM.lights.rotation.y = tt * 3; ufoM.al.rotation.y = Math.sin(tt) * 0.5; ufoShadow.position.set(U.x, 0.05, U.z); ufoShadow.scale.setScalar(1 + (U.y - 9) * 0.05); }
      A.update(tt, dt);
      updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const c of cars) { c.m.c.update(dt); c.hop = c.mood === 'cheer' ? (c.hop + dt * 1.2) % 0.34 : 0; } for (const c of cars) { const hopY = c.hop > 0 ? Math.sin(c.hop / 0.34 * Math.PI) : 0; c.m.g.position.y = hopY; } A.update(T + introT, dt); updateCamera(dt); }
    function introUpdate(dt) { introT += dt; for (const c of cars) c.m.c.update(dt); visuals(dt); }
    refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const c of cars) fx.particles.burst(c.x, 1, c.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const c = cars[i]; c.frozen = 2.2; c.vx = c.vz = 0; if (score[i] > 0) { score[i]--; refreshHud(); applyAssist(); } fx.texts.add('BEWOGEN!', c.x, 3.6, c.z, '#9fe8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { cars[w].mood = 'cheer'; cars[1 - w].mood = 'sad'; A.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, timeLeft: G.timeLeft, golden: G.golden, goldT: G.goldT, score: [...score], finished, slow, replay: R.on, fx: { giant: FX.giant, magnet: [...FX.magnet] },
          balls: balls.filter((b) => b.on).map((b) => ({ k: b.k, x: b.x, z: b.z, h: b.h, vx: b.vx, vz: b.vz, vh: b.vh, r: b.r, frozen: b.frozen, last: b.last })),
          cars: cars.map((c) => ({ i: c.i, dir: c.dir, x: c.x, z: c.z, vx: c.vx, vz: c.vz, boost: c.boost, cd: c.cd, boosting: c.boosting, stun: c.stun, frozen: c.frozen, assist: c.assist, touches: c.touches, kicks: c.kicks, R: c.R, yaw: c.yaw })),
          item: item ? { id: item.type.id, x: item.x, z: item.z } : null, ufo: U.on ? U.st : null, pads: [...padT], noTouchT: G.noTouchT, stats }),
        setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); applyAssist(); },
        setTime: (t) => { G.timeLeft = t; }, giveItem: (id, i) => { item = { x: cars[i].x, z: cars[i].z, t: 0, life: 9, type: ITEMS.find((t) => t.id === id) }; takeItem(cars[i]); },
        spawnItem: () => spawnItem(), ufo: () => startUfo(), setBall: (x, z, h, vx, vz, vh) => { main.x = x; main.z = z; main.h = h; main.vx = vx; main.vz = vz; main.vh = vh || 0; },
        setCar: (i, x, z, vx, vz) => { const c = cars[i]; c.x = x; c.z = z; c.vx = vx || 0; c.vz = vz || 0; }, setGolden: (t) => { G.goldT = t; },
        cars, balls, G,
      },
    };
  },
};

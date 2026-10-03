import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, smoothstep } from '../engine/util.js';
import { makeBrother, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildWorld, LW, GUT, CX, HEAD, PIT_Z, PIN_HOME, PIN_TYPES, pinGeo, crownGeo, ballTexture } from './bowling_world.js';

// Reuzen-Bowling — duel: twee banen naast elkaar, allebei bowlen TEGELIJK. 5 rondes van 2 worpen, kegels zijn kabouters, kippen en
// knuffelmonsters die omvallen en elkaar omverkegelen (eigen 2D-natuurkunde).
//  * links/rechts = richting (de pijl slingert), A ingedrukt = kracht laden (meter gaat op en neer), loslaten = gooien
//  * B vóór het gooien = BOM-BAL (1x per potje), B + links/rechts tijdens het rollen = bijsturen (beperkt)
//  * punten: elke kegel 1 (gouden kegel 2), strike +10, spare +5; laatste ronde dubbel. Gelijk = beslissende worp.
//  * chaos: bumper-kussens in sommige rondes (vaak voor wie achterstaat), een gouden kegel, een draak die op de baan van de leider landt

const FRAMES = 5, MATCH_TIME = 100, AIM_T = 5.5, SD_MAX = 3;
const BALL_R = 0.55, BALL_M = 9, PIN_R = 0.4, PIN_M = 1.6, FALL_R = 0.44;
const STEP = 1 / 120, D2R = Math.PI / 180, MAX_ANG = 11 * D2R;
const SAYS = { kabouter: ['HIHI!', 'AU!', 'OEPS!'], kip: ['KOEKOEK!', 'BOK!', 'KIP-KIP!'], monster: ['ROAR!', 'OEF!', 'GRRR!'] };

export default {
  id: 'bowling',
  name: 'Reuzen-Bowling',
  giver: 'Clown Knal',
  icon: '🎳',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Reuzen-bowling met <b>kabouters, kippen en knuffelmonsters</b> als kegels! Jullie bowlen <b>tegelijk</b>: 5 rondes van 2 worpen. Strike +10, spare +5, <b>gouden kegel</b> telt dubbel. Pas op voor <b>bumpers</b> en de <b>draak</b>!',
  controls: ['{move} richting (pijl slingert)', '{a} vasthouden = kracht, los = gooien', '{b} bom-bal (1x) · rollen: sturen'],
  tip: 'Niet vol gas: dan trilt de pijl wild. B + links/rechts stuurt de rollende bal bij.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? (ctx.twist.speed || 1) : 1;
    const L0 = ctx.lights('indoor', { shadow: 17, center: [0, 0, -8], fogNear: 55, fogFar: 120 });
    L0.hemi.intensity = 1.45; L0.hemi.color.set(0xfff0e0); L0.hemi.groundColor.set(0x6a4a5a);
    L0.sun.color.set(0xffe8c8); L0.sun.intensity = 1.7; L0.sun.position.set(-6, 26, 6);
    camera.fov = 36; camera.updateProjectionMatrix();
    const W = buildWorld(ctx);
    const rng = ctx.rng;

    // ---------------- kegel- en bal-onderdelen ----------------
    const geos = PIN_TYPES.map((t) => [pinGeo(t, false), pinGeo(t, true)]); const crownG = crownGeo();
    const pinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: false });
    const goldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.4, emissive: 0x6a4000, emissiveIntensity: 0.7 });
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5, emissive: 0x6a4000, emissiveIntensity: 0.6 });
    const ballGeo = new THREE.SphereGeometry(1, 22, 16);
    const dotGeo = new THREE.CircleGeometry(0.17, 10); dotGeo.rotateX(-Math.PI / 2);
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0xff6fb5, roughness: 0.5, emissive: 0x551133, emissiveIntensity: 0.5 });
    const bumpGeo = new THREE.CapsuleGeometry(0.26, 17.0, 5, 10); bumpGeo.rotateX(Math.PI / 2);

    // ---------------- toestand ----------------
    const score = [0, 0]; let T = 0, introT = 0, timeLeft = MATCH_TIME, started = false, finished = false;
    const G = { st: 'init', t: 0, frame: -1, timeUp: false, sudden: 0, sdRes: [0, 0], winner: -1, endT: 0 };
    let tieFlag = false; let gold = 3; const dragonFrames = [1 + Math.floor(ctx.rng() * 2), 3 + Math.floor(ctx.rng() * 2)]; const stats = { strikes: [0, 0], spares: [0, 0], gutters: [0, 0], bombs: [0, 0], goldHits: [0, 0], bumperFrames: 0, dragons: 0, throws: [0, 0], pins: [0, 0] };
    const colorsCss = [['#35c46f', '#bff5d0'], ['#4a8cff', '#c0dcff']];

    const lanes = [0, 1].map((p) => {
      const cx = CX[p]; const L = {
        p, cx, st: 'wait', stT: 0, throwNo: 0, angle: 0, power: 0, chargeT: 0, aimT: 0, armed: false, bombs: 1, steer: 1, single: false,
        k: [0, 0], cnt: [0, 0], fscore: [], acc: 0, rollT: 0, sfxT: 0, settleT: 0, quiet: 0, sayT: 0, strikeNow: false, spareNow: false, lastTxt: '',
        bump: { on: false, k: 0, sq: [0, 0] }, drag: { on: false, t: 0, circles: [], side: 1, g: null, leaving: 0 }, fp: 0,
      };
      L.pins = PIN_HOME.map((h, i) => {
        const type = i % 3; const g = new THREE.Group(); const body = new THREE.Mesh(geos[type][0], pinMat); body.castShadow = true;
        const crown = new THREE.Mesh(crownG, crownMat); crown.position.y = 2.0; crown.visible = false; g.add(body, crown); g.visible = false; scene.add(g);
        return { i, type, gold: false, x: cx + h.x, z: h.z, vx: 0, vz: 0, hx: cx + h.x, hz: h.z, state: 'stand', f: 0, tdx: 0, tdz: -1, wob: 0, wobT: 0, s: 0, y: 0, vy: 0, on: false, counted: false, popD: 0, thr: 1.8, g, body, crown, gT: 0 };
      });
      // bal
      const bt = ballTexture(colorsCss[p][0], colorsCss[p][1]);
      const bm = new THREE.MeshPhongMaterial({ map: bt, shininess: 120, specular: 0xffffff });
      const bombM = new THREE.MeshPhongMaterial({ color: 0x15151a, shininess: 150, specular: 0xaaaaff, emissive: 0x000000 });
      const bmesh = new THREE.Mesh(ballGeo, bm); bmesh.castShadow = true;
      for (const [hx, hy, hz] of [[-0.18, 0.93, -0.28], [0.18, 0.93, -0.28], [0, 0.97, -0.05]]) { const hole = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x080808 })); hole.position.set(hx, hy * 0.97, hz); bmesh.add(hole); }
      const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); fuse.position.set(0, 1.12, 0); fuse.visible = false; bmesh.add(fuse);
      const bgrp = new THREE.Group(); bgrp.add(bmesh); scene.add(bgrp);
      const bshadow = P.shadowBlob(0.9); scene.add(bshadow);
      L.ball = { grp: bgrp, mesh: bmesh, bm, bombM, fuse, shadow: bshadow, mode: 'hold', x: cx, z: -0.4, vx: 0, vz: 0, y: BALL_R, r: BALL_R, m: BALL_M, bomb: false, gT: 0, rotQ: new THREE.Quaternion(), steered: 0 };
      // richtingspijl: stippen + pijlkop, kracht-meter
      const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: p ? 0x9fc6ff : 0x9fffc0, transparent: true, opacity: 0.85, depthWrite: false }), 12); dots.frustumCulled = false; scene.add(dots); L.dots = dots;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 3), new THREE.MeshBasicMaterial({ color: p ? 0x4a8cff : 0x35e27a })); head.rotation.x = -Math.PI / 2; scene.add(head); L.head = head;
      const mbg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.62), new THREE.MeshBasicMaterial({ color: 0x1a1020, transparent: true, opacity: 0.85 })); mbg.rotation.x = -Math.PI / 2; mbg.position.set(cx, 0.06, 1.2); scene.add(mbg);
      const fg = new THREE.PlaneGeometry(1, 0.42); fg.translate(0.5, 0, 0); const mfill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x35e27a })); mfill.rotation.x = -Math.PI / 2; mfill.position.set(cx - 2.0, 0.08, 1.2); scene.add(mfill);
      const sweet = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.62), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.5 })); sweet.rotation.x = -Math.PI / 2; sweet.position.set(cx - 2.0 + 0.78 * 4.0, 0.07, 1.2); scene.add(sweet);
      const steerBar = new THREE.Mesh(fg.clone(), new THREE.MeshBasicMaterial({ color: 0xff9ad0 })); steerBar.rotation.x = -Math.PI / 2; steerBar.position.set(cx - 2.0, 0.08, 1.85); steerBar.scale.y = 0.6; scene.add(steerBar);
      L.meter = { bg: mbg, fill: mfill, sweet, steer: steerBar };
      // bumper-kussens
      L.bumpers = [-1, 1].map((s) => { const m = new THREE.Mesh(bumpGeo, bumpMat); m.position.set(cx + s * (LW + 0.2), 0.25, -7.7); m.visible = false; m.castShadow = true; scene.add(m); return m; });
      return L;
    });

    // ---------------- poppetjes ----------------
    const chars = [0, 1].map((i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); const k = 4.0 / 1.84;
      const sx = i ? 1 : -1; holder.position.set(sx * 9.4, -0.3, -9.5); holder.scale.setScalar(k * pv.size(i)); scene.add(holder);
      c.faceDir(-sx * 0.55, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      return { c, holder, i, sx, cheerT: 0, sadT: 0, scareT: 0 };
    });
    const dragon = new Dragon(0x7a2fd4, 1); dragon.group.scale.setScalar(0.8); dragon.group.visible = false; scene.add(dragon.group);

    // ---------------- hulp ----------------
    const text = (t, x, y, z, col, s = 1) => fx.texts.add(t, x, y, z, col, s);
    const sfx = (n, o) => audio.sfx(n, o);
    const tone = (f, d, o) => { if (audio.tone) audio.tone(f, d, o); };
    function setPinKind(pn, goldOn) { pn.gold = goldOn; pn.body.geometry = geos[pn.type][goldOn ? 1 : 0]; pn.body.material = goldOn ? goldMat : pinMat; pn.crown.visible = goldOn; }
    function resetBall(L) {
      const b = L.ball; const r = BALL_R * lerp(1, pv.size(L.p), 0.6); b.r = r; b.m = BALL_M * Math.pow(r / BALL_R, 3);
      b.mode = 'hold'; b.x = L.cx; b.z = -0.5; b.y = r; b.vx = b.vz = 0; b.bomb = false; b.gT = 0; b.steered = 0; b.mesh.material = b.bm; b.fuse.visible = false; b.grp.visible = true; b.shadow.visible = true; b.mesh.scale.setScalar(r); b.rotQ.identity(); b.grp.quaternion.identity();
    }
    function rack(L, withGold) {
      L.pins.forEach((pn, i) => { Object.assign(pn, { x: pn.hx, z: pn.hz, vx: 0, vz: 0, state: 'stand', f: 0, wob: 0, s: 0, y: 0, vy: 0, on: true, counted: false, popD: i * 0.05, gT: 0, thr: 1.9 + rng() * 1.8 }); setPinKind(pn, withGold && i === gold); pn.g.visible = true; pn.g.scale.setScalar(0.001); pn.g.quaternion.identity(); });
    }
    const lead = (p) => score[p] - score[1 - p];
    function drawBoard() {
      const g = W.sbCanvas.getContext('2d'), w = 1024, h = 320;
      g.fillStyle = '#120c26'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1a4a'; g.fillRect(8, 8, w - 16, h - 16);
      g.textBaseline = 'middle'; g.textAlign = 'center';
      g.font = 'bold 30px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#ffd24a';
      for (let f = 0; f < FRAMES; f++) g.fillText(f === FRAMES - 1 ? 'x2' : String(f + 1), 262 + f * 100 + 50, 40);
      g.fillText('TOTAAL', 880, 40);
      for (let p = 0; p < 2; p++) {
        const y = 70 + p * 118; g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(20, y, w - 40, 104);
        g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.fillStyle = colorsCss[p][0]; g.textAlign = 'left'; g.fillText(names[p], 36, y + 52); g.textAlign = 'center';
        for (let f = 0; f < FRAMES; f++) {
          const x = 262 + f * 100, cur = f === G.frame && G.st === 'play'; g.strokeStyle = cur ? '#ffe14a' : 'rgba(255,255,255,.25)'; g.lineWidth = cur ? 5 : 2; g.strokeRect(x + 4, y + 8, 92, 88);
          const v = lanes[p].fscore[f]; if (v != null) { g.font = 'bold 50px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#fff'; g.fillText(String(v), x + 50, y + 54); }
        }
        g.font = 'bold 86px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#ffffff'; g.fillText(String(score[p]), 880, y + 54);
      }
      W.sbTex.needsUpdate = true;
    }
    const refreshHud = () => {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}`);
      for (let i = 0; i < 2; i++) { const L = lanes[i]; hud.setPlayerInfo(i, G.st === 'sudden' ? 'Beslissende worp!' : `Ronde ${Math.max(1, G.frame + 1)}/${FRAMES} · worp ${L.throwNo + 1} · Bom: ${L.bombs}${L.armed ? ' (AAN!)' : ''}`); }
    };

    // ---------------- rondes ----------------
    function startFrame() {
      G.frame++; G.st = 'play'; G.t = 0; const f = G.frame;
      gold = 1 + Math.floor(rng() * 9);
      const dragonLane = dragonFrames.includes(f) ? (score[0] === score[1] ? (rng() < 0.5 ? 0 : 1) : score[0] > score[1] ? 0 : 1) : -1;
      for (const L of lanes) {
        L.throwNo = 0; L.k = [0, 0]; L.cnt = [0, 0]; L.armed = false; L.steer = 1; L.single = false; L.st = 'rack'; L.stT = 0; L.fp = 0; L.strikeNow = L.spareNow = false;
        const trailing = lead(L.p) <= -12; const chance = trailing ? 0.8 : f === 0 ? 0.2 : 0.32;
        L.bump.on = rng() < chance; if (L.bump.on) stats.bumperFrames++;
        L.drag.on = L.p === dragonLane; if (L.drag.on) { stats.dragons++; L.drag.side = rng() < 0.5 ? -1 : 1; L.drag.t = 0; L.drag.leaving = 0; L.drag.circles = [1.55, 0.85, 0.2].map((o) => ({ x: L.cx + L.drag.side * o, z: -7.0, r: 0.72 })); }
        rack(L, true); resetBall(L);
        if (trailing && L.bombs < 1 && rng() < 0.7) { L.bombs++; text('EXTRA BOM!', L.cx, 3.2, -1, '#ff9a6a', 1.2); }
      }
      hud.showBig(f === FRAMES - 1 ? 'LAATSTE RONDE: DUBBEL!' : `RONDE ${f + 1}`, 1100, f === FRAMES - 1 ? '#ffd23f' : '#ffffff'); sfx('bell', { vol: 0.5 });
      const ann = [];
      for (const L of lanes) { if (L.bump.on) text('BUMPERS!', L.cx, 3.0, -4, '#ff9ad0', 1.2); if (L.drag.on) text('DRAAK!', L.cx, 3.4, -6, '#d9a8ff', 1.4); }
      text('GOUDEN KEGEL!', 0, 4.0, -9, '#ffe14a', 1.3);
      refreshHud(); drawBoard();
    }
    function startSudden() {
      G.st = 'sudden'; G.sudden++; G.t = 0; G.sdRes = [0, 0]; sfx('bell', { vol: 0.8 }); hud.showBig(G.sudden === 1 ? 'GELIJK! BESLISSENDE WORP!' : 'NOG EEN WORP!', 1500, '#ffd23f'); hud.setTimer(null);
      for (const L of lanes) { L.throwNo = 1; L.single = true; L.k = [0, 0]; L.cnt = [0, 0]; L.armed = false; L.steer = 1; L.st = 'rack'; L.stT = 0; L.bump.on = false; L.drag.on = false; rack(L, false); resetBall(L); L.sdDone = false; }
      refreshHud();
    }
    function finishMatch(winner, how) {
      if (finished) return; finished = true; G.st = 'end'; G.winner = winner; hud.setTimer(null);
      const w = winner; const lines = [`${names[w]} is de Reuzen-Bowling-kampioen!`, `Strike! ${names[w]} bowlt de ander van de baan!`, `Wat een worpen! ${names[w]} wint.`];
      const ex = [];
      if (stats.strikes[0] + stats.strikes[1]) ex.push(`Strikes: ${names[0]} ${stats.strikes[0]}, ${names[1]} ${stats.strikes[1]}.`);
      if (stats.goldHits[0] + stats.goldHits[1]) ex.push(`Gouden kegels: ${stats.goldHits[0] + stats.goldHits[1]}.`);
      if (stats.bombs[0] + stats.bombs[1]) ex.push(`${stats.bombs[0] + stats.bombs[1]} bom-bal(len) ontploft.`);
      if (stats.dragons) ex.push('De draak versperde de baan.');
      if (how === 'sudden') ex.push('Beslist met een beslissende worp.'); else if (how === 'coin') ex.push('Zelfs na de extra worpen gelijk: de kip koos de winnaar.');
      ctx.finishPvp({ winner, score: [score[0], score[1]], delay: 500, summary: `${pick(lines)} ${ex.join(' ')}` });
    }

    // ---------------- natuurkunde ----------------
    function collide(A, ra, ma, B, rb, mb, e) {
      const dx = B.x - A.x, dz = B.z - A.z, R = ra + rb, d2 = dx * dx + dz * dz;
      if (d2 >= R * R || d2 < 1e-10) return 0;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = R - d, im = 1 / ma + 1 / mb;
      A.x -= nx * ov / ma / im; A.z -= nz * ov / ma / im; B.x += nx * ov / mb / im; B.z += nz * ov / mb / im;
      const vn = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz; if (vn >= 0) return 0;
      const j = -(1 + e) * vn / im; A.vx -= j * nx / ma; A.vz -= j * nz / ma; B.vx += j * nx / mb; B.vz += j * nz / mb;
      return -vn;
    }
    const fallSfxT = { t: 0 };
    function toFall(L, pn, imp, nx, nz) {
      if (pn.state !== 'stand') return; pn.state = 'fall'; pn.f = 0;
      const sp = Math.hypot(pn.vx, pn.vz); if (sp > 0.25) { pn.tdx = pn.vx / sp; pn.tdz = pn.vz / sp; } else { pn.tdx = nx; pn.tdz = nz; }
      pn.vy = Math.min(5.5, 1.6 + imp * 0.18) * (GRAV < 1 ? 1.5 : 1);
      if (T - fallSfxT.t > 0.06) { fallSfxT.t = T; const r = 0.85 + rng() * 0.5; if (pn.type === 0) tone(900 * r, 0.14, { type: 'triangle', vol: 0.12, slide: 1500 * r }); else if (pn.type === 1) { tone(520 * r, 0.1, { type: 'square', vol: 0.07, slide: 380 }); } else tone(150 * r, 0.22, { type: 'sawtooth', vol: 0.1, slide: 70, filter: 700 }); sfx('wood', { vol: 0.8, rate: 0.7 + rng() * 0.8 }); }
      if (T - L.sayT > 0.35 && rng() < 0.55) { L.sayT = T; text(pick(SAYS[PIN_TYPES[pn.type]]), pn.x, 2.4, pn.z, pn.gold ? '#ffe14a' : '#ffffff', 0.9); }
      fx.particles.burst(pn.x, 0.8, pn.z, { count: 4, speed: 2, up: 1.5, life: 0.4, size: 0.25, colors: pn.gold ? [0xffd23f, 0xffffff] : [0xffffff, 0xffe9a0], gravity: 6 });
    }
    function hitPin(L, pn, imp, nx, nz) { if (pn.state !== 'stand') return; if (imp > pn.thr) toFall(L, pn, imp, nx, nz); else if (imp > 0.35) pn.wob = Math.max(pn.wob, Math.min(1, imp * 0.5)); }
    function explode(L, x, z) {
      const b = L.ball; b.mode = 'gone'; b.gT = 9; b.grp.visible = false; b.shadow.visible = false; stats.bombs[L.p]++;
      sfx('explode', { vol: 1 }); ctx.shake(0.8); text('BOEM!', x, 3.0, z, '#ff9a3a', 1.8); hud.showBig('💥 BOEM!', 700, '#ff9a3a');
      fx.particles.burst(x, 0.8, z, { count: 40, speed: 7, up: 3, life: 0.9, size: 0.6, colors: [0xff7a1a, 0xffd23f, 0x444444, 0xffffff], gravity: 4 });
      fx.particles.ring(x, 0.3, z, { count: 24, speed: 8, life: 0.5, size: 0.4, color: 0xffb040 });
      for (const pn of L.pins) { if (!pn.on || pn.state === 'gone') continue; const dx = pn.x - x, dz = pn.z - z, d = Math.hypot(dx, dz); if (d < 3.0) { const k = 1 - d / 3.4; const nx = d > 0.01 ? dx / d : 0, nz = d > 0.01 ? dz / d : -1; pn.vx += nx * (4 + 9 * k); pn.vz += nz * (4 + 9 * k); toFall(L, pn, 8, nx, nz); } }
    }
    function bumperHit(L, s, b) { const i = s < 0 ? 0 : 1; L.bump.sq[i] = 1; sfx('boing', { vol: 0.5, rate: 1 + rng() * 0.3 }); fx.particles.burst(b.x, 0.5, b.z, { count: 6, speed: 2.5, up: 1, life: 0.4, size: 0.3, colors: [0xff9ad0, 0xffffff], gravity: 3 }); }
    function stepLane(L, h) {
      const b = L.ball, pins = L.pins;
      if (b.mode === 'roll') {
        b.x += b.vx * h; b.z += b.vz * h;
        const dx = b.x - L.cx;
        if (L.bump.on) { const lim = LW - b.r; if (Math.abs(dx) > lim) { const s = Math.sign(dx); b.x = L.cx + s * lim; if (b.vx * s > 0) { b.vx = -b.vx * 0.82; bumperHit(L, s, b); } } }
        else if (Math.abs(dx) > LW - 0.02) { const s = Math.sign(dx); b.mode = 'gutter'; b.x = L.cx + s * (LW + GUT / 2); b.vx = 0; b.vz *= 1.3; stats.gutters[L.p]++; sfx('thud', { vol: 0.5 }); text('GOOT!', b.x, 1.8, b.z - 1, '#9ab0ff', 1.0); }
        if (b.mode === 'roll') {
          if (L.drag.on) for (const c of L.drag.circles) { const imp = collide(c, c.r, 1e6, b, b.r, b.m, 0.55); if (imp > 1.5 && T - (L.drag.hitT || 0) > 0.3) { L.drag.hitT = T; sfx('thud', { vol: 0.9 }); tone(90, 0.4, { type: 'sawtooth', vol: 0.2, slide: 55, filter: 600 }); text('BOEM!', b.x, 2.4, b.z, '#d9a8ff', 1.3); ctx.shake(0.35); fx.particles.burst(b.x, 1, b.z, { count: 10, speed: 3, up: 1.5, life: 0.5, size: 0.4, colors: [0xb98aff, 0xffffff], gravity: 3 }); L.drag.g && (L.drag.bonk = 1); } c.vx = c.vz = 0; }
          for (const pn of pins) {
            if (!pn.on || pn.state === 'gone' || pn.s < 0.6) continue;
            const rr = pn.state === 'stand' ? PIN_R : FALL_R;
            const dd = Math.hypot(pn.x - b.x, pn.z - b.z); if (dd < rr + b.r) { if (b.bomb && pn.state === 'stand') { explode(L, b.x, b.z); break; } }
            const imp = collide(b, b.r, b.m, pn, rr, PIN_M, 0.4);
            if (imp > 0) { const nx = pn.vx, nz = pn.vz; const sp = Math.hypot(nx, nz) || 1; hitPin(L, pn, imp, nx / sp, nz / sp); if (imp > 2.5 && T - (L.hitSfxT || 0) > 0.05) { L.hitSfxT = T; sfx('hit', { vol: 0.6, rate: 0.8 + rng() * 0.4 }); } if (!b.hit) { b.hit = true; ctx.shake(0.15); } }
          }
          const sp = Math.hypot(b.vx, b.vz); if (sp < 2.6 && sp > 0) { const k = 2.6 / sp; b.vx *= k; b.vz *= k; }
          if (b.vz > -0.3) b.vz = -0.3;
          if (b.z < PIT_Z) { b.mode = 'gone'; b.gT = 0; }
        }
      } else if (b.mode === 'gutter') {
        b.z += b.vz * h; if (b.z < PIT_Z - 1.0) { b.mode = 'gone'; b.gT = 0; }
      }
      // kegels
      const kf = Math.exp(-lerp(3.2, 0.5, SLIP) * h), kd = Math.exp(-lerp(4.0, 0.7, SLIP) * h);
      for (const pn of pins) {
        if (!pn.on || pn.state === 'gone') continue;
        const sp2 = pn.vx * pn.vx + pn.vz * pn.vz;
        if (sp2 > 0.0004) { pn.x += pn.vx * h; pn.z += pn.vz * h; const k = pn.state === 'stand' ? kf : kd; pn.vx *= k; pn.vz *= k; if (sp2 > 15 * 15) { const c = 15 / Math.sqrt(sp2); pn.vx *= c; pn.vz *= c; } }
        else { pn.vx = pn.vz = 0; }
        const dx = pn.x - L.cx;
        if (L.bump.on && Math.abs(dx) > LW - PIN_R && pn.z > PIT_Z + 0.5) { const s = Math.sign(dx); pn.x = L.cx + s * (LW - PIN_R); if (pn.vx * s > 0) pn.vx = -pn.vx * 0.5; }
        else if (Math.abs(dx) > LW + 0.15 || pn.z < PIT_Z + 0.35) { pn.state = 'gone'; pn.gT = 0; pn.counted = pn.counted; }
      }
      for (let i = 0; i < pins.length; i++) {
        const A = pins[i]; if (!A.on || A.state === 'gone' || A.s < 0.6) continue;
        for (let j = i + 1; j < pins.length; j++) {
          const B = pins[j]; if (!B.on || B.state === 'gone' || B.s < 0.6) continue;
          const ra = A.state === 'stand' ? PIN_R : FALL_R, rb = B.state === 'stand' ? PIN_R : FALL_R;
          const dx = B.x - A.x, dz = B.z - A.z; if (dx * dx + dz * dz > (ra + rb) * (ra + rb)) continue;
          const sa = Math.hypot(A.vx, A.vz), sb = Math.hypot(B.vx, B.vz);
          const imp = collide(A, ra, PIN_M, B, rb, PIN_M, 0.4);
          if (imp > 0) { const d = Math.hypot(dx, dz) || 1; hitPin(L, A, imp, -dx / d, -dz / d); hitPin(L, B, imp, dx / d, dz / d); if (imp > 1.5 && T - (L.pinSfxT || 0) > 0.07) { L.pinSfxT = T; sfx('wood', { vol: 0.5, rate: 0.9 + rng() * 0.6 }); } }
        }
      }
    }
    // zichtbare kegel-animatie
    const qT = new THREE.Quaternion(), axT = new THREE.Vector3();
    function drawPins(L, dt) {
      for (const pn of L.pins) {
        if (!pn.on) { pn.g.visible = false; continue; }
        pn.popD -= dt;
        if (pn.state === 'gone') { pn.gT += dt; pn.y -= dt * 6; pn.s = Math.max(0, 1 - pn.gT * 1.4); }
        else if (pn.popD <= 0 && pn.s < 1) { pn.s = Math.min(1, pn.s + dt * 5); }
        if (pn.state === 'fall' || pn.state === 'down') {
          if (pn.f < 1) pn.f = Math.min(1, pn.f + dt / 0.42);
          if (pn.state === 'fall' && pn.f >= 1 && Math.hypot(pn.vx, pn.vz) < 0.5) pn.state = 'down';
        }
        if (pn.state !== 'gone') { pn.vy -= 22 * GRAV * dt; pn.y += pn.vy * dt; if (pn.y < 0) { pn.y = 0; pn.vy = Math.abs(pn.vy) > 3 ? -pn.vy * 0.3 : 0; } }
        let ang = 0, dx = pn.tdx, dz = pn.tdz;
        if (pn.state === 'fall' || pn.state === 'down' || pn.state === 'gone') { const e = pn.f * pn.f * (3 - 2 * pn.f); ang = e * Math.PI / 2 * 0.97; }
        else if (pn.wob > 0.01) { pn.wobT += dt; ang = Math.sin(pn.wobT * 20) * pn.wob * 0.14; pn.wob = Math.max(0, pn.wob - dt * 1.4); const wa = pn.wobT * 0.7; dx = Math.cos(wa); dz = Math.sin(wa); }
        axT.set(dz, 0, -dx); qT.setFromAxisAngle(axT, ang); pn.g.quaternion.copy(qT);
        const lift = 0.34 * Math.sin(ang);
        pn.g.position.set(pn.x + dx * 0.2 * Math.sin(ang), pn.y + lift, pn.z + dz * 0.2 * Math.sin(ang));
        pn.g.scale.setScalar(pn.s * 0.98); pn.g.visible = pn.s > 0.02;
        if (pn.gold && pn.s > 0.9 && Math.random() < dt * 5) fx.particles.emit(pn.x + (Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.2, pn.z + (Math.random() - 0.5) * 0.6, 0, 0.8, 0, { life: 0.6, size: 0.22, color: 0xffe14a, gravity: -1 });
      }
    }

    // ---------------- worp-afhandeling ----------------
    function aimAngle(L) { const wob = Math.sin(T * 5.1 + L.p * 2) * (0.6 + 2.6 * Math.pow(L.power, 1.5)) * D2R; return clamp(L.angle + wob, -MAX_ANG - 4 * D2R, MAX_ANG + 4 * D2R); }
    function throwBall(L) {
      const b = L.ball; stats.throws[L.p]++; const power = clamp(L.power, 0.12, 1);
      let ang = aimAngle(L); if (power > 0.93) ang += (rng() - 0.5) * 2.4 * D2R;
      const spd = lerp(6.2, 12.8, power) * (TEMPO > 1 ? 1.2 : TEMPO < 1 ? 0.85 : 1);
      b.vx = Math.sin(ang) * spd; b.vz = -Math.cos(ang) * spd; b.mode = 'roll'; b.hit = false; b.bomb = L.armed; L.armed = false; L.st = 'roll'; L.stT = 0; L.settleT = 0; L.quiet = 0; L.rollT = 0;
      if (b.bomb) { b.mesh.material = b.bombM; b.fuse.visible = true; }
      L.stand0 = L.pins.filter((p) => p.on && p.state === 'stand').length;
      chars[L.p].c.swing(); sfx('whoosh', { vol: 0.6, rate: 0.9 + power * 0.5 });
      text(power > 0.97 ? 'SUPERHARD!' : power > 0.72 ? 'KNAL!' : power < 0.3 ? 'zachtjes...' : '', L.cx, 2.4, 0.5, '#ffffff', 0.9);
    }
    function evaluate(L) {
      const down = L.pins.filter((p) => p.on && p.state !== 'stand' && !p.counted);
      let n = 0, pts = 0; for (const pn of down) { pn.counted = true; n++; pts += pn.gold ? 2 : 1; if (pn.gold) { stats.goldHits[L.p]++; text('GOUD +2', pn.x, 2.8, pn.z, '#ffe14a', 1.3); sfx('sparkle', { vol: 0.7 }); fx.particles.burst(pn.x, 1, pn.z, { count: 16, speed: 4, up: 2, life: 0.8, size: 0.35, colors: [0xffd23f, 0xffffff], gravity: 3 }); } }
      L.cnt[L.throwNo] = n; L.k[L.throwNo] = pts; stats.pins[L.p] += n;
      const tot = L.cnt[0] + L.cnt[1]; const cx = L.cx; const c = chars[L.p];
      const strike = L.throwNo === 0 && n >= 10 && !L.single, spare = L.throwNo === 1 && !L.single && tot >= 10;
      if (L.single) { L.sdDone = true; L.st = 'sweep'; L.stT = 0; text(`${n} kegels`, cx, 3, -9, '#ffffff', 1.1); return; }
      let txt = n === 0 ? (L.ball.mode === 'gone' && stats.gutters[L.p] >= 0 ? 'ernaast...' : '') : `${n} kegel${n > 1 ? 's' : ''}`;
      if (strike) { L.strikeNow = true; stats.strikes[L.p]++; txt = 'STRIKE!'; hud.showBig(`${names[L.p]}: STRIKE!`, 1100, colorsCss[L.p][0]); sfx('win', { vol: 0.8 }); sfx('bell', { vol: 0.7 }); ctx.shake(0.7); c.cheerT = 2.2; chars[1 - L.p].sadT = 1.5; fx.particles.burst(cx, 3, -9, { count: 40, speed: 6, up: 3, life: 1.3, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a], gravity: 4 }); }
      else if (spare) { L.spareNow = true; stats.spares[L.p]++; txt = 'SPARE!'; hud.showBig(`${names[L.p]}: SPARE!`, 900, colorsCss[L.p][0]); sfx('good', { vol: 0.9 }); sfx('powerup', { vol: 0.5 }); c.cheerT = 1.5; }
      else if (n === 0) { c.sadT = 1.6; sfx('miss', { vol: 0.7 }); }
      else if (n >= 7) c.cheerT = 1.0;
      text(txt, cx, 3.2, -9, strike ? '#ffe14a' : spare ? '#8dff9a' : '#ffffff', strike ? 1.8 : 1.2);
      L.st = 'sweep'; L.stT = 0;
    }
    function closeFrame(L, partial) {
      let pts = L.k[0] + (L.throwNo >= 1 || L.cnt[1] ? L.k[1] : 0);
      if (!partial) { if (L.strikeNow) pts += 10; else if (L.spareNow) pts += 5; }
      if (G.frame === FRAMES - 1) pts *= 2;
      L.fp = pts; score[L.p] += pts; L.fscore[G.frame] = pts; L.st = 'done';
      text(`+${pts}`, L.cx, 3.6, -3, '#ffe14a', 1.5); if (pts) sfx('coin', { vol: 0.5 });
      refreshHud(); drawBoard();
    }
    function sweepDone(L) {
      for (const pn of L.pins) if (pn.on && pn.state !== 'stand') { pn.on = false; fx.particles.burst(pn.x, 0.6, pn.z, { count: 5, speed: 2, up: 1.5, life: 0.4, size: 0.3, colors: [0xffffff, 0xcccccc], gravity: 4 }); }
      if (L.single) { L.st = 'done'; return; }
      if (L.strikeNow || L.throwNo === 1) { closeFrame(L, false); return; }
      L.throwNo = 1; L.st = 'aim'; L.aimT = 0; L.power = 0; L.armed = false; L.steer = 1; resetBall(L); sfx('pop', { vol: 0.4, rate: 1.4 });
    }

    // ---------------- per-baan update ----------------
    function updateLane(L, dt) {
      const p = L.p, inp = pv.input(p); const c = chars[p]; const spd = pv.speed(p);
      L.stT += dt;
      if (L.st === 'rack') { if (L.stT > 0.95) { L.st = G.timeUp && G.st === 'play' ? 'done' : 'aim'; L.aimT = 0; L.power = 0; L.angle = 0; L.stT = 0; } }
      else if (L.st === 'aim' || L.st === 'charge') {
        L.angle = clamp(L.angle + inp.x * 14 * D2R * spd * dt, -MAX_ANG, MAX_ANG);
        if (L.st === 'aim') {
          L.aimT += dt; L.power = 0;
          if (inp.bP && L.bombs > 0 && !L.armed) { L.armed = true; L.bombs--; sfx('powerup', { vol: 0.6 }); text('BOM-BAL!', L.cx, 2.6, 0, '#ff9a6a', 1.2); L.ball.mesh.material = L.ball.bombM; L.ball.fuse.visible = true; refreshHud(); }
          else if (inp.bP && L.armed) { L.armed = false; L.bombs++; L.ball.mesh.material = L.ball.bm; L.ball.fuse.visible = false; sfx('click', { vol: 0.5 }); refreshHud(); }
          if (inp.aP) { L.st = 'charge'; L.chargeT = 0; sfx('tick', { vol: 0.5 }); }
          else if (L.aimT > AIM_T) { L.power = 0.62 + rng() * 0.25; text('TE LAAT!', L.cx, 2.4, 0.5, '#ff9a6a', 1); throwBall(L); }
          if (G.timeUp && G.st === 'play') closeFrame(L, true);
        } else {
          L.chargeT += dt * (TEMPO > 1 ? 1.0 : 1); L.power = 0.5 - 0.5 * Math.cos(L.chargeT * TAU / 1.5);
          if (!inp.a || L.chargeT > 3.2) { if (L.chargeT <= 3.2 || true) throwBall(L); }
        }
      } else if (L.st === 'roll') {
        L.rollT += dt; const b = L.ball;
        if (b.mode === 'roll' && inp.b && L.steer > 0 && b.z > HEAD + 0.5) { const ax = inp.x; if (Math.abs(ax) > 0.1) { b.vx = clamp(b.vx + ax * 9 * dt, -4.2, 4.2); L.steer = Math.max(0, L.steer - dt * 1.1 * Math.abs(ax)); if (Math.random() < dt * 20) fx.particles.emit(b.x, 0.4, b.z + 0.4, -ax * 1.5, 0.8, 0, { life: 0.3, size: 0.3, color: 0xff9ad0, gravity: 0 }); } }
        L.sfxT -= dt; if ((b.mode === 'roll') && L.sfxT <= 0) { L.sfxT = 0.1; if (audio.noise) audio.noise(0.12, { type: 'lowpass', freq: 240 + Math.hypot(b.vx, b.vz) * 22, vol: 0.07 }); }
        if (b.mode === 'gone') { L.st = 'settle'; L.settleT = 0; L.quiet = 0; }
        if (L.rollT > 6) { b.mode = 'gone'; }
      } else if (L.st === 'settle') {
        L.settleT += dt;
        const moving = L.pins.some((pn) => pn.on && pn.state !== 'gone' && (Math.hypot(pn.vx, pn.vz) > 0.35 || ((pn.state === 'fall') && pn.f < 1) || pn.y > 0.05));
        L.quiet = moving ? 0 : L.quiet + dt;
        if (L.quiet > 0.55 || L.settleT > 4.5) evaluate(L);
      } else if (L.st === 'sweep') {
        // geslagen kegels verdwijnen met een poef
        for (const pn of L.pins) if (pn.on && pn.state !== 'stand' && pn.state !== 'gone' && L.stT > 0.3) { pn.state = 'gone'; pn.gT = 0.1; }
        if (L.stT > (L.single ? 1.4 : 1.1)) sweepDone(L);
      }
      // bal-beeld
      const b = L.ball;
      if (b.mode === 'gone') { b.gT += dt; if (b.gT < 3) { b.y -= dt * 5; } else b.grp.visible = false; }
      // drakenaanwezigheid
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      T += dt;
      if (!started) { started = true; startFrame(); }
      if (G.st === 'play' || G.st === 'sudden') {
        if (G.st === 'play') { timeLeft = Math.max(0, timeLeft - dt); hud.setTimer(timeLeft, 15); if (timeLeft <= 0) G.timeUp = true; }
        for (const L of lanes) updateLane(L, dt);
        G.t += dt;
        // vaste stappen voor de natuurkunde
        for (const L of lanes) { L.acc += dt; let n = 0; while (L.acc >= STEP && n++ < 10) { L.acc -= STEP; stepLane(L, STEP); } if (L.acc > STEP * 10) L.acc = 0; }
        if (lanes.every((L) => L.st === 'done')) {
          G.sumT = (G.sumT || 0) + dt;
          if (G.sumT > (G.st === 'sudden' ? 1.6 : 1.5)) {
            G.sumT = 0;
            if (G.st === 'sudden') resolveSudden();
            else if (G.frame >= FRAMES - 1 || G.timeUp) { if (score[0] === score[1] || tieFlag) { tieFlag = false; startSudden(); } else endGame(score[0] > score[1] ? 0 : 1, 'punten'); }
            else startFrame();
          }
        }
        // draak: vliegt aan en weg
      } else if (G.st === 'end') { G.endT += dt; }
      visuals(dt);
    }
    function resolveSudden() {
      const a = lanes[0].cnt[1], b = lanes[1].cnt[1];
      if (a !== b) { score[a > b ? 0 : 1] += 1; endGame(a > b ? 0 : 1, 'sudden'); }
      else if (G.sudden >= SD_MAX) { const w = stats.strikes[0] !== stats.strikes[1] ? (stats.strikes[0] > stats.strikes[1] ? 0 : 1) : rng() < 0.5 ? 0 : 1; score[w] += 1; endGame(w, 'coin'); }
      else startSudden();
    }
    function endGame(w, how) {
      G.st = 'end'; G.winner = w; G.endT = 0; G.how = how; refreshHud(); drawBoard(); hud.showBig(`${names[w]} WINT!`, 1800, colorsCss[w][0]); sfx('win', { vol: 0.8 }); ctx.shake(0.3); hud.setTimer(null);
      chars[w].cheerT = 99; chars[1 - w].sadT = 99; setTimeout(() => {}, 0); G.finishAt = 2.4;
    }

    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(), camPos = new THREE.Vector3(); let camShift = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = clamp(7.6 / (tanH * asp), 15, 36);
      const rolling = lanes.some((L) => L.st === 'roll'); const tz = rolling ? -8.8 : -8.0; camShift = damp(camShift, tz, 1.5, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.35;
      camPos.set(sway, 4.4 + dist * 0.5, 4.2 + dist * 0.62); camLook.set(0, 0.3, camShift);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }
    const dd = new THREE.Object3D();
    function visuals(dt) {
      const tt = T + introT; W.update(tt, dt);
      for (const L of lanes) {
        const p = L.p, b = L.ball; const inAim = L.st === 'aim' || L.st === 'charge';
        drawPins(L, dt);
        // bal
        if (b.mode === 'hold' || b.mode === 'roll' || b.mode === 'gutter' || b.mode === 'gone') {
          const gy = b.mode === 'gutter' ? lerp(b.y, b.r - 0.42, Math.min(1, dt * 10)) : b.y; if (b.mode === 'gutter') b.y = gy;
          b.grp.position.set(b.x, b.mode === 'hold' ? b.r + Math.sin(tt * 3 + p) * 0.03 : b.y, b.z);
          if (b.mode === 'roll' || b.mode === 'gutter') { const sp = Math.hypot(b.vx, b.vz); const axis = new THREE.Vector3(b.vz, 0, -b.vx).normalize(); if (sp > 0.01) { b.rotQ.premultiply(qT.setFromAxisAngle(axis.set(b.vz, 0, -b.vx).normalize(), sp / b.r * dt)); } b.mesh.quaternion.copy(b.rotQ);
            if (sp > 1 && Math.random() < dt * 25) fx.particles.emit(b.x, 0.15, b.z + 0.3, (Math.random() - 0.5) * 0.5, 0.4, 0.5, { life: 0.3, size: 0.25, color: 0xe8d0a8, gravity: -1 }); }
          if (b.bomb && b.fuse.visible) { b.bm; b.bombM.emissive.setRGB(0.4 + 0.4 * Math.sin(tt * 20), 0.05, 0); if (Math.random() < dt * 40) fx.particles.emit(b.x, b.r + 1.1 * b.r, b.z, (Math.random() - 0.5), 1.2, (Math.random() - 0.5), { life: 0.3, size: 0.2, color: 0xffb040, gravity: 0 }); }
          if (L.armed && b.mode === 'hold') { b.bombM.emissive.setRGB(0.3 + 0.3 * Math.sin(tt * 14), 0.03, 0); }
          b.shadow.position.set(b.x, 0.035, b.z); b.shadow.scale.setScalar(b.r * 1.6); b.shadow.visible = b.mode !== 'gutter' && b.mode !== 'gone';
        }
        // richtingspijl + meter
        const showAim = inAim; L.dots.visible = showAim; L.head.visible = showAim;
        if (showAim) {
          const a = aimAngle(L); const sx = Math.sin(a), sz = -Math.cos(a);
          for (let k = 0; k < 12; k++) { const d = 1.3 + k * 0.85; dd.position.set(b.x + sx * d, 0.05, b.z + sz * d); dd.scale.setScalar(1 - k * 0.04); dd.updateMatrix(); L.dots.setMatrixAt(k, dd.matrix); }
          L.dots.instanceMatrix.needsUpdate = true;
          const hd = 1.3 + 12 * 0.85 + 0.2; L.head.position.set(b.x + sx * hd, 0.06, b.z + sz * hd); L.head.rotation.order = 'YXZ'; L.head.rotation.set(-Math.PI / 2, -a, 0);
        }
        const ms = L.meter; const showM = inAim || L.st === 'roll'; ms.bg.visible = showM; ms.fill.visible = showM; ms.sweet.visible = inAim; ms.steer.visible = L.st === 'roll';
        if (showM) {
          const pw = L.st === 'charge' ? L.power : L.st === 'roll' ? 0 : 0; ms.fill.scale.x = Math.max(0.001, 4.0 * pw);
          ms.fill.material.color.setHSL(lerp(0.33, 0.0, pw), 0.9, 0.5);
          ms.fill.visible = L.st === 'charge';
          ms.steer.scale.x = Math.max(0.001, 4.0 * L.steer); ms.steer.material.color.setHex(L.steer < 0.25 ? 0xff5050 : 0xff9ad0);
          ms.bg.material.opacity = L.st === 'charge' ? 0.9 : 0.55;
        }
        // bumpers
        L.bump.k = damp(L.bump.k, L.bump.on ? 1 : 0, 6, dt);
        L.bumpers.forEach((m, i) => { const sq = L.bump.sq[i] = Math.max(0, L.bump.sq[i] - dt * 5); const k = L.bump.k; m.visible = k > 0.02; m.scale.set(1 + sq * 0.4, Math.max(0.01, k) * (1 - sq * 0.2), 1); m.position.y = 0.0 + 0.27 * Math.max(0.01, k); });
        // draak
        const D = L.drag;
        if (!D.on) D.g = false;
        if (D.on) { D.t += dt; if (!D.g) { D.g = true; dragon.group.visible = true; dragon.group.userData.lane = p; sfx('thud', { vol: 0.8, rate: 0.7 }); ctx.shake(0.4); } }
        if (D.on && D.g) {
          const k = smoothstep(0, 0.9, D.t); const sd = D.side;
          dragon.group.position.set(L.cx + sd * 2.0, 0.2 + (1 - k) * 9 + Math.sin(tt * 3) * 0.04, -7.0);
          dragon.group.rotation.y = -sd * Math.PI / 2; dragon.update(dt); dragon.group.visible = true;
          if (D.t < 0.95 && D.t - dt <= 0.9 && D.t >= 0.9) { fx.particles.burst(L.cx + sd * 1.1, 0.6, -7, { count: 24, speed: 4, up: 1, life: 0.7, size: 0.7, colors: [0xcfc0e0, 0xffffff], gravity: -0.5 }); sfx('thud', { vol: 0.9 }); ctx.shake(0.45); }
          if (Math.random() < dt * 4) fx.particles.emit(L.cx + sd * 1.1, 1.8, -5.6, 0, 1.2, 0, { life: 0.8, size: 0.4, color: 0xd0d0e0, gravity: -0.4 });
        }
        // poppetje
        const c = chars[p].c; const ch = chars[p]; ch.cheerT = Math.max(0, ch.cheerT - dt); ch.sadT = Math.max(0, ch.sadT - dt);
        let pose = 'idle';
        if (G.st === 'end') pose = G.winner === p ? 'cheer' : 'sad';
        else if (ch.cheerT > 0) pose = 'cheer'; else if (ch.sadT > 0) pose = 'sad';
        else if (L.st === 'charge') pose = 'scared'; else if (inAim) pose = 'carry'; else if (L.st === 'done' && G.st === 'play') pose = 'wave'; else if (L.st === 'roll') pose = 'hands_up';
        c.pose = pose; c.speed = 0;
        const tx = L.st === 'roll' || L.st === 'settle' ? L.cx : 0; c.faceDir(-ch.sx * 0.6 + (tx - ch.holder.position.x) * 0.02, 1); c.update(dt);
      }
      if (!lanes.some((L) => L.drag.on)) dragon.group.visible = false;
      updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; visuals(dt); }
    function introUpdate(dt) { introT += dt; visuals(dt); }
    for (const L of lanes) { rack(L, false); resetBall(L); L.pins.forEach((pn) => { pn.s = 1; }); }
    refreshHud(); drawBoard(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); if (G.st === 'end' && G.endT > G.finishAt && !finished) finishMatch(G.winner, G.how); },
      resultUpdate, introUpdate,
      onSwap() { for (const ch of chars) fx.particles.burst(ch.holder.position.x, 1.5, ch.holder.position.z, { count: 16, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m) { score[i] = Math.max(0, score[i] - 3); text('DEURMAN: -3', lanes[i].cx, 3.4, 0, '#ff6a6a', 1.3); sfx('static', { vol: 0.5 }); chars[i].sadT = 1.5; refreshHud(); drawBoard(); } }); },
      celebrate(w) { chars[w].cheerT = 99; chars[1 - w].sadT = 99; },
      dispose() {},
      dbg: {
        state: () => ({ T, gst: G.st, frame: G.frame, timeLeft, score: [...score], finished, sudden: G.sudden, timeUp: G.timeUp, stats,
          lanes: lanes.map((L) => ({ st: L.st, throwNo: L.throwNo, angle: L.angle / D2R, aim: aimAngle(L) / D2R, power: L.power, chargeT: L.chargeT, bombs: L.bombs, armed: L.armed, steer: L.steer, bump: L.bump.on, drag: L.drag.on, ball: { mode: L.ball.mode, x: +L.ball.x.toFixed(2), z: +L.ball.z.toFixed(2) }, standing: L.pins.filter((p) => p.on && p.state === 'stand').length, cnt: [...L.cnt], k: [...L.k], fscore: [...L.fscore] })) }),
        setTime: (t) => { timeLeft = t; }, forceTie: () => { tieFlag = true; },
        lanes, gold: () => gold, setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); drawBoard(); },
        forceDragonNext: () => { dragonFrames.push(G.frame + 1); }, dragonFrames,
      },
    };
    // (dragonFrames wordt hieronder gevuld)
  },
};

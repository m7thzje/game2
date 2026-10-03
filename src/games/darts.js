import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { buildTavern, makeDarts, DB, ORDER, RINGS } from './darts_world.js';

// Pijlen-Poeha — duel: darts in een taverne. Beide spelers gooien TEGELIJK (3 pijlen per ronde), elk met een eigen zwevend richtpunt.
//  * richtingen = richtpunt bijsturen, A ingedrukt houden = pijl trekken (kracht + rustiger), loslaten = gooien, B = adem inhouden (even rustig)
//  * echte darts-score: bull 50/25, triple, dubbel; gouden dubbelvakken = x4; het bord draait/schuift/slingert, een kip fladdert door beeld
//  * eerst DOEL punten wint; na 90 s wint de meeste punten (gelijk: sterfte-beurt, dichtst bij de roos)
//  * comeback: wie achterstaat heeft een rustiger richtpunt en kortere B-cooldown; laatste 15 s = dubbele punten

const { BR, CY, FR } = DB;
const TARGET = 300;
const MATCH_TIME = 90;
const ROUND_DARTS = 3;
const PULL_T = 0.85;          // seconden tot volle kracht
const FATIGUE_T = 2.4;        // daarna trilt de arm
const W0 = 1.25;              // basis-wiebel (wereld-eenheden)
const RS = 3.4;               // richtpunt-snelheid
const STEADY_T = 1.1, STEADY_CD = 5.5;
const LATE_T = 15;
const STAND = [[-6.4, 3.4], [6.4, 3.4]];

export default {
  id: 'darts',
  name: 'Pijlen-Poeha',
  giver: 'Herbergier Hennie',
  icon: '🎯',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Darts in de taverne, <b>allebei tegelijk</b>! Eerst <b>300 punten</b> wint (of de meeste na 90 s). Het bord <b>draait en schuift</b>, een <b>kip</b> fladdert in de weg en gouden dubbelvakken tellen x4!',
  controls: ['{move} richtpunt bijsturen', '{a} trekken, loslaten = gooien', '{b} adem inhouden (even rustig)'],
  tip: 'Trek je pijl even aan voor een rechte worp, maar niet te lang! Wie achterstaat wordt rustiger.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? ctx.twist.speed || 1 : 1;

    const L = ctx.lights('indoor', { shadow: 12, center: [0, 3, 4], fogNear: 30, fogFar: 80 });
    L.hemi.intensity = 1.05; L.hemi.color.set(0xffe2b8); L.hemi.groundColor.set(0x6a4a30);
    L.sun.intensity = 1.0; L.sun.color.set(0xffe0b0); L.sun.position.set(-6, 14, 16);
    camera.fov = 48; camera.updateProjectionMatrix();
    const A = buildTavern(ctx, L, players.map((p) => p.css));
    const darts = makeDarts(scene, 30);
    const board = A.board;

    // ---------------- spelers ----------------
    const P = players.map((pp, i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group);
      const sz = pv.size(i); const k = 1.3 * lerp(1, sz, 0.45);
      holder.scale.setScalar(k); holder.position.set(STAND[i][0], 0.0, STAND[i][1]); scene.add(holder);
      c.faceDir(-STAND[i][0] * 0.6, -STAND[i][1]); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const rug = mesh(new THREE.BoxGeometry(3.4, 0.08, 2.2), mat(i ? 0x2c4f9a : 0x2a7a46, { flatShading: false }), { cast: false, pos: [STAND[i][0], 0.04, STAND[i][1]] }); scene.add(rug);
      const tagTex = canvasTex(256, 96, (g, w, h) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,5,10,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, h / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, h / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.4, 0.9, 1); tag.position.set(STAND[i][0], k * 1.84 + 0.9, STAND[i][1]); tag.renderOrder = 14; scene.add(tag);
      // richtpunt
      const ret = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTex(pp.css, pp.name[0]), transparent: true, depthTest: false })); ret.renderOrder = 12; scene.add(ret);
      const pw = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex(), color: pp.color, transparent: true, depthTest: false, opacity: 0 })); pw.renderOrder = 11; scene.add(pw);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe14a, transparent: true, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.renderOrder = 10; scene.add(glow);
      const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.17), new THREE.MeshBasicMaterial({ color: 0x120c10, transparent: true, opacity: 0.8, depthTest: false })); barBg.renderOrder = 12; scene.add(barBg);
      const barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.1), new THREE.MeshBasicMaterial({ color: pp.color, depthTest: false })); barFill.renderOrder = 13; scene.add(barFill);
      return { i, name: pp.name, col: pp.color, c, holder, k, ret, pw, glow, barBg, barFill, x: STAND[i][0], z: STAND[i][1],
        ax: i ? 1.6 : -1.6, ay: CY - 0.4, vx: 0, vy: 0, lx: 0, ly: 0, ph: Math.random() * 6, wmul: 1,
        state: 'ready', hold: 0, pull: 0, cd: 0.4, left: ROUND_DARTS, flying: 0, held: -1, steadyT: 0, steadyCd: 0, score: 0, roundPts: 0, last: '', poseT: 0, frozen: 0,
        st: { bulls: 0, outer: 0, trip: 0, dbl: 0, gold: 0, miss: 0, best: 0, thrown: 0, chicken: 0 } };
    });

    // ---------------- toestand ----------------
    let T = 0, introT = 0, finished = false, slow = 1, slowHold = 0, camPunch = 0;
    const G = { state: 'play', timeLeft: MATCH_TIME, late: false, timeUp: false, sd: false, sdT: 0, sdRes: [null, null], round: 1, roundT: 0, graceT: 0, graceOn: false, forceRelease: -1, clearT: 0, endT: 0, winner: -1, goldT: 0, goldSet: new Set() };
    const stats = { events: 0, rounds: 1, evs: [] };
    const darted = [];      // alle pijlen
    const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), m4 = new THREE.Matrix4(), dummy = new THREE.Object3D(), ZAX = new THREE.Vector3(0, 0, 1);
    const trailing = (p) => Math.max(0, P[1 - p.i].score - p.score);
    const kTrail = (p) => clamp(trailing(p) / 50, 0, 1);

    function refreshHud() {
      hud.setScore(`${names[0]} ${P[0].score} – ${P[1].score} ${names[1]}${G.sd ? '  (STERFTE-BEURT)' : ''}`);
      for (const p of P) {
        const kt = kTrail(p);
        hud.setPlayerInfo(p.i, `${p.score} pt · ${'●'.repeat(p.left)}${'○'.repeat(ROUND_DARTS - p.left)}${p.steadyCd > 0 ? ` · adem ${Math.ceil(p.steadyCd)}s` : ' · adem ✓'}${kt > 0.3 ? ' · RUSTIG' : ''}`);
        A.drawScore(p.i, p.name, p.score, TARGET, p.last, p.left, kt > 0.3);
      }
    }
    let hudT = 0;

    // ---------------- score ----------------
    function toLocal(wx, wy) {
      const dx = wx - board.position.x, dy = wy - board.position.y, c = Math.cos(board.rotation.z), s = Math.sin(board.rotation.z);
      return [dx * c + dy * s, -dx * s + dy * c];
    }
    function evalHit(wx, wy) {
      const [lx, ly] = toLocal(wx, wy); const r = Math.hypot(lx, ly) / BR;
      const o = { lx, ly, r, pts: 0, base: 0, kind: 'miss', label: 'MIS', sector: -1, num: 0 };
      if (r > RINGS.dblOut * FR) { o.off = true; return o; }
      if (r > RINGS.dblOut) return o;
      if (r < RINGS.bullIn) { o.pts = 50; o.kind = 'bull'; o.label = 'BULLSEYE'; return o; }
      if (r < RINGS.bullOut) { o.pts = 25; o.kind = 'outer'; o.label = '25'; return o; }
      const ang = Math.atan2(lx, ly); const idx = Math.floor((((ang + Math.PI / 20) % TAU) + TAU) % TAU / (Math.PI / 10)) % 20; const n = ORDER[idx];
      o.sector = idx; o.num = n;
      if (r >= RINGS.tripIn && r < RINGS.tripOut) { o.kind = 'triple'; o.pts = n * 3; o.label = `T${n}`; }
      else if (r >= RINGS.dblIn) { if (G.goldSet.has(idx)) { o.kind = 'gold'; o.pts = n * 4; o.label = `GOUD D${n}`; } else { o.kind = 'double'; o.pts = n * 2; o.label = `D${n}`; } }
      else { o.kind = 'single'; o.pts = n; o.label = String(n); }
      return o;
    }
    function newGold() {
      const set = new Set(); let g = 0;
      while (set.size < 2 && g++ < 50) { const i = Math.floor(Math.random() * 20); if (ORDER[i] >= 6 && ![...set].some((j) => Math.min(Math.abs(i - j), 20 - Math.abs(i - j)) < 4)) set.add(i); }
      G.goldSet = set; A.setGold(set);
    }
    newGold();

    // ---------------- worp ----------------
    function handPos(p, out) { p.c.handR.getWorldPosition(out); if (!isFinite(out.x) || out.y < 0.5) out.set(p.x + (p.i ? -0.5 : 0.5), 2.7, p.z - 0.5); return out; }
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;
    function startPull(p) {
      p.state = 'pull'; p.hold = 0; p.pull = 0; p.pose0 = true; p.c.pose = 'point';
      p.held = darts.alloc(); audio.sfx('select', { vol: 0.3, rate: 1.6 });
    }
    function throwDart(p, forced = false) {
      const power = clamp(p.pull, 0.05, 1);
      const idx = p.held; p.held = -1;
      const hp = handPos(p, v3b); const hx = hp.x, hy = hp.y, hz = hp.z;
      let tx = p.lx + gauss() * (0.05 + (1 - power) * 0.28), ty = p.ly + gauss() * (0.05 + (1 - power) * 0.28);
      ty -= power < 0.75 ? Math.pow((0.75 - power) / 0.75, 1.3) * 2.3 * (GRAV < 1 ? 0.6 : 1) : 0;
      const d = { idx, p, state: 'fly', t: 0, dur: lerp(0.66, 0.36, power) * (GRAV < 1 ? 1.45 : 1) / TEMPO, hx, hy, hz, tx, ty, arc: lerp(1.7, 0.55, power) * (GRAV < 1 ? 1.7 : 1), uC: 1 - 1.9 / Math.max(2, hz), chk: false, col: p.col, wig: 0, rm: 0, power, anchor: 'board' };
      darted.push(d);
      p.left--; p.flying++; p.state = 'cool'; p.cd = 0.55; p.pull = 0; p.hold = 0; p.st.thrown++;
      p.c.swing(); p.c.pose = 'idle'; p.poseT = 0;
      audio.sfx('throw', { vol: 0.6, rate: 0.9 + power * 0.4 }); audio.sfx('whoosh', { vol: 0.25, rate: 1.2 });
      if (power < 0.4 && !forced) fx.texts.add('SLAPPE WORP', p.lx, p.ly + 1, 0.6, '#ffffff', 0.9);
      refreshHud();
    }
    function dartMatrix(d, out) {
      if (d.state === 'fly') {
        const u = clamp(d.t / d.dur, 0, 1);
        const px = lerp(d.hx, d.tx, u), py = lerp(d.hy, d.ty, u) + d.arc * 4 * u * (1 - u), pz = lerp(d.hz, 0.03, u);
        const vx = d.tx - d.hx, vy = d.ty - d.hy + d.arc * 4 * (1 - 2 * u), vz = 0.03 - d.hz;
        v3.set(-vx, -vy, -vz).normalize(); qa.setFromUnitVectors(ZAX, v3);
        dummy.position.set(px, py, pz); dummy.quaternion.copy(qa); dummy.scale.setScalar(1); dummy.updateMatrix(); out.copy(dummy.matrix); return;
      }
      if (d.state === 'stuck') {
        const rm = d.rm > 0 ? Math.max(0, 1 - d.rm / 0.3) : 1;
        const wig = d.wig > 0 ? Math.sin(d.wig * 45) * d.wig * 0.9 : 0;
        dummy.position.set(d.lx, d.ly, 0.03); dummy.quaternion.copy(d.q); dummy.rotateX(wig); dummy.scale.setScalar(rm); dummy.updateMatrix();
        if (d.anchor === 'board') out.multiplyMatrices(board.matrixWorld, dummy.matrix); else out.copy(dummy.matrix);
        return;
      }
      // vallen
      dummy.position.set(d.x, d.y, d.z); dummy.quaternion.setFromEuler(new THREE.Euler(d.rx, d.ry, d.rz)); dummy.scale.setScalar(d.rm > 0 ? Math.max(0, 1 - d.rm / 0.3) : 1); dummy.updateMatrix(); out.copy(dummy.matrix);
    }
    function land(d) {
      const p = d.p; p.flying--;
      const r = evalHit(d.tx, d.ty);
      const mulLate = G.late ? 2 : 1;
      const pts = G.state === 'end' ? 0 : r.pts * mulLate;
      d.res = r; d.state = 'stuck'; d.wig = 0.5;
      d.lx = r.lx; d.ly = r.ly; d.anchor = r.off ? 'wall' : 'board';
      if (r.off) { d.lx = d.tx; d.ly = d.ty; }
      // richting in bordruimte (voor de stand van de pijl)
      const c = Math.cos(board.rotation.z), s = Math.sin(board.rotation.z);
      let vx = d.tx - d.hx, vy = d.ty - d.hy - d.arc * 4, vz = 0.03 - d.hz;
      if (d.anchor === 'board') { const wx = vx * c + vy * s; vy = -vx * s + vy * c; vx = wx; }
      v3.set(-vx, -vy, -vz).normalize(); d.q = new THREE.Quaternion().setFromUnitVectors(ZAX, v3);
      p.score += pts; p.roundPts += pts; p.last = r.pts > 0 ? `${r.label}${mulLate > 1 ? ' x2' : ''} = ${pts}` : 'MIS';
      p.st.best = Math.max(p.st.best, pts);
      const wx = d.tx, wy = d.ty;
      const col = p.col;
      switch (r.kind) {
        case 'bull': p.st.bulls++; ctx.shake(0.6); slow = 0.3; slowHold = 0.55; camPunch = 1; audio.sfx('bell', { vol: 0.9 }); audio.sfx('win', { vol: 0.5 });
          fx.particles.burst(wx, wy, 0.6, { count: 60, speed: 7, up: 0.3, life: 1.1, size: 0.45, colors: [0xffd23f, 0xff4a4a, 0xffffff], gravity: 3 }); fx.particles.ring(wx, wy, 0.6, { count: 28, speed: 6, color: 0xffd23f, size: 0.35, life: 0.7 });
          fx.texts.add(`BULLSEYE! ${pts}`, wx, wy + 1.2, 0.8, '#ffd23f', 1.6); A.cheer(2.4); p.c.pose = 'cheer'; p.poseT = 1.3; break;
        case 'outer': p.st.outer++; audio.sfx('ding', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.3 }); fx.particles.burst(wx, wy, 0.5, { count: 20, speed: 4, up: 0.2, life: 0.7, size: 0.3, colors: [0x6aff8a, 0xffffff], gravity: 3 }); fx.texts.add(`25`, wx, wy + 0.9, 0.8, '#8dff9a', 1.1); A.cheer(1.2); break;
        case 'triple': p.st.trip++; audio.sfx('coin', { vol: 0.6, rate: 1.1 }); audio.sfx('thud', { vol: 0.4 }); ctx.shake(0.2);
          fx.particles.burst(wx, wy, 0.5, { count: 24, speed: 4.5, up: 0.2, life: 0.7, size: 0.32, colors: [0xff5a4a, 0x4aff7a, 0xffffff], gravity: 4 }); fx.texts.add(`${r.label} ${pts}`, wx, wy + 0.9, 0.8, '#ffb0a0', 1.2); A.cheer(1.4); break;
        case 'gold': p.st.gold++; ctx.shake(0.55); slow = 0.45; slowHold = 0.35; audio.sfx('powerup', { vol: 0.8 }); audio.sfx('bell', { vol: 0.6 });
          fx.particles.burst(wx, wy, 0.6, { count: 50, speed: 6, up: 0.4, life: 1.0, size: 0.4, colors: [0xffd23f, 0xfff0a0, 0xffa020], gravity: 4 }); fx.texts.add(`GOUD! ${pts}`, wx, wy + 1.1, 0.8, '#ffd23f', 1.6); A.cheer(2.2); p.c.pose = 'cheer'; p.poseT = 1.0; break;
        case 'double': p.st.dbl++; audio.sfx('ding', { vol: 0.5, rate: 0.9 }); audio.sfx('thud', { vol: 0.4 }); ctx.shake(0.15);
          fx.particles.burst(wx, wy, 0.5, { count: 16, speed: 3.5, up: 0.2, life: 0.6, size: 0.3, colors: [0xff9a7a, 0x8aff9a], gravity: 4 }); fx.texts.add(`${r.label} ${pts}`, wx, wy + 0.9, 0.8, '#ffd6a0', 1.1); A.cheer(0.9); break;
        case 'single': audio.sfx('thud', { vol: 0.5 }); fx.particles.burst(wx, wy, 0.4, { count: 8, speed: 2.5, up: 0.2, life: 0.45, size: 0.25, colors: [0xe8d8b8], gravity: 4 }); fx.texts.add(`${pts}`, wx, wy + 0.8, 0.8, '#ffffff', 0.95); break;
        default: p.st.miss++; audio.sfx(r.off ? 'wood' : 'miss', { vol: 0.5 }); fx.particles.burst(wx, wy, 0.4, { count: 8, speed: 2.5, up: 0.2, life: 0.5, size: 0.25, colors: [0x9a8a7a], gravity: 4 }); fx.texts.add('MIS!', wx, wy + 0.8, 0.8, '#b8b8c8', 1.0); A.groan(0.9); p.c.pose = 'sad'; p.poseT = 0.8;
      }
      if (G.sd) { G.sdRes[p.i] = r.off ? 99 : r.r; }
      refreshHud();
      // doel bereikt?
      if (!G.sd && G.state !== 'end' && p.score >= TARGET) endMatch(p.i, 'target');
    }

    // ---------------- einde ----------------
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const l = 1 - winner, W = P[winner], Lz = P[l];
      const jokes = [`${W.name} gooit alles in de roos! ${Lz.name} raakt vooral de muur.`, `De hele taverne joelt voor ${W.name}. ${Lz.name} bestelt troostbier.`, `${W.name} is de nieuwe Pijlen-Poeha! De kip is onder de indruk.`, `${Lz.name} mikte op de bull, maar raakte de herbergier.`];
      const bits = [];
      if (W.st.bulls) bits.push(`${W.st.bulls}x bullseye`); if (W.st.gold) bits.push(`${W.st.gold}x gouden dubbel`); if (W.st.trip) bits.push(`${W.st.trip}x triple`);
      if (P[0].st.chicken + P[1].st.chicken) bits.push(`de kip werd ${P[0].st.chicken + P[1].st.chicken}x geraakt`);
      ctx.finishPvp({ winner, score: [P[0].score, P[1].score], delay: 900, summary: `${pick(jokes)}${G.sd ? ' Beslist met een sterfte-beurt: dichtst bij de roos won!' : ''}${bits.length ? ` (${bits.join(', ')})` : ''}` });
    }
    function endMatch(winner, why) {
      if (G.state === 'end') return;
      G.state = 'end'; G.winner = winner; G.endT = 0; G.why = why; slow = Math.min(slow, 0.4); slowHold = 0.8;
      hud.setTimer(null);
      hud.showBig(`${names[winner]} WINT!`, 1700, winner ? '#8fb8ff' : '#7dffb0');
      audio.sfx('bell', { vol: 1 }); ctx.shake(0.5); A.cheer(8);
      P[winner].c.pose = 'cheer'; P[1 - winner].c.pose = 'sad';
      for (const p of P) { if (p.held >= 0) { darts.release(p.held); p.held = -1; } p.state = 'done'; }
      fx.particles.burst(0, CY + 2, 1.5, { count: 90, speed: 9, up: 1.0, life: 1.6, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
    }
    function resolveTimeUp() {
      if (P[0].score !== P[1].score) { hud.showBig('TIJD!', 1000, '#ffd23f'); audio.sfx('bell', { vol: 0.9 }); endMatch(P[0].score > P[1].score ? 0 : 1, 'time'); return; }
      // gelijkspel: sterfte-beurt
      G.sd = true; G.sdT = 0; G.sdRes = [null, null]; G.state = 'play'; G.late = false; G.timeUp = false; G.graceOn = false;
      for (const p of P) { p.left = 1; p.state = 'ready'; p.cd = 0.3; p.flying = 0; p.roundPts = 0; }
      for (const d of darted) if (d.state === 'stuck' && d.rm === 0) d.rm = 0.001;
      hud.showBig('GELIJK!', 1300, '#ffd23f'); hud.toast('Sterfte-beurt: één pijl elk, dichtst bij de roos wint!', 2800); audio.sfx('bell', { vol: 0.9 }); ctx.shake(0.4);
      refreshHud();
    }

    // ---------------- ronde-flow ----------------
    function startClear() {
      G.state = 'clear'; G.clearT = 0;
      for (const p of P) {
        if (p.roundPts > 0) fx.texts.add(`+${p.roundPts}`, p.x, p.k * 1.84 + 1.6, p.z, p.i ? '#8fb8ff' : '#7dffb0', 1.4);
        p.roundPts = 0;
      }
      for (const d of darted) if (d.state === 'stuck' && d.rm === 0) { d.rm = 0.001; }
      audio.sfx('pop', { vol: 0.35, rate: 1.3 });
    }
    function nextRound() {
      G.state = 'play'; G.round++; stats.rounds = G.round; G.roundT = 0; G.graceOn = false; G.forceRelease = -1;
      for (const p of P) { p.left = ROUND_DARTS; p.state = 'ready'; p.cd = 0.3; p.last = p.last; }
      refreshHud();
    }

    // ---------------- gimmicks: bord-gebeurtenissen ----------------
    const EVENTS = ['spin', 'slide', 'swing', 'shove', 'chicken'];
    let ev = null, evGap = 6, lastEv = '', spinAng = 0, shoveX = 0, shoveR = 0, shoveTX = 0, shoveTR = 0;
    function startEvent(id) {
      id = id || pick(EVENTS.filter((e) => e !== lastEv)); lastEv = id; stats.events++; stats.evs.push(id);
      ev = { id, t: 0, dur: id === 'chicken' ? 9 : id === 'shove' ? 7.4 : 6.5, dir: Math.random() < 0.5 ? -1 : 1, did: false };
      const txt = { spin: '🎡 Het bord DRAAIT rond!', slide: '↔️ Het bord glijdt heen en weer!', swing: '🔔 Het bord slingert!', shove: '👁️ De Deurman duwt het bord scheef!', chicken: '🐔 Een KIP fladdert door beeld!' }[id];
      hud.toast(txt, 2200); audio.sfx(id === 'chicken' ? 'boing' : id === 'shove' ? 'creak' : 'whoosh', { vol: 0.5 });
      if (id === 'chicken') { A.chicken.start(ev.dir, CY + rand(-1.6, 1.6)); audio.sfx('pop', { vol: 0.4, rate: 0.8 }); }
    }
    function updateEvent(dt) {
      let slideX = 0, swingR = 0, spinV = 0;
      if (ev) {
        ev.t += dt; const t = ev.t, d = ev.dur; const env = smoothstep(0, 0.9, t) * smoothstep(0, 0.9, d - t);
        if (ev.id === 'spin') spinV = 1.15 * env * ev.dir;
        else if (ev.id === 'slide') slideX = 1.9 * Math.sin(t * 1.55) * env;
        else if (ev.id === 'swing') swingR = 0.5 * Math.sin(t * 2.5) * env;
        else if (ev.id === 'shove') {
          const s = ev.dir;     // kant waar de Deurman staat
          const enter = smoothstep(0, 1.1, t) * (1 - smoothstep(d - 1.0, d, t)), push = smoothstep(1.1, 1.5, t) * (1 - smoothstep(d - 2.4, d - 2.0, t));
          A.deurman.pose(s, enter, push);
          if (!ev.did && t > 1.3) { ev.did = true; shoveTX = -s * 1.7; shoveTR = -s * 0.28; ctx.shake(0.5); audio.sfx('slam', { vol: 0.5 }); fx.texts.add('DUWWW!', board.position.x - s * 1.0, CY + 3, 1, '#ffd0a0', 1.5); }
          if (ev.did && t > d - 2.4) { shoveTX = 0; shoveTR = 0; }
        } else if (ev.id === 'chicken') { if (!A.chicken.on && t > 1.5) ev.t = d; }
        if (t >= d) { ev = null; evGap = rand(9, 13); A.deurman.g.visible = false; A.chicken.on && A.chicken.stop(); }
      } else { evGap -= dt; if (evGap <= 0 && G.state === 'play' && !G.sd) startEvent(); }
      spinAng += spinV * dt;
      if (!(ev && ev.id === 'spin')) { const n = Math.round(spinAng / TAU); spinAng = damp(spinAng, n * TAU, 2.5, dt); if (n !== 0 && Math.abs(spinAng - n * TAU) < 0.02) spinAng -= n * TAU; }
      shoveX = damp(shoveX, shoveTX, 9, dt); shoveR = damp(shoveR, shoveTR, 7, dt);
      board.position.x = slideX + shoveX; board.rotation.z = spinAng + swingR + shoveR; board.updateMatrixWorld(true);
      A.chicken.update(dt);
    }

    // ---------------- invoer per speler ----------------
    function control(p, dt, real) {
      const inp = pv.input(p.i);
      const sp = pv.speed(p.i) * (p.steadyT > 0 ? 0.55 : 1) * (p.state === 'pull' ? 0.85 : 1);
      const lam = lerp(14, 1.6, SLIP);
      if (p.frozen > 0) { p.frozen -= dt; p.vx = p.vy = 0; } else {
        p.vx = damp(p.vx, inp.x * RS * sp, lam, dt); p.vy = damp(p.vy, -inp.y * RS * sp, lam, dt);
      }
      p.ax = clamp(p.ax + p.vx * dt, -5.8, 5.8); p.ay = clamp(p.ay + p.vy * dt, CY - 4.9, CY + 4.5);
      p.steadyT = Math.max(0, p.steadyT - dt); p.steadyCd = Math.max(0, p.steadyCd - dt);
      const canPlay = (G.state === 'play') && p.frozen <= 0;
      if (canPlay && (p.state === 'ready' || p.state === 'pull') && inp.bP && p.steadyCd <= 0 && p.steadyT <= 0) {
        p.steadyT = STEADY_T; p.steadyCd = STEADY_CD * (1 - 0.4 * kTrail(p)); audio.sfx('sparkle', { vol: 0.35, rate: 0.8 }); fx.particles.burst(p.lx, p.ly, 0.5, { count: 10, speed: 1.5, up: 0.3, life: 0.6, size: 0.25, colors: [0xffe14a, 0xffffff], gravity: -1 });
      }
      if (p.state === 'cool') { p.cd -= dt; if (p.cd <= 0) p.state = p.left > 0 ? 'ready' : 'waiting'; }
      if (p.state === 'waiting' && p.flying === 0) p.state = 'done';
      if (p.state === 'ready') {
        p.cd -= dt;
        if (canPlay && !G.timeUp && p.cd <= 0 && inp.aP) startPull(p);
      }
      if (p.state === 'pull') {
        p.hold += dt; p.pull = Math.min(1, p.hold / PULL_T);
        if (p.held >= 0) { handPos(p, v3b); setHeld(p); }
        const force = G.timeUp || (G.sd && G.sdT > 9) || G.forceRelease === p.i;
        if (!inp.a || inp.aR || force) throwDart(p, force);
      }
      if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0 && p.state !== 'pull') p.c.pose = 'idle'; }
    }
    function setHeld(p) {
      const hp = handPos(p, v3b);
      v3.set(p.lx - hp.x, p.ly - hp.y, -hp.z).normalize().negate(); qa.setFromUnitVectors(ZAX, v3);
      dummy.position.copy(hp); dummy.quaternion.copy(qa); dummy.scale.setScalar(0.9); dummy.updateMatrix(); darts.set(p.held, dummy.matrix, p.col);
    }

    // ---------------- hoofdlus ----------------
    function wobble(p, t) {
      const sz = pv.size(p.i);
      let m = lerp(1, 0.38, smoothstep(0, 1, p.pull));
      if (p.state === 'pull' && p.hold > FATIGUE_T) m *= 1 + (p.hold - FATIGUE_T) * 0.9;
      if (p.steadyT > 0) m *= 0.12;
      m *= 1 - 0.3 * kTrail(p);
      if (tw === 'drunk') m *= 1.6;
      m *= lerp(1, sz, 0.3);
      p.wmul = damp(p.wmul, m, 12, 0.016);
      const a = W0 * p.wmul * (1 + 0.3 * Math.sin(t * 0.9 + p.ph));      // adem
      const ph = p.ph;
      return [(Math.sin(t * 1.9 + ph) + 0.6 * Math.sin(t * 3.7 + ph * 2.1)) * a * 0.62, (Math.cos(t * 1.5 + ph * 1.3) + 0.5 * Math.sin(t * 4.3 + ph)) * a * 0.62 + Math.sin(t * 0.8 + ph) * a * 0.3];
    }
    function visuals(dt, tt) {
      for (const p of P) {
        const [wx, wy] = wobble(p, tt); p.lx = p.ax + wx; p.ly = p.ay + wy;
        const pulling = p.state === 'pull';
        const showAim = G.state === 'play' && p.state !== 'done' && p.state !== 'waiting' && !(G.timeUp && p.state !== 'pull');
        p.ret.visible = showAim;
        const fat = pulling && p.hold > FATIGUE_T;
        p.ret.position.set(p.lx, p.ly, 0.55); const sc = 0.95 * lerp(1, pv.size(p.i), 0.3) * (1 + (pulling ? (1 - p.pull) * 0.25 : 0)) * (p.state === 'cool' ? 1.15 - p.cd * 0.3 : 1); p.ret.scale.set(sc, sc, 1);
        p.ret.material.color.set(fat ? 0xff7a6a : 0xffffff);
        p.pw.visible = pulling; p.pw.position.set(p.lx, p.ly, 0.5); const ps = 0.95 * (1 + (1 - p.pull) * 1.4); p.pw.scale.set(ps, ps, 1); p.pw.material.opacity = pulling ? 0.35 + p.pull * 0.6 : 0;
        p.glow.visible = p.steadyT > 0; p.glow.position.set(p.lx, p.ly, 0.45); p.glow.scale.setScalar(2.0 + Math.sin(tt * 14) * 0.2); p.glow.material.opacity = Math.min(1, p.steadyT * 3) * 0.9;
        p.barBg.visible = p.barFill.visible = pulling; p.barBg.position.set(p.lx, p.ly - 0.95, 0.5); p.barFill.position.set(p.lx - (1 - p.pull) * 0.61, p.ly - 0.95, 0.52); p.barFill.scale.x = Math.max(0.01, p.pull); p.barFill.material.color.set(fat ? 0xff4a3a : p.pull >= 1 ? 0xffe14a : p.col);
        // poppetje kijkt naar richtpunt
        p.c.faceDir(p.lx - p.x, -p.z); p.c.update(dt);
        if (fat) p.holder.position.x = p.x + Math.sin(tt * 60) * 0.03; else p.holder.position.x = p.x;
      }
    }
    function updateDarts(dt) {
      for (let k = darted.length - 1; k >= 0; k--) {
        const d = darted[k];
        if (d.state === 'fly') {
          d.t += dt; const u = d.t / d.dur;
          if (!d.chk && u >= d.uC) {
            d.chk = true; const c = A.chicken;
            if (c.on && c.hit === 0) {
              const px = lerp(d.hx, d.tx, d.uC), py = lerp(d.hy, d.ty, d.uC) + d.arc * 4 * d.uC * (1 - d.uC);
              if (Math.hypot(px - c.x, py - (c.y + 0.3)) < 1.15) {
                // BOEM: kip geraakt
                d.p.flying--; d.state = 'fall'; d.x = px; d.y = py; d.z = 1.9; d.vx = (px - c.x) * 2 + c.dir * 2; d.vy = 3; d.vz = 3; d.rx = 0; d.ry = 0; d.rz = 0; d.rm = 0;
                c.knock(); d.p.st.chicken++; audio.sfx('boing', { vol: 0.7 }); audio.sfx('pop', { vol: 0.5 }); ctx.shake(0.3);
                fx.particles.burst(c.x, c.y + 0.4, 2.0, { count: 36, speed: 5, up: 1, life: 1.1, size: 0.4, colors: [0xffffff, 0xf4ecd8, 0xffe9b0], gravity: 2 });
                fx.texts.add('BOK BOK BOK!', c.x, c.y + 1.6, 2.2, '#fff0c0', 1.5); d.p.last = 'KIP GERAAKT!'; A.cheer(1.5); refreshHud();
                continue;
              }
            }
          }
          if (u >= 1) { d.t = d.dur; land(d); } else {
            // sporen
            if (Math.random() < 0.5) fx.particles.emit(lerp(d.hx, d.tx, u), lerp(d.hy, d.ty, u) + d.arc * 4 * u * (1 - u), lerp(d.hz, 0, u), 0, 0, 0, { life: 0.25, size: 0.18, color: d.col, gravity: 0 });
          }
        } else if (d.state === 'stuck') {
          if (d.wig > 0) d.wig = Math.max(0, d.wig - dt * 1.6);
          if (d.rm > 0) { d.rm += dt; if (d.rm > 0.3) { darts.release(d.idx); darted.splice(k, 1); continue; } }
        } else if (d.state === 'fall') {
          d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += dt * 9; d.rz += dt * 7;
          if (d.y < 0.2) { d.y = 0.2; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; if (d.rm === 0) d.rm = 0.001; }
          if (d.rm > 0) { d.rm += dt; if (d.rm > 1.2) { darts.release(d.idx); darted.splice(k, 1); continue; } }
        }
        dartMatrix(d, m4); darts.set(d.idx, m4, d.col);
      }
    }
    function updateCamera(dt) {
      camPunch = Math.max(0, camPunch - dt * 2.2);
      const t = T + introT;
      camera.position.set(Math.sin(t * 0.3) * 0.35, 6.3 - camPunch * 0.25, 15.4 - camPunch * 1.1);
      camera.lookAt(0, 4.55, 0.5);
    }

    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      T += dt;
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3, dt);
      const sdt = dt * slow;
      // klok
      if ((G.state === 'play' || G.state === 'clear') && !G.sd && !G.timeUp) {
        G.timeLeft -= dt;
        if (!G.late && G.timeLeft <= LATE_T) { G.late = true; hud.showBig('DUBBEL x2!', 1500, '#ffd23f'); hud.toast('Laatste 15 seconden: alles telt dubbel!', 2200); audio.sfx('powerup', { vol: 0.6 }); A.cheer(1.5); }
        if (G.timeLeft <= 0) { G.timeLeft = 0; G.timeUp = true; hud.setTimer(0); }
        else hud.setTimer(G.timeLeft, 10);
      }
      // gouden vakken verversen
      G.goldT += dt; if (G.goldT > 11 && G.state === 'play') { G.goldT = 0; newGold(); hud.toast('✨ Nieuwe gouden dubbelvakken: x4!', 1800); audio.sfx('sparkle', { vol: 0.5 }); }
      // spelers
      for (const p of P) control(p, sdt, dt);
      if (G.sd) { G.sdT += dt; if (G.sdT > 9) for (const p of P) if (p.state === 'ready') startPull(p); }
      // ronde-logica
      if (G.state === 'play') {
        G.roundT += dt;
        const done = P.map((p) => p.state === 'done' || (p.left === 0 && p.flying === 0));
        if (G.timeUp) {
          for (const p of P) if (p.state === 'ready' || p.state === 'cool') { p.left = 0; if (p.state === 'ready') p.state = 'waiting'; }
          if (P.every((p) => p.flying === 0 && p.state !== 'pull' && p.state !== 'cool') && !G.sd) resolveTimeUp();
        } else if (G.sd) {
          if (done[0] && done[1] && P.every((p) => p.flying === 0)) {
            const a = G.sdRes[0], b = G.sdRes[1]; if (a != null && b != null) { const w = a === b ? (Math.random() < 0.5 ? 0 : 1) : a < b ? 0 : 1; endMatch(w, 'sd'); }
          }
        } else {
          if (done[0] && done[1]) startClear();
          else {
            if ((done[0] || done[1]) && !G.graceOn) { G.graceOn = true; G.graceT = 7; hud.toast(`${names[done[0] ? 1 : 0]} is klaar: nog 7 s voor de rest!`, 1400); }
            if (G.graceOn) G.graceT -= dt;
            if ((G.graceOn && G.graceT <= 0) || G.roundT > 22) {
              for (const p of P) { if (p.state === 'pull') G.forceRelease = p.i; else if (p.state === 'ready' || p.state === 'cool') { if (p.left > 0) fx.texts.add('TE LAAT!', p.x, p.k * 1.84 + 1.2, p.z, '#ff9a8a', 1.1); p.left = 0; p.state = p.flying ? 'waiting' : 'done'; } }
            } else G.forceRelease = -1;
          }
        }
      } else if (G.state === 'clear') {
        G.clearT += dt; if (G.clearT > 1.3) { if (G.timeUp) resolveTimeUp(); else nextRound(); }
      } else if (G.state === 'end') {
        G.endT += dt; if (G.endT > 2.3) finishMatch(G.winner);
      }
      updateEvent(sdt);
      visuals(sdt, T + introT);
      updateDarts(sdt);
      A.update(T + introT, dt);
      updateCamera(dt);
      hudT -= dt; if (hudT <= 0) { hudT = 0.25; refreshHud(); }
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const p of P) p.c.update(dt); updateDarts(dt); A.update(T + introT, dt); updateCamera(dt); }
    function introUpdate(dt) {
      introT += dt;
      for (const p of P) { p.c.pose = 'idle'; }
      visuals(dt, introT);
      A.update(introT, dt); updateCamera(dt);
    }
    refreshHud(); visuals(0.016, 0); updateCamera(0.016); board.updateMatrixWorld(true);

    return {
      update, resultUpdate, introUpdate,
      onSwap() { for (const p of P) fx.particles.burst(p.x, 2.5, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = P[i]; p.score = Math.max(0, p.score - 12); p.frozen = 2.0; fx.texts.add('DEURMAN: -12', p.x, p.k * 1.84 + 1.6, p.z, '#ff8a8a', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); p.last = 'DEURMAN -12'; } });
        refreshHud();
      },
      celebrate(w) { P[w].c.pose = 'cheer'; P[1 - w].c.pose = 'sad'; A.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, timeLeft: G.timeLeft, timeUp: G.timeUp, sd: G.sd, late: G.late, round: G.round, score: P.map((p) => p.score), finished, target: TARGET,
          board: { x: board.position.x, y: board.position.y, rot: board.rotation.z }, ev: ev ? ev.id : null, evs: stats.evs.slice(), gold: [...G.goldSet],
          chicken: A.chicken.on ? { x: A.chicken.x, y: A.chicken.y, hit: A.chicken.hit } : null,
          p: P.map((p) => ({ state: p.state, pull: p.pull, hold: p.hold, left: p.left, flying: p.flying, ax: p.ax, ay: p.ay, lx: p.lx, ly: p.ly, steadyT: p.steadyT, steadyCd: p.steadyCd, wmul: p.wmul, st: { ...p.st } })),
          darts: darted.length }),
        setScore: (a, b) => { P[0].score = a; P[1].score = b; refreshHud(); },
        setTime: (t) => { G.timeLeft = t; },
        startEvent: (id) => startEvent(id), evalHit, newGold, P, board, A, darts,
        setGoldSet: (arr) => { G.goldSet = new Set(arr); A.setGold(G.goldSet); },
      },
    };
  },
};

function reticleTex(css, letter) {
  return canvasTex(128, 128, (g, w) => {
    g.translate(64, 64); g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,5,15,.9)'; g.lineWidth = 11; g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.stroke();
    for (const a of [0, 1, 2, 3]) { g.save(); g.rotate(a * Math.PI / 2); g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -52); g.stroke(); g.restore(); }
    g.strokeStyle = css; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.stroke();
    for (const a of [0, 1, 2, 3]) { g.save(); g.rotate(a * Math.PI / 2); g.beginPath(); g.moveTo(0, -26); g.lineTo(0, -50); g.stroke(); g.restore(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill();
    g.font = 'bold 24px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css; g.lineWidth = 5; g.strokeStyle = 'rgba(10,5,15,.9)'; g.strokeText(letter, 26, -30); g.fillText(letter, 26, -30);
  });
}
function ringTex() { return canvasTex(128, 128, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 55, 0, TAU); g.stroke(); }); }
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

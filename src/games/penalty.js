import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_COLORS, makeBrother, Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { PEN, buildStadium, makeBallMesh, makeGlove } from './penalty_world.js';

// Strafschop-Showdown — duel: penalty's om en om, schutter en keeper TEGELIJK op één scherm (camera achter de bal).
//  * schutter: richtingen = richtpunt, A ingedrukt = laden (kracht slingert), loslaten = schieten, B = effect (curve links/rechts/uit)
//  * keeper: links/rechts = schuifelen, na het schot richting = duik (omhoog = hoog), A = vingertoppen (timing!), B = reuzenhandschoen (cooldown)
//  * 5 penalty's per kant, daarna sudden death (paren). Gimmicks: gouden bal (2 punten), spook-bal, wind, regen, paddenstoel-keeper, kip op het veld
//  * comeback: wie achterstaat krijgt vaker de gouden bal (laatste kicks), een snellere handschoen en vaker een reuzen-keeper

const { GZ, GW, GH, GD, BR, PR } = PEN;
const REG = 5, SD_MAX = 5;                       // penalty's per kant / max aantal sudden-death-paren
const AIM_T = 5.5, PREP_T = 1.5, RES_T = 1.9;
const AIM_VX = 6.0, AIM_VY = 4.2, FREQ = 1.15;
const KZ = GZ + 0.55;                            // vlak waarin de keeper staat
const SH_X = -2.7, SH_Z = 0.6;                 // waar de schutter wacht
const GLOVE_CD = 12, GLOVE_T = 0.9, TIP_T = 0.27;
const GX = GW / 2;

const errOf = (p) => 0.12 + (p > 0.86 ? (p - 0.86) / 0.14 * 1.6 : 0) + (p < 0.35 ? (0.35 - p) * 1.4 : 0);   // spreiding (m) bij kracht p
const flightT = (p) => 1.25 - 0.73 * Math.pow(clamp(p, 0, 1), 0.9);
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const eo3 = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function labelTex(text, css) {
  return canvasTex(320, 96, (c, w, hh) => { c.font = 'bold 46px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 11; c.strokeStyle = 'rgba(10,10,30,.92)'; c.lineJoin = 'round'; c.strokeText(text, w / 2, hh / 2, w - 12); c.fillStyle = css; c.fillText(text, w / 2, hh / 2, w - 12); });
}
function curlTex(k) {
  return canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 44px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10; c.lineJoin = 'round'; c.strokeStyle = 'rgba(10,10,30,.92)'; const t = ['RECHT', '↶ CURVE LINKS', 'CURVE RECHTS ↷'][k]; c.strokeText(t, w / 2, hh / 2, w - 8); c.fillStyle = k ? '#ffd23f' : '#cfe0ff'; c.fillText(t, w / 2, hh / 2, w - 8); });
}

export default {
  id: 'penalty',
  name: 'Strafschop-Showdown',
  giver: 'Scheids Vuurspuwer',
  icon: '🥅',
  mode: 'pvp',
  time: 85,
  music: 'game_fast',
  blurb: 'Om-en-om <b>schutter</b> en <b>keeper</b>, tegelijk op één scherm! 5 penalty\'s, dan <b>sudden death</b>. Pas op voor de <b>draak</b> en een <b>kip</b>!',
  controls: ['{move} richten / keeper: duiken', '{a} laden, los = schot / vingertop', '{b} effect / reuzenhandschoen'],
  tip: 'Keeper: duik pas NA het schot, A = vingertoppen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const G = 9.8 * lerp(1, GRAV, 0.8);
    const CSS = ['#7dffb0', '#8fb8ff'];

    const L = ctx.lights('night', { shadow: 22, center: [0, 0, -4], fog: false });
    L.hemi.intensity = 1.05; L.hemi.color.set(0xb8c4ff); L.hemi.groundColor.set(0x2a3a2a);
    L.sun.color.set(0xfff0d8); L.sun.intensity = 1.9; L.sun.position.set(-9, 28, 12);
    camera.fov = 38; camera.updateProjectionMatrix(); scene.add(camera);
    const A = buildStadium(ctx, L);
    const ftx = (t, x, y, z, c, k = 1) => fx.texts.add(t, x, y, z, c, k * clamp(Math.hypot(camera.position.x - x, camera.position.z - z) / 19, 0.55, 1.2));

    // ---------------- spelers ----------------
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const root = new THREE.Group(), piv = new THREE.Group(); root.add(piv); piv.add(c.group); scene.add(root);
      for (const h of [c.handL, c.handR]) { h.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(0xff7a1a, { flatShading: false }), { cast: false, pos: [0, 0.02, 0.02] })); }
      const shadow = P.shadowBlob(0.9); scene.add(shadow);
      const tex = [labelTex(`${names[i].toUpperCase()} · SCHUTTER`, CSS[i]), labelTex(`${names[i].toUpperCase()} · KEEPER`, CSS[i])];
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[0], transparent: true, depthTest: false })); tag.scale.set(3.0, 0.9, 1); tag.renderOrder = 15; scene.add(tag);
      return { i, c, root, piv, shadow, tag, tex, mood: 'play', kick: 0, kickAnim: 9 };
    });
    // reuzenhandschoen, kip, bal, richtpunt
    const bigGlove = makeGlove(0xff7a1a); bigGlove.visible = false; scene.add(bigGlove);
    const hen = new Animal('chicken'); hen.group.scale.setScalar(2.2); hen.group.visible = false; scene.add(hen.group);
    const henSh = P.shadowBlob(0.9); henSh.visible = false; scene.add(henSh);
    const balls = { normal: makeBallMesh('normal'), gold: makeBallMesh('gold'), spook: makeBallMesh('normal') };
    balls.spook.material = balls.spook.material.clone(); balls.spook.material.emissive.set(0x4affd8); balls.spook.material.emissiveIntensity = 0.55; balls.spook.material.color.set(0xbfffee);
    for (const k in balls) { balls[k].scale.setScalar(BR); balls[k].visible = false; scene.add(balls[k]); }
    const ballShadow = P.shadowBlob(0.5); scene.add(ballShadow);
    const rq = new THREE.Quaternion(), rv = new THREE.Vector3();
    // richtpunt in het doelvlak
    const ret = new THREE.Group(); ret.position.z = GZ + 0.15; scene.add(ret);
    const rmat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false });
    const retRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 32), rmat(0xffffff, 0.9)); retRing.renderOrder = 30; ret.add(retRing);
    const retDot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), rmat(0xffffff)); retDot.renderOrder = 31; ret.add(retDot);
    const ticks = []; for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), rmat(0xffffff)); t.renderOrder = 31; const a = k * Math.PI / 2; t.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0); t.rotation.z = a; ret.add(t); ticks.push(t); }
    ret.visible = false;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }), 14); dots.frustumCulled = false; dots.renderOrder = 29; dots.visible = false; dots.userData.dynamic = true; scene.add(dots);
    const dm = new THREE.Matrix4();

    // ---------------- overlay: kracht-meter ----------------
    const ov = new THREE.Group(); camera.add(ov);
    const oplane = (c, o = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rmat(c, o)); m.renderOrder = 60; ov.add(m); return m; };
    const mFrame = oplane(0x0a0a1e, 0.85), mFill = oplane(0x222a4a, 1); mFrame.renderOrder = 60; mFill.renderOrder = 61;
    const zones = [[0, 0.35, 0x6a7aa8], [0.35, 0.55, 0xe8c83a], [0.55, 0.86, 0x3ac86a], [0.86, 1, 0xe8503a]].map(([a, b, c]) => ({ a, b, m: oplane(c, 0.92) }));
    const mMark = oplane(0xffffff, 1), mGlow = oplane(0xffffff, 0.35); zones.forEach((q) => { q.m.renderOrder = 62; }); mGlow.renderOrder = 63; mMark.renderOrder = 64;
    const mLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('KRACHT', '#ffffff'), transparent: true, depthTest: false })); mLabel.renderOrder = 61; ov.add(mLabel);
    const curlTx = [0, 1, 2].map(curlTex); const mCurl = new THREE.Sprite(new THREE.SpriteMaterial({ map: curlTx[0], transparent: true, depthTest: false })); mCurl.renderOrder = 61; ov.add(mCurl);
    const rainTint = new THREE.Color(), pitchBase = A.pitch.material.color.clone();

    // ---------------- toestand ----------------
    const timers = []; const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    const first = Math.random() < 0.5 ? 0 : 1;
    const score = [0, 0], logs = [[], []], taken = [0, 0];
    const stats = { goals: [0, 0], saves: [0, 0], posts: 0, golds: 0, chickens: 0, tips: 0, gloves: 0, misses: 0, kicks: 0, coin: false };
    const gloveCd = [0, 0], weather = { rain: false };
    let T = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0, kickNo = 0, state = 'prep', stT = 0, camX = 0, camZ = 0, camY = 0, punch = 0, forceNext = null, winner = -1, sdPairs = 0;
    let K = null, B = null, ks = null, lastTimer = -1;
    const hen_ = { on: false, x: 0, z: -5.5, tx: 0, st: 'off', t: 0, dir: 1, hit: false };
    const shooterOf = (n) => (n % 2 === 0 ? first : 1 - first);
    const SDALL = () => taken[0] >= REG && taken[1] >= REG;

    function marks(i) { let s = ''; const n = Math.max(REG, logs[i].length); for (let k = 0; k < n; k++) s += logs[i][k] === undefined ? '·' : logs[i][k] > 1 ? '★' : logs[i][k] ? '⚽' : '✖'; return s; }
    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${SDALL() ? '  (SUDDEN DEATH)' : ''}`);
      for (let i = 0; i < 2; i++) { const role = !K ? '' : K.shooter === i ? 'schiet' : 'keept'; const cd = gloveCd[i] > 0.05 ? ` 🧤${Math.ceil(gloveCd[i])}s` : ' 🧤klaar'; hud.setPlayerInfo(i, `${role} ${marks(i)}${K && K.keeper === i ? cd : ''}`); }
      A.scoreboard(names, score, logs, SDALL() ? 'SUDDEN DEATH' : `STRAFSCHOP ${Math.min(kickNo + 1, REG * 2)} / ${REG * 2}`, K ? K.shooter : -1);
    }

    // ---------------- keeper-houding ----------------
    function keeperSize() { return pv.size(K.keeper) * K.kmul; }
    function keeperPose() {
      const s = ks.s; let cx = ks.x, cy = 0.95 * s, phi = 0, Lh = 1.25 * s;
      if (ks.dive) { const d = ks.dive, e = eo3(d.t / d.dur); cx = ks.x + d.dx * e; cy = lerp(0.95 * s, d.cy * s, e); phi = d.phi * e; Lh = lerp(1.25 * s, d.L * s, e); }
      const tip = ks.tip > 0 ? 0.5 * s : 0;
      return { cx, cy, phi, L: Lh + tip, W: (0.52 + (ks.tip > 0 ? 0.12 : 0)) * s, ax: Math.sin(phi), ay: Math.cos(phi), s };
    }
    function startDive() {
      const sx = Math.abs(ks.bx) > 0.45 ? Math.sign(ks.bx) : 0, sy = ks.by < -0.45 ? 1 : ks.by > 0.45 ? -1 : 0, spd = pv.speed(K.keeper), s = ks.s;
      const d = { t: 0, sx, sy, dur: 0.3 / spd * (1 + (1 / GRAV - 1) * 0.12), dx: 0, cy: 0.95, phi: 0, L: 1.25 };
      if (sx && sy > 0) { d.dx = sx * 2.35; d.cy = 1.7; d.phi = sx * 0.78; d.L = 1.5; }
      else if (sx) { d.dx = sx * 2.75; d.cy = 0.8; d.phi = sx * 1.32; d.L = 1.58; }
      else if (sy > 0) { d.cy = 1.55 * lerp(1, 1 / GRAV, 0.15); d.L = 1.45; }
      else if (sy < 0) { d.cy = 0.62; d.L = 1.05; }
      d.dx = clamp(ks.x + d.dx, -GX - 0.3, GX + 0.3) - ks.x;
      ks.dive = d; audio.sfx('whoosh', { vol: 0.35, rate: 1.1 + (sx ? 0.2 : 0) }); fx.particles.dust(ks.x, 0.1, KZ, 5, 0xbfe8b0);
      pl[K.keeper].c.pose = 'hands_up';
    }

    // ---------------- penalty starten ----------------
    function rollEvents() {
      const sh = shooterOf(kickNo), ke = 1 - sh; const trailSh = score[ke] - score[sh], trailKe = score[sh] - score[ke];
      const sd = SDALL(); const lateReg = !sd && taken[sh] >= 3;
      const ev = { ball: 'normal', wind: 0, kmul: 1, hen: false };
      const r = Math.random(), pGold = sd ? 0 : 0.07 + (trailSh > 0 && lateReg ? 0.33 : 0), pSpook = 0.13;
      ev.ball = r < pGold ? 'gold' : r < pGold + pSpook ? 'spook' : 'normal';
      if (Math.random() < 0.32) ev.wind = (Math.random() < 0.5 ? -1 : 1) * rand(2.4, 4.4);
      const r2 = Math.random(), pBig = 0.12 + (trailKe > 0 ? 0.18 : 0), pTiny = 0.1; ev.kmul = r2 < pBig ? 1.5 : r2 < pBig + pTiny ? 0.72 : 1;
      ev.hen = Math.random() < 0.24;
      if (weather.rain) { if (Math.random() < 0.4) weather.rain = false; } else if (Math.random() < 0.14) weather.rain = true;
      ev.rain = weather.rain;
      if (forceNext) { Object.assign(ev, forceNext); if ('rain' in forceNext) weather.rain = !!forceNext.rain; forceNext = null; }
      return ev;
    }
    function startKick() {
      const sh = shooterOf(kickNo), ke = 1 - sh; const ev = rollEvents();
      K = { n: kickNo, shooter: sh, keeper: ke, ball: ev.ball, wind: ev.wind, rain: ev.rain, kmul: ev.kmul, hen: ev.hen, aimX: rand(-3.2, 3.2), aimY: rand(0.5, 2.3), avx: 0, avy: 0, charging: false, chargeT: 0, p: 0, curl: 0, aimT: AIM_T, t: 0, out: null, pts: 0, resolved: false, saveBy: '', hint: false, kept: false };
      ks = { x: 0, s: keeperSize(), dive: null, tip: 0, tipCd: 0, glove: 0, bx: 0, by: 0, buf: -1, hop: 0 };
      B = { live: false, x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, t: 0, T: 1, free: true, curl: 0, wind: 0, wA: 0, wW: 0, scored: false, attach: false, keeperChecked: false, frame: false, ground: 0, spin: 0 };
      if (trailingKeeper(ke)) gloveCd[ke] = Math.min(gloveCd[ke], GLOVE_CD * 0.5);
      for (const k in balls) balls[k].visible = k === K.ball; balls[K.ball].position.set(0, BR, 0); balls[K.ball].material.opacity = 1;
      A.setWind(K.wind); A.setRain(K.rain);
      state = 'prep'; stT = 0; hud.setTimer(null); lastTimer = -1; slow = 1;
      placeActors(true);
      // aankondigingen
      const m = [];
      if (K.ball === 'gold') m.push('🌟 GOUDEN BAL x2'); if (K.ball === 'spook') m.push('👻 Spook-bal!');
      if (K.wind) m.push(`💨 Wind ${K.wind > 0 ? '→' : '←'}`); if (K.rain) m.push('🌧 Regen');
      if (K.kmul > 1) m.push('🍄 REUS-keeper'); if (K.kmul < 1) m.push('🍄 DWERG-keeper');
      if (K.hen) m.push('🐔 Kip!');
      hud.showBig(SDALL() ? 'SUDDEN DEATH!' : `PENALTY ${Math.floor(kickNo / 2) + 1}`, 900, CSS[sh]);
      hud.toast(m.length ? m.slice(0, 2).join(' · ') : `${names[sh]} schiet, ${names[ke]} keept`, 2300);
      if (K.ball === 'gold') { audio.sfx('powerup', { vol: 0.6 }); stats.golds++; }
      if (K.ball === 'spook') audio.sfx('creak', { vol: 0.4, rate: 1.5 });
      if (K.kmul !== 1) { audio.sfx('boing', { vol: 0.7, rate: K.kmul > 1 ? 0.7 : 1.6 }); }
      if (K.hen) { audio.sfx('pop', { vol: 0.5, rate: 1.4 }); startHen(); } else hen_.on = false;
      refreshHud();
    }
    const trailingKeeper = (ke) => score[1 - ke] > score[ke];
    function placeActors(poof) {
      const sh = pl[K.shooter], ke = pl[K.keeper], ss = pv.size(K.shooter);
      sh.root.position.set(SH_X, 0, SH_Z); sh.root.scale.setScalar(ss * 0.85); sh.piv.rotation.z = 0; sh.c.group.position.y = 0; sh.c.faceDir(0, -1); sh.c.yaw = sh.c.targetYaw; sh.c.pose = 'idle'; sh.mood = 'play'; sh.kickAnim = 9;
      ke.root.position.set(0, 0.95 * ks.s, KZ); ke.root.scale.setScalar(ks.s); ke.piv.rotation.z = 0; ke.c.group.position.y = -0.95; ke.c.faceDir(0, 1); ke.c.yaw = ke.c.targetYaw; ke.c.pose = 'scared'; ke.mood = 'play';
      sh.tag.material.map = sh.tex[0]; ke.tag.material.map = ke.tex[1];
      if (poof) { fx.particles.burst(SH_X, 1, SH_Z, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, CSS[K.shooter] === '#7dffb0' ? 0x7dffb0 : 0x8fb8ff], gravity: 3 }); fx.particles.burst(0, 1.3, KZ + 0.3, { count: K.kmul !== 1 ? 34 : 14, speed: 3.5, up: 1, life: 0.6, size: 0.45, colors: K.kmul > 1 ? [0xff7a2a, 0xffffff] : K.kmul < 1 ? [0x6aff8a, 0xffffff] : [0xffffff, 0xcfe0ff], gravity: 3 }); }
    }

    // ---------------- kip ----------------
    function startHen() {
      const h = hen_; h.on = true; h.dir = Math.random() < 0.5 ? -1 : 1; h.x = h.dir * 12; h.z = -5.2 - Math.random() * 1.2; h.tx = rand(-2.2, 2.2); h.st = 'in'; h.t = 0; h.hit = false; hen.group.visible = henSh.visible = true; hen.group.position.set(h.x, 0, h.z); hen.targetYaw = h.dir < 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    function updateHen(dt) {
      const h = hen_; if (!h.on) return; h.t += dt;
      if (h.st === 'in') { const dx = h.tx - h.x, sp = 6.5; h.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt); hen.speed = 1; if (Math.abs(dx) < 0.05) { h.st = 'sit'; h.t = 0; hen.speed = 0; hen.targetYaw = 0; audio.sfx('pop', { vol: 0.3, rate: 1.8 }); ftx('TOK TOK!', h.x, 3.3, h.z, '#ffe9a0', 1.2); } }
      else if (h.st === 'sit') { if (state === 'flight' || state === 'result') { if (!h.hit && (K.resolved || B.z < h.z - 0.6 || K.t > 1.4)) { h.st = 'out'; h.t = 0; hen.targetYaw = h.x < 0 ? -Math.PI / 2 : Math.PI / 2; } } }
      else if (h.st === 'out') { hen.speed = 1; h.x += Math.sign(h.x || 1) * 7.5 * dt; if (Math.abs(h.x) > 14) { h.on = false; hen.group.visible = henSh.visible = false; } }
      else if (h.st === 'fly') { h.vy -= 14 * dt; h.y += h.vy * dt; h.x += h.vx * dt; hen.group.rotation.z += dt * 12; if (h.y < -1) { h.on = false; hen.group.visible = henSh.visible = false; hen.group.rotation.z = 0; } }
      hen.update(dt); hen.group.position.x = h.x; hen.group.position.z = h.z; if (h.st !== 'fly') { hen.group.position.y = hen.group.position.y; } else hen.group.position.y = h.y;
      henSh.position.set(h.x, 0.04, h.z); henSh.visible = h.on && h.st !== 'fly';
    }

    // ---------------- schieten ----------------
    function shoot(p) {
      const sh = K.shooter, sp = pv.speed(sh); p = clamp(p, 0, 1); K.p = p; K.shotP = p; K.charging = false;
      const e = errOf(p), a = Math.random() * TAU, rr = e * (0.35 + 0.65 * Math.random());
      const tx = K.aimX + Math.cos(a) * rr, ty = Math.max(0.05, K.aimY + Math.sin(a) * rr * 0.7);
      let Tt = flightT(p) * (K.rain ? 0.93 : 1) * (K.curl ? 1.1 : 1) * (K.ball === 'gold' ? 0.95 : 1) / (1 + (sp - 1) * 0.4);
      const bow = K.curl ? (K.curl === 1 ? 1 : -1) * 1.45 * (1 - 0.25 * p) : 0;   // curl links: eerst rechts uit, dan terug naar links
      const b = B; b.live = true; b.x = 0; b.y = BR; b.z = 0; b.T = Tt; b.t = 0; b.curl = bow; b.accCurl = -8 * bow / (Tt * Tt); b.wind = K.wind;
      b.wW = K.ball === 'spook' ? 3 * Math.PI / Tt : 0; b.wA = K.ball === 'spook' ? (Math.random() < 0.5 ? -1 : 1) * 0.42 : 0;
      b.vz = (GZ - 0) / Tt; b.vx = tx / Tt + 4 * bow / Tt + b.wA * b.wW; b.vy = (ty - BR + 0.5 * G * Tt * Tt) / Tt;
      b.free = true; b.tx = tx; b.ty = ty; b.keeperChecked = false;
      state = 'flight'; K.t = 0; K.shotT = Tt; hud.setTimer(null); hud.setHint(null); ret.visible = false; dots.visible = false;
      pl[sh].kickAnim = 0; stats.kicks++;
      const good = p > 0.55 && p <= 0.86;
      audio.sfx('hit', { vol: 0.5 + p * 0.5, rate: 0.9 + p * 0.3 }); audio.sfx('whoosh', { vol: 0.4, rate: 0.9 + p * 0.5 }); ctx.shake(0.15 + p * 0.3);
      fx.particles.burst(0, 0.3, 0.2, { count: 14 + Math.round(p * 18), speed: 3 + p * 5, up: 0.7, life: 0.5, size: 0.35, colors: [0xffffff, 0xaaff88, 0xffe14a], gravity: 5 });
      if (p > 0.86) ftx('BOEM!', 0.4, 2.2, 0, '#ff6a4a', 1.4); else if (good) ftx('KNAL!', 0.4, 2.2, 0, '#7dffb0', 1.3); else if (p < 0.3) ftx('slapjes...', 0.4, 1.8, 0, '#cfe0ff', 1.0);
      if (K.curl) ftx(K.curl === 1 ? '↶ effect!' : 'effect! ↷', 0.4, 3.0, 0, '#ffd23f', 1.0);
      dragonBreath(0.4);
    }
    function dragonBreath(k = 1) {
      const v = new THREE.Vector3(); A.dragonHead.getWorldPosition(v);
      for (let i = 0; i < 16 * k; i++) fx.particles.emit(v.x - 0.4, v.y + 0.1, v.z, -rand(2, 5), rand(0.5, 2.5), rand(-1, 1), { life: rand(0.35, 0.7), size: rand(0.5, 0.9), color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: -1 });
    }
    function whistle() { audio.tone(2300, 0.16, { type: 'sine', vol: 0.12 }); audio.tone(2750, 0.3, { type: 'sine', vol: 0.12, delay: 0.17, slide: 2400 }); dragonBreath(0.6); }

    // ---------------- bal-natuurkunde ----------------
    const nrm = new THREE.Vector3();
    function frameHit(px, py, pz) {
      const b = B; let dx = b.x - px, dy = b.y - py, dz = b.z - pz; const d2 = dx * dx + dy * dy + dz * dz, rr = BR + PR; if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2) || 1e-4; dx /= d; dy /= d; dz /= d; b.x = px + dx * rr; b.y = py + dy * rr; b.z = pz + dz * rr;
      const vn = b.vx * dx + b.vy * dy + b.vz * dz;
      if (vn < 0) {
        b.vx -= 1.6 * vn * dx; b.vy -= 1.6 * vn * dy; b.vz -= 1.6 * vn * dz; b.free = false;
        if (!b.frame) { b.frame = true; K.hitFrame = (py >= GH - 0.01 && Math.abs(px - b.x) < GX) ? 'lat' : 'paal'; stats.posts++; slowHold = 0.55; slow = 0.3; ctx.shake(0.55); audio.sfx('hit', { vol: 0.9, rate: 0.6 }); audio.sfx('bell', { vol: 0.5, rate: 1.6 }); ftx(K.hitFrame === 'lat' ? 'LAT!' : 'PAAL!', b.x, b.y + 1.2, GZ + 1, '#ffffff', 1.9); fx.particles.burst(b.x, b.y, GZ, { count: 26, speed: 5, up: 0.6, life: 0.6, size: 0.35, colors: [0xffffff, 0xffe14a, 0xff6a4a], gravity: 5 }); A.boo(0.8); }
      }
      return true;
    }
    function stepBall(h) {
      const b = B; if (!b.live || b.attach) return;
      const pz = b.z; let ax = 0;
      if (b.free) { ax = b.accCurl + b.wind; if (b.wA) ax += -b.wA * b.wW * b.wW * Math.sin(b.wW * b.t); }
      b.vx += ax * h; b.vy -= G * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.t += h;
      if (b.y < BR) { b.y = BR; if (b.vy < 0) { const imp = -b.vy; b.vy = imp > 1.4 ? imp * 0.5 : 0; b.vx *= 0.93; b.vz *= 0.93; if (imp > 3) { audio.sfx('thud', { vol: clamp(imp / 14, 0.1, 0.4), rate: 1.4 }); fx.particles.dust(b.x, 0.1, b.z, 3, 0xbfe8b0); } } const f = Math.exp(-0.9 * h); b.vx *= f; b.vz *= f; }
      if (K.hitFrame !== 'x') { frameHit(-GX, clamp(b.y, 0, GH + PR), GZ); frameHit(GX, clamp(b.y, 0, GH + PR), GZ); frameHit(clamp(b.x, -GX, GX), GH, GZ); }
      // net (na de lijn): doos met zachte wanden
      if (b.scored || (b.z < GZ - 0.2 && Math.abs(b.x) < GX && b.y < GH && K.out === 'goal')) {
        const wx = GX + 0.25 - BR, top = GH + 0.12 - BR, back = GZ - GD + BR;
        if (b.x > wx) { b.x = wx; b.vx *= -0.2; } if (b.x < -wx) { b.x = -wx; b.vx *= -0.2; } if (b.y > top) { b.y = top; b.vy *= -0.2; } if (b.z < back) { b.z = back; b.vz *= -0.12; b.vx *= 0.5; b.vy *= 0.5; }
        const f = Math.exp(-1.5 * h); b.vx *= f; b.vz *= f;
      }
      // kip
      if (hen_.on && hen_.st === 'sit' && !hen_.hit && !K.resolved && pz > hen_.z && b.z <= hen_.z) { const dxh = b.x - hen_.x; if (Math.abs(dxh) < 0.85 && b.y < 1.7) henHit(dxh); }
      // keeper (alleen schoten die op doel gaan)
      if (!b.keeperChecked && pz > KZ && b.z <= KZ && b.vz < 0) { b.keeperChecked = true; if (!K.resolved && Math.abs(b.x) < GX + 0.4 && b.y < GH + 0.4) keeperTry(); }
      // doellijn
      if (pz > GZ && b.z <= GZ && !K.resolved && !b.scored) {
        if (Math.abs(b.x) < GX && b.y < GH && b.y > 0) goalScored();
        else { K.out = K.hitFrame ? (K.hitFrame) : (b.y >= GH && Math.abs(b.x) < GX + 0.6 ? 'over' : 'wide'); resolve(K.out); }
      }
      if (!K.resolved && b.z < GZ - 12) resolve(K.hitFrame || 'wide');
      if (!K.resolved && K.hitFrame && b.vz > 0 && b.z > GZ + 1.2) resolve(K.hitFrame);
    }
    function keeperTry() {
      const b = B, p = keeperPose(), rb = BR, dx = b.x - p.cx, dy = b.y - p.cy;
      const u = dx * p.ax + dy * p.ay, v = dx * p.ay - dy * p.ax, dn = Math.hypot(u / (p.L + rb), v / (p.W + rb));
      let hit = dn <= 1, viaGlove = false;
      if (ks.glove > 0) { const gs = 1.1 * p.s * (0.5 + 0.5 * clamp((GLOVE_T - ks.glove) / 0.12 + 0.3, 0, 1)); const gx = p.cx + p.ax * p.L * 0.85, gy = p.cy + p.ay * p.L * 0.85; if (Math.hypot(b.x - gx, b.y - gy) < gs + rb) { hit = true; viaGlove = true; } }
      if (!hit) return;
      const tip = ks.tip > 0, rainy = K.rain, catchIt = viaGlove || (!tip && dn < (rainy ? 0.4 : 0.58));
      K.out = catchIt ? 'catch' : 'parry'; K.saveBy = viaGlove ? 'glove' : tip ? 'tip' : 'body';
      stats.saves[K.keeper]++; if (tip) stats.tips++; if (viaGlove) stats.gloves++;
      if (catchIt) { b.attach = true; b.vx = b.vy = b.vz = 0; K.kept = true; }
      else { const sd = Math.sign(b.x - p.cx) || (Math.random() < 0.5 ? -1 : 1); b.vx = sd * rand(2, 6); b.vy = rand(3, 7); b.vz = rand(4, 8); b.free = false; }
      b.live = true; resolve(K.out);
    }
    function henHit(dxh) {
      const b = B, h = hen_; h.hit = true; h.st = 'fly'; h.vx = Math.sign(dxh || 1) * rand(4, 8); h.vy = rand(6, 9); h.y = 0.2; stats.chickens++;
      b.vz = rand(3, 6); b.vx = rand(-4, 4); b.vy = rand(2, 5); b.free = false; K.out = 'chicken';
      fx.particles.burst(h.x, 0.9, h.z, { count: 40, speed: 6, up: 1, life: 1.0, size: 0.5, colors: [0xffffff, 0xf6f1e4, 0xffd23f], gravity: 5 }); audio.sfx('pop', { vol: 0.8, rate: 0.8 }); audio.sfx('boing', { vol: 0.7, rate: 1.4 });
      ftx('KIP-REDDING!', h.x, 3.6, h.z, '#ffe9a0', 1.7); ctx.shake(0.5); slowHold = 0.5; slow = 0.3; resolve('chicken');
    }
    function goalScored() {
      const b = B; b.scored = true; K.out = 'goal'; K.pts = K.ball === 'gold' ? 2 : 1; resolve('goal');
    }

    function resolve(out) {
      if (K.resolved) return; K.resolved = true; K.out = out; K.resT = 0;
      const sh = K.shooter, ke = K.keeper, shp = pl[sh], kep = pl[ke], b = B;
      state = 'result'; stT = 0; hud.setTimer(null);
      if (out === 'goal') {
        score[sh] += K.pts; stats.goals[sh]++; logs[sh][taken[sh]] = K.pts;
        slow = 0.25; slowHold = 0.9; punch = 1; A.goalFlash(); A.cheer(3.2); ctx.shake(0.9);
        const gold = K.pts > 1; hud.showBig(gold ? 'GOUDEN GOAL! +2' : 'GOAAAL!', 1400, gold ? '#ffd23f' : CSS[sh]);
        ftx(gold ? '+2 !!' : 'GOAL!', b.x, 3.6, GZ + 1, gold ? '#ffd23f' : CSS[sh], 2.4);
        audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.5 }); audio.noise(1.4, { type: 'bandpass', freq: 800, freq2: 2200, q: 0.8, vol: 0.28, attack: 0.25 });
        fx.particles.burst(b.x, 1.6, GZ, { count: 70, speed: 9, up: 1.1, life: 1.4, size: 0.55, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
        for (let i = 0; i < (gold ? 6 : 3); i++) later(() => A.firework((Math.random() - 0.5) * 40, 10 + Math.random() * 12, GZ - 12 - Math.random() * 10), i * 260);
        shp.mood = 'cheer'; kep.mood = 'sad'; dragonBreath(2.5); audio.sfx('explode', { vol: 0.25 });
      } else {
        logs[sh][taken[sh]] = 0; stats.misses++;
        const txt = { catch: 'GEVANGEN!', parry: 'GEWEERD!', paal: 'PAAL!', lat: 'LAT!', over: 'OVER!', wide: 'NAAST!', chicken: 'KIP-REDDING!' }[out];
        if (out === 'catch' || out === 'parry') {
          const tag = K.saveBy === 'glove' ? 'REUZENHANDSCHOEN!' : K.saveBy === 'tip' ? 'VINGERTOPPEN!' : txt;
          ftx(tag, b.x, b.y + 1.4, GZ + 1.2, CSS[ke], 1.9); hud.showBig(out === 'catch' ? 'GEVANGEN!' : 'GEWEERD!', 1100, CSS[ke]);
          slow = 0.35; slowHold = 0.45; ctx.shake(0.5); audio.sfx('thud', { vol: 0.8 }); audio.sfx('good', { vol: 0.35 }); A.cheer(1.6);
          fx.particles.burst(b.x, b.y, KZ, { count: 28, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xffffff, 0xff7a1a, CSS[ke] === '#7dffb0' ? 0x7dffb0 : 0x8fb8ff], gravity: 5 });
          kep.mood = 'cheer'; shp.mood = 'sad'; A.boo(0.1);
        } else {
          if (out !== 'chicken') hud.showBig(txt, 1000, '#ff9a8a');
          audio.sfx('miss', { vol: 0.5 }); audio.tone(300, 0.7, { type: 'sawtooth', vol: 0.08, slide: 110 }); A.boo(1.6); shp.mood = 'sad'; kep.mood = out === 'chicken' ? 'cheer' : 'play';
          if (out !== 'chicken') ftx(txt, b.x, Math.min(b.y + 1, 4), GZ + 1, '#ff9a8a', 1.5);
          else { ftx('rood voor de kip!', 0, 4.4, -4, '#ff6a5a', 1.1); }
        }
        dragonBreath(0.8);
      }
      taken[sh]++;
      if (K.pts > 0) ftx(`${score[0]} – ${score[1]}`, 0, 5.2, GZ + 0.5, '#ffffff', 1.0);
      refreshHud();
    }

    // ---------------- einde ----------------
    function decide() {
      const ahead = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : -1;
      const rem = [Math.max(0, REG - taken[0]), Math.max(0, REG - taken[1])];
      if (taken[0] < REG || taken[1] < REG) {
        if (score[0] - score[1] > 2 * rem[1]) return 0; if (score[1] - score[0] > 2 * rem[0]) return 1; return -1;
      }
      if (taken[0] === taken[1]) { if (ahead >= 0) return ahead; sdPairs++; if (sdPairs > SD_MAX) { stats.coin = true; return Math.random() < 0.5 ? 0 : 1; } }
      return -1;
    }
    function endMatch(w) {
      state = 'end'; stT = 0; winner = w; slow = 1; hud.setTimer(null); ret.visible = dots.visible = false;
      pl[w].mood = 'cheer'; pl[1 - w].mood = 'sad'; A.cheer(6);
      for (let i = 0; i < 5; i++) later(() => A.firework((Math.random() - 0.5) * 40, 10 + Math.random() * 12, GZ - 12 - Math.random() * 10), i * 300);
    }
    function finishMatch(w) {
      if (finished) return; finished = true; const l = 1 - w;
      const jokes = [`${names[w]} schiet raak en ${names[l]} duikt in het gras.`, `De draak geeft ${names[w]} een gouden fluitje. ${names[l]} krijgt een kip.`, `${names[w]} is de Penalty-Koning! ${names[l]} zoekt de bal nog.`, `Het monster-publiek gilt voor ${names[w]}. ${names[l]} hoort alleen boe.`];
      const ex = [stats.golds ? `${stats.golds}x gouden bal` : '', stats.posts ? `${stats.posts}x paal of lat` : '', stats.chickens ? 'een kip redde een bal' : '', stats.coin ? 'de draak gooide een munt' : '', (stats.tips + stats.gloves) ? `${stats.tips + stats.gloves} bijzondere reddingen` : ''].filter(Boolean).join(' · ');
      ctx.finishPvp({ winner: w, score: [score[0], score[1]], delay: 800, summary: `${pick(jokes)}${ex ? ` (${ex}.)` : ''}` });
    }

    // ---------------- update ----------------
    function aimStep(dt) {
      const sh = K.shooter, inp = pv.input(sh), sp = pv.speed(sh), k = K.charging ? 0.55 : 1, lam = lerp(16, 2.2, SLIP);
      K.avx = damp(K.avx, inp.x * AIM_VX * sp * k, lam, dt); K.avy = damp(K.avy, -inp.y * AIM_VY * sp * k, lam, dt);
      K.aimX = clamp(K.aimX + K.avx * dt, -5.7, 5.7); K.aimY = clamp(K.aimY + K.avy * dt, 0.15, 3.7);
      if (inp.bP) { K.curl = (K.curl + 1) % 3; audio.sfx('click', { vol: 0.3, rate: 1 + K.curl * 0.3 }); }
      if (inp.aP && !K.charging) { K.charging = true; K.chargeT = 0; audio.sfx('select', { vol: 0.3 }); }
      if (K.charging) {
        K.chargeT += dt * sp; const ph = (K.chargeT * FREQ) % 2; K.p = ph < 1 ? ph : 2 - ph;
        if (Math.random() < dt * 14) fx.particles.emit(SH_X + rand(-0.4, 0.4), 0.1, SH_Z + rand(-0.3, 0.3), 0, 1.2, 0, { life: 0.4, size: 0.25, color: K.p > 0.86 ? 0xff6a4a : K.p > 0.55 ? 0x7dff9a : 0xffe14a, gravity: -1 });
        if (!inp.a) shoot(K.p);
      }
      K.aimT -= dt;
      if (!K.hint && K.aimT < AIM_T - 3 && !K.charging) { K.hint = true; hud.toast(`${names[sh]}: houd A ingedrukt om te laden!`, 1500); }
      if (K.aimT <= 0 && state === 'aim') shoot(K.charging ? K.p : 0.3);
      const n = Math.ceil(K.aimT); if (n !== lastTimer && K.aimT > -1) { lastTimer = n; hud.setTimer(Math.max(0, K.aimT), 2); }
    }
    function keeperStep(dt) {
      const ke = K.keeper, inp = pv.input(ke), sp = pv.speed(ke), s = ks.s;
      ks.tip = Math.max(0, ks.tip - dt); ks.tipCd = Math.max(0, ks.tipCd - dt); ks.glove = Math.max(0, ks.glove - dt);
      if (state === 'aim' && !ks.dive) {
        const lam = lerp(14, 2.0, SLIP); ks.vx = damp(ks.vx || 0, inp.x * 4.6 * sp, lam, dt); ks.x = clamp(ks.x + ks.vx * dt, -1.75, 1.75);
        ks.hop = inp.y < -0.5 ? Math.min(1, ks.hop + dt * 6) : Math.max(0, ks.hop - dt * 6);
      }
      if (state === 'flight') {
        if (!ks.dive) {
          const want = Math.hypot(inp.x, inp.y) > 0.45;
          if (K.t >= 0.1 && want && ks.buf < 0) { ks.buf = 0; ks.bx = 0; ks.by = 0; }
          if (ks.buf >= 0) { ks.buf += dt; if (Math.abs(inp.x) > Math.abs(ks.bx)) ks.bx = inp.x; if (Math.abs(inp.y) > Math.abs(ks.by)) ks.by = inp.y; if (ks.buf > 0.07) startDive(); }
        } else { ks.dive.t += dt; }
        if (inp.aP) { if (ks.tipCd <= 0) { ks.tip = TIP_T / sp; ks.tipCd = 0.8; audio.sfx('swing', { vol: 0.4, rate: 1.5 }); fx.particles.ring(ks.x + (ks.dive ? ks.dive.dx : 0), 1, KZ + 0.3, { count: 10, speed: 3, color: 0xffffff, size: 0.2, life: 0.3 }); } }
        if (inp.bP) { if (gloveCd[ke] <= 0) { ks.glove = GLOVE_T; gloveCd[ke] = trailingKeeper(ke) ? GLOVE_CD * 0.5 : GLOVE_CD; audio.sfx('powerup', { vol: 0.6, rate: 0.7 }); ftx('REUZENHANDSCHOEN!', ks.x, 3.6, KZ, '#ff9a3a', 1.3); ctx.shake(0.2); refreshHud(); } else audio.sfx('click', { vol: 0.15, rate: 0.6 }); }
      } else if (state !== 'result' && ks.dive) ks.dive.t += dt;
      for (let i = 0; i < 2; i++) gloveCd[i] = Math.max(0, gloveCd[i] - dt);
    }
    function simBall(sdt) {
      if (!B.live) return;
      const sp = Math.hypot(B.vx, B.vy, B.vz), n = clamp(Math.ceil(sp * sdt / 0.1), 1, 14), h = sdt / n;
      for (let s = 0; s < n; s++) stepBall(h);
    }
    let lastSecond = -1;
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; startKick(); hud.toast('5 penalty\'s per kant! Wie de meeste goals maakt wint.', 2000); }
      if (T > 330 && !finished && state !== 'end') endMatch(score[0] === score[1] ? (Math.random() < 0.5 ? 0 : 1) : score[0] > score[1] ? 0 : 1);
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3.5, dt);
      const sdt = dt * slow; stT += dt;
      if (state === 'prep') {
        if (stT >= PREP_T) { state = 'aim'; stT = 0; whistle(); ftx('FLUIT!', 0, 3.4, GZ + 2, '#ffe14a', 1.5); ret.visible = dots.visible = true; refreshHud(); if (kickNo < 4) hud.setHint(`<b>${names[K.shooter]}</b>: houd A, los = schot · <b>${names[K.keeper]}</b>: duik NA het schot`); }
      } else if (state === 'aim') {
        aimStep(dt); keeperStep(dt);
      } else if (state === 'flight') {
        K.t += dt; keeperStep(dt);
        // slow-motion vlak voor de inslag
        if (B.live && !K.resolved && B.vz < 0 && B.z < GZ + 3.2 && B.z > GZ && Math.abs(B.x) < GX + 1.2 && B.y < GH + 1) slow = Math.min(slow, 0.38);
        simBall(sdt);
        if (K.t > 4.5 && !K.resolved) resolve(K.hitFrame || 'wide');
      } else if (state === 'result') {
        if (!ks.dive || ks.dive.t < ks.dive.dur) { if (ks.dive) ks.dive.t += dt; }
        ks.tip = Math.max(0, ks.tip - dt); ks.glove = Math.max(0, ks.glove - dt); for (let i = 0; i < 2; i++) gloveCd[i] = Math.max(0, gloveCd[i] - dt);
        simBall(sdt);
        if (stT >= RES_T) {
          kickNo++; const w = decide();
          if (w >= 0) endMatch(w); else startKick();
        }
      } else if (state === 'end') {
        if (stT > 2.6 && !finished) finishMatch(winner);
      }
      if (K && (state === 'result' || state === 'flight' || state === 'aim')) updateHen(dt); else if (hen_.on) updateHen(dt);
      visuals(dt);
    }

    // ---------------- visuals ----------------
    function layoutOverlay(on) {
      const asp = camera.aspect || 1.7, hh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), ww = hh * asp, mw = ww * 0.3, mhh = hh * 0.05, my = -hh * 0.41, cx = ww * 0.29, z = -1;
      const vis = on && K && (state === 'aim');
      for (const m of [mFrame, mFill, mMark, mGlow, mLabel, mCurl, ...zones.map((q) => q.m)]) m.visible = !!vis;
      if (!vis) return;
      mFrame.scale.set(mw + hh * 0.012, mhh + hh * 0.012, 1); mFrame.position.set(cx, my, z); mFill.scale.set(mw, mhh, 1); mFill.position.set(cx, my, z + 0.0001);
      zones.forEach((q) => { q.m.scale.set(mw * (q.b - q.a), mhh * 0.7, 1); q.m.position.set(cx + (((q.a + q.b) / 2) - 0.5) * mw, my, z); q.m.material.opacity = K.charging ? 0.95 : 0.55; });
      const mx = cx + (K.p - 0.5) * mw; mMark.scale.set(hh * 0.012, mhh * 1.35, 1); mMark.position.set(mx, my, z); mGlow.scale.set(hh * 0.045, mhh * 1.9, 1); mGlow.position.set(mx, my, z); mGlow.material.opacity = K.charging ? 0.4 : 0;
      mMark.material.color.set(K.charging ? 0xffffff : 0x8890b0);
      mLabel.scale.set(hh * 0.2, hh * 0.06, 1); mLabel.position.set(cx - mw / 2 + hh * 0.1, my + hh * 0.07, z);
      mCurl.material.map = curlTx[K.curl]; mCurl.scale.set(hh * 0.25, hh * 0.094, 1); mCurl.position.set(cx + mw / 2 - hh * 0.13, my + hh * 0.07, z);
    }
    const camLook = new THREE.Vector3(), tmpV = new THREE.Vector3(); let camBall = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * asp;
      const dist = clamp(11 / tanH, 16, 28); let zc = GZ + dist, yc = 3.3, lx = 0, ly = 1.1, lz = GZ;
      if (K && state === 'flight' && B.live) { camBall = damp(camBall, B.x * 0.28, 4, dt); zc -= clamp((0 - B.z) / 11, 0, 1) * 1.5; } else camBall = damp(camBall, 0, 3, dt);
      if (state === 'result' && K && K.out === 'goal') { punch = Math.max(0, punch - dt * 0.6); zc -= 2.2 * Math.min(1, stT / 0.6); yc -= 0.5; lx = B.x * 0.35; }
      else if (state === 'result') { zc -= 0.6; lx = B.x * 0.2; }
      camX = damp(camX, camBall + lx, 3, dt); camZ = damp(camZ, zc, 3, dt); camY = damp(camY, yc, 3, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.25;
      camera.position.set(camX * 0.6 + sway, camY, camZ); camLook.set(camX * 0.5 + lx * 0.3, ly, lz); camera.lookAt(camLook);
    }
    function visuals(dt) {
      const tt = T + introT; const sh = K ? pl[K.shooter] : null, ke = K ? pl[K.keeper] : null;
      if (K) {
        // bal
        const bm = balls[K.ball], b = B;
        if (!b.live && !b.attach) { bm.position.set(0, BR + Math.abs(Math.sin(tt * 3)) * (state === 'aim' && K.charging ? 0.04 : 0.0), 0); }
        else if (b.attach) { const p = keeperPose(); bm.position.set(p.cx + p.ax * 0.3, p.cy + p.ay * 0.1 - 0.1, KZ + 0.5); b.x = bm.position.x; b.y = bm.position.y; b.z = bm.position.z; }
        else bm.position.set(b.x, b.y, b.z);
        if (b.live && !b.attach) { const sp = Math.hypot(b.vx, b.vz); rv.set(b.vz, 0, -b.vx); if (rv.lengthSq() > 0.01) { rv.normalize(); rq.setFromAxisAngle(rv, sp * dt / BR * 0.6); bm.quaternion.premultiply(rq); } bm.rotateY((b.curl ? Math.sign(b.curl) * 12 : 2) * dt); }
        if (K.ball === 'spook') { const v = Math.sin(tt * 38) > -0.25 || !b.live; bm.material.opacity = b.live ? (v ? 0.95 : 0.12) : 0.8; if (b.live && Math.random() < dt * 40) fx.particles.emit(b.x, b.y, b.z, rand(-0.5, 0.5), rand(0, 1), 0, { life: 0.5, size: 0.5, color: 0x6affdc, gravity: 0 }); }
        if (K.ball === 'gold') { bm.material.emissiveIntensity = 0.5 + Math.sin(tt * 9) * 0.25; if (Math.random() < dt * (b.live ? 50 : 8)) fx.particles.emit(b.x + rand(-0.3, 0.3), (b.live ? b.y : BR) + rand(0, 0.5), b.z + rand(-0.3, 0.3), 0, 0.8, 0, { life: 0.6, size: 0.28, color: 0xffe14a, gravity: -0.5 }); }
        else if (b.live && !b.attach && Math.hypot(b.vx, b.vy, b.vz) > 8 && Math.random() < dt * 40) fx.particles.emit(b.x, b.y, b.z, 0, 0, 0, { life: 0.35, size: 0.3, color: 0xffffff, gravity: 0 });
        ballShadow.position.set(bm.position.x, 0.04, bm.position.z); ballShadow.scale.setScalar(BR * 2.4 * clamp(1 - (bm.position.y - BR) / 6, 0.3, 1)); ballShadow.visible = !b.attach;
        // richtpunt + stippellijn
        if (state === 'aim') {
          const e = errOf(K.charging ? K.p : 0.7), col = e > 0.6 ? 0xff6a4a : e > 0.25 ? 0xffe14a : 0x7dff9a;
          ret.position.set(K.aimX, K.aimY, GZ + 0.15); const pulse = 1 + Math.sin(tt * 7) * 0.05; retRing.scale.setScalar((0.34 + e * 1.0) * pulse); for (const m of [retRing, retDot, ...ticks]) m.material.color.set(K.charging ? col : CSS[K.shooter] === '#7dffb0' ? 0x7dffb0 : 0x8fb8ff);
          ret.rotation.z += dt * (K.charging ? 2.2 : 0.6); const nom = K.charging ? flightT(K.p) : 0.7, bow = K.curl ? (K.curl === 1 ? 1 : -1) * 1.45 * 0.85 : 0;
          const vy0 = (K.aimY - BR + 0.5 * G * nom * nom) / nom;
          for (let q = 0; q < 14; q++) { const s = (q + 1) / 15, t = s * nom, x = K.aimX * s + bow * 4 * s * (1 - s), y = BR + vy0 * t - 0.5 * G * t * t, z = -11 * s; dm.makeTranslation(x, Math.max(y, BR), z); dots.setMatrixAt(q, dm); }
          dots.instanceMatrix.needsUpdate = true; dots.material.opacity = 0.55 + Math.sin(tt * 8) * 0.2;
        }
        // schutter
        const kz = sh.kickAnim; sh.kickAnim += dt;
        let spx = SH_X, spz = SH_Z; if (state === 'flight' || state === 'result') { const u = sm(0, 0.32, kz); spx = lerp(SH_X, -0.55, u); spz = lerp(SH_Z, 0.15, u); }
        sh.root.position.set(spx, 0, spz); const ssz = pv.size(K.shooter) * 0.85; sh.root.scale.setScalar(ssz);
        if (state === 'aim' || state === 'prep') { sh.c.pose = K.charging ? 'push' : 'idle'; sh.c.speed = 0; sh.c.faceDir(K.aimX * 0.2, -1); }
        else if (sh.mood === 'cheer') sh.c.pose = 'cheer'; else if (sh.mood === 'sad') sh.c.pose = 'sad'; else sh.c.pose = 'idle';
        sh.c.speed = (state === 'flight' && kz < 0.35) ? 1 : 0;
        sh.c.update(dt);
        if (kz < 0.6) { const a = kz < 0.12 ? lerp(0.9, 0.9, 0) : 0.9; sh.c.legR.rotation.x = kz < 0.1 ? lerp(0.6, 0.9, kz / 0.1) : kz < 0.24 ? lerp(0.9, -1.35, sm(0.1, 0.24, kz)) : lerp(-1.35, 0, sm(0.24, 0.6, kz)); sh.c.armL.rotation.x = 0.8; }
        sh.shadow.position.set(spx, 0.04, spz); sh.shadow.scale.setScalar(ssz * 1.1);
        sh.tag.position.set(spx, 2.3 * ssz + 0.2, spz); sh.tag.scale.set(1.7, 0.51, 1); sh.tag.visible = state !== 'end';
        // keeper
        const p = keeperPose(); ke.root.position.set(p.cx, p.cy, KZ); ke.root.scale.setScalar(p.s * (ks.tip > 0 ? 1.04 : 1)); ke.piv.rotation.z = -p.phi; ke.root.position.y += ks.hop * 0.25 * p.s;
        ke.c.group.position.y = -0.95;
        if (state === 'result' && ke.mood === 'cheer') ke.c.pose = 'cheer'; else if (state === 'result' && ke.mood === 'sad') ke.c.pose = 'sad'; else if (state === 'end') ke.c.pose = ke.mood === 'cheer' ? 'cheer' : 'sad'; else if (ks.dive || ks.tip > 0) ke.c.pose = 'hands_up'; else ke.c.pose = 'scared';
        ke.c.speed = 0; ke.c.update(dt);
        ke.shadow.position.set(p.cx * 0.97, 0.04, KZ); ke.shadow.scale.setScalar(p.s * (ks.dive && ks.dive.phi ? 1.9 : 1.1)); ke.shadow.material.opacity = 0.8;
        ke.tag.position.set(p.cx, Math.max(p.cy + 1.4 * p.s, 3.2) + (ks.dive ? 0 : 0.3), KZ + 0.3); ke.tag.visible = state !== 'end';
        // reuzenhandschoen
        if (ks.glove > 0) { bigGlove.visible = true; const gs = 1.1 * p.s * (0.45 + 0.55 * clamp((GLOVE_T - ks.glove) / 0.12 + 0.3, 0, 1)); bigGlove.scale.setScalar(gs * 1.35); bigGlove.position.set(p.cx + p.ax * p.L * 0.85, p.cy + p.ay * p.L * 0.85, KZ + 0.9); bigGlove.rotation.z = -p.phi + Math.sin(tt * 18) * 0.08; if (Math.random() < dt * 30) fx.particles.emit(bigGlove.position.x + rand(-1, 1), bigGlove.position.y + rand(-1, 1), KZ + 1, 0, 1, 0, { life: 0.4, size: 0.35, color: 0xffa040, gravity: -1 }); } else bigGlove.visible = false;
      }
      // weer
      rainTint.copy(pitchBase); if (weather.rain) rainTint.multiplyScalar(0.72); A.pitch.material.color.lerp(rainTint, 1 - Math.exp(-2 * dt));
      A.update(tt, dt, { x: camera.position.x });
      layoutOverlay(true); updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const q of pl) q.c.update(dt); const s0 = pl[winner >= 0 ? winner : 0]; s0.c.pose = 'cheer'; A.update(T + introT, dt, { x: camera.position.x }); layoutOverlay(false); updateCamera(dt); if (Math.random() < dt * 3) A.firework((Math.random() - 0.5) * 40, 10 + Math.random() * 12, GZ - 12 - Math.random() * 10); }
    function introUpdate(dt) {
      introT += dt; if (!K) { K = { shooter: first, keeper: 1 - first, ball: 'normal', p: 0, curl: 0, aimX: 0, aimY: 1.3, kmul: 1, wind: 0, rain: false, charging: false, resolved: false, out: null, hint: true }; ks = { x: 0, s: keeperSize(), dive: null, tip: 0, tipCd: 0, glove: 0, bx: 0, by: 0, buf: -1, hop: 0 }; B = { live: false, x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, curl: 0 }; for (const k in balls) balls[k].visible = k === 'normal'; placeActors(false); }
      visuals(dt);
    }
    refreshHud(); introUpdate(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } if (!started) { K = null; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const q of pl) fx.particles.burst(q.root.position.x, 1.2, q.root.position.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { if (score[i] > 0) { score[i]--; refreshHud(); } ftx('BEWOGEN!', pl[i].root.position.x, 3.6, pl[i].root.position.z, '#9fe8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { pl[w].mood = 'cheer'; pl[1 - w].mood = 'sad'; A.cheer(6); },
      dispose() { timers.forEach(clearTimeout); hud.setHint(null); },
      dbg: {
        state: () => ({ T, state, finished, score: [...score], logs: logs.map((l) => [...l]), taken: [...taken], kickNo, winner, slow, sdPairs, stats, gloveCd: [...gloveCd],
          K: K && { shooter: K.shooter, keeper: K.keeper, aimX: K.aimX, aimY: K.aimY, charging: K.charging, p: K.p, curl: K.curl, aimT: K.aimT, ball: K.ball, wind: K.wind, rain: K.rain, kmul: K.kmul, hen: K.hen, out: K.out, pts: K.pts, resolved: K.resolved, t: K.t, saveBy: K.saveBy, hitFrame: K.hitFrame || null, shotT: K.shotT, tx: B.tx, ty: B.ty },
          ball: B && { x: B.x, y: B.y, z: B.z, vx: B.vx, vy: B.vy, vz: B.vz, live: B.live, scored: B.scored },
          keeper: ks && { x: ks.x, dive: ks.dive ? { sx: ks.dive.sx, sy: ks.dive.sy, t: ks.dive.t } : null, tip: ks.tip, glove: ks.glove, s: ks.s }, hen: { on: hen_.on, st: hen_.st, x: hen_.x } }),
        force: (o) => { forceNext = o; }, setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); },
        setTaken: (a, b) => { taken[0] = a; taken[1] = b; kickNo = a + b; for (let i = 0; i < 2; i++) { logs[i].length = 0; } refreshHud(); },
        skipAim: () => { if (state === 'prep') stT = PREP_T; }, shootNow: (p, x, y, curl) => { if (state === 'aim') { if (x != null) K.aimX = x; if (y != null) K.aimY = y; if (curl != null) K.curl = curl; shoot(p); } },
        diveNow: (sx, sy) => { if (state === 'flight' && !ks.dive) { ks.bx = sx; ks.by = -sy; startDive(); } }, hit: () => ({ GX, GH, GZ }), K: () => K, ks: () => ks, B: () => B, nextKick: () => { stT = RES_T; },
      },
    };
  },
};

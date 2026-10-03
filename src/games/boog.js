import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Animal, Dragon } from '../engine/chars.js';
import * as WD from './boog_world.js';

// Boogschieten-Battle — duel: twee schutters, ieder een eigen doel dat schuift, draait en wegduikt. 10 pijlen elk (of 80 s).
//  * richtingen = richtkruis (wiebelt!), A vast = boog spannen (laat los in de groene zone = PERFECT), B tijdens spannen = adem inhouden,
//    B vóór het spannen = speciale pijl laden (vuur x2 / trio / plof-rookwolk op het doel van de ander)
//  * wind duwt de pijl, gewone ringen 2-10, ballonnen +3 (goud +5 + speciale pijl), kip +5, draak +10; laatste pijl telt dubbel
//  * gelijkspel: één beslissende pijl. De Deurman kijkt vanuit de tribune en roept soms "HÉ!" (iedereen schrikt: richtkruis wiebelt)

const { AX, ZA, TXC, TY, TR, ZT, ZB, RINGS } = WD;
const ARROWS = 10, MATCH_TIME = 80, DRAW_T = 1.35, SWEET0 = 0.82, SWEET1 = 0.97, OVER_MAX = 1.3;
const V_REF = 34, G0 = 4.0, WIND_K = 2.2, REACH_X = 10, RET_SPEED = 8.5;
const SPECIALS = { fire: { name: 'VUURPIJL', col: '#ff8a3a', ico: '🔥', desc: 'dubbele punten' }, trio: { name: 'TRIO-PIJL', col: '#6fe8ff', ico: '➰', desc: 'drie pijlen tegelijk' }, plof: { name: 'PLOF-PIJL', col: '#d9a8ff', ico: '💨', desc: 'rookwolk op het doel van de ander' } };
const BALLOON_COLS = [0xff4a4a, 0x4a9aff, 0x5ae06a, 0xff8fd0, 0xb07aff, 0xffa63a];
const PH = [['still', 6], ['slide', 11], ['bob', 10], ['circle', 11], ['fast', 10], ['slide', 9], ['circle', 9], ['bob', 9]];
const PH_TOT = PH.reduce((s, p) => s + p[1], 0);
const PH_NAME = { still: '', slide: 'Doelen schuiven!', bob: 'Doelen gaan op en neer!', circle: 'Doelen draaien rondjes!', fast: 'Doelen schuiven SNEL!' };

export default {
  id: 'boog',
  name: 'Boogschieten-Battle',
  giver: 'Robin van de Hooiberg',
  icon: '🏹',
  mode: 'pvp',
  time: 80,
  music: 'game',
  blurb: 'Boogschieten op het toernooiveld! Je doel <b>schuift, draait en duikt weg</b>. Span je boog en laat los in de <b>groene zone</b> = PERFECT. Let op de <b>wind</b>! Ballonnen +3, kip +5, draak +10. Laatste pijl <b>dubbel</b>.',
  controls: ['{move} richten (wiebelt!)', '{a} spannen, loslaten = schieten', '{b} adem inhouden, tik = special'],
  tip: 'Gouden ballon = speciale pijl. Gelijkspel? Eén beslissende pijl!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? (ctx.twist.speed || 1) : 1;
    const L = ctx.lights('day', { shadow: 26, center: [0, 0, -8], fogNear: 110, fogFar: 260 });
    L.hemi.intensity = 1.2; L.sun.intensity = 2.4; L.sun.position.set(-18, 40, 14);
    camera.fov = 40; camera.updateProjectionMatrix();
    const W = WD.buildWorld(ctx, L);
    const rnd = Math.random;

    // ---------------- doelen ----------------
    const T = players.map((p, i) => { const t = WD.makeTarget(i, p.name, p.css, PLAYER_COLORS[i]); t.x = TXC[i]; t.y = TY; t.hidden = 0; t.smoke = 0; t.smokeT = 0; t.root.position.set(t.x, t.y, ZT); scene.add(t.root); return t; });

    // ---------------- pijlen (pool, één mesh per pijl) ----------------
    const arrowGeo = WD.arrowGeometry(); const arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const arrows = Array.from({ length: 46 }, () => { const m = new THREE.Mesh(arrowGeo, arrowMat); m.visible = false; scene.add(m); return { m, on: false, st: 'dead', seq: 0 }; });
    let seq = 0;
    function allocArrow() {
      let a = arrows.find((q) => !q.on);
      if (!a) { a = arrows.filter((q) => q.st === 'stuck').sort((p, q) => p.seq - q.seq)[0]; if (!a) return null; if (a.m.parent !== scene) { a.m.parent.remove(a.m); scene.add(a.m); } }
      a.on = true; a.seq = ++seq; a.m.visible = true; a.m.scale.setScalar(1); return a;
    }

    // ---------------- reticle-sprites ----------------
    const reticles = players.map((p, i) => {
      const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d');
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false })); sp.scale.set(3.6, 3.6, 1); sp.renderOrder = 13; scene.add(sp);
      return { c, g, tx, sp, key: '' };
    });
    function drawReticle(a) {
      const R = reticles[a.i], g = R.g, drawing = a.st === 'draw';
      const key = `${a.st}|${Math.round(a.tension * 36)}|${Math.round(a.breath * 14)}|${a.armed ? a.special : ''}|${a.breathOn ? 1 : 0}|${a.left > 0 ? 1 : 0}`;
      if (key === R.key) return; R.key = key;
      g.clearRect(0, 0, 160, 160); const cx = 80, cy = 80, col = players[a.i].css;
      if (drawing || a.st === 'ready') {
        g.lineWidth = 9; g.strokeStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(cx, cy, 64, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(80,255,120,.9)'; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, 64, -Math.PI / 2 + SWEET0 * TAU, -Math.PI / 2 + SWEET1 * TAU); g.stroke();
      }
      if (drawing) {
        const tn = Math.min(1, a.tension); g.lineWidth = 9; g.lineCap = 'round';
        g.strokeStyle = a.tension > SWEET1 ? '#ff4a2a' : a.tension >= SWEET0 ? '#b6ff5a' : '#ffe14a';
        g.beginPath(); g.arc(cx, cy, 64, -Math.PI / 2, -Math.PI / 2 + tn * TAU); g.stroke();
      }
      if (a.breathOn || (drawing && a.breath < 0.98)) { g.lineWidth = 6; g.strokeStyle = a.breathOn ? 'rgba(130,220,255,.95)' : 'rgba(130,220,255,.45)'; g.beginPath(); g.arc(cx, cy, 44, -Math.PI / 2, -Math.PI / 2 + a.breath * TAU); g.stroke(); }
      // kruis
      g.lineWidth = 5; g.strokeStyle = 'rgba(15,10,30,.85)'; g.fillStyle = col;
      g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.stroke();
      g.lineWidth = 3.4; g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.lineWidth = 6; g.strokeStyle = 'rgba(15,10,30,.85)'; g.beginPath(); g.moveTo(cx + dx * 10, cy + dy * 10); g.lineTo(cx + dx * 32, cy + dy * 32); g.stroke(); g.lineWidth = 3.4; g.strokeStyle = col; g.beginPath(); g.moveTo(cx + dx * 11, cy + dy * 11); g.lineTo(cx + dx * 31, cy + dy * 31); g.stroke(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
      if (a.armed) { const sp = SPECIALS[a.special]; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(15,10,30,.9)'; g.strokeText(sp.ico, cx, 22); g.fillStyle = sp.col; g.fillText(sp.ico, cx, 22); }
      R.tx.needsUpdate = true;
    }

    // ---------------- schutters ----------------
    const archers = players.map((pp, i) => {
      const c = makeBrother(i); const kS = (2.55 / c.height) * lerp(1, pv.size(i), 0.55);
      const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(kS); holder.position.set(AX[i], 0.3, ZA); scene.add(holder);
      c.yaw = c.targetYaw = Math.PI; c.group.rotation.y = Math.PI;
      const bw = WD.makeBow(PLAYER_COLORS[i]); scene.add(bw.rig);
      const nockArrow = new THREE.Mesh(arrowGeo, arrowMat); bw.nock.add(nockArrow);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); flame.position.z = 1.1; flame.visible = false; bw.nock.add(flame);
      const a = { i, c, holder, bw, nockArrow, flame, kS, ax: AX[i], st: 'nock', nockT: 0.5, tension: 0, over: 0, left: ARROWS, shot: 0, score: 0, bx: TXC[i], by: TY, vx: 0, vy: 0, wx: 0, wy: 0, aim: [TXC[i], TY], breath: 1, breathOn: false, breathLock: 0, special: null, armed: false, buf: 0, react: 0, reactKind: '', startle: 0, ph: [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6], hits: [], bull: 0, auto: false, sdIdle: 0, lastPts: 0, lastDist: 99, inSweet: false, sdDone: false, idle: 0, comebackToast: false, tickT: 0 };
      return a;
    });

    // ---------------- toestand ----------------
    let T0 = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0, gt = 0, timeLeft = MATCH_TIME, hudTimer = -1;
    const S = { st: 'init', t: 0, winner: -1, sdResolved: false, tie: false, timeUp: false };
    let wind = 0, windTarget = 0.6, windT = 5; const stats = { bull: [0, 0], balloons: [0, 0], chicken: [0, 0], dragon: [0, 0], perfect: [0, 0], specials: [0, 0], plof: 0 };
    let cineX = 0, cineK = 0, cineT = 0, lastFov = 40;
    let dropNext = 22, dropT = -1, dropWarned = false, patName = 'still';
    let balloonT = 2.2, balloonN = 0, chickenT = 8, dragonT = 24, deurT = 13, deurShout = 0;

    // ---------------- ballonnen / kip / draak ----------------
    const balloons = Array.from({ length: 9 }, () => {
      const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xff4a4a, roughness: 0.3 });
      g.add(mesh(new THREE.SphereGeometry(0.9, 14, 12), m, { cast: false, scale: [1, 1.2, 1] }), mesh(new THREE.ConeGeometry(0.2, 0.32, 5), m, { cast: false, pos: [0, -1.2, 0], rot: [Math.PI, 0, 0] }), mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0xf4f0e0 }), { cast: false, pos: [0, -2.2, 0] }));
      g.visible = false; scene.add(g); return { g, m, on: false, x: 0, y: 0, vy: 0, gold: false, ph: 0, pop: 0 };
    });
    const chicken = new Animal('chicken'); chicken.group.scale.setScalar(3.4); chicken.group.visible = false; scene.add(chicken.group);
    const CH = { on: false, x: 0, dir: 1, hit: 0, vx: 0, vy: 0, y: 0, t: 0 };
    const dragon = new Dragon(0x4cb04a, 0.62); dragon.group.visible = false; scene.add(dragon.group);
    const DR = { on: false, x: 0, dir: -1, hit: 0, t: 0, y: 9.5, roll: 0, fireT: 0 };

    const lead = (i) => archers[1 - i].score - archers[i].score;      // >0: i staat achter
    function refreshHud() {
      hud.setScore(`${names[0]} ${archers[0].score} – ${archers[1].score} ${names[1]}${S.st === 'sudden' ? '  (BESLISSENDE PIJL)' : ''}`);
      for (const a of archers) {
        const sp = a.special ? ` · ${SPECIALS[a.special].ico}${a.armed ? '!' : ''}` : '';
        hud.setPlayerInfo(a.i, `${a.score} pt · ${S.st === 'sudden' ? 'beslissende pijl' : a.left + ' pijlen'}${sp}`);
      }
    }
    function say(text, x, y, col = '#ffe14a', sc = 1.6, z = ZB + 1.5) { fx.texts.add(text, x, y, z, col, sc); }

    // ---------------- doel-beweging ----------------
    function patternAt(t) { let u = t % PH_TOT; for (const [id, len] of PH) { if (u < len) return { id, u, len }; u -= len; } return { id: 'still', u: 0, len: 1 }; }
    function updateTargets(dt) {
      const p = patternAt(gt), ramp = smoothstep(0, 1.2, p.u) * smoothstep(0, 1.2, p.len - p.u); let dx = 0, dy = 0;
      if (p.id === 'slide') dx = 3.4 * Math.sin(p.u * TAU / 5.5); else if (p.id === 'fast') dx = 4.4 * Math.sin(p.u * TAU / 3.3);
      else if (p.id === 'bob') dy = 1.3 * Math.sin(p.u * TAU / 3.6); else if (p.id === 'circle') { dx = 2.3 * Math.cos(p.u * TAU / 5); dy = 1.15 * Math.sin(p.u * TAU / 5); }
      dx *= ramp; dy *= ramp;
      if (p.id !== patName && S.st === 'play' && gt > 1) { patName = p.id; if (PH_NAME[p.id]) { hud.toast('🎯 ' + PH_NAME[p.id], 1700); audio.sfx('whoosh', { vol: 0.35 }); } }
      // wegduik-moment (gespiegeld voor beide doelen)
      let hid = 0;
      if (S.st === 'play' && gt >= dropNext - 1.5 && !dropWarned && dropT < 0) { dropWarned = true; hud.toast('⚠️ Pas op: de doelen duiken zo weg!', 1500); audio.sfx('bell', { vol: 0.35, rate: 1.4 }); }
      if (S.st === 'play' && gt >= dropNext && dropT < 0) { dropT = 0; audio.sfx('whoosh', { vol: 0.5, rate: 0.7 }); }
      if (dropT >= 0) { dropT += dt; hid = smoothstep(0, 0.5, dropT) * (1 - smoothstep(2.9, 3.4, dropT)); if (dropT > 3.4) { dropT = -1; dropNext = gt + 22 + rnd() * 6; dropWarned = false; audio.sfx('boing', { vol: 0.4 }); } }
      T.forEach((t, i) => {
        t.x = TXC[i] + (i ? -dx : dx); t.hidden = hid; t.y = TY + dy - hid * (TY + TR + 0.8);
        t.root.position.set(t.x, t.y, ZT);
        const H = Math.max(0.05, t.y - TR * 0.95); t.pole.scale.y = H; t.pole.position.y = -TR * 0.95 - H / 2; t.pole.visible = H > 0.1;
        if (t.smokeT > 0) { t.smokeT -= dt; t.smoke = smoothstep(0, 0.5, 6 - t.smokeT) * Math.min(1, t.smokeT / 0.8); } else t.smoke = 0;
        t.setSmoke(t.smoke, T0);
      });
    }

    // ---------------- wind ----------------
    function updateWind(dt) {
      windT -= dt;
      if (windT <= 0) { windT = rand(5, 8); const big = rnd() < 0.3; windTarget = (rnd() < 0.5 ? -1 : 1) * rand(big ? 2.4 : 0.6, big ? 3.2 : 2.4); if (big && S.st === 'play' && gt > 4) { hud.toast('💨 Windstoot!', 1300); audio.sfx('whoosh', { vol: 0.5, rate: 0.6 }); } }
      wind = damp(wind, windTarget, 0.8, dt); W.drawWind(wind);
    }

    // ---------------- schieten ----------------
    function fireArrow(a, ax_, ay_, s, o) {
      const ar = allocArrow(); if (!ar) return null;
      const bx = a.bw.rig.position.x, by = a.bw.rig.position.y, bz = ZA - 1.5;
      const dz = bz - ZT, tref = dz / V_REF, g = G0 * GRAV;
      Object.assign(ar, { st: 'fly', owner: a.i, kind: o.kind || 'norm', mult: o.mult || 1, cine: !!o.cine, perfect: !!o.perfect, windMul: o.windMul ?? 1, g, age: 0, zPrev: bz, bonusDone: false, targetDone: false, x: bx, y: by, z: bz, ptsTotal: 0 });
      ar.vx = (ax_ - bx) / tref * s; ar.vy = ((ay_ - by) + 0.5 * g * tref * tref) / tref * s; ar.vz = -V_REF * s;
      ar.m.position.set(bx, by, bz); ar.m.lookAt(bx + ar.vx, by + ar.vy, bz + ar.vz);
      if (ar.m.parent !== scene) { ar.m.parent.remove(ar.m); scene.add(ar.m); }
      return ar;
    }
    function shoot(a) {
      const tn = a.tension; const perfect = tn >= SWEET0 && tn <= SWEET1;
      const s = perfect ? 1 : tn < SWEET0 ? lerp(0.53, 0.92, clamp((tn - 0.12) / (SWEET0 - 0.12), 0, 1)) : 0.9;
      const kind = a.armed ? a.special : 'norm'; const sudden = S.st === 'sudden';
      const isLast = !a.armed && !sudden && a.left === 1; const cine = isLast || sudden;
      let mult = isLast ? 2 : 1; const ax_ = a.aim[0], ay_ = a.aim[1];
      const perfOpts = { perfect, windMul: perfect ? 0.45 : 1, cine, mult };
      if (kind === 'trio') { for (const dx of [-1.7, 0, 1.7]) fireArrow(a, ax_ + dx, ay_ + (dx ? 0.35 : 0), s, { ...perfOpts, kind: 'trio' }); }
      else if (kind === 'plof') { const o = T[1 - a.i]; fireArrow(a, o.x, o.y, 1, { kind: 'plof', perfect: true, windMul: 0, mult: 1, cine: false }); }
      else fireArrow(a, ax_, ay_, s, { ...perfOpts, kind });
      if (a.armed) { a.armed = false; a.special = null; stats.specials[a.i]++; }
      else { a.left--; a.shot++; }
      if (perfect) { stats.perfect[a.i]++; say('PERFECT!', a.bw.rig.position.x, 4.4, '#9aff6a', 1.1, ZA - 3); audio.sfx('good', { vol: 0.45 }); }
      audio.sfx('shoot', { vol: 0.7 }); audio.sfx('whoosh', { vol: 0.35, rate: 1.4 }); ctx.shake(0.12);
      fx.particles.burst(a.bw.rig.position.x, a.bw.rig.position.y, ZA - 1.5, { count: 6, speed: 2, up: 0.3, life: 0.3, size: 0.2, colors: [0xffffff, 0xffe14a], gravity: 0 });
      a.st = 'nock'; a.nockT = 0.75 + (kind === 'trio' ? 0.3 : 0); a.tension = 0; a.over = 0; a.breathOn = false; a.buf = 0; a.auto = false; a.sdIdle = 0;
      a.holder.position.z = ZA + 0.25; a.recoil = 1;
      // comeback: speciale pijl voor wie ver achterstaat
      if (!a.armed && !a.special && S.st === 'play' && (a.shot === 4 || a.shot === 7) && lead(a.i) >= 12) grantSpecial(a, 'Robin Hood schenkt je een cadeautje!');
      refreshHud();
    }
    function grantSpecial(a, why) {
      if (a.special) return; const k = pick(['fire', 'fire', 'trio', 'trio', 'plof']); a.special = k; stats.specials[a.i] += 0;
      const sp = SPECIALS[k]; hud.toast(`${sp.ico} ${names[a.i]}: ${sp.name}! Tik B om te laden`, 2400);
      say(sp.name + '!', a.bw.rig.position.x, 5.3, sp.col, 1.5, ZA - 3); audio.sfx('powerup', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.5 });
      fx.particles.burst(a.bw.rig.position.x, 3, ZA - 1, { count: 26, speed: 4, up: 1.4, life: 0.8, size: 0.35, colors: [0xffd23f, 0xffffff, 0xff9a3a], gravity: 3 });
      if (a.left <= 0) a.armed = true;
      refreshHud();
    }

    // ---------------- punten + treffers ----------------
    function award(ar, pts, label, x, y, z, col = '#ffe14a', big = false) {
      const a = archers[ar.owner]; const mult = ar.mult * (ar.kind === 'fire' ? 2 : 1); const tot = pts * mult; a.score += tot; ar.ptsTotal += tot;
      say(`+${tot}${label ? ' ' + label : ''}${mult > 1 ? ' ×' + mult : ''}`, x, y + 1.2, col, big ? 2.3 : 1.7, z);
      refreshHud();
    }
    function react(a, kind, secs = 1.1) { a.react = secs; a.reactKind = kind; a.c.faceDir(0, 1); }
    function popBalloon(b, ar) {
      b.on = false; b.g.visible = false; const a = archers[ar.owner]; stats.balloons[ar.owner]++;
      fx.particles.burst(b.x, b.y, ZB, { count: 24, speed: 5, up: 1, life: 0.8, size: 0.35, colors: [b.m.color.getHex(), 0xffffff, 0xffe14a], gravity: 6 }); audio.sfx('pop', { vol: 0.7 });
      award(ar, b.gold ? 5 : 3, b.gold ? 'GOUD!' : '', b.x, b.y, ZB + 1, b.gold ? '#ffd23f' : '#ffb0e0');
      if (b.gold) { grantSpecial(a, ''); fx.particles.ring(b.x, b.y, ZB, { count: 26, speed: 6, color: 0xffd23f, size: 0.35, life: 0.6 }); audio.sfx('coin', { vol: 0.6 }); }
      react(a, 'cheer', 0.8);
    }
    function hitBonus(ar, x, y) {
      for (const b of balloons) if (b.on && Math.hypot(x - b.x, (y - b.y) * 0.9) < 1.15) popBalloon(b, ar);
      if (CH.on && CH.hit <= 0 && Math.hypot((x - CH.x) / 1.35, (y - 1.4) / 1.25) < 1) {
        CH.hit = 1.4; CH.vx = CH.dir * 7; CH.vy = 9; CH.y = 1.4; stats.chicken[ar.owner]++; award(ar, 5, 'KIP!', CH.x, 2.4, ZB + 1, '#fff2c0', true);
        fx.particles.burst(CH.x, 1.6, ZB, { count: 40, speed: 6, up: 1.2, life: 1.1, size: 0.4, colors: [0xffffff, 0xf6f1e4, 0xe8e0d0, 0xd83a2a], gravity: 5 }); audio.sfx('hurt', { vol: 0.5, rate: 1.7 }); audio.sfx('boing', { vol: 0.5 }); ctx.shake(0.2);
        W.cheerCrowd(1.4, 0.7); react(archers[ar.owner], 'cheer', 1);
      }
      if (DR.on && DR.hit <= 0 && Math.hypot((x - DR.x) / 3.1, (y - DR.y) / 1.8) < 1) {
        DR.hit = 1.6; stats.dragon[ar.owner]++; award(ar, 10, 'DRAAK!', DR.x, DR.y + 0.5, ZB + 1, '#ff9a6a', true);
        fx.particles.burst(DR.x, DR.y, ZB, { count: 50, speed: 7, up: 1, life: 1.2, size: 0.5, colors: [0xff7a1a, 0xffd23f, 0x6bd86b, 0xffffff], gravity: 3 }); audio.sfx('explode', { vol: 0.45 }); audio.sfx('hurt', { vol: 0.4, rate: 0.6 }); ctx.shake(0.35);
        W.cheerCrowd(2, 1); react(archers[ar.owner], 'cheer', 1.4);
      }
    }
    function stickInTarget(ar, t, x, y) {
      ar.st = 'stuck'; ar.m.parent.remove(ar.m); t.root.add(ar.m);
      ar.m.position.set(x - t.x, y - t.y, 0.7); ar.m.rotation.x += (rnd() - 0.5) * 0.08; ar.m.rotation.y += (rnd() - 0.5) * 0.08; ar.m.updateMatrix();
    }
    function resolveTarget(ar, x, y) {
      ar.targetDone = true;
      if (ar.kind === 'plof') {   // rookwolk op het doel van de ander
        const t = T[1 - ar.owner]; t.smokeT = 6.5; stats.plof++; ar.on = false; ar.m.visible = false; ar.st = 'dead';
        fx.particles.burst(t.x, t.y, ZT + 1, { count: 50, speed: 5, up: 0.3, life: 1.4, size: 1.1, colors: [0xffffff, 0xd8d0f0, 0xc8b8ff], gravity: -0.5 });
        say('PLOF!', t.x, t.y + 2, '#d9a8ff', 2.2, ZT + 1); hud.toast(`💨 ${names[1 - ar.owner]} ziet niks meer! Plof-pijl van ${names[ar.owner]}`, 2200); audio.sfx('explode', { vol: 0.35, rate: 1.4 }); audio.sfx('pop', { vol: 0.6, rate: 0.6 }); ctx.shake(0.3); return;
      }
      const a = archers[ar.owner];
      for (let j = 0; j < 2; j++) {
        const t = T[j]; const d = Math.hypot(x - t.x, y - t.y);
        if (t.hidden > 0.25 || d > TR) continue;
        const f = d / TR; let k = 0; while (k < RINGS.length - 1 && f > RINGS[k][0]) k++;
        const pts = RINGS[k][1]; stickInTarget(ar, t, x, y);
        fx.particles.burst(x, y, ZT + 1, { count: 8 + pts, speed: 2.5, up: 0.6, life: 0.5, size: 0.22, colors: [0xffffff, 0xffe14a, 0xd9b45a], gravity: 6 }); audio.sfx('thud', { vol: 0.55, rate: 0.9 + pts * 0.03 });
        if (j !== ar.owner) { say('FOUT DOEL!', x, y + 1, '#ff9a9a', 1.7, ZT + 1); audio.sfx('buzz', { vol: 0.4 }); a.lastPts = 0; a.lastDist = 99; react(a, 'sad', 1); return; }
        a.lastPts = pts * ar.mult * (ar.kind === 'fire' ? 2 : 1); a.lastDist = Math.min(a.lastDist, d); a.hits.push(pts);
        award(ar, pts, RINGS[k][2], x, y + 0.6, ZT + 1, pts === 10 ? '#ffd23f' : pts >= 8 ? '#9aff9a' : '#ffffff', pts === 10);
        if (ar.kind === 'fire') { fx.particles.burst(x, y, ZT + 1, { count: 30, speed: 4, up: 1.5, life: 0.9, size: 0.5, colors: [0xff7a1a, 0xffd23f, 0xff3a0a], gravity: -1 }); audio.sfx('sizzle', { vol: 0.5 }); }
        if (pts === 10) { stats.bull[a.i]++; audio.sfx('coin', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.6 }); fx.particles.ring(x, y, ZT + 1, { count: 28, speed: 7, color: 0xffd23f, size: 0.35, life: 0.6 }); fx.particles.burst(x, y, ZT + 1, { count: 30, speed: 6, up: 1, life: 1.0, size: 0.35, colors: [0xffd23f, 0xffffff, 0xff9a3a], gravity: 4 }); ctx.shake(0.28); W.cheerCrowd(1.8, 0.8); react(a, 'cheer', 1.2); }
        else if (pts >= 8) { audio.sfx('good', { vol: 0.5 }); W.cheerCrowd(0.9, 0.35); react(a, 'cheer', 0.7); }
        else if (pts <= 2) { audio.sfx('miss', { vol: 0.35 }); react(a, 'sad', 0.7); }
        return;
      }
      // mis (of het doel is weggeduikt)
      a.lastPts = 0; a.lastDist = Math.min(a.lastDist, 60);
    }
    function groundHit(ar) {
      ar.st = 'stuck'; ar.m.position.y = Math.max(0.05, ar.y + ar.vy * 0.02); const a = archers[ar.owner];
      if (!ar.targetDone && ar.kind !== 'plof') { say(T[0].hidden > 0.25 ? 'DOEL WEG!' : 'MIS!', ar.x, Math.max(1.8, ar.y + 1.3), '#ff9a9a', 1.3, Math.max(ZT, ar.z)); audio.sfx('miss', { vol: 0.35 }); react(a, 'sad', 0.8); fx.particles.dust(ar.x, 0.1, ar.z, 6, 0x7a9a4a); a.lastPts = 0; a.lastDist = 99; }
      if (ar.kind === 'plof') { ar.on = false; ar.m.visible = false; }
    }

    // ---------------- pijl-natuurkunde ----------------
    function stepArrow(ar, dt) {
      ar.age += dt; const n = 2, h = dt / n;
      for (let s = 0; s < n && ar.st === 'fly'; s++) {
        const px = ar.x, py = ar.y, pz = ar.z;
        ar.vy -= ar.g * h; ar.vx += wind * WIND_K * ar.windMul * h;
        ar.x += ar.vx * h; ar.y += ar.vy * h; ar.z += ar.vz * h;
        if (!ar.bonusDone && pz > ZB && ar.z <= ZB) { ar.bonusDone = true; const u = (pz - ZB) / (pz - ar.z); hitBonus(ar, lerp(px, ar.x, u), lerp(py, ar.y, u)); }
        if (!ar.targetDone && pz > ZT && ar.z <= ZT) { const u = (pz - ZT) / (pz - ar.z); const x = lerp(px, ar.x, u), y = lerp(py, ar.y, u); ar.x = x; ar.y = y; ar.z = ZT; resolveTarget(ar, x, y); if (ar.st !== 'fly' || !ar.on) break; }
        if (ar.y <= 0.05) { groundHit(ar); break; }
        if (ar.z < ZT - 9) { groundHit(ar); break; }
      }
      if (ar.st === 'fly') {
        ar.m.position.set(ar.x, ar.y, ar.z); ar.m.lookAt(ar.x + ar.vx, ar.y + ar.vy, ar.z + ar.vz);
        if (ar.kind === 'fire' && rnd() < 0.8) fx.particles.emit(ar.x, ar.y, ar.z + 0.4, (rnd() - 0.5) * 0.6, 0.8, 0.5, { life: 0.5, size: 0.4, color: rnd() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: -2 });
        else if (ar.kind === 'plof') fx.particles.emit(ar.x, ar.y, ar.z + 0.4, (rnd() - 0.5), 0.3, 0.6, { life: 0.6, size: 0.55, color: 0xd8c8ff, gravity: 0 });
        else if (ar.age < 1.4 && rnd() < 0.35) fx.particles.emit(ar.x, ar.y, ar.z + 0.8, 0, 0, 0.5, { life: 0.3, size: 0.16, color: 0xffffff, gravity: 0 });
      }
    }

    // ---------------- spel-flow ----------------
    function startMatch() {
      started = true; S.st = 'play'; S.t = 0; refreshHud();
      hud.showBig('SCHIET!', 900, '#ffe14a'); audio.sfx('go', { vol: 0.4 });
    }
    const flying = () => arrows.some((q) => q.on && q.st === 'fly');
    const aDone = (a) => a.left <= 0 && !a.special;
    function startSudden() {
      S.st = 'sudden'; S.t = 0; S.tie = true; slow = 1;
      for (const a of archers) { a.left = 1; a.special = null; a.armed = false; a.st = 'nock'; a.nockT = 1.2; a.tension = 0; a.lastPts = 0; a.lastDist = 99; a.sdIdle = 0; a.bx = TXC[a.i]; a.by = TY; a.vx = a.vy = 0; }
      hud.showBig('GELIJK! BESLISSENDE PIJL', 2000, '#ffd23f'); hud.toast('⚖️ Eén pijl elk: dichtst bij de roos wint', 2400); audio.sfx('bell', { vol: 0.8 }); W.cheerCrowd(2.5, 1);
      hud.setTimer(null); refreshHud();
    }
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const w = winner, l = winner == null ? null : 1 - winner;
      const jokes = w == null ? ['Precies gelijk! Robin Hood krabt zich verbaasd achter zijn oor.'] : [`${names[w]} schiet als Robin Hood! ${names[l]} schoot vooral gaten in de lucht.`, `${names[w]} raakt alles. ${names[l]} raakt vooral de grond.`, `De menigte juicht voor ${names[w]}. ${names[l]} zoekt zijn pijlen nog.`, `${names[w]} is de Koning van het Toernooi! ${names[l]} mag de kip troosten.`];
      const bits = [];
      if (stats.bull[0] + stats.bull[1]) bits.push(`${stats.bull[0] + stats.bull[1]}× in de roos`);
      if (stats.balloons[0] + stats.balloons[1]) bits.push(`${stats.balloons[0] + stats.balloons[1]} ballonnen geknapt`);
      if (stats.chicken[0] + stats.chicken[1]) bits.push(`${stats.chicken[0] + stats.chicken[1]}× kip geraakt`);
      if (stats.dragon[0] + stats.dragon[1]) bits.push(`${stats.dragon[0] + stats.dragon[1]}× draak geraakt`);
      ctx.finishPvp({ winner: w, score: [archers[0].score, archers[1].score], delay: 900, summary: `${pick(jokes)}${S.tie ? ' De beslissende pijl gaf de doorslag.' : ''}${bits.length ? ' (' + bits.join(', ') + ')' : ''}` });
    }
    function endMatch(winner) {
      S.st = 'end'; S.t = 0; S.winner = winner; slow = 1; hud.setTimer(null);
      for (const a of archers) { a.armed = false; a.st = 'nock'; a.bw.rig.visible = false; a.c.faceDir(0, 1); }
      if (winner != null) { archers[winner].c.pose = 'cheer'; archers[1 - winner].c.pose = 'sad'; hud.showBig(`${names[winner]} WINT!`, 1500, winner ? '#8fb8ff' : '#7dffb0'); W.cheerCrowd(5, 1); audio.sfx('win', { vol: 0.6 }); }
      else hud.showBig('GELIJKSPEL!', 1400, '#ffd23f');
    }
    function checkEnd() {
      if (flying() || S.st === 'end') return;
      if (S.st === 'play') {
        if (!archers.every(aDone)) return;
        const d = archers[0].score - archers[1].score;
        if (d !== 0) endMatch(d > 0 ? 0 : 1); else startSudden();
      } else if (S.st === 'sudden') {
        if (!archers.every((a) => a.left <= 0)) return;
        let w;
        if (archers[0].lastPts !== archers[1].lastPts) w = archers[0].lastPts > archers[1].lastPts ? 0 : 1;
        else if (archers[0].lastDist !== archers[1].lastDist) w = archers[0].lastDist < archers[1].lastDist ? 0 : 1;
        else w = rnd() < 0.5 ? 0 : 1;
        endMatch(w);
      }
    }

    // ---------------- invoer / schutter-update ----------------
    function updateArcher(a, dt) {
      const inp = pv.input(a.i); const t = T0;
      a.buf = Math.max(0, a.buf - dt); a.react = Math.max(0, a.react - dt); a.startle = Math.max(0, a.startle - dt); a.breathLock = Math.max(0, a.breathLock - dt);
      const live = S.st === 'play' || S.st === 'sudden';
      // richtkruis bewegen
      const drawing = a.st === 'draw';
      const sp = RET_SPEED * pv.speed(a.i) * (drawing ? 0.62 : 1);
      const lam = lerp(16, 1.8, SLIP);
      const tvx = live ? inp.x * sp : 0, tvy = live ? -inp.y * sp : 0;
      a.vx = damp(a.vx, tvx, lam, dt); a.vy = damp(a.vy, tvy, lam, dt);
      a.bx = clamp(a.bx + a.vx * dt, TXC[a.i] - REACH_X, TXC[a.i] + REACH_X); a.by = clamp(a.by + a.vy * dt, 0.5, 11);
      // wiebel
      const comeMul = lead(a.i) >= 20 ? 0.72 : 1; if (comeMul < 1 && !a.comebackToast && S.st === 'play') { a.comebackToast = true; hud.toast(`🍀 ${names[a.i]} krijgt Robin Hood-geluk: stabielere hand!`, 1800); }
      if (lead(a.i) < 12) a.comebackToast = false;
      const sizeMul = Math.pow(pv.size(a.i), 0.5);
      let amp = (a.st === 'draw' ? 0.5 + 0.95 * Math.min(1, a.tension) + a.over * 1.6 : 0.4) * comeMul * sizeMul * (a.startle > 0 ? 2.6 : 1);
      if (a.breathOn) amp *= 0.12;
      a.wx = amp * (0.62 * Math.sin(t * 1.7 + a.ph[0]) + 0.38 * Math.sin(t * 3.9 + a.ph[1])); a.wy = amp * (0.62 * Math.sin(t * 2.1 + a.ph[2]) + 0.38 * Math.sin(t * 4.3 + a.ph[3]));
      a.aim[0] = a.bx + a.wx; a.aim[1] = clamp(a.by + a.wy, 0.2, 12);
      if (!live) { a.breathOn = false; return; }
      // toestand
      if (a.st === 'nock') {
        a.nockT -= dt; if (inp.aP) a.buf = 0.35;
        if (a.nockT <= 0) { a.st = 'ready'; audio.sfx('click', { vol: 0.2, rate: 1.6 }); if (!a.armed && S.st === 'play' && a.left === 1 && !a.special) { say('LAATSTE PIJL ×2!', a.bw.rig.position.x, 5.2, '#ff9a3a', 1.5, ZA - 3); audio.sfx('bell', { vol: 0.4, rate: 1.5 }); } if (a.left <= 0 && a.special) { a.armed = true; } }
      }
      if (a.st === 'ready') {
        if (inp.bP && a.special && a.left > 0) { a.armed = !a.armed; audio.sfx(a.armed ? 'select' : 'click', { vol: 0.5 }); if (a.armed) say(SPECIALS[a.special].name, a.bw.rig.position.x, 5.0, SPECIALS[a.special].col, 1.2, ZA - 3); refreshHud(); }
        if ((inp.aP || (a.buf > 0 && inp.a)) && (a.left > 0 || a.armed)) { a.st = 'draw'; a.tension = 0; a.over = 0; a.inSweet = false; a.buf = 0; audio.sfx('scrape', { vol: 0.25, rate: 1.3 }); }
        if (S.st === 'sudden') { a.sdIdle += dt; if (a.sdIdle > 5 && a.left > 0) { a.st = 'draw'; a.tension = 0; a.over = 0; a.auto = true; hud.toast(`${names[a.i]} slaapt! De boog schiet vanzelf`, 1400); } }
      } else if (a.st === 'draw') {
        a.tension += dt / DRAW_T * pv.speed(a.i) * (TEMPO > 1 ? 1 : 1);
        if (a.tension >= 1) { a.tension = 1; a.over += dt; }
        // sweet spot ding
        const sw = a.tension >= SWEET0 && a.tension <= SWEET1;
        if (sw && !a.inSweet) { audio.tone(900, 0.09, { type: 'sine', vol: 0.12 }); } a.inSweet = sw;
        a.tickT -= dt; if (a.tickT <= 0) { a.tickT = 0.09; audio.tone(160 + a.tension * 420, 0.05, { type: 'triangle', vol: 0.035 }); }
        // adem inhouden
        const want = inp.b && !a.auto;
        if (want && a.breath > 0.03 && a.breathLock <= 0) { if (!a.breathOn) audio.sfx('select', { vol: 0.2, rate: 0.6 }); a.breathOn = true; a.breath = Math.max(0, a.breath - dt * 0.55); if (a.breath <= 0.03) { a.breathOn = false; a.breathLock = 2; say('PFFF!', a.aim[0], a.aim[1] + 1, '#9fe8ff', 1, ZT + 1); } } else a.breathOn = false;
        if (!a.breathOn) a.breath = Math.min(1, a.breath + dt * 0.22);
        const rel = a.auto ? a.tension >= 0.9 : (!inp.a || a.over > OVER_MAX);
        if (rel) { if (a.tension < 0.12 && !a.auto) { a.st = 'ready'; audio.sfx('click', { vol: 0.2, rate: 0.7 }); } else { if (a.over > OVER_MAX) say('ARM MOE!', a.aim[0], a.aim[1] + 1, '#ff9a6a', 1.1, ZT + 1); shoot(a); } }
      } else a.breathOn = false;
      if (a.st !== 'draw') a.breath = Math.min(1, a.breath + dt * 0.3);
    }

    // ---------------- bonus-spawns ----------------
    function spawnBalloon() {
      const b = balloons.find((q) => !q.on); if (!b) return;
      balloonN++; const gold = balloonN % 5 === 3;
      const trail = archers[0].score === archers[1].score ? -1 : (archers[0].score < archers[1].score ? 0 : 1);
      let x = rand(-15, 15); if (trail >= 0 && rnd() < 0.55) x = TXC[trail] + rand(-6, 6);
      Object.assign(b, { on: true, x, y: -0.6, vy: rand(1.5, 2.3) * (GRAV < 1 ? 0.7 : 1), gold, ph: rnd() * 6 });
      b.m.color.setHex(gold ? 0xffd23f : pick(BALLOON_COLS)); b.m.emissive = new THREE.Color(gold ? 0xff9a10 : 0x000000); b.m.emissiveIntensity = gold ? 0.55 : 0;
      b.g.scale.setScalar(gold ? 1.2 : 1); b.g.visible = true; b.g.position.set(x, -0.6, ZB);
      if (gold) { say('GOUDEN BALLON!', x, 3, '#ffd23f', 1.2, ZB + 1); audio.sfx('sparkle', { vol: 0.4 }); }
    }
    function updateBonus(dt) {
      if (S.st === 'play') {
        balloonT -= dt; if (balloonT <= 0) { balloonT = rand(2.2, 3.6) * (timeLeft < 20 ? 0.75 : 1); if (balloons.filter((q) => q.on).length < 7) spawnBalloon(); }
        chickenT -= dt; if (chickenT <= 0 && !CH.on) { chickenT = rand(13, 17); Object.assign(CH, { on: true, dir: rnd() < 0.5 ? 1 : -1, x: 0, hit: 0, t: 0, y: 0 }); CH.x = -CH.dir * 24; chicken.group.visible = true; hud.toast('🐔 Een kip rent over het veld! +5', 1700); audio.sfx('hurt', { vol: 0.2, rate: 2 }); }
        dragonT -= dt; if (dragonT <= 0 && !DR.on) { dragonT = rand(30, 38); Object.assign(DR, { on: true, dir: rnd() < 0.5 ? 1 : -1, hit: 0, t: 0, roll: 0, fireT: rand(0.8, 2) }); DR.x = -DR.dir * 28; dragon.group.visible = true; hud.toast('🐉 Een draak vliegt over! +10', 1900); audio.tone(110, 0.8, { type: 'sawtooth', vol: 0.15, slide: 70 }); }
      }
      for (const b of balloons) {
        if (!b.on) continue; b.y += b.vy * dt; b.x += (wind * 0.35 + Math.sin(T0 * 1.7 + b.ph) * 0.25) * dt; b.vy = Math.min(2.6, b.vy + 0.05 * dt);
        b.g.position.set(b.x, b.y, ZB); b.g.rotation.z = Math.sin(T0 * 2 + b.ph) * 0.12 - wind * 0.03; b.g.rotation.y += dt;
        if (b.gold && rnd() < dt * 8) fx.particles.emit(b.x + (rnd() - 0.5) * 1.5, b.y + (rnd() - 0.5) * 1.5, ZB + 0.6, 0, 0.5, 0, { life: 0.6, size: 0.25, color: 0xffe680, gravity: 0 });
        if (b.y > 13.5) { b.on = false; b.g.visible = false; }
      }
      if (CH.on) {
        CH.t += dt;
        if (CH.hit > 0) { CH.hit -= dt; CH.vy -= 22 * dt; CH.y += CH.vy * dt; CH.x += CH.vx * dt; chicken.group.position.set(CH.x, Math.max(0, CH.y), ZB); chicken.group.rotation.z += dt * 14; chicken.group.rotation.x += dt * 5; if (CH.hit <= 0 || CH.y < -2) { CH.on = false; chicken.group.visible = false; chicken.group.rotation.set(0, 0, 0); } }
        else { CH.x += CH.dir * 6.2 * dt; chicken.speed = 1; chicken.targetYaw = CH.dir > 0 ? Math.PI / 2 : -Math.PI / 2; chicken.group.position.set(CH.x, Math.abs(Math.sin(CH.t * 9)) * 0.35, ZB); chicken.update(dt); if (Math.abs(CH.x) > 25) { CH.on = false; chicken.group.visible = false; } }
      }
      if (DR.on) {
        DR.t += dt; DR.x += DR.dir * 9 * dt; DR.y = 9.5 + Math.sin(DR.t * 2.2) * 0.7; dragon.update(dt);
        dragon.group.rotation.y = DR.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (DR.hit > 0) { DR.hit -= dt; DR.roll += dt * 9; dragon.group.rotation.z = DR.roll; DR.y -= (1.6 - DR.hit) * 1.0; } else dragon.group.rotation.z = Math.sin(DR.t * 2) * 0.08;
        dragon.group.position.set(DR.x, DR.y, ZB - 1);
        DR.fireT -= dt; if (DR.fireT <= 0 && DR.hit <= 0) { DR.fireT = rand(1.4, 2.4); for (let k = 0; k < 18; k++) fx.particles.emit(DR.x + DR.dir * 2.6, DR.y + 0.4, ZB - 0.5, DR.dir * (4 + rnd() * 3), -1 - rnd() * 2, 0, { life: 0.7, size: 0.55, color: rnd() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: 1 }); }
        if (Math.abs(DR.x) > 32 || DR.y < 0) { DR.on = false; dragon.group.visible = false; dragon.group.rotation.z = 0; }
      }
    }

    // ---------------- Deurman op de tribune ----------------
    function updateDeurman(dt) {
      const dm = W.deurman; dm.update(dt);
      if (S.st === 'play') {
        deurT -= dt;
        if (deurT <= 0) {
          deurT = rand(14, 22); deurShout = 1.1; dm.glitch = 0.7; dm.speed = 0;
          say('HÉ!', 18.2, 8.2, '#ff6a6a', 2.4, -28); audio.sfx('static', { vol: 0.35 }); audio.tone(95, 0.5, { type: 'sawtooth', vol: 0.12, slide: 60 }); ctx.shake(0.15); W.cheerCrowd(1.2, 0.5);
          for (const a of archers) { a.startle = 0.9; }
          hud.toast('👁️ De Deurman roept "HÉ!" — iedereen schrikt!', 1500);
        }
      }
      deurShout = Math.max(0, deurShout - dt);
      dm.faceDir(deurShout > 0 ? 0 : -0.6, 1);
    }

    // ---------------- visuals ----------------
    function visuals(dt) {
      const tt = T0 + introT;
      for (const a of archers) {
        const g = a.holder, c = a.c; a.recoil = Math.max(0, (a.recoil || 0) - dt * 5);
        g.position.z = ZA + 0.3 * (a.recoil || 0);
        const rp = a.bw.rig.position; rp.set(a.ax + 0.45, 2.05 * (a.kS / 1.3), ZA - 1.0);
        const drawing = a.st === 'draw';
        if (a.react > 0) { c.pose = a.reactKind === 'cheer' ? 'cheer' : 'sad'; c.faceDir(0, 1); a.bw.rig.visible = false; }
        else {
          c.pose = 'point'; c.faceDir((a.aim[0] - a.ax) * 0.035, -1); a.bw.rig.visible = S.st !== 'end';
        }
        c.speed = 0; c.update(dt);
        if (a.react <= 0) { c.armL.rotation.x = drawing ? -1.15 : -0.2; c.armL.rotation.z = drawing ? 0.9 : 0.1; c.torso.rotation.x = drawing ? 0.12 : 0.0; }
        // boog richten naar het richtkruis
        a.bw.rig.lookAt(a.aim[0], a.aim[1], ZT);
        const pull = drawing ? Math.min(1.05, a.tension) : a.st === 'nock' ? 0 : 0;
        a.bw.nock.position.z = -0.35 - pull * 0.85 + (a.st === 'nock' ? -0.9 + clamp(1 - a.nockT / 0.5, 0, 1) * 0.9 : 0);
        a.nockArrow.visible = a.st !== 'nock' || a.nockT < 0.45; a.nockArrow.position.z = 0.55;
        a.flame.visible = a.armed && a.nockArrow.visible; a.flame.material.color.setHex(a.special === 'fire' ? 0xff8a2a : a.special === 'trio' ? 0x6fe8ff : 0xd9a8ff); a.flame.scale.setScalar(1 + Math.sin(tt * 20) * 0.15);
        a.bw.string.position.z = -pull * 0.35;
        if (drawing && a.over > 0) a.holder.position.x = a.ax + (rnd() - 0.5) * 0.12 * Math.min(1, a.over * 1.4); else a.holder.position.x = a.ax;
        // richtkruis
        const R = reticles[a.i]; const show = S.st === 'play' || S.st === 'sudden';
        R.sp.visible = show; R.sp.position.set(a.aim[0], a.aim[1], ZT + 1.6); R.sp.material.opacity = a.st === 'nock' ? 0.4 : 1;
        R.sp.scale.setScalar((3.2 + (drawing ? (1 - Math.min(1, a.tension)) * 0.7 : 0.4)) * (a.startle > 0 ? 1.2 : 1));
        if (show) drawReticle(a);
      }
      // ballonnen: schaduw-loos; doelen worden elders geüpdatet
      W.update(tt, dt, wind); W.tickCrowd(dt);
    }
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7; let cine = null;
      for (const q of arrows) if (q.on && q.st === 'fly' && q.cine && q.z < -2 && q.z > ZT - 1) cine = q;
      cineK = damp(cineK, cine ? 1 : 0, cine ? 5 : 3, dt); if (cine) cineX = cine.x;
      const fov = lerp(40, 31, cineK); if (Math.abs(fov - lastFov) > 0.02) { lastFov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
      const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)); const depth = Math.max(35, 19.5 / (tanH * asp));
      const fxx = cineX * 0.35 * cineK, sway = Math.sin((T0 + introT) * 0.3) * 0.25;
      camera.position.set(fxx * 0.5 + sway, 3.9 + cineK * 0.6, ZT + depth);
      camera.lookAt(fxx, 4.3 + cineK * 0.5, ZT);
    }

    // ---------------- hoofd-update ----------------
    function update(dt) {
      dt = Math.min(dt, 0.05); T0 += dt;
      if (!started) startMatch();
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3.5, dt);
      // slow-motion bij beslissende pijlen
      let cineArrow = false; for (const q of arrows) if (q.on && q.st === 'fly' && q.cine && q.z < -4 && q.z > ZT) cineArrow = true;
      if (cineArrow) { slow = 0.32; slowHold = 0.15; }
      const sdt = dt * slow;
      if (T0 > 240 && !finished && S.st !== 'end') endMatch(archers[0].score === archers[1].score ? (rnd() < 0.5 ? 0 : 1) : (archers[0].score > archers[1].score ? 0 : 1));
      if (S.st === 'play' || S.st === 'sudden') gt += sdt;
      updateWind(sdt); updateTargets(sdt);
      for (const a of archers) updateArcher(a, sdt);
      for (const q of arrows) if (q.on && q.st === 'fly') stepArrow(q, sdt);
      updateBonus(sdt); updateDeurman(sdt);
      // klok
      if (S.st === 'play') {
        timeLeft -= sdt;
        if (Math.floor(timeLeft) !== hudTimer) { hudTimer = Math.floor(timeLeft); hud.setTimer(Math.max(0, timeLeft), 12); }
        if (timeLeft <= 0 && !S.timeUp) {
          S.timeUp = true; timeLeft = 0; hud.showBig('TIJD!', 1100, '#ffd23f'); audio.sfx('bell', { vol: 1 });
          for (const a of archers) { a.left = 0; a.special = null; a.armed = false; if (a.st === 'draw') { a.st = 'nock'; a.tension = 0; } }
        }
      }
      if (S.st === 'play' || S.st === 'sudden') checkEnd();
      if (S.st === 'end') { S.t += dt; if (S.t > (S.winner == null ? 1.6 : 2.4)) finishMatch(S.winner); }
      visuals(dt); updateCamera(dt);
    }
    function idleUpdate(dt, over) {
      T0 += over ? dt : 0; introT += over ? 0 : dt;
      updateWind(dt); updateTargets(dt);
      for (const a of archers) { updateArcher(a, dt); if (!over) { a.c.pose = 'point'; } }
      updateBonus(dt); updateDeurman(dt);
      for (const q of arrows) if (q.on && q.st === 'fly') stepArrow(q, dt);
      visuals(dt); updateCamera(dt);
    }
    refreshHud(); visuals(0.016); updateCamera(0.016);

    return {
      update: (dt) => { if (finished) { idleUpdate(Math.min(dt, 0.05), true); return; } update(dt); },
      introUpdate: (dt) => idleUpdate(Math.min(dt, 0.05), false),
      resultUpdate: (dt) => idleUpdate(Math.min(dt, 0.05), true),
      onSwap() { for (const a of archers) fx.particles.burst(a.ax, 2, ZA, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        W.deurman.glitch = 0.8;
        movers.forEach((m, i) => { if (!m || S.st === 'end') return; const a = archers[i]; a.score = Math.max(0, a.score - 5); a.st = 'nock'; a.nockT = 1.4; a.tension = 0; say('KNAP! -5', a.ax, 5, '#ff7a7a', 1.6, ZA - 3); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.3); refreshHud(); });
      },
      celebrate(w) { for (const a of archers) { a.react = 0; a.bw.rig.visible = false; a.c.faceDir(0, 1); } archers[w].c.pose = 'cheer'; archers[1 - w].c.pose = 'sad'; W.cheerCrowd(6, 1); },
      dispose() {},
      dbg: {
        state: () => ({ T: T0, st: S.st, timeLeft, score: archers.map((a) => a.score), left: archers.map((a) => a.left), special: archers.map((a) => a.special), armed: archers.map((a) => a.armed), wind, finished,
          a: archers.map((a) => ({ st: a.st, tension: a.tension, bx: a.bx, by: a.by, aim: [...a.aim], breath: a.breath, shot: a.shot, lastPts: a.lastPts })), tg: T.map((t) => ({ x: t.x, y: t.y, hidden: t.hidden, smoke: t.smoke })), flying: arrows.filter((q) => q.on && q.st === 'fly').length, stats, balloons: balloons.filter((b) => b.on).length, ch: CH.on, dr: DR.on, pat: patName }),
        setTime: (t) => { timeLeft = t; }, setScore: (a, b) => { archers[0].score = a; archers[1].score = b; refreshHud(); },
        give: (i, k) => { archers[i].special = null; grantSpecial(archers[i], ''); archers[i].special = k; },
        spawnBalloon, forceChicken: () => { chickenT = 0; }, forceDragon: () => { dragonT = 0; }, forceDrop: () => { dropNext = gt; }, forceShout: () => { deurT = 0; },
        setPhase: (t) => { gt = t; }, archers, T, balloons, arrows,
      },
    };
  },
};

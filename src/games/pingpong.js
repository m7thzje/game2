import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';
import { PP, newEnv, newBall, stepBall, planShot, setTilt } from './pingpong_phys.js';
import { buildHall } from './pingpong_world.js';

// Tafeltennis-Tornado — duel: tafeltennis in de kasteel-Sporthal. Eerst 11 punten (of de meeste na 90 s; gelijk = gouden punt).
//  * richtingen = je batje over je helft bewegen (links/rechts = naar het net/weg, omhoog/omlaag = opzij), A = slag (timing bepaalt kracht en richting),
//    A + naar voren leunen = SMASH, A + naar achteren = chop, B = effectslag (zijwaarts = curve, naar voren = loop, anders = lob), B heeft een cooldown
//  * echte bal-natuurkunde: stuiter, wrijving, spin (Magnus), net, kantballen; rally's worden sneller; lange rally = gloeiende bal = VUURSMASH
//  * gimmicks: kantelende tafel, bumpers, wind, gouden bal (2 punten), de Deurman als lijnrechter die soms KIJKT (dan niet serveren!)
//  * comeback: wie 3 punten achterstaat krijgt een groter batje; gelijkspel na 90 s = gouden punt

const { L, W, TOP, NET, R } = PP;
const WIN = 11, MATCH_TIME = 90;
const HOME_U = 6.2, U_MIN = 1.7, U_MAX = L + 1.1, Z_MAX = W + 0.7;
const BAT_SPEED = 10.5;
const SWING_T = 0.36, SWEET = 0.14, B_CD = 2.6;
const HEAT_N = 5;
const SUB = 1 / 240;

export default {
  id: 'pingpong',
  name: 'Tafeltennis-Tornado',
  giver: 'Meester Gymnastiek',
  icon: '🏓',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Tafeltennis in de <b>Sporthal</b>! Eerst <b>11 punten</b> (of de meeste na 90 s). Naar voren leunen = <b>SMASH</b>, een lange rally = <b>vuurbal</b>. Pas op voor wind, een kantelende tafel en de <b>Deurman</b>. Gouden bal = 2 punten!',
  controls: ['{move} batje bewegen', '{a} slag (+ vooruit = SMASH)', '{b} effectslag (zijwaarts = curve)'],
  tip: 'Druk A net VOOR de bal bij je batje is. Achterstand = groter batje!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? ctx.twist.speed || 1 : 1;

    const Lg = ctx.lights('day', { shadow: 16, center: [0, 1, 0], fogNear: 40, fogFar: 95 });
    Lg.hemi.intensity = 1.25; Lg.hemi.color.set(0xeaf2ff); Lg.hemi.groundColor.set(0x9a7a58);
    Lg.sun.intensity = 1.5; Lg.sun.color.set(0xfff0d8); Lg.sun.position.set(-8, 22, 12);
    camera.fov = 46; camera.updateProjectionMatrix();
    const A = buildHall(ctx, Lg, players.map((p) => p.css));
    const env = newEnv(); env.grav = GRAV;
    const ball = newBall();
    const evs = [];

    // ---------------- bal ----------------
    const ballTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#fffdf4'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff8a1c'; g.fillRect(0, h * 0.4, w, h * 0.2); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.25, h * 0.5, 10, 0, TAU); g.fill(); });
    const ballM = new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, emissive: 0x000000 });
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 10), ballM); ballMesh.castShadow = true; scene.add(ballMesh);
    const glowM = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glow = new THREE.Sprite(glowM); glow.scale.set(2.2, 2.2, 1); scene.add(glow);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

    // ---------------- spelers ----------------
    const P = players.map((pp, i) => {
      const dir = i ? -1 : 1;
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); const k = 2.2 * lerp(1, pv.size(i), 0.35); holder.scale.setScalar(k);
      holder.position.set(-dir * (L + 2.1), 0, 0); scene.add(holder); c.faceDir(dir, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; c.armR.visible = false;
      // batje
      const bat = new THREE.Group(); scene.add(bat);
      const rub = new THREE.MeshStandardMaterial({ color: pp.color, roughness: 0.5 }), back = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.6 });
      bat.add(mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.07, 22), rub, { pos: [dir * 0.05, 0, 0], rot: [0, 0, Math.PI / 2] }), mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.07, 22), back, { pos: [-dir * 0.03, 0, 0], rot: [0, 0, Math.PI / 2] }));
      bat.add(mesh(new THREE.TorusGeometry(0.98, 0.04, 6, 24), mat(0xd8b070, { flatShading: false }), { cast: false, rot: [0, Math.PI / 2, 0] }));
      bat.add(mesh(new THREE.BoxGeometry(0.16, 0.75, 0.2), mat(0xc8964e, { flatShading: false }), { pos: [0, -1.25, 0] }));
      const sweet = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.1, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); sweet.rotation.y = Math.PI / 2; bat.add(sweet);
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); fire.scale.set(3.4, 3.4, 1); bat.add(fire);
      const shd = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })); shd.rotation.x = -Math.PI / 2; scene.add(shd);
      const arm = mesh(new THREE.CylinderGeometry(0.11, 0.09, 1, 7), new THREE.MeshStandardMaterial({ color: pp.color, roughness: 0.7 }), { cast: false }); scene.add(arm);
      const tagTex = canvasTex(256, 96, (g, w, h) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, h / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, h / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.4, 0.9, 1); tag.renderOrder = 15; scene.add(tag);
      return { i, dir, name: pp.name, col: pp.color, c, holder, k, bat, sweet, fire, shd, arm, rub, tag,
        u: HOME_U, z: 0, vu: 0, vz: 0, y: TOP + 1.3, scale: lerp(1, pv.size(i), 0.5), scaleT: 1, sizeK: lerp(1, pv.size(i), 0.5), big: false, swing: { t: -1, kind: 'A', used: false }, swCd: 0, bCd: 0, score: 0, frozen: 0, flash: 0, cheerT: 0,
        st: { smash: 0, fire: 0, curve: 0, lob: 0, loop: 0, edge: 0, net: 0, gold: 0, best: 0, aces: 0 } };
    });
    const batX = (p) => -p.dir * p.u;

    // ---------------- toestand ----------------
    let T = 0, introT = 0, finished = false, slow = 1, slowHold = 0, hitStop = 0, camPunch = 0, camX = 0;
    const G = { phase: 'serve', timeLeft: MATCH_TIME, timeUp: false, golden: false, server: Math.random() < 0.5 ? 0 : 1, firstServer: 0, points: 0, serveT: 0, pointT: 0, stare: 0, stareDid: false, endT: 0, winner: -1,
      rally: 0, maxRally: 0, goldBall: false, gameOver: false };
    G.firstServer = G.server;
    const Rl = { lastHitter: -1, contacts: [], stage: 'serve1', net: false, heat: 0, fire: false, stall: 0 };
    const stats = { events: [], rallies: 0, why: {} };
    const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), qq = new THREE.Quaternion(), YAX = new THREE.Vector3(0, 1, 0);
    const lead = (i) => P[1 - i].score - P[i].score;     // >0: i staat achter
    const serverOf = () => (G.firstServer + Math.floor(G.points / 2)) % 2;

    const timeTxt = () => { const s = Math.ceil(Math.max(0, G.timeLeft)); return G.golden ? 'GOUDEN PUNT' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    let sbNote = '';
    function refreshHud() {
      hud.setScore(`${names[0]} ${P[0].score} – ${P[1].score} ${names[1]}${G.golden ? '  (GOUDEN PUNT)' : ''}`);
      for (const p of P) hud.setPlayerInfo(p.i, `${p.score} pt${G.server === p.i && G.phase !== 'end' ? ' · serveert' : ''}${p.big ? ' · GROOT BATJE' : ''}${p.bCd > 0 ? ` · B ${Math.ceil(p.bCd)}s` : ' · B ✓'}`);
      A.drawScore(names, [P[0].score, P[1].score], G.server, sbNote, timeTxt());
    }
    let hudT = 0;

    // ---------------- serve ----------------
    function startServe() {
      G.phase = 'serve'; G.serveT = 0; G.server = serverOf(); G.goldBall = false; G.stareDid = false;
      Rl.lastHitter = -1; Rl.contacts.length = 0; Rl.stage = 'serve1'; Rl.net = false; Rl.heat = 0; Rl.fire = false; Rl.stall = 0; G.rally = 0;
      ball.vx = ball.vy = ball.vz = ball.wx = ball.wy = ball.wz = 0;
      const sp = P[G.server]; sp.u = HOME_U;
      // gouden bal? (vaker voor wie achterstaat)
      const k = lead(G.server) >= 2 ? 0.42 : lead(1 - G.server) >= 2 ? 0.1 : 0.2;
      G.goldBall = G.golden || Math.random() < k;
      if (G.goldBall) { hud.showBig(G.golden ? 'GOUD PUNT!' : '✨ GOUD x2!', 1200, '#ffd23f'); hud.toast(G.golden ? 'Gouden punt: wie scoort wint!' : 'Gouden bal: dit punt telt dubbel!', 1800); audio.sfx('powerup', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.5 }); }
      // de Deurman kijkt (soms)
      if (Math.random() < 0.3 && !G.timeUp) { G.stare = 2.2; A.judge.stare = 2.2; hud.toast('👁️ De Deurman KIJKT! Nog niet serveren...', 1900); audio.sfx('creak', { vol: 0.6 }); }
      refreshHud();
    }
    function doServe(p, auto = false) {
      const inp = pv.input(p.i); const fwd = inp.x * p.dir, lat = auto ? 0 : inp.y;
      ball.x = batX(p) + p.dir * 0.2; ball.y = TOP + 1.6; ball.z = p.z;
      const vx = (12.2 + 1.0 * clamp(fwd, 0, 1) - (auto ? 0.2 : 0)) * p.dir * (TEMPO > 1 ? 1.0 : 1);
      ball.vx = vx; ball.vy = 0; ball.vz = lat * 3.4 + (tw === 'drunk' ? (Math.random() - 0.5) * 2 : 0);
      ball.wx = 0; ball.wy = 0; ball.wz = -p.dir * 10; if (GRAV < 1) { ball.vx *= Math.sqrt(GRAV) * 1.05; }
      Rl.lastHitter = p.i; Rl.stage = 'serve1'; Rl.contacts.length = 0; G.phase = 'rally'; G.rally = 0;
      p.swing.t = 0; p.swing.used = true; p.swing.kind = 'A';
      audio.sfx('swing', { vol: 0.4, rate: 1.3 }); audio.sfx('tick', { vol: 0.6, rate: 1.4 });
    }

    // ---------------- slag ----------------
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;
    function tryHit(p, px) {
      if (G.phase !== 'rally' || Rl.lastHitter === p.i) return;
      const xb = batX(p);
      if (!((px - xb) * (ball.x - xb) <= 0) || ball.vx * p.dir >= 0) return;
      const RZ = 1.2 * p.scale, dz = ball.z - p.z;
      if (Math.abs(dz) > RZ + 0.1 || ball.y < TOP - 0.45 || ball.y > TOP + 3.9) { p.miss = true; return; }
      const sw = p.swing; const swinging = sw.t >= 0 && !sw.used && sw.t <= SWING_T;
      if (Rl.fire && !swinging) { // te heet voor een blokkade!
        p.flash = 1; fx.texts.add('AU! TE HEET!', ball.x, ball.y + 1.2, ball.z, '#ff9a4a', 1.2); audio.sfx('hurt', { vol: 0.5 }); fx.particles.burst(ball.x, ball.y, ball.z, { count: 20, speed: 5, up: 0.5, life: 0.6, size: 0.3, colors: [0xff7a1a, 0xffd23f], gravity: 3 }); return;
      }
      const inp = pv.input(p.i); const fwd = inp.x * p.dir, lat = inp.y;
      const dy = (ball.y - p.y) / 1.5; const dOff = clamp(Math.hypot(dz / RZ, dy), 0, 1);
      let type = 'block', q = 0.5;
      if (swinging) {
        sw.used = true; q = Math.max(0, 1 - Math.abs(sw.t - SWEET) / 0.18);
        if (sw.kind === 'A') type = fwd > 0.45 && ball.y > TOP + 0.5 && q > 0.28 ? 'smash' : fwd < -0.45 ? 'chop' : 'drive';
        else type = Math.abs(lat) > 0.45 ? 'curve' : fwd > 0.45 ? 'loop' : 'lob';
        if (q < 0.1) { type = 'block'; q = 0.35; }
      }
      q = clamp(q * (1 - 0.4 * dOff), 0, 1);
      shoot(p, type, q, dOff, lat, fwd, dz);
      return true;
    }
    function shoot(p, type, q, dOff, lat, fwd, dz) {
      const dir = p.dir; const heated = Rl.heat >= HEAT_N;
      const sx = (1 - q) * (type === 'smash' ? 2.0 : 1.5) + 0.1, sz = (1 - q) * 1.1 + 0.1 + dOff * 0.45;
      let Tf = 1.0, depth = 4.2, spinT = 40, spinY = 0, clear = 0.3, aimZ = true, zStart = null, zt = clamp(lat * (W - 0.7) - p.z * 0.1, -(W - 0.5), W - 0.5);
      switch (type) {
        case 'block': Tf = 1.12; depth = 3.3; spinT = -15; clear = 0.5; zt *= 0.4; break;
        case 'drive': Tf = lerp(1.05, 0.7, q) / TEMPO; depth = lerp(3.4, 5.5, 0.3 + q * 0.7) + clamp(fwd, 0, 1) * 0.5; spinT = 45; clear = lerp(-0.15, 0.4, q); break;
        case 'smash': Tf = lerp(0.56, 0.38, q) / TEMPO; depth = lerp(3.0, 6.0, q); spinT = 22; clear = lerp(-0.1, 0.12, q); p.st.smash++; break;
        case 'chop': Tf = 1.12; depth = 2.6 + (1 - q) * 0.5; spinT = -75; clear = 0.5; zt *= 0.6; break;
        case 'lob': Tf = 1.65; depth = 5.6; spinT = -35; clear = 1.2; zt *= 0.5; p.st.lob++; break;
        case 'loop': Tf = 0.82 / TEMPO; depth = 4.6; spinT = 130; clear = 0.45; p.st.loop++; break;
        case 'curve': Tf = 0.95 / TEMPO; depth = 4.2; spinT = 30; clear = 0.35; aimZ = false; p.st.curve++;
          { const side = lat >= 0 ? 1 : -1; zt = side * (W - 1.0) * (0.5 + 0.3 * q); zStart = zt - side * 2.6; spinY = -side * dir * 80; } break;
      }
      // rally-snelheid loopt op (na tijd/gouden punt nog sneller, zodat een rally altijd eindigt)
      const ramp = 1 + Math.min(0.6, 0.05 * G.rally) + (G.timeUp || G.golden ? 0.07 * Math.max(0, G.rally - 6) : 0); Tf /= ramp;
      let fire = false;
      if (type === 'smash' && heated && q > 0.28) { fire = true; Tf *= 0.7; spinT = 70; clear = 0.05; depth = Math.max(depth, 5.0); p.st.fire++; }
      const xt = dir * clamp(depth + gauss() * sx, 0.7, L + 1.9), zT = zt + gauss() * sz;
      if (GRAV < 1) { spinT *= 0.6; spinY *= 0.6; }
      const spin = [0, spinY, -dir * spinT];
      const r = planShot(ball.x, ball.y, ball.z, xt, zT, Tf, spin, GRAV, clear, aimZ, zStart == null ? zT : zStart + gauss() * 0.3);
      let [vx, vy, vz] = r.v;
      if (!isFinite(vx + vy + vz)) { vx = dir * 9; vy = 9; vz = 0; }
      const sp = Math.hypot(vx, vz); const MAXH = 36; if (sp > MAXH) { vx *= MAXH / sp; vz *= MAXH / sp; }
      ball.x = batX(p) + dir * 0.12; ball.vx = vx; ball.vy = vy; ball.vz = vz; ball.wx = 0; ball.wy = spinY; ball.wz = -dir * spinT;
      Rl.lastHitter = p.i; Rl.contacts.length = 0; Rl.stage = 'rally'; Rl.net = false; Rl.stall = 0;
      G.rally++; G.maxRally = Math.max(G.maxRally, G.rally); Rl.heat++;
      if (fire) { Rl.fire = true; Rl.heat = 0; }
      else if (Rl.fire) { Rl.fire = false; }
      effects(p, type, q, fire, Math.hypot(vx, vy, vz));
    }
    function effects(p, type, q, fire, spd) {
      const bx = ball.x, by = ball.y, bz = ball.z;
      p.flash = 1; p.c.swing(); p.swing.t = Math.max(p.swing.t, 0.001);
      const pitch = 0.9 + clamp(spd / 40, 0, 0.8);
      audio.sfx('tick', { vol: 0.5 + q * 0.4, rate: pitch * 1.2 }); audio.sfx('hit', { vol: 0.25 + q * 0.3, rate: pitch });
      fx.particles.burst(bx, by, bz, { count: 6 + Math.round(q * 8), speed: 2.5 + q * 3, up: 0.3, life: 0.35, size: 0.2, colors: [0xffffff, 0xfff1b0], gravity: 4 });
      if (q > 0.8 && type !== 'block') fx.texts.add('PERFECT!', bx, by + 1.0, bz, '#ffe14a', 1.0);
      if (type === 'smash') { ctx.shake(0.28); audio.sfx('whoosh', { vol: 0.5, rate: 0.9 }); camPunch = 0.6; if (!fire) fx.texts.add('SMASH!', bx, by + 1.1, bz, '#ffb04a', 1.3); }
      if (type === 'curve') fx.texts.add('CURVE!', bx, by + 1.0, bz, '#9fd0ff', 1.0);
      if (type === 'loop') fx.texts.add('LOOP!', bx, by + 1.0, bz, '#d9a8ff', 1.0);
      if (type === 'lob') fx.texts.add('LOB!', bx, by + 1.0, bz, '#a8ffb0', 1.0);
      if (fire) { ctx.shake(0.7); hitStop = 0.14; slow = 0.4; slowHold = 0.25; camPunch = 1; audio.sfx('explode', { vol: 0.5 }); audio.sfx('sizzle', { vol: 0.5 });
        fx.texts.add('VUURSMASH!', bx, by + 1.4, bz, '#ff7a2a', 1.8); fx.particles.burst(bx, by, bz, { count: 50, speed: 7, up: 0.5, life: 0.9, size: 0.45, colors: [0xff5a1a, 0xffb02a, 0xffe14a], gravity: -2 }); A.cheer(1.6); }
      else if (Rl.heat === HEAT_N) { fx.texts.add('DE BAL GLOEIT!', bx, by + 1.3, bz, '#ff9a4a', 1.3); hud.toast('🔥 De bal gloeit! Volgende SMASH = VUUR!', 1800); audio.sfx('sizzle', { vol: 0.4 }); }
      if (G.rally === 8) { fx.texts.add('8 IN EEN RIJ!', 0, TOP + 4, 0, '#ffe14a', 1.4); A.cheer(1.2); }
    }

    // ---------------- punten ----------------
    function awardPoint(w, why) {
      if (G.phase !== 'rally') return; G.phase = 'point'; G.pointT = 0;
      stats.why[why] = (stats.why[why] || 0) + 1;
      const pts = G.goldBall ? 2 : 1; P[w].score += pts; G.points++; stats.rallies++;
      slow = 0.35; slowHold = 0.35; ctx.shake(0.35);
      const l = 1 - w; P[w].c.pose = 'cheer'; P[l].c.pose = 'sad'; P[w].cheerT = 1.4; if (G.goldBall) P[w].st.gold += 2;
      P[w].st.best = Math.max(P[w].st.best, G.rally);
      const col = w ? '#8fb8ff' : '#7dffb0';
      hud.showBig(`${G.goldBall ? '+2 ' : ''}${names[w]}!`, 900, col);
      fx.texts.add(why, ball.x, TOP + 2.2, clamp(ball.z, -4, 4), col, 1.3);
      audio.sfx(w === G.server ? 'ding' : 'good', { vol: 0.8 }); audio.sfx('win', { vol: 0.3 }); A.cheer(1.8);
      fx.particles.burst(clamp(ball.x, -L, L), TOP + 0.5, clamp(ball.z, -W, W), { count: 30, speed: 5, up: 1, life: 0.9, size: 0.4, colors: G.goldBall ? [0xffd23f, 0xfff0a0] : [0xffffff, w ? 0x6aa0ff : 0x6aff9a], gravity: 6 });
      sbNote = `${why}${G.rally > 3 ? ` · rally ${G.rally}` : ''}`; refreshHud();
    }
    function lose(i, why) { awardPoint(1 - i, why); }
    function onBounce(e) {
      const s = e.side, hitter = Rl.lastHitter;
      audio.sfx('tick', { vol: clamp(e.vn / 18, 0.15, 0.55), rate: 0.8 + Math.random() * 0.15 });
      fx.particles.burst(e.x, TOP + 0.1, e.z, { count: 3, speed: 1.2, up: 0.5, life: 0.25, size: 0.16, colors: [0xffffff], gravity: 5 });
      if (e.edge) { P[hitter < 0 ? 0 : hitter].st.edge++; fx.texts.add('KANT!', e.x, TOP + 1.0, e.z, '#fff', 1.0); audio.sfx('ding', { vol: 0.5, rate: 1.5 }); }
      if (Rl.stage === 'serve1') { if (s !== hitter) return lose(hitter, 'SERVICE TE LANG'); Rl.stage = 'serve2'; Rl.contacts.push(s); return; }
      if (Rl.stage === 'serve2') { if (s === hitter) return lose(hitter, 'SERVICE FOUT'); Rl.stage = 'rally'; Rl.contacts.push(s); return; }
      Rl.contacts.push(s);
      if (Rl.contacts.length === 1) { if (s === hitter) return lose(hitter, 'OP EIGEN HELFT'); }
      else if (s !== hitter) return awardPoint(hitter, 'TWEE KEER GESTUITERD');
      else return lose(hitter, 'OP EIGEN HELFT');
    }
    function onDead() {
      const hitter = Rl.lastHitter;
      if (hitter < 0) return lose(G.server, 'MIS');
      if (Rl.stage !== 'rally') return lose(hitter, Rl.net ? 'SERVICE IN HET NET' : 'SERVICE FOUT');
      if (Rl.contacts.length === 0) { P[hitter].st.net += Rl.net ? 1 : 0; return lose(hitter, Rl.net ? 'IN HET NET' : 'BUITEN DE TAFEL'); }
      awardPoint(hitter, 'NIET TERUGGESLAGEN');
    }

    // ---------------- gimmicks ----------------
    const EVENTS = ['tilt', 'bumpers', 'wind'];
    let ev = null, evGap = 9, lastEv = '', tiltCur = 0, tiltT = 0;
    const bumpers = [[3.3, 1.7], [3.3, -1.7], [-3.3, 1.7], [-3.3, -1.7]].map(([x, z], i) => ({ x, z, r: 0.55, on: false, k: 0, hit: 0, i }));
    env.bumpers = bumpers;
    function startEvent(id) {
      id = id || pick(EVENTS.filter((e) => e !== lastEv)); lastEv = id; stats.events.push(id);
      ev = { id, t: 0, dur: id === 'tilt' ? 8 : id === 'bumpers' ? 9 : 8, dir: Math.random() < 0.5 ? -1 : 1, ax: Math.random() < 0.5 ? 'z' : 'x' };
      const txt = { tilt: '🌀 De tafel KANTELT!', bumpers: '🍄 BUMPERS op tafel!', wind: `💨 WIND uit het ${ev.ax === 'z' ? (ev.dir > 0 ? 'zuiden' : 'noorden') : (ev.dir > 0 ? 'oosten' : 'westen')}!` }[id];
      hud.toast(txt, 2200); audio.sfx(id === 'tilt' ? 'creak' : id === 'bumpers' ? 'boing' : 'whoosh', { vol: 0.6 });
      if (id === 'bumpers') bumpers.forEach((b) => { b.on = true; b.k = 0; });
    }
    function updateEvent(dt) {
      let tilt = 0, wx = 0, wz = 0;
      if (ev) {
        ev.t += dt; const env_ = smoothstep(0, 1.0, ev.t) * smoothstep(0, 1.0, ev.dur - ev.t);
        if (ev.id === 'tilt') tilt = 0.17 * env_ * ev.dir * (0.8 + 0.2 * Math.sin(ev.t * 1.7));
        else if (ev.id === 'wind') { const m = 9 * env_ * ev.dir; if (ev.ax === 'z') wz = m; else wx = m * 0.8; }
        else if (ev.id === 'bumpers') { if (ev.t > ev.dur - 0.9) bumpers.forEach((b) => { b.off = true; }); }
        if (ev.t >= ev.dur) { ev = null; evGap = rand(10, 15); bumpers.forEach((b) => { b.on = false; b.off = false; b.k = 0; }); }
      } else { evGap -= dt; if (evGap <= 0 && (G.phase === 'rally' || G.phase === 'serve') && !G.timeUp) startEvent(); }
      tiltCur = damp(tiltCur, tilt, 5, dt); setTilt(env, tiltCur); A.tableG.rotation.x = tiltCur;
      env.windX = wx; env.windZ = wz;
      A.bumpers.forEach((g, i) => { const b = bumpers[i]; b.k = clamp(b.k + (b.on && !b.off ? dt * 3.5 : -dt * 4), 0, 1); b.hit = Math.max(0, b.hit - dt * 5); g.visible = b.k > 0.01; g.position.set(b.x, 0, b.z); g.scale.set(1 + b.hit * 0.3, Math.max(0.01, b.k) * (1 + b.hit * 0.25), 1 + b.hit * 0.3); });
    }

    // ---------------- spelers bewegen ----------------
    function control(p, dt) {
      const inp = pv.input(p.i);
      const sp = pv.speed(p.i) * BAT_SPEED * (G.phase === 'end' ? 0 : 1);
      const lam = lerp(16, 2.2, SLIP);
      if (p.frozen > 0) p.frozen -= dt;
      const fwd = p.frozen > 0 ? 0 : inp.x * p.dir, lat = p.frozen > 0 ? 0 : inp.y;
      const serving = G.phase === 'serve' && G.server === p.i;
      p.vu = damp(p.vu, -fwd * sp * (serving ? 0 : 1), lam, dt); p.vz = damp(p.vz, lat * sp, lam, dt);
      p.u = clamp(p.u + p.vu * dt, U_MIN, U_MAX); p.z = clamp(p.z + p.vz * dt, -Z_MAX, Z_MAX);
      // groot batje voor wie 3+ achterstaat
      p.big = lead(p.i) >= 3; p.scaleT = (p.big ? 1.35 : 1) * p.sizeK; p.scale = damp(p.scale, p.scaleT, 4, dt);
      if (p.big && !p.toldBig) { p.toldBig = true; fx.texts.add('GROTER BATJE!', batX(p), TOP + 3.2, p.z, '#ffd23f', 1.4); hud.toast(`${p.name} krijgt een groter batje!`, 1700); audio.sfx('powerup', { vol: 0.5 }); }
      if (!p.big) p.toldBig = false;
      // slag starten
      p.swCd = Math.max(0, p.swCd - dt); p.bCd = Math.max(0, p.bCd - dt * (1 + 0.5 * clamp(lead(p.i) / 4, 0, 1)));
      const sw = p.swing;
      if (sw.t >= 0) { sw.t += dt; if (sw.t > SWING_T + 0.05) { sw.t = -1; p.swCd = 0.1; } }
      const canSwing = sw.t < 0 && p.swCd <= 0 && p.frozen <= 0 && G.phase !== 'end' && G.phase !== 'point';
      if (canSwing && inp.aP && !(serving)) { sw.t = 0; sw.kind = 'A'; sw.used = false; audio.sfx('swing', { vol: 0.25, rate: 1.4 }); }
      else if (canSwing && inp.bP && p.bCd <= 0 && !serving) { sw.t = 0; sw.kind = 'B'; sw.used = false; p.bCd = B_CD; audio.sfx('swing', { vol: 0.3, rate: 0.9 }); }
      if (serving && p.frozen <= 0) {
        if (inp.aP || (G.serveT > 6.5 + (G.stare > 0 ? 2.5 : 0))) {
          if (G.stare > 0 && inp.aP) { // gestraft door de Deurman
            hud.showBig('FOUT!', 1000, '#ff8a8a'); audio.sfx('static', { vol: 0.5 }); G.phase = 'rally'; Rl.lastHitter = p.i; ball.x = batX(p); ball.y = TOP + 1.5; ball.z = p.z; ball.vx = ball.vy = ball.vz = 0; lose(p.i, 'DE DEURMAN KEEK!'); return;
          }
          if (G.stare <= 0 || !inp.aP) doServe(p, !inp.aP);
        }
      }
      // batje-hoogte: volgt de bal (magneet) als die eraan komt
      let ty = TOP + 1.3;
      if (G.phase === 'rally' && Rl.lastHitter !== p.i && ball.vx * p.dir < 0 && Math.abs(ball.x - batX(p)) < 5) ty = clamp(ball.y, TOP + 0.35, TOP + 2.6);
      p.y = damp(p.y, ty, 14, dt);
    }

    // ---------------- hoofdlus ----------------
    function updateBall(sdt) {
      const steps = Math.min(24, Math.max(1, Math.ceil(sdt / SUB))); const h = sdt / steps;
      for (let s = 0; s < steps; s++) {
        const px = ball.x; evs.length = 0;
        stepBall(ball, h, env, evs);
        if (G.phase === 'rally') for (const p of P) tryHit(p, px);
        for (const e of evs) {
          if (G.phase !== 'rally') break;
          if (e.t === 'bounce') onBounce(e);
          else if (e.t === 'net') { Rl.net = true; audio.sfx('thud', { vol: 0.4, rate: 1.4 }); fx.texts.add('NET!', 0, TOP + NET + 0.9, clamp(ball.z, -W, W), '#e8e8f8', 1.0); }
          else if (e.t === 'bumper') { const b = bumpers[e.i]; b.hit = 1; audio.sfx('boing', { vol: 0.5, rate: 1.0 + Math.random() * 0.4 }); fx.particles.burst(e.x, e.y, e.z, { count: 10, speed: 4, up: 0.5, life: 0.45, size: 0.25, colors: [0xff5a7a, 0xffd23f], gravity: 4 }); ctx.shake(0.12); }
          else if (e.t === 'floor' || e.t === 'out') onDead();
        }
        if (G.phase !== 'rally') break;
      }
      // sloffende bal op tafel? dan is de rally dood
      if (G.phase === 'rally' && Math.hypot(ball.vx, ball.vz) < 1.2 && ball.y < TOP + 0.6) { Rl.stall += sdt; if (Rl.stall > 1.2) onDead(); } else Rl.stall = 0;
    }
    function visuals(dt, tt) {
      // bal
      ballMesh.position.set(ball.x, ball.y, ball.z);
      const w = Math.hypot(ball.wx, ball.wy, ball.wz);
      if (w > 0.01) { v3.set(ball.wx, ball.wy, ball.wz).multiplyScalar(1 / w); ballMesh.rotateOnWorldAxis(v3, w * dt * 0.35); }
      const heat = Rl.fire ? 1 : clamp(Rl.heat / HEAT_N, 0, 1) * (Rl.heat >= HEAT_N ? 1 : 0.35);
      ballM.emissive.set(G.goldBall ? 0xffb800 : 0xff4a00); ballM.emissiveIntensity = G.goldBall ? 0.9 : heat * 1.1; ballM.color.set(G.goldBall ? 0xffe27a : 0xffffff);
      glow.position.copy(ballMesh.position); glow.material.opacity = (Rl.fire ? 0.95 : Rl.heat >= HEAT_N ? 0.55 + Math.sin(tt * 12) * 0.2 : 0) + (G.goldBall ? 0.5 : 0); glow.material.color.set(G.goldBall && !Rl.fire ? 0xffd23f : 0xff6a1a);
      glow.scale.setScalar(Rl.fire ? 2.6 : 1.8);
      const onT = Math.abs(ball.x) < L + 0.4 && Math.abs(ball.z) < W + 0.4;
      shadow.position.set(ball.x, (onT ? TOP - ball.z * Math.tan(tiltCur) : 0) + 0.03, ball.z); const hh = Math.max(0, ball.y - (onT ? TOP : 0)); shadow.scale.setScalar(clamp(1.2 - hh * 0.06, 0.4, 1.2)); shadow.material.opacity = clamp(0.5 - hh * 0.04, 0.12, 0.5); shadow.visible = ball.y > 0.1;
      // spoor
      const spd = Math.hypot(ball.vx, ball.vy, ball.vz);
      if (G.phase === 'rally' && spd > 8) {
        if (Rl.fire) fx.particles.emit(ball.x, ball.y, ball.z, rand(-0.5, 0.5), rand(0.5, 2), rand(-0.5, 0.5), { life: 0.5, size: 0.4, color: pick([0xff5a1a, 0xffb02a, 0xffe14a]), gravity: -3 });
        else if (G.goldBall) fx.particles.emit(ball.x, ball.y, ball.z, rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6), { life: 0.5, size: 0.22, color: pick([0xffd23f, 0xfff0a0]), gravity: 1 });
        else if (spd > 16 && Math.random() < 0.6) fx.particles.emit(ball.x, ball.y, ball.z, 0, 0, 0, { life: 0.2, size: 0.13, color: 0xffffff, gravity: 0 });
      }
      for (const p of P) {
        p.flash = Math.max(0, p.flash - dt * 4);
        const sw = p.swing; const k = sw.t >= 0 ? clamp(sw.t / SWING_T, 0, 1) : 0, lunge = Math.sin(k * Math.PI);
        // batje (wereld)
        const bx = batX(p) + p.dir * lunge * 0.55, by = p.y, bz = p.z;
        p.bat.position.set(bx, by, bz); p.bat.rotation.set(0, 0, -p.dir * lunge * 0.7); const sc = p.scale; p.bat.scale.setScalar(sc);
        // sweet-spot-ring licht op in het ideale slagmoment
        const sweetOn = sw.t >= 0 && !sw.used ? 1 - clamp(Math.abs(sw.t - SWEET) / 0.1, 0, 1) : 0;
        p.sweet.material.opacity = sweetOn * 0.9; p.fire.material.opacity = (Rl.fire ? 0 : (Rl.heat >= HEAT_N ? 0.4 + Math.sin(tt * 10) * 0.15 : 0)) + p.flash * 0.5;
        p.rub.emissive.set(p.flash > 0.3 ? 0xffffff : 0x000000); p.rub.emissiveIntensity = p.flash * 0.6;
        p.shd.position.set(bx, 0.03, bz); p.shd.scale.setScalar(sc);
        // poppetje staat achter de tafel en schuift mee
        const hx = -p.dir * (L + 2.1);
        p.holder.position.x = hx; p.holder.position.z = damp(p.holder.position.z, p.z, 10, dt);
        p.c.faceDir(p.dir, 0); p.c.pose = p.c.pose === 'cheer' || p.c.pose === 'sad' ? p.c.pose : 'idle'; p.c.speed = Math.min(1, Math.abs(p.vz) / 8); p.c.update(dt);
        // rubberen arm
        p.c.armR.getWorldPosition(v3); v3b.set(bx, by - 1.0 * sc, bz);
        const dx = v3b.x - v3.x, dy = v3b.y - v3.y, dz = v3b.z - v3.z; const len = Math.max(0.01, Math.hypot(dx, dy, dz));
        p.arm.position.set(v3.x + dx / 2, v3.y + dy / 2, v3.z + dz / 2); p.arm.scale.set(1, len, 1); qq.setFromUnitVectors(YAX, v3.set(dx / len, dy / len, dz / len)); p.arm.quaternion.copy(qq);
        p.tag.position.set(hx, p.k * 1.84 + 0.8, p.holder.position.z);
      }
    }
    function updateCamera(dt) {
      camPunch = Math.max(0, camPunch - dt * 2.2);
      const t = T + introT;
      camera.position.set(Math.sin(t * 0.25) * 0.5 + camX, 11.2 - camPunch * 0.3, 15.2 - camPunch * 0.9);
      camera.lookAt(0, 1.5, 0.9);
    }

    function finishMatch(winner) {
      if (finished) return; finished = true;
      const W_ = P[winner], L_ = P[1 - winner];
      const jokes = [`${W_.name} tornado't over de tafel! ${L_.name} zoekt nog naar de bal.`, `Het publiek in de Sporthal gaat los voor ${W_.name}. ${L_.name} is duizelig van het rennen.`, `${W_.name} wint de Tafeltennis-Tornado! De Deurman klapte stiekem mee.`, `${L_.name} sloeg de bal naar de Deurman. Dat telt niet als punt, ${W_.name} wel.`];
      const bits = [];
      if (G.maxRally >= 6) bits.push(`langste rally: ${G.maxRally}`); const sm = P[0].st.smash + P[1].st.smash; if (sm) bits.push(`${sm} smashes`); const fr = P[0].st.fire + P[1].st.fire; if (fr) bits.push(`${fr}x vuursmash`);
      ctx.finishPvp({ winner, score: [P[0].score, P[1].score], delay: 900, summary: `${pick(jokes)}${G.golden ? ' Beslist met een gouden punt!' : ''}${bits.length ? ` (${bits.join(', ')})` : ''}` });
    }
    function endMatch(w) {
      G.phase = 'end'; G.winner = w; G.endT = 0; hud.setTimer(null); slow = Math.min(slow, 0.5); slowHold = 0.6;
      hud.showBig(`${names[w]} WINT!`, 1700, w ? '#8fb8ff' : '#7dffb0'); audio.sfx('bell', { vol: 1 }); ctx.shake(0.5); A.cheer(8);
      P[w].c.pose = 'cheer'; P[1 - w].c.pose = 'sad';
      fx.particles.burst(0, TOP + 3, 0, { count: 90, speed: 9, up: 1.2, life: 1.6, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
    }
    function afterPoint() {
      for (const p of P) { p.c.pose = 'idle'; p.swing.t = -1; }
      if (P[0].score >= WIN || P[1].score >= WIN) return endMatch(P[0].score > P[1].score ? 0 : 1);
      if (G.golden) return endMatch(P[0].score > P[1].score ? 0 : 1);
      if (G.timeUp) {
        if (P[0].score !== P[1].score) { hud.showBig('TIJD!', 900, '#ffd23f'); audio.sfx('bell', { vol: 0.9 }); return endMatch(P[0].score > P[1].score ? 0 : 1); }
        G.timeUp = false; G.golden = true; hud.setTimer(null); hud.showBig('GELIJK!', 1300, '#ffd23f'); hud.toast('Het volgende punt wint de wedstrijd', 2200); audio.sfx('bell', { vol: 0.9 });
      }
      startServe();
    }

    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      T += dt;
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3, dt);
      let sdt = dt * slow; if (hitStop > 0) { hitStop -= dt; sdt = 0; }
      // klok
      if (G.phase !== 'end' && !G.timeUp && !G.golden) {
        G.timeLeft -= dt; hud.setTimer(Math.max(0, G.timeLeft), 10);
        if (G.timeLeft <= 0) { G.timeUp = true; hud.showBig('TIJD!', 900, '#ffd23f'); audio.sfx('bell', { vol: 0.8 }); }
      }
      if (G.stare > 0) { G.stare -= sdt; if (G.stare <= 0) { A.judge.stare = 0; } }
      for (const p of P) control(p, sdt);
      updateEvent(sdt);
      if (G.phase === 'serve') {
        G.serveT += sdt; const sp = P[G.server];
        if (G.timeUp) { /* tijd om, geen lopende rally: direct beslissen */ afterPoint(); }
        ball.x = batX(sp) + sp.dir * 0.2; ball.y = TOP + 1.45 + Math.sin(T * 5) * 0.06; ball.z = sp.z; ball.vx = ball.vy = ball.vz = 0;
      } else if (G.phase === 'rally') updateBall(sdt);
      else if (G.phase === 'point') { G.pointT += dt; updateBall(sdt * 0.5); if (G.pointT > 1.15) afterPoint(); }
      else if (G.phase === 'end') { G.endT += dt; if (G.endT > 2.3) finishMatch(G.winner); updateBall(sdt * 0.4); }
      visuals(sdt, T + introT);
      A.update(T + introT, dt, env.windX, env.windZ); A.judge.update(T + introT, dt, ball);
      updateCamera(dt);
      hudT -= dt; if (hudT <= 0) { hudT = 0.3; refreshHud(); }
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const p of P) p.c.update(dt); A.update(T + introT, dt, 0, 0); A.judge.update(T + introT, dt, ball); updateCamera(dt); }
    function introUpdate(dt) {
      introT += dt; const sp = P[G.server]; ball.x = batX(sp) + sp.dir * 0.2; ball.y = TOP + 1.45 + Math.sin(introT * 5) * 0.06; ball.z = sp.z;
      for (const p of P) p.z = Math.sin(introT * 1.3 + p.i * 2) * 1.2;
      visuals(dt, introT); A.update(introT, dt, 0, 0); A.judge.update(introT, dt, ball); updateCamera(dt);
    }
    refreshHud(); visuals(0.016, 0); updateCamera(0.016);

    return {
      update, resultUpdate, introUpdate,
      onStart() { startServe(); },
      onSwap() { for (const p of P) fx.particles.burst(batX(p), TOP + 1.5, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = P[i]; p.frozen = 1.6; if (p.score > 0) p.score--; fx.texts.add('DEURMAN: -1', batX(p), TOP + 3.4, p.z, '#ff8a8a', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
        refreshHud();
      },
      celebrate(w) { P[w].c.pose = 'cheer'; P[1 - w].c.pose = 'sad'; A.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, phase: G.phase, timeLeft: G.timeLeft, timeUp: G.timeUp, golden: G.golden, server: G.server, score: P.map((p) => p.score), finished, goldBall: G.goldBall, stare: G.stare, rally: G.rally, maxRally: G.maxRally,
          ball: { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz }, lastHitter: Rl.lastHitter, stage: Rl.stage, heat: Rl.heat, fire: Rl.fire, tilt: tiltCur, wind: [env.windX, env.windZ], ev: ev ? ev.id : null, evs: stats.events.slice(), bumpers: bumpers.filter((b) => b.on).length,
          p: P.map((p) => ({ u: p.u, z: p.z, y: p.y, swing: p.swing.t, bCd: p.bCd, scale: p.scale, dir: p.dir, st: { ...p.st }, frozen: p.frozen })), points: G.points, why: { ...stats.why } }),
        // voorspelling voor bots: waar/wanneer kruist de bal het vlak van mijn batje?
        predict: (i) => { const p = P[i]; const b = { ...ball }; const e2 = { ...env, bumpers: [] }; const xb = batX(p); const ev2 = []; let t = 0;
          for (; t < 3; t += SUB) { const px = b.x; ev2.length = 0; stepBall(b, SUB, e2, ev2); if ((px - xb) * (b.x - xb) <= 0 && b.vx * p.dir < 0) return { t, z: b.z, y: b.y, vx: b.vx }; if (ev2.some((q) => q.t === 'floor' || q.t === 'out' || q.t === 'net')) break; } return null; },
        setScore: (a, b) => { P[0].score = a; P[1].score = b; refreshHud(); },
        setTime: (t) => { G.timeLeft = t; },
        startEvent: (id) => startEvent(id), startServe, G, P, ball, env, Rl,
        setGoldBall: (v) => { G.goldBall = v; },
        setHeat: (n) => { Rl.heat = n; },
      },
    };
  },
};

function glowTexture() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

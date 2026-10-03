import * as THREE from 'three';
import { mat, mesh, clamp, lerp, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildArena, TRI, NORM, TANG, VERT, planes } from './driehoek_world.js';

// Driehoek-Hockey — party-spel voor 3 (Wes, Jor en Juul tegelijk, vrij voor allen).
//  * driehoekige ijsarena, ieder verdedigt het doel in zijn eigen muur (links = slot 0, onder = slot 1, rechts = slot 2)
//  * richtingen = je schijf bewegen (alleen in een strook langs je eigen muur), A = SMASH (uitval naar voren), B = MAGNEET (puck vangen, richting kiezen, loslaten = schieten)
//  * goal tegen = een hartje kwijt (3 levens); wie 0 heeft is een geest: zijn doel gaat dicht, zijn schijf blijft meespelen
//  * gimmicks: bumper-kristallen, tweede puck, turbo-kristal, de Deurman sluit uit medelijden het doel van wie het zwaarst heeft
//  * comeback: wie minder hartjes heeft dan de leider krijgt een grotere schijf en snellere cooldowns; na een goal gaat de puck naar de leider
const TIME = 90, OT_MAX = 20, LIVES = 3;
const PUCK_R = 0.8, RP = 1.55;
const STRIP_U = 7.4, W_MIN = 1.95, W_MAX = 4.6, LUNGE_MAX = 4.3;
const PAD_SPEED = 17, VMAX = 29, MAGR = 5.2;
const PLN = planes();

function drawTag(p, lives) {
  const t = p.tagTex, c = t.image.getContext('2d'); c.clearRect(0, 0, 256, 128);
  c.font = 'bold 54px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = 11; c.strokeStyle = 'rgba(8,12,34,.9)'; c.strokeText(p.pp.name, 128, 36); c.fillStyle = p.pp.css; c.fillText(p.pp.name, 128, 36);
  c.font = '44px Arial'; const hs = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, LIVES - lives));
  c.lineWidth = 9; c.strokeStyle = 'rgba(8,12,34,.9)'; c.strokeText(hs, 128, 92); c.fillStyle = lives > 0 ? '#ff5a78' : '#8a8aa8'; c.fillText(hs, 128, 92);
  t.needsUpdate = true;
}

export default {
  id: 'driehoek',
  name: 'Driehoek-Hockey',
  giver: 'IJskoningin Ina',
  icon: '🔺',
  mode: 'pvp',
  players: [3],
  time: TIME,
  music: 'game_fast',
  blurb: 'Hockey op <b>driehoekig ijs</b> met <b>drie doelen</b>! Een goal tegen kost een <b>hartje</b> (je hebt er 3). Wie als laatste hartjes heeft, wint.',
  controls: ['{move} schijf bewegen', '{a} SMASH (uitval)', '{b} MAGNEET (vasthouden = vangen)'],
  tip: 'Vang de puck, stuur een kant op, laat los en schiet op de zwakste!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, n = players.length, names = players.map((p) => p.name);
    const tw = ctx.twist.id, GRV = pv.gravity || 1, SLIP = pv.slip || 0;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? ctx.twist.speed : 1;
    const PT = 1 + (TEMPO - 1) * 0.55, PUCK_V = VMAX * (GRV < 1 ? 0.88 : 1) * (TEMPO > 1 ? 1.1 : 1);
    const L = ctx.lights('ice', { shadow: 24, center: [0, 0, 0], fogNear: 70, fogFar: 170 });
    L.sun.color.set(0xcfe0ff); L.sun.intensity = 1.5; L.sun.position.set(-10, 34, 16); L.hemi.color.set(0x9ec4ff); L.hemi.groundColor.set(0x2a3a70); L.hemi.intensity = 1.2;
    camera.fov = 48; camera.updateProjectionMatrix();
    const colors = players.map((p) => p.color), css = players.map((p) => p.css), rgba = css.map((c) => { const k = parseInt(c.slice(1), 16); return `rgba(${(k >> 16) & 255},${(k >> 8) & 255},${k & 255},1)`; });
    const A = buildArena(ctx, rgba, colors);

    // ---------------- pucks ----------------
    const pucks = Array.from({ length: 3 }, () => {
      const g = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(1, 1, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x1c2c5c, roughness: 0.35, metalness: 0.3 }), { pos: [0, 0.25, 0] });
      const rimM = new THREE.MeshStandardMaterial({ color: 0x58d6ff, emissive: 0x58d6ff, emissiveIntensity: 0.9 });
      const rim = mesh(new THREE.TorusGeometry(0.98, 0.12, 6, 24), rimM, { cast: false, pos: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0] });
      const top = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xcfeaff, emissive: 0x58a8e8, emissiveIntensity: 0.5 }), { cast: false, pos: [0, 0.52, 0] });
      const fire = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.7, 24), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); fire.rotation.x = -Math.PI / 2; fire.position.y = 0.05;
      g.add(body, rim, top, fire); g.scale.setScalar(PUCK_R); g.visible = false; scene.add(g);
      const shadow = P.shadowBlob(1.2); shadow.visible = false; scene.add(shadow);
      return { on: false, g, rimM, fire, shadow, x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, r: PUCK_R, last: -1, stuck: -1, scored: -1, turbo: 0, life: 0, drop: false, slowT: 0, bob: Math.random() * 6, noHit: -1, noHitT: 0, kind: 'main' };
    });

    // ---------------- spelers ----------------
    const pads = players.map((pp, i) => {
      const [nx, nz] = NORM[i], [tx, tz] = TANG[i];
      const g = new THREE.Group();
      const baseM = new THREE.MeshStandardMaterial({ color: pp.color, roughness: 0.3, metalness: 0.35, transparent: true });
      const whiteM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4, transparent: true });
      const base = mesh(new THREE.CylinderGeometry(1, 1.06, 0.45, 28), baseM, { pos: [0, 0.22, 0] });
      const topRing = mesh(new THREE.TorusGeometry(0.88, 0.09, 6, 26), whiteM, { cast: false, pos: [0, 0.45, 0], rot: [Math.PI / 2, 0, 0] });
      const stem = mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.5, 14), baseM, { pos: [0, 0.7, 0] });
      const ball = mesh(new THREE.SphereGeometry(0.42, 14, 10), baseM, { pos: [0, 1.1, 0] });
      g.add(base, topRing, stem, ball); scene.add(g);
      const mring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); mring.rotation.x = -Math.PI / 2; mring.position.y = 0.08; scene.add(mring);
      const aim = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.35), new THREE.MeshBasicMaterial({ map: canvasTex(64, 16, (c, w, h) => { c.fillStyle = 'rgba(255,255,255,.95)'; for (let k = 0; k < 4; k++) c.fillRect(k * 16 + 2, 4, 9, 8); }), transparent: true, depthWrite: false })); aim.rotation.x = -Math.PI / 2; aim.visible = false; scene.add(aim);
      const shadow = P.shadowBlob(1.6); scene.add(shadow);
      // avatar achter het doel
      const c = makeBrother(i); const kS = 4.2 / c.height; const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(kS);
      const gp = A.goals[i].avatarPos; holder.position.set(gp[0], gp[1], gp[2]); scene.add(holder);
      c.faceDir(-nx, -nz); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const tagTex = canvasTex(256, 128, () => {}); const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(3.4, 1.7, 1); tag.renderOrder = 15; tag.position.set(gp[0], 6.6, gp[2]); scene.add(tag);
      const p = { i, pp, nx, nz, tx, tz, g, baseM, whiteM, base, ball, mring, aim, shadow, c, holder, tagTex, lives: LIVES, goalsFor: 0, goalsAgainst: 0, u: 0, w: 4.2, L: 0, lst: 'idle', lcd: 0.8, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, wvx: 0, wvz: 0, R: RP, R0: RP, mag: { on: false, t: 0, cd: 0, caught: null, ang: 0 }, frozen: 0, elim: false, smashT: 0, sq: 0, hits: 0, smashes: 0, catches: 0 };
      drawTag(p, LIVES);
      return p;
    });
    const padPos = (p) => { const we = p.w + p.L; p.x = p.nx * (TRI.a - we) + p.tx * p.u; p.z = p.nz * (TRI.a - we) + p.tz * p.u; };
    pads.forEach((p) => { padPos(p); p.px = p.x; p.pz = p.z; });

    // ---------------- toestand ----------------
    let T = 0, clock = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0, gt = 0, otT = 0, overtime = false;
    const G = { state: 'init', t: 0, serveTo: 1, lastConceder: -1, end: false, winner: -1 };
    const door = [0, 0, 0], doorT = [0, 0, 0], doorTarget = [0, 0, 0];   // 0 open .. 1 dicht
    const blockK = [0, 0, 0];
    const ev = { bump: false, bumpK: 0, boost: 0, puck2: 0, doors: 0, boostPos: null, boostT: 0, p2End: 0 };
    const stats = { smashes: 0, catches: 0, shots: 0, goals: 0, bumper: 0, doorsShut: 0, puck2: 0, turbo: 0, walls: 0 };
    const deur = makeDeurman(2.6); deur.group.visible = false; scene.add(deur.group);
    let deurT = 0, deurWho = -1;
    let hudT = 0;

    const sealed = (gi) => pads[gi].elim || door[gi] > 0.55;
    const maxLives = () => Math.max(...pads.map((p) => p.lives));
    const aliveList = () => pads.filter((p) => !p.elim);
    const cdMul = (p) => Math.max(0.6, 1 - 0.2 * (maxLives() - p.lives));
    const text = (t, x, y, z, c, s = 1) => fx.texts.add(t, x, y, z, c, s);
    const updateTag = (p) => drawTag(p, p.lives);
    const refreshHud = () => {
      pads.forEach((p) => hud.setPlayerInfo(p.i, ('❤'.repeat(p.lives) + '🖤'.repeat(LIVES - p.lives)) + (p.goalsFor ? ` ⚽${p.goalsFor}` : '')));
      hud.setScore(overtime ? '⚡ VERLENGING!' : G.state === 'play' || G.state === 'goal' ? `${pucks.filter((q) => q.on).length > 1 ? '2 pucks! ' : ''}Laatste met hartjes wint` : null);
    };

    // ---------------- camera ----------------
    const tgt = new THREE.Vector3(0, 0, -4.8), camDir = new THREE.Vector3(0, Math.sin(1.2), Math.cos(1.2));
    const fitPts = []; for (const [x, z] of require_poly()) { fitPts.push([x, 0, z], [x, 1.3, z]); }
    pads.forEach((p) => { const gp = A.goals[p.i].avatarPos; fitPts.push([gp[0], 4.6, gp[2]], [gp[0], 0, gp[2] + 1.5]); });
    function require_poly() { const o = []; for (const v of VERT) o.push([v[0] * (TRI.BEV + 1.2), v[1] * (TRI.BEV + 1.2)]); NORM.forEach(([nx, nz], i) => { o.push([nx * (TRI.a + 1.5), nz * (TRI.a + 1.5)]); }); return o; }
    function fitCamera() {
      const v = new THREE.Vector3(); let lo = 10, hi = 130;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(camDir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.96 || v.y > (Math.abs(v.x) < 0.3 ? 0.5 : 0.88) || v.y < -0.96) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camera.position.copy(tgt).addScaledVector(camDir, hi); camera.lookAt(tgt);
    }
    fitCamera();

    // ---------------- pucks beheren ----------------
    const livePucks = () => pucks.filter((q) => q.on);
    function setPuckColor(q, c) { q.rimM.color.set(c); q.rimM.emissive.set(c); }
    function spawnPuck(x, z, vx, vz, kind = 'main', dropIt = true) {
      const q = pucks.find((k) => !k.on); if (!q) return null;
      Object.assign(q, { on: true, x, z, vx, vz, y: dropIt ? 6 : 0, vy: 0, last: -1, stuck: -1, scored: -1, turbo: 0, life: 0, drop: dropIt, slowT: 0, kind, noHit: -1, noHitT: 0 });
      q.g.visible = true; q.shadow.visible = true; setPuckColor(q, kind === 'main' ? 0x58d6ff : 0xffe14a); q.fire.material.opacity = 0;
      return q;
    }
    function killPuck(q, poof = true) {
      if (!q.on) return; q.on = false; q.g.visible = false; q.shadow.visible = false;
      for (const p of pads) if (p.mag.caught === q) { p.mag.caught = null; p.mag.on = false; }
      if (poof) fx.particles.burst(q.x, 0.6, q.z, { count: 14, speed: 4, up: 1.4, life: 0.6, size: 0.3, colors: [0xffffff, 0x9fe8ff], gravity: 6 });
    }
    function serve() {
      for (const q of pucks) killPuck(q, false);
      // naar de leider (meeste hartjes); bij gelijk willekeurig onder de levenden, liefst niet degene die net een goal tegen kreeg
      const al = aliveList(); const mx = Math.max(...al.map((p) => p.lives)); let cand = al.filter((p) => p.lives === mx); if (cand.length > 1) cand = cand.filter((p) => p.i !== G.lastConceder).length ? cand.filter((p) => p.i !== G.lastConceder) : cand;
      const to = cand[Math.floor(ctx.rng() * cand.length)] || al[0]; G.serveTo = to.i;
      const a = (ctx.rng() - 0.5) * 0.4;   // kleine afwijking
      const sp = 9.5 * PT, dx = to.nx * Math.cos(a) - to.nz * Math.sin(a), dz = to.nx * Math.sin(a) + to.nz * Math.cos(a);
      spawnPuck(0, 0, dx * sp, dz * sp, 'main', true);
      G.state = 'serve'; G.t = 0; refreshHud();
    }

    // ---------------- goals ----------------
    const goalLog = [];
    function goal(gi, q) {
      goalLog.push({ gi, q: [q.x, q.z, q.vx, q.vz].map((v) => +v.toFixed(1)), last: q.last, u: +pads[gi].u.toFixed(1), w: +pads[gi].w.toFixed(1), L: +pads[gi].L.toFixed(1), mag: pads[gi].mag.on, caught: !!pads[gi].mag.caught, fr: pads[gi].frozen, clock: +clock.toFixed(1) });
      const victim = pads[gi], sc = q.last >= 0 && q.last !== gi ? pads[q.last] : null;
      victim.lives--; victim.goalsAgainst++; G.lastConceder = gi; stats.goals++;
      if (sc) sc.goalsFor++;
      G.state = 'goal'; G.t = 0; slow = 0.22; slowHold = 0.9; q.scored = gi;
      for (const o of pucks) if (o !== q) killPuck(o);
      q.vx *= 0.5; q.vz *= 0.5;
      for (const p of pads) { p.mag.on = false; p.mag.caught = null; p.lst = 'idle'; p.L = 0; }
      const gx = victim.nx * (TRI.a + 1.2), gz = victim.nz * (TRI.a + 1.2);
      A.flash[gi] = 1; A.cheer(3);
      audio.sfx('bell', { vol: 0.8 }); audio.sfx(victim.lives <= 0 ? 'lose' : 'explode', { vol: 0.5 }); ctx.shake(0.8);
      fx.particles.burst(gx, 1.2, gz, { count: 70, speed: 9, up: 1.2, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
      fx.particles.ring(gx, 0.8, gz, { count: 30, speed: 8, color: victim.pp.color, size: 0.4, life: 0.8 });
      text(victim.lives <= 0 ? 'UITGESCHAKELD!' : '-1 ♥', gx * 0.85, 4.5, gz * 0.85, victim.pp.css, 1.6);
      if (sc) text(`${sc.pp.name} SCOORT!`, gx * 0.6, 3.2, gz * 0.6, sc.pp.css, 1.3); else text('EIGEN GOAL!', gx * 0.6, 3.2, gz * 0.6, '#ffe14a', 1.3);
      hud.showBig(victim.lives <= 0 ? `${names[gi]} IS ER UIT!` : 'GOAAAL!', 1400, '#ffe14a');
      victim.c.pose = 'sad'; if (sc) sc.c.pose = 'cheer';
      if (victim.lives <= 0) { victim.elim = true; victim.mag.on = false; }
      updateTag(victim); refreshHud();
      // einde?
      const al = aliveList(); if (al.length <= 1) { G.end = true; G.winner = al.length ? al[0].i : sc ? sc.i : pickWinner(); }
      else if (clock >= TIME) { const m = maxLives(); const tops = al.filter((p) => p.lives === m); if (tops.length === 1) { G.end = true; G.winner = tops[0].i; } }
    }
    function pickWinner() {
      const r = pads.slice().sort((a, b) => (b.lives - a.lives) || (b.goalsFor - a.goalsFor) || (a.goalsAgainst - b.goalsAgainst) || ctx.rng() - 0.5);
      return r[0].i;
    }
    function finish(w) {
      if (finished) return; finished = true; G.state = 'end';
      const sc = pads.map((p) => p.lives);
      hud.showBig(`${names[w]} WINT!`, 1800, w === 0 ? '#7dffb0' : w === 1 ? '#8fb8ff' : '#ffb070'); audio.sfx('win', { vol: 0.6 });
      const jokes = ['De Deurman klapt beleefd mee.', 'De sneeuwpoppen zijn helemaal van slag.', 'Het ijs heeft het overleefd. Net.', 'De puck wil een trui met jouw naam.', 'De pinguïns twijfelen over een carrière als keeper.'];
      ctx.finishPvp({ winner: w, score: sc, delay: 900, summary: `<b>${names[w]}</b> houdt als laatste hartjes over! ${pads.map((p) => `${p.pp.name} ${p.lives}♥ (${p.goalsFor} goals gemaakt)`).join(' · ')}.<br>${stats.smashes} smashes, ${stats.catches} magneetvangsten, ${stats.bumper} bumper-botsingen${stats.doorsShut ? ` en ${stats.doorsShut}x een dichte deur van de Deurman` : ''}. ${jokes[Math.floor(ctx.rng() * jokes.length)]}` });
    }

    // ---------------- Deurman-deur ----------------
    function shutDoor(gi) {
      doorTarget[gi] = 1; doorT[gi] = 5.2; stats.doorsShut++;
      const p = pads[gi]; const bx = p.nx * (TRI.a + 6) + p.tx * (TRI.GH + 4), bz = p.nz * (TRI.a + 6) + p.tz * (TRI.GH + 4);
      deur.group.position.set(bx, -8, bz); deur.targetYaw = deur.yaw = Math.atan2(-p.nx, -p.nz); deur.group.visible = true; deurT = 0; deurWho = gi; deur.pose = 'wave';
      hud.toast(`🚪 De Deurman sluit het doel van ${p.pp.name} (uit medelijden)!`, 2400); audio.sfx('doorbell', { vol: 0.5 });
      text('DEUR DICHT!', p.nx * (TRI.a - 2), 3.4, p.nz * (TRI.a - 2), '#ffd27a', 1.5);
    }

    // ---------------- paddles ----------------
    function updatePad(p, dt) {
      const inp = pv.input(p.i), sp = pv.speed(p.i);
      p.frozen = Math.max(0, p.frozen - dt); p.lcd = Math.max(0, p.lcd - dt * (1 / cdMul(p) > 1 ? 1 / cdMul(p) : 1)); p.mag.cd = Math.max(0, p.mag.cd - dt / cdMul(p));
      const sizeK = lerp(1, pv.size(p.i), 0.7); const tR = RP * sizeK * (1 + 0.12 * Math.min(2, maxLives() - p.lives) * (p.elim ? 0 : 1));
      p.R = lerp(p.R, tR, Math.min(1, dt * 6));
      const can = p.frozen <= 0 && started && G.state !== 'end';
      // bewegen (wereldrichting; gebonden aan de strook langs de eigen muur)
      let dx = 0, dz = 0; if (can) { dx = inp.x * PAD_SPEED * sp; dz = inp.y * PAD_SPEED * sp; }
      const k = 1 - Math.exp(-lerp(18, 3, SLIP) * dt);
      p.wvx += (dx - p.wvx) * k; p.wvz += (dz - p.wvz) * k;
      const du = p.wvx * p.tx + p.wvz * p.tz, dw = -(p.wvx * p.nx + p.wvz * p.nz);
      p.u += du * dt; p.w += dw * dt;
      const U = STRIP_U, W0 = p.R + 1.75, W1 = W0 + 2.7;   // altijd ruimte genoeg tussen schijf en muur voor de puck
      if (p.u > U) { p.u = U; } if (p.u < -U) { p.u = -U; } if (p.w < W0) { p.w = W0; } if (p.w > W1) { p.w = W1; }
      // smash (uitval)
      if (can && inp.aP && p.lcd <= 0 && p.lst === 'idle' && !p.mag.on) { p.lst = 'out'; p.lcd = 1.25; p.smashes++; stats.smashes++; audio.sfx('swing', { vol: 0.6 }); p.c.swing(); fx.particles.ring(p.x, 0.3, p.z, { count: 12, speed: 4, color: p.pp.color, size: 0.35, life: 0.4 }); }
      if (p.lst === 'out') { p.L += 58 * dt; if (p.L >= LUNGE_MAX) { p.L = LUNGE_MAX; p.lst = 'back'; } }
      else if (p.lst === 'back') { p.L -= 15 * dt; if (p.L <= 0) { p.L = 0; p.lst = 'idle'; } }
      p.smashT = p.lst === 'out' || (p.lst === 'back' && p.L > 2.4) ? 1 : 0;
      // magneet
      const M = p.mag;
      if (can && inp.b && M.cd <= 0 && p.lst === 'idle' && !M.on) { M.on = true; M.t = 0; audio.sfx('whoosh', { vol: 0.3, rate: 1.4 }); }
      if (M.on) {
        M.t += dt;
        if (M.caught) {   // richting kiezen: hoek t.o.v. de voorwaartse normaal
          if (inp.mag > 0.3) { const ix = inp.x / inp.mag, iz = inp.y / inp.mag, nIx = -p.nx, nIz = -p.nz; M.ang = clamp(Math.atan2(nIx * iz - nIz * ix, nIx * ix + nIz * iz), -1.0, 1.0); }
        }
        if (!inp.b || M.t > 1.9 || !can) releaseMagnet(p);
      }
      padPos(p);
    }
    function releaseMagnet(p) {
      const M = p.mag; M.on = false; const q = M.caught; M.caught = null;
      if (q) {
        const c = Math.cos(M.ang), s = Math.sin(M.ang), nIx = -p.nx, nIz = -p.nz;
        const ax = nIx * c - nIz * s, az = nIx * s + nIz * c, sp = 22 * PT;
        q.stuck = -1; q.vx = ax * sp; q.vz = az * sp; q.x = p.x + ax * (p.R + q.r + 0.1); q.z = p.z + az * (p.R + q.r + 0.1); q.last = p.i; stats.shots++;
        audio.sfx('shoot', { vol: 0.7 }); audio.sfx('whoosh', { vol: 0.4 }); ctx.shake(0.15); fx.particles.burst(q.x, 0.6, q.z, { count: 14, speed: 5, up: 0.5, life: 0.4, size: 0.3, colors: [0x9fe8ff, 0xffffff], gravity: 2 }); p.c.swing();
        M.cd = 1.3;
      } else M.cd = 0.7;
    }

    // ---------------- fysica ----------------
    function hitSfx(q, v, name = 'hit') { if (q.sfxT > 0) return; q.sfxT = 0.06; audio.sfx(name, { vol: clamp(v / 30, 0.15, 0.7), rate: 0.9 + Math.random() * 0.3 }); }
    function stepPuck(q, h) {
      if (q.drop) { return; }
      q.sfxT = Math.max(0, (q.sfxT || 0) - h); q.noHitT = Math.max(0, q.noHitT - h);
      if (q.scored >= 0) {   // glijdt het net in
        q.x += q.vx * h; q.z += q.vz * h; const f = Math.exp(-2.2 * h); q.vx *= f; q.vz *= f;
        const gi = q.scored, p = pads[gi]; const d = TRI.a - (q.x * p.nx + q.z * p.nz), u = q.x * p.tx + q.z * p.tz;   // d<0 = achter de lijn
        const lim = TRI.GH - q.r - 0.1; if (Math.abs(u) > lim) { const s = Math.sign(u); q.x -= p.tx * (Math.abs(u) - lim) * s; q.z -= p.tz * (Math.abs(u) - lim) * s; }
        if (d < -(TRI.POCKET - 0.4)) { const pen = -(TRI.POCKET - 0.4) - d; q.x -= p.nx * pen; q.z -= p.nz * pen; q.vx *= -0.3; q.vz *= -0.3; }
        return;
      }
      if (q.stuck >= 0) { const p = pads[q.stuck]; const c = Math.cos(p.mag.ang), s = Math.sin(p.mag.ang), nIx = -p.nx, nIz = -p.nz; const ax = nIx * c - nIz * s, az = nIx * s + nIz * c; q.x = p.x + ax * (p.R + q.r + 0.05); q.z = p.z + az * (p.R + q.r + 0.05); q.vx = q.vz = 0; return; }
      // magneten
      for (const p of pads) {
        if (!p.mag.on || p.mag.caught || p.frozen > 0) continue;
        const fx_ = p.x - p.nx * (p.R + q.r + 0.15), fz_ = p.z - p.nz * (p.R + q.r + 0.15);
        const dx = fx_ - q.x, dz = fz_ - q.z, d = Math.hypot(dx, dz);
        if (d < MAGR) {
          const a = 70 * (1 - d / MAGR); q.vx += dx / (d || 1) * a * h; q.vz += dz / (d || 1) * a * h; if (d < 3) { const f = Math.exp(-3.2 * h); q.vx *= f; q.vz *= f; }
          if (d < 1.05 && Math.hypot(q.vx, q.vz) < 34) { q.stuck = p.i; p.mag.caught = q; p.mag.ang = 0; p.mag.t = Math.min(p.mag.t, 0.5); p.catches++; stats.catches++; q.last = p.i; setPuckColor(q, p.pp.color); audio.sfx('pop', { vol: 0.5, rate: 1.2 }); text('GEVANGEN!', p.x, 2.6, p.z, p.pp.css, 0.9); fx.particles.burst(q.x, 0.6, q.z, { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0x9fe8ff], gravity: 2 }); return; }
        }
      }
      q.x += q.vx * h; q.z += q.vz * h;
      // bumpers
      if (ev.bump) A.bumpers.forEach((b, k) => {
        if (b.t < 0.8) return; const bx = VERT[k][0] * 6.6, bz = VERT[k][1] * 6.6; const dx = q.x - bx, dz = q.z - bz, d = Math.hypot(dx, dz), R = 1.1 + q.r;
        if (d < R) { const nx = dx / (d || 1), nz = dz / (d || 1); q.x = bx + nx * R; q.z = bz + nz * R; const vn = q.vx * nx + q.vz * nz; if (vn < 0) { q.vx -= 2 * vn * nx; q.vz -= 2 * vn * nz; } const sp = Math.max(14, Math.hypot(q.vx, q.vz) * 1.1); const m = Math.hypot(q.vx, q.vz) || 1; q.vx *= sp / m; q.vz *= sp / m; b.hit = 1; stats.bumper++; hitSfx(q, 20, 'boing'); fx.particles.burst(q.x, 0.8, q.z, { count: 8, speed: 4, up: 1, life: 0.4, size: 0.3, colors: [0x9fe8ff, 0xffffff], gravity: 4 }); }
      });
      // paddles
      for (const p of pads) {
        const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), R = p.R + q.r; if (d >= R) continue;
        const nx = d > 1e-4 ? dx / d : -p.nx, nz = d > 1e-4 ? dz / d : -p.nz;
        q.x = p.x + nx * R; q.z = p.z + nz * R;
        const pvx = p.vx, pvz = p.vz; const vr = (q.vx - pvx) * nx + (q.vz - pvz) * nz;
        if (vr < 0) { q.vx -= (1 + 0.92) * vr * nx; q.vz -= (1 + 0.92) * vr * nz; }
        let sp = Math.hypot(q.vx, q.vz);
        if (p.smashT) { let ax = nx * 0.65 - p.nx * 0.35, az = nz * 0.65 - p.nz * 0.35; const m = Math.hypot(ax, az); ax /= m; az /= m; sp = Math.max(sp * 1.15, 25 * PT); q.vx = ax * sp; q.vz = az * sp; p.sq = 1; ctx.shake(0.3); audio.sfx('thud', { vol: 0.6 }); text('SMASH!', q.x, 2.4, q.z, p.pp.css, 1.1); fx.particles.burst(q.x, 0.7, q.z, { count: 20, speed: 7, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xffe14a, p.pp.color], gravity: 5 }); }
        else { sp = Math.max(sp, 9.5 * PT) * 1.0; let ox = q.vx, oz = q.vz; const m0 = Math.hypot(ox, oz) || 1; ox = ox / m0 - p.nx * 0.5; oz = oz / m0 - p.nz * 0.5; const m = Math.hypot(ox, oz) || 1; q.vx = ox / m * sp; q.vz = oz / m * sp;   // 'vergevende' schijf: de puck wordt altijd een beetje van je eigen doel af gekaatst
          hitSfx(q, sp, 'hit'); fx.particles.burst(q.x, 0.6, q.z, { count: 8, speed: 4, up: 1, life: 0.4, size: 0.3, colors: [0xffffff, p.pp.color], gravity: 5 }); }
        q.last = p.i; setPuckColor(q, p.pp.color); p.hits++; p.c.jump && (p.sq = Math.max(p.sq, 0.5));
      }
      // posten van open doelen
      for (const p of pads) {
        if (sealed(p.i)) continue;
        for (const s of [-1, 1]) {
          const bx = p.nx * TRI.a + p.tx * s * TRI.GH, bz = p.nz * TRI.a + p.tz * s * TRI.GH; const dx = q.x - bx, dz = q.z - bz, d = Math.hypot(dx, dz), R = 0.38 + q.r;
          if (d < R) { const nx = dx / (d || 1), nz = dz / (d || 1); q.x = bx + nx * R; q.z = bz + nz * R; const vn = q.vx * nx + q.vz * nz; if (vn < 0) { q.vx -= 1.9 * vn * nx; q.vz -= 1.9 * vn * nz; hitSfx(q, 18, 'click'); fx.particles.burst(bx, 1, bz, { count: 5, speed: 3, up: 1, life: 0.3, size: 0.25, colors: [p.pp.color], gravity: 3 }); } }
        }
      }
      // muren / doelmond
      for (const pl of PLN) {
        const d = pl.off - (q.x * pl.nx + q.z * pl.nz);
        if (d >= q.r) continue;
        if (pl.goal >= 0 && !sealed(pl.goal)) {
          const t = TANG[pl.goal]; const u = q.x * t[0] + q.z * t[1];
          if (Math.abs(u) < TRI.GH) { if (d < -0.05 && G.state === 'play') { goal(pl.goal, q); return; } continue; }
        }
        const pen = q.r - d; q.x -= pl.nx * pen; q.z -= pl.nz * pen;
        const vn = q.vx * pl.nx + q.vz * pl.nz;
        if (vn > 0) { q.vx -= 1.9 * vn * pl.nx; q.vz -= 1.9 * vn * pl.nz; stats.walls++; hitSfx(q, Math.abs(vn) * 1.4, 'click'); if (Math.abs(vn) > 8) fx.particles.burst(q.x + pl.nx * q.r, 0.5, q.z + pl.nz * q.r, { count: 5, speed: 3, up: 1, life: 0.3, size: 0.25, colors: [0xffffff, 0xbfeaff], gravity: 5 }); }
      }
      // snelheid
      let sp = Math.hypot(q.vx, q.vz); const cap = q.turbo > 0 ? PUCK_V * 1.35 : PUCK_V;
      if (sp > cap) { q.vx *= cap / sp; q.vz *= cap / sp; sp = cap; }
      if (sp > 16 * PT && q.turbo <= 0) { const f = 1 - 0.28 * h * (1 - 16 * PT / sp); q.vx *= f; q.vz *= f; sp *= f; }   // ijs-wrijving: hele snelle pucks remmen langzaam af
      if (sp < 5.5 && q.scored < 0) { q.slowT += h; if (q.slowT > 1.2) { const ang = Math.atan2(q.vz, q.vx) + (sp > 0.5 ? 0 : ctx.rng() * TAU); q.vx = Math.cos(ang) * 9 * PT; q.vz = Math.sin(ang) * 9 * PT; q.slowT = 0; } } else q.slowT = 0;
      if (q.turbo > 0 && sp < 20 * PT) { const m = sp || 1; q.vx *= 22 * PT / m; q.vz *= 22 * PT / m; }
    }

    function physics(dt) {
      const steps = Math.max(2, Math.ceil(dt / (1 / 120))), h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const p of pads) { p.px = p.x; p.pz = p.z; }
        for (const p of pads) updatePad(p, h);
        for (const p of pads) { p.vx = (p.x - p.px) / h; p.vz = (p.z - p.pz) / h; }
        if (G.state === 'play') { for (const q of pucks) if (q.on) stepPuck(q, h); }
        else if (G.state === 'goal') { for (const q of pucks) if (q.on && q.scored >= 0) stepPuck(q, h); }
      }
    }

    // ---------------- gebeurtenissen ----------------
    function spawnBoost() {
      let x = 0, z = 0; for (let k = 0; k < 10; k++) { const a = ctx.rng() * TAU, d = 1.5 + ctx.rng() * 3.5; x = Math.sin(a) * d; z = Math.cos(a) * d; if (!ev.bump || VERT.every((v) => Math.hypot(x - v[0] * 6.6, z - v[1] * 6.6) > 2.6)) break; }
      ev.boostPos = [x, z]; ev.boostT = 12; A.boost.visible = true; A.boost.position.set(x, 0, z); audio.sfx('sparkle', { vol: 0.4 });
      hud.toast('⚡ Turbo-kristal! Raakt een puck hem, dan vliegt die op turbo.', 2000);
    }
    function startPuck2() {
      const q = spawnPuck(0, 0, 0, 0, 'extra', true); if (!q) return;
      const al = aliveList(); const tg = al[Math.floor(ctx.rng() * al.length)] || pads[0]; const a = (ctx.rng() - 0.5) * 0.8;
      q.vx = (tg.nx * Math.cos(a) - tg.nz * Math.sin(a)) * 11 * PT; q.vz = (tg.nx * Math.sin(a) + tg.nz * Math.cos(a)) * 11 * PT;
      ev.p2End = clock + 15; stats.puck2++; hud.showBig('TWEEDE PUCK!', 1000, '#ffe14a'); audio.sfx('powerup', { vol: 0.6 });
    }
    function events(dt) {
      clock += dt;
      if (!ev.bump && clock >= 12) { ev.bump = true; A.bumpers.forEach((b) => { b.g.visible = true; b.on = true; b.t = 0; }); hud.toast('💎 Bumper-kristallen rijzen uit het ijs!', 2000); audio.sfx('creak', { vol: 0.5 }); ctx.shake(0.3); }
      const bt = [20, 46, 72]; if (ev.boost < bt.length && clock >= bt[ev.boost]) { ev.boost++; if (G.state === 'play') spawnBoost(); }
      const dtm = [26, 58]; if (ev.doors < dtm.length && clock >= dtm[ev.doors] && G.state === 'play') {
        ev.doors++; const al = aliveList(); const mn = Math.min(...al.map((p) => p.lives)); const weak = al.filter((p) => p.lives === mn); const v = weak[Math.floor(ctx.rng() * weak.length)]; if (v) shutDoor(v.i);
      }
      const pt = [36, 66]; if (ev.puck2 < pt.length && clock >= pt[ev.puck2] && G.state === 'play') { ev.puck2++; startPuck2(); }
      if (ev.p2End && clock >= ev.p2End) { ev.p2End = 0; const ex = pucks.filter((q) => q.on && q.kind === 'extra' && q.stuck < 0); ex.forEach((q) => killPuck(q)); }
      // boost-kristal
      if (ev.boostPos) {
        ev.boostT -= dt; for (const q of pucks) if (q.on && q.scored < 0 && Math.hypot(q.x - ev.boostPos[0], q.z - ev.boostPos[1]) < 1.9) { q.turbo = 5; stats.turbo++; audio.sfx('powerup', { vol: 0.6 }); text('TURBO!', q.x, 2.4, q.z, '#ff9a3a', 1.4); fx.particles.burst(q.x, 0.8, q.z, { count: 30, speed: 7, up: 1.5, life: 0.7, size: 0.45, colors: [0xff7a1a, 0xffd23f, 0xffffff], gravity: 3 }); ev.boostT = 0; }
        if (ev.boostT <= 0) { ev.boostPos = null; A.boost.visible = false; }
      }
    }
    // animaties van deuren, Deurman, bumpers en kristal (lopen ook tijdens goal-pauzes)
    function animate(dt) {
      // deuren
      for (let i = 0; i < 3; i++) {
        if (doorTarget[i] && doorT[i] > 0) { doorT[i] -= dt; if (doorT[i] <= 0) { doorTarget[i] = 0; if (deurWho === i) { /* hij zwaait weg */ } } }
        const was = door[i]; door[i] += Math.sign(doorTarget[i] - door[i]) * Math.min(Math.abs(doorTarget[i] - door[i]), dt * 1.8);
        const G_ = A.goals[i]; G_.door.visible = door[i] > 0.01 && !pads[i].elim; G_.door.position.x = (1 - door[i]) * (TRI.GH * 2 + 1) * (i % 2 ? 1 : -1);
        if (was < 0.55 && door[i] >= 0.55) { audio.sfx('door', { vol: 0.7 }); ctx.shake(0.3); }
        const wantBlock = pads[i].elim ? 1 : 0; blockK[i] += Math.sign(wantBlock - blockK[i]) * Math.min(Math.abs(wantBlock - blockK[i]), dt * 2.5); G_.block.visible = blockK[i] > 0.02; G_.block.scale.set(1, blockK[i], 1); G_.block.position.y = 1.2 * blockK[i];
      }
      if (deur.group.visible) { deurT += dt; const up = smoothstep(0, 0.8, deurT) * (1 - smoothstep(5, 6.2, deurT)); deur.group.position.y = lerp(-8, -0.5, up); deur.pose = deurT < 5.5 ? 'wave' : 'idle'; deur.update(dt); if (deurT > 6.4) deur.group.visible = false; }
      // bumpers
      A.bumpers.forEach((b, k) => { if (!b.on) return; b.t += dt; b.hit = Math.max(0, b.hit - dt * 4); const kk = smoothstep(0, 0.8, b.t); b.g.position.set(VERT[k][0] * 6.6, 0, VERT[k][1] * 6.6); b.g.scale.set((1 + b.hit * 0.2) * Math.max(0.01, kk), Math.max(0.01, kk), (1 + b.hit * 0.2) * Math.max(0.01, kk)); b.g.rotation.y += dt; b.g.userData.ring.material.opacity = 0.4 + b.hit * 0.5 + Math.sin(T * 5) * 0.1; });
      A.boost.rotation.y += dt * 2.4; A.boost.position.y = Math.sin(T * 3) * 0.15;
        }

    // ---------------- visuals ----------------
    const dir3 = new THREE.Vector3();
    function visuals(dt) {
      for (const q of pucks) {
        if (!q.on) continue;
        if (q.drop) { q.vy -= 18 * dt; q.y += q.vy * dt; if (q.y <= 0) { q.y = 0; q.drop = false; q.vy = 0; fx.particles.ring(q.x, 0.2, q.z, { count: 16, speed: 5, color: 0xffffff, size: 0.35, life: 0.4 }); audio.sfx('thud', { vol: 0.4 }); if (G.state === 'serve') { G.state = 'play'; refreshHud(); } } }
        q.bob += dt * 4; const hy = GRV < 1 ? 0.35 + Math.sin(q.bob) * 0.25 : 0;
        q.g.position.set(q.x, q.y + hy, q.z); q.g.rotation.y += dt * (2 + Math.hypot(q.vx, q.vz) * 0.3);
        q.shadow.position.set(q.x, 0.04, q.z); q.shadow.scale.setScalar(PUCK_R * (1 - clamp(q.y / 14, 0, 0.5)));
        q.turbo = Math.max(0, q.turbo - dt); q.fire.material.opacity = q.turbo > 0 ? 0.6 + Math.sin(T * 30) * 0.25 : 0;
        const sp = Math.hypot(q.vx, q.vz);
        if (q.turbo > 0 && Math.random() < dt * 40) fx.particles.emit(q.x - q.vx * 0.03, 0.5, q.z - q.vz * 0.03, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), { life: 0.45, size: 0.5, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: -1 });
        else if (sp > 20 && Math.random() < dt * 25) fx.particles.emit(q.x, 0.4, q.z, 0, 0.3, 0, { life: 0.35, size: 0.28, color: 0xcff4ff, gravity: 0 });
      }
      pads.forEach((p) => {
        p.sq = Math.max(0, p.sq - dt * 3);
        p.g.position.set(p.x, 0, p.z); p.g.scale.set(p.R * (1 + p.sq * 0.12), 1 + p.sq * 0.2, p.R * (1 + p.sq * 0.12));
        p.shadow.position.set(p.x, 0.04, p.z); p.shadow.scale.setScalar(p.R / 1.45);
        const gh = p.elim ? 0.4 : 1; p.baseM.opacity = gh; p.whiteM.opacity = gh;
        p.g.visible = p.frozen > 0 ? Math.sin(T * 40) > -0.3 : true;
        // magneetring + richtlijn
        const M = p.mag; p.mring.position.set(p.x, 0.08, p.z); p.mring.visible = M.on; if (M.on) { const k = (T * 3 + p.i) % 1; p.mring.scale.setScalar(p.R * (1 + k * 3.2)); p.mring.material.opacity = (1 - k) * 0.7; }
        p.aim.visible = !!M.caught;
        if (M.caught) { const c = Math.cos(M.ang), s = Math.sin(M.ang), ax = -p.nx * c + p.nz * s, az = -p.nx * s - p.nz * c, len = 7; p.aim.position.set(p.x + ax * (p.R + 1.6 + len / 2), 0.1, p.z + az * (p.R + 1.6 + len / 2)); p.aim.scale.set(len, 1, 1); p.aim.rotation.order = 'YXZ'; p.aim.rotation.set(-Math.PI / 2, Math.atan2(-az, ax), 0); }
        // avatar
        if (!finished && G.state !== 'goal' && G.state !== 'init') { const near = pucks.some((q) => q.on && q.scored < 0 && Math.hypot(q.x - p.x, q.z - p.z) < 8); p.c.pose = p.elim ? 'sad' : near ? 'scared' : 'carry'; }
        p.c.speed = 0; p.c.update(dt);
      });
    }

    // ---------------- hoofd-update ----------------
    function update(dt) {
      if (slowHold > 0) { slowHold -= dt; if (slowHold <= 0) slow = 1; }
      const d = dt * slow; T += d;
      if (!finished) {
        if (G.state === 'serve') { G.t += d; }
        else if (G.state === 'play') {
          events(d);
          if (clock >= TIME && !overtime) {
            const m = maxLives(); const tops = aliveList().filter((p) => p.lives === m);
            if (tops.length === 1) { finish(tops[0].i); } else { overtime = true; otT = 0; hud.showBig('⚡ VERLENGING!', 1400, '#ffe14a'); hud.toast('Gelijk! De volgende goal beslist.', 2200); audio.sfx('powerup'); refreshHud(); }
          }
          if (overtime) { otT += d; if (otT >= OT_MAX && !finished) finish(pickWinner()); }
        } else if (G.state === 'goal') {
          G.t += d; if (G.t > 1.9) {
            if (G.end) finish(G.winner);
            else { for (const p of pads) if (p.c.pose !== 'sad' || !p.elim) p.c.pose = 'carry'; serve(); }
          }
        }
        physics(d);
        hudT -= d; if (hudT <= 0) { hudT = 0.15; refreshHud(); }
        hud.setTimer(overtime ? null : Math.max(0, TIME - clock), 10);
      } else physics(0.0001);
      animate(d); A.update(T + introT, d); visuals(d);
      // sneeuw-sfeer
      if (Math.random() < d * 6) fx.particles.emit((Math.random() - 0.5) * 50, 14 + Math.random() * 6, (Math.random() - 0.5) * 50 - 5, 0.3, -1.6, 0.1, { life: 6, size: 0.18, color: 0xffffff, gravity: 0, shrink: false });
    }
    function introUpdate(dt) { introT += dt; for (const p of pads) p.c.pose = 'wave'; A.update(introT, dt); visuals(dt); }
    function resultUpdate(dt) { T += dt; A.update(T + introT, dt); for (const p of pads) p.c.update(dt); for (const q of pucks) if (q.on && q.scored >= 0) { /* laat staan */ } }

    // start: eerste puck pas bij GA
    refreshHud(); visuals(0.016);
    pads.forEach((p) => updateTag(p));

    return {
      update, introUpdate, resultUpdate,
      onStart() { started = true; hud.setTimer(TIME); serve(); },
      onResize() { fitCamera(); },
      onSwap() { for (const p of pads) fx.particles.burst(p.x, 1, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m && pads[i]) { const p = pads[i]; p.frozen = 2.6; p.lst = 'idle'; p.L = 0; if (p.mag.on) releaseMagnet(p); text('IJSBLOK!', p.x, 3, p.z, '#9fe8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { pads.forEach((p, i) => { p.c.pose = i === w ? 'cheer' : 'sad'; }); A.cheer(6); },
      dispose() {},
      dbg: {
        pads, pucks, A, G, finish: (w) => finish(w),
        state: () => ({ goalLog, T, clock, gstate: G.state, end: G.end, overtime, finished, started, door: door.map((d) => +d.toFixed(2)), ev: { bump: ev.bump, boost: !!ev.boostPos, boostPos: ev.boostPos }, stats, pk: pucks.filter((q) => q.on).length,
          pucks: pucks.filter((q) => q.on).map((q) => ({ x: +q.x.toFixed(2), z: +q.z.toFixed(2), vx: +q.vx.toFixed(1), vz: +q.vz.toFixed(1), y: +q.y.toFixed(2), r: q.r, stuck: q.stuck, scored: q.scored, drop: q.drop, turbo: +q.turbo.toFixed(1), last: q.last, kind: q.kind })),
          pads: pads.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), u: +p.u.toFixed(2), w: +p.w.toFixed(2), L: +p.L.toFixed(2), lst: p.lst, lcd: +p.lcd.toFixed(2), magOn: p.mag.on, magCd: +p.mag.cd.toFixed(2), caught: !!p.mag.caught, ang: +p.mag.ang.toFixed(2), lives: p.lives, elim: p.elim, frozen: +p.frozen.toFixed(1), R: +p.R.toFixed(2), gf: p.goalsFor, ga: p.goalsAgainst, nx: p.nx, nz: p.nz, tx: p.tx, tz: p.tz })) }),
        setLives: (i, l) => { pads[i].lives = l; pads[i].elim = l <= 0; updateTag(pads[i]); refreshHud(); },
        setClock: (t) => { clock = t; }, shutDoor, spawnBoost, startPuck2, forceBump: () => { clock = Math.max(clock, 12); },
      },
    };
  },
};

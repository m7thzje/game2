import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, randInt, pick, TAU, canvasTex, smoothstep, mulberry32 } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildTower, updateTower, makeHand, makeGhost, makeCuckoo, makeStar, HAND_DEF, PLATE_R } from './ticktock_world.js';

// Klokkentoren-Sprong — duel: spring over de draaiende wijzers van de gigantische klok. Wie geraakt wordt, vliegt de tandwielen in.
// Best-of-3 (2 gewonnen rondes). Gimmicks: koekoek, kantelende plaat, uurslag (wijzers verspringen), gouden wijzer, tijdstop-ster.

const VSC = 1.42, PRC = 0.62;
const RUN = 7.4, G0 = 32, JUMP_V = 12.8, PLAY_R = 8.9;
const WIN_ROUNDS = 2, MAX_ROUNDS = 4;
const DOOR_ANG = [270, 90, 330, 30];      // klokstanden van de koekoekshuisjes
const HOUSE_R = PLATE_R + 1.45;

const warnTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#ffd23a'; g.strokeStyle = '#3a1000'; g.lineWidth = 9; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(64, 10); g.lineTo(120, 112); g.lineTo(8, 112); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#c4161c'; g.font = 'bold 76px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 78);
});
const stripTex = () => canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = 'rgba(255,40,40,0.55)'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,230,60,0.55)';
  for (let y = -64; y < h + 64; y += 64) { g.beginPath(); g.moveTo(0, y + 32); g.lineTo(w / 2, y); g.lineTo(w, y + 32); g.lineTo(w, y + 64); g.lineTo(w / 2, y + 32); g.lineTo(0, y + 64); g.closePath(); g.fill(); }
});

export default {
  id: 'ticktock',
  name: 'Klokkentoren-Sprong',
  giver: 'Klokkenmaker Tik-Tak',
  icon: '🕰️',
  mode: 'pvp',
  time: 75,
  pay: 1,
  music: 'game_fast',
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  blurb: 'In de klokkentoren van het kasteel staan jullie op een <b>gigantische wijzerplaat</b> boven een afgrond vol tandwielen. De wijzers draaien rond: <b>spring eroverheen</b> of ren ervoor weg! Elk heel uur verspringen ze met een gong, een <b>koekoek</b> pikt in je benen en soms kantelt de hele klok. Wie geraakt wordt vliegt de tandwielen in. Wie als eerste <b>2 rondes</b> wint is de klokkenkampioen.',
  controls: ['{move} rennen', '{a} springen', '{b} stampen (in de lucht!)'],
  tip: 'De gouden wijzer is te groot om overheen te springen: ren voor hem uit! Wie achterstaat kan de tijdstop-ster pakken. Een stamp-landing vlak bij je broer schudt hem door elkaar.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('night', { shadow: 15, center: [0, 0, 0], fogNear: 60, fogFar: 190 });
    L.hemi.color.set(0xc9b8ff); L.hemi.groundColor.set(0x8a5a2a); L.hemi.intensity = 1.35;
    L.sun.color.set(0xffe4b4); L.sun.intensity = 2.2; L.sun.position.set(-10, 32, 22);
    camera.fov = 50; camera.updateProjectionMatrix();
    const W = buildTower(ctx, mulberry32(4242));
    const A = W.arena;
    const hemiBase = L.hemi.color.clone(), sunBase = L.sun.color.clone();

    const COLD1 = new THREE.Color(0x9fd8ff), COLD2 = new THREE.Color(0xd8f0ff);
    const tmpV = new THREE.Vector3();
    const wp = (x, y, z) => { tmpV.set(x, y, z); A.localToWorld(tmpV); return tmpV; };
    const burst = (x, y, z, o) => { const v = wp(x, y, z); fx.particles.burst(v.x, v.y, v.z, o); };
    const ring = (x, y, z, o) => { const v = wp(x, y, z); fx.particles.ring(v.x, v.y, v.z, o); };
    const ftext = (t, x, y, z, c, s) => { const v = wp(x, y, z); fx.texts.add(t, v.x, v.y, v.z, c, s); };

    // ---------------- wijzers ----------------
    const hands = {};
    for (const k of ['hour', 'minute', 'second', 'gold']) {
      const d = HAND_DEF[k]; const m = makeHand(k); const ghost = makeGhost(k); m.visible = false; A.add(m); A.add(ghost);
      hands[k] = { k, d, m, ghost, theta: 0, dir: 1, on: false, dropY: 0, pop: 0, dx: 0, dz: -1, nx: 1, nz: 0, len: d.len, tail: d.tail, w: d.w, hh: d.hh, omega: 0, scale: 1, born: 0, life: 0, spawn: null };
    }
    const HL = [hands.hour, hands.minute, hands.second, hands.gold];
    function setAngle(h, th) { h.theta = th; h.dx = Math.sin(th); h.dz = -Math.cos(th); h.nx = Math.cos(th); h.nz = Math.sin(th); }
    function overlaps(h, px, pz, pr) {
      const f = px * h.dx + pz * h.dz, q = px * h.nx + pz * h.nz;
      if (f < -h.tail - pr * 0.4 || f > h.len + pr * 0.2) return false;
      let half = h.w / 2; const ts = h.len - h.d.tip;
      if (f > ts) half *= 1 - 0.75 * (f - ts) / h.d.tip;
      return Math.abs(q) < half + pr * 0.38;
    }

    // ---------------- koekoeks ----------------
    const houses = DOOR_ANG.map((deg) => {
      const th = deg * Math.PI / 180; const g = makeCuckoo();
      g.position.set(Math.sin(th) * HOUSE_R, -0.55, -Math.cos(th) * HOUSE_R); g.rotation.y = -th; A.add(g);
      // steunbalk naar de plaat
      A.add(mesh(new THREE.BoxGeometry(1.7, 0.7, 2.4), mat(0x5a4028), { cast: false, pos: [Math.sin(th) * (PLATE_R + 0.15), -1.0, -Math.cos(th) * (PLATE_R + 0.15)], rot: [0, -th, 0] }));
      const bird = g.userData.bird; g.remove(bird); A.add(bird);
      const ox = Math.sin(th) * (HOUSE_R - 1.0), oz = -Math.cos(th) * (HOUSE_R - 1.0);
      bird.position.set(ox, 0.45, oz);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex(), transparent: true, depthTest: false })); sprite.scale.set(1.9, 1.9, 1); sprite.position.set(Math.sin(th) * HOUSE_R, 4.4, -Math.cos(th) * HOUSE_R); sprite.visible = false; sprite.renderOrder = 18; A.add(sprite);
      return { th, g, bird, ox, oz, doors: g.userData.doors, neck: g.userData.neck, head: g.userData.head, warn: sprite, open: 0, state: 'idle', t: 0, ax: 0, az: 0, reach: 0, len: 0, strip: null };
    });
    const stripT = stripTex();
    for (const hs of houses) {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshBasicMaterial({ map: stripT, transparent: true, depthWrite: false, opacity: 0.9 }));
      sm.rotation.x = -Math.PI / 2; sm.position.y = 0.05; sm.visible = false; sm.renderOrder = 4; A.add(sm); hs.strip = sm;
    }

    // ---------------- tijdstop-ster ----------------
    const starObj = makeStar(); starObj.visible = false; A.add(starObj);
    const starRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    starRing.rotation.x = -Math.PI / 2; starRing.position.y = 0.06; starRing.visible = false; A.add(starRing);
    const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.glowTex, color: 0xffe080, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); starGlow.scale.set(5, 5, 1); starGlow.visible = false; A.add(starGlow);

    // ---------------- spelers ----------------
    const START = [[-5.4, 2.8], [5.4, -2.8]];
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); A.add(holder);
      const rg = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.98, 28), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); rg.rotation.x = -Math.PI / 2; rg.position.y = 0.05; A.add(rg);
      const blob = P.shadowBlob(1.0); A.add(blob);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.2, 0.82, 1); tag.renderOrder = 15; scene.add(tag);
      const dizzy = new THREE.Group(); for (let k = 0; k < 4; k++) dizzy.add(mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [Math.cos(k * 1.57) * 0.55, 0, Math.sin(k * 1.57) * 0.55] })); dizzy.visible = false; holder.add(dizzy);
      return { i, c, holder, rg, blob, tag, dizzy, x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, face: 0, st: 'play', stun: 0, jumpBuf: 0, stompReq: false, stamping: false, stompCd: 0, wins: 0, surv: 0, sc: 1, flyT: 0, spin: 0, rot: 0, bounced: false, cheer: false, wasAir: false, squashT: 0, hitAt: -1 };
    });

    // ---------------- rondetoestand ----------------
    const R = { n: 0, state: 'pre', t: 0, ht: 0, sd: false, hitFirst: -1, decideAt: 0, endT: 0, draws: 0, calm: 0, freeze: 0, nextCuckoo: 5, nextStrike: 6, nextTilt: 12, secondAt: 9, goldAt: 15, strike: null, tilt: { st: 'none', t: 0, a: 0, dx: 0, dz: 1, amt: 0 }, star: null, starAt: 7, starFor: -1, matchOver: false, tickT: 0, swapped: false };
    let god = false, T = 0, done = false, introT = 0, freezeFlash = 0, lastLoser = -1, camPunch = 0, flashT = 0;
    const hist = [];
    hud.setTimer(null);
    const pips = (w) => '●'.repeat(w) + '○'.repeat(WIN_ROUNDS - w);
    function refreshHud() {
      hud.setScore(`Ronde ${clamp(R.n, 1, 9)}    ${names[0]} ${pips(pl[0].wins)}  –  ${pips(pl[1].wins)} ${names[1]}`);
      hud.setPlayerInfo(0, `Gewonnen: ${pl[0].wins}`); hud.setPlayerInfo(1, `Gewonnen: ${pl[1].wins}`);
    }

    // ---------------- ronde starten ----------------
    function placeHandsFresh() {
      const slots = pl.map((p) => Math.atan2(p.x, -p.z));
      const angDist = (a, b) => { let d = (b - a) % TAU; if (d < 0) d += TAU; return d; };
      for (const k of ['hour', 'minute', 'second', 'gold']) {
        const h = hands[k]; h.on = false; h.m.visible = false; h.m.position.y = 0; h.ghost.visible = false; h.dropY = 0; h.pop = 0; h.born = 0; h.spawn = null; h.scale = 1;
      }
      const dirs = [Math.random() < 0.5 ? 1 : -1, Math.random() < 0.5 ? 1 : -1];
      for (const [idx, k] of ['hour', 'minute'].entries()) {
        const h = hands[k]; h.dir = dirs[idx]; h.on = true; h.m.visible = true;
        let best = 0, bestScore = -1;
        for (let tr = 0; tr < 14; tr++) {
          const th = rand(0, TAU);
          // hoe lang duurt het voor de wijzer een speler bereikt (in rotatie-richting)?
          let tmin = 99; for (const s of slots) { const d = h.dir > 0 ? angDist(th, s) : angDist(s, th); const back = TAU - d; tmin = Math.min(tmin, d, back < 0.7 ? -1 : 99); }
          if (tmin > bestScore) { bestScore = tmin; best = th; }
          if (tmin > 1.7) break;
        }
        setAngle(h, best);
      }
    }
    function startRound() {
      R.n++; R.state = 'intro'; R.t = 0; R.ht = 0; R.sd = false; R.hitFirst = -1; R.decideAt = 0; R.calm = 0; R.freeze = 0; R.strike = null; R.star = null;
      R.nextCuckoo = 4.2 + rand(0, 1.2); R.nextStrike = R.n === 1 ? 6.2 : 5.4; R.nextTilt = 11 + rand(0, 3); R.secondAt = 8 + rand(0, 1.5); R.goldAt = 13.5 + rand(0, 2); R.starAt = 6.5 + rand(0, 2); R.tilt.st = 'none'; R.tilt.amt = 0; R.tilt.t = 0;
      R.starFor = -1; R.goldDone = false; R.starDone = false;
      // wie staat er achter? (alleen die kan de ster pakken)
      if (pl[0].wins !== pl[1].wins) R.starFor = pl[0].wins < pl[1].wins ? 0 : 1; else if (R.n > 1 && lastLoser >= 0) R.starFor = lastLoser;
      const swap = (R.n % 2) === 0;
      pl.forEach((p, i) => {
        const s = START[swap ? 1 - i : i];
        Object.assign(p, { x: s[0], z: s[1], vx: 0, vz: 0, y: 0, vy: 0, st: 'play', stun: 0, jumpBuf: 0, stompReq: false, stamping: false, stompCd: 0, flyT: 0, spin: 0, rot: 0, bounced: false, cheer: false, wasAir: false, sc: 0.2, hitAt: -1 });
        p.face = Math.atan2(-s[0], -s[1]) ; p.c.pose = 'idle'; p.c.air = false; p.holder.visible = true; p.holder.rotation.set(0, 0, 0); p.dizzy.visible = false;
      });
      placeHandsFresh();
      for (const hs of houses) { hs.state = 'idle'; hs.bird.visible = false; hs.strip.visible = false; hs.warn.visible = false; hs.open = 0; }
      starObj.visible = false; starRing.visible = false; starGlow.visible = false;
      refreshHud();
      if (R.n > 1) { hud.showBig(R.n >= MAX_ROUNDS || (pl[0].wins === 1 && pl[1].wins === 1) ? 'BESLISSENDE RONDE!' : `RONDE ${R.n}`, 1200, '#ffe14a'); audio.sfx('bell', { vol: 0.5 }); }
      ring(0, 0.3, 0, { count: 30, speed: 7, color: 0xffe9a0, size: 0.3, life: 0.7 });
    }

    // ---------------- hit / vlucht ----------------
    const JOKES_HIT = ['AU!', 'TIK-TAK-AU!', 'BONK!', 'WIJZER!', 'OEPS!'];
    function hitPlayer(p, hx, hz, tx, tz, power = 1, cause = '?') {
      if (p.st !== 'play' || (god && cause !== 'forced')) return;
      p.cause = cause; hist.push({ cause, ht: R.ht, i: p.i, y: p.y });
      p.st = 'fly'; p.flyT = 0; p.bounced = false; p.stamping = false; p.hitAt = R.ht;
      const r0 = Math.hypot(p.x, p.z);
      let ox = hx, oz = hz; if (r0 > 0.9) { ox = p.x / r0; oz = p.z / r0; }
      const vout = clamp((10.4 - r0) / 1.08 + 1.5, 4, 10.5);
      p.vx = ox * vout + tx * 4.0 * power; p.vz = oz * vout + tz * 4.0 * power; p.vy = 13;
      p.spin = (Math.random() < 0.5 ? -1 : 1) * rand(6, 10);
      p.c.pose = 'scared'; p.c.air = true; p.c.speed = 0;
      audio.sfx('hurt', { vol: 0.8 }); audio.sfx('hit', { vol: 0.9 }); audio.sfx('boing', { vol: 0.5, rate: 1.4 });
      ctx.shake(0.8); camPunch = 1;
      burst(p.x, 0.8, p.z, { count: 36, speed: 6, up: 1.3, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff, 0xff9a3a, 0xff5a3a], gravity: 8 });
      ring(p.x, 0.3, p.z, { count: 20, speed: 6, color: 0xffffff, size: 0.3, life: 0.4 });
      ftext(pick(JOKES_HIT), p.x, 3.4, p.z, '#ff7a5a', 1.3);
      if (R.state === 'fight' && R.hitFirst < 0) { R.hitFirst = p.i; R.decideAt = T + 0.32; }
    }

    // ---------------- spelerfysica ----------------
    function stepPlayer(p, h, active, tvx, tvz) {
      const inp = ctx.pvp.input(p.i);
      const slip = ctx.pvp.slip, gr = ctx.pvp.gravity, sz = ctx.pvp.size(p.i);
      if (p.st === 'fly') {
        p.flyT += h; p.vy -= 24 * h; p.x += p.vx * h; p.z += p.vz * h; p.y += p.vy * h; p.rot += p.spin * h;
        const rr = Math.hypot(p.x, p.z);
        if (!p.bounced && p.y < -4.2 && p.vy < 0 && rr > 11.4 && rr < 18.9) {
          p.bounced = true; p.vy = 17; p.vx *= -0.25; p.vz *= -0.25; p.spin *= 1.8;
          burst(p.x, p.y, p.z, { count: 40, speed: 7, up: 1.2, life: 0.8, size: 0.45, colors: [0xffe14a, 0xffb02a, 0xffffff], gravity: 12 });
          ftext('KLONK!', p.x, p.y + 2.2, p.z, '#ffd24a', 1.4); audio.sfx('thud', { vol: 0.9 }); audio.sfx('boing', { vol: 0.7 }); audio.sfx('hit', { vol: 0.6, rate: 0.7 }); ctx.shake(0.5);
        }
        if (p.y < -48) { p.st = 'gone'; p.holder.visible = false; }
        return;
      }
      if (p.st !== 'play') return;
      const grounded = p.y <= 0.001 && p.vy <= 0;
      const spd = RUN * ctx.pvp.speed(p.i);
      const canAct = active && p.stun <= 0;
      const lam = grounded ? lerp(17, 1.5, slip) : lerp(4.5, 1.0, slip);
      const tx = (canAct ? inp.x * spd : 0) + tvx, tz = (canAct ? inp.y * spd : 0) + tvz;
      p.vx = damp(p.vx, tx, lam, h); p.vz = damp(p.vz, tz, lam, h);
      if (canAct && inp.mag > 0.25) p.face = Math.atan2(inp.x, inp.y);
      // springen
      if (canAct && p.jumpBuf > 0 && grounded) {
        p.vy = JUMP_V * (0.62 + 0.38 * Math.sqrt(gr)); p.y = 0.002; p.jumpBuf = 0; p.c.jump();
        audio.sfx('jump', { vol: 0.55, rate: 0.9 + 0.3 * Math.random() });
        burst(p.x, 0.1, p.z, { count: 7, speed: 2.2, up: 0.7, life: 0.45, size: 0.3, color: 0xe8d8b0, gravity: 3 });
      }
      // stampen
      if (canAct && p.stompReq && p.y > 0.35 && !p.stamping && p.stompCd <= 0) { p.stamping = true; p.vy = -34; p.stompCd = 1.3; audio.sfx('whoosh', { vol: 0.5, rate: 1.4 }); p.c.pose = 'push'; p.vx *= 0.3; p.vz *= 0.3; }
      p.stompReq = false;
      if (!grounded || p.y > 0) { p.vy -= G0 * gr * h * (p.stamping ? 1 : 1); p.y += p.vy * h; }
      if (p.y <= 0) {
        const wasAir = p.wasAir || p.vy < -1;
        p.y = 0;
        if (p.vy < -4) {
          audio.sfx('land', { vol: 0.5 }); burst(p.x, 0.1, p.z, { count: p.stamping ? 18 : 6, speed: p.stamping ? 5 : 2.2, up: 0.6, life: 0.45, size: 0.32, color: 0xe8d8b0, gravity: 3 });
          p.c.squash = p.stamping ? -0.3 : -0.14;
          if (p.stamping) stompLand(p);
        }
        p.vy = 0; p.stamping = false; p.wasAir = false;
      } else p.wasAir = true;
      // integratie + rand
      p.x += p.vx * h; p.z += p.vz * h;
      const rr = Math.hypot(p.x, p.z), maxR = PLAY_R - 0.1 * (sz - 1);
      if (rr > maxR) { const k = maxR / rr; p.x *= k; p.z *= k; const nx = p.x / maxR, nz = p.z / maxR; const vo = p.vx * nx + p.vz * nz; if (vo > 0) { p.vx -= nx * vo; p.vz -= nz * vo; } }
    }
    function stompLand(p) {
      ring(p.x, 0.15, p.z, { count: 26, speed: 8, color: 0xfff0b0, size: 0.35, life: 0.5 });
      ctx.shake(0.35);
      const o = pl[1 - p.i]; if (o.st !== 'play' || o.y > 0.7) return;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (d < 3.1) {
        o.vx += dx / d * 12; o.vz += dz / d * 12; o.stun = Math.max(o.stun, 0.5);
        ftext('DREUN!', o.x, 3.3, o.z, '#ffffff', 1.1); audio.sfx('hit', { vol: 0.8 }); audio.sfx('thud', { vol: 0.8 });
        burst(o.x, 0.8, o.z, { count: 16, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 6 });
      }
    }

    // ---------------- wijzers: snelheid + gimmicks ----------------
    function speedMul() {
      const ramp = smoothstep(0, 2.4, R.ht);
      let m = (1 + 0.045 * R.ht) * (1 + 0.06 * (R.n - 1)) * (R.sd ? 1.4 : 1);
      m = Math.min(m, 2.9);
      const calmF = 1 - 0.34 * clamp(R.calm / 2.5, 0, 1);
      return m * (0.4 + 0.6 * ramp) * calmF;
    }
    function showGhostFor(h, th) { h.ghost.visible = true; h.ghost.rotation.y = -th; }
    function scheduleStrike() {
      const items = [];
      for (const k of ['hour', 'minute']) {
        const h = hands[k];
        let steps = randInt(1, 3); const target = (Math.round(h.theta / (TAU / 12)) + steps * h.dir) * (TAU / 12);
        items.push({ h, target, flip: Math.random() < 0.45 });
        showGhostFor(h, target);
      }
      R.strike = { t: 1.15, items };
      audio.sfx('tick', { vol: 1.2, rate: 0.8 });
      hud.toast('Bijna een heel uur... de wijzers springen!', 1200);
      for (const it of items) { const idx = ((Math.round(it.target / (TAU / 12)) % 12) + 12) % 12; W.lamps[idx].f = 1; }
    }
    function doStrike() {
      const S = R.strike; R.strike = null;
      for (const it of S.items) {
        const h = it.h; h.ghost.visible = false; setAngle(h, it.target); if (it.flip) h.dir *= -1; h.pop = 1;
        const tipx = h.dx * h.len * 0.9, tipz = h.dz * h.len * 0.9;
        burst(tipx, 0.6, tipz, { count: 24, speed: 5, up: 1.1, life: 0.7, size: 0.4, colors: [0xffe14a, 0xffffff, 0xffb02a], gravity: 6 });
      }
      for (const l of W.lamps) l.f = 1;
      audio.sfx('bell', { vol: 0.9, rate: 0.5 }); audio.tone(98, 1.8, { type: 'sine', vol: 0.55, send: 0.3 }); audio.tone(147, 1.4, { type: 'triangle', vol: 0.25 });
      ctx.shake(0.65); hud.showBig('BONG!', 700, '#ffd24a');
      ring(0, 0.3, 0, { count: 44, speed: 11, color: 0xffe9a0, size: 0.4, life: 0.8 });
      if (S.items.some((it) => it.flip)) hud.toast('De wijzers draaien om!', 1400);
    }
    function spawnCuckoo(forceDoor = -1) {
      const free = houses.map((_, i) => i).filter((i) => houses[i].state === 'idle');
      if (!free.length) return;
      const idx = forceDoor >= 0 && free.includes(forceDoor) ? forceDoor : pick(free);
      const hs = houses[idx];
      // richt op een speler (de speler die het meest in de lijn staat van het huisje) of random
      const alive = pl.filter((p) => p.st === 'play');
      const tgt = alive.length ? pick(alive) : null;
      let ax = -hs.ox, az = -hs.oz;
      if (tgt) { ax = tgt.x - hs.ox; az = tgt.z - hs.oz; }
      const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      // lengte tot de rand van de plaat
      const b = hs.ox * ax + hs.oz * az, c = hs.ox * hs.ox + hs.oz * hs.oz - (PLATE_R - 0.3) * (PLATE_R - 0.3);
      const disc = b * b - c; const reach = disc > 0 ? -b + Math.sqrt(disc) : 12;
      Object.assign(hs, { state: 'warn', t: 0, ax, az, reach: Math.max(4, reach), len: 0 });
      hs.bird.visible = true; hs.bird.rotation.y = Math.atan2(ax, az); hs.neck.scale.y = 0.01; hs.head.position.z = 0.0; hs.neck.position.z = 0;
      const s0 = disc > 0 ? Math.max(0, -b - Math.sqrt(disc)) : 0, sl = Math.max(1, hs.reach - s0);
      hs.strip.visible = true; hs.strip.scale.set(1, sl, 1); hs.strip.position.set(hs.ox + ax * (s0 + sl / 2), 0.05, hs.oz + az * (s0 + sl / 2));
      hs.strip.rotation.set(-Math.PI / 2, Math.atan2(ax, az) + Math.PI, 0, 'YXZ');
      hs.warn.visible = true;
      audio.sfx('door', { vol: 0.7 }); audio.tone(880, 0.12, { type: 'square', vol: 0.12 }); audio.tone(660, 0.2, { type: 'square', vol: 0.12, delay: 0.14 });
    }
    function updateCuckoos(dtG, dt) {
      for (const hs of houses) {
        if (hs.state === 'idle') { hs.open = damp(hs.open, 0, 8, dt); }
        else {
          hs.t += dtG;
          if (hs.state === 'warn') {
            hs.open = damp(hs.open, 1, 10, dt);
            const k = hs.t / 1.0; hs.head.position.z = lerp(0, 0.7, smoothstep(0.1, 0.5, k)) + Math.sin(T * 40) * 0.03 * (k > 0.5 ? 1 : 0);
            hs.strip.material.opacity = 0.5 + Math.sin(T * 18) * 0.35; hs.warn.material.opacity = 1; hs.warn.position.y = 4.4 + Math.sin(T * 14) * 0.15;
            if (hs.t > 1.0) { hs.state = 'out'; hs.t = 0; audio.sfx('whoosh', { vol: 0.8, rate: 1.5 }); audio.tone(1180, 0.22, { type: 'triangle', vol: 0.3 }); audio.tone(880, 0.3, { type: 'triangle', vol: 0.3, delay: 0.2 }); ftext('KOEKOEK!', hs.ox + hs.ax * 2, 3.0, hs.oz + hs.az * 2, '#ffd24a', 1.3); hs.warn.visible = false; }
          } else if (hs.state === 'out') {
            const k = hs.t / 0.22; hs.len = hs.reach * smoothstep(0, 1, Math.min(1, k)); if (hs.t > 0.22 + 0.36) { hs.state = 'back'; hs.t = 0; }
          } else if (hs.state === 'back') {
            hs.len = hs.reach * (1 - smoothstep(0, 1, hs.t / 0.4)); if (hs.t > 0.4) { hs.state = 'idle'; hs.bird.visible = false; hs.strip.visible = false; hs.len = 0; }
          }
          if (hs.state === 'out' || hs.state === 'back') hs.strip.visible = false;
          if (hs.state !== 'warn') { hs.neck.scale.y = Math.max(0.01, hs.len); hs.neck.position.z = hs.len / 2; hs.head.position.z = hs.len; }
          else { hs.neck.scale.y = 0.01; }
        }
        const o = hs.open; hs.doors[0].rotation.y = -o * 1.7; hs.doors[1].rotation.y = o * 1.7;
      }
    }
    function cuckooHits(h) {
      if (R.state !== 'fight') return;
      for (const hs of houses) {
        if (hs.state !== 'out' && !(hs.state === 'back' && hs.len > 0.5)) continue;
        for (const p of pl) {
          if (p.st !== 'play' || p.y > 0.95) continue;
          const rx = p.x - hs.ox, rz = p.z - hs.oz; const s = rx * hs.ax + rz * hs.az; const q = Math.abs(rx * hs.az - rz * hs.ax);
          if (s > 0.3 && s < hs.len + 0.55 && q < 0.62 + 0.4 * ctx.pvp.size(p.i)) { hitPlayer(p, hs.ax, hs.az, hs.ax, hs.az, 0.9, 'cuckoo'); ftext('PIK!', p.x, 2.5, p.z, '#ffffff', 1.0); audio.sfx('chop', { vol: 0.8 }); }
        }
      }
    }

    // tilt
    function updateTilt(dtG, dt) {
      const Tl = R.tilt;
      if (Tl.st === 'none') { Tl.amt = damp(Tl.amt, 0, 6, dt); return; }
      Tl.t += dtG;
      if (Tl.st === 'warn') { Tl.amt = Math.sin(T * 38) * 0.05; if (Tl.t > 0.9) { Tl.st = 'hold'; Tl.t = 0; audio.sfx('creak', { vol: 0.8, rate: 0.9 }); hud.showBig('KANTELING!', 800, '#ff9a4a'); ctx.shake(0.5); } }
      else if (Tl.st === 'hold') { Tl.amt = damp(Tl.amt, 1, 7, dtG || dt); if (Tl.t > 2.4) { Tl.st = 'back'; Tl.t = 0; } }
      else if (Tl.st === 'back') { Tl.amt = damp(Tl.amt, 0, 6, dtG || dt); if (Tl.t > 0.8) { Tl.st = 'none'; } }
    }

    // ster
    function spawnStar() {
      const b = pl[R.starFor]; let x = 0, z = 0;
      for (let tr = 0; tr < 12; tr++) { const a = rand(0, TAU), r = rand(2.6, 6.4); x = Math.sin(a) * r; z = -Math.cos(a) * r; if (pl.every((p) => Math.hypot(p.x - x, p.z - z) > 2.8)) break; }
      R.star = { x, z, life: 9, t: 0 };
      starObj.visible = true; starRing.visible = true; starGlow.visible = true; starRing.material.color.set(PLAYER_COLORS[R.starFor]);
      hud.toast(`Tijdstop-ster voor ${names[R.starFor]}! Pak hem om de klok even stil te zetten.`, 2400); audio.sfx('sparkle', { vol: 0.8 });
      ring(x, 0.4, z, { count: 18, speed: 3.5, color: 0xfff0a0, size: 0.3, life: 0.6 });
    }
    function updateStar(dt) {
      const s = R.star; if (!s) return;
      s.t += dt; s.life -= dt;
      starObj.position.set(s.x, 1.7 + Math.sin(s.t * 3) * 0.25, s.z); starObj.rotation.y = s.t * 2.4; starObj.scale.setScalar(1.05 + Math.sin(s.t * 6) * 0.06);
      starRing.position.set(s.x, 0.07, s.z); starRing.scale.setScalar(1 + Math.sin(s.t * 5) * 0.08); starGlow.position.set(s.x, 1.8, s.z);
      const vis = s.life > 2 || Math.sin(s.life * 22) > 0; starObj.visible = vis; starRing.visible = vis; starGlow.visible = vis;
      if (Math.random() < dt * 14) { const v = wp(s.x + (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 1.6, s.z + (Math.random() - 0.5) * 1.5); fx.particles.emit(v.x, v.y, v.z, 0, 0.8, 0, { life: 0.7, size: 0.22, color: 0xfff0a0, gravity: -0.5 }); }
      const b = pl[R.starFor];
      if (R.state === 'fight' && b.st === 'play' && b.y < 2.4 && Math.hypot(b.x - s.x, b.z - s.z) < 1.55) { collectStar(b, s); return; }
      if (R.state === 'fight') { const o = pl[1 - R.starFor]; if (o.st === 'play' && o.y < 2.4 && Math.hypot(o.x - s.x, o.z - s.z) < 1.4 && !s.teased) { s.teased = true; ftext('Niet voor jou!', o.x, 3.4, o.z, '#9fd0ff', 0.9); audio.sfx('buzz', { vol: 0.4 }); } }
      if (s.life <= 0) { R.star = null; starObj.visible = false; starRing.visible = false; starGlow.visible = false; }
    }
    function collectStar(b, s) {
      R.star = null; starObj.visible = false; starRing.visible = false; starGlow.visible = false;
      R.freeze = 2.0; R.calm = 7; freezeFlash = 1;
      hud.showBig('TIJDSTOP!', 1300, '#9fe4ff'); hud.toast(`${names[b.i]} zet de klok even stil!`, 1800);
      audio.sfx('powerup', { vol: 0.9 }); audio.sfx('sparkle', { vol: 0.9 }); audio.tone(1760, 1.2, { type: 'sine', vol: 0.15, slide: 220 }); ctx.shake(0.3);
      burst(s.x, 1.6, s.z, { count: 60, speed: 7, up: 1.2, life: 1.1, size: 0.45, colors: [0xfff0a0, 0x9fe4ff, 0xffffff], gravity: 3 });
      ring(s.x, 0.4, s.z, { count: 40, speed: 10, color: 0x9fe4ff, size: 0.4, life: 0.9 });
    }

    // spawn op afroep: tweede wijzer en gouden wijzer
    function spawnSpecial(k) {
      const h = hands[k];
      const slots = pl.map((p) => Math.atan2(p.x, -p.z));
      let th = rand(0, TAU); if (k === 'second') h.dir = Math.random() < 0.5 ? 1 : -1; else h.dir = Math.random() < 0.5 ? 1 : -1;
      let best = th, bs = -1;
      for (let tr = 0; tr < 10; tr++) { const c = rand(0, TAU); let tmin = 99; for (const s of slots) { let d = (h.dir > 0 ? s - c : c - s) % TAU; if (d < 0) d += TAU; tmin = Math.min(tmin, d); } if (tmin > bs) { bs = tmin; best = c; } }
      setAngle(h, best);
      h.spawn = { t: k === 'gold' ? 1.6 : 1.1 }; h.ghost.visible = true; h.ghost.rotation.y = -best; h.m.visible = false;
      h.ghost.material.opacity = 0.4;
      if (k === 'gold') { hud.showBig('DE GOUDEN WIJZER!', 1400, '#ffd24a'); hud.toast('Te groot om overheen te springen: ren voor hem uit!', 2400); audio.sfx('powerup', { vol: 0.8 }); audio.tone(196, 1.4, { type: 'sawtooth', vol: 0.12, filter: 600 }); }
      else { hud.toast('Daar komt de rode secondewijzer: snel en dun!', 1800); audio.sfx('ding', { vol: 0.9 }); audio.sfx('tick'); }
    }
    function updateSpawns(dtG, dt) {
      for (const k of ['second', 'gold']) {
        const h = hands[k];
        if (h.spawn) {
          h.spawn.t -= dt; h.ghost.visible = true; h.ghost.material.opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(T * 16));
          const drop = k === 'gold' ? 0.5 : 0.3;
          if (h.spawn.t <= drop) { h.m.visible = true; h.dropY = Math.max(0, h.spawn.t / drop) * 9; if (h.spawn.t <= 0) { h.spawn = null; h.dropY = 0; h.on = true; h.ghost.visible = false; h.born = R.ht; h.life = k === 'gold' ? 10.5 : 99; slamEffects(h); } }
        }
        if (h.on && k === 'gold') { h.life -= dtG; if (h.life < 0) { h.dropY += dt * 14; if (h.dropY > 9) { h.on = false; h.m.visible = false; h.dropY = 0; } } }
        h.m.position.y = h.dropY;
      }
    }
    function slamEffects(h) {
      audio.sfx('thud', { vol: 1 }); audio.sfx('hit', { vol: 0.7 }); ctx.shake(h.k === 'gold' ? 0.9 : 0.45);
      for (const f of [0.3, 0.55, 0.8]) burst(h.dx * h.len * f, 0.3, h.dz * h.len * f, { count: h.k === 'gold' ? 14 : 6, speed: 4, up: 0.8, life: 0.6, size: 0.4, colors: [0xffe14a, 0xfff0b0, 0xe8d8b0], gravity: 5 });
    }

    // ---------------- ronde-update (spelrondes) ----------------
    function updateRound(dt) {
      if (R.state === 'intro') {
        R.t += dt; if (R.t > (R.n === 1 ? 0.7 : 1.0)) { R.state = 'fight'; R.t = 0; if (R.n > 1) audio.sfx('go', { vol: 0.8 }); }
        return;
      }
      if (R.state === 'fight') {
        R.t += dt;
        R.freeze = Math.max(0, R.freeze - dt);
        const dtG = R.freeze > 0 ? 0 : dt;
        if (R.freeze <= 0 && R.calm > 0) R.calm = Math.max(0, R.calm - dt);
        R.ht += dtG;
        // tikken
        R.tickT -= dtG; if (R.tickT <= 0) { R.tickT = 0.5 / clamp(speedMul(), 0.7, 2.6); audio.sfx('tick', { vol: 0.5, rate: R.swapTick ? 0.8 : 1.1 }); R.swapTick = !R.swapTick; }
        // gebeurtenissen
        if (R.ht > R.nextStrike && !R.strike) { scheduleStrike(); R.nextStrike = R.ht + 6.8 + rand(-0.8, 1) - Math.min(2, R.ht * 0.04); }
        if (R.strike) { R.strike.t -= dtG; for (const it of R.strike.items) { it.h.ghost.material.opacity = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(T * 20)); } if (R.strike.t <= 0) doStrike(); }
        if (R.ht > R.nextCuckoo) { spawnCuckoo(); if (R.ht > 17 && Math.random() < 0.35) spawnCuckoo(); R.nextCuckoo = R.ht + clamp(5.2 - R.ht * 0.08, 2.4, 5.2) * rand(0.85, 1.2); }
        if (R.ht > R.nextTilt && R.tilt.st === 'none') { R.tilt.st = 'warn'; R.tilt.t = 0; const a = rand(0, TAU); R.tilt.dx = Math.sin(a); R.tilt.dz = -Math.cos(a); R.nextTilt = R.ht + rand(10, 13); audio.sfx('creak', { vol: 0.9, rate: 1.1 }); hud.toast('De klok kantelt! Hou je vast!', 1300); }
        if (R.ht > R.secondAt && !hands.second.on && !hands.second.spawn) spawnSpecial('second');
        if (R.ht > R.goldAt && !hands.gold.on && !hands.gold.spawn && !R.goldDone) { spawnSpecial('gold'); R.goldDone = true; }
        if (R.starFor >= 0 && R.ht > R.starAt && !R.star && !R.starDone) { spawnStar(); R.starDone = true; }
        if (!R.sd && R.ht > 21) { R.sd = true; hud.showBig('SNELLER!', 1100, '#ff5a5a'); hud.toast('De klok slaat op hol!', 1600); audio.sfx('creak', { vol: 0.6 }); ctx.shake(0.5); audio.music('tense'); }
        updateCuckoos(dtG, dt); updateTilt(dtG, dt); updateSpawns(dtG, dt);
        // einde van de ronde
        if (R.hitFirst >= 0 && T >= R.decideAt) endRound();
        else if (R.hitFirst < 0 && R.ht > 32) { // veiligheidsklep: alles spoelt weg
          for (const p of pl) hitPlayer(p, 0, 1, 0, 0, 1, 'timeout');
          endRound();
        }
        if (R.hitFirst < 0 && pl.every((p) => p.st !== 'play')) endRound();
      } else if (R.state === 'end') {
        R.endT -= dt;
        updateCuckoos(0, dt); updateTilt(0, dt);
        R.freeze = Math.max(0, R.freeze - dt);
        if (R.endT <= 0) { if (R.matchOver) finishMatch(); else startRound(); }
      }
    }
    function endRound() {
      R.state = 'end'; R.endT = 2.7; R.tilt.st = 'back'; R.tilt.t = 0; R.strike = null; for (const k in hands) hands[k].ghost.visible = false;
      const fallen = pl.filter((p) => p.st !== 'play');
      for (const p of pl) p.surv += p.st === 'play' ? R.ht : (p.hitAt >= 0 ? p.hitAt : R.ht);
      if (fallen.length >= 2) {
        R.draws++; R.n--; hud.showBig('GELIJKSPEL!', 1300, '#ffd24a'); hud.toast('Allebei in de tandwielen! Opnieuw...', 1900); audio.sfx('lose', { vol: 0.5 });
        if (R.draws >= 2) R.matchOver = true;   // te vaak gelijk: overlevingstijd beslist
        R.endT = 2.4; refreshHud(); return;
      }
      const loser = fallen[0], winner = pl[1 - loser.i];
      winner.wins++; lastLoser = loser.i;
      winner.cheer = true; winner.c.pose = 'cheer'; audio.sfx('win', { vol: 0.5 });
      const over = winner.wins >= WIN_ROUNDS || (pl[0].wins + pl[1].wins) >= MAX_ROUNDS;
      hud.showBig(over ? 'KLOKKENKAMPIOEN!' : `${names[winner.i]} wint de ronde!`, 1500, winner.i ? '#4a8cff' : '#35c46f');
      if (!over) hud.toast(pick([`${names[loser.i]} is nu een tandwiel-pannenkoek.`, `Tik-tak! ${names[loser.i]} is te laat.`, `${names[loser.i]} zit tussen de raderen.`, `Hoogste tijd, ${names[loser.i]}!`]), 2000);
      refreshHud();
      if (over) R.matchOver = true;
    }
    function finishMatch() {
      if (done) return; done = true;
      let w = pl[0].wins > pl[1].wins ? 0 : pl[1].wins > pl[0].wins ? 1 : -1;
      if (w < 0) w = Math.abs(pl[0].surv - pl[1].surv) > 0.4 ? (pl[0].surv > pl[1].surv ? 0 : 1) : -1;
      const sc = [pl[0].wins, pl[1].wins];
      pl.forEach((p, i) => { p.cheer = i === w; if (p.st === 'play') p.c.pose = i === w ? 'cheer' : 'sad'; });
      const champ = w >= 0 ? names[w] : null, other = w >= 0 ? names[1 - w] : null;
      const jokes = champ ? [
        `${champ} springt als een kikker over de wijzers! ${other} zit nu tussen de tandwielen.`,
        `Het is hoogste tijd voor ${champ}: de nieuwe klokkenkampioen!`,
        `${champ} heeft de tijd aan zijn kant. ${other} heeft pech: zijn tijd is om.`,
        `Tik-tak-BOEM! ${champ} wint, ${other} draait nog een rondje in de raderen.`,
      ] : ['Precies even snel! De klok weet niet wie er gewonnen heeft.'];
      for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst(rand(-5, 5), 5 + rand(0, 3), rand(-3, 3), { count: 36, speed: 7, up: 1.2, life: 1.5, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 250);
      ctx.finishPvp({ winner: w >= 0 ? w : null, score: sc, delay: 1400, summary: `${pick(jokes)}${w < 0 ? '' : ''}` });
    }

    // ---------------- beeld ----------------
    function visuals(dt, animate = true) {
      const tilt = R.tilt;
      const tAmt = tilt.amt, ang = 0.14 * tAmt;
      A.rotation.x = tilt.dz * ang; A.rotation.z = -tilt.dx * ang;
      A.updateMatrixWorld();
      // wijzers
      for (const h of HL) {
        if (!h.m.visible && !h.on) continue;
        const base = h.pop > 0 ? 1 + h.pop * 0.5 : 1; h.pop = Math.max(0, h.pop - dt * 3);
        h.m.rotation.y = -h.theta; h.m.scale.set(1, base, 1);
        if (R.state === 'intro') { const k = smoothstep(0, 0.6, R.t); h.m.scale.x = h.m.scale.z = lerp(0.2, 1, k); h.m.scale.y = base * lerp(0.1, 1, k); }
      }
      // spelers
      pl.forEach((p, i) => {
        const sz = ctx.pvp.size(i); const VS = VSC * sz;
        p.sc = damp(p.sc, VS, 9, dt);
        const hold = p.holder, c = p.c;
        hold.scale.setScalar(Math.max(0.01, p.sc));
        hold.position.set(p.x, p.y, p.z);
        const flying = p.st === 'fly' || p.st === 'gone';
        if (flying) { hold.rotation.set(p.rot * 0.9, 0, p.rot * 0.7); c.faceDir(Math.sin(p.face), Math.cos(p.face)); }
        else { hold.rotation.set(0, 0, 0); c.faceDir(Math.sin(p.face), Math.cos(p.face)); }
        const sp = Math.hypot(p.vx, p.vz);
        c.speed = flying ? 0 : clamp(sp / (RUN * ctx.pvp.speed(i)), 0, 1) * (p.stun > 0 ? 0.3 : 1);
        c.air = p.y > 0.15 || flying;
        if (!flying) {
          if (p.cheer) c.pose = 'cheer'; else if (R.state === 'end' && p.st === 'play' && !p.cheer && R.hitFirst >= 0) c.pose = 'cheer'; else if (p.stun > 0) c.pose = 'scared'; else if (p.stamping) c.pose = 'push'; else c.pose = 'idle';
        } else c.pose = p.vy > -8 ? 'scared' : 'hands_up';
        if (animate) c.update(dt);
        p.dizzy.visible = p.stun > 0 && !flying; if (p.dizzy.visible) { p.dizzy.position.y = c.height + 0.5; p.dizzy.rotation.y += dt * 7; p.dizzy.scale.setScalar(1 / Math.max(0.5, p.sc) * 1.1); }
        // ring en schaduw op de plaat
        const on = p.st === 'play';
        p.rg.visible = on; p.rg.position.set(p.x, 0.05, p.z); p.rg.scale.setScalar(p.sc / VSC * 1.1 * (1 + Math.sin(T * 7 + i) * 0.03));
        p.blob.visible = on; p.blob.position.set(p.x, 0.04, p.z); p.blob.scale.setScalar(Math.max(0.5, 1.15 - p.y * 0.22) * p.sc / VSC * 1.15);
        p.tag.visible = p.st !== 'gone' && p.y > -6; const tw = wp(p.x, p.y + c.height * p.sc + 0.8, p.z); p.tag.position.copy(tw);
        // tikje trillen als de sprong net geland is
      });
      // lampjes etc.
      updateTower(W, T + introT, dt);
      // omgevingslicht: bevroren bij tijdstop
      freezeFlash = Math.max(0, freezeFlash - dt * 1.2);
      const fz = R.freeze > 0 ? 1 : 0;
      for (const h of HL) { const mm = h.m.userData.mat; if (!h.em0) { h.em0 = mm.emissive.getHex(); h.ei0 = mm.emissiveIntensity; } mm.emissive.setHex(fz ? 0x66d0ff : h.em0); mm.emissiveIntensity = fz ? 0.8 : h.ei0; }
      if (fz && animate && Math.random() < dt * 50) { const a = rand(0, TAU), r = rand(0, 10); const v = wp(Math.sin(a) * r, rand(2, 7), -Math.cos(a) * r); fx.particles.emit(v.x, v.y, v.z, rand(-0.4, 0.4), rand(-1.6, -0.8), rand(-0.4, 0.4), { life: 1.3, size: 0.26, color: 0xdff6ff, gravity: 0 }); }
      L.hemi.color.copy(hemiBase).lerp(COLD1, fz * 0.7); L.sun.color.copy(sunBase).lerp(COLD2, fz * 0.7);
      // zwevend stof
      if (animate && Math.random() < dt * 9) { const a = rand(0, TAU), r = rand(2, 12); fx.particles.emit(Math.sin(a) * r, rand(0.5, 6), -Math.cos(a) * r, rand(-0.2, 0.2), rand(0.1, 0.4), rand(-0.2, 0.2), { life: 3, size: 0.18, color: 0xffe3a0, gravity: -0.05 }); }
    }

    // camera
    const camP = new THREE.Vector3(), camL = new THREE.Vector3();
    function cam(dt, mode) {
      const sw = Math.sin(T * 0.25 + introT * 0.25);
      let wp_, wl;
      if (mode === 'intro') { const k = 0.5 + 0.5 * Math.sin(introT * 0.5); wp_ = [sw * 6, 12 + k * 6, 22 - k * 5]; wl = [0, 0, -1]; }
      else if (mode === 'result') { wp_ = [sw * 3, 10, 17]; wl = [0, 1.2, 0]; }
      else {
        const alive = pl.filter((p) => p.st === 'play'); let cx = 0, cz = 0; for (const p of alive) { cx += p.x; cz += p.z; } if (alive.length) { cx /= alive.length; cz /= alive.length; }
        const tx = R.tilt.dx * R.tilt.amt, tz = R.tilt.dz * R.tilt.amt;
        wp_ = [sw * 1.6 + cx * 0.1 + tx * 0.6, 19.2 + camPunch * 0.4, 16.8 + cz * 0.06 + tz * 0.4]; wl = [cx * 0.12, -0.6, -0.4 + cz * 0.1];
      }
      camPunch = Math.max(0, camPunch - dt * 2);
      if (!camP.lengthSq()) { camP.set(...wp_); camL.set(...wl); }
      const f = 1 - Math.exp(-4 * dt);
      camP.x = lerp(camP.x, wp_[0], f); camP.y = lerp(camP.y, wp_[1], f); camP.z = lerp(camP.z, wp_[2], f);
      camL.x = lerp(camL.x, wl[0], f); camL.y = lerp(camL.y, wl[1], f); camL.z = lerp(camL.z, wl[2], f);
      camera.position.copy(camP); camera.lookAt(camL);
    }

    // ---------------- hoofd-update ----------------
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt;
      if (!R.started) { R.started = true; startRound(); }
      // invoer vastleggen (per frame, voor de deelstappen)
      for (const p of pl) {
        const inp = ctx.pvp.input(p.i);
        p.jumpBuf = Math.max(0, p.jumpBuf - dt); if (inp.aP && R.state === 'fight') p.jumpBuf = 0.16;
        if (inp.bP && R.state === 'fight') p.stompReq = true;
        p.stun = Math.max(0, p.stun - dt); p.stompCd = Math.max(0, p.stompCd - dt);
      }
      updateRound(dt);
      if (done) return;
      const active = R.state === 'fight';
      const n = Math.ceil(dt / 0.0125), h = dt / n;
      const spMul = speedMul();
      const frz = R.freeze > 0 || R.state === 'end';
      const endSlow = R.state === 'end' ? Math.max(0, R.endT - 1.6) / 1.1 : 1;
      const tl = R.tilt;
      for (let s = 0; s < n; s++) {
        const tvx = tl.dx * tl.amt * 5.2, tvz = tl.dz * tl.amt * 5.2;
        for (const p of pl) stepPlayer(p, h, active, tvx, tvz);
        // wijzers draaien
        if (active) {
          for (const k of HL) {
            if (!k.on) continue;
            const om = frz ? 0 : k.dir * k.d.base * spMul;
            k.omega = om; if (om) setAngle(k, k.theta + om * h);
          }
          for (const p of pl) {
            if (p.st !== 'play') continue;
            const pr = PRC * ctx.pvp.size(p.i);
            for (const k of HL) {
              if (!k.on || k.dropY > 0.25 || k.spawn) continue;
              if (p.y < k.hh * 0.86 && overlaps(k, p.x, p.z, pr)) {
                const sgn = k.omega === 0 ? 0 : Math.sign(k.omega);
                hitPlayer(p, k.nx * sgn, k.nz * sgn, k.nx * sgn, k.nz * sgn, 1, k.k);
                audio.sfx('swing', { vol: 0.7 });
                break;
              }
            }
          }
          cuckooHits();
        } else if (R.state === 'end') {
          for (const k of HL) { if (!k.on) continue; const om = k.dir * k.d.base * spMul * endSlow * (k.k === 'gold' ? 1 : 0.6); if (om) setAngle(k, k.theta + om * h); }
        }
        // spelers botsen een beetje tegen elkaar
        const a = pl[0], b = pl[1];
        if (a.st === 'play' && b.st === 'play' && a.y < 1 && b.y < 1) {
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3, min = PRC * (ctx.pvp.size(0) + ctx.pvp.size(1)) * 1.1;
          if (d < min) { const o = (min - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o; }
        }
      }
      // ontsnapt een speler per ongeluk (deze situatie komt niet voor): sla over
      // wijzerplaat-effecten: lichtjes bij de wijzers
      if (active && !frz && Math.random() < dt * 10) { const k = hands.minute; const f = rand(2, k.len); const v = wp(k.dx * f, k.hh + 0.1, k.dz * f); fx.particles.emit(v.x, v.y, v.z, rand(-0.5, 0.5), rand(0.5, 1.4), rand(-0.5, 0.5), { life: 0.5, size: 0.2, color: 0xffe9a0, gravity: 0 }); }
      if (hands.second.on && active && !frz && Math.random() < dt * 24) { const k = hands.second; const f = rand(2, k.len); const v = wp(k.dx * f, 0.8, k.dz * f); fx.particles.emit(v.x, v.y, v.z, rand(-0.4, 0.4), rand(0.3, 1.0), rand(-0.4, 0.4), { life: 0.4, size: 0.18, color: 0xff5a4a, gravity: 0 }); }
      if (hands.gold.on && active && !frz && Math.random() < dt * 30) { const k = hands.gold; const f = rand(0.5, k.len); const q = rand(-2, 2); const v = wp(k.dx * f + k.nx * q, k.hh + 0.3, k.dz * f + k.nz * q); fx.particles.emit(v.x, v.y, v.z, rand(-0.5, 0.5), rand(0.5, 1.8), rand(-0.5, 0.5), { life: 0.7, size: 0.28, color: 0xffe27a, gravity: 0.5 }); }
      updateStar(dt);
      visuals(dt);
      cam(dt, 'play');
      // hint tijdens ronde: wie heeft de ster
      if (R.state === 'fight') { hud.setPlayerInfo(0, pl[0].st === 'play' ? `Gewonnen: ${pl[0].wins}` : 'Weggevlogen!'); hud.setPlayerInfo(1, pl[1].st === 'play' ? `Gewonnen: ${pl[1].wins}` : 'Weggevlogen!'); }
    }
    function resultUpdate(dt) {
      T += dt; visuals(dt); cam(dt, 'result');
      for (const k of HL) if (k.on) setAngle(k, k.theta + k.dir * k.d.base * 0.3 * dt);
    }
    function introUpdate(dt) {
      introT += dt;
      if (!R.started) {
        // decor: poppetjes staan klaar, wijzers draaien rustig
        pl.forEach((p, i) => { p.x = START[i][0]; p.z = START[i][1]; p.sc = VSC; p.c.pose = 'idle'; p.face = Math.atan2(-p.x, -p.z); });
        const hh = hands.hour, mm = hands.minute; if (!hh.on) { hh.on = true; mm.on = true; hh.m.visible = true; mm.m.visible = true; hh.dir = 1; mm.dir = 1; }
        setAngle(hh, hh.theta + dt * 0.25); setAngle(mm, mm.theta + dt * 0.6);
      }
      visuals(dt); cam(dt, 'intro');
    }

    // beginstand: wijzers en poppetjes
    introUpdate(0.016);
    refreshHud();
    return {
      update, resultUpdate, introUpdate,
      onStart() { refreshHud(); },
      onCountdown() { refreshHud(); },
      onSwap(sw) { for (const p of pl) { burst(p.x, 1.0, p.z, { count: 26, speed: 5, up: 1.2, life: 0.7, size: 0.35, colors: [0xffe14a, 0xff9ad5, 0x9fe4ff], gravity: 3 }); ftext('WISSEL!', p.x, 3.4, p.z, '#ffe14a', 1.0); } },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m) return; const p = pl[i]; if (p.st !== 'play') return; p.stun = 1.6; p.vx = p.vz = 0; ftext('BEWOOOG!', p.x, 3.4, p.z, '#ff5a5a', 1.2); audio.sfx('hurt', { vol: 0.5 }); });
      },
      celebrate(w) { pl.forEach((p, i) => { p.cheer = i === w; if (p.st === 'play') p.c.pose = i === w ? 'cheer' : 'sad'; }); },
      dispose() {},
      dbg: {
        state: () => ({ T, round: R.n, rstate: R.state, ht: R.ht, wins: pl.map((p) => p.wins), done, draws: R.draws, sd: R.sd, freeze: R.freeze, calm: R.calm, tilt: R.tilt.st, tiltAmt: R.tilt.amt, strike: !!R.strike, star: R.star ? { x: R.star.x, z: R.star.z } : null, starFor: R.starFor, surv: pl.map((p) => p.surv), hist,
          hands: Object.fromEntries(HL.map((h) => [h.k, { on: h.on, theta: h.theta, dir: h.dir, spawn: !!h.spawn, dropY: h.dropY }])),
          cuckoo: houses.map((h) => h.state),
          p: pl.map((p) => ({ x: p.x, z: p.z, y: p.y, vx: p.vx, vz: p.vz, st: p.st, stun: p.stun, stompCd: p.stompCd, jumpBuf: p.jumpBuf })) }),
        hands, houses, players: pl, R, spawnCuckoo, scheduleStrike, spawnSpecial, spawnStar, hitPlayer, startTilt: () => { R.tilt.st = 'hold'; R.tilt.t = 0; R.tilt.dx = 0.7; R.tilt.dz = 0.7; }, overlaps, speedMul, collectStar, startRound, setGod: (v) => { god = v; },
      },
    };
  },
};

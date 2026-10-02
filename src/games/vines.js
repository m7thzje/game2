import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { C, vineX, makeVine, buildJungle } from './vines_world.js';

// Lianen-Zwaaien — duel: zwaai van liaan naar liaan over de krokodillenrivier. Eerste aan de overkant wint.
// Fysica: eenvoudige slinger (hang) + kogelbaan (fly). A = vasthouden, links/rechts = duwen, B = Tarzan-schreeuw.

const TIME_LIMIT = 105;
const G_PEND = 26, G_FLY = 24, PUMP = 1.55, DAMP = 0.17;
const SC_T = 2.3;                 // doelhoogte poppetjes
const WATER_HIT = 1.7;            // hand-hoogte waarop je in het water plonst
const B_CD = 3.4;
const ROT_LIMIT = 3.2;

export default {
  id: 'vines',
  name: 'Lianen-Zwaaien',
  giver: 'Boswachter Bladerbaard',
  icon: '🌿',
  mode: 'pvp',
  time: 50,
  music: 'game',
  blurb: 'Zwaai als Tarzan van liaan naar liaan over de rivier vol <b>hongerige krokodillen</b>! Houd <b>A</b> vast, duw links/rechts mee met de zwaai en laat A los om te vliegen. Eerste aan de overkant wint. Pas op voor <b>apen</b>, <b>rotte lianen</b> en een <b>draak</b>!',
  controls: ['{a} vasthouden (loslaten = vliegen)', '{move} links/rechts duwen = zwaaien', '{b} Tarzan-schreeuw (boost)'],
  tip: 'Duw mee met de beweging van je poppetje: dan zwaai je steeds hoger. Wie achterstaat krijgt Tarzan-power!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('day', { shadow: 24, center: [20, 4, 0], fogNear: 80, fogFar: 200 });
    L.hemi.intensity = 1.15; L.hemi.color.set(0xd8f4ff); L.hemi.groundColor.set(0x5f8f5a); L.sun.color.set(0xfff1c0); L.sun.intensity = 2.1; L.sun.position.set(14, 40, 26);
    const W = buildJungle(ctx);
    camera.fov = 30; camera.updateProjectionMatrix(); camera.near = 1; camera.far = 400; camera.updateProjectionMatrix();

    // ---------------- helperteksturen ----------------
    const arrowTex = [-1, 1].map((d) => canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64); g.translate(32, 32); g.scale(d, 1);
      g.fillStyle = '#ffe14a'; g.strokeStyle = '#3a2a00'; g.lineWidth = 5; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-22, -9); g.lineTo(2, -9); g.lineTo(2, -22); g.lineTo(24, 0); g.lineTo(2, 22); g.lineTo(2, 9); g.lineTo(-22, 9); g.closePath(); g.stroke(); g.fill();
    }));
    const bTex = [true, false].map((ready) => canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64); g.fillStyle = ready ? '#3fe0a0' : '#7a8a88'; g.strokeStyle = '#0d2a20'; g.lineWidth = 5;
      g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '900 34px Fredoka, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#0d2a20'; g.strokeText('B', 32, 35); g.fillText('B', 32, 35);
    }));
    const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,240,140,.85)'); gr.addColorStop(0.5, 'rgba(120,255,160,.35)'); gr.addColorStop(1, 'rgba(120,255,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const ringTex = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = '#8dff9a'; g.lineWidth = 6; g.shadowColor = '#8dff9a'; g.shadowBlur = 8; g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.stroke(); });
    const starTex = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.translate(32, 33); g.fillStyle = '#ffe14a'; g.strokeStyle = '#a86a00'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 11 : 26; const a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.stroke(); g.fill(); });

    // ---------------- lianen per baan ----------------
    const rng = () => ctx.rng();
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const lanes = [0, 1].map((i) => {
      const rotIdx = pick([1, 2, 4, 5]);
      let slideIdx = pick([1, 2, 4, 5, 6]); if (slideIdx === rotIdx) slideIdx = 6;
      const vines = [];
      for (let k = 0; k < C.N; k++) {
        const kind = k === 3 ? 'gold' : k === rotIdx ? 'rotten' : 'normal';
        const grp = makeVine(kind); scene.add(grp);
        const v = { k, kind, grp, th: (rng() - 0.5) * 0.2, w: (rng() - 0.5) * 0.4, base: vineX(k) + C.OFF[i], slide: k === slideIdx ? 1.5 : 0, ph: rng() * TAU, held: false, broken: 0, shake: 0 };
        if (v.slide) {
          const tr = mesh(new THREE.BoxGeometry(1.2, 0.35, 0.8), mat(0x6b4a2e), { cast: false }); scene.add(tr); v.trolley = tr;
          const trk = mesh(new THREE.BoxGeometry(v.slide * 2 + 1.6, 0.12, 0.5), mat(0x3a2a1c), { cast: false, pos: [v.base, C.PY + 0.75, C.LZ[i]] }); scene.add(trk);
          for (const sx of [-1, 1]) { const arrow = mesh(new THREE.ConeGeometry(0.28, 0.5, 4), glowMat(), { cast: false, pos: [v.base + sx * (v.slide + 1.0), C.PY + 0.75, C.LZ[i]], rot: [0, 0, -sx * Math.PI / 2] }); scene.add(arrow); }
        }
        vines.push(v);
      }
      return { i, z: C.LZ[i], off: C.OFF[i], vines, rotIdx, slideIdx };
    });
    function glowMat() { return new THREE.MeshBasicMaterial({ color: 0xffe14a }); }
    const pivotX = (v, t) => v.base + (v.slide ? v.slide * Math.sin(t * 1.25 + v.ph) : 0);
    const pivotAcc = (v, t) => (v.slide ? -v.slide * 1.5625 * Math.sin(t * 1.25 + v.ph) : 0);

    // ---------------- spelers ----------------
    const pl = [0, 1].map((i) => {
      const c = makeBrother(i);
      const holder = new THREE.Group(); const inner = new THREE.Group(); holder.add(inner); inner.add(c.group); scene.add(holder);
      const sc = SC_T / c.height;
      const handH = c.legLen + 1.07 * c.s;
      c.faceDir(1, 0.28); c.yaw = c.targetYaw = Math.atan2(1, 0.28); c.group.rotation.y = c.yaw;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex[1], transparent: true, depthTest: false })); icon.scale.setScalar(0.9); icon.renderOrder = 14; icon.visible = false; holder.add(icon);
      const bIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: bTex[0], transparent: true, depthTest: false })); bIcon.scale.setScalar(0.85); bIcon.renderOrder = 14; holder.add(bIcon);
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); aura.scale.setScalar(5.5); aura.renderOrder = 11; aura.visible = false; holder.add(aura);
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false })); ring.scale.setScalar(2.2); ring.renderOrder = 13; ring.visible = false; holder.add(ring);
      const stars = new THREE.Group(); stars.visible = false; holder.add(stars);
      const starSprites = [0, 1, 2].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false })); s.scale.setScalar(0.55); s.renderOrder = 12; stars.add(s); return s; });
      // naamlabel
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,20,10,.9)'; g.lineJoin = 'round'; g.strokeText(players[i].name, w / 2, hh / 2); g.fillStyle = players[i].css; g.fillText(players[i].name, w / 2, hh / 2); }), transparent: true, depthTest: false })); tag.scale.set(2.3, 0.86, 1); tag.renderOrder = 15; holder.add(tag);
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.8, 14), new THREE.MeshBasicMaterial({ color: 0x0a2a2a, transparent: true, opacity: 0.0, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
      return {
        i, c, holder, inner, sc, handH, icon, bIcon, aura, ring, stars, starSprites, tag, blob,
        z: C.LZ[i], off: C.OFF[i], size: 1,
        state: 'hang', vine: 0, th: 0.1, w: 0.2, r: C.VL, x: 0, y: 0, vx: 0, vy: 0, armed: false, sinceRel: 9, lastVine: 0, noGrab: 0,
        stun: 0, cd: 0, goldT: 0, rotT: 0, tz: 0, prog: 0, best: 0, falls: 0, bananas: 0, yells: 0, swimT: 0, retT: 0, ret: null, sweet: false, yellT: 0, lean: 0, cheerT: 0, hintT: 0,
      };
    });

    // ---------------- toestand ----------------
    const dbgLog = [];
    let T = 0, playT = 0, done = false, winner = -1, frame = 0, resultT = 0, timeLeft = TIME_LIMIT, hintT = 9;
    let camX = 8, camDist = 36;
    let windNow = 0, gust = null, nextGust = 7 + rng() * 4;
    let bananaT = 11 + rng() * 3, dragonAt = [20 + rng() * 6, 52 + rng() * 6], dragonIdx = 0;

    function lerpAng(a, b, k) { return a + (b - a) * k; }
    function hangPos(p) {
      const v = lanes[p.i].vines[p.vine]; const px = pivotX(v, T);
      p.x = px + p.r * Math.sin(p.th); p.y = C.PY - p.r * Math.cos(p.th);
    }
    function startHang(p, k, r, th, w) {
      const v = lanes[p.i].vines[k]; v.held = true;
      p.state = 'hang'; p.vine = k; p.r = r; p.th = th; p.w = w; p.rotT = 0; hangPos(p);
    }
    pl.forEach((p) => { startHang(p, 0, C.VL, 0.12, 0.25); p.size = ctx.pvp.size(p.i); p.holder.scale.setScalar(p.sc * p.size); });

    // ---------------- hulp: gust / wind ----------------
    function addGust(dir, str, dur, label) { gust = { dir, str, t: 0, dur }; if (label) hud.toast(label, 1800); audio.sfx('whoosh', { vol: 0.5, rate: 0.8 }); }

    // ---------------- effecten ----------------
    function splashAt(x, z, size = 1) {
      fx.particles.burst(x, 0.3, z, { count: Math.round(46 * size), speed: 6 * Math.sqrt(size), up: 1.8, spread: 0.8, life: 1.0, size: 0.4 * (0.7 + size * 0.3), colors: [0xffffff, 0xc8f4ff, 0x7fe0d0, 0xa8fff0], gravity: 14 });
      fx.particles.ring(x, 0.3, z, { count: 22, speed: 5, color: 0xe8fff8, size: 0.3, life: 0.6 });
      W.ripple(x, z, size); W.ripple(x, z, size * 1.4, 0.2);
      audio.sfx('splash', { vol: 0.8 * Math.min(1, size) });
      for (const d of W.ducks) if (Math.abs(d.g.position.x - x) < 8 && d.hop <= 0) { d.hop = 1; d.vy = 5 + Math.random() * 3; }
      for (const c of W.crocs) if (Math.abs(c.g.position.x - x) < 9) c.snap = 1;
    }
    function text(s, x, y, z, color, sc = 1.2) { fx.texts.add(s, x, y, z, color, sc); }

    function release(p, reason = 'free') {
      const v = lanes[p.i].vines[p.vine];
      let vx = p.r * p.w * Math.cos(p.th), vy = p.r * p.w * Math.sin(p.th);
      if (p.goldT > 0) { vx *= 1.25; vy *= 1.15; }
      p.state = 'fly'; p.vx = vx; p.vy = vy; p.sinceRel = 0; p.lastVine = p.vine; p.armed = false;
      p.lastRel = { th: +p.th.toFixed(2), w: +p.w.toFixed(2), vx: +vx.toFixed(1), vy: +vy.toFixed(1), wind: +windNow.toFixed(2), vine: p.vine, t: +T.toFixed(1), pc: predictCatch(p) };
      v.held = false; v.th = p.th; v.w = p.w * 0.35;
      if (reason === 'free') { audio.sfx('jump', { vol: 0.35, rate: 1.3 }); }
      fx.particles.burst(p.x, p.y - 0.8, p.z, { count: 6, speed: 2, up: 0.5, life: 0.4, size: 0.25, colors: [0xb6ff9a, 0xffffff], gravity: 2 });
    }
    function grab(p, k, vx, vy) {
      const lane = lanes[p.i]; const v = lane.vines[k]; const px = pivotX(v, T);
      const dx = p.x - px, dy = p.y - C.PY;
      const r = clamp(Math.hypot(dx, dy), 3.0, C.VL), th = Math.atan2(dx, -dy);
      const tang = vx * Math.cos(th) + vy * Math.sin(th);
      startHang(p, k, r, th, clamp(tang / r * (v.kind === 'rotten' ? 0.55 : 0.22) + v.w * 0.1, -3.2, 3.2));
      p.armed = true; p.best = Math.max(p.best, k); p.noGrab = 0;
      audio.sfx('pop', { vol: 0.5, rate: 1.2 });
      fx.particles.burst(p.x, p.y, p.z, { count: 10, speed: 3, up: 0.8, life: 0.5, size: 0.3, colors: [0xb6ff9a, 0xffffff, 0x5cc24c], gravity: 6 });
      if (v.kind === 'gold') {
        p.goldT = 3.4; p.cd = 0;
        text('⭐ GOUDEN LIAAN!', p.x, p.y + 2.4, p.z, '#ffd23f', 1.3); audio.sfx('powerup', { vol: 0.6 });
        fx.particles.burst(p.x, p.y, p.z, { count: 30, speed: 6, up: 1, life: 1.0, size: 0.4, colors: [0xffd23f, 0xffffff, 0xffe98a], gravity: 3 });
      }
      p.hintT = 0;
    }
    function dropInWater(p, x) {
      (dbgLog.push({ i: p.i, t: +T.toFixed(1), x: +x.toFixed(1), rel: p.lastRel, st: p.state })); p.state = 'swim'; p.swimT = 0; p.falls++; p.armed = false; p.stun = 0; p.goldT = 0; p.rotT = 0; p.x = x; p.y = 0.2 + WATER_HIT * p.size; p.vx = 0; p.vy = 0;
      const v = lanes[p.i].vines[p.vine]; v.held = false;
      splashAt(x, p.z, 1.3); ctx.shake(0.45);
      text('PLONS!', x, 4.4, p.z + 1, '#8fe8ff', 1.5);
      const ch = W.chompers[p.i]; ch.g.visible = true; ch.state = 'delay'; ch.t = 0; ch.x = x + 1.1; ch.z = p.z + 0.3; ch.g.position.set(ch.x, -1.8, ch.z); ch.g.rotation.y = Math.PI;
      p.c.pose = 'hands_up';
    }
    function startReturn(p, from) {
      p.state = 'return'; p.retT = 0;
      const v = lanes[p.i].vines[p.vine]; v.held = true;
      p.ret = { x0: from.x, y0: from.y, vx: pivotX(v, T), };
    }

    // ---------------- doel ----------------
    function reachGoal(p) {
      p.state = 'won'; p.x = C.GOAL_U + p.off + 2.4 + p.i * 0.7; p.y = C.BANK_Y;
      p.vx = p.vy = 0;
      win(p.i);
    }
    function win(i, why = '') {
      if (done) return; done = true; winner = i;
      const w = pl[i], l = pl[1 - i];
      if (!why) { w.state = 'won'; w.x = C.GOAL_U + w.off + 2.4; w.y = C.BANK_Y; } w.cheerT = 99;
      audio.sfx('win', { vol: 0.5 }); ctx.shake(0.35);
      hud.showBig(`${names[i]} wint!`, 1600, i ? '#4a8cff' : '#35c46f');
      for (let k = 0; k < 7; k++) setTimeout(() => { try { fx.particles.burst(w.x + (Math.random() - 0.5) * 6, C.BANK_Y + 3 + Math.random() * 4, w.z + (Math.random() - 0.5) * 3, { count: 36, speed: 7, up: 1.2, life: 1.5, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 230);
      const jokes = [`${names[i]} zwaait als een echte Tarzan! ${names[1 - i]} nam een duikje.`, `De krokodillen hebben honger, maar ${names[i]} was te snel.`, `${names[i]} landt in de schatkist! ${names[1 - i]} hangt nog ergens.`];
      const facts = [];
      if (pl[0].falls + pl[1].falls) facts.push(`${pl[0].falls + pl[1].falls}x in het water gevallen`);
      if (pl[0].bananas + pl[1].bananas) facts.push(`${pl[0].bananas + pl[1].bananas}x een banaan op je neus`);
      if (pl[0].yells + pl[1].yells) facts.push(`${pl[0].yells + pl[1].yells}x Tarzan-schreeuw`);
      const summary = `<b>${why || jokes[Math.floor(Math.random() * jokes.length)]}</b>${facts.length ? '<br>' + facts.join(' · ') : ''}`;
      ctx.finishPvp({ winner: i, score: [pct(pl[0]), pct(pl[1])], summary, delay: 2000 });
    }
    const pct = (p) => Math.round(clamp(p.prog / C.GOAL_U, 0, 1) * 100);

    // ---------------- bananen & draak & wind ----------------
    function launchBanana() {
      const [a, b] = pl; const lead = a.prog >= b.prog ? a : b, trail = lead === a ? b : a;
      const tgt = (Math.random() < 0.65 || !trail) ? lead : trail;
      if (tgt.state === 'swim' || tgt.state === 'return' || tgt.state === 'won') return false;
      const mk = W.monkeys.reduce((m, q) => (Math.abs(q.x + tgt.off - tgt.x) < Math.abs(m.x + tgt.off - tgt.x) ? q : m));
      const bn = W.bananas.find((q) => !q.on); if (!bn) return false;
      const lead2 = tgt.state === 'fly' ? tgt.vx : tgt.r * tgt.w * Math.cos(tgt.th);
      bn.on = true; bn.t = 0; bn.dur = 1.5; bn.lane = tgt.i; bn.hit = false;
      bn.sx = mk.g.position.x + 0.8; bn.sy = mk.g.position.y + 1.3; bn.sz = mk.g.position.z;
      bn.ex = tgt.x + lead2 * 0.75; bn.ey = tgt.y - 1.1; bn.ez = tgt.z;
      mk.state = 'throw'; mk.throwT = 0; bn.g.visible = true; bn.g.position.set(bn.sx, bn.sy, bn.sz);
      audio.sfx('throw', { vol: 0.5 }); mk.g.rotation.y = 0;
      W.monkeys.forEach((m) => { if (m !== mk) m.alert = 0.8; });
      text('!', mk.g.position.x, mk.g.position.y + 3, mk.g.position.z + 1, '#ffe14a', 1.4);
      return true;
    }
    function updateBananas(dt) {
      for (const bn of W.bananas) {
        if (!bn.on) continue;
        bn.t += dt; const s = bn.t / bn.dur;
        const x = lerp(bn.sx, bn.ex, s), z = lerp(bn.sz, bn.ez, s), y = lerp(bn.sy, bn.ey, s) + Math.sin(Math.min(1, s) * Math.PI) * 2.2 - (s > 1 ? (s - 1) * (s - 1) * 22 : 0);
        bn.g.position.set(lerp(bn.sx, bn.ex, Math.min(s, 1.8)), y, lerp(bn.sz, bn.ez, Math.min(s, 1.8)));
        bn.g.position.x = bn.sx + (bn.ex - bn.sx) * s; bn.g.rotation.z += dt * 12; bn.g.rotation.x += dt * 5;
        const p = pl[bn.lane];
        if (!bn.hit && s > 0.6 && (p.state === 'hang' || p.state === 'fly')) {
          const d = Math.hypot(bn.g.position.x - p.x, bn.g.position.y - (p.y - 1.0 * p.size), (bn.g.position.z - p.z) * 0.4);
          if (d < 1.55 * p.size) {
            bn.hit = true; bn.on = false; bn.g.visible = false; p.bananas++;
            p.stun = 1.1; audio.sfx('hit', { vol: 0.7 }); audio.sfx('boing', { vol: 0.5 }); ctx.shake(0.3);
            text('BANAAN!', p.x, p.y + 1.6, p.z + 1, '#ffe14a', 1.4);
            fx.particles.burst(bn.g.position.x, bn.g.position.y, p.z, { count: 16, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xfff6a0, 0xffffff], gravity: 8 });
            if (p.state === 'hang') { p.w *= 0.25; p.th *= 0.6; } else { p.vx *= 0.35; p.vy = Math.min(p.vy, 0) - 1.5; }
            continue;
          }
        }
        if (y < 0.2 || s > 2.2) { bn.on = false; bn.g.visible = false; if (y < 0.6) { splashAt(bn.g.position.x, bn.g.position.z, 0.5); } }
      }
    }
    function updateWorldEvents(dt) {
      // wind
      nextGust -= dt;
      if (nextGust <= 0 && !gust) { addGust(Math.random() < 0.5 ? -1 : 1, 0.7 + Math.random() * 0.3, 3.2, null); nextGust = 9 + Math.random() * 6; hud.toast(gust.dir > 0 ? '💨 Windvlaag naar rechts!' : '💨 Windvlaag naar links!', 1800); }
      if (gust) { gust.t += dt; if (gust.t >= gust.dur) gust = null; }
      windNow = gust ? gust.dir * gust.str * Math.sin(Math.PI * gust.t / gust.dur) : 0;
      windNow += Math.sin(T * 0.7) * 0.06;
      if (Math.abs(windNow) > 0.3 && Math.random() < dt * 30) fx.particles.emit(camX + (windNow > 0 ? -22 : 22), 3 + Math.random() * 9, -3 + Math.random() * 8, windNow * 24, -0.6 + Math.random(), 0, { life: 1.9, size: 0.3, color: Math.random() < 0.5 ? 0x7ad070 : 0xc8f0a0, gravity: 0 });
      // bananen
      bananaT -= dt; if (bananaT <= 0) { if (launchBanana()) bananaT = 5.5 + Math.random() * 3; else bananaT = 1.5; }
      updateBananas(dt);
      // draak
      if (dragonIdx < dragonAt.length && playT >= dragonAt[dragonIdx]) {
        if (W.startDragon(camX, 9)) { dragonIdx++; hud.toast('🐉 Een draak! Hou je vast!', 2200); audio.tone(150, 1.0, { type: 'sawtooth', vol: 0.28, slide: 55, filter: 900 }); audio.sfx('hurt', { vol: 0.2, rate: 0.5 }); }
      }
      const dr = W.dragonState;
      if (dr.on) {
        const k = dr.t / dr.dur;
        if (k > 0.35 && k < 0.65 && !gust) addGust(-1, 1.0, 2.8, null);
        if (k > 0.4 && dr.fire <= 0 && !dr.fired) { dr.fired = true; dr.fire = 1.6; audio.sfx('sizzle', { vol: 0.5 }); audio.tone(120, 0.8, { type: 'sawtooth', vol: 0.2, slide: 70, filter: 700 }); for (const d of W.ducks) { d.hop = 1; d.vy = 6 + Math.random() * 3; } }
      } else dr.fired = false;
    }

    // ---------------- fysica per speler ----------------
    const BLANK = { x: 0, y: 0, a: false, b: false, aP: false, bP: false };
    function inputOf(p) { return done ? BLANK : ctx.pvp.input(p.i); }
    function stepPlayer(p, dt) {
      const inp = inputOf(p);
      p.stun = Math.max(0, p.stun - dt); p.cd = Math.max(0, p.cd - dt); p.goldT = Math.max(0, p.goldT - dt); p.noGrab = Math.max(0, p.noGrab - dt); p.sinceRel += dt;
      p.size = ctx.pvp.size(p.i);
      const ts = ctx.pvp.speed(p.i);
      const slip = ctx.pvp.slip, grav = ctx.pvp.gravity;
      const gP = G_PEND * (0.45 + 0.55 * grav), gF = G_FLY * (0.55 + 0.45 * grav);
      // comeback: Tarzan-power
      const other = pl[1 - p.i];
      const lag = other.prog - p.prog;
      p.tz = damp(p.tz, clamp((lag - 6) / 10, 0, 1), 2, dt);
      const bcd = B_CD * (1 - 0.55 * p.tz);

      if (p.state === 'hang') {
        if (inp.a) p.armed = true;
        const v = lanes[p.i].vines[p.vine];
        // B = Tarzan-schreeuw
        if (inp.bP && p.cd <= 0 && p.stun <= 0) {
          const sg = Math.abs(p.w) > 0.15 ? Math.sign(p.w) : (Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) : 1);
          p.w += sg * (0.95 + 0.4 * p.tz); p.cd = bcd; p.yells++; p.yellT = 0.6; yellFx(p);
        }
        if (p.armed && !inp.a) { release(p); return; }
        // rotte liaan
        if (v.kind === 'rotten' && v.broken <= 0) {
          p.rotT += dt * ts;
          v.shake = p.rotT > 2.0 ? 1 : 0;
          if (p.rotT > 2.0 && !p.rotWarn) { p.rotWarn = true; audio.sfx('creak', { vol: 0.7 }); text('KRAAK!', p.x, p.y + 2.4, p.z + 1, '#ff9a5a', 1.3); }
          if (p.rotT > ROT_LIMIT + 0.8 * p.tz) { snapVine(p, v); return; }
        } else { p.rotWarn = false; }
        const n = Math.max(1, Math.ceil(dt * ts / 0.012)), h = dt * ts / n;
        const cdamp = lerp(DAMP, 0.03, slip);
        for (let s = 0; s < n; s++) {
          const E = 0.5 * p.w * p.w + (gP / p.r) * (1 - Math.cos(p.th)), Emax = (gP / p.r) * (1 - Math.cos(1.05 + 0.1 * p.tz + (1 - grav) * 0.25));
          const cap = clamp((Emax - E) / (0.3 * Emax), 0, 1);
          let x = p.stun > 0 ? 0 : inp.x;
          const tau = PUMP * x * cap * (1 + 0.7 * p.tz) * (p.goldT > 0 ? 2.0 : 1) + windNow * 0.9 * (C.VL / p.r);
          const pax = pivotAcc(v, T);
          const acc = -(gP / p.r) * Math.sin(p.th) - (cdamp + (E > Emax * 1.15 ? 0.9 : 0)) * p.w + tau - (pax / p.r) * Math.cos(p.th);
          p.w += acc * h; p.th += p.w * h;
          if (p.th > 1.45) { p.th = 1.45; p.w = Math.min(p.w, 0) * 0.3; } else if (p.th < -1.45) { p.th = -1.45; p.w = Math.max(p.w, 0) * 0.3; }
        }
        hangPos(p); v.th = p.th; v.w = p.w;
        if (Math.abs(p.w) > 1.5 && Math.abs(p.th) < 0.12 && Math.random() < dt * 8) audio.sfx('whoosh', { vol: 0.12 + Math.abs(p.w) * 0.05, rate: 1 + Math.abs(p.w) * 0.15 });
        p.u = p.x - p.off; p.prog = Math.max(p.prog, p.u);
      } else if (p.state === 'fly') {
        if (inp.bP && p.cd <= 0 && p.stun <= 0) { p.vx += 3.6 + 1.2 * p.tz; p.vy += 1.4; p.cd = bcd; p.yells++; p.yellT = 0.6; yellFx(p); }
        const n = Math.max(1, Math.ceil(dt * ts / 0.012)), h = dt * ts / n;
        const lane = lanes[p.i];
        let grabbed = false;
        for (let s = 0; s < n && !grabbed; s++) {
          const ax = (p.stun > 0 ? 0 : inp.x) * 6 + windNow * 4.5;
          p.vx += ax * h; p.vy -= gF * h; p.vx *= (1 - 0.02 * h); p.x += p.vx * h; p.y += p.vy * h;
          // grijpen?
          if (inp.a && p.sinceRel > 0.14 && p.noGrab <= 0 && p.stun <= 0) {
            let best = null, bd = 1e9; const reach = 2.0 * p.size * (1 + 0.3 * p.tz) * (p.goldT > 0 ? 1.15 : 1);
            for (const v of lane.vines) {
              if (v.broken > 0) continue; if (v.k === p.lastVine && p.sinceRel < 0.7) continue;
              const px = pivotX(v, T), dx = p.x - px, dy = p.y - C.PY;
              const ux = Math.sin(v.th), uy = -Math.cos(v.th);
              const t = clamp(dx * ux + dy * uy, 2.6, C.VL);
              const cx = px + ux * t, cy = C.PY + uy * t;
              const d = Math.hypot(p.x - cx, p.y - cy);
              if (d < reach && d < bd) { bd = d; best = v; }
            }
            if (best) { grab(p, best.k, p.vx, p.vy); grabbed = true; }
          }
        }
        if (grabbed) { p.u = p.x - p.off; p.prog = Math.max(p.prog, p.u); return; }
        p.u = p.x - p.off; p.prog = Math.max(p.prog, p.u);
        const feet = p.y - p.handH * p.sc * p.size * 0.0 - 2.0 * p.size;
        // overkant
        if (p.x >= C.GOAL_U + p.off - 0.4) {
          if (feet >= C.BANK_Y - 0.6 && !done) { reachGoal(p); return; }
          p.x = C.GOAL_U + p.off - 0.4; p.vx = -1.8; text('AU!', p.x - 0.5, p.y + 1.4, p.z + 1, '#ff7a5a', 1.2); audio.sfx('hit', { vol: 0.6 });
        }
        // startoever (terugvallen)
        if (p.x < 0.9 + p.off && feet < C.BANK_Y + 0.2 && p.vy < 0) {
          startReturn(p, { x: p.x, y: p.y }); p.swimT = 0; text('Oeps, terug!', p.x, p.y + 1.6, p.z + 1, '#bfe8ff', 1.1); return;
        }
        if (p.y < WATER_HIT * p.size) dropInWater(p, p.x);
      } else if (p.state === 'swim') {
        p.swimT += dt;
        const ch = W.chompers[p.i];
        p.y = (WATER_HIT - 0.5) * p.size + Math.sin(p.swimT * 6) * 0.1; p.x += windNow * dt * 0.5;
        if (ch.state === 'delay' && p.swimT > 0.5) { ch.state = 'rise'; ch.t = 0; audio.sfx('splash', { vol: 0.35, rate: 0.6 }); W.ripple(ch.x, ch.z, 1.2); }
        if (ch.state === 'wait' && p.swimT > 1.25) {
          ch.state = 'chomp'; ch.t = 0; audio.sfx('hit', { vol: 0.7 }); audio.sfx('bad', { vol: 0.3 }); text('HAP!', ch.x, 3.5, ch.z + 1, '#ff7a5a', 1.5); ctx.shake(0.3);
          fx.particles.burst(ch.x, 1, ch.z, { count: 20, speed: 5, up: 1.4, life: 0.8, size: 0.4, colors: [0xffffff, 0xc8f4ff], gravity: 12 });
        }
        if (p.swimT > 1.45) { startReturn(p, { x: ch.x, y: 1.5 }); }
      } else if (p.state === 'return') {
        p.retT += dt; const s = clamp(p.retT / 0.95, 0, 1), e = s * s * (3 - 2 * s);
        const v = lanes[p.i].vines[p.vine]; const tx = pivotX(v, T), ty = C.PY - C.VL;
        p.x = lerp(p.ret.x0, tx, e); p.y = lerp(p.ret.y0, ty, e) + Math.sin(s * Math.PI) * 6.5;
        if (s >= 1) { startHang(p, p.vine, C.VL, 0, 0); p.armed = false; p.noGrab = 0.3; v.th = 0; audio.sfx('pop', { vol: 0.5 }); fx.particles.burst(p.x, p.y, p.z, { count: 10, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xb6ff9a, 0xffffff], gravity: 5 }); }
      }
      p.u = p.x - p.off;
    }
    function snapVine(p, v) {
      v.broken = 1.8; v.held = false; v.shake = 0; p.rotT = 0; p.rotWarn = false;
      text('KNAP!', p.x, p.y + 2.2, p.z + 1, '#ff7a5a', 1.5); audio.sfx('wood', { vol: 0.7 }); ctx.shake(0.35);
      fx.particles.burst(vineXat(v), C.PY - 2, p.z, { count: 26, speed: 5, up: 1, life: 0.9, size: 0.4, colors: [0x5cc24c, 0x8a6aa0, 0x6a4c3c], gravity: 10 });
      const vx = p.r * p.w * Math.cos(p.th), vy = p.r * p.w * Math.sin(p.th);
      p.state = 'fly'; p.vx = vx; p.vy = vy; p.sinceRel = 0; p.lastVine = p.vine; p.armed = false; p.noGrab = 0.45;
    }
    const vineXat = (v) => pivotX(v, T);
    function yellFx(p) {
      const col = p.i ? '#7ab8ff' : '#7aff9a';
      text(['AAAAH-AH-AAAH!', 'OEEEH-OEEEH!', 'AWOEWOEWOE!'][Math.floor(Math.random() * 3)], p.x, p.y + 2.6, p.z + 1, '#ffd23f', 1.7);
      fx.particles.ring(p.x, p.y - 1.2, p.z, { count: 26, speed: 8, color: 0xffe98a, size: 0.4, life: 0.5 });
      fx.particles.burst(p.x, p.y - 1, p.z, { count: 18, speed: 6, up: 0.6, life: 0.8, size: 0.4, colors: [0x7ad070, 0xc8f0a0, 0xffe14a], gravity: 3 });
      audio.tone(300, 0.18, { type: 'sawtooth', vol: 0.2, slide: 700, filter: 2500 }); audio.tone(700, 0.2, { type: 'sawtooth', vol: 0.2, slide: 380, delay: 0.17, filter: 2500 }); audio.tone(360, 0.22, { type: 'sawtooth', vol: 0.2, slide: 860, delay: 0.37, filter: 2500 });
      ctx.shake(0.2);
      W.monkeys.forEach((m) => { m.alert = 0.6; });
      for (const d of W.ducks) if (Math.abs(d.g.position.x - p.x) < 10 && d.hop <= 0) { d.hop = 1; d.vy = 4 + Math.random() * 3; }
    }

    // ---------------- vooruitblik: lukt loslaten nu? ----------------
    function predictCatch(p) {
      if (p.state !== 'hang') return false;
      const lane = lanes[p.i];
      let vx = p.r * p.w * Math.cos(p.th), vy = p.r * p.w * Math.sin(p.th);
      if (p.goldT > 0) { vx *= 1.25; vy *= 1.15; }
      let x = p.x, y = p.y; const gF = G_FLY * (0.55 + 0.45 * ctx.pvp.gravity); const dt = 0.04; const reach = 1.5 * p.size;
      for (let s = 0; s < 45; s++) {
        vy -= gF * dt; x += vx * dt; y += vy * dt;
        if (y < 2.2) break;
        for (const v of lane.vines) {
          if (v.k === p.vine || v.broken > 0) continue;
          const px = pivotX(v, T); const t = clamp(((x - px) * 0 + (C.PY - y)), 2.6, C.VL);
          const d = Math.hypot(x - px, y - (C.PY - t));
          if (d < reach) return v.k > p.vine || p.vine === 0;
        }
        if (x > C.GOAL_U + p.off - 0.4 && y - 2 >= C.BANK_Y - 0.6) return true;
      }
      return false;
    }

    // ---------------- visuals ----------------
    function visuals(dt) {
      // vrije lianen: uitzwaaien
      for (const lane of lanes) {
        for (const v of lane.vines) {
          if (!v.held && v.broken <= 0) {
            const gp = G_PEND * (0.45 + 0.55 * ctx.pvp.gravity);
            const acc = -(gp / C.VL) * Math.sin(v.th) - 0.35 * v.w + windNow * 0.8;
            v.w += acc * dt; v.th += v.w * dt;
          }
          if (v.broken > 0) {
            v.broken -= dt;
            if (v.broken <= 0) {
              v.th = 0; v.w = 0;
              if (v.kind === 'rotten') { scene.remove(v.grp); v.kind = 'normal'; v.grp = makeVine('normal'); scene.add(v.grp); }   // een verse, gezonde liaan
              v.grp.scale.setScalar(0.01); fx.particles.burst(pivotX(v, T), C.PY - 1, lane.z, { count: 12, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0x5cc24c, 0xb6ff9a], gravity: 4 });
            }
          }
          if (v.grp.scale.x < 1 && v.broken <= 0) v.grp.scale.setScalar(Math.min(1, v.grp.scale.x + dt * 3));
          v.grp.visible = v.broken <= 0 || v.broken > 99;
          const px = pivotX(v, T);
          v.grp.position.set(px + (v.shake ? Math.sin(T * 60) * 0.06 : 0), C.PY, lane.z);
          v.grp.rotation.z = v.th;
          if (v.trolley) v.trolley.position.set(px, C.PY + 0.75, lane.z);
          if (v.kind === 'gold') { v.grp.userData.pm.emissiveIntensity = 0.55 + Math.sin(T * 5 + v.k) * 0.25; if (Math.random() < dt * 6) fx.particles.emit(px + Math.sin(v.th) * (Math.random() * C.VL), C.PY - Math.cos(v.th) * (Math.random() * C.VL), lane.z + 0.2, 0, 0.4, 0, { life: 0.7, size: 0.22, color: 0xfff0a0, gravity: 0 }); }
          if (v.kind === 'rotten' && v.shake) v.grp.userData.puffs.forEach((q, k) => { q.material.color.setHex(Math.sin(T * 20 + k) > 0 ? 0xff7a5a : 0x8a6aa0); });
        }
      }
      for (const p of pl) charVisual(p, dt);
    }
    function charVisual(p, dt) {
      const c = p.c, hd = p.holder;
      const sz = p.sc * p.size;
      hd.scale.setScalar(sz);
      // positie / houding per toestand
      let pose = 'hands_up', air = false, lean = 0, py = p.y, px = p.x;
      c.group.position.y = -p.handH;
      p.inner.rotation.z = 0;
      if (p.state === 'hang') {
        p.inner.rotation.z = p.th + Math.sin(T * 5 + p.i) * 0.02 * Math.abs(p.w);
        pose = p.yellT > 0 ? 'cheer' : 'hands_up';
      } else if (p.state === 'fly') {
        air = true; pose = 'idle'; lean = clamp(-p.vx * 0.035, -0.5, 0.35); p.inner.rotation.z = lean + Math.sin(T * 14) * 0.03;
        if (p.yellT > 0) pose = 'cheer';
      } else if (p.state === 'swim') {
        pose = 'hands_up'; p.inner.rotation.z = Math.sin(T * 7) * 0.12; c.group.position.y = -p.handH * 1.0;
      } else if (p.state === 'return') {
        air = true; pose = 'scared'; p.inner.rotation.z = -p.retT * 14;
      } else if (p.state === 'won') {
        pose = 'cheer'; c.group.position.y = 0; py = C.BANK_Y + Math.abs(Math.sin(T * 6)) * 0.6; px = p.x;
      }
      if (done && p.state !== 'won') { pose = p.i === winner ? 'cheer' : (p.state === 'hang' ? 'sad' : pose); }
      p.yellT = Math.max(0, p.yellT - dt);
      c.pose = pose; c.air = air; c.speed = 0;
      hd.position.set(px, py, p.z);
      c.update(dt);
      if (p.state === 'hang') { // benen zwaaien mee
        c.legL.rotation.x = 0.3 + Math.sin(T * 7) * 0.05 + p.w * 0.1; c.legR.rotation.x = 0.1 - p.w * 0.1;
      }
      // iconen
      const showB = p.state === 'hang' || p.state === 'fly';
      p.bIcon.visible = showB && !done; p.bIcon.position.set(0.95, 0.75, 0.1);
      p.bIcon.material.map = bTex[p.cd <= 0 ? 0 : 1]; p.bIcon.material.opacity = p.cd <= 0 ? 1 : 0.55;
      p.bIcon.scale.setScalar(p.cd <= 0 ? 0.85 + Math.sin(T * 6) * 0.05 : 0.7);
      const hintOn = p.state === 'hang' && !done && (playT < 14 || Math.abs(p.th) < 0.35) && p.stun <= 0;
      p.icon.visible = hintOn;
      if (hintOn) { const dir = Math.abs(p.w) > 0.04 ? Math.sign(p.w) : 1; p.icon.material.map = arrowTex[dir > 0 ? 1 : 0]; p.icon.position.set(-0.85, 0.75, 0.1); p.icon.material.opacity = 0.85; }
      p.tag.position.set(0, 1.75, 0);
      p.tag.visible = !done;
      const tzOn = p.tz > 0.2 && !done;
      p.aura.visible = tzOn; if (tzOn) { p.aura.position.set(0, -p.handH * 0.5, 0); p.aura.scale.setScalar(4.5 + Math.sin(T * 7) * 0.3); p.aura.material.opacity = 0.5 * p.tz + 0.2; if (Math.random() < dt * 18) fx.particles.emit(p.x + (Math.random() - 0.5) * 1.6, p.y - 0.4 - Math.random() * 1.6, p.z + 0.5, (Math.random() - 0.5), 1 + Math.random(), 0, { life: 0.7, size: 0.28, color: Math.random() < 0.5 ? 0xffe14a : 0x8dff9a, gravity: -1 }); }
      // sweet spot
      p.hintT -= dt;
      if (p.hintT <= 0) { p.hintT = 0.1; p.sweet = p.tz > 0.15 && p.state === 'hang' && predictCatch(p); }
      p.ring.visible = p.sweet && !done; if (p.sweet) { p.ring.position.set(0, 0.1, 0.2); p.ring.scale.setScalar(2.0 + Math.sin(T * 14) * 0.25); }
      // sterretjes
      const stunned = p.stun > 0 && p.state !== 'swim';
      p.stars.visible = stunned; if (stunned) { p.stars.position.set(0, -0.35, 0); p.starSprites.forEach((s, k) => { const a = T * 6 + k * TAU / 3; s.position.set(Math.cos(a) * 0.75, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.5); }); }
      // schaduwblob op het water
      p.blob.position.set(p.x, 0.05, p.z); const hh = Math.max(0, p.y - 2);
      p.blob.material.opacity = (p.state === 'hang' || p.state === 'fly') ? clamp(0.28 - hh * 0.02, 0, 0.28) : 0; p.blob.scale.setScalar(1 + hh * 0.05);
      // zwemmen: onderkant onder water
      if (p.state === 'swim') { c.group.visible = true; }
    }

    // ---------------- hud ----------------
    function updateHud() {
      pl.forEach((p) => {
        hud.setPlayerInfo(p.i, `${pct(p)}% van de rivier${p.tz > 0.3 ? '  🦍 Tarzan-power!' : ''}`);
      });
      hud.setScore(`${names[0]} ${pct(pl[0])}%  –  ${pct(pl[1])}% ${names[1]}`);
    }

    // ---------------- camera ----------------
    const camLook = new THREE.Vector3();
    function cam(dt, first = false) {
      const xs = pl.map((p) => p.x), lead = Math.max(xs[0], xs[1]), trail = Math.min(xs[0], xs[1]);
      let tx = (lead + trail) / 2 + (lead - trail) * 0.04 + 3;
      let spread = lead - trail;
      if (winner >= 0) { tx = pl[winner].x - 3; spread = 4; }
      const asp = camera.aspect || 1.7, tv = Math.tan(camera.fov * Math.PI / 360);
      const needHalfW = spread / 2 + 12;
      const tdist = clamp(Math.max(needHalfW / (tv * asp), 8.4 / tv), 30, 80);
      camX = first ? tx : damp(camX, tx, 3.2, dt); camDist = first ? tdist : damp(camDist, tdist, 1.6, dt);
      const cy = 6.0 + Math.max(0, camDist - 30) * 0.06;
      camera.position.set(camX, cy + 7.0, camDist);
      camLook.set(camX, cy + 0.3, 0); camera.lookAt(camLook);
      // zon + schaduw volgt de camera
      L.sun.position.set(camX + 14, 40, 26); L.sun.target.position.set(camX, 3, 0); L.sun.target.updateMatrixWorld();
    }

    // ---------------- loop ----------------
    function common(dt) {
      visuals(dt); W.update(T, dt, camX); cam(dt);
    }
    updateHud(); hud.setTimer(TIME_LIMIT);
    hud.setHint('Houd <b>A</b> vast · duw ◀ ▶ mee met de zwaai · laat <b>A</b> los om te vliegen!');
    pl.forEach((p) => p.c.update(0.016));
    cam(0.016, true); visuals(0.016);

    return {
      update(dt) {
        if (done) { resultUpdate(dt); return; }
        T += dt; playT += dt; timeLeft -= dt;
        hud.setTimer(Math.max(0, timeLeft), 15);
        if (hintT > 0) { hintT -= dt; if (hintT <= 0) hud.setHint(null); }
        updateWorldEvents(dt);
        const order = (frame++ & 1) ? [1, 0] : [0, 1];
        for (const i of order) if (!done) stepPlayer(pl[i], dt);
        // lianen die breken
        updateHud();
        common(dt);
        if (timeLeft <= 0 && !done) {
          const a = pl[0].prog, b = pl[1].prog;
          win(a >= b ? 0 : 1, 'De tijd is om! Wie het verst kwam, wint.');
        }
      },
      introUpdate(dt) {
        T += dt;
        pl.forEach((p) => {
          const v = lanes[p.i].vines[p.vine];
          const gp = G_PEND; p.w += (-(gp / p.r) * Math.sin(p.th) - 0.05 * p.w + Math.sin(T * 0.6 + p.i) * 0.0) * dt; p.th += p.w * dt; hangPos(p); v.th = p.th; v.w = p.w;
        });
        W.update(T, dt, camX); visuals(dt); cam(dt);
      },
      resultUpdate,
      onResize() { },
      onSwap(swapped) {
        pl.forEach((p) => {
          fx.particles.burst(p.x, p.y - 0.8, p.z, { count: 22, speed: 4, up: 1.2, life: 0.8, size: 0.45, colors: [0xffe14a, 0xffffff, 0xff6fa5, 0x6fd8ff], gravity: 3 });
          text('🔄', p.x, p.y + 2, p.z + 1, '#ffe14a', 1.4);
        });
        hud.toast(swapped ? `🔄 ${names[0]} bestuurt nu het poppetje van ${names[1]}!` : '🔄 Iedereen weer op zijn eigen poppetje!', 2400);
      },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const p = pl[i];
          p.stun = 1.4; if (p.state === 'hang') { p.w *= 0.1; p.th *= 0.4; }
          text('Verstijfd!', p.x, p.y + 2, p.z + 1, '#ff7a5a', 1.3);
        });
      },
      celebrate(w) { pl[w].cheerT = 99; },
      dispose() { hud.setHint(null); },
      dbg: {
        state: () => ({
          T, playT, done, winner, twist: ctx.twist.id, swapped: ctx.pvp.swapped, wind: windNow, timeLeft,
          p: pl.map((p) => ({ state: p.state, vine: p.vine, th: p.th, w: p.w, r: p.r, x: p.x, y: p.y, vx: p.vx, vy: p.vy, prog: p.prog, pct: pct(p), cd: p.cd, tz: p.tz, stun: p.stun, falls: p.falls, bananas: p.bananas, yells: p.yells, goldT: p.goldT, rotT: p.rotT, best: p.best, armed: p.armed })),
        }),
        predict: (i) => predictCatch(pl[i]),
        lanes, players: pl, world: W,
        launchBanana, addGust, log: dbgLog,
        setProg: (i, v) => { pl[i].prog = v; },
      },
    };

    function resultUpdate(dt) {
      T += dt; resultT += dt;
      pl.forEach((p) => { if (p.state !== 'won') stepPlayer(p, dt); });
      W.update(T, dt, camX); visuals(dt); cam(dt);
    }
  },
};

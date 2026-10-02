import * as THREE from 'three';
import { mat, clamp, lerp, damp, TAU, shuffle, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { buildQuarry, makeBlockKit, makeMallet, starTexture, BH, COLX } from './buttons_world.js';

// Knoppen-Breker — duel: stenen blokken storten op jullie neer. Druk de toets die op het onderste blok staat om het te
// verpletteren. Eerste die GOAL blokken heeft gebroken wint. Gouden blokken = sabotage, bommen = chaos, ijs = twee toetsen.

const GOAL = 25, TIME = 75, MAXOWED = 6;
const PITCH = 1.9, CR = 2.6, YMAX = 5.0, NST = 4, SPAWN_Y = 10.9, TARGET_H = 2.5;
const STUN = 0.85, SQUASH = 1.5;
const SYMS = ['←', '→', '↑', '↓', 'A', 'B'];

const dirOf = (inp) => {
  if (inp.mag < 0.55) return -1;
  const ax = Math.abs(inp.x), ay = Math.abs(inp.y);
  if (ax > ay * 1.15) return inp.x < 0 ? 0 : 1;
  return inp.y < 0 ? 2 : 3;
};
const KIND_COL = { n: [0xa6acc4, 0x6c7290, 0xd2d8ee], g: [0xffd23f, 0xffe98a, 0xc98a10], b: [0x3a3340, 0xff6a1a, 0xffd23f], i: [0xcdefff, 0x9fdcff, 0xffffff] };

export default {
  id: 'buttons',
  name: 'Knoppen-Breker',
  giver: 'Dwerg Brokkel',
  icon: '🧱',
  mode: 'pvp',
  time: 45,
  music: 'game_fast',
  twists: ['invert', 'swapab', 'drunk', 'bodyswap', 'turbo', 'slowmo', 'deurman'],
  blurb: 'Dwerg Brokkel laat <b>stenen blokken</b> op jullie neerstorten! Druk de toets op het <b>onderste blok</b> en sla het kapot. Wie als eerste <b>25 blokken</b> breekt, wint. Pas op voor <b>gouden blokken</b> (sabotage!), <b>bommen</b> en <b>ijsblokken</b>.',
  controls: ['{move} pijl-blokken ← ↑ → ↓', '{a} A-blokken', '{b} B-blokken'],
  tip: 'Verkeerde toets = verdoofd, te traag = platgedrukt. Wie achterstaat krijgt langzamere blokken.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('indoor', { shadow: 15, center: [0, 5, 0], fogNear: 45, fogFar: 100 });
    L.hemi.intensity = 1.25; L.sun.intensity = 1.5; L.sun.position.set(-6, 26, 20);
    camera.fov = 50; camera.updateProjectionMatrix();
    const W = buildQuarry(ctx);
    const kit = makeBlockKit(scene);

    // ---------------- hulpjes: deeltjes, brokstukken, flitsen ----------------
    const dGeo = new THREE.BoxGeometry(1, 1, 1);
    const debris = [];
    for (let k = 0; k < 44; k++) { const m = new THREE.Mesh(dGeo, mat(0x888888)); m.visible = false; scene.add(m); debris.push({ m, on: false, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, life: 0, s: 0 }); }
    function spawnDebris(x, y, z, kind, n, power = 1) {
      const cols = KIND_COL[kind] || KIND_COL.n;
      for (let k = 0; k < n; k++) {
        const d = debris.find((q) => !q.on); if (!d) return;
        d.on = true; d.m.visible = true; d.m.material = mat(cols[k % cols.length]);
        d.s = 0.22 + Math.random() * 0.4; d.m.scale.set(d.s * (0.8 + Math.random() * 0.8), d.s * (0.6 + Math.random() * 0.6), d.s);
        d.m.position.set(x + (Math.random() - 0.5) * 2.6, y + (Math.random() - 0.5) * 1.0, z + (Math.random() - 0.3) * 0.6);
        d.vx = (Math.random() - 0.5) * 9 * power; d.vy = 2 + Math.random() * 7 * power; d.vz = 1 + Math.random() * 4 * power; d.rx = (Math.random() - 0.5) * 12; d.rz = (Math.random() - 0.5) * 12; d.life = 1.2 + Math.random() * 0.7;
      }
    }
    function updateDebris(dt) {
      for (const d of debris) {
        if (!d.on) continue;
        d.vy -= 26 * dt; const p = d.m.position; p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
        d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
        if (p.y < 0.12) { p.y = 0.12; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5; }
        if (p.z > 3.6) { p.z = 3.6; d.vz *= -0.3; }
        d.life -= dt;
        if (d.life < 0.35) d.m.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
        if (d.life <= 0) { d.on = false; d.m.visible = false; }
      }
    }
    const flashTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,190,80,.7)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const flashes = [];
    function flash(x, y, z, size = 12, color = 0xffffff) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, color }));
      s.position.set(x, y, z); s.scale.setScalar(1); s.renderOrder = 18; scene.add(s); flashes.push({ s, t: 0, size });
    }
    function updateFlashes(dt) {
      for (let k = flashes.length - 1; k >= 0; k--) {
        const f = flashes[k]; f.t += dt; const u = f.t / 0.38;
        f.s.scale.setScalar(2 + f.size * Math.sqrt(Math.min(1, u))); f.s.material.opacity = Math.max(0, 1 - u);
        if (u >= 1) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(k, 1); }
      }
    }
    const starTex = starTexture();

    // ---------------- spelers ----------------
    const pl = [0, 1].map((i) => {
      const c = makeBrother(i);
      const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const sc = TARGET_H / c.height;
      holder.position.set(COLX[i], 0, 1.35); holder.scale.setScalar(sc);
      const mallet = makeMallet(); mallet.scale.setScalar(c.s); c.hold(mallet, 'r');
      c.faceDir(0, 1); c.group.rotation.y = 0; c.yaw = 0; c.targetYaw = 0;
      const stars = new THREE.Group(); stars.position.y = c.height + 0.5; stars.visible = false; holder.add(stars);
      const starSprites = [0, 1, 2].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false })); s.scale.setScalar(0.5); s.renderOrder = 12; stars.add(s); return s; });
      return {
        i, c, holder, sc, stars, starSprites, mallet,
        broken: 0, goal: GOAL, owed: 0, stun: 0, squash: 0, lock: 0, ignore: 0, frozen: 0, lifting: false, rattle: 0,
        swingT: 9, armX: -0.75, prevDir: -1, presses: [], blocks: [], bag: [], count: 0, lastSym: -1,
        crushes: 0, errors: 0, golds: 0, defused: 0, booms: 0, sooty: 0, pose: 'idle', cheer: 0,
      };
    });

    // ---------------- toestand ----------------
    let T = 0, playT = 0, timeLeft = TIME, done = false, sudden = false, suddenT = 0, winner = -1, frame = 0, resultT = 0, hintT = 7;
    const seen = {};
    const rng = () => ctx.rng();

    function bagKinds() { return shuffle(['g', 'b', 'i', 'i', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n'], rng); }
    function nextSpec(p) {
      p.count++;
      let kind = 'n';
      if (!sudden && p.count > 3) { if (!p.bag.length) p.bag = bagKinds(); kind = p.bag.pop(); }
      let s1 = Math.floor(rng() * 6); if (s1 === p.lastSym) s1 = (s1 + 1 + Math.floor(rng() * 5)) % 6;
      let syms = [s1];
      if (kind === 'i') { let s2 = Math.floor(rng() * 6); if (s2 === s1) s2 = (s2 + 1 + Math.floor(rng() * 5)) % 6; syms = [s1, s2]; }
      p.lastSym = syms[syms.length - 1];
      return { kind, syms };
    }
    function pushBlock(p, y) {
      const sp = nextSpec(p); const b = kit.acquire(); kit.set(b, sp.kind, sp.syms); b.y = y; b.tickT = 0; b.uid = ++uid;
      p.blocks.push(b);
      if (sp.kind !== 'n' && !seen[sp.kind]) {
        seen[sp.kind] = true;
        hud.toast({ g: '⭐ Gouden blok: breek hem en je broer krijgt 2 extra blokken!', b: '💣 Bom! Snel breken, anders ontploft hij!', i: '❄ IJsblok: twee toetsen achter elkaar!' }[sp.kind], 3200);
      }
    }
    let uid = 0;
    function fill(p) {
      while (p.blocks.length < NST) {
        const top = p.blocks[p.blocks.length - 1];
        pushBlock(p, Math.max(top ? top.y + PITCH : YMAX, SPAWN_Y + (top ? 0 : 0)));
      }
    }
    function layout(p) { p.blocks.forEach((b, j) => { b.y = YMAX + j * PITCH; }); }
    pl.forEach((p) => { fill(p); layout(p); });

    function speedFor(p) {
      const o = pl[1 - p.i];
      const lag = (p.goal - p.broken) - (o.goal - o.broken);   // > 0 = ik sta achter
      const comeback = 1 - 0.4 * clamp(lag / 6, 0, 1) + 0.12 * clamp(-lag / 6, 0, 1);
      const base = 1.45 + 1.0 * clamp(playT / 50, 0, 1);
      p.comeback = comeback;
      return base * ctx.pvp.speed(p.i) * comeback;
    }

    // ---------------- hud ----------------
    function updateHud() {
      pl.forEach((p) => {
        hud.setPlayerInfo(p.i, `Gebroken: ${p.broken}/${p.goal}${(p.comeback || 1) < 0.9 ? '  🐌 trage blokken' : ''}`);
        W.setMeter(p.i, p.broken, p.goal);
      });
      hud.setScore(`${names[0]} ${pl[0].broken} – ${pl[1].broken} ${names[1]}`);
    }

    // ---------------- acties ----------------
    const BANG = ['KRAK!', 'BAM!', 'PATS!', 'KNAL!', 'BONK!', 'KLETS!'];
    function shatter(p, b, n = 8) {
      const x = COLX[p.i], y = b.y + BH / 2, z = 0.9;
      const cols = KIND_COL[b.kind];
      fx.particles.burst(x, y, z, { count: 26, speed: 6, up: 0.9, spread: 1.2, life: 0.8, size: 0.4, colors: cols, gravity: 14 });
      fx.particles.dust(x, y, z, 7, 0xd6cdbf);
      spawnDebris(x, y, z, b.kind, n);
    }
    function swing(p) {
      p.swingT = 0; p.c.swing();
    }
    function hitBlock(p, b) {
      if (b.kind === 'i' && b.step === 0) {
        kit.advance(b); swing(p); p.lock = 0.07;
        fx.particles.burst(COLX[p.i], b.y + BH / 2, 1.0, { count: 14, speed: 4, up: 0.6, life: 0.5, size: 0.3, colors: [0xffffff, 0xcdefff, 0x9fdcff], gravity: 8 });
        audio.sfx('chop', { vol: 0.7, rate: 1.4 }); audio.sfx('sparkle', { vol: 0.25 });
        fx.texts.add('KRAK!', COLX[p.i] + (Math.random() - 0.5) * 2.4, 3.9, 1.8, '#bfeaff', 0.8);
        return;
      }
      breakBlock(p, b);
    }
    function breakBlock(p, b) {
      p.blocks.shift(); p.broken++; swing(p); p.lock = 0.07;
      const x = COLX[p.i];
      shatter(p, b, b.kind === 'g' ? 12 : 8);
      audio.sfx('chop', { vol: 0.8, rate: 0.8 + Math.random() * 0.2 }); audio.sfx('thud', { vol: 0.5 }); audio.sfx('hit', { vol: 0.35, rate: 0.9 });
      ctx.shake(0.18);
      fx.texts.add(BANG[Math.floor(Math.random() * BANG.length)], x + (Math.random() - 0.5) * 2.6, 3.9, 1.8, '#ffffff', 0.85);
      if (b.kind === 'g') goldSabotage(p, b);
      else if (b.kind === 'b') {
        p.defused++; fx.texts.add('ONTMANTELD!', x, 4.9, 1.8, '#7dffb0', 1.0);
        fx.particles.burst(x, b.y + BH / 2, 1.0, { count: 22, speed: 4, up: 1, life: 0.9, size: 0.5, colors: [0x999999, 0xbbbbbb, 0x7dffb0], gravity: -1 });
        audio.sfx('pop', { vol: 0.5 });
      }
      kit.release(b);
      fill(p);
      if (b.kind !== 'g') W.cheer(0.45, p.i); else W.cheer(0.9);
      updateHud();
      checkWin(p);
    }
    function goldSabotage(p, b) {
      const o = pl[1 - p.i]; p.golds++;
      const x = COLX[p.i], y = b.y + BH / 2, ox = COLX[o.i];
      const add = Math.min(2, MAXOWED - o.owed);
      audio.sfx('powerup', { vol: 0.7 }); audio.sfx('coin', { vol: 0.5 });
      fx.particles.burst(x, y, 1.2, { count: 36, speed: 7, up: 1, life: 1.0, size: 0.45, colors: [0xffd23f, 0xffffff, 0xffe98a, 0xff9a1a], gravity: 6 });
      flash(x, y, 1.6, 9, 0xffd23f);
      if (add > 0) {
        o.owed += add; o.goal += add; o.rattle = 0.7;
        for (let k = 0; k < 26; k++) {
          const u = Math.random(), sx = x, sy = y + (Math.random() - 0.5) * 0.8;
          fx.particles.emit(sx, sy, 1.4, (ox - sx) / 0.55 + (Math.random() - 0.5) * 1.5, (7 - sy) / 0.55 + (Math.random() - 0.5) * 3, 0, { life: 0.5 + u * 0.15, size: 0.42, color: [0xffd23f, 0xffffff, 0xffa31a][k % 3], gravity: 0 });
        }
        setTimeout(() => { try { fx.texts.add(`+${add} BLOKKEN!`, ox, 8.4, 1.8, '#ff5a5a', 1.5); audio.sfx('bad', { vol: 0.6 }); ctx.shake(0.4); fx.particles.burst(ox, 7, 1.2, { count: 20, speed: 5, up: 1, life: 0.7, size: 0.4, colors: [0xff5a5a, 0xffd23f], gravity: 8 }); } catch (e) { /* weg */ } }, 520);
        hud.toast(`⭐ ${names[p.i]} saboteert ${names[o.i]}!`, 2000);
      } else {
        fx.texts.add('GOUD!', x, 4.9, 1.8, '#ffd23f', 1.2);
      }
    }
    function wrongKey(p) {
      p.stun = STUN; p.errors++; p.c.setMood && p.c.setMood('sad');
      audio.sfx('buzz', { vol: 0.5 }); audio.sfx('hurt', { vol: 0.25, rate: 1.3 });
      ctx.shake(0.12);
      fx.texts.add(['OEPS!', 'AU!', 'FOUT!', 'HUH?'][Math.floor(Math.random() * 4)], COLX[p.i], 4.4, 2.2, '#ff7a5a', 0.95);
      fx.particles.burst(COLX[p.i], 2.9, 1.5, { count: 8, speed: 2.5, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 3 });
    }
    function crush(p) {
      const b = p.blocks[0];
      if (b.kind === 'b') { explode(p); return; }
      p.blocks.shift(); p.crushes++;
      const x = COLX[p.i];
      shatter(p, b, 10);
      fx.particles.burst(x, 1.6, 1.4, { count: 30, speed: 5, up: 0.7, spread: 1.4, life: 0.9, size: 0.5, colors: [0xd6cdbf, 0xffffff, 0xffe14a], gravity: 6 });
      fx.particles.ring(x, 0.25, 1.35, { count: 22, speed: 5.5, color: 0xe8dcc8, size: 0.38, life: 0.55 });
      audio.sfx('thud', { vol: 1 }); audio.sfx('hurt', { vol: 0.5 }); audio.sfx('boing', { vol: 0.3, rate: 0.7 });
      ctx.shake(0.55);
      fx.texts.add('PLETS!', x, 4.4, 2.0, '#ff6a5a', 1.2);
      p.squash = SQUASH; p.lifting = true; p.stun = 0;
      kit.release(b); fill(p);
    }
    function explode(src) {
      const b = src.blocks[0]; const bx = COLX[src.i], by = b.y + BH / 2;
      src.booms++;
      audio.sfx('explode', { vol: 1 }); ctx.shake(1);
      flash(bx, by, 1.8, 22, 0xffffff);
      fx.particles.burst(bx, by, 1.2, { count: 60, speed: 9, up: 1, spread: 1.4, life: 1.1, size: 0.7, colors: [0xff5a1a, 0xffd23f, 0xff9a1a, 0x333333], gravity: 4 });
      hud.showBig('BOEM!', 900, '#ff8a3a');
      for (const q of pl) {
        for (const bb of q.blocks) { shatter(q, bb, 6); kit.release(bb); }
        q.blocks.length = 0; q.lifting = false; q.frozen = 1.1; q.squash = Math.min(q.squash, 0);
        fill(q);
        // nieuwe stapel valt uit het luik
        q.blocks.forEach((nb, j) => { nb.y = SPAWN_Y + j * PITCH; });
      }
      src.stun = 1.4; src.sooty = 1.6;
      fx.texts.add('BOEM!', bx, 6.6, 2.0, '#ffb04a', 1.6);
      // achterligger krijgt gratis blokken
      const a = pl[0], c = pl[1];
      if (a.broken !== c.broken) {
        const tr = a.broken < c.broken ? a : c, ld = tr === a ? c : a;
        const free = Math.min(3, 1 + (ld.broken - tr.broken));
        tr.broken += free;
        setTimeout(() => { try { fx.texts.add(`+${free} GRATIS!`, COLX[tr.i], 9.6, 2.0, '#7dffb0', 1.5); audio.sfx('good', { vol: 0.6 }); } catch (e) { /* weg */ } }, 300);
        hud.toast(`💥 ${names[tr.i]} krijgt ${free} blok${free > 1 ? 'ken' : ''} cadeau!`, 2400);
      } else hud.toast('💥 De bom ruimt alle stapels op!', 2000);
      updateHud();
      checkWin(a.broken >= a.goal ? a : c);
      if (!done) { if (a.broken >= a.goal) checkWin(a); if (c.broken >= c.goal) checkWin(c); }
    }

    // ---------------- winnen ----------------
    function checkWin(p) { if (!done && p.broken >= p.goal) win(p.i); }
    function win(i, why = '') {
      if (done) return; done = true; winner = i;
      const w = pl[i], l = pl[1 - i];
      w.pose = 'cheer'; l.pose = 'sad'; w.stun = l.stun = 0; l.squash = 0;
      audio.sfx('win', { vol: 0.5 }); ctx.shake(0.4);
      hud.showBig(`${names[i]} wint!`, 1500, i ? '#4a8cff' : '#35c46f');
      for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst(COLX[i] + (Math.random() - 0.5) * 5, 5 + Math.random() * 5, 1.5, { count: 34, speed: 7, up: 1.2, life: 1.5, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 230);
      for (const q of pl) { for (const bb of q.blocks) { if (q === w) { shatter(q, bb, 5); kit.release(bb); } } if (q === w) q.blocks.length = 0; }
      W.cheer(3);
      const jokes = [
        `${names[i]} sloopt de steengroeve! ${names[1 - i]} is nog aan het vegen.`,
        `Dwerg Brokkel is onder de indruk van ${names[i]}.`,
        `${names[i]} heeft stalen vingers!`,
        `${names[1 - i]} zat nét te kijken naar een vlinder...`,
      ];
      const facts = [];
      if (l.crushes) facts.push(`${names[1 - i]} werd ${l.crushes}x platgedrukt`);
      if (w.crushes) facts.push(`${names[i]} werd ${w.crushes}x platgedrukt`);
      if (l.errors + w.errors > 0) facts.push(`samen ${l.errors + w.errors}x de verkeerde knop`);
      if (w.golds + l.golds > 0) facts.push(`${w.golds + l.golds}x goud gebroken`);
      if (w.booms + l.booms > 0) facts.push(`${w.booms + l.booms}x BOEM`);
      const summary = `<b>${why || jokes[Math.floor(Math.random() * jokes.length)]}</b>${facts.length ? '<br>' + facts.join(' · ') : ''}`;
      ctx.finishPvp({ winner: i, score: [pl[0].broken, pl[1].broken], summary, delay: 1900 });
    }
    function timeUp() {
      if (done || sudden) return;
      const a = pl[0].broken, b = pl[1].broken;
      hud.setTimer(0);
      if (a !== b) { win(a > b ? 0 : 1, 'De tijd is om! Wie de meeste blokken brak, wint.'); return; }
      sudden = true; suddenT = 0;
      hud.showBig('BESLISSEND BLOK!', 1500, '#ff7a5a'); hud.toast('Gelijkspel! Het eerstvolgende blok wint.', 2500);
      audio.sfx('bell', { vol: 0.6 }); audio.music('tense');
      for (const q of pl) {
        for (const bb of q.blocks) { kit.release(bb); }
        q.blocks.length = 0; q.goal = q.broken + 1; q.owed = 0; q.stun = 0; q.squash = 0; q.lifting = false; q.frozen = 0.6;
        fill(q); q.blocks.forEach((nb, j) => { nb.y = SPAWN_Y + j * PITCH; });
      }
      updateHud();
    }

    // ---------------- per speler per frame ----------------
    function readPresses(p) {
      const inp = ctx.pvp.input(p.i); const out = p.presses; out.length = 0;
      const d = dirOf(inp);
      if (d >= 0 && d !== p.prevDir) out.push(d);
      p.prevDir = d;
      if (inp.aP) out.push(4);
      if (inp.bP) out.push(5);
      return out;
    }
    function stepPlayer(p, dt) {
      p.stun = Math.max(0, p.stun - dt); p.squash = Math.max(0, p.squash - dt); p.lock = Math.max(0, p.lock - dt);
      p.ignore = Math.max(0, p.ignore - dt); p.frozen = Math.max(0, p.frozen - dt); p.rattle = Math.max(0, p.rattle - dt); p.sooty = Math.max(0, p.sooty - dt);
      const pr = readPresses(p);
      if (done) return;
      const b0 = p.blocks[0];
      if (pr.length && b0 && p.stun <= 0 && p.squash <= 0 && p.lock <= 0 && p.ignore <= 0 && p.frozen < 0.7) {
        const need = b0.syms[b0.step];
        if (pr.includes(need)) hitBlock(p, b0); else wrongKey(p);
      }
      if (done) return;
      // blokken laten zakken
      const bl = p.blocks; if (!bl.length) return;
      const v = speedFor(p);
      const a = bl[0];
      if (p.lifting) { a.y = Math.min(YMAX, a.y + 11 * dt); if (a.y >= YMAX) p.lifting = false; }
      else if (p.frozen <= 0 && p.squash <= 0) a.y -= v * dt;
      if (!p.lifting && a.y > YMAX) a.y = Math.max(YMAX, a.y - 14 * dt);
      for (let j = 1; j < bl.length; j++) {
        const ideal = bl[j - 1].y + PITCH;
        bl[j].y = bl[j].y > ideal ? Math.max(ideal, bl[j].y - 18 * dt) : ideal;
      }
      // bom: lont
      if (a.kind === 'b' && p.frozen <= 0 && p.squash <= 0) {
        if (a.fuseT < 0) a.fuseT = 2.1 / clamp(ctx.pvp.speed(p.i), 0.8, 1.7);
        a.fuseT -= dt; a.tickT -= dt;
        if (a.tickT <= 0) { audio.sfx('tick', { vol: 0.55, rate: 1 + (1 - clamp(a.fuseT / 2.1, 0, 1)) * 0.6 }); a.tickT = lerp(0.1, 0.38, clamp(a.fuseT / 2.1, 0, 1)); }
        if (a.fuseT <= 0) { explode(p); return; }
      }
      if (!p.lifting && a.y <= CR && p.squash <= 0) crush(p);
    }

    // ---------------- visuals ----------------
    function visuals(dt) {
      for (const p of pl) {
        const x = COLX[p.i];
        const a = p.blocks[0];
        const danger = a ? clamp(1 - (a.y - CR) / (YMAX - CR), 0, 1) : 0;
        p.danger = danger;
        p.blocks.forEach((b, j) => {
          const rat = p.rattle > 0 ? Math.sin(T * 60 + j) * 0.12 * (p.rattle / 0.7) : 0;
          b.grp.position.set(x + rat, b.y + BH / 2, 0);
          const act = j === 0 && !done;
          b.frame.visible = act;
          if (act) {
            b.frame.material.color.setRGB(1, 0.9 - 0.75 * danger, 0.3 - 0.25 * danger);
            b.frame.material.opacity = 0.65 + 0.35 * Math.sin(T * (6 + 14 * danger));
            b.grp.rotation.z = Math.sin(T * 36 + p.i) * 0.04 * danger * danger;
          } else b.grp.rotation.z = 0;
          if (b.kind === 'b') {
            const fz = act && b.fuseT >= 0 ? clamp(b.fuseT / 2.1, 0, 1) : 1;
            b.red.material.opacity = act ? 0.12 + 0.4 * (0.5 + 0.5 * Math.sin(T * (7 + 26 * (1 - fz)))) : 0.08;
            b.fuse.scale.y = 0.4 + 0.6 * fz; b.tip.position.y = 0.32 * (0.4 + 0.6 * fz);
            if (act && Math.random() < dt * 40) fx.particles.emit(x + 0.9 + (Math.random() - 0.5) * 0.2, b.y + BH + 0.5 + (Math.random() - 0.3) * 0.2, 0.3, (Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, { life: 0.35, size: 0.26, color: Math.random() < 0.5 ? 0xffd23f : 0xff7a1a, gravity: 3 });
          }
        });
        charVisual(p, dt);
      }
    }
    function charVisual(p, dt) {
      const c = p.c, h = p.holder;
      p.swingT += dt; const sw = p.swingT;
      let jy = 0; if (sw < 0.34) jy = Math.sin(sw / 0.34 * Math.PI) * 0.8;
      let sx = 1, sy = 1;
      if (p.squash > 0) {
        const k = p.squash;
        if (k > 0.45) { sy = 0.28 + Math.sin(T * 40) * 0.02; sx = 1.55; jy = 0; }
        else { const u = 1 - k / 0.45; sy = lerp(0.28, 1, u) + Math.sin(u * Math.PI) * 0.3; sx = lerp(1.55, 1, u) - Math.sin(u * Math.PI) * 0.15; jy = 0; }
      }
      h.scale.set(p.sc * sx, p.sc * sy, p.sc * sx);
      h.position.y = jy;
      h.rotation.z = p.stun > 0 ? Math.sin(T * 22) * 0.1 : 0;
      let pose = p.pose;
      if (!done) pose = p.squash > 0.2 ? 'sad' : p.stun > 0 ? 'scared' : 'idle';
      c.pose = pose; c.speed = 0; c.air = false;
      c.update(dt);
      if (pose === 'idle') {
        const target = sw < 0.22 ? -2.85 : -0.8 + Math.sin(T * 2.2 + p.i) * 0.06;
        p.armX = damp(p.armX, target, sw < 0.22 ? 45 : 10, dt);
        c.armR.rotation.x = p.armX; c.armR.rotation.z = -0.12;
        if (sw < 0.22) c.torso.rotation.x = -0.25;
      }
      // sterretjes
      const stunned = p.stun > 0 || (p.squash > 0.2);
      p.stars.visible = stunned;
      if (stunned) p.starSprites.forEach((s, k) => { const a = T * 5 + k * TAU / 3; s.position.set(Math.cos(a) * 0.75, Math.sin(a * 2) * 0.08, Math.sin(a) * 0.45); });
      // roet van de bom
      if (p.sooty > 0 && Math.random() < dt * 12) fx.particles.emit(COLX[p.i] + (Math.random() - 0.5) * 0.6, 2.9, 1.35, 0, 1.2, 0, { life: 0.8, size: 0.4, color: 0x333333, gravity: -1 });
    }

    // ---------------- camera ----------------
    let camDist = 17;
    function fitCamera() {
      const asp = camera.aspect || 1.7, tv = Math.tan(camera.fov * Math.PI / 360);
      camDist = Math.max(9.0 / tv, 11.8 / (tv * asp));
    }
    fitCamera();
    function cam(dt) {
      let fx0 = 0, k = 0;
      if (winner >= 0) { k = Math.min(1, resultT / 1.5); fx0 = COLX[winner] * 0.3 * k; }
      const dist = camDist * (1 - 0.06 * k);
      const tx = fx0 + Math.sin(T * 0.3) * 0.2;
      camera.position.set(tx, 7.8 - 0.3 * k, dist);
      camera.lookAt(tx, 6.5 - 0.3 * k, 0);
    }

    // ---------------- loop ----------------
    function common(dt) {
      visuals(dt); updateDebris(dt); updateFlashes(dt);
      W.update(T, dt, camera.position);
      cam(dt);
    }
    updateHud(); hud.setTimer(TIME);
    pl.forEach((p) => { p.c.update(0.016); });
    common(0.016);
    hud.setHint('Druk de toets die op het <b>onderste blok</b> staat!');

    return {
      update(dt) {
        if (done) { resultUpdate(dt); return; }
        T += dt; playT += dt;
        if (!sudden) { timeLeft -= dt; hud.setTimer(Math.max(0, timeLeft), 15); if (timeLeft <= 0) timeUp(); }
        else { suddenT += dt; if (suddenT > 45 && !done) { const a = pl[0], b = pl[1]; win(a.errors + a.crushes <= b.errors + b.crushes ? 0 : 1, 'Dwerg Brokkel kiest zelf een winnaar!'); } }
        if (hintT > 0) { hintT -= dt; if (hintT <= 0) hud.setHint(null); }
        const order = (frame++ & 1) ? [1, 0] : [0, 1];
        for (const i of order) if (!done) stepPlayer(pl[i], dt);
        updateHud();
        common(dt);
      },
      introUpdate(dt) { T += dt; pl.forEach((p) => { p.pose = 'idle'; }); common(dt); },
      resultUpdate,
      onResize() { fitCamera(); },
      onSwap(swapped) {
        pl.forEach((p) => {
          p.ignore = 0.3;
          fx.particles.burst(COLX[p.i], 2.5, 1.4, { count: 22, speed: 4, up: 1.2, life: 0.8, size: 0.45, colors: [0xffe14a, 0xffffff, 0xff6fa5, 0x6fd8ff], gravity: 3 });
          fx.texts.add('🔄', COLX[p.i], 4.4, 1.5, '#ffe14a', 1.4);
          p.c.jump();
        });
        hud.toast(swapped ? `🔄 ${names[0]} bestuurt nu de kolom van ${names[1]}!` : '🔄 Iedereen weer op zijn eigen kolom!', 2400);
      },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const p = pl[i];
          p.broken = Math.max(0, p.broken - 1); p.stun = 0.6;
          fx.texts.add('-1 blok!', COLX[i], 5, 1.5, '#ff5a5a', 1.3);
        });
        updateHud();
      },
      celebrate(w) { pl[w].pose = 'cheer'; pl[1 - w].pose = 'sad'; },
      dispose() { hud.setHint(null); },
      dbg: {
        state: () => ({
          T, playT, timeLeft, done, sudden, winner, twist: ctx.twist.id, swapped: ctx.pvp.swapped,
          p: pl.map((p) => { const b = p.blocks[0]; return { broken: p.broken, goal: p.goal, stun: p.stun, squash: p.squash, lock: p.lock, ignore: p.ignore, frozen: p.frozen, need: b ? b.syms[b.step] : -1, kind: b ? b.kind : '', y: b ? b.y : 0, fuse: b ? b.fuseT : -1, crushes: p.crushes, errors: p.errors, golds: p.golds, booms: p.booms, owed: p.owed, defused: p.defused, comeback: p.comeback }; }),
        }),
        players: pl,
        force(i, j, kind, syms) { const b = pl[i].blocks[j]; if (b) kit.set(b, kind, syms); },
        win: (i) => win(i),
      },
    };

    function resultUpdate(dt) {
      T += dt; resultT += dt;
      pl.forEach((p) => { p.swingT += 0; });
      common(dt);
    }
  },
};

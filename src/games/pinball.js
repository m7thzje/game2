import * as THREE from 'three';
import { clamp, lerp, damp, rand, pick, TAU } from '../engine/util.js';
import { buildTable, makeBall, stepTable, substeps, TB, flipperTip } from './pinball_table.js';
import { buildWorld, rampCurve, RAMP_EXIT } from './pinball_world.js';

// Flipper-Duel — een flipperkast voor twee in het Drakenkasteel.
//  * Wes bedient de LINKER flippers, Jor de RECHTER (A). B = stoot tegen de kast (+ ←/→ richting); te veel stoten = TILT.
//  * De bal heeft een EIGENAAR (kleurgloed): wie hem als laatste met een flipper raakte. Alle bumpers/torens/schatten tellen voor de eigenaar.
//  * Draak (5 treffers = vuurstoot + schatkist-jackpot), kip (bewegend doel), schilden-rijen (links = multiball, rechts = jackpot), brug (ramp),
//    power-ups (multiball, x2, reuzenflippers). 3 ballen of 84 s; laatste 15 s dubbele punten; flinke achterstand = x1,5.
//  * Gelijkspel: gouden bal (sudden death), daarna flipper-treffers, daarna de kip beslist.

const BALLS = 3, MATCH_TIME = 84, SAVE_T = 7, SD_TIME = 18;
const PTS = { bumper: 10, sling: 5, target: 30, dragon: 25, chicken: 50, spin: 8, ramp: 60, chest: 15, jackpot: 250, bank: 100 };

export default {
  id: 'pinball',
  name: 'Flipper-Duel',
  giver: 'Dracula de Draak',
  icon: '📌',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Een <b>flipperkast in het Drakenkasteel</b>! Wes bedient de <b>linker</b>, Jor de <b>rechter</b> flippers. De bal is van wie hem <b>als laatste raakte</b> (kleurgloed): alle torens, de draak en de kip tellen voor de eigenaar. <b>Steel de bal</b> van je broer! 3 ballen of 84 seconden.',
  controls: ['{a} flippers omhoog (Wes links, Jor rechts)', '{b} STOOT de kast (+ ← → richting)', 'Te veel stoten = TILT!'],
  tip: 'Schilden rechts = jackpot, links = multiball. Pak de gloeiende power-ups. De laatste 15 seconden tellen dubbel!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = TB.G * (pv.gravity || 1);
    const TEMPO = tw === 'turbo' ? 1.3 : tw === 'slowmo' ? 0.75 : 1;
    const L = ctx.lights('indoor', { shadow: 22, center: [0, 0, 0], fogNear: 70, fogFar: 170 });
    camera.fov = 46; camera.updateProjectionMatrix();
    const T = buildTable();
    if (SLIP > 0.3) for (const w of T.walls) if (w.kind === 'wall') w.e = Math.min(0.78, w.e + 0.2);
    const W = buildWorld(ctx, T, L);
    const balls = W.balls.map((_, i) => { const b = makeBall(); b.id = i; return b; });
    const flipBase = [0, 1].map((i) => lerp(1, pv.size(i), 0.5));

    // ---------------- toestand ----------------
    const score = [0, 0]; const flipHits = [0, 0];
    let Tm = 0, introT = 0, started = false, finished = false;
    const G = { state: 'intro', t: 0, ballNo: 0, timeLeft: MATCH_TIME, saveT: 0, sudden: false, sdLeft: SD_TIME, winner: null, finale: false, coin: false, stallT: 0, lastBoard: '' };
    const heat = [0, 0], tilt = [0, 0], nudgeCd = [0, 0], x2T = [0, 0], bigT = [0, 0], padPress = [false, false];
    const S = { dragonHits: 0, chickenHits: 0, jackpotLit: 0, bankL: [false, false, false], bankR: [false, false, false], items: 0, jackpots: 0, multis: 0, tilts: 0, steals: 0, drained: 0, sneezes: 0, saves: 0, nudges: [0, 0], ramps: 0 };
    let item = null, itemT = 11, rampSide = 0, popT = 0, sneezeT = 0, camPunch = 0, kickX = 0, kickZ = 0, camK = 0, lastAspect = 0, sfxT = 0;
    const comboT = [0, 0];

    const trailing = () => (score[0] === score[1] ? -1 : score[0] < score[1] ? 0 : 1);
    const behind = (i) => score[1 - i] - score[i] >= Math.max(150, 0.3 * score[1 - i]);
    const mult = (i) => (x2T[i] > 0 ? 2 : 1) * (G.finale ? 2 : 1) * (behind(i) ? 1.5 : 1);
    const col = ['#7dffb0', '#9fc4ff'];

    function refreshHud() {
      hud.setScore(`${G.sudden ? 'GOUDEN BAL' : 'Bal ' + Math.min(G.ballNo, BALLS) + '/' + BALLS} · ${names[0]} ${score[0]} – ${score[1]} ${names[1]}`);
      for (let i = 0; i < 2; i++) hud.setPlayerInfo(i, `${score[i]} pnt${mult(i) > 1.01 ? ' · x' + mult(i) : ''} · ${tilt[i] > 0 ? 'TILT!' : 'tilt-meter ' + Math.round(heat[i] * 100) + '%'}`);
    }
    function pop(text, x, z, color, sc = 1) { if (popT > 0 && sc < 1.3) return; popT = 0.07; fx.texts.add(text, x, 2.6, z, color, sc); }

    // ---------------- punten ----------------
    function addScore(i, base, x, z, label, sc = 1) {
      if (i < 0 && G.state === 'play' && !G.toldNeutral) { G.toldNeutral = true; hud.toast('Raak de bal met een flipper: dan is hij van jou!', 2200); }
      if (i < 0 || finished || G.state === 'end') return 0;
      const pts = Math.round(base * mult(i)); score[i] += pts; comboT[i] = 1.5;
      pop((label ? label + ' ' : '') + '+' + pts, x, z, col[i], sc);
      if (G.sudden && score[0] !== score[1]) endMatch(score[0] > score[1] ? 0 : 1);
      return pts;
    }
    const scoreBall = (b, base, x, z, label, sc) => addScore(b.owner, base, x ?? b.x, z ?? b.z, label, sc);

    // ---------------- ballen ----------------
    const active = () => balls.filter((b) => b.on);
    function spawnBall(x, z, vx, vz, owner) {
      const b = balls.find((q) => !q.on); if (!b) return null;
      Object.assign(b, { on: true, x, z, vx, vz, owner, ramp: null, age: 0, last: -1, still: 0 }); b.y = 0; return b;
    }
    function serve(first) {
      G.state = 'serve'; G.t = 0; G.stallT = 0; G.saveT = G.saveUsed === G.ballNo && !G.sudden ? 0 : SAVE_T;
      for (const s of T.sensors) if (s.kind === 'outlane') s.armed = true;
      audio.sfx('creak', { vol: 0.3, rate: 1.3 });
    }
    function launch() {
      const tr = trailing(); const dir = tr >= 0 ? (tr === 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      const owner = tr >= 0 && Math.abs(score[0] - score[1]) >= 100 ? tr : -1;
      const b = spawnBall(dir * 0.5, -8.1, dir * rand(3.5, 6), 5.5, G.sudden ? -1 : owner);
      if (b) { audio.sfx('shoot', { vol: 0.5, rate: 0.7 }); audio.sfx('whoosh', { vol: 0.4 }); fx.particles.burst(b.x, 1.2, b.z, { count: 26, speed: 6, up: 0.6, life: 0.8, size: 0.4, colors: [0xff7a1a, 0xffd23f, 0xffffff], gravity: 3 }); ctx.shake(0.25); W.dragon.open = 1; }
      G.state = 'play'; G.t = 0; refreshHud();
    }
    function multiball(owner, n = 2, x = 0, z = -8.1) {
      let k = 0; for (let i = 0; i < n; i++) { if (active().length >= 5) break; const b = spawnBall(x + rand(-0.6, 0.6), z, rand(-6, 6), rand(3, 6), owner); if (b) k++; }
      if (k) { S.multis++; hud.toast(`🎱 MULTIBALL! ${owner >= 0 ? names[owner] : 'Iemand'} krijgt extra ballen`, 2200); fx.texts.add('MULTIBALL!', 0, 3.4, -6, '#ffd23f', 1.8); audio.sfx('powerup', { vol: 0.9 }); audio.sfx('sparkle', { vol: 0.6 }); ctx.shake(0.5); W.dragon.open = 1; fx.particles.burst(x, 1.4, z, { count: 40, speed: 7, up: 1.2, life: 1.0, size: 0.45, colors: [0xffd23f, 0xffffff, 0xff7a1a], gravity: 4 }); }
    }
    function sneeze(why) {
      S.sneezes++; sneezeT = 1.1; W.dragon.open = 1.6;
      for (const b of active()) { if (b.ramp) continue; const dx = b.x - 0, dz = b.z + 10.6, d = Math.hypot(dx, dz) || 1; if (d < 9) { const f = (1 - d / 9) * 20 + 8; b.vx += dx / d * f; b.vz += dz / d * f + 4; } }
      for (let k = 0; k < 4; k++) fx.particles.burst(rand(-1, 1), 1.8, -8.4 + k * 0.9, { count: 22, speed: 6, up: 0.4, spread: 1.4, life: 0.9, size: 0.7, colors: [0xff7a1a, 0xffd23f, 0xff3a0a, 0x442222], gravity: -1 });
      audio.sfx('explode', { vol: 0.7 }); audio.tone(95, 0.7, { type: 'sawtooth', vol: 0.18, slide: 50 }); ctx.shake(0.7);
      pop(why || 'DRAAK-NIES!', 0, -6.5, '#ff9a3a', 1.8);
    }

    // ---------------- raakpunten van de natuurkunde ----------------
    function onHit(kind, o, b, sp, nx, nz, tt) {
      if (kind === 'wall' || kind === 'post') { if (sp > 8 && sfxT <= 0) { sfxT = 0.05; audio.sfx('thud', { vol: clamp(sp / 40, 0.05, 0.3), rate: 1.5 }); } return; }
      if (kind === 'ballball') { audio.sfx('hit', { vol: 0.3, rate: 1.6 }); return; }
      if (kind === 'bumper') {
        const i = +o.id[1]; W.bumpers[i].hit = 1; scoreBall(b, PTS.bumper, o.x, o.z - 1.2);
        audio.sfx('boing', { vol: 0.45, rate: 1.3 + Math.random() * 0.4 }); audio.sfx('ding', { vol: 0.3, rate: 0.9 + i * 0.12 });
        fx.particles.ring(o.x, 0.9, o.z, { count: 12, speed: 5, color: 0xffd23f, size: 0.3, life: 0.4 }); ctx.shake(0.06);
      } else if (kind === 'sling') {
        const s = W.slings.find((q) => q.side === o.side); if (s) s.flash = 1; scoreBall(b, PTS.sling, b.x, b.z - 1);
        audio.sfx('pop', { vol: 0.5, rate: 1.4 }); fx.particles.burst(b.x, 0.7, b.z, { count: 8, speed: 4, up: 0.8, life: 0.4, size: 0.3, colors: [0xff8a4a, 0xffe14a], gravity: 6 });
      } else if (kind === 'target') {
        const t = W.targets.find((q) => q.id === o.id); if (!t) return;
        t.flash = 1; scoreBall(b, PTS.target, o.ax, o.az, '', 1.1); audio.sfx('ding', { vol: 0.5, rate: 1.5 }); audio.sfx('wood', { vol: 0.3 });
        const bank = o.side ? S.bankR : S.bankL; if (!bank[o.k]) { bank[o.k] = true; t.lit = true; }
        if (bank.every(Boolean)) {
          bank.fill(false); for (const q of W.targets) if (q.id[1] === String(o.side)) q.lit = false;
          scoreBall(b, PTS.bank, o.ax * 0.5, o.az, 'SCHILDEN!', 1.5); audio.sfx('win', { vol: 0.5 });
          if (o.side === 0) multiball(b.owner, 2, 0, -8.1); else { S.jackpotLit = 14; hud.toast('💰 De schatkist is open! Schiet de bal erachter!', 2200); audio.sfx('sparkle', { vol: 0.7 }); }
        }
      } else if (kind === 'dragon') {
        S.dragonHits++; W.dragon.hit = 1; scoreBall(b, PTS.dragon, o.x, o.z + 2.2, 'DRAAK!', 1.2);
        audio.sfx('hit', { vol: 0.6, rate: 0.6 }); audio.tone(120 + S.dragonHits * 15, 0.25, { type: 'sawtooth', vol: 0.12, slide: 70 }); ctx.shake(0.15);
        fx.particles.burst(o.x, 1.5, o.z + 1.8, { count: 14, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xff7a1a, 0xffd23f], gravity: 4 });
        if (S.dragonHits % 5 === 0) { sneeze('VUURSTOOT!'); S.jackpotLit = 14; hud.toast('💰 De draak is boos! Schatkist is open!', 2200); }
      } else if (kind === 'chicken') {
        S.chickenHits++; W.chickenFlap = 1; scoreBall(b, PTS.chicken, o.x, o.z - 1.2, 'KIP!', 1.3);
        audio.sfx('pop', { vol: 0.6, rate: 1.8 }); audio.tone(520, 0.12, { type: 'square', vol: 0.1, slide: 900 }); audio.tone(780, 0.12, { type: 'square', vol: 0.1, slide: 400 }); ctx.shake(0.12);
        fx.particles.burst(o.x, 1.0, o.z, { count: 18, speed: 4, up: 1.4, life: 0.9, size: 0.3, colors: [0xffffff, 0xf6f1e4, 0xf2a33a], gravity: 3 });
        if (S.chickenHits % 3 === 0) { pop('EI GELEGD!', o.x, o.z + 1, '#fff6a8', 1.3); if (!item) spawnItem(o.x, o.z + 1.8); }
      } else if (kind === 'flipper') {
        const side = o.side;
        if (!(o.press || Math.abs(o.vel) > 0.5)) { if (sp > 5) audio.sfx('click2', { vol: 0.2 }); return; }      // een slapende flipper claimt de bal niet
        flipHits[side]++;
        if (b.owner !== side) {
          if (b.owner >= 0) { S.steals++; pop('GESTOLEN!', b.x, b.z - 1, col[side], 1.5); audio.sfx('good', { vol: 0.5, rate: 1.3 }); fx.particles.burst(b.x, 0.8, b.z, { count: 16, speed: 5, up: 1, life: 0.6, size: 0.35, colors: [side ? 0x4a9cff : 0x35e07a, 0xffffff], gravity: 4 }); }
          else pop(names[side] + '!', b.x, b.z - 1, col[side], 1.1);
          b.owner = side;
        }
        b.last = side; if (sp > 6) { audio.sfx('hit', { vol: clamp(sp / 40, 0.15, 0.6), rate: 0.8 + sp / 60 }); if (sp > 14) ctx.shake(0.08); }
      }
    }

    // ---------------- sensoren (per substap) ----------------
    function sensors(b, dt) {
      for (const s of T.sensors) {
        const d = Math.hypot(b.x - s.x, b.z - s.z); if (d > s.r + b.r * 0.4) continue;
        const sp = Math.hypot(b.vx, b.vz);
        if (s.kind === 'spinner') {
          if ((s.cool || 0) <= 0 && sp > 3) { s.cool = 0.4; const sp2 = W.spinners.find((q) => q.s === s); if (sp2) sp2.spin = Math.min(40, sp2.spin + sp * 0.8); scoreBall(b, PTS.spin, s.x, s.z, 'DRAAI!', 0.9); audio.sfx('click2', { vol: 0.3 }); audio.tone(900 + Math.random() * 400, 0.05, { type: 'square', vol: 0.06 }); }
        } else if (s.kind === 'outlane') {
          if (s.armed && b.vz > 1 && b.z > s.z - 0.5) {
            s.armed = false; S.saves++; b.vz = -27; b.vx = (s.side ? -1 : 1) * 5; b.z = s.z - 0.7; pop('REDDING!', s.x, s.z - 1, '#9fff9f', 1.3); audio.sfx('boing', { vol: 0.6, rate: 1.1 }); audio.sfx('powerup', { vol: 0.3 }); ctx.shake(0.2);
            fx.particles.burst(s.x, 0.6, s.z, { count: 20, speed: 5, up: 1.5, life: 0.6, size: 0.4, colors: [0x9fff9f, 0xffffff], gravity: 4 });
          }
        } else if (s.kind === 'ramp') {
          if ((s.cool || 0) <= 0 && b.vz < -6.5 && !b.ramp) { s.cool = 1.2; b.ramp = { t: 0, dur: 0.95, side: rampSide, curve: rampCurve(rampSide) }; rampSide = 1 - rampSide; S.ramps++; audio.sfx('whoosh', { vol: 0.6 }); audio.sfx('wood', { vol: 0.5 }); W.rampGlow.material.opacity = 1; }
        } else if (s.kind === 'chest') {
          if ((s.cool || 0) <= 0) {
            s.cool = 0.8;
            if (S.jackpotLit > 0 && b.owner >= 0) { S.jackpotLit = 0; S.jackpots++; scoreBall(b, PTS.jackpot, 0, -12, 'JACKPOT!', 2.3); hud.showBig('💰 JACKPOT!', 1300, '#ffd23f'); audio.sfx('win', { vol: 0.9 }); audio.sfx('coin', { vol: 0.8 }); ctx.shake(0.8); W.chest.lit = 1; fx.particles.burst(0, 1.6, -13.5, { count: 90, speed: 9, up: 1.6, life: 1.4, size: 0.5, colors: [0xffd23f, 0xffe98a, 0xffffff, 0xff9a20], gravity: 6 }); ctrlCheer(b.owner); }
            else { scoreBall(b, PTS.chest, 0, -12.3, 'TING', 0.9); audio.sfx('coin', { vol: 0.4 }); }
          }
        }
      }
    }
    function ctrlCheer(i) { W.pups[i].c.pose = 'cheer'; W.pups[i].cheer = 1.6; W.pups[1 - i].c.pose = 'sad'; W.pups[1 - i].sad = 1.6; for (const o of W.crowd) o.cheer = 2; }

    // ---------------- power-ups ----------------
    function spawnItem(x, z) {
      if (item) return;
      const types = ['multi', 'x2', 'big', 'multi', 'x2', 'big']; const type = pick(types);
      const tr = trailing();
      if (x == null) {
        for (let k = 0; k < 20; k++) {
          const side = tr >= 0 && Math.random() < 0.7 ? (tr === 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
          const px = side * rand(1.5, 7), pz = rand(-1.5, 8.5);
          if (T.circles.some((c) => c.kind !== 'post' && Math.hypot(c.x - px, c.z - pz) < c.r + 1.8)) continue; x = px; z = pz; break;
        }
        if (x == null) { x = 0; z = 7.6; }
      }
      item = { type, x, z, life: 11, t: 0 }; S.items++; W.item.material.map = W.itemTex[type]; W.item.material.needsUpdate = true;
      W.item.visible = true; W.itemRing.visible = true;
      hud.toast({ multi: '🎱 Power-up: MULTIBALL!', x2: '✨ Power-up: DUBBELE PUNTEN!', big: '↔ Power-up: REUZENFLIPPERS!' }[type], 1700); audio.sfx('sparkle', { vol: 0.6 });
      fx.particles.ring(x, 0.5, z, { count: 18, speed: 4, color: 0xffe14a, size: 0.35, life: 0.6 });
    }
    function takeItem(i) {
      const it = item; item = null; W.item.visible = false; W.itemRing.visible = false; itemT = rand(13, 19);
      const p = { x: it.x, z: it.z };
      fx.particles.burst(p.x, 1.2, p.z, { count: 36, speed: 6, up: 1.4, life: 0.9, size: 0.45, colors: [0xffffff, 0xffe14a, i ? 0x4a9cff : 0x35e07a], gravity: 4 });
      audio.sfx('powerup', { vol: 0.8 }); ctx.shake(0.25);
      if (it.type === 'multi') multiball(i, 2, p.x, p.z);
      else if (it.type === 'x2') { x2T[i] = 12; pop(names[i] + ': x2!', p.x, p.z, col[i], 1.6); hud.toast(`✨ ${names[i]}: 12 seconden dubbele punten!`, 1800); }
      else { bigT[i] = 12; pop('REUZENFLIPPERS!', p.x, p.z, col[i], 1.6); hud.toast(`↔ ${names[i]} krijgt reuzenflippers!`, 1800); }
    }

    // ---------------- einde / flow ----------------
    function endMatch(winner, tiebreak) {
      if (G.state === 'end') return; G.state = 'end'; G.t = 0; G.winner = winner; G.tiebreak = tiebreak || '';
      for (const b of balls) if (b.on) { b.on = false; fx.particles.burst(b.x, 0.8, b.z, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffffff, 0xffe070], gravity: 4 }); }
      hud.setTimer(null); audio.sfx('bell', { vol: 0.9 });
      if (winner != null) { hud.showBig(`${names[winner]} WINT!`, 1600, col[winner]); W.pups[winner].c.pose = 'cheer'; W.pups[1 - winner].c.pose = 'sad'; for (const o of W.crowd) o.cheer = 4; audio.sfx('win', { vol: 0.6 }); }
      refreshHud();
    }
    function resolveEnd() {         // tijd om of ballen op: winnaar, of gelijkspel -> gouden bal
      if (score[0] !== score[1]) return endMatch(score[0] > score[1] ? 0 : 1);
      if (!G.sudden) { G.sudden = true; G.sdLeft = SD_TIME; for (const b of balls) b.on = false; hud.showBig('GOUDEN BAL!', 1500, '#ffd23f'); hud.toast('Gelijkspel! Het eerste punt wint', 2200); audio.sfx('bell', { vol: 0.9 }); G.state = 'ballend'; G.t = 0; G.nextServe = true; return; }
      if (flipHits[0] !== flipHits[1]) return endMatch(flipHits[0] > flipHits[1] ? 0 : 1, 'flip');
      G.coin = true; endMatch(Math.random() < 0.5 ? 0 : 1, 'coin');
    }
    function ballLost() {
      S.drained++;
      if (G.sudden) { G.state = 'ballend'; G.t = 0; G.nextServe = true; G.save = true; return; }
      if (G.saveT > 0) { G.saveUsed = G.ballNo; hud.toast('🐉 Draak-redding! Zelfde bal opnieuw', 1600); audio.sfx('powerup', { vol: 0.5 }); G.state = 'ballend'; G.t = 0; G.nextServe = true; G.save = true; return; }
      hud.showBig(`Bal ${G.ballNo} weg!`, 1000, '#ff9a8a'); audio.sfx('lose', { vol: 0.35 });
      if (G.ballNo >= BALLS) { G.state = 'ballend'; G.t = 0; G.nextServe = false; G.final = true; return; }
      G.state = 'ballend'; G.t = 0; G.nextServe = true;
    }
    function finishMatch() {
      if (finished) return; finished = true;
      let w = G.winner; if (w == null) w = score[0] === score[1] ? (Math.random() < 0.5 ? 0 : 1) : score[0] > score[1] ? 0 : 1;
      const l = 1 - w; const diff = Math.abs(score[0] - score[1]);
      const jokes = [`${names[w]} is de flipper-koning van het Drakenkasteel! De draak klapt (met zijn staart).`, `${names[w]} beheerst de ballen. ${names[l]} schudde te hard en de kast werd boos.`, `Wat een bal-gevecht! ${names[w]} pakte de laatste kans. De kip kakelt tevreden.`, `${names[l]} zegt dat de kast vals speelt. De kast zegt niets, maar de draak lacht.`];
      const extra = G.tiebreak === 'coin' ? ' De kip kon niet kiezen en gooide een muntje.' : G.tiebreak === 'flip' ? ' Gelijk op punten: de meeste flipper-treffers beslisten.' : diff < 40 ? ' Dat was op het randje!' : '';
      const stats = ` (${S.steals} keer de bal gestolen${S.jackpots ? ', ' + S.jackpots + 'x jackpot' : ''}${S.tilts ? ', ' + S.tilts + 'x tilt' : ''}).`;
      ctx.finishPvp({ winner: w, score: [score[0], score[1]], delay: 600, summary: pick(jokes) + extra + stats });
    }

    // ---------------- invoer ----------------
    function nudge(i, inp) {
      nudgeCd[i] = 0.3; heat[i] += 0.34; S.nudges[i]++;
      const dx = Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) * 5.5 : 0, dz = -4.8;
      for (const b of balls) if (b.on && !b.ramp) { b.vx += dx + rand(-0.8, 0.8); b.vz += dz; }
      kickX = dx * 0.05; kickZ = dz * 0.05; ctx.shake(0.18); audio.sfx('thud', { vol: 0.6, rate: 0.8 }); audio.sfx('wood', { vol: 0.4 });
      fx.particles.dust(i ? 14 : -14, 0.2, 12, 5, 0xe0d0b0);
      if (heat[i] > 1.0) {
        heat[i] = 0; tilt[i] = 3.2; S.tilts++; pop('TILT!', i ? 6 : -6, 9, '#ff5a3a', 2.0); hud.showBig(`TILT! ${names[i]}`, 1000, '#ff5a3a'); audio.sfx('buzz', { vol: 0.7 }); audio.sfx('bad', { vol: 0.5 }); ctx.shake(0.5);
        W.pups[i].c.pose = 'scared'; W.pups[i].scare = 3.2; padPress[i] = false;
      }
    }
    function readInput(dt) {
      for (let i = 0; i < 2; i++) {
        const inp = pv.input(i);
        nudgeCd[i] = Math.max(0, nudgeCd[i] - dt); heat[i] = Math.max(0, heat[i] - dt * 0.28); tilt[i] = Math.max(0, tilt[i] - dt);
        x2T[i] = Math.max(0, x2T[i] - dt); bigT[i] = Math.max(0, bigT[i] - dt);
        const can = tilt[i] <= 0 && G.state !== 'end';
        const pr = can && inp.a;
        if (pr && !padPress[i]) { audio.sfx('click', { vol: 0.25, rate: 1.3 }); W.pups[i].c.swing(); }
        padPress[i] = pr;
        if (can && inp.bP && nudgeCd[i] <= 0 && (G.state === 'play')) nudge(i, inp);
      }
      for (const f of T.flippers) { f.press = padPress[f.side]; f.lenMul = flipBase[f.side] * (bigT[f.side] > 0 ? 1.35 : 1); }
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      dt = Math.min(dt, 0.05); Tm += dt;
      if (!started) { started = true; G.ballNo = 1; serve(true); refreshHud(); hud.setHint('Wes: linker flippers · Jor: rechter flippers · <b>B</b> = stoot (let op TILT)'); }
      if (Tm > 260 && !finished && G.state !== 'end') endMatch(score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1);
      popT -= dt; sfxT -= dt; G.t += dt;
      readInput(dt);
      // klok
      if (G.state === 'play' || G.state === 'serve') {
        if (G.sudden) { if (G.state === 'play') { G.sdLeft -= dt; hud.setTimer(Math.max(0, G.sdLeft), 8); if (G.sdLeft <= 0) resolveEnd(); } }
        else if (G.state === 'play') {
          G.timeLeft -= dt; hud.setTimer(Math.max(0, G.timeLeft), 10);
          if (!G.finale && G.timeLeft < 15) { G.finale = true; hud.showBig('FINALE! x2', 1300, '#ffd23f'); audio.sfx('bell', { vol: 0.6 }); audio.sfx('powerup', { vol: 0.6 }); }
          if (G.timeLeft <= 0) { G.timeLeft = 0; hud.showBig('TIJD!', 1000, '#ffd23f'); resolveEnd(); }
        }
      }
      G.saveT = Math.max(0, G.saveT - (G.state === 'play' ? dt : 0));
      if (G.state === 'serve') { W.dragon.open = Math.max(W.dragon.open, 0.5 + G.t); if (G.t > 0.9) launch(); }
      else if (G.state === 'ballend') {
        if (G.t > (G.final ? 1.2 : 1.1)) {
          if (G.final) { G.final = false; resolveEnd(); if (G.state === 'ballend') { /* gouden bal volgt */ } }
          else if (G.nextServe) { G.nextServe = false; if (G.save) G.save = false; else if (!G.sudden) G.ballNo++; serve(false); refreshHud(); }
        }
      } else if (G.state === 'end') { if (G.t > 2.4 && !finished) finishMatch(); }

      // natuurkunde
      if (G.state === 'play' || G.state === 'serve' || G.state === 'ballend') {
        const sdt = dt * TEMPO;
        for (const s of T.sensors) s.cool = Math.max(0, (s.cool || 0) - dt);
        const n = substeps(T, sdt, balls), h = sdt / n;
        for (let k = 0; k < n; k++) {
          stepTable(T, balls, h, GRAV, onHit, SLIP > 0.3 ? 0 : 0.03);
          for (const b of balls) if (b.on && !b.ramp) sensors(b, h);
        }
      }
      for (const b of balls) {
        if (!b.on) continue; b.age += dt;
        if (b.ramp) {
          const r = b.ramp; r.t += dt; const u = clamp(r.t / r.dur, 0, 1); const p = r.curve.getPoint(u); b.x = p.x; b.z = p.z; b.y = p.y - 0.4;
          if (u >= 1) { const e = RAMP_EXIT[r.side]; b.ramp = null; b.y = 0; b.x = e.x; b.z = e.z; b.vx = (r.side ? -1 : 1) * 4.5; b.vz = 6; scoreBall(b, PTS.ramp, b.x, b.z + 1, 'BRUG!', 1.3); audio.sfx('good', { vol: 0.6 }); audio.sfx('ding', { vol: 0.4 }); fx.particles.burst(e.x, 1.2, e.z, { count: 16, speed: 5, up: 1, life: 0.6, size: 0.35, colors: [0xffe14a, 0xffffff], gravity: 4 }); }
        } else if (b.z > TB.DRAIN + b.r || !isFinite(b.x + b.z)) {
          b.on = false; fx.particles.burst(b.x, 0.6, 15.6, { count: 18, speed: 5, up: 1.4, life: 0.8, size: 0.45, colors: [0xff5a3a, 0xffd23f, 0x442244], gravity: 5 }); audio.sfx('lose', { vol: 0.2, rate: 1.6 }); audio.sfx('splash', { vol: 0.3, rate: 0.8 });
          if (G.state === 'play' && !active().length) ballLost();
          else if (G.state === 'play') hud.toast('Eén bal weg, het spel gaat door!', 1100);
        }
      }
      // rustige ballen -> draak niest
      if (G.state === 'play') {
        const mv = active().filter((b) => !b.ramp);
        if (mv.length && mv.every((b) => Math.hypot(b.vx, b.vz) < 1.3)) { G.stallT += dt; if (G.stallT > 3.2) { G.stallT = 0; sneeze('DRAAK-NIES!'); } } else G.stallT = 0;
        sneezeT -= dt;
      }
      // items
      if (G.state === 'play') {
        if (item) {
          item.life -= dt; item.t += dt;
          for (const b of balls) if (b.on && !b.ramp && b.owner >= 0 && Math.hypot(b.x - item.x, b.z - item.z) < 1.35) { takeItem(b.owner); break; }
          if (item && item.life <= 0) { item = null; W.item.visible = false; W.itemRing.visible = false; itemT = rand(8, 12); }
        } else { itemT -= dt; if (itemT <= 0 && !G.sudden) spawnItem(); }
        if (G.finale && !item && itemT > 5) itemT = 5;
        if (S.jackpotLit > 0) { S.jackpotLit -= dt; if (S.jackpotLit <= 0) hud.toast('De schatkist sluit weer...', 1200); }
      }
      comboT[0] -= dt; comboT[1] -= dt;
      refreshHud();
      visuals(dt);
    }

    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(0, 0, 0.5), camDir = new THREE.Vector3(0, Math.sin(1.06), Math.cos(1.06)), camBase = new THREE.Vector3(), tmpV = new THREE.Vector3();
    const fitPts = [[-12.2, 0, -16], [12.2, 0, -16], [-12.2, 0, 17.2], [12.2, 0, 17.2], [-18, 3.5, 13], [18, 3.5, 13]];
    function fitCamera() {
      let lo = 14, hi = 160;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(camLook).addScaledVector(camDir, d); camera.lookAt(camLook); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { tmpV.set(q[0], q[1], q[2]).project(camera); if (Math.abs(tmpV.x) > 0.96 || tmpV.y > 0.72 || tmpV.y < -0.94) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camBase.copy(camLook).addScaledVector(camDir, hi); lastAspect = camera.aspect;
    }
    fitCamera();
    function updateCamera(dt) {
      if (Math.abs(camera.aspect - lastAspect) > 0.001) fitCamera();
      camPunch = Math.max(0, camPunch - dt * 2);
      const sway = Math.sin((Tm + introT) * 0.3) * 0.5;
      camera.position.copy(camBase); camera.position.x += sway + kickX * 3; camera.position.z += kickZ * 3 - camPunch * 1.5;
      camera.lookAt(camLook.x + kickX, 0, camLook.z + kickZ);
    }
    function visuals(dt) {
      const tt = Tm + introT;
      kickX = damp(kickX, 0, 9, dt); kickZ = damp(kickZ, 0, 9, dt);
      W.table.position.set(kickX, 0, kickZ);
      // flippers
      for (const o of W.flippers) {
        const f = o.f; o.g.rotation.y = f.dirX > 0 ? -f.ang : Math.PI + f.ang; const Lm = f.len * f.lenMul;
        o.body.scale.set(Lm, 1, 1); o.cap.position.x = Lm; o.stripe.scale.x = f.lenMul; o.stripe.position.x = f.len * f.lenMul * 0.45;
        o.bodyM.emissiveIntensity = damp(o.bodyM.emissiveIntensity, tilt[f.side] > 0 ? 0.0 : f.press ? 0.45 : 0, 18, dt);
        o.bodyM.emissive.setHex(tilt[f.side] > 0 ? 0xff3a1a : f.side ? 0x66aaff : 0x66ff99);
        if (tilt[f.side] > 0) o.bodyM.emissiveIntensity = 0.3 + Math.sin(tt * 30) * 0.3;
      }
      // ballen
      W.balls.forEach((o, i) => {
        const b = balls[i]; if (!b.on) { o.g.visible = o.halo.visible = o.tag.visible = o.shadow.visible = false; return; }
        o.g.visible = o.halo.visible = o.tag.visible = o.shadow.visible = true;
        const y = (b.y || 0) + TB.BR;
        o.g.position.set(b.x, y, b.z); o.g.rotation.x += b.vz * dt / TB.BR * 0.8; o.g.rotation.z -= b.vx * dt / TB.BR * 0.8;
        const oi = b.owner < 0 ? 2 : b.owner;
        if (o.own !== oi) { o.own = oi; o.mt.emissive.setHex(W.ownerCol[oi]); o.halo.material.color.setHex(W.ownerCol[oi]); o.tag.material.map = W.tagTex[oi]; o.tag.material.needsUpdate = true; }
        o.mt.emissiveIntensity = 0.5 + Math.sin(tt * 8) * 0.12;
        o.halo.position.set(b.x, 0.1 + (b.y || 0) * 0.2, b.z); o.halo.scale.setScalar(1 + Math.sin(tt * 6 + i) * 0.08);
        o.tag.position.set(b.x, y + 2.3, b.z - 0.6); o.shadow.position.set(b.x, 0.04, b.z); o.shadow.scale.setScalar(0.9 - (b.y || 0) * 0.1);
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 12 && Math.random() < dt * (14 + sp)) fx.particles.emit(b.x - b.vx * 0.015, y, b.z - b.vz * 0.015, rand(-0.5, 0.5), 0.6, rand(-0.5, 0.5), { life: 0.35, size: 0.4, color: W.ownerCol[oi], gravity: 0 });
      });
      // bumpers, slings, schilden
      for (const o of W.bumpers) { o.hit = Math.max(0, o.hit - dt * 4); o.g.scale.set(1 + o.hit * 0.14, 1 - o.hit * 0.05, 1 + o.hit * 0.14); o.bm.emissiveIntensity = o.hit * 0.9; o.roof.material.emissiveIntensity = o.hit * 0.8; o.roof.material.emissive.setHex(0xffcc66); o.ring.material.opacity = 0.35 + o.hit * 0.6 + Math.sin(tt * 4) * 0.08; o.flag.rotation.y = Math.sin(tt * 5 + o.c.x) * 0.4; }
      for (const s of W.slings) { s.flash = Math.max(0, s.flash - dt * 5); s.m.material.emissiveIntensity = 0.35 + s.flash * 1.4; s.m.scale.z = 1 + s.flash * 0.8; }
      for (const t of W.targets) { t.flash = Math.max(0, t.flash - dt * 4); t.m.material.emissive.setHex(t.lit ? 0xffd23f : 0xffffff); t.m.material.emissiveIntensity = t.lit ? 0.7 + Math.sin(tt * 8) * 0.2 : t.flash * 0.9; }
      for (const s of W.spinners) { s.spin = Math.max(0, s.spin - dt * 12); s.rot += s.spin * dt; s.bar.rotation.x = s.rot; }
      for (const s of W.savers) { s.m.visible = s.s.armed; s.m.material.opacity = 0.6 + Math.sin(tt * 6) * 0.3; }
      W.rampGlow.material.opacity = Math.max(0, W.rampGlow.material.opacity - dt * 2) + (G.state === 'play' ? 0.0 : 0); W.rampGlow.scale.setScalar(1 + Math.sin(tt * 4) * 0.05);
      // draak
      const D = W.dragon; D.hit = Math.max(0, D.hit - dt * 3); D.open = Math.max(0, D.open - dt * 1.2);
      const bb = active().filter((q) => !q.ramp).sort((a, b) => Math.hypot(a.x, a.z + 10.6) - Math.hypot(b.x, b.z + 10.6))[0];
      const want = bb ? clamp(Math.atan2(bb.x, bb.z + 10.6) * 0.8, -0.9, 0.9) : Math.sin(tt * 0.7) * 0.4;
      D.neck.rotation.y = damp(D.neck.rotation.y, want, 5, dt); D.neck.rotation.x = Math.sin(tt * 1.6) * 0.05 - D.hit * 0.25;
      D.jaw.rotation.x = clamp(D.open * 0.7 + D.hit * 0.3, 0, 0.9);
      D.g.scale.set(1 + D.hit * 0.08, 1 - D.hit * 0.05, 1 + D.hit * 0.08);
      D.dMat.emissiveIntensity = clamp(S.dragonHits % 5 / 5 * 0.45 + D.hit * 0.6 + (sneezeT > 0 ? 0.6 : 0), 0, 1.2);
      W.wingL.rotation.z = Math.sin(tt * 3 + D.hit * 4) * 0.25 + 0.1 + D.open * 0.2; W.wingR.rotation.z = -W.wingL.rotation.z;
      D.tail.forEach((m, k) => { m.rotation.x = Math.sin(tt * 2 - k * 0.6) * 0.15; });
      if (sneezeT > 0 && Math.random() < dt * 40) { const a = rand(-0.4, 0.4); fx.particles.emit(a, 1.9, -9.0, a * 5, 0.5, rand(4, 9), { life: 0.7, size: 0.8, color: pick([0xff7a1a, 0xffd23f, 0xff3a0a]), gravity: -1 }); }
      else if (Math.random() < dt * 3) fx.particles.emit(rand(-0.3, 0.3), 2.3, -9.3, rand(-0.3, 0.3), 1.2, 0.8, { life: 1.0, size: 0.5, color: 0x555555, gravity: -0.6 });
      W.lights.lDrag.intensity = 8 + Math.sin(tt * 7) * 2 + D.hit * 40 + (sneezeT > 0 ? 70 : 0);
      // kist
      const C = W.chest; C.lit = Math.max(C.lit - dt * 1.5, 0); const on = S.jackpotLit > 0 ? 1 : 0;
      C.lid.rotation.x = damp(C.lid.rotation.x, on ? -1.3 : 0, 6, dt); C.beam.material.opacity = damp(C.beam.material.opacity, on ? 0.28 + Math.sin(tt * 8) * 0.08 : 0, 6, dt);
      C.gold.rotation.y += dt * 2; C.gold.position.y = 0.85 + (on ? 0.5 + Math.sin(tt * 4) * 0.15 : 0); C.gold.scale.setScalar(1 + C.lit * 0.8);
      W.lights.lChest.intensity = (on ? 30 + Math.sin(tt * 9) * 8 : 6) + C.lit * 60;
      if (on && Math.random() < dt * 15) fx.particles.emit(rand(-0.6, 0.6), 1.2, -13.7 + rand(-0.4, 0.4), 0, 2.5, 0, { life: 0.8, size: 0.35, color: 0xffe070, gravity: -1 });
      // kip
      const ch = W.chicken, tc = T.chicken; W.chickenFlap = Math.max(0, W.chickenFlap - dt * 2.5);
      ch.targetYaw = tc.dir > 0 ? Math.PI / 2 : -Math.PI / 2; ch.speed = 0.9; ch.update(dt); ch.group.position.set(tc.x, ch.group.position.y + W.chickenFlap * 0.6, tc.z);
      ch.group.rotation.z = Math.sin(tt * 30) * W.chickenFlap * 0.4;
      // item
      if (item) {
        W.item.position.set(item.x, 1.8 + Math.sin(item.t * 3) * 0.3, item.z); W.item.visible = item.life > 2.5 || Math.sin(item.life * 20) > 0; W.item.scale.setScalar(2.6 + Math.sin(item.t * 5) * 0.2);
        W.itemRing.position.set(item.x, 0.09, item.z); W.itemRing.scale.setScalar(1.3 + Math.sin(item.t * 4) * 0.15);
        if (Math.random() < dt * 8) fx.particles.emit(item.x + rand(-0.8, 0.8), 0.6, item.z + rand(-0.8, 0.8), 0, 1.5, 0, { life: 0.8, size: 0.3, color: 0xffe98a, gravity: -0.5 });
      }
      // poppetjes
      for (const o of W.pups) {
        const i = o.i; if (o.cheer > 0) o.cheer -= dt; else if (o.sad > 0) o.sad -= dt; if (o.scare > 0) o.scare -= dt;
        if (G.state === 'end') { /* pose staat al */ } else o.c.pose = o.scare > 0 ? 'scared' : o.cheer > 0 ? 'cheer' : o.sad > 0 ? 'sad' : padPress[i] ? 'push' : 'carry';
        o.btn.position.y = padPress[i] ? 0.28 : 0.45; o.btn.material.emissive.setHex(padPress[i] ? 0xffffff : 0); o.btn.material.emissiveIntensity = padPress[i] ? 0.5 : 0;
        o.c.update(dt);
      }
      W.update(tt, dt);
      updateCamera(dt);
    }
    function introUpdate(dt) { introT += dt; for (const o of W.pups) o.c.pose = 'carry'; visuals(dt); }
    function resultUpdate(dt) { Tm += dt; visuals(dt); }
    refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      introUpdate, resultUpdate,
      onResize() { lastAspect = 0; },
      onSwap() { for (const o of W.pups) fx.particles.burst(o.holder.position.x, 3, o.holder.position.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { score[i] = Math.max(0, score[i] - 40); pop('-40 DEURMAN!', i ? 8 : -8, 9, '#ff6a6a', 1.6); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
        refreshHud();
      },
      celebrate(w) { W.pups[w].c.pose = 'cheer'; W.pups[1 - w].c.pose = 'sad'; W.pups[w].cheer = 99; for (const o of W.crowd) o.cheer = 99; },
      dispose() {},
      dbg: {
        state: () => ({ T: Tm, g: G.state, ballNo: G.ballNo, timeLeft: G.timeLeft, sudden: G.sudden, sdLeft: G.sdLeft, score: [...score], flipHits: [...flipHits], finished, tilt: [...tilt], heat: [...heat], x2T: [...x2T], bigT: [...bigT], saveT: G.saveT, mult: [mult(0), mult(1)], jackpotLit: S.jackpotLit, S: { ...S, bankL: [...S.bankL], bankR: [...S.bankR] }, item: item ? { type: item.type, x: item.x, z: item.z } : null, winner: G.winner, tiebreak: G.tiebreak || '',
          balls: balls.filter((b) => b.on).map((b) => ({ x: +b.x.toFixed(2), z: +b.z.toFixed(2), vx: +b.vx.toFixed(1), vz: +b.vz.toFixed(1), owner: b.owner, ramp: !!b.ramp })),
          flippers: T.flippers.map((f) => ({ id: f.id, ang: +f.ang.toFixed(2), px: f.px, pz: f.pz, len: f.len * f.lenMul, side: f.side, press: f.press })) }),
        setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); },
        setTime: (t) => { G.timeLeft = t; },
        spawnItem: (type) => { item = null; spawnItem(0, 7.5); if (type) { item.type = type; W.item.material.map = W.itemTex[type]; } },
        giveItem: (type, i) => { item = { type, x: 0, z: 7.5, life: 5, t: 0 }; takeItem(i); },
        sneeze: () => sneeze(), jackpotOn: () => { S.jackpotLit = 14; }, multiball: (i) => multiball(i, 2),
        put: (x, z, vx, vz, owner) => spawnBall(x, z, vx, vz, owner), killBalls: () => { for (const b of balls) b.on = false; },
        balls, T, G, S,
      },
    };
  },
};

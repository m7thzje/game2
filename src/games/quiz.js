import * as THREE from 'three';
import { clamp, damp, pick, shuffle, rand } from '../engine/util.js';
import { buildMatch, extraQuestion, playSong, playAnimal, songDuration } from './quiz_questions.js';
import { buildStudio } from './quiz_world.js';

// Heitjesmiljonair — duel: tv-quiz met Koning Klopper. 10 vragen (snel, schat, volgorde, geluid, goud), hoogste score wint.
//  * antwoorden = pijltjes (kleur), A = toeter / vastzetten / geluid herhalen, B = mysterie-joker (50/50 of ijsblok)
//  * gimmicks: een kip op de buzzer van de leider, publiek dat joelt, de Deurman kijkt door de studiodeur
//  * comeback: achterstand = extra joker, gouden slotvraag (dubbele punten), beslissende vraag bij gelijkstand
const TOTAL = 10;
const PTS = 100, WRONG = 40, ORDER_WRONG = 20, GRACE = 3.0, GAME_CAP = 230;
const HOST_OK = ['Goed zo!', 'Precies! Jij bent slim!', 'Ja hoor! Heitjes voor jou!', 'Briljant, mijn kroontje!', 'Dat wist je zeker!'];
const HOST_BAD = ['Au, helaas!', 'Nee nee nee!', 'Mijn kroon valt er bijna af!', 'Dat is mis!', 'Oei oei oei...'];
const HOST_NONE = ['Niemand? Echt niemand?!', 'Hallo? Is daar iemand?', 'Tijd om! Ik ga een dutje doen.'];

export default {
  id: 'quiz', name: 'Heitjesmiljonair', giver: 'Koning Klopper', icon: '🎤', mode: 'pvp', time: 100,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'bodyswap', 'deurman'],
  music: 'game_fast',
  blurb: 'De tv-quiz van Koning Klopper! <b>Wie het eerst goed antwoordt</b> krijgt de meeste punten. 10 vragen: snel, schatten, volgorde en luisteren. De laatste is <b>goud: dubbele punten</b>!',
  controls: ['{move} antwoord (pijl = kleur)', '{a} vastzetten / nog eens horen', '{b} mysterie-JOKER'],
  tip: 'Fout = punten kwijt én geblokkeerd. Pas op voor de kip!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const TS = clamp(pv.speed(0), 0.6, 1.7);                       // turbo / slakkentempo: de klok loopt sneller of trager
    const L = ctx.lights('indoor', { shadow: 16 });
    L.hemi.intensity = 1.25; L.sun.intensity = 0.9;
    const S = buildStudio(ctx, L);
    camera.fov = 50;
    function fitCamera() {
      const asp = camera.aspect || 1.7; const d = clamp(15.5 * 1.7 / asp, 15.5, 24);
      camera.position.set(0, 6.2 + (d - 15.5) * 0.25, d); camera.lookAt(0, 5.0, -3); camera.updateProjectionMatrix();
    }
    fitCamera();

    const Q = buildMatch();
    const sc = [0, 0];
    const mkJ = () => shuffle(['5050', 'freeze']).map((t) => ({ t, used: false }));
    const PL = [0, 1].map((i) => ({ i, jokers: mkJ(), dirPrev: -1, blocked: false, done: false, frozen: 0, lock: 0, delta: 0, hint5: null, hintArrow: null, usedJoker: false, tootCd: 0, val: 0, lo: 0, hi: 0, locked: false, hintTxt: '', holdF: 0, holdC: 0, prog: 0, ansT: 0, stats: { right: 0, wrong: 0 } }));
    const G = { phase: 'wait', t: 0, qi: -1, q: null, timer: 0, limit: 1, first: -1, marks: [[], [], [], []], stage: 1, sd: false, sdCount: 0, elapsed: 0, finished: false, used: new Set(), chickenQs: new Set(), deurT: rand(16, 24), sndDur: 0, replays: 0, sndT: 0, beatT: 0, picks: [null, null], result: '', winner: -1, comebackDone: false, coin: false, hint: '' };
    // twee kip-momenten tijdens snelle vragen
    shuffle([2, 3, 4, 6, 7, 8]).slice(0, 2).forEach((q) => G.chickenQs.add(q));
    let T = 0, introT = 0;

    // ---------------- helpers ----------------
    const lead = (i) => sc[i] - sc[1 - i];
    function refreshHud() {
      hud.setScore(`${names[0]} ${sc[0]} – ${sc[1]} ${names[1]}`);
      for (const p of PL) hud.setPlayerInfo(p.i, `${sc[p.i]} punten · jokers: ${p.jokers.filter((j) => !j.used).length}`);
    }
    function addScore(i, d, text, col) {
      const p = PL[i]; const before = sc[i]; sc[i] = Math.max(0, sc[i] + d); const real = sc[i] - before; p.delta += real;
      const D = S.desks[i]; fx.texts.add(text || ((real > 0 ? '+' : '') + real), D.baseX, 5.4, 3.2, col || (real > 0 ? '#6aff8a' : '#ff6a6a'), 1.5);
      refreshHud();
    }
    function say(arr, secs) { S.say(typeof arr === 'string' ? arr : pick(arr), secs); }
    function board(extra = {}) {
      const q = G.q;
      S.drawBoard({ mode: 'q', q, qn: Math.min(G.qi + 1, TOTAL), total: TOTAL, marks: G.marks, reveal: G.phase === 'reveal', picks: G.picks, sd: G.sd, beat: G.beatT, hint: G.hint, ...extra });
    }
    function title(big, small, sub) { S.drawBoard({ mode: 'title', big, small, sub }); }
    function deskState(i) {
      const p = PL[i], q = G.q; const st = { name: names[i], score: sc[i], delta: p.delta, jokers: p.jokers.map((j) => ({ used: j.used })), frozen: Math.round(p.frozen * 10) / 10, kip: p.kip, swappedBy: pv.swapped ? names[1 - i] : null };
      if (G.phase === 'ask' || G.phase === 'grace') {
        if (q.type === 'estimate') st.est = { val: Math.round(p.val / q.fine) * q.fine, lo: p.lo, hi: p.hi, locked: p.locked, hint: p.hintTxt };
        else if (q.type === 'order') { st.pips = p.prog; st.status = p.lock > 0 ? 'AU! Opnieuw!' : ''; st.hintArrow = p.hintArrow; if (p.hintArrow != null) st.status = 'Tip: begin hier'; }
        else { st.status = p.done ? (p.blocked ? 'GEBLOKKEERD' : 'GOED!') : p.lock > 0 ? 'AU!' : 'Kies een pijl'; st.statusCol = p.blocked ? '#ff6a6a' : p.done ? '#6aff8a' : '#ffffff'; st.hint5 = p.hint5; }
      } else if (G.phase === 'reveal' && q) {
        if (q.type === 'estimate') st.est = { val: Math.round(p.val / q.fine) * q.fine, lo: p.lo, hi: p.hi, locked: true, hint: '' };
        else st.status = p.delta > 0 ? 'Lekker bezig!' : p.delta < 0 ? 'Aaah...' : '...';
      } else st.status = G.phase === 'final' ? (G.winner === i ? 'WINNAAR!' : 'Volgende keer!') : 'Klaar voor de show!';
      return st;
    }

    // ---------------- vraag-flow ----------------
    function startQuestion() {
      G.qi++; G.q = G.sd ? G.q : Q[G.qi]; const q = G.q;
      G.first = -1; G.marks = [[], [], [], []]; G.picks = [null, null]; G.stage = 1; G.hint = ''; G.replays = 0;
      for (const p of PL) { p.kip = false; p.blocked = false; p.done = false; p.delta = 0; p.hint5 = null; p.hintArrow = null; p.usedJoker = false; p.prog = 0; p.locked = false; p.lock = 0; p.hintTxt = ''; p.val = 0; p.lo = 0; p.hi = 0; p.ansT = 0; }
      if (q.type === 'estimate') for (const p of PL) { p.lo = q.min; p.hi = q.max; p.val = Math.round((q.min + q.max) / 2 / q.fine) * q.fine; }
      G.phase = 'intro'; G.t = 0; hud.setTimer(null); S.setTimerBar(0);
      const sub = { buzz: 'Wie het eerst goed is, wint de punten!', gold: 'Dubbele punten... en dubbele straf!', sound: 'Luister goed!', estimate: 'Wie zit er het dichtstbij?', order: 'Druk de pijlen in de goede volgorde!' }[q.type];
      title(G.sd ? 'BESLISSENDE VRAAG!' : q.type === 'gold' ? 'GOUDEN VRAAG!' : `VRAAG ${G.qi + 1}`, { buzz: 'Snelle vraag!', gold: 'Voor het goud!', sound: 'Luistervraag!', estimate: 'Schat het getal!', order: 'Volgorde-vraag!' }[q.type], sub);
      if (G.sd) say('Gelijkstand!? Dan een beslissende vraag!', 2.4);
      else say(q.type === 'gold' ? 'GOUD! Alles telt dubbel!' : q.type === 'sound' ? 'Spits je oren!' : q.type === 'estimate' ? 'Hoeveel denk je?' : `Vraag ${G.qi + 1}, daar gaan we!`, 1.6);
      S.host.pose = 'point'; audio.sfx('select', { rate: 0.8 });
      // comeback: wie ver achterstaat krijgt vanaf vraag 6 één extra joker
      if (!G.comebackDone && G.qi === 5 && Math.abs(lead(0)) >= 100) {
        const b = lead(0) < 0 ? 0 : 1; PL[b].jokers.push({ t: pick(['5050', 'freeze']), used: false }); G.comebackDone = true;
        hud.toast(`${names[b]} staat achter en krijgt een EXTRA JOKER!`, 2200); audio.sfx('powerup'); refreshHud();
      }
    }
    function beginAsk() {
      const q = G.q; G.phase = 'ask'; G.t = 0; G.limit = q.limit; G.timer = q.limit; board();
      S.host.pose = 'idle';
      if (q.type === 'sound') playSound();
      // kip-gimmick: op de buzzer van de leider (bij gelijkstand willekeurig)
      G.chickenAt = (G.chickenQs.has(G.qi) && !G.sd && (q.type === 'buzz' || q.type === 'sound') && !S.chickenBusy()) ? 1.4 : -1;
    }
    function playSound() {
      const q = G.q; G.sndT = 0;
      G.sndDur = q.animal ? playAnimal(audio, q.animal) : playSong(audio, q.song, 150);
      S.host.pose = 'dance';
    }
    function endQuestion(why) {
      const q = G.q; G.phase = 'reveal'; G.t = 0; hud.setTimer(null);
      // schat-vraag: punten uitdelen
      if (q.type === 'estimate') {
        const d = PL.map((p) => Math.abs(p.val - q.ans)); const tol = Math.max(q.fine, 0.03 * (q.max - q.min));
        const best = Math.min(d[0], d[1]);
        for (const i of [0, 1]) if (d[i] === best) { addScore(i, PTS + (d[i] <= tol ? 50 : 0), d[i] <= tol ? 'RAAK! +150' : null); PL[i].stats.right++; } else PL[i].stats.wrong++;
        G.picks = [PL[0].val, PL[1].val]; G.first = d[0] === d[1] ? -2 : d[0] < d[1] ? 0 : 1;
      }
      G.hint = '';
      board({ reveal: true });
      const anyRight = G.first !== -1;
      const who = G.first >= 0 ? names[G.first] : '';
      if (anyRight) { say(G.first >= 0 ? `${who}: ${pick(HOST_OK)}` : 'Allebei even dichtbij!', 2.0); S.cheer(2.0); audio.sfx('win', { vol: 0.5 }); S.host.pose = 'cheer'; PL.forEach((p) => { S.desks[p.i].c.pose = G.first === p.i || G.first === -2 ? 'cheer' : 'sad'; }); }
      else { say(PL[0].blocked && PL[1].blocked ? pick(HOST_BAD) : pick(HOST_NONE), 2.0); S.groan(1.6); audio.sfx('lose', { vol: 0.5 }); S.host.pose = 'sad'; PL.forEach((p) => { S.desks[p.i].c.pose = 'sad'; }); }
      if (q.type !== 'estimate' && G.q.type !== 'order') { /* juiste antwoord al op het bord */ }
      G.revealT = q.type === 'estimate' ? 3.0 : 2.1;
    }
    function nextAfterReveal() {
      for (const p of PL) S.desks[p.i].c.pose = 'idle'; S.host.pose = 'idle';
      if (G.sd) {
        if (G.first >= 0) return finale(G.first);
        G.sdCount++;
        if (G.sdCount >= 3) { G.coin = true; return finale(Math.random() < 0.5 ? 0 : 1); }
        G.q = extraQuestion(G.used); G.used.add(G.q.id); G.qi--; return startQuestion();
      }
      if (G.qi + 1 < TOTAL) return startQuestion();
      Q.forEach((q) => G.used.add(q.id));
      if (sc[0] !== sc[1]) return finale(sc[0] > sc[1] ? 0 : 1);
      G.sd = true; G.sdCount = 0; G.q = extraQuestion(G.used); G.used.add(G.q.id); G.qi = TOTAL - 1; startQuestion();
    }
    function finale(w) {
      G.phase = 'final'; G.t = 0; G.winner = w; hud.setTimer(null); S.setTimerBar(0);
      title(G.coin ? 'DE KIP BESLIST!' : `${names[w]} WINT!`, G.coin ? `${names[w]} heeft geluk!` : 'Heitjesmiljonair van het dorp!', `${names[0]} ${sc[0]} - ${sc[1]} ${names[1]}`);
      say(G.coin ? 'Nog steeds gelijk? De kip kiest!' : `${names[w]} wint de show!`, 3);
      S.desks.forEach((D) => { D.c.pose = D.i === w ? 'cheer' : 'sad'; }); S.host.pose = 'cheer'; S.cheer(5); audio.sfx('win');
      fx.particles.burst(S.desks[w].baseX, 5, 3, { count: 70, speed: 8, up: 1.4, life: 1.6, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a], gravity: 5 });
    }
    function finish() {
      if (G.finished) return; G.finished = true;
      const w = G.winner >= 0 ? G.winner : (sc[0] === sc[1] ? (Math.random() < 0.5 ? 0 : 1) : sc[0] > sc[1] ? 0 : 1);
      const hl = G.coin ? 'Na drie beslissende vragen zonder winnaar koos de kip.' : G.sd ? 'Het werd gelijk, maar de beslissende vraag besliste het.' : 'Netjes gespeeld!';
      ctx.finishPvp({ winner: w, score: [sc[0], sc[1]], delay: 600, summary: `${names[w]} wordt <b>Heitjesmiljonair</b>! ${hl} (Goed: ${names[0]} ${PL[0].stats.right}, ${names[1]} ${PL[1].stats.right}.)` });
    }

    // ---------------- antwoorden ----------------
    function dirEdge(i) {
      const inp = pv.input(i); let d = -1;
      if (inp.mag > 0.55) d = Math.abs(inp.x) > Math.abs(inp.y) ? (inp.x < 0 ? 0 : 2) : (inp.y < 0 ? 1 : 3);
      const p = PL[i]; const e = d >= 0 && d !== p.dirPrev ? d : -1; p.dirPrev = d; return e;
    }
    function markPick(i, d, ok) { G.marks[d].push({ p: i, ok }); }
    function correct(i, d) {
      const p = PL[i], q = G.q; p.done = true; p.stats.right++;
      const mult = q.gold ? 2 : 1;
      const first = G.first === -1;
      if (first) { G.first = i; const bonus = Math.round(50 * clamp(G.timer / G.limit, 0, 1)); addScore(i, (PTS + bonus) * mult, `+${(PTS + bonus) * mult}!`); }
      else addScore(i, 50 * mult, `+${50 * mult}`);
      if (d >= 0) markPick(i, d, true);
      audio.sfx('coin'); audio.sfx('good'); const D = S.desks[i]; D.press = 1; D.c.jump(); D.lit = 1.1; fx.particles.burst(D.baseX, 3.2, 3.8, { count: 22, speed: 5, up: 1.3, life: 0.8, size: 0.35, colors: [0xffe14a, 0x6aff8a, 0xffffff], gravity: 6 });
      if (first) { S.cheer(1.4); const o = PL[1 - i]; if (!o.done && !o.blocked && !(G.sd)) { G.phase = 'grace'; G.t = 0; G.timer = GRACE; G.limit = GRACE; say(`${names[i]} heeft het! ${names[1 - i]}, snel!`, 1.4); board(); return; } }
      endQuestion();
    }
    function wrong(i, d, pts = WRONG) {
      const p = PL[i], q = G.q; p.blocked = true; p.done = true; p.stats.wrong++;
      const cost = G.sd ? 0 : pts * (q.gold ? 2 : 1);
      if (cost) addScore(i, -cost, `-${cost}`); else fx.texts.add('FOUT!', S.desks[i].baseX, 5.4, 3.2, '#ff6a6a', 1.4);
      if (d >= 0) { markPick(i, d, false); board(); }
      audio.sfx('buzz'); audio.sfx('bad'); ctx.shake(0.35); S.groan(1.0); S.desks[i].c.pose = 'sad'; const D = S.desks[i]; D.lit = 0.05;
      const o = PL[1 - i];
      if (G.phase === 'grace' || (o.blocked || o.done)) { endQuestion(); }
    }
    function useJoker(i) {
      const p = PL[i], q = G.q, o = PL[1 - i];
      if (p.usedJoker) { hud.toast(`${names[i]}: maar één joker per vraag!`, 1100); return; }
      const j = p.jokers.find((x) => !x.used);
      if (!j) { hud.toast(`${names[i]} heeft geen jokers meer`, 1100); audio.sfx('miss'); return; }
      if (p.done || p.blocked) return;
      if (j.t === 'freeze' && (o.done || o.blocked || o.frozen > 0 || o.locked && q.type === 'estimate')) { hud.toast('De ander kan toch al niet meer antwoorden!', 1300); audio.sfx('miss'); return; }
      j.used = true; p.usedJoker = true; refreshHud();
      if (j.t === 'freeze') {
        o.frozen = 3; o.kip = false; hud.toast(`❄️ ${names[i]} gooit een IJSBLOK! ${names[1 - i]} zit 3 s vast.`, 1800); audio.sfx('sparkle'); audio.sfx('whoosh');
        const D = S.desks[1 - i]; fx.particles.burst(D.baseX, 2.8, 3.6, { count: 34, speed: 5, up: 1.2, life: 1.0, size: 0.4, colors: [0xcff4ff, 0x9fe8ff, 0xffffff], gravity: 3 }); ctx.shake(0.25);
      } else {
        audio.sfx('powerup', { vol: 0.7 }); hud.toast(`${names[i]} gebruikt de 50/50 joker!`, 1500);
        if (q.type === 'estimate') { const mid = (p.lo + p.hi) / 2; const top = q.ans >= mid; if (top) p.lo = Math.round(mid / q.fine) * q.fine; else p.hi = Math.round(mid / q.fine) * q.fine; p.val = clamp(p.val, p.lo, p.hi); }
        else if (q.type === 'order') p.hintArrow = q.perm.indexOf(p.prog);
        else { const ok = q.opts.findIndex((x) => x.ok); const wr = shuffle([0, 1, 2, 3].filter((d) => d !== ok)); p.hint5 = [ok, wr[0]].sort(); }
      }
    }
    // ---------------- per vraag-type updaten ----------------
    function updateAsk(dt, dq) {
      const q = G.q; const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
      G.timer -= dq; G.t += dt;
      hud.setTimer(G.timer, 3); S.setTimerBar(G.timer / G.limit, G.timer / G.limit > 0.5 ? 0x6aff8a : G.timer / G.limit > 0.25 ? 0xffd23f : 0xff5a4a);
      if (q.type === 'sound') { G.sndT += dt; G.beatT += dt; if (G.sndT < G.sndDur + 0.1 && Math.floor(G.beatT * 8) !== G.lastBeat) { G.lastBeat = Math.floor(G.beatT * 8); board(); } else if (S.host.pose === 'dance' && G.sndT > G.sndDur) S.host.pose = 'idle'; }
      if (G.chickenAt > 0 && G.phase === 'ask') { G.chickenAt -= dt; if (G.chickenAt <= 0) startChicken(); }
      for (const i of order) {
        const p = PL[i], inp = pv.input(i); const e = dirEdge(i);
        p.frozen = Math.max(0, p.frozen - dt); p.lock = Math.max(0, p.lock - dt); p.tootCd = Math.max(0, p.tootCd - dt);
        if (inp.bP) useJoker(i);
        const blocked = p.frozen > 0 || p.lock > 0;
        if (inp.aP) {
          if (q.type === 'sound' && G.sndT > G.sndDur + 0.05 && G.replays < 3 && G.phase === 'ask') { G.replays++; playSound(); }
          else if (q.type === 'estimate' && !blocked && !p.locked) { p.locked = true; audio.sfx('select'); S.desks[i].press = 1; fx.texts.add('Vast!', S.desks[i].baseX, 5.4, 3.2, '#6aff8a', 1.1); }
          else if (q.type !== 'estimate' && p.tootCd <= 0) toot(i);
        }
        if (blocked || p.done) { continue; }
        if (q.type === 'buzz' || q.type === 'gold' || q.type === 'sound') {
          if (e >= 0) { if (q.opts[e].ok) correct(i, e); else wrong(i, e); if (G.phase === 'reveal') return; }
        } else if (q.type === 'order') {
          if (e >= 0 && e <= 2) {
            if (q.perm[e] === p.prog) { p.prog++; p.hintArrow = null; audio.sfx('ding', { rate: 1 + p.prog * 0.2 }); S.desks[i].c.jump(); if (p.prog >= 3) { correct(i, -1); if (G.phase === 'reveal') return; } }
            else { p.prog = 0; p.hintArrow = null; p.lock = 1.0; p.stats.wrong++; addScore(i, -ORDER_WRONG, `-${ORDER_WRONG}`); audio.sfx('buzz'); ctx.shake(0.25); S.desks[i].c.pose = 'sad'; setTimeout(() => { if (!G.finished) S.desks[i].c.pose = 'idle'; }, 700); }
          }
        } else if (q.type === 'estimate' && !p.locked) {
          const fine = -inp.y, coarse = inp.x;
          p.holdF = Math.abs(fine) > 0.4 ? Math.min(1.5, p.holdF + dt) : 0; p.holdC = Math.abs(coarse) > 0.4 ? Math.min(1.5, p.holdC + dt) : 0;
          if (Math.abs(fine) > 0.2) p.val += fine * q.fine * (5 + p.holdF * 9) * dt;
          if (Math.abs(coarse) > 0.2) p.val += coarse * q.coarse * (4 + p.holdC * 7) * dt;
          p.val = clamp(p.val, p.lo, p.hi);
        }
        if (G.phase === 'reveal') return;
      }
      if (G.phase !== 'ask' && G.phase !== 'grace') return;
      if (q.type === 'estimate') {
        if ((PL[0].locked && PL[1].locked) || G.timer <= 0) {
          if (G.stage === 1) {
            // hoger / lager na de eerste gok
            const tol = Math.max(q.fine, 0.03 * (q.max - q.min)); let allDone = true;
            for (const p of PL) { const d = q.ans - p.val; if (Math.abs(d) <= tol) { p.hintTxt = 'RAAK!'; p.locked = true; } else { p.hintTxt = d > 0 ? 'HOGER! ▲' : 'LAGER! ▼'; p.locked = false; allDone = false; } }
            G.picks = [null, null]; hud.toast('Hoger of lager? Stel nog één keer bij!', 1800); audio.sfx('sparkle');
            if (allDone) return endQuestion();
            G.stage = 2; G.timer = 4.5; G.limit = 4.5; G.hint = 'Hoger of lager? Stel bij en druk A!';
            for (const p of PL) { if (!p.locked) { p.lo = q.min; p.hi = q.max; } } board();
          } else endQuestion();
        }
        return;
      }
      if (G.timer <= 0) {
        // geen (goed) antwoord meer
        if (G.phase === 'grace') endQuestion(); else { for (const p of PL) if (!p.done) p.stats.wrong += 0; endQuestion(); }
      }
    }
    function toot(i) {
      const p = PL[i]; p.tootCd = 0.9; const D = S.desks[i]; D.press = 1; D.c.jump(); audio.sfx('boing', { rate: 0.8 + Math.random() * 0.8, vol: 0.5 });
      fx.particles.burst(D.baseX, 2.9, 3.9, { count: 6, speed: 2.5, up: 1, life: 0.5, size: 0.25, colors: [0xffe14a, 0xff6fa5], gravity: 4 });
    }
    function startChicken() {
      const t = sc[0] === sc[1] ? (Math.random() < 0.5 ? 0 : 1) : (sc[0] > sc[1] ? 0 : 1);
      say('Oh nee, de KIP!', 2.0);
      S.chickenStart(t, () => {
        if (G.phase === 'ask' && !PL[t].done) { PL[t].frozen = 2.4; PL[t].kip = true; hud.toast(`🐔 De kip zit op de buzzer van ${names[t]}!`, 2000); fx.texts.add('KOEKELOEREKOE!', S.desks[t].baseX, 5.8, 3.2, '#ffe14a', 1.6); }
      });
    }

    // ---------------- hoofd-update ----------------
    function tick(dt) {
      T += dt;
      if (G.finished) return;
      if (G.phase === 'wait') { G.phase = 'idle0'; G.t = 0; G.qi = -1; startQuestion(); }
      G.elapsed += dt;
      if (G.phase !== 'ask' && G.phase !== 'grace') { dirEdge(0); dirEdge(1); }   // knop vasthouden tijdens de uitslag telt niet als antwoord
      const dq = dt * TS;
      // de Deurman kijkt door de studiodeur
      if (G.phase === 'ask' || G.phase === 'reveal') { G.deurT -= dt; if (G.deurT <= 0) { G.deurT = rand(26, 36); S.deurPeek(3.4); say('Brr... de Deurman kijkt mee!', 2.2); S.sign('...', '#8a8aff'); S.signLater(3.6); } }
      if (G.phase === 'intro') { G.t += dt; if (G.t >= 1.15) beginAsk(); }
      else if (G.phase === 'ask' || G.phase === 'grace') updateAsk(dt, dq);
      else if (G.phase === 'reveal') { G.t += dt; if (G.t >= G.revealT) nextAfterReveal(); }
      else if (G.phase === 'final') { G.t += dt; if (G.t > 3.4) finish(); }
      if (G.elapsed > GAME_CAP && !G.finished && G.phase !== 'final') { G.coin = sc[0] === sc[1]; finale(sc[0] === sc[1] ? (Math.random() < 0.5 ? 0 : 1) : sc[0] > sc[1] ? 0 : 1); }
      if (G.phase === 'reveal') for (const p of PL) { p.frozen = 0; }
    }
    function visuals(dt) {
      S.update(dt);
      for (const D of S.desks) {
        S.drawDesk(D.i, deskState(D.i));
      }
    }
    refreshHud(); title('HEITJESMILJONAIR', 'Wie wordt de slimste van het dorp?', `${names[0]} tegen ${names[1]}`); S.say('Welkom bij de show!', 99);
    visuals(0.016);

    return {
      update(dt) { tick(dt); visuals(dt); },
      introUpdate(dt) { introT += dt; visuals(dt); },
      resultUpdate(dt) { visuals(dt); },
      onSwap() { for (const D of S.desks) fx.particles.burst(D.baseX, 3, 3.5, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); S.say('Wisselen maar! Wie bestuurt wie?', 2); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m) { addScore(i, -25, 'BEWOOG! -25', '#ff6a6a'); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.3); } }); },
      celebrate(w) { S.desks[w].c.pose = 'cheer'; S.desks[1 - w].c.pose = 'sad'; S.host.pose = 'cheer'; S.cheer(6); },
      onResize() { fitCamera(); },
      dispose() {},
      dbg: {
        G, PL, sc, Q, S,
        state: () => ({ T, phase: G.phase, qi: G.qi, type: G.q && G.q.type, sd: G.sd, sdCount: G.sdCount, score: [...sc], finished: G.finished, timer: G.timer, stage: G.stage, elapsed: G.elapsed, first: G.first, blocked: PL.map((p) => p.blocked), done: PL.map((p) => p.done), frozen: PL.map((p) => p.frozen), prog: PL.map((p) => p.prog), jokers: PL.map((p) => p.jokers.filter((j) => !j.used).length), val: PL.map((p) => p.val), q: G.q && { ok: G.q.opts ? G.q.opts.findIndex((o) => o.ok) : -1, ans: G.q.ans, perm: G.q.perm, id: G.q.id, fine: G.q.fine, min: G.q.min, max: G.q.max, coarse: G.q.coarse }, chicken: S.chickenBusy(), coin: G.coin, winner: G.winner }),
        setScore: (a, b) => { sc[0] = a; sc[1] = b; refreshHud(); },
        goto: (n) => { G.qi = n - 1; startQuestion(); },
      },
    };
  },
};

import * as THREE from 'three';
import { clamp, lerp, damp } from '../engine/util.js';
import { buildStudio, LEC_X, LEC_Z, CAM } from './buzz3_world.js';
import { ROUND_FACTORY, roundA } from './buzz3_rounds.js';
import { txt, rr, shape, burst } from './buzz3_draw.js';

// Drie-Buzzer — quizshow voor drie: Wes, Jor en Juul achter hun lessenaar, de Deurman (met feesthoed) als presentator.
// 10 rondes: Groen!, Welk is het meest?, Deurman zegt, Schat het getal, Volg de volgorde. Snelste goede antwoord = 3 punten, daarna 2 en 1,
// fout = -1. Ronde 10 is GOUD (dubbel). Wie achterstaat krijgt een hulpje. Bij gelijkstand: beslissingsronde.
const PLAN = ['a', 'b', 'd', 'e', 'c', 'a', 'd', 'b', 'c', 'e'];
const PCOL = ['#35c46f', '#4a8cff', '#ff9a3c'];
const T_CAP = 92;   // na zoveel seconden stopt het quizzen na de lopende ronde
const CONF = [0xff5a5a, 0xffd23f, 0xff6fb5, 0x35d6c8, 0x8a6aff, 0x7bff7b];

export default {
  id: 'buzz3',
  name: 'Drie-Buzzer',
  giver: 'Presentator de Deurman',
  icon: '🔔',
  mode: 'pvp',
  players: [3],
  time: 90,
  twists: ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'bodyswap', 'deurman'],
  music: 'game_fast',
  blurb: 'Welkom bij de quiz van <b>de Deurman</b>! <b>10 rondes</b>: reageer op groen, tel vormpjes, onthoud pijlen, trap niet in de Deurman-valstrik en schat het getal. <b>Snelste goede antwoord = 3 punten</b>, fout = -1. Ronde 10 is <b>goud (dubbel)</b>!',
  controls: ['{move} pijl kiezen / schuiven', '{a} BUZZER!', '{b} gekke streek (hoi!)'],
  tip: 'Te vroeg buzzeren kost een punt. Wie achterstaat krijgt een hulpje!',

  create(ctx) {
    const { scene, camera, hud, fx } = ctx, pv = ctx.pvp, n = ctx.players.length, names = ctx.players.map((p) => p.name);
    ctx.lights('indoor', { shadow: 14, center: [0, 0, 0] });
    camera.position.set(...CAM.pos); camera.lookAt(...CAM.look);
    const W = buildStudio(ctx);
    const rng = ctx.rng;

    // ---------------- toestand ----------------
    const pl = ctx.players.map(() => ({ score: 0, shown: 0, firsts: 0, fouls: 0, hits: 0 }));
    const poseT = pl.map(() => 0), hostT = { t: 0 }, prevDir = pl.map(() => null);
    const aE = pl.map(() => false), dE = pl.map(() => null), bCd = pl.map(() => 0);
    const lecFn = pl.map(() => null), lecMsg = pl.map(() => ({ a: 'DRUK A!', b: 'buzzer', c: '#ffe14a' }));
    let ph = 'intro', ridx = -1, R = null, gold = false, tPh = 0, T = 0, rot = 0, done = false, helpedNow = pl.map(() => false), caption = 'Welkom, welkom, welkom!', capT = 0, tiebreak = false;
    const seen = {}; let tbTried = false, bgT = 0, drawT = 0, finalT = 0, roundBest = null;
    const roundGain = pl.map(() => 0);

    // ---------------- schermpjes ----------------
    const drawLec = (i) => {
      const s = W.pods[i].scr, g = s.g, w = s.w, h = s.h;
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b1038'); gr.addColorStop(1, '#2e1a5c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = PCOL[ctx.players[i].id]; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      if (lecFn[i]) lecFn[i](g, w, h); else { const m = lecMsg[i]; txt(g, m.a, w / 2, 40, 36, m.c, { max: w - 20 }); txt(g, m.b, w / 2, 82, 22, '#fff', { max: w - 20 }); }
      s.tex.needsUpdate = true;
    };
    const lec = (i, a, b = '', c = '#ffe14a') => { lecFn[i] = null; lecMsg[i] = { a, b, c }; drawLec(i); };
    const lecDraw = (i, fn) => { lecFn[i] = fn; drawLec(i); };
    const drawSign = (i) => {
      const s = W.pods[i].sign, g = s.g, w = s.w, h = s.h, col = ctx.players[i].css;
      g.fillStyle = '#12082a'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.globalAlpha = 0.22; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      txt(g, names[i], 78, 34, 38, col, { max: 140 });
      txt(g, String(Math.round(pl[i].shown)), 196, 34, 50, '#ffe14a');
      s.tex.needsUpdate = true;
    };
    const signDirty = pl.map(() => true);

    // ---------------- spel-API voor de rondes ----------------
    const dirOf = (inp) => { const ax = Math.abs(inp.x), ay = Math.abs(inp.y); if (Math.max(ax, ay) < 0.55) return null; return ax > ay ? (inp.x < 0 ? 'left' : 'right') : (inp.y < 0 ? 'up' : 'down'); };
    const at3 = (i) => [LEC_X[i], 0, LEC_Z];
    const floatAt = (i, text, col, s = 0.8, y = 3.5) => fx.texts.add(text, W.pods[i].x, y, LEC_Z + 1.6, col, s);
    const pose = (i, p, secs) => { W.chars[i].pose = p; poseT[i] = secs; };
    const confetti = (i, k = 1) => fx.particles.burst(W.pods[i].x, 3.2, LEC_Z + 0.6, { count: Math.round(26 * k), speed: 5.5, up: 1.4, spread: 1.3, life: 1.2, size: 0.4, colors: CONF, gravity: 8 });
    const G = {
      n, pl, rot: 0, gold: false,
      rng: () => rng(), name: (i) => names[i],
      aEdge: (i) => aE[i], dirEdge: (i) => dE[i], inp: (i) => pv.input(i),
      helped: (i) => helpedNow[i], spd: (i) => pv.speed(i), get slip() { return pv.slip; },
      lec, lecDraw, floatAt, col: (i) => ctx.players[i].css,
      sfx: (a, o) => ctx.sfx(a, o),
      press: (i) => { W.press(i); W.chars[i].swing(); },
      lamp: (i, hex, k) => W.lamp(i, hex, k),
      flash: () => {},
      host: (p, secs) => { W.host.pose = p; hostT.t = secs; },
      award(i, pts, label) {
        const mult = G.gold ? 2 : 1; const v = pts * mult;
        pl[i].score = Math.max(0, pl[i].score + v); roundGain[i] += v; signDirty[i] = true;
        if (v > 0) {
          floatAt(i, '+' + v, G.gold ? '#ffd23f' : '#7bff7b', 1.0); if (label) floatAt(i, label, '#ffffff', 0.5, 2.9);
          confetti(i, v >= 3 ? 1.2 : 0.6); pose(i, 'cheer', 1.3); W.lamp(i, '#35e04a', 1.2); W.beam(i, 1); W.cheerCrowd(v >= 3 ? 0.9 : 0.4); ctx.sfx(v >= 3 ? 'good' : 'coin', { vol: 0.8 }); if (v >= 3) ctx.sfx('sparkle', { vol: 0.5 });
          if (!roundBest || v > roundBest.v) roundBest = { i, v };
        } else if (v < 0) {
          floatAt(i, String(v), '#ff5a5a', 1.0); if (label) floatAt(i, label, '#ff9a8a', 0.5, 2.9);
          pose(i, 'sad', 1.2); W.lamp(i, '#ff3b3b', 1.2); ctx.shake(0.18); ctx.sfx('bad', { vol: 0.7 });
        }
        return v;
      },
    };

    // ---------------- rondes ----------------
    const makeRound = (idx) => {
      const type = PLAN[idx]; G.gold = idx === PLAN.length - 1; G.rot = rot++ % n;
      if (type === 'c') return ROUND_FACTORY.c(G, { len: idx < 6 ? 3 : 4 });
      return ROUND_FACTORY[type](G);
    };
    const computeHelp = () => {
      const sc = pl.map((p) => p.score), mn = Math.min(...sc), mx = Math.max(...sc);
      helpedNow = sc.map((s) => s === mn && mx - mn >= 3 && ridx >= 2);
      // niet iedereen tegelijk: bij 3 gelijken geen hulp (mx-mn=0)
      helpedNow.forEach((hp, i) => { if (hp) { floatAt(i, 'HULPJE!', '#9ad8ff', 0.7, 3.0); W.lamp(i, '#9ad8ff', 1); ctx.sfx('powerup', { vol: 0.5 }); } });
      const hn = names.filter((_, i) => helpedNow[i]);
      if (hn.length) hud.toast(`${hn.join(' en ')} ${hn.length > 1 ? 'krijgen' : 'krijgt'} een hulpje (comeback)!`, 2000);
    };
    const beginRound = (idx) => {
      ridx = idx; roundBest = null; roundGain.fill(0);
      if (T > T_CAP && !tiebreak) { toFinal(); return; }
      G.gold = idx === PLAN.length - 1;
      computeHelp();
      const GEN = { a: ['GEDULD...', 'wacht op groen'], b: ['TEL & KIES', 'druk een pijl'], c: ['KIJK GOED!', 'onthoud de pijlen'], d: ['LUISTER!', 'alleen Deurman zegt'], e: ['KIJK GOED!', 'straks schatten'] }[PLAN[idx]];
      for (let i = 0; i < n; i++) { W.lampReset(i); lec(i, GEN[0], helpedNow[i] ? 'hulpje actief' : GEN[1], helpedNow[i] ? '#9ad8ff' : '#ffe14a'); }
      R = makeRound(idx);
      ph = 'title'; tPh = 0; const first = !seen[R.type]; seen[R.type] = true; R.titleT = first ? 2.1 : 1.0;
      if (G.gold) { R.titleT = 2.3; hud.showBig('GOUDEN RONDE: DUBBEL!', 1500, '#ffd23f'); ctx.sfx('powerup'); for (let i = 0; i < n; i++) W.beam(i, 1); }
      hud.setScore(G.gold ? 'GOUDEN RONDE x2' : `Ronde ${idx + 1} / ${PLAN.length}`);
      caption = G.gold ? 'De GOUDEN ronde! Alles telt dubbel!' : ['Daar gaan we!', 'Handen aan de buzzers!', 'Let goed op!', 'Wie wordt de snelste?'][idx % 4];
      W.host.pose = 'point'; hostT.t = 1.4;
      ctx.sfx('bell', { vol: 0.35, rate: 1.2 });
    };
    const startTiebreak = (tied) => {
      tiebreak = true; tbTried = true; ridx = PLAN.length; G.gold = false; helpedNow.fill(false); roundBest = null;
      R = roundA(G, { only: tied, title: 'BESLISSING!', rule: 'Gelijke stand! Wie het eerst op GROEN buzzert, wint!' });
      R.titleT = 2.2; R.tied = tied;
      for (let i = 0; i < n; i++) { W.lampReset(i); lec(i, tied.includes(i) ? 'GEDULD...' : 'KIJKEN', tied.includes(i) ? 'beslissing' : 'jij niet', tied.includes(i) ? '#ffe14a' : '#888888'); }
      ph = 'title'; tPh = 0; hud.setScore('BESLISSINGSRONDE'); hud.showBig('GELIJKSTAND! BESLISSING!', 1500, '#ff6fb5'); ctx.sfx('powerup');
      caption = 'Gelijkspel? Dat laat ik niet toe!';
    };
    // standen & winnaar (tiebreak: punten, eerste plekken, minste fouten, dan loting)
    const ranking = () => pl.map((p, i) => i).sort((a, b) => pl[b].score - pl[a].score || pl[b].firsts - pl[a].firsts || pl[a].fouls - pl[b].fouls);
    const topTied = () => { const r = ranking(); const t = r.filter((i) => pl[i].score === pl[r[0]].score && pl[i].firsts === pl[r[0]].firsts && pl[i].fouls === pl[r[0]].fouls); return t; };
    let winner = null;
    const toFinal = () => {
      ph = 'final'; finalT = 0; R = null; hud.setTimer(null); hud.setScore('EINDSTAND');
      const top = ranking(); winner = top[0];
      const tie = topTied(); if (tie.length > 1) winner = tie[Math.floor(rng() * tie.length)];
      if (tiebreak && tbWinner != null) winner = tbWinner;
      W.chars.forEach((c, i) => { c.pose = i === winner ? 'cheer' : 'sad'; poseT[i] = 99; });
      W.host.pose = 'cheer'; hostT.t = 99; W.cheerCrowd(2);
      caption = `${names[winner]} is de Drie-Buzzer-kampioen!`;
      ctx.sfx('tada'); ctx.sfx('cheer', { vol: 0.8 }); W.beam(winner, 1.5); W.lamp(winner, '#ffd23f', 3);
      for (let k = 0; k < 3; k++) confetti(winner, 2);
    };
    let tbWinner = null;
    const finish = () => {
      if (done) return; done = true;
      const sc = pl.map((p) => p.score);
      const best = pl.map((p, i) => i).sort((a, b) => pl[b].firsts - pl[a].firsts)[0];
      ctx.finishPvp({ winner, score: sc, delay: 500, summary: `<b style="color:${ctx.players[winner].css}">${names[winner]}</b> wint de quiz met <b>${sc[winner]}</b> punten!<br>Snelste buzzer: ${names[best]} (${pl[best].firsts}x eerste).` + (tbWinner != null ? ' <i>Beslist in de beslissingsronde!</i>' : '') });
    };

    // ---------------- grote scherm ----------------
    const drawBg = (g, w, h, t) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1a6e'); gr.addColorStop(1, '#5a2a8e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.save(); g.globalAlpha = 0.16; burst(g, w / 2, h * 0.55, 800, t, G.gold ? '#ffd23f' : '#8a6aff', 'rgba(0,0,0,0)', 18); g.restore();
      if (G.gold && ph !== 'intro') { g.strokeStyle = '#ffd23f'; g.lineWidth = 10 + Math.sin(t * 8) * 3; g.strokeRect(5, 5, w - 10, h - 10); }
    };
    const drawBig = (tm) => {
      const b = W.big, g = b.g, w = b.w, h = b.h;
      drawBg(g, w, h, tm);
      if (ph === 'intro') {
        txt(g, 'DRIE-BUZZER', w / 2, 170, 120, '#ffe14a'); txt(g, 'de grote quiz van de Deurman', w / 2, 262, 40, '#ffffff');
        names.forEach((nm, i) => txt(g, nm, w * (0.2 + 0.3 * i), 360, 64, ctx.players[i].css)); txt(g, '10 rondes · snelste goede antwoord wint!', w / 2, 470, 34, '#9ad8ff');
        shape(g, 'star', 90, 90, 40, '#ffd23f', tm); shape(g, 'star', w - 90, 90, 40, '#ffd23f', tm);
      } else if (ph === 'title') {
        const k = Math.min(1, tPh / 0.25), sc = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
        g.save(); g.translate(w / 2, 200); g.scale(sc, sc);
        if (G.gold) { txt(g, 'GOUDEN RONDE · DUBBEL!', 0, -110, 44, '#ffd23f'); shape(g, 'star', -330, -110, 28, '#ffd23f', tm); shape(g, 'star', 330, -110, 28, '#ffd23f', tm); }
        else txt(g, tiebreak ? 'BESLISSINGSRONDE' : `RONDE ${ridx + 1} VAN ${PLAN.length}`, 0, -110, 38, '#9ad8ff');
        txt(g, R.title, 0, 0, R.title.length > 16 ? 76 : 100, '#ffe14a', { max: 960 }); g.restore();
        // regel (uitleg) in een balk
        g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, 30, 320, w - 60, 170, 24); g.fill();
        wrap(g, R.rule, w / 2, 405, w - 110, 46, '#ffffff', 40);
        if (helpedNow.some(Boolean)) txt(g, 'Hulpje voor: ' + names.filter((_, i) => helpedNow[i]).join(', '), w / 2, 290, 30, '#9ad8ff');
      } else if (ph === 'play' || ph === 'reveal') {
        txt(g, G.gold ? 'GOUD x2' : tiebreak ? 'BESLISSING' : `RONDE ${ridx + 1}/${PLAN.length}`, w - 30, 34, 30, G.gold ? '#ffd23f' : '#9ad8ff', { align: 'right' });
        txt(g, R.title, 30, 34, 32, '#ffe14a', { max: 285, align: 'left' });
        R.draw(g, w, h, tm);
      } else if (ph === 'final') {
        drawFinal(g, w, h, tm);
      }
      // onderschrift van de presentator
      if (ph === 'reveal' && caption) txt(g, caption, w - 30, 74, 26, '#ffffff', { max: 520, align: 'right' });
      b.tex.needsUpdate = true;
    };
    function wrap(g, text, x, y, maxW, lh, col, fs = 32) {
      g.save(); g.font = `bold ${fs}px Fredoka, "Arial Black", sans-serif`; const words = text.split(' '); const lines = []; let cur = '';
      for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
      lines.push(cur); g.restore();
      lines.forEach((l, k) => txt(g, l, x, y + (k - (lines.length - 1) / 2) * lh, fs, col));
    }
    function drawFinal(g, w, h, tm) {
      txt(g, 'EINDSTAND', w / 2, 62, 56, '#ffe14a');
      const max = Math.max(1, ...pl.map((p) => p.score));
      pl.forEach((p, i) => {
        const bh = (120 + 180 * (p.score / max)) * Math.min(1, finalT / 1.0), x = w * (0.2 + 0.3 * i), y = 442;
        g.fillStyle = ctx.players[i].css; g.strokeStyle = i === winner ? '#ffd23f' : '#ffffff'; g.lineWidth = i === winner ? 8 : 3; rr(g, x - 70, y - bh, 140, bh, 14); g.fill(); g.stroke();
        if (bh > 100) { txt(g, String(p.score), x, y - bh + 40, 54, '#ffffff'); txt(g, names[i], x, y - bh + 92, 34, '#ffffff', { max: 130 }); }
        if (i === winner) { shape(g, 'star', x, y - bh - 36 + Math.sin(tm * 6) * 6, 30, '#ffd23f', tm); }
      });
      txt(g, caption, w / 2, 128, 32, '#ffffff', { max: 960 });
    }

    // ---------------- hoofdlus ----------------
    function updateCommon(dt) {
      bgT += dt; W.update(dt);
      for (let i = 0; i < n; i++) {
        if (poseT[i] > 0 && poseT[i] < 90) { poseT[i] -= dt; if (poseT[i] <= 0) W.chars[i].pose = 'idle'; }
        const sz = pv.size(i); W.chars[i].group.scale.setScalar(sz * 1.2); W.chars[i].group.position.y = 1.45 + (1 - W.chars[i].s) * 1.8 + (sz < 1 ? (1 - sz) * 1.2 : 0);
        const sh = pl[i].shown; if (Math.abs(sh - pl[i].score) > 0.01) { pl[i].shown = Math.abs(pl[i].score - sh) < 0.3 ? pl[i].score : sh + Math.sign(pl[i].score - sh) * Math.min(Math.abs(pl[i].score - sh), dt * 14); signDirty[i] = true; }
        if (signDirty[i]) { drawSign(i); signDirty[i] = false; }
        hud.setPlayerInfo(i, `${pl[i].score} punten`);
      }
      if (hostT.t > 0 && hostT.t < 90) { hostT.t -= dt; if (hostT.t <= 0) W.host.pose = 'idle'; }
      drawT -= dt; if (drawT <= 0) { drawT = 1 / 18; drawBig(bgT); }
    }
    for (let i = 0; i < n; i++) { drawLec(i); drawSign(i); signDirty[i] = false; }
    hud.setScore('Drie-Buzzer');
    drawBig(0);

    return {
      onStart() { hud.setTimer(null); hud.setScore('Drie-Buzzer'); beginRound(0); },
      introUpdate(dt) { W.update(dt); drawT -= dt; if (drawT <= 0) { drawT = 1 / 15; bgT += 1 / 15; drawBig(bgT); } },
      update(dt) {
        T += dt; tPh += dt;
        if (T > 150 && ph !== 'final') toFinal();   // noodrem: het spel eindigt altijd
        for (let i = 0; i < n; i++) { const inp = pv.input(i); aE[i] = !!inp.aP; bCd[i] = Math.max(0, bCd[i] - dt); if (inp.bP && bCd[i] <= 0 && !done) { bCd[i] = 1.3; pose(i, 'wave', 0.9); W.chars[i].jump(); ctx.sfx('squeak', { rate: 0.8 + i * 0.25, vol: 0.5 }); floatAt(i, ['HOI!', 'HIHI!', 'BOEH!'][Math.floor(rng() * 3)], '#ffffff', 0.55, 3.1); } const d = dirOf(inp); dE[i] = d && d !== prevDir[i] ? d : null; prevDir[i] = d; }
        if (ph === 'title') {
          if (tPh >= R.titleT) { ph = 'play'; tPh = 0; }
        } else if (ph === 'play') {
          R.update(dt);
          const l = R.left && R.left(); hud.setTimer(l == null ? null : l, 2);
          if (R.finished) {
            ph = 'reveal'; tPh = 0; hud.setTimer(null);
            if (tiebreak) {
              const res = R.winner; tbWinner = res != null && R.tied.includes(res) ? res : null;
              if (res != null) { floatAt(res, 'BESLIST!', '#ffd23f', 1.5); pose(res, 'cheer', 1.2); ctx.sfx('win'); }
            }
            caption = roundBest ? ['Wat een reactie!', `${names[roundBest.i]} was de snelste!`, `Punten voor ${names[roundBest.i]}!`, 'Applaus, applaus!'][Math.floor(rng() * 4)] : 'Niemand scoort... jammer!';
            if (tiebreak && tbWinner == null) caption = 'Niemand was snel genoeg... loting!';
          }
        } else if (ph === 'reveal') {
          R.update(dt);
          if (tPh >= 1.45) {
            if (tiebreak) { toFinal(); }
            else if (ridx + 1 < PLAN.length) beginRound(ridx + 1);
            else {
              const tied = topTied();
              if (tied.length > 1 && !tbTried && T < T_CAP + 14) startTiebreak(tied); else toFinal();
            }
          }
        } else if (ph === 'final') {
          finalT += dt; if (Math.random() < dt * 4) confetti(winner, 0.5);
          if (finalT >= 3.2) finish();
        }
        updateCommon(dt);
      },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m) return; pl[i].score = Math.max(0, pl[i].score - 1); pl[i].fouls++; signDirty[i] = true; floatAt(i, 'BEWOOGD! -1', '#ff9a3c', 1.1); pose(i, 'scared', 1.2); });
      },
      onSwap() { W.chars.forEach((c) => c.jump()); },
      celebrate(w) { W.chars.forEach((c, i) => { c.pose = i === w ? 'cheer' : 'sad'; }); W.host.pose = 'cheer'; W.cheerCrowd(2); },
      resultUpdate(dt) { W.update(dt); if (Math.random() < dt * 3 && winner != null) confetti(winner, 0.4); },
      dispose() {},
      dbg: {
        state: () => ({ ph, ridx, type: R ? R.type : null, round: R && R.dbg ? R.dbg() : null, scores: pl.map((p) => p.score), firsts: pl.map((p) => p.firsts), fouls: pl.map((p) => p.fouls), gold: G.gold, helped: helpedNow.slice(), T, tiebreak, winner, done, finished: R ? R.finished : null }),
        goto: (idx) => { beginRound(idx); tPh = 99; },
        skipTitle: () => { tPh = 99; },
        setScore: (i, v) => { pl[i].score = v; pl[i].shown = v; signDirty[i] = true; },
        toFinal: () => toFinal(), G, W,
      },
    };
  },
};

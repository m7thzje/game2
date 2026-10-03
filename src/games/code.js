import * as THREE from 'three';
import { clamp, damp, pick, rand } from '../engine/util.js';
import { PLAYER_CSS } from '../engine/chars.js';
import { buildVault, CRYS, ROWS, COLS, slotPos, pegPos, hintPos, BOARD_X, BOARD_Y } from './code_world.js';
import { feedback, randomCode, quality } from './code_logic.js';

// Kristal-Code — duel: Mastermind met kristallen. Beide broers raden TEGELIJK dezelfde geheime code (4 kristallen, 6 soorten, dubbele mogen).
//  * links/rechts = plek kiezen, omhoog/omlaag = kristal kiezen, A = gok indienen, B = wissen (vasthouden = POWER: spook-kristal of zandloper)
//  * wie de code eerst kraakt wint de ronde; eerste tot 2 rondes (max 4 rondes, 112 s totaal). Mislukt iedereen: de beste gok telt.
//  * comeback: wie de vorige ronde verloor mag één kristal onthullen. Gimmick: de slot-golem verandert (met waarschuwing) de code.
const ROUND_T = 36, GAME_CAP = 112, MAX_ROUNDS = 4, WIN_ROUNDS = 2, MAX_TRIES = ROWS;
const GHOST_T = 3.2, SAND_T = 2.6, WARN_T = 3.0, HOLD_POWER = 0.5;
const NAMEC = CRYS.map((c) => c.name);

export default {
  id: 'code', name: 'Kristal-Code', giver: 'Koning Klopper', icon: '💎', mode: 'pvp', time: 100,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'bodyswap', 'deurman'],
  music: 'tense',
  blurb: 'Kraak de <b>geheime kluis-code</b> van 4 kristallen! Jullie raden <b>tegelijk</b>: elke gok geeft pinnetjes (<b>goud</b> = goede plek, <b>wit</b> = goede kleur op een andere plek). Wie eerst kraakt wint de ronde, eerste tot <b>2 rondes</b>. Pas op voor de <b>slot-golem</b> en de spook-kristallen!',
  controls: ['{move} ◀▶ plek · ▲▼ kristal', '{a} gok indienen', '{b} wissen · vasthouden = POWER'],
  tip: 'Een kristal telt 1x per plek: dubbele kleuren mogen. Elke 2 gokken verdien je een POWER om je broer te hinderen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const TS = clamp(pv.speed(0), 0.6, 1.7);                       // turbo / slakkentempo: de lont brandt sneller of trager
    const L = ctx.lights('cave', { shadow: 12 });
    L.hemi.intensity = 2.3; L.sun.intensity = 1.5; L.sun.position.set(0, 14, 22);
    const V = buildVault(ctx, L);
    camera.fov = 50; V.fitCamera(camera);

    const mkP = (i) => ({ i, rows: [], cur: [-1, -1, -1, -1], cursor: 0, status: 'play', power: 0, subs: 0, bHold: 0, bUsed: false, bDown: false, sab: { ghost: 0, sand: 0 }, hint: null, dirPrev: -1, holdT: 0, repT: 0, bestQ: 0, totalQ: 0, pose: 0, msg: '', msgT: 0, wrongT: 0 });
    const PS = [mkP(0), mkP(1)];
    const R = { n: -1, phase: 'wait', t: 0, code: [0, 0, 0, 0], timeLeft: ROUND_T, limit: ROUND_T, wins: [0, 0], draws: 0, winner: -1, reason: '', golemAt: -1, golemState: 'idle', golemT: 0, golemDone: false, reveal: false, elapsed: 0, matchWinner: -1, finished: false, lastLoser: -1, coin: false, changedPos: -1 };
    const proj = { on: false, t: 0, from: 0, to: 0, type: 'ghost' };
    let T = 0, introT = 0;

    // ---------------- helpers ----------------
    const lead = (i) => R.wins[i] - R.wins[1 - i];
    function refreshHud() {
      hud.setScore(`Ronde ${Math.max(1, R.n + 1)} · ${names[0]} ${R.wins[0]} – ${R.wins[1]} ${names[1]}`);
      for (const p of PS) hud.setPlayerInfo(p.i, `Poging ${p.rows.length}/${MAX_TRIES} · power: ${p.power}`);
    }
    function say(p, text, col = '#ffe14a') { const x = BOARD_X[p.i]; fx.texts.add(text, x, BOARD_Y + 3.2, 1.5, col, 1.5); }
    function refreshPlates(p) {
      const b = p.i; const C = V.plateColors;
      for (let r = 0; r < ROWS; r++) {
        const row = p.rows[r]; const col = row ? (row.stale ? C.stale : C.done) : (r === p.rows.length && p.status === 'play' && R.phase === 'play') ? C.cur : C.idle;
        V.setPlate(b, r, col);
      }
    }
    function resetBoard(p) {
      for (let r = 0; r < ROWS; r++) for (let k = 0; k < 4; k++) V.setPeg(p.i, r, k, 0);
      p.rows = []; p.cur = [-1, -1, -1, -1]; p.cursor = 0; p.status = 'play'; p.sab.ghost = p.sab.sand = 0; p.hint = null; p.bestQ = 0; p.msg = ''; p.bHold = 0; p.bUsed = false; p.wrongT = 0;
      refreshPlates(p);
    }

    // ---------------- ronde-flow ----------------
    function startRound() {
      R.n++; R.phase = 'announce'; R.t = 0; R.reveal = false; R.winner = -1; R.code = randomCode(); R.golemState = 'idle'; R.golemDone = false; R.changedPos = -1;
      R.limit = R.timeLeft = Math.min(ROUND_T, Math.max(10, GAME_CAP - R.elapsed));
      const sd = R.n >= 3;
      for (const p of PS) resetBoard(p);
      // golem: ronde 1 altijd, daarna soms; niet bij de beslissende ronde
      R.golemAt = sd ? -1 : R.n === 0 ? rand(13, 18) : Math.random() < 0.5 ? rand(11, 20) : -1;
      // comeback: de verliezer van de vorige ronde mag één kristal onthullen
      if (R.lastLoser >= 0) { const p = PS[R.lastLoser]; const pos = Math.floor(Math.random() * 4); p.hint = { pos, color: R.code[pos] }; }
      V.setChest(0); V.drawCodePanel('', false); V.golemMode = 'idle'; V.setFuse(1);
      for (const c of V.chars) c.pose = 'idle';
      audio.sfx('select', { rate: 0.8 }); refreshHud();
      if (R.lastLoser >= 0) hud.toast(`${names[R.lastLoser]} mag een kristal onthullen! (comeback-hint)`, 2200);
    }
    function beginPlay() { R.phase = 'play'; R.t = 0; for (const p of PS) refreshPlates(p); audio.sfx('go', { vol: 0.6 }); hud.showBig(R.n >= 3 ? 'BESLISSENDE RONDE!' : `RONDE ${R.n + 1}!`, 900, '#ffe14a'); }
    function endRound(winner, reason) {
      if (R.phase === 'end') return;
      R.phase = 'end'; R.t = 0; R.winner = winner; R.reason = reason; R.reveal = true; hud.setTimer(null);
      if (winner >= 0) { R.wins[winner]++; R.lastLoser = 1 - winner; } else R.lastLoser = -1;
      for (const p of PS) { p.totalQ += p.bestQ; p.status = p.status === 'play' ? 'idle' : p.status; refreshPlates(p); }
      V.setChest(0.01); V.drawCodePanel('', true); V.golemMode = 'idle';
      audio.sfx(winner >= 0 ? 'win' : 'lose', { vol: 0.7 }); audio.sfx('door', { vol: 0.7 });
      PS.forEach((p) => { V.chars[p.i].pose = winner < 0 ? 'idle' : p.i === winner ? 'cheer' : 'sad'; });
      if (winner >= 0) { fx.particles.burst(BOARD_X[winner], BOARD_Y + 2, 2, { count: 60, speed: 8, up: 1.4, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); ctx.shake(0.6); }
      hud.showBig(winner >= 0 ? `${names[winner]} KRAAKT DE CODE!` : reason === 'time' ? 'TIJD OP! GELIJK' : 'GELIJK!', 1500, winner >= 0 ? PLAYER_CSS[winner] : '#ffd23f');
      refreshHud();
    }
    function matchWinner() {
      if (R.wins[0] >= WIN_ROUNDS) return 0; if (R.wins[1] >= WIN_ROUNDS) return 1;
      const played = R.n + 1, over = played >= MAX_ROUNDS || R.elapsed >= GAME_CAP - 1;
      if (played >= 3 && R.wins[0] !== R.wins[1]) return R.wins[0] > R.wins[1] ? 0 : 1;
      if (over) { if (R.wins[0] !== R.wins[1]) return R.wins[0] > R.wins[1] ? 0 : 1; if (PS[0].totalQ !== PS[1].totalQ) return PS[0].totalQ > PS[1].totalQ ? 0 : 1; R.coin = true; return Math.random() < 0.5 ? 0 : 1; }
      return -1;
    }
    function finalize(w) {
      R.phase = 'final'; R.t = 0; R.matchWinner = w; PS.forEach((p) => { V.chars[p.i].pose = p.i === w ? 'cheer' : 'sad'; });
      hud.showBig(`${names[w]} WINT!`, 2000, PLAYER_CSS[w]); audio.sfx('win'); ctx.shake(0.5);
    }
    function finish() {
      if (R.finished) return; R.finished = true;
      const w = R.matchWinner >= 0 ? R.matchWinner : (R.wins[0] >= R.wins[1] ? 0 : 1);
      const how = R.coin ? 'Alles gelijk, dus de golem gooide een muntje.' : R.wins[w] >= WIN_ROUNDS ? 'Twee kluizen gekraakt!' : 'De tijd was op, de beste kraker won.';
      ctx.finishPvp({ winner: w, score: [R.wins[0], R.wins[1]], delay: 700, summary: `${names[w]} is de <b>Kristal-Kraker</b>! ${how} (Gokken: ${names[0]} ${PS[0].subs}, ${names[1]} ${PS[1].subs}.)` });
    }

    // ---------------- spelers: invoer ----------------
    function dirEdge(p) {
      const inp = pv.input(p.i); let d = -1;
      if (inp.mag > 0.55) d = Math.abs(inp.x) > Math.abs(inp.y) ? (inp.x < 0 ? 0 : 2) : (inp.y < 0 ? 1 : 3);
      let e = -1;
      if (d >= 0 && d !== p.dirPrev) { e = d; p.holdT = 0; p.repT = 0; }
      p.dirPrev = d; return { e, d };
    }
    function handlePlayer(p, dt) {
      const inp = pv.input(p.i); const { e, d } = dirEdge(p);
      p.msgT = Math.max(0, p.msgT - dt); p.sab.ghost = Math.max(0, p.sab.ghost - dt); p.sab.sand = Math.max(0, p.sab.sand - dt); p.wrongT = Math.max(0, p.wrongT - dt);
      if (p.status !== 'play') return;
      let step = e;
      // omhoog/omlaag vasthouden = herhalen
      if (d === 1 || d === 3) { p.repT += dt; if (e < 0 && p.repT > 0.36) { p.repT = 0.36 - 0.11; step = d; } } else p.repT = 0;
      if (step === 0) { p.cursor = (p.cursor + COLS - 1) % COLS; audio.sfx('click', { vol: 0.5 }); }
      else if (step === 2) { p.cursor = (p.cursor + 1) % COLS; audio.sfx('click', { vol: 0.5 }); }
      else if (step === 1 || step === 3) {
        const c = p.cur[p.cursor]; p.cur[p.cursor] = step === 1 ? (c < 0 ? 0 : (c + 1) % 6) : (c < 0 ? 5 : (c + 5) % 6);
        audio.tone(420 + p.cur[p.cursor] * 90, 0.07, { type: 'triangle', vol: 0.12 });
      }
      // A = indienen
      if (inp.aP) submit(p);
      // B: tikken = wissen, vasthouden = power
      if (inp.b) {
        if (!p.bDown) { p.bDown = true; p.bHold = 0; p.bUsed = false; }
        p.bHold += dt;
        if (!p.bUsed && p.bHold >= HOLD_POWER) { p.bUsed = true; usePower(p); }
      } else if (p.bDown) {
        p.bDown = false;
        if (!p.bUsed && p.bHold < HOLD_POWER) { p.cur = [-1, -1, -1, -1]; p.cursor = 0; audio.sfx('pop', { rate: 0.8, vol: 0.5 }); }
      }
    }
    function submit(p) {
      if (R.phase !== 'play' || p.status !== 'play') return;
      if (p.sab.sand > 0) { audio.sfx('buzz'); say(p, 'ZANDLOPER!', '#ffd86b'); return; }
      if (p.cur.some((c) => c < 0)) { audio.sfx('miss'); p.wrongT = 0.5; say(p, 'Vul alle 4!', '#ff9a8a'); return; }
      const guess = [...p.cur]; const fb = feedback(R.code, guess);
      const row = { guess, exact: fb.exact, color: fb.color, revT: 0, shown: 0, stale: false };
      p.rows.push(row); p.subs++; p.bestQ = Math.max(p.bestQ, quality(fb));
      V.chars[p.i].swing(); audio.sfx('select');
      if (p.subs % 2 === 0 && p.power < 2) { p.power++; say(p, 'POWER! (houd B)', '#d8b8ff'); audio.sfx('powerup', { vol: 0.5 }); }
      refreshPlates(p); refreshHud();
      if (fb.exact === NP) { p.status = 'cracked'; endRound(p.i, 'crack'); return; }
      if (p.rows.length >= MAX_TRIES) { p.status = 'out'; say(p, 'Alle pogingen op!', '#ff9a8a'); audio.sfx('miss'); V.chars[p.i].pose = 'sad'; refreshPlates(p); }
    }
    const NP = COLS;
    function usePower(p) {
      const o = PS[1 - p.i];
      if (p.power <= 0) { say(p, 'Geen power', '#ff9a8a'); audio.sfx('miss'); return; }
      if (o.status !== 'play') { say(p, 'Die is al klaar', '#ff9a8a'); return; }
      if (o.sab.ghost > 0 || o.sab.sand > 0 || proj.on) { say(p, 'Hij zit al vast!', '#ff9a8a'); return; }
      p.power--; refreshHud();
      proj.on = true; proj.t = 0; proj.from = p.i; proj.to = o.i; proj.type = Math.random() < 0.6 ? 'ghost' : 'sand';
      V.chars[p.i].swing(); audio.sfx('throw'); audio.sfx('whoosh', { vol: 0.5 });
      V.proj.material.color.setHex(proj.type === 'ghost' ? 0xd8b8ff : 0xffd86b);
    }
    function landPower() {
      const o = PS[proj.to]; proj.on = false; V.proj.visible = false;
      if (o.status !== 'play' || R.phase !== 'play') return;
      if (proj.type === 'ghost') { o.sab.ghost = GHOST_T; hud.toast(`👻 ${names[proj.from]} gooit een SPOOK-KRISTAL! ${names[proj.to]} ziet even niks...`, 2000); audio.sfx('static', { vol: 0.35 }); }
      else { o.sab.sand = SAND_T; hud.toast(`⏳ ${names[proj.from]} geeft ${names[proj.to]} een ZANDLOPER-STRAF!`, 2000); audio.sfx('creak', { vol: 0.4 }); }
      ctx.shake(0.35); V.chars[o.i].pose = 'scared'; o.pose = 0.9;
      fx.particles.burst(BOARD_X[o.i], BOARD_Y + 2, 1.5, { count: 40, speed: 6, up: 1, life: 1.0, size: 0.45, colors: proj.type === 'ghost' ? [0xd8b8ff, 0xffffff, 0x9a6aff] : [0xffd86b, 0xffffff], gravity: 3 });
    }

    // ---------------- golem ----------------
    function golemWarn() { R.golemState = 'warn'; R.golemT = 0; V.golemMode = 'warn'; audio.tone(70, WARN_T, { type: 'sawtooth', vol: 0.2, slide: 45, filter: 400 }); audio.sfx('creak', { vol: 0.5 }); hud.toast('🗿 De Slot-Golem wordt boos! Hij verandert zo de code!', 2400); }
    function golemChange() {
      R.golemState = 'done'; R.golemDone = true; V.golemMode = 'smash';
      const taboo = new Set(PS.filter((p) => p.hint).map((p) => p.hint.pos)); const opts = [0, 1, 2, 3].filter((x) => !taboo.has(x)); const pos = pick(opts.length ? opts : [0, 1, 2, 3]);
      let nc; do { nc = Math.floor(Math.random() * 6); } while (nc === R.code[pos]);
      R.code[pos] = nc; R.changedPos = pos;
      for (const p of PS) { for (const r of p.rows) r.stale = true; refreshPlates(p); }
      audio.sfx('slam'); audio.sfx('explode', { vol: 0.5 }); ctx.shake(0.9);
      fx.particles.burst(0, 2, 1, { count: 70, speed: 9, up: 1.2, life: 1.2, size: 0.5, colors: [0x66f0ff, 0xffffff, 0xff6a4a], gravity: 3 });
      hud.showBig('DE CODE IS VERANDERD!', 1600, '#66f0ff'); setTimeout(() => { if (!R.finished && V.golemMode === 'smash') V.golemMode = 'idle'; }, 900);
      for (const p of PS) say(p, 'Oude tips: verouderd!', '#9ab8ff');
    }

    // ---------------- hoofd-update ----------------
    function tick(dt) {
      T += dt; if (R.finished) return;
      if (R.phase === 'wait') startRound();
      R.t += dt;
      const dq = dt * TS;
      if (R.phase === 'announce') { for (const p of PS) { dirEdge(p); } if (R.t > 1.5) beginPlay(); }
      else if (R.phase === 'play') {
        R.elapsed += dt; R.timeLeft -= dq;
        hud.setTimer(R.timeLeft, 8); V.setFuse(R.timeLeft / R.limit);
        if (Math.random() < dt * 30) fx.particles.emit(V.fuseTip, BOARD_Y + 7.4, 0.6, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, 0, { life: 0.5, size: 0.22, color: Math.random() < 0.5 ? 0xffd23f : 0xff7a1a, gravity: 2 });
        const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
        for (const i of order) { handlePlayer(PS[i], dt); if (R.phase !== 'play') break; }
        // golem
        if (R.phase === 'play') {
          if (R.golemState === 'idle' && R.golemAt > 0 && R.limit - R.timeLeft >= R.golemAt && R.timeLeft > 7 && !R.golemDone) golemWarn();
          else if (R.golemState === 'warn') { R.golemT += dt; if (Math.floor(R.golemT * 1.2) !== Math.floor((R.golemT - dt) * 1.2)) audio.sfx('heartbeat', { vol: 0.5 }); if (R.golemT >= WARN_T) golemChange(); }
          // einde: iedereen klaar of tijd op
          const allDone = PS.every((p) => p.status !== 'play');
          if (R.timeLeft <= 0 || allDone) {
            const q = PS.map((p) => p.bestQ);
            if (q[0] === q[1]) endRound(-1, R.timeLeft <= 0 ? 'time' : 'tie'); else endRound(q[0] > q[1] ? 0 : 1, R.timeLeft <= 0 ? 'time' : 'quality');
          }
        }
        if (R.elapsed >= GAME_CAP && R.phase === 'play') { const q = PS.map((p) => p.bestQ); endRound(q[0] === q[1] ? -1 : q[0] > q[1] ? 0 : 1, 'time'); }
      } else if (R.phase === 'end') {
        for (const p of PS) dirEdge(p);
        V.setChest(Math.min(1, V.chestU + dt * 1.6));
        if (R.t > 2.8) { const w = matchWinner(); if (w >= 0) finalize(w); else startRound(); }
      } else if (R.phase === 'final') { for (const p of PS) dirEdge(p); if (R.t > 3.0) finish(); }
      // projectiel
      if (proj.on) {
        proj.t += dt; const u = Math.min(1, proj.t / 0.55); const fx0 = BOARD_X[proj.from], fx1 = BOARD_X[proj.to];
        V.proj.visible = true; V.proj.position.set(fx0 + (fx1 - fx0) * u, BOARD_Y + 2 + Math.sin(u * Math.PI) * 4, 2); V.proj.rotation.y += dt * 12; V.proj.rotation.x += dt * 7;
        if (u >= 1) landPower();
      }
    }

    // ---------------- visuals ----------------
    const tmpCol = new THREE.Color(0x120a30), curCol = new THREE.Color(0x3a2a80);
    function visuals(dt) {
      const t = T + introT;
      V.update(dt);
      V.beginCrystals();
      for (const p of PS) {
        const b = p.i; const fogged = p.sab.ghost > 0; const playing = R.phase === 'play' && p.status === 'play';
        p.rows.forEach((row, r) => {
          for (let c = 0; c < COLS; c++) { const s = slotPos(b, r, c); V.crystal(row.guess[c], s.x, s.y, 0.28, 0.82, t * 0.5 + c + r, row.stale ? 0.55 : 0); }
          row.revT += dt;
          while (row.shown < 4 && row.revT > 0.12 + row.shown * 0.13) { const v = row.shown < row.exact ? 1 : row.shown < row.exact + row.color ? 2 : 0; V.setPeg(b, r, row.shown, v); if (v) audio.tone(v === 1 ? 880 : 620, 0.08, { type: 'square', vol: 0.06 }); row.shown++; }
        });
        const rcur = p.rows.length;
        if (rcur < ROWS && (playing || R.phase === 'announce')) {
          for (let c = 0; c < COLS; c++) {
            const s = slotPos(b, rcur, c); const v = p.cur[c]; const sel = playing && c === p.cursor;
            if (v >= 0) V.crystal(v, s.x, s.y + Math.sin(t * 3 + c) * 0.04, fogged ? 1.3 : 0.4, sel ? 1.0 + Math.sin(t * 8) * 0.05 : 0.84, t * (sel ? 2.2 : 0.8) + c, 0);
          }
          const cs = slotPos(b, rcur, p.cursor); const cu = V.cursor[b]; cu.visible = playing; cu.position.set(cs.x, cs.y, 0.05); cu.scale.setScalar(1 + Math.sin(t * 8) * 0.05 + (p.wrongT > 0 ? 0.15 : 0)); cu.material.color.setHex(p.wrongT > 0 ? 0xff4a4a : p.sab.sand > 0 ? 0xffd86b : [0x4aff9a, 0x4a8cff][b]);
        } else V.cursor[b].visible = false;
        // hint-rij
        if (p.hint) { const hp = hintPos(b, p.hint.pos); V.crystal(p.hint.color, hp.x, hp.y, 0.3, 0.55, t * 0.7, 0); }
        // sabotage-effecten
        const fg = V.fog[b]; if (fogged) { fg.visible = true; fg.material.opacity = Math.min(0.93, p.sab.ghost * 3) * (0.9 + Math.sin(t * 6) * 0.07); } else fg.visible = false;
        const hg = V.hg[b]; hg.visible = p.sab.sand > 0; if (hg.visible) { hg.rotation.y += dt * 2; hg.userData.sand.scale.y = 0.2 + 0.8 * (p.sab.sand / SAND_T); }
        // poppetje-reacties
        const ch = V.chars[b];
        if (p.pose > 0) { p.pose -= dt; if (p.pose <= 0 && R.phase === 'play') ch.pose = 'idle'; }
        if (R.phase === 'play' && p.pose <= 0 && p.status === 'play') ch.pose = 'idle';
      }
      // ghost-kristallen (zweven over het vertroebelde bord)
      const gm = V.ghost.m; let gi = 0; const dm = _dm;
      for (const p of PS) if (p.sab.ghost > 0) for (let k = 0; k < 7; k++) { dm.position.set(BOARD_X[p.i] + Math.sin(t * 1.3 + k * 2.1) * 2.6, BOARD_Y + 1.8 + Math.cos(t * 1.1 + k * 1.7) * 4, 1.0 + (k % 2) * 0.3); dm.rotation.set(t + k, t * 0.8, 0); dm.scale.setScalar(0.9 + Math.sin(t * 3 + k) * 0.2); dm.updateMatrix(); gm.setMatrixAt(gi++, dm.matrix); }
      gm.count = gi; gm.instanceMatrix.needsUpdate = true;
      // code-onthulling
      if (R.reveal) for (let c = 0; c < 4; c++) V.crystal(R.code[c], V.codeX(c), V.codeY, 2.3, 1.0 + Math.sin(t * 5 + c) * 0.06, t * 1.5 + c, 0);
      V.endCrystals();
      // headers + banner
      for (const p of PS) {
        const hintTxt = p.hint ? `HINT: plek ${p.hint.pos + 1} = ${NAMEC[p.hint.color]}` : '';
        V.drawHeader(p.i, { name: names[p.i], wins: R.wins[p.i], line1: p.status === 'cracked' ? 'GEKRAAKT!' : p.status === 'out' ? 'Pogingen op' : `Poging ${Math.min(p.rows.length + 1, MAX_TRIES)} / ${MAX_TRIES}`, line2: p.power > 0 ? `POWER x${p.power}: houd B` : hintTxt, line2Col: p.power > 0 ? '#d8b8ff' : '#ffd23f' });
      }
      let bn;
      if (R.phase === 'final') bn = { title: `${names[R.matchWinner]} WINT!`, sub: `${R.wins[0]} – ${R.wins[1]} in rondes` };
      else if (R.phase === 'end') bn = { title: R.winner >= 0 ? `${names[R.winner]} kraakt de code!` : 'Niemand kraakte hem', sub: R.winner >= 0 ? (R.reason === 'crack' ? 'De kluis springt open!' : 'Beste gok wint de ronde') : 'Gelijkspel in deze ronde' };
      else if (R.golemState === 'warn') bn = { title: 'PAS OP!', sub: `De golem verandert de code over ${Math.max(1, Math.ceil(WARN_T - R.golemT))}...`, warn: true };
      else if (R.phase === 'wait') bn = { title: 'KRISTAL-CODE', sub: 'Kraak de kluis voor je broer!' };
      else if (R.phase === 'announce') bn = { title: `RONDE ${R.n + 1}`, sub: R.n >= 3 ? 'Beslissende ronde!' : 'Kraak de code van 4 kristallen!' };
      else bn = { title: `RONDE ${R.n + 1}`, sub: R.golemDone ? 'Oude tips zijn verouderd (grijs)' : 'Eerst gekraakt wint!' };
      V.drawBanner(bn);
      for (const c of V.chars) { /* update loopt in V.update */ }
    }
    const _dm = new THREE.Object3D();
    refreshHud(); visuals(0.016);

    return {
      update(dt) { tick(dt); visuals(dt); },
      introUpdate(dt) { introT += dt; visuals(dt); },
      resultUpdate(dt) { visuals(dt); },
      onSwap() { for (const p of PS) fx.particles.burst(BOARD_X[p.i], BOARD_Y + 2, 1.5, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = PS[i]; p.sab.sand = Math.max(p.sab.sand, 2.0); say(p, 'BEWOOG! Zandloper!', '#ff6a6a'); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.3); } });
      },
      celebrate(w) { V.chars[w].pose = 'cheer'; V.chars[1 - w].pose = 'sad'; },
      onStart() { hud.setHint('◀ ▶ plek kiezen · ▲ ▼ kristal kiezen · A = gok indienen · B = wissen (vasthouden = POWER)'); },
      onResize() { V.fitCamera(camera); },
      dispose() {},
      dbg: {
        R, PS, V,
        state: () => ({ T, phase: R.phase, n: R.n, wins: [...R.wins], timeLeft: R.timeLeft, elapsed: R.elapsed, finished: R.finished, code: [...R.code], golem: R.golemState, golemDone: R.golemDone, coin: R.coin, matchWinner: R.matchWinner,
          p: PS.map((p) => ({ status: p.status, rows: p.rows.map((r) => ({ g: r.guess, e: r.exact, c: r.color, stale: r.stale })), cur: [...p.cur], cursor: p.cursor, power: p.power, ghost: p.sab.ghost, sand: p.sab.sand, hint: p.hint, bestQ: p.bestQ, subs: p.subs })) }),
        setTime: (s) => { R.timeLeft = s; }, golemNow: () => golemWarn(), usePower: (i) => usePower(PS[i]), giveHint: (i) => { const pos = 1; PS[i].hint = { pos, color: R.code[pos] }; },
      },
    };
  },
};

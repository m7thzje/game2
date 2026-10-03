import * as THREE from 'three';
import { clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';
import { buildStage, DeurmanActor, makeBubbleSprite, makeChicken, FONT } from './deurzegt_world.js';

// Deurman Zegt — duel: "Simon zegt" met de Deurman als quizmaster. Wie wél "Deurman zegt" hoort, doet de beweging;
// zonder die woorden (of bij "NIET", van de kip, of terwijl hij slaapt) moet je STIL blijven staan. 3 hartjes + punten.
//  * A = SPRING, B = DUIK, links = DRAAI, rechts = ZWAAI, omhoog = HOERA, omlaag = ZIT
//  * tempo loopt op; extra gemeen: SPIEGEL (doe het omgekeerde), dubbele combo's, nep-bewegingen van de Deurman, slapende Deurman, kip
//  * comeback: wie achterstaat krijgt meer denktijd (+30%) en eenmalig een medelijden-hartje
//  * einde: hartjes op = af; anders wint wie de meeste punten heeft (gelijk: sudden death, daarna muntje)

const MK = ['A', 'B', 'L', 'R', 'U', 'D'];
const WORD = { A: 'SPRING', B: 'DUIK', L: 'DRAAI', R: 'ZWAAI', U: 'HOERA', D: 'ZIT' };
const MIRROR = { A: 'B', B: 'A', L: 'R', R: 'L', U: 'D', D: 'U' };
const FREQ = { A: 523, B: 330, L: 440, R: 494, U: 659, D: 294 };
const ACT_DUR = { A: 0.62, B: 0.7, L: 0.72, R: 0.9, U: 0.8, D: 0.95 };
const HERO_H = 2.6;
const MATCH_TIME = 90, MAXR = 30, HEARTS = 3;
const HINT = '<b>A</b> SPRING · <b>B</b> DUIK · <b>←</b> DRAAI · <b>→</b> ZWAAI · <b>↑</b> HOERA · <b>↓</b> ZIT';
const TYPE_NOPRESS = { trap: 1, not: 1, chicken: 1, sleep: 1 };

const BANTER = {
  caught: ['Hihihi! Ik zei het NIET!', 'Erin getuind! Geen "Deurman zegt"!', 'Dat zei ik niet eens, hoor!', 'Kijk eens aan, een deurmat!'],
  good: ['Wat zijn jullie goed!', 'Dikke deur-duim omhoog!', 'Klik-klak! Prima gedaan!', 'Zo hoort een deur te draaien!'],
  still: ['Hmpf. Stil als deurposten.', 'Jullie zijn pienter...', 'Geen vuiltje aan de deur.'],
  late: ['Zo traag als een roestig scharnier!', 'Hallo? Deur dicht of zo?', 'Te traag! Schuif eens op!'],
  wrong: ['Ho ho, niet die knop!', 'Verkeerde deur genomen!', 'Dat was de bezemkast!'],
  early: ['Eerst luisteren, dan doen!', 'Rustig, springertje!'],
  chicken: ['Dat was de KIP, hoor!', 'Luister nooit naar kippen!'],
  wake: ['HÈ?! Ik sliep helemaal niet!', 'Zzz... wat? Oh, mooi.'],
  mixed: ['Eén van jullie sliep even...', 'Nou, nou, nou...'],
};

export default {
  id: 'deurzegt',
  name: 'Deurman Zegt',
  giver: 'De Deurman',
  icon: '🚪',
  mode: 'pvp',
  time: 90,
  twists: ['invert', 'swapab', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'game_fast',
  blurb: 'De Deurman is quizmaster! Zegt hij <b>"Deurman zegt: SPRING!"</b>, doe het dan supersnel. Zegt hij het <b>zonder</b> die woorden (of "NIET", of roept de kip, of slaapt hij nep)? Dan <b>STIL STAAN</b>! Fout = hartje kwijt, snel en goed = punten.',
  controls: ['{a} SPRING · {b} DUIK', '← DRAAI · → ZWAAI · ↑ HOERA · ↓ ZIT'],
  tip: 'Let op wat hij ZEGT, niet wat hij DOET! SPIEGEL = doe het omgekeerde.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const tw = ctx.twist.id;
    const GRAV = pv.gravity || 1;
    const SPD = ctx.twist.speed && (tw === 'turbo' || tw === 'slowmo') ? ctx.twist.speed : 1;
    const TEMPO = Math.pow(SPD, 0.7);      // >1 = sneller (kortere vensters en pauzes)

    const L = ctx.lights('indoor', { shadow: 22, center: [0, 0, 0], fogNear: 60, fogFar: 160 });
    L.hemi.intensity = 1.25; L.sun.intensity = 1.5; L.sun.position.set(-6, 24, 16);
    camera.fov = 48; camera.updateProjectionMatrix();
    const S = buildStage(ctx, L);
    const DM = new DeurmanActor(1.9); DM.root.position.set(0, 0, -3.6); DM.baseY = 1.27; scene.add(DM.root);
    const bub = makeBubbleSprite(scene);
    const chick = makeChicken(scene);

    // ------------------------------------------------------------------ poppetjes + plaquettes
    const heroes = players.map((pp, i) => {
      const c = makeBrother(i); const sz = pv.size(i); const bs = HERO_H / c.height * sz;
      const holder = new THREE.Group(); holder.add(c.group); holder.position.set(i ? 6.4 : -6.4, 0.56, 2.2); holder.scale.setScalar(bs); scene.add(holder);
      const face = i ? -0.3 : 0.3; holder.rotation.y = face;
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 200; const g = cv.getContext('2d');
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const plaque = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false })); plaque.scale.set(4.3, 1.68, 1); plaque.renderOrder = 15;
      plaque.position.set(holder.position.x, 0.56 + HERO_H * sz + 1.55, 2.2); scene.add(plaque);
      const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a1030, transparent: true, opacity: 0.8, depthTest: false })); barBg.scale.set(3.3, 0.34, 1); barBg.renderOrder = 15;
      const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6fe87a, transparent: true, depthTest: false })); barFg.scale.set(3.1, 0.2, 1); barFg.renderOrder = 16;
      barBg.position.set(holder.position.x, plaque.position.y - 1.15, 2.2); barFg.position.copy(barBg.position); barBg.visible = barFg.visible = false; scene.add(barBg, barFg);
      return { i, c, bs, sz, holder, face, plaque, g, tx, barBg, barFg, act: null, mood: 'idle', moodT: 0, key: '' };
    });
    function drawPlaque(h) {
      const i = h.i, key = hearts[i] + '|' + pts[i] + '|' + (trailing === i ? 1 : 0); if (h.key === key) return; h.key = key;
      const g = h.g; g.clearRect(0, 0, 512, 200);
      g.fillStyle = 'rgba(14,8,34,.82)'; g.strokeStyle = players[i].css; g.lineWidth = 8; g.beginPath(); g.roundRect(8, 8, 496, 184, 34); g.fill(); g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `bold 56px ${FONT}`; g.fillStyle = players[i].css; g.fillText(names[i], 30, 54, 300);
      g.textAlign = 'right'; g.font = `bold 78px ${FONT}`; g.fillStyle = '#ffe14a'; g.fillText(String(pts[i]), 482, 62); g.font = `bold 28px ${FONT}`; g.fillStyle = '#cfc4ff'; g.fillText('PUNTEN', 482, 118);
      for (let k = 0; k < HEARTS; k++) heart(g, 58 + k * 74, 140, 30, k < hearts[i] ? '#ff4a6a' : '#4a3a64');
      if (trailing === i) { g.textAlign = 'left'; g.font = `bold 24px ${FONT}`; g.fillStyle = '#9fffb0'; g.fillText('+ denktijd', 262, 150); }
      h.tx.needsUpdate = true;
    }
    function heart(g, x, y, s, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x, y + s * 0.8); g.bezierCurveTo(x - s * 1.25, y - s * 0.1, x - s * 0.5, y - s * 0.95, x, y - s * 0.3); g.bezierCurveTo(x + s * 0.5, y - s * 0.95, x + s * 1.25, y - s * 0.1, x, y + s * 0.8); g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.stroke(); }

    // ------------------------------------------------------------------ toestand
    const hearts = [HEARTS, HEARTS], pts = [0, 0], gift = [false, false];
    let trailing = -1;
    let T = 0, introT = 0, started = false, finished = false;
    const G = { state: 'init', t: 0, clock: MATCH_TIME, round: 0, R: null, gapT: 1.2, preT: 1, fbT: 1, sd: false, sdN: 0, last: null, queue: [], noPressRun: 0, sleepCd: 0, winner: -1, why: '', typed: 0, revealed: false, pop: 0 };
    const stats = { perfect: [0, 0], wrong: [0, 0], late: [0, 0], caught: [0, 0], best: [9, 9], rounds: 0 };
    const P = [{}, {}];
    const prevAct = [{}, {}];
    const bubSt = { header: '', word: '', sub: '', style: 'plain', pop: 0 };
    let bubDirty = true;
    const setBub = (o) => { Object.assign(bubSt, o); bubDirty = true; };
    const blip = (f = 240) => audio.tone(f * (0.85 + Math.random() * 0.4), 0.055, { type: 'square', vol: 0.045, filter: 1500 });

    function refreshHud() {
      hud.setScore(G.sd ? 'SUDDEN DEATH' : null);
      for (let i = 0; i < 2; i++) hud.setPlayerInfo(i, `${'♥'.repeat(Math.max(0, hearts[i]))}${'♡'.repeat(Math.max(0, HEARTS - hearts[i]))} · ${pts[i]} pt`);
    }
    function computeTrailing() {
      const a = hearts[0] * 4 + pts[0], b = hearts[1] * 4 + pts[1];
      trailing = Math.abs(a - b) >= 3 ? (a < b ? 0 : 1) : -1;
    }

    // ------------------------------------------------------------------ rondes
    const mv = (not) => { let m; do { m = pick(MK); } while (m === G.lastMove || m === not); G.lastMove = m; return m; };
    function makeRound() {
      const r = G.round, p = clamp((r - 1) / 16, 0, 1);
      let type;
      if (G.queue.length) type = G.queue.shift();
      else if (G.sd) type = pick(['say', 'say', 'mirror', 'combo']);
      else if (r < 3) type = 'say';
      else if (r === 3) type = 'trap';
      else {
        const opts = [['say', 46], ['trap', 20], ['chicken', r >= 4 ? 10 : 0], ['not', r >= 5 ? 12 : 0], ['mirror', r >= 6 ? 22 : 0], ['combo', r >= 8 ? 20 : 0], ['sleep', r >= 7 && G.sleepCd <= 0 ? 12 : 0]];
        const tot = opts.reduce((a, o) => a + o[1], 0); let x = Math.random() * tot; type = 'say';
        for (const [t, w] of opts) { x -= w; if (x <= 0) { type = t; break; } }
        if (TYPE_NOPRESS[type] && G.noPressRun >= 1) type = pick(['say', 'mirror', 'say']);
        if (type === 'mirror' && r < 6) type = 'say';
      }
      G.sleepCd--; if (type === 'sleep') G.sleepCd = 9;
      G.noPressRun = TYPE_NOPRESS[type] ? G.noPressRun + 1 : 0;
      const R = { type, p, shown: [], expect: [], fakeMove: null, sd: G.sd };
      const base = lerp(2.5, 1.1, p) / TEMPO;
      if (type === 'say') { R.shown = [mv()]; R.expect = R.shown.slice(); R.W = base; }
      else if (type === 'mirror') { R.shown = [mv()]; R.expect = [MIRROR[R.shown[0]]]; R.W = base * 1.3; }
      else if (type === 'combo') { const a = mv(); let b2; do { b2 = pick(MK); } while (b2 === a); R.shown = [a, b2]; R.expect = R.shown.slice(); R.W = base * 1.75; G.lastMove = b2; }
      else if (type === 'sleep') { R.W = 2.7 / Math.pow(TEMPO, 0.5); }
      else { R.shown = [mv()]; R.W = lerp(1.9, 1.3, p) / TEMPO; if (type === 'chicken') R.W = 1.7 / TEMPO; }
      const fakeP = r >= 5 ? 0.15 + 0.3 * p : 0;
      if (type !== 'sleep' && type !== 'chicken' && Math.random() < fakeP) {
        if (type === 'trap' || type === 'not') R.fakeMove = R.shown[0];
        else { let f; do { f = pick(MK); } while (f === R.shown[0] || f === R.expect[0]); R.fakeMove = f; }
      }
      R.header = type === 'trap' || type === 'sleep' ? '' : type === 'chicken' ? 'DE KIP ZEGT:' : 'DEURMAN ZEGT:';
      const w = R.shown.map((m) => WORD[m]).join(' + ');
      R.word = type === 'not' ? `NIET ${w}!` : type === 'mirror' ? `SPIEGEL: ${w}!` : type === 'sleep' ? 'Zzzz...' : w + '!';
      R.style = type === 'trap' ? 'plain' : type === 'chicken' ? 'chicken' : type === 'sleep' ? 'sleep' : 'say';
      R.typeDur = type === 'trap' || type === 'sleep' ? 0 : type === 'chicken' ? 0.95 : lerp(0.75, 0.5, p) / Math.pow(TEMPO, 0.5);
      R.hold = type === 'trap' ? rand(0.2, 0.45) : type === 'sleep' ? 0.4 : type === 'chicken' ? 0.45 : rand(0.15, 0.5) / Math.pow(TEMPO, 0.5);
      R.preT = R.typeDur + R.hold;
      return R;
    }

    function startRound() {
      G.round++; stats.rounds++;
      const R = makeRound(); G.R = R; G.state = 'pre'; G.t = 0; G.typed = 0; G.revealed = false;
      for (let i = 0; i < 2; i++) P[i] = { done: false, idx: 0, res: null, dv: 0, W: R.W * (trailing === i && !TYPE_NOPRESS[R.type] ? 1.3 : 1), t0: 0 };
      setBub({ header: '', word: '', sub: '', style: R.style, pop: 0 });
      if (R.type === 'chicken') { chick.mode = 'in'; chick.g.visible = true; chick.x = -24; DM.play('shrug', 0, 'idle'); audio.sfx('pop', { vol: 0.5, rate: 0.8 }); }
      else if (R.type === 'sleep') { DM.play('sleep', 0); audio.tone(120, 0.5, { type: 'sine', vol: 0.12, slide: 80 }); }
      else if (R.type !== 'trap') DM.play('say', 0);
      else DM.play('idle', 0);
      refreshHud();
    }
    function reveal() {
      const R = G.R; G.revealed = true; G.state = 'win'; G.t = 0; G.pop = 1;
      setBub({ header: R.header, word: R.word, style: R.style, pop: 1 });
      if (R.type === 'sleep') { audio.tone(90, 0.6, { type: 'sine', vol: 0.12, slide: 60 }); }
      else {
        R.shown.forEach((m, k) => { audio.tone(FREQ[m], 0.16, { type: 'square', vol: 0.12, delay: k * 0.12, filter: 2400 }); audio.tone(FREQ[m] * 2, 0.1, { type: 'triangle', vol: 0.07, delay: k * 0.12 }); });
        if (R.type === 'chicken') { chick.mode = 'shout'; chick.t = 0; for (let k = 0; k < 3; k++) audio.tone(900 - k * 120, 0.12, { type: 'sawtooth', vol: 0.08, slide: 500, delay: k * 0.13, filter: 2500 }); fx.texts.add('KO-KO-KOOO!', chick.g.position.x, 4.4, 6.2, '#ff9a3a', 1.2); }
        else if (R.fakeMove) DM.move(R.fakeMove, ACT_DUR[R.fakeMove] * 1.05);
        else DM.play('say', 0.5, 'idle');
      }
      for (let i = 0; i < 2; i++) { P[i].t0 = 0; }
      barsOn(!TYPE_NOPRESS[R.type]);
    }

    // ------------------------------------------------------------------ antwoorden verwerken
    function readPress(i) {
      const n = pv.input(i);
      const act = { A: n.a, B: n.b, L: n.left || n.x < -0.6, R: n.right || n.x > 0.6, U: n.up || n.y < -0.6, D: n.down || n.y > 0.6 };
      let pressed = null; for (const k of MK) if (act[k] && !prevAct[i][k] && !pressed) pressed = k;
      prevAct[i] = act; return pressed;
    }
    const SFX_MOVE = { A: 'jump', B: 'thud', L: 'whoosh', R: 'swing', U: 'ding', D: 'land' };
    function heroDo(i, m) {
      const h = heroes[i]; const lg = GRAV < 1;
      h.act = { m, t: 0, dur: ACT_DUR[m] * (m === 'A' && lg ? 1.5 : 1) };
      audio.sfx(SFX_MOVE[m], { vol: 0.45, rate: i ? 1.1 : 0.95 });
    }
    function award(i, res) {
      const R = G.R, P_ = P[i], h = heroes[i], x = h.holder.position.x;
      P_.done = true; P_.res = res;
      const top = 0.56 + HERO_H * h.sz + 0.9;
      const say = (txt, col, sc = 1.2) => fx.texts.add(txt, x, top + 2.2, 2.2, col, sc);
      const gain = (n, label, col) => { pts[i] += n; P_.dv += n; say(`${label} +${n}`, col); };
      if (res === 'perfect' || res === 'good' || res === 'ok') {
        const bonus = R.type === 'combo' || R.type === 'mirror' ? 1 : 0;
        const base = res === 'perfect' ? 3 : res === 'good' ? 2 : 1;
        gain(base + bonus, res === 'perfect' ? 'PERFECT!' : res === 'good' ? 'GOED!' : 'OKÉ', res === 'perfect' ? '#ffe14a' : res === 'good' ? '#8dff9a' : '#cfe0ff');
        h.mood = 'cheer'; h.moodT = 0.8; if (res === 'perfect') { stats.perfect[i]++; fx.particles.burst(x, top, 2.2, { count: 30, speed: 6, up: 1.2, life: 1.0, size: 0.4, colors: [0xffe14a, 0xffffff, 0xff9a3a], gravity: 5 }); audio.sfx('star', { vol: 0.5 }); } else audio.sfx('good', { vol: 0.45 });
        if (P_.rt != null) stats.best[i] = Math.min(stats.best[i], P_.rt);
        S.audCheer(0.9);
      } else if (res === 'survive') {
        const n = R.type === 'sleep' ? 2 : 1; gain(n, R.type === 'sleep' ? 'SSST!' : 'STIL!', '#9fe8ff'); h.mood = 'cheer'; h.moodT = 0.5; audio.sfx('ding', { vol: 0.35, rate: 1.4 });
      } else if (res === 'early') {
        pts[i] = Math.max(0, pts[i] - 1); P_.dv -= 1; say('TE VROEG! -1', '#ffb36a'); h.mood = 'sad'; h.moodT = 0.6; audio.sfx('miss', { vol: 0.5 }); stats.wrong[i]++;
      } else {   // wrong / late / oops: een hartje kwijt
        hearts[i]--; P_.dv -= 10;
        const lab = res === 'late' ? 'TE LAAT!' : res === 'oops' ? (R.type === 'sleep' ? 'WAKKER!' : 'BEWOGEN!') : 'FOUT!';
        say(lab, '#ff6a5a', 1.5); fx.texts.add('-1 HART', x, top + 1.5, 2.2, '#ff4a6a', 1.0);
        fx.particles.burst(x, top, 2.2, { count: 22, speed: 5, up: 1.4, life: 0.9, size: 0.4, colors: [0xff4a6a, 0xff9ab0, 0xffffff], gravity: 6 });
        h.mood = 'sad'; h.moodT = 1.1; audio.sfx('bad', { vol: 0.6 }); audio.sfx('hurt', { vol: 0.3 }); ctx.shake(0.3); S.audGasp(1.1);
        if (res === 'late') stats.late[i]++; else if (res === 'oops') stats.caught[i]++; else stats.wrong[i]++;
      }
      computeTrailing(); refreshHud();
    }
    function onPress(i, m) {
      const R = G.R, P_ = P[i];
      heroDo(i, m);
      if (G.state === 'pre') {
        if (R.type === 'sleep') { award(i, 'oops'); return; }
        award(i, 'early'); return;
      }
      if (!R.expect.length) { award(i, 'oops'); return; }
      if (m !== R.expect[P_.idx]) { award(i, 'wrong'); return; }
      P_.idx++;
      if (P_.idx >= R.expect.length) {
        const t = G.t, Wn = R.W; P_.rt = t;
        const k = R.type === 'combo' ? 0.52 : R.type === 'mirror' ? 0.4 : 0.34;
        award(i, t <= k * Wn ? 'perfect' : t <= 0.64 * Wn ? 'good' : 'ok');
      } else audio.sfx('click', { vol: 0.3, rate: 1.6 });
    }

    function barsOn(on) { heroes.forEach((h) => { h.barBg.visible = h.barFg.visible = on; }); }
    function updateBars() {
      const R = G.R;
      heroes.forEach((h, i) => {
        const on = G.state === 'win' && !TYPE_NOPRESS[R.type] && !P[i].done; h.barBg.visible = h.barFg.visible = on; if (!on) return;
        const f = clamp(1 - G.t / P[i].W, 0, 1);
        h.barFg.scale.x = Math.max(0.001, 3.1 * f); h.barFg.position.x = h.barBg.position.x - (3.1 - 3.1 * f) / 2;
        h.barFg.material.color.setHex(trailing === i ? 0xffe14a : f > 0.5 ? 0x6fe87a : f > 0.25 ? 0xffc23a : 0xff5a4a);
      });
    }

    // ------------------------------------------------------------------ flow
    function endWin() {
      const R = G.R; G.state = 'fb'; G.t = 0; barsOn(false);
      const rs = P.map((p) => p.res); const ok = (r) => r === 'perfect' || r === 'good' || r === 'ok' || r === 'survive';
      const lost = (r) => r === 'wrong' || r === 'late' || r === 'oops';
      let line, mode = 'say', sty = R.style;
      if (rs.some((r) => r === 'oops') && R.type === 'sleep') { line = pick(BANTER.wake); mode = 'shrug'; }
      else if (rs.some((r) => r === 'oops')) { line = pick(BANTER.caught); mode = 'laugh'; }
      else if (rs.every(ok)) { line = TYPE_NOPRESS[R.type] ? (R.type === 'chicken' ? pick(BANTER.chicken) : pick(BANTER.still)) : pick(BANTER.good); mode = TYPE_NOPRESS[R.type] ? 'sulk' : 'cheer'; sty = 'good'; }
      else if (rs.some((r) => r === 'late') && !rs.some((r) => r === 'wrong')) { line = pick(BANTER.late); mode = 'laugh'; sty = 'bad'; }
      else if (rs.some((r) => r === 'wrong')) { line = pick(BANTER.wrong); mode = 'laugh'; sty = 'bad'; }
      else if (rs.some((r) => r === 'early')) { line = pick(BANTER.early); mode = 'shrug'; }
      else line = pick(BANTER.mixed);
      if (R.type === 'sleep') { sty = 'sleep'; if (!rs.some((r) => r === 'oops')) { mode = 'shrug'; line = pick(BANTER.wake); } }
      DM.play(mode, 1.1, 'idle');
      if (mode === 'laugh') for (let k = 0; k < 4; k++) audio.tone(330 + (k % 2) * 90, 0.07, { type: 'square', vol: 0.06, delay: k * 0.09, filter: 1800 });
      setBub({ sub: line, style: sty, word: R.type === 'sleep' ? 'HÈ?!' : bubSt.word });
      G.fbT = lerp(1.05, 0.7, R.p) / Math.pow(TEMPO, 0.6) + (rs.some(lost) ? 0.35 : 0);
      if (chick.mode === 'shout') chick.mode = 'out';
      if (rs.every(ok) && !TYPE_NOPRESS[R.type]) S.audCheer(1.3);
    }
    function afterRound() {
      G.R && (G.roundV = P.map((p) => p.dv));
      const dead = hearts.map((hh) => hh <= 0);
      const coin = () => Math.random() < 0.5 ? 0 : 1;
      // medelijden-hartje
      if (!dead[0] && !dead[1]) for (let i = 0; i < 2; i++) if (!gift[i] && hearts[i] === 1 && hearts[1 - i] - hearts[i] >= 2) { gift[i] = true; hearts[i]++; fx.texts.add('+1 HART!', heroes[i].holder.position.x, 5.6, 2.2, '#9fffb0', 1.5); hud.toast(`🚪 De Deurman heeft medelijden: +1 hartje voor ${names[i]}!`, 2200); audio.sfx('powerup', { vol: 0.6 }); computeTrailing(); refreshHud(); }
      if (dead[0] || dead[1]) {
        if (dead[0] && dead[1]) return endMatch(pts[0] !== pts[1] ? (pts[0] > pts[1] ? 0 : 1) : coin(), pts[0] !== pts[1] ? 'hartjes' : 'muntje');
        return endMatch(dead[0] ? 1 : 0, 'hartjes');
      }
      if (G.sd) {
        const v = G.roundV;
        if (v[0] !== v[1]) return endMatch(v[0] > v[1] ? 0 : 1, 'sd');
        if (P[0].rt != null && P[1].rt != null && Math.abs(P[0].rt - P[1].rt) > 0.01) return endMatch(P[0].rt < P[1].rt ? 0 : 1, 'sd');   // gelijk: snelste reactie wint
        G.sdN++; if (G.sdN >= 6) return endMatch(coin(), 'muntje');
        return toGap();
      }
      if (G.clock <= 0 || G.round >= MAXR) {
        if (pts[0] !== pts[1]) return endMatch(pts[0] > pts[1] ? 0 : 1, 'punten');
        if (hearts[0] !== hearts[1]) return endMatch(hearts[0] > hearts[1] ? 0 : 1, 'hartjes2');
        G.sd = true; G.sdN = 0; hud.showBig('SUDDEN DEATH!', 1500, '#ffd23f'); hud.setTimer(null); refreshHud(); audio.sfx('bell', { vol: 0.8 });
        setBub({ header: '', word: 'GELIJK!', sub: 'Eén ronde beslist!', style: 'say' }); G.gapT = 1.8; G.state = 'gap'; G.t = 0; return;
      }
      toGap();
    }
    function toGap() { G.state = 'gap'; G.t = 0; const p = clamp((G.round - 1) / 16, 0, 1); G.gapT = lerp(1.0, 0.55, p) / Math.pow(TEMPO, 0.6); if (G.round === 0) G.gapT = 1.2; DM.play('idle', 0); if (chick.mode === 'off') chick.g.visible = false; }
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const w = winner, l = 1 - winner;
      const bits = { hartjes: `${names[l]} is door zijn hartjes heen`, hartjes2: 'Gelijk op punten, maar meer hartjes', punten: 'De meeste punten', sd: 'Sudden death besliste het', muntje: 'De Deurman gooide een muntje' };
      const jokes = [`${names[w]} luistert beter dan een deur met oren! ${names[l]} deed vooral wat de kip zei.`, `${names[w]} springt, duikt en zwaait als een echte deurkenner. ${names[l]} liep in de val.`, `De Deurman is dolblij met ${names[w]}. ${names[l]} krijgt een troostdeur.`];
      ctx.finishPvp({ winner, score: [pts[0], pts[1]], delay: 700, summary: `${pick(jokes)} <br><small>${bits[G.why] || ''} · hartjes ${hearts[0]}–${hearts[1]} · perfecte antwoorden ${stats.perfect[0]}–${stats.perfect[1]}${Math.min(...stats.best) < 9 ? ` · snelste reactie ${Math.min(...stats.best).toFixed(2)}s` : ''}</small>` });
    }
    function endMatch(winner, why) {
      G.state = 'end'; G.t = 0; G.winner = winner; G.why = why; barsOn(false); hud.setTimer(null);
      const text = why === 'muntje' ? 'MUNTJE!' : `${names[winner].toUpperCase()} WINT!`;
      setBub({ header: why === 'muntje' ? 'De Deurman gooit een muntje...' : 'EINDE!', word: text, sub: why === 'hartjes' ? 'Geen hartjes meer!' : why === 'sd' ? 'Sudden death!' : '', style: 'good' });
      DM.play('cheer', 0); heroes[winner].mood = 'cheer'; heroes[winner].moodT = 99; heroes[1 - winner].mood = 'sad'; heroes[1 - winner].moodT = 99;
      S.audCheer(5); audio.sfx('win', { vol: 0.7 }); audio.sfx('bell', { vol: 0.6 }); ctx.shake(0.5);
      const x = heroes[winner].holder.position.x;
      for (let k = 0; k < 4; k++) fx.particles.burst(x + rand(-3, 3), 4 + rand(0, 3), 2.2, { count: 30, speed: 7, up: 1.2, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
      refreshHud();
    }

    // ------------------------------------------------------------------ update
    let lastClockSec = -1;
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; toGap(); refreshHud(); hud.setTimer(MATCH_TIME, 10); hud.setHint(HINT); }
      if (T > 260 && !finished && G.state !== 'end') endMatch(pts[0] === pts[1] ? (Math.random() < 0.5 ? 0 : 1) : pts[0] > pts[1] ? 0 : 1, 'punten');
      G.t += dt;
      if (G.state !== 'end' && !G.sd && G.state !== 'init') { G.clock = Math.max(0, G.clock - dt); const s = Math.ceil(G.clock); if (s !== lastClockSec) { lastClockSec = s; hud.setTimer(G.clock, 10); } }
      const pr = [readPress(0), readPress(1)];
      if (G.state === 'gap') { if (G.t >= G.gapT) startRound(); }
      else if (G.state === 'pre') {
        const R = G.R;
        for (let i = 0; i < 2; i++) if (pr[i] && !P[i].done) onPress(i, pr[i]);
        // getypte tekst + stem-blipjes
        if (R.typeDur > 0) {
          const n = Math.min(R.header.length, Math.floor(G.t / R.typeDur * R.header.length));
          if (n !== G.typed) { G.typed = n; setBub({ header: R.header.slice(0, n) }); if (n % 2 === 0) blip(R.type === 'chicken' ? 520 : 230); }
        }
        if (G.t >= R.preT) reveal();
      } else if (G.state === 'win') {
        const R = G.R;
        for (let i = 0; i < 2; i++) if (pr[i] && !P[i].done) onPress(i, pr[i]);
        for (let i = 0; i < 2; i++) {
          if (P[i].done) continue;
          if (TYPE_NOPRESS[R.type]) { if (G.t >= R.W) award(i, 'survive'); }
          else if (G.t >= P[i].W) award(i, 'late');
        }
        if (P[0].done && P[1].done) endWin();
        else if (G.t > 12) { for (let i = 0; i < 2; i++) if (!P[i].done) award(i, 'late'); endWin(); }
      } else if (G.state === 'fb') {
        if (G.t >= G.fbT) afterRound();
      } else if (G.state === 'end') {
        if (G.t > 2.8 && !finished) finishMatch(G.winner);
      }
      visuals(dt);
    }

    // ------------------------------------------------------------------ visuals
    const easeIO = (u) => u * u * (3 - 2 * u);
    function visuals(dt) {
      const tt = T + introT;
      // bubbel
      G.pop = Math.max(0, G.pop - dt * 4); bubSt.pop = G.pop;
      if (bubDirty || G.pop > 0) { bub.draw(bubSt); bubDirty = false; }
      bub.mesh.position.y = 9.5 + Math.sin(tt * 1.6) * 0.1; bub.mesh.scale.setScalar(0.88 * (1 + G.pop * 0.05));
      // slapende Deurman: Zzz
      if (DM.mode === 'sleep' && Math.random() < dt * 1.2) fx.texts.add('Z z z', 1.8, 7.8 + Math.random(), -3.0, '#b8c8ff', 1.0);
      DM.update(dt);
      // de deur achter hem zwaait zacht
      S.leaf.rotation.y = 1.25 + Math.sin(tt * 0.8) * 0.06;
      // kip
      if (chick.mode !== 'off') {
        const a = chick.a, g = chick.g; chick.t += dt;
        if (chick.mode === 'in') { chick.x = Math.min(0, chick.x + dt * 17); a.speed = 1; g.rotation.y = Math.PI / 2; }
        else if (chick.mode === 'shout') { a.speed = 0.2; g.rotation.y = damp(g.rotation.y, 0, 8, dt); g.position.y = Math.abs(Math.sin(chick.t * 14)) * 0.5; }
        else if (chick.mode === 'out') { chick.x += dt * 20; a.speed = 1; g.rotation.y = Math.PI / 2; g.position.y = 0; if (chick.x > 26) { chick.mode = 'off'; g.visible = false; } }
        g.position.x = chick.x; a.update(dt);
      }
      // poppetjes
      const win = G.state === 'win' && G.R && !TYPE_NOPRESS[G.R.type];
      for (const h of heroes) {
        const c = h.c; let pose = win && !P[h.i].done ? 'carry' : 'idle', y = 0, sx = 1, sy = 1, yaw = 0, air = false;
        if (h.moodT > 0) { h.moodT -= dt; pose = h.mood; if (h.mood === 'cheer') y = Math.abs(Math.sin(tt * 9)) * 0.12; }
        if (h.act) {
          h.act.t += dt; const u = h.act.t / h.act.dur;
          if (u >= 1) h.act = null;
          else switch (h.act.m) {
            case 'A': y = (GRAV < 1 ? 3.4 : 1.7) * Math.sin(Math.PI * u); air = true; pose = 'idle'; if (u < 0.12) sy = 0.88; break;
            case 'B': sy = lerp(1, 0.52, Math.sin(Math.PI * clamp(u * 1.15, 0, 1))); sx = 1 + (1 - sy) * 0.4; pose = 'scared'; break;
            case 'L': yaw = TAU * easeIO(u); y = 0.2 * Math.sin(Math.PI * u); pose = 'point'; break;
            case 'R': pose = 'wave'; break;
            case 'U': pose = 'hands_up'; y = 0.3 * Math.abs(Math.sin(u * Math.PI * 2)); break;
            case 'D': pose = 'sit'; break;
          }
        }
        c.pose = pose; c.air = air; c.speed = 0; c.update(dt);
        h.holder.position.y = 0.56 + y; h.holder.scale.set(h.bs * sx, h.bs * sy, h.bs * sx); h.holder.rotation.y = h.face + yaw;
        drawPlaque(h);
        h.plaque.position.y = 0.56 + HERO_H * h.sz + 1.55 + Math.sin(tt * 2 + h.i) * 0.05;
      }
      updateBars();
      S.update(tt, dt);
      updateCamera(dt);
    }
    let camX = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, k = clamp(1.7 / asp, 1, 1.6);
      let cx = 0, dz = 0;
      if (G.state === 'end' && G.winner >= 0) { cx = heroes[G.winner].holder.position.x * 0.25; dz = -2.2; }
      camX = damp(camX, cx, 2, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.6;
      camera.position.set(camX + sway, 7.2 * (0.6 + 0.4 * k), 16.4 * k + dz);
      camera.lookAt(camX * 0.5, 4.5, -3);
    }
    function resultUpdate(dt) { T += dt; DM.update(dt); for (const h of heroes) { h.c.update(dt); } G.pop = 0; S.update(T + introT, dt); updateCamera(dt); chickOff(); }
    function chickOff() { if (chick.mode !== 'off') { chick.mode = 'off'; chick.g.visible = false; } }
    function introUpdate(dt) {
      introT += dt;
      if (!G.introDone) { G.introDone = true; setBub({ header: 'DEURMAN ZEGT:', word: 'DOE MEE!', sub: 'Maak je klaar...', style: 'say' }); DM.play('wave', 0); }
      visuals(dt);
    }
    refreshHud(); hud.setTimer(MATCH_TIME, 10); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onStart() { DM.play('say', 0.8, 'idle'); setBub({ header: 'DEURMAN ZEGT:', word: 'KLAAR?', sub: '', style: 'say', pop: 1 }); G.pop = 1; blip(); },
      onSwap() { for (const h of heroes) fx.particles.burst(h.holder.position.x, 3, 2.2, { count: 22, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m && !finished) { pts[i] = Math.max(0, pts[i] - 1); fx.texts.add('BEWOGEN! -1', heroes[i].holder.position.x, 5.5, 2.2, '#9fe8ff', 1.3); audio.sfx('static', { vol: 0.4 }); refreshHud(); } });
      },
      celebrate(w) { heroes[w].mood = 'cheer'; heroes[w].moodT = 99; heroes[1 - w].mood = 'sad'; heroes[1 - w].moodT = 99; DM.play('cheer', 0); S.audCheer(8); },
      dispose() { hud.setHint(null); },
      dbg: {
        state: () => ({ T, gstate: G.state, t: G.t, round: G.round, sd: G.sd, clock: G.clock, type: G.R && G.R.type, expect: G.R ? G.R.expect.slice() : [], shown: G.R ? G.R.shown.slice() : [], W: P.map((p) => p.W), idx: P.map((p) => p.idx), done: P.map((p) => p.done), res: P.map((p) => p.res), hearts: [...hearts], pts: [...pts], trailing, finished, winner: G.winner, why: G.why, stats }),
        setTime: (t) => { G.clock = t; }, queue: (...t) => { G.queue.push(...t); }, setRound: (n) => { G.round = n; },
        setPts: (a, b) => { pts[0] = a; pts[1] = b; computeTrailing(); refreshHud(); }, setHearts: (a, b) => { hearts[0] = a; hearts[1] = b; computeTrailing(); refreshHud(); },
      },
    };
  },
};

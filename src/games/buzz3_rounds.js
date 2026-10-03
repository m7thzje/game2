import { txt, rr, shape, pad, burst, DIRS, DCOL, SHAPES } from './buzz3_draw.js';

// Drie-Buzzer — de vijf soorten rondes (+ beslissingsronde). Elke ronde is een object:
//   { type, title, rule, finished, update(dt), draw(g,W,H,t), left() }  met G = spel-API uit buzz3.js
// G: n, pl[i] {score,firsts,fouls}, rng(), aEdge(i), dirEdge(i), inp(i), helped(i), gold, spd(i), award(i,pts,label), lec(i,l1,l2,col),
//    lecDraw(i,fn), sfx(naam,opts), press(i), lamp(i,hex,k), host(pose,secs), rot (draairichting voor eerlijke volgorde)
const MEDAL = ['#ffd23f', '#d8e0ea', '#e0a070'];
const shuf = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const order = (G) => { const o = []; for (let k = 0; k < G.n; k++) o.push((k + G.rot) % G.n); return o; };
const bar = (g, x, y, w, h, k, col) => { g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, x, y, w, h, h / 2); g.fill(); g.fillStyle = col; rr(g, x + 2, y + 2, Math.max(h - 4, (w - 4) * Math.max(0, Math.min(1, k))), h - 4, (h - 4) / 2); g.fill(); };
const rankLines = (G, g, W, lines, y0 = 200) => {   // regels rechts: naam + tijd/punten (het midden onderaan wordt door de kandidaten bedekt)
  lines.forEach((l, k) => { txt(g, l.text, W - 40, y0 + k * 50, 28, l.col || G.col(l.i), { align: 'right', max: 280 }); });
};

// ---------------------------------------------------------------- A: GROEN!
export function roundA(G, o = {}) {
  const only = o.only || null;
  const R = { type: 'a', title: o.title || 'GROEN!', rule: o.rule || 'Druk op A als de lamp GROEN wordt. Te vroeg = -1!', finished: false, lines: [] };
  let t = 0, phase = 'wait', fakeNow = null, ended = 0;
  const green = 1.8 + G.rng() * 2.3;
  const FK = [{ n: 'GEEL', c: '#ffd23f' }, { n: 'BLAUW', c: '#4ab4ff' }, { n: 'ROZE', c: '#ff6fb5' }];
  const fakes = [];
  { let at = 0.5 + G.rng() * 0.5; const k = 1 + (G.rng() < 0.7 ? 1 : 0); for (let q = 0; q < k && at < green - 0.9; q++) { fakes.push({ at, k: Math.floor(G.rng() * 3), done: false }); at += 0.9 + G.rng() * 0.6; } }
  const st = G.pl.map((_, i) => ({ out: !!(only && !only.includes(i)), at: null, early: false }));
  const res = [];
  const WIN = 1.9 + (st.some((s, i) => G.helped(i)) ? 0.8 : 0);
  R.left = () => (phase === 'go' ? Math.max(0, WIN - (t - green)) : null);
  R.update = (dt) => {
    if (R.finished) { ended += dt; return; }
    t += dt;
    fakeNow = null;
    for (const f of fakes) if (t >= f.at && t < f.at + 0.45) { fakeNow = FK[f.k]; if (!f.done) { f.done = true; G.sfx('tick', { rate: 0.7 }); G.sfx('click'); } }
    if (phase === 'wait' && t >= green) { phase = 'go'; G.sfx('ding'); G.sfx('go', { vol: 0.5 }); G.flash && G.flash('#35e04a'); }
    for (const i of order(G)) {
      const s = st[i];
      if (G.helped(i) && !s.out && s.at == null && phase === 'wait' && t >= green - 0.22 && !s.early) { s.early = true; G.lec(i, 'NU!!', 'jouw lampje is eerst', '#35e04a'); }
      if (!G.aEdge(i) || s.out || s.at != null) continue;
      G.press(i);
      if (phase === 'go' || s.early) {
        s.at = t; const rt = Math.max(0.06, t - green); res.push({ i, rt }); G.sfx('select'); G.lamp(i, '#ffffff', 0.8);
        G.lec(i, 'GEBUZZERD!', `${rt.toFixed(2)} sec`, '#ffe14a');
      } else { s.out = true; G.pl[i].fouls++; G.award(i, -1, 'TE VROEG!'); G.lec(i, 'TE VROEG!', 'geblokkeerd', '#ff5a5a'); G.sfx('buzz'); G.lamp(i, '#ff3b3b', 1); R.lines.push({ i, text: 'TE VROEG!', col: '#ff5a5a' }); }
    }
    if (st.every((s) => s.out || s.at != null) || (phase === 'go' && t - green > WIN)) {
      R.finished = true; res.sort((a, b) => a.rt - b.rt);
      if (only) { R.winner = res.length ? res[0].i : null; res.forEach((r, k) => R.lines.push({ i: r.i, text: `${G.name(r.i)} ${r.rt.toFixed(2)}s`, col: G.col(r.i) })); return; }
      res.forEach((r, k) => { G.award(r.i, [3, 2, 1][k], `${r.rt.toFixed(2)}s`); if (k === 0) G.pl[r.i].firsts++; R.lines.push({ i: r.i, text: `${G.name(r.i)} ${r.rt.toFixed(2)}s`, col: G.col(r.i) }); });
    }
  };
  R.dbg = () => ({ phase, go: phase === 'go', t, green });
  R.draw = (g, W, H, tm) => {
    const col = phase === 'go' ? '#35e04a' : fakeNow ? fakeNow.c : '#ff3b3b';
    const cx = W / 2, cy = 300;
    if (phase === 'go') burst(g, cx, cy, 460, tm * 3, 'rgba(120,255,120,.35)', 'rgba(255,255,255,.05)', 20);
    const gr = g.createRadialGradient(cx, cy, 20, cx, cy, 230); gr.addColorStop(0, col); gr.addColorStop(0.55, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.5; g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 230, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#1b1030'; g.beginPath(); g.arc(cx, cy, 158, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 140, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(cx - 45, cy - 60, 50, 28, -0.5, 0, 7); g.fill();
    const label = phase === 'go' ? (R.finished ? 'KLAAR' : 'NU!') : fakeNow ? fakeNow.n + '?' : 'WACHT...';
    txt(g, label, cx, cy + 6, phase === 'go' ? 86 : 58, '#fff');
    rankLines(G, g, W, R.lines.slice(0, 3), 190);
    if (phase === 'wait' && !fakeNow) txt(g, 'Alleen GROEN telt!', 30, 84, 28, '#ffe14a', { align: 'left' });
  };
  return R;
}

// ---------------------------------------------------------------- B: WELK IS HET MEEST?
export function roundB(G) {
  const R = { type: 'b', title: 'WELK IS HET MEEST?', rule: 'Tel de vormpjes. Druk de pijl van het vormpje dat het MEEST voorkomt!', finished: false, lines: [] };
  const rng = G.rng;
  const kinds = shuf([0, 1, 2, 3], rng), dirOf = shuf(DIRS.slice(), rng);   // dirOf[kind] = richting
  const win = Math.floor(rng() * 4), m = 8 + Math.floor(rng() * 3);
  const counts = [0, 0, 0, 0]; { const others = [m - 2 - Math.floor(rng() * 2), m - 4 - Math.floor(rng() * 2), m - 5 - Math.floor(rng() * 3)].map((v) => Math.max(2, v)); let q = 0; for (let k = 0; k < 4; k++) counts[k] = k === win ? m : others[q++]; }
  const correct = dirOf[win];
  const cells = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) cells.push([c, r]); shuf(cells, rng);
  const items = []; { let ci = 0; for (let k = 0; k < 4; k++) for (let q = 0; q < counts[k]; q++) { const [c, r] = cells[ci++]; items.push({ k, x: 84 + c * 78 + (rng() - 0.5) * 16, y: 142 + r * 66 + (rng() - 0.5) * 12, ph: rng() * 6 }); } shuf(items, rng); }
  const hint = {}; for (let i = 0; i < G.n; i++) if (G.helped(i)) { const wrong = DIRS.filter((d) => d !== correct); hint[i] = shuf(wrong, rng).slice(0, 2); }
  const lock = G.pl.map(() => null); let t = 0, ended = 0;
  const WIN = 6.5 + (lock.some((_, i) => G.helped(i)) ? 1.5 : 0);
  Object.keys(hint).forEach((i) => G.lecDraw(+i, (g, w, h) => { txt(g, 'HULPJE: dit is fout', w / 2, 20, 19, '#ffe14a'); hint[i].forEach((d, k) => { const x = w / 2 - 36 + k * 72; pad(g, d, x, 62, 46, 0.6); g.strokeStyle = '#ff3b3b'; g.lineWidth = 6; g.beginPath(); g.moveTo(x - 18, 44); g.lineTo(x + 18, 80); g.moveTo(x + 18, 44); g.lineTo(x - 18, 80); g.stroke(); }); }));
  R.left = () => (R.finished ? null : Math.max(0, WIN - t));
  R.update = (dt) => {
    if (R.finished) { ended += dt; return; }
    t += dt;
    for (const i of order(G)) {
      const d = G.dirEdge(i); if (!d || lock[i]) continue;
      lock[i] = { d, at: t }; G.press(i); G.sfx('select', { rate: 1 + i * 0.12 }); G.lamp(i, '#ffffff', 0.7); G.lec(i, 'VERGRENDELD', 'wachten...', '#ffe14a');
    }
    if (lock.every((l) => l) || t > WIN) {
      R.finished = true;
      const good = []; lock.forEach((l, i) => { if (!l) { G.lec(i, 'TE LAAT', '0 punten', '#aaaaaa'); return; } if (l.d === correct) good.push({ i, at: l.at }); else { G.pl[i].fouls++; G.award(i, -1, 'FOUT!'); G.lec(i, 'FOUT!', 'het was ' + SHAPES[win].name, '#ff5a5a'); } });
      good.sort((a, b) => a.at - b.at); good.forEach((e, k) => { G.award(e.i, [3, 2, 1][k], k === 0 ? 'SNEL!' : 'GOED!'); if (k === 0) G.pl[e.i].firsts++; });
    }
  };
  R.dbg = () => ({ correct, counts: counts.slice(), t, locked: lock.map((l) => !!l), phase: R.finished ? 'reveal' : 'ask' });
  const OPT = { up: [840, 190], left: [722, 315], right: [958, 315], down: [840, 440] };
  R.draw = (g, W, H, tm) => {
    // linkerkant: de vormpjes
    g.fillStyle = 'rgba(255,255,255,.07)'; rr(g, 40, 100, 610, 390, 24); g.fill();
    items.forEach((it) => { const s = SHAPES[it.k]; const hl = R.finished && it.k === win; shape(g, s.k, it.x, it.y + Math.sin(tm * 2.2 + it.ph) * 4, hl ? 29 + Math.sin(tm * 8) * 3 : 26, s.col, tm + it.ph); });
    // rechts: de vier keuzes (pijl-tegel + vorm)
    kinds.forEach((_, k) => {
      const d = dirOf[k], [x, y] = OPT[d]; const hl = R.finished ? (k === win ? 1 : 0.25) : 0.75;
      pad(g, d, x, y, 112, hl, null, true);
      g.fillStyle = 'rgba(255,255,255,.92)'; g.globalAlpha = 0.5 + hl * 0.5; g.beginPath(); g.arc(x, y + (d === 'up' ? 8 : d === 'down' ? -8 : 0), 33, 0, 7); g.fill(); g.globalAlpha = 1;
      shape(g, SHAPES[k].k, x, y + (d === 'up' ? 8 : d === 'down' ? -8 : 0), 20, SHAPES[k].col, tm);
      if (R.finished) txt(g, counts[k] + 'x', x, y + 72, 32, k === win ? '#ffe14a' : '#fff');
    });
    // wie koos wat (alleen na afloop), anders alleen sloten
    G.pl.forEach((p, i) => {
      const x = 64 + i * 128, y = 533; g.fillStyle = G.col(i); g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill();
      txt(g, G.name(i), x + 20, y, 24, '#fff', { align: 'left' });
      if (lock[i]) { g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 18, 0, 7); g.stroke(); if (R.finished) { const [ox, oy] = OPT[lock[i].d]; g.fillStyle = G.col(i); g.strokeStyle = '#fff'; g.beginPath(); g.arc(ox - 40 + i * 30, oy + 62, 11, 0, 7); g.fill(); g.stroke(); } }
    });
    if (!R.finished) bar(g, 30, 62, 300, 14, 1 - t / WIN, '#ffe14a');
  };
  return R;
}

// ---------------------------------------------------------------- C: VOLG DE VOLGORDE
export function roundC(G, o = {}) {
  const R = { type: 'c', title: 'ONTHOUD DE VOLGORDE', rule: 'Onthoud de pijlen en druk ze daarna na. Snelste scoort het meest!', finished: false, lines: [] };
  const L = o.len || 4, rng = G.rng, seq = [];
  while (seq.length < L) { const d = DIRS[Math.floor(rng() * 4)]; if (seq.length >= 2 && seq[seq.length - 1] === d && seq[seq.length - 2] === d) continue; seq.push(d); }
  let t = 0, phase = 'show', lit = null, litT = 0, ended = 0;
  const STEP = 0.6, START = 0.7, GO_AT = START + L * STEP + 0.5;
  const prog = G.pl.map(() => 0), out = G.pl.map(() => false), done = G.pl.map(() => null), forgive = G.pl.map((_, i) => G.helped(i)), lastWrong = G.pl.map(() => 0);
  const base = 3.2 + L * 1.0;
  const deadline = (i) => GO_AT + base * (G.helped(i) ? 1.4 : 1);
  const lecProg = (i) => G.lecDraw(i, (g, w, h) => {
    txt(g, out[i] ? 'FOUT!' : done[i] != null ? 'KLAAR!' : phase === 'show' ? 'KIJK...' : 'NU JIJ!', w / 2, 24, 28, out[i] ? '#ff5a5a' : '#ffe14a');
    for (let k = 0; k < L; k++) { g.fillStyle = k < prog[i] ? '#35e04a' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(w / 2 + (k - (L - 1) / 2) * 34, 66, 12, 0, 7); g.fill(); }
    if (forgive[i]) txt(g, '1 foutje mag', w / 2, 96, 16, '#9ad8ff');
  });
  R.left = () => (phase === 'go' && !R.finished ? Math.max(0, Math.max(...G.pl.map((_, i) => (out[i] || done[i] != null ? 0 : deadline(i))), 0) - t) : null);
  for (let i = 0; i < G.n; i++) lecProg(i);
  let stepShown = -1;
  R.update = (dt) => {
    if (R.finished) { ended += dt; return; }
    t += dt;
    if (phase === 'show') {
      const k = Math.floor((t - START) / STEP), within = (t - START) - k * STEP;
      lit = k >= 0 && k < L && within < STEP * 0.78 ? seq[k] : null;
      if (k !== stepShown && k >= 0 && k < L) { stepShown = k; G.sfx('note', { rate: 0.8 + DIRS.indexOf(seq[k]) * 0.22 }); }
      if (t >= GO_AT) { phase = 'go'; G.sfx('ding'); lit = null; for (let i = 0; i < G.n; i++) lecProg(i); }
    } else {
      for (const i of order(G)) {
        const d = G.dirEdge(i); if (!d || out[i] || done[i] != null) continue;
        G.press(i);
        if (d === seq[prog[i]]) { prog[i]++; G.sfx('note', { rate: 0.8 + DIRS.indexOf(d) * 0.22, vol: 0.6 }); lit = d; litT = 0.15;
          if (prog[i] >= L) { done[i] = t; G.sfx('select'); G.lamp(i, '#35e04a', 0.8); }
        } else if (forgive[i]) { forgive[i] = false; G.sfx('miss'); G.floatAt(i, 'OEPS! GENADE', '#9ad8ff'); }
        else { out[i] = true; G.pl[i].fouls++; G.award(i, -1, 'FOUT!'); G.sfx('buzz'); G.lamp(i, '#ff3b3b', 1); }
        lecProg(i);
      }
      if (litT > 0) { litT -= dt; if (litT <= 0) lit = null; }
      const all = G.pl.every((_, i) => out[i] || done[i] != null || t > deadline(i));
      if (all) {
        R.finished = true; const fin = []; G.pl.forEach((_, i) => { if (done[i] != null) fin.push({ i, at: done[i] }); });
        fin.sort((a, b) => a.at - b.at); fin.forEach((e, k) => { G.award(e.i, [3, 2, 1][k], `${(e.at - GO_AT).toFixed(1)}s`); if (k === 0) G.pl[e.i].firsts++; R.lines.push({ i: e.i, text: `${G.name(e.i)} ${(e.at - GO_AT).toFixed(1)}s`, col: G.col(e.i) }); });
        G.pl.forEach((_, i) => { if (done[i] == null && !out[i]) G.lec(i, 'TE LAAT', '0 punten', '#aaaaaa'); lecProg(i); });
      }
    }
  };
  R.dbg = () => ({ seq: seq.slice(), phase, prog: prog.slice(), t, GO_AT });
  const POS = { up: [0, -97], left: [-97, 0], right: [97, 0], down: [0, 97] };
  R.draw = (g, W, H, tm) => {
    const cx = 400, cy = 262;
    DIRS.forEach((d) => pad(g, d, cx + POS[d][0], cy + POS[d][1], 92, lit === d ? 1 : 0.15));
    txt(g, phase === 'show' ? 'KIJK GOED!' : R.finished ? 'KLAAR' : 'NU JIJ!', 800, 150, 52, phase === 'show' ? '#9ad8ff' : '#ffe14a');
    // voortgang van alle drie (rechts)
    G.pl.forEach((_, i) => { const x0 = 640, y0 = 230 + i * 78; txt(g, G.name(i), x0, y0, 28, G.col(i), { align: 'left' }); for (let k = 0; k < L; k++) { g.fillStyle = out[i] ? '#ff5a5a' : k < prog[i] ? G.col(i) : 'rgba(255,255,255,.2)'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x0 + 14 + k * 36, y0 + 36, 13, 0, 7); g.fill(); if (k < prog[i]) g.stroke(); } });
  };
  return R;
}

// ---------------------------------------------------------------- D: DEURMAN ZEGT
export function roundD(G, o = {}) {
  const R = { type: 'd', title: 'DEURMAN ZEGT...', rule: 'Druk ALLEEN als de Deurman het zegt. Anders kost het een punt!', finished: false, lines: [] };
  const rng = G.rng, ord = o.order || (rng() < 0.5 ? [true, false] : [false, true]);
  const VAL = ['Deurman zegt: DRUK NU!', 'Deurman zegt: BUZZ-BUZZ!', 'Deurman zegt: hop, drukken!', 'Deurman zegt: SNEL!'];
  const TRAP = ['DRUK NU!', 'Koning Klopper zegt: DRUK!', 'De pizzabezorger zegt: BUZZ!', 'Hup, BUZZ!', 'Een deurtje zegt: druk!'];
  const cmds = ord.map((v) => ({ valid: v, text: (v ? VAL : TRAP)[Math.floor(rng() * (v ? VAL.length : TRAP.length))] }));
  let ci = 0, phase = 'pre', pt = 0, ended = 0, shown = '';
  const PRE = 0.95, CMD = 1.9, GAP = 1.0;
  let pressed, jam;
  const startCmd = () => { pressed = []; jam = G.pl.map(() => false); pt = 0; phase = 'pre'; shown = ''; for (let i = 0; i < G.n; i++) G.lec(i, 'LET OP...', `opdracht ${ci + 1}/${cmds.length}`, '#9ad8ff'); G.host('point', 1); };
  startCmd();
  R.left = () => (phase === 'cmd' ? Math.max(0, CMD - pt) : null);
  R.update = (dt) => {
    if (R.finished) { ended += dt; return; }
    pt += dt; const c = cmds[ci];
    if (phase === 'pre' && pt >= PRE) {
      phase = 'cmd'; pt = 0; shown = c.text; G.sfx(c.valid ? 'bell' : 'whoosh', { vol: 0.6 }); G.host(c.valid ? 'dj' : 'shy', 2.2);
      for (let i = 0; i < G.n; i++) { if (jam[i]) continue; if (G.helped(i)) G.lec(i, c.valid ? 'JA, DRUK!' : 'NEE, NIET!', 'Deurman fluistert', c.valid ? '#35e04a' : '#ff5a5a'); else G.lec(i, 'BUZZ?', 'luister goed', '#ffe14a'); }
    }
    for (const i of order(G)) {
      if (!G.aEdge(i) || jam[i] || pressed.some((p) => p.i === i)) continue;
      G.press(i);
      if (phase === 'pre') { jam[i] = true; G.pl[i].fouls++; G.award(i, -1, 'TE VROEG!'); G.lec(i, 'TE VROEG!', 'geblokkeerd', '#ff5a5a'); G.sfx('buzz'); G.lamp(i, '#ff3b3b', 1); }
      else if (phase === 'cmd') { pressed.push({ i, at: pt }); G.sfx('select'); G.lamp(i, '#ffffff', 0.7); G.lec(i, 'GEBUZZERD!', '...', '#ffe14a'); }
    }
    if (phase === 'cmd' && (pt >= CMD || G.pl.every((_, i) => jam[i] || pressed.some((p) => p.i === i)))) {
      // afrekenen
      phase = 'gap'; pt = 0;
      if (c.valid) { pressed.sort((a, b) => a.at - b.at); pressed.forEach((p, k) => { G.award(p.i, [2, 1, 1][k], k === 0 ? 'SNEL!' : 'GOED!'); if (k === 0) G.pl[p.i].firsts++; }); G.pl.forEach((_, i) => { if (!jam[i] && !pressed.some((p) => p.i === i)) G.lec(i, 'TE LAAT', 'niet gebuzzerd', '#aaaaaa'); }); G.host('cheer', 1.2); }
      else {
        pressed.forEach((p) => { G.pl[p.i].fouls++; G.award(p.i, -1, 'TRAP!'); G.lec(p.i, 'TRAP!', 'hij zei het niet', '#ff5a5a'); G.sfx('buzz'); G.lamp(p.i, '#ff3b3b', 1); });
        G.pl.forEach((_, i) => { if (!jam[i] && !pressed.some((p) => p.i === i)) { G.lec(i, 'SLIM!', 'niet in getrapt', '#35e04a'); G.floatAt(i, 'SLIM!', '#9ad8ff'); G.sfx('ding', { rate: 1.3, vol: 0.5 }); } });
        G.host('wave', 1.2);
      }
      R.lines = [{ i: 0, text: c.valid ? 'Hij zei het echt!' : 'Hij zei het NIET!', col: c.valid ? '#35e04a' : '#ff9a3c' }];
    } else if (phase === 'gap' && pt >= GAP) {
      ci++; if (ci >= cmds.length) { R.finished = true; return; } startCmd();
    }
  };
  R.dbg = () => ({ phase, valid: cmds[ci] && cmds[ci].valid, cmd: ci, pt });
  R.draw = (g, W, H, tm) => {
    const c = cmds[Math.min(ci, cmds.length - 1)];
    // spreekwolk
    g.save(); g.translate(512, 270);
    g.fillStyle = '#fff'; g.strokeStyle = '#2a0a3a'; g.lineWidth = 8; rr(g, -400, -130, 800, 230, 50); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-250, 90); g.lineTo(-330, 170); g.lineTo(-170, 98); g.closePath(); g.fill(); g.stroke(); g.fillRect(-258, 84, 80, 12);
    g.restore();
    if (phase === 'pre') txt(g, 'Let op...', 512, 270, 76, '#6a3ac0', { stroke: false });
    else txt(g, shown, 512, 270, shown.length > 22 ? 56 : 72, c.valid ? '#c01870' : '#2a6a2a', { stroke: false, max: 740 });
    txt(g, `Opdracht ${Math.min(ci + 1, cmds.length)} van ${cmds.length}`, 512, 142, 28, '#ffe14a');
    if (phase === 'cmd') bar(g, 160, 396, 700, 20, 1 - pt / CMD, c.valid ? '#35e04a' : '#ff9a3c');
    if (phase === 'gap' && R.lines[0]) txt(g, R.lines[0].text, 512, 408, 44, R.lines[0].col);
  };
  return R;
}

// ---------------------------------------------------------------- E: SCHAT HET GETAL
export function roundE(G) {
  const R = { type: 'e', title: 'SCHAT HET GETAL', rule: 'Schat hoeveel vormpjes het waren. Schuif met links/rechts, druk A. Dichtstbij wint!', finished: false, lines: [] };
  const rng = G.rng, N = 24 + Math.floor(rng() * 60);
  const items = []; for (let q = 0; q < N; q++) items.push({ k: Math.floor(rng() * 4), x: 60 + rng() * 620, y: 140 + rng() * 250, ph: rng() * 6, r: 13 + rng() * 5 });
  const SHOW = 2.8, WIN = 6.6;
  const lo = Math.max(0, Math.min(72, N - 6 - Math.floor(rng() * 16))), hi = lo + 28;
  const v = G.pl.map((_, i) => (G.helped(i) ? (lo + hi) / 2 : 50)), vel = v.map(() => 0), hold = v.map(() => 0), lockAt = v.map(() => null), moved = v.map(() => false);
  let t = 0, phase = 'show', ended = 0, truth = false;
  const winOf = (i) => WIN + (G.helped(i) ? 2 : 0);
  const lecNum = (i) => G.lecDraw(i, (g, w, h) => {
    if (phase === 'show') { txt(g, 'KIJK GOED!', w / 2, 40, 32, '#9ad8ff'); return; }
    txt(g, String(Math.round(v[i])), w / 2, 38, 56, lockAt[i] != null ? '#ffe14a' : '#fff');
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(14, 82, w - 28, 6); g.fillStyle = G.col(i); g.fillRect(14 + (w - 28) * v[i] / 100 - 3, 74, 7, 22);
    if (G.helped(i)) { g.fillStyle = 'rgba(255,225,74,.55)'; g.fillRect(14 + (w - 28) * lo / 100, 80, (w - 28) * (hi - lo) / 100, 10); }
    if (lockAt[i] != null) txt(g, 'VAST', w - 36, 20, 16, '#ffe14a');
  });
  for (let i = 0; i < G.n; i++) lecNum(i);
  R.left = () => (phase === 'guess' && !R.finished ? Math.max(0, WIN + (G.pl.some((_, i) => G.helped(i)) ? 2 : 0) - t) : null);
  R.update = (dt) => {
    if (R.finished) { ended += dt; return; }
    t += dt;
    if (phase === 'show') { if (t >= SHOW) { phase = 'guess'; t = 0; G.sfx('ding'); for (let i = 0; i < G.n; i++) lecNum(i); } return; }
    for (const i of order(G)) {
      if (lockAt[i] != null) continue;
      const inp = G.inp(i), x = inp.x;
      if (Math.abs(x) > 0.25) { hold[i] += dt; moved[i] = true; } else hold[i] = 0;
      const sp = (14 + 52 * Math.min(1, hold[i] / 1.3)) * G.spd(i), target = x * sp;
      vel[i] += (target - vel[i]) * Math.min(1, dt * (14 - 11.5 * G.slip));
      v[i] = Math.max(0, Math.min(100, v[i] + vel[i] * dt));
      if (Math.abs(vel[i]) > 4 && Math.floor(t * 18) !== Math.floor((t - dt) * 18)) G.sfx('tick', { vol: 0.4 });
      if (G.aEdge(i)) { lockAt[i] = t; moved[i] = true; G.press(i); G.sfx('select'); G.lamp(i, '#ffffff', 0.7); }
      lecNum(i);
    }
    if (G.pl.every((_, i) => lockAt[i] != null || t > winOf(i))) {
      R.finished = true; truth = true; G.sfx('bell');
      const lst = G.pl.map((_, i) => ({ i, d: Math.abs(v[i] - N), at: lockAt[i] == null ? 99 : lockAt[i], v: Math.round(v[i]) })).filter((e) => { if (!moved[e.i]) G.lec(e.i, 'NIET GESCHAT', '0 punten', '#aaaaaa'); return moved[e.i]; });
      lst.sort((a, b) => a.d - b.d || a.at - b.at);
      lst.forEach((e, k) => {
        const bull = e.d <= 1.2; G.award(e.i, [3, 2, 1][k] + (bull ? 1 : 0), bull ? 'RAAK!' : `${e.v}`); if (k === 0) G.pl[e.i].firsts++;
        R.lines.push({ i: e.i, text: `${G.name(e.i)} ${e.v}`, col: G.col(e.i) }); G.lecDraw(e.i, (g, w) => { txt(g, `${e.v}`, w / 2, 36, 50, '#ffe14a'); txt(g, `${Math.abs(e.v - N)} ernaast`, w / 2, 76, 22, '#fff'); });
      });
    }
  };
  R.dbg = () => ({ N, phase, v: v.slice(), t, lo, hi });
  R.draw = (g, W, H, tm) => {
    if (phase === 'show' || R.finished) {
      g.fillStyle = 'rgba(255,255,255,.07)'; rr(g, 40, 112, 650, 298, 24); g.fill();
      items.forEach((it) => shape(g, SHAPES[it.k].k, it.x, it.y + Math.sin(tm * 2 + it.ph) * 3, it.r, SHAPES[it.k].col, tm));
    } else { txt(g, '?', 360, 270, 200, 'rgba(255,255,255,.3)', { stroke: false }); txt(g, 'Hoeveel waren het er?', 360, 160, 40, '#ffe14a'); }
    // rechts: grote tekst
    if (phase === 'show') { txt(g, 'TEL OF SCHAT!', 860, 220, 40, '#ffe14a'); txt(g, 'Straks: 0 tot 100', 860, 275, 28, '#fff'); bar(g, 760, 330, 200, 16, 1 - t / SHOW, '#9ad8ff'); }
    else if (!R.finished) { txt(g, 'SCHUIF + A', 860, 220, 40, '#ffe14a'); G.pl.forEach((_, i) => { txt(g, G.name(i) + (lockAt[i] != null ? '  VAST' : ''), 760, 290 + i * 44, 28, lockAt[i] != null ? '#ffe14a' : G.col(i), { align: 'left' }); }); bar(g, 760, 400, 200, 16, 1 - t / (WIN + 2), '#ffe14a'); }
    else { txt(g, `Het waren er ${N}!`, 860, 220, 44, '#ffe14a', { max: 300 }); }
    // getallenlijn
    const x0 = 80, x1 = 944, y = 446; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x0, y - 3, x1 - x0, 6);
    for (let k = 0; k <= 10; k++) { g.fillRect(x0 + (x1 - x0) * k / 10 - 1.5, y - 10, 3, 20); if (k % 2 === 0) txt(g, String(k * 10), x0 + (x1 - x0) * k / 10, y + 26, 18, '#fff', { stroke: false }); }
    if (R.finished) {
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(x0 + (x1 - x0) * N / 100, y - 4); g.lineTo(x0 + (x1 - x0) * N / 100 - 16, y - 36); g.lineTo(x0 + (x1 - x0) * N / 100 + 16, y - 36); g.fill();
      G.pl.forEach((_, i) => { const px = x0 + (x1 - x0) * v[i] / 100; g.fillStyle = G.col(i); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(px, y - 16 - i * 4, 11, 0, 7); g.fill(); g.stroke(); });
    }
  };
  return R;
}

export const ROUND_FACTORY = { a: roundA, b: roundB, c: roundC, d: roundD, e: roundE };

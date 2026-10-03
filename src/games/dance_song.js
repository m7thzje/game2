// "Disco-Dino": het eigen deuntje van het Dansduel (arrangement als data) + de pijlen-reeks (voor beide spelers identiek).
// 120 BPM, 40 maten van 2 s = 80 s. Maat 0-1 intro (alleen hi-hat), pijlen vanaf maat 2, uitloop vanaf maat 38.
export const BPM = 120;
export const BEAT = 60 / BPM;      // 0.5 s
export const BAR = BEAT * 4;       // 2 s
export const BARS = 40;
export const SONG_END = BAR * BARS;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Pijlen: 0 = links, 1 = omlaag, 2 = omhoog, 3 = rechts
export const DIR_NAMES = ['links', 'omlaag', 'omhoog', 'rechts'];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76];          // C-majeur pentatoon over twee octaven
// looppatronen voor de pijlen (links, omlaag, omhoog, rechts); per maat een ander patroon, nooit twee dezelfde pijlen achter elkaar
const STEPS = [[0, 3, 1, 2], [2, 1, 3, 0], [0, 1, 2, 3], [3, 2, 1, 0], [1, 0, 2, 3], [0, 2, 3, 1], [2, 3, 0, 1], [3, 1, 0, 2]];

// ritmes per maat (8 achtsten per maat): 1 = pijl
const R = {
  r1: [1, 0, 0, 0, 1, 0, 0, 0],
  r2: [1, 0, 1, 0, 1, 0, 1, 0],
  r3: [1, 0, 1, 0, 1, 1, 1, 0],
  r4: [1, 1, 1, 0, 1, 0, 1, 1],
  r5: [1, 0, 1, 1, 1, 0, 1, 1],
  r6: [1, 1, 1, 1, 1, 0, 1, 0],
  r7: [1, 1, 1, 1, 1, 1, 1, 0],
  r8: [1, 1, 1, 1, 1, 1, 1, 1],
};
// melodie-motieven (toonhoogte-indices), per sectie doorlopend gebruikt
const M = {
  a: [2, 3, 4, 3, 2, 1, 0, 1],
  a2: [4, 5, 4, 3, 2, 3, 4, 2],
  b: [4, 6, 5, 4, 3, 4, 2, 3],
  c: [5, 4, 3, 4, 5, 6, 7, 6],
  d: [3, 2, 1, 2, 3, 4, 5, 4],
};
// secties van 4 maten: [naam, beginmaat, ritmes, motief, transpositie (halve tonen)]
export const SECTIONS = [
  { name: 'intro', bar: 0, len: 2 },
  { name: 'couplet', bar: 2, len: 4, rh: ['r1', 'r1', 'r2', 'r1'], mo: 'a', sh: 0 },
  { name: 'couplet', bar: 6, len: 4, rh: ['r2', 'r2', 'r2', 'r1'], mo: 'a2', sh: 0 },
  { name: 'refrein', bar: 10, len: 4, rh: ['r3', 'r2', 'r3', 'r4'], mo: 'b', sh: 0 },
  { name: 'break', bar: 14, len: 4, rh: ['r2', 'r1', 'r2', 'r1'], mo: 'd', sh: -5 },
  { name: 'brug', bar: 18, len: 4, rh: ['r3', 'r3', 'r4', 'r2'], mo: 'c', sh: 0 },
  { name: 'refrein', bar: 22, len: 4, rh: ['r4', 'r3', 'r4', 'r5'], mo: 'b', sh: 0 },
  { name: 'opbouw', bar: 26, len: 4, rh: ['r5', 'r4', 'r5', 'r6'], mo: 'a2', sh: 2 },
  { name: 'finale', bar: 30, len: 4, rh: ['r6', 'r5', 'r6', 'r7'], mo: 'c', sh: 2 },
  { name: 'finale', bar: 34, len: 4, rh: ['r7', 'r6', 'r7', 'r8'], mo: 'b', sh: 2 },
  { name: 'outro', bar: 38, len: 2 },
];
export function sectionAt(bar) { let s = SECTIONS[0]; for (const x of SECTIONS) if (bar >= x.bar) s = x; return s; }

// ---------- pijlen: [tijd, richting, toonhoogte-midi] ----------
function build() {
  const out = [];
  for (const s of SECTIONS) {
    if (!s.rh) continue;
    const mo = M[s.mo]; let k = 0, last = -1;
    for (let b = 0; b < s.len; b++) {
      const rh = R[s.rh[b]], bar = s.bar + b, pat = STEPS[(bar * 3 + (bar >> 2)) % STEPS.length]; let j = 0;
      for (let e = 0; e < 8; e++) if (rh[e]) {
        const idx = mo[k++ % mo.length];
        let d = pat[(j++ + (bar >> 1)) % 4]; if (d === last) d = pat[(j++ + (bar >> 1)) % 4];
        last = d;
        out.push({ t: bar * BAR + e * BEAT / 2, d, midi: SCALE[idx] + s.sh, idx });
      }
    }
  }
  // slotpijl op het begin van de uitloop (lang aangehouden akkoord)
  out.push({ t: 38 * BAR + 0.0, d: 2, midi: 84, idx: 5, last: true });
  out.sort((a, b) => a.t - b.t);
  return out.map((n, i) => ({ ...n, id: i }));
}
export const NOTES = build();
export const LAST_NOTE_T = NOTES[NOTES.length - 1].t;

// ---------- begeleiding ----------
const CH = { C: { r: 36, tri: [60, 64, 67] }, Am: { r: 33, tri: [57, 60, 64] }, F: { r: 41, tri: [57, 60, 65] }, G: { r: 43, tri: [59, 62, 67] } };
const PROG = ['C', 'Am', 'F', 'G'];
function chordAt(bar) {
  const s = sectionAt(bar); const sh = s.sh || 0;
  const c = CH[PROG[bar % 4]];
  return { r: c.r + sh, tri: c.tri.map((x) => x + sh), name: PROG[bar % 4] };
}
// events: [tijd, soort, a, b]  (soorten: kick hat ohat clap bass stab pad arp lead crash riser)
export const EVENTS = (() => {
  const ev = [];
  for (let bar = 0; bar < BARS; bar++) {
    const T = bar * BAR, s = sectionAt(bar), c = chordAt(bar);
    const drums = bar >= 1 && s.name !== 'break' && s.name !== 'outro';
    const full = ['refrein', 'finale', 'opbouw'].includes(s.name);
    for (let e = 0; e < 8; e++) ev.push([T + e * BEAT / 2, e % 2 ? 'ohat' : 'hat', e % 2 ? 0.8 : 0.5]);
    if (bar === 0) ev.push([T, 'riser', 4]);
    if (drums || (s.name === 'break' && bar % 2 === 0)) for (let b = 0; b < 4; b++) ev.push([T + b * BEAT, 'kick', 1]);
    if (drums) { ev.push([T + BEAT, 'clap', 1], [T + 3 * BEAT, 'clap', 1]); if (full && bar % 4 === 3) ev.push([T + 3.5 * BEAT, 'clap', 0.7], [T + 3.75 * BEAT, 'clap', 0.8]); }
    if (bar % 4 === 0 && bar >= 2 && bar < 38) ev.push([T, 'crash', 0.6]);
    // disco-bas: grondtoon en octaaf
    if (bar >= 1 && s.name !== 'outro' && s.name !== 'break') for (let e = 0; e < 8; e++) ev.push([T + e * BEAT / 2, 'bass', c.r + (e % 2 ? 12 : 0) + (e === 6 ? 7 : 0), BEAT * 0.45]);
    else if (s.name === 'break') ev.push([T, 'bass', c.r, BAR * 0.9]);
    // akkoord: kort op de offbeats; pad lang
    if (bar >= 2 && s.name !== 'outro') for (const b of [0.5, 1.5, 2.5, 3.5]) if (full || b === 1.5 || b === 3.5) for (const x of c.tri) ev.push([T + b * BEAT, 'stab', x + 12, BEAT * 0.3]);
    ev.push([T, 'pad', c.tri[0], BAR], [T, 'pad', c.tri[1], BAR], [T, 'pad', c.tri[2], BAR]);
    // arpeggio in refreinen en finale
    if (full) for (let e = 0; e < 8; e++) ev.push([T + e * BEAT / 2, 'arp', c.tri[e % 3] + 24, 0]);
    if (s.name === 'outro') ev.push([T, 'crash', 1], [T, 'kick', 1], [T, 'stab', 72, BAR * 1.5], [T, 'stab', 76, BAR * 1.5], [T, 'stab', 79, BAR * 1.5]);
  }
  // zachte melodie-dubbeling zodat het deuntje ook klinkt als een speler mist
  for (const n of NOTES) ev.push([n.t, 'lead', n.midi, BEAT * 0.45]);
  ev.sort((a, b) => a[0] - b[0]);
  return ev;
})();

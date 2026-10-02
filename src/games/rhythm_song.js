// "Straatmuzikant": het originele deuntje (arrangement als data) + begeleiding.
// 120 BPM, 32 maten van 2 s = 64 s. Melodie in C-groot (laatste refrein een toon hoger, D-groot).
export const BPM = 120;
export const BEAT = 60 / BPM;      // 0.5 s
export const BAR = BEAT * 4;       // 2 s
export const BARS = 32;
export const SONG_END = BAR * BARS;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// [beat, midi, duur(beats), vlaggen]   vlaggen: 'D' duet (beide spelers), 'L' lange noot (A vasthouden), '0'/'1' vaste speler
const P1 = [[0, 76, 1], [1, 76, .5], [1.5, 79, .5], [2, 76, 1], [3, 74, 1],
  [4, 74, 1], [5, 74, .5], [5.5, 76, .5], [6, 74, 1], [7, 71, 1],
  [8, 72, 1], [9, 72, .5], [9.5, 76, .5], [10, 81, 1], [11, 79, 1],
  [12, 77, 1.5], [13.5, 76, .5], [14, 74, 1], [15, 72, 1]];
const P2 = [[0, 79, 1], [1, 79, .5], [1.5, 81, .5], [2, 79, 1], [3, 76, 1],
  [4, 74, 1], [5, 76, .5], [5.5, 74, .5], [6, 71, 2, 'L'],
  [8, 72, .5], [8.5, 74, .5], [9, 76, 1], [10, 72, 1], [11, 69, 1],
  [12, 69, 1], [13, 72, 1], [14, 77, 2, 'D']];
const H1 = [[0, 76, .5], [.5, 79, .5], [1, 84, 1.5, 'D'], [2.5, 79, .5], [3, 76, 1],
  [4, 74, .5], [4.5, 79, .5], [5, 83, 1.5, 'D'], [6.5, 79, .5], [7, 74, 1],
  [8, 72, .5], [8.5, 76, .5], [9, 81, 1.5, 'D'], [10.5, 76, .5], [11, 72, 1],
  [12, 81, .5], [12.5, 79, .5], [13, 77, 1], [14, 76, 1], [15, 74, 1]];
const H2 = [[0, 76, .5], [.5, 79, .5], [1, 84, 1.5, 'D'], [2.5, 79, .5], [3, 76, 1],
  [4, 74, .5], [4.5, 79, .5], [5, 83, 1.5, 'D'], [6.5, 79, .5], [7, 74, 1],
  [8, 72, .5], [8.5, 76, .5], [9, 81, 1], [10, 84, 1], [11, 81, 1],
  [12, 77, 1], [13, 79, 1], [14, 84, 2, 'DL']];
const BR = [[0, 76, 3, 'L0'], [4, 77, 3, 'L1'], [8, 79, 3, 'DL'],
  [12, 81, .5, '0'], [12.5, 79, .5, '1'], [13, 77, .5, '0'], [13.5, 76, .5, '1'], [14, 74, 1, '0'], [15, 72, 1, '1']];
const F1 = H1.map((n) => (n[0] === 7 || n[0] === 3 ? [n[0], n[1], n[2], 'D'] : n));
const F2 = H2.map((n) => (n[0] === 7 || n[0] === 3 ? [n[0], n[1], n[2], 'D'] : n));
const OUT = [[0, 84, 4, 'DL']];

// secties: bar, noten, transpositie, wie speelt ('seq' = eerste helft Wes, tweede helft Jor; 'alt' = om de beurt)
export const SECTIONS = [
  { name: 'intro', bar: 0, len: 2 },
  { name: 'couplet', bar: 2, len: 4, notes: P1, shift: 0, who: 'seq' },
  { name: 'couplet2', bar: 6, len: 4, notes: P2, shift: 0, who: 'alt' },
  { name: 'refrein', bar: 10, len: 4, notes: H1, shift: 0, who: 'alt' },
  { name: 'refrein', bar: 14, len: 4, notes: H2, shift: 0, who: 'alt' },
  { name: 'brug', bar: 18, len: 4, notes: BR, shift: 0, who: 'alt' },
  { name: 'finale', bar: 22, len: 4, notes: F1, shift: 2, who: 'alt' },
  { name: 'finale', bar: 26, len: 4, notes: F2, shift: 2, who: 'alt' },
  { name: 'outro', bar: 30, len: 2, notes: OUT, shift: 2, who: 'alt' },
];
export function sectionAt(bar) { let s = SECTIONS[0]; for (const x of SECTIONS) if (bar >= x.bar) s = x; return s; }

// ---------- noten-lijst: [tijd, baan(0 links,1 omhoog,2 rechts,3 A-lang), speler, duur, midi, duetId] ----------
function laneOf(m, shift) { return Math.max(0, Math.min(2, Math.floor((m - shift - 71.5) / 4))); }
function build() {
  const out = []; let duetId = 0;
  for (const s of SECTIONS) {
    if (!s.notes) continue;
    let alt = 0;
    for (const n of s.notes) {
      const beat = n[0], midi = n[1] + s.shift, dur = n[2] * BEAT, f = n[3] || '';
      const t = s.bar * BAR + beat * BEAT;
      const isD = f.includes('D'), isL = f.includes('L');
      const lane = isL ? 3 : laneOf(n[1], 0);
      if (isD) { duetId++; for (const pl of [0, 1]) out.push({ t, lane, pl, dur: isL ? dur : 0, midi, duet: duetId, long: isL }); continue; }
      let pl;
      if (f.includes('0')) pl = 0; else if (f.includes('1')) pl = 1;
      else if (s.who === 'seq') pl = beat < 8 ? 0 : 1; else pl = (alt++) % 2;
      out.push({ t, lane, pl, dur: isL ? dur : 0, midi, duet: 0, long: isL });
    }
  }
  out.sort((a, b) => a.t - b.t || a.pl - b.pl);
  // een speler die een lange noot vasthoudt of te snel achter elkaar moet spelen: geef de noot aan de ander (of laat weg)
  const busy = (pl, t, ignore) => out.some((n) => n !== ignore && !n.drop && n.pl === pl && ((Math.abs(n.t - t) < 0.3) || (n.long && t > n.t - 0.1 && t < n.t + n.dur + 0.15)));
  for (const h of out) {
    if (!h.long || h.drop) continue;
    for (const n of out) {
      if (n === h || n.drop || n.duet || n.pl !== h.pl) continue;
      if (n.t > h.t - 0.1 && n.t < h.t + h.dur + 0.2) { n.pl = 1 - n.pl; if (busy(n.pl, n.t, n)) n.drop = true; }
    }
  }
  for (const pl of [0, 1]) {
    const arr = out.filter((n) => n.pl === pl && !n.drop).sort((a, b) => a.t - b.t);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].t - arr[i - 1].t < 0.2 && !arr[i].duet) { arr[i].pl = 1 - pl; if (busy(arr[i].pl, arr[i].t, arr[i])) arr[i].drop = true; }
    }
  }
  const notes = out.filter((n) => !n.drop).sort((a, b) => a.t - b.t || a.pl - b.pl).map((n, i) => ({ id: i, t: n.t, lane: n.lane, pl: n.pl, dur: n.dur, midi: n.midi, duet: n.duet, long: n.long }));
  return notes;
}
export const NOTES = build();
export const CHART = NOTES.map((n) => [n.t, n.lane, n.pl, n.dur]);   // het arrangement als platte data: [tijd, baan, speler, duur]
export const DUETS = new Set(NOTES.filter((n) => n.duet).map((n) => n.duet)).size;
export const LAST_NOTE_T = Math.max(...NOTES.map((n) => n.t + n.dur));

// ---------- begeleiding ----------
const CH = { C: { r: 36, tri: [60, 64, 67] }, G: { r: 43, tri: [59, 62, 67] }, Am: { r: 45, tri: [57, 60, 64] }, F: { r: 41, tri: [57, 60, 65] } };
const PROG = ['C', 'G', 'Am', 'F'];
function chordAt(bar) {
  const s = sectionAt(bar);
  let name;
  if (s.name === 'brug') name = ['Am', 'F', 'C', 'G'][(bar - s.bar) % 4];
  else if (s.name === 'outro') name = 'C';
  else if (s.name === 'intro') name = PROG[bar % 4];
  else name = PROG[(bar - s.bar) % 4];
  const sh = s.shift || 0; const c = CH[name];
  return { name, r: c.r + sh, tri: c.tri.map((x) => x + sh) };
}
// events: [tijd, soort, a, b]
export const EVENTS = (() => {
  const ev = [];
  for (let bar = 0; bar < BARS; bar++) {
    const T = bar * BAR, s = sectionAt(bar), c = chordAt(bar);
    const main = s.name === 'refrein' || s.name === 'finale';
    const drums = s.name !== 'brug' && s.name !== 'outro';
    // drums
    for (let e = 0; e < 8; e++) { const v = e % 2 ? 0.7 : 1; if (s.name !== 'outro') ev.push([T + e * BEAT / 2, 'hat', v, 0]); }
    if (bar === 0) { /* alleen hi-hat */ }
    else if (drums || bar === 1) {
      ev.push([T, 'kick', 1], [T + 2 * BEAT, 'kick', 1]); if (main) ev.push([T + 2.5 * BEAT, 'kick', 0.8]);
      ev.push([T + BEAT, 'snare', 1], [T + 3 * BEAT, 'snare', 1]);
      if (main && bar % 4 === 3) ev.push([T + 3.5 * BEAT, 'snare', 0.7], [T + 3.75 * BEAT, 'snare', 0.8]);
    }
    if (s.name === 'outro' && bar === 30) ev.push([T, 'crash', 1], [T, 'kick', 1]);
    // bas
    if (s.name === 'brug') ev.push([T, 'bass', c.r, 1.9]);
    else if (s.name === 'outro') ev.push([T, 'bass', c.r, 3.5]);
    else if (bar > 0) ev.push([T, 'bass', c.r, 0.9 * BEAT], [T + 1.5 * BEAT, 'bass', c.r, 0.4 * BEAT], [T + 2 * BEAT, 'bass', c.r + 7, 0.9 * BEAT], [T + 3.5 * BEAT, 'bass', c.r + 12, 0.4 * BEAT]);
    else ev.push([T, 'bass', c.r, 1.9], [T + 2 * BEAT, 'bass', c.r, 1.9]);
    // akkoord
    ev.push([T, 'pad', c.tri[0] - 12, 2], [T, 'pad', c.tri[1] - 12, 2], [T, 'pad', c.tri[2] - 12, 2]);
    // arpeggio of strum
    if (s.name === 'couplet' || s.name === 'couplet2' || (bar === 1)) {
      const a = [0, 1, 2, 1, 0, 1, 2, 1];
      for (let e = 0; e < 8; e++) ev.push([T + e * BEAT / 2, 'arp', c.tri[a[e]] + 12, 0]);
    } else if (main) {
      for (const b of [0.5, 1.5, 2.5, 3.5]) for (const x of c.tri) ev.push([T + b * BEAT, 'strum', x, 0]);
    } else if (s.name === 'brug') {
      for (let e = 0; e < 4; e++) ev.push([T + e * BEAT, 'arp', c.tri[e % 3] + 24, 0]);
    }
  }
  ev.sort((a, b) => a[0] - b[0]);
  return ev;
})();

// "Deurknop-Disco": het eigen meezingnummertje van de Deurman-Disco, als data (zelf gecomponeerd).
// 120 BPM, a-klein funk (Am - F - C - G). Gezongen regels van 8 achtsten; de rondes (poses) lopen op de maat mee en worden steeds sneller.
export const BPM = 120;
export const BEAT = 60 / BPM;           // 0.5 s
export const BAR = BEAT * 4;            // 2 s
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- tekst + melodie (midi) ----------
export const LINES = {
  a: { syl: ['Klop', 'klop', 'klop,', 'wie', 'staat', 'er', 'daar?'], notes: [64, 64, 64, 67, 69, 67, 64] },
  b: { syl: ['De', 'Deur', 'man', 'met', 'zijn', 'gri', 'me', 'lach!'], notes: [62, 64, 67, 69, 67, 64, 62, 64] },
  c: { syl: ['Deur', 'man,', 'Deur', 'man,', 'dans', 'met', 'mij!'], notes: [69, 67, 69, 67, 64, 67, 69] },
  d: { syl: ['Draai', 'de', 'knop', 'en', 'kom', 'er', 'bij!'], notes: [71, 69, 67, 64, 67, 69, 72] },
  e: { syl: ['Links', 'en', 'rechts', 'en', 'A', 'en', 'B!'], notes: [64, 67, 64, 69, 67, 64, 62] },
  f: { syl: ['Ho', 'ge', 'vijf,', 'de', 'deur', 'gaat', 'o', 'pen!'], notes: [64, 64, 67, 69, 72, 71, 69, 67] },
  g: { syl: ['Deur', 'man', 'dis', 'co,', 'dans', 'dans', 'dans!'], notes: [72, 71, 69, 67, 69, 69, 72] },
};
// welke regel in welke maat (zingen = hele maat, de volgende maat vult het instrumentaal aan)
const SING = { 2: 'a', 3: 'b', 4: 'c', 5: 'd', 6: 'e', 7: 'f', 8: 'c', 9: 'd', 10: 'g', 11: 'a', 12: 'b', 13: 'c', 14: 'd', 15: 'e', 16: 'f', 17: 'g', 18: 'c', 19: 'd', 20: 'c', 21: 'd', 22: 'g', 23: 'g', 24: 'e', 25: 'f', 26: 'g', 27: 'c', 28: 'd', 29: 'g', 30: 'g', 31: 'f', 32: 'g' };

// ---------- rondes: [aantal, stappen, venster (s), periode (tellen)] ----------
const SEGS = [[4, 2, 3.2, 8], [6, 3, 2.5, 6], [8, 3, 1.75, 4], [4, 4, 2.7, 6]];
export const ROUND_START = 8 * BEAT;        // na 2 maten intro
export const ROUNDS = (() => {
  const out = []; let t = ROUND_START;
  SEGS.forEach(([n, len, W, P], si) => { for (let k = 0; k < n; k++) { out.push({ t0: t, len: si === 0 ? (k < 2 ? 2 : 3) : len, W, P: P * BEAT, seg: si, last: si === 3, idx: out.length }); t += P * BEAT; } });
  return out;
})();
export const ROUNDS_END = ROUNDS[ROUNDS.length - 1].t0 + ROUNDS[ROUNDS.length - 1].P;     // ± 66 s
export const SONG_END = ROUNDS_END + 2.6;

// ---------- noten-events: [tijd, soort, a, b] ----------
const ROOT = [45, 41, 48, 43];                          // Am F C G (bas)
const CH = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
const BASS_A = [0, -1, -1, -1, 0, -1, -1, -1], BASS_B = [0, -1, 0, 12, -1, 0, 7, -1], BASS_C = [0, 0, 12, -1, 0, 7, 0, 12];
export const EVENTS = [];
export const SYLS = [];          // [{t, line, i, text}]: voor de meezing-tekst
(function build() {
  const E = EVENTS, nBars = Math.ceil(SONG_END / BAR) + 1;
  const secOf = (t) => { if (t < ROUND_START) return -1; for (let i = ROUNDS.length - 1; i >= 0; i--) if (t >= ROUNDS[i].t0) return ROUNDS[i].seg; return 0; };
  for (let bar = 0; bar < nBars; bar++) {
    const t0 = bar * BAR, sec = secOf(t0), ch = bar % 4;
    const inten = sec < 0 ? 0 : sec;
    // drums
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BEAT;
      if (bar > 0 || b > 0) E.push([t, 'kick']);
      if (inten >= 1 && (b === 1 || b === 3)) E.push([t, 'clap']);
      E.push([t + BEAT / 2, 'ohat']);
      if (inten >= 2) { E.push([t, 'hat']); E.push([t + BEAT * 0.75, 'hat']); }
    }
    if (bar < 2) for (const b of [0, 1, 2]) E.push([t0 + b * BEAT + (bar === 0 ? 0 : BEAT / 2), 'knock']);
    // bas
    const pat = inten <= 0 ? BASS_A : inten === 1 ? BASS_B : BASS_C;
    pat.forEach((s, i) => { if (s >= 0) E.push([t0 + i * BEAT / 2, 'bass', ROOT[ch] + s, BEAT * 0.45]); });
    // akkoord-stabs op de off-beats
    if (inten >= 1) for (const e of [1, 3, 6]) CH[ch].forEach((n) => E.push([t0 + e * BEAT / 2 + (e === 3 ? BEAT * 0.25 : 0), 'stab', n + 12, BEAT * 0.3]));
    // pad onder de zang
    CH[ch].forEach((n) => E.push([t0, 'pad', n, BAR * 0.95]));
    // arpeggio in de snelle delen
    if (inten >= 2) for (let i = 0; i < 8; i++) E.push([t0 + i * BEAT / 2, 'arp', CH[ch][i % 3] + 24, BEAT * 0.3]);
    if (inten >= 3 && bar % 2 === 0) E.push([t0, 'crash']);
    // zang
    const ln = SING[bar];
    if (ln) { const L = LINES[ln]; L.syl.forEach((tx, i) => { const t = t0 + i * BEAT / 2; E.push([t, 'sing', L.notes[i], BEAT * 0.42]); SYLS.push({ t, line: ln, i, text: tx }); }); }
    // knock-fill aan het eind van elke 4e maat
    if (bar % 4 === 3 && bar > 2) { E.push([t0 + BAR - BEAT * 0.5, 'knock']); E.push([t0 + BAR - BEAT * 0.25, 'knock']); }
  }
  // slotakkoord
  const te = ROUNDS_END; E.push([te, 'crash']); [57, 60, 64, 69].forEach((n) => E.push([te, 'stab', n, 1.6])); E.push([te, 'bass', 45, 1.6]);
  E.sort((a, b) => a[0] - b[0]);
})();

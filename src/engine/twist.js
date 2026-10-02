// Grappige "twists" voor duels (Mario Party-stijl). De harness kiest er per potje één en past de invoer aan.
export const TWISTS = [
  { id: 'none', name: 'Geen twist', icon: '🎯', desc: 'Gewoon een eerlijk potje. Of toch...?', weight: 2 },
  { id: 'invert', name: 'Omgekeerde besturing', icon: '🙃', desc: 'Links is rechts en omhoog is omlaag!', weight: 3 },
  { id: 'swapab', name: 'Knoppen verwisseld', icon: '🔀', desc: 'Je A-knop is B en je B-knop is A. Succes!', weight: 2 },
  { id: 'drunk', name: 'Dronken kikker', icon: '🐸', desc: 'Je besturing wiebelt alsof je net uit de draaimolen komt.', weight: 3 },
  { id: 'turbo', name: 'Turbo-tijd', icon: '⚡', desc: 'Iedereen is 60% sneller. Chaos gegarandeerd!', speed: 1.6, weight: 2 },
  { id: 'slowmo', name: 'Slakkentempo', icon: '🐌', desc: 'Iedereen sloft. Dus kies je momenten goed.', speed: 0.65, weight: 1 },
  { id: 'giant', name: 'Reus tegen dwerg', icon: '🦒', desc: 'Eén broer wordt reusachtig en traag, de ander piepklein en rap.', weight: 3 },
  { id: 'slippery', name: 'Zeepvloer', icon: '🧼', desc: 'Alles is spekglad. Remmen? Bestaat niet.', slip: 0.85, weight: 2 },
  { id: 'lowgrav', name: 'Maanzwaartekracht', icon: '🌙', desc: 'Alles zweeft en springt extra hoog.', gravity: 0.4, weight: 2 },
  { id: 'bodyswap', name: 'Lichaamswissel!', icon: '🔄', desc: 'Halverwege ruil je van broer: jij bestuurt ineens het poppetje van de ander!', weight: 3 },
  { id: 'deurman', name: 'De Deurman kijkt mee', icon: '👁️', desc: 'De Deurman komt kijken. Wie dan beweegt, verliest een punt.', weight: 2 },
];
export const TWIST_BY_ID = Object.fromEntries(TWISTS.map((t) => [t.id, t]));

export function pickTwist(allowed, rng = Math.random, force = null) {
  if (force && TWIST_BY_ID[force]) return TWIST_BY_ID[force];
  const pool = TWISTS.filter((t) => !allowed || allowed.includes(t.id) || t.id === 'none');
  const total = pool.reduce((a, t) => a + (t.weight || 1), 0);
  let r = rng() * total;
  for (const t of pool) { r -= t.weight || 1; if (r <= 0) return t; }
  return pool[0];
}

const BTN = ['up', 'down', 'left', 'right', 'a', 'b'];
export function blankIn() {
  const o = { x: 0, y: 0, mag: 0, any: false, anyP: false };
  for (const b of BTN) { o[b] = false; o[b + 'P'] = false; o[b + 'R'] = false; }
  return o;
}
// Zet de ruwe invoer van speler `src` om naar de uiteindelijke invoer, volgens de twist
export function applyTwist(out, src, twist, t, i, swapped) {
  for (const k in src) out[k] = src[k];
  const id = twist.id;
  const flip = (a, b) => { const tmp = out[a]; out[a] = out[b]; out[b] = tmp; const tp = out[a + 'P']; out[a + 'P'] = out[b + 'P']; out[b + 'P'] = tp; const tr = out[a + 'R']; out[a + 'R'] = out[b + 'R']; out[b + 'R'] = tr; };
  if (id === 'invert') { out.x = -src.x; out.y = -src.y; flip('left', 'right'); flip('up', 'down'); }
  else if (id === 'swapab') { flip('a', 'b'); }
  else if (id === 'drunk') {
    const ang = Math.sin(t * 1.9 + i * 2) * 0.95 + Math.sin(t * 5.3) * 0.25;
    const c = Math.cos(ang), s = Math.sin(ang);
    out.x = src.x * c - src.y * s; out.y = src.x * s + src.y * c;
  }
  out.mag = Math.min(1, Math.hypot(out.x, out.y));
  return out;
}

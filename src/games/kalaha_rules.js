// Kalaha-regels (puur, zonder three.js) — wordt ook door tools/test_kalaha.mjs in node getest.
// Bord: kuiltjes 0..5 = Wes (rechts -> links, near-rij), 6 = schatkamer Wes (links),
//       7..12 = Jor (links -> rechts, far-rij), 13 = schatkamer Jor (rechts). Zaaien gaat met de klok mee (index +1).
export const STORE = [6, 13];
export const NP = 6;
export const opposite = (i) => 12 - i;
export const ownPits = (p) => (p ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5]);
export const isOwnPit = (p, i) => (p ? i >= 7 && i <= 12 : i >= 0 && i <= 5);

export function newPits(stones = 4) { const a = Array(14).fill(stones); a[6] = 0; a[13] = 0; return a; }

// de rij kuiltjes waar de laatste... n stenen van `from` terechtkomen (de tegenstanders schatkamer wordt overgeslagen)
export function sowPath(pits, p, from) {
  const n = pits[from], skip = STORE[1 - p], out = []; let i = from;
  for (let k = 0; k < n; k++) { i = (i + 1) % 14; if (i === skip) i = (i + 1) % 14; out.push(i); }
  return out;
}

// Voert een zet uit op (een kopie van) pits. Retourneert { pits, path, last, extra, capture:{pit,opp,n}|null, ended }
export function applyMove(pitsIn, p, from) {
  const pits = pitsIn.slice();
  const path = sowPath(pits, p, from);
  pits[from] = 0;
  for (const i of path) pits[i]++;
  const last = path[path.length - 1];
  let extra = false, capture = null;
  if (last === STORE[p]) extra = true;
  else if (isOwnPit(p, last) && pits[last] === 1 && pits[opposite(last)] > 0) {
    const n = pits[opposite(last)] + 1;
    capture = { pit: last, opp: opposite(last), n };
    pits[STORE[p]] += n; pits[last] = 0; pits[opposite(last)] = 0;
  }
  return { pits, path, last, extra, capture, ended: sideEmpty(pits, 0) || sideEmpty(pits, 1) };
}
export function sideEmpty(pits, p) { for (const i of ownPits(p)) if (pits[i] > 0) return false; return true; }
export function sideSum(pits, p) { let s = 0; for (const i of ownPits(p)) s += pits[i]; return s; }
// einde: de rest gaat naar de eigenaar van die kant
export function finalTotals(pits) { return [pits[6] + sideSum(pits, 0), pits[13] + sideSum(pits, 1)]; }
export function legalMoves(pits, p) { return ownPits(p).filter((i) => pits[i] > 0); }

// simpele bot (voor tests en voor de beurttimer-keuze): extra beurt > vangst > meeste winst, met ruis
export function botMove(pits, p, rnd = Math.random, skill = 1) {
  const mv = legalMoves(pits, p); if (!mv.length) return -1;
  let best = mv[0], bs = -1e9;
  for (const m of mv) {
    const r = applyMove(pits, p, m);
    let s = (r.pits[STORE[p]] - pits[STORE[p]]) * 2 + (r.extra ? 6 : 0) + (r.capture ? 3 : 0) - (r.pits[STORE[1 - p]] - pits[STORE[1 - p]]) * 2;
    s += rnd() * (6 - 5.5 * skill);
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

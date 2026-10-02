// BFS-solver voor Drakengrot (twee spelers, gezamenlijke toestand) met exact dezelfde regels als src/games/plates_levels.js
import { initState, packState, unpackState, act, isWin } from '../src/games/plates_levels.js';

// mode 'win': beide spelers op de uitgang.  mode 'reach': speler `who` (de enige die beweegt) bereikt een uitgangsvakje
export function solve(L, { movers = [0, 1], mode = 'win', reachWho = 0, maxStates = 4e6, noDeath = false } = {}) {
  const s0 = initState(L); const k0 = packState(L, s0);
  const keys = [k0], parent = [-1], mv = [-1]; const seen = new Map([[k0, 0]]);
  const goal = (s) => (mode === 'win' ? isWin(L, s) : L.exits.includes(s.p[reachWho]));
  if (goal(s0)) return { solved: true, steps: 0, path: [], states: 1 };
  let head = 0, found = -1;
  while (head < keys.length && found < 0) {
    const s = unpackState(L, keys[head]);
    for (const who of movers) {
      for (let a = 0; a < 5; a++) {
        const r = act(L, s, who, a); if (!r) continue;
        if (noDeath && r.events.some((e) => e.t === 'die')) continue;
        const k = packState(L, r.s); if (seen.has(k)) continue;
        seen.set(k, keys.length); keys.push(k); parent.push(head); mv.push(who * 8 + a);
        if (goal(r.s)) { found = keys.length - 1; break; }
        if (keys.length > maxStates) return { solved: false, capped: true, states: keys.length };
      }
      if (found >= 0) break;
    }
    head++;
  }
  if (found < 0) return { solved: false, states: keys.length };
  const path = []; for (let i = found; parent[i] >= 0; i = parent[i]) path.push({ who: mv[i] >> 3, a: mv[i] & 7 });
  path.reverse();
  return { solved: true, steps: path.length, path, states: keys.length };
}

// speelt een pad af en geeft statistieken
export function replay(L, path) {
  let s = initState(L); const st = { moves: [0, 0], presses: [0, 0], deaths: 0, events: [] };
  for (const { who, a } of path) {
    const r = act(L, s, who, a); if (!r) throw new Error('ongeldige actie in pad');
    s = r.s; if (a < 4) st.moves[who]++; else st.presses[who]++;
    for (const e of r.events) { st.events.push(e); if (e.t === 'die') st.deaths++; }
  }
  st.win = isWin(L, s); return st;
}

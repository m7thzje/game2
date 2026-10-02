// BFS-solver voor co-op Sokoban (twee spelers + kratten), gebruikt exact de regels uit src/games/sokoban_levels.js
import { DIRS } from '../src/games/sokoban_levels.js';

export function solve(L, { movers = [0, 1], maxStates = 6e6 } = {}) {
  const fl = L.floors, N = fl.length;
  const fi = new Int16Array(L.w * L.h).fill(-1);
  fl.forEach((c, i) => { fi[c] = i; });
  const nb = new Int16Array(N * 4).fill(-1);
  for (let i = 0; i < N; i++) {
    const c = fl[i], x = c % L.w, y = (c / L.w) | 0;
    DIRS.forEach(([dx, dy], d) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) return;
      nb[i * 4 + d] = fi[ny * L.w + nx];
    });
  }
  const goalF = new Uint8Array(N); L.goal.forEach((g, c) => { if (g && fi[c] >= 0) goalF[fi[c]] = 1; });
  const K = L.crates.length;
  if (Math.pow(N, K + 2) > 9e15) throw new Error('te groot voor numerieke sleutel');
  const enc = (a, b, cs) => { let k = a * N + b; for (let i = 0; i < K; i++) k = k * N + cs[i]; return k; };
  const startCs = L.crates.map((c) => fi[c]).sort((a, b) => a - b);
  const startKey = enc(fi[L.players[0]], fi[L.players[1]], startCs);

  const keys = [startKey], parent = [-1], mv = [-1];
  const seen = new Map([[startKey, 0]]);
  const cs = new Array(K), ncs = new Array(K);
  const won = (arr) => { for (let i = 0; i < K; i++) if (!goalF[arr[i]]) return false; return true; };
  if (won(startCs)) return { solved: true, steps: 0, path: [], states: 1, pushes: 0 };

  let head = 0, found = -1;
  while (head < keys.length && found < 0) {
    let k = keys[head];
    for (let i = K - 1; i >= 0; i--) { cs[i] = k % N; k = (k - cs[i]) / N; }
    const p = [0, 0]; p[1] = k % N; k = (k - p[1]) / N; p[0] = k;
    for (const who of movers) {
      for (let d = 0; d < 4; d++) {
        const n = nb[p[who] * 4 + d];
        if (n < 0 || n === p[1 - who]) continue;
        let ci = -1; for (let i = 0; i < K; i++) if (cs[i] === n) { ci = i; break; }
        let np0 = p[0], np1 = p[1], key;
        if (ci >= 0) {
          const m = nb[n * 4 + d];
          if (m < 0 || m === p[1 - who]) continue;
          let blocked = false; for (let i = 0; i < K; i++) if (cs[i] === m) { blocked = true; break; }
          if (blocked) continue;
          for (let i = 0; i < K; i++) ncs[i] = cs[i];
          ncs[ci] = m; ncs.sort((a, b) => a - b);
          if (who === 0) np0 = n; else np1 = n;
          key = enc(np0, np1, ncs);
        } else {
          if (who === 0) np0 = n; else np1 = n;
          key = enc(np0, np1, cs);
        }
        if (seen.has(key)) continue;
        seen.set(key, keys.length); keys.push(key); parent.push(head); mv.push(who * 4 + d);
        if (ci >= 0 && won(ncs)) { found = keys.length - 1; break; }
        if (keys.length > maxStates) return { solved: false, capped: true, states: keys.length };
      }
      if (found >= 0) break;
    }
    head++;
  }
  if (found < 0) return { solved: false, states: keys.length };
  const path = []; for (let i = found; parent[i] >= 0; i = parent[i]) path.push({ who: mv[i] >> 2, d: mv[i] & 3 });
  path.reverse();
  return { solved: true, steps: path.length, path, states: keys.length };
}

// Speelt een pad af met de spelregels en geeft statistieken (pushes per speler, stappen per speler)
export function replayStats(L, path, tryMove, isSolved) {
  const p = [...L.players], c = [...L.crates]; const st = { steps: [0, 0], pushes: [0, 0] };
  for (const { who, d } of path) {
    const [dx, dy] = DIRS[d]; const r = tryMove(L, p, c, who, dx, dy);
    if (!r) throw new Error('ongeldige zet in pad');
    p[who] = r.to; st.steps[who]++;
    if (r.crate >= 0) { c[r.crate] = r.crateTo; st.pushes[who]++; }
  }
  st.solved = isSolved(L, c);
  return st;
}

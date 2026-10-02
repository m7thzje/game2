// Hulpmiddel om kandidaat-levels te vinden: node tools/gen_sokoban.mjs <breedte> <hoogte> <kratten> <minStappen> <maxStappen> <seconden> [seed]
import { parseLevel, DIRS } from '../src/games/sokoban_levels.js';
import { solve } from './solve_sokoban_lib.mjs';

const [W, H, K, MINS, MAXS, SECS, SEED] = [+process.argv[2] || 8, +process.argv[3] || 7, +process.argv[4] || 3, +process.argv[5] || 30, +process.argv[6] || 80, +process.argv[7] || 60, +process.argv[8] || 1];
let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function genRoom() {
  const g = []; for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.'); }
  // interne muurstukken
  const segs = ri(1, 3);
  for (let i = 0; i < segs; i++) {
    const horiz = rnd() < 0.5; const len = ri(2, Math.max(2, (horiz ? W : H) - 4));
    let x = ri(1, W - 2), y = ri(1, H - 2);
    for (let k = 0; k < len; k++) { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y][x] = '#'; if (horiz) x++; else y++; }
  }
  const pil = ri(0, 4); for (let i = 0; i < pil; i++) g[ri(1, H - 2)][ri(1, W - 2)] = '#';
  return g;
}
function connected(g) {
  const cells = []; g.forEach((r, y) => r.forEach((c, x) => { if (c !== '#') cells.push([x, y]); }));
  if (cells.length < 14) return null;
  const seen = new Set([cells[0].join()]); const q = [cells[0]];
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (g[ny]?.[nx] && g[ny][nx] !== '#' && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } } }
  return seen.size === cells.length ? cells : null;
}

const MODE = process.argv[9] || '';
function region(map, ch) {
  const g = map.map((r) => r.split('')); let st = null;
  g.forEach((r, y) => r.forEach((c, x) => { if (c === ch) st = [x, y]; }));
  const seen = new Set([st.join()]); const q = [st];
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; const c = g[ny]?.[nx]; if (c && c !== '#' && c !== '$' && c !== 'D' && c !== 'S' && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } } }
  return seen.size;
}
const t0 = Date.now(); let tried = 0, found = 0;
while ((Date.now() - t0) / 1000 < SECS) {
  const g = genRoom(); const cells = connected(g); if (!cells) continue;
  const pick = [...cells].sort(() => rnd() - 0.5);
  if (pick.length < K * 2 + 2 + 3) continue;
  const [dp, sp] = [pick.pop(), pick.pop()];
  const crates = [], goals = [];
  for (let i = 0; i < K; i++) crates.push(pick.pop());
  for (let i = 0; i < K; i++) goals.push(pick.pop());
  // niet in een hoek beginnen (dode kratten) - alleen eisen dat de BFS het oplost
  const rows = g.map((r) => r.slice());
  const put = (c, ch) => { rows[c[1]][c[0]] = ch; };
  goals.forEach((c) => put(c, 'G')); crates.forEach((c) => put(c, '$')); put(dp, 'D'); put(sp, 'S');
  const map = rows.map((r) => r.join(''));
  if (MODE === 'trap2' && (region(map, 'S') > 4 || region(map, 'D') > 4)) continue;
  if (MODE === 'trap' && (region(map, 'S') > 3 || region(map, 'D') < 7)) continue;
  tried++;
  const L = parseLevel({ map });
  const both = solve(L, { maxStates: +process.env.CAP || 1.2e6 });
  if (!both.solved || both.steps < MINS || both.steps > MAXS) continue;
  const a = solve(L, { movers: [0], maxStates: +process.env.CAP || 1.2e6 }); if (a.solved || a.capped) continue;
  const b = solve(L, { movers: [1], maxStates: +process.env.CAP || 1.2e6 }); if (b.solved || b.capped) continue;
  found++;
  console.log(`--- kandidaat: ${both.steps} stappen, ${both.states} toestanden`);
  console.log(map.join('\n'));
}
console.log(`geprobeerd ${tried}, gevonden ${found}`);

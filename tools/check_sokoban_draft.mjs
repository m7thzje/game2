// node tools/check_sokoban_draft.mjs drafts.txt  (kaarten gescheiden door lege regels) -> statistieken per kaart
import fs from 'node:fs';
import { parseLevel, validateLevel, tryMove, isSolved } from '../src/games/sokoban_levels.js';
import { solve, replayStats } from './solve_sokoban_lib.mjs';
const txt = fs.readFileSync(process.argv[2], 'utf8').replace(/\r/g, '');
const maps = txt.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.length && !l.startsWith('//')));
maps.filter((m) => m.length).forEach((map, n) => {
  const L = parseLevel({ map }); const errs = validateLevel(L);
  if (errs.length) { console.log(`#${n + 1}: ${errs.join(', ')}`); return; }
  const both = solve(L, { maxStates: 8e6 });
  if (!both.solved) { console.log(`#${n + 1}: ONOPLOSBAAR${both.capped ? ' (cap)' : ''} (${both.states})`); return; }
  const a = solve(L, { movers: [0], maxStates: 8e6 }), b = solve(L, { movers: [1], maxStates: 8e6 });
  const st = replayStats(L, both.path, tryMove, isSolved);
  console.log(`#${n + 1}: ${both.steps} stappen (D${st.steps[0]}/S${st.steps[1]}, duw ${st.pushes[0]}+${st.pushes[1]}), ${both.states} toest. | Daan-alleen:${a.solved ? 'KAN' : 'nee'} Sem-alleen:${b.solved ? 'KAN' : 'nee'}`);
  if (process.argv.includes('--path')) console.log('   ' + both.path.map((m) => 'DS'[m.who] + '^v<>'[m.d]).join(' '));
});

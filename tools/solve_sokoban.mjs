// Gebruik: node tools/solve_sokoban.mjs
// Bewijst per level: oplosbaar met beide spelers (BFS over de gezamenlijke toestand), en of één speler alleen
// (de ander blijft als obstakel staan) het level óók kan oplossen. Vanaf level 3 moet dat NIET kunnen.
import { LEVELS, parseLevel, validateLevel, tryMove, isSolved } from '../src/games/sokoban_levels.js';
import { solve, replayStats } from './solve_sokoban_lib.mjs';

let allOk = true; let totalSteps = 0;
LEVELS.forEach((def, i) => {
  const L = parseLevel(def);
  const errs = validateLevel(L);
  const t0 = Date.now();
  const both = solve(L);
  const onlyD = solve(L, { movers: [0] });
  const onlyS = solve(L, { movers: [1] });
  let line = `Level ${i + 1} "${def.name}" ${L.w}x${L.h}, ${L.crates.length} kratten, ${L.floors.length} vloervakken: `;
  if (errs.length) { line += 'FOUT ' + errs.join(', '); allOk = false; console.log(line); return; }
  if (!both.solved) { line += `ONOPLOSBAAR${both.capped ? ' (cap)' : ''}`; allOk = false; console.log(line); return; }
  const st = replayStats(L, both.path, tryMove, isSolved);
  totalSteps += both.steps;
  const need = i >= 2; // vanaf level 3 beide spelers nodig
  const alone = (onlyD.solved ? 'Daan-alleen kan' : 'Daan-alleen kan NIET') + ' / ' + (onlyS.solved ? 'Sem-alleen kan' : 'Sem-alleen kan NIET');
  const coopOk = !(onlyD.solved || onlyS.solved);
  if (need && !coopOk) allOk = false;
  line += `opgelost in ${both.steps} stappen (Daan ${st.steps[0]}, Sem ${st.steps[1]}; duwen ${st.pushes[0]}+${st.pushes[1]}), ${both.states} toestanden, ${Date.now() - t0}ms | ${alone}${need ? (coopOk ? '  => beide nodig OK' : '  => FOUT: één speler volstaat!') : ''}`;
  console.log(line);
  if (process.argv.includes('--path')) console.log('   ' + both.path.map((m) => 'DS'[m.who] + '^v<>'[m.d]).join(' '));
});
console.log(allOk ? `ALLE LEVELS OK (som van kortste oplossingen: ${totalSteps} stappen)` : 'ER ZIJN PROBLEMEN');
process.exit(allOk ? 0 : 1);

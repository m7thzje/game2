// Gebruik: node tools/solve_plates.mjs [--path] [--draft bestand]
// Bewijst per level: oplosbaar (BFS over gezamenlijke toestand), en dat samenwerking nodig is:
//  - 'solo': kan Daan (terwijl Sem stil blijft staan) een uitgangsvakje bereiken? en Sem (terwijl Daan stil blijft staan)?
//  - zijn beide solo-bereikbaar op twee verschillende uitgangsvakjes -> level zou zonder samenwerking kunnen => FOUT
import fs from 'node:fs';
import { LEVELS, parseLevel, validateLevel, renderAscii, initState } from '../src/games/plates_levels.js';
import { solve, replay } from './solve_plates_lib.mjs';

const args = process.argv.slice(2);
let defs = LEVELS;
const di = args.indexOf('--draft');
if (di >= 0) {
  const blocks = fs.readFileSync(args[di + 1], 'utf8').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim() && !l.startsWith('//')));
  defs = blocks.filter((b) => b.length).map((map, i) => ({ name: 'draft ' + (i + 1), map }));
}
let ok = true, totalSteps = 0;
defs.forEach((def, i) => {
  const t0 = Date.now();
  const L = parseLevel(def); const errs = validateLevel(L);
  console.log(`\nLevel ${i + 1} "${def.name}" ${L.w}x${L.h}`);
  console.log(renderAscii(L, initState(L)).split('\n').map((r) => '   ' + r).join('\n'));
  if (errs.length) { console.log('  FOUT: ' + errs.join('; ')); ok = false; return; }
  const both = solve(L, {});
  if (!both.solved) { console.log(`  ONOPLOSBAAR${both.capped ? ' (cap)' : ''} (${both.states} toestanden)`); ok = false; return; }
  const rp = replay(L, both.path);
  totalSteps += both.steps;
  const reach = [0, 1].map((w) => solve(L, { movers: [w], mode: 'reach', reachWho: w }));
  const exits = L.exits;
  // welke uitgangsvakjes zijn solo bereikbaar?
  // eenvoudige variant: reach-modus test 'een van de twee'; voor onderscheid per vakje gebruiken we dezelfde functie met aangepaste exits
  const independent = indep(L);
  const nd = solve(L, { noDeath: true });
  console.log(`  opgelost in ${both.steps} acties (Daan ${rp.moves[0]} stappen + ${rp.presses[0]}xA, Sem ${rp.moves[1]} stappen + ${rp.presses[1]}xA, ${rp.deaths} keer dood), ${both.states} toestanden, ${Date.now() - t0}ms`);
  console.log(`  solo: Daan-alleen bereikt een uitgang: ${reach[0].solved ? 'JA' : 'nee'} | Sem-alleen: ${reach[1].solved ? 'JA' : 'nee'} | onafhankelijk op 2 vakjes: ${independent ? 'JA => FOUT (geen samenwerking nodig)' : 'nee => samenwerking vereist'}`);
  console.log(`  zonder ooit dood te gaan: ${nd.solved ? nd.steps + ' acties' : 'ONOPLOSBAAR'}`);
  if (!nd.solved) ok = false;
  if (independent) ok = false;
  if (args.includes('--path')) console.log('  ' + both.path.map((m) => 'DS'[m.who] + (m.a < 4 ? '^v<>'[m.a] : 'A')).join(' '));
});
console.log(ok ? `\nALLE LEVELS OK (som van kortste oplossingen: ${totalSteps} acties)` : '\nER ZIJN PROBLEMEN');
process.exit(ok ? 0 : 1);

function indep(L) {
  // bereikt Daan-alleen vakje a en Sem-alleen vakje b met a != b ?
  const can = (who, cell) => {
    const L2 = Object.assign({}, L, { exits: [cell, -1] });
    return solve(L2, { movers: [who], mode: 'reach', reachWho: who }).solved;
  };
  const d = L.exits.map((e) => can(0, e)), s = L.exits.map((e) => can(1, e));
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (a !== b && d[a] && s[b]) return true;
  return false;
}

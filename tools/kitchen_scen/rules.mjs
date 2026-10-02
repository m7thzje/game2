import { helpers } from './lib.mjs';
const ok = (c, m) => console.log((c ? 'OK   ' : 'FAIL ') + m);
export default async function (S) {
  const { ev, step, shot, start } = S; const H = helpers(S);
  await start(); await step(60);
  const give = (i, it) => ev(([i, it]) => K().setHold(K().pl[i], it), [i, it]);
  const cookers = () => ev(() => K().cookers.map((c) => ({ s: c.state, it: c.items.map((x) => x.k) })));
  // 1. rauw in pot
  await give(1, { k: 'ui', chopped: false }); await H.stand(1, 'cooker:0'); await H.press(1);
  let c = await cookers(); ok(c[0].s === 'empty' && (await H.holding(1)).includes('"ui"'), 'rauw ingredient wordt geweigerd');
  // 2. combinatie
  await give(1, { k: 'ui', chopped: true }); await H.press(1); await give(1, { k: 'vlees', chopped: true }); await H.press(1);
  c = await cookers(); ok(c[0].s === 'loading' && c[0].it.join() === 'ui' && (await H.holding(1)).includes('vlees'), 'ui+vlees mag niet samen in de pot');
  // 2b. terugnemen
  await give(1, null); await H.press(1); ok((await H.holding(1)) && (await H.holding(1)).includes('"ui"'), 'ingrediënt terugpakken uit pot');
  await H.press(1); // weer in pot
  // brood in de pot?
  await give(1, { k: 'brood', chopped: true }); await H.press(1); c = await cookers(); ok(c[0].it.join() === 'ui', 'brood past niet in de pot');
  await give(1, null);
  // 3. soep koken, aanbranden
  await give(1, { k: 'wortel', chopped: true }); await H.press(1); c = await cookers(); ok(c[0].s === 'cooking', 'ui+wortel start koken');
  await step(Math.round(7.9 / 0.05)); c = await cookers(); ok(c[0].s === 'cooking', 'nog bezig na 7.9s');
  await step(5); c = await cookers(); ok(c[0].s === 'done', 'klaar na ~8s');
  await step(Math.round(5.7 / 0.05)); c = await cookers(); ok(c[0].s === 'done', 'nog niet aangebrand na 5.7s extra');
  await step(8); c = await cookers(); ok(c[0].s === 'burning', 'aangebrand na 6s');
  const burned = await ev(() => K().state.burned); ok(burned === 1, 'burned teller');
  // lege handen: A op brandende pot geeft melding, geen actie
  await H.press(1); c = await cookers(); ok(c[0].s === 'burning', 'A op brandende pot doet niets');
  await ev(() => { V(1).b = true; }); await step(10); c = await cookers(); ok(c[0].s === 'burning', 'blussen duurt even');
  await step(15); await ev(() => { V(1).b = false; }); c = await cookers(); ok(c[0].s === 'empty', 'B blust het vuur (pot leeg)');
  // 4. verkeerd gerecht afleveren
  await give(1, { k: 'plate', dish: 'stoof' }); await H.stand(1, 'hatch'); await H.press(1);
  const seats = await H.seatInfo(); console.log('   seats', seats);
  const hold = await H.holding(1);
  const hasStoof = await ev(() => K().seats.some((s) => s.state === 'waiting' && s.order.recipe === 'stoof'));
  ok(hasStoof ? hold === null : hold && hold.includes('stoof'), 'afleveren: alleen als bestelling klopt (hasStoof=' + hasStoof + ')');
  // 5. prullenbak geeft bord terug
  await give(1, { k: 'plate', dish: null }); const before = await ev(() => K().plateSt.count);
  await H.stand(1, 'trash'); await H.press(1); ok((await H.holding(1)) === null, 'bord in prullenbak');
  await step(70); const after = await ev(() => K().plateSt.count); ok(after === before + 1, `bord komt terug (${before} -> ${after})`);
  // 6. time-out zonder input
  await ev(() => { window.finished = 0; const m = __app.mode; const f = m.finish.bind(m); m.finish = (r) => { window.finished++; window.fres = r; return f(r); }; });
  await step(2200);
  console.log(JSON.stringify(await ev(() => ({ finished: window.finished, state: __app.mode.state, res: window.fres && { stars: window.fres.stars, score: window.fres.score, summary: window.fres.summary }, s: K().state }))));
  await step(100);
  console.log('finish aangeroepen:', await ev(() => window.finished));
}

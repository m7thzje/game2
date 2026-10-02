import { helpers } from './lib.mjs';
export default async function (S) {
  const { ev, step, shot, start } = S; const H = helpers(S);
  await start(); await step(80);
  const log = async (m) => console.log(m.padEnd(20), 'h0=', await H.holding(0), 'h1=', await H.holding(1), (await ev(() => { const k = K(); return JSON.stringify([k.pl[0].tgt && [k.pl[0].tgt.st.type, k.pl[0].tgt.a], k.boards.map(b => b.item && b.item.k + (b.item.chopped ? '!' : '') + b.progress.toFixed(2)), k.slots.map(s => s.item && s.item.k)]); })));
  await H.stand(0, 'crate:brood'); await H.press(0); await log('take brood');
  await H.stand(0, 'board:1'); await log('at board'); await H.press(0); await log('put');
  await H.hold(0, 'b', 25); await log('chop'); await H.press(0); await log('grab');
  await H.stand(0, 'slot:4,L'); await log('at slot'); await H.press(0); await log('put slot');
}

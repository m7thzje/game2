import { helpers } from './lib.mjs';
// Volledige soep-bestelling: ui + wortel hakken, in de pot, bord, serveren
export default async function (S) {
  const { ev, step, shot, start } = S; const H = helpers(S);
  await start();
  await step(100); // klant komt aan
  console.log('seats', await H.seatInfo());
  const log = async (m) => console.log(m.padEnd(34), 'hold0=', await H.holding(0), 'hold1=', await H.holding(1), '|', await H.ck());
  // Daan: ui
  await H.stand(0, 'crate:ui'); await H.press(0); await log('take ui');
  await H.stand(0, 'board:0'); await H.press(0); await log('put on board');
  await H.hold(0, 'b', 40); await log('chop (2s)');
  await H.press(0); await log('grab chopped');
  await H.stand(0, 'slot:2,L'); await H.press(0); await log('put on divider');
  // Sem pakt het door
  await H.stand(1, 'slot:2,R'); await H.press(1); await log('Sem grabs');
  await H.stand(1, 'cooker:0'); await H.press(1); await log('add to pot (ui)');
  // Daan: wortel
  await H.stand(0, 'crate:wortel'); await H.press(0);
  await H.stand(0, 'board:1'); await H.press(0); await H.hold(0, 'b', 40); await H.press(0);
  await H.stand(0, 'slot:3,L'); await H.press(0);
  await H.stand(1, 'slot:3,R'); await H.press(1); await H.stand(1, 'cooker:0'); await H.press(1); await log('add wortel -> cooking');
  await shot('cooking');
  await H.stand(1, 'plates'); await H.press(1); await log('plate');
  await step(8 * 20 + 5); await log('after cook');
  await shot('done');
  await H.stand(1, 'cooker:0'); await H.press(1); await log('plate filled');
  await H.stand(1, 'hatch'); await H.press(1); await log('served');
  await step(10);
  console.log(JSON.stringify(await H.state()), await H.seatInfo());
  await shot('served');
}

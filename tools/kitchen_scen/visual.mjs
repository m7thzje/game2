import { helpers } from './lib.mjs';
export default async function (S) {
  const { ev, step, shot, start } = S; const H = helpers(S);
  await start(); await step(80);
  // Wes hakt vlees, Jor staat bij pan met bord
  await H.stand(0, 'crate:vlees'); await H.press(0);
  await H.stand(0, 'board:0'); await H.press(0);
  await ev(() => { V(0).b = true; }); await step(12);
  await H.stand(1, 'plates'); await H.press(1);
  await shot('chop');
  await H.stand(1, 'slot:6'); await H.press(1);
  await ev(() => { V(0).b = false; }); await step(40);
  // pan met brood + kaas
  await H.stand(0, 'crate:brood'); await H.press(0); await H.stand(0, 'board:1'); await H.press(0); await H.hold(0, 'b', 25); await H.press(0);
  await H.stand(0, 'slot:4,L'); await H.press(0);
  await H.stand(0, 'crate:kaas'); await H.press(0); await H.stand(0, 'board:1'); await H.press(0); await H.hold(0, 'b', 25); await H.press(0);
  await H.stand(0, 'slot:5,L'); await H.press(0);
  await H.stand(1, 'slot:4,R'); await H.press(1);
  await H.stand(1, 'cooker:2'); await H.press(1);
  await H.stand(1, 'slot:5,R'); await H.press(1);
  await H.stand(1, 'cooker:2'); await H.press(1);
  await ev(() => { K().pl[1].x = 6.5; K().pl[1].z = 3.2; }); await step(60);
  await shot('pan');
  await step(120);
  await shot('pandone');
  await step(100); // brandt aan
  await shot('burn');
  console.log(await H.ck());
  await H.stand(1, 'cooker:2'); await ev(() => { V(1).b = true; }); await step(12); await shot('extinguish'); await step(15); await ev(() => { V(1).b = false; }); await step(5);
  console.log(await H.ck());
}

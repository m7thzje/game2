export default async function ({ ev, step, shot, start }) {
  await start();
  await step(60);
  await shot('look');
  await step(160);
  await shot('look2');
  console.log(JSON.stringify(await ev(() => K().stats)));
}

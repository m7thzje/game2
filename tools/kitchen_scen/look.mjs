export default async function ({ ev, step, shot, start }) {
  await start();
  await step(200);
  await shot('look');
  console.log(JSON.stringify(await ev(() => ({ st: __app.mode.state, s: K().state }))));
}

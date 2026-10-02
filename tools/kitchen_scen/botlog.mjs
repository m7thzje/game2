import fs from 'node:fs';
export default async function (S) {
  const { ev, step, start, page } = S;
  await start();
  await page.addScriptTag({ content: fs.readFileSync(new URL('./botsrc.js', import.meta.url), 'utf8') });
  await ev(() => { window.BOTLOG = []; });
  await ev(() => { for (let i = 0; i < 1000; i++) { bot.tick(0.05); __app.input.update(); __app.mode.update(0.05); } });
  console.log((await ev(() => BOTLOG)).join('\n'));
}

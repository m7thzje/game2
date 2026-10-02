import fs from 'node:fs';
export default async function (S) {
  const { ev, step, shot, start, page } = S;
  await start();
  await page.addScriptTag({ content: fs.readFileSync(new URL('./botsrc.js', import.meta.url), 'utf8') });
  const reaction = +(process.env.REACT || 0.25);
  await ev((r) => bot.setReaction(r), reaction);
  const runBot = (n) => ev((n) => { for (let i = 0; i < n; i++) { bot.tick(0.05); __app.input.update(); __app.mode.update(0.05); } return K().state; }, n);
  for (let sec = 0; sec < 11; sec++) {
    const s = await runBot(200);
    console.log(`t=${s.t.toFixed(0)} score=${s.score} served=${s.served} failed=${s.failed} burned=${s.burned} done=${s.done}`);
    if (sec === 3) await shot('bot3');
    if (s.done) break;
  }
  await shot('botend');
  console.log(await ev(() => document.querySelector('.card') ? document.querySelector('.card').innerText.replace(/\n+/g, ' | ') : 'geen kaart'));
}

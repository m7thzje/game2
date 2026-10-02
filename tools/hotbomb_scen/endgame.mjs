export default async function (S) {
  const { ev, step, shot, start, page } = S;
  await start();
  await ev(() => K().aiOnly(true));
  let n = 0;
  while ((await ev(() => __app.mode.state)) === 'play' && n++ < 40) {
    await step(100);
    if (n === 6) await shot('mid');
    const ph = await ev(() => K().st.phase); if (ph === 'end') { await step(20); await page.waitForTimeout(150); await shot('end'); }
  }
  await page.waitForTimeout(2500);
  await shot('result');
  console.log(await ev(() => document.querySelector('.card') ? document.querySelector('.card').innerText.replace(/\n+/g, ' | ') : 'geen kaart'));
}

export default async function (S) {
  const { ev, step, shot, start, page } = S;
  await start(); await step(100);
  await ev(() => { const k = K(); k.st.fuse = 1.0; });
  await step(5); await shot('prebomb');
  await step(14);
  await page.waitForTimeout(200); await shot('boom1');
  await step(8); await page.waitForTimeout(200); await shot('boom2');
  await step(30); await page.waitForTimeout(200); await shot('boom3');
  await step(60); await page.waitForTimeout(200); await shot('after');
}

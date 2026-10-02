export default async function ({ ev, step, start, shot, page }) {
  await start(); await step(400);
  await page.waitForTimeout(900);
  await shot('dom');
}

export default async function (S) {
  const { ev, step, start, page, out } = S;
  await start(); await step(100);
  for (const [name, fuseLeft] of [['a', 15], ['b', 6], ['c', 2.2]]) {
    await ev((f) => { const k = K(); k.st.fuse = f; }, fuseLeft);
    await step(2); await page.waitForTimeout(250);
    const p = await ev(() => { const k = K(); const h = k.st.holder; const v = new (h.c.group.position.constructor)(h.x, h.c.height + 0.8, h.z).project(__app.mode.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
    await page.screenshot({ path: `${out}_bomb_${name}.png`, clip: { x: Math.max(0, p[0] - 130), y: Math.max(0, p[1] - 120), width: 260, height: 220 } });
  }
}

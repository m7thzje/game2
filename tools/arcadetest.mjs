// Integratietest Speelhal: laadt de hal, speelt (kort) elk duel via de echte route playGame -> finishPvp -> terug in de hal.
// Gebruik: node tools/arcadetest.mjs [id ...]   (zonder ids: alle 18).   TWIST=<id> forceert een twist.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const ALL_OLD = ['dodgeball', 'cakefight', 'tugwar', 'airhockey', 'quickdraw', 'memory', 'paint', 'duckshoot', 'karts', 'climb', 'tanks', 'chairs', 'ticktock', 'minecart', 'buttons', 'vines', 'screws', 'chop'];
const ALL = (await import('/home/user/game2/src/games/index.js')).ARCADE_IDS;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
let cur = '-';
page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${cur}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[${cur}] [pageerror] ${e.message} ${(e.stack||'').split('\n').slice(0,4).join(' | ')}`));
await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1500);
const loaded = await page.evaluate(() => Object.keys(window.__app.games || {}));
console.log('geladen:', loaded.length, 'spellen');
await page.evaluate(() => window.__app.goArcade({}));
await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const cab = await page.evaluate(() => window.__app.mode.interact.filter((i) => i.type === 'cab').map((i) => i.id + ':' + i.label));
console.log('kasten:', cab.length);
await page.screenshot({ path: '/tmp/arcade_hall.png' });
let fails = 0;
for (const id of ids) {
  cur = id; const t0 = Date.now();
  try {
    const before = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.plays; });
    await page.evaluate(([id, tw]) => { window.__app.mode.leaving = true; return window.__app.playGame(id, { back: 'arcade', twist: tw || null }); }, [id, process.env.TWIST || null]);
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx, null, { timeout: 60000 });
    await page.waitForTimeout(600);
    const info = await page.evaluate(async (k) => {
      const app = window.__app, m = app.mode, inp = app.input;
      inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); m.update(0.016);
      inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); m.update(0.016);
      await new Promise((r) => setTimeout(r, 400));
      let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
      for (let i = 0; i < 120; i++) { inp.update(); m.update(0.016); }
      const tw = m.ctx.twist && m.ctx.twist.id;
      m.ctx.finishPvp({ winner: k % 2, score: [k % 2 ? 1 : 2, k % 2 ? 2 : 1], summary: 'testduel' });
      return { state: m.state, tw };
    }, ids.indexOf(id));
    await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 }).catch(() => { throw new Error('resultaat niet klaar: ' + JSON.stringify(info)); });
    await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; if (m.canRematch) { m.resSel = 1; } inp.virtual[0].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.update(); m.update(0.016); });
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.interact, null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const after = await page.evaluate(async (id) => { const { S } = await import('/src/save.js'); return { plays: S.arcade.plays, g: S.arcade.byGame[id] }; }, id);
    const ok = after.plays === before + 1 && after.g && after.g.plays >= 1;
    console.log(`${ok ? 'OK  ' : 'FOUT'} ${id.padEnd(10)} twist=${info.tw} plays ${before}->${after.plays} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (!ok) fails++;
  } catch (e) { fails++; console.log('FOUT', id, e.message.split('\n')[0]); try { await page.screenshot({ path: `/tmp/arcade_fail_${id}.png` }); } catch {} }
}
await page.screenshot({ path: '/tmp/arcade_after.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'NO ERRORS', '| fouten:', fails);
await browser.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);

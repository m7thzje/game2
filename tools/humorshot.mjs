// Screenshots van de humor-onderdelen van de impactID Gamehal (lobby, rangpaneel, kast, knock-out, resultaatkaarten, rang-op, Deurman-cameo, pauze).
// Gebruik: PLAYERS=4 node tools/humorshot.mjs   -> /tmp/humor/*.png (1100x650). Print ook tekst die buiten de kaart valt (scrollWidth > clientWidth).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
import { ghHelpers } from './gh_lib.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.env.OUT || '/tmp/humor'; fs.mkdirSync(out, { recursive: true });
const N = +(process.env.PLAYERS || 4);
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const ext = path.extname(f); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const errors = []; page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); errors.push(e.message); }); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT|ERR_/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const H = ghHelpers(page, { check: (ok, w) => console.log(ok ? 'OK  ' : 'FOUT', w), shot });
const { press, choose, waitMenu, waitHall, playMatch } = H;
const overflow = async (label) => console.log('overflow', label, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.card, .card *')].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className + ':' + e.scrollWidth + '>' + e.clientWidth).slice(0, 5))));
const closeAll = () => page.evaluate(() => { const m = window.__app.mode; document.querySelectorAll('.dialog,.say').forEach((e) => e.remove()); m.busy = false; if (m.menu && m.menu.items) { m.menu.sel = 0; m.menu.activate(1); } });

await page.goto(`http://localhost:${port}/gamehal.html?quality=low&unlock=1&players=${N}`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.menu, null, { timeout: 120000 });
await page.waitForTimeout(2500); await shot('lobby');
await page.evaluate(() => window.__app.S.settings.scare = 0);
// laadscherm-regel + tips
console.log('boot-regels:', await page.evaluate(async () => { const m = await import('/src/gamehal/humor.js'); return [m.BOOT_LINES.length, m.TIPS.length, m.QUIP_COUNT]; }));

await page.evaluate(() => window.__app.goArcade({}));
await waitHall(); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__app.S; S.flags.met_king = true; S.arcade.rankSeen = 99; document.querySelectorAll('.dialog,.say').forEach((e) => e.remove()); const m = window.__app.mode; m.busy = false; m.intro = 0; });
// rangpaneel (Hallen & rang)
await page.evaluate(() => { const S = window.__app.S; S.arcade.plays = 40; S.arcade.wins = [14, 12, 9, 5]; S.coins = 340; S.totalEarned = 900; window.__pm = window.__app.mode.planModal(); });
await page.waitForTimeout(900); await shot('rangpaneel'); await overflow('rangpaneel');
await page.evaluate(() => { const m = window.__app.mode; if (m.modal) { m.modal.el.remove(); m.modal.resolve(); m.modal = null; } m.busy = false; });
// rang-op
await page.evaluate(() => { const S = window.__app.S; S.arcade.rankSeen = 2; S.arcade.plays = 100; window.__ru = window.__app.mode.checkRankUp(); });
await page.waitForTimeout(1200); await shot('rang_op'); await page.evaluate(() => document.querySelectorAll('.dialog,.say').forEach((e) => e.remove()));
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; });
// kastmenu (pingpong)
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.intro = 0; window.__cab = m.cab('pingpong'); });
await waitMenu(); await page.waitForTimeout(500); await shot('kastmenu'); await overflow('kastmenu'); await choose(2); await page.waitForTimeout(500);
// teuitgang
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; window.__lv = m.leave(); }); await waitMenu(); await page.waitForTimeout(400); await shot('terug_lobby'); await choose(1); await page.waitForTimeout(400);
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; });
// pauze
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; window.__ps = m.pauseMenu(); }); await page.waitForTimeout(800); await shot('pauze'); await closeAll(); await page.waitForTimeout(400);
// knock-out (4 spelers): tussenkaart
if (N === 4) {
  await page.evaluate(async () => { window.__app.games.dueltest = (await import('/src/games/dueltest.js')).default; });
  await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.intro = 0; window.__lp = m.launch('dueltest'); });
  await waitMenu(); await page.waitForTimeout(500); await shot('knockout_kaart'); await overflow('knockout'); await choose(1); await page.waitForTimeout(600);
  await waitHall(); await page.evaluate(() => { const m = window.__app.mode; m.busy = false; });
}
// resultaten: een spel starten, direct laten eindigen, kaart fotograferen, doorgaan (of revanche)
const finishGame = async (name, resSrc, { rematch = false } = {}) => {
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx && window.__app.mode.ids && !window.__app.mode.finished && !window.__app.mode.closed, null, { timeout: 60000 }); await page.waitForTimeout(600);
  await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; for (const id of m.ids) inp.virtual[id].a = true; inp.update(); m.update(0.016); for (const id of m.ids) inp.virtual[id].a = false; inp.update(); m.update(0.016); });
  await page.waitForTimeout(600);
  await page.evaluate((src) => { const app = window.__app, m = app.mode, inp = app.input; let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); } m.ctx.finishPvp(new Function('ctx', 'return (' + src + ')(ctx)')(m.ctx)); }, resSrc);
  await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 }); await page.waitForTimeout(900); await shot(name); await overflow(name);
  console.log('quip', name + ':', await page.evaluate(() => (document.querySelector('.gh-quip') || {}).textContent));
  await page.evaluate((re) => { const m = window.__app.mode, app = window.__app; if (m.canRematch) { m.resSel = re ? 0 : 1; m.drawResOpts(); } const id = m.ids[0]; app.input.virtual[id].a = true; app.input.update(); m.update(0.016); app.input.virtual[id].a = false; app.input.update(); m.update(0.016); }, rematch);
  if (rematch) return;
  await waitHall(); await page.waitForTimeout(500);
  await page.evaluate(() => { const m = window.__app.mode; document.querySelectorAll('.dialog,.say').forEach((e) => e.remove()); if (m.menu) { m.menu.sel = 0; m.menu.activate(1); } m.busy = false; });
  await page.waitForTimeout(500);
};
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.intro = 0; window.__lp = m.launch('pingpong', { players: [0, 1] }); });
await finishGame('resultaat_2p_0', '(ctx) => ({ winner: 0, score: [11, 7], summary: "Wes wint met 11-7." })', { rematch: true });
await finishGame('resultaat_2p_1', '(ctx) => ({ winner: 0, score: [11, 9], summary: "Wes wint met 11-9." })');
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.intro = 0; window.__lp = m.launch('pingpong', { players: [0, 1] }); });
await finishGame('resultaat_gelijk', '(ctx) => ({ winner: null, score: [5, 5], summary: "5-5." })');
// 3-4 spelers: plaatsen (alle spelers, vrij voor allen) en teams
if (N >= 3) {
  await page.evaluate(async () => { const app = window.__app; app.games._quad_test = (await import('/src/games/_quad_test.js')).default; });
  await page.evaluate((N) => { const m = window.__app.mode; m.busy = false; m.intro = 0; window.__lp = m.launch('_quad_test', { players: [0, 1, 2, 3].slice(0, N) }); }, N);
  await finishGame('resultaat_ffa', '(ctx) => ({ winner: ctx.players.length - 1, score: ctx.players.map((_, i) => i * 3), place: ctx.players.map((_, i) => ctx.players.length - 1 - i), summary: "test" })');
  if (N === 4) {
    await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.intro = 0; window.__lp = m.launch('_quad_test'); });
    await waitMenu(); await choose(0);
    await finishGame('resultaat_team', '(ctx) => ({ winners: ctx.teams[1].slice(), score: [0, 1, 2, 3], place: [3, 2, 1, 0], summary: "test" })');
  }
}
// Deurman-cameo en album
await page.evaluate(async () => { const c = await import('/src/engine/cameo.js'); window.__cam = c; window.__app.S.settings.scare = 1; c.resetCameoCooldown(); window.__cp = c.cameo('highfive', { where: 'hall', silent: true }); });
await page.waitForTimeout(1500); await shot('cameo_afstemmen');
await page.evaluate(() => window.__cam.stopCameo()); await page.waitForTimeout(300);
await page.evaluate(() => { window.__cp = window.__cam.cameo('deuropen', { where: 'hall', silent: true }); }); await page.waitForTimeout(1800); await shot('cameo_deuropen'); await page.evaluate(() => window.__cam.stopCameo());
await page.evaluate(() => { const c = window.__cam; ['highfive', 'deuropen', 'dansen', 'pizza', 'kleurenruil', 'trombone'].forEach((k) => c.giveSticker(k, { silent: true })); window.__al = c.openAlbum(); });
await page.waitForTimeout(800); await shot('album'); await overflow('album');
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS');
await b.close(); server.close();

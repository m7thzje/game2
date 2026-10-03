// Screenshots van een hal (voor het bouwen/verfijnen). Gebruik: node tools/hallshot.mjs <hal 0-4> [view ...]
// views: start | mid | host | zone<N> | cab<N> | <x>,<z>      OUT=<map> (standaard /tmp/hs)   SCARE=<0-3> (standaard 0)   NOUNLOCK=1 (hallen niet open)   LOCKSEC=1 (geheime deur niet als open markeren)   PRE=<js> (uitvoeren voor de screenshot)
// Print per view ook het aantal draw calls, driehoeken en de console-fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.env.OUT || '/tmp/hs'; fs.mkdirSync(out, { recursive: true });
const hall = +(process.argv[2] ?? 0); const views = process.argv.slice(3).length ? process.argv.slice(3) : ['start', 'mid'];
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|'))); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/?quality=low&unlock=${process.env.NOUNLOCK ? 0 : 1}`);
await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 40, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.evaluate(async ([hall, scare, lock]) => { const { S } = await import('/src/save.js'); S.settings.scare = scare; S.flags.met_king = true; S.flags.intro_done = true; for (let i = 0; i < 5; i++) S.flags['met_hall' + i] = true; if (!lock) S.flags.deurhal_open = true; }, [hall, +(process.env.SCARE || 0), !!process.env.LOCKSEC]);
await page.evaluate((hall) => window.__app.goArcade(hall ? { extra: { hall }, via: 'door', fromHall: 0 } : {}), hall);
await page.waitForFunction((hall) => window.__app.mode && window.__app.mode.hallId === hall && window.__app.mode.cabs && window.__app.mode.life, hall, { timeout: 90000 });
await page.waitForTimeout(1500);
for (const v of views) {
  await page.evaluate(([v]) => {
    document.querySelectorAll('.dialog,.say,.hud-toast').forEach((e) => e.remove()); const m = window.__app.mode; m.busy = false; m.intro = 0; m.camOverride = null;
    let pos = null; const cabs = m.interact.filter((i) => i.type === 'cab');
    if (v === 'mid') pos = [0, 12]; else if (v === 'host') pos = [0, -12]; else if (/^zone\d+$/.test(v)) { const z = m.zones[+v.slice(4)]; pos = [z.cx, z.cz + 5]; } else if (/^cab\d+$/.test(v)) { const c = cabs[+v.slice(3)]; pos = [c.x, c.z]; } else if (v.includes(',')) pos = v.split(',').map(Number);
    if (pos) for (const p of m.players) { p.x = pos[0] + (p.i ? 1.2 : -1.2); p.z = pos[1]; p.vx = p.vz = 0; }
  }, [v]);
  if (process.env.PRE) await page.evaluate((js) => { void (0, eval)(js); }, process.env.PRE);   // optioneel: JS die in de pagina draait (bijv. window.__app.mode.pickGames())
  await page.waitForTimeout(2600);
  await page.evaluate(() => document.querySelectorAll('.dialog,.say').forEach((e) => e.remove()));
  await page.screenshot({ path: `${out}/hall${hall}_${v.replace(',', '_')}.png` });
  const info = await page.evaluate(() => { const i = window.__app.renderer.info; return `${i.render.calls} calls, ${(i.render.triangles / 1000).toFixed(0)}k tris`; });
  console.log(v, info);
}
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS');
await b.close(); server.close();

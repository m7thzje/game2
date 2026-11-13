// Camera-/HUD-controle van de hal: node tools/camshot.mjs <view ...>   (GAMEHAL=1 PLAYERS=2|3|4, OUT=<map>, HALL=<0-4>)
// views: start | front | left | right | spread | back | corners | <x>,<z> (alle spelers op dat punt) | <x>,<z>;<x>,<z>;... (per speler een punt)
// Wacht tot de camera is ingedamd (niet afhankelijk van framerate) en rapporteert per speler de schermpositie (px) en of die in het "veilige" kader valt.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.env.OUT || '/tmp/cs'; fs.mkdirSync(out, { recursive: true });
const views = process.argv.slice(2).length ? process.argv.slice(2) : ['start'];
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
const W = +(process.env.W || 1100), H = +(process.env.H || 650);
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const GH = process.env.GAMEHAL !== '0';
const hall = +(process.env.HALL || 0);
await page.goto(`http://localhost:${port}/${GH ? 'gamehal.html' : ''}?quality=low&unlock=1${process.env.PLAYERS ? '&players=' + process.env.PLAYERS : ''}`);
await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 40, null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.flags.met_king = true; S.flags.intro_done = true; for (let i = 0; i < 5; i++) S.flags['met_hall' + i] = true; S.flags.deurhal_open = true; });
await page.evaluate((hall) => window.__app.goArcade(hall ? { extra: { hall }, via: 'door', fromHall: 0 } : {}), hall);
await page.waitForFunction((hall) => window.__app.mode && window.__app.mode.hallId === hall && window.__app.mode.cabs && window.__app.mode.life, hall, { timeout: 90000 });
await page.waitForTimeout(1000);
if (process.env.NOFIT) await page.evaluate(() => { window.__app.mode.camFit = () => null; });   // NOFIT=1: de oude (ongekaderde) camera ter vergelijking
const PRESET = { front: '0,15', left: '-24,2', right: '24,2', back: '0,-14', mid: '0,5' };
for (const v0 of views) {
  const v = PRESET[v0] || v0;
  await page.evaluate(([v]) => {
    document.querySelectorAll('.dialog,.say,.hud-toast').forEach((e) => e.remove()); const m = window.__app.mode; m.busy = false; m.intro = 0; m.camOverride = null;
    const n = m.players.length; let pts = null;
    if (v === 'spread') pts = [[-24, 14], [24, 14], [-24, -12], [24, -12]]; else if (v === 'corners') pts = [[-24, 16], [24, 16], [-10, -16], [10, -16]];
    else if (v === 'start') pts = null; else if (v.includes(';')) pts = v.split(';').map((s) => s.split(',').map(Number));
    else { const c = v.split(',').map(Number); pts = m.players.map((p) => [c[0] + (p.i - (n - 1) / 2) * (n === 2 ? 2.4 : 1.2), c[1]]); }
    if (pts) m.players.forEach((p, k) => { const q = pts[k % pts.length]; p.x = q[0]; p.z = q[1]; p.vx = p.vz = 0; });
  }, [v]);
  // laat de camera deterministisch indempen (de headless framerate is laag): 160 x update(0.05) = 8 s speltijd
  await page.evaluate(() => { const m = window.__app.mode; for (let i = 0; i < 160; i++) m.update(0.05); });
  await page.waitForTimeout(600);
  const last = await page.evaluate(() => { const m = window.__app.mode; return [m.camPos.x, m.camPos.y, m.camPos.z, m.camLook.x, m.camLook.z]; });
  const proj = await page.evaluate(([W, H]) => {
    const m = window.__app.mode, cam = m.camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const V = cam.position.clone();
    return m.players.map((p) => { V.set(p.x, 1.0, p.z).project(cam); return [Math.round((V.x + 1) / 2 * W), Math.round((1 - V.y) / 2 * H)]; });
  }, [W, H]);
  if (process.env.CABS) console.log('kasten bij spelers', JSON.stringify(await page.evaluate(() => { const m = window.__app.mode; return m.cabs.filter((c) => m.players.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 7)).map((c) => [c.id, +c.x.toFixed(1), +c.z.toFixed(1)]); })), 'spelers', JSON.stringify(await page.evaluate(() => window.__app.mode.players.map((p) => [+p.x.toFixed(1), +p.z.toFixed(1)]))));
  if (process.env.FITDBG) console.log(JSON.stringify(await page.evaluate(() => { const m = window.__app.mode, cam = m.camera, V = cam.position.clone(); cam.updateMatrixWorld(); return m._fitPts.map((p) => { V.copy(p).project(cam); return [p.x, p.y, p.z, V.x, V.y].map((x) => +x.toFixed(2)); }); })));
  await page.screenshot({ path: `${out}/${process.env.TAG || 'cs'}_${v0.replace(/[,;]/g, '_')}.png` });
  console.log(v0, 'cam', JSON.stringify(last.map((x) => +x.toFixed(1))), 'spelers px', JSON.stringify(proj));
}
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS');
await b.close(); server.close();

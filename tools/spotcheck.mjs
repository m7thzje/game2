// Controleert of alle plekken in het dorp bereikbaar zijn (geen water, niet in een obstakel)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/?hub`);
await page.waitForFunction(() => window.__app?.mode?.players, null, { timeout: 280000 });
const res = await page.evaluate(async () => {
  const T = await import('/src/world/terrain.js'); const L = await import('/src/world/layout.js'); const m = window.__app.mode;
  const bad = []; const pts = [];
  for (const j of L.JOBS) { pts.push([j.id, j.x, j.z]); pts.push([j.id + ' (spawn)', j.x + Math.sin(j.yaw) * 3, j.z + Math.cos(j.yaw) * 3]); pts.push([j.id + ' (voor NPC)', j.x + Math.sin(j.yaw) * 2, j.z + Math.cos(j.yaw) * 2]); }
  pts.push(['speelhal-ingang', L.ARCADE.x + Math.sin(L.ARCADE.yaw) * 5, L.ARCADE.z + Math.cos(L.ARCADE.yaw) * 5], ['speelhal-terug', L.ARCADE.x + Math.sin(L.ARCADE.yaw) * 9, L.ARCADE.z + Math.cos(L.ARCADE.yaw) * 9]);
  for (const n of L.STRAAT) { if (!n.at) pts.push(['praatje ' + n.id, n.x, n.z]); pts.push(['praatje-voor ' + n.id, n.at ? n.at[0] : n.x, n.at ? n.at[1] : n.z + 2]); }
  pts.push(['tipkraam', L.TIPKRAAM.x + 0.4, L.TIPKRAAM.z + 2.4], ['bord', L.BOARD.x, L.BOARD.z + 2], ['huisdeur', ...(() => { const d = m.W.doors.find((x) => x.owner === 'Thuis'); return [d.x, d.z]; })()], ['kasteelpoort', L.POORT.x, L.POORT.z + 2.5], ['start', L.SPAWN.x, L.SPAWN.z]);
  for (const k of L.DOORKNOBS) pts.push(['knop ' + k.id, k.x, k.z]); for (const c of L.CHESTS) pts.push(['kist ' + c.id, c.x, c.z]);
  for (const [n, x, z] of pts) {
    const w = T.isWater(x, z); const q = m.collide({}, x, z); const inObs = Math.hypot(q[0] - x, q[1] - z) > 0.05;
    if (w || inObs) bad.push(`${n} (${x.toFixed(1)}, ${z.toFixed(1)}) ${w ? 'WATER' : ''} ${inObs ? 'IN OBSTAKEL' : ''}`);
  }
  return bad;
});
console.log(res.length ? 'PROBLEMEN:\n' + res.join('\n') : 'Alle plekken zijn bereikbaar');
await browser.close(); server.close();

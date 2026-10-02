// Test van online spelen: lokale PeerJS-server + host-pagina + gast-pagina in één browser
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire('/tmp/t3/');
const { PeerServer } = require('peer');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const ps = PeerServer({ port: 9123, path: '/', host: '127.0.0.1' });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
const errors = [];
const host = await ctx.newPage(); const guest = await ctx.newPage();
for (const [n, p] of [['host', host], ['guest', guest]]) { p.on('pageerror', (e) => errors.push(`[${n}] ` + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/CERT|404|Failed to load/.test(m.text())) errors.push(`[${n}] ` + m.text()); }); }
const PEER = 'peerhost=127.0.0.1&peerport=9123&peersecure=0';
await host.goto(`http://localhost:${port}/?${PEER}`);
await host.waitForFunction(() => window.__app?.mode, null, { timeout: 120000 });
const code = await host.evaluate(() => window.__app.net.start());
console.log('code', code);
await guest.goto(`http://localhost:${port}/?join=${code}&${PEER}`);
await guest.click('#gjoin');
await host.waitForFunction(() => window.__app.net.status === 'connected', null, { timeout: 30000 });
console.log('host: verbonden');
await guest.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: 40000 }).then(() => console.log('gast: video komt binnen')).catch(() => console.log('gast: GEEN video'));
await guest.waitForTimeout(2500);
console.log('video', await guest.evaluate(() => { const v = document.querySelector('video'); return [v.videoWidth, v.videoHeight, v.readyState, v.srcObject?.getAudioTracks().length]; }));
// toets op gast -> host speler 2
await guest.keyboard.down('ArrowRight'); await guest.waitForTimeout(700);
console.log('host p[1].x met pijl rechts op gast:', await host.evaluate(() => window.__app.input.p[1].x));
await guest.keyboard.up('ArrowRight'); await guest.waitForTimeout(500);
await guest.keyboard.press('Enter'); await guest.waitForTimeout(40);
await guest.keyboard.down('KeyF'); await guest.waitForTimeout(300); await guest.keyboard.up('KeyF');
console.log('host p[1].x na loslaten:', await host.evaluate(() => window.__app.input.p[1].x), 'online=', await host.evaluate(() => window.__app.input.online));
// UI-spiegel
await host.evaluate(() => window.__app.ui.hud.toast('Hallo gast!', 5000)); await guest.waitForTimeout(1200);
console.log('gast ziet toast:', await guest.evaluate(() => document.getElementById('hud').innerText.includes('Hallo gast')));
console.log('gast ziet menu van host:', await guest.evaluate(() => document.getElementById('screens').innerText.slice(0, 60).replace(/\n/g, ' | ')));
console.log(JSON.stringify(await guest.evaluate(() => { const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [id, Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), cs.position, cs.display, cs.opacity, e.innerHTML.length]; }; return [r('app'), r('screens'), r('hud'), r('fade'), r('vignette'), document.querySelector('video').getBoundingClientRect().width, document.getElementById('boot')?.id, document.hidden]; })));
console.log('fade host/gast', await host.evaluate(() => [document.getElementById('fade').style.opacity, getComputedStyle(document.getElementById('fade')).opacity]), await guest.evaluate(() => [document.getElementById('fade').style.opacity, document.getElementById('fade').style.cssText]));
console.log('host hidden', await host.evaluate(() => document.hidden), 'fps', await host.evaluate(() => window.__app.fps));
console.log('probe', JSON.stringify(await guest.evaluate(() => { const f = document.getElementById('fade'); const a = getComputedStyle(f).opacity; f.style.opacity = '0'; const b = getComputedStyle(f).opacity; const anims = f.getAnimations().map((x) => x.playState + ':' + x.transitionProperty); return { a, b, anims, bg: getComputedStyle(document.body).backgroundColor, z: [...document.querySelectorAll('#app > *')].map((e) => e.id || e.tagName + ':' + getComputedStyle(e).zIndex + ':' + getComputedStyle(e).opacity) }; })));
// echte minigame: host start 'catch', gast drukt Enter = klaar
await host.evaluate(async () => { await window.__app.playGame('catch', { practice: true, back: 'menu' }); });
await host.waitForFunction(() => window.__app.mode.constructor.name === 'MinigameMode', null, { timeout: 60000 }); await guest.waitForTimeout(2500);
await guest.keyboard.down('Enter'); await guest.waitForTimeout(120); await guest.keyboard.up('Enter'); await host.waitForTimeout(1200);
console.log('minigame: gast heeft klaar gedrukt (host ready[1]):', await host.evaluate(() => window.__app.mode.ready[1]));
console.log('gast ziet introkaart:', await guest.evaluate(() => document.getElementById('screens').innerText.includes('Broodjes')));
await guest.screenshot({ path: '/tmp/net_guest.png' }); await host.screenshot({ path: '/tmp/net_host.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
await browser.close(); server.close(); ps.close?.(); process.exit(0);

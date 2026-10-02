// Test tegen de echte site + publieke PeerJS-server
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const URL0 = process.argv[2] || 'https://m7thzje.github.io/game2/';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 }, ignoreHTTPSErrors: true });
const errors = [];
const host = await ctx.newPage(); const guest = await ctx.newPage();
for (const [n, p] of [['host', host], ['guest', guest]]) { p.on('pageerror', (e) => errors.push(`[${n}] ` + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/CERT|net::ERR_CERT|fonts/.test(m.text())) errors.push(`[${n}] ` + m.text()); }); }
await host.goto(URL0);
await host.waitForFunction(() => window.__app?.mode, null, { timeout: 120000 });
console.log('host: spel geladen van', URL0);
const code = await host.evaluate(() => window.__app.net.start()).catch((e) => 'FOUT ' + e.message);
console.log('code', code);
if (String(code).startsWith('FOUT')) { console.log(errors.slice(0, 5)); await browser.close(); process.exit(1); }
const link = await host.evaluate(() => window.__app.net.link()); console.log('link', link);
await guest.goto(link);
await guest.click('#gjoin');
await host.waitForFunction(() => window.__app.net.status === 'connected', null, { timeout: 40000 }).then(() => console.log('host: gast verbonden')).catch(() => console.log('host: GEEN verbinding'));
await guest.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: 40000 }).then(() => console.log('gast: video komt binnen')).catch(() => console.log('gast: GEEN video'));
await guest.waitForTimeout(2000);
await guest.keyboard.down('ArrowRight'); await guest.waitForTimeout(800);
console.log('host speler 2 x:', await host.evaluate(() => window.__app.input.p[1].x));
await guest.keyboard.up('ArrowRight');
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
await browser.close(); process.exit(0);

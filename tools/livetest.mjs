// Test tegen de echte site + publieke PeerJS-server: 1 host + 2 gasten (Jor via ?as=jor, Juul via ?as=juul).
// Let op: de gepubliceerde site moet de nieuwe netwerkcode bevatten (anders is er maar 1 gast). Alles draait in één browser:
// echte tests tussen verschillende machines/netwerken (NAT, TURN) zijn dit niet.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const URL0 = process.argv[2] || 'https://m7thzje.github.io/game2/';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 }, ignoreHTTPSErrors: true });
const gctx = await browser.newContext({ viewport: { width: 640, height: 400 }, ignoreHTTPSErrors: true });
const errors = [];
const hook = (n, p) => { p.on('pageerror', (e) => errors.push(`[${n}] ` + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/CERT|net::ERR_CERT|fonts/.test(m.text())) errors.push(`[${n}] ` + m.text()); }); };
const host = await ctx.newPage(); hook('host', host);
await host.goto(URL0);
await host.waitForFunction(() => window.__app?.mode, null, { timeout: 120000 });
console.log('host: spel geladen van', URL0);
await host.evaluate(() => { window.__app.S.settings.players = 3; });   // 3 spelers = 2 gasten
const code = await host.evaluate(() => window.__app.net.start()).catch((e) => 'FOUT ' + e.message);
console.log('code', code);
if (String(code).startsWith('FOUT')) { console.log(errors.slice(0, 5)); await browser.close(); process.exit(1); }
const links = await host.evaluate(() => [window.__app.net.link('jor'), window.__app.net.link('juul')]); console.log('links', links);
const guests = [];
for (const [i, link] of links.entries()) {
  const g = await gctx.newPage(); hook(i ? 'juul' : 'jor', g); guests.push(g);
  await g.goto(link); await g.click('#gjoin');
}
await host.waitForFunction(() => window.__app.net.allConnected, null, { timeout: 60000 }).then(() => console.log('host: beide gasten verbonden')).catch(async () => console.log('host: NIET iedereen verbonden:', await host.evaluate(() => JSON.stringify(window.__app.net.guestInfo()))));
for (const [i, g] of guests.entries()) await g.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: 40000 }).then(() => console.log(['Jor', 'Juul'][i] + ': video komt binnen')).catch(() => console.log(['Jor', 'Juul'][i] + ': GEEN video'));
await guests[0].waitForTimeout(2000);
const st = (n) => host.evaluate((n) => { const I = window.__app.input; const s = (I.all || I.p)[n]; return [s.x, s.y]; }, n);
await guests[0].keyboard.down('ArrowRight'); await guests[1].keyboard.down('KeyJ'); await guests[0].waitForTimeout(900);
console.log('host speler 1 (Jor) x/y:', await st(1), ' speler 2 (Juul) x/y:', await st(2));
await guests[0].keyboard.up('ArrowRight'); await guests[1].keyboard.up('KeyJ');
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
await browser.close(); process.exit(0);

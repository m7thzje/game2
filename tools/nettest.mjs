// Test van online spelen: lokale PeerJS-server + host-pagina + gast-pagina's in één browser.
// Scenario 1: 1 host + 1 gast (regressie). Scenario 2: 1 host + 2 gasten (Jor en Juul), as=-toewijzing, conflicten,
// weigering van een derde gast, wegvallen/terugkomen van één gast, online-dialoog.
// Let op: dit is WebRTC binnen één browser op één machine; echte verbindingen tussen verschillende machines/netwerken zijn hier niet mee getest.
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
const hostCtx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
const guestCtx = await browser.newContext({ viewport: { width: 640, height: 400 } });   // kleine gasten: scheelt CPU
const errors = []; const fails = []; let nCheck = 0;
const check = (name, ok, extra = '') => { nCheck++; console.log(ok ? '  ok  ' : ' FOUT ', name, extra); if (!ok) fails.push(name); };
const hook = (n, p) => { p.on('pageerror', (e) => errors.push(`[${n}] ` + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/CERT|404|Failed to load/.test(m.text())) errors.push(`[${n}] ` + m.text()); }); };
const PEER = 'peerhost=127.0.0.1&peerport=9123&peersecure=0';
const base = `http://localhost:${port}/`;
const opened = [];
async function openGuest(name, code, as) {
  const p = await guestCtx.newPage(); hook(name, p); opened.push(p);
  await p.goto(`${base}?join=${code}${as ? '&as=' + as : ''}&${PEER}`);
  await p.click('#gjoin'); return p;
}
const hasVideo = (p, t = 40000) => p.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: t }).then(() => true).catch(() => false);
const guestState = (p) => p.evaluate(() => ({ id: window.__guest?.id, name: window.__guest?.name, state: window.__guest?.state, reason: window.__guest?.reason, msg: window.__guest?.msg }));
const waitGuest = (p, fn, t = 25000) => p.waitForFunction(fn, null, { timeout: t }).then(() => true).catch(() => false);
const label = (p) => p.evaluate(() => [...document.body.children].map((e) => e.textContent).filter((t) => t.includes('Je speelt als')).join('|'));

// ---------- host ----------
const host = await hostCtx.newPage(); hook('host', host);
await host.goto(`${base}?${PEER}`);
await host.waitForFunction(() => window.__app?.mode, null, { timeout: 120000 });
await host.mouse.click(5, 5);   // gebruikersactie: audio wordt gestart (en dus mee gestreamd)
const code = await host.evaluate(() => window.__app.net.start());
console.log('code', code);
const hostInfo = () => host.evaluate(() => window.__app.net.guestInfo().map((g) => g.id + ':' + g.status).join(' '));
const waitHost = (fn, arg, t = 30000) => host.waitForFunction(fn, arg, { timeout: t }).then(() => true).catch(() => false);
// toestand van een speler op de host (nieuwe engine: input.all[i]; oude: input.p[i])
const pst = (i) => host.evaluate((i) => { const I = window.__app.input; const s = (I.all || I.p)[i]; return { x: s.x, y: s.y, up: !!s.up, right: !!s.right, a: !!s.a, b: !!s.b }; }, i);

// wacht (tot 10 s) tot de toestand van speler i aan fn voldoet; geeft de laatste toestand terug (host kan traag zijn als de machine druk is)
async function until(i, fn) { let s; for (let n = 0; n < 50; n++) { s = await pst(i); if (fn(s)) return s; await host.waitForTimeout(200); } return s; }
const quiet = (s) => s.x === 0 && s.y === 0 && !s.up && !s.right && !s.a && !s.b;

console.log('== Scenario 1: 1 host + 1 gast (regressie) ==');
check('standaard 2 spelers => 1 gast', await host.evaluate(() => window.__app.net.maxGuests === 1));
check('link zonder as', await host.evaluate(() => /\?join=\d{6}&?/.test(window.__app.net.link()) && !window.__app.net.link().includes('as=')));
check('link as=jor', await host.evaluate(() => window.__app.net.link('jor').includes('as=jor')));
let g1 = await openGuest('gast1', code, '');
check('host: gast 1 verbonden', await waitHost(() => window.__app.net.status === 'connected'));
check('gast 1 kreeg speler 1 = Jor', JSON.stringify(await guestState(g1)).includes('"id":1') && (await guestState(g1)).name === 'Jor');
check('gast 1: video komt binnen', await hasVideo(g1));
await g1.waitForTimeout(1500);
console.log('  video', await g1.evaluate(() => { const v = document.querySelector('video'); return [v.videoWidth, v.videoHeight, v.readyState, v.srcObject?.getAudioTracks().length]; }));
check('gast 1: label "Je speelt als Jor"', (await label(g1)).includes('Je speelt als Jor'));
await g1.keyboard.down('ArrowRight');
check('pijl rechts op gast => speler 1 (Jor) x>0', (await until(1, (s) => s.x > 0.5)).x > 0.5);
await g1.keyboard.up('ArrowRight');
check('na loslaten x=0 en online=true', (await until(1, (s) => s.x === 0)).x === 0 && await host.evaluate(() => window.__app.input.online === true));
await host.evaluate(() => window.__app.ui.hud.toast('Hallo gast!', 5000)); await g1.waitForTimeout(1200);
check('gast ziet toast (UI-snapshot)', await g1.evaluate(() => document.getElementById('hud').innerText.includes('Hallo gast')));
console.log('  gast ziet menu van host:', await g1.evaluate(() => document.getElementById('screens').innerText.slice(0, 60).replace(/\n/g, ' | ')));
// echte minigame: host start 'catch', gast drukt Enter = klaar
await host.evaluate(async () => { await window.__app.playGame('catch', { practice: true, back: 'menu' }); });
await host.waitForFunction(() => window.__app.mode.constructor.name === 'MinigameMode', null, { timeout: 60000 }); await g1.waitForTimeout(2500);
await g1.keyboard.down('Enter'); await g1.waitForTimeout(120); await g1.keyboard.up('Enter'); await host.waitForTimeout(1200);
check('minigame: gast heeft klaar gedrukt (ready[1])', await host.evaluate(() => !!window.__app.mode.ready[1]));
check('gast ziet introkaart', await g1.evaluate(() => document.getElementById('screens').innerText.includes('Broodjes')));
await g1.screenshot({ path: '/tmp/net_guest.png' }); await host.screenshot({ path: '/tmp/net_host.png' });
// terug naar het menu voor het volgende scenario
await host.evaluate(async () => { await window.__app.goMenu(); }); await host.waitForTimeout(800);
// 2e gast terwijl er maar 1 plek is
let x1 = await openGuest('extra-vol', code, '');
check('1-gast-spel: tweede gast (zonder as) geweigerd (vol)', await waitGuest(x1, () => window.__guest?.reason === 'full') );
console.log('  melding:', (await guestState(x1)).msg);
await x1.close();
let x2 = await openGuest('extra-juul', code, 'juul');
check('1-gast-spel: as=juul geweigerd (noplayer)', await waitGuest(x2, () => window.__guest?.reason === 'noplayer'));
console.log('  melding:', (await guestState(x2)).msg);
await x2.close();
// gast 1 gaat weg: status lost, daarna weer waiting-vrij
await g1.evaluate(() => window.__guest.leave()); await g1.waitForTimeout(300);
check('gast 1 weg => host status lost', await waitHost(() => window.__app.net.status === 'lost', null, 20000));
check('gast 1 weg => input.online=false', await host.evaluate(() => window.__app.input.online === false));
await g1.close();

console.log('== Scenario 2: 1 host + 2 gasten ==');
// engine-shim als input.js het nieuwe contract (all/setRemote(id,..)) nog niet heeft
const engine = await host.evaluate(() => {
  const I = window.__app.input; const real = Array.isArray(I.all);
  window.__rec = { calls: [], clears: [] };
  const blank = () => ({ x: 0, y: 0, up: false, down: false, left: false, right: false, a: false, b: false });
  if (!real) {
    I.all = [I.p[0], I.p[1], blank()];
    I.setRemote = (id, st, keys) => { window.__rec.calls.push([id, keys]); I.all[id] = Object.assign(blank(), st); };
    I.clearRemote = (id) => { window.__rec.clears.push(id); I.all[id] = blank(); };
  } else {
    const so = I.setRemote.bind(I), co = I.clearRemote.bind(I);
    I.setRemote = (id, st, keys) => { window.__rec.calls.push([id, keys]); return so(id, st, keys); };
    I.clearRemote = (id) => { window.__rec.clears.push(id); return co(id); };
  }
  return real ? 'echt' : 'SHIM (input.js heeft het nieuwe contract nog niet)';
});
console.log('  engine:', engine);
// online-dialoog (src/net/online_ui.js)
await host.evaluate(async () => { const m = await import('/src/net/online_ui.js'); window.__closed = false; m.openOnline(window.__app, () => { window.__closed = true; }); });
await host.waitForTimeout(400);
const dlg = () => host.evaluate(() => document.querySelector('#screens .card')?.innerText || '');
let d = await dlg();
check('dialoog toont de code en 1 gast (Jor)', d.includes(code) && d.includes('Jor') && !d.includes('Juul-link'));
check('dialoog: waarschuwing localhost', d.includes('Let op: dit spel draait op jouw eigen computer'));
await host.evaluate(() => [...document.querySelectorAll('#screens .btn')].find((b) => b.textContent.includes("Met z'n tweeën")).click()); await host.waitForTimeout(300);
check('dialoog: "Met z\'n drieën" zet players=3', await host.evaluate(() => window.__app.S.settings.players === 3 && window.__app.net.maxGuests === 2));
d = await dlg();
check('dialoog toont Jor- en Juul-link met as=', d.includes('as=jor') && d.includes('as=juul') && d.includes('Juul-link kopiëren') && d.includes('⏳'));

const A = await openGuest('gastA', code, 'jor');
check('host: Jor (A, as=jor) verbonden', await waitHost(() => window.__app.net.guestInfo()[0].status === 'connected'));
check('A kreeg id 1 Jor', (await guestState(A)).id === 1);
// dubbele as: Jor bestaat al (levend)
const dup = await openGuest('dup-jor', code, 'jor');
check('as=jor dubbel => geweigerd (taken)', await waitGuest(dup, () => window.__guest?.reason === 'taken'));
console.log('  melding:', (await guestState(dup)).msg);
check('dubbele as: eerste gast blijft verbonden', (await hostInfo()).startsWith('1:connected'));
await dup.close();
// zonder as: eerstvolgende vrije plek => Juul
const B = await openGuest('gastB', code, '');
check('host: B (zonder as) kreeg plek 2 = Juul', await waitHost(() => window.__app.net.guestInfo()[1].status === 'connected'));
check('B kreeg id 2 Juul', (await guestState(B)).id === 2 && (await guestState(B)).name === 'Juul');
check('B label "Je speelt als Juul"', (await label(B)).includes('Je speelt als Juul'));
check('status connected (host)', await host.evaluate(() => window.__app.net.status === 'connected' && window.__app.net.allConnected));
const [vA, vB] = await Promise.all([hasVideo(A), hasVideo(B)]);
check('gast A: video', vA); check('gast B: video', vB);
const aud = [await A.evaluate(() => document.querySelector('video').srcObject?.getAudioTracks().length), await B.evaluate(() => document.querySelector('video').srcObject?.getAudioTracks().length)];
check('gast A en B krijgen ook een audiospoor', aud[0] === 1 && aud[1] === 1, JSON.stringify(aud));
d = await dlg();
check('dialoog: beide gasten ✅ en "Klaar — spelen maar!"', (d.match(/✅/g) || []).length >= 2 && d.includes('Klaar — spelen maar!'));
// derde gast
const C = await openGuest('gastC', code, '');
check('derde gast geweigerd (vol)', await waitGuest(C, () => window.__guest?.reason === 'full'));
console.log('  melding:', (await guestState(C)).msg);
await C.close();
const C2 = await openGuest('gastC2', code, 'juul');
check('as=juul dubbel geweigerd (taken)', await waitGuest(C2, () => window.__guest?.reason === 'taken'));
await C2.close();
check('beide gasten blijven verbonden na weigeringen', (await hostInfo()) === '1:connected 2:connected');
// UI-snapshots naar beide
await host.evaluate(() => window.__app.ui.hud.toast('Hallo allemaal!', 6000)); await A.waitForTimeout(1500);
check('UI-snapshot bij A', await A.evaluate(() => document.getElementById('hud').innerText.includes('Hallo allemaal')));
check('UI-snapshot bij B', await B.evaluate(() => document.getElementById('hud').innerText.includes('Hallo allemaal')));
// toetsen: A -> speler 1, B -> speler 2
await A.keyboard.down('ArrowRight'); await A.keyboard.down('KeyW');
let s1 = await until(1, (s) => s.x > 0.3 && s.up), s2 = await pst(2);
check('A: pijl rechts + W => all[1] rechts/omhoog', s1.x > 0.3 && s1.up, JSON.stringify(s1));
check('A: all[2] blijft stil', s2.x === 0 && s2.y === 0 && !s2.a);
await A.keyboard.up('ArrowRight'); await A.keyboard.up('KeyW');
await B.keyboard.down('KeyL'); await B.keyboard.down('KeyU'); await B.keyboard.down('KeyO');
s2 = await until(2, (s) => s.x > 0.3 && s.a && s.b); s1 = await until(1, quiet);
check('B: L (IJKL) + U + O => all[2] rechts, A en B', s2.x > 0.3 && s2.right && s2.a && s2.b, JSON.stringify(s2));
check('B: all[1] blijft stil', s1.x === 0 && s1.y === 0 && !s1.a && !s1.b, JSON.stringify(s1));
await B.keyboard.up('KeyL'); await B.keyboard.up('KeyU'); await B.keyboard.up('KeyO');
await B.keyboard.down('ShiftRight'); await B.keyboard.down('Enter');
s2 = await until(2, (s) => s.a && s.b); check('B: Shift = B, Enter = A', s2.a && s2.b, JSON.stringify(s2));
await B.keyboard.up('ShiftRight'); await B.keyboard.up('Enter');
await A.keyboard.down('KeyF'); s1 = await until(1, (s) => s.a); check('A: F = actie A', s1.a, JSON.stringify(s1)); await A.keyboard.up('KeyF');
// dialoog sluiten met "Klaar"
await host.evaluate(() => [...document.querySelectorAll('#screens .btn')].find((b) => b.textContent.includes('Klaar')).click()); await host.waitForTimeout(300);
check('dialoog "Klaar" sluit en roept onClose aan', await host.evaluate(() => window.__closed === true && !document.querySelector('#screens .card')));
await A.screenshot({ path: '/tmp/net_guestA.png' }); await B.screenshot({ path: '/tmp/net_guestB.png' });
// herladen van A (zelfde tabblad-token): moet de oude verbinding vervangen i.p.v. "taken"
await A.reload(); await A.click('#gjoin');
check('A herladen => vervangt eigen oude verbinding', await waitGuest(A, () => window.__guest?.id === 1 && window.__guest.state !== 'ended'));
check('A herladen: video weer binnen', await hasVideo(A));
check('na herladen beide verbonden', await waitHost(() => window.__app.net.allConnected));
// B valt weg: A speelt door
const t0 = Date.now();
await B.close({ runBeforeUnload: true });
check('B weg => Juul "lost" op host', await waitHost(() => window.__app.net.guestInfo()[1].status === 'lost', null, 40000), `(na ${Math.round((Date.now() - t0) / 1000)} s)`);
check('B weg => Jor nog connected, status connected', (await hostInfo()) === '1:connected 2:lost' && await host.evaluate(() => window.__app.net.status === 'connected' && window.__app.input.online === true));
check('B weg => clearRemote(2) aangeroepen', await host.evaluate(() => window.__rec.clears.includes(2)));
check('B weg => all[2] leeg', (await pst(2)).x === 0 && !(await pst(2)).a);
await A.keyboard.down('ArrowRight');
check('A speelt door na wegvallen B', (await until(1, (s) => s.x > 0.3)).x > 0.3);
await A.keyboard.up('ArrowRight');
// B komt terug (nieuw tabblad, as=juul)
const B2 = await openGuest('gastB2', code, 'juul');
check('Juul komt terug (as=juul)', await waitHost(() => window.__app.net.allConnected));
check('Juul terug: video', await hasVideo(B2));
await B2.keyboard.down('KeyD');
check('Juul terug: toetsen werken (all[2])', (await until(2, (s) => s.x > 0.3)).x > 0.3); await B2.keyboard.up('KeyD');
// host zet terug naar 2 spelers: Juul krijgt nette melding, Jor blijft
await host.evaluate(() => { window.__app.S.settings.players = 2; window.__app.net.refresh(); });
check('terug naar 2 spelers: Juul weggestuurd (kicked)', await waitGuest(B2, () => window.__guest?.reason === 'kicked'));
check('terug naar 2 spelers: Jor blijft', (await hostInfo()) === '1:connected');
await host.evaluate(() => { window.__app.S.settings.players = 2; });

console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
console.log(fails.length ? `\n${fails.length} van ${nCheck} controles MISLUKT:\n - ` + fails.join('\n - ') : `\nALLE ${nCheck} CONTROLES OK`);
await browser.close(); server.close(); ps.close?.(); process.exit(fails.length ? 1 : 0);

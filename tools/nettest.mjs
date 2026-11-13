// Test van online spelen: lokale PeerJS-server + host-pagina + gast-pagina's in één browser.
// Scenario 1: 1 host + 1 gast (regressie). Scenario 2: 1 host + 2 gasten (Jor en Juul), as=-toewijzing, conflicten,
// weigering van een derde gast, wegvallen/terugkomen van één gast, online-dialoog.
// Scenario 3: 1 host + 3 gasten (Jor, Juul, Sam; Gamehal): Sam geweigerd in de gewone versie, links relatief aan de pagina, "alle links
// kopiëren", plekken + dubbele as, beeld/geluid naar alle drie, zuiniger stream-instelling bij 3 gasten (en weer scherper als er één wegvalt),
// toetsen van alle drie (ook zichtbaar in de Speelhal-wereld), wegvallen/terugkomen van Sam, terug naar minder spelers.
// Opstarten:  PEER_DIR=<map met node_modules/peer> node tools/nettest.mjs   (npm i peer; zie ook CHROME= voor een andere Chromium)
// Let op: dit is WebRTC binnen één browser op één machine; echte verbindingen tussen verschillende machines/netwerken zijn hier niet mee getest.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
// Lokale PeerJS-signaalserver: npm-pakket "peer" zoeken (PEER_DIR=map met node_modules/peer, anders /tmp/t3, anders gewoon require)
let PeerServer;
for (const dir of [process.env.PEER_DIR, '/tmp/t3', process.cwd()].filter(Boolean)) { try { ({ PeerServer } = createRequire(path.join(dir, '/')) ('peer')); break; } catch (e) { /* volgende */ } }
if (!PeerServer) { console.error('Pakket "peer" niet gevonden: voer uit  mkdir /tmp/t3 && cd /tmp/t3 && npm i peer  (of zet PEER_DIR)'); process.exit(2); }
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((f) => f && fs.existsSync(f));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const ps = PeerServer({ port: 9123, path: '/', host: '127.0.0.1' });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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
const waitGuest = (p, fn, t = 60000) => p.waitForFunction(fn, null, { timeout: t }).then(() => true).catch(() => false);
const label = (p) => p.evaluate(() => [...document.body.children].map((e) => e.textContent).filter((t) => t.includes('Je speelt als')).join('|'));

// ---------- host ----------
let host = await hostCtx.newPage(); hook('host', host);
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
async function until(i, fn) { let s; for (let n = 0; n < 100; n++) { s = await pst(i); if (fn(s)) return s; await host.waitForTimeout(200); } return s; }
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


// De wereld: loopt ieder zijn eigen personage in de Speelhal, en beweegt het beeld bij de gasten? (host staat op 4 spelers, gasten = [Jor, Juul, Sam])
async function worldTest(hostPage, [gJ, gU, gS], tag) {
  const world = await hostPage.evaluate(async () => { try { await window.__app.goArcade({}); } catch (e) { return 'fout: ' + e.message; } await new Promise((r) => setTimeout(r, 3000)); const m = window.__app.mode; return m && m.players ? m.players.length : 'geen players'; });
  console.log(`  [${tag}] Speelhal-wereld, aantal personages:`, world);
  if (world !== 4) { console.log('  (overgeslagen: de Speelhal-wereld heeft hier geen 4 personages; alleen toetsen/beeld getest)'); return false; }
  const pos = () => hostPage.evaluate(() => window.__app.mode.players.map((p) => [p.x, p.z]));
  const p0 = await pos();
  await gJ.keyboard.down('ArrowRight'); await gU.keyboard.down('KeyI'); await gS.keyboard.down('KeyA');
  let p1b = await pos();
  for (let n = 0; n < 40; n++) { await hostPage.waitForTimeout(250); p1b = await pos(); if ([1, 2, 3].every((i) => Math.hypot(p1b[i][0] - p0[i][0], p1b[i][1] - p0[i][1]) > 0.5)) break; }   // onder load kan dit even duren
  await gJ.keyboard.up('ArrowRight'); await gU.keyboard.up('KeyI'); await gS.keyboard.up('KeyA');
  const mv = p0.map((a0, i) => Math.hypot(p1b[i][0] - a0[0], p1b[i][1] - a0[1]));
  console.log('  verplaatsing per speler (host,Jor,Juul,Sam):', mv.map((v) => v.toFixed(2)).join(' '));
  check(`[${tag}] Speelhal: Jor, Juul en Sam lopen elk met hun eigen personage (host-personage staat stil)`, mv[1] > 0.5 && mv[2] > 0.5 && mv[3] > 0.5 && mv[0] < 0.1, mv.map((v) => v.toFixed(2)).join(' '));
  // beeld bij de gasten beweegt echt (twee momentopnames van de video verschillen)
  const diff = (pg) => pg.evaluate(async () => { const v = document.querySelector('video'); const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d'); const grab = () => { x.drawImage(v, 0, 0, 160, 90); return x.getImageData(0, 0, 160, 90).data; }; const a = grab(); await new Promise((r) => setTimeout(r, 900)); const b = grab(); let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n; });
  await gJ.keyboard.down('ArrowLeft'); await gU.keyboard.down('KeyK'); await gS.keyboard.down('KeyD');
  const diffs = await Promise.all([gJ, gU, gS].map(diff));
  await gJ.keyboard.up('ArrowLeft'); await gU.keyboard.up('KeyK'); await gS.keyboard.up('KeyD');
  check(`[${tag}] beeld bij alle drie gasten verandert terwijl ze lopen`, diffs.every((n) => n > 20), JSON.stringify(diffs));
  return true;
}

// =====================================================================================================================
console.log('== Scenario 3: 1 host + 3 gasten (Jor, Juul, Sam) ==');
// opruimen van scenario 2: A (Jor) gaat weg
await A.evaluate(() => window.__guest.leave()); await A.waitForTimeout(300);
await waitHost(() => window.__app.net.guestInfo()[0].status !== 'connected', null, 20000); await A.close();
check('input.js kent 4 spelers', await host.evaluate(() => window.__app.input.all.length === 4));
// 3a. gewone versie (geen GAMEHAL) met players=4: nog steeds maximaal 2 gasten, Sam wordt netjes geweigerd
await host.evaluate(() => { window.__app.S.settings.players = 4; window.__app.net.refresh(); });
check('gewone versie, 4 spelers: maxGuests = 2 (Sam kan niet)', await host.evaluate(() => window.__app.net.maxGuests === 2 && window.__app.net.guestInfo().length === 2));
let sNo = await openGuest('sam-gewone-versie', code, 'sam');
check('gewone versie: as=sam geweigerd (noplayer)', await waitGuest(sNo, () => window.__guest?.reason === 'noplayer'));
console.log('  melding:', (await guestState(sNo)).msg); await sNo.close();
// 3b. Gamehal aan (host en gasten)
await host.evaluate(() => { window.GAMEHAL = true; }); await guestCtx.addInitScript(() => { window.GAMEHAL = true; });
check('Gamehal, 4 spelers: maxGuests = 3', await host.evaluate(() => window.__app.net.maxGuests === 3 && window.__app.net.guestInfo().map((g) => g.name).join() === 'Jor,Juul,Sam'));
check('welcome meldt 4 spelers', await host.evaluate(() => window.__app.net.players === 4));
// links relatief aan de huidige pagina (index.html -> index.html, gamehal.html -> gamehal.html)
const links = await host.evaluate(() => { const n = window.__app.net, o = {}; o.idx = n.link('sam'); history.replaceState(null, '', '/gamehal.html?x=1#y'); o.gh = n.link('sam'); o.ghAll = n.guestInfo().map((g) => g.link); history.replaceState(null, '', '/'); o.back = n.link(); return o; });
check('link(sam) heeft as=sam', links.idx.includes('as=sam') && /\?join=\d{6}&as=sam/.test(links.idx), links.idx);
check('links vanuit gamehal.html wijzen naar gamehal.html (zonder oude query)', /\/gamehal\.html\?join=\d{6}&as=sam/.test(links.gh) && links.ghAll.length === 3 && links.ghAll.every((l) => l.includes('/gamehal.html?join=')) && !links.gh.includes('x=1') && !links.gh.includes('#y'), links.gh);
// dialoog met 3 gasten
await host.evaluate(async () => { const m = await import('/src/net/online_ui.js'); window.__closed = false; m.openOnline(window.__app, () => { window.__closed = true; }); });
await host.waitForTimeout(400);
d = await dlg();
check('dialoog (Gamehal, 4 spelers): drie links met as=jor/juul/sam', d.includes('as=jor') && d.includes('as=juul') && d.includes('as=sam') && d.includes('Sam-link kopiëren') && d.includes("Met z'n vieren"), d.slice(0, 300).replace(/\n/g, ' | '));
check('dialoog: "Alle links kopiëren" aanwezig', d.includes('Alle links kopiëren'));
await host.evaluate(() => { window.__clip = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip.push(t); } }, configurable: true }); });
const clickBtn = (txt) => host.evaluate((txt) => [...document.querySelectorAll('#screens .btn')].find((b) => b.textContent.includes(txt)).click(), txt);
await clickBtn('Alle links kopiëren'); await host.waitForTimeout(200);
const clip = await host.evaluate(() => window.__clip[0] || '');
check('"Alle links kopiëren": één tekst met Jor-, Juul- en Sam-link', /Jor: .*as=jor/.test(clip) && /Juul: .*as=juul/.test(clip) && /Sam: .*as=sam/.test(clip) && clip.split('\n').length === 3, JSON.stringify(clip).slice(0, 200));
await clickBtn('Sam-link kopiëren'); await host.waitForTimeout(200);
check('"Sam-link kopiëren" kopieert alleen de Sam-link', await host.evaluate(() => /as=sam/.test(window.__clip[1] || '') && !/as=jor/.test(window.__clip[1] || '')));
// aantal gasten wisselen via de eerste knop (klik = volgende): 4 -> 2 -> 3 -> 4 spelers
const pl = () => host.evaluate(() => window.__app.S.settings.players);
const cycle = async () => { await host.evaluate(() => [...document.querySelectorAll('#screens .btn')].find((b) => /^Met z'n/.test(b.textContent.trim())).click()); await host.waitForTimeout(200); };
await cycle(); const p1 = await pl(); await cycle(); const p2 = await pl(); await cycle(); const p3 = await pl();
check('knop "aantal gasten" wisselt 4 -> 2 -> 3 -> 4 spelers (Gamehal)', p1 === 2 && p2 === 3 && p3 === 4, [p1, p2, p3].join());

// drie gasten
const J = await openGuest('jor', code, 'jor');
const Sm = await openGuest('sam', code, 'sam');
check('Sam (as=sam) kreeg id 3 en naam Sam', await waitGuest(Sm, () => window.__guest?.id === 3) && (await guestState(Sm)).name === 'Sam');
check('Sam: label "Je speelt als Sam"', (await label(Sm)).includes('Je speelt als Sam'));
const dupS = await openGuest('dup-sam', code, 'sam');
check('as=sam dubbel => geweigerd (taken)', await waitGuest(dupS, () => window.__guest?.reason === 'taken'));
await dupS.close();
const U = await openGuest('zonder-as', code, '');
check('gast zonder as krijgt de eerstvolgende vrije plek = Juul (2)', await waitGuest(U, () => window.__guest?.id === 2) && (await guestState(U)).name === 'Juul');
check('host: alle 3 verbonden', await waitHost(() => window.__app.net.allConnected && window.__app.net.connectedCount() === 3, null, 40000), await hostInfo());
const full = await openGuest('vol', code, '');
check('vierde gast geweigerd (vol)', await waitGuest(full, () => window.__guest?.reason === 'full'));
console.log('  melding:', (await guestState(full)).msg); await full.close();
check('na weigeringen nog steeds 3 verbonden', (await hostInfo()) === '1:connected 2:connected 3:connected');
d = await dlg();
check('dialoog: drie keer ✅ en "Klaar — spelen maar!"', (d.match(/✅/g) || []).length >= 3 && d.includes('Klaar — spelen maar!'));
const vids = await Promise.all([J, U, Sm].map((p) => hasVideo(p, 60000)));
check('beeld bij Jor, Juul en Sam', vids.every(Boolean), JSON.stringify(vids));
const auds = await Promise.all([J, U, Sm].map((p) => p.evaluate(() => document.querySelector('video').srcObject?.getAudioTracks().length)));
check('geluidsspoor bij alle drie', auds.every((n) => n === 1), JSON.stringify(auds));
// streamkwaliteit: 3 gasten = zuiniger per gast
const qual = () => host.evaluate(() => window.__app.net.guests.filter((g) => g.status === 'connected' && g.call).map((g) => { const e = g.call.peerConnection.getSenders().find((s) => s.track?.kind === 'video').getParameters().encodings[0]; return { id: g.id, bps: e.maxBitrate, fps: e.maxFramerate, scale: e.scaleResolutionDownBy }; }));
let qs = []; for (let i = 0; i < 20; i++) { qs = await qual(); if (qs.length === 3 && qs.every((x) => x.scale === 1.5)) break; await host.waitForTimeout(500); }
check('3 gasten: elke stream 1,5x kleiner, 25 fps, 1,6 Mbit/s', qs.length === 3 && qs.every((x) => x.scale === 1.5 && x.fps === 25 && x.bps === 1600000), JSON.stringify(qs));
const dims = await Promise.all([J, U, Sm].map((p) => p.evaluate(() => [document.querySelector('video').videoWidth, document.querySelector('video').videoHeight])));
const hostW = await host.evaluate(() => window.__app.net.comp.width);
console.log('  host-canvas', hostW, 'breed; gastvideo (b,h):', JSON.stringify(dims));
check('gastbeeld ligt rond host-breedte / 1,5', dims.every(([w]) => w > 0 && w <= hostW / 1.5 + 8), JSON.stringify(dims));
// toetsen van alle drie
await J.keyboard.down('ArrowRight'); await U.keyboard.down('KeyL'); await U.keyboard.down('KeyU'); await Sm.keyboard.down('KeyW'); await Sm.keyboard.down('KeyG');
const [t1, t2, t3] = [await until(1, (s) => s.x > 0.5), await until(2, (s) => s.x > 0.5 && s.a), await until(3, (s) => s.up && s.b)];
check('Jor: pijl rechts => all[1]', t1.x > 0.5 && !t1.a, JSON.stringify(t1));
check('Juul: L + U => all[2]', t2.x > 0.5 && t2.a, JSON.stringify(t2));
check('Sam: W + G => all[3] omhoog + B', t3.up && t3.b && t3.x === 0, JSON.stringify(t3));
check('geen overspraak: Jor heeft geen a, Sam geen x', !t1.a && !t1.up && t3.x === 0 && !t3.a);
await J.keyboard.up('ArrowRight'); await U.keyboard.up('KeyL'); await U.keyboard.up('KeyU'); await Sm.keyboard.up('KeyW'); await Sm.keyboard.up('KeyG');
check('na loslaten alles stil', quiet(await until(1, quiet)) && quiet(await until(2, quiet)) && quiet(await until(3, quiet)));
check('input.isRemote(1,2,3) en input.online', await host.evaluate(() => [1, 2, 3].every((i) => window.__app.input.isRemote(i)) && !window.__app.input.isRemote(0) && window.__app.input.online));
// UI-snapshots (toast) naar alle drie
await clickBtn('Klaar'); await host.waitForTimeout(300);
await host.evaluate(() => window.__app.ui.hud.toast('Hallo drie!', 7000)); await host.waitForTimeout(1800);
check('UI-snapshot bij Jor, Juul en Sam', (await Promise.all([J, U, Sm].map((p) => p.evaluate(() => document.getElementById('hud').innerText.includes('Hallo drie'))))).every(Boolean));

// (de Speelhal-wereld met 4 spelers wordt in scenario 4 getest, met de echte gamehal.html)
await Sm.screenshot({ path: '/tmp/net_guestSam.png' }); await host.screenshot({ path: '/tmp/net_host3.png' });

// Sam valt weg: Jor en Juul spelen door, zijn plek is vrij, melding, kwaliteit weer omhoog
const tS = Date.now();
await Sm.close({ runBeforeUnload: true });
check('Sam weg => Sam "lost" op host', await waitHost(() => window.__app.net.guestInfo()[2].status === 'lost', null, 40000), `(na ${Math.round((Date.now() - tS) / 1000)} s)`);
check('Sam weg => Jor en Juul blijven verbonden, status connected', (await hostInfo()) === '1:connected 2:connected 3:lost' && await host.evaluate(() => window.__app.net.status === 'connected'));
check('Sam weg => zijn toetsen losgelaten en speler 3 valt terug op lokaal (geen remote)', await host.evaluate(() => !window.__app.input.isRemote(3) && window.__app.input.isRemote(1) && window.__app.input.isRemote(2)) && quiet(await pst(3)));
check('Sam weg => melding bij host en overblijvende gasten', await host.evaluate(() => document.getElementById('hud').innerText.includes('Sam is weggevallen')) && await waitGuest(J, () => document.getElementById('hud').innerText.includes('Sam is weggevallen'), 8000));
for (let i = 0; i < 20; i++) { qs = await qual(); if (qs.length === 2 && qs.every((x) => x.scale === 1)) break; await host.waitForTimeout(500); }
check('Sam weg => overblijvende 2 streams weer 2,5 Mbit/s, 30 fps, volle resolutie', qs.length === 2 && qs.every((x) => x.scale === 1 && x.fps === 30 && x.bps === 2500000), JSON.stringify(qs));
await J.keyboard.down('ArrowRight'); await U.keyboard.down('KeyD');
check('Jor en Juul spelen door', (await until(1, (s) => s.x > 0.3)).x > 0.3 && (await until(2, (s) => s.x > 0.3)).x > 0.3);
await J.keyboard.up('ArrowRight'); await U.keyboard.up('KeyD');
// zonder as: de vrijgekomen plek (Sam) wordt vergeven
const Sm2 = await openGuest('sam-terug', code, '');
check('nieuwe gast zonder as krijgt de vrije plek = Sam', await waitGuest(Sm2, () => window.__guest?.id === 3) && (await guestState(Sm2)).name === 'Sam');
check('weer 3 verbonden + melding "Sam is terug" bij de host', await waitHost(() => window.__app.net.connectedCount() === 3, null, 30000) && await host.evaluate(() => document.getElementById('hud').innerText.includes('Sam is terug')));
check('Sam terug: beeld', await hasVideo(Sm2, 60000));
await Sm2.keyboard.down('KeyD'); check('Sam terug: toetsen werken (all[3])', (await until(3, (s) => s.right)).right); await Sm2.keyboard.up('KeyD');
for (let i = 0; i < 24; i++) { qs = await qual(); if (qs.length === 3 && qs.every((x) => x.scale === 1.5)) break; await host.waitForTimeout(500); }
check('Sam terug => weer de 3-gasten-instelling', qs.length === 3 && qs.every((x) => x.scale === 1.5), JSON.stringify(qs));
// host kiest minder gasten: Sam krijgt een nette melding, de rest blijft
await host.evaluate(() => { window.__app.S.settings.players = 3; window.__app.net.refresh(); });
check('terug naar 3 spelers: Sam weggestuurd (kicked)', await waitGuest(Sm2, () => window.__guest?.reason === 'kicked'));
check('terug naar 3 spelers: Jor en Juul blijven', (await hostInfo()) === '1:connected 2:connected');
await host.evaluate(() => { window.__app.S.settings.players = 2; });


// =====================================================================================================================
console.log('== Scenario 4: echte gamehal.html (geen GAMEHAL-vlag geïnjecteerd): host + 3 gasten ==');
for (const pg of [J, U, Sm2, host]) { try { await pg.close(); } catch (e) { /* al weg */ } }
const host4 = await hostCtx.newPage(); hook('host4', host4); host = host4;   // de helpers (waitHost, pst, ...) wijzen nu naar de gamehal-host
await host4.goto(`${base}gamehal.html?${PEER}&players=4`);
const booted = await host4.waitForFunction(() => window.__app?.mode, null, { timeout: 120000 }).then(() => true).catch(() => false);
check('gamehal.html start (lobby/mode aanwezig)', booted);
if (booted) {
  await host4.mouse.click(5, 5);
  const code4 = await host4.evaluate(() => window.__app.net.start());
  check('gamehal.html: GAMEHAL aan, 4 spelers => 3 gasten', await host4.evaluate(() => window.GAMEHAL === true && window.__app.S.settings.players === 4 && window.__app.net.maxGuests === 3));
  const l4 = await host4.evaluate(() => window.__app.net.guestInfo().map((g) => g.link));
  check('links vanuit gamehal.html wijzen naar gamehal.html', l4.length === 3 && l4.every((l) => l.includes('/gamehal.html?join=')) && l4[2].includes('as=sam'), l4[2]);
  // gast zonder as: keuzelijst bevat Sam (Gamehal) en kiest Sam
  const gq = await guestCtx.newPage(); hook('gast-keuze', gq); opened.push(gq);
  await gq.goto(`${base}gamehal.html?join=${code4}&${PEER}`);
  await gq.waitForSelector('#gas', { timeout: 60000 }).catch(() => {});
  const opts = await gq.evaluate(() => [...document.querySelectorAll('#gas option')].map((o) => o.textContent));
  check('gast-pagina (gamehal.html) biedt Jor, Juul én Sam aan, titel Impactid Gamehal', opts.length === 4 && opts.some((t) => t.includes('Sam')) && (await gq.evaluate(() => document.body.innerText.includes('Impactid Gamehal'))), JSON.stringify(opts));
  await gq.selectOption('#gas', '3'); await gq.click('#gjoin');
  const g4J = await guestCtx.newPage(); hook('gast4-jor', g4J); await g4J.goto(l4[0]); await g4J.click('#gjoin');
  const g4U = await guestCtx.newPage(); hook('gast4-juul', g4U); await g4U.goto(l4[1]); await g4U.click('#gjoin');
  check('gamehal: Sam (gekozen), Jor en Juul verbonden met de juiste id\'s', await waitHost(() => window.__app.net.connectedCount() === 3, null, 60000) && (await guestState(gq)).id === 3 && (await guestState(g4J)).id === 1 && (await guestState(g4U)).id === 2, await host4.evaluate(() => window.__app.net.guestInfo().map((g) => g.id + ':' + g.status).join(' ')) + ' | ' + JSON.stringify([await guestState(g4J), await guestState(g4U), await guestState(gq)]));
  check('gamehal: beeld bij alle drie', (await Promise.all([g4J, g4U, gq].map((pg) => hasVideo(pg, 60000)))).every(Boolean));
  const p4 = (i) => host4.evaluate((i) => { const s = window.__app.input.all[i]; return { x: s.x, y: s.y, a: !!s.a }; }, i);
  await gq.keyboard.down('KeyD'); await gq.keyboard.down('KeyF');
  let st = null; for (let n = 0; n < 40; n++) { st = await p4(3); if (st.x > 0.5 && st.a) break; await host4.waitForTimeout(250); }
  check('gamehal: Sam (WASD/F op eigen apparaat) => input.all[3]', st.x > 0.5 && st.a, JSON.stringify(st));
  await gq.keyboard.up('KeyD'); await gq.keyboard.up('KeyF');
  await worldTest(host4, [g4J, g4U, gq], 'gamehal.html');
  await gq.screenshot({ path: '/tmp/net_gamehal_sam.png' }); await host4.screenshot({ path: '/tmp/net_gamehal_host.png' });
  // Juul klapt dicht: de rest speelt door
  await g4U.close({ runBeforeUnload: true });
  check('gamehal: Juul weg => lost, Jor en Sam blijven', await waitHost(() => window.__app.net.guestInfo()[1].status === 'lost', null, 40000) && (await host4.evaluate(() => window.__app.net.guestInfo().map((g) => g.status).join())) === 'connected,lost,connected');
}

console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
console.log(fails.length ? `\n${fails.length} van ${nCheck} controles MISLUKT:\n - ` + fails.join('\n - ') : `\nALLE ${nCheck} CONTROLES OK`);
await browser.close(); server.close(); ps.close?.(); process.exit(fails.length ? 1 : 0);

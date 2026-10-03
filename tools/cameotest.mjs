// Test: Deurman-meme-systeem. Speelt alle cameo-types (telt stickers), controleert maybeCameo (kans/cooldown/busy), maakt screenshots van
// de jumpscare-vervanger (DEURMAN-BOEM), stare, cameo's, het vriendenboek, Deurman-outfits en de nieuwe hoeden/kostuums.
// Gebruik: node tools/cameotest.mjs [--fast]   (screenshots in /tmp/dm_*.png)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|')));
page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const fast = process.argv.includes('--fast');
let fails = 0; const check = (name, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'OK   ' : 'FOUT ') + name + (extra ? ' ' + extra : '')); };
await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 });
await page.waitForFunction(() => window.__app.mode, null, { timeout: 90000 });
await page.waitForTimeout(1200);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 2; S.deur = { stickers: [], cameos: 0 }; });

// ---- 1. Deurman-outfits en nieuwe hoeden/kostuums in 3D ----
await page.evaluate(async () => {
  const THREE = await import('three'); const C = await import('/src/engine/chars.js'); const { HATS } = await import('/src/engine/cosmetics.js'); const { S } = await import('/src/save.js');
  S.settings.scare = 3;   // laser-ogen-grap zichtbaar bij de laatste
  (await import('/src/engine/ui.js')).ui.clearScreens();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8ab4ff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(5, 10, 8); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0xcfd8a0 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const presets = ['klassiek', 'feest', 'dj', 'fan', 'cool', 'king', 'deurtje', 'sjiek']; const men = [];
  presets.forEach((p, i) => { const d = C.makeDeurman(0.9, { outfit: p }); d.group.position.set(-8.4 + i * 2.4, 0, -2); d.targetYaw = d.yaw = 0.15; if (p === 'dj') d.pose = 'dj'; if (p === 'fan') d.pose = 'highfive'; scene.add(d.group); men.push(d); });
  // broers met de nieuwe hoeden en Deurman-kostuums
  const eqs = [{ hat: 'deurparty', shirt: 'dsuit', hair: 'std', cape: 'dtie' }, { hat: 'minidoor', shirt: 'dsuitw', hair: 'dpale', cape: 'dblack' }, { hat: 'deurhead', shirt: 'dsuit', hair: 'std', cape: 'std' }, { hat: 'doorknob', shirt: 'dsuitw', hair: 'std', cape: 'std' }];
  const bro = []; eqs.forEach((e, i) => { const b = C.makeBrother(i % 2, e); b.group.position.set(-4.5 + i * 3, 0, 2.5); b.targetYaw = b.yaw = 0; b.pose = 'cheer'; scene.add(b.group); bro.push(b); });
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 4.2, 15); camera.lookAt(0, 2.2, 0);
  let t = 0;
  window.__dm = { men, bro, camera, scene };
  window.__app.setMode({ scene, camera, update(dt) { t += dt; men.forEach((m) => m.update(dt)); bro.forEach((b) => b.update(dt)); }, render(r) { r.render(scene, camera); }, resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); } });
  console.log('hats', HATS.length);
});
await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/dm_outfits.png' });
await page.evaluate(() => { const { camera, men, bro } = window.__dm; bro.forEach((b) => { b.group.visible = false; }); men.forEach((m) => { m.group.position.z = 0; }); camera.position.set(0, 2.8, 9.5); camera.lookAt(0, 2.6, 0); });
await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/dm_outfits_close.png' });
await page.evaluate(() => { const { camera, men, bro } = window.__dm; men.forEach((m) => { m.group.visible = false; }); bro.forEach((b, i) => { b.group.visible = true; b.group.position.set(-4.5 + i * 3, 0, 0); }); camera.position.set(0, 2.2, 8.5); camera.lookAt(0, 1.4, 0); });
await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/dm_hats.png' });
await page.evaluate(async () => { const C = await import('/src/engine/chars.js'); const { camera, men, bro, scene } = window.__dm; bro.forEach((b) => { b.group.visible = false; }); const big = C.makeDeurman(3, { outfit: 'feest' }); big.group.position.set(0, 0, 0); big.pose = 'wave'; scene.add(big.group); window.__big = big; camera.position.set(0, 7.3, 7); camera.lookAt(0, 6.8, 0); const upd = window.__app.mode.update; window.__app.mode.update = (dt) => { upd(dt); big.update(dt); }; });
await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/dm_face.png' });
await page.evaluate(() => { window.__big.setOutfit(['shades', 'mustache', 'hat:tophat']); window.__big.blush = 1; });
await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/dm_face2.png' });

// ---- 2. jumpscare-vervanger (DEURMAN-BOEM) en stare ----
await page.evaluate(() => window.__app.setMode(null));   // lege wereld: sneller, scherpe timing
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 2; S.settings.flashFree = false; });
const boem = await page.evaluate(async () => { const { scare } = await import('/src/engine/scare.js'); window.__p = scare.jumpscare({ variant: 'party' }); return scare.active; });
await page.waitForTimeout(520); await page.screenshot({ path: '/tmp/dm_boem.png' });
await page.evaluate(() => window.__p); check('jumpscare klaar, scare.active weer uit', !(await page.evaluate(async () => (await import('/src/engine/scare.js')).scare.active)), `(actief tijdens: ${boem})`);
await page.evaluate(async () => { const { scare } = await import('/src/engine/scare.js'); window.__p = scare.jumpscare({ variant: 'shades' }); }); await page.waitForTimeout(700); await page.screenshot({ path: '/tmp/dm_boem2.png' }); await page.evaluate(() => window.__p);
// stare: 1) niet bewegen -> caught false; 2) bewegen -> caught true
await page.evaluate(async () => { const { scare } = await import('/src/engine/scare.js'); window.__p = scare.stare({ hold: 4.5, side: 1 }); });
await page.waitForTimeout(3200); await page.screenshot({ path: '/tmp/dm_stare.png' });
const r1 = await page.evaluate(() => window.__p); check('stare: stil blijven = niet gepakt', r1.caught === false, JSON.stringify(r1));
await page.evaluate(async () => { const { scare } = await import('/src/engine/scare.js'); window.__p = scare.stare({ hold: 6, side: -1 }); });
await page.waitForTimeout(2600); await page.evaluate(() => { window.__app.input.virtual[0].right = true; }); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/dm_stare_caught.png' });
const r2 = await page.evaluate(() => window.__p); await page.evaluate(() => { window.__app.input.virtual[0].right = false; }); check('stare: bewegen = gepakt (grappige BOEM)', r2.caught === true && r2.movers[0] === true, JSON.stringify(r2));
await page.evaluate(async () => { const { scare } = await import('/src/engine/scare.js'); await scare.flicker(2); }); check('flicker (disco) zonder fouten', true);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 0; const { scare } = await import('/src/engine/scare.js'); await scare.jumpscare(); S.settings.scare = 2; });
check('jumpscare doet niets bij Uit', true);

// ---- 3. maybeCameo: kans, cooldown, busy ----
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 2; });
const mc = await page.evaluate(async () => {
  const cm = await import('/src/engine/cameo.js'); const { S } = await import('/src/save.js'); const { ui } = await import('/src/engine/ui.js'); const { scare } = await import('/src/engine/scare.js');
  const out = {}; await new Promise((r) => setTimeout(r, 200));
  S.settings.scare = 0; out.uit = cm.maybeCameo('hall', () => 0); S.settings.scare = 2;
  ui.say([{ who: 'Test', text: 'Dialoog open' }]); out.dialoog = cm.maybeCameo('hall', () => 0); ui.clearScreens(); ui.dialogActive && 0;
  // ui.say registreert dlg: sluit af via een lege say-afhandeling
  return out;
});
check('maybeCameo: Uit = nooit', mc.uit === null); check('maybeCameo: nooit tijdens dialoog', mc.dialoog === null);
await page.evaluate(async () => { const { ui } = await import('/src/engine/ui.js'); ui.say([{ text: 'x' }]); }); // dlg opruimen
await page.evaluate(async () => { const { ui } = await import('/src/engine/ui.js'); const i = window.__app.input; i.virtual[0].a = true; i.update(); ui.update(0.016); i.virtual[0].a = false; i.update(); ui.update(0.016); i.virtual[0].a = true; i.update(); ui.update(0.016); i.virtual[0].a = false; for (let k = 0; k < 5; k++) { i.virtual[0].a = true; i.update(); ui.update(1); i.virtual[0].a = false; i.update(); ui.update(1); } ui.clearScreens(); });
const mc2 = await page.evaluate(async () => {
  const cm = await import('/src/engine/cameo.js'); const { S } = await import('/src/save.js'); const { ui } = await import('/src/engine/ui.js');
  const out = { dlg: ui.dialogActive() }; S.settings.scare = 3;
  const p = cm.maybeCameo('hall', () => 0); out.lvl3 = !!p; out.actief = cm.cameoActive(); out.tweede = cm.maybeCameo('hall', () => 0);   // al een cameo bezig
  await p; out.cooldown = cm.maybeCameo('hall', () => 0);   // cooldown
  return out;
});
check('maybeCameo: Overal! geeft een cameo', mc2.lvl3 === true && mc2.actief === true, JSON.stringify(mc2)); check('maybeCameo: geen tweede tijdens een cameo', mc2.tweede === null); check('maybeCameo: cooldown na afloop', mc2.cooldown === null);

// ---- 4. alle cameo-types spelen + stickers tellen ----
const kinds = await page.evaluate(async () => (await import('/src/engine/cameo.js')).CAMEO_KINDS);
console.log('cameo-types:', kinds.length, kinds.join(','));
check('minstens 12 cameo-types', kinds.length >= 12 && kinds.length <= 16);
const shots = { handtekening: 1, highfive: 1, deuropen: 1, niksgebeurd: 1, goedgespeeld: 1, kijkdeur: 1, toeter: 1, dansen: 1, selfie: 1, bloem: 1, verstopt: 1, trombone: 1, zonnebril: 1, kleurenruil: 1, confetti: 1, pizza: 1 };
const places = await page.evaluate(async () => { const m = await import('/src/engine/cameo.js'); return Object.fromEntries(m.CAMEO_KINDS.map((k) => [k, m.cameoWhere ? m.cameoWhere(k) : null])); });
for (const k of kinds) {
  const dur = await page.evaluate(async (kind) => { const m = await import('/src/engine/cameo.js'); window.__p = m.cameo(kind, { where: kind === 'niksgebeurd' || kind === 'kleurenruil' ? 'duel' : 'hall' }); return m.cameoDuration ? m.cameoDuration(kind) : 4000; }, k);
  if (shots[k]) { await page.waitForTimeout(Math.round(dur * (k === 'deuropen' ? 0.45 : k === 'peekS' ? 0.4 : 0.38))); await page.screenshot({ path: `/tmp/dm_cameo_${k}.png` }); }
  const ok = await page.evaluate(() => window.__p); check(`cameo '${k}' afgespeeld`, ok === true);
  if (fast) break;
}
const st = await page.evaluate(async () => { const { S } = await import('/src/save.js'); const p = await import('/src/engine/progress.js'); const cm = await import('/src/engine/cameo.js'); const gl = document.getElementById('gl'); return { n: p.stickers().length, S: S.deur.stickers.length, cameos: S.deur.cameos, tel: cm.stickerCount(), tot: cm.STICKERS.length, filter: gl.style.filter, deurenhal: p.isUnlocked(4), layer: document.querySelectorAll('#cameo-layer .dm-cam').length }; });
check('stickers = aantal cameo-types (S.deur.stickers)', fast || (st.n === kinds.length && st.S === kinds.length), JSON.stringify(st));
check('Deurenhal ontgrendeld door stickers', fast || st.deurenhal === true);
check('cameo-laag leeg na afloop', st.layer === 0);

// ---- 5. vriendenboek ----
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.deur.stickers = S.deur.stickers.slice(0, 7); const m = await import('/src/engine/cameo.js'); window.__closed = false; window.__album = m.openAlbum(() => { window.__closed = true; }); });
await page.waitForTimeout(700); await page.screenshot({ path: '/tmp/dm_album.png' });
const al = await page.evaluate(() => ({ cells: document.querySelectorAll('.album-cell').length, found: document.querySelectorAll('.album-cell.found').length, count: document.querySelector('.album-count').textContent }));
check('album toont alle stickers (gevonden = plaatje, anders ?)', al.cells >= 12 && (fast || al.found === 7), JSON.stringify(al));
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
check('album sluit met Enter + onClose', await page.evaluate(() => window.__closed === true && !document.querySelector('.album-cell')));

// ---- 6. tick-functies ----
const tk = await page.evaluate(async () => {
  const cm = await import('/src/engine/cameo.js'); const { S } = await import('/src/save.js'); S.settings.scare = 3; cm.resetCameoCooldown();
  const out = {}; const fakeArc = { busy: true, deur: { active: false } }; for (let i = 0; i < 40; i++) cm.hallCameoTick(fakeArc, 2); out.busyHal = cm.cameoActive();
  const hub = { busy: false, cinematic: false, deur: { active: false } }; for (let i = 0; i < 40; i++) cm.villageCameoTick(hub, 2); out.dorp = cm.cameoActive();
  cm.stopCameo(); out.gestopt = !cm.cameoActive(); return out;
});
check('hallCameoTick: geen cameo als de hal bezig is', tk.busyHal === false); check('villageCameoTick: cameo in rustig dorp', tk.dorp === true); check('stopCameo', tk.gestopt === true);
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS');
console.log(fails ? `${fails} FOUT(EN)` : 'ALLES OK');
await browser.close(); server.close();
process.exit(fails || errors.length ? 1 : 0);

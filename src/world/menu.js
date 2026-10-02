import * as THREE from 'three';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { S, persist, hasSave, reset as resetSave } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { h, mesh, mat, glow, rand, TAU, damp } from '../engine/util.js';

const SCARE_LABELS = ['Uit (geen spoken)', 'Gezellig (zacht)', 'Eng (jumpscares)', 'Doodeng (extra veel)'];

// Instellingen-kaart. onClose() wanneer gesloten.
export function openSettings(onClose) {
  let el;
  const close = () => { ui.activeMenus = ui.activeMenus.filter((m) => m !== menu); el.remove(); persist(); onClose && onClose(); };
  const menu = new Menu([
    { label: () => `Griezelniveau: ${SCARE_LABELS[S.settings.scare]}`, cycle: true, onSelect: (d) => { S.settings.scare = (S.settings.scare + (d || 1) + 4) % 4; } },
    { label: () => `Flitsvrij: ${S.settings.flashFree ? 'AAN (geen felle flitsen)' : 'uit'}`, cycle: true, onSelect: () => { S.settings.flashFree = !S.settings.flashFree; } },
    { label: () => `Muziek: ${Math.round(S.settings.music * 10)}/10`, cycle: true, onSelect: (d) => { S.settings.music = Math.min(1, Math.max(0, S.settings.music + 0.1 * (d || 1))); audio.musicVol = S.settings.music; if (audio.musG) audio.musG.gain.value = S.settings.music * 0.5; } },
    { label: () => `Geluidseffecten: ${Math.round(S.settings.sfx * 10)}/10`, cycle: true, onSelect: (d) => { S.settings.sfx = Math.min(1, Math.max(0, S.settings.sfx + 0.1 * (d || 1))); audio.sfxVol = S.settings.sfx; if (audio.sfxG) audio.sfxG.gain.value = S.settings.sfx; audio.sfx('coin'); } },
    { label: () => `Kwaliteit: ${S.settings.quality === 'low' ? 'Laag (snel)' : 'Hoog'} (pas na herladen)`, cycle: true, onSelect: () => { S.settings.quality = S.settings.quality === 'low' ? 'high' : 'low'; } },
    { label: 'Klaar', onSelect: () => close() },
  ]);
  const card = h('div', { class: 'card', style: { width: 'min(640px,94vw)' } }, h('h2', {}, 'Instellingen'), menu.el, h('div', { class: 'small-note' }, 'Links/rechts verandert een waarde. De Deurman is gemaakt om te griezelen: kies "Gezellig" of "Uit" als je het te eng vindt.'));
  el = ui.overlay(card); ui.activeMenus.push(menu);
}
// Online spelen: jij bent de host (Daan), je broer doet mee als Sem via een link of code
export function openOnline(app, onClose) {
  const host = app.net; let el;
  const statusEl = h('p', { style: { textAlign: 'center', fontWeight: 700, fontSize: '20px' } }, 'Verbinding maken…');
  const codeEl = h('div', { style: { textAlign: 'center', fontSize: '54px', fontFamily: 'MedievalSharp,serif', letterSpacing: '6px', margin: '4px 0' } }, '······');
  const linkEl = h('div', { style: { textAlign: 'center', fontSize: '16px', wordBreak: 'break-all', background: 'rgba(255,255,255,.55)', borderRadius: '10px', padding: '8px 12px', margin: '6px 0' } }, '');
  const warnEl = h('p', { class: 'small-note' }, '');
  let copied = false;
  const copy = async () => { try { await navigator.clipboard.writeText(host.link()); copied = true; } catch (e) { copied = false; } };
  const close = () => { off(); ui.activeMenus = ui.activeMenus.filter((m) => m !== menu); el.remove(); onClose && onClose(); };
  const menu = new Menu([{ label: () => (copied ? 'Link gekopieerd ✓' : 'Link kopiëren'), onSelect: copy }, { label: () => (host.status === 'connected' ? 'Klaar — spelen maar!' : 'Terug'), onSelect: close }]);
  const render = () => {
    const st = host.status;
    statusEl.textContent = st === 'connected' ? '✅ Sem is verbonden! Jullie kunnen nu samen spelen.' : st === 'waiting' ? '⏳ Wachten tot Sem meedoet…' : st === 'lost' ? '⚠️ Sem is weggevallen. Laat hem de link opnieuw openen.' : st === 'error' ? '❌ Geen verbinding met de signaalserver. Heb je internet?' : 'Verbinding maken…';
    if (host.code) { codeEl.textContent = host.code; linkEl.textContent = host.link(); }
    const loc = location.hostname; warnEl.textContent = /^(localhost|127\.|192\.168\.|10\.|172\.)/.test(loc) ? 'Let op: dit spel draait op jouw eigen computer. Je broer kan die link alleen openen als hij op hetzelfde netwerk zit. Zet het spel online (bijv. GitHub Pages, zie README) om over internet te spelen.' : 'Stuur de link naar je broer (appen, mailen...). Hij hoeft niets te installeren: een computer met Chrome of Edge is genoeg.';
  };
  const off = host.on(render);
  const card = h('div', { class: 'card', style: { width: 'min(680px,94vw)' } }, h('h2', {}, '🌐 Online spelen'), h('p', { style: { textAlign: 'center' }, html: 'Jij bent <b>Daan</b>. Je broer speelt mee als <b>Sem</b> op zijn eigen computer.' }), codeEl, linkEl, statusEl, menu.el, warnEl);
  el = ui.overlay(card); ui.activeMenus.push(menu); render();
  host.start().then(render).catch((e) => { statusEl.textContent = '❌ ' + (e.message || 'Mislukt'); });
}
function howToPlay(onClose) {
  const card = h('div', { class: 'card' }, h('h2', {}, 'Hoe werkt het?'),
    h('p', { html: 'Daan en Sem sparen voor <b>DutchTuber LIVE</b>. Loop door het dorp, praat met de dorpelingen en doe <b>karweitjes</b> (minigames) voor <b>heitjes</b>. Verzamel <b>600</b> voor 2 kaartjes!' }),
    h('div', { class: 'ctrl' }, ...[0, 1].map((i) => h('div', { style: { '--c': i ? '#4a8cff' : '#35c46f' } }, h('h4', {}, i ? 'Sem (speler 2)' : 'Daan (speler 1)'), h('ul', {}, h('li', { html: `<kbd>${KEY_LABELS[i].move}</kbd> lopen` }), h('li', { html: `<kbd>${KEY_LABELS[i].a}</kbd> praten / springen / actie` }), h('li', { html: `<kbd>${KEY_LABELS[i].b}</kbd> lantaarn / tweede actie` }))))),
    h('p', { html: '👁️ <b>De Deurman</b> opent deuren in het dorp en tijdens de klusjes. <b>Blijf stil</b> als hij in de deur staat! Als hij je volgt: houd je lantaarn op hem gericht.' }),
    h('p', { html: '✨ Zoek de <b>8 gouden deurknoppen</b>, kisten en muntjes. <kbd>Esc</kbd> = menu · <kbd>Tab</kbd> = dagboek · <kbd>M</kbd> = geluid uit.' }),
    h('div', { class: 'small-note' }, 'Druk op een actieknop om te sluiten (gamepad werkt ook!)'));
  const el = ui.overlay(card); let t = 0.3;
  const drv = { update() { t -= 0.016; if (t < 0 && (input.p[0].aP || input.p[1].aP || input.pressed('Escape'))) { ui.activeMenus = ui.activeMenus.filter((m) => m !== drv); el.remove(); onClose && onClose(); } } };
  ui.activeMenus.push(drv);
}

export class MenuMode {
  constructor(app) {
    this.app = app; this.t = 0;
    const r = app.renderer;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 300);
    this.fx = new Particles(600, { additive: true }); this.fx.setViewportHeight(innerHeight);
    this.scene.add(this.fx.points);
    const L = setupLights(this.scene, 'dusk', { shadow: 16, center: [0, 0, 2], fogNear: 18, fogFar: 70 });
    L.sun.position.set(-14, 9, 12); L.sun.intensity = 1.6;
    const gr = mesh(new THREE.CircleGeometry(60, 40), new THREE.MeshStandardMaterial({ map: tex.grass(30, 30), color: 0xb0c8b0 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }); this.scene.add(gr);
    const path = mesh(new THREE.PlaneGeometry(3, 30), new THREE.MeshStandardMaterial({ map: tex.dirt(1, 8) }), { cast: false, pos: [0, 0.02, 8], rot: [-Math.PI / 2, 0, 0] }); this.scene.add(path);
    const house = P.houseSimple(8, 6, 3.6, { thatch: true, wall: '#d8c9a8', doorColor: 0x5a3a24 }); house.position.set(0, 0, -5); this.scene.add(house); this.door = house.userData.door; this.house = house;
    // deur is een eigen glanzend rechthoek; Deurman staat erin
    this.deur = makeDeurman(0.9); this.deur.group.position.set(0, 0, -1.9); this.scene.add(this.deur.group); this.deur.group.visible = false;
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU), d = rand(9, 40); const t = i % 3 ? P.pine(rand(5, 9)) : P.tree(rand(5, 8)); t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d - 8); if (t.position.z > 6) t.position.z -= 18; this.scene.add(t); }
    for (const [x, z] of [[-6, -3], [6, -2]]) { const l = P.lampPost(); l.position.set(x, 0, z); this.scene.add(l); }
    for (const [x, z, c] of [[-4, 3, 0xff6fa5], [4.5, 3, 0xffe14a], [-7, 6, 0xffffff]]) { const f = P.flowerPatch(c, 8, 1.2); f.position.set(x, 0, z); this.scene.add(f); }
    const m = glow(0xfff0b0, 1.6); const moon = mesh(new THREE.SphereGeometry(5, 20, 14), m, { cast: false, pos: [-22, 24, -50] }); moon.material = new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }); this.scene.add(moon);
    this.bros = [0, 1].map((i) => { const c = makeBrother(i); c.group.position.set(i ? 1.4 : -1.4, 0, 3.2); c.targetYaw = c.yaw = Math.PI + (i ? -0.2 : 0.2); this.scene.add(c.group); c.pose = 'wave'; return c; });
    this.fliesT = 0; this.doorT = 4; this.doorState = 0; this.open = 0;
    this.camera.position.set(0, 2.6, 11); this.camera.lookAt(0, 1.8, 0);
  }
  enter() {
    ui.hud.clear && (ui.hudEl.innerHTML = '');
    this.build(); audio.music('menu'); ui.fade(0, 700);
  }
  exit() { ui.activeMenus = []; ui.clearScreens(); }
  build() {
    ui.clearScreens(); ui.activeMenus = [];
    const items = [];
    if (hasSave()) items.push({ label: 'Verder spelen', sub: () => `🪙 ${S.coins} heitjes · ${Object.keys(S.jobs).length} klussen gedaan`, onSelect: () => this.go(false) });
    items.push({ label: hasSave() ? 'Nieuw spel' : 'Spel starten', onSelect: () => { if (hasSave()) { resetSave(); S.names = ['Daan', 'Sem']; } this.go(true); } });
    items.push({ label: '🌐 Online spelen (host)', sub: 'Twee apparaten, één spel', onSelect: () => { this.hide(); openOnline(this.app, () => this.show()); } });
    items.push({ label: '🌐 Meedoen met een code', onSelect: () => { location.search = '?join'; } });
    items.push({ label: 'Hoe werkt het?', onSelect: () => { this.hide(); howToPlay(() => this.show()); } });
    items.push({ label: 'Instellingen', onSelect: () => { this.hide(); openSettings(() => this.show()); } });
    this.menu = new Menu(items);
    const wrap = h('div', { class: 'menu-wrap', style: { position: 'absolute', inset: 0, justifyContent: 'flex-start', paddingTop: '4vh', pointerEvents: 'none' } },
      h('div', { class: 'title' }, 'Heitjes voor', h('br'), 'Karweitjes'),
      h('div', { class: 'subtitle' }, 'Een co-op avontuur voor twee broers — en één Deurman'),
      h('div', { style: { pointerEvents: 'auto', width: 'min(420px,92vw)', marginTop: '2vh' } }, this.menu.el),
      h('div', { class: 'small-note', style: { color: '#fff', textShadow: '0 2px 0 #000', marginTop: '14px' } }, `Daan: WASD + F/G   ·   Sem: pijltjes + Enter/Shift   ·   M = geluid`));
    this.wrap = wrap; ui.screens.append(wrap); ui.activeMenus.push(this.menu);
  }
  hide() { this.wrap.style.display = 'none'; }
  show() { this.wrap.style.display = ''; }
  async go(newGame) {
    if (this.going) return; this.going = true; ui.activeMenus = [];
    audio.sfx('powerup'); await ui.fade(1, 600);
    persist();
    await this.app.goHub({ newGame });
  }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }
  update(dt) {
    this.t += dt; const t = this.t;
    this.bros.forEach((c, i) => { c.update(dt); });
    // sfeer: de deur kraakt open, de Deurman kijkt, de broers schrikken
    this.doorT -= dt;
    if (this.doorT <= 0) { if (this.doorState === 0) { this.doorState = 1; this.doorT = 5.5; audio.sfx('creak'); this.bros.forEach((c) => (c.pose = 'scared')); } else { this.doorState = 0; this.doorT = 7 + Math.random() * 4; audio.sfx('door'); this.bros.forEach((c) => (c.pose = 'wave')); } }
    this.open = damp(this.open, this.doorState, 1.6, dt);
    this.door.userData.leaf.rotation.y = -1.9 * this.open;
    this.deur.group.visible = this.open > 0.6; this.deur.group.position.set(0, 0, -1.85); this.deur.group.rotation.y = 0; this.deur.update(dt); this.deur.group.rotation.y = 0;
    this.fliesT -= dt; if (this.fliesT < 0) { this.fliesT = 0.12; this.fx.emit(rand(-12, 12), rand(0.5, 4), rand(-6, 8), rand(-.3, .3), rand(0, .3), rand(-.3, .3), { life: 3, size: 0.15, color: 0xfff08a, gravity: 0, shrink: false }); }
    this.fx.update(dt);
    this.camera.position.x = Math.sin(t * 0.2) * 1.6; this.camera.position.y = 2.6 + Math.sin(t * 0.3) * 0.25; this.camera.lookAt(0, 1.9, 0);
    ui.setVignette(this.doorState ? 0.35 * this.open : 0);
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}

import * as THREE from 'three';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { S, persist, hasSave, reset as resetSave } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import * as P from '../engine/props.js';
import { h, rand, damp } from '../engine/util.js';
import { buildGate, partyHat } from './opening.js';
import { nPlayers, activeIds, anyP, pcss, pname, klabel, Menu3 } from './players3.js';

// Deurman-gedrag (S.settings.scare 0-3): hoe vaak de grapjas langskomt
const HY = -0.36;   // draairichting van het schuurtje (kijkt naar de camera)
const SCARE_LABELS = ['Uit (hij blijft thuis)', 'Af en toe', 'Vaak', 'Overal!'];
const SCARE_TXT = [
  'De Deurman blijft lekker thuis. Veel te rustig, maar dat mag.',
  'Af en toe staat er ineens een Deurman in een deur. Hij zwaait. Niemand weet waarom.',
  'Hij duikt geregeld op: in deuren, achter kasten en soms midden in je duel. Blijf stilstaan als hij kijkt!',
  'OVERAL DEURMANNEN! Bijna elke deur heeft er één. Dit is de chaosstand. Succes.',
];

// Instellingen-kaart. onClose() wanneer gesloten.
export function openSettings(onClose) {
  let el;
  const close = () => { ui.activeMenus = ui.activeMenus.filter((m) => m !== menu); el.remove(); persist(); onClose && onClose(); };
  const note = h('div', { class: 'small-note' }, '');
  const menu = new Menu3([
    { label: () => `Derde speler Juul: ${S.settings.players === 3 ? 'AAN (IJKL + U/O)' : 'uit'}`, cycle: true, onSelect: () => { S.settings.players = S.settings.players === 3 ? 2 : 3; persist(); } },
    { label: () => { note.textContent = SCARE_TXT[S.settings.scare] || ''; return `Deurman-gedrag: ${SCARE_LABELS[S.settings.scare]}`; }, cycle: true, onSelect: (d) => { S.settings.scare = (S.settings.scare + (d || 1) + 4) % 4; } },
    { label: () => `Flitsvrij: ${S.settings.flashFree ? 'AAN (geen felle flitsen)' : 'uit'}`, cycle: true, onSelect: () => { S.settings.flashFree = !S.settings.flashFree; } },
    { label: () => `Alles ontgrendeld: ${S.settings.unlockAll ? 'AAN (alle hallen open)' : 'uit'}`, cycle: true, onSelect: () => { S.settings.unlockAll = !S.settings.unlockAll; } },
    { label: () => `Sneller beginnen: ${S.settings.quickStart ? 'AAN (opening overslaan)' : 'uit'}`, cycle: true, onSelect: () => { S.settings.quickStart = !S.settings.quickStart; } },
    { label: () => `Muziek: ${Math.round(S.settings.music * 10)}/10`, cycle: true, onSelect: (d) => { S.settings.music = Math.min(1, Math.max(0, S.settings.music + 0.1 * (d || 1))); audio.musicVol = S.settings.music; if (audio.musG) audio.musG.gain.value = S.settings.music * 0.5; } },
    { label: () => `Geluidseffecten: ${Math.round(S.settings.sfx * 10)}/10`, cycle: true, onSelect: (d) => { S.settings.sfx = Math.min(1, Math.max(0, S.settings.sfx + 0.1 * (d || 1))); audio.sfxVol = S.settings.sfx; if (audio.sfxG) audio.sfxG.gain.value = S.settings.sfx; audio.sfx('coin'); } },
    { label: () => `Kwaliteit: ${S.settings.quality === 'low' ? 'Laag (snel)' : 'Hoog'} (pas na herladen)`, cycle: true, onSelect: () => { S.settings.quality = S.settings.quality === 'low' ? 'high' : 'low'; } },
    { label: 'Klaar', onSelect: () => close() },
  ]);
  const card = h('div', { class: 'card', style: { width: 'min(640px,94vw)' } }, h('h2', {}, 'Instellingen'), menu.el, note, h('div', { class: 'small-note' }, 'Links/rechts verandert een waarde.'));
  el = ui.overlay(card); ui.activeMenus.push(menu);
}
// Online spelen: jij bent de host (Wes), je broer doet mee als Jor via een link of code
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
    statusEl.textContent = st === 'connected' ? '✅ Jor is verbonden! Jullie kunnen nu samen spelen.' : st === 'waiting' ? '⏳ Wachten tot Jor meedoet…' : st === 'lost' ? '⚠️ Jor is weggevallen. Laat hem de link opnieuw openen.' : st === 'error' ? '❌ Geen verbinding met de signaalserver. Heb je internet?' : 'Verbinding maken…';
    if (host.code) { codeEl.textContent = host.code; linkEl.textContent = host.link(); }
    const loc = location.hostname; warnEl.textContent = /^(localhost|127\.|192\.168\.|10\.|172\.)/.test(loc) ? 'Let op: dit spel draait op jouw eigen computer. Je broer kan die link alleen openen als hij op hetzelfde netwerk zit. Zet het spel online (bijv. GitHub Pages, zie README) om over internet te spelen.' : 'Stuur de link naar je broer (appen, mailen...). Hij hoeft niets te installeren: een computer met Chrome of Edge is genoeg.';
  };
  const off = host.on(render);
  const card = h('div', { class: 'card', style: { width: 'min(680px,94vw)' } }, h('h2', {}, '🌐 Online spelen'), h('p', { style: { textAlign: 'center' }, html: 'Jij bent <b>Wes</b>. Je broer speelt mee als <b>Jor</b> op zijn eigen computer.' }), codeEl, linkEl, statusEl, menu.el, warnEl);
  el = ui.overlay(card); ui.activeMenus.push(menu); render();
  host.start().then(render).catch((e) => { statusEl.textContent = '❌ ' + (e.message || 'Mislukt'); });
}
function howToPlay(onClose) {
  const card = h('div', { class: 'card', style: { maxHeight: '92vh', overflow: 'auto' } }, h('h2', {}, 'Hoe werkt het?'),
    h('p', { html: '' + (nPlayers() === 3 ? 'Wes, Jor en Juul' : 'Wes en Jor') + ' runnen de <b>Speelhal</b> van Koning Klopper! Loop naar een kast en druk op je actieknop voor een <b>duel</b>: 1 tegen 1 op hetzelfde scherm. Wie wint? Dat bepaal jij.' }),
    h('div', { class: 'ctrl' }, ...activeIds().map((i) => h('div', { style: { '--c': pcss(i) } }, h('h4', {}, `${pname(i)} (speler ${i + 1})`), h('ul', {}, h('li', { html: `<kbd>${klabel(i).move}</kbd> lopen` }), h('li', { html: `<kbd>${klabel(i).a}</kbd> praten / springen / actie` }), h('li', { html: `<kbd>${klabel(i).b}</kbd> tweede actie` }))))),
    nPlayers() === 3 ? h('p', { html: '🧑‍🤝‍🧑 <b>Met Juul erbij</b> speel je duels met z\'n tweeën: de derde kijkt toe. Kies <b>Winnaar blijft</b> (wie wint, blijft staan) of kies zelf wie er speelt. In het dorp doen er 2 van de 3 mee aan een karweitje.' }) : null,
    h('p', { html: '🌀 Elk duel krijgt een <b>twist</b>: omgekeerde besturing, lichaamswissel, zeepvloer... Het wordt vanzelf grappig.' }),
    h('p', { html: '🏗️ Duels leveren <b>heitjes</b> op. Daarmee laat je nieuwe <b>hallen bouwen</b> (dichtgetimmerde deuren in de hoofdhal). Hoe meer je speelt, hoe hoger je <b>rang</b>!' }),
    h('p', { html: '🏆 Het <b>Wiel van Gekte</b> kiest een duel, een <b>toernooi</b> mixt er meerdere en de <b>Uitdaging van de dag</b> geeft bonus. Het <b>Feestbord</b> houdt de stand bij.' }),
    h('p', { html: '🏘️ Het <b>dorp</b> staat nog steeds klaar voor <b>karweitjes</b>: samen klussen voor extra heitjes (en hoedjes!).' }),
    h('p', { html: '🚪 <b>De Deurman</b> is een grapjas in een pak. Hij staat graag in deuren, zwaait met feesthoedjes en verzamelt handtekeningen. Hij doet niks. Meestal.' }),
    h('p', { html: '<kbd>Esc</kbd> = pauze · <kbd>M</kbd> = geluid uit · gamepads werken ook.' }),
    h('div', { class: 'small-note' }, 'Druk op een actieknop om te sluiten'));
  const el = ui.overlay(card); let t = 0.3;
  const drv = { update() { t -= 0.016; if (t < 0 && (anyP('aP') || input.pressed('Escape'))) { ui.activeMenus = ui.activeMenus.filter((m) => m !== drv); el.remove(); onClose && onClose(); } } };
  ui.activeMenus.push(drv);
}

export class MenuMode {
  constructor(app) {
    this.app = app; this.t = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 400);
    this.fx = new Particles(900, { additive: true }); this.fx.setViewportHeight(innerHeight);
    this.scene.add(this.fx.points);
    const L = setupLights(this.scene, 'night', { shadows: false, fogNear: 40, fogFar: 200 }); L.sun.intensity = 1.6; L.hemi.intensity = 1.5;
    // de Speelhal-berg met neonpoort (bord aan, deuren dicht: het is nacht en de poort gloeit)
    this.gate = buildGate(this.scene, { trees: 16, clear: [[8.4, -11, 6]] }); this.gate.setSign(true);
    // schuurtje met een deur: daar komt de Deurman uit met een feesthoedje
    const house = P.houseSimple(5, 4, 3.2, { thatch: true, wall: '#d8c9a8', doorColor: 0x5a3a24 }); house.position.set(8.4, 0, -11); house.rotation.y = HY; this.scene.add(house);
    this.leaf = house.userData.door.userData.leaf; this.doorG = house.userData.door;
    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); this.doorGlow.position.set(0, 1.05, 0.026); this.doorGlow.visible = false; this.doorG.add(this.doorGlow);   // warme gloed achter de Deurman
    this.deur = makeDeurman(0.78); this.deur.group.visible = false; this.scene.add(this.deur.group);
    this.hat = partyHat(0.78); this.hat.position.set(0.02, 0.2, 0); this.hat.rotation.z = 0.18; this.deur.head.add(this.hat);
    this.bros = [0, 1].map((i) => this.mkBro(i));
    this.syncJuul();
    this.doorT = 3.5; this.doorState = 0; this.open = 0; this.flickT = 9;
    this.camera.position.set(0, 4, 12); this.camera.lookAt(-9, 7, -30);
  }
  // een poppetje bij het schuurtje (Wes, Jor, Juul)
  mkBro(i) { const c = makeBrother(i); const P = [[1.4, -2, 0.3], [3.0, -3, -0.3], [4.5, -2.1, -0.6]][i]; c.group.position.set(P[0], 0, P[1]); c.targetYaw = c.yaw = Math.PI + P[2]; c.pose = this.doorState ? 'wave' : 'idle'; this.scene.add(c.group); return c; }
  // Juul erbij of eraf (na het sluiten van de instellingen)
  syncJuul() {
    const want = nPlayers() === 3;
    if (want && this.bros.length < 3) this.bros.push(this.mkBro(2));
    else if (!want && this.bros.length > 2) { const c = this.bros.pop(); this.scene.remove(c.group); }
  }
  enter() {
    ui.hudEl.innerHTML = '';
    this.build(); audio.music('menu'); ui.fade(0, 700);
  }
  exit() { ui.activeMenus = []; ui.clearScreens(); try { this.fx.dispose(); } catch (e) { /* al weg */ } }
  build() {
    ui.clearScreens(); ui.activeMenus = [];
    const items = [];
    if (hasSave()) items.push({ label: 'Verder spelen', sub: () => `🪙 ${S.coins} heitjes · ${S.arcade ? S.arcade.plays : 0} duels gespeeld`, onSelect: () => this.go(false) });
    items.push({ label: hasSave() ? 'Nieuw spel' : 'Spel starten', onSelect: () => { if (hasSave()) this.confirmNew(); else this.go(true); } });
    items.push({ label: '🌐 Online spelen', sub: 'Twee apparaten, één spel (jij bent de host)', onSelect: () => { this.hide(); openOnline(this.app, () => this.show()); } });
    items.push({ label: '🌐 Meedoen met een code', onSelect: () => { location.search = '?join'; } });
    items.push({ label: 'Hoe werkt het?', onSelect: () => { this.hide(); howToPlay(() => this.show()); } });
    items.push({ label: 'Instellingen', onSelect: () => { this.hide(); openSettings(() => { this.syncJuul(); this.build(); this.show(); }); } });
    this.menu = new Menu3(items);
    const wrap = h('div', { class: 'menu-wrap mm', style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 'min(500px,100vw)', justifyContent: 'flex-start', paddingTop: '2.5vh', pointerEvents: 'none', background: 'linear-gradient(90deg,rgba(8,4,24,.72),rgba(8,4,24,.45) 70%,rgba(8,4,24,0))' } },
      h('style', {}, '.mm .btn{font-size:21px;padding:7px 14px}.mm .btnrow{gap:7px;margin-top:6px}.mm .title{font-size:min(7.5vw,66px)!important}.mm .subtitle{font-size:20px!important;margin:4px 0 8px!important}'),
      h('div', { class: 'title' }, 'Wes & Jor:', h('br'), 'De Speelhal'),
      h('div', { class: 'subtitle' }, 'Duels, feestjes en één Deurman'),
      h('div', { style: { pointerEvents: 'auto', width: 'min(380px,92vw)', marginTop: '1vh' } }, this.menu.el),
      h('div', { class: 'small-note', style: { color: '#fff', textShadow: '0 2px 0 #000', marginTop: '10px', fontSize: '13px' } }, `Wes: WASD + F/G   ·   Jor: pijltjes + Enter/Shift${nPlayers() === 3 ? '   ·   Juul: IJKL + U/O' : ''}   ·   M = geluid`));
    this.wrap = wrap; ui.screens.append(wrap); ui.activeMenus.push(this.menu);
  }
  // Nieuw spel wist alles: even vragen
  confirmNew() {
    this.hide(); let el;
    const done = (yes) => { ui.activeMenus = ui.activeMenus.filter((m) => m !== cm); el.remove(); if (yes) this.go(true); else this.show(); };
    const cm = new Menu3([{ label: 'Nee, terug', onSelect: () => done(false) }, { label: 'Ja, begin helemaal opnieuw', onSelect: () => done(true) }]);
    el = ui.overlay(h('div', { class: 'card', style: { width: 'min(520px,94vw)' } }, h('h2', {}, 'Nieuw spel?'), h('p', { style: { textAlign: 'center' } }, 'Je heitjes, hallen, rang en hoedjes worden gewist.'), cm.el)); ui.activeMenus.push(cm);
  }
  hide() { this.wrap.style.display = 'none'; }
  show() { this.wrap.style.display = ''; }
  async go(newGame) {
    if (this.going) return; this.going = true; ui.activeMenus = [];
    audio.sfx('powerup'); await ui.fade(1, 600);
    if (newGame) { resetSave(); S.names = ['Wes', 'Jor', 'Juul']; }
    persist();
    if (newGame && !S.settings.quickStart) await this.app.goOpening({});
    else await this.app.goArcade({ intro: !!newGame });
  }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }
  update(dt) {
    this.t += dt; const t = this.t;
    this.gate.update(dt, t);
    this.flickT -= dt; if (this.flickT <= 0) { this.flickT = rand(10, 18); this.gate.flicker(); }
    // de Deurman: deur gaat open, hij komt zwaaien met een feesthoedje, deur gaat weer dicht
    this.doorT -= dt;
    if (this.doorT <= 0) {
      if (this.doorState === 0) { this.doorState = 1; this.doorT = 5.2; audio.sfx('creak', { vol: 0.5 }); setTimeout(() => { if (this.doorState && this.t > 0) { audio.sfx('pop'); const g = this.deur.group.position; this.fx.burst(g.x, 3, g.z, { count: 30, colors: [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b], speed: 5, size: 0.35, life: 1.3, gravity: 3 }); } }, 900); }
      else { this.doorState = 0; this.doorT = 8 + Math.random() * 5; audio.sfx('door', { vol: 0.5 }); }
      this.bros.forEach((c) => (c.pose = this.doorState ? 'wave' : 'idle'));
    }
    this.open = damp(this.open, this.doorState, 1.8, dt);
    this.leaf.rotation.y = -1.9 * this.open; this.doorGlow.visible = this.open > 0.05;
    const hp = this.doorG.getWorldPosition(new THREE.Vector3());
    const d = this.deur; d.group.position.set(hp.x + Math.sin(HY) * 0.7, 0, hp.z + Math.cos(HY) * 0.7); d.yaw = d.targetYaw = HY; d.update(dt); d.group.visible = this.open > 0.7;
    d.arms[1].rotation.z = -2.7 + Math.sin(t * 9) * 0.35; d.group.position.y = 0;
    this.bros.forEach((c) => c.update(dt));
    this.fx.emit(rand(-30, 30), rand(0.5, 6), rand(-20, 20), rand(-.3, .3), rand(0, .3), rand(-.3, .3), { life: 3, size: 0.15, color: 0xfff08a, gravity: 0, shrink: false });
    this.fx.update(dt);
    this.camera.position.x = Math.sin(t * 0.18) * 1.8; this.camera.position.y = 4 + Math.sin(t * 0.27) * 0.3; this.camera.lookAt(-9 + Math.sin(t * 0.13) * 1.2, 7, -30);
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}

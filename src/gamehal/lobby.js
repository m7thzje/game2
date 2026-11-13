// Impactid Gamehal: de lobby. Neon-speelhal als achtergrond, kies 2/3/4 spelers, pas namen aan (klik op een naam), toetsenhulp,
// geluid/kwaliteit, "Online spelen" en starten. Alles werkt met toetsenbord/pad (alle spelers) én muis.
import * as THREE from 'three';
import { input, BASE_KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother } from '../engine/chars.js';
import { BASE_CSS, BASE_COLORS } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { h, mesh, canvasTex, rand, damp, TAU, pick } from '../engine/util.js';
import { Deco } from '../world/arcade_deco.js';
import { cabUpright } from '../world/arcade_cabs.js';
import { arc } from '../world/arcade_zones.js';
import { floatLabel } from '../world/build.js';
import { openOnline } from '../net/online_ui.js';
import { rotateTips, coin, howToExtra } from './humor.js';
import { playerCount, setName, DEF_NAMES, MAX_NAME, II, FONT, LOGO_URL, brandTex, drawLogo, rrect } from './common.js';

const KEYS = BASE_KEY_LABELS;
const GEL = ['Aan', 'Zacht', 'Uit'];
const SHARP = ['scherp', 'normaal', 'zacht'], SHARP_TXT = { scherp: 'Scherp', normaal: 'Normaal', zacht: 'Zacht' };
const CAB_SCR = [[II.sky, II.navy], [II.sky5, II.navy2], [II.proj5, '#4a0a2a'], [II.fund5, '#5a1500'], [II.field5, '#003a12'], [II.sky3, II.blue]];   // schermen van de kasten: merk- en productkleuren
const geluidIdx = () => (S.settings.music <= 0 && S.settings.sfx <= 0 ? 2 : S.settings.music <= 0.25 ? 1 : 0);

export class GamehalLobby {
  constructor(app) {
    this.app = app; this.t = 0; this.going = false; this.editing = -1; this.padN = 0; this.padT = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 400);
    this.fx = new Particles(900, { additive: true }); this.fx.setViewportHeight(innerHeight); this.scene.add(this.fx.points);
    const L = setupLights(this.scene, 'night', { shadows: false, fogNear: 40, fogFar: 150 }); L.sun.intensity = 0.9; L.hemi.intensity = 1.35;
    this.scene.background = new THREE.Color(0x03152e); this.scene.fog.color.set(0x03152e);
    this.buildRoom();
    this.bros = []; this.syncPlayers();
    this.camera.position.set(0, 6.2, 21); this.camera.lookAt(0, 4.2, 0);
    this.flickT = 4;
  }

  // ------------------------------------------------------------------ 3D
  buildRoom() {
    const sc = this.scene, D = new Deco();
    // spiegelende neonvloer
    const gt = canvasTex(256, 256, (g, w, hh) => { g.fillStyle = '#03152e'; g.fillRect(0, 0, w, hh); g.strokeStyle = II.sky5; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, hh - 2); g.strokeStyle = 'rgba(153,204,239,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, hh); g.moveTo(0, hh / 2); g.lineTo(w, hh / 2); g.stroke(); g.fillStyle = 'rgba(0,127,216,.16)'; g.fillRect(0, 0, w / 2, hh / 2); g.fillRect(w / 2, hh / 2, w / 2, hh / 2); });
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(12, 8);
    sc.add(mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.3, metalness: 0.4, emissive: 0x0a3a6a, emissiveMap: gt, emissiveIntensity: 1.25 }), { cast: false, pos: [0, 0, -8], rot: [-Math.PI / 2, 0, 0] }));
    // achterwand met groot neonbord
    sc.add(mesh(new THREE.PlaneGeometry(90, 26), new THREE.MeshStandardMaterial({ color: 0x0a2a5a, roughness: 0.9, emissive: 0x04163a, emissiveIntensity: 1 }), { cast: false, pos: [0, 13, -20] }));
    // het impactID-bord: logo op wit (het logo staat nooit op donker), GAMEHAL ernaast in Plus Jakarta Sans ExtraBold, zachte blauwe gloed erachter
    const sg = brandTex(2048, 640, (g, w, hh, logo) => {
      g.fillStyle = II.navy3; g.fillRect(0, 0, w, hh);
      g.fillStyle = '#fff'; rrect(g, 36, 36, w - 72, hh - 72, 72); g.fill();
      g.strokeStyle = II.sky; g.lineWidth = 12; rrect(g, 36, 36, w - 72, hh - 72, 72); g.stroke();
      drawLogo(g, logo, 96, 70, 900, 500);
      g.fillStyle = II.line; g.fillRect(1040, 150, 6, hh - 300);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      let fs = 200; g.font = `800 ${fs}px ${FONT}`; const mw = g.measureText('GAMEHAL').width; if (mw > 840) { fs = Math.floor(fs * 840 / mw); g.font = `800 ${fs}px ${FONT}`; }
      g.fillStyle = II.navy; g.fillText('GAMEHAL', 1540, 360);
      g.fillStyle = II.sky; g.fillRect(1540 - 300, 392, 600, 12);
      g.font = `700 50px ${FONT}`; g.fillStyle = II.blue; if ('letterSpacing' in g) g.letterSpacing = '4px'; g.fillText('2 TOT 4 SPELERS', 1540, 484); if ('letterSpacing' in g) g.letterSpacing = '0px';
    });
    sg.anisotropy = 8;
    this.sign = mesh(new THREE.PlaneGeometry(21, 6.56), new THREE.MeshBasicMaterial({ map: sg, toneMapped: false }), { cast: false, receive: false, pos: [0, 15.5, -19.6] }); sc.add(this.sign);
    const glowT = canvasTex(256, 128, (g, w, hh) => { const gr = g.createRadialGradient(w / 2, hh / 2, 6, w / 2, hh / 2, w / 2); gr.addColorStop(0, 'rgba(0,127,216,.75)'); gr.addColorStop(0.55, 'rgba(0,127,216,.28)'); gr.addColorStop(1, 'rgba(0,127,216,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
    sc.add(mesh(new THREE.PlaneGeometry(40, 17), new THREE.MeshBasicMaterial({ map: glowT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), { cast: false, receive: false, pos: [0, 15.5, -19.8] }));
    for (const sx of [-1, 1]) D.box(0.3, 7, 0.3, sx * 11.2, 15.5, -19.5, 0x99ccef, { kind: 'p1' });
    D.box(22.6, 0.3, 0.3, 0, 19.1, -19.5, 0x99ccef, { kind: 'p1' }); D.box(22.6, 0.3, 0.3, 0, 11.9, -19.5, 0x99ccef, { kind: 'p1' });
    // neonbuizen langs de muur
    for (const [y, c, k] of [[2.4, 0x3399e0, 'p0'], [9.4, 0x99ccef, 'p2']]) D.box(88, 0.25, 0.25, 0, y, -19.6, c, { kind: k });
    // arcadekasten: boog achter de spelers, schermen met spel-icoontjes
    const trims = [0x3399e0, 0x99ccef, 0xd63576, 0x33a755, 0x007fd8, 0xff6133];
    const spots = [...arc(11, 17, 168, -90).map((s) => ({ ...s, z: s.z - 3 })), ...arc(8, 25, 150, -90).map((s) => ({ ...s, z: s.z - 4 }))];
    const ids = Object.keys(this.app.games).filter((i) => this.app.games[i] && this.app.games[i].icon);
    this.cabScr = [];
    spots.forEach((c, k) => {
      let spec; D.at(c.x, 0, c.z, c.yaw, () => { spec = cabUpright(D, trims[k % 6], [0x0a2a5a, 0x00244b, 0x143a6e, 0x0a3a4a][k % 4]); });
      const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw; sc.add(g);
      const S2 = spec.scr, def = this.app.games[ids[k % Math.max(1, ids.length)]] || {}; const [c0, c1] = CAB_SCR[k % CAB_SCR.length];
      const tx = canvasTex(256, 192, (gg, w, hh) => { const gr = gg.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, c0); gr.addColorStop(1, c1); gg.fillStyle = gr; gg.fillRect(0, 0, w, hh); gg.fillStyle = 'rgba(255,255,255,.1)'; for (let y = 0; y < hh; y += 6) gg.fillRect(0, y, w, 2); gg.font = '96px serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(def.icon || '🎮', w / 2, hh / 2 + 4); });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(S2.w, S2.h), new THREE.MeshBasicMaterial({ map: tx })); scr.position.set(S2.x, S2.y, S2.z); scr.rotation.x = S2.rx; g.add(scr); this.cabScr.push(scr);
    });
    // podium voor de spelers (gloeiende ringen)
    D.cyl(11, 11.4, 0.5, 40, 0, 0.25, 3, 0x0a2a5a); D.tor(11.2, 0.16, 0, 0.55, 3, 0x3399e0, { kind: 'p0', rx: Math.PI / 2 }, 48); D.tor(8.6, 0.12, 0, 0.55, 3, 0x99ccef, { kind: 'p1', rx: Math.PI / 2 }, 40);
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; D.sph(0.2, Math.cos(a) * 11.2, 0.7, 3 + Math.sin(a) * 11.2, [0x007fd8, 0x99ccef, 0xffffff][i % 3], { kind: 'p' + (i % 3) }, 6); }
    // truss met lichtbundels
    D.box(40, 0.4, 0.4, 0, 17.6, -2, 0x555566, { kind: 'metal' }); D.box(40, 0.4, 0.4, 0, 16.8, -2, 0x555566, { kind: 'metal' });
    for (const sx of [-1, 1]) D.cyl(0.2, 0.25, 17.8, 6, sx * 20, 8.9, -2, 0x555566, { kind: 'metal' });
    this.beams = []; [0x007fd8, 0x99ccef, 0xffffff, 0x3399e0, 0xd63576, 0x007fd8, 0x99ccef].forEach((c, i) => {
      const bx = -15 + i * 5; D.cyl(0.4, 0.3, 0.55, 8, bx, 16.4, -2, 0x222233); D.sph(0.2, bx, 16.1, -2, c, { kind: 'glow' }, 6);
      const gr = new THREE.Group(); gr.position.set(bx, 16.2, -2); const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 16, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.position.y = -8; gr.add(cone); sc.add(gr); this.beams.push({ gr, ph: i * 1.1 });
    });
    this.disco = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.1, flatShading: true, emissive: 0x555577, emissiveIntensity: 0.7 })); this.disco.position.set(0, 14.5, 0); sc.add(this.disco);
    sc.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0x999999 }), { cast: false, pos: [0, 17.5, 0] }));
    D.build(sc, { shadow: false });
    this.lights = [0x3399e0, 0x99ccef, 0xd63576].map((c) => { const l = new THREE.PointLight(c, S.settings.quality === 'low' ? 0 : 110, 38, 1.6); l.position.set(0, 9, 4); sc.add(l); return l; });
    // ripples: kringen die vanaf het podium uitdijen en vervagen (het beeldmerk van impactID)
    this.ripples = [0, 1, 2].map((k) => { const m = mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0x99ccef, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), { cast: false, receive: false, pos: [0, 0.6, 3], rot: [-Math.PI / 2, 0, 0] }); sc.add(m); return { m, k }; });
  }
  // de poppetjes van de actieve spelers
  syncPlayers() {
    const n = playerCount(); for (const c of this.bros) { this.scene.remove(c.group); c.spot && this.scene.remove(c.spot); } this.bros = [];
    const sp = n === 4 ? 3.5 : n === 3 ? 4.2 : 4.8;
    for (let i = 0; i < n; i++) {
      const c = makeBrother(i); const x = (i - (n - 1) / 2) * sp; c.group.position.set(x, 0.5, 5.2 + (i % 2 ? -1.1 : 0.3)); c.targetYaw = c.yaw = (-x) * 0.04; c.pose = 'idle'; c.group.scale.setScalar(1.55);
      const lb = floatLabel(S.names[i], '', ['#6bf09a', '#7fb2ff', '#ffb870', '#e79bff'][i]); lb.scale.set(3.4, 1.05, 1); lb.position.y = c.height + 0.95; lb.material.depthTest = false; c.group.add(lb); c.label = lb; c.nameShown = S.names[i];
      c.cheerT = rand(1, 5); this.scene.add(c.group); this.bros.push(c);
      // eigen schijnwerper + gloeiende ring in de kleur van de speler
      const col = BASE_COLORS[i]; const spot = new THREE.Group(); spot.position.set(x, 0, c.group.position.z);
      spot.add(mesh(new THREE.RingGeometry(1.15, 1.45, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.56, 0], rot: [-Math.PI / 2, 0, 0] }));
      spot.add(mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.55, 0], rot: [-Math.PI / 2, 0, 0] }));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.0, 15, 18, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.position.y = 8; spot.add(cone);
      this.scene.add(spot); c.spot = spot;
    }
  }
  relabel() {
    this.bros.forEach((c, i) => { if (c.nameShown === S.names[i]) return; c.group.remove(c.label); c.label.material.map && c.label.material.map.dispose(); c.label.material.dispose(); const lb = floatLabel(S.names[i], '', ['#6bf09a', '#7fb2ff', '#ffb870', '#e79bff'][i]); lb.scale.set(3.4, 1.05, 1); lb.position.y = c.height + 0.95; lb.material.depthTest = false; c.group.add(lb); c.label = lb; c.nameShown = S.names[i]; });
  }

  // ------------------------------------------------------------------ DOM
  enter() {
    S.settings.unlockAll = true; ui.hudEl.innerHTML = ''; this.build(); audio.music('menu'); ui.fade(0, 700);
  }
  exit() { this.stopJoke && this.stopJoke(); ui.activeMenus = []; ui.clearScreens(); try { this.fx.dispose(); } catch (e) { /* al weg */ } }
  setPlayers(n) { S.settings.players = Math.max(2, Math.min(4, n)); persist(); this.syncPlayers(); this.renderRows(); this.menu && this.menu.render(); this.tipEl && this.updateTip(); audio.sfx('click'); }
  build() {
    ui.clearScreens(); ui.activeMenus = [];
    const items = [
      { label: () => `▶ Naar de Gamehal (${playerCount()} spelers)`, onSelect: () => this.go() },
      { label: () => `👥 Spelers: ${playerCount()}`, cycle: true, onSelect: (d) => this.setPlayers(2 + ((playerCount() - 2 + (d || 1) + 3) % 3)) },
      { label: '🌐 Online spelen', onSelect: () => { this.hide(); openOnline(this.app, () => { this.syncPlayers(); this.renderRows(); this.build(); this.show(); }); } },
      { label: () => `🔊 Geluid: ${GEL[geluidIdx()]}`, cycle: true, onSelect: (d) => this.setSound(d) },
      { label: () => `🖥️ Kwaliteit: ${S.settings.quality === 'low' ? 'Laag' : 'Hoog'}`, cycle: true, onSelect: () => { S.settings.quality = S.settings.quality === 'low' ? 'high' : 'low'; persist(); } },
      { label: () => `🔎 Scherpte: ${SHARP_TXT[this.sharp()]}`, cycle: true, onSelect: (d) => this.setSharp(d) },
      { label: '❓ Hoe werkt het?', onSelect: () => { this.hide(); this.howTo(() => this.show()); } },
    ];
    this.menu = new Menu(items);
    this.countEl = h('div', { class: 'gh-count' }, ...[2, 3, 4].map((n) => h('button', { onClick: () => this.setPlayers(n) }, `${n} spelers`)));
    this.rowsEl = h('div', { class: 'gh-players' });
    this.tipEl = h('div', { class: 'gh-tip' });
    this.wrap = h('div', { class: 'gh-lobby' },
      h('div', { class: 'gh-title' }, h('img', { class: 'gh-logo', src: LOGO_URL, alt: 'impactID, contribute to a fair world', draggable: 'false' }), h('span', { class: 'a' }, 'impactID '), h('span', { class: 'b' }, 'Gamehal')),
      h('div', { class: 'gh-sub' }, 'Even weg van de spreadsheets: duels, teams en knock-outs voor 2 tot 4 collega\'s.'),
      this.countEl, this.rowsEl, h('div', { class: 'gh-menu' }, this.menu.el), this.tipEl,
      h('div', { class: 'gh-foot', html: 'Klik op een naam om hem aan te passen · <kbd>M</kbd> geluid · <kbd>Esc</kbd> pauze' }),
      this.jokeEl = h('div', { class: 'gh-joke' }));   // wisselende kantoorgrap onderin
    ui.screens.append(this.wrap); ui.activeMenus.push(this.menu);
    this.renderRows(); this.updateTip(); this.stopJoke && this.stopJoke(); this.stopJoke = rotateTips(this.jokeEl);
  }
  hide() { this.wrap.style.display = 'none'; }
  show() { this.wrap.style.display = ''; }
  // scherpte: scherp = tot 2x pixels, normaal = 1,5x, zacht = 1x (S.settings.sharp, bewaard; de auto-regeling in game.js blijft erboven)
  sharp() { return this.app.sharpMode ? this.app.sharpMode() : 'scherp'; }
  setSharp(d) { const i = SHARP.indexOf(this.sharp()); const m = SHARP[(i + (d || 1) + SHARP.length) % SHARP.length]; if (this.app.setSharp) this.app.setSharp(m); else { S.settings.sharp = m; persist(); } audio.sfx('click'); }
  setSound(d) {
    const i = (geluidIdx() + (d || 1) + 3) % 3; const [m, s] = i === 0 ? [0.5, 0.8] : i === 1 ? [0.2, 0.4] : [0, 0];
    S.settings.music = m; S.settings.sfx = s; audio.musicVol = m; audio.sfxVol = s; if (audio.musG) audio.musG.gain.value = m * 0.5; if (audio.sfxG) audio.sfxG.gain.value = s; persist(); audio.sfx('coin');
  }
  renderRows() {
    const n = playerCount(); this.rowsEl.innerHTML = '';
    [...this.countEl.children].forEach((b, k) => b.classList.toggle('on', k + 2 === n));
    for (let i = 0; i < 4; i++) {
      const k = KEYS[i], on = i < n;
      const nm = h('span', { class: 'nm', title: 'Klik om de naam aan te passen', onClick: (e) => { e.stopPropagation(); if (!on) this.setPlayers(i + 1); this.editName(i); } }, S.names[i]);
      const row = h('div', { class: 'gh-prow' + (on ? '' : ' off'), style: { '--c': BASE_CSS[i] }, onClick: () => { if (!on) this.setPlayers(i + 1); } },
        h('span', { class: 'dot' }), nm, on ? h('span', { class: 'ed', onClick: (e) => { e.stopPropagation(); this.editName(i); } }, '✏️') : h('span', { class: 'ed' }, ''),
        h('span', { class: 'keys', html: on ? `<kbd>${k.move}</kbd> <kbd>${k.a}</kbd> <kbd>${k.b}</kbd>` : 'klik om mee te doen' }));
      row.style.setProperty('--c', BASE_CSS[i]); row.dataset.i = i; this.rowsEl.append(row);
    }
  }
  updateTip() {
    const n = playerCount(), pads = this.padN;
    const padTxt = pads > 0 ? ` 🎮 ${pads} gamepad${pads > 1 ? 's' : ''} herkend.` : '';
    this.tipEl.innerHTML = n === 4
      ? `💡 Vier op één toetsenbord geeft <b>ghosting</b> (toetsen blokkeren elkaar). Gebruik <b>gamepads</b> (pad 1-4 = Wes-Sam) of speel <b>online</b>.${padTxt}`
      : n === 3 ? `💡 Met 3 op één toetsenbord wordt het krap: <b>gamepads</b> of <b>online</b> kan ook!${padTxt}`
        : `💡 Twee spelers passen prima op één toetsenbord. Meer? Kies 3 of 4 spelers.${padTxt}`;
  }
  // naam aanpassen: invoerveld in de rij. Toetsen van het veld gaan niet naar het spel (WASD enz. moeten gewoon te typen zijn).
  editName(i) {
    if (this.editing >= 0) return; const row = this.rowsEl.children[i]; if (!row) return; const span = row.querySelector('.nm'); if (!span) return;
    this.editing = i; const saved = ui.activeMenus; ui.activeMenus = [];
    const inp = h('input', { type: 'text', maxlength: String(MAX_NAME), value: S.names[i], spellcheck: 'false', autocomplete: 'off' });
    span.replaceWith(inp); inp.focus(); inp.select();
    for (const ev of ['keydown', 'keyup', 'keypress']) inp.addEventListener(ev, (e) => e.stopPropagation());
    let done = false;
    const commit = (ok) => { if (done) return; done = true; if (ok) setName(i, inp.value); this.editing = -1; ui.activeMenus = saved; input.reset(); this.renderRows(); this.relabel(); audio.sfx('select'); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
  }
  howTo(onClose) {
    const n = playerCount(); const ids = [0, 1, 2, 3].slice(0, n);
    const card = h('div', { class: 'card', style: { width: 'min(820px,96vw)', maxHeight: '92vh', overflow: 'auto' } }, h('h2', {}, 'Hoe werkt de Gamehal?'),
      h('p', { html: `Loop met je poppetje naar een <b>kast</b> en druk op je actieknop. Een spel met <b>${n} spelers</b> speelt iedereen tegelijk. Is het een duel voor twee? Dan speelt ${n === 2 ? 'het gewoon 1 tegen 1' : n === 3 ? 'er steeds een paar (<b>winnaar blijft</b>, of kies zelf)' : 'een <b>knock-out</b>: twee halve finales en een finale'}.` }),
      h('div', { class: 'ctrl' }, ...ids.map((i) => h('div', { style: { '--c': BASE_CSS[i] } }, h('h4', {}, `${S.names[i]} (speler ${i + 1})`), h('ul', {}, h('li', { html: `<kbd>${KEYS[i].move}</kbd> lopen` }), h('li', { html: `<kbd>${KEYS[i].a}</kbd> praten / springen / actie` }), h('li', { html: `<kbd>${KEYS[i].b}</kbd> tweede actie` }))))),
      h('p', { html: '👥 Op elke kast staat een label: <span class="gh-badge">👥 2-4</span> iedereen mee · <span class="gh-badge">👥 4</span> alleen met vier · <span class="gh-badge ko">🏆 knock-out</span> duel, met 4 spelers via halve finales + finale.' }),
      h('p', { html: '🌀 Elk spel krijgt een <b>twist</b>. 🎡 Het <b>Wiel van Gekte</b> kiest een spel, een <b>toernooi</b> mixt er meerdere, en elke dag is er een <b>Uitdaging</b>. Het <b>Feestbord</b> is een bordspel met duels erin. 👒 In de hoedenwinkel koop je hoedjes met ' + coin() + '. ' + howToExtra }),
      h('p', { class: 'small-note' }, 'Druk op een actieknop of klik om te sluiten'));
    const el = ui.overlay(card); let t = 0.3, closed = false;
    const close = () => { if (closed) return; closed = true; ui.activeMenus = ui.activeMenus.filter((m) => m !== drv); el.remove(); onClose && onClose(); };
    el.addEventListener('click', close);
    const drv = { update() { t -= 0.016; if (t < 0 && (input.anyA() || input.pressed('Escape'))) close(); } };
    ui.activeMenus.push(drv);
  }
  async go() {
    if (this.going) return; this.going = true; ui.activeMenus = [];
    S.settings.unlockAll = true; audio.sfx('powerup'); await ui.fade(1, 600); persist();
    await this.app.goArcade({});
  }

  // ------------------------------------------------------------------ frame
  resize(w, hh) {
    this.camera.aspect = w / hh; const off = w > 700 ? Math.min(430, w * 0.4) : 0;   // het paneel links: beeld naar rechts schuiven
    if (off) this.camera.setViewOffset(w, hh, -off / 2, 0, w, hh); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh);
  }
  update(dt) {
    this.t += dt; const t = this.t;
    this.padT -= dt; if (this.padT <= 0) { this.padT = 1; const gp = navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected).length : 0; if (gp !== this.padN) { this.padN = gp; this.tipEl && this.updateTip(); } }
    // beweging: poppetjes zwaaien/juichen om de beurt, discobal, bundels, bord flikkert
    this.bros.forEach((c, i) => {
      c.cheerT -= dt; if (c.cheerT <= 0) { c.cheerT = rand(2.5, 6); c.pose = c.pose === 'idle' ? pick(['cheer', 'wave']) : 'idle'; }
      c.targetYaw = Math.sin(t * 0.7 + i * 1.3) * 0.35 - c.group.position.x * 0.05; c.update(dt);
    });
    this.disco.rotation.y += dt * 0.9;
    this.beams.forEach((b, i) => { b.gr.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.5; b.gr.rotation.x = Math.cos(t * 0.5 + b.ph * 1.3) * 0.35; });
    this.lights.forEach((l, i) => { const a = t * 0.6 + i * TAU / 3; l.position.set(Math.cos(a) * 14, 9, 2 + Math.sin(a) * 7); });
    this.ripples.forEach((r) => { const u = ((t / 7 + r.k / 3) % 1); r.m.scale.setScalar(6 + u * 26); r.m.scale.z = r.m.scale.x; r.m.material.opacity = 0.55 * Math.sin(Math.PI * u) * (1 - u); });   // ripples; het logo-bord flikkert bewust niet
    this.cabScr.forEach((s, i) => { s.material.color.setScalar(0.78 + 0.22 * Math.sin(t * 2 + i)); });
    this.fx.emit(rand(-25, 25), rand(0.5, 12), rand(-15, 12), rand(-.3, .3), rand(0, .4), rand(-.3, .3), { life: 3.5, size: 0.17, color: pick([0x3399e0, 0x99ccef, 0xffffff]), gravity: 0, shrink: false });
    this.fx.update(dt);
    this.camera.position.x = Math.sin(t * 0.17) * 3.2; this.camera.position.y = 6.2 + Math.sin(t * 0.23) * 0.5; this.camera.lookAt(Math.sin(t * 0.11) * 1.4, 4.4, 0);
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}

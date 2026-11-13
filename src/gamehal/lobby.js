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
import { playerCount, setName, DEF_NAMES, MAX_NAME } from './common.js';

const KEYS = BASE_KEY_LABELS;
const GEL = ['Aan', 'Zacht', 'Uit'];
const geluidIdx = () => (S.settings.music <= 0 && S.settings.sfx <= 0 ? 2 : S.settings.music <= 0.25 ? 1 : 0);

export class GamehalLobby {
  constructor(app) {
    this.app = app; this.t = 0; this.going = false; this.editing = -1; this.padN = 0; this.padT = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 400);
    this.fx = new Particles(900, { additive: true }); this.fx.setViewportHeight(innerHeight); this.scene.add(this.fx.points);
    const L = setupLights(this.scene, 'night', { shadows: false, fogNear: 40, fogFar: 150 }); L.sun.intensity = 0.9; L.hemi.intensity = 1.35;
    this.scene.background = new THREE.Color(0x0a0620); this.scene.fog.color.set(0x0a0620);
    this.buildRoom();
    this.bros = []; this.syncPlayers();
    this.camera.position.set(0, 6.2, 21); this.camera.lookAt(0, 4.2, 0);
    this.flickT = 4;
  }

  // ------------------------------------------------------------------ 3D
  buildRoom() {
    const sc = this.scene, D = new Deco();
    // spiegelende neonvloer
    const gt = canvasTex(256, 256, (g, w, hh) => { g.fillStyle = '#0a1230'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, hh - 2); g.strokeStyle = 'rgba(255,43,214,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, hh); g.moveTo(0, hh / 2); g.lineTo(w, hh / 2); g.stroke(); g.fillStyle = 'rgba(0,229,255,.13)'; g.fillRect(0, 0, w / 2, hh / 2); g.fillRect(w / 2, hh / 2, w / 2, hh / 2); });
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(12, 8);
    sc.add(mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.3, metalness: 0.4, emissive: 0x0a2a4a, emissiveMap: gt, emissiveIntensity: 1.25 }), { cast: false, pos: [0, 0, -8], rot: [-Math.PI / 2, 0, 0] }));
    // achterwand met groot neonbord
    sc.add(mesh(new THREE.PlaneGeometry(90, 26), new THREE.MeshStandardMaterial({ color: 0x1a1240, roughness: 0.9, emissive: 0x0c0830, emissiveIntensity: 1 }), { cast: false, pos: [0, 13, -20] }));
    const sg = canvasTex(1024, 320, (g, w, hh) => {
      g.fillStyle = '#07041a'; g.fillRect(0, 0, w, hh); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 76px Fredoka, Arial Black, sans-serif'; g.shadowColor = '#00e5ff'; g.shadowBlur = 26; g.fillStyle = '#c8fbff'; g.fillText('I M P A C T I D', w / 2, 70);
      g.font = 'bold 190px Fredoka, Arial Black, sans-serif'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 40; g.fillStyle = '#ffd6f6'; g.fillText('GAMEHAL', w / 2, 205, w - 60);
      g.shadowBlur = 0; g.strokeStyle = '#ffe14a'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, hh - 16);
    });
    this.sign = mesh(new THREE.PlaneGeometry(21, 6.56), new THREE.MeshBasicMaterial({ map: sg }), { cast: false, receive: false, pos: [0, 15.5, -19.6] }); sc.add(this.sign);
    for (const sx of [-1, 1]) D.box(0.3, 7, 0.3, sx * 11.2, 15.5, -19.5, 0xffe14a, { kind: 'p1' });
    D.box(22.6, 0.3, 0.3, 0, 19.1, -19.5, 0xffe14a, { kind: 'p1' }); D.box(22.6, 0.3, 0.3, 0, 11.9, -19.5, 0xffe14a, { kind: 'p1' });
    // neonbuizen langs de muur
    for (const [y, c, k] of [[2.4, 0x00e5ff, 'p0'], [9.4, 0xff2bd6, 'p2']]) D.box(88, 0.25, 0.25, 0, y, -19.6, c, { kind: k });
    // arcadekasten: boog achter de spelers, schermen met spel-icoontjes
    const trims = [0xff5ad8, 0x5ad8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c];
    const spots = [...arc(11, 17, 168, -90).map((s) => ({ ...s, z: s.z - 3 })), ...arc(8, 25, 150, -90).map((s) => ({ ...s, z: s.z - 4 }))];
    const ids = Object.keys(this.app.games).filter((i) => this.app.games[i] && this.app.games[i].icon);
    this.cabScr = [];
    spots.forEach((c, k) => {
      let spec; D.at(c.x, 0, c.z, c.yaw, () => { spec = cabUpright(D, trims[k % 6], [0x2a1a46, 0x1d2a52, 0x3a1a3a, 0x1a3a3a][k % 4]); });
      const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw; sc.add(g);
      const S2 = spec.scr, def = this.app.games[ids[k % Math.max(1, ids.length)]] || {}; const hue = (k * 53) % 360;
      const tx = canvasTex(256, 192, (gg, w, hh) => { const gr = gg.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, `hsl(${hue},85%,50%)`); gr.addColorStop(1, `hsl(${(hue + 70) % 360},90%,24%)`); gg.fillStyle = gr; gg.fillRect(0, 0, w, hh); gg.fillStyle = 'rgba(255,255,255,.1)'; for (let y = 0; y < hh; y += 6) gg.fillRect(0, y, w, 2); gg.font = '96px serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(def.icon || '🎮', w / 2, hh / 2 + 4); });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(S2.w, S2.h), new THREE.MeshBasicMaterial({ map: tx })); scr.position.set(S2.x, S2.y, S2.z); scr.rotation.x = S2.rx; g.add(scr); this.cabScr.push(scr);
    });
    // podium voor de spelers (gloeiende ringen)
    D.cyl(11, 11.4, 0.5, 40, 0, 0.25, 3, 0x1a1240); D.tor(11.2, 0.16, 0, 0.55, 3, 0x00e5ff, { kind: 'p0', rx: Math.PI / 2 }, 48); D.tor(8.6, 0.12, 0, 0.55, 3, 0xff2bd6, { kind: 'p1', rx: Math.PI / 2 }, 40);
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; D.sph(0.2, Math.cos(a) * 11.2, 0.7, 3 + Math.sin(a) * 11.2, [0xff2bd6, 0x00e5ff, 0xffe14a][i % 3], { kind: 'p' + (i % 3) }, 6); }
    // truss met lichtbundels
    D.box(40, 0.4, 0.4, 0, 17.6, -2, 0x555566, { kind: 'metal' }); D.box(40, 0.4, 0.4, 0, 16.8, -2, 0x555566, { kind: 'metal' });
    for (const sx of [-1, 1]) D.cyl(0.2, 0.25, 17.8, 6, sx * 20, 8.9, -2, 0x555566, { kind: 'metal' });
    this.beams = []; [0xff2bd6, 0x00e5ff, 0x7bff00, 0xffe14a, 0xb05aff, 0xff2bd6, 0x00e5ff].forEach((c, i) => {
      const bx = -15 + i * 5; D.cyl(0.4, 0.3, 0.55, 8, bx, 16.4, -2, 0x222233); D.sph(0.2, bx, 16.1, -2, c, { kind: 'glow' }, 6);
      const gr = new THREE.Group(); gr.position.set(bx, 16.2, -2); const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 16, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.position.y = -8; gr.add(cone); sc.add(gr); this.beams.push({ gr, ph: i * 1.1 });
    });
    this.disco = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.1, flatShading: true, emissive: 0x555577, emissiveIntensity: 0.7 })); this.disco.position.set(0, 14.5, 0); sc.add(this.disco);
    sc.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0x999999 }), { cast: false, pos: [0, 17.5, 0] }));
    D.build(sc, { shadow: false });
    this.lights = [0xff2bd6, 0x00e5ff, 0xffe14a].map((c) => { const l = new THREE.PointLight(c, S.settings.quality === 'low' ? 0 : 110, 38, 1.6); l.position.set(0, 9, 4); sc.add(l); return l; });
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
  exit() { ui.activeMenus = []; ui.clearScreens(); try { this.fx.dispose(); } catch (e) { /* al weg */ } }
  setPlayers(n) { S.settings.players = Math.max(2, Math.min(4, n)); persist(); this.syncPlayers(); this.renderRows(); this.menu && this.menu.render(); this.tipEl && this.updateTip(); audio.sfx('click'); }
  build() {
    ui.clearScreens(); ui.activeMenus = [];
    const items = [
      { label: () => `▶ Naar de Gamehal (${playerCount()} spelers)`, onSelect: () => this.go() },
      { label: () => `👥 Spelers: ${playerCount()}`, cycle: true, onSelect: (d) => this.setPlayers(2 + ((playerCount() - 2 + (d || 1) + 3) % 3)) },
      { label: '🌐 Online spelen', onSelect: () => { this.hide(); openOnline(this.app, () => { this.syncPlayers(); this.renderRows(); this.build(); this.show(); }); } },
      { label: () => `🔊 Geluid: ${GEL[geluidIdx()]}`, cycle: true, onSelect: (d) => this.setSound(d) },
      { label: () => `🖥️ Kwaliteit: ${S.settings.quality === 'low' ? 'Laag' : 'Hoog'}`, cycle: true, onSelect: () => { S.settings.quality = S.settings.quality === 'low' ? 'high' : 'low'; persist(); } },
      { label: '❓ Hoe werkt het?', onSelect: () => { this.hide(); this.howTo(() => this.show()); } },
    ];
    this.menu = new Menu(items);
    this.countEl = h('div', { class: 'gh-count' }, ...[2, 3, 4].map((n) => h('button', { onClick: () => this.setPlayers(n) }, `${n} spelers`)));
    this.rowsEl = h('div', { class: 'gh-players' });
    this.tipEl = h('div', { class: 'gh-tip' });
    this.wrap = h('div', { class: 'gh-lobby' },
      h('div', { class: 'gh-title' }, h('span', { class: 'a' }, 'Impactid'), h('span', { class: 'b' }, 'Gamehal')),
      h('div', { class: 'gh-sub' }, 'Duels, teams en knock-outs voor 2 tot 4 spelers'),
      this.countEl, this.rowsEl, h('div', { class: 'gh-menu' }, this.menu.el), this.tipEl,
      h('div', { class: 'gh-foot', html: 'Klik op een naam om hem aan te passen · <kbd>M</kbd> geluid · <kbd>Esc</kbd> pauze' }));
    ui.screens.append(this.wrap); ui.activeMenus.push(this.menu);
    this.renderRows(); this.updateTip();
  }
  hide() { this.wrap.style.display = 'none'; }
  show() { this.wrap.style.display = ''; }
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
      h('p', { html: '🌀 Elk spel krijgt een <b>twist</b>. 🎡 Het <b>Wiel van Gekte</b> kiest een spel, een <b>toernooi</b> mixt er meerdere, en elke dag is er een <b>Uitdaging</b>. Het <b>Feestbord</b> is een bordspel met duels erin. 👒 In de hoedenwinkel koop je hoedjes met heitjes.' }),
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
    this.flickT -= dt; if (this.flickT <= 0) { this.flickT = rand(5, 11); this.sign.material.color.setScalar(0.5); setTimeout(() => this.sign.material.color.setScalar(1), 90); setTimeout(() => this.sign.material.color.setScalar(0.65), 180); setTimeout(() => this.sign.material.color.setScalar(1), 260); }
    this.cabScr.forEach((s, i) => { s.material.color.setScalar(0.78 + 0.22 * Math.sin(t * 2 + i)); });
    this.fx.emit(rand(-25, 25), rand(0.5, 12), rand(-15, 12), rand(-.3, .3), rand(0, .4), rand(-.3, .3), { life: 3.5, size: 0.17, color: pick([0xff2bd6, 0x00e5ff, 0xffe14a]), gravity: 0, shrink: false });
    this.fx.update(dt);
    this.camera.position.x = Math.sin(t * 0.17) * 3.2; this.camera.position.y = 6.2 + Math.sin(t * 0.23) * 0.5; this.camera.lookAt(Math.sin(t * 0.11) * 1.4, 4.4, 0);
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}

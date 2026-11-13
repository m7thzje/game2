import * as THREE from 'three';
import { input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { ui } from './engine/ui.js';
import { scare } from './engine/scare.js';
import { S, load, persist } from './save.js';
import { MinigameMode } from './engine/harness.js';
import { loadGame, loadAllGames } from './games/index.js';
import { Host } from './net/host.js';
import { Particles } from './engine/particles.js';
import { GAMEHAL } from './variant.js';

load();
ui.names = S.names;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.settings.quality !== 'low', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = S.settings.quality !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;

export const app = {
  net: null,
  renderer, input, audio, ui, S, mode: null, games: {},
  setMode(m) {
    if (app.mode && app.mode.exit && !app.mode._exited) { app.mode._exited = true; app.mode.exit(); }
    app.mode = m; if (m) { m._exited = false; m.resize && m.resize(innerWidth, innerHeight); m.enter && m.enter(); }
  },
  async goLobby() { const { GamehalLobby } = await import('./gamehal/lobby.js'); app.setMode(null); app.setMode(new GamehalLobby(app)); },   // Impactid Gamehal: de lobby is het 'titelscherm'
  async goMenu() { if (GAMEHAL) return app.goLobby(); const { MenuMode } = await import('./world/menu.js'); app.setMode(null); app.setMode(new MenuMode(app)); },
  async goHub(opts = {}) { if (GAMEHAL) return app.goArcade(opts); const { HubMode } = await import('./world/hub.js'); app.setMode(null); app.setMode(await HubMode.create(app, opts)); },
  async goEnding(opts = {}) { const { EndingMode } = await import('./world/ending.js'); app.setMode(null); app.setMode(await EndingMode.create(app, opts)); },
  async goBoard(opts = {}) { const { BoardMode } = await import('./world/board.js'); app.setMode(null); app.setMode(await BoardMode.create(app, opts)); },
  async goOpening(opts = {}) { const { OpeningMode } = await import('./world/opening.js'); app.setMode(null); app.setMode(new OpeningMode(app, opts)); },
  async goArcade(opts = {}) { const { ArcadeMode } = await import('./world/arcade.js'); app.setMode(null); app.setMode(await ArcadeMode.create(app, opts)); },
  async playGame(id, { practice = false, back = 'hub', twist = null, extra = null } = {}) {
    const def = await loadGame(id);
    app.setMode(null);
    ui.fade(0, 500);   // kwam uit het dorp met een zwart scherm: nu weer zichtbaar maken
    app.setMode(new MinigameMode(app, def, {
      practice, twist, extra,
      onDone: async (res) => { await ui.fade(1, 300); if (back === 'hub') await app.goHub({ result: res, from: id }); else if (back === 'arcade') await app.goArcade({ result: res, from: id, extra }); else if (back === 'board') await app.goBoard({ result: res, from: id, extra }); else if (back === 'menu') await app.goMenu(); ui.fade(0, 500); },
    }));
  },
};

// Scherpte (S.settings.sharp: 'scherp' | 'normaal' | 'zacht'): bovengrens van de pixelratio. Gamehal: standaard 'scherp' (tot 2x); gewone versie: 'normaal' (1,5x), zoals altijd.
// Defensief gelezen: ontbreekt of ongeldig -> standaard. Kwaliteit 'laag' blijft 1x.
const SHARP = ['scherp', 'normaal', 'zacht'];
const sharpMode = () => (SHARP.includes(S.settings.sharp) ? S.settings.sharp : (GAMEHAL ? 'scherp' : 'normaal'));
const sharpCap = () => (S.settings.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, { scherp: GAMEHAL ? 2 : 1.5, normaal: 1.5, zacht: 1 }[sharpMode()]));
// Automatische resolutieregeling: te traag -> iets minder pixels, snel genoeg -> weer scherper.
// Gamehal: pas na langer aanhoudend traag (4 s) en nooit onder 0,75x; gewone versie ongewijzigd (1 s, ondergrens 0,55x).
const perf = { cap: sharpCap(), scale: 1, ema: 16.7, t: 0, cool: 3, noShadow: false, slow: 0, floor: GAMEHAL ? 0.75 : 0.55 };
perf.scale = perf.cap;
function resize() {
  const q = perf.scale;
  renderer.setPixelRatio(q); Particles.ratio = q;
  renderer.setSize(innerWidth, innerHeight, false);
  if (app.mode && app.mode.resize) app.mode.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();
// Scherpte wisselen (lobby-menu): nieuwe bovengrens en meteen toepassen
app.sharpMode = sharpMode;
app.setSharp = (m) => { if (!SHARP.includes(m)) return; S.settings.sharp = m; persist(); perf.cap = sharpCap(); perf.scale = perf.cap; perf.slow = 0; perf.cool = 3; resize(); };
if (GAMEHAL) THREE.Texture.DEFAULT_ANISOTROPY = Math.min(8, renderer.capabilities.getMaxAnisotropy());   // schuin bekeken vloeren en borden minder wazig

let last = performance.now(), fpsT = 0, fpsN = 0;
function adapt(ft) {
  perf.ema = perf.ema * 0.92 + Math.min(ft, 100) * 0.08; perf.t += ft / 1000; perf.cool -= ft / 1000;
  if (perf.t < 1 || perf.cool > 0) return; perf.t = 0;
  perf.slow = perf.ema > 24 ? perf.slow + 1 : 0;
  const need = GAMEHAL ? 4 : 1, step = GAMEHAL ? 0.9 : 0.85;   // Gamehal: 4 trage seconden achter elkaar
  if (perf.slow >= need && perf.scale > perf.floor) { perf.scale = Math.max(perf.floor, perf.scale * step); perf.cool = GAMEHAL ? 4 : 2; perf.slow = 0; resize(); app.perfInfo = perf; }
  else if (perf.ema > 30 && perf.scale <= perf.floor + 0.05 && !perf.noShadow) { // nog steeds traag: schaduwen uit
    perf.noShadow = true; renderer.shadowMap.enabled = false;
    if (app.mode && app.mode.scene) app.mode.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    perf.cool = 3;
  } else if (perf.ema < 15.5 && perf.scale < perf.cap) { perf.scale = Math.min(perf.cap, perf.scale * 1.08); perf.cool = 6; resize(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  adapt(now - last);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!scare.active) input.update();
  if (!scare.active) { ui.update(dt); }
  if (app.mode) {
    if (!scare.active) app.mode.update(dt);
    app.mode.render ? app.mode.render(renderer) : null;
  }
  if (app.net) app.net.afterRender(dt);
  S.playTime += dt;
  fpsT += dt; fpsN++; if (fpsT > 1) { app.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
}

// M = geluid uit/aan
addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) { audio.init(); const m = audio.toggleMute(); ui.hud.toast && ui.hud.toast(m ? '🔇 Geluid uit' : '🔊 Geluid aan', 900); } });
const unlock = () => { audio.init(); if (audio.ctx && !audio.musicName && app.mode) audio.resumeMusic(); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
setInterval(() => persist(), 15000);

async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.has('scare')) S.settings.scare = +q.get('scare');
  if (q.has('players')) { const n = +q.get('players'); S.settings.players = n === 4 ? 4 : n === 3 ? 3 : 2; }   // ?players=2|3|4 (tests)
  if (q.has('unlock')) S.settings.unlockAll = q.get('unlock') !== '0';   // ?unlock=1: alle hallen open (handig voor tests)
  if (q.has('quality')) { S.settings.quality = q.get('quality'); renderer.shadowMap.enabled = S.settings.quality !== 'low'; resize(); }
  app.games = await loadAllGames();
  document.getElementById('boot').remove();
  requestAnimationFrame(frame);
  if (q.has('game')) { S.settings.scare = q.has('scare') ? +q.get('scare') : 0; await app.playGame(q.get('game'), { practice: true, back: 'menu' }); }
  else if (q.has('hub')) await app.goHub({});
  else if (q.has('opening')) await app.goOpening({});
  else if (q.has('arcade')) await app.goArcade({ intro: q.get('arcade') === 'intro' });
  else if (GAMEHAL) await app.goLobby();
  else await app.goMenu();
}
app.net = new Host(app);
app.perf = perf;
window.__app = app;
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;background:#200;color:#fcc;padding:20px;z-index:99;white-space:pre-wrap">${e.stack || e}</pre>`); });

import * as THREE from 'three';
import { input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { ui } from './engine/ui.js';
import { scare } from './engine/scare.js';
import { S, load, persist } from './save.js';
import { MinigameMode } from './engine/harness.js';
import { loadGame, loadAllGames } from './games/index.js';

load();
ui.names = S.names;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.settings.quality !== 'low', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = S.settings.quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const app = {
  renderer, input, audio, ui, S, mode: null, games: {},
  setMode(m) {
    if (app.mode && app.mode.exit && !app.mode._exited) { app.mode._exited = true; app.mode.exit(); }
    app.mode = m; if (m) { m._exited = false; m.resize && m.resize(innerWidth, innerHeight); m.enter && m.enter(); }
  },
  async goMenu() { const { MenuMode } = await import('./world/menu.js'); app.setMode(new MenuMode(app)); },
  async goHub(opts = {}) { const { HubMode } = await import('./world/hub.js'); app.setMode(new HubMode(app, opts)); },
  async playGame(id, { practice = false, back = 'hub' } = {}) {
    const def = await loadGame(id);
    app.setMode(new MinigameMode(app, def, {
      practice,
      onDone: async (res) => { await ui.fade(1, 300); if (back === 'hub') await app.goHub({ result: res, from: id }); else if (back === 'menu') await app.goMenu(); ui.fade(0, 500); },
    }));
  },
};

function resize() {
  const q = S.settings.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(q);
  renderer.setSize(innerWidth, innerHeight, false);
  if (app.mode && app.mode.resize) app.mode.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();

let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!scare.active) input.update();
  if (!scare.active) { ui.update(dt); }
  if (app.mode) {
    if (!scare.active) app.mode.update(dt);
    app.mode.render ? app.mode.render(renderer) : null;
  }
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
  if (q.has('quality')) { S.settings.quality = q.get('quality'); renderer.shadowMap.enabled = S.settings.quality !== 'low'; resize(); }
  app.games = await loadAllGames();
  document.getElementById('boot').remove();
  requestAnimationFrame(frame);
  if (q.has('game')) { S.settings.scare = q.has('scare') ? +q.get('scare') : 0; await app.playGame(q.get('game'), { practice: true, back: 'menu' }); }
  else if (q.has('hub')) await app.goHub({});
  else await app.goMenu();
}
window.__app = app;
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;background:#200;color:#fcc;padding:20px;z-index:99;white-space:pre-wrap">${e.stack || e}</pre>`); });

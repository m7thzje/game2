import { input } from './input.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { S } from '../save.js';
import { drawScareFace } from './chars.js';
import { h } from './util.js';

const cv = document.getElementById('scare');
const g = cv.getContext('2d');
function fit() { cv.width = Math.min(1280, innerWidth); cv.height = Math.round(cv.width * innerHeight / innerWidth); }
addEventListener('resize', fit); fit();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));

// Deurman op de rand van het scherm, in een deuropening
function drawDoorScene(open, t, side, approach, flick) {
  const w = cv.width, hh = cv.height;
  g.clearRect(0, 0, w, hh);
  const dark = Math.min(0.78, open * 0.8);
  g.fillStyle = `rgba(0,0,6,${dark})`; g.fillRect(0, 0, w, hh);
  const dh = hh * 0.82, dw = dh * 0.46, x0 = side < 0 ? w * 0.06 : w - dw - w * 0.06, y0 = hh - dh - hh * 0.02;
  // kozijn
  g.fillStyle = '#2a1a0e'; g.fillRect(x0 - 14, y0 - 14, dw + 28, dh + 14);
  const grd = g.createLinearGradient(0, y0, 0, y0 + dh); grd.addColorStop(0, '#000'); grd.addColorStop(1, '#0a0508'); g.fillStyle = grd; g.fillRect(x0, y0, dw, dh);
  // gloed achter hem
  const rg = g.createRadialGradient(x0 + dw / 2, y0 + dh * 0.3, 5, x0 + dw / 2, y0 + dh * 0.4, dh * 0.6); rg.addColorStop(0, `rgba(120,10,10,${0.35 * open})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x0, y0, dw, dh);
  // figuur
  if (open > 0.5) {
    const k = Math.min(1, (open - 0.5) * 2) * (flick ? (Math.random() < 0.25 ? 0 : 1) : 1);
    g.save(); g.beginPath(); g.rect(x0, y0, dw, dh); g.clip();
    g.globalAlpha = k; const sc = 1 + approach * 0.5; const cx = x0 + dw / 2, base = y0 + dh * 1.02;
    g.translate(cx, base); g.scale(sc, sc); g.translate(-cx, -base);
    const fh = dh * 1.25;
    g.fillStyle = '#050508';
    g.fillRect(cx - dw * 0.17, base - fh * 0.62, dw * 0.34, fh * 0.62);                 // pak
    g.fillRect(cx - dw * 0.36, base - fh * 0.74, dw * 0.72, fh * 0.14);                 // schouders
    g.fillRect(cx - dw * 0.4, base - fh * 0.68, dw * 0.07, fh * 0.55);                  // arm L
    g.fillRect(cx + dw * 0.33, base - fh * 0.68, dw * 0.07, fh * 0.55);                 // arm R
    g.fillStyle = '#e8e8e4'; g.fillRect(cx - dw * 0.02, base - fh * 0.7, dw * 0.04, fh * 0.2); // overhemd
    g.fillStyle = '#7a0a0a'; g.fillRect(cx - dw * 0.012, base - fh * 0.66, dw * 0.024, fh * 0.15); // stropdas
    const hx = cx + Math.sin(t * 1.3) * 3 + (Math.random() < 0.05 ? (Math.random() - .5) * 18 : 0), hy = base - fh * 0.86;
    g.fillStyle = '#ecece8'; g.beginPath(); g.ellipse(hx, hy, dw * 0.13, dw * 0.19, 0, 0, 7); g.fill();
    g.fillStyle = '#000'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(hx + sx * dw * 0.055, hy - dw * 0.03, dw * 0.032, dw * 0.05, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ff2a1a'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(hx + sx * dw * 0.055, hy - dw * 0.02, 1.8, 0, 7); g.fill(); }
    g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(hx - dw * 0.1, hy + dw * 0.07); g.quadraticCurveTo(hx, hy + dw * 0.17, hx + dw * 0.1, hy + dw * 0.07); g.stroke();
    g.restore();
  }
  // deurvleugel (zwaait open)
  const leafW = dw * Math.cos(open * 1.35);
  if (open < 0.98) {
    const hx = side < 0 ? x0 : x0 + dw; const dir = side < 0 ? 1 : -1;
    g.fillStyle = '#6b4226'; g.beginPath();
    g.moveTo(hx, y0); g.lineTo(hx + dir * leafW, y0 + open * 24); g.lineTo(hx + dir * leafW, y0 + dh - open * 24); g.lineTo(hx, y0 + dh); g.closePath(); g.fill();
    g.strokeStyle = '#3a2412'; g.lineWidth = 4; g.stroke();
  }
}

export const scare = {
  active: false,
  level() { return S.settings.scare; },
  async jumpscare({ strong = true } = {}) {
    if (this.level() <= 0) return;
    this.active = true;
    const soft = this.level() === 1 || S.settings.flashFree;
    cv.style.display = 'block';
    audio.sfx(this.level() === 1 ? 'scareSoft' : 'scare');
    S.scared = (S.scared || 0) + 1;
    const dur = soft ? 1100 : 900; const t0 = performance.now();
    while (true) {
      const t = (performance.now() - t0) / dur; if (t >= 1) break;
      g.globalAlpha = 1; drawScareFace(g, cv.width, cv.height, t, soft ? 0.25 : 1);
      if (soft) { g.fillStyle = `rgba(0,0,0,${Math.max(0, (t - 0.5) * 1.4)})`; g.fillRect(0, 0, cv.width, cv.height); }
      await raf();
    }
    cv.style.display = 'none'; g.clearRect(0, 0, cv.width, cv.height);
    if (!soft) ui.flash('#000', 600);
    this.active = false;
  },
  // Deur gaat open, Deurman staat erin. Niet bewegen! -> { caught }
  async stare({ side = Math.random() < 0.5 ? -1 : 1, hold = 2.6, label = 'STIL STAAN!' } = {}) {
    this.active = true; S.sightings = (S.sightings || 0) + 1;
    const lvl = this.level();
    cv.style.display = 'block';
    audio.duck(true); audio.sfx('creak');
    let t = 0, open = 0, last = performance.now(); let caught = false; let movers = [false, false]; let phase = 0; let phaseT = 0; let hb = 0;
    ui.setVignette(0.6);
    const banner = h('div', { class: 'hud-big', style: { color: '#ff4a4a', top: '14%', fontSize: 'min(9vw,84px)' } }, label); ui.screens.append(banner);
    while (true) {
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; phaseT += dt;
      input.update();
      if (phase === 0) { open = Math.min(1, phaseT / 1.5); if (phaseT > 1.5) { phase = 1; phaseT = 0; } }
      else if (phase === 1) {
        hb -= dt; if (hb <= 0) { audio.sfx('heartbeat'); hb = 0.75; }
        open = 1;
        if (phaseT > 0.35 && (input.p[0].any || input.p[1].any)) { caught = true; movers = [input.p[0].any, input.p[1].any]; break; }
        if (phaseT > hold) break;
      }
      const flick = lvl >= 2 && phase === 1;
      drawDoorScene(open, t, side, phase === 1 ? phaseT / hold : 0, flick);
      ui.setVignette(0.6 + 0.25 * Math.sin(t * 9) * (phase === 1 ? 1 : 0));
      await raf();
    }
    banner.remove();
    if (caught) {
      if (lvl >= 2) await this.jumpscare();
      else { audio.sfx('scareSoft'); await wait(500); }
    } else {
      audio.sfx('slam'); ui.flash('#000', 300);
      await wait(250);
    }
    cv.style.display = 'none'; g.clearRect(0, 0, cv.width, cv.height);
    ui.setVignette(0); audio.duck(false); input.reset();
    this.active = false;
    return { caught, movers };
  },
  // lichten gaan even uit / flikkeren zonder gevolg (sfeer)
  async flicker(n = 4) {
    if (this.level() <= 0) return;
    audio.sfx('static');
    const flashFree = S.settings.flashFree;
    for (let i = 0; i < n; i++) { ui.setVignette(flashFree ? 0.5 : 1); await wait(70 + Math.random() * 120); ui.setVignette(0.1); await wait(60 + Math.random() * 160); }
    ui.setVignette(0);
  },
};

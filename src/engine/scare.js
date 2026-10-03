// De Deurman als meme: grappige 'DEURMAN-BOEM!' (cartoon-gezicht + confetti + toeter), 'DEURMAN KIJKT! STIL STAAN!' (stare)
// en vrolijke discoflikkering (flicker). Instelling S.settings.scare = Deurman-gedrag: 0 Uit, 1 Af en toe, 2 Vaak, 3 Overal!.
// Geen flitsen: bij flashFree is alles zacht (geen schudden, geen wisselende kleuren, trage fades).
import { input } from './input.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { S } from '../save.js';
import { drawDeurFace } from './chars.js';
import { h, pick } from './util.js';

const cv = document.getElementById('scare');
const g = cv.getContext('2d');
function fit() { cv.width = Math.min(1280, innerWidth); cv.height = Math.round(cv.width * innerHeight / innerWidth); }
addEventListener('resize', fit); fit();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const CONFETTI = ['#ff4aa8', '#ffe14a', '#4ac8ff', '#7bff7b', '#ff9a2a', '#b06aff'];

// Deurman in een (vrolijke) deuropening, kijkt met grote ogen
function drawDoorScene(open, t, side, approach, blinkT) {
  const w = cv.width, hh = cv.height;
  g.clearRect(0, 0, w, hh);
  g.fillStyle = `rgba(70,20,110,${0.22 * open})`; g.fillRect(0, 0, w, hh);
  const dh = hh * 0.82, dw = dh * 0.46, x0 = side < 0 ? w * 0.06 : w - dw - w * 0.06, y0 = hh - dh - hh * 0.02;
  // kozijn + licht erachter
  g.fillStyle = '#7a4a22'; g.fillRect(x0 - 14, y0 - 14, dw + 28, dh + 14);
  const grd = g.createLinearGradient(0, y0, 0, y0 + dh); grd.addColorStop(0, '#fff2a8'); grd.addColorStop(1, '#ff9ad5'); g.fillStyle = grd; g.fillRect(x0, y0, dw, dh);
  // slingers aan het kozijn
  g.strokeStyle = '#ff4aa8'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0 - 14, y0 - 6); g.quadraticCurveTo(x0 + dw / 2, y0 + 34, x0 + dw + 14, y0 - 6); g.stroke();
  g.strokeStyle = '#4ac8ff'; g.beginPath(); g.moveTo(x0 - 14, y0 + 4); g.quadraticCurveTo(x0 + dw / 2, y0 + 48, x0 + dw + 14, y0 + 4); g.stroke();
  if (open > 0.5) {
    const k = Math.min(1, (open - 0.5) * 2);
    g.save(); g.beginPath(); g.rect(x0, y0, dw, dh); g.clip();
    const cx = x0 + dw / 2, sc = 1 + approach * 0.35, base = y0 + dh * 1.02;
    g.globalAlpha = k; g.translate(cx, base); g.scale(sc, sc); g.translate(-cx, -base);
    const s = dw * 0.34, hy = y0 + dh * 0.34 + (1 - k) * 60 + Math.sin(t * 5) * 3;
    // pak tot de grond + zwaaiende lange arm
    g.fillStyle = '#101014'; g.fillRect(cx - dw * 0.17, hy + s * 0.5, dw * 0.34, base - hy);
    g.fillRect(cx - dw * 0.4, hy + s * 0.55, dw * 0.07, dh * 0.55);
    g.save(); g.translate(cx + dw * 0.2, hy + s * 0.75); g.rotate(-2.3 + Math.sin(t * 9) * 0.3); g.fillRect(-dw * 0.035, 0, dw * 0.07, dh * 0.5);
    g.fillStyle = '#f3f3ee'; g.beginPath(); g.arc(0, dh * 0.52, dw * 0.1, 0, 7); g.fill(); g.restore();
    const blink = (blinkT % 1.3) > 1.18 ? 1 : 0;
    drawDeurFace(g, cx, hy, s, { hat: 'party', open: 0.55 + 0.25 * Math.sin(t * 6), eye: 1.35, blink, look: [Math.sin(t * 2.2), 0.3], t });
    g.restore();
  }
  // deurvleugel (zwaait open)
  const leafW = dw * Math.cos(open * 1.35);
  if (open < 0.98) {
    const hx = side < 0 ? x0 : x0 + dw; const dir = side < 0 ? 1 : -1;
    g.fillStyle = '#b87a3a'; g.beginPath();
    g.moveTo(hx, y0); g.lineTo(hx + dir * leafW, y0 + open * 24); g.lineTo(hx + dir * leafW, y0 + dh - open * 24); g.lineTo(hx, y0 + dh); g.closePath(); g.fill();
    g.strokeStyle = '#6a4220'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(hx + dir * leafW * 0.85, y0 + dh * 0.5, 7, 0, 7); g.fill();
  }
}

export const scare = {
  active: false,
  level() { return S.settings.scare; },
  // DEURMAN-BOEM!: zijn cartoon-gezicht knalt in beeld (met overshoot), confetti, toeter/boing. Variant: 'party' | 'stache' | 'shades' | 'crown'.
  async jumpscare({ strong = true, variant = null, text = 'BOEM!' } = {}) {
    if (this.level() <= 0) return;
    this.active = true;
    const soft = this.level() === 1 || !!S.settings.flashFree;
    cv.style.display = 'block';
    variant = variant || pick(['party', 'stache', 'shades', 'crown']);
    const sfxSet = pick([['airhorn', 'boing'], ['squeak', 'tada'], ['honk', 'trombone'], ['boing', 'party']]);
    audio.sfx(sfxSet[0], { vol: soft ? 0.6 : 1 }); setTimeout(() => audio.sfx(sfxSet[1], { vol: soft ? 0.6 : 1 }), 280);
    S.scared = (S.scared || 0) + 1;
    const w = cv.width, hh = cv.height;
    const parts = []; for (let i = 0; i < (soft ? 40 : 90); i++) { const a = Math.random() * 7, v = 200 + Math.random() * 700; parts.push({ x: w / 2, y: hh * 0.55, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 250, r: Math.random() * 7, vr: (Math.random() - .5) * 12, c: pick(CONFETTI), sz: 6 + Math.random() * 9 }); }
    const dur = soft ? 1900 : 1500; const t0 = performance.now(); let last = t0;
    while (true) {
      const now = performance.now(); const t = (now - t0) / dur; if (t >= 1) break; const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const inn = Math.min(1, t / 0.22), out = t > 0.82 ? (t - 0.82) / 0.18 : 0;
      const sc = easeOutBack(inn) * (soft ? 0.78 : 1) * (1 - out * 0.5);
      g.clearRect(0, 0, w, hh);
      // zachte kleurachtergrond met draaiende stralen (geen flits)
      g.globalAlpha = Math.min(1, inn * 1.2) * (1 - out); g.fillStyle = '#ffd34a'; g.fillRect(0, 0, w, hh);
      const rot = soft ? 0 : t * 1.2; g.save(); g.translate(w / 2, hh * 0.55); g.rotate(rot);
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#ff7ac8' : '#ffb347'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w, i / 14 * 6.2832, (i + 1) / 14 * 6.2832); g.closePath(); g.fill(); }
      g.restore();
      const s = Math.min(w, hh) * 0.44 * sc; const wob = soft ? 0 : Math.sin(t * 40) * 0.015 * (1 - inn);
      g.globalAlpha = 1 - out * 0.6;
      g.save(); g.translate(w / 2, hh * 0.6); g.rotate(wob); g.translate(-w / 2, -hh * 0.6);
      drawDeurFace(g, w / 2, hh * 0.6, s, { hat: variant === 'party' ? 'party' : variant === 'crown' ? 'crown' : null, stache: variant === 'stache', shades: variant === 'shades', open: 0.4 + 0.6 * Math.abs(Math.sin(t * 9)), eye: 1.3, look: [Math.sin(t * 3) * 0.5, 0.1], blink: (t * 7) % 1 > 0.92 ? 1 : 0, t: soft ? 0 : t });
      g.restore();
      // tekstwolk
      g.save(); g.translate(w / 2, hh * 0.13); g.rotate(-0.1 + (soft ? 0 : Math.sin(t * 14) * 0.03)); const fs = Math.min(w * 0.16, hh * 0.2) * Math.min(1, inn * 1.3) * (1 + (soft ? 0 : Math.sin(t * 18) * 0.04));
      g.font = `bold ${fs}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = fs * 0.2; g.strokeStyle = '#2a0a3a'; g.strokeText(text, 0, 0); g.fillStyle = '#fff'; g.fillText(text, 0, 0); g.restore();
      // confetti
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.vx *= 0.99; p.r += p.vr * dt; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = 1 - out; g.fillRect(-p.sz / 2, -p.sz / 4, p.sz, p.sz / 2); g.restore(); }
      await raf();
    }
    cv.style.display = 'none'; g.clearRect(0, 0, cv.width, cv.height); g.globalAlpha = 1;
    this.active = false;
  },
  // Deur gaat open, Deurman staat erin met grote ogen. Stil blijven staan! -> { caught, movers }
  async stare({ side = Math.random() < 0.5 ? -1 : 1, hold = 2.6, label = 'DEURMAN KIJKT! STIL STAAN!' } = {}) {
    this.active = true; S.sightings = (S.sightings || 0) + 1;
    const lvl = this.level();
    cv.style.display = 'block';
    const prevMusic = audio.musicName; audio.music('deurchase'); audio.sfx('doorbell');
    let t = 0, open = 0, last = performance.now(); let caught = false; let movers = [false, false]; let phase = 0; let phaseT = 0; let beep = 0;
    const banner = h('div', { class: 'hud-big deur-stare', style: { top: '12%' } }, label);
    const bar = h('div', { class: 'deur-hold' }, h('i')); ui.screens.append(banner, bar);
    const fill = bar.firstChild;
    while (true) {
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; phaseT += dt;
      input.update();
      if (phase === 0) { open = Math.min(1, phaseT / 1.3); if (phaseT > 1.3) { phase = 1; phaseT = 0; audio.sfx('squeak'); } }
      else if (phase === 1) {
        beep -= dt; if (beep <= 0) { audio.sfx('boop', { rate: 0.9 + 0.5 * (phaseT / hold), vol: 0.7 }); beep = 0.5; }
        open = 1; fill.style.width = Math.max(0, 100 * (1 - phaseT / hold)) + '%';
        if (phaseT > 0.35 && (input.p[0].any || input.p[1].any)) { caught = true; movers = [input.p[0].any, input.p[1].any]; break; }
        if (phaseT > hold) break;
      }
      drawDoorScene(open, t, side, phase === 1 ? phaseT / hold : 0, t);
      await raf();
    }
    banner.remove(); bar.remove();
    if (caught) {
      cv.style.display = 'none'; g.clearRect(0, 0, cv.width, cv.height); this.active = false;
      if (lvl >= 2) await this.jumpscare({ variant: 'party', text: 'BOEM!' });
      else { audio.sfx('boing'); await wait(500); }
      this.active = true;
    } else {
      audio.sfx('tada'); audio.sfx('door'); await wait(450);
    }
    cv.style.display = 'none'; g.clearRect(0, 0, cv.width, cv.height);
    audio.music(prevMusic); input.reset();
    this.active = false;
    return { caught, movers };
  },
  // discoflikkering: even regenboog-lichtjes (feestje!) zonder gevolg. Bij flashFree: één zachte kleurzwaai.
  async flicker(n = 4) {
    if (this.level() <= 0) return;
    audio.sfx('party');
    const el = h('div', { class: 'deur-disco' + (S.settings.flashFree ? ' soft' : '') }); document.getElementById('app').append(el);
    await wait(S.settings.flashFree ? 1200 : Math.max(900, n * 320));
    el.remove();
  },
};

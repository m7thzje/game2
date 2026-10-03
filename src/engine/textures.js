import * as THREE from 'three';
import { canvasTex, mulberry32 } from './util.js';

// Alle textures worden procedureel getekend met canvas. tex.xxx(repeatX, repeatY)
const cache = new Map();
function make(key, w, h, draw, rx = 1, ry = 1) {
  const k = `${key}|${rx}|${ry}`;
  if (cache.has(k)) return cache.get(k);
  const t = canvasTex(w, h, draw, { repeat: [rx, ry] });
  t.userData.keep = true;
  cache.set(k, t);
  return t;
}
function speckle(g, w, h, n, colors, size = 2, seed = 1) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

export const tex = {
  grass(rx = 1, ry = 1) {
    return make('grass', 256, 256, (g, w, h) => {
      g.fillStyle = '#6dbb4a'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1400, ['#5aa83c', '#7ccd55', '#4f9b34', '#88d65e', '#66b244'], 3, 7);
      const r = mulberry32(3);
      g.strokeStyle = 'rgba(40,110,30,.35)'; g.lineWidth = 1.2;
      for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 4, y - 4 - r() * 5); g.stroke(); }
      for (let i = 0; i < 14; i++) { g.fillStyle = r() < .5 ? '#fff6a8' : '#ffd1e8'; g.beginPath(); g.arc(r() * w, r() * h, 1.6, 0, 7); g.fill(); }
    }, rx, ry);
  },
  dirt(rx = 1, ry = 1) {
    return make('dirt', 256, 256, (g, w, h) => {
      g.fillStyle = '#9a7650'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1200, ['#8a6842', '#a88259', '#7c5c3a', '#b08d63'], 3, 11);
      speckle(g, w, h, 60, ['#6d6d6d', '#8b8b8b'], 4, 12);
    }, rx, ry);
  },
  sand(rx = 1, ry = 1) {
    return make('sand', 256, 256, (g, w, h) => {
      g.fillStyle = '#e6d39b'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1500, ['#d9c488', '#f0e0ae', '#cdb779'], 2, 5);
    }, rx, ry);
  },
  cobble(rx = 1, ry = 1) {
    return make('cobble', 256, 256, (g, w, h) => {
      g.fillStyle = '#6e6a66'; g.fillRect(0, 0, w, h);
      const r = mulberry32(9);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const ox = (y % 2) * 16; const cx = x * 32 + ox + 2, cy = y * 32 + 2;
        const l = 128 + Math.floor(r() * 60);
        g.fillStyle = `rgb(${l},${l - 6},${l - 14})`;
        g.beginPath(); g.roundRect(cx, cy, 28, 28, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(cx + 3, cy + 3, 10, 3);
      }
    }, rx, ry);
  },
  stone(rx = 1, ry = 1) {
    return make('stone', 256, 256, (g, w, h) => {
      g.fillStyle = '#9b9ca3'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 900, ['#8c8d94', '#a8a9b0', '#7f8087'], 3, 4);
      g.strokeStyle = 'rgba(40,40,50,.5)'; g.lineWidth = 2;
      for (let y = 0; y < 4; y++) {
        g.beginPath(); g.moveTo(0, y * 64); g.lineTo(w, y * 64); g.stroke();
        for (let x = 0; x < 4; x++) { const ox = (y % 2) * 32; g.beginPath(); g.moveTo(x * 64 + ox, y * 64); g.lineTo(x * 64 + ox, y * 64 + 64); g.stroke(); }
      }
    }, rx, ry);
  },
  planks(rx = 1, ry = 1, base = '#a9774a') {
    return make('planks' + base, 256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const r = mulberry32(21);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},${0.05 + r() * .08})`; g.fillRect(0, i * 32, w, 32);
        g.strokeStyle = 'rgba(50,30,15,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
        g.strokeStyle = 'rgba(60,35,15,.25)'; g.lineWidth = 1;
        for (let k = 0; k < 4; k++) { g.beginPath(); const y = i * 32 + 4 + r() * 24; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 3, w * .6, y - 3, w, y + 1); g.stroke(); }
      }
    }, rx, ry);
  },
  bricks(rx = 1, ry = 1) {
    return make('bricks', 256, 256, (g, w, h) => {
      g.fillStyle = '#c9b9a0'; g.fillRect(0, 0, w, h);
      const r = mulberry32(31);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        const ox = (y % 2) * 32; const l = 150 + r() * 40;
        g.fillStyle = `rgb(${l + 30},${l - 40},${l - 60})`; g.fillRect(x * 64 + ox + 2, y * 32 + 2, 60, 28);
      }
    }, rx, ry);
  },
  plaster(rx = 1, ry = 1, base = '#efe2c4') {
    return make('plaster' + base, 128, 128, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.12)', 'rgba(120,90,50,.08)'], 3, 8);
    }, rx, ry);
  },
  thatch(rx = 1, ry = 1) {
    return make('thatch', 256, 256, (g, w, h) => {
      g.fillStyle = '#c9a54a'; g.fillRect(0, 0, w, h);
      const r = mulberry32(5);
      for (let i = 0; i < 700; i++) { const x = r() * w; g.strokeStyle = `rgba(${90 + r() * 80},${70 + r() * 60},20,.6)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, r() * h); g.lineTo(x + (r() - .5) * 6, r() * h + 24); g.stroke(); }
    }, rx, ry);
  },
  roof(rx = 1, ry = 1, base = '#b5483a') {
    return make('roof' + base, 256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const ox = (y % 2) * 16;
        g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x * 32 + ox + 16, y * 32, 17, 0, Math.PI); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.beginPath(); g.arc(x * 32 + ox + 16, y * 32, 16, 0.2, Math.PI - .2); g.stroke();
      }
    }, rx, ry);
  },
  water(rx = 1, ry = 1) {
    return make('water', 256, 256, (g, w, h) => {
      g.fillStyle = '#3d8fd1'; g.fillRect(0, 0, w, h);
      const r = mulberry32(14);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
      for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 10, y - 5, x + 22, y + 5, x + 34, y); g.stroke(); }
    }, rx, ry);
  },
  checker(rx = 1, ry = 1, a = '#e8dcc2', b = '#b8a888') {
    return make('checker' + a + b, 128, 128, (g, w, h) => {
      g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
      speckle(g, w, h, 300, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.08)'], 2, 2);
    }, rx, ry);
  },
  snow(rx = 1, ry = 1) {
    return make('snow', 128, 128, (g, w, h) => {
      g.fillStyle = '#eef6ff'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, ['#dbe9fa', '#ffffff', '#cfe0f5'], 2, 3);
    }, rx, ry);
  },
  ice(rx = 1, ry = 1) {
    return make('ice', 256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#bfe8ff'); gr.addColorStop(1, '#8fcdf2'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = mulberry32(2); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
    }, rx, ry);
  },
  lava(rx = 1, ry = 1) {
    return make('lava', 256, 256, (g, w, h) => {
      g.fillStyle = '#c1360a'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, ['#ff8a1c', '#ffd23f', '#8d2105'], 6, 6);
    }, rx, ry);
  },
  carpet(rx = 1, ry = 1) {
    return make('carpet', 128, 128, (g, w, h) => {
      g.fillStyle = '#8c1f2e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e0b84a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#e0b84a'; g.beginPath(); g.moveTo(w / 2, 24); g.lineTo(w - 24, h / 2); g.lineTo(w / 2, h - 24); g.lineTo(24, h / 2); g.fill();
      g.fillStyle = '#8c1f2e'; g.beginPath(); g.moveTo(w / 2, 40); g.lineTo(w - 40, h / 2); g.lineTo(w / 2, h - 40); g.lineTo(40, h / 2); g.fill();
    }, rx, ry);
  },
  tiles(rx = 1, ry = 1, a = '#d8d2c4', b = '#a89f8e') {
    return make('tiles' + a + b, 128, 128, (g, w, h) => {
      g.fillStyle = b; g.fillRect(0, 0, w, h); g.fillStyle = a; g.fillRect(3, 3, w / 2 - 6, h / 2 - 6); g.fillRect(w / 2 + 3, 3, w / 2 - 6, h / 2 - 6); g.fillRect(3, h / 2 + 3, w / 2 - 6, h / 2 - 6); g.fillRect(w / 2 + 3, h / 2 + 3, w / 2 - 6, h / 2 - 6);
    }, rx, ry);
  },
  // canvas voor posters / uithangborden: tekst op een gekleurd paneel
  sign(text, { bg = '#5b3a1e', fg = '#ffe9b0', w = 256, h = 96, size = 36, font = 'MedievalSharp, serif', border = '#2e1b0c' } = {}) {
    const key = `sign|${text}|${bg}|${fg}`;
    if (cache.has(key)) return cache.get(key);
    const t = canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = fg; g.font = `bold ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const lines = String(text).split('\n');
      lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05, w - 20));
    });
    t.userData.keep = true; cache.set(key, t); return t;
  },
  // poster van de YouTuber
  poster(name = 'DJ Dobber') {
    const key = 'poster' + name;
    if (cache.has(key)) return cache.get(key);
    const t = canvasTex(256, 384, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff3d81'); gr.addColorStop(1, '#5a1fd1'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.12)';
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(w / 2, 150); g.lineTo(w / 2 + Math.cos(i / 12 * 6.283) * 400, 150 + Math.sin(i / 12 * 6.283) * 400); g.lineTo(w / 2 + Math.cos((i + .5) / 12 * 6.283) * 400, 150 + Math.sin((i + .5) / 12 * 6.283) * 400); g.fill(); }
      // hoofd
      g.fillStyle = '#ffd9b3'; g.beginPath(); g.arc(w / 2, 140, 52, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.ellipse(w / 2 - 18, 132, 6, 8, 0, 0, 7); g.ellipse(w / 2 + 18, 132, 6, 8, 0, 0, 7); g.fill();
      g.strokeStyle = '#a33'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, 150, 22, .2, Math.PI - .2); g.stroke();
      g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(w / 2 - 55, 110); for (let i = 0; i < 6; i++) g.lineTo(w / 2 - 55 + i * 22, i % 2 ? 90 : 62); g.lineTo(w / 2 + 55, 110); g.fill();
      g.fillStyle = '#111'; g.fillRect(w / 2 - 36, 118, 72, 8); // zonnebril balk
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif';
      g.fillText(name.toUpperCase(), w / 2, 250);
      g.font = 'bold 28px Fredoka, sans-serif'; g.fillStyle = '#ffe14a'; g.fillText('LIVE FEEST', w / 2, 290);
      g.font = '20px Fredoka, sans-serif'; g.fillStyle = '#fff'; g.fillText('Gratis voor alle spelers!', w / 2, 330);
      g.font = '18px Fredoka, sans-serif'; g.fillText('★ ★ ★', w / 2, 360);
    });
    t.userData.keep = true; cache.set(key, t); return t;
  },
};

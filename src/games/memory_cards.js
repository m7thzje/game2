import * as THREE from 'three';
import { canvasTex, TAU } from '../engine/util.js';

// Kaarten voor het Geheugen-Duel: procedurele canvas-pictogrammen (geen emoji's nodig) + de 3D-kaart zelf.

export const CW = 1.45, CH = 2.0, CT = 0.09;      // kaartbreedte, -diepte (z), -dikte
const TW = 256, TH = 352;

const FONT = (s) => `bold ${s}px Fredoka, Arial Black, Arial, sans-serif`;

function star(g, cx, cy, r1, r2, n, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath();
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function glowDot(g, x, y, r, c = 'rgba(255,255,255,.9)') { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function sparkle(g, x, y, r, c = '#fff') { g.fillStyle = c; star(g, x, y, r, r * 0.22, 4); g.fill(); }

// ---- pictogrammen: tekenen in het vak (0..256 x 0..352), midden (128,168) ----
const ICONS = {
  dragon(g) {
    glowDot(g, 128, 170, 100, 'rgba(120,255,160,.35)');
    g.fillStyle = '#2a7a40'; for (const x of [108, 128, 148]) { g.beginPath(); g.moveTo(x - 10, 122); g.lineTo(x, 96); g.lineTo(x + 10, 122); g.fill(); }
    g.fillStyle = '#f4e8c4'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 36, 132); g.lineTo(128 + s * 66, 84); g.lineTo(128 + s * 58, 138); g.closePath(); g.fill(); g.strokeStyle = '#b8a070'; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = '#3aa655'; g.strokeStyle = '#1f6a38'; g.lineWidth = 6; g.beginPath(); g.ellipse(128, 168, 68, 58, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#2a8a46'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 62, 150); g.lineTo(128 + s * 98, 170); g.lineTo(128 + s * 62, 188); g.closePath(); g.fill(); }
    g.fillStyle = '#5ec878'; rr(g, 92, 178, 72, 56, 24); g.fill(); g.stroke();
    g.fillStyle = '#15402a'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 16, 204, 5, 8, 0, 0, TAU); g.fill(); }
    for (const s of [-1, 1]) { g.fillStyle = '#ffe14a'; g.strokeStyle = '#1f6a38'; g.lineWidth = 4; g.beginPath(); g.ellipse(128 + s * 28, 156, 16, 14, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.ellipse(128 + s * 28, 157, 4.5, 11, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(128 + s * 31, 151, 3, 0, TAU); g.fill(); }
    g.fillStyle = '#fff'; for (const x of [108, 124, 140, 156]) { g.beginPath(); g.moveTo(x - 5, 226); g.lineTo(x, 236); g.lineTo(x + 5, 226); g.fill(); }
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(176, 214); g.quadraticCurveTo(206, 206, 214, 226); g.quadraticCurveTo(196, 222, 186, 236); g.quadraticCurveTo(190, 226, 176, 224); g.fill();
    g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(180, 216); g.quadraticCurveTo(200, 214, 204, 224); g.quadraticCurveTo(192, 222, 186, 230); g.fill();
  },
  sword(g) {
    glowDot(g, 128, 170, 96, 'rgba(180,220,255,.4)');
    g.save(); g.translate(128, 176); g.rotate(0.62);
    const bl = g.createLinearGradient(-14, 0, 14, 0); bl.addColorStop(0, '#9aa6ba'); bl.addColorStop(0.5, '#f4f8ff'); bl.addColorStop(1, '#8896ac');
    g.fillStyle = bl; g.strokeStyle = '#4a5468'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -112); g.lineTo(16, -86); g.lineTo(16, 26); g.lineTo(-16, 26); g.lineTo(-16, -86); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#6a7690'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -92); g.lineTo(0, 20); g.stroke();
    g.fillStyle = '#f2c230'; g.strokeStyle = '#8a5a10'; g.lineWidth = 5; rr(g, -48, 26, 96, 16, 8); g.fill(); g.stroke();
    g.fillStyle = '#7a4a22'; rr(g, -9, 42, 18, 42, 5); g.fill(); g.stroke();
    g.strokeStyle = '#4a2a10'; g.lineWidth = 3; for (const y of [52, 62, 72]) { g.beginPath(); g.moveTo(-9, y); g.lineTo(9, y - 5); g.stroke(); }
    g.fillStyle = '#f2c230'; g.strokeStyle = '#8a5a10'; g.lineWidth = 4; g.beginPath(); g.arc(0, 92, 12, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#d82a3a'; g.beginPath(); g.arc(0, 36, 6, 0, TAU); g.fill();
    g.restore(); sparkle(g, 176, 70, 18, '#fff'); sparkle(g, 92, 112, 9, '#cfe8ff');
  },
  crown(g) {
    glowDot(g, 128, 175, 100, 'rgba(255,220,100,.45)');
    const gr = g.createLinearGradient(0, 120, 0, 240); gr.addColorStop(0, '#ffe680'); gr.addColorStop(1, '#e0a010');
    g.fillStyle = gr; g.strokeStyle = '#8a5a10'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(58, 226); g.lineTo(48, 130); g.lineTo(90, 172); g.lineTo(128, 112); g.lineTo(166, 172); g.lineTo(208, 130); g.lineTo(198, 226); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c8861a'; rr(g, 56, 210, 144, 30, 8); g.fill(); g.stroke();
    for (const [x, c] of [[88, '#3a8aff'], [128, '#e02a4a'], [168, '#2ad07a']]) { g.fillStyle = c; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(x, 225, 11, 0, TAU); g.fill(); g.stroke(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#c8b090'; g.lineWidth = 3; for (const [x, y] of [[48, 126], [128, 108], [208, 126]]) { g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fill(); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 4; g.beginPath(); g.moveTo(78, 200); g.lineTo(66, 150); g.stroke();
    sparkle(g, 184, 100, 12, '#fff');
  },
  wand(g) {
    glowDot(g, 150, 120, 90, 'rgba(255,230,120,.5)');
    g.save(); g.translate(120, 200); g.rotate(0.7);
    g.fillStyle = '#4a2a60'; g.strokeStyle = '#1c0e2c'; g.lineWidth = 5; rr(g, -9, -100, 18, 170, 8); g.fill(); g.stroke();
    g.fillStyle = '#f2c230'; for (const y of [-80, 0, 52]) { rr(g, -12, y, 24, 12, 4); g.fill(); g.stroke(); }
    g.restore();
    g.fillStyle = '#ffe14a'; g.strokeStyle = '#c88a10'; g.lineWidth = 5; g.lineJoin = 'round'; star(g, 168, 96, 44, 19, 5); g.fill(); g.stroke();
    sparkle(g, 100, 100, 14, '#cfa8ff'); sparkle(g, 214, 150, 11, '#ffe9a0'); sparkle(g, 196, 52, 9, '#fff'); sparkle(g, 76, 186, 8, '#ffb0e0');
  },
  cake(g) {
    glowDot(g, 128, 180, 100, 'rgba(255,170,210,.35)');
    g.fillStyle = '#dcdcf0'; g.strokeStyle = '#8a8aa8'; g.lineWidth = 4; g.beginPath(); g.ellipse(128, 242, 88, 15, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#8a4a2a'; g.strokeStyle = '#4a2410'; g.lineWidth = 5; rr(g, 62, 190, 132, 52, 8); g.fill(); g.stroke();
    g.fillStyle = '#ffd0e4'; g.beginPath(); g.moveTo(58, 196); for (let i = 0; i <= 6; i++) g.quadraticCurveTo(58 + i * 23.3 + 11, 222 + (i % 2) * 8, 58 + (i + 1) * 23.3, 196); g.lineTo(198, 190); g.lineTo(58, 190); g.fill(); g.stroke();
    g.fillStyle = '#f6a8c8'; g.strokeStyle = '#a8486e'; rr(g, 84, 148, 88, 46, 8); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(80, 152); for (let i = 0; i <= 4; i++) g.quadraticCurveTo(80 + i * 23 + 11, 172, 80 + (i + 1) * 23, 152); g.lineTo(172, 146); g.lineTo(80, 146); g.fill(); g.stroke();
    g.fillStyle = '#e02a3a'; g.strokeStyle = '#8a1020'; g.beginPath(); g.arc(128, 136, 12, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(124, 132, 3.5, 0, TAU); g.fill();
    g.fillStyle = '#4aa8ff'; g.strokeStyle = '#1c5aa0'; rr(g, 150, 100, 9, 36, 3); g.fill(); g.stroke();
    g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(154.5, 78); g.quadraticCurveTo(170, 96, 154.5, 100); g.quadraticCurveTo(139, 96, 154.5, 78); g.fill();
    sparkle(g, 62, 120, 11, '#fff'); sparkle(g, 202, 190, 8, '#ffe0f0');
  },
  chicken(g) {
    glowDot(g, 128, 180, 100, 'rgba(255,200,120,.35)');
    g.strokeStyle = '#d88a1a'; g.lineWidth = 7; g.lineCap = 'round'; for (const x of [112, 144]) { g.beginPath(); g.moveTo(x, 224); g.lineTo(x, 252); g.lineTo(x + 12, 256); g.moveTo(x, 252); g.lineTo(x - 10, 257); g.stroke(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#a8a098'; g.lineWidth = 5; g.beginPath(); g.moveTo(66, 170); g.lineTo(46, 134); g.lineTo(82, 158); g.lineTo(60, 120); g.lineTo(96, 150); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(128, 188, 62, 50, -0.15, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#f0ece0'; g.beginPath(); g.ellipse(112, 196, 34, 24, 0.3, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(166, 130, 32, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#e02a2a'; g.strokeStyle = '#8a1a1a'; g.lineWidth = 4; for (const [x, y, r] of [[152, 98, 11], [168, 94, 13], [184, 100, 10]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke(); }
    g.fillStyle = '#ff9a1a'; g.strokeStyle = '#a85a00'; g.beginPath(); g.moveTo(190, 126); g.lineTo(220, 138); g.lineTo(190, 148); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e02a2a'; g.beginPath(); g.ellipse(190, 156, 7, 13, 0, 0, TAU); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(174, 122, 5.5, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(175.5, 120, 2, 0, TAU); g.fill();
  },
  mushroom(g) {
    glowDot(g, 128, 175, 100, 'rgba(255,120,120,.3)');
    g.fillStyle = '#f6eed8'; g.strokeStyle = '#a89870'; g.lineWidth = 5; g.beginPath(); g.moveTo(98, 176); g.quadraticCurveTo(92, 240, 78, 246); g.lineTo(178, 246); g.quadraticCurveTo(164, 240, 158, 176); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e03a3a'; g.strokeStyle = '#8a1a1a'; g.beginPath(); g.moveTo(40, 182); g.bezierCurveTo(40, 96, 216, 96, 216, 182); g.quadraticCurveTo(128, 202, 40, 182); g.fill(); g.stroke();
    g.fillStyle = '#fff'; for (const [x, y, r] of [[92, 140, 15], [150, 122, 18], [188, 158, 11], [118, 168, 9], [68, 164, 8]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 14, 214, 4.5, 0, TAU); g.fill(); } g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.arc(128, 220, 10, 0.2, Math.PI - 0.2); g.stroke();
    sparkle(g, 208, 100, 11, '#fff');
  },
  crystal(g) {
    glowDot(g, 128, 170, 100, 'rgba(160,120,255,.5)');
    const col = (c1, c2) => { const gr = g.createLinearGradient(0, 80, 0, 250); gr.addColorStop(0, c1); gr.addColorStop(1, c2); return gr; };
    g.lineJoin = 'round'; g.strokeStyle = '#2a1a6a'; g.lineWidth = 5;
    g.fillStyle = col('#8affea', '#2a8ad0'); g.beginPath(); g.moveTo(62, 250); g.lineTo(50, 190); g.lineTo(78, 160); g.lineTo(100, 250); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = col('#ffa0f0', '#8a3ad0'); g.beginPath(); g.moveTo(156, 250); g.lineTo(178, 176); g.lineTo(212, 196); g.lineTo(208, 250); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = col('#c8b0ff', '#5a2ad0'); g.beginPath(); g.moveTo(128, 84); g.lineTo(166, 130); g.lineTo(154, 252); g.lineTo(102, 252); g.lineTo(90, 130); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(128, 84); g.lineTo(166, 130); g.lineTo(128, 140); g.closePath(); g.fill();
    g.fillStyle = 'rgba(80,30,160,.35)'; g.beginPath(); g.moveTo(128, 140); g.lineTo(166, 130); g.lineTo(154, 252); g.lineTo(128, 252); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.beginPath(); g.moveTo(106, 150); g.lineTo(104, 220); g.stroke();
    sparkle(g, 190, 100, 15, '#fff'); sparkle(g, 66, 120, 10, '#cfe8ff'); sparkle(g, 214, 232, 8, '#ffb0f0');
  },
  bomb(g) {
    glowDot(g, 128, 190, 100, 'rgba(255,90,40,.4)');
    const gr = g.createRadialGradient(108, 168, 8, 128, 190, 72); gr.addColorStop(0, '#5a5a6a'); gr.addColorStop(1, '#14141c');
    g.fillStyle = gr; g.strokeStyle = '#000'; g.lineWidth = 6; g.beginPath(); g.arc(128, 192, 66, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#777'; rr(g, 108, 112, 40, 26, 6); g.fill(); g.stroke();
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 112); g.bezierCurveTo(128, 90, 160, 94, 164, 70); g.stroke();
    g.fillStyle = '#ffd23a'; g.strokeStyle = '#ff6a1a'; g.lineWidth = 3; star(g, 168, 62, 20, 8, 8); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(168, 62, 6, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(100, 160, 18, 11, -0.7, 0, TAU); g.fill();
    g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 22, 196, 12, 14, 0, 0, TAU); g.fill(); } g.fillStyle = '#d02020'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 22 - s * 2, 198, 5.5, 0, TAU); g.fill(); }
    g.strokeStyle = '#ff4a2a'; g.lineWidth = 6; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 36, 170); g.lineTo(128 + s * 8, 184); g.stroke(); }
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(104, 228); for (let i = 0; i < 6; i++) g.lineTo(104 + (i + 1) * 9.6, 228 + (i % 2 ? 0 : 10)); g.stroke();
  },
  joker(g) {
    glowDot(g, 128, 170, 100, 'rgba(255,120,220,.4)');
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#3a1060';
    g.fillStyle = '#9a3aff'; g.beginPath(); g.moveTo(70, 160); g.quadraticCurveTo(30, 100, 52, 66); g.quadraticCurveTo(76, 100, 110, 118); g.lineTo(128, 160); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(186, 160); g.quadraticCurveTo(226, 100, 204, 66); g.quadraticCurveTo(180, 100, 146, 118); g.lineTo(128, 160); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff4a8a'; g.beginPath(); g.moveTo(80, 164); g.quadraticCurveTo(128, 70, 176, 164); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffe14a'; for (const [x, y] of [[52, 62], [204, 62]]) { g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill(); g.stroke(); }
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(128, 98, 11, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#2a8aff'; rr(g, 62, 156, 132, 20, 8); g.fill(); g.stroke();
    g.fillStyle = '#ffe9c8'; g.beginPath(); g.arc(128, 214, 46, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 17, 206, 6, 9, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#ff7a9a'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 31, 222, 8, 0, TAU); g.fill(); }
    g.strokeStyle = '#c0102a'; g.lineWidth = 6; g.beginPath(); g.arc(128, 220, 22, 0.25, Math.PI - 0.25); g.stroke();
    g.fillStyle = '#d82a3a'; g.beginPath(); g.arc(128, 214, 7, 0, TAU); g.fill();
    sparkle(g, 214, 140, 12, '#fff'); sparkle(g, 38, 150, 9, '#ffe0f8');
  },
  mirror(g) {
    glowDot(g, 128, 170, 100, 'rgba(120,200,255,.5)');
    g.fillStyle = '#e0a010'; g.strokeStyle = '#7a4a08'; g.lineWidth = 5; rr(g, 117, 222, 22, 40, 8); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(128, 264, 20, 9, 0, 0, TAU); g.fill(); g.stroke();
    const gold = g.createLinearGradient(50, 90, 206, 230); gold.addColorStop(0, '#ffe680'); gold.addColorStop(1, '#c8861a');
    g.fillStyle = gold; g.strokeStyle = '#7a4a08'; g.lineWidth = 6; g.beginPath(); g.ellipse(128, 156, 72, 86, 0, 0, TAU); g.fill(); g.stroke();
    const gl = g.createLinearGradient(70, 90, 190, 220); gl.addColorStop(0, '#e8faff'); gl.addColorStop(0.5, '#8fd0ff'); gl.addColorStop(1, '#4a90e0');
    g.fillStyle = gl; g.beginPath(); g.ellipse(128, 156, 56, 70, 0, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(94, 118); g.lineTo(124, 90); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(88, 138); g.lineTo(100, 126); g.stroke();
    g.fillStyle = 'rgba(30,60,140,.45)'; g.beginPath(); g.arc(122, 160, 18, 0, TAU); g.fill(); g.beginPath(); g.ellipse(122, 198, 26, 15, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(122 + s * 8, 156, 3, 0, TAU); g.fill(); }
    sparkle(g, 196, 88, 15, '#fff'); sparkle(g, 62, 220, 9, '#cfe8ff');
  },
  ghost(g) {
    glowDot(g, 128, 175, 100, 'rgba(180,200,255,.5)');
    const gr = g.createLinearGradient(0, 100, 0, 250); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c4cce8');
    g.fillStyle = gr; g.strokeStyle = '#6a74a8'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(66, 250); g.lineTo(66, 160); g.bezierCurveTo(66, 84, 190, 84, 190, 160); g.lineTo(190, 250);
    g.quadraticCurveTo(174, 226, 160, 250); g.quadraticCurveTo(144, 226, 128, 250); g.quadraticCurveTo(112, 226, 98, 250); g.quadraticCurveTo(82, 226, 66, 250); g.fill(); g.stroke();
    g.fillStyle = '#e8ecff'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 66, 192, 15, 11, s * 0.5, 0, TAU); g.fill(); g.stroke(); }
    g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 24, 158, 11, 17, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(128 + s * 27, 151, 3.5, 0, TAU); g.fill(); g.fillStyle = '#111'; }
    g.beginPath(); g.ellipse(128, 202, 15, 22, 0, 0, TAU); g.fill(); g.fillStyle = '#7a2a4a'; g.beginPath(); g.ellipse(128, 211, 9, 9, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,140,170,.55)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 44, 184, 11, 7, 0, 0, TAU); g.fill(); }
    sparkle(g, 36, 100, 11, '#cfe8ff'); sparkle(g, 222, 130, 9, '#fff');
  },
};

export const PAIR_DEFS = [
  { id: 'dragon', name: 'DRAAK', col: '#2f9e5b' },
  { id: 'sword', name: 'ZWAARD', col: '#5a7ab0' },
  { id: 'crown', name: 'KROON', col: '#d89a10' },
  { id: 'wand', name: 'TOVERSTAF', col: '#8a4ad0' },
  { id: 'cake', name: 'TAART', col: '#e0609a' },
  { id: 'chicken', name: 'KIP', col: '#e08a2a' },
  { id: 'mushroom', name: 'PADDENSTOEL', col: '#d83a3a' },
  { id: 'crystal', name: 'KRISTAL', col: '#2aa8c8' },
];
export const SPECIAL_DEFS = [
  { id: 'bomb', name: 'BOM!', col: '#d82a1a', special: true },
  { id: 'joker', name: 'JOKER', col: '#c43ae0', special: true },
  { id: 'mirror', name: 'SPIEGEL', col: '#3a9ae0', special: true },
  { id: 'ghost', name: 'SPOOK', col: '#7a84c0', special: true },
];
export const DEF_BY_ID = Object.fromEntries([...PAIR_DEFS, ...SPECIAL_DEFS].map((d) => [d.id, d]));

const texCache = new Map();
export function faceTex(id) {
  let t = texCache.get(id);
  if (t) return t;
  const d = DEF_BY_ID[id];
  t = canvasTex(TW, TH, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    if (d.special) { bg.addColorStop(0, '#2a1840'); bg.addColorStop(1, '#4a2a68'); } else { bg.addColorStop(0, '#fbf1d4'); bg.addColorStop(1, '#e8cf98'); }
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // parchment-vlekken
    if (!d.special) { g.fillStyle = 'rgba(150,100,40,.07)'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc((i * 97) % w, (i * 61) % h, 6 + (i % 5) * 4, 0, TAU); g.fill(); } }
    // kader
    g.strokeStyle = d.col; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.strokeStyle = d.special ? '#f2c230' : '#6a4a22'; g.lineWidth = 3; g.strokeRect(19, 19, w - 38, h - 38);
    // hoekjes
    g.fillStyle = d.special ? '#f2c230' : d.col; for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) { star(g, x, y, 9, 3.5, 4); g.fill(); }
    ICONS[d.id](g);
    // naamlint
    const by = 292; g.fillStyle = d.col; g.strokeStyle = d.special ? '#f2c230' : '#3a2410'; g.lineWidth = 4; rr(g, 26, by - 26, w - 52, 52, 14); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = FONT(d.name.length > 8 ? 26 : 34); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(d.name, w / 2, by + 2, w - 70); g.fillText(d.name, w / 2, by + 2, w - 70);
  });
  t.userData.keep = true; texCache.set(id, t); return t;
}
export function backTex() {
  let t = texCache.get('back');
  if (t) return t;
  t = canvasTex(TW, TH, (g, w, h) => {
    const bg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 200); bg.addColorStop(0, '#6a3aa8'); bg.addColorStop(0.55, '#35176a'); bg.addColorStop(1, '#170a34');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c230'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.lineWidth = 2.5; g.strokeRect(20, 20, w - 40, h - 40);
    for (const [x, y, a] of [[20, 20, 0], [w - 20, 20, 1], [20, h - 20, 3], [w - 20, h - 20, 2]]) { g.save(); g.translate(x, y); g.rotate(a * Math.PI / 2); g.strokeStyle = '#f2c230'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 24, 0, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(0, 0, 14, 0, Math.PI / 2); g.stroke(); g.restore(); }
    // magische cirkel
    const cx = w / 2, cy = h / 2;
    g.strokeStyle = 'rgba(255,230,140,.85)'; g.lineWidth = 3; for (const r of [84, 66, 40]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(255,230,140,.9)'; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * 75, cy + Math.sin(a) * 75, 3.2, 0, TAU); g.fill(); }
    g.fillStyle = '#f2c230'; g.strokeStyle = '#a8741a'; g.lineWidth = 3; g.lineJoin = 'round'; star(g, cx, cy, 58, 22, 8, -Math.PI / 2); g.fill(); g.stroke();
    g.fillStyle = '#35176a'; star(g, cx, cy, 30, 12, 8, -Math.PI / 8); g.fill();
    g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(cx, cy, 11, 0, TAU); g.fill();
    glowDot(g, cx, cy, 36, 'rgba(255,240,170,.55)');
    for (let i = 0; i < 22; i++) { const x = 30 + (i * 83) % (w - 60), y = 30 + (i * 137) % (h - 60); if (Math.hypot(x - cx, y - cy) > 96) sparkle(g, x, y, 3 + (i % 3) * 2, 'rgba(255,240,200,.85)'); }
    g.fillStyle = '#f2c230'; g.beginPath(); g.arc(cx, 56, 16, 0, TAU); g.fill(); g.fillStyle = '#35176a'; g.beginPath(); g.arc(cx + 7, 52, 14, 0, TAU); g.fill();
    g.fillStyle = '#f2c230'; g.beginPath(); g.arc(cx, h - 56, 16, 0, TAU); g.fill(); g.fillStyle = '#35176a'; g.beginPath(); g.arc(cx - 7, h - 60, 14, 0, TAU); g.fill();
  });
  t.userData.keep = true; texCache.set('back', t); return t;
}
export function frameTex() {
  let t = texCache.get('frame');
  if (t) return t;
  t = canvasTex(128, 176, (g, w, h) => {
    for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.1})`; g.lineWidth = 16 - k * 2.4; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 16); g.stroke(); }
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.roundRect(12, 12, w - 24, h - 24, 14); g.stroke();
  }, { srgb: true });
  t.userData.keep = true; texCache.set('frame', t); return t;
}

// ---- de 3D-kaart ----
const geoCache = {};
function geos() {
  if (geoCache.body) return geoCache;
  geoCache.body = new THREE.BoxGeometry(CW, CT, CH);
  const top = new THREE.PlaneGeometry(CW - 0.02, CH - 0.02); top.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0))); top.translate(0, CT / 2 + 0.002, 0);
  const bot = new THREE.PlaneGeometry(CW - 0.02, CH - 0.02); bot.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0))); bot.translate(0, -CT / 2 - 0.002, 0);
  geoCache.top = top; geoCache.bot = bot;
  return geoCache;
}
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf2e2b0, roughness: 0.6 });
let backMat = null;
export function makeCard(faceId) {
  const G = geos();
  if (!backMat) backMat = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.55, metalness: 0.1, emissive: 0xffffff, emissiveMap: backTex(), emissiveIntensity: 0.38 });
  const frontMat = new THREE.MeshStandardMaterial({ map: faceTex(faceId), roughness: 0.5, emissive: 0xffd24a, emissiveIntensity: 0 });
  const root = new THREE.Group(); const flip = new THREE.Group(); root.add(flip);
  const body = new THREE.Mesh(G.body, edgeMat); body.castShadow = true; body.receiveShadow = true; flip.add(body);
  const top = new THREE.Mesh(G.top, backMat); top.receiveShadow = true; flip.add(top);
  const bot = new THREE.Mesh(G.bot, frontMat); bot.receiveShadow = true; flip.add(bot);
  return { root, flip, frontMat, body };
}


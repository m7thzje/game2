// Drie-Buzzer — tekenhulpjes voor het grote scherm en de lessenaar-schermpjes (canvas 2D)
export const DIRS = ['up', 'left', 'right', 'down'];
export const DCOL = { up: '#ff5a5a', left: '#ffd23f', right: '#ff6fb5', down: '#35d6c8' };
const ARROW_OFF = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DARR = { up: '▲', left: '◀', right: '▶', down: '▼' };
export const SHAPES = [
  { k: 'balloon', name: 'ballon', col: '#ff5a5a' },
  { k: 'star', name: 'ster', col: '#ffd23f' },
  { k: 'heart', name: 'hartje', col: '#ff6fb5' },
  { k: 'gem', name: 'diamant', col: '#35d6c8' },
];

// tekst met donkere rand
export function txt(g, s, x, y, size, fill = '#fff', o = {}) {
  g.save();
  g.font = `${o.weight || 'bold'} ${size}px Fredoka, "Arial Black", sans-serif`;
  g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle'; g.lineJoin = 'round';
  if (o.stroke !== false) { g.lineWidth = size * 0.17; g.strokeStyle = o.stroke || 'rgba(25,8,45,.95)'; g.strokeText(s, x, y, o.max); }
  g.fillStyle = fill; g.fillText(s, x, y, o.max);
  g.restore();
}
export function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }

// vormpjes (middelpunt x,y; straal r)
export function shape(g, k, x, y, r, col, t = 0) {
  g.save(); g.translate(x, y);
  g.fillStyle = col; g.strokeStyle = 'rgba(25,8,45,.85)'; g.lineWidth = Math.max(2, r * 0.14); g.lineJoin = 'round';
  if (k === 'balloon') {
    g.beginPath(); g.ellipse(0, 0, r * 0.85, r, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, r); g.lineTo(-r * 0.2, r * 1.25); g.lineTo(r * 0.2, r * 1.25); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, r * 1.25); g.quadraticCurveTo(r * 0.3 * Math.sin(t * 3), r * 1.7, 0, r * 2.1); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.4, r * 0.18, r * 0.3, 0.5, 0, 7); g.fill();
  } else if (k === 'star') {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r * 1.1; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); g.fill(); g.stroke();
  } else if (k === 'heart') {
    g.beginPath(); g.moveTo(0, r * 0.9); g.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.7, -r * 1.1, 0, -r * 0.4); g.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.5, -r * 0.1, 0, r * 0.9); g.closePath(); g.fill(); g.stroke();
  } else if (k === 'gem') {
    g.beginPath(); g.moveTo(-r * 0.7, -r * 0.6); g.lineTo(r * 0.7, -r * 0.6); g.lineTo(r, -r * 0.1); g.lineTo(0, r); g.lineTo(-r, -r * 0.1); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-r, -r * 0.1); g.lineTo(r, -r * 0.1); g.moveTo(-r * 0.35, -r * 0.6); g.lineTo(0, r); g.moveTo(r * 0.35, -r * 0.6); g.lineTo(0, r); g.stroke();
  } else { g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.stroke(); }
  g.restore();
}

// richtingspijl-tegel (gekleurd vlak met pijl)
export function pad(g, dir, x, y, s, lit = 1, label = null, edge = false) {
  const col = DCOL[dir];
  g.save(); g.translate(x, y);
  g.globalAlpha = 0.35 + 0.65 * lit; g.fillStyle = col; g.strokeStyle = lit > 0.5 ? '#fff' : 'rgba(25,8,45,.8)'; g.lineWidth = 5;
  rr(g, -s / 2, -s / 2, s, s, s * 0.2); g.fill(); g.stroke();
  g.globalAlpha = 1; g.fillStyle = 'rgba(25,8,45,.75)';
  const a = edge ? s * 0.13 : s * 0.26; if (edge) g.translate(ARROW_OFF[dir][0] * s * 0.37, ARROW_OFF[dir][1] * s * 0.37); g.beginPath();
  if (dir === 'up') { g.moveTo(0, -a); g.lineTo(a, a * 0.7); g.lineTo(-a, a * 0.7); }
  else if (dir === 'down') { g.moveTo(0, a); g.lineTo(a, -a * 0.7); g.lineTo(-a, -a * 0.7); }
  else if (dir === 'left') { g.moveTo(-a, 0); g.lineTo(a * 0.7, a); g.lineTo(a * 0.7, -a); }
  else { g.moveTo(a, 0); g.lineTo(-a * 0.7, a); g.lineTo(-a * 0.7, -a); }
  g.closePath(); g.fill();
  if (lit > 0.7) { g.globalAlpha = (lit - 0.7) * 2; g.fillStyle = '#fff'; rr(g, -s / 2, -s / 2, s, s, s * 0.2); g.fill(); }
  g.restore();
  if (label) txt(g, label, x, y + s * 0.62, s * 0.2);
}

// stralenkrans achter de tekst
export function burst(g, cx, cy, R, t, c1, c2, n = 16) {
  g.save(); g.translate(cx, cy); g.rotate(t * 0.15);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c1 : c2; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, i / n * 6.2832, (i + 1) / n * 6.2832); g.closePath(); g.fill(); }
  g.restore();
}

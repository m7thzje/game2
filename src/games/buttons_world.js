import * as THREE from 'three';
import { mat, mesh, glow, canvasTex, TAU, mulberry32, clamp, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';

// Knoppen-Breker: de steengroeve van Dwerg Brokkel (wereld, blokken en symbolen).

export const BW = 3.8, BH = 1.7, BD = 1.8;          // blokafmetingen
export const COLX = [-4.7, 4.7];                      // x van de twee kolommen
export const SYM_NAMES = ['←', '→', '↑', '↓', 'A', 'B'];
export const METER_N = 31;                            // 25 + max. 6 strafblokken

// ---------------------------------------------------------------- symbolen
function symbolTexture(idx, dim) {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.globalAlpha = dim ? 0.36 : 1;
    const cols = idx < 4 ? ['#5b74ee', '#27338f'] : idx === 4 ? ['#ff8a4a', '#c82a14'] : ['#3fe0b4', '#0e8a6a'];
    const gr = g.createLinearGradient(0, 8, 0, 120); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
    g.fillStyle = gr; g.strokeStyle = '#0d1030'; g.lineWidth = 7; g.lineJoin = 'round';
    g.beginPath(); if (idx < 4) g.roundRect(6, 6, 116, 116, 30); else g.arc(64, 64, 58, 0, TAU);
    g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.24)'; g.beginPath(); g.ellipse(64, 28, 42, 15, 0, 0, TAU); g.fill();
    if (idx < 4) {
      g.save(); g.translate(64, 66); g.rotate([Math.PI, 0, -Math.PI / 2, Math.PI / 2][idx]);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#0d1030'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(-36, -15); g.lineTo(4, -15); g.lineTo(4, -37); g.lineTo(40, 0); g.lineTo(4, 37); g.lineTo(4, 15); g.lineTo(-36, 15); g.closePath(); g.stroke(); g.fill();
      g.restore();
    } else {
      g.font = '900 80px Fredoka, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#0d1030'; g.strokeText(idx === 4 ? 'A' : 'B', 64, 70);
      g.fillStyle = '#fff'; g.fillText(idx === 4 ? 'A' : 'B', 64, 70);
    }
  });
}

// ---------------------------------------------------------------- blokgezichten
function faceTexture(kind) {
  return canvasTex(384, 172, (g, w, h) => {
    const r = mulberry32(kind.charCodeAt(0) * 17);
    const pal = {
      n: ['#a6acc4', '#6c7290', '#c8cee6', '#444a64'],
      g: ['#ffe680', '#d79a14', '#fff6c0', '#8e5e04'],
      b: ['#463d52', '#1e1a28', '#675b76', '#0b090f'],
      i: ['#e4f8ff', '#8dd0ee', '#ffffff', '#4a9ac4'],
    }[kind];
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; g.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 3); }
    g.fillStyle = pal[2]; g.fillRect(0, 0, w, 10); g.fillRect(0, 0, 10, h);
    g.fillStyle = pal[3]; g.fillRect(0, h - 10, w, 10); g.fillRect(w - 10, 0, 10, h);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(24, 24, w - 48, h - 48);
    g.strokeStyle = pal[3]; g.lineWidth = 3; g.strokeRect(24, 24, w - 48, h - 48);
    for (const [x, y] of [[17, 17], [w - 17, 17], [17, h - 17], [w - 17, h - 17]]) { g.fillStyle = pal[3]; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.fillStyle = pal[2]; g.beginPath(); g.arc(x - 1, y - 1, 2, 0, TAU); g.fill(); }
    if (kind === 'n') {
      g.strokeStyle = 'rgba(30,30,50,.45)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let k = 0; k < 4; k++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 36; g.lineTo(x, y); } g.stroke(); }
    } else if (kind === 'g') {
      g.fillStyle = 'rgba(255,255,255,.4)';
      for (let k = 0; k < 3; k++) { const x = 40 + k * 120; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 36, 0); g.lineTo(x - 22, h); g.lineTo(x - 58, h); g.fill(); }
      g.fillStyle = '#fff';
      for (const [x, y, s] of [[60, 40, 9], [320, 130, 11], [300, 36, 7], [86, 136, 8]]) { g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.5, y - s * 0.5); g.lineTo(x + s * 2, y); g.lineTo(x + s * 0.5, y + s * 0.5); g.lineTo(x, y + s * 2); g.lineTo(x - s * 0.5, y + s * 0.5); g.lineTo(x - s * 2, y); g.lineTo(x - s * 0.5, y - s * 0.5); g.fill(); }
      g.font = 'bold 30px Fredoka, sans-serif'; g.fillStyle = '#8e5e04'; g.textAlign = 'center'; g.fillText('★ GOUD ★', w / 2, h - 30);
    } else if (kind === 'b') {
      for (const yy of [11, h - 21]) { for (let x = -20; x < w + 20; x += 26) { g.fillStyle = '#ffcf2a'; g.beginPath(); g.moveTo(x, yy + 10); g.lineTo(x + 13, yy + 10); g.lineTo(x + 23, yy); g.lineTo(x + 10, yy); g.fill(); } }
      for (const bx of [48, w - 48]) { g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(bx, h / 2 + 8, 22, 0, TAU); g.fill(); g.strokeStyle = '#ff5a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx + 10, h / 2 - 12); g.quadraticCurveTo(bx + 20, h / 2 - 30, bx + 28, h / 2 - 24); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(bx + 28, h / 2 - 25, 5, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(bx - 8, h / 2, 6, 0, TAU); g.fill(); }
    } else if (kind === 'i') {
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let k = 0; k < 7; k++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 3; s++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
      for (const [x, y] of [[50, 120], [330, 50], [58, 46], [326, 124]]) { g.strokeStyle = '#fff'; g.lineWidth = 3; for (let a = 0; a < 3; a++) { const an = a / 3 * Math.PI; g.beginPath(); g.moveTo(x - Math.cos(an) * 13, y - Math.sin(an) * 13); g.lineTo(x + Math.cos(an) * 13, y + Math.sin(an) * 13); g.stroke(); } }
    }
  });
}

function frameTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.shadowColor = '#ffffff'; g.shadowBlur = 14; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 16); g.stroke();
  });
}
function glowTexture(color) {
  return canvasTex(64, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, h / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.45, color.replace(')', ', .35)').replace('rgb', 'rgba')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
export function starTexture() {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64); g.translate(32, 33);
    g.fillStyle = '#ffe14a'; g.strokeStyle = '#a86a00'; g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 11 : 26; const a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.stroke(); g.fill();
  });
}

// ---------------------------------------------------------------- blokken
export function makeBlockKit(scene) {
  const faces = { n: faceTexture('n'), g: faceTexture('g'), b: faceTexture('b'), i: faceTexture('i') };
  const side = { n: 0x6c7290, g: 0xc68e12, b: 0x28222f, i: 0x75bde0 };
  const bodyGeo = new THREE.BoxGeometry(BW, BH, BD);
  const bodyMats = {};
  for (const k of ['n', 'g', 'b', 'i']) {
    const s = new THREE.MeshStandardMaterial({ color: side[k], roughness: k === 'i' ? 0.25 : 0.85, metalness: k === 'g' ? 0.55 : 0, flatShading: true });
    const f = new THREE.MeshStandardMaterial({ map: faces[k], roughness: k === 'i' ? 0.3 : 0.85, metalness: k === 'g' ? 0.5 : 0, emissive: k === 'g' ? 0x6a4400 : 0x000000, emissiveIntensity: 0.5 });
    bodyMats[k] = [s, s, s, s, f, s];
  }
  const symMats = [0, 1, 2, 3, 4, 5].map((i) => [new THREE.MeshBasicMaterial({ map: symbolTexture(i, false), transparent: true }), new THREE.MeshBasicMaterial({ map: symbolTexture(i, true), transparent: true })]);
  const symGeo = new THREE.PlaneGeometry(1.4, 1.4);
  const frameGeo = new THREE.PlaneGeometry(BW + 0.7, BH + 0.7);
  const frameTex = frameTexture();
  const redGeo = new THREE.PlaneGeometry(BW - 0.1, BH - 0.1);
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0x5a3b1c, roughness: 1 });
  const fuseGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.55, 5);
  const tipGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const pool = [];

  function make() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMats.n); body.castShadow = true; body.receiveShadow = true; grp.add(body);
    const sym = [0, 1].map(() => { const m = new THREE.Mesh(symGeo, symMats[0][0]); m.position.z = BD / 2 + 0.03; m.renderOrder = 3; grp.add(m); return m; });
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ map: frameTex, color: 0xffe14a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    frame.position.z = BD / 2 + 0.06; frame.renderOrder = 4; frame.visible = false; grp.add(frame);
    const red = new THREE.Mesh(redGeo, new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    red.position.z = BD / 2 + 0.045; red.renderOrder = 3; red.visible = false; grp.add(red);
    const fuse = new THREE.Group(); fuse.position.set(0.9, BH / 2 + 0.25, 0); fuse.visible = false; grp.add(fuse);
    fuse.add(new THREE.Mesh(fuseGeo, fuseMat));
    const tip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: 0xffb02a })); tip.position.y = 0.32; fuse.add(tip);
    grp.visible = false; scene.add(grp);
    return { grp, body, sym, frame, red, fuse, tip, kind: 'n', syms: [0], step: 0, y: 0, fuseT: -1, uid: 0 };
  }
  return {
    acquire() { const b = pool.pop() || make(); b.grp.visible = true; return b; },
    release(b) { b.grp.visible = false; b.frame.visible = false; b.grp.rotation.set(0, 0, 0); pool.push(b); },
    set(b, kind, syms) {
      b.kind = kind; b.syms = syms; b.step = 0; b.fuseT = -1;
      b.body.material = bodyMats[kind];
      b.sym[0].material = symMats[syms[0]][0];
      if (kind === 'i') {
        b.sym[0].position.x = -0.85; b.sym[0].scale.setScalar(0.86);
        b.sym[1].visible = true; b.sym[1].position.x = 0.85; b.sym[1].scale.setScalar(0.86); b.sym[1].material = symMats[syms[1]][0];
      } else { b.sym[0].position.x = 0; b.sym[0].scale.setScalar(1); b.sym[1].visible = false; }
      b.fuse.visible = kind === 'b'; b.red.visible = kind === 'b'; b.red.material.opacity = 0;
      b.frame.visible = false;
    },
    advance(b) { b.step = 1; b.sym[0].material = symMats[b.syms[0]][1]; b.sym[0].scale.setScalar(0.7); },
    symMats,
  };
}

// ---------------------------------------------------------------- mokerhamer
export function makeMallet() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 6), mat(0x8a5a2b), { pos: [0, -0.45, 0] }));
  const head = new THREE.Group(); head.position.set(0, -1.05, 0); g.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.98, 0.52, 0.52), mat(0x8e9199, { metalness: 0.5, roughness: 0.5 })));
  for (const sx of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(0.12, 0.57, 0.57), mat(0xe8c24a, { metalness: 0.6, roughness: 0.4 }), { pos: [sx * 0.3, 0, 0] }));
  return g;
}

// ---------------------------------------------------------------- de steengroeve
export function buildQuarry(ctx) {
  const { scene, fx, players } = ctx;
  const anim = [];
  const root = new THREE.Group(); scene.add(root);
  const add = (m) => { root.add(m); return m; };
  const stoneMat = (rx, ry, color = 0xffffff) => new THREE.MeshStandardMaterial({ map: tex.stone(rx, ry), color, roughness: 1, flatShading: true });

  // achterwand van bakstenen + stalactieten
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 38), new THREE.MeshStandardMaterial({ map: tex.bricks(20, 9), color: 0x8f7e9c, roughness: 1 }));
  wall.position.set(0, 13, -4.4); wall.receiveShadow = true; root.add(wall);
  const stalMat = mat(0x5e5068);
  for (let i = 0; i < 17; i++) {
    const h = 1.2 + ((i * 37) % 11) / 11 * 2.2, r = 0.35 + ((i * 53) % 7) / 7 * 0.5;
    add(mesh(new THREE.ConeGeometry(r, h, 6), stalMat, { cast: false, pos: [-16 + i * 2 + ((i * 7) % 5) * 0.2, 15.2 - h / 2, -2.2 - (i % 3) * 0.5], rot: [Math.PI, 0, 0] }));
  }
  // vloer
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), new THREE.MeshStandardMaterial({ map: tex.tiles(18, 6, '#9a8f84', '#5d5349'), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.31, 3); floor.receiveShadow = true; root.add(floor);

  // per kolom: podium, naamplaat, rails, schacht, latei met tandwielen, gloed
  const glowTex = [players[0].css, players[1].css].map((c) => {
    const col = new THREE.Color(c); return glowTexture(`rgb(${Math.round(col.r * 255)}, ${Math.round(col.g * 255)}, ${Math.round(col.b * 255)})`);
  });
  const meters = [];
  const cogs = [];
  [0, 1].forEach((i) => {
    const cx = COLX[i], sgn = i === 0 ? -1 : 1, pc = PLAYER_COLORS[i];
    add(mesh(new THREE.BoxGeometry(5.8, 0.32, 4.6), stoneMat(3, 2, 0xd8d0e0), { pos: [cx, -0.16, 1.3] }));
    add(mesh(new THREE.BoxGeometry(5.2, 0.05, 0.16), glow(pc, 1.1), { cast: false, pos: [cx, 0.02, 3.35] }));
    for (const sx of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.2, 0.05, 3.6), glow(pc, 0.8), { cast: false, pos: [cx + sx * 2.6, 0.02, 1.4] }));
    // naamplaat
    const plate = mesh(new THREE.BoxGeometry(3.4, 0.7, 0.2), new THREE.MeshStandardMaterial({ map: tex.sign(players[i].name, { w: 256, h: 72, size: 40, bg: i ? '#27508f' : '#1f6b3f', fg: '#fff6d0' }), roughness: 0.8 }), { pos: [cx, 0.4, 3.75], rot: [-0.25, 0, 0] });
    add(plate);
    // schacht
    add(mesh(new THREE.BoxGeometry(BW + 0.5, 12.6, 0.3), mat(0x1b1621), { cast: false, pos: [cx, 6.3, -1.3] }));
    for (const sx of [-1, 1]) {
      add(mesh(new THREE.BoxGeometry(0.46, 12.4, 1.7), stoneMat(1, 5, 0xbfb6cc), { pos: [cx + sx * 2.3, 6.2, 0.15] }));
      for (let k = 0; k < 6; k++) add(mesh(new THREE.BoxGeometry(0.6, 0.18, 1.8), mat(0x3f3548), { cast: false, pos: [cx + sx * 2.3, 1 + k * 2, 0.15] }));
    }
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 15), new THREE.MeshBasicMaterial({ map: glowTex[i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    gl.position.set(cx, 6.5, -1.1); root.add(gl);
    // latei
    add(mesh(new THREE.BoxGeometry(6.4, 4.4, 2.4), stoneMat(3, 2, 0xcfc6da), { pos: [cx, 13.0, 0.6] }));
    add(mesh(new THREE.BoxGeometry(4.3, 0.7, 0.2), mat(0x0a0810), { cast: false, pos: [cx, 11.05, 1.82] }));
    for (let k = 0; k < 8; k++) add(mesh(new THREE.ConeGeometry(0.2, 0.55, 5), mat(0x8c919c, { metalness: 0.6, roughness: 0.45 }), { pos: [cx - 3.0 + k * 0.86, 10.62, 1.5], rot: [Math.PI, 0, 0] }));
    for (const sx of [-1, 1]) {
      const cog = new THREE.Group(); cog.position.set(cx + sx * 2.1, 12.8, 1.9); root.add(cog);
      cog.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.3, 14), mat(0x7b7f8a, { metalness: 0.6 }), { rot: [Math.PI / 2, 0, 0] }));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; cog.add(mesh(new THREE.BoxGeometry(0.36, 0.36, 0.3), mat(0x7b7f8a, { metalness: 0.6 }), { pos: [Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], rot: [0, 0, a] })); }
      cog.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 8), mat(0xe8c24a, { metalness: 0.6 }), { rot: [Math.PI / 2, 0, 0] }));
      cogs.push({ g: cog, dir: sx * (i ? -1 : 1) });
    }
    add(mesh(new THREE.BoxGeometry(2.6, 0.9, 0.2), new THREE.MeshStandardMaterial({ map: tex.sign(players[i].name.toUpperCase(), { w: 256, h: 80, size: 44, bg: i ? '#27508f' : '#1f6b3f', fg: '#ffe9a0' }), roughness: 0.8 }), { pos: [cx, 13.9, 1.9] }));

    // voortgangsmeter (kristallen)
    const mx = cx + sgn * 3.55;
    add(mesh(new THREE.BoxGeometry(0.9, 11.3, 0.4), mat(0x2a2432, { metalness: 0.3 }), { cast: false, pos: [mx, 5.35, -0.15] }));
    const segs = [];
    for (let k = 0; k < METER_N; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.27, 0.42), new THREE.MeshStandardMaterial({ color: 0x3a3442, emissive: 0x000000, roughness: 0.4 }));
      m.position.set(mx, 0.45 + k * 0.335, 0.1); root.add(m); segs.push(m);
    }
    const crown = mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.3, flatShading: true }), { cast: false, pos: [mx, 11.35, 0.1], scale: [1, 1.3, 1] });
    root.add(crown);
    meters.push({ segs, crown, last: -1, lastGoal: -1, pc });
  });

  // hangende vaandels in het midden + balkon met scheidsrechter
  const flags = [];
  [0, 1].forEach((i) => {
    const t = canvasTex(128, 320, (g, w, h) => {
      const c = new THREE.Color(PLAYER_COLORS[i]);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`); gr.addColorStop(1, `rgb(${c.r * 150 | 0},${c.g * 150 | 0},${c.b * 150 | 0})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h - 40); g.lineTo(w / 2, h); g.lineTo(0, h - 40); g.closePath(); g.fill();
      g.strokeStyle = '#ffd86a'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#ffe9a0'; g.font = '900 96px Fredoka, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 8; g.strokeText(players[i].name[0], w / 2, 130); g.fillText(players[i].name[0], w / 2, 130);
      g.font = '60px sans-serif'; g.fillText('⛏', w / 2, 224);
    });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.25), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9, transparent: true }));
    f.position.set(i ? 2.05 : -2.05, 8.7, -3.7); root.add(f); flags.push(f);
    add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 5), mat(0x4a3220), { cast: false, pos: [f.position.x, 10.4, -3.7], rot: [0, 0, Math.PI / 2] }));
  });
  add(mesh(new THREE.BoxGeometry(3.6, 0.5, 1.8), stoneMat(2, 1, 0xd8d0e0), { pos: [0, 5.75, -3.0] }));
  for (let k = 0; k < 6; k++) add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), mat(0xb9b0c8), { pos: [-1.5 + k * 0.6, 6.35, -2.2] }));
  add(mesh(new THREE.BoxGeometry(3.7, 0.14, 0.3), mat(0xb9b0c8), { pos: [0, 6.75, -2.2] }));
  const npcs = [];
  const ref = makeNPC('dwarf', { scale: 0.95 }); ref.group.position.set(-0.7, 6.0, -3.0); ref.group.scale.setScalar(1.15); scene.add(ref.group); ref.faceDir(0, 1); npcs.push({ c: ref, t: 0, home: 'point' });
  const jes = makeNPC('jester'); jes.group.position.set(0.9, 6.0, -3.0); jes.group.scale.setScalar(1.1); scene.add(jes.group); jes.faceDir(0, 1); npcs.push({ c: jes, t: 0, home: 'idle' });
  [[-10.3, 'goblin'], [10.3, 'goblin']].forEach(([x, k], idx) => {
    add(mesh(new THREE.BoxGeometry(2.2, 0.5, 1.6), stoneMat(1, 1, 0xbfb6cc), { pos: [x, 6.4, -2.4] }));
    const n = makeNPC(k, { scale: 0.75 }); n.group.position.set(x, 6.65, -2.4); n.group.scale.setScalar(1.25); scene.add(n.group); n.faceDir(x > 0 ? -0.4 : 0.4, 1); npcs.push({ c: n, t: 0, home: 'idle', phase: idx });
  });

  // pilaren, fakkels, kristallen, kratten
  const torches = [];
  for (const sx of [-1, 1]) {
    add(mesh(new THREE.BoxGeometry(1.6, 16, 1.6), stoneMat(1, 6, 0xc8bfd4), { pos: [sx * 10.6, 8, -0.8] }));
    const t = P.torch(0xffa030); t.position.set(sx * 9.65, 3.6, 0.2); root.add(t); torches.push(t);
    t.userData.light.intensity = 1.3; t.userData.light.distance = 14;
    add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), mat(0x2f2f38, { metalness: 0.5 }), { cast: false, pos: [sx * 9.9, 3.5, 0.25] }));
    for (let k = 0; k < 6; k++) {
      const col = [0x5be8ff, 0xb06bff, 0x7dffb0][k % 3], h = 0.9 + (k % 3) * 0.5;
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.22 + (k % 2) * 0.08, h, 5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, flatShading: true, transparent: true, opacity: 0.93 }));
      cr.position.set(sx * (8.2 + k * 0.28), h / 2, -2.8 + (k % 2) * 0.7 + (k > 3 ? 4.2 : 0)); cr.rotation.z = (k - 2.5) * 0.12 * -sx; root.add(cr); anim.push((t2) => { cr.material.emissiveIntensity = 0.75 + Math.sin(t2 * 2 + k) * 0.25; });
    }
    const c1 = P.crate(1.2); c1.position.set(sx * 9.5, 0, 3.6); c1.rotation.y = 0.3 * sx; root.add(c1);
    const c2 = P.crate(0.9); c2.position.set(sx * 8.5, 0, 4.4); c2.rotation.y = -0.2; root.add(c2);
    const b1 = P.barrel(1.1); b1.position.set(sx * 10.2, 0, 4.5); root.add(b1);
    const r1 = P.rock(0.8, 0x6e6678); r1.position.set(sx * 8.9, 0, 1.6); root.add(r1);
    const r2 = P.rock(0.5, 0x7d7488); r2.position.set(sx * 8.4, 0, 2.3); root.add(r2);
    // houweel in de muur
    const pick = new THREE.Group(); pick.position.set(sx * 8.7, 6.6, -4.2); pick.rotation.z = 0.5 * sx; root.add(pick);
    pick.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5), mat(0x7a5230), { cast: false }));
    pick.add(mesh(new THREE.BoxGeometry(1.1, 0.14, 0.14), mat(0x9a9ea8, { metalness: 0.6 }), { cast: false, pos: [0, 0.78, 0] }));
  }
  // lorrie met edelstenen (decor)
  const cart = new THREE.Group(); cart.position.set(-6.4, 0, 5.2); cart.rotation.y = 0.25; root.add(cart);
  cart.add(mesh(new THREE.BoxGeometry(1.9, 0.8, 1.2), mat(0x6e4a2a), { pos: [0, 0.75, 0] }));
  for (const [x, z] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) cart.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), mat(0x2f2f38), { pos: [x, 0.28, z * 1.05], rot: [Math.PI / 2, 0, 0] }));
  for (let k = 0; k < 7; k++) cart.add(mesh(new THREE.OctahedronGeometry(0.2, 0), glow([0xff6fa5, 0x5be8ff, 0xffe14a, 0x7dffb0][k % 4], 0.7), { cast: false, pos: [-0.6 + (k % 4) * 0.4, 1.25 + (k % 2) * 0.08, (k % 3 - 1) * 0.28] }));
  for (const z of [4.1, 5.9]) add(mesh(new THREE.BoxGeometry(60, 0.06, 0.12), mat(0x4a3a44, { metalness: 0.3 }), { cast: false, pos: [0, 0.02, z] }));
  for (let k = 0; k < 24; k++) add(mesh(new THREE.BoxGeometry(0.24, 0.05, 2.2), mat(0x5b3d24), { cast: false, pos: [-14 + k * 1.2, 0.0, 5] }));

  // stofdeeltjes in de lucht
  let dustT = 0;

  function setMeter(i, broken, goal, time) {
    const m = meters[i];
    if (m.last === broken && m.lastGoal === goal) return;
    m.last = broken; m.lastGoal = goal;
    for (let k = 0; k < METER_N; k++) {
      const s = m.segs[k], extra = k >= 25, lit = k < broken;
      s.visible = k < goal;
      const base = extra ? 0xff3b30 : m.pc;
      s.material.color.set(lit ? base : extra ? 0x5a1c1c : 0x3a3442);
      s.material.emissive.set(lit ? base : extra ? 0x300808 : 0x000000);
      s.material.emissiveIntensity = lit ? 0.9 : 0.5;
    }
  }
  function cheer(secs = 0.9, who = -1) {
    npcs.forEach((n, k) => { if (who < 0 || who === k) n.t = secs; });
  }

  function update(t, dt, camPos) {
    for (const tt of torches) P.animateFire(tt, t);
    for (const a of anim) a(t);
    for (const c of cogs) c.g.rotation.z += dt * 0.5 * c.dir;
    flags.forEach((f, k) => { f.rotation.y = Math.sin(t * 1.3 + k) * 0.1; f.rotation.z = Math.sin(t * 0.9 + k * 2) * 0.03; });
    npcs.forEach((n, k) => {
      n.t = Math.max(0, n.t - dt);
      n.c.pose = n.t > 0 ? 'cheer' : n.home === 'point' && Math.sin(t * 0.7 + k) > 0.55 ? 'wave' : 'idle';
      n.c.update(dt);
    });
    meters.forEach((m) => { m.crown.rotation.y += dt * 1.6; });
    dustT -= dt;
    if (dustT <= 0) { dustT = 0.14; fx.particles.emit((Math.random() - 0.5) * 22, 1 + Math.random() * 11, -1 + Math.random() * 4, (Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.12, 0, { life: 3.4, size: 0.09, color: 0xfff0d0, gravity: 0, shrink: true }); }
  }
  return { update, setMeter, cheer, npcs, root };
}

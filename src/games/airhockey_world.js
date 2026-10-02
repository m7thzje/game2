import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU, rand, pick } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { Dragon } from '../engine/chars.js';
import { skyTexture } from '../engine/lights.js';

// Omgeving van "IJshockey-Chaos": een kristalgrot met een enorme ijstafel, tribunes vol pinguïns/sneeuwmannen/yeti's/monsters,
// kristallen, ijspegels, een scorebord, een ijsdraak en een pinguïn-schutter.

export const TB = { LX: 16, LZ: 8.5, SD: 2.4, GH: 3.1 };   // halve lengte, halve breedte, doeldiepte, halve doelopening

function tableTexture(colors) {
  const W = 1280, H = 680;
  return canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(5);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d6f2ff'); gr.addColorStop(0.5, '#b9e6fb'); gr.addColorStop(1, '#a4d9f4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // vorstvlekken en krasjes
    for (let i = 0; i < 110; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.14})`; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 80, 6 + r() * 26, r() * 3, 0, TAU); g.fill(); }
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.4})`; g.lineWidth = 1 + r() * 2; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(90,160,210,.25)'; g.lineWidth = 1.5; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 100; y += (r() - 0.5) * 100; g.lineTo(x, y); } g.stroke(); }
    const sx = w / (2 * TB.LX), sz = h / (2 * TB.LZ);   // pixels per wereld-eenheid
    // midden: cirkel + lijn
    g.strokeStyle = 'rgba(40,110,190,.8)'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.lineWidth = 8; g.beginPath(); g.ellipse(w / 2, h / 2, 3.2 * sx, 3.2 * sz, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(40,110,190,.85)'; g.beginPath(); g.ellipse(w / 2, h / 2, 0.5 * sx, 0.5 * sz, 0, 0, TAU); g.fill();
    // sneeuwvlok in het midden
    g.save(); g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 7;
    for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -2.6 * sz); g.moveTo(0, -1.5 * sz); g.lineTo(0.6 * sx, -2.0 * sz); g.moveTo(0, -1.5 * sz); g.lineTo(-0.6 * sx, -2.0 * sz); g.stroke(); }
    g.restore();
    // doelcirkels (halve cirkels in de kleur van de speler) + aftrap-stippen
    for (const side of [-1, 1]) {
      const ex = side < 0 ? 0 : w, col = colors[side < 0 ? 0 : 1];
      g.fillStyle = col.replace('1)', '.18)'); g.strokeStyle = col; g.lineWidth = 8;
      g.beginPath(); g.ellipse(ex, h / 2, 4.6 * sx, 4.6 * sz, 0, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI * 1.5, side > 0); g.fill(); g.stroke();
      g.fillStyle = 'rgba(40,110,190,.8)';
      for (const dz of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + side * 7 * sx, h / 2 + dz * 4.8 * sz, 0.4 * sx, 0.4 * sz, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,110,190,.55)'; g.lineWidth = 5; g.beginPath(); g.ellipse(w / 2 + side * 7 * sx, h / 2 + dz * 4.8 * sz, 2 * sx, 2 * sz, 0, 0, TAU); g.stroke(); }
    }
  });
}
function rockTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(19);
    g.fillStyle = '#241a3e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const l = 20 + r() * 40; g.fillStyle = `rgba(${l + 20},${l},${l + 70},${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 4 + r() * 16, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(120,200,255,.18)'; g.lineWidth = 1.5; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  });
}
function netTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#10182c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(210,235,255,.85)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
  });
}
function glowTexture() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

function crystalCluster(color, h = 3) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.2, transparent: true, opacity: 0.93, flatShading: true });
  const spec = [[0, 0, 1, 0, 0], [0.5, 0.2, 0.62, 0.35, 0.2], [-0.5, 0.1, 0.55, -0.4, -0.1], [0.15, -0.5, 0.45, 0.1, -0.5], [-0.2, 0.5, 0.4, -0.2, 0.5]];
  for (const [x, z, s, rz, rx] of spec) g.add(mesh(new THREE.ConeGeometry(h * 0.16 * (0.6 + s * 0.6), h * s, 5), m, { cast: false, pos: [x * h * 0.5, h * s * 0.5, z * h * 0.5], rot: [rx, 0, rz] }));
  return g;
}
function penguinObj() {
  const g = new THREE.Group();
  const blk = mat(0x16181f, { flatShading: false }), wht = mat(0xf4f6fa, { flatShading: false }), org = mat(0xf2a33a, { flatShading: false });
  const body = new THREE.Group(); g.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), blk, { cast: false, pos: [0, 0.6, 0], scale: [1, 1.35, 0.9] }));
  body.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), wht, { cast: false, pos: [0, 0.55, 0.12], scale: [1, 1.3, 0.8] }));
  const head = new THREE.Group(); head.position.set(0, 1.28, 0.02); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.27, 12, 10), blk, { cast: false }));
  head.add(mesh(new THREE.ConeGeometry(0.08, 0.24, 5), org, { cast: false, pos: [0, -0.03, 0.3], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) { head.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), wht, { cast: false, pos: [sx * 0.11, 0.07, 0.22] })); head.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), blk, { cast: false, pos: [sx * 0.11, 0.07, 0.27] })); }
  const fl = [];
  for (const sx of [-1, 1]) { const f = mesh(new THREE.SphereGeometry(0.16, 6, 5), blk, { cast: false, pos: [sx * 0.42, 0.7, 0], scale: [0.35, 1.5, 0.8] }); f.rotation.z = -sx * 0.4; body.add(f); fl.push(f); body.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), org, { cast: false, pos: [sx * 0.17, 0.03, 0.12] })); }
  g.userData = { body, head, fl };
  return g;
}
function snowman() {
  const g = new THREE.Group(); const w = mat(0xf6fbff, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.55, 10, 8), w, { cast: false, pos: [0, 0.5, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), w, { cast: false, pos: [0, 1.2, 0] }));
  const head = new THREE.Group(); head.position.y = 1.75; g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), w, { cast: false }));
  head.add(mesh(new THREE.ConeGeometry(0.06, 0.34, 5), mat(0xf28a1c), { cast: false, pos: [0, -0.02, 0.32], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.04, 5, 4), mat(0x111111), { cast: false, pos: [sx * 0.11, 0.1, 0.26] }));
  head.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), mat(0x222233), { cast: false, pos: [0, 0.38, 0] }), mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 10), mat(0x222233), { cast: false, pos: [0, 0.24, 0] }));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), mat(0x6b4a2e), { cast: false, pos: [sx * 0.6, 1.3, 0], rot: [0, 0, sx * 1.0] }));
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.09, 6, 12), mat(0xd8372c, { flatShading: false }), { cast: false, pos: [0, 1.5, 0], rot: [Math.PI / 2, 0, 0] }));
  g.userData = { head };
  return g;
}
function yeti() {
  const g = new THREE.Group(); const f = mat(0xe8f2ff, { flatShading: true });
  g.add(mesh(new THREE.SphereGeometry(0.75, 9, 7), f, { cast: false, pos: [0, 0.85, 0], scale: [1.1, 1.2, 0.95] }));
  const head = new THREE.Group(); head.position.y = 1.95; g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.45, 9, 7), f, { cast: false }));
  head.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0x7ac0e8, { flatShading: false }), { cast: false, pos: [0, -0.02, 0.26], scale: [1, 0.85, 0.6] }));
  for (const sx of [-1, 1]) { head.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), mat(0xffffff), { cast: false, pos: [sx * 0.13, 0.07, 0.38] })); head.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), mat(0x111111), { cast: false, pos: [sx * 0.13, 0.07, 0.43] })); }
  head.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), mat(0x331111), { cast: false, pos: [0, -0.14, 0.4] }));
  const arms = [];
  for (const sx of [-1, 1]) { const a = new THREE.Group(); a.position.set(sx * 0.85, 1.4, 0); a.add(mesh(new THREE.CapsuleGeometry(0.2, 0.7, 3, 6), f, { cast: false, pos: [0, -0.4, 0] })); g.add(a); arms.push(a); }
  g.userData = { head, arms };
  return g;
}

export function buildArena(ctx, L, colors) {
  const { scene, fx } = ctx;
  const { LX, LZ, SD, GH } = TB;
  const rng = mulberry32(777);
  const A = { crowd: [], pulse: [], goalGlow: [], flashT: [0, 0], crystals: [] };
  scene.background = skyTexture('#080a24', '#1c2a5c');
  scene.fog = new THREE.Fog(0x141a40, 48, 130);

  // ---------------- grot ----------------
  const rockT = rockTexture(); rockT.wrapS = rockT.wrapT = THREE.RepeatWrapping; rockT.repeat.set(10, 3);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 60, 24, 1, true), new THREE.MeshStandardMaterial({ map: rockT, color: 0xb8b0ff, side: THREE.BackSide, roughness: 1, flatShading: true })); shell.position.y = 18; shell.receiveShadow = false; scene.add(shell);
  // vloer
  const floorT = tex.stone(18, 14);
  const floor = mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ map: floorT, color: 0x4a5a98, roughness: 0.6, metalness: 0.2 }), { cast: false, pos: [0, -1.6, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(floor);
  // magische cirkel op de grotvloer
  {
    const rt = canvasTex(1024, 1024, (g, w, h) => {
      g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(120,220,255,.95)'; g.lineWidth = 6; g.lineCap = 'round';
      for (const r of [480, 440, 300]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      g.lineWidth = 3;
      for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; g.save(); g.rotate(a); g.beginPath(); g.moveTo(446, 0); g.lineTo(474, 0); g.stroke(); g.restore(); }
      g.strokeStyle = 'rgba(190,140,255,.9)'; g.lineWidth = 5;
      for (let k = 0; k < 8; k++) { g.save(); g.rotate(k / 8 * TAU); g.beginPath(); g.moveTo(300, 0); g.lineTo(380, 36); g.lineTo(440, 0); g.lineTo(380, -36); g.closePath(); g.stroke(); g.restore(); }
      g.strokeStyle = 'rgba(120,220,255,.8)'; g.lineWidth = 4;
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(Math.cos(a) * 296, Math.sin(a) * 296); } g.closePath(); g.stroke();
    });
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(88, 88), new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    circle.rotation.x = -Math.PI / 2; circle.position.y = -1.5; scene.add(circle); A.circle = circle;
  }
  // stalactieten + ijspegels
  const stalM = new THREE.MeshStandardMaterial({ color: 0x4a4e8a, roughness: 0.6, flatShading: true });
  const icicleM = new THREE.MeshStandardMaterial({ color: 0xcfeeff, emissive: 0x3a7ab0, emissiveIntensity: 0.4, roughness: 0.2, transparent: true, opacity: 0.9, flatShading: true });
  for (let i = 0; i < 30; i++) {
    const a = rng() * TAU, rr = 24 + rng() * 34, len = 6 + rng() * 14, r = 0.9 + rng() * 1.6;
    scene.add(mesh(new THREE.ConeGeometry(r, len, 6), i % 3 ? stalM : icicleM, { cast: false, receive: false, pos: [Math.cos(a) * rr, 38 - len / 2, Math.sin(a) * rr - 6], rot: [Math.PI, 0, 0] }));
  }
  // kristallen rondom
  const cols = [0x57e0ff, 0xb06bff, 0xff6fd8, 0x6bff9a, 0x57e0ff, 0xffd86b];
  const spots = [[-26, -12], [-20, -22], [-8, -26], [6, -27], [18, -23], [27, -13], [-30, 4], [31, 6], [-27, 18], [28, 19], [-12, -9.5], [14, -10], [-34, -4], [34, -6]];
  spots.forEach(([x, z], i) => { const c = crystalCluster(cols[i % cols.length], 3 + rng() * 4); c.position.set(x, -1.6, z); c.rotation.y = rng() * 6; scene.add(c); A.crystals.push(c); });

  // ---------------- tafel ----------------
  const topTex = tableTexture(colors);
  const iceTop = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.1, metalness: 0.15 });
  const iceSide = new THREE.MeshStandardMaterial({ color: 0x8fd0ee, roughness: 0.25, transparent: true, opacity: 0.92 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * LX, 0.6, 2 * LZ), [iceSide, iceSide, iceTop, iceSide, iceSide, iceSide]); slab.position.set(0, -0.3, 0); slab.receiveShadow = true; scene.add(slab);
  // sokkel (steen) + gouden rand
  const base = mesh(new THREE.BoxGeometry(2 * LX + 3.4, 1.4, 2 * LZ + 3.4), new THREE.MeshStandardMaterial({ map: tex.stone(10, 2), color: 0x9aa4d0, roughness: 0.9, flatShading: true }), { cast: false, pos: [0, -1.0, 0] }); scene.add(base);
  scene.add(mesh(new THREE.BoxGeometry(2 * LX + 3.6, 0.12, 2 * LZ + 3.6), mat(0xe8c24a, { metalness: 0.7, roughness: 0.35 }), { cast: false, pos: [0, -0.28, 0] }));
  // banden
  const railM = new THREE.MeshStandardMaterial({ color: 0xcdeeff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.94, emissive: 0x2a6a9a, emissiveIntensity: 0.25, flatShading: true });
  const trimM = new THREE.MeshStandardMaterial({ color: 0xffd86b, emissive: 0xffa820, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.5 });
  for (const sz of [-1, 1]) {
    scene.add(mesh(new THREE.BoxGeometry(2 * LX + 1.6, 1.0, 0.8), railM, { pos: [0, 0.5, sz * (LZ + 0.4)] }));
    scene.add(mesh(new THREE.BoxGeometry(2 * LX + 1.6, 0.1, 0.9), trimM, { cast: false, pos: [0, 1.02, sz * (LZ + 0.4)] }));
  }
  for (const sx of [-1, 1]) {
    const len = LZ - GH + 0.4;
    for (const sz of [-1, 1]) {
      scene.add(mesh(new THREE.BoxGeometry(0.8, 1.0, len), railM, { pos: [sx * (LX + 0.4), 0.5, sz * (GH + len / 2 - 0.0)] }));
      scene.add(mesh(new THREE.BoxGeometry(0.9, 0.1, len), trimM, { cast: false, pos: [sx * (LX + 0.4), 1.02, sz * (GH + len / 2)] }));
    }
  }
  // doelen
  const netT = netTexture(); netT.wrapS = netT.wrapT = THREE.RepeatWrapping; netT.repeat.set(2, 1);
  A.goals = [];
  for (const sx of [-1, 1]) {
    const gg = new THREE.Group(); gg.position.set(sx * LX, 0, 0); scene.add(gg);
    const colHex = sx < 0 ? 0x35c46f : 0x4a8cff;
    // net (achterwand + zijwanden + dak)
    const netM = new THREE.MeshStandardMaterial({ map: netT, side: THREE.DoubleSide, roughness: 0.9, transparent: true, opacity: 0.92 });
    gg.add(mesh(new THREE.PlaneGeometry(2 * GH, 1.6), netM, { cast: false, pos: [sx * SD, 0.8, 0], rot: [0, Math.PI / 2, 0] }));
    for (const sz of [-1, 1]) gg.add(mesh(new THREE.PlaneGeometry(SD, 1.6), netM, { cast: false, pos: [sx * SD / 2, 0.8, sz * GH] }));
    gg.add(mesh(new THREE.PlaneGeometry(SD, 2 * GH), netM, { cast: false, pos: [sx * SD / 2, 1.6, 0], rot: [-Math.PI / 2, 0, 0] }));
    gg.add(mesh(new THREE.BoxGeometry(SD, 0.04, 2 * GH), new THREE.MeshStandardMaterial({ color: 0x0a1022, roughness: 0.9 }), { cast: false, pos: [sx * SD / 2, 0.02, 0] }));
    // palen (rood-wit) + bovenligger
    const postM = [mat(0xffffff), mat(0xd8372c)];
    for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) gg.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 8), postM[k % 2], { pos: [0, 0.2 + k * 0.4, sz * GH] }));
    gg.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 2 * GH + 0.6), new THREE.MeshStandardMaterial({ color: colHex, emissive: colHex, emissiveIntensity: 0.6, roughness: 0.4 }), { pos: [0, 1.75, 0] }));
    // doel-flits
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * GH, 1.8), new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fl.position.set(sx * 0.8, 0.9, 0); fl.rotation.y = Math.PI / 2; gg.add(fl);
    A.goals.push({ g: gg, flash: fl, col: colHex });
    // doel-lamp
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colHex, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    lamp.position.set(sx * 0.6, 2.8, 0); lamp.scale.set(6, 4, 1); gg.add(lamp); A.pulse.push(lamp);
  }
  // pinguïn-richel + tribunes
  const ledge = mesh(new THREE.BoxGeometry(2 * LX + 8, 1.0, 3.0), new THREE.MeshStandardMaterial({ map: tex.stone(12, 1), color: 0xa0aad8, roughness: 0.9, flatShading: true }), { cast: false, pos: [0, 0.4, -LZ - 3.0] }); scene.add(ledge);
  const tierM = new THREE.MeshStandardMaterial({ map: tex.stone(14, 1), color: 0x8a94c8, roughness: 1, flatShading: true });
  const tiers = [[-14.5, 1.6, 2.8], [-17.5, 3.1, 2.8], [-20.5, 4.6, 2.8]];
  for (const [z, y, d] of tiers) scene.add(mesh(new THREE.BoxGeometry(80, y + 1.6, d), tierM, { cast: false, pos: [0, (y - 1.6) / 2, z] }));
  // toeschouwers
  const kinds = ['penguin', 'snowman', 'yeti', 'goblin', 'penguin', 'dwarf', 'snowman', 'penguin', 'jester', 'yeti', 'skeleton', 'penguin'];
  let ti = 0;
  for (const [z, y] of tiers) {
    const n = 11;
    for (let k = 0; k < n; k++) {
      const x = -29 + (k + (ti % 2) * 0.5) * (58 / (n - 1)) + (rng() - 0.5) * 1.4;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      let obj, c = null, s = 1;
      if (kind === 'penguin') { obj = penguinObj(); s = 1.7; }
      else if (kind === 'snowman') { obj = snowman(); s = 1.45; }
      else if (kind === 'yeti') { obj = yeti(); s = 1.45; }
      else { c = ctx.make.npc(kind); obj = c.group; s = 1.7; c.faceDir(0, 1); }
      obj.scale.setScalar(s); obj.position.set(x, y, z + (rng() - 0.5) * 0.6); scene.add(obj);
      A.crowd.push({ obj, c, kind, y, ph: rng() * 6, s, cheer: 0 });
    }
    ti++;
  }
  // scorebord
  const sbCanvas = document.createElement('canvas'); sbCanvas.width = 640; sbCanvas.height = 240; const sbG = sbCanvas.getContext('2d');
  const sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.colorSpace = THREE.SRGBColorSpace;
  const sbMat = new THREE.MeshBasicMaterial({ map: sbTex, toneMapped: false });
  for (const sx of [-1, 1]) {
    const sb = new THREE.Group(); sb.position.set(sx * 15.5, 6.3, -12.6); sb.scale.setScalar(0.72); sb.rotation.y = -sx * 0.12; scene.add(sb);
    sb.add(mesh(new THREE.BoxGeometry(11.4, 4.4, 0.7), mat(0x2a2f5c, { metalness: 0.4 }), { cast: false }));
    sb.add(mesh(new THREE.PlaneGeometry(10.8, 3.8), sbMat, { cast: false, receive: false, pos: [0, 0, 0.36] }));
    for (const dx of [-1, 1]) sb.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 18, 4), mat(0x888899, { metalness: 0.6 }), { cast: false, pos: [dx * 4.5, 11.3, 0] }));
  }
  A.scoreboard = (names, score, secs, note) => {
    const g = sbG, w = 640, h = 240;
    g.fillStyle = '#0c1030'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd86b'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px Fredoka, Arial Black, sans-serif';
    g.fillStyle = '#7dffb0'; g.fillText(names[0].toUpperCase(), 140, 44); g.fillStyle = '#8fb8ff'; g.fillText(names[1].toUpperCase(), w - 140, 44);
    g.font = 'bold 116px Fredoka, Arial Black, sans-serif';
    g.fillStyle = '#7dffb0'; g.fillText(String(score[0]), 140, 142); g.fillStyle = '#8fb8ff'; g.fillText(String(score[1]), w - 140, 142);
    g.fillStyle = '#ffd86b'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.fillText(':', w / 2, 128);
    g.font = 'bold 46px Fredoka, Arial Black, sans-serif'; g.fillStyle = secs <= 10 ? '#ff7a6a' : '#ffffff';
    const mm = Math.floor(Math.max(0, secs) / 60), ss = Math.floor(Math.max(0, secs) % 60);
    g.fillText(note || `${mm}:${String(ss).padStart(2, '0')}`, w / 2, 56);
    g.font = 'bold 26px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText('eerste tot 5', w / 2, 205);
    sbTex.needsUpdate = true;
  };
  A.scoreboard(['Wes', 'Jor'], [0, 0], 90);

  // ---------------- draak en pinguïn-schutter ----------------
  const dragon = new Dragon(0x7ad6f0, 0.9); dragon.group.visible = false; dragon.group.position.set(-50, 9, -10); scene.add(dragon.group); A.dragon = dragon;
  const shooter = penguinObj(); shooter.scale.setScalar(2.0); shooter.visible = false; scene.add(shooter); A.shooter = shooter;
  A.dragonFly = { on: false, t: 0, dir: 1, dropped: false, dropU: 0.5 };
  A.shooterAct = { on: false, t: 0, x0: 0, x1: 0, threw: false };

  // ---------------- sfeer-licht ----------------
  const l1 = new THREE.PointLight(0x58d6ff, 1.6, 55, 1.3); l1.position.set(-14, 9, -6); scene.add(l1);
  const l2 = new THREE.PointLight(0xc66bff, 1.4, 55, 1.3); l2.position.set(14, 9, -6); scene.add(l2);
  A.lights = [l1, l2];

  A.cheer = (secs = 2.5, side = 0) => { for (const q of A.crowd) q.cheer = secs * (0.7 + Math.random() * 0.6); };
  A.goalFlash = (side) => { A.flashT[side] = 1.2; };
  A.startDragon = (dir) => { const d = A.dragonFly; d.on = true; d.t = 0; d.dir = dir; d.dropped = false; d.dropU = 0.35 + Math.random() * 0.3; dragon.group.visible = true; };
  A.startShooter = (x1) => { const s = A.shooterAct; s.on = true; s.t = 0; s.x1 = x1; s.x0 = (x1 < 0 ? -1 : 1) * (LX + 7); s.threw = false; shooter.visible = true; };

  let snowAcc = 0;
  A.update = (t, dt) => {
    // kristallen pulseren
    A.crystals.forEach((c, i) => { c.children.forEach((m, k) => { m.material.emissiveIntensity = 0.7 + Math.sin(t * 1.6 + i + k) * 0.25; }); });
    if (A.circle) A.circle.rotation.z = t * 0.03;
    A.pulse.forEach((s, i) => { s.material.opacity = 0.45 + Math.sin(t * 2 + i) * 0.12 + A.flashT[i] * 0.4; });
    for (let i = 0; i < 2; i++) { A.flashT[i] = Math.max(0, A.flashT[i] - dt); const fl = A.goals[i].flash; fl.material.opacity = A.flashT[i] > 0 ? (Math.sin(t * 40) > 0 ? 0.8 : 0.25) * Math.min(1, A.flashT[i] * 2) : 0; }
    A.lights[0].intensity = 1.5 + Math.sin(t * 1.3) * 0.25; A.lights[1].intensity = 1.35 + Math.sin(t * 1.1 + 2) * 0.25;
    // publiek
    for (const q of A.crowd) {
      q.cheer = Math.max(0, q.cheer - dt);
      const hop = q.cheer > 0 ? Math.abs(Math.sin(t * 8 + q.ph)) * 0.8 : Math.abs(Math.sin(t * 1.6 + q.ph)) * 0.08;
      q.obj.position.y = q.y + hop;
      if (q.c) { q.c.pose = q.cheer > 0 ? 'cheer' : 'idle'; q.c.update(dt); }
      else if (q.kind === 'penguin') { const u = q.obj.userData; u.fl.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (0.4 + (q.cheer > 0 ? Math.abs(Math.sin(t * 14 + q.ph)) * 1.0 : 0)); }); }
      else if (q.kind === 'yeti') { const u = q.obj.userData; u.arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * (q.cheer > 0 ? 2.4 + Math.sin(t * 12 + q.ph) * 0.4 : 0.3); }); }
      else if (q.kind === 'snowman') q.obj.rotation.z = q.cheer > 0 ? Math.sin(t * 9 + q.ph) * 0.12 : 0;
    }
    // draak
    const d = A.dragonFly;
    if (d.on) {
      d.t += dt; const dur = 6.5, u = d.t / dur;
      const x = lerp(-48, 48, d.dir > 0 ? u : 1 - u);
      dragon.group.position.set(x, 8.2 + Math.sin(d.t * 2.2) * 0.8, -10);
      dragon.group.rotation.y = d.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      dragon.group.rotation.z = Math.sin(d.t * 2) * 0.08;
      dragon.update(dt);
      if (u >= 1) { d.on = false; dragon.group.visible = false; }
    }
    // pinguïn-schutter
    const s = A.shooterAct;
    if (s.on) {
      s.t += dt; const dur = 5.2; const u = s.t / dur; const u0 = 0.28, u1 = 0.62;
      const x = u < u0 ? lerp(s.x0, s.x1, u / u0) : u < u1 ? s.x1 : lerp(s.x1, s.x0, (u - u1) / (1 - u1));
      shooter.position.set(x, 0.9 + Math.abs(Math.sin(t * 9)) * (u < u0 || u > u1 ? 0.15 : 0), -LZ - 2.6);
      shooter.rotation.y = 0; shooter.rotation.z = (u < u0 || u > u1) ? Math.sin(t * 9) * 0.18 : 0;
      const th = u >= u0 + 0.12 && u <= u1;
      shooter.userData.fl.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (th ? 1.9 + Math.sin(t * 20) * 0.3 : 0.4); });
      if (u >= 1) { s.on = false; shooter.visible = false; }
    }
    // sneeuw / glinsters
    snowAcc += dt * 10; while (snowAcc > 1) { snowAcc -= 1; fx.particles.emit((Math.random() - 0.5) * 60, 22, -20 + Math.random() * 40, (Math.random() - 0.5) * 0.4, -1.4 - Math.random(), 0, { life: 9, size: 0.14 + Math.random() * 0.12, color: Math.random() < 0.7 ? 0xffffff : 0x9fe8ff, gravity: 0, shrink: false }); }
  };
  A.topTex = topTex;
  return A;
}

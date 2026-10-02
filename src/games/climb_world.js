import * as THREE from 'three';
import { mat, mesh, canvasTex, TAU, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { TOWER_X, TOWER_HALF, TOP_Y, towerX, spikeRanges } from './climb_layout.js';

// Alle meshes van De Torenklim: torens, platforms, lava, lucht.
const DEPTH = 2.9, ZC = -0.25;     // platformdiepte en hart (tegen de torenmuur aan)

export function zoneOf(y) { return y < 22 ? 0 : y < 46 ? 1 : y < 72 ? 2 : 3; }
const CAP = [0x5fb04a, 0x8a95b8, 0xf2f6ff, 0xb5483a];     // grasdek, kasteelsteen, wolkig, dakpannen

export function lavaTexture() {
  const rng = mulberry32(11);
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(0.18, '#ff8a1c'); gr.addColorStop(1, '#b02a08'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,220,90' : '120,20,0'},${0.15 + rng() * 0.3})`; g.beginPath(); g.ellipse(rng() * w, rng() * h, 8 + rng() * 26, 4 + rng() * 10, rng() * 3, 0, TAU); g.fill(); }
    g.fillStyle = '#3a0c02'; for (let i = 0; i < 18; i++) { g.globalAlpha = 0.35; g.fillRect(rng() * w, rng() * h, 20 + rng() * 40, 3); } g.globalAlpha = 1;
  }, { repeat: [1, 1] });
}
function arrowTex() {
  return canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#12335a'; g.fillRect(0, 0, w, h); g.fillStyle = '#7fe8ff'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 8, 34); g.lineTo(w * 0.62, 34); g.lineTo(w * 0.62, h - 8); g.lineTo(w * 0.38, h - 8); g.lineTo(w * 0.38, 34); g.lineTo(8, 34); g.fill(); });
}
function glowTex() {
  return canvasTex(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,200,60,.95)'); gr.addColorStop(0.35, 'rgba(255,120,20,.55)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}

export function buildClimbWorld(ctx, layout) {
  const { scene } = ctx; const upd = []; const rng = mulberry32(99);
  const add = (o) => { scene.add(o); return o; };
  const topY = TOP_Y;

  // ---------- torens ----------
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(3, 28), roughness: 1, flatShading: true });
  const towers = [];
  for (const t of [0, 1]) {
    const cx = towerX(t, 0); const g = new THREE.Group(); g.position.set(cx, 0, -4.7); add(g);
    const H = topY + 1.5 + 40;
    g.add(mesh(new THREE.BoxGeometry(TOWER_HALF * 2 + 0.6, H, 5), stoneM, { pos: [0, H / 2 - 40, 0] }));
    // ramen + fakkels (instanced)
    const winG = new THREE.BoxGeometry(0.9, 1.7, 0.3), winM = new THREE.MeshStandardMaterial({ color: 0x1a1226, roughness: 1 });
    const wins = []; for (let y = 5; y < topY - 2; y += 6.4) for (const dx of [-3.4, 3.4]) if (rng() < 0.85) wins.push([dx + (rng() - 0.5) * 0.6, y + rng() * 1.5]);
    const im = new THREE.InstancedMesh(winG, winM, wins.length), glowM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1.3, 0.12), new THREE.MeshBasicMaterial({ color: 0xffc860 }), wins.length), m4 = new THREE.Matrix4();
    wins.forEach(([x, y], i) => { m4.makeTranslation(x, y, 2.55); im.setMatrixAt(i, m4); m4.makeTranslation(x, y, 2.7); glowM.setMatrixAt(i, rng() < 0.55 ? m4 : new THREE.Matrix4().makeScale(0, 0, 0)); });
    g.add(im); g.add(glowM);
    // kantelen boven
    for (let i = 0; i < 7; i++) g.add(mesh(new THREE.BoxGeometry(1.3, 1.5, 1.3), stoneM, { pos: [-5.4 + i * 1.8, topY + 1.6, 2.1] }));
    g.add(mesh(new THREE.BoxGeometry(TOWER_HALF * 2 + 1.2, 0.8, 5.6), mat(0x6c6f86), { pos: [0, topY + 0.8, 0] }));
    g.add(mesh(new THREE.ConeGeometry(7.4, 10, 8), mat(t ? 0x3a78e0 : 0x2f9e5b), { pos: [0, topY + 7.2, -0.8] }));
    // banieren langs de torenmuur
    for (const [bx, by] of [[-5.2, 12], [5.2, 30], [-5.2, 52], [5.2, 78]]) { const bn = P.banner(t ? 0x3a78e0 : 0x2f9e5b, 5.2, 1.6); bn.position.set(bx, by - 2.2, 2.4); g.add(bn); upd.push((tt) => P.animateBanner(bn, tt + bx)); }
    towers.push(g);
  }
  // rotsige "eiland"-basis onder de grond, zodat het uit de lava steekt
  add(mesh(new THREE.BoxGeometry(37, 80, 7.4), new THREE.MeshStandardMaterial({ map: tex.stone(6, 14), roughness: 1, color: 0x8a7a70 }), { pos: [0, -40.6, -2.4] }));

  // ---------- platforms ----------
  const meshes = new Map();
  const woodM = new THREE.MeshStandardMaterial({ map: tex.planks(2, 1, '#9a6a3c'), roughness: 0.9 });
  const darkM = mat(0x3a2a22), metalM = mat(0x8a8fa0, { metalness: 0.6, roughness: 0.4 });
  const cloudM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.97 });
  const spikeM = mat(0xc8ccd6, { metalness: 0.7, roughness: 0.3 });
  const arrow = arrowTex();
  for (const p of layout) {
    const g = new THREE.Group(); g.userData.p = p; add(g);
    const z = ZC, w = p.w, zn = zoneOf(p.y0);
    const parts = {};
    if (p.type === 'ground') {
      g.add(mesh(new THREE.BoxGeometry(w, 1.4, 7.4), new THREE.MeshStandardMaterial({ map: tex.cobble(14, 2), roughness: 1 }), { pos: [0, -0.7, -2.4] }));
      g.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.2, 7.6), mat(0x5fb04a), { pos: [0, -0.05, -2.4], cast: false }));
      for (let i = 0; i < 14; i++) { const f = P.flowerPatch([0xff6fa5, 0xffe14a, 0xffffff][i % 3], 5, 0.8); f.position.set(-16 + i * 2.4 + rng() * 1.2, 0, -0.2 + rng() * 0.9); g.add(f); }
    } else if (p.type === 'stone' || p.type === 'top' || p.type === 'bridge') {
      const cap = p.type === 'top' ? 0xe8c24a : p.type === 'bridge' ? 0x9a6a3c : CAP[zn];
      const body = p.type === 'bridge' ? woodM : new THREE.MeshStandardMaterial({ map: tex.stone(Math.max(1, w / 2), 1), roughness: 1, flatShading: true });
      g.add(mesh(new THREE.BoxGeometry(w, 0.7, DEPTH), body, { pos: [0, -0.35, z] }));
      g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.2, DEPTH + 0.1), p.type === 'bridge' ? woodM : mat(cap), { pos: [0, -0.04, z + 0.02], cast: false }));
      if (p.type === 'stone') for (let i = 0; i < 2; i++) g.add(mesh(new THREE.ConeGeometry(0.28, 0.9 + rng() * 0.6, 5), mat(0x7a7a88), { pos: [(i - 0.5) * w * 0.5, -1.0, z + 0.4], rot: [Math.PI, 0, 0] }));
      if (p.type === 'bridge') {
        for (const sx of [-1, 1]) { g.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), darkM, { pos: [sx * (w / 2 - 0.1), 0.55, z + DEPTH / 2 - 0.2] })); g.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), darkM, { pos: [sx * (w / 2 - 0.1), 0.55, z - DEPTH / 2 + 0.2] })); }
        g.add(mesh(new THREE.BoxGeometry(w, 0.1, 0.1), darkM, { pos: [0, 1.0, z + DEPTH / 2 - 0.2] }));
        const bn = P.banner(0xe8c24a, 2.0, 1.1); bn.position.set(0, 0.2, z + DEPTH / 2 - 0.1); bn.scale.setScalar(0.8); g.add(bn); upd.push((tt) => P.animateBanner(bn, tt + p.id));
      }
      if (p.type === 'top') {
        // vlag en bordje "Kasteeltop"
        const pole = mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 6), mat(0xd8d8e0, { metalness: 0.6 }), { pos: [0, 2.6, z + 0.4] }); g.add(pole);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 6, 3), new THREE.MeshStandardMaterial({ map: canvasTex(128, 80, (c, ww, hh) => { c.fillStyle = p.tower ? '#3a78e0' : '#2f9e5b'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#ffe14a'; c.font = 'bold 44px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', ww / 2, hh / 2 + 2); c.strokeStyle = '#ffe14a'; c.lineWidth = 6; c.strokeRect(3, 3, ww - 6, hh - 6); }), side: THREE.DoubleSide, roughness: 0.8 }));
        cloth.position.set(1.3, 4.4, z + 0.4); g.add(cloth); g.userData.cloth = cloth; g.userData.cbase = cloth.geometry.attributes.position.array.slice();
        g.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xffcf3a, { metalness: 0.8 }), { pos: [0, 5.3, z + 0.4] }));
        const sign = mesh(new THREE.BoxGeometry(4.2, 0.9, 0.2), new THREE.MeshStandardMaterial({ map: tex.sign('KASTEELTOP', { w: 384, h: 84, size: 42, bg: '#2a2a3a', fg: '#ffe14a', border: '#e8c24a' }) }), { pos: [0, 6.3, z - 1.2] }); g.add(sign);
      }
      if (p.spikes) for (const [a, b] of p.spikes) { const n = Math.max(2, Math.round((b - a) / 0.4)); for (let i = 0; i < n; i++) g.add(mesh(new THREE.ConeGeometry(0.2, 0.75, 4), spikeM, { pos: [(p.tower === 1 ? -1 : 1) * (a + (i + 0.5) * (b - a) / n), 0.35, z + 0.2 + (i % 2) * 0.5], rot: [0, 0.7, 0] })); }
    } else if (p.type === 'cloud') {
      const cg = new THREE.Group(); g.add(cg); parts.cloud = cg;
      const n = Math.max(3, Math.round(w / 0.85));
      for (let i = 0; i < n; i++) { const r = 0.62 + (i % 2) * 0.16; cg.add(mesh(new THREE.IcosahedronGeometry(r, 1), cloudM, { cast: false, pos: [(i - (n - 1) / 2) * (w / n) * 1.05, -0.35 + (i % 2) * 0.1, z + (i % 3 - 1) * 0.3], scale: [1.2, 0.8, 1.4] })); }
      cg.add(mesh(new THREE.BoxGeometry(w * 0.9, 0.12, DEPTH * 0.75), cloudM, { cast: false, pos: [0, -0.06, z] }));
    } else if (p.type === 'move' || p.type === 'lift') {
      g.add(mesh(new THREE.BoxGeometry(w, 0.55, DEPTH), woodM, { pos: [0, -0.28, z] }));
      g.add(mesh(new THREE.BoxGeometry(w + 0.16, 0.16, DEPTH + 0.1), metalM, { pos: [0, -0.5, z] }));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.5, DEPTH + 0.1), metalM, { pos: [sx * w / 2, -0.25, z] }));
      if (p.type === 'lift') { for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 9, 4), darkM, { cast: false, pos: [sx * (w / 2 - 0.2), 4.4, z + DEPTH / 2 - 0.2] })); }
      else for (const sx of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.22, 0.5, 3), mat(0xffd23f), { cast: false, pos: [sx * (w / 2 + 0.5), -0.2, z + 0.4], rot: [0, 0, -sx * Math.PI / 2] }));
    } else if (p.type === 'spring') {
      const drum = mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 12), mat(0xd8372c), { pos: [0, -0.28, z + 0.3] }); g.add(drum);
      const top = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 12), mat(0xf4f0e6), { pos: [0, 0.0, z + 0.3] }); g.add(top); parts.top = top;
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.5, 0.06, 5, 12), metalM, { cast: false, pos: [0, -0.5 - i * 0.12, z + 0.3], rot: [Math.PI / 2, 0, 0] }));
      g.add(mesh(new THREE.BoxGeometry(w + 0.4, 0.3, DEPTH * 0.6), mat(0x6c6f86), { pos: [0, -0.8, z] }));
    } else if (p.type === 'pad') {
      const plate = mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.14, 14), new THREE.MeshStandardMaterial({ map: arrow, emissive: 0x3ab8ff, emissiveMap: arrow, emissiveIntensity: 0.9 }), { cast: false, pos: [0, -0.04, z + 0.3] }); g.add(plate); parts.plate = plate;
    }
    // sluiproute-markering: gouden schoen
    if (p.shoe) {
      const sh = new THREE.Group(); const gold = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffa500, emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.25 });
      sh.add(mesh(new THREE.BoxGeometry(0.35, 0.28, 0.75), gold, { pos: [0, 0.14, 0.1] })); sh.add(mesh(new THREE.BoxGeometry(0.3, 0.45, 0.3), gold, { pos: [0, 0.35, -0.12] })); sh.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), gold, { pos: [0, 0.2, 0.5], scale: [1, 0.8, 1] }));
      sh.position.set(0, 0.8, 0.2); g.add(sh); parts.shoe = sh;
    }
    g.position.set(p.x, p.y, 0);
    meshes.set(p.id, { g, parts });
  }

  // ---------- lava ----------
  const lt = lavaTexture(); lt.repeat.set(4, 1);
  const lg = new THREE.PlaneGeometry(110, 70, 60, 1);
  const lavaM = new THREE.MeshStandardMaterial({ map: lt, emissive: 0xff6a10, emissiveMap: lt, emissiveIntensity: 0.9, roughness: 0.6 });
  const lava = new THREE.Mesh(lg, lavaM); lava.position.z = 1.9; lava.renderOrder = 2; add(lava);
  const lavaBack = new THREE.Mesh(new THREE.PlaneGeometry(130, 70), new THREE.MeshBasicMaterial({ map: lt, color: 0xcc5a1a })); lavaBack.position.z = -9; add(lavaBack);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(110, 4.5), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.z = 2.0; glow.renderOrder = 3; add(glow);
  const basePos = lg.attributes.position.array.slice();
  function setLava(y, t) {
    lava.position.y = y - 35; lavaBack.position.y = y - 35 - 0.4; glow.position.y = y + 1.4;
    const pos = lg.attributes.position;
    for (let i = 0; i < pos.count; i++) { const bx = basePos[i * 3], by = basePos[i * 3 + 1]; pos.setY(i, by + (by > 0 ? Math.sin(bx * 0.45 + t * 2.2) * 0.35 + Math.sin(bx * 0.9 - t * 3.1) * 0.15 : 0)); }
    pos.needsUpdate = true; lt.offset.x = t * 0.02; lt.offset.y = t * 0.04;
  }

  // ---------- lucht, sterren, wolken ----------
  const stars = (() => { const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (rng() - 0.5) * 140; pos[i * 3 + 1] = 40 + rng() * 140; pos[i * 3 + 2] = -30 - rng() * 20; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, transparent: true, opacity: 0, fog: false, depthWrite: false }); const pts = new THREE.Points(g, m); pts.frustumCulled = false; add(pts); return pts; })();
  const clouds = []; for (let i = 0; i < 16; i++) { const c = P.cloud(1.5 + rng() * 1.5); c.position.set((rng() - 0.5) * 90, 8 + i * 8 + rng() * 5, -18 - rng() * 20); add(c); clouds.push(c); }
  const moon = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false, transparent: true, opacity: 0 })); moon.position.set(0, topY + 8, -55); add(moon);
  const skyC = [new THREE.Color(0x6ab4ff), new THREE.Color(0x8a78d8), new THREE.Color(0x4a3a8a), new THREE.Color(0x0c1230)];
  const skyTmp = new THREE.Color();
  function setSky(y) {
    const f = Math.min(1, Math.max(0, y / topY)) * 3, i = Math.min(2, Math.floor(f)); skyTmp.copy(skyC[i]).lerp(skyC[i + 1], f - i);
    scene.background = skyTmp; if (scene.fog) scene.fog.color.copy(skyTmp);
    stars.material.opacity = Math.min(1, Math.max(0, (y - 40) / 40)); moon.material.opacity = stars.material.opacity;
  }
  // verre bergen onderaan
  const mt = mat(0x5a5470);
  [[-50, -30, 26], [-22, -34, 34], [24, -32, 30], [52, -30, 24]].forEach(([x, z, h]) => add(mesh(new THREE.ConeGeometry(h * 0.9, h, 6), mt, { cast: false, pos: [x, h / 2 - 8, z] })));

  return {
    meshes, setLava, setSky, stars,
    update(t, dt, camY) {
      for (const f of upd) f(t, dt);
      for (const [id, m] of meshes) { const c = m.g.userData.cloth; if (c) { const pa = c.geometry.attributes.position, b = m.g.userData.cbase; for (let i = 0; i < pa.count; i++) { const x = b[i * 3]; pa.setZ(i, Math.sin(t * 5 + x * 3) * 0.12 * (x + 1.2)); } pa.needsUpdate = true; } }
      for (const c of clouds) { c.position.x += dt * 0.5; if (c.position.x > 55) c.position.x = -55; }
    },
  };
}

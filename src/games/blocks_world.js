import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { skyTexture } from '../engine/lights.js';
import { boxGeo, glowTex } from './stack_world.js';

// Omgeving van "Blokkenstrijd": de Neonkelder — een donkere kasteelkelder vol neonbuizen, een gloeiende rasters-vloer,
// zwevende blokjes, fakkels en twee gloeiende speelvelden met een voetstuk en een scoreplaatje.
export const FW = 10, FH = 16, FX = [-9.5, 9.5];
const NEON = ['#35e6ff', '#ff5ad8', '#ffe14a', '#8dff6a', '#b45cff'];

// Afgeschuinde, glanzende blok-textuur (wit zodat instance-kleuren hem inkleuren)
export function bevelTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d8d8e0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w - 9, 9); g.lineTo(9, 9); g.lineTo(9, h - 9); g.lineTo(0, h); g.closePath(); g.fill();
    g.fillStyle = '#8a8a9a'; g.beginPath(); g.moveTo(w, h); g.lineTo(0, h); g.lineTo(9, h - 9); g.lineTo(w - 9, h - 9); g.lineTo(w - 9, 9); g.lineTo(w, 0); g.closePath(); g.fill();
    const gr = g.createLinearGradient(9, 9, w - 9, h - 9); gr.addColorStop(0, '#f4f4fa'); gr.addColorStop(1, '#bcbccc'); g.fillStyle = gr; g.fillRect(9, 9, w - 18, h - 18);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(22, 20, 11, 5, -0.6, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  });
}
function gridTexture(cols, rows, line = 'rgba(120,200,255,.22)', bg = 'rgba(8,6,24,.9)') {
  return canvasTex(64 * cols / 2, 64 * rows / 2, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = line; g.lineWidth = 2;
    for (let x = 0; x <= cols; x++) { g.beginPath(); g.moveTo(x * w / cols, 0); g.lineTo(x * w / cols, h); g.stroke(); }
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * h / rows); g.lineTo(w, y * h / rows); g.stroke(); }
  });
}
function floorTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0a0818'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#35e6ff'; g.lineWidth = 3; g.shadowColor = '#35e6ff'; g.shadowBlur = 8;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.strokeStyle = '#ff5ad8'; g.shadowColor = '#ff5ad8'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  }, { repeat: [24, 14] });
}
export function neonText(text, color, w = 640, h = 160, size = 110) {
  return canvasTex(w, h, (g) => {
    g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 10; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildArena(ctx, names, colors) {
  const { scene } = ctx;
  const rng = mulberry32(2024);
  const idx0 = scene.children.length;
  const A = { fields: [] };
  scene.background = skyTexture('#06030f', '#150a30');
  scene.fog = new THREE.Fog(0x0c0620, 45, 120);

  // vloer met neon-raster + achterwand van kasteel-steen
  const ft = floorTexture(); A.floorTex = ft;
  const floor = mesh(new THREE.PlaneGeometry(130, 70), new THREE.MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.4 }), { cast: false, pos: [0, -0.03, 4], rot: [-Math.PI / 2, 0, 0] }); scene.add(floor);
  const bw = tex.bricks(16, 8);
  scene.add(mesh(new THREE.PlaneGeometry(130, 50), new THREE.MeshStandardMaterial({ map: bw, color: 0x7060a8, roughness: 0.95 }), { cast: false, receive: false, pos: [0, 20, -9] }));
  // neon-bogen op de achterwand
  const archMats = NEON.map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
  [[-29, 0], [29, 2], [-44, 4], [44, 3]].forEach(([x, ci], k) => {
    const g = new THREE.Group(); g.position.set(x, 0, -8.8);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(6, 0.14, 6, 24, Math.PI), archMats[ci]); tor.position.y = 12; g.add(tor);
    for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 12, 0.28), archMats[ci]); leg.position.set(sx * 6, 6, 0); g.add(leg); }
    scene.add(g);
  });
  // zware stenen pilaren met fakkels
  const pillarM = new THREE.MeshStandardMaterial({ map: tex.stone(1, 4), color: 0x6a5c9a, roughness: 0.9, flatShading: true });
  A.torches = [];
  for (const sx of [-1, 1]) {
    scene.add(mesh(new THREE.BoxGeometry(2.4, 26, 2.4), pillarM, { cast: false, pos: [sx * 18.4, 13, -2.5] }));
    for (const dy of [0, 1]) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 })); fl.position.set(sx * 17.1, 6 + dy * 7.5, -1.2);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); gl.scale.set(5, 5, 1); gl.position.copy(fl.position);
      scene.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6), mat(0x3a2a1e), { cast: false, pos: [sx * 17.1, 5.6 + dy * 7.5, -1.2] }));
      scene.add(fl, gl); A.torches.push({ fl, gl, ph: rng() * 6 });
    }
  }
  // neon-uithangbord boven het midden
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.0), new THREE.MeshBasicMaterial({ map: neonText('BLOKKEN', '#ffe14a', 512, 140, 100), transparent: true, depthWrite: false, toneMapped: false }));
  sign.position.set(0, 14.8, -0.8); scene.add(sign);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.0), new THREE.MeshBasicMaterial({ map: neonText('STRIJD', '#ff5ad8', 512, 140, 100), transparent: true, depthWrite: false, toneMapped: false }));
  sign2.position.set(0, 13.15, -0.8); scene.add(sign2); A.signs = [sign, sign2];

  // speelvelden: achtergrondvlak, neon-lijst, voetstuk
  for (let i = 0; i < 2; i++) {
    const cx = FX[i], col = colors[i];
    const g = new THREE.Group(); g.position.set(cx, 0, 0); scene.add(g);
    const gt = gridTexture(FW, FH);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.93 })); panel.position.set(0, FH / 2, -0.55); g.add(panel);
    const fm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.5 });
    const frame = new THREE.Group(); g.add(frame);
    frame.add(mesh(new THREE.BoxGeometry(0.5, FH + 0.6, 1.3), fm, { cast: false, pos: [-FW / 2 - 0.25, FH / 2 + 0.1, 0] }));
    frame.add(mesh(new THREE.BoxGeometry(0.5, FH + 0.6, 1.3), fm, { cast: false, pos: [FW / 2 + 0.25, FH / 2 + 0.1, 0] }));
    frame.add(mesh(new THREE.BoxGeometry(FW + 1.5, 0.5, 1.3), fm, { cast: false, pos: [0, -0.25, 0] }));
    frame.add(mesh(new THREE.BoxGeometry(FW + 1.5, 0.35, 1.3), fm, { cast: false, pos: [0, FH + 0.15, 0] }));
    const dark = new THREE.MeshStandardMaterial({ map: tex.stone(3, 1), color: 0x5a4c88, roughness: 0.9, flatShading: true });
    g.add(mesh(new THREE.BoxGeometry(FW + 2.6, 1.3, 2.6), dark, { cast: false, pos: [0, -1.15, 0.2] }));
    // scoreplaatje op het voetstuk
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112; const cg = cv.getContext('2d');
    const ptex = new THREE.CanvasTexture(cv); ptex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(FW + 0.8, 1.0), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false })); plaque.position.set(0, -1.0, 1.52); g.add(plaque);
    const css = '#' + new THREE.Color(col).getHexString();
    const drawPlaque = (score, lines) => {
      cg.fillStyle = '#0c0820'; cg.fillRect(0, 0, 512, 112); cg.strokeStyle = css; cg.lineWidth = 8; cg.strokeRect(4, 4, 504, 104);
      cg.textBaseline = 'middle'; cg.textAlign = 'left'; cg.font = 'bold 54px Fredoka, Arial Black, sans-serif'; cg.fillStyle = css; cg.fillText(names[i], 26, 58);
      cg.textAlign = 'right'; cg.fillStyle = '#ffffff'; cg.fillText(String(score), 486, 46);
      cg.font = 'bold 26px Fredoka, Arial Black, sans-serif'; cg.fillStyle = '#bfb6e8'; cg.fillText(`${lines} rijen`, 486, 86);
      ptex.needsUpdate = true;
    };
    drawPlaque(0, 0);
    // pedestal voor het poppetje in de middenstrook
    scene.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.9, 14), dark, { cast: false, pos: [i ? 2.35 : -2.35, -0.2, 1.1] }));
    A.fields.push({ g, frameMat: fm, panel, drawPlaque, col });
  }
  // zwevende blokjes op de achtergrond
  const nb = 46;
  const cubeIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: bevelTexture(), transparent: true, opacity: 0.5, fog: true }), nb);
  cubeIM.frustumCulled = false; scene.add(cubeIM);
  const cubes = Array.from({ length: nb }, () => ({ x: (rng() - 0.5) * 70, y: rng() * 36 - 4, z: -3 - rng() * 12, s: 0.7 + rng() * 1.6, sp: 0.4 + rng() * 0.9, r: rng() * 6, vr: (rng() - 0.5) * 0.8 }));
  const c = new THREE.Color(); cubes.forEach((q, k) => { c.set(NEON[k % 5]).multiplyScalar(0.55); cubeIM.setColorAt(k, c); });
  const d = new THREE.Object3D();
  A.update = (t, dt, flash = 0) => {
    ft.offset.y = (t * 0.03) % 1;
    for (let k = 0; k < nb; k++) {
      const q = cubes[k]; q.y += q.sp * dt; if (q.y > 36) q.y = -4;
      d.position.set(q.x, q.y, q.z); d.rotation.set(t * q.vr + q.r, t * q.vr * 0.7, q.r); d.scale.setScalar(q.s); d.updateMatrix(); cubeIM.setMatrixAt(k, d.matrix);
    }
    cubeIM.instanceMatrix.needsUpdate = true;
    for (const tc of A.torches) { const f = 0.85 + Math.sin(t * 11 + tc.ph) * 0.15 + Math.sin(t * 23 + tc.ph * 2) * 0.08; tc.fl.scale.set(f, f * (1 + Math.sin(t * 9 + tc.ph) * 0.1), f); tc.gl.material.opacity = 0.5 + f * 0.25; }
    A.signs[0].material.opacity = 0.85 + Math.sin(t * 3) * 0.1; A.signs[1].material.opacity = Math.sin(t * 2.2 + 1) > 0.92 ? 0.35 : 0.95;
  };
  A.lights = [new THREE.PointLight(0x35e6ff, 1.4, 34, 1.4), new THREE.PointLight(0xff5ad8, 1.4, 34, 1.4)];
  A.lights[0].position.set(-9.5, 9, 6); A.lights[1].position.set(9.5, 9, 6); scene.add(...A.lights);
  return A;
}

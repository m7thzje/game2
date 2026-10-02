import * as THREE from 'three';
import { mat, mesh, glow, canvasTex, mulberry32, TAU, rand, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';

// De Toverschilderszaal: een kasteelzaal vol verf, gebrandschilderde ramen, zwevende toverkwasten en borrelende regenboogketels.
const PAINTS = [0xff4a6a, 0xffc93c, 0x35c46f, 0x3d82ff, 0xb066ff, 0xff8a3a, 0x3fd8e0];
const css = (c) => '#' + c.toString(16).padStart(6, '0');

function splashCanvas(seed, w = 256, h = 200, bg = '#f6efe0') {
  return canvasTex(w, h, (g) => {
    const r = mulberry32(seed);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const c = css(PAINTS[Math.floor(r() * PAINTS.length)]); const x = r() * w, y = r() * h, rad = 14 + r() * 38;
      g.fillStyle = c; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      for (let k = 0; k < 7; k++) { const a = r() * TAU, d = rad * (0.9 + r() * 0.8); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 3 + r() * 9, 0, TAU); g.fill(); }
      g.lineWidth = 4 + r() * 5; g.lineCap = 'round'; g.strokeStyle = c; g.beginPath(); g.moveTo(x, y + rad); g.lineTo(x + (r() - 0.5) * 8, y + rad + 20 + r() * 50); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 6);
  });
}

function glassCanvas(seed) {
  return canvasTex(128, 256, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = '#1a1230'; g.fillRect(0, 0, w, h);
    const cols = 4, rows = 8;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = PAINTS[Math.floor(r() * PAINTS.length)];
      const gr = g.createLinearGradient(0, y * 32, 0, y * 32 + 32); gr.addColorStop(0, css(c)); gr.addColorStop(1, 'rgba(255,255,255,.55)');
      g.fillStyle = gr; g.fillRect(x * 32 + 3, y * 32 + 3, 26, 26);
    }
    g.strokeStyle = '#120a22'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(w / 2, 62, 16, 0, TAU); g.fill();
    g.fillStyle = css(PAINTS[Math.floor(r() * PAINTS.length)]); g.beginPath(); g.arc(w / 2, 62, 10, 0, TAU); g.fill();
  });
}

function pillarCanvas() {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#e9e1d2'; g.fillRect(0, 0, w, h);
    for (let i = -4; i < 14; i++) { g.fillStyle = css(PAINTS[(i + 40) % PAINTS.length]); g.beginPath(); g.moveTo(0, i * 28 + 28); g.lineTo(w, i * 28 - 14); g.lineTo(w, i * 28 + 2); g.lineTo(0, i * 28 + 44); g.fill(); }
  });
}

function archGeo(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  return geo;
}

export function buildPaintHall(ctx) {
  const { scene, fx } = ctx;
  const anim = [];
  const add = (o) => { scene.add(o); return o; };

  // ---- vloer rondom + muren ----
  const floorOut = mesh(new THREE.PlaneGeometry(110, 70), new THREE.MeshStandardMaterial({ map: tex.checker(36, 24, '#8a7fa0', '#6a6083'), roughness: 1 }), { cast: false, pos: [0, -0.05, -2], rot: [-Math.PI / 2, 0, 0] });
  add(floorOut);
  add(mesh(new THREE.PlaneGeometry(120, 34), new THREE.MeshStandardMaterial({ map: tex.stone(26, 6), color: 0xbfa9dc, roughness: 1 }), { cast: false, pos: [0, 14, -17] }));
  add(mesh(new THREE.BoxGeometry(120, 2.4, 0.8), mat(0x5b3d6b), { cast: false, pos: [0, 0.6, -16.5] }));
  add(mesh(new THREE.BoxGeometry(120, 0.5, 0.9), mat(0xe8c24a, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, 1.9, -16.4] }));
  for (const sx of [-1, 1]) add(mesh(new THREE.PlaneGeometry(50, 34), new THREE.MeshStandardMaterial({ map: tex.stone(10, 6), color: 0xb09cd0, roughness: 1 }), { cast: false, pos: [sx * 34, 14, 6], rot: [0, -sx * Math.PI / 2, 0] }));

  // rand van de arena: lage stenen lijst
  const rimMat = mat(0x6b5a82);
  const R = 9.9;
  for (const [x, z, w, d] of [[0, -R, 2 * R + 1.6, 0.8], [0, R, 2 * R + 1.6, 0.8], [-R, 0, 0.8, 2 * R], [R, 0, 0.8, 2 * R]]) {
    add(mesh(new THREE.BoxGeometry(w, 0.7, d), rimMat, { pos: [x, -0.2, z], receive: true }));
    add(mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), mat(0xe8c24a, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [x, 0.17, z] }));
  }

  // ---- ramen (gebrandschilderd) + schilderijen ----
  const glassMat = (seed) => new THREE.MeshBasicMaterial({ map: glassCanvas(seed), fog: false });
  const winX = [-24, -12, 0, 12, 24];
  winX.forEach((x, i) => {
    if (i % 2) return;
    add(mesh(archGeo(4.6, 9.4), mat(0x3a2a52), { cast: false, receive: false, pos: [x, 6.2, -16.55] }));
    const gl = new THREE.Mesh(archGeo(3.8, 8.6), glassMat(7 + i)); gl.position.set(x, 6.6, -16.5); add(gl);
    const glow2 = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 6), new THREE.MeshBasicMaterial({ color: 0xffe8c0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow2.position.set(x, 4.8, -16.45); add(glow2); anim.push((t) => { glow2.material.opacity = 0.05 + Math.sin(t * 0.8 + i) * 0.03; });
  });
  [-18, -6, 6, 18].forEach((x, i) => {
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.2), new THREE.MeshStandardMaterial({ map: splashCanvas(50 + i * 13, 256, 208), roughness: 1 }));
    pic.position.set(x, 8.2, -16.4); add(pic);
    add(mesh(new THREE.BoxGeometry(5.7, 4.7, 0.3), mat(0xc79a2e, { metalness: 0.5, roughness: 0.45 }), { cast: false, pos: [x, 8.2, -16.55] }));
  });

  // hangende banieren (zwaaien zacht)
  const banner = (color, x, y, z) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const s = new THREE.Shape(); const w = 2.0, h = 5.2; s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, -h); s.lineTo(0, -h + 0.9); s.lineTo(-w / 2, -h); s.lineTo(-w / 2, 0);
    g.add(new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 })));
    const em = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), new THREE.MeshBasicMaterial({ color: 0xffffff })); em.position.set(0, -1.9, 0.02); g.add(em);
    const em2 = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), new THREE.MeshBasicMaterial({ color })); em2.position.set(0.1, -1.95, 0.03); g.add(em2);
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), mat(0xe8c24a, { metalness: 0.6 }), { rot: [0, 0, Math.PI / 2], pos: [0, 0.05, 0] }));
    add(g); anim.push((t) => { g.rotation.x = Math.sin(t * 1.3 + x) * 0.05; g.rotation.z = Math.sin(t * 0.9 + x * 2) * 0.03; });
  };
  banner(0x2f9e5b, -10.5, 12.6, -16.1); banner(0x3a78e0, 10.5, 12.6, -16.1);
  banner(0xd8372c, -3, 12.8, -16.1); banner(0xd8372c, 3, 12.8, -16.1);

  // fakkels (zonder lichtbron; gloeiende vlammen)
  const flames = [];
  for (const x of [-15, -9, 9, 15]) {
    const g = new THREE.Group(); g.position.set(x, 5.2, -16.0);
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.07, 1.0, 6), mat(0x3a2a1e), { pos: [0, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.3, 8), mat(0x555566, { metalness: 0.6 }), { pos: [0, 0.62, 0] }));
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.8, 7), new THREE.MeshBasicMaterial({ color: 0xffa030 })); f.position.set(0, 1.15, 0); g.add(f);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffe880 })); f2.position.set(0, 1.0, 0); g.add(f2);
    add(g); flames.push([f, f2, x]);
  }
  anim.push((t) => { for (const [f, f2, x] of flames) { const s = 1 + Math.sin(t * 13 + x) * 0.14 + Math.sin(t * 7.1 + x) * 0.08; f.scale.set(1, s, 1); f2.scale.set(1, 1 + Math.sin(t * 17 + x) * 0.18, 1); } });

  // zuilen met verfstrepen
  const pilTex = pillarCanvas();
  for (const [x, z] of [[-14, -13], [14, -13], [-15.5, 3], [15.5, 3], [-15.5, 12], [15.5, 12]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 13, 14), new THREE.MeshStandardMaterial({ map: pilTex, roughness: 0.8 }), { pos: [0, 6.5, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.7, 14), mat(0xcfc5e0), { pos: [0, 0.2, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.8, 14), mat(0xcfc5e0), { pos: [0, 13.2, 0] }));
    add(g);
  }

  // ---- decor langs de rand ----
  const paintPot = (color, s = 1) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.5 * s, 0.42 * s, 0.7 * s, 12), mat(0xb9bfd0, { metalness: 0.6, roughness: 0.4 }), { pos: [0, 0.35 * s, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.44 * s, 0.44 * s, 0.05 * s, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.3 }), { cast: false, pos: [0, 0.71 * s, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.16 * s, 0.5 * s, 0.1 * s), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), { cast: false, pos: [0.45 * s, 0.45 * s, 0.1 * s] }));
    g.add(mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 1.2 * s, 5), mat(0x8a5a2b), { pos: [0.1 * s, 1.1 * s, 0], rot: [0, 0, 0.2] }));
    g.add(mesh(new THREE.CylinderGeometry(0.09 * s, 0.05 * s, 0.35 * s, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), { pos: [0.22 * s, 1.72 * s, 0], rot: [0, 0, 0.2] }));
    return g;
  };
  const easel = (seed) => {
    const g = new THREE.Group();
    for (const [x, z, rz] of [[-0.7, 0.2, 0.12], [0.7, 0.2, -0.12], [0, -0.55, 0]]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), mat(0x8a5a2b), { pos: [x, 1.65, z], rot: [z < 0 ? -0.25 : 0.08, 0, rz] }));
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.7), new THREE.MeshStandardMaterial({ map: splashCanvas(seed, 256, 200), roughness: 1 })); canvas.position.set(0, 2.3, 0.28); canvas.rotation.x = 0.06; g.add(canvas);
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.14, 0.14), mat(0x8a5a2b), { cast: false, pos: [0, 1.4, 0.3] }));
    return g;
  };
  const place = (o, x, z, ry = 0, s = 1) => { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); add(o); return o; };
  place(easel(3), -13, -9, 0.35, 1.2); place(easel(9), 13.5, -8, -0.4, 1.2); place(easel(21), -17.5, 0, 0.7, 1.1); place(easel(33), 17.8, 1, -0.7, 1.1);
  PAINTS.forEach((c, i) => { place(paintPot(c, 1.15), -12.5 + i * 0.9, -12.2 + (i % 2) * 0.5, rand(0, 6)); });
  [0xff4a6a, 0x3d82ff, 0xffc93c, 0x35c46f].forEach((c, i) => { place(paintPot(c, 1.2), 12 + (i % 2) * 1.2, -11.5 + i * 0.7, rand(0, 6)); place(paintPot(PAINTS[(i + 2) % 7], 1.0), -12.5 - (i % 2) * 1.3, 4 + i * 1.5, rand(0, 6)); });
  [0xff8a3a, 0xb066ff, 0x3fd8e0].forEach((c, i) => place(paintPot(c, 1.1), 12.5 + (i % 2) * 1.0, 5 + i * 1.6, rand(0, 6)));
  place(P.crate(1.6), -14.2, -5, 0.2); place(P.crate(1.3), -14.0, -3.2, -0.3); place(P.crate(1.2), -14.1, -4.1, 0.1).position.y = 1.6;
  place(P.barrel(1.4), 14.5, -4.5); place(P.barrel(1.2), 14.1, -2.7); place(P.sack(1.4), 14.6, -6.2);
  // reuzenkwast tegen de muur
  {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 7, 7), mat(0x9b6a2e), { pos: [0, 3.5, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.9, 8), mat(0xd0d0e0, { metalness: 0.7, roughness: 0.3 }), { pos: [0, 7.3, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.5, 2.0, 8), new THREE.MeshStandardMaterial({ color: 0xff4a6a, roughness: 0.5 }), { pos: [0, 8.7, 0] }));
    g.position.set(-16.5, 0, -12.5); g.rotation.z = -0.12; add(g);
  }

  // ---- regenboogketels ----
  const cauldrons = [];
  for (const [x, z, c] of [[-8.5, -14.2, 0x7affb0], [8.5, -14.2, 0xff7ad8]]) {
    const cg = new THREE.Group(); cg.position.set(x, 0, z);
    const iron = new THREE.MeshStandardMaterial({ color: 0x5a4a7a, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
    cg.add(mesh(new THREE.CylinderGeometry(2.4, 1.7, 2.4, 16, 1, true), iron, { pos: [0, 1.4, 0] }));
    cg.add(mesh(new THREE.TorusGeometry(2.4, 0.2, 6, 20), iron, { pos: [0, 2.6, 0], rot: [Math.PI / 2, 0, 0] }));
    const liquid = new THREE.Mesh(new THREE.CircleGeometry(2.25, 20), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 }));
    liquid.rotation.x = -Math.PI / 2; liquid.position.y = 2.35; cg.add(liquid);
    for (const a of [0.8, 2.4, 4.0, 5.5]) cg.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6), iron, { pos: [Math.cos(a) * 1.5, 0.25, Math.sin(a) * 1.5] }));
    add(cg); cauldrons.push({ x, z, liquid });
  }
  let bubT = 0;
  anim.push((t, dt) => {
    bubT -= dt;
    for (const c of cauldrons) { c.liquid.material.emissive.setHSL((t * 0.15 + c.x * 0.02) % 1, 0.9, 0.5); c.liquid.material.color.copy(c.liquid.material.emissive); }
    if (bubT <= 0) {
      bubT = 0.1;
      for (const c of cauldrons) {
        const col = new THREE.Color().setHSL((t * 0.25 + Math.random() * 0.4) % 1, 0.9, 0.6).getHex();
        fx.particles.emit(c.x + (Math.random() - 0.5) * 3.2, 2.6, c.z + (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 0.6, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4, { life: 1.2, size: 0.5, color: col, gravity: 0.8 });
      }
    }
  });

  // ---- zwevende toverkwasten ----
  const brushes = [];
  for (let i = 0; i < 4; i++) {
    const col = PAINTS[(i * 2) % PAINTS.length]; const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.9, 6), mat(0x9b6a2e), { cast: false, pos: [0, 0.95, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.45, 8), mat(0xd0d0e0, { metalness: 0.7 }), { cast: false, pos: [0, -0.1, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.9, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5 }), { cast: false, pos: [0, -0.75, 0], rot: [Math.PI, 0, 0] }));
    add(g); brushes.push({ g, col, ph: i * 1.7, sx: -12 + i * 8 });
  }
  let sparkT = 0;
  anim.push((t, dt) => {
    sparkT -= dt;
    for (const b of brushes) {
      const x = b.sx + Math.sin(t * 0.7 + b.ph) * 4.2, y = 9.6 + Math.sin(t * 1.1 + b.ph * 2) * 1.8, z = -13.5 + Math.cos(t * 0.5 + b.ph) * 1.2;
      b.g.position.set(x, y, z); b.g.rotation.z = Math.cos(t * 0.7 + b.ph) * 0.9 + 0.2; b.g.rotation.x = Math.sin(t * 0.9 + b.ph) * 0.25;
      if (sparkT <= 0) {
        const tx = x + Math.sin(b.g.rotation.z) * 1.1, ty = y - Math.cos(b.g.rotation.z) * 1.1;
        fx.particles.emit(tx, ty, z + 0.2, (Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.6, 0, { life: 1.4, size: 0.34, color: b.col, gravity: 0.4 });
      }
    }
    if (sparkT <= 0) sparkT = 0.07;
  });

  // lantaarns
  const lanterns = [];
  for (const [x, z] of [[-9, -6], [9, -6], [0, -11]]) {
    const g = new THREE.Group(); g.position.set(x, 13.5, z);
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 4), mat(0x555566), { cast: false, pos: [0, -2.25, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), glow(0xffd27a, 1.5), { cast: false, pos: [0, -5.0, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.55, 0.4, 4), mat(0x3a2a52), { cast: false, pos: [0, -4.35, 0], rot: [0, Math.PI / 4, 0] }));
    add(g); lanterns.push(g);
  }
  anim.push((t) => { lanterns.forEach((g, i) => { g.rotation.z = Math.sin(t * 0.8 + i * 2) * 0.05; g.rotation.x = Math.cos(t * 0.6 + i) * 0.04; }); });

  // verfspetters op de vloer rondom (decals)
  const splatMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false });
  const r = mulberry32(77);
  for (let i = 0; i < 26; i++) {
    const side = r() < 0.5 ? -1 : 1; const x = side * (11.5 + r() * 5), z = -13 + r() * 25; const c = PAINTS[Math.floor(r() * PAINTS.length)];
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.4 + r() * 1.1, 9), splatMat(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.03 + r() * 0.005, z); m.scale.set(1, 0.6 + r() * 0.6, 1); m.rotation.z = r() * 6; add(m);
  }
  for (let i = 0; i < 12; i++) {
    const x = (r() - 0.5) * 22, z = -12.4 - r() * 1.2; const c = PAINTS[Math.floor(r() * PAINTS.length)];
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.3 + r() * 0.8, 9), splatMat(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.03, z); add(m);
  }

  return { update(t, dt) { for (const f of anim) f(t, dt); } };
}

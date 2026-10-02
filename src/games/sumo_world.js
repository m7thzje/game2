import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, fbm, mulberry32, TAU } from '../engine/util.js';

// Omgeving van "IJs-Sumo": bevroren meer bij nacht met noorderlicht, sterren, maan, ijsschotsen met pinguins,
// besneeuwde dennen en eilandjes, vallende sneeuw.

export const WATER_Y = -0.05;

function waterTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(8);
    g.fillStyle = '#1b5f86'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(190,235,255,${0.07 + r() * 0.16})`; g.lineWidth = 1 + r() * 2; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 12, y - 6, x + 26, y + 6, x + 40, y); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [40, 40] });
}
function auroraTexture(hue) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(hue);
    // verticale stralen
    for (let x = 0; x < w; x += 2) {
      const a = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(x * 0.021) * 4), 2);
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, `hsla(${hue},95%,60%,${0.0})`);
      gr.addColorStop(0.18, `hsla(${hue},95%,62%,${1.0 * a})`);
      gr.addColorStop(0.6, `hsla(${hue + 40},90%,60%,${0.35 * a})`);
      gr.addColorStop(1, `hsla(${hue + 90},90%,65%,0)`);
      g.fillStyle = gr; g.fillRect(x, 0, 2.2, h);
    }
  });
}
function glowTexture() {
  return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}

function penguin() {
  const g = new THREE.Group();
  const blk = mat(0x16181f, { flatShading: false }), wht = mat(0xf4f6fa, { flatShading: false }), org = mat(0xf2a33a, { flatShading: false });
  const body = new THREE.Group(); g.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), blk, { pos: [0, 0.6, 0], scale: [1, 1.35, 0.9] }));
  body.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), wht, { pos: [0, 0.55, 0.12], scale: [1, 1.3, 0.8] }));
  const head = new THREE.Group(); head.position.set(0, 1.28, 0.02); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.27, 12, 10), blk));
  head.add(mesh(new THREE.ConeGeometry(0.08, 0.24, 5), org, { pos: [0, -0.03, 0.3], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) { head.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), wht, { cast: false, pos: [sx * 0.11, 0.07, 0.22] })); head.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), blk, { cast: false, pos: [sx * 0.11, 0.07, 0.27] })); }
  const fl = [];
  for (const sx of [-1, 1]) { const f = mesh(new THREE.SphereGeometry(0.16, 6, 5), blk, { pos: [sx * 0.42, 0.7, 0], scale: [0.35, 1.5, 0.8] }); f.rotation.z = -sx * 0.4; body.add(f); fl.push(f); body.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), org, { pos: [sx * 0.17, 0.03, 0.12] })); }
  g.userData = { body, head, fl };
  return g;
}

export function buildIceWorld(ctx, rng) {
  const { scene, fx } = ctx;
  const W = { anim: [], floes: [], penguins: [], ripples: [] };

  // ---- sterren + maan ----
  {
    const n = 700, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, e = 0.12 + rng() * 1.3; const R = 260; const y = Math.sin(e) * R, rr = Math.cos(e) * R;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * rr - 40;
      const c = 0.6 + rng() * 0.4; col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = Math.min(1, c + 0.15);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    stars.frustumCulled = false; scene.add(stars); W.stars = stars;
    const moon = new THREE.Group(); moon.position.set(-70, 62, -150); scene.add(moon);
    moon.add(new THREE.Mesh(new THREE.SphereGeometry(7, 20, 16), new THREE.MeshBasicMaterial({ color: 0xf6f3de, fog: false })));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xcfe0ff, transparent: true, opacity: 0.55, depthWrite: false, fog: false })); halo.scale.set(55, 55, 1); moon.add(halo);
    // kraters
    for (const [x, y, s] of [[-2, 2, 1.6], [2.5, -1.5, 1.1], [1, 3.4, 0.9]]) moon.add(mesh(new THREE.CircleGeometry(s, 10), new THREE.MeshBasicMaterial({ color: 0xd9d5bd, fog: false }), { cast: false, receive: false, pos: [x, y, 6.8] }));
  }

  // ---- noorderlicht ----
  W.auroras = [];
  for (const [hue, rad, th0, th1, h, y, sp] of [[135, 150, 2.2, 4.1, 70, 46, 0.012], [165, 165, 2.7, 4.6, 60, 52, -0.008], [285, 178, 1.9, 3.7, 55, 50, 0.01]]) {
    const t = auroraTexture(hue);
    const geo = new THREE.CylinderGeometry(rad, rad, h, 48, 12, true, th0, th1 - th0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(0, y, 0); m.frustumCulled = false; scene.add(m);
    const base = geo.attributes.position.array.slice();
    W.auroras.push({ m, t, base, sp, ph: rng() * 6 });
  }

  // ---- water ----
  {
    const g = new THREE.PlaneGeometry(260, 260, 56, 56); g.rotateX(-Math.PI / 2);
    const wt = waterTexture();
    const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wt, color: 0x6aa8d0, emissive: 0x0b3b44, emissiveIntensity: 0.8, roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.95 }));
    water.position.set(0, WATER_Y, 0); water.receiveShadow = true; scene.add(water);
    W.water = water; W.waterTex = wt; W.waterBase = g.attributes.position.array.slice();
  }

  // ---- ijsschotsen + pinguins ----
  {
    const iceM = new THREE.MeshStandardMaterial({ color: 0xd2ecff, roughness: 0.4, flatShading: true }), snowM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const N = 17; let penguinsLeft = 5;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + rng() * 0.3, rad = 14.5 + rng() * 22; const s = 1.4 + rng() * 2.4;
      const f = new THREE.Group(); f.position.set(Math.cos(a) * rad, WATER_Y, Math.sin(a) * rad);
      f.add(mesh(new THREE.DodecahedronGeometry(s, 0), iceM, { pos: [0, -0.15, 0], scale: [1, 0.3, 0.85], rot: [0, rng() * 3, 0] }));
      f.add(mesh(new THREE.DodecahedronGeometry(s * 0.85, 0), snowM, { pos: [0, 0.1, 0], scale: [1, 0.22, 0.8], rot: [0, rng() * 3, 0] }));
      if (rng() < 0.4) { const c = mesh(new THREE.ConeGeometry(s * 0.12, s * 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8fb8, emissiveIntensity: 0.7, roughness: 0.2, flatShading: true }), { pos: [s * 0.2, s * 0.38, 0], rot: [0, 0, -0.2] }); f.add(c); }
      scene.add(f);
      const fl = { g: f, a, rad, sp: (rng() < 0.5 ? 1 : -1) * (0.012 + rng() * 0.02), ph: rng() * 6, spin: (rng() - 0.5) * 0.1, home: new THREE.Vector3() };
      if (penguinsLeft > 0 && s > 2.2) {
        const p = penguin(); p.position.set(s * 0.1, 0.3, 0); p.scale.setScalar(0.9 + rng() * 0.3); f.add(p); p.rotation.y = rng() * TAU; penguinsLeft--;
        W.penguins.push({ g: p, floe: fl, hop: 0, ph: rng() * 6, look: 0 });
      }
      W.floes.push(fl);
    }
  }

  // ---- besneeuwde eilandjes met dennen (instanced) ----
  {
    const snowIsle = new THREE.MeshStandardMaterial({ color: 0xeef5ff, roughness: 1, flatShading: true });
    const trunks = [], cones = [[], [], []], snows = [[], [], []];
    const isles = [[-46, -34, 14], [52, -30, 16], [-62, 12, 12], [66, 18, 13], [-18, -64, 15], [30, -70, 14], [0, 74, 16], [-52, 52, 12], [54, 58, 12]];
    const iso = [];
    for (const [ix, iz, ir] of isles) {
      const isle = mesh(new THREE.CylinderGeometry(ir * 0.8, ir, 1.4, 9), snowIsle, { pos: [ix, 0.1, iz], rot: [0, rng() * 3, 0] }); scene.add(isle);
      const n = 7 + Math.floor(rng() * 6);
      for (let k = 0; k < n; k++) { const a = rng() * TAU, rr = rng() * ir * 0.65; const s = 0.8 + rng() * 0.9; iso.push({ x: ix + Math.cos(a) * rr, z: iz + Math.sin(a) * rr, s }); }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const mk = (geo, material, items) => { const im = new THREE.InstancedMesh(geo, material, items.length); items.forEach((it, i) => { p.set(it.x, it.y, it.z); sc.set(it.sx, it.sy, it.sx); m4.compose(p, q, sc); im.setMatrixAt(i, m4); }); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
    const tr = iso.map((t) => ({ x: t.x, y: 1.1 + 0.9 * t.s, z: t.z, sx: t.s, sy: t.s }));
    mk(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 6), mat(0x4a3220), tr);
    const green = new THREE.MeshStandardMaterial({ color: 0x1f6b52, roughness: 0.9, flatShading: true });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f8ff, roughness: 0.9, flatShading: true });
    for (let l = 0; l < 3; l++) {
      mk(new THREE.ConeGeometry(1.5 - l * 0.35, 1.9, 8), green, iso.map((t) => ({ x: t.x, y: 2.3 + (l * 1.25 + 0.95) * t.s, z: t.z, sx: t.s, sy: t.s })));
      mk(new THREE.ConeGeometry(1.15 - l * 0.28, 0.8, 8), white, iso.map((t) => ({ x: t.x, y: 2.65 + (l * 1.25 + 1.05) * t.s, z: t.z, sx: t.s, sy: t.s })));
    }
    // verre sneeuwbergen
    const mt = [];
    for (let i = 0; i < 14; i++) mt.push({ x: -130 + i * 20 + rng() * 8, z: -135 - rng() * 30, sx: 24 + rng() * 14, sy: 26 + rng() * 22 });
    const mgeo = new THREE.ConeGeometry(1, 1, 6);
    const im = new THREE.InstancedMesh(mgeo, new THREE.MeshStandardMaterial({ color: 0x9db4d8, flatShading: true, roughness: 1 }), mt.length);
    mt.forEach((t, i) => { p.set(t.x, t.sy * 0.5 - 3, t.z); sc.set(t.sx, t.sy, t.sx); m4.compose(p, q, sc); im.setMatrixAt(i, m4); }); im.frustumCulled = false; scene.add(im);
    const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0xf2f8ff, flatShading: true, roughness: 1 }), mt.length);
    mt.forEach((t, i) => { p.set(t.x, t.sy * 0.83 - 3, t.z); sc.set(t.sx * 0.34, t.sy, t.sx * 0.34); m4.compose(p, q, sc); cap.setMatrixAt(i, m4); }); cap.frustumCulled = false; scene.add(cap);
  }

  // ---- sneeuwval ----
  {
    const n = 700; const pos = new Float32Array(n * 3); const vel = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rng() - 0.5) * 60; pos[i * 3 + 1] = rng() * 24; pos[i * 3 + 2] = (rng() - 0.5) * 50; vel[i * 2] = 1.2 + rng() * 1.8; vel[i * 2 + 1] = (rng() - 0.5) * 0.8; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, color: 0xffffff, map: glowTexture(), transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.NormalBlending }));
    pts.frustumCulled = false; scene.add(pts); W.snow = { pts, pos, vel, n };
  }

  // ---- watergolven / rimpels bij splashes ----
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 40); ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.position.y = WATER_Y + 0.03; scene.add(m); W.ripples.push({ m, t: 9, delay: 0 }); }
  W.ripple = (x, z, big = 1, delay = 0) => { const r = W.ripples.find((q) => q.t >= 1.2) || W.ripples[0]; r.t = -delay; r.m.position.x = x; r.m.position.z = z; r.big = big; r.m.visible = delay === 0; };

  // ---- reacties ----
  W.splashReact = (x, z) => { for (const p of W.penguins) { p.hop = 1; p.look = Math.atan2(x - p.g.parent.position.x, z - p.g.parent.position.z); } };
  W.cheer = () => { for (const p of W.penguins) p.hop = 1.4; };

  W.update = (t, dt, camPos) => {
    // water
    const wp = W.water.geometry.attributes.position; const b = W.waterBase;
    for (let i = 0; i < wp.count; i++) { const x = b[i * 3], z = b[i * 3 + 2]; wp.setY(i, Math.sin(x * 0.25 + t * 0.9) * 0.07 + Math.sin(z * 0.31 + t * 1.2) * 0.06 + Math.sin((x + z) * 0.12 - t * 0.5) * 0.08); }
    wp.needsUpdate = true; W.water.geometry.computeVertexNormals();
    { const k = 0.5 + 0.5 * Math.sin(t * 0.35); W.water.material.emissive.setRGB(lerp(0.03, 0.12, 1 - k), lerp(0.2, 0.12, 1 - k), lerp(0.2, 0.24, 1 - k)); }
    W.waterTex.offset.x = (t * 0.004) % 1; W.waterTex.offset.y = (t * 0.003) % 1;
    // noorderlicht
    for (const a of W.auroras) {
      a.t.offset.x = (a.t.offset.x + a.sp * dt) % 1;
      const p = a.m.geometry.attributes.position, bs = a.base;
      for (let i = 0; i < p.count; i++) { const y = bs[i * 3 + 1]; const k = (y + 35) / 70; p.setY(i, y + Math.sin(bs[i * 3] * 0.05 + t * 0.4 + a.ph) * 5 * k); p.setX(i, bs[i * 3] + Math.sin(y * 0.08 + t * 0.3 + a.ph) * 4 * k); }
      p.needsUpdate = true;
      a.m.material.opacity = 0.55 + Math.sin(t * 0.5 + a.ph) * 0.15;
    }
    // schotsen
    for (const f of W.floes) {
      f.a += f.sp * dt; f.g.position.x = Math.cos(f.a) * f.rad; f.g.position.z = Math.sin(f.a) * f.rad; f.g.position.y = WATER_Y + Math.sin(t * 0.9 + f.ph) * 0.07; f.g.rotation.y += f.spin * dt; f.g.rotation.z = Math.sin(t * 0.7 + f.ph) * 0.02;
    }
    for (const p of W.penguins) {
      p.ph += dt; p.hop = Math.max(0, p.hop - dt * 1.5);
      const hop = Math.abs(Math.sin(p.hop * 9)) * Math.min(1, p.hop) * 0.7;
      p.g.position.y = 0.3 + hop; const u = p.g.userData; u.head.rotation.y = Math.sin(p.ph * 0.8) * 0.5 + (p.hop > 0 ? 0 : 0); u.body.rotation.z = Math.sin(p.ph * 2) * 0.05;
      u.fl.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (0.4 + (p.hop > 0 ? Math.sin(p.ph * 30) * 0.6 : Math.sin(p.ph * 3) * 0.05)); });
      if (p.hop > 0) p.g.rotation.y = p.look;
    }
    // sneeuw
    const S = W.snow; const cx = camPos ? camPos.x : 0, cz = camPos ? camPos.z - 12 : 0;
    for (let i = 0; i < S.n; i++) {
      let x = S.pos[i * 3], y = S.pos[i * 3 + 1], z = S.pos[i * 3 + 2];
      y -= S.vel[i * 2] * dt; x += (S.vel[i * 2 + 1] + Math.sin(t * 0.7 + i) * 0.3) * dt;
      if (y < -0.5) { y = 24; x = cx + (Math.random() - 0.5) * 60; z = cz + (Math.random() - 0.5) * 50; }
      S.pos[i * 3] = x; S.pos[i * 3 + 1] = y; S.pos[i * 3 + 2] = z;
    }
    S.pts.geometry.attributes.position.needsUpdate = true;
    // rimpels
    for (const r of W.ripples) {
      if (r.t >= 1.2) { r.m.visible = false; continue; }
      r.t += dt; if (r.t < 0) continue; r.m.visible = true;
      const k = r.t / 1.2; const s = (1 + k * 7) * (r.big || 1); r.m.scale.set(s, 1, s); r.m.material.opacity = (1 - k) * 0.75;
    }
  };
  return W;
}

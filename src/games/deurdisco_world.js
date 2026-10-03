import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, lerp, damp } from '../engine/util.js';
import { skyTexture } from '../engine/lights.js';

// Podium van de Deurman-Disco: ledvloer, disco-bal met lichtbundels, een groot neon-deurkozijn, luidsprekers,
// een publiek van dansende deurtjes (met ogen) en zwevende ballonnen. Alles instanced.
export const NEON = [0xff4fa8, 0x4fd8ff, 0xffe14a, 0x8dff6a, 0xb06bff, 0xff8a3a];
export const GLYPHS = [
  { name: 'links', col: '#ff4fa8' }, { name: 'omhoog', col: '#4fc84f' }, { name: 'omlaag', col: '#29b8e8' },
  { name: 'rechts', col: '#ff9a2a' }, { name: 'A', col: '#e8453c' }, { name: 'B', col: '#4a6cf0' }, { name: '?', col: '#9a6cf0' },
];
const gcache = {};
export function glyphTex(id) {
  if (gcache[id]) return gcache[id];
  const t = canvasTex(128, 128, (g) => {
    g.translate(64, 64); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 59, 0, TAU); g.fill(); g.lineWidth = 9; g.strokeStyle = GLYPHS[id].col; g.stroke();
    g.fillStyle = GLYPHS[id].col; g.strokeStyle = '#1a0830'; g.lineWidth = 4; g.lineJoin = 'round';
    if (id < 4) {
      g.rotate([-Math.PI / 2, 0, Math.PI, Math.PI / 2][id]);
      g.beginPath(); g.moveTo(0, -36); g.lineTo(32, 0); g.lineTo(12, 0); g.lineTo(12, 34); g.lineTo(-12, 34); g.lineTo(-12, 0); g.lineTo(-32, 0); g.closePath(); g.fill(); g.stroke();
    } else {
      g.font = 'bold 80px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const ch = ['A', 'B', '?'][id - 4]; g.strokeText(ch, 0, 6); g.fillText(ch, 0, 6);
    }
  });
  t.userData.keep = true; return (gcache[id] = t);
}
export function labelTex(txt, col, w = 512, h = 96, size = 60) {
  return canvasTex(w, h, (g, W, H) => { g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(20,6,40,.95)'; g.strokeText(txt, W / 2, H / 2 + 3, W - 16); g.fillStyle = col; g.fillText(txt, W / 2, H / 2 + 3, W - 16); });
}
const glowCache = {};
export function glowTex() { return glowCache.g || (glowCache.g = (() => { const t = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); t.userData.keep = true; return t; })()); }
function signTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 128px Fredoka, Arial Black, sans-serif';
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#4fd8ff'); gr.addColorStop(0.5, '#ffe14a'); gr.addColorStop(1, '#ff4fa8');
    g.shadowColor = '#4fd8ff'; g.shadowBlur = 36; g.lineWidth = 14; g.strokeStyle = 'rgba(40,0,60,.95)'; g.strokeText('DEURMAN-DISCO', w / 2, h / 2 + 6, w - 30);
    g.fillStyle = gr; g.fillText('DEURMAN-DISCO', w / 2, h / 2 + 6, w - 30); g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText('DEURMAN-DISCO', w / 2, h / 2 + 6, w - 30);
  });
}

export function buildStage(ctx) {
  const { scene } = ctx;
  const rng = mulberry32(2024);
  const S = { t: 0, beatIdx: -1, kick: 0, crowdHype: 0 };
  scene.background = skyTexture('#0a0420', '#2c1050');
  scene.fog = new THREE.Fog(0x1c0a34, 34, 80);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), c4 = new THREE.Color();
  const put = (im, i, x, y, z, rx, rz, sx = 1, sy = 1, sz = 1) => { q.setFromEuler(e.set(rx, 0, rz)); m4.compose(v3.set(x, y, z), q, s3.set(sx, sy, sz)); im.setMatrixAt(i, m4); };

  // ---- vloer + podium ----
  scene.add(mesh(new THREE.PlaneGeometry(120, 80), new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.35, metalness: 0.5 }), { cast: false, pos: [0, 0, -10], rot: [-Math.PI / 2, 0, 0] }));
  scene.add(mesh(new THREE.BoxGeometry(27, 0.4, 11), mat(0x2a1a44, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, 0.2, -0.5] }));
  const TX = 16, TZ = 6, tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.55, 1.55), new THREE.MeshBasicMaterial({ color: 0xffffff }), TX * TZ);
  for (let j = 0; j < TZ; j++) for (let i = 0; i < TX; i++) { put(tiles, j * TX + i, -12.4 + i * 1.65, 0.42, -4.6 + j * 1.65, -Math.PI / 2, 0); tiles.setColorAt(j * TX + i, c4.setHex(0x331a55)); }
  tiles.frustumCulled = false; scene.add(tiles); S.tiles = tiles;
  // Deurman-podium (midden) + twee dansplatforms
  const pod = new THREE.Group(); pod.position.set(0, 0.4, -2.4); scene.add(pod);
  pod.add(mesh(new THREE.CylinderGeometry(2.6, 2.9, 1.0, 24), mat(0x3a2468, { metalness: 0.5, roughness: 0.4 }), { pos: [0, 0.5, 0] }));
  const podRing = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.09, 6, 36), new THREE.MeshBasicMaterial({ color: 0xffe14a })); podRing.rotation.x = Math.PI / 2; podRing.position.y = 1.02; pod.add(podRing); S.podRing = podRing;
  S.podTop = 1.4;
  const spot = new THREE.Mesh(new THREE.ConeGeometry(3.4, 16, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); spot.geometry.translate(0, -8, 0); spot.position.set(0, 17, -2.4); scene.add(spot); S.spot = spot;
  S.spots = [];
  for (const [sx, col] of [[-7.2, 0x35c46f], [7.2, 0x4a8cff]]) {
    const pl = new THREE.Group(); pl.position.set(sx, 0.4, 2.0); scene.add(pl);
    pl.add(mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.3, 24), mat(0x2a1a44, { metalness: 0.5, roughness: 0.4 }), { pos: [0, 0.15, 0] }));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.33; pl.add(pool);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.07, 6, 32), new THREE.MeshBasicMaterial({ color: col })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; pl.add(ring);
    S.spots.push({ pool, ring });
  }

  // ---- achterwand: neon-deurkozijn + bord ----
  scene.add(mesh(new THREE.PlaneGeometry(90, 44), new THREE.MeshStandardMaterial({ color: 0x180a2c, roughness: 0.9 }), { cast: false, pos: [0, 14, -15.5] }));
  const fr = new THREE.MeshBasicMaterial({ color: 0xffffff }); S.frameCols = [];
  const frame = [[0, 9.4, -15.2, 17, 0.7], [-8.2, 4.7, -15.2, 0.7, 10], [8.2, 4.7, -15.2, 0.7, 10]];
  S.frame = frame.map(([x, y, z, w, h]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), fr.clone()); m.position.set(x, y, z); scene.add(m); return m; });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 9.2), new THREE.MeshBasicMaterial({ map: canvasTex(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6a2aa8'); gr.addColorStop(1, '#ff4fa8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) })); inner.position.set(0, 4.6, -15.25); scene.add(inner); S.inner = inner;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 2.9), new THREE.MeshBasicMaterial({ map: signTex(), transparent: true, toneMapped: false, depthWrite: false })); sign.position.set(0, 17.4, -14.6); scene.add(sign); S.sign = sign;
  // equalizer in het kozijn
  const EQN = 22, eq = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), EQN);
  for (let i = 0; i < EQN; i++) eq.setColorAt(i, c4.setHSL(i / EQN * 0.9, 1, 0.55));
  eq.frustumCulled = false; scene.add(eq); S.eq = eq; S.eqN = EQN;
  // luidsprekers
  S.woofers = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 12.8, 0, -4); scene.add(g);
    g.add(mesh(new THREE.BoxGeometry(2.4, 4.6, 1.8), mat(0x15101e, { roughness: 0.6 }), { pos: [0, 2.3, 0] }));
    for (const [y, r] of [[1.4, 0.75], [3.4, 0.5]]) { const w = mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.25, 14), mat(0x3a3a48, { metalness: 0.5, roughness: 0.4 }), { cast: false, pos: [-sx * 0.0, y, 0.95], rot: [Math.PI / 2, 0, 0] }); g.add(w); S.woofers.push(w); }
  }
  // disco-bal + bundels
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 1, roughness: 0.18, flatShading: true, emissive: 0x303050, emissiveIntensity: 0.6 }));
  ball.position.set(0, 13.2, -5); scene.add(ball); S.ball = ball;
  scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 4), mat(0x888899), { cast: false, pos: [0, 17.5, -5] }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); halo.scale.set(7, 7, 1); halo.position.copy(ball.position); scene.add(halo); S.halo = halo;
  const coneGeo = new THREE.ConeGeometry(1.7, 17, 16, 1, true); coneGeo.translate(0, -8.5, 0);
  S.beams = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.position.set(-10.5 + i * 3.5, 17, -4 - (i % 2) * 2); scene.add(g);
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: NEON[i % NEON.length], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); g.add(m);
    S.beams.push({ g, m, ph: rng() * 6, sp: 0.5 + rng() * 0.7 });
  }
  const l1 = new THREE.PointLight(0xff4fa8, 1.5, 28, 1.4); l1.position.set(-7, 7, 5); scene.add(l1);
  const l2 = new THREE.PointLight(0x4fd8ff, 1.5, 28, 1.4); l2.position.set(7, 7, 5); scene.add(l2); S.lights = [l1, l2];

  // ---- publiek: dansende deurtjes met ogen (instanced) ----
  const rows = [[-6.4, 0.4, 13], [-8.1, 1.2, 14], [-9.8, 2.0, 15]], people = [];
  rows.forEach(([z, y, n], ri) => { for (let k = 0; k < n; k++) people.push({ x: -14.2 + (k + (ri % 2) * 0.5) * (28.4 / (n - 1)) + (rng() - 0.5) * 0.5, y, z, ph: rng() * 6, sc: 0.9 + rng() * 0.3, col: NEON[Math.floor(rng() * NEON.length)] }); });
  for (const [z, y, w] of [[-7.2, 0.3, 32], [-8.9, 1.0, 32], [-10.6, 1.7, 32]]) scene.add(mesh(new THREE.BoxGeometry(w, y + 0.2, 1.5), mat(0x20143a), { cast: false, pos: [0, (y - 0.2) / 2, z - 0.1] }));
  const NP = people.length; S.people = people;
  const mk = (geo, mt, n = NP) => { const m = new THREE.InstancedMesh(geo, mt, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); return m; };
  const bodies = mk(new THREE.BoxGeometry(1.0, 1.9, 0.16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
  const knobs = mk(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  const eyes = mk(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NP * 2);
  const pupils = mk(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111118 }), NP * 2);
  const mouths = mk(new THREE.BoxGeometry(0.4, 0.07, 0.04), new THREE.MeshBasicMaterial({ color: 0x3a0f1a }));
  people.forEach((p, i) => bodies.setColorAt(i, c4.setHex(p.col)));
  // ballonnen
  const NB = 30, balloons = mk(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), NB), strings = mk(new THREE.BoxGeometry(0.025, 2.4, 0.025), new THREE.MeshBasicMaterial({ color: 0xcccccc }), NB);
  const bl = []; for (let i = 0; i < NB; i++) { bl.push({ x: -15 + rng() * 30, y: 5 + rng() * 4.5, z: -8 - rng() * 3, ph: rng() * 6 }); balloons.setColorAt(i, c4.setHex(NEON[i % NEON.length])); }

  // ---- per frame ----
  S.update = (dt, t, beatPhase, beatIdx, energy) => {
    S.t = t; S.kick = Math.max(0, S.kick - dt * 5);
    if (beatIdx !== S.beatIdx) { S.beatIdx = beatIdx; S.kick = 1; }
    const k = S.kick;
    S.ball.rotation.y += dt * 0.9; S.halo.material.opacity = 0.35 + k * 0.4;
    S.beams.forEach((b, i) => { b.g.rotation.z = Math.sin(t * b.sp + b.ph) * 0.55; b.g.rotation.x = Math.cos(t * b.sp * 0.7 + b.ph) * 0.25; b.m.material.opacity = 0.06 + 0.07 * energy + k * 0.04; if (beatIdx % 8 === 0 && S._lc !== beatIdx) b.m.material.color.setHex(NEON[(i + (beatIdx >> 3)) % NEON.length]); });
    S._lc = beatIdx;
    S.lights[0].intensity = 1.2 + k * 0.9; S.lights[1].intensity = 1.2 + (1 - k) * 0.5;
    S.woofers.forEach((w, i) => { const s = 1 + k * (i % 2 ? 0.1 : 0.2); w.scale.set(s, 1, s); });
    // tegels: schaakbord dat op de maat wisselt
    for (let j = 0; j < TZ; j++) for (let i = 0; i < TX; i++) { const on = ((i + j + beatIdx) & 1) === 0, hue = ((i * 0.06 + j * 0.1 + beatIdx * 0.07) % 1); tiles.setColorAt(j * TX + i, c4.setHSL(hue, 0.9, on ? 0.38 + k * 0.12 : 0.12)); }
    tiles.instanceColor.needsUpdate = true;
    // kozijn kleurt mee
    S.frame.forEach((f, i) => f.material.color.setHex(NEON[(i + beatIdx) % NEON.length]));
    S.podRing.material.color.setHex(NEON[(beatIdx + 2) % NEON.length]);
    S.inner.material.color.setRGB(0.75 + k * 0.25, 0.75 + k * 0.25, 0.75 + k * 0.25);
    for (let i = 0; i < S.eqN; i++) { const h = 0.4 + (0.5 + 0.5 * Math.sin(t * 5.3 + i * 0.8) * Math.cos(t * 1.7 + i * 0.37)) * (1.2 + 3 * energy) + k * 0.9 * (1 - i / S.eqN); put(S.eq, i, -5.3 + i * (10.6 / (S.eqN - 1)), 0.5 + h / 2, -15.0, 0, 0, 1, h, 1); }
    S.eq.instanceMatrix.needsUpdate = true;
    S.sign.material.opacity = 0.85 + 0.15 * Math.sin(t * 9) * (k > 0.5 ? 1 : 0.4);
    // publiek
    const hype = S.crowdHype = damp(S.crowdHype, energy, 2, dt);
    people.forEach((p, i) => {
      const hop = Math.abs(Math.sin(t * Math.PI / 0.5 * 0.5 + p.ph)) * (0.1 + 0.35 * hype), tilt = Math.sin(t * 3 + p.ph) * 0.14 * (0.3 + hype);
      const c = Math.cos(tilt), s = Math.sin(tilt), y0 = p.y + hop;
      put(bodies, i, p.x - s * 0.95 * p.sc, y0 + c * 0.95 * p.sc, p.z, 0, tilt, p.sc, p.sc, p.sc);
      put(knobs, i, p.x + (0.36 * c - 0.2 * s) * p.sc, y0 + (0.36 * s + 0.95 * c - 0.1) * p.sc - 0.05, p.z + 0.12, 0, 0, p.sc, p.sc, p.sc);
      for (const sd of [-1, 1]) {
        const ex = p.x + (sd * 0.2 * c - 0.0 * s - s * 0.95 + 0.0) * p.sc, ey = y0 + (sd * 0.2 * s + c * 0.95 + 0.55 * c) * p.sc;
        put(eyes, i * 2 + (sd > 0 ? 1 : 0), ex, ey, p.z + 0.11, 0, 0, p.sc, p.sc * 1.1, p.sc * 0.5);
        put(pupils, i * 2 + (sd > 0 ? 1 : 0), ex + Math.sin(t * 2 + p.ph) * 0.03, ey - 0.02, p.z + 0.18, 0, 0, p.sc, p.sc, p.sc);
      }
      put(mouths, i, p.x - s * 0.95 * p.sc - 0.1 * s * p.sc, y0 + (c * 0.95 + 0.1) * p.sc - 0.1, p.z + 0.1, 0, tilt, p.sc * (1 + hype * 0.4), p.sc * (1 + hype * 3), p.sc);
    });
    bl.forEach((b, i) => { const y = b.y + Math.sin(t * 0.9 + b.ph) * 0.35 + hype * 0.3 * Math.sin(t * 3 + b.ph); put(balloons, i, b.x + Math.sin(t * 0.5 + b.ph) * 0.3, y, b.z, 0, 0, 1, 1.18, 1); put(strings, i, b.x + Math.sin(t * 0.5 + b.ph) * 0.3, y - 1.75, b.z, 0, 0); });
    for (const im of [bodies, knobs, eyes, pupils, mouths, balloons, strings]) im.instanceMatrix.needsUpdate = true;
  };
  return S;
}

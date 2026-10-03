import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, lerp, damp } from '../engine/util.js';
import { skyTexture } from '../engine/lights.js';

// Omgeving van het "Dansduel": een discotheek in de kelder van het kasteel. Ledvloer, discobal met lichtbundels,
// equalizer-muur met neonbord, luidsprekers, een dansend publiek (instanced) en lampjes langs het podium.

const NEON = [0xff4fa8, 0x4fd8ff, 0xffe14a, 0x8dff6a, 0xb06bff, 0xff8a3a];

function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function tilesTex() {
  const r = mulberry32(21);
  const cols = ['#ff4fa8', '#4fd8ff', '#ffe14a', '#8dff6a', '#b06bff', '#ff8a3a'];
  const t = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#14081e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
      const c = cols[Math.floor(r() * cols.length)];
      g.fillStyle = c; g.globalAlpha = 0.9; g.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
      g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillRect(x * 64 + 4, y * 64 + 4, 56, 10);
    }
    g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.keep = true; return t;
}
function signTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 160px Fredoka, Arial Black, sans-serif';
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff4fa8'); gr.addColorStop(0.5, '#ffe14a'); gr.addColorStop(1, '#4fd8ff');
    g.shadowColor = '#ff4fa8'; g.shadowBlur = 40; g.lineWidth = 14; g.strokeStyle = 'rgba(40,0,60,.95)'; g.strokeText('DANSDUEL', w / 2, h / 2 + 6);
    g.fillStyle = gr; g.fillText('DANSDUEL', w / 2, h / 2 + 6); g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText('DANSDUEL', w / 2, h / 2 + 6);
  });
}

export function buildStage(ctx) {
  const { scene, fx } = ctx;
  const rng = mulberry32(777);
  const S = { t: 0, beatIdx: -1, kick: 0, crowdHype: 0 };
  scene.background = skyTexture('#0a0420', '#2a0f46');
  scene.fog = new THREE.Fog(0x1a0a30, 28, 70);

  // vloer: donker, glimmend; LED-podium eronder
  scene.add(mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.35, metalness: 0.5 }), { cast: false, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0] }));
  const tt = tilesTex(); tt.repeat.set(1, 1); S.tiles = tt;
  const tileM = new THREE.MeshBasicMaterial({ map: tt, color: 0xcccccc });
  scene.add(mesh(new THREE.BoxGeometry(24.6, 0.35, 8.4), mat(0x2a1a44, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, 0.1, 0.2] }));
  const stage = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), tileM); stage.rotation.x = -Math.PI / 2; stage.position.set(0, 0.29, 0.2); scene.add(stage);
  // lampjes langs de rand van het podium
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 30);
  const m4 = new THREE.Matrix4(); const c4 = new THREE.Color();
  for (let i = 0; i < 30; i++) { m4.makeTranslation(-11.6 + i * (23.2 / 29), 0.38, 4.5); bulbs.setMatrixAt(i, m4); bulbs.setColorAt(i, c4.setHex(NEON[i % NEON.length])); }
  scene.add(bulbs); S.bulbs = bulbs;

  // achterwand + equalizer + neonbord
  scene.add(mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: 0x180a2c, roughness: 0.9 }), { cast: false, pos: [0, 12, -9.5] }));
  const EQN = 36, eq = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }), EQN);
  for (let i = 0; i < EQN; i++) eq.setColorAt(i, c4.setHSL(i / EQN * 0.85, 1, 0.5));
  eq.frustumCulled = false; scene.add(eq); S.eq = eq; S.eqN = EQN;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: signTex(), transparent: true, toneMapped: false, depthWrite: false })); sign.position.set(0, 9.6, -8.6); scene.add(sign); S.sign = sign;
  // gordijnen links en rechts
  const curT = canvasTex(256, 256, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#7a1030' : '#5a0c24'; g.fillRect(i * 16, 0, 16, h); } const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 18, 0.8), new THREE.MeshStandardMaterial({ map: curT, roughness: 1 })); c.position.set(sx * 12.8, 9, -5.5); scene.add(c); }
  scene.add(mesh(new THREE.BoxGeometry(30, 1.1, 0.8), new THREE.MeshStandardMaterial({ map: curT, roughness: 1 }), { cast: false, pos: [0, 17.8, -5.5] }));
  // luidsprekers
  S.woofers = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 10.8, 0, -3.4); scene.add(g);
    g.add(mesh(new THREE.BoxGeometry(2.8, 5, 2), mat(0x15101e, { roughness: 0.6 }), { pos: [0, 2.7, 0] }));
    for (const [y, r] of [[1.6, 0.8], [3.7, 0.55]]) { const w = mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.25, 16), mat(0x3a3a48, { metalness: 0.5, roughness: 0.4 }), { cast: false, pos: [0, y, 1.0], rot: [Math.PI / 2, 0, 0] }); g.add(w); S.woofers.push(w); g.add(mesh(new THREE.TorusGeometry(r * 1.05, 0.07, 6, 18), mat(0xb0b0c0, { metalness: 0.7 }), { cast: false, pos: [0, y, 1.04] })); }
  }
  // discobal + lichtbundels
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 1, roughness: 0.18, flatShading: true, emissive: 0x303050, emissiveIntensity: 0.6 }));
  ball.position.set(0, 10.8, -1.5); scene.add(ball); S.ball = ball;
  scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 4), mat(0x888899), { cast: false, pos: [0, 15, -1.5] }));
  const gt = glowTex(); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); halo.scale.set(6, 6, 1); halo.position.copy(ball.position); scene.add(halo); S.halo = halo;
  const coneGeo = new THREE.ConeGeometry(1.9, 15, 18, 1, true); coneGeo.translate(0, -7.5, 0);
  S.beams = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.position.set(-10.5 + i * 3.5, 15, -2.5 - (i % 2) * 2); scene.add(g);
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: NEON[i % NEON.length], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); g.add(m);
    S.beams.push({ g, m, ph: rng() * 6, sp: 0.5 + rng() * 0.7 });
  }
  // lichtjes (2 stuks, zacht) op het podium
  const l1 = new THREE.PointLight(0xff4fa8, 1.6, 26, 1.4); l1.position.set(-6, 6, 4); scene.add(l1);
  const l2 = new THREE.PointLight(0x4fd8ff, 1.6, 26, 1.4); l2.position.set(6, 6, 4); scene.add(l2); S.lights = [l1, l2];

  // publiek: 3 rijen op trappen achter het podium (instanced: lijf, hoofd, 2 armen)
  const rows = [[-3.2, 0.5, 13], [-4.6, 1.2, 14], [-6.0, 1.9, 15]];
  const people = [];
  rows.forEach(([z, y, n], ri) => { for (let k = 0; k < n; k++) people.push({ x: -11.5 + (k + (ri % 2) * 0.5) * (23 / (n - 1)) + (rng() - 0.5) * 0.5, y, z, ph: rng() * 6, sc: 0.95 + rng() * 0.35, hue: rng() }); });
  const NP = people.length; S.people = people;
  for (const [z, y, w] of [[-3.9, 0.3, 26], [-5.3, 0.9, 26], [-6.7, 1.5, 26]]) scene.add(mesh(new THREE.BoxGeometry(w, y + 0.2, 1.4), mat(0x20143a), { cast: false, pos: [0, (y - 0.2) / 2, z - 0.1] }));
  const mk = (geo, mt) => { const m = new THREE.InstancedMesh(geo, mt, NP); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); return m; };
  const bodies = mk(new THREE.CapsuleGeometry(0.3, 0.55, 3, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  const heads = mk(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  const armsG = new THREE.CapsuleGeometry(0.09, 0.5, 2, 5); armsG.translate(0, 0.32, 0);
  const armL = mk(armsG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })), armR = mk(armsG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  const skin = [0xf4c9a0, 0xe0a878, 0x9a6a48, 0xf7d2ae, 0x6b4a34];
  people.forEach((p, i) => { const c = new THREE.Color().setHSL(p.hue, 0.6, 0.45); bodies.setColorAt(i, c); heads.setColorAt(i, c4.setHex(skin[i % skin.length])); armL.setColorAt(i, c4.setHex(skin[i % skin.length])); armR.setColorAt(i, c4.setHex(skin[i % skin.length])); });
  S.crowd = { bodies, heads, armL, armR };
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  function put(im, i, x, y, z, rx, rz, s) { _q.setFromEuler(_e.set(rx, 0, rz)); _p.set(x, y, z); _s.setScalar(s); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); }

  // ---------- per frame ----------
  S.update = (dt, t, beatPhase, beatIdx, energy) => {
    S.t = t;
    S.kick = Math.max(0, S.kick - dt * 5);
    if (beatIdx !== S.beatIdx) { S.beatIdx = beatIdx; S.kick = 1; tt.offset.x = (tt.offset.x + 0.125) % 1; if (beatIdx % 4 === 0) tt.offset.y = (tt.offset.y + 0.25) % 1; }
    const k = S.kick;
    S.ball.rotation.y += dt * 0.9; S.halo.material.opacity = 0.35 + k * 0.4;
    S.beams.forEach((b, i) => { b.g.rotation.z = Math.sin(t * b.sp + b.ph) * 0.55; b.g.rotation.x = Math.cos(t * b.sp * 0.7 + b.ph) * 0.25; b.m.material.opacity = 0.07 + 0.07 * energy + k * 0.04; if (beatIdx % 8 === 0 && S.beatIdx !== S._lastCol) b.m.material.color.setHex(NEON[(i + (beatIdx >> 3)) % NEON.length]); });
    S._lastCol = S.beatIdx;
    S.lights[0].intensity = 1.3 + k * 0.9; S.lights[1].intensity = 1.3 + (1 - k) * 0.5;
    S.woofers.forEach((w, i) => { const s = 1 + k * (i % 2 ? 0.1 : 0.2); w.scale.set(s, 1, s); });
    // equalizer
    for (let i = 0; i < S.eqN; i++) { const h = 0.5 + (0.5 + 0.5 * Math.sin(t * 5.3 + i * 0.8) * Math.cos(t * 1.7 + i * 0.37)) * (1.5 + 4.5 * energy) + k * 1.2 * (1 - i / S.eqN); _s.set(1, h, 1); _m.compose(_p.set(-12.4 + i * (24.8 / (S.eqN - 1)), 1.0 + h / 2, -9.2), _q.identity(), _s); S.eq.setMatrixAt(i, _m); }
    S.eq.instanceMatrix.needsUpdate = true;
    S.sign.material.opacity = 0.85 + 0.15 * Math.sin(t * 9) * (k > 0.5 ? 1 : 0.4);
    // lampjes
    for (let i = 0; i < 30; i++) S.bulbs.setColorAt(i, c4.setHex(NEON[(i + beatIdx) % NEON.length]).multiplyScalar(((i + beatIdx) % 3 === 0) ? 1 : 0.35));
    S.bulbs.instanceColor.needsUpdate = true;
    // publiek
    const hype = S.crowdHype = damp(S.crowdHype, energy, 2, dt);
    people.forEach((p, i) => {
      const bob = Math.abs(Math.sin(t * Math.PI * 2 / 0.5 * 0.5 + p.ph)) * (0.12 + 0.25 * hype);
      const y = p.y + bob, s = p.sc;
      put(bodies, i, p.x, y + 0.7 * s, p.z, 0, Math.sin(t * 3 + p.ph) * 0.06 * hype, s);
      put(heads, i, p.x, y + 1.45 * s, p.z, 0, 0, s);
      const ang = lerp(Math.PI - 0.25, 0.5 + Math.sin(t * Math.PI * 2 + p.ph) * 0.35, Math.min(1, hype * 1.3));   // armen hangen of gaan omhoog en golven
      put(armL, i, p.x + 0.36 * s, y + 1.05 * s, p.z, 0, -ang, s);
      put(armR, i, p.x - 0.36 * s, y + 1.05 * s, p.z, 0, ang, s);
    });
    for (const im of [bodies, heads, armL, armR]) im.instanceMatrix.needsUpdate = true;
  };
  return S;
}

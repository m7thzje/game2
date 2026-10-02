import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, mulberry32, TAU, rand, clamp, lerp, damp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { bake } from './goblins_world.js';

// Het marktplein-podium van "Straatmuzikant": podium, lampionnen, fontein, poster, spots, groeiend publiek, gitaarkist met muntjes.
export function buildStage(ctx, L) {
  const { scene, fx } = ctx;
  const rng = mulberry32(77);
  const R = (a, b) => a + rng() * (b - a);
  const S = new THREE.Group();   // statisch -> samengevoegd

  // ---------- plein + podium ----------
  scene.add(mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ map: tex.cobble(70, 54), color: 0xb8a8c8, roughness: 1 }), { cast: false, pos: [0, -0.02, -40], rot: [-Math.PI / 2, 0, 0] }));
  const stageM = new THREE.MeshStandardMaterial({ map: tex.planks(9, 12, '#a9774a'), roughness: 0.85, color: 0xe0d0c8 });
  const stage = mesh(new THREE.BoxGeometry(34, 0.5, 46), stageM, { pos: [0, -0.26, -16], cast: false });
  scene.add(stage);
  // randlijst + trapje
  for (const sx of [-1, 1]) S.add(mesh(new THREE.BoxGeometry(0.4, 0.7, 46.4), mat(0x5b3d24), { pos: [sx * 17.1, -0.2, -16] }));
  S.add(mesh(new THREE.BoxGeometry(34.8, 0.7, 0.4), mat(0x5b3d24), { pos: [0, -0.2, 7.1] }));
  for (let i = 0; i < 3; i++) S.add(mesh(new THREE.BoxGeometry(5, 0.22, 0.9), mat(0x7a5530), { pos: [0, -0.4 + i * 0.0 - i * 0.1, 7.9 + i * 0.9] }));

  // ---------- achterwand: huizen, poster ----------
  const wallHouses = [[-27, -40], [-15, -44], [15, -44], [27, -40], [-34, -22], [34, -22], [-33, -4], [33, -4]];
  wallHouses.forEach(([x, z], i) => {
    const h = P.houseSimple(9 + (i % 3) * 2, 7, 5 + (i % 2) * 1.5, { wall: ['#f2e2c0', '#e8d0b8', '#d8e0c8', '#f0d8d8'][i % 4], roof: ['#b5483a', '#5a6aa8', '#8a5a3a', '#4a8a6a'][i % 4] });
    h.position.set(x, 0, z); h.rotation.y = Math.atan2(-x, 30 - z) * 0.5 + (x < 0 ? -0.1 : 0.1) * 0; S.add(h);
  });
  // billboard met de poster van DutchTuber
  const PW = 7.4, PH = PW * 1.5, PY = 6.9, PZ = -37;
  for (const sx of [-1, 1]) S.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, PY + PH / 2, 6), mat(0x5b3d24), { pos: [sx * (PW / 2 + 0.4), (PY + PH / 2) / 2 - 0.5, PZ - 0.3] }));
  S.add(mesh(new THREE.BoxGeometry(PW + 1.0, PH + 1.0, 0.4), mat(0x3a2a1c), { pos: [0, PY, PZ - 0.35] }));
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex.poster('DutchTuber'), fog: false, color: 0xe8e8f0 }));
  poster.position.set(0, PY, PZ); scene.add(poster);
  // lamp boven de poster
  for (const sx of [-1, 1]) S.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 0.6), glow(0xfff0c0, 1.6), { cast: false, pos: [sx * 3, PY + PH / 2 + 0.9, PZ + 0.6] }));

  // ---------- kraampjes ----------
  const stripe = canvasTex(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f6f0e0' : '#d8372c'; g.fillRect(i * 8, 0, 8, 64); } });
  stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping; stripe.repeat.set(2, 1); stripe.userData.keep = true;
  const awnM = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9, side: THREE.DoubleSide });
  for (const [x, z, ry] of [[-22, -18, 0.5], [23, -14, -0.5], [-24, -30, 0.3]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
    g.add(mesh(new THREE.BoxGeometry(4, 1.1, 1.6), mat(0x8a6238), { pos: [0, 0.55, 0] }));
    for (const sx of [-1.8, 1.8]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5), mat(0x5b3d24), { pos: [sx, 1.6, 0.6] }));
    g.add(mesh(new THREE.PlaneGeometry(4.3, 1.8), awnM, { pos: [0, 3.1, 0.15], rot: [-0.75, 0, 0] }));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.SphereGeometry(0.3, 6, 5), mat([0xd8372c, 0xf2c230, 0x7ac84a, 0xe8a33d][i]), { cast: false, pos: [-1.3 + i * 0.85, 1.35, 0.1] }));
  }

  // ---------- fontein ----------
  const fnt = new THREE.Group(); fnt.position.set(-19.5, 0, -11); S.add(fnt);
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(2, 1), roughness: 0.95, flatShading: true });
  fnt.add(mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.9, 16), stoneM, { pos: [0, 0.45, 0] }));
  fnt.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.0, 8), stoneM, { pos: [0, 1.4, 0] }));
  fnt.add(mesh(new THREE.CylinderGeometry(1.4, 0.8, 0.35, 12), stoneM, { pos: [0, 2.2, 0] }));
  fnt.add(mesh(new THREE.SphereGeometry(0.35, 8, 6), stoneM, { pos: [0, 2.6, 0] }));
  const wat = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20), new THREE.MeshStandardMaterial({ color: 0x4aa8f0, emissive: 0x1a5a9a, emissiveIntensity: 0.6, roughness: 0.15 }));
  wat.rotation.x = -Math.PI / 2; wat.position.set(-19.5, 0.88, -11); scene.add(wat);

  // ---------- lampionnen ----------
  const lampPos = [];
  for (const z of [-4, -14, -24, -33]) {
    for (const sx of [-1, 1]) S.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 8.5, 6), mat(0x3a2a1c), { pos: [sx * 16, 4.2, z] }));
    const n = 17;
    for (let i = 0; i < n; i++) { const k = i / (n - 1); const x = lerp(-16, 16, k); const y = 8.3 - Math.sin(k * Math.PI) * 2.0; lampPos.push({ x, y, z, ph: rng() * 6 }); }
  }
  const lampCols = [0xff5a7a, 0xffd24a, 0x4ac8ff, 0x7aff8a, 0xff9a3a, 0xc07aff];
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampPos.length);
  lamps.frustumCulled = false;
  const cc = new THREE.Color();
  lampPos.forEach((l, i) => { cc.setHex(lampCols[i % lampCols.length]); lamps.setColorAt(i, cc); });
  scene.add(lamps);
  const lampDummy = new THREE.Object3D();
  // snoeren
  for (let r = 0; r < 4; r++) { const z = [-4, -14, -24, -33][r]; const pts = []; for (let i = 0; i <= 24; i++) { const k = i / 24; pts.push(new THREE.Vector3(lerp(-16, 16, k), 8.3 - Math.sin(k * Math.PI) * 2.0 + 0.3, z)); } scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 }))); }

  // ---------- spots (lichtbundels) ----------
  const beams = [];
  const beamCols = [0xff3aa8, 0x3ae0ff, 0xffe04a, 0xa87aff];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.position.set((i < 2 ? -1 : 1) * (i % 2 ? 11 : 4.5), 14, -22 - (i % 2) * 6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 22, 20, 1, true), new THREE.MeshBasicMaterial({ color: beamCols[i], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    cone.position.y = -11; g.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: beamCols[i], transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; scene.add(pool);
    scene.add(g); beams.push({ g, cone, pool, ph: i * 1.7, base: g.position.clone() });
  }

  // ---------- sterren + maan ----------
  {
    const N = 260, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = rng() * TAU, e = 0.12 + rng() * 0.5; pos[i * 3] = Math.cos(a) * 300 * Math.cos(e); pos[i * 3 + 1] = Math.sin(e) * 300 + 20; pos[i * 3 + 2] = -Math.abs(Math.sin(a)) * 300 * Math.cos(e) - 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false })); st.frustumCulled = false; scene.add(st);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 28), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false })); moon.position.set(48, 62, -150); scene.add(moon);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(20, 28), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.18, fog: false, depthWrite: false })); halo.position.set(48, 62, -151); scene.add(halo);
  }

  // ---------- gitaarkist met muntjes ----------
  const CASE = { x: 0, z: 3.4 };
  const cs = new THREE.Group(); cs.position.set(CASE.x, 0, CASE.z); S.add(cs);
  cs.add(mesh(new THREE.BoxGeometry(2.6, 0.4, 1.3), mat(0x2a1a14), { pos: [0, 0.2, 0] }));
  cs.add(mesh(new THREE.BoxGeometry(2.3, 0.1, 1.05), mat(0x8a2a5a, { flatShading: false }), { cast: false, pos: [0, 0.41, 0] }));
  const lid = mesh(new THREE.BoxGeometry(2.6, 0.12, 1.2), mat(0x2a1a14), { pos: [0, 0.85, -0.85], rot: [-1.15, 0, 0] }); cs.add(lid);
  const pileM = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffa500, emissiveIntensity: 0.45, metalness: 0.8, roughness: 0.3, flatShading: true });
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, TAU, 0, Math.PI / 2), pileM); pile.position.set(0, 0.45, 0.05); pile.scale.set(0.01, 0.01, 0.01); scene.add(pile);
  pile.position.set(CASE.x, 0.46, CASE.z + 0.05);
  const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), coinM = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 });
  const coins = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(coinGeo, coinM); m.visible = false; scene.add(m); coins.push({ m, on: false, t: 0, T: 1, sx: 0, sy: 0, sz: 0, spin: 0 }); }
  let coinsIn = 0;

  // ---------- hype-toren (gedeelde publieksmeter) ----------
  const tower = new THREE.Group(); tower.position.set(0, 0, -6); scene.add(tower);
  tower.add(mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.5, 12), mat(0x3a2a1c), { pos: [0, 0.25, 0] }));
  const tubeM = new THREE.MeshStandardMaterial({ color: 0x9ab8ff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide });
  const TH = 3.6;
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, TH, 14, 1, true), tubeM)).position.y = 0.5 + TH / 2;
  const fillM = new THREE.MeshBasicMaterial({ color: 0xffd24a });
  const fillMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1, 14), fillM); tower.add(fillMesh);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), fillM); orb.position.y = 0.5 + TH + 0.35; tower.add(orb);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); star.position.y = TH + 1.3; tower.add(star);
  for (let i = 1; i < 5; i++) tower.add(mesh(new THREE.TorusGeometry(0.58, 0.03, 4, 14), mat(0xffffff, { flatShading: false }), { cast: false, pos: [0, 0.5 + TH * i / 5, 0], rot: [Math.PI / 2, 0, 0] }));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: tex.sign('PUBLIEK', { w: 256, h: 96, size: 44, bg: '#3a1a5a' }), transparent: true }));
  lbl.position.set(0, 0.95, 1.2); lbl.rotation.x = -0.55; tower.add(lbl);

  // ---------- publiek (instanced) ----------
  const crowd = [];
  const place = (x, z, face) => crowd.push({ x, z, face, ph: rng() * 6, skin: [0xf4c9a0, 0xe8b088, 0xc88a5a, 0x8a5a3a, 0xf7d2ae][Math.floor(rng() * 5)], shirt: [0xe8412c, 0x3a78e0, 0x2f9e5b, 0xf2c230, 0xc060ff, 0xff8aa8, 0x38c8c0, 0xf0f0f0][Math.floor(rng() * 8)], vis: 0, thr: 0, jump: 0, sc: R(0.95, 1.2) });
  for (let r = 0; r < 3; r++) for (let i = 0; i < 15; i++) place(-15.5 + i * 2.2 + (r % 2) * 1.1 + R(-0.4, 0.4), -31 - r * 2.4 + R(-0.3, 0.3), 0);
  for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) place(sx * (13.2 + r * 2.2) + R(-0.3, 0.3), -4 - i * 3.6 + R(-0.5, 0.5), sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  // volgorde van binnenkomst: van het midden naar buiten (met wat toeval)
  crowd.sort((a, b) => (Math.abs(a.x) * 0.6 + Math.abs(a.z + 30) * 0.4 + rng() * 5) - (Math.abs(b.x) * 0.6 + Math.abs(b.z + 30) * 0.4 + rng() * 5));
  crowd.forEach((c, i) => { c.thr = i < 6 ? 0 : (i / crowd.length) * 92; });
  const NC = crowd.length;
  const bodyIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), NC);
  const headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false }), NC);
  const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.13); armGeo.translate(0, -0.31, 0);
  const armIM = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), NC * 2);
  for (const im of [bodyIM, headIM, armIM]) { im.frustumCulled = false; im.castShadow = false; scene.add(im); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
  crowd.forEach((c, i) => { cc.setHex(c.shirt); bodyIM.setColorAt(i, cc); cc.setHex(c.skin); headIM.setColorAt(i, cc); armIM.setColorAt(i * 2, cc); armIM.setColorAt(i * 2 + 1, cc); });
  const dFig = new THREE.Object3D(), dArm = new THREE.Object3D(), mFig = new THREE.Matrix4();
  let crowdWave = -1;   // golf: tijd sinds start
  function updateCrowd(dt, t, beat, hype, energy) {
    let shown = 0;
    for (let i = 0; i < NC; i++) {
      const c = crowd[i];
      const target = hype >= c.thr ? 1 : 0;
      c.vis = damp(c.vis, target, target ? 5 : 3, dt);
      if (c.vis > 0.02) shown++;
      c.jump = Math.max(0, c.jump - dt * 2.2);
      const s = c.vis * c.sc;
      const bob = Math.abs(Math.sin(beat * Math.PI + c.ph * 0.15)) * 0.22 * energy + c.jump * 0.6;
      let wv = 0; if (crowdWave >= 0) { const d = Math.abs(c.x * 0.12 + c.ph * 0.0) - crowdWave * 1.1; wv = Math.max(0, 1 - Math.abs(d) * 1.4); }
      dFig.position.set(c.x, bob + wv * 0.8, c.z); dFig.rotation.set(0, c.face, 0); dFig.scale.setScalar(Math.max(0.0001, s)); dFig.updateMatrix();
      // lijf
      dArm.position.set(0, 0.48, 0); dArm.rotation.set(0, 0, 0); dArm.scale.set(1, 1, 1); dArm.updateMatrix();
      mFig.multiplyMatrices(dFig.matrix, dArm.matrix); bodyIM.setMatrixAt(i, mFig);
      dArm.position.set(0, 1.25, 0); dArm.updateMatrix(); mFig.multiplyMatrices(dFig.matrix, dArm.matrix); headIM.setMatrixAt(i, mFig);
      // armen: hoger bij meer energie
      const up = clamp(0.25 + energy * 2.3 + wv * 1.2 + c.jump, 0, 2.9);
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        const sw = Math.sin(t * 7 + c.ph + k * 1.5) * 0.35 * energy;
        dArm.position.set(side * 0.42, 0.88, 0); dArm.rotation.set(0, 0, side * (up + sw)); dArm.updateMatrix();
        mFig.multiplyMatrices(dFig.matrix, dArm.matrix); armIM.setMatrixAt(i * 2 + k, mFig);
      }
    }
    bodyIM.instanceMatrix.needsUpdate = headIM.instanceMatrix.needsUpdate = armIM.instanceMatrix.needsUpdate = true;
    if (crowdWave >= 0) { crowdWave += dt * 9; if (crowdWave > 32) crowdWave = -1; }
    return shown;
  }

  // ---------- Bard Bas (bevroren, hupt mee) ----------
  const basC = makeNPC('bard'); basC.faceDir(0.4, 1); basC.pose = 'dance';
  for (let k = 0; k < 12; k++) basC.update(0.05);
  const bas = new THREE.Group(); bas.add(bake(basC.group, true)); bas.position.set(-11.8, 0, -10); bas.scale.setScalar(1.25); scene.add(bas);

  scene.add(bake(S));

  // ---------- API ----------
  const dummy = new THREE.Object3D();
  const tmpC = new THREE.Color();
  function update(dt, t, beat, hype, energy, intensity) {
    const shown = updateCrowd(dt, t, beat, hype, energy);
    // lampionnen pulseren
    const pulse = 1 + Math.pow(1 - beat, 3) * 0.28 * (0.4 + energy);
    for (let i = 0; i < lampPos.length; i++) { const l = lampPos[i]; dummy.position.set(l.x, l.y + Math.sin(t * 1.5 + l.ph) * 0.07, l.z); dummy.scale.setScalar(pulse); dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix); }
    lamps.instanceMatrix.needsUpdate = true;
    // spots
    for (const b of beams) {
      const a = t * 0.6 + b.ph;
      b.g.rotation.z = Math.sin(a) * 0.35; b.g.rotation.x = Math.cos(a * 0.8) * 0.3 + 0.1;
      b.cone.material.opacity = 0.04 + intensity * 0.14 + Math.pow(1 - beat, 4) * 0.05;
      const tipY = b.g.position.y; const gx = b.g.position.x + Math.sin(-b.g.rotation.z) * tipY * 1.0, gz = b.g.position.z + Math.sin(b.g.rotation.x) * tipY;
      b.pool.position.set(gx, 0.04, gz); b.pool.material.opacity = 0.08 + intensity * 0.2;
    }
    // hype-toren
    const k = clamp(hype / 100, 0.001, 1);
    fillMesh.scale.y = k * TH; fillMesh.position.y = 0.5 + (k * TH) / 2;
    tmpC.setHSL(lerp(0.0, 0.33, Math.min(1, k * 1.15)) + (k > 0.9 ? Math.sin(t * 6) * 0.1 : 0), 0.95, 0.55); fillM.color.copy(tmpC);
    star.rotation.y = t * 2; star.rotation.x = t * 1.3; star.position.y = TH + 1.3 + Math.sin(t * 3) * 0.1; star.scale.setScalar(0.6 + k * 0.6);
    orb.scale.setScalar(0.85 + k * 0.3 + Math.pow(1 - beat, 3) * 0.1);
    // muntjes
    for (const c of coins) {
      if (!c.on) continue;
      c.t += dt; const u = Math.min(1, c.t / c.T);
      c.m.position.set(lerp(c.sx, CASE.x, u), lerp(c.sy, 0.7, u) + Math.sin(u * Math.PI) * 4.5, lerp(c.sz, CASE.z, u));
      c.m.rotation.x += dt * 12; c.m.rotation.z += dt * 7;
      if (u >= 1) { c.on = false; c.m.visible = false; coinsIn++; fx.particles.burst(CASE.x, 0.8, CASE.z, { count: 5, colors: [0xffd23f, 0xffffff], speed: 2.5, size: 0.2, gravity: 6 }); c.arrived = true; }
    }
    const ps = Math.min(1, coinsIn / 30);
    pile.scale.setScalar(0.01 + ps * 0.95 + Math.min(1, coinsIn / 3) * 0.05);
    bas.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.25 * (0.4 + energy);
    bas.rotation.y = Math.sin(t * 2) * 0.15;
    return shown;
  }
  function throwCoin() {
    const c = coins.find((q) => !q.on); if (!c) return false;
    const vis = crowd.filter((q) => q.vis > 0.5); if (!vis.length) return false;
    const m = vis[Math.floor(Math.random() * vis.length)];
    c.on = true; c.t = 0; c.T = 0.85 + Math.random() * 0.3; c.sx = m.x; c.sy = 1.8; c.sz = m.z; c.m.visible = true; c.m.position.set(m.x, 1.8, m.z); m.jump = 1;
    return true;
  }
  function crowdJump(strength = 0.6) { for (const c of crowd) if (c.vis > 0.3 && Math.random() < strength) c.jump = 0.6 + Math.random() * 0.4; }
  function startWave() { crowdWave = 0; }
  function crowdPos() { const v = crowd.filter((q) => q.vis > 0.5); const m = v.length ? v[Math.floor(Math.random() * v.length)] : crowd[0]; return [m.x, m.z]; }
  return { update, throwCoin, crowdJump, startWave, crowdPos, CASE, get coinsIn() { return coinsIn; }, crowdSize: NC, bas, poster };
}

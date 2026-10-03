import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, mulberry32, TAU, clamp, lerp, damp } from '../engine/util.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import { MB } from './dodgeball_world.js';

// De quizshow-studio van Drie-Buzzer: podium, drie lessenaars met buzzers, groot scherm met lampjes,
// publiek van deurtjes + ballonnen, de Deurman met feesthoed als presentator.
export const LEC_X = [-4.6, 0, 4.6], LEC_Z = 1.2;
export const CAM = { pos: [0, 4.4, 11.6], look: [0, 4.55, -2] };

function cvs(w, h, fn) { const c = canvasTex(w, h, fn); c.userData.keep = false; return c; }

export function buildStudio(ctx) {
  const { scene, players } = ctx, n = players.length;
  const root = new THREE.Group(); scene.add(root);
  const rng = mulberry32(4242);
  scene.background = new THREE.Color(0x1a0f33); scene.fog = new THREE.Fog(0x1a0f33, 40, 90);

  // ---- vloer: podium met glimmende tegels + donkere zaal ----
  const floorTex = cvs(256, 256, (g, w, h) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#3a2370' : '#4d2f94'; g.fillRect(x * 32, y * 32, 32, 32); }
    g.strokeStyle = 'rgba(255,220,120,.25)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 3);
  root.add(mesh(new THREE.BoxGeometry(26, 0.4, 12), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.2 }), { cast: false, pos: [0, -0.2, 0] }));
  root.add(mesh(new THREE.BoxGeometry(26.4, 0.12, 0.3), mat(0xf2c230, { metalness: 0.6, roughness: 0.35, emissive: 0x4a3400 }), { cast: false, pos: [0, 0.02, 6.1] }));
  root.add(mesh(new THREE.PlaneGeometry(90, 60), mat(0x120a26), { cast: false, pos: [0, -0.45, 0], rot: [-Math.PI / 2, 0, 0] }));

  // ---- achterwand + gordijnen ----
  const wallTex = cvs(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d1040'); gr.addColorStop(1, '#3a1d6e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry32(9); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,${200 + r() * 50 | 0},120,${0.2 + r() * 0.5})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, 7); g.fill(); }
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(4, 1.5);
  root.add(mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ map: wallTex }), { cast: false, receive: false, pos: [0, 8, -7] }));
  const curtTex = cvs(128, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#6e0c24'); gr.addColorStop(0.5, '#d8283e'); gr.addColorStop(1, '#6e0c24'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, w, 14);
  });
  for (const sx of [-1, 1]) root.add(mesh(new THREE.PlaneGeometry(6.2, 12), new THREE.MeshStandardMaterial({ map: curtTex, roughness: 0.9 }), { cast: false, pos: [sx * 8.7, 6, -6.5] }));

  // ---- groot scherm + lampjes-lijst ----
  const BW = 1024, BH = 576;
  const bigC = document.createElement('canvas'); bigC.width = BW; bigC.height = BH;
  const bigG = bigC.getContext('2d'); const bigTex = new THREE.CanvasTexture(bigC); bigTex.colorSpace = THREE.SRGBColorSpace; bigTex.anisotropy = 4;
  const SW = 11.5, SH = SW * BH / BW, SY = 5.2, SZ = -2.8;
  root.add(mesh(new THREE.BoxGeometry(SW + 0.9, SH + 0.9, 0.25), mat(0x2a1650), { pos: [0, SY, SZ - 0.16] }));
  for (const sx of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(0.3, SY + SH / 2, 0.3), mat(0x2a1650), { pos: [sx * (SW / 2 + 0.3), (SY + SH / 2) / 2 - 0.2, SZ - 0.3] }));
  root.add(mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: bigTex, fog: false }), { cast: false, receive: false, pos: [0, SY, SZ] }));
  const bulbs = []; // positie van elk lampje rond het scherm
  { const px = SW / 2 + 0.38, py = SH / 2 + 0.38, step = 0.55;
    for (let x = -px; x <= px + 0.01; x += step) { bulbs.push([x, SY + py], [x, SY - py]); }
    for (let y = -py + step; y < py - 0.01; y += step) { bulbs.push([-px, SY + y], [px, SY + y]); } }
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ fog: false }), bulbs.length);
  { const m = new THREE.Matrix4(); bulbs.forEach(([x, y], i) => { m.makeTranslation(x, y, SZ + 0.04); bulbMesh.setMatrixAt(i, m); bulbMesh.setColorAt(i, new THREE.Color(0xffe14a)); }); }
  root.add(bulbMesh);
  const BCOL = [0xffe14a, 0xff4aa8, 0x4ac8ff, 0x7bff7b].map((c) => new THREE.Color(c));

  // ---- lessenaars, spelers, buzzers ----
  const pods = [], chars = [];
  const X = LEC_X;
  for (let i = 0; i < n; i++) {
    const x = n === 3 ? X[i] : (i - 0.5) * 6, col = players[i].color;
    const g = new THREE.Group(); g.position.set(x, 0, 0); root.add(g);
    g.add(mesh(new THREE.BoxGeometry(2.6, 1.0, 1.5), mat(0x2a1650), { pos: [0, 0.5, LEC_Z - 0.55] }));                      // verhoging
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.85, 0.95), mat(0x35205f), { pos: [0, 0.55, LEC_Z + 0.1] }));                          // lessenaar
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.07, 1.05), mat(0xf2c230, { metalness: 0.6, roughness: 0.35 }), { cast: false, pos: [0, 1.0, LEC_Z + 0.1] }));
    // voorpaneel = lamp in spelerskleur + naam & score
    const lampMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.4 });
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.62, 0.06), lampMat, { cast: false, pos: [0, 0.55, LEC_Z + 0.6] }));
    const nc = document.createElement('canvas'); nc.width = 256; nc.height = 64; const ng = nc.getContext('2d');
    const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace; nt.anisotropy = 4;
    g.add(mesh(new THREE.PlaneGeometry(2.14, 0.535), new THREE.MeshBasicMaterial({ map: nt, fog: false }), { cast: false, receive: false, pos: [0, 0.55, LEC_Z + 0.635] }));
    // klein schermpje (schuin)
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 128; const sg = sc.getContext('2d');
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 4;
    g.add(mesh(new THREE.PlaneGeometry(2.1, 1.05), new THREE.MeshBasicMaterial({ map: st, fog: false }), { cast: false, receive: false, pos: [0, 1.95, LEC_Z - 0.22], rot: [-0.62, 0, 0] }));
    g.add(mesh(new THREE.BoxGeometry(2.22, 1.15, 0.05), mat(0x15092b), { cast: false, pos: [0, 1.95, LEC_Z - 0.26], rot: [-0.62, 0, 0] }));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), mat(0x15092b), { cast: false, pos: [sx * 0.95, 1.5, LEC_Z - 0.3] }));
    // buzzer
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.1, 20), mat(0xf2c230, { metalness: 0.6, roughness: 0.35 }), { cast: false, pos: [0, 1.08, LEC_Z + 0.42] }));
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xe0202a, emissive: 0x500008, roughness: 0.3, metalness: 0.1 });
    const btn = mesh(new THREE.CylinderGeometry(0.38, 0.43, 0.22, 20), btnMat, { cast: false, pos: [0, 1.2, LEC_Z + 0.42] }); g.add(btn);
    // lichtbundel
    const coneMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    g.add(mesh(new THREE.ConeGeometry(2.0, 10, 20, 1, true), coneMat, { cast: false, receive: false, pos: [0, 5, LEC_Z - 0.4] }));
    // speler
    const c = makeBrother(i); c.group.position.set(x, 1.45 + (1 - c.s) * 1.8, LEC_Z - 1.0); c.targetYaw = c.yaw = 0; scene.add(c.group); chars.push(c);
    pods.push({ x, g, btn, btnMat, lampMat, coneMat, scr: { g: sg, tex: st, w: 256, h: 128 }, sign: { g: ng, tex: nt, w: 256, h: 64 }, press: 0, lampK: 0, lampCol: new THREE.Color(col), baseCol: new THREE.Color(col), pulse: 0 });
  }

  // ---- presentator: de Deurman met feesthoed ----
  const host = makeDeurman(1.1, { outfit: 'feest' }); host.group.position.set(-7.6, 0.2, -0.8); host.faceDir(0.5, 1); scene.add(host.group);
  root.add(mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.2, 18), mat(0xf2c230, { metalness: 0.6, roughness: 0.35 }), { pos: [-7.6, 0.1, -0.8] }));
  // gouden beker op sokkel
  const cup = new THREE.Group(); cup.position.set(7.6, 0, -1); root.add(cup);
  cup.add(mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), mat(0x35205f), { pos: [0, 0.55, 0] }));
  { const gold = mat(0xffd23f, { metalness: 0.7, roughness: 0.25, emissive: 0x4a3400 });
    cup.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 10), gold, { pos: [0, 1.4, 0] }));
    cup.add(mesh(new THREE.CylinderGeometry(0.75, 0.3, 0.95, 14), gold, { pos: [0, 2.15, 0] }));
    for (const sx of [-1, 1]) cup.add(mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 12), gold, { pos: [sx * 0.8, 2.2, 0], rot: [0, 0, 0] }));
    cup.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), gold, { pos: [0, 1.15, 0] })); }

  // ---- tribunes met deurtjes-publiek ----
  const doors = [];   // { x,y,z,ry, ph }
  for (const sx of [-1, 1]) for (let row = 0; row < 3; row++) {
    root.add(mesh(new THREE.BoxGeometry(5.4 - row * 0.9, 0.7, 7), mat(0x2a1650), { cast: false, pos: [sx * (12.2 + row * 0.9 + 0.2), 0.35 + row * 0.7, -2.5] }));
    for (let k = 0; k < 6; k++) doors.push({ x: sx * (11.0 + row * 0.9 + 0.2), y: 0.7 + row * 0.7 + 0.8, z: -5.4 + k * 1.2 + (row % 2) * 0.5, ry: sx < 0 ? Math.PI / 2 : -Math.PI / 2, ph: rng() * 6, tone: rng() });
  }
  const doorGeo = new THREE.BoxGeometry(0.9, 1.5, 0.16), knobGeo = new THREE.SphereGeometry(0.07, 6, 4), eyeGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const doorM = new THREE.InstancedMesh(doorGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), doors.length);
  const knobM = new THREE.InstancedMesh(knobGeo, mat(0xffd23f, { metalness: 0.6, roughness: 0.3 }), doors.length);
  const eyeM = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), doors.length * 2);
  const pupM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), doors.length * 2);
  doors.forEach((d, i) => doorM.setColorAt(i, new THREE.Color().setHSL(0.07 + d.tone * 0.05, 0.55, 0.3 + d.tone * 0.15)));
  root.add(doorM, knobM, eyeM, pupM);
  // ballonnen boven het publiek en in de zaal
  const balls = []; for (let i = 0; i < 34; i++) { let x = (rng() - 0.5) * 30, y = 6.5 + rng() * 5; if (Math.abs(x) < 6.3 && y < 8.9) x += Math.sign(x || 1) * 6; balls.push({ x, y, z: -6 + rng() * 3, ph: rng() * 6, r: 0.5 + rng() * 0.25 }); }
  const balM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }), balls.length);
  const BALC = [0xff5a5a, 0xffd23f, 0xff6fb5, 0x35d6c8, 0x8a6aff, 0x7bff7b];
  balls.forEach((b, i) => balM.setColorAt(i, new THREE.Color(BALC[i % BALC.length])));
  root.add(balM);

  const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dp = new THREE.Vector3(), ds = new THREE.Vector3(1, 1, 1), de = new THREE.Euler();
  let crowd = 0, tt = 0, chase = 0;
  const S = {
    root, big: { g: bigG, tex: bigTex, w: BW, h: BH }, pods, chars, host, cup, n, bulbCol: 0,
    cheerCrowd(k = 1) { crowd = Math.min(2, crowd + k); },
    // buzzer indrukken (visueel)
    press(i) { pods[i].press = 1; },
    // lamp rond het naambord: kleur + sterkte (0..1)
    lamp(i, hex, k = 1) { const p = pods[i]; p.lampCol.set(hex); p.lampK = k; },
    lampReset(i) { const p = pods[i]; p.lampCol.copy(p.baseCol); p.lampK = 0; },
    beam(i, k) { pods[i].pulse = k; },
    update(dt) {
      tt += dt; crowd = Math.max(0, crowd - dt * 0.7); chase += dt * 8;
      pods.forEach((p) => {
        p.press = Math.max(0, p.press - dt * 4); p.btn.position.y = 1.2 - 0.1 * p.press;
        p.lampK = Math.max(0, p.lampK - dt * 0.35 * (p.lampK > 1 ? 0.5 : 1));
        p.lampMat.emissive.copy(p.baseCol).lerp(p.lampCol, Math.min(1, p.lampK * 3)); p.lampMat.color.copy(p.lampMat.emissive); p.lampMat.emissiveIntensity = 0.5 + Math.min(1, p.lampK) * 1.3;
        p.pulse = Math.max(0, p.pulse - dt * 1.5); p.coneMat.opacity = 0.09 + p.pulse * 0.28 + Math.sin(tt * 2 + p.x) * 0.012;
      });
      // lampjes: looplicht
      for (let i = 0; i < bulbs.length; i++) { const c = BCOL[(Math.floor(i * 0.5 - chase) % 4 + 4) % 4]; bulbMesh.setColorAt(i, c); }
      bulbMesh.instanceColor.needsUpdate = true;
      // publiek
      doors.forEach((d, i) => {
        const hop = Math.max(0, Math.sin(tt * 7 + d.ph)) * (0.08 + crowd * 0.35);
        de.set(Math.sin(tt * 3 + d.ph) * 0.05 * (1 + crowd), d.ry, Math.sin(tt * 5 + d.ph) * 0.06 * crowd); dq.setFromEuler(de);
        dp.set(d.x, d.y + hop, d.z); dm.compose(dp, dq, ds); doorM.setMatrixAt(i, dm);
        const sn = Math.sin(d.ry), cs = Math.cos(d.ry), Y = d.y + hop;
        dp.set(d.x + 0.3 * cs + 0.1 * sn, Y - 0.05, d.z - 0.3 * sn + 0.1 * cs); dm.compose(dp, dq, ds); knobM.setMatrixAt(i, dm);
        for (let e = 0; e < 2; e++) {
          const lx = e ? 0.2 : -0.2;
          dp.set(d.x + lx * cs + 0.09 * sn, Y + 0.4, d.z - lx * sn + 0.09 * cs); dm.compose(dp, dq, ds); eyeM.setMatrixAt(i * 2 + e, dm);
          dp.set(d.x + lx * cs + 0.15 * sn, Y + 0.4, d.z - lx * sn + 0.15 * cs); dm.compose(dp, dq, ds); pupM.setMatrixAt(i * 2 + e, dm);
        }
      });
      doorM.instanceMatrix.needsUpdate = knobM.instanceMatrix.needsUpdate = eyeM.instanceMatrix.needsUpdate = pupM.instanceMatrix.needsUpdate = true;
      balls.forEach((b, i) => { dp.set(b.x + Math.sin(tt * 0.7 + b.ph) * 0.3, b.y + Math.sin(tt * 1.1 + b.ph) * 0.35, b.z); ds.set(b.r, b.r * 1.2, b.r); dm.compose(dp, dq.identity(), ds); balM.setMatrixAt(i, dm); });
      ds.set(1, 1, 1); balM.instanceMatrix.needsUpdate = true;
      cup.rotation.y += dt * 0.9; cup.position.y = Math.sin(tt * 2) * 0.05;
      host.update(dt); chars.forEach((c) => c.update(dt));
    },
  };
  return S;
}

import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU } from '../engine/util.js';
import { makeNPC, Dragon, Animal } from '../engine/chars.js';
import { skyTexture } from '../engine/lights.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Strafschop-Showdown": een gek nachtstadion. Gras met strepen, doel met net, reclameborden met rare teksten,
// tribunes vol monsters (geinstancet), een draak als scheidsrechter, vlaggen/windzak, regen, vuurwerk en een groot scorebord.
export const PEN = { GZ: -11, GW: 8.4, GH: 2.8, GD: 2.4, BR: 0.3, PR: 0.14 };
const { GZ, GW, GH, GD } = PEN;

const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

// gras met maaistrepen + strafschopgebied (wereld x -36..36, z -17..27)
const PX0 = -36, PX1 = 36, PZ0 = -17, PZ1 = 27;
function pitchTexture() {
  const W = 1440, H = 880, sx = W / (PX1 - PX0), sz = H / (PZ1 - PZ0), X = (x) => (x - PX0) * sx, Z = (z) => (z - PZ0) * sz;
  return canvasTex(W, H, (g) => {
    for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#2f8f45' : '#37a04e'; g.fillRect(0, i * H / 11, W, H / 11 + 1); }
    const r = mulberry32(5); for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(10,70,30,.22)' : 'rgba(170,255,150,.13)'; g.fillRect(r() * W, r() * H, 2 + r() * 4, 2 + r() * 4); }
    g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 7; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(X(-36), Z(GZ)); g.lineTo(X(36), Z(GZ)); g.stroke();                       // doellijn
    g.strokeRect(X(-7.5), Z(GZ), 15 * sx, 3.6 * sz);                                                  // klein vak
    g.strokeRect(X(-14.5), Z(GZ), 29 * sx, 16.5 * sz);                                                // groot vak
    g.beginPath(); g.arc(X(0), Z(0), 7.2 * sx, 0.87, Math.PI - 0.87); g.stroke();   // boog
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(0), Z(0), 0.28 * sx, 0, TAU); g.fill();               // strafschopstip
    g.fillStyle = 'rgba(80,50,20,.28)'; g.beginPath(); g.ellipse(X(0), Z(0), 1.6 * sx, 1.3 * sz, 0, 0, TAU); g.fill();   // kale plek
    g.fillStyle = 'rgba(255,255,255,.14)'; g.font = `bold ${Math.round(3.2 * sz)}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SPORTHAL', X(0), Z(13));
  });
}
function netTex() { return canvasTex(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(235,248,255,.85)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); } for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } }); }
function stripeTex() { return canvasTex(16, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8403a' : '#ffffff'; g.fillRect(0, i * 8, w, 8); } }); }
function adTex() {
  const txt = ['KIP-KOEK', 'DRAKEN-TAXI', 'DEURMAN BV', 'PIET\'S POEP-POMP', 'FRIET MET VUUR', 'MONSTER-MELK', 'KEEPER-KLEEF', 'HEITJES-BANK', 'GRAPPIGE HOEDEN', 'SLIJM & CO'];
  const cols = ['#d8372c', '#2f7fd8', '#e8b020', '#35a85a', '#a04ad8', '#e8602a'];
  return canvasTex(2048, 96, (g, w, h) => {
    const n = txt.length, cw = w / n; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 48px Fredoka, Arial Black, sans-serif';
    for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * cw, 0, cw, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * cw, 0, cw, 10); g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 6; g.strokeText(txt[i], (i + 0.5) * cw, h / 2 + 3, cw - 14); g.fillText(txt[i], (i + 0.5) * cw, h / 2 + 3, cw - 14); }
  });
}
function moonTex() {
  return canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 126); gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.7, 'rgba(255,240,170,.35)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(128, 128, 78, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,180,110,.35)'; for (const [x, y, r] of [[100, 100, 14], [150, 150, 18], [110, 160, 9]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(128 + sx * 26, 112, 17, 0, TAU); g.fill(); g.strokeStyle = '#6a5a20'; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = '#222'; g.beginPath(); g.arc(104, 114, 7, 0, TAU); g.fill(); g.beginPath(); g.arc(158, 108, 7, 0, TAU); g.fill();      // scheelkijkend
    g.strokeStyle = '#7a5a20'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(128, 150, 26, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#e06a8a'; g.beginPath(); g.ellipse(128, 178, 10, 12, 0, 0, TAU); g.fill();                                       // tong
  });
}

export function buildStadium(ctx, L) {
  const { scene, fx } = ctx; const rng = mulberry32(777); const idx0 = scene.children.length;
  const A = { frame: 0, flashT: 0, cheerAmt: 0, boo: 0 };
  scene.background = skyTexture('#06082a', '#2a2460'); scene.fog = new THREE.Fog(0x1a1846, 70, 190);

  // sterren, maan, bergen
  { const n = 160, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rng() * TAU, e = 0.15 + rng() * 0.8; pos[i * 3] = Math.cos(a) * 120 * Math.cos(e); pos[i * 3 + 1] = 20 + Math.sin(e) * 90; pos[i * 3 + 2] = -Math.abs(Math.sin(a)) * 120 - 20; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, fog: false })); st.userData.dynamic = true; scene.add(st); }
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex(), transparent: true, fog: false, depthWrite: false })); moon.scale.set(26, 26, 1); moon.position.set(-34, 50, -95); scene.add(moon); A.moon = moon;
  { const mm = mat(0x1a1648, { flatShading: true }); for (let i = 0; i < 14; i++) { const x = -120 + i * 18 + rng() * 8, h = 22 + rng() * 26; scene.add(mesh(new THREE.ConeGeometry(14 + rng() * 8, h, 5), mm, { cast: false, receive: false, pos: [x, h / 2 - 2, -88 - rng() * 14] })); } }

  // veld
  A.pitchTex = pitchTexture();
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0), new THREE.MeshStandardMaterial({ map: A.pitchTex, roughness: 0.85 })); pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0, (PZ0 + PZ1) / 2); pitch.receiveShadow = true; scene.add(pitch); A.pitch = pitch;
  scene.add(mesh(new THREE.PlaneGeometry(300, 200), mat(0x13173a, { flatShading: false }), { cast: false, receive: false, pos: [0, -0.06, -60], rot: [-Math.PI / 2, 0, 0] }));

  // doel
  const goal = new THREE.Group(); goal.position.set(0, 0, GZ); scene.add(goal); A.goal = goal;
  const postM = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.35, emissive: 0x333333 }); postM.map.wrapS = postM.map.wrapT = THREE.RepeatWrapping; postM.map.repeat.set(1, 3);
  const barM = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.35, emissive: 0x333333 }); barM.map = barM.map.clone(); barM.map.wrapS = barM.map.wrapT = THREE.RepeatWrapping; barM.map.repeat.set(1, 6); barM.map.needsUpdate = true;
  for (const sx of [-1, 1]) { goal.add(mesh(new THREE.CylinderGeometry(PEN.PR, PEN.PR, GH + PEN.PR, 12), postM, { pos: [sx * GW / 2, (GH + PEN.PR) / 2, 0] })); goal.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 6), mat(0xe8e8f0), { cast: false, pos: [sx * GW / 2, GH / 2 + 0.2, -GD / 2 - 0.1], rot: [0.9, 0, 0] })); }
  goal.add(mesh(new THREE.CylinderGeometry(PEN.PR, PEN.PR, GW + PEN.PR * 2, 12), barM, { pos: [0, GH, 0], rot: [0, 0, Math.PI / 2] }));
  const nt = netTex(); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; const nb = nt.clone(); nb.repeat.set(GW / 1.6, 1.8); nb.needsUpdate = true; const ns = nt.clone(); ns.repeat.set(GD / 1.6, 1.8); ns.needsUpdate = true; const nr = nt.clone(); nr.repeat.set(GW / 1.6, GD / 1.6); nr.needsUpdate = true;
  const netM = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  goal.add(mesh(new THREE.PlaneGeometry(GW, GH), netM(nb), { cast: false, receive: false, pos: [0, GH / 2, -GD] }));
  for (const sx of [-1, 1]) goal.add(mesh(new THREE.PlaneGeometry(GD, GH), netM(ns), { cast: false, receive: false, pos: [sx * GW / 2, GH / 2, -GD / 2], rot: [0, Math.PI / 2, 0] }));
  goal.add(mesh(new THREE.PlaneGeometry(GW, GD), netM(nr), { cast: false, receive: false, pos: [0, GH, -GD / 2], rot: [-Math.PI / 2, 0, 0] }));
  A.netBack = goal.children[goal.children.length - 4]; A.netBack.userData.dynamic = true;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); fl.position.set(0, GH / 2, -0.3); goal.add(fl); A.flash = fl;

  // reclameborden
  { const t = adTex(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); const b = new THREE.Mesh(new THREE.PlaneGeometry(76, 1.5), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 })); b.position.set(0, 0.75, -15.6); scene.add(b);
    scene.add(mesh(new THREE.BoxGeometry(76, 0.2, 0.3), mat(0x222244), { cast: false, pos: [0, 1.55, -15.7] })); }

  // tribunes met monsters
  const ROWS = 8, rowY = (k) => 0.9 + k * 1.0, rowZ = (k) => -17.6 - k * 1.7;
  const stoneM = new THREE.MeshStandardMaterial({ color: 0x4a4a7a, roughness: 1, flatShading: true });
  for (let k = 0; k < ROWS; k++) { const h = rowY(k) + 0.7; scene.add(mesh(new THREE.BoxGeometry(84, h, 1.7), stoneM, { cast: false, receive: false, pos: [0, rowY(k) - h / 2, rowZ(k)] })); }
  scene.add(mesh(new THREE.BoxGeometry(84, 14, 0.5), mat(0x15123a), { cast: false, receive: false, pos: [0, 5, rowZ(ROWS - 1) - 1.4] }));
  const spots = [];
  for (let k = 0; k < ROWS; k++) for (let x = -31 + (k % 2) * 0.7; x <= 31; x += 1.5) spots.push({ x: x + (rng() - 0.5) * 0.45, y: rowY(k), z: rowZ(k) + (rng() - 0.5) * 0.3, s: 0.8 + rng() * rng() * 1.0, ph: rng() * 6, cheer: 0, horn: rng() < 0.55, eyes: rng() < 0.22 ? 1 : 2, row: k });
  const nM = spots.length, mcol = [0x8a4ad8, 0x4ac86a, 0xe8802a, 0xe84a9a, 0x3ab8d8, 0xd8c83a, 0xb84a3a, 0x6a7ae8, 0x9ad84a];
  const mk = (geo, material, n) => { const m = new THREE.InstancedMesh(geo, material, n); m.userData.dynamic = true; m.frustumCulled = false; scene.add(m); return m; };
  const stdM = () => new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const bodyI = mk(new THREE.CylinderGeometry(0.42, 0.52, 1.1, 7), stdM(), nM), headI = mk(new THREE.IcosahedronGeometry(0.5, 1), stdM(), nM), hornI = mk(new THREE.ConeGeometry(0.11, 0.42, 5), stdM(), nM);
  const eyeI = mk(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), nM * 2), pupI = mk(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: 0x151020 }), nM * 2), armI = mk(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 5), stdM(), nM * 2);
  const col = new THREE.Color();
  spots.forEach((m, k) => { const c = mcol[Math.floor(rng() * mcol.length)]; bodyI.setColorAt(k, col.setHex(c)); headI.setColorAt(k, col.setHex(rng() < 0.75 ? c : mcol[Math.floor(rng() * mcol.length)])); hornI.setColorAt(k, col.setHex(0xf4ecd0)); armI.setColorAt(k * 2, col.setHex(c)); armI.setColorAt(k * 2 + 1, col.setHex(c)); });
  A.mon = spots;
  // een paar echte poppetjes vooraan
  A.crowd = [];
  ['goblin', 'skeleton', 'jester', 'dwarf', 'bard', 'guard', 'baker'].forEach((kind, k) => { const c = makeNPC(kind); c.group.scale.setScalar(1.3); const x = -17 + k * 5.7 + (rng() - 0.5); c.group.position.set(x, 0, -16.6); c.faceDir(0, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group); A.crowd.push({ c, y: 0, ph: rng() * 6, cheer: 0 }); });

  // floodlights
  A.lamps = [];
  for (const [x, z] of [[-27, -15], [27, -15], [-25, 9], [25, 9]]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.28, 0.4, 19, 6), mat(0x55557a, { metalness: 0.5 }), { cast: false, pos: [x, 9.5, z] }));
    const panel = mesh(new THREE.BoxGeometry(4.2, 2.6, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1.6 }), { cast: false, pos: [x, 19.6, z], rot: [0.3, x > 0 ? -0.3 : 0.3, 0] }); scene.add(panel);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.set(14, 14, 1); sp.position.set(x, 19.6, z + 0.5); scene.add(sp); A.lamps.push(sp);
  }
  const lt1 = new THREE.PointLight(0xffe8c0, 1.1, 60, 1.4); lt1.position.set(-8, 14, -4); scene.add(lt1);
  const lt2 = new THREE.PointLight(0xc0d8ff, 0.9, 60, 1.4); lt2.position.set(10, 12, 2); scene.add(lt2); A.lights = [lt1, lt2];

  // hoekvlaggen + windzak
  A.flags = [];
  for (const sx of [-1, 1]) { const g = new THREE.Group(); g.position.set(sx * 17, 0, GZ); g.userData.dynamic = true; g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5), mat(0xffffff), { cast: false, pos: [0, 1, 0] })); const f = mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff4a6a : 0x4ab8ff, side: THREE.DoubleSide }), { cast: false, receive: false, pos: [0.45, 1.75, 0] }); f.geometry.translate(0, 0, 0); g.add(f); scene.add(g); A.flags.push({ g, f, sx }); }
  { const g = new THREE.Group(); g.position.set(-11.5, 0, GZ - 1.8); g.userData.dynamic = true; g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6), mat(0xdddddd), { cast: false, pos: [0, 2.6, 0] }));
    const sock = new THREE.Group(); sock.position.set(0, 5.1, 0); g.add(sock); const parts = [];
    for (let i = 0; i < 4; i++) { const c = mesh(new THREE.CylinderGeometry(0.34 - i * 0.05, 0.4 - i * 0.05, 0.5, 8, 1, true), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xff7a2a, side: THREE.DoubleSide, roughness: 0.7 }), { cast: false, rot: [0, 0, Math.PI / 2], pos: [0.25 + i * 0.5, 0, 0] }); sock.add(c); parts.push(c); }
    scene.add(g); A.sock = { g, sock, parts }; }

  // scorebord
  const sbC = document.createElement('canvas'); sbC.width = 1024; sbC.height = 352; const sbG = sbC.getContext('2d'); const sbT = new THREE.CanvasTexture(sbC); sbT.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Group(); sb.position.set(0, 8.6, -21.5); scene.add(sb);
  sb.add(mesh(new THREE.BoxGeometry(17.5, 6.1, 0.8), mat(0x1a1634, { metalness: 0.6 }), { cast: false })); for (const sx of [-1, 1]) sb.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), mat(0x55557a), { cast: false, pos: [sx * 8, -7.5, 0] }));
  sb.add(mesh(new THREE.PlaneGeometry(16.8, 5.77), new THREE.MeshBasicMaterial({ map: sbT, toneMapped: false }), { cast: false, receive: false, pos: [0, 0, 0.42] }));
  sb.add(mesh(new THREE.BoxGeometry(18, 0.3, 1.0), mat(0xffd23f, { emissive: 0xffd23f, emissiveIntensity: 1.2 }), { cast: false, pos: [0, 3.2, 0] }));
  const CSS = ['#7dffb0', '#8fb8ff'];
  A.scoreboard = (names, score, logs, note, shooter) => {
    const g = sbG, w = 1024, h = 352; g.fillStyle = '#0b0724'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 46px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#ffd23f'; g.fillText(note || 'STRAFSCHOP-SHOWDOWN', w / 2, 44);
    for (let i = 0; i < 2; i++) {
      const y = 140 + i * 110; g.textAlign = 'left'; g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.fillStyle = CSS[i]; g.fillText((shooter === i ? '> ' : '') + names[i].toUpperCase(), 30, y);
      g.textAlign = 'right'; g.font = 'bold 96px Fredoka, Arial Black, sans-serif'; g.fillText(String(score[i]), w - 36, y + 2);
      const n = Math.max(5, logs[i].length);
      for (let k = 0; k < n; k++) { const x = 330 + k * 60 * Math.min(1, 7 / n * 1.0), r = logs[i][k]; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 21, 0, TAU);
        if (r === undefined) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.stroke(); } else if (r === 0) { g.fillStyle = '#7a2a2a'; g.fill(); g.strokeStyle = '#ff6a5a'; g.stroke(); g.beginPath(); g.moveTo(x - 10, y - 10); g.lineTo(x + 10, y + 10); g.moveTo(x + 10, y - 10); g.lineTo(x - 10, y + 10); g.stroke(); } else { g.fillStyle = r > 1 ? '#ffd23f' : '#3ac86a'; g.fill(); g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#143'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText(r > 1 ? '2' : 'v', x, y + 2); } }
    }
    sbT.needsUpdate = true;
  };

  // draak-scheidsrechter
  const dr = new Dragon(0xd8372c, 0.55); dr.group.position.set(3.6, 5.0, -8); dr.group.rotation.y = -0.15; scene.add(dr.group); A.dragon = dr; dr.group.userData.dynamic = true;
  { const head = dr.neck.children[1]; const s = 0.55; head.add(mesh(new THREE.CylinderGeometry(0.32 * s, 0.36 * s, 0.1 * s, 10), mat(0x15151f), { cast: false, pos: [0, 0.3 * s, 0.1 * s] })); head.add(mesh(new THREE.BoxGeometry(0.4 * s, 0.05 * s, 0.4 * s), mat(0x15151f), { cast: false, pos: [0, 0.27 * s, 0.34 * s] }));
    const wh = mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.34 * s, 8), mat(0xffd23f, { metalness: 0.6, roughness: 0.3 }), { cast: false, pos: [0, -0.06 * s, 0.7 * s], rot: [0, 0, Math.PI / 2] }); head.add(wh);
    dr.neck.add(mesh(new THREE.TorusGeometry(0.34 * s, 0.07 * s, 6, 12), mat(0xffffff), { cast: false, pos: [0, 0.25 * s, 0.1 * s], rot: [1.2, 0, 0] })); A.dragonHead = head; }
  A.dragonLook = 0;

  // regen (lijnstukjes)
  { const n = 360, pos = new Float32Array(n * 6); A.rain = { n, pos, on: false, k: 0, wind: 0 }; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfdcff, transparent: true, opacity: 0.5, depthWrite: false, fog: false })); ls.frustumCulled = false; ls.visible = false; ls.userData.dynamic = true; scene.add(ls); A.rain.ls = ls;
    for (let i = 0; i < n; i++) { const x = rng() * 44 - 22, y = rng() * 16, z = -22 + rng() * 32; for (let q = 0; q < 2; q++) { pos[i * 6 + q * 3] = x; pos[i * 6 + q * 3 + 1] = y; pos[i * 6 + q * 3 + 2] = z; } } }

  A.merged = mergeStatic(scene, idx0);

  // ---- bediening ----
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler();
  A.cheer = (secs = 2.5, who = 1) => { for (const f of A.mon) f.cheer = secs * (0.6 + Math.random() * 0.8); for (const q of A.crowd) q.cheer = secs * (0.7 + Math.random() * 0.6); A.booT = 0; };
  A.boo = (secs = 2) => { A.booT = secs; for (const f of A.mon) f.cheer = 0; };
  A.goalFlash = () => { A.flashT = 1.2; };
  A.setWind = (w) => { A.windV = w; A.rain.wind = w; };
  A.setRain = (on) => { A.rain.on = on; A.rain.ls.visible = on; };
  A.windV = 0; A.booT = 0; let windSm = 0, tt = 0;
  A.update = (t, dt, sky) => {
    A.frame++; tt = t;
    A.flashT = Math.max(0, A.flashT - dt); A.flash.material.opacity = A.flashT > 0 ? (Math.sin(t * 40) > 0 ? 0.6 : 0.15) * Math.min(1, A.flashT * 2) : 0;
    A.lights[0].intensity = 1.0 + Math.sin(t * 1.3) * 0.15; A.moon.material.opacity = 0.9 + Math.sin(t * 0.7) * 0.08;
    windSm = lerp(windSm, A.windV, 1 - Math.exp(-2 * dt)); const wk = clamp(windSm / 4.5, -1, 1);
    for (const f of A.flags) { f.f.rotation.y = Math.sin(t * 6 + f.sx) * 0.3 * (0.4 + Math.abs(wk)); f.g.rotation.y = wk * 0.9 + Math.sin(t * 0.7) * 0.05; }
    { const s = A.sock; s.g.rotation.y = wk >= 0 ? 0 : Math.PI; const lift = Math.abs(wk); s.parts.forEach((p, i) => { p.position.y = Math.sin(t * 5 + i) * 0.04 * (0.3 + lift); p.position.x = 0.25 + i * 0.5 * (0.35 + 0.65 * lift); p.position.y -= (1 - lift) * i * 0.32; p.rotation.z = Math.PI / 2 - (1 - lift) * 0.5; }); s.sock.scale.set(1, 1, 1); }
    for (const q of A.crowd) { q.cheer = Math.max(0, q.cheer - dt); q.c.group.position.y = q.y + (q.cheer > 0 ? Math.abs(Math.sin(t * 8 + q.ph)) * 0.8 : Math.abs(Math.sin(t * 1.6 + q.ph)) * 0.05); q.c.pose = q.cheer > 0 ? 'cheer' : (A.booT > 0 ? 'sad' : 'idle'); q.c.update(dt); }
    A.booT = Math.max(0, A.booT - dt);
    A.dragon.update(dt); A.dragon.group.position.y = 2.3 + Math.sin(t * 2.1) * 0.25; A.dragon.group.rotation.y = -Math.PI / 2 + 0.25 + Math.sin(t * 0.6) * 0.1;
    if (A.frame % 2 === 0) {
      for (let k = 0; k < nM; k++) {
        const f = spots[k]; f.cheer = Math.max(0, f.cheer - dt * 2);
        const hop = f.cheer > 0 ? Math.abs(Math.sin(t * 9 + f.ph)) * 0.8 : (A.booT > 0 ? 0 : Math.abs(Math.sin(t * 1.7 + f.ph)) * 0.06);
        const sway = f.cheer > 0 ? Math.sin(t * 6 + f.ph) * 0.15 : Math.sin(t * 1.1 + f.ph) * 0.05, s = f.s, y0 = f.y + hop * s, x0 = f.x;
        tq.setFromEuler(te.set(0, 0, sway)); tp.set(x0, y0 + 0.55 * s, f.z); ts.set(s, s, s); bodyI.setMatrixAt(k, tm.compose(tp, tq, ts));
        tp.set(x0 + sway * 0.6 * s, y0 + 1.45 * s, f.z); headI.setMatrixAt(k, tm.compose(tp, tq, ts));
        tp.set(x0 + sway * 0.8 * s, y0 + 1.95 * s, f.z); ts.set(f.horn ? s : 0.001, f.horn ? s : 0.001, f.horn ? s : 0.001); hornI.setMatrixAt(k, tm.compose(tp, tq, ts)); ts.set(s, s, s);
        for (let e = 0; e < 2; e++) { const ex = f.eyes === 1 ? 0 : (e ? 0.18 : -0.18), sc = f.eyes === 1 ? (e ? 0.001 : 1.5) : 1; tq.identity(); tp.set(x0 + ex * s + sway * 0.5 * s, y0 + 1.55 * s, f.z + 0.4 * s); ts.set(s * sc, s * sc, s * sc); eyeI.setMatrixAt(k * 2 + e, tm.compose(tp, tq, ts)); tp.z += 0.12 * s * sc; tp.x += Math.sin(t * 0.8 + f.ph) * 0.04 * s; ts.set(s * sc, s * sc, s * sc); pupI.setMatrixAt(k * 2 + e, tm.compose(tp, tq, ts)); }
        for (let e = 0; e < 2; e++) { const sd = e ? 1 : -1, up = f.cheer > 0; tq.setFromEuler(te.set(0, 0, up ? sd * (2.7 + Math.sin(t * 12 + f.ph + e) * 0.4) : sd * 0.22)); tp.set(x0 + sd * 0.48 * s, y0 + (up ? 1.2 : 0.55) * s, f.z); ts.set(s, s, s); armI.setMatrixAt(k * 2 + e, tm.compose(tp, tq, ts)); }
      }
      for (const m of [bodyI, headI, hornI, eyeI, pupI, armI]) m.instanceMatrix.needsUpdate = true;
    }
    for (const sp of A.lamps) sp.material.opacity = 0.78 + Math.sin(t * 3 + sp.position.x) * 0.06;
    const R = A.rain; if (R.on) { const p = R.pos, wx = R.wind * 0.6; for (let i = 0; i < R.n; i++) { const o = i * 6, dy = 26 * dt, dx = wx * dt; p[o] += dx; p[o + 3] += dx; p[o + 1] -= dy; p[o + 4] -= dy; if (p[o + 4] < 0) { const x = Math.random() * 44 - 22 + (sky ? sky.x : 0), z = -22 + Math.random() * 32; p[o] = x; p[o + 3] = x + wx * 0.04; p[o + 2] = p[o + 5] = z; p[o + 1] = 16; p[o + 4] = 16 - 0.8; } } R.ls.geometry.attributes.position.needsUpdate = true; }
    // vuurwerk-lampjes in de lucht
    if (A.frame % 18 === 0) fx.particles.emit((Math.random() - 0.5) * 70, 6 + Math.random() * 20, -26 - Math.random() * 6, 0, 0.2, 0, { life: 3, size: 0.2, color: Math.random() < 0.5 ? 0xffd23f : 0xff6fa5, gravity: 0, shrink: false });
  };
  // vuurwerk-raket + knal in de lucht
  A.firework = (x, y, z) => {
    const cols = [[0xffe14a, 0xffffff], [0xff4fd0, 0xffffff], [0x4fe8ff, 0xffffff], [0x7dff8a, 0xffe14a]][Math.floor(Math.random() * 4)];
    fx.particles.burst(x, y, z, { count: 46, speed: 9, up: 0.6, spread: 1.1, life: 1.5, size: 0.55, colors: cols, gravity: 4 });
    fx.particles.ring(x, y, z, { count: 24, speed: 8, color: cols[0], size: 0.4, life: 1.1 });
  };
  return A;
}

// ---------------- voorwerpen ----------------
export function makeBallMesh(kind) {
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = kind === 'gold' ? '#ffd23f' : '#f6f8ff'; g.fillRect(0, 0, w, h);
    const r = mulberry32(3); g.fillStyle = kind === 'gold' ? '#c8861a' : '#1c2250';
    for (let k = 0; k < 18; k++) { const x = (k % 6) * (w / 6) + (k > 5 ? w / 12 : 0) + w / 12, y = (Math.floor(k / 6) + 0.5) * (h / 3); g.beginPath(); for (let a = 0; a < 5; a++) { const an = a / 5 * TAU + 0.3; g.lineTo(x + Math.cos(an) * 17, y + Math.sin(an) * 17); } g.closePath(); g.fill(); }
    if (kind === 'gold') { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(10, 20, 30, 6); }
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'gold' ? 0.25 : 0.4, metalness: kind === 'gold' ? 0.6 : 0.05, emissive: kind === 'gold' ? 0xb87a10 : 0x000000, emissiveIntensity: 0.5, transparent: true });
  return mesh(new THREE.SphereGeometry(1, 20, 14), m, { cast: true });
}
export function makeGlove(color = 0xff7a1a) {
  const g = new THREE.Group(); g.userData.dynamic = true; const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: 0.25 });
  g.add(mesh(new THREE.SphereGeometry(0.62, 14, 10), m, { pos: [0, 0, 0], scale: [1, 1.05, 0.8] }));
  for (let i = 0; i < 4; i++) { const a = -0.55 + i * 0.37; g.add(mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), m, { pos: [Math.sin(a) * 0.62, 0.62 + Math.cos(a) * 0.28, 0], rot: [0, 0, -a * 0.9] })); }
  g.add(mesh(new THREE.CapsuleGeometry(0.17, 0.4, 4, 8), m, { pos: [-0.7, -0.1, 0.05], rot: [0, 0, 1.0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.3, 12), mat(0xffffff), { pos: [0, -0.62, 0] }));
  return g;
}
export { Animal };

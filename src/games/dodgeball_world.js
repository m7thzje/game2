import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC, Dragon } from '../engine/chars.js';

// Wereld van het Vuurbal-Duel: kasteelhof met net, torens, toeschouwers en een draak.
// Bevat ook MB (geometrie-samenvoeger met vertexkleuren) en glowTexture, die ook door cakefight gebruikt worden.

// ---------------------------------------------------------------------------------
// MB: voeg veel kleine primitives samen tot één mesh (weinig draw calls)
// ---------------------------------------------------------------------------------
export class MB {
  constructor() {
    this.geos = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    this._e.set(rx, ry, rz); this._q.setFromEuler(this._e); this._p.set(x, y, z); this._s.set(sx, sy, sz);
    this._m.compose(this._p, this._q, this._s); g.applyMatrix4(this._m);
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    this.geos.push(g); geo.dispose();
    return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz); }
  cone(r, h, color, x = 0, y = 0, z = 0, seg = 6, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz); }
  sph(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  tor(R, r, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, ts = 6, rs = 12) { return this.add(new THREE.TorusGeometry(R, r, ts, rs), color, x, y, z, rx, ry, rz); }
  build({ basic = false, cast = true, receive = true, material = null } = {}) {
    let n = 0; for (const g of this.geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const g of this.geos) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count; g.dispose();
    }
    this.geos.length = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = material || (basic ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
    const me = new THREE.Mesh(geo, m); me.castShadow = cast && !basic; me.receiveShadow = receive && !basic; me.frustumCulled = false;
    return me;
  }
}

// zachte glans-sprite (wit; tint via SpriteMaterial.color)
let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  _glow = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  _glow.userData.keep = true;
  return _glow;
}
export function glowSprite(color = 0xffaa40, scale = 2, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity }));
  s.scale.set(scale, scale, 1); return s;
}

// ---------------------------------------------------------------------------------
// Het kasteelhof
// ---------------------------------------------------------------------------------
export const FLOOR_X = 15.6, FLOOR_Z = 9.7;

export function buildCourt(ctx, { HX, HZ }) {
  const { scene, fx, players } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const rng = mulberry32(777);
  const flames = [], banners = [], specs = [];
  const STONE = 0x8e8a96, STONE2 = 0x77737f, DARK = 0x4a3a30, WOOD = 0x6b4a2e;

  // ---- buitengrond (kasseien)
  const ground = mesh(new THREE.PlaneGeometry(220, 170), new THREE.MeshStandardMaterial({ map: tex.cobble(44, 34), color: 0x8a8484, roughness: 1 }), { cast: false, pos: [0, -0.12, 0], rot: [-Math.PI / 2, 0, 0] });
  root.add(ground);

  // ---- speelveld (canvas-textuur met helften, lijn, namen)
  const W = 1024, H = 640;
  const floorTex = canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(5);
    g.fillStyle = '#8d8478'; g.fillRect(0, 0, w, h);
    const sx = 64, sy = 40;
    for (let y = 0; y * sy < h; y++) for (let x = -1; x * sx < w; x++) {
      const ox = (y % 2) * (sx / 2); const l = 120 + r() * 38;
      g.fillStyle = `rgb(${l + 14},${l + 4},${l - 6})`; g.fillRect(x * sx + ox + 2, y * sy + 2, sx - 4, sy - 4);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x * sx + ox + 4, y * sy + 4, sx - 14, 3);
    }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(40,30,20,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 18, 2 + r() * 8, r() * 3, 0, TAU); g.fill(); }
    // helften kleuren
    g.fillStyle = 'rgba(47,158,91,.30)'; g.fillRect(0, 0, w / 2, h);
    g.fillStyle = 'rgba(58,120,224,.30)'; g.fillRect(w / 2, 0, w / 2, h);
    // veldlijnen (speelveld = HX/HZ, vloer is iets groter)
    const k = w / (FLOOR_X * 2); // pixels per eenheid
    const ex = HX * k + 14, ez = HZ * k + 14;
    g.strokeStyle = 'rgba(255,248,230,.85)'; g.lineWidth = 8; g.strokeRect(w / 2 - ex, h / 2 - ez, ex * 2, ez * 2);
    // kronen in de hoeken (cirkels met naam)
    for (let s = 0; s < 2; s++) {
      const cx = w * (s ? 0.75 : 0.25), cy = h / 2;
      g.strokeStyle = 'rgba(255,248,230,.55)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 120, 0, TAU); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
      for (let q = 0; q < 8; q++) { const a = q / 8 * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120); g.lineTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150); g.stroke(); }
      g.save(); g.translate(cx, cy); g.fillStyle = 'rgba(255,255,255,.55)'; g.font = 'bold 74px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(players[s].name).toUpperCase().slice(0, 7), 0, 0); g.restore();
    }
    // middenlijn (gloeiend)
    g.save(); g.shadowColor = '#ff8a2a'; g.shadowBlur = 22; g.strokeStyle = '#ffb347'; g.lineWidth = 12; g.beginPath(); g.moveTo(w / 2, h / 2 - ez - 4); g.lineTo(w / 2, h / 2 + ez + 4); g.stroke(); g.restore();
    g.strokeStyle = '#fff4c8'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h / 2 - ez - 4); g.lineTo(w / 2, h / 2 + ez + 4); g.stroke();
  });
  floorTex.anisotropy = 8;
  const floor = mesh(new THREE.PlaneGeometry(FLOOR_X * 2, FLOOR_Z * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }), { cast: false, pos: [0, 0.01, 0], rot: [-Math.PI / 2, 0, 0] });
  root.add(floor);
  // opstaande rand
  { const mb = new MB();
    mb.box(FLOOR_X * 2 + 1.6, 0.35, 0.8, STONE2, 0, 0.1, -FLOOR_Z - 0.4); mb.box(FLOOR_X * 2 + 1.6, 0.35, 0.8, STONE2, 0, 0.1, FLOOR_Z + 0.4);
    mb.box(0.8, 0.35, FLOOR_Z * 2, STONE2, -FLOOR_X - 0.4, 0.1, 0); mb.box(0.8, 0.35, FLOOR_Z * 2, STONE2, FLOOR_X + 0.4, 0.1, 0);
    root.add(mb.build({ cast: false })); }

  // ---- lava-randen voor sudden death (krimpende arena)
  const lavaTex = canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(9); g.fillStyle = '#b3260a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = ['#ff7a1c', '#ffd23f', '#6e1204'][i % 3]; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 14, 2 + r() * 7, r() * 3, 0, TAU); g.fill(); }
  }, { repeat: [3, 2] });
  const lavaMat = new THREE.MeshStandardMaterial({ map: lavaTex, emissive: 0xff5a10, emissiveMap: lavaTex, emissiveIntensity: 0.9, roughness: 0.6 });
  const strips = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 1), lavaMat); m.visible = false; m.position.y = 0.1; root.add(m); return m; });
  let shrinkOn = false;
  function setShrink(ex, ez) {
    shrinkOn = ex < HX - 0.05 || ez < HZ - 0.05;
    const fx_ = FLOOR_X + 0.8, fz_ = FLOOR_Z + 0.8;
    const wx = fx_ - ex, wz = fz_ - ez;
    strips.forEach((m) => { m.visible = shrinkOn; });
    if (!shrinkOn) return;
    strips[0].scale.set(wx, 1, fz_ * 2); strips[0].position.set(-(ex + wx / 2), 0.1, 0);
    strips[1].scale.set(wx, 1, fz_ * 2); strips[1].position.set(ex + wx / 2, 0.1, 0);
    strips[2].scale.set(ex * 2, 1, wz); strips[2].position.set(0, 0.1, -(ez + wz / 2));
    strips[3].scale.set(ex * 2, 1, wz); strips[3].position.set(0, 0.1, ez + wz / 2);
  }

  // ---- het net / de middenlijn
  { const mb = new MB();
    const zs = [-HZ - 0.8, -HZ / 2, 0, HZ / 2, HZ + 0.8];
    zs.forEach((z, i) => {
      const edge = i === 0 || i === zs.length - 1;
      mb.cyl(0.14, 0.2, edge ? 3.5 : 2.9, 0x5b3d24, 0, edge ? 1.75 : 1.45, z, 7);
      mb.sph(edge ? 0.32 : 0.22, 0xe8c24a, 0, edge ? 3.6 : 3.0, z, 1, 1, 1, 8, 6);
    });
    mb.cyl(0.07, 0.07, (HZ + 0.8) * 2, 0xd8372c, 0, 2.85, 0, 6, Math.PI / 2, 0, 0);
    mb.cyl(0.05, 0.05, (HZ + 0.8) * 2, 0xe8c24a, 0, 1.2, 0, 6, Math.PI / 2, 0, 0);
    root.add(mb.build()); }
  const netTex = canvasTex(256, 64, (g, w, h) => {
    g.strokeStyle = 'rgba(255,240,210,.85)'; g.lineWidth = 2;
    for (let x = -h; x < w + h; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
  }, { repeat: [1, 1] });
  const net = new THREE.Mesh(new THREE.PlaneGeometry((HZ + 0.8) * 2, 1.6), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  net.rotation.y = Math.PI / 2; net.position.set(0, 2.05, 0); root.add(net);
  // wimpels aan het net
  const pennants = [];
  for (let i = 0; i < 9; i++) {
    const z = -HZ + i * (HZ * 2 / 8);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, -0.7); sh.lineTo(0.9, -0.35); sh.lineTo(0, 0);
    const pm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x3a78e0 : 0x2f9e5b, side: THREE.DoubleSide }));
    pm.position.set(0.04, 2.85, z); pm.rotation.y = -Math.PI / 2 + 0.0; root.add(pm); pennants.push(pm);
  }

  // ---- muren en torens
  const wallMat = new THREE.MeshStandardMaterial({ map: tex.stone(14, 2), roughness: 0.95, flatShading: true });
  const back = mesh(new THREE.BoxGeometry(50, 7, 2.2), wallMat, { pos: [0, 3.5, -12.6] }); root.add(back);
  const sideL = mesh(new THREE.BoxGeometry(2, 2.4, 24), new THREE.MeshStandardMaterial({ map: tex.stone(8, 1), roughness: 0.95, flatShading: true }), { pos: [-FLOOR_X - 2.6, 1.2, -0.4] });
  const sideR = sideL.clone(); sideR.position.x = FLOOR_X + 2.6; root.add(sideL, sideR);
  const front = mesh(new THREE.BoxGeometry(40, 0.9, 1.2), wallMat, { pos: [0, 0.35, FLOOR_Z + 2.2] }); root.add(front);
  { // kantelen, kijkspleten, gloeiende ramen, deuropening
    const mb = new MB(), glowMb = new MB();
    for (let x = -24; x <= 24; x += 1.7) mb.box(1.0, 0.9, 1.0, STONE, x, 7.45, -11.8);
    for (let x = -24; x <= 24; x += 1.7) mb.box(1.0, 0.9, 1.0, STONE, x, 7.45, -13.4);
    for (const s of [-1, 1]) for (let z = -12; z <= 10.5; z += 1.9) mb.box(0.9, 0.7, 0.9, STONE, s * (FLOOR_X + 2.6), 2.75, z);
    for (let x = -18; x <= 18; x += 2.2) mb.box(1.0, 0.6, 0.5, STONE, x, 1.15, FLOOR_Z + 2.2);
    for (const x of [-16, -9, 9, 16]) { // hoge boogramen met gloed
      mb.box(1.8, 3.0, 0.5, 0x4a4650, x, 4.0, -11.4); mb.cyl(0.9, 0.9, 0.5, 0x4a4650, x, 5.5, -11.4, 10, Math.PI / 2, 0, 0);
      glowMb.box(1.3, 2.8, 0.2, 0xffc060, x, 3.95, -11.28); glowMb.cyl(0.65, 0.65, 0.2, 0xffc060, x, 5.35, -11.28, 10, Math.PI / 2, 0, 0);
      glowMb.box(0.14, 4.0, 0.25, 0x3a2a20, x, 4.2, -11.2); glowMb.box(1.3, 0.12, 0.25, 0x3a2a20, x, 4.2, -11.2);
    }
    // poort in het midden achter (koningsloge)
    mb.box(5, 0.5, 2.6, 0x6b4a2e, 0, 7.2, -12.6);
    root.add(mb.build(), glowMb.build({ basic: true })); }
  // torens met vlaggen
  for (const s of [-1, 1]) {
    const tw = P.tower(10, 2.6); tw.position.set(s * 21, 0, -12.4); root.add(tw);
    const fl = P.banner(s < 0 ? 0x2f9e5b : 0x3a78e0, 2.4, 1.2); fl.position.set(s * 21, 15.2, -12.4); fl.scale.setScalar(1.2); root.add(fl); banners.push(fl);
    const tf = P.tower(7, 2.2); tf.position.set(s * (FLOOR_X + 3.2), 0, 10.6); root.add(tf);
  }
  // vlaggen op de achtermuur
  [[-5.5, 0xd8372c], [5.5, 0xd8372c], [-11, 0x2f9e5b], [11, 0x3a78e0], [-1.6, 0xe8c24a], [1.6, 0xe8c24a]].forEach(([x, c]) => { const b = P.banner(c, 2.2, 1.0); b.position.set(x, 7.9, -12.2); root.add(b); banners.push(b); });
  // tapijten (wandkleden) aan de zijmuren: simpele gekleurde panelen
  for (const s of [-1, 1]) for (const z of [-6, 1, 7]) {
    const tapestry = mesh(new THREE.PlaneGeometry(2.0, 1.8), new THREE.MeshStandardMaterial({ map: tex.carpet(1, 1), roughness: 1 }), { cast: false, pos: [s * (FLOOR_X + 1.55), 1.3, z], rot: [0, -s * Math.PI / 2, 0] });
    root.add(tapestry);
  }

  // ---- vuurschalen en fakkels
  const braziers = [[-FLOOR_X - 0.9, -FLOOR_Z - 0.6], [FLOOR_X + 0.9, -FLOOR_Z - 0.6], [-FLOOR_X - 0.9, FLOOR_Z + 0.6], [FLOOR_X + 0.9, FLOOR_Z + 0.6], [-FLOOR_X - 0.9, 0], [FLOOR_X + 0.9, 0]];
  { const mb = new MB();
    for (const [x, z] of braziers) { mb.cyl(0.18, 0.28, 1.6, 0x2e2e3a, x, 0.8, z, 6); mb.cyl(0.7, 0.4, 0.5, 0x2a2a30, x, 1.7, z, 8); mb.tor(0.68, 0.07, 0x555560, x, 1.95, z, Math.PI / 2, 0, 0, 5, 12); }
    root.add(mb.build()); }
  for (const [x, z] of braziers) {
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.92 })); f1.position.set(x, 2.5, z);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 })); f2.position.set(x, 2.35, z);
    root.add(f1, f2); flames.push({ f1, f2, ph: rng() * 6, x, z });
  }
  const lightL = new THREE.PointLight(0xff9a50, 30, 34, 1.6); lightL.position.set(-FLOOR_X, 3.4, -4); root.add(lightL);
  const lightR = new THREE.PointLight(0xff9a50, 30, 34, 1.6); lightR.position.set(FLOOR_X, 3.4, -4); root.add(lightR);

  // ---- bergen en maan op de achtergrond
  { const mb = new MB();
    for (let i = 0; i < 14; i++) { const x = -90 + i * 14 + rng() * 6, h = 22 + rng() * 26; mb.cone(12 + rng() * 8, h, i % 3 ? 0x4a4466 : 0x5a5278, x, h / 2 - 2, -78 - rng() * 22, 6); mb.cone(5, h * 0.35, 0xe8eefc, x, h * 0.84 - 2, -78, 6); }
    root.add(mb.build({ cast: false, receive: false })); }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false })); moon.position.set(-38, 44, -110); root.add(moon);
  const moonGlow = glowSprite(0xffe9b0, 40, 0.6); moonGlow.position.copy(moon.position); root.add(moonGlow);

  // ---- toeschouwers op de muur en de koning
  const kinds = ['guard', 'jester', 'princess', 'bard', 'goblin', 'kid', 'elder', 'mason', 'sumo', 'goblin', 'guard', 'jester'];
  let ki = 0;
  for (let x = -20; x <= 20; x += 3.6) {
    if (Math.abs(x) < 3.5) continue;
    const kind = kinds[ki++ % kinds.length];
    const c = makeNPC(kind); c.group.scale.setScalar(1.35); c.group.position.set(x + (rng() - 0.5) * 0.8, 6.6, -12.4); c.pose = 'idle';
    root.add(c.group); specs.push({ c, cheerT: 0, wait: rng() * 4, base: x });
  }
  const king = makeNPC('innkeeper', { hat: 'crown', beard: 'full', beardColor: 0xe8e8e8, hair: 0xdddddd, shirt: 0xb0202a, tunic: 0xb0202a, apron: null, scale: 1.15, bodyW: 1.5 });
  king.group.scale.setScalar(1.35); king.group.position.set(0, 7.15, -12.7); king.pose = 'sit'; root.add(king.group);
  { const mb = new MB(); mb.box(2.2, 0.5, 1.6, 0xa02030, 0, 6.8, -12.8); mb.box(2.2, 3.0, 0.4, 0xa02030, 0, 8.4, -13.5); mb.box(0.3, 3.4, 0.5, 0xe8c24a, -1.2, 8.6, -13.5); mb.box(0.3, 3.4, 0.5, 0xe8c24a, 1.2, 8.6, -13.5); mb.sph(0.35, 0xe8c24a, -1.2, 10.4, -13.5); mb.sph(0.35, 0xe8c24a, 1.2, 10.4, -13.5); root.add(mb.build()); }
  specs.push({ c: king, cheerT: 0, wait: 2, base: 0, king: true });

  // ---- draak
  const dragon = new Dragon(0xb02a2a, 1.5); dragon.group.position.set(0, 16, -34); root.add(dragon.group);
  let dragonA = 0.5, roar = 0;

  // ---- sfeer: vlammen langs de middenlijn
  let emberT = 0, lineT = 0;
  function update(t, dt, intense = 0) {
    for (const f of flames) {
      const s = 1 + Math.sin(t * 13 + f.ph) * 0.14 + Math.sin(t * 7.3 + f.ph) * 0.09;
      f.f1.scale.set(1 + (s - 1) * 0.4, s, 1 + (s - 1) * 0.4); f.f1.rotation.y = t * 2 + f.ph; f.f2.scale.set(1, 1 + Math.sin(t * 17 + f.ph) * 0.2, 1);
    }
    const fl = 0.9 + Math.sin(t * 11) * 0.08 + Math.random() * 0.05; lightL.intensity = 30 * fl; lightR.intensity = 30 * (1.9 - fl);
    for (const b of banners) P.animateBanner(b, t + b.position.x);
    pennants.forEach((p, i) => { p.rotation.y = -Math.PI / 2 + Math.sin(t * 3 + i) * 0.35; });
    lavaTex.offset.set(t * 0.03, t * 0.02);
    // toeschouwers
    for (const s of specs) {
      s.cheerT = Math.max(0, s.cheerT - dt); s.wait -= dt;
      if (s.wait <= 0) { s.wait = 3 + rng() * 5; if (rng() < 0.4) s.cheerT = 0.8; }
      s.c.pose = s.cheerT > 0 ? 'cheer' : (s.king ? 'sit' : intense > 0 ? 'scared' : 'idle');
      s.c.update(dt);
    }
    // draak
    dragonA += dt * 0.28;
    const a = dragonA, dx = Math.cos(a), dz = Math.sin(a * 0.9);
    const px = dx * 36, pz = -26 + dz * 7, py = 15 + Math.sin(a * 2) * 3;
    const vx = -Math.sin(a) * 36 * 0.28, vz = Math.cos(a * 0.9) * 7 * 0.9 * 0.28;
    dragon.group.position.set(px, py, pz); dragon.group.rotation.y = Math.atan2(vx, vz); dragon.group.rotation.z = -Math.sign(vx) * 0.0 + Math.sin(a * 2) * 0.1;
    dragon.update(dt);
    if (roar > 0) { roar -= dt; if (Math.random() < dt * 60) fx.particles.emit(px + vx * 0.3, py + 1.2, pz + vz * 0.3, vx * 0.6 + (Math.random() - 0.5) * 3, -2 + Math.random() * 2, vz * 0.6 + (Math.random() - 0.5) * 3, { life: 0.9, size: 1.1, color: [0xff5a1a, 0xffb030, 0xffe070][Math.floor(Math.random() * 3)], gravity: -1 }); }
    // vonken en gloeiende as
    emberT -= dt; if (emberT <= 0) {
      emberT = 0.05;
      const f = flames[Math.floor(Math.random() * flames.length)];
      fx.particles.emit(f.x + (Math.random() - 0.5) * 0.6, 2.6, f.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, { life: 1.6, size: 0.2, color: Math.random() < 0.5 ? 0xff9a30 : 0xffd060, gravity: -0.4 });
    }
    lineT -= dt; if (lineT <= 0) { lineT = 0.16; fx.particles.emit((Math.random() - 0.5) * 0.4, 0.2, (Math.random() * 2 - 1) * HZ, 0, 1.2 + Math.random(), 0, { life: 0.7, size: 0.2, color: 0xffb347, gravity: -0.5 }); }
    if (shrinkOn && Math.random() < dt * 30) { const side = Math.random() < 0.5; const sgn = Math.random() < 0.5 ? -1 : 1; const ex = Math.abs(strips[side ? 0 : 2].position.x) || 0; void ex; fx.particles.emit(strips[side ? 0 : 1].position.x + (Math.random() - 0.5) * 2, 0.3, (Math.random() * 2 - 1) * FLOOR_Z, 0, 1.5 + Math.random(), 0, { life: 0.7, size: 0.3, color: 0xff7a20, gravity: -0.3 }); void sgn; }
  }
  function cheer(n = 1) { for (const s of specs) if (Math.random() < 0.7 * n) s.cheerT = 0.9 + Math.random() * 0.8; }
  return { root, update, setShrink, cheer, roar: () => { roar = 3; }, dragon };
}

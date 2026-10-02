import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU, rand, pick } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { skyTexture } from '../engine/lights.js';

// Omgeving van "Touwtrekken boven de Lava": een vulkaan-kasteelzaal met twee plankenklippen in een lavameer,
// een draken-schedelpoort, wimpels, fakkels, toeschouwende monsters, borrelende lava en vonken.

export const LAVA_Y = -3.4;
export const CLIFF_E = 4.6;      // x van de klifrand (aan beide kanten)

function lavaTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(77);
    g.fillStyle = '#ff7412'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7); gr.addColorStop(0, 'rgba(255,230,90,.55)'); gr.addColorStop(1, 'rgba(255,90,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const wrap = (fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
    // donkere korstplaten met gloeiende randen
    for (let i = 0; i < 44; i++) {
      const x = r() * w, y = r() * h, rx = 26 + r() * 48, ry = 16 + r() * 34, rot = r() * 3, l = 40 + r() * 34;
      const col = `rgb(${l | 0},${(l * 0.22) | 0},${(l * 0.1) | 0})`;
      wrap((ox, oy) => {
        g.fillStyle = col; g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rot, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,214,70,.7)'; g.lineWidth = 3; g.stroke();
      });
    }
    // heldere scheuren
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      let x = r() * w, y = r() * h; const pts = [[x, y]];
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 80; y += (r() - 0.5) * 80; pts.push([x, y]); }
      wrap((ox, oy) => { g.strokeStyle = `rgba(255,${190 + (r() * 0) | 0},60,.8)`; g.lineWidth = 2.5; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy))); g.stroke(); });
    }
    for (let i = 0; i < 80; i++) { const x = r() * w, y = r() * h, s = 2 + r() * 3; g.fillStyle = 'rgba(255,245,150,.9)'; g.fillRect(x, y, s, s); }
  });
}
function glowTexture(inner = 'rgba(255,200,90,.95)', mid = 'rgba(255,110,20,.35)') {
  return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, inner); gr.addColorStop(0.45, mid); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
}

function brazier() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), mat(0x2b2a33, { metalness: 0.5 }), { pos: [0, 0.75, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.45, 0.55, 8), mat(0x34323c, { metalness: 0.6, roughness: 0.5 }), { pos: [0, 1.7, 0] }));
  const f1 = mesh(new THREE.ConeGeometry(0.55, 1.5, 7), new THREE.MeshBasicMaterial({ color: 0xff8a1c, transparent: true, opacity: 0.92 }), { cast: false, pos: [0, 2.65, 0] });
  const f2 = mesh(new THREE.ConeGeometry(0.3, 1.0, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false, pos: [0, 2.35, 0] });
  g.add(f1, f2);
  const l = new THREE.PointLight(0xff8a3a, 2.2, 26, 1.5); l.position.set(0, 3.1, 1.5); g.add(l);
  g.userData = { f1, f2, l, base: 2.2 };
  return g;
}

export function buildLavaWorld(ctx, L) {
  const { scene, fx } = ctx;
  const rng = mulberry32(4242);
  const W = { banners: [], braziers: [], bubbles: [], crowd: [], rings: [] };
  scene.background = skyTexture('#12050a', '#4c1609');
  scene.fog = new THREE.Fog(0x3a1208, 36, 100);

  // ---------------- lava ----------------
  const lt = lavaTexture(); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(7, 4); lt.userData.keep = false;
  const lavaMat = new THREE.MeshStandardMaterial({ map: lt, emissiveMap: lt, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.55 });
  const lavaGeo = new THREE.PlaneGeometry(120, 64, 48, 26); lavaGeo.rotateX(-Math.PI / 2);
  const lava = new THREE.Mesh(lavaGeo, lavaMat); lava.position.set(0, LAVA_Y, 0); lava.receiveShadow = false; scene.add(lava);
  const lavaBase = Float32Array.from(lavaGeo.attributes.position.array);
  W.lava = lava;
  // gloed boven de lava
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.set(60, 16, 1); glow.position.set(0, -0.5, -4); scene.add(glow);
  const flash = new THREE.PointLight(0xff7a2a, 0, 40, 1.4); flash.position.set(0, 1.5, 3); scene.add(flash);
  W.flash = flash;

  // ---------------- klippen ----------------
  const stoneSide = new THREE.MeshStandardMaterial({ map: tex.stone(5, 1.3), color: 0xb08c80, roughness: 1, flatShading: true });
  const deckMat = new THREE.MeshStandardMaterial({ map: tex.planks(7, 3, '#9a6a3c'), roughness: 0.95 });
  const darkWood = mat(0x4a2e18);
  for (const sd of [-1, 1]) {
    const g = new THREE.Group(); g.scale.x = sd; scene.add(g);   // spiegelen rond x=0 (rechter klif = sd 1)
    const rockH = 4.2;
    g.add(mesh(new THREE.BoxGeometry(19, rockH, 12.5), stoneSide, { cast: false, pos: [CLIFF_E - 0.5 + 9.5, -0.45 - rockH / 2, 0] }));
    // uitstekende rotsblokken onder de rand
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.DodecahedronGeometry(0.9 + rng() * 0.7, 0), mat(0x6e5660), { cast: false, pos: [CLIFF_E - 0.7 - rng() * 0.6, -1.5 - rng() * 2.2, -5 + i * 2.6 + rng()], scale: [1, 0.8, 1] }));
    g.add(mesh(new THREE.BoxGeometry(15, 0.45, 10.4), deckMat, { receive: true, cast: false, pos: [CLIFF_E + 7.5, -0.225, 0] }));
    // dekbalken
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 10.8), darkWood, { cast: false, pos: [CLIFF_E + 0.2 + i * 4.4, -0.15, 0] }));
    // gebroken plankjes die over de rand hangen
    for (let i = 0; i < 5; i++) { const p = mesh(new THREE.BoxGeometry(0.9 + rng() * 0.7, 0.14, 0.7), mat(0x6e4a28), { cast: false, pos: [CLIFF_E - 0.2 - rng() * 0.3, -0.5 - rng() * 0.6, -4 + i * 2 + rng()], rot: [0, rng() - 0.5, 0.7 + rng() * 0.6] }); g.add(p); }
    // rood-wit gestreepte randpalen
    for (const z of [-4.9, 4.9]) {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.8, 6), mat(0x5a3a20), { pos: [CLIFF_E + 0.35, 0.9, z] }));
      g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0xd8372c, { flatShading: false }), { cast: false, pos: [CLIFF_E + 0.35, 1.9, z] }));
    }
    // waarschuwingsbord
    const sign = mesh(new THREE.BoxGeometry(2.2, 1.1, 0.12), new THREE.MeshStandardMaterial({ map: tex.sign('PAS OP\nLAVA!', { w: 256, h: 128, size: 40, bg: '#a82a1a', fg: '#ffe9b0' }), roughness: 0.9 }), { cast: false, pos: [CLIFF_E + 1.4, 1.5, -4.6], rot: [0, -0.25, 0] });
    sign.scale.x = sd;   // tekst niet gespiegeld
    g.add(sign, mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5), darkWood, { cast: false, pos: [CLIFF_E + 1.4, 0.8, -4.6] }));
    // rommel op de klif
    const b1 = P.barrel(1.2); b1.position.set(CLIFF_E + 11.5, 0, -4); g.add(b1);
    const b2 = P.barrel(1); b2.position.set(CLIFF_E + 12.8, 0, -3.2); g.add(b2);
    const c1 = P.crate(1.4); c1.position.set(CLIFF_E + 11.2, 0, 3.8); c1.rotation.y = 0.4; g.add(c1);
    const c2 = P.crate(1.1); c2.position.set(CLIFF_E + 12.6, 0, 4.4); g.add(c2);
    const coil = mesh(new THREE.TorusGeometry(0.7, 0.2, 6, 14), mat(0xb9904e, { flatShading: false }), { cast: false, pos: [CLIFF_E + 9.2, 0.2, -4.2], rot: [Math.PI / 2, 0, 0] }); g.add(coil);
    // brazier
    const br = brazier(); br.position.set(sd * 0 + CLIFF_E + 9.5, 0, -5.2); g.add(br); W.braziers.push(br);
  }
  // ---------------- achterwand: kasteel in de berg ----------------
  const wallM = new THREE.MeshStandardMaterial({ map: tex.stone(16, 5), color: 0x8c7a82, roughness: 1, flatShading: true });
  scene.add(mesh(new THREE.BoxGeometry(150, 46, 2), wallM, { cast: false, receive: false, pos: [0, 10, -19] }));
  scene.add(mesh(new THREE.BoxGeometry(2, 46, 60), wallM, { cast: false, receive: false, pos: [-52, 10, -3] }));
  scene.add(mesh(new THREE.BoxGeometry(2, 46, 60), wallM, { cast: false, receive: false, pos: [52, 10, -3] }));
  // boog-nissen met gloed
  const nicheGlow = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,170,60,.95)', 'rgba(210,60,10,.8)'), transparent: false, color: 0xffa860, fog: false });
  const pillarM = new THREE.MeshStandardMaterial({ map: tex.stone(1, 3), color: 0xa89098, roughness: 1, flatShading: true });
  for (const x of [-38, -22, -8, 8, 22, 38]) {
    scene.add(mesh(new THREE.CylinderGeometry(1.3, 1.5, 13, 8), pillarM, { cast: false, pos: [x - 3.4, 5, -17.6] }));
    scene.add(mesh(new THREE.CylinderGeometry(1.3, 1.5, 13, 8), pillarM, { cast: false, pos: [x + 3.4, 5, -17.6] }));
    scene.add(mesh(new THREE.TorusGeometry(3.4, 0.8, 6, 12, Math.PI), pillarM, { cast: false, pos: [x, 11.2, -17.6] }));
    scene.add(mesh(new THREE.PlaneGeometry(6.8, 13), nicheGlow, { cast: false, receive: false, pos: [x, 5.2, -18.1] }));
  }
  // grote drakenschedel boven de poort
  {
    const sk = new THREE.Group(); sk.position.set(0, 12.5, -16.2); scene.add(sk);
    const bone = mat(0xe8dcc0, { flatShading: false, roughness: 0.8 });
    sk.add(mesh(new THREE.SphereGeometry(3.4, 14, 10), bone, { cast: false, scale: [1.15, 0.85, 0.8], pos: [0, 1.2, 0] }));
    sk.add(mesh(new THREE.BoxGeometry(3.6, 1.9, 2.6), bone, { cast: false, pos: [0, -1.1, 1.0] }));
    for (let i = 0; i < 7; i++) sk.add(mesh(new THREE.ConeGeometry(0.22, 0.8, 4), mat(0xfff4dc), { cast: false, pos: [-1.5 + i * 0.5, -2.3, 2.2], rot: [Math.PI, 0, 0] }));
    for (const s of [-1, 1]) {
      sk.add(mesh(new THREE.SphereGeometry(0.85, 10, 8), mat(0x120608, { flatShading: false }), { cast: false, pos: [s * 1.45, 1.2, 2.0], scale: [1, 1.2, 0.5] }));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a18, fog: false })); eye.position.set(s * 1.45, 1.15, 2.2); sk.add(eye); W.eyes = (W.eyes || []).concat(eye);
      sk.add(mesh(new THREE.ConeGeometry(0.6, 4.2, 6), bone, { cast: false, pos: [s * 3.3, 3.7, -0.4], rot: [0, 0, -s * 0.7] }));
    }
  }
  // banieren
  for (const x of [-30, -15, 15, 30]) {
    const b = P.banner([0xc02a2a, 0x2a4a9a, 0xc08a1a][Math.abs(x / 15) | 0] || 0xc02a2a, 6, 2.2); b.position.set(x, 3.4, -17.3); scene.add(b); W.banners.push(b);
    b.traverse((o) => { o.castShadow = false; });
  }
  // stalactieten
  const rockD = mat(0x2c1c24);
  for (let i = 0; i < 22; i++) {
    const len = 5 + rng() * 9, r = 0.8 + rng() * 1.3, x = -46 + i * 4.3 + rng() * 2, z = -16 + rng() * 14;
    scene.add(mesh(new THREE.ConeGeometry(r, len, 6), rockD, { cast: false, receive: false, pos: [x, 26 - len / 2 + rng() * 2, z], rot: [Math.PI, 0, 0] }));
  }
  // balkon met toeschouwers
  scene.add(mesh(new THREE.BoxGeometry(76, 2.4, 3.6), new THREE.MeshStandardMaterial({ map: tex.stone(18, 1), color: 0x8a7078, roughness: 1, flatShading: true }), { cast: false, pos: [0, 1.2, -12.6] }));
  const kinds = ['goblin', 'skeleton', 'dwarf', 'jester', 'guard', 'goblin', 'witch', 'skeleton', 'kid', 'goblin'];
  const xs = [-26, -20, -14.5, -9, 9, 14.5, 20, 26, -31, 31];
  kinds.forEach((k, i) => {
    const c = ctx.make.npc(k); const s = 1.7 + rng() * 0.3; c.group.scale.setScalar(s); c.group.position.set(xs[i], 2.4, -12.6 + rng()); c.faceDir(0, 1); scene.add(c.group);
    W.crowd.push({ c, base: 2.4, ph: rng() * 6, hop: 0, s });
  });
  // vlammen-flits op de balkonrand
  for (const x of [-34, 34]) { const t = P.torch(); t.remove(t.userData.light); t.userData.light = null; t.position.set(x, 2.4, -12); t.scale.setScalar(2); scene.add(t); W.braziers.push(t); }

  // ---------------- lavabellen, vonken ----------------
  const bubM = new THREE.MeshBasicMaterial({ color: 0xffb030 });
  const bubG = new THREE.SphereGeometry(0.5, 8, 6);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(bubG, bubM); m.scale.set(0.01, 0.01, 0.01); scene.add(m);
    W.bubbles.push({ m, t: rng() * 3, dur: 1.4 + rng() * 1.2, x: 0, z: 0, s: 0.6 });
    const b = W.bubbles[i]; b.t = -rng() * 2;
  }
  function respawnBubble(b) { b.x = (rng() - 0.5) * 22; b.z = -9 + rng() * 18; if (Math.abs(b.x) > CLIFF_E - 0.6 && Math.abs(b.z) < 6.5) b.x = (rng() - 0.5) * 8; b.s = 0.5 + rng() * 0.9; b.dur = 1.2 + rng() * 1.3; b.t = 0; }
  W.bubbles.forEach(respawnBubble);

  let plumeT = 2, emberAcc = 0, flashV = 0;
  W.ripple = (x, z, big = 1) => {
    let r = W.rings.find((q) => !q.on);
    if (!r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 28), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; scene.add(m); r = { m, on: false, t: 0, big: 1 }; W.rings.push(r); }
    r.on = true; r.t = 0; r.big = big; r.m.position.set(x, LAVA_Y + 0.18, z); r.m.visible = true;
  };
  W.splash = (x, z, big = 1) => {
    fx.particles.burst(x, LAVA_Y + 0.2, z, { count: Math.round(110 * big), speed: 10 * Math.sqrt(big), up: 2.4, spread: 0.8, life: 1.5, size: 0.55, colors: [0xff5a0a, 0xff9a1a, 0xffd23f, 0xff3a0a, 0xfff0a0], gravity: 14 });
    fx.particles.burst(x, LAVA_Y + 0.4, z, { count: Math.round(30 * big), speed: 5, up: 1.4, spread: 1.2, life: 2.2, size: 0.3, color: 0x2a1a1a, gravity: -1.2 });  // rook
    fx.particles.ring(x, LAVA_Y + 0.3, z, { count: 30, speed: 7 * big, color: 0xffa030, size: 0.35, life: 0.8 });
    W.ripple(x, z, big); W.ripple(x, z, big * 1.5);
    flashV = 3.2 * big;
  };
  W.plume = (x, z) => {
    fx.particles.burst(x, LAVA_Y + 0.3, z, { count: 36, speed: 6, up: 3.2, spread: 0.35, life: 1.3, size: 0.4, colors: [0xff8a1c, 0xffd23f, 0xff4a0a], gravity: 12 });
    W.ripple(x, z, 0.5);
  };
  W.cheer = (on, winner = -1) => { W.crowd.forEach((q, i) => { q.cheering = on; q.c.pose = on ? 'cheer' : 'idle'; }); };
  W.gasp = () => { W.crowd.forEach((q) => { q.hop = 1; q.c.pose = 'scared'; q.gasp = 0.9; }); };

  W.update = (t, dt, camPos) => {
    // lava golven
    const pa = lavaGeo.attributes.position, arr = pa.array;
    for (let i = 0; i < pa.count; i++) {
      const x = lavaBase[i * 3], z = lavaBase[i * 3 + 2];
      arr[i * 3 + 1] = Math.sin(x * 0.25 + t * 1.1) * 0.12 + Math.sin(z * 0.35 - t * 0.9) * 0.1 + Math.sin((x + z) * 0.5 + t * 1.7) * 0.05;
    }
    pa.needsUpdate = true;
    lt.offset.x = (t * 0.012) % 1; lt.offset.y = (t * 0.006) % 1;
    lavaMat.emissiveIntensity = 0.88 + Math.sin(t * 1.3) * 0.08;
    glow.material.opacity = 0.5 + Math.sin(t * 0.9) * 0.08;
    // bellen
    for (const b of W.bubbles) {
      b.t += dt;
      if (b.t < 0) { b.m.visible = false; continue; }
      const k = b.t / b.dur;
      if (k >= 1) { fx.particles.burst(b.x, LAVA_Y + 0.2, b.z, { count: 9, speed: 3, up: 1.6, life: 0.7, size: 0.28, colors: [0xffd23f, 0xff8a1c], gravity: 9 }); respawnBubble(b); b.t = -Math.random() * 1.5; continue; }
      b.m.visible = true; const s = b.s * Math.sin(Math.min(1, k * 1.05) * Math.PI * 0.5) * (k > 0.88 ? 1 + (k - 0.88) * 3 : 1);
      b.m.scale.set(s, s * 0.7, s); b.m.position.set(b.x, LAVA_Y + 0.05 + s * 0.12, b.z);
    }
    // pluimen + vonken
    plumeT -= dt; if (plumeT <= 0) { plumeT = 2.2 + Math.random() * 2.6; const side = Math.random() < 0.5 ? -1 : 1; W.plume(side * (CLIFF_E + 1 + Math.random() * 16) * (Math.random() < 0.5 ? 1 : 0.35), -10 + Math.random() * 19); }
    emberAcc += dt * 16; while (emberAcc > 1) { emberAcc -= 1; fx.particles.emit((Math.random() - 0.5) * 34, LAVA_Y + 0.2, -9 + Math.random() * 20, (Math.random() - 0.5) * 0.8, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 0.8, { life: 2.4 + Math.random() * 1.6, size: 0.12 + Math.random() * 0.14, color: Math.random() < 0.6 ? 0xff9a2a : 0xffe07a, gravity: -0.6 }); }
    // ringen
    for (const r of W.rings) { if (!r.on) continue; r.t += dt; const k = r.t / 1.1; if (k >= 1) { r.on = false; r.m.visible = false; continue; } r.m.scale.setScalar(1 + k * 9 * r.big); r.m.material.opacity = (1 - k) * 0.8; }
    // flits
    flashV = damp(flashV, 0, 4, dt); flash.intensity = flashV;
    // fakkels
    for (const b of W.braziers) {
      const u = b.userData;
      if (u.f1) { const s = 1 + Math.sin(t * 13 + b.position.x) * 0.14 + Math.sin(t * 7.3) * 0.08; u.f1.scale.set(1, s, 1); u.f1.rotation.y = t * 2; u.f2.scale.set(1, 1 + Math.sin(t * 17 + 1) * 0.18, 1); u.l.intensity = u.base * (0.85 + Math.sin(t * 11 + b.position.x) * 0.1 + Math.random() * 0.06); }
      else if (u.flame) P.animateFire(b, t);
    }
    for (const bn of W.banners) P.animateBanner(bn, t);
    if (W.eyes) for (const e of W.eyes) e.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    // publiek
    for (const q of W.crowd) {
      if (q.gasp > 0) { q.gasp -= dt; if (q.gasp <= 0 && !q.cheering) q.c.pose = 'idle'; }
      q.hop = damp(q.hop, 0, 3, dt);
      const jump = q.cheering ? Math.abs(Math.sin(t * 7 + q.ph)) * 0.7 : q.hop * Math.abs(Math.sin(t * 9 + q.ph)) * 0.4;
      q.c.group.position.y = q.base + jump;
      q.c.update(dt);
    }
  };
  return W;
}

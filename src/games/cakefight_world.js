import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC } from '../engine/chars.js';
import { MB, glowSprite } from './dodgeball_world.js';

// De kasteelkeuken / feestzaal van het Taartengevecht.

export const HALL_X = 16.2, HALL_Z = 10.0;                 // vloer (halve afmetingen)
export const BOUNDS = { x: 15.4, z: 9.4 };                  // waar poppetjes mogen lopen (middelpunt)
export const TABLES = [{ x: 0, z: -4.1, hx: 6.6, hz: 0.95 }, { x: 0, z: 4.1, hx: 6.6, hz: 0.95 }];
export const TABLE_TOP = 1.2;
export const CART = { x: 0, z: 0, r: 1.15 };
export const STATIONS = [{ x: -12.6, z: -8.5 }, { x: 12.6, z: -8.5 }, { x: -12.6, z: 8.5 }, { x: 12.6, z: 8.5 }];
export const STATION_BOX = { hx: 1.55, hz: 0.8 };
export const LANES = [-6.6, -1.9, 1.9, 6.6];                // banen waar Bakker Bram doorheen rent
export const WALL_X = 17.2;

export function buildHall(ctx) {
  const { scene, fx } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const rng = mulberry32(4242);
  const flames = [], chandeliers = [], doors = [], npcs = [], bubbles = [], steams = [];
  const WOOD = 0x6b4a2e, WOOD2 = 0x8a5a2b, STONE = 0x9a8f86, IRON = 0x33343c, COPPER = 0xc77a3a;

  // ---- vloer
  const W = 1024, H = 632;
  const floorTex = canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(8), sq = w / (HALL_X * 2) * 1.62;
    for (let y = 0; y * sq < h; y++) for (let x = 0; x * sq < w; x++) {
      const light = (x + y) % 2 === 0; const j = (r() - 0.5) * 14;
      g.fillStyle = light ? `rgb(${238 + j},${225 + j},${200 + j})` : `rgb(${150 + j},${70 + j},${78 + j})`; g.fillRect(x * sq, y * sq, sq + 1, sq + 1);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x * sq + 3, y * sq + 3, sq - 12, 3);
    }
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(60,30,20,${0.03 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 14, 2 + r() * 6, r() * 3, 0, TAU); g.fill(); }
    // gouden medaillon in het midden en loper
    g.save(); g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(230,190,80,.75)'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 100, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 118, 0, TAU); g.stroke();
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 100, Math.sin(a) * 100); g.lineTo(Math.cos(a) * 118, Math.sin(a) * 118); g.stroke(); } g.restore();
    // startplekken
    for (const [sx, col] of [[-12, 'rgba(47,158,91,.5)'], [12, 'rgba(58,120,224,.5)']]) { g.fillStyle = col; g.beginPath(); g.arc(w / 2 + sx * (w / (HALL_X * 2)), h / 2, 46, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 4; g.stroke(); }
  });
  floorTex.anisotropy = 8;
  root.add(mesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_Z * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }), { cast: false, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0] }));
  root.add(mesh(new THREE.PlaneGeometry(200, 160), mat(0x2a1c18), { cast: false, pos: [0, -0.1, 0], rot: [-Math.PI / 2, 0, 0] }));

  // ---- muren
  const brickMat = new THREE.MeshStandardMaterial({ map: tex.bricks(14, 3), color: 0xe8d8c8, roughness: 0.95, flatShading: true });
  root.add(mesh(new THREE.BoxGeometry(HALL_X * 2 + 6, 8, 1.6), brickMat, { pos: [0, 4, -HALL_Z - 0.9] }));
  for (const s of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(1.6, 7, HALL_Z * 2 + 3), new THREE.MeshStandardMaterial({ map: tex.bricks(8, 3), color: 0xe0d0c0, roughness: 0.95, flatShading: true }), { pos: [s * (WALL_X + 0.8), 3.5, -0.4] }));
  // lage balustrade vooraan + plint
  { const mb = new MB();
    mb.box(HALL_X * 2 + 4, 1.0, 0.6, 0x8a6a50, 0, 0.5, HALL_Z + 1.2);
    for (let x = -HALL_X; x <= HALL_X + 0.1; x += 2.7) { mb.cyl(0.22, 0.28, 1.5, 0xc8b8a0, x, 0.75, HALL_Z + 1.2, 8); mb.sph(0.3, 0xc8b8a0, x, 1.6, HALL_Z + 1.2); }
    mb.box(HALL_X * 2 + 4, 0.7, 0.5, 0x6b4a2e, 0, 0.35, -HALL_Z - 0.0); // plint achter
    root.add(mb.build({ cast: false })); }

  // ---- open haard + ketel (achtermuur midden)
  { const mb = new MB(), gl = new MB();
    mb.box(7.2, 5.6, 1.2, 0x7a6a62, 0, 2.8, -HALL_Z - 0.0); mb.box(4.4, 3.2, 1.4, 0x1a1210, 0, 1.7, -HALL_Z + 0.05);
    mb.cyl(2.2, 2.2, 1.4, 0x1a1210, 0, 3.3, -HALL_Z + 0.05, 14, Math.PI / 2, 0, 0);
    for (let k = 0; k < 8; k++) mb.box(0.9, 0.7, 0.5, 0x9a8a80, -3.2 + k * 0.9, 5.7, -HALL_Z + 0.35);
    mb.box(1.6, 0.35, 0.8, 0x5b3d24, 0, 5.2, -HALL_Z + 0.5);
    // sintelend houtvuur
    for (let k = 0; k < 5; k++) mb.cyl(0.14, 0.14, 1.6, 0x4a3220, -0.9 + k * 0.45, 0.35, -HALL_Z + 0.6, 6, 0, 0, Math.PI / 2 * (k % 2 ? 0.95 : 1.1));
    gl.box(3.6, 0.5, 0.4, 0xff8a2a, 0, 0.35, -HALL_Z + 0.35);
    root.add(mb.build(), gl.build({ basic: true }));
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 })); fire.position.set(0, 1.4, -HALL_Z + 0.6);
    const fire2 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 })); fire2.position.set(0, 1.1, -HALL_Z + 0.7);
    const fire3 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.85 })); fire3.position.set(-1.0, 1.1, -HALL_Z + 0.6);
    root.add(fire, fire2, fire3); flames.push({ m: fire, ph: 0, k: 1 }, { m: fire2, ph: 2, k: 1 }, { m: fire3, ph: 4, k: 1 });
    const caul = P.cauldron(0x9aff6a); caul.scale.setScalar(1.3); caul.position.set(0, 1.1, -HALL_Z + 0.9); root.add(caul);
    const fl = new THREE.PointLight(0xff8a40, 40, 30, 1.6); fl.position.set(0, 2.6, -HALL_Z + 2.5); root.add(fl); flames.fireLight = fl;
  }
  // ---- gloeiende boograampjes + wandkleden
  { const mb = new MB(), gl = new MB();
    for (const x of [-14, -9.2, 9.2, 14]) {
      mb.box(2.0, 3.4, 0.5, 0x5a4a44, x, 4.6, -HALL_Z - 0.0); mb.cyl(1.0, 1.0, 0.5, 0x5a4a44, x, 6.3, -HALL_Z, 12, Math.PI / 2, 0, 0);
      gl.box(1.5, 3.2, 0.2, 0xffd890, x, 4.5, -HALL_Z + 0.2); gl.cyl(0.75, 0.75, 0.2, 0xffd890, x, 6.1, -HALL_Z + 0.2, 12, Math.PI / 2, 0, 0);
      gl.box(0.12, 4.5, 0.22, 0x4a3a30, x, 5.0, -HALL_Z + 0.25); gl.box(1.5, 0.12, 0.22, 0x4a3a30, x, 4.8, -HALL_Z + 0.25);
    }
    // pannenrek
    for (const x of [-5.6, 5.6]) {
      mb.box(3.4, 0.12, 0.2, 0x3a2a20, x, 5.2, -HALL_Z + 0.5);
      for (let k = 0; k < 5; k++) { const px = x - 1.4 + k * 0.7; mb.cyl(0.04, 0.04, 0.45, IRON, px, 4.95, -HALL_Z + 0.5, 4); mb.cyl(0.28 + (k % 2) * 0.08, 0.28 + (k % 2) * 0.08, 0.14, k % 2 ? COPPER : 0xb8b8c4, px, 4.6 - (k % 3) * 0.1, -HALL_Z + 0.55, 12, Math.PI / 2, 0, 0); mb.box(0.06, 0.4, 0.06, IRON, px, 4.3, -HALL_Z + 0.6); }
    }
    // planken met potten
    for (const x of [-11.6, 11.6]) for (const y of [3.0, 4.3]) {
      mb.box(3.0, 0.12, 0.7, WOOD, x, y, -HALL_Z + 0.5);
      for (let k = 0; k < 6; k++) { const col = [0xd85a5a, 0xe8c24a, 0x6ac26a, 0xd89a5a, 0x8a6ad8, 0xf0f0e0][(k + (x > 0 ? 2 : 0)) % 6]; mb.cyl(0.2, 0.2, 0.42, col, x - 1.2 + k * 0.48, y + 0.27, -HALL_Z + 0.5, 7); mb.cyl(0.13, 0.13, 0.1, 0x9a7a4a, x - 1.2 + k * 0.48, y + 0.52, -HALL_Z + 0.5, 6); }
    }
    // slingers (vlaggetjes) langs de achtermuur
    for (let x = -15; x < 15; x += 1.2) { const sag = Math.sin((x + 15) / 30 * Math.PI) * -0.6; mb.cone(0.3, 0.6, [0xd8372c, 0xe8c24a, 0x2f9e5b, 0x3a78e0, 0xff7ab8][Math.floor((x + 15) / 1.2) % 5], x, 7.0 + sag, -HALL_Z + 0.6, 3, Math.PI, 0, 0); }
    root.add(mb.build(), gl.build({ basic: true })); }
  // deuren in de zijmuren (Bakker Bram stormt hier doorheen)
  for (const s of [-1, 1]) for (let li = 0; li < LANES.length; li++) {
    const g = new THREE.Group(); g.position.set(s * (WALL_X - 0.05), 0, LANES[li]); g.rotation.y = -s * Math.PI / 2; root.add(g);
    const mb = new MB(); mb.box(0.3, 3.4, 0.3, 0x4a3220, -1.15, 1.7, 0); mb.box(0.3, 3.4, 0.3, 0x4a3220, 1.15, 1.7, 0); mb.box(2.6, 0.35, 0.3, 0x4a3220, 0, 3.4, 0); mb.box(2.2, 3.1, 0.15, 0x0a0806, 0, 1.55, -0.1); g.add(mb.build({ cast: false }));
    const leaves = [-1, 1].map((sd) => { const lv = new THREE.Group(); lv.position.set(sd * 1.1, 0, 0.05); const sl = mesh(new THREE.BoxGeometry(1.05, 2.4, 0.1), new THREE.MeshStandardMaterial({ map: tex.planks(1, 2, '#9a6a3a'), roughness: 0.9 }), { pos: [-sd * 0.52, 1.45, 0], cast: false }); lv.add(sl); g.add(lv); return { lv, sd }; });
    doors.push({ g, leaves, side: s, lane: li, open: 0, target: 0 });
  }

  // ---- tafels
  const clothTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#fdf6ea'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(210,60,70,.55)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h); for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 16); }, { repeat: [1, 1] });
  for (const t of TABLES) {
    const cl = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95 });
    root.add(mesh(new THREE.BoxGeometry(t.hx * 2 + 0.2, 0.12, t.hz * 2 + 0.2), cl, { pos: [t.x, TABLE_TOP, t.z] }));
    root.add(mesh(new THREE.BoxGeometry(t.hx * 2 + 0.2, TABLE_TOP - 0.1, 0.06), cl, { pos: [t.x, (TABLE_TOP - 0.1) / 2 + 0.05, t.z + t.hz + 0.08] }));
    root.add(mesh(new THREE.BoxGeometry(t.hx * 2 + 0.2, TABLE_TOP - 0.1, 0.06), cl, { pos: [t.x, (TABLE_TOP - 0.1) / 2 + 0.05, t.z - t.hz - 0.08] }));
    root.add(mesh(new THREE.BoxGeometry(0.06, TABLE_TOP - 0.1, t.hz * 2 + 0.2), cl, { pos: [t.x - t.hx - 0.1, (TABLE_TOP - 0.1) / 2 + 0.05, t.z] }));
    root.add(mesh(new THREE.BoxGeometry(0.06, TABLE_TOP - 0.1, t.hz * 2 + 0.2), cl, { pos: [t.x + t.hx + 0.1, (TABLE_TOP - 0.1) / 2 + 0.05, t.z] }));
    // tafelversiering (samengevoegd)
    const mb = new MB();
    for (let k = 0; k < 7; k++) {
      const x = t.x - t.hx + 1.0 + k * ((t.hx * 2 - 2.0) / 6), z = t.z + (k % 2 ? 0.3 : -0.3);
      mb.cyl(0.42, 0.34, 0.07, 0xffffff, x, TABLE_TOP + 0.09, z, 12); mb.cyl(0.3, 0.3, 0.05, [0xf0c0c0, 0xc0d8f0, 0xf0e0a0][k % 3], x, TABLE_TOP + 0.14, z, 10);
      if (k % 2) { mb.cyl(0.07, 0.07, 0.5, 0xf5ecd0, x + 0.9, TABLE_TOP + 0.35, z, 6); }
      else mb.sph(0.2, [0xd8372c, 0xe8a030, 0x7ac040][k % 3], x + 0.8, TABLE_TOP + 0.3, z, 1, 0.9, 1);
    }
    root.add(mb.build({ cast: false }));
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), new THREE.MeshBasicMaterial({ color: 0xffd060 })); c.position.set(t.x - t.hx + 2.0 + k * 3.0, TABLE_TOP + 0.75, t.z + (k % 2 ? 0.3 : -0.3)); root.add(c); flames.push({ m: c, ph: rng() * 6, k: 0.5 }); }
  }

  // ---- taartenstations
  const stationVis = [];
  const awning = (x, z, col) => {
    const mb = new MB(); const s = z < 0 ? 1 : -1;      // s: kijkt naar het midden
    mb.box(3.1, 1.0, 1.5, WOOD2, x, 0.5, z); mb.box(3.3, 0.12, 1.7, 0xf4e8d0, x, 1.06, z);
    for (const sx of [-1.45, 1.45]) mb.cyl(0.07, 0.07, 2.9, 0xd8c8a8, x + sx, 2.0, z - s * 0.5, 6);
    for (let k = 0; k < 8; k++) mb.box(0.4, 0.1, 1.6, k % 2 ? 0xffffff : col, x - 1.4 + k * 0.4, 3.35, z - s * 0.3, 0, s * -0.12);
    for (let k = 0; k < 8; k++) mb.cone(0.2, 0.3, k % 2 ? 0xffffff : col, x - 1.4 + k * 0.4, 3.1, z + s * 0.55, 4, Math.PI, Math.PI / 4, 0);
    // taartjes in de vitrine
    const cols = [0xfff0f4, 0xffd24a, 0xff9ac0, 0xd8a070];
    for (let k = 0; k < 4; k++) { mb.cyl(0.32, 0.32, 0.22, 0xe8d0a8, x - 1.0 + k * 0.67, 1.24, z + s * 0.1, 10); mb.sph(0.3, cols[k], x - 1.0 + k * 0.67, 1.4, z + s * 0.1, 1, 0.7, 1); mb.sph(0.07, 0xd8372c, x - 1.0 + k * 0.67, 1.58, z + s * 0.1); }
    return mb.build();
  };
  STATIONS.forEach((st, k) => {
    root.add(awning(st.x, st.z, k % 2 ? 0xd8372c : 0x3a78e0));
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.0, 40), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(st.x, 0.05, st.z + (st.z < 0 ? 2.0 : -2.0)); root.add(ring);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex('TAART!'), transparent: true, depthTest: false })); icon.scale.set(2.6, 1.0, 1); icon.position.set(st.x, 4.2, st.z + (st.z < 0 ? 0.6 : -0.6)); icon.renderOrder = 14; root.add(icon);
    stationVis.push({ ring, icon, x: st.x, z: st.z, cx: st.x, cz: st.z + (st.z < 0 ? 2.0 : -2.0) });
  });
  // bruidskar in het midden
  const cart = new THREE.Group(); cart.position.set(CART.x, 0, CART.z); root.add(cart);
  { const mb = new MB();
    mb.cyl(1.2, 1.3, 0.8, 0x7a3a4a, 0, 0.55, 0, 14); mb.cyl(1.25, 1.25, 0.12, 0xe8c24a, 0, 0.98, 0, 14); mb.cyl(0.12, 0.12, 0.3, 0xe8c24a, 0, 1.1, 0, 6);
    for (const a of [0, 1, 2, 3]) mb.cyl(0.26, 0.26, 0.12, 0x3a2a20, Math.cos(a * 1.57 + 0.78) * 1.0, 0.26, Math.sin(a * 1.57 + 0.78) * 1.0, 10, Math.PI / 2, 0, 0);
    // 3-laagse bruidstaart als uithangbord
    mb.cyl(0.95, 0.95, 0.5, 0xfff8f0, 0, 1.4, 0, 16); mb.cyl(0.7, 0.7, 0.45, 0xffe4ee, 0, 1.9, 0, 14); mb.cyl(0.45, 0.45, 0.4, 0xfff8f0, 0, 2.35, 0, 12);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; mb.sph(0.1, 0xff9ac0, Math.cos(a) * 0.95, 1.65, Math.sin(a) * 0.95); mb.sph(0.08, 0xff9ac0, Math.cos(a) * 0.7, 2.14, Math.sin(a) * 0.7); }
    mb.sph(0.12, 0xd8372c, 0, 2.65, 0); mb.cone(0.12, 0.35, 0x2a2a3a, -0.1, 2.9, 0, 6); mb.cone(0.12, 0.3, 0xffffff, 0.1, 2.88, 0, 6);
    cart.add(mb.build());
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.8, roughness: 0.3, emissive: 0x806000 })); crown.rotation.x = Math.PI / 2; crown.position.y = 3.15; cart.add(crown); }
  const cartRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.25, 40), new THREE.MeshBasicMaterial({ color: 0xff7ab8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); cartRing.rotation.x = -Math.PI / 2; cartRing.position.set(CART.x, 0.05, CART.z); root.add(cartRing);
  const cartIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex('BRUIDSKAR'), transparent: true, depthTest: false })); cartIcon.scale.set(3.2, 1.2, 1); cartIcon.position.set(CART.x, 4.6, CART.z + 0.2); cartIcon.renderOrder = 14; root.add(cartIcon);

  // ---- kroonluchters
  for (const x of [-9.5, 0, 9.5]) {
    const g = new THREE.Group(); g.position.set(x, 8.2, -7.8); root.add(g);
    const mb = new MB(); mb.cyl(0.04, 0.04, 6, 0x3a3a44, 0, 3, 0, 4); mb.tor(1.5, 0.09, 0xe8c24a, 0, 0, 0, Math.PI / 2, 0, 0, 6, 18); mb.tor(0.8, 0.07, 0xe8c24a, 0, 0.25, 0, Math.PI / 2, 0, 0, 6, 14); mb.cyl(0.05, 0.05, 0.9, 0xe8c24a, 0, -0.1, 0, 5);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; mb.cyl(0.07, 0.07, 0.36, 0xf5ecd0, Math.cos(a) * 1.5, 0.28, Math.sin(a) * 1.5, 6); mb.sph(0.07, 0xc8e8ff, Math.cos(a) * 1.5, -0.35, Math.sin(a) * 1.5); }
    g.add(mb.build({ cast: false }));
    const gl = new THREE.Group(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 5), new THREE.MeshBasicMaterial({ color: 0xffd060 })); f.position.set(Math.cos(a) * 1.5, 0.6, Math.sin(a) * 1.5); gl.add(f); flames.push({ m: f, ph: rng() * 6, k: 0.3 }); } g.add(gl);
    const halo = glowSprite(0xffd890, 7, 0.5); halo.position.y = 0.4; g.add(halo);
    chandeliers.push({ g, ph: rng() * 6 });
  }
  const chL = new THREE.PointLight(0xffd8a0, 26, 36, 1.4); chL.position.set(-8, 6.5, -2); root.add(chL);
  const chR = new THREE.PointLight(0xffd8a0, 26, 36, 1.4); chR.position.set(8, 6.5, -2); root.add(chR);

  // ---- decor: tonnen, kratten, zakken
  { const spots = [[-15.2, -5.8, 'barrel'], [-15.0, -4.8, 'barrel'], [15.2, -5.8, 'barrel'], [15.0, 5.6, 'sack'], [-15.0, 5.6, 'sack'], [-15.3, 0.5, 'crate'], [15.3, -0.5, 'crate'], [-15.4, 4.4, 'barrel'], [15.4, 4.5, 'barrel']];
    for (const [x, z, k] of spots) { const o = k === 'barrel' ? P.barrel(1.1) : k === 'sack' ? P.sack(1.3) : P.crate(1.2); o.position.set(x, 0, z); o.rotation.y = rng() * 6; root.add(o); } }

  // ---- bewoners: koks, nar op de tafel
  const addNpc = (kind, x, y, z, pose, ov = {}, sc = 1.4, ry = 0) => { const c = makeNPC(kind, ov); c.group.scale.setScalar(sc); c.group.position.set(x, y, z); c.group.rotation.y = ry; c.pose = pose; c.targetYaw = ry; c.yaw = ry; root.add(c.group); npcs.push({ c, pose, base: y, ph: rng() * 6 }); return c; };
  addNpc('goblin', -2.7, 0, -8.2, 'carry', { hat: 'chef', hatColor: 0xffffff }, 1.7);
  addNpc('goblin', 2.7, 0, -8.2, 'carry', { hat: 'chef', hatColor: 0xffffff, shirt: 0x8a3a3a }, 1.7);
  const jester = addNpc('jester', -3.5, TABLE_TOP + 0.1, -4.1, 'dance', {}, 1.1);
  const jester2 = addNpc('princess', 3.2, TABLE_TOP + 0.1, 4.1, 'dance', {}, 1.0);
  void jester; void jester2;

  // ---- Bakker Bram (NPC) met reuzentaart
  const bram = makeNPC('baker', { scale: 1.5, bodyW: 1.5 }); bram.pose = 'hands_up'; bram.group.visible = false; root.add(bram.group);
  const bigCake = new THREE.Group();
  { const mb = new MB(); mb.cyl(1.5, 1.6, 0.7, 0xf0d8b0, 0, 0.35, 0, 18); mb.cyl(1.4, 1.4, 0.55, 0xffffff, 0, 0.95, 0, 18); mb.cyl(1.0, 1.0, 0.5, 0xff9ac0, 0, 1.45, 0, 16); mb.cyl(0.62, 0.62, 0.45, 0xffffff, 0, 1.9, 0, 14);
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; mb.sph(0.16, 0xff5a8a, Math.cos(a) * 1.4, 1.25, Math.sin(a) * 1.4); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; mb.sph(0.13, 0xffe14a, Math.cos(a) * 0.98, 1.72, Math.sin(a) * 0.98); }
    mb.sph(0.2, 0xd8372c, 0, 2.3, 0); bigCake.add(mb.build()); }
  bigCake.visible = false; root.add(bigCake);

  // ---- update
  let bubT = 0, stirT = 0;
  function update(t, dt) {
    for (const f of flames) { const s = 1 + Math.sin(t * 13 + f.ph) * 0.14 * f.k + Math.sin(t * 7.3 + f.ph) * 0.09 * f.k; f.m.scale.set(1, s, 1); f.m.rotation.y = t * 2 + f.ph; }
    if (flames.fireLight) flames.fireLight.intensity = 40 * (0.9 + Math.sin(t * 11) * 0.08 + Math.random() * 0.05);
    for (const c of chandeliers) { c.g.rotation.z = Math.sin(t * 0.8 + c.ph) * 0.04; c.g.rotation.x = Math.cos(t * 0.65 + c.ph) * 0.04; }
    for (const n of npcs) { if (n.pose === 'carry') { n.c.pose = 'carry'; n.c.group.rotation.y = Math.sin(t * 2 + n.ph) * 0.25; n.c.targetYaw = n.c.group.rotation.y; n.c.yaw = n.c.group.rotation.y; } n.c.update(dt); n.c.group.rotation.y = n.c.yaw; }
    // ketel: bellen en stoom
    bubT -= dt; if (bubT <= 0) { bubT = 0.09; fx.particles.emit((Math.random() - 0.5) * 1.3, 2.4, -HALL_Z + 0.9 + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 1.4 + Math.random(), 0, { life: 0.9, size: 0.34, color: Math.random() < 0.5 ? 0xb8ff8a : 0xe8ffe0, gravity: -0.5 }); }
    stirT -= dt; if (stirT <= 0) { stirT = 0.4; fx.particles.emit(-1.5 + Math.random() * 3, 5.8, -HALL_Z + 1, 0, 1.6, 0, { life: 1.6, size: 0.55, color: 0x777777, gravity: -0.2 }); }
    // deuren
    for (const d of doors) { d.open += (d.target - d.open) * (1 - Math.exp(-9 * dt)); const a = d.open * 1.35 + Math.sin(t * 4 + d.lane) * 0.01; d.leaves[0].lv.rotation.y = a; d.leaves[1].lv.rotation.y = -a; }
    for (const s of stationVis) { s.icon.position.y = 4.2 + Math.sin(t * 3 + s.x) * 0.12; }
    cartIcon.position.y = 4.8 + Math.sin(t * 2.6) * 0.14;
  }
  function setDoor(side, lane, v) { for (const d of doors) if (d.side === side && d.lane === lane) d.target = v; }
  return { root, update, setDoor, bram, bigCake, stationVis, cartRing, cartIcon, cart, npcs };
}

const _icons = {};
function iconTex(text) {
  if (_icons[text]) return _icons[text];
  const t = canvasTex(256, 96, (g, w, h) => {
    g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(40,10,20,.9)'; g.strokeText(text, w / 2, h / 2, w - 10);
    g.fillStyle = '#fff2c0'; g.fillText(text, w / 2, h / 2, w - 10);
  });
  t.userData.keep = true; _icons[text] = t; return t;
}

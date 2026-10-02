import * as THREE from 'three';
import { mat, mesh, clamp, lerp, TAU, canvasTex, mulberry32, glow } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';

// Bouwstenen voor Stoelendans: gouden troonzaal, stoelen, valluik, springplank, trofee.

const GOLD = new THREE.MeshStandardMaterial({ color: 0xe8b83a, roughness: 0.32, metalness: 0.85, flatShading: false });
const DEEP_RED = 0x9a1c2c;

// ---------------------------------------------------------------- vloer
function mosaicTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#7a1424'; g.fillRect(0, 0, w, h);
    // ringen
    const rings = [[500, '#d8a62e'], [470, '#7a1424'], [440, '#2a2a6a'], [410, '#e8c25a'], [370, '#7a1424'], [150, '#e8c25a']];
    for (const [r, col] of rings) { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill(); }
    // taartpunten
    for (let i = 0; i < 24; i++) {
      const a0 = i / 24 * TAU, a1 = (i + 1) / 24 * TAU;
      g.fillStyle = i % 2 ? '#2a2a6a' : '#b8142c';
      g.beginPath(); g.arc(c, c, 365, a0, a1); g.arc(c, c, 160, a1, a0, true); g.closePath(); g.fill();
      g.strokeStyle = '#f2d276'; g.lineWidth = 4; g.stroke();
    }
    // midden: kroon
    g.fillStyle = '#7a1424'; g.beginPath(); g.arc(c, c, 128, 0, TAU); g.fill();
    g.fillStyle = '#f2d276'; g.beginPath(); g.moveTo(c - 80, c + 40); g.lineTo(c - 80, c - 30); g.lineTo(c - 40, c + 5); g.lineTo(c, c - 60); g.lineTo(c + 40, c + 5); g.lineTo(c + 80, c - 30); g.lineTo(c + 80, c + 40); g.closePath(); g.fill();
    g.fillStyle = '#b8142c'; for (const dx of [-60, 0, 60]) { g.beginPath(); g.arc(c + dx, c + 22, 9, 0, TAU); g.fill(); }
    // glans
    const gr = g.createRadialGradient(c, c, 10, c, c, 520); gr.addColorStop(0, 'rgba(255,240,180,.25)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function glassTexture(hue) {
  return canvasTex(128, 256, (g, w, h) => {
    const r = mulberry32(hue);
    g.fillStyle = '#1a1020'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = `hsl(${(hue + r() * 80) % 360},75%,${50 + r() * 20}%)`; g.fillRect(x * 32 + 3, y * 32 + 3, 26, 26); }
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, 0, w, 40);
  });
}
function tagTexture(text, css) {
  return canvasTex(256, 72, (g, w, h) => {
    g.font = 'bold 46px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 11; g.strokeStyle = 'rgba(20,8,30,.92)'; g.lineJoin = 'round';
    g.strokeText(text, w / 2, h / 2, w - 12); g.fillStyle = css; g.fillText(text, w / 2, h / 2, w - 12);
  });
}
export function tagSprite(text, css, scale = 2.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(text, css), transparent: true, depthTest: false }));
  s.scale.set(scale, scale * 72 / 256, 1); s.renderOrder = 24; return s;
}
export function bigLabel(text, css = '#fff', w = 512, h = 128, size = 80, scaleX = 8) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
  s.scale.set(scaleX, scaleX * h / w, 1); s.renderOrder = 26;
  s.userData.draw = (t, col = css) => {
    if (s.userData.last === t + col) return; s.userData.last = t + col;
    const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
    g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = 'rgba(20,8,30,.92)'; g.lineJoin = 'round';
    g.strokeText(t, w / 2, h / 2, w - 16); g.fillStyle = col; g.fillText(t, w / 2, h / 2, w - 16); tx.needsUpdate = true;
  };
  s.userData.draw(text, css);
  return s;
}

// ---------------------------------------------------------------- troonzaal
export function buildHall(scene) {
  const grp = new THREE.Group(); scene.add(grp);
  const add = (m) => { grp.add(m); return m; };
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(10, 3), roughness: 0.95, flatShading: true, color: 0xcdbfd0 });
  // vloer buiten
  add(mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshStandardMaterial({ map: tex.tiles(22, 17, '#6a5a72', '#3a2f44'), roughness: 0.6, metalness: 0.15 }), { cast: false, pos: [0, -0.02, -8], rot: [-Math.PI / 2, 0, 0] }));
  // arena
  const mosaic = mosaicTexture();
  const top = new THREE.Mesh(new THREE.CircleGeometry(8.9, 64), new THREE.MeshStandardMaterial({ map: mosaic, roughness: 0.35, metalness: 0.35 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.52; top.receiveShadow = true; grp.add(top);
  add(mesh(new THREE.CylinderGeometry(9.1, 9.4, 0.48, 64), mat(0x6a4a2a, { flatShading: false }), { pos: [0, 0.24, 0] }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9.0, 0.2, 8, 80), GOLD); rim.rotation.x = Math.PI / 2; rim.position.y = 0.55; grp.add(rim);
  // loper naar de troon
  add(mesh(new THREE.PlaneGeometry(4.6, 14), new THREE.MeshStandardMaterial({ map: tex.carpet(1, 4), roughness: 0.9 }), { cast: false, pos: [0, 0.03, -17.2], rot: [-Math.PI / 2, 0, 0] }));
  // achtermuur
  add(mesh(new THREE.BoxGeometry(70, 20, 1.2), stoneM, { pos: [0, 10, -25], receive: true }));
  for (const sx of [-1, 1]) add(mesh(new THREE.BoxGeometry(1.2, 20, 60), stoneM, { pos: [sx * 33, 10, -5] }));
  // ramen met gebrandschilderd glas + lichtbundels
  const beams = [];
  [-17, 0, 17].forEach((x, k) => {
    const hue = [200, 20, 300][k];
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 9), new THREE.MeshStandardMaterial({ map: glassTexture(hue), emissive: 0xffffff, emissiveMap: glassTexture(hue), emissiveIntensity: 0.9 }));
    win.position.set(x, 9, -24.35); grp.add(win);
    add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.4, 14, 1, false, 0, Math.PI), stoneM, { pos: [x, 13.5, -24.3], rot: [Math.PI / 2, 0, 0], cast: false }));
    add(mesh(new THREE.BoxGeometry(5.4, 0.5, 0.7), mat(0x8a7a6a), { pos: [x, 4.4, -24.2], cast: false }));
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(4, 22), new THREE.MeshBasicMaterial({ color: 0xffe8a8, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(x * 0.7, 8, -17); beam.rotation.set(-0.5, 0, x * -0.012); grp.add(beam); beams.push(beam);
  });
  // pilaren + toortsen
  const flames = [];
  for (const [x, z] of [[-24, -22], [-12, -22.6], [12, -22.6], [24, -22], [-29, -12], [29, -12], [-29, 4], [29, 4]]) {
    const col = new THREE.Group(); col.position.set(x, 0, z); grp.add(col);
    col.add(mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.0, 10), mat(0x8a7a6a), { pos: [0, 0.5, 0] }));
    col.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 14, 12), new THREE.MeshStandardMaterial({ map: tex.stone(1, 4), roughness: 0.9, flatShading: true, color: 0xe0d0e0 }), { pos: [0, 7.5, 0] }));
    col.add(mesh(new THREE.CylinderGeometry(1.3, 0.95, 1.0, 12), GOLD, { pos: [0, 14.5, 0] }));
    // toorts
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffb030 })); f.position.set(0, 5.6, 1.15); col.add(f); flames.push(f);
    col.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6), mat(0x4a3220), { pos: [0, 5.0, 1.0] }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })); halo.scale.set(4, 4, 1); halo.position.set(0, 5.7, 1.2); col.add(halo);
  }
  // banieren
  [-8, 8, -24, 24].forEach((x, k) => { const b = P.banner(k % 2 ? 0x2f6fe0 : DEEP_RED, 5, 1.7); b.position.set(x, 6.5, -24.2); b.scale.setScalar(1.15); grp.add(b); beams.push(b); b.userData.isBanner = true; });
  // balkons voor de uitgevallen spelers
  const balcony = [];
  for (const sx of [-1, 1]) {
    const bx = sx * 14.6;
    add(mesh(new THREE.BoxGeometry(7, 1.6, 10), mat(0x5a3a2a), { pos: [bx, 0.8, -3] }));
    add(mesh(new THREE.BoxGeometry(7.4, 0.2, 10.4), GOLD, { pos: [bx, 1.65, -3] }));
    for (let i = 0; i < 6; i++) add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 6), GOLD, { pos: [bx - sx * 3.4, 2.4, -7.5 + i * 1.8] }));
    add(mesh(new THREE.BoxGeometry(0.2, 0.18, 10), GOLD, { pos: [bx - sx * 3.4, 3.1, -3] }));
    // bankjes
    for (let k = 0; k < 3; k++) { balcony.push({ x: bx + sx * 0.8, z: -6 + k * 2.6, y: 1.75, face: -sx }); }
    // vlag boven de balkons
  }
  // troon + podium
  const thr = new THREE.Group(); thr.position.set(0, 0, -21); grp.add(thr);
  thr.add(mesh(new THREE.CylinderGeometry(4.6, 5, 0.6, 24), mat(0x7a5a3a), { pos: [0, 0.3, 0] }));
  thr.add(mesh(new THREE.CylinderGeometry(3.6, 4, 0.6, 24), mat(0x9a7a4a), { pos: [0, 0.9, 0] }));
  const throne = makeChair('golden'); throne.group.scale.setScalar(2.3); throne.group.position.set(0, 1.2, 0); thr.add(throne.group);
  // lampionnen/slingers
  const bunting = [];
  for (let k = 0; k < 14; k++) { const x = -26 + k * 4; const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 3), new THREE.MeshBasicMaterial({ color: [0xe8412c, 0xffd23f, 0x2f9e5b, 0x2f6fe0, 0xd8357f][k % 5] })); f.rotation.x = Math.PI; f.position.set(x, 11.5 - Math.sin(k / 13 * Math.PI) * 1.2 - 0.5, -23.4); grp.add(f); bunting.push(f); }
  return {
    group: grp, beams, flames, balcony, throneGroup: thr,
    update(t) {
      flames.forEach((f, i) => { const s = 1 + Math.sin(t * 12 + i) * 0.14 + Math.sin(t * 7.3 + i * 2) * 0.08; f.scale.set(1, s, 1); f.rotation.y = t * 2; });
      beams.forEach((b, i) => { if (b.userData.isBanner) P.animateBanner(b, t + i); else b.material.opacity = 0.07 + Math.sin(t * 0.8 + i) * 0.02; });
      bunting.forEach((f, i) => { f.rotation.z = Math.sin(t * 2 + i) * 0.08; });
    },
  };
}
let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  _glow = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  return _glow;
}
export { glowTex };

// ---------------------------------------------------------------- stoelen
// kind: 'normal' | 'golden' | 'smoky'. De zitplek ligt op y = SEAT_Y (lokaal, schaal 1).
export const SEAT_Y = 1.3;
export function makeChair(kind = 'normal') {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const wood = kind === 'golden' ? GOLD : new THREE.MeshStandardMaterial({ color: kind === 'smoky' ? 0x3a2a26 : 0x8a5a32, roughness: 0.55, flatShading: true });
  const cush = kind === 'golden' ? mat(0xd8142c, { flatShading: false }) : mat(kind === 'smoky' ? 0x6a1a14 : DEEP_RED, { flatShading: false });
  const legs = new THREE.Group(); body.add(legs);
  for (const [x, z] of [[-0.52, -0.46], [0.52, -0.46], [-0.52, 0.46], [0.52, 0.46]]) legs.add(mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.05, 6), wood, { pos: [x, 0.52, z] }));
  body.add(mesh(new THREE.BoxGeometry(1.3, 0.2, 1.2), wood, { pos: [0, 1.1, 0] }));
  const cushion = mesh(new THREE.BoxGeometry(1.15, 0.22, 1.05), cush, { pos: [0, 1.28, 0.02] }); body.add(cushion);
  body.add(mesh(new THREE.BoxGeometry(1.3, 1.5, 0.2), wood, { pos: [0, 2.0, -0.55] }));
  body.add(mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.2, 14, 1, false, 0, Math.PI), wood, { pos: [0, 2.75, -0.55], rot: [Math.PI / 2, 0, 0] }));
  for (const x of [-0.6, 0.6]) body.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), GOLD, { pos: [x, 2.85, -0.55] }));
  body.add(mesh(new THREE.BoxGeometry(0.85, 0.9, 0.06), cush, { pos: [0, 2.1, -0.43] }));
  // armleuningen
  for (const sx of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), wood, { pos: [sx * 0.65, 1.6, 0], cast: false }));
  // voetjes om weg te rennen (verborgen)
  const feet = new THREE.Group(); feet.visible = false; body.add(feet);
  const footM = mat(0xffe14a, { flatShading: false });
  const f1 = mesh(new THREE.BoxGeometry(0.34, 0.22, 0.6), footM, { pos: [-0.35, 0.05, 0.1] }), f2 = mesh(new THREE.BoxGeometry(0.34, 0.22, 0.6), footM, { pos: [0.35, 0.05, 0.1] });
  feet.add(f1, f2);
  let crown = null, aura = null, fire = null;
  if (kind === 'golden') {
    crown = new THREE.Group(); crown.position.set(0, 3.3, -0.55); body.add(crown);
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32; crown.add(mesh(new THREE.ConeGeometry(0.1, 0.38, 5), GOLD, { pos: [Math.sin(a) * 0.5, Math.cos(a) * 0.12, 0], rot: [0, 0, -a] })); crown.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: [0xff3a5a, 0x3aa8ff, 0x5aff8a][i % 3] }), { cast: false, pos: [Math.sin(a) * 0.5, Math.cos(a) * 0.12 + 0.24, 0] })); }
    aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); aura.scale.set(4.2, 4.2, 1); aura.position.set(0, 1.9, 0); g.add(aura);
  }
  if (kind === 'smoky') {
    fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff4a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0 })); fire.scale.set(3.2, 3.2, 1); fire.position.set(0, 1.4, 0); g.add(fire);
  }
  return { group: g, body, cushion, legs, feet, f1, f2, crown, aura, fire, kind };
}

// ---------------------------------------------------------------- valluik
export function makeTrapdoor() {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20), new THREE.MeshBasicMaterial({ color: 0x050208 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.02; g.add(hole);
  const flaps = [1, -1].map((sd) => {
    const piv = new THREE.Group(); piv.position.set(sd * 1.45, 0.03, 0); g.add(piv);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.14, 20, 1, false, sd > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), mat(0x5a3a22, { flatShading: false }));
    m.position.set(-sd * 1.45, 0, 0); piv.add(m);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 6, 20, Math.PI), GOLD); trim.rotation.x = Math.PI / 2; trim.rotation.z = sd > 0 ? Math.PI / 2 : -Math.PI / 2; trim.position.set(-sd * 1.45, 0.08, 0); piv.add(trim);
    return { piv, sd };
  });
  g.visible = false;
  return { group: g, open(k) { for (const f of flaps) f.piv.rotation.z = f.sd * -k * 1.55; }, hole };
}
// springplank (katapult)
export function makeSpringBoard() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.2, 14), mat(0x5a3a22, { flatShading: false }), { pos: [0, 0.1, 0] }));
  const coil = new THREE.Group(); g.add(coil);
  for (let i = 0; i < 6; i++) coil.add(mesh(new THREE.TorusGeometry(0.55, 0.07, 5, 14), mat(0xb8bcc8, { metalness: 0.8, flatShading: false }), { pos: [0, 0.2 + i * 0.16, 0], rot: [Math.PI / 2, 0, 0] }));
  const plank = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.16, 14), mat(0xd8372c, { flatShading: false }), { pos: [0, 1.2, 0] }); g.add(plank);
  g.visible = false;
  return { group: g, setK(k) { const h = lerp(0.3, 1.5, k); plank.position.y = h; coil.scale.y = h / 1.2; for (const c of coil.children) c.position.y = (c.position.y); }, plank };
}
// trofee
export function makeTrophy() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.3, 14), GOLD, { pos: [0, 0.15, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 10), GOLD, { pos: [0, 0.65, 0] }));
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.18 + Math.sin(t * Math.PI * 0.55) * 0.55, t * 0.9)); }
  g.add(mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide, emissive: 0xaa6a00, emissiveIntensity: 0.35 }), { pos: [0, 1.0, 0] }));
  for (const sd of [1, -1]) g.add(mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 12), GOLD, { pos: [sd * 0.72, 1.55, 0], rot: [0, 0, 0] }));
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })); star.position.y = 2.2; g.add(star); g.userData.star = star;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })); halo.scale.set(4, 4, 1); halo.position.y = 1.6; g.add(halo);
  return g;
}
// zwevende noot
export function noteSprite(glyph = '♪', css = '#ffe14a') {
  const t = canvasTex(64, 64, (g, w) => { g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(20,8,30,.9)'; g.strokeText(glyph, w / 2, w / 2 + 2); g.fillStyle = css; g.fillText(glyph, w / 2, w / 2 + 2); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(1.1, 1.1, 1); return s;
}

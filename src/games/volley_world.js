import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Slijm-Volleybal": een kermis-strand bij zonsondergang. Zee met pier + reuzenrad, een kasteel-op-een-berg aan de horizon,
// palmbomen, tenten, vlaggetjes, een juichend publiek, meeuwen, een scorebord en een gestreepte netpaal met wimpel.

export const VW = { W: 10, NH: 3.5, NR: 0.28 };   // halve veldbreedte, nethoogte, netpaal-straal

const stripeTex = (a, b, n = 6, vertical = false) => canvasTex(64, 64, (g, w, h) => { const s = (vertical ? h : w) / n; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; if (vertical) g.fillRect(0, i * s, w, s + 1); else g.fillRect(i * s, 0, s + 1, h); } }, { repeat: [1, 1] });
function skyTex() {
  return canvasTex(8, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1b1d63'); gr.addColorStop(0.22, '#59359a'); gr.addColorStop(0.36, '#d8588a'); gr.addColorStop(0.44, '#ff9a6a'); gr.addColorStop(0.5, '#ffc882'); gr.addColorStop(1, '#ffc882');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function seaTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a5fa8'); gr.addColorStop(1, '#5a7fc0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry32(21); g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h; g.strokeStyle = r() < 0.5 ? 'rgba(255,200,170,.45)' : 'rgba(160,200,255,.4)'; g.lineWidth = 2 + r() * 2; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 12, y - 6, x + 26, y + 6, x + 40, y); g.stroke(); }
  });
}
function courtTex(colors) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#e9cf9a'; g.fillRect(0, 0, w, h);
    const r = mulberry32(5); for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(160,120,70,.22)' : 'rgba(255,245,210,.3)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    g.fillStyle = colors[0].replace('1)', '.2)'); g.fillRect(0, 0, w / 2, h); g.fillStyle = colors[1].replace('1)', '.2)'); g.fillRect(w / 2, 0, w / 2, h);
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    // aanvalslijn + pijltjes in kleur van de speler
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.55)';
    for (const x of [w * 0.3, w * 0.7]) { g.setLineDash([22, 18]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.setLineDash([]);
  });
}
function netTex() { return canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8412c' : '#ffffff'; g.fillRect(0, i * 16, w, 16); } }); }
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

function palm(h = 6, rng = Math.random) {
  const g = new THREE.Group(); const trunkM = mat(0x8a5e3a, { flatShading: false }), leafM = mat(0x2f9a4a), leafM2 = mat(0x3fb85a);
  let x = 0, y = 0; const lean = (rng() - 0.5) * 0.5;
  for (let i = 0; i < 5; i++) { const seg = h / 5; g.add(mesh(new THREE.CylinderGeometry(0.2 - i * 0.02, 0.24 - i * 0.02, seg * 1.05, 6), trunkM, { cast: false, pos: [x, y + seg / 2, 0], rot: [0, 0, -lean * 0.8] })); x += Math.sin(lean * 0.8) * seg; y += Math.cos(lean * 0.8) * seg; }
  const top = new THREE.Group(); top.position.set(x, y, 0); g.add(top);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const lf = mesh(new THREE.SphereGeometry(1, 5, 4), k % 2 ? leafM : leafM2, { cast: false, scale: [1.9, 0.12, 0.45] }); const arm = new THREE.Group(); arm.rotation.y = a; lf.position.set(1.7, -0.25, 0); lf.rotation.z = -0.35; arm.add(lf); top.add(arm); }
  for (let k = 0; k < 3; k++) top.add(mesh(new THREE.SphereGeometry(0.24, 6, 5), mat(0x6b4a2a), { cast: false, pos: [Math.cos(k * 2.1) * 0.3, -0.35, Math.sin(k * 2.1) * 0.3] }));
  return g;
}
function tent(c1, c2, r = 3.4, h = 4.2) {
  const g = new THREE.Group();
  const st = stripeTex(c1, c2, 8); st.wrapS = THREE.RepeatWrapping;
  g.add(mesh(new THREE.CylinderGeometry(r, r, 2.0, 16), new THREE.MeshStandardMaterial({ map: st, roughness: 0.9 }), { cast: false, pos: [0, 1.0, 0] }));
  g.add(mesh(new THREE.ConeGeometry(r * 1.18, h, 16), new THREE.MeshStandardMaterial({ map: st, roughness: 0.9 }), { cast: false, pos: [0, 2.0 + h / 2, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xffd23f), { cast: false, pos: [0, 2.0 + h + 0.15, 0] }));
  g.add(mesh(new THREE.BoxGeometry(1.6, 1.5, 0.12), mat(0x3a1c10), { cast: false, pos: [0, 0.75, r - 0.02] }));
  return g;
}
function sandCastle(s = 1) {
  const g = new THREE.Group(); const m = mat(0xe8c27a, { flatShading: true });
  g.add(mesh(new THREE.BoxGeometry(3.4 * s, 1.2 * s, 2.4 * s), m, { cast: false, pos: [0, 0.6 * s, 0] }));
  for (const [x, z] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]]) { g.add(mesh(new THREE.CylinderGeometry(0.5 * s, 0.6 * s, 2.0 * s, 8), m, { cast: false, pos: [x * s, 1.0 * s, z * s] })); g.add(mesh(new THREE.ConeGeometry(0.62 * s, 0.9 * s, 8), mat(0xd8372c), { cast: false, pos: [x * s, 2.45 * s, z * s] })); }
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6 * s, 4), mat(0xffffff), { cast: false, pos: [0, 2.0 * s, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.8 * s, 0.5 * s, 0.03), mat(0xffd23f), { cast: false, pos: [0.4 * s, 2.6 * s, 0] }));
  return g;
}
function gullObj() {
  const g = new THREE.Group(); const m = mat(0xffffff, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.22, 6, 5), m, { cast: false, scale: [1.5, 0.8, 0.8] }));
  const wings = [-1, 1].map((sd) => { const w = new THREE.Group(); w.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), m, { cast: false, pos: [sd * 0.45, 0, 0] })); g.add(w); return w; });
  g.userData.wings = wings; g.userData.dynamic = true; return g;
}

export function buildBeach(ctx, L, colorsCss) {
  const { scene, fx } = ctx;
  const { W, NH, NR } = VW;
  const rng = mulberry32(4242);
  const B = { crowd: [], gulls: [], flash: [0, 0], wind: 0, windPhase: 0 };
  const idx0 = scene.children.length;
  scene.background = skyTex();
  scene.fog = new THREE.Fog(0xffc486, 70, 230);

  // zon + gloed (alleen decor, ver weg)
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); sunSp.scale.set(60, 60, 1); sunSp.position.set(14, 12, -170); scene.add(sunSp);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })); sunDisc.position.set(14, 12, -168); scene.add(sunDisc);
  const glitter = new THREE.Mesh(new THREE.PlaneGeometry(14, 90), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffb060, transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); glitter.rotation.x = -Math.PI / 2; glitter.position.set(14, -0.2, -120); scene.add(glitter);
  B.glitter = glitter;
  // wolkjes
  B.clouds = [];
  for (const [x, y, z, s] of [[-40, 30, -150, 3.5], [30, 38, -170, 4.2], [60, 22, -150, 2.8]]) { const c = P.cloud(s); c.position.set(x, y, z); c.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.color.set(0xffb0b8); o.material.fog = false; } }); scene.add(c); B.clouds.push(c); c.userData.dynamic = true; }

  // zee
  const st = seaTex(); st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(24, 14); B.seaTex = st;
  const sea = mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ map: st, roughness: 0.35, metalness: 0.1, color: 0xffd6c0 }), { cast: false, receive: false, pos: [0, -0.5, -170], rot: [-Math.PI / 2, 0, 0] }); scene.add(sea);
  // strand
  const sandT = tex.sand(40, 14);
  scene.add(mesh(new THREE.PlaneGeometry(400, 90), new THREE.MeshStandardMaterial({ map: sandT, roughness: 1, color: 0xffe2b0 }), { cast: false, pos: [0, 0, -20], rot: [-Math.PI / 2, 0, 0] }));
  scene.add(mesh(new THREE.PlaneGeometry(400, 12), new THREE.MeshStandardMaterial({ color: 0xb98a5c, roughness: 1 }), { cast: false, receive: false, pos: [0, 0.01, -26.5], rot: [-Math.PI / 2, 0, 0] }));
  // schuimrand
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(400, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.03, -29); scene.add(foam); B.foam = foam;

  // veld
  const court = mesh(new THREE.PlaneGeometry(2 * W, 5.2), new THREE.MeshStandardMaterial({ map: courtTex(colorsCss), roughness: 1 }), { cast: false, pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(court);
  // schaduw-vangende vloer rond het veld (zodat blobs schaduw hebben)
  // zijmuren: opblaasbare gestreepte pilaren + flits
  B.walls = [];
  for (const sx of [-1, 1]) {
    const col = sx < 0 ? 0x35c46f : 0x4a8cff;
    const stp = stripeTex('#' + col.toString(16).padStart(6, '0'), '#ffffff', 8, true);
    for (const z of [-2.4, 2.4]) scene.add(mesh(new THREE.CylinderGeometry(0.36, 0.42, 15, 10), new THREE.MeshStandardMaterial({ map: stp, roughness: 0.4 }), { cast: false, pos: [sx * (W + 0.45), 7.5, z] }));
    for (const z of [-2.4, 2.4]) { scene.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(col, { flatShading: false, roughness: 0.3 }), { cast: false, pos: [sx * (W + 0.45), 15.1, z] })); }
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 15), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); fl.rotation.y = Math.PI / 2; fl.position.set(sx * (W + 0.1), 7.5, 0); scene.add(fl); B.walls.push(fl);
  }
  // netpaal
  const pole = mesh(new THREE.CylinderGeometry(NR, NR * 1.15, NH + 0.1, 12), new THREE.MeshStandardMaterial({ map: netTex(), roughness: 0.5 }), { pos: [0, (NH + 0.1) / 2, 0] }); pole.userData.dynamic = false; scene.add(pole);
  scene.add(mesh(new THREE.SphereGeometry(NR * 1.35, 10, 8), mat(0xffd23f, { metalness: 0.7, roughness: 0.3, flatShading: false }), { pos: [0, NH + 0.1, 0] }));
  scene.add(mesh(new THREE.CylinderGeometry(NR * 1.6, NR * 1.8, 0.35, 12), mat(0x6a4a2a), { cast: false, pos: [0, 0.17, 0] }));
  // net-bandjes (van links naar rechts, de "net"-look): twee witte lappen aan de paal, zacht wapperend
  const penn = new THREE.Group(); penn.position.set(0, NH + 0.95, 0); penn.userData.dynamic = true; scene.add(penn);
  scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), mat(0xdddddd), { cast: false, pos: [0, NH + 0.9, 0] }));
  const pennM = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ color: 0xff4f7a, side: THREE.DoubleSide })); pennM.position.x = 0.75; penn.add(pennM); B.penn = penn; B.pennM = pennM;
  // vlaggetjes-slingers (instanced driehoekjes) tussen de pilaren en achterwand
  {
    const n = 46, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.28, 0, 0, 0.28, 0, 0, 0, -0.55, 0]), 3));
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), n * 2);
    const cols = [0xff4f7a, 0xffd23f, 0x4fd0ff, 0x7dff8a, 0xffffff, 0xb08aff]; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
    let k = 0;
    for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = lerp(-W - 0.5, W + 0.5, u), sag = Math.sin(u * Math.PI) * 0.9;
      p.set(x, 13.6 + row * 0.9 - sag + (row ? 0.3 : 0), row ? -2.4 : 2.4); m4.compose(p, q, s); im.setMatrixAt(k, m4); im.setColorAt(k, c.setHex(cols[(i + row * 2) % cols.length])); k++;
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.dynamic = true; scene.add(im);
    for (const z of [-2.4, 2.4]) { const pts = []; for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(new THREE.Vector3(lerp(-W - 0.5, W + 0.5, u), 13.6 + 0.0 - Math.sin(u * Math.PI) * 0.9 + (z < 0 ? 1.2 : 0), z)); } const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x553322, fog: false })); scene.add(ln); }
  }

  // ---------------- decor achter het veld ----------------
  scene.add(mesh(new THREE.BoxGeometry(80, 0.7, 5), mat(0xd8b070, { flatShading: false }), { cast: false, receive: false, pos: [0, 0.3, -7.2] }));    // duin voor publiek
  for (const [x, z, h] of [[-15, -6.5, 7.2], [-21, -9, 6.2], [-27, -5.5, 7.8], [16, -6.8, 7.0], [23, -9, 6.4], [29, -5.8, 7.6], [-34, -11, 6.5], [35, -11, 6.5], [-8, -14, 5.5], [9, -15, 5.8]]) { const p = palm(h, rng); p.position.set(x, 0, z); p.rotation.y = rng() * 6; p.userData.dynamic = false; scene.add(p); }
  const t1 = tent(['#ff4f7a', '#ffffff'], ['#ff4f7a', '#ffffff']); t1.position.set(-19, 0, -15); scene.add(t1);
  const t2 = tent(['#4fa8ff', '#ffffff'], ['#4fa8ff', '#ffffff'], 3.0, 3.8); t2.position.set(20, 0, -16); scene.add(t2);
  const t3 = tent(['#ffd23f', '#ff7a2a'], ['#ffd23f', '#ff7a2a'], 2.6, 3.4); t3.position.set(-33, 0, -18); scene.add(t3);
  // zandkastelen (knipoog naar het speelhal-kasteel)
  const sc1 = sandCastle(1.1); sc1.position.set(-14.5, 0, 6.5); sc1.rotation.y = 0.3; scene.add(sc1);
  const sc2 = sandCastle(0.8); sc2.position.set(15.5, 0, 7.5); sc2.rotation.y = -0.4; scene.add(sc2);
  // parasols en strandbal
  for (const [x, z, c] of [[-24, -3, 0xff4f7a], [26, -2.5, 0x4fd0ff], [-12.5, -5, 0xffd23f], [12.5, -4.5, 0xb08aff]]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), mat(0xeeeeee), { cast: false, pos: [x, 1.6, z] }));
    scene.add(mesh(new THREE.ConeGeometry(1.9, 0.9, 8), mat(c), { cast: false, pos: [x, 3.4, z], rot: [0, 0, 0.12] }));
    scene.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 12), mat(0xfff4dc), { cast: false, pos: [x - 1.8, 0.1, z + 0.9] }));
  }
  // pier met reuzenrad
  scene.add(mesh(new THREE.BoxGeometry(5, 0.5, 52), new THREE.MeshStandardMaterial({ map: tex.planks(2, 20), roughness: 0.9 }), { cast: false, pos: [30, 0.55, -50] }));
  for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) scene.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 5), mat(0x5b3d24), { cast: false, pos: [30 + sx * 2.2, -0.4, -26 - i * 5] }));
  const wheel = new THREE.Group(); wheel.position.set(30, 11.5, -68); wheel.userData.dynamic = true; scene.add(wheel); B.wheel = wheel;
  {
    const m1 = mat(0xe8e8f0, { metalness: 0.3 }), m2 = mat(0xff4f7a);
    for (const r of [10.5, 7.5]) wheel.add(mesh(new THREE.TorusGeometry(r, 0.18, 5, 40), m1, { cast: false }));
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; wheel.add(mesh(new THREE.BoxGeometry(0.12, 10.6, 0.12), m1, { cast: false, pos: [Math.cos(a + Math.PI / 2) * 5.3, Math.sin(a + Math.PI / 2) * 5.3, 0], rot: [0, 0, a] })); }
    B.gond = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const gd = new THREE.Group(); gd.position.set(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 0); gd.add(mesh(new THREE.BoxGeometry(1.5, 1.1, 1.1), mat([0xff4f7a, 0xffd23f, 0x4fd0ff, 0x7dff8a][k % 4]), { cast: false, pos: [0, -0.7, 0] })); wheel.add(gd); B.gond.push(gd); }
    scene.add(mesh(new THREE.BoxGeometry(0.5, 12, 0.5), mat(0xb8b8c8), { cast: false, pos: [28.4, 5.5, -68], rot: [0, 0, 0.2] }), mesh(new THREE.BoxGeometry(0.5, 12, 0.5), mat(0xb8b8c8), { cast: false, pos: [31.6, 5.5, -68], rot: [0, 0, -0.2] }));
    // lampjes
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false }), 40); const m4 = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; m4.makeTranslation(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 0.25); bulbs.setMatrixAt(i, m4); }
    wheel.add(bulbs);
  }
  // kasteel-op-een-berg aan de horizon (de speelhal!)
  {
    const g = new THREE.Group(); g.position.set(-62, 0, -135); const rock = mat(0x4a3a7a, { flatShading: true, fog: true });
    g.add(mesh(new THREE.ConeGeometry(34, 38, 7), rock, { cast: false, receive: false, pos: [0, 17, 0] }));
    g.add(mesh(new THREE.ConeGeometry(20, 28, 6), rock, { cast: false, receive: false, pos: [-26, 12, 8] }));
    const cs = mat(0x6a5a9a, { flatShading: true });
    g.add(mesh(new THREE.BoxGeometry(14, 6, 5), cs, { cast: false, receive: false, pos: [0, 38, 0] }));
    for (const x of [-7, 0, 7]) { g.add(mesh(new THREE.CylinderGeometry(2.2, 2.4, 14, 8), cs, { cast: false, receive: false, pos: [x, 42, 0] })); g.add(mesh(new THREE.ConeGeometry(3, 5, 8), mat(0xc84a6a), { cast: false, receive: false, pos: [x, 51.5, 0] })); }
    scene.add(g);
  }

  // ---------------- publiek ----------------
  const kinds = ['kid', 'bard', 'jester', 'farmer', 'baker', 'goblin', 'dwarf', 'princess', 'fisher', 'shepherd', 'guard', 'witch', 'kid', 'jester'];
  for (let k = 0; k < 14; k++) {
    const x = -30 + k * (60 / 13) + (rng() - 0.5) * 1.6; if (Math.abs(x) < 3) continue;
    const c = makeNPC(kinds[k % kinds.length]); const s = 1.55; c.group.scale.setScalar(s); c.group.position.set(x, 0.65, -6.8 - rng() * 1.2); c.faceDir(0, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group);
    B.crowd.push({ c, y: 0.65, ph: rng() * 6, cheer: 0 });
  }
  // meeuwen
  for (let k = 0; k < 4; k++) { const g = gullObj(); g.position.set(0, 12, -18); scene.add(g); B.gulls.push({ g, ph: rng() * 6, r: 18 + rng() * 14, y: 14 + rng() * 6, sp: 0.18 + rng() * 0.12 }); }

  // scorebord (houten bord, midden achter)
  const sbC = document.createElement('canvas'); sbC.width = 512; sbC.height = 192; const sbG = sbC.getContext('2d');
  const sbT = new THREE.CanvasTexture(sbC); sbT.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Group(); sb.position.set(0, 9.6, -5.5); sb.scale.setScalar(0.9); scene.add(sb);
  sb.add(mesh(new THREE.BoxGeometry(8.6, 3.3, 0.4), mat(0x6a3a1c, { flatShading: false }), { cast: false }));
  sb.add(mesh(new THREE.PlaneGeometry(8.1, 2.8), new THREE.MeshBasicMaterial({ map: sbT, toneMapped: false }), { cast: false, receive: false, pos: [0, 0, 0.21] }));
  for (const sx of [-1, 1]) sb.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 5), mat(0x6a3a1c), { cast: false, pos: [sx * 3.6, -6.2, -0.1] }));
  B.scoreboard = (names, score, secs, note) => {
    const g = sbG, w = 512, h = 192; g.fillStyle = '#17325c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd86b'; g.lineWidth = 8; g.strokeRect(5, 5, w - 10, h - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 34px Fredoka, Arial Black, sans-serif';
    g.fillStyle = '#7dffb0'; g.fillText(names[0].toUpperCase(), 100, 34); g.fillStyle = '#8fb8ff'; g.fillText(names[1].toUpperCase(), w - 100, 34);
    g.font = 'bold 104px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#7dffb0'; g.fillText(String(score[0]), 100, 112); g.fillStyle = '#8fb8ff'; g.fillText(String(score[1]), w - 100, 112);
    g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.fillStyle = secs <= 10 ? '#ff7a6a' : '#ffffff';
    const mm = Math.floor(Math.max(0, secs) / 60), ss = Math.floor(Math.max(0, secs) % 60); g.fillText(note || `${mm}:${String(ss).padStart(2, '0')}`, w / 2, 50);
    g.font = 'bold 24px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText('eerste tot 11', w / 2, 150);
    sbT.needsUpdate = true;
  };
  B.scoreboard(['Wes', 'Jor'], [0, 0], 90);

  // windpijl (canvas-sprite)
  const wC = document.createElement('canvas'); wC.width = 256; wC.height = 96; const wG = wC.getContext('2d'); const wT = new THREE.CanvasTexture(wC); wT.colorSpace = THREE.SRGBColorSpace;
  const wSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: wT, transparent: true, depthTest: false, opacity: 0 })); wSp.scale.set(5.2, 1.95, 1); wSp.position.set(0, 13.0, 1); wSp.renderOrder = 18; scene.add(wSp); B.windSprite = wSp;
  let lastW = 99;
  B.setWindIcon = (w) => {
    const q = Math.round(w * 2) / 2; if (q === lastW) return; lastW = q;
    wG.clearRect(0, 0, 256, 96);
    if (Math.abs(w) < 0.3) { wSp.material.opacity = 0; wT.needsUpdate = true; return; }
    wSp.material.opacity = 1;
    wG.font = 'bold 44px Fredoka, Arial Black, sans-serif'; wG.textAlign = 'center'; wG.textBaseline = 'middle'; wG.lineWidth = 9; wG.strokeStyle = 'rgba(20,10,50,.9)'; wG.lineJoin = 'round';
    const n = Math.min(4, 1 + Math.floor(Math.abs(w) / 1.6)); const txt = '💨 ' + (w > 0 ? '›'.repeat(n) : '‹'.repeat(n));
    wG.strokeText(txt, 128, 48); wG.fillStyle = '#d8f4ff'; wG.fillText(txt, 128, 48); wT.needsUpdate = true;
  };

  // ---------------- licht ----------------
  L.hemi.intensity = 1.25; L.hemi.color.set(0xffd0c0); L.hemi.groundColor.set(0x8a6a9a);
  L.sun.color.set(0xffc08a); L.sun.intensity = 2.3; L.sun.position.set(-14, 18, 26);
  const pl = new THREE.PointLight(0xffa860, 0.9, 60, 1.4); pl.position.set(0, 9, 8); scene.add(pl);

  // samenvoegen (alles wat niet dynamic is)
  B.merged = mergeStatic(scene, idx0);

  B.cheer = (secs = 2.5) => { for (const q of B.crowd) q.cheer = secs * (0.7 + Math.random() * 0.6); };
  B.wallFlash = (side) => { B.flash[side < 0 ? 0 : 1] = 0.5; };
  let windAcc = 0;
  B.update = (t, dt) => {
    B.seaTex.offset.x = (t * 0.004) % 1; B.seaTex.offset.y = Math.sin(t * 0.3) * 0.01;
    B.foam.position.z = -29 + Math.sin(t * 0.7) * 0.7; B.foam.material.opacity = 0.4 + Math.sin(t * 0.7 + 1) * 0.15;
    B.glitter.material.opacity = 0.5 + Math.sin(t * 2.1) * 0.12;
    B.wheel.rotation.z = -t * 0.12; for (const gd of B.gond) gd.rotation.z = t * 0.12;
    B.clouds.forEach((c, i) => { c.position.x += dt * (0.4 + i * 0.15); if (c.position.x > 100) c.position.x = -100; });
    for (let i = 0; i < 2; i++) { B.flash[i] = Math.max(0, B.flash[i] - dt); B.walls[i].material.opacity = B.flash[i] > 0 ? B.flash[i] * 1.3 : 0; }
    for (const q of B.crowd) {
      q.cheer = Math.max(0, q.cheer - dt);
      q.c.group.position.y = q.y + (q.cheer > 0 ? Math.abs(Math.sin(t * 8 + q.ph)) * 0.8 : Math.abs(Math.sin(t * 1.6 + q.ph)) * 0.06);
      q.c.pose = q.cheer > 0 ? 'cheer' : 'idle'; q.c.update(dt);
    }
    for (const s of B.gulls) { const a = t * s.sp + s.ph; s.g.position.set(Math.cos(a) * s.r, s.y + Math.sin(a * 2.3) * 1.2, -22 + Math.sin(a) * 6); s.g.rotation.y = -a + Math.PI; s.g.userData.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * Math.sin(t * 7 + s.ph) * 0.6; }); }
    // wimpel wappert mee met de wind
    const wsign = Math.sign(B.wind) || 1; B.penn.scale.x = damp(B.penn.scale.x, wsign * (0.35 + Math.min(1, Math.abs(B.wind) / 3) * 0.65), 4, dt);
    B.penn.rotation.z = Math.sin(t * (4 + Math.abs(B.wind) * 2)) * (0.05 + Math.abs(B.wind) * 0.04);
    // zandwindje bij harde wind
    windAcc += dt * Math.abs(B.wind) * 5; while (windAcc > 1) { windAcc -= 1; fx.particles.emit(B.wind > 0 ? -W - 4 : W + 4, 0.4 + Math.random() * 6, (Math.random() - 0.5) * 6, B.wind * 7, 0, 0, { life: 3.4, size: 0.18, color: 0xfff0d0, gravity: 0, shrink: false }); }
  };
  return B;
}

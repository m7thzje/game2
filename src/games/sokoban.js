import * as THREE from 'three';
import { mat, mesh, clamp, damp, lerp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { KEY_LABELS } from '../engine/input.js';
import { LEVELS, parseLevel, tryMove, isSolved, DIRS } from './sokoban_levels.js';

// Kratten Schuiven: co-op Sokoban in het magazijn van Voorman Wim.
// Levels + regels staan in sokoban_levels.js (bewezen oplosbaar met tools/solve_sokoban.mjs).

const C = 2.0;                 // celgrootte in de wereld
const TOTAL_TIME = 330;        // seconden voor alle levels samen
const STEP = 0.15;             // seconden per stap (ingedrukt houden herhaalt)
const RESET_HOLD = 0.8;
const SKIP_AFTER = 75;         // na zoveel seconden in één level mag je 'm samen overslaan
const SLIDE_X = 38;
const CONFETTI = [0xff5a5a, 0xffe14a, 0x5ad0ff, 0x7aff7a, 0xff8ae6, 0xffffff, 0xffa03a];

const gBox = new THREE.BoxGeometry(1, 1, 1);

function goalTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#4a3410'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd25a'; g.lineWidth = 7; g.strokeRect(9, 9, w - 18, h - 18);
    g.strokeStyle = '#ffb02a'; g.lineWidth = 3; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = '#ffe28a';
    g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w - 30, h / 2); g.lineTo(w / 2, h - 30); g.lineTo(30, h / 2); g.closePath(); g.fill();
    g.fillStyle = '#ff9a1a';
    g.beginPath(); g.moveTo(w / 2, 48); g.lineTo(w - 48, h / 2); g.lineTo(w / 2, h - 48); g.lineTo(48, h / 2); g.closePath(); g.fill();
    g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(w / 2, h / 2, 9, 0, TAU); g.fill();
  });
}
function labelTexture(text, css) {
  return canvasTex(256, 96, (g, w, h) => {
    g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(20,10,30,.92)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2, w - 16);
    g.fillStyle = css; g.fillText(text, w / 2, h / 2, w - 16);
  });
}

export default {
  id: 'sokoban',
  name: 'Kratten Schuiven',
  giver: 'Voorman Wim',
  icon: '📦',
  mode: 'puzzle',
  time: TOTAL_TIME,
  pay: 1.2,
  music: 'puzzle',
  blurb: 'Het magazijn van Voorman Wim ligt vol kratten! Duw ze samen op de <b>gloeiende platen</b>. Jullie staan <b>allebei</b> op het rooster en versperren elkaar de weg. Soms zit er één van jullie vast: help elkaar! Los zoveel mogelijk van de <b>8 levels</b> op voor de klok afloopt.',
  controls: ['{move} stap voor stap lopen (vasthouden = doorlopen)', 'duwen: loop tegen een krat aan', '{b} vasthouden: level opnieuw'],
  tip: 'Je kunt maar één krat tegelijk duwen, en jullie kunnen niet door elkaar heen. 3 levels = 1 ster, 5 = 2 sterren, 7 = 3 sterren.',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    ctx.lights('indoor', { shadow: 19, center: [0, 0, 0] });
    scene.fog = new THREE.Fog(0x2a1c14, 55, 130);
    scene.background = new THREE.Color(0x2a1c14);
    camera.fov = 46; camera.updateProjectionMatrix();

    const tmpV = new THREE.Vector3();
    const animated = { banners: [], lamps: [], fires: [] };
    let t = 0;

    // ------------------------------------------------------------------ omgeving
    scene.add(new THREE.AmbientLight(0xffe6cc, 0.6));
    const warm = new THREE.PointLight(0xffc27a, 1.1, 40, 1.4); warm.position.set(-9, 9, -2); scene.add(warm);
    const warm2 = new THREE.PointLight(0xffc27a, 1.1, 40, 1.4); warm2.position.set(10, 9, 2); scene.add(warm2);

    const hall = mesh(new THREE.PlaneGeometry(160, 100), new THREE.MeshStandardMaterial({ map: tex.planks(40, 25, '#6d4a2c'), color: 0xd0baa6, roughness: 1 }), { cast: false, pos: [0, -0.3, -10], rot: [-Math.PI / 2, 0, 0] });
    scene.add(hall);
    const backWall = mesh(new THREE.BoxGeometry(120, 24, 1), new THREE.MeshStandardMaterial({ map: tex.planks(30, 6, '#5a3c25'), roughness: 1 }), { cast: false, pos: [0, 11.7, -19] });
    scene.add(backWall);
    // balken in de muur
    for (let x = -50; x <= 50; x += 10) scene.add(mesh(gBox, mat(0x3a2514), { cast: false, pos: [x, 11.7, -18.4], scale: [0.7, 24, 0.5] }));
    for (const y of [5, 12, 19]) scene.add(mesh(gBox, mat(0x3a2514), { cast: false, pos: [0, y, -18.4], scale: [120, 0.6, 0.5] }));
    // ramen met avondlicht
    const winMat = new THREE.MeshBasicMaterial({ color: 0xa8c8ff });
    for (const x of [-22, 0, 22]) {
      scene.add(mesh(gBox, mat(0x2a1a0e), { cast: false, pos: [x, 14, -18.3], scale: [5.4, 5.6, 0.3] }));
      scene.add(mesh(gBox, winMat, { cast: false, receive: false, pos: [x, 14, -18.1], scale: [4.8, 5, 0.2] }));
      scene.add(mesh(gBox, mat(0x2a1a0e), { cast: false, pos: [x, 14, -18.0], scale: [0.2, 5, 0.2] }));
      scene.add(mesh(gBox, mat(0x2a1a0e), { cast: false, pos: [x, 14, -18.0], scale: [4.8, 0.2, 0.2] }));
      const shaft = mesh(new THREE.PlaneGeometry(4.6, 22), new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), { cast: false, receive: false, pos: [x + 3, 6, -14], rot: [0.55, 0, -0.35] });
      scene.add(shaft);
    }
    // uithangbord
    const board = mesh(new THREE.BoxGeometry(9, 2.4, 0.3), new THREE.MeshStandardMaterial({ map: tex.sign('MAGAZIJN\nVoorman Wim', { w: 512, h: 160, size: 52, bg: '#6b3f1c' }), roughness: 0.9 }), { pos: [-12, 8.2, -17.7] });
    scene.add(board);

    // gestapelde kratten + tonnen (instanced: weinig draw calls)
    const stackRng = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const decorCrates = [];
    const addStack = (x, z, n, size = 2.2) => { for (let i = 0; i < n; i++) decorCrates.push({ x: x + (stackRng() - 0.5) * 0.25, y: size * (i + 0.5), z: z + (stackRng() - 0.5) * 0.2, s: size * (0.92 + stackRng() * 0.12), r: (stackRng() - 0.5) * 0.3 }); };
    for (let x = -34; x <= 34; x += 3.2) { if (Math.abs(x) < 4 && false) continue; addStack(x, -16.0, 1 + Math.floor(stackRng() * 4)); }
    for (let x = -34; x <= 34; x += 5.5) if (stackRng() < 0.6) addStack(x + 1, -13.2, 1 + Math.floor(stackRng() * 2), 1.9);
    addStack(-17, 12, 2, 2); addStack(-19.2, 12.4, 1, 2); addStack(17.5, 10, 3, 2); addStack(19.8, 10.6, 2, 2); addStack(-18, -4, 2, 2); addStack(19, -6, 1, 2);
    const crateTex = tex.planks(1, 1, '#b98a54');
    const dcMesh = new THREE.InstancedMesh(gBox, new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.95 }), decorCrates.length);
    dcMesh.castShadow = true; dcMesh.receiveShadow = true;
    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    decorCrates.forEach((c, i) => {
      dummy.position.set(c.x, c.y - 0.3, c.z); dummy.rotation.set(0, c.r, 0); dummy.scale.setScalar(c.s); dummy.updateMatrix();
      dcMesh.setMatrixAt(i, dummy.matrix); dcMesh.setColorAt(i, col.setHSL(0.08 + stackRng() * 0.04, 0.45, 0.6 + stackRng() * 0.25));
    });
    scene.add(dcMesh);
    const dcBands = new THREE.InstancedMesh(gBox, mat(0x4a2f18), decorCrates.length * 2);
    decorCrates.forEach((c, i) => {
      for (let k = 0; k < 2; k++) {
        dummy.position.set(c.x, c.y - 0.3, c.z); dummy.rotation.set(0, c.r, 0);
        dummy.scale.set(c.s * (k ? 1.02 : 0.16), c.s * 1.015, c.s * (k ? 0.16 : 1.02)); dummy.updateMatrix(); dcBands.setMatrixAt(i * 2 + k, dummy.matrix);
      }
    });
    scene.add(dcBands);
    for (const [x, z] of [[-26, -12], [-24.8, -11.2], [26, -12.4], [28, -11.6], [-27, 6], [27, 4], [-25.5, 8], [25, -3]]) { const b = P.barrel(1.5); b.position.set(x, -0.3, z); scene.add(b); }
    for (const [x, z] of [[-14, -12.5], [15, -12.8], [30, -12]]) { const s = P.sack(1.7); s.position.set(x, -0.3, z); scene.add(s); }

    // hanglampen met lichtbundel
    for (const [x, z, y] of [[-14, -10, 9], [0, -11, 10], [14, -10, 9], [-26, 0, 9], [26, 0, 9]]) {
      const g = new THREE.Group(); g.position.set(x, y, z);
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 4), mat(0x222222), { cast: false, pos: [0, 4, 0] }));
      g.add(mesh(new THREE.ConeGeometry(1.1, 0.8, 10, 1, true), mat(0x30343c, { metalness: 0.6, side: THREE.DoubleSide }), { cast: false, pos: [0, 0, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.34, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), { cast: false, receive: false, pos: [0, -0.25, 0] }));
      g.add(mesh(new THREE.ConeGeometry(4.2, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), { cast: false, receive: false, pos: [0, -4.8, 0] }));
      scene.add(g); animated.lamps.push({ g, ph: rand(0, 6) });
    }
    // vlaggen aan de balken
    for (const [x, col2] of [[-30, 0xd8372c], [-6, 0x3a78e0], [8, 0x2f9e5b], [30, 0xe8c24a]]) {
      const b = P.banner(col2, 4.2, 1.4); b.position.set(x, 14.2, -17.5); b.scale.setScalar(1.3); scene.add(b); animated.banners.push(b);
    }
    // vorkheftrucks
    function makeForklift(color = 0xf0a020, withCrate = false) {
      const g = new THREE.Group();
      const dark = mat(0x33363d, { metalness: 0.4 });
      g.add(mesh(gBox, mat(color), { pos: [0, 0.8, 0], scale: [2.3, 0.7, 1.5] }));
      g.add(mesh(gBox, mat(color), { pos: [-0.65, 1.35, 0], scale: [1.0, 0.45, 1.4] }));
      g.add(mesh(gBox, dark, { pos: [-1.25, 1.0, 0], scale: [0.5, 1.1, 1.5] }));
      for (const sx of [-0.1, 1.0]) for (const sz of [-0.62, 0.62]) g.add(mesh(gBox, dark, { pos: [sx, 2.0, sz], scale: [0.08, 1.35, 0.08] }));
      g.add(mesh(gBox, dark, { pos: [0.45, 2.7, 0], scale: [1.4, 0.1, 1.5] }));
      g.add(mesh(gBox, mat(0x222222), { pos: [-0.2, 1.3, 0], scale: [0.5, 0.12, 0.6] }));
      for (const sz of [-0.5, 0.5]) g.add(mesh(gBox, dark, { pos: [1.25, 1.7, sz], scale: [0.14, 2.8, 0.14] }));
      const fork = new THREE.Group(); fork.position.set(1.4, 0.3, 0); g.add(fork);
      fork.add(mesh(gBox, dark, { pos: [0, 0.5, 0], scale: [0.12, 0.9, 1.35] }));
      for (const sz of [-0.38, 0.38]) fork.add(mesh(gBox, dark, { pos: [0.8, 0.08, sz], scale: [1.6, 0.1, 0.2] }));
      if (withCrate) fork.add(mesh(gBox, new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.95 }), { pos: [0.95, 0.95, 0], scale: [1.5, 1.5, 1.5] }));
      for (const [x, r] of [[0.75, 0.46], [-0.85, 0.4]]) for (const sz of [-0.8, 0.8]) g.add(mesh(new THREE.CylinderGeometry(r, r, 0.32, 10), mat(0x15151a), { pos: [x, r, sz], rot: [Math.PI / 2, 0, 0] }));
      g.userData.fork = fork; return g;
    }
    const fkParked = makeForklift(0xe8a020, true); fkParked.position.set(-22, -0.3, 2); fkParked.rotation.y = 0.5; scene.add(fkParked);
    const fkParked2 = makeForklift(0xd8442c, false); fkParked2.position.set(24, -0.3, -9); fkParked2.rotation.y = -2.6; scene.add(fkParked2);
    const fkMove = makeForklift(0x2e8fd8, true); fkMove.position.set(-30, -0.3, -11); scene.add(fkMove);
    const fkState = { x: -30, dir: 1, wait: 2, lift: 0 };

    // voorman Wim
    const wim = ctx.make.npc('foreman'); wim.group.position.set(-6.8, -0.3, -9.3); wim.group.scale.setScalar(1.25); wim.pose = 'point'; wim.faceDir(0.4, 1); scene.add(wim.group);
    const desk = mesh(gBox, new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#8a5a2b'), roughness: 0.9 }), { pos: [-3.6, 0.55, -9.6], scale: [3.2, 1.7, 1.4] }); scene.add(desk);
    const lamp2 = P.torch(0xffb04a); lamp2.position.set(-3.3, 1.4, -9.4); scene.add(lamp2); animated.fires.push(lamp2);

    // ------------------------------------------------------------------ materialen voor levels
    const goalTex = goalTexture();
    const goalMat = new THREE.MeshStandardMaterial({ map: goalTex, emissive: 0xffa010, emissiveMap: goalTex, emissiveIntensity: 0.9, roughness: 0.5 });
    const goalOkMat = new THREE.MeshStandardMaterial({ map: goalTex, color: 0x77ff99, emissive: 0x22cc55, emissiveMap: goalTex, emissiveIntensity: 0.7, roughness: 0.5 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#c9a36e'), roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ map: tex.bricks(1, 1), roughness: 0.95, color: 0xffffff });
    const wallCapMat = mat(0x8d8f9c, { flatShading: false });
    const crateFrame = mat(0x5a3a1c);
    const crateTexA = tex.planks(1, 1, '#e3a456');
    const crateTexB = tex.planks(1, 1, '#cf8f48');
    const stageMat = mat(0x6b4a2e);
    const ringGeo = new THREE.TorusGeometry(0.62, 0.07, 6, 24);
    const labelGeo = new THREE.PlaneGeometry(1.8, 0.675);

    // ------------------------------------------------------------------ level bouwen
    let lvl = null;      // huidig level
    let prev = null;     // vorig level (schuift uit beeld)

    function makeCrate(variant) {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ map: variant ? crateTexB : crateTexA, roughness: 0.9, emissive: 0x3a2208, emissiveIntensity: 1 });
      const s = 1.6;
      g.add(mesh(gBox, bodyMat, { pos: [0, s / 2, 0], scale: [s, s, s] }));
      const t2 = 0.14;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(gBox, crateFrame, { pos: [sx * (s / 2 - t2 / 2 + 0.01), s / 2, sz * (s / 2 - t2 / 2 + 0.01)], scale: [t2, s + 0.02, t2] }));
      for (const y of [0.07, s - 0.07]) g.add(mesh(gBox, crateFrame, { pos: [0, y, 0], scale: [s + 0.03, 0.14, s + 0.03] }));
      // diagonale plank-bandjes op de zijkanten (herkenbaar als krat)
      for (const [rx, ry] of [[0, 0], [0, Math.PI / 2]]) {
        const diag = mesh(gBox, crateFrame, { cast: false, pos: [0, s / 2, 0], rot: [0, ry, 0], scale: [0.1, s * 1.05, s + 0.04] }); diag.rotation.z = 0.0; g.add(diag);
      }
      return { g, bodyMat, glow: 0, glowT: 0 };
    }

    function buildLevel(idx) {
      const def = LEVELS[idx], L = parseLevel(def);
      const g = new THREE.Group(); scene.add(g);
      const cx = (x) => (x - (L.w - 1) / 2) * C, cz = (y) => (y - (L.h - 1) / 2) * C;
      const cellXZ = (i) => [cx(i % L.w), cz((i / L.w) | 0)];
      // podium
      g.add(mesh(gBox, stageMat, { pos: [0, -0.15, 0], scale: [L.w * C + 1.2, 0.3, L.h * C + 1.2] }));
      g.add(mesh(gBox, mat(0x23160c), { pos: [0, -0.3, 0], scale: [L.w * C + 1.6, 0.1, L.h * C + 1.6] }));
      // vloer + muren (instanced)
      const nF = L.floors.length; let nW = 0; for (let i = 0; i < L.w * L.h; i++) if (L.wall[i] && !L.void[i]) nW++;
      const fl = new THREE.InstancedMesh(gBox, floorMat, nF); fl.receiveShadow = true;
      const d = new THREE.Object3D(); const cc = new THREE.Color();
      L.floors.forEach((i, k) => {
        const [x, z] = cellXZ(i); const gx = i % L.w, gy = (i / L.w) | 0;
        d.position.set(x, 0.03, z); d.rotation.set(0, ((gx * 7 + gy * 3) % 4) * Math.PI / 2, 0); d.scale.set(C - 0.05, 0.06, C - 0.05); d.updateMatrix();
        fl.setMatrixAt(k, d.matrix); fl.setColorAt(k, cc.setHSL(0.09, 0.35, ((gx + gy) & 1) ? 0.78 : 0.68));
      });
      g.add(fl);
      const wl = new THREE.InstancedMesh(gBox, wallMat, Math.max(1, nW)); wl.castShadow = true; wl.receiveShadow = true;
      const wc = new THREE.InstancedMesh(gBox, wallCapMat, Math.max(1, nW)); wc.castShadow = true;
      let k = 0; const wallCells = [];
      for (let i = 0; i < L.w * L.h; i++) if (L.wall[i] && !L.void[i]) {
        const [x, z] = cellXZ(i); wallCells.push([x, z, i]);
        d.rotation.set(0, 0, 0); d.position.set(x, 0.62, z); d.scale.set(C, 1.24, C); d.updateMatrix(); wl.setMatrixAt(k, d.matrix); wl.setColorAt(k, cc.setHSL(0.07 + ((i * 13) % 5) * 0.008, 0.2, 0.82 + ((i * 7) % 4) * 0.04));
        d.position.set(x, 1.3, z); d.scale.set(C + 0.1, 0.14, C + 0.1); d.updateMatrix(); wc.setMatrixAt(k, d.matrix); k++;
      }
      g.add(wl); g.add(wc);
      // versiering op sommige muren
      let deco = 0;
      wallCells.forEach(([x, z, i], n) => {
        if (deco > 11) return; const r = (i * 2654435761 >>> 0) % 100;
        if (r < 16) { const b = P.barrel(1.25); b.position.set(x, 1.36, z); b.rotation.y = r; g.add(b); deco++; }
        else if (r < 26) { const s = P.sack(1.3); s.position.set(x, 1.36, z); s.rotation.y = r; g.add(s); deco++; }
        else if (r < 33) { const m = P.mushroom(1.4, 0xd8442c); m.position.set(x, 1.34, z); g.add(m); deco++; }
      });
      // doelplaten
      const goals = [];
      for (const gi of L.goals) {
        const [x, z] = cellXZ(gi);
        const plate = mesh(gBox, goalMat, { cast: false, pos: [x, 0.09, z], scale: [C - 0.3, 0.07, C - 0.3] });
        const beam = mesh(new THREE.CylinderGeometry(0.62, 0.78, 2.4, 12, 1, true), beamMat, { cast: false, receive: false, pos: [x, 1.3, z] });
        g.add(plate); g.add(beam); goals.push({ gi, plate, beam, x, z, ok: false });
      }
      // kratten
      const crates = L.crates.map((ci, n) => {
        const cr = makeCrate(n & 1); const [x, z] = cellXZ(ci);
        cr.g.position.set(x, 0.06, z); g.add(cr.g);
        cr.x = x; cr.z = z; cr.tx = x; cr.tz = z; return cr;
      });
      // spelers
      const chars = [0, 1].map((i) => {
        const c = ctx.make.brother(i); const [x, z] = cellXZ(L.players[i]);
        c.group.scale.setScalar(0.92); c.group.position.set(x, 0.06, z); g.add(c.group);
        const ring = mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9 }), { cast: false, receive: false, pos: [x, 0.13, z], rot: [Math.PI / 2, 0, 0] }); g.add(ring);
        const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture(players[i].name, players[i].css), transparent: true, depthWrite: false }));
        label.renderOrder = 12; g.add(label);
        return { c, ring, label, x, z, tx: x, tz: z, bump: 0, bdx: 0, bdz: 0, dir: -1, buf: -1, bufT: 0, cd: 0, held: 0, pushT: 0, i };
      });
      chars.forEach((a) => { a.tx = a.x; a.tz = a.z; });
      return { idx, def, L, g, cellXZ, cx, cz, p: [...L.players], c: [...L.crates], crates, goals, chars, moves: [0, 0], pushes: 0, tStart: t, solved: false, warned: new Set(), resetHold: 0, skipHold: 0, slideX: 0 };
    }

    function setLevelVisuals(lv, snap) {
      // doelplaten/kratten status
      lv.c.forEach((ci, k) => {
        const on = !!lv.L.goal[ci]; const cr = lv.crates[k];
        cr.glowT = on ? 1 : 0;
      });
      for (const gl of lv.goals) {
        const has = lv.c.includes(gl.gi);
        if (has !== gl.ok) { gl.ok = has; gl.plate.material = has ? goalOkMat : goalMat; gl.beam.visible = !has; }
      }
    }

    // ------------------------------------------------------------------ camera
    const fitCam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 500);
    const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    const ELEV = 52 * Math.PI / 180;
    function fitCamera(L, snap) {
      fitCam.fov = camera.fov; fitCam.aspect = camera.aspect || 16 / 9; fitCam.updateProjectionMatrix();
      const hw = L.w * C / 2 + 1.0, hd = L.h * C / 2 + 1.0;
      const cen = new THREE.Vector3(0, 0.4, 0.6);
      const corners = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 1.9]) corners.push(new THREE.Vector3(sx * hw, y, sz * hd));
      let best = 60;
      for (let dist = 12; dist < 70; dist += 0.4) {
        fitCam.position.set(cen.x, cen.y + Math.sin(ELEV) * dist, cen.z + Math.cos(ELEV) * dist); fitCam.lookAt(cen); fitCam.updateMatrixWorld(); fitCam.updateProjectionMatrix();
        let ok = true;
        for (const c of corners) { tmpV.copy(c).project(fitCam); if (Math.abs(tmpV.x) > 0.9 || tmpV.y > 0.66 || tmpV.y < -0.74) { ok = false; break; } }
        if (ok) { best = dist; break; }
      }
      camPos.set(cen.x, cen.y + Math.sin(ELEV) * best, cen.z + Math.cos(ELEV) * best); camLook.copy(cen);
      if (snap) { camera.position.copy(camPos); camera.lookAt(camLook); camTarget.copy(camLook); }
    }
    function updateCamera(dt) {
      camera.position.x = damp(camera.position.x, camPos.x, 3, dt); camera.position.y = damp(camera.position.y, camPos.y, 3, dt); camera.position.z = damp(camera.position.z, camPos.z, 3, dt);
      camTarget.x = damp(camTarget.x, camLook.x, 3, dt); camTarget.y = damp(camTarget.y, camLook.y, 3, dt); camTarget.z = damp(camTarget.z, camLook.z, 3, dt);
      camera.lookAt(camTarget);
    }

    // ------------------------------------------------------------------ spelverloop
    let state = 'play';        // play | clear | slide | over
    let stateT = 0;
    let timeLeft = TOTAL_TIME, solvedCount = 0, skipped = 0, finished = false, started = false;
    let confettiQ = 0;

    function startLevel(idx) {
      lvl = buildLevel(idx); setLevelVisuals(lvl, true);
      fitCamera(lvl.L, !started && !prev);
      hud.setHint(lvl.def.hint);
      updateHud();
    }
    function updateHud() {
      hud.setScore(`Level ${Math.min(lvl.idx + 1, LEVELS.length)} / ${LEVELS.length}  ·  opgelost: ${solvedCount}`);
      hud.setPlayerInfo(0, `Stappen: ${lvl.moves[0]}`); hud.setPlayerInfo(1, `Stappen: ${lvl.moves[1]}`);
    }

    function confetti(x, y, z, n = 26) {
      fx.particles.burst(x, y, z, { count: n, speed: 6, up: 1.6, spread: 1.2, life: 1.7, size: 0.34, colors: CONFETTI, gravity: 7 });
    }
    function levelSolved(skip = false) {
      if (skip) { skipped++; audio.sfx('buzz', { vol: 0.5 }); hud.toast('Level overgeslagen', 1600); }
      else {
        solvedCount++; audio.sfx('powerup'); setTimeout(() => audio.sfx('bell', { vol: 0.8 }), 180); setTimeout(() => audio.sfx('sparkle'), 420);
        hud.showBig(`Level ${lvl.idx + 1} klaar!`, 1400, '#ffe14a'); ctx.shake(0.25);
        lvl.chars.forEach((a) => { a.c.pose = 'cheer'; a.c.jump(); });
        wim.pose = 'cheer'; confettiQ = 1.1;
        for (const gl of lvl.goals) { fx.particles.ring(gl.x, 0.3, gl.z, { count: 16, speed: 4, color: 0x7affa0 }); confetti(gl.x, 1.5, gl.z, 14); }
      }
      lvl.solved = !skip; state = 'clear'; stateT = 0; hud.setHint(null); updateHud();
    }

    function gotoNext() {
      const next = lvl.idx + 1;
      if (next >= LEVELS.length) { endGame(); return; }
      prev = lvl;
      startLevel(next);
      lvl.g.position.x = SLIDE_X; lvl.slideX = SLIDE_X;
      state = 'slide'; stateT = 0; audio.sfx('whoosh', { vol: 0.6 });
      hud.toast(`Level ${next + 1}: ${lvl.def.name}`, 2200);
      wim.pose = 'point';
    }

    function endGame(timeout = false) {
      if (finished) return; finished = true; state = 'over';
      const stars = solvedCount >= 7 ? 3 : solvedCount >= 5 ? 2 : solvedCount >= 3 ? 1 : 0;
      hud.setHint(null);
      if (lvl) lvl.chars.forEach((a) => { a.c.pose = stars ? 'cheer' : 'sad'; });
      wim.pose = stars ? 'cheer' : 'sad';
      if (!timeout) { const b = Math.min(15, Math.floor(timeLeft / 8)); if (b > 0) ctx.bonus(b); }
      const left = Math.max(0, Math.round(timeLeft));
      ctx.finish({
        stars, score: solvedCount,
        summary: timeout
          ? `De tijd is om! Jullie losten <b>${solvedCount}</b> van de ${LEVELS.length} levels op.${skipped ? ` (${skipped} overgeslagen)` : ''}`
          : `Alle levels gehad! <b>${solvedCount}</b> van de ${LEVELS.length} opgelost met nog ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} over.`,
      });
    }

    // ------------------------------------------------------------------ stappen zetten
    function doMove(who, d) {
      const lv = lvl, L = lv.L, a = lv.chars[who];
      const [dx, dy] = DIRS[d];
      a.c.faceDir(dx, dy);
      const r = tryMove(L, lv.p, lv.c, who, dx, dy);
      if (!r) {
        a.bump = 0.001; a.bdx = dx; a.bdz = dy;
        if (t - (a.lastBumpSnd || 0) > 0.35) { a.lastBumpSnd = t; audio.sfx('thud', { vol: 0.18, rate: 1.2 }); }
        return false;
      }
      lv.p[who] = r.to; lv.moves[who]++;
      const [x, z] = lv.cellXZ(r.to); a.tx = x; a.tz = z;
      audio.sfx('step', { vol: 0.1, rate: 0.9 + Math.random() * 0.3 });
      if (r.crate >= 0) {
        const cr = lv.crates[r.crate]; const [cx2, cz2] = lv.cellXZ(r.crateTo); cr.tx = cx2; cr.tz = cz2;
        const wasOn = !!L.goal[lv.c[r.crate]]; lv.c[r.crate] = r.crateTo; lv.pushes++;
        a.pushT = 0.3; a.c.pose = 'push';
        audio.sfx('wood', { vol: 0.5, rate: 0.85 + Math.random() * 0.3 });
        fx.particles.dust(cr.x + dx * 0.5, 0.05, cr.z + dy * 0.5, 4, 0xd8c8a8);
        const isOn = !!L.goal[r.crateTo];
        if (isOn && !wasOn) { audio.sfx('ding', { vol: 0.7 }); fx.particles.burst(cx2, 0.5, cz2, { count: 14, speed: 3.5, colors: [0x7affa0, 0xffffff, 0xffe14a], size: 0.25, life: 0.9 }); fx.texts.add('✓', cx2, 2.6, cz2, '#7affa0', 0.9); }
        else if (!isOn && wasOn) audio.sfx('click', { vol: 0.4 });
        setLevelVisuals(lv);
        checkDeadlock(lv, r.crate);
        updateHud();
        if (isSolved(L, lv.c)) { levelSolved(); }
      } else updateHud();
      return true;
    }

    // simpele hoek-detectie (krat vast in een hoek, niet op een doel) -> vriendelijke hint
    function checkDeadlock(lv, k) {
      const L = lv.L, ci = lv.c[k]; if (L.goal[ci] || lv.warned.has(ci)) return;
      const x = ci % L.w, y = (ci / L.w) | 0; const w = (xx, yy) => L.wall[yy * L.w + xx] === 1;
      if ((w(x - 1, y) || w(x + 1, y)) && (w(x, y - 1) || w(x, y + 1))) {
        lv.warned.add(ci); hud.toast(`Die krat zit vast in een hoek! Houd ${KEY_LABELS[0].b} of ${KEY_LABELS[1].b} ingedrukt om opnieuw te beginnen.`, 3600); audio.sfx('buzz', { vol: 0.35 });
      }
    }

    function resetLevel() {
      const lv = lvl, L = lv.L;
      lv.p = [...L.players]; lv.c = [...L.crates]; lv.moves = [0, 0]; lv.pushes = 0; lv.warned.clear();
      lv.chars.forEach((a) => { const [x, z] = lv.cellXZ(lv.p[a.i]); a.x = a.tx = x; a.z = a.tz = z; a.bump = 0; a.c.pose = 'idle'; fx.particles.burst(x, 0.8, z, { count: 12, speed: 3, colors: [0xffffff, 0xffe14a], size: 0.25, life: 0.7 }); });
      lv.crates.forEach((cr, n) => { const [x, z] = lv.cellXZ(L.crates[n]); cr.x = cr.tx = x; cr.z = cr.tz = z; fx.particles.dust(x, 0.1, z, 4); });
      setLevelVisuals(lv); updateHud();
      audio.sfx('whoosh', { vol: 0.7 }); hud.toast('Level opnieuw!', 1000);
      hud.setHint(lv.def.hint);
    }

    // ------------------------------------------------------------------ input
    function handleInput(dt) {
      const lv = lvl;
      let reset = 0, aBoth = 0;
      for (let i = 0; i < 2; i++) {
        const p = input.p[i], a = lv.chars[i];
        const pr = [p.upP, p.downP, p.leftP, p.rightP], hd = [p.up, p.down, p.left, p.right];
        for (let d = 0; d < 4; d++) if (pr[d]) { a.dir = d; a.buf = d; a.bufT = 0.2; }
        if (a.dir >= 0 && !hd[a.dir]) a.dir = hd.indexOf(true);
        a.bufT -= dt; a.cd -= dt;
        if (a.cd <= 0) {
          let d = -1, fresh = false;
          if (a.buf >= 0 && a.bufT > 0) { d = a.buf; fresh = true; } else if (a.dir >= 0) d = a.dir;
          a.buf = -1;
          if (d >= 0) {
            const moved = doMove(i, d);
            a.cd = moved ? (fresh ? STEP * 1.45 : STEP) : (fresh ? 0.12 : 0.28);
            if (state !== 'play') return;
          }
        }
        if (p.b) reset = Math.max(reset, 1);
        if (p.a) aBoth++;
      }
      // B vasthouden = level herstarten
      if (reset) { lv.resetHold += dt; } else lv.resetHold = Math.max(0, lv.resetHold - dt * 3);
      if (lv.resetHold > 0.05) {
        const n = Math.min(8, Math.round(lv.resetHold / RESET_HOLD * 8));
        hud.setHint(`↺ Level herstarten… ${'▰'.repeat(n)}${'▱'.repeat(8 - n)}`);
        if (lv.resetHold >= RESET_HOLD) { lv.resetHold = 0; resetLevel(); }
        lv._hintOn = true;
      } else if (lv._hintOn) { lv._hintOn = false; hud.setHint(hintFor(lv)); }
      // allebei A vasthouden: level overslaan (pas na een tijdje)
      const stuck = t - lv.tStart > SKIP_AFTER;
      if (stuck && !lv._skipHint) { lv._skipHint = true; hud.setHint(hintFor(lv)); }
      if (stuck && aBoth === 2) { lv.skipHold += dt; if (lv.skipHold > 1.4) levelSolved(true); } else lv.skipHold = 0;
    }
    const hintFor = (lv) => lv.def.hint + ((t - lv.tStart > SKIP_AFTER) ? `<br><small>Echt vast? Houd allebei A (${KEY_LABELS[0].a} + ${KEY_LABELS[1].a}) ingedrukt om over te slaan.</small>` : '');

    // ------------------------------------------------------------------ visuele update
    function actors(lv, dt, active = true) {
      const speed = C / STEP * 1.1;
      for (const a of lv.chars) {
        const dx = a.tx - a.x, dz = a.tz - a.z; const dist = Math.hypot(dx, dz);
        const mv = Math.min(dist, speed * dt);
        if (dist > 0.001) { a.x += dx / dist * mv; a.z += dz / dist * mv; }
        const moving = dist > 0.05;
        a.c.speed = damp(a.c.speed, moving ? 1 : 0, 18, dt);
        a.pushT -= dt; if (a.pushT <= 0 && a.c.pose === 'push') a.c.pose = state === 'clear' ? 'cheer' : 'idle';
        let ox = 0, oz = 0;
        if (a.bump > 0) { a.bump += dt; const k = a.bump / 0.16; if (k >= 1) a.bump = 0; else { const s = Math.sin(k * Math.PI) * 0.2; ox = a.bdx * s; oz = a.bdz * s; } }
        const hop = moving ? Math.abs(Math.sin(dist / C * Math.PI)) * 0.1 : 0;
        a.c.group.position.set(a.x + ox, 0.06 + hop, a.z + oz);
        a.ring.position.set(a.x + ox, 0.14, a.z + oz);
        a.ring.scale.setScalar(1 + Math.sin(t * 4 + a.i * 2) * 0.04);
        a.label.position.set(a.x, a.c.height * 0.92 + 0.85 + Math.sin(t * 3 + a.i) * 0.06, a.z + 0.2);
        a.label.quaternion.copy(camera.quaternion);
        a.c.update(dt);
      }
      for (const cr of lv.crates) {
        const dx = cr.tx - cr.x, dz = cr.tz - cr.z; const dist = Math.hypot(dx, dz);
        const mv = Math.min(dist, speed * dt);
        if (dist > 0.001) { cr.x += dx / dist * mv; cr.z += dz / dist * mv; }
        cr.g.position.set(cr.x, 0.06, cr.z);
        cr.glow = damp(cr.glow, cr.glowT, 8, dt);
        cr.bodyMat.emissive.setRGB(lerp(0.23, 0.13, cr.glow), lerp(0.13, 0.8, cr.glow), lerp(0.03, 0.33, cr.glow)); cr.bodyMat.emissiveIntensity = lerp(1, 0.42 + Math.sin(t * 5) * 0.07, cr.glow);
      }
      const pulse = 0.75 + Math.sin(t * 4) * 0.25;
      for (const gl of lv.goals) { if (!gl.ok) { gl.beam.scale.set(1 + Math.sin(t * 3 + gl.gi) * 0.06, 1, 1 + Math.sin(t * 3 + gl.gi) * 0.06); } }
      goalMat.emissiveIntensity = 0.55 + pulse * 0.6; beamMat.opacity = 0.14 + pulse * 0.1;
    }

    const dustT = { v: 0 };
    function ambient(dt) {
      t += dt;
      for (const b of animated.banners) P.animateBanner(b, t);
      for (const f of animated.fires) P.animateFire(f, t);
      for (const l of animated.lamps) { l.g.rotation.z = Math.sin(t * 0.9 + l.ph) * 0.03; l.g.rotation.x = Math.cos(t * 0.7 + l.ph) * 0.02; }
      // heftruck rijdt heen en weer met een krat
      const fk = fkState;
      if (fk.wait > 0) { fk.wait -= dt; fk.lift = damp(fk.lift, fk.wait > 1 ? 1.3 : 0, 3, dt); }
      else { fk.x += fk.dir * 3.2 * dt; if (Math.abs(fk.x) > 30) { fk.x = Math.sign(fk.x) * 30; fk.dir *= -1; fk.wait = 3 + Math.random() * 3; } if (Math.random() < 0.15) fx.particles.dust(fk.x - fk.dir * 1.2, 0, -11, 1, 0xb0a090); }
      fkMove.position.x = fk.x; fkMove.rotation.y = fk.dir > 0 ? 0 : Math.PI; fkMove.userData.fork.position.y = 0.3 + fk.lift;
      // stofdeeltjes in het lamplicht
      dustT.v -= dt;
      if (dustT.v <= 0) {
        dustT.v = 0.11;
        fx.particles.emit(rand(-14, 14), rand(2, 9), rand(-12, 8), rand(-0.1, 0.1), rand(-0.05, 0.12), rand(-0.1, 0.1), { life: rand(3.5, 6), size: rand(0.1, 0.2), color: 0xffe9b8, gravity: 0, shrink: false });
      }
      wim.update(dt);
    }

    function stepCamAndStage(dt) {
      updateCamera(dt);
    }

    // ------------------------------------------------------------------ hoofdlus
    startLevel(0);

    function update(dt) {
      started = true;
      ambient(dt);
      if (!finished) {
        timeLeft -= dt;
        hud.setTimer(timeLeft, 30);
        if (timeLeft <= 0 && state !== 'over') { hud.setTimer(0); endGame(true); }
      }
      stateT += dt;
      if (state === 'play' && !finished) {
        // pas laten starten als het level helemaal binnen is
        handleInput(dt);
        if (!lvl._hinted && t - lvl.tStart > SKIP_AFTER) { lvl._hinted = true; hud.setHint(hintFor(lvl)); }
      } else if (state === 'clear') {
        if (confettiQ > 0) { confettiQ -= dt; if (Math.random() < 0.5) confetti(rand(-7, 7), rand(3, 7), rand(-5, 3), 12); }
        if (stateT > 1.9 && !finished) gotoNext();
      } else if (state === 'slide') {
        const k = clamp(stateT / 1.1, 0, 1), e = k * k * (3 - 2 * k);
        lvl.g.position.x = SLIDE_X * (1 - e);
        if (prev) prev.g.position.x = -SLIDE_X * e;
        if (k >= 1) {
          lvl.g.position.x = 0; if (prev) { scene.remove(prev.g); disposeGroup(prev.g); prev = null; }
          state = 'play'; stateT = 0; lvl.tStart = t;
          hud.setHint(lvl.def.hint);
        }
      }
      if (lvl) actors(lvl, dt);
      if (prev) actors(prev, dt);
      stepCamAndStage(dt);
      if (!finished && timeLeft < 30 && wim.pose !== 'scared' && state === 'play') wim.pose = 'scared';
    }

    function disposeGroup(g) {
      g.traverse((o) => { if (o.geometry && o.geometry !== gBox && o.geometry !== ringGeo && o.geometry !== labelGeo) o.geometry.dispose(); });
    }

    return {
      update,
      introUpdate(dt) { ambient(dt); if (lvl) actors(lvl, dt); updateCamera(dt); },
      resultUpdate(dt) { ambient(dt); if (lvl) actors(lvl, dt); if (prev) actors(prev, dt); updateCamera(dt); },
      onStart() { lvl.tStart = t; hud.setTimer(TOTAL_TIME, 30); hud.setHint(lvl.def.hint); updateHud(); hud.toast(`Level 1: ${lvl.def.name}`, 2000); },
      onCountdown() { hud.setTimer(TOTAL_TIME, 30); updateHud(); },
      onResize() { if (lvl) fitCamera(lvl.L, false); },
      dispose() {},
      // alleen voor tests
      _dbg: { get lvl() { return lvl; }, get state() { return state; }, move: (who, d) => doMove(who, d), get solved() { return solvedCount; }, setTime: (s) => { timeLeft = s; }, goto: (i) => { if (prev) { scene.remove(prev.g); prev = null; } if (lvl) scene.remove(lvl.g); startLevel(i); fitCamera(lvl.L, true); state = 'play'; stateT = 0; lvl.tStart = t; } },
    };
  },
};

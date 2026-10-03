import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, TAU, glow, canvasTex } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { KEY_LABELS } from '../engine/input.js';
import * as P from '../engine/props.js';

// Muur Slopen: samenwerkings-Breakout in 3D. Twee broers, twee bats op dezelfde baan, een zware slopkogel.
// Muur 1 (kasteel of hart) en muur 2 (draak, moeilijker). Sterren: 1* >=50% van muur 1, 2* muur 1 helemaal, 3* muur 1 + >=50% van muur 2.

const TIME = 75;
const COLS = 12, ROWS = 8, BW = 2.0, BH = 1.2, X0 = -12, Z0 = -12.4;
const XL = 12;              // zijmuren op x = +-12
const BAT_Z = 7.6, PIT_Z = 10.3;
const BALL_R = 0.62;
const BRICK_H = 1.5;

// patroon-tekens: G steen, R dak, W raam(gloeit), D deur, I ijzer (3 treffers), B bom, Y vlag, H hart, P roze,
// N donkergroen (vleugel), L lichtgroen (kop), E oog, O oranje buik, T staart, F groen lijf
const PATTERNS = {
  castle: ['Y....YY....Y', 'RR..RRRR..RR', 'GG..GWWG..GG', 'GWGGGGGGGGWG', 'GGGGGDDGGGGG', 'GIG.GDDG.GIG', 'GBG......GBG', '............'],
  heart: ['..PPP..HHH..', '.PPHHHHHHHH.', 'PHHHHHHHHHHH', 'HHHHHBBHHHHH', '.HHHHHHHHHH.', '..HHHHHHHH..', '....HHHH....', '.....II.....'],
  dragon: ['....N..NN...', '...NNNNNNN..', 'LL.NNNNNNNN.', 'LELFFFFFFFFT', 'LLFFOOOOFFTT', '.IFFOOOOFF.T', '..FF.BB.FF..', '..II....II..'],
};
const PALETTE = {
  G: [0xc2bcae, 0xa6b2c4, 0xcdb998, 0x9fb09a], R: [0xc8402e, 0xb8362a], W: [0xffd36a], D: [0x7a4a28, 0x6b3f22], Y: [0xf2c230], H: [0xe0364a, 0xd02e44], P: [0xff8fb0],
  N: [0x2f7a3a, 0x2a6e34], L: [0x6fcf63], E: [0xff3a2a], O: [0xe8a23a], T: [0x2aa59a], F: [0x45a047, 0x3d9440], I: [0x8d96a3], B: [0x4a2e2e],
};
const LEVEL_NAMES = { castle: 'Kasteelmuur', heart: 'Hartjesmuur', dragon: 'Drakenmuur' };

function brickTexture(kind) {
  return canvasTex(64, 32, (g, w, h) => {
    g.fillStyle = kind === 'iron' ? '#c9ced8' : '#ece8e0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + Math.random() * 0.07})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1 + Math.random() * 3); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, h - 3, w, 3); g.fillRect(w - 3, 0, 3, h);
    if (kind === 'iron' || kind === 'iron2' || kind === 'iron3') {
      g.fillStyle = '#3a3f4a'; for (const [x, y] of [[8, 8], [56, 8], [8, 24], [56, 24]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(20,20,30,.8)'; g.lineWidth = 2;
      if (kind !== 'iron') { g.beginPath(); g.moveTo(20, 4); g.lineTo(30, 16); g.lineTo(24, 28); g.stroke(); }
      if (kind === 'iron3') { g.beginPath(); g.moveTo(44, 2); g.lineTo(38, 14); g.lineTo(50, 30); g.stroke(); g.beginPath(); g.moveTo(30, 16); g.lineTo(46, 18); g.stroke(); }
    }
    if (kind === 'bomb') {
      g.fillStyle = '#111'; g.beginPath(); g.arc(32, 19, 10, 0, 7); g.fill();
      g.strokeStyle = '#d8b878'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(36, 10); g.quadraticCurveTo(42, 4, 46, 7); g.stroke();
      g.fillStyle = '#ffb020'; g.beginPath(); g.arc(47, 7, 3.5, 0, 7); g.fill(); g.fillStyle = '#ff4020'; g.beginPath(); g.arc(47, 7, 1.6, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(28, 15, 3, 0, 7); g.fill();
    }
  }, {});
}

function powerTexture(type) {
  const COL = { multi: '#e8a020', wide: '#2fa0e0', fire: '#e8402a', slow: '#8a5cd8', life: '#e0386a' }[type];
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = COL; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(w / 2, h / 2, 56, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'multi') { for (const [x, y] of [[64, 34], [38, 80], [90, 80]]) { g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); } }
    else if (type === 'wide') { g.beginPath(); g.moveTo(24, 64); g.lineTo(104, 64); g.stroke(); g.beginPath(); g.moveTo(40, 44); g.lineTo(20, 64); g.lineTo(40, 84); g.stroke(); g.beginPath(); g.moveTo(88, 44); g.lineTo(108, 64); g.lineTo(88, 84); g.stroke(); }
    else if (type === 'fire') { g.beginPath(); g.moveTo(64, 14); g.bezierCurveTo(100, 50, 104, 74, 86, 100); g.bezierCurveTo(76, 112, 52, 112, 42, 100); g.bezierCurveTo(24, 78, 40, 56, 64, 14); g.fill(); g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(64, 56); g.bezierCurveTo(82, 78, 80, 92, 64, 98); g.bezierCurveTo(48, 92, 46, 78, 64, 56); g.fill(); }
    else if (type === 'slow') { g.beginPath(); g.moveTo(38, 22); g.lineTo(90, 22); g.lineTo(64, 64); g.closePath(); g.fill(); g.beginPath(); g.moveTo(38, 106); g.lineTo(90, 106); g.lineTo(64, 64); g.closePath(); g.fill(); g.fillRect(32, 14, 64, 8); g.fillRect(32, 106, 64, 8); }
    else if (type === 'life') { g.beginPath(); g.moveTo(64, 104); g.bezierCurveTo(8, 66, 20, 20, 64, 46); g.bezierCurveTo(108, 20, 120, 66, 64, 104); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  }, {});
}

export default {
  id: 'breakout',
  name: 'Muur Slopen',
  giver: 'Metselaar Mo',
  icon: '🧱',
  mode: 'coop',
  time: TIME,
  pay: 1.2,
  music: 'game',
  blurb: 'Een oude kastelenmuur moet weg voor het nieuwe <b>concertpodium</b>! Sloop de muur met de zware <b>slopkogel</b>. Jullie bats staan op <b>dezelfde baan</b>, dus verdeel wie waar staat. Kaats de bal om en om terug voor een <b>samenspel-combo</b>!',
  controls: ['{move} bat links/rechts', '{a} bal lanceren', '{b} smash (slag, even wachten)'],
  tip: 'Mis je de bal met allebei? Dan gaat er 1 van de 3 levens af. Vang power-ups met je bat. Wie smasht, slaat de bal extra hard!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const R = ctx.rng;
    const rr = (a, b) => a + R() * (b - a);
    const diff = ctx.difficulty || 1;
    ctx.lights('day', { shadow: 21, center: [0, 0, -1] });
    const group = new THREE.Group(); scene.add(group);

    // =====================================================================
    //  WERELD
    // =====================================================================
    // grond buiten het veld
    const ground = mesh(new THREE.PlaneGeometry(220, 160), new THREE.MeshStandardMaterial({ map: tex.grass(50, 36), roughness: 1 }), { cast: false, pos: [0, -0.05, -20], rot: [-Math.PI / 2, 0, 0] });
    group.add(ground);
    // het speelveld: stenen platen met krijtlijnen
    const FLEN = 23.0;
    const fieldTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#6f6b64'; g.fillRect(0, 0, w, h);
      const cell = 512 / 12;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        const l = 138 + Math.floor(Math.random() * 38);
        g.fillStyle = `rgb(${l},${l - 4},${l - 12})`; g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x * cell + 3, y * cell + 3, cell - 8, 3);
        for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x * cell + Math.random() * cell, y * cell + Math.random() * cell, 4, 3); }
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.setLineDash([14, 12]);
      g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h - 90); g.stroke();
      const yb = (BAT_Z + 1.4 - Z0) / FLEN * 512; g.beginPath(); g.moveTo(10, yb); g.lineTo(w - 10, yb); g.stroke(); g.setLineDash([]);
      for (const [i, col] of [[0, '#35c46f'], [1, '#4a8cff']]) { const cx = (i ? 0.75 : 0.25) * w, cy = (BAT_Z - Z0) / FLEN * 512; g.strokeStyle = col; g.lineWidth = 5; g.globalAlpha = 0.6; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.stroke(); g.globalAlpha = 1; }
    }, {});
    const field = mesh(new THREE.BoxGeometry(24.4, 0.4, FLEN), [mat(0x6a6660), mat(0x6a6660), new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 1 }), mat(0x55514c), mat(0x6a6660), mat(0x6a6660)], { cast: false, pos: [0, -0.2, Z0 + FLEN / 2 - 0.1] });
    group.add(field);
    // put (afgrond) voor de bats
    group.add(mesh(new THREE.BoxGeometry(24.4, 0.2, 9), mat(0x0d0a10), { cast: false, receive: false, pos: [0, -0.08, PIT_Z + 4.6 + 0.2] }));
    group.add(mesh(new THREE.BoxGeometry(24.8, 0.7, 0.7), mat(0x7b5a36), { pos: [0, 0.2, PIT_Z + 0.2] }));
    // zijmuurtjes met fakkels
    const wallStoneTex = tex.stone(6, 1);
    for (const sx of [-1, 1]) {
      group.add(mesh(new THREE.BoxGeometry(1.0, 1.5, FLEN + 0.5), new THREE.MeshStandardMaterial({ map: wallStoneTex, roughness: 0.95, flatShading: true }), { pos: [sx * (XL + 0.5), 0.7, Z0 + FLEN / 2 - 0.1] }));
      for (let i = 0; i < 6; i++) group.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 1.3), mat(0x9b9ca3), { pos: [sx * (XL + 0.5), 1.7, Z0 + 1.2 + i * 4.4] }));
    }
    const torches = [];
    for (const sx of [-1, 1]) for (const z of [-9, 0, 8]) { const tc = P.torch(); if (tc.userData.light) { tc.remove(tc.userData.light); delete tc.userData.light; } tc.position.set(sx * (XL + 0.5), 1.45, z); tc.scale.setScalar(1.2); group.add(tc); torches.push(tc); }
    // achterste funderingsbalk (de ondergrond van de oude muur)
    group.add(mesh(new THREE.BoxGeometry(24.4, 0.6, 1.2), new THREE.MeshStandardMaterial({ map: tex.stone(5, 1), roughness: 0.95, flatShading: true }), { pos: [0, 0.25, Z0 - 0.6] }));
    // ruines links en rechts van de muur
    for (const sx of [-1, 1]) {
      const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(2, 2), roughness: 0.95, flatShading: true });
      group.add(mesh(new THREE.BoxGeometry(7, 5, 5), stoneM, { pos: [sx * 16.5, 2.5, Z0 + 2.6] }));
      group.add(mesh(new THREE.BoxGeometry(4, 2.4, 5), stoneM, { pos: [sx * 15.5, 6.2, Z0 + 2.6], rot: [0, 0, sx * 0.05] }));
      group.add(mesh(new THREE.BoxGeometry(2.6, 3.4, 3.4), stoneM, { pos: [sx * 20.5, 1.7, Z0 + 5] }));
      for (let i = 0; i < 5; i++) group.add(mesh(new THREE.DodecahedronGeometry(rr(0.4, 0.8)), mat(0x8c8a90), { pos: [sx * rr(14.5, 22), 0.3, rr(Z0 + 6, Z0 + 18)], rot: [rr(0, 3), rr(0, 3), 0] }));
    }

    // het toekomstige concertpodium achter de muur
    const lightBeams = [];
    {
      const stage = new THREE.Group(); stage.position.set(0, 0, -22); group.add(stage);
      stage.add(mesh(new THREE.BoxGeometry(26, 1.6, 9), new THREE.MeshStandardMaterial({ map: tex.planks(6, 2, '#b98a54'), roughness: 0.9 }), { pos: [0, 0.8, 0] }));
      stage.add(mesh(new THREE.BoxGeometry(26, 10, 0.5), mat(0x7a1f2e), { pos: [0, 6.6, -4.4] }));
      for (let i = 0; i < 9; i++) stage.add(mesh(new THREE.BoxGeometry(0.9, 9.6, 0.65), mat(i % 2 ? 0x8a2538 : 0x6a1826), { pos: [-12 + i * 3, 6.4, -4.1] }));
      // truss met lampen
      stage.add(mesh(new THREE.BoxGeometry(26, 0.35, 0.35), mat(0x555a66, { metalness: 0.6 }), { pos: [0, 11, 1.5] }));
      for (const sx of [-12.5, 12.5]) stage.add(mesh(new THREE.BoxGeometry(0.4, 11, 0.4), mat(0x555a66, { metalness: 0.6 }), { pos: [sx, 5.5, 1.5] }));
      const colors = [0xff3a6a, 0x3aa0ff, 0xffd23f, 0x6aff7a, 0xc06aff, 0xff8a2a];
      for (let i = 0; i < 6; i++) {
        const x = -10 + i * 4;
        stage.add(mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.9, 8), mat(0x222228), { cast: false, pos: [x, 10.4, 1.5], rot: [0.5, 0, 0] }));
        const beam = mesh(new THREE.ConeGeometry(2.2, 12, 14, 1, true), new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), { cast: false, receive: false });
        beam.geometry.translate(0, -6, 0); beam.position.set(x, 10.4, 1.5); beam.rotation.x = 0.35; stage.add(beam); lightBeams.push({ m: beam, ph: i * 1.1 });
      }
      // speakers
      for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
        stage.add(mesh(new THREE.BoxGeometry(2.4, 2.6, 2), mat(0x1c1c24), { pos: [sx * 11, 2.9 + k * 2.7, 0.2 - k * 0.2] }));
        for (const yy of [0.5, -0.5]) stage.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 14), mat(0x3a3a48), { cast: false, pos: [sx * 11, 2.9 + k * 2.7 + yy, 1.25 - k * 0.2], rot: [Math.PI / 2, 0, 0] }));
      }
      // drumstel-achtig + poster
      const pst = mesh(new THREE.PlaneGeometry(5, 7.5), new THREE.MeshStandardMaterial({ map: tex.poster('DJ Dobber') }), { cast: false, pos: [0, 5.2, -4.0] });
      stage.add(pst);
      stage.add(mesh(new THREE.BoxGeometry(5.4, 0.3, 0.3), mat(0x5b3d24), { cast: false, pos: [0, 9.1, -3.9] }));
      group.userData.stage = stage;
    }
    // bomen en struiken
    for (let i = 0; i < 16; i++) { const a = i / 15; const tr = i % 3 === 0 ? P.pine(rr(6, 9)) : P.tree(rr(5, 8)); tr.position.set(-46 + a * 92 + rr(-2, 2), -0.05, -rr(34, 46)); group.add(tr); }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const tr = P.tree(rr(5, 7)); tr.position.set(sx * rr(28, 36), -0.05, rr(-14, 4)); group.add(tr); }
    for (let i = 0; i < 5; i++) { const c = P.cloud(rr(1.4, 2.2)); c.position.set(-60 + i * 30, rr(32, 44), -rr(50, 70)); group.add(c); lightBeams.push({ cloud: c }); }
    // bouwplaats-decor langs de randen
    {
      const bx = [[-17.5, 1], [-19.5, 7], [17.5, 11], [20, 6]];
      bx.forEach(([x, z], i) => { const c = i % 2 ? P.barrel(1.2) : P.crate(1.4); c.position.set(x, 0, z); c.rotation.y = rr(0, 3); group.add(c); });
      // stapel stenen
      for (let k = 0; k < 3; k++) for (let j = 0; j < 4 - k; j++) group.add(mesh(new THREE.BoxGeometry(1.6, 0.7, 0.9), mat(0xb9b4aa), { pos: [-17 + j * 1.7 + k * 0.85, 0.35 + k * 0.7, 10.5] }));
      const fl = P.flowerPatch(0xff6fa5, 8, 1.4); fl.position.set(18, 0, 10); group.add(fl);
    }

    // toeschouwers en Metselaar Mo
    const crowd = [];
    {
      const mo = makeNPC('mason'); mo.group.position.set(-15.2, 0, 5); mo.faceDir(1, -0.4); mo.hold(P.hammer(), 'r'); group.add(mo.group); crowd.push({ c: mo, base: 'idle', mo: true });
      const kinds = [['bard', 15.5, 4], ['kid', 16.8, 7], ['jester', 15.3, 9.5], ['baker', 18.5, 2], ['kid', -16.2, 8.5], ['guard', -18.5, 3]];
      kinds.forEach(([k, x, z], i) => { const c = makeNPC(k); c.group.position.set(x, 0, z); c.faceDir(x > 0 ? -1 : 1, -0.5); group.add(c.group); crowd.push({ c, base: 'idle', ph: i }); });
      crowd.forEach((o) => o.c.group.traverse((m) => { if (m.isMesh) m.castShadow = false; }));
    }

    // =====================================================================
    //  STENEN
    // =====================================================================
    const brickGeo = new THREE.BoxGeometry(BW - 0.12, BRICK_H, BH - 0.1);
    const brickTex = brickTexture('stone');
    const ironTex = [brickTexture('iron'), brickTexture('iron2'), brickTexture('iron3')];
    const bombTex = brickTexture('bomb');
    const matCache = new Map();
    function brickMat(ch, variant = 0, hpLevel = 3) {
      const key = ch + variant + hpLevel;
      let m = matCache.get(key);
      if (m) return m;
      if (ch === 'I') m = new THREE.MeshStandardMaterial({ map: ironTex[3 - hpLevel], color: [0xffffff, 0xd8d8e0, 0xb0b0b8][3 - hpLevel], metalness: 0.65, roughness: 0.45, flatShading: true });
      else if (ch === 'B') m = new THREE.MeshStandardMaterial({ map: bombTex, color: 0xd8a0a0, roughness: 0.7, flatShading: true });
      else {
        const cols = PALETTE[ch] || PALETTE.G; const col = cols[variant % cols.length];
        const glowing = ch === 'W' || ch === 'E';
        m = new THREE.MeshStandardMaterial({ map: brickTex, color: col, roughness: 0.85, flatShading: true, emissive: glowing ? col : 0x000000, emissiveIntensity: glowing ? 0.7 : 0 });
      }
      matCache.set(key, m); return m;
    }

    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const debris = [];
    const levels = [];       // { name, total, destroyed }
    let curWall = 0, patNames = [];
    {
      const first = R() < 0.5 ? 'castle' : 'heart';
      patNames = [first, 'dragon'];
    }
    let wallBuilt = [false, false];

    function buildWall(w, animate) {
      const pat = PATTERNS[patNames[w]];
      let total = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const ch = pat[r][c]; if (ch === '.') continue;
        // moeilijker bij muur 2: meer ijzer
        let kind = ch;
        const hp = ch === 'I' ? 3 : 1;
        const m = new THREE.Mesh(brickGeo, brickMat(kind, (r + c) % 2, hp));
        m.castShadow = true; m.receiveShadow = true;
        const x = X0 + (c + 0.5) * BW, z = Z0 + (r + 0.5) * BH;
        m.position.set(x, animate ? 16 + rr(0, 5) : BRICK_H / 2, z);
        group.add(m);
        const br = { c, r, x, z, ch, hp, maxHp: hp, mesh: m, alive: true, landed: !animate, delay: animate ? 0.05 * r + rr(0, 0.5) + 0.2 : 0, vy: 0, pulse: 0, bomb: ch === 'B', iron: ch === 'I', w };
        grid[r][c] = br; total++;
      }
      levels[w] = { name: LEVEL_NAMES[patNames[w]], total, destroyed: 0 };
      wallBuilt[w] = true;
    }
    buildWall(0, false);

    // =====================================================================
    //  BATS en SPELERS
    // =====================================================================
    function makeBatMesh(i) {
      const g = new THREE.Group();
      const body = mesh(new THREE.BoxGeometry(1, 0.9, 0.8), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, i ? '#8a5a2e' : '#a9774a'), roughness: 0.9 }), { pos: [0, 0.55, 0] });
      const stripe = mesh(new THREE.BoxGeometry(1, 0.06, 0.28), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i] }), { cast: false, pos: [0, 1.02, 0] });
      const capL = mesh(new THREE.BoxGeometry(0.34, 1.0, 0.9), mat(0x555a66, { metalness: 0.6, roughness: 0.4 }), { pos: [-0.5, 0.55, 0] });
      const capR = mesh(new THREE.BoxGeometry(0.34, 1.0, 0.9), mat(0x555a66, { metalness: 0.6, roughness: 0.4 }), { pos: [0.5, 0.55, 0] });
      g.add(body, stripe, capL, capR); group.add(g);
      return { g, body, stripe, capL, capR };
    }
    const bats = players.map((pi, i) => {
      const bm = makeBatMesh(i);
      const c = makeBrother(i); c.pose = 'push'; group.add(c.group);
      return { i, name: pi.name, x: i ? 4 : -4, vx: 0, z: BAT_Z, hw: 2.0, hwT: 2.0, wideT: 0, smashT: 0, smashCd: 0, hits: 0, bm, c, flash: 0, poseT: 0 };
    });

    // samenspel-lijn tussen de bats
    const link = mesh(new THREE.BoxGeometry(1, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0 }), { cast: false, receive: false, pos: [0, 0.6, BAT_Z] });
    group.add(link);

    // =====================================================================
    //  BALLEN
    // =====================================================================
    const ballGeo = new THREE.IcosahedronGeometry(BALL_R, 1);
    const ballMatNormal = new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0x3b3a48, roughness: 0.7, metalness: 0.2, flatShading: true, emissive: 0x000000 });
    const balls = [];
    const shadowBlobs = [];
    function newBall(x, z, vx, vz, attached = -1) {
      const m = new THREE.Mesh(ballGeo, ballMatNormal.clone()); m.castShadow = true; group.add(m);
      const band = mesh(new THREE.TorusGeometry(BALL_R * 0.98, 0.07, 5, 16), new THREE.MeshBasicMaterial({ color: 0xff9a3a }), { cast: false }); m.add(band); const band2 = mesh(new THREE.TorusGeometry(BALL_R * 0.98, 0.07, 5, 16), new THREE.MeshBasicMaterial({ color: 0xff9a3a }), { cast: false, rot: [Math.PI / 2, 0, 0] }); m.add(band2);
      const sh = P.shadowBlob(0.8); group.add(sh);
      const b = { x, z, vx, vz, r: BALL_R, m, sh, att: attached, alive: true, fireT: 0, power: 0, squash: 0, trail: 0, spin: [0, 0] };
      balls.push(b); return b;
    }
    function removeBall(b) { b.alive = false; group.remove(b.m); group.remove(b.sh); b.m.material.dispose(); }

    // =====================================================================
    //  SPELSTATUS
    // =====================================================================
    let t = 0, timeLeft = TIME, done = false, started = false, lives = 3, score = 0, streak = 0, lastHitter = -1, bestStreak = 0, streakBonus = 0;
    let serving = false, serveT = 2.6, serveBat = 0, slowT = 0, transT = 0, wallClearedAt = [-1, -1], bricksTotalDestroyed = 0, lifeLostCd = 0, comboCd = 0, shakeCd = 0, landSfxCd = 0;
    let powerCaught = 0, speedBase = 11.5 + 0.7 * (diff - 1);
    const pending = [];     // bom-kettingreactie { br, t }
    const caps = [];        // vallende power-ups

    const wallFrac = (w) => (levels[w] ? levels[w].destroyed / levels[w].total : 0);
    const curSpeed = () => (speedBase + Math.min(7, t * 0.1) + curWall * 1.2) * (slowT > 0 ? 0.62 : 1);
    const mult = () => 1 + Math.min(streak, 8) * 0.25;

    function spawnPower(x, z, force) {
      const wts = [['multi', 3], ['wide', 3], ['fire', 2], ['slow', 2.5], ['life', lives < 3 ? 1.6 : 0.8]];
      let tot = wts.reduce((a, w) => a + w[1], 0), r = R() * tot, type = 'multi';
      for (const [k, w] of wts) { r -= w; if (r <= 0) { type = k; break; } }
      if (force) type = force;
      const tx = powerTexture(type);
      const sideM = mat({ multi: 0xe8a020, wide: 0x2fa0e0, fire: 0xe8402a, slow: 0x8a5cd8, life: 0xe0386a }[type]);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.4, 18), [sideM, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5 }), sideM]);
      m.castShadow = true; const halo = mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), { cast: false, rot: [Math.PI / 2, 0, 0] }); m.add(halo);
      m.position.set(x, 0.7, z); group.add(m);
      caps.push({ type, m, x, z, t: 0 });
    }

    function destroyBrick(br, o = {}) {
      if (!br.alive) return;
      br.alive = false; grid[br.r][br.c] = null;
      const lv = levels[br.w ?? curWall]; lv.destroyed++; bricksTotalDestroyed++;
      const pts = Math.round((br.iron ? 30 : 10) * (o.chain ? 1 : mult()));
      score += pts;
      // brokstukken
      const m = br.mesh; const v = o.dir || [0, -1];
      debris.push({ m, vx: v[0] * 3 + rr(-4, 4), vy: rr(6, 11), vz: v[1] * 3 + rr(-4, 3), rx: rr(-8, 8), rz: rr(-8, 8), life: 1.1 });
      const col = br.mesh.material.color;
      fx.particles.burst(br.x, 0.8, br.z, { count: o.chain ? 12 : 16, speed: 5.5, up: 1.1, life: 0.9, size: 0.5, colors: [col.getHex(), 0xcfc9bd, 0x8c8780], gravity: 18 });
      fx.particles.dust(br.x, 0.2, br.z, 3, 0xcfc4ae);
      if (mult() > 1.2 && !o.chain && comboCd <= 0) { comboCd = 0.25; fx.texts.add('+' + pts, br.x, 2.4, br.z, '#ffd23f', 0.9); }
      audio.sfx(o.chain ? 'pop' : 'chop', { vol: 0.8, rate: 0.7 + Math.min(streak, 8) * 0.07 + rr(-0.05, 0.05) });
      if (!o.chain) audio.sfx('thud', { vol: 0.45 });
      shakeBy(br.bomb ? 0 : 0.14);
      const dropP = br.bomb ? 0.35 : br.iron ? 0.5 : 0.15;
      if (R() < dropP || (bricksTotalDestroyed === 7 && powerCaught === 0 && caps.length === 0)) spawnPower(br.x, br.z, bricksTotalDestroyed === 7 && powerCaught === 0 ? 'multi' : null);
      if (br.bomb) detonate(br);
      // muur gesloopt?
      if (lv.destroyed >= lv.total) onWallClear(br.w ?? curWall);
    }
    function detonate(br) {
      fx.particles.burst(br.x, 1, br.z, { count: 50, speed: 9, up: 1.6, life: 1.0, size: 0.9, colors: [0xffd23f, 0xff7a2a, 0xff3a1a, 0x444444], gravity: 9 });
      fx.particles.ring(br.x, 0.6, br.z, { count: 26, speed: 8, life: 0.5, size: 0.7, color: 0xffb040 });
      audio.sfx('explode', { vol: 0.9 }); ctx.shake(0.55);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const r = br.r + dr, c = br.c + dc;
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        const nb = grid[r][c]; if (nb && nb.alive && !pending.some((p) => p.br === nb)) pending.push({ br: nb, t: 0.11 });
      }
      for (const b of balls) if (b.alive && b.att < 0 && Math.hypot(b.x - br.x, b.z - br.z) < 3.4) { const a = Math.atan2(b.z - br.z, b.x - br.x); b.vx += Math.cos(a) * 2.5; b.vz += Math.sin(a) * 2.5; }
    }
    function shakeBy(a) { if (shakeCd <= 0) { ctx.shake(a); shakeCd = 0.05; } }

    function onWallClear(w) {
      if (wallClearedAt[w] >= 0) return; wallClearedAt[w] = t;
      score += 250; audio.sfx('win'); ctx.shake(0.6);
      for (let k = 0; k < 6; k++) fx.particles.burst(rr(-9, 9), rr(3, 8), rr(-10, -4), { count: 26, speed: 7, up: 0.8, life: 1.2, size: 0.7, colors: [0xffd23f, 0xff5a8a, 0x5ad0ff, 0x7aff8a, 0xffffff], gravity: 5 });
      bats.forEach((b) => { b.c.pose = 'cheer'; b.poseT = 2.2; });
      crowd.forEach((o) => { o.cheer = 2.5; });
      if (w === 0) {
        timeLeft += 10; hud.showBig('Muur gesloopt!', 1400, '#ffe14a'); hud.toast('+10 seconden! Nu de volgende muur...', 2600);
        transT = 2.4;
      } else {
        hud.showBig('Alles gesloopt!', 1600, '#ffe14a');
        endGame('clear');
      }
    }

    function applyPower(type, bat) {
      powerCaught++; score += 40; audio.sfx('powerup');
      fx.particles.burst(bat.x, 1.2, bat.z - 1, { count: 20, speed: 5, up: 1.5, life: 0.7, size: 0.5, colors: [0xffffff, 0xffe14a], gravity: 6 });
      const say = (txt, col) => fx.texts.add(txt, bat.x, 3.2, bat.z - 1.5, col, 1.2);
      if (type === 'multi') {
        const live = balls.filter((b) => b.alive && b.att < 0);
        const src = live[0];
        if (src) {
          const sp = Math.hypot(src.vx, src.vz), a = Math.atan2(src.vz, src.vx);
          for (const da of [0.5, -0.5]) { if (balls.filter((b) => b.alive).length >= 7) break; const na = a + da; const nb = newBall(src.x, src.z, Math.cos(na) * sp, Math.sin(na) * sp); nb.fireT = src.fireT; }
        }
        say('Drie ballen!', '#ffcf5a');
      } else if (type === 'wide') { bat.wideT = 13; say('Brede bat!', '#5ac8ff'); }
      else if (type === 'fire') { balls.forEach((b) => { if (b.alive) b.fireT = 8; }); fireAll = 8; say('Vuurbal!', '#ff7a4a'); }
      else if (type === 'slow') { slowT = 8; say('Vertraagd', '#b99aff'); }
      else if (type === 'life') { if (lives < 5) lives++; say('Extra leven!', '#ff7aa0'); audio.sfx('good'); }
    }
    let fireAll = 0;

    function lifeLost() {
      lives--; streak = 0; lastHitter = -1; lifeLostCd = 1;
      audio.sfx('miss'); audio.sfx('lose', { vol: 0.35 }); ctx.shake(0.5);
      bats.forEach((b) => { b.c.pose = 'sad'; b.poseT = 1.3; });
      fx.texts.add(lives > 0 ? 'Mis! -1 leven' : 'Mis!', 0, 3.2, BAT_Z - 2, '#ff6a5a', 1.5);
      crowd.forEach((o) => { if (o.mo) o.shake = 1.2; });
      if (lives <= 0) { endGame('lives'); return; }
      serveT = 2.2; serveBat = (serveBat + 1) % 2; serving = true;
    }

    function spawnServe() {
      const bat = bats[serveBat];
      const b = newBall(bat.x, bat.z - 1.0, 0, 0, bat.i); b.fireT = 0;
      serveT = 3.0;
      hud.setHint(`<b>${KEY_LABELS[bat.i].a}</b>: ${bat.name} lanceert de kogel!`);
    }
    function launch(b) {
      const bat = bats[b.att]; b.att = -1;
      const a = clamp(bat.vx / 40, -0.35, 0.35) + rr(-0.18, 0.18);
      const sp = curSpeed();
      b.vx = Math.sin(a) * sp; b.vz = -Math.cos(a) * sp;
      audio.sfx('whoosh'); hud.setHint(null);
    }

    // =====================================================================
    //  FYSICA
    // =====================================================================
    const tmpN = { x: 0, z: 0 };
    function minAngle(b) {
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const minZ = sp * 0.34;
      if (Math.abs(b.vz) < minZ) { b.vz = (b.vz < 0 ? -1 : 1) * minZ; const vx = Math.sqrt(Math.max(0, sp * sp - b.vz * b.vz)); b.vx = (b.vx < 0 ? -1 : 1) * vx; }
      const minX = sp * 0.1;
      if (Math.abs(b.vx) < minX) { b.vx = (b.vx < 0 || (b.vx === 0 && R() < 0.5) ? -1 : 1) * minX; }
    }
    function hitBrick(b, br, nx, nz, dir) {
      br.pulse = 1;
      if (b.fireT > 0) { destroyBrick(br, { dir }); return; }
      const dmg = b.power > 0 ? 2 : 1;
      br.hp -= dmg;
      if (br.hp <= 0) destroyBrick(br, { dir });
      else {
        // ijzer: kreukelen
        if (br.iron) br.mesh.material = brickMat('I', 0, br.hp);
        audio.sfx('hit', { vol: 0.7, rate: 0.8 }); audio.sfx('ding', { vol: 0.3, rate: 1.3 });
        fx.particles.burst(br.x - nx * 0.3, 1, br.z - nz * 0.3, { count: 8, speed: 4, color: 0xffd8a0, size: 0.25, gravity: 10 });
        shakeBy(0.2);
      }
    }
    function brickCollisions(b) {
      const col = Math.floor((b.x - X0) / BW), row = Math.floor((b.z - Z0) / BH);
      let best = null, bd = 1e9;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr, c = col + dc; if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        const br = grid[r][c]; if (!br || !br.alive || !br.landed) continue;
        const minx = X0 + c * BW, maxx = minx + BW, minz = Z0 + r * BH, maxz = minz + BH;
        const cx = clamp(b.x, minx, maxx), cz = clamp(b.z, minz, maxz);
        const dx = b.x - cx, dz = b.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= b.r * b.r) continue;
        if (b.fireT > 0) { hitBrick(b, br, 0, 0, [b.vx / 6, b.vz / 6]); continue; }
        if (d2 < bd) { bd = d2; best = { br, minx, maxx, minz, maxz, cx, cz, dx, dz, d2 }; }
      }
      if (!best) return false;
      let nx, nz;
      if (best.d2 < 1e-6) { // middelpunt binnenin: kleinste doordringing
        const l = b.x - best.minx, rgt = best.maxx - b.x, tp = b.z - best.minz, bt = best.maxz - b.z; const m = Math.min(l, rgt, tp, bt);
        if (m === l) { nx = -1; nz = 0; b.x = best.minx - b.r; } else if (m === rgt) { nx = 1; nz = 0; b.x = best.maxx + b.r; } else if (m === tp) { nx = 0; nz = -1; b.z = best.minz - b.r; } else { nx = 0; nz = 1; b.z = best.maxz + b.r; }
      } else {
        const d = Math.sqrt(best.d2); nx = best.dx / d; nz = best.dz / d;
        // dichtbij een naad: liever een zuivere as-normaal
        if (Math.abs(nx) < 0.35) { nx = 0; nz = nz < 0 ? -1 : 1; b.z = nz < 0 ? best.minz - b.r - 0.002 : best.maxz + b.r + 0.002; }
        else if (Math.abs(nz) < 0.35) { nz = 0; nx = nx < 0 ? -1 : 1; b.x = nx < 0 ? best.minx - b.r - 0.002 : best.maxx + b.r + 0.002; }
        else { const l = Math.hypot(nx, nz); nx /= l; nz /= l; b.x = best.cx + nx * (b.r + 0.002); b.z = best.cz + nz * (b.r + 0.002); }
      }
      const dot = b.vx * nx + b.vz * nz;
      if (dot < 0) { b.vx -= 2 * dot * nx; b.vz -= 2 * dot * nz; }
      b.squash = 0.18;
      hitBrick(b, best.br, nx, nz, [nx * -1, nz * -1]);
      minAngle(b);
      return true;
    }

    function batCollision(b) {
      if (b.vz <= 0) return;
      for (const bat of bats) {
        const front = bat.z - 0.45;
        if (b.z + b.r >= front && b.z - b.r <= bat.z + 0.5 && Math.abs(b.x - bat.x) <= bat.hw + b.r * 0.7) {
          const offs = clamp((b.x - bat.x) / (bat.hw + b.r * 0.7), -1, 1);
          let sp = Math.hypot(b.vx, b.vz);
          const smash = bat.smashT > 0;
          const maxAng = smash ? 0.62 : 1.0;
          let ang = offs * maxAng;
          if (smash) { sp = Math.min(sp * 1.28 + 2, 27); b.power = 1.6; fx.texts.add('SMASH!', b.x, 3, b.z - 1, '#ff9a3a', 1.4); ctx.shake(0.45); audio.sfx('explode', { vol: 0.35 }); audio.sfx('hit'); }
          b.vx = Math.sin(ang) * sp + bat.vx * 0.1; b.vz = -Math.cos(ang) * sp;
          minAngle(b);
          b.z = front - b.r - 0.01; b.squash = 0.22;
          bat.flash = 1; bat.hits++;
          audio.sfx('wood', { vol: 0.8 }); audio.sfx('thud', { vol: 0.35 });
          fx.particles.burst(b.x, 0.9, b.z + 0.4, { count: 8, speed: 3.5, up: 0.7, color: 0xd9b27a, size: 0.3, gravity: 8 });
          // samenspel
          if (lastHitter >= 0 && lastHitter !== bat.i) {
            streak++;
            if (streak >= 2) {
              audio.sfx('note', { rate: 0.8 + Math.min(streak, 10) * 0.08, vol: 0.55 });
              fx.texts.add(`Samenspel x${mult().toFixed(2).replace(/\.?0+$/, '')}`, (bats[0].x + bats[1].x) / 2, 2.8, BAT_Z - 0.5, '#ffd23f', 1.1);
              if ((streak === 5 || streak === 10 || streak === 15) && streakBonus < 3) { streakBonus++; ctx.bonus(1); fx.texts.add('+1 🪙', (bats[0].x + bats[1].x) / 2, 4, BAT_Z - 1, '#ffe14a', 1.1); audio.sfx('coin'); }
            }
            bestStreak = Math.max(bestStreak, streak);
          } else if (lastHitter === bat.i) streak = 0;
          lastHitter = bat.i;
          return;
        }
      }
    }

    function updateBall(b, dt) {
      if (!b.alive) return;
      if (b.att >= 0) {
        const bat = bats[b.att]; b.x = bat.x; b.z = bat.z - 1.0; b.vx = b.vz = 0;
      } else {
        // normaliseer snelheid richting doelsnelheid
        const target = curSpeed() * (b.power > 0 ? 1.2 : 1);
        let sp = Math.hypot(b.vx, b.vz) || target;
        const nsp = damp(sp, target, b.power > 0 ? 0.9 : 2.2, dt);
        b.vx *= nsp / sp; b.vz *= nsp / sp; sp = nsp;
        const steps = Math.max(1, Math.ceil(sp * dt / 0.2)); const sdt = dt / steps;
        for (let s = 0; s < steps && b.alive; s++) {
          b.x += b.vx * sdt; b.z += b.vz * sdt;
          if (b.x < -XL + b.r) { b.x = -XL + b.r; b.vx = Math.abs(b.vx); wallBounce(b); }
          else if (b.x > XL - b.r) { b.x = XL - b.r; b.vx = -Math.abs(b.vx); wallBounce(b); }
          if (b.z < Z0 + b.r) { b.z = Z0 + b.r; b.vz = Math.abs(b.vz); minAngle(b); wallBounce(b); }
          batCollision(b);
          brickCollisions(b);
          if (b.z - b.r > PIT_Z) {
            fx.particles.burst(b.x, 0, PIT_Z + 0.5, { count: 14, speed: 3, up: 1, color: 0x333040, size: 0.5, gravity: 12 });
            removeBall(b); return;
          }
        }
        if (b.power > 0) b.power -= dt;
        if (b.fireT > 0) { b.fireT -= dt; if (R() < 0.9) fx.particles.emit(b.x + rr(-0.3, 0.3), 0.8, b.z + rr(-0.3, 0.3), rr(-1, 1), rr(1, 3), rr(-1, 1), { life: 0.5, size: 0.7, color: R() < 0.5 ? 0xff7a2a : 0xffd23f, gravity: -1 }); }
        else if (b.power > 0 && R() < 0.6) fx.particles.emit(b.x, 0.8, b.z, rr(-1, 1), rr(0.5, 2), rr(-1, 1), { life: 0.4, size: 0.5, color: 0xffcf6a, gravity: 0 });
        else if (R() < 0.35) fx.particles.dust(b.x, 0.1, b.z, 1, 0xcfc4ae);
      }
    }
    function wallBounce(b) { audio.sfx('click', { vol: 0.35, rate: 0.7 }); b.squash = 0.1; fx.particles.dust(b.x, 0.5, b.z, 1, 0xcfc4ae); }

    function updateBallVisual(b, dt) {
      b.squash = Math.max(0, b.squash - dt * 1.4);
      const k = b.squash; b.m.scale.set(1 + k * 0.5, 1 - k * 0.6, 1 + k * 0.5);
      b.m.position.set(b.x, BALL_R + 0.02 + (b.att >= 0 ? 0.2 + Math.sin(t * 6) * 0.05 : 0), b.z);
      b.m.rotation.x += b.vz * dt * 0.5; b.m.rotation.z -= b.vx * dt * 0.5;
      const f = b.fireT > 0;
      b.m.material.emissive.setHex(f ? 0xff4a10 : b.power > 0 ? 0x806010 : 0x000000); b.m.material.emissiveIntensity = f ? 0.9 + Math.sin(t * 30) * 0.2 : b.power > 0 ? 0.7 : 0;
      b.sh.position.set(b.x + 0.2, 0.05, b.z + 0.25); b.sh.scale.setScalar(1.0);
    }

    // =====================================================================
    //  UPDATE
    // =====================================================================
    function updateBats(dt) {
      for (const bat of bats) {
        const inp = input.p[bat.i];
        bat.comfy = true;
        const spd = 19;
        const tv = inp.x * spd;
        bat.vx = damp(bat.vx, tv, 16, dt);
        bat.x += bat.vx * dt;
        // breedte
        if (bat.wideT > 0) { bat.wideT -= dt; bat.hwT = 3.2; if (bat.wideT <= 0) { bat.hwT = 2.0; audio.sfx('miss', { vol: 0.3 }); } } else bat.hwT = 2.0;
        bat.hw = damp(bat.hw, bat.hwT, 10, dt);
        // smash
        bat.smashCd -= dt;
        if (bat.smashT > 0) { bat.smashT -= dt; }
        if (inp.bP && bat.smashCd <= 0 && bat.smashT <= 0) { bat.smashT = 0.3; bat.smashCd = 1.3; bat.c.swing(); audio.sfx('swing'); fx.particles.ring(bat.x, 0.5, bat.z - 0.6, { count: 12, speed: 4, life: 0.35, size: 0.35, color: 0xffe0a0 }); }
        const u = bat.smashT > 0 ? 1 - bat.smashT / 0.3 : 1;
        bat.z = BAT_Z - (bat.smashT > 0 ? 2.1 * Math.sin(u * Math.PI) : 0);
      }
      // niet door elkaar heen: zachtjes wegduwen
      const a = bats[0], b = bats[1], GAP = 0.25;
      for (let pass = 0; pass < 3; pass++) {
        const ov = (a.x + a.hw + GAP) - (b.x - b.hw);
        if (ov > 0) {
          const w0 = Math.max(0, a.vx), w1 = Math.max(0, -b.vx);
          let sh0 = w0 + w1 > 0.01 ? 0.2 + 0.6 * (w1 / (w0 + w1)) : 0.5;   // aandeel dat bat 0 naar links gaat
          if (pass > 0) sh0 = (b.x + b.hw >= XL - 0.01) ? 1 : (a.x - a.hw <= -XL + 0.01) ? 0 : sh0;
          a.x -= ov * sh0; b.x += ov * (1 - sh0);
          if (sh0 > 0.5) a.vx = Math.min(a.vx, 0) * 0.5; else b.vx = Math.max(b.vx, 0) * 0.5;
        }
        a.x = clamp(a.x, -XL + a.hw, XL - a.hw); b.x = clamp(b.x, -XL + b.hw, XL - b.hw);
      }
      if (a.x + a.hw + GAP > b.x - b.hw) { // allebei tegen de muur: dichtbij elkaar
        const mid = (a.x + a.hw + b.x - b.hw) / 2; a.x = mid - a.hw - GAP / 2; b.x = mid + b.hw + GAP / 2;
      }
    }

    function updateBatVisuals(dt) {
      for (const bat of bats) {
        const m = bat.bm, w = bat.hw * 2 - 0.68;
        m.g.position.set(bat.x, 0, bat.z);
        m.body.scale.x = Math.max(0.2, w); m.stripe.scale.x = Math.max(0.2, w * 0.92);
        m.capL.position.x = -w / 2 - 0.17; m.capR.position.x = w / 2 + 0.17;
        bat.flash = Math.max(0, bat.flash - dt * 4);
        const sc = 1 + bat.flash * 0.1; m.g.scale.set(1, sc, 1);
        // broertje erachter
        const c = bat.c;
        c.group.position.set(bat.x, 0, bat.z + 1.7);
        c.speed = Math.min(1, Math.abs(bat.vx) / 14);
        if (Math.abs(bat.vx) > 1) c.faceDir(bat.vx * 0.2, -1); else c.faceDir(0, -1);
        if (bat.poseT > 0) { bat.poseT -= dt; if (bat.poseT <= 0) c.pose = 'push'; }
        c.update(dt);
        if (c.speed > 0.5 && R() < dt * 6) fx.particles.dust(bat.x, 0, bat.z + 0.5, 1);
      }
      const a = bats[0], b = bats[1];
      const mx = (a.x + b.x) / 2, len = Math.max(0.1, b.x - a.x - a.hw - b.hw);
      link.position.set((a.x + a.hw + b.x - b.hw) / 2, 0.9, BAT_Z); link.scale.set(len, 1, 1);
      const want = streak >= 2 ? Math.min(1, 0.3 + streak * 0.1) : 0;
      link.material.opacity = damp(link.material.opacity, want, 8, dt); link.visible = link.material.opacity > 0.02;
    }

    function updateBricks(dt) {
      let landedNow = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const br = grid[r][c]; if (!br || !br.alive) continue;
        if (!br.landed) {
          if (br.delay > 0) { br.delay -= dt; continue; }
          br.vy -= 34 * dt; br.mesh.position.y += br.vy * dt;
          if (br.mesh.position.y <= BRICK_H / 2) { br.mesh.position.y = BRICK_H / 2; br.landed = true; landedNow++; fx.particles.dust(br.x, 0.1, br.z, 2, 0xcfc4ae); }
        } else if (br.pulse > 0) {
          br.pulse = Math.max(0, br.pulse - dt * 6); const s = 1 + br.pulse * 0.1; br.mesh.scale.set(s, s, s); br.mesh.rotation.z = Math.sin(br.pulse * 12) * 0.06 * br.pulse;
        }
      }
      if (landedNow && landSfxCd <= 0) { audio.sfx('thud', { vol: 0.3 }); landSfxCd = 0.08; ctx.shake(0.06); }
      // brokstukken
      for (let n = debris.length - 1; n >= 0; n--) {
        const d = debris[n]; d.life -= dt; d.vy -= 28 * dt; const p = d.m.position;
        p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt; d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
        if (p.y < 0.35) { p.y = 0.35; d.vy = Math.abs(d.vy) * 0.3; d.vx *= 0.7; d.vz *= 0.7; }
        if (d.life < 0.35) d.m.scale.setScalar(Math.max(0.01, d.life / 0.35));
        if (d.life <= 0) { group.remove(d.m); debris.splice(n, 1); }
      }
      // bommen: kettingreactie
      for (let n = pending.length - 1; n >= 0; n--) {
        const p = pending[n]; p.t -= dt;
        if (p.t <= 0) { pending.splice(n, 1); if (p.br.alive) { p.br.hp = 0; destroyBrick(p.br, { chain: true, dir: [rr(-1, 1), rr(-1, 1)] }); } }
      }
    }

    function updateCaps(dt) {
      for (let n = caps.length - 1; n >= 0; n--) {
        const c = caps[n]; c.t += dt; c.z += (4.8 + Math.min(2, t * 0.02)) * dt;
        c.m.position.set(c.x, 0.7 + Math.sin(c.t * 6) * 0.12, c.z); c.m.rotation.x = Math.sin(c.t * 4) * 0.25; c.m.rotation.z = Math.cos(c.t * 3.4) * 0.2;
        if (R() < dt * 14) fx.particles.emit(c.x + rr(-0.5, 0.5), 0.8, c.z - 0.6, 0, 0.8, -1.5, { life: 0.5, size: 0.3, color: 0xffffff, gravity: 0 });
        let caught = null;
        for (const bat of bats) if (c.z >= bat.z - 0.9 && c.z <= bat.z + 0.9 && Math.abs(c.x - bat.x) <= bat.hw + 0.7) caught = bat;
        if (caught) { applyPower(c.type, caught); group.remove(c.m); caps.splice(n, 1); continue; }
        if (c.z > PIT_Z + 1.2) { group.remove(c.m); caps.splice(n, 1); }
      }
    }

    function updateHud() {
      hud.setTimer(timeLeft, 10);
      const lv = levels[curWall];
      const pct = Math.round(wallFrac(curWall) * 100);
      const hearts = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
      hud.setScore(`Muur ${curWall + 1}: ${pct}%  ·  ${hearts}` + (streak >= 2 ? `  ·  Samenspel x${streak}` : ''));
      for (const bat of bats) {
        const bits = [bat.smashCd > 0.01 ? 'Smash laadt...' : 'Smash klaar'];
        if (bat.wideT > 0) bits.push('Breed');
        hud.setPlayerInfo(bat.i, bits.join(' · '));
      }
    }

    function animateAmbient(dt) {
      const T = t;
      torches.forEach((tc) => P.animateFire(tc, performance.now() / 1000));
      lightBeams.forEach((lb) => { if (lb.m) lb.m.rotation.set(0.35 + Math.sin(performance.now() / 1000 * 0.8 + lb.ph) * 0.35, 0, Math.sin(performance.now() / 1000 * 0.6 + lb.ph * 1.7) * 0.4); else if (lb.cloud) { lb.cloud.position.x += dt * 0.7; if (lb.cloud.position.x > 80) lb.cloud.position.x = -80; } });
      crowd.forEach((o) => {
        if (o.cheer > 0) { o.cheer -= dt; o.c.pose = 'cheer'; }
        else if (o.shake > 0) { o.shake -= dt; o.c.pose = 'sad'; }
        else o.c.pose = o.mo && Math.sin(performance.now() / 1000 * 0.7) > 0.6 ? 'wave' : 'idle';
        if (o.mo && Math.random() < dt * 0.4) o.c.swing();
        o.c.update(dt);
      });
    }

    function endGame(reason) {
      if (done) return; done = true;
      const f1 = wallFrac(0), f2 = levels[1] ? wallFrac(1) : 0;
      let stars = 0;
      if (levels[0].destroyed >= levels[0].total) stars = (levels[1] && f2 >= 0.5) ? 3 : 2; else if (f1 >= 0.5) stars = 1;
      const hearts = Math.max(0, lives);
      const lvName = levels[0].name;
      let msg = '';
      if (reason === 'clear') msg = 'Beide muren zijn gesloopt, het podium kan gebouwd worden!';
      else if (reason === 'lives') msg = 'De kogel was te vaak weg... alle levens zijn op.';
      else msg = 'De tijd is om.';
      const pct1 = Math.round(f1 * 100), pct2 = Math.round(f2 * 100);
      const summary = `${msg}<br>${lvName}: <b>${pct1}%</b> gesloopt${levels[1] && f2 > 0 ? `, tweede muur: <b>${pct2}%</b>` : ''}. ${hearts ? `Over: ${'♥'.repeat(hearts)}` : ''}<br>Beste samenspel-reeks: <b>${bestStreak}</b> · ${score} punten`;
      bats.forEach((b) => { b.c.pose = stars ? 'cheer' : 'sad'; b.poseT = 0; });
      crowd.forEach((o) => { o.cheer = stars ? 99 : 0; o.shake = stars ? 0 : 99; });
      balls.forEach((b) => { if (b.alive) { b.vx *= 0.3; b.vz *= 0.3; } });
      ctx.finish({ stars, score, summary, bonus: stars > 0 ? hearts : 0, delay: reason === 'clear' ? 1600 : 1000 });
    }

    function update(dt) {
      if (!started) onStart();
      if (done) { postUpdate(dt); return; }
      t += dt; timeLeft -= dt; shakeCd -= dt; comboCd -= dt; landSfxCd -= dt; lifeLostCd -= dt;
      if (slowT > 0) slowT -= dt;
      // wanneer muur 1 klaar is: muur 2 bouwen
      if (transT > 0) { transT -= dt; if (transT <= 0) { curWall = 1; buildWall(1, true); audio.sfx('scrape'); hud.toast(`Muur 2: ${levels[1].name}. Moeilijker!`, 2600); } }
      updateBats(dt);
      // serveren
      if (serving) { serveT -= dt; if (serveT <= 0 && transT <= 0) { serving = false; spawnServe(); } }
      for (const b of balls) if (b.alive && b.att >= 0) {
        serveT -= dt;
        if (input.p[b.att].aP || input.p[1 - b.att].aP || serveT <= 0) launch(b);
      }
      for (const b of balls) updateBall(b, dt);
      for (let n = balls.length - 1; n >= 0; n--) if (!balls[n].alive) balls.splice(n, 1);
      // alle ballen weg?
      if (started && balls.length === 0 && lives > 0 && !done && !serving) { lifeLost(); }
      updateBricks(dt); updateCaps(dt);
      postUpdate(dt);
      updateHud();
      if (timeLeft <= 0 && !done) { timeLeft = 0; hud.setTimer(0); endGame('time'); }
    }

    function postUpdate(dt) {
      for (const b of balls) updateBallVisual(b, dt);
      updateBatVisuals(dt);
      animateAmbient(dt);
      placeCamera(dt);
      if (done) { updateBricks(dt); }
    }

    // =====================================================================
    //  CAMERA
    // =====================================================================
    camera.fov = 50; camera.updateProjectionMatrix();
    const camBase = new THREE.Vector3(0, 19.5, 15.5), camLook = new THREE.Vector3(0, 0, -1.6);
    function placeCamera(dt) {
      const asp = camera.aspect || 1.7;
      const f = clamp(1.7 / asp, 1, 1.6);
      const sway = Math.sin(t * 0.3) * 0.35;
      // blijf iets richting het midden van de bats kijken
      const mx = (bats[0].x + bats[1].x) / 2 * 0.06;
      camera.position.set(camBase.x * f + sway + mx, camBase.y * f, camBase.z * f);
      camera.lookAt(camLook.x + mx, camLook.y, camLook.z);
    }
    placeCamera(0);

    function onStart() {
      if (started) return;
      started = true; t = 0.0001;
      if (demoBall.alive) { removeBall(demoBall); const k = balls.indexOf(demoBall); if (k >= 0) balls.splice(k, 1); }
      hud.setTimer(TIME); hud.setScore('Muur 1: 0%  ·  ♥♥♥');
      spawnServe();
    }
    // intro: bats staan klaar, kogel rust op de bat
    bats.forEach((b) => { b.c.group.position.set(b.x, 0, b.z + 1.7); b.c.faceDir(0, -1); });
    const demoBall = newBall(bats[0].x, bats[0].z - 1.0, 0, 0, 0);

    return {
      update,
      introUpdate(dt) {
        t += dt * 0.5;
        if (!started && demoBall.alive) { demoBall.x = bats[0].x; demoBall.z = bats[0].z - 1.0; updateBallVisual(demoBall, dt); }
        updateBatVisuals(dt); animateAmbient(dt); placeCamera(dt);
      },
      resultUpdate(dt) { t += dt; updateBricks(dt); for (const b of balls) { updateBallVisual(b, dt); } updateBatVisuals(dt); animateAmbient(dt); placeCamera(dt); },
      onStart,
      dispose() {},
      debug: { bats, balls, grid, levels, caps, get lives() { return lives; }, set lives(v) { lives = v; }, get streak() { return streak; }, get t() { return t; }, get done() { return done; }, get curWall() { return curWall; }, get score() { return score; }, get timeLeft() { return timeLeft; }, set timeLeft(v) { timeLeft = v; }, destroyBrick, spawnPower, newBall, applyPower, launch, get bestStreak() { return bestStreak; }, curSpeed, get transT() { return transT; } },
    };
  },
};

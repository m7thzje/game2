import * as THREE from 'three';
import { mat, mesh, clamp, damp, lerp, rand, TAU, canvasTex, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { KEY_LABELS } from '../engine/input.js';
import { LEVELS, parseLevel, initState, derive, act, isWin, CH_COLORS, CH_CSS, CH_NAMES, DIRS, nbr } from './plates_levels.js';

// Drakengrot: co-op roosterpuzzel in een kristalgrot met een slapende draak.
// Regels + levels: plates_levels.js (bewezen oplosbaar met tools/solve_plates.mjs).

const C = 2.0;
const WALK = 0.14;          // seconden per vakje lopen
const SLIDE = 0.07;         // seconden per vakje glijden
const RESET_HOLD = 0.8;
const STAR2 = 360, STAR3 = 240;   // seconden voor 2 / 3 sterren
const SOFT_CAP = 900;             // na 15 min stopt het spel vanzelf (veiligheidsnet)

const gBox = new THREE.BoxGeometry(1, 1, 1);
const gCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
const gSph = new THREE.SphereGeometry(1, 12, 9);

function glyphTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.45, 'rgba(255,240,170,.55)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,250,220,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 40, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 26, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28); g.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.stroke(); }
  });
}
function labelTexture(text, css, size = 58) {
  return canvasTex(256, 96, (g, w, h) => {
    g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(20,10,30,.92)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2, w - 16);
    g.fillStyle = css; g.fillText(text, w / 2, h / 2, w - 16);
  });
}
function badgeTexture(text, css) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = 'rgba(20,10,30,.88)'; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fill();
    g.lineWidth = 8; g.strokeStyle = css; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${text.length > 2 ? 34 : 60}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68, 96);
  });
}

export default {
  id: 'plates',
  name: 'Drakengrot',
  giver: 'Dwerg Dolf',
  icon: '🐉',
  mode: 'puzzle',
  pay: 1.3,
  music: 'puzzle',
  blurb: 'In de Drakengrot ligt een schat, maar de <b>draak slaapt</b>... niet wakker maken! Los samen 6 grot-puzzels op met <b>drukplaten, sleutels, hendels, ijs en kristal-spiegels</b>. Pas op voor lava. In elk level moeten jullie <b>allebei tegelijk op de uitgang</b> staan.',
  controls: ['{move} stap voor stap lopen', '{a} hendel / spiegel bedienen (ernaast staan)', '{b} vasthouden: level opnieuw'],
  tip: 'Sneller = meer sterren: alle 6 levels klaar = 1 ster, binnen 6 minuten = 2 sterren, binnen 4 minuten = 3 sterren. Geen tijdslimiet per level.',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    ctx.lights('cave', { shadow: 18, center: [0, 0, 0], fogNear: 40, fogFar: 120 });
    scene.fog = new THREE.Fog(0x0c0818, 45, 120);
    scene.background = new THREE.Color(0x0c0818);
    camera.fov = 46; camera.updateProjectionMatrix();
    scene.add(new THREE.AmbientLight(0x7a6aa8, 0.55));

    const tmpV = new THREE.Vector3(); const tmpQ = new THREE.Quaternion();
    let t = 0;
    const rng = mulberry32(4242);

    // ------------------------------------------------------------------ grot-omgeving
    const crystalLights = [0, 1, 2].map((i) => { const l = new THREE.PointLight([0x59e0ff, 0xd070ff, 0x6affb0][i], 1.0, 26, 1.5); l.position.set([-11, 11, 3][i], 4, [2, -4, 6][i]); scene.add(l); return l; });
    const lavaLight = new THREE.PointLight(0xff7a20, 0, 18, 1.6); lavaLight.position.set(0, 2, 0); scene.add(lavaLight);
    const dragonLight = new THREE.PointLight(0xffc860, 1.1, 30, 1.5); dragonLight.position.set(0, 6, -16); scene.add(dragonLight);

    const caveFloor = mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ map: tex.stone(60, 45), color: 0x5a5878, roughness: 1 }), { cast: false, pos: [0, -0.7, -20], rot: [-Math.PI / 2, 0, 0] });
    scene.add(caveFloor);

    // grote rotsen achter en rondom (ver weg)
    const far = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x3d3a5a), 70); far.castShadow = false; far.receiveShadow = true;
    { const d = new THREE.Object3D(); const cc = new THREE.Color();
      for (let i = 0; i < 70; i++) {
        const a = rng() * Math.PI - Math.PI; const r = 38 + rng() * 22;
        d.position.set(Math.cos(a) * r * 1.4, 0, -34 + Math.sin(a) * -r * 0.5 - 8 + rng() * 6); if (d.position.z > -26) d.position.z -= 14;
        const s = 5 + rng() * 9; d.scale.set(s * (0.8 + rng() * 0.7), s * (0.9 + rng() * 1.1), s * 0.8); d.rotation.set(rng() * 3, rng() * 3, rng() * 3); d.updateMatrix();
        far.setMatrixAt(i, d.matrix); far.setColorAt(i, cc.setHSL(0.68 + rng() * 0.06, 0.25, 0.28 + rng() * 0.12));
      }
    }
    scene.add(far);
    // kristallen in de verte (gloeiend, onbelicht)
    const farCrystals = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 2.6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), 60);
    { const d = new THREE.Object3D(); const cc = new THREE.Color(); const cols = [0x59e0ff, 0xd070ff, 0x6affb0, 0xff7ad0, 0x8a7aff];
      for (let i = 0; i < 60; i++) {
        const side = rng() < 0.5 ? -1 : 1;
        d.position.set(side * (22 + rng() * 38), 0.8 + rng() * 1.2, -22 - rng() * 36); const s = 0.8 + rng() * 1.6; d.scale.set(s, s * (1 + rng()), s); d.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5); d.updateMatrix();
        farCrystals.setMatrixAt(i, d.matrix); farCrystals.setColorAt(i, cc.setHex(cols[i % cols.length]));
      }
    }
    scene.add(farCrystals);

    // ------------------------------------------------------------------ de slapende draak
    function makeDragon() {
      const g = new THREE.Group(); const S = 2.0; g.scale.setScalar(S);
      const scaleMat = new THREE.MeshStandardMaterial({ color: 0x2fae98, roughness: 0.5, metalness: 0.3, emissive: 0x0f5a50, emissiveIntensity: 0.9 });
      const darkScale = new THREE.MeshStandardMaterial({ color: 0x1f7f78, roughness: 0.6, metalness: 0.2, emissive: 0x083a38, emissiveIntensity: 0.8 });
      const bellyMat = new THREE.MeshStandardMaterial({ color: 0xf2cc70, roughness: 0.6, emissive: 0x6a4a10, emissiveIntensity: 0.8 });
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xc04a10, emissiveIntensity: 0.9, roughness: 0.5 });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xf6efd8, emissive: 0x6a6450, emissiveIntensity: 0.5, roughness: 0.5 });
      const darkMat = mat(0x0c0a14);
      const body = mesh(gSph, scaleMat, { pos: [0, 1.15, -0.5], scale: [1.9, 1.15, 2.5] }); g.add(body);
      g.add(mesh(gSph, bellyMat, { pos: [0, 0.55, 0.3], scale: [1.45, 0.6, 2.0] }));
      // rugstekels (oranje)
      for (let i = 0; i < 10; i++) g.add(mesh(new THREE.ConeGeometry(0.2 - i * 0.006, 0.8 - Math.abs(i - 4) * 0.04, 5), spikeMat, { pos: [0, 2.25 - Math.abs(i - 3) * 0.1, -2.6 + i * 0.46], rot: [0.25, 0, 0] }));
      // vleugels (opgevouwen langs de flanken)
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.7, 2.6, 0.2, -1.2, 0, 0, 0.5, 2.6, 0.2, -1.2, 3.8, 0.5, 0.0, 0, 0, 0.5, 3.8, 0.5, 0.0, 2.0, 0.1, 1.1], 3)); wingGeo.computeVertexNormals();
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x1d8a82, emissive: 0x0a4a48, emissiveIntensity: 0.9, side: THREE.DoubleSide, flatShading: true, roughness: 0.7 });
      for (const sx of [-1, 1]) {
        const wing = new THREE.Group(); wing.position.set(sx * 1.2, 1.95, -0.7); wing.rotation.set(0.1, sx * 0.2, sx * -0.95); wing.scale.set(sx * 0.62, 0.62, 0.62); g.add(wing);
        wing.add(new THREE.Mesh(wingGeo, wingMat));
        wing.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.9, 5), hornMat, { pos: [1.9, 0.3, -0.3], rot: [Math.PI / 2 - 1.35, 0, 0], cast: false }));
      }
      // voorpoten
      for (const sx of [-1, 1]) {
        g.add(mesh(new THREE.CapsuleGeometry(0.4, 1.7, 4, 8), scaleMat, { pos: [sx * 1.25, 0.42, 2.3], rot: [Math.PI / 2, 0, sx * 0.08] }));
        for (let k = -1; k <= 1; k++) g.add(mesh(new THREE.ConeGeometry(0.11, 0.42, 4), hornMat, { pos: [sx * 1.25 + k * 0.24, 0.2, 3.35], rot: [Math.PI / 2, 0, 0] }));
      }
      // kop (rust op de poten)
      const head = new THREE.Group(); head.position.set(0, 0.92, 3.0); g.add(head);
      head.add(mesh(gSph, scaleMat, { pos: [0, 0.1, 0.15], scale: [0.9, 0.62, 1.05] }));
      head.add(mesh(gSph, scaleMat, { pos: [0, -0.02, 1.15], scale: [0.62, 0.42, 0.85] }));
      head.add(mesh(gSph, bellyMat, { pos: [0, -0.3, 1.0], scale: [0.5, 0.2, 0.85] }));
      // wenkbrauwkammen + tanden
      for (const sx of [-1, 1]) {
        head.add(mesh(gBox, darkScale, { pos: [sx * 0.42, 0.45, 0.65], rot: [0, sx * -0.3, sx * -0.3], scale: [0.5, 0.12, 0.3] }));
        head.add(mesh(gSph, darkMat, { cast: false, pos: [sx * 0.2, 0.08, 1.95], scale: 0.075 }));
        head.add(mesh(new THREE.ConeGeometry(0.15, 1.2, 5), hornMat, { pos: [sx * 0.5, 0.75, -0.55], rot: [-1.05, 0, sx * -0.3] }));
        head.add(mesh(new THREE.ConeGeometry(0.09, 0.5, 4), hornMat, { pos: [sx * 0.88, 0.1, 0.05], rot: [0, 0, sx * -1.45] }));
        for (let k = 0; k < 3; k++) head.add(mesh(new THREE.ConeGeometry(0.05, 0.2, 4), hornMat, { cast: false, pos: [sx * 0.46, -0.24, 0.9 + k * 0.34], rot: [Math.PI, 0, 0] }));
      }
      const eyes = [];
      for (const sx of [-1, 1]) {
        const e = new THREE.Group(); e.position.set(sx * 0.5, 0.28, 0.72); e.rotation.y = sx * 0.4; head.add(e);
        const open = mesh(gSph, new THREE.MeshBasicMaterial({ color: 0xffd23f }), { cast: false, receive: false, scale: [0.17, 0.2, 0.08] }); open.visible = false; e.add(open);
        const slit = mesh(gBox, darkMat, { cast: false, pos: [0, 0, 0.07], scale: [0.04, 0.2, 0.02] }); slit.visible = false; e.add(slit);
        const closed = mesh(new THREE.TorusGeometry(0.16, 0.035, 4, 10, Math.PI), darkMat, { cast: false, rot: [0, 0, Math.PI], pos: [0, 0.04, 0.05] }); e.add(closed);
        eyes.push({ open, slit, closed });
      }
      // staart
      const tail = []; let prev = g;
      for (let i = 0; i < 9; i++) {
        const seg = new THREE.Group(); seg.position.set(0, i === 0 ? 0.95 : 0, i === 0 ? -2.9 : -0.85); prev.add(seg);
        const r = 0.95 * (1 - i * 0.095);
        seg.add(mesh(gSph, scaleMat, { pos: [0, 0, -0.4], scale: [r, r * 0.8, 0.85] }));
        if (i < 8) seg.add(mesh(new THREE.ConeGeometry(0.14, 0.45, 4), spikeMat, { pos: [0, r * 0.78, -0.4] }));
        tail.push(seg); prev = seg;
      }
      tail.forEach((s) => { s.rotation.y = 0.24; });
      // glinsterschubben
      const glim = new THREE.InstancedMesh(gSph, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), 44);
      const glimPos = []; for (let i = 0; i < 44; i++) { const a = rng() * TAU, b = rng() * 1.4 + 0.15; glimPos.push([Math.cos(a) * 1.85 * Math.sin(b), 1.15 + Math.cos(b) * 1.1, -0.5 + Math.sin(a) * 2.4 * Math.sin(b), rng() * 6]); }
      g.add(glim);
      const d = new THREE.Object3D();
      return {
        group: g, eyes, head, body, scaleMat, tail, wake: 0,
        update(tt, dt) {
          const br = Math.sin(tt * 1.25);
          body.scale.set(1.9 * (1 + br * 0.015), 1.15 * (1 + br * 0.05), 2.5);
          head.rotation.x = br * 0.02; head.position.y = 0.92 + br * 0.03;
          scaleMat.emissiveIntensity = 0.8 + Math.sin(tt * 0.9) * 0.3;
          tail.forEach((s, i) => { s.rotation.y = 0.24 + Math.sin(tt * 0.6 - i * 0.5) * 0.06 + (this.wake > 0 ? Math.sin(tt * 9 - i) * 0.12 * this.wake : 0); });
          glimPos.forEach((p, i) => { const k = 0.5 + 0.5 * Math.sin(tt * 2.2 + p[3]); d.position.set(p[0], p[1], p[2]); d.scale.setScalar(0.03 + Math.max(0, k - 0.55) * 0.2); d.updateMatrix(); glim.setMatrixAt(i, d.matrix); });
          glim.instanceMatrix.needsUpdate = true;
          this.wake = Math.max(0, this.wake - dt);
          const openAmt = this.wake > 0 ? 1 : 0;
          eyes.forEach((e) => { e.open.visible = openAmt > 0; e.slit.visible = openAmt > 0; e.closed.visible = openAmt === 0; });
        },
      };
    }
    const dragon = makeDragon();
    dragon.group.position.set(0, 0, -17); scene.add(dragon.group);
    dragon.group.rotation.y = 0;
    // schat
    { const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xaa6a00, emissiveIntensity: 0.55, metalness: 0.8, roughness: 0.3 }), 110);
      const gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x555555, roughness: 0.2, flatShading: true }), 26);
      const d = new THREE.Object3D(); const cc = new THREE.Color(); const cols = [0x59e0ff, 0xff5a8a, 0x6affb0, 0xd070ff, 0xffe14a];
      for (let i = 0; i < 110; i++) { const side = i % 2 ? 1 : -1; const rr = rng() * 5.2; const a = rng() * TAU; d.position.set(side * (9 + Math.cos(a) * rr * 0.8) , 0.1 + (1 - rr / 5.2) * 1.3 + rng() * 0.3, -24 + Math.sin(a) * rr * 0.6 - 1); d.rotation.set(rng() * 3, rng() * 3, rng() * 3); d.updateMatrix(); coins.setMatrixAt(i, d.matrix); }
      for (let i = 0; i < 26; i++) { const side = i % 2 ? 1 : -1; const rr = rng() * 4; const a = rng() * TAU; d.position.set(side * (9 + Math.cos(a) * rr * 0.8), 0.7 + (1 - rr / 4) * 1.2, -24 + Math.sin(a) * rr * 0.6 - 1); d.rotation.set(rng() * 3, rng() * 3, rng() * 3); d.scale.setScalar(0.8 + rng() * 0.8); d.updateMatrix(); gems.setMatrixAt(i, d.matrix); gems.setColorAt(i, cc.setHex(cols[i % cols.length])); }
      scene.add(coins); scene.add(gems);
    }

    // ------------------------------------------------------------------ gedeelde materialen
    const stoneTex = tex.stone(1, 1);
    const floorMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xffffff, roughness: 0.9, emissive: 0x2a2850, emissiveIntensity: 0.7 });
    const iceMat = new THREE.MeshStandardMaterial({ map: tex.ice(1, 1), color: 0xcfeaff, roughness: 0.12, metalness: 0.25, emissive: 0x2a6a9a, emissiveIntensity: 0.35 });
    const lavaTex = tex.lava(1, 1).clone(); lavaTex.needsUpdate = true; lavaTex.userData.keep = true;
    const lavaMat = new THREE.MeshStandardMaterial({ map: lavaTex, emissive: 0xff5a10, emissiveMap: lavaTex, emissiveIntensity: 0.9, roughness: 0.6 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const rockBaseMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x4a4868, roughness: 1 });
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const glyphTex = glyphTexture();
    const dark = mat(0x23202e); const metal = mat(0x7e8294, { metalness: 0.7, roughness: 0.4 });
    const beamCore = new THREE.MeshBasicMaterial({ color: 0xe8fcff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const beamGlow = new THREE.MeshBasicMaterial({ color: 0x59d8ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
    const ringGeo = new THREE.TorusGeometry(0.62, 0.07, 6, 24);
    const labelGeo = new THREE.PlaneGeometry(1.8, 0.675);
    const badgeGeo = new THREE.PlaneGeometry(0.9, 0.9);
    const chMat = CH_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.4, flatShading: true }));

    // ------------------------------------------------------------------ level bouwen
    let lvl = null, prev = null;
    const beamPool = [];
    for (let i = 0; i < 44; i++) {
      const gr = new THREE.Group();
      gr.add(mesh(gCyl, beamCore, { cast: false, receive: false, rot: [Math.PI / 2, 0, 0], scale: [0.07, 1, 0.07] }));
      gr.add(mesh(gCyl, beamGlow, { cast: false, receive: false, rot: [Math.PI / 2, 0, 0], scale: [0.2, 1, 0.2] }));
      gr.visible = false; scene.add(gr); beamPool.push(gr);
    }

    function makeKeyMesh(c) {
      const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: CH_COLORS[c], emissive: CH_COLORS[c], emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.3 });
      g.add(mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 12), m, { cast: false, pos: [0, 0.42, 0] }));
      g.add(mesh(gCyl, m, { cast: false, pos: [0, -0.05, 0], scale: [0.06, 0.62, 0.06] }));
      g.add(mesh(gBox, m, { cast: false, pos: [0.14, -0.28, 0], scale: [0.26, 0.09, 0.09] }));
      g.add(mesh(gBox, m, { cast: false, pos: [0.1, -0.1, 0], scale: [0.18, 0.09, 0.09] }));
      g.scale.setScalar(1.25); return g;
    }

    function buildLevel(idx) {
      const L = parseLevel(LEVELS[idx]); const g = new THREE.Group(); scene.add(g);
      const cxz = (i) => [(i % L.w - (L.w - 1) / 2) * C, (((i / L.w) | 0) - (L.h - 1) / 2) * C];
      const lv = { idx, L, g, cxz, st: initState(L), d: null, chars: [], tStart: t, deaths: 0, steps: 0, resetHold: 0, upd: [], prompts: [], done: false, lavaCells: [] };
      lv.d = derive(L, lv.st);
      const isRock = (x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h || L.terrain[y * L.w + x] === 0 || L.terrain[y * L.w + x] === 2;
      const dummy = new THREE.Object3D(); const cc = new THREE.Color();

      // vloer / ijs / lava (instanced)
      const floors = [], ices = [], lavas = [];
      for (let i = 0; i < L.n; i++) {
        const tt = L.terrain[i]; const k = L.objKind[i];
        const isBridge = k === 'gate' && L.gates[L.obj[i]].kind === 'bridge';
        if (tt === 3 || isBridge) lavas.push(i);
        else if (tt === 4) ices.push(i);
        else if (tt === 1) floors.push(i);
      }
      const mk = (list, material, h, y, shade) => {
        if (!list.length) return null;
        const im = new THREE.InstancedMesh(gBox, material, list.length); im.receiveShadow = true;
        list.forEach((i, n) => { const [x, z] = cxz(i); dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(C - 0.04, h, C - 0.04); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix); im.setColorAt(n, cc.setHSL(0.68, 0.15, shade + ((i * 7) % 5) * 0.02)); });
        g.add(im); return im;
      };
      mk(floors, floorMat, 0.7, -0.35, 0.78); mk(ices, iceMat, 0.7, -0.35, 0.9);
      const lavaMesh = mk(lavas, lavaMat, 0.4, -0.5, 1.0);
      if (lavas.length) { const [lx, lz] = cxz(lavas[(lavas.length / 2) | 0]); lv.lavaPos = [lx, lz]; }
      lv.lavaCells = lavas;

      // rotsen (muren) + buitenrand
      const rocks = [];
      const near = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < L.w && yy < L.h && L.terrain[yy * L.w + xx] !== 0 && L.terrain[yy * L.w + xx] !== 2) return true; } return false; };
      const rr = mulberry32(idx * 977 + 13);
      const bases = [];
      for (let y = -3; y < L.h + 3; y++) for (let x = -3; x < L.w + 3; x++) {
        if (!isRock(x, y)) continue;
        if (!near(x, y, 2)) continue;
        const adj = near(x, y, 1);
        const [px, pz] = [(x - (L.w - 1) / 2) * C, (y - (L.h - 1) / 2) * C];
        if (adj) bases.push([px, pz, 0.7 + rr() * 0.25]);
        const n = adj ? 2 : 1;
        for (let k = 0; k < n; k++) rocks.push([px + (rr() - 0.5) * 0.9, pz + (rr() - 0.5) * 0.9, adj ? 0.7 + rr() * 0.5 : 1.0 + rr() * 0.9, 0.75 + rr() * 0.4, adj ? 0 : 1]);
      }
      const rim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, rocks.length); rim.castShadow = true; rim.receiveShadow = true;
      rocks.forEach((r, n) => { dummy.position.set(r[0], r[2] * 0.45 - 0.1, r[1]); dummy.rotation.set(rr() * 3, rr() * 3, rr() * 3); dummy.scale.set(r[3] * 0.95, r[2] * 0.75, r[3] * 0.95); dummy.updateMatrix(); rim.setMatrixAt(n, dummy.matrix); rim.setColorAt(n, cc.setHSL(0.68 + rr() * 0.05, 0.2 + rr() * 0.1, r[4] ? 0.3 + rr() * 0.1 : 0.42 + rr() * 0.12)); });
      g.add(rim);
      const bm = new THREE.InstancedMesh(gBox, rockBaseMat, Math.max(1, bases.length)); bm.castShadow = true; bm.receiveShadow = true;
      bases.forEach((b, n) => { dummy.position.set(b[0], b[2] / 2 - 0.35, b[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(C, b[2] + 0.35, C); dummy.updateMatrix(); bm.setMatrixAt(n, dummy.matrix); });
      g.add(bm);
      // kristallen op de rotsrand
      const cands = bases.filter((b, n) => n % 3 === 0);
      const cryCols = [0x59e0ff, 0xd070ff, 0x6affb0, 0xff7ad0, 0x8a7aff];
      const cm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 1.5, 5), crystalMat, cands.length * 3);
      cands.forEach((b, n) => { for (let k = 0; k < 3; k++) { dummy.position.set(b[0] + (rr() - 0.5) * 1.2, b[2] + 0.5 + k * 0.05, b[1] + (rr() - 0.5) * 1.2); const s = 0.6 + rr() * 0.9; dummy.scale.set(s, s * (0.8 + rr() * 0.8), s); dummy.rotation.set((rr() - 0.5) * 0.7, rr() * 3, (rr() - 0.5) * 0.7); dummy.updateMatrix(); cm.setMatrixAt(n * 3 + k, dummy.matrix); cm.setColorAt(n * 3 + k, cc.setHex(cryCols[(n + k) % cryCols.length])); } });
      g.add(cm);
      lv.crystalCells = cands;

      // startvakjes (ring in spelerskleur) + uitgangen
      [0, 1].forEach((i) => {
        const [x, z] = cxz(L.starts[i]);
        g.add(mesh(new THREE.TorusGeometry(0.8, 0.04, 4, 28), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.55 }), { cast: false, receive: false, pos: [x, 0.03, z], rot: [Math.PI / 2, 0, 0] }));
      });
      lv.exits = L.exits.map((ci) => {
        const [x, z] = cxz(ci); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        const glyph = mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe9a0 }), { cast: false, receive: false, pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0] });
        const col = mesh(new THREE.CylinderGeometry(0.75, 0.9, 3.2, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), { cast: false, receive: false, pos: [0, 1.6, 0] });
        const lab = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture('UITGANG', '#ffe9a0', 44), transparent: true, depthWrite: false })); lab.renderOrder = 12; lab.scale.setScalar(0.8); lab.position.set(0, 3.5, 0);
        grp.add(glyph); grp.add(col); grp.add(lab);
        return { ci, x, z, grp, glyph, col, lab, occ: -1 };
      });

      // objecten
      const spanZ = (ci) => { const x = ci % L.w, y = (ci / L.w) | 0; return isRock(x, y - 1) && isRock(x, y + 1); };
      lv.gates = L.gates.map((gt, gi) => {
        const [x, z] = cxz(gt.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        const m = chMat[gt.ch]; let moving, closedY = 0, openY = -2.0;
        if (gt.kind !== 'bridge') grp.add(mesh(gBox, new THREE.MeshBasicMaterial({ color: CH_COLORS[gt.ch], transparent: true, opacity: 0.35 }), { cast: false, receive: false, pos: [0, 0.02, 0], scale: [C - 0.1, 0.04, C - 0.1] }));
        if (gt.kind === 'door') {
          const sz = spanZ(gt.cell); const holder = new THREE.Group(); grp.add(holder); if (!sz) holder.rotation.y = Math.PI / 2; // bars along z
          for (const s of [-1, 1]) { holder.add(mesh(gBox, mat(0x4b4860), { pos: [0, 1.05, s * 0.93], scale: [0.36, 2.1, 0.3] })); holder.add(mesh(new THREE.OctahedronGeometry(0.2, 0), m, { cast: false, pos: [0, 2.25, s * 0.93] })); }
          holder.add(mesh(gBox, mat(0x4b4860), { pos: [0, 2.0, 0], scale: [0.3, 0.2, 2.0] }));
          moving = new THREE.Group(); holder.add(moving);
          for (let b = -3; b <= 3; b++) moving.add(mesh(gBox, metal, { pos: [0, 0.9, b * 0.26], scale: [0.16, 1.8, 0.12] }));
          moving.add(mesh(gBox, m, { cast: false, pos: [0, 1.2, 0], scale: [0.14, 0.14, 1.7] }));
          openY = -1.95;
        } else if (gt.kind === 'wall') {
          moving = new THREE.Group(); grp.add(moving);
          moving.add(mesh(gBox, new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x8a88b0, roughness: 0.9 }), { pos: [0, 0.85, 0], scale: [C - 0.04, 1.7, C - 0.04] }));
          for (const s of [-1, 1]) moving.add(mesh(gBox, m, { cast: false, pos: [0, 1.0, s * (C / 2 - 0.01)], scale: [C - 0.4, 0.14, 0.04] }));
          moving.add(mesh(gBox, m, { cast: false, pos: [C / 2 - 0.01, 1.0, 0], scale: [0.04, 0.14, C - 0.4] })); moving.add(mesh(gBox, m, { cast: false, pos: [-C / 2 + 0.01, 1.0, 0], scale: [0.04, 0.14, C - 0.4] }));
          moving.add(mesh(new THREE.OctahedronGeometry(0.28, 0), m, { cast: false, pos: [0, 1.8, 0] }));
          openY = -1.9;
        } else { // brug
          moving = new THREE.Group(); grp.add(moving);
          moving.add(mesh(gBox, new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#6b4a7a'), roughness: 0.8 }), { pos: [0, -0.1, 0], scale: [C - 0.06, 0.24, C - 0.06] }));
          moving.add(mesh(gBox, m, { cast: false, pos: [0, 0.03, C / 2 - 0.12], scale: [C - 0.1, 0.07, 0.1] })); moving.add(mesh(gBox, m, { cast: false, pos: [0, 0.03, -C / 2 + 0.12], scale: [C - 0.1, 0.07, 0.1] }));
          moving.add(mesh(gBox, m, { cast: false, pos: [C / 2 - 0.12, 0.03, 0], scale: [0.1, 0.07, C - 0.1] })); moving.add(mesh(gBox, m, { cast: false, pos: [-C / 2 + 0.12, 0.03, 0], scale: [0.1, 0.07, C - 0.1] }));
          closedY = -1.3; openY = 0;
          // zo lijkt een gesloten brug 'weg'
        }
        const o = { gt, grp, moving, amt: gt.kind === 'bridge' ? 0 : 0, kind: gt.kind, closedY, openY, x, z };
        o.amt = lv.d.gateOpen[gi] ? 1 : 0;
        moving.position.y = lerp(gt.kind === 'bridge' ? closedY : 0, openY, o.amt);
        if (gt.kind === 'bridge') moving.position.y = lerp(closedY, openY, o.amt);
        return o;
      });

      lv.plates = L.plates.map((pl, pi) => {
        const [x, z] = cxz(pl.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        grp.add(mesh(new THREE.CylinderGeometry(0.82, 0.9, 0.12, 20), mat(0x3a3750), { pos: [0, 0.04, 0] }));
        const disc = mesh(new THREE.CylinderGeometry(0.62, 0.64, 0.14, 20), new THREE.MeshStandardMaterial({ color: CH_COLORS[pl.ch], emissive: CH_COLORS[pl.ch], emissiveIntensity: 0.3, roughness: 0.5 }), { pos: [0, 0.12, 0] });
        const ring = mesh(new THREE.TorusGeometry(0.76, 0.06, 6, 28), chMat[pl.ch], { cast: false, pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0] });
        grp.add(disc); grp.add(ring);
        return { pl, grp, disc, ring, press: 0 };
      });

      lv.levers = L.levers.map((lvr, li) => {
        const [x, z] = cxz(lvr.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        grp.add(mesh(gBox, mat(0x4b4860), { pos: [0, 0.4, 0], scale: [1.3, 0.8, 1.3] }));
        const pivot = new THREE.Group(); pivot.position.set(0, 0.85, 0); grp.add(pivot);
        pivot.add(mesh(gCyl, metal, { pos: [0, 0.6, 0], scale: [0.07, 1.2, 0.07] }));
        pivot.add(mesh(gSph, chMat[lvr.ch], { cast: false, pos: [0, 1.25, 0], scale: 0.2 }));
        grp.add(mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 18), chMat[lvr.ch], { cast: false, pos: [0, 0.82, 0], rot: [Math.PI / 2, 0, 0] }));
        return { lvr, grp, pivot, ang: lv.st.lever[li] ? 0.75 : -0.75 };
      });

      lv.mirrors = L.mirrors.map((mr, mi) => {
        const [x, z] = cxz(mr.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        grp.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.7, 10), mat(0x4b4860), { pos: [0, 0.35, 0] }));
        const rot = new THREE.Group(); rot.position.set(0, 1.55, 0); grp.add(rot);
        rot.add(mesh(gBox, new THREE.MeshStandardMaterial({ color: 0xbff0ff, emissive: 0x3aa8e0, emissiveIntensity: 0.7, transparent: true, opacity: 0.82, metalness: 0.9, roughness: 0.08 }), { cast: false, scale: [1.75, 1.7, 0.1] }));
        rot.add(mesh(gBox, metal, { cast: false, pos: [0, 0.9, 0], scale: [1.85, 0.08, 0.14] })); rot.add(mesh(gBox, metal, { cast: false, pos: [0, -0.9, 0], scale: [1.85, 0.08, 0.14] }));
        grp.add(mesh(gCyl, metal, { pos: [0, 0.9, 0], scale: [0.07, 0.6, 0.07] }));
        const ang = lv.st.mirror[mi] === 0 ? Math.PI / 4 : -Math.PI / 4; rot.rotation.y = ang;
        return { mr, grp, rot, ang };
      });

      lv.emitters = L.emitters.map((em) => {
        const [x, z] = cxz(em.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        grp.add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.9, 8), mat(0x3a3750), { pos: [0, 0.45, 0] }));
        const cr = mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xbff4ff }), { cast: false, pos: [0, 1.5, 0], scale: [0.7, 1.3, 0.7] });
        grp.add(cr);
        const dx = DIRS[em.dir][0], dz = DIRS[em.dir][1];
        grp.add(mesh(new THREE.ConeGeometry(0.28, 0.7, 5), new THREE.MeshBasicMaterial({ color: 0xe8fcff }), { cast: false, pos: [dx * 0.75, 0.95, dz * 0.75], rot: [dz * Math.PI / 2, 0, -dx * Math.PI / 2] }));
        return { em, grp, cr };
      });

      lv.sensors = L.sensors.map((sn, si) => {
        const [x, z] = cxz(sn.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        grp.add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.7, 8), mat(0x3a3750), { pos: [0, 0.35, 0] }));
        grp.add(mesh(new THREE.TorusGeometry(0.6, 0.09, 6, 20), chMat[sn.ch], { cast: false, pos: [0, 1.0, 0], rot: [Math.PI / 2, 0, 0] }));
        const crm = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, emissive: CH_COLORS[sn.ch], emissiveIntensity: 0.0, roughness: 0.2, flatShading: true });
        const cr = mesh(new THREE.OctahedronGeometry(0.42, 0), crm, { cast: false, pos: [0, 1.2, 0], scale: [0.8, 1.2, 0.8] }); grp.add(cr);
        return { sn, grp, cr, crm, lit: 0 };
      });

      lv.locks = L.locks.map((lk, ki) => {
        const [x, z] = cxz(lk.cell); const grp = new THREE.Group(); grp.position.set(x, 0, z); g.add(grp);
        const body = new THREE.Group(); grp.add(body);
        body.add(mesh(gBox, new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x8a88b0, roughness: 0.9 }), { pos: [0, 0.8, 0], scale: [C - 0.06, 1.6, C - 0.06] }));
        const pad = new THREE.MeshStandardMaterial({ color: CH_COLORS[lk.c], emissive: CH_COLORS[lk.c], emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.3 });
        for (const s of [-1, 1]) {
          body.add(mesh(gBox, pad, { cast: false, pos: [0, 0.75, s * (C / 2 - 0.02)], scale: [0.85, 0.7, 0.1] }));
          body.add(mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 12, Math.PI), pad, { cast: false, pos: [0, 1.1, s * (C / 2 - 0.02)] }));
          body.add(mesh(gBox, dark, { cast: false, pos: [0, 0.78, s * (C / 2 + 0.04)], scale: [0.12, 0.28, 0.05] }));
        }
        for (const s of [-1, 1]) {
          body.add(mesh(gBox, pad, { cast: false, pos: [s * (C / 2 - 0.02), 0.75, 0], scale: [0.1, 0.7, 0.85] }));
        }
        return { lk, grp, body, amt: lv.st.lock[ki] ? 0 : 1 };
      });

      lv.keys = L.keys.map((k, ki) => {
        const [x, z] = cxz(k.cell); const m = makeKeyMesh(k.c); g.add(m); m.position.set(x, 1.0, z);
        return { k, m, x, z, fx: x, fy: 1.0, fz: z, carried: -1 };
      });

      // A-knop prompts bij hendels/spiegels
      const mkPrompt = (cell, pi) => {
        const m = new THREE.Mesh(badgeGeo, new THREE.MeshBasicMaterial({ map: badgeTexture(KEY_LABELS[pi].a, players[pi].css), transparent: true, depthWrite: false }));
        m.renderOrder = 15; const [x, z] = cxz(cell); m.position.set(x + (pi ? 0.5 : -0.5), 2.9, z); m.visible = false; m.userData.cell = cell; m.userData.pi = pi; g.add(m); lv.prompts.push(m);
      };
      for (const o of [...L.levers, ...L.mirrors]) { mkPrompt(o.cell, 0); mkPrompt(o.cell, 1); }

      // spelers
      lv.chars = [0, 1].map((i) => {
        const c = ctx.make.brother(i); const [x, z] = cxz(L.starts[i]);
        c.group.scale.setScalar(0.92); c.group.position.set(x, 0, z); g.add(c.group);
        const ring = mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9 }), { cast: false, receive: false, pos: [x, 0.1, z], rot: [Math.PI / 2, 0, 0] }); g.add(ring);
        const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture(players[i].name, players[i].css), transparent: true, depthWrite: false })); label.renderOrder = 12; g.add(label);
        return { i, c, ring, label, x, z, q: [], cd: 0, dir: -1, buf: -1, bufT: 0, sink: 0, pop: 0, bump: 0, bdx: 0, bdz: 0, lastCell: L.starts[i], sliding: false };
      });
      // lichtjes op de kristallen
      crystalLights.forEach((l, n) => { const b = lv.crystalCells[(n * 3 + 1) % Math.max(1, lv.crystalCells.length)]; if (b) l.position.set(b[0], 3.2, b[1]); });
      lavaLight.intensity = lv.lavaPos ? 1.6 : 0; if (lv.lavaPos) lavaLight.position.set(lv.lavaPos[0], 1.2, lv.lavaPos[1]);
      return lv;
    }

    // ------------------------------------------------------------------ camera
    const fitCam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 500);
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camTarget = new THREE.Vector3();
    const ELEV = 52 * Math.PI / 180;
    function fitCamera(L, snap) {
      fitCam.fov = camera.fov; fitCam.aspect = camera.aspect || 16 / 9; fitCam.updateProjectionMatrix();
      let x0 = 99, x1 = -99, y0 = 99, y1 = -99;
      for (let i = 0; i < L.n; i++) if (L.terrain[i] !== 0 && L.terrain[i] !== 2 || L.objKind[i]) { const gx = i % L.w, gy = (i / L.w) | 0; x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy); }
      const ox = (x0 + x1) / 2 - (L.w - 1) / 2, oz = (y0 + y1) / 2 - (L.h - 1) / 2;
      const hw = (x1 - x0 + 1) * C / 2 + 1.0, hd = (y1 - y0 + 1) * C / 2 + 1.0; const cen = new THREE.Vector3(ox * C, 0.3, oz * C);
      const corners = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 2.2]) corners.push(new THREE.Vector3(cen.x + sx * hw, y, cen.z + sz * hd));
      let best = 60, bestShift = 0, found = false;
      const look = new THREE.Vector3();
      for (let dist = 12; dist < 80 && !found; dist += 0.5) {
        for (let shift = 0; shift <= 16 && !found; shift += 0.5) {
          look.set(cen.x, cen.y, cen.z - shift);
          fitCam.position.set(look.x, look.y + Math.sin(ELEV) * dist, look.z + Math.cos(ELEV) * dist); fitCam.lookAt(look); fitCam.updateMatrixWorld(); fitCam.updateProjectionMatrix();
          let ok = true; for (const c of corners) { tmpV.copy(c).project(fitCam); if (Math.abs(tmpV.x) > 0.9 || tmpV.y > 0.2 || tmpV.y < -0.74) { ok = false; break; } }
          if (ok) { best = dist; bestShift = shift; found = true; }
        }
      }
      camLook.set(cen.x, cen.y, cen.z - bestShift); camPos.set(camLook.x, camLook.y + Math.sin(ELEV) * best, camLook.z + Math.cos(ELEV) * best);
      if (snap) { camera.position.copy(camPos); camera.lookAt(camLook); camTarget.copy(camLook); }
    }
    function updateCamera(dt) {
      camera.position.x = damp(camera.position.x, camPos.x, 2.5, dt); camera.position.y = damp(camera.position.y, camPos.y, 2.5, dt); camera.position.z = damp(camera.position.z, camPos.z, 2.5, dt);
      camTarget.x = damp(camTarget.x, camLook.x, 2.5, dt); camTarget.y = damp(camTarget.y, camLook.y, 2.5, dt); camTarget.z = damp(camTarget.z, camLook.z, 2.5, dt);
      camera.lookAt(camTarget);
    }

    // ------------------------------------------------------------------ spelverloop
    let state = 'play', stateT = 0, elapsed = 0, finished = false, started = false, doneCount = 0, deathsTotal = 0, snoreT = 2;
    const levelTimes = [];
    const KEYS_TXT = `${KEY_LABELS[0].a} / ${KEY_LABELS[1].a}`;
    const hintFor = (lv) => lv.L.hint.replace('{A}', KEYS_TXT);

    function startLevel(idx, snap) {
      lvl = buildLevel(idx); fitCamera(lvl.L, snap);
      dragonTargetZ = -(lvl.L.h * C / 2) - 11;
      hud.setHint(hintFor(lvl)); updateHud();
    }
    let dragonTargetZ = -17;
    function updateHud() {
      hud.setScore(`Level ${Math.min(lvl.idx + 1, LEVELS.length)} / ${LEVELS.length}  ·  ${lvl.L.name}`);
      for (let i = 0; i < 2; i++) { const kk = lvl.st.key.map((s, ki) => (s === i + 1 ? CH_NAMES[lvl.L.keys[ki].c] + ' sleutel' : null)).filter(Boolean); hud.setPlayerInfo(i, kk.length ? '🔑 ' + kk.join(', ') : 'Samen sterk!'); }
    }
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    function say(text, x, z, col = '#ffe14a', y = 3.4) { fx.texts.add(text, x, y, z, col, 0.9); }

    // wachtrij van beweging voor een personage
    function queuePath(lv, ch, path, slide) {
      let any = false;
      for (const cell of path) { const [x, z] = lv.cxz(cell); ch.q.push({ x, z, spd: slide ? C / SLIDE : C / WALK, slide }); any = true; }
      ch.sliding = slide && path.length > 1;
      return any;
    }

    function doAction(who, a) {
      const lv = lvl, L = lv.L, ch = lv.chars[who];
      const before = lv.d;
      const prevSt = lv.st;
      const r = act(L, lv.st, who, a);
      if (a < 4) ch.c.faceDir(DIRS[a][0], DIRS[a][1]);
      if (!r) {
        if (a < 4) { ch.bump = 0.001; ch.bdx = DIRS[a][0]; ch.bdz = DIRS[a][1]; if (t - (ch.lastBump || 0) > 0.35) { ch.lastBump = t; audio.sfx('thud', { vol: 0.16, rate: 1.3 }); } }
        else audio.sfx('tick', { vol: 0.25 });
        return false;
      }
      lv.st = r.s; lv.d = derive(L, r.s); lv.steps++;
      // beweging
      let cdTime = 0.12;
      if (a < 4 && r.path.length) {
        const slide = r.path.length > 1 && L.terrain[r.path[0]] === 4;
        queuePath(lv, ch, r.path, slide);
        cdTime = r.path.length * (slide ? SLIDE : WALK) + 0.02;
        if (slide) { audio.sfx('whoosh', { vol: 0.35, rate: 1.4 }); }
        else audio.sfx('step', { vol: 0.12, rate: 0.9 + Math.random() * 0.3 });
      }
      // gebeurtenissen
      for (const e of r.events) {
        const [ex, ez] = lv.cxz(e.cell);
        if (e.t === 'key') { audio.sfx('coin'); say('Sleutel!', ex, ez, CH_CSS[L.keys[e.idx].c]); fx.particles.burst(ex, 1.2, ez, { count: 12, speed: 3, colors: [CH_COLORS[L.keys[e.idx].c], 0xffffff], size: 0.22, life: 0.8 }); updateHud(); }
        if (e.t === 'unlock') { audio.sfx('powerup'); audio.sfx('wood', { vol: 0.5 }); say('Klik!', ex, ez, '#ffe14a'); fx.particles.burst(ex, 1.0, ez, { count: 22, speed: 4, colors: [0xffe14a, 0xffffff], size: 0.3, life: 1 }); ctx.shake(0.2); updateHud(); }
        if (e.t === 'lever') { audio.sfx('wood', { vol: 0.7, rate: 0.8 }); audio.sfx('scrape', { vol: 0.5 }); ctx.shake(0.15); }
        if (e.t === 'mirror') { audio.sfx('sparkle'); fx.particles.burst(ex, 1.6, ez, { count: 10, speed: 2.5, colors: [0xbff4ff, 0xffffff], size: 0.2, life: 0.7 }); }
        if (e.t === 'die') {
          lv.deaths++; deathsTotal++;
          const chd = lv.chars[e.who];
          const respawn = lv.cxz(r.s.p[e.who]);
          if (e.fall) { chd.q.length = 0; chd.q.push({ die: true, cause: e.cause, x: ex, z: ez, spd: 40 }); }
          else chd.q.push({ die: true, cause: e.cause, x: ex, z: ez, spd: 40 });
          chd.q.push({ tele: respawn });
          cdTime += 0.9;
        }
      }
      ch.cd = Math.max(ch.cd, cdTime);
      // geluiden voor platen / deuren
      for (let i = 0; i < before.plateOn.length; i++) if (before.plateOn[i] !== lv.d.plateOn[i]) { audio.sfx(lv.d.plateOn[i] ? 'click' : 'tick', { vol: 0.5, rate: lv.d.plateOn[i] ? 1.1 : 0.8 }); }
      let gateChanged = false; for (let i = 0; i < L.gates.length; i++) if (before.gateOpen[i] !== lv.d.gateOpen[i]) gateChanged = true;
      if (gateChanged) { audio.sfx('door', { vol: 0.6 }); audio.sfx('scrape', { vol: 0.35 }); ctx.shake(0.1); }
      for (let i = 0; i < before.lit.length; i++) if (before.lit[i] !== lv.d.lit[i]) { if (lv.d.lit[i]) { audio.sfx('bell', { vol: 0.8 }); say('Raak!', lv.sensors[i].grp.position.x, lv.sensors[i].grp.position.z, '#bff4ff'); } }
      if (r.win && !lv.done) levelDone();
      return true;
    }

    function levelDone() {
      const lv = lvl; lv.done = true; state = 'clear'; stateT = 0;
      levelTimes.push(elapsed); doneCount++;
      audio.sfx('powerup'); setTimeout(() => audio.sfx('bell', { vol: 0.8 }), 200); setTimeout(() => audio.sfx('sparkle'), 450);
      hud.showBig(doneCount === LEVELS.length ? 'Schat gevonden!' : `Level ${lv.idx + 1} klaar!`, 1500, '#ffe14a'); ctx.shake(0.3);
      lv.chars.forEach((a) => { a.c.pose = 'cheer'; a.c.jump(); a.q.length = 0; });
      for (const e of lv.exits) { fx.particles.burst(e.x, 1.2, e.z, { count: 30, speed: 5, up: 1.8, colors: [0xffe14a, 0xffffff, 0x7affb0, 0x59e0ff, 0xff8ae6], size: 0.34, life: 1.6, gravity: 6 }); fx.particles.ring(e.x, 0.3, e.z, { count: 20, speed: 5, color: 0xffe9a0 }); }
      hud.setHint(null);
      dragon.wake = 0; // hij slaapt gewoon door
      fx.texts.add('Ssst!', dragon.group.position.x, 7, dragon.group.position.z + 2, '#bfa8ff', 1.1);
    }

    function nextLevel() {
      const next = lvl.idx + 1;
      if (next >= LEVELS.length) { endGame(); return; }
      prev = lvl; startLevel(next, false);
      lvl.g.position.x = 40; state = 'slide'; stateT = 0; audio.sfx('whoosh', { vol: 0.6 });
      hud.toast(`Level ${next + 1}: ${lvl.L.name}`, 2200);
    }

    function endGame(cap = false) {
      if (finished) return; finished = true; state = 'over'; hud.setHint(null);
      const all = doneCount >= LEVELS.length;
      const stars = !all ? (doneCount >= 4 ? 1 : 0) : elapsed <= STAR3 ? 3 : elapsed <= STAR2 ? 2 : 1;
      lvl.chars.forEach((a) => { a.c.pose = stars ? 'cheer' : 'sad'; });
      ctx.finish({
        stars, score: Math.round(elapsed),
        summary: all ? `Schat gevonden in <b>${fmt(elapsed)}</b>! (3 sterren: onder ${fmt(STAR3)}, 2 sterren: onder ${fmt(STAR2)})${deathsTotal ? `<br>De draak werd ${deathsTotal === 1 ? '1 keer bijna' : deathsTotal + ' keer bijna'} wakker door lava-ongelukjes...` : '<br>Geen enkele lava-ongelukje, de draak slaapt nog steeds!'}` : `Het werd laat... jullie losten <b>${doneCount}</b> van de ${LEVELS.length} levels op.`,
      });
    }

    // ------------------------------------------------------------------ invoer
    function handleInput(dt) {
      const lv = lvl; let reset = 0;
      for (let i = 0; i < 2; i++) {
        const p = input.p[i], ch = lv.chars[i];
        const pr = [p.upP, p.downP, p.leftP, p.rightP], hd = [p.up, p.down, p.left, p.right];
        for (let d = 0; d < 4; d++) if (pr[d]) { ch.dir = d; ch.buf = d; ch.bufT = 0.25; }
        if (ch.dir >= 0 && !hd[ch.dir]) ch.dir = hd.indexOf(true);
        ch.bufT -= dt; ch.cd -= dt;
        if (ch.cd <= 0) {
          if (p.aP) { doAction(i, 4); ch.cd = Math.max(ch.cd, 0.15); }
          else {
            let d = -1, fresh = false;
            if (ch.buf >= 0 && ch.bufT > 0) { d = ch.buf; fresh = true; } else if (ch.dir >= 0) d = ch.dir;
            ch.buf = -1;
            if (d >= 0) { const ok = doAction(i, d); if (!ok) ch.cd = fresh ? 0.1 : 0.28; else ch.cd = Math.max(ch.cd, WALK * (fresh ? 1.25 : 1)); }
          }
          if (state !== 'play') return;
        }
        if (p.b) reset = 1;
      }
      if (reset) lv.resetHold += dt; else lv.resetHold = Math.max(0, lv.resetHold - dt * 3);
      if (lv.resetHold > 0.05) {
        const n = Math.min(8, Math.round(lv.resetHold / RESET_HOLD * 8));
        hud.setHint(`↺ Level herstarten… ${'▰'.repeat(n)}${'▱'.repeat(8 - n)}`); lv._hintOn = true;
        if (lv.resetHold >= RESET_HOLD) { lv.resetHold = 0; resetLevel(); }
      } else if (lv._hintOn) { lv._hintOn = false; hud.setHint(hintFor(lv)); }
    }

    function resetLevel() {
      const lv = lvl, L = lv.L;
      lv.st = initState(L); lv.d = derive(L, lv.st);
      lv.chars.forEach((a) => { const [x, z] = lv.cxz(L.starts[a.i]); a.q.length = 0; a.x = x; a.z = z; a.cd = 0; a.sink = 0; a.c.pose = 'idle'; a.c.jump(); fx.particles.burst(x, 0.8, z, { count: 12, speed: 3, colors: [0xffffff, 0xffe14a], size: 0.25, life: 0.7 }); });
      audio.sfx('whoosh', { vol: 0.7 }); hud.toast('Level opnieuw!', 1000); updateHud(); hud.setHint(hintFor(lv));
    }

    // ------------------------------------------------------------------ visuele update
    const dust = { a: 0, b: 0 };
    function visuals(lv, dt) {
      const L = lv.L, d = lv.d, st = lv.st;
      // personages
      for (const ch of lv.chars) {
        let moving = false; let spd = 0;
        if (ch.q.length) {
          const w = ch.q[0];
          if (w.tele) {
            // terug naar start: plop
            ch.x = w.tele[0]; ch.z = w.tele[1]; ch.sink = 0; ch.pop = 0.001; ch.q.shift();
            ch.c.jump(); audio.sfx('boing', { vol: 0.55 }); fx.particles.burst(ch.x, 0.8, ch.z, { count: 14, speed: 3, colors: [0xffffff, 0xffe14a, 0xff9a3a], size: 0.25, life: 0.8 });
          } else {
            const dx = w.x - ch.x, dz = w.z - ch.z; const dist = Math.hypot(dx, dz);
            const mv = Math.min(dist, w.spd * dt);
            if (dist > 0.0001) { ch.x += dx / dist * mv; ch.z += dz / dist * mv; }
            moving = true; spd = w.spd;
            if (dist - mv < 0.001) {
              ch.q.shift();
              if (w.die) {
                ch.sink = 0.001; // zinkt
                const lava = w.cause === 'lava';
                audio.sfx(lava ? 'sizzle' : 'splash', { vol: 0.7 }); audio.sfx('hurt', { vol: 0.4, rate: 1.3 });
                fx.particles.burst(w.x, 0.5, w.z, { count: 26, speed: 4.5, up: 1.6, colors: lava ? [0xff7a1a, 0xffd23f, 0xff3a0a] : [0x8a7aff, 0xffffff], size: 0.32, life: 1.0 });
                const lines = ['Au, heet!', 'Plof!', 'Hete voetjes!', 'Oeps!', 'Sssst!!'];
                say(lines[Math.floor(Math.random() * lines.length)], w.x, w.z, '#ff9a5a', 3.2);
                ctx.shake(0.3); dragon.wake = 1.1; setTimeout(() => hud.toast('Ssst! Niet de draak wakker maken!', 1600), 250);
                audio.sfx('buzz', { vol: 0.25 });
              }
            }
          }
        }
        if (ch.sink > 0) { ch.sink += dt; }
        if (ch.pop > 0) { ch.pop += dt; if (ch.pop > 0.35) ch.pop = 0; }
        const sinkK = ch.sink > 0 ? clamp(1 - ch.sink / 0.35, 0, 1) : 1;
        const popK = ch.pop > 0 ? clamp(ch.pop / 0.25, 0, 1) : 1;
        const sc = 0.92 * (ch.sink > 0 ? sinkK : popK);
        ch.c.group.scale.setScalar(Math.max(0.01, sc));
        const slide = moving && spd > C / WALK * 1.4;
        ch.c.speed = damp(ch.c.speed, moving && !slide ? 1 : 0, 18, dt);
        if (slide) { ch.c.pose = 'hands_up'; if (Math.random() < 0.6) fx.particles.emit(ch.x + rand(-0.3, 0.3), 0.15, ch.z + rand(-0.3, 0.3), rand(-0.5, 0.5), rand(0.5, 1.2), rand(-0.5, 0.5), { life: 0.5, size: 0.22, color: 0xdff4ff }); }
        else if (ch.c.pose === 'hands_up') ch.c.pose = 'idle';
        let ox = 0, oz = 0;
        if (ch.bump > 0) { ch.bump += dt; const k = ch.bump / 0.16; if (k >= 1) ch.bump = 0; else { const s = Math.sin(k * Math.PI) * 0.2; ox = ch.bdx * s; oz = ch.bdz * s; } }
        const hop = moving && !slide ? Math.abs(Math.sin(t * 22)) * 0.08 : 0;
        ch.c.group.position.set(ch.x + ox, hop - (ch.sink > 0 ? (1 - sinkK) * 0.8 : 0), ch.z + oz);
        ch.ring.position.set(ch.x + ox, 0.1, ch.z + oz); ch.ring.visible = ch.sink === 0;
        ch.label.position.set(ch.x, ch.c.height * 0.92 + 0.85, ch.z + 0.2); ch.label.quaternion.copy(camera.quaternion);
        ch.c.update(dt);
      }
      // platen
      lv.plates.forEach((p, i) => {
        const on = d.plateOn[i]; p.press = damp(p.press, on, 14, dt);
        p.disc.position.y = 0.12 - p.press * 0.07; p.disc.material.emissiveIntensity = 0.3 + p.press * 1.2; p.ring.material.emissiveIntensity = 0.5 + p.press * 1.1;
        if (on && Math.random() < 0.15) fx.particles.emit(p.grp.position.x + rand(-0.5, 0.5), 0.2, p.grp.position.z + rand(-0.5, 0.5), 0, rand(0.8, 1.6), 0, { life: 0.7, size: 0.2, color: CH_COLORS[p.pl.ch] });
      });
      // deuren / muren / bruggen
      lv.gates.forEach((o, i) => {
        const target = d.gateOpen[i] ? 1 : 0; const prevAmt = o.amt;
        o.amt = damp(o.amt, target, 7, dt);
        if (Math.abs(o.amt - target) < 0.004) o.amt = target;
        o.moving.position.y = o.kind === 'bridge' ? lerp(o.closedY, o.openY, o.amt) : lerp(0, o.openY, o.amt);
        if (o.kind !== 'bridge' && Math.abs(o.amt - prevAmt) > 0.002 && Math.random() < 0.5) fx.particles.dust(o.x, 0.05, o.z, 1, 0xb0a8c8);
        if (o.kind === 'bridge') o.moving.visible = o.amt > 0.02 || true;
      });
      // hendels
      lv.levers.forEach((o, i) => { const tg = st.lever[i] ? 0.75 : -0.75; o.ang = damp(o.ang, tg, 12, dt); o.pivot.rotation.z = o.ang; });
      // spiegels
      lv.mirrors.forEach((o, i) => { const tg = st.mirror[i] === 0 ? Math.PI / 4 : -Math.PI / 4; o.ang = damp(o.ang, tg, 12, dt); o.rot.rotation.y = o.ang; o.rot.position.y = 1.55 + Math.sin(t * 2 + i) * 0.05; });
      lv.emitters.forEach((o) => { o.cr.rotation.y = t * 1.5; o.cr.scale.y = 1.3 + Math.sin(t * 5) * 0.1; });
      lv.sensors.forEach((o, i) => { const tg = d.lit[i] ? 1 : 0; o.lit = damp(o.lit, tg, 10, dt); o.crm.emissiveIntensity = o.lit * 1.6; o.crm.color.setRGB(lerp(0.16, 1, o.lit), lerp(0.16, 1, o.lit), lerp(0.22, 1, o.lit)); o.cr.rotation.y = t * (1 + o.lit * 2); });
      lv.locks.forEach((o, i) => { const tg = st.lock[i] ? 0 : 1; o.amt = damp(o.amt, tg, 9, dt); if (o.amt < 0.02) o.body.visible = false; else { o.body.visible = true; o.body.scale.setScalar(Math.max(0.01, o.amt)); o.body.position.y = (1 - o.amt) * 0.6; o.body.rotation.y = (1 - o.amt) * 3; } });
      // sleutels
      lv.keys.forEach((o, i) => {
        const s = st.key[i]; let tx = o.x, ty = 1.0 + Math.sin(t * 2.5 + i) * 0.12, tz = o.z, vis = true;
        if (s === 1 || s === 2) { const ch = lv.chars[s - 1]; tx = ch.x; tz = ch.z; ty = ch.c.height * 0.92 + 1.55 + Math.sin(t * 4) * 0.08; }
        else if (s === 3) vis = false;
        o.fx = damp(o.fx, tx, 14, dt); o.fy = damp(o.fy, ty, 14, dt); o.fz = damp(o.fz, tz, 14, dt);
        o.m.position.set(o.fx, o.fy, o.fz); o.m.visible = vis; o.m.rotation.y = t * 2.2;
        if (s === 0 && Math.random() < 0.06) fx.particles.emit(o.x + rand(-0.5, 0.5), rand(0.6, 1.8), o.z + rand(-0.5, 0.5), 0, 0.3, 0, { life: 0.8, size: 0.16, color: CH_COLORS[o.k.c] });
      });
      // uitgangen
      lv.exits.forEach((e, i) => {
        const occ = st.p[0] === e.ci ? 0 : st.p[1] === e.ci ? 1 : -1;
        e.glyph.rotation.z = t * 0.8 * (i ? -1 : 1);
        const k = occ >= 0 ? 1 : 0.55 + Math.sin(t * 3 + i) * 0.15;
        e.glyph.material.opacity = 1; e.glyph.material.color.setHex(occ >= 0 ? 0x9affc0 : 0xffe9a0); e.col.material.opacity = occ >= 0 ? 0.3 : 0.12 + Math.sin(t * 3 + i) * 0.03;
        e.col.material.color.setHex(occ >= 0 ? 0x7affa0 : 0xffe9a0); e.lab.quaternion.copy(camera.quaternion); e.lab.position.y = 3.5 + Math.sin(t * 2 + i) * 0.1;
        if (occ !== e.occ) { if (occ >= 0) { audio.sfx('ding', { vol: 0.5, rate: 1 + i * 0.2 }); fx.particles.burst(e.x, 0.6, e.z, { count: 10, speed: 2.5, colors: [0x7affa0, 0xffffff], size: 0.22, life: 0.7 }); } e.occ = occ; }
        if (Math.random() < 0.25) fx.particles.emit(e.x + rand(-0.6, 0.6), 0.1, e.z + rand(-0.6, 0.6), 0, rand(1.2, 2.4), 0, { life: 1.0, size: 0.2, color: occ >= 0 ? 0x7affa0 : 0xffe9a0 });
      });
      // lichtstralen
      let bi = 0;
      for (const sg of d.beam) {
        if (bi >= beamPool.length) break;
        const [x0, z0] = lv.cxz(sg.from), [x1, z1] = lv.cxz(sg.to);
        let ex = x1, ez = z1; if (sg.end) { ex = x0 + (x1 - x0) * 0.5; ez = z0 + (z1 - z0) * 0.5; }
        const len = Math.hypot(ex - x0, ez - z0); const gr = beamPool[bi++];
        if (gr.parent !== lv.g) lv.g.add(gr);
        gr.visible = true; gr.position.set((x0 + ex) / 2, 1.45, (z0 + ez) / 2); gr.rotation.set(0, Math.atan2(ex - x0, ez - z0), 0);
        gr.children[0].scale.set(0.07 * (0.9 + Math.sin(t * 30 + bi) * 0.1), len, 0.07 * (0.9 + Math.sin(t * 30 + bi) * 0.1)); gr.children[1].scale.set(0.22, len, 0.22);
        if (sg.end && Math.random() < 0.3) fx.particles.emit(ex, 1.45, ez, rand(-1, 1), rand(0, 1.5), rand(-1, 1), { life: 0.4, size: 0.16, color: 0xbff4ff });
      }
      for (let k = bi; k < beamPool.length; k++) beamPool[k].visible = false;
      // lava bubbels
      if (lv.lavaCells.length && Math.random() < 0.5) { const c = lv.lavaCells[(Math.random() * lv.lavaCells.length) | 0]; const [x, z] = lv.cxz(c); fx.particles.emit(x + rand(-0.8, 0.8), -0.2, z + rand(-0.8, 0.8), rand(-0.2, 0.2), rand(1, 2.4), rand(-0.2, 0.2), { life: rand(0.6, 1.1), size: rand(0.15, 0.3), color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: 2 }); }
      // A-knop prompts
      for (const pm of lv.prompts) {
        const pi = pm.userData.pi; const pc = lv.st.p[pi]; let adj = false;
        for (let k = 0; k < 4; k++) if (nbr(L, pc, k) === pm.userData.cell) adj = true;
        const want = adj && state === 'play'; pm.visible = want; if (want) { pm.quaternion.copy(camera.quaternion); pm.position.y = 2.9 + Math.sin(t * 5 + pi) * 0.1; }
      }
    }
    lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;

    const noseT = { v: 0 };
    function ambient(dt) {
      t += dt;
      lavaTex.offset.set(t * 0.03, t * 0.02);
      dragon.update(t, dt);
      dragon.group.position.z = damp(dragon.group.position.z, dragonTargetZ, 2, dt);
      dragonLight.position.set(0, 6, dragon.group.position.z + 2);
      // snurken: Zzz + rook uit de neusgaten + laag geluid
      snoreT -= dt;
      if (snoreT <= 0 && dragon.wake <= 0) {
        snoreT = 3.4 + Math.random() * 1.2;
        const gp = dragon.group.position; fx.texts.add('Zzz...', gp.x + 0.3, 5.6, gp.z + 7.2, '#bfa8ff', 1.1);
        audio.tone && audio.tone(70, 0.9, { type: 'sine', vol: 0.05, slide: -18 });
      }
      noseT.v -= dt;
      if (noseT.v <= 0) { noseT.v = 0.12; const gp = dragon.group.position; const br = Math.sin(t * 1.25); if (br > 0.2) for (const sx of [-0.17, 0.17]) fx.particles.emit(gp.x + sx * 2.6, 2.1, gp.z + 7.9, rand(-0.15, 0.15), rand(0.4, 0.9), rand(0.3, 0.8), { life: rand(1.2, 2), size: rand(0.25, 0.45), color: 0x8a86a8, gravity: -0.2, shrink: false }); }
      // glimmer in de schat, zwevende grotstof
      if (Math.random() < 0.12) fx.particles.emit((Math.random() < 0.5 ? -1 : 1) * rand(7.5, 12), rand(0.8, 2.2), dragon.group.position.z + rand(-3, 1), 0, rand(0.1, 0.4), 0, { life: 0.5, size: rand(0.18, 0.34), color: 0xfff0a0 });
      if (Math.random() < 0.2) fx.particles.emit(rand(-16, 16), rand(0.5, 6), rand(-14, 10), rand(-0.1, 0.1), rand(0.05, 0.2), rand(-0.1, 0.1), { life: rand(3, 6), size: rand(0.1, 0.2), color: [0xb89aff, 0x8fe8ff, 0xffffff][(Math.random() * 3) | 0], shrink: false });
      crystalLights.forEach((l, i) => { l.intensity = 1.0 + Math.sin(t * 1.3 + i * 2) * 0.25; });
      if (lvl && lvl.lavaPos) lavaLight.intensity = 1.5 + Math.sin(t * 3) * 0.3 + Math.random() * 0.1;
    }

    // ------------------------------------------------------------------ hoofdlus
    startLevel(0, true);

    function update(dt) {
      if (!started) { started = true; elapsed = 0; }
      ambient(dt);
      if (!finished) {
        elapsed += dt; hud.setTimer(elapsed, -1);
        if (elapsed > SOFT_CAP) endGame(true);
      }
      stateT += dt;
      if (state === 'play' && !finished) handleInput(dt);
      else if (state === 'clear') { if (stateT > 2.1 && !finished) nextLevel(); }
      else if (state === 'slide') {
        const k = clamp(stateT / 1.2, 0, 1), e = k * k * (3 - 2 * k);
        lvl.g.position.x = 40 * (1 - e); if (prev) prev.g.position.x = -40 * e;
        if (k >= 1) {
          lvl.g.position.x = 0; if (prev) { scene.remove(prev.g); prev.g.traverse((o) => { if (o.geometry && ![gBox, gCyl, gSph, ringGeo, labelGeo, badgeGeo].includes(o.geometry)) o.geometry.dispose(); }); prev = null; }
          state = 'play'; stateT = 0; hud.setHint(hintFor(lvl)); lvl.tStart = t;
        }
      }
      visuals(lvl, dt); if (prev) visuals(prev, dt);
      updateCamera(dt);
    }

    return {
      update,
      introUpdate(dt) { ambient(dt); visuals(lvl, dt); updateCamera(dt); },
      resultUpdate(dt) { ambient(dt); visuals(lvl, dt); updateCamera(dt); },
      onStart() { hud.setTimer(0, -1); hud.setHint(hintFor(lvl)); updateHud(); hud.toast(`Level 1: ${lvl.L.name}`, 2000); },
      onCountdown() { hud.setTimer(0, -1); updateHud(); },
      onResize() { if (lvl) fitCamera(lvl.L, false); },
      dispose() {},
      _dbg: { cam: (px, py, pz, lx, ly, lz) => { camPos.set(px, py, pz); camLook.set(lx, ly, lz); camera.position.copy(camPos); camTarget.copy(camLook); camera.lookAt(camLook); }, get lvl() { return lvl; }, get state() { return state; }, get done() { return doneCount; }, act: (w, a) => doAction(w, a), get elapsed() { return elapsed; }, goto: (i) => { if (prev) { scene.remove(prev.g); prev = null; } if (lvl) scene.remove(lvl.g); startLevel(i, true); state = 'play'; stateT = 0; } },
    };
  },
};

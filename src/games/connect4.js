import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, randInt, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { Animal, makeDeurman } from '../engine/chars.js';
import { Board, autoPick } from './connect4_logic.js';
import { buildBoard, buildHall, coinFaceTex, CELL, BOARD_CY, cx, ry, TOP_Y, COL_HEX } from './connect4_world.js';

// Vier op een Rij: Drakenmunten — beurtgebaseerd denk-duel in de schatkamer van een draak.
//  * links/rechts = kolom, A = munt laten vallen, omhoog/omlaag = kies je kracht, B = kracht aan/uit (dan A om te gebruiken)
//  * krachten (1 per ronde): BOM (ruimt 8 buurvakken), DUBBEL (twee zetten), DRAAI (bord 180 graden), DIEF (jat een munt)
//  * best-of-3 ronden binnen 90 s totaal; daarna speelt de autopilot de ronde af; gelijkspel -> sudden death op een mini-bord
//  * gimmicks: gouden tovervakken (extra zet), een kip die een munt steelt, de Deurman die een kolom sluit

const TOTAL_T = 90, TURN_T = 8, SD_TURN_T = 5, HARD_MAX = 230;
const WIN_ROUNDS = 2, MAX_ROUNDS = 3;
const DROP_Y = TOP_Y + 1.0, CUR_Y = TOP_Y + 1.2;
const CAP = 76;
const POWERS = [
  { id: 'bom', name: 'BOM', col: '#ff8a3a' },
  { id: 'dubbel', name: 'DUBBEL', col: '#ffd23f' },
  { id: 'draai', name: 'DRAAI', col: '#6fd8ff' },
  { id: 'dief', name: 'DIEF', col: '#d98aff' },
];
const COIN_COL = [0x35c46f, 0x4a8cff, 0x6a6678];

// ---- iconen (vector, geen emoji nodig) ----
function drawIcon(g, id, x, y, s, col) {
  g.save(); g.translate(x, y); g.lineCap = 'round'; g.lineJoin = 'round';
  if (id === 'bom') {
    g.fillStyle = '#23202c'; g.beginPath(); g.arc(0, 4, s * 0.36, 0, TAU); g.fill();
    g.strokeStyle = '#d8c8a0'; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(s * 0.18, -s * 0.22); g.quadraticCurveTo(s * 0.34, -s * 0.46, s * 0.1, -s * 0.5); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? s * 0.07 : s * 0.16; g.lineTo(s * 0.1 + Math.cos(a) * r, -s * 0.52 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(-s * 0.12, -s * 0.06, s * 0.08, 0, TAU); g.fill();
  } else if (id === 'dubbel') {
    g.fillStyle = col; g.beginPath(); g.arc(-s * 0.14, 0, s * 0.3, 0, TAU); g.fill(); g.beginPath(); g.arc(s * 0.14, 0, s * 0.3, 0, TAU); g.fillStyle = '#ffe680'; g.fill();
    g.strokeStyle = '#7a5a10'; g.lineWidth = s * 0.05; g.stroke();
    g.fillStyle = '#4a3200'; g.font = `bold ${s * 0.36}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x2', s * 0.14, 2);
  } else if (id === 'draai') {
    g.strokeStyle = col; g.lineWidth = s * 0.12;
    for (const k of [0, 1]) { g.save(); g.rotate(k * Math.PI); g.beginPath(); g.arc(0, 0, s * 0.34, -0.3, Math.PI * 0.85); g.stroke(); g.fillStyle = col; g.beginPath(); g.moveTo(Math.cos(Math.PI * 0.85) * s * 0.34 - s * 0.2, Math.sin(Math.PI * 0.85) * s * 0.34 - s * 0.02); g.lineTo(Math.cos(Math.PI * 0.85) * s * 0.34 + s * 0.12, Math.sin(Math.PI * 0.85) * s * 0.34 + s * 0.16); g.lineTo(Math.cos(Math.PI * 0.85) * s * 0.34 + s * 0.2, Math.sin(Math.PI * 0.85) * s * 0.34 - s * 0.14); g.closePath(); g.fill(); g.restore(); }
  } else if (id === 'dief') {
    g.fillStyle = col; g.strokeStyle = '#3a1a5a'; g.lineWidth = s * 0.05;
    g.beginPath(); g.roundRect(-s * 0.24, -s * 0.04, s * 0.48, s * 0.42, s * 0.1); g.fill(); g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(-s * 0.24 + i * s * 0.12, -s * 0.46 + (i % 3 === 1 ? 0 : s * 0.06), s * 0.1, s * 0.46, s * 0.05); g.fill(); g.stroke(); }
    g.beginPath(); g.roundRect(-s * 0.4, s * 0.02, s * 0.2, s * 0.12, s * 0.05); g.fill(); g.stroke();
  }
  g.restore();
}
function iconTex(id, col) { return canvasTex(128, 128, (g) => { drawIcon(g, id, 64, 66, 118, col); }); }

export default {
  id: 'connect4',
  name: 'Vier op een Rij: Drakenmunten',
  giver: 'Draak Duizendgoud',
  icon: '🐉',
  mode: 'pvp',
  time: 90,
  music: 'game_minor',
  blurb: 'Vier op een rij in de schatkamer van een <b>draak</b>! Laat om en om munten vallen: wie eerst <b>vier op een rij</b> heeft wint de ronde (best-of-3, samen 90 s). Elke ronde heb je <b>één kracht</b>: bom, dubbele zet, bord draaien of een munt jatten. Pas op voor de <b>kip</b> en de <b>Deurman</b>!',
  controls: ['{move} kolom kiezen (omhoog/omlaag: kracht)', '{a} munt laten vallen', '{b} kracht aan, dan {a} gebruiken'],
  tip: 'Je beurt duurt 8 seconden, daarna valt je munt zomaar! Een gouden vak geeft een extra zet.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tid = ctx.twist.id;
    const GRAV = pv.gravity || 1, SLIP = pv.slip || 0;
    const tempo = tid === 'turbo' ? 1.25 : tid === 'slowmo' ? 0.8 : 1;
    const G = 46 * GRAV * tempo * tempo;
    const tscale = (i) => Math.pow(pv.speed(i) || 1, 0.8);

    const L = ctx.lights('indoor', { shadow: 16, center: [0, 3, 0], fogNear: 34, fogFar: 95 });
    L.hemi.intensity = 1.0; L.hemi.color.set(0xd8c8ff); L.hemi.groundColor.set(0x5a3a6a);
    L.sun.color.set(0xffe0c0); L.sun.intensity = 1.5; L.sun.position.set(-8, 22, 18);
    camera.fov = 48; camera.updateProjectionMatrix();
    const Hl = buildHall(ctx);
    const B = buildBoard(scene);

    // ---------------- munten (1 InstancedMesh) ----------------
    const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.26, 26); coinGeo.rotateX(Math.PI / 2);
    const sideM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 });
    const capM = new THREE.MeshStandardMaterial({ color: 0xffffff, map: coinFaceTex(), roughness: 0.35, metalness: 0.3 });
    const coins = new THREE.InstancedMesh(coinGeo, [sideM, capM, capM], CAP);
    coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage); coins.frustumCulled = false; coins.castShadow = false;
    const tmpC = new THREE.Color(), zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CAP; i++) { coins.setMatrixAt(i, zeroM); coins.setColorAt(i, tmpC.set(0xffffff)); }
    scene.add(coins);
    const free = []; for (let i = CAP - 1; i >= 1; i--) free.push(i);          // slot 0 = de zwevende cursor-munt
    const visById = new Map(); let stones = []; const loose = [];             // loose: losse munten (stukgeschoten, gestolen)
    function makeVis(ci, x, y, z = 0) {
      const slot = free.pop(); if (slot === undefined) return null;
      coins.setColorAt(slot, tmpC.set(COIN_COL[ci]));
      return { slot, ci, x, y, z, rot: 0, rx: 0, ry: 0, sc: 1, vx: 0, vy: 0, vz: 0, spin: 0, ty: y, mode: 'rest', landed: false, silent: false, onBoard: true, flash: 0, t: 0, lift: 0 };
    }
    function killVis(v) { if (!v || v.dead) return; v.dead = true; coins.setMatrixAt(v.slot, zeroM); free.push(v.slot); }
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
    let bRot = 0;
    function writeVis(v) {
      if (v.dead) return;
      let x = v.x, y = v.y + v.lift, rot = v.rot;
      if (v.onBoard && bRot !== 0) { const dx = x, dy = y - BOARD_CY, c = Math.cos(bRot), s = Math.sin(bRot); x = dx * c - dy * s; y = BOARD_CY + dx * s + dy * c; rot += bRot; }
      _q.setFromEuler(_e.set(v.rx, v.ry, rot)); _p.set(x, y, v.z); _s.setScalar(v.sc); _m.compose(_p, _q, _s); coins.setMatrixAt(v.slot, _m);
    }
    function stepVis(v, dt) {
      if (v.dead) return;
      if (v.mode === 'fall') {
        v.vy -= G * dt; v.y += v.vy * dt;
        if (v.y <= v.ty) {
          v.y = v.ty;
          if (v.vy < -4.5) { v.vy = -v.vy * 0.3; if (!v.landed) { v.landed = true; landFx(v); } else if (!v.silent) audio.sfx('click2', { vol: 0.5, rate: 0.7 }); }
          else { v.vy = 0; v.mode = 'rest'; if (!v.landed) { v.landed = true; landFx(v); } }
        }
      } else if (v.mode === 'burst') {
        v.vy -= 34 * dt; v.x += v.vx * dt; v.y += v.vy * dt; v.z += v.vz * dt; v.rot += v.spin * dt; v.rx += v.spin * 0.6 * dt; v.t += dt;
        if (v.y < 0.3 || v.t > 2.2) { fx.particles.burst(v.x, Math.max(0.3, v.y), v.z, { count: 5, speed: 2, up: 1, life: 0.4, size: 0.25, color: 0xffd23f, gravity: 6 }); killVis(v); }
      }
    }
    function landFx(v) {
      audio.sfx('wood', { vol: 0.7, rate: 1.5 + Math.random() * 0.3 });
      if (v.silent) return;
      fx.particles.burst(v.x, v.y - 0.3, 0.6, { count: 6, speed: 1.6, up: 0.6, life: 0.4, size: 0.22, color: 0xffe08a, gravity: 6 });
      if (drop && drop.vis === v) { drop.landed = true; ctx.shake(0.12); }
    }
    function fallTo(v, row, silent = true) { v.ty = ry(row); if (v.y > v.ty + 0.01) { v.mode = 'fall'; v.vy = 0; v.landed = false; v.silent = silent; } else v.mode = 'rest'; }

    // ---------------- bord, bom, deur, kip, Deurman ----------------
    const bombMesh = new THREE.Group(); bombMesh.visible = false; scene.add(bombMesh);
    bombMesh.add(mesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0x23202c, roughness: 0.3, metalness: 0.5 }), { cast: false }));
    bombMesh.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 6), mat(0xd8c8a0), { cast: false, pos: [0, 0.52, 0] }));
    const glowT = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffb030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spark.scale.set(1.1, 1.1, 1); spark.position.set(0, 0.7, 0); bombMesh.add(spark);
    const bombV = { x: 0, y: 0, vy: 0, ty: 0, mode: 'rest', landed: false, silent: false, dead: false, slot: -1 };

    const doorTex = canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = '#4a3020'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#5a3c28' : '#4a3020'; g.fillRect(i * 32, 0, 30, h); }
      g.fillStyle = '#d8b040'; for (const y of [60, 440]) g.fillRect(0, y, w, 24);
      g.strokeStyle = '#d8372c'; g.lineWidth = 12; g.beginPath(); g.moveTo(20, 150); g.lineTo(108, 360); g.moveTo(108, 150); g.lineTo(20, 360); g.stroke();
      g.fillStyle = '#e8c24a'; g.beginPath(); g.arc(64, 256, 26, 0, TAU); g.fill(); g.fillStyle = '#2a1a10'; g.fillRect(58, 250, 12, 22);
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, ROWS_H(), 0.18), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.9, transparent: true, opacity: 0.9 })); door.visible = false; scene.add(door);
    function ROWS_H() { return 6 * CELL + 0.2; }
    let doorY = TOP_Y + 6, doorTarget = TOP_Y + 6;
    const chicken = new Animal('chicken'); chicken.group.scale.setScalar(2.4); chicken.group.visible = false; scene.add(chicken.group);
    const deurman = makeDeurman(1.1); deurman.group.visible = false; scene.add(deurman.group);

    // ---------------- spelers: poppetjes, naamlabels, krachtpaneel ----------------
    const chars = [], tags = [], panels = [], panelCtx = [], panelTex = [], arrows = [];
    const SIDE_X = 6.9;
    players.forEach((pp, i) => {
      const c = ctx.make.brother(i); const k = 1.9 * pv.size(i); c.group.scale.setScalar(k);
      const holder = new THREE.Group(); holder.add(c.group); holder.position.set((i ? 1 : -1) * SIDE_X, 0.55, 0.6); scene.add(holder);
      c.faceDir((i ? -1 : 1) * 0.75, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      scene.add(mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x6a5a98, roughness: 0.8, flatShading: true }), { cast: false, pos: [(i ? 1 : -1) * SIDE_X, 0.27, 0.6] }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: COL_HEX[i] })); ring.rotation.x = Math.PI / 2; ring.position.set((i ? 1 : -1) * SIDE_X, 0.6, 0.6); scene.add(ring);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.8, 1.05, 1); tag.renderOrder = 15; scene.add(tag);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 4), new THREE.MeshBasicMaterial({ color: COL_HEX[i] })); cone.rotation.x = Math.PI; scene.add(cone);
      // krachtpaneel
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 150; const pc = cv.getContext('2d');
      const pt = new THREE.CanvasTexture(cv); pt.colorSpace = THREE.SRGBColorSpace;
      const pn = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.11), new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthTest: false })); pn.renderOrder = 14; pn.position.set((i ? 1 : -1) * SIDE_X, 5.8, 1.2); scene.add(pn);
      chars.push({ c, holder, k, tag, cone, ring }); panels.push(pn); panelCtx.push(pc); panelTex.push(pt);
    });
    const icons = POWERS.map((p) => iconTex(p.id, p.col));
    const armIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: icons[0], transparent: true, depthTest: false })); armIcon.scale.set(1.3, 1.3, 1); armIcon.renderOrder = 16; armIcon.visible = false; scene.add(armIcon);
    const beamM = new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const winBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), beamM); winBeam.visible = false; scene.add(winBeam);

    // ---------------- toestand ----------------
    const score = [0, 0];
    let T = 0, st = 0, hardT = 0, state = 'intro', started = false, finished = false, introT = 0;
    let board = new Board(), turn = 0, extra = 0, round = 0, roundsPlayed = 0, clock = TOTAL_T, auto = false, sd = false, sdTries = 0, starter = 0;
    let timer = TURN_T, timerMax = TURN_T, autoT = 0.4, drop = null, ev = null, evT = 14, evAlt = Math.random() < 0.5, closed = null, pendingDeur = null;
    let col = 3, curX = cx(3), curV = 0, doubleFlag = false, lastWinner = -1;
    const lastCol = [3, 3], hold = [{ d: 0, n: 0 }, { d: 0, n: 0 }], vHold = [0, 0], react = [{ t: 0, pose: 'idle' }, { t: 0, pose: 'idle' }], pj = [{}, {}];
    const uses = [1, 1], used = [new Set(), new Set()], sel = [0, 0], armed = [null, null];
    let magic = []; let winCoins = [], winRun = null, camPunch = 0, thinkT = [2, 3.5], intro = true;
    const stats = { drops: 0, bombs: 0, flips: 0, steals: 0, doubles: 0, magic: 0, chickens: 0, doors: 0, timeouts: 0, autos: 0, rounds: [], sd: false, kipRuns: 0 };
    let panelDirty = true, turnNo = 0;

    // ---------------- hulpfuncties ----------------
    const isOpen = (c) => board.canDrop(c) && !(closed && closed.col === c);
    const say = (txt, x, y, z, color = '#ffe14a', s = 1.4) => fx.texts.add(txt, x, y, z, color, s);
    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${sd ? '  ·  SUDDEN DEATH' : ''}`);
      for (let i = 0; i < 2; i++) {
        const w = score[i];
        const kr = sd ? 'geen krachten' : uses[i] > 0 ? `kracht: ${POWERS[sel[i]].name}${armed[i] ? ' (klaar!)' : ''}${uses[i] > 1 ? ' x2' : ''}` : 'kracht gebruikt';
        hud.setPlayerInfo(i, `${'⭐'.repeat(w)}${w ? ' · ' : ''}${kr}`);
      }
    }
    function drawPanel(i) {
      const g = panelCtx[i]; g.clearRect(0, 0, 512, 150);
      g.fillStyle = 'rgba(14,8,34,.82)'; g.beginPath(); g.roundRect(4, 4, 504, 142, 22); g.fill();
      g.lineWidth = 6; g.strokeStyle = players[i].css; g.stroke();
      POWERS.forEach((p, k) => {
        const x = 70 + k * 124, isUsed = used[i].has(p.id) || sd || uses[i] <= 0, isSel = sel[i] === k && !isUsed;
        if (isSel) { g.fillStyle = armed[i] ? 'rgba(255,230,120,.5)' : 'rgba(255,255,255,.2)'; g.beginPath(); g.roundRect(x - 54, 14, 108, 122, 16); g.fill(); g.lineWidth = armed[i] ? 7 : 4; g.strokeStyle = armed[i] ? '#ffe680' : players[i].css; g.stroke(); }
        g.globalAlpha = isUsed ? 0.25 : 1; drawIcon(g, p.id, x, 62, 86, p.col); g.globalAlpha = 1;
        g.font = 'bold 20px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.fillStyle = isUsed ? '#777' : '#fff'; g.fillText(p.name, x, 130);
      });
      panelTex[i].needsUpdate = true;
    }
    function setupMagic() {
      magic = [];
      if (sd) return;
      const rM = randInt(1, 4), c = randInt(0, 2), r = randInt(0, 4);
      magic.push([3, rM], [c, r], [6 - c, r]);
    }
    const isMagic = (c, r) => magic.findIndex((m) => m[0] === c && m[1] === r);
    function setGlow(p) {
      const hex = COL_HEX[p]; B.edgeMat.color.setHex(hex); B.orbMat.color.setHex(hex); B.beam.material.color.setHex(hex); B.timerMat.color.setHex(hex);
      B.lamps.forEach((l) => l.material.color.setHex(hex));
    }
    function react1(i, pose, secs) { if (react[i].t <= 0) pj[i] = {}; react[i].pose = pose; react[i].t = secs; }
    function nextSel(p, dir) {
      const n = POWERS.length;
      for (let k = 1; k <= n; k++) { const j = ((sel[p] + dir * k) % n + n) % n; if (!used[p].has(POWERS[j].id)) return j; }
      return sel[p];
    }
    function levelBoard() { for (const v of visById.values()) killVis(v); visById.clear(); for (const v of stones) killVis(v); stones = []; for (const v of loose) killVis(v); loose.length = 0; }

    // ---------------- ronde-flow ----------------
    function startRound(first) {
      levelBoard(); closed = null; door.visible = false; doorY = doorTarget = TOP_Y + 6; ev = null; drop = null; extra = 0; doubleFlag = false; winCoins = []; winRun = null; winBeam.visible = false; bRot = 0; B.plate.rotation.z = 0;
      pendingDeur = null; evT = rand(11, 16);
      board = sd ? new Board(7, 6, 3, 1, 5, 4) : new Board();
      if (sd) {   // stenen buiten het mini-bord
        for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) if (board.cap[c] === 0 || r >= 4) { const v = makeVis(2, cx(c), ry(r)); if (v) { v.sc = 0.92; stones.push(v); } }
      }
      round++; turn = starter = first; col = lastCol[turn] = 3; curX = cx(3);
      for (let i = 0; i < 2; i++) {
        used[i].clear(); armed[i] = null; uses[i] = sd ? 0 : 1 + (score[1 - i] > score[i] ? 1 : 0);
        sel[i] = 0;
      }
      setupMagic(); panelDirty = true; refreshHud();
      const title = sd ? 'SUDDEN DEATH!' : `RONDE ${round}`;
      hud.showBig(title, 1500, sd ? '#ff6a4a' : '#ffe14a');
      hud.toast(sd ? `3 op een rij op een mini-bord. Muntworp: ${names[first]} begint!` : `${names[first]} mag beginnen${uses[0] + uses[1] > 2 ? ' (de achterblijver krijgt een extra kracht!)' : ''}`, 2200);
      audio.sfx(sd ? 'explode' : 'bell', { vol: 0.5 }); st = 0; state = 'toss'; setGlow(turn);
    }
    function beginTurn() {
      state = 'turn'; st = 0; turnNo++;
      timerMax = timer = (sd ? SD_TURN_T : TURN_T) / tscale(turn);
      autoT = 0.4; hold[0].d = hold[1].d = 0; vHold[0] = vHold[1] = 0; armed[turn] = null; armed[1 - turn] = null;
      col = lastCol[turn]; if (!board.legal().includes(col)) col = board.legal()[0] ?? 3;
      if (sel[turn] >= 0 && used[turn].has(POWERS[sel[turn]].id)) sel[turn] = nextSel(turn, 1);
      setGlow(turn); panelDirty = true; refreshHud();
      react1(turn, 'idle', 0); react1(1 - turn, 'idle', 0); curV = 0;
    }
    function nextTurn() {
      if (extra > 0) { extra--; say('NOG EEN ZET!', cx(col), TOP_Y + 2.2, 1, '#ffd23f', 1.5); }
      else turn = 1 - turn;
      if (closed && --closed.turns <= 0) { closed = null; doorTarget = TOP_Y + 6; audio.sfx('door', { vol: 0.5 }); }
      beginTurn();
    }
    function roundWin(w, lines) {
      state = 'win'; st = 0; stats.rounds.push(w);
      if (sd) { /* de score blijft gelijk; sd-winnaar wordt in finishRound bepaald */ lastWinner = w; } else { score[w]++; lastWinner = w; }
      const set = new Map(); for (const run of lines) for (const k of run) set.set(k.id, k);
      winCoins = [...set.values()].map((k) => ({ k, v: visById.get(k.id) })).filter((o) => o.v);
      winRun = lines.reduce((a, b) => (b.length > a.length ? b : a), lines[0]);
      const a = winRun[0], b = winRun[winRun.length - 1], x1 = cx(a.c), y1 = ry(a.r), x2 = cx(b.c), y2 = ry(b.r);
      const len = Math.hypot(x2 - x1, y2 - y1) + CELL * 0.9;
      winBeam.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.7); winBeam.rotation.z = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2; winBeam.scale.set(1, len, 1); winBeam.visible = true;
      beamM.color.setHex(COL_HEX[w] === 0x35c46f ? 0xbfffd0 : 0xbfd8ff);
      hud.showBig(sd ? `${names[w]} wint!` : `${names[w]} wint ronde ${round}!`, 2300, players[w].css);
      audio.sfx('win', { vol: 0.8 }); audio.sfx('bell', { vol: 0.6 }); ctx.shake(0.7); camPunch = 1; Hl.cheer(3);
      react1(w, 'cheer', 3); react1(1 - w, 'sad', 3);
      const cc = [COL_HEX[w], 0xffe14a, 0xffffff, 0xff6fa5];
      for (let i = 0; i < 4; i++) setTimeout(() => { if (!finished && state === 'win') fx.particles.burst(rand(-4, 4), TOP_Y + 1, 1.5, { count: 44, speed: 8, up: 1.4, life: 1.4, size: 0.5, colors: cc, gravity: 7 }); }, i * 380);
      refreshHud(); panelDirty = true;
    }
    function roundDraw() {
      state = 'win'; st = 0; lastWinner = -1; stats.rounds.push(-1);
      hud.showBig('VOL BORD! GELIJKSPEL', 2000, '#ffd23f'); audio.sfx('good'); Hl.cheer(1.5); react1(0, 'scared', 1.4); react1(1, 'scared', 1.4);
      say('Geen vier op een rij...', 0, TOP_Y * 0.55, 1, '#fff', 1.5);
    }
    function finishRound() {
      roundsPlayed++;
      if (sd) {
        if (lastWinner >= 0) return endMatch(lastWinner);
        if (++sdTries >= 3) return endMatch(Math.random() < 0.5 ? 0 : 1, 'De kip heeft beslist!');
        levelBoardAnim(); state = 'clear'; st = 0; return;
      }
      if (score[0] >= WIN_ROUNDS || score[1] >= WIN_ROUNDS) return endMatch(score[0] > score[1] ? 0 : 1);
      if (clock <= 0 || roundsPlayed >= MAX_ROUNDS) {
        if (score[0] !== score[1]) return endMatch(score[0] > score[1] ? 0 : 1);
        sd = true; stats.sd = true; levelBoardAnim(); state = 'clear'; st = 0; return;
      }
      levelBoardAnim(); state = 'clear'; st = 0;
    }
    function levelBoardAnim() {
      for (const v of visById.values()) { v.mode = 'burst'; v.vx = rand(-3, 3); v.vy = rand(-2, 2); v.vz = rand(1, 4); v.spin = rand(-8, 8); v.z = 0.7; v.onBoard = true; loose.push(v); }
      visById.clear(); winBeam.visible = false; winCoins = []; audio.sfx('scrape', { vol: 0.5 }); audio.sfx('thud', { vol: 0.5 });
    }
    function endMatch(w, note = '') {
      if (finished) return; finished = true; state = 'end'; st = 0; if (stats.sd) score[w]++;
      hud.setTimer(null); hud.setHint(null); winBeam.visible = false;
      react1(w, 'cheer', 99); react1(1 - w, 'sad', 99); Hl.cheer(6);
      const L2 = [`${names[w]} is de nieuwe Drakenmeester! ${names[1 - w]} moet de goudberg afstoffen.`, `De draak knikt goedkeurend naar ${names[w]}. ${names[1 - w]} krijgt een troostmunt.`, `${names[w]} dacht drie zetten vooruit. ${names[1 - w]} dacht aan taart.`, `De kip is onder de indruk van ${names[w]}.`];
      const bits = [];
      if (stats.bombs) bits.push(`${stats.bombs} bom${stats.bombs > 1 ? 'men' : ''}`);
      if (stats.flips) bits.push('het bord werd omgedraaid');
      if (stats.steals) bits.push(`${stats.steals} muntendief${stats.steals > 1 ? 'stallen' : 'stal'}`);
      if (stats.chickens) bits.push('de kip stal een munt');
      if (stats.doors) bits.push('de Deurman sloot een kolom');
      ctx.finishPvp({ winner: w, score: [score[0], score[1]], delay: 900, summary: `${pick(L2)}${note ? ' ' + note : ''}${stats.sd ? ' (Beslist in een sudden death.)' : ''}${bits.length ? ` Onderweg: ${bits.join(', ')}.` : ''}` });
    }

    // ---------------- zetten ----------------
    function reject(txt) { audio.sfx('buzz', { vol: 0.5 }); ctx.shake(0.1); if (txt) say(txt, cx(col), TOP_Y + 2.2, 1, '#ff8a7a', 1.1); react1(turn, 'idle', 0); }
    function consume(p, id) { uses[p]--; used[p].add(id); armed[p] = null; if (used[p].has(POWERS[sel[p]].id)) sel[p] = nextSel(p, 1); panelDirty = true; refreshHud(); }
    function doDrop(c, opts = {}) {
      if (!isOpen(c)) { reject(closed && closed.col === c ? 'Dicht! De Deurman staat in de weg' : 'Kolom vol!'); return false; }
      const coin = board.drop(c, turn); stats.drops++;
      const v = makeVis(turn, cx(c), DROP_Y); if (!v) return false;
      v.mode = 'fall'; v.ty = ry(coin.r); v.vy = -3; visById.set(coin.id, v); v.rot = rand(-0.4, 0.4);
      drop = { kind: 'coin', coin, vis: v, p: turn, landed: false, dbl: !!opts.dbl, c };
      lastCol[turn] = c; state = 'dropping'; st = 0; audio.sfx('pop', { vol: 0.5, rate: 1.2 });
      if (opts.dbl) { consume(turn, 'dubbel'); stats.doubles++; }
      return true;
    }
    function afterDrop() {
      const p = drop.p, coin = drop.coin; const mi = isMagic(coin.c, coin.r);
      if (mi >= 0) { magic.splice(mi, 1); extra++; stats.magic++; say('TOVERMUNT! EXTRA ZET', cx(coin.c), ry(coin.r) + 1, 1, '#ffd23f', 1.6); audio.sfx('sparkle'); audio.sfx('powerup', { vol: 0.5 }); fx.particles.burst(cx(coin.c), ry(coin.r), 0.7, { count: 30, speed: 5, up: 1, life: 1, size: 0.4, colors: [0xffd23f, 0xffffff, 0xffa020], gravity: 3 }); }
      if (drop.dbl) { extra++; say('DUBBELE ZET!', cx(coin.c), ry(coin.r) + 1, 1, '#ffe680', 1.6); }
      drop = null; resolve(p);
    }
    function resolve(p) {
      const lp = board.lines(p), lo = board.lines(1 - p);
      if (lp.length) return roundWin(p, lp);
      if (lo.length) return roundWin(1 - p, lo);
      if (board.full()) return roundDraw();
      // reacties: bijna vier-op-een-rij
      const b = board.best(p);
      if (b >= board.need - 1 && !(sd && b < 2)) { react1(p, 'cheer', 0.9); react1(1 - p, 'scared', 0.9); if (b >= 3 && !sd) say('Bijna vier!', cx(lastCol[p]), ry(Math.min(5, board.h(lastCol[p]))) + 0.6, 1, '#fff', 1.1); audio.sfx('ding', { vol: 0.4 }); }
      nextTurn();
    }
    function usePower(id, c) {
      if (id === 'dubbel') return doDrop(c, { dbl: true });
      if (id === 'bom') {
        if (!isOpen(c)) { reject('Daar kan de bom niet vallen'); return false; }
        consume(turn, 'bom'); stats.bombs++;
        bombV.x = cx(c); bombV.y = DROP_Y; bombV.vy = -3; bombV.ty = ry(board.h(c)); bombV.mode = 'fall'; bombV.landed = false; bombV.dead = false;
        bombMesh.visible = true; bombMesh.position.set(bombV.x, bombV.y, 0.1);
        drop = { kind: 'bomb', p: turn, c, vis: bombV, landed: false, phase: 'fall', t: 0 }; lastCol[turn] = c; state = 'dropping'; st = 0;
        audio.sfx('whoosh', { vol: 0.5 }); say('DRAKENBOM!', cx(c), TOP_Y + 2.4, 1, '#ff8a3a', 1.7); return true;
      }
      if (id === 'draai') {
        consume(turn, 'draai'); stats.flips++;
        ev = { kind: 'flip', t: 0, p: turn }; state = 'power'; st = 0; audio.sfx('whoosh', { vol: 0.7 }); audio.sfx('boing', { vol: 0.5, rate: 0.7 });
        say('DRAAI HET BORD!', 0, TOP_Y + 1.8, 1, '#6fd8ff', 1.8); return true;
      }
      if (id === 'dief') {
        const t = board.top(c);
        if (!t || t.o === turn) { reject(!t ? 'Geen munt om te jatten' : 'Dat is je eigen munt!'); return false; }
        consume(turn, 'dief'); stats.steals++;
        board.steal(c, turn); const v = visById.get(t.id); visById.delete(t.id); v.mode = 'fly'; v.t = 0; v.x0 = v.x; v.y0 = v.y;
        ev = { kind: 'steal', t: 0, p: turn, v, c }; state = 'power'; st = 0; loose.push(v);
        say('MUNTENDIEF!', cx(c), TOP_Y + 2.2, 1, '#d98aff', 1.7); audio.sfx('swing', { vol: 0.6 }); return true;
      }
      return false;
    }
    function act() {
      const c = (SLIP > 0.3) ? clamp(Math.round(curX / CELL + 3), 0, 6) : col;
      const a = armed[turn];
      if (a) usePower(a, c); else doDrop(c);
    }
    function autoDrop(why) {
      const c = why === 'auto' ? autoPick(board, turn, Math.random, isOpen) : (() => { const o = board.legal().filter(isOpen); return o.length ? o[Math.floor(Math.random() * o.length)] : -1; })();
      if (c < 0) { closed = null; doorTarget = TOP_Y + 6; const l = board.legal(); if (!l.length) { return roundDraw(); } return doDrop(l[0]); }
      col = c; if (why !== 'auto') { stats.timeouts++; say('TE LAAT!', cx(c), TOP_Y + 2.2, 1, '#ff8a7a', 1.5); audio.sfx('miss', { vol: 0.6 }); } else stats.autos++;
      armed[turn] = null; doDrop(c);
    }

    // ---------------- gimmicks: kip en Deurman ----------------
    function startEvent() {
      evAlt = !evAlt;
      if (evAlt) {
        const cols = []; for (let c = 0; c < 7; c++) if (board.top(c)) cols.push(c);
        if (cols.length < 3) { evT = 3; return; }
        // de kip pikt graag bij wie voorstaat
        const lead = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
        const pref = lead >= 0 ? cols.filter((c) => board.top(c).o === lead) : [];
        const c = pref.length && Math.random() < 0.6 ? pick(pref) : pick(cols);
        const top = board.top(c), side = Math.random() < 0.5 ? -1 : 1;
        ev = { kind: 'kip', t: 0, c, top, side, v: visById.get(top.id), got: false }; state = 'power'; st = 0; chicken.group.visible = true; stats.chickens++;
        hud.toast('🐔 KIP-ALARM! Een kip wil een munt!', 1800); audio.sfx('whoosh', { vol: 0.5 });
      } else {
        const opts = board.legal().filter((c) => board.h(c) < board.cap[c] - 1 || true);
        if (opts.length < 3) { evT = 3; return; }
        const c = Math.random() < 0.35 ? 3 : pick(opts);
        ev = { kind: 'deur', t: 0, c }; state = 'power'; st = 0; deurman.group.visible = true; deurman.group.position.set(cx(c), 0.05, 3.4); deurman.glitch = 0.8; stats.doors++;
        hud.toast('👁️ De Deurman sluit een kolom!', 1800); audio.sfx('creak', { vol: 0.5 });
      }
    }
    function powerUpdate(dt) {
      const e = ev; if (!e) { state = 'turn'; return; }
      e.t += dt;
      if (e.kind === 'kip') {
        const tv = e.v; const p0 = [e.side * 15, TOP_Y + 3, 3.4], p1 = [cx(e.c), (tv ? tv.y : ry(board.h(e.c) - 1)) - 0.2, 1.3], p2 = [-e.side * 16, TOP_Y + 4.5, 3.4];
        const g = chicken.group;
        if (e.t < 1.1) { const u = smoothstep(0, 1.1, e.t); g.position.set(lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u) + Math.sin(u * Math.PI) * 2.2, lerp(p0[2], p1[2], u)); g.rotation.set(0, e.side > 0 ? -1.2 : 1.2, Math.sin(e.t * 34) * 0.35); chicken.speed = 1; }
        else if (e.t < 1.7) { g.position.set(p1[0], p1[1] + Math.abs(Math.sin(e.t * 18)) * 0.25, p1[2]); g.rotation.set(0.5, 0, Math.sin(e.t * 22) * 0.2); chicken.speed = 0;
          if (e.t > 1.45 && !e.got) { e.got = true; board.steal(e.c, -1); visById.delete(e.top.id); if (tv) { tv.mode = 'fly'; loose.push(tv); } audio.sfx('pop', { vol: 0.7 }); say('PIK!', p1[0], p1[1] + 1.5, 1.5, '#fff', 1.5); fx.particles.burst(p1[0], p1[1], 1.2, { count: 16, speed: 4, up: 1.2, life: 0.9, size: 0.3, colors: [0xffffff, 0xf4e8d0], gravity: 3 }); ctx.shake(0.2); } }
        else { const u = smoothstep(1.7, 3.0, e.t); g.position.set(lerp(p1[0], p2[0], u), lerp(p1[1], p2[1], u) + Math.sin(u * Math.PI) * 2.2, lerp(p1[2], p2[2], u)); g.rotation.set(0, e.side > 0 ? 1.2 : -1.2, Math.sin(e.t * 34) * 0.35); chicken.speed = 1; }
        if (tv && e.got) { tv.x = g.position.x; tv.y = g.position.y - 0.4; tv.z = g.position.z + 0.4; tv.sc = 0.8; tv.onBoard = false; tv.rot += dt * 6; }
        if (Math.random() < dt * 14) fx.particles.emit(g.position.x, g.position.y, g.position.z, rand(-1, 1), rand(0, 1), rand(-1, 1), { life: 0.8, size: 0.22, color: 0xffffff, gravity: 2 });
        if (e.t > 3.05) { chicken.group.visible = false; if (tv) { killVis(tv); const k = loose.indexOf(tv); if (k >= 0) loose.splice(k, 1); } finishEvent(); }
      } else if (e.kind === 'deur') {
        const g = deurman.group;
        if (e.t < 0.9) { g.position.set(cx(e.c) + (1 - e.t / 0.9) * 2.5, 0.05, 3.4); deurman.speed = 1; g.visible = true; }
        else { deurman.speed = 0; }
        deurman.faceDir(0, 1); deurman.update(dt);
        if (e.t > 0.9 && !e.done) { e.done = true; closed = { col: e.c, turns: 3 }; door.visible = true; door.position.set(cx(e.c), doorY, 0.78); doorTarget = BOARD_CY; audio.sfx('slam', { vol: 0.5 }); say('DICHT!', cx(e.c), TOP_Y + 1.2, 1.5, '#ff6a4a', 1.7); ctx.shake(0.4); }
        if (e.t > 2.2) { deurman.group.visible = false; finishEvent(); }
      } else if (e.kind === 'flip') {
        const u = clamp(e.t / 1.15, 0, 1), s = u * u * (3 - 2 * u); bRot = s * Math.PI; B.plate.rotation.z = bRot;
        if (e.t >= 1.15 && !e.done) {
          e.done = true;
          for (const k of board.all()) { const v = visById.get(k.id); if (!v) continue; const dx = v.x, dy = v.y - BOARD_CY; v.x = -dx; v.y = BOARD_CY - dy; v.rot += Math.PI; }
          bRot = 0; B.plate.rotation.z = 0;
          magic = magic.map((m) => [6 - m[0], 5 - m[1]]);
          const moved = board.flip();
          for (const k of moved) { const v = visById.get(k.id); if (v) { v.x = cx(k.c); fallTo(v, k.r, false); } }
          for (const k of board.all()) { const v = visById.get(k.id); if (v) { v.x = cx(k.c); v.rot = 0; } }
          ctx.shake(0.5); audio.sfx('thud', { vol: 0.6 });
        }
        if (e.done && e.t > 2.0) { ev = null; resolve(e.p); }
      } else if (e.kind === 'steal') {
        const v = e.v, u = clamp(e.t / 0.8, 0, 1), th = chars[e.p].holder.position;
        v.x = lerp(v.x0, th.x, u); v.y = lerp(v.y0, th.y + 3.1, u) + Math.sin(u * Math.PI) * 2.5; v.z = lerp(0.2, 1.4, u); v.sc = 1 - u * 0.6; v.rot += dt * 10; v.onBoard = false;
        if (e.t >= 0.8) { killVis(v); const k = loose.indexOf(v); if (k >= 0) loose.splice(k, 1); audio.sfx('coin', { vol: 0.8 }); fx.particles.burst(th.x, th.y + 3, 1.4, { count: 18, speed: 3, up: 1, life: 0.8, size: 0.3, colors: [0xffd23f, 0xd98aff], gravity: 3 }); react1(e.p, 'cheer', 1.2); react1(1 - e.p, 'scared', 1.2); ev = null; nextTurn(); }
      }
      if (st > 8 && ev) { ev = null; chicken.group.visible = false; deurman.group.visible = false; state = 'turn'; }
    }
    function finishEvent() { ev = null; evT = rand(15, 22); state = 'turn'; }

    // ---------------- bom ----------------
    function bombUpdate(dt) {
      const d = drop;
      if (d.phase === 'fall') {
        stepVis(bombV, dt); bombMesh.position.set(bombV.x, bombV.y, 0.1);
        if (bombV.mode === 'rest' && bombV.landed) { d.phase = 'fuse'; d.t = 0; audio.sfx('thud', { vol: 0.5 }); }
      } else if (d.phase === 'fuse') {
        d.t += dt; stepVis(bombV, dt); bombMesh.position.set(bombV.x, bombV.y, 0.1);
        const k = d.t / 0.8; bombMesh.scale.setScalar(1 + Math.sin(d.t * (14 + k * 30)) * 0.08 * (0.5 + k));
        spark.material.opacity = 0.6 + Math.sin(d.t * 40) * 0.4;
        if (Math.floor(d.t * 8) !== Math.floor((d.t - dt) * 8)) audio.sfx('tick', { vol: 0.5, rate: 1 + k });
        if (Math.random() < dt * 30) fx.particles.emit(bombV.x + 0.1, bombV.y + 0.8, 0.3, rand(-1, 1), rand(1, 3), 0.5, { life: 0.4, size: 0.2, color: 0xffb030, gravity: 2 });
        if (d.t >= 0.8) explode();
      } else if (d.phase === 'settle') {
        d.t += dt; if (d.t > 1.0) { const p = d.p; drop = null; resolve(p); }
      }
      if (d.phase === 'fall' && st > 2.5) { bombV.mode = 'rest'; bombV.landed = true; }
    }
    function explode() {
      const d = drop, c = d.c, bx = cx(c), by = ry(board.h(c));
      const res = board.bomb(c); bombMesh.visible = false; bombMesh.scale.setScalar(1);
      for (const k of res.gone) { const v = visById.get(k.id); if (!v) continue; visById.delete(k.id); v.mode = 'burst'; v.t = 0; v.z = 0.75; v.vx = (v.x - bx) * 3.2 + rand(-1, 1); v.vy = (v.y - by) * 3.2 + rand(5, 9); v.vz = rand(5, 9); v.spin = rand(-10, 10); loose.push(v); }
      for (const k of res.moved) { const v = visById.get(k.id); if (v) fallTo(v, k.r, false); }
      audio.sfx('explode', { vol: 0.9 }); ctx.shake(1); camPunch = 0.8; Hl.cheer(1.5);
      fx.particles.burst(bx, by, 1.0, { count: 70, speed: 9, up: 0.8, life: 1.1, size: 0.7, colors: [0xffd23f, 0xff7a1a, 0xff3a10, 0xffffff], gravity: 3 });
      fx.particles.ring(bx, by, 1.0, { count: 26, speed: 8, color: 0xffb040, size: 0.5, life: 0.6 });
      d.phase = 'settle'; d.t = 0;
    }

    // ---------------- invoer ----------------
    function readInput(dt) {
      const inp = pv.input(turn);
      // links/rechts met herhaling (op de analoge as, dus ook goed met omkeren/dronken)
      const dx = inp.x > 0.45 ? 1 : inp.x < -0.45 ? -1 : 0, h = hold[turn];
      if (dx !== h.d) { h.d = dx; if (dx) { stepCol(dx); h.n = 0.3; } }
      else if (dx) { h.n -= dt; if (h.n <= 0) { stepCol(dx); h.n = 0.1; } }
      const dy = inp.y > 0.55 ? 1 : inp.y < -0.55 ? -1 : 0;
      if (dy !== vHold[turn]) { vHold[turn] = dy; if (dy && uses[turn] > 0 && !sd) { const n = nextSel(turn, dy); if (n !== sel[turn]) { sel[turn] = n; armed[turn] = null; panelDirty = true; refreshHud(); audio.sfx('select', { vol: 0.4 }); } } }
      if (inp.bP) {
        if (sd) { reject('Geen krachten in sudden death'); }
        else if (uses[turn] <= 0) { reject('Je kracht is al gebruikt'); }
        else { armed[turn] = armed[turn] ? null : POWERS[sel[turn]].id; panelDirty = true; refreshHud(); audio.sfx(armed[turn] ? 'powerup' : 'click', { vol: 0.5 }); if (armed[turn]) say(POWERS[sel[turn]].name + '!', curX, CUR_Y + 1.6, 1, POWERS[sel[turn]].col, 1.1); }
      }
      if (inp.aP) act();
    }
    function stepCol(d) { const lo = board.cap.findIndex((x) => x > 0), hi = board.cap.length - 1 - [...board.cap].reverse().findIndex((x) => x > 0); const n = clamp(col + d, lo, hi); if (n !== col) { col = n; lastCol[turn] = col; audio.sfx('click', { vol: 0.45, rate: 1 + col * 0.04 }); } }

    // ---------------- per-frame ----------------
    function tickClock(dt) {
      if (state !== 'turn' && state !== 'dropping' && state !== 'power') return;
      if (clock <= 0) return;
      clock -= dt;
      if (clock <= 0) {
        clock = 0; auto = true;
        hud.showBig('TIJD OP!', 1400, '#ff6a4a'); hud.toast('De draken spelen het potje af...', 2400); audio.sfx('bell'); armed[0] = armed[1] = null; panelDirty = true;
      }
    }
    function update(dt) {
      T += dt; st += dt; hardT += dt; if (camPunch > 0) camPunch = Math.max(0, camPunch - dt * 0.9);
      tickClock(dt);
      hud.setTimer(sd ? null : clock, 15);
      if (state === 'toss') { if (st > 1.5) beginTurn(); }
      else if (state === 'turn') {
        if (pendingDeur) runDeurman();
        else {
          if (!auto && !sd) { evT -= dt; if (evT <= 0 && ev === null) { if (board.count() >= 4) startEvent(); else evT = 2; } }
          if (state === 'turn') {
            timer -= dt;
            if (auto) { autoT -= dt; if (autoT <= 0) autoDrop('auto'); }
            else { readInput(dt); if (timer <= 0 && state === 'turn') autoDrop('timeout'); }
            if (!auto && timer < 3 && Math.floor(timer * 2) !== Math.floor((timer + dt) * 2) && timer > 0) audio.sfx('tick', { vol: 0.5, rate: 1.4 });
          }
        }
      }
      else if (state === 'dropping') {
        if (!drop) { state = 'turn'; }
        else if (drop.kind === 'bomb') bombUpdate(dt);
        else if (drop.landed || st > 2.4) { if (!drop.landed) drop.vis.mode = 'rest'; afterDrop(); }
      }
      else if (state === 'power') powerUpdate(dt);
      else if (state === 'win') { if (st > (lastWinner >= 0 ? 3.0 : 2.2)) finishRound(); }
      else if (state === 'clear') { if (st > 1.6) { if (sd) startRound(Math.random() < 0.5 ? 0 : 1); else startRound(lastWinner >= 0 ? 1 - lastWinner : 1 - starter); } }
      visuals(dt);
      if (hardT > HARD_MAX && !finished) { endMatch(score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : (Math.random() < 0.5 ? 0 : 1), 'De draak werd ongeduldig en besliste zelf.'); }
    }
    function runDeurman() {
      const m = pendingDeur; pendingDeur = null;
      m.forEach((moved, i) => {
        if (!moved) return;
        const tops = []; for (let c = 0; c < 7; c++) { const t = board.top(c); if (t && t.o === i) tops.push(c); }
        say('DEURMAN!', chars[i].holder.position.x, 5.6, 1.4, '#ff6a4a', 1.4); react1(i, 'scared', 1.4);
        if (tops.length) { const c = pick(tops), t = board.top(c); board.g[c].pop(); const v = visById.get(t.id); visById.delete(t.id); if (v) { v.mode = 'burst'; v.t = 0; v.z = 0.75; v.vx = rand(-2, 2); v.vy = rand(5, 8); v.vz = rand(4, 7); v.spin = rand(-9, 9); loose.push(v); } }
        else if (uses[i] > 0) { uses[i] = 0; panelDirty = true; refreshHud(); }
        audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4);
      });
    }

    // ---------------- visuals ----------------
    const cur = { sc: 1 };
    function updateCursor(dt) {
      const on = state === 'turn' && !auto;
      const target = cx(col);
      const k = 260, c = lerp(34, 3.5, SLIP);
      curV += (k * (target - curX) - c * curV) * dt; curX += curV * dt;
      const bob = Math.sin(T * 5) * 0.08;
      const shownBomb = armed[turn] === 'bom' && on;
      const slot0 = { slot: 0, x: curX, y: CUR_Y + bob + (on ? 0 : 1), z: 0, rot: Math.sin(T * 3) * 0.2, rx: 0, ry: 0, sc: 1, lift: 0, onBoard: false };
      const vis = ((state === 'turn' && !auto) || state === 'toss') && !shownBomb;
      const low = timer < 3 && on ? (Math.sin(T * 24) > 0 ? 1.18 : 1) : 1;
      slot0.sc = vis ? 1 * low * (armed[turn] ? 1.08 : 1) : 0;
      coins.setColorAt(0, tmpC.set(COIN_COL[turn]));
      writeVis(slot0);
      if (shownBomb) { bombMesh.visible = true; bombMesh.position.set(curX, CUR_Y + bob, 0.1); spark.material.opacity = 0.7 + Math.sin(T * 30) * 0.3; if (Math.random() < dt * 20) fx.particles.emit(curX + 0.1, CUR_Y + 0.9, 0.3, rand(-1, 1), rand(1, 3), 0.5, { life: 0.4, size: 0.18, color: 0xffb030, gravity: 2 }); }
      else if (!(drop && drop.kind === 'bomb')) bombMesh.visible = false;
      // iconen, balk, bundel
      const a = armed[turn];
      armIcon.visible = !!a && on; if (a) { const idx = POWERS.findIndex((p) => p.id === a); if (armIcon.material.map !== icons[idx]) armIcon.material.map = icons[idx]; armIcon.position.set(curX + 1.0, CUR_Y + 0.35 + Math.sin(T * 6) * 0.1, 1); }
      B.beam.visible = state === 'turn' && !auto; B.beam.position.x = curX; B.beam.material.opacity = 0.12 + Math.sin(T * 6) * 0.04;
      const frac = state === 'turn' ? clamp(timer / timerMax, 0, 1) : 0;
      B.timer.scale.x = Math.max(0.001, frac); if (state === 'turn') B.timerMat.color.setHex(frac < 0.3 ? 0xff4a3a : COL_HEX[turn]);
      if (state === 'turn' && frac < 0.3) B.edgeMat.color.setHex(Math.sin(T * 14) > 0 ? 0xff4a3a : COL_HEX[turn]);
    }
    function poseChars(dt) {
      const inGame = state === 'turn' || state === 'dropping' || state === 'power' || state === 'toss';
      for (let i = 0; i < 2; i++) {
        const o = chars[i], c = o.c, r = react[i], s = pj[i], side = i ? -1 : 1;
        r.t -= dt; const active = inGame && i === turn;
        c.pose = r.t > 0 ? r.pose : 'idle'; c.speed = 0; c.update(dt);
        if (r.t <= 0 && inGame && !finished) {
          const J = (key, obj, ax, tgt, k = 10) => { s[key] = s[key] === undefined ? obj[ax] : damp(s[key], tgt, k, dt); obj[ax] = s[key]; };
          if (active) {   // wijst naar zijn kolom
            const lookX = clamp((curX - o.holder.position.x) * -0.07 * side, -0.5, 0.5);
            J('arx', c.armR, 'x', -1.55 + Math.sin(T * 3) * 0.1); J('arz', c.armR, 'z', -0.1); J('alx', c.armL, 'x', -0.3); J('alz', c.armL, 'z', 0.1);
            J('hy', c.head, 'y', lookX * side, 8); J('hz', c.head, 'z', Math.sin(T * 2.3) * 0.08); J('tz', c.torso, 'z', 0, 8);
            c.body.position.y += Math.abs(Math.sin(T * 4)) * 0.06;
          } else {        // ik-kijk-mee: armen over elkaar, hoofd volgt de cursor, soms een denkwolkje
            const look = clamp((curX - o.holder.position.x) * 0.075, -0.8, 0.8);
            J('arx', c.armR, 'x', -1.0); J('arz', c.armR, 'z', 0.75); J('alx', c.armL, 'x', -1.1); J('alz', c.armL, 'z', -0.75);
            J('hy', c.head, 'y', side * look * -1 + Math.sin(T * 1.3 + i) * 0.1, 7); J('hz', c.head, 'z', Math.sin(T * 1.7 + i * 2) * 0.12); J('tz', c.torso, 'z', Math.sin(T * 1.2 + i) * 0.04, 6);
            c.legR.rotation.x = Math.max(0, Math.sin(T * 6 + i)) * 0.35 * (state === 'turn' ? 1 : 0);
            thinkT[i] -= dt; if (thinkT[i] <= 0 && state === 'turn') { thinkT[i] = rand(2.5, 5); say(pick(['Hmm...', 'Oei!', 'Ahaa!', 'Doe maar links', 'Nee nee nee', 'Kijk uit!', 'Hmm hm hm']), o.holder.position.x, o.holder.position.y + c.height * o.k + 0.3, 1.5, '#fff', 0.8); }
          }
        }
        o.tag.position.set(o.holder.position.x, 0.55 + c.height * o.k + 0.9, 1.2);
        o.cone.visible = active && !finished; o.cone.position.set(o.holder.position.x, o.tag.position.y + 1.1 + Math.sin(T * 6) * 0.15, 1.2); o.cone.rotation.y += dt * 3;
        o.tag.scale.setScalar(active ? 1 + Math.sin(T * 6) * 0.04 : 0.9);
      }
    }
    function visuals(dt) {
      for (const v of visById.values()) stepVis(v, dt);
      for (let i = loose.length - 1; i >= 0; i--) { const v = loose[i]; stepVis(v, dt); if (v.dead) loose.splice(i, 1); }
      // winnende munten: golden pulse + hupje
      if (state === 'win' && winCoins.length) winCoins.forEach((o, i) => { const ph = st * 7 - i * 0.7, v = o.v; v.lift = Math.max(0, Math.sin(ph)) * 0.32; const f = 0.5 + 0.5 * Math.sin(st * 12 - i); coins.setColorAt(v.slot, tmpC.set(COIN_COL[o.k.o]).lerp(new THREE.Color(0xfff2b0), f * 0.75)); if (Math.random() < dt * 12) fx.particles.emit(v.x + rand(-0.4, 0.4), v.y + 0.5, 0.8, 0, 1.2, 0, { life: 0.6, size: 0.3, color: 0xffe680, gravity: -1 }); });
      if (state === 'win') { winBeam.material.opacity = 0.55 + Math.sin(st * 14) * 0.3; }
      for (const v of visById.values()) writeVis(v);
      for (const v of stones) writeVis(v);
      for (const v of loose) writeVis(v);
      updateCursor(dt);
      coins.instanceMatrix.needsUpdate = true; coins.instanceColor.needsUpdate = true;
      // magische vakken
      B.magic.forEach((sp, i) => { const m = magic[i]; if (!m) { sp.material.opacity = 0; return; } sp.position.set(cx(m[0]), ry(m[1]) - BOARD_CY, 0.62); sp.material.opacity = 0.55 + Math.sin(T * 4 + i * 2) * 0.25; sp.scale.setScalar(2.0 + Math.sin(T * 4 + i) * 0.15); if (Math.random() < dt * 3) fx.particles.emit(cx(m[0]) + rand(-0.4, 0.4), ry(m[1]) + rand(-0.4, 0.4), 0.8, 0, 0.8, 0, { life: 0.9, size: 0.2, color: 0xffe680, gravity: -0.5 }); });
      // deur
      if (door.visible) { doorY = damp(doorY, doorTarget, 7, dt); door.position.y = doorY; door.position.x = closed ? cx(closed.col) : door.position.x; if (!closed && Math.abs(doorY - doorTarget) < 0.3) door.visible = false; }
      if (panelDirty) { drawPanel(0); drawPanel(1); panelDirty = false; }
      B.lamps.forEach((l, i) => { l.material.opacity = 0.55 + Math.sin(T * 3 + i) * 0.15; });
      Hl.update(dt, state === 'turn' ? turn : -1);
      poseChars(dt);
      placeCamera();
    }
    // ---------------- camera ----------------
    const camBase = new THREE.Vector3(), camTgt = new THREE.Vector3(0, 4.6, 0), pitch = 0.2;
    const fitPts = [[-5.9, 0, 1.4], [5.9, 0, 1.4], [-SIDE_X - 1.5, 0.2, 1.2], [SIDE_X + 1.5, 0.2, 1.2], [0, TOP_Y + 2.1, 0], [-SIDE_X - 1.9, 6.5, 1.2], [SIDE_X + 1.9, 6.5, 1.2]];
    function fitCamera() {
      const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)), v = new THREE.Vector3(); let lo = 8, hi = 60;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(camTgt).addScaledVector(dir, d); camera.lookAt(camTgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.97 || v.y > 0.7 || v.y < -0.93) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camBase.copy(camTgt).addScaledVector(dir, hi);
    }
    const camTmp = new THREE.Vector3();
    function placeCamera() {
      const sw = Math.sin(T * 0.3 + introT) * 0.5, z = 1 - camPunch * 0.05;
      const p = camTmp.copy(camBase).sub(camTgt).multiplyScalar(z).add(camTgt); p.x += sw;
      camera.position.copy(p); camera.lookAt(camTgt.x, camTgt.y - camPunch * 0.2, camTgt.z);
    }
    fitCamera();

    function resultUpdate(dt) { T += dt; st += dt; for (const v of visById.values()) stepVis(v, dt); for (const v of loose) stepVis(v, dt); visuals(dt); }
    function introUpdate(dt) { introT += dt; T += dt; for (let i = 0; i < 2; i++) react[i].t = 0; visuals(dt); }
    panelDirty = true; refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onStart() { try { audio.music('game_minor'); } catch (e) { /* geen audio */ } if (!started) { started = true; st = 0; round = 0; starter = Math.random() < 0.5 ? 0 : 1; startRound(starter); } },
      onResize() { camera.updateProjectionMatrix(); fitCamera(); },
      onSwap(sw) { for (let i = 0; i < 2; i++) fx.particles.burst(chars[i].holder.position.x, 3, 1.2, { count: 24, speed: 4, up: 1, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 2 }); hud.toast(sw ? '🔄 Wissel! Wes bestuurt Jor en Jor bestuurt Wes' : '🔄 Terug naar je eigen vingers!', 2200); },
      onDeurman(movers) { pendingDeur = movers.slice(); },
      celebrate(w) { react1(w, 'cheer', 99); react1(1 - w, 'sad', 99); Hl.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, state, clock, score: [...score], round, roundsPlayed, turn, turnNo, sel: [...sel], auto, sd, sdTries, finished, extra, closed: closed && { ...closed }, uses: [...uses], usedTypes: used.map((s) => [...s]), armed: [...armed], magic: magic.map((m) => [...m]), grid: board.g.map((s) => s.map((k) => k.o).join('')), count: board.count(), stats: { ...stats, rounds: [...stats.rounds] }, col, timer: +timer.toFixed(2), drawn: stats.drops, legal: board.legal() }),
        board: () => board, setClock: (t) => { clock = t; }, pending: () => !!pendingDeur,
        startEvent: (k) => { evAlt = k === 'deur'; startEvent(); }, giveUses: (i, n) => { uses[i] = n; used[i].clear(); panelDirty = true; },
        // bijna volle borden voor de gelijkspel-test: vult alle vakken behalve één, zonder rij van vier
        almostFull() {
          for (let tries = 0; tries < 200; tries++) {
            const b = new Board(); let ok = true;
            for (let r = 0; r < 6 && ok; r++) for (let c = 0; c < 7 && ok; c++) {
              if (r === 5 && c === 6) break;
              const o = Math.random() < 0.5 ? 0 : 1; const o2 = [o, 1 - o];
              let placed = false; for (const w of o2) { if (b.runThrough(c, b.h(c), w) < 4) { b.drop(c, w); placed = true; break; } }
              if (!placed) ok = false;
            }
            if (!ok || b.wins(6, 0) || b.wins(6, 1)) continue;
            levelBoard(); board = b;
            for (const k of board.all()) { const v = makeVis(k.o, cx(k.c), ry(k.r)); visById.set(k.id, v); }
            return true;
          }
          return false;
        },
      },
    };
  },
};

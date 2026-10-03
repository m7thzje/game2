import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, makeDeurman, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { W, H, CELL, TUNNEL_ROWS, buildMaze } from './pacduel_maze.js';
import { buildWorld, cx2w, cz2w, WALL_H } from './pacduel_world.js';

// Spookjacht-Duel — Pac-Man 1 tegen 1 in een spiegelsymmetrisch neon-doolhof.
//  * meeste munten na 90 s wint (gelijk = gouden munt, sudden death). Krachtbol = spook-jager: tik de ander aan en steel de helft van zijn munten.
//  * 2 NPC-spookjes jagen op de rijkste (jagen maakt je verdoofd + je verliest munten), fruit-bonussen (gespiegeld), munten-regen als het doolhof leeg is.
//  * A = sprint (cooldown), B = gelei-blok achter je neerzetten (blokkeert even de gang). De Deurman opent/sluit de tunnel-deuren.
const MATCH = 90, SD_MAX = 20, HUNT_T = 7, BLOCK_T = 5.5;
const V = 5.0, V_GHOST = 3.5, SPRINT_T = 0.8, SPRINT_CD = 4.5, BOMB_CD = 7;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FRUITS = [{ id: 'kers', pts: 5, w: 5, name: 'KERS' }, { id: 'druif', pts: 8, w: 3, name: 'DRUIF' }, { id: 'ster', pts: 15, w: 1.4, name: 'GOUDEN STER' }];

function makeGhost(color) {
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 });
  const dbl = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide });
  const body = new THREE.Group(); g.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, TAU, 0, Math.PI / 2), bm, { pos: [0, 0.62, 0] }));
  body.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.62, 14, 1, true), dbl, { pos: [0, 0.31, 0] }));
  const feet = [];
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const f = mesh(new THREE.SphereGeometry(0.2, 7, 5), bm, { cast: false, pos: [Math.cos(a) * 0.34, 0.06, Math.sin(a) * 0.34] }); body.add(f); feet.push(f); }
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), dark = new THREE.MeshBasicMaterial({ color: 0x14141e });
  const eyes = new THREE.Group(); eyes.position.set(0, 0.7, 0); body.add(eyes);
  const pupils = [];
  for (const sx of [-1, 1]) { eyes.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), white, { cast: false, pos: [sx * 0.2, 0, 0.42], scale: [1, 1.2, 0.6] })); const p = mesh(new THREE.SphereGeometry(0.075, 6, 5), dark, { cast: false, pos: [sx * 0.2, 0, 0.5] }); eyes.add(p); pupils.push(p); }
  const mouth = mesh(new THREE.BoxGeometry(0.42, 0.06, 0.04), white, { cast: false, pos: [0, 0.4, 0.54] }); mouth.visible = false; body.add(mouth);
  g.userData = { bm, dbl, body, feet, eyes, pupils, mouth, base: color };
  return g;
}
function makeFruit() {
  const g = new THREE.Group();
  const kers = new THREE.Group();
  for (const sx of [-1, 1]) { kers.add(mesh(new THREE.SphereGeometry(0.26, 9, 7), new THREE.MeshStandardMaterial({ color: 0xe0202a, emissive: 0x900010, emissiveIntensity: 0.5, roughness: 0.3 }), { cast: false, pos: [sx * 0.22, 0.3, 0] })); kers.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4), mat(0x3a8a2a), { cast: false, pos: [sx * 0.1, 0.62, 0], rot: [0, 0, sx * -0.35] })); }
  const druif = new THREE.Group(); const pm = new THREE.MeshStandardMaterial({ color: 0x9a3aff, emissive: 0x5a10b0, emissiveIntensity: 0.5, roughness: 0.3 });
  [[0, 0.62], [-0.18, 0.44], [0.18, 0.44], [-0.09, 0.26], [0.09, 0.26], [0, 0.1]].forEach(([x, y]) => druif.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), pm, { cast: false, pos: [x, y + 0.1, 0] })));
  druif.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4), mat(0x3a8a2a), { cast: false, pos: [0, 0.95, 0] }));
  const ster = new THREE.Group(); const sm = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa010, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5 });
  const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.2 : 0.5; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * r, Math.sin(a) * r); } sh.closePath();
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }); sg.translate(0, 0, -0.07);
  ster.add(mesh(sg, sm, { cast: false, pos: [0, 0.6, 0] }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 20), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; g.add(halo);
  g.add(kers, druif, ster); g.userData = { kers, druif, ster, halo }; g.visible = false;
  return g;
}

export default {
  id: 'pacduel',
  name: 'Spookjacht-Duel',
  giver: 'Spookkok Boe',
  icon: '👻',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Pac-Man voor twee in een <b>neon-doolhof</b>! Eet de meeste <b>munten</b>. Met een <b>krachtbol</b> word je spook-jager en steel je de helft van je broers munten. Pas op voor de <b>spookjes</b> en de <b>Deurman</b>!',
  controls: ['{move} lopen door het doolhof', '{a} sprint (even wachten)', '{b} gelei-blok achter je: sluit de gang!'],
  tip: 'Een blok in een smalle gang houdt een jager of spook tegen. Wie achterstaat krijgt langere jacht-tijd en snellere sprint.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const GSPEED = 1 + ((ctx.twist.speed || 1) - 1) * 0.6;

    const L = ctx.lights('night', { shadow: 26, center: [0, 0, 0], fogNear: 60, fogFar: 150 });
    L.hemi.intensity = 1.25; L.hemi.color.set(0xb8a8ff); L.hemi.groundColor.set(0x40306a);
    L.sun.color.set(0xd8c8ff); L.sun.intensity = 1.35; L.sun.position.set(-8, 34, 16);
    camera.fov = 50; camera.updateProjectionMatrix();

    const maze = buildMaze();
    const colorsCss = ['#35c46f', '#4a8cff'];
    const Wd = buildWorld(ctx, maze, names, colorsCss);
    const idx = (x, z) => z * W + x;

    // ---------------- rooster-toestand ----------------
    const wall = maze.wall;
    const blk = new Float32Array(W * H);                 // resterende tijd van een gelei-blok op dit vakje
    const gateOpen = { 4: true, 10: false };             // tunnel-deuren per rij
    const gateWantClose = {};
    const coin = new Uint8Array(W * H), coinPop = new Float32Array(W * H);
    const special = new Uint8Array(W * H);                // geen munt op: starts, spook-start, krachtbollen
    maze.starts.forEach(([x, z]) => { special[idx(x, z)] = 1; }); special[idx(...maze.ghost)] = 1; maze.orbs.forEach(([x, z]) => { special[idx(x, z)] = 1; });
    for (const row of TUNNEL_ROWS) { special[idx(0, row)] = 1; special[idx(W - 1, row)] = 1; }
    const coinCells = maze.cells.filter(([x, z]) => !special[idx(x, z)]);
    let coinsLeft = 0;
    function free(cx, cz) {
      if (cx < 0 || cx >= W) return TUNNEL_ROWS.includes(cz) && !!gateOpen[cz];
      if (cz < 0 || cz >= H) return false;
      const i = idx(cx, cz);
      if (wall[i] || blk[i] > 0) return false;
      if ((cx === 0 || cx === W - 1) && TUNNEL_ROWS.includes(cz) && !gateOpen[cz]) return false;
      return true;
    }
    const openCell = (x, z) => x >= 0 && x < W && z >= 0 && z < H && !wall[idx(x, z)];

    // ---------------- munten (instanced) ----------------
    const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14); coinGeo.rotateX(0.55);
    const coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa010, emissiveIntensity: 0.75, roughness: 0.3, metalness: 0.6 }), coinCells.length);
    coinMesh.frustumCulled = false; coinMesh.castShadow = false; scene.add(coinMesh);
    const dm = new THREE.Object3D();
    function setCoin(x, z, on, pop = true) { const i = idx(x, z); if (on && !coin[i]) coinsLeft++; else if (!on && coin[i]) coinsLeft--; coin[i] = on ? 1 : 0; if (on && pop) coinPop[i] = 0.001; else if (on) coinPop[i] = 1; }
    function fillCoins(pop = false) { for (const [x, z] of coinCells) setCoin(x, z, true, pop); }
    function drawCoins(t, dt) {
      let k = 0;
      for (const [x, z] of coinCells) {
        const i = idx(x, z);
        let s = coin[i] ? 1 : 0;
        if (coin[i] && coinPop[i] < 1) { coinPop[i] = Math.min(1, coinPop[i] + dt * 3); const q = coinPop[i]; s = q < 1 ? 1 + Math.sin(q * Math.PI) * 0.6 : 1; s *= Math.min(1, q * 2.5); }
        dm.position.set(cx2w(x), 0.52 + Math.sin(t * 3 + x * 0.7 + z) * (GRAV < 1 ? 0.28 : 0.07), cz2w(z));
        dm.rotation.set(0, t * 2.6 + x * 0.5, 0); dm.scale.setScalar(Math.max(0.0001, s)); dm.updateMatrix(); coinMesh.setMatrixAt(k++, dm.matrix);
      }
      coinMesh.instanceMatrix.needsUpdate = true;
    }

    // ---------------- krachtbollen ----------------
    const orbs = maze.orbs.map(([x, z]) => {
      const g = new THREE.Group(); g.position.set(cx2w(x), 0, cz2w(z));
      const core = mesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff5ad8, emissive: 0xff2ac0, emissiveIntensity: 1.1, roughness: 0.25 }), { cast: false, pos: [0, 0.75, 0] });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 22), new THREE.MeshBasicMaterial({ color: 0xff9af0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
      g.add(core, ring); scene.add(g);
      return { x, z, on: true, t: 0, g, core, ring };
    });

    // ---------------- spelers ----------------
    const sizeScale = (i) => Math.pow(pv.size(i), 0.6);
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const k = 2.25 / c.height; const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const s = maze.starts[i];
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(3.4, 1.28, 1); tag.renderOrder = 15; scene.add(tag);
      const aura = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 24), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); aura.rotation.x = -Math.PI / 2; aura.visible = false; scene.add(aura);
      const shadow = P.shadowBlob(0.8); scene.add(shadow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      return { i, c, holder, k, tag, aura, shadow, ring, x: s[0], z: s[1], dx: 0, dz: 0, wx: 0, wz: 0, wantT: 0, coins: 0, eaten: 0, hunter: 0, stun: 0, inv: 0, resp: 0, sprint: 0, sprintCd: 0, bombCd: 0, sf: 1,
        prevC: null, curC: s.slice(), combo: 0, comboT: 0, bumpCd: 0, steals: 0, hits: 0, fruit: 0, ghostsEaten: 0, blockCell: null, txt: '', pulse: 0, moving: false, hop: 0 };
    });
    pl.forEach((p) => { p.c.faceDir(0, -1); p.c.yaw = p.c.targetYaw; });

    // ---------------- spookjes ----------------
    const ghosts = [0xff6ad0, 0xffa23a].map((col, n) => {
      const g = makeGhost(col); scene.add(g); const sh = P.shadowBlob(0.7); scene.add(sh);
      return { n, g, sh, x: maze.ghost[0], z: maze.ghost[1], dx: n ? 1 : -1, dz: 0, wx: 0, wz: 0, mode: 'chase', dead: 0, wait: 1.5 + n * 1.5, col, face: 0, mood: 0 };
    });
    // gelei-blokken (max 1 per speler)
    const blocks = [0, 1].map((i) => { const m = mesh(new THREE.BoxGeometry(CELL * 0.88, 1.0, CELL * 0.88), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[i], emissive: PLAYER_COLORS[i], emissiveIntensity: 0.35, transparent: true, opacity: 0.82, roughness: 0.15 }), { pos: [0, 0.5, 0] }); m.visible = false; scene.add(m); return { m, cell: null, t: 0 }; });
    // fruit
    const fruits = [];
    for (let i = 0; i < 4; i++) { const g = makeFruit(); scene.add(g); fruits.push({ g, on: false, x: 0, z: 0, t: 0, type: FRUITS[0] }); }
    // gouden munt (sudden death)
    const gold = new THREE.Group(); gold.visible = false; scene.add(gold);
    { const gm = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb010, emissiveIntensity: 1.0, roughness: 0.25, metalness: 0.7 }); const cg = new THREE.CylinderGeometry(0.7, 0.7, 0.16, 18); cg.rotateX(Math.PI / 2); gold.add(mesh(cg, gm, { cast: false, pos: [0, 1.0, 0] }));
      const hl = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.3, 24), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); hl.rotation.x = -Math.PI / 2; hl.position.y = 0.08; gold.add(hl); gold.userData.hl = hl; }
    let deurman = null;

    // ---------------- toestand ----------------
    let T = 0, introT = 0, started = false, finished = false;
    const G = { state: 'init', t: 0, timeLeft: MATCH, sd: false, sdT: 0, winner: -1, double: false, nextFruit: 7, nextGate: 13, nextOrbHint: 0, scatter: 0, scatterIn: 16, deur: null, refills: 0, doorEvents: 0, ghostHits: [0, 0], goldCell: maze.ghost.slice(), end: false, banner: 0 };
    const stats = { steals: [0, 0], fruit: [0, 0], ghostHits: [0, 0], ghostsEaten: [0, 0] };
    const lead = (i) => pl[1 - i].coins - pl[i].coins;     // >0: i staat achter
    function refreshHud() {
      hud.setScore(`${names[0]} ${pl[0].coins} – ${pl[1].coins} ${names[1]}${G.sd ? '  (GOUDEN MUNT)' : ''}`);
    }
    const wx = (x) => cx2w(x), wz = (z) => cz2w(z);
    const addMoney = (p, n, pop = true) => { p.coins += n; p.pulse = 1; };

    // ---------------- beweging op het rooster ----------------
    function step(e, dist, onCenter) {
      let guard = 0;
      while (dist > 1e-5 && guard++ < 14) {
        const cx = Math.round(e.x), cz = Math.round(e.z);
        const atC = Math.abs(e.x - cx) < 1e-4 && Math.abs(e.z - cz) < 1e-4;
        if (atC) {
          e.x = cx; e.z = cz;
          if (onCenter) onCenter(e, cx, cz);
          if ((e.wx || e.wz) && free(cx + e.wx, cz + e.wz)) { if (e.wx !== e.dx || e.wz !== e.dz) e.turned = true; e.dx = e.wx; e.dz = e.wz; }
          if (!e.dx && !e.dz) break;
          if (!free(cx + e.dx, cz + e.dz)) { e.dx = e.dz = 0; e.bumped = true; break; }
        } else {
          // tussen twee vakjes: is het vakje vóór ons net dichtgegaan (blok/deur)? Dan keren we om
          const nx = e.dx > 0 ? Math.ceil(e.x - 1e-4) : e.dx < 0 ? Math.floor(e.x + 1e-4) : cx, nz = e.dz > 0 ? Math.ceil(e.z - 1e-4) : e.dz < 0 ? Math.floor(e.z + 1e-4) : cz;
          if (!free(nx, nz)) { e.dx = -e.dx; e.dz = -e.dz; e.bumped = true; if (guard > 6) break; continue; }
        }
        let dc;
        if (e.dx) { const f = (e.x - Math.round(e.x)) * e.dx; dc = atC ? 1 : (f < 0 ? -f : 1 - f); }
        else { const f = (e.z - Math.round(e.z)) * e.dz; dc = atC ? 1 : (f < 0 ? -f : 1 - f); }
        const m = Math.min(dist, dc);
        e.x += e.dx * m; e.z += e.dz * m; dist -= m;
        if (m >= dc - 1e-6) { e.x = Math.round(e.x * 1000) / 1000; e.z = Math.round(e.z * 1000) / 1000; if (e.dx) e.x = Math.round(e.x); else e.z = Math.round(e.z); }
        if (e.x < -0.5) e.x += W; else if (e.x > W - 0.5) e.x -= W;
      }
    }

    // ---------------- spelers ----------------
    function readInput(p, dt) {
      const inp = pv.input(p.i);
      const ax = Math.abs(inp.x), az = Math.abs(inp.y);
      if (Math.max(ax, az) > 0.35) { if (ax >= az) { p.wx = Math.sign(inp.x); p.wz = 0; } else { p.wx = 0; p.wz = Math.sign(inp.y); } p.wantT = 0.45; }
      else { p.wantT -= dt; if (p.wantT <= 0) { p.wx = 0; p.wz = 0; } }
      // direct omkeren mag altijd (als het vakje achter ons vrij is)
      if ((p.dx || p.dz) && p.wx === -p.dx && p.wz === -p.dz) {
        const nx = p.wx > 0 ? Math.ceil(p.x - 1e-4) : p.wx < 0 ? Math.floor(p.x + 1e-4) : Math.round(p.x), nz = p.wz > 0 ? Math.ceil(p.z - 1e-4) : p.wz < 0 ? Math.floor(p.z + 1e-4) : Math.round(p.z);
        if (free(nx, nz) || (Math.abs(p.x - Math.round(p.x)) < 1e-3 && Math.abs(p.z - Math.round(p.z)) < 1e-3 && free(Math.round(p.x) + p.wx, Math.round(p.z) + p.wz))) { p.dx = p.wx; p.dz = p.wz; p.sf = Math.min(p.sf, lerp(1, 0.3, SLIP)); }
      }
      if (inp.aP && p.sprintCd <= 0 && p.sprint <= 0) startSprint(p);
      if (inp.bP && p.bombCd <= 0) dropBlock(p);
      else if (inp.bP) audio.sfx('click', { vol: 0.15, rate: 0.6 });
    }
    function startSprint(p) {
      p.sprint = SPRINT_T; p.sprintCd = SPRINT_CD * (lead(p.i) >= 8 ? 0.65 : 1);
      audio.sfx('whoosh', { vol: 0.6, rate: 1.4 }); fx.particles.burst(wx(p.x), 0.5, wz(p.z), { count: 12, speed: 3, up: 0.6, life: 0.4, size: 0.3, colors: [0xffffff, p.i ? 0x8fb8ff : 0x7dffb0], gravity: 2 });
    }
    function entityNear(cx, cz, r) {
      for (const p of pl) if (p.resp <= 0 && Math.hypot(p.x - cx, p.z - cz) < r) return true;
      for (const g of ghosts) if (g.dead <= 0 && g.wait <= 0 && Math.hypot(g.x - cx, g.z - cz) < r) return true;
      return false;
    }
    function dropBlock(p) {
      let c = p.prevC;
      const cc = Math.abs(p.x - Math.round(p.x)) < 1e-3 && Math.abs(p.z - Math.round(p.z)) < 1e-3;
      if (!c || (c[0] === Math.round(p.x) && c[1] === Math.round(p.z))) c = null;
      if (c && Math.abs(c[0] - p.x) + Math.abs(c[1] - p.z) > 1.6) c = null;
      if (!c && cc) { const f = [Math.round(p.x) + p.dx, Math.round(p.z) + p.dz]; if ((p.dx || p.dz) && free(f[0], f[1])) c = f; }
      if (!c || !openCell(c[0], c[1]) || blk[idx(c[0], c[1])] > 0 || (TUNNEL_ROWS.includes(c[1]) && (c[0] === 0 || c[0] === W - 1)) || entityNear(c[0], c[1], 0.55)) {
        audio.sfx('buzz', { vol: 0.25 }); fx.texts.add('GEEN RUIMTE', wx(p.x), 2.6, wz(p.z), '#ff9a9a', 0.9); return;
      }
      const b = blocks[p.i];
      if (b.cell) blk[idx(b.cell[0], b.cell[1])] = 0;
      b.cell = c; b.t = BLOCK_T; blk[idx(c[0], c[1])] = BLOCK_T; p.bombCd = BOMB_CD;
      b.m.position.set(wx(c[0]), 0.5, wz(c[1])); b.m.visible = true; b.m.scale.set(0.2, 0.2, 0.2);
      audio.sfx('pop', { vol: 0.7, rate: 0.8 }); audio.sfx('boing', { vol: 0.4, rate: 0.6 });
      fx.particles.burst(wx(c[0]), 0.6, wz(c[1]), { count: 16, speed: 3, up: 1, life: 0.6, size: 0.35, colors: [p.i ? 0x8fb8ff : 0x7dffb0, 0xffffff], gravity: 5 });
      fx.texts.add('GELEI-BLOK!', wx(c[0]), 2.2, wz(c[1]), p.i ? '#8fb8ff' : '#7dffb0', 1.0);
    }
    function onPlayerCenter(p, cx, cz) {
      if (!p.curC || p.curC[0] !== cx || p.curC[1] !== cz) { p.prevC = p.curC; p.curC = [cx, cz]; }
    }
    function updatePlayer(p, dt) {
      p.inv = Math.max(0, p.inv - dt); p.sprintCd = Math.max(0, p.sprintCd - dt); p.bombCd = Math.max(0, p.bombCd - dt); p.bumpCd -= dt; p.comboT -= dt; if (p.comboT <= 0) p.combo = 0;
      p.pulse = Math.max(0, p.pulse - dt * 3);
      if (p.hunter > 0) { p.hunter -= dt; if (p.hunter <= 0) { p.hunter = 0; fx.texts.add('Jacht voorbij', wx(p.x), 2.8, wz(p.z), '#ffffff', 0.9); } }
      if (p.resp > 0) { p.resp -= dt; if (p.resp <= 0) respawn(p); return; }
      if (p.stun > 0) { p.stun -= dt; if (Math.random() < dt * 14) fx.particles.emit(wx(p.x) + (Math.random() - 0.5) * 0.8, 2.0, wz(p.z) + (Math.random() - 0.5) * 0.8, 0, 0.5, 0, { life: 0.5, size: 0.3, color: 0xffe14a, gravity: 0 }); p.moving = false; return; }
      if (G.state !== 'play' && G.state !== 'sudden') { p.moving = false; return; }
      readInput(p, dt);
      if (p.sprint > 0) { p.sprint -= dt; if (Math.random() < dt * 40) fx.particles.emit(wx(p.x) - p.dx * 0.5, 0.4, wz(p.z) - p.dz * 0.5, 0, 0.2, 0, { life: 0.35, size: 0.45, color: p.i ? 0x8fb8ff : 0x7dffb0, gravity: 0 }); }
      p.sf = damp(p.sf, 1, lerp(26, 2.4, SLIP), dt);
      const v = V * pv.speed(p.i) * (p.hunter > 0 ? 1.08 : 1) * (p.sprint > 0 ? 1.75 : 1) * (SLIP > 0.3 ? Math.max(0.35, p.sf) : 1);
      const total = v * dt, n = Math.max(1, Math.ceil(total / 0.2)), d1 = total / n;
      p.bumped = false; p.turned = false;
      for (let s = 0; s < n; s++) {
        step(p, d1, onPlayerCenter);
        if (p.turned) { p.sf = Math.min(p.sf, lerp(1, 0.45, SLIP)); p.turned = false; }
        pickups(p); collide(p);
        if (p.resp > 0 || p.stun > 0) break;
      }
      p.moving = !!(p.dx || p.dz);
      if (p.bumped && p.bumpCd <= 0 && (p.wx || p.wz)) { p.bumpCd = 0.5; const cx = Math.round(p.x) + p.dx, cz = Math.round(p.z) + p.dz; if (blk[idx(Math.max(0, Math.min(W - 1, cx)), Math.max(0, Math.min(H - 1, cz)))] > 0) { audio.sfx('boing', { vol: 0.4, rate: 1.2 }); } }
    }
    function respawn(p) {
      const s = maze.starts[p.i]; p.x = s[0]; p.z = s[1]; p.dx = p.dz = p.wx = p.wz = 0; p.inv = 3; p.prevC = null; p.curC = s.slice(); p.hunter = 0; p.stun = 0; p.sf = 1;
      p.holder.visible = true; fx.particles.burst(wx(p.x), 0.6, wz(p.z), { count: 24, speed: 4, up: 1.4, life: 0.8, size: 0.4, colors: [0xffffff, p.i ? 0x8fb8ff : 0x7dffb0], gravity: 3 }); audio.sfx('sparkle', { vol: 0.6 });
    }

    // ---------------- oprapen / botsen ----------------
    function pickups(p) {
      const cx = Math.round(p.x), cz = Math.round(p.z), d = Math.hypot(p.x - cx, p.z - cz);
      if (d < 0.5 && cx >= 0 && cx < W) {
        const i = idx(cx, cz);
        if (coin[i]) {
          setCoin(cx, cz, false); const val = G.double ? 2 : 1; addMoney(p, val); p.eaten += val;
          p.combo++; p.comboT = 0.7;
          audio.sfx('coin', { vol: 0.22, rate: 0.9 + Math.min(p.combo, 12) * 0.045 });
          fx.particles.burst(wx(cx), 0.7, wz(cz), { count: 3, speed: 1.8, up: 1, life: 0.35, size: 0.22, colors: [0xffe14a, 0xffffff], gravity: 5 });
          if (G.double && Math.random() < 0.5) fx.texts.add('x2', wx(cx), 1.6, wz(cz), '#ffd23f', 0.5);
          refreshHud();
          if (coinsLeft < 14 && !G.sd) munteRegen();
        }
        for (const o of orbs) if (o.on && o.x === cx && o.z === cz && d < 0.5) takeOrb(p, o);
      }
      for (const f of fruits) if (f.on && Math.hypot(f.x - p.x, f.z - p.z) < 0.7) takeFruit(p, f);
      if (G.sd && gold.visible && Math.hypot(G.goldCell[0] - p.x, G.goldCell[1] - p.z) < 0.75) { G.goldTaker = G.goldTaker == null || Math.random() < 0.5 ? p.i : G.goldTaker; }
    }
    function takeOrb(p, o) {
      o.on = false; o.t = 16; o.g.visible = false;
      const bonus = lead(p.i) >= 8 ? 3 : 0;
      p.hunter = HUNT_T + bonus; p.sf = 1;
      audio.sfx('powerup', { vol: 0.9 }); audio.sfx('sparkle', { vol: 0.5 }); ctx.shake(0.3);
      fx.particles.burst(wx(o.x), 0.8, wz(o.z), { count: 40, speed: 6, up: 1.3, life: 1.0, size: 0.4, colors: [0xff5ad8, 0xffffff, 0xff9af0], gravity: 3 });
      fx.texts.add(bonus ? 'SUPER-JAGER!' : 'SPOOK-JAGER!', wx(p.x), 3.2, wz(p.z), '#ff5ad8', 1.5);
      hud.toast(`${names[p.i]} is spook-jager! ${names[1 - p.i]}: ren weg!`, 2200);
      for (const g of ghosts) if (g.dead <= 0 && g.mode !== 'scared') { g.mode = 'scared'; g.dx = -g.dx; g.dz = -g.dz; }
    }
    function takeFruit(p, f) {
      f.on = false; f.g.visible = false; const pts = f.type.pts * (G.double ? 2 : 1); addMoney(p, pts); p.eaten += pts; p.fruit++; stats.fruit[p.i]++;
      if (f.type.id === 'ster') { p.sprintCd = 0; p.bombCd = 0; }
      audio.sfx('good', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.5 });
      fx.particles.burst(f.g.position.x, 0.9, f.g.position.z, { count: 24, speed: 5, up: 1.2, life: 0.9, size: 0.4, colors: [0xffd23f, 0xffffff, 0xff7ad8], gravity: 4 });
      fx.texts.add(`+${pts} ${f.type.name}`, f.g.position.x, 2.4, f.g.position.z, '#ffe14a', 1.2); refreshHud();
    }
    function munteRegen() {
      G.refills++; let n = 0;
      for (const [x, z] of coinCells) { if (coin[idx(x, z)] || blk[idx(x, z)] > 0) continue; if (pl.some((p) => Math.hypot(p.x - x, p.z - z) < 1.2)) continue; setCoin(x, z, true, true); n++; }
      audio.sfx('powerup', { vol: 0.6 }); hud.showBig('MUNTENREGEN!', 1200, '#ffd23f'); fx.texts.add('MUNTENREGEN!', 0, 3, 0, '#ffd23f', 2);
    }
    function scatter(p, n) {
      // verloren munten vallen op de grond in de buurt (iedereen kan ze oprapen)
      const cand = coinCells.filter(([x, z]) => !coin[idx(x, z)] && Math.abs(x - p.x) + Math.abs(z - p.z) <= 5 && blk[idx(x, z)] <= 0);
      for (let k = 0; k < n && cand.length; k++) { const j = Math.floor(Math.random() * cand.length); const [x, z] = cand.splice(j, 1)[0]; setCoin(x, z, true, true); fx.particles.burst(wx(x), 0.8, wz(z), { count: 3, speed: 1.5, up: 1.5, life: 0.5, size: 0.25, colors: [0xffd23f], gravity: 6 }); }
    }
    function collide(p) {
      if (p.resp > 0) return;
      // spookjes
      for (const g of ghosts) {
        if (g.dead > 0 || g.wait > 0) continue;
        const d = Math.hypot(g.x - p.x, g.z - p.z), R = 0.55 + 0.1 * pv.size(p.i);
        if (d > R) continue;
        if (g.mode === 'scared') {
          if (p.hunter > 0) eatGhost(p, g);
        } else if (p.inv <= 0 && p.stun <= 0 && p.hunter <= 0) ghostHit(p, g);
      }
      // de andere speler
      const o = pl[1 - p.i];
      if (p.hunter > 0 && o.hunter <= 0 && o.inv <= 0 && o.resp <= 0 && Math.hypot(o.x - p.x, o.z - p.z) < 0.65 + 0.25 * (pv.size(p.i) + pv.size(o.i)) / 2) steal(p, o);
      else if (p.hunter > 0 && o.hunter > 0 && Math.hypot(o.x - p.x, o.z - p.z) < 0.6 && p.bumpCd <= 0) { p.bumpCd = o.bumpCd = 0.8; audio.sfx('boing', { vol: 0.5 }); fx.texts.add('BONK!', wx(p.x), 2.6, wz(p.z), '#ffffff', 1); p.dx = -p.dx; p.dz = -p.dz; }
    }
    function steal(h, v) {
      const n = v.coins >= 2 ? Math.floor(v.coins / 2) : v.coins;
      v.coins -= n; h.coins += n; h.eaten += n; h.steals++; stats.steals[h.i]++; h.hunter = 0;
      audio.sfx('hit', { vol: 0.9 }); audio.sfx('explode', { vol: 0.35 }); audio.sfx('coin', { vol: 0.5, rate: 0.8 }); ctx.shake(0.75);
      fx.particles.burst(wx(v.x), 1.0, wz(v.z), { count: 40, speed: 7, up: 1.2, life: 1.0, size: 0.4, colors: [0xffd23f, 0xffffff, 0xff7a3a], gravity: 6 });
      fx.particles.ring(wx(v.x), 0.5, wz(v.z), { count: 22, speed: 7, color: 0xff5ad8, size: 0.35, life: 0.5 });
      fx.texts.add(n ? `GESTOLEN! +${n}` : 'GEPAKT!', wx(h.x), 3.0, wz(h.z), '#8dff9a', 1.5);
      if (n) fx.texts.add(`-${n}`, wx(v.x), 2.8, wz(v.z), '#ff6a6a', 1.4);
      h.c.pose = 'cheer'; v.c.pose = 'sad'; h.poseT = 1.4; v.poseT = 1.6;
      if (n > 0) { v.resp = 1.1; v.holder.visible = false; } else { v.stun = 1.2; v.inv = 2.5; }
      for (const g of ghosts) if (g.mode === 'scared' && !pl.some((q) => q.hunter > 0)) g.mode = 'chase';
      refreshHud();
    }
    function ghostHit(p, g) {
      const lose = p.coins <= 2 ? p.coins : clamp(Math.round(p.coins * 0.15), 3, 9);
      p.coins -= lose; p.stun = 1.3; p.inv = 3.2; p.hits++; stats.ghostHits[p.i]++; p.sf = 0.3;
      if (lose) scatter(p, lose);
      audio.sfx('hurt', { vol: 0.8 }); ctx.shake(0.5); audio.sfx('scare', { vol: 0.12 });
      fx.texts.add(lose ? `AU! -${lose}` : 'BOE!', wx(p.x), 2.8, wz(p.z), '#ff6a6a', 1.4);
      fx.particles.burst(wx(p.x), 1.0, wz(p.z), { count: 22, speed: 5, up: 1.4, life: 0.8, size: 0.35, colors: [0xffd23f, 0xffffff, g.col], gravity: 6 });
      p.c.pose = 'scared'; p.poseT = 1.3; g.mood = 1; refreshHud();
    }
    function eatGhost(p, g) {
      g.dead = 4; g.mode = 'chase'; g.g.visible = false; g.sh.visible = false; addMoney(p, 5); p.eaten += 5; p.ghostsEaten++; stats.ghostsEaten[p.i]++;
      audio.sfx('good', { vol: 0.8 }); audio.sfx('pop', { vol: 0.6 }); fx.particles.burst(wx(g.x), 0.8, wz(g.z), { count: 26, speed: 5, up: 1.2, life: 0.8, size: 0.4, colors: [0x6a8aff, 0xffffff], gravity: 4 }); fx.texts.add('SPOOK GEHAPT! +5', wx(g.x), 2.4, wz(g.z), '#9ad8ff', 1.2); refreshHud();
    }

    // ---------------- spookjes-AI ----------------
    function ghostCenter(g, e, cx, cz) {
      const opts = DIRS.filter(([dx, dz]) => !(dx === -g.dx && dz === -g.dz) && free(cx + dx, cz + dz));
      if (!opts.length) { if (free(cx - g.dx, cz - g.dz)) { g.wx = -g.dx; g.wz = -g.dz; } return; }
      let ch;
      if (g.mode === 'scared') {
        const h = pl.find((q) => q.hunter > 0) || pl[0];
        ch = Math.random() < 0.4 ? pick(opts) : opts.reduce((b, o) => ((cx + o[0] - h.x) ** 2 + (cz + o[1] - h.z) ** 2 > (cx + b[0] - h.x) ** 2 + (cz + b[1] - h.z) ** 2 ? o : b));
      } else {
        let tx, tz;
        if (G.scatter > 0) { tx = g.n ? W - 2 : 1; tz = g.n ? H - 2 : 1; }
        else {
          const cand = pl.filter((q) => q.resp <= 0); const leader = pl[0].coins === pl[1].coins ? pick(pl) : (pl[0].coins > pl[1].coins ? pl[0] : pl[1]);
          const near = cand.length ? cand.reduce((b, q) => (Math.hypot(q.x - cx, q.z - cz) < Math.hypot(b.x - cx, b.z - cz) ? q : b)) : leader;
          const tgt = g.n === 0 ? (Math.random() < 0.7 ? leader : near) : near;
          tx = tgt.x + tgt.dx * 3 * (g.n === 1 ? 0 : 1); tz = tgt.z + tgt.dz * 3 * (g.n === 1 ? 0 : 1);
          if (!G.sd && G.t < 1.5) { tx = cx + (g.n ? 5 : -5); tz = cz + 3; }
        }
        ch = Math.random() < 0.2 ? pick(opts) : opts.reduce((b, o) => ((cx + o[0] - tx) ** 2 + (cz + o[1] - tz) ** 2 < (cx + b[0] - tx) ** 2 + (cz + b[1] - tz) ** 2 ? o : b));
      }
      g.wx = ch[0]; g.wz = ch[1];
    }
    function updateGhost(g, dt) {
      if (g.dead > 0) { g.dead -= dt; if (g.dead <= 0) { g.x = maze.ghost[0]; g.z = maze.ghost[1]; g.dx = g.n ? 1 : -1; g.dz = 0; g.wait = 0.4; g.g.visible = true; g.sh.visible = true; fx.particles.burst(wx(g.x), 0.8, wz(g.z), { count: 18, speed: 3, up: 1, life: 0.6, size: 0.35, colors: [g.col, 0xffffff], gravity: 3 }); } return; }
      if (g.wait > 0) { g.wait -= dt; return; }
      g.mood = Math.max(0, g.mood - dt * 0.8);
      if (g.mode === 'scared' && !pl.some((q) => q.hunter > 0)) g.mode = 'chase';
      if (G.state !== 'play') return;
      const v = (g.mode === 'scared' ? V_GHOST * 0.65 : V_GHOST * (1 + (G.timeLeft < 30 ? 0.12 : 0))) * GSPEED;
      const total = v * dt, n = Math.max(1, Math.ceil(total / 0.2));
      for (let s = 0; s < n; s++) {
        step(g, total / n, (e, cx, cz) => ghostCenter(g, e, cx, cz));
        for (const p of pl) if (p.resp <= 0) collide(p);
      }
      if (g.dx || g.dz) g.face = Math.atan2(g.dx, g.dz);
    }

    // ---------------- evenementen ----------------
    function pickFruitType() { const tot = FRUITS.reduce((a, f) => a + f.w, 0); let r = Math.random() * tot; for (const f of FRUITS) { r -= f.w; if (r <= 0) return f; } return FRUITS[0]; }
    function spawnFruit() {
      const free2 = fruits.filter((f) => !f.on); if (free2.length < 2) return;
      const type = pickFruitType();
      for (let tries = 0; tries < 30; tries++) {
        const [x, z] = pick(maze.cells); if (x >= 10 || special[idx(x, z)] || (x < 2) || pl.some((p) => Math.hypot(p.x - x, p.z - z) < 3 || Math.hypot(p.x - (W - 1 - x), p.z - z) < 3)) continue;
        for (const [fx2, f] of [[x, free2[0]], [W - 1 - x, free2[1]]]) { f.on = true; f.x = fx2; f.z = z; f.t = 0; f.type = type; f.g.visible = true; f.g.position.set(wx(fx2), 0, wz(z)); f.g.userData.kers.visible = type.id === 'kers'; f.g.userData.druif.visible = type.id === 'druif'; f.g.userData.ster.visible = type.id === 'ster'; f.g.userData.halo.visible = type.id === 'ster'; fx.particles.burst(wx(fx2), 0.8, wz(z), { count: 16, speed: 3, up: 1.2, life: 0.6, size: 0.35, colors: [0xffffff, 0xffd23f], gravity: 3 }); }
        audio.sfx('sparkle', { vol: 0.5 }); hud.toast(`Fruit! ${type.name} (+${type.pts}) ligt aan allebei de kanten`, 1800);
        return;
      }
    }
    function startDoorEvent() {
      const toOpen = gateOpen[4] ? 10 : 4, toClose = toOpen === 4 ? 10 : 4;
      G.doorEvents++;
      if (!deurman) { deurman = makeDeurman(0.8); deurman.group.visible = false; scene.add(deurman.group);
        const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), color: 0xd9a8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); hl.scale.set(5, 5, 1); hl.position.y = 1.2; deurman.group.add(hl); }
      G.deur = { t: 0, open: toOpen, close: toClose, done: false, side: Math.random() < 0.5 ? 0 : 1 };
      deurman.group.visible = true; deurman.group.position.set(wx(G.deur.side ? W - 1 : 0), WALL_H, wz(toOpen - 1)); deurman.faceDir(G.deur.side ? -0.4 : 0.4, 1); deurman.group.scale.setScalar(0.01);
      audio.sfx('creak', { vol: 0.7 }); audio.sfx('knock', { vol: 0.4 });
      hud.toast(`De Deurman gaat aan de deurknop... de ${toOpen === 4 ? 'bovenste' : 'onderste'} tunnel gaat open!`, 2200);
    }
    function updateDeur(dt) {
      const d = G.deur; if (!d) return;
      d.t += dt; deurman.group.scale.setScalar(clamp(d.t * 3, 0.01, 1) * (d.t > 3.2 ? Math.max(0.01, 1 - (d.t - 3.2) * 4) : 1)); deurman.speed = 0.2; deurman.update(dt);
      if (!d.done && d.t > 1.2) {
        d.done = true; gateOpen[d.open] = true; Wd.setGate(d.open, true); gateWantClose[d.close] = true;
        audio.sfx('door', { vol: 0.8 }); ctx.shake(0.3);
        for (const side of [0, 1]) { const gx = side ? W - 1 : 0; fx.particles.burst(wx(gx), 0.8, wz(d.open), { count: 24, speed: 4, up: 1, life: 0.8, size: 0.4, colors: [0xd9a8ff, 0x7ae8ff, 0xffffff], gravity: 2 }); fx.texts.add('TUNNEL OPEN!', wx(gx) * 0.6, 2.4, wz(d.open), '#d9a8ff', 1.1); }
      }
      if (d.t > 3.6) { deurman.group.visible = false; G.deur = null; }
    }
    function updateGates(dt) {
      for (const row of TUNNEL_ROWS) {
        if (gateWantClose[row] && gateOpen[row]) {
          const busy = entityNearRow(row);
          if (!busy) { gateOpen[row] = false; gateWantClose[row] = false; Wd.setGate(row, false); audio.sfx('slam', { vol: 0.5 }); for (const side of [0, 1]) fx.particles.burst(wx(side ? W - 1 : 0), 0.7, wz(row), { count: 14, speed: 3, up: 0.8, life: 0.6, size: 0.4, colors: [0xc89a6a, 0xffffff], gravity: 5 }); }
        }
      }
    }
    function entityNearRow(row) {
      for (const e of [...pl, ...ghosts]) { if ((e.resp || 0) > 0 || (e.dead || 0) > 0) continue; if (Math.abs(e.z - row) < 0.7 && (e.x < 1.6 || e.x > W - 2.6)) return true; }
      return false;
    }

    // ---------------- einde / sudden death ----------------
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const a = pl[0].coins, b = pl[1].coins;
      const jokes = winner == null ? ['Precies gelijk! De spookjes weten niet wie ze moeten uitlachen.'] : [`${names[winner]} is de Spook-Koning${''}! ${names[1 - winner]} ziet nog steeds sterretjes.`, `${names[winner]} smulde het doolhof leeg. ${names[1 - winner]} zoekt zijn munten nog.`, `De spookjes joelen voor ${names[winner]}. ${names[1 - winner]} heeft het nakijken.`];
      const extra = [];
      if (stats.steals[0] + stats.steals[1]) extra.push(`Er werd ${stats.steals[0] + stats.steals[1]}x gestolen`);
      if (stats.ghostHits[0] + stats.ghostHits[1]) extra.push(`de spookjes pakten ${stats.ghostHits[0] + stats.ghostHits[1]}x munten af`);
      ctx.finishPvp({ winner, score: [a, b], delay: 800, summary: `${pick(jokes)}${G.sdWon ? ' Beslist met de gouden munt!' : ''}${G.coinFlip ? ' (Even zonder gouden munt... het muntje beslist.)' : ''}${extra.length ? ' ' + extra.join(', ') + '.' : ''}` });
    }
    function endMatch(winner) {
      G.state = 'end'; G.t = 0; G.winner = winner; hud.setTimer(null);
      if (winner != null) { pl[winner].c.pose = 'cheer'; pl[1 - winner].c.pose = 'sad'; hud.showBig(`${names[winner]} WINT!`, 1500, winner ? '#8fb8ff' : '#7dffb0'); audio.sfx('bell', { vol: 0.9 }); }
      else hud.showBig('GELIJKSPEL!', 1400, '#ffd23f');
      for (const p of pl) { p.poseT = 99; }
    }
    function startSudden() {
      G.sd = true; G.state = 'suddenIntro'; G.t = 0; G.sdT = 0; G.double = false;
      for (const [x, z] of coinCells) setCoin(x, z, false); for (const o of orbs) { o.on = false; o.g.visible = false; } for (const f of fruits) { f.on = false; f.g.visible = false; }
      for (let k = 0; k < W * H; k++) blk[k] = 0; for (const b of blocks) { b.cell = null; b.m.visible = false; }
      for (const g of ghosts) { g.dead = 999; g.g.visible = false; g.sh.visible = false; }
      for (const p of pl) { p.hunter = 0; p.stun = 0; p.resp = 0; p.inv = 0; respawn(p); p.inv = 0; p.holder.visible = true; p.c.pose = 'idle'; }
      G.goldTaker = null; gold.position.set(wx(G.goldCell[0]), 0, wz(G.goldCell[1])); gold.visible = true;
      hud.showBig('GOUDEN MUNT!', 1600, '#ffd23f'); hud.toast('Gelijkspel! Wie pakt als eerste de gouden munt?', 2600); audio.sfx('bell', { vol: 0.9 }); refreshHud();
    }

    // ---------------- hoofd-update ----------------
    let lastTimeRefresh = -1;
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt; G.t += dt;
      if (!started) { started = true; G.state = 'play'; G.t = 0; fillCoins(false); refreshHud(); }
      if (T > 220 && !finished && G.state !== 'end') endMatch(pl[0].coins === pl[1].coins ? Math.floor(Math.random() * 2) : (pl[0].coins > pl[1].coins ? 0 : 1));
      for (const p of pl) if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0 && G.state !== 'end') p.c.pose = 'idle'; }

      if (G.state === 'play') {
        G.timeLeft -= dt; hud.setTimer(G.timeLeft, 15);
        if (Math.floor(G.timeLeft) !== lastTimeRefresh) lastTimeRefresh = Math.floor(G.timeLeft);
        if (!G.double && G.timeLeft < 15) { G.double = true; hud.showBig('DUBBELE MUNTEN!', 1500, '#ffd23f'); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('bell', { vol: 0.5 }); for (const o of orbs) if (!o.on) o.t = Math.min(o.t, 1); }
        G.nextFruit -= dt; if (G.nextFruit <= 0) { G.nextFruit = rand(9, 12); spawnFruit(); }
        G.nextGate -= dt; if (G.nextGate <= 0 && !G.deur) { G.nextGate = rand(13, 17); startDoorEvent(); }
        G.scatterIn -= dt; if (G.scatterIn <= 0) { G.scatter = 4; G.scatterIn = rand(17, 22); } if (G.scatter > 0) G.scatter -= dt;
        if (G.timeLeft <= 0) {
          G.timeLeft = 0; hud.setTimer(0);
          audio.sfx('bell', { vol: 1 });
          if (pl[0].coins !== pl[1].coins) endMatch(pl[0].coins > pl[1].coins ? 0 : 1); else startSudden();
        }
      } else if (G.state === 'suddenIntro') {
        if (G.t > 1.6) { G.state = 'sudden'; G.t = 0; audio.sfx('go', { vol: 0.5 }); }
      } else if (G.state === 'sudden') {
        G.sdT += dt; hud.setTimer(Math.max(0, SD_MAX - G.sdT), 8);
        if (G.goldTaker != null) { const w = G.goldTaker; G.sdWon = true; fx.particles.burst(wx(G.goldCell[0]), 1, wz(G.goldCell[1]), { count: 50, speed: 7, up: 1.3, life: 1.2, size: 0.5, colors: [0xffd23f, 0xffffff, 0xff7ad8], gravity: 5 }); gold.visible = false; addMoney(pl[w], 1); refreshHud(); audio.sfx('win', { vol: 0.6 }); endMatch(w); }
        else if (G.sdT > SD_MAX) { const a = pl[0].eaten, b = pl[1].eaten; G.coinFlip = true; endMatch(a === b ? Math.floor(Math.random() * 2) : (a > b ? 0 : 1)); }
      }
      if (G.state === 'end') { if (G.t > (G.winner == null ? 1.6 : 2.4) && !finished) finishMatch(G.winner); }

      const running = G.state === 'play' || G.state === 'sudden';
      if (running || G.state === 'suddenIntro') {
        for (const p of pl) updatePlayer(p, dt);
        if (G.state !== 'suddenIntro') for (const g of ghosts) updateGhost(g, dt);
        // blokken
        for (const b of blocks) if (b.cell) { b.t -= dt; const i = idx(b.cell[0], b.cell[1]); blk[i] = b.t; if (b.t <= 0) { blk[i] = 0; b.cell = null; b.m.visible = false; fx.particles.burst(b.m.position.x, 0.6, b.m.position.z, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffffff, 0xc8f0ff], gravity: 6 }); audio.sfx('pop', { vol: 0.4, rate: 1.3 }); } }
        // krachtbollen herstellen
        if (G.state === 'play') for (const o of orbs) if (!o.on) { o.t -= dt; if (o.t <= 0 && !pl.some((p) => Math.round(p.x) === o.x && Math.round(p.z) === o.z)) { o.on = true; o.g.visible = true; fx.particles.burst(wx(o.x), 0.8, wz(o.z), { count: 14, speed: 3, up: 1, life: 0.6, size: 0.35, colors: [0xff5ad8, 0xffffff], gravity: 3 }); } }
        for (const f of fruits) if (f.on) { f.t += dt; if (f.t > 11) { f.on = false; f.g.visible = false; fx.particles.burst(f.g.position.x, 0.6, f.g.position.z, { count: 8, speed: 2, up: 1, life: 0.4, size: 0.3, colors: [0xffffff], gravity: 3 }); } }
        updateDeur(dt); updateGates(dt);
      }
      visuals(dt);
    }

    // ---------------- beeld ----------------
    const camLook = new THREE.Vector3(), camPos = new THREE.Vector3();
    let fitAsp = 0, fitDist = 40; const fitV = new THREE.Vector3();
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, pitch = THREE.MathUtils.degToRad(66);
      const PW = W * CELL, PH = H * CELL;
      const sway = Math.sin((T + introT) * 0.22) * 0.5;
      // zoek de kleinste afstand waarbij het hele platform in beeld past (bovenin blijft ruimte voor de HUD)
      if (fitAsp !== asp) {
        fitAsp = asp; let lo = 20, hi = 90;
        for (let k = 0; k < 14; k++) {
          const d = (lo + hi) / 2; camLook.set(0, 0, -PH * 0.07); camPos.set(0, Math.sin(pitch) * d, camLook.z + Math.cos(pitch) * d);
          camera.position.copy(camPos); camera.lookAt(camLook); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
          let ok = true;
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { fitV.set(sx * (PW / 2 + 0.5), 0.4, sz * (PH / 2 + 0.5)).project(camera); if (Math.abs(fitV.x) > 0.97 || fitV.y > 0.74 || fitV.y < -0.97) ok = false; }
          if (ok) hi = d; else lo = d;
        }
        fitDist = hi * 1.0;
      }
      camLook.set(sway * 0.3, 0, -PH * 0.07);
      camPos.set(camLook.x + sway, Math.sin(pitch) * fitDist, camLook.z + Math.cos(pitch) * fitDist);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }
    function visuals(dt) {
      const tt = T + introT;
      drawCoins(tt, dt);
      for (const o of orbs) if (o.on) { o.core.position.y = 0.8 + Math.sin(tt * 4 + o.x) * 0.12 + (GRAV < 1 ? 0.2 : 0); o.core.scale.setScalar(1 + Math.sin(tt * 6) * 0.08); o.ring.scale.setScalar(1 + Math.sin(tt * 4) * 0.12); o.ring.material.opacity = 0.55 + Math.sin(tt * 5) * 0.25; }
      for (const f of fruits) if (f.on) { f.g.rotation.y += dt * 2.2; f.g.position.y = 0.2 + Math.sin(tt * 3 + f.x) * 0.1; const lt = 11 - f.t; f.g.visible = lt > 2.5 || Math.sin(lt * 18) > 0; f.g.userData.halo.scale.setScalar(1 + Math.sin(tt * 5) * 0.1); }
      if (gold.visible) { gold.rotation.y += dt * 3; gold.position.y = Math.sin(tt * 4) * 0.15; gold.userData.hl.material.opacity = 0.5 + Math.sin(tt * 6) * 0.3; }
      for (const b of blocks) if (b.cell) { const k = Math.min(1, b.t > BLOCK_T - 0.3 ? (BLOCK_T - b.t) / 0.3 : 1); const wob = 1 + Math.sin(tt * 9) * 0.04; b.m.scale.set(k * wob, k * (1 / wob), k * wob); b.m.position.y = 0.5 * k; b.m.visible = b.t > 1.4 || Math.sin(b.t * 20) > 0; }
      // spelers
      for (const p of pl) {
        const c = p.c, h = p.holder; const px = wx(p.x), pz = wz(p.z);
        p.hop = GRAV < 1 ? Math.abs(Math.sin(tt * 5 + p.i)) * 0.7 * (p.moving ? 1 : 0.4) : 0;
        h.position.set(px, p.hop, pz);
        const sc = p.k * sizeScale(p.i) * (1 + (p.hunter > 0 ? 0.14 + Math.sin(tt * 10) * 0.03 : 0) + p.pulse * 0.1);
        h.scale.setScalar(sc);
        if (p.dx || p.dz) c.faceDir(p.dx, p.dz);
        c.speed = p.stun > 0 || G.state === 'end' ? 0 : (p.moving ? (p.sprint > 0 ? 1 : 0.7) : 0);
        c.air = GRAV < 1 && p.hop > 0.3;
        if (G.state !== 'end' && p.poseT <= 0) c.pose = p.hunter > 0 ? 'push' : p.stun > 0 ? 'scared' : (pl[1 - p.i].hunter > 0 && p.resp <= 0 ? 'scared' : 'idle');
        c.update(dt);
        if (p.inv > 0 && p.resp <= 0) h.visible = Math.sin(tt * 40) > -0.3; else if (p.resp <= 0) h.visible = true;
        p.tag.position.set(px, 3.5 * sizeScale(p.i) + p.hop, pz + 0.3); p.ring.position.set(px, 0.07, pz); p.ring.scale.setScalar(sizeScale(p.i)); p.ring.visible = p.resp <= 0 && h.visible; p.tag.visible = h.visible && p.resp <= 0;
        p.shadow.position.set(px, 0.04, pz); p.shadow.scale.setScalar(sizeScale(p.i) * (1 - Math.min(0.4, p.hop * 0.3))); p.shadow.visible = p.resp <= 0;
        p.aura.visible = p.hunter > 0 && p.resp <= 0;
        if (p.aura.visible) { p.aura.position.set(px, 0.08, pz); p.aura.scale.setScalar(sizeScale(p.i) * (1 + Math.sin(tt * 9) * 0.12)); p.aura.material.color.setHex(p.hunter < 2 && Math.sin(tt * 24) > 0 ? 0xffffff : 0xff3a2a); if (Math.random() < dt * 30) fx.particles.emit(px + (Math.random() - 0.5) * 0.8, 0.3, pz + (Math.random() - 0.5) * 0.8, 0, 1.6, 0, { life: 0.5, size: 0.4, color: Math.random() < 0.5 ? 0xff5a2a : 0xffd23f, gravity: -2 }); }
        // HUD-tekst
        const txt = p.hunter > 0 ? `${p.coins} munten · JAGER ${p.hunter.toFixed(1)}s` : p.stun > 0 ? `${p.coins} munten · Verdoofd!` : `${p.coins} munten · A ${p.sprintCd > 0 ? p.sprintCd.toFixed(1) : '✔'} B ${p.bombCd > 0 ? p.bombCd.toFixed(1) : '✔'}`;
        if (txt !== p.txt) { p.txt = txt; hud.setPlayerInfo(p.i, txt); }
      }
      // spookjes
      for (const g of ghosts) {
        const u = g.g.userData; const sc = 1 + (g.mood > 0 ? Math.sin(tt * 30) * 0.05 : 0);
        g.g.position.set(wx(g.x), 0.15 + Math.sin(tt * 5 + g.n * 2) * 0.1 + (GRAV < 1 ? 0.3 : 0), wz(g.z)); g.g.rotation.y = damp(g.g.rotation.y, g.face, 14, dt); g.g.scale.setScalar(sc * 1.15);
        g.sh.position.set(wx(g.x), 0.04, wz(g.z));
        const scared = g.mode === 'scared'; const hl = Math.max(0, ...pl.map((q) => q.hunter)); const flash = scared && hl < 2 && Math.sin(tt * 20) > 0;
        const col = scared ? (flash ? 0xffffff : 0x3a56ff) : g.col; u.bm.color.setHex(col); u.bm.emissive.setHex(col); u.dbl.color.setHex(col); u.dbl.emissive.setHex(col);
        u.mouth.visible = scared; u.pupils.forEach((q) => { q.visible = !scared; });
        u.feet.forEach((f, k) => { f.position.y = 0.06 + Math.abs(Math.sin(tt * 8 + k)) * 0.08; });
        g.g.visible = g.dead <= 0; g.sh.visible = g.g.visible;
      }
      Wd.update(tt, dt);
      updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; for (const p of pl) p.c.update(dt); Wd.update(T + introT, dt); drawCoins(T + introT, dt); updateCamera(dt); }
    function introUpdate(dt) {
      introT += dt;
      for (const p of pl) { p.c.pose = 'idle'; p.poseT = 0; }
      visuals(dt);
    }
    // alvast alle munten tonen zodat de intro mooi is
    fillCoins(false); coinCells.forEach(([x, z]) => { coinPop[idx(x, z)] = 1; });
    refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(wx(p.x), 1, wz(p.z), { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m) return; const p = pl[i]; const lose = Math.min(p.coins, 3); p.coins -= lose; if (lose) scatter(p, lose); p.stun = Math.max(p.stun, 1.0); fx.texts.add(lose ? `DEURMAN! -${lose}` : 'DEURMAN!', wx(p.x), 3.0, wz(p.z), '#ff9a9a', 1.3); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); }); refreshHud();
      },
      celebrate(w) { pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; for (const p of pl) p.poseT = 99; },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, timeLeft: G.timeLeft, sd: G.sd, finished, double: G.double, coinsLeft, refills: G.refills, doorEvents: G.doorEvents, gates: { ...gateOpen }, scatter: G.scatter,
          pl: pl.map((p) => ({ x: p.x, z: p.z, dx: p.dx, dz: p.dz, coins: p.coins, eaten: p.eaten, hunter: p.hunter, stun: p.stun, inv: p.inv, resp: p.resp, sprint: p.sprint, sprintCd: p.sprintCd, bombCd: p.bombCd, steals: p.steals, hits: p.hits, fruit: p.fruit, ghostsEaten: p.ghostsEaten })),
          ghosts: ghosts.map((g) => ({ x: g.x, z: g.z, mode: g.mode, dead: g.dead, wait: g.wait })), orbs: orbs.map((o) => ({ x: o.x, z: o.z, on: o.on })), fruits: fruits.filter((f) => f.on).map((f) => ({ x: f.x, z: f.z, id: f.type.id })),
          blocks: blocks.map((b) => b.cell), stats, gold: gold.visible ? G.goldCell : null }),
        maze, free, coin, setCoins: (a, b) => { pl[0].coins = a; pl[1].coins = b; refreshHud(); },
        giveOrb: (i) => takeOrb(pl[i], orbs[0]), setTime: (t) => { G.timeLeft = t; }, spawnFruit, startDoorEvent,
        teleport: (i, x, z) => { const p = pl[i]; p.x = x; p.z = z; p.dx = p.dz = 0; p.curC = [x, z]; p.prevC = null; },
        hitGhost: (i) => ghostHit(pl[i], ghosts[0]), pl, ghosts, steal: (a, b) => steal(pl[a], pl[b]), regen: munteRegen,
      },
    };
  },
};

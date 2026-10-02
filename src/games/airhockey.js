import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildArena, TB } from './airhockey_world.js';

// IJshockey-Chaos — duel: air-hockey op een enorme ijstafel in een kristalgrot. Eerste tot 5 goals of 90 s.
//  * richtingen = slagschijf (binnen je eigen helft), B = smash (ingedrukt houden = laden, loslaten = slaan)
//  * chaos: ijsbloemen met power-ups, een draak en een pinguïn die extra pucks schieten, opduikende bumpers
//  * comeback: wie 2 of meer achter staat krijgt een gouden (grotere) schijf

const { LX, LZ, SD } = TB;
const PR = 0.85;                // puck-straal
const RP = 1.5;                 // schijf-straal
const VMAX = 17;                // schijfsnelheid
const WIN_GOALS = 5, MATCH_TIME = 90, OT_MAX = 30;
const GH0 = TB.GH;
const POST_R = 0.25;
const GH_SMALL = 2.4;

const FLOWERS = [
  { id: 'multi', w: 22, name: 'TWEEDE PUCK!', col: '#ffe14a' },
  { id: 'giant', w: 20, name: 'REUZENPUCK!', col: '#ff9a3a' },
  { id: 'shrink', w: 20, name: 'KLEIN DOEL!', col: '#6fe8ff' },
  { id: 'sticky', w: 18, name: 'PLAKPUCK!', col: '#8dff6a' },
  { id: 'ghost', w: 20, name: 'SPOOKPUCK!', col: '#d9a8ff' },
];

function makeFlower() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbff4ff, emissiveIntensity: 1.0 }), { cast: false, pos: [0, 1.0, 0] }));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.add(mesh(new THREE.ConeGeometry(0.2, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0xcff6ff, emissive: 0x3aa6d8, emissiveIntensity: 0.9, flatShading: true, transparent: true, opacity: 0.95 }), { cast: false, pos: [Math.cos(a) * 0.52, 1.0, Math.sin(a) * 0.52], rot: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] })); }
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 5), mat(0x4aa86a), { cast: false, pos: [0, 0.45, 0] }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 28), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; g.add(halo);
  g.userData.halo = halo;
  return g;
}
function makeBumper() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x9fe0ff, emissive: 0x2a8ad8, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.94, flatShading: true }), { pos: [0, 0.45, 0] }));
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.add(mesh(new THREE.ConeGeometry(0.25, 1.0 + (k % 2) * 0.5, 5), new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x58c8ff, emissiveIntensity: 0.9, flatShading: true }), { cast: false, pos: [Math.cos(a) * 0.45, 1.2, Math.sin(a) * 0.45], rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] })); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 24), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  g.userData.ring = ring;
  return g;
}

export default {
  id: 'airhockey',
  name: 'IJshockey-Chaos',
  giver: 'IJskoningin Ina',
  icon: '🏒',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Air-hockey op een <b>enorme ijstafel</b> in een kristalgrot! Sla de puck in het doel van je broer. Eerste tot <b>5 goals</b> (of de meeste na 90 seconden). Pak <b>ijsbloemen</b> voor gekke power-ups, pas op voor de <b>draak en de pinguïn</b> die extra pucks schieten, en wie 2 achterstaat krijgt een <b>gouden schijf</b>!',
  controls: ['{move} beweeg je schijf (alleen in je eigen helft)', '{b} SMASH: ingedrukt houden = laden, loslaten = hard slaan'],
  tip: 'Een lange laadtijd geeft een keiharde smash, maar daarna moet je even wachten. Slaan met een korte tik is sneller maar zwakker.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = ctx.twist.speed && (tw === 'turbo' || tw === 'slowmo') ? ctx.twist.speed : 1;
    const PHYS_T = 1 + (TEMPO - 1) * 0.5;                 // puck-tempo
    const PUCK_MUL = (GRAV < 1 ? 0.8 : 1);                // maanzwaartekracht: trager
    const MAXV = 38 * PUCK_MUL * (TEMPO > 1 ? 1.1 : 1);

    const L = ctx.lights('cave', { shadow: 24, center: [0, 0, 0], fogNear: 48, fogFar: 130 });
    L.hemi.intensity = 1.3; L.hemi.color.set(0x9ec4ff); L.hemi.groundColor.set(0x3a3a80);
    L.sun.color.set(0xd6e6ff); L.sun.intensity = 1.5; L.sun.position.set(-8, 30, 16);
    camera.fov = 48; camera.updateProjectionMatrix();
    const colorsCss = ['rgba(60,200,120,1)', 'rgba(70,140,255,1)'];
    const A = buildArena(ctx, L, colorsCss);

    // ---------------- puck-pool ----------------
    const pucks = [];
    const puckMats = { ice: [0x1c2c5c, 0x58d6ff], fire: [0x4a1608, 0xff7a1a], pen: [0x203040, 0xffe14a], main: [0x1c2c5c, 0x58d6ff] };
    for (let k = 0; k < 6; k++) {
      const g = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(1, 1, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x1c2c5c, roughness: 0.35, metalness: 0.3 }), { pos: [0, 0.2, 0] });
      const rim = mesh(new THREE.TorusGeometry(0.98, 0.1, 6, 24), new THREE.MeshStandardMaterial({ color: 0x58d6ff, emissive: 0x58d6ff, emissiveIntensity: 0.9 }), { cast: false, pos: [0, 0.34, 0], rot: [Math.PI / 2, 0, 0] });
      const top = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xcfeaff, emissive: 0x58a8e8, emissiveIntensity: 0.5 }), { cast: false, pos: [0, 0.41, 0] });
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 24), new THREE.MeshBasicMaterial({ color: 0x58d6ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04;
      const shadow = P.shadowBlob(1.4);
      g.add(body, rim, top, glow); g.visible = false; scene.add(g); scene.add(shadow); shadow.visible = false;
      pucks.push({ on: false, g, body, rim, glow, shadow, x: 0, z: 0, vx: 0, vz: 0, y: 0, r: PR, kind: 'main', life: 0, stuck: -1, stuckT: 0, lastHit: -1, ph: Math.random() * 6, falling: false, fy: 0, fvy: 0, vis: 1, stall: 0, trailT: 0 });
    }
    function setKind(q, kind) { q.kind = kind; const [c, e] = puckMats[kind] || puckMats.ice; q.body.material.color.set(c); q.rim.material.color.set(e); q.rim.material.emissive.set(e); q.glow.material.color.set(e); }

    // ---------------- schijven ----------------
    const pads = players.map((pp, i) => {
      const colr = PLAYER_COLORS[i]; const dir = i ? -1 : 1;
      const g = new THREE.Group();
      const baseM = new THREE.MeshStandardMaterial({ color: colr, roughness: 0.3, metalness: 0.35 });
      const goldM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.25, metalness: 0.85, emissive: 0xff9a10, emissiveIntensity: 0.35 });
      const base = mesh(new THREE.CylinderGeometry(1, 1.06, 0.42, 28), baseM, { pos: [0, 0.21, 0] });
      const topRing = mesh(new THREE.TorusGeometry(0.88, 0.09, 6, 26), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4 }), { cast: false, pos: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0] });
      const knob = new THREE.Group(); knob.position.y = 0.42; g.add(knob);
      const stem = mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.5, 14), baseM, { pos: [0, 0.25, 0] });
      const ball = mesh(new THREE.SphereGeometry(0.42, 14, 10), baseM, { pos: [0, 0.65, 0] });
      knob.add(stem, ball);
      g.add(base, topRing);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.32, 32), new THREE.MeshBasicMaterial({ color: 0x9fffb0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      const shadow = P.shadowBlob(1.5);
      scene.add(g, ring, shadow);
      const tagTex = canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(10,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(pp.name, w / 2, hh / 2); c.fillStyle = pp.css; c.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.6, 0.97, 1); tag.renderOrder = 15; scene.add(tag);
      // het poppetje achter het doel
      const c = makeBrother(i); const kS = 3.3 / c.height; const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(kS); holder.position.set(dir * -(LX + SD + 0.9), 0.05, 0); scene.add(holder);
      c.faceDir(dir, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const stand = mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 14), mat(0x6a7ab8), { cast: false, pos: [dir * -(LX + SD + 0.9), -0.1, 0] }); scene.add(stand);
      const R = RP * lerp(1, pv.size(i), 0.8);
      return { i, dir, g, baseM, goldM, base, stem, ball, ring, shadow, tag, c, holder, R, R0: R, Rcur: R,
        x: dir * -(LX * 0.55), z: 0, vx: 0, vz: 0, tvx: 0, tvz: 0, state: 'idle', chargeT: 0, lt: 0, ldx: dir, ldz: 0, lpow: 0, cd: 0, grace: 0, frozen: 0, golden: false, hits: 0, smashes: 0, pressure: 0, sc: 1, hitPuck: false };
    });
    pads.forEach((p) => { p.g.position.set(p.x, 0, p.z); });

    // ---------------- toestand ----------------
    const score = [0, 0];
    let T = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0;
    const G = { state: 'init', t: 0, timeLeft: MATCH_TIME, ot: false, otLeft: OT_MAX, serveTo: 1, scorer: -1, end: false, winner: -1, camPunch: 0, lastScorerSide: 0, confettiT: 0 };
    const FX = { giant: 0, sticky: 0, ghost: 0, shrink: [0, 0] };
    const gh = [GH0, GH0];            // actuele halve doelopening per kant (0 = linker doel van Wes, 1 = rechter doel van Jor)
    let flower = null; let flowerT = 6, flowerMesh = makeFlower(); flowerMesh.visible = false; scene.add(flowerMesh);
    const bumpers = []; let bumperT = 12;
    const bumperPool = Array.from({ length: 3 }, () => { const m = makeBumper(); m.visible = false; scene.add(m); return { m, on: false, x: 0, z: 0, t: 0, life: 0, hit: 0 }; });
    let eventT = 13, eventAlt = Math.random() < 0.5; let stallT = 0;
    const stats = { smashes: [0, 0], flowers: 0, events: 0, bumpers: 0 };
    // ijsblokken die een krimpend doel dichtmaken
    const blocks = [0, 1].map((side) => [-1, 1].map((sz) => { const m = mesh(new THREE.BoxGeometry(1.0, 1.5, 1), new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x3a9ad8, emissiveIntensity: 0.4, roughness: 0.2, transparent: true, opacity: 0.93, flatShading: true }), { pos: [(side ? 1 : -1) * LX, 0.75, 0] }); m.visible = false; scene.add(m); return m; }));

    const lead = (i) => score[1 - i] - score[i];     // >0: i staat achter
    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${G.ot ? '  (GOUDEN GOAL)' : ''}`);
      hud.setPlayerInfo(0, `Goals: ${score[0]}`); hud.setPlayerInfo(1, `Goals: ${score[1]}`);
      A.scoreboard(names, score, G.ot ? G.otLeft : G.timeLeft, G.ot ? 'GOUDEN GOAL' : null);
    }

    // ---------------- puck helpers ----------------
    function allocPuck() { return pucks.find((q) => !q.on); }
    function spawnPuck(x, z, vx, vz, kind = 'ice', life = 14) {
      const q = allocPuck(); if (!q) return null;
      q.on = true; q.x = x; q.z = z; q.vx = vx; q.vz = vz; q.kind = kind; q.life = life; q.stuck = -1; q.lastHit = -1; q.falling = false; q.r = FX.giant > 0 ? PR * 1.6 : PR; q.vis = 1; q.stall = 0;
      setKind(q, kind); q.g.visible = true; q.shadow.visible = true;
      fx.particles.burst(x, 0.4, z, { count: 14, speed: 4, up: 1.2, life: 0.6, size: 0.3, colors: [0xffffff, 0x9fe8ff], gravity: 8 });
      return q;
    }
    function killPuck(q, poof = true) {
      if (!q.on) return; q.on = false; q.g.visible = false; q.shadow.visible = false; q.stuck = -1;
      if (poof) fx.particles.burst(q.x, 0.5, q.z, { count: 16, speed: 4, up: 1.4, life: 0.7, size: 0.3, colors: [0xffffff, 0x9fe8ff, 0xffd86b], gravity: 6 });
    }
    function clearPucks(exceptQ) { for (const q of pucks) if (q !== exceptQ) killPuck(q); }
    const activePucks = () => pucks.filter((q) => q.on);

    function servePuck(toward) {
      // een puck valt vanuit de lucht in het midden
      clearPucks(null);
      const q = spawnPuck(0, 0, 0, 0, 'main', 9999); if (!q) return;
      q.falling = true; q.fy = 7; q.fvy = 0; q.life = 9999; q.serveDir = toward; q.vx = q.vz = 0;
      G.state = 'serve'; G.t = 0; refreshHud();
    }

    // ---------------- start / flow ----------------
    function startMatch() {
      started = true; G.state = 'serve'; G.t = 0; G.timeLeft = MATCH_TIME;
      score[0] = score[1] = 0; refreshHud();
      servePuck(Math.random() < 0.5 ? 0 : 1);
    }
    function applyGolden() {
      for (const p of pads) {
        const want = lead(p.i) >= 2;
        if (want !== p.golden) {
          p.golden = want;
          p.base.material = want ? p.goldM : p.baseM; p.stem.material = p.ball.material = want ? p.goldM : p.baseM;
          if (want) { fx.texts.add('GOUDEN SCHIJF!', p.x, 3.4, p.z, '#ffd23f', 1.6); hud.toast(`✨ ${names[p.i]} krijgt een gouden schijf!`, 2000); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('sparkle', { vol: 0.6 }); fx.particles.burst(p.x, 0.8, p.z, { count: 40, speed: 6, up: 1.5, life: 1.0, size: 0.4, colors: [0xffd23f, 0xffffff, 0xffa020], gravity: 4 }); }
          else fx.particles.burst(p.x, 0.8, p.z, { count: 16, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0xffd23f], gravity: 4 });
        }
      }
    }
    function goal(q, scorer) {
      const side = scorer === 0 ? 1 : 0;        // doel waar de puck inging (0 = links, 1 = rechts)
      score[scorer]++; G.state = 'goal'; G.t = 0; G.scorer = scorer; G.lastScorerSide = side; slow = 0.22; slowHold = 0.9; G.camPunch = 1;
      G.end = score[scorer] >= WIN_GOALS || G.ot;
      clearPucks(q); q.stuck = -1;
      refreshHud();
      const col = scorer ? '#8fb8ff' : '#7dffb0';
      hud.showBig(G.end ? `${names[scorer]} WINT!` : 'GOAAAL!', 1500, col);
      audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.5 }); audio.sfx('explode', { vol: 0.3 }); ctx.shake(0.85);
      A.cheer(3.2); A.goalFlash(side);
      const gx = (side ? 1 : -1) * (LX + 1.2);
      fx.particles.burst(gx, 1.4, 0, { count: 70, speed: 9, up: 1.2, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
      fx.particles.ring(gx, 1, 0, { count: 30, speed: 8, color: scorer ? 0x8fb8ff : 0x7dffb0, size: 0.4, life: 0.8 });
      fx.texts.add('GOAL!', gx * 0.8, 4.5, 0, col, 2.0);
      pads[scorer].c.pose = 'cheer'; pads[1 - scorer].c.pose = 'sad';
      applyGolden();
    }
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const jokes = winner == null ? ['Gelijkspel! Niemand wil verliezen, dus de pinguïns delen de taart.', 'Precies gelijk. De yeti krabt zich verbaasd op zijn hoofd.']
        : [`${names[winner]} is de nieuwe IJskoning${''}! ${names[1 - winner]} glijdt nog steeds uit.`, `${names[winner]} smash de puck als een echte ijsberserker. ${names[1 - winner]} zoekt de puck nog.`, `Het hele ijspubliek joelt voor ${names[winner]}. ${names[1 - winner]} heeft koude voeten.`, `${names[winner]} wint dit ijsgevecht! De draak is onder de indruk.`];
      ctx.finishPvp({ winner, score: [score[0], score[1]], delay: 800, summary: `${pick(jokes)}${G.tiebreak ? ' Na de verlenging besliste het veldoverwicht (wie de puck het langst bij de ander hield).' : ''}${stats.flowers ? ` Er werden ${stats.flowers} ijsbloemen geplukt.` : ''}` });
    }
    function endMatch(winner) {
      G.state = 'end'; G.t = 0; G.winner = winner; slow = 1;
      if (winner != null) { pads[winner].c.pose = 'cheer'; pads[1 - winner].c.pose = 'sad'; A.cheer(5); }
      hud.setTimer(null);
      if (winner == null) hud.showBig('GELIJKSPEL!', 1400, '#ffd23f');
    }

    // ---------------- power-ups ----------------
    function pickFlowerType() { const tot = FLOWERS.reduce((a, f) => a + f.w, 0); let r = Math.random() * tot; for (const f of FLOWERS) { r -= f.w; if (r <= 0) return f; } return FLOWERS[0]; }
    function spawnFlower() {
      const trailing = score[0] === score[1] ? -1 : (score[0] < score[1] ? 0 : 1);
      const side = trailing >= 0 && Math.random() < 0.65 ? (trailing === 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      const type = pickFlowerType();
      flower = { x: side * rand(3.5, LX - 4), z: rand(-LZ + 2.2, LZ - 2.2), t: 0, life: 10, type };
      flowerMesh.visible = true; flowerMesh.position.set(flower.x, 0, flower.z);
      fx.particles.ring(flower.x, 0.4, flower.z, { count: 18, speed: 3, color: 0x9fe8ff, size: 0.3, life: 0.6 }); audio.sfx('sparkle', { vol: 0.5 });
      hud.toast('❄️ Een ijsbloem! Raak hem aan met je schijf (of schiet de puck erdoor)', 1800);
    }
    function takeFlower(i) {
      const f = flower.type; flower = null; flowerMesh.visible = false; flowerT = rand(9, 13); stats.flowers++;
      const p = pads[i]; const dir = p.dir;
      fx.particles.burst(p.x, 1, p.z, { count: 36, speed: 6, up: 1.3, life: 0.9, size: 0.4, colors: [0xffffff, 0x9fe8ff, 0x6fc8ff], gravity: 4 });
      fx.texts.add(f.name, p.x, 3.2, p.z, f.col, 1.6); hud.toast(`${names[i]} pakt een ijsbloem: ${f.name}`, 1800);
      audio.sfx('powerup', { vol: 0.8 }); ctx.shake(0.3);
      if (f.id === 'multi') spawnPuck(p.x + dir * (p.R + 1.4), p.z, dir * 12, rand(-4, 4), 'ice', 14);
      else if (f.id === 'giant') { FX.giant = 12; for (const q of activePucks()) fx.particles.burst(q.x, 0.6, q.z, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.4, colors: [0xffaa3a], gravity: 2 }); }
      else if (f.id === 'shrink') { FX.shrink[i] = 10; }
      else if (f.id === 'sticky') { FX.sticky = 12; }
      else if (f.id === 'ghost') { FX.ghost = 9; }
    }
    function spawnBumper() {
      const b = bumperPool.find((q) => !q.on); if (!b) return;
      for (let tries = 0; tries < 12; tries++) {
        const x = (Math.random() < 0.5 ? -1 : 1) * rand(2.5, 11), z = rand(-5.3, 5.3);
        if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < p.R + 3)) continue;
        if (activePucks().some((q) => Math.hypot(q.x - x, q.z - z) < 3)) continue;
        if (bumperPool.some((o) => o.on && Math.hypot(o.x - x, o.z - z) < 4)) continue;
        b.on = true; b.x = x; b.z = z; b.t = 0; b.life = 9; b.m.visible = true; b.m.position.set(x, 0, z); b.m.scale.set(1, 0.01, 1); b.hit = 0; stats.bumpers++;
        audio.sfx('scrape', { vol: 0.4, rate: 1.5 }); audio.sfx('thud', { vol: 0.5 });
        fx.particles.burst(x, 0.3, z, { count: 22, speed: 5, up: 1.5, life: 0.7, size: 0.35, colors: [0xffffff, 0x9fe8ff, 0x58c8ff], gravity: 10 });
        if (!stats.bumperTold) { stats.bumperTold = true; hud.toast('Een ijskristal-bumper duikt op!', 1600); }
        return;
      }
    }
    function startEvent() {
      stats.events++;
      const dragon = eventAlt; eventAlt = !eventAlt;
      if (dragon) { const dir = Math.random() < 0.5 ? 1 : -1; A.startDragon(dir); hud.toast('🐉 De ijsdraak vliegt over! Pas op voor extra pucks!', 2000); audio.tone(110, 0.8, { type: 'sawtooth', vol: 0.18, slide: 70 }); audio.sfx('creak', { vol: 0.5 }); G.dragonPending = { u: A.dragonFly.dropU, dir, fired: 0 }; }
      else { const x = (Math.random() < 0.5 ? -1 : 1) * rand(3, 11); A.startShooter(x); hud.toast('🐧 Een pinguïn gooit een extra puck!', 2000); G.penguinPending = { x, fired: false }; audio.sfx('pop', { vol: 0.6 }); }
    }

    // ---------------- natuurkunde ----------------
    const smashSpeed = (pow) => (17 + 18 * pow) * PUCK_MUL;
    function paddleHit(p, q, h) {
      if (q.stuck === p.i) return false;
      const dx = q.x - p.x, dz = q.z - p.z; const minD = p.Rcur + q.r; const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) return false;
      if (q.stuck >= 0) q.stuck = -1;
      let d = Math.sqrt(d2); let nx, nz; if (d < 1e-4) { nx = p.dir; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
      q.x = p.x + nx * (minD + 0.002); q.z = p.z + nz * (minD + 0.002);
      const rvx = q.vx - p.vx, rvz = q.vz - p.vz, vn = rvx * nx + rvz * nz;
      if (vn >= 0 && q.stuck < 0) return false;
      const smashing = p.state === 'lunge' || p.grace > 0;
      const hitSpeed = Math.hypot(q.vx - p.vx, q.vz - p.vz);
      q.lastHit = p.i; p.hits++;
      if (FX.sticky > 0 && !smashing && q.stuck < 0 && q.kind !== 'fire') {
        q.stuck = p.i; q.stuckT = 1.4; audio.sfx('pop', { vol: 0.5, rate: 0.7 }); fx.particles.burst(q.x, 0.5, q.z, { count: 10, speed: 2, up: 1, life: 0.6, size: 0.3, colors: [0x8dff6a, 0xd8ffc0], gravity: 3 }); return true;
      }
      if (smashing) {
        // aim-assist: deels richting het doel van de tegenstander
        const gx = p.dir * LX, ax = gx - q.x, az = 0 - q.z, al = Math.hypot(ax, az) || 1;
        let ox = nx * 0.72 + ax / al * 0.28, oz = nz * 0.72 + az / al * 0.28; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        if (ox * p.dir < 0.15) { ox = ox * 0.5 + p.dir * 0.5; const l2 = Math.hypot(ox, oz) || 1; ox /= l2; oz /= l2; }
        const sp = smashSpeed(p.lpow || 0.5);
        q.vx = ox * sp; q.vz = oz * sp; q.stuck = -1;
        p.grace = 0; p.smashes++; stats.smashes[p.i]++;
        const pw = p.lpow || 0.5;
        if (p.state === 'lunge') { p.state = 'cool'; p.cd = (lead(p.i) >= 3 ? 0.6 : 1.1); }
        fx.particles.burst(q.x, 0.7, q.z, { count: 22 + Math.round(pw * 30), speed: 7 + pw * 5, up: 0.8, life: 0.6, size: 0.4, colors: [0xffffff, 0xffe14a, 0xffa020, 0x9fe8ff], gravity: 6 });
        fx.particles.ring(q.x, 0.5, q.z, { count: 22, speed: 8, color: 0xffe14a, size: 0.35, life: 0.45 });
        fx.texts.add(pw > 0.8 ? 'MEGA SMASH!' : 'SMASH!', q.x, 2.8, q.z, pw > 0.8 ? '#ff5a3a' : '#ffd24a', 1.2 + pw * 0.5);
        audio.sfx('hit', { vol: 0.9 }); audio.sfx('explode', { vol: 0.2 + pw * 0.2 }); audio.sfx('whoosh', { vol: 0.4 }); ctx.shake(0.25 + pw * 0.4);
        p.sc = 1.3; p.c.swing();
      } else {
        const e = 0.62;
        q.vx -= (1 + e) * vn * nx; q.vz -= (1 + e) * vn * nz;
        const sp = Math.hypot(q.vx, q.vz); if (sp < 6) { const f = 6 / (sp || 1); if (sp < 0.1) { q.vx = nx * 6; q.vz = nz * 6; } else { q.vx *= f; q.vz *= f; } }
        const imp = clamp(hitSpeed / 22, 0, 1);
        if (imp > 0.12) { fx.particles.burst(q.x - nx * q.r, 0.5, q.z - nz * q.r, { count: 4 + Math.round(imp * 10), speed: 2 + imp * 4, up: 0.8, life: 0.45, size: 0.25, colors: [0xffffff, 0x9fe8ff], gravity: 6 }); audio.sfx('hit', { vol: 0.25 + imp * 0.5, rate: 0.9 + imp * 0.4 }); p.sc = 1 + imp * 0.15; }
      }
      return true;
    }
    function limitSpeed(q) { const sp = Math.hypot(q.vx, q.vz); if (sp > MAXV) { q.vx *= MAXV / sp; q.vz *= MAXV / sp; } }
    function wallFx(q, sp) { if (sp > 6) { audio.sfx('thud', { vol: clamp(sp / 36, 0.1, 0.5), rate: 1.3 }); fx.particles.burst(q.x, 0.8, q.z, { count: 3 + Math.round(sp / 6), speed: 2 + sp / 12, up: 0.8, life: 0.4, size: 0.22, colors: [0xffffff, 0xcfeeff], gravity: 8 }); if (sp > 22) ctx.shake(0.08); } }
    function stepPuck(q, h) {
      if (q.stuck >= 0) {
        const p = pads[q.stuck];
        q.x = p.x + p.dir * (p.Rcur + q.r + 0.05); q.z = p.z; q.vx = p.vx; q.vz = p.vz;
        q.stuckT -= h; if (q.stuckT <= 0) { q.stuck = -1; q.vx = p.vx + p.dir * 9; q.vz = p.vz; }
        return;
      }
      q.x += q.vx * h; q.z += q.vz * h;
      const fr = (SLIP > 0.3 ? 0.04 : 0.16) + (GRAV < 1 ? 0.28 : 0);
      const f = Math.exp(-fr * h); q.vx *= f; q.vz *= f; limitSpeed(q);
      // randen langs / doel
      const az = Math.abs(q.z), ax = Math.abs(q.x), sx = Math.sign(q.x) || 1, sz = Math.sign(q.z) || 1;
      const side = q.x > 0 ? 1 : 0, G_ = gh[side];
      const E = 0.94;
      if (ax <= LX) {      // lange randen
        if (az > LZ - q.r) { q.z = sz * (LZ - q.r); if (q.vz * sz > 0) { const sp = Math.hypot(q.vx, q.vz); q.vz = -q.vz * E; wallFx(q, sp); } }
      }
      if (ax > LX - q.r && az > G_) { q.x = sx * (LX - q.r); if (q.vx * sx > 0) { const sp = Math.hypot(q.vx, q.vz); q.vx = -q.vx * E; wallFx(q, sp); } }
      if (ax > LX - 0.3) {
        // in de doelmond: zijwanden van het net
        if (az > G_ - q.r && ax > LX) { q.z = sz * (G_ - q.r); if (q.vz * sz > 0) q.vz = -q.vz * 0.6; }
        if (ax > LX + SD - q.r) { q.x = sx * (LX + SD - q.r); if (q.vx * sx > 0) { q.vx = -q.vx * 0.3; q.vz *= 0.8; } }
      }
      // palen
      for (const pz of [-G_, G_]) {
        const dx = q.x - sx * LX, dz = q.z - pz, dd = Math.hypot(dx, dz), mm = q.r + POST_R;
        if (dd < mm && dd > 1e-4) { const nx = dx / dd, nz = dz / dd; q.x = sx * LX + nx * mm; q.z = pz + nz * mm; const vn = q.vx * nx + q.vz * nz; if (vn < 0) { const sp = Math.hypot(q.vx, q.vz); q.vx -= 1.9 * vn * nx; q.vz -= 1.9 * vn * nz; wallFx(q, sp); audio.sfx('ding', { vol: 0.3, rate: 1.3 }); } }
      }
      // bumpers
      for (const b of bumperPool) {
        if (!b.on || b.t < 0.4) continue;
        const dx = q.x - b.x, dz = q.z - b.z, mm = q.r + 1.0, d2 = dx * dx + dz * dz;
        if (d2 < mm * mm) {
          const dd = Math.sqrt(d2) || 1e-3, nx = dx / dd, nz = dz / dd; q.x = b.x + nx * mm; q.z = b.z + nz * mm;
          const vn = q.vx * nx + q.vz * nz;
          if (vn < 0) { q.vx -= 2 * vn * nx; q.vz -= 2 * vn * nz; const sp = Math.hypot(q.vx, q.vz); const t = Math.max(sp, 13) / (sp || 1); q.vx *= t; q.vz *= t; }
          b.hit = 1; audio.sfx('boing', { vol: 0.5, rate: 1.4 }); audio.sfx('ding', { vol: 0.4 });
          fx.particles.ring(b.x, 0.8, b.z, { count: 14, speed: 5, color: 0x9fe8ff, size: 0.3, life: 0.4 }); fx.texts.add('PING!', b.x, 2.4, b.z, '#9fe8ff', 0.9);
        }
      }
    }
    function stepPad(p, h) {
      const lam = lerp(18, 2.0, SLIP) * (p.state === 'lunge' ? 3 : 1);
      const k = 1 - Math.exp(-lam * h);
      p.vx += (p.tvx - p.vx) * k; p.vz += (p.tvz - p.vz) * k;
      p.x += p.vx * h; p.z += p.vz * h;
      const R = p.Rcur; const x0 = p.dir > 0 ? -LX + R + 0.3 : 0.15 + R, x1 = p.dir > 0 ? -0.15 - R : LX - R - 0.3;
      if (p.x < x0) { p.x = x0; if (p.vx < 0) p.vx = 0; } else if (p.x > x1) { p.x = x1; if (p.vx > 0) p.vx = 0; }
      const zz = LZ - R - 0.05; if (p.z < -zz) { p.z = -zz; if (p.vz < 0) p.vz = 0; } else if (p.z > zz) { p.z = zz; if (p.vz > 0) p.vz = 0; }
    }

    // ---------------- invoer ----------------
    function readInput(p, dt) {
      const inp = pv.input(p.i);
      p.grace = Math.max(0, p.grace - dt); p.cd = Math.max(0, p.cd - dt);
      if (p.frozen > 0) { p.frozen -= dt; p.tvx = p.tvz = 0; if (p.state === 'charge') p.state = 'idle'; return; }
      const spd = VMAX * pv.speed(p.i) * (p.state === 'charge' ? 0.55 : 1);
      if (p.state === 'lunge') { p.lt += dt; p.tvx = p.ldx * (14 + 18 * p.lpow); p.tvz = p.ldz * (14 + 18 * p.lpow); if (p.lt >= 0.15 + 0.06 * p.lpow) { p.state = 'cool'; p.cd = (lead(p.i) >= 3 ? 0.6 : 1.1); p.grace = 0.1; } }
      else { p.tvx = inp.x * spd; p.tvz = inp.y * spd; }
      if (p.state === 'cool' && p.cd <= 0) p.state = 'idle';
      if (inp.bP && p.state === 'idle' && p.cd <= 0) { p.state = 'charge'; p.chargeT = 0; audio.sfx('select', { vol: 0.3, rate: 1.4 }); }
      else if (inp.bP && (p.state === 'cool' || p.cd > 0) && p.state !== 'charge') audio.sfx('click', { vol: 0.15, rate: 0.6 });
      if (p.state === 'charge') {
        p.chargeT += dt;
        if (Math.floor(p.chargeT * 12) !== Math.floor((p.chargeT - dt) * 12)) audio.tone(260 + p.chargeT * 900, 0.06, { type: 'triangle', vol: 0.05 });
        if (!inp.b || p.chargeT >= 0.45) startLunge(p);
      }
    }
    function startLunge(p) {
      p.lpow = 0.25 + 0.75 * clamp(p.chargeT / 0.4, 0, 1); p.state = 'lunge'; p.lt = 0; p.chargeT = 0;
      // richting: naar de dichtstbijzijnde puck (als die voor je ligt), anders naar voren
      let best = null, bd = 9;
      for (const q of pucks) { if (!q.on || q.falling) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd && (q.x - p.x) * p.dir > -1.2) { bd = d; best = q; } }
      if (best) { const dx = best.x - p.x, dz = best.z - p.z, l = Math.hypot(dx, dz) || 1; p.ldx = dx / l; p.ldz = dz / l; } else { p.ldx = p.dir; p.ldz = clamp(pv.input(p.i).y, -1, 1) * 0.4; }
      // vastgeplakte puck: schiet hem weg
      for (const q of pucks) if (q.on && q.stuck === p.i) { q.stuck = -1; const ax = p.dir * LX - q.x, az = -q.z, al = Math.hypot(ax, az) || 1; const sp = smashSpeed(p.lpow); q.vx = ax / al * sp; q.vz = az / al * sp + p.vz * 0.3; q.lastHit = p.i; p.smashes++; stats.smashes[p.i]++; fx.texts.add('SCHOT!', q.x, 2.6, q.z, '#8dff6a', 1.2); audio.sfx('hit', { vol: 0.8 }); audio.sfx('whoosh', { vol: 0.5 }); ctx.shake(0.3); }
      audio.sfx('swing', { vol: 0.5, rate: 0.9 + p.lpow * 0.4 }); p.c.swing();
      fx.particles.ring(p.x, 0.4, p.z, { count: 14, speed: 5, color: 0xffffff, size: 0.28, life: 0.35 });
    }

    // ---------------- update ----------------
    let lastScoreRefresh = 0;
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) startMatch();
      if (T > 260 && !finished && G.state !== 'end') endMatch(score[0] === score[1] ? null : (score[0] > score[1] ? 0 : 1));
      // slow-mo herstel
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3, dt);
      const sdt = dt * slow * PHYS_T;
      G.t += dt;
      // paddles lezen
      for (const p of pads) {
        const canPlay = G.state === 'play' || G.state === 'serve' || G.state === 'goal';
        if (canPlay) readInput(p, dt * (G.state === 'goal' ? slow : 1)); else { p.tvx = p.tvz = 0; }
      }
      // goal-ijsblokken / schijfgrootte
      for (const p of pads) {
        const want = p.R0 * (p.golden ? 1.32 : 1); p.Rcur = damp(p.Rcur, want, 8, dt);
      }
      for (let s = 0; s < 2; s++) { FX.shrink[s] = Math.max(0, FX.shrink[s] - dt); gh[s] = damp(gh[s], FX.shrink[s] > 0 ? GH_SMALL : GH0, 5, dt); }
      FX.giant = Math.max(0, FX.giant - dt); FX.sticky = Math.max(0, FX.sticky - dt); FX.ghost = Math.max(0, FX.ghost - dt);
      for (const q of pucks) { if (q.on) q.r = damp(q.r, FX.giant > 0 ? PR * 1.6 : PR, 8, dt); }

      // klok
      if (G.state === 'play') {
        if (!G.ot) {
          G.timeLeft -= dt;
          if (G.timeLeft <= 0) {
            G.timeLeft = 0;
            if (score[0] !== score[1]) { audio.sfx('bell', { vol: 1 }); hud.showBig('TIJD!', 1100, '#ffd23f'); endMatch(score[0] > score[1] ? 0 : 1); }
            else { G.ot = true; G.otLeft = OT_MAX; hud.showBig('GOUDEN GOAL!', 1500, '#ffd23f'); hud.toast('Gelijkspel! Het volgende doelpunt wint', 2200); audio.sfx('bell', { vol: 0.9 }); }
          }
          hud.setTimer(G.timeLeft, 10);
        } else {
          G.otLeft -= dt; hud.setTimer(Math.max(0, G.otLeft), 8);
          if (G.otLeft <= 0) { let w = pads[0].pressure === pads[1].pressure ? null : (pads[0].pressure > pads[1].pressure ? 0 : 1); G.tiebreak = true; audio.sfx('bell', { vol: 1 }); endMatch(w); }
        }
        if (Math.floor(G.timeLeft) !== lastScoreRefresh) { lastScoreRefresh = Math.floor(G.timeLeft); A.scoreboard(names, score, G.ot ? G.otLeft : G.timeLeft, G.ot ? 'GOUDEN GOAL' : null); }
      }

      // serve: puck valt
      if (G.state === 'serve') {
        const q = pucks.find((x) => x.on && x.falling);
        if (q) {
          q.fvy -= 30 * dt; q.fy += q.fvy * dt;
          if (q.fy <= 0) {
            q.fy = 0; q.falling = false; const d = q.serveDir === 0 ? -1 : 1;
            q.vx = d * 6; q.vz = rand(-3, 3); q.lastHit = -1;
            fx.particles.ring(0, 0.3, 0, { count: 24, speed: 6, color: 0xffffff, size: 0.35, life: 0.5 }); audio.sfx('land', { vol: 0.7 }); audio.sfx('go', { vol: 0.25 }); ctx.shake(0.25);
            G.state = 'play'; G.t = 0;
          }
        } else if (G.t > 1) { G.state = 'play'; }
      }

      // natuurkunde
      if (G.state === 'play' || G.state === 'goal' || G.state === 'serve') {
        let vmax = 25; for (const q of pucks) if (q.on && !q.falling) vmax = Math.max(vmax, Math.hypot(q.vx, q.vz));
        const n = clamp(Math.ceil(vmax * sdt / 0.26), 1, 14), h = sdt / n;
        for (let s = 0; s < n; s++) {
          for (const p of pads) stepPad(p, h);
          for (const q of pucks) {
            if (!q.on || q.falling) continue;
            stepPuck(q, h);
            for (const p of pads) paddleHit(p, q, h);
            // nog klem tussen schijf en wand? duw zijwaarts weg
            if (G.state === 'play') {
              const side = q.x > 0 ? 1 : 0;
              if (Math.abs(q.x) > LX + 0.9 && Math.abs(q.z) < gh[side] + 0.2 && q.x !== 0) { goal(q, q.x > 0 ? 0 : 1); }
            }
          }
          // puck-puck
          for (let a = 0; a < pucks.length; a++) for (let b = a + 1; b < pucks.length; b++) {
            const A_ = pucks[a], B_ = pucks[b]; if (!A_.on || !B_.on || A_.falling || B_.falling || A_.stuck >= 0 || B_.stuck >= 0) continue;
            const dx = B_.x - A_.x, dz = B_.z - A_.z, mm = A_.r + B_.r, d2 = dx * dx + dz * dz;
            if (d2 < mm * mm && d2 > 1e-6) {
              const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = (mm - d) / 2; A_.x -= nx * ov; A_.z -= nz * ov; B_.x += nx * ov; B_.z += nz * ov;
              const vn = (A_.vx - B_.vx) * nx + (A_.vz - B_.vz) * nz;
              if (vn > 0) { A_.vx -= vn * nx; A_.vz -= vn * nz; B_.vx += vn * nx; B_.vz += vn * nz; audio.sfx('hit', { vol: 0.25, rate: 1.5 }); fx.particles.burst((A_.x + B_.x) / 2, 0.6, (A_.z + B_.z) / 2, { count: 6, speed: 3, up: 1, life: 0.4, size: 0.25, colors: [0xffffff, 0xffe14a], gravity: 6 }); }
            }
          }
        }
      }

      // druk / levensduur van de pucks
      if (G.state === 'play') {
        for (const q of pucks) {
          if (!q.on || q.falling) continue;
          if (q.kind !== 'main') { q.life -= dt; if (q.life <= 0) { killPuck(q); continue; } else if (q.life < 2 && Math.random() < dt * 10) fx.particles.emit(q.x, 0.8, q.z, 0, 2, 0, { life: 0.4, size: 0.2, color: 0xffffff, gravity: 0 }); }
          const side = q.x > 0 ? 1 : 0; pads[1 - side].pressure += dt * (1 / Math.max(1, activePucks().length));
        }
        // vastzittende puck? (hele tijd stil)
        const mv = activePucks().filter((q) => !q.falling);
        if (mv.length && mv.every((q) => Math.hypot(q.vx, q.vz) < 1.0 && q.stuck < 0)) { stallT += dt; if (stallT > 3) { stallT = 0; for (const q of mv) { q.vx += rand(-5, 5); q.vz += rand(-5, 5); } hud.toast('IJswind! De puck waait weg', 1200); audio.sfx('whoosh', { vol: 0.4 }); } } else stallT = 0;
        // bloem / bumper / events
        if (flower) {
          flower.t += dt; flower.life -= dt;
          for (const p of pads) if (Math.hypot(p.x - flower.x, p.z - flower.z) < p.Rcur + 0.95) { takeFlower(p.i); break; }
          if (flower) for (const q of pucks) if (q.on && !q.falling && q.lastHit >= 0 && Math.hypot(q.x - flower.x, q.z - flower.z) < q.r + 0.95) { takeFlower(q.lastHit); break; }
          if (flower && flower.life <= 0) { flower = null; flowerMesh.visible = false; flowerT = rand(6, 9); }
        } else { flowerT -= dt; if (flowerT <= 0) spawnFlower(); }
        bumperT -= dt; if (bumperT <= 0 && T > 8) { bumperT = rand(11, 16); if (bumperPool.filter((b) => b.on).length < 2) spawnBumper(); }
        eventT -= dt; if (eventT <= 0) { eventT = rand(15, 21); startEvent(); }
        // draak/pinguïn schieten
        if (G.dragonPending && A.dragonFly.on) {
          const d = G.dragonPending; const u = A.dragonFly.t / 6.5;
          if (d.fired < 1 && u >= d.u) { d.fired = 1; const dx = A.dragon.group.position.x; const x = clamp(dx, -9, 9); spawnPuck(x, -LZ + 1.0, clamp(-dx * 0.25, -8, 8) + rand(-4, 4), rand(11, 14), 'fire', 12); stats.events += 0; audio.sfx('explode', { vol: 0.35 }); audio.tone(90, 0.6, { type: 'sawtooth', vol: 0.15, slide: 45 }); fx.particles.burst(x, 6, -LZ - 1, { count: 36, speed: 7, up: -0.2, life: 0.8, size: 0.5, colors: [0xff7a1a, 0xffd23f, 0xff3a0a], gravity: 6 }); fx.texts.add('VUURPUCK!', x, 3, -LZ + 1, '#ff9a3a', 1.4); }
          if (u >= 1) G.dragonPending = null;
        } else if (G.dragonPending && !A.dragonFly.on) G.dragonPending = null;
        if (G.penguinPending && A.shooterAct.on) {
          const d = G.penguinPending; const u = A.shooterAct.t / 5.2;
          if (!d.fired && u >= 0.4) { d.fired = true; const x = d.x; spawnPuck(x, -LZ + 0.9, rand(-9, 9) - Math.sign(x) * 2, rand(10, 14), 'pen', 12); audio.sfx('throw', { vol: 0.6 }); fx.texts.add('POEF!', x, 2.6, -LZ, '#ffe14a', 1.1); }
          if (u >= 1) G.penguinPending = null;
        } else if (G.penguinPending && !A.shooterAct.on) G.penguinPending = null;
      }
      // laatste 15 s: sneller bloemen
      if (G.state === 'play' && !G.ot && G.timeLeft < 15 && flowerT > 4) flowerT = 4;

      // doel-ijsblokken updaten
      for (let s = 0; s < 2; s++) { const cut = GH0 - gh[s]; for (let k = 0; k < 2; k++) { const m = blocks[s][k]; m.visible = cut > 0.05; if (m.visible) { m.scale.set(1, 1, cut); m.position.z = (k ? 1 : -1) * (gh[s] + cut / 2); m.position.x = (s ? 1 : -1) * (LX - 0.3); } } }

      // eindes / overgangen
      if (G.state === 'goal') {
        G.confettiT -= dt; if (G.confettiT <= 0 && G.t < 2.2) { G.confettiT = 0.18; fx.particles.burst(rand(-12, 12), 6 + rand(0, 4), rand(-5, 5), { count: 22, speed: 6, up: 1.2, life: 1.3, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); }
        if (G.t > 2.5) {
          if (G.end) endMatch(G.scorer);
          else { pads.forEach((p) => { p.c.pose = 'push'; }); servePuck(1 - G.scorer); }
        }
      } else if (G.state === 'end') {
        if (G.t > (G.winner == null ? 1.6 : 2.4) && !finished) finishMatch(G.winner);
      }
      applyGolden();
      visuals(dt);
    }

    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(), camPosV = new THREE.Vector3();
    let camX = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist0 = clamp(22.5 / (tanH * asp), 26, 50);
      let zoom = 1, lx = 0;
      if (G.state === 'goal') { G.camPunch = Math.max(0, G.camPunch - dt * 0.55); zoom = 1 - 0.12 * Math.sin(Math.min(1, G.t / 0.5) * Math.PI * 0.5) * (G.t < 2 ? 1 : 0); lx = (G.lastScorerSide ? 1 : -1) * 3.5; }
      const puckX = pucks.find((q) => q.on && !q.falling); const fol = puckX ? puckX.x * 0.06 : 0;
      camX = damp(camX, lx + fol, 2.5, dt);
      const dist = dist0 * zoom;
      const sway = Math.sin((T + introT) * 0.25) * 0.8;
      camPosV.set(camX + sway, 1 + dist * 0.64, -1 + dist * 0.77);
      camLook.set(camX * 0.6, 1, -1);
      camera.position.copy(camPosV); camera.lookAt(camLook);
    }
    function visuals(dt) {
      const tt = T + introT;
      // pucks
      for (const q of pucks) {
        if (!q.on) continue;
        const sc = q.r;
        const bob = GRAV < 1 ? 0.6 + Math.abs(Math.sin(tt * 2.4 + q.ph)) * 1.3 : 0;
        const y = (q.falling ? q.fy : 0) + bob;
        q.g.position.set(q.x, y, q.z); q.g.scale.set(sc, 1, sc); q.g.rotation.y += dt * (3 + Math.hypot(q.vx, q.vz) * 0.2);
        let vis = true;
        if (FX.ghost > 0) { const ph = (tt * 1.1) % 1.5; vis = ph < 0.6 || FX.ghost < 1.2 && ph < 0.9; if (FX.ghost < 0.6) vis = true; }
        q.g.visible = vis;
        q.glow.material.opacity = q.stuck >= 0 ? 0.65 : 0.3 + Math.min(0.4, Math.hypot(q.vx, q.vz) / 60);
        q.shadow.visible = true; q.shadow.position.set(q.x, 0.03, q.z); q.shadow.scale.setScalar(sc * (1 - Math.min(0.4, y * 0.1)));
        q.shadow.material.opacity = FX.ghost > 0 && !vis ? 0.12 : 0.6;
        // spoor
        const sp = Math.hypot(q.vx, q.vz);
        if (!q.falling && sp > 7 && Math.random() < dt * (10 + sp * 1.2)) {
          const fire = q.kind === 'fire';
          fx.particles.emit(q.x - q.vx * 0.02, 0.4 + y, q.z - q.vz * 0.02, (Math.random() - 0.5) * 0.8, fire ? 1.5 : 0.5, (Math.random() - 0.5) * 0.8, { life: fire ? 0.6 : 0.4, size: fire ? 0.5 : 0.3, color: fire ? (Math.random() < 0.5 ? 0xff7a1a : 0xffd23f) : q.kind === 'pen' ? 0xffe14a : 0x9fe8ff, gravity: fire ? -3 : 1 });
        }
        if (FX.sticky > 0 && Math.random() < dt * 6) fx.particles.emit(q.x + (Math.random() - 0.5), 0.3, q.z + (Math.random() - 0.5), 0, 0.5, 0, { life: 0.5, size: 0.3, color: 0x8dff6a, gravity: -1 });
      }
      // schijven
      for (const p of pads) {
        const g = p.g; p.sc = damp(p.sc, 1, 8, dt);
        const R = p.Rcur;
        const charge = p.state === 'charge' ? clamp(p.chargeT / 0.4, 0, 1) : 0;
        const shake = p.state === 'charge' ? (Math.random() - 0.5) * 0.08 * (0.4 + charge) : 0;
        g.position.set(p.x + shake, p.state === 'lunge' ? 0.05 : 0, p.z + shake);
        g.scale.set(R * p.sc, 1, R * p.sc);
        p.ball.scale.setScalar(1 + charge * 0.4);
        p.baseM.emissive.setRGB(charge * 0.5, charge * 0.35, charge * 0.1); p.goldM.emissiveIntensity = 0.35 + charge * 1.2;
        p.ring.position.set(p.x, 0.06, p.z);
        const ready = p.cd <= 0 && p.state === 'idle' && p.frozen <= 0;
        p.ring.visible = true;
        p.ring.scale.setScalar(R * (ready ? 1.02 + Math.sin(tt * 6 + p.i) * 0.03 : p.state === 'charge' ? 1.05 + charge * 0.35 : 0.9));
        p.ring.material.color.setHex(p.frozen > 0 ? 0x9fe8ff : p.state === 'charge' ? (charge > 0.85 ? 0xff5a3a : 0xffd24a) : ready ? 0x9fffb0 : 0x7a7a8a);
        p.ring.material.opacity = ready ? 0.85 : p.state === 'charge' ? 0.9 : 0.35;
        p.shadow.position.set(p.x, 0.03, p.z); p.shadow.scale.setScalar(R * 1.1);
        p.tag.position.set(p.x, 2.7 + R * 0.5, p.z + 0.4);
        p.tag.visible = G.state !== 'goal' || G.t < 2;
        // trail bij lunge
        if (p.state === 'lunge' && Math.random() < dt * 40) fx.particles.emit(p.x - p.ldx * R, 0.5, p.z - p.ldz * R, 0, 0.4, 0, { life: 0.3, size: 0.5, color: p.i ? 0x8fb8ff : 0x7dffb0, gravity: 0 });
        if (p.golden && Math.random() < dt * 14) fx.particles.emit(p.x + (Math.random() - 0.5) * R * 1.6, 0.5 + Math.random() * 0.8, p.z + (Math.random() - 0.5) * R * 1.6, 0, 1.2, 0, { life: 0.6, size: 0.3, color: 0xffd23f, gravity: -1 });
        if (p.frozen > 0) { if (Math.random() < dt * 20) fx.particles.emit(p.x + (Math.random() - 0.5) * R * 2, 0.8, p.z + (Math.random() - 0.5) * R * 2, 0, 1, 0, { life: 0.5, size: 0.3, color: 0xcff4ff, gravity: 0 }); }
        // speler-poppetje volgt z
        const hz = clamp(p.z * 0.85, -5.5, 5.5);
        p.holder.position.z = damp(p.holder.position.z, hz, 6, dt);
        p.c.speed = clamp(Math.hypot(p.vz, 0) / 12, 0, 0.8);
        if (G.state !== 'goal' && G.state !== 'end') p.c.pose = p.state === 'charge' ? 'scared' : p.state === 'lunge' ? 'push' : 'carry';
        p.c.update(dt);
        // info
        const txt = p.frozen > 0 ? 'Bevroren!' : p.state === 'charge' ? 'LADEN...' : p.state === 'lunge' ? 'SMASH!' : p.cd > 0 ? `Smash: ${p.cd.toFixed(1)}s` : 'Smash: klaar!';
        if (p.lastTxt !== txt) { p.lastTxt = txt; hud.setPlayerInfo(p.i, `${score[p.i]} goals · ${txt}`); }
      }
      // bloem
      if (flower) {
        flowerMesh.rotation.y += dt * 2; flowerMesh.position.y = 0.2 + Math.sin(flower.t * 3) * 0.15;
        flowerMesh.visible = flower.life > 2.5 || Math.sin(flower.life * 18) > 0;
        flowerMesh.userData.halo.material.color.set(flower.type.col); flowerMesh.userData.halo.scale.setScalar(1 + Math.sin(flower.t * 5) * 0.1);
        if (Math.random() < dt * 8) fx.particles.emit(flower.x + (Math.random() - 0.5), 0.6 + Math.random() * 1.2, flower.z + (Math.random() - 0.5), 0, 0.8, 0, { life: 0.7, size: 0.22, color: 0xcff4ff, gravity: -0.5 });
      }
      // bumpers
      for (const b of bumperPool) {
        if (!b.on) continue;
        b.t += dt; b.life -= dt; b.hit = Math.max(0, b.hit - dt * 4);
        const k = smoothstep(0, 0.4, b.t) * (b.life < 0.5 ? b.life / 0.5 : 1);
        b.m.scale.set(1 + b.hit * 0.25, Math.max(0.01, k), 1 + b.hit * 0.25); b.m.rotation.y += dt;
        b.m.userData.ring.material.opacity = 0.4 + b.hit * 0.5 + Math.sin(tt * 5) * 0.1;
        if (b.life <= 0) { b.on = false; b.m.visible = false; fx.particles.burst(b.x, 0.5, b.z, { count: 18, speed: 4, up: 1.5, life: 0.6, size: 0.3, colors: [0xffffff, 0x9fe8ff], gravity: 8 }); audio.sfx('pop', { vol: 0.4, rate: 0.8 }); }
      }
      A.update(tt, dt);
      updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const p of pads) { p.c.update(dt); } A.update(T + introT, dt); updateCamera(dt); }
    function introUpdate(dt) {
      introT += dt; for (const p of pads) { p.c.pose = 'carry'; }
      visuals(dt);
    }
    refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pads) fx.particles.burst(p.x, 1, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = pads[i]; p.frozen = 2.5; p.state = 'idle'; if (score[i] > 0) { score[i]--; refreshHud(); applyGolden(); } fx.texts.add('IJSBLOK!', p.x, 3.4, p.z, '#9fe8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { pads[w].c.pose = 'cheer'; pads[1 - w].c.pose = 'sad'; A.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, timeLeft: G.timeLeft, ot: G.ot, otLeft: G.otLeft, score: [...score], finished, slow, golden: pads.map((p) => p.golden), pucks: pucks.filter((q) => q.on).map((q) => ({ kind: q.kind, x: +q.x.toFixed(2), z: +q.z.toFixed(2), vx: +q.vx.toFixed(1), vz: +q.vz.toFixed(1), r: +q.r.toFixed(2), stuck: q.stuck, falling: q.falling, lastHit: q.lastHit })),
          pads: pads.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), vx: p.vx, vz: p.vz, st: p.state, cd: +p.cd.toFixed(2), R: +p.Rcur.toFixed(2), frozen: p.frozen, smashes: p.smashes, hits: p.hits, pressure: +p.pressure.toFixed(1) })),
          fx: { giant: FX.giant, sticky: FX.sticky, ghost: FX.ghost, shrink: [...FX.shrink] }, gh: [...gh], flower: flower ? { id: flower.type.id, x: flower.x, z: flower.z } : null, bumpers: bumperPool.filter((b) => b.on).length, stats }),
        setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); applyGolden(); },
        giveFlower: (id, i) => { flower = { x: 0, z: 0, t: 0, life: 10, type: FLOWERS.find((f) => f.id === id) }; takeFlower(i); },
        spawnFlower: () => spawnFlower(), startEvent: () => startEvent(), spawnBumper: () => spawnBumper(), setTime: (t) => { G.timeLeft = t; }, setEventAlt: (v) => { eventAlt = v; },
        pads, pucks, gh,
      },
    };
  },
};

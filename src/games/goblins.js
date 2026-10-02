import * as THREE from 'three';
import { mat, glow, mesh, clamp, lerp, damp, rand, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, makeNPC, Animal, Slime, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildWorld, mergeChildren, GATES, CAMP, PEN_R } from './goblins_world.js';

// Goblin-jacht: samen de schapen van Schaapherder Sjoerd beschermen tegen goblins.
// 3 golven + eindbaas (Goblin-koning). Twin-stick-achtig: lopen = richten, A = katapult, B = rol.

const SHEEP_N = 5;
const AREA = { x: 16.8, z: 10.2 };            // waar de spelers mogen lopen
const EXIT = { x: 19.8, z: 12.6 };            // goblin met schaap is "weg" als hij hier voorbij is
const P_SPEED = 8.6, ROLL_T = 0.4, ROLL_CD = 1.15, ROLL_SPEED = 18;
const STONE_SPEED = 28, STONE_LIFE = 0.7;
const REVIVE_TIME = 2.0;
const TIME_CAP = 200;

const TYPES = {
  goblin: { hp: 2, speed: 3.6, carry: 3.1, r: 0.72, pts: 10, hits: 1, kb: 4.5, stun: 0.3, contact: true },
  runner: { hp: 1, speed: 6.4, carry: 5.4, r: 0.6, pts: 15, hits: 1, kb: 5, stun: 0.3, contact: true },
  brute: { hp: 9, speed: 2.4, carry: 2.0, r: 1.2, pts: 40, hits: 3, kb: 0.7, stun: 0.04, contact: true },
  bomber: { hp: 2, speed: 3.2, r: 0.72, pts: 25, kb: 3, stun: 0.25, contact: false },
  slime: { hp: 3, speed: 4.3, r: 0.8, pts: 8, kb: 2.5, stun: 0.15, contact: true },
  slimeS: { hp: 1, speed: 5.0, r: 0.5, pts: 0, kb: 3, stun: 0.15, contact: true },
  king: { hp: 64, speed: 3.0, carry: 2.2, r: 1.85, pts: 300, hits: 7, kb: 0, stun: 0, contact: true },
};
const CS = 1.22;   // vergroting van poppetjes zodat ze goed leesbaar zijn
const SPECS = {
  goblin: { scale: 0.85 * CS },
  runner: { scale: 0.72 * CS, skin: 0xd0d84a, shirt: 0xd8a02a, pants: 0x5a4a20, hair: 0xe8a010 },
  brute: { scale: 1.3 * CS, bodyW: 1.75, skin: 0x5f9a3a, shirt: 0x8a3a2a, pants: 0x3a2a20, hat: 'horns', headScale: 1.1, hair: 0x1a2a10 },
  bomber: { scale: 0.82 * CS, skin: 0x8fd06a, shirt: 0xb03a2a, hat: 'beanie', hatColor: 0x2a2a2a, hatColor2: 0xff5a2a, backpack: 0x2a2a2a },
  king: { scale: 1.6 * CS, bodyW: 1.55, skin: 0x6fb04a, shirt: 0x7a1f6a, tunic: 0x7a1f6a, cape: 0xa01f2a, hat: 'crown', headScale: 1.15, nose: 2.2, belt: 0xf2c230 },
};
const POOL = { goblin: 13, runner: 6, brute: 3, bomber: 3, king: 1, slime: 7, slimeS: 10 };

// -------------------------------------------------------------------------
let _heart = null;
function heartTex(full) {
  _heart ||= {};
  const k = full ? 'f' : 'e'; if (_heart[k]) return _heart[k];
  const t = canvasTex(64, 64, (g) => {
    g.translate(32, 34); g.scale(1, -1);
    g.beginPath(); g.moveTo(0, -22); g.bezierCurveTo(-34, 4, -18, 30, 0, 12); g.bezierCurveTo(18, 30, 34, 4, 0, -22);
    g.fillStyle = full ? '#ff3b5c' : 'rgba(40,30,50,.65)'; g.fill(); g.lineWidth = 5; g.strokeStyle = full ? '#7a0f2a' : '#15101c'; g.stroke();
    if (full) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-10, 8, 5, 3, -0.6, 0, 7); g.fill(); }
  });
  t.userData.keep = true; _heart[k] = t; return t;
}
function heartShape() {
  const s = new THREE.Shape(); s.moveTo(0, -0.55); s.bezierCurveTo(-1.0, 0.1, -0.6, 0.85, 0, 0.4); s.bezierCurveTo(0.6, 0.85, 1.0, 0.1, 0, -0.55); return s;
}
function boltShape() {
  const s = new THREE.Shape(); s.moveTo(0.18, 0.65); s.lineTo(-0.32, -0.08); s.lineTo(-0.03, -0.08); s.lineTo(-0.2, -0.65); s.lineTo(0.34, 0.12); s.lineTo(0.05, 0.12); s.lineTo(0.18, 0.65); return s;
}

class Bar {
  constructor(scene, w, h, color) {
    this.w = w;
    this.bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x140c1c, transparent: true, opacity: 0.85, depthTest: false }));
    this.fill = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, depthTest: false }));
    this.bg.scale.set(w + 0.14, h + 0.14, 1); this.fill.scale.set(w, h, 1); this.fill.center.set(0, 0.5);
    this.bg.renderOrder = 30; this.fill.renderOrder = 31;
    scene.add(this.bg, this.fill); this.show(false);
  }
  set(frac) { this.fill.scale.x = Math.max(0.001, this.w * clamp(frac, 0, 1)); }
  at(x, y, z) { this.bg.position.set(x, y, z); this.fill.position.set(x - this.w / 2, y, z); }
  show(v) { this.bg.visible = this.fill.visible = v; }
}

export default {
  id: 'goblins',
  name: 'Goblin-jacht',
  giver: 'Schaapherder Sjoerd',
  icon: '🐑',
  mode: 'coop',
  time: 90,
  pay: 1.25,
  music: 'game_minor',
  blurb: 'Help! <b>Goblins</b> stelen de schapen van Sjoerd! Schiet ze met je <b>katapult</b> van de sokken, rol weg voor gevaar en red zoveel mogelijk schapen. Wordt een broer <b>knock-out</b>? Ga naast hem staan en houd <b>A</b> ingedrukt om hem te redden!',
  controls: ['{move} lopen (je kijkt waar je loopt)', '{a} katapult (houd ingedrukt) / maatje redden', '{b} rollen (even onkwetsbaar)'],
  tip: 'Raak je een goblin die een schaap draagt, dan laat hij het vallen. Schiet ook de bommen uit de lucht!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const { sun, hemi } = ctx.lights('night', { shadow: 22, center: [0, 0, 0] });
    sun.color.setHex(0xdce4ff); sun.intensity = 1.9; sun.position.set(-22, 38, 20);
    hemi.color.setHex(0xc0ccff); hemi.groundColor.setHex(0x6a7a58); hemi.intensity = 1.5;
    scene.fog = new THREE.Fog(0x232a58, 50, 120);
    scene.background = new THREE.Color(0x1d2450);
    const world = buildWorld(ctx);
    const obstacles = world.obstacles;
    const D = ctx.difficulty;
    const KD = 1 + (D - 1) * 0.35;

    // ---------- camera ----------
    camera.fov = 48;
    let zoomMul = 1;
    const camT = new THREE.Vector3(0, 0, 0.8), camPos = new THREE.Vector3();
    function setCam(aspect) {
      const ft = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = clamp(19.6 / (ft * aspect), 22, 52) * zoomMul;
      const pitch = THREE.MathUtils.degToRad(60);
      camPos.set(0, camT.y + Math.sin(pitch) * dist, camT.z + Math.cos(pitch) * dist);
      camera.position.copy(camPos); camera.lookAt(camT); camera.updateProjectionMatrix();
    }
    setCam(camera.aspect || 1.7);

    // ---------- hulp ----------
    const rng = ctx.rng;
    let t = 0, gameT = 0, endT = -1, over = false, outcome = null;
    const hitSrc = {};
    let sheepLeft = SHEEP_N, score = 0, killsMain = 0, spawnedMain = 0, hitsTaken = 0, kosCount = 0, revives = 0, bossDown = false, rescued = 0;
    const tmpV = new THREE.Vector3();
    function pushOut(o, x, z, r) { // geeft gecorrigeerde x,z terug via o
      for (const ob of obstacles) {
        const dx = x - ob.x, dz = z - ob.z; const m = ob.r + r; const d2 = dx * dx + dz * dz;
        if (d2 < m * m) { const d = Math.sqrt(d2) || 0.001; x = ob.x + dx / d * m; z = ob.z + dz / d * m; }
      }
      o.x = x; o.z = z;
    }
    const bleat = () => audio.tone && audio.tone(420 + Math.random() * 80, 0.38, { type: 'sawtooth', vol: 0.06, slide: 300, filter: 900, vib: 0.05 });

    // ---------- schapen ----------
    const sheep = [];
    for (let i = 0; i < SHEEP_N; i++) {
      const a = new Animal('sheep'); a.group.scale.setScalar(1.7);
      const wool = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: 0x4a4038, flatShading: false, roughness: 0.95 });
      a.group.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0xf4f1ea) o.material = wool; });
      mergeChildren(a.group, wool);
      const holder = new THREE.Group(); holder.add(a.group); scene.add(holder);
      const ang = i / SHEEP_N * TAU + 0.4, rr = 1.8 + (i % 2) * 1.0;
      const s = { i, a, holder, wool, x: Math.cos(ang) * rr, z: Math.sin(ang) * rr, y: 0, state: 'pen', tx: 0, tz: 0, wt: rand(0, 3), lives: 2, safeT: 0, by: null, vy: 0, fleeX: 0, fleeZ: 0 };
      holder.add(P.shadowBlob(1.0));
      a.targetYaw = a.yaw = rand(0, TAU);
      sheep.push(s);
    }
    const sheepAlive = () => sheep.filter((s) => s.state !== 'gone').length;
    function sheepTarget(s) { const a = rand(0, TAU), r = Math.sqrt(Math.random()) * (PEN_R - 1.4); s.tx = Math.cos(a) * r; s.tz = Math.sin(a) * r; }
    sheep.forEach(sheepTarget);

    function updateSheep(s, dt) {
      if (s.state === 'gone') return;
      s.safeT -= dt;
      const a = s.a; let sp = 0;
      if (s.state === 'pen' || s.state === 'return') {
        s.wt -= dt;
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
        const v = s.state === 'return' ? 4.2 : 1.1;
        if (d > 0.25) { s.x += dx / d * v * dt; s.z += dz / d * v * dt; a.targetYaw = Math.atan2(dx, dz); sp = s.state === 'return' ? 1 : 0.5; }
        else if (s.state === 'return') { s.state = 'pen'; s.wt = rand(1, 3); }
        if (s.state === 'pen' && s.wt <= 0 && d <= 0.3) { sheepTarget(s); s.wt = rand(2, 5); if (Math.random() < 0.2) bleat(); }
        else if (s.state === 'pen' && s.wt <= -6) { sheepTarget(s); s.wt = rand(2, 5); }
        s.y = 0;
      } else if (s.state === 'dropped') {
        s.vy -= 22 * dt; s.y += s.vy * dt;
        if (s.y <= 0) { s.y = 0; if (s.vy < -3) { fx.particles.dust(s.x, 0, s.z, 5); audio.sfx('land', { vol: 0.35 }); } s.state = 'dazed'; s.wt = 1.0; }
        sp = 0.6;
      } else if (s.state === 'dazed') {
        s.wt -= dt; sp = 0; s.a.group.rotation.z = Math.sin(t * 20) * 0.1;
        if (s.wt <= 0) { s.state = 'return'; sheepTarget(s); s.a.group.rotation.z = 0; }
      } else if (s.state === 'carried') {
        sp = 1.6; // poten spartelen
        const e = s.by;
        s.x = e.x; s.z = e.z; s.y = e.height * 0.98 + 0.45;
        s.holder.rotation.z = Math.sin(t * 14) * 0.18;
        if (Math.random() < dt * 0.9) { bleat(); }
      } else if (s.state === 'fleeing') {
        const dx = s.fleeX - s.x, dz = s.fleeZ - s.z, d = Math.hypot(dx, dz) || 1;
        s.x += dx / d * 7 * dt; s.z += dz / d * 7 * dt; a.targetYaw = Math.atan2(dx, dz); sp = 1;
        if (Math.abs(s.x) > EXIT.x || Math.abs(s.z) > EXIT.z) loseSheep(s, null);
      }
      if (s.state !== 'carried') s.holder.rotation.z = 0;
      s.holder.scale.setScalar(damp(s.holder.scale.x, s.state === 'carried' ? 0.7 : 1, 12, dt));
      // schapen duwen elkaar een beetje weg; rotsen/hooi ontwijken
      if (s.state === 'pen' || s.state === 'return') {
        for (const q of sheep) if (q !== s && (q.state === 'pen' || q.state === 'return')) { const dx = s.x - q.x, dz = s.z - q.z, d = Math.hypot(dx, dz); if (d < 1.5 && d > 0.001) { s.x += dx / d * (1.5 - d) * 0.5 * dt * 6; s.z += dz / d * (1.5 - d) * 0.5 * dt * 6; } }
        const o = { x: 0, z: 0 }; pushOut(o, s.x, s.z, 0.4); s.x = o.x; s.z = o.z;
      }
      a.speed = sp; a.update(dt);
      s.holder.position.set(s.x, s.y, s.z);
    }
    function singe(s) { s.wool.color.setHex(s.lives === 1 ? 0x6a6256 : 0x3a342e); }

    function loseSheep(s, byEnemy) {
      if (s.state === 'gone') return;
      s.state = 'gone'; s.holder.visible = false; sheepLeft--;
      fx.texts.add('Schaap weg! 😢', s.x, 3.2, s.z, '#ff7a7a', 1.3);
      fx.particles.burst(s.x, 1.0, s.z, { count: 14, colors: [0xffffff, 0xd8d0c0], speed: 3, size: 0.3 });
      audio.sfx('bad'); ctx.shake(0.35);
      sjoerd.pose = 'scared'; sjoerdT = 1.6;
      if (sheepLeft <= 0) endGame('lose', 'Alle schapen zijn weg...');
    }

    // ---------- spelers ----------
    const sjoerd = world.sjoerd; let sjoerdT = 0;
    const PS = 1.2;
    const slingMat = mat(0x6b4a2e), bandMat = mat(0xd8372c);
    const pl = players.map((pp, i) => {
      const c = makeBrother(i);
      const holder = new THREE.Group(); const piv = new THREE.Group(); holder.add(piv); piv.add(c.group);
      c.height *= PS; const cy = c.height * 0.45; c.group.position.y = -cy / PS; holder.position.set(0, cy, 0); holder.scale.setScalar(PS); scene.add(holder);
      const sh = P.shadowBlob(0.9); sh.position.set(0, 0.06, 0); scene.add(sh);
      // katapult in de rechterhand
      const sling = new THREE.Group();
      sling.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.28, 5), slingMat, { pos: [0, 0.1, 0] }));
      for (const sd of [-1, 1]) sling.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 5), slingMat, { pos: [sd * 0.07, 0.3, 0], rot: [0, 0, -sd * 0.4] }));
      sling.add(mesh(new THREE.BoxGeometry(0.2, 0.025, 0.025), bandMat, { cast: false, pos: [0, 0.36, 0] }));
      sling.rotation.x = Math.PI / 2; sling.position.set(0, 0, 0.1); c.hold(sling, 'r');
      const ring = mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.85 }), { cast: false, pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0] }); scene.add(ring);
      const arrow = mesh(new THREE.ConeGeometry(0.28, 0.7, 3), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.8 }), { cast: false }); arrow.rotation.x = Math.PI / 2; scene.add(arrow);
      const arrowG = new THREE.Group(); arrowG.add(arrow); arrow.position.set(0, 0.1, 1.9); scene.add(arrowG);
      const reticle = mesh(new THREE.TorusGeometry(0.85, 0.06, 5, 20), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9 }), { cast: false, rot: [Math.PI / 2, 0, 0] }); reticle.visible = false; scene.add(reticle);
      const hearts = [0, 1, 2].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex(true), transparent: true, depthTest: false })); s.scale.set(0.62, 0.62, 1); s.renderOrder = 25; scene.add(s); return s; });
      const starsG = new THREE.Group(); starsG.visible = false; scene.add(starsG);
      for (let k = 0; k < 4; k++) starsG.add(mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffc800, emissiveIntensity: 0.9 }), { cast: false, pos: [Math.cos(k / 4 * TAU) * 0.7, 0, Math.sin(k / 4 * TAU) * 0.7] }));
      const bar = new Bar(scene, 1.7, 0.24, 0x5cff8a);
      return {
        i, c, holder, piv, cy, sh, ring, arrow: arrowG, reticle, hearts, starsG, bar, x: i ? 2.6 : -2.6, z: 7.4, vx: 0, vz: 0, kx: 0, kz: 0, ax: 0, az: -1, hp: 3, ko: false, lock: null, fx: 0, fz: -1, rev: 0, inv: 0, roll: 0, rollCd: 0, rollDx: 0, rollDz: 0, rollA: 0, shootCd: 0, rapid: 0, triple: 0, target: null, reviving: false, tilt: 0,
      };
    });
    pl.forEach((p) => { p.c.faceDir(0, -1); p.c.yaw = p.c.targetYaw; });

    // ---------- stenen ----------
    const stones = []; const stoneGeo = new THREE.DodecahedronGeometry(0.2, 0), stoneMat = mat(0xb8b4aa);
    for (let k = 0; k < 40; k++) { const m = mesh(stoneGeo, stoneMat, { cast: false }); m.visible = false; scene.add(m); stones.push({ m, on: false, x: 0, z: 0, vx: 0, vz: 0, life: 0, y: 1, o: 0 }); }
    function fireStone(p, dx, dz) {
      const s = stones.find((q) => !q.on); if (!s) return;
      s.on = true; s.m.visible = true; s.x = p.x + dx * 0.7; s.z = p.z + dz * 0.7; s.y = 1.15; s.vx = dx * STONE_SPEED; s.vz = dz * STONE_SPEED; s.life = STONE_LIFE; s.o = p.i;
      s.m.position.set(s.x, s.y, s.z);
    }
    function shoot(p) {
      let dx = p.ax, dz = p.az;
      const tg = p.target;
      if (tg) { const ex = tg.x - p.x, ez = tg.z - p.z, d = Math.hypot(ex, ez) || 1; dx = ex / d; dz = ez / d; }
      const ang = Math.atan2(dx, dz);
      const shots = p.triple > 0 ? [-0.2, 0, 0.2] : [0];
      for (const o of shots) fireStone(p, Math.sin(ang + o), Math.cos(ang + o));
      p.c.faceDir(dx, dz); p.c.swing();
      audio.sfx('swing', { vol: 0.22, rate: 1.4 + Math.random() * 0.3 });
      p.shootCd = p.rapid > 0 ? 0.15 : 0.36;
    }

    // ---------- vijanden ----------
    const units = {}; const enemies = [];
    function mkUnit(type) {
      const def = TYPES[type];
      let u;
      if (type === 'slime' || type === 'slimeS') {
        const col = type === 'slime' ? 0x58d86b : 0xb070ff;
        const sl = new Slime(col, type === 'slime' ? 1.5 : 0.95);
        u = { type, def, slime: sl, group: sl.group, height: type === 'slime' ? 1.0 : 0.6 };
        sl.group.add(P.shadowBlob(type === 'slime' ? 0.9 : 0.6));
      } else {
        const c = makeNPC('goblin', SPECS[type] || SPECS.goblin);
        u = { type, def, c, group: c.group, height: c.height };
        const sh = P.shadowBlob(def.r * 1.3); sh.position.y = 0.05; c.group.add(sh); u.sh = sh;
        if (type === 'bomber') {
          const b = new THREE.Group(); b.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0x1c1c22, { flatShading: false }), { cast: false }));
          b.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffa020 }), { cast: false, pos: [0, 0.24, 0] }));
          u.heldBomb = b; c.hold(b, 'r'); b.position.set(0, 0.1, 0.1);
        }
        if (type === 'brute' || type === 'king') u.bar = new Bar(scene, type === 'king' ? 3.2 : 1.7, type === 'king' ? 0.34 : 0.22, type === 'king' ? 0xff6a4a : 0xffa34a);
      }
      u.active = false; u.group.visible = false; scene.add(u.group);
      return u;
    }
    for (const k in POOL) { units[k] = []; for (let i = 0; i < POOL[k]; i++) units[k].push(mkUnit(k)); }

    function spawnEnemy(type, x, z, { main = true, hpMul = 1 } = {}) {
      const u = units[type].find((q) => !q.active); if (!u) return null;
      const def = u.def;
      Object.assign(u, { active: true, dying: 0, x, z, vx: 0, vz: 0, kx: 0, kz: 0, hp: Math.ceil(def.hp * hpMul), maxHp: Math.ceil(def.hp * hpMul), state: type === 'king' ? 'enter' : type === 'bomber' ? 'enter' : 'seek', stun: 0, carrying: null, carryHits: 0, target: null, cd: rand(1, 2.5), age: 0, main, hopT: rand(0, 1), ang: Math.atan2(z, x), orbitR: 9.8 + rand(-0.8, 1.2), dir: Math.random() < 0.5 ? 1 : -1, stomp: 5, phase: 0, flee: false, bombs: 0 });
      u.group.visible = true; u.group.scale.setScalar(1); u.group.position.set(x, 0, z);
      if (u.c) { u.c.pose = 'idle'; u.c.speed = 0; u.c.targetYaw = Math.atan2(-x, -z); u.c.yaw = u.c.targetYaw; }
      if (u.heldBomb) u.heldBomb.visible = true;
      if (main) spawnedMain++;
      enemies.push(u); return u;
    }
    function releaseEnemy(e) {
      e.active = false; e.group.visible = false; if (e.bar) e.bar.show(false);
      const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
    }
    const nearestPlayer = (x, z, ignoreKO = true) => { let b = null, bd = 1e9; for (const p of pl) { if (ignoreKO && p.ko) continue; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = p; } } return b; };
    function exitPoint(x, z) {
      const dxs = Math.min(x + EXIT.x, EXIT.x - x) * 0.62, dzs = Math.min(z + EXIT.z, EXIT.z - z);
      if (dxs < dzs) return [x < 0 ? -EXIT.x - 1.5 : EXIT.x + 1.5, z];
      return [x, z < 0 ? -EXIT.z - 1.5 : EXIT.z + 1.5];
    }

    // ---------- sheep grabbing ----------
    function chooseTarget(e) {
      let best = null, bs = 1e9;
      for (const s of sheep) {
        if (s.state === 'gone' || s.state === 'carried' || s.state === 'fleeing' || s.safeT > 0 || s.state === 'dropped') continue;
        let score = Math.hypot(s.x - e.x, s.z - e.z);
        for (const o of enemies) if (o !== e && o.target === s && !o.dying) score += 5;
        if (score < bs) { bs = score; best = s; }
      }
      return best;
    }
    function grab(e, s) {
      s.state = 'carried'; s.by = e; e.carrying = s; e.carryHits = 0; e.state = 'carry'; e.target = null;
      const [ex, ez] = exitPoint(e.x, e.z); e.exX = ex; e.exZ = ez;
      if (e.c) e.c.pose = 'hands_up';
      audio.sfx('miss', { vol: 0.5, rate: 1.4 }); bleat();
      fx.texts.add('Help! 🐑', s.x, 3.4, s.z, '#ffd27a', 1.1);
      fx.particles.burst(s.x, 1.2, s.z, { count: 6, colors: [0xffffff], speed: 2, size: 0.25 });
      sjoerd.pose = 'scared'; sjoerdT = 1.2;
    }
    function dropSheep(e) {
      const s = e.carrying; if (!s) return;
      s.state = 'dropped'; s.by = null; s.vy = 6; s.safeT = 2.0; s.x = e.x; s.z = e.z; s.holder.rotation.z = 0;
      e.carrying = null; e.carryHits = 0; e.state = 'seek'; e.target = null; e.stun = Math.max(e.stun, e.type === 'king' ? 0.9 : e.type === 'brute' ? 0.7 : 1.1); e.flee = false;
      if (e.c) e.c.pose = 'scared';
      rescued++;
      fx.texts.add('Gered! ✔', e.x, 3.2, e.z, '#7aff9a', 1.2);
      audio.sfx('good', { vol: 0.6 }); fx.particles.ring(e.x, 0.3, e.z, { count: 12, speed: 4, life: 0.4, color: 0x9aff9a });
    }

    function hitEnemy(e, dmg, dx, dz, fromPlayer = true) {
      if (!e.active || e.dying > 0) return;
      const def = e.def; e.hp -= dmg;
      if (def.kb) { e.kx += dx * def.kb; e.kz += dz * def.kb; }
      e.stun = Math.max(e.stun, def.stun);
      if (e.c) e.c.squash = 0.25; else e.slime.squash = 0.3;
      fx.particles.burst(e.x, e.height * 0.6, e.z, { count: 6, colors: [0xeaffd0, 0xb8ff8a, 0xffffff], speed: 3, size: 0.22 });
      audio.sfx('hit', { vol: 0.45, rate: 0.9 + Math.random() * 0.3 });
      if (e.carrying) { e.carryHits++; if (e.carryHits >= def.hits) dropSheep(e); }
      if (e.hp <= 0) killEnemy(e); else if (e.type === 'king') kingPhase(e);
    }
    function killEnemy(e) {
      if (e.carrying) dropSheep(e);
      e.dying = 0.4; e.vx = e.vz = 0; e.state = 'dead';
      if (e.main) killsMain++;
      score += e.def.pts;
      if (e.def.pts) fx.texts.add('+' + e.def.pts, e.x, e.height + 1.2, e.z, '#ffe14a', 0.8);
      fx.particles.burst(e.x, e.height * 0.6, e.z, { count: e.type === 'king' ? 50 : 16, colors: [0x7fbf4a, 0xb8ff8a, 0xffe14a, 0xffffff], speed: e.type === 'king' ? 8 : 4.5, size: 0.3 });
      audio.sfx('pop', { rate: 0.8 + Math.random() * 0.3 });
      if (e.type === 'slime' && !bossDown) { for (const sd of [-1, 1]) { const n = spawnEnemy('slimeS', e.x + sd * 0.5, e.z, { main: false }); if (n) { n.kx = sd * 5; n.stun = 0.3; } } }
      if (e.heldBomb) e.heldBomb.visible = false;
      if (Math.random() < (e.type === 'brute' ? 0.7 : 0.1)) dropPickup(e.x, e.z);
      if (e.type === 'king') { bossDown = true; bossDefeated(e); }
    }

    // ---------- bommen ----------
    const bombs = []; const bombGeo = new THREE.SphereGeometry(0.36, 10, 8);
    for (let k = 0; k < 6; k++) {
      const g = new THREE.Group();
      g.add(mesh(bombGeo, mat(0x1c1c22, { flatShading: false, metalness: 0.4, roughness: 0.4 }), { cast: false }));
      const spark = mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb020 }), { cast: false, pos: [0, 0.42, 0] }); g.add(spark);
      g.visible = false; scene.add(g);
      const ring = mesh(new THREE.RingGeometry(0.85, 1.0, 36), new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), { cast: false, rot: [-Math.PI / 2, 0, 0] }); ring.visible = false; scene.add(ring);
      const disc = mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.18, depthWrite: false }), { cast: false, rot: [-Math.PI / 2, 0, 0] }); disc.visible = false; scene.add(disc);
      bombs.push({ g, spark, ring, disc, on: false, t: 0, T: 1.4, sx: 0, sy: 0, sz: 0, ex: 0, ez: 0, y: 0, x: 0, z: 0 });
    }
    const BOMB_R = 2.7;
    function throwBomb(e, s) {
      const b = bombs.find((q) => !q.on); if (!b) return;
      b.on = true; b.t = 0; b.T = 1.5; b.sx = e.x; b.sz = e.z; b.sy = e.height * 0.9;
      b.ex = s.x + rand(-0.7, 0.7); b.ez = s.z + rand(-0.7, 0.7);
      b.g.visible = true; b.ring.visible = true; b.disc.visible = true;
      b.ring.position.set(b.ex, 0.07, b.ez); b.disc.position.set(b.ex, 0.06, b.ez);
      b.ring.scale.setScalar(BOMB_R); b.disc.scale.setScalar(BOMB_R);
      e.c.swing(); audio.sfx('throw', { vol: 0.4 });
    }
    const decals = []; for (let k = 0; k < 6; k++) { const d = mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0, depthWrite: false }), { cast: false, rot: [-Math.PI / 2, 0, 0] }); d.visible = false; d.position.y = 0.05; scene.add(d); decals.push({ m: d, life: 0 }); }
    let decalI = 0;
    const flash = new THREE.PointLight(0xffa040, 0, 20, 1.6); scene.add(flash); let flashT = 0;
    function explode(x, z, y = 0.5, harmless = false) {
      fx.particles.burst(x, y, z, { count: harmless ? 22 : 44, colors: [0xff6a1a, 0xffb020, 0xffe070, 0x3a2a22, 0xff3a1a], speed: harmless ? 5 : 8, size: 0.55, up: 1.2, life: 0.9, gravity: 4 });
      fx.particles.ring(x, 0.4, z, { count: 24, speed: harmless ? 5 : 9, life: 0.45, size: 0.4, color: 0xffa040 });
      audio.sfx('explode', { vol: harmless ? 0.55 : 0.9, rate: harmless ? 1.3 : 1 });
      flash.position.set(x, 2.5, z); flash.intensity = harmless ? 3 : 8; flashT = 0.35;
      ctx.shake(harmless ? 0.25 : 0.65);
      if (harmless) return;
      const d = decals[decalI++ % decals.length]; d.m.visible = true; d.m.position.x = x; d.m.position.z = z; d.m.scale.setScalar(BOMB_R * 0.9); d.life = 7; d.m.material.opacity = 0.55;
      for (const s of sheep) {
        if (s.state === 'gone' || s.state === 'carried') continue;
        if (Math.hypot(s.x - x, s.z - z) < BOMB_R + 0.3) {
          s.lives--; fx.particles.burst(s.x, 1, s.z, { count: 8, colors: [0x333333, 0xff8a2a], speed: 3, size: 0.3 });
          if (s.lives <= 0) { const ex = exitPoint(s.x, s.z); s.state = 'fleeing'; s.fleeX = ex[0]; s.fleeZ = ex[1]; fx.texts.add('Auw! Hij rent weg!', s.x, 3, s.z, '#ff9a5a', 1.1); bleat(); }
          else { singe(s); fx.texts.add('Geschroeid!', s.x, 3, s.z, '#ffb27a', 1); bleat(); s.state = 'return'; sheepTarget(s); }
        }
      }
      for (const p of pl) if (Math.hypot(p.x - x, p.z - z) < BOMB_R) hurtPlayer(p, x, z, 'Boem!', 'bom');
      for (const e of enemies.slice()) if (!e.dying && Math.hypot(e.x - x, e.z - z) < BOMB_R) hitEnemy(e, 2, Math.sign(e.x - x) * 0.7, Math.sign(e.z - z) * 0.7, false);
    }

    // ---------- pickups ----------
    const pickups = [];
    {
      const beamMats = { heart: 0xff5a7a, rapid: 0xffe14a, triple: 0x58e0ff };
      for (let k = 0; k < 4; k++) {
        const g = new THREE.Group(); const kinds = {};
        const hm = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape(), { depth: 0.25, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }), new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0xc01030, emissiveIntensity: 0.7, roughness: 0.3 }));
        hm.scale.setScalar(0.85); hm.position.set(0, 1.3, -0.1);
        const bm = new THREE.Mesh(new THREE.ExtrudeGeometry(boltShape(), { depth: 0.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffb800, emissiveIntensity: 0.9, roughness: 0.3 }));
        bm.scale.setScalar(1.15); bm.position.set(0, 1.3, -0.1);
        const tm = new THREE.Group(); tm.position.y = 1.3;
        for (const a of [-0.5, 0, 0.5]) tm.add(mesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0x58e0ff, emissive: 0x2090d0, emissiveIntensity: 0.8 }), { cast: false, pos: [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.15 - 0.15 + Math.abs(a) * 0.3], }));
        const items = { heart: hm, rapid: bm, triple: tm };
        for (const key in items) { items[key].visible = false; g.add(items[key]); }
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 8, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 4; g.add(beam);
        const base = mesh(new THREE.RingGeometry(0.7, 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.08, 0] }); g.add(base);
        g.visible = false; scene.add(g);
        pickups.push({ g, items, beam, base, on: false, kind: 'heart', life: 0, x: 0, z: 0, ph: rand(0, 6) });
      }
      pickups.colors = beamMats;
    }
    let pickT = 7;
    function dropPickup(x, z, kind) {
      const pk = pickups.find((q) => !q.on); if (!pk) return;
      if (!kind) {
        const hurt = pl.some((p) => p.hp < 3 || p.ko);
        const r = Math.random(); kind = hurt && r < 0.5 ? 'heart' : r < 0.75 ? 'rapid' : 'triple';
      }
      pk.on = true; pk.kind = kind; pk.life = 16; pk.x = clamp(x, -AREA.x + 2, AREA.x - 2); pk.z = clamp(z, -AREA.z + 2, AREA.z - 2);
      for (const key in pk.items) pk.items[key].visible = key === kind;
      const col = pickups.colors[kind]; pk.beam.material.color.setHex(col); pk.base.material.color.setHex(col);
      pk.g.visible = true; pk.g.position.set(pk.x, 0, pk.z);
      fx.particles.ring(pk.x, 0.4, pk.z, { count: 14, speed: 3, life: 0.5, color: col });
      audio.sfx('sparkle', { vol: 0.5 });
    }
    function randomPickupSpot() {
      for (let k = 0; k < 12; k++) {
        const x = rand(-14, 14), z = rand(-7, 8);
        if (Math.hypot(x, z) < PEN_R + 1) continue;
        if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.5)) continue;
        return [x, z];
      }
      return [10, -2];
    }

    // ---------- spelers raken ----------
    function hurtPlayer(p, sx, sz, text = 'Au!', srcName = 'contact') {
      if (p.ko || p.inv > 0 || p.roll > 0 || over) return;
      p.hp--; p.inv = 1.5; hitsTaken++; hitSrc[srcName] = (hitSrc[srcName] || 0) + 1;
      const dx = p.x - sx, dz = p.z - sz, d = Math.hypot(dx, dz) || 1; p.kx = dx / d * 9; p.kz = dz / d * 9;
      fx.texts.add(text, p.x, p.c.height + 1.5, p.z, '#ff7a7a', 1);
      fx.particles.burst(p.x, 1.2, p.z, { count: 10, colors: [0xff5a5a, 0xffffff], speed: 3.5, size: 0.25 });
      audio.sfx('hurt', { vol: 0.8 }); ctx.shake(0.45); p.c.squash = 0.3;
      if (p.hp <= 0) {
        p.ko = true; p.rev = 0; kosCount++; p.vx = p.vz = 0;
        audio.sfx('lose', { vol: 0.5 });
        if (pl.every((q) => q.ko)) { endGame('lose', 'Allebei knock-out!'); }
        else { hud.toast(`${players[p.i].name} is knock-out! Ga naast hem staan en houd A ingedrukt!`, 2800); const o2 = pl[1 - p.i]; dropPickup(clamp(p.x + (o2.x < p.x ? 3.2 : -3.2), -AREA.x, AREA.x), clamp(p.z + 1.5, -AREA.z, AREA.z), 'heart'); }
      }
    }

    // ---------- golven ----------
    const sched = [];
    function buildSchedule() {
      const r = () => 0.85 + rng() * 0.3;
      const add = (w, tt, type) => sched.push({ w, t: tt, type, done: false });
      for (let tt = 1.5; tt < 25; tt += 2.7 / KD * r()) add(0, tt, 'goblin');
      add(0, 8, 'runner'); add(0, 19, 'runner'); add(0, 14, 'slime'); add(0, 24, 'goblin');
      for (let tt = 1.0; tt < 25; tt += 1.9 / KD * r()) add(1, tt, 'goblin');
      for (const tt of [5, 12, 20]) add(1, tt, 'runner');
      add(1, 9, 'brute'); add(1, 3, 'bomber'); add(1, 15, 'slime'); add(1, 22, 'slime'); add(1, 19, 'bomber');
      add(2, 1.5, 'king');
      for (let tt = 4; tt < 26; tt += 2.4 / KD * r()) add(2, tt, 'goblin');
      for (const tt of [7, 14, 22]) add(2, tt, 'runner');
      add(2, 11, 'brute'); add(2, 8, 'bomber'); add(2, 20, 'bomber'); add(2, 13, 'slime'); add(2, 18, 'slime');
      sched.sort((a, b) => a.t - b.t);
    }
    buildSchedule();
    const WAVE_DUR = [28, 28, 30];
    let wave = 0, stage = 'intro', stageT = 2.6, waveT = 0, tailT = 6, king = null;
    function gatePos() {
      // kies een poort die niet vlak naast een speler is
      for (let k = 0; k < 8; k++) { const g = GATES[Math.floor(rng() * GATES.length)]; if (!pl.some((p) => Math.hypot(p.x - g[0], p.z - g[1]) < 9)) return g; }
      return GATES[Math.floor(rng() * GATES.length)];
    }
    function doSpawn(type) {
      if (enemies.filter((e) => e.active).length >= 18) return false;
      const g = gatePos();
      const gx = g[0] + Math.sign(g[0]) * (Math.abs(g[0]) > 20 ? 1.2 : 0) + rand(-0.8, 0.8), gz = g[1] + Math.sign(g[1]) * (Math.abs(g[1]) > 12 ? 0.5 : 0) + rand(-0.8, 0.8);
      const hpMul = type === 'king' ? 1 + (D - 1) * 0.3 : 1;
      const e = spawnEnemy(type, gx, gz, { hpMul });
      if (!e) return false;
      fx.particles.dust(gx, 0, gz, 5, 0x9a9ab8);
      if (type === 'king') {
        king = e; hud.showBig('Goblin-koning!', 1800, '#ff6a5a'); ctx.shake(0.8);
        audio.tone && audio.tone(95, 0.9, { type: 'sawtooth', vol: 0.3, slide: 45, filter: 700 }); audio.sfx('thud', { vol: 0.9 });
      }
      return true;
    }
    function startWave(n) {
      wave = n; stage = 'wave'; waveT = 0;
      hud.showBig(n === 2 ? 'Laatste golf!' : `Golf ${n + 1}`, 1600, '#ffe14a'); audio.sfx('bell', { vol: 0.7 });
    }
    function kingPhase(e) {
      const f = e.hp / e.maxHp;
      if (e.phase === 0 && f < 0.66) { e.phase = 1; summon(e, 3); dropPickup(e.x + 3, e.z + 2, 'heart'); dropPickup(e.x - 3, e.z + 2, 'triple'); }
      else if (e.phase === 1 && f < 0.33) { e.phase = 2; summon(e, 4); dropPickup(e.x + 3, e.z + 2, 'heart'); dropPickup(e.x - 3, e.z + 2, 'rapid'); }
    }
    function summon(e, n) {
      hud.toast('De koning roept zijn goblins!', 1800); audio.sfx('door', { vol: 0.8 }); ctx.shake(0.5);
      for (let k = 0; k < n; k++) doSpawn(k % 3 === 2 ? 'runner' : 'goblin');
      fx.particles.ring(e.x, 0.4, e.z, { count: 24, speed: 7, life: 0.6, size: 0.4, color: 0xc060ff });
    }
    function bossDefeated(e) {
      hud.showBig('Goblin-koning verslagen!', 2200, '#7aff9a');
      for (const o of enemies.slice()) if (o !== e && !o.dying) { if (o.carrying) dropSheep(o); killEnemy(o); }
      for (const b of bombs) if (b.on) { explode(b.x, b.z, b.y, true); b.on = false; b.g.visible = b.ring.visible = b.disc.visible = false; }
      for (let k = 0; k < 6; k++) setTimeout(() => { if (!over) fx.particles.burst(e.x + rand(-2, 2), 2 + rand(0, 2), e.z + rand(-2, 2), { count: 30, colors: [0xffe14a, 0xff6fa5, 0x58e0ff, 0xffffff], speed: 7, size: 0.4 }); }, 150 * k);
      endGame('win');
    }

    // ---------- einde ----------
    function endGame(kind, why) {
      if (over) return; over = true; outcome = { kind, why }; endT = kind === 'win' ? 3.0 : 2.0;
      if (kind === 'lose') hud.showBig(why || 'Mislukt', 2000, '#ff7a7a');
      for (const p of pl) p.c.pose = kind === 'win' ? 'cheer' : 'sad';
      sjoerd.pose = kind === 'win' ? 'cheer' : 'sad'; sjoerdT = 99;
    }
    function finishNow() {
      const alive = sheepLeft;
      const ratio = spawnedMain ? killsMain / spawnedMain : 0;
      const total = score + alive * 100;
      let stars = 0;
      if (outcome.kind === 'win') {
        if (alive >= 5 || (alive >= 4 && ratio >= 0.85)) stars = 3; else if (alive >= 3) stars = 2; else if (alive >= 2) stars = 1;
      } else if (outcome.kind === 'timeout') { stars = alive >= 2 ? 1 : 0; }
      else if (outcome.why && outcome.why.startsWith('Allebei') && alive >= 3) stars = 1;
      const pct = Math.round(ratio * 100);
      let sum = `Gered: <b>${alive}</b> van de ${SHEEP_N} schapen · <b>${pct}%</b> van de goblins verslagen`;
      if (outcome.kind === 'win') sum = `De Goblin-koning is verslagen! ` + sum + '.';
      else if (outcome.kind === 'lose') sum = (outcome.why || 'Mislukt') + ' ' + sum + '.';
      else sum = 'De koning wist te ontsnappen... ' + sum + '.';
      if (revives) sum += ` Maatje gered: ${revives}x.`;
      pl.forEach((p) => { p.c.pose = stars ? 'cheer' : 'sad'; });
      ctx.finish({ stars, score: total, summary: sum, delay: 500 });
    }

    // ---------- HUD ----------
    function hudUpdate() {
      const s = '🐑'.repeat(sheepLeft) + '·'.repeat(SHEEP_N - sheepLeft);
      hud.setScore(`${s}   Golf ${Math.min(wave + 1, 3)}/3`);
      for (const p of pl) {
        let h = ''; for (let k = 0; k < 3; k++) h += k < p.hp ? '❤️' : '🖤';
        let st = p.ko ? ' 💫 KO' : ''; if (p.rapid > 0) st += ` ⚡${Math.ceil(p.rapid)}`; if (p.triple > 0) st += ` ✴️${Math.ceil(p.triple)}`;
        if (!p.ko) st += p.rollCd <= 0 ? ' 🌀' : '';
        hud.setPlayerInfo(p.i, h + st);
      }
      let hint = '';
      const ko = pl.find((p) => p.ko);
      if (king && king.active && !king.dying) hint = `<b style="color:#ff8a6a">👑 Goblin-koning</b>`;
      if (ko && !over) { const o = pl[1 - ko.i]; hint += (hint ? '<br>' : '') + `${players[ko.i].name} is KO! ${players[o.i].name}: sta naast hem en houd <kbd>${o.i ? 'Enter' : 'F'}</kbd> ingedrukt`; }
      hud.setHint(hint || null);
      hud.setTimer(null);
    }

    // ---------- update ----------
    function updatePlayers(dt) {
      for (const p of pl) {
        const inp = input.p[p.i], c = p.c, other = pl[1 - p.i];
        p.inv = Math.max(0, p.inv - dt); p.rollCd = Math.max(0, p.rollCd - dt); p.shootCd -= dt; p.rapid = Math.max(0, p.rapid - dt); p.triple = Math.max(0, p.triple - dt);
        // knockback
        p.kx = damp(p.kx, 0, 9, dt); p.kz = damp(p.kz, 0, 9, dt);
        p.target = null;
        if (p.ko) {
          p.reviving = false;
          // liggend, sterretjes, revive door maatje
          if (other.reviving) { p.rev += dt / REVIVE_TIME; if (Math.random() < 0.3) fx.particles.emit(p.x + rand(-0.6, 0.6), 0.8, p.z + rand(-0.6, 0.6), 0, 1.5, 0, { life: 0.7, size: 0.28, color: 0xff7aa8, gravity: -1 }); }
          else p.rev = Math.max(0, p.rev - dt * 0.6);
          if (p.rev >= 1) {
            p.ko = false; p.hp = 2; p.inv = 3; p.rev = 0; revives++;
            fx.particles.burst(p.x, 1.2, p.z, { count: 24, colors: [0xff5a8a, 0xffd0e0, 0xffffff], speed: 5, size: 0.35 });
            fx.texts.add('Gered!', p.x, 3, p.z, '#7aff9a', 1.3); audio.sfx('powerup'); hud.toast(`${players[p.i].name} is er weer bij!`, 1600);
            c.pose = 'cheer'; setTimeout(() => { if (!p.ko && !over) c.pose = 'idle'; }, 800);
          }
          c.pose = p.ko ? 'sad' : c.pose;
          c.speed = 0;
          // visueel: liggen
          p.tilt = damp(p.tilt, -Math.PI / 2 * 0.98, 12, dt);
          p.piv.quaternion.setFromAxisAngle(tmpV.set(1, 0, 0), p.tilt);
          p.holder.position.set(p.x, damp(p.holder.position.y, 0.32, 12, dt), p.z);
          c.update(dt);
          p.starsG.visible = true; p.starsG.position.set(p.x, 1.5, p.z - 0.2); p.starsG.rotation.y += dt * 3;
          p.starsG.children.forEach((s, k) => { s.position.y = Math.sin(t * 5 + k) * 0.1; s.rotation.y += dt * 4; });
          p.bar.show(p.rev > 0.01); p.bar.set(p.rev); p.bar.at(p.x, 2.8, p.z);
          for (const h of p.hearts) h.visible = false;
          p.ring.visible = false; p.arrow.visible = false; p.reticle.visible = false; p.sh.position.set(p.x, 0.06, p.z);
          p.sh.scale.set(1.5, 1.5, 1);
          continue;
        }
        p.starsG.visible = false; p.bar.show(false); p.ring.visible = true; p.arrow.visible = true; p.sh.scale.set(1, 1, 1);
        p.tilt = damp(p.tilt, 0, 14, dt);
        p.reviving = !over && other.ko && inp.a && Math.hypot(other.x - p.x, other.z - p.z) < 2.6;
        if (p.reviving) c.pose = 'carry'; else if (c.pose === 'carry' && !over) c.pose = 'idle';
        // lopen / rollen
        const mx = inp.x, mz = inp.y, mag = inp.mag;
        if (mag > 0.25) { const L = Math.hypot(mx, mz); p.ax = mx / L; p.az = mz / L; }
        if (inp.bP && p.rollCd <= 0 && p.roll <= 0 && !over) {
          p.roll = ROLL_T; p.rollCd = ROLL_CD; p.rollA = 0;
          if (mag > 0.25) { p.rollDx = p.ax; p.rollDz = p.az; } else { p.rollDx = p.ax; p.rollDz = p.az; }
          audio.sfx('whoosh', { vol: 0.5 }); fx.particles.dust(p.x, 0, p.z, 6);
        }
        let sp = P_SPEED * (p.reviving ? 0.0 : 1);
        if (p.roll > 0) {
          p.roll -= dt; p.rollA += dt / ROLL_T * TAU;
          p.vx = p.rollDx * ROLL_SPEED; p.vz = p.rollDz * ROLL_SPEED;
          if (Math.random() < 0.6) fx.particles.dust(p.x, 0, p.z, 1);
          // duw vijanden opzij
          for (const e of enemies) {
            if (e.dying > 0 || !e.active) continue;
            const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
            if (d < e.def.r + 1.0 && e.type !== 'king') {
              if (e.type !== 'brute') { e.kx += p.rollDx * 9 + dx / (d || 1) * 3; e.kz += p.rollDz * 9 + dz / (d || 1) * 3; e.stun = Math.max(e.stun, 0.7); }
              if (e.carrying && e.type !== 'brute') { dropSheep(e); }
              if (e.c) e.c.squash = 0.25;
              if (!e._rolled || t - e._rolled > 0.4) { e._rolled = t; audio.sfx('thud', { vol: 0.5 }); fx.particles.burst(e.x, 0.8, e.z, { count: 6, colors: [0xffffff, 0xffe14a], speed: 3, size: 0.25 }); }
            }
          }
          p.piv.quaternion.setFromAxisAngle(tmpV.set(p.rollDz, 0, -p.rollDx), p.rollA);
          c.squash = 0.15; c.speed = 1;
          if (p.roll <= 0) { p.piv.quaternion.identity(); p.vx = p.rollDx * P_SPEED; p.vz = p.rollDz * P_SPEED; }
        } else {
          const tx = mx * sp, tz = mz * sp;
          p.vx = damp(p.vx, tx, 16, dt); p.vz = damp(p.vz, tz, 16, dt);
          p.piv.quaternion.setFromAxisAngle(tmpV.set(1, 0, 0), p.tilt);
          c.speed = clamp(Math.hypot(p.vx, p.vz) / 8, 0, 1);
        }
        let nx = p.x + (p.vx + p.kx) * dt, nz = p.z + (p.vz + p.kz) * dt;
        nx = clamp(nx, -AREA.x, AREA.x); nz = clamp(nz, -AREA.z, AREA.z);
        const o = { x: nx, z: nz }; pushOut(o, nx, nz, 0.55); p.x = o.x; p.z = o.z;
        if (c.speed > 0.5 && p.roll <= 0 && Math.random() < 0.3) fx.particles.dust(p.x, 0, p.z, 1);
        // richten / schieten: auto-richten op een vijand voor je; houd je A ingedrukt dan blijft hij "vergrendeld" (je kunt dan achteruit lopen en toch schieten)
        let best = null;
        if (!over && p.roll <= 0) {
          const holding = inp.a; let bs = 1e9;
          for (const e of enemies) {
            if (!e.active || e.dying > 0) continue;
            const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d > 17 || d < 0.3) continue;
            const ang = Math.abs(Math.atan2(p.ax * dz - p.az * dx, p.ax * dx + p.az * dz));
            const locked = holding && p.lock === e;
            if (ang > (holding ? 0.7 : 0.5) && !locked) continue;
            const sc = ang * 6 + d * 0.15 - (e.carrying ? 4 : 0) - (locked ? 2.5 : 0);
            if (sc < bs) { bs = sc; best = e; }
          }
          p.lock = holding ? best : null;
        }
        p.target = best;
        if (best) { const ex = best.x - p.x, ez = best.z - p.z, ed = Math.hypot(ex, ez) || 1; p.fx = ex / ed; p.fz = ez / ed; } else { p.fx = p.ax; p.fz = p.az; }
        c.faceDir(inp.a && best ? p.fx : p.ax, inp.a && best ? p.fz : p.az);
        if (!over && inp.a && !p.reviving && p.shootCd <= 0 && p.roll <= 0) {
          // niet schieten als je naast een KO maatje staat (dan ben je aan het redden)
          if (!(other.ko && Math.hypot(other.x - p.x, other.z - p.z) < 2.6)) shoot(p);
        }
        // visuals
        p.holder.position.set(p.x, p.roll > 0 ? p.cy + 0.15 : p.cy, p.z);
        p.sh.position.set(p.x, 0.06, p.z);
        p.ring.position.set(p.x, 0.08, p.z);
        p.ring.material.opacity = p.inv > 0 ? 0.35 + 0.4 * Math.abs(Math.sin(t * 20)) : 0.85;
        p.arrow.position.set(p.x, 0, p.z); p.arrow.rotation.y = Math.atan2(p.fx, p.fz);
        p.arrow.visible = p.roll <= 0; p.arrow.children[0].position.z = 1.9 + Math.sin(t * 8) * 0.12;
        if (p.target) { p.reticle.visible = true; p.reticle.position.set(p.target.x, 0.12, p.target.z); p.reticle.scale.setScalar(p.target.def.r * 1.3 + Math.sin(t * 9) * 0.06); } else p.reticle.visible = false;
        c.group.visible = !(p.inv > 0 && p.inv < 5 && Math.sin(t * 40) > 0.55 && p.roll <= 0);
        c.update(dt);
        // hartjes
        for (let k = 0; k < 3; k++) {
          const h = p.hearts[k]; h.visible = true; h.material.map = heartTex(k < p.hp);
          h.position.set(p.x + (k - 1) * 0.55, p.c.height + 0.75 + (p.roll > 0 ? 0.3 : 0), p.z + 0.1);
        }
      }
    }

    function moveEnemy(e, dx, dz, speed, dt, accel = 10) {
      const d = Math.hypot(dx, dz);
      let tx = 0, tz = 0; if (d > 0.01) { tx = dx / d * speed; tz = dz / d * speed; }
      e.vx = damp(e.vx, tx, accel, dt); e.vz = damp(e.vz, tz, accel, dt);
    }

    function updateEnemy(e, dt) {
      if (!e.active) return;
      const def = e.def; e.age += dt;
      if (e.dying > 0) {
        e.dying -= dt; const k = Math.max(0, e.dying / 0.4);
        e.group.scale.setScalar(Math.max(0.01, k)); e.group.rotation.y += dt * 14; e.group.position.y = (1 - k) * 0.6;
        if (e.dying <= 0) { e.group.rotation.y = 0; e.group.position.y = 0; releaseEnemy(e); }
        return;
      }
      e.stun = Math.max(0, e.stun - dt);
      let speedMul = 1;
      if (e.stun > 0) { e.vx = damp(e.vx, 0, 12, dt); e.vz = damp(e.vz, 0, 12, dt); speedMul = 0; }
      else if (over) { e.vx = damp(e.vx, 0, 6, dt); e.vz = damp(e.vz, 0, 6, dt); speedMul = 0; }
      else AI(e, dt);
      if (!e.active) return;
      e.kx = damp(e.kx, 0, 8, dt); e.kz = damp(e.kz, 0, 8, dt);
      e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
      // obstakels (grote dingen niet voor de bazen)
      const o = { x: e.x, z: e.z }; pushOut(o, e.x, e.z, def.r * 0.6); e.x = o.x; e.z = o.z;
      // niet te ver buiten beeld als hij nog niet gegrepen heeft
      if (!e.carrying && e.state !== 'enter') { e.x = clamp(e.x, -EXIT.x - 2.5, EXIT.x + 2.5); e.z = clamp(e.z, -EXIT.z - 2.5, EXIT.z + 2.5); }
      const sp = Math.hypot(e.vx, e.vz);
      if (e.c) {
        e.group.position.set(e.x, 0, e.z);
        e.c.speed = clamp(sp / 5, 0, 1) * (e.type === 'runner' ? 1 : 0.9);
        if (sp > 0.3) e.c.faceDir(e.vx, e.vz);
        if (e.stun > 0 && !e.carrying && e.c.pose !== 'scared' && e.type !== 'brute' && e.type !== 'king') e.c.pose = 'scared';
        else if (e.stun <= 0 && e.c.pose === 'scared' && !over) e.c.pose = e.carrying ? 'hands_up' : 'idle';
        e.c.update(dt);
      } else {
        // slime: hop
        const sl = e.slime; sl.update(dt, 1.2 + (e.hopping ? 0.8 : 0));
        e.group.position.set(e.x, e.hopping ? Math.abs(Math.sin(e.hopPh)) * 0.7 : 0, e.z);
        if (sp > 0.2) e.group.rotation.y = Math.atan2(e.vx, e.vz);
      }
      if (e.bar) { e.bar.show(true); e.bar.set(e.hp / e.maxHp); e.bar.at(e.x, e.height + 1.1 + (e.type === 'king' ? 0.5 : 0), e.z); }
      // schade aan spelers
      if (def.contact && e.stun <= 0 && !e.carrying && e.state !== 'enter') {
        for (const p of pl) {
          if (p.ko || p.inv > 0 || p.roll > 0) continue;
          if (Math.hypot(p.x - e.x, p.z - e.z) < def.r + 0.55) { hurtPlayer(p, e.x, e.z, 'Au!', e.type); if (e.type !== 'king') { e.kx -= (p.x - e.x) * 2; e.kz -= (p.z - e.z) * 2; e.stun = Math.max(e.stun, 0.3); } }
        }
      }
    }

    function AI(e, dt) {
      const def = e.def;
      switch (e.type) {
        case 'goblin': case 'runner': case 'brute': case 'king': return AIgrabber(e, dt);
        case 'bomber': return AIbomber(e, dt);
        case 'slime': case 'slimeS': return AIslime(e, dt);
      }
    }
    function AIgrabber(e, dt) {
      const def = e.def;
      if (e.state === 'enter') { // koning loopt binnen
        moveEnemy(e, -e.x * 0.3, -e.z * 0.5, def.speed * 0.8, dt, 5);
        if (e.age > 3.0 || (Math.abs(e.x) < 15 && Math.abs(e.z) < 9)) e.state = 'seek';
        return;
      }
      if (e.state === 'stomp') {
        e.vx = damp(e.vx, 0, 10, dt); e.vz = damp(e.vz, 0, 10, dt);
        e.stompT -= dt; e.c.pose = 'hands_up';
        e.ring.visible = true; e.ring.position.set(e.x, 0.1, e.z); const k = 1 - e.stompT / 1.1; e.ring.scale.setScalar(Math.max(0.1, k * 5.2)); e.ringOut.position.set(e.x, 0.1, e.z); e.ringOut.scale.setScalar(5.2);
        if (e.stompT <= 0) {
          e.state = 'seek'; e.ring.visible = false; e.ringOut.visible = false; e.c.pose = 'idle';
          fx.particles.ring(e.x, 0.3, e.z, { count: 36, speed: 10, life: 0.5, size: 0.5, color: 0xd8c8a8 }); fx.particles.dust(e.x, 0, e.z, 14);
          audio.sfx('thud', { vol: 1 }); ctx.shake(0.8);
          for (const p of pl) if (Math.hypot(p.x - e.x, p.z - e.z) < 5.2) hurtPlayer(p, e.x, e.z, 'Wham!', 'stamp');
        }
        return;
      }
      if (e.state === 'carry') {
        // naar de rand rennen
        const dx = e.exX - e.x, dz = e.exZ - e.z;
        moveEnemy(e, dx, dz, def.carry * (1 + (D - 1) * 0.1), dt, 8);
        if (Math.abs(e.x) > EXIT.x || Math.abs(e.z) > EXIT.z) { const s = e.carrying; e.carrying = null; s.by = null; fx.particles.dust(e.x, 0, e.z, 8, 0x3a4a3a); loseSheep(s, e); if (e.c) e.c.pose = 'idle'; releaseEnemy(e); }
        return;
      }
      // seek
      if (!e.target || e.target.state === 'gone' || e.target.state === 'carried' || e.target.state === 'fleeing' || e.target.state === 'dropped' || e.target.safeT > 0) e.target = chooseTarget(e);
      if (e.type === 'king') {
        e.stomp -= dt;
        const np = nearestPlayer(e.x, e.z);
        if (e.stomp <= 0 && np && Math.hypot(np.x - e.x, np.z - e.z) < 6.5) {
          e.state = 'stomp'; e.stompT = 1.1; e.stomp = 7;
          if (!e.ring) {
            e.ring = mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.35, depthWrite: false }), { cast: false, rot: [-Math.PI / 2, 0, 0] });
            e.ringOut = mesh(new THREE.RingGeometry(0.95, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff7a5a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }), { cast: false, rot: [-Math.PI / 2, 0, 0] });
            scene.add(e.ring, e.ringOut);
          }
          e.ringOut.visible = true; audio.sfx('creak', { vol: 0.4, rate: 1.5 }); return;
        }
      }
      if (e.target) {
        const s = e.target; const dx = s.x - e.x, dz = s.z - e.z, d = Math.hypot(dx, dz);
        moveEnemy(e, dx, dz, def.speed * (1 + (D - 1) * 0.1), dt);
        if (d < def.r + 0.7) grab(e, s);
      } else {
        // geen vrije schapen: achter spelers aan
        const np = nearestPlayer(e.x, e.z);
        if (np) moveEnemy(e, np.x - e.x, np.z - e.z, def.speed * 0.8, dt); else moveEnemy(e, 0, 0, 0, dt);
      }
      // uit elkaars buurt blijven
      for (const o2 of enemies) if (o2 !== e && !o2.dying) { const dx = e.x - o2.x, dz = e.z - o2.z, d = Math.hypot(dx, dz), m = (def.r + o2.def.r) * 0.85; if (d < m && d > 0.001) { e.x += dx / d * (m - d) * 0.3; e.z += dz / d * (m - d) * 0.3; } }
    }
    function AIbomber(e, dt) {
      const def = e.def;
      if (e.state === 'enter') {
        const tx = Math.cos(e.ang) * e.orbitR, tz = Math.sin(e.ang) * e.orbitR * 0.75;
        moveEnemy(e, tx - e.x, tz - e.z, def.speed, dt);
        if (Math.hypot(tx - e.x, tz - e.z) < 0.8) { e.state = 'orbit'; e.cd = 1.2; }
        return;
      }
      e.ang += e.dir * 0.09 * dt;
      const tx = Math.cos(e.ang) * e.orbitR, tz = Math.sin(e.ang) * e.orbitR * 0.75;
      moveEnemy(e, tx - e.x, tz - e.z, def.speed * 0.6, dt);
      e.cd -= dt;
      if (e.cd <= 0) {
        const cands = sheep.filter((s) => s.state === 'pen' || s.state === 'return');
        if (cands.length) { throwBomb(e, cands[Math.floor(Math.random() * cands.length)]); e.cd = (3.6 + Math.random() * 1.5) / (1 + (D - 1) * 0.2); }
        else e.cd = 1;
      }
    }
    function AIslime(e, dt) {
      const def = e.def;
      const np = nearestPlayer(e.x, e.z);
      e.hopT += dt;
      const cyc = 0.9;
      const k = (e.hopT % cyc) / cyc;
      e.hopping = k < 0.55; e.hopPh = k / 0.55 * Math.PI;
      if (np && e.hopping) moveEnemy(e, np.x - e.x, np.z - e.z, def.speed, dt, 14); else { e.vx = damp(e.vx, 0, 12, dt); e.vz = damp(e.vz, 0, 12, dt); }
      for (const o2 of enemies) if (o2 !== e && !o2.dying && o2.type.startsWith('slime')) { const dx = e.x - o2.x, dz = e.z - o2.z, d = Math.hypot(dx, dz), m = (def.r + o2.def.r) * 0.9; if (d < m && d > 0.001) { e.x += dx / d * (m - d) * 0.4; e.z += dz / d * (m - d) * 0.4; } }
    }

    function updateStones(dt) {
      for (const s of stones) {
        if (!s.on) continue;
        s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt;
        s.m.position.set(s.x, s.y, s.z); s.m.rotation.x += dt * 20; s.m.rotation.z += dt * 13;
        if (Math.random() < 0.5) fx.particles.emit(s.x, s.y, s.z, 0, 0, 0, { life: 0.22, size: 0.22, color: 0xdcd6c8, gravity: 0 });
        let hit = false;
        if (s.life <= 0 || Math.abs(s.x) > 32 || Math.abs(s.z) > 22) hit = true;
        if (!hit) for (const e of enemies) {
          if (!e.active || e.dying > 0) continue;
          const dx = e.x - s.x, dz = e.z - s.z; const rr = e.def.r + 0.25;
          if (dx * dx + dz * dz < rr * rr) { const L = Math.hypot(s.vx, s.vz) || 1; hitEnemy(e, 1, s.vx / L, s.vz / L); hit = true; break; }
        }
        if (!hit) for (const b of bombs) {
          if (!b.on || b.y > 3.4) continue;
          const dx = b.x - s.x, dz = b.z - s.z; if (dx * dx + dz * dz < 0.95 * 0.95) {
            b.on = false; b.g.visible = b.ring.visible = b.disc.visible = false; explode(b.x, b.z, b.y, true);
            fx.texts.add('Bom onschadelijk! +15', b.x, b.y + 1, b.z, '#7aff9a', 1); score += 15; hit = true; break;
          }
        }
        if (!hit) for (const ob of obstacles) { if (ob.r > 0.9 && (s.x - ob.x) ** 2 + (s.z - ob.z) ** 2 < ob.r * ob.r * 0.8) { hit = true; fx.particles.burst(s.x, 1, s.z, { count: 4, color: 0xb8b4aa, speed: 2, size: 0.18 }); break; } }
        if (hit) { s.on = false; s.m.visible = false; }
      }
    }
    function updateBombs(dt) {
      if (flashT > 0) { flashT -= dt; flash.intensity = Math.max(0, flash.intensity - dt * 24); if (flashT <= 0) flash.intensity = 0; }
      for (const d of decals) if (d.life > 0) { d.life -= dt; d.m.material.opacity = Math.min(0.55, d.life / 4 * 0.55); if (d.life <= 0) d.m.visible = false; }
      for (const b of bombs) {
        if (!b.on) continue;
        b.t += dt; const k = b.t / b.T;
        b.x = lerp(b.sx, b.ex, k); b.z = lerp(b.sz, b.ez, k);
        b.y = lerp(b.sy, 0.5, k) + Math.sin(k * Math.PI) * 5.2;
        b.g.position.set(b.x, b.y, b.z); b.g.rotation.x += dt * 8; b.spark.scale.setScalar(1 + Math.sin(t * 30) * 0.4);
        fx.particles.emit(b.x, b.y + 0.5, b.z, rand(-0.3, 0.3), rand(0.5, 1.5), rand(-0.3, 0.3), { life: 0.3, size: 0.25, color: 0xffb020, gravity: 0 });
        b.ring.scale.setScalar(BOMB_R * (1 - 0.06 * Math.sin(t * 20) )); b.ring.material.opacity = 0.5 + 0.4 * Math.sin(t * 18);
        b.disc.material.opacity = 0.1 + k * 0.25;
        if (k >= 1) { b.on = false; b.g.visible = b.ring.visible = b.disc.visible = false; explode(b.ex, b.ez); }
      }
    }
    function updatePickups(dt) {
      for (const pk of pickups) {
        if (!pk.on) continue;
        pk.life -= dt; pk.ph += dt * 3;
        const it = pk.items[pk.kind]; it.position.y = 1.3 + Math.sin(pk.ph) * 0.2; it.rotation.y += dt * 2.2;
        pk.beam.material.opacity = 0.14 + Math.sin(pk.ph * 1.5) * 0.05; pk.base.scale.setScalar(1 + Math.sin(pk.ph * 2) * 0.08);
        pk.g.visible = pk.life > 3 || Math.sin(t * 16) > -0.2;
        if (Math.random() < dt * 5) fx.particles.emit(pk.x + rand(-0.5, 0.5), 0.3, pk.z + rand(-0.5, 0.5), 0, 1.5, 0, { life: 0.8, size: 0.22, color: pickups.colors[pk.kind], gravity: -0.5 });
        for (const p of pl) {
          if (p.ko || Math.hypot(p.x - pk.x, p.z - pk.z) > 1.4) continue;
          if (pk.kind === 'heart') {
            const target = p.hp < 3 ? p : (!pl[1 - p.i].ko && pl[1 - p.i].hp < 3 && Math.hypot(pl[1 - p.i].x - pk.x, pl[1 - p.i].z - pk.z) < 6 ? pl[1 - p.i] : null);
            if (!target) continue;
            target.hp = Math.min(3, target.hp + 1); fx.texts.add('+❤', target.x, 3, target.z, '#ff7aa0', 1.1); fx.particles.burst(target.x, 1.3, target.z, { count: 14, colors: [0xff5a8a, 0xffd0e0], speed: 3, size: 0.3 });
          } else {
            for (const q of pl) { if (pk.kind === 'rapid') q.rapid = 10; else q.triple = 10; }
            fx.texts.add(pk.kind === 'rapid' ? 'Snelvuur! ⚡' : 'Driedubbel! ✴️', p.x, 3, p.z, pk.kind === 'rapid' ? '#ffe14a' : '#58e0ff', 1.2);
            fx.particles.burst(pk.x, 1.3, pk.z, { count: 20, colors: [pickups.colors[pk.kind], 0xffffff], speed: 5, size: 0.3 });
          }
          audio.sfx('powerup', { vol: 0.8 }); pk.on = false; pk.g.visible = false; break;
        }
        if (pk.life <= 0) { pk.on = false; pk.g.visible = false; }
      }
    }

    function updateWaves(dt) {
      if (over) return;
      if (stage === 'intro') { stageT -= dt; if (stageT <= 0) startWave(0); return; }
      if (stage === 'wave') {
        waveT += dt;
        for (const s of sched) if (!s.done && s.w === wave && s.t <= waveT) { if (doSpawn(s.type)) s.done = true; else break; }
        if (waveT >= WAVE_DUR[wave]) {
          if (wave < 2) { stage = 'rest'; stageT = 5.5; hud.showBig('Even rust...', 1400, '#9ad8ff'); audio.sfx('win', { vol: 0.35 }); const [x, z] = randomPickupSpot(); dropPickup(x, z, pl.some((p) => p.hp < 3 || p.ko) ? 'heart' : 'rapid'); sjoerd.pose = 'cheer'; sjoerdT = 3; }
          else { stage = 'tail'; tailT = 5; }
        }
      } else if (stage === 'rest') {
        stageT -= dt;
        if (stageT <= 0) startWave(wave + 1);
      } else if (stage === 'tail') {
        tailT -= dt;
        if (tailT <= 0) { tailT = 7; doSpawn('goblin'); doSpawn(Math.random() < 0.5 ? 'runner' : 'goblin'); }
      }
      // pickups
      pickT -= dt;
      if (pickT <= 0 && stage !== 'intro') { pickT = wave === 2 ? rand(7, 10) : rand(9, 14); if (pickups.filter((q) => q.on).length < 3) { const [x, z] = randomPickupSpot(); dropPickup(x, z); } }
    }

    function cameraFollow(dt) {
      let cx = 0, cz = 0, n = 0; for (const p of pl) { cx += p.x; cz += p.z; n++; }
      cx /= n; cz /= n;
      camT.x = damp(camT.x, cx * 0.12, 2, dt); const z0 = 0.8 + cz * 0.06; camT.z = damp(camT.z, z0, 2, dt);
      setCam(camera.aspect);
    }

    function ambient(dt) {
      world.update(dt, t);
      if (sjoerdT > 0) { sjoerdT -= dt; if (sjoerdT <= 0) sjoerd.pose = 'wave'; }
      sjoerd.update(dt);
    }

    function update(dt) {
      t += dt; gameT += dt;
      ambient(dt);
      if (!over && gameT > TIME_CAP) { outcome = { kind: 'timeout' }; over = true; endT = 1.5; hud.showBig('Tijd om!', 1500, '#ffb27a'); }
      updateWaves(dt);
      updatePlayers(dt);
      for (const s of sheep) updateSheep(s, dt);
      for (const e of enemies.slice()) updateEnemy(e, dt);
      updateStones(dt); updateBombs(dt); updatePickups(dt);
      cameraFollow(dt);
      hudUpdate();
      if (over && endT > 0) { endT -= dt; if (endT <= 0) finishNow(); }
    }
    function idleUpdate(dt) {
      t += dt; ambient(dt);
      for (const s of sheep) updateSheep(s, dt);
      for (const p of pl) { p.c.update(dt); p.holder.position.set(p.x, p.cy, p.z); p.sh.position.set(p.x, 0.06, p.z); p.ring.position.set(p.x, 0.08, p.z); p.arrow.position.set(p.x, 0, p.z); p.arrow.rotation.y = Math.atan2(p.ax, p.az); p.reticle.visible = false; p.hearts.forEach((h, k) => { h.position.set(p.x + (k - 1) * 0.55, p.c.height + 0.75, p.z + 0.1); }); p.bar.show(false); }
    }
    idleUpdate(0.016);

    return {
      update,
      introUpdate: idleUpdate,
      resultUpdate(dt) { t += dt; ambient(dt); pl.forEach((p) => { p.c.update(dt); }); for (const s of sheep) updateSheep(s, dt); for (const e of enemies.slice()) updateEnemy(e, dt); },
      onResize() { setCam(camera.aspect); },
      dispose() {},
      debug: { pl, sheep, enemies, bombs, pickups, ko: (i) => { const p = pl[i]; for (let k = 0; k < 3; k++) { p.inv = 0; p.roll = 0; hurtPlayer(p, p.x + 1, p.z, 'x'); } }, drop: (x, z, k) => dropPickup(x, z, k), spawn: (ty, x, z) => spawnEnemy(ty, x, z), get state() { return { wave, stage, waveT, sheepLeft, score, over, outcome, kills: killsMain, spawned: spawnedMain, hitsTaken, hitSrc: JSON.stringify(hitSrc), king: king && king.active ? king.hp : null }; }, set zoom(v) { zoomMul = v; }, set god(v) { pl.forEach((p) => { p.hp = 3; p.inv = 1e6; }); } },
    };
  },
};

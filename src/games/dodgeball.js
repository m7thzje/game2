import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { buildCourt, glowSprite, FLOOR_X, FLOOR_Z } from './dodgeball_world.js';
import { createBall } from './dodgeball_balls.js';

// Vuurbal-Duel — Mario Party-dodgeball in het kasteelhof van Koning Klopper.
// Iedere broer heeft een eigen helft. Gooi vuurballen (A ingedrukt = harder), duik weg (B) of vang (A vlak voor de inslag).
// 3 hartjes elk. Gimmicks: gouden bal (stuitert terug), bom-bal (3 sec), reuzenpompoen (valt uit de lucht), comeback-schild.
// Na 80 s sudden death: de arena krimpt en het regent vuurballen.

const HX = 14.4, HZ = 8.5, HX_MIN = 8.6, HZ_MIN = 5.6;     // speelveld (halve afmetingen) begin / minimum
const PR = 0.88, PH = 2.3, VIS = 1.5, SPEED = 8.4, MID = 0.5;
const G0 = 34, SD_AT = 80, END_AT = 90, CAP_AT = 125, FALL_T = 1.15;
const RDUR = 0.5, RIFR = 0.36, RCD = 1.5;
const FIRE_N = 7;
const HEART_MAX = 3;
const PITCH = 0.82;

export default {
  id: 'dodgeball',
  name: 'Vuurbal-Duel',
  giver: 'Koning Klopper',
  icon: '🔥',
  mode: 'pvp',
  time: 90,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'game_fast',
  blurb: 'In het kasteelhof van Koning Klopper vliegen <b>vuurballen</b>! Ieder heeft een eigen helft. Raak je broer en hij verliest een <b>hartje</b>; wie er 3 kwijt is, verliest. Pas op voor de <b>bom-bal</b>, de <b>gouden bal</b> die terugstuitert en de <b>reuzenpompoen</b>. Na 80 seconden: <b>sudden death</b>!',
  controls: ['{move} lopen en richten', '{a} gooien (ingedrukt = harder)', '{a} vlak voor een inslag = VANGEN', '{b} wegduiken'],
  tip: 'Vang je een bal precies op tijd, dan is hij van jou én verliest je broer een hartje. Wie nog maar 1 hartje heeft, krijgt een schild en vuurwoede!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tid = ctx.twist.id;
    const grav = pv.gravity;
    const tempo = tid === 'turbo' ? 1.25 : tid === 'slowmo' ? 0.8 : 1;
    const L = ctx.lights('dusk', { shadow: 22, center: [0, 0, 0], fogNear: 90, fogFar: 300 });
    L.sun.position.set(14, 36, 18); L.sun.intensity = 1.9; L.sun.color.set(0xffd9a8);
    L.hemi.intensity = 1.25; L.hemi.color.set(0xc8b8ff); L.hemi.groundColor.set(0x7a5a4a);
    camera.fov = 46; camera.updateProjectionMatrix();
    const world = buildCourt(ctx, { HX, HZ });

    // ---------------- toestand ----------------
    let T = 0, clock = 0, done = false, over = false, freeze = 0, sd = false, deathmatch = false, introT = 0;
    const ext = { x: HX, z: HZ };
    let supplyT = 0.8, specialT = 8, specialN = 0, rainT = 0, rainN = 0, koT = 0, camK = 0, koFocus = null;
    const stat = { hits: [0, 0], catches: [0, 0], dodges: [0, 0], goldHits: 0, pump: 0, bombs: 0, own: 0 };

    // ---------------- camera past altijd om het hele veld ----------------
    const tgt = new THREE.Vector3(0, 1.0, 0.6), camBase = new THREE.Vector3(), camDir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const fitPts = [[-FLOOR_X, 0, -FLOOR_Z], [FLOOR_X, 0, -FLOOR_Z], [-FLOOR_X, 0, FLOOR_Z + 0.4], [FLOOR_X, 0, FLOOR_Z + 0.4], [-12.5, 5.4, -HZ], [12.5, 5.4, -HZ], [-12.5, 3.5, HZ], [12.5, 3.5, HZ]];
    function fitCamera() {
      const v = new THREE.Vector3(); let lo = 12, hi = 140;
      for (let it = 0; it < 24; it++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(camDir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.95 || v.y > 0.96 || v.y < -0.93) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camBase.copy(tgt).addScaledVector(camDir, hi);
    }
    fitCamera();

    // ---------------- gedeelde meshes ----------------
    const ringGeo = new THREE.RingGeometry(0.82, 1.08, 32);
    const discGeo = new THREE.CircleGeometry(1, 28);
    const blobTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const blobGeo = new THREE.PlaneGeometry(2, 2);
    const mkBlob = () => { const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.visible = false; scene.add(m); return m; };

    // ---------------- spelers ----------------
    const START = [-8.2, 8.2];
    function heartTex(p) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d');
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; p.labelCv = cv; p.labelTx = tx; return tx;
    }
    function drawHeart(g, cx, cy, s, full) {
      g.beginPath(); g.moveTo(cx, cy + s * 0.95); g.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.8, cy - s * 1.3, cx, cy - s * 0.4); g.bezierCurveTo(cx + s * 0.8, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.95); g.closePath();
      g.lineWidth = 6; g.strokeStyle = 'rgba(20,5,20,.95)'; g.stroke(); g.fillStyle = full ? '#ff3b4e' : 'rgba(90,80,100,.75)'; g.fill();
      if (full) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(cx - s * 0.5, cy - s * 0.35, s * 0.22, s * 0.14, -0.6, 0, TAU); g.fill(); }
    }
    function refreshLabel(p) {
      const g = p.labelCv.getContext('2d'); g.clearRect(0, 0, 256, 128);
      g.font = 'bold 46px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.92)'; g.strokeText(names[p.i], 128, 30); g.fillStyle = players[p.i].css; g.fillText(names[p.i], 128, 30);
      for (let k = 0; k < HEART_MAX; k++) drawHeart(g, 128 + (k - 1) * 66, 88, 24, k < p.hearts);
      p.labelTx.needsUpdate = true;
    }
    const pl = players.map((pp, i) => {
      const c = ctx.make.brother(i); const sz = pv.size(i);
      const holder = new THREE.Group(), pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.position.y = 0.95; c.group.position.y = -0.95; pivot.add(c.group); holder.add(pivot); scene.add(holder);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })); bubble.position.y = 1.0; bubble.visible = false; holder.add(bubble);
      const rage = glowSprite(0xff3a1a, 4.4, 0.7); rage.position.y = 1.0; rage.visible = false; holder.add(rage);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const catchRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); catchRing.rotation.x = -Math.PI / 2; catchRing.visible = false; scene.add(catchRing);
      const aimRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); aimRing.rotation.x = -Math.PI / 2; aimRing.visible = false; scene.add(aimRing);
      const aimDisc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.3, depthWrite: false })); aimDisc.rotation.x = -Math.PI / 2; aimDisc.visible = false; scene.add(aimDisc);
      const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), 16); dots.count = 0; dots.frustumCulled = false; scene.add(dots);
      const blob = mkBlob();
      const p = {
        i, c, holder, pivot, bubble, rage, ring, catchRing, aimRing, aimDisc, dots, blob, sz,
        label: null, x: START[i], z: 0, y: 0, vy: 0, vx: 0, vz: 0, face: i ? -Math.PI / 2 : Math.PI / 2, yaw: i ? -Math.PI / 2 : Math.PI / 2,
        hearts: HEART_MAX, inv: 0, stun: 0, roll: 0, rollCd: 0, rdx: 0, rdz: 0, flip: 0, catchT: 0, catchCd: 0, ball: null, charging: false, charge: 0, holdT: 0,
        shield: 0, rageOn: false, throwT: 0, ko: false, cheer: false, tickT: 0, hitFlash: 0,
      };
      heartTex(p); refreshLabel(p);
      p.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: p.labelTx, transparent: true, depthTest: false })); p.label.scale.set(3.0, 1.5, 1); p.label.renderOrder = 15; scene.add(p.label);
      holder.scale.setScalar(VIS * sz);
      return p;
    });
    const opp = (p) => pl[1 - p.i];

    // ---------------- ballen ----------------
    const balls = [];
    function newBall(type) {
      const v = createBall(type); v.group.visible = false; scene.add(v.group);
      const b = { type, v, r: v.r, blob: mkBlob(), state: 'off', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, thrower: -1, holder: null, live: false, contacts: 0, rolling: false, returning: false, fuse: 3, armed: false, hitCool: [0, 0], g: G0 * grav, age: 0 };
      balls.push(b); return b;
    }
    const fire = Array.from({ length: FIRE_N }, () => newBall('fire'));
    const gold = newBall('gold'), bomb = newBall('bomb'), pumpkin = newBall('pumpkin');
    // meteoren (sudden death): alleen visueel
    const meteors = Array.from({ length: 4 }, () => { const v = createBall('fire'); v.group.visible = false; v.group.scale.setScalar(1.5); scene.add(v.group); return { v, busy: false }; });
    // waarschuwingsringen + inslag-sporen
    const warns = Array.from({ length: 10 }, () => {
      const g = new THREE.Group(); const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.25, depthWrite: false })); d.rotation.x = -Math.PI / 2;
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; g.add(d, r); g.visible = false; g.position.y = 0.06; scene.add(g);
      return { g, d, r, busy: false };
    });
    const scorchTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(10,6,4,.85)'); gr.addColorStop(0.6, 'rgba(20,12,8,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const scorches = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.visible = false; scene.add(m); return { m, t: 0 }; });
    let scN = 0;
    function scorch(x, z, r) { const s = scorches[scN++ % scorches.length]; s.m.position.set(x, 0.05, z); s.m.scale.setScalar(r); s.m.material.opacity = 1; s.m.visible = true; s.t = 9; }
    const drops = [];

    // ---------------- hulpfuncties ----------------
    const sfx = (n, o) => audio.sfx(n, o);
    const hpStr = (p) => '❤️'.repeat(p.hearts) + '🖤'.repeat(Math.max(0, HEART_MAX - p.hearts));
    function refreshHud() {
      hud.setPlayerInfo(0, hpStr(pl[0]) + (pl[0].shield > 0 ? ' 🛡️' : '')); hud.setPlayerInfo(1, hpStr(pl[1]) + (pl[1].shield > 0 ? ' 🛡️' : ''));
      hud.setScore(deathmatch ? 'EERSTE TREFFER WINT!' : sd ? '🔥 SUDDEN DEATH 🔥' : `${stat.hits[0]} treffers – ${stat.hits[1]} treffers`);
    }
    const pickable = (b) => b.state === 'rest' || (b.state === 'air' && !b.live && b.y < b.r + 0.8 && Math.hypot(b.vx, b.vz) < 5.5);
    function playerBounds(p) {
      const r = PR * p.sz;
      const lo = p.i ? MID + r : -ext.x + r, hi = p.i ? ext.x - r : -MID - r;
      return [lo, hi, -ext.z + r, ext.z - r];
    }
    function spark(x, y, z, n, cols, sp = 5) { fx.particles.burst(x, y, z, { count: n, speed: sp, up: 1.2, life: 0.7, size: 0.4, colors: cols, gravity: 9 }); }
    const FIRE_COLS = [0xff4010, 0xff9a20, 0xffe070, 0xffffff], GOLD_COLS = [0xffd23f, 0xfff3b0, 0xffffff, 0xffa020], SMOKE = [0x333333, 0x555555, 0x777777];

    // ---------------- ballen neerzetten ----------------
    function placeRest(b, x, z, extraVx = 0, extraVz = 0) {
      b.state = 'rest'; b.x = x; b.z = z; b.y = b.r; b.vx = extraVx; b.vy = 0; b.vz = extraVz; b.live = false; b.rolling = true; b.owner = -1; b.holder = null; b.contacts = 1; b.returning = false; b.g = G0 * grav;
      if (b.type === 'bomb') { b.armed = true; b.fuse = 3; }
      b.v.group.visible = true; b.blob.visible = true;
    }
    function removeBall(b) { if (b.holder) { b.holder.ball = null; b.holder.charging = false; b.holder.charge = 0; } b.state = 'off'; b.holder = null; b.v.group.visible = false; b.blob.visible = false; b.armed = false; b.live = false; }
    function warnRing(x, z, rad, t, col = 0xff3a20) {
      const w = warns.find((q) => !q.busy); if (!w) return null;
      w.busy = true; w.g.visible = true; w.g.position.set(x, 0.06, z); w.rad = rad; w.t = t; w.t0 = t; w.d.material.color.set(col); w.r.material.color.set(col === 0xff3a20 ? 0xffe14a : 0xffffff); w.g.scale.setScalar(rad); return w;
    }
    // laat een bal uit de lucht vallen
    function dropBall(b, x, z, o = {}) {
      b.state = 'drop'; b.x = x; b.z = z; b.live = false; b.vx = b.vy = b.vz = 0; b.holder = null; b.owner = -1; b.contacts = 0; b.rolling = false; b.returning = false; b.g = G0 * grav; b.armed = false;
      b.v.group.visible = true; b.blob.visible = true; b.v.group.scale.setScalar(1);
      const d = { kind: o.kind || 'supply', b, x, z, t: FALL_T, aoe: o.aoe || 0, ring: warnRing(x, z, o.aoe || Math.max(1.0, b.r * 1.3), FALL_T, o.col || (o.aoe ? 0xff3a20 : 0xffffff)) };
      drops.push(d); b.y = b.r + 0.5 * G0 * FALL_T * FALL_T;
    }
    function dropMeteor(x, z) {
      const m = meteors.find((q) => !q.busy); if (!m) return;
      m.busy = true; m.v.group.visible = true;
      drops.push({ kind: 'meteor', m, x, z, t: FALL_T * 0.9, aoe: 1.9, ring: warnRing(x, z, 1.9, FALL_T * 0.9) });
    }
    function impactAoE(x, z, rad, by, why, big) {
      spark(x, 0.5, z, big ? 70 : 40, FIRE_COLS, big ? 9 : 6); spark(x, 0.8, z, 20, SMOKE, 3);
      fx.particles.ring(x, 0.3, z, { count: 30, speed: big ? 9 : 7, color: 0xffb040, size: 0.45, life: 0.5 });
      sfx('explode', { vol: big ? 0.9 : 0.6, rate: big ? 0.8 : 1.1 }); ctx.shake(big ? 0.7 : 0.45); scorch(x, z, rad * 1.1); world.cheer(0.8);
      for (const p of pl) {
        if (p.ko) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < rad + PR * p.sz * 0.5) {
          if (p.roll > 0 && p.roll > RDUR - RIFR) { fx.texts.add('DUIK!', p.x, 3.6, p.z, '#9fe8ff', 1.1); stat.dodges[p.i]++; continue; }
          if (p.inv > 0) continue;
          hurt(p, 1, { x, z, by: why === 'bomb' ? by : -1 }, { stun: why === 'pumpkin' ? 1.0 : 0.6, kb: 9 });
        }
      }
    }
    function updateDrops(dt) {
      for (let k = drops.length - 1; k >= 0; k--) {
        const d = drops[k]; d.t -= dt;
        const w = d.ring; if (w) { w.t = d.t; }
        if (d.kind === 'meteor') {
          const y = 0.5 * G0 * Math.max(0, d.t) * Math.max(0, d.t) + 0.55;
          d.m.v.group.position.set(d.x, y, d.z); d.m.v.tick(clock, dt, 0, -G0 * d.t, 0, {});
        } else { d.b.y = d.b.r + 0.5 * G0 * Math.max(0, d.t) * Math.max(0, d.t); d.b.x = d.x; d.b.z = d.z; }
        if (d.t > 0) continue;
        // inslag
        drops.splice(k, 1); if (w) { w.busy = false; w.g.visible = false; }
        if (d.kind === 'meteor') { d.m.busy = false; d.m.v.group.visible = false; impactAoE(d.x, d.z, 1.9, -1, 'meteor', false); continue; }
        const b = d.b; b.y = b.r;
        if (d.kind === 'pumpkin') {
          stat.pump++; impactAoE(d.x, d.z, d.aoe, -1, 'pumpkin', true); ctx.shake(0.9); hud.toast('BOEM! De reuzenpompoen rolt door...', 1500);
          b.state = 'air'; b.contacts = 1; b.rolling = true; b.live = true; b.owner = -1; const a = rand(0, TAU); b.vx = Math.cos(a) * 8; b.vz = Math.sin(a) * 8; b.vy = 0;
        } else {
          spark(d.x, 0.4, d.z, d.kind === 'gold' ? 26 : 16, d.kind === 'gold' ? GOLD_COLS : FIRE_COLS, 4); sfx('thud', { vol: 0.5 }); ctx.shake(0.15);
          fx.particles.ring(d.x, 0.2, d.z, { count: 16, speed: 4.5, color: d.kind === 'gold' ? 0xffe070 : 0xffa040, size: 0.3, life: 0.45 });
          const sgn = Math.random() < 0.5 ? -1 : 1;
          placeRest(b, d.x, d.z, sgn * rand(0.5, 2), rand(-1.5, 1.5)); b.state = 'air'; b.rolling = false; b.vy = 5.5; b.contacts = 1;
        }
      }
    }
    // gewone bal bij start
    function placeStart() {
      [[0, -3.6], [0, 3.6], [-4.4, 0.4], [4.4, -0.4]].forEach(([x, z], k) => { placeRest(fire[k], x, z); });
    }
    placeStart();

    // ---------------- gooien ----------------
    function aimDir(p) {
      let ax = Math.sin(p.face), az = Math.cos(p.face);
      const o = opp(p), dx = o.x - p.x, dz = o.z - p.z, dl = Math.hypot(dx, dz) || 1, dot = (ax * dx + az * dz) / dl;
      if (dot > 0.8) { const k = clamp((dot - 0.8) / 0.2, 0, 1) * 0.5; ax = lerp(ax, dx / dl, k); az = lerp(az, dz / dl, k); const l = Math.hypot(ax, az); ax /= l; az /= l; }
      return [ax, az];
    }
    const TR = {};
    function trajectory(p, charge, b) {
      const [ax, az] = aimDir(p); const pump = b.type === 'pumpkin';
      let D = lerp(pump ? 3 : 4.5, pump ? 13 : 27, charge);
      const lx = ax > 0.001 ? (ext.x - 0.4 - p.x) / ax : ax < -0.001 ? (-ext.x + 0.4 - p.x) / ax : 1e9;
      const lz = az > 0.001 ? (ext.z - 0.4 - p.z) / az : az < -0.001 ? (-ext.z + 0.4 - p.z) / az : 1e9;
      D = Math.max(1.5, Math.min(D, lx, lz));
      const y0 = 3.0 * p.sz, yEnd = b.r;
      const apex = pump ? y0 + 0.6 : Math.max(y0 + 0.8, 3.2 + D * 0.1);
      const g = G0 * grav * tempo * tempo * (p.rageOn ? 1.32 : 1);
      const tUp = Math.sqrt(2 * (apex - y0) / g), tDn = Math.sqrt(2 * (apex - yEnd) / g), Tt = tUp + tDn;
      TR.ax = ax; TR.az = az; TR.D = D; TR.y0 = y0; TR.g = g; TR.T = Tt; TR.vh = D / Tt; TR.vy = g * tUp; TR.tx = p.x + ax * D; TR.tz = p.z + az * D; TR.sx = p.x + ax * 0.7; TR.sz = p.z + az * 0.7;
      return TR;
    }
    function throwBall(p, charge) {
      const b = p.ball; if (!b) return;
      const t = trajectory(p, charge, b);
      b.state = 'air'; b.live = true; b.owner = p.i; b.thrower = p.i; b.contacts = 0; b.rolling = false; b.returning = false; b.holder = null; b.g = t.g;
      b.x = t.sx; b.y = t.y0; b.z = t.sz; b.vx = t.ax * t.vh; b.vz = t.az * t.vh; b.vy = t.vy; b.hitCool[0] = b.hitCool[1] = 0; b.v.group.scale.setScalar(1);
      p.ball = null; p.charging = false; p.charge = 0; p.throwT = 0.28; p.c.swing(); p.holdT = 0;
      sfx('throw', { vol: 0.5 + 0.5 * charge, rate: 0.85 + 0.4 * charge + (b.type === 'pumpkin' ? -0.3 : 0) });
      spark(b.x, b.y, b.z, 10 + Math.round(charge * 14), b.type === 'gold' ? GOLD_COLS : FIRE_COLS, 3 + charge * 3);
      if (b.type === 'pumpkin') { p.vx -= t.ax * 5; p.vz -= t.az * 5; ctx.shake(0.2); }
      p.facing = Math.atan2(t.ax, t.az); p.face = p.facing;
    }
    function pickup(p, b) {
      b.state = 'held'; b.holder = p; b.live = false; p.ball = b; p.holdT = 0; p.charging = false; p.charge = 0; b.owner = p.i; b.rolling = false;
      sfx(b.type === 'gold' ? 'sparkle' : 'pop', { vol: 0.7 });
      const nm = { fire: 'VUURBAL!', gold: 'GOUDEN BAL!', bomb: 'BOM! GOOI SNEL!', pumpkin: 'REUZENPOMPOEN!' }[b.type];
      fx.texts.add(nm, p.x, 4.6 * p.sz + 0.8, p.z, b.type === 'gold' ? '#ffe14a' : b.type === 'bomb' ? '#ff6a4a' : b.type === 'pumpkin' ? '#ffb040' : '#ffffff', b.type === 'fire' ? 0.9 : 1.2);
      spark(p.x, 2.5 * p.sz, p.z, 8, b.type === 'gold' ? GOLD_COLS : FIRE_COLS, 3);
      p.c.squash = 0.12;
    }

    // ---------------- schade / hartjes ----------------
    function hurt(p, dmg, src, o = {}) {
      if (over || p.ko) return false;
      if (p.shield > 0) {
        p.shield = 0; p.inv = 0.9; sfx('ding', { vol: 0.8 }); sfx('boing', { vol: 0.5 }); ctx.shake(0.2);
        spark(p.x, 2, p.z, 30, [0x7ad8ff, 0xffffff, 0xbff4ff], 7); fx.texts.add('SCHILD!', p.x, 4.4 * p.sz + 0.6, p.z, '#7ad8ff', 1.2); refreshHud(); return false;
      }
      const before = p.hearts;
      p.hearts = deathmatch ? 0 : Math.max(0, p.hearts - dmg);
      p.inv = o.catch ? 0.9 : 1.7; p.stun = o.stun != null ? o.stun : 0.55; p.charging = false; p.charge = 0; p.roll = 0; p.catchT = 0; p.hitFlash = 0.4;
      const dx = p.x - src.x, dz = p.z - src.z, dl = Math.hypot(dx, dz) || 1, kb = o.kb != null ? o.kb : 6;
      p.vx = dx / dl * kb; p.vz = dz / dl * kb;
      if (p.ball) { const b = p.ball; b.state = 'air'; b.holder = null; b.live = false; b.x = p.x; b.y = 3; b.z = p.z; b.vx = rand(-3, 3); b.vz = rand(-3, 3); b.vy = 6; b.contacts = 1; b.rolling = false; b.owner = -1; p.ball = null; }
      if (src.by != null && src.by >= 0 && src.by !== p.i) stat.hits[src.by]++; else if (src.by === p.i) stat.own++;
      spark(p.x, 2, p.z, 36, FIRE_COLS, 7); spark(p.x, 2.2, p.z, 10, SMOKE, 3);
      fx.texts.add(o.catch ? 'AUW! VANGST!' : pick(['AUW!', 'AU!', 'AAAH!', 'HEET!']), p.x, 4.4 * p.sz + 0.6, p.z, '#ff6a4a', 1.2);
      sfx('hurt', { vol: 0.9 }); sfx('hit', { vol: 0.8 }); ctx.shake(o.big ? 0.8 : 0.5); freeze = Math.max(freeze, 0.09); world.cheer(1);
      refreshLabel(p); refreshHud();
      if (p.hearts <= 0) { ko(p); return true; }
      if (p.hearts === 1 && before > 1) comeback(p);
      return true;
    }
    function comeback(p) {
      p.shield = 6; p.rageOn = true; p.inv = Math.max(p.inv, 1.7);
      hud.showBig('LAATSTE HARTJE!', 1200, '#ff6a4a'); hud.toast(`${names[p.i]} krijgt een schild en vuurwoede!`, 2200);
      sfx('powerup', { vol: 0.9 }); spark(p.x, 1.5, p.z, 40, [0x7ad8ff, 0xffffff, 0xff9a30], 7);
    }
    function ko(p) {
      over = true; p.ko = true; p.koVy = 11; p.koT = 0; koFocus = p;
      const w = opp(p);
      p.vx = (p.x - w.x) * 0.6 + (p.i ? 5 : -5); p.vz = rand(-3, 3);
      sfx('lose', { vol: 0.8 }); ctx.shake(1); freeze = 0.18;
      for (const q of pl) { q.charging = false; if (q.ball) q.charge = 0; }
      endGame(w.i, `<b>${names[w.i]}</b> wint met ${w.hearts} hartje${w.hearts === 1 ? '' : 's'} over!`);
    }
    function endGame(winner, line) {
      if (done) return; done = true; over = true;
      const w = winner == null ? null : pl[winner];
      pl.forEach((q) => { q.cheer = q === w; });
      hud.setTimer(null);
      const jokes = ['Koning Klopper klapt in zijn handen.', 'Wat een vuurwerk!', 'De draak is onder de indruk.', 'Dat was heet!', 'De toeschouwers joelen.'];
      const sum = `${line}<br>Treffers ${stat.hits[0]} – ${stat.hits[1]} · vangsten ${stat.catches[0]} – ${stat.catches[1]} · duiken ${stat.dodges[0]} – ${stat.dodges[1]}<br>${pick(jokes)}`;
      ctx.finishPvp({ winner, score: [pl[0].hearts, pl[1].hearts], summary: sum, delay: w ? 2100 : 1200 });
      world.cheer(2);
    }
    function timeUp() {
      if (over) return;
      if (pl[0].hearts !== pl[1].hearts) { const w = pl[0].hearts > pl[1].hearts ? 0 : 1; hud.showBig('TIJD OM!', 1000, '#ffe14a'); endGame(w, `Tijd om! <b>${names[w]}</b> heeft de meeste hartjes.`); return; }
      if (!deathmatch) {
        deathmatch = true; pl.forEach((q) => { q.hearts = 1; q.shield = 0; q.rageOn = true; refreshLabel(q); });
        hud.showBig('GELIJK! EERSTE TREFFER WINT', 1800, '#ff6a4a'); sfx('bell'); refreshHud(); hud.setTimer(null);
      }
    }
    function capOut() {
      if (over) return;
      const h = stat.hits; const w = h[0] === h[1] ? null : h[0] > h[1] ? 0 : 1;
      endGame(w, w == null ? 'Echt gelijk! Wat een duel.' : `Na eindeloos vuurwerk wint <b>${names[w]}</b> op treffers.`);
    }
    function startSuddenDeath() {
      sd = true; hud.showBig('SUDDEN DEATH!', 1500, '#ff5a3a'); hud.toast('De arena krimpt en het regent vuurballen!', 2600);
      sfx('bell'); sfx('explode', { vol: 0.5, rate: 0.6 }); ctx.shake(0.8); audio.music && audio.music('tense'); world.roar(); rainT = 1.0;
      for (const b of [gold, bomb, pumpkin]) if (b.state === 'rest' || b.state === 'air') { spark(b.x, b.y, b.z, 24, SMOKE, 4); removeBall(b); }
      for (let k = drops.length - 1; k >= 0; k--) if (drops[k].kind !== 'meteor' && drops[k].b && drops[k].b.type !== 'fire') { const d = drops[k]; if (d.ring) { d.ring.busy = false; d.ring.g.visible = false; } removeBall(d.b); drops.splice(k, 1); }
      refreshHud();
    }

    // ---------------- vangen / raken ----------------
    function catchBall(p, b) {
      const th = b.owner >= 0 && !b.returning ? pl[b.owner] : null;
      b.state = 'held'; b.holder = p; p.ball = b; p.holdT = 0; b.live = false; b.owner = p.i; b.rolling = false; b.returning = false;
      p.catchT = 0; p.catchCd = 0.3; p.charging = false; p.charge = 0; stat.catches[p.i]++;
      spark(b.x, b.y, b.z, 36, GOLD_COLS, 7); fx.particles.ring(p.x, 1.6, p.z, { count: 22, speed: 6, color: 0xfff2a0, size: 0.4, life: 0.5 });
      fx.texts.add('VANGST!', p.x, 4.6 * p.sz + 0.8, p.z, '#ffe14a', 1.5); sfx('powerup', { vol: 0.9 }); sfx('ding'); ctx.shake(0.4); freeze = Math.max(freeze, 0.12); world.cheer(1);
      if (th && th !== p) hurt(th, 1, { x: p.x, z: p.z, by: p.i }, { catch: true, stun: 0.7, kb: 4 });
    }
    function contact(b, p) {
      if (p.catchT > 0 && b.type !== 'pumpkin' && !p.ball) { catchBall(p, b); return; }
      if (p.roll > 0 && p.roll > RDUR - RIFR) { b.hitCool[p.i] = 0.5; stat.dodges[p.i]++; fx.texts.add('DUIK!', p.x, 3.7 * p.sz, p.z, '#9fe8ff', 1.1); sfx('whoosh', { vol: 0.5, rate: 1.4 }); spark(p.x, 1, p.z, 8, [0x9fe8ff, 0xffffff], 4); return; }
      if (p.inv > 0) { b.hitCool[p.i] = 0.4; return; }
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const by = b.thrower;
      if (b.type === 'bomb') { explodeBomb(b, by); return; }
      let dmg = 1, o = { kb: 6.5 };
      if (b.type === 'gold' && !b.returning) { dmg = 2; o = { kb: 9, big: true, stun: 0.8 }; stat.goldHits++; fx.texts.add('DUBBEL!', p.x, 5.2 * p.sz + 0.6, p.z, '#ffe14a', 1.4); }
      if (b.type === 'gold' && b.returning) { o = { kb: 6 }; fx.texts.add('EIGEN BAL!', p.x, 5.2 * p.sz + 0.6, p.z, '#ffe14a', 1.2); }
      if (b.type === 'pumpkin') { o = { kb: 10, big: true, stun: 1.1 }; sfx('boing', { vol: 0.7, rate: 0.6 }); }
      const hit = hurt(p, dmg, { x: b.x - b.vx * 0.1, z: b.z - b.vz * 0.1, by }, o);
      b.hitCool[p.i] = 0.6;
      // de bal ketst af
      b.live = false; b.vx *= -0.25; b.vz *= -0.25; b.vy = Math.max(5, b.vy * -0.3); b.owner = -1; b.contacts = Math.max(b.contacts, 1); b.rolling = false;
      if (b.type === 'pumpkin') { b.vx = b.vz = 0; }
      return hit;
    }
    function explodeBomb(b, by) {
      stat.bombs++;
      const x = b.x, z = b.z;
      if (b.holder) { b.holder.ball = null; b.holder.charging = false; b.holder.charge = 0; b.holder = null; }
      b.state = 'off'; b.v.group.visible = false; b.blob.visible = false; b.armed = false; b.live = false;
      spark(x, 1, z, 90, FIRE_COLS, 11); spark(x, 1.5, z, 30, SMOKE, 5);
      fx.particles.ring(x, 0.4, z, { count: 40, speed: 11, color: 0xff9a30, size: 0.6, life: 0.55 });
      fx.texts.add('KABOEM!', x, 5, z, '#ff9a30', 1.7);
      impactAoE(x, z, 3.2, by, 'bomb', true);
    }

    // ---------------- ballen: fysica ----------------
    function goldReturn(b) {
      const th = pl[b.thrower] || pl[0]; b.returning = true; b.owner = -1; b.contacts = 0; b.rolling = false; b.live = true;
      const Tr = 1.25; b.vy = b.g * Tr / 2; b.vx = (th.x - b.x) / Tr; b.vz = (th.z - b.z) / Tr; b.y = b.r;
      spark(b.x, 0.6, b.z, 34, GOLD_COLS, 7); fx.texts.add('TERUG!', b.x, 3.4, b.z, '#ffe14a', 1.4); sfx('boing', { vol: 0.8, rate: 1.3 }); sfx('sparkle');
    }
    function groundHit(b) {
      b.contacts++; b.y = b.r; const impact = Math.abs(b.vy);
      if (impact > 3) { fx.particles.dust(b.x, 0.1, b.z, 3, 0x9a8f88); if (impact > 8) sfx('thud', { vol: clamp(impact / 25, 0.15, 0.6) }); }
      if (b.type === 'gold' && b.live && !b.returning) { goldReturn(b); return; }
      if (b.type === 'pumpkin') {
        b.owner = -1; b.vy = impact > 6 ? impact * 0.22 : 0; if (b.vy < 1.5) { b.vy = 0; b.rolling = true; }
        if (b.contacts === 1 && impact > 6) { ctx.shake(0.35); sfx('thud', { vol: 0.8, rate: 0.6 }); fx.particles.dust(b.x, 0.1, b.z, 8, 0xb0a090); }
        return;
      }
      if (b.type === 'fire' && b.contacts >= 2) b.live = false;
      if (b.type === 'gold' && b.returning) b.live = false;
      if (b.type === 'bomb') b.live = false;
      b.vy = impact * (b.contacts === 1 ? 0.55 : 0.4); b.vx *= 0.82; b.vz *= 0.82;
      if (b.vy < 2.8) { b.vy = 0; b.rolling = true; b.live = false; }
      if (b.live) spark(b.x, 0.3, b.z, 8, b.type === 'gold' ? GOLD_COLS : FIRE_COLS, 3);
    }
    function burn(b) { spark(b.x, b.y, b.z, 22, SMOKE.concat(FIRE_COLS), 4); sfx('sizzle', { vol: 0.5 }); removeBall(b); }
    function stepBall(b, h) {
      if (b.state === 'off' || b.state === 'drop') return;
      if (b.type === 'bomb' && b.armed) { b.fuse -= h; if (b.fuse <= 0) { explodeBomb(b, b.thrower); return; } }
      if (b.state === 'held' || b.state === 'rest') {
        if (b.state === 'rest' && sd && (Math.abs(b.x) > ext.x + 0.3 || Math.abs(b.z) > ext.z + 0.3)) burn(b);
        return;
      }
      b.age += h;
      if (!b.rolling) { b.vy -= b.g * h; b.y += b.vy * h; }
      b.x += b.vx * h; b.z += b.vz * h;
      if (b.rolling) {
        const sp = Math.hypot(b.vx, b.vz); let f = Math.exp(-(b.type === 'pumpkin' ? 0.75 : 1.0) * h); if (sp < 2.0) f *= Math.exp(-2.5 * h);
        b.vx *= f; b.vz *= f; b.y = b.r;
        if (b.type === 'pumpkin') b.live = sp > 4.5;
        if (sp < 0.3) { b.state = 'rest'; b.vx = b.vz = 0; b.live = false; }
      } else if (b.y <= b.r && b.vy < 0) groundHit(b);
      // muren (volle arena) en lava
      const wx = HX + 0.9, wz = HZ + 0.9;
      if (b.x > wx) { b.x = wx; b.vx = -Math.abs(b.vx) * 0.6; wallPuff(b); } else if (b.x < -wx) { b.x = -wx; b.vx = Math.abs(b.vx) * 0.6; wallPuff(b); }
      if (b.z > wz) { b.z = wz; b.vz = -Math.abs(b.vz) * 0.6; wallPuff(b); } else if (b.z < -wz) { b.z = -wz; b.vz = Math.abs(b.vz) * 0.6; wallPuff(b); }
      if (sd && (Math.abs(b.x) > ext.x + 0.2 || Math.abs(b.z) > ext.z + 0.2) && b.y < 2.5) { burn(b); return; }
      if (b.live) for (const p of pl) {
        if (p.ko) continue;
        if (b.owner === p.i) continue;
        if (b.hitCool[p.i] > 0) { b.hitCool[p.i] -= h; continue; }
        const dx = b.x - p.x, dz = b.z - p.z, rr = PR * p.sz + b.r * 0.85;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (b.y - b.r > PH * p.sz || b.y + b.r < 0.1) continue;
        contact(b, p); if (b.state === 'off') return;
      }
    }
    function wallPuff(b) { if (Math.hypot(b.vx, b.vz) > 3) { fx.particles.dust(b.x, b.y, b.z, 2, 0xa09890); } }

    // ---------------- speler: besturing ----------------
    function control(p, dt) {
      const inp = pv.input(p.i), sz = p.sz;
      p.inv = Math.max(0, p.inv - dt); p.stun = Math.max(0, p.stun - dt); p.rollCd = Math.max(0, p.rollCd - dt); p.catchCd = Math.max(0, p.catchCd - dt); p.throwT = Math.max(0, p.throwT - dt); p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (p.roll > 0) p.roll = Math.max(0, p.roll - dt);
      if (p.catchT > 0) { p.catchT -= dt; if (p.catchT <= 0) { p.catchT = 0; p.catchCd = Math.max(p.catchCd, 0.9); } }
      if (p.shield > 0) { p.shield -= dt; if (p.shield <= 0) { p.shield = 0; refreshHud(); } }
      const canAct = p.stun <= 0 && !over && !p.ko;
      const idle = !over;
      // duiken
      if (canAct && inp.bP && p.rollCd <= 0 && p.roll <= 0) {
        let dx = inp.x, dz = inp.y; const m = Math.hypot(dx, dz);
        if (m < 0.25) { dx = Math.sin(p.face); dz = Math.cos(p.face); } else { dx /= m; dz /= m; }
        p.rdx = dx; p.rdz = dz; p.roll = RDUR; p.rollCd = RCD + RDUR; p.charging = false; p.charge = 0; p.catchT = 0; p.face = Math.atan2(dx, dz);
        sfx('whoosh', { vol: 0.7, rate: 1.2 }); fx.particles.dust(p.x, 0, p.z, 6, 0xb0a090);
      }
      // vangen
      if (canAct && inp.aP && !p.ball && p.catchCd <= 0 && p.roll <= 0) { p.catchT = 0.34; sfx('swing', { vol: 0.35, rate: 1.5 }); }
      // opladen en gooien
      if (p.ball) {
        p.holdT += dt;
        if (canAct && p.roll <= 0) {
          if (inp.aP && !p.charging) { p.charging = true; p.charge = 0; sfx('select', { vol: 0.3, rate: 1.4 }); }
          if (p.charging) {
            p.charge = Math.min(1, p.charge + dt / (p.rageOn ? 0.6 : 0.95) * (tid === 'slowmo' ? 1 : 1));
            p.tickT -= dt; if (p.tickT <= 0) { p.tickT = 0.09; audio.tone && audio.tone(260 + p.charge * 800, 0.08, { type: 'triangle', vol: 0.05 }); }
            if (!inp.a || inp.aR) { throwBall(p, p.charge); }
          }
        } else if (p.charging && p.roll > 0) { p.charging = false; p.charge = 0; }
        if (p.ball && p.holdT > (p.ball.type === 'bomb' ? 99 : 7)) { fx.texts.add('TE HEET!', p.x, 4.4 * sz + 0.8, p.z, '#ff6a4a', 1.2); throwBall(p, 0.45); }
      }
      // bewegen
      let mx = canAct ? inp.x : 0, mz = canAct ? inp.y : 0;
      let sp = SPEED * pv.speed(p.i) * (p.charging ? 0.62 : 1) * (p.ball && p.ball.type === 'pumpkin' ? 0.68 : 1) * (p.rageOn ? 1.12 : 1) * (p.catchT > 0 ? 0.7 : 1);
      if (p.roll > 0) {
        const rs = 15.5 * pv.speed(p.i); p.vx = p.rdx * rs; p.vz = p.rdz * rs;
      } else {
        const lam = p.stun > 0 ? lerp(5, 1.2, pv.slip) : lerp(14, 1.4, pv.slip);
        p.vx = damp(p.vx, mx * sp, lam, dt); p.vz = damp(p.vz, mz * sp, lam, dt);
        if (canAct && Math.hypot(mx, mz) > 0.28) p.face = Math.atan2(mx, mz);
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      const [lo, hi, zlo, zhi] = playerBounds(p);
      if (p.x < lo) { p.x = lo; if (p.vx < 0) p.vx *= p.roll > 0 ? 0 : -0.2; } if (p.x > hi) { p.x = hi; if (p.vx > 0) p.vx *= p.roll > 0 ? 0 : -0.2; }
      if (p.z < zlo) { p.z = zlo; if (p.vz < 0) p.vz *= p.roll > 0 ? 0 : -0.2; } if (p.z > zhi) { p.z = zhi; if (p.vz > 0) p.vz *= p.roll > 0 ? 0 : -0.2; }
      // bal oprapen
      if (canAct && !p.ball && p.roll <= 0 && idle) for (const b of balls) {
        if (!pickable(b)) continue;
        if (b.type === 'bomb' && b.fuse < 0.9) continue;
        const dx = b.x - p.x, dz = b.z - p.z, rr = PR * sz + b.r + 0.75;
        if (dx * dx + dz * dz < rr * rr) { pickup(p, b); break; }
      }
    }

    // ---------------- aanvoer van ballen ----------------
    function supply(dt) {
      if (over) return;
      const target = sd ? 6 : 4; let n = 0; for (const b of fire) if (b.state !== 'off') n++;
      supplyT -= dt;
      if (supplyT <= 0 && n < target) {
        const b = fire.find((q) => q.state === 'off');
        if (b) { dropBall(b, sd ? rand(-ext.x * 0.5, ext.x * 0.5) : (Math.random() < 0.25 ? rand(-2, 2) : 0), rand(-ext.z + 1.2, ext.z - 1.2), { kind: 'supply' }); supplyT = sd ? 0.9 : 1.7; }
      }
      if (sd) {
        rainT -= dt;
        if (rainT <= 0) {
          rainN++; rainT = Math.max(0.5, 1.15 - rainN * 0.03);
          const alive = pl.filter((q) => !q.ko);
          let x, z; if (Math.random() < 0.55 && alive.length) { const q = pick(alive); x = q.x + rand(-3.5, 3.5); z = q.z + rand(-3.5, 3.5); } else { x = rand(-ext.x, ext.x); z = rand(-ext.z, ext.z); }
          dropMeteor(clamp(x, -ext.x + 0.5, ext.x - 0.5), clamp(z, -ext.z + 0.5, ext.z - 0.5));
        }
      } else {
        specialT -= dt;
        if (specialT <= 0 && T > 5) spawnSpecial();
      }
    }
    function spawnSpecial() {
      specialT = rand(8, 12);
      const lead = pl[0].hearts === pl[1].hearts ? -1 : pl[0].hearts > pl[1].hearts ? 0 : 1;   // wie voorstaat
      const behind = lead < 0 ? -1 : 1 - lead;
      const seq = ['bomb', 'gold', 'pumpkin']; let kind = specialN < 3 ? seq[specialN] : pick(['gold', 'bomb', 'pumpkin', 'gold']);
      if (specialN >= 3 && behind >= 0 && Math.random() < 0.4) kind = 'gold';
      specialN++;
      const b = { bomb, gold, pumpkin }[kind];
      if (b.state !== 'off') return;
      if (kind === 'pumpkin') {
        let x, z; const tgtP = lead >= 0 && Math.random() < 0.5 ? pl[lead] : pick(pl); x = clamp(tgtP.x + rand(-2.5, 2.5), -ext.x + 1.5, ext.x - 1.5); z = clamp(tgtP.z + rand(-2.5, 2.5), -ext.z + 1.5, ext.z - 1.5);
        if (Math.abs(x) < 1.5) x = Math.sign(x || 1) * 1.5;
        dropBall(b, x, z, { kind: 'pumpkin', aoe: 2.6 }); hud.toast('Kijk uit! Een reuzenpompoen valt uit de lucht!', 1800); sfx('bell', { vol: 0.5, rate: 0.7 });
      } else if (kind === 'gold') {
        const x = behind >= 0 ? (behind ? 2.4 : -2.4) : 0; dropBall(b, x, rand(-4.5, 4.5), { kind: 'gold' }); hud.toast(behind >= 0 ? `Een gouden bal voor ${names[behind]}!` : 'Een GOUDEN bal! Dubbel gevaar...', 1800); sfx('sparkle', { vol: 0.7 });
      } else {
        dropBall(b, 0, rand(-4.5, 4.5), { kind: 'bomb' }); hud.toast('Een bom-bal! Gooi hem snel terug...', 1800); sfx('bell', { vol: 0.5 });
      }
    }

    // ---------------- visuals ----------------
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
    function visuals(dt) {
      pl.forEach((p) => {
        const c = p.c, i = p.i, sz = p.sz;
        // KO-vlucht
        if (p.ko) { koT += dt; p.koVy -= 30 * dt; p.y = Math.max(0, p.y + p.koVy * dt); p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= Math.exp(-0.8 * dt); p.vz *= Math.exp(-0.8 * dt); if (p.y <= 0 && p.koVy < 0) { if (p.koVy < -6) { p.koVy = -p.koVy * 0.35; ctx.shake(0.3); sfx('thud', { vol: 0.5 }); fx.particles.dust(p.x, 0, p.z, 6); } else p.koVy = 0; } p.x = clamp(p.x, -HX - 1.5, HX + 1.5); p.z = clamp(p.z, -HZ - 1, HZ + 1); }
        p.yaw = dampAngle(p.yaw, p.face, 16, dt);
        p.pivot.rotation.y = p.yaw;
        let fl = 0;
        if (p.roll > 0) fl = -(1 - p.roll / RDUR) * TAU;
        p.pivot.rotation.x = p.ko ? (p.y > 0.05 ? -koT * 7 : -1.45) : fl;
        p.holder.position.set(p.x, p.y, p.z);
        p.holder.visible = true;
        const sp = Math.hypot(p.vx, p.vz);
        c.speed = p.roll > 0 || p.ko ? 0 : clamp(sp / SPEED, 0, 1);
        if (p.ko) c.pose = 'hands_up'; else if (done && p.cheer) c.pose = 'cheer'; else if (done) c.pose = 'sad';
        else if (p.stun > 0) c.pose = 'scared'; else if (p.roll > 0) c.pose = 'scared'; else if (p.catchT > 0) c.pose = 'push'; else if (p.ball) c.pose = 'hands_up'; else if (p.hitFlash > 0) c.pose = 'scared'; else c.pose = 'idle';
        c.update(dt);
        // schild + woede
        p.bubble.visible = p.shield > 0 && (p.shield > 1.5 || Math.sin(clock * 30) > 0); if (p.bubble.visible) { p.bubble.scale.setScalar(1 + Math.sin(clock * 6) * 0.04); }
        p.rage.visible = p.rageOn && !p.ko; if (p.rage.visible) { p.rage.material.opacity = 0.45 + Math.sin(clock * 14) * 0.15; if (Math.random() < dt * 26) fx.particles.emit(p.x + rand(-0.6, 0.6), 0.6 + Math.random() * 2, p.z + rand(-0.6, 0.6), 0, 1.5, 0, { life: 0.5, size: 0.35, color: Math.random() < 0.5 ? 0xff5a1a : 0xffb030, gravity: -2 }); }
        // blink bij onkwetsbaarheid
        const blink = p.inv > 0 && p.stun <= 0 && Math.sin(clock * 40) > 0.2;
        c.group.visible = !blink;
        // label
        p.label.position.set(p.x, p.y + 4.0 * sz + 0.9, p.z); p.label.visible = !p.ko || p.y < 0.5;
        // ringen
        p.ring.position.set(p.x, 0.06, p.z); p.ring.scale.setScalar(sz * (1 + Math.sin(clock * 6 + i) * 0.03)); p.ring.material.opacity = p.rollCd > 0 ? 0.3 : 0.9; p.ring.visible = !p.ko;
        p.catchRing.visible = p.catchT > 0; if (p.catchT > 0) { p.catchRing.position.set(p.x, 1.4, p.z); p.catchRing.rotation.x = -Math.PI / 2; p.catchRing.scale.setScalar(sz * (1.3 + (0.34 - p.catchT) * 3)); p.catchRing.material.opacity = clamp(p.catchT * 4, 0, 1); }
        p.blob.visible = true; p.blob.position.set(p.x, 0.045, p.z); p.blob.scale.setScalar(1.15 * sz * (1 - Math.min(0.5, p.y * 0.12)));
        // richten
        const aim = p.charging && p.ball && !over;
        p.aimRing.visible = p.aimDisc.visible = aim; p.dots.count = aim ? 14 : 0;
        if (aim) {
          const t = trajectory(p, p.charge, p.ball); const k = p.charge;
          const col = p.aimRing.material.color; col.setHSL(0.14 - k * 0.14, 1, 0.55);
          p.aimRing.position.set(t.tx, 0.07, t.tz); p.aimDisc.position.set(t.tx, 0.065, t.tz);
          const rad = (p.ball.type === 'pumpkin' ? 1.6 : 1.15) * (1 + Math.sin(clock * 12) * 0.05); p.aimRing.scale.setScalar(rad); p.aimDisc.scale.setScalar(rad);
          for (let q = 0; q < 14; q++) {
            const u = (q + 1) / 15, tt = u * t.T; tmpP.set(t.sx + t.ax * t.vh * tt, Math.max(0.15, t.y0 + t.vy * tt - 0.5 * t.g * tt * tt), t.sz + t.az * t.vh * tt);
            tmpS.setScalar(0.7 + 0.5 * Math.sin(clock * 10 - q * 0.6) * 0.3 + 0.2); tmpM.compose(tmpP, tmpQ.identity(), tmpS); p.dots.setMatrixAt(q, tmpM);
          }
          p.dots.instanceMatrix.needsUpdate = true; p.dots.material.color.copy(col);
        }
      });
      // ballen
      for (const b of balls) {
        if (b.state === 'off') continue;
        let x = b.x, y = b.y, z = b.z, held = false;
        if (b.state === 'drop') { /* al gezet */ }
        if (b.state === 'held' && b.holder) {
          const p = b.holder; held = true; const sh = p.charging ? p.charge * 0.1 : 0;
          x = p.x + (Math.random() - 0.5) * sh * 2 + Math.sin(p.yaw) * 0.0; y = p.y + (p.roll > 0 ? 2.0 : 3.35) * p.sz + b.r * (p.sz > 1 ? 0.6 : 1) + Math.sin(clock * 6 + p.i) * 0.08; z = p.z + (Math.random() - 0.5) * sh * 2;
          b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0;
          b.v.group.scale.setScalar(1 + (p.charging ? p.charge * 0.45 : 0));
        }
        b.v.group.position.set(x, y, z);
        const rest = b.state === 'rest' || (b.rolling && b.state === 'air');
        b.v.tick(clock, dt, b.vx, b.vy, b.vz, { held, heat: held && b.holder.charging ? b.holder.charge : 0, fuse: b.fuse, rest: b.state === 'rest' || held, rollSpeed: 0 });
        if (b.state === 'rest' && b.type === 'fire') b.v.group.position.y = b.r + 0.08 + Math.sin(clock * 3 + b.x) * 0.04;
        // schaduw
        const hh = Math.max(0, y - b.r);
        b.blob.position.set(x, 0.05, z); b.blob.scale.setScalar(b.r * 1.5 * (1.2 - Math.min(0.6, hh * 0.05)) + 0.2); b.blob.material.opacity = clamp(0.95 - hh * 0.04, 0.35, 0.95);
        // sporen
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (b.live && sp > 5 && !held) {
          const col = b.type === 'gold' ? 0xffd23f : b.type === 'pumpkin' ? 0xffa030 : (Math.random() < 0.5 ? 0xff7a20 : 0xffc040);
          fx.particles.emit(x - b.vx * 0.02, y, z - b.vz * 0.02, (Math.random() - 0.5) * 1.2, (Math.random() - 0.2) * 1.2, (Math.random() - 0.5) * 1.2, { life: 0.35, size: 0.45 * (b.r > 1 ? 2 : 1), color: col, gravity: -1 });
        } else if (b.state === 'rest' && Math.random() < dt * 5) fx.particles.emit(x + (Math.random() - 0.5) * 0.4, y + b.r, z + (Math.random() - 0.5) * 0.4, 0, 1.2, 0, { life: 0.6, size: 0.25, color: b.type === 'gold' ? 0xffe070 : 0xff9a30, gravity: -0.5 });
        if (b.type === 'bomb' && b.armed && Math.random() < dt * 14) fx.particles.emit(x + 0.15, y + b.r * 1.35 + 0.2, z, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5, { life: 0.4, size: 0.2, color: 0xffd060, gravity: 4 });
      }
      // waarschuwingsringen
      for (const w of warns) {
        if (!w.busy) continue;
        const k = clamp(w.t / w.t0, 0, 1); w.g.scale.setScalar(w.rad); w.r.scale.setScalar(0.4 + k * 0.6 + (Math.sin(clock * 24) > 0 ? 0.04 : 0)); w.d.material.opacity = 0.14 + (1 - k) * 0.32;
      }
      for (const s of scorches) if (s.m.visible) { s.t -= dt; s.m.material.opacity = clamp(s.t / 3, 0, 1); if (s.t <= 0) s.m.visible = false; }
    }

    // ---------------- camera ----------------
    const camLook = new THREE.Vector3(), camPos = new THREE.Vector3();
    function cameraUpdate(dt) {
      camK = damp(camK, over && koFocus ? 1 : 0, 2.2, dt);
      camPos.copy(camBase); camLook.copy(tgt);
      if (camK > 0.001 && koFocus) {
        const f = new THREE.Vector3(koFocus.x * 0.6, 1.2, koFocus.z * 0.6);
        camPos.lerp(new THREE.Vector3(f.x * 0.8, camBase.y * 0.72, camBase.z * 0.78 + f.z * 0.2), camK * 0.8); camLook.lerp(f, camK * 0.9);
      }
      camera.position.copy(camPos); camera.lookAt(camLook);
    }

    // ---------------- hoofdlus ----------------
    function simulate(dt) {
      const n = Math.max(1, Math.ceil(dt / 0.0125)), h = dt / n;
      for (let s = 0; s < n; s++) for (const b of balls) stepBall(b, h);
    }
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt; clock += dt;
      if (freeze > 0) { freeze -= dt; world.update(clock, dt * 0.3); visuals(0.0001); cameraUpdate(dt); return; }
      if (!sd && T >= SD_AT) startSuddenDeath();
      if (T >= END_AT && !deathmatch && !over) timeUp();
      if (T >= CAP_AT && !over) capOut();
      if (sd) { const k = smoothstep(0, 1, clamp((T - SD_AT) / 12, 0, 1)); ext.x = lerp(HX, HX_MIN, k); ext.z = lerp(HZ, HZ_MIN, k); world.setShrink(ext.x, ext.z); }
      for (const p of pl) control(p, dt);
      supply(dt);
      updateDrops(dt);
      simulate(dt);
      visuals(dt); world.update(clock, dt, sd ? 1 : 0); cameraUpdate(dt);
      if (!deathmatch && !over) hud.setTimer(Math.max(0, END_AT - T), 10);
      refreshHud();
    }
    function resultUpdate(dt) {
      clock += dt;
      if (freeze > 0) freeze -= dt;
      updateDrops(dt); simulate(dt); visuals(dt); world.update(clock, dt, 0); cameraUpdate(dt);
      if (done && Math.random() < dt * 5) { const w = pl.find((q) => q.cheer); if (w) fx.particles.burst(w.x + rand(-3, 3), 5 + rand(0, 3), w.z + rand(-2, 2), { count: 24, speed: 6, up: 1, life: 1.3, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); }
    }
    function introUpdate(dt) {
      introT += dt; clock += dt;
      pl.forEach((p) => { p.c.pose = 'idle'; });
      visuals(dt); world.update(clock, dt, 0); cameraUpdate(dt);
    }
    visuals(0.016); world.update(0, 0.016); cameraUpdate(0.016); refreshHud();
    hud.setTimer(END_AT, 10);

    return {
      update, resultUpdate, introUpdate,
      onResize() { fitCamera(); },
      onStart() { hud.setTimer(END_AT, 10); },
      onCountdown() { refreshHud(); hud.setTimer(END_AT, 10); },
      celebrate(w) { pl.forEach((q) => { q.cheer = q.i === w; }); for (let k = 0; k < 4; k++) fx.particles.burst(pl[w].x + rand(-3, 3), 4 + rand(0, 3), pl[w].z, { count: 36, speed: 7, up: 1.2, life: 1.5, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); sfx('sparkle', { vol: 0.5 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const p = pl[i];
          fx.texts.add('DEURMAN!', p.x, 5, p.z, '#ff4a4a', 1.4);
          if (p.hearts > 1 && !deathmatch) { p.hearts--; refreshLabel(p); refreshHud(); fx.texts.add('-1 ❤', p.x, 6, p.z, '#ff6a6a', 1.2); if (p.hearts === 1) comeback(p); }
          else if (p.ball) { const b = p.ball; removeBall(b); fx.texts.add('BAL WEG!', p.x, 6, p.z, '#ffb040', 1.1); }
        });
      },
      onSwap() { pl.forEach((p) => { fx.particles.burst(p.x, 2, p.z, { count: 30, speed: 6, up: 1.2, life: 0.9, size: 0.4, colors: [0xffe14a, 0xffffff, 0xff6fa5, 0x6fd8ff], gravity: 3 }); }); sfx('sparkle', { vol: 0.6 }); },
      dispose() { drops.length = 0; },
      dbg: {
        state: () => ({ T, sd, over, done, deathmatch, ext: { ...ext }, stat, hearts: pl.map((p) => p.hearts), shield: pl.map((p) => p.shield), rage: pl.map((p) => p.rageOn),
          p: pl.map((p) => ({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, ball: p.ball ? p.ball.type : null, charging: p.charging, charge: p.charge, roll: p.roll, rollCd: p.rollCd, catchT: p.catchT, catchCd: p.catchCd, inv: p.inv, stun: p.stun, hearts: p.hearts, sz: p.sz, face: p.face })),
          balls: balls.filter((b) => b.state !== 'off').map((b) => ({ type: b.type, state: b.state, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, live: b.live, owner: b.owner, fuse: b.fuse, r: b.r })), drops: drops.length }),
        pl, balls, ext, setT: (t) => { T = t; }, giveBall: (i, type) => { const b = { fire: fire[4], gold, bomb, pumpkin }[type]; if (b.state !== 'off') removeBall(b); const p = pl[i]; if (p.ball) removeBall(p.ball); placeRest(b, p.x, p.z); pickup(p, b); },
        dropAt: (type, x, z) => { const b = { fire: fire[5], gold, bomb, pumpkin }[type]; dropBall(b, x, z, { kind: type === 'pumpkin' ? 'pumpkin' : type, aoe: type === 'pumpkin' ? 2.6 : 0 }); },
        hurt: (i, n = 1) => hurt(pl[i], n, { x: 0, z: 0, by: 1 - i }), meteor: dropMeteor, startSD: startSuddenDeath, trajectory,
      },
    };
  },
};

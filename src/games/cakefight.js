import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { buildHall, HALL_X, HALL_Z, BOUNDS, TABLES, TABLE_TOP, CART, STATIONS, STATION_BOX, LANES, WALL_X } from './cakefight_world.js';
import { CAKES, makeCake, splatTexture, makeSplats } from './cakefight_items.js';

// Taartengevecht — voedselgevecht in de kasteelkeuken. Pak taarten bij de stations (A), gooi ze (A), blokkeer met het dienblad (B).
// Geraakt = slagroomkop + stun, de gooier scoort. Bakker Bram rent af en toe door de zaal. Hoogste score na 60 s wint (anders: gouden taart!).

const PR = 0.85, PH = 2.5, VIS = 1.5, SPEED = 7.8;
const TIME = 60, SD_CAP = 40;
const START = [[-12.0, 0], [12.0, 0]];
const BRAM_SPEED = 15.5;

export default {
  id: 'cakefight',
  name: 'Taartengevecht',
  giver: 'Bakker Bram',
  icon: '🎂',
  mode: 'pvp',
  time: 75,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'game',
  blurb: 'Taartengevecht in de keuken van Bakker Bram! Pak een <b>taart</b> bij een station en gooi hem op je broer: <b>slagroomkop</b> en een punt voor jou. Een <b>dienblad</b> (B) houdt taarten tegen. Pas op voor Bakker Bram zelf, de gladde <b>slagroomplassen</b> en de <b>bruidstaart</b>!',
  controls: ['{move} lopen en richten', '{a} taart pakken (bij een station) / gooien', '{b} dienblad omhoog (houd vast)'],
  tip: 'Bruidstaart = 3 punten maar traag. Confettitaart ontploft pas na een seconde! Wie achterstaat, krijgt vaker een bruidstaart.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tid = ctx.twist.id;
    const grav = pv.gravity;
    const tempo = tid === 'turbo' ? 1.25 : tid === 'slowmo' ? 0.8 : 1;
    const L = ctx.lights('indoor', { shadow: 20, center: [0, 0, 0], fogNear: 120, fogFar: 320 });
    L.sun.position.set(-6, 32, 16); L.sun.intensity = 1.5; L.sun.color.set(0xffe2b8);
    L.hemi.intensity = 1.35; L.hemi.color.set(0xffe9d0); L.hemi.groundColor.set(0x8a5a4a);
    camera.fov = 46; camera.updateProjectionMatrix();
    const world = buildHall(ctx);
    const sfx = (n, o) => audio.sfx(n, o);

    // ---------------- toestand ----------------
    let T = 0, clock = 0, timeLeft = TIME, over = false, done = false, freeze = 0, sdMode = false, sdT = 0, sdWait = 0, introT = 0;
    const stat = { throws: [0, 0], hits: [0, 0], blocks: [0, 0], bram: 0, self: 0, perType: { cream: 0, pudding: 0, bride: 0, confetti: 0 } };

    // ---------------- camera ----------------
    const PITCH = 0.9;
    const tgt = new THREE.Vector3(0, 0.8, 0.4), camBase = new THREE.Vector3(), camDir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const fitPts = [[-HALL_X, 0, -HALL_Z], [HALL_X, 0, -HALL_Z], [-HALL_X, 0, HALL_Z + 0.3], [HALL_X, 0, HALL_Z + 0.3], [-13, 5, -9.2], [13, 5, -9.2], [-12, 4.4, 9]];
    function fitCamera() {
      const v = new THREE.Vector3(); let lo = 12, hi = 150;
      for (let it = 0; it < 24; it++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(camDir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.95 || v.y > 0.96 || v.y < -0.93) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camBase.copy(tgt).addScaledVector(camDir, hi);
    }
    fitCamera();

    // ---------------- spelers ----------------
    const splatGeo = new THREE.PlaneGeometry(2, 2);
    const blobTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const mkBlob = () => { const m = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; scene.add(m); return m; };
    function mkLabel(p) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
      g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.92)'; g.strokeText(names[p.i], 128, 48); g.fillStyle = players[p.i].css; g.fillText(names[p.i], 128, 48);
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false })); s.scale.set(2.6, 0.98, 1); s.renderOrder = 15; scene.add(s); return s;
    }
    const pl = players.map((pp, i) => {
      const c = ctx.make.brother(i); const sz = pv.size(i);
      const holder = new THREE.Group(), pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.position.y = 0.95; c.group.position.y = -0.95; pivot.add(c.group); holder.add(pivot); scene.add(holder);
      holder.scale.setScalar(VIS * sz);
      // dienblad
      const tray = new THREE.Group(); tray.visible = false;
      const tm = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, metalness: 0.9, roughness: 0.22 });
      tray.add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 22), tm));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 24), new THREE.MeshStandardMaterial({ color: 0xe8c24a, metalness: 0.8, roughness: 0.3 })); rim.rotation.x = Math.PI / 2; tray.add(rim);
      const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e })); handle.rotation.z = Math.PI / 2; handle.position.set(0, -0.12, 0); tray.add(handle);
      tray.position.set(0, 0.12, 0.95); tray.rotation.x = Math.PI / 2 - 0.15; pivot.add(tray);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const p = {
        i, c, holder, pivot, tray, ring, sz, blob: mkBlob(), label: mkLabel({ i }), splats: makeSplats(c),
        x: START[i][0], z: START[i][1], y: 0, vy: 0, vx: 0, vz: 0, face: i ? -Math.PI / 2 : Math.PI / 2, yaw: i ? -Math.PI / 2 : Math.PI / 2,
        cake: null, stun: 0, inv: 0, sh: false, shT: 0, shCd: 0, trayBroken: 0, trayWob: 0, throwCd: 0, score: 0, air: false, spin: 0, puddle: false, cheer: false, slipT: 0, bramHit: false, near: -1,
      };
      return p;
    });
    const opp = (p) => pl[1 - p.i];

    // ---------------- taarten-pool ----------------
    const cakePool = {};
    function acquire(type) {
      const list = (cakePool[type] ||= []); let o = list.find((q) => !q.busy);
      if (!o) { o = makeCake(type); o.busy = false; o.group.visible = false; scene.add(o.group); list.push(o); }
      o.busy = true; o.group.visible = true; o.group.rotation.set(0, 0, 0); o.group.scale.setScalar(1); return o;
    }
    function release(o) { o.busy = false; o.group.visible = false; if (o.group.parent) o.group.parent.remove(o.group); scene.add(o.group); }

    // ---------------- plassen ----------------
    const splTex = splatTexture();
    const puddles = Array.from({ length: 18 }, () => { const m = new THREE.Mesh(splatGeo, new THREE.MeshStandardMaterial({ map: splTex, transparent: true, roughness: 0.15, metalness: 0.1, depthWrite: false, color: 0xffffff })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, life: 0, r: 1, floor: true, x: 0, z: 0 }; });
    let pudN = 0;
    const PUD_COL = { cream: 0xfff4ee, pudding: 0xffd24a, bride: 0xffe8f2, confetti: 0xff9ad0, gold: 0xffd23f };
    function puddleAt(x, z, r, type) {
      const onTable = TABLES.some((t) => Math.abs(x - t.x) < t.hx && Math.abs(z - t.z) < t.hz);
      const q = puddles[pudN++ % puddles.length]; q.life = onTable ? 6 : 15; q.r = r; q.floor = !onTable; q.x = x; q.z = z;
      q.m.position.set(x, (onTable ? TABLE_TOP + 0.075 : 0.03) + (pudN % 6) * 0.003, z); q.m.rotation.z = rand(0, TAU); q.m.scale.setScalar(r); q.m.material.color.set(PUD_COL[type] || 0xffffff); q.m.material.opacity = 1; q.m.visible = true;
    }
    function puddleUnder(x, z) { for (const q of puddles) if (q.life > 0.6 && q.floor && Math.hypot(q.x - x, q.z - z) < q.r * 0.82) return true; return false; }

    // ---------------- hulpfuncties ----------------
    function spark(x, y, z, n, cols, sp = 5, size = 0.45) { fx.particles.burst(x, y, z, { count: n, speed: sp, up: 1.1, life: 0.8, size, colors: cols, gravity: 9 }); }
    const CREAM = [0xffffff, 0xfff4ee, 0xffd0e0, 0xfff0a0], PUDD = [0xffd24a, 0xffc030, 0x7a4a1a, 0xfff0a0], BRIDE = [0xffffff, 0xffd0e4, 0xff9ac0, 0xfff8f0], CONF = [0xff3a5a, 0x3aa0ff, 0x6ad86a, 0xffe14a, 0xb06aff, 0xff9ad0];
    const colsOf = (t) => (t === 'pudding' ? PUDD : t === 'bride' ? BRIDE : t === 'confetti' ? CONF : t === 'gold' ? [0xffd23f, 0xfff3b0, 0xffffff] : CREAM);
    function refreshHud() {
      hud.setPlayerInfo(0, `🎂 ${pl[0].score}`); hud.setPlayerInfo(1, `🎂 ${pl[1].score}`);
      hud.setScore(sdMode ? '✨ GOUDEN TAART: eerste treffer wint! ✨' : `${names[0]} ${pl[0].score}  –  ${pl[1].score} ${names[1]}`);
    }
    function addScore(i, n, why) {
      const p = pl[i]; p.score = Math.max(0, p.score + n);
      fx.texts.add(n > 0 ? `+${n}` : String(n), p.x, 5.2 * p.sz + 0.6, p.z, n > 0 ? '#ffe14a' : '#ff6a6a', 1.4);
      refreshHud();
      if (sdMode && n > 0 && !over) endGame(i, why);
    }

    // ---------------- pakken en gooien ----------------
    function cornerType(p) {
      const behind = opp(p).score - p.score;
      const w = { cream: 50, pudding: 28, confetti: 17, bride: behind >= 4 ? 40 : behind >= 2 ? 24 : behind >= 1 ? 8 : 0 };
      let tot = 0; for (const k in w) tot += w[k]; let r = Math.random() * tot; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'cream';
    }
    const stations = STATIONS.map((s, k) => ({ x: s.x, z: s.z, cx: world.stationVis[k].cx, cz: world.stationVis[k].cz, cd: 0, kind: 'corner', vis: world.stationVis[k] }));
    stations.push({ x: CART.x, z: CART.z, cx: CART.x, cz: CART.z, cd: 0, kind: 'cart', r: CART.r + 1.7 });
    function giveCake(p, type) {
      if (p.cake) release(p.cake.obj);
      const obj = acquire(type); p.cake = { type, obj };
      const def = CAKES[type]; p.pivot.add(obj.group);
      obj.group.scale.setScalar(type === 'bride' ? 0.7 : 1);
      p.c.squash = 0.12;
      fx.texts.add(def.name + '!', p.x, 5.4 * p.sz + 0.7, p.z, type === 'bride' ? '#ffb0d8' : type === 'confetti' ? '#ff7ab8' : type === 'gold' ? '#ffe14a' : '#ffffff', type === 'bride' ? 1.5 : 1.1);
      sfx(type === 'bride' ? 'powerup' : 'pop', { vol: 0.8 }); spark(p.x, 2.2, p.z, 12, colsOf(type), 3.5);
    }
    function tryPickup(p) {
      for (const s of stations) {
        const d = Math.hypot(p.x - s.cx, p.z - s.cz); const reach = s.kind === 'cart' ? s.r : 2.5;
        if (d > reach + PR * p.sz * 0.3) continue;
        if (s.cd > 0) { fx.texts.add('even wachten...', s.cx, 3.6, s.cz, '#cccccc', 0.8); sfx('buzz', { vol: 0.3 }); return false; }
        let type;
        if (s.kind === 'cart') { const behind = opp(p).score - p.score; type = behind >= 0 ? 'bride' : (Math.random() < 0.5 ? 'confetti' : 'pudding'); s.cd = 8; if (type !== 'bride') hud.toast(`${names[p.i]} staat voor, dus geen bruidstaart!`, 1400); }
        else { type = cornerType(p); s.cd = 2.2; }
        giveCake(p, type); world.cart.scale.y = 1; s.pop = 0.3; return true;
      }
      return false;
    }
    const flying = [], fuses = [];
    function throwCake(p) {
      const ck = p.cake; if (!ck) return; const def = CAKES[ck.type];
      const o = opp(p), dx = o.x - p.x, dz = o.z - p.z, dl = Math.hypot(dx, dz) || 1;
      let ax = Math.sin(p.face), az = Math.cos(p.face); const dot = (ax * dx + az * dz) / dl;
      let tx, tz;
      if (dot > 0.76 && dl > 1.0 && !o.air) { const Tg = Math.max(0.3, dl / def.speed); tx = o.x + o.vx * Tg * 0.5; tz = o.z + o.vz * Tg * 0.5; const l2 = Math.hypot(tx - p.x, tz - p.z) || 1; ax = (tx - p.x) / l2; az = (tz - p.z) / l2; }
      else { tx = p.x + ax * def.range; tz = p.z + az * def.range; }
      tx = clamp(tx, -BOUNDS.x - 1, BOUNDS.x + 1); tz = clamp(tz, -BOUNDS.z - 0.6, BOUNDS.z + 0.6);
      const D = Math.hypot(tx - p.x, tz - p.z);
      const Tt = Math.max(0.34, D / def.speed) / Math.sqrt(grav) / tempo;
      const obj = ck.obj; p.cake = null; scene.add(obj.group); obj.group.rotation.set(0, 0, 0); obj.group.scale.setScalar(ck.type === 'bride' ? 0.8 : 1);
      const sx = p.x + ax * 0.9, sz = p.z + az * 0.9;
      flying.push({ obj, type: ck.type, owner: p.i, sx, sz, tx, tz, T: Tt, t: 0, y0: 2.9 * p.sz, yEnd: 0.45, arc: def.arc * (grav < 1 ? 1.5 : 1) * (0.8 + Math.min(1, D / 12) * 0.5), x: sx, y: 2.9 * p.sz, z: sz, spin: rand(-6, 6) });
      p.throwCd = 0.35; p.c.swing(); p.face = Math.atan2(ax, az); stat.throws[p.i]++;
      sfx('throw', { vol: 0.7, rate: ck.type === 'bride' ? 0.6 : 1 + rand(-0.1, 0.15) }); if (ck.type === 'bride') sfx('whoosh', { vol: 0.5, rate: 0.6 });
      spark(sx, 2.4, sz, 6, colsOf(ck.type), 3, 0.3);
    }

    // ---------------- treffers ----------------
    function blockedBy(p, sx, sz) {
      if (!p.sh || p.trayBroken > 0) return false;
      const dx = sx - p.x, dz = sz - p.z, dl = Math.hypot(dx, dz) || 1;
      return (Math.sin(p.face) * dx + Math.cos(p.face) * dz) / dl > 0.2;
    }
    // owner = werper (of -1), type = taartsoort, (sx,sz) = waar de taart vandaan kwam; geeft 'hit' | 'block' | 'none'
    function hitPlayer(p, owner, type, sx, sz) {
      if (over || p.inv > 0 || p.air) return 'none';
      const def = CAKES[type];
      if (blockedBy(p, sx, sz)) {
        stat.blocks[p.i]++; p.trayWob = 0.35;
        spark(p.x + Math.sin(p.face) * 1.1, 2.3 * p.sz, p.z + Math.cos(p.face) * 1.1, 24, colsOf(type), 6);
        fx.texts.add('GEBLOKKEERD!', p.x, 5.0 * p.sz + 0.5, p.z, '#9fe8ff', 1.2); sfx('ding', { vol: 0.8 }); sfx('hit', { vol: 0.4, rate: 1.4 }); ctx.shake(0.2);
        if (type === 'bride') { p.trayBroken = 2.6; p.sh = false; p.stun = 0.6; p.inv = 0.8; fx.texts.add('DIENBLAD KAPOT!', p.x, 4.2 * p.sz, p.z, '#ff9a5a', 1.1); sfx('wood', { vol: 0.8 }); ctx.shake(0.5); p.vx = (p.x - sx) / (Math.hypot(p.x - sx, p.z - sz) || 1) * 8; p.vz = (p.z - sz) / (Math.hypot(p.x - sx, p.z - sz) || 1) * 8; }
        return 'block';
      }
      // raak!
      p.stun = def.stun; p.inv = def.stun + 0.7; p.sh = false; p.shT = 0;
      const kx = p.x - sx, kz = p.z - sz, kl = Math.hypot(kx, kz) || 1; p.vx = kx / kl * def.kb; p.vz = kz / kl * def.kb;
      if (p.cake) { puddleAt(p.x + 0.8, p.z, 0.8, p.cake.type); release(p.cake.obj); p.cake = null; fx.texts.add('Taart laten vallen!', p.x, 4.4 * p.sz, p.z, '#ffd0a0', 0.9); }
      p.splats.hit(type);
      if (owner >= 0 && owner !== p.i) { stat.hits[owner]++; stat.perType[type] = (stat.perType[type] || 0) + 1; }
      const verb = pick(['FLOEP!', 'SPLAT!', 'PLATS!', 'SMAKELIJK!', 'MMMMH!', 'BOEF!']);
      fx.texts.add(type === 'bride' ? 'BRUIDS-SPLAT!!' : verb, p.x, 4.6 * p.sz + 0.4, p.z, '#ffffff', type === 'bride' ? 1.6 : 1.15);
      spark(p.x, 2.0, p.z, type === 'bride' ? 80 : 44, colsOf(type), type === 'bride' ? 10 : 7, type === 'bride' ? 0.7 : 0.5);
      sfx('hurt', { vol: 0.7 }); sfx(type === 'bride' ? 'thud' : 'hit', { vol: 0.8 }); sfx('pop', { vol: 0.6, rate: 0.7 });
      ctx.shake(type === 'bride' ? 0.9 : 0.45); freeze = Math.max(freeze, type === 'bride' ? 0.14 : 0.07);
      if (owner >= 0 && owner !== p.i) addScore(owner, def.pts, `${names[owner]} raakt ${names[p.i]} met een taart!`);
      else if (owner === p.i) { addScore(1 - p.i, 1, `${names[p.i]} raakt zichzelf!`); fx.texts.add('EIGEN TAART! +1 voor ' + names[1 - p.i], p.x, 6.2 * p.sz, p.z, '#ffb0a0', 1.1); stat.self++; }
      return 'hit';
    }
    function splashAt(f, x, z) {
      const def = CAKES[f.type];
      spark(x, 0.5, z, f.type === 'bride' ? 70 : 34, colsOf(f.type), f.type === 'bride' ? 9 : 6.5, f.type === 'bride' ? 0.65 : 0.45);
      fx.particles.ring(x, 0.3, z, { count: f.type === 'bride' ? 36 : 20, speed: f.type === 'bride' ? 8 : 5, color: PUD_COL[f.type] || 0xffffff, size: 0.4, life: 0.45 });
      puddleAt(x, z, def.R * (f.type === 'bride' ? 0.85 : 0.75), f.type);
      sfx(f.type === 'bride' ? 'thud' : 'pop', { vol: 0.7, rate: f.type === 'bride' ? 0.6 : 0.9 }); if (f.type === 'bride') ctx.shake(0.55); else ctx.shake(0.12);
      fx.texts.add(f.type === 'bride' ? 'PLOF!' : pick(['SPLAT', 'PLOF', 'FLOEP']), x, 1.8, z, '#fff4d0', f.type === 'bride' ? 1.3 : 0.8);
    }
    function explodeConfetti(x, z, owner) {
      const def = CAKES.confetti;
      for (let k = 0; k < 5; k++) spark(x + rand(-0.5, 0.5), 0.6 + k * 0.5, z + rand(-0.5, 0.5), 28, CONF, 8 + k, 0.5);
      fx.particles.ring(x, 0.4, z, { count: 40, speed: 10, color: 0xffe14a, size: 0.5, life: 0.6 });
      fx.texts.add('BOEM!', x, 3.4, z, '#ff7ab8', 1.6); sfx('explode', { vol: 0.9, rate: 1.1 }); sfx('sparkle', { vol: 0.7 }); ctx.shake(0.8);
      puddleAt(x, z, def.R * 0.8, 'confetti');
      for (const p of pl) { if (Math.hypot(p.x - x, p.z - z) < def.R + PR * p.sz * 0.3) hitPlayer(p, owner, 'confetti', x, z); }
    }
    function updateCakes(dt) {
      for (let k = flying.length - 1; k >= 0; k--) {
        const f = flying[k]; f.t += dt; const u = Math.min(1, f.t / f.T), def = CAKES[f.type];
        f.x = lerp(f.sx, f.tx, u); f.z = lerp(f.sz, f.tz, u); f.y = lerp(f.y0, f.yEnd, u) + 4 * f.arc * u * (1 - u);
        f.obj.group.position.set(f.x, f.y, f.z); f.obj.group.rotation.y += f.spin * dt; f.obj.group.rotation.z = Math.sin(clock * 9 + k) * 0.25;
        if (f.type === 'bride') f.obj.group.rotation.z = Math.sin(clock * 5) * 0.12;
        if (Math.random() < dt * 30) fx.particles.emit(f.x, f.y, f.z, (Math.random() - 0.5), -0.4, (Math.random() - 0.5), { life: 0.4, size: 0.28, color: pick(colsOf(f.type)), gravity: 3 });
        // directe treffer?
        let hit = false;
        if (!over) for (const p of pl) {
          if (p.i === f.owner || p.air) continue;
          const rr = def.hitR * (f.type === 'bride' ? 1 : 1) + PR * p.sz * 0.6;
          if (Math.hypot(p.x - f.x, p.z - f.z) < rr && f.y < PH * p.sz + 0.5 && f.y > 0.1) {
            if (f.type === 'confetti') { const r = blockedBy(p, f.sx, f.sz); if (r) { hitPlayer(p, f.owner, 'confetti', f.sx, f.sz); hit = true; break; } explodeConfetti(f.x, f.z, f.owner); hit = true; break; }
            const res = hitPlayer(p, f.owner, f.type, f.sx, f.sz);
            if (res !== 'none') { splashAt(f, f.x, f.z); hit = true; break; }
          }
        }
        if (hit) { release(f.obj); flying.splice(k, 1); continue; }
        if (u >= 1) {
          flying.splice(k, 1);
          if (f.type === 'confetti') { // blijft liggen en tikt af
            const onTable = TABLES.some((t) => Math.abs(f.tx - t.x) < t.hx && Math.abs(f.tz - t.z) < t.hz);
            fuses.push({ obj: f.obj, x: f.tx, z: f.tz, y: onTable ? TABLE_TOP + 0.1 : 0.05, t: 1.1, owner: f.owner });
            f.obj.group.position.set(f.tx, onTable ? TABLE_TOP + 0.1 : 0.05, f.tz); f.obj.group.rotation.set(0, rand(0, 3), 0);
            spark(f.tx, 0.4, f.tz, 10, CONF, 3); sfx('pop', { vol: 0.5 }); continue;
          }
          splashAt(f, f.tx, f.tz);
          if (!over) for (const p of pl) { if (p.i === f.owner) continue; if (Math.hypot(p.x - f.tx, p.z - f.tz) < def.R + PR * p.sz * 0.3) hitPlayer(p, f.owner, f.type, f.sx, f.sz); }
          release(f.obj);
        }
      }
      for (let k = fuses.length - 1; k >= 0; k--) {
        const f = fuses[k]; f.t -= dt; const g = f.obj;
        g.group.position.y = f.y + Math.abs(Math.sin(clock * (8 + (1.1 - f.t) * 14))) * 0.12; g.group.scale.setScalar(1 + (f.t < 0.5 ? Math.sin(clock * 50) * 0.07 : 0));
        if (g.glow) g.glow.material.opacity = 0.2 + (Math.sin(clock * (10 + (1.1 - f.t) * 25)) > 0 ? 0.55 : 0.1);
        if (g.fuseM) g.fuseM.visible = Math.sin(clock * (12 + (1.1 - f.t) * 30)) > 0;
        if (Math.random() < dt * 20) fx.particles.emit(f.x, f.y + 1.1, f.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, { life: 0.5, size: 0.25, color: pick(CONF), gravity: 5 });
        if (f.t <= 0) { fuses.splice(k, 1); release(f.obj); explodeConfetti(f.x, f.z, f.owner); }
      }
    }

    // ---------------- Bakker Bram ----------------
    const bram = { state: 'idle', t: 13, warn: 0, lane: 0, dir: 1, x: 0, z: 0, lastLane: -1, runs: 0 };
    const stripeTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = 'rgba(255,214,40,.85)'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(30,20,10,.85)'; for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 16 + h, h); g.lineTo(x + h, h); g.fill(); } }, { repeat: [14, 1] });
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, 2.6), new THREE.MeshBasicMaterial({ map: stripeTex, transparent: true, opacity: 0.5, depthWrite: false })); stripe.rotation.x = -Math.PI / 2; stripe.position.y = 0.06; stripe.visible = false; scene.add(stripe);
    const warnSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, (g, w, h) => { g.font = 'bold 60px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#401010'; g.strokeText('BRAM!!', w / 2, h / 2); g.fillStyle = '#ffe14a'; g.fillText('BRAM!!', w / 2, h / 2); }), transparent: true, depthTest: false })); warnSpr.scale.set(3.2, 1.2, 1); warnSpr.renderOrder = 16; warnSpr.visible = false; scene.add(warnSpr);
    function bowl(p, dir) {
      p.air = true; p.vy = 8.5; p.y = 0.1; p.vx = dir * 11; p.vz = rand(-2, 2); p.stun = 2.0; p.inv = 2.2; p.sh = false; p.spin = dir * 9; p.bramHit = true;
      if (p.cake) { puddleAt(p.x, p.z, 0.8, p.cake.type); release(p.cake.obj); p.cake = null; }
      p.splats.hit('bride'); stat.bram++;
      fx.texts.add('OMVER GEREND!', p.x, 5.0 * p.sz + 0.6, p.z, '#ffd24a', 1.5); sfx('boing', { vol: 0.9 }); sfx('hurt', { vol: 0.8 }); ctx.shake(0.8); freeze = Math.max(freeze, 0.1);
      spark(p.x, 1.5, p.z, 50, [0xffffff, 0xffd0e4, 0xff9ac0, 0xfff0a0], 8, 0.6);
      addScore(1 - p.i, 1, `Bakker Bram rent ${names[p.i]} omver!`);
    }
    function updateBram(dt) {
      const B = world.bram;
      if (bram.state === 'idle') {
        bram.t -= dt;
        if (bram.t <= 0 && !sdMode && !over && timeLeft > 6) {
          let lane; do { lane = Math.floor(Math.random() * LANES.length); } while (lane === bram.lastLane); bram.lane = lane; bram.lastLane = lane; bram.dir = Math.random() < 0.5 ? 1 : -1;
          bram.z = LANES[lane]; bram.x = -bram.dir * (WALL_X + 2.5); bram.state = 'warn'; bram.warn = 1.8; bram.runs++;
          world.setDoor(-bram.dir, lane, 1); stripe.visible = true; stripe.position.z = bram.z; warnSpr.visible = true; warnSpr.position.set(-bram.dir * (WALL_X - 3.5), 4.2, bram.z);
          hud.toast('Bakker Bram komt eraan! Weg uit de baan!', 1700); sfx('bell', { vol: 0.8 }); sfx('door', { vol: 0.6 });
          bram.hit = [false, false];
        }
      } else if (bram.state === 'warn') {
        bram.warn -= dt; stripe.material.opacity = 0.3 + (Math.sin(clock * 22) > 0 ? 0.35 : 0); warnSpr.position.y = 4.2 + Math.sin(clock * 12) * 0.2;
        if (bram.warn <= 0) { bram.state = 'run'; B.group.visible = true; world.bigCake.visible = true; sfx('whoosh', { vol: 0.8, rate: 0.7 }); }
      } else if (bram.state === 'run') {
        bram.x += bram.dir * BRAM_SPEED * dt; stripe.material.opacity = 0.35; warnSpr.visible = false;
        if (Math.abs(bram.x) > WALL_X - 6 && Math.sign(bram.x) === bram.dir) world.setDoor(bram.dir, bram.lane, 1);
        if (Math.random() < dt * 40) fx.particles.dust(bram.x - bram.dir * 1.2, 0, bram.z, 1, 0xd8c8b0);
        for (const p of pl) {
          if (bram.hit[p.i] || p.air || over) continue;
          if (Math.abs(p.x - bram.x) < 1.7 + PR * p.sz * 0.5 && Math.abs(p.z - bram.z) < 1.35 + PR * p.sz * 0.5) { bram.hit[p.i] = true; bowl(p, bram.dir); }
        }
        if (Math.abs(bram.x) > WALL_X + 2.5 && Math.sign(bram.x) === bram.dir) { bram.state = 'idle'; bram.t = rand(12, 17); B.group.visible = false; world.bigCake.visible = false; stripe.visible = false; setTimeout(() => { world.setDoor(-bram.dir, bram.lane, 0); world.setDoor(bram.dir, bram.lane, 0); }, 600); }
      }
      if (B.group.visible) {
        B.group.position.set(bram.x, 0, bram.z); B.faceDir(bram.dir, 0); B.speed = 1; B.pose = 'hands_up'; B.update(dt);
        world.bigCake.position.set(bram.x, 3.5 + Math.abs(Math.sin(clock * 14)) * 0.15, bram.z); world.bigCake.rotation.y = clock * 2; world.bigCake.rotation.z = Math.sin(clock * 9) * 0.06;
      }
    }

    // ---------------- spelers: besturing ----------------
    function circleBox(p, cx, cz, hx, hz, r) {
      const qx = clamp(p.x, cx - hx, cx + hx), qz = clamp(p.z, cz - hz, cz + hz); let dx = p.x - qx, dz = p.z - qz; const d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) { p.x += dx / d * (r - d); p.z += dz / d * (r - d); const vn = (p.vx * dx + p.vz * dz) / d; if (vn < 0) { p.vx -= dx / d * vn; p.vz -= dz / d * vn; } }
        else { p.z += (p.z > cz ? 1 : -1) * (hz + r); }
      }
    }
    function control(p, dt) {
      const inp = pv.input(p.i), sz = p.sz, def = p.cake ? CAKES[p.cake.type] : null;
      p.inv = Math.max(0, p.inv - dt); p.stun = Math.max(0, p.stun - dt); p.throwCd = Math.max(0, p.throwCd - dt); p.shCd = Math.max(0, p.shCd - dt); p.trayBroken = Math.max(0, p.trayBroken - dt); p.trayWob = Math.max(0, p.trayWob - dt);
      const canAct = p.stun <= 0 && !over && !p.air && sdWait <= 0;
      // dienblad
      const wantSh = canAct && inp.b && p.trayBroken <= 0 && p.shCd <= 0;
      if (wantSh) { if (!p.sh) { p.sh = true; sfx('swing', { vol: 0.3, rate: 1.6 }); } p.shT += dt; if (p.shT > 1.7) { p.sh = false; p.shCd = 1.1; p.shT = 0; fx.texts.add('ARM MOE!', p.x, 4.4 * sz, p.z, '#ffb090', 0.9); } }
      else { if (p.sh) { p.sh = false; } p.shT = Math.max(0, p.shT - dt * 0.9); }
      if (canAct && !p.sh && inp.aP) { if (p.cake) { if (p.throwCd <= 0) throwCake(p); } else tryPickup(p); }
      // bewegen
      if (p.air) {
        p.vy -= 26 * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= Math.exp(-0.5 * dt); p.vz *= Math.exp(-0.5 * dt);
        if (p.y <= 0 && p.vy < 0) { p.y = 0; p.air = false; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; p.spin = 0; sfx('thud', { vol: 0.8 }); ctx.shake(0.4); fx.particles.dust(p.x, 0, p.z, 8, 0xf0e8e0); }
      } else {
        const mx = canAct && !p.sh ? inp.x : 0, mz = canAct && !p.sh ? inp.y : 0;
        const sp = SPEED * pv.speed(p.i) * (def ? def.slow : 1);
        p.puddle = puddleUnder(p.x, p.z);
        const slip = Math.max(pv.slip, p.puddle ? 0.86 : 0);
        const lam = p.sh ? lerp(20, 2, slip) : p.stun > 0 ? lerp(6, 1.2, slip) : lerp(14, 1.4, slip);
        p.vx = damp(p.vx, mx * sp, lam, dt); p.vz = damp(p.vz, mz * sp, lam, dt);
        if (canAct && !p.sh && Math.hypot(mx, mz) > 0.28) p.face = Math.atan2(mx, mz);
        p.x += p.vx * dt; p.z += p.vz * dt;
        if (p.puddle && Math.hypot(p.vx, p.vz) > 3 && Math.random() < dt * 14) fx.particles.emit(p.x, 0.15, p.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), { life: 0.4, size: 0.3, color: 0xffffff, gravity: 4 });
        if (p.puddle && !p.wasPud) { sfx('boing', { vol: 0.25, rate: 1.5 }); } p.wasPud = p.puddle;
      }
      // botsingen
      const r = PR * sz;
      p.x = clamp(p.x, -BOUNDS.x + (0.85 - r), BOUNDS.x - (0.85 - r)); p.z = clamp(p.z, -BOUNDS.z + (0.85 - r), BOUNDS.z - (0.85 - r));
      if (!p.air) {
        for (const t of TABLES) circleBox(p, t.x, t.z, t.hx + 0.1, t.hz + 0.1, r);
        for (const s of STATIONS) circleBox(p, s.x, s.z, STATION_BOX.hx, STATION_BOX.hz, r);
        const dx = p.x - CART.x, dz = p.z - CART.z, d = Math.hypot(dx, dz); if (d < CART.r + r) { p.x = CART.x + dx / (d || 1) * (CART.r + r); p.z = CART.z + dz / (d || 1) * (CART.r + r); }
        const o = opp(p); if (!o.air) { const ddx = p.x - o.x, ddz = p.z - o.z, dd = Math.hypot(ddx, ddz), mn = r + PR * o.sz; if (dd < mn && dd > 1e-4) { const push = (mn - dd) / 2; p.x += ddx / dd * push; p.z += ddz / dd * push; o.x -= ddx / dd * push; o.z -= ddz / dd * push; } }
      }
    }

    // ---------------- einde ----------------
    function endGame(winner, line) {
      if (done) return; done = true; over = true; hud.setTimer(null);
      pl.forEach((q) => { q.cheer = winner != null && q.i === winner; q.sh = false; });
      const jokes = ['Bakker Bram heeft zijn keuken nooit zo plakkerig gezien.', 'Er zit slagroom op het plafond.', 'De koks hebben nog nooit zo gelachen.', 'Dat was een smakelijk gevecht!', 'Wie ruimt dit op?'];
      const sum = `${line}<br>Taarten gegooid: ${stat.throws[0]} – ${stat.throws[1]} · raak: ${stat.hits[0]} – ${stat.hits[1]} · geblokkeerd: ${stat.blocks[0]} – ${stat.blocks[1]}${stat.bram ? ` · Bram: ${stat.bram}×` : ''}<br>${pick(jokes)}`;
      ctx.finishPvp({ winner, score: [pl[0].score, pl[1].score], summary: sum, delay: 1700 });
      for (let k = 0; k < 4; k++) spark(rand(-8, 8), 5 + rand(0, 3), rand(-4, 4), 40, CONF, 8, 0.55);
    }
    function timeUp() {
      if (over || sdMode) return;
      if (pl[0].score !== pl[1].score) { const w = pl[0].score > pl[1].score ? 0 : 1; hud.showBig('TIJD OM!', 1000, '#ffe14a'); endGame(w, `<b>${names[w]}</b> wint met ${pl[w].score} tegen ${pl[1 - w].score} punten!`); return; }
      // gelijkspel: gouden taart!
      sdMode = true; sdT = 0; sdWait = 1.8; hud.setTimer(null);
      hud.showBig('GELIJK! GOUDEN TAART!', 1800, '#ffd23f'); hud.toast('Eerste treffer wint!', 2200); sfx('bell'); sfx('powerup');
      for (const f of flying) release(f.obj); flying.length = 0; for (const f of fuses) release(f.obj); fuses.length = 0;
      pl.forEach((p, i) => { p.x = START[i][0]; p.z = START[i][1]; p.vx = p.vz = 0; p.stun = 0; p.inv = 0; p.air = false; p.y = 0; p.splats.clear(); giveCake(p, 'gold'); p.face = i ? -Math.PI / 2 : Math.PI / 2; });
      refreshHud();
    }

    // ---------------- visuals ----------------
    function visuals(dt) {
      pl.forEach((p) => {
        const c = p.c, sz = p.sz, i = p.i;
        p.yaw = dampAngle(p.yaw, p.face, 16, dt); p.pivot.rotation.y = p.yaw;
        p.pivot.rotation.z = 0; p.pivot.rotation.x = p.air ? clock * p.spin * 0.7 : 0;
        p.holder.position.set(p.x, p.y, p.z);
        const sp = Math.hypot(p.vx, p.vz);
        c.speed = p.air ? 0 : clamp(sp / SPEED, 0, 1) * (p.stun > 0 ? 0.3 : 1);
        if (done) c.pose = p.cheer ? 'cheer' : (pl[0].score === pl[1].score ? 'idle' : 'sad');
        else if (p.air) c.pose = 'scared'; else if (p.stun > 0) c.pose = 'scared'; else if (p.sh) c.pose = 'push';
        else if (p.cake) c.pose = CAKES[p.cake.type].hold === 'hands_up' ? 'hands_up' : 'carry'; else c.pose = 'idle';
        c.update(dt);
        p.splats.update(dt);
        // vastgehouden taart
        if (p.cake) {
          const g = p.cake.obj.group, bride = p.cake.type === 'bride';
          if (g.parent !== p.pivot) p.pivot.add(g);
          g.position.set(0, (bride ? c.height + 0.35 : c.height * 0.52) - 0.95, bride ? 0.05 : 0.62); g.rotation.set(0, 0, bride ? Math.sin(clock * 7) * 0.05 : 0);
          if (p.cake.type === 'pudding') g.scale.set(1 + Math.sin(clock * 12) * 0.05, 1 - Math.sin(clock * 12) * 0.05, 1 + Math.sin(clock * 12) * 0.05);
        }
        // dienblad
        p.tray.visible = p.sh; if (p.tray.visible) { const w = 1 + Math.sin(p.trayWob * 40) * 0.12 * (p.trayWob > 0 ? 1 : 0); p.tray.scale.setScalar(w); p.tray.position.z = 0.95 - (p.trayWob > 0 ? 0.12 : 0); }
        // knipperen bij onkwetsbaarheid
        c.group.visible = !(p.inv > 0 && p.stun <= 0 && Math.sin(clock * 40) > 0.3);
        p.label.position.set(p.x, p.y + 3.6 * sz * (i ? 1.0 : 1.05) + 0.8, p.z);
        p.ring.position.set(p.x, 0.07, p.z); p.ring.scale.setScalar(sz * (1 + Math.sin(clock * 6 + i) * 0.03)); p.ring.visible = !p.air;
        p.blob.position.set(p.x, 0.045, p.z); p.blob.scale.setScalar(1.2 * sz * (1 - Math.min(0.5, p.y * 0.1)));
        // glibberige plas: glijdeffect
        if (p.puddle && sp > 3 && !p.air) c.speed = 0;
      });
      // plassen
      for (const q of puddles) { if (q.life <= 0) { q.m.visible = false; continue; } q.life -= dt; q.m.material.opacity = clamp(q.life / 2.2, 0, 1); if (q.life <= 0) q.m.visible = false; }
      // stations
      stations.forEach((s) => {
        s.cd = Math.max(0, s.cd - dt); s.pop = Math.max(0, (s.pop || 0) - dt);
        const ring = s.kind === 'cart' ? world.cartRing : s.vis.ring, icon = s.kind === 'cart' ? world.cartIcon : s.vis.icon;
        let near = -1; for (const p of pl) if (!p.cake && !p.air && Math.hypot(p.x - s.cx, p.z - s.cz) < (s.kind === 'cart' ? s.r : 2.5) + 0.3) near = p.i;
        const ready = s.cd <= 0;
        ring.material.opacity = ready ? 0.55 + Math.sin(clock * 5 + s.x) * 0.15 + (near >= 0 ? 0.25 : 0) : 0.18;
        ring.material.color.set(near >= 0 && ready ? PLAYER_COLORS[near] : ready ? (s.kind === 'cart' ? 0xff7ab8 : 0xffe14a) : 0x888888);
        ring.scale.setScalar(1 + (s.pop > 0 ? s.pop : 0) * 0.5);
        icon.material.opacity = ready ? 1 : 0.35;
      });
    }
    function cameraUpdate(dt) { camera.position.copy(camBase); camera.lookAt(tgt); }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt; clock += dt;
      if (freeze > 0) { freeze -= dt; world.update(clock, dt * 0.3); visuals(0.0001); cameraUpdate(dt); return; }
      if (sdWait > 0) { sdWait -= dt; }
      if (sdMode) { sdT += dt; if (sdT > SD_CAP && !over) { hud.toast('Echt gelijk! Dat is nog nooit gebeurd.', 2000); endGame(null, 'Gelijkspel! Wat een taarten-duel.'); } }
      else { timeLeft = Math.max(0, TIME - T); hud.setTimer(timeLeft, 10); if (timeLeft <= 0) timeUp(); }
      for (const p of pl) control(p, dt);
      updateCakes(dt); updateBram(dt);
      visuals(dt); world.update(clock, dt); cameraUpdate(dt);
      refreshHud();
    }
    function resultUpdate(dt) {
      clock += dt; updateCakes(dt); updateBram(dt); visuals(dt); world.update(clock, dt); cameraUpdate(dt);
      if (Math.random() < dt * 5) { const w = pl.find((q) => q.cheer); if (w) fx.particles.burst(w.x + rand(-3, 3), 5 + rand(0, 3), w.z + rand(-2, 2), { count: 24, speed: 6, up: 1, life: 1.3, size: 0.45, colors: CONF, gravity: 5 }); }
    }
    function introUpdate(dt) { introT += dt; clock += dt; pl.forEach((p) => { p.c.pose = 'idle'; }); visuals(dt); world.update(clock, dt); cameraUpdate(dt); }
    visuals(0.016); world.update(0, 0.016); cameraUpdate(0.016); refreshHud(); hud.setTimer(TIME, 10);

    return {
      update, resultUpdate, introUpdate,
      onResize() { fitCamera(); },
      onStart() { hud.setTimer(TIME, 10); },
      onCountdown() { refreshHud(); hud.setTimer(TIME, 10); },
      celebrate(w) { pl.forEach((q) => { q.cheer = q.i === w; }); for (let k = 0; k < 4; k++) spark(pl[w].x + rand(-3, 3), 4 + rand(0, 3), pl[w].z, 36, CONF, 7, 0.5); sfx('sparkle', { vol: 0.5 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m || over) return; const p = pl[i];
          p.splats.hit('cream'); fx.texts.add('DEURMAN!', p.x, 5.4, p.z, '#ff4a4a', 1.4);
          if (p.score > 0) { p.score--; refreshHud(); fx.texts.add('-1', p.x, 6.4, p.z, '#ff6a6a', 1.2); }
        });
      },
      onSwap() { pl.forEach((p) => { spark(p.x, 2, p.z, 30, CONF, 6, 0.45); }); sfx('sparkle', { vol: 0.6 }); },
      dispose() { flying.length = 0; fuses.length = 0; },
      dbg: {
        state: () => ({ T, timeLeft, sdMode, over, done, score: pl.map((p) => p.score), stat, bram: { state: bram.state, x: bram.x, z: bram.z, lane: bram.lane, runs: bram.runs },
          flying: flying.length, fuses: fuses.length, pud: puddles.filter((q) => q.life > 0).length,
          p: pl.map((p) => ({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, cake: p.cake ? p.cake.type : null, stun: p.stun, inv: p.inv, sh: p.sh, shCd: p.shCd, trayBroken: p.trayBroken, score: p.score, air: p.air, face: p.face, sz: p.sz, puddle: p.puddle })),
          stations: stations.map((s) => ({ cx: s.cx, cz: s.cz, cd: s.cd, kind: s.kind })), cakes: flying.map((f) => ({ type: f.type, owner: f.owner, x: f.x, y: f.y, z: f.z, t: f.t, T: f.T })), fuseList: fuses.map((f) => ({ x: f.x, z: f.z, t: f.t })) }),
        pl, stations, give: (i, type) => giveCake(pl[i], type), setT: (t) => { T = t; }, bramNow: () => { bram.t = 0; }, hit: (i, type, owner) => hitPlayer(pl[i], owner == null ? 1 - i : owner, type, 0, 0), puddleAt,
      },
    };
  },
};

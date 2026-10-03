import * as THREE from 'three';
import { mat, mesh, clamp, lerp, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildWorld, crownMesh, KB } from './koningsberg_world.js';

// Koning van de Berg — party-spel voor 3 (Wes, Jor en Juul tegelijk, vrij voor allen).
//  * een ronde heuveltop in een lavameer; de gouden kroonzone in het midden geeft punten per seconde aan wie er ALLEEN in staat
//  * richtingen = lopen, A = sprong (met zet vooruit; wie zweeft ontwijkt duwtjes), B = schouderduw (met cooldown)
//  * de rand brokkelt af (eerst rood waarschuwen), wie in de lava valt komt na 2 s terug aan de rand (geen eliminatie)
//  * power-ups: reuzenschoen (groot, zwaar, stampt), schild (vangt 1 duw), bom (B = gooien)
//  * Deurman geeft een high-five-klap over een deel van de heuvel (springen = ontwijken)
//  * comeback: wie ver achterstaat laadt 2x zo snel op, komt sneller terug (dichter bij de kroon); laatste 15 s = dubbele punten
const TIME = 75;
const PR = 0.9, BASE = 1.5;                 // spelerstraal
const MOVE = 6.6;               // loopsnelheid
const JUMP_V = 8.4, GRAV = 24;
const PUSH_CD = 1.5, JUMP_CD = 0.5, PUSH_IMP = 17, LUNGE_T = 0.22, LUNGE_V = 12;
const RATE = 8;                 // kroonpunten per seconde
const KO_BONUS = 20;            // bonus voor wie iemand de lava in duwt
const DEUR_TIMES = [24, 50];
const ITEMS = [
  { id: 'boot', name: 'REUZENSCHOEN!', col: '#ffb23a', icon: '👟' },
  { id: 'shield', name: 'SCHILD!', col: '#6fd8ff', icon: '🛡️' },
  { id: 'bomb', name: 'BOM! (B = gooien)', col: '#ff6a5a', icon: '💣' },
];

function nameTag(name, css) {
  const t = canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(20,6,6,.9)'; c.lineJoin = 'round'; c.strokeText(name, w / 2, hh / 2); c.fillStyle = css; c.fillText(name, w / 2, hh / 2); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(2.4, 0.9, 1); s.renderOrder = 15; return s;
}
function makeBombMesh(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.42 * s, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.4 }), { cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.22 * s, 5), mat(0x8a6a3a), { cast: false, pos: [0, 0.46 * s, 0] }));
  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd23f })); sp.position.y = 0.62 * s; g.add(sp); g.userData.spark = sp;
  return g;
}
function makeBootMesh() {
  const g = new THREE.Group();
  const lea = new THREE.MeshStandardMaterial({ color: 0xb8672a, roughness: 0.6, flatShading: true });
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.6, 1.15), lea, { cast: false, pos: [0, 0.3, 0.1] }));
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.7, 0.62), lea, { cast: false, pos: [0, 0.8, -0.2] }));
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.14, 1.22), mat(0x3a2a1e), { cast: false, pos: [0, 0.04, 0.1] }));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.8, roughness: 0.3, emissive: 0x805000, emissiveIntensity: 0.5 }), { cast: false, pos: [0, 0.8, 0.12] }));
  g.scale.setScalar(1.1);
  return g;
}
function makeShieldMesh() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.62, 14, 10), new THREE.MeshStandardMaterial({ color: 0x7ad8ff, emissive: 0x2a8ad8, emissiveIntensity: 0.8, transparent: true, opacity: 0.75, roughness: 0.2 }), { cast: false, pos: [0, 0.7, 0] }));
  g.add(mesh(new THREE.TorusGeometry(0.64, 0.06, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaddff, emissiveIntensity: 0.9 }), { cast: false, pos: [0, 0.7, 0], rot: [Math.PI / 2, 0, 0] }));
  return g;
}

export default {
  id: 'koningsberg',
  name: 'Koning van de Berg',
  giver: 'Koning Klopper',
  icon: '👑',
  mode: 'pvp',
  players: [3],
  time: TIME,
  music: 'game_fast',
  blurb: 'Drie broers op een <b>brokkelende heuveltop</b> in de lava! Sta <b>alleen</b> in de gouden kroonzone voor punten, duw de rest de lava in en pas op voor de <b>Deurman</b>. Meeste punten na 75 seconden wint!',
  controls: ['{move} lopen', '{a} springen', '{b} duwen / bom gooien'],
  tip: 'Twee in de kroonzone? Dan scoort niemand. De laatste 15 seconden tellen dubbel!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, n = players.length, names = players.map((p) => p.name);
    const SLIP = pv.slip || 0, GR = GRAV * (pv.gravity || 1);
    const L = ctx.lights('dusk', { shadow: 17, center: [0, 0, 0], fogNear: 60, fogFar: 150 });
    L.sun.color.set(0xffc890); L.sun.intensity = 1.9; L.sun.position.set(10, 30, 14);
    L.hemi.color.set(0xffc8a8); L.hemi.groundColor.set(0x8a2810); L.hemi.intensity = 1.25;
    camera.fov = 48; camera.updateProjectionMatrix();
    const W = buildWorld(ctx, L);
    const splash = (x, z, k = 1) => { fx.particles.burst(x, -2.7, z, { count: Math.round(22 * k), speed: 6, up: 1.8, life: 1.0, size: 0.5, colors: [0xff7a1a, 0xffd23f, 0xff3a10], gravity: 12 }); audio.sfx('splash', { vol: 0.4 * k, rate: 0.8 }); };

    // ---------------- spelers ----------------
    const START = [-Math.PI / 3, Math.PI, Math.PI / 3];   // links-voor, achter, rechts-voor (gelijk verdeeld)
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); scene.add(c.group);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 28), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const shadow = P.shadowBlob(1.1); scene.add(shadow);
      const tag = nameTag(pp.name, pp.css); scene.add(tag);
      const shield = makeShieldMesh(); shield.visible = false; scene.add(shield);
      const bomb = makeBombMesh(0.9); bomb.visible = false; scene.add(bomb);
      const a = START[i] ?? (i / n * TAU), d = 6.2;
      return { i, pp, c, ring, shadow, tag, shield, bomb, x: Math.sin(a) * d, z: Math.cos(a) * d, y: 0, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, st: 'ok', deadT: 0, fallT: 0, stun: 0, inv: 0, pushCd: 1.0, jumpCd: 0, lungeT: 0, ldx: 0, ldz: 1, hit: [], giantT: 0, shieldT: 0, bomb_t: 0, sz: 1, R: PR, mass: 1, score: 0, falls: 0, kos: 0, lastCrown: -1, comeback: false, lastPusher: -1, lastPushT: -99, air: false, holdAcc: 0, airT: 0, startA: a, ko: 0 };
    });
    pl.forEach((p) => { p.c.targetYaw = p.c.yaw = Math.atan2(-p.x, -p.z); p.c.group.rotation.y = p.c.yaw; });
    const leaderCrown = crownMesh(0.5); leaderCrown.visible = false; scene.add(leaderCrown);

    // ---------------- toestand ----------------
    let T = 0, tleft = TIME, started = false, finished = false, slow = 1, slowHold = 0, introT = 0;
    let crumbT = 7, crumbN = 0, itemT = 4, deurIdx = 0, rankT = 0, dbl = false, holder = -1, contested = false, hudT = 0;
    const stats = { pushes: 0, kos: 0, falls: 0, items: 0, bombs: 0, deur: 0, dodged: 0, crumbles: 0 };
    const crumbles = [];   // lopende waarschuwingen {k:[sectoren], t}
    const items = [];      // pickups op de heuvel
    const projectiles = Array.from({ length: 4 }, () => ({ on: false, g: (() => { const g = makeBombMesh(1); g.visible = false; scene.add(g); return g; })(), x: 0, z: 0, sx: 0, sz: 0, tx: 0, tz: 0, t: 0, fuse: 0, owner: 0, landed: false }));
    const itemPool = Array.from({ length: 3 }, () => {
      const g = new THREE.Group(); const kinds = { boot: makeBootMesh(), shield: makeShieldMesh(), bomb: makeBombMesh(1.4) };
      for (const k in kinds) { kinds[k].visible = false; g.add(kinds[k]); }
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; g.add(halo);
      g.visible = false; scene.add(g); return { g, kinds, halo, on: false, type: null, x: 0, z: 0, t: 0, life: 0 };
    });
    // Deurman-high-five
    const deur = makeDeurman(1.7); deur.group.visible = false; scene.add(deur.group);
    const wedgeGeo = new THREE.CircleGeometry(KB.R0 + 1.5, 24, 0, 1.2);
    const wedge = new THREE.Mesh(wedgeGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); wedge.rotation.x = -Math.PI / 2; wedge.position.y = 0.09; wedge.visible = false; scene.add(wedge);
    const HF = { on: false, t: 0, phase: 0, ang: 0, did: false };

    // ---------------- camera past om de hele heuvel ----------------
    const tgt = new THREE.Vector3(0, -0.6, -2.6), camDir = new THREE.Vector3(0, Math.sin(1.12), Math.cos(1.12));
    const fitPts = []; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; fitPts.push([Math.sin(a) * 10.4, -0.4, Math.cos(a) * 10.4]); }
    fitPts.push([0, 3.2, 0], [-6, 3, -6], [6, 3, -6]);
    function fitCamera() {
      const v = new THREE.Vector3(); let lo = 10, hi = 120;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(camDir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.95 || v.y > (Math.abs(v.x) < 0.3 ? 0.46 : 0.86) || v.y < -0.95) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camera.position.copy(tgt).addScaledVector(camDir, hi); camera.lookAt(tgt);
    }
    fitCamera();

    // ---------------- hulpfuncties ----------------
    const cdMul = (p) => (p.comeback ? 0.5 : 1);
    const alive = (p) => p.st !== 'dead';
    const ranked = () => pl.slice().sort((a, b) => b.score - a.score);
    function floatText(txt, x, y, z, col, s = 1) { fx.texts.add(txt, x, y, z, col, s); }
    function pushOn(q, dx, dz, imp, by, stun = 0.3, hop = 0) {
      // dx,dz = genormaliseerde richting; zwaar = minder effect
      q.kx += dx * imp / Math.pow(q.mass, 0.8); q.kz += dz * imp / Math.pow(q.mass, 0.8); q.stun = Math.max(q.stun, stun);
      if (hop > 0 && q.y <= 0.05) { q.vy = hop; }
      if (by != null) { q.lastPusher = by; q.lastPushT = T; }
    }
    function breakShield(q) {
      q.shieldT = 0; audio.sfx('pop', { vol: 0.6, rate: 1.4 }); audio.sfx('sparkle', { vol: 0.4 });
      fx.particles.burst(q.x, 1.0, q.z, { count: 26, speed: 6, up: 1, life: 0.7, size: 0.35, colors: [0x7ad8ff, 0xffffff, 0xaaeeff], gravity: 3 }); floatText('SCHILD KAPOT', q.x, 3.2, q.z, '#7ad8ff', 1.1);
    }

    function respawn(p) {
      let best = null, bd = -1;
      for (let k = 0; k < KB.N; k++) {
        const s = W.sectors[k]; if (s.warn || s.r < KB.MIN_R - 0.2) continue;
        const a = (k + 0.5) * TAU / KB.N; const d = p.comeback ? Math.min(s.r - 1.4, 4.0 + 0.2 * Math.abs(Math.sin(k))) : s.r - 1.4;
        const x = Math.sin(a) * d, z = Math.cos(a) * d; let md = 99;
        for (const q of pl) if (q !== p && alive(q)) md = Math.min(md, Math.hypot(q.x - x, q.z - z));
        const sc = md + (p.comeback ? 0 : 0) + Math.random() * 0.5; if (sc > bd) { bd = sc; best = [x, z]; }
      }
      const [x, z] = best || [Math.sin(p.startA) * 6, Math.cos(p.startA) * 6];
      p.x = x; p.z = z; p.y = 7; p.vy = 0; p.vx = p.vz = p.kx = p.kz = 0; p.st = 'ok'; p.inv = 1.6; p.stun = 0; p.fallT = 0; p.pushCd = 0.4; p.lungeT = 0; p.bomb_t = 0; p.giantT = 0; p.shieldT = 0; p.sz = 1;
      p.c.group.visible = p.ring.visible = p.shadow.visible = p.tag.visible = true;
      p.c.targetYaw = Math.atan2(-x, -z);
      audio.sfx('whoosh', { vol: 0.5 }); floatText('TERUG!', x, 4, z, p.pp.css, 1.1);
      fx.particles.ring(x, 0.2, z, { count: 18, speed: 5, color: p.pp.color, size: 0.4, life: 0.6 });
    }
    function lavaDeath(p) {
      p.st = 'dead'; p.deadT = p.comeback ? 1.2 : 2.0; p.falls++; stats.falls++;
      splash(p.x, p.z, 1.2); ctx.shake(0.3);
      fx.particles.burst(p.x, -2.5, p.z, { count: 16, speed: 4, up: 3, life: 1.2, size: 0.4, colors: [0xffffff, 0x777777], gravity: -1 });
      floatText('PLONS!', p.x, 0.5, p.z, p.pp.css, 1.5);
      p.c.group.visible = p.ring.visible = p.shadow.visible = p.tag.visible = p.shield.visible = p.bomb.visible = false;
      p.bomb_t = 0; p.giantT = 0; p.shieldT = 0;
      if (p.lastPusher >= 0 && T - p.lastPushT < 3 && p.lastPusher !== p.i) {
        const k = pl[p.lastPusher]; k.score += KO_BONUS; k.kos++; stats.kos++;
        floatText(`+${KO_BONUS} KO!`, k.x, 3.6, k.z, '#ffe14a', 1.5); audio.sfx('coin', { vol: 0.6 }); if (k.st === 'ok') k.c.jump();
      }
      p.lastPusher = -1;
    }

    // ---------------- items ----------------
    function spawnItem(type) {
      const it = itemPool.find((q) => !q.on); if (!it) return;
      type = type || ['boot', 'shield', 'bomb'][Math.floor(Math.random() * 3)];
      let x = 0, z = 0;
      for (let tr = 0; tr < 12; tr++) { const a = Math.random() * TAU; const k = W.sectorAt(Math.sin(a), Math.cos(a)); const rr = W.sectors[k].r - 1.6; if (rr < 4) continue; const d = 3.6 + Math.random() * (rr - 3.6); x = Math.sin(a) * d; z = Math.cos(a) * d; if (!W.sectors[k].warn) break; }
      it.on = true; it.type = type; it.x = x; it.z = z; it.t = 0; it.life = 15; it.g.visible = true; it.g.position.set(x, 0, z);
      for (const k in it.kinds) it.kinds[k].visible = k === type;
      it.halo.material.color.set(ITEMS.find((q) => q.id === type).col);
      fx.particles.burst(x, 0.4, z, { count: 18, speed: 4, up: 2, life: 0.7, size: 0.35, colors: [0xffffff, 0xffd23f], gravity: 4 }); audio.sfx('sparkle', { vol: 0.3 });
      items.push(it);
    }
    function takeItem(p, it) {
      it.on = false; it.g.visible = false; const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
      const def = ITEMS.find((q) => q.id === it.type); stats.items++;
      if (it.type === 'boot') p.giantT = 9;
      else if (it.type === 'shield') p.shieldT = 9;
      else { p.bomb_t = 5.2; }
      floatText(def.name, p.x, 3.8, p.z, def.col, 1.4); audio.sfx('powerup', { vol: 0.7 }); if (p.c.jump) p.c.jump();
      fx.particles.burst(p.x, 1, p.z, { count: 26, speed: 6, up: 1.5, life: 0.8, size: 0.4, colors: [parseInt(def.col.slice(1), 16), 0xffffff], gravity: 3 });
    }
    function explode(x, z, owner, big = 1) {
      stats.bombs++; const R = 3.9 * big;
      audio.sfx('explode', { vol: 0.8 }); ctx.shake(0.75); slow = 0.35; slowHold = 0.28;
      fx.particles.burst(x, 0.6, z, { count: 60, speed: 9, up: 1.6, life: 1.0, size: 0.6, colors: [0xffd23f, 0xff7a1a, 0xff3a10, 0x333333], gravity: 6 });
      fx.particles.ring(x, 0.3, z, { count: 30, speed: 10, color: 0xffb040, size: 0.5, life: 0.5 });
      let hits = 0;
      for (const q of pl) {
        if (!alive(q) || q.inv > 0) continue;
        const dx = q.x - x, dz = q.z - z, d = Math.hypot(dx, dz); if (d > R + q.R) continue;
        if (q.shieldT > 0) { breakShield(q); continue; }
        const nx = d > 0.15 ? dx / d : Math.cos(q.i * 2.1), nz = d > 0.15 ? dz / d : Math.sin(q.i * 2.1);
        pushOn(q, nx, nz, 24 * (1 - 0.55 * d / R) * (q.y > 0.5 ? 0.6 : 1), owner, 0.45, 5); hits++;
        q.c.pose = 'scared';
      }
      if (hits >= 2) floatText('DUBBEL!', x, 3.5, z, '#ffb23a', 1.3);
    }
    function throwBomb(p) {
      const pr = projectiles.find((q) => !q.on); if (!pr) return;
      const f = p.c.targetYaw; const dx = Math.sin(f), dz = Math.cos(f);
      pr.on = true; pr.landed = false; pr.t = 0; pr.owner = p.i; pr.sx = pr.x = p.x + dx * 0.8; pr.sz = pr.z = p.z + dz * 0.8; pr.tx = p.x + dx * 5.6; pr.tz = p.z + dz * 5.6; pr.fuse = Math.max(0.5, p.bomb_t > 3 ? 0.9 : 0.5); pr.g.visible = true;
      p.bomb_t = 0; p.c.swing(); audio.sfx('throw', { vol: 0.6 });
    }

    // ---------------- Deurman: high-five ----------------
    function startHighFive() {
      HF.on = true; HF.t = 0; HF.did = false; HF.ang = Math.random() * TAU;
      const x = Math.sin(HF.ang) * (KB.R0 + 5.5), z = Math.cos(HF.ang) * (KB.R0 + 5.5);
      deur.group.position.set(x, -9, z); deur.group.visible = true; deur.targetYaw = deur.yaw = HF.ang + Math.PI; deur.pose = 'idle';
      wedge.visible = true; wedge.rotation.z = HF.ang - Math.PI / 2 - 0.6;   // sector dekt hoeken ang-0.6 .. ang+0.6 (hoek = richting (sin,cos) in x,z)
      hud.showBig('✋ SPRING!', 1100, '#ff8a6a'); hud.toast('De Deurman geeft een high-five! Spring over de rode klap heen.', 2200); audio.sfx('doorbell', { vol: 0.5 }); stats.deur++;
    }
    function updateHighFive(dt) {
      if (!HF.on) return;
      HF.t += dt;
      const rise = smoothstep(0, 0.9, HF.t);
      deur.group.position.y = lerp(-9, -2.2, rise);
      // wedge: hoek tussen ang-0.6 en ang+0.6 (cirkelsector begint bij +x en draait tegen de klok in rond y na rotatie x=-90deg)
      const tel = HF.t < 2.2;
      wedge.material.opacity = tel ? 0.15 + 0.2 * Math.abs(Math.sin(HF.t * 10)) * smoothstep(0.3, 1.2, HF.t) : Math.max(0, wedge.material.opacity - dt * 3);
      deur.pose = HF.t > 1.6 && HF.t < 3.1 ? 'highfive' : 'idle'; deur.update(dt);
      if (HF.t > 2.2 && !HF.did) {
        HF.did = true; ctx.shake(0.8); audio.sfx('highfive', { vol: 1 }); audio.sfx('thud', { vol: 0.5 });
        floatText('KLAP!', Math.sin(HF.ang) * 4, 3.5, Math.cos(HF.ang) * 4, '#ff6a5a', 1.8);
        const nx = -Math.sin(HF.ang), nz = -Math.cos(HF.ang);
        for (const q of pl) {
          if (!alive(q)) continue;
          let a = Math.atan2(q.x, q.z) - HF.ang; a = Math.atan2(Math.sin(a), Math.cos(a));
          if (Math.abs(a) > 0.6 || Math.hypot(q.x, q.z) < 0.5) continue;
          if (q.y > 0.5) { stats.dodged++; q.score += 10; floatText('ONTWEKEN +10', q.x, 3.4, q.z, '#9aff9a', 1.1); continue; }
          if (q.inv > 0) continue;
          if (q.shieldT > 0) { breakShield(q); continue; }
          pushOn(q, nx, nz, 21, null, 0.5, 4); q.c.pose = 'scared';
          fx.particles.burst(q.x, 1, q.z, { count: 16, speed: 5, up: 1.5, life: 0.6, size: 0.4, colors: [0xffffff, 0xff9a6a], gravity: 6 });
        }
        slow = 0.4; slowHold = 0.2;
      }
      if (HF.t > 3.4) { deur.group.position.y = lerp(-2.2, -9, smoothstep(3.4, 4.3, HF.t)); }
      if (HF.t > 4.4) { HF.on = false; deur.group.visible = false; wedge.visible = false; }
    }

    // ---------------- brokkelen ----------------
    function startCrumble() {
      const cand = W.sectors.map((s, k) => k).filter((k) => W.sectors[k].target > KB.MIN_R + 0.3 && !W.sectors[k].warn);
      if (!cand.length) return;
      cand.sort((a, b) => W.sectors[b].target - W.sectors[a].target + (Math.random() - 0.5) * 3);
      const k = cand[0], ks = [k, (k + 1) % KB.N, (k + KB.N - 1) % KB.N];
      for (const q of ks) W.setWarn(q, true);
      crumbles.push({ ks, t: 1.5 }); audio.sfx('creak', { vol: 0.5 });
      const a = (k + 0.5) * TAU / KB.N; floatText('!', Math.sin(a) * (W.sectors[k].r - 0.6), 2.5, Math.cos(a) * (W.sectors[k].r - 0.6), '#ff5a3a', 1.6);
    }
    function updateCrumbles(dt) {
      for (let i = crumbles.length - 1; i >= 0; i--) {
        const c = crumbles[i]; c.t -= dt;
        if (c.t > 0) { if (Math.random() < dt * 14) { const k = c.ks[0], a = (k + 0.5 + (Math.random() - 0.5) * 2) * TAU / KB.N; fx.particles.emit(Math.sin(a) * W.sectors[k].r, 0.3, Math.cos(a) * W.sectors[k].r, 0, 1.5, 0, { life: 0.5, size: 0.3, color: 0xff6a3a, gravity: 2 }); } continue; }
        crumbles.splice(i, 1); stats.crumbles++;
        c.ks.forEach((k, j) => {
          const s = W.sectors[k]; const drop = j === 0 ? 2.0 : 1.0; const was = s.r;
          s.target = Math.max(KB.MIN_R, s.target - drop); W.setWarn(k, false);
          const a = (k + 0.5) * TAU / KB.N; if (was > s.target + 0.2) { W.dropChunk(Math.sin(a) * (was - 0.6), Math.cos(a) * (was - 0.6), Math.sin(a) * 2, Math.cos(a) * 2); fx.particles.burst(Math.sin(a) * was, 0.2, Math.cos(a) * was, { count: 12, speed: 4, up: 1.5, life: 0.7, size: 0.4, colors: [0x8a7a6a, 0xff7a1a], gravity: 10 }); }
        });
        ctx.shake(0.3); audio.sfx('thud', { vol: 0.5 }); audio.sfx('scrape', { vol: 0.3 });
      }
    }

    // ---------------- spelerstap ----------------
    function stepPlayer(p, dt) {
      const inp = pv.input(p.i), sp = pv.speed(p.i);
      if (p.st === 'dead') { p.deadT -= dt; if (p.deadT <= 0) respawn(p); return; }
      p.pushCd = Math.max(0, p.pushCd - dt * (p.comeback ? 2 : 1)); p.jumpCd = Math.max(0, p.jumpCd - dt * (p.comeback ? 2 : 1));
      p.stun = Math.max(0, p.stun - dt); p.inv = Math.max(0, p.inv - dt); p.lungeT = Math.max(0, p.lungeT - dt);
      p.giantT = Math.max(0, p.giantT - dt); p.shieldT = Math.max(0, p.shieldT - dt);
      const tsz = pv.size(p.i) * (p.giantT > 0 ? 1.45 : 1); p.sz += (tsz - p.sz) * Math.min(1, dt * 8);
      p.R = PR * p.sz; p.mass = Math.pow(p.sz, 1.4);
      const d0 = Math.hypot(p.x, p.z), onPlate = d0 < W.radiusAt(p.x, p.z) + 0.12;
      const grounded = onPlate && p.y <= 0.03 && p.vy <= 0.01;
      const free = p.stun <= 0 && p.lungeT <= 0;
      // bom in de hand: lontje brandt
      if (p.bomb_t > 0) { p.bomb_t -= dt; if (p.bomb_t <= 0) { explode(p.x, p.z, p.i, 0.9); floatText('OEPS!', p.x, 3.4, p.z, '#ff6a5a', 1.3); } }
      // lopen
      let tx = 0, tz = 0;
      if (free) { tx = inp.x * MOVE * sp; tz = inp.y * MOVE * sp; }
      const ck = grounded ? lerp(16, 2.2, SLIP) : lerp(3.5, 2, SLIP);
      const a = 1 - Math.exp(-ck * dt);
      p.vx += (tx - p.vx) * a; p.vz += (tz - p.vz) * a;
      if (p.lungeT > 0) { p.vx = p.ldx * LUNGE_V * (p.giantT > 0 ? 1.1 : 1); p.vz = p.ldz * LUNGE_V * (p.giantT > 0 ? 1.1 : 1); }
      const kf = grounded ? lerp(3.1, 0.5, SLIP) : 0.7; const kd = Math.exp(-kf * dt); p.kx *= kd; p.kz *= kd;
      p.x += (p.vx + p.kx) * dt; p.z += (p.vz + p.kz) * dt;
      // draaien
      if (p.lungeT > 0) p.c.faceDir(p.ldx, p.ldz); else if (free && inp.mag > 0.15) p.c.faceDir(inp.x, inp.y);
      // springen
      if (inp.aP && p.jumpCd <= 0 && p.stun <= 0 && p.lungeT <= 0 && (grounded || (p.y < 0 && p.y > -0.9 && p.fallT < 0.22))) {
        p.vy = JUMP_V; p.y = Math.max(p.y, 0.001); p.jumpCd = JUMP_CD; p.st = 'ok'; p.fallT = 0; p.c.jump(); audio.sfx('jump', { vol: 0.5 });
        if (inp.mag > 0.25) { p.kx += inp.x / inp.mag * 5.5 * sp; p.kz += inp.y / inp.mag * 5.5 * sp; }
        fx.particles.dust(p.x, 0, p.z, 5);
      }
      // duw (of bom gooien)
      if (inp.bP && p.stun <= 0 && p.lungeT <= 0 && p.st !== 'fall') {
        if (p.bomb_t > 0) throwBomb(p);
        else if (p.pushCd <= 0) {
          let dx = Math.sin(p.c.targetYaw), dz = Math.cos(p.c.targetYaw); if (inp.mag > 0.3) { dx = inp.x / inp.mag; dz = inp.y / inp.mag; }
          p.ldx = dx; p.ldz = dz; p.lungeT = LUNGE_T; p.hit.length = 0; p.pushCd = PUSH_CD * cdMul(p); stats.pushes++;
          p.c.swing(); audio.sfx('swing', { vol: 0.5 }); fx.particles.dust(p.x, 0, p.z, 4);
        }
      }
      // verticaal
      const wasAir = p.air;
      if (grounded && p.vy <= 0) { p.y = 0; p.vy = 0; }
      else {
        p.vy -= GR * dt; p.y += p.vy * dt;
        if (p.y <= 0) { if (onPlate && p.y > -0.6 && p.vy <= 0) { p.y = 0; p.vy = 0; } else { p.st = 'fall'; p.fallT += dt; } }
      }
      p.air = p.y > 0.08;
      if (wasAir && !p.air) {   // landing
        fx.particles.dust(p.x, 0, p.z, 6); audio.sfx('land', { vol: 0.35 });
        if (p.giantT > 0) {   // reuzenschoen: stamp
          ctx.shake(0.4); audio.sfx('thud', { vol: 0.7 }); fx.particles.ring(p.x, 0.15, p.z, { count: 28, speed: 8, color: 0xffb23a, size: 0.5, life: 0.5 });
          for (const q of pl) if (q !== p && alive(q) && q.inv <= 0 && q.y < 0.4) { const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d < 3.8 * p.sz) { if (q.shieldT > 0) { breakShield(q); continue; } pushOn(q, dx / (d || 1), dz / (d || 1), 15, p.i, 0.4, 4); } }
        }
      }
      if (p.y > -0.01 && onPlate) { p.st = 'ok'; p.fallT = 0; }
      if (p.st === 'fall' && p.y < -3.2) { lavaDeath(p); return; }
      // lunge: raken
      if (p.lungeT > 0) {
        for (const q of pl) {
          if (q === p || !alive(q) || p.hit.includes(q.i)) continue;
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); const reach = p.R + q.R + 0.75;
          if (d > reach || (dx * p.ldx + dz * p.ldz) / (d || 1) < 0.15) continue;
          p.hit.push(q.i); const nx = dx / (d || 1), nz = dz / (d || 1);
          if (q.y > 0.45) { stats.dodged++; floatText('ZWEEF!', q.x, 3.3, q.z, '#9aff9a', 1.1); audio.sfx('whoosh', { vol: 0.4 }); continue; }
          if (q.inv > 0) continue;
          if (q.shieldT > 0) { breakShield(q); p.kx -= p.ldx * 7; p.kz -= p.ldz * 7; p.lungeT = 0; p.stun = 0.25; continue; }
          pushOn(q, nx, nz, PUSH_IMP * (p.giantT > 0 ? 1.3 : 1) * Math.pow(p.mass, 0.5), p.i, 0.32, 2.5);
          p.kx -= nx * 3; p.kz -= nz * 3; p.lungeT = Math.min(p.lungeT, 0.05);
          audio.sfx('hit', { vol: 0.6 }); ctx.shake(0.28); fx.particles.burst(q.x, 1.0, q.z, { count: 14, speed: 5, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xffe14a], gravity: 6 }); floatText('BAM!', q.x, 3, q.z, '#ffe14a', 1.2);
          q.c.pose = 'scared'; q.c.squash = 0.25;
        }
      }
      // items oppakken
      if (p.y < 1.8) for (let k = items.length - 1; k >= 0; k--) { const it = items[k]; if (Math.hypot(it.x - p.x, it.z - p.z) < 1.1 + p.R) takeItem(p, it); }
    }

    function collide() {
      for (let a = 0; a < pl.length; a++) for (let b = a + 1; b < pl.length; b++) {
        const p = pl[a], q = pl[b]; if (!alive(p) || !alive(q) || p.st === 'fall' || q.st === 'fall') continue;
        if (Math.abs(p.y - q.y) > 1.2) continue;
        let dx = q.x - p.x, dz = q.z - p.z; const d = Math.hypot(dx, dz), m = p.R + q.R; if (d >= m) continue;
        if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        const ov = m - d, wp = q.mass / (p.mass + q.mass), wq = 1 - wp;
        p.x -= dx * ov * wp; p.z -= dz * ov * wp; q.x += dx * ov * wq; q.z += dz * ov * wq;
        const rv = (q.vx + q.kx - p.vx - p.kx) * dx + (q.vz + q.kz - p.vz - p.kz) * dz;
        if (rv < 0) { const j = -rv * 0.35; p.kx -= dx * j * wp * 2; p.kz -= dz * j * wp * 2; q.kx += dx * j * wq * 2; q.kz += dz * j * wq * 2; }
      }
    }

    // ---------------- kroon, comeback, einde ----------------
    function updateCrown(dt) {
      const inZone = pl.filter((p) => alive(p) && p.y <= 0.3 && p.st === 'ok' && Math.hypot(p.x, p.z) < KB.CROWN_R);
      contested = inZone.length > 1; holder = inZone.length === 1 ? inZone[0].i : -1;
      const mat_ = W.zoneMat;
      if (contested) mat_.color.set(0xff3a3a); else if (holder >= 0) mat_.color.set(pl[holder].pp.color); else mat_.color.set(0xffd23f);
      W.beam.material.color.copy(mat_.color); W.disc.material.color.copy(mat_.color);
      if (holder >= 0) {
        const p = pl[holder]; const rate = RATE * (dbl ? 2 : 1); p.score += rate * dt; p.lastCrown = T; p.holdAcc += rate * dt;
        if (p.holdAcc >= 12) { floatText(`+${Math.round(p.holdAcc)}`, p.x, 3.4, p.z, p.pp.css, 0.9); p.holdAcc = 0; }
        if (Math.random() < dt * 10) fx.particles.emit(p.x + (Math.random() - 0.5) * 1.2, 0.5, p.z + (Math.random() - 0.5) * 1.2, 0, 2.5, 0, { life: 0.7, size: 0.3, color: 0xffd23f, gravity: -1 });
      } else if (contested && Math.random() < dt * 8) fx.particles.emit((Math.random() - 0.5) * 3, 0.4, (Math.random() - 0.5) * 3, 0, 2, 0, { life: 0.5, size: 0.3, color: 0xff5a3a, gravity: 0 });
      for (const p of pl) if (holder !== p.i) p.holdAcc = 0;
    }
    function updateRanks(dt) {
      rankT -= dt; if (rankT > 0) return; rankT = 0.25;
      const r = ranked(), lead = r[0].score, low = r[r.length - 1].score;
      for (const p of pl) {
        const want = lead - low >= 25 && p.score <= low + 0.5 && p.score < lead;
        if (want !== p.comeback) { p.comeback = want; if (want) { floatText('⚡ OPLADEN!', p.x, 4.2, p.z, '#ffe14a', 1.3); hud.toast(`⚡ ${p.pp.name} laadt dubbel zo snel op!`, 1800); audio.sfx('powerup', { vol: 0.4 }); } }
      }
      const top = r[0].score > r[1].score + 1 ? r[0] : null;
      if (top && alive(top)) { leaderCrown.visible = true; leaderCrown.userData.who = top.i; } else leaderCrown.visible = false;
    }
    function pickWinner() {
      const rnd = pl.map(() => ctx.rng());   // laatste redmiddel: lot
      const r = pl.slice().sort((a, b) => (Math.round(b.score) - Math.round(a.score)) || (b.lastCrown - a.lastCrown) || (a.falls - b.falls) || (rnd[b.i] - rnd[a.i]));
      return r[0].i;
    }
    function finish() {
      if (finished) return; finished = true;
      const w = pickWinner(), sc = pl.map((p) => Math.round(p.score)); slow = 0.5; slowHold = 0.7;
      hud.showBig(`${names[w]} IS KONING!`, 1800, w === 0 ? '#7dffb0' : w === 1 ? '#8fb8ff' : '#ffb070');
      audio.sfx('bell', { vol: 0.7 }); ctx.shake(0.5);
      fx.particles.burst(0, 3, 0, { count: 90, speed: 9, up: 1.4, life: 1.6, size: 0.55, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
      const jokes = ['De Deurman klapt beleefd mee.', 'De draak is onder de indruk.', 'De kroon past precies. Bijna.', 'Het gras groeit nooit meer op deze berg.', 'De lava is blij met de bezoekers.'];
      const sum = sc[w] <= 0 ? `Niemand durfde de kroon te pakken... de munt besliste: <b>${names[w]}</b> is Koning! ` : `<b>${names[w]}</b> is Koning van de Berg met ${sc[w]} punten! ${pl.map((p) => `${p.pp.name} ${sc[p.i]}`).join(' · ')}.<br>${stats.falls} keer in de lava, ${stats.kos} knock-outs, ${stats.pushes} duwen en ${stats.deur} high-five${stats.deur === 1 ? '' : 's'} van de Deurman. ${jokes[Math.floor(Math.random() * jokes.length)]}`;
      pl.forEach((p) => { p.sz = 1; p.stun = 0; p.lungeT = 0; });
      ctx.finishPvp({ winner: w, score: sc, delay: 1000, summary: sum });
    }

    // ---------------- visuals ----------------
    function visuals(dt) {
      for (const p of pl) {
        const vis = p.st !== 'dead'; if (!vis) continue;
        const g = p.c.group; g.position.set(p.x, Math.min(p.y, 99), p.z); g.scale.setScalar(p.sz * BASE);
        p.c.speed = p.y <= 0.05 && p.st === 'ok' ? clamp(Math.hypot(p.vx, p.vz) / MOVE, 0, 1) : 0; p.c.air = p.y > 0.2 || p.st === 'fall';
        if (!finished) p.c.pose = p.lungeT > 0 ? 'push' : p.st === 'fall' || p.stun > 0.05 ? 'scared' : p.bomb_t > 0 ? 'carry' : introT > 0 && !started ? 'wave' : 'idle';
        p.c.update(dt);
        g.visible = p.inv > 0 ? Math.sin(T * 30) > -0.4 : true;
        const gy = p.y > 0 ? 0 : p.y;
        p.ring.position.set(p.x, Math.max(-9, gy) + 0.06, p.z); p.ring.scale.setScalar(p.sz * 1.15);
        const ready = p.pushCd <= 0;
        p.ring.material.opacity = ready ? 0.95 : 0.3; p.ring.material.color.set(p.giantT > 0 ? 0xffb23a : p.comeback ? 0xffe14a : p.pp.color);
        p.shadow.position.set(p.x, 0.04, p.z); p.shadow.scale.setScalar(p.sz * (1 - clamp(p.y / 8, 0, 0.6))); p.shadow.visible = p.y > -0.5 && Math.hypot(p.x, p.z) < W.radiusAt(p.x, p.z) + 0.6;
        const top = p.c.height * p.sz * BASE;
        p.tag.position.set(p.x, Math.max(p.y, -1) + top + 0.95, p.z);
        p.shield.visible = p.shieldT > 0 && (p.shieldT > 2 || Math.sin(T * 24) > 0); p.shield.position.set(p.x, p.y + 0.1, p.z); p.shield.scale.setScalar(p.sz * 1.8); p.shield.rotation.y += dt * 2;
        p.bomb.visible = p.bomb_t > 0; if (p.bomb.visible) { p.bomb.position.set(p.x, p.y + top + 0.3, p.z); const f = p.bomb_t < 2 ? Math.sin(T * 30) > 0 : true; p.bomb.userData.spark.visible = f; p.bomb.scale.setScalar(1 + (p.bomb_t < 2 ? Math.sin(T * 24) * 0.12 : 0)); }
        if (leaderCrown.visible && leaderCrown.userData.who === p.i) { leaderCrown.position.set(p.x, p.y + top + 1.5, p.z); leaderCrown.rotation.y = T * 2; }
        if (p.comeback && Math.random() < dt * 12) fx.particles.emit(p.x + (Math.random() - 0.5), p.y + 0.3, p.z + (Math.random() - 0.5), 0, 2, 0, { life: 0.5, size: 0.28, color: 0xffe14a, gravity: -1 });
      }
      for (const it of items) { it.t += dt; it.g.position.y = 0.45 + Math.sin(it.t * 3) * 0.2; it.g.rotation.y += dt * 2; it.halo.position.y = 0.06 - it.g.position.y; it.halo.scale.setScalar(1 + Math.sin(it.t * 5) * 0.1); }
    }

    // ---------------- hoofd-update ----------------
    function updateGame(dt) {
      T += dt; tleft -= dt;
      if (!dbl && tleft <= 15) { dbl = true; hud.showBig('✨ DUBBELE KROON! ✨', 1500, '#ffe14a'); audio.sfx('powerup'); W.cheer(3); }
      // brokkelen / items / Deurman
      crumbT -= dt; if (crumbT <= 0 && tleft > 1.5) { startCrumble(); crumbN++; crumbT = Math.max(1.8, 4.2 - crumbN * 0.12) + Math.random() * 1.0; }
      itemT -= dt; if (itemT <= 0) { if (items.length < 2) spawnItem(); itemT = 6.5 + Math.random() * 2.5; }
      if (deurIdx < DEUR_TIMES.length && TIME - tleft >= DEUR_TIMES[deurIdx] && !HF.on) { deurIdx++; startHighFive(); }
      updateCrumbles(dt); updateHighFive(dt);
      const sub = 2, h = dt / sub;
      for (let s = 0; s < sub; s++) { for (const p of pl) stepPlayer(p, h); collide(); }
      // bommen in de lucht
      for (const pr of projectiles) {
        if (!pr.on) continue;
        if (!pr.landed) {
          pr.t += dt / 0.55; const k = Math.min(1, pr.t); pr.x = lerp(pr.sx, pr.tx, k); pr.z = lerp(pr.sz, pr.tz, k); pr.g.position.set(pr.x, 0.4 + Math.sin(k * Math.PI) * 2.6, pr.z); pr.g.rotation.z += dt * 10;
          if (k >= 1) { pr.landed = true; if (Math.hypot(pr.x, pr.z) > W.radiusAt(pr.x, pr.z) + 0.2) { pr.on = false; pr.g.visible = false; splash(pr.x, pr.z, 0.6); } else { pr.g.position.y = 0.4; audio.sfx('thud', { vol: 0.3 }); } }
        } else {
          pr.fuse -= dt; const f = Math.sin(T * 40) > 0; pr.g.userData.spark.visible = f; pr.g.scale.setScalar(1 + Math.sin(T * 30) * 0.12);
          if (pr.fuse <= 0) { pr.on = false; pr.g.visible = false; pr.g.scale.setScalar(1); explode(pr.x, pr.z, pr.owner, 1); }
        }
      }
      for (const it of items.slice()) { it.life -= dt; if (it.life < 0 || Math.hypot(it.x, it.z) > W.radiusAt(it.x, it.z) - 0.5) { it.on = false; it.g.visible = false; items.splice(items.indexOf(it), 1); fx.particles.burst(it.x, 0.5, it.z, { count: 10, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffffff], gravity: 5 }); } }
      updateCrown(dt); updateRanks(dt);
      // lava-sfeer
      if (Math.random() < dt * 5) { const a = Math.random() * TAU, d = KB.R0 + 1 + Math.random() * 10; fx.particles.emit(Math.sin(a) * d, -2.7, Math.cos(a) * d, 0, 2.5 + Math.random() * 2, 0, { life: 1.6, size: 0.35, color: 0xff8a2a, gravity: 1 }); }
      // hud
      hudT -= dt; if (hudT <= 0) { hudT = 0.12; refreshHud(); }
      hud.setTimer(Math.max(0, tleft), 10);
      if (tleft <= 0) finish();
    }
    function refreshHud() {
      const r = ranked();
      pl.forEach((p) => {
        const tags = (p.giantT > 0 ? '👟' : '') + (p.shieldT > 0 ? '🛡️' : '') + (p.bomb_t > 0 ? '💣' : '') + (p.comeback ? '⚡' : '') + (r[0] === p && r[0].score > r[1].score + 1 ? '👑' : '');
        hud.setPlayerInfo(p.i, `${Math.floor(p.score)} pt ${tags}`);
      });
      hud.setScore(contested ? '💥 Kroonzone betwist!' : holder >= 0 ? `👑 ${names[holder]} houdt de kroon` : dbl ? '✨ Dubbele punten!' : 'De kroon is vrij!');
    }
    function update(dt) {
      if (slowHold > 0) { slowHold -= dt; if (slowHold <= 0) slow = 1; }
      const d = dt * slow;
      W.update(T + introT, d, { splash });
      if (!finished) updateGame(d); else { for (const p of pl) p.c.update(d); }
      visuals(d);
    }
    function introUpdate(dt) { introT += dt; W.update(introT, dt, { splash }); visuals(dt); }
    refreshHud(); visuals(0.016);

    return {
      update, introUpdate,
      resultUpdate(dt) { T += dt; W.update(T + introT, dt, { splash }); visuals(dt); for (const p of pl) { p.c.update(dt); } },
      onStart() { started = true; hud.setTimer(TIME); },
      onResize() { fitCamera(); },
      onSwap() { for (const p of pl) fx.particles.burst(p.x, 1, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m && pl[i]) { const p = pl[i]; p.score = Math.max(0, p.score - 25); floatText('-25 DEURMAN!', p.x, 3.6, p.z, '#ff6a6a', 1.3); ctx.shake(0.3); audio.sfx('static', { vol: 0.4 }); } });
      },
      celebrate(w) { pl.forEach((p, i) => { p.c.pose = i === w ? 'cheer' : 'sad'; p.c.air = false; }); W.cheer(6); if (pl[w]) { leaderCrown.visible = true; leaderCrown.userData.who = w; } },
      dispose() {},
      dbg: {
        pl, W, items, state: () => ({ T, tleft, started, finished, holder, contested, dbl, comeback: pl.map((p) => p.comeback), HF: { on: HF.on, t: +HF.t.toFixed(1) }, crumbles: crumbles.length, items: items.map((i) => i.type),
          sec: W.sectors.map((s) => +s.r.toFixed(1)), p: pl.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), st: p.st, score: +p.score.toFixed(1), pushCd: +p.pushCd.toFixed(2), jumpCd: +p.jumpCd.toFixed(2), stun: +p.stun.toFixed(2), giant: +p.giantT.toFixed(1), shield: +p.shieldT.toFixed(1), bomb: +p.bomb_t.toFixed(1), falls: p.falls, kos: p.kos, inv: +p.inv.toFixed(1) })), stats }),
        giveItem: (i, type) => { const p = pl[i]; if (type === 'boot') p.giantT = 9; else if (type === 'shield') p.shieldT = 9; else p.bomb_t = 5; },
        spawnItem, startHighFive, startCrumble, setTime: (t) => { tleft = t; }, setScore: (i, v) => { pl[i].score = v; }, finish,
      },
    };
  },
};

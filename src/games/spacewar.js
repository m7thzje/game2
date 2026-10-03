import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Animal } from '../engine/chars.js';
import { buildSpace, buildDragonShip, buildBroomShip, AX, AZ } from './spacewar_world.js';

// Ruimtegevecht — duel: Spacewar!/Asteroids met sprookjesschepen (drakenschip en heksenbezem) rond de Toverster.
//  * links/rechts = draaien, omhoog = gas (traagheid!), A = schieten (6 schoten die oplaadt), B = schild (B + omlaag = hyperspring)
//  * wrap-around arena; de Toverster trekt schepen, kogels en rotsen aan (en eet ze op); rotsen splitsen als je ze raakt
//  * power-ups: drievoudig schot, zoekraketten, mijnenlegger. Gimmicks: ruimte-koe (schiet haar voor cadeautjes), komeet-waarschuwing, hongerige ster
//  * eerste tot 5 treffers; na 90 s wint wie voorstaat, bij gelijkstand SUDDEN DEATH: de ster wordt een zwart gat dat steeds harder trekt
//  * comeback: wie 2+ achterstaat laadt sneller op, krijgt na een knal een gouden schild en ziet de power-ups dichtbij verschijnen

const WIN = 5, MATCH = 90, SD_MAX = 38;
const WX = 2 * AX, WZ = 2 * AZ;
const KG = 560;                          // sterkte van de Toverster
const TURN = 3.9, THRUST = 25, VMAX = 25, DRAG = 0.1;
const BSPD = 31, BLIFE = 1.0, AMMO = 6, RELOAD = 0.62, FIRECD = 0.2;
const SHIELD_T = 1.3, SHIELD_CD = 4.8, HYPER_CD = 7;
const STAR_R = 1.6;
const AST_R = [0, 0.95, 1.7, 2.7], AST_V = [0, 7, 5, 3.4];

const wd = (d, W) => (d > W / 2 ? d - W : d < -W / 2 ? d + W : d);
const wrapX = (x) => (x > AX ? x - WX : x < -AX ? x + WX : x);
const wrapZ = (z) => (z > AZ ? z - WZ : z < -AZ ? z + WZ : z);

const PU = {
  triple: { name: 'DRIEVOUDIG SCHOT!', col: '#ffe14a', hex: 0xffe14a },
  missile: { name: 'ZOEKRAKETTEN!', col: '#ff6b6b', hex: 0xff6b6b },
  mine: { name: 'MIJNENLEGGER!', col: '#d49aff', hex: 0xd49aff },
};

function iconTexture(type) {
  return canvasTex(128, 128, (g, w, h) => {
    const col = PU[type].col;
    g.translate(64, 64);
    g.fillStyle = 'rgba(10,6,40,.85)'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.52; g.lineTo(Math.cos(a) * 58, Math.sin(a) * 58); } g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 7; g.stroke();
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 7;
    if (type === 'triple') { for (const a of [-0.5, 0, 0.5]) { g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, 32); g.lineTo(0, -22); g.stroke(); g.beginPath(); g.moveTo(-10, -14); g.lineTo(0, -32); g.lineTo(10, -14); g.fill(); g.restore(); } }
    else if (type === 'missile') { g.beginPath(); g.ellipse(0, 0, 11, 30, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(-11, 18); g.lineTo(-24, 36); g.lineTo(-6, 28); g.fill(); g.beginPath(); g.moveTo(11, 18); g.lineTo(24, 36); g.lineTo(6, 28); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -6, 5, 0, TAU); g.fill(); }
    else { g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.fill(); for (let k = 0; k < 8; k++) { g.save(); g.rotate(k / 8 * TAU); g.beginPath(); g.moveTo(0, -14); g.lineTo(0, -34); g.stroke(); g.restore(); } g.fillStyle = '#fff'; g.beginPath(); g.arc(-6, -6, 4, 0, TAU); g.fill(); }
  });
}

export default {
  id: 'spacewar',
  name: 'Ruimtegevecht',
  giver: 'Kapitein Komeet',
  icon: '🚀',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Twee sprookjesschepen en één hongerige <b>Toverster</b> die alles aantrekt! Schiet je broer uit de ruimte. Vlieg je links de rand uit, dan kom je rechts terug. <b>Eerste tot 5 treffers</b> wint!',
  controls: ['{move} draaien en gas geven', '{a} schieten (munitie laadt op)', '{b} schild (+ omlaag = hyperspring)'],
  tip: 'Tegen de ster aan vliegen is een zonnesteek!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const PK = 1.6;                                    // deeltjes en tekst iets groter: de camera hangt ver weg
    const pb = (x, y, z, o) => fx.particles.burst(x, y, z, { ...o, size: (o.size ?? 0.25) * PK });
    const pe = (x, y, z, vx, vy, vz, o) => fx.particles.emit(x, y, z, vx, vy, vz, { ...o, size: (o.size ?? 0.3) * PK });
    const pr = (x, y, z, o) => fx.particles.ring(x, y, z, { ...o, size: (o.size ?? 0.2) * PK });

    const L = ctx.lights('night', { shadows: false, fog: false });
    L.hemi.intensity = 1.5; L.hemi.color.set(0xb8c8ff); L.hemi.groundColor.set(0x5a3a9a);
    L.sun.color.set(0xffe8ff); L.sun.intensity = 1.6; L.sun.position.set(-14, 40, 12);
    const W = buildSpace(ctx);
    camera.fov = 44; camera.near = 5; camera.far = 400; camera.updateProjectionMatrix();
    function fitCamera() {
      const asp = camera.aspect || 1.7, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const hh = Math.max(18.9, (AX + 2.4) / asp);
      const cz = AZ + 0.6 - hh, H = hh / tanV;
      camera.up.set(0, 0, -1); camera.position.set(0, H, cz); camera.lookAt(0, 0, cz);
    }
    fitCamera();

    // ---------------- schepen ----------------
    const ships = players.map((pp, i) => {
      const size = pv.size(i);
      const g = i ? buildBroomShip(PLAYER_COLORS[i]) : buildDragonShip(PLAYER_COLORS[i]);
      const c = makeBrother(i); const sc = 1.55 / c.height; c.group.scale.setScalar(sc); c.pose = 'sit';
      const seat = g.userData.seat; c.group.position.set(seat.x, seat.y - 0.25, seat.z); g.userData.body.add(c.group);
      const holder = new THREE.Group(); holder.add(g); holder.scale.setScalar(size); scene.add(holder);
      const ud = g.userData, fIdx = ud.body.children.indexOf(ud.flame); g.userData = {};      // userData zou bij clone() als JSON worden gekopieerd
      const ghosts = [0, 1, 2].map(() => { const gh = new THREE.Group(); const cl = g.clone(true); gh.add(cl); gh.scale.setScalar(size); gh.visible = false; scene.add(gh); return { gh, flame: cl.children[0].children[fIdx] }; });
      g.userData = ud;
      const col = PLAYER_COLORS[i];
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })); bubble.visible = false; scene.add(bubble);
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); rim.rotation.x = -Math.PI / 2; bubble.add(rim); rim.position.y = 0;
      const mark = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.6, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); mark.rotation.x = -Math.PI / 2; scene.add(mark);
      const dir = i ? -1 : 1;
      const s = {
        i, g, holder, ghosts, c, bubble, mark, flame: g.userData.flame, body: g.userData.body, col, size, r: 1.0 * size, spd: pv.speed(i),
        x: -dir * AX * 0.72, z: dir * 6, vx: 0, vz: 0, a: i ? Math.PI : 0, alive: true, respT: 0, inv: 1.5, shield: 0, cd: 0, ammo: AMMO, fireCd: 0, triple: 0, missiles: 0, mineT: 0, mineCd: 0, gold: 0,
        bank: 0, trail: 0, warp: 0, thrusting: false, hits: 0, deaths: 0, wasA: false, lastKillBy: -1, tagKey: '',
      };
      return s;
    });
    const other = (s) => ships[1 - s.i];

    // ---------------- toestand ----------------
    const score = [0, 0];
    let T = 0, clock = MATCH, started = false, finished = false, over = false, endT = 0, winner = -1, sd = false, sdT = 0, slowK = 1, slowHold = 0, stop = 0;
    let eventT = 13, lastEvent = '', rockT = 3, puT = 7, hudT = 0, pulseT = 0, burpT = 0;
    let gMul = 1;
    const stat = { rocks: 0, kills: [0, 0], cow: 0, comets: 0, hyper: 0, reflects: 0, eaten: 0, selfHit: 0, mines: 0, missiles: 0 };

    // ---------------- visuals-pools ----------------
    // kogels (geinstantieerd: kern + gloed per speler)
    const BN = 40;
    const bulletIM = [0, 1].map((i) => {
      const col = PLAYER_COLORS[i];
      const core = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), BN); core.frustumCulled = false; core.count = 0; scene.add(core);
      const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), BN); glow.frustumCulled = false; glow.count = 0; scene.add(glow);
      return { core, glow };
    });
    // asteroiden (geinstantieerd, met wrap-spoken)
    const AN = 96;
    const astGeo = new THREE.IcosahedronGeometry(1, 1);
    { const p = astGeo.attributes.position, v = new THREE.Vector3(); for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); const n = 1 + (Math.sin(v.x * 7.1 + v.y * 3.3) * Math.cos(v.z * 5.7 + v.x * 2.1)) * 0.22; p.setXYZ(k, v.x * n, v.y * n * 0.8, v.z * n); } astGeo.computeVertexNormals(); }
    const astIM = new THREE.InstancedMesh(astGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2, flatShading: true, emissive: 0x2a1060, emissiveIntensity: 0.9 }), AN); astIM.frustumCulled = false; astIM.count = 0; scene.add(astIM);
    const ASTCOL = [0xff7ad8, 0x5fe8ff, 0xa78bff, 0xffa050, 0x7dffb0].map((c) => new THREE.Color(c));
    // shockwave-ringen
    const rings = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.3; m.visible = false; scene.add(m); return { m, t: 9, max: 4, life: 0.5 }; });
    let ringN = 0;
    function ring(x, z, col, max = 4, life = 0.5) { const r = rings[ringN++ % rings.length]; r.t = 0; r.max = max; r.life = life; r.m.position.set(x, 0.3, z); r.m.material.color.set(col); r.m.visible = true; }
    // raketten, mijnen, power-ups
    const missileGeo = new THREE.ConeGeometry(0.28, 1.3, 7);
    const missiles = [], mines = [], pups = [], bullets = [], asts = [];
    const missilePool = Array.from({ length: 6 }, () => { const g = new THREE.Group(); g.add(mesh(missileGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff4a4a, emissiveIntensity: 0.8, flatShading: true }), { cast: false, rot: [Math.PI / 2, 0, 0] })); const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 5), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); fl.rotation.x = -Math.PI / 2; fl.position.z = -1.0; g.add(fl); g.visible = false; scene.add(g); return g; });
    const mineGeo = new THREE.IcosahedronGeometry(0.62, 0), spikeGeo = new THREE.ConeGeometry(0.14, 0.6, 4);
    const minePool = Array.from({ length: 10 }, () => {
      const g = new THREE.Group(); const body = new THREE.Mesh(mineGeo, new THREE.MeshStandardMaterial({ color: 0x2a1a50, emissive: 0xffffff, emissiveIntensity: 0.4, flatShading: true })); g.add(body);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.add(mesh(spikeGeo, mat(0xb8a0ff), { cast: false, pos: [Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7], rot: [Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2] })); }
      const lamp = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 20), new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); lamp.rotation.x = -Math.PI / 2; g.add(lamp);
      g.userData = { body, lamp }; g.visible = false; scene.add(g); return g;
    });
    const puTex = { triple: iconTexture('triple'), missile: iconTexture('missile'), mine: iconTexture('mine') };
    const glowT = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    function mkPuMesh(type) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 6), new THREE.MeshBasicMaterial({ map: puTex[type], transparent: true, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.rotation.z = 0; g.add(disc);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: PU[type].hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); halo.scale.set(4, 4, 1); halo.position.y = -0.2; g.add(halo);
      const rg = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.65, 24), new THREE.MeshBasicMaterial({ color: PU[type].hex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); rg.rotation.x = -Math.PI / 2; g.add(rg);
      g.userData.rg = rg; return g;
    }
    // ammo-bolletjes onder de schepen (1 draw call)
    const pips = new THREE.InstancedMesh(new THREE.CircleGeometry(0.24, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), AMMO * 2 + 2); pips.frustumCulled = false; scene.add(pips);
    pips.geometry.rotateX(-Math.PI / 2);
    // ruimte-koe
    const cow = { alive: false, x: 0, z: 0, vx: 0, vz: 0, spin: 0, holder: new THREE.Group(), animal: null, respT: 6, r: 1.7 };
    {
      const a = new Animal('cow'); a.group.scale.setScalar(1.35); a.group.position.set(0, 0.2, 0); cow.animal = a; cow.holder.add(a.group);
      cow.holder.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.2, depthWrite: false })));
      cow.holder.visible = false; scene.add(cow.holder);
    }
    // komeet
    const comet = { on: false, x: 0, z: 0, vx: 0, t: 0, warn: 0, g: new THREE.Group(), strip: null };
    {
      comet.g.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 9), new THREE.MeshBasicMaterial({ color: 0xdff8ff })));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(1.3, 9, 10), new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); tail.rotation.z = Math.PI / 2; tail.position.x = -4.6; comet.g.add(tail);
      comet.g.visible = false; scene.add(comet.g);
      comet.strip = new THREE.Mesh(new THREE.PlaneGeometry(WX + 4, 3.2), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); comet.strip.rotation.x = -Math.PI / 2; comet.strip.position.y = 0.1; comet.strip.visible = false; scene.add(comet.strip);
    }

    // ---------------- hulpfuncties ----------------
    function burst(x, z, cols, n = 24, sp = 9, size = 0.5, life = 0.8) {
      pb(x, 0.5, z, { count: n, speed: sp, up: 0.05, life, size, colors: cols, gravity: 0 });
    }
    function say(text, x, z, col = '#ffe14a', sc = 1.3) { fx.texts.add(text, clamp(x, -AX + 3, AX - 3), 1.5, clamp(z, -AZ + 1.5, AZ - 1), col, sc * 1.7); }
    function nearestShipToStar() { let b = null, bd = 1e9; for (const s of ships) if (s.alive) { const d = s.x * s.x + s.z * s.z; if (d < bd) { bd = d; b = s; } } return b; }
    function behindIdx() { return score[0] === score[1] ? -1 : score[0] < score[1] ? 0 : 1; }
    const trailing2 = (s) => score[other(s).i] - score[s.i] >= 2;

    // ---------------- bullets / missiles / mines ----------------
    function shoot(s) {
      const f = [Math.sin(s.a), -Math.cos(s.a)];
      const angs = s.triple > 0 ? [-0.26, 0, 0.26] : [0];
      for (const da of angs) {
        if (bullets.length >= BN * 2 - 2) break;
        const a = s.a + da, fx_ = Math.sin(a), fz_ = -Math.cos(a);
        bullets.push({ x: wrapX(s.x + fx_ * 1.7 * s.size), z: wrapZ(s.z + fz_ * 1.7 * s.size), vx: fx_ * BSPD + s.vx * 0.5, vz: fz_ * BSPD + s.vz * 0.5, owner: s.i, life: BLIFE, age: 0, refl: false });
      }
      s.vx -= f[0] * 0.5; s.vz -= f[1] * 0.5;                       // een beetje terugslag
      audio.sfx('shoot', { vol: 0.4, rate: 0.9 + Math.random() * 0.3 });
      pb(s.x + f[0] * 1.7, 0.5, s.z + f[1] * 1.7, { count: 4, speed: 5, up: 0, life: 0.25, size: 0.35, colors: [0xffffff, s.col], gravity: 0 });
    }
    function launchMissile(s) {
      const g = missilePool.find((m) => !m.visible); if (!g) { shoot(s); return; }
      g.visible = true; const f = [Math.sin(s.a), -Math.cos(s.a)];
      missiles.push({ x: wrapX(s.x + f[0] * 1.8 * s.size), z: wrapZ(s.z + f[1] * 1.8 * s.size), vx: f[0] * 13 + s.vx * 0.6, vz: f[1] * 13 + s.vz * 0.6, a: s.a, owner: s.i, target: 1 - s.i, life: 5, age: 0, g });
      stat.missiles++; audio.sfx('whoosh', { vol: 0.6, rate: 1.4 }); audio.sfx('throw', { vol: 0.3 });
    }
    function dropMine(s) {
      const g = minePool.find((m) => !m.visible); if (!g) return;
      if (mines.filter((m) => m.owner === s.i).length >= 4) return;
      g.visible = true; g.userData.body.material.emissive.set(s.col);
      const f = [Math.sin(s.a), -Math.cos(s.a)];
      mines.push({ x: wrapX(s.x - f[0] * 1.8 * s.size), z: wrapZ(s.z - f[1] * 1.8 * s.size), vx: s.vx * 0.2, vz: s.vz * 0.2, owner: s.i, arm: 0.9, life: 16, g, t: 0 });
      audio.sfx('pop', { vol: 0.35, rate: 0.7 });
    }
    function killMine(m, boom) {
      m.dead = true; m.g.visible = false;
      if (boom) {
        stat.mines++; burst(m.x, m.z, [0xd49aff, 0xffffff, 0xff7ad8], 30, 10, 0.6, 0.8); ring(m.x, m.z, 0xd49aff, 3.4, 0.45); audio.sfx('explode', { vol: 0.6, rate: 1.2 }); ctx.shake(0.3);
        for (const s of ships) if (s.alive && s.i !== m.owner) { const dx = wd(s.x - m.x, WX), dz = wd(s.z - m.z, WZ); if (Math.hypot(dx, dz) < 2.9 + s.r) hitShip(s, m.owner, 'mijn', true); }
      }
    }

    // ---------------- asteroiden ----------------
    function spawnAst(size, x, z, vx, vz) {
      if (asts.length >= 24) return null;
      const a = { size, r: AST_R[size], x, z, vx, vz, rot: Math.random() * TAU, spin: rand(-1.2, 1.2), tilt: rand(-0.6, 0.6), col: Math.floor(Math.random() * ASTCOL.length), dead: false };
      asts.push(a); return a;
    }
    function spawnEdgeRock() {
      const side = Math.random() < 0.5 ? 0 : 1; let x, z, a;
      if (side) { x = rand(-AX, AX); z = Math.random() < 0.5 ? -AZ + 0.5 : AZ - 0.5; } else { z = rand(-AZ, AZ); x = Math.random() < 0.5 ? -AX + 0.5 : AX - 0.5; }
      a = Math.atan2(-z, -x) + rand(-0.9, 0.9);
      spawnAst(3, x, z, Math.cos(a) * AST_V[3], Math.sin(a) * AST_V[3]);
    }
    function breakAst(a, byShip = -1, fromBullet = true) {
      if (a.dead) return; a.dead = true; stat.rocks++;
      const col = ASTCOL[a.col];
      burst(a.x, a.z, [col.getHex(), 0xffffff, 0xffe14a], 10 + a.size * 6, 5 + a.size * 2, 0.35 + a.size * 0.15, 0.6);
      audio.sfx(a.size > 1 ? 'thud' : 'pop', { vol: 0.35 + a.size * 0.1, rate: 1.6 - a.size * 0.25 }); ctx.shake(0.04 * a.size);
      if (a.size > 1) {
        const n = 2, base = Math.atan2(a.vz, a.vx);
        for (let k = 0; k < n; k++) { const an = base + (k ? 1 : -1) * rand(0.6, 1.3), sp = AST_V[a.size - 1] * rand(0.9, 1.3); spawnAst(a.size - 1, a.x + Math.cos(an) * a.r * 0.5, a.z + Math.sin(an) * a.r * 0.5, Math.cos(an) * sp + a.vx * 0.3, Math.sin(an) * sp + a.vz * 0.3); }
      }
      if (a.size === 3 && byShip >= 0 && Math.random() < 0.3) spawnPowerup(null, a.x, a.z);
    }

    // ---------------- power-ups ----------------
    function spawnPowerup(type, x, z) {
      if (pups.length >= 3) return;
      type = type || pick(['triple', 'missile', 'mine']);
      if (x === undefined) {
        const bi = behindIdx(); let tries = 0;
        do { x = rand(-AX + 4, AX - 4); z = rand(-AZ + 3, AZ - 3); if (bi >= 0 && tries < 6) { const s = ships[bi]; x = clamp(s.x + rand(-10, 10), -AX + 3, AX - 3); z = clamp(s.z + rand(-7, 7), -AZ + 3, AZ - 3); } tries++; } while (Math.hypot(x, z) < 5 && tries < 12);
      }
      const g = mkPuMesh(type); g.position.set(x, 0.4, z); scene.add(g);
      pups.push({ type, x, z, g, t: 0, life: 16, vx: rand(-1, 1), vz: rand(-1, 1) });
      audio.sfx('sparkle', { vol: 0.3 }); pr(x, 0.5, z, { count: 12, speed: 4, color: PU[type].hex, size: 0.3, life: 0.5 });
    }
    function givePower(s, type) {
      if (type === 'triple') s.triple = 11; else if (type === 'missile') s.missiles = Math.min(4, s.missiles + (trailing2(s) ? 4 : 3)); else { s.mineT = 10; s.mineCd = 0.3; }
      say(PU[type].name, s.x, s.z - 2.4, PU[type].col, 1.5); audio.sfx('powerup', { vol: 0.8 }); ring(s.x, s.z, PU[type].hex, 4, 0.5); burst(s.x, s.z, [PU[type].hex, 0xffffff], 18, 6, 0.4, 0.6);
    }

    // ---------------- doden / respawn ----------------
    function hitShip(s, killer, why, force = false) {
      if (!s.alive || over) return false;
      if (s.shield > 0 && !force) return false;
      if (s.inv > 0 || s.warp > 0.15) return false;
      s.alive = false; s.respT = 1.8; s.deaths++; s.g.visible = false; s.bubble.visible = false; s.mark.visible = false; s.ghosts.forEach((o) => (o.gh.visible = false)); s.holder.visible = false;
      s.triple = 0; s.missiles = 0; s.mineT = 0; s.shield = 0;
      const col = s.col, k = 1 - s.i;
      burst(s.x, s.z, [col, 0xffffff, 0xffe14a, 0xff7a4a], 60, 12, 0.7, 1.1); ring(s.x, s.z, col, 6, 0.6); ring(s.x, s.z, 0xffffff, 3.5, 0.35);
      ctx.shake(0.55); audio.sfx('explode', { vol: 0.9 }); slowK = 0.3; slowHold = 0.5; stop = 0.06;
      // puin
      for (let d = 0; d < 8; d++) { const a = d / 8 * TAU; pe(s.x, 0.5, s.z, Math.cos(a) * 7 + s.vx * 0.4, 0, Math.sin(a) * 7 + s.vz * 0.4, { life: 1.4, size: 0.9, color: d % 2 ? col : 0xffe14a, gravity: 0 }); }
      const text = { ster: 'ZONNESTEEK!', rots: 'BOENG! Rots!', komeet: 'KOMEET!', eigen: 'EIGEN SCHOT!', kogel: 'BOEM!', raket: 'RAKET!', mijn: 'MIJN!', gat: 'HAPS!' }[why] || 'BOEM!';
      say(text, s.x, s.z - 2, '#ff9a6a', 1.6);
      score[k]++; stat.kills[k]++; ships[k].hits++;
      if (why === 'eigen') stat.selfHit++;
      refreshHud();
      if (score[k] >= WIN) endMatch(k, `${names[k]} haalde als eerste 5 treffers.`);
      else if (sd && !over) endMatch(k, 'Sudden death: de eerste treffer wint!');
      return true;
    }
    function respawn(s) {
      s.alive = true; const dir = s.i ? 1 : -1; s.x = dir * AX * 0.72; s.z = -dir * 6; s.vx = s.vz = 0; s.a = s.i ? Math.PI : 0; s.inv = 2.2; s.shield = 0; s.cd = 0; s.ammo = AMMO; s.fireCd = 0.3;
      s.g.visible = true; s.holder.visible = true; s.mark.visible = true;
      if (trailing2(s)) { s.gold = 4.2; say('GOUDEN SCHILD!', s.x, s.z - 2.5, '#ffd23f', 1.4); audio.sfx('sparkle', { vol: 0.7 }); }
      ring(s.x, s.z, s.col, 4, 0.5); burst(s.x, s.z, [s.col, 0xffffff], 20, 6, 0.4, 0.6); audio.sfx('go', { vol: 0.3, rate: 1.3 });
    }

    // ---------------- einde ----------------
    function endMatch(w, why) {
      if (over) return; over = true; winner = w; endT = 2.2; slowK = 0.4; slowHold = 2; endWhy = why || '';
      hud.setTimer(null); hud.showBig(`${names[w]} WINT!`, 2000, '#ffe14a'); audio.sfx('win', { vol: 0.8 });
      ships[w].c.pose = 'cheer'; ships[1 - w].c.pose = 'sad';
    }
    let endWhy = '';
    function finishMatch() {
      if (finished) return; finished = true;
      const w = winner, l = 1 - w;
      const jokes = [`${names[w]} zweeft als een held door het heelal. ${names[l]} zoekt zijn bezem.`, `De Toverster knipoogt naar ${names[w]}.`, `${names[l]} vliegt nog steeds rondjes om de ster. Gelukkig is er niemand die kijkt.`, `${names[w]} schiet raak, ${names[l]} schiet raar.`];
      const bits = [];
      if (stat.rocks) bits.push(`${stat.rocks} rotsen kapotgeschoten`); if (stat.cow) bits.push('de koe is geraakt (moeee!)'); if (stat.eaten) bits.push(`${stat.eaten} dingen door de ster opgegeten`); if (stat.selfHit) bits.push(`${stat.selfHit}x eigen schot`);
      ctx.finishPvp({ winner: w, score: [score[0], score[1]], delay: 700, summary: `${pick(jokes)} ${endWhy}<br><small>${bits.join(' · ')}</small>` });
    }
    function timeUp() {
      if (score[0] !== score[1]) { endMatch(score[0] > score[1] ? 0 : 1, 'Meeste treffers na 90 seconden.'); return; }
      startSD();
    }
    function startSD() {
      sd = true; sdT = 0; hud.setTimer(null); hud.showBig('SUDDEN DEATH!', 1600, '#ff4a4a'); hud.toast('De ster wordt een zwart gat! Eerste treffer wint!', 3000);
      audio.sfx('buzz', { vol: 0.9 }); ctx.shake(0.6); W.setMood('grump'); refreshHud();
      for (const s of ships) { s.ammo = AMMO; s.cd = 0; if (!s.alive) s.respT = 0.2; }
    }

    // ---------------- HUD ----------------
    function refreshHud() { hud.setScore(sd ? `SUDDEN DEATH · ${names[0]} ${score[0]} – ${score[1]} ${names[1]}` : `${names[0]} ${score[0]} – ${score[1]} ${names[1]}`); }
    function updateHudInfo() {
      for (const s of ships) {
        const n = Math.floor(s.ammo + 0.001);
        let t = `${'●'.repeat(n)}${'○'.repeat(AMMO - n)}`;
        t += s.cd <= 0 ? '  schild klaar' : `  schild ${Math.ceil(s.cd)}s`;
        if (s.triple > 0) t += '  ×3'; if (s.missiles > 0) t += `  🚀${s.missiles}`; if (s.mineT > 0) t += '  💣';
        hud.setPlayerInfo(s.i, t);
      }
    }

    // ---------------- evenementen ----------------
    function nextEvent() {
      const kinds = ['comet', 'pulse', cow.alive ? 'pups' : cow.respT <= 0 ? 'cow' : 'pups'].filter((k) => k !== lastEvent); const k = pick(kinds); lastEvent = k;
      if (k === 'comet') startComet();
      else if (k === 'pulse') { pulseT = 2.6; W.setMood('oh'); hud.showBig('🌟 HONGER!', 1200, '#ffd23f'); hud.toast('De ster krijgt honger en trekt harder!', 2200); audio.sfx('whoosh', { vol: 0.8, rate: 0.5 }); ring(0, 0, 0xffd24a, 14, 1.2); }
      else if (k === 'cow') spawnCow(); else { for (let i = 0; i < 2; i++) spawnPowerup(); hud.toast('🎁 Cadeautjes in de ruimte!', 1800); }
      eventT = rand(14, 19);
    }
    function startComet() {
      stat.comets++; comet.warn = 1.9; comet.on = false; comet.t = 0; comet.z = rand(-AZ + 3, AZ - 3); comet.dir = Math.random() < 0.5 ? -1 : 1;
      comet.strip.position.z = comet.z; comet.strip.visible = true;
      hud.showBig('☄️ KOMEET!', 1200, '#ff6b6b'); hud.toast('Weg uit de rode baan!', 2000); audio.sfx('buzz', { vol: 0.8, rate: 1.4 });
    }
    function spawnCow() {
      cow.alive = true; cow.x = Math.random() < 0.5 ? -AX + 2 : AX - 2; cow.z = rand(-AZ + 4, AZ - 4); const a = rand(0, TAU); cow.vx = Math.cos(a) * 3.2; cow.vz = Math.sin(a) * 3.2; cow.holder.visible = true;
      hud.toast('🐄 Een ruimte-koe! Raak haar voor cadeautjes!', 2400); audio.sfx('boing', { vol: 0.6 }); ring(cow.x, cow.z, 0x9fe8ff, 5, 0.6);
    }

    // ---------------- ship update ----------------
    function updateShip(s, dt, first) {
      const inp = pv.input(s.i);
      if (!s.alive) { if (first) { s.respT -= dt; if (s.respT <= 0 && !over) respawn(s); } return; }
      s.inv = Math.max(0, s.inv - dt); s.shield = Math.max(0, s.shield - dt); s.cd = Math.max(0, s.cd - dt); s.fireCd = Math.max(0, s.fireCd - dt); s.gold = Math.max(0, s.gold - dt); s.warp = Math.max(0, s.warp - dt);
      s.triple = Math.max(0, s.triple - dt); s.mineT = Math.max(0, s.mineT - dt); s.mineCd -= dt;
      const sp = s.spd;
      // draaien en gas
      const tx = Math.abs(inp.x) > 0.25 ? clamp(inp.x * 1.6, -1, 1) : 0;
      const thr = inp.y < -0.3;
      s.a += tx * TURN * Math.pow(sp, 0.7) * dt; s.bankT = tx;
      const fx_ = Math.sin(s.a), fz_ = -Math.cos(s.a);
      if (thr) { s.vx += fx_ * THRUST * sp * dt; s.vz += fz_ * THRUST * sp * dt; }
      s.thrusting = thr;
      // ster-zwaartekracht
      const r2 = s.x * s.x + s.z * s.z, r = Math.sqrt(r2) || 0.01, a = KG * GRAV * gMul / (r2 + 12);
      s.vx -= s.x / r * a * dt; s.vz -= s.z / r * a * dt;
      const drag = DRAG * (1 - SLIP);
      s.vx *= Math.exp(-drag * dt); s.vz *= Math.exp(-drag * dt);
      const v = Math.hypot(s.vx, s.vz), vm = VMAX * sp;
      if (v > vm) { const k = damp(v, vm, 3, dt) / v; s.vx *= k; s.vz *= k; }
      s.x = wrapX(s.x + s.vx * dt); s.z = wrapZ(s.z + s.vz * dt);
      // zon / zwart gat
      const killR = sd ? holeR() : STAR_R;
      if (r < killR + s.r * 0.4 && s.warp <= 0) { if (hitShip(s, 1 - s.i, sd ? 'gat' : 'ster', true)) { burpT = 0.7; audio.sfx('pop', { vol: 0.6, rate: 0.6 }); return; } }
      // laden
      const ra = trailing2(s) ? 1.6 : 1;
      if (s.ammo < AMMO) s.ammo = Math.min(AMMO, s.ammo + dt / RELOAD * ra);
      // schieten
      if (first && inp.a && s.fireCd <= 0 && !(s.warp > 0)) {
        if (s.missiles > 0) { launchMissile(s); s.missiles--; s.fireCd = 0.55; }
        else if (s.ammo >= 1) { shoot(s); s.ammo -= 1; s.fireCd = FIRECD; }
        else if (inp.aP) { audio.sfx('click', { vol: 0.3, rate: 0.7 }); s.fireCd = 0.15; pb(s.x, 0.5, s.z, { count: 3, speed: 2, up: 0, life: 0.3, size: 0.3, color: 0x888888, gravity: 0 }); }
      }
      // B: schild / hyperspring
      if (first && inp.bP && s.cd <= 0) {
        if (inp.y > 0.5) hyper(s);
        else { s.shield = SHIELD_T; s.cd = SHIELD_CD; audio.sfx('whoosh', { vol: 0.5, rate: 1.8 }); audio.sfx('powerup', { vol: 0.3, rate: 1.6 }); ring(s.x, s.z, s.col, 3.4, 0.35); }
      }
      // mijnenlegger
      if (first && s.mineT > 0 && s.mineCd <= 0) { s.mineCd = 1.15; dropMine(s); }
      // vliegtuig-effecten
      if (thr && first) {
        s.trail -= dt; if (s.trail <= 0) { s.trail = 0.03; const bx = s.x - fx_ * 2.2 * s.size, bz = s.z - fz_ * 2.2 * s.size; pe(bx, 0.3, bz, -fx_ * 5 + s.vx * 0.2 + rand(-1, 1), 0, -fz_ * 5 + s.vz * 0.2 + rand(-1, 1), { life: 0.6, size: 0.55 * s.size, color: Math.random() < 0.5 ? s.col : pick([0xffffff, 0xffe14a, 0xff9a4a]), gravity: 0 }); }
      }
    }
    function hyper(s) {
      stat.hyper++; s.cd = HYPER_CD; const ox = s.x, oz = s.z;
      let best = null, bs = -1;
      for (let k = 0; k < 14; k++) {
        const x = rand(-AX + 3, AX - 3), z = rand(-AZ + 2.5, AZ - 2.5); let sc = Math.min(Math.hypot(x, z) - 6, 8);
        const o = other(s); sc += Math.min(10, Math.hypot(wd(x - o.x, WX), wd(z - o.z, WZ)) - 6);
        for (const q of asts) sc -= Math.max(0, 5 - Math.hypot(wd(x - q.x, WX), wd(z - q.z, WZ)) + q.r) * 2;
        if (sc > bs) { bs = sc; best = [x, z]; }
      }
      s.x = best[0]; s.z = best[1]; s.vx *= 0.4; s.vz *= 0.4; s.warp = 0.55; s.inv = Math.max(s.inv, 0.7);
      ring(ox, oz, s.col, 4, 0.5); ring(s.x, s.z, 0xffffff, 4, 0.5); burst(ox, oz, [s.col, 0xffffff], 20, 7, 0.5, 0.6); burst(s.x, s.z, [s.col, 0xffffff, 0xffe14a], 26, 8, 0.5, 0.7);
      audio.sfx('sparkle', { vol: 0.8 }); audio.sfx('boing', { vol: 0.4, rate: 1.6 }); say('HYPER!', s.x, s.z - 2.2, '#ffffff', 1.2);
    }
    const holeR = () => lerp(1.35, 4.6, clamp(sdT / 30, 0, 1)) + (pulseT > 0 ? 0.3 : 0);

    // ---------------- hoofd-simulatie ----------------
    function stepWorld(dt, first) {
      // schepen
      for (const s of ships) updateShip(s, dt, first);
      // schip-schip botsing
      const A = ships[0], B = ships[1];
      if (A.alive && B.alive) {
        const dx = wd(B.x - A.x, WX), dz = wd(B.z - A.z, WZ), d = Math.hypot(dx, dz), mind = A.r + B.r;
        if (d < mind && d > 0.001) {
          const nx = dx / d, nz = dz / d, rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
          if (rel < 0) { const k = -(1 + 0.9) * rel * 0.5, wa = A.shield > 0 ? 0.6 : 1, wb = B.shield > 0 ? 0.6 : 1; A.vx -= nx * k * wa * 1.2; A.vz -= nz * k * wa * 1.2; B.vx += nx * k * wb * 1.2; B.vz += nz * k * wb * 1.2; audio.sfx('boing', { vol: 0.5, rate: 1.3 }); ctx.shake(0.12); burst((A.x + dx / 2), (A.z + dz / 2), [0xffffff, 0xffe14a], 10, 6, 0.4, 0.4); say('BONK!', A.x + dx / 2, A.z + dz / 2 - 1.5, '#ffffff', 0.9); }
          const push = (mind - d) / 2; A.x = wrapX(A.x - nx * push); A.z = wrapZ(A.z - nz * push); B.x = wrapX(B.x + nx * push); B.z = wrapZ(B.z + nz * push);
        }
      }
      // kogels
      for (const b of bullets) {
        b.age += dt; b.life -= dt;
        const r2 = b.x * b.x + b.z * b.z, r = Math.sqrt(r2) || 0.01, a = KG * 0.4 * GRAV * gMul / (r2 + 12);
        b.vx -= b.x / r * a * dt; b.vz -= b.z / r * a * dt;
        b.x = wrapX(b.x + b.vx * dt); b.z = wrapZ(b.z + b.vz * dt);
        if (b.life <= 0) { b.dead = true; continue; }
        if (r < (sd ? holeR() : STAR_R) + 0.2) { b.dead = true; stat.eaten++; pb(b.x, 0.5, b.z, { count: 4, speed: 3, up: 0, life: 0.3, size: 0.3, color: 0xffd24a, gravity: 0 }); continue; }
        for (const s of ships) {
          if (!s.alive || (s.i === b.owner && b.age < 0.35)) continue;
          const dx = wd(s.x - b.x, WX), dz = wd(s.z - b.z, WZ), rr = s.r + (s.shield > 0 ? 0.9 : 0.25);
          if (dx * dx + dz * dz < rr * rr) {
            if (s.shield > 0) {      // schild kaatst de kogel terug
              const d = Math.hypot(dx, dz) || 1, nx = -dx / d, nz = -dz / d, dot = b.vx * nx + b.vz * nz;
              b.vx -= 2 * dot * nx; b.vz -= 2 * dot * nz; b.owner = s.i; b.age = 0; b.life = BLIFE; stat.reflects++; audio.sfx('ding', { vol: 0.5, rate: 1.4 }); ring(b.x, b.z, s.col, 2.2, 0.25); say('KLINK!', b.x, b.z - 1.4, '#ffffff', 0.9);
            } else if (s.inv <= 0 && s.warp <= 0) { b.dead = true; hitShip(s, b.owner, b.owner === s.i ? 'eigen' : 'kogel'); }
            if (b.dead) break;
          }
        }
        if (b.dead) continue;
        for (const q of asts) { if (q.dead) continue; const dx = wd(q.x - b.x, WX), dz = wd(q.z - b.z, WZ); if (dx * dx + dz * dz < (q.r + 0.25) ** 2) { b.dead = true; breakAst(q, b.owner); break; } }
        if (b.dead) continue;
        if (cow.alive) { const dx = wd(cow.x - b.x, WX), dz = wd(cow.z - b.z, WZ); if (dx * dx + dz * dz < (cow.r + 0.25) ** 2) { b.dead = true; hitCow(b.owner); continue; } }
        for (const m of mines) { if (m.dead) continue; const dx = wd(m.x - b.x, WX), dz = wd(m.z - b.z, WZ); if (dx * dx + dz * dz < 1.0) { b.dead = true; killMine(m, true); break; } }
      }
      // raketten
      for (const m of missiles) {
        m.age += dt; m.life -= dt;
        const tg = ships[m.target];
        if (tg.alive) {
          const dx = wd(tg.x - m.x, WX), dz = wd(tg.z - m.z, WZ), want = Math.atan2(dx, -dz); let da = want - m.a; da = Math.atan2(Math.sin(da), Math.cos(da));
          m.a += clamp(da, -3.4 * dt, 3.4 * dt);
        }
        const sp = Math.min(23, 12 + m.age * 12), tvx = Math.sin(m.a) * sp, tvz = -Math.cos(m.a) * sp;
        m.vx = damp(m.vx, tvx, 5, dt); m.vz = damp(m.vz, tvz, 5, dt);
        const r2 = m.x * m.x + m.z * m.z, r = Math.sqrt(r2) || 0.01, a = KG * 0.3 * GRAV * gMul / (r2 + 12); m.vx -= m.x / r * a * dt; m.vz -= m.z / r * a * dt;
        m.x = wrapX(m.x + m.vx * dt); m.z = wrapZ(m.z + m.vz * dt);
        if (Math.random() < 0.8) pe(m.x - Math.sin(m.a) * 0.9, 0.3, m.z + Math.cos(m.a) * 0.9, rand(-1, 1), 0, rand(-1, 1), { life: 0.5, size: 0.45, color: pick([0xff7a1a, 0xffd070, 0xffffff]), gravity: 0 });
        if (m.life <= 0 || r < STAR_R) { m.dead = true; burst(m.x, m.z, [0xff7a1a, 0xffd070], 10, 5, 0.4, 0.4); continue; }
        for (const s of ships) {
          if (!s.alive || s.i === m.owner) continue;
          const dx = wd(s.x - m.x, WX), dz = wd(s.z - m.z, WZ), rr = s.r + (s.shield > 0 ? 0.9 : 0.5);
          if (dx * dx + dz * dz < rr * rr) {
            if (s.shield > 0) { m.owner = s.i; m.target = 1 - s.i; m.a += Math.PI; m.age = 0; m.life = 5; stat.reflects++; audio.sfx('ding', { vol: 0.6 }); ring(m.x, m.z, s.col, 2.6, 0.3); say('TERUG!', m.x, m.z - 1.5, '#ff9a9a', 1); }
            else if (s.inv <= 0 && s.warp <= 0) { m.dead = true; burst(m.x, m.z, [0xff7a1a, 0xffd070, 0xffffff], 24, 8, 0.6, 0.6); hitShip(s, m.owner, 'raket'); }
            break;
          }
        }
        if (m.dead) continue;
        for (const q of asts) { if (q.dead) continue; const dx = wd(q.x - m.x, WX), dz = wd(q.z - m.z, WZ); if (dx * dx + dz * dz < (q.r + 0.4) ** 2) { m.dead = true; breakAst(q, m.owner); burst(m.x, m.z, [0xff7a1a, 0xffd070], 14, 6, 0.5, 0.5); break; } }
      }
      // asteroiden
      for (const q of asts) {
        if (q.dead) continue;
        const r2 = q.x * q.x + q.z * q.z, r = Math.sqrt(r2) || 0.01, a = KG * 0.28 * GRAV * gMul / (r2 + 12);
        q.vx -= q.x / r * a * dt; q.vz -= q.z / r * a * dt;
        const v = Math.hypot(q.vx, q.vz); if (v > 11) { q.vx *= 11 / v; q.vz *= 11 / v; }
        q.x = wrapX(q.x + q.vx * dt); q.z = wrapZ(q.z + q.vz * dt); q.rot += q.spin * dt;
        if (r < (sd ? holeR() : STAR_R) + q.r * 0.5) { q.dead = true; stat.eaten++; burst(q.x, q.z, [0xffd24a, ASTCOL[q.col].getHex()], 10, 4, 0.4, 0.5); audio.sfx('pop', { vol: 0.25, rate: 0.7 }); burpT = 0.4; continue; }
        for (const s of ships) {
          if (!s.alive) continue;
          const dx = wd(s.x - q.x, WX), dz = wd(s.z - q.z, WZ), d = Math.hypot(dx, dz), mind = s.r * 0.85 + q.r * 0.85;
          if (d < mind) {
            if (s.shield > 0 || s.inv > 0 || s.warp > 0) {
              const nx = dx / (d || 1), nz = dz / (d || 1), rel = (s.vx - q.vx) * nx + (s.vz - q.vz) * nz;
              if (rel < 0) { s.vx -= 1.8 * rel * nx * 0.7; s.vz -= 1.8 * rel * nz * 0.7; q.vx += 1.8 * rel * nx * 0.4; q.vz += 1.8 * rel * nz * 0.4; audio.sfx('boing', { vol: 0.4, rate: 1.4 }); ring(s.x - dx / 2 * 0, s.z, s.col, 2.4, 0.25); }
              s.x = wrapX(s.x + nx * (mind - d)); s.z = wrapZ(s.z + nz * (mind - d));
            } else hitShip(s, 1 - s.i, 'rots');
          }
        }
      }
      // koe
      if (cow.alive) {
        cow.x = wrapX(cow.x + cow.vx * dt); cow.z = wrapZ(cow.z + cow.vz * dt); cow.spin += dt * 1.1;
        for (const s of ships) {
          if (!s.alive) continue;
          const dx = wd(s.x - cow.x, WX), dz = wd(s.z - cow.z, WZ), d = Math.hypot(dx, dz), mind = s.r + cow.r * 0.8;
          if (d < mind && d > 0.01) { const nx = dx / d, nz = dz / d, rel = (s.vx - cow.vx) * nx + (s.vz - cow.vz) * nz; if (rel < 0) { s.vx -= 1.9 * rel * nx; s.vz -= 1.9 * rel * nz; cow.vx += 0.6 * rel * nx; cow.vz += 0.6 * rel * nz; audio.sfx('boing', { vol: 0.5, rate: 0.8 }); say('MOE!', cow.x, cow.z - 2.4, '#ffffff', 1); ctx.shake(0.1); } s.x = wrapX(s.x + nx * (mind - d)); s.z = wrapZ(s.z + nz * (mind - d)); }
        }
      }
      // mijnen
      for (const m of mines) {
        if (m.dead) continue; m.t += dt; m.arm -= dt; m.life -= dt;
        const r2 = m.x * m.x + m.z * m.z, r = Math.sqrt(r2) || 0.01, a = KG * 0.25 * GRAV * gMul / (r2 + 12); m.vx -= m.x / r * a * dt; m.vz -= m.z / r * a * dt;
        m.vx *= Math.exp(-0.35 * dt); m.vz *= Math.exp(-0.35 * dt);
        m.x = wrapX(m.x + m.vx * dt); m.z = wrapZ(m.z + m.vz * dt);
        if (r < STAR_R + 0.4 || m.life <= 0) { killMine(m, false); burst(m.x, m.z, [0xd49aff], 8, 4, 0.4, 0.4); continue; }
        if (m.arm <= 0) for (const s of ships) { if (!s.alive || s.i === m.owner) continue; const dx = wd(s.x - m.x, WX), dz = wd(s.z - m.z, WZ); if (dx * dx + dz * dz < (1.7 + s.r) ** 2) { if (s.shield > 0) { killMine(m, false); burst(m.x, m.z, [0xd49aff, 0xffffff], 16, 6, 0.5, 0.5); ring(m.x, m.z, s.col, 3, 0.3); audio.sfx('ding', { vol: 0.6 }); } else killMine(m, true); break; } }
      }
      // komeet
      if (comet.warn > 0) { comet.warn -= dt; comet.strip.material.opacity = (Math.sin(T * 24) > 0 ? 0.32 : 0.12) * Math.min(1, comet.warn * 2 + 0.3); if (comet.warn <= 0) { comet.on = true; comet.x = comet.dir > 0 ? -AX - 5 : AX + 5; comet.vx = comet.dir * 44; comet.g.visible = true; comet.strip.visible = false; audio.sfx('whoosh', { vol: 0.9, rate: 0.6 }); ctx.shake(0.3); } }
      if (comet.on) {
        comet.x += comet.vx * dt; comet.g.position.set(comet.x, 0.4, comet.z); comet.g.rotation.y = comet.dir > 0 ? 0 : Math.PI; pe(comet.x - comet.dir * 1, 0.4, comet.z + rand(-0.8, 0.8), -comet.dir * rand(1, 4), 0, rand(-1, 1), { life: 0.7, size: 0.9, color: pick([0x7fd8ff, 0xffffff, 0xb8f0ff]), gravity: 0 });
        for (const s of ships) if (s.alive && Math.abs(s.x - comet.x) < s.r + 1.3 && Math.abs(s.z - comet.z) < s.r + 1.3) hitShip(s, 1 - s.i, 'komeet', true);
        if (Math.abs(comet.x) > AX + 8) { comet.on = false; comet.g.visible = false; }
      }
      // power-ups
      for (const p of pups) {
        p.t += dt; p.life -= dt; p.x = wrapX(p.x + p.vx * dt); p.z = wrapZ(p.z + p.vz * dt);
        for (const s of ships) { if (!s.alive || p.dead) continue; const dx = wd(s.x - p.x, WX), dz = wd(s.z - p.z, WZ); if (dx * dx + dz * dz < (s.r + 1.3) ** 2) { p.dead = true; givePower(s, p.type); } }
        if (p.life <= 0) p.dead = true;
      }
    }
    function hitCow(owner) {
      stat.cow++; cow.alive = false; cow.holder.visible = false; cow.respT = 22;
      burst(cow.x, cow.z, [0xffffff, 0x2b2b2b, 0xf0a8a8, 0x9fe8ff], 36, 9, 0.6, 1); ring(cow.x, cow.z, 0xffffff, 5, 0.5); audio.sfx('boing', { vol: 0.8, rate: 0.7 }); audio.sfx('sparkle', { vol: 0.5 });
      say('MOEEEE!', cow.x, cow.z - 2.5, '#ffffff', 1.8); hud.toast(`🐄 ${names[owner]} raakt de koe: cadeautjes!`, 2000);
      spawnPowerup(null, cow.x - 2, cow.z); spawnPowerup(null, cow.x + 2, cow.z);
    }

    // ---------------- weergave ----------------
    const D = new THREE.Object3D(), _c = new THREE.Color();
    function placeShip(s, dt) {
      if (!s.alive) return;
      const fx_ = Math.sin(s.a), fz_ = -Math.cos(s.a), yaw = Math.atan2(fx_, fz_);
      s.bank = damp(s.bank, -(s.bankT || 0) * 0.45, 8, dt);
      s.holder.position.set(s.x, 0.3, s.z); s.holder.rotation.y = yaw; s.body.rotation.z = s.bank;
      const flick = s.inv > 0 && s.warp <= 0 ? Math.sin(T * 36) > -0.25 : true;
      s.g.visible = flick && s.warp < 0.4;
      s.flame.visible = s.thrusting; if (s.thrusting) { const k = 0.8 + Math.random() * 0.45; s.flame.scale.set(k, k, k * (1 + Math.min(1, Math.hypot(s.vx, s.vz) / 20) * 0.3)); }
      // spookschepen bij de rand
      const m = s.r + 2.6, ox = s.x > AX - m ? -WX : s.x < -AX + m ? WX : 0, oz = s.z > AZ - m ? -WZ : s.z < -AZ + m ? WZ : 0;
      const offs = [[ox, 0], [0, oz], [ox, oz]];
      s.ghosts.forEach((o, k) => { const [a, b] = offs[k]; const on = (k === 0 && ox !== 0) || (k === 1 && oz !== 0) || (k === 2 && ox !== 0 && oz !== 0); o.gh.visible = on && s.g.visible; if (on) { o.gh.position.set(s.x + a, 0.3, s.z + b); o.gh.rotation.y = yaw; if (o.flame) { o.flame.visible = s.thrusting; o.flame.scale.copy(s.flame.scale); } } });
      // schild-bubbel + markering
      const sh = s.shield > 0 || s.gold > 0;
      s.bubble.visible = sh; if (sh) { const k = s.r * (1.9 + Math.sin(T * 14) * 0.06); s.bubble.position.set(s.x, 0.4, s.z); s.bubble.scale.set(k, k * 0.5, k); s.bubble.material.opacity = (s.shield > 0 ? 0.3 : 0.22) * (s.shield > 0 && s.shield < 0.35 ? (Math.sin(T * 40) > 0 ? 1 : 0.3) : 1); s.bubble.material.color.set(s.gold > 0 && s.shield <= 0 ? 0xffd23f : s.col); }
      s.mark.position.set(s.x, -0.1, s.z); s.mark.scale.setScalar(s.size);
      s.c.update(dt);
    }
    function drawPools(dt) {
      // kogels
      for (let i = 0; i < 2; i++) { let n = 0; const { core, glow } = bulletIM[i]; for (const b of bullets) { if (b.owner !== i || n >= BN) continue; const rot = Math.atan2(b.vx, b.vz); D.position.set(b.x, 0.4, b.z); D.rotation.set(0, rot, 0); D.scale.set(0.2, 0.2, 0.85); D.updateMatrix(); core.setMatrixAt(n, D.matrix); D.scale.set(0.5, 0.4, 1.7); D.updateMatrix(); glow.setMatrixAt(n, D.matrix); n++; } core.count = glow.count = n; core.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true; }
      // asteroiden (met wrap-spoken)
      let n = 0;
      for (const q of asts) {
        const m = q.r + 0.4, ox = q.x > AX - m ? -WX : q.x < -AX + m ? WX : 0, oz = q.z > AZ - m ? -WZ : q.z < -AZ + m ? WZ : 0;
        for (let k = 0; k < 4; k++) {
          const a = k === 1 || k === 3 ? ox : 0, b = k === 2 || k === 3 ? oz : 0; if (k && ((k === 1 && !ox) || (k === 2 && !oz) || (k === 3 && !(ox && oz)))) continue;
          if (n >= AN) break; D.position.set(q.x + a, 0.2, q.z + b); D.rotation.set(q.tilt, q.rot, 0); D.scale.setScalar(q.r); D.updateMatrix(); astIM.setMatrixAt(n, D.matrix); astIM.setColorAt(n, ASTCOL[q.col]); n++;
        }
      }
      astIM.count = n; astIM.instanceMatrix.needsUpdate = true; if (astIM.instanceColor) astIM.instanceColor.needsUpdate = true;
      // raketten / mijnen / power-ups
      for (const m of missiles) { m.g.position.set(m.x, 0.4, m.z); m.g.rotation.y = Math.atan2(Math.sin(m.a), -Math.cos(m.a)); }
      for (const m of mines) { m.g.position.set(m.x, 0.3, m.z); m.g.rotation.y += dt * 1.5; const ud = m.g.userData; const armed = m.arm <= 0; ud.lamp.material.opacity = armed ? 0.3 + Math.sin(m.t * 8) * 0.3 : 0; ud.body.material.emissiveIntensity = armed ? 0.5 + Math.sin(m.t * 8) * 0.3 : 0.15; }
      for (const p of pups) { p.g.position.set(p.x, 0.4 + Math.sin(p.t * 3) * 0.15, p.z); p.g.children[0].rotation.z = p.t * 1.2; const k = 1 + Math.sin(p.t * 5) * 0.08; p.g.scale.setScalar(p.life < 3 ? (Math.sin(T * 20) > 0 ? 1 : 0.4) : k); p.g.userData.rg.rotation.z = -p.t * 2; }
      // ringen
      for (const r of rings) if (r.m.visible) { r.t += dt; const k = r.t / r.life; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(0.5 + r.max * k); r.m.material.opacity = (1 - k) * 0.85; }
      // koe + ammo-bolletjes
      if (cow.alive) { cow.holder.position.set(cow.x, 0.3, cow.z); cow.holder.rotation.y = cow.spin; cow.holder.rotation.x = Math.sin(cow.spin * 1.7) * 0.15; cow.animal.update(dt); cow.animal.group.rotation.y = 0; }
      let pn = 0;
      for (const s of ships) {
        if (!s.alive) { for (let k = 0; k < AMMO; k++) { D.position.set(0, -50, 0); D.scale.setScalar(0.001); D.updateMatrix(); pips.setMatrixAt(pn++, D.matrix); } continue; }
        for (let k = 0; k < AMMO; k++) { const fill = clamp(s.ammo - k, 0, 1); D.position.set(wrapX(s.x + (k - (AMMO - 1) / 2) * 0.62), 0.35, wrapZ(s.z + 2.5 * s.size + 0.3)); D.rotation.set(0, 0, 0); D.scale.setScalar(0.3 + fill * 0.7); D.updateMatrix(); pips.setMatrixAt(pn, D.matrix); _c.set(fill >= 1 ? 0xffffff : fill > 0 ? 0xffe14a : 0x445066); pips.setColorAt(pn, _c); pn++; }
      }
      pips.instanceMatrix.needsUpdate = true; if (pips.instanceColor) pips.instanceColor.needsUpdate = true;
    }
    function cleanup() {
      for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
      for (let i = asts.length - 1; i >= 0; i--) if (asts[i].dead) asts.splice(i, 1);
      for (let i = missiles.length - 1; i >= 0; i--) if (missiles[i].dead) { missiles[i].g.visible = false; missiles.splice(i, 1); }
      for (let i = mines.length - 1; i >= 0; i--) if (mines[i].dead) { mines[i].g.visible = false; mines.splice(i, 1); }
      for (let i = pups.length - 1; i >= 0; i--) if (pups[i].dead) { scene.remove(pups[i].g); pups[i].g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); pups.splice(i, 1); }
    }
    function updateStar(dt) {
      const near = nearestShipToStar();
      let k = 0, r = 1.35;
      if (sd) { k = clamp(sdT / 6, 0, 1); r = holeR(); }
      W.setHole(k, r);
      if (!sd) { const oh = pulseT > 0 || burpT > 0; if (oh && W.starMood !== 'oh') W.setMood('oh'); else if (!oh && W.starMood !== 'happy') W.setMood('happy'); }
      W.update(T, dt, near);
    }

    // ---------------- update ----------------
    function update(dt) {
      T += dt;
      if (finished) { resultUpdate(dt); return; }
      if (!started) { started = true; refreshHud(); }
      if (stop > 0) { stop -= dt; drawPools(0); return; }
      if (slowHold > 0) slowHold -= dt; else slowK = damp(slowK, 1, 5, dt);
      const sdt = dt * slowK;
      if (over) { endT -= dt; if (endT <= 0) finishMatch(); }
      // klok
      if (!over) {
        if (!sd) {
          clock -= sdt; hud.setTimer(Math.max(0, clock), 15);
          gMul = 1 + clamp((30 - clock) / 30, 0, 1) * 0.45;
          if (clock <= 0) { clock = 0; audio.sfx('bell', { vol: 1 }); timeUp(); }
        } else {
          sdT += sdt; gMul = 1 + clamp(sdT / 30, 0, 1) * 3;
          if (sdT >= SD_MAX) { const a = ships[0], b = ships[1]; const da = a.alive ? Math.hypot(a.x, a.z) : -1, db = b.alive ? Math.hypot(b.x, b.z) : -1; endMatch(da >= db ? 0 : 1, 'Sudden death: wie het verst van het zwarte gat zat, wint.'); }
        }
        burpT -= sdt; if (pulseT > 0) { pulseT -= sdt; gMul *= 1 + 1.4 * clamp(pulseT, 0, 1); }
        eventT -= sdt; if (eventT <= 0 && !comet.on && comet.warn <= 0) nextEvent();
        rockT -= sdt; if (rockT <= 0) { rockT = rand(3.5, 6); const w = asts.reduce((a, q) => a + q.size, 0); if (w < 9) spawnEdgeRock(); }
        puT -= sdt; if (puT <= 0) { puT = rand(8, 12); if (pups.length < 2) spawnPowerup(); }
        if (!cow.alive) { cow.respT -= sdt; }
      }
      const steps = Math.max(1, Math.ceil(sdt / 0.016)), h = sdt / steps;
      for (let s = 0; s < steps; s++) stepWorld(h, s === 0);
      cleanup(); updateStar(dt);
      for (const s of ships) placeShip(s, dt);
      drawPools(dt);
      hudT -= dt; if (hudT <= 0) { hudT = 0.1; updateHudInfo(); }
          }
    function resultUpdate(dt) { T += dt; for (const s of ships) { if (s.alive) { s.c.update(dt); placeShip(s, dt); } } updateStar(dt); drawPools(dt); for (const r of rings) if (r.m.visible) { r.t += dt; } }
    function introUpdate(dt) {
      T += dt;
      for (const s of ships) { s.holder.position.set(s.x, 0.3 + Math.sin(T * 2 + s.i) * 0.12, s.z); s.holder.rotation.y = Math.atan2(Math.sin(s.a), -Math.cos(s.a)); s.c.update(dt); s.mark.position.set(s.x, -0.1, s.z); s.mark.visible = true; }
      updateStar(dt); drawPools(dt);
    }
    // eerste beeld
    for (const s of ships) { s.holder.position.set(s.x, 0.3, s.z); s.holder.rotation.y = Math.atan2(Math.sin(s.a), -Math.cos(s.a)); s.mark.position.set(s.x, -0.1, s.z); }
    for (let k = 0; k < 4; k++) { const a = rand(0, TAU), r = rand(8, 20), v = rand(2.5, 4); spawnAst(3, Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.8, -Math.sin(a) * v, Math.cos(a) * v); }
    asts.forEach((q) => { q.x = clamp(q.x, -AX + 3, AX - 3); q.z = clamp(q.z, -AZ + 2, AZ - 2); if (Math.abs(q.x - ships[0].x) < 6 && Math.abs(q.z) < 6) q.x += 9; if (Math.abs(q.x - ships[1].x) < 6 && Math.abs(q.z) < 6) q.x -= 9; });
    drawPools(0); updateStar(0.016); refreshHud();

    return {
      update, introUpdate, resultUpdate,
      onResize() { fitCamera(); },
      onSwap() { for (const s of ships) burst(s.x, s.z, [0xffe14a, 0xffffff], 16, 5, 0.4, 0.5); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && score[i] > 0) { score[i]--; refreshHud(); say('BEWOOG! -1', ships[i].x, ships[i].z - 2.2, '#ff6b6b', 1.5); } else if (m) say('BEWOOG!', ships[i].x, ships[i].z - 2.2, '#ff6b6b', 1.4); }); },
      celebrate(w) { ships[w].c.pose = 'cheer'; ships[1 - w].c.pose = 'sad'; },
      dispose() {},
      dbg: {
        ships, bullets, asts, missiles, mines, pups, cow, comet,
        state: () => ({ T, clock, sd, sdT, over, finished, winner, score: [...score], gMul, stats: stat, started,
          ships: ships.map((s) => ({ x: s.x, z: s.z, vx: s.vx, vz: s.vz, a: s.a, alive: s.alive, ammo: s.ammo, shield: s.shield, cd: s.cd, inv: s.inv, triple: s.triple, missiles: s.missiles, mineT: s.mineT, gold: s.gold, warp: s.warp, r: s.r })),
          n: { bullets: bullets.length, asts: asts.length, missiles: missiles.length, mines: mines.length, pups: pups.length }, pups: pups.map((p) => ({ type: p.type, x: p.x, z: p.z })), cow: { alive: cow.alive, x: cow.x, z: cow.z }, comet: { on: comet.on, warn: comet.warn }, rocks: asts.map((q) => ({ x: q.x, z: q.z, r: q.r })) }),
        setTime(s) { clock = s; }, setScore(a, b) { score[0] = a; score[1] = b; refreshHud(); }, startSD, nextEvent, startComet, spawnCow, spawnPowerup, givePower: (i, t) => givePower(ships[i], t), hitShip: (i, k, w) => hitShip(ships[i], k, w, true),
        setPos(i, x, z, vx = 0, vz = 0) { ships[i].x = x; ships[i].z = z; ships[i].vx = vx; ships[i].vz = vz; }, setEventT(t) { eventT = t; },
      },
    };
  },
};

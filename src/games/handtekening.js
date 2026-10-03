import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, glow } from '../engine/util.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import { buildPlaza, AR, OBS } from './handtekening_world.js';

// Handtekening-Jacht — duel: kermisplein (top-down). Verzamel zwevende handtekening-blaadjes, meeste na 80 s wint.
//  * A = sprint (stamina), B = gooi een serpentine-banaan (laat de ander uitglijden en blaadjes verliezen)
//  * De Deurman wandelt rond; als hij toetert (1,5 s) en dan KIJKT moet iedereen STIL STAAN: wie beweegt verliest blaadjes aan de ander
//  * power-ups: pen (x2), magneet, onzichtbaarheidsmantel; af en toe tekent de Deurman een superster (+10)
//  * comeback: wie achterstaat: Deurman kijkt vaker bij de leider (die extra verliest), power-ups/sterren vallen dichterbij, snellere stamina; laatste 12 s dubbele punten
//  * gelijk na 80 s: sudden death met één gouden blaadje

const MATCH_TIME = 80, SD_MAX = 20;
const BASE_SPEED = 8.2, SPRINT = 1.65;
const LOOK_FIRST = 9;
const PW = { pen: { name: 'PEN', col: '#ffd23f', hex: 0xffd23f, dur: 9 }, magnet: { name: 'MAGNEET', col: '#ff6a8a', hex: 0xff4a6a, dur: 8 }, cloak: { name: 'MANTEL', col: '#c58aff', hex: 0xa870ff, dur: 6.5 } };

function paperTex(gold) {
  return canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = gold ? '#ffe27a' : '#fffaf0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = gold ? '#c08a10' : '#9aa0b8'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = gold ? 'rgba(255,255,255,.55)' : 'rgba(150,160,200,.35)'; for (let k = 0; k < 4; k++) g.fillRect(14, 20 + k * 11, w - 28, 3);
    // handtekening-krabbel
    g.strokeStyle = gold ? '#8a4a00' : '#2a40c8'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(16, 112);
    g.bezierCurveTo(30, 60, 44, 150, 58, 92); g.bezierCurveTo(68, 62, 78, 140, 92, 100); g.bezierCurveTo(100, 84, 108, 96, 114, 84); g.stroke();
    // sterretje
    g.fillStyle = gold ? '#ff7a10' : '#ff5a8a'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 7 : 17; g.lineTo(100 + Math.cos(a) * rr, 134 + Math.sin(a) * rr); } g.closePath(); g.fill();
  });
}
function starGeo() {
  const s = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 0.5 : 1.0; (k ? s.lineTo : s.moveTo).call(s, Math.cos(a) * rr, Math.sin(a) * rr); } s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 1 });
}
function bananaMesh() {
  const g = new THREE.Group(); const yel = new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.5, emissive: 0x6a5000, emissiveIntensity: 0.4 });
  g.add(mesh(new THREE.TorusGeometry(0.42, 0.13, 6, 10, Math.PI * 0.85), yel, { cast: false, rot: [0, 0, Math.PI * 0.08] }));
  g.add(mesh(new THREE.SphereGeometry(0.09, 5, 4), mat(0x5a3a10), { cast: false, pos: [-0.38, 0.1, 0] }));
  return g;
}
function peelMesh() {
  const g = new THREE.Group(); const yel = new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.5, emissive: 0x6a5000, emissiveIntensity: 0.5 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; g.add(mesh(new THREE.ConeGeometry(0.2, 0.75, 5), yel, { cast: false, pos: [Math.cos(a) * 0.38, 0.12, Math.sin(a) * 0.38], rot: [Math.sin(a) * 1.35, 0, -Math.cos(a) * 1.35] })); }
  g.add(mesh(new THREE.SphereGeometry(0.2, 7, 5), yel, { cast: false, pos: [0, 0.14, 0], scale: [1, 0.5, 1] }));
  return g;
}

export default {
  id: 'handtekening',
  name: 'Handtekening-Jacht',
  giver: 'De Deurman',
  icon: '✍️',
  mode: 'pvp',
  time: 80,
  music: 'game_fast',
  blurb: 'Op de kermis vliegen <b>handtekening-blaadjes</b> rond! Verzamel er zoveel mogelijk. Toetert de <b>Deurman</b> en kijkt hij? Dan <b>STIL STAAN</b>: wie beweegt, verliest blaadjes aan de ander. Gooi bananen, pak power-ups en jaag op de <b>superster</b> (+10)!',
  controls: ['{move} rennen', '{a} sprint · {b} gooi banaan'],
  tip: 'Toeter = STOP! De Deurman kijkt vaker naar de leider. Wie achterstaat krijgt vaker power-ups.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;

    const L = ctx.lights('day', { shadow: 26, center: [0, 0, 0], fogNear: 90, fogFar: 220 });
    L.hemi.intensity = 1.25; L.sun.intensity = 2.0; L.sun.position.set(-14, 34, 16);
    camera.fov = 46; camera.updateProjectionMatrix();
    const A = buildPlaza(ctx);
    const YEL = new THREE.Color(0xfff0a0); const hemiCol = L.hemi.color.clone(), hemiI = L.hemi.intensity, sunI = L.sun.intensity;

    // ------------------------------------------------------------------ spelers
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const sz = pv.size(i); const bs = 2.7 / c.height * sz;
      c.group.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.material = o.material.clone(); });   // eigen materialen (voor de onzichtbaarheidsmantel)
      const g = new THREE.Group(); g.add(c.group); g.scale.setScalar(bs); const x0 = i ? 12 : -12; g.position.set(x0, 0, 0); scene.add(g);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 28), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; scene.add(ring);
      const tagTex = canvasTex(256, 96, (cc, w, hh) => { cc.font = 'bold 58px Fredoka, Arial Black, sans-serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.lineWidth = 12; cc.strokeStyle = 'rgba(10,10,30,.9)'; cc.lineJoin = 'round'; cc.strokeText(pp.name, w / 2, hh / 2); cc.fillStyle = pp.css; cc.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.6, 0.97, 1); tag.renderOrder = 15; scene.add(tag);
      const mkBar = (col) => { const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x120a28, transparent: true, opacity: 0.75, depthTest: false })); bg.scale.set(2.0, 0.22, 1); bg.renderOrder = 15; const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: col, transparent: true, depthTest: false })); fg.renderOrder = 16; scene.add(bg, fg); return { bg, fg }; };
      const bars = { st: mkBar(0x6fe87a), cd: mkBar(0xffd23f) };
      const excl = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (cc) => { cc.fillStyle = '#ff4a4a'; cc.beginPath(); cc.arc(32, 32, 28, 0, TAU); cc.fill(); cc.fillStyle = '#fff'; cc.font = 'bold 44px Arial Black, sans-serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.fillText('!', 32, 35); }), transparent: true, depthTest: false })); excl.scale.set(1.2, 1.2, 1); excl.visible = false; excl.renderOrder = 17; scene.add(excl);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04; scene.add(shadow);
      // pen / magneet als zwevend voorwerp
      const penM = new THREE.Group(); penM.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), mat(0xffd23f, { metalness: 0.5 }), { cast: false }), mesh(new THREE.ConeGeometry(0.07, 0.22, 6), mat(0x222222), { cast: false, pos: [0, -0.6, 0] })); penM.visible = false; scene.add(penM);
      const magM = new THREE.Group(); magM.add(mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 12, Math.PI), mat(0xe8302a, { flatShading: false }), { cast: false }), mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), mat(0xdddddd), { cast: false, pos: [-0.34, -0.05, 0] }), mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), mat(0xdddddd), { cast: false, pos: [0.34, -0.05, 0] })); magM.visible = false; scene.add(magM);
      const field = new THREE.Mesh(new THREE.RingGeometry(7.6, 8.0, 40), new THREE.MeshBasicMaterial({ color: 0xff6a8a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })); field.rotation.x = -Math.PI / 2; field.position.y = 0.07; field.visible = false; scene.add(field);
      return { i, c, g, bs, sz, r: 0.95 * sz, ring, tag, bars, excl, shadow, penM, magM, field, x: x0, z: 0, vx: 0, vz: 0, fx: i ? -1 : 1, fz: 0, stamina: 1, tired: false, sprint: false, regenT: 0, cd: 0, stun: 0, immune: 0, spin: 0, slideX: 0, slideZ: 0, pts: 0, pen: 0, magnet: 0, cloak: 0, caught: false, moveT: 0, pose: 'idle', moodT: 0, chain: 0, chainT: 0, info: '', hop: 0 };
    });
    pl.forEach((p) => { p.g.rotation.y = p.i ? -Math.PI / 2 : Math.PI / 2; p.c.targetYaw = 0; });

    // ------------------------------------------------------------------ Deurman
    const D = makeDeurman(2.0); const Dg = new THREE.Group(); Dg.add(D.group); scene.add(Dg);
    D.eyeGlow.forEach((e) => { e.material.color.set(0xffe14a); e.visible = false; });
    const Dring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 32), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); Dring.rotation.x = -Math.PI / 2; Dring.position.y = 0.07; Dring.visible = false; scene.add(Dring);
    const Dshadow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false })); Dshadow.rotation.x = -Math.PI / 2; Dshadow.position.y = 0.04; scene.add(Dshadow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1.3, 1, 14, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.visible = false; scene.add(beam);
    const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (cc) => { cc.fillStyle = '#ffd23f'; cc.strokeStyle = '#7a4a00'; cc.lineWidth = 8; cc.beginPath(); cc.arc(64, 64, 54, 0, TAU); cc.fill(); cc.stroke(); cc.fillStyle = '#7a1a00'; cc.font = 'bold 92px Arial Black, sans-serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.fillText('!', 64, 70); }), transparent: true, depthTest: false })); bang.scale.set(2.4, 2.4, 1); bang.visible = false; bang.renderOrder = 18; scene.add(bang);
    // ellips-route rond de draaimolen (ver van alle obstakels)
    const WP = Array.from({ length: 12 }, (_, k) => ({ x: Math.cos(k / 12 * TAU) * 11.5, z: Math.sin(k / 12 * TAU) * 6.2 }));
    const Dm = { x: 0, z: -6.2, wp: 4, dir: 1, mode: 'walk', t: 0, nextLook: LOOK_FIRST, lookT: 2.1, target: 0, yaw: 0, hornN: 0, looks: 0, lookDone: 0 };

    // ------------------------------------------------------------------ blaadjes (instanced)
    const PAPER_N = 56;
    const pgeo = new THREE.PlaneGeometry(1.6, 2.0).rotateX(-Math.PI / 2);
    const papI = new THREE.InstancedMesh(pgeo, new THREE.MeshBasicMaterial({ map: paperTex(false), side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 }), PAPER_N);
    const goldI = new THREE.InstancedMesh(pgeo, new THREE.MeshBasicMaterial({ map: paperTex(true), side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 }), 20);
    papI.frustumCulled = goldI.frustumCulled = false; papI.count = goldI.count = 0; scene.add(papI, goldI);
    const papers = Array.from({ length: PAPER_N + 20 }, () => ({ on: false }));
    const glowSpr = (col) => new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (cc) => { const gr = cc.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cc.fillStyle = gr; cc.fillRect(0, 0, 64, 64); }), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fliers = [];   // verzameld voor sparkles (niet gebruikt voor logica)
    const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E4 = new THREE.Euler(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3();

    // ------------------------------------------------------------------ toestand
    const G = { state: 'init', t: 0, clock: MATCH_TIME, sd: false, sdLeft: SD_MAX, sdLeaf: null, spawnT: 0.2, starT: 17, pwT: 7, winner: -1, why: '', end: false, final: false, nearEnd: false, starPlanned62: false };
    const stats = { caught: [0, 0], slips: [0, 0], stars: [0, 0], pw: [0, 0], stolen: [0, 0], hits: [0, 0], looks: 0, papers: [0, 0] };
    let T = 0, introT = 0, started = false, finished = false;
    const star = { on: false, ph: 'off', t: 0, x: 0, z: 0, mesh: null, mark: null };
    star.mesh = new THREE.Mesh(starGeo().rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xff9a10, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.35 })); star.mesh.scale.setScalar(2.6); star.mesh.visible = false; star.mesh.castShadow = true; scene.add(star.mesh);
    star.glow = glowSpr(0xffd23f); star.glow.scale.set(9, 9, 1); star.glow.visible = false; scene.add(star.glow);
    star.mark = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); star.mark.rotation.x = -Math.PI / 2; star.mark.position.y = 0.08; star.mark.visible = false; scene.add(star.mark);
    const box = { on: false, x: 0, z: 0, type: 'pen', life: 0, t: 0, g: new THREE.Group(), label: null };
    {
      box.g.add(mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), new THREE.MeshStandardMaterial({ color: 0xff5ab4, emissive: 0x802050, emissiveIntensity: 0.6, roughness: 0.4 }), { pos: [0, 0.9, 0] }));
      box.g.add(mesh(new THREE.BoxGeometry(1.36, 0.22, 1.36), mat(0xffe14a), { cast: false, pos: [0, 0.9, 0] }), mesh(new THREE.BoxGeometry(0.22, 1.36, 1.36), mat(0xffe14a), { cast: false, pos: [0, 0.9, 0] }));
      box.g.add(mesh(new THREE.TorusGeometry(0.3, 0.1, 5, 10), mat(0xffe14a), { cast: false, pos: [0, 1.75, 0] }));
      box.glow = glowSpr(0xff8ad0); box.glow.scale.set(5, 5, 1); box.glow.position.y = 1.0; box.g.add(box.glow);
      box.g.visible = false; scene.add(box.g);
      box.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); box.label.scale.set(3.2, 1.2, 1); box.label.renderOrder = 15; box.label.visible = false; scene.add(box.label);
    }
    const bananas = Array.from({ length: 4 }, () => { const m = bananaMesh(); m.visible = false; scene.add(m); return { on: false, m, sx: 0, sz: 0, tx: 0, tz: 0, t: 0, dur: 0.5, owner: 0 }; });
    const peels = Array.from({ length: 8 }, () => { const m = peelMesh(); m.visible = false; scene.add(m); return { on: false, m, x: 0, z: 0, life: 0, owner: 0, grace: 0 }; });
    const lead = () => (pl[0].pts === pl[1].pts ? -1 : pl[0].pts > pl[1].pts ? 0 : 1);
    const gap = () => Math.abs(pl[0].pts - pl[1].pts);
    const trailI = () => { const l = lead(); return l < 0 ? -1 : 1 - l; };
    const mult = (p) => (p.pen > 0 ? 2 : 1) * (G.final ? 2 : 1);

    function refreshHud() {
      hud.setScore(`${names[0]} ${pl[0].pts} – ${pl[1].pts} ${names[1]}${G.sd ? '  (GOUDEN BLAADJE!)' : ''}`);
      for (const p of pl) {
        const fxs = [p.pen > 0 ? `PEN ${Math.ceil(p.pen)}s` : '', p.magnet > 0 ? `MAGNEET ${Math.ceil(p.magnet)}s` : '', p.cloak > 0 ? `MANTEL ${Math.ceil(p.cloak)}s` : ''].filter(Boolean).join(' ');
        const t = `${p.pts} blaadjes${fxs ? ' · ' + fxs : ''}`; if (t !== p.info) { p.info = t; hud.setPlayerInfo(p.i, t); }
      }
    }

    // ------------------------------------------------------------------ blaadjes
    function freeSpot(minD = 2.5) {
      for (let k = 0; k < 30; k++) { const x = rand(-AR.X + 1.5, AR.X - 1.5), z = rand(-AR.Z + 1.2, AR.Z - 1.2); if (OBS.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 1.4) && pl.every((p) => Math.hypot(p.x - x, p.z - z) > minD)) return [x, z]; }
      return [0, 7];
    }
    function addPaper(x, z, kind = 'p', o = {}) {
      const q = papers.find((p) => !p.on); if (!q) return null;
      Object.assign(q, { on: true, x, z, kind, val: kind === 'g' ? 3 : 1, ang: rand(0, TAU), sp: rand(1.3, 2.6), ph: rand(0, TAU), age: 0, life: 15 + rand(0, 4), homing: -1, delay: 0, kx: 0, kz: 0, h: 0, ...o });
      return q;
    }
    function spawnPair() {
      const live = papers.filter((p) => p.on && p.homing < 0).length; if (live > 26) return;
      const [x, z] = freeSpot(3); const kind = Math.random() < 0.13 ? 'g' : 'p'; const ang = rand(0, TAU), sp = rand(1.3, 2.6);
      addPaper(x, z, kind, { ang, sp }); addPaper(-x, z, kind, { ang: Math.PI - ang, sp });     // gespiegeld: eerlijk!
      fx.particles.burst(x, 1, z, { count: 6, speed: 2, up: 1, life: 0.5, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 2 }); fx.particles.burst(-x, 1, z, { count: 6, speed: 2, up: 1, life: 0.5, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 2 });
    }
    function collect(p, q) {
      q.on = false;
      if (q.homing >= 0) { p.pts += 1; stats.stolen[p.i]++; fx.texts.add('+1', p.x, 3.2, p.z, '#ffffff', 0.7); audio.sfx('coin', { vol: 0.4, rate: 1.3 }); refreshHud(); return; }
      const v = q.val * mult(p); p.pts += v; stats.papers[p.i] += v;
      p.chain = p.chainT > 0 ? p.chain + 1 : 0; p.chainT = 0.7;
      audio.sfx(q.kind === 'g' ? 'powerup' : 'coin', { vol: 0.5, rate: 1 + Math.min(p.chain, 6) * 0.07 });
      fx.texts.add(`+${v}`, q.x, 2.8, q.z, q.kind === 'g' ? '#ffd23f' : p.i ? '#8fb8ff' : '#7dffb0', q.kind === 'g' ? 1.2 : 0.85);
      fx.particles.burst(q.x, 1.2, q.z, { count: q.kind === 'g' ? 22 : 10, speed: 4, up: 1.2, life: 0.6, size: 0.35, colors: q.kind === 'g' ? [0xffd23f, 0xffffff, 0xff9a10] : [0xffffff, p.i ? 0x8fb8ff : 0x7dffb0], gravity: 5 });
      p.moodT = 0.4; p.pose = 'cheer'; refreshHud();
    }
    function sendPapers(from, n) {   // blaadjes vliegen van `from` naar de ander
      const to = 1 - from; n = Math.min(n, pl[from].pts); if (n <= 0) return 0;
      pl[from].pts -= n; stats.stolen[from] += 0;
      for (let k = 0; k < n; k++) addPaper(pl[from].x + rand(-0.4, 0.4), pl[from].z + rand(-0.4, 0.4), 'p', { homing: to, delay: 0.15 + k * 0.07, sp: 0, h: 2.2 + k * 0.1, life: 9 });
      refreshHud(); return n;
    }

    // ------------------------------------------------------------------ Deurman: wandelen, toeteren, kijken
    function startWarn() {
      Dm.mode = 'warn'; Dm.t = 0; Dm.hornN = 0; Dm.looks++; stats.looks++;
      const l = lead(); Dm.target = l >= 0 ? l : (Math.hypot(pl[0].x - Dm.x, pl[0].z - Dm.z) < Math.hypot(pl[1].x - Dm.x, pl[1].z - Dm.z) ? 0 : 1);
      hud.showBig('STIL STAAN!', 1500, '#ffe14a'); hud.setHint('👀 De Deurman toetert! Straks kijkt hij: <b>NIET BEWEGEN!</b>');
      audio.sfx('creak', { vol: 0.2 });
    }
    function horn() { audio.tone(196, 0.32, { type: 'sawtooth', vol: 0.16, filter: 1100, slide: 240 }); audio.tone(262, 0.32, { type: 'square', vol: 0.09, filter: 1500, slide: 300 }); fx.particles.ring(Dm.x, 5.5, Dm.z, { count: 16, speed: 4, color: 0xffe14a, size: 0.4, life: 0.6 }); }
    function startLook() {
      Dm.mode = 'look'; Dm.t = 0; Dm.lookT = rand(1.9, 2.5);
      for (const p of pl) { p.caught = false; p.moveT = 0; }
      hud.setHint('👀 <b>NIET BEWEGEN!</b>'); hud.showBig('👀', 700, '#ffe14a'); audio.sfx('bell', { vol: 0.5, rate: 1.4 }); audio.tone(660, 0.25, { type: 'square', vol: 0.1, filter: 1800 });
    }
    function endLook() {
      Dm.mode = 'cool'; Dm.t = 0; Dm.lookDone++;
      const gp = gap(); Dm.nextLook = rand(9, 12) * (gp >= 10 ? 0.55 : gp >= 5 ? 0.7 : 1);
      hud.setHint(null); hud.showBig('VRIJ!', 700, '#8dff9a'); audio.sfx('good', { vol: 0.5 });
      if (pl.every((p) => !p.caught)) { fx.texts.add('Niemand bewoog!', Dm.x, 7, Dm.z, '#9fffb0', 1.3); audio.sfx('win', { vol: 0.3 }); A.cheer(1.5); } else A.cheer(1.2);
    }
    function caught(p, again) {
      const lead_ = p.i === Dm.target ? 1 : 0;
      const n = Math.min(p.pts, again ? 1 : clamp(Math.ceil(p.pts * 0.2), 2, 6) + lead_);
      p.caught = true; stats.caught[p.i]++; p.moodT = 1.0; p.pose = 'sad';
      fx.texts.add(n > 0 ? `BEWOGEN! -${n}` : 'BEWOGEN!', p.x, 4.4, p.z, '#ff6a5a', 1.4);
      audio.sfx('buzz', { vol: 0.4 }); audio.sfx('miss', { vol: 0.5 }); ctx.shake(0.3);
      sendPapers(p.i, n);
    }

    // ------------------------------------------------------------------ superster, power-ups
    function planStar() {
      const t = trailI(); let x, z;
      if (t >= 0 && Math.random() < 0.6) { const p = pl[t]; for (let k = 0; k < 20; k++) { x = p.x + rand(-7, 7); z = p.z + rand(-5, 5); if (Math.abs(x) < AR.X - 2.5 && Math.abs(z) < AR.Z - 2 && OBS.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 2.2)) break; x = null; } }
      if (x == null) { const f = freeSpot(2); x = f[0]; z = f[1]; }
      Object.assign(star, { on: true, ph: 'warn', t: 0, x, z });
      star.mark.visible = true; star.mark.position.set(x, 0.08, z);
      Dm.mode = 'sign'; Dm.t = 0;
      hud.toast('⭐ De Deurman tekent een SUPER-handtekening!', 2200); audio.sfx('sparkle', { vol: 0.6 }); audio.tone(880, 0.4, { type: 'triangle', vol: 0.12, slide: 1760 });
    }
    function spawnBox(near) {
      const type = pick(['pen', 'magnet', 'cloak', 'pen', 'magnet']); let x, z;
      if (near >= 0) { for (let k = 0; k < 20; k++) { x = pl[near].x + rand(-6, 6); z = pl[near].z + rand(-4, 4); if (Math.abs(x) < AR.X - 2 && Math.abs(z) < AR.Z - 2 && OBS.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 1.8)) break; x = null; } }
      if (x == null) { const f = freeSpot(3); x = f[0]; z = f[1]; }
      Object.assign(box, { on: true, x, z, type, life: 14, t: 0 });
      const d = PW[type]; box.g.visible = true; box.g.position.set(x, 0, z); box.glow.material.color.set(d.hex);
      box.label.material.map = canvasTex(256, 96, (cc, w, hh) => { cc.font = 'bold 54px Fredoka, Arial Black, sans-serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.lineWidth = 12; cc.strokeStyle = 'rgba(20,10,40,.9)'; cc.lineJoin = 'round'; cc.strokeText(d.name + '?', w / 2, hh / 2); cc.fillStyle = d.col; cc.fillText(d.name + '?', w / 2, hh / 2); });
      box.label.material.needsUpdate = true; box.label.visible = true;
      fx.particles.ring(x, 0.5, z, { count: 18, speed: 4, color: d.hex, size: 0.4, life: 0.6 }); audio.sfx('sparkle', { vol: 0.5 });
    }
    function takeBox(p) {
      const d = PW[box.type]; box.on = false; box.g.visible = false; box.label.visible = false; stats.pw[p.i]++;
      p[box.type] = d.dur; fx.texts.add(d.name + '!', p.x, 4.5, p.z, d.col, 1.5); hud.toast(`${names[p.i]} pakt ${d.name}!`, 1500); audio.sfx('powerup', { vol: 0.7 });
      fx.particles.burst(p.x, 1.5, p.z, { count: 30, speed: 6, up: 1.3, life: 0.9, size: 0.4, colors: [d.hex, 0xffffff], gravity: 4 }); p.moodT = 0.8; p.pose = 'cheer';
      if (box.type === 'cloak') { for (const m of cloakMats(p)) { m.transparent = true; } }
      refreshHud();
    }
    const cloakMats = (p) => { const a = []; p.c.group.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) a.push(o.material); }); return a; };

    // ------------------------------------------------------------------ bananen
    function throwBanana(p) {
      const b = bananas.find((q) => !q.on); if (!b) return;
      const gaps = trailI() === p.i ? 0.75 : 1; p.cd = 2.6 * gaps;
      const d = 6.4; let tx = p.x + p.fx * d, tz = p.z + p.fz * d; tx = clamp(tx, -AR.X + 0.8, AR.X - 0.8); tz = clamp(tz, -AR.Z + 0.8, AR.Z - 0.8);
      Object.assign(b, { on: true, sx: p.x, sz: p.z, tx, tz, t: 0, dur: 0.5, owner: p.i }); b.m.visible = true;
      p.c.swing(); audio.sfx('throw', { vol: 0.6 }); audio.sfx('pop', { vol: 0.3, rate: 1.4 });
    }
    function slip(p, why) {
      if (p.stun > 0 || p.immune > 0) return;
      p.stun = 1.35; p.immune = 2.6; p.spin = 0; stats.slips[p.i]++; p.slideX = p.vx * 0.9 + (Math.random() - 0.5) * 3; p.slideZ = p.vz * 0.9 + (Math.random() - 0.5) * 3;
      const n = Math.min(2, p.pts); if (n > 0) { p.pts -= n; for (let k = 0; k < n; k++) addPaper(p.x, p.z, 'p', { sp: 0, kx: rand(-5, 5), kz: rand(-5, 5), delay: 0.7, h: 1.6, life: 14 }); refreshHud(); }
      fx.texts.add(why === 'hit' ? 'BANAAN-RAAK!' : 'UITGEGLEDEN!', p.x, 4.2, p.z, '#ffe14a', 1.4); fx.particles.burst(p.x, 1, p.z, { count: 26, speed: 5, up: 1.4, life: 0.8, size: 0.4, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a], gravity: 6 });
      audio.sfx('boing', { vol: 0.7 }); audio.sfx('hurt', { vol: 0.4 }); ctx.shake(0.35); p.moodT = 1.3; p.pose = 'scared';
    }

    // ------------------------------------------------------------------ eind
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const w = winner, l = 1 - winner;
      const jokes = [`${names[w]} jaagt blaadjes als een echte handtekeningen-jager! ${names[l]} schrijft zijn eigen naam nog steeds op een bananenschil.`, `${names[w]} vangt de laatste handtekening en de Deurman geeft hem een high-five. ${names[l]} staat nog stil omdat de Deurman toeterde.`, `${names[w]} wint het kermisplein! ${names[l]} glijdt nog tevreden na op een banaan.`];
      const bits = G.why === 'sd' ? 'Het gouden blaadje besliste het. ' : G.why === 'near' ? 'De Deurman wees de dichtstbijzijnde aan. ' : '';
      ctx.finishPvp({ winner, score: [pl[0].pts, pl[1].pts], delay: 700, summary: `${pick(jokes)}<br><small>${bits}Betrapt door de Deurman: ${names[0]} ${stats.caught[0]}x, ${names[1]} ${stats.caught[1]}x · uitgegleden: ${stats.slips[0]}–${stats.slips[1]} · supersterren: ${stats.stars[0]}–${stats.stars[1]}</small>` });
    }
    function endMatch(winner, why) {
      if (G.end) return; G.end = true; G.state = 'end'; G.t = 0; G.winner = winner; G.why = why; hud.setTimer(null); hud.setHint(null);
      pl[winner].pose = 'cheer'; pl[winner].moodT = 99; pl[1 - winner].pose = 'sad'; pl[1 - winner].moodT = 99; D.pose = 'cheer'; Dm.mode = 'cheer';
      hud.showBig(`${names[winner]} WINT!`, 1800, winner ? '#8fb8ff' : '#7dffb0'); audio.sfx('win', { vol: 0.7 }); audio.sfx('bell', { vol: 0.5 }); A.cheer(6); ctx.shake(0.5);
      for (let k = 0; k < 4; k++) fx.particles.burst(pl[winner].x + rand(-3, 3), 4 + rand(0, 3), pl[winner].z + rand(-3, 3), { count: 30, speed: 7, up: 1.2, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
      refreshHud();
    }
    function timeUp() {
      if (pl[0].pts !== pl[1].pts) { audio.sfx('bell', { vol: 1 }); hud.showBig('TIJD!', 1000, '#ffd23f'); return endMatch(pl[0].pts > pl[1].pts ? 0 : 1, 'punten'); }
      // sudden death: één gouden blaadje midden op het plein
      G.sd = true; G.sdLeft = SD_MAX; hud.setTimer(null); hud.showBig('GOUDEN BLAADJE!', 1600, '#ffd23f'); hud.toast('Gelijk! Wie het gouden blaadje pakt wint', 2400); audio.sfx('bell', { vol: 0.9 });
      for (const q of papers) q.on = false; star.on = false; star.ph = 'off'; star.mesh.visible = star.glow.visible = star.mark.visible = false; box.on = false; box.g.visible = box.label.visible = false;
      G.sdLeaf = addPaper(0, 7.5, 'g', { sp: 2.2, ang: 0, life: 999, val: 1 }); refreshHud();
    }

    // ------------------------------------------------------------------ update
    const move = { x: 0, z: 0 };
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; G.state = 'play'; refreshHud(); hud.setTimer(MATCH_TIME, 10); for (let k = 0; k < 11; k++) spawnPair(); }
      if (T > 240 && !G.end) endMatch(pl[0].pts === pl[1].pts ? (Math.random() < 0.5 ? 0 : 1) : pl[0].pts > pl[1].pts ? 0 : 1, 'punten');
      G.t += dt;
      const playing = G.state === 'play';
      // klok
      if (playing && !G.sd) {
        G.clock -= dt; hud.setTimer(Math.max(0, G.clock), 10);
        if (G.clock <= 12 && !G.final) { G.final = true; hud.showBig('EINDSPURT: x2!', 1400, '#ff9a3a'); hud.toast('Laatste 12 seconden: alle blaadjes tellen dubbel!', 2200); audio.sfx('powerup', { vol: 0.6 }); }
        if (G.clock <= 18 && !G.starPlanned62 && !star.on) { G.starPlanned62 = true; if (Dm.mode === 'walk') planStar(); }
        if (G.clock <= 0) timeUp();
      } else if (playing && G.sd) {
        G.sdLeft -= dt; hud.setTimer(Math.max(0, G.sdLeft), 8);
        if (G.sdLeft <= 0 && !G.end) { const l = G.sdLeaf; const d0 = l ? Math.hypot(pl[0].x - l.x, pl[0].z - l.z) : 0, d1 = l ? Math.hypot(pl[1].x - l.x, pl[1].z - l.z) : 1; endMatch(d0 <= d1 ? 0 : 1, 'near'); }
      }
      if (playing) {
        // spawners (niet in sudden death)
        if (!G.sd) {
          G.spawnT -= dt; if (G.spawnT <= 0) { G.spawnT = (G.final ? 0.75 : 1.15) * rand(0.8, 1.2); spawnPair(); }
          if (!star.on && Dm.mode === 'walk') { G.starT -= dt; if (G.starT <= 0) { G.starT = rand(19, 26); planStar(); } }
          if (!box.on) { G.pwT -= dt; if (G.pwT <= 0) { G.pwT = rand(10, 13); spawnBox(gap() >= 5 ? trailI() : -1); } }
          Dm.nextLook -= Dm.mode === 'walk' ? dt : 0;
          if (Dm.mode === 'walk' && Dm.nextLook <= 0) startWarn();
        }
      }
      // ---- Deurman
      Dm.t += dt;
      if (Dm.mode === 'walk' && playing) {
        const w = WP[Dm.wp]; const dx = w.x - Dm.x, dz = w.z - Dm.z, d = Math.hypot(dx, dz);
        if (d < 0.5) { Dm.wp = (Dm.wp + (Math.random() < 0.15 ? -Dm.dir : Dm.dir) + 12) % 12; if (Math.random() < 0.1) Dm.dir = -Dm.dir; }
        else { const sp = 1.8; Dm.x += dx / d * sp * dt; Dm.z += dz / d * sp * dt; D.faceDir(dx, dz); }
        D.speed = 0.7; D.pose = 'idle';
      } else if (Dm.mode === 'warn') {
        D.speed = 0; D.pose = 'cheer'; D.faceDir(pl[Dm.target].x - Dm.x, pl[Dm.target].z - Dm.z);
        if (Dm.t >= Dm.hornN * 0.5 && Dm.hornN < 3) { Dm.hornN++; horn(); }
        if (Dm.t >= 1.5 && playing) startLook();
      } else if (Dm.mode === 'look') {
        D.speed = 0; D.pose = 'point'; D.faceDir(pl[Dm.target].x - Dm.x, pl[Dm.target].z - Dm.z);
        for (const p of pl) {
          if (p.stun > 0 || p.cloak > 0) continue;
          const inp = pv.input(p.i);
          if (inp.mag > 0.25) { p.moveT += dt; if (!p.caught) caught(p, false); else if (p.moveT > 0.7) { p.moveT = 0; caught(p, true); } }
        }
        if (Dm.t >= Dm.lookT) endLook();
      } else if (Dm.mode === 'cool') { D.speed = 0; D.pose = 'idle'; if (Dm.t > 0.8) { Dm.mode = 'walk'; Dm.t = 0; hud.setHint(null); } }
      else if (Dm.mode === 'sign') { D.speed = 0; D.pose = 'highfive'; if (Dm.t > 1.8) { Dm.mode = 'walk'; Dm.t = 0; } }
      else if (Dm.mode === 'cheer') { D.speed = 0; D.pose = 'cheer'; }
      for (const p of pl) { p.ring.material.opacity = 0.85; }
      // ---- spelers
      for (const p of pl) {
        const inp = pv.input(p.i); const stunned = p.stun > 0;
        p.stun = Math.max(0, p.stun - dt); p.immune = Math.max(0, p.immune - dt); p.cd = Math.max(0, p.cd - dt); p.chainT = Math.max(0, p.chainT - dt);
        p.pen = Math.max(0, p.pen - dt); p.magnet = Math.max(0, p.magnet - dt);
        if (p.cloak > 0) { p.cloak = Math.max(0, p.cloak - dt); if (p.cloak === 0) { for (const m of cloakMats(p)) { m.opacity = 1; m.transparent = false; } fx.texts.add('zichtbaar!', p.x, 4, p.z, '#c58aff', 0.9); } }
        const trail = trailI() === p.i;
        let mx = 0, mz = 0, mag = 0;
        if (playing && !stunned && !G.end) { mx = inp.x; mz = inp.y; mag = Math.min(1, Math.hypot(mx, mz)); if (mag > 1e-3 && mag > 0.15) { p.fx = mx / Math.hypot(mx, mz); p.fz = mz / Math.hypot(mx, mz); } else { mx = mz = 0; mag = 0; } }
        // sprint
        const want = inp.a && mag > 0.2 && playing && !stunned;
        if (p.tired && p.stamina > 0.3) p.tired = false;
        p.sprint = want && !p.tired && p.stamina > 0.04;
        if (p.sprint) { p.stamina = Math.max(0, p.stamina - dt * 0.46); p.regenT = 0.45; if (p.stamina <= 0.02) { p.tired = true; fx.texts.add('PUF!', p.x, 3.6, p.z, '#ff9a6a', 0.8); } }
        else { p.regenT -= dt; if (p.regenT <= 0) p.stamina = Math.min(1, p.stamina + dt * (trail ? 0.44 : 0.32)); }
        const sp = BASE_SPEED * pv.speed(p.i) * (p.sprint ? SPRINT : 1) * (p.tired ? 0.88 : 1);
        if (stunned) { p.vx = damp(p.vx, p.slideX, 4, dt); p.vz = damp(p.vz, p.slideZ, 4, dt); p.slideX *= Math.exp(-1.6 * dt); p.slideZ *= Math.exp(-1.6 * dt); }
        else { const lam = lerp(16, 2.0, SLIP); p.vx = damp(p.vx, mx * sp, lam, dt); p.vz = damp(p.vz, mz * sp, lam, dt); }
        p.x += p.vx * dt; p.z += p.vz * dt;
        // botsingen: veld, obstakels, de Deurman, de ander
        p.x = clamp(p.x, -AR.X + p.r, AR.X - p.r); p.z = clamp(p.z, -AR.Z + p.r, AR.Z - p.r);
        for (const o of OBS) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), mm = o.r + p.r; if (d < mm) { const k = d > 1e-4 ? 1 / d : 0; p.x = o.x + (k ? dx * k : 1) * mm; p.z = o.z + dz * k * mm; } }
        { const dx = p.x - Dm.x, dz = p.z - Dm.z, d = Math.hypot(dx, dz), mm = 1.3 + p.r; if (d < mm && d > 1e-4) { p.x = Dm.x + dx / d * mm; p.z = Dm.z + dz / d * mm; } }
        // B = banaan
        if (playing && !stunned && !G.end && inp.bP && p.cd <= 0) throwBanana(p);
        else if (playing && inp.bP && p.cd > 0) audio.sfx('click', { vol: 0.12, rate: 0.6 });
      }
      { const a = pl[0], b = pl[1]; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), mm = a.r + b.r; if (d < mm && d > 1e-4) { const o = (mm - d) / 2; a.x -= dx / d * o; a.z -= dz / d * o; b.x += dx / d * o; b.z += dz / d * o; } }
      // ---- blaadjes bewegen en worden gepakt
      for (const q of papers) {
        if (!q.on) continue;
        q.age += dt;
        if (q.homing >= 0) {     // gestolen blaadje vliegt naar de ander
          if (q.delay > 0) { q.delay -= dt; q.h = Math.min(3, q.h + dt * 2); continue; }
          const t = pl[q.homing]; const dx = t.x - q.x, dz = t.z - q.z, d = Math.hypot(dx, dz) || 1, s = Math.min(d, (14 + q.age * 12) * dt); q.x += dx / d * s; q.z += dz / d * s; q.h = lerp(q.h, 1.5, 6 * dt);
          if (d < 0.9) collect(t, q);
          continue;
        }
        if (q.delay > 0) q.delay -= dt;
        if (G.sd && q === G.sdLeaf) { /* gouden blaadje: blijft bewegen */ } else { q.life -= dt; if (q.life <= 0) { q.on = false; continue; } }
        // zweven: de richting draait langzaam, rand en obstakels laten hem terugkaatsen
        q.ang += Math.sin(T * 0.7 + q.ph) * 0.9 * dt;
        let vx = Math.cos(q.ang) * q.sp + q.kx, vz = Math.sin(q.ang) * q.sp + q.kz; q.kx *= Math.exp(-2.2 * dt); q.kz *= Math.exp(-2.2 * dt);
        // magneet
        for (const p of pl) if (p.magnet > 0 && q.delay <= 0) { const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz); if (d < 8 && d > 0.01) { const f = (1 - d / 8) * 11 + 3; vx += dx / d * f; vz += dz / d * f; } }
        q.x += vx * dt; q.z += vz * dt;
        const bx = AR.X - 0.6, bz = AR.Z - 0.6;
        if (q.x > bx) { q.x = bx; q.ang = Math.PI - q.ang; } else if (q.x < -bx) { q.x = -bx; q.ang = Math.PI - q.ang; }
        if (q.z > bz) { q.z = bz; q.ang = -q.ang; } else if (q.z < -bz) { q.z = -bz; q.ang = -q.ang; }
        for (const o of OBS) { const dx = q.x - o.x, dz = q.z - o.z, d = Math.hypot(dx, dz); if (d < o.r + 0.6) { q.x = o.x + dx / d * (o.r + 0.6); q.z = o.z + dz / d * (o.r + 0.6); q.ang = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.8; } }
        q.h = Math.max(0, q.h - dt * 3);
        if (q.delay <= 0 && playing && !G.end) {
          for (const p of pl) {
            const rr = (1.55 + (trailI() === p.i ? 0.25 : 0)) * p.sz; if (p.stun > 0) continue;
            if (Math.hypot(p.x - q.x, p.z - q.z) < rr) {
              if (G.sd && q === G.sdLeaf) { q.on = false; p.pts++; fx.particles.burst(q.x, 1.2, q.z, { count: 40, speed: 6, up: 1.2, life: 1, size: 0.5, colors: [0xffd23f, 0xffffff], gravity: 4 }); audio.sfx('powerup', { vol: 0.8 }); return endMatch(p.i, 'sd'); }
              collect(p, q); break;
            }
          }
        }
      }
      // superster
      if (star.on) {
        star.t += dt;
        if (star.ph === 'warn') { if (star.t >= 1.7) { star.ph = 'fall'; star.t = 0; star.mesh.visible = star.glow.visible = true; } }
        else if (star.ph === 'fall') {
          const u = Math.min(1, star.t / 0.45); star.mesh.position.set(star.x, lerp(16, 1.5, u * u), star.z);
          if (u >= 1) { star.ph = 'rest'; star.t = 0; ctx.shake(0.55); audio.sfx('explode', { vol: 0.4 }); audio.sfx('sparkle', { vol: 0.7 }); fx.particles.burst(star.x, 1, star.z, { count: 60, speed: 9, up: 1.2, life: 1.2, size: 0.55, colors: [0xffd23f, 0xffffff, 0xff9a10], gravity: 6 }); fx.particles.ring(star.x, 0.4, star.z, { count: 30, speed: 10, color: 0xffd23f, size: 0.5, life: 0.7 }); star.mark.visible = false; }
        } else if (star.ph === 'rest') {
          star.mesh.position.set(star.x, 1.9 + Math.sin(T * 3) * 0.25, star.z); star.mesh.rotation.y += dt * 2.4;
          if (star.t > 11) { star.on = false; star.ph = 'off'; star.mesh.visible = star.glow.visible = false; fx.particles.burst(star.x, 1.5, star.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.4, colors: [0xffd23f], gravity: 4 }); }
          else if (playing && !G.end) for (const p of pl) if (p.stun <= 0 && Math.hypot(p.x - star.x, p.z - star.z) < 2.0 * p.sz + 1.0) {
            const v = 10 * (p.pen > 0 ? 2 : 1); p.pts += v; stats.stars[p.i]++; stats.papers[p.i] += v; star.on = false; star.ph = 'off'; star.mesh.visible = star.glow.visible = false;
            fx.texts.add(`SUPERSTER +${v}!`, star.x, 5, star.z, '#ffd23f', 1.8); hud.toast(`⭐ ${names[p.i]} pakt de superster! (+${v})`, 1800); audio.sfx('win', { vol: 0.5 }); audio.sfx('powerup', { vol: 0.7 }); ctx.shake(0.4); A.cheer(2);
            fx.particles.burst(star.x, 1.5, star.z, { count: 70, speed: 8, up: 1.4, life: 1.3, size: 0.5, colors: [0xffd23f, 0xffffff, 0xff9a10, 0xff6fa5], gravity: 5 }); p.moodT = 1.2; p.pose = 'cheer'; refreshHud(); break;
          }
        }
        star.mark.material.opacity = 0.5 + Math.sin(T * 12) * 0.3; star.mark.scale.setScalar(1.3 + Math.min(1, star.t / 1.7) * 2.2);
      }
      // power-up kistje
      if (box.on) {
        box.t += dt; box.life -= dt; box.g.rotation.y += dt * 1.5; box.g.position.y = Math.sin(box.t * 3) * 0.2; box.label.position.set(box.x, 3.4, box.z);
        if (box.life <= 0) { box.on = false; box.g.visible = box.label.visible = false; }
        else if (playing && !G.end) for (const p of pl) if (p.stun <= 0 && Math.hypot(p.x - box.x, p.z - box.z) < 1.6 * p.sz + 0.7) { takeBox(p); break; }
      }
      // bananen
      for (const b of bananas) {
        if (!b.on) continue; b.t += dt; const u = Math.min(1, b.t / b.dur);
        const x = lerp(b.sx, b.tx, u), z = lerp(b.sz, b.tz, u), y = 0.6 + Math.sin(Math.PI * u) * 2.6;
        b.m.position.set(x, y, z); b.m.rotation.set(0, u * 14, 0.5); b.m.scale.setScalar(1.5);
        fx.particles.emit(x, y, z, rand(-1, 1), rand(0, 1.5), rand(-1, 1), { life: 0.5, size: 0.3, color: [0xff4a6a, 0xffd23f, 0x4ac8ff, 0x8dff9a][(Math.random() * 4) | 0], gravity: 3 });
        const o = pl[1 - b.owner];
        if (u > 0.25 && o.stun <= 0 && o.immune <= 0 && Math.hypot(o.x - x, o.z - z) < o.r + 0.9) { b.on = false; b.m.visible = false; stats.hits[b.owner]++; slip(o, 'hit'); continue; }
        if (u >= 1) {
          b.on = false; b.m.visible = false; const f = peels.find((q) => !q.on) || peels[0];
          Object.assign(f, { on: true, x: b.tx, z: b.tz, life: 10, owner: b.owner, grace: 1.2 }); f.m.visible = true; f.m.position.set(b.tx, 0, b.tz); f.m.rotation.y = Math.random() * 6; f.m.scale.setScalar(1.4);
          audio.sfx('land', { vol: 0.4, rate: 1.4 }); fx.particles.burst(b.tx, 0.4, b.tz, { count: 18, speed: 4, up: 1.2, life: 0.7, size: 0.35, colors: [0xff4a6a, 0xffd23f, 0x4ac8ff, 0x8dff9a, 0xffffff], gravity: 6 });
        }
      }
      for (const f of peels) {
        if (!f.on) continue; f.life -= dt; f.grace -= dt;
        if (f.life <= 0) { f.on = false; f.m.visible = false; continue; }
        f.m.visible = f.life > 2 || Math.sin(f.life * 18) > 0;
        for (const p of pl) if (p.stun <= 0 && p.immune <= 0 && !(p.i === f.owner && f.grace > 0) && Math.hypot(p.x - f.x, p.z - f.z) < p.r + 0.75) { f.on = false; f.m.visible = false; slip(p, 'peel'); break; }
      }
      // einde / overgang
      if (G.state === 'end' && G.t > 2.6 && !finished) finishMatch(G.winner);
      if (playing || G.state === 'end') G.t += 0;
      visuals(dt);
    }

    // ------------------------------------------------------------------ visuals
    let camX = 0, camZ = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, k = clamp(1.72 / asp, 1, 1.7);
      let fx_ = 0, fz_ = 0, zoom = 1;
      if (G.end && G.winner >= 0) { fx_ = pl[G.winner].x * 0.5; fz_ = pl[G.winner].z * 0.4; zoom = 0.78; }
      camX = damp(camX, fx_, 2, dt); camZ = damp(camZ, fz_, 2, dt);
      const sway = Math.sin((T + introT) * 0.25) * 0.5;
      camera.position.set(camX + sway, 23.4 * k * zoom, 16.2 * k * zoom + camZ + 1.5);
      camera.lookAt(camX, 0, camZ + 1.4);
    }
    const sparkT = [0, 0];
    function visuals(dt) {
      const tt = T + introT;
      // sfeer-licht tijdens kijkmoment
      const dark = Dm.mode === 'look' ? 1 : Dm.mode === 'warn' ? Math.min(1, Dm.t / 1.5) * 0.6 : 0;
      L.hemi.intensity = damp(L.hemi.intensity, hemiI * (1 - 0.3 * dark), 6, dt); L.sun.intensity = damp(L.sun.intensity, sunI * (1 - 0.35 * dark), 6, dt);
      L.hemi.color.copy(hemiCol).lerp(YEL, dark * 0.5);
      // Deurman
      Dg.position.set(Dm.x, 0, Dm.z); D.update(dt);
      const warnOrLook = Dm.mode === 'warn' || Dm.mode === 'look';
      D.eyeGlow.forEach((e) => { e.visible = warnOrLook; e.scale.setScalar(2.2 + Math.sin(tt * 18) * 0.6 + (Dm.mode === 'look' ? 1 : 0)); });
      Dshadow.position.set(Dm.x, 0.04, Dm.z); Dring.visible = warnOrLook; Dring.position.set(Dm.x, 0.07, Dm.z); Dring.scale.setScalar(1 + Math.sin(tt * 10) * 0.1 + (Dm.mode === 'look' ? 0.4 : 0));
      Dring.material.color.setHex(Dm.mode === 'look' ? 0xff9a3a : 0xffe14a);
      bang.visible = warnOrLook; bang.position.set(Dm.x, 6.6, Dm.z); bang.scale.setScalar(2.2 + Math.sin(tt * 14) * 0.25);
      const tp = pl[Dm.target];
      if (Dm.mode === 'look') {
        beam.visible = true; V3.set(Dm.x, 4.9, Dm.z); const dx = tp.x - Dm.x, dz = tp.z - Dm.z, dy = -4.9, len = Math.hypot(dx, dy, dz);
        beam.position.copy(V3); beam.lookAt(tp.x, 0.5, tp.z); beam.scale.set(1.0 + tp.sz * 0.2, 1.0 + tp.sz * 0.2, len); beam.material.opacity = 0.26 + Math.sin(tt * 12) * 0.06;
      } else beam.visible = false;
      // blaadjes -> instances
      let n1 = 0, n2 = 0;
      for (const q of papers) {
        if (!q.on) continue;
        const fade = Math.min(1, q.age / 0.3) * (q.life < 1 ? Math.max(0, q.life) : 1); const y = 0.95 + q.h + Math.sin(tt * 2.3 + q.ph) * 0.3;
        E4.set(Math.sin(tt * 1.9 + q.ph) * 0.55, tt * 1.7 + q.ph * 3, Math.cos(tt * 1.4 + q.ph) * 0.55); Q4.setFromEuler(E4);
        const s = fade * (q.kind === 'g' ? 1.3 : 1) * (q === G.sdLeaf ? 1.7 : 1);
        M4.compose(V3.set(q.x, y, q.z), Q4, S3.set(s, s, s));
        if (q.kind === 'g') goldI.setMatrixAt(n2++, M4); else papI.setMatrixAt(n1++, M4);
        if (q.kind === 'g' && Math.random() < dt * 8) fx.particles.emit(q.x + rand(-0.5, 0.5), y + 0.3, q.z + rand(-0.5, 0.5), 0, 1, 0, { life: 0.5, size: 0.25, color: 0xffd23f, gravity: -1 });
        if (q.homing >= 0 && Math.random() < dt * 20) fx.particles.emit(q.x, y, q.z, 0, 0.5, 0, { life: 0.35, size: 0.3, color: 0xffffff, gravity: 0 });
      }
      papI.count = n1; goldI.count = n2; papI.instanceMatrix.needsUpdate = goldI.instanceMatrix.needsUpdate = true;
      // spelers
      for (const p of pl) {
        const g = p.g, c = p.c; const spd = Math.hypot(p.vx, p.vz);
        const stunned = p.stun > 0;
        if (stunned) p.spin += dt * 16; else p.spin = 0;
        const hopY = GRAV < 1 ? Math.abs(Math.sin(tt * 3 + p.i)) * 0.9 * clamp(spd / 8, 0.15, 1) + 0.15 : 0;
        g.position.set(p.x, hopY, p.z);
        if (spd > 0.6 && !stunned) { const ty = Math.atan2(p.vx, p.vz); p.faceY = p.faceY == null ? ty : p.faceY; let d = ty - p.faceY; d = Math.atan2(Math.sin(d), Math.cos(d)); p.faceY += d * Math.min(1, dt * 14); }
        if (p.faceY == null) p.faceY = p.i ? -Math.PI / 2 : Math.PI / 2;
        g.rotation.y = p.faceY + p.spin;
        c.speed = stunned ? 0 : clamp(spd / BASE_SPEED, 0, 1.1); c.air = stunned || hopY > 0.4;
        p.moodT -= dt; let pose = p.moodT > 0 ? p.pose : (p.sprint ? 'push' : 'idle'); if (stunned) pose = 'scared';
        c.pose = pose; c.update(dt);
        // mantel
        if (p.cloak > 0) { const a = p.cloak < 1.5 ? 0.25 + Math.abs(Math.sin(tt * 14)) * 0.5 : 0.22; for (const m of cloakMats(p)) { m.transparent = true; m.opacity = a; } }
        p.shadow.position.set(p.x, 0.04, p.z); p.shadow.scale.setScalar(p.r * 1.2); p.shadow.visible = p.cloak <= 0;
        p.ring.position.set(p.x, 0.06, p.z); const ringS = p.r * 1.25 * (1 + Math.sin(tt * 6 + p.i) * 0.03);
        let rc = p.i ? 0x3a78e0 : 0x2f9e5b, ro = 0.8;
        if (Dm.mode === 'warn') { rc = 0xffe14a; ro = 0.7 + Math.sin(tt * 14) * 0.25; } else if (Dm.mode === 'look') { rc = p.caught ? 0xff3a3a : 0x6fff8a; ro = 0.9; }
        p.ring.material.color.setHex(rc); p.ring.material.opacity = ro; p.ring.scale.setScalar(ringS * (Dm.mode === 'look' && p.caught ? 1.25 : 1));
        const top = 2.7 * p.sz + 1.0;
        p.tag.position.set(p.x, top + 0.8, p.z + 0.4); p.tag.visible = !G.end || G.t < 2;
        const setBar = (b, f, y, show, col) => { b.bg.visible = b.fg.visible = show; if (!show) return; b.bg.position.set(p.x, y, p.z + 0.4); const w = 1.8 * Math.max(0.001, f); b.fg.scale.set(w, 0.12, 1); b.fg.position.set(p.x - (1.8 - w) / 2, y, p.z + 0.41); if (col != null) b.fg.material.color.setHex(col); };
        setBar(p.bars.st, p.stamina, top - 0.05, p.stamina < 0.995, p.tired ? 0xff6a4a : p.stamina < 0.35 ? 0xffa23a : 0x6fe87a);
        setBar(p.bars.cd, 1 - clamp(p.cd / (trailI() === p.i ? 1.95 : 2.6), 0, 1), top - 0.3, p.cd > 0, 0xffd23f);
        p.excl.visible = Dm.mode === 'look' && p.caught; p.excl.position.set(p.x, top + 2.1, p.z); p.excl.scale.setScalar(1.2 + Math.sin(tt * 16) * 0.15);
        p.penM.visible = p.pen > 0; if (p.pen > 0) { p.penM.position.set(p.x + 1.4 * p.sz, 3.6 * p.sz + Math.sin(tt * 4) * 0.15, p.z); p.penM.rotation.set(0, tt * 3, 0.6); sparkT[p.i] -= dt; if (sparkT[p.i] <= 0) { sparkT[p.i] = 0.07; fx.particles.emit(p.x + rand(-0.8, 0.8), 2.8, p.z + rand(-0.8, 0.8), 0, 0.8, 0, { life: 0.5, size: 0.25, color: 0xffd23f, gravity: -1 }); } }
        p.magM.visible = p.magnet > 0; p.field.visible = p.magnet > 0; if (p.magnet > 0) { p.magM.position.set(p.x, 4.0 * p.sz + Math.sin(tt * 4) * 0.12, p.z); p.magM.rotation.set(0, tt * 2, Math.PI); p.field.position.set(p.x, 0.07, p.z); p.field.scale.setScalar(1 + Math.sin(tt * 5) * 0.04); p.field.rotation.z = tt; }
        if (p.sprint && Math.random() < dt * 30) fx.particles.dust(p.x - p.vx * 0.05, 0.1, p.z - p.vz * 0.05, 1, 0xfff0c0);
      }
      A.update(tt, dt); updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; D.pose = 'cheer'; for (const p of pl) { p.c.update(dt); } Dg.position.set(Dm.x, 0, Dm.z); D.update(dt); A.update(T + introT, dt); updateCamera(dt); }
    function introUpdate(dt) { introT += dt; pl.forEach((p) => { p.c.pose = 'idle'; }); D.pose = 'wave'; visuals(dt); }
    visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(p.x, 1.5, p.z, { count: 22, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && !finished) { fx.texts.add('BEWOGEN!', pl[i].x, 4, pl[i].z, '#9fe8ff', 1.3); sendPapers(i, 3); audio.sfx('static', { vol: 0.4 }); } }); },
      celebrate(w) { pl[w].pose = 'cheer'; pl[w].moodT = 99; pl[1 - w].pose = 'sad'; pl[1 - w].moodT = 99; A.cheer(8); },
      dispose() { hud.setHint(null); },
      dbg: {
        state: () => ({ T, gstate: G.state, clock: G.clock, sd: G.sd, sdLeft: G.sdLeft, final: G.final, finished, winner: G.winner, why: G.why, look: Dm.mode, lookT: Dm.t, target: Dm.target, looks: Dm.looks, lookDone: Dm.lookDone,
          pl: pl.map((p) => ({ x: p.x, z: p.z, pts: p.pts, st: p.stamina, cd: p.cd, stun: p.stun, pen: p.pen, magnet: p.magnet, cloak: p.cloak, caught: p.caught, r: p.r })),
          papers: papers.filter((q) => q.on && q.homing < 0 && q.delay <= 0).map((q) => ({ x: q.x, z: q.z, v: q.val })), star: star.on && star.ph === 'rest' ? { x: star.x, z: star.z } : null, starPh: star.ph, box: box.on ? { x: box.x, z: box.z, type: box.type } : null,
          peels: peels.filter((f) => f.on).map((f) => ({ x: f.x, z: f.z })), leaf: G.sdLeaf && G.sdLeaf.on ? { x: G.sdLeaf.x, z: G.sdLeaf.z } : null, stats }),
        setTime: (t) => { G.clock = t; }, setPts: (a, b) => { pl[0].pts = a; pl[1].pts = b; refreshHud(); },
        forceLook: () => { Dm.nextLook = 0; }, planStar: () => planStar(), spawnBox: (n) => spawnBox(n ?? -1), giveBox: (i, type) => { box.type = type; box.on = true; takeBox(pl[i]); },
        tp: (i, x, z) => { pl[i].x = x; pl[i].z = z; }, slip: (i) => slip(pl[i], 'peel'), throwB: (i) => throwBanana(pl[i]), pl,
      },
    };
  },
};

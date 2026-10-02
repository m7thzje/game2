import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, mulberry32, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { buildGarden, HX, HZ } from './whack_world.js';

// Mollen Meppen — een moestuin met 4x3 gaten. Beweeg van gat naar gat (richtingsknoppen), A = meppen.
// Mollen (+1), gouden mollen (+5), helm-mollen (2 klappen), bom-mollen en stekelvarkens (NIET meppen!)
// en de reuzenmol die ALLEBEI tegelijk (binnen 0,4 s) geraakt moet worden.

const DURATION = 50;
const COLS = HX.length, ROWS = HZ.length;
const STAND = 1.85, PSCALE = 1.2;              // afstand van boer tot gat (boer staat achter het gat en slaat naar de camera)
const IMPACT = 0.13;             // seconden tussen A en inslag
const GIANT_TIMES = [15, 30, 42];
const GIANT_WINDOW = 0.4;

const KIND = {
  mole: { pts: 1, hp: 1 },
  golden: { pts: 5, hp: 1 },
  helmet: { pts: 3, hp: 2 },
  bomb: { pts: -3, hp: 1 },
  hedgehog: { pts: -3, hp: 1 },
};

export default {
  id: 'whack',
  name: 'Mollen Meppen',
  giver: 'Boer Boris',
  icon: '🔨',
  mode: 'coop',
  time: DURATION,
  pay: 1.1,
  music: 'game_fast',
  blurb: 'Er zitten mollen in de moestuin van Boer Boris! Mep ze met je grote houten hamer. <b>Gouden mollen</b> zijn 5 punten waard, <b>helm-mollen</b> hebben twee klappen nodig. Blijf af van de <b>bom-mol</b> en het <b>stekelvarken</b>! En als de <b>reuzenmol</b> opduikt, moeten jullie hem <b>allebei tegelijk</b> raken (binnen 0,4 seconde).',
  controls: ['{move} naar een ander gat', '{a} meppen met de hamer'],
  tip: 'Een snelle reeks klappen geeft een combo. Rondjes slaan op een leeg gat breekt je combo!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    ctx.lights('day', { shadow: 22, center: [0, 0, 0] });
    scene.fog = new THREE.Fog(0xcfeaff, 70, 170);
    camera.fov = 45; camera.updateProjectionMatrix();
    const wrng = mulberry32(99);
    const W = buildGarden(ctx, wrng);
    const holeAt = (c, r) => W.holes[r * COLS + c];

    // ---------- materialen ----------
    const M = {
      mole: mat(0x7a5a46, { flatShading: false }), gold: new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xc88a00, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.3 }),
      hedge: mat(0xa8835a, { flatShading: false }), nose: mat(0xf29aa8, { flatShading: false }), noseDark: mat(0x2a1c14, { flatShading: false }),
      pink: mat(0xf4a6b0, { flatShading: false }), black: new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.3 }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      yellow: mat(0xffc93c, { flatShading: false, metalness: 0.2 }), bombM: new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.35, metalness: 0.5 }),
      spike: mat(0x4a3220, { emissive: 0x2a1a0c }), crown: new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xa87000, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 }),
    };
    const flameM = new THREE.MeshBasicMaterial({ color: 0xff9a2a }), lampM = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });

    // ---------- critter-model ----------
    const SPIKE_DIRS = []; for (let i = 0; i < 22; i++) { const a = i * 2.399, y = 0.15 + (i % 7) / 7 * 0.75; const rr = Math.sqrt(1 - y * y * 0.5); SPIKE_DIRS.push([Math.cos(a) * rr, y, Math.sin(a) * rr * 0.9 - 0.15]); }
    function makeActor(giant = false) {
      const root = new THREE.Group(); root.visible = false;
      const rise = new THREE.Group(); root.add(rise);
      const body = new THREE.Group(); rise.add(body); body.rotation.x = 0.22;
      const bodyMesh = mesh(new THREE.SphereGeometry(0.64, 16, 12), M.mole, { pos: [0, 0.42, 0], scale: [1, 1.12, 1] }); body.add(bodyMesh);
      const nose = mesh(new THREE.SphereGeometry(0.17, 10, 8), M.nose, { pos: [0, 0.52, 0.6], scale: [1, 0.85, 1.1] }); body.add(nose);
      const eyes = [];
      for (const sx of [-1, 1]) {
        const e = new THREE.Group(); e.position.set(sx * 0.23, 0.74, 0.5); body.add(e);
        e.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), M.black, { cast: false })); e.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), M.white, { cast: false, pos: [0.025, 0.03, 0.06] })); eyes.push(e);
        body.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), M.pink, { pos: [sx * 0.52, 0.2, 0.42] }));
        body.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), M.mole, { pos: [sx * 0.4, 1.0, 0.0] }));
        for (let k = -1; k <= 1; k++) body.add(mesh(new THREE.ConeGeometry(0.03, 0.14, 4), M.white, { cast: false, pos: [sx * 0.55 + k * 0.05, 0.12, 0.58], rot: [Math.PI / 2, 0, 0] }));
      }
      body.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 10, Math.PI), M.black, { cast: false, pos: [0, 0.34, 0.6], rot: [0, 0, Math.PI] }));
      // helm
      const helmet = new THREE.Group(); helmet.position.y = 0.95; body.add(helmet);
      helmet.add(mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, TAU, 0, Math.PI / 2), M.yellow, { pos: [0, 0.02, 0] }));
      helmet.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 14), M.yellow, { pos: [0, 0, 0] }));
      helmet.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), lampM, { cast: false, pos: [0, 0.22, 0.46], rot: [Math.PI / 2, 0, 0] }));
      helmet.visible = false;
      // bom
      const bomb = new THREE.Group(); bomb.position.y = 1.25; bomb.scale.setScalar(1.25); body.add(bomb);
      bomb.add(mesh(new THREE.SphereGeometry(0.4, 12, 10), M.bombM));
      bomb.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), M.black, { pos: [0, 0.4, 0] }));
      bomb.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 4), mat(0xd8c08a), { cast: false, pos: [0.05, 0.58, 0], rot: [0, 0, -0.4] }));
      const flame = mesh(new THREE.ConeGeometry(0.11, 0.3, 6), flameM, { cast: false, pos: [0.13, 0.78, 0] }); bomb.add(flame);
      bomb.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }), { cast: false, pos: [0, 0.1, 0.38] })); // rood lampje
      bomb.visible = false;
      // stekels
      const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.78, 5), M.spike, SPIKE_DIRS.length); spikes.castShadow = true;
      { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1); SPIKE_DIRS.forEach((d, i) => { const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize(); q.setFromUnitVectors(up, dir); m4.compose(new THREE.Vector3(dir.x * 0.7, 0.42 + dir.y * 0.78, dir.z * 0.68 - 0.05), q, s); spikes.setMatrixAt(i, m4); }); spikes.frustumCulled = false; }
      spikes.visible = false; body.add(spikes);
      // kroon + wenkbrauwen (reuzenmol)
      const crown = new THREE.Group(); crown.position.y = 1.0; body.add(crown);
      crown.add(mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.2, 8, 1, true), M.crown, { pos: [0, 0.05, 0] }));
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; crown.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 4), M.crown, { pos: [Math.cos(a) * 0.37, 0.25, Math.sin(a) * 0.37] })); }
      crown.visible = false;
      const brows = new THREE.Group(); body.add(brows);
      for (const sx of [-1, 1]) brows.add(mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), M.black, { cast: false, pos: [sx * 0.23, 0.88, 0.52], rot: [0, 0, -sx * 0.4] }));
      brows.visible = false;
      if (!giant) root.scale.setScalar(1.15);
      if (giant) { root.scale.setScalar(2.2); crown.visible = true; brows.visible = true; }
      scene.add(root);
      return { root, rise, body, bodyMesh, nose, eyes, helmet, bomb, flame, spikes, crown, giant, state: 'free', t: 0, r: 0, kind: 'mole', hp: 1, hole: null, upT: 1, ph: 0, blink: 0, bonkT: 0, id: 0, spark: 0, hit: null, tag: 0 };
    }
    const pool = []; for (let i = 0; i < 8; i++) pool.push(makeActor());
    const giant = makeActor(true); giant.cells = null; giant.firstHit = null; giant.fails = 0;
    // reuzen-ring (venster-timer)
    const gring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.9 })); gring.rotation.x = Math.PI / 2; gring.visible = false; scene.add(gring);

    // ---------- hamer ----------
    function makeHammer() {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.15, 7), mat(0x8a5a2b), { pos: [0, -0.35, 0] }));
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xc08a58, roughness: 0.9, flatShading: true }), { pos: [0, -1.05, 0] }));
      for (const sx of [-0.45, 0.45]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.84, 0.84), mat(0x55565e, { metalness: 0.6, roughness: 0.4 }), { pos: [sx, -1.05, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.085, 6, 5), mat(0x55565e), { cast: false, pos: [0, 0.27, 0] }));
      return g;
    }

    // ---------- spelers ----------
    const START = [[1, 1], [2, 1]];
    const pl = players.map((p, i) => {
      const c = makeBrother(i); c.group.position.set(HX[START[i][0]], 0.16, HZ[START[i][1]] - STAND); c.group.scale.setScalar(PSCALE); scene.add(c.group);
      const h = makeHammer(); c.hold(h, 'r');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = Math.PI / 2; scene.add(ring);
      const arrow = new THREE.Group(); scene.add(arrow);
      arrow.add(mesh(new THREE.ConeGeometry(0.34, 0.6, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i] }), { cast: false, rot: [Math.PI, Math.PI / 4, 0], pos: [0, 0, 0] }));
      arrow.add(mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i] }), { cast: false, pos: [0, 0.5, 0] }));
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(20,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(p.name, w / 2, hh / 2); g.fillStyle = p.css; g.fillText(p.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.0, 0.75, 1); tag.renderOrder = 15; scene.add(tag);
      return { i, c, tag, hammer: h, ring, arrow, col: START[i][0], row: START[i][1], px: HX[START[i][0]], pz: HZ[START[i][1]] - STAND, sw: -1, stun: 0, heldDir: null, heldT: 0, armA: -2.6, score: 0, hits: 0, golden: 0, giants: 0, bonks: 0, swings: 0, misses: 0, lastHitT: -9, cheer: 0, queued: false };
    });

    // ---------- toestand ----------
    let T = 0, timeLeft = DURATION, done = false, score = 0, combo = 0, bestCombo = 0, lastHitT = -9, spawnT = 1.0, giantIdx = 0, giantsKilled = 0, giantsSeen = 0;
    let molesHit = 0, goldenHit = 0, helmetHit = 0, bombsHit = 0, hedgeHit = 0, escaped = 0, teamBonuses = 0, whiffs = 0;
    let lastScorer = { t: -9, i: -1 }, idc = 1, introT = 0, demoT = 0.8;
    const camBase = new THREE.Vector3(0, 14.0, 11.2);
    function placeCam(dt, t) { camera.position.set(Math.sin(t * 0.25) * 0.6, camBase.y + Math.sin(t * 0.3) * 0.2, camBase.z); camera.lookAt(0, 0.3, -0.7); }
    placeCam(0, 0);

    hud.setTimer(DURATION); hud.setScore('Punten: 0'); hud.setPlayerInfo(0, '0 punten'); hud.setPlayerInfo(1, '0 punten');

    const mult = () => 1 + Math.min(Math.floor(combo / 4), 4) * 0.25;
    const say = (txt, x, y, z, col, s = 1) => fx.texts.add(txt, x, y, z, col, s);

    // ---------- actoren ----------
    function freeActor() { return pool.find((a) => a.state === 'free'); }
    function occupied(h) { return pool.some((a) => a.state !== 'free' && a.hole === h) || (giant.state !== 'free' && giant.cells && giant.cells.includes(h)); }
    function configure(a, kind) {
      a.kind = kind; a.hp = KIND[kind].hp;
      a.bodyMesh.material = kind === 'golden' ? M.gold : kind === 'hedgehog' ? M.hedge : M.mole;
      a.nose.material = kind === 'hedgehog' ? M.noseDark : M.nose;
      a.helmet.visible = kind === 'helmet'; a.bomb.visible = kind === 'bomb'; a.spikes.visible = kind === 'hedgehog';
      a.helmet.rotation.set(0, 0, 0); a.helmet.position.y = 0.95;
    }
    function spawn(kind, h, upT, demo = false) {
      const a = freeActor(); if (!a) return null;
      configure(a, kind); a.hole = h; a.state = 'rise'; a.t = 0; a.r = 0; a.upT = upT; a.ph = Math.random() * 6; a.blink = 1 + Math.random() * 2; a.id = idc++; a.demo = demo; a.spark = 0;
      a.root.visible = true; a.root.position.set(h.x, 0.16, h.z); a.rise.position.y = -2.2; a.body.scale.set(1, 1, 1); a.body.rotation.set(0.22, 0, 0);
      fx.particles.dust(h.x, 0.2, h.z, 3, 0x9a7650);
      audio.sfx('pop', { vol: 0.14, rate: 0.7 + Math.random() * 0.6 });
      return a;
    }
    function free(a) { a.state = 'free'; a.root.visible = false; a.hole = null; }
    function sendDown(a, fast = false) { if (a.state === 'down' || a.state === 'free') return; a.state = 'down'; a.t = 0; a.fast = fast; }
    const hittable = (a) => a.state !== 'free' && a.state !== 'bonk' && ((a.state === 'rise' && a.r >= 0.3) || a.state === 'up' || (a.state === 'down' && a.r >= 0.4));

    function updateActor(a, dt) {
      if (a.state === 'free') return;
      a.t += dt; a.ph += dt;
      const s = a.giant ? 2.2 : 1;
      if (a.state === 'rise') { a.r = Math.min(1, a.t / (a.giant ? 0.55 : 0.17)); if (a.r >= 1) { a.state = 'up'; a.t = 0; } }
      else if (a.state === 'up') {
        a.r = 1; if (!a.giant && a.t > a.upT) { sendDown(a); if (!a.demo && a.kind !== 'bomb' && a.kind !== 'hedgehog') { escaped++; } }
      } else if (a.state === 'down') { a.r = Math.max(0, a.r - dt / (a.fast ? 0.1 : (a.giant ? 0.45 : 0.2))); if (a.r <= 0) { if (a.giant) { free(a); } else free(a); return; } }
      else if (a.state === 'bonk') { a.bonkT -= dt; a.r = Math.max(0.55, 1 - (a.t) * 0.5); if (a.bonkT <= 0) { a.state = 'down'; a.t = 0; a.fast = true; a.r = 0.6; } }
      const ease = a.state === 'rise' ? 1 - Math.pow(1 - a.r, 3) * (1 + Math.sin(a.r * 3) * 0.0) : a.r;
      const over = a.state === 'rise' ? Math.sin(a.r * Math.PI) * 0.12 : 0;
      a.rise.position.y = -2.2 * (1 - clamp(ease, 0, 1)) + over;
      // lichaam: wiebelen + knipperen
      if (a.state === 'up' || a.state === 'rise') {
        a.body.rotation.y = Math.sin(a.ph * (a.kind === 'hedgehog' ? 3 : 2.6)) * (a.giant ? 0.18 : 0.35);
        a.body.scale.set(1 + Math.sin(a.ph * 9) * 0.02, 1 + Math.sin(a.ph * 9 + 1) * 0.04, 1);
        a.blink -= dt; if (a.blink < 0) { a.blink = 1.2 + Math.random() * 2; a.blinkT = 0.12; }
        a.blinkT = (a.blinkT || 0) - dt; const bs = a.blinkT > 0 ? 0.1 : 1; a.eyes.forEach((e) => { e.scale.y = bs; });
        a.nose.position.x = Math.sin(a.ph * 14) * 0.015;
      } else if (a.state === 'bonk') {
        const k = Math.min(1, a.t / 0.08); a.body.scale.set(1 + 0.35 * k, 1 - 0.58 * k, 1 + 0.35 * k); a.body.rotation.y += dt * 14;
      }
      if (a.bomb.visible) { a.flame.scale.set(1, 0.8 + Math.sin(a.ph * 30) * 0.3, 1); a.bomb.rotation.z = Math.sin(a.ph * 12) * 0.1; if (Math.random() < dt * 14) fx.particles.emit(a.root.position.x + 0.15, 1.9, a.root.position.z, (Math.random() - 0.5) * 0.5, 1.4, 0, { life: 0.4, size: 0.2, color: 0xffb040, gravity: -1 }); }
      if (a.kind === 'golden' && a.state === 'up' && Math.random() < dt * 9) fx.particles.emit(a.root.position.x + (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.2, a.root.position.z + (Math.random() - 0.5) * 0.8, 0, 0.8, 0, { life: 0.6, size: 0.22, color: 0xfff2a0, gravity: -0.5 });
    }

    // ---------- scoren ----------
    function award(p, base, x, z, label, col = '#ffe14a', big = 1) {
      const m = mult(); const pts = Math.round(base * m);
      score += pts; p.score += pts; combo++; bestCombo = Math.max(bestCombo, combo); lastHitT = T; p.lastHitT = T; p.hits++;
      say((label ? label + ' ' : '+') + (label ? '' : pts) + (label ? '+' + pts : ''), x, 3.4, z, col, big * (pts >= 5 ? 1.3 : 1));
      if (combo > 0 && combo % 5 === 0) { say(`COMBO x${combo}!`, 0, 5.6, z - 0.5, '#ff9a3a', 1.5); audio.sfx('powerup', { vol: 0.5 }); ctx.shake(0.25); W.cheerGnomes(1.0); }
      // team-bonus: twee verschillende spelers scoren vlak na elkaar
      if (lastScorer.i >= 0 && lastScorer.i !== p.i && T - lastScorer.t < 0.38) { score += 2; teamBonuses++; say('TEAM! +2', x, 4.4, z, '#8dffd8', 1.1); audio.sfx('ding', { vol: 0.5 }); lastScorer = { t: -9, i: -1 }; } else lastScorer = { t: T, i: p.i };
      return pts;
    }
    function penalty(p, pts, secs, x, z, why) {
      score = Math.max(0, score + pts); p.score += pts; combo = 0; timeLeft -= secs;
      say(`${pts}  -${secs}s`, x, 3.6, z, '#ff5a5a', 1.3); hud.toast(why, 1500);
    }

    // ---------- inslag ----------
    function impact(p) {
      const h = holeAt(p.col, p.row); h.shake = 1;
      const x = h.x, z = h.z; p.swings++;
      fx.particles.dust(x, 0.25, z + 0.9, 5, 0xb89a70);
      // reuzenmol?
      if (giant.state !== 'free' && giant.cells && giant.cells.includes(h) && (giant.state === 'up' || (giant.state === 'rise' && giant.r > 0.6))) { hitGiant(p, h); return; }
      const a = pool.find((q) => q.hole === h && hittable(q));
      if (!a) { whiffs++; p.misses++; combo = 0; audio.sfx('thud', { vol: 0.45 }); fx.particles.ring(x, 0.3, z, { count: 12, speed: 3.2, color: 0xc8a878, size: 0.2, life: 0.35 }); return; }
      const k = a.kind;
      if (k === 'bomb') {
        bombsHit++; audio.sfx('explode', { vol: 0.9 }); ctx.shake(0.8);
        fx.particles.burst(x, 1.2, z, { count: 40, speed: 7, up: 1.1, life: 0.9, size: 0.5, colors: [0xff9a2a, 0xffd23f, 0x333333, 0xff4a2a], gravity: 8 });
        penalty(p, -3, 3, x, z, 'BOEM! De bom-mol ontploft: -3 punten en -3 seconden');
        free(a); p.stun = 1.0; p.c.pose = 'scared'; W.borisReact('scared', 1.4); return;
      }
      if (k === 'hedgehog') {
        hedgeHit++; audio.sfx('hurt', { vol: 0.8 }); ctx.shake(0.5);
        fx.particles.burst(x, 1.0, z, { count: 18, speed: 5, up: 1.2, life: 0.8, size: 0.3, colors: [0x5a4028, 0xa8835a, 0xffffff], gravity: 10 });
        penalty(p, -3, 2, x, z, 'AU! Stekelvarken: -3 punten en -2 seconden');
        a.state = 'bonk'; a.t = 0; a.bonkT = 0.2; p.stun = 1.5; p.c.pose = 'scared'; W.borisReact('scared', 1.2); return;
      }
      if (k === 'helmet' && a.hp > 1) {
        a.hp--; say('KLANG!', x, 3.2, z, '#cfe6ff', 1.2); audio.sfx('ding', { vol: 0.6, rate: 0.7 }); audio.sfx('hit', { vol: 0.6 }); ctx.shake(0.2);
        a.body.scale.set(1.25, 0.6, 1.25); a.helmet.rotation.z = 0.35; a.t = 0; a.upT += 0.5;
        fx.particles.burst(x, 1.6, z, { count: 10, speed: 4, up: 1, life: 0.5, size: 0.25, colors: [0xffffff, 0xffe14a, 0xb7bcc6], gravity: 8 });
        combo++; lastHitT = T; return;
      }
      // normale treffers
      const base = KIND[k].pts;
      a.state = 'bonk'; a.t = 0; a.bonkT = 0.25;
      if (k === 'golden') { goldenHit++; p.golden++; award(p, base, x, z, 'GOUD!', '#ffe14a', 1.2); audio.sfx('coin'); audio.sfx('sparkle', { vol: 0.6 }); fx.particles.burst(x, 1.5, z, { count: 36, speed: 6, up: 1.2, life: 1, size: 0.35, colors: [0xffe14a, 0xfff2a0, 0xffffff], gravity: 6 }); ctx.shake(0.25); W.borisReact('cheer', 1.2); W.cheerGnomes(1.2); }
      else if (k === 'helmet') { helmetHit++; award(p, base, x, z, 'HELM!', '#ffd27a'); audio.sfx('hit'); audio.sfx('good', { vol: 0.5 }); fx.particles.burst(x, 1.6, z, { count: 18, speed: 5, up: 1.4, life: 0.8, size: 0.3, colors: [0xffc93c, 0xffffff, 0x7a5a46], gravity: 10 }); ctx.shake(0.3); }
      else { molesHit++; award(p, base, x, z, ''); audio.sfx('hit', { vol: 0.7 }); audio.sfx('pop', { vol: 0.4, rate: 1 + Math.min(combo, 12) * 0.06 }); fx.particles.burst(x, 1.3, z, { count: 14, speed: 4.5, up: 1.1, life: 0.7, size: 0.28, colors: [0xffe14a, 0xffffff, 0x7a5a46], gravity: 10 }); ctx.shake(0.12); }
      // sterretjes boven de mol
      for (let s = 0; s < 4; s++) fx.particles.emit(x + Math.cos(s * 1.6) * 0.5, 1.9, z + Math.sin(s * 1.6) * 0.3, Math.cos(s * 1.6) * 1.2, 2.2, Math.sin(s * 1.6) * 0.6, { life: 0.7, size: 0.3, color: 0xfff2a0, gravity: 6 });
    }
    function hitGiant(p, h) {
      const g = giant; ctx.shake(0.35); audio.sfx('thud', { vol: 0.8 });
      const fh = g.firstHit;
      if (fh && fh.p !== p.i && T - fh.t <= GIANT_WINDOW) {
        // gelukt!
        g.firstHit = null; giantsKilled++; p.giants++; pl[fh.p].giants++;
        const bonus = 12; score += bonus; pl[0].lastHitT = pl[1].lastHitT = T; combo += 3; bestCombo = Math.max(bestCombo, combo); lastHitT = T;
        const cx = (g.cells[0].x + g.cells[1].x) / 2, cz = g.cells[0].z;
        say('REUZENMOL VERSLAGEN! +12', cx, 6.2, cz, '#ffe14a', 1.7); audio.sfx('win', { vol: 0.8 }); audio.sfx('explode', { vol: 0.6 }); ctx.shake(1.0);
        fx.particles.burst(cx, 2.2, cz, { count: 90, speed: 9, up: 1.2, life: 1.6, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 7 });
        fx.particles.ring(cx, 0.4, cz, { count: 30, speed: 8, color: 0xffe14a, size: 0.35, life: 0.7 });
        g.state = 'bonk'; g.t = 0; g.bonkT = 0.6; gring.visible = false;
        W.borisReact('cheer', 2); W.cheerGnomes(2.2); pl.forEach((q) => { q.cheer = 1.6; });
        return;
      }
      g.firstHit = { p: p.i, t: T };
      say('NU! ' + names[1 - p.i] + '!', (g.cells[0].x + g.cells[1].x) / 2, 5.6, g.cells[0].z, '#ff7a5a', 1.4); audio.sfx('boing', { vol: 0.6, rate: 0.8 });
      g.body.scale.set(1.12, 0.85, 1.12); fx.particles.burst(h.x, 2.4, h.z, { count: 10, speed: 4, up: 1, life: 0.5, size: 0.3, color: 0xff9a5a, gravity: 6 });
      gring.visible = true; gring.userData.t0 = T;
    }

    function startGiant() {
      // kies twee naast elkaar liggende gaten zonder bezetting
      const options = []; for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) options.push([r, c]);
      options.sort(() => Math.random() - 0.5);
      const [r, c] = options[0]; const a = holeAt(c, r), b = holeAt(c + 1, r);
      for (const q of pool) if (q.hole === a || q.hole === b) { sendDown(q, true); }
      giant.cells = [a, b]; giant.state = 'rise'; giant.t = 0; giant.r = 0; giant.firstHit = null; giant.kind = 'mole'; giant.ph = 0;
      giant.root.visible = true; giant.root.position.set((a.x + b.x) / 2, 0.16, a.z); giant.rise.position.y = -6;
      giantsSeen++; giant.stay = giantIdx === 0 ? 6.2 : 5.4;
      hud.showBig('REUZENMOL!', 1300, '#ff7a5a'); hud.toast(`Mep hem ALLEBEI tegelijk! (binnen 0,4 sec)`, 2600);
      audio.sfx('creak', { vol: 0.5, rate: 1.2 }); ctx.shake(0.6); W.borisReact('scared', 1.4);
      for (let k = 0; k < 14; k++) setTimeout(() => { try { fx.particles.dust(giant.root.position.x + (Math.random() - 0.5) * 3.5, 0.2, giant.root.position.z + (Math.random() - 0.5) * 1.5, 3, 0x9a7650); } catch (e) { /* weg */ } }, k * 40);
    }
    function updateGiant(dt) {
      const g = giant; if (g.state === 'free') { gring.visible = false; return; }
      updateActor(g, dt);
      if (g.state === 'up' && g.t > g.stay) { sendDown(g); gring.visible = false; say('De reuzenmol ontsnapt!', g.root.position.x, 5, g.root.position.z, '#ff9a8a', 1.3); audio.sfx('miss'); g.fails++; }
      if (g.state === 'up' || g.state === 'rise') {
        g.body.rotation.x = 0.22 + Math.sin(g.ph * 3) * 0.04;
        if (g.firstHit) {
          const left = GIANT_WINDOW - (T - g.firstHit.t);
          if (left <= 0) { g.firstHit = null; gring.visible = false; say('Te laat! Samen!', g.root.position.x, 5.2, g.root.position.z, '#ff9a8a', 1.3); audio.sfx('miss', { vol: 0.5 }); }
          else { gring.visible = true; gring.position.set(g.root.position.x, 0.4, g.root.position.z); const k = left / GIANT_WINDOW; gring.scale.setScalar(0.8 + k * 1.1); gring.material.opacity = 0.5 + 0.5 * Math.sin(T * 40); }
        } else gring.visible = false;
      }
    }

    // ---------- spelers bewegen ----------
    function movePlayer(p, dt) {
      const inp = input.p[p.i];
      if (p.stun > 0) { p.stun -= dt; p.heldDir = null; if (p.stun <= 0) p.c.pose = 'idle'; return; }
      let dc = 0, dr = 0;
      if (inp.leftP) dc = -1; else if (inp.rightP) dc = 1; else if (inp.upP) dr = -1; else if (inp.downP) dr = 1;
      const dir = inp.left ? 'l' : inp.right ? 'r' : inp.up ? 'u' : inp.down ? 'd' : null;
      if (!dc && !dr && dir) {
        if (dir === p.heldDir) { p.heldT += dt; if (p.heldT > 0.28) { p.heldT -= 0.12; if (dir === 'l') dc = -1; else if (dir === 'r') dc = 1; else if (dir === 'u') dr = -1; else dr = 1; } } else { p.heldDir = dir; p.heldT = 0; }
      } else if (!dir) { p.heldDir = null; p.heldT = 0; } else if (dc || dr) { p.heldDir = dir; p.heldT = 0; }
      if (dc || dr) {
        const nc = clamp(p.col + dc, 0, COLS - 1), nr = clamp(p.row + dr, 0, ROWS - 1);
        if (nc !== p.col || nr !== p.row) { p.col = nc; p.row = nr; audio.sfx('step', { vol: 0.5 }); fx.particles.dust(HX[nc], 0.2, HZ[nr] - STAND, 2, 0xb89a70); }
        else audio.sfx('click', { vol: 0.15 });
      }
      if (inp.aP && (p.sw < 0 || p.sw > 0.26)) { p.sw = 0; p.impacted = false; p.c.swing(); audio.sfx('swing', { vol: 0.45 }); }
    }

    function updatePlayers(dt, active) {
      pl.forEach((p, i) => {
        const o = pl[1 - i];
        const same = p.col === o.col && p.row === o.row;
        const tx = HX[p.col] + (same ? (i ? 0.62 : -0.62) : 0), tz = HZ[p.row] - STAND;
        const dx = tx - p.px, dz = tz - p.pz; const dist = Math.hypot(dx, dz);
        p.px = damp(p.px, tx, 20, dt); p.pz = damp(p.pz, tz, 20, dt);
        p.c.group.position.set(p.px, 0.16, p.pz);
        p.tag.position.set(p.px, 0.16 + p.c.height * PSCALE + 0.75 + Math.sin(T * 4 + i) * 0.05, p.pz);
        p.c.speed = clamp(dist * 0.9, 0, 1);
        p.c.faceDir(dist > 1.2 ? dx : 0, dist > 1.2 ? dz : 1);
        if (dist <= 1.2) p.c.faceDir(0, 1);
        if (active && p.stun <= 0 && p.cheer <= 0) p.c.pose = 'idle'; else if (p.cheer > 0) { p.cheer -= dt; p.c.pose = 'cheer'; }
        p.c.update(dt);
        // hamer-arm (eigen animatie, zodat de klap snel en zichtbaar is)
        let ang, angZ;
        const rest = -3.0 + Math.sin(T * 3 + i) * 0.05, restZ = -0.55;
        if (p.stun > 0) { ang = -1.4; angZ = -0.1; }
        else if (p.sw >= 0) {
          p.sw += dt; const t = p.sw;
          if (t < 0.065) { ang = lerp(rest, -3.2, t / 0.065); angZ = lerp(restZ, -0.4, t / 0.065); }
          else if (t < IMPACT) { const k = (t - 0.065) / (IMPACT - 0.065); ang = lerp(-3.2, -1.0, k); angZ = lerp(-0.4, -0.08, k); }
          else { if (!p.impacted && active) { p.impacted = true; impact(p); } if (t < 0.27) { ang = -1.0; angZ = -0.08; } else if (t < 0.5) { const k = (t - 0.27) / 0.23; ang = lerp(-1.0, rest, k); angZ = lerp(-0.08, restZ, k); } else { ang = rest; angZ = restZ; p.sw = -1; } }
          if (!active) { p.impacted = true; }
        } else { ang = rest; angZ = restZ; }
        p.c.armR.rotation.x = ang; p.c.armR.rotation.z = angZ;
        p.c.armL.rotation.x = -0.4; p.c.armL.rotation.z = 0.2;
        // cursor
        const h = holeAt(p.col, p.row);
        p.ring.position.set(h.x, 0.34, h.z); p.ring.scale.setScalar(1 + Math.sin(T * 6 + i * 2) * 0.04);
        p.ring.rotation.z += dt * (i ? -1 : 1);
        p.arrow.position.set(h.x + (same ? (i ? 0.5 : -0.5) : 0), 2.9 + Math.sin(T * 6 + i) * 0.2, h.z + 0.9);
        // knop op stun
        if (p.stun > 0 && Math.random() < dt * 12) fx.particles.emit(p.px + (Math.random() - 0.5) * 0.8, p.c.height + 0.5, p.pz, (Math.random() - 0.5) * 1.5, 1, (Math.random() - 0.5) * 1.5, { life: 0.5, size: 0.25, color: 0xffe14a, gravity: 3 });
      });
    }

    // ---------- spawn-logica ----------
    function maybeSpawn(dt) {
      const L = clamp(T / DURATION, 0, 1);
      spawnT -= dt;
      const maxActive = 3 + Math.floor(L * 4);
      const act = pool.filter((a) => a.state !== 'free' && !a.demo).length;
      if (spawnT > 0 || act >= maxActive) return;
      spawnT = lerp(0.78, 0.27, Math.pow(L, 0.85)) * rand(0.75, 1.25) / Math.min(1.3, ctx.difficulty * 0.9 + 0.1);
      const frees = W.holes.filter((h) => !occupied(h)); if (!frees.length) return;
      const h = pick(frees);
      const has = (k) => pool.some((a) => a.state !== 'free' && a.kind === k);
      const w = [['mole', 60], ['golden', T > 5 && !has('golden') ? 7 : 0], ['helmet', T > 8 ? 12 + L * 8 : 0], ['bomb', T > 5 && !has('bomb') ? 9 + L * 4 : 0], ['hedgehog', T > 11 && !has('hedgehog') ? 7 : 0]];
      let tot = w.reduce((s, x) => s + x[1], 0), rr = Math.random() * tot, kind = 'mole';
      for (const [k, v] of w) { rr -= v; if (rr <= 0) { kind = k; break; } }
      let upT = lerp(1.5, 0.66, L) * rand(0.85, 1.2); if (kind === 'golden') upT *= 0.6; if (kind === 'bomb' || kind === 'hedgehog') upT *= 1.2; if (kind === 'helmet') upT *= 1.4;
      spawn(kind, h, upT);
    }

    // ---------- loop ----------
    function worldTick(dt) {
      W.update(T + introT, dt);
      placeCam(dt, T + introT);
    }
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt; timeLeft -= dt;
      if (T - lastHitT > 2.8 && combo > 0) { combo = 0; }
      for (const p of pl) movePlayer(p, dt);
      if (giantIdx < GIANT_TIMES.length && T >= GIANT_TIMES[giantIdx] && giant.state === 'free') { startGiant(); giantIdx++; }
      if (giant.state === 'free' || giant.state === 'down') maybeSpawn(dt); else maybeSpawn(dt * 0.4);
      for (const a of pool) updateActor(a, dt);
      updateGiant(dt);
      updatePlayers(dt, true);
      worldTick(dt);
      hud.setTimer(Math.max(0, timeLeft), 10);
      const m = mult();
      hud.setScore(`Punten: ${score}` + (combo >= 3 ? `   🔥 combo ${combo}${m > 1 ? ' (x' + m.toFixed(2).replace(/0$/, '') + ')' : ''}` : ''));
      hud.setPlayerInfo(0, `${pl[0].score} punten`); hud.setPlayerInfo(1, `${pl[1].score} punten`);
      if (timeLeft <= 0) finish();
    }
    function finish() {
      if (done) return; done = true; hud.setTimer(0);
      for (const a of pool) if (a.state !== 'free') free(a);
      if (giant.state !== 'free') free(giant); gring.visible = false;
      const stars = score >= STAR3 ? 3 : score >= STAR2 ? 2 : score >= STAR1 ? 1 : 0;
      pl.forEach((p) => { p.c.pose = stars ? 'cheer' : 'sad'; p.sw = -1; });
      const top = pl[0].score === pl[1].score ? null : (pl[0].score > pl[1].score ? 0 : 1);
      const txt = stars === 3 ? 'Boer Boris huilt van blijdschap: de moestuin is gered!' : stars === 2 ? 'Mooi gewerkt! Er zijn nog maar een paar mollenhopen over.' : stars === 1 ? 'Het ergste is voorkomen, maar de wortels hebben het zwaar...' : 'De mollen hebben de hele moestuin omgeploegd...';
      ctx.finish({ stars, score, summary: `Samen <b>${score}</b> punten! ${molesHit + helmetHit + goldenHit} mollen gemept (${goldenHit} gouden), reuzenmol ${giantsKilled}/${giantsSeen} verslagen. Beste combo: <b>${bestCombo}</b>.${bombsHit + hedgeHit ? ` ${bombsHit + hedgeHit}x per ongeluk de verkeerde geraakt.` : ' Geen enkele bom geraakt!'}<br>${txt}` });
    }
    const STAR1 = 40, STAR2 = 95, STAR3 = 170;
    function resultUpdate(dt) { updatePlayers(dt, false); for (const a of pool) updateActor(a, dt); worldTick(dt); }

    function introUpdate(dt) {
      introT += dt; demoT -= dt;
      if (demoT <= 0) { demoT = 0.9; const h = pick(W.holes); if (!occupied(h) && !pool.some((q) => q.demo && q.state !== 'free' && q.state !== 'down')) spawn(Math.random() < 0.3 ? 'helmet' : 'mole', h, 1.2, true); }
      for (const a of pool) updateActor(a, dt);
      pl.forEach((p) => { p.sw = -1; });
      updatePlayers(dt, true);
      worldTick(dt);
    }
    function clearActors() { for (const a of pool) if (a.state !== 'free') free(a); }

    return {
      update, resultUpdate, introUpdate,
      onCountdown() { clearActors(); },
      onStart() { clearActors(); spawnT = 0.6; },
      dispose() {},
      dbg: {
        spawn: (kind, c, r, upT = 30) => spawn(kind, holeAt(c, r), upT),
        giantNow: () => startGiant(),
        state: () => ({ T, score, combo, bestCombo, timeLeft, done, molesHit, goldenHit, helmetHit, bombsHit, hedgeHit, escaped, teamBonuses, whiffs, giantsKilled, giantsSeen, p: pl.map((p) => ({ col: p.col, row: p.row, stun: p.stun, score: p.score, sw: p.sw })) }),
        actors: () => pool.filter((a) => a.state !== 'free').map((a) => ({ col: a.hole.c, row: a.hole.r, kind: a.kind, state: a.state, r: a.r, hp: a.hp, id: a.id, left: a.upT - a.t })),
        giant: () => (giant.state === 'free' ? null : { state: giant.state, r: giant.r, cells: giant.cells.map((h) => [h.c, h.r]), firstHit: giant.firstHit, left: giant.stay - giant.t }),
      },
    };
  },
};

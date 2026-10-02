import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, mulberry32, smoothstep } from '../engine/util.js';
import { makeBrother, Dragon, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { Terrain, buildBackdrop, buildCastle, makeProjectile, labelSprite, windArrowSprite, buildWindsock, animateWindsock, buildDecor, makeBird } from './tanks_world.js';

// Kanonnenduel — beurtgebaseerd Worms/Tanks-duel op één scherm. Verwoestbaar landschap, wind, gekke projectielen en chaosbeurten.

const X0 = -50, X1 = 50, NCOL = 400, XW = 39;
const CASTLE_X = [-25, 25], BASE_Y = 6.6;
const HP_MAX = 100;
const G0 = 17;
const TURN_TIME = 12;
const SOFT_LIMIT = 98;          // na zoveel seconden spelen eindigt het duel na een volle ronde
const HARD_LIMIT = 150;
const ZP = 0.6;                 // z van projectielen

const TYPES = [
  { id: 'ball', name: 'Kanonskogel', short: 'KOGEL', icon: '⚫', blurb: 'Ouderwets en degelijk.', R: 3.0, dmg: 34, windK: 1.0, crater: 0.85 },
  { id: 'cabbage', name: 'Kool', short: 'KOOL', icon: '🥬', blurb: 'Licht: waait lekker mee met de wind!', R: 3.2, dmg: 32, windK: 2.5, crater: 0.8 },
  { id: 'cow', name: 'Koe', short: 'KOE', icon: '🐄', blurb: 'Stuitert twee keer en ontploft dan. Boe!', R: 3.4, dmg: 34, windK: 1.0, crater: 0.8 },
  { id: 'cake', name: 'Taart', short: 'TAART', icon: '🎂', blurb: 'Ontploft in een wolk van confetti!', R: 3.9, dmg: 30, windK: 0.9, crater: 0.55 },
  { id: 'fire', name: 'Vuurbal', short: 'VUURBAL', icon: '🔥', blurb: 'Rolt over de grond op zijn doel af.', R: 3.0, dmg: 34, windK: 0.8, crater: 0.7 },
  { id: 'egg', name: 'Draak-ei', short: 'DRAAK-EI', icon: '🥚', blurb: 'Er komt een mini-draak uit die vuur spuwt!', R: 2.2, dmg: 14, windK: 1.0, crater: 0.5 },
];
const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

const CHAOS = [
  { id: 'storm', name: 'ORKAAN!', desc: 'De wind blaast keihard!', color: '#9fd8ff' },
  { id: 'giant', name: 'REUZEN-KNAL!', desc: 'Alle projectielen zijn reusachtig!', color: '#ffb84a' },
  { id: 'flip', name: 'OMGEKEERDE ZWAARTEKRACHT!', desc: 'Alles valt naar boven. Richt omlaag!', color: '#d89cff' },
  { id: 'sim', name: 'TEGELIJK SCHIETEN!', desc: 'Allebei richten en schieten tegelijk!', color: '#ff7a7a' },
];

export default {
  id: 'tanks',
  name: 'Kanonnenduel',
  giver: 'Kanonnier Knal',
  icon: '💥',
  mode: 'pvp',
  time: 100,
  pay: 1,
  music: 'game_minor',
  twists: ['invert', 'swapab', 'drunk', 'lowgrav', 'bodyswap'],
  blurb: 'Twee kastelen, twee kanonnen en één heuvelachtig landschap! Om de beurt schiet je met <b>gekke projectielen</b> (kool, koe, taart, draken-ei...). Elke inslag maakt een <b>krater</b>. Let op de <b>wind</b>! Wie het kasteel van de ander <b>drie keer raakt</b> (100 punten schade) wint. Elke 4e beurt is een <b>chaosbeurt</b>.',
  controls: ['{move} richten: omhoog/omlaag = hoek, naar de vijand toe/terug = kracht', '{a} schieten (even ingedrukt houden = krachtmeter, loslaten = knal)'],
  tip: 'Je instelling blijft staan. Een treffer midden op het kasteel is 34 schade; stuiterende koeien en rollende vuurballen kunnen om een heuvel heen! Hoe verder je achterligt, hoe groter je knal (en soms een extra schot).',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pvp = ctx.pvp;
    const names = players.map((p) => p.name);
    const rng = ctx.rng;
    const L = ctx.lights('day', { fog: false, shadow: 40, center: [0, 8, 0] });
    L.sun.castShadow = false; L.sun.position.set(-25, 42, 55); L.sun.intensity = 2.2; L.hemi.intensity = 1.25;
    const baseSun = L.sun.intensity, baseHemi = L.hemi.intensity;
    camera.fov = 34; camera.updateProjectionMatrix();
    const GS = pvp.gravity;                         // twist: maanzwaartekracht
    const VSCALE = Math.sqrt(GS);
    const wrng = mulberry32((rng() * 1e9) | 0);

    // ------------------------------------------------------------ wereld
    const bg = buildBackdrop(scene);
    const terrain = new Terrain(scene, { x0: X0, x1: X1, n: NCOL });
    {
      const ph1 = wrng() * TAU, ph2 = wrng() * TAU, ph3 = wrng() * TAU, mid = 2.6 + wrng() * 3.4, mid2 = (wrng() - 0.5) * 3;
      for (let i = 0; i <= NCOL; i++) {
        const x = terrain.xAt(i);
        let h = 4.4 + 1.7 * Math.sin(x * 0.17 + ph1) + 1.0 * Math.sin(x * 0.41 + ph2) + 0.45 * Math.sin(x * 0.9 + ph3);
        h += mid * Math.exp(-(((x - mid2) / 7.5) ** 2));
        const e = Math.max(0, Math.abs(x) - 33); h += e * e * 0.12;
        for (const cx of CASTLE_X) { const d = Math.abs(x - cx); const w = smoothstep(8, 4.3, d); h = lerp(h, BASE_Y, w); if (d <= 4.3) terrain.lockMin[i] = BASE_Y - 0.15; }
        terrain.h[i] = clamp(h, 1.2, 15);
      }
      terrain.rebuild();
    }
    const decor = buildDecor(scene, terrain, wrng, CASTLE_X);
    // wolken
    const clouds = [];
    for (let i = 0; i < 9; i++) { const c = P.cloud(1.2 + wrng() * 1.6); c.position.set(-80 + wrng() * 160, 22 + wrng() * 12, -14 - wrng() * 30); scene.add(c); clouds.push({ c, sp: 0.6 + wrng() * 0.8 }); }
    const birds = [];
    for (let i = 0; i < 5; i++) { const b = makeBird(); b.position.set(-60 + wrng() * 120, 16 + wrng() * 12, -18 - wrng() * 10); b.scale.setScalar(1.3 + wrng()); scene.add(b); birds.push({ b, sp: 2.5 + wrng() * 2, ph: wrng() * 6 }); }
    // windzak + windpijl
    const sock = buildWindsock(); sock.position.set(0, terrain.heightAt(0), -0.2); scene.add(sock);
    const arrow = windArrowSprite(); arrow.position.set(0, 22, -6); scene.add(arrow);

    // ------------------------------------------------------------ kastelen en spelers
    const SIDE = [1, -1];
    const castles = [0, 1].map((i) => {
      const cx = CASTLE_X[i];
      const cs = buildCastle(PLAYER_COLORS[i], SIDE[i]);
      cs.group.position.set(cx, BASE_Y - 0.1, 0); scene.add(cs.group);
      const c = makeBrother(i); c.group.scale.setScalar(1.7); c.group.position.set(cx - SIDE[i] * 1.55, BASE_Y + 5.3, 0.5); scene.add(c.group);
      c.faceDir(SIDE[i] * 0.7, 0.8);
      // hp-balk
      const bar = new THREE.Group(); bar.position.set(cx, BASE_Y + 13.3, 1.2); scene.add(bar);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.95), new THREE.MeshBasicMaterial({ color: 0x1a1020, transparent: true, opacity: 0.8, depthTest: false })); back.renderOrder = 21; bar.add(back);
      const chip = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false })); chip.renderOrder = 22; bar.add(chip);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, depthTest: false })); fill.renderOrder = 23; bar.add(fill);
      const lab = labelSprite(`${names[i]}  100`, players[i].css, { w: 320, h: 80, size: 46, scaleX: 5.2 }); lab.position.set(0, 1.35, 0); bar.add(lab);
      // krachtmeter bij het kanon
      const pm = new THREE.Group(); pm.position.set(cx + SIDE[i] * 1.3, BASE_Y + 9.3, 1.2); pm.visible = false; scene.add(pm);
      const pmBack = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.55), new THREE.MeshBasicMaterial({ color: 0x120a1a, transparent: true, opacity: 0.85, depthTest: false })); pmBack.renderOrder = 21; pm.add(pmBack);
      const pmFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.34), new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, depthTest: false })); pmFill.renderOrder = 22; pm.add(pmFill);
      const turnTag = labelSprite('', '#fff', { w: 300, h: 80, size: 40, scaleX: 6.4 }); turnTag.position.set(cx, BASE_Y + 16.6, 1.2); turnTag.visible = false; scene.add(turnTag);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9, depthTest: false })); ring.renderOrder = 20; ring.position.set(cx + SIDE[i] * 1.3, BASE_Y + 6.25, 1.0); ring.visible = false; scene.add(ring);
      return {
        i, cx, cs, c, bar, fill, chip, lab, pm, pmFill, turnTag, ring, hp: HP_MAX, shownHp: HP_MAX, chipHp: HP_MAX, side: SIDE[i],
        x0: cx - 4.0, x1: cx + 4.0, y0: BASE_Y - 0.6, y1: BASE_Y + 6.8, dmgLevel: 0, towerFall: [0, 0], ko: false, koT: 0, smokeT: 0, poseT: 0, pose: 'idle',
        pivot: new THREE.Vector3(cx + SIDE[i] * 1.3, BASE_Y - 0.1 + 6.25, 0.2), recoil: 0, fling: null,
        rubble: Array.from({ length: 7 }, (_, k) => { const r = P.rock(0.7 + (k % 3) * 0.35, k % 2 ? 0x8a8c94 : 0x6e6a66); r.position.set(cx + (k - 3) * 0.95, BASE_Y + 0.5 + (k % 2) * 0.2, 0.5 + (k % 3 - 1) * 0.7); r.visible = false; scene.add(r); return r; }),
      };
    });
    const protectRing = [];  // (gereserveerd)

    // krachtmeter-/banenvoorspelling
    const prevGeo = new THREE.BufferGeometry(); const NPREV = 22; const prevPos = new Float32Array(NPREV * 3);
    prevGeo.setAttribute('position', new THREE.BufferAttribute(prevPos, 3));
    const prevDots = [0, 1].map((i) => { const pts = new THREE.Points(prevGeo.clone(), new THREE.PointsMaterial({ color: i ? 0x9fc4ff : 0x9fffbf, size: 0.5, sizeAttenuation: true, depthTest: false, transparent: true, opacity: 0.9 })); pts.frustumCulled = false; pts.renderOrder = 19; pts.visible = false; scene.add(pts); return pts; });

    // ------------------------------------------------------------ toestand
    const pl = [0, 1].map((i) => ({ i, name: names[i], side: SIDE[i], ang: 45, pow: 62, angN: 45, angF: -22, type: TYPES[0], lastType: -1, fired: false, locked: false, aDown: false, aHold: 0, charging: false, chg: 8, chgDir: 1, holdY: 0, holdX: 0, dealt: 0, hits: 0, bestMiss: 999, shots: 0, extra: 0, comebackCd: 0, boosted: false, lock: 0, autoShot: false }));
    const S = { phase: 'intro', t: 0, turn: 0, shooters: [0], sim: false, chaos: null, wind: 0, gdir: 1, aimT: TURN_TIME, after: 0, nextShooter: rng() < 0.5 ? 0 : 1, bag: [], koWinner: -1, over: false, gameT: 0, giant: false, ended: false, endT: 0, lastChaosAt: 0 };
    let T = 0, introT = 0, done = false;
    const projs = []; const dragons = []; const flames = [];
    const sleepers = { camX: 0, camZoom: 1, lightK: 0 };
    function typeFor(p) { let t; do { t = pick(TYPES); } while (t === p.lastType); p.lastType = t; return t; }

    // ------------------------------------------------------------ hulp
    const wp = (x, y, z = ZP) => ({ x, y, z });
    function castleDist(x, y, c) {
      const dx = Math.max(c.x0 - x, 0, x - c.x1), dy = Math.max(c.y0 - y, 0, y - c.y1);
      return Math.hypot(dx, dy);
    }
    function castleAt(x, y, r, skip = -1) { for (const c of castles) { if (c.ko || c.i === skip) continue; if (x > c.x0 - r && x < c.x1 + r && y > c.y0 - r && y < c.y1 + r) return c; } return null; }
    function windAcc(pr) { return S.wind * 0.12 * pr.type.windK * (0.5 + 0.5 * GS); }
    function gravAcc() { return G0 * GS * S.gdir; }

    // ------------------------------------------------------------ projectielen afvuren
    function muzzle(p) {
      const c = castles[p.i], a = p.ang * Math.PI / 180;
      return { x: c.pivot.x + p.side * Math.cos(a) * 2.7, y: c.pivot.y + Math.sin(a) * 2.7, dx: p.side * Math.cos(a), dy: Math.sin(a) };
    }
    function launchSpeed(pow) { return (8 + pow * 0.26) * VSCALE; }
    function spawnProjectile(p, type, pow, ang) {
      const a = ang * Math.PI / 180, v = launchSpeed(pow);
      const m = muzzle({ i: p.i, ang, side: p.side });
      const g = makeProjectile(type.id);
      const giant = S.chaos && S.chaos.id === 'giant';
      const sc = (giant ? 2.2 : 1) * 1.7;
      g.scale.setScalar(sc); g.position.set(m.x, m.y, ZP); scene.add(g);
      const boost = p.boosted ? 1.25 : 1;
      const pr = {
        owner: p.i, type, g, x: m.x, y: m.y, vx: p.side * Math.cos(a) * v, vy: Math.sin(a) * v, rad: g.userData.radius * sc, scale: sc,
        R: type.R * (giant ? 1.6 : 1) * boost, dmg: type.dmg, state: 'fly', t: 0, contacts: 0, trailT: 0, spin: (type.id === 'cow' ? 3 : 7) * (rng() < 0.5 ? -1 : 1), rot: 0, rollT: 0, slowT: 0, wob: 0, dead: false, bestD: 999, scT: 0,
      };
      projs.push(pr); return pr;
    }
    function fire(p) {
      if (p.fired) return;
      p.fired = true; p.shots++;
      const c = castles[p.i];
      p.c = c;
      const pow = p.charging ? p.chg : p.pow;
      p.pow = pow; p.charging = false; p.aDown = false;
      const ang = p.ang;
      const launch = () => {
        const pr = spawnProjectile(p, p.type, pow, ang);
        const m = muzzle(p);
        c.recoil = 1;
        audio.sfx('explode', { vol: 0.5, rate: 1.6 }); audio.sfx('whoosh', { vol: 0.5 });
        fx.particles.burst(m.x, m.y, ZP, { count: 18, speed: 5, up: 0.4, life: 0.5, size: 0.55, colors: [0xffffff, 0xffd060, 0xaaaaaa], gravity: -0.5 });
        fx.particles.burst(m.x, m.y, ZP, { count: 10, speed: 7, up: 0.3, life: 0.35, size: 0.4, colors: [0xffa030, 0xffe27a], gravity: 0 });
        ctx.shake(0.28); castles[p.i].c.swing(); pr.sfxT = 0;
        S.phase = 'fly'; S.after = 0;
        return pr;
      };
      if (S.sim) {
        p.locked = true; p.pending = { pow, ang };
        fx.texts.add('KLAAR!', c.pivot.x, c.pivot.y + 3, 1.2, players[p.i].css, 1.0); audio.sfx('click');
        if (pl.every((q) => q.locked || q.fired === false && false)) { /* alle spelers klaar -> launch in updateAim */ }
        return;
      }
      launch();
    }
    function launchPending() {
      for (const p of pl) {
        if (!p.pending) continue;
        const { pow, ang } = p.pending; p.pending = null;
        const c = castles[p.i]; const pr = spawnProjectile(p, p.type, pow, ang); const m = muzzle({ i: p.i, ang, side: p.side });
        c.recoil = 1; audio.sfx('explode', { vol: 0.5, rate: 1.6 }); audio.sfx('whoosh', { vol: 0.5 });
        fx.particles.burst(m.x, m.y, ZP, { count: 18, speed: 5, up: 0.4, life: 0.5, size: 0.55, colors: [0xffffff, 0xffd060, 0xaaaaaa], gravity: -0.5 });
        ctx.shake(0.28); c.c.swing();
      }
      S.phase = 'fly'; S.after = 0;
    }

    // ------------------------------------------------------------ explosies en schade
    function dirtBurst(x, y, n, big) {
      fx.particles.burst(x, y, ZP, { count: n, speed: 6 * big, up: 1.2, life: 1.1, size: 0.5, colors: [0x7a5a38, 0x8a6a46, 0x5a4028, 0x6aa84a], gravity: 14 });
    }
    function explode(pr, x, y, opts = {}) {
      const type = pr.type, R = opts.R ?? pr.R, big = R / 3;
      const hitCastle = castleAt(x, y, 0.3);
      // krater
      const cr = R * type.crater;
      if (terrain.carve(x, y, cr)) { /* geometrie wordt in update herbouwd */ }
      // effecten
      if (type.id === 'cake') {
        fx.particles.burst(x, y + 0.3, ZP, { count: 90, speed: 9 * big, up: 1.6, life: 2.0, size: 0.34, colors: [0xff5a9a, 0xffd23f, 0x4aa8ff, 0x6aff8a, 0xffffff, 0xb06aff], gravity: 5 });
        fx.particles.burst(x, y, ZP, { count: 30, speed: 6, up: 1, life: 0.9, size: 0.7, colors: [0xffffff, 0xfff0d8, 0xffc8dc], gravity: 3 });
        fx.texts.add('PLATS!', x, y + 3.2, 1.2, '#ff9ac8', 1.2); audio.sfx('pop', { vol: 0.9, rate: 0.7 }); audio.sfx('sparkle', { vol: 0.8 });
        audio.tone(300, 0.25, { type: 'square', vol: 0.12, slide: 120 });
      } else if (type.id === 'cabbage') {
        fx.particles.burst(x, y, ZP, { count: 50, speed: 8 * big, up: 1.4, life: 1.2, size: 0.45, colors: [0x9ed36a, 0x6fb04a, 0xdff3a8, 0x4a8a30], gravity: 10 });
        fx.particles.burst(x, y, ZP, { count: 20, speed: 5, up: 1, life: 0.7, size: 0.8, colors: [0xffd070, 0xff9a3a], gravity: 0 });
        fx.texts.add('KOOL-KNAL!', x, y + 3.2, 1.2, '#b8f080', 1.1); audio.sfx('explode', { vol: 0.8, rate: 1.2 });
      } else if (type.id === 'cow') {
        fx.particles.burst(x, y, ZP, { count: 60, speed: 8 * big, up: 1.4, life: 1.3, size: 0.5, colors: [0xffffff, 0x2b2b2b, 0xffe27a, 0xff8a3a], gravity: 8 });
        fx.texts.add('MUUU-BOEM!', x, y + 3.2, 1.2, '#ffffff', 1.2); audio.sfx('explode', { vol: 0.9 }); audio.tone(150, 0.7, { type: 'sawtooth', vol: 0.18, slide: 70, filter: 700 });
      } else if (type.id === 'fire') {
        fx.particles.burst(x, y, ZP, { count: 80, speed: 9 * big, up: 1.3, life: 1.3, size: 0.65, colors: [0xff7a1a, 0xffc93a, 0xff4a1a, 0xffe27a], gravity: 3 });
        fx.texts.add('WHOEMF!', x, y + 3.2, 1.2, '#ffb04a', 1.2); audio.sfx('explode', { vol: 1 });
      } else if (type.id === 'egg') {
        fx.particles.burst(x, y, ZP, { count: 40, speed: 6, up: 1.4, life: 1.0, size: 0.5, colors: [0xffffff, 0xf4eecf, 0xff9a3a, 0x7a46d4], gravity: 8 });
        audio.sfx('explode', { vol: 0.6, rate: 1.3 });
      } else {
        fx.particles.burst(x, y, ZP, { count: 70, speed: 9 * big, up: 1.3, life: 1.2, size: 0.65, colors: [0xffe27a, 0xff9a3a, 0xff5a1a, 0x666666], gravity: 3 });
        fx.texts.add('BOEM!', x, y + 3.2, 1.2, '#ffd24a', 1.2); audio.sfx('explode', { vol: 1 }); audio.sfx('thud', { vol: 0.8 });
      }
      if (type.id !== 'cake') fx.particles.ring(x, y, ZP, { count: 22, speed: 8 * big, color: 0xffe8b0, size: 0.4, life: 0.5 });
      fx.particles.burst(x, y, ZP, { count: 16, speed: 3, up: 0.5, life: 1.8, size: 1.2, colors: [0x555555, 0x777777], gravity: -1.4 });
      dirtBurst(x, y, 34, big);
      ctx.shake(clamp(0.35 + R * 0.12, 0.3, 0.9));
      // schade aan kastelen
      let hit = false;
      for (const c of castles) {
        if (c.ko) continue;
        const d = castleDist(x, y, c);
        if (c.i !== pr.owner) pr.bestD = Math.min(pr.bestD, d);
        const dm = Math.round((opts.dmg ?? pr.dmg) * clamp(1 - d / R, 0, 1) * (opts.mult || 1));
        if (dm >= 1) { damage(c, dm, pr.owner, d < 0.5); hit = true; }
      }
      const owner = pl[pr.owner];
      owner.bestMiss = Math.min(owner.bestMiss, pr.bestD);
      if (!hit) { audio.sfx('miss', { vol: 0.35 }); if (pr.bestD < 6 && pr.bestD >= 0.5) fx.texts.add('Op een haar!', x, y + 5, 1.2, '#ffffff', 0.9); }
      // decor weg als het in de krater ligt
      for (const d of decor) { if (!d.obj.visible) continue; if (Math.abs(d.x - x) < cr + 0.4 && terrain.heightAt(d.x) < d.obj.position.y - 0.6) { d.obj.visible = false; fx.particles.burst(d.x, d.obj.position.y + 1, ZP, { count: 10, speed: 4, up: 1, life: 0.8, size: 0.4, colors: [0x4aa83a, 0x8a6a46], gravity: 10 }); } }
      pr.dead = true; scene.remove(pr.g);
    }
    function damage(c, dm, by, direct) {
      if (c.ko) return;
      dm = Math.min(dm, c.hp); c.hp -= dm;
      const att = pl[by]; 
      if (c.i !== by) { att.dealt += dm; if (direct || dm >= 20) att.hits++; }
      fx.texts.add(`-${dm}`, c.cx, BASE_Y + 9, 1.4, c.i === by ? '#ff8a8a' : '#ff5a5a', 1.5 + dm / 50);
      c.pose = 'scared'; c.poseT = 1.3; audio.sfx('hit', { vol: 0.8 });
      if (c.i !== by) { const sh = castles[by]; sh.pose = dm >= 18 ? 'cheer' : 'idle'; sh.poseT = 1.5; }
      else { fx.texts.add('Auw! Eigen kasteel!', c.cx, BASE_Y + 11, 1.2, '#ffd24a', 0.9); }
      fx.particles.burst(c.cx + rand(-2, 2), BASE_Y + 4, ZP + 1.5, { count: 26, speed: 6, up: 1.5, life: 1.0, size: 0.6, colors: [0x9b9ca3, 0x7e7e86, 0xb0a090], gravity: 14 });
      const lvl = c.hp <= 0 ? 3 : c.hp <= 34 ? 2 : c.hp <= 67 ? 1 : 0;
      while (c.dmgLevel < lvl && c.dmgLevel < 2) { c.dmgLevel++; c.towerFall[c.dmgLevel - 1] = 0.001; audio.sfx('thud', { vol: 0.9 }); ctx.shake(0.7); }
      if (c.hp <= 0) { c.ko = true; c.koT = 0; S.koCount = (S.koCount || 0) + 1; c.fling = { x: c.c.group.position.x, y: c.c.group.position.y, vx: -c.side * 6 + rand(-1, 1), vy: 15, rot: 0, landed: false, t: 0 }; }
      refreshHud();
    }

    // ------------------------------------------------------------ draken
    function hatch(pr, x, y) {
      const dir = pr.owner === 0 ? 1 : -1;
      const d = new Dragon([0x4aa84a, 0x7a46d4, 0xd8742a][Math.floor(rng() * 3)], 0.42);
      const holder = new THREE.Group(); holder.add(d.group); holder.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(holder);
      const dr = { d, holder, x, y, dir, owner: pr.owner, t: 0, fireT: 0, dmgT: 0, life: 5.2, state: 'pop' };
      holder.scale.setScalar(0.01); holder.position.set(x, y, ZP);
      dragons.push(dr);
      fx.particles.burst(x, y + 0.5, ZP, { count: 36, speed: 6, up: 1.4, life: 1.0, size: 0.5, colors: [0xffffff, 0xf4eecf, 0xff9a3a, 0xffe27a], gravity: 8 });
      fx.texts.add('KRAAK!', x, y + 3.2, 1.2, '#fff0b0', 1.1);
      audio.sfx('pop', { vol: 0.8, rate: 0.8 }); audio.tone(240, 0.5, { type: 'sawtooth', vol: 0.16, slide: 700, filter: 1200 }); ctx.shake(0.35);
      pr.dead = true; scene.remove(pr.g);
    }
    function stepDragon(dr, dt) {
      dr.t += dt; dr.d.update(dt);
      const sc = Math.min(1, dr.t / 0.35); dr.holder.scale.setScalar(Math.max(0.01, sc * (1 + Math.sin(dr.t * 20) * (dr.t < 0.5 ? 0.15 : 0))));
      const enemy = castles[1 - dr.owner];
      const distE = enemy.cx - dr.x; const near = Math.abs(distE) < 12 && !enemy.ko;
      const touching = castleDist(dr.x, dr.y + 0.5, enemy) < 2.6;
      if (dr.t > 0.5 && !touching && dr.life > 0.8) { dr.x += dr.dir * 3.4 * dt; }
      dr.y = terrain.heightAt(dr.x);
      dr.holder.position.set(dr.x, dr.y + 0.4 + Math.abs(Math.sin(dr.t * 9)) * 0.15, ZP);
      dr.life -= dt;
      if (dr.life < 0.8) dr.holder.scale.setScalar(Math.max(0.01, dr.holder.scale.x - dt * 1.2));
      // vuur spuwen als hij dichtbij de vijand is
      const fireOn = dr.t > 0.8 && dr.life > 0.7 && (near || dr.t > 3.8);
      if (fireOn) {
        dr.fireT -= dt;
        const mx = dr.x + dr.dir * 1.25, my = dr.y + 1.35;
        if (dr.fireT <= 0) { dr.fireT = 0.03; for (let k = 0; k < 3; k++) fx.particles.emit(mx, my, ZP, dr.dir * rand(9, 13), rand(-0.5, 1.2), rand(-0.6, 0.6), { life: rand(0.35, 0.6), size: rand(0.5, 0.95), color: [0xff4a1a, 0xff9a1a, 0xffd23f, 0xff7a1a][Math.floor(rng() * 4)], gravity: -1 }); }
        if (Math.random() < dt * 4) audio.tone(rand(90, 140), 0.25, { type: 'sawtooth', vol: 0.07, filter: 600 });
        // schade als de vlam het kasteel kan bereiken
        const reach = castleDist(mx + dr.dir * 4.5, my, enemy) < 1.6 || castleDist(mx, my, enemy) < 5.5 && Math.sign(enemy.cx - mx) === dr.dir;
        dr.dmgT -= dt;
        if (reach && dr.dmgT <= 0 && !enemy.ko) { dr.dmgT = 0.35; damage(enemy, 3, dr.owner, false); fx.particles.burst(enemy.cx - enemy.side * 2.6, BASE_Y + 3.8, ZP + 1.4, { count: 12, speed: 3, up: 1.4, life: 0.8, size: 0.7, colors: [0xff7a1a, 0xffd23f, 0x444444], gravity: -2 }); }
        terrain.scorch(mx + dr.dir * 3, 0.45, 2.0);
      }
      if (dr.life <= 0) {
        fx.particles.burst(dr.x, dr.y + 1, ZP, { count: 30, speed: 4, up: 1, life: 1.0, size: 0.9, colors: [0xdddddd, 0xbbbbbb, 0xffffff], gravity: -0.6 });
        fx.texts.add('POEF!', dr.x, dr.y + 3, 1.2, '#ffffff', 1.0); audio.sfx('pop', { vol: 0.6 });
        scene.remove(dr.holder); return false;
      }
      return true;
    }

    // ------------------------------------------------------------ projectielfysica
    function stepProj(pr, h) {
      const type = pr.type;
      pr.t += h;
      if (pr.state === 'egg') {
        pr.wob += h; pr.g.userData.inner.rotation.z = Math.sin(pr.wob * 22) * 0.3 * Math.min(1, pr.wob * 3);
        if (Math.random() < h * 10) fx.particles.emit(pr.x + rand(-0.3, 0.3), pr.y + 0.6, ZP, rand(-1, 1), rand(1, 2.5), 0, { life: 0.5, size: 0.2, color: 0xffe27a, gravity: 6 });
        if (pr.wob > 1.15) { hatch(pr, pr.x, terrain.heightAt(pr.x)); }
        return;
      }
      if (pr.state === 'roll') {
        const sl = terrain.slopeAt(pr.x);
        pr.vx += (-sl * G0 * 0.45 + pr.dirx * 4.2) * h; pr.vx *= (1 - 0.1 * h);
        pr.x += pr.vx * h; pr.rollT += h;
        pr.y = terrain.heightAt(pr.x) + pr.rad * 0.85;
        const cc = castleAt(pr.x, pr.y, pr.rad * 0.4, pr.t < 0.55 ? pr.owner : -1);
        if (cc || pr.x < -XW + 2 || pr.x > XW - 2 || pr.rollT > 4.4 || (Math.abs(pr.vx) < 1.2 && (pr.slowT += h) > 0.6)) { explode(pr, pr.x, pr.y); return; }
        pr.scT -= h; if (pr.scT <= 0) { pr.scT = 0.12; terrain.scorch(pr.x, 0.5, 1.4); }
        if (Math.random() < h * 70) fx.particles.emit(pr.x - Math.sign(pr.vx) * 0.5, pr.y + rand(-0.2, 0.6), ZP, rand(-1, 1), rand(1, 3), 0, { life: rand(0.3, 0.6), size: rand(0.5, 0.9), color: [0xff7a1a, 0xffc93a, 0xff4a1a][Math.floor(rng() * 3)], gravity: -2 });
        return;
      }
      // vlucht
      pr.vy -= gravAcc() * h; pr.vx += windAcc(pr) * h;
      pr.x += pr.vx * h; pr.y += pr.vy * h;
      if (pr.x < -XW || pr.x > XW || pr.y < -8 || pr.y > 75) { pr.dead = true; scene.remove(pr.g); fx.texts.add('Weg...', clamp(pr.x, -XW + 4, XW - 4), clamp(pr.y, 2, 28), ZP, '#cfcfcf', 0.9); audio.sfx('miss', { vol: 0.4 }); return; }
      const cc = castleAt(pr.x, pr.y, pr.rad * 0.5, pr.t < 0.55 ? pr.owner : -1);
      if (cc) {
        if (type.id === 'egg') { hatch(pr, pr.x, pr.y); return; }
        explode(pr, pr.x, pr.y); return;
      }
      const th = terrain.heightAt(pr.x);
      const low = pr.rad * 0.55;
      if (pr.y - low < th) {
        // inslag op de grond
        if (type.id === 'cow') {
          pr.contacts++;
          if (pr.contacts >= 3) { explode(pr, pr.x, th + 0.3); return; }
          const sl = terrain.slopeAt(pr.x), nl = Math.hypot(sl, 1), nx = -sl / nl, ny = 1 / nl;
          const vn = pr.vx * nx + pr.vy * ny; const e = 0.62;
          pr.vx -= (1 + e) * vn * nx; pr.vy -= (1 + e) * vn * ny; pr.vy = Math.max(pr.vy, 7); pr.vx *= 0.88;
          pr.y = th + low + 0.05;
          audio.tone(rand(130, 170), 0.5, { type: 'sawtooth', vol: 0.15, slide: rand(70, 100), filter: 700 }); audio.sfx('boing', { vol: 0.5 });
          fx.particles.dust(pr.x, th + 0.1, ZP, 8, 0xa08a62); fx.texts.add('MUU!', pr.x, th + 3.5, 1.2, '#ffffff', 0.9); ctx.shake(0.25);
          pr.g.userData.cow && (pr.spin = -pr.spin);
          terrain.carve(pr.x, th + 0.2, 0.9);
          return;
        }
        if (type.id === 'fire') {
          pr.state = 'roll'; pr.dirx = Math.sign(pr.vx) || (pr.owner === 0 ? 1 : -1); pr.vx = pr.dirx * Math.max(Math.abs(pr.vx) * 0.45, 7); pr.vy = 0; pr.rollT = 0;
          fx.particles.burst(pr.x, th + 0.3, ZP, { count: 22, speed: 5, up: 1, life: 0.6, size: 0.6, colors: [0xff7a1a, 0xffc93a], gravity: 4 });
          audio.sfx('sizzle', { vol: 0.8 }); fx.texts.add('Rrrrol!', pr.x, th + 3, 1.2, '#ffb04a', 0.9); return;
        }
        if (type.id === 'egg') {
          pr.state = 'egg'; pr.wob = 0; pr.y = th + 0.55; pr.vx = pr.vy = 0; pr.g.userData.inner.rotation.set(0, 0, 0);
          fx.particles.dust(pr.x, th + 0.1, ZP, 6, 0xa08a62); audio.sfx('thud', { vol: 0.5, rate: 1.5 }); return;
        }
        explode(pr, pr.x, Math.max(th, pr.y - low * 0.5)); return;
      }
    }
    function updateProjectiles(dt) {
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let s = 0; s < n; s++) for (const pr of projs) { if (!pr.dead) stepProj(pr, h); }
      for (let i = projs.length - 1; i >= 0; i--) { if (projs[i].dead) projs.splice(i, 1); }
      for (const pr of projs) {
        pr.g.position.set(pr.x, pr.y, ZP);
        pr.rot += pr.spin * dt;
        if (pr.state === 'fly') {
          const inner = pr.g.userData.inner;
          if (pr.type.id === 'cow') { inner.rotation.z = pr.rot * 0.7; inner.rotation.y = pr.vx > 0 ? 0 : Math.PI; }
          else if (pr.type.id === 'egg') inner.rotation.z = pr.rot * 0.5;
          else inner.rotation.z = pr.rot;
          pr.trailT -= dt;
          if (pr.trailT <= 0) {
            pr.trailT = 0.03;
            const id = pr.type.id;
            const col = id === 'fire' ? [0xff7a1a, 0xffc93a, 0xff4a1a][Math.floor(rng() * 3)] : id === 'cake' ? [0xff5a9a, 0xffd23f, 0x4aa8ff][Math.floor(rng() * 3)] : id === 'cabbage' ? 0xb8e090 : id === 'egg' ? 0xffe27a : 0xdddddd;
            fx.particles.emit(pr.x, pr.y, ZP, rand(-0.5, 0.5), rand(-0.3, 0.6), 0, { life: id === 'fire' ? 0.5 : 0.7, size: (id === 'fire' ? 0.9 : 0.5) * pr.scale, color: col, gravity: id === 'fire' ? -2 : 0 });
          }
        } else if (pr.state === 'roll') {
          pr.g.userData.inner.rotation.z -= pr.vx * dt * 0.6;
        }
        // nul-afstand tot de vijand (voor "op een haar")
        const ec = castles[1 - pr.owner]; if (!ec.ko) pr.bestD = Math.min(pr.bestD, castleDist(pr.x, pr.y, ec));
      }
      for (let i = dragons.length - 1; i >= 0; i--) { if (!stepDragon(dragons[i], dt)) dragons.splice(i, 1); }
    }

    // ------------------------------------------------------------ banenvoorspelling
    function predict(p, ang, pow, collide = false) {
      const out = []; const a = ang * Math.PI / 180, v = launchSpeed(pow);
      const m = muzzle({ i: p.i, ang, side: p.side });
      let x = m.x, y = m.y, vx = p.side * Math.cos(a) * v, vy = Math.sin(a) * v; const wk = p.type.windK;
      const ax = S.wind * 0.12 * wk * (0.5 + 0.5 * GS), ay = -G0 * GS * S.gdir;
      const h = 1 / 120; let t = 0, best = 999, hit = false, endX = x, endY = y;
      for (let k = 0, kmax = collide ? 120 * 9 : 14 * NPREV + 1; k < kmax; k++) {
        vy += ay * h; vx += ax * h; x += vx * h; y += vy * h; t += h;
        if (collide) {
          const ec = castles[1 - p.i]; best = Math.min(best, castleDist(x, y, ec));
          if (castleAt(x, y, 0.3, t < 0.55 ? p.i : -1)) { hit = true; endX = x; endY = y; break; }
          if (y < terrain.heightAt(x) + 0.2 && t > 0.15) { endX = x; endY = y; break; }
          if (x < -XW || x > XW || y < -8 || y > 75) break;
        }
        if (!collide && k % 14 === 13 && out.length < NPREV) out.push([x, y]);
      }
      return { pts: out, best, hit, x: endX, y: endY, t };
    }
    function updatePreview() {
      for (const p of pl) {
        const pts = prevDots[p.i];
        const show = S.phase === 'aim' && S.shooters.includes(p.i) && !p.fired && !p.locked;
        pts.visible = show; if (!show) continue;
        const r = predict(p, p.ang, p.charging ? p.chg : p.pow);
        const arr = pts.geometry.attributes.position.array; const cnt = Math.min(9, r.pts.length);
        for (let k = 0; k < NPREV; k++) { const q = k < cnt ? r.pts[k] : null; arr[k * 3] = q ? q[0] : 0; arr[k * 3 + 1] = q ? q[1] : -99; arr[k * 3 + 2] = ZP; }
        pts.geometry.attributes.position.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------ HUD
    const bar = (v) => { const n = Math.round(v / 10); return '▮'.repeat(n) + '▯'.repeat(10 - n); };
    function refreshHud() {
      const w = S.wind, arrows = Math.abs(w) < 0.5 ? '–' : (w > 0 ? '▶'.repeat(Math.ceil(Math.abs(w) / 4)) : '◀'.repeat(Math.ceil(Math.abs(w) / 4)));
      if (hud.scoreEl) hud.scoreEl.style.whiteSpace = 'nowrap'; hud.setScore(`Beurt ${Math.max(1, S.turn)} · Wind ${arrows} ${Math.abs(Math.round(w))}`);
      for (const p of pl) {
        const c = castles[p.i];
        const active = S.shooters.includes(p.i) && (S.phase === 'aim' || S.phase === 'fly');
        const pw = Math.round(p.charging ? p.chg : p.pow);
        hud.setPlayerInfo(p.i, `Kasteel ${c.hp}/${HP_MAX} · ${active ? `${p.type.icon} ${p.type.short}  Hoek ${Math.round(p.ang)}°  Kracht ${bar(pw)} ${pw}%` : S.phase === 'ko' || S.phase === 'end' ? '' : 'wacht op de beurt...'}`);
      }
    }
    function setHint() {
      if (S.phase !== 'aim') { return; }
      if (S.sim) hud.setHint(`<b>${S.chaos.name}</b> Allebei richten en schieten! ${pl.map((p) => `${names[p.i]}: ${p.type.icon} ${p.type.name}`).join('  ·  ')}`);
      else { const p = pl[S.shooters[0]]; hud.setHint(`<b style="color:${players[p.i].css}">${names[p.i]}</b> is aan de beurt: ${p.type.icon} <b>${p.type.name}</b> — ${p.type.blurb}${S.chaos ? ` · <b>${S.chaos.name}</b>` : ''}${p.extra > 0 ? ' · 🍀 extra schot!' : ''}`); }
    }

    // ------------------------------------------------------------ beurten
    function nextChaos() {
      if (S.forceChaos) { const id = S.forceChaos; S.forceChaos = null; return CHAOS.find((c) => c.id === id); }
      if (S.bag.length === 0) { S.bag = CHAOS.map((c) => c.id).sort(() => rng() - 0.5); }
      const id = S.bag.pop(); return CHAOS.find((c) => c.id === id);
    }
    function rollWind() {
      if (S.chaos && S.chaos.id === 'storm') { const s = rng() < 0.5 ? -1 : 1; return s * Math.round(15 + rng() * 6); }
      let w = Math.round((rng() * 2 - 1) * 9); if (w === 0) w = rng() < 0.5 ? -1 : 1;
      if (Math.abs(w) < 2 && rng() < 0.5) w = Math.sign(w) * 3;
      return w;
    }
    function startTurn(shooterIndex = null, extra = false) {
      if (!extra) {
        S.turn++;
        S.chaos = S.turn % 4 === 0 ? nextChaos() : null;
        S.sim = !!(S.chaos && S.chaos.id === 'sim');
        S.gdir = S.chaos && S.chaos.id === 'flip' ? -1 : 1;
        S.wind = rollWind();
        S.shooters = S.sim ? [0, 1] : [S.nextShooter];
        if (!S.sim) S.nextShooter = 1 - S.nextShooter;
        arrow.userData.draw(S.wind, S.chaos && S.chaos.id === 'storm' ? ' !!!' : '');
      }
      for (const p of pl) { p.fired = false; p.locked = false; p.pending = null; p.charging = false; p.aDown = false; p.aHold = 0; p.holdY = 0; p.holdX = 0; p.lock = 0.55; if (!extra) p.boosted = false; }
      for (const i of S.shooters) {
        const p = pl[i];
        p.type = typeFor(p);
        if (S.gdir < 0) { if (!p.flipped) { p.angN = p.ang; p.ang = p.angF; p.flipped = true; } }
        else if (p.flipped) { p.angF = p.ang; p.ang = p.angN; p.flipped = false; }
        if (!extra && !S.sim) {
          const behind = castles[1 - i].hp - castles[i].hp;   // positief = ik sta achter
          p.comebackCd = Math.max(0, p.comebackCd - 1);
          p.boosted = behind >= 30; p.extra = p.boosted && p.comebackCd <= 0 ? 1 : 0;
          if (p.extra) p.comebackCd = 2;
        }
      }
      S.phase = 'aim'; S.aimT = TURN_TIME; S.after = 0; S.fireDelay = 0;
      // meldingen
      if (!extra) {
        if (S.chaos) { hud.showBig(S.chaos.name, 1500, S.chaos.color); hud.toast(S.chaos.desc, 2600); audio.sfx('bell', { vol: 0.5 }); audio.tone(110, 0.8, { type: 'sawtooth', vol: 0.12, slide: 330, filter: 600 }); }
        else if (S.turn > 1) audio.sfx('select', { vol: 0.5 });
        const p0 = pl[S.shooters[0]];
        if (!S.sim && p0.boosted) { hud.toast(p0.extra ? '🍀 Comeback! Extra schot + grotere knal!' : '🍀 Comeback! Grotere knal!', 2600); fx.texts.add('COMEBACK!', castles[p0.i].cx, BASE_Y + 12, 1.2, '#7aff9a', 1.4); }
      } else { hud.toast('🍀 Extra schot!', 1600); fx.texts.add('EXTRA SCHOT!', castles[S.shooters[0]].cx, BASE_Y + 12, 1.2, '#7aff9a', 1.3); audio.sfx('powerup', { vol: 0.6 }); }
      refreshHud(); setHint();
      for (const c of castles) { c.turnTag.visible = false; }
      for (const i of S.shooters) { const c = castles[i]; c.turnTag.visible = true; c.turnTag.userData.draw(`${pl[i].type.icon} ${pl[i].type.short}`, players[i].css); }
    }
    function endOfShot() {
      // alles is uitgeknald
      hud.setTimer(null);
      if (castles.some((c) => c.ko)) { startKo(); return; }
      const p = pl[S.shooters[0]];
      if (!S.sim && p.extra > 0) { p.extra = 0; startTurn(S.shooters[0], true); return; }
      // einde van het duel door tijd?
      const equal = pl[0].shots === pl[1].shots;
      if ((S.gameT >= SOFT_LIMIT && equal) || S.gameT >= HARD_LIMIT) { decideByPoints(); return; }
      startTurn();
    }
    function winnerByPoints() {
      const a = castles[0].hp, b = castles[1].hp;
      if (a !== b) return a > b ? 0 : 1;
      if (pl[0].dealt !== pl[1].dealt) return pl[0].dealt > pl[1].dealt ? 0 : 1;
      if (Math.abs(pl[0].bestMiss - pl[1].bestMiss) > 0.01) return pl[0].bestMiss < pl[1].bestMiss ? 0 : 1;
      return null;
    }
    function decideByPoints() {
      S.phase = 'ko'; S.endT = 0; S.koWinner = winnerByPoints(); S.byPoints = true;
      hud.showBig('TIJD!', 1300, '#ffe14a'); audio.sfx('bell');
    }
    function startKo() {
      S.phase = 'ko'; S.endT = 0; hud.setHint(null);
      const a = castles[0].ko, b = castles[1].ko;
      if (a && b) S.koWinner = winnerByPoints(); else S.koWinner = a ? 1 : 0;
      if (S.koWinner != null) hud.showBig('KASTEEL VERWOEST!', 1700, '#ff8a5a');
      ctx.shake(1);
    }
    function finishGame() {
      if (done) return; done = true;
      const w = S.koWinner; const l = w == null ? null : 1 - w;
      const dealt = [Math.round(pl[0].dealt), Math.round(pl[1].dealt)];
      let summary;
      if (w == null) summary = 'Precies even sterk! Beide kastelen even beschadigd.';
      else if (S.byPoints) summary = `<b>${names[w]}</b> had na afloop de meeste kasteel over (${castles[w].hp} tegen ${castles[l].hp}).`;
      else summary = pick([`Het kasteel van <b>${names[l]}</b> ligt in puin! <b>${names[w]}</b> wint!`, `<b>${names[w]}</b> blies het kasteel van ${names[l]} van de kaart.`, `Wat een knal! <b>${names[w]}</b> is de kanonnenkoning.`]);
      summary += `<br>Schade: ${names[0]} ${dealt[0]} · ${names[1]} ${dealt[1]}.`;
      S.ended = true;
      ctx.finishPvp({ winner: w, score: dealt, summary, delay: 600 });
    }

    // ------------------------------------------------------------ richten
    function updateAimPlayer(p, dt) {
      if (p.fired || p.locked) return;
      const inp = pvp.input(p.i);
      const dy = Math.abs(inp.y) > 0.25 ? -inp.y : 0;
      p.holdY = dy ? Math.min(1.4, p.holdY + dt) : 0;
      p.ang = clamp(p.ang + dy * dt * (24 + 46 * p.holdY / 1.4), -60, 88);
      const dx = Math.abs(inp.x) > 0.25 ? inp.x * p.side : 0;
      p.holdX = dx ? Math.min(1.4, p.holdX + dt) : 0;
      if (!p.charging) p.pow = clamp(p.pow + dx * dt * (20 + 40 * p.holdX / 1.4), 8, 100);
      p.lock = Math.max(0, p.lock - dt);
      if (p.lock > 0) return;
      if (inp.aP) { p.aDown = true; p.aHold = 0; p.chg = p.pow; p.chgDir = p.pow > 85 ? -1 : 1; }
      if (p.aDown) {
        if (inp.a) {
          p.aHold += dt;
          if (p.aHold > 0.3) {
            if (!p.charging) { p.charging = true; p.chg = 8; p.chgDir = 1; audio.sfx('select', { vol: 0.4 }); }
            p.chg += p.chgDir * dt * 85; if (p.chg >= 100) { p.chg = 100; p.chgDir = -1; } if (p.chg <= 8) { p.chg = 8; p.chgDir = 1; }
            p.tick = (p.tick || 0) - dt; if (p.tick <= 0) { p.tick = 0.08; audio.tone(200 + p.chg * 7, 0.07, { type: 'triangle', vol: 0.06 }); }
          }
        } else { fire(p); }   // losgelaten
      }
    }
    function updateAim(dt) {
      S.aimT -= dt;
      for (const i of S.shooters) updateAimPlayer(pl[i], dt);
      hud.setTimer(S.aimT, 4);
      if (S.aimT <= 0) {
        for (const i of S.shooters) { const p = pl[i]; if (!p.fired) { fx.texts.add('Te laat! Automatisch schot', castles[i].cx, BASE_Y + 11, 1.2, '#ffd24a', 0.9); fire(p); } }
      }
      if (S.sim && S.shooters.every((i) => pl[i].locked)) { hud.setTimer(null); launchPending(); }
      else if (S.sim && S.aimT <= 0) { launchPending(); }
      // alleen een schot gelost (niet-sim)
      if (!S.sim && S.shooters.every((i) => pl[i].fired)) { hud.setTimer(null); }
      if (S.aimT < 4 && S.aimT > 0) { const f = Math.floor(S.aimT * 2); if (f !== S.tickN) { S.tickN = f; audio.sfx('tick', { vol: 0.5 }); } }
      if (S.phase === 'aim') { for (const i of S.shooters) { const p = pl[i]; if (!S.sim && p.fired) { /* fire() zet fase op fly */ } } }
      refreshHud();
    }

    // ------------------------------------------------------------ visuals
    const camP = new THREE.Vector3(0, 14, 70), camL = new THREE.Vector3(0, 10.5, 0);
    function camera_(dt, mode = 0) {
      const aspect = camera.aspect || 1.7;
      const half = 37;
      const dist = Math.max(48, half / (Math.tan(camera.fov * Math.PI / 360) * aspect));
      let tx = 0, zoom = 1, ty = 10.5;
      if (S.phase === 'fly' && projs.length) {
        let fxp = 0, n = 0; for (const pr of projs) { fxp += pr.x; n++; } fxp /= n;
        tx = clamp(fxp * 0.35, -11, 11); zoom = 0.92;
      } else if (S.phase === 'aim' && S.shooters.length === 1) {
        tx = castles[S.shooters[0]].cx * 0.12;
      }
      if (mode === 1) { tx = Math.sin(introT * 0.5) * 7; zoom = 1; }
      if (S.phase === 'ko' || S.phase === 'end') { const w = S.koWinner; const l = w == null ? null : castles[1 - w]; tx = l ? l.cx * 0.55 : 0; zoom = 0.8; }
      sleepers.camX = damp(sleepers.camX, tx, 3, dt); sleepers.camZoom = damp(sleepers.camZoom, zoom, 4, dt);
      const d = dist * sleepers.camZoom;
      camP.set(sleepers.camX, 14.8 - (1 - sleepers.camZoom) * 6, d); camL.set(sleepers.camX, ty, 0);
      camera.position.copy(camP); camera.lookAt(camL);
    }
    function castleVisuals(dt) {
      const t = T + introT;
      for (const c of castles) {
        const cs = c.cs; P.animateBanner(cs.flag, t + c.i);
        // kanon-hoek
        const p = pl[c.i];
        cs.barrel.rotation.z = c.side * (p.ang * Math.PI / 180);
        c.recoil = Math.max(0, c.recoil - dt * 4);
        cs.barrel.position.x = -c.side * c.recoil * 0.5;
        // torens vallen
        for (let k = 0; k < 2; k++) {
          const tw = k === 0 ? cs.towerIn : cs.towerOut;
          if (c.towerFall[k] > 0 && c.towerFall[k] < 1.5) {
            c.towerFall[k] += dt; const f = c.towerFall[k]; tw.rotation.z = -(k === 0 ? c.side : -c.side) * f * f * 1.1; tw.position.y = -f * f * 2; tw.position.x = (k === 0 ? 1 : -1) * c.side * 3.35 + (k === 0 ? c.side : -c.side) * f * 1.0;
            if (Math.random() < dt * 40) fx.particles.emit(c.cx + tw.position.x, BASE_Y + 4 - f, ZP + 1, rand(-2, 2), rand(0, 2), 0, { life: 0.8, size: 0.7, color: 0x8a8a92, gravity: 9 });
            if (f > 0.9) { tw.visible = false; c.towerFall[k] = 2; fx.particles.burst(c.cx + tw.position.x, BASE_Y + 1, ZP, { count: 40, speed: 6, up: 1, life: 1.3, size: 0.8, colors: [0x9b9ca3, 0x7e7e86, 0xb0a090, 0x555555], gravity: 12 }); audio.sfx('explode', { vol: 0.5, rate: 0.8 }); ctx.shake(0.6); }
          }
        }
        // rook uit beschadigd kasteel
        if (c.dmgLevel >= 1 && !c.ko) { c.smokeT -= dt; if (c.smokeT <= 0) { c.smokeT = c.dmgLevel >= 2 ? 0.07 : 0.2; fx.particles.emit(c.cx + rand(-2.5, 2.5), BASE_Y + 5.5 + rand(0, 1), ZP + 0.5, rand(-0.3, 0.6), rand(1.5, 2.8), 0, { life: 1.6, size: c.dmgLevel >= 2 ? 1.5 : 1.1, color: c.dmgLevel >= 2 ? 0x3a3a3a : 0x777777, gravity: -0.4 }); if (c.dmgLevel >= 2 && Math.random() < 0.5) fx.particles.emit(c.cx + rand(-2.5, 2.5), BASE_Y + 5.3, ZP + 0.5, 0, 1.4, 0, { life: 0.6, size: 0.9, color: 0xff8a2a, gravity: -2 }); } }
        // ineenstorten
        if (c.ko) {
          c.koT += dt;
          for (const r of c.rubble) r.visible = c.koT > 0.7;
          const k = clamp(c.koT / 1.6, 0, 1);
          cs.keep.scale.y = lerp(1, 0.18, k * k); cs.keep.position.y = 0; cs.towerOut.visible = c.towerFall[1] === 0 && k < 0.2; cs.towerIn.visible = c.towerFall[0] === 0 && k < 0.2;
          cs.flag.visible = k < 0.3; cs.barrel.parent.parent.visible = k < 0.5;
          if (c.koT < 1.8 && Math.random() < dt * 30) fx.particles.burst(c.cx + rand(-3, 3), BASE_Y + rand(1, 5), ZP + 1, { count: 8, speed: 5, up: 1, life: 1.0, size: 1.1, colors: [0x8a8a92, 0x444444, 0xff8a2a, 0xffd23f], gravity: 3 });
          if (c.koT < 0.1) { audio.sfx('explode', { vol: 1 }); audio.sfx('thud', { vol: 1, rate: 0.6 }); }
          c.smokeT -= dt; if (c.smokeT <= 0) { c.smokeT = 0.05; fx.particles.emit(c.cx + rand(-3, 3), BASE_Y + 1 + rand(0, 2), ZP + 1, rand(-0.5, 0.5), rand(2, 3.5), 0, { life: 2.0, size: 1.7, color: 0x333333, gravity: -0.3 }); }
        }
        // hp-balk
        c.shownHp = damp(c.shownHp, c.hp, 8, dt); c.chipHp = damp(c.chipHp, c.hp, 1.8, dt);
        const wBar = 7.0;
        c.fill.scale.x = Math.max(0.001, wBar * c.shownHp / HP_MAX); c.fill.position.x = -wBar / 2 + c.fill.scale.x / 2;
        c.chip.scale.x = Math.max(0.001, wBar * c.chipHp / HP_MAX); c.chip.position.x = -wBar / 2 + c.chip.scale.x / 2;
        c.lab.userData.draw(`${names[c.i]}  ${c.hp}`, players[c.i].css);
        // poppetje
        const active = S.shooters.includes(c.i) && S.phase === 'aim' && !done;
        c.poseT -= dt; if (c.poseT <= 0) c.pose = 'idle';
        const ch = c.c;
        if (done) { /* celebrate zet pose */ }
        else ch.pose = c.pose !== 'idle' ? c.pose : c.ko ? 'scared' : active && !pl[c.i].fired ? 'point' : 'idle';
        ch.update(dt);
        if (c.fling) {
          const f = c.fling; f.t += dt;
          if (!f.landed) {
            f.vy -= 26 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += dt * 9 * -c.side;
            const gy = terrain.heightAt(f.x);
            if (f.y <= gy && f.vy < 0) { f.landed = true; f.y = gy; ch.group.rotation.z = 0; ch.group.rotation.x = 0; c.pose = 'sad'; c.poseT = 99; fx.particles.dust(f.x, gy, ZP + 1, 10, 0xb8a888); audio.sfx('thud', { vol: 0.6 }); fx.texts.add('Auw!', f.x, gy + 3, 1.2, '#ffd24a', 1.0); }
            else { ch.group.rotation.z = f.rot; ch.pose = 'scared'; }
          }
          ch.group.position.set(f.x, f.y, 0.9);
          if (!f.landed) { ch.group.rotation.y = 0; ch.yaw = 0; ch.targetYaw = 0; }
        } else ch.faceDir(c.side * 0.75, 0.85);
        // meter + ring
        const pa = pl[c.i];
        const showMeter = active && !pa.fired && !pa.locked;
        c.pm.visible = showMeter;
        if (showMeter) { const v = (pa.charging ? pa.chg : pa.pow) / 100; c.pmFill.scale.x = Math.max(0.01, 3.2 * v); c.pmFill.position.x = -1.6 + c.pmFill.scale.x / 2; c.pmFill.material.color.setHSL(0.33 * (1 - v), 0.95, 0.55); }
        c.ring.visible = active && !pa.fired; c.ring.scale.setScalar(1 + Math.sin(t * 8) * 0.1);
        c.turnTag.position.y = BASE_Y + 16.2 + Math.sin(t * 4) * 0.25;
        if (S.phase !== 'aim' || pa.fired || pa.locked) { if (!(S.phase === 'aim' && S.sim)) c.turnTag.visible = false; }
        if (S.sim && S.phase === 'aim' && pa.locked) c.turnTag.userData.draw('KLAAR!', '#7aff9a');
        c.ring.position.y = c.pivot.y - 0.0;
      }
    }
    function sceneryVisuals(dt, windNow) {
      const t = T + introT;
      for (const cl of clouds) { cl.c.position.x += (windNow * 0.35 + cl.sp * 0.4) * dt; if (cl.c.position.x > 90) cl.c.position.x = -90; if (cl.c.position.x < -90) cl.c.position.x = 90; }
      animateWindsock(sock, windNow, t);
      for (const bd of birds) { bd.b.position.x += (bd.sp + windNow * 0.25) * dt; bd.b.position.y += Math.sin(t * 0.7 + bd.ph) * dt * 0.8; if (bd.b.position.x > 70) bd.b.position.x = -70; if (bd.b.position.x < -70) bd.b.position.x = 70; for (const w of bd.b.userData.wings) w.w.rotation.z = w.sd * Math.sin(t * 9 + bd.ph) * 0.7; }
      arrow.position.y = 22 + Math.sin(t * 1.6) * 0.3;
      // wind-streepjes en bladeren
      S.leafT = (S.leafT || 0) - dt;
      if (S.leafT <= 0 && Math.abs(windNow) > 0.5) {
        S.leafT = clamp(0.5 / Math.abs(windNow), 0.03, 0.3);
        const dir = Math.sign(windNow);
        fx.particles.emit(dir > 0 ? -37 : 37, rand(5, 26), rand(0, 2), dir * Math.abs(windNow) * rand(1.6, 2.6), rand(-0.5, 0.5), 0, { life: 9, size: 0.2, color: Math.abs(windNow) > 12 ? 0xcfe8ff : 0xffffff, gravity: 0, shrink: false });
      }
      if (wantFlip0() && Math.random() < dt * 14) fx.particles.emit(rand(-40, 40), rand(-4, 6), rand(0, 3), 0, rand(1, 3), 0, { life: 3.5, size: 0.35, color: Math.random() < 0.5 ? 0xd89cff : 0xffffff, gravity: -3, shrink: false });
      if (S.chaos && S.chaos.id === 'storm' && Math.random() < dt * 40) fx.particles.emit(rand(-40, 40), 32, rand(0, 3), Math.sign(windNow) * 18, -22, 0, { life: 1.2, size: 0.3, color: 0x9fc8ff, gravity: 0, shrink: false });
      // decor wiegt
      for (const d of decor) { if (!d.obj.visible) continue; d.obj.rotation.z = Math.sin(t * 1.5 + d.x) * 0.02 * (1 + Math.abs(windNow) * 0.15) * (d.kind === 'tree' ? 1 : 0.5); }
      if (terrain.dirty) {
        terrain.rebuild();
        for (const d of decor) if (d.obj.visible) d.obj.position.y = terrain.heightAt(d.x) - 0.05;
        sock.position.y = terrain.heightAt(0);
      }
      // licht bij chaos
      const wantStorm = S.chaos && S.chaos.id === 'storm' ? 1 : 0, wantFlip = S.chaos && S.chaos.id === 'flip' ? 1 : 0;
      sleepers.lightK = damp(sleepers.lightK, wantStorm * 0.8 + wantFlip * 0.4, 3, dt);
      scene.backgroundIntensity = 1 - sleepers.lightK * 0.75;
      for (const m of bg.layers) m.material.color.setRGB(1 - sleepers.lightK * (wantFlip ? 0.5 : 0.8), 1 - sleepers.lightK * (wantFlip ? 0.7 : 0.8), 1 - sleepers.lightK * (wantFlip ? 0.2 : 0.7));
      L.sun.intensity = baseSun * (1 - sleepers.lightK * 0.6); L.hemi.intensity = baseHemi * (1 - sleepers.lightK * 0.35);
      if (wantFlip) L.hemi.color.setRGB(0.8, 0.6, 1.0); else L.hemi.color.setRGB(0.75, 0.88, 1.0);
      bg.sun.visible = !wantStorm;
    }
    const wantFlip0 = () => S.chaos && S.chaos.id === 'flip' && S.phase !== 'ko';
    let windShown = 0;

    // ------------------------------------------------------------ hoofdlus
    function step(dt) {
      T += dt;
      windShown = damp(windShown, S.wind, 3, dt);
      if (S.phase === 'aim') { S.gameT += dt; updateAim(dt); updatePreview(); }
      else { for (const d of prevDots) d.visible = false; }
      if (S.phase === 'fly' || S.phase === 'aim' || S.phase === 'ko') updateProjectiles(dt);
      if (S.phase === 'fly') {
        S.gameT += dt;
        if (projs.length === 0 && dragons.length === 0) { S.after += dt; if (S.after > 1.1) endOfShot(); } else S.after = 0;
        hud.setTimer(null); refreshHud();
        if (S.gameT > HARD_LIMIT + 30 && !done) { projs.length = 0; dragons.length = 0; decideByPoints(); }
      }
      if (S.phase === 'ko') {
        S.endT += dt;
        if (S.endT > 0.6 && !S.celebrated) { S.celebrated = true; const w = S.koWinner; for (const c of castles) { c.c.pose = w === c.i ? 'cheer' : w == null ? 'idle' : 'sad'; c.pose = c.c.pose; c.poseT = 99; } if (w != null) { audio.sfx('win'); for (let k = 0; k < 5; k++) setTimeout(() => { try { fx.particles.burst(castles[w].cx + rand(-4, 4), BASE_Y + rand(7, 11), 1, { count: 40, speed: 7, up: 1.2, life: 1.6, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 300); } }
        if (S.endT > 3.2) finishGame();
      }
    }
    function common(dt, mode = 0) {
      castleVisuals(dt); sceneryVisuals(dt, windShown); camera_(dt, mode);
    }
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      if (S.phase === 'intro') { S.phase = 'idle0'; startTurn(); }
      step(dt);
      common(dt);
    }
    function resultUpdate(dt) {
      T += dt; windShown = damp(windShown, S.wind, 3, dt);
      updateProjectiles(dt); castleVisuals(dt); sceneryVisuals(dt, windShown); camera_(dt);
    }
    function introUpdate(dt) {
      introT += dt; windShown = damp(windShown, S.wind, 3, dt);
      for (const c of castles) c.c.pose = 'idle';
      castleVisuals(dt); sceneryVisuals(dt, windShown); camera_(dt, 1);
    }
    // eerste beurt-voorbereiding zodat de intro goed oogt
    S.wind = Math.round((rng() * 2 - 1) * 6) || 3; arrow.userData.draw(S.wind); windShown = S.wind;
    S.phase = 'intro'; hud.setTimer(null); hud.setScore('Kanonnenduel');
    camera_(1, 1); sleepers.camX = 0;
    sceneryVisuals(0.016, windShown);

    return {
      update, introUpdate, resultUpdate,
      onCountdown() { refreshHud(); hud.setScore('Kanonnenduel'); },
      onStart() { refreshHud(); },
      onSwap(sw) {
        for (const c of castles) fx.particles.burst(c.pivot.x, c.pivot.y + 2, 1, { count: 26, speed: 5, up: 1, life: 0.9, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff], gravity: 4 });
        hud.toast(sw ? 'Wissel! Je schiet met het kanon van de ander!' : 'Terug naar je eigen kanon.', 2600);
      },
      celebrate(w) { for (const c of castles) { c.c.pose = c.i === w ? 'cheer' : 'sad'; c.pose = c.c.pose; c.poseT = 99; } },
      dispose() { },
      dbg: {
        state: () => ({ T, phase: S.phase, turn: S.turn, shooters: S.shooters.slice(), chaos: S.chaos && S.chaos.id, wind: S.wind, gameT: S.gameT, done, ended: S.ended, hp: castles.map((c) => c.hp), dealt: pl.map((p) => p.dealt), shots: pl.map((p) => p.shots), projs: projs.length, dragons: dragons.length, types: pl.map((p) => p.type.id), ang: pl.map((p) => p.ang), pow: pl.map((p) => p.pow), aimT: S.aimT, winner: S.koWinner, gdir: S.gdir, sim: S.sim, bestMiss: pl.map((p) => p.bestMiss) }),
        pl, castles, terrain, predict: (i, a, pw) => predict(pl[i], a, pw, true), projs, S,
        startChaos: (id) => { S.forceChaos = id; S.turn = Math.floor(S.turn / 4) * 4 + 3; startTurn(); },
        setAim: (i, a, pw) => { pl[i].ang = a; pl[i].pow = pw; },
        fireNow: (i) => fire(pl[i]),
        setType: (i, id) => { pl[i].type = TYPE_BY_ID[id]; },
      },
    };
  },
};

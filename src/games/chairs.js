import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, mulberry32, smoothstep } from '../engine/util.js';
import { makeBrother, makeNPC, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildHall, makeChair, SEAT_Y, makeTrapdoor, makeSpringBoard, makeTrophy, tagSprite, bigLabel, noteSprite, glowTex } from './chairs_world.js';

// Stoelendans — Mario Party-stoelendans in de gouden troonzaal. 2 broers + 2 narren (Fonkel en Dobber).
// Muziek speelt, stopt abrupt, iedereen rent naar een stoel. Er is altijd één stoel te weinig.

const CHAIR_SCALE = 1.7;
const PLAT_Y = 0.52;                    // hoogte van het arena-platform
const ARENA_R = 8.2;
const SIT_REACH = 1.8, DIVE_REACH = 3.9;
const WALK = 6.4;
const MAX_ROUNDS = 3;
const NAMES_NPC = ['Fonkel', 'Dobber'];
const NPC_CSS = ['#c88aff', '#ffa04a'];
const NPC_COL = [0xb15ae8, 0xff8a2a];
const HARD_LIMIT = 170;
const MELODY = [
  76, 0, 76, 79, 76, 0, 72, 0,
  74, 0, 74, 77, 74, 0, 71, 0,
  72, 76, 79, 84, 79, 76, 79, 0,
  81, 79, 77, 74, 72, 0, 0, 0,
];
const BASS = [48, 43, 48, 53];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export default {
  id: 'chairs',
  name: 'Stoelendans',
  giver: 'Koning Klopper',
  icon: '🪑',
  mode: 'pvp',
  time: 90,
  pay: 1,
  music: 'game',
  blurb: 'In de gouden troonzaal van het Speelhal-kasteel speelt de hofkapel! Loop rond de stoelen, en <b>zodra de muziek stopt</b> ren je naar een vrije stoel. Er is altijd <b>één stoel te weinig</b>: wie blijft staan, valt door het valluik of wordt weggekatapulteerd. Pas op voor <b>nepstops</b>! Wie het langst overleeft wint, ook tegen de narren <b>Fonkel</b> en <b>Dobber</b>.',
  controls: ['{move} rennen', '{a} zitten / duiken op een stoel (pas als de muziek stopt!)', '{b} rivaal wegduwen'],
  tip: 'Te vroeg gaan zitten (bij een nepstop!) kost je een duikeling. Een duw met B kan een duikende rivaal uit de lucht halen. Op de gouden stoel mag je kiezen wie er uitvalt!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pvp = ctx.pvp;
    const names = players.map((p) => p.name);
    const L = ctx.lights('indoor', { shadow: 18, center: [0, 0, 0], fog: false });
    L.sun.position.set(-10, 26, 18); L.sun.intensity = 1.9; L.hemi.intensity = 1.25; L.hemi.color.set(0xffe9c8); L.hemi.groundColor.set(0x7a4a3a);
    scene.background = new THREE.Color(0x1d1220);
    const GF = pvp.gravity;                      // twist: maanzwaartekracht -> hoger springen
    const SLIP = pvp.slip;
    const rng = ctx.rng;

    const hall = buildHall(scene);
    const trapdoor = makeTrapdoor(); scene.add(trapdoor.group);
    const spring = makeSpringBoard(); scene.add(spring.group);
    const trophy = makeTrophy(); trophy.visible = false; scene.add(trophy);

    // koning + hofkapel
    const king = makeNPC('elder', { hat: 'crown', hatColor: 0xf2c230, scale: 1.0 }); king.group.scale.setScalar(2.3); king.group.position.set(0, 4.3, -21.2); king.pose = 'sit'; king.faceDir(0, 1); scene.add(king.group);
    const bard = makeNPC('bard'); bard.group.scale.setScalar(1.6); bard.group.position.set(-6.5, 0, -17); bard.faceDir(0.4, 1); bard.pose = 'dance'; scene.add(bard.group);
    const goblin = makeNPC('goblin'); goblin.group.scale.setScalar(1.7); goblin.group.position.set(6.5, 0, -17); goblin.faceDir(-0.4, 1); goblin.pose = 'dance'; scene.add(goblin.group);
    const band = [king, bard, goblin];

    // ------------------------------------------------------------ deelnemers
    const SPEC = [
      { scale: 0.98, shirt: 0x3a6ae8, sleeve: 0xffd23f, pants: 0xffd23f, hatColor: 0x3a6ae8, hatColor2: 0xffd23f, boots: 0x2a2a6a },
      { scale: 1.1, bodyW: 1.25, shirt: 0xe8742a, sleeve: 0x7ad83a, pants: 0x7ad83a, hatColor: 0xe8742a, hatColor2: 0x7ad83a, nose: 2.0, skin: 0xf0b890, boots: 0xffe14a },
    ];
    const css = [players[0].css, players[1].css, NPC_CSS[0], NPC_CSS[1]];
    const nm = [names[0], names[1], NAMES_NPC[0], NAMES_NPC[1]];
    const E = [0, 1, 2, 3].map((id) => {
      const bro = id < 2;
      const c = bro ? makeBrother(id) : makeNPC('jester', SPEC[id - 2]);
      const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const sz = bro ? pvp.size(id) : 1;
      const gs = 1.85 * sz;
      holder.scale.setScalar(gs);
      const ringCol = bro ? PLAYER_COLORS[id] : NPC_COL[id - 2];
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.86, 24), new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; scene.add(ring);
      const blob = P.shadowBlob(0.9); scene.add(blob);
      const tag = tagSprite(nm[id], css[id]); scene.add(tag);
      return {
        id, bro, name: nm[id], css: css[id], c, holder, ring, blob, tag, sz, gs, rad: 0.8 * sz,
        x: 0, z: 0, vx: 0, vz: 0, y: PLAT_Y, vy: 0, face: 0, alive: true, out: false, outRound: 0, mode: 'walk', modeT: 0, stunT: 0, pushCd: 0, hopCd: 0, seat: null, seatT: 1e9, safe: false, early: false, earlyT: 0,
        dive: null, slide: null, fall: null, fly: null, spinY: 0, tiltX: 0, tiltZ: 0, scaleK: 1, sits: 0, bonks: 0, auto: false,
        ai: bro ? null : { smart: id === 2, react: 0, delay: 0, target: null, orbA: 0, orbR: 6, fakeFall: false, fakeT: 0, pushT: 0, confused: 0, sprint: 0 },
      };
    });
    const speedOf = (e) => (e.bro ? pvp.speed(e.id) : (ctx.twist.id === 'turbo' || ctx.twist.id === 'slowmo' ? ctx.twist.speed : 1));

    // ------------------------------------------------------------ stoelen
    const chairs = [0, 1, 2].map((k) => {
      const holder = new THREE.Group(); scene.add(holder);
      const variants = { normal: makeChair('normal'), golden: makeChair('golden'), smoky: makeChair('smoky') };
      for (const v of Object.values(variants)) { v.group.scale.setScalar(CHAIR_SCALE); holder.add(v.group); v.group.visible = false; }
      const shadow = P.shadowBlob(1.2); scene.add(shadow);
      return { k, holder, variants, v: variants.normal, kind: 'normal', active: false, x: 0, z: 0, ang: 0, occupant: null, state: 'idle', runT: 0, rvx: 0, rvz: 0, fuse: -1, hop: 0, boomed: false, shadow, y: 0, detached: false, runner: false };
    });
    function setChairKind(ch, kind) {
      ch.kind = kind; for (const [n, v] of Object.entries(ch.variants)) v.group.visible = n === kind;
      ch.v = ch.variants[kind];
    }

    // ------------------------------------------------------------ toestand
    const R = { n: 0, state: 'prep', t: 0, musicT: 0, stopAt: 10, fakeAt: -1, fakeDone: false, fakeT: 0, stopKind: 'cut', stopT: 0, chairsN: 3, ringRot: 0, omega: 0, gimmick: null, bpm: 112, nextNote: 0, stepIdx: 0, settleT: 0, victim: null, pick: null, elimKind: null, elimT: 0, goldSitter: null, gimmicks: null, camPunch: 0, over: false, allSat: false };
    let T = 0, introT = 0, done = false, gameT = 0, finishCalled = false, resultT = 0, winnerBro = null, champion = null;
    const log = []; // ronde-uitslagen
    R.gimmicks = Math.random() < 0.5 ? ['runaway', 'smoky'] : ['smoky', 'runaway'];

    // muziek-kanaal met eigen volume zodat we abrupt kunnen kappen
    let mg = null;
    function musicGain() {
      if (mg) return mg;
      if (!audio.ctx || !audio.sfxG) return null;
      mg = audio.ctx.createGain(); mg.gain.value = 1; mg.connect(audio.sfxG); return mg;
    }
    function cutMusic() { const g = musicGain(); if (g) { const t = audio.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); } }
    function openMusic() { const g = musicGain(); if (g) { const t = audio.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(1, t + 0.02); } }
    function scheduleMusic() {
      const g = musicGain(); if (!g) { return; }
      const now = audio.ctx.currentTime;
      if (R.nextNote < now - 0.2) R.nextNote = now + 0.03;
      while (R.nextNote < now + 0.22) {
        const spb = 60 / R.bpm / 2;                   // 8e noot
        const s = R.stepIdx % 32, bar = Math.floor(s / 8), loop = Math.floor(R.stepIdx / 32), tr = (loop % 4) * 2;
        const w = R.nextNote;
        const n = MELODY[s];
        if (n) audio.tone(mtof(n + tr), spb * 1.7, { type: 'square', vol: 0.085, filter: 3200, when: w, dest: g, send: 0.18, attack: 0.006 });
        const step = s % 8;
        if (step === 0 || step === 4) audio.tone(mtof(BASS[bar] + tr - (step === 4 ? 5 : 0) - 12 + 12), spb * 1.8, { type: 'triangle', vol: 0.2, when: w, dest: g, attack: 0.008 });
        if (step === 2 || step === 6) { for (const o of [0, 4, 7]) audio.tone(mtof(BASS[bar] + 12 + o + tr), spb * 0.8, { type: 'square', vol: 0.032, filter: 2200, when: w, dest: g }); }
        if (step % 2 === 1) audio.noise(0.03, { type: 'highpass', freq: 7000, vol: 0.035, when: w, dest: g });
        if (step === 0 || step === 4) audio.tone(120, 0.12, { type: 'sine', vol: 0.3, slide: 45, when: w, dest: g });
        R.nextNote += spb; R.stepIdx++;
        beatQueue.push(w);
      }
    }
    const beatQueue = [];
    function bpmNow() { return Math.min(205, 112 + 5.4 * R.musicT + 6 * (R.n - 1)); }

    // ------------------------------------------------------------ hulp
    const alive = () => E.filter((e) => e.alive);
    const seatPos = (ch) => ({ x: ch.x, z: ch.z });
    function chairTopY(ch) { return PLAT_Y + (SEAT_Y + 0.11) * CHAIR_SCALE + ch.hop; }
    function seatedY(e, ch) { return chairTopY(ch) - 0.58 * e.c.legLen * e.gs + 0.04; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
    function freeChairs() { return chairs.filter((c) => c.active && !c.occupant && c.state === 'idle' && !c.boomed); }
    function nearestFree(e, maxD = 99, list = null) {
      let best = null, bd = maxD;
      for (const c of list || freeChairs()) { const d = Math.hypot(c.x - e.x, c.z - e.z); if (d < bd) { bd = d; best = c; } }
      return best ? { chair: best, d: bd } : null;
    }
    const canAct = (e) => e.alive && (e.mode === 'walk');
    const isStop = () => R.state === 'stop';
    const musicOn = () => R.state === 'music' || R.state === 'fake';

    function say(text, x, z, color = '#ffe14a', scale = 1, y = 5) { fx.texts.add(text, x, y, z, color, scale); }
    function stars(e) { for (let k = 0; k < 3; k++) { const a = T * 10 + k * TAU / 3; fx.particles.emit(e.x + Math.cos(a) * 0.7, e.y + e.c.height * e.gs + 0.2, e.z + Math.sin(a) * 0.7, 0, 0.3, 0, { life: 0.35, size: 0.28, color: 0xffe14a, gravity: 0 }); } }

    // ------------------------------------------------------------ ronde-opbouw
    function layoutChairs() {
      const n = R.chairsN; const RC = [0, 2.2, 3.0, 3.6][n];
      const off = rng() * TAU;
      chairs.forEach((ch, k) => {
        ch.active = k < n; ch.holder.visible = ch.active; ch.shadow.visible = ch.active; ch.occupant = null; ch.state = 'idle'; ch.hop = 0; ch.boomed = false; ch.fuse = -1; ch.runT = 0; ch.detached = false; ch.runner = false;
        ch.ang = off + k / n * TAU; ch.rc = RC; ch.kind = 'normal'; setChairKind(ch, 'normal');
        ch.x = Math.cos(ch.ang) * RC; ch.z = Math.sin(ch.ang) * RC;
        ch.holder.scale.setScalar(1); ch.holder.rotation.set(0, 0, 0); ch.v.feet.visible = false;
      });
      const g = R.gimmick; for (const c of chairs) c.runner = false;
      const idx = chairs.filter((c) => c.active).map((c) => c.k).sort(() => rng() - 0.5);
      if (g === 'golden') setChairKind(chairs[idx[0]], 'golden');
      if (g === 'smoky') setChairKind(chairs[idx[0]], 'smoky');
      if (g === 'runaway') { chairs[idx[0]].runner = true; }
    }
    function gimmickFor(n) {
      if (n === 2) return 'golden';
      return R.gimmicks[n === 1 ? 0 : 1];
    }
    function startRound() {
      R.n++;
      const al = alive();
      R.chairsN = al.length - 1;
      R.gimmick = al.length >= 4 ? R.gimmicks[0] : al.length === 3 ? 'golden' : R.gimmicks[1];
      layoutChairs();
      R.state = 'intro'; R.t = 0; R.musicT = 0; R.fakeDone = false; R.fakeT = 0; R.stopT = 0; R.omega = 0; R.victim = null; R.pick = null; R.goldSitter = null; R.allSat = false; R.settleT = 0;
      R.stopAt = [rand(13, 17.5), rand(11, 15), rand(10, 13.5)][Math.min(2, R.n - 1)];
      const pf = [0.5, 0.85, 0.85][Math.min(2, R.n - 1)];
      R.fakeAt = Math.random() < pf ? R.stopAt * rand(0.38, 0.62) : -1;
      R.stopKind = Math.random() < 0.5 ? 'cut' : 'gliss';
      R.stepIdx = 0; R.nextNote = 0; R.bpm = 112;
      // spelers rond de stoelen zetten
      const startA = rng() * TAU; const order = al.slice().sort(() => rng() - 0.5);
      order.forEach((e, k) => {
        const a = startA + k / order.length * TAU;
        e.x = Math.cos(a) * 5.8; e.z = Math.sin(a) * 5.8; e.vx = e.vz = 0; e.y = PLAT_Y; e.vy = 0; e.mode = 'walk'; e.stunT = 0; e.seat = null; e.seatT = 1e9; e.safe = false; e.early = false; e.dive = null; e.slide = null; e.fly = null; e.scaleK = 1; e.holder.rotation.set(0, 0, 0);
        e.face = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI * 0;   // kijk langs de cirkel
        e.pushCd = 0.5; e.hopCd = 0;
        if (e.ai) { e.ai.orbA = a; e.ai.orbR = 5.4 + rng() * 0.6; e.ai.target = null; e.ai.delay = 0; e.ai.fakeT = 0; e.ai.fakeFall = false; e.ai.dir = 1; }
      });
      const gTxt = { runaway: 'Eén stoel gaat er vandoor!', golden: 'Gouden stoel: de zitter kiest wie uitvalt!', smoky: 'Eén stoel is op ontploffen: wie erop zit wordt weggeblazen!' }[R.gimmick];
      hud.showBig(`RONDE ${R.n}`, 1500, '#ffe14a'); hud.toast(`${R.chairsN} stoelen voor ${al.length} spelers. ${gTxt}`, 3200); audio.sfx('bell', { vol: 0.6 });
      refreshHud();
    }

    // ------------------------------------------------------------ zitten, duiken, duwen
    function sitOn(e, ch, early = false, instant = false) {
      ch.occupant = e; e.seat = ch; e.mode = instant ? 'sit' : 'slide'; e.modeT = 0; e.slide = { fx: e.x, fz: e.z, fy: e.y }; e.vx = e.vz = 0; e.early = early; e.earlyT = 0; e.dive = null;
      e.seatT = R.stopT; e.sits++;
      if (!early) { audio.sfx('pop', { vol: 0.6, rate: 1.2 }); } else audio.sfx('click', { vol: 0.5 });
    }
    function tryAction(e) {   // A-knop (mens of AI)
      if (!canAct(e) || e.hopCd > 0) return;
      const near = nearestFree(e, DIVE_REACH / Math.sqrt(GF) * 1.0);
      const early = !isStop();
      if (R.state === 'intro' || R.state === 'prep') return;
      if (near && near.d <= SIT_REACH * e.sz + 0.3 && (isStop() || musicOn())) { e.hopCd = 0.3; sitOn(e, near.chair, early); fx.particles.burst(e.x, e.y + 0.5, e.z, { count: 10, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 5 }); return; }
      if (near && (isStop() || musicOn())) {   // duiken
        e.mode = 'dive'; e.modeT = 0; e.hopCd = 0.4; e.early = early;
        const dur = 0.34 / Math.sqrt(GF);
        e.dive = { chair: near.chair, fx: e.x, fz: e.z, fy: e.y, dur, early };
        e.c.jump(); audio.sfx('jump', { vol: 0.6, rate: 1.1 });
        fx.particles.dust(e.x, PLAT_Y, e.z, 5, 0xd8c8a8);
        return;
      }
      // gewoon een sprongetje
      e.hopCd = 0.55; e.vy = 6.5 * Math.sqrt(1 / GF) * 0.9 + 0; e.mode = 'hop'; e.modeT = 0; e.c.jump(); audio.sfx('jump', { vol: 0.35, rate: 1.3 });
    }
    function tryPush(e) {
      if (!canAct(e) && e.mode !== 'dive') return;
      if (e.pushCd > 0) return;
      e.pushCd = 1.6; e.c.swing(); audio.sfx('whoosh', { vol: 0.5, rate: 1.1 });
      const fxv = Math.sin(e.face), fzv = Math.cos(e.face);
      let best = null, bs = -9;
      for (const o of E) {
        if (o === e || !o.alive) continue;
        if (o.mode === 'elim' || o.mode === 'spec' || o.mode === 'fly' || o.mode === 'fall') continue;
        const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz);
        const rr = 2.3 * e.sz + o.rad;
        if (d > rr) continue;
        const dot = (dx * fxv + dz * fzv) / (d || 1);
        if (dot < 0.15 && d > 1.3 * e.sz + o.rad) continue;
        const sc = dot - d * 0.1; if (sc > bs) { bs = sc; best = o; }
      }
      fx.particles.burst(e.x + fxv * 0.9, e.y + 1.0, e.z + fzv * 0.9, { count: 6, speed: 3, up: 0.3, life: 0.3, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 0 });
      if (!best) return;
      const o = best;
      if (o.mode === 'sit' || o.mode === 'slide') { say('KLANG!', o.x, o.z, '#cfd6e8', 0.9, 4.5); audio.sfx('wood', { vol: 0.7 }); fx.particles.burst(o.x, o.y + 1.5, o.z, { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xcfd6e8, 0xffffff], gravity: 0 }); ctx.shake(0.15); return; }
      const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 1;
      const k = 13 * e.sz / Math.max(0.65, o.sz) * 0.9;
      o.vx = dx / d * k; o.vz = dz / d * k; o.vy = 4.5; o.mode = 'stun'; o.modeT = 0; o.stunT = 0.75; o.dive = null; o.early = false;
      say('BAF!', o.x, o.z, '#ffffff', 1.0, 4.2); audio.sfx('hit', { vol: 0.8 }); ctx.shake(0.3);
      fx.particles.burst(o.x, o.y + 1.2, o.z, { count: 16, speed: 4, up: 1, life: 0.5, size: 0.35, colors: [0xffffff, 0xffe14a, 0xff9a3a], gravity: 6 });
      e.pushPoseT = 0.4;
    }
    function bonk(e, why) {
      e.mode = 'stun'; e.modeT = 0; e.stunT = 1.3; e.bonks++; e.early = false;
      if (e.seat) { e.seat.occupant = null; const ch = e.seat; e.seat = null; const ang = Math.atan2(e.z - 0, e.x - 0); e.vx = Math.cos(ang) * 6 + rand(-2, 2); e.vz = Math.sin(ang) * 6 + 3; e.vy = 6; ch.hop = 0; }
      else { e.vy = 5; }
      say(why, e.x, e.z, '#ff8a8a', 1.1, 4.6); audio.sfx('hit', { vol: 0.7 }); audio.sfx('buzz', { vol: 0.3 }); ctx.shake(0.25);
    }

    // ------------------------------------------------------------ AI
    function aiStep(e, dt) {
      const ai = e.ai; if (!ai) return { x: 0, z: 0, a: false, b: false };
      const out = { x: 0, z: 0, a: false, b: false, run: false };
      if (!canAct(e)) return out;
      ai.confused = Math.max(0, ai.confused - dt);
      const toward = (tx, tz, speed) => { const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz); if (d > 0.05) { const k = Math.min(1, d * 3); out.x = dx / d * k; out.z = dz / d * k; } out.speedMul = speed; };
      if (R.state === 'music' || R.state === 'fake' || R.state === 'intro') {
        // loop in een kring om de stoelen
        const w = 0.5 + Math.min(0.32, R.musicT * 0.012);
        ai.orbA += w * dt * (ai.dir || 1); const tx = Math.cos(ai.orbA) * ai.orbR, tz = Math.sin(ai.orbA) * ai.orbR;
        toward(tx, tz, 1); out.speedMul = 0.95;
        if (R.state === 'fake') {
          ai.fakeT += dt;
          if (ai.fakeT > ai.react && ai.fakeFall) { const t = nearestFree(e); if (t) { toward(t.chair.x, t.chair.z, 1.1); out.speedMul = 1.05; if (t.d < SIT_REACH * e.sz) out.a = true; else if (t.d < 2.2) out.a = true; } }
        }
        // soms een duwtje geven aan wie in de weg loopt
        return out;
      }
      if (R.state === 'stop') {
        ai.delay -= dt;
        if (ai.delay > 0) { const w = 0.3; ai.orbA += w * dt; toward(Math.cos(ai.orbA) * ai.orbR, Math.sin(ai.orbA) * ai.orbR, 1); out.speedMul = 0.7; return out; }
        if (ai.confused > 0) return out;
        // doelstoel kiezen / opnieuw kiezen als bezet
        if (!ai.target || ai.target.occupant || ai.target.state !== 'idle') {
          const fc = freeChairs().map((c) => ({ c, d: Math.hypot(c.x - e.x, c.z - e.z) })).sort((a, b) => a.d - b.d);
          if (!fc.length) return out;
          let pickI = 0; if (!ai.smart && fc.length > 1 && Math.random() < 0.28) pickI = 1;
          ai.target = fc[pickI].c;
          if (!ai.smart && Math.random() < 0.18) ai.confused = 0.45;
        }
        const ch = ai.target; const d = Math.hypot(ch.x - e.x, ch.z - e.z);
        toward(ch.x, ch.z, 1); out.speedMul = 1.0; out.run = true;
        if (d < SIT_REACH * e.sz) out.a = true;
        else if (d < (ai.smart ? 2.7 : 2.2) && Math.random() < dt * 10) out.a = true;       // duiken
        // duwen
        ai.pushT -= dt;
        if (ai.pushT <= 0 && e.pushCd <= 0) {
          for (const o of E) {
            if (o === e || !o.alive || o.mode === 'sit' || o.mode === 'slide' || o.mode === 'elim' || o.mode === 'spec' || o.mode === 'fly') continue;
            const dd = dist(e, o); if (dd < 1.9 * e.sz + o.rad && (Math.hypot(ch.x - o.x, ch.z - o.z) < d + 0.6)) { if (Math.random() < (ai.smart ? 0.6 : 0.3)) { out.b = true; e.face = Math.atan2(o.x - e.x, o.z - e.z); } ai.pushT = 0.35; break; }
          }
        }
      }
      return out;
    }

    // ------------------------------------------------------------ muziek-stop en rondebesturing
    function doStop() {
      R.state = 'stop'; R.stopT = 0; R.settleT = 0;
      for (const e of E) { if (e.early && e.mode === 'sit') e.early = false; if (e.early && e.mode === 'slide') e.early = false; if (e.dive) e.dive.early = false; if (e.ai) { e.ai.target = null; e.ai.delay = (e.ai.smart ? rand(0.27, 0.48) : rand(0.5, 0.9)); } }
      if (R.stopKind === 'gliss') {
        cutMusic();
        const f0 = 640; audio.tone(f0, 1.1, { type: 'sawtooth', vol: 0.17, slide: f0 / 5, vib: 0.03, filter: 1800, send: 0.2 });
        audio.tone(f0 * 0.5, 1.1, { type: 'square', vol: 0.07, slide: f0 / 10, vib: 0.03, filter: 1200 });
        hud.showBig('WAAAAH... STOP!', 1300, '#ff7a7a');
      } else { cutMusic(); audio.sfx('slam', { vol: 0.2 }); hud.showBig('STOP!', 1000, '#ff5a5a'); }
      ctx.shake(0.35); R.camPunch = 1;
      fx.particles.ring(0, PLAT_Y + 0.2, 0, { count: 30, speed: 9, color: 0xffe14a, size: 0.4, life: 0.6 });
      for (const ch of chairs) if (ch.active && ch.state === 'idle') fx.particles.burst(ch.x, PLAT_Y + 3.4, ch.z, { count: 10, speed: 3, up: 1.2, life: 0.8, size: 0.35, colors: [0xffe14a, 0xffffff], gravity: -1 });
      if (R.gimmick === 'runaway') { const ch = chairs.find((c) => c.active && c.runner); if (ch) { ch.state = 'prerun'; ch.runT = 0; } }
      refreshHud();
    }
    function startFake() {
      R.state = 'fake'; R.fakeT = 0; R.fakeDone = true; cutMusic();
      audio.tone(180, 0.18, { type: 'sawtooth', vol: 0.1, slide: 90 });
      for (const e of E) if (e.ai) { e.ai.fakeT = 0; e.ai.react = e.ai.smart ? rand(0.25, 0.45) : rand(0.3, 0.7); e.ai.fakeFall = Math.random() < (e.ai.smart ? 0.22 : 0.5); }
    }
    function endFake() {
      R.state = 'music'; openMusic(); R.nextNote = 0;
      audio.tone(330, 0.12, { type: 'square', vol: 0.12, slide: 880 }); audio.tone(660, 0.2, { type: 'square', vol: 0.1, delay: 0.1, slide: 1320 });
      hud.toast('Nepstop! De muziek gaat gewoon door...', 1500); fx.texts.add('NEPSTOP!', 0, 7.5, 1, '#ff9a3a', 1.4);
      for (const e of E) if (e.alive && e.early && (e.mode === 'sit' || e.mode === 'slide')) bonk(e, 'Te vroeg!');
    }
    function chairsFull() {
      const act = chairs.filter((c) => c.active);
      return act.every((c) => c.occupant);
    }
    function autoAssign() {
      // wie na de wachttijd nog staat, duikt automatisch naar de dichtstbijzijnde stoel
      const stand = alive().filter((e) => !e.seat && e.mode !== 'fly' && e.mode !== 'elim');
      const pairs = [];
      for (const e of stand) for (const c of freeChairs()) pairs.push({ e, c, d: Math.hypot(e.x - c.x, e.z - c.z) });
      pairs.sort((a, b) => a.d - b.d);
      const doneE = new Set(), doneC = new Set();
      for (const p of pairs) { if (doneE.has(p.e) || doneC.has(p.c)) continue; doneE.add(p.e); doneC.add(p.c); p.c.occupant = p.e; p.e.seat = p.c; p.e.mode = 'slide'; p.e.modeT = 0; p.e.slide = { fx: p.e.x, fz: p.e.z, fy: p.e.y }; p.e.seatT = R.stopT; p.e.early = false; }
    }
    function resolveRound() {
      R.state = 'resolve'; R.t = 0; R.omega = 0;
      const standing = alive().filter((e) => !e.seat && !e.safe);
      let victim = standing[0] || null;
      // gouden stoel: de zitter kiest
      const gold = chairs.find((c) => c.active && c.kind === 'golden');
      if (gold && gold.occupant && gold.occupant.alive) {
        R.goldSitter = gold.occupant;
        const cand = alive().filter((e) => e !== R.goldSitter);
        // eerste kandidaat = de staande (standaardkeuze)
        cand.sort((a, b) => (a === victim ? -1 : 0) - (b === victim ? -1 : 0));
        R.pick = { cand, idx: Math.max(0, cand.indexOf(victim)), t: 5.2, aiT: rand(1.3, 2.2), by: R.goldSitter };
        R.state = 'pick'; R.victim = victim;
        audio.sfx('powerup', { vol: 0.8 }); hud.showBig('GOUDEN STOEL!', 1400, '#ffd24a');
        fx.particles.burst(gold.x, PLAT_Y + 3, gold.z, { count: 40, speed: 6, up: 1.4, life: 1.2, size: 0.4, colors: [0xffd23f, 0xfff2a0, 0xffffff], gravity: 3 });
        if (R.goldSitter.bro) hud.setHint(`<b style="color:${R.goldSitter.css}">${R.goldSitter.name}</b> zit op de gouden stoel: kies wie uitvalt met <b>◀ ▶</b>, bevestig met <b>A</b>`);
        else hud.setHint(`${R.goldSitter.name} zit op de gouden stoel en kiest wie er uitvalt...`);
        return;
      }
      beginElim(victim);
    }
    function applyPick() {
      const choice = R.pick.cand[R.pick.idx]; const prevVictim = R.victim;
      const sitter = R.pick.by;
      R.pick = null; R.lastHint = null; hud.setHint(null); hud.setTimer(null);
      if (choice && choice !== prevVictim && prevVictim) {
        // de gekozen speler moet uitvallen; de staande neemt zijn stoel
        const ch = choice.seat || choice.safeChair;
        if (ch) { ch.occupant = prevVictim; prevVictim.seat = ch; prevVictim.mode = 'slide'; prevVictim.modeT = 0; prevVictim.slide = { fx: prevVictim.x, fz: prevVictim.z, fy: prevVictim.y }; prevVictim.seatT = R.stopT; choice.seat = null; }
        say(`${sitter.name} kiest ${choice.name}!`, choice.x, choice.z, '#ffd24a', 1.1, 6);
        audio.sfx('bad', { vol: 0.6 });
        beginElim(choice);
      } else {
        say(`${sitter.name} kiest ${choice ? choice.name : '...'}`, 0, 0, '#ffd24a', 0.9, 6);
        beginElim(choice || prevVictim);
      }
    }
    function beginElim(victim) {
      if (!victim) { // niemand staat (kan niet voorkomen), ga door
        R.state = 'between'; R.t = 0; return;
      }
      R.state = 'elim'; R.t = 0; R.victim = victim; victim.mode = 'elim'; victim.modeT = 0; victim.dive = null; victim.slide = null; victim.stunT = 0;
      if (victim.seat) { victim.seat.occupant = null; victim.seat = null; }
      R.elimKind = R.forceElim || (Math.random() < 0.5 ? 'trap' : 'spring');
      victim.alive = false; victim.out = true; victim.outRound = R.n;
      hud.showBig(`${victim.name} valt uit!`, 1100, victim.css);
      const v = victim;
      v.vx = v.vz = 0;
      const tx = clamp(v.x * 0.5, -3, 3), tz = 3.0;
      if (R.elimKind === 'trap') {
        trapdoor.group.visible = true; trapdoor.group.position.set(tx, PLAT_Y + 0.01, tz); trapdoor.open(0); trapdoor.group.scale.setScalar(Math.max(0.9, v.sz));
        v.fall = { t: 0, fx: v.x, fz: v.z, tx, tz };
        audio.sfx('door', { vol: 0.8 }); audio.sfx('creak', { vol: 0.4, rate: 1.8 });
      } else {
        spring.group.visible = true; spring.group.position.set(tx, PLAT_Y, tz); spring.setK(1); spring.group.scale.setScalar(Math.max(0.9, v.sz));
        v.fly = null; v.fall = { t: 0, spring: true, fx: v.x, fz: v.z, tx, tz };
        audio.sfx('click', { vol: 0.6 });
      }
      e_out_log(v);
      refreshHud();
    }
    function e_out_log(v) { log.push({ round: R.n, name: v.name, id: v.id, seatT: v.seatT }); }
    function slotFor(e) {
      const free = hall.balcony.filter((s) => !s.used);
      // dichtstbijzijnde vrije balkonplek (brothers links/rechts naar keuze)
      const s = free[(e.id * 5 + R.n * 3) % free.length]; if (s) s.used = true; return s;
    }
    function toSpectator(e) {
      const s = e.slot || slotFor(e); e.slot = s;
      e.mode = 'spec'; e.x = s.x; e.z = s.z; e.y = s.y; e.vx = e.vz = 0; e.scaleK = 0.01; e.holder.rotation.set(0, 0, 0);
      e.face = Math.atan2(-Math.sign(s.x), 0.6); e.specPop = 0;
      fx.particles.burst(e.x, e.y + 1, e.z, { count: 24, speed: 4, up: 1.4, life: 0.8, size: 0.5, colors: [0xffffff, 0xcccccc, 0xffe14a], gravity: 2 });
      audio.sfx('pop', { vol: 0.6 });
    }
    function endRound() {
      const al = alive();
      if (al.length <= 1 || R.n >= MAX_ROUNDS) { startTrophy(); return; }
      R.state = 'between'; R.t = 0;
    }

    // ------------------------------------------------------------ einde
    function ranking() {
      // wie het langst overleeft; broers: score = ronde van uitval (overlevende = MAX_ROUNDS + 1)
      return [0, 1].map((i) => (E[i].out ? E[i].outRound : MAX_ROUNDS + 1));
    }
    function decideWinner() {
      const sc = ranking();
      if (sc[0] !== sc[1]) return sc[0] > sc[1] ? 0 : 1;
      // zelfde ronde uitgevallen: wie het eerst zat wint
      const a = E[0].seatT, b = E[1].seatT;
      if (a !== b) return a < b ? 0 : 1;
      if (E[0].sits !== E[1].sits) return E[0].sits > E[1].sits ? 0 : 1;
      return Math.random() < 0.5 ? 0 : 1;
    }
    function startTrophy() {
      R.state = 'trophy'; R.t = 0; R.lastHint = null; hud.setHint(null); hud.setTimer(null);
      const w = decideWinner(); winnerBro = w; const we = E[w];
      const surv = alive()[0] || null; champion = surv;
      // winnaar komt naar het podium (als hij uitgevallen was, springt hij uit de balkon)
      if (we.mode === 'spec') { fx.particles.burst(we.x, we.y + 1, we.z, { count: 20, speed: 4, up: 1.2, life: 0.8, size: 0.5, colors: [0xffe14a, 0xffffff], gravity: 2 }); }
      we.alive = true; we.mode = 'podium'; we.x = 0; we.z = 1.5; we.y = PLAT_Y; we.scaleK = 1; we.holder.rotation.set(0, 0, 0);
      if (we.seat) { we.seat.occupant = null; we.seat = null; }
      for (const c of chairs) c.holder.visible = false;
      for (const c of chairs) c.shadow.visible = false;
      trophy.visible = true; trophy.position.set(0, PLAT_Y + 10, 1.5); trophy.scale.setScalar(1.6);
      we.face = 0; we.c.pose = 'cheer';
      audio.sfx('win', { vol: 0.9 });
      hud.showBig(`${we.name} wint!`, 2200, we.css);
      // andere deelnemers die nog meespelen gaan juichend naar de kant
      for (const e of E) if (e !== we && e.alive) { if (e.seat) { e.seat.occupant = null; e.seat = null; } e.mode = 'cheerside'; e.y = PLAT_Y; e.holder.rotation.set(0, 0, 0); e.face = 0; e.x = clamp(e.x, -6, 6); }
      refreshHud();
    }
    function finishGame() {
      if (finishCalled) return; finishCalled = true; done = true;
      const w = winnerBro ?? decideWinner(); const l = 1 - w;
      const sc = ranking();
      const surv = champion;
      let txt;
      if (surv && !surv.bro) txt = `<b>${surv.name}</b> won de hele stoelendans! Maar tussen de broers gaat de trofee naar <b>${E[w].name}</b>, die langer bleef zitten dan ${E[l].name} (uitgevallen in ronde ${E[l].outRound || '-'}).`;
      else if (sc[w] === MAX_ROUNDS + 1) txt = `<b>${E[w].name}</b> overleefde alle ${MAX_ROUNDS} rondes en pakt de gouden trofee! ${E[l].name} viel uit in ronde ${E[l].outRound}.`;
      else txt = `<b>${E[w].name}</b> viel pas in ronde ${E[w].outRound} uit, ${E[l].name} al in ronde ${E[l].outRound}. De trofee is voor ${E[w].name}!`;
      try { audio.music('game'); } catch (e) { /* weg */ }
      ctx.finishPvp({ winner: w, score: [sc[0], sc[1]], summary: txt + `<br><small>Score = ronde van uitval (${MAX_ROUNDS + 1} = bleef staan tot het einde)</small>`, delay: 500 });
    }

    // ------------------------------------------------------------ HUD
    function refreshHud() {
      if (hud.scoreEl) hud.scoreEl.style.whiteSpace = 'nowrap';
      hud.setScore(R.n ? `Ronde ${R.n}/${MAX_ROUNDS} · ${R.chairsN} stoelen · ${alive().length} spelers` : 'Stoelendans');
      for (const i of [0, 1]) {
        const e = E[i];
        hud.setPlayerInfo(i, !e.alive && e.outRound ? `Uitgevallen in ronde ${e.outRound}` : e.mode === 'sit' || e.mode === 'slide' ? 'Zit!' : e.safe ? 'Veilig!' : R.state === 'stop' ? 'Naar een stoel!' : 'Nog in het spel');
      }
    }
    function statusHint() {
      if (R.state === 'pick' || done || R.state === 'trophy') return;
      const marks = E.map((e) => `<span style="color:${e.css}">${e.name}</span> ${e.alive ? '✔' : '✘'}`).join(' &nbsp; ');
      const msg = R.state === 'music' ? '♪ Loop rond de stoelen... pas als de muziek <b>stopt</b> rennen en <b>A</b>!' : R.state === 'fake' ? '<b>Stilte...</b> is dit echt een STOP?' : R.state === 'stop' ? '<b>NU!</b> Ren naar een stoel en druk op A (B = duwen)' : R.state === 'intro' ? 'Maak je klaar...' : '';
      const h = (msg ? msg + ' &nbsp;·&nbsp; ' : '') + marks;
      if (h !== R.lastHint) { R.lastHint = h; hud.setHint(h); }
    }

    // ------------------------------------------------------------ update: spelers
    function humanInput(e) {
      if (e.auto) { const a = aiStepAuto(e); return a; }
      const p = pvp.input(e.id);
      return { x: p.x, z: p.y, a: p.aP, b: p.bP, mag: p.mag, run: true, speedMul: 1 };
    }
    function aiStepAuto(e) { // om een broer door de AI te laten spelen (test)
      if (!e.ai) e.ai = { smart: true, react: 0, delay: 0, target: null, orbA: Math.atan2(e.z, e.x), orbR: 6.2, fakeFall: false, fakeT: 0, pushT: 0, confused: 0, sprint: 0, dir: 1 };
      const o = aiStep(e, 1 / 60); o.mag = Math.hypot(o.x, o.z); return o;
    }
    function movePlayer(e, dt) {
      const sp = speedOf(e);
      let inp;
      if (e.ai && !e.auto) { inp = aiStep(e, dt); inp.mag = Math.hypot(inp.x, inp.z); }
      else inp = humanInput(e);
      let mx = 0, mz = 0;
      if (canAct(e) && (R.state === 'music' || R.state === 'fake' || R.state === 'stop' || (e.ai && R.state === 'intro'))) { mx = inp.x; mz = inp.z; }
      const maxSp = WALK * sp * (inp.speedMul || 1) * (e.bro ? 1 : 1.0);
      const tvx = mx * maxSp, tvz = mz * maxSp;
      const acc = lerp(15, 1.6, SLIP);
      const f = 1 - Math.exp(-acc * dt);
      e.vx += (tvx - e.vx) * f; e.vz += (tvz - e.vz) * f;
      const m = Math.hypot(mx, mz); if (m > 0.2 && canAct(e)) e.face = Math.atan2(mx, mz);
      e.c.speed = clamp(Math.hypot(e.vx, e.vz) / WALK, 0, 1);
      // acties
      if (canAct(e) && (R.state === 'music' || R.state === 'fake' || R.state === 'stop')) {
        if (inp.a) tryAction(e);
        if (inp.b) tryPush(e);
      }
    }
    function integrate(e, dt) {
      // positie en verticale beweging
      if (e.mode === 'walk' || e.mode === 'hop' || e.mode === 'stun') {
        e.x += e.vx * dt; e.z += e.vz * dt;
        if (e.mode === 'stun') { const fr = Math.exp(-4 * dt); e.vx *= fr; e.vz *= fr; }
        const r = Math.hypot(e.x, e.z), lim = ARENA_R - 0.4;
        if (r > lim) { e.x *= lim / r; e.z *= lim / r; const nx = e.x / lim, nz = e.z / lim; const vn = e.vx * nx + e.vz * nz; if (vn > 0) { e.vx -= vn * nx; e.vz -= vn * nz; } }
        if (e.mode !== 'walk' || e.y > PLAT_Y + 0.001 || e.vy > 0) {
          e.vy -= 24 * GF * dt; e.y += e.vy * dt;
          if (e.y <= PLAT_Y) { e.y = PLAT_Y; e.vy = 0; if (e.mode === 'hop') { e.mode = 'walk'; e.modeT = 0; audio.sfx('land', { vol: 0.3 }); } }
        }
      }
      if (e.mode === 'hop') { e.modeT += dt; }
      if (e.mode === 'stun') { e.stunT -= dt; stars(e); if (e.stunT <= 0 && e.y <= PLAT_Y + 0.001) { e.mode = 'walk'; } }
    }
    function updateDive(e, dt) {
      const d = e.dive; if (!d) { e.mode = 'walk'; return; }
      e.modeT += dt; const k = clamp(e.modeT / d.dur, 0, 1);
      const ch = d.chair;
      const tx = ch.x, tz = ch.z, ty = PLAT_Y;
      e.x = lerp(d.fx, tx, smoothstep(0, 1, k) * 0.15 + k * 0.85); e.z = lerp(d.fz, tz, smoothstep(0, 1, k) * 0.15 + k * 0.85);
      const arc = (1.15 / Math.pow(GF, 0.7)) * 4 * k * (1 - k);
      e.y = lerp(d.fy, ty, k) + arc;
      e.face = Math.atan2(tx - d.fx, tz - d.fz);
      e.c.air = true;
      if (k >= 1) {
        e.c.air = false;
        if (!ch.occupant && ch.state === 'idle') { sitOn(e, ch, d.early); }
        else { e.dive = null; e.mode = 'stun'; e.stunT = 0.9; e.vx = (e.x - ch.x) * 3; e.vz = (e.z - ch.z) * 3 + 2; e.vy = 5; e.bonks++; say('BONK!', e.x, e.z, '#ff8a8a', 1.0, 4.4); audio.sfx('hit', { vol: 0.7 }); ctx.shake(0.2); }
      }
    }
    function updateSeated(e, dt) {
      const ch = e.seat; if (!ch) { e.mode = 'walk'; return; }
      if (e.mode === 'slide') {
        e.modeT += dt; const s = e.slide; const k = smoothstep(0, 1, clamp(e.modeT / 0.2, 0, 1));
        e.x = lerp(s.fx, ch.x, k); e.z = lerp(s.fz, ch.z, k); e.y = lerp(s.fy, seatedY(e, ch), k);
        if (e.modeT >= 0.2) { e.mode = 'sit'; e.modeT = 0; fx.particles.burst(e.x, e.y + 0.4, e.z, { count: 8, speed: 2.5, up: 1, life: 0.4, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 4 }); ch.hop = -0.08; }
      } else {
        e.x = ch.x; e.z = ch.z; e.y = seatedY(e, ch);
      }
      e.face = 0;
      if (e.early) { e.earlyT += dt; if (e.earlyT > 0.55 && musicOn()) bonk(e, 'Te vroeg!'); }
    }
    function playerVisuals(e, dt) {
      const c = e.c;
      // pose bepalen
      let pose = 'idle';
      if (e.mode === 'sit' || e.mode === 'slide') pose = R.goldSitter === e ? 'cheer' : 'sit';
      else if (e.mode === 'stun' || e.mode === 'elim') pose = 'scared';
      else if (e.mode === 'fly') pose = 'hands_up';
      else if (e.mode === 'spec') pose = e.specPose || 'sad';
      else if (e.mode === 'podium' || e.mode === 'cheerside') pose = 'cheer';
      else if (e.pushPoseT > 0) pose = 'push';
      c.pose = pose;
      c.air = e.mode === 'dive' || e.mode === 'hop' || (e.mode === 'fly');
      if (e.mode !== 'walk') c.speed = e.mode === 'stun' ? 0 : c.speed * 0;
      c.faceDir(Math.sin(e.face), Math.cos(e.face));
      c.update(dt);
      e.holder.position.set(e.x, e.y, e.z);
      e.holder.scale.setScalar(Math.max(0.01, e.gs * e.scaleK));
      // wiebelen bij lopen
      const sp = Math.hypot(e.vx, e.vz);
      if (e.mode === 'walk' && sp > 0.5) { e.holder.rotation.z = Math.sin(T * 14 + e.id) * 0.03 * Math.min(1, sp / 6); }
      else if (e.mode !== 'elim' && e.mode !== 'fly') e.holder.rotation.z = damp(e.holder.rotation.z, 0, 10, dt);
      // ring/blob/tag
      const onGround = (e.mode === 'walk' || e.mode === 'stun' || e.mode === 'hop' || e.mode === 'dive') && e.alive;
      e.ring.visible = onGround && e.bro; e.ring.position.set(e.x, PLAT_Y + 0.03, e.z);
      e.ring.scale.setScalar(e.sz * (1 + Math.sin(T * 6 + e.id) * 0.04));
      e.blob.visible = onGround || e.mode === 'sit' || e.mode === 'slide'; e.blob.position.set(e.x, PLAT_Y + 0.04, e.z); e.blob.scale.setScalar(e.sz * 1.1 * Math.max(0.5, 1 - (e.y - PLAT_Y) * 0.15));
      const showTag = e.alive || e.mode === 'spec' || e.mode === 'podium';
      e.tag.visible = showTag && e.mode !== 'elim' && e.mode !== 'fly'; e.tag.position.set(e.x, e.y + e.c.height * e.gs + 0.95, e.z);
      e.pushPoseT = Math.max(0, (e.pushPoseT || 0) - dt);
    }
    function collisions() {
      const act = E.filter((e) => e.alive && (e.mode === 'walk' || e.mode === 'stun' || e.mode === 'hop'));
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const a = act[i], b = act[j]; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3; const m = a.rad + b.rad;
        if (d < m && Math.abs(a.y - b.y) < 1.5) { const o = (m - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o; }
      }
    }

    // ------------------------------------------------------------ update: stoelen
    function updateChairs(dt) {
      for (const ch of chairs) {
        if (!ch.active) continue;
        // ring draait
        if ((ch.state === 'idle' || ch.state === 'prerun') && !ch.detached) { const a = ch.ang + R.ringRot; ch.x = Math.cos(a) * ch.rc; ch.z = Math.sin(a) * ch.rc; }
        // weglopen
        if (ch.state === 'prerun') {
          ch.runT += dt;
          ch.v.feet.visible = true;
          const sq = Math.sin(ch.runT * 40) * 0.04; ch.holder.scale.set(1 + sq, 1 - sq, 1 + sq);
          if (ch.runT > 0.35) {
            ch.state = 'run'; ch.runT = 0;
            // vluchtrichting: weg van de dichtstbijzijnde speler
            let nx = 0, nz = 0; for (const e of E) if (e.alive && !e.seat) { const dx = ch.x - e.x, dz = ch.z - e.z, d = Math.hypot(dx, dz) || 1; nx += dx / d / (d + 0.5); nz += dz / d / (d + 0.5); }
            const ang = Math.atan2(nz, nx) + rand(-0.6, 0.6); ch.rvx = Math.cos(ang) * 5.2; ch.rvz = Math.sin(ang) * 5.2;
            audio.sfx('boing', { vol: 0.6, rate: 1.4 }); say('Hé, mijn stoel!', ch.x, ch.z, '#ffe14a', 1.1, 5.2);
          }
        } else if (ch.state === 'run') {
          ch.runT += dt;
          ch.x += ch.rvx * dt; ch.z += ch.rvz * dt;
          const r = Math.hypot(ch.x, ch.z), lim = 7.6;
          if (r > lim) { ch.x *= lim / r; ch.z *= lim / r; const nx = ch.x / lim, nz = ch.z / lim; const vn = ch.rvx * nx + ch.rvz * nz; ch.rvx -= 2 * vn * nx; ch.rvz -= 2 * vn * nz; }
          ch.hop = Math.abs(Math.sin(ch.runT * 14)) * 0.35;
          if (Math.random() < dt * 20) fx.particles.dust(ch.x, PLAT_Y, ch.z, 1);
          if (ch.runT > 1.9) { ch.state = 'idle'; ch.detached = true; ch.hop = 0; ch.v.feet.visible = false; ch.holder.scale.setScalar(1); fx.particles.burst(ch.x, PLAT_Y + 0.5, ch.z, { count: 10, speed: 3, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xd8c8a8], gravity: 4 }); audio.sfx('land', { vol: 0.4 }); }
        }
        // gouden stoel glinstert
        if (ch.kind === 'golden') { const a = ch.v.aura; if (a) { a.material.opacity = 0.55 + Math.sin(T * 5) * 0.25; } if (Math.random() < dt * 10) fx.particles.emit(ch.x + rand(-0.8, 0.8), PLAT_Y + 1 + Math.random() * 3, ch.z + rand(-0.5, 0.5), 0, 0.8, 0, { life: 0.8, size: 0.25, color: 0xfff2a0, gravity: -1 }); }
        // rokende stoel
        if (ch.kind === 'smoky' && !ch.boomed) {
          const k = ch.fuse >= 0 ? 1 : 0.35;
          if (Math.random() < dt * (14 + 30 * k)) fx.particles.emit(ch.x + rand(-0.5, 0.5), PLAT_Y + 2.6, ch.z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(1.2, 2.4), 0, { life: 1.3, size: 0.9 + k * 0.5, color: ch.fuse >= 0 ? 0x333333 : 0x888888, gravity: -0.6 });
          if (ch.fuse >= 0 && Math.random() < dt * 30) fx.particles.emit(ch.x + rand(-0.4, 0.4), PLAT_Y + 1.6, ch.z, rand(-1, 1), rand(1, 3), 0, { life: 0.4, size: 0.4, color: 0xff7a1a, gravity: 3 });
          const f = ch.v.fire; if (f) f.material.opacity = ch.fuse >= 0 ? 0.5 + Math.sin(T * 40) * 0.3 : 0.12 + Math.sin(T * 6) * 0.05;
          ch.holder.rotation.z = ch.fuse >= 0 ? Math.sin(T * 60) * 0.05 : Math.sin(T * 9) * 0.015;
          // lont
          if (ch.fuse >= 0) { ch.fuse -= dt; if (ch.fuse < 0) explodeChair(ch); }
          else if (ch.occupant && (ch.occupant.mode === 'sit' || ch.occupant.mode === 'slide') && !ch.occupant.early) { ch.fuse = 0.9; say('Tsssss...', ch.x, ch.z, '#ffb04a', 1.0, 5); audio.sfx('sizzle', { vol: 0.7 }); }
        }
        ch.holder.position.set(ch.x, PLAT_Y + ch.hop, ch.z);
        ch.shadow.position.set(ch.x, PLAT_Y + 0.04, ch.z); ch.shadow.scale.setScalar(CHAIR_SCALE * 1.05);
        // markering "vrij" tijdens het stoppen
        if (R.state === 'stop' && !ch.occupant && ch.state === 'idle') { ch.v.group.position.y = Math.sin(T * 10 + ch.k) * 0.06; } else ch.v.group.position.y = 0;
        ch.hop = ch.state === 'run' ? ch.hop : damp(ch.hop, 0, 12, dt);
        // label op de gouden stoel / zitter
      }
    }
    function explodeChair(ch) {
      ch.boomed = true;
      const s = ch.occupant; ch.v.fire && (ch.v.fire.material.opacity = 0);
      audio.sfx('explode', { vol: 1 }); ctx.shake(0.9); R.camPunch = 1.4;
      fx.particles.burst(ch.x, PLAT_Y + 1.5, ch.z, { count: 90, speed: 10, up: 1.4, life: 1.4, size: 0.9, colors: [0xff7a1a, 0xffd23f, 0x444444, 0x888888, 0xff3a1a], gravity: 3 });
      fx.particles.ring(ch.x, PLAT_Y + 0.3, ch.z, { count: 26, speed: 9, color: 0xffe0a0, size: 0.5, life: 0.5 });
      say('BOEM!', ch.x, ch.z, '#ffb04a', 1.6, 5.5);
      ch.v.group.traverse((o) => { if (o.isMesh && o.material && o.material.color && !o.material.isMeshBasicMaterial) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } });
      if (s) {
        s.safe = true; s.mode = 'fly'; s.seat = ch; /* stoel blijft van hem */ s.early = false;
        const ang = rand(0, TAU); s.fly = { vx: Math.cos(ang) * 5, vz: Math.sin(ang) * 4 + 2, vy: 14 * Math.sqrt(1 / GF) * 0.85, rot: 0, t: 0 };
        s.x = ch.x; s.z = ch.z; s.y = seatedY(s, ch);
        say('Gered?!', s.x, s.z + 1, '#ffffff', 1.0, 8);
      }
    }
    function updateFly(e, dt) {
      const f = e.fly; if (!f) { e.mode = 'walk'; return; }
      f.t += dt; f.vy -= 24 * GF * dt; e.x += f.vx * dt; e.z += f.vz * dt; e.y += f.vy * dt; f.rot += dt * 11;
      const r = Math.hypot(e.x, e.z); if (r > ARENA_R - 0.6) { e.x *= (ARENA_R - 0.6) / r; e.z *= (ARENA_R - 0.6) / r; }
      e.holder.rotation.set(f.rot * 0.6, 0, f.rot);
      if (Math.random() < dt * 40) fx.particles.emit(e.x, e.y + 0.8, e.z, 0, 0, 0, { life: 0.6, size: 0.7, color: 0x555555, gravity: -0.3 });
      if (e.y <= PLAT_Y && f.vy < 0) {
        e.y = PLAT_Y; e.fly = null; e.mode = 'stun'; e.stunT = 0.9; e.vx = e.vy = e.vz = 0; e.holder.rotation.set(0, 0, 0);
        const ch = e.seat; e.seat = null; // blijft veilig, maar de kapotte stoel is van hem
        e.sootT = 99; fx.particles.dust(e.x, PLAT_Y, e.z, 12, 0x444444); audio.sfx('thud', { vol: 0.8 }); say('Au!', e.x, e.z, '#ffd24a', 1.0, 4);
        e.safeChair = ch;
      }
    }
    function updateElim(e, dt) {
      const f = e.fall; if (!f) return;
      f.t += dt;
      if (f.t < 0.6) {   // eerst naar het midden van het podium schuiven, zodat iedereen het ziet
        const k = smoothstep(0, 1, f.t / 0.6);
        e.x = lerp(f.fx, f.tx, k); e.z = lerp(f.fz, f.tz, k); e.face = Math.atan2(f.tx - f.fx, f.tz - f.fz); e.c.speed = 0; e.y = PLAT_Y + Math.abs(Math.sin(f.t * 22)) * 0.1;
        return;
      }
      const t = f.t - 0.6;
      if (!f.spring) {
        // valluik
        const open = smoothstep(0, 1, clamp(t / 0.4, 0, 1)) * (t < 1.7 ? 1 : 1 - clamp((t - 1.7) / 0.4, 0, 1));
        trapdoor.open(open);
        if (t > 0.45) {
          e.vy -= 30 * dt; e.y += e.vy * dt; e.holder.rotation.z += dt * 3; e.vx *= 0.9; e.vz *= 0.9;
          const k = clamp((PLAT_Y - e.y) / 3.5, 0, 1); e.scaleK = 1 - k * 0.9;
          if (!f.sound) { f.sound = true; audio.tone(900, 0.9, { type: 'sine', vol: 0.18, slide: 120 }); }
          if (e.y < PLAT_Y - 4.2 && !f.gone) { f.gone = true; e.holder.visible = false; audio.sfx('thud', { vol: 0.9 }); ctx.shake(0.3); fx.particles.burst(e.x, PLAT_Y + 0.4, e.z, { count: 20, speed: 5, up: 2, life: 0.8, size: 0.6, colors: [0x333333, 0x666666], gravity: 6 }); say('Plof...', e.x, e.z, '#cfcfcf', 1.0, 3); }
        } else { e.y = PLAT_Y + Math.sin(t * 60) * 0.03; }
        if (t > 2.1) { trapdoor.group.visible = false; finishElim(e); }
      } else {
        // springplank / katapult
        const comp = t < 0.55 ? smoothstep(0, 1, t / 0.55) : 0;
        if (t < 0.55) { spring.setK(1 - comp * 0.75); e.y = PLAT_Y + spring.plank.position.y + 0.02; }
        else if (!f.launched) {
          f.launched = true; spring.setK(1.0); audio.sfx('boing', { vol: 1, rate: 0.9 }); audio.sfx('whoosh', { vol: 0.8 }); ctx.shake(0.5);
          const s = e.slot || slotFor(e); e.slot = s;
          f.T0 = 1.5; f.fx = e.x; f.fz = e.z; f.tx2 = s.x; f.tz2 = s.z; f.ty = s.y;
          fx.particles.burst(e.x, PLAT_Y + 0.3, e.z, { count: 26, speed: 6, up: 1, life: 0.6, size: 0.5, colors: [0xffffff, 0xd8c8a8, 0xffe14a], gravity: 5 });
          fx.texts.add('BOIOIOING!', e.x, 4.5, e.z, '#ffe14a', 1.4);
        }
        if (f.launched) {
          const tt = t - 0.55; const k = clamp(tt / f.T0, 0, 1);
          e.x = lerp(f.fx, f.tx2, k); e.z = lerp(f.fz, f.tz2, k);
          e.y = lerp(PLAT_Y + 1, f.ty, k) + Math.sin(k * Math.PI) * 6.5;
          e.holder.rotation.z = tt * 14; e.holder.rotation.x = tt * 5;
          if (Math.random() < dt * 40) fx.particles.emit(e.x, e.y + 0.6, e.z, 0, 0, 0, { life: 0.5, size: 0.5, color: 0xffe14a, gravity: 0 });
          if (k >= 1 && !f.landed) { f.landed = true; fx.particles.burst(e.x, e.y + 0.5, e.z, { count: 20, speed: 4, up: 1.5, life: 0.7, size: 0.5, colors: [0xffffff, 0xffe14a], gravity: 3 }); fx.texts.add('PLING!', e.x, e.y + 3, e.z, '#ffffff', 1.1); audio.sfx('ding', { vol: 0.8 }); }
          if (tt > 0.35) spring.setK(Math.max(0.3, 1 - (tt - 0.35) * 1.5));
        }
        if (t > 0.55 + 1.5 + 0.2) { spring.group.visible = false; finishElim(e); }
      }
    }
    function finishElim(e) {
      e.fall = null; e.holder.visible = true; e.holder.rotation.set(0, 0, 0); e.scaleK = 1;
      toSpectator(e);
      e.specPose = e.id < 2 ? 'sad' : 'sad'; R.state = 'between'; R.t = 0;
      if (R.elimKind === 'trap') {}
      refreshHud();
    }

    // ------------------------------------------------------------ hoofd-update
    function updatePick(dt) {
      const pk = R.pick; if (!pk) { return; }
      pk.t -= dt; hud.setTimer(pk.t, 2);
      const by = pk.by;
      if (by.bro && !by.auto) {
        const inp = pvp.input(by.id);
        if (inp.leftP || inp.rightP || inp.upP || inp.downP) { const dir = (inp.rightP || inp.downP) ? 1 : -1; pk.idx = (pk.idx + dir + pk.cand.length) % pk.cand.length; audio.sfx('click', { vol: 0.6 }); }
        if (inp.aP && pk.t < 5.0) { applyPick(); return; }
      } else {
        pk.aiT -= dt;
        if (pk.aiT <= 0) {
          // AI: liefst een broer (anders de staande)
          const bros = pk.cand.filter((c) => c.bro);
          const ch = Math.random() < 0.55 && bros.length ? pick(bros) : pk.cand[pk.idx];
          pk.idx = pk.cand.indexOf(ch); applyPick(); return;
        }
        if (Math.random() < dt * 4) pk.idx = (pk.idx + 1) % pk.cand.length;
      }
      if (pk.t <= 0) applyPick();
    }
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xffd24a })); arrow.rotation.x = Math.PI; arrow.visible = false; scene.add(arrow);

    function stepRound(dt) {
      R.t += dt;
      switch (R.state) {
        case 'prep': startRound(); break;
        case 'intro': if (R.t > 2.1) { R.state = 'music'; R.t = 0; R.musicT = 0; openMusic(); R.nextNote = 0; hud.showBig('♪ MUZIEK!', 800, '#7affb0'); audio.sfx('go', { vol: 0.5 }); statusHint(); } break;
        case 'music': {
          R.musicT += dt; R.bpm = bpmNow();
          R.omega = 0.32 + Math.min(0.6, R.musicT * 0.04);
          scheduleMusic();
          if (R.fakeAt > 0 && !R.fakeDone && R.musicT >= R.fakeAt) { startFake(); break; }
          if (R.musicT >= R.stopAt) doStop();
          break;
        }
        case 'fake': R.fakeT += dt; R.omega *= Math.exp(-dt * 6); if (R.fakeT >= 0.95) endFake(); break;
        case 'stop': {
          R.stopT += dt; R.omega *= Math.exp(-dt * 7);
          // chaos: iedereen aan het rennen
          if (chairsFull() && !R.allSat) { R.allSat = true; R.settleT = 0; }
          if (R.allSat) {
            R.settleT += dt;
            // wacht tot duikende / glijdende spelers zitten en niemand meer vliegt
            const busy = E.some((e) => e.alive && (e.mode === 'dive' || e.mode === 'slide' || e.mode === 'fly' || (e.mode === 'stun' && e.vy !== 0 && false)));
            if (!busy && R.settleT > 0.75) resolveRound();
          }
          if (R.stopT > 6.2 && !R.allSat) { autoAssign(); }
          if (R.stopT > 11) { autoAssign(); R.allSat = true; }
          break;
        }
        case 'pick': updatePick(dt); break;
        case 'elim': if (!R.victim) { R.state = 'between'; } break;
        case 'between': if (R.t > 1.2) { for (const e of E) { if (e.alive && e.mode !== 'spec') { /* terug naar start */ } } if (alive().length <= 1 || R.n >= MAX_ROUNDS) startTrophy(); else startRound(); } break;
        case 'trophy': {
          // trofee zakt naar beneden
          const k = clamp(R.t / 1.6, 0, 1); trophy.position.y = lerp(PLAT_Y + 10, PLAT_Y + 5.2, smoothstep(0, 1, k)) + Math.sin(T * 3) * 0.1; trophy.rotation.y += dt * 1.5;
          if (trophy.userData.star) trophy.userData.star.rotation.y += dt * 4;
          if (Math.random() < dt * 12) fx.particles.burst(rand(-6, 6), rand(7, 12), rand(-3, 2), { count: 14, speed: 6, up: 0.6, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff, 0xb06aff], gravity: 4 });
          if (Math.random() < dt * 25) fx.particles.emit(rand(-9, 9), 13, rand(-5, 3), 0, -3, 0, { life: 3, size: 0.3, color: [0xffe14a, 0xff6fa5, 0x6fd8ff][Math.floor(Math.random() * 3)], gravity: 2, shrink: false });
          if (!R.trophyBeep && R.t > 1.6) { R.trophyBeep = true; audio.sfx('star', { vol: 0.8 }); ctx.shake(0.4); }
          if (R.t > 5.2) finishGame();
          break;
        }
        default: break;
      }
      R.ringRot += R.omega * dt;
    }
    function visualsCommon(dt) {
      hall.update(T + introT);
      for (const e of E) playerVisuals(e, dt);
      // pick-pijl
      arrow.visible = !!R.pick;
      if (R.pick) { const t = R.pick.cand[R.pick.idx]; if (t) { arrow.position.set(t.x, t.y + t.c.height * t.gs + 2.4 + Math.sin(T * 8) * 0.25, t.z); arrow.rotation.y += dt * 4; } }
      // band + koning bewegen mee met de muziek
      const bounce = musicOn() ? 1 : 0;
      king.pose = (R.state === 'trophy' || R.state === 'stop' || R.state === 'pick') ? 'cheer' : musicOn() ? 'dance' : 'sit'; king.update(dt);
      band.forEach((b, i) => { if (i === 0) return; b.pose = musicOn() || R.state === 'trophy' || R.state === 'intro' ? 'dance' : R.state === 'stop' ? 'scared' : 'idle'; b.update(dt); });
      // zwevende noten tijdens de muziek
      while (beatQueue.length) { beatQueue.shift(); }
      R.noteT = (R.noteT || 0) - dt;
      if (musicOn() && R.state === 'music' && R.noteT <= 0) {
        R.noteT = 60 / R.bpm * 0.9;
        const src = Math.random() < 0.5 ? bard : goblin; const s = noteSprite(Math.random() < 0.5 ? '♪' : '♫', ['#ffe14a', '#7affb0', '#ff9ac8', '#9fd8ff'][Math.floor(Math.random() * 4)]);
        s.position.set(src.group.position.x, 4.5, src.group.position.z + 0.5); scene.add(s); notes.push({ s, t: 0, vx: rand(-1, 1), ph: Math.random() * 6 });
      }
      for (let i = notes.length - 1; i >= 0; i--) { const n = notes[i]; n.t += dt; n.s.position.y += dt * 2.2; n.s.position.x += Math.sin(n.t * 3 + n.ph) * dt * 1.2 + n.vx * dt * 0.4; n.s.material.opacity = 1 - clamp((n.t - 1.8) / 0.8, 0, 1); if (n.t > 2.6) { scene.remove(n.s); n.s.material.dispose(); notes.splice(i, 1); } }
      // kandelaars/lichtjes flitsen mee op het ritme
      L.hemi.intensity = damp(L.hemi.intensity, R.state === 'stop' ? 1.7 : 1.25 + (musicOn() ? Math.sin(T * R.bpm / 60 * Math.PI) * 0.12 : 0), 8, dt);
    }
    const notes = [];

    // camera
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(0, 1.8, 0);
    const camDir = new THREE.Vector3(0, 13.7, 26.8).normalize();
    function placeCamera(dt, mode = 0) {
      const aspect = camera.aspect || 1.7;
      const fov = 42; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const need = 16;                                   // halve breedte die in beeld moet
      let Dt = Math.max(24, need / (Math.tan(fov * Math.PI / 360) * aspect));
      R.camPunch = Math.max(0, R.camPunch - dt * 2.5);
      Dt *= (1 - R.camPunch * 0.06);
      let ty = 1.8; if (R.state === 'trophy') { Dt *= 0.88; ty = 3; }
      const sway = Math.sin((T + introT) * 0.5) * (mode ? 2 : 0.5);
      camL.set(0, ty, 0.8); camP.copy(camL).addScaledVector(camDir, Dt); camP.x += sway;
      camera.position.copy(camP); camera.lookAt(camL);
    }

    // ------------------------------------------------------------ frame
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt; gameT += dt;
      if (gameT > HARD_LIMIT && !finishCalled) { forceEnd(); }
      stepRound(dt);
      // spelers
      for (const e of E) {
        e.pushCd = Math.max(0, e.pushCd - dt); e.hopCd = Math.max(0, e.hopCd - dt);
        if (!e.alive && e.mode !== 'elim' && e.mode !== 'spec') continue;
        if (e.mode === 'walk' || e.mode === 'hop') { if (e.mode === 'walk' || e.mode === 'hop') movePlayer(e, dt); }
        else if (e.mode === 'stun') { /* geen besturing */ }
        if (e.mode === 'dive') updateDive(e, dt);
        else if (e.mode === 'sit' || e.mode === 'slide') updateSeated(e, dt);
        else if (e.mode === 'fly') updateFly(e, dt);
        else if (e.mode === 'elim') updateElim(e, dt);
        else if (e.mode === 'spec') { e.specPop = (e.specPop || 0) + dt; e.scaleK = damp(e.scaleK, 1, 8, dt); e.c.pose = e.specPose || 'sad'; if (R.state === 'stop' || R.state === 'music') e.specPose = Math.sin(T * 3 + e.id) > 0.3 ? 'cheer' : 'sad'; e.y = e.slot ? e.slot.y + Math.abs(Math.sin(T * 8 + e.id)) * (e.specPose === 'cheer' ? 0.25 : 0) : e.y; }
        else if (e.mode === 'podium') { e.y = PLAT_Y; }
        else if (e.mode === 'cheerside') { /* blijft staan */ }
        if (e.mode === 'walk' || e.mode === 'stun' || e.mode === 'hop') integrate(e, dt);
        // te vroeg "geland"
        if (e.mode === 'stun' && e.seat) { e.seat = null; }
      }
      collisions();
      updateChairs(dt);
      // blazen van de slimme bots in de ronde 'trophy'
      if (R.state === 'trophy') { const we = E[winnerBro]; if (we) { we.c.pose = 'cheer'; we.y = PLAT_Y + Math.abs(Math.sin(T * 7)) * 0.5; } }
      visualsCommon(dt);
      if (Math.floor(T * 4) !== R.hudT || R.state !== R.hudS) { R.hudT = Math.floor(T * 4); R.hudS = R.state; refreshHud(); if (R.state !== 'pick' && R.state !== 'trophy') statusHint(); }
      placeCamera(dt);
    }
    function resultUpdate(dt) {
      T += dt; resultT += dt; R.state = 'trophy';
      trophy.rotation.y += dt * 1.5; if (trophy.userData.star) trophy.userData.star.rotation.y += dt * 4;
      for (const e of E) { if (e.mode === 'podium') { e.c.pose = 'cheer'; e.y = PLAT_Y + Math.abs(Math.sin(T * 7)) * 0.5; } }
      visualsCommon(dt); placeCamera(dt);
    }
    function introUpdate(dt) {
      introT += dt;
      if (R.state === 'prep' && !R.laid) {
        R.laid = true;
        // beginopstelling voor de intro-kaart
        R.chairsN = 3; R.gimmick = null; layoutChairs();
        E.forEach((e, k) => { const a = k / 4 * TAU + 0.6; e.x = Math.cos(a) * 5.8; e.z = Math.sin(a) * 5.8; e.y = PLAT_Y; e.face = a + Math.PI / 2; });
      }
      R.ringRot += 0.25 * dt;
      for (const e of E) { e.c.pose = 'idle'; e.c.speed = 0; if (e.ai) { e.ai.orbA += 0.5 * dt; e.x = Math.cos(e.ai.orbA) * 5.8; e.z = Math.sin(e.ai.orbA) * 5.8; e.c.speed = 0.55; e.face = Math.atan2(-Math.sin(e.ai.orbA), Math.cos(e.ai.orbA)); } else { e.c.speed = 0; } }
      for (const ch of chairs) if (ch.active) { const a = ch.ang + R.ringRot; ch.x = Math.cos(a) * ch.rc; ch.z = Math.sin(a) * ch.rc; ch.holder.position.set(ch.x, PLAT_Y, ch.z); ch.shadow.position.set(ch.x, PLAT_Y + 0.04, ch.z); ch.shadow.scale.setScalar(CHAIR_SCALE * 1.05); }
      hall.update(introT);
      for (const e of E) playerVisuals(e, dt);
      king.pose = 'sit'; king.update(dt); band.forEach((b, i) => { if (i) { b.pose = 'idle'; b.update(dt); } });
      placeCamera(dt, 1);
    }
    function forceEnd() {
      // noodrem: kies winnaar op de stand
      for (const e of E) { if (e.alive) { /* leeft nog */ } }
      if (R.state !== 'trophy') { try { startTrophy(); } catch (err) { console.error(err); } }
      finishGame();
    }

    // eerste opstelling
    R.state = 'prep';
    E.forEach((e, k) => { const a = k / 4 * TAU + 0.6; e.x = Math.cos(a) * 5.8; e.z = Math.sin(a) * 5.8; e.y = PLAT_Y; e.face = a + Math.PI / 2; if (e.ai) e.ai.orbA = a; });
    R.chairsN = 3; layoutChairs();
    for (const e of E) playerVisuals(e, 0.016);
    placeCamera(1, 1);
    hud.setTimer(null); hud.setScore('Stoelendans');

    return {
      update, introUpdate, resultUpdate,
      onCountdown() { R.lastHint = null; refreshHud(); },
      onStart() { R.lastHint = null; try { audio.music(null); } catch (e) { /* weg */ } refreshHud(); },
      onSwap(sw) { for (const e of E.slice(0, 2)) fx.particles.burst(e.x, e.y + 1.5, e.z, { count: 26, speed: 5, up: 1, life: 0.9, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff], gravity: 4 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m) return; const e = E[i]; if (e.alive && (e.mode === 'walk')) { e.mode = 'stun'; e.stunT = 1.6; e.vy = 5; say('De Deurman zag je!', e.x, e.z, '#ff7a7a', 1.1, 5); } });
      },
      celebrate(w) {
        for (const e of E) { if (e.mode === 'podium' || e.id === w) e.c.pose = 'cheer'; }
        const l = E[1 - w]; if (l.mode === 'spec') l.specPose = 'sad';
      },
      dispose() { try { if (mg) mg.disconnect(); } catch (e) { /* weg */ } },
      dbg: {
        state: () => ({ T, gameT, n: R.n, rs: R.state, musicT: R.musicT, stopAt: R.stopAt, fakeAt: R.fakeAt, gimmick: R.gimmick, chairsN: R.chairsN, alive: E.map((e) => e.alive), modes: E.map((e) => e.mode), outRound: E.map((e) => e.outRound), done, finishCalled, winnerBro, log: log.slice(), seated: E.map((e) => !!e.seat), early: E.map((e) => e.early), bonks: E.map((e) => e.bonks) }),
        E, chairs, R, auto: (i, v = true) => { E[i].auto = v; },
        tryAction, tryPush, forceEnd, setElim: (k) => { R.forceElim = k; },
      },
    };
  },
};

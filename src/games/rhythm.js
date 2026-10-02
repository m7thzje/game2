import * as THREE from 'three';
import { mat, glow, mesh, clamp, lerp, damp, rand, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { buildStage } from './rhythm_world.js';
import { NOTES, BEAT, BAR, SONG_END, LAST_NOTE_T, EVENTS, DUETS, mtof, sectionAt } from './rhythm_song.js';

// Straatmuzikant: Guitar-Hero/Taiko-duet voor twee broers. Eigen tijdklok (songT), eigen muziek via audio.tone.

const SPEED = 11;                 // eenheden per seconde
const LOOK = 2.7;                 // zoveel seconden vooruit zie je noten
const W_PERFECT = 0.15, W_GOOD = 0.28;
const LANE_W = 1.35, HX = [-4.55, 4.55];
const LANE_COL = [0xff5a7a, 0xffd24a, 0x4ac8ff, 0x62ff8a];
const LANE_X = (pl, lane) => HX[pl] + (lane - 1.5) * LANE_W;
const KEYS = [['A', 'W', 'D', 'F'], ['←', '↑', '→', 'Enter']];
const DUET_WINDOW = 0.15;
const FAIL_HYPE = 0;

function arrowShape() { const s = new THREE.Shape(); s.moveTo(0, 0.52); s.lineTo(0.5, -0.06); s.lineTo(0.2, -0.06); s.lineTo(0.2, -0.46); s.lineTo(-0.2, -0.46); s.lineTo(-0.2, -0.06); s.lineTo(-0.5, -0.06); s.closePath(); return s; }
function noteGeo(lane) {
  let g;
  if (lane === 3) g = new THREE.CylinderGeometry(0.48, 0.48, 0.26, 18);
  else {
    g = new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.26, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2);
    if (lane === 0) g.rotateY(Math.PI / 2); else if (lane === 2) g.rotateY(-Math.PI / 2);
  }
  return g;
}
function padTex(lane, label, col) {
  return canvasTex(128, 128, (g, w, h) => {
    const c = '#' + col.toString(16).padStart(6, '0');
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.fillStyle = 'rgba(10,6,20,.78)'; g.fill();
    g.lineWidth = 7; g.strokeStyle = c; g.stroke();
    g.fillStyle = c; g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.save(); g.translate(64, 56);
    if (lane === 3) { g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.fill(); g.stroke(); }
    else {
      g.rotate(lane === 0 ? -Math.PI / 2 : lane === 2 ? Math.PI / 2 : 0);
      g.beginPath(); g.moveTo(0, -30); g.lineTo(28, 2); g.lineTo(10, 2); g.lineTo(10, 26); g.lineTo(-10, 26); g.lineTo(-10, 2); g.lineTo(-28, 2); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
    g.fillStyle = '#fff'; g.font = `bold ${label.length > 2 ? 22 : 30}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(label, 64, 100); g.fillText(label, 64, 100);
  });
}
function highwayTex(col) {
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#140c24'; g.fillRect(0, 0, w, h);
    for (let l = 0; l < 4; l++) {
      const c = LANE_COL[l]; const gr = g.createLinearGradient(l * 64, 0, l * 64 + 64, 0);
      const hex = '#' + c.toString(16).padStart(6, '0');
      g.fillStyle = hex; g.globalAlpha = 0.1; g.fillRect(l * 64 + 2, 0, 60, h); g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for (let l = 1; l < 4; l++) { g.beginPath(); g.moveTo(l * 64, 0); g.lineTo(l * 64, h); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, h - 5, w, 5);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, h / 2 - 2, w, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.keep = true;
  return t;
}
function makeInstrument(kind, color) {
  const g = new THREE.Group(); const wood = mat(color, { flatShading: false }), dark = mat(0x2a1a10, { flatShading: false }), neck = mat(0x6b4a2e);
  const bodyScale = kind === 'lute' ? [1, 1.25, 0.55] : [1, 1, 0.5];
  g.add(mesh(new THREE.SphereGeometry(kind === 'lute' ? 0.3 : 0.27, 10, 8), wood, { pos: [0, -0.1, 0], scale: bodyScale }));
  if (kind !== 'lute') g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), wood, { pos: [0, 0.2, 0], scale: [1, 1, 0.5] }));
  g.add(mesh(new THREE.CircleGeometry(0.09, 10), new THREE.MeshBasicMaterial({ color: 0x120a06 }), { cast: false, pos: [0, 0.0, 0.16] }));
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.55, 0.07), neck, { pos: [0, 0.55, 0.0] }));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.07), dark, { pos: [0, 0.9, 0.0] }));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.02), mat(0xd8d0c0), { cast: false, pos: [0, -0.2, 0.17] }));
  return g;
}

export default {
  id: 'rhythm',
  name: 'Straatmuzikant',
  giver: 'Bard Bas',
  icon: '🎸',
  mode: 'coop',
  time: 70,
  pay: 1.2,
  music: 'puzzle',
  blurb: 'Speel samen een liedje op het marktplein! Druk de noten precies <b>op de lijn</b>: elke noot die je raakt laat de melodie klinken. Houd <b>A</b> vast voor de lange noten. Zijn er <b>gouden duetnoten</b>? Raak ze allebei tegelijk voor een vuurwerk-bonus! Mis je te veel, dan loopt het publiek weg.',
  controls: ['{move} baan links / omhoog / rechts: raak de noot', '{a} houd vast voor de lange (groene) noten', 'Duetnoot (goud): allebei tegelijk!'],
  tip: 'Je hoort de melodie alleen als je goed speelt. Het publiek (de toren in het midden) moet blijven vullen!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const { sun, hemi } = ctx.lights('dusk', { shadow: 18, center: [0, 0, -10] });
    sun.color.setHex(0xffc890); sun.intensity = 1.6; hemi.intensity = 1.25; hemi.color.setHex(0xd0b8ff);
    scene.fog = new THREE.Fog(0x4a3068, 55, 135);
    const stage = buildStage(ctx, { HX, LANE_W });

    // ---------- camera ----------
    camera.fov = 52;
    const camLook = new THREE.Vector3(0, 1.2, -9.5);
    let camBase = new THREE.Vector3(0, 10.2, 14.6), camT = 0, camKick = 0;
    function setCam(aspect) {
      const ft = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const need = 12.4 / (ft * aspect);             // afstand tot de speellijn zodat alles in beeld past
      const base = Math.hypot(10.2 - 0.5, 14.6);
      const f = Math.max(1, need / base);
      camBase.set(0, 0.5 + (10.2 - 0.5) * f, 14.6 * f);
      camera.position.copy(camBase); camera.lookAt(camLook); camera.updateProjectionMatrix();
    }
    setCam(camera.aspect || 1.7);

    // ---------- snelwegen ----------
    const hwTex = [0, 1].map(() => highwayTex()), HW_LEN = 34, HW_Z0 = 1.6;
    const unit = SPEED * BEAT;
    const rails = [], pads = [];
    for (let pl = 0; pl < 2; pl++) {
      const t = hwTex[pl]; t.repeat.set(1, HW_LEN / unit);
      const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.2 });
      const hw = mesh(new THREE.BoxGeometry(LANE_W * 4, 0.1, HW_LEN), m, { cast: false, pos: [HX[pl], 0.03, HW_Z0 - HW_LEN / 2] });
      // alleen bovenvlak met de textuur: andere zijden donker
      hw.material = [mat(0x140c24), mat(0x140c24), m, mat(0x140c24), mat(0x140c24), mat(0x140c24)];
      scene.add(hw);
      for (const sx of [-1, 1]) {
        const r = mesh(new THREE.BoxGeometry(0.16, 0.22, HW_LEN), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[pl], emissive: PLAYER_COLORS[pl], emissiveIntensity: 0.8 }), { cast: false, pos: [HX[pl] + sx * (LANE_W * 2 + 0.1), 0.1, HW_Z0 - HW_LEN / 2] });
        scene.add(r); rails.push(r);
      }
      // speellijn
      scene.add(mesh(new THREE.BoxGeometry(LANE_W * 4, 0.05, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), { cast: false, pos: [HX[pl], 0.12, 0] }));
      // pads
      for (let l = 0; l < 4; l++) {
        const x = LANE_X(pl, l);
        const base = mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.14, 16), mat(0x2a2038, { metalness: 0.4 }), { cast: false, pos: [x, 0.1, 0] }); scene.add(base);
        const top = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.12), new THREE.MeshBasicMaterial({ map: padTex(l, KEYS[pl][l], LANE_COL[l]), transparent: true, depthWrite: false, color: 0xb0b0c0 }));
        top.rotation.x = -Math.PI / 2; top.position.set(x, 0.19, 0); scene.add(top);
        const glowM = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), new THREE.MeshBasicMaterial({ color: LANE_COL[l], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        glowM.rotation.x = -Math.PI / 2; glowM.position.set(x, 0.21, 0); scene.add(glowM);
        pads.push({ pl, l, top, glow: glowM, press: 0, flash: 0 });
      }
      // naamplaatje
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (g, w, h) => { g.fillStyle = 'rgba(10,6,20,.8)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill(); g.lineWidth = 6; g.strokeStyle = '#' + PLAYER_COLORS[pl].toString(16).padStart(6, '0'); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(players[pl].name, w / 2, h / 2 + 2); }), transparent: true, depthWrite: false }));
      nm.rotation.x = -1.2; nm.position.set(HX[pl], 0.15, 2.1); scene.add(nm);
    }

    // ---------- noten (instanced) ----------
    const CAP = 56;
    const noteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const outMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    const shapes = [0, 1, 2, 3].map((l) => {
      const g = noteGeo(l);
      const body = new THREE.InstancedMesh(g, noteMat, CAP), out = new THREE.InstancedMesh(g, outMat, CAP);
      for (const im of [body, out]) { im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
      body.renderOrder = 3; out.renderOrder = 2;
      return { body, out, n: 0 };
    });
    const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }), 14); tails.frustumCulled = false; tails.count = 0; scene.add(tails);
    const links = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, fog: false }), 8); links.frustumCulled = false; links.count = 0; scene.add(links);
    const _o = new THREE.Object3D(), _c = new THREE.Color();

    // ---------- spelers ----------
    const perf = players.map((pp, i) => {
      const c = makeBrother(i); const SC = 1.55;
      c.group.scale.setScalar(SC); c.group.position.set(i ? 9.6 : -9.6, 0, -1.6);
      scene.add(c.group);
      const inst = makeInstrument(i ? 'lute' : 'guitar', i ? 0x5a8ae8 : 0xd08a3a); inst.position.set(0, 0.34, 0.34); inst.rotation.z = -1.15; inst.scale.setScalar(1.15); c.torso.add(inst);
      c.pose = 'carry'; c.faceDir(i ? -0.7 : 0.7, 1); c.yaw = c.targetYaw;
      return { c, i, x: i ? 9.6 : -9.6 };
    });

    // ---------- toestand ----------
    const notes = NOTES.map((n) => ({ ...n, state: 'wait', grade: '', hitAt: -9, held: 0, tickT: 0, holdSnd: 0 }));
    const duets = {}; for (const n of notes) if (n.duet) (duets[n.duet] ||= [null, null])[n.pl] = n;
    const stats = { perfect: 0, good: 0, miss: 0, ghost: 0, duetOK: 0, duetTried: 0, holdsDone: 0, maxCombo: 0, perPlayer: [{ hit: 0, miss: 0 }, { hit: 0, miss: 0 }] };
    let songT = 0, started = false, hype = 45, combo = 0, score = 0, ptr = 0, evI = 0, ending = null, endT = 0, done = false, firework = 0, accPoints = 0;
    let uiT = 0, coinT = 0, lastSection = '';
    const beatPhase = () => { const b = songT / BEAT; return b - Math.floor(b); };
    const mult = () => 1 + Math.min(3, Math.floor(combo / 10)) * 0.5;
    const total = notes.length;

    // ---------- geluid ----------
    function melody(pl, midi, vol = 1, dur = 0.5) {
      const f = mtof(midi);
      if (pl === 0) { audio.tone(f, dur, { type: 'sawtooth', vol: 0.11 * vol, filter: 1900, attack: 0.004, send: 0.2 }); audio.tone(f, dur * 0.8, { type: 'triangle', vol: 0.16 * vol }); audio.tone(f * 2, dur * 0.3, { type: 'sine', vol: 0.05 * vol }); }
      else { audio.tone(f, dur, { type: 'square', vol: 0.07 * vol, filter: 2600, send: 0.25 }); audio.tone(f, dur, { type: 'triangle', vol: 0.15 * vol, vib: 0.006 }); audio.tone(f * 2, dur * 0.4, { type: 'sine', vol: 0.06 * vol }); }
    }
    function falseNote(pl, midi) { audio.tone(mtof(midi - 1) * 0.97, 0.16, { type: 'sawtooth', vol: 0.06, filter: 600, slide: mtof(midi - 3) }); }
    function play(kind, a, b, when) {
      switch (kind) {
        case 'hat': audio.noise(0.04, { type: 'highpass', freq: 7000, vol: 0.03 * a, when }); break;
        case 'kick': audio.tone(130, 0.18, { type: 'sine', vol: 0.34, slide: 40, when }); break;
        case 'snare': audio.noise(0.14, { type: 'highpass', freq: 1800, vol: 0.1 * a, when }); audio.tone(190, 0.08, { type: 'triangle', vol: 0.08, slide: 120, when }); break;
        case 'crash': audio.noise(1.4, { type: 'highpass', freq: 3500, vol: 0.18, when }); break;
        case 'bass': audio.tone(mtof(a), b, { type: 'triangle', vol: 0.24, attack: 0.01, when }); break;
        case 'pad': audio.tone(mtof(a), b, { type: 'triangle', vol: 0.03, attack: 0.3, filter: 900, when }); break;
        case 'arp': audio.tone(mtof(a), 0.22, { type: 'triangle', vol: 0.045, when, send: 0.2 }); break;
        case 'strum': audio.tone(mtof(a), 0.15, { type: 'sawtooth', vol: 0.02, filter: 1500, when }); break;
        default: break;
      }
    }
    function schedule(upTo) {
      if (!audio.ctx || ending === 'fail') return;
      const now = audio.ctx.currentTime;
      while (evI < EVENTS.length && EVENTS[evI][0] <= upTo) {
        const e = EVENTS[evI++]; play(e[1], e[2], e[3], now + Math.max(0, e[0] - songT));
      }
    }

    // ---------- beoordelen ----------
    const say = (txt, pl, lane, col, sc = 0.55) => fx.texts.add(txt, LANE_X(pl, lane), 1.5, 0.4, col, sc);
    function changeHype(d) { hype = clamp(hype + d, FAIL_HYPE - 5, 100); }
    function hitNote(n, d, tp) {
      const perfect = d <= W_PERFECT;
      n.grade = perfect ? 'perfect' : 'good'; n.hitAt = tp;
      n.state = n.long ? 'hold' : 'hit';
      if (n.long) { n.held = 0; n.tickT = 0; n.holdSnd = 0; }
      combo++; stats.maxCombo = Math.max(stats.maxCombo, combo);
      perfect ? stats.perfect++ : stats.good++; stats.perPlayer[n.pl].hit++;
      accPoints += perfect ? 1 : 0.6;
      const pts = Math.round((perfect ? 100 : 50) * mult()); score += pts;
      changeHype(perfect ? 3.4 : 2.1);
      const x = LANE_X(n.pl, n.lane);
      melody(n.pl, n.midi, perfect ? 1 : 0.8, n.long ? 0.35 : 0.45);
      say(perfect ? 'Perfect!' : 'Goed', n.pl, n.lane, perfect ? '#ffe14a' : '#8cff9a');
      fx.particles.burst(x, 0.5, 0, { count: perfect ? 12 : 7, colors: [LANE_COL[n.lane], 0xffffff], speed: 3.5, size: 0.28, up: 1.2, gravity: 8, life: 0.6 });
      fx.particles.ring(x, 0.25, 0, { count: 10, speed: 3.5, life: 0.3, size: 0.2, color: LANE_COL[n.lane] });
      const pad = pads[n.pl * 4 + n.lane]; pad.flash = 1;
      perf[n.pl].c.swing(); if (perfect && Math.random() < 0.4) perf[n.pl].c.jump();
      if (combo % 10 === 0) { audio.sfx('ding', { vol: 0.5, rate: 1 + combo / 100 }); hud.toast(`${combo} op rij!`, 900); stage.crowdJump(0.5); }
      if (Math.random() < 0.5) stage.throwCoin();
      if (n.duet) {
        const pair = duets[n.duet]; const o = pair[1 - n.pl];
        if (o.hitAt > -5) {
          stats.duetTried++;
          if (Math.abs(o.hitAt - n.hitAt) <= DUET_WINDOW) duetSuccess(n, o); else { say('Bijna!', n.pl, n.lane, '#ffb27a', 0.6); }
        }
      }
    }
    function duetSuccess(a, b) {
      stats.duetOK++; const pts = Math.round(300 * mult()); score += pts; changeHype(8);
      hud.showBig('DUET!', 900, '#ffd84a');
      fx.texts.add(`+${pts}`, 0, 3.5, -1, '#ffd84a', 1.1);
      boom(); stage.startWave(); stage.crowdJump(0.9);
      for (let k = 0; k < 6; k++) stage.throwCoin();
      perf.forEach((p) => { p.c.jump(); p.c.swing(); });
      ctx.shake(0.25);
      audio.sfx('sparkle', { vol: 0.8 });
      audio.tone(mtof(a.midi + 12), 0.8, { type: 'sine', vol: 0.12, send: 0.4 }); audio.tone(mtof(a.midi + 7), 0.8, { type: 'triangle', vol: 0.08 });
    }
    function boom() {
      const cols = [[0xff5a7a, 0xffd24a, 0xffffff], [0x4ac8ff, 0x7aff8a, 0xffffff], [0xc07aff, 0xff9ad5, 0xffffff]];
      for (let k = 0; k < 3; k++) {
        const x = rand(-8, 8), y = rand(8, 13), z = rand(-26, -16); const cc = cols[(firework++) % cols.length];
        setTimeout(() => { if (disposed) return; fx.particles.burst(x, y, z, { count: 46, colors: cc, speed: 9, size: 0.7, up: 0.5, spread: 1.3, life: 1.5, gravity: 4 }); fx.particles.ring(x, y, z, { count: 22, speed: 7, life: 1.0, size: 0.5, color: cc[0] }); audio.noise(0.35, { type: 'highpass', freq: 2500, vol: 0.12 }); audio.tone(900 + k * 300, 0.4, { type: 'sine', vol: 0.05, slide: 200 }); }, k * 140);
      }
    }
    function missNote(n) {
      n.state = 'miss'; combo = 0; stats.miss++; stats.perPlayer[n.pl].miss++;
      changeHype(-5.5); say('Mis', n.pl, n.lane, '#aaa', 0.5);
      falseNote(n.pl, n.midi);
      pads[n.pl * 4 + n.lane].flash = -1;
      if (n.long) { /* nooit begonnen */ }
    }
    function ghost(pl, lane) {
      stats.ghost++; changeHype(-1.2); combo = Math.max(0, combo - 0); audio.tone(120 + Math.random() * 40, 0.08, { type: 'square', vol: 0.05, filter: 500 });
    }
    function press(pl, lane, tp) {
      pads[pl * 4 + lane].press = 1;
      let best = null, bd = 9;
      for (let i = ptr; i < notes.length; i++) {
        const n = notes[i]; if (n.t > tp + W_GOOD) break;
        if (n.state !== 'wait' || n.pl !== pl || n.lane !== lane) continue;
        const d = Math.abs(n.t - tp); if (d <= W_GOOD && d < bd) { bd = d; best = n; }
      }
      if (best) hitNote(best, bd, tp); else ghost(pl, lane);
    }
    function updateHolds(dt) {
      for (let i = ptr; i < notes.length; i++) {
        const n = notes[i]; if (n.t > songT + 0.5) break;
        if (n.state !== 'hold') continue;
        const inp = input.p[n.pl]; const endT = n.t + n.dur;
        const padI = pads[n.pl * 4 + 3];
        if (inp.a) {
          n.held += dt; n.tickT += dt; n.holdSnd -= dt; padI.press = 1;
          if (n.holdSnd <= 0) { n.holdSnd = 0.22; melody(n.pl, n.midi, 0.55, 0.3); }
          if (n.tickT >= 0.12) { n.tickT -= 0.12; score += Math.round(8 * mult()); changeHype(0.22); fx.particles.emit(LANE_X(n.pl, 3) + rand(-0.4, 0.4), 0.4, rand(-0.3, 0.3), 0, 2.5, 0, { life: 0.5, size: 0.28, color: 0x9aff9a, gravity: -1 }); }
        }
        if (songT >= endT - 0.1) {
          n.state = 'done'; const frac = clamp(n.held / Math.max(0.1, n.dur - 0.1), 0, 1);
          if (frac > 0.75) { stats.holdsDone++; score += Math.round(150 * mult()); changeHype(2); say('Mooi vastgehouden!', n.pl, 3, '#9aff9a', 0.7); accPoints += 0.4; fx.particles.burst(LANE_X(n.pl, 3), 0.6, 0, { count: 14, colors: [0x62ff8a, 0xffffff], speed: 4, size: 0.3 }); }
          else { combo = 0; changeHype(-2); }
        } else if (!inp.a && songT > n.t + 0.2) {
          // losgelaten voor het einde
          n.state = 'done'; const frac = n.held / Math.max(0.1, n.dur);
          if (frac < 0.6) { combo = 0; changeHype(-3.5); say('Te vroeg los!', n.pl, 3, '#ffb27a', 0.6); accPoints -= 0.4; } else { accPoints += 0.2 * frac; }
        }
      }
    }
    function updateMisses() {
      for (let i = ptr; i < notes.length; i++) {
        const n = notes[i]; if (n.t > songT) break;
        if (n.state === 'wait' && songT > n.t + W_GOOD) missNote(n);
      }
      while (ptr < notes.length && notes[ptr].state !== 'wait' && notes[ptr].state !== 'hold' && notes[ptr].t < songT - 0.8) ptr++;
    }

    // ---------- tekenen van de noten ----------
    function drawNotes() {
      for (const s of shapes) s.n = 0;
      let nt = 0, nl = 0;
      for (let i = ptr; i < notes.length; i++) {
        const n = notes[i]; const dtn = n.t - songT;
        if (dtn > LOOK) break;
        if (n.state === 'hit' || n.state === 'done') continue;
        let z = -dtn * SPEED;
        if (n.state === 'hold') z = 0;
        if (z > 1.6) continue;
        const sh = shapes[n.lane]; if (sh.n >= CAP) continue;
        const x = LANE_X(n.pl, n.lane);
        const pop = n.state === 'wait' ? clamp((z + 29) / 2.5, 0.3, 1) : 1;
        const pulse = n.state === 'hold' ? 1.1 + Math.sin(songT * 25) * 0.08 : 1;
        const sc = pop * pulse * (n.duet ? 1.12 : 1) * (n.state === 'miss' ? clamp(1 - (z - 0.3) / 1.4, 0.05, 1) : 1);
        _o.position.set(x, 0.3, z); _o.scale.set(sc, sc, sc); _o.rotation.set(0, n.duet && n.lane === 3 ? songT * 2 : 0, 0); _o.updateMatrix();
        sh.body.setMatrixAt(sh.n, _o.matrix);
        _c.setHex(n.state === 'miss' ? 0x555566 : n.duet ? 0xffd84a : LANE_COL[n.lane]);
        if (n.state === 'wait' && n.duet && Math.floor(songT * 8) % 2) _c.setHex(0xffffff);
        sh.body.setColorAt(sh.n, _c);
        _o.position.y = 0.26; _o.scale.set(sc * 1.2, sc * 0.9, sc * 1.2); _o.updateMatrix(); sh.out.setMatrixAt(sh.n, _o.matrix);
        sh.n++;
        if (n.long && n.state !== 'miss' && nt < 14) {
          const len = n.state === 'hold' ? Math.max(0.01, (n.t + n.dur - songT) * SPEED) : n.dur * SPEED;
          _o.position.set(x, 0.2, z - len / 2); _o.scale.set(0.5 * (n.state === 'hold' ? 1.25 : 1), 1, len); _o.rotation.set(0, 0, 0); _o.updateMatrix();
          tails.setMatrixAt(nt, _o.matrix); _c.setHex(n.duet ? 0xffd84a : LANE_COL[3]); if (n.state === 'hold' && Math.floor(songT * 14) % 2) _c.setHex(0xffffff); tails.setColorAt(nt, _c); nt++;
        } else if (n.long && n.state === 'miss' && nt < 14) {
          const len = n.dur * SPEED; _o.position.set(x, 0.2, z - len / 2); _o.scale.set(0.5, 1, len); _o.updateMatrix(); tails.setMatrixAt(nt, _o.matrix); _c.setHex(0x444455); tails.setColorAt(nt, _c); nt++;
        }
        if (n.duet && n.pl === 0 && n.state === 'wait' && nl < 8) {
          _o.position.set((LANE_X(0, n.lane) + LANE_X(1, n.lane)) / 2, 0.28, z); _o.scale.set(Math.abs(LANE_X(1, n.lane) - LANE_X(0, n.lane)) - 1.3, 1, 1); _o.rotation.set(0, 0, 0); _o.updateMatrix(); links.setMatrixAt(nl, _o.matrix); nl++;
        }
      }
      for (const s of shapes) { s.body.count = s.out.count = s.n; s.body.instanceMatrix.needsUpdate = s.out.instanceMatrix.needsUpdate = true; if (s.body.instanceColor) s.body.instanceColor.needsUpdate = true; }
      tails.count = nt; tails.instanceMatrix.needsUpdate = true; if (tails.instanceColor) tails.instanceColor.needsUpdate = true;
      links.count = nl; links.instanceMatrix.needsUpdate = true;
    }

    // ---------- eind ----------
    function finishSong() {
      const acc = clamp(accPoints / total, 0, 1);
      const duetFrac = DUETS ? stats.duetOK / DUETS : 1;
      let stars = 1;
      if (acc >= 0.7 && hype >= 45) stars = 2;
      if (acc >= 0.88 && duetFrac >= 0.7 && hype >= 65) stars = 3;
      const sum = `Het publiek is dolenthousiast! <b>${Math.round(acc * 100)}%</b> nauwkeurig · langste reeks <b>${stats.maxCombo}</b> · duetten <b>${stats.duetOK}/${DUETS}</b> · ${stage.coinsIn} muntjes in de kist.`;
      perf.forEach((p) => { p.c.pose = 'cheer'; });
      ctx.finish({ stars, score, summary: sum, delay: 700 });
    }
    function failSong() {
      const acc = clamp(accPoints / total, 0, 1);
      perf.forEach((p) => { p.c.pose = 'sad'; });
      hud.showBig('Het publiek loopt weg...', 2200, '#ff7a7a');
      audio.sfx('lose');
      // het publiek verdwijnt door hype=0
      ctx.finish({ stars: 0, score, summary: `Het publiek haakte af na <b>${Math.floor(songT)}</b> seconden. Probeer de noten precies op de lijn te raken! (${Math.round(acc * 100)}% nauwkeurig)`, delay: 2000 });
    }

    // ---------- HUD ----------
    function hudUpdate() {
      hud.setScore(`${score.toLocaleString('nl-NL')}  ·  reeks ${combo}  ·  x${mult().toFixed(1)}  ·  publiek ${Math.max(0, Math.round(hype))}%`);
      hud.setPlayerInfo(0, `Raak ${stats.perPlayer[0].hit} · mis ${stats.perPlayer[0].miss}`);
      hud.setPlayerInfo(1, `Raak ${stats.perPlayer[1].hit} · mis ${stats.perPlayer[1].miss}`);
      hud.setTimer(null);
    }

    // ---------- update ----------
    let t = 0, disposed = false, energy = 0, intensity = 0.3;
    function visuals(dt) {
      t += dt;
      const b = beatPhase();
      energy = damp(energy, started ? clamp(hype / 100 * 0.9 + (combo > 15 ? 0.2 : 0), 0, 1) : 0.2, 3, dt);
      intensity = damp(intensity, started ? clamp(hype / 100 + 0.15, 0.2, 1) : 0.25, 2, dt);
      const shown = stage.update(dt, t, b, started ? hype : 45, energy, intensity);
      // snelweg-offset
      const off = songT / BEAT - HW_Z0 / unit;
      hwTex.forEach((tx) => { tx.offset.y = off; });
      rails.forEach((r) => { r.material.emissiveIntensity = 0.55 + Math.pow(1 - b, 3) * 0.9; });
      for (const p of pads) {
        p.press = Math.max(0, p.press - dt * 7); p.flash = p.flash > 0 ? Math.max(0, p.flash - dt * 4) : Math.min(0, p.flash + dt * 4);
        const on = p.press > 0.01 || p.flash > 0.01;
        p.top.material.color.setHex(on ? 0xffffff : p.flash < -0.01 ? 0x707078 : 0xb0b0c0);
        p.glow.material.opacity = Math.max(0, p.press * 0.55 + Math.max(0, p.flash) * 0.6);
        p.top.scale.setScalar(1 + p.press * 0.12 + Math.max(0, p.flash) * 0.15);
      }
      // poppetjes
      perf.forEach((p, i) => {
        const bob = Math.abs(Math.sin(b * Math.PI)) * 0.14 * (0.4 + energy);
        p.c.group.position.y = bob; p.c.speed = 0;
        p.c.update(dt);
      });
      // camera
      camT += dt; camKick = Math.max(0, camKick - dt * 3);
      camera.position.set(camBase.x + Math.sin(camT * 0.4) * 0.5, camBase.y + Math.sin(camT * 0.31) * 0.15 + Math.pow(1 - b, 4) * 0.05 * energy, camBase.z);
      camera.lookAt(camLook.x + Math.sin(camT * 0.4) * 0.3, camLook.y, camLook.z);
      drawNotes();
    }
    function update(dt) {
      if (!started) { started = true; songT = 0; }
      if (!done) {
        if (!ending) {
          songT += dt;
          // invoer (voor lage fps: neem het midden van het frame als aanslagtijd)
          const tp = songT - dt * 0.5;
          for (let pl = 0; pl < 2; pl++) {
            const inp = input.p[pl];
            if (inp.leftP) press(pl, 0, tp);
            if (inp.upP) press(pl, 1, tp);
            if (inp.rightP) press(pl, 2, tp);
            if (inp.aP) press(pl, 3, tp);
            if (inp.a && !inp.aP && !notes.some((n) => n.state === 'hold' && n.pl === pl)) pads[pl * 4 + 3].press = Math.max(pads[pl * 4 + 3].press, 0.4);
          }
          updateHolds(dt); updateMisses();
          schedule(songT + 0.35);
          // sectienaam
          const bar = Math.floor(songT / BAR); const sec = sectionAt(bar).name;
          if (sec !== lastSection) { lastSection = sec; if (sec === 'refrein' && bar === 10) hud.showBig('Refrein!', 900, '#ffd84a'); else if (sec === 'finale' && bar === 22) hud.showBig('Grote finale!', 1100, '#ff8ad8'); else if (sec === 'brug' && bar === 18) hud.showBig('Houd vast!', 1000, '#9aff9a'); }
          // muntjes bij een goede stand
          coinT -= dt; if (coinT <= 0) { coinT = hype > 70 ? 0.7 : hype > 45 ? 1.8 : 6; if (hype > 25) stage.throwCoin(); }
          if (hype <= FAIL_HYPE) { ending = 'fail'; endT = 0; failSong(); done = true; }
          else if (songT > Math.max(LAST_NOTE_T + 1.0, 0) && !notes.some((n) => n.state === 'hold') ) {
            if (songT > SONG_END - 1.5) { ending = 'win'; endT = 2.5; hud.showBig('Bravo!', 1600, '#ffd84a'); boom(); stage.crowdJump(1); stage.startWave(); audio.sfx('win'); perf.forEach((p) => { p.c.pose = 'cheer'; }); }
          }
        } else if (ending === 'win') {
          songT += dt; endT -= dt; schedule(songT + 0.35);
          if (Math.random() < dt * 4) { boom(); }
          if (endT <= 0) { done = true; finishSong(); }
        }
      }
      uiT -= dt; if (uiT <= 0) { uiT = 0.1; hudUpdate(); }
      visuals(dt);
    }
    function idle(dt) { visuals(dt); }
    visuals(0.016);

    return {
      onStart() { try { audio.stopMusic(); } catch (e) { /* geen audio */ } songT = 0; started = true; },
      update,
      introUpdate: idle,
      resultUpdate(dt) { visuals(dt); if (hype > 0 && Math.random() < dt * 1.5) boom(); },
      onResize() { setCam(camera.aspect); },
      dispose() { disposed = true; },
      debug: {
        notes, stats, stage, get s() { return { songT, hype, combo, score, ptr, ending, done, acc: accPoints / total, duetOK: stats.duetOK }; },
        set zoom(v) { camBase.multiplyScalar(v); },
      },
    };
  },
};

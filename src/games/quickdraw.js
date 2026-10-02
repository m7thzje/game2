import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, shuffle, TAU, smoothstep } from '../engine/util.js';
import { KEY_LABELS } from '../engine/input.js';
import { buildWorld, liveCanvas, makeSprite, font } from './quickdraw_world.js';
import { createGag, GAG_KINDS } from './quickdraw_gags.js';

// Snelle Vingers: Duel bij Zonsondergang — best-of-7 western-duel in een fantasy-dorp.
// Wacht op het ECHTE signaal (de draak spuwt vuur), trap niet in de nepsignalen, druk als eerste!

const HOME_X = 3.8;
const SYMS = ['L', 'R', 'U', 'A', 'B'];
const SYM_NAME = { L: 'LINKS', R: 'RECHTS', U: 'OMHOOG', D: 'OMLAAG', A: 'A', B: 'B' };
const SYM_COL = { L: '#38b6ff', R: '#ff9a3a', U: '#4cd964', D: '#c46aff', A: '#ff4d4d', B: '#ffd23f' };
const FAKE_DUR = { chicken: 1.7, bell: 1.5, crow: 1.4, deurman: 2.0, hiccup: 1.0 };
const FAKE_POOL = ['chicken', 'bell', 'crow', 'hiccup'];
const ROUNDS = [
  { kind: 'classic', fakes: 1, title: 'Gewoon duel', sub: 'Druk A zodra de draak vuur spuwt!' },
  { kind: 'classic', fakes: 2, title: 'Pas op voor nepsignalen!', sub: 'Niet alles is echt...' },
  { kind: 'classic', fakes: 3, deurman: true, title: 'De Deurman kijkt mee', sub: 'Bij "Niet bewegen!" blijf je vooral stil' },
  { kind: 'dir', fakes: 1, title: 'Richting-duel', sub: 'Druk de knop die op het bord verschijnt!' },
  { kind: 'dir', fakes: 2, title: 'Richting-duel met nepsignalen', sub: 'Eerst het vuur, dan pas drukken' },
  { kind: 'seq', fakes: 1, title: 'Onthoud de reeks!', sub: 'Herhaal de 3 knoppen: de snelste wint' },
  { kind: 'dir', fakes: 3, deurman: true, mult: 2, title: 'FINALE: DUBBELE PUNTEN!', sub: 'Dit is jullie kans op een comeback!' },
];
const SD_ROUND = { kind: 'classic', fakes: 1, title: 'GOUDEN KOGEL', sub: 'Gelijkstand! Wie schiet het snelst?', mult: 1, sd: true };

export default {
  id: 'quickdraw',
  name: 'Snelle Vingers: Duel bij Zonsondergang',
  giver: 'Sheriff Sluwe Sjaak',
  icon: '🤠',
  mode: 'pvp',
  time: 70,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'bodyswap', 'deurman'],
  music: 'tense',
  blurb: 'Een stoffig plein, een zakkende zon en een <b>draak op het dak</b>. Wacht op het <b>ECHTE signaal</b> en druk als eerste! Te vroeg drukken is een <b>valse start</b> (het poppetje struikelt). Pas op: een kip, een bel, een kraai en de <b>Deurman</b> proberen je erin te luizen. Later moet je de <b>juiste knop</b> drukken of een <b>reeks van 3</b> onthouden. 7 rondes, in ronde 7 tellen de punten dubbel!',
  controls: ['{a} trekken (druk A!)', '{move} richting-knoppen', '{b} B-knop (soms nodig)'],
  tip: 'Alleen het vuur van de draak met een groot "!" is echt. Een kip, bel of kraai? Niet drukken!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('dusk', { shadow: 20, center: [0, 0, 0], fogNear: 60, fogFar: 175 });
    L.hemi.intensity = 1.05; L.sun.intensity = 2.3;
    camera.fov = 46; camera.updateProjectionMatrix();
    const W = buildWorld(ctx);
    const spd = ctx.twist.speed || 1;
    const drunk = ctx.twist.id === 'drunk';
    const twistNote = ctx.twist.id === 'swapab' ? 'A is nu je B-knop!' : ctx.twist.id === 'invert' ? 'Alles is omgekeerd!' : ctx.twist.id === 'drunk' ? 'Dronken kikker: mik goed!' : '';
    const aLabel = (i) => (ctx.twist.id === 'swapab' ? KEY_LABELS[i].b : KEY_LABELS[i].a);

    // ---------------- spelers ----------------
    const tmpV = new THREE.Vector3();
    const starGeo = new THREE.OctahedronGeometry(0.13, 0);
    const pl = players.map((pp, i) => {
      const c = ctx.make.brother(i);
      const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const size = ctx.pvp.size(i); holder.scale.setScalar(size);
      const s = c.s;
      // sheriffster
      const star = mesh(new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.025, 5), mat(0xf5c518, { metalness: 0.6, roughness: 0.35 }), { rot: [Math.PI / 2, 0, 0], pos: [0.13 * s, 0.42 * s, 0.31 * s], cast: false });
      c.torso.add(star);
      // speelgoed-pistool met kurk
      const gun = new THREE.Group();
      gun.add(mesh(new THREE.CylinderGeometry(0.036 * s, 0.042 * s, 0.34 * s, 7), mat(0x596070, { metalness: 0.7, roughness: 0.35 }), { pos: [0, -0.2 * s, 0] }));
      gun.add(mesh(new THREE.BoxGeometry(0.075 * s, 0.13 * s, 0.22 * s), mat(0x7a4a22), { pos: [0, -0.03 * s, -0.09 * s] }));
      gun.add(mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.07 * s, 6), mat(0xff8a2a), { pos: [0, -0.39 * s, 0] }));
      c.hold(gun, i === 0 ? 'r' : 'l');
      // sterren bij valse start
      const stars = new THREE.Group(); stars.visible = false; holder.add(stars);
      for (let k = 0; k < 3; k++) { const st = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffe14a })); st.scale.set(1, 1.3, 0.5); stars.add(st); }
      // ring op de grond
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 30), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(i ? HOME_X : -HOME_X, 0.09, 0); scene.add(ring);
      // tag (reactietijd) boven het hoofd
      const tag = liveCanvas(384, 128, (g, w, h, text, col) => {
        g.font = font(66); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(25,8,40,.95)';
        g.strokeText(text, w / 2, h / 2, w - 16); g.fillStyle = col; g.fillText(text, w / 2, h / 2, w - 16);
      });
      const tagSp = makeSprite(tag.t, 3.3, 1.1); tagSp.visible = false; scene.add(tagSp);
      // bord met de score
      const sign = liveCanvas(256, 200, (g, w, h, pts, best, rnd) => {
        g.fillStyle = '#5b3a1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a5028'; g.fillRect(8, 8, w - 16, h - 16);
        g.strokeStyle = '#2e1b0c'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = font(46); g.fillStyle = pp.css; g.lineWidth = 8; g.strokeStyle = '#2a1608'; g.strokeText(pp.name.toUpperCase(), w / 2, 38); g.fillText(pp.name.toUpperCase(), w / 2, 38);
        g.font = font(104); g.strokeText(String(pts), w / 2, 112); g.fillStyle = '#fff4d0'; g.fillText(String(pts), w / 2, 112);
        g.font = font(26); g.fillStyle = '#ffe9b0'; g.fillText(best ? `snelst ${best} ms` : 'nog geen tijd', w / 2, 170);
      });
      const signGrp = new THREE.Group(); signGrp.position.set(i ? 6.7 : -6.7, 0, -0.8); signGrp.rotation.y = i ? -0.35 : 0.35; scene.add(signGrp);
      signGrp.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 5), mat(0x4a2e14), { pos: [-0.8, 0.7, -0.08] }));
      signGrp.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 5), mat(0x4a2e14), { pos: [0.8, 0.7, -0.08] }));
      signGrp.add(mesh(new THREE.PlaneGeometry(2.3, 1.8), new THREE.MeshStandardMaterial({ map: sign.t, roughness: 0.9 }), { pos: [0, 2.0, 0] }));
      return { i, c, holder, size, gun, gunArm: i === 0 ? c.armR : c.armL, stars, ring, tag, tagSp, sign, name: pp.name, css: pp.css, fx: i ? -1 : 1, homeX: i ? HOME_X : -HOME_X,
        drawK: 0, drawT: 0, state: 'idle', tripT: 0, kx: 0, kv: 0, hurt: 0, lock: 0, flying: false, cream: null, best: 0, times: [], prog: 0,
        bump(v) { this.kv += v; }, headY() { return this.c.height * this.size; } };
    });
    const oppOf = (p) => pl[1 - p.i];
    const headY = (p) => p.c.height * p.size;
    const tip = (p, out) => { p.holder.updateMatrixWorld(true); return p.gun.localToWorld(out.set(0, -0.42 * p.c.s, 0)); };
    function muzzle(p) {
      tip(p, tmpV);
      fx.particles.burst(tmpV.x, tmpV.y, tmpV.z, { count: 26, speed: 5, up: 0.4, life: 0.4, size: 0.5, colors: [0xffe14a, 0xffffff, 0xff8a2a], gravity: 0 });
      fx.particles.ring(tmpV.x, tmpV.y, tmpV.z, { count: 14, speed: 5, color: 0xfff2a0, size: 0.4, life: 0.3 });
      audio.sfx('shoot', { vol: 0.8 }); audio.sfx('pop', { vol: 0.5, rate: 0.7 });
      W.say('PANG!', tmpV.x, tmpV.y + 1.4, 0.8, { dur: 0.7, scale: 1.1, color: '#c4501a' });
      p.kv -= p.fx * 1.6; p.drawK = 1;
    }
    function setTag(p, text, col = '#ffe14a') { p.tag.redraw(text, col); p.tagSp.visible = true; }
    function refreshSign(p) { p.sign.redraw(scores[p.i], p.best, 0); }

    // ---------------- het signaalbord ----------------
    function drawSym(g, s, cx, cy, r, dim = false) {
      g.save(); g.translate(cx, cy);
      g.fillStyle = dim ? '#4a4256' : SYM_COL[s]; g.strokeStyle = '#1c1030'; g.lineWidth = r * 0.1;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#fff';
      if (s === 'A' || s === 'B') { g.font = font(r * 1.3); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = r * 0.12; g.strokeStyle = '#1c1030'; g.strokeText(s, 0, r * 0.06); g.fillText(s, 0, r * 0.06); }
      else if (s === '?') { g.font = font(r * 1.3); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9a90ac'; g.fillText('?', 0, r * 0.06); }
      else {
        g.rotate({ R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 }[s]); g.lineWidth = r * 0.07;
        g.beginPath(); g.moveTo(r * 0.66, 0); g.lineTo(r * 0.0, -r * 0.55); g.lineTo(r * 0.0, -r * 0.22); g.lineTo(r * -0.58, -r * 0.22); g.lineTo(r * -0.58, r * 0.22); g.lineTo(r * 0.0, r * 0.22); g.lineTo(r * 0.0, r * 0.55); g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    }
    const panel = W.panelTex; let panelPop = 0;
    function showPanel(mode, d = {}) {
      const g = panel.g, w = 512, h = 512; g.clearRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const label = (txt, y, size, col = '#fff') => { g.font = font(size); g.lineWidth = size * 0.2; g.strokeStyle = '#220c30'; g.strokeText(txt, w / 2, y, w - 30); g.fillStyle = col; g.fillText(txt, w / 2, y, w - 30); };
      if (mode === 'bang') {
        g.fillStyle = '#ffd23a'; g.strokeStyle = '#a02a10'; g.lineWidth = 12; g.beginPath();
        for (let k = 0; k < 40; k++) { const a = k / 40 * TAU, r = k % 2 ? 150 : 238; g.lineTo(256 + Math.cos(a) * r, 232 + Math.sin(a) * r); }
        g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#e0302a'; g.beginPath(); g.arc(256, 232, 150, 0, TAU); g.fill(); g.lineWidth = 10; g.stroke();
        label('!', 246, 250, '#fff');
        label(`DRUK ${d.key || 'A'}!`, 466, 74, '#ffe14a');
        if (twistNote) label(twistNote, 505, 30, '#ffffff');
      } else if (mode === 'dir') {
        g.fillStyle = 'rgba(24,10,44,.82)'; g.beginPath(); g.arc(256, 232, 226, 0, TAU); g.fill(); g.lineWidth = 14; g.strokeStyle = '#ffd23a'; g.stroke();
        drawSym(g, d.sym, 256, 232, 150);
        label(SYM_NAME[d.sym] + '!', 466, 74, SYM_COL[d.sym]);
        if (twistNote) label(twistNote, 505, 30, '#ffffff');
      } else if (mode === 'seq') {
        g.fillStyle = 'rgba(24,10,44,.85)'; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 46); g.fill(); g.lineWidth = 12; g.strokeStyle = '#ffd23a'; g.stroke();
        label(d.title, 70, 62, d.go ? '#8dff9a' : '#ffe14a');
        for (let k = 0; k < 3; k++) { const sx = 256 + (k - 1) * 150; const shown = d.shown > k || (d.shown === k + 0.5); drawSym(g, d.revealed && d.revealed[k] ? d.seq[k] : (d.cur === k ? d.seq[k] : '?'), sx, 220, 60, !(d.revealed && d.revealed[k]) && d.cur !== k); }
        if (d.prog) pl.forEach((p, i) => {
          const y = 355 + i * 70; g.font = font(40); g.textAlign = 'left'; g.fillStyle = p.css; g.lineWidth = 8; g.strokeStyle = '#220c30'; g.strokeText(p.name, 44, y); g.fillText(p.name, 44, y);
          for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(330 + k * 56, y, 20, 0, TAU); g.fillStyle = k < d.prog[i] ? p.css : '#2a2038'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ffd23a'; g.stroke(); }
        });
        g.textAlign = 'center';
      }
      panel.t.needsUpdate = true; W.panelMesh.visible = true; panelPop = 0;
    }
    function hidePanel() { W.panelMesh.visible = false; }

    // ---------------- toestand ----------------
    const scores = [0, 0];
    let T = 0, clock = 0, lastReal = performance.now(), done = false, introT = 0, resultT = 0;
    let sdCount = 0, replays = 0, gagBag = [];
    const R = { state: 'start', t: 0, def: ROUNDS[0], n: 0, events: [], idx: 0, sigClock: 0, target: 'A', seq: [], seqShow: 0, prog: [0, 0], winner: -1, lateT: null, gag: null, mult: 1, foul: -1, cause: '' };
    const evs = [[], []]; const prevDir = [null, null];
    const camPos = new THREE.Vector3(0, 4, 24), camLook = new THREE.Vector3(0, 4, 0); let camFov = 50;
    const cT = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 46 };
    let sway = 0, punch = 0;

    hud.setTimer(null);
    function refreshHud() {
      const rn = R.def && R.def.sd && R.n > 7 ? 'Gouden kogel' : `Ronde ${clamp(R.n, 1, 7)}/7`;
      hud.setScore(`${rn}   ${names[0]} ${scores[0]} – ${scores[1]} ${names[1]}`);
      pl.forEach((p) => { hud.setPlayerInfo(p.i, `${scores[p.i]} punt${scores[p.i] === 1 ? '' : 'en'}${p.best ? ` · snelst ${p.best} ms` : ''}`); refreshSign(p); });
    }

    // ---------------- invoer ----------------
    function readEvents() {
      for (let i = 0; i < 2; i++) {
        const inp = ctx.pvp.input(i), e = evs[i]; e.length = 0;
        if (inp.aP) e.push('A'); if (inp.bP) e.push('B');
        if (drunk) {
          const m = Math.hypot(inp.x, inp.y); let cur = null;
          if (m > 0.55) cur = Math.abs(inp.x) >= Math.abs(inp.y) ? (inp.x > 0 ? 'R' : 'L') : (inp.y > 0 ? 'D' : 'U');
          if (cur && !prevDir[i]) e.push(cur); prevDir[i] = cur;
        } else {
          if (inp.leftP) e.push('L'); if (inp.rightP) e.push('R'); if (inp.upP) e.push('U'); if (inp.downP) e.push('D');
        }
      }
    }
    // welke drukken tellen in de huidige ronde?
    const relevant = (e) => (R.def.kind === 'classic' ? e.filter((x) => x === 'A') : e);

    // ---------------- ronde-flow ----------------
    function resetPlayers() {
      for (const p of pl) {
        p.state = 'idle'; p.drawK = 0; p.tripT = 0; p.kx = 0; p.kv = 0; p.hurt = 0; p.lock = 0; p.flying = false; p.prog = 0; p.air = false;
        p.holder.visible = true; p.holder.rotation.set(0, 0, 0); p.holder.scale.setScalar(p.size); p.holder.position.set(p.homeX, 0, 0);
        p.c.body.rotation.set(0, 0, 0); p.c.pose = 'idle'; p.c.air = false; p.stars.visible = false; p.tagSp.visible = false;
        if (p.cream && p.cream.parent) p.cream.parent.remove(p.cream); p.cream = null;
        p.c.faceDir(p.fx, 0);
      }
    }
    function startRound() {
      if (R.gag) { R.gag.dispose(); R.gag = null; }
      const first = R.n === 0;
      R.n++;
      R.def = R.n <= 7 ? ROUNDS[R.n - 1] : SD_ROUND;
      R.mult = R.def.mult || 1;
      R.state = 'announce'; R.t = 0; R.winner = -1; R.foul = -1; R.react = null; R.poseReset = 0; R.focus = ''; R.focusUntil = 0; R.cause = '';
      resetPlayers(); hidePanel();
      // tijdlijn bouwen
      const pool = shuffle(FAKE_POOL.slice());
      const list = [];
      if (R.def.deurman) list.push('deurman');
      while (list.length < R.def.fakes) list.push(pool.pop() || 'bell');
      shuffle(list);
      R.events = []; let t = rand(1.0, 1.9) / spd;
      for (const f of list) { R.events.push({ t, type: f }); t += FAKE_DUR[f] / spd + rand(0.45, 1.0) / spd; }
      R.events.push({ t: t + rand(0.05, 0.85) / spd, type: 'signal' });
      R.idx = 0; R.armedT = 0;
      refreshHud();
      hud.showBig(R.def.sd ? 'GOUDEN KOGEL!' : R.def.mult ? 'FINALE! DUBBELE PUNTEN!' : `RONDE ${R.n}`, 1300, R.def.mult || R.def.sd ? '#ff7a3a' : '#ffe14a');
      hud.setHint(`<b>${R.def.title}</b> — ${R.def.sub}`);
      audio.sfx('bell', { vol: 0.35, rate: 0.7 });
      W.react('wave', 1.4);
      if (R.def.kind !== 'classic') audio.music('tense');
    }
    function arm() {
      R.state = 'armed'; R.t = 0; R.idx = 0;
      const k = R.def.kind;
      hud.setHint(k === 'classic' ? `Wacht op het <b>echte</b> signaal: de draak spuwt vuur! Druk dan <b>A</b> (${names[0]}: ${aLabel(0)} · ${names[1]}: ${aLabel(1)}) — te vroeg = valse start!`
        : k === 'dir' ? 'Wacht op het <b>vuur van de draak</b>. Druk dan de knop die op het bord verschijnt!' : 'Wacht op het vuur van de draak, onthoud dan de <b>reeks van 3</b> en tik hem na!');
    }
    function fireSignal() {
      R.state = 'signal'; R.t = 0; R.sigClock = clock; W.fire(1.1); ctx.shake(0.45); punch = 1;
      W.react('scared', 1.0);
      for (const p of pl) { p.c.pose = 'idle'; }
      const k = R.def.kind;
      if (k === 'classic') { showPanel('bang', { key: 'A' }); audio.sfx('go', { vol: 0.4 }); }
      else if (k === 'dir') { R.target = pick(SYMS); showPanel('dir', { sym: R.target }); }
      else {
        const s = []; while (s.length < 3) { const q = pick(SYMS); if (s.length && s[s.length - 1] === q) continue; if (s.filter((z) => z === q).length >= 2) continue; s.push(q); }
        R.seq = s; R.state = 'seqshow'; R.t = 0; R.seqShow = 0; R.prog = [0, 0]; showPanel('seq', { title: 'ONTHOUD!', seq: s, cur: -1, revealed: [false, false, false], prog: null });
        R.seqLast = -1;
      }
      hud.setHint(null);
    }
    function foul(i) {
      const p = pl[i], o = oppOf(p);
      R.state = 'foul'; R.t = 0; R.foul = i;
      p.state = 'trip'; p.tripT = 0; p.drawK = 0;
      setTag(p, 'TE VROEG!', '#ff5a5a');
      scores[o.i] += R.mult; R.winner = o.i;
      p.c.pose = 'scared';
      W.say(pick(['AU!', 'OEPS!', 'WAAAH!']), p.holder.position.x, headY(p) + 1.4, 0.8, { dur: 1.0, scale: 1.2, color: '#c02a2a' });
      hud.showBig('VALSE START!', 1400, '#ff5a5a');
      audio.sfx('boing', { vol: 0.8 }); audio.sfx('miss', { vol: 0.7 }); ctx.shake(0.4);
      fx.particles.burst(p.holder.position.x, 0.2, 0.3, { count: 24, speed: 4, up: 1, life: 0.8, size: 0.5, colors: [0xd8c8a8, 0xffffff], gravity: 4 });
      o.c.pose = 'cheer'; W.react('cheer', 1.6);
      hidePanel(); hud.setHint(null);
      refreshHud();
    }
    function foulBoth() {
      replays++;
      R.state = 'foulboth'; R.t = 0;
      for (const p of pl) { p.state = 'trip'; p.tripT = 0; p.drawK = 0; p.c.pose = 'scared'; setTag(p, 'TE VROEG!', '#ff5a5a'); }
      hud.showBig('ALLEBEI TE VROEG!', 1400, '#ffb03a'); hud.toast('Niemand scoort. Opnieuw!', 1600);
      audio.sfx('boing', { vol: 0.8 }); audio.sfx('bad', { vol: 0.6 }); ctx.shake(0.4); hidePanel(); hud.setHint(null);
    }
    function wrongPress(p, why = 'X') {
      p.lock = 0.65; setTag(p, why, '#ff5a5a'); audio.sfx('buzz', { vol: 0.6 }); p.c.pose = 'scared'; p.hurt = 0.5;
      p.prog = 0; R.prog[p.i] = 0;
      W.say('Nee!', p.holder.position.x, headY(p) + 1.3, 0.8, { dur: 0.7, scale: 0.9, color: '#c02a2a' });
      p.tagTimer = 0.7;
    }
    function winRound(w, ms, fotofinish) {
      const p = pl[w], l = oppOf(p);
      R.state = 'hit'; R.t = 0; R.winner = w; R.foto = fotofinish;
      scores[w] += R.mult;
      if (ms != null) { p.times.push(ms); if (!p.best || ms < p.best) p.best = ms; setTag(p, `${ms} ms`, '#8dff9a'); }
      p.drawK = 1; p.gunArm.rotation.x = -1.55; p.gunArm.rotation.z = 0; l.state = 'beaten';
      hidePanel(); hud.setHint(null);
      // bullet-time gag
      if (!gagBag.length) gagBag = shuffle(GAG_KINDS.slice());
      const kind = gagBag.pop();
      R.gag = createGag(kind, { scene, fx, audio, world: W, ctx, W: p, L: l, dir: p.fx, headY, tip, muzzle });
      hud.showBig(fotofinish ? 'FOTOFINISH!' : R.mult > 1 ? 'DUBBELE PUNTEN!' : 'RAAK!', 1100, '#ffe14a');
      if (fotofinish) hud.toast('Precies tegelijk! Het lot beslist...', 1600);
      refreshHud();
      W.react('cheer', 1.8);
    }
    function drawRound(why) {
      R.state = 'result'; R.t = 0; hidePanel(); hud.setHint(null);
      hud.showBig('Te traag!', 1200, '#ffb03a'); hud.toast(why || 'Allebei te traag! Niemand scoort.', 1800); audio.sfx('miss', { vol: 0.6 });
      for (const p of pl) p.c.pose = 'sad';
      R.cause = 'draw';
    }

    // ---------------- stap-logica per toestand ----------------
    function stepRound(dt) {
      R.t += dt;
      switch (R.state) {
        case 'start': if (R.t > 0.6) startRound(); break;
        case 'announce': {
          if (R.t > 1.15) arm();
          break;
        }
        case 'armed': {
          // 1. eerst de drukken van dit frame: alles voor het signaal is te vroeg
          const bad = [false, false];
          for (const p of pl) { const e = relevant(evs[p.i]); if (e.length) bad[p.i] = true; }
          if (bad[0] && bad[1]) { foulBoth(); break; }
          if (bad[0]) { foul(0); break; }
          if (bad[1]) { foul(1); break; }
          if (R.poseReset && R.t >= R.poseReset) { R.poseReset = 0; for (const p of pl) p.c.pose = 'idle'; }
          // 2. dan de tijdlijn
          const ev = R.events[R.idx];
          if (ev && R.t >= ev.t) {
            R.idx++;
            if (ev.type === 'signal') { fireSignal(); break; }
            ev.dur = W[ev.type](); R.focus = ev.type; R.focusUntil = R.t + (ev.type === 'deurman' ? 1.9 : 1.3);
            if (ev.type === 'deurman') { W.react('scared', 1.8); for (const p of pl) p.c.pose = 'scared'; R.poseReset = R.t + 1.9; }
            else W.react(ev.type === 'hiccup' ? 'sad' : 'scared', 0.8);
          }
          break;
        }
        case 'signal': {
          const cand = [];
          for (const p of pl) {
            if (p.lock > 0) continue;
            const e = evs[p.i]; if (!e.length) continue;
            if (R.def.kind === 'classic') { if (e.includes('A')) cand.push(p.i); }
            else if (e.length === 1 && e[0] === R.target) cand.push(p.i);
            else wrongPress(p);
          }
          if (cand.length) {
            const ms = Math.round((clock - R.sigClock) * 1000);
            let w = cand[0], foto = false;
            if (cand.length === 2) { w = Math.random() < 0.5 ? 0 : 1; foto = true; }
            R.react = [null, null]; R.react[w] = ms; if (foto) R.react[1 - w] = ms;
            winRound(w, ms, foto);
            if (foto) { pl[1 - w].times.push(ms); setTag(pl[1 - w], `${ms} ms`, '#ffe14a'); }
            break;
          }
          if (R.t > 3.6) drawRound('Allebei in slaap gevallen! Niemand scoort.');
          break;
        }
        case 'seqshow': {
          // toon 3 symbolen, daarna starten
          const per = 0.7 / Math.max(0.85, spd);
          const k = Math.floor(R.t / per);
          if (k < 3 && k !== R.seqLast) { R.seqLast = k; showPanel('seq', { title: 'ONTHOUD!', seq: R.seq, cur: k, revealed: [false, false, false], prog: null }); audio.tone(440 * Math.pow(1.26, k + 1), 0.3, { type: 'triangle', vol: 0.25 }); }
          if (k >= 3 && R.t > per * 3 + 0.25) {
            R.state = 'seqin'; R.t = 0; R.sigClock = clock; R.prog = [0, 0];
            showPanel('seq', { title: 'NU JULLIE!', go: true, seq: R.seq, cur: -1, revealed: [false, false, false], prog: [0, 0] });
            audio.sfx('go', { vol: 0.7 }); ctx.shake(0.25); punch = 0.6;
            hud.setHint('Tik de reeks van 3 na! Een fout = opnieuw beginnen.');
          }
          break;
        }
        case 'seqin': {
          const cand = [];
          for (const p of pl) {
            if (p.lock > 0) continue; const e = evs[p.i]; if (!e.length) continue;
            if (e.length === 1 && e[0] === R.seq[R.prog[p.i]]) {
              R.prog[p.i]++; p.prog = R.prog[p.i]; audio.tone(440 * Math.pow(1.26, R.prog[p.i] + 1), 0.15, { type: 'square', vol: 0.12 });
              fx.particles.burst(p.holder.position.x, headY(p) + 0.6, 0.4, { count: 8, speed: 3, up: 1, life: 0.5, size: 0.35, color: p.i ? 0x4a8cff : 0x35c46f, gravity: 4 });
              showPanel('seq', { title: 'NU JULLIE!', go: true, seq: R.seq, cur: -1, revealed: [false, false, false], prog: R.prog });
              if (R.prog[p.i] >= 3) cand.push(p.i);
            } else {
              wrongPress(p, 'FOUT!'); showPanel('seq', { title: 'NU JULLIE!', go: true, seq: R.seq, cur: -1, revealed: [false, false, false], prog: R.prog });
            }
          }
          if (cand.length) {
            const ms = Math.round((clock - R.sigClock) * 1000);
            let w = cand[0], foto = false; if (cand.length === 2) { w = Math.random() < 0.5 ? 0 : 1; foto = true; }
            winRound(w, ms, foto); break;
          }
          if (R.t > 8) drawRound('Niemand kreeg de reeks af!');
          break;
        }
        case 'hit': {
          // de verliezer mag nog even reageren: zijn tijd wordt ook getoond
          const l = oppOf(pl[R.winner]);
          if (R.react && R.react[l.i] == null && (R.def.kind !== 'seq') && R.t < 0.9) {
            const e = evs[l.i];
            if ((R.def.kind === 'classic' && e.includes('A')) || (R.def.kind === 'dir' && e.includes(R.target))) {
              const ms = Math.round((clock - R.sigClock) * 1000); R.react[l.i] = ms; setTag(l, `${ms} ms`, '#ffb0b0'); l.times.push(ms);
            }
          }
          if (R.gag && R.gag.done) {
            if (R.react && R.react[l.i] == null && R.def.kind !== 'seq') setTag(l, 'te laat', '#ffb0b0');
            const rr = R.react || [null, null], fmt = (v) => (v != null ? `${v} ms` : 'te laat');
            hud.toast(R.def.kind === 'seq' ? `${names[R.winner]} tikte de reeks het snelst: ${pl[R.winner].times[pl[R.winner].times.length - 1]} ms` : `${names[0]}: ${fmt(rr[0])}  ·  ${names[1]}: ${fmt(rr[1])}`, 1800);
            R.state = 'result'; R.t = 0;
          }
          break;
        }
        case 'foul': case 'foulboth': {
          if (R.t > (R.state === 'foul' ? 2.0 : 1.9)) { if (R.state === 'foulboth' && replays <= 2) R.n--; R.state = 'result'; R.t = 0.5; }
          break;
        }
        case 'result': {
          if (R.t > 0.9) nextRound();
          break;
        }
        default: break;
      }
    }
    function decided() {
      let remaining = 0; for (let k = R.n + 1; k <= 7; k++) remaining += ROUNDS[k - 1].mult || 1;
      return Math.abs(scores[0] - scores[1]) > remaining;
    }
    function nextRound() {
      if (R.n >= 7) {
        if (scores[0] !== scores[1] || sdCount >= 3) return finishMatch();
        if (R.n >= 8) sdCount++;
        startRound(); return;
      }
      if (decided()) return finishMatch();
      startRound();
    }

    function finishMatch() {
      if (done) return; done = true;
      hidePanel(); hud.setHint(null);
      let w = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null;
      const avg = (p) => (p.times.length ? p.times.reduce((a, b) => a + b, 0) / p.times.length : 9999);
      if (w == null) { const a = avg(pl[0]), b = avg(pl[1]); w = a < b ? 0 : b < a ? 1 : null; }
      const best = pl.filter((p) => p.best).sort((a, b) => a.best - b.best)[0];
      const jokes = w == null ? ['Wat een gelijkopgaand duel!'] : [
        `${names[w]} is de snelste vinger van het dorp! ${names[1 - w]} moet de kip nog steeds bedanken.`,
        `${names[w]} wint het duel. De draak is onder de indruk, de kip niet.`,
        `Sheriff Sluwe Sjaak schudt ${names[w]} de hand. ${names[1 - w]} krijgt een taartje als troost.`,
      ];
      pl.forEach((p) => { p.state = 'idle'; });
      ctx.finishPvp({
        winner: w, score: [scores[0], scores[1]], delay: 1000,
        summary: `${best ? `Snelste trekker: <b>${best.name}</b> met <b>${best.best} ms</b>.<br>` : ''}${pick(jokes)}`,
      });
    }

    // ---------------- acteurs ----------------
    function easeBack(u) { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
    function updatePlayers(dt, gdt) {
      for (const p of pl) {
        const c = p.c, hold = p.holder;
        p.lock = Math.max(0, p.lock - dt);
        if (p.tagTimer > 0) { p.tagTimer -= dt; if (p.tagTimer <= 0 && R.state !== 'hit' && R.state !== 'foul') p.tagSp.visible = false; }
        // verschuiving door klappen
        p.kv *= Math.exp(-4 * dt); p.kx += p.kv * dt;
        let x = p.homeX + p.kx, y = 0;
        if (p.flying) { x = hold.position.x; y = hold.position.y; }
        // pose-sturing
        const wantDraw = (R.state === 'hit' && R.winner === p.i) ? 1 : 0;
        if (wantDraw === 0 && p.drawK > 0) p.drawK = Math.max(0, p.drawK - dt * 3);
        if (p.state === 'trip') {
          p.tripT += dt; const u = clamp(p.tripT / 0.4, 0, 1);
          c.body.rotation.x = easeBack(u) * 1.5; x = p.homeX + p.fx * u * 1.1; y = Math.sin(clamp(p.tripT / 0.25, 0, 1) * Math.PI) * 0.45;
          c.speed = 0;
          p.stars.visible = p.tripT > 0.3; if (p.stars.visible) p.stars.children.forEach((s, k) => { const a = p.tripT * 6 + k * TAU / 3; s.position.set(Math.cos(a) * 0.7, 0.4 + c.height * 0.55, Math.sin(a) * 0.7); s.rotation.y += dt * 8; });
        } else if (p.state === 'beaten' && !p.flying) { c.pose = p.hurt > 0 ? 'scared' : 'sad'; }
        if (p.flying) { /* positie komt van de gag */ } else hold.position.set(x, y, 0);
        p.hurt = Math.max(0, p.hurt - dt * 0.5);
        c.faceDir(p.fx, 0);
        c.update(gdt);
        if (drunk && p.state === 'idle' && !p.flying) hold.rotation.z = Math.sin(T * 1.9 + p.i * 2) * 0.12;
        // tractie van het pistool: de schietarm omhoog
        const arm = p.gunArm; arm.rotation.x = lerp(arm.rotation.x, -1.55, p.drawK); arm.rotation.z = lerp(arm.rotation.z, 0, p.drawK);
        // ring volgt
        p.ring.position.x = p.homeX; p.ring.material.opacity = R.state === 'armed' || R.state === 'signal' ? 0.5 + 0.35 * Math.sin(T * 6 + p.i * 3) : 0.85;
        // tag volgt het hoofd
        if (p.tagSp.visible) p.tagSp.position.set(hold.position.x, headY(p) + 1.1, 0.6);
      }
    }

    // ---------------- camera ----------------
    function camDist() { const a = camera.aspect || 1.7; return clamp(8.4 / (Math.tan(THREE.MathUtils.degToRad(46) / 2) * a), 11.2, 22); }
    function camTargets() {
      const D = camDist(); const st = R.state;
      sway = Math.sin(T * 0.4) * 0.25;
      if (st === 'hit' && R.gag) { R.gag.cam(cT); return; }
      if (st === 'foul') { const p = pl[R.foul]; cT.pos.set(p.homeX * 0.35 + sway, 2.4, D - 3.2); cT.look.set(p.homeX * 0.6, 1.5, 0); cT.fov = 42; return; }
      if (st === 'announce' || st === 'start') { const u = clamp(R.t / 1.2, 0, 1); cT.pos.set(lerp(-3, 0, u) + sway, lerp(2.0, 3.6, u), D + 2.0); cT.look.set(0, lerp(6.0, 4.2, u), 0); cT.fov = 52; return; }
      if (st === 'armed' && R.focusUntil > R.t && (R.focus === 'deurman' || R.focus === 'hiccup' || R.focus === 'bell')) {
        if (R.focus === 'deurman') { cT.pos.set(0, 3.8, D - 4.5); cT.look.set(0, 5.4, -6); cT.fov = 40; }
        else if (R.focus === 'hiccup') { cT.pos.set(1.5, 4.4, D - 2.5); cT.look.set(0.5, 9.0, -9); cT.fov = 46; }
        else { cT.pos.set(-3.5, 3.6, D - 3); cT.look.set(-8.4, 5.5, 0.6); cT.fov = 44; }
        return;
      }
      if (st === 'armed') { const u = clamp(R.t / 6, 0, 1); cT.pos.set(sway, 3.2 - u * 0.3, D - 0.5 - u * 0.8); cT.look.set(0, 3.7, 0); cT.fov = 50; return; }
      if (st === 'signal' || st === 'seqshow' || st === 'seqin') { cT.pos.set(sway * 0.4, 3.0, D - 1.3); cT.look.set(0, 3.9, 0); cT.fov = 50 - punch * 4; return; }
      if (st === 'result' || st === 'foulboth') { cT.pos.set(sway, 3.3, D + 0.8); cT.look.set(0, 3.8, 0); cT.fov = 50; return; }
      cT.pos.set(sway, 3.2, D); cT.look.set(0, 3.7, 0); cT.fov = 50;
    }
    function updateCam(dt) {
      camTargets();
      const rate = R.state === 'hit' ? 6 : R.state === 'signal' ? 9 : 3.2;
      camPos.x = damp(camPos.x, cT.pos.x, rate, dt); camPos.y = damp(camPos.y, cT.pos.y, rate, dt); camPos.z = damp(camPos.z, cT.pos.z, rate, dt);
      camLook.x = damp(camLook.x, cT.look.x, rate, dt); camLook.y = damp(camLook.y, cT.look.y, rate, dt); camLook.z = damp(camLook.z, cT.look.z, rate, dt);
      const f = damp(camera.fov, cT.fov, rate, dt);
      camera.position.copy(camPos); camera.lookAt(camLook);
      if (drunk) camera.rotateZ(Math.sin(T * 1.6) * 0.05 + Math.sin(T * 4.1) * 0.012);
      if (Math.abs(f - camera.fov) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    }

    // ---------------- hoofd-update ----------------
    function realAdvance(dt) {
      const now = performance.now(); const real = (now - lastReal) / 1000; lastReal = now;
      return real > 0.25 ? dt : Math.max(dt, real);
    }
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt; clock += realAdvance(dt); punch = Math.max(0, punch - dt * 3);
      readEvents();
      // in een bullet-time-gag loopt de wereld op slow-mo
      let gdt = dt;
      if (R.state === 'hit' && R.gag) {
        const g = R.gag, u = g.t / g.D;
        const sp = u < 0.12 ? 1 : u < 0.62 ? 0.38 : lerp(0.38, 1, smoothstep(0.62, 0.95, u));
        gdt = dt * sp; g.t += gdt; g.update(gdt);
        if (g.t >= g.D) g.done = true;
      }
      stepRound(dt);
      updatePlayers(dt, gdt);
      // bord-animatie
      if (W.panelMesh.visible) { panelPop = Math.min(1, panelPop + dt * 6); const k = 0.4 + 0.6 * easeBack(panelPop); W.panelMesh.scale.setScalar(k * (1 + (R.state === 'signal' ? Math.sin(T * 18) * 0.02 : 0))); }
      W.update(T, dt);
      updateCam(dt);
    }
    function resultUpdate(dt) {
      T += dt; resultT += dt;
      updatePlayers(dt, dt); W.update(T, dt); updateCam(dt);
    }
    function introUpdate(dt) {
      introT += dt; T += dt;
      for (const p of pl) { p.c.pose = 'idle'; p.c.faceDir(p.fx, 0); p.c.update(dt); p.holder.position.set(p.homeX, 0, 0); }
      W.update(T, dt);
      const D = camDist(); const a = introT * 0.25;
      camPos.set(Math.sin(a) * 9, 3.0 + Math.sin(introT * 0.3) * 0.5, D + 4 + Math.cos(a) * 1.5); camLook.set(0, 4.2, 0);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }

    // ---------------- init ----------------
    resetPlayers(); refreshHud();
    camPos.set(0, 3.2, camDist() + 4); camera.position.copy(camPos); camera.lookAt(0, 4.2, 0);
    ctx.hud.setScore(`Ronde 1/7   ${names[0]} 0 – 0 ${names[1]}`);

    return {
      update, introUpdate, resultUpdate,
      onStart() { refreshHud(); },
      onCountdown() { refreshHud(); },
      onResize() { },
      onSwap(sw) {
        for (const p of pl) fx.particles.burst(p.homeX, 1.4, 0.5, { count: 26, speed: 5, up: 1, life: 0.7, size: 0.5, colors: [0xffe14a, 0xffffff, 0xff6fa5], gravity: 3 });
        W.say(sw ? 'WISSEL!' : 'TERUG!', 0, 3.6, 0.8, { dur: 1.2, scale: 1.4, color: '#c47a10' });
      },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m && scores[i] > 0) { scores[i]--; W.say('-1', pl[i].homeX, headY(pl[i]) + 1.2, 0.8, { dur: 1.2, scale: 1.4, color: '#c02a2a' }); } });
        refreshHud();
      },
      celebrate(w) {
        pl.forEach((p) => { p.state = 'idle'; p.drawK = 0; p.c.body.rotation.set(0, 0, 0); p.holder.visible = true; p.holder.rotation.set(0, 0, 0); p.holder.scale.setScalar(p.size); p.holder.position.set(p.homeX, 0, 0); p.flying = false; p.kx = 0; p.kv = 0; p.c.pose = p.i === w ? 'cheer' : 'sad'; p.stars.visible = false; });
        W.react('cheer', 6);
        for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst(pl[w].homeX + rand(-2, 2), 4 + rand(0, 3), rand(-1, 2), { count: 34, speed: 7, up: 1.2, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.35 }); } catch (e) { /* weg */ } }, k * 260);
      },
      dispose() { if (R.gag) R.gag.dispose(); },
      dbg: {
        state: () => ({ T, clock, round: R.n, rstate: R.state, kind: R.def.kind, target: R.target, seq: R.seq.slice(), prog: R.prog.slice(), scores: scores.slice(), t: R.t, sigClock: R.sigClock, winner: R.winner, done, replays, sd: !!R.def.sd, mult: R.mult, times: pl.map((p) => p.times.slice()), best: pl.map((p) => p.best), gag: R.gag ? R.gag.kind : null, gagU: R.gag ? R.gag.t / R.gag.D : 0, fakeNow: R.idx, armedEvents: R.events.map((e) => e.type) }),
        pl, world: W, setGagBag: (a) => { gagBag = a.slice(); },
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, shuffle, TAU, smoothstep, canvasTex } from '../engine/util.js';
import { KEY_LABELS } from '../engine/input.js';
import { CW, CH, CT, PAIR_DEFS, SPECIAL_DEFS, DEF_BY_ID, makeCard, frameTex } from './memory_cards.js';
import { buildLibrary, BOOK_TOP } from './memory_world.js';

// Geheugen-Duel — Mario Party-memory met magische kaarten op een gigantisch toverboek.
// Om en om aan de beurt (8 s per keuze), paar = punt + nog een keer. Gimmicks: bom, joker, spiegel, spook + de poltergeist die de kaarten schudt.

const COLS = 5, ROWS = 4, PX = 1.85, PZ = 2.35;
const CARD_Y = BOOK_TOP + CT / 2 + 0.02;
const NSLOT = COLS * ROWS;
const slotX = (s) => ((s % COLS) - 2) * PX;
const slotZ = (s) => (Math.floor(s / COLS) - 1.5) * PZ;
const TURN_SEC = 8;
const GAME_CAP = 175;          // veiligheidsgrens (s): daarna eindigt het potje na de lopende beurt

export default {
  id: 'memory',
  name: 'Geheugen-Duel',
  giver: 'Bibliothecaris Boekweit',
  icon: '🃏',
  mode: 'pvp',
  time: 100,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'puzzle',
  blurb: 'In de magische bibliotheek liggen <b>20 kaarten</b> op een gigantisch toverboek. Om en om draai je <b>twee kaarten</b> om: een <b>paar</b> is een punt en je mag nog een keer! Geen paar? Dan draaien ze terug en is je broer aan de beurt. Je hebt maar <b>8 seconden</b> per keuze. Pas op voor de <b>bom</b>, de <b>poltergeist</b> die alles door elkaar schudt, en let op de <b>joker</b> en de <b>spiegel</b>: daarmee kun je nog winnen!',
  controls: ['{move} cursor over de kaarten', '{a} kaart omdraaien', '{b} spring naar de volgende kaart'],
  tip: 'Onthoud wat er al open is geweest. Een bom laat alle kaarten even zien: kijk dan goed! Het allerlaatste paar is goud en telt voor 2 punten.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const css = players.map((p) => p.css);
    const L = ctx.lights('indoor', { shadow: 13, center: [0, 0, 0], fogNear: 55, fogFar: 150 });
    L.hemi.intensity = 1.05; L.hemi.color.set(0xc8c0ff); L.hemi.groundColor.set(0x5a3a2a);
    L.sun.color.set(0xfff0d0); L.sun.intensity = 1.6; L.sun.position.set(-9, 22, 14);
    scene.fog.color.set(0x241812);
    const W = buildLibrary(ctx, L);
    const spd = ctx.twist.speed || 1;
    const lowg = ctx.twist.id === 'lowgrav';
    const drunk = ctx.twist.id === 'drunk';
    const turnLen = TURN_SEC / spd;
    const aLabel = (i) => (ctx.twist.id === 'swapab' ? KEY_LABELS[i].b : KEY_LABELS[i].a);
    const bLabel = (i) => (ctx.twist.id === 'swapab' ? KEY_LABELS[i].a : KEY_LABELS[i].b);
    const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();

    // ---------------- kaarten ----------------
    const faces = []; PAIR_DEFS.forEach((d) => { faces.push(d.id, d.id); }); SPECIAL_DEFS.forEach((d) => faces.push(d.id));
    shuffle(faces, ctx.rng);
    const slots = new Array(NSLOT).fill(null);
    const cards = faces.map((face, k) => {
      const def = DEF_BY_ID[face], m = makeCard(face);
      scene.add(m.root);
      const c = { uid: k, face, kind: def.special ? face : 'pair', def, root: m.root, flip: m.flip, mat: m.frontMat, slot: k, st: 'down',
        p: new THREE.Vector3(slotX(k), CARD_Y + 14, slotZ(k)), tgt: new THREE.Vector3(slotX(k), CARD_Y, slotZ(k)), ang: 0, angT: 0, lift: 0, wob: 0, glow: 0, sc: 1, scT: 1, tw: null, hidden: false, owner: -1 };
      slots[k] = c;
      c.tw = { t: -0.15 - k * 0.07, dur: 0.75, from: c.p.clone(), to: c.tgt.clone(), arc: 0, spin: TAU, sc0: 1, sc1: 1, started: false };
      return c;
    });
    const piles = [[], []];
    const sColor = [0x35c46f, 0x4a8cff];

    function tween(c, to, dur, { delay = 0, arc = 0, spin = 0, sc = null, onDone = null } = {}) {
      c.tw = { t: -delay, dur, from: c.p.clone(), to: to.clone(), arc, spin, sc0: c.sc, sc1: sc == null ? c.scT : sc, started: false, onDone };
      c.tgt.copy(to); if (sc != null) c.scT = sc;
    }
    function cardsUpdate(dt) {
      const hopK = lowg ? 2.4 : 1;
      for (const c of cards) {
        if (c.hidden) continue;
        const w = c.tw;
        if (w) {
          w.t += dt;
          if (w.t >= 0) {
            if (!w.started) { w.started = true; w.from.copy(c.p); w.sc0 = c.sc; }
            const u = clamp(w.t / w.dur, 0, 1), e = u * u * (3 - 2 * u);
            c.p.lerpVectors(w.from, w.to, e); c.p.y += w.arc * Math.sin(Math.PI * u);
            c.root.rotation.y = w.spin * e; c.sc = lerp(w.sc0, w.sc1, e);
            if (u >= 1) { c.p.copy(w.to); c.root.rotation.y = 0; c.sc = w.sc1; c.tw = null; if (w.onDone) w.onDone(); }
          }
        } else {
          c.p.x = damp(c.p.x, c.tgt.x, 13, dt); c.p.y = damp(c.p.y, c.tgt.y, 13, dt); c.p.z = damp(c.p.z, c.tgt.z, 13, dt); c.sc = damp(c.sc, c.scT, 10, dt);
        }
        c.ang = damp(c.ang, c.angT, lowg ? 7 : 11, dt); if (Math.abs(c.ang - c.angT) < 0.004) c.ang = c.angT;
        c.lift = damp(c.lift, c.liftT || 0, 14, dt); c.wob = Math.max(0, c.wob - dt * 1.6);
        c.glow = damp(c.glow, c.glowT || 0, 8, dt);
        c.root.position.set(c.p.x, c.p.y + Math.sin(c.ang) * 0.95 * hopK + c.lift, c.p.z);
        c.root.scale.setScalar(Math.max(0.001, c.sc));
        c.flip.rotation.z = c.ang;
        c.flip.rotation.x = c.wob > 0 ? Math.sin(T * 38) * c.wob * 0.16 : (c.lift > 0.02 ? -c.lift * 0.25 : 0);
        c.mat.emissiveIntensity = c.glow * (0.32 + Math.sin(T * 14) * 0.08);
      }
    }
    const slotPos = (s) => v3b.set(slotX(s), CARD_Y, slotZ(s));
    function place(c, s, tw = true) { slots[c.slot] === c && (slots[c.slot] = null); c.slot = s; slots[s] = c; c.tgt.set(slotX(s), CARD_Y, slotZ(s)); }
    function burst(x, y, z, o) { fx.particles.burst(x, y, z, o); }
    function popup(text, x, y, z, color = '#ffe14a', s = 1.2) { fx.texts.add(text, x, y, z, color, s); }

    // ---------------- spelers ----------------
    const BASE_X = [-8.2, 8.2];
    const pl = players.map((pp, i) => {
      const c = ctx.make.brother(i);
      const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const size = ctx.pvp.size(i); const sc = 1.5 * size; holder.scale.setScalar(sc); holder.position.set(BASE_X[i], 0.02, 0.9);
      const hs = c.spec.headScale ?? 1; c._hat('wizard', i ? 0x2a54c8 : 0x1f8a48, 0xffd24a, 0.3 * c.s * hs, c.s, c.head);
      // toverstaf
      const s = c.s;
      const wand = new THREE.Group();
      wand.add(mesh(new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.9 * s, 6), mat(0x4a2a60), { pos: [0, -0.4 * s, 0] }));
      const starM = mesh(new THREE.OctahedronGeometry(0.1 * s, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [0, -0.92 * s, 0], scale: [1, 1, 0.5] }); wand.add(starM);
      const tip = new THREE.Object3D(); tip.position.set(0, -0.92 * s, 0); wand.add(tip);
      c.hold(wand, i === 0 ? 'r' : 'l');
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 32), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(BASE_X[i], 0.04, 0.9); scene.add(ring);
      // lichtzuil bij de actieve speler
      const beamCol = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beamCol.position.set(BASE_X[i], 4.5, 0.9); scene.add(beamCol);
      // naamplaatje
      const plaque = canvasTex(512, 192, (g, w, h) => {
        g.fillStyle = pp.css; g.strokeStyle = '#1a0e08'; g.lineWidth = 12; g.beginPath(); g.roundRect(10, 10, w - 20, h - 66, 36); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(w / 2 - 30, h - 58); g.lineTo(w / 2, h - 10); g.lineTo(w / 2 + 30, h - 58); g.closePath(); g.fill(); g.stroke(); g.fillRect(w / 2 - 26, h - 62, 52, 10);
        g.fillStyle = '#fff'; g.font = 'bold 80px Fredoka, Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(pp.name.toUpperCase(), w / 2, (h - 66) / 2 + 12, w - 50); g.fillText(pp.name.toUpperCase(), w / 2, (h - 66) / 2 + 12, w - 50);
      });
      const banner = new THREE.Sprite(new THREE.SpriteMaterial({ map: plaque, transparent: true, depthTest: false, fog: false })); banner.scale.set(3.1, 1.16, 1); banner.renderOrder = 18; banner.visible = false; scene.add(banner);
      // cursor
      const cursor = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.55, CH + 0.55), new THREE.MeshBasicMaterial({ map: frameTex(), color: pp.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
      cursor.rotation.x = -Math.PI / 2; cursor.position.set(0, CARD_Y + 0.3, 0); cursor.visible = false; cursor.renderOrder = 6; scene.add(cursor);
      // magische straal
      const zap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); zap.visible = false; zap.renderOrder = 7; scene.add(zap);
      return { i, c, holder, size, sc, wand, tip, wandArm: i === 0 ? c.armR : c.armL, ring, beamCol, banner, cursor, zap, pose: 'idle', poseT: 0, name: pp.name, bob: i * 1.7 };
    });

    // zandloper-balk aan de voorkant van de tafel
    const timerBar = mesh(new THREE.BoxGeometry(8, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: 0x35c46f }), { cast: false, receive: false, pos: [0, 0.12, 6.3] }); timerBar.visible = false; scene.add(timerBar);
    const timerBack = mesh(new THREE.BoxGeometry(8.3, 0.1, 0.5), mat(0x2a1a10), { cast: false, receive: false, pos: [0, 0.06, 6.3] }); scene.add(timerBack);

    // ---------------- toestand ----------------
    const T0 = { phase: 'deal', active: 0, first: null, second: null, timer: turnLen, cur: [0, NSLOT - 1], total: 0, shuffles: 0, ghosts: 0, nextGhost: 24 + rand(0, 8), turns: 0, misses: [0, 0], done: false, revealed: false };
    const S = T0;
    let T = 0, introT = 0, timers = [], lastTaunt = [-9, -9];
    const dirSt = [{ prev: null, hold: 0, rep: 0 }, { prev: null, hold: 0, rep: 0 }];
    const later = (sec, fn) => { timers.push({ t: sec, fn }); };
    const scoreOf = (i) => piles[i].reduce((a, pr) => a + (pr.w || 1), 0);
    const remainingPairs = () => cards.filter((c) => c.kind === 'pair' && (c.st === 'down' || c.st === 'up')).length / 2;

    hud.setTimer(null);
    function refreshHud() {
      hud.setScore(`${names[0]} ${scoreOf(0)} – ${scoreOf(1)} ${names[1]}`);
      for (const p of pl) hud.setPlayerInfo(p.i, `${scoreOf(p.i)} ${scoreOf(p.i) === 1 ? 'punt' : 'punten'}${S.active === p.i && !S.done && S.phase !== 'deal' ? ' · aan de beurt' : ''}`);
    }
    function hint() {
      if (S.done) { hud.setHint(null); return; }
      const p = S.active;
      if (S.phase === 'pick1' || S.phase === 'pick2') hud.setHint(`<b style="color:${css[p]}">${names[p]}</b> is aan de beurt: <b>${KEY_LABELS[p].move}</b> = cursor · <b>${aLabel(p)}</b> = omdraaien · <b>${bLabel(p)}</b> = volgende kaart`);
      else if (S.phase === 'peek') hud.setHint('Kijk goed naar de kaarten en onthoud ze!');
      else hud.setHint(null);
    }
    function setPose(p, pose, sec) { p.pose = pose; p.poseT = sec; }

    // ---------------- cursor ----------------
    const targetable = (s) => slots[s] && slots[s].st === 'down';
    function nextCur(from, d) {
      const col = from % COLS, row = Math.floor(from / COLS);
      const dc = d === 'L' ? -1 : d === 'R' ? 1 : 0, dr = d === 'U' ? -1 : d === 'D' ? 1 : 0;
      let c = col, r = row; const n = dc ? COLS : ROWS;
      for (let k = 0; k < n; k++) { c = (c + dc + COLS) % COLS; r = (r + dr + ROWS) % ROWS; const s = r * COLS + c; if (targetable(s)) return s; }
      return ((row + dr + ROWS) % ROWS) * COLS + ((col + dc + COLS) % COLS);
    }
    function ensureCursor(i) { if (!targetable(S.cur[i])) { for (let k = 0; k < NSLOT; k++) { const s = (S.cur[i] + k) % NSLOT; if (targetable(s)) { S.cur[i] = s; return; } } } }
    function moveCur(i, d) { const n = nextCur(S.cur[i], d); if (n !== S.cur[i]) { S.cur[i] = n; audio.sfx('tick', { vol: 0.5 }); } }
    function jumpNext(i) { for (let k = 1; k <= NSLOT; k++) { const s = (S.cur[i] + k) % NSLOT; if (targetable(s)) { S.cur[i] = s; audio.sfx('click', { vol: 0.5 }); return; } } }
    // richtingen als losse stappen, met herhaling bij ingedrukt houden
    function dirEvents(i, inp, dt) {
      const st = dirSt[i]; let cur = null;
      if (drunk) { const m = Math.hypot(inp.x, inp.y); if (m > 0.55) cur = Math.abs(inp.x) >= Math.abs(inp.y) ? (inp.x > 0 ? 'R' : 'L') : (inp.y > 0 ? 'D' : 'U'); }
      else { if (inp.leftP) cur = 'L'; else if (inp.rightP) cur = 'R'; else if (inp.upP) cur = 'U'; else if (inp.downP) cur = 'D'; else if (inp.left && st.prev === 'L') cur = 'L'; else if (inp.right && st.prev === 'R') cur = 'R'; else if (inp.up && st.prev === 'U') cur = 'U'; else if (inp.down && st.prev === 'D') cur = 'D'; else if (inp.left) cur = 'L'; else if (inp.right) cur = 'R'; else if (inp.up) cur = 'U'; else if (inp.down) cur = 'D'; }
      let out = null;
      if (cur && cur !== st.prev) { out = cur; st.hold = 0; st.rep = 0; }
      else if (cur) { st.hold += dt; if (st.hold > 0.3 / Math.sqrt(spd)) { st.rep -= dt; if (st.rep <= 0) { out = cur; st.rep = 0.11 / spd; } } }
      st.prev = cur; return out;
    }

    // ---------------- beurten ----------------
    function startTurn(who, again = false) {
      S.active = who; S.phase = 'pick1'; S.first = S.second = null; S.timer = turnLen; S.turns++;
      ensureCursor(who);
      for (const p of pl) { p.banner.visible = p.i === who; if (p.i !== who && p.pose === 'point') setPose(p, 'idle', 0); }
      W.owlLook(who ? 1 : -1);
      hud.showBig(again ? `${names[who]}: nog een keer!` : `${names[who]} is aan de beurt!`, again ? 900 : 1100, css[who]);
      audio.sfx(again ? 'powerup' : 'select', { vol: 0.5 });
      refreshHud(); hint();
    }
    function ghostDue() { return S.ghosts < 2 && S.total > S.nextGhost && remainingPairs() > 2; }
    function endTurn() {
      if (S.done) return;
      if (remainingPairs() <= 0 || S.total > GAME_CAP) { finishGame(); return; }
      const next = 1 - S.active;
      if (ghostDue()) { S.ghosts++; S.nextGhost = S.total + 22 + rand(0, 8); poltergeist(() => startTurn(next)); return; }
      startTurn(next);
    }
    function flipCard(c) {
      c.st = 'up'; c.angT = Math.PI; c.liftT = 0; audio.sfx('whoosh', { vol: 0.35, rate: 1.3 }); audio.sfx('click', { vol: 0.5 });
      later(0.2, () => burst(c.p.x, c.p.y + 1.0, c.p.z, { count: 10, speed: 3, up: 1, life: 0.6, size: 0.3, colors: c.def.special ? [0xff7a3a, 0xffd24a, 0xffffff] : [0xffe9a0, 0xffffff, sColor[S.active]], gravity: 4 }));
      if (!S.first) {
        S.first = c; S.phase = 'flip1'; hud.setTimer(null);
        later(0.5, () => { if (c.kind !== 'pair') special(c); else { S.phase = 'pick2'; S.timer = turnLen; ensureCursor(S.active); hint(); } });
      } else {
        S.second = c; S.phase = 'flip2'; hud.setTimer(null);
        later(0.5, resolve);
      }
    }
    function resolve() {
      const a = S.first, b = S.second;
      if (b.kind !== 'pair') { special(b); return; }
      if (a.face === b.face) matchPair(a, b); else mismatch(a, b);
    }
    function pileTarget(i, k, w) { return v3.set((i ? 1 : -1) * 6.9 + (w ? 0.5 : -0.5), 0.07, -4.3 + clamp(k, 0, 8) * 1.2); }
    function claim(a, b, i, fromJoker = false) {
      const k = piles[i].length; const pr = [a, b]; pr.w = remainingPairs() === 1 ? 2 : 1; piles[i].push(pr);
      if (pr.w === 2) { popup('GOUDEN PAAR! +2', (a.p.x + b.p.x) / 2, 4.2, (a.p.z + b.p.z) / 2, '#ffd23a', 1.7); hud.showBig('GOUDEN PAAR: 2 PUNTEN!', 1500, '#ffd23a'); audio.sfx('win', { vol: 0.5 }); }
      for (const [c, w] of [[a, 0], [b, 1]]) {
        if (slots[c.slot] === c) slots[c.slot] = null; c.slot = -1; c.st = 'claimed'; c.owner = i; c.angT = Math.PI; c.glowT = 0.6; c.liftT = 0;
        tween(c, pileTarget(i, k, w), 0.85, { arc: 2.2, spin: 0, sc: 0.62, delay: w * 0.08 });
      }
      later(0.9, () => { a.glowT = pr.w === 2 ? 0.5 : 0; b.glowT = pr.w === 2 ? 0.5 : 0; });
      refreshHud();
      if (remainingPairs() === 1) { later(1.2, () => { if (!S.done) { hud.toast('Het LAATSTE paar is goud: 2 punten!', 2600); popup('LAATSTE PAAR = 2 PUNTEN', 0, 4.8, 0, '#ffd23a', 1.4); } }); }
    }
    function matchPair(a, b) {
      S.phase = 'match'; const i = S.active, p = pl[i];
      a.glowT = b.glowT = 1;
      audio.sfx('good', { vol: 0.8 }); audio.sfx('coin', { vol: 0.6 }); audio.sfx('sparkle', { vol: 0.5 });
      for (const c of [a, b]) burst(c.p.x, c.p.y + 1.2, c.p.z, { count: 26, speed: 5, up: 1.2, life: 0.9, size: 0.45, colors: [0xffe14a, 0xffffff, sColor[i], 0xff9ad5], gravity: 3 });
      popup('PAAR!', (a.p.x + b.p.x) / 2, 3.2, (a.p.z + b.p.z) / 2, '#ffe14a', 1.5);
      setPose(p, 'cheer', 1.5); ctx.shake(0.15);
      later(0.85, () => {
        claim(a, b, i);
        audio.sfx('star', { vol: 0.5 });
        if (remainingPairs() <= 0) { later(0.9, finishGame); return; }
        later(0.8, () => startTurn(i, true));
      });
    }
    function mismatch(a, b) {
      S.phase = 'mismatch'; S.misses[S.active]++;
      a.wob = b.wob = 1; a.mat.emissive.set(0xff3a3a); b.mat.emissive.set(0xff3a3a); a.glowT = b.glowT = 0.9;
      audio.sfx('miss', { vol: 0.7 }); audio.sfx('buzz', { vol: 0.3 });
      popup(pick(['Helaas!', 'Mis!', 'Net niet!', 'Oeps!']), (a.p.x + b.p.x) / 2, 3.0, (a.p.z + b.p.z) / 2, '#ff8a8a', 1.2);
      setPose(pl[S.active], 'sad', 1.2); setPose(pl[1 - S.active], 'wave', 1.2);
      later(0.7, () => { a.glowT = b.glowT = 0; });
      later(1.0, () => { for (const c of [a, b]) { c.st = 'down'; c.angT = 0; c.mat.emissive.set(0xffd24a); } });
      later(1.55, () => { S.first = S.second = null; endTurn(); });
    }
    function timeout() {
      S.phase = 'timeout'; hud.setTimer(null);
      audio.sfx('buzz', { vol: 0.7 }); hud.showBig('Te traag!', 900, '#ff8a5a'); popup('Tijd om!', pl[S.active].holder.position.x, 4.4, 1, '#ff8a5a', 1.3);
      setPose(pl[S.active], 'scared', 1.0);
      if (S.first && S.first.st === 'up') { S.first.st = 'down'; S.first.angT = 0; }
      S.first = null;
      later(0.8, endTurn);
    }

    // ---------------- speciale kaarten ----------------
    function burnCard(c) {
      c.st = 'gone'; c.glowT = 0; c.scT = 0.01; if (slots[c.slot] === c) slots[c.slot] = null; c.slot = -1; c.tgt.y += 1.2;
      later(0.6, () => { c.hidden = true; c.root.visible = false; });
    }
    function afterSpecial(c, again) {
      // de eerste (gewone) kaart draait weer terug
      const f = S.first;
      if (f && f !== c && f.st === 'up') { f.st = 'down'; f.angT = 0; }
      S.first = S.second = null;
      burnCard(c);
      later(0.7, () => { if (again) { if (remainingPairs() <= 0) finishGame(); else startTurn(S.active, true); } else endTurn(); });
    }
    function special(c) {
      S.phase = 'special'; const i = S.active, p = pl[i];
      c.mat.emissive.set({ bomb: 0xff4020, joker: 0xff6ad8, mirror: 0x6ac8ff, ghost: 0xaab4ff }[c.kind] || 0xffd24a); c.glowT = 1;
      if (c.kind === 'bomb') {
        hud.showBig('BOEM!', 1100, '#ff5a3a'); audio.sfx('buzz', { vol: 0.5 }); c.wob = 1.2;
        later(0.7, () => {
          audio.sfx('explode', { vol: 1 }); ctx.shake(1);
          burst(c.p.x, c.p.y + 1, c.p.z, { count: 110, speed: 11, up: 1.0, life: 1.1, size: 0.7, colors: [0xff3a10, 0xff7a10, 0xffd23a, 0x222222, 0xffffff], gravity: 5 });
          fx.particles.ring(c.p.x, c.p.y + 0.5, c.p.z, { count: 36, speed: 10, color: 0xffb040, size: 0.5, life: 0.6 });
          setPose(p, 'scared', 1.6);
          const lost = losePoint(i, 'BOEM! -1');
          W.dim = true; later(0.5, () => { W.dim = false; });
          // alle kaarten even open
          later(0.9, () => revealAll(1.9, () => afterSpecial(c, false)));
        });
      } else if (c.kind === 'joker') {
        hud.showBig('JOKER!', 1100, '#ff6ad8'); audio.sfx('powerup', { vol: 0.8 }); c.wob = 0.6;
        later(0.8, () => {
          const groups = {};
          for (const k of cards) if (k.kind === 'pair' && (k.st === 'down' || k.st === 'up')) (groups[k.face] ||= []).push(k);
          const opts = Object.values(groups).filter((g) => g.length === 2);
          if (!opts.length) { popup('Geen paren meer!', c.p.x, 3, c.p.z, '#fff', 1.2); afterSpecial(c, true); return; }
          const g = pick(opts);
          for (const k of g) { k.angT = Math.PI; k.st = 'up'; burst(k.p.x, k.p.y + 1, k.p.z, { count: 30, speed: 5, up: 1.4, life: 1.0, size: 0.5, colors: [0xff6ad8, 0xffe14a, 0x6ad8ff, 0xffffff], gravity: 3 }); }
          popup('GRATIS PAAR!', (g[0].p.x + g[1].p.x) / 2, 3.4, (g[0].p.z + g[1].p.z) / 2, '#ff9ae8', 1.5);
          audio.sfx('sparkle', { vol: 0.7 });
          later(0.8, () => { claim(g[0], g[1], i, true); setPose(p, 'cheer', 1.6); audio.sfx('star', { vol: 0.6 }); later(0.6, () => afterSpecial(c, true)); });
        });
      } else if (c.kind === 'mirror') {
        hud.showBig('SPIEGEL!', 1100, '#6ac8ff'); audio.sfx('sparkle', { vol: 0.8 }); c.wob = 0.6;
        later(0.8, () => {
          const s0 = scoreOf(0), s1 = scoreOf(1);
          if (s0 === s1) { popup('Gelijk! Niks verandert', 0, 3.6, 0, '#cfe8ff', 1.3); hud.toast('Spiegel, spiegel: jullie staan gelijk...', 1800); audio.sfx('miss', { vol: 0.5 }); }
          else {
            const t = piles[0]; piles[0] = piles[1]; piles[1] = t;
            for (let q = 0; q < 2; q++) piles[q].forEach((pr, k) => { pr.forEach((cd, w) => { cd.owner = q; tween(cd, pileTarget(q, k, w), 1.1, { arc: 3.4, delay: k * 0.06 + w * 0.04, sc: 0.62 }); }); });
            popup(`${names[0]} ${scoreOf(0)} – ${scoreOf(1)} ${names[1]}`, 0, 4.2, 0, '#9ad8ff', 1.5);
            audio.sfx('powerup', { vol: 0.7 }); ctx.shake(0.4);
            burst(0, 2.5, 0, { count: 70, speed: 8, up: 0.8, life: 1.1, size: 0.5, colors: [0x9ad8ff, 0xffffff, 0xcfa8ff], gravity: 2 });
            setPose(pl[0], scoreOf(0) > scoreOf(1) ? 'cheer' : 'sad', 1.6); setPose(pl[1], scoreOf(1) > scoreOf(0) ? 'cheer' : 'sad', 1.6);
            refreshHud();
          }
          later(1.3, () => afterSpecial(c, false));
        });
      } else { // spook
        hud.showBig('SPOOK!', 1100, '#cfd8ff'); audio.sfx('creak', { vol: 0.8 }); c.wob = 0.8;
        later(0.8, () => { burnCard(c); poltergeist(() => { S.first && S.first.st === 'up' && S.first !== c && (S.first.st = 'down', S.first.angT = 0); S.first = S.second = null; endTurn(); }); });
      }
    }
    function losePoint(i, text) {
      const pr = piles[i].pop();
      if (!pr) { popup('Geen punten te verliezen!', pl[i].holder.position.x, 4.6, 1, '#fff', 1.2); return false; }
      const empty = []; for (let s = 0; s < NSLOT; s++) if (!slots[s]) empty.push(s);
      shuffle(empty, ctx.rng);
      // bom heeft zijn eigen slot nog bezet: er zijn altijd genoeg lege plekken, anders laten we de kaarten vervallen
      if (empty.length < 2) { pr.forEach((cd) => { cd.hidden = true; cd.root.visible = false; cd.st = 'gone'; }); refreshHud(); return true; }
      popup(text, pl[i].holder.position.x, 4.6, 1, '#ff5a5a', 1.6);
      pr.w = 1;
      pr.forEach((cd, w) => {
        const s = empty[w]; cd.owner = -1; cd.slot = s; slots[s] = cd; cd.st = 'down'; cd.glowT = 0; cd.scT = 1;
        tween(cd, v3.set(slotX(s), CARD_Y, slotZ(s)), 0.9, { arc: 3.2, spin: TAU, delay: 0.1 + w * 0.12, sc: 1, onDone: () => { if (!S.revealed) cd.angT = 0; } });
        cd.angT = Math.PI;
      });
      refreshHud(); return true;
    }
    function revealAll(sec, done) {
      S.revealed = true;
      const dn = cards.filter((c) => c.st === 'down');
      dn.forEach((c, k) => later(k * 0.035, () => { c.angT = Math.PI; }));
      popup('KIJK GOED!', 0, 4.5, 0, '#ffe14a', 1.8);
      later(0.3 + sec, () => { dn.forEach((c, k) => later(k * 0.03, () => { if (c.st === 'down') c.angT = 0; })); });
      later(0.3 + sec + 0.8, () => { S.revealed = false; done(); });
    }
    function poltergeist(done) {
      S.phase = 'event'; hud.setTimer(null);
      hud.showBig('POLTERGEIST!', 1300, '#cfd8ff'); W.ghostStart(2.8); W.dim = true; audio.sfx('creak', { vol: 0.9 }); audio.sfx('whisper', { vol: 0.8 });
      hud.setHint('De poltergeist schudt alle kaarten door elkaar!'); for (const p of pl) p.banner.visible = false;
      const gp = W.ghostPos(); popup('UUUUUH!', 0, 5, -3, '#cfd8ff', 1.8);
      later(0.7, () => {
        const mov = cards.filter((c) => c.st === 'down' && c.slot >= 0);
        const own = mov.map((c) => c.slot);
        let perm, tries = 0;
        do { perm = shuffle(own.slice(), ctx.rng); tries++; } while (tries < 10 && perm.filter((s, k) => s === own[k]).length > mov.length * 0.25);
        mov.forEach((c) => { slots[c.slot] = null; });
        mov.forEach((c, k) => { c.slot = perm[k]; slots[perm[k]] = c; tween(c, v3.set(slotX(perm[k]), CARD_Y, slotZ(perm[k])), 0.95 + rand(0, 0.3), { delay: rand(0, 0.5), arc: 2.8, spin: pick([-1, 1]) * TAU }); });
        S.shuffles++; ctx.shake(0.4); audio.sfx('whoosh', { vol: 0.8 });
      });
      later(2.6, () => { W.dim = false; done(); });
    }
    function finishGame() {
      if (S.done) return; S.done = true; S.phase = 'end'; hud.setTimer(null); hud.setHint(null);
      for (const p of pl) p.banner.visible = false;
      const a = scoreOf(0), b = scoreOf(1);
      let w = a > b ? 0 : b > a ? 1 : null, why = '';
      if (w == null) { if (S.misses[0] !== S.misses[1]) { w = S.misses[0] < S.misses[1] ? 0 : 1; why = `Gelijk aantal paren, maar ${names[w]} maakte minder fouten.`; } else { w = Math.random() < 0.5 ? 0 : 1; why = `Helemaal gelijk! De kip beslist: ${names[w]} wint.`; } }
      const jokes = [`${names[w]} heeft een geheugen als een olifant (met een toverstaf)!`, `${names[w]} is de Meester van de Magische Memory!`, `${names[1 - w]} was de kaarten vergeten. Alle kaarten.`];
      setPose(pl[w], 'cheer', 99); setPose(pl[1 - w], 'sad', 99);
      later(0.5, () => ctx.finishPvp({ winner: w, score: [a, b], delay: 800, summary: why ? why : pick(jokes) }));
    }

    // ---------------- invoer per frame ----------------
    function handleInput(dt) {
      const i = S.active, inp = ctx.pvp.input(i), other = ctx.pvp.input(1 - i);
      if (other.bP && T - lastTaunt[1 - i] > 1.2) { lastTaunt[1 - i] = T; popup(pick(['Hihi!', 'Pech!', 'Tja...', 'Ik zie alles!', 'Haha!']), pl[1 - i].holder.position.x, 4.6, 1, css[1 - i], 1.0); setPose(pl[1 - i], 'wave', 0.8); audio.sfx('pop', { vol: 0.4, rate: 1.3 }); }
      else if (dirSt[1 - i].prev) dirSt[1 - i].prev = null;
      if (S.phase !== 'pick1' && S.phase !== 'pick2') { dirEvents(i, blankIn, dt); return; }
      const mv = dirEvents(i, inp, dt); if (mv) moveCur(i, mv);
      if (inp.bP) jumpNext(i);
      if (inp.aP) {
        const c = slots[S.cur[i]];
        if (c && c.st === 'down') flipCard(c); else { audio.sfx('buzz', { vol: 0.35 }); }
      }
    }
    const blankIn = { x: 0, y: 0, left: false, right: false, up: false, down: false, leftP: false, rightP: false, upP: false, downP: false };

    // ---------------- visuals ----------------
    function visuals(dt) {
      const active = S.phase === 'pick1' || S.phase === 'pick2';
      for (const c of cards) c.liftT = 0;
      for (const p of pl) {
        const i = p.i, isAct = S.active === i && !S.done && S.phase !== 'deal' && S.phase !== 'peek';
        // poppetje
        p.poseT -= dt; if (p.poseT <= 0 && p.pose !== 'idle') p.pose = 'idle';
        const slot = S.cur[i], cx = slotX(slot), cz = slotZ(slot);
        const ctrl = isAct && active;
        const hx = p.holder.position.x, hz = p.holder.position.z;
        if (ctrl) p.c.faceDir(cx - hx, cz - hz); else p.c.faceDir(-Math.sign(hx) * 1, 0.55);
        p.c.pose = (p.pose === 'point' || p.pose === 'idle') ? 'idle' : p.pose;
        p.c.speed = 0; p.c.update(dt);
        p.bob += dt;
        p.holder.position.y = 0.02 + (lowg ? 0.35 + Math.sin(T * 1.6 + p.bob) * 0.25 : 0);
        const arm = p.wandArm;
        if (ctrl) { arm.rotation.x = lerp(arm.rotation.x, -1.45 + Math.sin(T * 6) * 0.05, 0.6); arm.rotation.z = lerp(arm.rotation.z, 0, 0.5); }
        p.ring.material.opacity = isAct ? 0.55 + Math.sin(T * 6) * 0.25 : 0.2;
        p.ring.scale.setScalar(p.sc / 1.5 * 1.15 * (isAct ? 1.1 + Math.sin(T * 6) * 0.05 : 1));
        p.beamCol.material.opacity = damp(p.beamCol.material.opacity, isAct && !S.done ? 0.16 + Math.sin(T * 5) * 0.03 : 0, 6, dt);
        if (p.banner.visible) { p.banner.position.set(hx, p.c.height * p.sc + 1.25 + Math.sin(T * 4) * 0.15, p.holder.position.z + 0.5); const k = 1 + Math.sin(T * 6) * 0.04; p.banner.scale.set(3.1 * k, 1.16 * k, 1); }
        // cursor
        p.cursor.visible = ctrl;
        if (ctrl) {
          p.cursor.position.x = damp(p.cursor.position.x, cx, 22, dt); p.cursor.position.z = damp(p.cursor.position.z, cz, 22, dt);
          p.cursor.position.y = CARD_Y + 0.35 + Math.sin(T * 8) * 0.04; const k = 1 + Math.sin(T * 8) * 0.03; p.cursor.scale.set(k, k, 1);
          const c = slots[slot]; if (c && c.st === 'down') c.liftT = 0.28;
          // straal van de staf naar de kaart
          p.wand.updateMatrixWorld(true); p.tip.getWorldPosition(v3);
          v3b.set(p.cursor.position.x, CARD_Y + 0.7, p.cursor.position.z).sub(v3);
          const len = v3b.length();
          p.zap.visible = true; p.zap.position.copy(v3).addScaledVector(v3b, 0.5); p.zap.scale.set(1, len, 1);
          p.zap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3b.normalize());
          p.zap.material.opacity = 0.35 + Math.sin(T * 20) * 0.15;
          if (Math.random() < dt * 24) { const t = Math.random(); fx.particles.emit(v3.x + v3b.x * len * t, v3.y + v3b.y * len * t, v3.z + v3b.z * len * t, rand(-0.5, 0.5), rand(0.2, 1), rand(-0.5, 0.5), { life: 0.5, size: 0.25, color: i ? 0x8ab8ff : 0x7affa8, gravity: 0 }); }
        } else p.zap.visible = false;
      }
      timerBar.visible = active;
      if (active) {
        hud.setTimer(S.timer, 3);
        const k = clamp(S.timer / turnLen, 0, 1); timerBar.scale.x = Math.max(0.001, k); timerBar.position.x = -4 * (1 - k);
        timerBar.material.color.setRGB(lerp(0.95, 0.2, k), lerp(0.2, 0.8, Math.min(1, k * 1.6)), 0.25);
      }
    }

    // ---------------- camera ----------------
    const camP = new THREE.Vector3(0, 12, 17), camL = new THREE.Vector3(0, 0, 1); let camShiftX = 0;
    function camUpdate(dt, intro = false) {
      const a = camera.aspect || 1.7, f = clamp(1.7 / a, 1, 1.7);
      const act = S.done ? 0 : (S.active ? 1 : -1);
      camShiftX = damp(camShiftX, intro ? 0 : act * 0.7, 2.5, dt);
      let tx, ty, tz, lx = 0, ly = 0, lz = 1.0;
      if (intro) { const t = introT * 0.25; tx = Math.sin(t) * 5; ty = 8.6 + Math.sin(t * 0.7) * 0.8; tz = 14.5 + Math.cos(t) * 1.2; }
      else if (S.phase === 'peek' || S.revealed) { tx = 0; ty = 9.4; tz = 12.6; }
      else if (S.phase === 'event') { tx = Math.sin(T * 1.2) * 1.5; ty = 9.2; tz = 13.2; }
      else { tx = camShiftX; ty = 8.5; tz = 11.9 + Math.sin(T * 0.4) * 0.12; }
      camP.x = damp(camP.x, tx * 1.0, 3, dt); camP.y = damp(camP.y, ty * (0.8 + 0.2 * f), 3, dt); camP.z = damp(camP.z, 1 + (tz - 1) * f, 3, dt);
      camL.set(camShiftX * 0.5, ly, lz);
      camera.position.copy(camP); camera.lookAt(camL);
    }

    // ---------------- hoofd-update ----------------
    function stepTimers(dt) {
      for (let k = 0; k < timers.length; k++) timers[k].t -= dt;
      for (let k = 0; k < timers.length;) { if (timers[k].t <= 0) { const fn = timers[k].fn; timers.splice(k, 1); fn(); } else k++; }
    }
    function update(dt) {
      T += dt; if (!S.done) S.total += dt;
      stepTimers(dt);
      if (S.phase === 'deal') { S.phase = 'peek'; S.peekT = 0; refreshHud(); hint(); hud.showBig('KIJK GOED!', 1400, '#ffe14a'); later(0.5, () => { cards.forEach((c, k) => { c.angT = Math.PI; }); audio.sfx('sparkle', { vol: 0.6 }); }); later(0.5 + 3.0, () => { cards.forEach((c) => { c.angT = 0; }); }); later(0.5 + 3.0 + 0.9, () => { startTurn(Math.random() < 0.5 ? 0 : 1); }); }
      else if (S.phase === 'pick1' || S.phase === 'pick2') {
        S.timer -= dt;
        if (S.timer <= 3 && Math.ceil(S.timer) !== Math.ceil(S.timer + dt) && S.timer > 0) audio.sfx('tick', { vol: 0.7, rate: 1.5 });
        if (S.timer <= 0) timeout();
      }
      if (!S.done || S.phase === 'end') handleInput(dt);
      cardsUpdate(dt); visuals(dt);
      W.update(T, dt); camUpdate(dt);
      if (S.phase === 'pick1' || S.phase === 'pick2') { if (!S.hintShown) { S.hintShown = true; } }
    }
    function resultUpdate(dt) {
      T += dt; stepTimers(dt); cardsUpdate(dt); visuals(dt); W.update(T, dt); camUpdate(dt);
    }
    function introUpdate(dt) {
      introT += dt; T += dt;
      cardsUpdate(dt); for (const p of pl) { p.c.pose = 'idle'; p.c.faceDir(-Math.sign(p.holder.position.x), 0.55); p.c.update(dt); }
      W.update(introT, dt); camUpdate(dt, true);
    }

    // beginstand
    for (const p of pl) { p.c.faceDir(-Math.sign(p.holder.position.x), 0.55); p.c.update(0.016); }
    camera.fov = 50; camera.updateProjectionMatrix(); camP.set(0, 9, 16); camera.position.copy(camP); camera.lookAt(0, 0, 1);
    refreshHud();

    return {
      update, resultUpdate, introUpdate,
      onStart() { refreshHud(); },
      onCountdown() { refreshHud(); },
      onSwap(sw) { popup(sw ? 'WISSEL!' : 'TERUG!', 0, 5, 1, '#ffe14a', 1.8); hud.toast(sw ? 'Je bestuurt nu de toetsen van je broer!' : 'Iedereen weer op zijn eigen toetsen.', 2000); },
      onDeurman(movers) {
        if (S.done) return;
        movers.forEach((m, i) => { if (m) { losePoint(i, 'Deurman! -1'); setPose(pl[i], 'scared', 1.5); } });
      },
      celebrate(w) {
        for (const p of pl) p.banner.visible = false;
        setPose(pl[w], 'cheer', 99); setPose(pl[1 - w], 'sad', 99);
        for (let k = 0; k < 6; k++) later(k * 0.25, () => { burst(pl[w].holder.position.x + rand(-2, 2), 4 + rand(0, 3), rand(-1, 3), { count: 34, speed: 7, up: 1.2, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.35 }); });
      },
      dispose() { timers.length = 0; },
      dbg: {
        state: () => ({ T, total: S.total, phase: S.phase, active: S.active, timer: S.timer, cur: S.cur.slice(), first: S.first ? S.first.slot : -1, scores: [scoreOf(0), scoreOf(1)], remaining: remainingPairs(), shuffles: S.shuffles, ghosts: S.ghosts, misses: S.misses.slice(), done: S.done,
          cards: slots.map((c) => (c ? { uid: c.uid, st: c.st, kind: c.kind, face: c.face } : null)), piles: piles.map((p) => p.length), revealed: S.revealed }),
        nextCur, cards, slots, piles, pl, world: W,
      },
    };
  },
};

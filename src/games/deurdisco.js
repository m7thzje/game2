import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, shuffle, TAU, mulberry32 } from '../engine/util.js';
import { buildStage, glyphTex, labelTex, glowTex, GLYPHS, NEON } from './deurdisco_world.js';
import { BEAT, BAR, ROUNDS, ROUNDS_END, SONG_END, EVENTS, SYLS, mtof } from './deurdisco_song.js';
import { friendlyDeurman } from './deurenrace_man.js';

// Deurman-Disco — copy-the-pose voor twee broers. De Deurman danst een pose voor (een combinatie van richtingen + A/B, getoond als
// symbolen boven z'n hoofd); allebei kopiëren jullie hem zo snel en precies mogelijk, terwijl jullie poppetjes de passen nadoen.
//  * Perfect (snel + foutloos) / Goed / Mis; een fout zet je combinatie terug naar het begin; combo's geven een hogere vermenigvuldiger
//  * 3 Perfecte rondes achter elkaar laden de DEURMAN-FLASH: de pose van je broer wordt verstoord (spiegel / nep-stap / trage onthulling)
//  * het tempo loopt op: kortere vensters, langere combinaties; de laatste 4 rondes tellen dubbel
//  * comeback: wie achterstaat laadt de flash met 2 perfecten, krijgt 20% meer tijd en soms een gouden comeback-pose (x2)
//  * winnaar: hoogste score na het nummer (gelijk: meeste perfecten, dan langste combo)

const MIRROR = [3, 2, 1, 0, 4, 5];                 // spiegel: links<->rechts, omhoog<->omlaag
const SABS = [
  { id: 'spiegel', name: 'SPIEGEL-POSE!', col: '#d98aff', desc: 'links/rechts en omhoog/omlaag zijn omgedraaid' },
  { id: 'nep', name: 'NEP-STAP!', col: '#ff6ac0', desc: 'er zit een extra stap in jouw pose' },
  { id: 'trager', name: 'TRAGE TOON!', col: '#6fe8ff', desc: 'de stappen verschijnen één voor één' },
];
const POSE_NAMES = ['Deurknop-draai', 'Scharnier-swing', 'Brievenbus-boogie', 'Sleutelgat-shuffle', 'Dorpel-dansje', 'Kozijn-kick', 'Deurmat-moonwalk', 'Klink-klonk', 'Hoge-vijf-hop', 'Slot-en-grendel', 'Bel-en-ren', 'Voordeur-voltage'];
const HEXC = (s) => parseInt(s.slice(1), 16);
const PERF_BASE = 0.27, GOOD_PTS = 60, PERF_PTS = 100;

// vaste reeks poses (voor allebei de spelers identiek)
function genCombos(rng) {
  const out = []; let last = -1;
  ROUNDS.forEach((r, i) => {
    const seq = [], pool = i < 2 ? [0, 1, 2, 3] : i < 4 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 4, 5];
    for (let k = 0; k < r.len; k++) { let g; do { g = pool[Math.floor(rng() * pool.length)]; } while (g === last || (k === 0 && i < 4 && g > 3)); seq.push(g); last = g; }
    if (i >= 2 && !seq.some((g) => g >= 4)) seq[Math.floor(rng() * seq.length)] = 4 + Math.floor(rng() * 2);       // vanaf ronde 3 altijd een A of B erin
    last = seq[seq.length - 1]; out.push(seq);
  });
  return out;
}

export default {
  id: 'deurdisco',
  name: 'Deurman-Disco',
  giver: 'DJ Deurman',
  icon: '🪩',
  mode: 'pvp',
  time: 75,
  music: 'concert',
  blurb: 'De Deurman danst een <b>pose</b> voor: een rijtje <b>symbolen</b> boven zijn hoofd. Kopieer ze <b>zo snel en precies</b> mogelijk! Een fout? Dan begin je opnieuw. <b>3 Perfecte rondes</b> laden de <b>Deurman-flash</b> die de pose van je broer verstoort. Zing mee!',
  controls: ['{move} de pijl-symbolen tikken', '{a} en {b} de A- en B-symbolen tikken', 'Fout? Dan begin je opnieuw!'],
  tip: 'Let op de symbolen vóór je eigen poppetje: bij een Deurman-flash kunnen ze anders zijn dan bij de Deurman!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tid = ctx.twist.id;
    const GRAV = pv.gravity || 1, SLIP = pv.slip || 0;
    const tempo = tid === 'turbo' ? 1.22 : tid === 'slowmo' ? 0.86 : 1;
    const rng = mulberry32(Math.floor(ctx.rng() * 1e9) + 7);
    const COMBOS = genCombos(rng), NAMES = shuffle(POSE_NAMES.slice(), rng);

    const L = ctx.lights('indoor', { shadow: 14, center: [0, 2, 0], fogNear: 34, fogFar: 80 });
    L.hemi.intensity = 0.95; L.hemi.color.set(0xd8b8ff); L.hemi.groundColor.set(0x40206a);
    L.sun.color.set(0xffd8f0); L.sun.intensity = 1.2; L.sun.position.set(-4, 16, 14);
    camera.fov = 52; camera.updateProjectionMatrix();
    const S = buildStage(ctx);

    // ---------------- de Deurman op het podium ----------------
    const dmHold = new THREE.Group(); dmHold.position.set(0, S.podTop, -2.4); dmHold.scale.setScalar(2.1); scene.add(dmHold);
    const dm = friendlyDeurman(1.0, { hat: true, suit: 0x7a2bd0 }); dmHold.add(dm.group);
    const DM = { J: { lx: 0, rx: 0, alx: 0, arx: 0, alz: 0, arz: 0, tz: 0, tx: 0, hz: 0, hy: 0, by: 0 }, mv: { d: -1, t: 9 }, flash: 0, sing: 0, spin: 0 };
    const camFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })); camFlash.scale.set(2.5, 2.5, 1); camFlash.renderOrder = 20; scene.add(camFlash);

    // ---------------- dansers ----------------
    const BX = [-7.2, 7.2];
    const D = players.map((pp, p) => {
      const c = ctx.make.brother(p), sz = pv.size(p), k = 1.75 * sz; c.group.scale.setScalar(k);
      const holder = new THREE.Group(); holder.add(c.group); holder.position.set(BX[p], 0.7, 2.0); scene.add(holder);
      c.faceDir(0, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      return { p, c, holder, k, sz, bx: BX[p], J: { lx: 0, rx: 0, alx: 0, arx: 0, alz: 0, arz: 0, tz: 0, tx: 0, hz: 0, hy: 0, by: 0 }, mv: { d: -1, t: 9, gold: false }, spin: 0, stumble: 0, cheer: 0, hop: 0, slideX: 0, free: 0,
        score: 0, combo: 0, maxCombo: 0, perfects: 0, goods: 0, misses: 0, streak: 0, req: [], idx: 0, mistakes: 0, done: false, tDone: 0, res: '', lock: 0, sab: null, revealT: null, gold: false, closeT: 0, nepIdx: -1, early: 0, roundPts: 0, firsts: 0, flashesSent: 0, flashesHit: 0 };
    });
    // chips boven de eigen poppetjes + de grote rij boven de Deurman
    const mkChip = (scale) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex(0), transparent: true, depthTest: false })); s.scale.set(scale, scale, 1); s.renderOrder = 12; s.visible = false; scene.add(s); return s; };
    const mainChips = Array.from({ length: 5 }, () => mkChip(1.75));
    D.forEach((d) => { d.chips = Array.from({ length: 6 }, () => mkChip(1.0)); d.lamps = [0, 1, 2].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x554466, transparent: true, depthWrite: false, depthTest: false })); s.scale.set(0.9, 0.9, 1); s.position.set(d.bx + (i - 1) * 0.85, 0.95, 3.7); s.renderOrder = 12; scene.add(s); return s; }); });
    const sabLabels = SABS.map((s) => labelTex(s.name, s.col, 512, 96, 54));
    const sabSpr = D.map((d) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sabLabels[0], transparent: true, depthTest: false })); s.scale.set(3.6, 0.68, 1); s.renderOrder = 14; s.visible = false; scene.add(s); return s; });
    const nameSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(NAMES[0], '#ffe14a', 640, 96, 58), transparent: true, depthTest: false })); nameSpr.scale.set(6.4, 0.96, 1); nameSpr.position.set(0, 12.3, -1.0); nameSpr.renderOrder = 13; nameSpr.visible = false; scene.add(nameSpr);
    const nameTex = NAMES.map((n) => labelTex(n, '#ffe14a', 640, 96, 58));
    const goldBadge = D.map((d) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('x2 GOUD!', '#ffd23f', 320, 80, 50), transparent: true, depthTest: false })); s.scale.set(2.2, 0.55, 1); s.renderOrder = 14; s.visible = false; scene.add(s); return s; });
    const barBack = mesh(new THREE.BoxGeometry(8.2, 0.34, 0.1), new THREE.MeshBasicMaterial({ color: 0x1a0c30 }), { cast: false, pos: [0, 11.4, -1.0] }); scene.add(barBack);
    const barG = new THREE.BoxGeometry(1, 0.22, 0.1); barG.translate(0.5, 0, 0);
    const barFill = new THREE.Mesh(barG, new THREE.MeshBasicMaterial({ color: 0x8dff6a })); barFill.position.set(-4, 11.4, -0.92); scene.add(barFill);
    const flashOv = D.map((d) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(11, 11, 1); s.position.set(d.bx, 4.0, 4.4); s.renderOrder = 18; scene.add(s); return s; });

    // ---------------- toestand ----------------
    let T = 0, introT = 0, songT = 0, started = false, finished = false, ending = false, endT = 0, evI = 0, sylI = 0, lastBeat = -1, cur = -1, curOpen = false, gap = 0;
    const pending = [null, null]; const sabQ = [shuffle(SABS.map((s) => s.id), rng), shuffle(SABS.map((s) => s.id), rng)];
    const stats = { rounds: 0, flashes: 0, perfects: [0, 0] };
    let lyr = null, lastInfo = ['', '']; const timers = []; const later = (s, fn) => timers.push({ t: s, fn });
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);max-width:92vw;padding:4px 16px;border-radius:14px;background:rgba(20,6,40,.62);pointer-events:none;z-index:5;font:700 26px Fredoka,Arial Black,sans-serif;color:#fff;text-shadow:0 2px 4px #000;white-space:nowrap;display:none';
    document.body.append(bar); lyr = bar;
    const behind = (p) => D[1 - p].score - D[p].score >= 500;
    const need = (p) => (behind(p) ? 2 : 3);
    const tNow = () => (started ? songT : introT);

    // ---------------- bewegingen (voor poppetjes en Deurman) ----------------
    function applyMove(tgt, g, k, gold = false) {
      const e = gold ? 1.2 : 1;
      if (g === 0) { tgt.tz = 0.5 * k; tgt.arx = 0.1; tgt.arz = -1.5 * k; tgt.alx = -1.3 * k; tgt.alz = -0.6 * k; tgt.rx = -0.7 * k; tgt.by = 0.04; }
      else if (g === 3) { tgt.tz = -0.5 * k; tgt.alx = 0.1; tgt.alz = 1.5 * k; tgt.arx = -1.3 * k; tgt.arz = 0.6 * k; tgt.lx = -0.7 * k; tgt.by = 0.04; }
      else if (g === 1) { tgt.alx = tgt.arx = -2.9; tgt.alz = 0.35; tgt.arz = -0.35; tgt.by = 0.5 * k * e; tgt.lx = tgt.rx = -0.5 * k; }
      else if (g === 2) { tgt.by = -0.3 * k; tgt.lx = tgt.rx = -1.0 * k; tgt.tx = 0.5 * k; tgt.alx = tgt.arx = -0.9 * k; tgt.alz = 0.45; tgt.arz = -0.45; }
      else if (g === 4) { tgt.alx = tgt.arx = -1.5 * k - 0.2; tgt.alz = -0.5 * k; tgt.arz = 0.5 * k; tgt.by = 0.15 * k; tgt.tx = -0.15 * k; }
      else if (g === 5) { tgt.arx = -2.9 * k; tgt.arz = -0.7 * k; tgt.alx = 0.2; tgt.alz = 1.25 * k; tgt.tz = 0.25 * k; tgt.lx = 0.5 * k; tgt.by = 0.08 * k; tgt.hz = -0.25 * k; }
    }
    const blankJ = () => ({ lx: 0, rx: 0, alx: -0.2, arx: -0.2, alz: 0.15, arz: -0.15, tz: 0, tx: 0, hz: 0, hy: 0, by: 0 });

    // ---------------- ronde-logica ----------------
    function chipTex(p, i) { const d = D[p]; return glyphTex(d.req[i]); }
    function showMain(combo) { mainChips.forEach((s, i) => { s.visible = i < combo.length; if (i < combo.length) { s.material.map = glyphTex(combo[i]); s.material.color.setRGB(1, 1, 1); s.material.needsUpdate = true; s.position.set((i - (combo.length - 1) / 2) * 1.95, 9.8, -1.0); s.userData.pop = 0; } }); }
    function startRound(r) {
      const R = ROUNDS[r], combo = COMBOS[r]; cur = r; curOpen = true; stats.rounds++;
      nameSpr.material.map = nameTex[r % nameTex.length]; nameSpr.visible = true; nameSpr.material.needsUpdate = true;
      showMain(combo);
      D.forEach((d) => {
        d.req = combo.slice(); d.idx = 0; d.mistakes = 0; d.done = false; d.res = ''; d.lock = 0; d.revealT = null; d.nepIdx = -1; d.sab = null; d.early = 0;
        d.gold = R.last || (behind(d.p) && Math.random() < 0.4) && r >= 2; d.closeT = Math.min(R.W * (behind(d.p) ? 1.2 : 1), R.P - 0.1);
        const sb = pending[d.p]; pending[d.p] = null;
        if (sb) applySab(d, sb, R);
        goldBadge[d.p].visible = d.gold;
        layoutChips(d);
      });
      audio.sfx('knock', { vol: 0.5 }); audio.tone(mtof(76), 0.2, { type: 'triangle', vol: 0.12, send: 0.3 });
      DM.mv.d = -1; DM.demo = { t0: songT, i: 0, seq: combo.slice() };
    }
    function applySab(d, id, R) {
      const S0 = SABS.find((s) => s.id === id); d.sab = id; stats.flashes++;
      if (id === 'spiegel') d.req = d.req.map((g) => MIRROR[g]);
      else if (id === 'nep') { const pos = 1 + Math.floor(Math.random() * Math.max(1, d.req.length - 1)); const prev = d.req[pos - 1], nxt = d.req[pos]; let g; do { g = Math.floor(Math.random() * 6); } while (g === prev || g === nxt); d.req.splice(pos, 0, g); d.nepIdx = pos; }
      else if (id === 'trager') d.revealT = d.req.map((_, i) => i * 0.5);
      sabSpr[d.p].material.map = sabLabels[SABS.indexOf(S0)]; sabSpr[d.p].material.needsUpdate = true; sabSpr[d.p].visible = true; sabSpr[d.p].userData.t = 0;
      flashOv[d.p].material.opacity = 1; DM.flash = 0.8; camFlash.material.opacity = 1;
      audio.sfx('static', { vol: 0.35 }); audio.sfx('whoosh', { vol: 0.5 }); ctx.shake(0.35); d.stumble = 0.5;
      hud.toast(`📸 Deurman-flash van ${names[1 - d.p]}: ${S0.name} (${S0.desc})`, 2400);
      fx.particles.burst(d.bx, 3.5, 3.5, { count: 30, speed: 6, up: 0.6, life: 0.8, size: 0.4, colors: [HEXC(S0.col), 0xffffff], gravity: 1 });
    }
    function layoutChips(d) {
      d.chips.forEach((s, i) => {
        const n = d.req.length; s.visible = i < n;
        if (i >= n) return;
        const hidden = d.revealT && songT < ROUNDS[cur].t0 + d.revealT[i];
        s.material.map = hidden ? glyphTex(6) : glyphTex(d.req[i]); s.material.color.setRGB(0.55, 0.55, 0.62); s.material.needsUpdate = true;
        s.position.set(d.bx + (i - (n - 1) / 2) * 1.12, 5.0 + (d.sz > 1.2 ? 0.8 : 0), 3.3);
      });
    }
    const _nc = new THREE.Color(1, 0.55, 1);
    function tintChips(d) {
      const R = ROUNDS[Math.max(cur, 0)];
      d.chips.forEach((s, i) => {
        if (!s.visible) return; const n = d.req.length;
        const hidden = d.revealT && curOpen && songT < R.t0 + d.revealT[i];
        const tex = hidden ? glyphTex(6) : glyphTex(d.req[i]); if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
        if (d.res === 'miss') s.material.color.setRGB(1, 0.35, 0.35);
        else if (i < d.idx) s.material.color.setRGB(0.45, 1, 0.5);
        else if (i === d.idx && curOpen && !d.done) { const pu = 1 + Math.sin(T * 14) * 0.5; s.material.color.setRGB(pu, pu, pu * (i === d.nepIdx ? 0.7 : 1)); }
        else s.material.color.setRGB(0.6, 0.6, 0.68);
        if (i === d.nepIdx && i >= d.idx) s.material.color.multiply(_nc);
        const base = (d.sz > 1.2 ? 0.8 : 0);
        s.position.y = 5.0 + base + (i === d.idx && curOpen && !d.done ? Math.abs(Math.sin(T * 9)) * 0.15 : 0);
      });
    }
    // lees de ingedrukte symbolen van speler p (edge-velden; bij dronken uit de stick afgeleid)
    const aHold = [-1, -1];
    function readInputs(p) {
      const inp = pv.input(p), out = [];
      if (tid === 'drunk') {
        const x = inp.x, y = inp.y, m = Math.hypot(x, y); let g = -1;
        if (m > 0.55) g = Math.abs(x) > Math.abs(y) ? (x < 0 ? 0 : 3) : (y < 0 ? 1 : 2);
        if (g !== aHold[p]) { aHold[p] = g; if (g >= 0) out.push(g); }
      } else { if (inp.leftP) out.push(0); if (inp.upP) out.push(1); if (inp.downP) out.push(2); if (inp.rightP) out.push(3); }
      if (inp.aP) out.push(4); if (inp.bP) out.push(5);
      return out;
    }
    function stepSound(p, i, ok) {
      if (!ok) { audio.sfx('buzz', { vol: 0.3 }); return; }
      const f = mtof(60 + [0, 2, 4, 7, 9, 12][i % 6] + (p ? 12 : 0));
      audio.tone(f, 0.16, { type: 'triangle', vol: 0.16, send: 0.2 }); audio.tone(f * 2, 0.1, { type: 'sine', vol: 0.06 });
    }
    function press(p, gs) {
      const d = D[p], R = ROUNDS[cur];
      if (gs.includes(d.req[d.idx])) {
        if (d.revealT && songT < R.t0 + d.revealT[d.idx]) { d.early++; audio.sfx('click', { vol: 0.25 }); fx.texts.add('te vroeg!', d.bx, 5.6, 3.0, '#6fe8ff', 0.8); return; }
        const g = d.req[d.idx]; d.idx++; d.mv.d = g; d.mv.t = 0; d.mv.gold = d.gold; d.stumble = 0;
        stepSound(p, d.idx - 1, true);
        fx.particles.burst(d.chips[d.idx - 1].position.x, d.chips[d.idx - 1].position.y, 3.3, { count: 8, speed: 3, up: 0.6, life: 0.5, size: 0.25, color: HEXC(GLYPHS[g].col), gravity: 2 });
        if (g === 4) d.spin = 0.001;
        if (d.idx >= d.req.length) completeRound(p);
      } else {
        d.mistakes++; d.idx = 0; d.lock = 0.22; d.stumble = 0.45; d.mv.d = -1; stepSound(p, 0, false);
        fx.texts.add('Fout!', d.bx, 6.7, 3.0, '#ff7a7a', 0.9);
      }
    }
    function mult(d) { return 1 + Math.min(1, Math.floor(d.combo / 3) * 0.25); }
    function completeRound(p) {
      const d = D[p], R = ROUNDS[cur], t = songT - R.t0, len = R.len;
      d.done = true; d.tDone = t;
      const perfT = (PERF_BASE * len + 0.32) * (1 - 0.04 * R.seg) * (d.sab === 'trager' ? 1.9 : 1) * (d.sab === 'nep' ? 1.25 : 1);
      const perfect = d.mistakes === 0 && d.early === 0 && t <= perfT;
      d.res = perfect ? 'perfect' : 'good';
      d.combo++; d.maxCombo = Math.max(d.maxCombo, d.combo);
      let pts = (perfect ? PERF_PTS : GOOD_PTS) + 10 * (len - 2); pts = Math.round(pts * mult(d) * (d.gold ? 2 : 1));
      const other = D[1 - p], first = !other.done;
      let bonus = 0; if (first) { bonus = 20; d.firsts++; }
      d.score += pts + bonus; d.roundPts = pts + bonus;
      if (perfect) { d.perfects++; stats.perfects[p]++; d.streak++; } else { d.goods++; if (!behind(p)) d.streak = 0; else d.streak = Math.max(0, d.streak); }
      // popups
      const col = perfect ? '#ffe14a' : '#8dff6a';
      fx.texts.add(perfect ? 'PERFECT!' : 'GOED', d.bx, 7.4, 3.0, col, perfect ? 1.7 : 1.3);
      fx.texts.add(`+${pts + bonus}${d.gold ? ' x2!' : ''}${first ? ' SNEL!' : ''}`, d.bx, 6.6, 3.0, d.gold ? '#ffd23f' : '#ffffff', 1.0);
      audio.sfx(perfect ? 'sparkle' : 'good', { vol: 0.5 }); if (perfect) audio.sfx('ding', { vol: 0.4, rate: 1 + d.combo / 30 });
      fx.particles.burst(d.bx, 3.2, 3.0, { count: perfect ? 28 : 12, speed: 6, up: 1, life: 0.9, size: 0.35, colors: perfect ? [0xffe14a, 0xffffff, 0xff4fa8] : [0x8dff6a, 0xffffff], gravity: 3 });
      if (perfect) { d.spin = 0.001; d.hop = 1; S.crowdHype = Math.min(1.4, S.crowdHype + 0.15); } else d.hop = 0.5;
      if (d.combo > 0 && d.combo % 5 === 0) { fx.texts.add(`${d.combo} COMBO!`, d.bx, 9.2, 3.0, '#ff9ad5', 1.4); audio.sfx('powerup', { vol: 0.4 }); }
      // flash laden
      if (d.streak >= need(p) && !pending[1 - p]) {
        d.streak = 0; d.flashesSent++; if (!sabQ[p].length) sabQ[p] = shuffle(SABS.map((s) => s.id), rng);
        pending[1 - p] = sabQ[p].pop(); d.loaded = true;
        fx.texts.add('FLASH GELADEN!', d.bx, 8.3, 3.0, '#ffffff', 1.4); audio.sfx('powerup', { vol: 0.6 });
        fx.particles.ring(d.bx, 1.0, 3.5, { count: 24, speed: 6, color: 0xffffff, size: 0.3, life: 0.6 });
      }
      tintChips(d);
    }
    function missPlayer(d) {
      d.res = 'miss'; d.done = true; d.misses++; d.combo = 0; d.streak = 0; d.stumble = 0.8; d.mv.d = -1; d.roundPts = 0;
      fx.texts.add('MIS', d.bx, 7.2, 3.0, '#ff7a7a', 1.4); audio.sfx('miss', { vol: 0.4 });
      fx.particles.burst(d.bx, 3.2, 3.0, { count: 8, speed: 3, up: 0.4, life: 0.6, size: 0.3, colors: [0xff7a7a, 0x888899], gravity: 3 });
      tintChips(d);
    }
    function closeRound() {
      if (!curOpen) return; curOpen = false; closeT = 0;
      for (const d of D) { if (!d.done) missPlayer(d); tintChips(d); sabSpr[d.p].visible = false; goldBadge[d.p].visible = false; }
      mainChips.forEach((s) => { s.material.color.setRGB(0.5, 0.5, 0.58); });
    }

    // ---------------- muziek ----------------
    function play(e, now) {
      const [t, kind, a, b] = e; const when = now + Math.max(0, (t - songT) / tempo), A = audio;
      switch (kind) {
        case 'kick': A.tone(150, 0.2, { type: 'sine', vol: 0.4, slide: 42, when }); break;
        case 'hat': A.noise(0.04, { type: 'highpass', freq: 7500, vol: 0.022, when }); break;
        case 'ohat': A.noise(0.1, { type: 'highpass', freq: 6500, vol: 0.04, when }); break;
        case 'clap': A.noise(0.12, { type: 'bandpass', freq: 1700, q: 1.2, vol: 0.14, when }); A.noise(0.05, { type: 'bandpass', freq: 2400, q: 1.5, vol: 0.1, when: when + 0.012 }); break;
        case 'bass': A.tone(mtof(a), b / tempo, { type: 'sawtooth', vol: 0.12, filter: 520, attack: 0.008, when }); break;
        case 'stab': A.tone(mtof(a), b / tempo, { type: 'square', vol: 0.02, filter: 2200, when }); break;
        case 'pad': A.tone(mtof(a), b / tempo, { type: 'triangle', vol: 0.024, attack: 0.5, filter: 1100, when }); break;
        case 'arp': A.tone(mtof(a), 0.15, { type: 'triangle', vol: 0.034, when, send: 0.3 }); break;
        case 'knock': A.tone(190, 0.1, { type: 'triangle', vol: 0.3, slide: 90, when }); A.noise(0.05, { freq: 900, vol: 0.2, when }); break;
        case 'crash': A.noise(1.1, { type: 'highpass', freq: 3800, vol: 0.12, when }); break;
        case 'sing': A.tone(mtof(a), b / tempo, { type: 'sawtooth', vol: 0.045, filter: 1300, attack: 0.02, when, vib: 0.008, send: 0.25 }); A.tone(mtof(a + 12), b / tempo, { type: 'sine', vol: 0.03, attack: 0.02, when }); break;
        default: break;
      }
    }
    function schedule(upTo) {
      if (!audio.ctx) { while (evI < EVENTS.length && EVENTS[evI][0] < upTo) evI++; return; }
      const now = audio.ctx.currentTime;
      while (evI < EVENTS.length && EVENTS[evI][0] < upTo) play(EVENTS[evI++], now);
    }
    const GROUPS = new Map(); for (const sy of SYLS) { const k = Math.floor(sy.t / BAR + 1e-6); if (!GROUPS.has(k)) GROUPS.set(k, []); GROUPS.get(k).push(sy); }
    function lyricUpdate() {
      while (sylI < SYLS.length && SYLS[sylI].t <= songT) {
        const sy = SYLS[sylI++]; DM.sing = 1; const grp = GROUPS.get(Math.floor(sy.t / BAR + 1e-6)) || [sy];
        lyr.style.display = '';
        lyr.innerHTML = grp.map((x) => `<span style="color:${x.i === sy.i ? '#ffe14a' : x.i < sy.i ? '#ffffff' : '#c9b6f0'};${x.i === sy.i ? 'font-size:31px;' : ''}">${x.text}</span>`).join(' ');
      }
    }

    // ---------------- hoofdlus ----------------
    let lastDt = 0.016;
    function update(dt) {
      lastDt = dt; T += dt; if (!started) { started = true; songT = 0; }
      for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
      if (!ending) {
        songT += dt * tempo; schedule(songT + 0.35); lyricUpdate();
        // nieuwe ronde?
        let r = cur; while (r + 1 < ROUNDS.length && songT >= ROUNDS[r + 1].t0) r++;
        if (r !== cur) { if (curOpen) closeRound(); startRound(r); }
        // invoer
        for (const d of D) {
          d.lock = Math.max(0, d.lock - dt);
          const gs = readInputs(d.p);
          if (curOpen && !d.done && gs.length) { if (d.lock <= 0) press(d.p, gs); }
          else if (gs.length) { d.mv.d = gs[0]; d.mv.t = 0; d.mv.gold = false; d.free = 0.5; }       // vrij dansen buiten de ronde
        }
        // venster sluiten: per speler na z'n eigen tijd; de ronde sluit als allebei klaar zijn (of aan het eind van de periode)
        if (curOpen) {
          const R = ROUNDS[cur], el = songT - R.t0;
          for (const d of D) if (!d.done && el >= d.closeT) missPlayer(d);
          if (D.every((d) => d.done)) { closeT += dt; if (closeT > 0.6) closeRound(); } else closeT = 0;
          if (el >= R.P - 0.05) closeRound();
          for (const d of D) if (d.revealT) tintChips(d);        // trage onthulling
        }
        if (songT >= ROUNDS_END && !ending) { ending = true; endT = 0; closeRound(); later(0.9, endSong); }
        hud.setTimer(Math.max(0, (ROUNDS_END - songT) / tempo), 10);
      } else endT += dt;
      D.forEach((d) => { d.hop = Math.max(0, d.hop - dt * 2); });
      visuals(dt);
    }
    let closeT = 0;
    function winnerOf() {
      if (D[0].score !== D[1].score) return D[0].score > D[1].score ? 0 : 1;
      if (D[0].perfects !== D[1].perfects) return D[0].perfects > D[1].perfects ? 0 : 1;
      if (D[0].maxCombo !== D[1].maxCombo) return D[0].maxCombo > D[1].maxCombo ? 0 : 1;
      return Math.random() < 0.5 ? 0 : 1;
    }
    function endSong() {
      if (finished) return; finished = true;
      const w = winnerOf(), tie = D[0].score === D[1].score;
      hud.setTimer(null); hud.showBig(`${names[w]} wint!`, 1800, players[w].css);
      D[w].cheer = 99; D[1 - w].cheer = -99; S.crowdHype = 1.5; audio.sfx('win'); ctx.shake(0.5); lyr.style.display = 'none';
      mainChips.forEach((s) => { s.visible = false; }); nameSpr.visible = false; D.forEach((d) => d.chips.forEach((s) => { s.visible = false; }));
      for (let k = 0; k < 4; k++) later(k * 0.3, () => fx.particles.burst(rand(-6, 6), 8, 1.5, { count: 40, speed: 8, up: 1, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff4fa8, 0x4fd8ff, 0x8dff6a], gravity: 6 }));
      const J = [`${names[w]} is de nieuwe Disco-Deurman! ${names[1 - w]} had twee linkervoeten.`, `Het publiek van deurtjes klapt ${names[w]} open! ${names[1 - w]} struikelt nog door.`, `De Deurman geeft ${names[w]} een hoge vijf. ${names[1 - w]} krijgt een pleister.`, `${names[w]} danst de scharnieren van de deur. ${names[1 - w]} danst de klink eraf.`];
      const bits = [`${names[0]}: ${D[0].perfects} perfect, beste combo ${D[0].maxCombo}`, `${names[1]}: ${D[1].perfects} perfect, beste combo ${D[1].maxCombo}`];
      if (stats.flashes) bits.push(`${stats.flashes}x Deurman-flash`);
      ctx.finishPvp({ winner: w, score: [D[0].score, D[1].score], delay: 1400, summary: `${pick(J)}${tie ? (D[0].perfects !== D[1].perfects ? ' (Gelijke stand: de meeste perfecten besliste.)' : ' (Helemaal gelijk: de Deurman gooit een munt op.)') : ''} ${bits.join(' · ')}.` });
    }

    // ---------------- beelden ----------------
    function poseDancer(d, dt, bt, bi, bp) {
      const c = d.c, J = d.J, mv = d.mv, s = d.k;
      const tgt = blankJ(); const beat = Math.sin(Math.PI * (bi + bp)), hop = Math.abs(Math.sin(Math.PI * bp)), air = GRAV < 1 ? 2.4 : 1; let spinK = 0;
      mv.t += dt; d.stumble = Math.max(0, d.stumble - dt); d.free = Math.max(0, d.free - dt);
      if (finished && d.cheer > 0) { c.pose = 'cheer'; c.update(dt); c.group.rotation.y = c.yaw; return place(d, dt, bt); }
      if (finished && d.cheer < 0) { c.pose = 'sad'; c.update(dt); return place(d, dt, bt); }
      c.pose = 'idle'; c.speed = 0; c.update(dt);
      tgt.by = hop * 0.1 * air; tgt.tz = beat * 0.1; tgt.lx = beat * 0.35; tgt.rx = -beat * 0.35;
      const style = Math.floor(bi / 8) % 3;
      if (style === 0) { const a = bi % 2 ? 1 : 0.15; tgt.arx = -2.7 * a - 0.2; tgt.arz = -0.35; tgt.alx = -2.7 * (1.15 - a) - 0.2; tgt.alz = 0.35; }
      else if (style === 1) { tgt.alx = -1.5 + beat * 0.3; tgt.arx = -1.5 - beat * 0.3; tgt.alz = 0.5; tgt.arz = -0.5; tgt.tx = 0.1; }
      else { tgt.alx = beat * 1.0; tgt.arx = -beat * 1.0; tgt.alz = 0.3; tgt.arz = -0.3; tgt.hz = beat * 0.2; }
      if (mv.d >= 0 && mv.t < 0.5) { const u = mv.t / 0.5, k = Math.sin(Math.PI * Math.min(1, u)); applyMove(tgt, mv.d, k * air, mv.gold); }
      else if (mv.d >= 0 && curOpen && !d.done && d.idx > 0) { applyMove(tgt, mv.d, 0.35, false); }
      if (d.spin > 0) { d.spin += dt * 10; spinK = d.spin; if (d.spin > TAU) d.spin = 0; }
      if (d.hop > 0) tgt.by += Math.sin(Math.PI * Math.min(1, 1 - d.hop)) * 0.5 * air;
      if (d.stumble > 0) { const w = Math.sin(bt * 30) * 0.5; tgt.alx = 0.3; tgt.arx = 0.3; tgt.alz = 0.9 + w; tgt.arz = -0.9 + w; tgt.tx = 0.35; tgt.hz = w * 0.4; tgt.by = -0.05; }
      if (d.sab && curOpen) { tgt.hz += Math.sin(bt * 12) * 0.25; }
      const kk = 22; for (const key in tgt) J[key] = damp(J[key], tgt[key], kk, dt);
      c.legL.rotation.x = J.lx; c.legR.rotation.x = J.rx; c.armL.rotation.x = J.alx; c.armR.rotation.x = J.arx; c.armL.rotation.z = J.alz; c.armR.rotation.z = J.arz;
      c.torso.rotation.z = J.tz; c.torso.rotation.x = J.tx; c.head.rotation.z = J.hz; c.head.rotation.y = J.hy; c.body.position.y += J.by * s;
      c.group.rotation.y = c.yaw + spinK;
      place(d, dt, bt);
    }
    function place(d, dt, bt) {
      const slide = SLIP > 0.3 ? Math.sin(bt * 1.1 + d.bx) * 1.2 * SLIP : 0;
      d.slideX = damp(d.slideX, slide, 3, dt);
      d.holder.position.x = d.bx + d.slideX; d.holder.position.y = 0.7 + (GRAV < 1 ? 0.4 + Math.sin(bt * 2 + d.bx) * 0.35 : 0);
    }
    function poseDeurman(dt, bt, bi, bp) {
      const J = DM.J, tgt = blankJ(), beat = Math.sin(Math.PI * (bi + bp)), hop = Math.abs(Math.sin(Math.PI * bp));
      DM.mv.t += dt; DM.flash = Math.max(0, DM.flash - dt); DM.sing = Math.max(0, DM.sing - dt * 3.2);
      dm.speed = 0; dm.update(dt);
      tgt.by = hop * 0.12; tgt.tz = beat * 0.08; tgt.lx = beat * 0.3; tgt.rx = -beat * 0.3;
      const style = Math.floor(bi / 4) % 3;
      if (style === 0) { tgt.alx = -0.6 + beat * 0.5; tgt.arx = -0.6 - beat * 0.5; tgt.alz = 0.5; tgt.arz = -0.5; }
      else if (style === 1) { tgt.alx = -2.2 + beat * 0.4; tgt.arx = -2.2 - beat * 0.4; tgt.alz = 0.4; tgt.arz = -0.4; }
      else { tgt.alx = beat * 0.8; tgt.arx = -beat * 0.8; tgt.alz = 0.6; tgt.arz = -0.6; tgt.hz = beat * 0.2; }
      // voordoen: stap voor stap op de maat
      if (DM.demo) {
        const dd = DM.demo, ix = Math.floor((songT - dd.t0) / 0.4);
        if (ix >= 0 && ix < dd.seq.length && ix !== dd.i - 1 + 0 && ix >= dd.i) { dd.i = ix + 1; DM.mv.d = dd.seq[ix]; DM.mv.t = 0; if (dd.seq[ix] === 4) DM.spin = 0.001; }
      }
      if (DM.mv.d >= 0 && DM.mv.t < 0.46) { const k = Math.sin(Math.PI * Math.min(1, DM.mv.t / 0.46)); applyMove(tgt, DM.mv.d, k * 0.95, false); }
      if (DM.flash > 0) { tgt.alx = tgt.arx = -2.6; tgt.alz = 0.25; tgt.arz = -0.25; tgt.tx = -0.15; tgt.by = 0; }
      for (const key in tgt) J[key] = damp(J[key], tgt[key], 22, dt);
      dm.legs[0].rotation.x = J.lx; dm.legs[1].rotation.x = J.rx; dm.arms[0].rotation.x = J.alx; dm.arms[1].rotation.x = J.arx; dm.arms[0].rotation.z = J.alz; dm.arms[1].rotation.z = J.arz;
      dm.torso.rotation.z = J.tz; dm.torso.rotation.x += J.tx; dm.head.rotation.z = J.hz + (DM.flash > 0 ? 0 : 0); dm.group.position.y = J.by;
      if (DM.spin > 0) { DM.spin += dt * 9; dm.group.rotation.y = DM.spin; if (DM.spin > TAU) { DM.spin = 0; dm.group.rotation.y = 0; } } else dm.group.rotation.y = 0;
      const mouth = dm.head.userData.mouth; if (mouth) mouth.scale.y = 1 + DM.sing * 0.7;
      camFlash.position.set(0, S.podTop + 2.43 * 2.1, -0.4); camFlash.material.opacity = DM.flash > 0 ? Math.min(1, DM.flash * 2) : 0; camFlash.scale.setScalar(2.2 + DM.flash * 4);
    }
    function visuals(dt) {
      const bt = tNow(), tn = bt / BEAT, bi = Math.floor(tn), bp = tn - bi;
      const energy = started ? (cur < 0 ? 0.5 : 0.6 + 0.1 * ROUNDS[Math.max(cur, 0)].seg) : 0.4;
      S.update(dt, T + introT, bp, bi, Math.min(1.1, energy));
      if (bi !== lastBeat) { lastBeat = bi; if (started && !finished && bi % 2 === 0) camPunch = 0.06; }
      camPunch = Math.max(0, camPunch - dt * 0.5);
      D.forEach((d) => poseDancer(d, dt, T + introT, bi, bp));
      poseDeurman(dt, T + introT, bi, bp);
      // grote rij + timerbalk
      mainChips.forEach((s) => { if (!s.visible) return; s.userData.pop = Math.min(1, (s.userData.pop || 0) + dt * 5); const pp = s.userData.pop, sc = 1.75 * (pp < 1 ? pp * (1.4 - 0.4 * pp) : 1); s.scale.set(sc, sc, 1); });
      if (cur >= 0 && curOpen) {
        const R = ROUNDS[cur], f = clamp(1 - (songT - R.t0) / R.W, 0, 1);
        barFill.scale.x = Math.max(0.001, 8 * f); barFill.material.color.setRGB(1 - f * 0.6, 0.4 + f * 0.6, 0.3); barBack.visible = barFill.visible = true;
      } else { barBack.visible = barFill.visible = false; }
      if (!started || ending || cur < 0) { barBack.visible = barFill.visible = false; }
      D.forEach((d) => {
        tintChips(d);
        const sp = sabSpr[d.p]; if (sp.visible) { sp.position.set(d.bx, 6.05 + (d.sz > 1.2 ? 0.8 : 0), 3.3); sp.userData.t += dt; sp.material.opacity = 0.7 + Math.sin(T * 10) * 0.3; }
        const gb = goldBadge[d.p]; if (gb.visible) gb.position.set(d.bx, 4.2, 3.4);
        flashOv[d.p].material.opacity = Math.max(0, flashOv[d.p].material.opacity - dt * 1.8);
        const lit = Math.min(3, d.streak); d.lamps.forEach((l, i) => { const on = i < lit; l.material.color.setHex(on ? 0xffe14a : 0x554466); l.scale.setScalar(on ? 1.0 + Math.sin(T * 12 + i) * 0.15 : 0.7); });
        const info = `${d.score} pt · combo ${d.combo} · flash ${Math.min(d.streak, need(d.p))}/${need(d.p)}${pending[d.p] ? ' · 📸 FLASH op komst!' : ''}`;
        if (info !== lastInfo[d.p]) { lastInfo[d.p] = info; hud.setPlayerInfo(d.p, info); }
      });
      hud.setScore(`${names[0]} ${D[0].score} – ${D[1].score} ${names[1]}`);
      placeCamera();
    }
    let camPunch = 0;
    function placeCamera() {
      const sw = Math.sin((T + introT) * 0.4) * 0.5;
      camera.position.set(sw, 7.6, 17.2 - camPunch * 2); camera.lookAt(0, 6.5, 0);
    }
    function resultUpdate(dt) { T += dt; endT += dt; for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } visuals(dt); }
    function introUpdate(dt) { introT += dt; visuals(dt); }
    visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onStart() { try { audio.stopMusic(); } catch (e) { /* geen audio */ } started = true; songT = 0; lastInfo = ['', '']; bar.style.display = ''; },
      onCountdown() { lastInfo = ['', '']; },
      onResize() { camera.updateProjectionMatrix(); },
      onSwap() { for (const d of D) fx.particles.burst(d.bx, 3, 2.5, { count: 24, speed: 4, up: 1, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 2 }); hud.toast('🔄 Wissel! Jullie tikken met elkaars knoppen', 2200); },
      onDeurman(movers) {
        movers.forEach((m, p) => { if (!m) return; const d = D[p]; d.combo = 0; d.streak = 0; d.score = Math.max(0, d.score - 250); d.stumble = 1.2; d.idx = 0; fx.texts.add('DEURMAN ZAG JE! -250', d.bx, 6.4, 3.0, '#ff6a4a', 1.3); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); });
      },
      celebrate(w) { D[w].cheer = 99; D[1 - w].cheer = -99; S.crowdHype = 1.5; },
      dispose() { bar.remove(); },
      dbg: {
        state: () => ({ T, songT, started, finished, ending, cur, open: curOpen, rounds: ROUNDS.length, tempo, combo: cur >= 0 ? COMBOS[cur] : [], r0: cur >= 0 ? ROUNDS[cur].t0 : 0, W: cur >= 0 ? ROUNDS[cur].W : 0, ROUNDS_END,
          P: D.map((d) => ({ score: d.score, combo: d.combo, maxCombo: d.maxCombo, perfects: d.perfects, goods: d.goods, misses: d.misses, streak: d.streak, req: [...d.req], idx: d.idx, done: d.done, res: d.res, sab: d.sab, mistakes: d.mistakes, revealT: d.revealT, gold: d.gold, lock: d.lock, flashesSent: d.flashesSent })), pending: [...pending], stats: { ...stats, perfects: [...stats.perfects] } }),
        setScore(a, b) { D[0].score = a; D[1].score = b; },
        queueSab(p, id) { pending[p] = id; },
        jumpTo(t) { songT = t; evI = EVENTS.findIndex((e) => e[0] >= t); if (evI < 0) evI = EVENTS.length; sylI = SYLS.findIndex((s) => s.t >= t); if (sylI < 0) sylI = SYLS.length; },
        combos: COMBOS,
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, smoothstep } from '../engine/util.js';
import { makeBrother, Animal, Dragon, makeNPC } from '../engine/chars.js';
import { buildWorld, pitPos, DX, STX, PIT_R, TOP_Y, FLOOR_Y, GROUND_Y } from './kalaha_world.js';
import * as R from './kalaha_rules.js';

// Edelsteen-Kalaha — duel: echte Kalaha (Mancala) met glimmende edelstenen op een kermiskraam. Beurtgebaseerd.
//  * links/rechts = kuiltje kiezen, A = zaaien (de stenen hoppen één voor één door de kuiltjes), B = DIEF (1x): pakt 1 steen
//    van het kuiltje aan de overkant van je cursor en stopt hem in je schatkamer
//  * regels: laatste steen in je schatkamer = nog een beurt; laatste steen in een leeg eigen kuiltje = vangst van de overkant;
//    is één kant leeg, dan gaat de rest naar de eigenaar van die kant. Beurttimer (daarna zaait het spel willekeurig), totaal 100 s.
//  * chaos/comeback: een kip die over het bord rent (legt een gouden ei in de schatkamer van wie achterstaat) en een draak die een
//    steen van de leider wegrooft en bij de achterligger in een kuiltje dropt.

const MATCH_TIME = 100, STONES = 4, NG = 48, EGGS = 4;
const PENT = [0, 2, 4, 7, 9];
const ORDER = [[5, 4, 3, 2, 1, 0], [7, 8, 9, 10, 11, 12]];   // kuiltjes van links naar rechts op het scherm
const GOLD = 0xffd23f;

export default {
  id: 'kalaha',
  name: 'Edelsteen-Kalaha',
  giver: 'Kermis-Kees',
  icon: '💎',
  mode: 'pvp',
  time: 100,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'game',
  blurb: 'Echte <b>Kalaha</b> met glimmende edelstenen! <b>Zaai</b> je stenen rond. Laatste steen in je <b>schatkamer</b> = nog een beurt, in een <b>leeg eigen kuiltje</b> = vangst van de overkant! Pas op voor de <b>kip</b> en de <b>draak</b>.',
  controls: ['{move} kuiltje kiezen', '{a} zaaien!', '{b} DIEF (1x): steel 1 steen'],
  tip: 'Het ringetje laat zien waar je laatste steen landt. Maar een paar seconden per beurt!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const tw = ctx.twist.id;
    const GRAV = pv.gravity || 1;
    const L = ctx.lights('night', { shadow: 22, center: [0, 0, 0], fogNear: 55, fogFar: 120 });
    L.hemi.intensity = 1.5; L.hemi.color.set(0xd8d0ff); L.hemi.groundColor.set(0x5a4060);
    L.sun.color.set(0xffe6c0); L.sun.intensity = 2.0; L.sun.position.set(-8, 30, 18);
    camera.fov = 48; camera.updateProjectionMatrix();
    const W = buildWorld(ctx, L);

    // ---------------- toestand ----------------
    let st = { pits: R.newPits(STONES), turn: 0 };              // logische stand (wordt bij het begin van een zet bijgewerkt)
    let phase = 'choose';                                       // choose | sow | capture | thief | event | sweep | end
    let T = 0, introT = 0, timeLeft = MATCH_TIME, finished = false, ph = { t: 0 };
    const sel = [5, 7], thiefUsed = [false, false], lastDir = [0, 0], holdT = [0, 0];
    let turnT = 8, turnMax = 9, tickN = 99, startedPlay = false, auto = null, previewKey = '', preview = null;
    const stats = { moves: 0, extra: [0, 0], captures: [0, 0], thief: [0, 0], eggs: 0, dragons: 0, chickens: 0, timeouts: 0, deurman: 0 };
    const pend = [0, 0];                                        // uitgestelde Deurman-straffen
    let evT = 9, evKind = 0;                                    // volgende gimmick (kip / draak)
    let sow = null, post = null, ev = null, endInfo = null, turnSeq = 0;
    const pulse = Array(14).fill(0);
    const hand = [0, 1].map(() => ({ x: 0, y: 2.2, z: 0, tx: 0, ty: 2.2, tz: 0, act: false }));

    // ---------------- edelstenen ----------------
    const gems = []; const cont = Array.from({ length: 14 }, () => []);
    const tmpP = { x: 0, y: 0, z: 0 };
    const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
    const ROWORD = [4, 3, 5, 2, 6, 1, 7, 0, 8];
    function slotPos(c, k, o) {
      const p = pitPos(c); const jx = (hash(c * 61 + k) - 0.5) * 0.12, jz = (hash(c * 17 + k * 3) - 0.5) * 0.12;
      if (c === 6 || c === 13) {
        const layer = Math.floor(k / 36), kk = k % 36; const col = kk % 4, row = ROWORD[Math.floor(kk / 4)];
        o.x = p.x + (col - 1.5) * 0.5 + jx; o.z = (row - 4) * 0.5 + jz; o.y = FLOOR_Y + 0.26 + layer * 0.3 + (layer % 2) * 0.1;
      } else {
        const layer = Math.floor(k / 14), kk = k % 14;
        if (kk === 0) { o.x = p.x + jx; o.z = p.z + jz; } else if (kk < 6) { const a = (kk / 5 + layer * 0.3) * TAU; o.x = p.x + Math.cos(a) * 0.36; o.z = p.z + Math.sin(a) * 0.36; } else { const a = ((kk - 6) / 8 + layer * 0.17) * TAU; o.x = p.x + Math.cos(a) * 0.6; o.z = p.z + Math.sin(a) * 0.6; }
        o.y = FLOOR_Y + 0.26 + layer * 0.34;
      }
      return o;
    }
    for (let g = 0; g < NG + EGGS; g++) gems.push({ g, x: 0, y: -50, z: 0, c: -1, slot: 0, mode: 'hidden', ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, t: 0, d: 0.3, h: 1, delay: 0, land: null, next: 'rest', ph: Math.random() * 6, s: 0.27, ho: 0, gold: false });
    for (let i = 0, g = 0; i < 14; i++) { if (i === 6 || i === 13) continue; for (let k = 0; k < STONES; k++, g++) { const gm = gems[g]; gm.c = i; gm.slot = k; gm.mode = 'rest'; slotPos(i, k, tmpP); gm.x = tmpP.x; gm.y = tmpP.y; gm.z = tmpP.z; cont[i].push(gm); } }
    for (let g = NG; g < NG + EGGS; g++) { gems[g].gold = true; gems[g].s = 0.34; W.setGemColor(g, GOLD); }
    const freeEgg = () => gems.slice(NG).find((e) => e.mode === 'hidden');
    const dmy = new THREE.Object3D();
    function flyTo(g, c, slot, dur, h, delay, then) {
      slotPos(c, slot, tmpP);
      g.ax = g.x; g.ay = g.y; g.az = g.z; g.bx = tmpP.x; g.by = tmpP.y; g.bz = tmpP.z; g.t = 0; g.d = dur; g.h = h; g.delay = delay || 0; g.mode = 'fly'; g.c = c; g.slot = slot; g.next = 'rest'; g.land = then || null;
    }
    const resv = Array.from({ length: 14 }, () => new Set());
    function reserve(c) { let k = 0; const used = new Set(cont[c].map((g) => g.slot)); while (used.has(k) || resv[c].has(k)) k++; resv[c].add(k); return k; }
    function popTop(c) { const a = cont[c]; if (!a.length) return null; let bi = 0; for (let i = 1; i < a.length; i++) if (a[i].slot > a[bi].slot) bi = i; return a.splice(bi, 1)[0]; }
    function landIn(g) { const c = g.c; g.mode = 'rest'; resv[c].delete(g.slot); cont[c].push(g); pulse[c] = 1; }
    function updateGems(dt) {
      for (const g of gems) {
        if (g.mode === 'rest') { slotPos(g.c, g.slot, tmpP); g.x = tmpP.x; g.y = tmpP.y + (g.gold ? 0.04 : 0); g.z = tmpP.z; }
        else if (g.mode === 'fly') {
          if (g.delay > 0) { g.delay -= dt; }
          else {
            g.t += dt; const u = Math.min(1, g.t / g.d), e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
            g.x = lerp(g.ax, g.bx, e); g.z = lerp(g.az, g.bz, e); g.y = lerp(g.ay, g.by, u) + 4 * g.h * u * (1 - u);
            if (u >= 1) { if (g.land) { const f = g.land; g.land = null; f(g); } else if (g.next === 'rest') landIn(g); }
          }
        } else if (g.mode === 'hand') {
          const h = hand[g.ho]; const k = g.hi; const a = k * 2.4 + T * 1.5, r = 0.14 + 0.1 * Math.sqrt(k);
          g.x = damp(g.x, h.x + Math.cos(a) * r, 14, dt); g.z = damp(g.z, h.z + Math.sin(a) * r, 14, dt); g.y = damp(g.y, h.y - 0.35 + (k % 3) * 0.12, 14, dt);
        } else if (g.mode === 'carried') { /* positie wordt door de draak gezet */ }
        else if (g.mode === 'poof') { g.y += dt * 4; g.t += dt; g.s = Math.max(0, g.s - dt * 0.5); if (g.t > 0.5) { g.mode = 'hidden'; g.s = 0; } }
        if (g.mode === 'hidden') { dmy.scale.setScalar(0); dmy.position.set(0, -50, 0); }
        else { dmy.position.set(g.x, g.y, g.z); dmy.rotation.set(0.3 + Math.sin(g.ph) * 0.2, g.ph + (g.mode === 'rest' ? 0 : T * 6), 0); dmy.scale.setScalar(g.s * (g.mode === 'hand' ? 0.9 : 1)); }
        dmy.updateMatrix(); W.gemMesh.setMatrixAt(g.g, dmy.matrix);
      }
      W.gemMesh.instanceMatrix.needsUpdate = true;
    }

    // ---------------- poppetjes ----------------
    const chars = [0, 1].map((i) => {
      const c = makeBrother(i); const kS = 4.5 / 1.84; const holder = new THREE.Group(); holder.add(c.group);
      const dir = i ? 1 : -1; holder.position.set(dir * 11.7, -1.0, 1.0); holder.scale.setScalar(kS * pv.size(i));
      c.faceDir(-dir, -0.25); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(holder);
      // suikerspin in de linkerhand
      const cf = new THREE.Group(); cf.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 5), mat(0xe8d8b0), { cast: false, pos: [0, 0.1, 0] }));
      cf.add(mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshStandardMaterial({ color: i ? 0x9ad4ff : 0xff9ad0, roughness: 1 }), { cast: false, pos: [0, 0.4, 0], scale: [1, 1.1, 1] }));
      c.hold(cf, 'l'); cf.position.set(0, -0.2, 0.1);
      return { c, holder, i, dir, y0: -1.0, kS, cheerT: 0, sadT: 0, scareT: 0 };
    });
    chars.forEach((o) => { o.holder.userData.k = o.kS; });
    const goblin = makeNPC('goblin'); const gHolder = new THREE.Group(); gHolder.add(goblin.group); gHolder.scale.setScalar(2.4); gHolder.visible = false; scene.add(gHolder);
    const chicken = new Animal('chicken'); chicken.group.scale.setScalar(2.6); chicken.group.visible = false; scene.add(chicken.group);
    const dragon = new Dragon(0x7a2fd4, 1); dragon.group.scale.setScalar(0.8); dragon.group.rotation.order = 'YXZ'; dragon.group.visible = false; scene.add(dragon.group);

    // ---------------- hulpfuncties ----------------
    const storeOf = (p) => R.STORE[p];
    const visCount = (i) => cont[i].length;
    const totalsVis = () => [visCount(6), visCount(13)];
    function leadOf() { const a = R.finalTotals(st.pits); return a[0] === a[1] ? -1 : a[0] > a[1] ? 0 : 1; }
    const hopSpeed = (p) => (pv.speed(p) || 1);
    const sfxNote = (k, vol = 0.2, base = 523) => { if (audio.tone) { const n = PENT[k % 5] + 12 * Math.floor(k / 5); audio.tone(base * Math.pow(2, Math.min(n, 30) / 12), 0.3, { type: 'sine', vol, send: 0.3 }); } };
    function text(t, x, y, z, col, s = 1) { fx.texts.add(t, x, y, z, col, s); }
    function sparkleAt(x, y, z, col, n = 6) { fx.particles.burst(x, y, z, { count: n, speed: 2.2, up: 1.4, life: 0.5, size: 0.22, colors: [col, 0xffffff], gravity: 5 }); }
    function legalFor(p) { return R.legalMoves(st.pits, p); }
    function nonEmptyNear(p, from, dir) {      // dichtstbijzijnde niet-lege eigen kuiltje (richting dir op het scherm)
      const ord = ORDER[p]; let idx = ord.indexOf(from); if (idx < 0) idx = 0;
      for (let k = 1; k <= 6; k++) { const j = idx + dir * k; if (j < 0 || j > 5) break; if (st.pits[ord[j]] > 0) return ord[j]; }
      return from;
    }
    function fixSel(p) { if (st.pits[sel[p]] > 0 && R.isOwnPit(p, sel[p])) return; const ord = ORDER[p]; let best = -1, bd = 99; const idx0 = ord.indexOf(sel[p]); for (let k = 0; k < 6; k++) if (st.pits[ord[k]] > 0 && Math.abs(k - idx0) < bd) { bd = Math.abs(k - idx0); best = ord[k]; } if (best >= 0) sel[p] = best; }
    const refreshHud = () => {
      const tv = totalsVis();
      hud.setScore(`${names[0]} ${tv[0]} – ${tv[1]} ${names[1]}`);
      for (let i = 0; i < 2; i++) { const mine = phase === 'choose' && st.turn === i; hud.setPlayerInfo(i, `Schat: ${tv[i]} · Dief: ${thiefUsed[i] ? 'gebruikt' : 'klaar!'}${mine ? ' · JIJ BENT!' : ''}`); }
    };
    let hintTxt = '';
    function setHint(t) { if (t !== hintTxt) { hintTxt = t; hud.setHint(t); } }

    // ---------------- beurten ----------------
    function beginTurn(p) {
      turnSeq++; st.turn = p; phase = 'choose'; turnMax = lerp(9, 6, clamp((MATCH_TIME - timeLeft) / MATCH_TIME, 0, 1)); turnT = turnMax; tickN = 99; auto = null; previewKey = '';
      fixSel(p); lastDir[0] = lastDir[1] = 0; holdT[0] = holdT[1] = 0; hand[p].act = false;
      audio.sfx('click', { vol: 0.5, rate: 1.3 });
    }
    function startSow(p, from, auto_) {
      const res = R.applyMove(st.pits, p, from); stats.moves++;
      const n = res.path.length; const list = cont[from].splice(0);
      list.forEach((g, k) => { g.mode = 'hand'; g.ho = p; g.hi = k; g.c = -1; });
      const hp = pitPos(from); hand[p].x = hp.x; hand[p].z = hp.z; hand[p].tx = hp.x; hand[p].tz = hp.z; hand[p].y = TOP_Y + 0.9; hand[p].ty = 2.4; hand[p].act = true;
      const sp = hopSpeed(p) / Math.sqrt(GRAV);
      sow = { p, from, res, path: res.path, n, k: 0, t: 0, hand: list, interval: clamp(2.8 / n, 0.1, 0.27) / sp, T0: 0.4 / Math.sqrt(sp), landed: 0, done: false, wait: 0, dur: 0.3 / sp, sp };
      st.pits = res.pits.slice();      // logische eindstand (incl. vangst); de animatie loopt daarna
      phase = 'sow'; pulse[from] = 1;
      audio.sfx('whoosh', { vol: 0.5, rate: 1.4 }); setHint('');
      chars[p].c.swing();
    }
    function updateSow(dt) {
      sow.t += dt; const S = sow;
      const k = Math.min(S.k, S.n - 1); const tp = pitPos(S.path[k]); hand[S.p].tx = tp.x; hand[S.p].tz = tp.z; hand[S.p].ty = 2.2;
      while (S.k < S.n && S.t >= S.T0 + S.k * S.interval) {
        const c = S.path[S.k]; const g = S.hand.pop(); const slot = reserve(c); const kk = S.k;
        flyTo(g, c, slot, S.dur, 1.0 + (c === 6 || c === 13 ? 0.3 : 0), 0, (gm) => {
          landIn(gm); S.landed++; sfxNote(kk, 0.2); const pp = pitPos(c);
          sparkleAt(gm.x, gm.y + 0.2, gm.z, W.gemColors[gm.g].getHex(), 5); if (c === 6 || c === 13) { audio.sfx('coin', { vol: 0.45, rate: 1 + kk * 0.02 }); fx.particles.ring(pp.x, TOP_Y + 0.2, pp.z, { count: 10, speed: 2.5, life: 0.4, size: 0.2, color: GOLD }); }
        });
        // overgebleven stenen in de hand netjes opnieuw indexeren
        S.hand.forEach((h, j) => { h.hi = j; });
        S.k++;
      }
      if (S.k >= S.n && S.landed >= S.n) { hand[S.p].ty = 3.0; S.wait += dt; if (S.wait > 0.3) { sow = null; afterSow(S); } }
    }
    function afterSow(S) {
      const { res, p } = S; hand[p].act = false;
      if (res.capture) {
        const cp = res.capture; stats.captures[p]++; phase = 'capture';
        const src = [...cont[cp.opp].splice(0), ...cont[cp.pit].splice(0)]; const store = storeOf(p);
        post = { p, n: src.length, landed: 0, wait: 0, then: () => settle(p, res) };
        const pp = pitPos(cp.opp);
        text('VANGST! +' + cp.n, pp.x, 3.0, pp.z, '#ffe14a', 1.5); hud.showBig('VANGST!', 900, '#ffe14a'); ctx.shake(0.35); audio.sfx('good', { vol: 0.8 }); audio.sfx('powerup', { vol: 0.5 });
        fx.particles.burst(pp.x, TOP_Y + 0.6, pp.z, { count: 24, speed: 4, up: 2, life: 0.8, size: 0.35, colors: [0xffe14a, 0xffffff, 0xff8ad0], gravity: 6 });
        src.forEach((g, k) => { flyTo(g, store, reserve(store), 0.55, 2.2, k * 0.1, (gm) => { landIn(gm); post.landed++; sfxNote(k + 1, 0.2, 660); sparkleAt(gm.x, gm.y + 0.2, gm.z, GOLD, 5); }); });
        chars[p].cheerT = 1.6; chars[1 - p].sadT = 1.6;
      } else settle(p, res);
    }
    function settle(p, res) {
      post = null;
      if (R.sideEmpty(st.pits, 0) || R.sideEmpty(st.pits, 1)) { startSweep('leeg'); return; }
      if (res.extra) { stats.extra[p]++; hud.showBig('EXTRA BEURT!', 1000, '#8dff9a'); text('+ BEURT', pitPos(storeOf(p)).x, 3.2, 0, '#8dff9a', 1.3); audio.sfx('bell', { vol: 0.7 }); audio.sfx('powerup', { vol: 0.5 }); chars[p].cheerT = 1.2; beginTurn(p); }
      else beginTurn(1 - p);
    }

    // ---------------- dief (B) ----------------
    function tryThief(p) {
      const opp = R.opposite(sel[p]);
      if (thiefUsed[p]) { audio.sfx('buzz', { vol: 0.4 }); return; }
      if (st.pits[opp] <= 0) { audio.sfx('buzz', { vol: 0.5 }); text('Niks te stelen!', pitPos(opp).x, 3.0, pitPos(opp).z, '#ff9a9a', 1.1); return; }
      thiefUsed[p] = true; stats.thief[p]++; phase = 'thief'; ph = { t: 0, p, opp, sent: false };
      const op = pitPos(opp); gHolder.visible = true; gHolder.position.set(op.x, GROUND_Y + 0.5, op.z); goblin.faceDir(0, p ? -1 : 1); goblin.pose = 'wave';
      audio.sfx('whoosh', { vol: 0.6, rate: 1.6 }); chars[p].cheerT = 1.6; chars[1 - p].scareT = 1.6;
      st.pits[opp]--; st.pits[storeOf(p)]++;
      setHint('');
    }
    function updateThief(dt) {
      ph.t += dt; const op = pitPos(ph.opp);
      gHolder.position.y = lerp(GROUND_Y - 1, TOP_Y - 0.4, smoothstep(0, 0.35, ph.t) * (1 - smoothstep(1.3, 1.7, ph.t)));
      gHolder.position.x = op.x; gHolder.position.z = op.z + (ph.p ? 0.5 : -0.5) * 0 + 0.0;
      goblin.update(dt);
      if (!ph.sent && ph.t > 0.4) {
        ph.sent = true; const g = popTop(ph.opp); const store = storeOf(ph.p);
        text('DIEF!', op.x, 3.4, op.z, '#ff6a6a', 1.5); audio.sfx('powerup', { vol: 0.5, rate: 1.5 }); audio.sfx('pop', { vol: 0.6 });
        fx.particles.burst(op.x, TOP_Y + 0.8, op.z, { count: 14, speed: 3, up: 1.5, life: 0.6, size: 0.3, colors: [0xff6a6a, 0xffffff], gravity: 5 });
        flyTo(g, store, reserve(store), 0.85, 3.2, 0, (gm) => { landIn(gm); sfxNote(3, 0.25, 660); audio.sfx('coin', { vol: 0.5 }); sparkleAt(gm.x, gm.y + 0.2, gm.z, GOLD, 8); text('+1', gm.x, 2.6, gm.z, '#ffe14a', 1.1); ph.landed = true; });
      }
      if (ph.t > 1.9 && ph.landed) { gHolder.visible = false; const p = ph.p; if (R.sideEmpty(st.pits, 0) || R.sideEmpty(st.pits, 1)) startSweep('leeg'); else { beginTurn(p); turnT = Math.max(turnT, 5); } }
    }

    // ---------------- kip ----------------
    function startChicken(force = -1) {
      stats.chickens++; const dirX = force >= 0 ? 1 : rand(0, 1) < 0.5 ? 1 : -1; const t0 = st.pits[6], t1 = st.pits[13];
      const behind = force >= 0 ? force : t0 + 3 <= t1 ? 0 : t1 + 3 <= t0 ? 1 : -1;
      ev = { kind: 'chicken', t: 0, dir: dirX, x: -dirX * 16.5, z: rand(-0.25, 0.25), behind, egg: false, pause: 0, paused: false, done: false };
      chicken.group.visible = true; chicken.group.position.set(ev.x, TOP_Y + 0.05, ev.z); chicken.targetYaw = dirX > 0 ? Math.PI / 2 : -Math.PI / 2; chicken.yaw = chicken.targetYaw;
      audio.sfx('pop', { vol: 0.6, rate: 2.2 }); text(force >= 0 ? 'GELIJK! DE KIP BESLIST' : 'KOEKOEK!', -dirX * 9, 3.5, 2, '#fff1a8', 1.4);
    }
    function updateChicken(dt) {
      const e = ev; e.t += dt;
      if (e.paused) {
        e.pause -= dt; chicken.speed = 0; chicken.group.position.y = TOP_Y + 0.05 + Math.sin(e.pause * 30) * 0.05;
        if (e.pause <= 0.6 && !e.egg) {
          e.egg = true; const g = freeEgg(); if (g) {
            const store = storeOf(e.behind); g.mode = 'fly'; g.x = chicken.group.position.x; g.y = TOP_Y + 0.5; g.z = chicken.group.position.z; g.s = 0.34; g.c = store; stats.eggs++;
            st.pits[store]++; flyTo(g, store, reserve(store), 0.9, 3.4, 0, (gm) => { landIn(gm); audio.sfx('coin', { vol: 0.6 }); audio.sfx('sparkle', { vol: 0.6 }); sparkleAt(gm.x, gm.y + 0.2, gm.z, GOLD, 12); text('GOUDEN EI +1', gm.x, 2.8, gm.z, '#ffe14a', 1.3); });
            audio.sfx('pop', { vol: 0.7, rate: 0.9 }); text('GOUD EI!', chicken.group.position.x, 3.0, chicken.group.position.z, '#ffe14a', 1.2);
          }
        }
        if (e.pause <= 0) e.paused = false;
      } else {
        e.x += e.dir * 6.2 * dt; chicken.group.position.x = e.x; chicken.speed = 1;
        chicken.group.position.y = TOP_Y + 0.05 + Math.abs(Math.sin(e.t * 14)) * 0.35;
        if (!e.pausedOnce && e.behind >= 0 && Math.abs(e.x) < 0.3) { e.pausedOnce = true; e.paused = true; e.pause = 1.3; audio.sfx('pop', { vol: 0.5, rate: 2.6 }); }
        if (Math.abs(e.x) > 17) { chicken.group.visible = false; ev = null; }
      }
      chicken.update(dt);
    }

    // ---------------- draak ----------------
    const dCurve = { pts: [], seg: 0, s: 0, durs: [], iGrab: 0, iDrop: 0 };
    function startDragon() {
      const a = R.finalTotals(st.pits); const lead = a[0] === a[1] ? (Math.random() < 0.5 ? 0 : 1) : a[0] > a[1] ? 0 : 1; const trail = 1 - lead;
      const mx = Math.max(...R.ownPits(lead).map((i) => st.pits[i])); if (mx <= 0) return false;
      const from = pick(R.ownPits(lead).filter((i) => st.pits[i] === mx));
      const mn = Math.min(...R.ownPits(trail).map((i) => st.pits[i])); const to = pick(R.ownPits(trail).filter((i) => st.pits[i] === mn));
      const fp = pitPos(from), tp = pitPos(to); stats.dragons++;
      const side = fp.x < 0 ? 1 : -1;                 // komt vanaf de andere kant
      const zf = lead === 0 ? 1 : -1;
      const MD = 3.0, HY = TOP_Y + 1.6;
      const start = new THREE.Vector3(side * -24, 13, -14);
      const ap1 = new THREE.Vector3(fp.x + side * 3, 7, fp.z + zf * 4 + 2);
      const grab = new THREE.Vector3(fp.x, HY, fp.z).add(new THREE.Vector3(-side * 0, 0, 0)); const gdir = new THREE.Vector3(fp.x - ap1.x, 0, fp.z - ap1.z).normalize(); grab.addScaledVector(gdir, -MD);
      const up = new THREE.Vector3(fp.x + gdir.x * 3, 8, fp.z + gdir.z * 3 - 1);
      const far = new THREE.Vector3((fp.x + tp.x) / 2, 9.5, -7);
      const ap2 = new THREE.Vector3(tp.x - 4, 7.5, tp.z + 4); const ddir = new THREE.Vector3(tp.x - ap2.x, 0, tp.z - ap2.z).normalize();
      const drop = new THREE.Vector3(tp.x, HY + 0.3, tp.z).addScaledVector(ddir, -MD);
      const out = new THREE.Vector3(tp.x + ddir.x * 14, 12, tp.z + ddir.z * 10 - 8);
      const pts = [start, ap1, grab, up, far, ap2, drop, out];
      dCurve.pts = pts; dCurve.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
      dCurve.durs = pts.slice(0, -1).map((p, i) => Math.max(0.5, p.distanceTo(pts[i + 1]) / 12));
      dCurve.iGrab = 2; dCurve.iDrop = 6; dCurve.seg = 0; dCurve.s = 0;
      ev = { kind: 'dragon', t: 0, from, to, lead, trail, g: null, grabbed: false, dropped: false, seg: 0, s: 0 };
      dragon.group.visible = true; dragon.group.position.copy(start); phase = 'event';
      audio.sfx('creak', { vol: 0.3, rate: 1.6 }); hud.showBig('🐉 DRAAK!', 1100, '#d9a8ff'); ctx.shake(0.2); setHint('');
      return true;
    }
    const mouth = new THREE.Vector3(); const prevP = new THREE.Vector3(); const tmpV = new THREE.Vector3();
    function updateDragon(dt) {
      const e = ev; const n = dCurve.pts.length - 1; const d = dCurve.durs[e.seg];
      e.s += dt / d; const ease = (x) => x;
      prevP.copy(dragon.group.position);
      if (e.s >= 1) {
        e.s = 0; e.seg++;
        if (e.seg === dCurve.iGrab && !e.grabbed) { e.grabbed = true; const g = popTop(e.from); if (g) { st.pits[e.from]--; g.mode = 'carried'; g.c = -1; e.g = g; audio.sfx('hit', { vol: 0.6 }); audio.sfx('creak', { vol: 0.3, rate: 2 }); const fp = pitPos(e.from); text('HAP!', fp.x, 3.0, fp.z, '#d9a8ff', 1.4); ctx.shake(0.3); fx.particles.burst(fp.x, TOP_Y + 0.8, fp.z, { count: 10, speed: 2.5, up: 1.4, life: 0.5, size: 0.3, colors: [0xff8a3a, 0xffd23f], gravity: 4 }); } }
        if (e.seg === dCurve.iDrop && !e.dropped) { e.dropped = true; if (e.g) { const g = e.g; e.g = null; const to = e.to; g.x = mouth.x; g.y = mouth.y; g.z = mouth.z; st.pits[to]++; flyTo(g, to, reserve(to), 0.45, 1.0, 0, (gm) => { landIn(gm); audio.sfx('pop', { vol: 0.7 }); sparkleAt(gm.x, gm.y + 0.2, gm.z, 0xd9a8ff, 10); const tp = pitPos(to); text('TERUG!', tp.x, 3.0, tp.z, '#d9a8ff', 1.3); }); } }
        if (e.seg >= n) { dragon.group.visible = false; if (e.g) { st.pits[e.to]++; const g = e.g; e.g = null; flyTo(g, e.to, reserve(e.to), 0.2, 0.5); } ev = null; beginTurn(st.turn); turnT = Math.max(turnT, 6); return; }
      }
      const u = (e.seg + e.s) / n; const pt = dCurve.curve.getPoint(Math.min(u, 0.9999));
      dragon.group.position.copy(pt);
      tmpV.copy(pt).sub(prevP); const hl = Math.hypot(tmpV.x, tmpV.z);
      if (hl > 1e-4) { const yaw = Math.atan2(tmpV.x, tmpV.z); dragon.group.rotation.y = dragon.group.rotation.y + (((yaw - dragon.group.rotation.y + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 8); dragon.group.rotation.x = damp(dragon.group.rotation.x, -Math.atan2(tmpV.y, hl) * 0.7, 6, dt); }
      dragon.update(dt);
      if (e.g) { dragon.group.localToWorld(mouth.set(0, 0.95, 3.4)); e.g.x = mouth.x; e.g.y = mouth.y; e.g.z = mouth.z; }
      else dragon.group.localToWorld(mouth.set(0, 0.95, 3.4));
      if (Math.random() < dt * 10) fx.particles.emit(dragon.group.position.x, dragon.group.position.y, dragon.group.position.z, 0, 0.3, 0, { life: 0.5, size: 0.5, color: 0xb98aff, gravity: -0.5 });
    }

    // ---------------- einde: tellen ----------------
    function startSweep(reason) {
      if (ev && ev.kind === 'chicken') { chicken.group.visible = false; ev = null; }
      phase = 'sweep'; hand[0].act = hand[1].act = false; setHint('');
      const before = [st.pits[6], st.pits[13]]; const moves = [];
      for (const p of [0, 1]) { const store = storeOf(p); for (const i of R.ownPits(p)) { const list = cont[i].splice(0); for (const g of list) moves.push({ g, store, p }); } }
      for (const p of [0, 1]) { const s = R.sideSum(st.pits, p); st.pits[storeOf(p)] += s; for (const i of R.ownPits(p)) st.pits[i] = 0; }
      endInfo = { reason, before, moves: moves.length, landed: 0, wait: 0, tot: R.finalTotals(st.pits), winner: -1, tie: false, egg: false };
      hud.showBig(reason === 'time' ? 'TIJD!' : 'EEN KANT LEEG!', 1200, '#ffd23f'); audio.sfx('bell', { vol: 0.9 });
      if (reason === 'time') text('De rest wordt geteld!', 0, 3.4, 0, '#fff1a8', 1.4);
      moves.forEach((m, k) => flyTo(m.g, m.store, reserve(m.store), 0.5, 2.0, 0.5 + k * 0.07, (gm) => { landIn(gm); endInfo.landed++; sfxNote(k, 0.14, 660); sparkleAt(gm.x, gm.y + 0.2, gm.z, GOLD, 3); }));
      if (!moves.length) endInfo.wait = 0.3;
    }
    function decideWinner() {
      const E = endInfo; const a = st.pits[6], b = st.pits[13];
      if (a !== b) E.winner = a > b ? 0 : 1;
      else {   // gelijk: de kip beslist (wie voor het tellen de meeste in de schatkamer had, anders de meeste vangsten, anders toeval)
        E.tie = true;
        if (E.before[0] !== E.before[1]) E.winner = E.before[0] > E.before[1] ? 0 : 1;
        else if (stats.captures[0] !== stats.captures[1]) E.winner = stats.captures[0] > stats.captures[1] ? 0 : 1;
        else E.winner = Math.random() < 0.5 ? 0 : 1;
      }
      return E.winner;
    }
    function updateSweep(dt) {
      const E = endInfo;
      if (E.landed >= E.moves) { E.wait += dt; if (E.wait > 0.5 && E.winner < 0) {
        const w = decideWinner();
        if (E.tie) startChicken(w);        // de kip beslist: een gouden ei in de schatkamer van de winnaar
        phase = 'end'; ph = { t: 0 };
        hud.showBig(`${names[w]} WINT!`, 1800, w ? '#7fb2ff' : '#7dffa8'); audio.sfx('win', { vol: 0.8 }); ctx.shake(0.3);
        refreshHud();
      } }
    }
    function updateEnd(dt) {
      ph.t += dt;
      if (ph.t > (endInfo.tie ? 5.4 : 2.4) && !finished) finishMatch();
    }
    function finishMatch() {
      finished = true; const E = endInfo; const w = E.winner; const a = st.pits[6], b = st.pits[13];
      const lines = [`${names[w]} heeft de meeste edelstenen!`, `${names[w]} is de Kalaha-koning van de kermis!`, `Wat een schatten! ${names[w]} wint met ${[a, b][w]} stenen.`];
      const extra = [];
      if (E.reason === 'time') extra.push('De tijd was om, de rest van de stenen is geteld.');
      if (stats.captures[0] + stats.captures[1]) extra.push(`Vangsten: ${names[0]} ${stats.captures[0]}, ${names[1]} ${stats.captures[1]}.`);
      if (stats.eggs) extra.push(`De kip legde ${stats.eggs} gouden ${stats.eggs > 1 ? 'eieren' : 'ei'}.`);
      if (stats.dragons) extra.push(`De draak roofde ${stats.dragons} ${stats.dragons > 1 ? 'stenen' : 'steen'}.`);
      if (E.tie) extra.push('Precies gelijk, dus de kip besliste met een gouden ei.');
      ctx.finishPvp({ winner: w, score: [a, b], delay: 300, summary: `${pick(lines)} ${extra.join(' ')}` });
      hud.setTimer(null);
    }

    // ---------------- invoer (choose) ----------------
    function updateChoose(dt) {
      const p = st.turn; const inp = pv.input(p);
      // gimmicks: kip en draak (alleen tijdens het kiezen)
      if (!ev) { evT -= dt; if (evT <= 0 && timeLeft > 12) { evT = rand(11, 15); evKind ^= 1; if (evKind === 0) startChicken(); else if (!startDragon()) startChicken(); } }
      if (phase !== 'choose') return;
      if (auto) { auto.t -= dt; if (auto.t <= 0) { const a = auto; auto = null; startSow(p, a.pit); } return; }
      fixSel(p);
      // cursor met links/rechts (x-as, zodat twists als 'dronken' werken), met herhaling
      const dir = inp.x > 0.5 ? 1 : inp.x < -0.5 ? -1 : 0;
      if (dir !== 0 && dir !== lastDir[p]) { holdT[p] = 0.32; const n = nonEmptyNear(p, sel[p], dir); if (n !== sel[p]) { sel[p] = n; audio.sfx('tick', { vol: 0.8, rate: 1.4 }); } }
      else if (dir !== 0) { holdT[p] -= dt; if (holdT[p] <= 0) { holdT[p] = 0.13; const n = nonEmptyNear(p, sel[p], dir); if (n !== sel[p]) { sel[p] = n; audio.sfx('tick', { vol: 0.8, rate: 1.4 }); } } }
      lastDir[p] = dir;
      if (inp.aP) { startSow(p, sel[p]); return; }
      if (inp.bP) { tryThief(p); if (phase !== 'choose') return; }
      // timer
      turnT -= dt;
      const tl = Math.ceil(turnT); if (turnT < 3 && tl !== tickN && tl > 0) { tickN = tl; audio.sfx('tick', { vol: 1, rate: 1.0 + (3 - tl) * 0.15 }); }
      if (turnT <= 0) { stats.timeouts++; const mv = legalFor(p); const pit = pick(mv); sel[p] = pit; auto = { t: 0.55, pit }; audio.sfx('buzz', { vol: 0.6 }); text('TE LAAT!', pitPos(pit).x, 3.2, pitPos(pit).z, '#ff9a6a', 1.3); chars[p].sadT = 1.4; }
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      T += dt;
      if (!startedPlay) { startedPlay = true; beginTurn(0); refreshHud(); }
      timeLeft = Math.max(0, timeLeft - dt);
      hud.setTimer(phase === 'end' ? null : timeLeft, 12);
      // Deurman-straffen: een steen uit je schatkamer verdwijnt
      if (phase === 'choose' && !auto && (pend[0] || pend[1])) { for (const i of [0, 1]) if (pend[i]) { pend[i]--; const s = storeOf(i); const g = popTop(s); if (g) { st.pits[s]--; g.mode = 'poof'; g.c = -1; g.t = 0; text('DEURMAN PAKT 1 STEEN!', pitPos(s).x, 3.4, 0, '#ff6a6a', 1.2); audio.sfx('static', { vol: 0.5 }); } } }
      if (phase === 'choose') {
        if (timeLeft <= 0 && !auto && !ev) startSweep('time');
        else updateChoose(dt);
      }
      if (phase === 'sow') updateSow(dt);
      else if (phase === 'capture') { if (post) { if (post.landed >= post.n) { post.wait += dt; if (post.wait > 0.35) { const f = post.then; post = null; f(); } } } }
      else if (phase === 'thief') updateThief(dt);
      else if (phase === 'event') { if (ev && ev.kind === 'dragon') updateDragon(dt); }
      else if (phase === 'sweep') updateSweep(dt);
      else if (phase === 'end') updateEnd(dt);
      if (ev && ev.kind === 'chicken') { updateChicken(dt); if (!ev && phase === 'end') { /* kip klaar */ } }
      visuals(dt);
    }
    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(), camPos = new THREE.Vector3(); let camX = 0, camDist = 22;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = clamp(15.4 / (tanH * asp), 21, 42);
      const hx = phase === 'sow' && sow ? hand[sow.p].x * 0.12 : 0; camX = damp(camX, hx, 2.5, dt);
      camDist = damp(camDist, d, 3, dt);
      const sway = Math.sin((T + introT) * 0.25) * 0.5;
      camLook.set(camX * 0.5, 0.3, -2.2); camPos.set(camX + sway, 0.3 + camDist * 0.8, -2.2 + camDist * 0.6);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }
    const seatY = (o, standing) => (standing ? o.y0 + 0.5 : o.y0 - 0.15);
    function visuals(dt) {
      const tt = T + introT; W.update(tt, dt);
      updateGems(dt);
      if (Math.random() < dt * 5) { const g = gems[Math.floor(Math.random() * NG)]; if (g.mode === 'rest') fx.particles.emit(g.x, g.y + 0.2, g.z, 0, 0.6, 0, { life: 0.5, size: 0.2, color: 0xffffff, gravity: -0.5 }); }
      // tellers
      for (let i = 0; i < 14; i++) { W.setCount(i, cont[i].length); pulse[i] = Math.max(0, pulse[i] - dt * 3); const sc = (i === 6 || i === 13 ? 1.25 : 0.88) * (1 + pulse[i] * 0.35); W.counts[i].sp.scale.set(sc, sc, 1); }
      // handen
      for (let p = 0; p < 2; p++) {
        const h = hand[p]; const gl = W.gloves[p];
        if (phase === 'choose' && st.turn === p && !h.act) { const pp = pitPos(sel[p]); h.tx = pp.x; h.tz = pp.z; h.ty = 2.5 + Math.sin(tt * 4 + p) * 0.12; h.x = damp(h.x, h.tx, 14, dt); h.z = damp(h.z, h.tz, 14, dt); h.y = damp(h.y, h.ty, 10, dt); gl.visible = true; }
        else if (h.act) { h.x = damp(h.x, h.tx, 16, dt); h.z = damp(h.z, h.tz, 16, dt); h.y = damp(h.y, h.ty + (sow && sow.p === p ? Math.abs(Math.sin((sow.t * 8))) * 0.0 : 0), 10, dt); gl.visible = true; }
        else gl.visible = false;
        gl.scale.setScalar(1.45); gl.position.set(h.x, h.y + 1.1, h.z); gl.rotation.y = p ? 0.3 : -0.3; gl.rotation.z = Math.sin(tt * 5) * 0.04;
        // cursor
        const cu = W.cursor[p]; const active = phase === 'choose' && st.turn === p;
        cu.visible = active; if (active) { const pp = pitPos(sel[p]); cu.position.set(pp.x, 0, pp.z); cu.userData.ring.scale.setScalar(1 + Math.sin(tt * 7) * 0.04 + (auto ? 0.15 : 0)); cu.userData.arrow.position.y = TOP_Y + 2.2 + Math.sin(tt * 6) * 0.15; cu.userData.arrow.rotation.y = tt * 2; }
        // timerbalk
        const bar = W.bars[p]; bar.visible = active && !auto; if (active) { const f = clamp(turnT / turnMax, 0, 1); bar.scale.x = Math.max(0.01, 11 * f); bar.position.x = (p ? 1 : -1) * 0 + (p ? 1 : -1) * (11 - 11 * f) * 0.5 * 0; bar.material.color.setHex(f < 0.3 ? (Math.sin(tt * 18) > 0 ? 0xff4a4a : 0xffd23f) : p ? 0x4a8cff : 0x35e27a); }
      }
      // voorvertoning: waar landt de laatste steen?
      const active = phase === 'choose' && !auto; W.landRing.visible = active; W.thiefRing.visible = false;
      if (active) {
        const p = st.turn; const key = p + '|' + sel[p] + '|' + st.pits.join(',');
        if (key !== previewKey) { previewKey = key; preview = R.applyMove(st.pits, p, sel[p]); }
        const lp = pitPos(preview.last); W.landRing.position.set(lp.x, TOP_Y + 0.45 + Math.sin(tt * 6) * 0.1, lp.z);
        W.landRing.material.color.setHex(preview.extra ? 0x58ff8a : preview.capture ? 0xffe14a : 0xffffff); W.landRing.material.opacity = preview.extra || preview.capture ? 0.95 : 0.55; W.landRing.scale.setScalar(preview.last === 6 || preview.last === 13 ? 1.9 : 1.2 + Math.sin(tt * 6) * 0.08);
        if (!thiefUsed[p] && st.pits[R.opposite(sel[p])] > 0) { const op = pitPos(R.opposite(sel[p])); W.thiefRing.visible = true; W.thiefRing.position.set(op.x, TOP_Y + 0.06, op.z); W.thiefRing.material.opacity = 0.35 + Math.sin(tt * 5) * 0.15; }
        const txt = preview.extra ? 'landt in je schatkamer: NOG EEN BEURT!' : preview.capture ? `vangt ${preview.capture.n} stenen!` : `${preview.path.length} stenen`;
        setHint(`<b>${names[p]}</b> kiest · ${txt}${thiefUsed[p] ? '' : ' · B = dief!'}`);
      }
      // poppetjes
      for (const o of chars) {
        const i = o.i; const c = o.c; const myTurn = phase === 'choose' && st.turn === i; const sowing = (phase === 'sow' && sow && sow.p === i) || (phase === 'thief' && ph.p === i);
        o.cheerT = Math.max(0, o.cheerT - dt); o.sadT = Math.max(0, o.sadT - dt); o.scareT = Math.max(0, o.scareT - dt);
        let pose = 'sit', stand = false;
        if (o.cheerT > 0) { pose = 'cheer'; stand = true; } else if (o.scareT > 0) pose = 'scared'; else if (o.sadT > 0) pose = 'sad';
        else if (myTurn && turnT < 2.5 && !auto) pose = 'scared';
        c.pose = pose; c.speed = 0;
        o.holder.position.y = damp(o.holder.position.y, seatY(o, stand), 10, dt);
        const tgt = phase === 'thief' && ph.p === i ? pitPos(ph.opp) : (sowing || myTurn) ? hand[i] : { x: 0, z: 0 };
        c.faceDir(tgt.x - o.holder.position.x, tgt.z - o.holder.position.z);
        c.update(dt);
        // na de update: armen en hoofd aanpassen (zitpose met wijzen of wachten met suikerspin)
        if (pose === 'sit') {
          if (myTurn || sowing) { c.armR.rotation.x = -1.6 + Math.sin(tt * 3) * 0.1; c.armR.rotation.z = -0.15; c.head.rotation.x = 0.15; c.head.rotation.z = Math.sin(tt * 1.3) * 0.08; c.armL.rotation.x = -0.4; }
          else { const sw = Math.max(0, Math.sin(tt * 1.1 + i * 2)); c.armL.rotation.x = -0.5 - sw * 1.7; c.head.rotation.z = Math.sin(tt * 0.9 + i) * 0.14; c.head.rotation.x = 0.1; c.legL.rotation.x = -1.4 + Math.sin(tt * 4 + i) * 0.12; }
        }
      }
      refreshHud();
      updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; if (ev && ev.kind === 'chicken') updateChicken(dt); visuals(dt); }
    function introUpdate(dt) { introT += dt; visuals(dt); }
    refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const o of chars) fx.particles.burst(o.holder.position.x, 1, o.holder.position.z, { count: 16, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m) { pend[i]++; stats.deurman++; chars[i].sadT = 1.4; } }); },
      celebrate(w) { chars[w].cheerT = 99; chars[1 - w].sadT = 99; },
      dispose() {},
      dbg: {
        state: () => ({ T, turnSeq, phase, turn: st.turn, pits: st.pits.slice(), vis: cont.map((a) => a.length), sel: sel.slice(), timeLeft, turnT, thiefUsed: thiefUsed.slice(), finished, stats, ev: ev ? ev.kind : null, auto: !!auto, endInfo: endInfo ? { winner: endInfo.winner, reason: endInfo.reason, tie: endInfo.tie } : null, gemsRest: gems.filter((g) => g.mode === 'rest').length, gemsHidden: gems.filter((g) => g.mode === 'hidden').length }),
        setTime: (t) => { timeLeft = t; },
        check: () => { if (gems.some((g) => g.mode === 'fly' || g.mode === 'carried' || g.mode === 'hand' || g.mode === 'poof')) return []; const bad = []; for (let i = 0; i < 14; i++) if (cont[i].length !== st.pits[i]) bad.push(`${i}:${cont[i].length}/${st.pits[i]}`); return bad; },
        startChicken: () => startChicken(), startDragon: () => startDragon(),
        setPits: (arr) => { /* alleen voor tests in choose-fase: herplaatst alle gems */ st.pits = arr.slice(); const all = gems.filter((g) => !g.gold); for (const c of cont) c.length = 0; let gi = 0; for (let i = 0; i < 14; i++) for (let k = 0; k < arr[i]; k++) { const g = gems[gi++]; g.mode = 'rest'; g.c = i; g.slot = k; cont[i].push(g); } for (; gi < NG; gi++) { gems[gi].mode = 'hidden'; gems[gi].c = -1; } },
        evT: (t) => { evT = t; }, setEvKind: (k) => { evKind = k; },
        gems, cont,
      },
    };
  },
};

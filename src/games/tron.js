import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, dampAngle, rand, pick, TAU, mulberry32, smoothstep, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { T as TW, cellX, cellZ, setI, buildWorld, itemTexture, NEON, NEON_CSS } from './tron_world.js';

// Lichtspoor-Duel — duel: twee lichtbordjes laten een muur van licht achter zich. Botsen = af. Beste van 3 rondes.
//  * richtingen = sturen (90 graden bochten, vloeiend in beeld), A = turbo (laadt op door vlak langs muren te scheren: "grazen"), B = sprong (gat in je spoor, je vliegt over sporen heen)
//  * power-ups (in gespiegelde paren): wisser (veegt sporen weg), dubbel gat (extra lange sprong), turbo-vol
//  * lava-muren komen steeds dichterbij; de draak brandt af en toe een baan door de arena en veegt daarbij alle sporen weg
//  * comeback: wie achterstaat begint de ronde met volle turbo en een dubbele sprong. Gelijkspel? De draak kiest.
const { W, H } = TW;
const N = W * H;
const idx = (c, r) => r * W + c;
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];             // 0 = +x (rechts), 1 = +z (omlaag), 2 = -x, 3 = -z
const START = [[6, 15, 0], [W - 7, H - 16, 2]];            // gespiegeld: (c,r) -> (39-c, 29-r)
const BASE_CPS = 8.5, BOOST = 1.7, JUMP_LEN = 5, JUMP_CD = 3.2, METER_DRAIN = 0.45;
const SHRINK_START = 17, SHRINK_START_FINAL = 11, SHRINK_V = 0.85, MIN_W = 14, MIN_H = 8, ROUND_CAP = 55;
const NEED_WINS = 2, MAX_ROUNDS = 3;
const ITEM_TYPES = ['eraser', 'gap', 'charge'];
const ITEM_NAME = { eraser: 'WISSER!', gap: 'DUBBEL GAT!', charge: 'TURBO-VOL!' };
const ITEM_COL = { eraser: '#ff7ad8', gap: '#ffe14a', charge: '#4af0ff' };
const GRAZE_TXT = ['NIPT!', 'SCHRAMP!', 'KNAP!', 'ZZZIP!'];
const mirC = (c) => W - 1 - c, mirR = (r) => H - 1 - r;

export default {
  id: 'tron',
  name: 'Lichtspoor-Duel',
  giver: 'Neon-Nico',
  icon: '🏍️',
  mode: 'pvp',
  time: 80,
  music: 'game_fast',
  blurb: 'Twee <b>lichtbordjes</b> laten een muur van licht achter zich. Botsen = af! Pak <b>turbo</b> door vlak langs muren te scheren en <b>spring</b> over sporen heen. Beste van <b>3 rondes</b>. De lava-muren komen dichterbij en de <b>draak</b> brandt banen vrij!',
  controls: ['{move} sturen (omhoog, omlaag, links, rechts)', '{a} turbo (ingedrukt houden)', '{b} sprong over sporen'],
  tip: 'Scheer vlak langs een muur of spoor: dat laadt je turbo op. Spring over het spoor van je broer en laat hem crashen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? ctx.twist.speed : 1;
    const SLIP_STEPS = Math.round(SLIP * 2.4);                 // zeepvloer: bochten komen te laat
    const JLEN = Math.round(JUMP_LEN / Math.sqrt(Math.max(0.3, GRAV)));
    const rng = mulberry32((Date.now() ^ 0x7e0) >>> 0);
    const rnd = () => rng();

    const L = ctx.lights('night', { shadow: 24, center: [0, 0, 0], fogNear: 70, fogFar: 190 });
    camera.fov = 44; camera.updateProjectionMatrix();
    const Wd = buildWorld(ctx, L);

    // ---------------- toestand ----------------
    const occ = new Uint8Array(N);                 // 0 vrij, 2 obstakel, 3 spoor Wes, 4 spoor Jor, 5 vuur
    const tA = new Int16Array(N).fill(-1), tB = new Int16Array(N).fill(-1);
    const obstIds = [];
    const G = { state: 'init', t: 0, roundT: 0, round: 0, ending: false, slow: 1, slowT: 0, wins: [0, 0], winner: null, final: false, sx: 0, sz: 0, hintOn: false, shrinkOn: false, camPunch: 0, lastW: null };
    const stats = { grazes: 0, jumps: 0, items: 0, erased: 0, crashes: 0, dragons: 0, burned: 0, boostT: 0 };
    let T = 0, introT = 0, finished = false, started = false, baseSeed = (rnd() * 1e6) | 0;
    const free = [[], []]; const nextId = [0, 0]; let dirty = false;

    // ---------------- lichtbordjes ----------------
    const tagTex = (pp) => canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(8,2,20,.9)'; c.lineJoin = 'round'; c.strokeText(pp.name, w / 2, hh / 2); c.fillStyle = pp.css; c.fillText(pp.name, w / 2, hh / 2); });
    const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const bikes = players.map((pp, i) => {
      const col = NEON[i]; const grp = new THREE.Group(); scene.add(grp); const sz = pv.size(i); const bs = 1.45 * lerp(1, sz, 0.75); grp.scale.setScalar(bs);
      const dark = new THREE.MeshStandardMaterial({ color: 0x5a4c9a, metalness: 0.5, roughness: 0.35 }), glow = new THREE.MeshBasicMaterial({ color: col });
      grp.add(mesh(new THREE.BoxGeometry(0.78, 0.16, 1.7), dark, { pos: [0, 0.3, 0] }));
      grp.add(mesh(new THREE.ConeGeometry(0.46, 0.8, 4), dark, { pos: [0, 0.3, 1.2], rot: [Math.PI / 2, Math.PI / 4, 0], scale: [1, 1, 0.45] }));
      for (const sx of [-1, 1]) grp.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 1.9), glow, { cast: false, pos: [sx * 0.4, 0.3, 0.05] }));
      grp.add(mesh(new THREE.BoxGeometry(0.5, 0.34, 0.5), dark, { pos: [0, 0.5, -0.65] }));
      const under = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); under.rotation.x = -Math.PI / 2; under.position.y = 0.06; grp.add(under);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); head.scale.set(2.2, 2.2, 1); head.position.set(0, 0.5, 1.7); grp.add(head);
      const thr = mesh(new THREE.ConeGeometry(0.2, 0.9, 6), new THREE.MeshBasicMaterial({ color: col }), { cast: false, pos: [0, 0.4, -1.2], rot: [-Math.PI / 2, 0, 0] }); grp.add(thr);
      const c = makeBrother(i); const ks = 1.25 / c.height * sz; c.group.scale.setScalar(ks); c.group.position.set(0, 0.36, -0.2); grp.add(c.group); c.pose = 'carry'; c.faceDir(0, 1); c.yaw = 0;
      const shadow = P.shadowBlob(1.2); scene.add(shadow);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(pp), transparent: true, depthTest: false })); tag.scale.set(2.6, 0.97, 1); tag.renderOrder = 15; scene.add(tag);
      // meters boven het bordje: turbo (cyaan) en sprong (geel)
      const mk = (color) => { const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.2), new THREE.MeshBasicMaterial({ color: 0x080414, transparent: true, opacity: 0.7, depthTest: false })); const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.2), new THREE.MeshBasicMaterial({ color, depthTest: false })); bg.renderOrder = 16; fl.renderOrder = 17; scene.add(bg, fl); return { bg, fl }; };
      return { i, grp, c, ks, bs, sz, shadow, tag, under, thr, head, mTurbo: mk(0x4af0ff), mJump: mk(0xffe14a), col,
        alive: true, c0: 0, r0: 0, pc: 0, pr: 0, dir: 0, lastDir: 0, acc: 0, q: [], prevAct: [false, false, false, false], meter: 0.25, jumpLeft: 0, jumpTotal: 0, jumpCd: 0, dbl: false, boosting: false, grazeT: 0, yaw: 0, lean: 0, y: 0, rider: { on: true, vx: 0, vy: 0, vz: 0, spin: 0, deadT: 0 }, trail: 0, lastTxt: '' };
    });
    // eerste c/r zijn "huidige cel"
    const bs = bikes;

    // ---------------- items ----------------
    const itemTex = {}; for (const t of ITEM_TYPES) itemTex[t] = itemTexture(t);
    const items = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTex.eraser, transparent: true, depthWrite: false })); s.scale.set(1.6, 1.6, 1); s.visible = false; scene.add(s); const sh = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; sh.visible = false; scene.add(sh); return { on: false, s, sh, c: 0, r: 0, type: '', t: 0, life: 0 }; });
    let itemT = 4;

    // ---------------- draak ----------------
    const dragon = new Dragon(0xff3aa0, 0.85); dragon.group.visible = false; scene.add(dragon.group);
    const D = { state: 'idle', t: 8, axis: 0, k0: 0, dir: 1, ft: 0, burned: 0 };
    const fireList = [];                                              // {cell, t}
    const dragonPick = new Dragon(0xff3aa0, 1.4); dragonPick.group.visible = false; scene.add(dragonPick.group);

    // ---------------- hulp ----------------
    const blockedShrink = (c, r) => { const x = cellX(c), z = cellZ(r); return x < -W / 2 + G.sx || x > W / 2 - G.sx || z < -H / 2 + G.sz || z > H / 2 - G.sz; };
    const solid = (c, r) => c < 0 || r < 0 || c >= W || r >= H || blockedShrink(c, r);
    function allocId(i) { return free[i].length ? free[i].pop() : (nextId[i] < TW.CAP ? nextId[i]++ : -1); }
    function trailSeg(i, id, c, r, axis) {
      if (id < 0) return; const t = Wd.trail[i], x = cellX(c), z = cellZ(r), ry = axis === 0 ? 0 : Math.PI / 2;
      setI(t.wall, id, x, 0.4, z, 1, 1, 1, ry); setI(t.top, id, x, 0.84, z, 1, 1, 1, ry); setI(t.glow, id, x, 0.03, z, 1, 1, 1, ry, true); dirty = true;
    }
    function layTrail(b, c, r, inAxis, outAxis) {
      const cell = idx(c, r); if (occ[cell] === 2) return;
      const a = allocId(b.i); trailSeg(b.i, a, c, r, inAxis); tA[cell] = a; tB[cell] = -1;
      if (outAxis !== inAxis) { const b2 = allocId(b.i); trailSeg(b.i, b2, c, r, outAxis); tB[cell] = b2; }
      occ[cell] = 3 + b.i; b.trail++;
    }
    function eraseCell(cell) {
      const o = occ[cell] - 3; if (o !== 0 && o !== 1) return false; const t = Wd.trail[o];
      for (const arr of [tA, tB]) { const id = arr[cell]; if (id >= 0) { setI(t.wall, id, 0, -50, 0, 0); setI(t.top, id, 0, -50, 0, 0); setI(t.glow, id, 0, -50, 0, 0); free[o].push(id); arr[cell] = -1; } }
      occ[cell] = 0; dirty = true; return true;
    }
    function clearTrails() { for (let i = 0; i < N; i++) if (occ[i] === 3 || occ[i] === 4) eraseCell(i); }

    // ---------------- ronde ----------------
    function genObstacles(seed) {
      const lr = mulberry32(seed); for (let i = 0; i < N; i++) if (occ[i] === 2 || occ[i] === 5) occ[i] = 0;
      const rects = [];
      const okCell = (c, r) => c >= 2 && c <= W - 3 && r >= 2 && r <= H - 3 && !((c <= 11 || c >= W - 12) && Math.abs(r - 14.5) <= 3.5);
      let tries = 0;
      while (rects.length < 7 && tries++ < 300) {
        const w = 1 + ((lr() * 3) | 0), h = 1 + ((lr() * (w === 1 ? 4 : 3)) | 0), c0 = 3 + ((lr() * (W - 6 - w)) | 0), r0 = 3 + ((lr() * (H - 6 - h)) | 0);
        let ok = true; const cells = [], mir = [];
        for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w; dc++) { const c = c0 + dc, r = r0 + dr; if (!okCell(c, r) || !okCell(mirC(c), mirR(r))) { ok = false; break; } cells.push([c, r]); mir.push([mirC(c), mirR(r)]); }
        if (!ok) continue;
        // geen overlap (met 1 cel ruimte) met eerdere stukken en zichzelf
        const all = [...cells, ...mir]; const key = (c, r) => c + ',' + r; const mine = new Set(all.map(([c, r]) => key(c, r)));
        if (mine.size !== all.length) continue;
        let clash = false; for (const [c, r] of all) for (let dc = -1; dc <= 1 && !clash; dc++) for (let dr = -1; dr <= 1; dr++) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < W && rr < H && occ[idx(cc, rr)] === 2) { clash = true; break; } }
        if (clash) continue;
        for (const [c, r] of all) occ[idx(c, r)] = 2; rects.push(all);
      }
      // instanties
      let k = 0; for (let i = 0; i < N; i++) if (occ[i] === 2 && k < 480) { const c = i % W, r = (i / W) | 0; setI(Wd.obst, k, cellX(c), 0.75, cellZ(r)); setI(Wd.obstTop, k, cellX(c), 1.52, cellZ(r)); k++; }
      for (; k < 480; k++) { setI(Wd.obst, k, 0, -50, 0, 0); setI(Wd.obstTop, k, 0, -50, 0, 0); }
      Wd.obst.instanceMatrix.needsUpdate = true; Wd.obstTop.instanceMatrix.needsUpdate = true;
    }
    function resetBike(b) {
      const [c, r, d] = START[b.i]; b.c0 = c; b.r0 = r; b.pc = c; b.pr = r; b.dir = d; b.lastDir = d; b.acc = 0; b.q.length = 0; b.prevAct = [false, false, false, false]; b.alive = true; b.meter = 0.25; b.jumpLeft = 0; b.jumpCd = 1.0; b.dbl = false; b.boosting = false; b.grazeT = 0; b.trail = 0;
      b.yaw = Math.atan2(DX[d], DZ[d]); b.lean = 0; b.y = 0; b.grp.visible = true; b.grp.add(b.c.group); b.c.group.position.set(0, 0.36, -0.2); b.c.group.rotation.set(0, 0, 0); b.c.group.scale.setScalar(b.ks); b.c.pose = 'carry'; b.c.faceDir(0, 1); b.c.yaw = 0; b.rider.on = true; b.rider.deadT = 0; b.tag.visible = true;
      if (G.round > 1 && G.wins[b.i] < G.wins[1 - b.i]) { b.meter = 1; b.dbl = true; fx.texts.add('TROOSTPRIJS!', cellX(c), 3, cellZ(r), '#4af0ff', 1.4); }
    }
    function startRound(n) {
      G.round = n; G.roundT = 0; G.ending = false; G.slow = 1; G.slowT = 0; G.final = n >= MAX_ROUNDS; G.state = n === 1 ? 'play' : 'intro'; G.t = 0; G.sx = 0; G.sz = 0; G.shrinkOn = false; G.hintOn = false;
      clearTrails(); for (const i of [0, 1]) { free[i].length = 0; nextId[i] = 0; }
      for (const t of Wd.trail) for (const m of [t.wall, t.top, t.glow]) { for (let k = 0; k < TW.CAP; k++) setI(m, k, 0, -50, 0, 0); m.instanceMatrix.needsUpdate = true; }
      tA.fill(-1); tB.fill(-1); for (let i = 0; i < N; i++) if (occ[i] !== 2) occ[i] = 0;
      fireList.length = 0; genObstacles(baseSeed + n * 6151);
      bikes.forEach(resetBike);
      for (const it of items) { it.on = false; it.s.visible = false; it.sh.visible = false; }
      itemT = rand(3, 5); D.state = 'idle'; D.t = rand(8, 11); dragon.group.visible = false; Wd.lane.visible = false;
      Wd.setBounds(-W / 2, W / 2, -H / 2, H / 2);
      refreshHud();
      if (n > 1) { hud.showBig(G.final ? 'LAATSTE RONDE!' : `RONDE ${n}!`, 1300, '#ffe14a'); audio.sfx('bell', { vol: 0.5 }); }
    }
    function refreshHud() { hud.setScore(`${names[0]} ${G.wins[0]} – ${G.wins[1]} ${names[1]}   (ronde ${G.round}/${MAX_ROUNDS})`); }
    const infoText = (b) => { const m = Math.round(b.meter * 5); return `⚡${'▮'.repeat(m)}${'▯'.repeat(5 - m)}  🦘${b.jumpCd > 0 && b.jumpLeft === 0 ? b.jumpCd.toFixed(1) + 's' : b.jumpLeft > 0 ? '...' : (b.dbl ? 'x2!' : 'klaar')}  ·  ${G.wins[b.i]} gewonnen`; };

    // ---------------- invoer -> bochten ----------------
    function readInput(b, dt, canAct) {
      const inp = pv.input(b.i);
      const act = [inp.x > 0.55, inp.y > 0.55, inp.x < -0.55, inp.y < -0.55];
      if (canAct && b.alive) {
        for (let d = 0; d < 4; d++) if (act[d] && !b.prevAct[d]) {
          const ref = b.q.length ? b.q[b.q.length - 1].dir : b.dir;
          if (d !== ref && d !== (ref + 2) % 4) { b.q.push({ dir: d, wait: SLIP_STEPS }); if (b.q.length > 2) b.q.shift(); }
        }
        b.boosting = inp.a && b.meter > 0.02;
        if (b.boosting) { b.meter = Math.max(0, b.meter - METER_DRAIN * dt); stats.boostT += dt; } else b.meter = Math.min(1, b.meter + 0.03 * dt);
        b.jumpCd = Math.max(0, b.jumpCd - dt); b.grazeT = Math.max(0, b.grazeT - dt);
        if (inp.bP && b.jumpCd <= 0 && b.jumpLeft === 0) {
          const len = b.dbl ? JLEN * 2 : JLEN; b.jumpLeft = len; b.jumpTotal = len; b.jumpCd = b.dbl ? 0.8 : JUMP_CD; if (b.dbl) { fx.texts.add('MEGA-SPRONG!', cellX(b.c0), 3, cellZ(b.r0), '#ffe14a', 1.2); b.dbl = false; }
          stats.jumps++; audio.sfx('jump', { vol: 0.5 }); audio.sfx('whoosh', { vol: 0.25 }); b.c.jump(); fx.particles.burst(cellX(b.c0), 0.3, cellZ(b.r0), { count: 12, speed: 3, up: 1.2, life: 0.5, size: 0.35, colors: [b.col, 0xffffff], gravity: 6 });
        }
      } else b.boosting = false;
      for (let d = 0; d < 4; d++) b.prevAct[d] = act[d];
    }

    // ---------------- stappen ----------------
    // Plan een stap voor een bordje (draaien indien nodig); retourneert doelcel + vlucht-info
    function planStep(b) {
      const q = b.q[0];
      if (q) { if (q.wait > 0) q.wait--; else { b.q.shift(); b.dir = q.dir; } }
      const wasAir = b.jumpLeft > 0; let landing = false, flying = false;
      if (wasAir) { b.jumpLeft--; landing = b.jumpLeft === 0; flying = !landing; }
      return { b, nc: b.c0 + DX[b.dir], nr: b.r0 + DZ[b.dir], wasAir, flying, landing };
    }
    function hitWhat(m) {                      // wat zit er op de doelcel? 0 = niets
      const { nc, nr, flying, b } = m;
      if (solid(nc, nr)) return 'muur';
      const o = occ[idx(nc, nr)];
      if (o === 2) return 'blok'; if (o === 5) return 'vuur';
      if ((o === 3 || o === 4) && !flying) return o === 3 + b.i ? 'eigen' : 'spoor';
      return 0;
    }
    function stepAll(dt) {
      for (const b of bikes) if (b.alive) b.acc += BASE_CPS * (1 + (pv.speed(b.i) - 1) * 0.6) * (b.boosting ? BOOST : 1) * dt;
      let guard = 0;
      while (!G.ending && guard++ < 6 && bikes.some((b) => b.alive && b.acc >= 1)) {
        const moves = []; for (const b of bikes) if (b.alive && b.acc >= 1) { b.acc -= 1; moves.push(planStep(b)); }
        const crashed = [];
        for (const m of moves) {
          const why = hitWhat(m);
          let hit = why;
          const o = bikes[1 - m.b.i];
          if (!hit && o.alive && !m.flying) {
            const om = moves.find((x) => x.b === o);
            if (om && om.nc === m.nc && om.nr === m.nr && !om.flying) hit = 'kop';                      // beide op dezelfde cel
            else if (!om && o.c0 === m.nc && o.r0 === m.nr) hit = 'kop';                                 // recht in de ander
            else if (om && om.nc === m.b.c0 && om.nr === m.b.r0 && o.c0 === m.nc && o.r0 === m.nr) hit = 'kop';   // gekruist
          }
          if (hit) crashed.push([m.b, hit]);
        }
        // veilige bordjes bewegen
        for (const m of moves) {
          const b = m.b; const crash = crashed.find((x) => x[0] === b);
          if (!m.wasAir) { const inAx = b.lastDir % 2, outAx = b.dir % 2; layTrail(b, b.c0, b.r0, inAx, outAx); }
          if (crash) { b.pc = b.c0; b.pr = b.r0; b.acc = 0; continue; }
          b.pc = b.c0; b.pr = b.r0; b.c0 = m.nc; b.r0 = m.nr; b.lastDir = b.dir; arrive(b, m);
        }
        if (crashed.length) { for (const [b, why] of crashed) crashBike(b, why); const alive = bikes.filter((x) => x.alive); endRoundSoon(alive.length === 1 ? alive[0].i : null); break; }
      }
    }
    function arrive(b, m) {
      const cell = idx(b.c0, b.r0);
      // items
      if (!m.flying && !m.wasAir) for (const it of items) if (it.on && it.c === b.c0 && it.r === b.r0) takeItem(b, it);
      // grazen: naast je ligt een muur / spoor / blok
      if (!m.wasAir) {
        let g = 0; for (const s of [1, 3]) { const d = (b.dir + s) % 4, c = b.c0 + DX[d], r = b.r0 + DZ[d]; if (solid(c, r)) g += 0.05; else { const o = occ[idx(c, r)]; if (o === 2) g += 0.1; else if (o === 3 || o === 4) g += o === 3 + b.i ? 0.1 : 0.16; } }
        const o = bikes[1 - b.i]; if (o.alive && Math.abs(o.c0 - b.c0) + Math.abs(o.r0 - b.r0) <= 2 && !(o.c0 === b.c0 && o.r0 === b.r0)) g += 0.12;
        if (g > 0) { b.meter = Math.min(1, b.meter + g * 0.55); stats.grazes++; if (rnd() < 0.55) fx.particles.emit(cellX(b.c0) + rand(-0.4, 0.4), 0.35, cellZ(b.r0) + rand(-0.4, 0.4), rand(-1, 1), rand(1, 3), rand(-1, 1), { life: 0.35, size: 0.28, color: 0xffffff, gravity: 6 }); if (b.grazeT <= 0 && g >= 0.1) { b.grazeT = 0.9; fx.texts.add(pick(GRAZE_TXT), cellX(b.c0), 2.2, cellZ(b.r0), NEON_CSS[b.i], 0.9); audio.sfx('tick', { vol: 0.2, rate: 1 + b.meter * 1.2 }); } }
      }
      // landen na een sprong
      if (m.landing) { audio.sfx('land', { vol: 0.35 }); fx.particles.burst(cellX(b.c0), 0.2, cellZ(b.r0), { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [b.col, 0xffffff], gravity: 6 }); }
    }
    function takeItem(b, it) {
      it.on = false; it.s.visible = false; it.sh.visible = false; stats.items++;
      fx.texts.add(ITEM_NAME[it.type], cellX(it.c), 2.8, cellZ(it.r), ITEM_COL[it.type], 1.5); audio.sfx('powerup', { vol: 0.7 }); ctx.shake(0.2);
      fx.particles.burst(cellX(it.c), 0.8, cellZ(it.r), { count: 26, speed: 5, up: 1.2, life: 0.8, size: 0.4, colors: [parseInt(ITEM_COL[it.type].slice(1), 16), 0xffffff], gravity: 3 });
      if (it.type === 'charge') b.meter = 1;
      else if (it.type === 'gap') { b.dbl = true; b.jumpCd = 0; }
      else { // wisser: veegt alle sporen in een cirkel weg
        let n = 0; for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (Math.hypot(c - it.c, r - it.r) > 7.5) continue; const cell = idx(c, r); if ((occ[cell] === 3 || occ[cell] === 4) && eraseCell(cell)) { n++; if (n % 3 === 0) fx.particles.burst(cellX(c), 0.5, cellZ(r), { count: 3, speed: 2.5, up: 1.4, life: 0.6, size: 0.3, color: occ[cell] === 4 ? NEON[1] : NEON[0], gravity: 4 }); } }
        stats.erased += n; fx.particles.ring(cellX(it.c), 0.3, cellZ(it.r), { count: 40, speed: 10, color: 0xff7ad8, size: 0.4, life: 0.7 }); audio.sfx('whoosh', { vol: 0.5 });
      }
    }
    function crashBike(b, why) {
      if (!b.alive) return; b.alive = false; stats.crashes++; b.boosting = false;
      const x = cellX(b.c0), z = cellZ(b.r0);
      audio.sfx('explode', { vol: 0.7 }); audio.sfx('hurt', { vol: 0.4 }); ctx.shake(0.7); G.camPunch = 0.6;
      fx.particles.burst(x, 0.6, z, { count: 60, speed: 8, up: 1.4, life: 1.0, size: 0.5, colors: [b.col, 0xffffff, 0xff7a1a, 0xffd23f], gravity: 6 });
      fx.particles.ring(x, 0.4, z, { count: 36, speed: 10, color: b.col, size: 0.45, life: 0.6 });
      const txt = { muur: 'KLAP!', blok: 'BONK!', vuur: 'AU, HEET!', eigen: 'OVER JE EIGEN SPOOR!', spoor: 'KRASSSH!', kop: 'KOP-KOP!', lava: 'LAVA-BAD!' }[why] || 'AUW!';
      fx.texts.add(txt, x, 2.8, z, '#ff6a5a', 1.5);
      // het poppetje vliegt eraf
      const rd = b.rider; scene.attach(b.c.group); rd.on = false; rd.vx = (DX[b.dir]) * 5 + rand(-2, 2); rd.vz = (DZ[b.dir]) * 5 + rand(-2, 2); rd.vy = 10; rd.spin = (rnd() < 0.5 ? -1 : 1) * 8; rd.deadT = 0; b.c.pose = 'scared'; b.grp.visible = false;
    }

    // ---------------- krimpen, draak, items ----------------
    function updateShrink(dt) {
      const st = G.final ? SHRINK_START_FINAL : SHRINK_START;
      if (G.roundT > st) {
        if (!G.shrinkOn) { G.shrinkOn = true; hud.setTimer(null); hud.toast('🌋 De lava komt eraan! De arena krimpt!', 2200); audio.sfx('creak', { vol: 0.5 }); ctx.shake(0.4); }
        const k = (G.roundT - st) * SHRINK_V; G.sx = Math.min((W - MIN_W) / 2, k); G.sz = Math.min((H - MIN_H) / 2, k);
        Wd.setBounds(-W / 2 + G.sx, W / 2 - G.sx, -H / 2 + G.sz, H / 2 - G.sz);
        for (const b of bikes) if (b.alive && blockedShrink(b.c0, b.r0)) { crashBike(b, 'lava'); endRoundSoon(bikes.every((x) => !x.alive) ? null : bikes.find((x) => x.alive).i); }
      }
      if (G.roundT > ROUND_CAP && !G.ending) { for (const b of bikes) if (b.alive) crashBike(b, 'lava'); endRoundSoon(null); }
    }
    function spawnItemPair() {
      if (items.filter((q) => q.on).length >= 6) return;
      for (let tries = 0; tries < 40; tries++) {
        const c = 4 + ((rnd() * (W - 8)) | 0), r = 4 + ((rnd() * (H - 8)) | 0), m = [mirC(c), mirR(r)]; const ok = (cc, rr) => !solid(cc, rr) && occ[idx(cc, rr)] === 0 && bikes.every((b) => Math.abs(b.c0 - cc) + Math.abs(b.r0 - rr) > 6) && !items.some((q) => q.on && q.c === cc && q.r === rr);
        if (!ok(c, r) || !ok(m[0], m[1]) || (c === m[0] && r === m[1])) continue;
        const type = pick(ITEM_TYPES);
        for (const [cc, rr] of [[c, r], m]) { const it = items.find((q) => !q.on); if (!it) return; it.on = true; it.c = cc; it.r = rr; it.type = type; it.t = 0; it.life = 14; it.s.material.map = itemTex[type]; it.s.visible = true; it.sh.visible = true; it.sh.material.color.set(ITEM_COL[type]); }
        audio.sfx('sparkle', { vol: 0.3 }); return;
      }
    }
    function updateDragon(dt) {
      D.t -= dt;
      if (D.state === 'idle' && D.t <= 0 && !G.ending) {
        D.axis = rnd() < 0.5 ? 0 : 1; D.dir = rnd() < 0.5 ? -1 : 1; const lim = D.axis === 0 ? H : W; D.k0 = 5 + ((rnd() * (lim - 10)) | 0); D.state = 'warn'; D.ft = 0; D.burned = 0; stats.dragons++;
        Wd.lane.visible = true; dragon.group.visible = true;
        const cw = D.axis === 0 ? W : 3, ch = D.axis === 0 ? 3 : H; Wd.lane.scale.set(D.axis === 0 ? W : 3, D.axis === 0 ? 3 : H, 1);
        Wd.lane.position.set(D.axis === 0 ? 0 : cellX(D.k0), 0.06, D.axis === 0 ? cellZ(D.k0) : 0);
        hud.toast('🐉 De draak komt! Blijf weg bij de rode baan!', 2000); audio.sfx('creak', { vol: 0.35 });
      } else if (D.state === 'warn') {
        D.ft += dt; Wd.lane.material.opacity = 0.25 + Math.abs(Math.sin(D.ft * 9)) * 0.3;
        const u = Math.max(0, D.ft - 1.4) / 1.3, len = (D.axis === 0 ? W : H); const along = (D.dir > 0 ? -1 : 1) * (len / 2 + 6) + (D.dir > 0 ? 1 : -1) * u * (len + 12);
        const gx = D.axis === 0 ? along : cellX(D.k0), gz = D.axis === 0 ? cellZ(D.k0) : along;
        // de draak vliegt al aan vanaf het begin van de waarschuwing
        const u2 = clamp(D.ft / 2.7, 0, 1.2); const al = (D.dir > 0 ? -1 : 1) * (len / 2 + 8) + (D.dir > 0 ? 1 : -1) * u2 * (len + 16);
        dragon.group.position.set(D.axis === 0 ? al : cellX(D.k0), 4.5 + Math.sin(D.ft * 4) * 0.4, D.axis === 0 ? cellZ(D.k0) : al);
        dragon.group.rotation.y = D.axis === 0 ? (D.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (D.dir > 0 ? 0 : Math.PI); dragon.update(dt);
        if (D.ft > 1.4) { // vuur achter de draak: alle cellen in de baan tot de draak
          const frontCell = (D.axis === 0 ? (al + len / 2) : (al + len / 2)); // in cellen langs de baan
          for (let k = 0; k < len; k++) {
            const passed = D.dir > 0 ? k <= frontCell : k >= frontCell; if (!passed) continue;
            for (let o = -1; o <= 1; o++) {
              const c = D.axis === 0 ? k : D.k0 + o, r = D.axis === 0 ? D.k0 + o : k; if (c < 0 || r < 0 || c >= W || r >= H) continue; const cell = idx(c, r); if (occ[cell] === 5 || occ[cell] === 2) continue;
              if (occ[cell] === 3 || occ[cell] === 4) { eraseCell(cell); stats.burned++; }
              occ[cell] = 5; fireList.push({ cell, t: 1.3 + rnd() * 0.3 }); D.burned++;
              if (rnd() < 0.4) fx.particles.burst(cellX(c), 0.7, cellZ(r), { count: 3, speed: 2.5, up: 2, life: 0.6, size: 0.5, colors: [0xff7a1a, 0xffd23f, 0xff3a0a], gravity: -2 });
              for (const b of bikes) if (b.alive && b.c0 === c && b.r0 === r && b.jumpLeft === 0) { crashBike(b, 'vuur'); endRoundSoon(bikes.every((x) => !x.alive) ? null : bikes.find((x) => x.alive).i); }
            }
          }
        }
        if (D.ft > 2.9) { D.state = 'idle'; D.t = rand(10, 14); dragon.group.visible = false; Wd.lane.visible = false; }
      }
      for (let i = fireList.length - 1; i >= 0; i--) { const f = fireList[i]; f.t -= dt; if (f.t <= 0) { if (occ[f.cell] === 5) occ[f.cell] = 0; fireList.splice(i, 1); } }
    }
    // ---------------- ronde-einde ----------------
    function endRoundSoon(w) { if (G.ending) return; G.ending = true; G.t = 0; G.slow = 0.4; G.slowT = 0; G.pendingW = w; }
    function endRound(w) {
      G.state = 'roundEnd'; G.t = 0; G.slow = 1; G.ending = false; hud.setTimer(null);
      if (w == null) { G.wins[0]++; G.wins[1]++; hud.showBig('TWEE KEER BOEM!', 1800, '#ffd23f'); }
      else { G.wins[w]++; hud.showBig(`${names[w]} wint ronde ${G.round}!`, 1800, w ? '#8fb8ff' : '#7dffb0'); bikes[w].c.pose = 'cheer'; bikes[w].c.jump(); audio.sfx('win', { vol: 0.5 }); }
      G.lastW = w; refreshHud(); audio.sfx('bell', { vol: 0.5 });
    }
    function nextStep() {
      const [a, b2] = G.wins; const over = ((a >= NEED_WINS || b2 >= NEED_WINS) && a !== b2) || G.round >= MAX_ROUNDS;
      if (!over) { startRound(G.round + 1); return; }
      if (a !== b2) { G.state = 'end'; G.t = 0; G.winner = a > b2 ? 0 : 1; celebrate(G.winner); return; }
      G.state = 'dragon'; G.t = 0; G.victim = rnd() < 0.5 ? 0 : 1; dragonPick.group.visible = true; hud.showBig('DE DRAAK KIEST!', 1600, '#ff7ad8'); audio.sfx('creak', { vol: 0.5 });
    }
    function dragonScene(dt) {
      const v = bikes[G.victim]; const k = Math.min(1, G.t / 1.6); const px = cellX(v.c0), pz = cellZ(v.r0);
      dragonPick.group.position.set(lerp(px + 30, px + 2, smoothstep(0, 1, k)), lerp(14, 3.2, k) + Math.sin(G.t * 6) * 0.2, lerp(pz - 10, pz, k)); dragonPick.group.rotation.y = Math.atan2(-30 * (1 - k) - 2 * k, 10 * (1 - k)) + Math.PI; dragonPick.update(dt);
      if (!G.bit && G.t > 1.6) { G.bit = true; fx.particles.burst(px, 1, pz, { count: 80, speed: 9, up: 1.2, life: 1.2, size: 0.6, colors: [0xff7a1a, 0xffd23f, 0xff3a0a], gravity: -1 }); ctx.shake(0.8); audio.sfx('explode', { vol: 0.7 }); crashBike2(v); }
      if (G.t > 2.6) { G.state = 'end'; G.t = 0; G.winner = 1 - G.victim; G.byDragon = true; dragonPick.group.visible = false; celebrate(G.winner); }
    }
    function crashBike2(b) { b.grp.visible = false; const rd = b.rider; scene.attach(b.c.group); rd.on = false; rd.vx = 6; rd.vz = -3; rd.vy = 11; rd.spin = 9; rd.deadT = 0; b.c.pose = 'scared'; fx.texts.add('GEBRAND!', cellX(b.c0), 3, cellZ(b.r0), '#ff9a5a', 1.6); }
    function celebrate(w) {
      bikes[w].c.pose = 'cheer'; bikes[1 - w].c.pose = 'sad'; hud.showBig(`${names[w]} WINT!`, 1600, w ? '#8fb8ff' : '#7dffb0'); audio.sfx('win', { vol: 0.6 });
      fx.particles.burst(cellX(bikes[w].c0), 2, cellZ(bikes[w].r0), { count: 60, speed: 8, up: 1.3, life: 1.3, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
    }
    function finishMatch(w) {
      if (finished) return; finished = true;
      const Wn = names[w], Ln = names[1 - w];
      const jokes = [`${Wn} is de Lichtkoning! ${Ln} zit nog vast in zijn eigen spoor.`, `${Ln} reed met zijn neus in de neon. ${Wn} lacht zich suf.`, `${Wn} danste door de lichtmuren. ${Ln} danste er dwars tegenaan.`, `De draak is onder de indruk van ${Wn}. ${Ln} krijgt een ijsje als troost.`];
      const bits = [`${stats.grazes} keer langs een muur geschampt`, stats.jumps ? `${stats.jumps} sprongen` : null, stats.erased ? `${stats.erased} stukjes spoor weggeveegd` : null].filter(Boolean);
      ctx.finishPvp({ winner: w, score: [G.wins[0], G.wins[1]], delay: 600, summary: `${pick(jokes)}${G.byDragon ? ' De draak besliste het gelijkspel met een vuurstoot.' : ''} Samen: ${bits.join(', ')}.` });
    }

    // ---------------- hoofdlus ----------------
    function update(dtRaw) {
      if (finished) return;
      G.t += dtRaw; T += dtRaw; const dt = dtRaw * G.slow;
      if (G.state === 'intro') { if (G.t >= 1.4) { G.state = 'play'; G.t = 0; hud.showBig('LICHT AAN!', 600, '#4af0ff'); audio.sfx('go', { vol: 0.5 }); } }
      else if (G.state === 'play') {
        if (!G.ending) {
          G.roundT += dt;
          if (!G.shrinkOn) hud.setTimer(Math.max(0, (G.final ? SHRINK_START_FINAL : SHRINK_START) - G.roundT), 5);
          for (const b of bikes) readInput(b, dt, true);
          stepAll(dt); updateShrink(dt); updateDragon(dt);
          itemT -= dt; if (itemT <= 0) { itemT = rand(5, 7.5); spawnItemPair(); }
          for (const it of items) if (it.on) { it.t += dt; it.life -= dt; if (it.life <= 0) { it.on = false; it.s.visible = false; it.sh.visible = false; } }
          if (!G.hintOn && !G.shrinkOn && G.roundT > (G.final ? SHRINK_START_FINAL : SHRINK_START) - 3) { G.hintOn = true; hud.toast('⏰ Nog even... dan krimpt de arena!', 1500); }
        } else {
          G.slowT += dtRaw; G.slow = G.slowT < 0.9 ? 0.4 : 1; updateDragon(dt);
          if (G.slowT > 0.9) endRound(G.pendingW);
        }
      } else if (G.state === 'roundEnd') { updateDragon(dt); if (G.t > 2.2) nextStep(); }
      else if (G.state === 'dragon') dragonScene(dtRaw);
      else if (G.state === 'end') { if (G.t > 1.3 && !finished) finishMatch(G.winner); }
      visuals(dt, dtRaw);
    }

    // ---------------- beeld ----------------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(); let camX = 0, camZ = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * asp;
      const dist = clamp(Math.max(21.5 / tanH, 15.6 / tanV) * 1.04, 30, 90);
      G.camPunch = Math.max(0, G.camPunch - dt * 1.5);
      const sMid = G.sx + G.sz > 0 ? 0 : 0; camX = damp(camX, 0, 2, dt);
      const el = 1.1, d = dist * (1 - G.camPunch * 0.03);
      camP.set(camX, Math.sin(el) * d, 2.8 + Math.cos(el) * d); camL.set(camX, 0, -0.7);
      camera.position.copy(camP); camera.lookAt(camL);
    }
    function visuals(dt, dtRaw) {
      const tt = T + introT;
      for (const b of bikes) {
        const c = b.c, gp = b.grp;
        if (b.alive) {
          const wx = lerp(cellX(b.pc), cellX(b.c0), clamp(b.acc, 0, 1)), wz = lerp(cellZ(b.pr), cellZ(b.r0), clamp(b.acc, 0, 1));
          const jt = b.jumpLeft > 0 ? clamp((b.jumpTotal - b.jumpLeft + b.acc) / b.jumpTotal, 0, 1) : 0; b.y = b.jumpLeft > 0 ? Math.sin(jt * Math.PI) * (1.5 / Math.max(0.5, Math.sqrt(GRAV)) + (b.jumpTotal > JLEN + 1 ? 1.1 : 0)) : 0;
          const tgt = Math.atan2(DX[b.dir], DZ[b.dir]); const before = b.yaw; b.yaw = dampAngle(b.yaw, tgt, 22, dtRaw); let dy = b.yaw - before; if (dy > Math.PI) dy -= TAU; if (dy < -Math.PI) dy += TAU;
          b.lean = damp(b.lean, clamp(-dy / Math.max(dtRaw, 1e-3) * 0.09, -0.6, 0.6), 12, dtRaw);
          gp.position.set(wx, b.y, wz); gp.rotation.set(b.jumpLeft > 0 ? -0.25 * Math.cos(jt * Math.PI) : 0, b.yaw, b.lean);
          const sc = b.bs * (1 + (b.jumpLeft > 0 ? 0.08 : 0)); gp.scale.setScalar(sc);
          b.under.material.opacity = 0.45 + Math.sin(tt * 12) * 0.1 + (b.boosting ? 0.3 : 0); b.thr.scale.set(1, (b.boosting ? 2.4 : 1) * (0.8 + Math.sin(tt * 40) * 0.2), 1); b.head.scale.setScalar(2.2 + (b.boosting ? 1 : 0));
          c.speed = 0.3; c.pose = G.state === 'roundEnd' ? c.pose : 'carry';
          // uitlaat
          if (G.state === 'play' && rnd() < dtRaw * (b.boosting ? 80 : 30)) { const bx = wx - DX[b.dir] * 1.0, bz = wz - DZ[b.dir] * 1.0; fx.particles.emit(bx + rand(-0.15, 0.15), 0.4 + b.y, bz + rand(-0.15, 0.15), -DX[b.dir] * rand(1, 3) + rand(-0.5, 0.5), rand(0.2, 1), -DZ[b.dir] * rand(1, 3) + rand(-0.5, 0.5), { life: b.boosting ? 0.5 : 0.35, size: b.boosting ? 0.5 : 0.3, color: b.boosting ? 0xffffff : b.col, gravity: 0 }); }
          b.shadow.position.set(wx, 0.03, wz); b.shadow.scale.setScalar(1.1 * b.bs * (1 - Math.min(0.5, b.y * 0.15))); b.shadow.visible = true;
          b.tag.position.set(wx, 2.3 * b.sz + 0.5 + b.y, wz); b.tag.visible = true;
          // meters
          const my = 3.4 * Math.max(0.8, b.sz) ; const mx = wx, mz = wz;
          for (const [m, v, y2] of [[b.mTurbo, b.meter, 0.0], [b.mJump, b.jumpLeft > 0 ? 0 : 1 - b.jumpCd / JUMP_CD, -0.28]]) {
            m.bg.position.set(mx, my - 0.4 + y2 + b.y, mz + 0.9); m.fl.position.set(mx - 0.75 * (1 - clamp(v, 0, 1)), my - 0.4 + y2 + b.y, mz + 0.91); m.fl.scale.set(Math.max(0.001, clamp(v, 0, 1)), 1, 1);
            m.bg.rotation.x = m.fl.rotation.x = -0.9; m.bg.visible = m.fl.visible = G.state === 'play';
          }
          b.mTurbo.fl.material.color.setHex(b.meter >= 0.99 ? 0xffffff : 0x4af0ff); b.mJump.fl.material.color.setHex(b.dbl ? 0xff7ad8 : 0xffe14a);
        } else {
          const rd = b.rider; rd.deadT += dtRaw; b.shadow.visible = false; b.tag.visible = rd.deadT < 1.4; b.mTurbo.bg.visible = b.mTurbo.fl.visible = b.mJump.bg.visible = b.mJump.fl.visible = false;
          if (!rd.on) { const g2 = c.group; if (g2.position.y > 0 || rd.vy > 0) { rd.vy -= 26 * Math.max(0.5, GRAV) * dtRaw; g2.position.x += rd.vx * dtRaw; g2.position.z += rd.vz * dtRaw; g2.position.y += rd.vy * dtRaw; g2.rotation.x += rd.spin * dtRaw * 0.8; g2.rotation.z += rd.spin * dtRaw * 0.4; if (g2.position.y <= 0) { g2.position.y = 0; rd.vy = 0; rd.vx = rd.vz = 0; g2.rotation.x = 0; g2.rotation.z = 0; c.pose = 'sad'; audio.sfx('thud', { vol: 0.3 }); } } }
          b.tag.position.set(c.group.position.x, 2.6 + c.group.position.y, c.group.position.z);
        }
        c.update(dtRaw);
        const txt = infoText(b); if (txt !== b.lastTxt) { b.lastTxt = txt; hud.setPlayerInfo(b.i, txt); }
      }
      // items
      for (const it of items) { if (!it.on) continue; const k = smoothstep(0, 0.25, it.t), blink = it.life > 3 || Math.sin(it.life * 16) > 0; it.s.visible = blink; it.s.position.set(cellX(it.c), 1.3 + Math.sin(it.t * 4 + it.c) * 0.2, cellZ(it.r)); it.s.scale.setScalar(1.7 * k); it.sh.position.set(cellX(it.c), 0.06, cellZ(it.r)); it.sh.scale.setScalar(1 + Math.sin(it.t * 6) * 0.12); it.sh.visible = blink; }
      // vuur
      { let k = 0; for (const f of fireList) { if (k >= 200) break; const c = f.cell % W, r = (f.cell / W) | 0; const g = Math.min(1, f.t / 0.3) * smoothstep(0, 0.1, 1.6 - f.t); const fl = 1 + Math.sin(tt * 30 + f.cell) * 0.2; setI(Wd.fire, k, cellX(c), 0.7 * g, cellZ(r), 1.0, g * fl, 1.0, tt * 3 + k); setI(Wd.fireI, k, cellX(c), 0.5 * g, cellZ(r), 1, g * (1.1 - (fl - 1)), 1, -tt * 4); k++; } for (let j = k; j < 200; j++) { setI(Wd.fire, j, 0, -50, 0, 0); setI(Wd.fireI, j, 0, -50, 0, 0); } Wd.fire.instanceMatrix.needsUpdate = true; Wd.fireI.instanceMatrix.needsUpdate = true; }
      if (dirty) { dirty = false; for (const t of Wd.trail) { t.wall.instanceMatrix.needsUpdate = true; t.top.instanceMatrix.needsUpdate = true; t.glow.instanceMatrix.needsUpdate = true; } }
      Wd.setEdge(-W / 2 + G.sx, W / 2 - G.sx, -H / 2 + G.sz, H / 2 - G.sz, Math.sin(tt * 5));
      Wd.update(dtRaw);
      updateCamera(dtRaw);
    }
    function introUpdate(dt) { introT += dt; for (const b of bikes) { b.c.update(dt); b.grp.position.set(cellX(b.c0), 0.05 + Math.sin(introT * 3 + b.i) * 0.04, cellZ(b.r0)); b.grp.rotation.y = b.yaw; b.shadow.position.set(cellX(b.c0), 0.03, cellZ(b.r0)); b.tag.position.set(cellX(b.c0), 2.3 * b.sz + 0.5, cellZ(b.r0)); } Wd.update(dt); updateCamera(dt); }
    function resultUpdate(dt) { T += dt; for (const b of bikes) b.c.update(dt); Wd.update(dt); updateCamera(dt); }

    startRound(1); G.state = 'intro0';
    bikes.forEach((b) => { b.grp.position.set(cellX(b.c0), 0.05, cellZ(b.r0)); b.grp.rotation.y = b.yaw; b.mTurbo.bg.visible = b.mTurbo.fl.visible = b.mJump.bg.visible = b.mJump.fl.visible = false; });
    visuals(0.016, 0.016);
    const intro0 = () => { if (!started) { started = true; G.state = 'play'; G.t = 0; } };

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } intro0(); update(dt); },
      onStart: intro0, resultUpdate, introUpdate,
      onSwap() { for (const b of bikes) fx.particles.burst(cellX(b.c0), 1, cellZ(b.r0), { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const b = bikes[i]; if (!b.alive) return;
          b.meter = 0; b.jumpCd = 4; b.dbl = false; b.q.length = 0;
          fx.texts.add('KORTSLUITING!', cellX(b.c0), 3, cellZ(b.r0), '#d9a8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4);
        });
      },
      celebrate(w) { bikes[w].c.pose = 'cheer'; bikes[1 - w].c.pose = 'sad'; },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, round: G.round, roundT: G.roundT, wins: [...G.wins], finished, winner: G.winner, byDragon: !!G.byDragon, stats: { ...stats }, ending: G.ending, sx: G.sx, sz: G.sz, dragon: D.state,
          occ: Array.from(occ), items: items.filter((q) => q.on).map((q) => ({ c: q.c, r: q.r, type: q.type })),
          bikes: bikes.map((b) => ({ c: b.c0, r: b.r0, dir: b.dir, alive: b.alive, meter: b.meter, jumpLeft: b.jumpLeft, jumpCd: b.jumpCd, dbl: b.dbl, boosting: b.boosting, trail: b.trail, q: b.q.length })) }),
        bikes, occ, G, solid, idx, startRound, takeItem, items, spawnItemPair, forceDragon: () => { D.t = 0; }, setRoundT: (t) => { G.roundT = t; }, crash: (i) => { crashBike(bikes[i], 'muur'); endRoundSoon(1 - i); },
        give: (i, type) => takeItem(bikes[i], { c: bikes[i].c0, r: bikes[i].r0, type, on: true, s: { visible: false }, sh: { visible: false } }),
        W, H, intro0,
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep, mulberry32 } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Animal } from '../engine/chars.js';
import * as L from './blocks_logic.js';
import { buildArena, bevelTexture, FW, FH, FX } from './blocks_world.js';
import { glowTex } from './stack_world.js';

// Blokkenstrijd — Tetris-duel in de Neonkelder. Twee velden van 10x16, dezelfde blokkenreeks voor allebei.
//  * links/rechts schuiven, omlaag = sneller vallen, A = draaien, B = meteen laten vallen
//  * 2+ rijen tegelijk = rommelrijen (met een gat) naar de ander, 4 rijen ook nog een kippenblok erbij
//  * power-blokken: bom (blaast gaten), bevriezer (ander kan 2 s niets), regenboog (vult de bijna-volle rij)
//  * comeback: wie achterstaat krijgt een makkelijke I-balk (en in de laatste 20 s anderhalf keer zoveel punten)
//  * wie als eerste vol zit verliest; na 100 s wint de hoogste score (gelijk = sudden death)

const MATCH_TIME = 100, SD_MAX = 30;
const TCOL = [0, 0x35e6ff, 0xffe14a, 0xb45cff, 0x5cff7a, 0xff4a5a, 0x4a7cff, 0xff9a3a, 0x6c6c8c, 0xffe27a, 0xffffff].map((c) => new THREE.Color(c));
const PCSS = ['#7dffb0', '#8fb8ff'];
const NX = [-2.35, 2.35], NY = [10.3, 8.0, 5.8];
const CAP = 360;
const POWNAME = { bomb: 'BOM!', freeze: 'BEVRIEZER!', rainbow: 'REGENBOOG!' };
const _c = new THREE.Color(), _col = new THREE.Color(), _red = new THREE.Color(0xff2a2a), _dc = new THREE.Color(), _w = new THREE.Color(1, 1, 1), _ice = new THREE.Color(0xbdeeff);

function iconCanvas(kind) {
  return canvasTex(64, 64, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'bomb') {
      g.fillStyle = '#16141f'; g.beginPath(); g.arc(30, 38, 19, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(23, 30, 5, 0, TAU); g.fill();
      g.strokeStyle = '#ffb74a'; g.lineWidth = 5; g.beginPath(); g.moveTo(40, 22); g.quadraticCurveTo(48, 12, 54, 14); g.stroke();
      g.fillStyle = '#ffe14a'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(54, 14); g.lineTo(54 + Math.cos(a) * 9, 14 + Math.sin(a) * 9); g.lineWidth = 3; g.strokeStyle = '#ffe14a'; g.stroke(); }
    } else if (kind === 'freeze') {
      g.strokeStyle = '#eaffff'; g.lineWidth = 5; g.shadowColor = '#35c8ff'; g.shadowBlur = 8;
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI; const dx = Math.cos(a) * 26, dy = Math.sin(a) * 26; g.beginPath(); g.moveTo(32 - dx, 32 - dy); g.lineTo(32 + dx, 32 + dy); g.stroke(); }
      g.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15); g.lineTo(32 + Math.cos(a + 0.5) * 21, 32 + Math.sin(a + 0.5) * 21); g.moveTo(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15); g.lineTo(32 + Math.cos(a - 0.5) * 21, 32 + Math.sin(a - 0.5) * 21); g.stroke(); }
    } else if (kind === 'rainbow') {
      ['#ff4a5a', '#ffb23a', '#ffe14a', '#5cff7a', '#4a9cff'].forEach((c, k) => { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.arc(32, 46, 26 - k * 5, Math.PI, 0); g.stroke(); });
    } else {
      g.fillStyle = '#fff6d8'; g.beginPath(); g.ellipse(32, 38, 20, 18, 0, 0, TAU); g.fill();
      g.fillStyle = '#e8352a'; for (const dx of [-8, 0, 8]) { g.beginPath(); g.arc(32 + dx, 18, 7, 0, TAU); g.fill(); }
      g.fillStyle = '#ffa020'; g.beginPath(); g.moveTo(40, 38); g.lineTo(56, 42); g.lineTo(40, 47); g.closePath(); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(34, 33, 3.2, 0, TAU); g.fill();
    }
  });
}
const _icons = {};
const iconTex = (k) => (_icons[k] ||= iconCanvas(k));

export default {
  id: 'blocks',
  name: 'Blokkenstrijd',
  giver: 'Neon-Nelly',
  icon: '🧱',
  mode: 'pvp',
  time: 100,
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'game_fast',
  blurb: 'Een <b>blokkenduel</b> in de Neonkelder! Vul rijen zodat ze verdwijnen: <b>2 rijen of meer</b> tegelijk sturen rommelrijen naar je broer. Pak de <b>bom</b>, de <b>bevriezer</b> en de <b>regenboog</b>, en pas op voor het <b>kippenblok</b>! Wie als eerste vol zit, verliest.',
  controls: ['{move} schuiven, omlaag = sneller vallen', '{a} draaien', '{b} meteen laten vallen'],
  tip: 'Wie achterstaat krijgt een makkelijke I-balk. Een regenboog-blok vult ook het gat van een rommelrij!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const Lg = ctx.lights('cave', { shadow: 18, center: [0, 8, 0], fogNear: 60, fogFar: 140 });
    Lg.hemi.intensity = 1.45; Lg.hemi.color.set(0xb8b0ff); Lg.hemi.groundColor.set(0x3a2a6a);
    Lg.sun.color.set(0xe8e0ff); Lg.sun.intensity = 1.5; Lg.sun.position.set(-4, 16, 30); Lg.sun.castShadow = false;
    camera.fov = 50; camera.updateProjectionMatrix();
    const A = buildArena(ctx, names, PLAYER_COLORS);
    const seq = new L.Sequence(mulberry32(Math.floor(ctx.rng() * 1e9)));
    const rnd = Math.random;

    // ---------- gedeelde render-spullen ----------
    const bevel = bevelTexture(), gtex = glowTex();
    const cellGeo = new THREE.BoxGeometry(0.96, 0.96, 0.9);
    const cellMat = new THREE.MeshStandardMaterial({ map: bevel, roughness: 0.28, metalness: 0.25, emissive: 0x181820, emissiveMap: bevel, emissiveIntensity: 0.5 });
    const glowMat = new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    const ghostMat = new THREE.MeshBasicMaterial({ map: bevel, transparent: true, opacity: 0.28, depthWrite: false });
    const meterMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, toneMapped: false });
    const dummy = new THREE.Object3D();

    // ---------- spelers ----------
    const pl = [0, 1].map((i) => {
      const f = A.fields[i], g = f.g;
      const cellIM = new THREE.InstancedMesh(cellGeo, cellMat, CAP); cellIM.frustumCulled = false; cellIM.count = 0; cellIM.setColorAt(0, _w); g.add(cellIM);
      const glowIM = new THREE.InstancedMesh(glowGeo, glowMat, CAP); glowIM.frustumCulled = false; glowIM.count = 0; glowIM.setColorAt(0, _w); glowIM.position.z = 0.6; glowIM.renderOrder = 6; g.add(glowIM);
      const ghostIM = new THREE.InstancedMesh(cellGeo, ghostMat, 4); ghostIM.frustumCulled = false; ghostIM.count = 0; ghostIM.setColorAt(0, _w); g.add(ghostIM);
      const meterIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.86, 0.5), meterMat, FH); meterIM.frustumCulled = false; meterIM.count = 0; g.add(meterIM);
      const preIM = new THREE.InstancedMesh(cellGeo, cellMat, 12); preIM.frustumCulled = false; preIM.count = 0; preIM.setColorAt(0, _w); preIM.position.set(NX[i] - FX[i], 0, 0.3); g.add(preIM);
      // ijs-laag voor als de speler bevroren is
      const ice = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); ice.position.set(0, FH / 2, 0.8); ice.renderOrder = 7; g.add(ice);
      // pictogrammen (bom/ijs/regenboog/kip) voor speciale cellen
      const icons = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex('bomb'), transparent: true })); s.visible = false; s.renderOrder = 8; g.add(s); return s; });
      // het poppetje in de middenstrook
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(3.5 / c.height); holder.position.set(NX[i], 0.25, 1.1); scene.add(holder);
      c.faceDir(i ? -0.35 : 0.35, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      // volgende-panelen
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 7.4), new THREE.MeshBasicMaterial({ map: canvasTex(128, 240, (cg, w, h) => { cg.fillStyle = 'rgba(8,6,28,.88)'; cg.fillRect(0, 0, w, h); cg.strokeStyle = i ? '#4a8cff' : '#35c46f'; cg.lineWidth = 7; cg.strokeRect(3, 3, w - 6, h - 6); cg.font = 'bold 17px Fredoka, Arial Black, sans-serif'; cg.fillStyle = '#d8d0ff'; cg.textAlign = 'center'; cg.fillText('VOLGENDE', w / 2, 32); }), transparent: true }));
      panel.position.set(NX[i], 8.0, 0.05); scene.add(panel);
      return {
        i, f, g, cellIM, glowIM, ghostIM, meterIM, preIM, ice, icons, c, holder,
        grid: L.emptyGrid(), piece: null, si: 0, front: [], score: 0, lines: 0, combo: 0, pend: 0, pieces: 0,
        state: 'wait', spawnDelay: 0.6, gravT: 0, lockT: 0, lockResets: 0, dir: 0, dasT: 0, dasRep: 0, slideT: 0, slideDir: 0, frozenT: 0,
        clearT: 0, clearRows: [], rowOff: new Float32Array(FH), rowPop: new Float32Array(FH), deb: [], shake: 0, kick: 0, vx: 3, vy: 0, chickT: 0.5,
        pose: 'carry', poseT: 0, lastGift: -99, holeCol: Math.floor(rnd() * FW), boost: 1, danger: 0, lastTxt: '', heightPeak: 0, softCells: 0, specials: 0,
      };
    });
    const opp = (p) => pl[1 - p.i];
    const cellX = (c) => c - FW / 2 + 0.5, cellY = (r) => FH - 1 - r + 0.5;
    const wx = (p, c) => FX[p.i] + cellX(c);

    // ---------- toestand ----------
    const G = { state: 'play', t: 0, timeLeft: MATCH_TIME, sdT: 0, winner: -1, why: '', chickenAt: 18 + rnd() * 8, sdGar: 0, lastTick: 0 };
    let T = 0, finished = false, slow = 1;
    const stats = { lines: [0, 0], garbageSent: [0, 0], bombs: 0, freezes: 0, rainbows: 0, chickens: 0, gifts: 0, tetris: 0, topouts: 0 };
    const projs = Array.from({ length: 8 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, color: 0xff5a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(2.2, 2.2, 1); s.visible = false; s.renderOrder = 12; scene.add(s); return { s, on: false, t: 0, dur: 0.6, x0: 0, y0: 0, x1: 0, y1: 0, n: 0, to: 0 }; });
    const hen = new Animal('chicken'); hen.group.visible = false; hen.group.scale.setScalar(1.9); scene.add(hen.group); const henS = { on: false, t: 0, to: 0 };

    const say = (text, x, y, col, s = 1.3) => fx.texts.add(text, x, y, 2.2, col, s);
    const react = (p, pose, secs = 1) => { p.pose = pose; p.poseT = secs; };
    const peek = (p, k) => (k < p.front.length ? p.front[k] : seq.get(p.si + k - p.front.length));
    function refreshHud() {
      hud.setScore(`${names[0]} ${pl[0].score} – ${pl[1].score} ${names[1]}${G.state === 'sd' ? '  (SUDDEN DEATH)' : ''}`);
      for (const p of pl) {
        const bits = [`${p.lines} rijen`];
        if (p.pend > 0) bits.push(`⚠ ${p.pend} onderweg`);
        if (p.frozenT > 0) bits.push('bevroren!');
        if (p.boost > 1) bits.push('x1,5');
        const txt = bits.join(' · '); if (txt !== p.lastTxt) { p.lastTxt = txt; hud.setPlayerInfo(p.i, txt); }
      }
    }
    const drawPlaque = (p) => p.f.drawPlaque(p.score, p.lines);

    // ---------- stukken ----------
    function spawn(p) {
      const def = p.front.length ? p.front.shift() : seq.get(p.si++);
      p.piece = L.newPiece(def); p.pieces++; p.gravT = 0; p.lockT = 0; p.lockResets = 0; p.vx = p.piece.x; p.vy = p.piece.y - 1; p.chickT = 0.6; p.state = 'play';
      if (def.pow) p.specials++;
      if (!L.pieceFits(p.grid, p.piece)) { topOut(p); return; }
      if (def.pow) say(POWNAME[def.pow], FX[p.i], 14.6, '#ffffff', 1.0);
      if (def.chicken) { say('KIPPENBLOK!', FX[p.i], 13.6, '#ffe27a', 1.2); audio.sfx('pop', { vol: 0.5, rate: 1.8 }); }
      maybeGift(p);
    }
    function maybeGift(p) {
      const o = opp(p);
      if (T - p.lastGift < 24 || p.front.length || p.piece.t === 'I') return;
      const hp = L.maxHeight(p.grid), ho = L.maxHeight(o.grid);
      if ((o.score - p.score >= 450 && hp >= 5) || (hp >= ho + 5 && hp >= 8)) {
        p.lastGift = T; p.front.push({ t: 'I' }); stats.gifts++;
        hud.toast(`🎁 ${names[p.i]} krijgt een makkelijke I-balk!`, 1800); say('MAKKELIJKE I-BALK!', FX[p.i], 15, '#35e6ff', 1.1); audio.sfx('powerup', { vol: 0.5 });
      }
    }
    const mult = (p) => p.boost;
    function addScore(p, n) { p.score += Math.round(n * mult(p)); }
    function move(p, dx, isSlide = false) {
      if (!p.piece || p.frozenT > 0) return false;
      if (L.tryMove(p.grid, p.piece, dx, 0)) {
        if (p.lockT > 0 && p.lockResets < 8) { p.lockT = 0; p.lockResets++; }
        if (SLIP > 0.3 && !isSlide) { p.slideT = 0.11; p.slideDir = dx; }
        if (!isSlide) audio.sfx('tick', { vol: 0.12, rate: 1.4 });
        return true;
      }
      return false;
    }
    function rotate(p) {
      if (!p.piece || p.frozenT > 0) return;
      if (L.tryRotate(p.grid, p.piece, 1)) { if (p.lockT > 0 && p.lockResets < 8) { p.lockT = 0; p.lockResets++; } audio.sfx('click', { vol: 0.3, rate: 1.2 }); }
    }
    function hardDrop(p) {
      if (!p.piece || p.frozenT > 0) return;
      const d = L.dropDistance(p.grid, p.piece);
      for (let k = 1; k <= d; k += 2) { const q = p.piece; for (const [cx] of L.cellsOf(q)) if (rnd() < 0.5) fx.particles.emit(wx(p, q.x + cx), cellY(q.y + k - 1) + 0.3, 0.6, 0, -rand(0, 2), 0, { life: 0.3, size: 0.28, color: 0xffffff, gravity: 0 }); }
      p.piece.y += d; addScore(p, d * 2); p.kick = 0.35; audio.sfx('thud', { vol: 0.35, rate: 1.2 });
      lockCurrent(p);
    }

    // ---------- vastzetten, lijnen, rommel ----------
    function lockCurrent(p) {
      const piece = p.piece; p.piece = null;
      const cells = L.lockPiece(p.grid, piece);
      p.shake = Math.max(p.shake, 0.12); audio.sfx('click', { vol: 0.35, rate: 0.7 });
      for (const c of cells) fx.particles.burst(wx(p, c.x), cellY(c.y), 0.7, { count: 2, speed: 1.5, up: 0.5, life: 0.35, size: 0.22, colors: [TCOL[c.v].getHex(), 0xffffff], gravity: 3 });
      if (piece.kind) {
        const sc = cells.find((c) => c.i === piece.sp) || cells[0];
        if (piece.kind === 'bomb') explode(p, sc);
        else if (piece.kind === 'freeze') freezeOpp(p);
        else if (piece.kind === 'rainbow') rainbowFill(p);
      }
      if (piece.chicken) { stats.chickens++; say('KO-KO-KODET!', FX[p.i], 10, '#ffe27a', 1.1); audio.sfx('pop', { vol: 0.5, rate: 1.4 }); for (let k = 0; k < 12; k++) fx.particles.emit(FX[p.i] + rand(-3, 3), 9 + rand(-2, 3), 1, rand(-2, 2), rand(1, 3), 0, { life: 1.2, size: 0.3, color: 0xfff6d8, gravity: 3 }); }
      const rows = L.fullRows(p.grid);
      if (rows.length) startClear(p, rows);
      else { p.combo = 0; applyGarbage(p); p.state = 'wait'; p.spawnDelay = 0.1; }
      refreshHud();
    }
    function explode(p, sc) {
      stats.bombs++; let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const x = sc.x + dx, y = sc.y + dy; if (x < 0 || x >= FW || y < 0 || y >= FH || !p.grid[y][x]) continue;
        flyCell(p, x, y, p.grid[y][x], 7 + rnd() * 5); p.grid[y][x] = 0; n++;
      }
      addScore(p, n * 15);
      const px = wx(p, sc.x), py = cellY(sc.y);
      fx.particles.burst(px, py, 1, { count: 50, speed: 9, up: 1.2, life: 0.9, size: 0.6, colors: [0xff9a3a, 0xffe14a, 0xff4a3a, 0xffffff], gravity: 3 });
      fx.particles.ring(px, py, 1, { count: 26, speed: 9, color: 0xffb04a, size: 0.5, life: 0.5 });
      say('BOEM!', px, py + 2, '#ff9a3a', 1.6); audio.sfx('explode', { vol: 0.8 }); p.shake = 0.9; ctx.shake(0.45); react(p, 'cheer', 1);
    }
    function freezeOpp(p) {
      const o = opp(p); stats.freezes++;
      if (o.state === 'dead') return;
      o.frozenT = 2.0; say('BEVROREN!', FX[o.i], 12, '#9fe8ff', 1.5); hud.toast(`🧊 ${names[o.i]} zit even in het ijs!`, 1600);
      audio.sfx('sparkle', { vol: 0.7 }); audio.sfx('static', { vol: 0.3 }); react(o, 'scared', 2); react(p, 'cheer', 1);
      for (let k = 0; k < 40; k++) fx.particles.emit(FX[o.i] + rand(-5, 5), rand(0, 16), 1, rand(-1, 1), rand(-1, 1), 0, { life: 1.1, size: 0.4, color: 0xcff4ff, gravity: 0 });
    }
    function rainbowFill(p) {
      stats.rainbows++; let best = -1, bestE = 99;
      for (let y = FH - 1; y >= 0; y--) { const e = p.grid[y].filter((c) => !c).length; if (e >= 1 && e <= 3 && e < bestE) { bestE = e; best = y; } }
      say('REGENBOOG!', FX[p.i], 11, '#ff9ad5', 1.4); audio.sfx('powerup', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.6 }); react(p, 'cheer', 1);
      if (best < 0) return;
      for (let x = 0; x < FW; x++) if (!p.grid[best][x]) { p.grid[best][x] = L.RAINBOW; p.rowPop[best] = 1; fx.particles.burst(wx(p, x), cellY(best), 1, { count: 10, speed: 4, up: 1, life: 0.7, size: 0.35, colors: [0xff4a5a, 0xffe14a, 0x5cff7a, 0x4a9cff, 0xb45cff], gravity: 3 }); }
    }
    function startClear(p, rows) {
      p.state = 'clear'; p.clearT = 0; p.clearRows = rows;
      audio.sfx(rows.length >= 4 ? 'bell' : 'ding', { vol: 0.6, rate: 1 + rows.length * 0.12 });
      for (const r of rows) for (let x = 0; x < FW; x++) fx.particles.burst(wx(p, x), cellY(r), 1, { count: 3, speed: 5, up: 0.6, life: 0.6, size: 0.3, colors: [TCOL[p.grid[r][x] || 1].getHex(), 0xffffff], gravity: 5 });
    }
    function flyCell(p, x, y, v, speed = 6) {
      p.deb.push({ x: cellX(x), y: cellY(y), vx: (x - 4.5) * 0.5 + rand(-2, 2), vy: rand(2, speed), r: 0, vr: rand(-6, 6), life: 0.9 + rnd() * 0.4, v });
      if (p.deb.length > 90) p.deb.shift();
    }
    function finishClear(p) {
      const rows = p.clearRows, n = rows.length;
      for (const r of rows) for (let x = 0; x < FW; x++) flyCell(p, x, r, p.grid[r][x]);
      const gold = rows.reduce((a, r) => a + p.grid[r].filter((v) => v === L.GOLD).length, 0);
      const shift = L.clearRows(p.grid, rows);
      for (let y = 0; y < FH; y++) if (shift[y]) p.rowOff[y] = shift[y];
      p.combo++; p.lines += n; stats.lines[p.i] += n;
      addScore(p, L.LINE_PTS[n] + (p.combo - 1) * 50 + gold * 50);
      const gar = L.garbageFor(n, p.combo);
      const px = FX[p.i], py = 8;
      const name = ['', 'ENKEL', 'DUBBEL!', 'DRIEDUBBEL!', 'TETRIS!!'][n];
      say(name + (p.combo >= 2 ? ` x${p.combo}` : ''), px, py + 1, n >= 2 ? '#ffe14a' : '#ffffff', 1 + n * 0.22);
      if (gold) say(`KIP-BONUS +${gold * 50}`, px, py - 1.2, '#ffe27a', 1.0);
      p.shake = 0.4 + n * 0.2; ctx.shake(0.12 + n * 0.1); react(p, 'cheer', 0.9);
      if (n >= 3) { hud.showBig(n >= 4 ? 'TETRIS!' : 'DRIEDUBBEL!', 900, n >= 4 ? '#ff9ad5' : '#ffe14a'); }
      if (gar > 0) {
        let g = gar; const off = Math.min(p.pend, g); p.pend -= off; g -= off;
        if (off) say(`-${off} rommel`, px, py - 2.4, '#8dff6a', 1.0);
        if (g > 0) sendGarbage(p, g);
      }
      if (n >= 4) { stats.tetris++; chickenFor(opp(p)); }
      for (let k = 0; k < 14; k++) fx.particles.emit(px + rand(-4, 4), py + rand(-3, 3), 1.5, rand(-3, 3), rand(1, 4), 0, { life: 1, size: 0.35, color: pick([0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a]), gravity: 4 });
      p.state = 'wait'; p.spawnDelay = 0.12; drawPlaque(p); refreshHud();
    }
    function sendGarbage(p, n) {
      const o = opp(p); if (o.state === 'dead') return;
      stats.garbageSent[p.i] += n;
      const pr = projs.find((q) => !q.on); if (!pr) { o.pend += n; return; }
      pr.on = true; pr.t = 0; pr.dur = 0.65; pr.x0 = FX[p.i]; pr.y0 = 8; pr.x1 = FX[o.i] + (o.i ? 6.2 : -6.2); pr.y1 = 2 + o.pend * 0.9; pr.n = n; pr.to = o.i; pr.s.visible = true;
      say(`+${n} RIJEN!`, FX[p.i], 6, '#ff7a6a', 1.2); audio.sfx('whoosh', { vol: 0.5, rate: 0.9 });
    }
    function applyGarbage(p) {
      if (p.pend <= 0) return;
      const n = Math.min(p.pend, 6); p.pend -= n;
      if (rnd() < 0.3) p.holeCol = Math.floor(rnd() * FW);
      const ok = L.addGarbage(p.grid, n, p.holeCol);
      for (let y = 0; y < FH; y++) p.rowOff[y] = -n;
      for (let k = 0; k < n; k++) p.rowPop[FH - 1 - k] = 1;
      p.shake = 0.9; ctx.shake(0.3); audio.sfx('thud', { vol: 0.8, rate: 0.6 }); audio.sfx('hurt', { vol: 0.3 }); react(p, 'scared', 1);
      say(`AUW! +${n}`, FX[p.i], 4, '#ff7a6a', 1.2);
      for (let x = 0; x < FW; x++) fx.particles.dust(wx(p, x), 0.3, 1, 1, 0xb0a8d0);
      if (!ok) topOut(p);
      refreshHud();
    }
    function chickenFor(p) {
      if (p.state === 'dead') return;
      p.front.push({ t: pick(L.TYPES), chicken: true });
      henS.on = true; henS.t = 0; henS.to = p.i; hen.group.visible = true; hen.group.position.set(0, 0.3, 3); audio.sfx('pop', { vol: 0.5, rate: 2 });
      hud.toast(`🐔 Een kippenblok voor ${names[p.i]}!`, 1800);
    }
    function topOut(p) {
      if (p.state === 'dead') return; p.state = 'dead'; p.piece = null; stats.topouts++;
      react(p, 'sad', 99); say('VOL!', FX[p.i], 8, '#ff5a5a', 2); audio.sfx('lose', { vol: 0.6 }); ctx.shake(0.8);
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (p.grid[y][x]) flyCell(p, x, y, p.grid[y][x], 9);
      p.heightPeak = FH; for (let y = 0; y < FH; y++) p.grid[y].fill(0);
    }

    // ---------- spelverloop ----------
    function decide(winner, why) {
      if (G.state === 'end') return;
      G.state = 'end'; G.t = 0; G.winner = winner; G.why = why; hud.setTimer(null);
      react(pl[winner], 'cheer', 99); if (pl[1 - winner].state !== 'dead') react(pl[1 - winner], 'sad', 99);
      audio.sfx('win', { vol: 0.6 }); celebrateFx(winner);
    }
    function celebrateFx(w) { for (let k = 0; k < 5; k++) fx.particles.burst(FX[w] + rand(-4, 4), rand(3, 13), 1.5, { count: 30, speed: 7, up: 1.2, life: 1.5, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); }
    function finishMatch() {
      if (finished) return; finished = true;
      const w = G.winner, wn = names[w], ln = names[1 - w], s = [pl[0].score, pl[1].score];
      let summary;
      if (G.why === 'topout') summary = pick([`${ln} zit vol tot aan de nok! ${wn} staat nog lekker ruim: ${s[w]} punten.`, `De blokken van ${ln} stapelen zich op tot het plafond. ${wn} wint met ${s[w]} punten.`, `Oeps, ${ln} heeft geen plek meer voor een blokje. ${wn} wint!`]);
      else if (G.why === 'sd') summary = pick([`Sudden death! Het scheelde geen blokje, maar ${wn} bleef het laagst en wint.`, `Na verlenging wint ${wn}: lager gestapeld is slimmer gestapeld.`]);
      else summary = pick([`${wn} had de meeste punten: ${s[w]} tegen ${s[1 - w]}. ${ln} zoekt nog een I-balk.`, `${wn} wint na 100 seconden met ${s[w]} punten. ${ln} heeft alles gegeven (${s[1 - w]}).`]);
      summary += ` Rijen: ${pl[0].lines} - ${pl[1].lines}.${stats.chickens ? ` Er liepen ${stats.chickens} kip(pen) door de blokken.` : ''}`;
      ctx.finishPvp({ winner: w, score: s, delay: 900, summary });
    }
    function timeUp() {
      const a = pl[0].score, b = pl[1].score;
      if (a !== b) { hud.showBig('TIJD!', 1100, '#ffe14a'); audio.sfx('bell', { vol: 0.7 }); decide(a > b ? 0 : 1, 'score'); }
      else { G.state = 'sd'; G.sdT = 0; hud.setTimer(null); hud.showBig('SUDDEN DEATH!', 1500, '#ff7a6a'); hud.toast('Gelijk! Elke 5 seconden komt er rommel bij: wie het laagst blijft wint.', 2800); audio.sfx('bad', { vol: 0.6 }); refreshHud(); }
    }
    function sdEnd() {
      const h = pl.map((p) => L.maxHeight(p.grid)), s = [pl[0].score, pl[1].score];
      const w = h[0] !== h[1] ? (h[0] < h[1] ? 0 : 1) : s[0] !== s[1] ? (s[0] > s[1] ? 0 : 1) : (rnd() < 0.5 ? 0 : 1);
      decide(w, 'sd');
    }

    const level = () => Math.min(11, Math.floor(T / 9));
    const interval = (p) => 0.85 * Math.pow(0.9, level()) / (pv.speed(p.i) * (tw === 'lowgrav' ? GRAV : 1)) / (G.state === 'sd' ? 1.5 : 1);
    function updatePlayer(p, dt) {
      p.poseT = Math.max(0, p.poseT - dt); p.shake = Math.max(0, p.shake - dt * 2.4); p.kick = Math.max(0, p.kick - dt * 4);
      p.frozenT = Math.max(0, p.frozenT - dt);
      // speciale animaties
      for (let y = 0; y < FH; y++) { p.rowOff[y] = damp(p.rowOff[y], 0, 13, dt); if (Math.abs(p.rowOff[y]) < 0.01) p.rowOff[y] = 0; p.rowPop[y] = Math.max(0, p.rowPop[y] - dt * 3); }
      for (let k = p.deb.length - 1; k >= 0; k--) { const d = p.deb[k]; d.life -= dt; d.vy -= 22 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt; if (d.life <= 0) p.deb.splice(k, 1); }
      const live = p.state === 'play' && G.state !== 'end';
      const hp = L.maxHeight(p.grid); p.danger = hp >= 12 ? 1 : hp >= 10 ? 0.4 : 0;
      p.boost = G.state === 'play' && G.timeLeft < 20 && pl[1 - p.i].score - p.score >= 100 ? 1.5 : 1;
      if (p.state === 'dead') return;
      if (p.state === 'clear') { p.clearT += dt; if (p.clearT >= 0.42) finishClear(p); return; }
      if (p.state === 'wait') { p.spawnDelay -= dt; if (p.spawnDelay <= 0 && G.state !== 'end') spawn(p); return; }
      if (!live || !p.piece) return;
      const inp = pv.input(p.i);
      const frozen = p.frozenT > 0;
      const mx = inp.x < -0.5 ? -1 : inp.x > 0.5 ? 1 : 0, soft = inp.y > 0.5 && !frozen;
      if (!frozen) {
        if (mx !== p.dir) { p.dir = mx; p.dasT = 0; p.dasRep = 0; if (mx) move(p, mx); }
        else if (mx) { p.dasT += dt; if (p.dasT > 0.16) { p.dasRep += dt; while (p.dasRep > 0.045) { p.dasRep -= 0.045; move(p, mx); } } }
        if (inp.aP) rotate(p);
        if (inp.bP) { hardDrop(p); return; }
      } else p.dir = 0;
      if (p.slideT > 0) { p.slideT -= dt; if (p.slideT <= 0) move(p, p.slideDir, true); }
      // kippenblok: huppelt zelf rond
      if (p.piece.chicken) { p.chickT -= dt; if (p.chickT <= 0) { p.chickT = 0.5 + rnd() * 0.3; const r = rnd(); if (r < 0.5) move(p, rnd() < 0.5 ? -1 : 1, true); else if (r < 0.75) rotate(p); audio.sfx('pop', { vol: 0.25, rate: 1.7 + rnd() * 0.5 }); fx.particles.burst(wx(p, p.piece.x + 1.5), cellY(p.piece.y), 1, { count: 3, speed: 2, up: 1, life: 0.6, size: 0.22, color: 0xfff6d8, gravity: 2 }); } }
      // zwaartekracht
      const iv = interval(p);
      p.gravT += dt * (soft ? 18 : 1);
      let grounded = L.collides(p.grid, p.piece.t, p.piece.r, p.piece.x, p.piece.y + 1);
      while (p.gravT >= iv && !grounded) { p.gravT -= iv; if (L.tryMove(p.grid, p.piece, 0, 1)) { if (soft) { p.softCells++; addScore(p, 1); } if (p.lockT > 0) p.lockT = 0; } grounded = L.collides(p.grid, p.piece.t, p.piece.r, p.piece.x, p.piece.y + 1); }
      if (grounded) { p.gravT = Math.min(p.gravT, iv); p.lockT += dt * (soft ? 4 : 1); if (p.lockT >= 0.5) lockCurrent(p); } else p.lockT = 0;
    }

    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      T += dt; G.t += dt;
      if (G.state === 'play') {
        G.timeLeft -= dt; hud.setTimer(G.timeLeft, 10);
        if (G.timeLeft <= 5 && G.timeLeft > 0 && Math.ceil(G.timeLeft) !== G.lastTick) { G.lastTick = Math.ceil(G.timeLeft); audio.sfx('tick', { vol: 0.5 }); }
        if (G.timeLeft <= 0) { G.timeLeft = 0; timeUp(); }
        // kippengimmick: de koploper krijgt af en toe een kippenblok
        G.chickenAt -= dt;
        if (G.chickenAt <= 0 && G.timeLeft > 12) { G.chickenAt = 26 + rnd() * 10; const lead = pl[0].score === pl[1].score ? pl[Math.floor(rnd() * 2)] : pl[0].score > pl[1].score ? pl[0] : pl[1]; chickenFor(lead); }
      } else if (G.state === 'sd') {
        G.sdT += dt; G.sdGar += dt;
        if (G.sdGar >= 5) { G.sdGar = 0; for (const p of pl) if (p.state !== 'dead') { p.pend += 1; } say('RIJ ERBIJ!', 0, 10, '#ff7a6a', 1.2); audio.sfx('bad', { vol: 0.4 }); refreshHud(); }
        if (G.sdT >= SD_MAX) sdEnd();
      }
      for (const p of pl) updatePlayer(p, dt);
      // projectielen met rommel
      for (const q of projs) {
        if (!q.on) continue; q.t += dt; const u = q.t / q.dur;
        q.s.position.set(lerp(q.x0, q.x1, u), lerp(q.y0, q.y1, u) + Math.sin(u * Math.PI) * 4, 1.8); q.s.scale.setScalar(2 + Math.sin(T * 30) * 0.3);
        if (Math.random() < 0.7) fx.particles.emit(q.s.position.x, q.s.position.y, 1.8, rand(-1, 1), rand(-1, 1), 0, { life: 0.4, size: 0.4, color: 0xff7a4a, gravity: 0 });
        if (u >= 1) { q.on = false; q.s.visible = false; const o = pl[q.to]; if (o.state !== 'dead') { o.pend += q.n; o.shake = Math.max(o.shake, 0.4); audio.sfx('bad', { vol: 0.5 }); fx.particles.burst(q.x1, q.y1, 1.5, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xff5a3a, 0xffd24a], gravity: 3 }); react(o, 'scared', 0.8); refreshHud(); } }
      }
      // einde: wie vol zit verliest
      if (G.state === 'play' || G.state === 'sd') {
        const d0 = pl[0].state === 'dead', d1 = pl[1].state === 'dead';
        if (d0 || d1) {
          let w;
          if (d0 && d1) w = pl[0].score !== pl[1].score ? (pl[0].score > pl[1].score ? 0 : 1) : (rnd() < 0.5 ? 0 : 1); else w = d0 ? 1 : 0;
          decide(w, 'topout');
        }
      }
      if (G.state === 'end' && G.t > 1.6) finishMatch();
      visuals(dt);
    }

    // ---------- tekenen ----------
    function colorOf(v, c, r, t, out) {
      if (v === L.RAINBOW) return out.setHSL(((t * 0.6 + c * 0.08 + r * 0.04) % 1 + 1) % 1, 0.9, 0.6);
      return out.copy(TCOL[v] || TCOL[1]);
    }
    function put(p, n, x, y, s, rz, col, gI) {
      dummy.position.set(x, y, 0); dummy.rotation.set(0, 0, rz); dummy.scale.setScalar(s); dummy.updateMatrix(); p.cellIM.setMatrixAt(n, dummy.matrix); p.cellIM.setColorAt(n, col);
      dummy.position.set(x, y, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(gI > 0 ? 2.5 * s : 0.0001); dummy.updateMatrix(); p.glowIM.setMatrixAt(n, dummy.matrix); p.glowIM.setColorAt(n, _c.copy(col).multiplyScalar(gI));
    }
    let hudT = 0;
    function drawField(p, dt, t) {
      let n = 0, ic = 0;
      const clearing = p.state === 'clear', fl = clearing ? Math.sin(p.clearT * 40) > 0 : false;
      const inClear = clearing ? new Set(p.clearRows) : null;
      const col = _col;
      for (let r = 0; r < FH; r++) {
        const off = p.rowOff[r], pop = p.rowPop[r];
        for (let c = 0; c < FW; c++) {
          const v = p.grid[r][c]; if (!v) continue;
          colorOf(v, c, r, t, col);
          let s = 1 + pop * 0.25;
          if (inClear && inClear.has(r)) { col.lerp(_w, fl ? 0.95 : 0.55); s = 1 + Math.sin(p.clearT / 0.42 * Math.PI) * 0.18; }
          if (p.frozenT > 0 && v !== L.RAINBOW) col.lerp(_ice, 0.18);
          put(p, n++, cellX(c), cellY(r) + off, s, 0, col, v === L.GARB ? 0.05 : 0.22 + (v === L.RAINBOW ? 0.3 : 0) + (inClear && inClear.has(r) ? 0.8 : 0));
        }
      }
      // vallend stuk (glad bewogen)
      const pc = p.piece;
      p.ghostIM.count = 0;
      if (pc) {
        p.vx = damp(p.vx, pc.x, 45, dt); p.vy = damp(p.vy, pc.y, 38, dt);
        const jolt = p.kick * -0.12;
        const cells = L.cellsOf(pc);
        cells.forEach(([cx, cy], k) => {
          const special = pc.kind && k === pc.sp;
          let v = L.TYPE_ID[pc.t]; if (pc.chicken) v = L.GOLD;
          colorOf(v, 0, 0, t, col);
          if (special) { if (pc.kind === 'bomb') col.setHex(0x2a1418).lerp(_w, 0.15 + 0.15 * Math.sin(t * 10)); else if (pc.kind === 'freeze') col.set(0x9fe8ff); else col.setHSL((t * 0.8) % 1, 0.9, 0.6); }
          if (p.frozenT > 0) col.lerp(_ice, 0.45);
          const x = cellX(pc.x + cx) + (p.vx - pc.x), y = cellY(pc.y + cy) - (p.vy - pc.y) + jolt;
          put(p, n++, x, y, 1.0 + (special ? 0.06 * Math.sin(t * 12) : 0), 0, col, special ? 1.1 : 0.7);
          if (special || (pc.chicken && k === 1)) { const s = p.icons[ic++]; s.visible = true; s.position.set(x, y, 0.62); s.scale.setScalar(special ? 0.95 : 0.8); const kind = special ? pc.kind : 'chicken'; if (s.userData.k !== kind) { s.userData.k = kind; s.material.map = iconTex(kind); s.material.needsUpdate = true; } }
        });
        // schaduw-stuk op de plek waar hij landt
        if (!p.frozenT || true) {
          const d = L.dropDistance(p.grid, pc);
          if (d > 0) { let g = 0; for (const [cx, cy] of cells) { dummy.position.set(cellX(pc.x + cx), cellY(pc.y + cy + d), 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.9); dummy.updateMatrix(); p.ghostIM.setMatrixAt(g, dummy.matrix); p.ghostIM.setColorAt(g, col.copy(TCOL[pc.chicken ? 9 : L.TYPE_ID[pc.t]])); g++; } p.ghostIM.count = g; p.ghostIM.instanceMatrix.needsUpdate = true; p.ghostIM.instanceColor.needsUpdate = true; }
        }
      }
      // vliegende cellen (opgeblazen of opgeruimd)
      for (const d of p.deb) { colorOf(d.v || 1, 0, 0, t, col); col.lerp(_w, 0.35); put(p, n++, d.x, d.y, clamp(d.life * 1.3, 0.05, 1), d.r, col, clamp(d.life * 1.4, 0, 1.1)); }
      p.cellIM.count = n; p.glowIM.count = n; p.cellIM.instanceMatrix.needsUpdate = true; p.glowIM.instanceMatrix.needsUpdate = true; p.cellIM.instanceColor.needsUpdate = true; p.glowIM.instanceColor.needsUpdate = true;
      // previews
      const NC = 0.62; let pn = 0;
      for (let k = 0; k < 3; k++) {
        const def = peek(p, k), cells = L.ROT[def.t][0];
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const [cx, cy] of cells) { x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); }
        const bx = (x0 + x1 + 1) / 2, by = (y0 + y1 + 1) / 2;
        const pcol = TCOL[def.chicken ? 9 : L.TYPE_ID[def.t]];
        cells.forEach(([cx, cy], q) => {
          const x = (cx + 0.5 - bx) * NC, y = NY[k] - (cy + 0.5 - by) * NC;
          dummy.position.set(x, y, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(NC * 0.96); dummy.updateMatrix(); p.preIM.setMatrixAt(pn, dummy.matrix);
          const special = def.pow && q === def.sp; p.preIM.setColorAt(pn, special ? (def.pow === 'bomb' ? col.set(0x2a1418) : def.pow === 'freeze' ? col.set(0x9fe8ff) : col.setHSL((t * 0.8) % 1, 0.9, 0.6)) : pcol);
          if (special && ic < p.icons.length) { const s = p.icons[ic++]; s.visible = true; s.position.set(x + NX[p.i] - FX[p.i], y, 0.95); s.scale.setScalar(0.6); if (s.userData.k !== def.pow) { s.userData.k = def.pow; s.material.map = iconTex(def.pow); s.material.needsUpdate = true; } }
          pn++;
        });
      }
      for (let k = ic; k < p.icons.length; k++) p.icons[k].visible = false;
      p.preIM.count = pn; p.preIM.instanceMatrix.needsUpdate = true; if (p.preIM.instanceColor) p.preIM.instanceColor.needsUpdate = true;
      // rommel-meter aan de buitenkant
      const side = p.i ? 1 : -1; let mn = 0;
      for (let k = 0; k < Math.min(p.pend, FH); k++) { dummy.position.set(side * 6.15, 0.5 + k * 0.97, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1 + (p.pend >= 8 ? Math.sin(t * 12) * 0.08 : 0)); dummy.updateMatrix(); p.meterIM.setMatrixAt(mn++, dummy.matrix); }
      p.meterIM.count = mn; p.meterIM.instanceMatrix.needsUpdate = true;
      // ijs-laag, schudden, gevaar-flits
      p.ice.material.opacity = p.frozenT > 0 ? 0.2 + 0.06 * Math.sin(t * 9) : 0;
      p.g.position.set(FX[p.i] + (Math.random() - 0.5) * p.shake * 0.5, (Math.random() - 0.5) * p.shake * 0.4 - p.kick * 0.08, 0);
      const dm = p.f.frameMat;
      if (p.danger > 0 && p.state !== 'dead') { const k = 0.5 + 0.5 * Math.sin(t * (p.danger > 0.8 ? 14 : 7)); dm.emissive.set(p.f.col).lerp(_red, k * p.danger); dm.emissiveIntensity = 0.6 + k * 0.9; }
      else { dm.emissive.set(p.f.col); dm.emissiveIntensity = 0.6; }
      // poppetje
      const c = p.c;
      c.pose = p.poseT > 0 ? p.pose : (p.state === 'dead' ? 'sad' : 'carry'); c.speed = 0; c.update(dt);
      p.holder.position.y = 0.25 + (p.poseT > 0 && p.pose === 'cheer' ? 0 : 0);
    }
    function visuals(dt) {
      for (const p of pl) drawField(p, dt, T);
      A.update(T, dt);
      if (henS.on) {
        henS.t += dt; const tx = NX[henS.to], u = Math.min(1, henS.t / 1.1);
        hen.group.position.set(lerp(0, tx, u), 0.3 + Math.abs(Math.sin(henS.t * 12)) * 0.25, 3 - u * 1.6); hen.speed = 1; hen.targetYaw = Math.atan2(tx, 0.001); hen.update(dt);
        if (henS.t > 1.4) { henS.on = false; hen.group.visible = false; for (let k = 0; k < 14; k++) fx.particles.emit(tx, 1, 1.5, rand(-3, 3), rand(1, 4), 0, { life: 1, size: 0.3, color: 0xfff6d8, gravity: 4 }); }
      }
      if (T - hudT > 0.2) { hudT = T; refreshHud(); }
      // camera
      const tv = Math.tan(camera.fov * Math.PI / 360), asp = camera.aspect;
      const d = Math.max(10.7 / tv, 16.8 / (tv * asp));
      camera.position.set(0, 9.2, d + 1.5); camera.lookAt(0, 8.4, 0);
    }
    function resultUpdate(dt) { T += dt; for (const p of pl) { p.poseT = 99; for (let k = p.deb.length - 1; k >= 0; k--) { const d = p.deb[k]; d.life -= dt; d.vy -= 22 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt; if (d.life <= 0) p.deb.splice(k, 1); } p.rowOff.fill(0); } visuals(dt); }
    function introUpdate(dt) { T += dt; for (const p of pl) { p.pose = 'carry'; p.poseT = 0; } visuals(dt); }
    refreshHud(); visuals(0.016);

    return {
      update, resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(FX[p.i], 8, 1.5, { count: 20, speed: 5, up: 1, life: 0.7, size: 0.35, colors: [0xffe14a, 0xffffff], gravity: 2 }); say('WISSEL!', 0, 10, '#ffe14a', 1.6); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m) return; const p = pl[i]; if (p.state === 'dead') return; p.score = Math.max(0, p.score - 150); p.pend += 1; p.frozenT = 1.0; drawPlaque(p); say('DEURMAN!', FX[i], 10, '#ff9a8a', 1.5); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); react(p, 'scared', 1.5); });
        refreshHud();
      },
      celebrate(w) { pl[w].pose = 'cheer'; pl[w].poseT = 99; pl[1 - w].pose = 'sad'; pl[1 - w].poseT = 99; celebrateFx(w); },
      dispose() {},
      dbg: {
        state: () => ({ T, g: G.state, timeLeft: G.timeLeft, finished, winner: G.winner, why: G.why, stats, sdT: G.sdT, p: pl.map((p) => ({ i: p.i, state: p.state, score: p.score, lines: p.lines, pend: p.pend, combo: p.combo, pieces: p.pieces, frozenT: p.frozenT, h: L.maxHeight(p.grid), piece: p.piece ? { t: p.piece.t, r: p.piece.r, x: p.piece.x, y: p.piece.y, kind: p.piece.kind, chicken: p.piece.chicken } : null, front: p.front.length, specials: p.specials, boost: p.boost })) }),
        pl, seq, setTime: (s) => { G.timeLeft = s; }, setScore: (i, s) => { pl[i].score = s; drawPlaque(pl[i]); }, addPend: (i, n) => { pl[i].pend += n; }, chicken: (i) => chickenFor(pl[i]), freeze: (i) => { pl[i].frozenT = 2; },
        fill: (i, rows, gaps = 1) => { const p = pl[i]; for (let k = 0; k < rows; k++) { const r = FH - 1 - k; for (let c = 0; c < FW; c++) p.grid[r][c] = (c < gaps) ? 0 : 1 + ((c + k) % 7); } },
        forcePiece: (i, def) => { const p = pl[i]; p.front.unshift(def); },
        setPiece: (i, def) => { const p = pl[i]; p.piece = L.newPiece(def); p.vx = p.piece.x; p.vy = p.piece.y; p.gravT = 0; p.lockT = 0; },
        topOut: (i) => topOut(pl[i]),
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { SX, buildWorld, boxGeo, blockTexture, glowTex, mastSegGeo, jibGeo, makeGull, JIB } from './stack_world.js';

// Torenbouw-Duel — twee kranen laten bouwblokken zwaaien, A = laten vallen. Alleen wat op de toren past blijft liggen (Stack-stijl),
// het uitstekende stuk breekt af. Perfect = het blok groeit + combo. Combo 3 = sabotage voor de ander. B = opgespaarde power-up.
// Mis je de toren (bijna) helemaal, dan stort hij in en verlies je. Anders wint de hoogste toren na 80 s (daarna sudden death).

const { TX, BH, DZ } = SX;
const MATCH_TIME = 80, AMP = 5.0, W0 = 4.0, WMAX = 4.8, MINW = 0.42, PERF = 0.25, HG = 3.6, CABLE = 2.2;
const FOUND_W = 5.6, FALL_G = 46, MAXB = 150;
const SAB = [
  { id: 'smal', name: 'SMAL BLOK!', col: '#ff8a6a' }, { id: 'snel', name: 'SNELLE KRAAN!', col: '#ffd24a' },
  { id: 'zwaai', name: 'DRONKEN KRAAN!', col: '#d9a8ff' }, { id: 'wind', name: 'WINDVLAAG!', col: '#9fe8ff' },
];
const POW = {
  slow: { name: 'Slakkenkraan', col: 0x6fd8ff, css: '#6fd8ff', say: 'SLAKKENKRAAN!' },
  glue: { name: 'Superlijm', col: 0x8dff6a, css: '#8dff6a', say: 'SUPERLIJM!' },
  wide: { name: 'Breed blok', col: 0xffd23f, css: '#ffd23f', say: 'EXTRA BREED!' },
  sand: { name: 'Zandzak', col: 0xd2a86a, css: '#d2a86a', say: 'ZANDZAK!' },
};
const POW_IDS = Object.keys(POW);

// Pictogrammetjes voor de power-ups (getekend, geen emoji nodig)
function powerIcon(id) {
  return canvasTex(96, 96, (g, w, h) => {
    const c = POW[id].css;
    g.fillStyle = 'rgba(20,12,40,.85)'; g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.fill();
    g.lineWidth = 6; g.strokeStyle = c; g.stroke();
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    if (id === 'slow') { g.beginPath(); for (let a = 0; a < 11; a += 0.2) { const r = 3 + a * 2.5; g.lineTo(46 + Math.cos(a) * r, 46 + Math.sin(a) * r); } g.stroke(); g.beginPath(); g.moveTo(66, 72); g.lineTo(30, 72); g.stroke(); }
    else if (id === 'glue') { g.beginPath(); g.moveTo(48, 18); g.bezierCurveTo(70, 46, 70, 70, 48, 72); g.bezierCurveTo(26, 70, 26, 46, 48, 18); g.fill(); }
    else if (id === 'wide') { g.beginPath(); g.moveTo(18, 48); g.lineTo(78, 48); g.moveTo(18, 48); g.lineTo(32, 36); g.moveTo(18, 48); g.lineTo(32, 60); g.moveTo(78, 48); g.lineTo(64, 36); g.moveTo(78, 48); g.lineTo(64, 60); g.stroke(); }
    else { g.beginPath(); g.moveTo(36, 24); g.lineTo(60, 24); g.lineTo(54, 34); g.bezierCurveTo(78, 48, 74, 76, 48, 76); g.bezierCurveTo(22, 76, 18, 48, 42, 34); g.closePath(); g.fill(); g.fillStyle = '#331a08'; g.fillRect(38, 26, 20, 5); }
  });
}
const _icons = {};
const iconTex = (id) => (_icons[id] ||= powerIcon(id));
const C_WIND = new THREE.Color(0xd8ffff), C_GLUE = new THREE.Color(0x9aff7a);
const hsl = (h, s = 0.6, l = 0.62) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);

export default {
  id: 'stack',
  name: 'Torenbouw-Duel',
  giver: 'Bouwbaas Bas',
  icon: '🏗️',
  mode: 'pvp',
  time: 80,
  twists: ['swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  music: 'game',
  blurb: 'Bouw de <b>hoogste kasteeltoren</b>! Laat je blok op het juiste moment vallen: wat <b>buiten de toren</b> hangt breekt af. Mis je alles, dan <b>stort je toren in</b>! Perfect stapelen = <b>combo</b>, en bij 3 in een rij krijgt je broer een gemene verrassing.',
  controls: ['{a} blok laten vallen', '{b} power-up gebruiken'],
  tip: 'Laat het blok vallen tussen de twee lijntjes. Pas op voor de meeuw: die hapt van de koploper!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const L = ctx.lights('day', { shadow: 30, center: [0, 8, 0], fogNear: 140, fogFar: 420 });
    L.sun.position.set(24, 40, 30);
    camera.fov = 50; camera.updateProjectionMatrix();
    const WORLD = buildWorld(ctx);

    // ---------- gedeelde materialen en geometrie ----------
    const blockMat = new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.72, metalness: 0.04 });
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const craneMat = mat(0xf2b01e, { metalness: 0.35, roughness: 0.55 });
    const darkMat = mat(0x3a3a4a, { metalness: 0.4 });
    const segG = mastSegGeo(), jibG = jibGeo();
    const dummy = new THREE.Object3D();
    const aimMat = new THREE.MeshBasicMaterial({ color: 0xfff6a0, transparent: true, opacity: 0.75, depthWrite: false });

    // ---------- spelers (torens + kranen) ----------
    const mkTag = (name, color) => { const t = canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(10,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(name, w / 2, hh / 2); c.fillStyle = color; c.fillText(name, w / 2, hh / 2); }); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(2.8, 1.05, 1); s.renderOrder = 15; return s; };
    const pl = [0, 1].map((i) => {
      const side = i ? 1 : -1, tx = side * TX, mx = side * (TX + 6.8);
      const sz = pv.size(i), w0 = W0 * Math.pow(sz, 0.55), wmax = WMAX * Math.pow(sz, 0.55);
      const im = new THREE.InstancedMesh(unitBox, blockMat, MAXB); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.count = 0; scene.add(im);
      im.setColorAt(0, new THREE.Color(0x9a9488));
      const mast = new THREE.InstancedMesh(segG, craneMat, 70); mast.frustumCulled = false; mast.castShadow = true; mast.position.set(mx, 0, -0.9); scene.add(mast);
      const crane = new THREE.Group(); crane.userData.dynamic = true; scene.add(crane);
      const jib = mesh(jibG, craneMat, { pos: [0, 0, -0.9] }); jib.scale.x = -side; crane.add(jib);
      // contragewicht, cabine, dakje
      crane.add(mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), mat(0x6a6a7a, { metalness: 0.3 }), { pos: [side * 2.0, 0.0, -0.9] }));
      const cab = new THREE.Group(); cab.position.set(0, 0.6, 0); crane.add(cab);
      cab.add(mesh(new THREE.BoxGeometry(2.9, 0.2, 2.4), darkMat, { pos: [0, 0, 0] }));
      cab.add(mesh(new THREE.BoxGeometry(2.9, 2.6, 0.15), mat(0xe8dcc0), { pos: [0, 1.4, -1.1] }));
      for (const sx of [-1, 1]) cab.add(mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), craneMat, { pos: [sx * 1.4, 1.4, 1.1] }));
      cab.add(mesh(new THREE.BoxGeometry(3.4, 0.22, 2.9), mat(PLAYER_COLORS[i], { flatShading: false }), { pos: [0, 2.8, 0] }));
      const c = makeBrother(i); const k = 2.3 / c.height; const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(k); holder.position.set(0, 0.1, 0.3); cab.add(holder);
      // bouwhelm
      const helm = new THREE.Group(); helm.add(mesh(new THREE.SphereGeometry(0.33, 12, 8, 0, TAU, 0, 1.5), mat(0xffd21f, { flatShading: false }), { pos: [0, 0.1, 0], cast: false }), mesh(new THREE.BoxGeometry(0.7, 0.04, 0.5), mat(0xffd21f), { pos: [0, 0.06, 0.3], cast: false })); helm.position.y = 0.1; c.head.add(helm);
      c.faceDir(0, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const banner = P.banner(PLAYER_COLORS[i], 2.4, 1.0); banner.position.set(-side * 0.3, 2.9, 0); banner.userData.dynamic = true; cab.add(banner);
      const tag = mkTag(names[i], i ? '#8fb8ff' : '#7dffb0'); scene.add(tag);
      // kabels, trolley en richtlijntjes
      const trolley = mesh(new THREE.BoxGeometry(1.1, 0.5, 0.8), darkMat, { cast: false }); trolley.userData.dynamic = true; scene.add(trolley);
      const cableM = new THREE.MeshBasicMaterial({ color: 0x2a2a34 });
      const cables = [0, 1].map(() => { const m = new THREE.Mesh(unitBox, cableM); m.userData.dynamic = true; scene.add(m); return m; });
      const aims = [0, 1].map(() => { const m = new THREE.Mesh(unitBox, aimMat); m.renderOrder = 5; scene.add(m); return m; });
      const ico = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex('slow'), transparent: true, depthTest: false })); ico.scale.set(1.7, 1.7, 1); ico.renderOrder = 16; ico.visible = false; scene.add(ico);
      const hcv = document.createElement('canvas'); hcv.width = 192; hcv.height = 96; const hcx = hcv.getContext('2d'); const htex = new THREE.CanvasTexture(hcv); htex.colorSpace = THREE.SRGBColorSpace;
      const htag = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, transparent: true, depthTest: false })); htag.scale.set(2.6, 1.3, 1); htag.renderOrder = 14; scene.add(htag);
      return {
        i, side, tx, mx, w0, wmax, im, mast, crane, jib, cab, c, holder, banner, tag, trolley, cables, aims, ico, htag, hcx, htex, helm,
        blocks: [{ x: tx, w: FOUND_W, col: new THREE.Color(0x9a9488) }],
        state: 'swing', ph: i ? Math.PI : 0, ccx: tx, cx: tx, cvx: 0, jy: HG + 3 + CABLE, hw: w0, hcol: new THREE.Color(1, 1, 1), hcolBase: new THREE.Color(1, 1, 1), spawnT: 9, idleT: 0, waitT: 0,
        fall: null, nextWide: false, combo: 0, maxCombo: 0, perfects: 0, trims: 0, power: null, pwPts: 0, sentSab: 0,
        slowN: 0, snelN: 0, zwaaiN: 0, glue: false, smal: false, windT: 0, windDir: 1, cspd: 1, zig: false, wideMark: false,
        wob: 0.1, wobPh: rand(0, 6), poseT: 0, pose: 'carry', collapseT: -1, tilt: 0, sdW: 0, sdDone: false, kick: 0, lastTag: -1,
      };
    });
    const floors = (p) => p.blocks.length - 1;
    const topY = (p) => p.blocks.length * BH;
    const topOf = (p) => p.blocks[p.blocks.length - 1];

    // ---------- brokstukken (instanced) ----------
    const NDEB = 260;
    const debIM = new THREE.InstancedMesh(unitBox, blockMat, NDEB); debIM.frustumCulled = false; debIM.castShadow = true; scene.add(debIM);
    const deb = Array.from({ length: NDEB }, () => ({ on: false, x: 0, y: -50, w: 1, h: 1, vx: 0, vy: 0, rz: 0, vr: 0, rest: false, age: 0, col: new THREE.Color() }));
    debIM.setColorAt(0, new THREE.Color(1, 1, 1));
    let debN = 0;
    dummy.position.set(0, -50, 0); dummy.scale.set(0.0001, 0.0001, 0.0001); dummy.updateMatrix(); for (let i = 0; i < NDEB; i++) debIM.setMatrixAt(i, dummy.matrix);
    function addDebris(x, y, w, h, col, vx, vy, vr) {
      const d = deb[debN]; debN = (debN + 1) % NDEB;
      d.on = true; d.x = x; d.y = y; d.w = w; d.h = h; d.vx = vx; d.vy = vy; d.rz = 0; d.vr = vr; d.rest = false; d.age = 0; d.col.copy(col);
      debIM.setColorAt(debN === 0 ? NDEB - 1 : debN - 1, d.col);
    }

    // ---------- toestand ----------
    const G = { state: 'play', t: 0, timeLeft: MATCH_TIME, loser: -1, winner: -1, slow: 1, slowT: 0, sdRound: 0, gullT: 16 + Math.random() * 6, why: '', note: '' };
    let T = 0, finished = false;
    const stats = { gulls: 0, sabs: 0, powers: 0, sands: 0, collapses: 0, perfects: [0, 0] };
    const camS = { d: 24, cy: 6 };
    const sands = Array.from({ length: 3 }, () => { const g = P.sack(2.2); g.visible = false; g.userData.dynamic = true; scene.add(g); return { g, on: false, t: 0, dur: 0.9, x0: 0, y0: 0, x1: 0, y1: 0, from: 0, to: 0 }; });
    const gull = { on: false, t: 0, side: 1, tgt: 0, bit: false, g: makeGull(), pos: new THREE.Vector3(), from: new THREE.Vector3() };
    gull.g.visible = false; gull.g.scale.setScalar(1.35); scene.add(gull.g);
    const windPuffs = [0, 0];

    const lead = () => floors(pl[0]) - floors(pl[1]);
    const behind = (p) => (p.i === 0 ? -lead() : lead());           // >0: p staat zoveel verdiepingen achter

    function refreshHud() {
      hud.setScore(`${names[0]} ${floors(pl[0])} – ${floors(pl[1])} ${names[1]}${G.state === 'sd' ? '  (SUDDEN DEATH)' : ''}`);
      for (const p of pl) {
        const bits = [`${floors(p)} hoog`];
        if (p.combo >= 2) bits.push(`combo ${p.combo}`);
        if (p.power) bits.push(`${POW[p.power].name}!`);
        if (p.glue) bits.push('lijm aan');
        if (p.windT > 0) bits.push('wind');
        hud.setPlayerInfo(p.i, bits.join(' · '));
      }
    }
    function drawHeightTag(p) {
      const f = floors(p); if (f === p.lastTag) return; p.lastTag = f;
      const g = p.hcx; g.clearRect(0, 0, 192, 96);
      g.fillStyle = 'rgba(20,12,40,.82)'; g.beginPath(); g.roundRect(6, 10, 180, 76, 20); g.fill();
      g.lineWidth = 6; g.strokeStyle = p.i ? '#8fb8ff' : '#7dffb0'; g.stroke();
      g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(`${f}`, 80, 50);
      g.font = 'bold 26px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#ffe14a'; g.fillText('m', 148, 58);
      p.htex.needsUpdate = true;
    }
    const react = (p, pose, secs = 1.2) => { p.pose = pose; p.poseT = secs; };
    const say = (text, x, y, col, s = 1.4) => fx.texts.add(text, x, y, 1.8, col, s);

    // ---------- bloktoestand ----------
    const blockColor = (p, k) => hsl((p.i ? 0.56 : 0.3) + k * 0.026, 0.58, 0.64);
    function spawnBlock(p, opts = {}) {
      const top = topOf(p);
      let w = top.w;
      p.zig = false; p.cspd = 1; p.wideMark = false;
      const tint = new THREE.Color(1, 1, 1);
      if (!opts.plain) {
        if (p.smal) { w *= 0.68; p.smal = false; tint.set(0xff9a8a); }
        if (p.snelN > 0) { p.cspd *= 1.55; p.snelN--; tint.set(0xffd24a); }
        if (p.zwaaiN > 0) { p.zig = true; p.zwaaiN--; tint.set(0xd9a8ff); }
        if (p.slowN > 0) { p.cspd *= 0.5; p.slowN--; tint.set(0x9fe8ff); }
      }
      p.hw = clamp(w, 0.7, p.wmax * 1.4);
      p.hcolBase = blockColor(p, floors(p) + 1).multiply(tint);
      p.state = 'swing'; p.spawnT = 0; p.idleT = 0;
      refreshHud();
    }
    function drop(p) {
      p.state = 'fall'; p.fall = { x: p.cx, y: p.jy - CABLE, vy: -2, w: p.hw, col: p.hcolBase.clone() };
      audio.sfx('whoosh', { vol: 0.35, rate: 1.1 });
    }

    function land(p) {
      const fb = p.fall, top = topOf(p), ty = topY(p);
      const lo = Math.max(fb.x - fb.w / 2, top.x - top.w / 2), hi = Math.min(fb.x + fb.w / 2, top.x + top.w / 2), ov = hi - lo;
      if (ov < MINW) { missed(p, fb); return; }
      const dx = fb.x - top.x; let nx, nw, perfect = false, glued = false;
      if (Math.abs(dx) <= PERF && !p.glue) { perfect = true; nx = top.x; nw = fb.w; }
      else if (p.glue) { glued = true; nx = fb.x; nw = fb.w; }
      else { nx = (lo + hi) / 2; nw = ov; }
      // afgebroken stukken (links en/of rechts)
      const cutCol = fb.col;
      if (!perfect && !glued) {
        const cl = (top.x - top.w / 2) - (fb.x - fb.w / 2), cr = (fb.x + fb.w / 2) - (top.x + top.w / 2);
        if (cl > 0.03) addDebris(fb.x - fb.w / 2 + cl / 2, ty + BH / 2, cl, BH, cutCol, -rand(1.2, 2.6), 0.5, -rand(1, 3));
        if (cr > 0.03) addDebris(fb.x + fb.w / 2 - cr / 2, ty + BH / 2, cr, BH, cutCol, rand(1.2, 2.6), 0.5, rand(1, 3));
        audio.sfx('wood', { vol: 0.35, rate: 0.9 }); audio.sfx('scrape', { vol: 0.25, rate: 1.3 });
      }
      p.fall = null;
      let growth = 0, balcony = false;
      if (perfect) { p.combo++; p.perfects++; stats.perfects[p.i]++; growth = p.combo >= 3 ? 0.4 : 0.22; nw = Math.min(p.wmax, nw + growth); }
      else { if (p.combo >= 3) say('COMBO WEG...', p.tx, ty + 3, '#ff9a8a', 1.1); p.combo = 0; p.trims++; }
      if (glued) { p.glue = false; say('PLAK!', nx, ty + 2.5, '#8dff6a', 1.4); audio.sfx('sizzle', { vol: 0.4 }); fx.particles.burst(nx, ty + 0.5, 1.6, { count: 20, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0x8dff6a, 0xffffff], gravity: 5 }); }
      if (!perfect && (floors(p) + 1) % 5 === 0 && nw < p.w0) { nw = Math.min(p.w0, nw + 0.6); balcony = true; }
      const b = { x: nx, w: nw, col: blockColor(p, floors(p) + 1) };
      p.blocks.push(b);
      p.im.setColorAt(p.blocks.length - 1, b.col); p.im.instanceColor.needsUpdate = true;
      // feedback
      if (balcony) { say('BALKON! +breder', nx, ty + 4.4, '#9fe8ff', 1.1); audio.sfx('sparkle', { vol: 0.4 }); }
      const dustCol = 0xe0d4b8;
      for (const sx of [-1, 1]) fx.particles.dust(nx + sx * nw / 2, ty + 0.05, 1.5, perfect ? 3 : 5, dustCol);
      p.kick = Math.min(1.5, 0.35 + (perfect ? 0 : (1 - nw / fb.w) * 2.2));
      if (perfect) {
        p.wob *= 0.55; react(p, 'cheer', 0.9);
        audio.sfx('ding', { vol: 0.6, rate: 1 + Math.min(p.combo, 8) * 0.1 }); audio.sfx('thud', { vol: 0.25, rate: 1.3 });
        fx.particles.ring(nx, ty + 0.5, 1.8, { count: 22, speed: 5 + p.combo * 0.4, color: 0xffe14a, size: 0.32, life: 0.55 });
        fx.particles.burst(nx, ty + 0.7, 1.8, { count: 10 + p.combo * 2, speed: 4, up: 1.4, life: 0.8, size: 0.3, colors: [0xffe14a, 0xffffff, 0xff9ad5], gravity: 6 });
        say(p.combo >= 2 ? `PERFECT x${p.combo}` : 'PERFECT!', nx, ty + 3, '#ffe14a', 1.2 + Math.min(p.combo, 6) * 0.1);
        ctx.shake(0.12 + Math.min(p.combo, 6) * 0.03);
      } else {
        p.wob = Math.min(2.4, p.wob + (1 - nw / fb.w) * 1.6 + (glued ? 0.7 : 0.1));
        react(p, nw / fb.w < 0.6 ? 'scared' : 'idle', 0.9);
        audio.sfx('thud', { vol: 0.5, rate: 0.9 + Math.random() * 0.2 });
        ctx.shake(0.16 + (1 - nw / fb.w) * 0.2);
        if (nw / fb.w < 0.55 && !glued) say('AUW!', nx, ty + 2.6, '#ff8a6a', 1.2);
      }
      if (nw < 1.3 && !perfect) { say('DUN!', p.tx, ty + 4.2, '#ffb36a', 1.0); audio.sfx('creak', { vol: 0.4 }); }
      // power-up opsparen: perfect telt dubbel, wie achterstaat krijgt het sneller
      p.pwPts += perfect ? 2 : 1;
      const need = behind(p) >= 3 ? 3 : 7;
      if (!p.power && p.pwPts >= need) { p.pwPts = 0; p.power = pick(POW_IDS); stats.powers++; audio.sfx('powerup', { vol: 0.6 }); say(POW[p.power].name, p.tx, ty + 5, POW[p.power].css, 1.2); hud.toast(`${names[p.i]} heeft een power-up: ${POW[p.power].name}! (druk B)`, 1800); }
      // combo 3, 6, 9... = sabotage voor de ander
      if (perfect && p.combo > 0 && p.combo % 3 === 0) sabotage(p);
      p.state = 'wait'; p.waitT = 0.28;
      if (G.state === 'sd') { p.sdDone = true; p.sdW = nw; }
      refreshHud();
    }

    function sabotage(p) {
      const q = pl[1 - p.i]; if (q.state === 'dead') return;
      const s = pick(SAB); stats.sabs++;
      if (s.id === 'smal') q.smal = true; else if (s.id === 'snel') q.snelN = 2; else if (s.id === 'zwaai') q.zwaaiN = 2;
      else { q.windT = 6; q.windDir = Math.random() < 0.5 ? -1 : 1; }
      hud.toast(`COMBO x${p.combo}! ${names[q.i]} krijgt: ${s.name}`, 2200);
      say(s.name, q.tx, topY(q) + 5.5, s.col, 1.5); audio.sfx('bad', { vol: 0.5 }); audio.sfx('whoosh', { vol: 0.4, rate: 0.7 });
      // een vliegend pijltje van mijn kraan naar de ander
      for (let k = 0; k < 14; k++) { const u = k / 14; fx.particles.emit(lerp(p.tx, q.tx, u), topY(p) + 4 + Math.sin(u * 3.14) * 3, 1.8, 0, 0.2, 0, { life: 0.5 + u * 0.7, size: 0.5, color: 0xffe14a, gravity: 0 }); }
      fx.particles.ring(q.tx, topY(q) + 3, 1.8, { count: 18, speed: 5, color: 0xff8a6a, size: 0.4, life: 0.6 });
      react(p, 'cheer', 1.2); react(q, 'scared', 1.4);
      if (q.state === 'swing' && s.id === 'snel') { q.cspd *= 1.55; q.snelN--; } else if (q.state === 'swing' && s.id === 'zwaai') { q.zig = true; q.zwaaiN--; }
      if (s.id === 'smal' && q.state === 'swing') { q.hw = Math.max(0.7, q.hw * 0.68); q.smal = false; q.hcolBase.multiply(new THREE.Color(1, 0.7, 0.65)); }
    }

    function missed(p, fb) {
      // geen overlap: het blok valt voorbij en de toren stort in
      p.fall = null;
      addDebris(fb.x, topY(p) - 0.4, fb.w, BH, fb.col, (fb.x > topOf(p).x ? 1 : -1) * 2, -1, rand(-3, 3));
      startCollapse(p);
    }
    function startCollapse(p) {
      if (p.state === 'dead') return;
      p.state = 'dead'; p.collapseT = 0; p.peak = floors(p); stats.collapses++;
      if (G.loser < 0 && G.state !== 'end') { G.loser = p.i; G.state = 'collapse'; G.t = 0; G.slow = 0.4; G.why = 'collapse'; hud.setTimer(null); }
      audio.sfx('creak', { vol: 0.8 }); audio.sfx('buzz', { vol: 0.4 });
      react(p, 'scared', 3); say('OEEEI...', p.tx, topY(p) + 3, '#ff8a6a', 1.8); hud.showBig('INGESTORT!', 1500, '#ff7a6a');
      const o = pl[1 - p.i]; if (o.state !== 'dead') react(o, 'cheer', 3);
    }
    function burstTower(p) {
      const n = p.blocks.length, dir = p.tx > 0 ? -1 : 1;
      for (let k = 1; k < n; k++) {
        const b = p.blocks[k], q = tiltPos(p, b.x, (k + 0.5) * BH);
        addDebris(q[0], Math.max(q[1], 0.5), b.w, BH, b.col, dir * (1.5 + k * 0.12) + rand(-1.5, 1.5), rand(0, 3), rand(-4, 4));
        if (k % 3 === 0) fx.particles.dust(q[0], Math.max(0.3, q[1] * 0.5), 1.8, 3, 0xd8ccb0);
      }
      p.blocks.length = 1;
      for (let k = 0; k < 40; k++) fx.particles.emit(p.tx + rand(-3, 3), rand(0.2, 4), 1.8, rand(-3, 3), rand(0.5, 3), rand(0, 2), { life: rand(1.2, 2.4), size: rand(0.9, 1.6), color: 0xd8ccb0, gravity: -0.2 });
      ctx.shake(1); audio.sfx('explode', { vol: 0.7 }); audio.sfx('thud', { vol: 0.8, rate: 0.6 }); audio.sfx('wood', { vol: 0.6, rate: 0.7 });
      refreshHud();
    }
    // positie van een blok als de toren (rond de voet) omkantelt
    const _tp = [0, 0];
    function tiltPos(p, x, y) {
      if (p.tilt <= 0) { _tp[0] = x; _tp[1] = y; return _tp; }
      const a = p.tilt * (p.tx > 0 ? -1 : 1), rx = x - p.tx;
      _tp[0] = p.tx + rx * Math.cos(a) - y * Math.sin(a); _tp[1] = rx * Math.sin(a) + y * Math.cos(a); return _tp;
    }

    // ---------- power-ups ----------
    function usePower(p) {
      if (!p.power) { audio.sfx('buzz', { vol: 0.2 }); return; }
      const id = p.power; p.power = null; const q = pl[1 - p.i];
      say(POW[id].say, p.tx, topY(p) + 5, POW[id].css, 1.5); audio.sfx('powerup', { vol: 0.7, rate: 1.2 }); react(p, 'cheer', 0.8);
      fx.particles.burst(p.cx, p.jy - CABLE, 1.8, { count: 22, speed: 4, up: 1, life: 0.7, size: 0.3, colors: [POW[id].col, 0xffffff], gravity: 3 });
      if (id === 'slow') { p.slowN = 3; if (p.state === 'swing') { p.cspd *= 0.5; p.slowN--; p.hcolBase.multiply(new THREE.Color(0.7, 0.9, 1)); } }
      else if (id === 'glue') { p.glue = true; if (p.state === 'swing') p.hcolBase.multiply(new THREE.Color(0.7, 1, 0.6)); }
      else if (id === 'wide') { if (p.state === 'swing') { p.hw = Math.min(p.wmax * 1.35, p.hw * 1.6 + 0.2); p.hcolBase.set(0xffe27a); } else p.nextWide = true; }
      else if (id === 'sand') { throwSand(p, q); }
      refreshHud();
    }
    function throwSand(p, q) {
      const s = sands.find((z) => !z.on); if (!s || q.state === 'dead') return;
      s.on = true; s.t = 0; s.dur = 0.85; s.x0 = p.cx; s.y0 = p.jy - CABLE; s.from = p.i; s.to = q.i; s.g.visible = true; stats.sands++;
      audio.sfx('throw', { vol: 0.5 });
    }
    function sandHit(s) {
      const q = pl[s.to]; s.on = false; s.g.visible = false;
      if (q.state === 'dead') return;
      const top = topOf(q), ty = topY(q) - BH / 2; const from = s.from === 1 ? 1 : -1;
      const cut = clamp(top.w - 1.0, 0, 0.7);
      say('ZANDZAK!', top.x, topY(q) + 2.5, '#d2a86a', 1.5); ctx.shake(0.5); audio.sfx('thud', { vol: 0.8, rate: 0.7 }); audio.sfx('hurt', { vol: 0.4 });
      fx.particles.burst(top.x, topY(q), 1.8, { count: 30, speed: 5, up: 1.3, life: 0.9, size: 0.4, colors: [0xd2a86a, 0xe8c88a, 0xffffff], gravity: 8 });
      q.wob = Math.min(2.4, q.wob + 1.2); react(q, 'scared', 1.4);
      if (cut > 0.15 && q.blocks.length > 1) {
        const lo = top.x - top.w / 2, hi = top.x + top.w / 2;
        if (from > 0) { addDebris(hi - cut / 2, ty + BH / 2, cut, BH, top.col, 2.2, 1.5, 3); top.w -= cut; top.x = (lo + hi - cut) / 2; }
        else { addDebris(lo + cut / 2, ty + BH / 2, cut, BH, top.col, -2.2, 1.5, -3); top.w -= cut; top.x = (lo + cut + hi) / 2; }
      }
    }

    // ---------- meeuw (gimmick): hapt een stuk van het blok van de koploper ----------
    function startGull() {
      const a = floors(pl[0]), b = floors(pl[1]);
      const t = a === b ? (Math.random() < 0.5 ? 0 : 1) : (a > b ? 0 : 1);
      gull.on = true; gull.t = 0; gull.tgt = t; gull.bit = false; gull.side = Math.random() < 0.5 ? -1 : 1; stats.gulls++;
      gull.g.visible = true; gull.from.set(gull.side * 36, topY(pl[t]) + 14, 3);
      hud.toast(`🐦 Een meeuw! Hij heeft zin in het blok van ${names[t]}!`, 2000); audio.sfx('pop', { vol: 0.5, rate: 1.6 });
    }
    function updateGull(dt) {
      if (!gull.on) return;
      gull.t += dt; const p = pl[gull.tgt]; const tx = p.cx, ty = p.jy - CABLE + 0.9;
      const g = gull.g; const prevX = g.position.x;
      if (gull.t < 1.9) { const u = smoothstep(0, 1, gull.t / 1.9); g.position.set(lerp(gull.from.x, tx, u), lerp(gull.from.y, ty, u) + Math.sin(u * 3.14) * 2, lerp(gull.from.z, 1.8, u)); }
      else {
        if (!gull.bit) {
          gull.bit = true;
          if (p.state === 'swing' && p.hw > 1.0) {
            const cut = Math.min(p.hw * 0.2, p.hw - 0.9); p.hw -= cut;
            say('MEEUW HAPT!', tx, ty + 2, '#ffffff', 1.5); audio.sfx('boing', { vol: 0.6 }); audio.sfx('pop', { vol: 0.6, rate: 0.7 }); ctx.shake(0.25);
            fx.particles.burst(tx, ty, 1.8, { count: 20, speed: 4, up: 1.5, life: 0.9, size: 0.28, colors: [0xffffff, 0xf0f4ff], gravity: 2 });
            addDebris(tx + p.hw / 2, ty - 1, cut, BH * 0.9, p.hcolBase, 2, 2, 4); react(p, 'scared', 1);
          } else say('MEEUW MIST!', tx, ty + 2, '#ffffff', 1.2);
          gull.from.copy(g.position);
        }
        const u = smoothstep(0, 1, (gull.t - 1.9) / 2.2);
        g.position.set(lerp(gull.from.x, -gull.side * 38, u), lerp(gull.from.y, gull.from.y + 14, u * u), lerp(gull.from.z, 3, u));
        if (gull.t > 4.2) { gull.on = false; g.visible = false; }
      }
      const dxm = g.position.x - prevX;
      g.rotation.y = lerp(g.rotation.y, dxm >= 0 ? Math.PI / 2 : -Math.PI / 2, 0.2); g.rotation.z = Math.sin(gull.t * 3) * 0.15;
      for (const w of g.userData.wings) w.p.rotation.z = w.sx * Math.sin(gull.t * 15) * 0.7;
    }

    // ---------- spelerupdate ----------
    const omegaOf = (p) => {
      let o = (G.state === 'sd' ? 1.9 : 1.15 + Math.min(floors(p), 40) * 0.04) * p.cspd * pv.speed(p.i);
      if (behind(p) >= 3) o *= 0.88;
      if (tw === 'drunk') o *= 1 + 0.4 * Math.sin(T * 1.9 + p.i * 2);
      return o;
    };
    function updatePlayer(p, dt) {
      if (p.state === 'dead') {
        p.collapseT += dt; p.jy = damp(p.jy, topY(p) + HG + CABLE, 3, dt); p.cx = damp(p.cx, p.tx, 2, dt);
        const u = clamp(p.collapseT / 0.95, 0, 1); p.tilt = u * u * 0.32; p.wob = 1.5 + u * 2;
        if (p.collapseT >= 0.95 && p.blocks.length > 1) burstTower(p);
        return;
      }
      p.poseT = Math.max(0, p.poseT - dt);
      p.kick = Math.max(0, p.kick - dt * 3);
      p.wob = Math.max(floors(p) > 8 ? 0.14 : 0.06, p.wob - dt * 0.35);
      if (topOf(p).w < 1.3 && floors(p) > 3) p.wob = Math.max(p.wob, 0.5);
      p.windT = Math.max(0, p.windT - dt);
      p.spawnT += dt;
      // kraan beweegt altijd, zolang de toren leeft
      p.ph += dt * omegaOf(p);
      p.ccx = damp(p.ccx, topOf(p).x, 3, dt);
      const s = Math.sin(p.ph);
      const target = p.ccx + AMP * (p.zig ? clamp((s + 0.45 * Math.sin(p.ph * 2.37 + 1.3)) / 1.2, -1.15, 1.15) : s);
      if (SLIP > 0.05) {
        const c = lerp(12, 1.7, SLIP / 0.85);
        p.cvx += (42 * (target - p.cx) - c * p.cvx) * dt; p.cx += p.cvx * dt;
      } else { p.cvx = (target - p.cx) / Math.max(dt, 1e-3); p.cx = target; }
      p.jy = damp(p.jy, topY(p) + HG + CABLE, 5, dt);
      if (p.windT > 0 && Math.random() < dt * 30) fx.particles.emit(p.tx - p.windDir * 14, topY(p) + rand(-3, 7), rand(0, 3), p.windDir * rand(14, 20), rand(-0.5, 0.5), 0, { life: 1.2, size: 0.25, color: Math.random() < 0.5 ? 0xffffff : 0xb8ffc8, gravity: 0, shrink: false });
      const inp = pv.input(p.i);
      const canAct = G.state === 'play' || G.state === 'sd';
      if (canAct && p.state === 'swing') {
        p.idleT += dt;
        if ((inp.aP && p.spawnT > 0.18) || p.idleT > (G.state === 'sd' ? 6 : 7.5)) drop(p);
      }
      if (canAct && inp.bP) usePower(p);
      if (p.state === 'fall') {
        const fb = p.fall;
        const wind = p.windT > 0 ? p.windDir * 2.8 : 0;
        fb.vy -= FALL_G * GRAV * dt; fb.y += fb.vy * dt; fb.x += wind * dt;
        if (fb.y - BH / 2 <= topY(p)) { fb.y = topY(p) + BH / 2; land(p); }
      } else if (p.state === 'wait') {
        p.waitT -= dt;
        if (p.waitT <= 0) {
          if (G.state === 'play') { spawnBlock(p); if (p.nextWide) { p.nextWide = false; p.hw = Math.min(p.wmax * 1.35, p.hw * 1.6 + 0.2); p.hcolBase.set(0xffe27a); } }
          else if (G.state === 'sd') p.state = 'idle';
          else p.state = 'idle';
        }
      }
    }

    // ---------- spelverloop ----------
    function timeUp() {
      G.state = 'timeup'; G.t = 0; hud.setTimer(null); hud.showBig('TIJD!', 1100, '#ffe14a'); audio.sfx('bell', { vol: 0.7 });
      for (const p of pl) if (p.state === 'swing') { p.state = 'idle'; fx.particles.burst(p.cx, p.jy - CABLE, 1.8, { count: 14, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 3 }); }
    }
    function startSD() {
      G.state = 'sd'; G.sdRound++; G.t = 0;
      if (G.sdRound === 1) { hud.showBig('SUDDEN DEATH!', 1500, '#ff7a6a'); hud.toast('Gelijk! Ieder 1 blok: wie het breedst blijft staan, wint!', 2600); audio.sfx('bad', { vol: 0.5 }); }
      else hud.toast('Nog steeds gelijk... nog een blok!', 1600);
      for (const p of pl) { p.sdDone = false; p.sdW = 0; p.cspd = 1; p.zig = false; spawnBlock(p, { plain: true }); }
      pl[0].ph = 0; pl[1].ph = Math.PI;
      refreshHud();
    }
    function decide(winner, why) {
      if (G.state === 'end') return;
      G.state = 'end'; G.t = 0; G.slow = 1; G.winner = winner; G.why = why; hud.setTimer(null);
      const w = pl[winner], l = pl[1 - winner];
      react(w, 'cheer', 99); if (l.state !== 'dead') react(l, 'sad', 99);
      audio.sfx('win', { vol: 0.6 }); celebrateFx(winner);
    }
    function celebrateFx(w) {
      const p = pl[w];
      for (let k = 0; k < 5; k++) fx.particles.burst(p.tx + rand(-3, 3), topY(p) + rand(3, 9), 1.8, { count: 36, speed: 7, up: 1.2, life: 1.5, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
    }
    function finishMatch() {
      if (finished) return; finished = true;
      const w = G.winner, f = pl.map((p) => (p.state === 'dead' ? p.peak : floors(p))); const wn = names[w], ln = names[1 - w], lns = /s$/i.test(ln) ? ln + "'" : ln + 's';
      let summary;
      if (G.why === 'collapse') summary = pick([`De toren van ${ln} stort in als een bord pudding! ${wn} bouwt vrolijk door: ${f[w]} verdiepingen.`, `KABOEM! ${ln} miste het hele blok en de toren ligt in de modder. ${wn} wint met ${f[w]} verdiepingen.`, `${lns} toren deed een dansje en viel om. ${wn} staat nog fier overeind (${f[w]} hoog).`]);
      else if (G.why === 'sd') summary = pick([`Sudden death! ${wn} stapelde het breedste blok en ${ln} wiebelt nog na.`, `Precies gelijk, dus nog één blok. ${wn} zette hem het beste neer!`]);
      else summary = pick([`${wn} bouwde het hoogst: ${f[w]} verdiepingen tegen ${f[1 - w]}. ${ln} bewondert het uitzicht van beneden.`, `${wn} is de Bouwbaas van de dag met ${f[w]} verdiepingen!`, `De meeuw koos de koploper, maar ${wn} bleef toch bovenaan (${f[w]} tegen ${f[1 - w]}).`]);
      const extra = ` Perfecte blokken: ${stats.perfects[0]} - ${stats.perfects[1]}.`;
      ctx.finishPvp({ winner: w, score: f, delay: 900, summary: summary + extra });
    }
    function checkEnd() {
      if (G.state === 'timeup') {
        if (pl.every((p) => p.state !== 'fall' && p.state !== 'wait')) {
          const a = floors(pl[0]), b = floors(pl[1]);
          if (a !== b) decide(a > b ? 0 : 1, 'height'); else startSD();
        }
      } else if (G.state === 'sd') {
        if (pl.every((p) => p.sdDone)) {
          const d = pl[0].sdW - pl[1].sdW;
          if (Math.abs(d) > 0.03) decide(d > 0 ? 0 : 1, 'sd');
          else if (G.sdRound >= 5) decide(Math.random() < 0.5 ? 0 : 1, 'sd');
          else { G.state = 'sdwait'; G.t = 0; }
        }
      } else if (G.state === 'sdwait') { if (G.t > 1.3) startSD(); }
    }

    // ---------- visuals ----------
    function swayOf(p, k, t) {
      if (k < 2) return 0;
      const a = p.wob * Math.pow(k / 16, 1.25) * 0.42 * Math.sin(t * 2.7 + k * 0.07 + p.wobPh);
      return clamp(a, -1.7, 1.7);
    }
    function setBlock(im, n, x, y, w, h, rz) { dummy.position.set(x, y, 0); dummy.rotation.set(0, 0, rz); dummy.scale.set(w, h, DZ); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix); }
    function setCable(m, x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.set(0, 0, Math.atan2(-dx, dy)); m.scale.set(0.07, len, 0.07); }
    function visuals(dt) {
      const t = T;
      for (const p of pl) {
        const im = p.im, n0 = p.blocks.length; let n = 0;
        for (let k = 0; k < n0; k++) {
          const b = p.blocks[k], sw = swayOf(p, k, t); let rz = sw * 0.03, x = b.x + sw, y = (k + 0.5) * BH;
          if (p.tilt > 0 && k > 0) { const q = tiltPos(p, x, y); x = q[0]; y = q[1]; rz += p.tilt * (p.tx > 0 ? -1 : 1); }
          setBlock(im, n++, x, y, b.w, BH * 0.995, rz);
        }
        // blok aan de kraan / vallend blok
        const showHang = p.state === 'swing', showFall = p.state === 'fall' && p.fall;
        if (showHang) {
          const su = clamp(p.spawnT / 0.3, 0, 1), pop = su < 1 ? 1 + Math.sin(su * 3.14) * 0.12 : 1;
          const hy = p.jy - CABLE - (1 - smoothstep(0, 1, su)) * 1.4;
          const tilt = clamp(-p.cvx * 0.012, -0.12, 0.12) + (p.zig ? Math.sin(t * 5) * 0.05 : 0);
          setBlock(im, n, p.cx, hy, p.hw * pop, BH * smoothstep(0, 0.5, su) * pop, tilt);
          p.hcol.copy(p.hcolBase); if (p.windT > 0) p.hcol.lerp(C_WIND, 0.15);
          if (p.glue) p.hcol.lerp(C_GLUE, 0.45 + 0.25 * Math.sin(t * 8));
          im.setColorAt(n, p.hcol); n++;
        } else if (showFall) {
          setBlock(im, n, p.fall.x, p.fall.y, p.fall.w, BH, 0); im.setColorAt(n, p.fall.col); n++;
        }
        im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        // kraan
        const jy = p.jy, mh = jy;
        const segs = Math.min(70, Math.ceil(mh / 2) + 1);
        for (let k = 0; k < segs; k++) { dummy.position.set(0, k * 2, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); p.mast.setMatrixAt(k, dummy.matrix); }
        p.mast.count = segs; p.mast.instanceMatrix.needsUpdate = true;
        p.crane.position.set(p.mx, jy, 0);
        p.cab.position.y = 0.6;
        const lean = p.tilt > 0 ? 0 : 0;
        const tr = p.trolley; tr.position.set(p.cx, jy + 0.1, -0.9); tr.visible = p.state !== 'dead';
        const by = jy - CABLE + 0.5;
        const bw = Math.min(p.hw, 4) * 0.4;
        if (showHang) { setCable(p.cables[0], p.cx, jy - 0.15, p.cx - bw, by); setCable(p.cables[1], p.cx, jy - 0.15, p.cx + bw, by); for (const c of p.cables) c.visible = true; }
        else for (const c of p.cables) c.visible = false;
        p.cables.forEach((c) => { c.position.z = -0.4; });
        // richtlijntjes
        const top = topOf(p), ty = topY(p);
        const showAim = p.state === 'swing' || p.state === 'wait';
        for (let s = 0; s < 2; s++) {
          const a = p.aims[s]; a.visible = showAim; const ex = top.x + (s ? 1 : -1) * top.w / 2 + swayOf(p, p.blocks.length - 1, t);
          a.position.set(ex, ty + HG * 0.5 + 0.2, DZ / 2 + 0.05); a.scale.set(0.13, HG + 0.4, 0.02);
        }
        // poppetje
        const c = p.c;
        c.pose = p.poseT > 0 ? p.pose : (p.state === 'swing' ? 'carry' : p.state === 'dead' ? 'scared' : 'idle');
        c.speed = 0; c.update(dt);
        p.holder.position.y = 0.1; p.holder.rotation.z = Math.sin(t * 2 + p.i) * 0.02;
        P.animateBanner(p.banner, t);
        p.tag.position.set(p.mx, jy + 5.6, 1); p.tag.visible = true;
        // power-up icoon
        if (p.power) { p.ico.visible = true; if (p.ico.userData.id !== p.power) { p.ico.userData.id = p.power; p.ico.material.map = iconTex(p.power); p.ico.material.needsUpdate = true; } p.ico.position.set(p.mx - p.side * 0.2, jy + 3.7 + Math.sin(t * 4 + p.i) * 0.15, 1.5); p.ico.scale.setScalar(1.5 + Math.sin(t * 6) * 0.08); } else p.ico.visible = false;
        // hoogte-tag naast de toren (binnenkant)
        drawHeightTag(p);
        p.htag.position.set(top.x - p.side * (top.w / 2 + 1.9), ty + 0.4 + (p.state === 'dead' ? -ty + 1 : 0), 1.8); p.htag.visible = p.state !== 'dead' || true;
      }
      // brokstukken
      for (let i = 0; i < NDEB; i++) {
        const d = deb[i];
        if (!d.on) { if (d.y > -40) { d.y = -50; dummy.position.set(0, -50, 0); dummy.scale.set(0.0001, 0.0001, 0.0001); dummy.updateMatrix(); debIM.setMatrixAt(i, dummy.matrix); } continue; }
        if (!d.rest) {
          d.age += dt; d.vy -= 32 * GRAV * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rz += d.vr * dt;
          const r = d.h / 2 + 0.2;
          if (d.y < r) { d.y = r; if (Math.abs(d.vy) > 2.5) { d.vy *= -0.3; fx.particles.dust(d.x, 0.1, 1.8, 2, 0xd8ccb0); } else { d.vy = 0; } d.vx *= 0.6; d.vr *= 0.5; if (Math.abs(d.vx) < 0.15 && Math.abs(d.vy) < 0.1) { d.rest = true; d.vr = 0; } }
        } else d.age += dt;
        if (d.age > 14) { d.on = false; continue; }
        const sc = d.age > 12.5 ? (14 - d.age) / 1.5 : 1;
        dummy.position.set(d.x, d.y, 0); dummy.rotation.set(0, 0, d.rz); dummy.scale.set(d.w * sc, d.h * sc, DZ * sc); dummy.updateMatrix(); debIM.setMatrixAt(i, dummy.matrix);
      }
      debIM.instanceMatrix.needsUpdate = true; if (debIM.instanceColor) debIM.instanceColor.needsUpdate = true;
      // zandzakken
      for (const s of sands) {
        if (!s.on) continue; s.t += dt; const u = s.t / s.dur, q = pl[s.to], top = topOf(q);
        const x1 = top.x, y1 = topY(q) + 0.6;
        s.g.position.set(lerp(s.x0, x1, u), lerp(s.y0, y1, u) + Math.sin(u * 3.14) * 6, 1.4); s.g.rotation.z += dt * 9;
        if (u >= 1) sandHit(s);
      }
      updateGull(dt);
    }
    function updateCamera(dt, snap) {
      const tv = Math.tan(camera.fov * Math.PI / 360), asp = camera.aspect;
      let hi = 0, lo = 1e9;
      for (const p of pl) { const ty = p.state === 'dead' && p.blocks.length <= 1 ? 1 : topY(p); hi = Math.max(hi, ty + HG + 10.5); lo = Math.min(lo, ty); }
      lo = lo < 8 ? -1.2 : lo - 5;
      const needH = Math.max(hi - lo, 14), needW = 36;
      const d = Math.max(needH / 2 / tv, needW / 2 / (tv * asp));
      const vis = 2 * d * tv; const cy = Math.max(lo + vis / 2, (hi + lo) / 2 - 0);
      const k = snap ? 1 : 1 - Math.exp(-2.4 * dt);
      camS.d = lerp(camS.d, d, k); camS.cy = lerp(camS.cy, cy, k);
      camera.position.set(Math.sin(T * 0.25) * 0.8, camS.cy + 1.2, camS.d);
      camera.lookAt(0, camS.cy, 0);
      L.sun.position.set(24, camS.cy + 40, 30); L.sun.target.position.set(0, camS.cy, 0); L.sun.target.updateMatrixWorld();
    }

    // ---------- hoofd-update ----------
    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      T += dt; G.t += dt;
      if (G.state === 'collapse') G.slow = damp(G.slow, G.t > 1.4 ? 0.85 : 0.45, 3, dt);
      dt *= G.slow;
      if (G.state === 'play') {
        G.timeLeft -= dt; hud.setTimer(G.timeLeft, 10);
        if (Math.ceil(G.timeLeft) !== G.lastTick && G.timeLeft <= 5 && G.timeLeft > 0) { G.lastTick = Math.ceil(G.timeLeft); audio.sfx('tick', { vol: 0.5 }); }
        if (G.timeLeft <= 0) { G.timeLeft = 0; timeUp(); }
        G.gullT -= dt; if (G.gullT <= 0 && !gull.on && G.timeLeft > 8) { startGull(); G.gullT = 16 + Math.random() * 8; }
        if (G.timeLeft < 15 && !G.lastWide) { G.lastWide = true; const w = pl[behind(pl[0]) > 0 ? 0 : 1]; if (Math.abs(lead()) >= 2 && w.state !== 'dead') { w.nextWide = w.state !== 'swing'; if (w.state === 'swing') { w.hw = Math.min(w.wmax * 1.35, w.hw * 1.5 + 0.2); w.hcolBase.set(0xffe27a); } say('GOUDEN BLOK!', w.tx, topY(w) + 5, '#ffd23f', 1.5); hud.toast(`✨ ${names[w.i]} krijgt een gouden breed blok (inhaalkans)!`, 2200); audio.sfx('sparkle', { vol: 0.6 }); } }
      }
      const order = Math.random() < 0.5 ? [pl[0], pl[1]] : [pl[1], pl[0]];
      for (const p of order) updatePlayer(p, dt);
      if (G.state === 'collapse' && G.t > 2.9) { decide(1 - G.loser, 'collapse'); }
      checkEnd();
      if (G.state === 'end' && !finished && G.t > 1.5) finishMatch();
      refreshHudMaybe();
      visuals(dt); WORLD.update(T); updateCamera(dt);
    }
    let hudT = 0; const refreshHudMaybe = () => { if (T - hudT > 0.25) { hudT = T; refreshHud(); } };
    function resultUpdate(dt) {
      T += dt; for (const p of pl) { p.poseT = 99; p.wob = Math.max(0.08, p.wob - dt); }
      visuals(dt); WORLD.update(T); updateCamera(dt);
      if (Math.random() < dt * 3 && G.winner >= 0) fx.particles.burst(pl[G.winner].tx + rand(-3, 3), topY(pl[G.winner]) + rand(3, 9), 1.8, { count: 14, speed: 5, up: 1.2, life: 1.2, size: 0.4, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a], gravity: 5 });
    }
    function introUpdate(dt) { T += dt; for (const p of pl) { p.pose = 'carry'; p.poseT = 0; p.ph += dt * 1.0; p.cx = p.tx + AMP * 0.8 * Math.sin(p.ph); p.spawnT = 9; } visuals(dt); WORLD.update(T); updateCamera(dt, T < 0.1); }

    for (const p of pl) spawnBlock(p);
    refreshHud(); visuals(0.016); updateCamera(0.016, true);

    return {
      update, resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(p.cx, p.jy - CABLE, 1.8, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); say('WISSEL!', 0, camS.cy, '#ffe14a', 1.5); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const p = pl[i]; if (p.state === 'dead') return;
          if (p.blocks.length > 2) { const b = p.blocks.pop(); const ty = topY(p); addDebris(b.x, ty + BH / 2, b.w, BH, b.col, rand(-3, 3), 3, rand(-4, 4)); p.combo = 0; if (p.state === 'swing') spawnBlock(p); }
          say('DEURMAN!', p.tx, topY(p) + 3, '#ff9a8a', 1.5); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); react(p, 'scared', 1.5);
        }); refreshHud();
      },
      celebrate(w) { pl[w].pose = 'cheer'; pl[w].poseT = 99; pl[1 - w].pose = 'sad'; pl[1 - w].poseT = 99; celebrateFx(w); },
      dispose() {},
      dbg: {
        state: () => ({
          T, g: G.state, timeLeft: G.timeLeft, finished, loser: G.loser, winner: G.winner, why: G.why, stats, sdRound: G.sdRound,
          p: pl.map((p) => ({ i: p.i, state: p.state, floors: floors(p), cx: p.cx, ccx: p.ccx, topX: topOf(p).x, topW: topOf(p).w, hw: p.hw, combo: p.combo, perfects: p.perfects, power: p.power, tx: p.tx, spawnT: p.spawnT, fallY: p.fall ? p.fall.y : null, topY: topY(p), cvx: p.cvx, glue: p.glue, windT: p.windT, wob: p.wob, sdDone: p.sdDone })),
        }),
        setTime: (s) => { G.timeLeft = s; }, give: (i, id) => { pl[i].power = id; refreshHud(); }, startGull, sabotage: (i) => sabotage(pl[i]), collapse: (i) => startCollapse(pl[i]),
        setHeight: (i, n) => { const p = pl[i]; while (p.blocks.length - 1 < n) { const k = p.blocks.length; p.blocks.push({ x: p.tx, w: p.w0, col: blockColor(p, k) }); p.im.setColorAt(k, p.blocks[k].col); } if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true; if (p.state === 'swing') spawnBlock(p); refreshHud(); },
        pl,
      },
    };
  },
};


import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { ARENA, KINDS, makeObstacle, makeBomb, makePeel, makeGift, makeUfo, glowSprite, scorchTexture, buildArena } from './tag_world.js';

// Bommentikkertje — duel: hete-aardappel op een kasteelplein. Eén broer heeft de bom (lont tikt, steeds sneller); tik de ander aan en de bom gaat over.
//  * wie de bom heeft is iets sneller; A = sprint (houd in) en duik (tik), B = bananenschil neerleggen
//  * ontploft de bom, dan verliest de houder een leven (3 levens) en wordt de arena opgeruimd
//  * gimmicks: kippen stelen de bom en bezorgen hem bij de ander, een ufo verplaatst obstakels, kadootjes met power-ups
//  * na 85 s: noodbom, de eerstvolgende ontploffing beslist het duel

const { AX, AZ } = ARENA;
const LIVES = 3, MATCH_T = 85, BLAST_R = 6.6, START_X = 11.2;
const FUSE = [14, 12.6, 11.4, 10.4, 9.6, 9];
const RUN = 7.3, RUN_HOLD = 8.0, SPRINT = 1.5, DIVE_V = 15.5, DIVE_T = 0.26;
const GIFTS = {
  speed: { name: 'TURBOSCHOENEN!', css: '#4aa8ff', hex: 0x4aa8ff, w: 30 },
  teleport: { name: 'TELEPORT!', css: '#b58aff', hex: 0xb58aff, w: 25 },
  swap: { name: 'BOMMEN-WISSEL!', css: '#ff6ad8', hex: 0xff6ad8, w: 25 },
  shield: { name: 'SCHILD!', css: '#ffd23f', hex: 0xffd23f, w: 25 },
};
// kleur per spelers-id (Wes groen, Jor blauw, Juul oranje): hex, css voor de vloer, lichte tekstkleur
const HEX_ID = [0x35c46f, 0x4a8cff, 0xff9a3a], CSS_ID = ['rgba(60,200,120,1)', 'rgba(70,140,255,1)', 'rgba(255,154,58,1)'], LITE_ID = ['#7dffb0', '#8fb8ff', '#ffc27a'], LITEHEX_ID = [0x7dffb0, 0x8fb8ff, 0xffc27a];
const LAYOUT = [['fountain', 0, 0], ['pillar', 6.5, 4.6], ['pillar', 6.5, -4.6], ['pillar', -6.5, 4.6], ['pillar', -6.5, -4.6], ['crates', 8.2, 0], ['crates', -8.2, 0], ['barrels', 3.2, 6.3], ['barrels', -3.2, 6.3], ['barrels', 3.2, -6.3], ['barrels', -3.2, -6.3], ['bush', 12.4, 5.4], ['bush', -12.4, 5.4], ['bush', 12.4, -5.4], ['bush', -12.4, -5.4]];
const OBST_KINDS = ['pillar', 'barrels', 'crates', 'bush'];

function iconTex(kind) {
  return canvasTex(128, 128, (g) => {
    const col = '#' + GIFTS[kind].hex.toString(16).padStart(6, '0');
    g.translate(64, 64); g.fillStyle = 'rgba(20,10,30,.88)'; g.beginPath(); g.arc(0, 0, 58, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.stroke();
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'speed') { g.beginPath(); g.moveTo(10, -40); g.lineTo(-20, 6); g.lineTo(0, 6); g.lineTo(-10, 40); g.lineTo(24, -8); g.lineTo(4, -8); g.closePath(); g.fill(); }
    else if (kind === 'teleport') { g.beginPath(); for (let a = 0; a < 14; a += 0.2) { const r = 4 + a * 3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
    else if (kind === 'swap') { g.beginPath(); g.moveTo(-30, -12); g.lineTo(26, -12); g.moveTo(14, -26); g.lineTo(28, -12); g.lineTo(14, 2); g.moveTo(30, 14); g.lineTo(-26, 14); g.moveTo(-14, 0); g.lineTo(-28, 14); g.lineTo(-14, 28); g.stroke(); }
    else { g.beginPath(); g.moveTo(0, -38); g.lineTo(32, -26); g.lineTo(28, 10); g.quadraticCurveTo(14, 32, 0, 40); g.quadraticCurveTo(-14, 32, -28, 10); g.lineTo(-32, -26); g.closePath(); g.fill(); }
  });
}
const nameTex = (pp) => canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(10,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(pp.name, w / 2, hh / 2); c.fillStyle = pp.css; c.fillText(pp.name, w / 2, hh / 2); });

export default {
  id: 'tag',
  name: 'Bommentikkertje',
  giver: 'Bommenbaas Boris',
  icon: '💣',
  mode: 'pvp',
  players: [2, 3],
  time: 90,
  music: 'game_fast',
  blurb: 'Eén broer heeft de <b>bom</b>! Tik de ander aan en de bom gaat over. Ontploft hij in jouw handen, dan verlies je een <b>leven</b> (je hebt er 3). Wie de bom heeft rent iets sneller. Pas op voor <b>kippen</b> en de <b>ufo</b>! Met <b>Juul</b> erbij is het vrij voor allen: wie zijn drie levens kwijt is, ligt eruit.',
  controls: ['{move} rennen', '{a} sprint (houd in) en duik (tik)', '{b} bananenschil neerleggen'],
  tip: 'Een geduikte tik reikt verder. Leg een schil achter je neer: wie erop stapt, glijdt weg! Na een knal krijgt wie voor staat de volgende bom.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const quality = ctx.renderer && ctx.renderer.shadowMap && ctx.renderer.shadowMap.enabled;

    const L = ctx.lights('night', { shadow: 20, center: [0, 0, 0], fogNear: 55, fogFar: 150 });
    L.hemi.intensity = 1.2; L.hemi.color.set(0xb8c4ff); L.hemi.groundColor.set(0x6a5a8a);
    L.sun.color.set(0xdfe6ff); L.sun.intensity = 2.0; L.sun.position.set(-10, 30, 14);
    camera.fov = 46; camera.updateProjectionMatrix();
    const NP = players.length;
    const colorsHex = players.map((p) => HEX_ID[p.id]), colorsCss = players.map((p) => CSS_ID[p.id]);
    const lite = (i) => LITE_ID[players[i].id], liteHex = (i) => LITEHEX_ID[players[i].id];
    // startplekken: 2 spelers links/rechts; 3 spelers een (bijna gelijkzijdige) driehoek
    const STARTS = NP === 2 ? [[-START_X, 0], [START_X, 0]] : [[-8, 6], [8, 6], [0, -7]];
    const world = buildArena(ctx, colorsCss, colorsHex, STARTS);

    // ---------------- spelers ----------------
    const pl = players.map((pp, i) => {
      const c = makeBrother(i), size = pv.size(i), k = 2.5 / c.height * size;
      const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(k); scene.add(holder);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 28), new THREE.MeshBasicMaterial({ color: colorsHex[i], transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
      const shadow = P.shadowBlob(1.0); scene.add(shadow);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(pp), transparent: true, depthTest: false })); tag.scale.set(2.2, 0.82, 1); tag.renderOrder = 15; scene.add(tag);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })); bubble.visible = false; scene.add(bubble);
      const sbBg = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.26), new THREE.MeshBasicMaterial({ color: 0x120a22, transparent: true, opacity: 0.8, depthWrite: false })); sbBg.rotation.x = -Math.PI / 2; sbBg.renderOrder = 4; scene.add(sbBg);
      const sbFg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, depthWrite: false })); sbFg.rotation.x = -Math.PI / 2; sbFg.renderOrder = 5; scene.add(sbFg);
      return { i, c, holder, k, size, R: 0.62 * size, ring, shadow, tag, bubble, sbBg, sbFg, lives: LIVES, out: false,
        x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, fx: i ? -1 : 1, fz: 0, hasBomb: false, stam: 1, exh: false, regen: 0, dive: 0, dvx: 0, dvz: 0, diveCd: 0, slide: 0, safe: 0, stun: 0, slip: 0, svx: 0, svz: 0, speedT: 0, shield: 0, trapCd: 0, spin: 0, fly: 0,
        stats: { tags: 0, peels: 0, slips: 0, dives: 0, items: 0, booms: 0 } };
    });

    // ---------------- bom ----------------
    const bomb = makeBomb(); scene.add(bomb);
    const dangerRing = new THREE.Mesh(new THREE.RingGeometry(BLAST_R - 0.25, BLAST_R, 48), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })); dangerRing.rotation.x = -Math.PI / 2; dangerRing.position.y = 0.06; scene.add(dangerRing);
    const dangerDisc = new THREE.Mesh(new THREE.CircleGeometry(BLAST_R, 40), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false })); dangerDisc.rotation.x = -Math.PI / 2; dangerDisc.position.y = 0.05; scene.add(dangerDisc);
    const fuseCv = document.createElement('canvas'); fuseCv.width = 128; fuseCv.height = 128; const fuseCx = fuseCv.getContext('2d'); const fuseTex = new THREE.CanvasTexture(fuseCv); fuseTex.colorSpace = THREE.SRGBColorSpace;
    const fuseSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fuseTex, transparent: true, depthTest: false })); fuseSp.scale.set(1.6, 1.6, 1); fuseSp.renderOrder = 16; scene.add(fuseSp);
    let fuseShown = -1;
    function drawFuse(n, hot) { if (n === fuseShown) return; fuseShown = n; fuseCx.clearRect(0, 0, 128, 128); fuseCx.font = 'bold 84px Fredoka, Arial Black, sans-serif'; fuseCx.textAlign = 'center'; fuseCx.textBaseline = 'middle'; fuseCx.lineWidth = 14; fuseCx.lineJoin = 'round'; fuseCx.strokeStyle = 'rgba(20,6,6,.95)'; fuseCx.strokeText(String(n), 64, 70); fuseCx.fillStyle = hot ? '#ff4a2a' : '#ffe14a'; fuseCx.fillText(String(n), 64, 70); fuseTex.needsUpdate = true; }

    // ---------------- obstakels ----------------
    const obst = [];
    function addObstacle(kind, x, z, y = 0) { const m = makeObstacle(kind); scene.add(m); const o = { kind, x, z, r: KINDS[kind].r, m, y, vy: 0, state: 'ok', sc: 1 }; m.position.set(x, y, z); obst.push(o); return o; }
    LAYOUT.forEach(([k, x, z]) => addObstacle(k, x, z));
    const solid = (o) => o.state === 'ok';
    function destroyObstacle(o, fromX, fromZ) {
      const i = obst.indexOf(o); if (i < 0) return; obst.splice(i, 1); scene.remove(o.m); o.m.geometry.dispose();
      const col = KINDS[o.kind].col;
      fx.particles.burst(o.x, 1.0, o.z, { count: 26, speed: 8, up: 1.4, life: 1.0, size: 0.5, colors: [col, 0x6a5a4a, 0xffa040], gravity: 12 });
      fx.particles.burst(o.x, 0.5, o.z, { count: 10, speed: 4, up: 0.5, life: 0.8, size: 0.7, colors: [0x333344, 0x555566], gravity: -1 });
    }
    // vrije plek (niet bij spelers/obstakels/muren)
    function freeSpot(minPl = 4, minOb = 2.6, side = 0, tries = 40, near = null) {
      for (let k = 0; k < tries; k++) {
        const x = (side ? side * rand(1.5, AX - 2) : rand(-AX + 2, AX - 2)), z = rand(-AZ + 2, AZ - 2);
        if (pl.some((p) => !p.out && Math.hypot(p.x - x, p.z - z) < minPl)) continue;
        if (near && Math.hypot(near[0] - x, near[1] - z) > near[2]) continue;
        if (obst.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + minOb - 1)) continue;
        if (chickens.some((c) => Math.hypot(c.x - x, c.z - z) < 1.5)) continue;
        return [x, z];
      }
      return null;
    }

    // ---------------- scorch-vlekken ----------------
    const scorchT = scorchTexture(); const scorches = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorchT, transparent: true, depthWrite: false, opacity: 0.9 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.visible = false; m.renderOrder = 2; scene.add(m); return m; }); let scorchN = 0;

    // ---------------- bananenschillen ----------------
    const peels = Array.from({ length: 6 }, () => { const m = makePeel(); m.visible = false; scene.add(m); return { on: false, m, x: 0, z: 0, owner: 0, arm: 0, life: 0, own: 0 }; });
    // ---------------- kadootjes ----------------
    const gifts = Object.keys(GIFTS).map((type) => {
      const g = new THREE.Group(); const box = makeGift(GIFTS[type].hex); g.add(box);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(type), transparent: true, depthTest: false })); sp.scale.set(1.5, 1.5, 1); sp.position.y = 2.1; sp.renderOrder = 12; g.add(sp);
      const gl = glowSprite(GIFTS[type].hex, 3.4, 0.5); gl.position.y = 0.6; g.add(gl);
      g.visible = false; scene.add(g); return { type, on: false, g, x: 0, z: 0, t: 0, life: 0 };
    });
    // ---------------- kippen ----------------
    const chickens = [[-3, 3], [3, -3]].map(([x, z]) => {
      const a = new Animal('chicken'); a.group.scale.setScalar(1.9); scene.add(a.group); const sh = P.shadowBlob(0.7); scene.add(sh);
      return { a, sh, x, z, tx: x, tz: z, t: rand(1, 3), state: 'wander', cd: 4, from: -1, to: -1, ct: 0, yaw: 0, dz: 0 };
    });
    // ---------------- ufo ----------------
    const ufo = makeUfo(); ufo.position.set(AX + 14, 11, -4); scene.add(ufo);
    const U = { state: 'idle', t: 8, x: AX + 14, z: -4, y: 11, tx: 0, tz: 0, ob: null, newKind: null, wait: 0, nx: 0, nz: 0, count: 0 };
    const ufoWarn = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.5, 24), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ufoWarn.rotation.x = -Math.PI / 2; ufoWarn.position.y = 0.07; ufoWarn.visible = false; scene.add(ufoWarn);

    // ---------------- toestand ----------------
    const R = { state: 'ready', t: 0, holder: -1, carry: -1, fuse: 0, fuse0: 12, count: 0, matchT: NP === 3 ? MATCH_T - 10 : MATCH_T, sd: false, tickT: 0, giftT: 4.5, victim: -1, winner: -1 };
    let T = 0, introT = 0, finished = false, slow = 1, slowT = 0, camPunch = 0, camFocus = null;
    const stats = { passes: 0, chicken: 0, ufo: 0, peels: 0, slips: 0, booms: 0 };
    const hearts = (i) => '♥'.repeat(pl[i].lives) + '♡'.repeat(LIVES - pl[i].lives);
    const holderP = () => (R.holder >= 0 ? pl[R.holder] : null);
    function refreshHud() {
      hud.setScore(NP === 2 ? `${names[0]} ${hearts(0)}  –  ${hearts(1)} ${names[1]}` : pl.map((p) => `${names[p.i]} ${p.out ? '✖' : hearts(p.i)}`).join('  –  '));
      for (const p of pl) {
        if (p.out) { if (p.lastTxt !== 'uit') { p.lastTxt = 'uit'; hud.setPlayerInfo(p.i, 'UIT! (kijkt mee)'); } continue; }
        const bar = '▮'.repeat(Math.round(p.stam * 5)) + '▯'.repeat(5 - Math.round(p.stam * 5));
        const bits = [p.hasBomb ? `BOM ${Math.max(0, Math.ceil(R.fuse))}s` : R.carry >= 0 && R.state === 'play' ? 'kip rent weg!' : 'ren!', `⚡${bar}`];
        if (p.shield > 0) bits.push('schild'); if (p.speedT > 0) bits.push('turbo'); if (p.safe > 0) bits.push('veilig');
        const txt = bits.join(' · '); if (p.lastTxt !== txt) { p.lastTxt = txt; hud.setPlayerInfo(p.i, txt); }
      }
    }

    // ---------------- ronde-flow ----------------
    function placeAtStart(p) { p.x = STARTS[p.i][0]; p.z = STARTS[p.i][1]; p.y = 0; p.vx = p.vz = p.vy = 0; { const l = Math.hypot(p.x, p.z) || 1; p.fx = -p.x / l; p.fz = NP === 2 ? 0 : -p.z / l; } p.dive = p.slide = p.stun = p.slip = p.fly = p.spin = 0; p.safe = 0; p.stam = 1; p.exh = false; p.diveCd = 0; p.holder.rotation.set(0, 0, 0); p.holder.visible = true; p.c.faceDir(p.fx, p.fz); p.c.pose = 'idle'; }
    function startRound(first) {
      R.count++; R.state = 'ready'; R.t = 0; R.carry = -1; R.fuse0 = R.fuse = FUSE[Math.min(R.count - 1, FUSE.length - 1)] * (R.sd ? 0.65 : 1); R.tickT = 0.5; R.giftT = 4;
      for (const p of pl) { placeAtStart(p); p.hasBomb = false; p.speedT = p.shield = 0; if (p.out) { p.holder.visible = false; p.x = 0; p.z = -AZ - 6; } }
      for (const pe of peels) { pe.on = false; pe.m.visible = false; }
      for (const g of gifts) { g.on = false; g.g.visible = false; }
      // wie voor staat krijgt de bom; gelijk: de ander dan degene die net de bom had
      let h;
      if (NP === 2) { if (pl[0].lives !== pl[1].lives) h = pl[0].lives > pl[1].lives ? 0 : 1; else h = first ? (Math.random() < 0.5 ? 0 : 1) : 1 - Math.max(0, R.victim); }
      else {   // vrij voor allen: wie voor staat (meeste levens) krijgt de bom; bij gelijke stand loot het, niet de vorige ontploffer
        const alive = pl.filter((p) => !p.out), mx = Math.max(...alive.map((p) => p.lives)); let pool = alive.filter((p) => p.lives === mx);
        if (pool.length > 1 && !first) { const q = pool.filter((p) => p.i !== R.victim); if (q.length) pool = q; }
        h = pick(pool).i;
      }
      R.holder = h; pl[h].hasBomb = true; U.t = Math.max(U.t, 5); for (const c of chickens) { c.state = 'wander'; c.cd = Math.max(c.cd, 3); }
      if (!first) hud.showBig(`BOM VOOR ${names[h].toUpperCase()}!`, 1100, lite(h));
      audio.sfx('bell', { vol: 0.5 }); refreshHud();
    }
    function passBomb(from, to, how = 'tag') {
      R.holder = to.i; from.hasBomb = false; to.hasBomb = true; from.safe = 1.3; stats.passes++; from.stats.tags += how === 'tag' ? 1 : 0;
      const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
      if (how === 'tag') { to.vx += nx * 9; to.vz += nz * 9; from.vx -= nx * 6; from.vz -= nz * 6; to.stun = Math.max(to.stun, 0.15); to.dive = 0; from.dive = 0; slow = 0.15; slowT = 0.07; ctx.shake(0.45); camPunch = 0.6; }
      fx.texts.add(how === 'tag' ? 'TIK!' : 'BOM OVER!', to.x, 3.6, to.z, '#ff7a3a', 1.7);
      fx.particles.burst((to.x + from.x) / 2, 1.2, (to.z + from.z) / 2, { count: 34, speed: 7, up: 1.2, life: 0.7, size: 0.5, colors: [0xffffff, 0xffe14a, 0xff7a20], gravity: 5 });
      fx.particles.ring((to.x + from.x) / 2, 0.4, (to.z + from.z) / 2, { count: 24, speed: 8, color: 0xffe14a, size: 0.4, life: 0.5 });
      audio.sfx('hit', { vol: 0.9 }); audio.sfx('pop', { vol: 0.5, rate: 0.8 }); hud.toast(`${names[to.i]} heeft de bom!`, 1100);
      from.c.pose = 'cheer'; setTimeout(() => { from.c.pose = 'idle'; }, 500);
    }
    function explode() {
      const h = holderP(); if (!h) return;
      R.state = 'boom'; R.t = 0; R.victim = h.i; h.lives--; h.stats.booms++; stats.booms++; slow = 0.25; slowT = 0.6; camPunch = 1.2; camFocus = [h.x, h.z];
      const bx = h.x, bz = h.z;
      hud.showBig('BOEM!', 1200, '#ff6a2a'); ctx.shake(1.0); audio.sfx('explode', { vol: 1 }); audio.sfx('explode', { vol: 0.5, rate: 0.6 }); audio.sfx('lose', { vol: 0.35 });
      fx.particles.burst(bx, 1.4, bz, { count: 120, speed: 14, up: 1.8, life: 1.4, size: 0.9, colors: [0xff4a10, 0xff9a20, 0xffe060, 0xfff0c0], gravity: 5 });
      fx.particles.burst(bx, 1, bz, { count: 40, speed: 6, up: 1.2, life: 2.0, size: 1.3, colors: [0x2a2630, 0x4a4650], gravity: -1.5 });
      fx.particles.ring(bx, 0.5, bz, { count: 48, speed: 15, color: 0xffd060, size: 0.6, life: 0.7 }); fx.particles.ring(bx, 0.5, bz, { count: 36, speed: 9, color: 0xff6a20, size: 0.8, life: 0.9 });
      fx.texts.add('-1 ♥', bx, 4.4, bz, '#ff5a5a', 2.2);
      // obstakels in de buurt worden weggeblazen
      let n = 0; for (const o of [...obst]) if (Math.hypot(o.x - bx, o.z - bz) < BLAST_R) { destroyObstacle(o); n++; }
      for (const pe of peels) if (pe.on && Math.hypot(pe.x - bx, pe.z - bz) < BLAST_R) { pe.on = false; pe.m.visible = false; }
      if (U.ob && Math.hypot(U.ob.x - bx, U.ob.z - bz) < BLAST_R) { /* ufo-obstakel hangt in de lucht: veilig */ }
      const sc = scorches[scorchN++ % scorches.length]; sc.visible = true; sc.position.set(bx, 0.03 + (scorchN % 6) * 0.002, bz); sc.scale.setScalar(BLAST_R * 1.5); sc.rotation.z = Math.random() * 6;
      for (const o of pl) { if (o === h || o.out) continue; const dx = o.x - bx, dz = o.z - bz, d = Math.hypot(dx, dz) || 1; if (d < BLAST_R + 3) { o.vx += dx / d * 14; o.vz += dz / d * 14; o.stun = 0.5; } }
      h.fly = 1; h.vy = 13; h.spin = 14; h.vx = (Math.random() - 0.5) * 6; h.vz = (Math.random() - 0.5) * 6; h.c.pose = 'scared'; h.hasBomb = false; R.holder = -1;
      for (const c of chickens) if (Math.hypot(c.x - bx, c.z - bz) < BLAST_R) { c.state = 'dizzy'; c.ct = 2; fx.particles.burst(c.x, 1, c.z, { count: 18, speed: 5, up: 1, life: 1, size: 0.4, colors: [0xffffff, 0xf6f1e4], gravity: 3 }); }
      if (n) fx.texts.add(`${n} obstakel${n > 1 ? 's' : ''} weg!`, bx, 5.4, bz, '#ffd23f', 1.2);
      bomb.visible = false; fuseSp.visible = false;
    }
    // winner = slot of -1 (gelijkspel, alleen bij 3 spelers)
    function endMatch(winner) {
      R.state = 'end'; R.t = 0; R.winner = winner; hud.setTimer(null);
      pl.forEach((p) => { p.c.pose = winner < 0 ? 'idle' : p.i === winner ? 'cheer' : 'sad'; p.holder.visible = true; }); audio.sfx(winner < 0 ? 'good' : 'win', { vol: 0.5 });
      hud.showBig(winner < 0 ? 'GELIJKSPEL!' : `${names[winner]} WINT!`, 1600, winner < 0 ? '#ffe14a' : lite(winner));
    }
    // 3 spelers, noodbom: wie de meeste levens heeft wint; bij gelijk liever niet de ontploffer, daarna de meeste tikken, anders gelijkspel
    function sdWinner(victim) {
      const alive = pl.filter((p) => !p.out), mx = Math.max(...alive.map((p) => p.lives)); let c = alive.filter((p) => p.lives === mx);
      if (c.length > 1) { const q = c.filter((p) => p.i !== victim.i); if (q.length) c = q; }
      if (c.length > 1) { const mt = Math.max(...c.map((p) => p.stats.tags)); c = c.filter((p) => p.stats.tags === mt); }
      return c.length === 1 ? c[0].i : -1;
    }
    function finishMatch() {
      if (finished) return; finished = true;
      const w = R.winner;
      let l; if (NP === 2) l = 1 - w; else { const others = pl.filter((p) => p.i !== w); const mn = Math.min(...others.map((p) => p.lives)); const ls = others.filter((p) => p.lives === mn); l = (ls.find((p) => p.i === R.victim) || ls[0]).i; }
      if (w < 0) { ctx.finishPvp({ winner: null, score: pl.map((p) => p.lives), delay: 700, summary: `Gelijkspel! Alle bommen zijn op, niemand wil de winnaar zijn. Er waren ${stats.booms} ontploffingen, de bom ging ${stats.passes}x over.` }); return; }
      const jokes = [`${names[l]} werd gebombardeerd tot ${names[l]}-confetti. ${names[w]} wint!`, `${names[l]} hield de bom net iets te lang vast. ${names[w]} danst.`, `Boris de Bommenbaas knikt goedkeurend naar ${names[w]}. ${names[l]} ruikt naar rook.`, `${names[w]} kan zeker niet tegen hete aardappelen, maar is er wel goed in. ${names[l]} is gaar.`];
      ctx.finishPvp({ winner: w, score: pl.map((p) => p.lives), delay: 700, summary: `${pick(jokes)} Er waren ${stats.booms} ontploffingen, de bom ging ${stats.passes}x over${stats.chicken ? `, de kippen bezorgden hem ${stats.chicken}x` : ''}${stats.peels ? ` en er werd ${stats.slips}x uitgegleden over ${stats.peels} schillen` : ''}.${R.sd ? ' De noodbom besliste het duel.' : ''}` });
    }

    // ---------------- kadootjes ----------------
    function spawnGift() {
      const free = gifts.filter((g) => !g.on); if (!free.length) return;
      const tot = free.reduce((a, g) => a + GIFTS[g.type].w, 0); let r = Math.random() * tot, g = free[0]; for (const q of free) { r -= GIFTS[q.type].w; if (r <= 0) { g = q; break; } }
      let sp;
      if (NP === 2) { const trailing = pl[0].lives === pl[1].lives ? 0 : (pl[0].lives < pl[1].lives ? -1 : 1); sp = freeSpot(4, 2.2, trailing && Math.random() < 0.6 ? trailing : 0); }
      else {   // 3 spelers: kadootjes vaker in de buurt van wie achterstaat
        const al = pl.filter((p) => !p.out), mn = Math.min(...al.map((p) => p.lives)), tr = al.filter((p) => p.lives === mn);
        sp = freeSpot(4, 2.2, 0, 40, tr.length === 1 && Math.random() < 0.6 ? [tr[0].x, tr[0].z, 12] : null);
      }
      if (!sp) return;
      g.on = true; g.x = sp[0]; g.z = sp[1]; g.t = 0; g.life = 14; g.g.visible = true; g.g.position.set(g.x, 0, g.z);
      fx.particles.ring(g.x, 0.4, g.z, { count: 18, speed: 3, color: GIFTS[g.type].hex, size: 0.3, life: 0.6 }); audio.sfx('sparkle', { vol: 0.4 }); if (!stats.giftTold) { stats.giftTold = true; hud.toast('🎁 Een kadootje! Raak het aan voor een power-up', 1800); }
    }
    // de "ander" voor een kadootje/kip: wie de meeste levens heeft (bij gelijk de dichtstbijzijnde bij `ref`); bij 2 spelers gewoon de andere
    function pickOther(p, ref = p) {
      const al = pl.filter((q) => q !== p && !q.out); if (al.length < 2) return al[0] || pl[(p.i + 1) % NP];
      const mx = Math.max(...al.map((q) => q.lives)); return al.filter((q) => q.lives === mx).sort((a, b) => Math.hypot(a.x - ref.x, a.z - ref.z) - Math.hypot(b.x - ref.x, b.z - ref.z))[0];
    }
    function randomTeleportSpot(p) { const o = pickOther(p), others = pl.filter((q) => q !== p && !q.out), far = NP === 2 ? 10 : 7; for (let k = 0; k < 40; k++) { const x = rand(-AX + 2, AX - 2), z = rand(-AZ + 2, AZ - 2); if (others.some((q) => Math.hypot(q.x - x, q.z - z) < far)) continue; if (obst.some((q) => solid(q) && Math.hypot(q.x - x, q.z - z) < q.r + p.R + 0.6)) continue; return [x, z]; } return [(o.x > 0 ? -1 : 1) * 10, 0]; }
    function takeGift(g, p) {
      g.on = false; g.g.visible = false; const d = GIFTS[g.type], o = pickOther(p); stats.items = (stats.items || 0) + 1; p.stats.items++;
      fx.particles.burst(p.x, 1.2, p.z, { count: 32, speed: 6, up: 1.4, life: 0.9, size: 0.4, colors: [d.hex, 0xffffff], gravity: 4 });
      fx.texts.add(d.name, p.x, 4.2, p.z, d.css, 1.5); audio.sfx('powerup', { vol: 0.8 }); ctx.shake(0.2);
      if (g.type === 'speed') p.speedT = 6;
      else if (g.type === 'shield') p.shield = 10;
      else if (g.type === 'teleport') {
        fx.particles.burst(p.x, 1, p.z, { count: 30, speed: 5, up: 1.5, life: 0.7, size: 0.5, colors: [0xb58aff, 0xffffff], gravity: -1 }); audio.sfx('whoosh', { vol: 0.6, rate: 1.6 });
        const s = randomTeleportSpot(p); p.x = s[0]; p.z = s[1]; p.vx = p.vz = 0; p.dive = 0; p.safe = Math.max(p.safe, 0.6);
        fx.particles.burst(p.x, 1, p.z, { count: 30, speed: 5, up: 1.5, life: 0.7, size: 0.5, colors: [0xb58aff, 0xffffff], gravity: -1 });
      } else if (g.type === 'swap') {
        if (p.hasBomb && R.state === 'play' && R.carry < 0) { passBomb(p, o, 'swap'); fx.texts.add('WEG ERMEE!', p.x, 3.4, p.z, '#ff6ad8', 1.3); }
        else { const ax = p.x, az = p.z; p.x = o.x; p.z = o.z; o.x = ax; o.z = az; o.stun = Math.max(o.stun, 0.5); p.safe = Math.max(p.safe, 0.8); fx.texts.add('PLEK GERUILD!', p.x, 3.4, p.z, '#ff6ad8', 1.3); fx.particles.burst(p.x, 1, p.z, { count: 20, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xff6ad8, 0xffffff], gravity: 1 }); fx.particles.burst(o.x, 1, o.z, { count: 20, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xff6ad8, 0xffffff], gravity: 1 }); }
      }
      hud.toast(`${names[p.i]} pakt een kadootje: ${d.name}`, 1500);
    }

    // ---------------- schillen ----------------
    function placePeel(p) {
      const mine = peels.filter((q) => q.on && q.owner === p.i); if (mine.length >= 2) { const o = mine[0]; o.on = false; o.m.visible = false; }
      const pe = peels.find((q) => !q.on); if (!pe) return;
      const l = Math.hypot(p.fx, p.fz) || 1; pe.x = clamp(p.x - p.fx / l * (p.R + 0.7), -AX + 1, AX - 1); pe.z = clamp(p.z - p.fz / l * (p.R + 0.7), -AZ + 1, AZ - 1);
      pe.on = true; pe.owner = p.i; pe.arm = 0.35; pe.own = 1.4; pe.life = 14; pe.m.visible = true; pe.m.position.set(pe.x, 0.02, pe.z); pe.m.rotation.y = Math.random() * 6; pe.m.scale.setScalar(0.01);
      p.trapCd = 2.2; p.stats.peels++; stats.peels++; audio.sfx('pop', { vol: 0.5, rate: 1.5 }); fx.particles.dust(pe.x, 0.1, pe.z, 4, 0xffe14a);
    }
    function slipPlayer(p, pe) {
      pe.on = false; pe.m.visible = false; p.slip = 1.05; p.stats.slips++; stats.slips++; p.dive = 0;
      const sp = Math.hypot(p.vx, p.vz), nx = sp > 1 ? p.vx / sp : p.fx, nz = sp > 1 ? p.vz / sp : p.fz; p.svx = nx * Math.max(9, sp * 1.1); p.svz = nz * Math.max(9, sp * 1.1); p.spin = 12;
      fx.texts.add('WIEEE!', p.x, 3.6, p.z, '#ffe14a', 1.6); fx.particles.burst(pe.x, 0.4, pe.z, { count: 16, speed: 4, up: 1.5, life: 0.6, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 8 });
      audio.sfx('boing', { vol: 0.7, rate: 1.3 }); audio.sfx('whoosh', { vol: 0.4 }); ctx.shake(0.2);
    }

    // ---------------- kippen ----------------
    function chickenStep(c, dt) {
      c.cd = Math.max(0, c.cd - dt);
      const a = c.a;
      if (c.state === 'wander' || c.state === 'flee') {
        c.t -= dt; const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
        if (d < 0.6 || c.t <= 0) { c.tx = rand(-AX + 2, AX - 2); c.tz = rand(-AZ + 2, AZ - 2); c.t = rand(2, 5); }
        // schrik van de spelers
        let fx_ = 0, fz_ = 0; for (const p of pl) { if (p.out) continue; const ex = c.x - p.x, ez = c.z - p.z, e = Math.hypot(ex, ez); if (e < 3) { fx_ += ex / (e || 1) * (3 - e); fz_ += ez / (e || 1) * (3 - e); } }
        const sp = c.state === 'flee' ? 6 : 2.4, ux = dx / (d || 1) + fx_ * 0.6, uz = dz / (d || 1) + fz_ * 0.6, ul = Math.hypot(ux, uz) || 1;
        c.x += ux / ul * sp * dt; c.z += uz / ul * sp * dt; a.speed = 1; a.targetYaw = Math.atan2(ux, uz);
        if (c.state === 'flee') { c.ct -= dt; if (c.ct <= 0) c.state = 'wander'; }
        // stelen?
        const h = holderP();
        if (R.state === 'play' && h && R.carry < 0 && c.cd <= 0 && R.fuse > 2.2 && Math.hypot(c.x - h.x, c.z - h.z) < h.R + 0.7 && h.safe <= 0) steal(c, h);
      } else if (c.state === 'carry') {
        c.ct -= dt; const to = pl[c.to], from = pl[c.from];
        const dx = to.x - c.x, dz = to.z - c.z, d = Math.hypot(dx, dz) || 1; c.dz += dt * 9;
        const sx = -dz / d * Math.sin(c.dz) * 0.7, sz = dx / d * Math.sin(c.dz) * 0.7, ux = dx / d + sx, uz = dz / d + sz, ul = Math.hypot(ux, uz) || 1, sp = 7.8;
        c.x += ux / ul * sp * dt; c.z += uz / ul * sp * dt; a.speed = 1; a.targetYaw = Math.atan2(ux, uz);
        const pe = peels.find((q) => q.on && q.arm <= 0 && Math.hypot(q.x - c.x, q.z - c.z) < 0.9);
        if (pe) { pe.on = false; pe.m.visible = false; dropBomb(c, 'schil'); return; }
        if (d < to.R + 0.55) {
          if (to.shield > 0) { to.shield = 0; fx.texts.add('BOING!', to.x, 3.2, to.z, '#ffe14a', 1.4); audio.sfx('boing', { vol: 0.6 }); dropBomb(c, 'schild'); }
          else if (to.safe > 0) dropBomb(c, 'veilig');
          else {
            R.carry = -1; c.state = 'flee'; c.ct = 2.5; c.cd = 9; stats.chicken++; passBomb(from, to, 'kip');
            fx.texts.add('KIP-POST!', to.x, 4.4, to.z, '#ffd23f', 1.8); hud.showBig('KIP-POST!', 900, '#ffd23f');
          }
        } else if (c.ct <= 0) dropBomb(c, 'moe');
      } else if (c.state === 'dizzy') { c.ct -= dt; a.speed = 0; a.targetYaw += dt * 10; if (c.ct <= 0) c.state = 'wander'; }
      for (const o of obst) if (solid(o)) { const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), m = o.r + 0.4; if (d < m && d > 1e-4) { c.x = o.x + dx / d * m; c.z = o.z + dz / d * m; } }
      c.x = clamp(c.x, -AX + 0.8, AX - 0.8); c.z = clamp(c.z, -AZ + 0.8, AZ - 0.8);
      a.update(dt); a.group.position.set(c.x, 0, c.z); c.sh.position.set(c.x, 0.03, c.z);
    }
    function steal(c, h) {
      R.carry = chickens.indexOf(c); c.from = h.i; c.to = pickOther(h, c).i; c.state = 'carry'; c.ct = 3.4; c.dz = 0; h.hasBomb = false; R.holder = -1; c.cd = 8;
      fx.texts.add('KIP-DIEF!', h.x, 3.6, h.z, '#ffd23f', 1.7); hud.showBig('🐔 KIP-DIEF!', 900, '#ffd23f'); hud.toast(`Een kip steelt de bom van ${names[h.i]} en brengt hem naar ${names[c.to]}!`, 2200);
      audio.tone(520, 0.16, { type: 'square', vol: 0.15, slide: 900 }); audio.tone(700, 0.12, { type: 'square', vol: 0.12, slide: 400, delay: 0.14 }); audio.sfx('pop', { vol: 0.6 }); fx.particles.burst(c.x, 1.2, c.z, { count: 20, speed: 5, up: 1.5, life: 0.8, size: 0.35, colors: [0xffffff, 0xf6f1e4], gravity: 4 });
    }
    function dropBomb(c, why) {
      const p = pl[c.from]; R.carry = -1; R.holder = p.i; p.hasBomb = true; c.state = 'dizzy'; c.ct = 1.8; c.cd = 8;
      const msg = { schil: 'De kip glijdt uit over een schil! De bom is terug.', schild: 'Het schild houdt! De kip geeft de bom terug.', veilig: 'De kip komt niet dichterbij... bom terug.', moe: 'De kip is moe en geeft de bom terug.' }[why];
      hud.toast(msg, 1800); fx.texts.add(why === 'schil' ? 'KAKKERLAK!' : 'BWAK!', c.x, 3.2, c.z, '#ffffff', 1.3); fx.particles.burst(c.x, 1.0, c.z, { count: 16, speed: 4, up: 1, life: 0.8, size: 0.35, colors: [0xffffff, 0xf6f1e4], gravity: 3 }); audio.sfx('miss', { vol: 0.5 });
    }

    // ---------------- ufo ----------------
    function ufoStep(dt) {
      const g = ufo, ud = g.userData; ud.hull.rotation.y += dt * 2; ud.lights.forEach((l, i) => { l.visible = Math.sin(introT * 0 + T * 14 + i * 0.8) > -0.2; }); ud.alien.position.y = 0.75 + Math.sin(T * 5) * 0.05;
      const fly = (tx, tz, ty, sp) => { const dx = tx - U.x, dz = tz - U.z, dy = ty - U.y, d = Math.hypot(dx, dz, dy); if (d < 0.2) return true; const s = Math.min(d, sp * dt); U.x += dx / d * s; U.z += dz / d * s; U.y += dy / d * s; return false; };
      if (U.state === 'idle') { if (R.state === 'play') U.t -= dt; if (U.t <= 0) {
        const lowCount = obst.length < 9; U.count++;
        if (lowCount || Math.random() < 0.25) { const sp = freeSpot(4.5, 2.6); if (!sp) { U.t = 3; return; } U.mode = 'deliver'; U.nx = sp[0]; U.nz = sp[1]; U.ob = null; U.newKind = pick(OBST_KINDS); }
        else { const cand = obst.filter((o) => solid(o) && o.kind !== 'fountain' && pl.every((p) => Math.hypot(p.x - o.x, p.z - o.z) > 3.5)); if (!cand.length) { U.t = 3; return; } U.mode = 'move'; U.ob = pick(cand); const sp = freeSpot(4.5, 2.8); if (!sp) { U.t = 3; return; } U.nx = sp[0]; U.nz = sp[1]; }
        U.state = 'in'; U.x = (Math.random() < 0.5 ? -1 : 1) * (AX + 12); U.z = rand(-6, 6); U.y = 8; stats.ufo++;
        hud.toast('🛸 Een ufo! Hij verplaatst obstakels.', 1800); audio.tone(300, 1.0, { type: 'sine', vol: 0.12, slide: 700 }); audio.tone(310, 1.0, { type: 'sine', vol: 0.1, slide: 720, vib: 0.05 });
      } }
      else if (U.state === 'in') {
        const tx = U.mode === 'move' ? U.ob.x : U.nx, tz = U.mode === 'move' ? U.ob.z : U.nz;
        if (fly(tx, tz, 5.6, 16)) { if (U.mode === 'move') { U.state = 'lift'; U.wait = 0; U.ob.state = 'lifted'; ud.beam.visible = true; audio.sfx('whoosh', { vol: 0.5, rate: 0.6 }); } else { U.state = 'deliver'; U.wait = 0; ud.beam.visible = true; ufoWarn.visible = true; ufoWarn.position.set(U.nx, 0.07, U.nz); } }
      } else if (U.state === 'lift') {
        U.wait += dt; const o = U.ob; o.y = Math.min(4.3, o.y + dt * 6); o.m.position.set(o.x, o.y, o.z); o.m.rotation.y += dt * 3;
        if (o.y >= 4.2) { U.state = 'carry'; ufoWarn.visible = true; }
      } else if (U.state === 'carry') {
        const o = U.ob; ufoWarn.position.set(U.nx, 0.07, U.nz);
        if (fly(U.nx, U.nz, 5.6, 11)) { U.state = 'drop'; U.wait = 0; ud.beam.visible = false; } o.x = U.x; o.z = U.z; o.m.position.set(o.x, o.y, o.z); o.m.rotation.y += dt * 3;
      } else if (U.state === 'deliver') {
        U.wait += dt; ufoWarn.position.set(U.nx, 0.07, U.nz);
        if (U.wait > 1.0) { const o = addObstacle(U.newKind, U.nx, U.nz, 4.4); o.state = 'falling'; o.vy = 0; U.ob = o; U.state = 'drop'; U.wait = 0; ud.beam.visible = false; o.m.scale.setScalar(0.1); }
      } else if (U.state === 'drop') {
        const o = U.ob; ufoWarn.position.set(U.nx, 0.07, U.nz);
        if (o.state !== 'falling') { o.state = 'falling'; o.vy = 0; o.x = U.nx; o.z = U.nz; }
        o.vy -= 30 * dt; o.y += o.vy * dt; o.sc = Math.min(1, o.sc + dt * 4); o.m.scale.setScalar(Math.min(1, o.m.scale.x + dt * 5)); o.m.position.set(o.x, Math.max(0, o.y), o.z); o.m.rotation.y += dt * 2;
        if (o.y <= 0) {
          o.y = 0; o.state = 'ok'; o.m.position.set(o.x, 0, o.z); o.m.scale.setScalar(1); o.m.rotation.y = 0; ufoWarn.visible = false; ctx.shake(0.4); audio.sfx('thud', { vol: 0.9 }); audio.sfx('wood', { vol: 0.5 });
          fx.particles.burst(o.x, 0.3, o.z, { count: 28, speed: 6, up: 1.2, life: 0.8, size: 0.6, colors: [0x9a8a7a, 0xffffff], gravity: 6 }); fx.particles.ring(o.x, 0.3, o.z, { count: 24, speed: 8, color: 0xdddddd, size: 0.4, life: 0.5 });
          for (const p of pl) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 1; if (d < o.r + p.R + 0.4) { p.x = o.x + dx / d * (o.r + p.R + 0.6); p.z = o.z + dz / d * (o.r + p.R + 0.6); p.vx += dx / d * 8; p.vz += dz / d * 8; p.stun = 0.5; fx.texts.add('BONK!', p.x, 3.4, p.z, '#ffd23f', 1.5); } }
          U.state = 'out'; U.ob = null;
        }
      } else if (U.state === 'out') {
        if (fly(U.x > 0 ? AX + 14 : -AX - 14, U.z, 12, 18)) { U.state = 'idle'; U.t = rand(9, 13); }
      }
      g.position.set(U.x, U.y + Math.sin(T * 3) * 0.2, U.z); g.rotation.z = Math.sin(T * 1.7) * 0.06;
      if (ud.beam.visible) { const h = Math.max(0.5, U.y); ud.beam.scale.set(1, h, 1); ud.beam.position.y = -h / 2; ud.beam.material.opacity = 0.2 + Math.sin(T * 12) * 0.06; }
      ufoWarn.material.opacity = 0.5 + Math.abs(Math.sin(T * 8)) * 0.4;
    }

    // ---------------- spelersfysica ----------------
    function stepPlayer(p, dt, live) {
      if (p.out) { p.vx = p.vz = 0; return; }
      const inp = pv.input(p.i);
      p.safe = Math.max(0, p.safe - dt); p.stun = Math.max(0, p.stun - dt); p.slip = Math.max(0, p.slip - dt); p.speedT = Math.max(0, p.speedT - dt); p.shield = Math.max(0, p.shield - dt); p.diveCd = Math.max(0, p.diveCd - dt); p.trapCd = Math.max(0, p.trapCd - dt); p.slide = Math.max(0, p.slide - dt);
      let mx = 0, mz = 0;
      if (live && p.stun <= 0 && p.slip <= 0 && p.fly <= 0) { mx = inp.x; mz = inp.y; const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; } }
      const moving = Math.hypot(mx, mz) > 0.25; if (moving) { p.fx = mx; p.fz = mz; }
      const trailing = pl.some((q) => q !== p && !q.out && q.lives > p.lives);
      // sprint + duik
      let sprinting = false, spd = (p.hasBomb ? RUN_HOLD : RUN) * pv.speed(p.i) * (p.speedT > 0 ? 1.35 : 1);
      if (live && p.stun <= 0 && p.slip <= 0 && p.fly <= 0) {
        if (inp.aP && p.diveCd <= 0 && p.stam >= 0.22 && p.dive <= 0) {
          let dx = moving ? mx : p.fx, dz = moving ? mz : p.fz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          p.dive = DIVE_T * (GRAV < 1 ? 1.4 : 1); p.dvx = dx; p.dvz = dz; p.diveCd = 1.0; p.stam -= 0.22; p.regen = 0.5; p.stats.dives++; p.slide = 0.35;
          audio.sfx('whoosh', { vol: 0.45 }); fx.particles.burst(p.x, 0.3, p.z, { count: 8, speed: 3, up: 0.4, life: 0.4, size: 0.4, colors: [0xcdb8a0, 0xffffff], gravity: 2 });
        }
        if (inp.a && moving && p.stam > 0.02 && !p.exh && p.dive <= 0) { sprinting = true; spd *= SPRINT; p.stam = Math.max(0, p.stam - 0.55 * dt); p.regen = 0.5; if (p.stam <= 0.02) { p.exh = true; fx.texts.add('PUH!', p.x, 3.2, p.z, '#cfe8ff', 1.0); audio.sfx('miss', { vol: 0.3 }); } }
        if (inp.bP && p.trapCd <= 0) placePeel(p);
      }
      p.regen = Math.max(0, p.regen - dt);
      if (!sprinting && p.regen <= 0) { p.stam = Math.min(1, p.stam + (trailing ? 0.42 : 0.32) * dt); if (p.exh && p.stam > 0.35) p.exh = false; }
      // snelheid
      if (p.fly > 0) { p.fly -= dt; p.vy -= 36 * dt; p.y += p.vy * dt; p.vx *= Math.exp(-1.4 * dt); p.vz *= Math.exp(-1.4 * dt); if (p.y <= 0) { p.y = 0; p.vy = 0; p.fly = 0; p.spin = 0; p.stun = 0.4; p.c.pose = 'sad'; fx.particles.dust(p.x, 0, p.z, 8, 0x555566); audio.sfx('thud', { vol: 0.5 }); } }
      else if (p.slip > 0) { const f = Math.exp(-1.0 * dt); p.svx *= f; p.svz *= f; p.vx = p.svx; p.vz = p.svz; }
      else if (p.dive > 0) { p.dive -= dt; p.vx = p.dvx * DIVE_V * pv.speed(p.i); p.vz = p.dvz * DIVE_V * pv.speed(p.i); if (Math.random() < dt * 50) fx.particles.emit(p.x - p.dvx * 0.5, 0.4, p.z - p.dvz * 0.5, 0, 0.3, 0, { life: 0.3, size: 0.5, color: liteHex(p.i), gravity: 0 }); }
      else if (p.stun > 0) { const f = Math.exp(-lerp(4, 0.8, SLIP) * dt); p.vx *= f; p.vz *= f; }
      else { const acc = lerp(p.slide > 0 ? 6 : 22, p.slide > 0 ? 1.2 : 2.0, SLIP), k = 1 - Math.exp(-acc * dt); p.vx += (mx * spd - p.vx) * k; p.vz += (mz * spd - p.vz) * k; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      // obstakels en muren
      if (p.fly <= 0) for (const ob of obst) if (solid(ob)) { const dx = p.x - ob.x, dz = p.z - ob.z, d = Math.hypot(dx, dz), m = ob.r + p.R; if (d < m && d > 1e-4) { const nx = dx / d, nz = dz / d; p.x = ob.x + nx * m; p.z = ob.z + nz * m; const vn = p.vx * nx + p.vz * nz; if (vn < 0) { if (p.slip > 0 || p.dive > 0) { if (-vn > 7) { fx.particles.burst(p.x - nx * p.R, 0.8, p.z - nz * p.R, { count: 6, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xffffff, 0xcdb8a0], gravity: 6 }); audio.sfx('thud', { vol: 0.3 }); } p.dive = Math.min(p.dive, 0.05); } p.vx -= vn * nx * (p.slip > 0 ? 1.7 : 1); p.vz -= vn * nz * (p.slip > 0 ? 1.7 : 1); p.svx = p.vx; p.svz = p.vz; } } }
      const lx = AX - p.R - 0.2, lz = AZ - p.R - 0.2;
      if (Math.abs(p.x) > lx) { p.x = Math.sign(p.x) * lx; if (p.slip > 0 || p.fly > 0) { p.vx *= -0.6; p.svx *= -0.6; } else p.vx = 0; }
      if (Math.abs(p.z) > lz) { p.z = Math.sign(p.z) * lz; if (p.slip > 0 || p.fly > 0) { p.vz *= -0.6; p.svz *= -0.6; } else p.vz = 0; }
    }

    // ---------------- hoofd-update ----------------
    function update(dt0) {
      slowT -= dt0; if (slowT <= 0) slow = Math.min(1, slow + dt0 * 6);
      const dt = dt0 * slow; T += dt; R.t += dt0;
      world.update(T + introT, dt0);
      if (R.state === 'ready') {
        for (const p of pl) { p.vx = p.vz = 0; }
        if (R.t >= 1.5) { R.state = 'play'; R.t = 0; hud.showBig('REN!', 600, '#ffe14a'); audio.sfx('go'); }
      } else if (R.state === 'play') {
        R.matchT -= dt;
        for (const p of pl) stepPlayer(p, dt, true);
        // spelers uit elkaar duwen
        for (let ia = 0; ia < NP; ia++) for (let ib = ia + 1; ib < NP; ib++) { const a = pl[ia], b = pl[ib]; if (a.out || b.out) continue;{ const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.R + b.R; if (d < m && d > 1e-4) { const pen = m - d, wa = b.size / (a.size + b.size); a.x -= dx / d * pen * wa; a.z -= dz / d * pen * wa; b.x += dx / d * pen * (1 - wa); b.z += dz / d * pen * (1 - wa); } } }
        // tikken
        const h = holderP();
        if (h && R.carry < 0) {
          for (const o of pl.filter((q) => q !== h && !q.out).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))) {   // dichtstbijzijnde eerst
          const d = Math.hypot(o.x - h.x, o.z - h.z), reach = h.R + o.R + (h.dive > 0 ? 0.45 : 0.18);
          if (d < reach && o.fly <= 0 && h.fly <= 0) {
            if (o.safe > 0) { continue; /* nog onaantastbaar: de volgende kan wel */ }
            else if (o.shield > 0) { o.shield = 0; h.stun = 0.9; const dx = h.x - o.x, dz = h.z - o.z, dd = Math.hypot(dx, dz) || 1; h.vx = dx / dd * 12; h.vz = dz / dd * 12; h.dive = 0; fx.texts.add('BOING!', o.x, 3.4, o.z, '#ffe14a', 1.5); fx.particles.burst(o.x, 1.2, o.z, { count: 30, speed: 6, up: 1, life: 0.6, size: 0.45, colors: [0xffe9a0, 0xffffff], gravity: 3 }); audio.sfx('boing', { vol: 0.8 }); audio.sfx('ding', { vol: 0.4 }); ctx.shake(0.3); o.safe = 0.6; break; }
            else { passBomb(h, o, 'tag'); break; }
          }
          }
        }
        // lont
        if (R.carry < 0 || R.fuse > 0.75) R.fuse -= dt; if (R.carry >= 0) R.fuse = Math.max(R.fuse, 0.7);
        if (!R.sd && R.matchT <= 0) { R.sd = true; R.fuse = Math.min(R.fuse, 7); hud.setTimer(null); hud.showBig('NOODBOM!', 1300, '#ff4a3a'); hud.toast('De eerstvolgende ontploffing beslist het duel!', 2600); audio.sfx('creak', { vol: 0.6 }); ctx.shake(0.4); }
        const heat = 1 - clamp(R.fuse / R.fuse0, 0, 1);
        R.tickT -= dt; if (R.tickT <= 0) { audio.sfx('tick', { vol: 0.5 + heat * 0.5, rate: 0.8 + heat * 1.2 }); R.tickT = lerp(0.85, 0.11, Math.pow(heat, 1.5)); }
        if (R.fuse <= 0 && R.carry < 0) explode();
        // gimmicks
        for (const c of chickens) chickenStep(c, dt);
        ufoStep(dt);
        R.giftT -= dt; if (R.giftT <= 0) { if (gifts.filter((g) => g.on).length < 2) spawnGift(); R.giftT = rand(6.5, 9); }
        for (const g of gifts) { if (!g.on) continue; g.t += dt; g.life -= dt; if (g.life <= 0) { g.on = false; g.g.visible = false; continue; } for (const p of pl) if (Math.hypot(p.x - g.x, p.z - g.z) < 1.2 + p.R * 0.6) { takeGift(g, p); break; } }
        for (const pe of peels) {
          if (!pe.on) continue; pe.life -= dt; pe.arm -= dt; pe.own -= dt; pe.m.scale.setScalar(Math.min(1, pe.m.scale.x + dt * 5));
          if (pe.life <= 0) { pe.on = false; pe.m.visible = false; continue; }
          if (pe.arm > 0) continue;
          for (const p of pl) if (p.slip <= 0 && p.fly <= 0 && !(p.i === pe.owner && pe.own > 0) && Math.hypot(p.x - pe.x, p.z - pe.z) < p.R + 0.55) { slipPlayer(p, pe); break; }
        }
      } else if (R.state === 'boom') {
        for (const p of pl) stepPlayer(p, dt, false);
        for (const c of chickens) chickenStep(c, dt);
        ufoStep(dt);
        if (R.t > 2.3) {
          const v = pl[R.victim];
          if (NP === 2) { if (v.lives <= 0 || R.sd) endMatch(1 - v.i); else startRound(false); }
          else {
            if (v.lives <= 0) { v.out = true; v.holder.visible = false; fx.texts.add('UIT!', v.x, 3.5, v.z, '#ff7a7a', 1.6); hud.toast(`${names[v.i]} ligt eruit!`, 1800); }
            const alive = pl.filter((p) => !p.out);
            if (alive.length <= 1) endMatch(alive.length ? alive[0].i : sdWinner(v)); else if (R.sd) endMatch(sdWinner(v)); else startRound(false);
          }
        }
      } else if (R.state === 'end') {
        for (const p of pl) stepPlayer(p, dt, false); for (const c of chickens) chickenStep(c, dt);
        if (R.t > 2.2) finishMatch();
      }
      if (R.state === 'play' && !R.sd) hud.setTimer(Math.max(0, R.matchT), 15);
      refreshHud();
    }

    // ---------------- camera ----------------
    const camTgt = new THREE.Vector3(0, 0, 0.6), camDir = new THREE.Vector3(0, Math.sin(1.12), Math.cos(1.12)), camV = new THREE.Vector3();
    let camDist = 40; const cam = { x: 0, z: 0.6, k: 1 };
    const fitPts = [[-AX - 0.5, 1.8, -AZ - 0.5], [AX + 0.5, 1.8, -AZ - 0.5], [-AX - 0.5, 0, AZ + 0.8], [AX + 0.5, 0, AZ + 0.8], [-AX, 4, -AZ - 1], [AX, 4, -AZ - 1]];
    function fitCamera() {
      let lo = 14, hi = 160; const v = new THREE.Vector3();
      for (let it = 0; it < 24; it++) {
        const d = (lo + hi) / 2; camera.position.copy(camTgt).addScaledVector(camDir, d); camera.lookAt(camTgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.97 || v.y > 0.95 || v.y < -0.92) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camDist = hi;
    }
    function updateCamera(dt) {
      camPunch = Math.max(0, camPunch - dt * 1.4);
      let tx = 0, tz = 0.6, k = 1;
      if (camFocus && R.state === 'boom') { tx = camFocus[0] * 0.6; tz = camFocus[1] * 0.6 + 0.6; k = 0.75; }
      else {
        const al = pl.filter((p) => !p.out), xs = al.map((p) => p.x), zs = al.map((p) => p.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
        const half = Math.max(10, sx / 2 + 7, (sz / 2 + 5) * (camera.aspect || 1.7)); k = clamp(half / (AX + 1), 0.62, 1); const lim = (AX + 1) * (1 - k); tx = clamp(mx, -lim, lim); tz = 0.6 + clamp(mz * 0.7, -3.5, 3.5) * (1 - k) / 0.38;
      }
      cam.x = damp(cam.x, tx, 3, dt); cam.z = damp(cam.z, tz, 3, dt); cam.k = damp(cam.k, k, 2.4, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.4, d = camDist * cam.k * (1 - camPunch * 0.05);
      camTgt.set(cam.x, 0, cam.z); camV.copy(camTgt).addScaledVector(camDir, d); camV.x += sway; camera.position.copy(camV); camera.lookAt(camTgt.x + sway * 0.4, 0, camTgt.z);
    }
    fitCamera();

    // ---------------- visuals ----------------
    function visuals(dt) {
      const tt = T + introT, h = holderP();
      for (const p of pl) {
        const hv = Math.hypot(p.vx, p.vz), diving = p.dive > 0;
        p.holder.position.set(p.x, p.y, p.z);
        if (p.out) { p.holder.visible = p.ring.visible = p.shadow.visible = p.tag.visible = p.bubble.visible = p.sbBg.visible = p.sbFg.visible = false; continue; }
        p.c.speed = p.fly > 0 || p.slip > 0 ? 0 : clamp(hv / (RUN * 1.4), 0, 1); p.c.air = p.fly > 0 || (GRAV < 1 && Math.sin(tt * 3 + p.i) > 0.2 && hv > 1);
        if (R.state === 'ready') p.c.faceDir(p.fx, p.fz); else if (diving) p.c.faceDir(p.dvx, p.dvz); else if (hv > 0.8 && p.stun <= 0) p.c.faceDir(p.vx, p.vz);
        if (R.state !== 'end' && R.state !== 'boom') p.c.pose = diving ? 'push' : p.slip > 0 || p.stun > 0 ? 'scared' : p.hasBomb ? 'carry' : 'idle';
        const sp = p.spin > 0 ? (p.spin -= dt * 9, p.spin) : 0;
        p.holder.rotation.y = 0; p.holder.rotation.z = p.slip > 0 ? Math.sin(tt * 18) * 0.45 : p.fly > 0 ? tt * 12 : 0;
        p.holder.rotation.x = diving ? 0.6 : 0; p.holder.visible = p.safe > 0 && R.state === 'play' ? Math.sin(tt * 40) > -0.3 : true;
        p.c.update(dt);
        p.ring.material.color.setHex(p.hasBomb ? 0xff4a2a : colorsHex[p.i]);
        p.ring.position.set(p.x, 0.05, p.z); p.ring.scale.setScalar(p.size * (p.hasBomb ? 1.15 + Math.sin(tt * 10) * 0.08 : 1)); p.ring.material.opacity = p.hasBomb ? 0.95 : 0.7;
        p.shadow.position.set(p.x, 0.03, p.z); p.shadow.scale.setScalar(p.size * (1 - clamp(p.y * 0.1, 0, 0.6)));
        p.tag.position.set(p.x, p.y + 2.6 * p.size + 0.9, p.z + 0.2);
        p.bubble.visible = p.shield > 0 && (p.shield > 3 || Math.sin(tt * 18) > 0); p.bubble.position.set(p.x, p.y + 1.0 * p.size, p.z); p.bubble.scale.setScalar(1.35 * p.size + Math.sin(tt * 5) * 0.04);
        // uithoudingsbalkje voor het poppetje
        const sbv = (p.stam < 0.999 || p.exh) && R.state !== 'ready'; p.sbBg.visible = p.sbFg.visible = sbv;
        if (sbv) { p.sbBg.position.set(p.x, 0.07, p.z + p.R + 0.9); p.sbFg.position.set(p.x - 0.8 * (1 - p.stam), 0.08, p.z + p.R + 0.9); p.sbFg.scale.x = Math.max(0.001, p.stam); p.sbFg.material.color.setHex(p.exh ? 0xff6a5a : p.stam < 0.3 ? 0xffa03a : 0xffe14a); }
        if (p.hasBomb && Math.random() < dt * 22) fx.particles.emit(p.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.6, 0, 1.2, 0, { life: 0.5, size: 0.35, color: Math.random() < 0.5 ? 0xff7a20 : 0xffd060, gravity: -1 });
        if (p.speedT > 0 && Math.random() < dt * 20) fx.particles.emit(p.x, 0.3, p.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), { life: 0.4, size: 0.35, color: 0x6ac8ff, gravity: 0 });
        if (hv > 11 && p.slip <= 0 && p.dive <= 0 && Math.random() < dt * 25) fx.particles.dust(p.x, 0, p.z, 1, 0xcdb8a0);
      }
      // bom
      let bx = 0, by = 0, bz = 0, show = false;
      if (R.state === 'ready' || R.state === 'play') {
        if (h) { bx = h.x; bz = h.z; by = 2.9 * h.size + Math.sin(tt * 8) * 0.12; show = true; }
        else if (R.carry >= 0) { const c = chickens[R.carry]; bx = c.x; bz = c.z; by = 2.3 + Math.sin(tt * 14) * 0.15; show = true; }
      }
      bomb.visible = show; fuseSp.visible = show && R.state === 'play';
      if (show) {
        const heat = 1 - clamp(R.fuse / R.fuse0, 0, 1), pulse = 1 + Math.sin(tt * (6 + heat * 26)) * (0.05 + heat * 0.1), sc = 1.25 * pulse * (h ? Math.max(0.9, h.size) : 1);
        bomb.position.set(bx, by, bz); bomb.scale.setScalar(sc); bomb.rotation.y = tt * 2;
        const hot = Math.sin(tt * (4 + heat * 24)) > 0 && heat > 0.4; bomb.userData.body.material.emissive.setHex(hot ? 0xaa1a08 : 0x000000); bomb.userData.glow.material.opacity = 0.2 + heat * 0.5 * (0.6 + 0.4 * Math.sin(tt * (8 + heat * 20)));
        bomb.userData.spark.scale.setScalar(0.7 + Math.random() * 0.5); fuseSp.position.set(bx, by + 1.35, bz); drawFuse(Math.max(0, Math.ceil(R.fuse)), R.fuse < 4);
        if (R.state === 'play' && Math.random() < dt * 40) fx.particles.emit(bx + 0.16, by + 0.9, bz, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5, { life: 0.4, size: 0.22, color: Math.random() < 0.5 ? 0xffe060 : 0xff8a20, gravity: 6 });
        // gevarenzone in de laatste seconden
        const dz = R.state === 'play' && R.fuse < 3.2 && h; dangerRing.visible = dangerDisc.visible = !!dz;
        if (dz) { dangerRing.position.set(h.x, 0.06, h.z); dangerDisc.position.set(h.x, 0.05, h.z); const fl = 0.5 + 0.5 * Math.sin(tt * 18); dangerRing.material.opacity = 0.5 + fl * 0.4; dangerDisc.material.opacity = 0.1 + fl * 0.12 * (1 - R.fuse / 3.2); }
      } else dangerRing.visible = dangerDisc.visible = false;
      // obstakels hangen in de lucht / vallen
      // kadootjes, schillen
      for (const g of gifts) if (g.on) { g.g.position.set(g.x, 0.25 + Math.abs(Math.sin(g.t * 3)) * 0.45, g.z); g.g.rotation.y = g.t * 1.6; g.g.visible = g.life > 3 || Math.sin(tt * 20) > 0; }
      for (const pe of peels) if (pe.on) { pe.m.visible = pe.life > 3 || Math.sin(tt * 20) > 0; }
      updateCamera(dt);
    }
    function introUpdate(dt) { introT += dt; world.update(introT, dt); for (const p of pl) { p.c.speed = 0; p.c.pose = 'idle'; } for (const c of chickens) chickenStep(c, dt); visuals(dt); }
    function resultUpdate(dt) { T += dt; world.update(T + introT, dt); for (const c of chickens) chickenStep(c, dt); ufoStep(dt); for (const p of pl) stepPlayer(p, dt, false); visuals(dt); }
    startRound(true); R.state = 'ready'; hud.setTimer(null); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); visuals(dt * slow); },
      resultUpdate, introUpdate,
      onResize() { fitCamera(); },
      onSwap() { for (const p of pl) fx.particles.burst(p.x, 1.2, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m || pl[i].out) return; const p = pl[i];
          if (p.hasBomb && R.state === 'play') { R.fuse = Math.max(0.8, R.fuse - 3); fx.texts.add('LONT KORTER!', p.x, 3.8, p.z, '#ff7a7a', 1.4); } else { p.stun = 1.1; p.stam = 0; fx.texts.add('DEURMAN BOOS!', p.x, 3.8, p.z, '#ff7a7a', 1.4); }
          audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4);
        });
      },
      celebrate(w) { for (const p of pl) { p.c.pose = p.i === w ? 'cheer' : 'sad'; p.holder.visible = true; p.holder.rotation.set(0, 0, 0); } },
      dispose() {},
      dbg: {
        state: () => ({ T, rstate: R.state, fuse: +R.fuse.toFixed(2), fuse0: R.fuse0, holder: R.holder, carry: R.carry, count: R.count, matchT: +R.matchT.toFixed(1), sd: R.sd, finished, winner: R.winner, lives: pl.map((p) => p.lives), out: pl.map((p) => p.out), stats,
          pl: pl.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), vx: +p.vx.toFixed(1), vz: +p.vz.toFixed(1), stam: +p.stam.toFixed(2), exh: p.exh, dive: p.dive, safe: +p.safe.toFixed(2), stun: +p.stun.toFixed(2), slip: p.slip, bomb: p.hasBomb, sh: p.shield > 0, spd: p.speedT > 0, tags: p.stats.tags, peels: p.stats.peels, slips: p.stats.slips, dives: p.stats.dives, items: p.stats.items, booms: p.stats.booms, trapCd: p.trapCd })),
          obst: obst.map((o) => ({ k: o.kind, x: +o.x.toFixed(1), z: +o.z.toFixed(1), r: o.r, st: o.state })), peels: peels.filter((q) => q.on).map((q) => ({ x: q.x, z: q.z })), gifts: gifts.filter((g) => g.on).map((g) => g.type), ufo: U.state, chickens: chickens.map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), st: c.state })) }),
        pl, obst, chickens, R, U,
        place: (i, x, z) => { const p = pl[i]; p.x = x; p.z = z; p.vx = p.vz = 0; },
        giveBomb: (i) => { for (const p of pl) p.hasBomb = false; pl[i].hasBomb = true; R.holder = i; R.carry = -1; },
        setFuse: (t) => { R.fuse = t; }, setMatchT: (t) => { R.matchT = t; }, explode, spawnGift: (type) => { const g = gifts.find((q) => q.type === type); if (g && !g.on) { const sp = freeSpot(3, 2) || [0, 5]; g.on = true; g.x = sp[0]; g.z = sp[1]; g.t = 0; g.life = 14; g.g.visible = true; } },
        giveGift: (i, type) => takeGift(gifts.find((q) => q.type === type), pl[i]), ufoNow: () => { U.t = 0; }, stealNow: (ci = 0) => { const h = holderP(); if (h) { const c = chickens[ci]; c.x = h.x + 0.3; c.z = h.z; c.cd = 0; c.state = 'wander'; steal(c, h); } },
        setLives: (...v) => { pl.forEach((p, i) => { if (v[i] != null) p.lives = v[i]; }); refreshHud(); },
      },
    };
  },
};

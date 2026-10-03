import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { HX, TileField, buildWorld, glowSprite } from './hexagone_world.js';

// Zinkende Vloer — duel: een vloer van zeshoekige tegels in drie lagen boven een lavameer (Hex-A-Gone).
//  * elke tegel waar je op staat trilt en stort na ~1 s in; spring over gaten, duw je broer (B) van zijn tegel
//  * wie door alle lagen in de lava valt verliest de ronde; eerste met 2 rondes wint (maximaal 3 rondes)
//  * kristallen: dubbele sprong (klimt zelfs een laag omhoog), superduw, schild, tegels herstellen
//  * gimmick: een draak die tegels wegbrandt (mikt op wie bovenaan staat). Na 16 s NOODVLOER: alles brokkelt sneller af en na 34 s smelt de hele vloer.

const G0 = 34, JUMP_V = 10.8, JUMP2_V = 9.8, RUN = 7.6, DASH_V = 19, DASH_T = 0.2, PR = 0.62;
const WIN_ROUNDS = 2, MAX_ROUNDS = 3;
const SD_AT = 16, MELT_AT = 34, HARD_AT = 46;
const DELAY = [1.05, 0.9, 0.78];        // seconden trillen per ronde
const START_X = 7.27, START_Z = 0.9;

const ITEMS = {
  djump: { name: 'DUBBELE SPRONG!', css: '#7dff7a', hex: 0x7dff7a, w: 30, msg: 'springt twee keer en klimt zelfs een laag omhoog' },
  power: { name: 'SUPERDUW!', css: '#ff6a4a', hex: 0xff6a4a, w: 25, msg: 'de volgende duw is monsterlijk sterk' },
  repair: { name: 'TEGELS HERSTELD!', css: '#6fe8ff', hex: 0x6fe8ff, w: 25, msg: 'de vloer groeit weer aan' },
  shield: { name: 'SCHILD!', css: '#ffe14a', hex: 0xffe14a, w: 20, msg: 'blokkeert één duw of vuurstoot' },
};
function iconTex(kind) {
  return canvasTex(128, 128, (g, w, h) => {
    const col = '#' + ITEMS[kind].hex.toString(16).padStart(6, '0');
    g.translate(64, 64);
    g.fillStyle = 'rgba(20,10,30,.88)'; g.beginPath(); g.arc(0, 0, 58, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.stroke();
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'djump') { for (const y of [-22, 8]) { g.beginPath(); g.moveTo(-26, y + 22); g.lineTo(0, y); g.lineTo(26, y + 22); g.stroke(); } }
    else if (kind === 'power') { g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, r = k % 2 ? 16 : 40; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
    else if (kind === 'repair') { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.52; g.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); } g.closePath(); g.stroke(); g.lineWidth = 8; g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.moveTo(0, -16); g.lineTo(0, 16); g.stroke(); }
    else { g.beginPath(); g.moveTo(0, -38); g.lineTo(32, -26); g.lineTo(28, 10); g.quadraticCurveTo(14, 32, 0, 40); g.quadraticCurveTo(-14, 32, -28, 10); g.lineTo(-32, -26); g.closePath(); g.fill(); }
  });
}
const nameTex = (pp) => canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(10,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(pp.name, w / 2, hh / 2); c.fillStyle = pp.css; c.fillText(pp.name, w / 2, hh / 2); });

export default {
  id: 'hexagone',
  name: 'Zinkende Vloer',
  giver: 'Lavameester Lowie',
  icon: '🌋',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'De vloer van <b>zeshoekige tegels</b> stort in zodra je erop staat! Blijf rennen, spring over gaten en <b>duw</b> je broer van de tegels. Wie in de <b>lava</b> valt, verliest de ronde. Eerste met <b>2 rondes</b> wint!',
  controls: ['{move} rennen', '{a} springen', '{b} duwen!'],
  tip: 'Sta nooit stil! Pak kristallen voor een dubbele sprong (klimt een laag omhoog), superduw, schild of herstel. Pas op voor de draak!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = ctx.twist.speed || 1, TILE_T = 1 / Math.pow(TEMPO, 0.7);     // turbo: tegels sneller, slakkentempo: trager
    const quality = ctx.renderer && ctx.renderer.shadowMap && ctx.renderer.shadowMap.enabled;

    const L = ctx.lights('cave', { shadow: 17, center: [0, -2, 0], fogNear: 40, fogFar: 130 });
    L.hemi.intensity = 1.2; L.hemi.color.set(0xe6ecff); L.hemi.groundColor.set(0xff7a3a);
    L.sun.color.set(0xfff0dc); L.sun.intensity = 2.1; L.sun.position.set(-8, 30, 14);
    camera.fov = 46; camera.updateProjectionMatrix();
    const colorsHex = [0x35c46f, 0x4a8cff];
    const world = buildWorld(ctx, colorsHex);
    const tiles = new TileField(scene, !!quality);

    // ---------------- draak ----------------
    const dragon = new Dragon(0xd0391f, 0.9); dragon.group.position.set(0, 9, -16); scene.add(dragon.group);
    const D = { a: 4.2, state: 'wait', t: 5.5, tx: 0, tz: 0, l: 0, n: 0, hx: 0, hy: 9, hz: 0, blend: 0, ax: 0, az: 0, ay: 6.5 };
    const warn = [0, 1].map(() => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
      g.add(new THREE.Mesh(new THREE.RingGeometry(2.45, 2.8, 32), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, depthWrite: false })));
      g.children.forEach((m) => { m.rotation.x = -Math.PI / 2; }); g.visible = false; scene.add(g); return { g, on: false, x: 0, z: 0, l: 0 };
    });

    // ---------------- spelers ----------------
    const pl = players.map((pp, i) => {
      const c = makeBrother(i), size = pv.size(i), k = 2.6 / c.height * size;
      const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(k); scene.add(holder);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 24), new THREE.MeshBasicMaterial({ color: colorsHex[i], transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6; scene.add(ring);
      const shadow = P.shadowBlob(0.9); scene.add(shadow);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(pp), transparent: true, depthTest: false })); tag.scale.set(2.2, 0.82, 1); tag.renderOrder = 15; scene.add(tag);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })); bubble.visible = false; scene.add(bubble);
      return { i, c, holder, k, size, R: PR * size, ring, shadow, tag, bubble, wins: 0, dir: i ? -1 : 1,
        x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, fx: i ? -1 : 1, fz: 0, grounded: true, coyote: 0, extra: 0, extraLeft: 0, djT: 0, power: 0, shield: 0, cd: 0, dashT: 0, dvx: 0, dvz: 0, hitDone: true, stun: 0, inv: 0,
        dead: false, floatY: 0, lastL: 0, gy: 0, sq: 0, pushes: 0, stats: { pushes: 0, hits: 0, items: 0 } };
    });

    // ---------------- items (kristallen) ----------------
    const items = Array.from({ length: 3 }, () => {
      const g = new THREE.Group(); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); sp.scale.set(1.5, 1.5, 1); sp.renderOrder = 12; g.add(sp);
      const gl = glowSprite(0xffffff, 3.2, 0.7); g.add(gl);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      g.visible = false; ring.visible = false; scene.add(g);
      return { on: false, g, sp, gl, ring, type: 'djump', l: 0, k: 0, x: 0, z: 0, y: 0, t: 0, life: 0, fall: 0 };
    });
    const icons = {}; for (const k of Object.keys(ITEMS)) icons[k] = iconTex(k);

    // ---------------- toestand ----------------
    const R = { n: 0, state: 'ready', t: 0, tp: 0, sd: false, melt: false, loser: -1, meltN: 0, meltT: 0, itemT: 4 };
    let T = 0, introT = 0, finished = false, started = false, slow = 1, slowT = 0, lastShakeSfx = 0, lastFallSfx = 0, lastLavaFx = 0, camPunch = 0, over2 = 0;
    const stats = { tiles: 0, pushes: 0, items: 0, fires: 0 };
    const delayNow = () => DELAY[Math.min(R.n - 1, 2)] * TILE_T * lerp(1, 0.5, clamp((R.tp - SD_AT) / 14, 0, 1));
    const dots = (i) => '●'.repeat(pl[i].wins) + '○'.repeat(WIN_ROUNDS - pl[i].wins);
    function refreshHud() {
      hud.setScore(`${names[0]} ${dots(0)}  –  ${dots(1)} ${names[1]}`);
      for (const p of pl) {
        const bits = [R.n ? `Ronde ${R.n}` : ''];
        if (p.djT > 0) bits.push('2x sprong'); if (p.power) bits.push('SUPERDUW'); if (p.shield > 0) bits.push('schild');
        bits.push(p.cd > 0 ? `duw ${p.cd.toFixed(1)}s` : 'duw klaar');
        const txt = bits.filter(Boolean).join(' · '); if (p.lastTxt !== txt) { p.lastTxt = txt; hud.setPlayerInfo(p.i, txt); }
      }
    }

    // ---------------- tegel-callbacks ----------------
    tiles.onShake = (l, k, burn) => {
      const t = tiles.list[k];
      if (T - lastShakeSfx > 0.07) { lastShakeSfx = T; audio.sfx('scrape', { vol: 0.18, rate: 1.6 + Math.random() * 0.6 }); }
      fx.particles.dust(t.x, HX.Y[l] + 0.05, t.z, 3, burn ? 0xffa030 : 0xcdb8a0);
    };
    tiles.onFall = (l, k) => {
      const t = tiles.list[k]; stats.tiles++;
      fx.particles.burst(t.x, HX.Y[l], t.z, { count: 7, speed: 2.5, up: 0.6, life: 0.7, size: 0.28, colors: [0xcdb8a0, 0x9a8a82, 0xffa040], gravity: 9 });
      if (T - lastFallSfx > 0.09) { lastFallSfx = T; audio.sfx('thud', { vol: 0.28, rate: 1.2 + Math.random() * 0.5 }); }
    };
    tiles.onLava = (x, z) => {
      if (T - lastLavaFx > 0.12) { lastLavaFx = T; fx.particles.burst(x, HX.LAVA + 0.4, z, { count: 6, speed: 3, up: 3, life: 0.9, size: 0.4, colors: [0xff7a20, 0xffc040], gravity: 8 }); audio.sfx('splash', { vol: 0.12, rate: 0.6 }); }
    };

    // ---------------- ronde-flow ----------------
    function resetPlayer(p) {
      p.x = (p.i ? 1 : -1) * START_X; p.z = START_Z; p.y = 0; p.vx = p.vz = p.vy = 0; p.grounded = true; p.dead = false; p.extra = p.djT = p.power = p.shield = 0; p.extraLeft = 0;
      p.cd = 0; p.dashT = 0; p.stun = 0; p.inv = 0; p.fx = p.dir; p.fz = 0; p.holder.visible = true; p.holder.rotation.set(0, 0, 0); p.c.pose = 'idle'; p.c.faceDir(p.i ? -1 : 1, 0);
    }
    function clearItems() { for (const it of items) { it.on = false; it.g.visible = false; it.ring.visible = false; } }
    function startRound() {
      R.n++; R.state = 'ready'; R.t = 0; R.tp = 0; R.sd = R.melt = false; R.loser = -1; R.meltN = 0; R.meltT = 0; R.itemT = 4.5;
      if (R.n > 1) tiles.resetAll();
      for (const p of pl) resetPlayer(p);
      clearItems(); for (const w of warn) { w.on = false; w.g.visible = false; }
      D.state = 'wait'; D.t = R.n === 1 ? 6 : 5;
      slow = 1; refreshHud();
      if (R.n > 1) { hud.showBig(`RONDE ${R.n}`, 1000, '#ffd23f'); audio.sfx('bell', { vol: 0.6 }); fx.particles.ring(0, 0.5, 0, { count: 40, speed: 12, color: 0xffd060, size: 0.4, life: 0.8 }); }
    }
    function die(p) {
      if (p.dead) return; p.dead = true; p.deadAt = R.tp + Math.random() * 0.001;
      p.holder.visible = false; p.ring.visible = p.shadow.visible = p.tag.visible = p.bubble.visible = false;
      fx.particles.burst(p.x, HX.LAVA + 0.5, p.z, { count: 60, speed: 8, up: 2.6, life: 1.6, size: 0.7, colors: [0xff5a10, 0xffc040, 0xff8a20, 0xfff0a0], gravity: 10 });
      fx.particles.ring(p.x, HX.LAVA + 0.6, p.z, { count: 24, speed: 6, color: 0xffa030, size: 0.5, life: 0.9 });
      fx.texts.add('PLOP!', p.x, HX.LAVA + 3, p.z, '#ff9a3a', 2.0);
      audio.sfx('splash', { vol: 0.8 }); audio.sfx('sizzle', { vol: 0.8 }); audio.sfx('boing', { vol: 0.4, rate: 0.5 }); ctx.shake(0.5);
    }
    function endRound(loser) {
      R.state = 'over'; R.t = 0; R.loser = loser; const w = pl[1 - loser]; w.wins++; slow = 0.4; slowT = 1.1; camPunch = 1;
      w.c.pose = 'cheer'; w.floatY = w.y + 1.3; w.vx = w.vz = 0; w.vy = 0; w.bubble.visible = true; w.shield = 0;
      hud.setTimer(null); refreshHud();
      const done = w.wins >= WIN_ROUNDS || R.n >= MAX_ROUNDS;
      hud.showBig(done ? `${names[w.i]} WINT!` : `${names[w.i]} wint ronde ${R.n}!`, 1700, w.i ? '#8fb8ff' : '#7dffb0');
      audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.5 });
      fx.particles.burst(w.x, w.y + 1.5, w.z, { count: 70, speed: 8, up: 1.6, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
    }
    function finishMatch() {
      if (finished) return; finished = true;
      const w = pl[0].wins === pl[1].wins ? (pl[0].stats.pushes >= pl[1].stats.pushes ? 0 : 1) : (pl[0].wins > pl[1].wins ? 0 : 1);
      const jokes = [`${names[w]} danst over de lava en laat ${names[1 - w]} als gesmolten kaas achter.`, `${names[w]} is de Koning van de Kokende Vloer! ${names[1 - w]} ruikt een beetje naar gebakken ui.`, `${names[1 - w]} nam een warm bad in de lava. ${names[w]} wint met droge voeten.`, `De draak vond ${names[w]} de aardigste. ${names[1 - w]} is te heet gebakken.`];
      ctx.finishPvp({ winner: w, score: [pl[0].wins, pl[1].wins], delay: 700, summary: `${pick(jokes)} Er stortten ${stats.tiles} tegels in${stats.fires ? `, de draak spuwde ${stats.fires}x vuur` : ''} en er werd ${stats.pushes}x geduwd.` });
    }

    // ---------------- items ----------------
    function pickType() { const tot = Object.values(ITEMS).reduce((a, t) => a + t.w, 0); let r = Math.random() * tot; for (const k in ITEMS) { r -= ITEMS[k].w; if (r <= 0) return k; } return 'djump'; }
    function spawnItem() {
      const it = items.find((q) => !q.on); if (!it) return;
      const ls = pl.map((p) => clamp(Math.round(-p.y / 3.2), 0, 2)), low = pl[0].y < pl[1].y ? 0 : 1;
      const layer = Math.random() < 0.55 ? ls[low] : Math.random() < 0.6 ? Math.min(ls[0], ls[1]) : ls[1 - low];
      for (let tries = 0; tries < 20; tries++) {
        const s = tiles.randomSolid(layer); if (!s) continue; const [l, k] = s, t = tiles.list[k];
        if (pl.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 3.2 && Math.abs(p.y - HX.Y[l]) < 2)) continue;
        if (items.some((o) => o.on && o.l === l && o.k === k)) continue;
        let type = pickType(); if (pl[low].y < pl[1 - low].y - 2.5 && Math.random() < 0.45) type = Math.random() < 0.6 ? 'djump' : 'repair';   // comeback voor wie onderaan zit
        it.on = true; it.type = type; it.l = l; it.k = k; it.x = t.x; it.z = t.z; it.y = HX.Y[l] + 1.1; it.t = 0; it.life = 14; it.fall = 0;
        it.sp.material.map = icons[type]; it.sp.material.needsUpdate = true; it.gl.material.color.setHex(ITEMS[type].hex); it.ring.material.color.setHex(ITEMS[type].hex);
        it.g.visible = it.ring.visible = true; it.g.position.set(t.x, it.y, t.z); it.ring.position.set(t.x, HX.Y[l] + 0.06, t.z);
        fx.particles.ring(t.x, HX.Y[l] + 0.4, t.z, { count: 16, speed: 3, color: ITEMS[type].hex, size: 0.3, life: 0.6 }); audio.sfx('sparkle', { vol: 0.4 });
        return;
      }
    }
    function takeItem(it, p) {
      it.on = false; it.g.visible = it.ring.visible = false; const d = ITEMS[it.type]; stats.items++; p.stats.items++;
      fx.particles.burst(p.x, p.y + 1, p.z, { count: 36, speed: 6, up: 1.4, life: 0.9, size: 0.4, colors: [d.hex, 0xffffff], gravity: 4 });
      fx.texts.add(d.name, p.x, p.y + 3.1, p.z, d.css, 1.6); audio.sfx('powerup', { vol: 0.8 }); ctx.shake(0.2);
      hud.toast(`${names[p.i]} pakt een kristal: ${d.name} (${d.msg})`, 1900);
      if (it.type === 'djump') { p.djT = 16; p.extra = 1; p.extraLeft = 1; }
      else if (it.type === 'power') p.power = 14;
      else if (it.type === 'shield') p.shield = 14;
      else {
        const n = tiles.restoreArea(p.x, p.z, 5.2, null);
        fx.particles.ring(p.x, p.y + 0.3, p.z, { count: 36, speed: 9, color: 0x6fe8ff, size: 0.4, life: 0.7 }); audio.sfx('good', { vol: 0.6 });
        if (!n) fx.texts.add('(alles heel!)', p.x, p.y + 2.4, p.z, '#cfeaff', 1);
      }
    }

    // ---------------- draak ----------------
    function dragonStep(dt) {
      D.a += dt * 0.42;
      const ox = Math.cos(D.a) * 16, oz = -8.5 + Math.sin(D.a) * 3, oy = 5.4 + Math.sin(D.a * 3.1) * 0.6;
      D.blend = damp(D.blend, D.state === 'aim' || D.state === 'breathe' ? 1 : 0, D.state === 'aim' ? 2.2 : 1.4, dt);
      const px = lerp(ox, D.ax, D.blend), pz = lerp(oz, D.az, D.blend), py = lerp(oy, D.ay, D.blend);
      const g = dragon.group, hx = px - g.position.x, hz = pz - g.position.z;
      const tgt = D.blend > 0.5 && warn[0].on ? Math.atan2(warn[0].x - px, warn[0].z - pz) : Math.atan2(hx, hz);
      g.position.set(px, py, pz); if (hx * hx + hz * hz > 1e-6 || D.blend > 0.5) g.rotation.y = D.blend > 0.5 ? tgt : Math.atan2(-Math.sin(D.a) * 16, Math.cos(D.a) * 3);
      g.rotation.z = -0.18 * (1 - D.blend); dragon.update(dt);
      D.hx = px; D.hy = py + 0.8; D.hz = pz;
      if (R.state !== 'play') return;
      const f = lerp(1, 0.45, clamp((R.tp - SD_AT) / 14, 0, 1));
      if (D.state === 'wait') {
        D.t -= dt;
        if (D.t <= 0) {
          // mik op wie het hoogst staat (gelijk: willekeurig), met een kleine voorsprong
          const a = pl[0], b = pl[1]; const tgt = Math.abs(a.y - b.y) > 1 ? (a.y > b.y ? a : b) : (Math.random() < 0.5 ? a : b);
          const n = R.sd ? 2 : 1; D.n = n; D.state = 'aim'; D.t = 1.5 * Math.min(1, f + 0.25);
          [tgt, tgt === a ? b : a].slice(0, n).forEach((p, wi) => {
            const w = warn[wi]; w.on = true; w.g.visible = true; w.x = p.x + p.vx * 0.35 + (wi ? rand(-2, 2) : 0); w.z = p.z + p.vz * 0.35 + (wi ? rand(-2, 2) : 0); const l = tiles.support(w.x, w.z, p.y, 1.5); w.l = l >= 0 ? l : clamp(Math.round(-p.y / 3.2), 0, 2);
          });
          D.ax = warn[0].x + (warn[0].x > 0 ? -5.5 : 5.5); D.az = warn[0].z - 6; D.ay = 5.0; hud.toast('🐉 De draak mikt: ren weg van de rode cirkel!', 1700); audio.tone(110, 0.9, { type: 'sawtooth', vol: 0.2, slide: 70 }); audio.sfx('creak', { vol: 0.5 });
        }
      } else if (D.state === 'aim') {
        D.t -= dt; for (const w of warn) if (w.on) { w.g.position.set(w.x, HX.Y[w.l] + 0.07, w.z); const s = 1 + Math.sin(T * 14) * 0.06; w.g.scale.set(s, 1, s); w.g.children[0].material.opacity = 0.25 + Math.abs(Math.sin(T * 9)) * 0.3; }
        if (D.t <= 0) { D.state = 'breathe'; D.t = 0.4; audio.sfx('whoosh', { vol: 0.7 }); audio.sfx('shoot', { vol: 0.3, rate: 0.4 }); }
      } else if (D.state === 'breathe') {
        D.t -= dt;
        for (const w of warn) if (w.on) for (let n = 0; n < 5; n++) { const k = Math.random(), x = lerp(D.hx, w.x, k), y = lerp(D.hy, HX.Y[w.l], k), z = lerp(D.hz, w.z, k); fx.particles.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, { life: 0.4, size: 0.7, color: Math.random() < 0.5 ? 0xff7a20 : 0xffd060, gravity: 0 }); }
        if (D.t <= 0) {
          for (const w of warn) if (w.on) {
            w.on = false; w.g.visible = false; stats.fires++;
            tiles.shakeArea(w.l, w.x, w.z, 2.6, 0.5, true);
            for (const p of pl) if (p.shield > 0 && !p.dead && Math.hypot(p.x - w.x, p.z - w.z) < 3 && Math.abs(p.y - HX.Y[w.l]) < 1.5) { p.shield = 0; tiles.restoreArea(p.x, p.z, 1.3, [w.l]); fx.texts.add('SCHILD HOUDT!', p.x, p.y + 3, p.z, '#ffe14a', 1.3); fx.particles.burst(p.x, p.y + 1, p.z, { count: 24, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 3 }); }
            fx.particles.burst(w.x, HX.Y[w.l] + 0.6, w.z, { count: 60, speed: 7, up: 2.2, life: 1.0, size: 0.8, colors: [0xff5a10, 0xffc040, 0xffe080], gravity: 3 });
            fx.particles.ring(w.x, HX.Y[w.l] + 0.4, w.z, { count: 30, speed: 10, color: 0xffa030, size: 0.5, life: 0.5 });
            audio.sfx('explode', { vol: 0.55 }); ctx.shake(0.45);
          }
          D.state = 'wait'; D.t = rand(5.5, 7.5) * f;
        }
      }
    }

    // ---------------- spelersfysica ----------------
    function pushHit(p, o) {
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1e-3, nx = dx / d, nz = dz / d;
      p.hitDone = true; p.dashT = 0; p.stats.pushes++; stats.pushes++;
      if (o.shield > 0) {
        o.shield = 0; p.stun = 0.6; p.vx = -nx * 8; p.vz = -nz * 8; o.vx += nx * 3; o.vz += nz * 3;
        fx.texts.add('BOING!', o.x, o.y + 3, o.z, '#ffe14a', 1.5); fx.particles.burst(o.x, o.y + 1, o.z, { count: 30, speed: 6, up: 1, life: 0.6, size: 0.45, colors: [0xbff4ff, 0xffe14a, 0xffffff], gravity: 3 });
        audio.sfx('boing', { vol: 0.7 }); audio.sfx('ding', { vol: 0.4 }); ctx.shake(0.25); return;
      }
      const sup = p.power > 0; if (sup) p.power = 0;
      const kb = 12.5 * (sup ? 1.9 : 1) * Math.pow(p.size / o.size, 0.6);
      o.vx = nx * kb; o.vz = nz * kb; o.vy = o.grounded ? 5.2 : Math.max(o.vy, 3); o.grounded = false; o.stun = 0.6; o.inv = 0.55; o.dashT = 0; o.stats.hits++;
      p.vx = -nx * 2; p.vz = -nz * 2; slow = 0.1; slowT = 0.07; ctx.shake(sup ? 0.7 : 0.4); camPunch = Math.max(camPunch, 0.5);
      fx.texts.add(sup ? 'SUPER-BAM!' : 'BAM!', o.x, o.y + 3, o.z, sup ? '#ff6a4a' : '#ffd23f', sup ? 1.9 : 1.5);
      fx.particles.burst((o.x + p.x) / 2, o.y + 1, (o.z + p.z) / 2, { count: sup ? 50 : 26, speed: sup ? 9 : 6, up: 1, life: 0.6, size: 0.45, colors: [0xffffff, 0xffe14a, 0xffa020], gravity: 5 });
      fx.particles.ring(o.x, o.y + 0.4, o.z, { count: 24, speed: sup ? 11 : 7, color: sup ? 0xff6a4a : 0xffe14a, size: 0.4, life: 0.5 });
      audio.sfx('hit', { vol: 0.9 }); audio.sfx('whoosh', { vol: 0.4 }); if (sup) audio.sfx('explode', { vol: 0.4 });
      const k = tiles.kAt(o.x, o.z); if (k >= 0 && R.state === 'play') { const l = clamp(Math.round(-o.y / 3.2), 0, 2); tiles.shake(l, k, 0.4); }
    }
    function stepPlayer(p, dt, live) {
      const inp = pv.input(p.i), o = pl[1 - p.i];
      p.cd = Math.max(0, p.cd - dt); p.stun = Math.max(0, p.stun - dt); p.inv = Math.max(0, p.inv - dt); p.coyote = Math.max(0, p.coyote - dt);
      if (p.djT > 0) { p.djT -= dt; if (p.djT <= 0) { p.extra = 0; p.extraLeft = 0; } }
      if (p.power > 0) p.power = Math.max(0, p.power - dt); if (p.shield > 0) p.shield = Math.max(0, p.shield - dt);
      let mx = 0, mz = 0;
      if (live && p.stun <= 0) { mx = inp.x; mz = inp.y; const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; } }
      if (Math.hypot(mx, mz) > 0.25) { p.fx = mx; p.fz = mz; }
      // duw / schouderbots
      if (live && inp.bP && p.cd <= 0 && p.stun <= 0 && p.dashT <= 0) {
        let dx = p.fx, dz = p.fz, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const ox = o.x - p.x, oz = o.z - p.z, od = Math.hypot(ox, oz);
        if (!o.dead && od < 5 && od > 0.01 && (dx * ox + dz * oz) / od > 0.5) { dx = dx * 0.4 + ox / od * 0.6; dz = dz * 0.4 + oz / od * 0.6; dl = Math.hypot(dx, dz); dx /= dl; dz /= dl; }   // hulp bij richten
        const trailing = p.wins < o.wins;
        p.dashT = DASH_T; p.dvx = dx; p.dvz = dz; p.fx = dx; p.fz = dz; p.hitDone = false; p.cd = trailing ? 1.05 : 1.5; p.c.swing(); audio.sfx('swing', { vol: 0.5 });
        fx.particles.burst(p.x, p.y + 0.5, p.z, { count: 6, speed: 3, up: 0.5, life: 0.4, size: 0.3, colors: [0xffffff, 0xffd060], gravity: 4 });
      }
      const spd = RUN * pv.speed(p.i), g = G0 * GRAV;
      if (p.dashT > 0) {
        p.dashT -= dt; p.vx = p.dvx * DASH_V * (0.7 + 0.3 * pv.speed(p.i)); p.vz = p.dvz * DASH_V * (0.7 + 0.3 * pv.speed(p.i));
        if (!p.hitDone && !o.dead && o.inv <= 0 && Math.hypot(o.x - p.x, o.z - p.z) < p.R + o.R + 0.55 && Math.abs(o.y - p.y) < 1.6) pushHit(p, o);
        if (Math.random() < dt * 60) fx.particles.emit(p.x - p.dvx * 0.4, p.y + 0.5, p.z - p.dvz * 0.4, 0, 0.3, 0, { life: 0.3, size: 0.5, color: p.i ? 0x8fb8ff : 0x7dffb0, gravity: 0 });
      } else if (p.stun > 0) {
        const f = Math.exp(-lerp(1.4, 0.35, SLIP) * dt); p.vx *= f; p.vz *= f;
      } else {
        const acc = p.grounded ? lerp(18, 1.8, SLIP) : lerp(7, 1.2, SLIP), k = 1 - Math.exp(-acc * dt);
        p.vx += (mx * spd - p.vx) * k; p.vz += (mz * spd - p.vz) * k;
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      // springen
      if (live && p.stun <= 0 && inp.aP) {
        if (p.grounded || p.coyote > 0) { p.vy = JUMP_V; p.grounded = false; p.coyote = 0; p.c.jump(); audio.sfx('jump', { vol: 0.35 }); fx.particles.dust(p.x, p.y, p.z, 4, 0xcdb8a0); }
        else if (p.extraLeft > 0) { p.extraLeft--; p.vy = JUMP2_V; p.c.jump(); audio.sfx('jump', { vol: 0.4, rate: 1.4 }); fx.particles.ring(p.x, p.y + 0.1, p.z, { count: 14, speed: 4, color: 0x7dff7a, size: 0.3, life: 0.4 }); }
      }
      if (live && inp.aR && p.vy > 4.5) p.vy *= 0.6;
      // zwaartekracht + grond
      const was = p.grounded, Ly = tiles.support(p.x, p.z, p.y, 0.3), gy = Ly >= 0 ? HX.Y[Ly] : -999;
      p.vy -= g * (p.vy < 0 ? 1.12 : 1) * dt; p.y += p.vy * dt;
      p.grounded = false;
      if (Ly >= 0 && p.vy <= 0 && p.y <= gy + 0.001) {
        const impact = -p.vy; p.y = gy; p.vy = 0; p.grounded = true; p.coyote = 0.1; p.extraLeft = p.extra; p.lastL = Ly;
        if (!was && impact > 6) { p.sq = clamp(impact / 40, 0.08, 0.3); fx.particles.dust(p.x, p.y, p.z, 5, 0xcdb8a0); if (impact > 9) { audio.sfx('land', { vol: clamp(impact / 25, 0.15, 0.5) }); } if (impact > 16) ctx.shake(0.12); }
        if (live && R.state === 'play') { const k = tiles.kAt(p.x, p.z); if (k >= 0) tiles.shake(Ly, k, delayNow()); }
      } else if (was && p.vy <= 0 && !p.grounded) p.coyote = 0.11;
      if (!p.dead && p.y < HX.LAVA + 1.4) die(p);
    }

    // ---------------- hoofd-update ----------------
    function update(dt0) {
      slowT -= dt0; if (slowT <= 0) slow = Math.min(1, slow + dt0 * 6);
      const dt = dt0 * slow; T += dt; R.t += dt0;
      world.update(T + introT, dt0); tiles.update(dt);
      if (R.state === 'ready') {
        for (const p of pl) { p.vx = p.vz = p.vy = 0; p.y = 0; p.grounded = true; p.extraLeft = 0; }   // tegels groeien nog: even blijven staan
        if (R.t >= (R.n === 1 ? 0.15 : 1.7)) { R.state = 'play'; R.t = 0; if (R.n > 1) { hud.showBig('GA!', 600, '#ffe14a'); audio.sfx('go'); } }
      } else if (R.state === 'play') {
        R.tp += dt;
        for (const p of pl) stepPlayer(p, dt, true);
        // noodvloer
        if (!R.sd && R.tp >= SD_AT) { R.sd = true; hud.showBig('NOODVLOER!', 1200, '#ff6a3a'); hud.toast('De vloer brokkelt steeds sneller af. Alle tegels storten straks in!', 2400); audio.sfx('creak', { vol: 0.6 }); audio.sfx('explode', { vol: 0.35 }); ctx.shake(0.5); }
        if (R.sd && !R.melt) { R.meltT -= dt; if (R.meltT <= 0) { R.meltT = lerp(0.8, 0.16, clamp((R.tp - SD_AT) / (MELT_AT - SD_AT), 0, 1)); const s = tiles.randomSolid(); if (s) tiles.shake(s[0], s[1], delayNow() * 0.8); } }
        if (!R.melt && R.tp >= MELT_AT) {
          R.melt = true; hud.showBig('VLOER SMELT!', 1300, '#ff3a2a'); audio.sfx('explode', { vol: 0.7 }); ctx.shake(0.7);
          for (let l = 0; l < tiles.L; l++) for (let k = 0; k < tiles.K; k++) tiles.shake(l, k, 0.5 + Math.random() * 3.4);
        }
        if (R.tp > 12) { R.itemT -= dt; if (R.itemT <= 0 && items.filter((q) => q.on).length < 2 && !R.melt) { spawnItem(); R.itemT = rand(6, 9); } else if (R.itemT <= 0) R.itemT = 3; }
        else if (R.tp > 3.5) { R.itemT -= dt; if (R.itemT <= 0 && items.filter((q) => q.on).length < 2) { spawnItem(); R.itemT = rand(7, 10); } }
        // soft botsing tussen de spelers
        const a = pl[0], b = pl[1];
        if (!a.dead && !b.dead && Math.abs(a.y - b.y) < 1.4) {
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.R + b.R;
          if (d < m && d > 1e-4) { const pen = (m - d), wa = b.size / (a.size + b.size); a.x -= dx / d * pen * wa; a.z -= dz / d * pen * wa; b.x += dx / d * pen * (1 - wa); b.z += dz / d * pen * (1 - wa); }
        }
        // einde van de ronde
        const dead = pl.filter((p) => p.dead);
        if (dead.length) endRound(dead.length === 2 ? (Math.random() < 0.5 ? 0 : 1) : dead[0].i);
        else if (R.tp > HARD_AT) endRound(pl[0].y === pl[1].y ? (Math.random() < 0.5 ? 0 : 1) : (pl[0].y < pl[1].y ? 0 : 1));
      } else if (R.state === 'over') {
        for (const p of pl) {
          if (p.i === R.loser) stepPlayer(p, dt, false);
          else { p.y = damp(p.y, p.floatY, 3, dt); p.vx = p.vz = 0; p.grounded = false; }
        }
        if (R.t > 2.3) {
          const w = pl[1 - R.loser];
          if (w.wins >= WIN_ROUNDS || R.n >= MAX_ROUNDS) finishMatch(); else startRound();
        }
      }
      dragonStep(dt);
      for (const it of items) {
        if (!it.on) continue;
        it.t += dt; it.life -= dt;
        if (!tiles.solid(it.l, it.k) && !it.fall) it.fall = 1;
        if (it.fall) { it.fall += dt * 28; it.y -= it.fall * dt; if (it.y < HX.LAVA) { it.on = false; it.g.visible = it.ring.visible = false; } }
        else if (it.life <= 0) { it.on = false; it.g.visible = it.ring.visible = false; fx.particles.burst(it.x, it.y, it.z, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.3, color: ITEMS[it.type].hex, gravity: 2 }); }
        else for (const p of pl) if (!p.dead && R.state === 'play' && Math.hypot(p.x - it.x, p.z - it.z) < 1.35 + p.R * 0.5 && Math.abs(p.y + 0.9 - it.y) < 1.8) { takeItem(it, p); break; }
      }
      if (R.state === 'play') hud.setTimer(Math.max(0, MELT_AT - R.tp), 10);
      refreshHud();
    }

    // ---------------- camera ----------------
    const camTgt = new THREE.Vector3(0, -2.2, 0.8), camDir = new THREE.Vector3(0, Math.sin(1.24), Math.cos(1.24)), camV = new THREE.Vector3();
    let camDist = 36;
    const fitPts = [[-12.8, 1.5, -8.0], [12.8, 1.5, -8.0], [-12.8, 0, 8.6], [12.8, 0, 8.6], [-12.8, -6.4, 8.6], [12.8, -6.4, 8.6]];
    function fitCamera() {
      let lo = 14, hi = 150; const v = new THREE.Vector3();
      for (let it = 0; it < 24; it++) {
        const d = (lo + hi) / 2; camera.position.copy(camTgt).addScaledVector(camDir, d); camera.lookAt(camTgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.96 || v.y > 0.94 || v.y < -0.88) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camDist = hi;
    }
    const cam = { x: 0, y: -2.2, z: 0.8, k: 1 };
    function updateCamera(dt) {
      camPunch = Math.max(0, camPunch - dt * 1.5);
      // zoom naar de actie: tussen de levende spelers, nooit verder dan de hele arena
      const al = pl.filter((p) => !p.dead); if (!al.length) al.push(pl[0]);
      let mx = 0, my = 0, mz = 0; for (const p of al) { mx += p.x / al.length; my += p.y / al.length; mz += p.z / al.length; }
      const sx = al.length > 1 ? Math.abs(al[0].x - al[1].x) : 0, sz = al.length > 1 ? Math.abs(al[0].z - al[1].z) : 0, sy = al.length > 1 ? Math.abs(al[0].y - al[1].y) : 0;
      const half = Math.max(9, sx / 2 + 6.5, (sz / 2 + 5) * (camera.aspect || 1.7), sy * 1.6 + 6);
      const k = clamp(half / 12.8, 0.62, 1), lim = 12.8 * (1 - k);
      const tx = clamp(mx, -lim, lim), tz = 0.8 + clamp(mz * 0.7, -4, 4), ty = lerp(-2.2, my - 0.8, 0.55);
      cam.x = damp(cam.x, tx, 2.6, dt); cam.z = damp(cam.z, tz, 2.6, dt); cam.y = damp(cam.y, ty, 2.6, dt); cam.k = damp(cam.k, k, 2, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.4, d = camDist * cam.k * (1 - camPunch * 0.05);
      camTgt.set(cam.x, cam.y, cam.z); camV.copy(camTgt).addScaledVector(camDir, d); camV.x += sway; camera.position.copy(camV); camera.lookAt(camTgt.x + sway * 0.4, camTgt.y, camTgt.z);
    }
    fitCamera(); camTgt.set(0, -2.2, 0.8);

    // ---------------- visuals ----------------
    function visuals(dt) {
      const tt = T + introT;
      for (const p of pl) {
        if (p.dead) continue;
        p.sq = damp(p.sq, 0, 9, dt);
        const hv = Math.hypot(p.vx, p.vz);
        p.holder.position.set(p.x, p.y, p.z);
        const falling = !p.grounded && p.vy < -9 && tiles.support(p.x, p.z, p.y, 0.3) < 0;
        p.c.speed = p.grounded && p.stun <= 0 ? clamp(hv / RUN, 0, 1) : 0; p.c.air = !p.grounded;
        if (hv > 1 && p.dashT <= 0 && p.stun <= 0) p.c.faceDir(p.vx, p.vz); else if (p.dashT > 0) p.c.faceDir(p.dvx, p.dvz); else if (Math.abs(p.fx) + Math.abs(p.fz) > 0.1 && R.state === 'ready') p.c.faceDir(p.fx, p.fz);
        if (R.state !== 'over' || p.i === R.loser) p.c.pose = p.dashT > 0 ? 'push' : p.stun > 0 || falling ? 'scared' : 'idle';
        p.c.squash = Math.max(p.c.squash, p.sq);
        p.holder.rotation.z = falling ? Math.sin(tt * 14 + p.i) * 0.35 : p.stun > 0 ? Math.sin(tt * 30) * 0.08 : 0;
        p.c.update(dt);
        // ring / schaduw op het draagvlak
        const Ls = tiles.support(p.x, p.z, p.y, 0.6), gy = Ls >= 0 ? HX.Y[Ls] : HX.LAVA;
        p.ring.position.set(p.x, gy + 0.07, p.z); p.ring.scale.setScalar(p.size * (1 + Math.sin(tt * 6 + p.i) * 0.04)); p.ring.visible = Ls >= 0;
        p.shadow.position.set(p.x, gy + 0.05, p.z); p.shadow.scale.setScalar(p.size * (1 - clamp((p.y - gy) * 0.12, 0, 0.5))); p.shadow.visible = Ls >= 0;
        p.tag.position.set(p.x, p.y + 2.5 * p.size + 0.5, p.z + 0.3); p.tag.visible = true;
        const sh = p.shield > 0 || (R.state === 'over' && p.i !== R.loser);
        p.bubble.visible = sh && (p.shield > 3 || p.shield <= 0 || Math.sin(tt * 18) > 0); p.bubble.position.set(p.x, p.y + 0.9 * p.size, p.z); p.bubble.scale.setScalar(1.15 * p.size + Math.sin(tt * 5) * 0.04);
        if (p.power > 0 && Math.random() < dt * 25) fx.particles.emit(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.4 + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 0.8, 0, 1.5, 0, { life: 0.5, size: 0.3, color: 0xff6a4a, gravity: -1 });
        if (p.djT > 0 && Math.random() < dt * 8) fx.particles.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.6, 0, 0.8, 0, { life: 0.5, size: 0.25, color: 0x7dff7a, gravity: -0.5 });
        // trillende voeten: waarschuwing dat je tegel instort
        if (p.grounded && R.state === 'play') { const k = tiles.kAt(p.x, p.z); if (k >= 0 && tiles.st[p.lastL * tiles.K + k] === 1 && Math.random() < dt * 22) fx.particles.emit(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, { life: 0.35, size: 0.22, color: 0xffa040, gravity: 2 }); }
      }
      for (const it of items) if (it.on) { const b = Math.sin(tt * 3.2 + it.x) * 0.18; it.g.position.set(it.x, it.y + b, it.z); it.sp.scale.setScalar(1.35 + Math.sin(tt * 5) * 0.08); it.ring.scale.setScalar(1 + Math.sin(tt * 4) * 0.08); it.g.visible = it.fall || it.life > 3 || Math.sin(tt * 20) > 0; if (Math.random() < dt * 5) fx.particles.emit(it.x + (Math.random() - 0.5), it.y - 0.3, it.z + (Math.random() - 0.5), 0, 1, 0, { life: 0.6, size: 0.2, color: ITEMS[it.type].hex, gravity: -0.5 }); }
      // tegels boven een lager staande speler worden glazig
      const gl = [];
      for (const p of pl) {
        if (p.dead) continue;
        for (let l = 0; l < tiles.L; l++) {
          if (HX.Y[l] < p.y + 1.4) break;
          for (let k = 0; k < tiles.K; k++) { const t = tiles.list[k]; if (Math.abs(t.x - p.x) < 3.1 && Math.abs(t.z - p.z) < 3.1 && Math.hypot(t.x - p.x, t.z - p.z) < 3.1) { const st = tiles.st[l * tiles.K + k]; if (st <= 1 || st === 4) gl.push(l * tiles.K + k); } }
        }
      }
      tiles.setGhosts(gl);
      updateCamera(dt);
    }
    function introUpdate(dt) {
      introT += dt; world.update(introT, dt); tiles.update(dt); D.a += dt * 0.0; dragonStep(dt);
      for (const p of pl) { p.c.pose = 'idle'; p.c.speed = 0; }
      visuals(dt);
    }
    function resultUpdate(dt) { T += dt; world.update(T + introT, dt); tiles.update(dt); dragonStep(dt); for (const p of pl) if (!p.dead) { stepPlayer(p, dt, false); } visuals(dt); }
    startRound(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); visuals(dt * slow); },
      resultUpdate, introUpdate,
      onResize() { fitCamera(); },
      onSwap() { for (const p of pl) fx.particles.burst(p.x, p.y + 1, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const p = pl[i]; if (p.dead) return;
          const l = clamp(Math.round(-p.y / 3.2), 0, 2); tiles.shakeArea(l, p.x, p.z, 2.4, 0.45, true); p.shield = 0;
          fx.texts.add('DEURMAN BOOS!', p.x, p.y + 3.2, p.z, '#ff7a7a', 1.5); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4);
        });
      },
      celebrate(w) { for (const p of pl) { p.c.pose = p.i === w ? 'cheer' : 'sad'; } },
      dispose() {},
      dbg: {
        state: () => ({ T, round: R.n, rstate: R.state, tp: R.tp, sd: R.sd, melt: R.melt, finished, wins: pl.map((p) => p.wins), loser: R.loser, dragon: D.state, tiles: stats.tiles, stats,
          pl: pl.map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), vx: +p.vx.toFixed(1), vz: +p.vz.toFixed(1), g: p.grounded, st: p.stun, cd: +p.cd.toFixed(2), dead: p.dead, dj: p.djT > 0, pw: p.power > 0, sh: p.shield > 0, fx: p.fx, fz: p.fz, dash: p.dashT, pushes: p.stats.pushes, hits: p.stats.hits, items: p.stats.items })),
          items: items.filter((q) => q.on).map((q) => ({ type: q.type, x: q.x, z: q.z, l: q.l })), solid: [0, 1, 2].map((l) => tiles.solidCount(l)) }),
        tiles, pl, items, setTp: (t) => { R.tp = t; }, spawnItem, giveItem: (i, type) => takeItem(Object.assign(items[0], { type, on: true }), pl[i]), endRound,
        fire: () => { D.state = 'wait'; D.t = 0; }, place: (i, x, z, y = 0) => { const p = pl[i]; p.x = x; p.z = z; p.y = y; p.vx = p.vz = p.vy = 0; },
      },
    };
  },
};

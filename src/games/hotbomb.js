import * as THREE from 'three';
import { mat, mesh, clamp, damp, lerp, rand, pick, TAU, h, canvasTex, angDiff } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { buildArena, ARENA_R, RIM_R, OBSTACLES } from './hotbomb_world.js';

// Hete Aardappel (Mario Party "Hot Bomb"): 4 deelnemers, 1 tikkende bom. Tik hem door aan een ander met A!
// Daan + Sem (team) tegen twee nar-NPC's. Elke ronde ontploft de bom bij de houder; die valt uit.

const N_ROUNDS = 3;                      // 4 deelnemers -> 3 ontploffingen (daarna blijft er één over)
const FUSE = [20, 17, 14.5];             // lont per ronde (seconden, +/- 10%)
const BASE = 6.2, HOLD_MULT = 0.95;      // loopsnelheid, bomhouder iets trager
const SPRINT_MULT = 1.55, SPRINT_T = 0.85, SPRINT_CD = 3.6;
const DASH_V = 15.5, DASH_T = 0.25, DASH_CD = 1.05, RECOVER_T = 0.38;
const BODY_R = 0.55, HIT_R = 1.35;
const BOMB_LOCK = 0.6;                   // na een tik kan de bom 0,6 s niet verder springen
const NAMES_NPC = ['Fonkel', 'Dobber'];
const _warm = new THREE.Color();

function nameSprite(text, color) {
  const t = canvasTex(256, 64, (g, w, hh) => {
    g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(20,8,30,.9)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, hh / 2, w - 8);
    g.fillStyle = color; g.fillText(text, w / 2, hh / 2, w - 8);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(2.4, 0.6, 1); s.renderOrder = 24; return s;
}
function emojiSprite(e, scale = 1) {
  const t = canvasTex(96, 96, (g, w) => { g.font = `${w * 0.72}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, w / 2, w / 2 + 4); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(scale, scale, 1); s.renderOrder = 25; return s;
}

const CSS = `
.hb-roster{position:absolute;top:112px;left:50%;transform:translateX(-50%);display:flex;gap:8px;pointer-events:none}
.hb-b{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 6px;border-radius:14px;background:rgba(20,12,30,.7);border:3px solid var(--c);font-size:16px;font-weight:600;transition:opacity .3s,filter .3s}
.hb-b i{font-style:normal;font-size:20px}
.hb-b.out{opacity:.45;filter:grayscale(.8)}
.hb-b.bomb{animation:hb-pulse .35s infinite alternate;background:rgba(120,20,10,.85)}
@keyframes hb-pulse{from{transform:scale(1)}to{transform:scale(1.1)}}
`;

export default {
  id: 'hotbomb',
  name: 'Hete Aardappel',
  giver: 'Nar Nico',
  icon: '💣',
  mode: 'coop',
  time: 75,
  pay: 1.1,
  music: 'game_fast',
  blurb: 'Op de kermis speelt Nar Nico <b>Hete Aardappel</b>! Wie de tikkende aardappel heeft, geeft hem door door iemand <b>aan te tikken</b>. Bij elke knal valt de houder uit. Daan en Sem zijn een team tegen de narren <b>Fonkel</b> en <b>Dobber</b>.',
  controls: ['{move} rennen', '{a} duiken: bom doorgeven / wegduwen', '{b} sprint (even wachten)'],
  tip: 'Duw een nar weg die je broer achterna zit. Pak bubbels (schild) en ijsbloemen. Uitgeschakeld? Moedig je broer aan met {a}!'.replace('{a}', 'A'),

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    ctx.lights('dusk', { shadow: 19, center: [0, 0, 0], fogNear: 70, fogFar: 170 });
    const arena = buildArena(ctx);
    camera.fov = 30; camera.updateProjectionMatrix();
    let fit = 1;
    const placeCam = (shakeY = 0) => { camera.position.set(0, (28 + shakeY) * fit, 26 * fit); camera.lookAt(0, 0.5, 0.8); };
    function onResize(w, hh) { fit = clamp(1.7 / (w / hh), 1, 1.6); placeCam(); }
    onResize(innerWidth, innerHeight);

    // ---------- deelnemers ----------
    const COLORS = [PLAYER_COLORS[0], PLAYER_COLORS[1], 0xb15ae8, 0xff8a2a];
    const CSSC = ['#35c46f', '#4a8cff', '#c88aff', '#ffa04a'];
    const SLOT_ANG = [135, 45, 225, 315].map((d) => d * Math.PI / 180);
    const npcSpecs = [
      { scale: 0.98, shirt: 0x3a6ae8, sleeve: 0xffd23f, pants: 0xffd23f, hatColor: 0x3a6ae8, hatColor2: 0xffd23f, boots: 0x2a2a6a },
      { scale: 1.1, bodyW: 1.25, shirt: 0xe8742a, sleeve: 0x7ad83a, pants: 0x7ad83a, hatColor: 0xe8742a, hatColor2: 0x7ad83a, nose: 2.0, skin: 0xf0b890, boots: 0xffe14a },
    ];
    const E = [0, 1, 2, 3].map((i) => {
      const brother = i < 2;
      const c = brother ? ctx.make.brother(i) : ctx.make.npc('jester', npcSpecs[i - 2]);
      const x = Math.cos(SLOT_ANG[i]) * 4.3, z = Math.sin(SLOT_ANG[i]) * 4.3;
      c.group.position.set(x, 0, z); scene.add(c.group);
      const name = brother ? players[i].name : NAMES_NPC[i - 2];
      const ring = mesh(new THREE.RingGeometry(0.62, 0.8, 24), new THREE.MeshBasicMaterial({ color: COLORS[i], transparent: true, opacity: 0.9, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] });
      ring.position.y = 0.06; scene.add(ring);
      const tag = nameSprite(name, CSSC[i]); scene.add(tag);
      const e = {
        i, brother, name, c, ring, tag, color: COLORS[i], css: CSSC[i], x, z, vx: 0, vz: 0, fx: -Math.cos(SLOT_ANG[i]), fz: -Math.sin(SLOT_ANG[i]),
        alive: true, state: 'play', holder: false, dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, slowT: 0, sprintT: 0, sprintCd: 1.5, stun: 0, knockT: 0, knX: 0, knZ: 0,
        shieldT: 0, iceT: 0, immT: 0, cheerCd: 0, boostT: 0, ang: 0, flyT: 0, fvx: 0, fvz: 0, fy: 0, fvy: 0, hit: new Set(), rank: 0,
        ai: i >= 2 ? { smart: i === 2, t: Math.random() * 5, tgt: -1, tgtT: 0, wander: [0, 0], wanderT: 0, react: 0, dive: 0, panic: 0 } : null,
        autoplay: false,
      };
      if (brother) e.ai = { smart: true, t: 0, tgt: -1, tgtT: 0, wander: [0, 0], wanderT: 0, react: 0.12, dive: 0, panic: 0 };
      // schild-bubbel en ijskristallen
      e.shield = mesh(new THREE.SphereGeometry(1.15, 18, 12), new THREE.MeshStandardMaterial({ color: 0x7ad8ff, emissive: 0x2a8acc, emissiveIntensity: 0.6, transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false }), { cast: false, receive: false });
      e.shield.visible = false; scene.add(e.shield);
      e.ice = new THREE.Group(); e.ice.visible = false; scene.add(e.ice);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; e.ice.add(mesh(new THREE.ConeGeometry(0.16, 0.9 + (k % 2) * 0.4, 5), new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x6ab8ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }), { cast: false, pos: [Math.cos(a) * 0.65, 0.45, Math.sin(a) * 0.65], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] })); }
      return e;
    });
    const [DAAN, SEM] = E;

    // ---------- de bom ----------
    const bomb = new THREE.Group(); scene.add(bomb);
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x9a6a38, emissive: 0x440800, emissiveIntensity: 0.2, roughness: 0.75, flatShading: false });
    const bBody = mesh(new THREE.IcosahedronGeometry(0.55, 2), bombMat, { scale: [1, 0.86, 1.15] }); bomb.add(bBody);
    for (const sd of [-1, 1]) {
      bomb.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [sd * 0.2, 0.1, 0.5] }));
      bomb.add(mesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1a0c06 }), { cast: false, pos: [sd * 0.2, 0.09, 0.64] }));
      bomb.add(mesh(new THREE.BoxGeometry(0.3, 0.07, 0.06), mat(0x2a1608), { cast: false, pos: [sd * 0.2, 0.3, 0.55], rot: [0, 0, -sd * 0.45] }));
    }
    bomb.add(mesh(new THREE.TorusGeometry(0.13, 0.04, 5, 10, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a0c06 }), { cast: false, pos: [0, -0.18, 0.58], rot: [0, 0, 0] }));
    for (const [x, y, z] of [[-0.3, 0.3, -0.3], [0.35, -0.1, -0.3], [0.1, 0.45, 0.2], [-0.4, -0.15, 0.2]]) bomb.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), mat(0x6a4422), { cast: false, pos: [x, y, z], scale: [1, 0.6, 1] }));
    const fuse = new THREE.Group(); fuse.position.set(0, 0.45, -0.05); bomb.add(fuse);
    fuse.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5), mat(0x2a1a0e), { cast: false, pos: [0.06, 0.18, 0], rot: [0, 0, -0.35] }));
    const spark = mesh(new THREE.SphereGeometry(0.1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffd23f }), { cast: false, receive: false, pos: [0.15, 0.38, 0] }); fuse.add(spark);
    const bombLight = new THREE.PointLight(0xff5a1a, 0, 12, 1.5); bomb.add(bombLight);
    const haloTex = canvasTex(64, 64, (g, w, hh) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,150,60,.8)'); gr.addColorStop(0.5, 'rgba(255,70,20,.35)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true })); halo.scale.set(2.6, 2.6, 1); halo.renderOrder = 18; bomb.add(halo);
    bomb.visible = false;
    const bombWorld = new THREE.Vector3();

    // ---------- toestand ----------
    const st = {
      phase: 'setup', timer: 0.3, round: 0, fuse: 0, fuseMax: 1, tickT: 0, lock: 0, holder: null, passes: 0, protects: 0, elim: [], t: 0,
      hintOff: false, powerT: 5, endT: 0, over: false, cheers: 0, bombFly: null, banner: 0, boom: 0, lastBeat: 0, shakeY: 0, winner: null, pushHits: 0,
    };
    const powerups = [];
    const flash = new THREE.PointLight(0xffa040, 0, 26, 1.2); flash.position.set(0, 4, 0); scene.add(flash);
    const wave = mesh(new THREE.RingGeometry(0.4, 0.9, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] });
    wave.position.y = 0.1; scene.add(wave); let waveT = 0, waveX = 0, waveZ = 0;
    const alive = () => E.filter((e) => e.alive);
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    const roster = h('div', { class: 'hb-roster' }, ...E.map((e) => h('div', { class: 'hb-b', style: { '--c': e.css } }, h('i', {}, e.brother ? '🧒' : '🤡'), e.name, h('i', { class: 'st' }, ''))));
    const badges = [...roster.children];
    function updateRoster() {
      E.forEach((e, k) => {
        const b = badges[k]; b.classList.toggle('out', !e.alive); b.classList.toggle('bomb', e.holder && e.alive);
        const s = b.querySelector('.st'); const txt = !e.alive ? '💀' : e.holder ? '💣' : e.shieldT > 0 ? '🛡️' : ''; if (s.textContent !== txt) s.textContent = txt;
      });
    }
    function ensureHud() { if (!roster.isConnected) { const he = document.getElementById('hud'); if (he) he.append(roster); } }

    // ---------- hulpfuncties ----------
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    function setHolder(e, from = null) {
      for (const o of E) o.holder = false;
      e.holder = true; st.holder = e;
      for (const o of E) { if (o.alive) o.c.pose = o === e ? 'hands_up' : 'idle'; }
      updateRoster();
    }
    function passBomb(from, to) {
      st.passes++; st.lock = BOMB_LOCK; to.immT = BOMB_LOCK;
      st.bombFly = { t: 0, fx: from.x, fz: from.z, tx: to.x, tz: to.z, to };
      setHolder(to, from);
      audio.sfx('boing', { rate: 1.2, vol: 0.9 }); audio.sfx('hit', { vol: 0.6 });
      fx.texts.add('HAP!', (from.x + to.x) / 2, 2.8, (from.z + to.z) / 2, '#ffe14a', 1.1);
      fx.particles.burst(to.x, 1.4, to.z, { count: 16, colors: [0xffd23f, 0xff7a1a, 0xffffff], speed: 4, up: 1.3, size: 0.32 });
      ctx.shake(0.25); to.c.squash = 0.2; from.c.squash = -0.1; to.c.jump();
      from.slowT = 0;
      if (!st.hintOff) { st.hintOff = true; hud.setHint(null); }
    }
    function giveBomb(e) { // begin van een ronde
      st.holder = e; setHolder(e);
      bomb.visible = true; st.bombFly = null;
      audio.sfx('powerup'); fx.particles.burst(e.x, 2, e.z, { count: 18, colors: [0xff7a1a, 0xffd23f], speed: 3, up: 1.4, size: 0.3 });
      fx.texts.add('Daar is de aardappel!', e.x, 3.7, e.z, '#ff9a3a', 1.1);
    }

    // ---------- dive / sprint ----------
    function startDive(e) {
      // richting: aim-assist op dichtstbijzijnde deelnemer in de kijkrichting
      let dx = e.fx, dz = e.fz, best = null, bs = 1e9;
      for (const o of E) {
        if (o === e || !o.alive || o.state !== 'play') continue;
        const d = dist(e, o); if (d > 6) continue;
        const ang = Math.abs(angDiff(Math.atan2(e.fx, e.fz), Math.atan2(o.x - e.x, o.z - e.z)));
        if (ang > 0.75) continue;
        const sc = ang * 3 + d * 0.35 + (e.holder && (o.immT > 0 || o.shieldT > 0) ? 3 : 0);
        if (sc < bs) { bs = sc; best = o; }
      }
      if (best) { const lead = Math.min(0.2, dist(e, best) / DASH_V); const px = best.x + best.vx * lead, pz = best.z + best.vz * lead; const d = Math.hypot(px - e.x, pz - e.z) || 1; dx = (px - e.x) / d; dz = (pz - e.z) / d; }
      e.dashT = DASH_T; e.dashX = dx; e.dashZ = dz; e.dashCd = DASH_CD; e.hit.clear(); e.hitAny = false;
      e.fx = dx; e.fz = dz; e.c.faceDir(dx, dz);
      audio.sfx('whoosh', { vol: 0.6, rate: e.holder ? 1.2 : 0.95 });
      for (let k = 0; k < 4; k++) fx.particles.dust(e.x - dx * k * 0.3, 0, e.z - dz * k * 0.3, 1);
    }
    function bounceBack(e, o) {
      e.dashT = 0; e.stun = 0.75; e.knockT = 0.3; e.knX = -e.dashX * 7; e.knZ = -e.dashZ * 7;
      o.shieldT = 0; audio.sfx('hit'); audio.sfx('buzz', { vol: 0.3, rate: 2 });
      fx.particles.burst(o.x, 1.2, o.z, { count: 20, colors: [0x7ad8ff, 0xffffff], speed: 4, size: 0.3 });
      fx.texts.add('Klang!', o.x, 2.9, o.z, '#7ad8ff', 1);
    }
    function pushAway(from, o) {
      const dx = o.x - from.x, dz = o.z - from.z, d = Math.hypot(dx, dz) || 1;
      o.knockT = 0.3; o.knX = dx / d * 10; o.knZ = dz / d * 10; o.stun = 0.5;
      o.c.pose = 'scared'; audio.sfx('thud'); audio.sfx('hit', { vol: 0.6 });
      fx.particles.burst(o.x, 1.2, o.z, { count: 12, colors: [0xffffff, 0xffe14a], speed: 3.5, size: 0.28 });
      fx.texts.add('Duw!', o.x, 2.9, o.z, '#ffffff', 0.9);
      ctx.shake(0.2);
    }
    function diveHits(e) {
      for (const o of E) {
        if (o === e || !o.alive || o.state !== 'play' || e.hit.has(o.i)) continue;
        if (dist(e, o) > HIT_R) continue;
        e.hit.add(o.i); e.hitAny = true;
        if (o.shieldT > 0) { bounceBack(e, o); return; }
        if (e.holder) {
          if (st.lock > 0 || o.immT > 0) { fx.texts.add('Nee!', o.x, 2.8, o.z, '#aaaaaa', 0.8); continue; }
          passBomb(e, o); e.slowT = 0;
        } else {
          if (o.brother && e.brother) { audio.sfx('click', { vol: 0.4 }); continue; }   // broers duwen elkaar niet
          if (o.holder && e.brother && !o.brother) { // een nar duwen die de bom heeft: bescherming!
            const other = e === DAAN ? SEM : DAAN;
            if (other.alive && dist(o, other) < 7.5) { st.protects++; fx.texts.add('Beschermd!', other.x, 3.0, other.z, '#9aff9a', 1.0); }
          }
          pushAway(e, o);
          if (o.holder === false && st.holder && !e.brother) { /* NPC duwt een ander: niets bijzonders */ }
        }
      }
    }

    // ---------- besturing ----------
    function playerIntent(e) {
      const inp = input.p[e.i];
      return { dx: inp.x, dz: inp.y, dive: inp.aP, sprint: inp.bP };
    }
    function nearestPower(e, maxD = 99) {
      let b = null, bd = maxD;
      for (const p of powerups) { const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < bd) { bd = d; b = p; } }
      return b;
    }
    function obstacleRepel(e, out, k = 1.6) {
      for (const [ox, oz, r] of OBSTACLES) {
        const dx = e.x - ox, dz = e.z - oz, d = Math.hypot(dx, dz) - r - BODY_R;
        if (d < 1.6) { const f = (1.6 - d) / 1.6 * k; const L = Math.hypot(dx, dz) || 1; out.x += dx / L * f; out.z += dz / L * f; }
      }
    }
    function wallRepel(e, out, k = 1.5) {
      const r = Math.hypot(e.x, e.z); if (r > ARENA_R - 3.2) { const f = (r - (ARENA_R - 3.2)) / 3.2 * k; out.x -= e.x / r * f; out.z -= e.z / r * f; }
    }
    function aiIntent(e, dt) {
      const A = e.ai; A.t += dt; A.tgtT -= dt; A.wanderT -= dt; A.dive -= dt; A.react -= dt;
      const intent = { dx: 0, dz: 0, dive: false, sprint: false };
      const hold = st.holder;
      const others = E.filter((o) => o !== e && o.alive && o.state === 'play');
      if (!others.length) return intent;
      const smart = A.smart;
      if (e.holder) {
        // ---- achter iemand aan ----
        let cands = others.filter((o) => o.immT <= 0 && o.shieldT <= 0); if (!cands.length) cands = others;
        if (A.tgtT <= 0 || !cands.some((o) => o.i === A.tgt)) {
          let tgt;
          if (smart) { // slimme nar: pakt de langzaamste / de dichtste bij de rand, liefst iemand zonder sprint
            tgt = cands.reduce((b, o) => { const sc = dist(e, o) * 1 + (o.sprintCd <= 0 ? 2.5 : 0) - Math.hypot(o.x, o.z) * 0.25 + (o.stun > 0 ? -4 : 0); return !b || sc < b.sc ? { o, sc } : b; }, null).o;
            A.tgtT = 0.5;
          } else { tgt = Math.random() < 0.6 ? cands.reduce((b, o) => (!b || dist(e, o) < dist(e, b) ? o : b), null) : pick(cands); A.tgtT = rand(1.5, 3.5); }
          A.tgt = tgt.i;
        }
        const t = E[A.tgt]; const d = dist(e, t);
        let px = t.x, pz = t.z;
        if (smart) { const lead = Math.min(0.55, d / (BASE * 1.1)); px += t.vx * lead; pz += t.vz * lead; }
        let dx = px - e.x, dz = pz - e.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        if (!smart) { const wob = Math.sin(A.t * 3.3) * 0.5; const nx = dx - dz * wob, nz = dz + dx * wob; dx = nx; dz = nz; }
        const rep = { x: 0, z: 0 }; obstacleRepel(e, rep, 1.0);
        dx += rep.x; dz += rep.z; const L2 = Math.hypot(dx, dz) || 1;
        intent.dx = dx / L2; intent.dz = dz / L2;
        const facing = e.fx * dx + e.fz * dz;
        if (smart) {
          if (d < 3.1 && facing > 0.8 && e.dashCd <= 0 && A.dive <= 0) { intent.dive = true; A.dive = 0.4; }
          if (d > 4.5 && d < 11 && e.sprintCd <= 0 && A.t % 3 < 2.2) intent.sprint = true;
        } else {
          if (d < 3.9 && e.dashCd <= 0 && A.dive <= 0 && Math.random() < 0.06 + (facing > 0.6 ? 0.04 : 0)) { intent.dive = true; A.dive = rand(0.5, 1.4); }
          if (d > 6 && e.sprintCd <= 0 && Math.random() < 0.02) intent.sprint = true;
          if (Math.random() < 0.004) intent.dive = e.dashCd <= 0; // duikt soms in het niets
        }
      } else {
        // ---- wegrennen / powerups ----
        const d = dist(e, hold);
        const away = { x: e.x - hold.x, z: e.z - hold.z }; const L = Math.hypot(away.x, away.z) || 1; away.x /= L; away.z /= L;
        if (smart) {
          const v = { x: away.x * (d < 8 ? 1.4 : 0.35), z: away.z * (d < 8 ? 1.4 : 0.35) };
          // loop in een cirkel om de bomhouder heen i.p.v. in een hoek
          const tan = { x: -away.z, z: away.x }; const side = (e.x * tan.z - e.z * tan.x) >= 0 ? 1 : -1; const tw = d < 6 ? 0.9 : 0.3;
          v.x += tan.x * tw * (A.orbit || (A.orbit = Math.random() < 0.5 ? 1 : -1)); v.z += tan.z * tw * A.orbit;
          const cr = Math.hypot(e.x, e.z); if (cr > ARENA_R - 4) { v.x -= e.x / cr * 1.4; v.z -= e.z / cr * 1.4; }
          obstacleRepel(e, v, 1.8); wallRepel(e, v, 1.8);
          for (const o of others) { if (o === hold) continue; const od = dist(e, o); if (od < 2.2) { v.x += (e.x - o.x) / od * 0.6; v.z += (e.z - o.z) / od * 0.6; } }
          // powerups pakken als het veilig is
          const pu = nearestPower(e, 7);
          if (pu && (d > 5.5 || (pu.type === 'shield' && d > 3.5))) { const pd = Math.hypot(pu.x - e.x, pu.z - e.z) || 1; v.x = (pu.x - e.x) / pd * 1.6; v.z = (pu.z - e.z) / pd * 1.6; }
          const L2 = Math.hypot(v.x, v.z) || 1; intent.dx = v.x / L2; intent.dz = v.z / L2;
          if (d < 3.3 && e.sprintCd <= 0) intent.sprint = true;
          // zijstap als de bomhouder gaat duiken
          if (hold.dashT > 0 && d < 5) { const pd = { x: -hold.dashZ, z: hold.dashX }; const s = (pd.x * away.x + pd.z * away.z) >= 0 ? 1 : -1; intent.dx = pd.x * s; intent.dz = pd.z * s; }
          if (Math.random() < 0.004) A.orbit = -A.orbit;
        } else {
          // domme nar: reageert laat, rent recht van de bomhouder weg (de rand in) en dwaalt rond
          if (d < 4.2) A.scare = (A.scare || 0) + dt; else A.scare = 0;
          A.freeze = (A.freeze || 0) - dt;
          const panic = A.scare > 0.55 && A.freeze <= 0;
          if (panic && Math.random() < 0.005) A.freeze = 0.7;     // staat even verstijfd
          if (A.wanderT <= 0) { const a = Math.random() * TAU, r = Math.random() * (ARENA_R - 1.5); A.wander = [Math.cos(a) * r, Math.sin(a) * r]; A.wanderT = rand(1.2, 3); A.stand = Math.random() < 0.25; if (A.stand) A.wanderT = rand(0.6, 1.2); }
          if (panic) {
            let ax = away.x + (Math.random() - 0.5) * 0.5, az = away.z + (Math.random() - 0.5) * 0.5; const rep = { x: 0, z: 0 }; obstacleRepel(e, rep, 0.6); ax += rep.x; az += rep.z; const L2 = Math.hypot(ax, az) || 1; intent.dx = ax / L2; intent.dz = az / L2;
            if (d < 2.6 && e.sprintCd <= 0 && Math.random() < 0.05) intent.sprint = true;
          } else if (!A.stand) {
            let wx = A.wander[0] - e.x, wz = A.wander[1] - e.z; const L2 = Math.hypot(wx, wz) || 1; intent.dx = wx / L2 * 0.8; intent.dz = wz / L2 * 0.8;
            const pu = nearestPower(e, 5); if (pu && Math.random() < 0.3) { const pd = Math.hypot(pu.x - e.x, pu.z - e.z) || 1; intent.dx = (pu.x - e.x) / pd; intent.dz = (pu.z - e.z) / pd; }
            if (L2 < 0.6) { intent.dx = 0; intent.dz = 0; }
          }
          // soms stormt hij de bomhouder juist tegemoet ("domt in")
          if (!panic && Math.random() < 0.0015) { A.wander = [hold.x, hold.z]; A.wanderT = 1.4; A.stand = false; }
          // duikt soms zomaar
          if (Math.random() < 0.003 && e.dashCd <= 0) intent.dive = true;
        }
      }
      return intent;
    }
    // spectator (uitgeschakeld) beweegt langs de rand
    function spectatorUpdate(e, dt) {
      if (e.state !== 'out') return;
      let mx = 0, mz = 0;
      if (e.brother && !e.autoplay) { const inp = input.p[e.i]; mx = inp.x; mz = inp.y; if (inp.aP && e.cheerCd <= 0) cheer(e); }
      else { e.npcCheer = (e.npcCheer || 1) - dt; if (e.npcCheer <= 0) { e.npcCheer = rand(1.5, 3.5); e.c.jump(); } mx = Math.sin(st.t * 0.6 + e.i) * 0.4; }
      const move = mx * -Math.sin(e.ang) + mz * Math.cos(e.ang);   // schermrichting -> langs de rand
      e.ang += move * dt * 0.62;
      for (const o of E) { if (o !== e && o.state === 'out') { const dA = angDiff(e.ang, o.ang); if (Math.abs(dA) < 0.2) e.ang -= Math.sign(dA || 1) * (0.2 - Math.abs(dA)) * 0.5; } }
      e.x = Math.cos(e.ang) * RIM_R; e.z = Math.sin(e.ang) * RIM_R;
      e.c.group.position.set(e.x, 0.56, e.z); e.c.faceDir(-Math.cos(e.ang), -Math.sin(e.ang));
      e.c.speed = Math.abs(move) * 0.8; e.cheerCd -= dt;
      e.c.pose = e.cheerCd > 1.2 ? 'cheer' : 'dance';
      e.c.update(dt);
    }
    function cheer(e) {
      e.cheerCd = 2.6; st.cheers++;
      audio.sfx('sparkle'); audio.sfx('ding', { vol: 0.5 });
      fx.particles.burst(e.x, 2.4, e.z, { count: 26, colors: [0xff5a8a, 0xffd23f, 0x7ad8ff, 0x9aff7a], speed: 5, up: 1.5, size: 0.3 });
      fx.texts.add('Hup hup!', e.x, 3.4, e.z, e.css, 1.0);
      const buddy = e === DAAN ? SEM : DAAN;
      if (buddy.alive) {
        buddy.sprintCd = Math.max(0, buddy.sprintCd - 1.8); buddy.boostT = 1.6;
        fx.particles.burst(buddy.x, 2.8, buddy.z, { count: 14, colors: [0xff5a8a, 0xffd23f], speed: 3, up: 1.6, size: 0.3 });
        fx.texts.add('Aangemoedigd!', buddy.x, 3.6, buddy.z, e.css, 0.9);
      }
    }

    // ---------- natuurkunde ----------
    function physics(e, dt, intent) {
      if (e.stun > 0) { e.stun -= dt; intent = { dx: 0, dz: 0, dive: false, sprint: false }; }
      e.dashCd -= dt; e.sprintCd -= dt; e.immT -= dt; e.boostT -= dt; e.slowT -= dt;
      if (e.shieldT > 0) e.shieldT -= dt; if (e.iceT > 0) e.iceT -= dt;
      if (intent.sprint && e.sprintCd <= 0 && e.dashT <= 0) { e.sprintT = SPRINT_T; e.sprintCd = SPRINT_CD; audio.sfx('whoosh', { vol: 0.35, rate: 1.5 }); fx.particles.ring(e.x, 0.2, e.z, { count: 10, speed: 3, life: 0.35, size: 0.22, color: 0xffffff }); }
      if (e.sprintT > 0) e.sprintT -= dt;
      if (intent.dive && e.dashCd <= 0 && e.dashT <= 0 && e.stun <= 0 && e.knockT <= 0) startDive(e);
      const mag = Math.hypot(intent.dx, intent.dz);
      if (mag > 0.15) { const m = Math.min(1, mag); e.fx = intent.dx / mag; e.fz = intent.dz / mag; intent.dx = e.fx * m; intent.dz = e.fz * m; } else { intent.dx = 0; intent.dz = 0; }
      let sp = BASE * (e.holder ? HOLD_MULT : 1) * (e.sprintT > 0 ? SPRINT_MULT : 1) * (e.iceT > 0 ? 0.42 : 1) * (e.boostT > 0 ? 1.12 : 1) * (e.slowT > 0 ? 0.4 : 1);
      let tvx = intent.dx * sp, tvz = intent.dz * sp;
      if (e.dashT > 0) {
        e.dashT -= dt; e.vx = e.dashX * DASH_V; e.vz = e.dashZ * DASH_V;
        diveHits(e);
        if (e.dashT <= 0) e.slowT = e.hitAny ? RECOVER_T * 0.4 : RECOVER_T;
      } else if (e.knockT > 0) {
        e.knockT -= dt; e.vx = e.knX; e.vz = e.knZ; e.knX *= 0.9; e.knZ *= 0.9;
      } else { e.vx = damp(e.vx, tvx, 13, dt); e.vz = damp(e.vz, tvz, 13, dt); }
      e.x += e.vx * dt; e.z += e.vz * dt;
      // obstakels + rand
      for (const [ox, oz, r] of OBSTACLES) { const dx = e.x - ox, dz = e.z - oz, d = Math.hypot(dx, dz), m = r + BODY_R; if (d < m) { const k = d > 1e-4 ? (m - d) / d : 0; e.x += dx * k; e.z += (d > 1e-4 ? dz * k : m); } }
      const rr = Math.hypot(e.x, e.z), lim = ARENA_R - BODY_R; if (rr > lim) { e.x *= lim / rr; e.z *= lim / rr; }
    }
    function separate(dt) {
      const live = E.filter((e) => e.alive && e.state === 'play');
      for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
        const p = live[a], q = live[b]; const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = BODY_R * 2;
        if (d < m && d > 1e-4) { const k = (m - d) * 0.5 * Math.min(1, 16 * dt) / d; p.x -= dx * k; p.z -= dz * k; q.x += dx * k; q.z += dz * k; }
      }
    }

    // ---------- powerups ----------
    function spawnPower() {
      if (powerups.length >= 2) return;
      const type = Math.random() < 0.5 ? 'shield' : 'ice';
      const a = Math.random() * TAU, r = 2.5 + Math.random() * 4.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (OBSTACLES.some(([ox, oz, rr]) => Math.hypot(x - ox, z - oz) < rr + 1.2)) return;
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      if (type === 'shield') {
        g.add(mesh(new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshStandardMaterial({ color: 0x7ad8ff, emissive: 0x2a8acc, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.1 }), { cast: false, pos: [0, 1.0, 0] }));
        g.add(mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaddff, emissiveIntensity: 1.0 }), { cast: false, pos: [0, 1.0, 0] }));
      } else {
        g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), mat(0x7ab8d8), { cast: false, pos: [0, 0.45, 0] }));
        for (let k = 0; k < 6; k++) { const a2 = k / 6 * TAU; g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0x6ab8ff, emissiveIntensity: 0.8, roughness: 0.2 }), { cast: false, pos: [Math.cos(a2) * 0.32, 1.0, Math.sin(a2) * 0.32], scale: [1, 0.5, 1] })); }
        g.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffaa, emissiveIntensity: 1.0 }), { cast: false, pos: [0, 1.05, 0] }));
      }
      const glowRing = mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: type === 'shield' ? 0x7ad8ff : 0xbfeaff, transparent: true, opacity: 0.8, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.07, 0] }); g.add(glowRing);
      powerups.push({ type, x, z, g, life: 10, ring: glowRing });
      fx.particles.burst(x, 1, z, { count: 14, colors: [0x7ad8ff, 0xffffff], speed: 2.5, up: 1.4, size: 0.3 });
      audio.sfx('sparkle', { vol: 0.5 });
    }
    function updatePowerups(dt) {
      for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i]; p.life -= dt; p.g.position.y = 0.15 + Math.sin(st.t * 3 + i) * 0.12; p.g.rotation.y += dt * 1.5; p.ring.scale.setScalar(1 + Math.sin(st.t * 5) * 0.12);
        p.g.visible = p.life > 2 || Math.sin(st.t * 18) > 0;
        let took = null;
        if (p.life > 0) for (const e of E) { if (!e.alive || e.state !== 'play' || e.holder) continue; if (Math.hypot(e.x - p.x, e.z - p.z) < 1.0) { took = e; break; } }
        if (took) {
          if (p.type === 'shield') { took.shieldT = 5; audio.sfx('powerup'); fx.texts.add('Schild!', took.x, 3.3, took.z, '#7ad8ff', 1.1); }
          else if (st.holder && st.holder.alive) {
            const h2 = st.holder; h2.iceT = 2.2; audio.sfx('powerup', { rate: 1.4 }); audio.sfx('sparkle');
            fx.texts.add('Bevroren bom!', h2.x, 3.5, h2.z, '#bfeaff', 1.1); fx.particles.burst(h2.x, 1.2, h2.z, { count: 24, colors: [0xbfeaff, 0xffffff, 0x6ab8ff], speed: 4, up: 1.2, size: 0.34 });
          }
          fx.particles.burst(p.x, 1, p.z, { count: 14, colors: [0xffffff, 0x7ad8ff], speed: 3, up: 1.4, size: 0.3 });
        }
        if (took || p.life <= 0) { scene.remove(p.g); powerups.splice(i, 1); }
      }
    }

    // ---------- ontploffing ----------
    function explode() {
      const e = st.holder; bomb.visible = false; bombLight.intensity = 0;
      st.phase = 'boom'; st.timer = 2.3; st.boom = 1;
      e.alive = false; e.state = 'fly'; e.holder = false; e.rank = st.elim.length + 1; st.elim.push(e);
      e.flyT = 0; e.fy = 0.9; e.fvy = 13.5;
      const r = Math.hypot(e.x, e.z) || 1, dirx = e.x / r, dirz = e.z / r;
      const tx = dirx * (RIM_R), tz = dirz * (RIM_R); e.fvx = (tx - e.x) / 1.2; e.fvz = (tz - e.z) / 1.2; e.ang = Math.atan2(dirz, dirx);
      e.c.pose = 'scared';
      audio.sfx('explode'); ctx.shake(1); st.shakeY = 0.6;
      flash.intensity = 70; flash.position.set(e.x, 3, e.z);
      fx.particles.burst(e.x, 1.2, e.z, { count: 70, colors: [0xff7a1a, 0xffd23f, 0xff3a0a], speed: 9, up: 1.2, size: 0.65, life: 0.9, gravity: 4 });
      fx.particles.burst(e.x, 1.2, e.z, { count: 45, colors: [0x2a2a2a, 0x555555, 0x777777], speed: 5, up: 1.6, size: 0.9, life: 1.6, gravity: -0.5 });
      fx.particles.burst(e.x, 2.0, e.z, { count: 80, colors: [0xff5a8a, 0xffd23f, 0x7ad8ff, 0x9aff7a, 0xffffff, 0xb15ae8], speed: 9, up: 1.8, size: 0.34, life: 1.8, gravity: 5 });
      fx.particles.ring(e.x, 0.3, e.z, { count: 36, speed: 11, life: 0.6, size: 0.4, color: 0xffd23f });
      waveT = 0.6; waveX = e.x; waveZ = e.z;
      fx.texts.add('BOEM!', e.x, 3.8, e.z, '#ffdd33', 2.0);
      // schokgolf: anderen wankelen
      for (const o of alive()) { const d = dist(o, e); if (d < 5.5) { const dx = (o.x - e.x) / (d || 1), dz = (o.z - e.z) / (d || 1); o.knockT = 0.25; o.knX = dx * 8; o.knZ = dz * 8; o.stun = 0.5; o.c.pose = 'scared'; } }
      updateRoster();
      hud.setPlayerInfo(0, DAAN.alive ? '' : '💀 Uit! Moedig aan met A'); hud.setPlayerInfo(1, SEM.alive ? '' : '💀 Uit! Moedig aan met A');
      if (e.brother) fx.texts.add(e.name + ' is uit!', e.x, 4.9, e.z, e.css, 1.2);
    }
    function endCheck() {
      const live = alive();
      const bothBros = !DAAN.alive && !SEM.alive;
      if (live.length <= 1 || bothBros) {
        st.phase = 'end'; st.timer = 3.0;
        if (live.length === 1) { live[0].rank = 4; st.winner = live[0]; }
        // rangen voor wie nog leeft (bij vroeg einde)
        let r = st.elim.length + 1; for (const e of live) { if (!e.rank) e.rank = r++; }
        for (const e of live) { e.c.pose = 'cheer'; }
        hud.setScore(st.winner ? `${st.winner.name} wint de Hete Aardappel!` : 'De narren winnen...');
        if (st.winner) { audio.sfx('win'); fx.texts.add(st.winner.name + ' wint!', st.winner.x, 4.2, st.winner.z, st.winner.css, 1.6); }
        return true;
      }
      return false;
    }
    function startIntermission() {
      st.round++; st.phase = 'inter'; st.timer = 2.4; st.banner = 0;
      const survivors = alive(); const n = survivors.length;
      survivors.forEach((e) => { e.c.pose = 'idle'; e.target = { x: Math.cos(SLOT_ANG[e.i]) * 4.3, z: Math.sin(SLOT_ANG[e.i]) * 4.3 }; e.dashT = 0; e.knockT = 0; e.stun = 0; e.sprintT = 0; e.iceT = 0; e.slowT = 0; e.holder = false; });
      st.holder = null; updateRoster();
      hud.showBig(st.round === N_ROUNDS ? 'Laatste ronde!' : `Ronde ${st.round}`, 1300, '#ffe14a');
      audio.sfx('go', { vol: 0.7 });
      hud.setScore(`Ronde ${st.round}/${N_ROUNDS}   ·   Nog ${n} over`);
    }
    function startRound() {
      st.phase = 'round';
      st.fuseMax = FUSE[Math.min(st.round, N_ROUNDS) - 1] * rand(0.92, 1.08); st.fuse = st.fuseMax; st.tickT = 0; st.lock = 0.5;
      const live = alive(); const pickE = pick(live);
      for (const e of live) e.target = null;
      giveBomb(pickE);
      st.powerT = 3.5;
    }

    // ---------- visuals per frame ----------
    function visuals(dt) {
      st.t += dt;
      // bom volgt de houder (of vliegt)
      if (bomb.visible) {
        const hd = st.holder;
        const prog = 1 - clamp(st.fuse / st.fuseMax, 0, 1);
        const beat = Math.max(0, 1 - ((st.fuseMax - st.fuse) - st.lastBeat) / 0.25);
        let bx = hd.x, bz = hd.z, by = hd.c.height + 1.15;
        if (st.bombFly) {
          const f = st.bombFly; f.t += dt / 0.3; const k = Math.min(1, f.t);
          bx = lerp(f.fx, hd.x, k); bz = lerp(f.fz, hd.z, k); by = hd.c.height + 1.15 + Math.sin(k * Math.PI) * 2.2;
          if (k >= 1) st.bombFly = null;
        }
        bomb.position.set(bx, by + Math.sin(st.t * 9) * 0.04, bz);
        const sc = 1 + beat * (0.18 + prog * 0.15) + prog * 0.12; bomb.scale.setScalar(sc * 1.2);
        bomb.rotation.y = Math.sin(st.t * 2.2) * 0.35; bomb.rotation.z = Math.sin(st.t * 7) * (0.04 + prog * 0.18);
        const warm = _warm.setHSL(0.065 - prog * 0.065, 1, 0.2 + prog * 0.28);
        bombMat.emissive.copy(warm); bombMat.emissiveIntensity = 0.3 + prog * 1.6 + beat * 0.9;
        bombMat.color.setHSL(0.07 - prog * 0.05, 0.55 + prog * 0.25, 0.24 - prog * 0.04);
        halo.material.opacity = 0.3 + prog * 0.35 + beat * 0.25; halo.scale.setScalar((2.0 + prog * 0.8 + beat * 0.5) / Math.max(0.5, bomb.scale.x));
        bombLight.intensity = (2 + prog * 22) * (0.6 + beat * 0.8); bombLight.color.setHSL(0.05, 1, 0.5);
        spark.scale.setScalar(0.8 + Math.random() * 0.8);
        spark.getWorldPosition(bombWorld);
        fx.particles.emit(bombWorld.x, bombWorld.y, bombWorld.z, rand(-0.8, 0.8), rand(1, 3), rand(-0.8, 0.8), { life: 0.35, size: 0.2 + prog * 0.15, color: Math.random() < 0.5 ? 0xffd23f : 0xff7a1a, gravity: 2 });
        if (Math.random() < 0.3) fx.particles.emit(bombWorld.x, bombWorld.y + 0.1, bombWorld.z, rand(-0.3, 0.3), 1.2, rand(-0.3, 0.3), { life: 0.9, size: 0.3, color: 0x555555, gravity: -0.3 });
        // rook wordt zwarter, vlammetjes op het eind
        if (prog > 0.7 && Math.random() < prog * 0.6) fx.particles.emit(bx + rand(-0.4, 0.4), by + 0.2, bz + rand(-0.4, 0.4), rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5), { life: 0.5, size: 0.3, color: 0xff4a1a, gravity: 1 });
      }
      // deelnemers: ringen, namen, schild, ijs
      for (const e of E) {
        const live = e.alive && e.state === 'play';
        e.ring.visible = live;
        e.tag.visible = e.alive || e.state === 'out';
        if (live) {
          e.ring.position.set(e.x, 0.06, e.z);
          const hot = e.holder; const s = hot ? 1.3 + Math.sin(st.t * 14) * 0.15 : 1; e.ring.scale.set(s, s, s);
          e.ring.material.color.setHex(hot ? (e.immT > 0 ? 0xffffff : 0xff3a1a) : e.color); e.ring.material.opacity = hot ? 0.95 : 0.75;
        }
        e.tag.position.set(e.x, (e.state === 'out' ? 0.56 : 0) + 0.15, e.z + 1.05);
        e.shield.visible = e.shieldT > 0 && e.alive;
        if (e.shield.visible) { e.shield.position.set(e.x, 1.0, e.z); const s = 1 + Math.sin(st.t * 8 + e.i) * 0.04; e.shield.scale.set(s, s, s); e.shield.material.opacity = e.shieldT < 1.2 ? 0.15 + Math.abs(Math.sin(st.t * 18)) * 0.25 : 0.32; }
        e.ice.visible = e.iceT > 0 && e.alive;
        if (e.ice.visible) { e.ice.position.set(e.x, 0, e.z); e.ice.rotation.y = st.t; if (Math.random() < 0.3) fx.particles.emit(e.x + rand(-0.6, 0.6), rand(0.2, 1.6), e.z + rand(-0.6, 0.6), 0, 0.6, 0, { life: 0.6, size: 0.18, color: 0xdff4ff, gravity: 0 }); }
      }
      // schokgolf
      if (waveT > 0) { waveT -= dt; const k = 1 - waveT / 0.6; wave.visible = true; wave.position.set(waveX, 0.1, waveZ); wave.scale.setScalar(1 + k * 12); wave.material.opacity = (1 - k) * 0.8; } else wave.visible = false;
      flash.intensity = Math.max(0, flash.intensity - dt * 160);
      st.shakeY = damp(st.shakeY, 0, 6, dt); placeCam(st.shakeY);
    }

    function firework() {
      const a = Math.random() * TAU, r = 6 + Math.random() * 14; const x = Math.cos(a) * r, z = -8 - Math.random() * 12 + Math.sin(a) * 3, y = 11 + Math.random() * 6;
      const cols = [[0xff5a8a, 0xffd23f], [0x7ad8ff, 0xffffff], [0x9aff7a, 0xffd23f], [0xb15ae8, 0xff8a2a]][Math.floor(Math.random() * 4)];
      fx.particles.burst(x, y, z, { count: 46, colors: cols, speed: 8, up: 1, spread: 1.4, size: 0.5, life: 1.5, gravity: 3 });
      audio.sfx('pop', { vol: 0.25, rate: 0.7 + Math.random() * 0.4 });
    }
    // ---------- hoofdlus ----------
    function control(dt, aiOnly = false) {
      const live = alive().filter((e) => e.state === 'play');
      if (st.lock > 0) st.lock -= dt;
      for (const e of live) {
        let intent = { dx: 0, dz: 0, dive: false, sprint: false };
        if (st.phase === 'round') intent = (e.brother && !e.autoplay && !aiOnly) ? playerIntent(e) : aiIntent(e, dt);
        if (st.phase === 'inter' && e.target) { // schuif naar de startpositie
          const dx = e.target.x - e.x, dz = e.target.z - e.z, d = Math.hypot(dx, dz);
          if (d > 0.15) { const sp = Math.min(d * 3.5, 8); e.x += dx / d * sp * dt; e.z += dz / d * sp * dt; e.fx = dx / d; e.fz = dz / d; e.c.faceDir(dx, dz); e.c.speed = Math.min(1, sp / BASE); } else e.c.speed = 0;
          e.vx = e.vz = 0; e.dashCd = 0; continue;
        }
        if (st.phase === 'boom' || st.phase === 'end') { // verlamd door de knal, maar kan nog wankelen
          if (st.phase === 'end') { e.c.speed = 0; continue; }
          intent = { dx: 0, dz: 0, dive: false, sprint: false };
        }
        physics(e, dt, intent);
      }
      separate(dt);
      for (const e of live) {
        const spd = Math.hypot(e.vx, e.vz);
        if (e.stun > 0) e.c.speed = 0; else e.c.speed = Math.min(1, spd / (BASE * 1.2));
        if (spd > 0.4 && e.dashT <= 0) e.c.faceDir(e.vx, e.vz); else if (e.dashT > 0) e.c.faceDir(e.dashX, e.dashZ);
        e.c.group.position.set(e.x, 0, e.z);
        if (e.dashT > 0) e.c.pose = 'push'; else if (e.stun > 0 || e.slowT > 0.2) e.c.pose = e.holder ? 'hands_up' : 'scared'; else if (e.iceT > 0) e.c.pose = 'scared'; else if (st.phase !== 'end') e.c.pose = e.holder ? 'hands_up' : 'idle';
        if (spd > 3 && Math.random() < 0.15) fx.particles.dust(e.x, 0, e.z, 1);
        e.c.update(dt);
      }
      // wegvliegende en toeschouwende spelers
      for (const e of E) {
        if (e.state === 'fly') {
          e.flyT += dt; e.fvy -= 24 * dt; e.fy += e.fvy * dt; e.x += e.fvx * dt; e.z += e.fvz * dt;
          e.c.group.position.set(e.x, Math.max(0, e.fy), e.z); e.c.group.rotation.x = e.flyT * 9; e.c.pose = 'scared'; e.c.update(dt); e.c.group.rotation.x = e.flyT * 9;
          if (Math.random() < 0.6) fx.particles.emit(e.x, e.fy + 0.8, e.z, rand(-1, 1), rand(0, 2), rand(-1, 1), { life: 0.8, size: 0.5, color: 0x333333, gravity: -0.3 });
          if (e.fy <= 0.6 && e.fvy < 0) {
            e.state = 'out'; e.c.group.rotation.x = 0; e.x = Math.cos(e.ang) * RIM_R; e.z = Math.sin(e.ang) * RIM_R;
            audio.sfx('land'); audio.sfx('boing', { vol: 0.5, rate: 0.8 }); fx.particles.dust(e.x, 0.6, e.z, 8);
            fx.particles.burst(e.x, 1.5, e.z, { count: 20, colors: [0xff5a8a, 0xffd23f, 0x7ad8ff, 0x9aff7a], speed: 4, up: 1.6, size: 0.3 });
            e.cheerCd = 1.5; e.c.jump();
            if (e.brother) hud.setPlayerInfo(e.i, '💀 Uit! Moedig aan met A');
          }
        } else if (e.state === 'out') spectatorUpdate(e, dt);
      }
    }
    function update(dt) {
      ensureHud();
      if (st.over) { arena.update(st.t, dt, 1); visuals(dt); for (const e of E) { if (e.state === 'play' || e.state === 'out') e.c.update(dt); } return; }
      if (st.phase === 'setup') { st.timer -= dt; if (st.timer <= 0) startIntermission(); }
      else if (st.phase === 'inter') { st.timer -= dt; if (st.timer <= 0) startRound(); }
      else if (st.phase === 'round') {
        st.fuse -= dt;
        const prog = 1 - st.fuse / st.fuseMax;
        // tikkend geluid dat versnelt
        st.tickT -= dt;
        if (st.tickT <= 0) { const iv = lerp(0.85, 0.11, Math.pow(prog, 1.3)); st.tickT = iv; st.lastBeat = st.fuseMax - st.fuse; audio.sfx('tick', { vol: 0.55 + prog * 0.4, rate: 0.9 + prog * 1.3 }); }
        if (st.fuse <= 0) explode();
        // powerups
        st.powerT -= dt; if (st.powerT <= 0) { spawnPower(); st.powerT = rand(5, 8); }
        if (!st.hintOff && st.t > 14) { st.hintOff = true; hud.setHint(null); }
      } else if (st.phase === 'boom') {
        st.timer -= dt;
        if (st.timer <= 0) { if (!endCheck()) startIntermission(); }
      } else if (st.phase === 'end') {
        st.timer -= dt;
        if (st.timer <= 0) { st.over = true; finish(); }
      }
      control(dt);
      updatePowerups(dt);
      st.fwT = (st.fwT ?? 3) - dt; if (st.fwT <= 0) { firework(); st.fwT = st.phase === 'end' ? 0.35 : rand(4, 7); }
      const boost = st.phase === 'boom' ? 1 : st.phase === 'round' ? 0.25 + (1 - st.fuse / st.fuseMax) * 0.5 : st.phase === 'end' ? 1 : 0.2;
      arena.update(st.t, dt, boost);
      visuals(dt);
      // HUD
      if (st.phase === 'round' && Math.floor(st.t * 4) !== Math.floor((st.t - dt) * 4)) {
        for (const b of [DAAN, SEM]) {
          const msg = !b.alive ? '💀 Uit! A = aanmoedigen' : b.holder ? '💣 Jij hebt de bom! Tik iemand (A)' : st.holder && dist(b, st.holder) < 4.5 ? '😱 Pas op! Ren weg!' : '🏃 Houd afstand';
          hud.setPlayerInfo(b.i, msg + (b.alive ? (b.sprintCd <= 0 ? '  ⚡' : '') : ''));
        }
      }
    }

    function finish() {
      const bro = [DAAN, SEM];
      const b = Math.max(DAAN.rank, SEM.rank), lo = Math.min(DAAN.rank, SEM.rank);
      let stars = 0;
      if (lo >= 3) stars = 3; else if (b === 4) stars = 2; else if (b >= 3) stars = 1;
      const order = st.elim.map((e, k) => `ronde ${k + 1}: <b>${e.name}</b>`).join(', ');
      let txt = `Uitgeschakeld: ${order}.`;
      if (st.winner) txt += ` <b>${st.winner.name}</b> bleef als laatste over${st.winner.brother ? ' - ' + (stars === 3 ? 'en jullie versloegen beide narren!' : 'het team won!') : '.'}`;
      else txt += ' Beide broers waren eerder uit dan de narren.';
      const extras = [];
      if (st.protects) extras.push(`${st.protects}× beschermde je je broer door een nar weg te duwen`);
      if (st.cheers) extras.push(`${st.cheers}× aangemoedigd vanaf de rand`);
      extras.push(`${st.passes}× werd de bom doorgegeven`);
      txt += `<br>${extras.join(' · ')}.`;
      if (stars === 0) txt += '<br>Tip: duik naar de bomhouder om hem weg te duwen, en pak bubbels en ijsbloemen!';
      for (const e of E) if (e.alive) e.c.pose = 'cheer';
      ctx.finish({ stars, score: (DAAN.rank + SEM.rank), summary: txt, delay: 800 });
    }

    // initial
    hud.setTimer(null);
    hud.setScore(`Ronde 1/${N_ROUNDS}   ·   Nog 4 over`);
    hud.setPlayerInfo(0, '🏃 Houd afstand'); hud.setPlayerInfo(1, '🏃 Houd afstand');
    hud.setHint('Wie de <b>bom</b> heeft tikt iemand aan met <kbd>A</kbd> (duik) · zonder bom: ren weg, <kbd>B</kbd> = sprint · <kbd>A</kbd> duwt een nar weg!');
    updateRoster();
    placeCam();
    const idle = (dt) => { st.t += dt; arena.update(st.t, dt, 0.2); for (const e of E) { e.c.update(dt); e.tag.position.set(e.x, 0.15, e.z + 1.05); e.ring.position.set(e.x, 0.06, e.z); } placeCam(); };
    // (introUpdate ververst alleen decor en poppetjes)
    return {
      update, onResize,
      onStart() { hud.setTimer(null); hud.setScore(`Ronde 1/${N_ROUNDS}   ·   Nog 4 over`); hud.setPlayerInfo(0, '🏃 Houd afstand'); hud.setPlayerInfo(1, '🏃 Houd afstand'); hud.setHint('Wie de <b>bom</b> heeft tikt iemand aan met <kbd>A</kbd> (duik) · zonder bom: ren weg, <kbd>B</kbd> = sprint · <kbd>A</kbd> duwt een nar weg!'); },
      introUpdate: (dt) => { idle(dt); },
      resultUpdate: (dt) => { arena.update(st.t += dt, dt, 1); visuals(0); for (const e of E) { if (e.state === 'play') e.c.update(dt); else if (e.state === 'out') spectatorUpdate(e, dt); } },
      dispose() { roster.remove(); style.remove(); },
      dbg: { E, st, aiOnly(v) { E.forEach((e) => { e.autoplay = v; }); }, explode, alive, powerups, control, get stats() { return { passes: st.passes, protects: st.protects, elim: st.elim.map((e) => e.name), phase: st.phase, round: st.round, over: st.over }; } },
    };
  },
};

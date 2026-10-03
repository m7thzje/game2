import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { Dragon } from '../engine/chars.js';
import { KEY_LABELS } from '../engine/input.js';
import * as P from '../engine/props.js';
import { buildIsland } from './brawl_world.js';
import { buildDragon, buildVolcano } from './brawl_stages.js';
import { FT, FT_IDS, ITEMS, STAGES, STAGE_IDS, buildAT, buildFighterChar, mkItemMesh } from './brawl_data.js';
import { createSupers } from './brawl_super.js';
import { SelectUI, MeterUI } from './brawl_ui.js';

// Smash-Arena — duel: platform-vechter (2.5D). Geen levensbalk maar een SCHADE-PERCENTAGE: hoe hoger, hoe verder je wegvliegt.
// Wie van het scherm vliegt verliest een leven (3 levens).
//  * Eerst kiezen jullie een VECHTER (zwaardvechter, magier, reus, ninja) met links/rechts + A; het PODIUM (eiland / drakenrug / vulkaantoren) staat al vast.
//  * lopen, omhoog = sprong (dubbel), A = slaan (richting bepaalt de slag; 3 tikjes = combo), B = schild (vasthouden), B + richting = speciale zet van je vechter,
//    B + omlaag = roll, schild + A = GRIJPEN en gooien (richting = worp).
//  * raken en geraakt worden vult de SUPER-meter; vol = A+B tegelijk.
//  * vallende ballonnen met items: hamer, bom, ijsbal, trampoline, zwaard, stok, bananenschil, mijn, hartje, ster. De draak spuugt vuur, de Gouden Draak brengt een Gouden Bal,
//    de zwaartekracht krijgt grillen.
//  * comeback: wie op zijn laatste leven achterstaat krijgt WOEDE (meer klappen, minder terugslag); items vallen vaker bij de achterblijver; KO geeft super-meter
//  * na 90 s: meeste levens, dan laagste schade; bij gelijkspel SUDDEN DEATH (1 leven, 250% schade, bommenregen)

const G0 = 46, JUMP1 = 19.5, JUMP2 = 17, RUN = 9.5, AIRMAX = 8.5, FALLMAX = 26, FASTFALL = 38;
const FH = 2.5, FHW = 0.52;                 // hoogte en halve breedte van een vechter (bij size 1)
const STOCKS = 3, MATCH = 90, SD_MAX = 45, SELECT_T = 8;
const KDRAG = 0.55;                        // luchtweerstand tijdens terugslag
const STAGE_BUILD = { island: buildIsland, dragon: buildDragon, volcano: buildVolcano };

const sgn = (v) => (v < 0 ? -1 : 1);

export default {
  id: 'brawl',
  name: 'Smash-Arena',
  giver: 'Ridder Rammelaar',
  icon: '🥊',
  mode: 'pvp',
  time: 100,
  music: 'game_fast',
  blurb: 'Kies een <b>vechter</b> en meppen maar, op een van <b>drie podia</b>! Hoe hoger je <b>schade-%</b>, hoe verder je wegvliegt. Van het scherm = een <b>leven</b> kwijt (3 elk).',
  controls: ['{move} lopen, omhoog = springen', '{a} slaan (+ richting = smash)', '{b} schild (+ richting = speciaal)', '{a}+{b} = SUPER (meter vol)'],
  tip: 'Schild + A = grijpen. Bevroren? Beuk op alle knoppen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0;
    const GRAV = pv.gravity || 1;
    const qs = new URLSearchParams(location.search);
    const stageId = STAGE_BUILD[qs.get('stage')] ? qs.get('stage') : pick(STAGE_IDS);

    const L = ctx.lights('dusk', { shadow: 17, center: [0, 3, 0], fogNear: 70, fogFar: 230 });
    camera.fov = 38; camera.updateProjectionMatrix();
    scene.add(camera);

    // ---------------- podium ----------------
    const api = { fs: null, hurt: null, say: null, fireProj: null, shake: (a) => ctx.shake(a), toast: (t, ms) => hud.toast(t, ms), big: (t, c) => hud.showBig(t, 1300, c), sfx: (n, o) => audio.sfx(n, o), fx };
    const S = STAGE_BUILD[stageId](ctx, api);
    {
      const m = S.mood;
      L.hemi.intensity = m.hemiI; L.hemi.color.set(m.hemi); L.hemi.groundColor.set(m.ground);
      L.sun.color.set(m.sun); L.sun.intensity = m.sunI; L.sun.position.set(...m.sunPos);
    }
    const hemiBase = L.hemi.color.clone(), hemiI0 = L.hemi.intensity, sunI0 = L.sun.intensity;
    const BLAST = S.BLAST;
    const plats = S.plats;

    // schermflits voor de super-animaties (kind van de camera)
    const flashQ = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    flashQ.position.z = -1; flashQ.scale.set(3, 1.6, 1); flashQ.renderOrder = 99; flashQ.frustumCulled = false; flashQ.visible = false; camera.add(flashQ);
    let flashT = 9, flashCol = 0xffffff, flashMax = 0.8;

    // ---------------- vechters ----------------
    const glowTexture = (() => { let t = null; return () => t || (t = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })); })();
    const fs = players.map((pp, i) => {
      const holder = new THREE.Group(), inner = new THREE.Group(); holder.add(inner); scene.add(holder);
      const col = ctx.players[i].color;
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      bubble.visible = false; holder.add(bubble);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      aura.visible = false; holder.add(aura);
      const ice = mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xbff0ff, emissive: 0x58b8e8, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, roughness: 0.1, flatShading: true }), { cast: false }); ice.visible = false; holder.add(ice);
      const blob = P.shadowBlob(0.9); blob.visible = false; scene.add(blob);
      // naamkaartje met schade-percentage boven het hoofd
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, () => {}), transparent: true, depthTest: false, fog: false })); tag.renderOrder = 15; tag.scale.set(3.4, 1.28, 1); scene.add(tag);
      // disc waarop je respawnt
      const disc = new THREE.Group();
      disc.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.3, 20), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 }), { cast: false, pos: [0, -0.15, 0] }));
      disc.add(mesh(new THREE.TorusGeometry(1.7, 0.1, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, rot: [Math.PI / 2, 0, 0] }));
      disc.visible = false; scene.add(disc);
      const dir = i ? -1 : 1, st = S.start(i);
      const f = {
        i, c: null, chars: {}, type: null, ft: null, AT: null, holder, inner, bubble, aura, ice, blob, tag, disc, discPlat: { x: 0, y: 0, w: 3.4, tmp: true, on: false, moving: true, dx: 0, dy: 0 }, col,
        size: 1, hh: FH, hw: FHW, weight: 1, pow: 1, spd: pv.speed(i), maxJumps: 2, glide: 0, glideMax: 0,
        x: st.x, y: st.y, vx: 0, vy: 0, face: -dir, grounded: true, ground: S.mainP || null, jumps: 2, wallJ: 1, wall: 0, drop: 0, backT: 0,
        st: 'free', stT: 0, atk: null, atkT: 0, atkPhase: 0, hitDone: false, comboN: 0, comboT: 0, buf: 0, hitstun: 0, charge: 0, charging: false,
        pct: 0, stocks: STOCKS, inv: 1.2, cd: 0, cdMax: 1, spCd: 0, lag: 0, shT: 0, shLeft: 1.2, boostUsed: false, item: null, itemMesh: null, frozenT: 0,
        deadT: 0, rage: false, dmgMul: 1, lastHit: -1, lastHitT: 0, tagKey: '', tumble: 0, fireCd: 0, rollT: 0, rollDir: 1, squashT: 0,
        meter: 0, starT: 0, sup: null, grabbed: null, grabber: null, holdT: 0, mash: 0, geyCd: 0, hitCool: 0, pend: null,
        hits: 0, kos: 0, maxHit: 0, supers: 0, grabs: 0,
      };
      return f;
    });
    const opp = (f) => fs[1 - f.i];

    // ---------------- toestand ----------------
    let T = 0, clock = MATCH, started = false, finished = false, over = false, endT = 0, winner = -1, sd = false, sdT = 0, introT = 0;
    let phase = 'wait', selT = SELECT_T, readyT = 0, sel = null, selUI = null, meterUI = null;
    let stop = 0, slowK = 1, slowHold = 0, camPunch = 0, gEv = 1, gEvT = 0, gEvKind = '', tagUpd = 0, cine = null;
    let itemT = 5, eventT = 15, lastEvent = '', dragonT = 0, eventN = 0, sdRain = 3, sdDr = 14, goldenN = 0, meterTipShown = false;
    const stat = { items: [0, 0], explosions: 0, freezes: 0, dragons: 0, trampolines: 0, perfect: 0, supers: [0, 0], grabs: 0, throws: 0, golden: 0, traps: 0, pickups: {}, special: 0 };

    // ---------------- visuals: slashes ----------------
    const slashGeo = new THREE.RingGeometry(0.45, 1, 14, 1, -1.15, 2.3);
    const slashes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.visible = false; m.renderOrder = 8; scene.add(m); return { m, t: 9 }; });
    let slashN = 0;
    function slash(cx, cy, w, h, rot, col) {
      const s = slashes[slashN++ % slashes.length]; s.t = 0; s.m.visible = true; s.m.position.set(cx, cy, 0.8); s.m.rotation.z = rot; s.sx = w / 2; s.sy = h / 2; s.m.material.color.set(col);
    }

    // ---------------- items, projectielen, vlammen, trampolines, vallen ----------------
    const items = [], projs = [], flames = [], tramps = [], traps = [];
    const balloonM = (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, fog: false });
    // groep: [0] = voorwerp, [1] = ballon, [2] = touwtje, [3] = gloed
    function mkItemGroup(type, balloon) {
      const g = new THREE.Group(); g.add(mkItemMesh(type));
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), balloonM(ITEMS[type].hex)); b.position.y = 3.2; b.scale.y = 1.2; g.add(b);
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0, 2.0, 0] }));
      const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: ITEMS[type].hex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glowS.scale.set(3, 3, 1); glowS.position.y = 0.7; g.add(glowS);
      if (!balloon) { b.visible = false; g.children[2].visible = false; }
      return { g, b };
    }
    function liveItemCount() { return items.filter((it) => it.st === 'fall' || it.st === 'ground').length; }
    function spawnItem(type, x) {
      if (liveItemCount() >= 4) return null;
      type = type || pickItem();
      const { g, b } = mkItemGroup(type, true);
      const it = { type, x: x ?? S.itemX(), y: 17, vy: -3.4, st: 'fall', g, balloon: b, life: type === 'heart' ? 11 : 14, t: Math.random() * 6, uses: ITEMS[type].uses || 1, plat: null };
      g.position.set(it.x, it.y, 0); scene.add(g); items.push(it);
      audio.sfx('whoosh', { vol: 0.25, rate: 1.5 });
      return it;
    }
    // zet een voorwerp neer (na een worp) zonder ballon
    function placeItem(type, x, y, uses) {
      if (liveItemCount() >= 6) return null;
      const { g } = mkItemGroup(type, false);
      const it = { type, x, y, vy: 0, st: 'ground', g, balloon: null, life: 10, t: 0, uses, plat: null }; g.position.set(x, y, 0); scene.add(g); items.push(it);
      return it;
    }
    function pickItem() {
      const behind = behindIdx(), maxPct = Math.max(fs[0].pct, fs[1].pct);
      const w = Object.entries(ITEMS).map(([k, v]) => {
        let x = v.w;
        if (behind >= 0 && k === 'hammer') x += 14;
        if (k === 'heart') x *= 0.5 + maxPct / 70;
        if (k === 'star') x *= behind >= 0 ? 3 : 1;
        if (k === 'orb') x = 0;
        return [k, x];
      });
      let r = Math.random() * w.reduce((a, [, x]) => a + x, 0);
      for (const [k, x] of w) { r -= x; if (r <= 0) return k; }
      return 'bomb';
    }
    function behindIdx() { const a = fs[0], b = fs[1]; if (a.stocks !== b.stocks) return a.stocks < b.stocks ? 0 : 1; if (Math.abs(a.pct - b.pct) > 25) return a.pct > b.pct ? 0 : 1; return -1; }
    function killItem(it) { scene.remove(it.g); it.g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); it.dead = true; }
    function itemSpawnX(bi) { if (bi >= 0 && fs[bi].st !== 'dead' && fs[bi].grounded && Math.random() < 0.6) return clamp(fs[bi].x + rand(-3, 3), -9, 9); return S.itemX(); }

    // projectielen: bom / ijsbal / vuurbal / magische bal / gegooid zwaard of stok / bananenschil
    const projMeshes = {};
    function mkProjMesh(kind) {
      let g;
      if (kind === 'fire') {
        g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a }), { cast: false }));
        g.add(mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false }));
      } else if (kind === 'shot') {
        g = new THREE.Group();
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
        g.add(halo, core); g.userData.halo = halo;
      } else { g = mkItemMesh(kind); g.children.forEach((c) => { c.position.y -= 0.5; }); }
      g.visible = false; scene.add(g); return g;
    }
    function getProjMesh(kind) { const a = projMeshes[kind] || (projMeshes[kind] = []); for (const g of a) if (!g.userData.used) { g.userData.used = true; return g; } const g = mkProjMesh(kind); g.userData.used = true; a.push(g); return g; }
    function fireProj(kind, x, y, vx, vy, owner, fuse = 3, pool) {
      const g = getProjMesh(pool || kind); g.visible = true; g.position.set(x, y, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
      const p = { kind, x, y, vx, vy, owner, fuse, t: 0, g, bounce: 0 };
      projs.push(p); return p;
    }
    function freeProj(p) { p.g.visible = false; p.g.userData.used = false; p.dead = true; }

    // vlammen op de grond (draak, lava)
    const flameMeshes = Array.from({ length: 8 }, () => { const g = new THREE.Group(); g.add(mesh(new THREE.ConeGeometry(0.7, 1.9, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }), { cast: false, pos: [0, 0.95, 0] })); g.add(mesh(new THREE.ConeGeometry(0.4, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false, pos: [0, 0.65, 0.05] })); g.visible = false; scene.add(g); return g; });
    function addFlame(x, y) {
      const g = flameMeshes.find((m) => !m.visible); if (!g) return;
      g.visible = true; g.position.set(x, y, 0); flames.push({ x, y, t: 0, life: 1.9, g });
      fx.particles.burst(x, y + 0.4, 0, { count: 10, speed: 3, up: 1.4, life: 0.5, size: 0.4, colors: [0xff7a1a, 0xffd070], gravity: -2 });
    }

    // draken: de vuurdraak (paars) en de Gouden Draak
    const dragons = {};
    let dragonKind = 'fire', dragonDir = 1, dragonPhase = '', dragonFireT = 0, dragonDropped = false;
    function startDragon(kind = 'fire') {
      if (kind === 'fire' && S.kind === 'dragon') return;       // de Drakenrug heeft zijn eigen vuur
      dragonKind = kind; dragonDir = Math.random() < 0.5 ? -1 : 1; dragonPhase = 'warn'; dragonT = 0; dragonDropped = false;
      if (!dragons[kind]) { const d = new Dragon(kind === 'gold' ? 0xffc830 : 0x7a2fd4, kind === 'gold' ? 1.5 : 1.7); d.group.visible = false; scene.add(d.group); dragons[kind] = d; }
      if (kind === 'gold') {
        stat.golden++; hud.showBig('GOUDEN DRAAK!', 1400, '#ffd24a'); hud.toast('✨ Pak de Gouden Bal voor een SUPER!', 3000); audio.sfx('sparkle', { vol: 0.9, rate: 0.8 }); audio.sfx('powerup', { vol: 0.5 });
      } else {
        stat.dragons++; hud.showBig('DRAAK!', 1100, '#ff9a3a'); hud.toast('🐉 De draak komt vuurballen spuwen! Pas op!', 2400); audio.sfx('buzz', { vol: 0.8 }); ctx.shake(0.3);
      }
    }

    // ---------------- naamkaartjes ----------------
    function drawTag(f) {
      const pct = Math.round(f.pct), key = pct + ':' + f.stocks + ':' + (f.rage ? 1 : 0) + ':' + f.type;
      if (key === f.tagKey) return; f.tagKey = key;
      const t = f.tag.material.map, cv = t.image, g = cv.getContext('2d'); g.clearRect(0, 0, 256, 96);
      g.lineJoin = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 30px Fredoka, Arial Black, sans-serif'; g.lineWidth = 8; g.strokeStyle = 'rgba(10,6,30,.9)';
      g.fillStyle = '#' + new THREE.Color(f.col).getHexString(); g.strokeText(names[f.i] + (f.rage ? ' 🔥' : ''), 128, 20); g.fillText(names[f.i] + (f.rage ? ' 🔥' : ''), 128, 20);
      g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.lineWidth = 10;
      g.fillStyle = pct < 50 ? '#ffffff' : pct < 100 ? '#ffe14a' : pct < 150 ? '#ff9a3a' : '#ff4a4a';
      g.strokeText(pct + '%', 128, 66); g.fillText(pct + '%', 128, 66);
      t.needsUpdate = true;
      hud.setPlayerInfo(f.i, f.type ? `${FT[f.type].icon} ${'♥'.repeat(Math.max(0, f.stocks))}${'♡'.repeat(Math.max(0, STOCKS - f.stocks))}  ${pct}%` : '');
    }
    function refreshHud() {
      hud.setScore(sd ? 'SUDDEN DEATH!' : phase === 'select' ? 'Kies je vechter!' : `${names[0]} ${fs[0].stocks} – ${fs[1].stocks} ${names[1]}`);
      for (const f of fs) { f.tagKey = ''; drawTag(f); }
    }

    // ---------------- ondergrond ----------------
    let lastSurf = null;
    // hoogste oppervlak onder (x, y) -> y-waarde of null (lastSurf = het platform)
    function surfaceBelow(x, y, hw = 0) {
      let best = null; lastSurf = null; const sol = S.solid;
      if (sol && x + hw > -sol.hw && x - hw < sol.hw && y >= sol.top - 0.05) { best = sol.top; lastSurf = S.mainP; }
      for (const p of plats) { if (p.on !== false && Math.abs(x - p.x) < p.w / 2 + hw * 0.4 && y >= p.y - 0.05 && (best === null || p.y > best)) { best = p.y; lastSurf = p; } }
      for (const f of fs) { const p = f.discPlat; if (p.on && Math.abs(x - p.x) < p.w / 2 && y >= p.y - 0.05 && (best === null || p.y > best)) { best = p.y; lastSurf = p; } }
      return best;
    }

    // ---------------- vechter helpers ----------------
    function setPose(f, p) { f.c.pose = p; }
    function fxHit(x, y, big, col = 0xffffff) {
      fx.particles.burst(x, y, 0.8, { count: big ? 26 : 12, speed: big ? 9 : 6, up: 0.6, life: big ? 0.7 : 0.45, size: big ? 0.5 : 0.35, colors: [0xffffff, 0xffe14a, col], gravity: 6 });
      fx.particles.ring(x, y, 0.8, { count: big ? 20 : 12, speed: big ? 11 : 7, color: 0xffffff, size: 0.28, life: 0.3 });
    }
    function say(text, x, y, col = '#ffe14a', s = 1.3) { fx.texts.add(text, x, y, 1.2, col, s); }
    const camPunchFn = (v) => { camPunch = Math.max(camPunch, v); };

    // type van de vechter instellen (bouwt het poppetje, zet stats)
    function setType(f, type) {
      const ft = FT[type], st = ft.stats;
      if (f.c) f.inner.remove(f.c.group);
      f.type = type; f.ft = ft; f.AT = ft.AT || (ft.AT = buildAT(ft));
      const base = pv.size(f.i), size = Math.min(2.0, base * ft.scaleT);
      f.size = size; f.hh = FH * size; f.hw = FHW * size;
      f.weight = Math.pow(base, 0.5) * st.weight; f.pow = Math.pow(base, 0.3) * st.pow; f.spd = pv.speed(f.i);
      f.maxJumps = st.jumps; f.jumps = st.jumps; f.glideMax = st.glide || 0; f.glide = f.glideMax;
      const c = f.chars[type] || (f.chars[type] = buildFighterChar(type, f.i));
      c.group.scale.setScalar(f.hh / c.height); f.inner.position.y = -f.hh / 2; f.inner.add(c.group); f.c = c;
      c.faceDir(f.face, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; c.pose = 'idle';
      f.ice.scale.set(f.hw * 2.8, f.hh * 1.1, f.hw * 2.8);
      f.tagKey = '';
    }
    for (const f of fs) setType(f, 'sword');

    function freeze(f, t) {
      f.st = 'frozen'; f.frozenT = t; f.atk = null; f.vx *= 0.2; f.ice.visible = true; f.shLeft = 1.2; stat.freezes++; releaseGrab(f); f.charging = false;
      audio.sfx('sparkle', { vol: 0.6, rate: 1.4 }); audio.sfx('buzz', { vol: 0.3, rate: 2 });
      fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: 22, speed: 5, up: 0.8, life: 0.7, size: 0.4, colors: [0xffffff, 0xbff0ff, 0x58c8f8], gravity: 3 });
      say('BEVROREN!', f.x, f.y + f.hh + 1, '#8fe8ff'); setPose(f, 'scared');
    }
    function thaw(f, shatter) {
      if (f.st !== 'frozen') return; f.st = 'free'; f.ice.visible = false; f.frozenT = 0; setPose(f, 'idle');
      fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: shatter ? 36 : 18, speed: shatter ? 9 : 5, up: 0.8, life: 0.8, size: 0.45, colors: [0xffffff, 0xbff0ff, 0x58c8f8], gravity: 8 });
      audio.sfx('pop', { rate: 1.5 }); if (shatter) audio.sfx('hit', { vol: 0.5, rate: 1.6 });
    }
    function addMeter(f, v) {
      if (!f || f.st === 'dead' || f.st === 'super' || over || v <= 0) return;
      const was = f.meter; f.meter = Math.min(100, f.meter + v * (behindIdx() === f.i ? 1.3 : 1));
      if (was < 100 && f.meter >= 100) {
        say('SUPER KLAAR!', f.x, f.y + f.hh + 1.6, '#ffe14a', 1.6); audio.sfx('powerup', { vol: 0.9, rate: 1.5 });
        fx.particles.ring(f.x, f.y + f.hh / 2, 0.8, { count: 24, speed: 8, color: 0xffe14a, size: 0.4, life: 0.5 });
        if (!meterTipShown) { meterTipShown = true; hud.toast('⭐ Meter vol! Druk A en B tegelijk voor je SUPER!', 2600); }
      }
    }
    function isArmored(d) { return (d.st === 'atk' && d.atk && d.atk.armor && d.atkPhase <= 1) || false; }
    function releaseGrab(f) {
      const o = f.grabbed; if (o) { if (o.st === 'grabbed') { o.st = 'free'; o.vx = -f.face * 3; o.vy = 4; o.inv = Math.max(o.inv, 0.15); } o.grabber = null; f.grabbed = null; if (f.st === 'hold') { f.st = 'free'; f.lag = 0.15; } }
      const h = f.grabber; if (h && h.grabbed === f) { h.grabbed = null; if (h.st === 'hold') { h.st = 'free'; h.lag = 0.15; } } f.grabber = null; if (f.st === 'grabbed') { f.st = 'free'; f.inv = Math.max(f.inv, 0.15); }
    }

    // Raak een vechter. o: { dmg, bkb, kbg, ang, dirx, att, x, y, big, hs, snd, freeze, proj, pierce, sup, noStun, hazard }
    function hurt(d, o) {
      if (d.starT > 0 && o.hazard && d.st !== 'dead' && !over) { d.vy = Math.max(d.vy, 24); d.grounded = false; d.ground = null; return false; }      // met een ster word je door lava wel omhoog gegooid, zonder schade
      if (d.st === 'dead' || d.inv > 0 || d.starT > 0 || over || d.hitCool > 0) return false;
      const att = o.att;
      // schild
      if (d.st === 'shield' && !o.pierce) {
        const perfect = d.shT < 0.14;
        d.shLeft -= 0.15 + o.dmg * 0.04;
        fx.particles.burst(o.x, o.y, 0.9, { count: 12, speed: 6, up: 0.4, life: 0.4, size: 0.35, colors: [0xffffff, d.col], gravity: 2 });
        audio.sfx(perfect ? 'ding' : 'thud', { vol: 0.7 });
        addMeter(d, 2);
        if (perfect) {
          stat.perfect++; say('PERFECT!', d.x, d.y + d.hh + 1, '#ffffff', 1.5); ctx.shake(0.3); stop = Math.max(stop, 0.08);
          if (o.proj) { o.proj.owner = d; o.proj.vx *= -1; o.proj.vy *= -0.5; o.proj.reflected = true; }
          else if (att && !o.noStun && !o.sup) { att.st = 'hit'; att.atk = null; att.hitstun = 0.55; att.vx = -att.face * 9; att.vy = 5; att.grounded = false; att.shT = 0; att.charging = false; setPose(att, 'scared'); releaseGrab(att); }
        } else { d.vx += o.dirx * 4; }
        if (d.shLeft <= 0) { endShield(d, true); d.st = 'hit'; d.hitstun = 1.0; setPose(d, 'scared'); say('SCHILD KAPOT!', d.x, d.y + d.hh + 1, '#ff6b6b'); audio.sfx('bad'); ctx.shake(0.4); fx.particles.burst(d.x, d.y + 1, 0.9, { count: 30, speed: 8, up: 1, life: 0.7, size: 0.4, colors: [0xffffff, d.col], gravity: 4 }); }
        o.blocked = true; return true;
      }
      const wasFrozen = d.st === 'frozen';
      if (o.freeze) { if (wasFrozen) return false; d.pct += o.dmg; freeze(d, o.freeze); return true; }
      const armored = isArmored(d) && o.dmg < 20 && !o.pierce;
      if (wasFrozen) thaw(d, true);
      if (d.st === 'grabbed' || d.st === 'hold') releaseGrab(d);
      const dmg = o.dmg * (att ? att.dmgMul : 1) * (wasFrozen ? 1.3 : 1);
      d.pct += dmg; d.lastHit = att ? att.i : -1; d.lastHitT = T;
      if (att) { att.hits++; att.maxHit = Math.max(att.maxHit, dmg); if (!o.sup) addMeter(att, dmg * 0.36); }
      addMeter(d, dmg * 0.3);
      if (armored) {
        d.hitCool = 0.14; d.vx += o.dirx * 1.5; stop = Math.max(stop, 0.05); ctx.shake(0.2); fxHit(o.x, o.y, false, d.col); audio.sfx('thud', { vol: 0.5 }); say('GRR!', d.x, d.y + d.hh + 0.8, '#ffb070', 1.1);
        d.tagKey = ''; drawTag(d); return true;
      }
      // terugslag
      const v = (o.bkb + o.kbg * d.pct) * (d.rage ? 0.85 : 1) / d.weight * (att ? att.pow : 1) * (GRAV < 1 ? 0.82 : 1) * (wasFrozen ? 1.1 : 1);
      const a = o.ang * Math.PI / 180;
      let dx = Math.cos(a) * o.dirx, dy = Math.sin(a);
      if (d.grounded && dy < 0) dy = -dy * 0.6;            // spijker op de grond: stuitert omhoog
      const l = Math.hypot(dx, dy) || 1;
      d.vx = dx / l * v; d.vy = dy / l * v; d.grounded = false; d.ground = null; d.wall = 0;
      d.st = 'hit'; d.atk = null; d.hitstun = clamp(0.1 + v * 0.012, 0.12, 0.7); d.hitCool = 0.06; d.shT = 0; d.tumble = v > 15 ? sgn(d.vx) * (7 + v * 0.25) : 0; d.charging = false;
      setPose(d, 'scared'); d.c.squash = 0.18;
      endShield(d, false);
      // gevoel: hit-pauze, schok, effecten
      const big = o.big || v > 17;
      stop = Math.max(stop, o.hs ?? clamp(0.035 + dmg * 0.006, 0.04, 0.17));
      ctx.shake(clamp(0.1 + v * 0.016, 0.12, 0.7)); camPunch = Math.max(camPunch, clamp(v / 40, 0.2, 0.9));
      fxHit(o.x, o.y, big, d.col);
      audio.sfx(o.snd || (big ? 'thud' : 'hit'), { vol: big ? 0.8 : 0.6, rate: 0.9 + Math.random() * 0.3 }); if (big) audio.sfx('hit', { vol: 0.5, rate: 0.7 });
      if (big) say(pick(['POW!', 'BAF!', 'KLONK!', 'BOEM!', 'WHAM!']), o.x, o.y + 1.3, '#ffe14a', 1.5);
      else if (dmg >= 3 && Math.random() < 0.4) say(pick(['au!', 'tik!', 'klets!']), o.x, o.y + 1, '#ffffff', 0.9);
      d.tagKey = ''; drawTag(d); checkRage();
      return true;
    }
    api.fs = fs; api.hurt = hurt; api.say = say; api.fireProj = (...a) => fireProj(...a);

    function checkRage() {
      for (const f of fs) {
        const want = f.stocks === 1 && opp(f).stocks > 1 && !sd;
        if (want !== f.rage) {
          f.rage = want; f.dmgMul = want ? 1.25 : 1; f.tagKey = ''; drawTag(f);
          if (want) { say('WOEDE!', f.x, f.y + f.hh + 1.4, '#ff6b4a', 1.6); hud.toast(`🔥 ${names[f.i]} is woedend! Meer klappen, minder terugslag!`, 2200); audio.sfx('powerup', { vol: 0.8 }); fx.particles.burst(f.x, f.y + 1, 0, { count: 24, speed: 6, up: 1.4, life: 0.8, size: 0.45, colors: [0xff7a1a, 0xffd070, 0xff4a4a], gravity: -1 }); }
        }
      }
    }

    // schild
    function startShield(f) { f.st = 'shield'; f.shT = 0; f.atk = null; f.bubble.visible = true; setPose(f, 'idle'); audio.sfx('whoosh', { vol: 0.35, rate: 1.8 }); }
    function endShield(f, broke) {
      if (!f.bubble.visible) return; f.bubble.visible = false;
      f.cdMax = broke ? 3 : clamp(0.5 + f.shT * 1.0, 0.6, 1.8); f.cd = f.cdMax;
      if (f.st === 'shield') f.st = 'free';
    }

    // ---------------- aanvallen ----------------
    function startAttack(f, key, item) {
      const A = f.AT[key]; if (!A) return;
      f.st = 'atk'; f.atk = A; f.atkKey = key; f.atkT = 0; f.atkPhase = 0; f.hitDone = false; f.buf = 0; f.charge = 0; f.charging = false; f.chargeMul = 1;
      if (!item && key.startsWith('jab')) f.comboN = key === 'jab1' ? 1 : key === 'jab2' ? 2 : 3; else f.comboN = 0;
      setPose(f, 'idle');
    }
    function chooseAttack(f, inp) {
      const up = inp.y < -0.5, down = inp.y > 0.5, fwd = Math.abs(inp.x) > 0.5 && !up && !down;
      if (f.grounded) {
        if (fwd) f.face = sgn(inp.x);
        if (up) return 'usmash'; if (down) return 'dsmash'; if (fwd) return 'fsmash';
        return f.comboT > 0 && f.comboN === 1 ? 'jab2' : f.comboT > 0 && f.comboN === 2 ? 'jab3' : 'jab1';
      }
      if (fwd && sgn(inp.x) !== f.face && f.backT > 0) return 'bair';      // net achterom getikt: slag naar achteren
      if (fwd) f.face = sgn(inp.x);
      if (up) return 'uair'; if (down) return 'dair'; if (fwd) return 'fair'; return 'nair';
    }
    function hitRect(f, A) {
      const s = f.size, ox = A.box[0] * s, w = A.box[2] * s, fc = A.back ? -f.face : f.face;
      const x0 = A.sym ? f.x + ox : (fc > 0 ? f.x + ox : f.x - ox - w);
      return { x0, x1: x0 + w, y0: f.y + A.box[1] * s, y1: f.y + (A.box[1] + A.box[3]) * s };
    }
    function fireShot(f, A) {
      const pr = A.proj, x = f.x + f.face * (0.9 * f.size + 0.3), y = f.y + f.hh * 0.62;
      const p = fireProj('shot', x, y, f.face * pr.spd, pr.vy || 0, f, 0);
      Object.assign(p, { dmg: pr.dmg, bkb: pr.bkb, kbg: pr.kbg, ang: pr.ang, size: pr.size, life: pr.life, grav: pr.grav || 0, bounces: pr.bounce || 0, big: pr.big });
      const col = new THREE.Color(f.col).lerp(new THREE.Color(0xffffff), 0.3); p.g.children[0].material.color.copy(col); p.g.children[1].material.color.set(0xffffff); p.g.scale.setScalar(pr.size);
      audio.sfx('sparkle', { vol: 0.5, rate: 1.3 + Math.random() * 0.3 }); fx.particles.burst(x, y, 0.5, { count: 8, speed: 4, up: 0, life: 0.3, size: 0.4, colors: [col.getHex(), 0xffffff], gravity: 0 });
    }
    function stepAttack(f, dt) {
      const A = f.atk, k = Math.pow(f.spd, 0.6);
      // laden (reus): smash-slagen blijven hangen zolang je A vasthoudt, met super-armor
      if (A.smash && f.ft.atk.smash && f.atkPhase === 0 && f.atkT >= A.wind * 0.55 && f.inp.a && f.charge < 0.75) {
        f.charge += dt; f.charging = true; f.c.squash = 0.04; f.atk.armor = 1;
        if (Math.random() < dt * 40) fx.particles.emit(f.x + rand(-1, 1) * f.hw * 2, f.y + rand(0, f.hh), 0.5, rand(-1, 1), rand(1, 3), 0, { life: 0.4, size: 0.45, color: pick([0xffb070, 0xffffff, 0xffe14a]), gravity: 0 });
        return;
      }
      f.charging = false;
      f.atkT += dt * k;
      const t = f.atkT;
      if (f.atkPhase === 0 && t >= A.wind) {
        f.atkPhase = 1; f.hitDone = false; f.chargeMul = 1 + f.charge * 0.9;
        if (A.box && A.box[2] > 0) { const r = hitRect(f, A); slash((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.x1 - r.x0, r.y1 - r.y0, A.sym ? (A.box[1] > 1 ? Math.PI / 2 : A.box[1] < 0 ? -Math.PI / 2 : 0) : ((A.back ? -f.face : f.face) > 0 ? 0 : Math.PI), f.ft.swing || f.col); }
        audio.sfx(A.snd === 'explode' ? 'whoosh' : 'swing', { vol: 0.5, rate: A.big ? 0.8 : 1.1 + f.comboN * 0.1 });
        if (A.lunge && !A.drive && !A.back) f.vx = f.face * A.lunge * f.spd;
        f.c.swing(); if (A.big) { f.c.squash = 0.12; }
        if (A.proj) { fireShot(f, A); f.hitDone = true; }
        if (A.inv) f.inv = Math.max(f.inv, A.act + 0.1);
        if (f.charge > 0.3) { ctx.shake(0.25); fx.particles.ring(f.x, f.y + 0.5, 0.5, { count: 14, speed: 8, color: 0xffb070, size: 0.4, life: 0.35 }); }
      }
      if (f.atkPhase === 1) {
        if (A.drive) f.vx = f.face * A.drive * f.spd;
        if (A.through) f.vy = 0;
        if (A.spin) f.holder.rotation.y += dt * 34;
        if (!f.hitDone && A.box && A.box[2] > 0) {
          const r = hitRect(f, A), d = opp(f);
          if (d.st !== 'dead' && r.x1 > d.x - d.hw && r.x0 < d.x + d.hw && r.y1 > d.y && r.y0 < d.y + d.hh) {
            const away = A.away || (A.sym && A.ang > 60 && A.ang < 120);
            const dirx = away ? (sgn(d.x - f.x) || f.face) : (A.back ? -f.face : f.face);
            const cx = clamp(d.x, r.x0, r.x1), cy = clamp(d.y + d.hh / 2, r.y0, r.y1), cm = f.chargeMul || 1;
            const ok = hurt(d, { dmg: A.dmg * cm, bkb: A.bkb * f.pow * (1 + (cm - 1) * 0.5), kbg: A.kbg * cm, ang: A.ang, dirx, att: f, x: cx, y: cy, big: A.big || cm > 1.3, hs: A.hs, snd: A.snd });
            if (ok) { f.hitDone = true; if (f.atkKey && f.atkKey.startsWith('jab')) f.comboT = 0.5; if (A.spin || A.through || A.drive) stat.special++; }
          }
        }
        if (t >= A.wind + A.act) f.atkPhase = 2;
      }
      if (t >= A.wind + A.act + A.rec) {
        f.st = 'free'; f.atk = null; if (f.atkKey && f.atkKey.startsWith('jab')) f.comboT = 0.4;
        if (A.drive) f.vx *= 0.3; if (A.spin) f.holder.rotation.y = 0;
        if (f.itemUse) { f.itemUse = false; useUp(f); }
      }
    }
    function useUp(f) { if (!f.item) return; f.item.uses--; if (f.item.uses <= 0) dropItem(f, true); }

    // ---------------- grijpen en gooien ----------------
    function startGrab(f) {
      f.st = 'grab'; f.stT = 0; f.atk = null; f.hitDone = false; setPose(f, 'push'); audio.sfx('whoosh', { vol: 0.4, rate: 1.1 }); f.c.swing();
    }
    function stepGrab(f, dt) {
      f.stT += dt; f.vx = damp(f.vx, 0, 14, dt);
      const o = opp(f);
      if (!f.hitDone && f.stT >= 0.07) {
        f.hitDone = true;
        const ok = o.st !== 'dead' && o.inv <= 0 && o.starT <= 0 && o.st !== 'grabbed' && o.st !== 'hold' && o.st !== 'super' && Math.abs(o.x - f.x) < 2.0 * f.size + o.hw && Math.abs(o.y - f.y) < 1.4 * f.size + 0.4 && (o.x - f.x) * f.face > -0.3;
        if (ok) {
          if (o.st === 'frozen') thaw(o, false);
          if (o.st === 'shield') endShield(o, false);
          o.atk = null; o.charging = false; o.st = 'grabbed'; o.grabber = f; f.grabbed = o; o.mash = 0; o.vx = o.vy = 0; f.st = 'hold'; f.holdT = 0; f.pummel = 0; f.stT = 0; f.grabs++; stat.grabs++;
          audio.sfx('click2', { vol: 0.7 }); say('GRIJP!', f.x + f.face, f.y + f.hh + 1, '#ffffff', 1.3); setPose(o, 'scared'); setPose(f, 'carry'); fx.particles.burst(o.x, o.y + 1, 0.8, { count: 10, speed: 4, up: 0.5, life: 0.4, size: 0.35, colors: [0xffffff, f.col], gravity: 2 });
          return;
        }
      }
      if (f.stT >= 0.34) { f.st = 'free'; f.lag = 0.1; setPose(f, 'idle'); }
    }
    const THROWS = {
      f: { dmg: 7, bkb: 10, kbg: 0.12, ang: 38, name: 'GOOI!' }, b: { dmg: 8, bkb: 10.5, kbg: 0.13, ang: 38, name: 'ACHTERUIT!' },
      u: { dmg: 6, bkb: 9, kbg: 0.12, ang: 88, name: 'OMHOOG!' }, d: { dmg: 6, bkb: 9, kbg: 0.1, ang: 80, name: 'SMASH!' },
    };
    function doThrow(f, kind) {
      const o = f.grabbed; if (!o) return; const Tt = THROWS[kind];
      let dirx = f.face; if (kind === 'b') dirx = -f.face; if (kind === 'u' || kind === 'd') dirx = f.face * 0.4;
      releaseGrab(f); o.st = 'free'; o.inv = 0; o.hitCool = 0;
      const ok = hurt(o, { dmg: Tt.dmg, bkb: Tt.bkb * f.pow, kbg: Tt.kbg, ang: Tt.ang, dirx: dirx || 1, att: f, x: o.x, y: o.y + o.hh / 2, big: 1, hs: 0.1, snd: 'thud', pierce: 1, noStun: 1 });
      f.c.swing(); if (kind === 'b') f.face = -f.face;
      f.st = 'free'; f.lag = 0.25; setPose(f, 'idle'); stat.throws++;
      if (ok) say(Tt.name, o.x, o.y + o.hh + 1, '#ffe14a', 1.4);
    }
    function stepHold(f, dt, e, inp) {
      const o = f.grabbed;
      if (!o || o.st !== 'grabbed') { releaseGrab(f); f.st = 'free'; return; }
      f.holdT += dt; f.vx = damp(f.vx, 0, 14, dt);
      const up = e.up, dn = e.dn;
      if (e.a && f.pummel < 3) { f.pummel++; o.pct += 2; o.tagKey = ''; drawTag(o); addMeter(f, 1.5); f.c.swing(); audio.sfx('hit', { vol: 0.4, rate: 1.5 }); fx.particles.burst(o.x, o.y + 1, 0.8, { count: 5, speed: 3, up: 0.3, life: 0.3, size: 0.3, colors: [0xffffff], gravity: 3 }); f.holdT = Math.max(0, f.holdT - 0.12); }
      if (up) doThrow(f, 'u');
      else if (dn) doThrow(f, 'd');
      else if (e.l || e.r) doThrow(f, ((e.l ? -1 : 1) === f.face) ? 'f' : 'b');
      else if (f.holdT > 1.0 + Math.min(0.5, o.mash * 0.05) * 0) doThrow(f, 'f');
    }

    // ---------------- items vasthouden / gebruiken / gooien ----------------
    function giveItem(f, type, uses) {
      dropItem(f, false);
      const m = mkItemMesh(type, true); f.c.hold(m, 'r'); f.itemMesh = m; if (f.c.weapon) f.c.weapon.visible = false;
      f.item = { type, t: 0, uses: uses ?? ITEMS[type].uses ?? 1, fuse: type === 'bomb' ? 3.6 : 0 };
      stat.items[f.i]++; stat.pickups[type] = (stat.pickups[type] || 0) + 1;
      say(ITEMS[type].name, f.x, f.y + f.hh + 1.1, ITEMS[type].col, 1.5);
      audio.sfx('powerup', { vol: 0.6 }); fx.particles.burst(f.x, f.y + 1.2, 0.5, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffffff, ITEMS[type].hex], gravity: 3 });
      if (type === 'bomb' || type === 'ice' || type === 'banana' || type === 'mine') setPose(f, 'carry');
    }
    function dropItem(f, poof) {
      if (f.itemMesh) { f.itemMesh.parent && f.itemMesh.parent.remove(f.itemMesh); f.itemMesh.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); f.itemMesh = null; }
      if (f.c && f.c.weapon) f.c.weapon.visible = true;
      if (poof && f.item) fx.particles.burst(f.x, f.y + 1.2, 0.5, { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xffffff, 0xcccccc], gravity: 3 });
      f.item = null; if (f.c && f.c.pose === 'carry') setPose(f, 'idle');
    }
    function instant(f, type) {
      stat.items[f.i]++; stat.pickups[type] = (stat.pickups[type] || 0) + 1;
      say(ITEMS[type].name, f.x, f.y + f.hh + 1.1, ITEMS[type].col, 1.5);
      if (type === 'heart') {
        const heal = Math.min(f.pct, 30); f.pct -= heal; f.tagKey = ''; drawTag(f); audio.sfx('sparkle', { vol: 0.8 }); audio.sfx('powerup', { vol: 0.5, rate: 1.3 });
        say(`-${Math.round(heal)}%`, f.x, f.y + f.hh + 2, '#ff9fc0', 1.3);
        for (let k = 0; k < 8; k++) fx.particles.emit(f.x + rand(-1, 1), f.y + rand(0, 2), 0.6, rand(-1, 1), rand(2, 5), 0, { life: 0.8, size: 0.6, color: 0xff7fb0, gravity: -1 });
      } else if (type === 'star') {
        f.starT = 7; audio.sfx('powerup', { vol: 0.9, rate: 1.2 }); audio.sfx('sparkle', { vol: 0.7 }); say('ONKWETSBAAR!', f.x, f.y + f.hh + 2, '#fff08a', 1.4);
      } else if (type === 'orb') {
        if (f.meter >= 100) f.starT = Math.max(f.starT, 4); f.meter = 100; addMeter(f, 0); say('SUPER KLAAR!', f.x, f.y + f.hh + 2, '#ffd24a', 1.7); audio.sfx('powerup', { vol: 1, rate: 1.4 }); audio.sfx('sparkle', { vol: 0.8 });
        fx.particles.ring(f.x, f.y + f.hh / 2, 0.8, { count: 30, speed: 10, color: 0xffd24a, size: 0.5, life: 0.6 });
      }
      fx.particles.burst(f.x, f.y + 1.2, 0.5, { count: 16, speed: 5, up: 1, life: 0.7, size: 0.4, colors: [0xffffff, ITEMS[type].hex], gravity: 3 });
    }
    function startThrow(f, kind) { f.c.swing(); audio.sfx('throw', { vol: 0.6 }); }
    function useItem(f, inp) {
      const it = f.item, up = inp.y < -0.5, down = inp.y > 0.5;
      if (it.type === 'hammer') { startAttack(f, 'hammer', true); f.itemUse = true; return; }
      if (it.type === 'sword') { startAttack(f, 'swordI', true); f.itemUse = true; return; }
      if (it.type === 'stick') { startAttack(f, 'stickI', true); f.itemUse = true; return; }
      f.c.swing(); audio.sfx('throw', { vol: 0.6 });
      const x = f.x + f.face * 0.8 * f.size, y = f.y + f.hh * 0.75;
      if (it.type === 'bomb') {
        const vx = up ? f.face * 3 : down ? f.face * 2 : f.face * 14 + f.vx * 0.4, vy = up ? 17 : down ? -3 : 7;
        const p = fireProj('bomb', x, y, vx, vy, f, it.fuse); p.thrownT = 0;
        dropItem(f, false);
      } else if (it.type === 'ice') {
        const s = 21; const ang = up ? 0.7 : down ? -0.7 : 0;
        fireProj('ice', x, y, Math.cos(ang) * s * f.face, Math.sin(ang) * s, f, 0);
        f.itemUse = false; it.uses--; if (it.uses <= 0) dropItem(f, true);
      } else if (it.type === 'banana') {
        if (down) addTrap('peel', f.x + f.face * 0.9 * f.size, f.y + 0.2, 0, 0, f);
        else fireProj('banana', x, y, f.face * (up ? 4 : 11) + f.vx * 0.3, up ? 14 : 5, f, 0);
        dropItem(f, false);
      } else if (it.type === 'mine') {
        addTrap('mine', f.x + f.face * 1.5 * f.size, f.y + 0.2, up ? f.face * 5 : 0, up ? 12 : 0, f);
        dropItem(f, false);
      }
    }
    // B + richting met zwaard/stok: gooien
    function throwItem(f, inp) {
      const it = f.item, up = inp.y < -0.5, down = inp.y > 0.5;
      const x = f.x + f.face * 0.8 * f.size, y = f.y + f.hh * 0.75;
      const vx = up ? f.face * 5 : down ? f.face * 8 : f.face * 21, vy = up ? 20 : down ? -14 : 3;
      const p = fireProj('thrown', x, y, vx, vy, f, 0, it.type); p.item = it.type; p.uses = it.uses; p.dmg = it.type === 'sword' ? 9 : 5; p.spin = 14 * f.face;
      f.c.swing(); audio.sfx('throw', { vol: 0.7, rate: 1.2 }); dropItem(f, false); stat.throws++;
    }
    // vallen: bananenschil en mijn
    function addTrap(kind, x, y, vx, vy, owner) {
      if (traps.length >= 5) { const old = traps.shift(); scene.remove(old.g); }
      const g = mkItemMesh(kind === 'peel' ? 'banana' : 'mine'); g.position.set(x, y, 0); scene.add(g);
      traps.push({ kind, x, y, vx, vy, owner, g, t: 0, life: kind === 'peel' ? 14 : 18, landed: false, plat: null }); stat.traps++;
    }
    function explode(x, y, owner, big = 1, o = {}) {
      stat.explosions++;
      const R = 3.7 * big;
      for (const d of fs) {
        if (o.skip && o.skip === d) continue;
        const cx = d.x, cy = d.y + d.hh / 2, dist = Math.hypot(cx - x, cy - y);
        if (dist < R + d.hw && d.st !== 'dead') {
          const dirx = sgn(cx - x), a = clamp(Math.atan2(cy - y + 1.4, Math.abs(cx - x)) * 180 / Math.PI, 25, 85);
          hurt(d, { dmg: (o.dmg ?? 16) * (1 - dist / R * 0.4), bkb: o.bkb ?? 14, kbg: 0.09, ang: a, dirx, att: owner && owner !== d ? owner : null, noStun: true, x: cx, y: cy, big: 1, snd: 'explode', hs: 0.12, sup: o.sup });
        }
      }
      fx.particles.burst(x, y, 0.8, { count: Math.round(50 * Math.min(1, big + 0.2)), speed: 12 * Math.min(1, big + 0.2), up: 0.8, life: 0.9, size: 0.7 * Math.min(1, big + 0.3), colors: [0xff7a1a, 0xffd070, 0xff4a2a, 0x555555], gravity: 3 });
      fx.particles.ring(x, y, 0.8, { count: 30, speed: 14 * Math.min(1, big + 0.2), color: 0xffe0a0, size: 0.45, life: 0.45 });
      ctx.shake(0.7 * Math.min(1, big + 0.3)); audio.sfx('explode', { vol: 1 * Math.min(1, big + 0.2) }); camPunch = Math.max(camPunch, 0.8 * Math.min(1, big + 0.2));
      say('BOEM!', x, y + 1.4, '#ff9a3a', 2 * Math.min(1, big + 0.3));
    }

    // ---------------- super ----------------
    const supers = createSupers({
      scene, fx, audio, fs, opp, hurt, say, explode, slash, surfaceBelow, S: () => S, shake: (a) => ctx.shake(a), camPunch: camPunchFn, setPose,
    });
    function startSuper(f) {
      const ft = f.ft;
      f.meter = 0; endShield(f, false); releaseGrab(f); if (f.item) dropItem(f, false);
      f.st = 'super'; f.atk = null; f.charging = false; f.sup = { phase: 'cine', kind: ft.sup.id, t: 0 }; f.holder.visible = true; f.inv = Math.max(f.inv, 1.2);
      f.supers++; stat.supers[f.i]++;
      cine = { f, t: 0, dur: 0.9 };
      setPose(f, 'cheer'); f.vx = 0; f.vy = Math.max(0, Math.min(f.vy, 2)) * 0;
      hud.showBig(`${ft.sup.name}!`, 1100, '#' + new THREE.Color(f.col).lerp(new THREE.Color(0xffffff), 0.35).getHexString());
      audio.sfx('powerup', { vol: 1, rate: 0.7 }); audio.sfx('bell', { vol: 0.6, rate: 1.3 }); ctx.shake(0.5);
      flashT = 0; flashCol = 0xffffff; flashMax = 0.85;
      L.hemi.intensity = hemiI0 * 0.4; L.sun.intensity = sunI0 * 0.5;
    }
    function cineUpdate(dt) {
      const f = cine.f; cine.t += dt; const k = cine.t / cine.dur;
      for (const g of fs) { if (g === f) { g.c.update(dt); g.holder.position.set(g.x, g.y + g.hh / 2, 0); } }
      f.holder.rotation.y = Math.sin(cine.t * 18) * 0.08;
      if (Math.random() < 0.9) fx.particles.emit(f.x + rand(-1.4, 1.4), f.y + rand(0, f.hh + 1), 0.6, rand(-2, 2), rand(1, 6), 0, { life: 0.5, size: 0.7, color: pick([0xffffff, f.col, 0xffe14a, 0xff6fa5]), gravity: -2 });
      if (cine.t < dt * 1.5 || (cine.t % 0.3) < dt) fx.particles.ring(f.x, f.y + f.hh / 2, 0.8, { count: 28, speed: 6 + k * 14, color: f.col, size: 0.5, life: 0.5 });
      f.aura.visible = true; f.aura.material.color.setHSL((T * 2) % 1, 0.9, 0.6); f.aura.scale.setScalar((1.6 + Math.sin(cine.t * 20) * 0.12 + k * 0.5) * f.size); f.aura.material.opacity = 0.4;
      if (cine.t >= cine.dur) {
        cine = null; f.holder.rotation.y = 0; L.hemi.intensity = hemiI0; L.sun.intensity = sunI0; f.aura.visible = false;
        flashT = 0; flashCol = f.col; flashMax = 0.55;
        supers.go(f);
      }
    }

    // ---------------- KO / respawn / einde ----------------
    function ko(f) {
      if (f.st === 'dead') return;
      const cx = clamp(f.x, -BLAST.x + 3, BLAST.x - 3), cy = clamp(f.y, BLAST.bot + 1, BLAST.top - 1);
      releaseGrab(f);
      f.st = 'dead'; f.holder.visible = false; f.tag.visible = false; f.blob.visible = false; f.bubble.visible = false; f.aura.visible = false; f.ice.visible = false; f.discPlat.on = false; f.disc.visible = false;
      dropItem(f, false); f.deadT = 1.5; f.atk = null; f.sup = null; f.charging = false; f.holder.rotation.set(0, 0, 0);
      const who = f.lastHit >= 0 && T - f.lastHitT < 6 ? f.lastHit : -1; if (who >= 0) fs[who].kos++;
      stop = 0; slowK = 0.25; slowHold = 0.7; ctx.shake(0.85); camPunch = 1;
      // effect op de rand van het beeld
      const ex = clamp(f.x, camTgt.x - viewHW + 1.5, camTgt.x + viewHW - 1.5), ey = clamp(f.y, camTgt.y - viewHH + 1.5, camTgt.y + viewHH - 1.5);
      fx.particles.burst(ex, ey, 1, { count: 60, speed: 12, up: 0.3, life: 1.1, size: 0.7, colors: [0xffe14a, 0xffffff, f.col, 0xff6fa5], gravity: 0 });
      fx.particles.ring(ex, ey, 1, { count: 36, speed: 16, color: f.col, size: 0.5, life: 0.6 });
      fx.texts.add('KO!', ex, ey, 1.5, '#ffe14a', 2.8);
      audio.sfx('bell', { vol: 0.9 }); audio.sfx('explode', { vol: 0.5, rate: 1.4 }); audio.sfx('lose', { vol: 0.3 });
      if (over) { refreshHud(); return; }
      f.stocks--; f.meter = Math.min(100, f.meter + 20);
      refreshHud(); checkRage();
      if (f.stocks <= 0) endMatch(1 - f.i, `${names[f.i]} is al zijn levens kwijt!`);
    }
    function respawn(f) {
      const r = S.resp(f.i);
      f.st = 'free'; f.x = r.x; f.y = r.y; f.vx = f.vy = 0; f.pct = 0; f.inv = 2.4; f.grounded = false; f.jumps = f.maxJumps; f.glide = f.glideMax; f.boostUsed = false; f.wallJ = 1; f.cd = 0; f.spCd = 0; f.lag = 0; f.hitstun = 0; f.tumble = 0; f.frozenT = 0; f.rollT = 0; f.starT = 0;
      f.holder.visible = true; f.tag.visible = true; f.blob.visible = true; f.holder.rotation.set(0, 0, 0); setPose(f, 'idle');
      f.discPlat.x = f.x; f.discPlat.y = f.y - 0.4; f.discPlat.on = true; f.discPlat.t = 3.2; f.disc.visible = true; f.disc.position.set(f.x, f.discPlat.y, 0);
      fx.particles.burst(f.x, f.y + 0.5, 0, { count: 28, speed: 6, up: 1.5, life: 0.8, size: 0.5, colors: [0xffffff, f.col, 0xffe14a], gravity: 3 });
      audio.sfx('sparkle', { vol: 0.7 }); say('terug!', f.x, f.y + 3, '#ffffff', 1.2);
      f.tagKey = ''; drawTag(f);
    }
    let endWhy = '';
    function endMatch(w, why) {
      if (over) return; over = true; winner = w; endT = 2.2; slowK = 0.35; slowHold = 2;
      hud.setTimer(null); hud.showBig(w == null ? 'GELIJK!' : `${names[w]} WINT!`, 2000, '#ffe14a'); audio.sfx('win', { vol: 0.8 });
      if (w != null) { setPose(fs[w], 'cheer'); setPose(fs[1 - w], 'sad'); }
      refreshHud();
      endWhy = why || '';
    }
    function finishMatch() {
      if (finished) return; finished = true; if (meterUI) { meterUI.dispose(); meterUI = null; }
      const w = winner, l = 1 - w, a = fs[w], b = fs[l];
      const jokes = [`${names[w]} meppert ${names[l]} de wolken in!`, `${names[l]} vliegt nog steeds. Hoi, vogeltjes!`, `${names[w]} is de koning van het ${S.kind === 'volcano' ? 'vulkaanpodium' : S.kind === 'dragon' ? 'drakenrug-podium' : 'zwevende eiland'}.`, `De draak is zwaar onder de indruk van ${names[w]}.`, `${names[l]} had geen kans, maar wel veel stijl.`];
      const bits = [];
      bits.push(`${FT[a.type].name} ${names[w]} tegen ${FT[b.type].name} ${names[l]} op de ${STAGES[S.kind].name}`);
      if (a.kos + b.kos > 0) bits.push(`${a.kos + b.kos} keer KO`);
      if (stat.supers[0] + stat.supers[1]) bits.push(`${stat.supers[0] + stat.supers[1]}x super`);
      if (stat.explosions) bits.push(`${stat.explosions} ontploffing${stat.explosions > 1 ? 'en' : ''}`);
      if (stat.freezes) bits.push(`${stat.freezes}x bevroren`);
      if (stat.grabs) bits.push(`${stat.grabs}x gegrepen`);
      if (stat.dragons) bits.push(`${stat.dragons}x draak op bezoek`);
      ctx.finishPvp({ winner: w, score: [fs[0].stocks, fs[1].stocks], delay: 700, summary: `${pick(jokes)} ${endWhy ? endWhy + ' ' : ''}<br><small>Schade: ${names[0]} ${Math.round(fs[0].pct)}% · ${names[1]} ${Math.round(fs[1].pct)}%${bits.length ? ' · ' + bits.join(' · ') : ''}</small>` });
    }
    function timeUp() {
      const a = fs[0], b = fs[1];
      if (a.stocks !== b.stocks) { endMatch(a.stocks > b.stocks ? 0 : 1, `Meeste levens na ${MATCH} seconden.`); return; }
      if (Math.abs(a.pct - b.pct) >= 20) { endMatch(a.pct < b.pct ? 0 : 1, 'Evenveel levens, maar minder schade.'); return; }
      startSD();
    }
    function startSD() {
      sd = true; sdT = SD_MAX; hud.showBig('SUDDEN DEATH!', 1600, '#ff4a4a'); hud.toast('Eén leven, 250% schade: één klap en je vliegt!', 2800); audio.sfx('buzz', { vol: 0.9 }); ctx.shake(0.6);
      for (const f of fs) { if (f.st === 'dead') { f.deadT = 0; } f.stocks = 1; f.pct = 250; f.rage = false; f.dmgMul = 1; f.inv = 1.8; f.tagKey = ''; }
      hud.setTimer(null); refreshHud();
      startDragon(); sdRain = 2; sdDr = 14;
    }

    // ---------------- evenementen ----------------
    function nextEvent() {
      eventN++;
      let kinds = ['dragon', 'gravity', 'rain', 'golden'].filter((k) => k !== lastEvent && !(k === 'dragon' && S.kind === 'dragon') && !(k === 'golden' && goldenN >= 2));
      if (!goldenN && eventN >= 2 && !sd) kinds = ['golden'];
      const k = pick(kinds); lastEvent = k;
      if (k === 'dragon') startDragon();
      else if (k === 'golden') { goldenN++; startDragon('gold'); }
      else if (k === 'gravity') {
        gEvKind = Math.random() < 0.5 ? 'maan' : 'zwaar'; gEv = gEvKind === 'maan' ? 0.45 : 1.5; gEvT = 7.5;
        hud.showBig(gEvKind === 'maan' ? '🌙 MAANGRAP!' : '⚖️ ZWAAR!', 1300, gEvKind === 'maan' ? '#b8d0ff' : '#ff9a6a');
        hud.toast(gEvKind === 'maan' ? 'De zwaartekracht neemt vakantie: alles zweeft!' : 'Autsj! De zwaartekracht is dubbel zo sterk!', 2600);
        audio.sfx(gEvKind === 'maan' ? 'boing' : 'thud', { vol: 0.8 }); L.hemi.color.set(gEvKind === 'maan' ? 0xb8c8ff : 0xffa078);
      } else {
        hud.showBig('🎁 CADEAUTJES!', 1200, '#ffe14a'); for (let i = 0; i < 3; i++) setTimeout(() => { if (!finished && !over) spawnItem(null, S.kind === 'island' ? rand(-8, 8) : S.itemX()); }, i * 450);
      }
      eventT = rand(13, 18);
    }

    // ---------------- camera ----------------
    const camTgt = new THREE.Vector3(0, 3, 0); let camDist = 40, viewHW = 20, viewHH = 12;
    function updateCamera(dt, snap) {
      const b = S.camBase(); let x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1, minD = 28;
      if (cine) { const f = cine.f; x0 = f.x - 6; x1 = f.x + 6; y0 = f.y - 2.5; y1 = f.y + f.hh + 3; minD = 15; }
      else if (phase === 'select' || phase === 'ready') { const a = fs[0], c = fs[1]; x0 = Math.min(a.x, c.x) - 4.5; x1 = Math.max(a.x, c.x) + 4.5; y0 = Math.min(a.y, c.y) - 1.8; y1 = Math.max(a.y, c.y) + 6.4; minD = 17; }
      else if (phase === 'play') for (const f of fs) if (f.st !== 'dead') { x0 = Math.min(x0, f.x - 3.5); x1 = Math.max(x1, f.x + 3.5); y0 = Math.min(y0, f.y - 2.5); y1 = Math.max(y1, f.y + f.hh + 3); }
      if (!cine && phase !== 'select' && phase !== 'ready') { x0 = Math.max(x0, -30); x1 = Math.min(x1, 30); y0 = Math.max(y0, -11); y1 = Math.min(y1, 17); }
      const hw = (x1 - x0) / 2, hh = (y1 - y0) / 2, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), asp = camera.aspect || 1.7;
      let dist = Math.max(hh * 1.18 / tanV, hw / (tanV * asp)); dist = clamp(dist, minD, 66) * (1 - camPunch * 0.06);
      const k = snap ? 1 : 1 - Math.exp(-(cine ? 9 : 4) * dt);
      camDist = lerp(camDist, dist, k);
      camTgt.x = lerp(camTgt.x, (x0 + x1) / 2, k); camTgt.y = lerp(camTgt.y, (y0 + y1) / 2 + 0.5, k);
      camera.position.set(camTgt.x * 0.9, camTgt.y + camDist * 0.15 + 0.8, camDist);
      camera.lookAt(camTgt.x, camTgt.y - 0.8, 0);
      viewHH = camDist * tanV; viewHW = viewHH * asp;
      camPunch = Math.max(0, camPunch - dt * 2.2);
    }

    // ---------------- vechter-update ----------------
    function land(f, surf) {
      if (!f.grounded && f.vy < -8 && f.st !== 'hit') { fx.particles.dust(f.x, f.y, 0, 4); audio.sfx('land', { vol: clamp(-f.vy / 40, 0.15, 0.5) }); f.c.squash = 0.15; }
      if (f.st === 'hit' && f.vy < -9) { f.vy = -f.vy * 0.35; f.vx *= 0.7; f.grounded = false; audio.sfx('thud', { vol: 0.35 }); fx.particles.dust(f.x, f.y, 0, 6); f.tumble *= 0.5; return; }
      // luchtslag: landen annuleert (automatisch of met korte landingslag)
      if (f.st === 'atk' && f.atk && f.atk.air) { if (f.atkT >= f.atk.wind + f.atk.act) { f.st = 'free'; f.atk = null; } else f.atkT = Math.max(f.atkT, f.atk.wind + f.atk.act + f.atk.rec - 0.1); f.vx *= 0.5; }
      f.vy = 0; f.grounded = true; f.ground = surf; f.jumps = f.maxJumps; f.wallJ = 1; f.boostUsed = false; f.glide = f.glideMax;
    }
    function physics(f, dt, g) {
      const gp = f.ground;
      if (gp && gp.moving && gp.on !== false) { f.x += gp.dx; f.y += gp.dy; }
      const py = f.y, hw = f.hw, hh = f.hh, sol = S.solid;
      f.wall = 0; f.vy -= g * dt; f.vy = Math.max(f.vy, f.st === 'hit' ? -45 : f.st === 'super' ? -60 : -(f.fast ? FASTFALL : FALLMAX * f.ft.stats.fall));
      if (S.wind && f.st !== 'super') f.x += S.wind * dt * (f.grounded ? 0.35 : 0.6);
      f.x += f.vx * dt; f.y += f.vy * dt; f.grounded = false; f.ground = null;
      // vast blok (eiland, toren)
      if (sol) {
        const IHW = sol.hw;
        const ox = f.x + hw * 0.55 > -IHW && f.x - hw * 0.55 < IHW;
        if (f.vy <= 0 && py >= sol.top - 0.02 && f.y <= sol.top && ox) { f.y = sol.top; land(f, S.mainP); }
        else if (f.y < sol.top - 0.02 && f.y + hh > sol.bot && f.x + hw > -IHW && f.x - hw < IHW) {
          if (py + hh <= sol.bot + 0.2 && f.vy > 0) { f.y = sol.bot - hh; f.vy = -Math.abs(f.vy) * (f.st === 'hit' ? 0.4 : 0.1); if (f.st === 'hit') audio.sfx('thud', { vol: 0.3 }); }
          else if (f.x < 0) { f.x = -IHW - hw; if (f.vx > 0) f.vx = f.st === 'hit' ? -f.vx * 0.35 : 0; f.wall = -1; }
          else { f.x = IHW + hw; if (f.vx < 0) f.vx = f.st === 'hit' ? -f.vx * 0.35 : 0; f.wall = 1; }
        }
      }
      // zachte platforms
      if (!f.grounded && f.vy <= 0 && f.drop <= 0) {
        for (let k = 0; k < plats.length + 2; k++) {
          const p = k < plats.length ? plats[k] : fs[k - plats.length].discPlat; if (p.on === false) continue;
          if (py >= p.y - 0.02 && f.y <= p.y && Math.abs(f.x - p.x) < p.w / 2 + hw * 0.4) { f.y = p.y; land(f, p); break; }
        }
      }
      // trampolines
      for (const t of tramps) {
        if (f.vy < 0 && py >= t.y + 0.5 && f.y <= t.y + 0.9 && Math.abs(f.x - t.x) < 1.5) { f.vy = (f.inp && f.inp.y < -0.5 ? 38 : 31) * Math.sqrt(GRAV); f.grounded = false; f.jumps = Math.max(f.jumps, 1); f.boostUsed = false; t.sq = 1; audio.sfx('boing', { vol: 0.8 }); say('BOING!', t.x, t.y + 2, '#ff6fa5', 1.2); fx.particles.ring(t.x, t.y + 0.7, 0, { count: 14, speed: 5, color: 0xffe14a, size: 0.3, life: 0.4 }); f.c.jump(); if (f.st === 'hit') f.hitstun = Math.min(f.hitstun, 0.1); }
      }
    }
    // knop-randen (net ingedrukt) eenmaal per beeld inlezen en bewaren, zodat ze tijdens hit-pauze of deelstapjes niet verloren gaan of dubbel tellen
    const NOE = { a: false, b: false, up: false, dn: false, l: false, r: false };
    function pollEdges(f) {
      const inp = pv.input(f.i), e = f.pend || (f.pend = { a: false, b: false, up: false, dn: false, l: false, r: false });
      e.a = e.a || inp.aP; e.b = e.b || inp.bP; e.l = e.l || inp.leftP; e.r = e.r || inp.rightP;
      e.up = e.up || inp.upP || (inp.y < -0.7 && !f.pUp); e.dn = e.dn || inp.downP || (inp.y > 0.7 && !f.pDn);
      f.pUp = inp.y < -0.7; f.pDn = inp.y > 0.7;
    }
    function startBoost(f, inp) {
      const u = f.ft.up;
      f.st = 'boost'; f.rollT = u.dur; f.boostUsed = true; f.cdMax = 2.6; f.cd = 2.6; f.hitDone = !(u.dmg > 0); f.bdmg = u.dmg; f.bsp = u.spd; f.blink = u.kind === 'blink'; f.atk = null; f.grounded = false;
      const sx = Math.abs(inp.x) > 0.4 ? sgn(inp.x) : 0; const l = Math.hypot(sx * 0.7, 1); f.bx = sx * 0.7 / l; f.by = 1 / l; if (sx) f.face = sx;
      if (f.blink) {
        f.inv = Math.max(f.inv, u.dur + 0.3); audio.sfx('sparkle', { vol: 0.7, rate: 1.6 }); audio.sfx('whoosh', { vol: 0.4, rate: 1.8 });
        fx.particles.burst(f.x, f.y + f.hh / 2, 0, { count: 22, speed: 6, up: 0, life: 0.6, size: 0.7, colors: [0xffffff, f.col, 0xd9a8ff], gravity: -1 });
      } else {
        audio.sfx('whoosh', { vol: 0.7, rate: 0.8 }); audio.sfx('powerup', { vol: 0.3, rate: 1.5 }); fx.particles.burst(f.x, f.y, 0, { count: 16, speed: 6, up: -0.5, life: 0.5, size: 0.5, colors: f.type === 'ninja' ? [0x555566, 0xffffff] : [0xff7a1a, 0xffd070], gravity: 0 });
      }
      say(u.name, f.x, f.y + f.hh + 0.8, '#ff9a3a', 1.1); f.c.jump();
    }
    function startRoll(f, dir) {
      f.st = 'roll'; f.rollT = 0.27; f.rollDir = dir; f.face = dir; f.inv = 0.3; f.cdMax = 1.3; f.cd = 1.3; f.atk = null;
      audio.sfx('whoosh', { vol: 0.5, rate: 1.4 }); fx.particles.dust(f.x, f.y, 0, 5);
    }
    // B-knop: speciale zet (richting), gooien (als je een zwaard/stok draagt), roll (omlaag) of schild
    function startSpecial(f, inp) {
      const up = inp.y < -0.5, down = inp.y > 0.5, side = Math.abs(inp.x) > 0.5;
      if (f.item && ITEMS[f.item.type].thr && (up || down || side)) { if (side) f.face = sgn(inp.x); throwItem(f, inp); return; }
      if (up && !f.boostUsed && f.cd <= 0) { startBoost(f, inp); return; }
      if (side && !up && f.spCd <= 0) {
        f.face = sgn(inp.x); const key = f.ft.side, A = f.AT[key]; f.spCd = A.cd || 1; startAttack(f, key); say(({ spin: 'WERVEL!', mbolt: 'VUURBAL!', rush: 'STORMRAM!', dash: 'DASH!' })[key] || '', f.x, f.y + f.hh + 0.8, '#ffffff', 1.0); return;
      }
      if (down && f.cd <= 0) { startRoll(f, f.face); return; }
      if (f.cd <= 0) startShield(f);
    }
    function trySuper(f, e, inp) {
      if (f.meter < 100 || !inp.a || !inp.b || !(e.a || e.b) || f.lag > 0.2 || over) return false;
      if (f.st !== 'free' && f.st !== 'atk' && f.st !== 'shield') return false;
      startSuper(f); return true;
    }
    function stepFighter(f, dt, first) {
      const inp = pv.input(f.i); f.inp = inp;
      let e = NOE; if (first && f.pend) { e = { ...f.pend }; for (const k in f.pend) f.pend[k] = false; }
      const o = opp(f), ft = f.ft, stt = ft.stats;
      f.inv = Math.max(0, f.inv - dt); f.cd = Math.max(0, f.cd - dt); f.spCd = Math.max(0, f.spCd - dt); f.lag = Math.max(0, f.lag - dt); f.comboT = Math.max(0, f.comboT - dt); f.drop = Math.max(0, f.drop - dt); f.buf = Math.max(0, f.buf - dt);
      f.hitCool = Math.max(0, f.hitCool - dt); f.fireCd = Math.max(0, f.fireCd - dt); if (f.starT > 0) f.starT -= dt;
      if (f.discPlat.on) { f.discPlat.t -= dt; if (f.discPlat.t <= 0 || (f.inv <= 0.1)) { f.discPlat.on = false; f.disc.visible = false; } }
      const g = G0 * GRAV * gEv * stt.grav * (f.st === 'hit' ? 0.62 : 1);
      f.fast = false;
      // item vasthouden: bom tikt door
      if (f.item) {
        f.item.t += dt;
        if (f.item.type === 'bomb') { f.item.fuse -= dt; const sp = f.itemMesh && f.itemMesh.userData.spark; if (sp) sp.scale.setScalar(1 + Math.sin(T * (f.item.fuse < 1.2 ? 40 : 14)) * 0.5); if (f.item.fuse <= 0) { const bx = f.x, by = f.y + f.hh * 0.6; dropItem(f, false); explode(bx, by, f); } }
        else if (f.item.t > 14) { dropItem(f, true); }
      }
      if (f.st === 'frozen') {
        f.frozenT -= dt; if (e.a || e.b || e.up || e.l || e.r) { f.frozenT -= 0.13; f.c.squash = 0.06; audio.sfx('click2', { vol: 0.4 }); }
        f.vx = damp(f.vx, 0, 6, dt); if (f.frozenT <= 0) thaw(f, false);
        physics(f, dt, g); checkBlast(f); return;
      }
      if (f.st === 'grabbed') {
        const h = f.grabber;
        if (e.a || e.b || e.up || e.dn || e.l || e.r) { f.mash++; f.c.squash = 0.05; audio.sfx('click2', { vol: 0.3 }); }
        if (!h || h.st !== 'hold') { releaseGrab(f); }
        else if (f.mash >= 8) { say('LOS!', f.x, f.y + f.hh + 1, '#ffffff', 1.2); audio.sfx('pop', { rate: 1.3 }); const hh = h; releaseGrab(f); f.vx = -hh.face * 6; f.vy = 4; hh.vx = hh.face * -3; }
        else { f.x = h.x + h.face * (h.hw + f.hw + 0.15); f.y = h.y; f.vx = f.vy = 0; f.grounded = true; f.face = -h.face; }
        checkBlast(f); return;
      }
      if (f.st === 'super') {
        if (f.sup && f.sup.phase !== 'cine') { const ph = supers.step(f, dt); if (f.st === 'super' && ph) physics(f, dt, ph === 2 ? 0 : g); }
        checkBlast(f); return;
      }
      if (trySuper(f, e, inp)) { checkBlast(f); return; }
      const spd = f.spd;
      const tx = Math.abs(inp.x) > 0.2 ? inp.x : 0;
      if (f.st === 'free') {
        // lopen
        const ground = f.grounded;
        const rate = ground ? (tx ? lerp(20, 2.2, SLIP) : lerp(22, 0.9, SLIP)) : (tx ? 5.5 : 0.7);
        f.vx = damp(f.vx, tx * (ground ? RUN * stt.run : AIRMAX * stt.air) * spd, rate, dt);
        if (Math.abs(tx) > 0.3) {
          const s = sgn(tx);
          if (!ground && s !== f.face) { f.backT += dt; if (f.backT > 0.13) { f.face = s; f.backT = 0; } } else { f.face = s; f.backT = 0; }
        } else f.backT = 0;
        // springen
        if (e.up) {
          if (f.grounded) { f.vy = JUMP1 * stt.jump * (GRAV < 1 ? 0.85 : 1); f.jumps = f.maxJumps - 1; f.grounded = false; f.c.jump(); audio.sfx('jump', { vol: 0.4 }); fx.particles.dust(f.x, f.y, 0, 4); }
          else if (f.wall !== 0 && f.wallJ > 0 && S.solid && f.y < S.solid.top - 0.3) { f.vy = 16; f.vx = -f.wall * 2.5; f.wallJ--; f.c.jump(); audio.sfx('jump', { vol: 0.4, rate: 1.3 }); fx.particles.dust(f.x + f.wall * 0.4, f.y + 1, 0, 5, 0xbdb0d8); say('hup!', f.x, f.y + 2.5, '#ffffff', 0.9); }
          else if (f.jumps > 0) { f.vy = JUMP2 * stt.jump * (GRAV < 1 ? 0.88 : 1); f.jumps--; f.c.jump(); audio.sfx('jump', { vol: 0.4, rate: 1.4 }); fx.particles.ring(f.x, f.y + 0.2, 0, { count: 10, speed: 4, color: f.type === 'ninja' ? 0x79e0c4 : 0xffffff, size: 0.28, life: 0.35 }); }
        }
        // zweven (magier): houd omhoog ingedrukt tijdens het vallen
        if (f.glideMax && !f.grounded && inp.y < -0.5 && f.vy < 0 && f.glide > 0 && !e.up) { f.vy = Math.max(f.vy, -2.2); f.glide -= dt; if (Math.random() < dt * 20) fx.particles.emit(f.x + rand(-0.5, 0.5), f.y + 0.1, 0.4, rand(-0.5, 0.5), rand(-2, -0.5), 0, { life: 0.5, size: 0.4, color: 0xd9a8ff, gravity: 0 }); }
        // muur-klampen en snelvallen
        if (!f.grounded && f.wall !== 0 && f.vy < 0 && Math.sign(tx) === -f.wall && S.solid && f.y < S.solid.top - 0.3) f.vy = Math.max(f.vy, -3.5);
        if (!f.grounded && inp.y > 0.6 && f.vy < 0) f.fast = true;
        if (f.grounded && e.dn && f.ground && !f.ground.solid && !f.ground.tmp && !f.ground.nodrop) { f.drop = 0.25; f.y -= 0.05; f.grounded = false; }
        // aanvallen
        if ((e.a || f.buf > 0) && f.lag <= 0) {
          f.buf = 0;
          if (f.item) useItem(f, inp); else startAttack(f, chooseAttack(f, inp));
          f.discPlat.on = false; f.disc.visible = false;
        } else if (e.a) f.buf = 0.25;
        // B: speciaal / roll / schild
        else if (e.b && f.lag <= 0) startSpecial(f, inp);
        if (f.grounded) { f.c.air = false; f.c.speed = Math.abs(f.vx) / (RUN * stt.run); } else { f.c.air = true; f.c.speed = 0; }
      } else if (f.st === 'atk') {
        // tijdens de slag: grond-wrijving, lucht-drift
        if (f.grounded) f.vx = damp(f.vx, 0, 9, dt); else f.vx = damp(f.vx, tx * AIRMAX * stt.air * 0.85 * spd, 3.5, dt);
        if (e.a && f.atkT > (f.atk.wind + f.atk.act) * 0.8) f.buf = 0.25;      // volgende slag alvast inplannen
        if (e.up && f.atkPhase === 2 && (f.jumps > 0 || f.grounded)) { f.st = 'free'; f.atk = null; f.itemUse = false; f.charging = false; f.holder.rotation.y = 0; if (f.grounded) { f.vy = JUMP1 * stt.jump; f.jumps = f.maxJumps - 1; f.grounded = false; } else { f.vy = JUMP2 * stt.jump; f.jumps--; } f.c.jump(); audio.sfx('jump', { vol: 0.4, rate: 1.4 }); }
        else stepAttack(f, dt);
        f.c.air = !f.grounded; f.c.speed = 0;
      } else if (f.st === 'shield') {
        f.shT += dt; f.shLeft -= dt * 0.55; f.vx = damp(f.vx, 0, 14, dt);
        if (!inp.b || f.shLeft <= 0 || f.shT > 1.4) { if (f.shLeft <= 0) { f.shLeft = 0; } endShield(f, false); setPose(f, 'idle'); }
        else if (e.a && f.shT > 0.03 && f.lag <= 0) {
          endShield(f, false);
          if (f.item) useItem(f, inp); else if (f.grounded) startGrab(f); else startAttack(f, 'nair');
        }
        f.bubble.scale.setScalar((1.55 + Math.sin(T * 18) * 0.03) * f.size * (0.7 + 0.3 * clamp(f.shLeft / 1.2, 0, 1)));
        f.bubble.material.opacity = f.shT < 0.14 ? 0.8 : 0.35;
        f.c.speed = 0; f.c.air = false;
      } else if (f.st === 'grab') {
        stepGrab(f, dt); f.c.speed = 0;
      } else if (f.st === 'hold') {
        stepHold(f, dt, e, inp); f.c.speed = 0;
      } else if (f.st === 'roll') {
        f.rollT -= dt;
        if (f.grounded) f.vx = f.rollDir * 13 * spd; else { f.vx = f.rollDir * 14 * spd; f.vy = Math.max(f.vy, 0) * 0.5; }
        f.inv = Math.max(f.inv, 0.05);
        if (Math.random() < 0.5) fx.particles.dust(f.x, f.y + 0.5, 0, 1, 0xd0c0ff);
        if (f.rollT <= 0) { f.st = 'free'; f.inv = Math.min(f.inv, 0.05); }
        f.c.speed = 1; f.c.air = !f.grounded;
      } else if (f.st === 'boost') {
        f.rollT -= dt; f.vx = f.bx * f.bsp; f.vy = f.by * f.bsp;
        if (!f.blink) for (let k = 0; k < 2; k++) fx.particles.emit(f.x - f.bx * 0.6 + rand(-0.3, 0.3), f.y + 0.6 - f.by * 0.6, 0, rand(-1, 1), rand(-2, 0), 0, { life: 0.4, size: 0.55, color: f.type === 'ninja' ? pick([0x555566, 0x333344, 0xffffff]) : pick([0xff7a1a, 0xffd070, 0xffffff]), gravity: 0 });
        // raakt je broer onderweg
        if (!f.hitDone) { const d = o, hw2 = f.hw + 0.7; if (d.st !== 'dead' && Math.abs(d.x - f.x) < hw2 + d.hw && d.y < f.y + f.hh && d.y + d.hh > f.y) { const okk = hurt(d, { dmg: f.bdmg, bkb: 9 * f.pow, kbg: 0.05, ang: 65, dirx: sgn(d.x - f.x) || f.face, att: f, x: d.x, y: d.y + d.hh / 2 }); if (okk) f.hitDone = true; } }
        if (f.rollT <= 0) {
          f.st = 'free'; f.vy *= 0.5; f.vx *= 0.5;
          if (f.blink) { f.blink = false; f.vx *= 0.3; f.vy = Math.max(f.vy, 3); fx.particles.burst(f.x, f.y + f.hh / 2, 0, { count: 18, speed: 5, up: 0, life: 0.5, size: 0.6, colors: [0xffffff, f.col, 0xd9a8ff], gravity: -1 }); }
        }
        f.c.air = true;
      } else if (f.st === 'hit') {
        f.hitstun -= dt;
        f.vx *= Math.exp(-KDRAG * dt * (f.grounded ? 5 : 1)); f.vx += inp.x * 9 * dt;                  // een beetje sturen (DI)
        if (f.tumble) f.holder.rotation.z -= f.tumble * dt;
        if (f.hitstun <= 0) { f.st = 'free'; setPose(f, f.item ? 'carry' : 'idle'); f.tumble = 0; }
        f.c.air = !f.grounded; f.c.speed = 0;
      }
      physics(f, dt, g);
      // tuimel-rotatie netjes terugzetten
      if (f.st !== 'hit') f.holder.rotation.z = damp(f.holder.rotation.z, 0, 16, dt);
      // draak-vuur / vlammen raken
      for (const fl of flames) if (f.fireCd <= 0 && Math.abs(fl.x - f.x) < f.hw + 0.7 && f.y < fl.y + 1.8 && f.y + f.hh > fl.y) {
        if (hurt(f, { dmg: 7, bkb: 8, kbg: 0.06, ang: 78, dirx: sgn(f.x - fl.x) || 1, x: f.x, y: f.y + 1, snd: 'sizzle' })) { f.fireCd = 0.9; say('HEET!', f.x, f.y + 2.5, '#ff7a1a', 1.2); } else f.fireCd = 0.3;
      }
      checkBlast(f);
    }
    function checkBlast(f) { if (f.st !== 'dead' && (f.x < -BLAST.x || f.x > BLAST.x || f.y < BLAST.bot || f.y > BLAST.top)) ko(f); }

    // ---------------- per frame ----------------
    function updateItems(dt) {
      for (const it of items) {
        if (it.dead) continue;
        it.t += dt; it.life -= (it.st === 'ground' ? dt : 0);
        if (it.st === 'fall') {
          it.y += it.vy * dt * (it.balloon && it.balloon.visible ? 0.5 + gEv * 0.5 : 1); it.x += S.fdx; const s = surfaceBelow(it.x, it.y + 0.2);
          if (it.balloon) { it.balloon.position.x = Math.sin(it.t * 2) * 0.25; it.balloon.rotation.z = Math.sin(it.t * 2) * 0.1; }
          if (s !== null && it.y <= s) {
            it.y = s; it.st = 'ground'; it.plat = lastSurf; if (it.balloon) it.balloon.visible = false; it.g.children[2].visible = false;
            fx.particles.burst(it.x, it.y + 2.6, 0, { count: 12, speed: 4, up: 0.5, life: 0.5, size: 0.4, colors: [ITEMS[it.type].hex, 0xffffff], gravity: 5 }); audio.sfx('pop', { vol: 0.5 });
            if (it.type === 'tramp') { addTramp(it.x, it.y); killItem(it); continue; }
          }
          if (it.y < BLAST.bot) { killItem(it); continue; }
        } else {
          const pl = it.plat;
          if (pl && pl.on === false) { it.st = 'fall'; it.vy = -9; it.plat = null; if (it.balloon) it.balloon.visible = false; it.g.children[2].visible = false; continue; }
          if (pl && pl.moving) { it.x += pl.dx; it.y += pl.dy; }
          it.g.rotation.y = Math.sin(it.t * 2) * 0.5; it.g.children[0].position.y = 0.15 + Math.sin(it.t * 4) * 0.12;
          if (it.life <= 0) { fx.particles.burst(it.x, it.y + 0.6, 0, { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xffffff], gravity: 3 }); killItem(it); continue; }
          it.g.position.set(it.x, it.y, 0);
          // oppakken
          for (const f of fs) if ((ITEMS[it.type].instant || !f.item) && (f.st === 'free' || f.st === 'atk' || f.st === 'roll') && Math.abs(f.x - it.x) < f.hw + 0.9 && f.y < it.y + 1.4 && f.y + f.hh > it.y) { collect(f, it); break; }
          continue;
        }
        it.g.position.set(it.x, it.y, 0);
        // meepakken in de lucht
        for (const f of fs) if (!it.dead && (ITEMS[it.type].instant || !f.item) && f.st !== 'dead' && f.st !== 'hit' && f.st !== 'frozen' && f.st !== 'grabbed' && f.st !== 'super' && Math.abs(f.x - it.x) < f.hw + 0.9 && f.y < it.y + 1 && f.y + f.hh > it.y - 0.3) { collect(f, it); break; }
      }
      for (let i = items.length - 1; i >= 0; i--) if (items[i].dead) items.splice(i, 1);
    }
    function collect(f, it) { if (ITEMS[it.type].instant) instant(f, it.type); else giveItem(f, it.type, it.uses); killItem(it); }
    // trampolines
    function addTramp(x, y) {
      stat.trampolines++;
      const g = mkItemMesh('tramp'); g.position.set(x, y, 0); scene.add(g); tramps.push({ x, y: y + 0.55, g, life: 14, sq: 0, plat: lastSurf, y0: y });
      say('TRAMPOLINE!', x, y + 3, '#ff6fa5', 1.3); audio.sfx('boing', { vol: 0.6 });
    }
    function slip(d, t) {
      const ok = hurt(d, { dmg: 4, bkb: 6, kbg: 0, ang: 75, dirx: sgn(d.vx) || d.face, att: t.owner && t.owner !== d ? t.owner : null, x: d.x, y: d.y + 0.5, snd: 'boing', pierce: 1 });
      if (ok) { d.vx = (sgn(d.vx) || d.face) * 8; d.vy = 11; d.tumble = 14 * d.face; d.hitstun = 0.8; say('GLIBBER!', d.x, d.y + d.hh + 1, '#ffe14a', 1.4); fx.particles.burst(d.x, d.y + 0.4, 0.8, { count: 10, speed: 4, up: 1, life: 0.5, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 5 }); }
      return ok;
    }
    function updateTraps(dt) {
      for (const t of traps) {
        t.t += dt; t.life -= dt;
        if (!t.landed) {
          t.vy -= G0 * 0.8 * GRAV * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.vx *= 0.99; const s = surfaceBelow(t.x, t.y + 0.3);
          if (s !== null && t.y <= s && t.vy <= 0) { t.y = s; t.landed = true; t.plat = lastSurf; t.t = 0; t.vx = t.vy = 0; }
          else if (t.y < BLAST.bot) t.life = 0;
        } else if (t.plat) { if (t.plat.on === false) { t.landed = false; t.vy = -2; t.plat = null; } else if (t.plat.moving) { t.x += t.plat.dx; t.y += t.plat.dy; } }
        t.g.position.set(t.x, t.y, 0);
        if (t.kind === 'mine') { const armed = t.landed && t.t > 0.9; const l = t.g.userData.light; if (l) l.material.color.setHex(armed ? (Math.sin(T * 10) > 0 ? 0xff3030 : 0x601010) : 0x606060); }
        if (!t.landed && t.kind !== 'mine') continue;
        for (const d of fs) {
          if (d.st === 'dead' || d.inv > 0 || d.starT > 0 || d.st === 'grabbed' || d.st === 'super') continue;
          if (Math.abs(d.x - t.x) < d.hw + (t.kind === 'mine' ? 0.4 : 0.55) && d.y < t.y + 0.9 && d.y + d.hh > t.y - 0.1) {
            if (t.kind === 'peel') { if (t.owner === d && t.t < 0.7) continue; if (!t.landed) continue; if (slip(d, t)) { t.life = 0; break; } }
            else if (t.landed && t.t > 0.9) { if (t.owner === d && t.t < 3) continue; explode(t.x, t.y + 0.5, t.owner, 0.85, { dmg: 14, bkb: 13 }); t.life = 0; break; }
          }
        }
      }
      for (let i = traps.length - 1; i >= 0; i--) if (traps[i].life <= 0) { scene.remove(traps[i].g); traps.splice(i, 1); }
    }
    function updateProjs(dt) {
      for (const p of projs) {
        if (p.dead) continue;
        p.t += dt;
        if (p.kind === 'bomb') {
          p.vy -= G0 * 0.8 * GRAV * gEv * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.fuse -= dt;
          const s = surfaceBelow(p.x, p.y + 0.3);
          if (s !== null && p.y <= s && p.vy < 0) { p.y = s; p.vy = -p.vy * 0.45; p.vx *= 0.7; if (Math.abs(p.vy) < 2) p.vy = 0; p.bounce++; if (p.bounce < 3) audio.sfx('thud', { vol: 0.25, rate: 1.5 }); }
          p.g.rotation.z -= p.vx * dt * 0.4;
          const spk = p.g.userData.spark; if (spk) spk.scale.setScalar(1 + Math.sin(T * (p.fuse < 1 ? 45 : 18)) * 0.5);
          let boom = p.fuse <= 0 || p.y < BLAST.bot || Math.abs(p.x) > BLAST.x;
          if (!boom) for (const d of fs) if (d.st !== 'dead' && (d !== p.owner || p.t > 0.5) && Math.abs(d.x - p.x) < d.hw + 0.6 && p.y > d.y - 0.3 && p.y < d.y + d.hh + 0.3) boom = true;
          if (boom) { if (p.y > BLAST.bot && Math.abs(p.x) < BLAST.x) explode(p.x, p.y + 0.3, p.owner); freeProj(p); continue; }
        } else if (p.kind === 'ice') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.g.rotation.z += dt * 8;
          fx.particles.emit(p.x, p.y, 0, rand(-1, 1), rand(-1, 1), 0, { life: 0.4, size: 0.35, color: 0xbff0ff, gravity: 0 });
          let gone = p.t > 1.6 || Math.abs(p.x) > BLAST.x || p.y < BLAST.bot || p.y > BLAST.top;
          if (!gone) for (const d of fs) if (d.st !== 'dead' && d !== p.owner && Math.abs(d.x - p.x) < d.hw + 0.55 && p.y > d.y - 0.3 && p.y < d.y + d.hh + 0.3) {
            const ok = hurt(d, { dmg: 5, bkb: 5, kbg: 0.02, ang: 40, dirx: sgn(p.vx), att: p.owner, x: p.x, y: p.y, freeze: 1.9, proj: p });
            if (ok) gone = !(d.st === 'shield' && p.reflected && p.owner === d);
          }
          if (gone) { fx.particles.burst(p.x, p.y, 0, { count: 12, speed: 5, up: 0.5, life: 0.5, size: 0.4, colors: [0xffffff, 0xbff0ff], gravity: 4 }); freeProj(p); continue; }
        } else if (p.kind === 'shot') {
          p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.g.scale.setScalar(p.size * (0.9 + Math.sin(T * 30 + p.x) * 0.1)); p.g.userData.halo.rotation.z += dt * 4;
          fx.particles.emit(p.x, p.y, 0, rand(-1, 1), rand(-1, 1), 0, { life: 0.35, size: 0.4 * p.size + 0.15, color: p.g.children[0].material.color.getHex(), gravity: 0 });
          let gone = p.t > p.life || Math.abs(p.x) > BLAST.x + 4 || p.y < BLAST.bot || p.y > BLAST.top + 4;
          if (p.grav && p.vy < 0) { const s = surfaceBelow(p.x, p.y + 0.3); if (s !== null && p.y <= s) { if (p.bounces > 0) { p.bounces--; p.y = s + 0.05; p.vy = 10; audio.sfx('pop', { vol: 0.3, rate: 1.4 }); } else gone = true; } }
          if (!gone) for (const d of fs) if (d.st !== 'dead' && d !== p.owner && Math.abs(d.x - p.x) < d.hw + 0.6 * p.size && p.y > d.y - 0.4 && p.y < d.y + d.hh + 0.4) {
            const ok = hurt(d, { dmg: p.dmg, bkb: p.bkb * (p.owner ? p.owner.pow : 1), kbg: p.kbg, ang: p.ang, dirx: sgn(p.vx), att: p.owner, x: p.x, y: p.y, big: p.big, proj: p, snd: 'sizzle', hs: p.big ? 0.1 : 0.05 });
            if (ok) { gone = !(d.st === 'shield' && p.reflected && p.owner === d); if (!d.starT && d.st !== 'shield') stat.special++; }
          }
          if (gone) { fx.particles.burst(p.x, p.y, 0, { count: 12, speed: 5, up: 0.4, life: 0.5, size: 0.45, colors: [p.g.children[0].material.color.getHex(), 0xffffff], gravity: 2 }); freeProj(p); continue; }
        } else if (p.kind === 'thrown') {
          p.vy -= G0 * 0.35 * GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.g.rotation.z += p.spin * dt;
          let gone = p.t > 1.8 || Math.abs(p.x) > BLAST.x || p.y < BLAST.bot || p.y > BLAST.top + 8;
          if (!gone) for (const d of fs) if (d.st !== 'dead' && d !== p.owner && Math.abs(d.x - p.x) < d.hw + 0.7 && p.y > d.y - 0.4 && p.y < d.y + d.hh + 0.4) {
            const ok = hurt(d, { dmg: p.dmg, bkb: 8, kbg: 0.09, ang: 40, dirx: sgn(p.vx), att: p.owner, x: p.x, y: p.y, big: p.item === 'sword', proj: p, snd: 'thud' });
            if (ok) { gone = !(d.st === 'shield' && p.reflected && p.owner === d); if (gone) fx.particles.burst(p.x, p.y, 0, { count: 8, speed: 4, up: 0.5, life: 0.4, size: 0.4, colors: [0xffffff, ITEMS[p.item].hex], gravity: 4 }); }
          }
          if (!gone && p.vy < 0) { const s = surfaceBelow(p.x, p.y + 0.3); if (s !== null && p.y <= s) { placeItem(p.item, p.x, s, p.uses); gone = true; } }
          if (gone) { freeProj(p); continue; }
        } else if (p.kind === 'banana') {
          p.vy -= G0 * 0.8 * GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.g.rotation.z += dt * 9;
          let gone = p.y < BLAST.bot || Math.abs(p.x) > BLAST.x;
          if (!gone) for (const d of fs) if (d.st !== 'dead' && d !== p.owner && Math.abs(d.x - p.x) < d.hw + 0.6 && p.y > d.y - 0.4 && p.y < d.y + d.hh + 0.4) { if (slip(d, { owner: p.owner })) { gone = true; break; } }
          if (!gone && p.vy < 0) { const s = surfaceBelow(p.x, p.y + 0.3); if (s !== null && p.y <= s) { addTrap('peel', p.x, s, 0, 0, p.owner); traps[traps.length - 1].landed = true; traps[traps.length - 1].plat = lastSurf; gone = true; } }
          if (gone) { freeProj(p); continue; }
        } else if (p.kind === 'fire') {
          p.vy -= 26 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.g.scale.setScalar(0.9 + Math.sin(T * 30 + p.x) * 0.15);
          fx.particles.emit(p.x, p.y, 0, rand(-1, 1), rand(0, 1.5), 0, { life: 0.45, size: 0.55, color: pick([0xff7a1a, 0xffd070, 0xff4a2a]), gravity: -1 });
          const s = surfaceBelow(p.x, p.y + 0.3);
          let hitD = null; for (const d of fs) if (d.st !== 'dead' && Math.abs(d.x - p.x) < d.hw + 0.5 && p.y > d.y - 0.3 && p.y < d.y + d.hh + 0.3) hitD = d;
          if (hitD) { hurt(hitD, { dmg: 8, bkb: 9, kbg: 0.07, ang: 62, dirx: sgn(p.vx) || 1, x: p.x, y: p.y, big: 1, snd: 'sizzle', hs: 0.1 }); addFlame(p.x, s ?? p.y); freeProj(p); continue; }
          if (s !== null && p.y <= s && p.vy < 0) { addFlame(p.x, s); audio.sfx('sizzle', { vol: 0.4 }); freeProj(p); continue; }
          if (p.y < BLAST.bot) { freeProj(p); continue; }
        }
        p.g.position.set(p.x, p.y, 0);
      }
      for (let i = projs.length - 1; i >= 0; i--) if (projs[i].dead) projs.splice(i, 1);
      for (const fl of flames) { fl.t += dt; fl.x += S.fdx; fl.y += S.fdy; fl.g.position.set(fl.x, fl.y, 0); fl.g.scale.set(1 + Math.sin(T * 14 + fl.x) * 0.1, (1 - Math.max(0, fl.t - fl.life + 0.5)) * (1 + Math.sin(T * 17) * 0.12), 1); if (Math.random() < 0.3) fx.particles.emit(fl.x + rand(-0.4, 0.4), fl.y + 1, 0, rand(-0.5, 0.5), rand(1, 2.5), 0, { life: 0.5, size: 0.4, color: pick([0xff7a1a, 0xffd070]), gravity: -1 }); if (fl.t >= fl.life) { fl.g.visible = false; fl.dead = true; } }
      for (let i = flames.length - 1; i >= 0; i--) if (flames[i].dead) flames.splice(i, 1);
      for (const t of tramps) {
        t.life -= dt; t.sq = Math.max(0, t.sq - dt * 3);
        if (t.plat && t.plat.on === false) t.life = Math.min(t.life, 0.01); else if (t.plat && t.plat.moving) { t.x += t.plat.dx; t.y += t.plat.dy; t.g.position.set(t.x, t.y - 0.55, 0); }
        t.g.scale.set(1 + t.sq * 0.12, 1 - t.sq * 0.4, 1); if (t.life < 2) t.g.visible = Math.sin(T * 20) > 0;
        if (t.life <= 0) { scene.remove(t.g); t.dead = true; fx.particles.burst(t.x, t.y, 0, { count: 12, speed: 4, up: 1, life: 0.5, size: 0.4, colors: [0xff6fa5, 0xffe14a], gravity: 4 }); }
      }
      for (let i = tramps.length - 1; i >= 0; i--) if (tramps[i].dead) tramps.splice(i, 1);
    }
    function dropOrb() {
      dragonDropped = true; const bi = behindIdx();
      const it = spawnItem('orb', itemSpawnX(bi)); if (it) { it.life = 16; it.y = 17; }
      else { /* te veel voorwerpen: ruim er een op */ const old = items.find((q) => q.st === 'ground'); if (old) killItem(old); spawnItem('orb', itemSpawnX(bi)); }
      audio.sfx('sparkle', { vol: 0.8 });
    }
    function updateDragon(dt) {
      if (!dragonPhase) return;
      dragonT += dt; const d = dragons[dragonKind], gold = dragonKind === 'gold';
      if (dragonPhase === 'warn') {
        if (dragonT > 1.6) { dragonPhase = 'fly'; dragonT = 0; d.group.visible = true; dragonFireT = 0.6; audio.sfx(gold ? 'sparkle' : 'explode', { vol: 0.35, rate: 0.6 }); }
      } else if (dragonPhase === 'fly') {
        const dur = gold ? 6.5 : 5.2, k = dragonT / dur, x = lerp(-dragonDir * 38, dragonDir * 38, k), y = (gold ? 14.5 : 8.8) + Math.sin(dragonT * 2.2) * 0.9;
        d.group.position.set(x, y, -3.2); d.group.rotation.y = dragonDir > 0 ? Math.PI / 2 : -Math.PI / 2; d.group.rotation.z = Math.sin(dragonT * 2.2) * 0.07; d.update(dt);
        if (gold) {
          if (Math.random() < 0.8) fx.particles.emit(x - dragonDir * rand(0, 4), y + rand(-1, 1), -2, rand(-1, 1), rand(-2, 0), 0, { life: 0.9, size: 0.8, color: pick([0xffd24a, 0xffffff, 0xfff0a0]), gravity: 0 });
          if (!dragonDropped && k > 0.42) dropOrb();
        } else {
          dragonFireT -= dt;
          if (dragonFireT <= 0 && Math.abs(x) < 15) {
            dragonFireT = 0.5; const mx = x + dragonDir * 2.6 * 1.7, my = y + 0.8;
            fireProj('fire', mx, my, dragonDir * 8 + rand(-2, 2), -2, null);
            fx.particles.burst(mx, my, 0, { count: 8, speed: 4, up: 0.2, life: 0.4, size: 0.6, colors: [0xff7a1a, 0xffd070], gravity: 0 }); audio.sfx('sizzle', { vol: 0.3 });
          }
        }
        if (k >= 1) { dragonPhase = ''; d.group.visible = false; }
      }
    }
    function drawFighterVisuals(f, dt) {
      const live = f.st !== 'dead';
      if (!live) return;
      f.holder.position.set(f.x, f.y + f.hh / 2, 0);
      f.c.faceDir(f.face, 0);
      // flikkeren bij onkwetsbaarheid
      const hide = (f.sup && f.sup.hid) || (f.st === 'boost' && f.blink);
      f.holder.visible = hide ? false : f.inv > 0 && f.st !== 'roll' && f.st !== 'super' && !f.discPlat.on && f.st !== 'atk' ? Math.sin(T * 40) > -0.3 : true;
      if (f.st !== 'super' || !(f.sup && f.sup.kind === 'storm')) { if (!(f.st === 'atk' && f.atk && f.atk.spin) && !(cine && cine.f === f)) f.holder.rotation.y = damp(f.holder.rotation.y, 0, 20, dt); }
      if (f.st === 'frozen') { f.ice.visible = true; f.c.update(0); } else f.c.update(dt);
      if (f.discPlat.on) { f.disc.position.set(f.discPlat.x, f.discPlat.y, 0); f.disc.rotation.y += dt; const sc = 1 + Math.sin(T * 6) * 0.03; f.disc.scale.set(sc, 1, sc); f.disc.visible = true; }
      // ster / laden: gloed rond de vechter
      if (f.starT > 0) { f.aura.visible = true; f.aura.material.color.setHSL((T * 1.7) % 1, 0.95, f.starT < 1.5 && Math.sin(T * 30) > 0 ? 0.9 : 0.6); f.aura.scale.setScalar(1.5 * f.size); f.aura.material.opacity = 0.42; }
      else if (f.charging) { f.aura.visible = true; f.aura.material.color.setHex(0xff9a3a); f.aura.scale.setScalar((1.3 + f.charge * 0.8 + Math.sin(T * 30) * 0.06) * f.size); f.aura.material.opacity = 0.3 + f.charge * 0.4; }
      else if (!(cine && cine.f === f)) f.aura.visible = false;
      // staf-bol gloeit
      const orb = f.c.weapon && f.c.weapon.userData.orb; if (orb) orb.scale.setScalar(1 + Math.sin(T * 6 + f.i) * 0.15 + (f.st === 'atk' ? 0.3 : 0));
      // schaduwblob onder je voeten
      const s = surfaceBelow(f.x, f.y + 0.1, f.hw);
      if (s !== null) { f.blob.visible = true; f.blob.position.set(f.x, s + 0.05, 0.2); const k = (1 + clamp((f.y - s) * 0.07, 0, 0.5)) * f.size; f.blob.scale.set(k * 1.3, 1, k * 1.3); f.blob.material.opacity = clamp(1 - (f.y - s) * 0.05, 0.3, 1); } else f.blob.visible = false;
      f.tag.visible = true; f.tag.position.set(f.x, f.y + f.hh + 1.15 * f.size, 0.5); f.tag.scale.set(3.4 * f.size ** 0.5, 1.28 * f.size ** 0.5, 1);
    }

    // ---------------- hoofd-update ----------------
    function simulate(dt) {
      // klok
      if (!over) {
        if (!sd) {
          clock -= dt; hud.setTimer(Math.max(0, clock), 15);
          if (clock <= 0) { clock = 0; audio.sfx('bell', { vol: 1 }); timeUp(); }
        } else {
          sdT -= dt; sdRain -= dt;
          if (sdRain <= 0) { sdRain = 3.5; spawnItem(Math.random() < 0.5 ? 'bomb' : 'hammer', itemSpawnX(-1)); }
          if (!dragonPhase) { sdDr -= dt; if (sdDr <= 0) { sdDr = 14; startDragon(); } }
          if (sdT <= 0) { const a = fs[0], b = fs[1]; endMatch(a.pct === b.pct ? (Math.random() < 0.5 ? 0 : 1) : (a.pct < b.pct ? 0 : 1), 'Sudden death duurde te lang: de minste schade wint.'); }
        }
        // items & evenementen
        itemT -= dt; if (itemT <= 0) { itemT = sd ? 9 : rand(6.5, 9.5); const bi = behindIdx(); spawnItem(null, itemSpawnX(bi)); }
        if (!sd) { eventT -= dt; if (eventT <= 0 && !dragonPhase && gEvT <= 0) nextEvent(); }
        // langzaam opladen (alleen als je leeft)
        for (const f of fs) if (f.st !== 'dead' && f.st !== 'super') addMeter(f, dt * 0.3);
      }
      if (gEvT > 0) { gEvT -= dt; if (gEvT <= 0) { gEv = 1; L.hemi.color.copy(hemiBase); hud.toast('De zwaartekracht is weer normaal.', 1400); } }
      const order = Math.floor(T * 10) % 2 ? [0, 1] : [1, 0];
      const steps = Math.ceil(dt / 0.017), sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        S.step(sdt);
        for (const f of fs) { const p = f.discPlat; if (p.on) { p.x += S.fdx; p.y += S.fdy; p.dx = S.fdx; p.dy = S.fdy; } }
        for (const k of order) { const f = fs[k]; if (f.st === 'dead') { if (s === 0) { f.deadT -= dt; if (f.deadT <= 0 && !over) respawn(f); } continue; } stepFighter(f, sdt, s === 0); }
      }
      supers.tick(dt);
      updateItems(dt); updateProjs(dt); updateTraps(dt); updateDragon(dt);
      if (sd && Math.random() < dt * 3) fx.particles.emit(rand(-9, 9), rand(-2, 12), -2, 0, rand(-6, -3), 0, { life: 1, size: 0.5, color: 0xff7a4a, gravity: 0 });
    }
    function visuals(dt) {
      for (const f of fs) drawFighterVisuals(f, dt);
      for (const s of slashes) if (s.m.visible) { s.t += dt; const k = s.t / 0.16; if (k >= 1) { s.m.visible = false; continue; } s.m.material.opacity = (1 - k) * 0.85; s.m.scale.set(s.sx * (0.8 + k * 0.3), s.sy * (0.8 + k * 0.3), 1); }
      S.update(T, dt);
      tagUpd -= dt; if (tagUpd <= 0) { tagUpd = 0.1; for (const f of fs) drawTag(f); if (meterUI) meterUI.update(fs); }
    }
    function flashUpdate(dt) {
      if (flashT < 0.6) { flashT += dt; const k = flashT / 0.6; flashQ.visible = true; flashQ.material.color.setHex(flashCol); flashQ.material.opacity = Math.max(0, (1 - k) * (1 - k) * flashMax); if (k >= 1) flashQ.visible = false; }
    }

    // ---------------- vechter kiezen ----------------
    function idleVisuals(dt) {
      for (const f of fs) {
        if (phase === 'select') f.c.faceDir(f.i ? -0.45 : 0.45, 1); else f.c.faceDir(f.face, 0);
        f.c.speed = 0; f.c.air = false; f.holder.position.set(f.x, f.y + f.hh / 2, 0); f.c.update(dt); f.holder.visible = true;
        f.blob.visible = true; f.blob.position.set(f.x, f.y + 0.05, 0.2); f.blob.scale.set(1.3 * f.size, 1, 1.3 * f.size); f.tag.visible = phase !== 'select'; f.tag.position.set(f.x, f.y + f.hh + 1.15 * f.size, 0.5); drawTag(f);
        const orb = f.c.weapon && f.c.weapon.userData.orb; if (orb) orb.scale.setScalar(1 + Math.sin(T * 6 + f.i) * 0.15);
      }
    }
    function previewPlace(f) { const st = S.start(f.i); f.x = st.x * 0.46; f.y = st.y; f.vx = f.vy = 0; f.grounded = true; }
    function startSelect() {
      phase = 'select'; selT = SELECT_T;
      sel = fs.map((f) => ({ idx: 0, ok: false, okT: 0 }));
      for (const f of fs) { setType(f, FT_IDS[0]); previewPlace(f); }
      selUI = new SelectUI(names, STAGES[S.kind], KEY_LABELS); selUI.update(sel);
      hud.setTimer(selT, 3); refreshHud();
      audio.sfx('select', { vol: 0.5 });
    }
    function choose(i, idx) { sel[i].idx = (idx + FT_IDS.length) % FT_IDS.length; const f = fs[i]; setType(f, FT_IDS[sel[i].idx]); previewPlace(f); f.c.swing(); audio.sfx('click', { vol: 0.6 }); fx.particles.burst(f.x, f.y + 1, 0.5, { count: 8, speed: 3, up: 1, life: 0.4, size: 0.35, colors: [0xffffff, f.col], gravity: 2 }); }
    function selectUpdate(dt) {
      selT -= dt;
      for (let i = 0; i < 2; i++) {
        const inp = pv.input(i), s = sel[i], f = fs[i];
        if (!s.ok) {
          if (inp.leftP) choose(i, s.idx - 1); else if (inp.rightP) choose(i, s.idx + 1);
          if (inp.aP) { s.ok = true; s.okT = 0; setPose(f, 'cheer'); audio.sfx('select', { vol: 0.8 }); say(FT[FT_IDS[s.idx]].name + '!', f.x, f.y + f.hh + 1.2, '#ffffff', 1.2); fx.particles.ring(f.x, f.y + 1, 0.5, { count: 16, speed: 6, color: f.col, size: 0.35, life: 0.4 }); }
        } else { s.okT += dt; if (inp.bP) { s.ok = false; setPose(f, 'idle'); audio.sfx('click', { vol: 0.5 }); } }
      }
      hud.setTimer(Math.max(0, selT), 3);
      selUI.update(sel);
      idleVisuals(dt); S.update(T, dt); updateCamera(dt, introT < 0.2);
      const both = sel[0].ok && sel[1].ok && Math.min(sel[0].okT, sel[1].okT) > 0.55;
      if (both || selT <= 0) finishSelect();
    }
    function pickType(i, type, ok = true) { if (phase === 'wait') startSelect(); const idx = FT_IDS.indexOf(type); if (idx < 0) return; if (phase === 'select') { sel[i].idx = idx; sel[i].ok = ok; sel[i].okT = 1; setType(fs[i], type); previewPlace(fs[i]); } else { setType(fs[i], type); } }
    function finishSelect() {
      for (let i = 0; i < 2; i++) {
        if (!sel[i].ok) { sel[i].idx = Math.floor(Math.random() * FT_IDS.length); say('Willekeurig!', fs[i].x, fs[i].y + fs[i].hh + 1.2, '#ffe14a', 1.2); }
        const f = fs[i]; setType(f, FT_IDS[sel[i].idx]);
        const st = S.start(i); f.x = st.x; f.y = st.y; f.vx = f.vy = 0; f.grounded = true; f.ground = S.mainP || null; f.inv = 1.2; f.pct = 0; f.meter = 0; f.jumps = f.maxJumps; f.glide = f.glideMax; setPose(f, 'idle');
        f.holder.rotation.set(0, 0, 0);
      }
      if (selUI) { selUI.dispose(); selUI = null; }
      phase = 'ready'; readyT = 1.2;
      hud.showBig('VECHT!', 1000, '#ffe14a'); audio.sfx('go', { vol: 0.8 });
      hud.toast(`${FT[fs[0].type].icon} ${names[0]}  tegen  ${names[1]} ${FT[fs[1].type].icon}`, 1800);
      hud.setTimer(MATCH, 15); refreshHud();
      meterUI = new MeterUI(names); meterUI.update(fs);
    }
    function beginPlay() { phase = 'play'; for (const f of fs) { f.tagKey = ''; drawTag(f); } refreshHud(); }

    function update(dt) {
      T += dt; introT += dt; flashUpdate(dt);
      if (finished) { resultUpdate(dt); return; }
      if (phase === 'wait') startSelect();
      if (phase === 'select') { selectUpdate(dt); return; }
      if (phase === 'ready') { readyT -= dt; idleVisuals(dt); S.update(T, dt); updateCamera(dt); if (readyT <= 0) beginPlay(); return; }
      if (!started) { started = true; refreshHud(); }
      for (const f of fs) pollEdges(f);
      if (cine) { cineUpdate(dt); visuals(dt * 0.02); updateCamera(dt); return; }
      if (stop > 0) { stop -= dt; visuals(dt * 0.15); updateCamera(dt); return; }
      if (slowHold > 0) { slowHold -= dt; } else slowK = damp(slowK, 1, 6, dt);
      const sdt = dt * slowK;
      if (over) { endT -= dt; if (endT <= 0) finishMatch(); }
      simulate(sdt); visuals(sdt); updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; for (const f of fs) { f.c.update(dt); if (f.st !== 'dead') f.holder.position.set(f.x, f.y + f.hh / 2, 0); } S.update(T, dt); updateCamera(dt); if (flashQ.visible) flashQ.visible = false; }
    function introUpdate(dt) {
      T += dt; introT += dt;
      idleVisuals(dt); S.update(T, dt); updateCamera(dt, introT < 0.2);
    }
    // beginstand: vechters op hun plek (voor de intro)
    for (const f of fs) { const st = S.start(f.i); f.x = st.x; f.y = st.y; }
    updateCamera(0.016, true);
    for (const f of fs) { f.tag.position.set(f.x, f.y + f.hh + 1.2, 0.5); drawTag(f); }
    refreshHud();

    return {
      update, introUpdate, resultUpdate,
      onResize() { updateCamera(0.016, true); },
      onSwap(sw) { for (const f of fs) { fx.particles.burst(f.x, f.y + 1, 0, { count: 20, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 2 }); } },
      onDeurman(movers) { if (phase !== 'play') return; movers.forEach((m, i) => { if (m && fs[i].st !== 'dead') { fs[i].pct += 25; fs[i].tagKey = ''; drawTag(fs[i]); say('BEWOOG! +25%', fs[i].x, fs[i].y + fs[i].hh + 1.6, '#ff6b6b', 1.5); fs[i].c.pose = 'scared'; } }); },
      celebrate(w) { fs[w].c.pose = 'cheer'; fs[1 - w].c.pose = 'sad'; },
      dispose() { if (selUI) selUI.dispose(); if (meterUI) meterUI.dispose(); try { camera.remove(flashQ); } catch (e) { /* ok */ } },
      dbg: {
        fs, projs, items, flames, tramps, traps, supers, S,
        get over() { return over; },
        state: () => ({ T, clock, sd, sdT, over, gEv, dragon: dragonPhase, dragonKind, phase, selT, stage: S.kind, started, finished, stats: stat, winner, cine: !!cine, wind: S.wind || 0, lavaY: S.lavaY,
          f: fs.map((f) => ({ x: f.x, y: f.y, vx: f.vx, vy: f.vy, st: f.st, pct: f.pct, stocks: f.stocks, face: f.face, grounded: f.grounded, jumps: f.jumps, cd: f.cd, spCd: f.spCd, item: f.item && f.item.type, inv: f.inv, hw: f.hw, hh: f.hh, hits: f.hits, kos: f.kos, rage: f.rage, boostUsed: f.boostUsed, type: f.type, meter: f.meter, starT: f.starT, supers: f.supers, grabs: f.grabs, lag: f.lag, ground: f.ground && (f.ground.solid ? 'solid' : 'plat') })),
          items: items.map((i) => ({ type: i.type, x: i.x, y: i.y, st: i.st })), n: { projs: projs.length, flames: flames.length, tramps: tramps.length, traps: traps.length, meteors: supers.meteors.filter((m) => m.live).length },
          sel: sel && sel.map((s) => ({ idx: s.idx, ok: s.ok })), plats: S.plats.map((p) => ({ x: p.x, y: p.y, w: p.w, on: p.on !== false, c: p.crumble && p.crumble.st })), solid: S.solid && { hw: S.solid.hw, top: S.solid.top } }),
        setTime(s) { clock = s; }, setPct(i, p) { fs[i].pct = p; fs[i].tagKey = ''; }, setStocks(i, n) { fs[i].stocks = n; checkRage(); refreshHud(); },
        setMeter(i, v) { fs[i].meter = v; }, pick: pickType, finishSelect() { if (phase === 'wait') startSelect(); if (phase === 'select') finishSelect(); },
        spawnItem, giveItem: (i, t) => giveItem(fs[i], t), startDragon, startGolden() { startDragon('gold'); }, nextEvent, startSD, setPos(i, x, y) { fs[i].x = x; fs[i].y = y; fs[i].vx = fs[i].vy = 0; }, setEventT(t) { eventT = t; },
        explode, hurt, itemT: (t) => { itemT = t; }, addTrap, dropItem: (i) => dropItem(fs[i], false), startSuper: (i) => startSuper(fs[i]), freeze: (i, t) => freeze(fs[i], t), flash: () => { flashT = 0; },
      },
    };
  },
};

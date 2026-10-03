import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildStage, ST } from './brawl_world.js';

// Smash-Arena — duel: platform-vechter (2.5D) op een zwevend eiland. Geen levensbalk maar een SCHADE-PERCENTAGE: hoe hoger,
// hoe verder je wegvliegt. Wie van het scherm vliegt verliest een leven (3 levens).
//  * lopen, omhoog = sprong (dubbel), A = slaan (richting bepaalt de slag; 3 tikjes = combo), B = schild (vasthouden) / B + richting = roll / raketsprong
//  * vallende ballonnen met items: hamer, bom, ijsbal, trampoline. De draak spuugt vuur, de zwaartekracht krijgt grillen.
//  * comeback: wie op zijn laatste leven achterstaat krijgt WOEDE (meer klappen, minder terugslag); items vallen vaker bij de achterblijver
//  * na 100 s: meeste levens, dan laagste schade; bij gelijkspel SUDDEN DEATH (1 leven, 250% schade, bommenregen)

const G0 = 46, JUMP1 = 19.5, JUMP2 = 17, RUN = 9.5, AIRMAX = 8.5, FALLMAX = 26, FASTFALL = 38;
const FH = 2.5, FHW = 0.52;                 // hoogte en halve breedte van een vechter (bij size 1)
const STOCKS = 3, MATCH = 100, SD_MAX = 45;
const KDRAG = 0.55;                        // luchtweerstand tijdens terugslag
const BLAST = ST.BLAST;

// Slag-tabel. box = [x-offset (voor, tov midden), y-offset (tov voeten), breedte, hoogte]; sym = niet spiegelen; away = wegduwen van de aanvaller
const AT = {
  jab1: { wind: 0.05, act: 0.09, rec: 0.1, dmg: 3, bkb: 5, kbg: 0.045, ang: 28, box: [0.1, 0.5, 1.8, 1.2], lunge: 2.5 },
  jab2: { wind: 0.05, act: 0.09, rec: 0.1, dmg: 3, bkb: 5.5, kbg: 0.045, ang: 34, box: [0.1, 0.5, 1.9, 1.2], lunge: 2.5 },
  jab3: { wind: 0.09, act: 0.1, rec: 0.26, dmg: 5, bkb: 10, kbg: 0.09, ang: 40, box: [0.1, 0.3, 2.3, 1.5], lunge: 5, snd: 'thud' },
  fsmash: { wind: 0.2, act: 0.12, rec: 0.3, dmg: 12, bkb: 11, kbg: 0.15, ang: 34, box: [0.1, 0.2, 2.9, 1.7], lunge: 5, big: 1 },
  usmash: { wind: 0.15, act: 0.14, rec: 0.28, dmg: 11, bkb: 11, kbg: 0.15, ang: 82, box: [-1.15, 1.3, 2.3, 2.3], sym: 1, big: 1 },
  dsmash: { wind: 0.1, act: 0.1, rec: 0.28, dmg: 8, bkb: 8, kbg: 0.09, ang: 52, box: [-2.2, 0, 4.4, 0.9], sym: 1, away: 1 },
  nair: { wind: 0.04, act: 0.2, rec: 0.14, dmg: 6, bkb: 7, kbg: 0.09, ang: 45, box: [-1.5, 0.2, 3.0, 2.0], sym: 1, away: 1 },
  fair: { wind: 0.1, act: 0.1, rec: 0.2, dmg: 9, bkb: 10, kbg: 0.12, ang: 30, box: [0.1, 0.3, 2.6, 1.6] },
  uair: { wind: 0.08, act: 0.1, rec: 0.2, dmg: 8, bkb: 9, kbg: 0.12, ang: 85, box: [-1.0, 1.5, 2.0, 2.0], sym: 1 },
  dair: { wind: 0.14, act: 0.22, rec: 0.28, dmg: 9, bkb: 8, kbg: 0.105, ang: -78, box: [-0.85, -1.7, 1.7, 2.0], sym: 1 },
  hammer: { wind: 0.3, act: 0.14, rec: 0.38, dmg: 24, bkb: 18, kbg: 0.18, ang: 38, box: [0, -0.1, 3.4, 2.9], lunge: 3, big: 1, hs: 0.2, snd: 'explode' },
  boost: { wind: 0, act: 0.32, rec: 0.12, dmg: 5, bkb: 9, kbg: 0.075, ang: 65, box: [-1.0, 0.0, 2.0, 2.6], sym: 1 },
};
const DIRKEY = { jab: 'jab', up: 'u', down: 'd', fwd: 'f' };
const ITEMS = {
  hammer: { name: 'HAMER!', col: '#c8d0e0', hex: 0xc8d0e0, w: 20 },
  bomb: { name: 'BOM!', col: '#ff8a4a', hex: 0xff8a4a, w: 30 },
  ice: { name: 'IJSBAL!', col: '#8fe8ff', hex: 0x8fe8ff, w: 26 },
  tramp: { name: 'TRAMPOLINE!', col: '#ff6fa5', hex: 0xff6fa5, w: 22 },
};

const sgn = (v) => (v < 0 ? -1 : 1);

export default {
  id: 'brawl',
  name: 'Smash-Arena',
  giver: 'Ridder Rammelaar',
  icon: '🥊',
  mode: 'pvp',
  time: 100,
  music: 'game_fast',
  blurb: 'Meppen op een <b>zwevend eiland</b>! Geen hartjes maar een <b>schade-%</b>: hoe hoger, hoe verder je wegvliegt. Wie van het scherm vliegt verliest een <b>leven</b> (3 elk). Pak <b>ballon-items</b> en pas op voor de <b>draak</b>!',
  controls: ['{move} lopen, omhoog = springen', '{a} slaan (+ richting = smash)', '{b} schild (+ richting = roll)'],
  tip: 'Tik 3x voor een combo. Bevroren? Beuk op alle knoppen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0;
    const GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? ctx.twist.speed : 1;

    const L = ctx.lights('dusk', { shadow: 17, center: [0, 3, 0], fogNear: 70, fogFar: 230 });
    L.hemi.intensity = 1.25; L.hemi.color.set(0xffd0e8); L.hemi.groundColor.set(0x7a5a9a);
    L.sun.color.set(0xffc890); L.sun.intensity = 2.0; L.sun.position.set(-10, 26, 22);
    const hemiBase = L.hemi.color.clone();
    camera.fov = 38; camera.updateProjectionMatrix();
    const W = buildStage(ctx);

    // ---------------- vechters ----------------
    const fs = players.map((pp, i) => {
      const size = pv.size(i), hh = FH * size, hw = FHW * size;
      const c = makeBrother(i); const sc = hh / c.height; c.group.scale.setScalar(sc);
      const holder = new THREE.Group(), inner = new THREE.Group(); inner.position.y = -hh / 2; inner.add(c.group); holder.add(inner); scene.add(holder);
      const col = PLAYER_COLORS[i];
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      bubble.visible = false; bubble.position.y = 0; holder.add(bubble);
      const ice = mesh(new THREE.BoxGeometry(hw * 2.8, hh * 1.1, hw * 2.8), new THREE.MeshStandardMaterial({ color: 0xbff0ff, emissive: 0x58b8e8, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, roughness: 0.1, flatShading: true }), { cast: false }); ice.visible = false; holder.add(ice);
      const blob = P.shadowBlob(0.9); blob.visible = false; scene.add(blob);
      // naamkaartje met schade-percentage boven het hoofd
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, () => {}), transparent: true, depthTest: false, fog: false })); tag.renderOrder = 15; tag.scale.set(3.4, 1.28, 1); scene.add(tag);
      // disc waarop je respawnt
      const disc = new THREE.Group();
      disc.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.3, 20), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 }), { cast: false, pos: [0, -0.15, 0] }));
      disc.add(mesh(new THREE.TorusGeometry(1.7, 0.1, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, rot: [Math.PI / 2, 0, 0] }));
      disc.visible = false; scene.add(disc);
      const dir = i ? -1 : 1;
      const f = {
        i, c, holder, inner, bubble, ice, blob, tag, disc, discPlat: { x: 0, y: 0, w: 3.4, tmp: true, on: false }, col, size, hh, hw,
        weight: Math.pow(size, 0.5), pow: Math.pow(size, 0.3), spd: pv.speed(i),
        x: -dir * 5, y: 0, vx: 0, vy: 0, face: -dir, grounded: true, ground: 'main', jumps: 2, wallJ: 1, wall: 0, drop: 0,
        st: 'free', stT: 0, atk: null, atkT: 0, atkPhase: 0, hitDone: false, comboN: 0, comboT: 0, buf: 0, hitstun: 0,
        pct: 0, stocks: STOCKS, inv: 1.2, cd: 0, cdMax: 1, shT: 0, shLeft: 1.2, boostUsed: false, item: null, itemMesh: null, frozenT: 0,
        deadT: 0, rage: false, dmgMul: 1, lastHit: -1, lastHitT: 0, tagKey: '', spin: 0, tumble: 0, fireCd: 0, rollT: 0, rollDir: 1, squashT: 0,
        hits: 0, kos: 0, maxHit: 0,
      };
      f.x = -dir * 5; f.y = ST.TOP; c.faceDir(f.face, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      return f;
    });

    // ---------------- toestand ----------------
    let T = 0, clock = MATCH, started = false, finished = false, over = false, endT = 0, winner = -1, sd = false, sdT = 0, introT = 0;
    let stop = 0, slowK = 1, slowHold = 0, camPunch = 0, gEv = 1, gEvT = 0, gEvKind = '', tagUpd = 0;
    let itemT = 5, eventT = 15, lastEvent = '', dragonT = 0, eventN = 0, sdRain = 3, sdDr = 14;
    const stat = { items: [0, 0], explosions: 0, freezes: 0, dragons: 0, trampolines: 0, perfect: 0 };
    const plats = ST.plats;
    let IHW = ST.HW;

    // ---------------- visuals: slashes ----------------
    const slashGeo = new THREE.RingGeometry(0.45, 1, 14, 1, -1.15, 2.3);
    const slashes = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.visible = false; m.renderOrder = 8; scene.add(m); return { m, t: 9 }; });
    let slashN = 0;
    function slash(cx, cy, w, h, rot, col) {
      const s = slashes[slashN++ % slashes.length]; s.t = 0; s.m.visible = true; s.m.position.set(cx, cy, 0.8); s.m.rotation.z = rot; s.sx = w / 2; s.sy = h / 2; s.m.material.color.set(col);
    }

    // ---------------- items, projectielen, vlammen, trampolines ----------------
    const items = [], projs = [], flames = [], tramps = [];
    const bombMat = () => new THREE.MeshStandardMaterial({ color: 0x20202c, roughness: 0.4, metalness: 0.3 });
    function mkItemMesh(type, held = false) {
      const g = new THREE.Group();
      if (type === 'hammer') { const hm = P.hammer(0xb8c4d8); hm.scale.setScalar(held ? 1.9 : 1.6); hm.position.y = held ? -0.1 : 0; g.add(hm); }
      else if (type === 'bomb') {
        g.add(mesh(new THREE.SphereGeometry(0.46, 12, 10), bombMat(), { cast: false, pos: [0, 0.5, 0] }));
        g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), mat(0x8a6a3a), { cast: false, pos: [0, 1.08, 0] }));
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd040 })); sp.position.y = 1.3; g.add(sp); g.userData.spark = sp;
      } else if (type === 'ice') {
        g.add(mesh(new THREE.IcosahedronGeometry(0.52, 0), new THREE.MeshStandardMaterial({ color: 0xbff0ff, emissive: 0x58c8f8, emissiveIntensity: 0.8, roughness: 0.15, flatShading: true }), { cast: false, pos: [0, 0.55, 0] }));
        g.add(mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0.15, 0.7, 0.2] }));
      } else {
        g.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.28, 16), mat(0xff6fa5, { flatShading: false }), { cast: false, pos: [0, 0.65, 0] }));
        g.add(mesh(new THREE.TorusGeometry(1.35, 0.12, 6, 18), mat(0xffe14a, { flatShading: false }), { cast: false, pos: [0, 0.78, 0], rot: [Math.PI / 2, 0, 0] }));
        for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.65, 5), mat(0x555566), { cast: false, pos: [sx * 1.0, 0.32, 0] }));
      }
      return g;
    }
    const balloonM = (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, fog: false });
    function spawnItem(type, x) {
      if (items.filter((it) => it.st === 'fall' || it.st === 'ground').length >= 4) return null;
      type = type || pickItem();
      const g = new THREE.Group(); const m = mkItemMesh(type); g.add(m);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), balloonM(ITEMS[type].hex)); b.position.y = 3.2; b.scale.y = 1.2; g.add(b);
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0, 2.0, 0] }));
      const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: ITEMS[type].hex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glowS.scale.set(3, 3, 1); glowS.position.y = 0.7; g.add(glowS);
      const it = { type, x: x ?? rand(-7.5, 7.5), y: 17, vy: -3.4, st: 'fall', g, balloon: b, life: 14, t: Math.random() * 6 };
      g.position.set(it.x, it.y, 0); scene.add(g); items.push(it);
      audio.sfx('whoosh', { vol: 0.25, rate: 1.5 });
      return it;
    }
    let _glow = null; function glowTexture() { return _glow || (_glow = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })); }
    function pickItem() {
      // achterblijver krijgt vaker de hamer
      const behind = behindIdx();
      const w = Object.entries(ITEMS).map(([k, v]) => [k, v.w + (behind >= 0 && k === 'hammer' ? 18 : 0)]);
      let r = Math.random() * w.reduce((a, [, x]) => a + x, 0);
      for (const [k, x] of w) { r -= x; if (r <= 0) return k; }
      return 'bomb';
    }
    function behindIdx() { const a = fs[0], b = fs[1]; if (a.stocks !== b.stocks) return a.stocks < b.stocks ? 0 : 1; if (Math.abs(a.pct - b.pct) > 25) return a.pct > b.pct ? 0 : 1; return -1; }
    function killItem(it) { scene.remove(it.g); it.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); it.dead = true; }

    // projectielen: bom / ijsbal / vuurbal
    const projMeshes = { bomb: [], ice: [], fire: [] };
    function mkProjMesh(kind) {
      let g;
      if (kind === 'fire') {
        g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a }), { cast: false }));
        g.add(mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false }));
      } else { g = mkItemMesh(kind); g.children.forEach((c) => c.position.y -= 0.5); }
      g.visible = false; scene.add(g); return g;
    }
    function getProjMesh(kind) { const a = projMeshes[kind]; for (const g of a) if (!g.userData.used) { g.userData.used = true; return g; } const g = mkProjMesh(kind); g.userData.used = true; a.push(g); return g; }
    function fireProj(kind, x, y, vx, vy, owner, fuse = 3) {
      const g = getProjMesh(kind); g.visible = true; g.position.set(x, y, 0);
      projs.push({ kind, x, y, vx, vy, owner, fuse, t: 0, g, bounce: 0 });
      return projs[projs.length - 1];
    }
    function freeProj(p) { p.g.visible = false; p.g.userData.used = false; p.dead = true; }

    // vlammen op de grond (draak)
    const flameMeshes = Array.from({ length: 8 }, () => { const g = new THREE.Group(); g.add(mesh(new THREE.ConeGeometry(0.7, 1.9, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }), { cast: false, pos: [0, 0.95, 0] })); g.add(mesh(new THREE.ConeGeometry(0.4, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false, pos: [0, 0.65, 0.05] })); g.visible = false; scene.add(g); return g; });
    function addFlame(x, y) {
      const g = flameMeshes.find((m) => !m.visible); if (!g) return;
      g.visible = true; g.position.set(x, y, 0); flames.push({ x, y, t: 0, life: 1.9, g });
      fx.particles.burst(x, y + 0.4, 0, { count: 10, speed: 3, up: 1.4, life: 0.5, size: 0.4, colors: [0xff7a1a, 0xffd070], gravity: -2 });
    }

    // dragon
    let dragon = null, dragonDir = 1, dragonPhase = '', dragonFireT = 0;
    function startDragon() {
      stat.dragons++; dragonDir = Math.random() < 0.5 ? -1 : 1; dragonPhase = 'warn'; dragonT = 0;
      if (!dragon) { dragon = new Dragon(0x7a2fd4, 1.7); dragon.group.visible = false; scene.add(dragon.group); }
      hud.showBig('DRAAK!', 1100, '#ff9a3a'); hud.toast('🐉 De draak komt vuurballen spuwen! Pas op!', 2400);
      audio.sfx('buzz', { vol: 0.8 }); ctx.shake(0.3);
    }

    // ---------------- naamkaartjes ----------------
    function drawTag(f) {
      const pct = Math.round(f.pct), key = pct + ':' + f.stocks + ':' + (f.rage ? 1 : 0);
      if (key === f.tagKey) return; f.tagKey = key;
      const t = f.tag.material.map, cv = t.image, g = cv.getContext('2d'); g.clearRect(0, 0, 256, 96);
      g.lineJoin = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 30px Fredoka, Arial Black, sans-serif'; g.lineWidth = 8; g.strokeStyle = 'rgba(10,6,30,.9)';
      g.fillStyle = '#' + new THREE.Color(f.col).getHexString(); g.strokeText(names[f.i] + (f.rage ? ' 🔥' : ''), 128, 20); g.fillText(names[f.i] + (f.rage ? ' 🔥' : ''), 128, 20);
      g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.lineWidth = 10;
      g.fillStyle = pct < 50 ? '#ffffff' : pct < 100 ? '#ffe14a' : pct < 150 ? '#ff9a3a' : '#ff4a4a';
      g.strokeText(pct + '%', 128, 66); g.fillText(pct + '%', 128, 66);
      t.needsUpdate = true;
      hud.setPlayerInfo(f.i, `${'♥'.repeat(Math.max(0, f.stocks))}${'♡'.repeat(Math.max(0, STOCKS - f.stocks))}  ${pct}%`);
    }
    function refreshHud() {
      hud.setScore(sd ? 'SUDDEN DEATH!' : `${names[0]} ${fs[0].stocks} – ${fs[1].stocks} ${names[1]}`);
      for (const f of fs) { f.tagKey = ''; drawTag(f); }
    }

    // ---------------- ondergrond ----------------
    // hoogste oppervlak onder (x, y) -> y-waarde of null
    function surfaceBelow(x, y, hw = 0) {
      let best = null;
      if (x + hw > -IHW && x - hw < IHW && y >= ST.TOP - 0.05) best = ST.TOP;
      for (const p of plats) { if (Math.abs(x - p.x) < p.w / 2 + hw * 0.4 && y >= p.y - 0.05 && (best === null || p.y > best)) best = p.y; }
      for (const f of fs) { const p = f.discPlat; if (p.on && Math.abs(x - p.x) < p.w / 2 && y >= p.y - 0.05 && (best === null || p.y > best)) best = p.y; }
      return best;
    }

    // ---------------- vechter helpers ----------------
    const opp = (f) => fs[1 - f.i];
    function setPose(f, p) { f.c.pose = p; }
    function fxHit(x, y, big, col = 0xffffff) {
      fx.particles.burst(x, y, 0.8, { count: big ? 26 : 12, speed: big ? 9 : 6, up: 0.6, life: big ? 0.7 : 0.45, size: big ? 0.5 : 0.35, colors: [0xffffff, 0xffe14a, col], gravity: 6 });
      fx.particles.ring(x, y, 0.8, { count: big ? 20 : 12, speed: big ? 11 : 7, color: 0xffffff, size: 0.28, life: 0.3 });
    }
    function say(text, x, y, col = '#ffe14a', s = 1.3) { fx.texts.add(text, x, y, 1.2, col, s); }
    function toss(f, vx, vy) { f.vx = vx; f.vy = vy; f.grounded = false; f.ground = null; }

    function freeze(f, t) {
      f.st = 'frozen'; f.frozenT = t; f.atk = null; f.vx *= 0.2; f.ice.visible = true; f.shLeft = 1.2; stat.freezes++;
      audio.sfx('sparkle', { vol: 0.6, rate: 1.4 }); audio.sfx('buzz', { vol: 0.3, rate: 2 });
      fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: 22, speed: 5, up: 0.8, life: 0.7, size: 0.4, colors: [0xffffff, 0xbff0ff, 0x58c8f8], gravity: 3 });
      say('BEVROREN!', f.x, f.y + f.hh + 1, '#8fe8ff'); setPose(f, 'scared');
    }
    function thaw(f, shatter) {
      if (f.st !== 'frozen') return; f.st = 'free'; f.ice.visible = false; f.frozenT = 0; setPose(f, 'idle');
      fx.particles.burst(f.x, f.y + f.hh / 2, 0.5, { count: shatter ? 36 : 18, speed: shatter ? 9 : 5, up: 0.8, life: 0.8, size: 0.45, colors: [0xffffff, 0xbff0ff, 0x58c8f8], gravity: 8 });
      audio.sfx('pop', { rate: 1.5 }); if (shatter) audio.sfx('hit', { vol: 0.5, rate: 1.6 });
    }

    // Raak een vechter. o: { dmg, bkb, kbg, ang, dirx, att, x, y, big, hs, snd, freeze }
    function hurt(d, o) {
      if (d.st === 'dead' || d.inv > 0 || over || d.hitCool > 0) return false;
      const att = o.att;
      // schild
      if (d.st === 'shield') {
        const perfect = d.shT < 0.14;
        d.shLeft -= 0.15 + o.dmg * 0.04;
        fx.particles.burst(o.x, o.y, 0.9, { count: 12, speed: 6, up: 0.4, life: 0.4, size: 0.35, colors: [0xffffff, d.col], gravity: 2 });
        audio.sfx(perfect ? 'ding' : 'thud', { vol: 0.7 });
        if (perfect) {
          stat.perfect++; say('PERFECT!', d.x, d.y + d.hh + 1, '#ffffff', 1.5); ctx.shake(0.3); stop = Math.max(stop, 0.08);
          if (o.proj) { o.proj.owner = d; o.proj.vx *= -1; o.proj.vy *= -0.5; o.proj.reflected = true; }
          else if (att && !o.noStun) { att.st = 'hit'; att.atk = null; att.hitstun = 0.55; att.vx = -att.face * 9; att.vy = 5; att.grounded = false; att.shT = 0; setPose(att, 'scared'); }
        } else { d.vx += o.dirx * 4; }
        if (d.shLeft <= 0) { endShield(d, true); d.st = 'hit'; d.hitstun = 1.0; setPose(d, 'scared'); say('SCHILD KAPOT!', d.x, d.y + d.hh + 1, '#ff6b6b'); audio.sfx('bad'); ctx.shake(0.4); fx.particles.burst(d.x, d.y + 1, 0.9, { count: 30, speed: 8, up: 1, life: 0.7, size: 0.4, colors: [0xffffff, d.col], gravity: 4 }); }
        o.blocked = true; return true;
      }
      const wasFrozen = d.st === 'frozen';
      if (o.freeze) { if (wasFrozen) return false; d.pct += o.dmg; freeze(d, o.freeze); return true; }
      if (wasFrozen) thaw(d, true);
      let dmg = o.dmg * (att ? att.dmgMul : 1) * (wasFrozen ? 1.3 : 1);
      d.pct += dmg; d.lastHit = att ? att.i : -1; d.lastHitT = T;
      if (att) { att.hits++; att.maxHit = Math.max(att.maxHit, dmg); }
      if (d.item && d.item.type === 'bomb' && Math.random() < 0.4) { /* bom schudt los */ }
      // terugslag
      let v = (o.bkb + o.kbg * d.pct) * (d.rage ? 0.85 : 1) / d.weight * (att ? att.pow : 1) * (GRAV < 1 ? 0.82 : 1) * (wasFrozen ? 1.1 : 1);
      const a = o.ang * Math.PI / 180;
      let dx = Math.cos(a) * o.dirx, dy = Math.sin(a);
      if (d.grounded && dy < 0) dy = -dy * 0.6;            // spijker op de grond: stuitert omhoog
      const l = Math.hypot(dx, dy) || 1;
      d.vx = dx / l * v; d.vy = dy / l * v; d.grounded = false; d.ground = null; d.wall = 0;
      d.st = 'hit'; d.atk = null; d.hitstun = clamp(0.1 + v * 0.012, 0.12, 0.7); d.hitCool = 0.06; d.shT = 0; d.tumble = v > 15 ? sgn(d.vx) * (7 + v * 0.25) : 0;
      d.face = d.face; setPose(d, 'scared'); d.c.squash = 0.18;
      endShield(d, false); if (d.item && d.item.type === 'hammer') { /* houdt hamer */ }
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
      const A = AT[key]; if (!A) return;
      f.st = 'atk'; f.atk = A; f.atkKey = key; f.atkT = 0; f.atkPhase = 0; f.hitDone = false; f.buf = 0;
      if (!item && key.startsWith('jab')) f.comboN = key === 'jab1' ? 1 : key === 'jab2' ? 2 : 3; else f.comboN = 0;
      setPose(f, 'idle');
    }
    function chooseAttack(f, inp) {
      const up = inp.y < -0.5, down = inp.y > 0.5, fwd = Math.abs(inp.x) > 0.5 && !up && !down;
      if (fwd) f.face = sgn(inp.x);
      if (f.grounded) {
        if (up) return 'usmash'; if (down) return 'dsmash'; if (fwd) return 'fsmash';
        return f.comboT > 0 && f.comboN === 1 ? 'jab2' : f.comboT > 0 && f.comboN === 2 ? 'jab3' : 'jab1';
      }
      if (up) return 'uair'; if (down) return 'dair'; if (fwd) return 'fair'; return 'nair';
    }
    function hitRect(f, A) {
      const s = f.size, ox = A.box[0] * s, w = A.box[2] * s;
      const x0 = A.sym ? f.x + ox : (f.face > 0 ? f.x + ox : f.x - ox - w);
      return { x0, x1: x0 + w, y0: f.y + A.box[1] * s, y1: f.y + (A.box[1] + A.box[3]) * s };
    }
    function stepAttack(f, dt) {
      const A = f.atk, k = Math.pow(f.spd, 0.6);
      f.atkT += dt * k;
      const t = f.atkT;
      if (f.atkPhase === 0 && t >= A.wind) {
        f.atkPhase = 1; f.hitDone = false;
        const r = hitRect(f, A);
        slash((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.x1 - r.x0, r.y1 - r.y0, A.sym ? (A.box[1] > 1 ? Math.PI / 2 : A.box[1] < 0 ? -Math.PI / 2 : 0) : (f.face > 0 ? 0 : Math.PI), f.col);
        audio.sfx(A.snd === 'explode' ? 'whoosh' : 'swing', { vol: 0.5, rate: A.big ? 0.8 : 1.1 + f.comboN * 0.1 });
        if (A.lunge) f.vx = f.face * A.lunge * f.spd;
        f.c.swing(); if (A.big) { f.c.squash = 0.12; }
      }
      if (f.atkPhase === 1) {
        if (!f.hitDone) {
          const r = hitRect(f, A), d = opp(f);
          if (d.st !== 'dead' && r.x1 > d.x - d.hw && r.x0 < d.x + d.hw && r.y1 > d.y && r.y0 < d.y + d.hh) {
            const away = A.away || (A.sym && A.ang > 60 && A.ang < 120);
            const dirx = away ? (sgn(d.x - f.x) || f.face) : f.face;
            const cx = clamp(d.x, r.x0, r.x1), cy = clamp(d.y + d.hh / 2, r.y0, r.y1);
            const ok = hurt(d, { dmg: A.dmg, bkb: A.bkb * f.pow, kbg: A.kbg, ang: A.ang, dirx, att: f, x: cx, y: cy, big: A.big, hs: A.hs, snd: A.snd });
            if (ok) { f.hitDone = true; if (f.atkKey && f.atkKey.startsWith('jab')) f.comboT = 0.5; if (d.st === 'shield' && f.st === 'atk') { /* geblokt */ } }
          }
        }
        if (t >= A.wind + A.act) f.atkPhase = 2;
      }
      if (t >= A.wind + A.act + A.rec) {
        f.st = 'free'; f.atk = null; if (f.atkKey && f.atkKey.startsWith('jab')) f.comboT = 0.4;
        if (f.itemUse) { f.itemUse = false; useUp(f); }
      }
    }
    function useUp(f) { if (!f.item) return; f.item.uses--; if (f.item.uses <= 0) dropItem(f, true); }

    // ---------------- items vasthouden / gebruiken ----------------
    function giveItem(f, type) {
      dropItem(f, false);
      const m = mkItemMesh(type, true); f.c.hold(m, 'r'); f.itemMesh = m;
      f.item = { type, t: 0, uses: type === 'hammer' ? 3 : type === 'ice' ? 2 : 1, fuse: type === 'bomb' ? 3.6 : 0 };
      stat.items[f.i]++;
      say(ITEMS[type].name, f.x, f.y + f.hh + 1.1, ITEMS[type].col, 1.5);
      audio.sfx('powerup', { vol: 0.6 }); fx.particles.burst(f.x, f.y + 1.2, 0.5, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.35, colors: [0xffffff, ITEMS[type].hex], gravity: 3 });
      if (type === 'bomb' || type === 'ice') setPose(f, 'carry');
    }
    function dropItem(f, poof) {
      if (f.itemMesh) { f.itemMesh.parent && f.itemMesh.parent.remove(f.itemMesh); f.itemMesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); f.itemMesh = null; }
      if (poof && f.item) fx.particles.burst(f.x, f.y + 1.2, 0.5, { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xffffff, 0xcccccc], gravity: 3 });
      f.item = null; if (f.c.pose === 'carry') setPose(f, 'idle');
    }
    function useItem(f, inp) {
      const it = f.item, up = inp.y < -0.5, down = inp.y > 0.5;
      if (it.type === 'hammer') { startAttack(f, 'hammer', true); f.itemUse = true; return; }
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
      }
    }
    function explode(x, y, owner, big = 1) {
      stat.explosions++;
      const R = 3.7 * big;
      for (const d of fs) {
        const cx = d.x, cy = d.y + d.hh / 2, dist = Math.hypot(cx - x, cy - y);
        if (dist < R + d.hw && d.st !== 'dead') {
          const dirx = sgn(cx - x), a = clamp(Math.atan2(cy - y + 1.4, Math.abs(cx - x)) * 180 / Math.PI, 25, 85);
          hurt(d, { dmg: 16 * (1 - dist / R * 0.4), bkb: 14, kbg: 0.09, ang: a, dirx, att: owner && owner !== d ? owner : null, noStun: true, x: cx, y: cy, big: 1, snd: 'explode', hs: 0.12 });
        }
      }
      fx.particles.burst(x, y, 0.8, { count: 50, speed: 12, up: 0.8, life: 0.9, size: 0.7, colors: [0xff7a1a, 0xffd070, 0xff4a2a, 0x555555], gravity: 3 });
      fx.particles.ring(x, y, 0.8, { count: 30, speed: 14, color: 0xffe0a0, size: 0.45, life: 0.45 });
      ctx.shake(0.7); audio.sfx('explode', { vol: 1 }); camPunch = Math.max(camPunch, 0.8);
      say('BOEM!', x, y + 1.4, '#ff9a3a', 2);
    }

    // ---------------- KO / respawn / einde ----------------
    function ko(f) {
      if (f.st === 'dead') return;
      const cx = clamp(f.x, -BLAST.x + 3, BLAST.x - 3), cy = clamp(f.y, BLAST.bot + 1, BLAST.top - 1);
      f.st = 'dead'; f.holder.visible = false; f.tag.visible = false; f.blob.visible = false; f.bubble.visible = false; f.ice.visible = false; f.discPlat.on = false; f.disc.visible = false;
      dropItem(f, false); f.deadT = 1.5; f.atk = null;
      const who = f.lastHit >= 0 && T - f.lastHitT < 6 ? f.lastHit : -1; if (who >= 0) fs[who].kos++;
      stop = 0; slowK = 0.25; slowHold = 0.7; ctx.shake(0.85); camPunch = 1;
      // effect op de rand van het beeld
      const ex = clamp(f.x, camTgt.x - viewHW + 1.5, camTgt.x + viewHW - 1.5), ey = clamp(f.y, camTgt.y - viewHH + 1.5, camTgt.y + viewHH - 1.5);
      fx.particles.burst(ex, ey, 1, { count: 60, speed: 12, up: 0.3, life: 1.1, size: 0.7, colors: [0xffe14a, 0xffffff, f.col, 0xff6fa5], gravity: 0 });
      fx.particles.ring(ex, ey, 1, { count: 36, speed: 16, color: f.col, size: 0.5, life: 0.6 });
      fx.texts.add('KO!', ex, ey, 1.5, '#ffe14a', 2.8);
      audio.sfx('bell', { vol: 0.9 }); audio.sfx('explode', { vol: 0.5, rate: 1.4 }); audio.sfx('lose', { vol: 0.3 });
      if (over) { refreshHud(); return; }
      f.stocks--;
      refreshHud(); checkRage();
      if (f.stocks <= 0) endMatch(1 - f.i, `${names[f.i]} is al zijn levens kwijt!`);
    }
    function respawn(f) {
      f.st = 'free'; f.x = f.i ? 3.6 : -3.6; f.y = 10.5; f.vx = f.vy = 0; f.pct = 0; f.inv = 2.4; f.grounded = false; f.jumps = 2; f.boostUsed = false; f.wallJ = 1; f.cd = 0; f.hitstun = 0; f.tumble = 0; f.frozenT = 0; f.rollT = 0;
      f.holder.visible = true; f.tag.visible = true; f.blob.visible = true; f.holder.rotation.z = 0; setPose(f, 'idle');
      f.discPlat.x = f.x; f.discPlat.y = f.y - 0.4; f.discPlat.on = true; f.discPlat.t = 3.2; f.disc.visible = true; f.disc.position.set(f.x, f.discPlat.y, 0);
      fx.particles.burst(f.x, f.y + 0.5, 0, { count: 28, speed: 6, up: 1.5, life: 0.8, size: 0.5, colors: [0xffffff, f.col, 0xffe14a], gravity: 3 });
      audio.sfx('sparkle', { vol: 0.7 }); say('terug!', f.x, f.y + 3, '#ffffff', 1.2);
      f.tagKey = ''; drawTag(f);
    }
    function endMatch(w, why) {
      if (over) return; over = true; winner = w; endT = 2.2; slowK = 0.35; slowHold = 2;
      hud.setTimer(null); hud.showBig(w == null ? 'GELIJK!' : `${names[w]} WINT!`, 2000, '#ffe14a'); audio.sfx('win', { vol: 0.8 });
      if (w != null) { setPose(fs[w], 'cheer'); setPose(fs[1 - w], 'sad'); }
      refreshHud();
      endWhy = why || '';
    }
    let endWhy = '';
    function finishMatch() {
      if (finished) return; finished = true;
      const w = winner, l = 1 - w, a = fs[w], b = fs[l];
      const jokes = [`${names[w]} meppert ${names[l]} de wolken in!`, `${names[l]} vliegt nog steeds. Hoi, vogeltjes!`, `${names[w]} is de koning van het zwevende eiland.`, `De draak is zwaar onder de indruk van ${names[w]}.`, `${names[l]} had geen kans, maar wel veel stijl.`];
      const bits = [];
      if (a.kos + b.kos > 0) bits.push(`${a.kos + b.kos} keer KO`);
      if (stat.explosions) bits.push(`${stat.explosions} ontploffing${stat.explosions > 1 ? 'en' : ''}`);
      if (stat.freezes) bits.push(`${stat.freezes}x bevroren`);
      if (stat.dragons) bits.push(`${stat.dragons}x draak op bezoek`);
      ctx.finishPvp({ winner: w, score: [fs[0].stocks, fs[1].stocks], delay: 700, summary: `${pick(jokes)} ${endWhy ? endWhy + ' ' : ''}<br><small>Schade: ${names[0]} ${Math.round(fs[0].pct)}% · ${names[1]} ${Math.round(fs[1].pct)}%${bits.length ? ' · ' + bits.join(' · ') : ''}</small>` });
    }
    function timeUp() {
      const a = fs[0], b = fs[1];
      if (a.stocks !== b.stocks) { endMatch(a.stocks > b.stocks ? 0 : 1, 'Meeste levens na 100 seconden.'); return; }
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
      const kinds = ['dragon', 'gravity', 'rain'].filter((k) => k !== lastEvent); const k = pick(kinds); lastEvent = k;
      if (k === 'dragon') startDragon();
      else if (k === 'gravity') {
        gEvKind = Math.random() < 0.5 ? 'maan' : 'zwaar'; gEv = gEvKind === 'maan' ? 0.45 : 1.5; gEvT = 7.5;
        hud.showBig(gEvKind === 'maan' ? '🌙 MAANGRAP!' : '⚖️ ZWAAR!', 1300, gEvKind === 'maan' ? '#b8d0ff' : '#ff9a6a');
        hud.toast(gEvKind === 'maan' ? 'De zwaartekracht neemt vakantie: alles zweeft!' : 'Autsj! De zwaartekracht is dubbel zo sterk!', 2600);
        audio.sfx(gEvKind === 'maan' ? 'boing' : 'thud', { vol: 0.8 }); L.hemi.color.set(gEvKind === 'maan' ? 0xb8c8ff : 0xffa078);
      } else {
        hud.showBig('🎁 CADEAUTJES!', 1200, '#ffe14a'); for (let i = 0; i < 3; i++) setTimeout(() => { if (!finished && !over) spawnItem(null, rand(-8, 8)); }, i * 450);
      }
      eventT = rand(13, 18);
    }

    // ---------------- camera ----------------
    const camTgt = new THREE.Vector3(0, 3, 0); let camDist = 40, viewHW = 20, viewHH = 12;
    function updateCamera(dt, snap) {
      let x0 = -ST.HW - 1.5, x1 = ST.HW + 1.5, y0 = -3.2, y1 = 10.6;
      for (const f of fs) if (f.st !== 'dead') { x0 = Math.min(x0, f.x - 3.5); x1 = Math.max(x1, f.x + 3.5); y0 = Math.min(y0, f.y - 2.5); y1 = Math.max(y1, f.y + f.hh + 3); }
      x0 = Math.max(x0, -30); x1 = Math.min(x1, 30); y0 = Math.max(y0, -11); y1 = Math.min(y1, 17);
      const hw = (x1 - x0) / 2, hh = (y1 - y0) / 2, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), asp = camera.aspect || 1.7;
      let dist = Math.max(hh * 1.18 / tanV, hw / (tanV * asp)); dist = clamp(dist, 28, 66) * (1 - camPunch * 0.06);
      const k = snap ? 1 : 1 - Math.exp(-4 * dt);
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
      f.vy = 0; f.grounded = true; f.ground = surf; f.jumps = 2; f.wallJ = 1; f.boostUsed = false;
    }
    function physics(f, dt, g) {
      const py = f.y, hw = f.hw, hh = f.hh;
      f.wall = 0; f.vy -= g * dt; f.vy = Math.max(f.vy, f.st === 'hit' ? -45 : -(f.fast ? FASTFALL : FALLMAX));
      f.x += f.vx * dt; f.y += f.vy * dt; f.grounded = false; f.ground = null;
      // hoofdeiland
      const ox = f.x + hw * 0.55 > -IHW && f.x - hw * 0.55 < IHW;
      if (f.vy <= 0 && py >= ST.TOP - 0.02 && f.y <= ST.TOP && ox) { f.y = ST.TOP; land(f, 'main'); }
      else if (f.y < ST.TOP - 0.02 && f.y + hh > ST.BOT && f.x + hw > -IHW && f.x - hw < IHW) {
        if (py + hh <= ST.BOT + 0.2 && f.vy > 0) { f.y = ST.BOT - hh; f.vy = -Math.abs(f.vy) * (f.st === 'hit' ? 0.4 : 0.1); if (f.st === 'hit') audio.sfx('thud', { vol: 0.3 }); }
        else if (f.x < 0) { f.x = -IHW - hw; if (f.vx > 0) f.vx = f.st === 'hit' ? -f.vx * 0.35 : 0; f.wall = -1; }
        else { f.x = IHW + hw; if (f.vx < 0) f.vx = f.st === 'hit' ? -f.vx * 0.35 : 0; f.wall = 1; }
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
    function stepFighter(f, dt, first) {
      const inp = pv.input(f.i); f.inp = inp;
      let e = NOE; if (first && f.pend) { e = { ...f.pend }; for (const k in f.pend) f.pend[k] = false; }
      const o = opp(f);
      f.inv = Math.max(0, f.inv - dt); f.cd = Math.max(0, f.cd - dt); f.comboT = Math.max(0, f.comboT - dt); f.drop = Math.max(0, f.drop - dt); f.buf = Math.max(0, f.buf - dt);
      f.hitCool = Math.max(0, (f.hitCool || 0) - dt); f.fireCd = Math.max(0, f.fireCd - dt);
      if (f.discPlat.on) { f.discPlat.t -= dt; if (f.discPlat.t <= 0 || (f.inv <= 0.1)) { f.discPlat.on = false; f.disc.visible = false; } }
      const g = G0 * GRAV * gEv * (f.st === 'hit' ? 0.62 : 1);
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
      const spd = f.spd;
      const tx = Math.abs(inp.x) > 0.2 ? inp.x : 0;
      if (f.st === 'free') {
        // lopen
        const ground = f.grounded;
        const rate = ground ? (tx ? lerp(20, 2.2, SLIP) : lerp(22, 0.9, SLIP)) : (tx ? 5.5 : 0.7);
        f.vx = damp(f.vx, tx * (ground ? RUN : AIRMAX) * spd, rate, dt);
        if (Math.abs(tx) > 0.3) f.face = sgn(tx);
        // springen
        if (e.up) {
          if (f.grounded) { f.vy = JUMP1 * Math.sqrt(1 / 1) * (GRAV < 1 ? 0.85 : 1); f.jumps = 1; f.grounded = false; f.c.jump(); audio.sfx('jump', { vol: 0.4 }); fx.particles.dust(f.x, f.y, 0, 4); }
          else if (f.wall !== 0 && f.wallJ > 0 && f.y < ST.TOP - 0.3) { f.vy = 16; f.vx = -f.wall * 2.5; f.wallJ--; f.c.jump(); audio.sfx('jump', { vol: 0.4, rate: 1.3 }); fx.particles.dust(f.x + f.wall * 0.4, f.y + 1, 0, 5, 0xbdb0d8); say('hup!', f.x, f.y + 2.5, '#ffffff', 0.9); }
          else if (f.jumps > 0) { f.vy = JUMP2 * (GRAV < 1 ? 0.88 : 1); f.jumps--; f.c.jump(); audio.sfx('jump', { vol: 0.4, rate: 1.4 }); fx.particles.ring(f.x, f.y + 0.2, 0, { count: 10, speed: 4, color: 0xffffff, size: 0.28, life: 0.35 }); }
        }
        // muur-klampen en snelvallen
        if (!f.grounded && f.wall !== 0 && f.vy < 0 && Math.sign(tx) === -f.wall && f.y < ST.TOP - 0.3) f.vy = Math.max(f.vy, -3.5);
        if (!f.grounded && inp.y > 0.6 && f.vy < 0) f.fast = true;
        if (f.grounded && e.dn && f.ground && f.ground.tmp !== true && f.ground !== 'main') { f.drop = 0.25; f.y -= 0.05; f.grounded = false; }
        // aanvallen
        if (e.a || (f.buf > 0 && f.st === 'free')) {
          f.buf = 0;
          if (f.item) useItem(f, inp); else startAttack(f, chooseAttack(f, inp));
          f.discPlat.on = false; f.disc.visible = false;
        }
        // B: schild / roll / raketsprong
        else if (e.b && f.cd <= 0) {
          const up = inp.y < -0.5, side = Math.abs(inp.x) > 0.5;
          if (up && !f.boostUsed) startBoost(f, inp);
          else if (side) startRoll(f, sgn(inp.x));
          else startShield(f);
        }
        if (f.grounded) { f.c.air = false; f.c.speed = Math.abs(f.vx) / RUN; } else { f.c.air = true; f.c.speed = 0; }
      } else if (f.st === 'atk') {
        // tijdens de slag: grond-wrijving, lucht-drift
        if (f.grounded) f.vx = damp(f.vx, 0, 9, dt); else f.vx = damp(f.vx, tx * AIRMAX * 0.6 * spd, 3, dt);
        if (e.a && f.atkT > (f.atk.wind + f.atk.act) * 0.8) f.buf = 0.25;      // volgende slag alvast inplannen
        if (e.up && f.jumps > 0 && f.atkPhase === 2 && !f.grounded) { f.st = 'free'; f.atk = null; f.vy = JUMP2; f.jumps--; audio.sfx('jump', { vol: 0.4, rate: 1.4 }); }
        else stepAttack(f, dt);
        f.c.air = !f.grounded; f.c.speed = 0;
      } else if (f.st === 'shield') {
        f.shT += dt; f.shLeft -= dt * 0.55; f.vx = damp(f.vx, 0, 14, dt);
        if (!inp.b || f.shLeft <= 0 || f.shT > 1.4) { if (f.shLeft <= 0) { f.shLeft = 0; } endShield(f, false); setPose(f, 'idle'); }
        if (e.a && f.shT > 0.1) { endShield(f, false); startAttack(f, f.grounded ? 'jab1' : 'nair'); }
        f.bubble.scale.setScalar((1.55 + Math.sin(T * 18) * 0.03) * f.size * (0.7 + 0.3 * clamp(f.shLeft / 1.2, 0, 1)));
        f.bubble.material.opacity = f.shT < 0.14 ? 0.8 : 0.35;
        f.c.speed = 0; f.c.air = false;
      } else if (f.st === 'roll') {
        f.rollT -= dt;
        if (f.grounded) f.vx = f.rollDir * 13 * spd; else { f.vx = f.rollDir * 14 * spd; f.vy = Math.max(f.vy, 0) * 0.5; }
        f.inv = Math.max(f.inv, 0.05);
        if (Math.random() < 0.5) fx.particles.dust(f.x, f.y + 0.5, 0, 1, 0xd0c0ff);
        if (f.rollT <= 0) { f.st = 'free'; f.inv = Math.min(f.inv, 0.05); }
        f.c.speed = 1; f.c.air = !f.grounded;
      } else if (f.st === 'boost') {
        f.rollT -= dt; f.vx = f.bx * 22; f.vy = f.by * 22;
        for (let k = 0; k < 2; k++) fx.particles.emit(f.x - f.bx * 0.6 + rand(-0.3, 0.3), f.y + 0.6 - f.by * 0.6, 0, rand(-1, 1), rand(-2, 0), 0, { life: 0.4, size: 0.55, color: pick([0xff7a1a, 0xffd070, 0xffffff]), gravity: 0 });
        // raakt je broer onderweg
        if (!f.hitDone) { const d = o, hw2 = f.hw + 0.7; if (d.st !== 'dead' && Math.abs(d.x - f.x) < hw2 + d.hw && d.y < f.y + f.hh && d.y + d.hh > f.y) { const okk = hurt(d, { dmg: 5, bkb: 9 * f.pow, kbg: 0.05, ang: 65, dirx: sgn(d.x - f.x) || f.face, att: f, x: d.x, y: d.y + d.hh / 2 }); if (okk) f.hitDone = true; } }
        if (f.rollT <= 0) { f.st = 'free'; f.vy *= 0.5; f.vx *= 0.5; }
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
    function checkBlast(f) { if (f.x < -BLAST.x || f.x > BLAST.x || f.y < BLAST.bot || f.y > BLAST.top) ko(f); }
    function startBoost(f, inp) {
      f.st = 'boost'; f.rollT = 0.32; f.boostUsed = true; f.cdMax = 2.6; f.cd = 2.6; f.hitDone = false; f.atk = null; f.grounded = false;
      const sx = Math.abs(inp.x) > 0.4 ? sgn(inp.x) : 0; const l = Math.hypot(sx * 0.7, 1); f.bx = sx * 0.7 / l; f.by = 1 / l; if (sx) f.face = sx;
      audio.sfx('whoosh', { vol: 0.7, rate: 0.8 }); audio.sfx('powerup', { vol: 0.3, rate: 1.5 }); fx.particles.burst(f.x, f.y, 0, { count: 16, speed: 6, up: -0.5, life: 0.5, size: 0.5, colors: [0xff7a1a, 0xffd070], gravity: 0 });
      say('RAKET!', f.x, f.y + f.hh + 0.8, '#ff9a3a', 1.1); f.c.jump();
    }
    function startRoll(f, dir) {
      f.st = 'roll'; f.rollT = 0.27; f.rollDir = dir; f.face = dir; f.inv = 0.3; f.cdMax = 1.3; f.cd = 1.3; f.atk = null;
      audio.sfx('whoosh', { vol: 0.5, rate: 1.4 }); fx.particles.dust(f.x, f.y, 0, 5);
    }

    // ---------------- per frame ----------------
    function updateItems(dt) {
      for (const it of items) {
        if (it.dead) continue;
        it.t += dt; it.life -= (it.st === 'ground' ? dt : 0);
        if (it.st === 'fall') {
          it.y += it.vy * dt * (0.5 + gEv * 0.5); const s = surfaceBelow(it.x, it.y + 0.2);
          it.balloon.position.x = Math.sin(it.t * 2) * 0.25; it.balloon.rotation.z = Math.sin(it.t * 2) * 0.1;
          if (s !== null && it.y <= s) {
            it.y = s; it.st = 'ground'; it.balloon.visible = false; it.g.children[2].visible = false;
            fx.particles.burst(it.x, it.y + 2.6, 0, { count: 12, speed: 4, up: 0.5, life: 0.5, size: 0.4, colors: [ITEMS[it.type].hex, 0xffffff], gravity: 5 }); audio.sfx('pop', { vol: 0.5 });
            if (it.type === 'tramp') { addTramp(it.x, it.y); killItem(it); continue; }
          }
          if (it.y < BLAST.bot) { killItem(it); continue; }
        } else {
          it.g.rotation.y = Math.sin(it.t * 2) * 0.5; it.g.children[0].position.y = 0.15 + Math.sin(it.t * 4) * 0.12;
          if (it.life <= 0) { fx.particles.burst(it.x, it.y + 0.6, 0, { count: 10, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xffffff], gravity: 3 }); killItem(it); continue; }
          // oppakken
          for (const f of fs) if (!f.item && (f.st === 'free' || f.st === 'atk' || f.st === 'roll') && Math.abs(f.x - it.x) < f.hw + 0.9 && f.y < it.y + 1.4 && f.y + f.hh > it.y) { giveItem(f, it.type); killItem(it); break; }
          continue;
        }
        it.g.position.set(it.x, it.y, 0);
        // meepakken in de lucht
        for (const f of fs) if (!it.dead && !f.item && f.st !== 'dead' && f.st !== 'hit' && f.st !== 'frozen' && Math.abs(f.x - it.x) < f.hw + 0.9 && f.y < it.y + 1 && f.y + f.hh > it.y - 0.3) { giveItem(f, it.type); killItem(it); }
      }
      for (let i = items.length - 1; i >= 0; i--) if (items[i].dead) items.splice(i, 1);
    }
    // trampolines
    const trampMeshes = [];
    function addTramp(x, y) {
      stat.trampolines++;
      const g = mkItemMesh('tramp'); g.position.set(x, y, 0); scene.add(g); tramps.push({ x, y: y + 0.55, g, life: 14, sq: 0 });
      say('TRAMPOLINE!', x, y + 3, '#ff6fa5', 1.3); audio.sfx('boing', { vol: 0.6 });
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
        } else if (p.kind === 'fire') {
          p.vy -= 26 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.g.scale.setScalar(0.9 + Math.sin(T * 30 + p.x) * 0.15);
          fx.particles.emit(p.x, p.y, 0, rand(-1, 1), rand(0, 1.5), 0, { life: 0.45, size: 0.55, color: pick([0xff7a1a, 0xffd070, 0xff4a2a]), gravity: -1 });
          const s = surfaceBelow(p.x, p.y + 0.3);
          let hitD = null; for (const d of fs) if (d.st !== 'dead' && Math.abs(d.x - p.x) < d.hw + 0.5 && p.y > d.y - 0.3 && p.y < d.y + d.hh + 0.3) hitD = d;
          if (hitD) { hurt(hitD, { dmg: 8, bkb: 9, kbg: 0.07, ang: 62, dirx: sgn(p.vx) || 1, x: p.x, y: p.y, big: 1, snd: 'sizzle', hs: 0.1 }); addFlame(p.x, s ?? p.y); freeProj(p); continue; }
          if (s !== null && p.y <= s) { addFlame(p.x, s); audio.sfx('sizzle', { vol: 0.4 }); freeProj(p); continue; }
          if (p.y < BLAST.bot) { freeProj(p); continue; }
        }
        p.g.position.set(p.x, p.y, 0);
      }
      for (let i = projs.length - 1; i >= 0; i--) if (projs[i].dead) projs.splice(i, 1);
      for (const fl of flames) { fl.t += dt; fl.g.scale.set(1 + Math.sin(T * 14 + fl.x) * 0.1, (1 - Math.max(0, fl.t - fl.life + 0.5)) * (1 + Math.sin(T * 17) * 0.12), 1); if (Math.random() < 0.3) fx.particles.emit(fl.x + rand(-0.4, 0.4), fl.y + 1, 0, rand(-0.5, 0.5), rand(1, 2.5), 0, { life: 0.5, size: 0.4, color: pick([0xff7a1a, 0xffd070]), gravity: -1 }); if (fl.t >= fl.life) { fl.g.visible = false; fl.dead = true; } }
      for (let i = flames.length - 1; i >= 0; i--) if (flames[i].dead) flames.splice(i, 1);
      for (const t of tramps) { t.life -= dt; t.sq = Math.max(0, t.sq - dt * 3); t.g.scale.set(1 + t.sq * 0.12, 1 - t.sq * 0.4, 1); if (t.life < 2) t.g.visible = Math.sin(T * 20) > 0; if (t.life <= 0) { scene.remove(t.g); t.dead = true; fx.particles.burst(t.x, t.y, 0, { count: 12, speed: 4, up: 1, life: 0.5, size: 0.4, colors: [0xff6fa5, 0xffe14a], gravity: 4 }); } }
      for (let i = tramps.length - 1; i >= 0; i--) if (tramps[i].dead) tramps.splice(i, 1);
    }
    function updateDragon(dt) {
      if (!dragonPhase) return;
      dragonT += dt; const d = dragon;
      if (dragonPhase === 'warn') {
        if (dragonT > 1.6) { dragonPhase = 'fly'; dragonT = 0; d.group.visible = true; dragonFireT = 0.6; audio.sfx('explode', { vol: 0.35, rate: 0.6 }); }
      } else if (dragonPhase === 'fly') {
        const dur = 5.2, k = dragonT / dur, x = lerp(-dragonDir * 38, dragonDir * 38, k), y = 8.8 + Math.sin(dragonT * 2.2) * 0.9;
        d.group.position.set(x, y, -3.2); d.group.rotation.y = dragonDir > 0 ? Math.PI / 2 : -Math.PI / 2; d.group.rotation.z = Math.sin(dragonT * 2.2) * 0.07; d.update(dt);
        dragonFireT -= dt;
        if (dragonFireT <= 0 && Math.abs(x) < 15) {
          dragonFireT = 0.5; const mx = x + dragonDir * 2.6 * 1.7, my = y + 0.8;
          fireProj('fire', mx, my, dragonDir * 8 + rand(-2, 2), -2, null);
          fx.particles.burst(mx, my, 0, { count: 8, speed: 4, up: 0.2, life: 0.4, size: 0.6, colors: [0xff7a1a, 0xffd070], gravity: 0 }); audio.sfx('sizzle', { vol: 0.3 });
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
      f.holder.visible = f.inv > 0 && f.st !== 'roll' && !f.discPlat.on ? Math.sin(T * 40) > -0.3 : true;
      if (f.st === 'frozen') { f.ice.visible = true; f.c.update(0); } else f.c.update(dt);
      if (f.discPlat.on) { f.disc.position.set(f.discPlat.x, f.discPlat.y, 0); f.disc.rotation.y += dt; const sc = 1 + Math.sin(T * 6) * 0.03; f.disc.scale.set(sc, 1, sc); f.disc.visible = true; }
      // schaduwblob onder je voeten
      const s = surfaceBelow(f.x, f.y + 0.1, f.hw);
      if (s !== null) { f.blob.visible = true; f.blob.position.set(f.x, s + 0.05, 0.2); const k = (1 + clamp((f.y - s) * 0.07, 0, 0.5)) * f.size; f.blob.scale.set(k * 1.3, 1, k * 1.3); f.blob.material.opacity = clamp(1 - (f.y - s) * 0.05, 0.3, 1); } else f.blob.visible = false;
      f.tag.visible = true; f.tag.position.set(f.x, f.y + f.hh + 1.15 * f.size, 0.5); f.tag.scale.set(3.4 * f.size ** 0.5, 1.28 * f.size ** 0.5, 1);
      f.blob.visible = f.blob.visible && true;
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
          if (sdRain <= 0) { sdRain = 3.5; spawnItem(Math.random() < 0.5 ? 'bomb' : 'hammer', rand(-8, 8)); }
          if (!dragonPhase) { sdDr -= dt; if (sdDr <= 0) { sdDr = 14; startDragon(); } }
          if (sdT <= 0) { const a = fs[0], b = fs[1]; endMatch(a.pct === b.pct ? (Math.random() < 0.5 ? 0 : 1) : (a.pct < b.pct ? 0 : 1), 'Sudden death duurde te lang: de minste schade wint.'); }
        }
        // items & evenementen
        itemT -= dt; if (itemT <= 0) { itemT = sd ? 9 : rand(6.5, 9.5); const bi = behindIdx(); spawnItem(null, bi >= 0 ? clamp(fs[bi].x + rand(-3, 3), -8, 8) : undefined); }
        if (!sd) { eventT -= dt; if (eventT <= 0 && !dragonPhase && gEvT <= 0) nextEvent(); }
      }
      if (gEvT > 0) { gEvT -= dt; if (gEvT <= 0) { gEv = 1; L.hemi.color.copy(hemiBase); hud.toast('De zwaartekracht is weer normaal.', 1400); } }
      const order = Math.floor(T * 10) % 2 ? [0, 1] : [1, 0];
      const steps = Math.ceil(dt / 0.017), sdt = dt / steps;
      for (let s = 0; s < steps; s++) for (const k of order) { const f = fs[k]; if (f.st === 'dead') { if (s === 0) { f.deadT -= dt; if (f.deadT <= 0 && !over) respawn(f); } continue; } stepFighter(f, sdt, s === 0); }
      updateItems(dt); updateProjs(dt); updateDragon(dt);
      if (sd && Math.random() < dt * 3) fx.particles.emit(rand(-ST.HW, ST.HW), rand(-2, 12), -2, 0, rand(-6, -3), 0, { life: 1, size: 0.5, color: 0xff7a4a, gravity: 0 });
    }
    function visuals(dt) {
      for (const f of fs) { drawFighterVisuals(f, f.st === 'hit' || f.st === 'frozen' ? dt : dt); }
      for (const s of slashes) if (s.m.visible) { s.t += dt; const k = s.t / 0.16; if (k >= 1) { s.m.visible = false; continue; } s.m.material.opacity = (1 - k) * 0.85; s.m.scale.set(s.sx * (0.8 + k * 0.3), s.sy * (0.8 + k * 0.3), 1); }
      W.update(T, dt);
      tagUpd -= dt; if (tagUpd <= 0) { tagUpd = 0.1; for (const f of fs) drawTag(f); }
    }
    function update(dt) {
      T += dt; introT += dt;
      if (finished) { resultUpdate(dt); return; }
      if (!started) { started = true; refreshHud(); }
      for (const f of fs) pollEdges(f);
      if (stop > 0) { stop -= dt; visuals(dt * 0.15); updateCamera(dt); return; }
      if (slowHold > 0) { slowHold -= dt; } else slowK = damp(slowK, 1, 6, dt);
      const sdt = dt * slowK;
      if (over) { endT -= dt; if (endT <= 0) finishMatch(); }
      simulate(sdt); visuals(sdt); updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; for (const f of fs) { f.c.update(dt); if (f.st !== 'dead') f.holder.position.set(f.x, f.y + f.hh / 2, 0); } W.update(T, dt); updateCamera(dt); }
    function introUpdate(dt) {
      T += dt; introT += dt;
      for (const f of fs) { f.c.faceDir(f.face, 0); f.c.speed = 0; f.holder.position.set(f.x, f.y + f.hh / 2, 0); f.c.update(dt); f.blob.visible = true; f.blob.position.set(f.x, f.y + 0.05, 0.2); f.blob.scale.set(1.3, 1, 1.3); f.tag.visible = true; f.tag.position.set(f.x, f.y + f.hh + 1.15, 0.5); drawTag(f); }
      W.update(T, dt); updateCamera(dt, introT < 0.2);
    }
    updateCamera(0.016, true);
    for (const f of fs) { f.tag.position.set(f.x, f.y + f.hh + 1.2, 0.5); drawTag(f); }
    refreshHud();

    return {
      update, introUpdate, resultUpdate,
      onResize() { updateCamera(0.016, true); },
      onSwap(sw) { for (const f of fs) { fx.particles.burst(f.x, f.y + 1, 0, { count: 20, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 2 }); } },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && fs[i].st !== 'dead') { fs[i].pct += 25; fs[i].tagKey = ''; drawTag(fs[i]); say('BEWOOG! +25%', fs[i].x, fs[i].y + fs[i].hh + 1.6, '#ff6b6b', 1.5); fs[i].c.pose = 'scared'; } }); },
      celebrate(w) { fs[w].c.pose = 'cheer'; fs[1 - w].c.pose = 'sad'; },
      dispose() {},
      dbg: {
        fs, projs, items, flames, tramps,
        get over() { return over; },
        state: () => ({ T, clock, sd, sdT, over, gEv, dragon: dragonPhase, started, finished, stats: stat, winner,
          f: fs.map((f) => ({ x: f.x, y: f.y, vx: f.vx, vy: f.vy, st: f.st, pct: f.pct, stocks: f.stocks, face: f.face, grounded: f.grounded, jumps: f.jumps, cd: f.cd, item: f.item && f.item.type, inv: f.inv, hw: f.hw, hh: f.hh, hits: f.hits, kos: f.kos, rage: f.rage, boostUsed: f.boostUsed })),
          items: items.map((i) => ({ type: i.type, x: i.x, y: i.y, st: i.st })), n: { projs: projs.length, flames: flames.length, tramps: tramps.length } }),
        setTime(s) { clock = s; }, setPct(i, p) { fs[i].pct = p; fs[i].tagKey = ''; }, setStocks(i, n) { fs[i].stocks = n; checkRage(); refreshHud(); },
        spawnItem, giveItem: (i, t) => giveItem(fs[i], t), startDragon, nextEvent, startSD, setPos(i, x, y) { fs[i].x = x; fs[i].y = y; fs[i].vx = fs[i].vy = 0; }, setEventT(t) { eventT = t; },
        explode, hurt, itemT: (t) => { itemT = t; },
      },
    };
  },
};

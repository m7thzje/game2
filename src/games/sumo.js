import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, mulberry32, canvasTex, fbm, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildIceWorld, WATER_Y } from './sumo_world.js';

// IJs-Sumo — versus: duw je broer van de glibberige, afbrokkelende ijsplaat. Best-of-5 (3 gewonnen rondes = kampioen).

const R0 = 8.2, NP = 56, TOP = 0.4, BOT = -0.4;
const PR = 0.85;                    // spelerstraal
const ACC = 10, MU = 1.6, MAXV = 24;
const WIN_ROUNDS = 3, MAX_ROUNDS = 5;
const CHARGE_MAX = 0.85;

export default {
  id: 'sumo',
  name: 'IJs-Sumo',
  giver: 'Sumo-Sjaak',
  icon: '🤼',
  mode: 'versus',
  time: 75,
  pay: 1,
  music: 'game_fast',
  blurb: 'Sumo-Sjaak daagt jullie uit op een <b>bevroren meer</b>! Duw je broer van de ijsplaat af: de plaat wordt steeds kleiner en brokkelt af. Wie als eerste <b>3 rondes</b> wint, is kampioen. Pak de <b>ijsbloem</b> om tijdelijk een zware sumoworstelaar te worden!',
  controls: ['{move} glijden over het ijs', '{a} duw! (ingedrukt houden = sterkere duw)', '{b} sprong (ontwijken of neerstampen)'],
  tip: 'Een opgeladen duw is sterk maar je glijdt zelf door en blijft even wankelen. Spring over een aanstormende broer heen!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const L = ctx.lights('night', { shadow: 15, center: [0, 0, 0], fogNear: 70, fogFar: 230 });
    L.hemi.intensity = 1.2; L.hemi.color.set(0xbcd4ff); L.hemi.groundColor.set(0x5a78a8);
    L.sun.color.set(0xcfe0ff); L.sun.intensity = 2.0; L.sun.position.set(-16, 34, 18);
    camera.fov = 46; camera.updateProjectionMatrix();
    const wrng = mulberry32(2024);
    const W = buildIceWorld(ctx, wrng);

    // ---------------- ijsplaat (1 mesh die per frame vervormt) ----------------
    const rad = new Float32Array(NP).fill(0.3), tgt = new Float32Array(NP).fill(R0), bite = new Float32Array(NP), warn = new Float32Array(NP), jit = new Float32Array(NP);
    for (let i = 0; i < NP; i++) jit[i] = (fbm(i * 0.41, 3.3) * 0.5);
    const vCount = 1 + NP + NP * 2;
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uvs = new Float32Array(vCount * 2), col = new Float32Array(vCount * 3);
    nor[1] = 1; for (let i = 0; i < NP; i++) { nor[(1 + i) * 3 + 1] = 1; }
    const T0 = 1, W0 = 1 + NP, B0 = 1 + 2 * NP;
    for (let i = 0; i < NP; i++) { const th = i / NP * TAU; for (const base of [W0, B0]) { nor[(base + i) * 3] = Math.sin(th); nor[(base + i) * 3 + 2] = Math.cos(th); } }
    const idxTop = [], idxWall = [];
    for (let i = 0; i < NP; i++) { const a = T0 + i, b = T0 + (i + 1) % NP; idxTop.push(0, a, b); }
    for (let i = 0; i < NP; i++) { const j = (i + 1) % NP; idxWall.push(W0 + i, B0 + i, W0 + j, W0 + j, B0 + i, B0 + j); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); pg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pg.setIndex([...idxTop, ...idxWall]); pg.addGroup(0, idxTop.length, 0); pg.addGroup(idxTop.length, idxWall.length, 1);
    const iceTex = canvasTex(512, 512, (g, w, h) => {
      const r = mulberry32(31);
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#e6f7ff'); gr.addColorStop(0.7, '#c4e6fa'); gr.addColorStop(1, '#a0d2ee'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // sneeuw-/vorstvlekken
      for (let i = 0; i < 60; i++) { const a = r() * TAU, d = Math.sqrt(r()) * w * 0.48; g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 8 + r() * 26, 4 + r() * 12, r() * 3, 0, TAU); g.fill(); }
      // sumo-ringen
      g.strokeStyle = 'rgba(80,150,200,.35)'; g.lineWidth = 3; for (const rr of [0.12, 0.3, 0.6]) { g.beginPath(); g.arc(w / 2, h / 2, w * rr, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(80,150,200,.3)'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.05, h / 2 + Math.sin(a) * w * 0.05); g.lineTo(w / 2 + Math.cos(a) * w * 0.12, h / 2 + Math.sin(a) * w * 0.12); g.stroke(); }
      // scheuren
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`; g.lineWidth = 1 + r() * 2; let x = r() * w, y = r() * h; if (Math.hypot(x - w / 2, y - h / 2) < w * 0.2) { x = w * 0.9 * r(); y = 10; } g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 16; i++) { g.strokeStyle = 'rgba(60,130,190,.4)'; g.lineWidth = 1.5; let x = r() * w, y = r() * h; if (Math.hypot(x - w / 2, y - h / 2) < w * 0.2) { x = w * 0.9 * r(); y = 10; } g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 240; i++) { g.fillStyle = 'rgba(255,255,255,.7)'; const x = r() * w, y = r() * h; g.fillRect(x, y, 2, 2); if (i % 6 === 0) { g.fillRect(x - 3, y, 8, 1); g.fillRect(x, y - 3, 1, 8); } }
    });
    const topMat = new THREE.MeshStandardMaterial({ map: iceTex, vertexColors: true, roughness: 0.18, metalness: 0.12 });
    const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, flatShading: false, transparent: true, opacity: 0.96 });
    const plate = new THREE.Mesh(pg, [topMat, wallMat]); plate.castShadow = true; plate.receiveShadow = true; plate.frustumCulled = false; scene.add(plate);
    // snee-/glitterlaag rond het midden
    function updatePlateGeo() {
      pos[1] = TOP; uvs[0] = 0.5; uvs[1] = 0.5; col[0] = col[1] = col[2] = 1;
      for (let i = 0; i < NP; i++) {
        const th = i / NP * TAU, r = rad[i], s = Math.sin(th), c = Math.cos(th);
        const x = s * r, z = c * r;
        let k = (T0 + i) * 3; pos[k] = x; pos[k + 1] = TOP; pos[k + 2] = z;
        uvs[(T0 + i) * 2] = x / (2 * R0) + 0.5; uvs[(T0 + i) * 2 + 1] = z / (2 * R0) + 0.5;
        const w = warn[i] > 0 ? 0.5 + 0.5 * Math.sin(T * 38) : 0;
        col[k] = 1; col[k + 1] = 1 - w * 0.45; col[k + 2] = 1 - w * 0.65;
        k = (W0 + i) * 3; pos[k] = x; pos[k + 1] = TOP; pos[k + 2] = z; col[k] = 0.92; col[k + 1] = 0.97; col[k + 2] = 1;
        k = (B0 + i) * 3; pos[k] = x * 0.975; pos[k + 1] = BOT; pos[k + 2] = z * 0.975; col[k] = 0.35; col[k + 1] = 0.62; col[k + 2] = 0.85;
        uvs[(W0 + i) * 2] = i / NP * 6; uvs[(W0 + i) * 2 + 1] = 0; uvs[(B0 + i) * 2] = i / NP * 6; uvs[(B0 + i) * 2 + 1] = 1;
      }
      pg.attributes.position.needsUpdate = true; pg.attributes.uv.needsUpdate = true; pg.attributes.color.needsUpdate = true; pg.computeBoundingSphere();
    }
    function radiusAt(x, z) {
      let a = Math.atan2(x, z); if (a < 0) a += TAU;
      const f = a / (TAU / NP); const i0 = Math.floor(f) % NP, i1 = (i0 + 1) % NP, t = f - Math.floor(f);
      return lerp(rad[i0], rad[i1], t);
    }

    // brokstukken
    const chunks = []; const chunkGeo = new THREE.DodecahedronGeometry(0.6, 0); const chunkMat = new THREE.MeshStandardMaterial({ color: 0xdaf1ff, roughness: 0.3, flatShading: true });
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(chunkGeo, chunkMat); m.castShadow = true; m.visible = false; scene.add(m); chunks.push({ m, on: false, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0 }); }
    function spawnChunk(x, z, s) {
      const c = chunks.find((q) => !q.on); if (!c) return;
      c.on = true; c.m.visible = true; c.m.position.set(x, TOP - 0.1, z); c.m.scale.set(s, s * 0.45, s * 0.9); c.m.rotation.set(0, rand(0, 3), 0);
      const d = Math.hypot(x, z) || 1; c.vx = x / d * rand(0.5, 1.8); c.vz = z / d * rand(0.5, 1.8); c.vy = rand(0.5, 2.2); c.rx = rand(-3, 3); c.rz = rand(-3, 3);
    }
    function updateChunks(dt) {
      for (const c of chunks) {
        if (!c.on) continue;
        c.vy -= 16 * dt; c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt; c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
        if (c.m.position.y < WATER_Y - 0.2) { c.on = false; c.m.visible = false; splashAt(c.m.position.x, c.m.position.z, 0.35); }
      }
    }
    function splashAt(x, z, big = 1) {
      fx.particles.burst(x, WATER_Y + 0.1, z, { count: Math.round(70 * big), speed: 6.5 * Math.sqrt(big), up: 1.9, spread: 0.9, life: 1.1, size: 0.34 * (0.7 + big * 0.3), colors: [0xffffff, 0xcfeaff, 0x6fc8ff, 0x9fdcff], gravity: 14 });
      if (big > 0.6) fx.particles.ring(x, WATER_Y + 0.15, z, { count: 28, speed: 6, color: 0xe8f8ff, size: 0.3, life: 0.6 });
      W.ripple(x, z, big, 0); if (big > 0.6) W.ripple(x, z, big * 1.5, 0.22);
    }

    // ---------------- spelers ----------------
    const START = [[-4.2, 0], [4.2, 0]];
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.35, 14, 10), new THREE.MeshBasicMaterial({ color: 0x6fc8e8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })); aura.position.y = 1.1; aura.visible = false; holder.add(aura);
      const crystals = new THREE.Group(); crystals.visible = false; holder.add(crystals);
      for (const sx of [-1, 1]) { const cr = mesh(new THREE.ConeGeometry(0.16, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x3aa6d8, emissiveIntensity: 0.8, flatShading: true }), { pos: [sx * 0.62, 1.55, 0], rot: [0, 0, -sx * 0.5] }); crystals.add(cr); }
      const ringR = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 32), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ringR.rotation.x = -Math.PI / 2; scene.add(ringR);
      const chargeR = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); chargeR.rotation.x = -Math.PI / 2; chargeR.visible = false; scene.add(chargeR);
      const blob = P.shadowBlob(1.1); scene.add(blob);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.2, 0.82, 1); tag.renderOrder = 15; scene.add(tag);
      return { i, c, holder, aura, crystals, ringR, chargeR, blob, tag, x: START[i][0], z: START[i][1], vx: 0, vz: 0, y: 0, vy: 0, face: i ? -Math.PI / 2 : Math.PI / 2, mass: 1, heavy: 0, charging: false, chargeT: 0, dashCd: 0, dashT: 0, dashPow: 0, recover: 0, jumpT: -1, jumpCd: 0, stun: 0, falling: false, fallT: 0, inWater: false, hidden: false, wins: 0, aimX: 0, aimZ: 0, tcol: 0, sc: 1, wob: 0, ax: 0, az: 0, spawnT: 0, lastHitBy: -1 };
    });

    // ---------------- ronde-toestand ----------------
    const R = { state: 'intro', t: 0, n: 0, decided: false, replays: 0, sd: false, firstFall: null, pendingEnd: 0, falls: [], decisive: false, shrinkRate: 0.15, sdAt: 20, nextBite: 3, biteGap: 2, crumbles: 0 };
    let T = 0, done = false, freeze = 0, introT = 0, camShake = 0, resultT = 0;
    const hist = []; // eindstanden na elke beslist ronde
    let maxLeadBeforeFinal = 0; let roundsPlayed = 0;
    let pw = null, pwTimer = 4, pwId = 0;
    const powerM = new THREE.Group(); powerM.visible = false; scene.add(powerM);
    { // ijsbloem
      powerM.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8ff, emissiveIntensity: 0.9 }), { pos: [0, 0.9, 0] }));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; powerM.add(mesh(new THREE.ConeGeometry(0.17, 0.75, 5), new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x3aa6d8, emissiveIntensity: 0.9, flatShading: true, transparent: true, opacity: 0.95 }), { pos: [Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.45], rot: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25] })); }
      powerM.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 5), mat(0x4aa86a), { pos: [0, 0.45, 0] }));
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 28), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; powerM.add(halo);
    }

    hud.setTimer(null); hud.setScore('Ronde 1');
    const pips = (w) => '●'.repeat(w) + '○'.repeat(WIN_ROUNDS - w);
    function refreshHud() {
      hud.setScore(`Ronde ${clamp(R.n, 1, MAX_ROUNDS + 2)}   ${names[0]} ${pips(pl[0].wins)}  –  ${pips(pl[1].wins)} ${names[1]}`);
      hud.setPlayerInfo(0, `Gewonnen: ${pl[0].wins}`); hud.setPlayerInfo(1, `Gewonnen: ${pl[1].wins}`);
    }

    // ---------------- ronde starten ----------------
    function startRound() {
      const first = R.n === 0;
      R.n++; R.state = 'intro'; R.t = first ? 1.0 : 0; R.go = false; R.decided = false; R.pendingEnd = 0; R.falls.length = 0; R.sd = false; R.crumbles = 0;
      const a = pl[0].wins, b = pl[1].wins;
      R.decisive = a === WIN_ROUNDS - 1 && b === WIN_ROUNDS - 1;
      R.shrinkRate = R.decisive ? 0.24 : 0.14 + 0.012 * Math.min(R.n, 5);
      R.sdAt = R.decisive ? 7 : 19; R.nextBite = R.decisive ? 1.8 : 3.2; R.biteGap = R.decisive ? 1.4 : 2.0;
      for (let i = 0; i < NP; i++) { if (!first) rad[i] = 0.4; bite[i] = 0; warn[i] = 0; tgt[i] = R0; }
      pl.forEach((p, i) => {
        p.x = START[i][0] * (R.decisive ? 0.85 : 1); p.z = START[i][1]; p.vx = p.vz = 0; p.y = 0; p.vy = 0; p.mass = 1; p.heavy = 0; p.charging = false; p.chargeT = 0; p.dashCd = 0; p.dashT = 0; p.dashPow = 0; p.recover = 0; p.jumpT = -1; p.jumpCd = 0; p.stun = 0; p.falling = false; p.inWater = false; p.hidden = false; p.sc = 0.2; p.face = i ? -Math.PI / 2 : Math.PI / 2; p.spawnT = 0; p.lastHitBy = -1;
        p.c.pose = 'idle'; p.c.air = false;
      });
      if (pw) { pw = null; powerM.visible = false; } pwTimer = R.decisive ? 2.5 : 4.5;
      refreshHud();
      if (!first) { hud.showBig(R.decisive ? 'BESLISSENDE RONDE!' : `RONDE ${R.n}`, 1100, R.decisive ? '#ff7a5a' : '#bfe8ff'); audio.sfx('bell', { vol: 0.5 }); }
      if (!first || R.decisive) audio.music(R.decisive ? 'tense' : 'game_fast');
      if (!first) fx.particles.ring(0, 0.5, 0, { count: 36, speed: 6, color: 0xcfeaff, size: 0.3, life: 0.7 });
    }

    // ---------------- crumble ----------------
    function doBite(center, w, depth) {
      for (let j = -w; j <= w; j++) {
        const idx = (center + j + NP) % NP; const f = Math.cos(j / (w + 0.5) * Math.PI / 2); bite[idx] += depth * f * f; warn[idx] = 0;
      }
      const a = center / NP * TAU; const r = Math.max(rad[center], 2);
      for (let k = 0; k < 3; k++) spawnChunk(Math.sin(a + (k - 1) * 0.1) * (r - 0.3), Math.cos(a + (k - 1) * 0.1) * (r - 0.3), rand(0.7, 1.3));
      fx.particles.burst(Math.sin(a) * r, TOP, Math.cos(a) * r, { count: 26, speed: 4, up: 1.4, life: 0.8, size: 0.3, colors: [0xffffff, 0xcfeaff, 0x9fdcff], gravity: 10 });
      audio.sfx('scrape', { vol: 0.5 }); audio.sfx('thud', { vol: 0.35, rate: 1.4 }); ctx.shake(0.28); R.crumbles++;
    }
    const pendingBites = [];
    function scheduleBite() {
      // liever in de buurt van een speler dan ver weg
      const target = pick(pl.filter((p) => !p.falling)) || pl[0];
      const a = Math.atan2(target.x, target.z); let c = Math.round((a < 0 ? a + TAU : a) / (TAU / NP)) % NP;
      c = (c + Math.floor(rand(-12, 12)) + NP) % NP;
      const w = Math.floor(rand(2, 5)), depth = rand(0.6, 1.3) * (R.sd ? 1.4 : 1);
      for (let j = -w; j <= w; j++) warn[(c + j + NP) % NP] = 0.85;
      pendingBites.push({ t: 0.85, c, w, depth });
      audio.sfx('scrape', { vol: 0.25, rate: 1.8 });
    }
    function updatePlate(dt) {
      if (R.state === 'fight') {
        R.t += dt;
        if (!R.sd && R.t > R.sdAt) { R.sd = true; hud.showBig('SUDDEN DEATH!', 1300, '#ff5a5a'); hud.toast('De ijsplaat valt uit elkaar!', 2000); audio.sfx('creak', { vol: 0.6 }); ctx.shake(0.5); if (!R.decisive) audio.music('tense'); R.biteGap = 0.9; }
        R.nextBite -= dt; if (R.nextBite <= 0) { scheduleBite(); R.nextBite = R.biteGap * rand(0.8, 1.2); R.biteGap = Math.max(0.7, R.biteGap - 0.05); }
      }
      for (let k = pendingBites.length - 1; k >= 0; k--) { const b = pendingBites[k]; b.t -= dt; if (b.t <= 0) { doBite(b.c, b.w, b.depth); pendingBites.splice(k, 1); } }
      const t = R.state === 'fight' || R.state === 'end' ? R.t : 0;
      let base = R.decisive ? 7.4 : R0;
      base = Math.max(R.decisive ? 4.2 : 4.7, base - R.shrinkRate * t);
      if (R.sd) base = Math.max(2.4, base - (t - R.sdAt) * 0.55);
      for (let i = 0; i < NP; i++) {
        tgt[i] = Math.max(1.2, base - bite[i] + jit[i]);
        rad[i] = damp(rad[i], tgt[i], R.state === 'intro' ? 5 : 7, dt);
        if (warn[i] > 0) warn[i] -= dt;
      }
      updatePlateGeo();
      updateChunks(dt);
    }

    // ---------------- spelers: besturing + fysica ----------------
    const oppOf = (p) => pl[1 - p.i];
    function aimFor(p, inp) {
      const o = oppOf(p); let ax = inp.x, az = inp.y; const m = Math.hypot(ax, az);
      const dx = o.x - p.x, dz = o.z - p.z, dl = Math.hypot(dx, dz) || 1;
      if (m < 0.3) { ax = dx / dl; az = dz / dl; return [ax, az]; }
      ax /= m; az /= m;
      const dot = ax * dx / dl + az * dz / dl;   // hoek tov de tegenstander
      if (dot > 0.55) { const k = 0.55; ax = lerp(ax, dx / dl, k); az = lerp(az, dz / dl, k); const l = Math.hypot(ax, az); ax /= l; az /= l; }
      return [ax, az];
    }
    function doDash(p, charge, inp) {
      const [ax, az] = aimFor(p, inp);
      const sp = (8.5 + 9.5 * charge) * (p.heavy > 0 ? 1.12 : 1);
      p.vx = p.vx * 0.25 + ax * sp; p.vz = p.vz * 0.25 + az * sp;
      p.dashT = 0.24 + 0.2 * charge; p.dashPow = 0.3 + 0.7 * charge; p.dashCd = 0.6 + 0.9 * charge;
      if (charge > 0.6) { p.recover = 0.5; }
      p.face = Math.atan2(ax, az); p.charging = false; p.chargeT = 0;
      p.c.swing(); p.sc = 1.0; p.wob = 1;
      audio.sfx('whoosh', { vol: 0.35 + charge * 0.5, rate: 0.9 + charge * 0.3 });
      fx.particles.burst(p.x - ax * 0.6, TOP + 0.15, p.z - az * 0.6, { count: 8 + Math.round(charge * 14), speed: 3.5 + charge * 3, up: 0.5, life: 0.5, size: 0.3, colors: [0xffffff, 0xcfeaff], gravity: 5 });
    }
    function startFall(p) {
      if (p.falling) return; p.falling = true; p.fallT = 0; p.vy = 1.2; p.charging = false;
      R.falls.push({ p, t: T });
      if (R.state === 'fight' && !R.pendingEnd) { R.pendingEnd = T + 0.22; R.first = p; }
      audio.sfx('miss', { vol: 0.6 }); p.c.pose = 'scared'; p.c.air = true;
    }
    function playerStep(p, h, active) {
      const inp = input.p[p.i];
      if (p.hidden) return;
      const grounded = p.y < 0.3 && !p.falling && !p.inWater;
      // ----- besturing
      if (active && !p.falling) {
        const busy = p.recover > 0 || p.stun > 0;
        // opladen / duwen
        if (!busy && grounded && p.dashCd <= 0 && inp.aP && !p.charging) { p.charging = true; p.chargeT = 0; }
        if (p.charging) {
          p.chargeT = Math.min(CHARGE_MAX, p.chargeT + h);
          if (!inp.a || busy || !grounded) { if (!busy && grounded) doDash(p, p.chargeT / CHARGE_MAX < 0.18 ? 0.0 : p.chargeT / CHARGE_MAX, inp); else { p.charging = false; p.chargeT = 0; } }
        }
        if (!busy && inp.bP && p.jumpCd <= 0 && p.jumpT < 0 && !p.falling) { p.jumpT = 0; p.jumpCd = 1.1; p.charging = false; p.chargeT = 0; p.c.jump(); audio.sfx('jump', { vol: 0.5 }); fx.particles.dust(p.x, TOP, p.z, 4, 0xffffff); }
        // bewegen
        if (!busy) {
          const k = (p.charging ? 0.5 : 1) * (grounded ? 1 : 0.4) * (p.heavy > 0 ? 0.85 : 1);
          p.vx += inp.x * ACC * k * h; p.vz += inp.y * ACC * k * h;
          if (inp.mag > 0.3 && !p.charging) p.face = Math.atan2(inp.x, inp.y);
          if (p.charging) { const o = oppOf(p); p.face = Math.atan2(o.x - p.x, o.z - p.z); }
        }
      }
      // ----- sprong
      if (p.jumpT >= 0) {
        p.jumpT += h; const k = p.jumpT / 0.62;
        if (k >= 1) { p.jumpT = -1; p.y = 0; stamp(p); } else p.y = 1.5 * Math.sin(k * Math.PI);
      }
      // ----- wrijving
      let mu = MU;
      if (R.state === 'end' && !p.falling && !p.inWater) mu = 5;
      else if (p.jumpT >= 0) mu = 0.3; else if (p.stun > 0 || p.recover > 0) mu = 0.85;
      if (p.falling) mu = 0.4;
      const f = Math.exp(-mu * h); p.vx *= f; p.vz *= f;
      const sp = Math.hypot(p.vx, p.vz); if (sp > MAXV) { p.vx *= MAXV / sp; p.vz *= MAXV / sp; }
      p.x += p.vx * h; p.z += p.vz * h;
      // ----- vallen
      if (!p.falling && p.jumpT < 0 && p.y < 0.3 && R.state !== 'intro') {
        const d = Math.hypot(p.x, p.z); if (d > radiusAt(p.x, p.z) + 0.12) startFall(p);
      }
      if (p.falling && !p.inWater) {
        p.fallT += h; p.vy -= 24 * h; p.y += p.vy * h;
        if (p.y < -0.55) { p.inWater = true; p.y = -0.55; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; splashAt(p.x, p.z, 1.2); audio.sfx('splash', { vol: 1 }); audio.sfx('splash', { vol: 0.6, rate: 0.7 }); ctx.shake(0.75); W.splashReact(p.x, p.z); p.c.pose = 'hands_up'; p.c.air = false; if (R.state === 'fight' && R.first === p) { /* verlies bepaald in updateRound */ } }
      }
      if (p.inWater) { p.fallT += h; p.y = -0.95 + Math.sin(T * 5 + p.i) * 0.08 - Math.max(0, p.fallT - 3.2) * 0.9; }
    }
    function stamp(p) {
      const o = oppOf(p); fx.particles.ring(p.x, TOP + 0.1, p.z, { count: 18, speed: 5, color: 0xffffff, size: 0.28, life: 0.4 }); audio.sfx('land', { vol: 0.6 });
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (d < 2.3 && o.y < 0.4 && !o.falling && !o.inWater) { const k = 5.5 / (o.mass); o.vx += dx / d * k; o.vz += dz / d * k; o.stun = Math.max(o.stun, 0.25); ctx.shake(0.35); audio.sfx('hit', { vol: 0.6 }); o.lastHitBy = p.i; }
    }
    function collide(a, b) {
      if (a.falling || b.falling || a.hidden || b.hidden || a.inWater || b.inWater) return;
      if (a.y > 0.5 || b.y > 0.5) return;
      const dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz) || 1e-4; const minD = PR * (a.sc + b.sc) * 0.5 * 2 / 1.0;
      if (d >= minD) return;
      const nx = dx / d, nz = dz / d;
      const ma = a.mass * (1 + 1.2 * (a.dashT > 0 ? a.dashPow : 0)), mb = b.mass * (1 + 1.2 * (b.dashT > 0 ? b.dashPow : 0));
      // overlap oplossen
      const over = minD - d; const wa = (1 / ma) / (1 / ma + 1 / mb), wb = 1 - wa;
      a.x -= nx * over * wa; a.z -= nz * over * wa; b.x += nx * over * wb; b.z += nz * over * wb;
      const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vrel > 0) {
        const e = 0.25; const j = (1 + e) * vrel / (1 / ma + 1 / mb);
        a.vx -= j / ma * nx; a.vz -= j / ma * nz; b.vx += j / mb * nx; b.vz += j / mb * nz;
        // extra schop voor wie duwt
        for (const [x, y, kx, kz] of [[a, b, nx, nz], [b, a, -nx, -nz]]) if (x.dashT > 0) { const kick = (0.8 + 7 * x.dashPow) / y.mass; y.vx += kx * kick; y.vz += kz * kick; y.stun = Math.max(y.stun, 0.12 + 0.3 * x.dashPow); y.lastHitBy = x.i; x.dashT = Math.min(x.dashT, 0.06); }
        const imp = Math.min(1, vrel / 14);
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        fx.particles.burst(cx, TOP + 1.0, cz, { count: 10 + Math.round(imp * 26), speed: 3 + imp * 6, up: 1, life: 0.7, size: 0.3, colors: [0xffffff, 0xcfeaff, 0x9fdcff, 0xffe14a], gravity: 8 });
        fx.particles.ring(cx, TOP + 0.4, cz, { count: 14, speed: 5, color: 0xffffff, size: 0.25, life: 0.35 });
        audio.sfx('hit', { vol: 0.5 + imp * 0.5 }); if (imp > 0.35) audio.sfx('thud', { vol: imp });
        ctx.shake(0.15 + imp * 0.55); if (imp > 0.55) freeze = Math.max(freeze, 0.07);
        if (imp > 0.4) fx.texts.add(imp > 0.75 ? 'BOEM!' : 'PATS!', cx, 3.2, cz, imp > 0.75 ? '#ffd24a' : '#ffffff', 0.8 + imp * 0.5);
        a.wob = 1; b.wob = 1; a.sc = 1.1; b.sc = 1.1;
      }
    }

    // ---------------- power-ups ----------------
    function updatePower(dt) {
      if (R.state !== 'fight') return;
      if (!pw) {
        pwTimer -= dt;
        if (pwTimer <= 0) {
          const maxR = Math.max(2, Math.min(...Array.from({ length: 8 }, (_, k) => radiusAt(Math.sin(k / 8 * TAU), Math.cos(k / 8 * TAU)))) - 2.0);
          const a = rand(0, TAU), r = rand(1.2, Math.max(1.5, maxR));
          pw = { x: Math.sin(a) * r, z: Math.cos(a) * r, life: 8, t: 0 }; powerM.visible = true; powerM.position.set(pw.x, TOP, pw.z);
          fx.particles.ring(pw.x, TOP + 0.3, pw.z, { count: 16, speed: 3, color: 0x9fe8ff, size: 0.25, life: 0.5 }); audio.sfx('sparkle', { vol: 0.5 });
          hud.toast('Een ijsbloem! Pak hem voor extra gewicht', 1600);
        }
        return;
      }
      pw.t += dt; pw.life -= dt;
      powerM.rotation.y += dt * 2; powerM.position.y = TOP + 0.12 + Math.sin(pw.t * 3) * 0.12; powerM.visible = pw.life > 2 || Math.sin(pw.life * 18) > 0;
      if (Math.random() < dt * 8) fx.particles.emit(pw.x + (Math.random() - 0.5), TOP + 0.6 + Math.random(), pw.z + (Math.random() - 0.5), 0, 0.8, 0, { life: 0.7, size: 0.22, color: 0xcff4ff, gravity: -0.5 });
      // buiten de plaat gevallen?
      if (Math.hypot(pw.x, pw.z) > radiusAt(pw.x, pw.z) - 0.6) pw.life = 0;
      for (const p of pl) {
        if (p.falling || p.hidden || p.inWater || p.y > 0.6) continue;
        if (Math.hypot(p.x - pw.x, p.z - pw.z) < 1.35) {
          p.heavy = 6.5; p.mass = 2.2; audio.sfx('powerup', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.6 });
          fx.particles.burst(p.x, TOP + 1, p.z, { count: 40, speed: 5, up: 1.4, life: 0.9, size: 0.35, colors: [0xffffff, 0x9fe8ff, 0x6fc8ff], gravity: 4 });
          fx.texts.add('ZWAAR!', p.x, 4.1, p.z, '#9fe8ff', 1.3); pw = null; powerM.visible = false; pwTimer = rand(6, 9); break;
        }
      }
      if (pw && pw.life <= 0) { pw = null; powerM.visible = false; pwTimer = rand(4, 6); }
    }

    // ---------------- visuals voor spelers ----------------
    function visuals(dt) {
      pl.forEach((p, i) => {
        const hold = p.holder, c = p.c;
        p.sc = damp(p.sc, (p.heavy > 0 ? 1.3 : 1) * 1.0, p.spawnT > 0 ? 8 : 9, dt);
        const S = 1.25 * p.sc * (p.hidden ? 0 : 1);
        hold.visible = !p.hidden && S > 0.01; hold.scale.setScalar(Math.max(0.01, S));
        hold.position.set(p.x, TOP + p.y, p.z);
        c.faceDir(Math.sin(p.face), Math.cos(p.face));
        const sp = Math.hypot(p.vx, p.vz);
        const inp = input.p[i];
        c.speed = p.falling || p.inWater ? 0 : clamp(inp.mag * (p.recover > 0 || p.stun > 0 ? 0.3 : 1), 0, 1);
        c.air = (p.y > 0.3 || p.falling) && !p.inWater;
        if (!p.falling && !p.inWater) {
          if (p.charging) c.pose = 'push'; else if (p.stun > 0 || p.recover > 0) c.pose = 'scared'; else if (p.dashT > 0) c.pose = 'push'; else if (R.state === 'end' || done) c.pose = p.cheer ? 'cheer' : 'sad'; else c.pose = 'idle';
        }
        c.update(dt);
        // wiebelen / leunen met de snelheid (ijs!)
        p.wob = damp(p.wob, 0, 5, dt);
        const lean = clamp(sp * 0.035, 0, 0.45);
        const vx = p.vx, vz = p.vz; const l = Math.hypot(vx, vz) || 1;
        hold.rotation.set(p.falling ? p.fallT * 5 : (vz / l) * lean + Math.sin(T * 30) * 0.08 * p.wob, 0, p.falling ? p.fallT * 3 : -(vx / l) * lean + Math.cos(T * 26) * 0.08 * p.wob);
        // aura / kristallen
        p.heavy = Math.max(0, p.heavy - (R.state === 'fight' ? dt : 0));
        if (p.heavy <= 0 && p.mass > 1) { p.mass = 1; fx.particles.burst(p.x, TOP + 1, p.z, { count: 16, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0xcff4ff], gravity: 4 }); }
        p.aura.visible = p.heavy > 0 && !p.hidden; p.crystals.visible = p.aura.visible; if (p.aura.visible) { p.aura.scale.setScalar(1 + Math.sin(T * 9) * 0.05); p.aura.material.opacity = p.heavy < 1.5 ? (Math.sin(T * 26) > 0 ? 0.18 : 0.04) : 0.16; }
        // ringen
        const grounded = p.y < 0.3 && !p.falling && !p.inWater && !p.hidden;
        p.ringR.visible = grounded; p.ringR.position.set(p.x, TOP + 0.04, p.z);
        p.ringR.material.opacity = p.dashCd > 0 ? 0.28 : 0.9; p.ringR.scale.setScalar((p.dashCd > 0 ? 0.9 : 1 + Math.sin(T * 7 + i) * 0.04) * p.sc * (p.heavy > 0 ? 1.15 : 1));
        p.chargeR.visible = p.charging && grounded; if (p.charging) {
          p.tickT = (p.tickT || 0) - dt; if (p.tickT <= 0) { p.tickT = 0.09; audio.tone(220 + (p.chargeT / CHARGE_MAX) * 700, 0.1, { type: 'triangle', vol: 0.07 }); } const k = p.chargeT / CHARGE_MAX; p.chargeR.position.set(p.x, TOP + 0.06, p.z); p.chargeR.scale.setScalar(1.1 + k * 1.4); p.chargeR.material.color.setHSL(0.15 - k * 0.15, 1, 0.55 + (1 - k) * 0.2); if (Math.random() < dt * 30) fx.particles.emit(p.x + Math.cos(T * 20) * 1.6, TOP + 0.3, p.z + Math.sin(T * 20) * 1.6, -Math.cos(T * 20) * 2, 0.8, -Math.sin(T * 20) * 2, { life: 0.3, size: 0.2, color: 0xffffff, gravity: 0 }); }
        p.blob.visible = grounded || (p.y > 0.3 && p.jumpT >= 0); p.blob.position.set(p.x, TOP + 0.04, p.z); p.blob.scale.setScalar(Math.max(0.4, 1.15 - p.y * 0.3) * p.sc);
        p.tag.visible = !p.hidden && !p.inWater; p.tag.position.set(p.x, hold.position.y + c.height * 1.25 * p.sc + 0.9, p.z);
        // sneeuwspray tijdens glijden
        if (grounded && sp > 6 && Math.random() < dt * (sp * 1.5)) fx.particles.emit(p.x - p.vx * 0.05, TOP + 0.1, p.z - p.vz * 0.05, -p.vx * 0.15 + (Math.random() - 0.5), 0.8, -p.vz * 0.15 + (Math.random() - 0.5), { life: 0.45, size: 0.26, color: 0xffffff, gravity: 3 });
        if (p.dashT > 0) { p.dashT -= dt; if (Math.random() < dt * 40) fx.particles.emit(p.x, TOP + 0.5, p.z, 0, 0.3, 0, { life: 0.3, size: 0.4, color: PLAYER_COLORS[i], gravity: 0 }); }
        p.dashCd = Math.max(0, p.dashCd - dt); p.jumpCd = Math.max(0, p.jumpCd - dt); p.recover = Math.max(0, p.recover - dt); p.stun = Math.max(0, p.stun - dt);
        if (p.spawnT > 0) p.spawnT -= dt;
      });
    }

    // ---------------- rondebeheer ----------------
    function updateRound(dt) {
      R.t2 = (R.t2 || 0) + dt;
      if (R.state === 'intro') {
        R.t += dt;
        if (R.t > 1.3 && !R.go) { R.go = true; R.state = 'fight'; R.t = 0; hud.showBig('GA!', 600, '#ffe14a'); audio.sfx('go'); }
      } else if (R.state === 'fight') {
        if (!R.pendingEnd && pl.every((p) => p.falling)) R.pendingEnd = T;
        if (R.pendingEnd && T >= R.pendingEnd) endRound();
      } else if (R.state === 'end') {
        R.endT -= dt;
        if (R.endT <= 0) { if (R.matchOver) finishMatch(); else { R.go = false; startRound(); } }
      }
    }
    function endRound() {
      R.state = 'end'; R.endT = 2.3; R.t = R.t || 0;
      const fallen = [...new Set(R.falls.map((f) => f.p))];
      if (fallen.length >= 2) {
        // gelijkspel
        R.replays++;
        hud.showBig('GELIJKSPEL!', 1200, '#ffd24a'); hud.toast('Allebei in het water! Opnieuw...', 1800); audio.sfx('lose', { vol: 0.5 });
        R.n--; R.endT = 2.2;
        if (R.replays >= 3) { /* te vaak: beide krijgen niets, maar we gaan door */ }
        refreshHud(); return;
      }
      const loser = fallen[0], winner = oppOf(loser);
      winner.wins++; winner.cheer = true; loser.cheer = false; roundsPlayed++;
      winner.c.pose = 'cheer'; audio.sfx('win', { vol: 0.5 }); W.cheer();
      const lead = Math.abs(pl[0].wins - pl[1].wins);
      hist.push([pl[0].wins, pl[1].wins]);
      const over = winner.wins >= WIN_ROUNDS;
      if (!over) maxLeadBeforeFinal = Math.max(maxLeadBeforeFinal, lead);
      const jokes = [`${winner.c === pl[0].c ? names[0] : names[1]} wint ronde ${R.n}!`, `Plons! ${names[loser.i]} neemt een duik.`, `${names[loser.i]} is een ijsklontje.`];
      hud.showBig(over ? 'KAMPIOEN!' : `${names[winner.i]} wint!`, 1500, winner.i ? '#4a8cff' : '#35c46f');
      if (!over) hud.toast(pick(jokes), 1800);
      pl.forEach((q) => { q.charging = false; });
      refreshHud();
      if (over) { R.matchOver = true; R.endT = 2.4; }
    }
    function finishMatch() {
      if (done) return; done = true;
      const w = pl[0].wins > pl[1].wins ? pl[0] : pl[1], l = oppOf(w);
      const rounds = pl[0].wins + pl[1].wins;
      const spannend = rounds >= MAX_ROUNDS || maxLeadBeforeFinal <= 1;
      let stars = 1; if (spannend) stars++; if (l.wins >= 2) stars++;
      const champ = names[w.i], other = names[l.i];
      const jokes = [
        `${champ} is de nieuwe IJs-Sumo-kampioen! Zijn buik is breder dan de ijsplaat.`,
        `Kampioen ${champ}! ${other} heeft dit jaar al genoeg gezwommen.`,
        `Alle pinguïns joelen voor ${champ}. ${other} droogt nog even af.`,
        `${champ} glijdt als een echte sneeuwprins naar de titel! ${other} is nu een ijsklontje.`,
      ];
      const w3 = pl.map((p) => p.wins);
      pl.forEach((p) => { p.c.pose = p === w ? 'cheer' : 'sad'; p.cheer = p === w; });
      w.hidden = false;
      for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst(w.x + rand(-4, 4), 4 + rand(0, 3), w.z + rand(-3, 3), { count: 36, speed: 7, up: 1.2, life: 1.5, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 250);
      ctx.finish({ stars, score: w3[0] * 10 + w3[1], delay: 1700, summary: `<b>${names[0]} ${w3[0]} – ${w3[1]} ${names[1]}</b><br>${pick(jokes)}${stars === 3 ? '<br>Wat een spannende finale!' : ''}` });
    }

    // ---------------- camera ----------------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), wantP = new THREE.Vector3(), wantL = new THREE.Vector3(), introP = new THREE.Vector3(), introL = new THREE.Vector3();
    let blend = 1;   // 1 = filmische blik naar de lucht (noorderlicht), 0 = spelcamera
    function cam(dt, cine = 0) {
      const alive = pl.filter((p) => !p.hidden && !p.inWater);
      let cx = 0, cz = 0; if (alive.length) { for (const p of alive) { cx += p.x; cz += p.z; } cx /= alive.length; cz /= alive.length; }
      const shrink = clamp((R0 - (R.state === 'intro' ? R0 : Math.min(...Array.from(rad)))) / 5, 0, 1);
      const zoom = lerp(1.0, 0.82, smoothstep(0, 1, shrink * 0.8));
      wantP.set(cx * 0.2, 12.6 * zoom + 0.5, 17.6 * zoom + cz * 0.2); wantL.set(cx * 0.3, 0.6, cz * 0.3);
      blend = damp(blend, cine, cine > 0.2 ? 1.2 : 2.4, dt);
      const sway = Math.sin(introT * 0.35) * 3;
      introP.set(sway, 4.2, 23); introL.set(sway * 0.4, 11, -40);
      const gp = wantP.clone().lerp(introP, blend), gl = wantL.clone().lerp(introL, blend);
      if (!camP.lengthSq()) { camP.copy(gp); camL.copy(gl); }
      const f = 1 - Math.exp(-5 * dt); camP.lerp(gp, f); camL.lerp(gl, f);
      camera.position.copy(camP); camera.lookAt(camL);
      // noorderlicht kleurt het licht
      const k = 0.5 + 0.5 * Math.sin(T * 0.4 + introT * 0.4); L.hemi.color.setRGB(lerp(0.65, 0.5, k), lerp(0.82, 0.95, k), lerp(1.0, 0.9, k));
    }

    // ---------------- loop ----------------
    function step(dt) {
      if (freeze > 0) { freeze -= dt; return; }
      const active = R.state === 'fight';
      const n = Math.ceil(dt / 0.0125), h = dt / n;
      for (let s = 0; s < n; s++) {
        for (const p of pl) playerStep(p, h, active);
        collide(pl[0], pl[1]);
      }
    }
    function common(dt) {
      updatePlate(dt); visuals(dt); updatePower(dt);
      W.update(T + introT, dt, camera.position);
      cam(dt, 0);
    }
    function update(dt) {
      if (done) { resultUpdate(dt); return; }
      T += dt;
      if (R.n === 0) startRound();
      updateRound(dt);
      step(dt);
      common(dt);
    }
    function resultUpdate(dt) { T += dt; step(dt); updatePlate(dt); visuals(dt); updatePower(dt); W.update(T + introT, dt, camera.position); cam(dt, 0.55); }
    function introUpdate(dt) { introT += dt; pl.forEach((p) => { p.c.pose = 'idle'; }); visuals(dt); for (let i = 0; i < NP; i++) rad[i] = damp(rad[i], R0, 3, dt); updatePlateGeo(); W.update(introT, dt, camera.position); cam(dt, 1); }

    // plaat vullen zodat de intro direct goed uitziet
    for (let i = 0; i < NP; i++) rad[i] = R0; updatePlateGeo();
    pl.forEach((p) => { p.sc = 1; });
    refreshHud(); common(0.016);
    return {
      update, resultUpdate, introUpdate,
      onStart() { /* ronde 1 start in update */ },
      onCountdown() { refreshHud(); },
      dispose() { pendingBites.length = 0; },
      dbg: {
        state: () => ({ T, round: R.n, rstate: R.state, rt: R.t, wins: pl.map((p) => p.wins), done, sd: R.sd, crumbles: R.crumbles, replays: R.replays, hist, pw: pw ? { x: pw.x, z: pw.z } : null, minR: Math.min(...Array.from(rad)), maxR: Math.max(...Array.from(rad)),
          p: pl.map((p) => ({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, y: p.y, falling: p.falling, inWater: p.inWater, charging: p.charging, dashCd: p.dashCd, jumpCd: p.jumpCd, heavy: p.heavy, stun: p.stun, hidden: p.hidden })) }),
        radiusAt, players: pl,
      },
    };
  },
};

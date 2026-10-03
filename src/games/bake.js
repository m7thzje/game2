import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, shuffle, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, makeNPC, PLAYER_COLORS, Animal, Dragon } from '../engine/chars.js';
import { buildStage, KINDS, KIND, ST, itemGeo, layerGeo, sprinkleGeo, drawIcon, labelTex, matVC } from './bake_world.js';

// Taartenbakkers-Battle — duel: twee keukenstations, één bestelbonnetje. Bouw dezelfde taart sneller en mooier dan je broer.
//  * lopen = richtingen, A = pakken/neerleggen/in de oven/strooien, B = oven leeghalen, BEL (taart klaar) of bloemzak gooien
//  * bij de scheidingsbank in het midden: A = ingrediënt STELEN (of de gouden ster grijpen), B = BLOEMZAK (scherm wit)
//  * Koning Klopper geeft sterren (nauwkeurigheid, versiering, bakstand) + tempo. 3 bestellingen, de laatste telt dubbel.
//  * gimmicks: een kip springt in je taart, een draak stookt de oven op, een gouden ster op de bank

const R_TIME = [22, 26, 30], N_LAY = [3, 4, 5], ROUNDS = 3;
const BAKE_MAX = 6.0, HEAT_T = 9, HEAT_MUL = 2.2, FLOUR_T = 3.4;
const SP = 6.4;
const CUSTOMERS = ['farmer', 'witch', 'princess', 'guard', 'dwarf', 'elder', 'jester', 'kid', 'fisher', 'bard'];
const WIN_TXT = ['Wat een taart!', 'De jury likt zijn vingers af.', 'Zelfs de kip is jaloers.'];
const GAUGE = [[0, 2.0, '#d84a3a'], [2.0, 3.0, '#f0a030'], [3.0, 3.5, '#d8e050'], [3.5, 4.2, '#3ad85a'], [4.2, 4.8, '#d8e050'], [4.8, 5.5, '#f0a030'], [5.5, 6.0, '#2a2a2a']];
const bakeStars = (t) => (t < 2.0 ? 1 : t < 3.0 ? 2 : t < 3.5 ? 4 : t < 4.2 ? 5 : t < 4.8 ? 3 : t < 5.5 ? 2 : 1);
const bakeColor = (t) => { const k = clamp(t / BAKE_MAX, 0, 1); const a = new THREE.Color(0xf4e2b0), b = new THREE.Color(0xd8964a), c = new THREE.Color(0x2a1a10); return k < 0.62 ? a.lerp(b, k / 0.62) : b.lerp(c, clamp((k - 0.62) / 0.3, 0, 1)); };
const _c = new THREE.Color();

function starPath(g, cx, cy, r, fill) {
  g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.45 : r, a = k / 10 * TAU - Math.PI / 2; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath();
  g.fillStyle = fill ? '#ffcf3a' : 'rgba(255,255,255,.18)'; g.fill(); g.strokeStyle = '#3a2410'; g.lineWidth = 3; g.stroke();
}
const orderName = (rec) => { const f = ['aardbei', 'choco', 'glazuur', 'room'].find((k) => rec.includes(k)); const base = { aardbei: 'Aardbeientaart', choco: 'Chocoladetaart', glazuur: 'Glazuurtaart', room: 'Slagroomtaart' }[f] || 'Taart'; return rec[rec.length - 1] === 'kers' ? base + ' met kers' : base; };

export default {
  id: 'bake',
  name: 'Taartenbakkers-Battle',
  giver: 'Koning Klopper',
  icon: '🎂',
  mode: 'pvp',
  time: 90,
  music: 'game',
  blurb: 'Bake Off op de kermis! Jullie krijgen <b>hetzelfde bonnetje</b>: bak de <b>bodem</b> in de oven, stapel de lagen in de goede volgorde en <b>bel</b>. Koning Klopper geeft sterren. 3 bestellingen, de laatste telt <b>dubbel</b>.',
  controls: ['{move} lopen', '{a} pakken / neerleggen / strooien', '{b} oven leeg / BEL / (bij de bank) bloemzak'],
  tip: 'Bij de bank in het midden pak je met {a} de gouden ster of steel je een ingrediënt!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const SLIP = pv.slip || 0, GR = pv.gravity || 1;
    const L = ctx.lights('indoor', { shadow: 17, center: [0, 0, 0], fogNear: 60, fogFar: 140 });
    L.sun.position.set(6, 26, 16); L.sun.intensity = 1.5; L.hemi.intensity = 1.5;
    const W = buildStage(ctx);

    // ---------------- gedeelde modellen ----------------
    const matGold = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.7, emissive: 0x664400, emissiveIntensity: 0.6 });
    const sprGeo = sprinkleGeo();
    // jury: Koning Klopper op zijn troon
    const jury = makeNPC('baker', { hat: 'crown', shirt: 0x7a2fd4, apron: null, cape: 0xc8302a, beard: 'full', hair: 0xdddddd, bodyW: 1.5, scale: 1.2, beardColor: 0xdddddd });
    const juryH = new THREE.Group(); juryH.add(jury.group); juryH.scale.setScalar(2.7 / jury.height); juryH.position.set(0, 1.3, 4.85); jury.faceDir(0, 1); jury.yaw = jury.targetYaw; jury.group.rotation.y = jury.yaw; jury.pose = 'sit'; scene.add(juryH);
    // klanten (één zichtbaar)
    const custKinds = shuffle([...CUSTOMERS]).slice(0, ROUNDS);
    const custs = custKinds.map((k) => { const c = makeNPC(k); const h = new THREE.Group(); h.add(c.group); h.scale.setScalar(2.7 / c.height); h.position.set(0, 1.12, -3.9); h.visible = false; c.faceDir(0, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(h); return { c, h }; });
    const bubble = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.8), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })); bubble.position.set(0, 4.45, -4.45); bubble.renderOrder = 5; scene.add(bubble);
    const bCv = document.createElement('canvas'); bCv.width = 512; bCv.height = 184; const bTex = new THREE.CanvasTexture(bCv); bTex.colorSpace = THREE.SRGBColorSpace; bubble.material.map = bTex; const bG = bCv.getContext('2d');
    // schaduw-/hulpvlakken
    const pointer = (col) => new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));

    // ---------------- spelers / stations ----------------
    const S = players.map((pp, i) => {
      const sd = i ? 1 : -1; const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group);
      const sc = (3.0 / c.height) * Math.pow(pv.size(i), 0.8); holder.scale.setScalar(sc); scene.add(holder);
      c.faceDir(-sd, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const ring = pointer(pp.color); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.scale.setScalar(1.3); scene.add(ring);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(' '), transparent: true, depthTest: false })); lab.scale.set(5.2, 0.65, 1); lab.renderOrder = 15; scene.add(lab);
      const held = new THREE.Mesh(itemGeo('deeg'), matVC); held.visible = false; held.castShadow = true; scene.add(held);
      const cakeG = new THREE.Group(); cakeG.position.set(sd * ST.plateP, 1.04, ST.plateZ); scene.add(cakeG);
      const spr = new THREE.InstancedMesh(sprGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 40); spr.count = 0; spr.frustumCulled = false; spr.userData.dynamic = true; cakeG.add(spr);
      const goldM = new THREE.Mesh(itemGeo('gold'), matGold); goldM.visible = false; goldM.scale.setScalar(1.1); cakeG.add(goldM);
      const doneRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 28), new THREE.MeshBasicMaterial({ color: 0x7affb0, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })); doneRing.rotation.x = -Math.PI / 2; doneRing.position.y = -0.02; cakeG.add(doneRing);
      // oven: deeg + meter
      const ov = W.ovens[i];
      const dough = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf4e2b0, roughness: 0.8 })); dough.scale.set(1.1, 0.7, 1); dough.position.set(ov.x, 1.3, ov.z + 0.7); dough.visible = false; scene.add(dough);
      const gCv = document.createElement('canvas'); gCv.width = 512; gCv.height = 96; { const g = gCv.getContext('2d'); g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 512, 96); GAUGE.forEach(([a, b, col]) => { g.fillStyle = col; g.fillRect(8 + a / BAKE_MAX * 496, 14, (b - a) / BAKE_MAX * 496, 52); }); g.fillStyle = '#fff'; g.font = 'bold 20px Fredoka, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('RAUW', 8 + 1.0 / 6 * 496, 88); g.fillText('PERFECT', 8 + 3.85 / 6 * 496, 88); g.fillText('BRAND', 8 + 5.75 / 6 * 496, 88); }
      const gTex = new THREE.CanvasTexture(gCv); gTex.colorSpace = THREE.SRGBColorSpace;
      const gauge = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.52), new THREE.MeshBasicMaterial({ map: gTex, transparent: true })); gauge.position.set(ov.x, 3.95, ov.z + 1.0); gauge.visible = false; gauge.renderOrder = 6; scene.add(gauge);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })); needle.visible = false; needle.renderOrder = 7; scene.add(needle);
      // bonnetje
      const tCv = document.createElement('canvas'); tCv.width = 640; tCv.height = 250; tCv.getContext('2d'); const tTex = new THREE.CanvasTexture(tCv); tTex.colorSpace = THREE.SRGBColorSpace;
      const ticket = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.0), new THREE.MeshBasicMaterial({ map: tTex })); ticket.position.set(sd * 7.3, 4.0, ST.wallZ + 0.2); scene.add(ticket);
      // bloemwolk (scherm wit)
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.96)'); gr.addColorStop(1, 'rgba(255,255,255,.0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, opacity: 0, depthTest: false, depthWrite: false })); fl.renderOrder = 30; fl.visible = false; fl.frustumCulled = false; scene.add(fl);
      return { i, sd, c, holder, ring, lab, held, cakeG, spr, goldM, doneRing, dough, gauge, needle, gCv, ticket, tCv, tTex, tG: tCv.getContext('2d'), fl, ov, sc,
        x: sd * 7.8, z: 2.0, vx: 0, vz: 0, hold: null, layers: [], meshes: [], sprN: 0, gold: false, served: false, servedFrac: 0, first: false, mistakes: 0,
        oven: { st: 'empty', t: 0, heat: 1, heatT: 0, burnt: false, q: 1 }, cdFlour: 0, cdSteal: 0, flour: 0, blocked: false, lastLab: '', spin: 0, tot: 0, res: null, speedSum: 0, acts: 0, fireT: 0 };
    });

    for (const sd of [-1, 1]) for (const k of KINDS) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(KIND[k].name, '#ffffff', 256, 64, 40), transparent: true, depthTest: false })); sp.scale.set(1.6, 0.4, 1); sp.position.set(sd * ST.crateP[k], 2.95, ST.crateZ + 0.2); sp.renderOrder = 8; scene.add(sp); }
    // ---------------- toestand ----------------
    let ph = 'intro', phT = 0, round = 0, roundLeft = R_TIME[0], T = 0, introT = 0, finished = false, started = false, hurry = false, firstServed = -1, over = false;
    let recipe = [], N = 3; let patience = 1, stage = 0, bubT = 0;
    const gold = { on: false, t: 0, m: new THREE.Mesh(itemGeo('gold'), matGold), taken: false }; gold.m.visible = false; gold.m.scale.setScalar(1.6); scene.add(gold.m);
    const goldGlow = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })); goldGlow.rotation.x = -Math.PI / 2; goldGlow.visible = false; scene.add(goldGlow);
    const chick = { on: false, st: '', t: 0, tgt: 0, a: new Animal('chicken'), x: 0, z: 0, y: 0, vy: 0, fx: 0, fz: 0 }; chick.a.group.scale.setScalar(2.3); chick.a.group.visible = false; scene.add(chick.a.group);
    const drag = { on: false, st: '', t: 0, tgt: 0, d: new Dragon(0x7a2fd4, 0.5) }; drag.d.group.visible = false; scene.add(drag.d.group);
    const bag = { on: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), tgt: 0, m: mesh(new THREE.SphereGeometry(0.4, 8, 6), mat(0xf4ecd8, { flatShading: false }), { cast: false }) }; bag.m.visible = false; scene.add(bag.m);
    const plan = []; let judgeData = null, judgeT = 0, juryLine = '';
    const stats = { golds: [0, 0], steals: [0, 0], flours: [0, 0], chickens: 0, dragons: 0, perfects: [0, 0], shoos: [0, 0], pecks: 0, serves: [0, 0] };
    const hint = () => hud.setHint(null);

    // ---------------- camera ----------------
    const tgt = new THREE.Vector3(0, 1.8, 0.8), PITCH = 0.6, camDir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)); let camD = 24, punch = 0;
    const fitPts = [[-12.4, 0, 3.4], [12.4, 0, 3.4], [-12.4, 5.5, -4.7], [12.4, 5.5, -4.7], [-2.2, 0, 5.3], [2.2, 0, 5.3], [-12.4, 0, -4.7], [12.4, 0, -4.7]];
    function fitCamera() {
      const v = new THREE.Vector3(); let lo = 10, hi = 90;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(camDir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.97 || v.y > 0.78 || v.y < -0.95) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camD = hi;
    }
    camera.fov = 46; camera.aspect = (ctx.renderer.domElement.width || 1100) / (ctx.renderer.domElement.height || 650); camera.updateProjectionMatrix(); fitCamera();

    // ---------------- bonnetje / bubbel tekenen ----------------
    function drawTicket(s) {
      const g = s.tG, w = 640, h = 250;
      g.fillStyle = '#fffbe8'; g.fillRect(0, 0, w, h); g.strokeStyle = players[s.i].css; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#3a2410'; g.font = 'bold 32px Fredoka, Arial Black, sans-serif'; g.textAlign = 'left'; g.fillStyle = players[s.i].css; g.fillText(names[s.i], 22, 44); g.fillStyle = '#3a2410';
      g.textAlign = 'right'; g.fillStyle = '#a03a1a'; g.fillText(orderName(recipe), w - 22, 44);
      const step = Math.min(118, 580 / N), x0 = (w - step * (N - 1)) / 2;
      for (let k = 0; k < N; k++) {
        const x = x0 + k * step, y = 128; const done = s.layers[k] ? s.layers[k].k === recipe[k] : false, wrong = s.layers[k] && !done, next = k === s.layers.length;
        if (next) { g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(x, y, 50, 0, TAU); g.fill(); }
        else if (done) { g.fillStyle = '#b8f0c0'; g.beginPath(); g.arc(x, y, 50, 0, TAU); g.fill(); }
        else if (wrong) { g.fillStyle = '#ffb8b8'; g.beginPath(); g.arc(x, y, 50, 0, TAU); g.fill(); }
        drawIcon(g, recipe[k], x, y, 36);
        g.fillStyle = '#3a2410'; g.textAlign = 'center'; g.font = 'bold 24px Fredoka, Arial, sans-serif'; g.fillText(KIND[recipe[k]].name, x, 214);
        g.font = 'bold 22px Fredoka, Arial'; g.fillStyle = '#7a5a3a'; g.fillText(String(k + 1), x - 46, 86);
        if (done) { g.strokeStyle = '#1a9a3a'; g.lineWidth = 7; g.beginPath(); g.moveTo(x + 14, y + 22); g.lineTo(x + 28, y + 38); g.lineTo(x + 52, y + 4); g.stroke(); }
      }
      s.tTex.needsUpdate = true;
    }
    function drawBubble() {
      const g = bG, w = 512, h = 184; g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#3a2410'; g.lineWidth = 8; g.beginPath(); g.roundRect(8, 8, w - 16, h - 40, 30); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 20, h - 33); g.lineTo(w / 2, h - 2); g.lineTo(w / 2 + 22, h - 33); g.closePath(); g.fillStyle = '#fff'; g.fill();
      g.fillStyle = '#3a2410'; g.textAlign = 'center'; g.font = 'bold 36px Fredoka, Arial Black, sans-serif';
      const says = ['Mag ik een ' + orderName(recipe).toLowerCase() + '?', 'Ik heb best trek...', 'Schiet nou eens op!', 'GRRR! ZO BOOS!'][stage];
      g.fillText(says, w / 2, 62, w - 40);
      g.fillStyle = '#e8d8c0'; g.beginPath(); g.roundRect(40, 90, w - 80, 26, 13); g.fill();
      g.fillStyle = patience > 0.5 ? '#3ad85a' : patience > 0.25 ? '#f0b030' : '#e03a2a'; g.beginPath(); g.roundRect(40, 90, Math.max(8, (w - 80) * patience), 26, 13); g.fill();
      bTex.needsUpdate = true;
    }

    // ---------------- taart opbouwen ----------------
    function layerY(s, n) { let y = 0; for (let k = 0; k < n; k++) y += KIND[s.layers[k].k].h; return y; }
    function syncCake(s, animNew = false) {
      while (s.meshes.length > s.layers.length) { const m = s.meshes.pop(); s.cakeG.remove(m.mesh); if (m.own) m.mesh.material.dispose(); }
      for (let k = s.meshes.length; k < s.layers.length; k++) {
        const l = s.layers[k]; const own = l.k === 'deeg';
        const m = new THREE.Mesh(layerGeo(l.k), own ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }) : matVC); m.castShadow = true; m.receiveShadow = true;
        if (own) m.material.color.copy(bakeColor(l.t ?? 3.8));
        s.cakeG.add(m); s.meshes.push({ mesh: m, own, y: layerY(s, k), t: animNew ? 0 : 1 });
      }
      const top = layerY(s, s.layers.length);
      s.goldM.position.y = top + 0.15; s.goldM.visible = s.gold;
      placeSprinkles(s, top);
    }
    function placeSprinkles(s, top) {
      if (!s.sprData) return; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      for (let k = 0; k < s.sprN; k++) { const d = s.sprData[k]; e.set(0, d.a, 0); q.setFromEuler(e); p.set(d.x, top + 0.04, d.z); m.compose(p, q, one); s.spr.setMatrixAt(k, m); }
      s.spr.count = s.sprN; s.spr.instanceMatrix.needsUpdate = true; if (s.spr.instanceColor) s.spr.instanceColor.needsUpdate = true;
    }
    function addSprinkles(s) {
      s.sprData = s.sprData || []; const cols = [0xff3a8a, 0xffe14a, 0x58d6ff, 0x7aff7a, 0xffffff, 0xff8a1c];
      for (let k = 0; k < 8 && s.sprN < 40; k++) { const a = Math.random() * TAU, r = 0.25 + Math.random() * 0.6; s.sprData[s.sprN] = { x: Math.cos(a) * r, z: Math.sin(a) * r, a: Math.random() * TAU }; s.spr.setColorAt(s.sprN, _c.set(cols[(Math.random() * cols.length) | 0])); s.sprN++; }
      placeSprinkles(s, layerY(s, s.layers.length));
    }
    function clearCake(s) { s.layers = []; s.sprN = 0; s.sprData = []; s.gold = false; s.spr.count = 0; syncCake(s); s.doneRing.material.opacity = 0; }

    // ---------------- rondes ----------------
    function genRecipe(r) {
      const n = N_LAY[r]; const mid = ['room', 'choco', 'aardbei', 'glazuur']; const rec = ['deeg'];
      for (let k = 1; k < n - 1; k++) rec.push(pick(mid)); if (n >= 4 && new Set(rec.slice(1)).size === 1 && Math.random() < 0.5) rec[2] = pick(mid.filter((m) => m !== rec[1]));
      rec.push(n >= 4 && Math.random() < 0.25 ? 'glazuur' : 'kers'); return rec;
    }
    function startRound(r) {
      round = r; recipe = genRecipe(r); N = recipe.length; roundLeft = R_TIME[r]; hurry = false; firstServed = -1; patience = 1; stage = 0; bubT = 0;
      for (const s of S) { clearCake(s); s.hold = null; s.served = false; s.first = false; s.blocked = false; s.oven = { st: 'empty', t: 0, heat: 1, heatT: 0, burnt: false, q: 1 }; s.dough.visible = s.gauge.visible = s.needle.visible = false; s.cdFlour = 3; s.cdSteal = 2; s.flour = 0; s.res = null; s.mistakes = 0; s.x = s.sd * 7.8; s.z = 2.0; drawTicket(s); }
      custs.forEach((c, k) => { c.h.visible = k === r; c.c.pose = 'idle'; }); drawBubble(); bubble.visible = true;
      gold.on = false; gold.m.visible = goldGlow.visible = false; chick.on = false; chick.a.group.visible = false; drag.on = false; drag.d.group.visible = false;
      // gebeurtenissen van deze ronde
      plan.length = 0; plan.push({ t: 6.5 + rand(0, 2.5), f: () => spawnGold() });
      if (r >= 1) plan.push({ t: rand(8, 11), f: () => startChicken(leaderTarget(true)) });
      if (r === 2) { plan.push({ t: rand(4.5, 7), f: () => startDragon(leaderTarget(false)) }); }
      if (r === 0 && Math.random() < 0.5) plan.push({ t: rand(12, 14), f: () => startChicken(leaderTarget(true)) });
      ph = 'intro'; phT = 0; T0 = T; if (r > 0) { ctxBig(r === ROUNDS - 1 ? 'FINALE: DUBBELE PUNTEN!' : `Bestelling ${r + 1}`, 1300, r === ROUNDS - 1 ? '#ff9ad5' : '#ffe14a'); audio.sfx('bell'); }
      refreshHud();
    }
    let T0 = 0; const ctxBig = (t, ms, c) => hud.showBig(t, ms, c);
    function leaderTarget(leader) { const a = S[0].tot, b = S[1].tot; if (a === b) return Math.random() < 0.5 ? 0 : 1; return leader ? (a > b ? 0 : 1) : (a > b ? 1 : 0); }
    function refreshHud() { hud.setScore(`Bestelling ${Math.min(round + 1, ROUNDS)}/${ROUNDS} · ${names[0]} ${S[0].tot} – ${S[1].tot} ${names[1]}`); }
    const HN = { gold: 'gouden ster' }; const hname = (h) => (h ? (HN[h] || KIND[h].name) : '');

    // ---------------- gimmicks ----------------
    function spawnGold() { gold.on = true; gold.t = 9; gold.m.visible = goldGlow.visible = true; gold.m.position.set(0, 1.9, 0.2); goldGlow.position.set(0, 1.5, 0.2); fx.texts.add('GOUDEN STER!', 0, 3.4, 0.4, '#ffe14a', 1.4); audio.sfx('sparkle'); hud.toast('⭐ Een gouden ster op de bank!', 1800); }
    function startChicken(i) { if (chick.on || ph !== 'cook') return; const s = S[i]; chick.on = true; chick.st = 'run'; chick.t = 0; chick.tgt = i; chick.x = s.sd * 14; chick.z = 3.2; chick.y = 0; chick.a.group.visible = true; stats.chickens++; fx.texts.add('KIP!', s.sd * 9, 3.0, 3, '#fff3a0', 1.5); audio.sfx('boing', { rate: 1.4 }); hud.toast('🐔 Een kip rent naar de taart van ' + names[i] + '!', 1800); }
    function startDragon(i) { if (drag.on || ph !== 'cook') return; drag.on = true; drag.st = 'in'; drag.t = 0; drag.tgt = i; drag.d.group.visible = true; stats.dragons++; fx.texts.add('DRAAK!', S[i].sd * 8, 5.5, -1, '#ff9a3a', 1.5); audio.sfx('explode', { vol: 0.35, rate: 1.6 }); hud.toast('🐉 De draak stookt de oven van ' + names[i] + ' op!', 2000); }
    const face = (a) => { chick.a.targetYaw = a; chick.a.yaw = a; };
    function updateChicken(dt) {
      if (!chick.on) return; const s = S[chick.tgt], g = chick.a.group; chick.t += dt;
      const px = s.sd * ST.plateP, pz = ST.plateZ, top = 1.05 + layerY(s, s.layers.length);
      if (chick.st === 'run') {
        const dx = px - chick.x, dz = pz - chick.z, d = Math.hypot(dx, dz); const sp = 8;
        if (d < 1.1) { chick.st = 'jump'; chick.t = 0; chick.vy = 8; chick.fx = px; chick.fz = pz; audio.sfx('boing', { rate: 1.6 }); }
        else { chick.x += dx / d * sp * dt; chick.z += dz / d * sp * dt; chick.y = Math.abs(Math.sin(chick.t * 14)) * 0.4; chick.a.speed = 1; face(Math.atan2(dx, dz)); }
      } else if (chick.st === 'jump') {
        chick.vy -= 30 * dt; chick.y += chick.vy * dt; chick.x = lerp(chick.x, px, 0.25); chick.z = lerp(chick.z, pz, 0.25);
        if (chick.vy < 0 && chick.y <= top - 0.05) { chick.st = 'sit'; chick.t = 0; chick.y = top; s.blocked = true; ctx.shake(0.35); audio.sfx('thud'); fx.particles.burst(px, top + 0.5, pz, { count: 22, speed: 5, up: 2, life: 1.1, size: 0.3, colors: [0xffffff, 0xf0e8d0], gravity: 3 }); fx.texts.add('KIP IN DE TAART!', px, top + 2.6, pz, '#fff3a0', 1.3); }
      } else if (chick.st === 'sit') {
        chick.y = top + Math.sin(chick.t * 12) * 0.05; chick.a.speed = 0; if (Math.random() < dt * 9) fx.particles.emit(px + (Math.random() - 0.5), top + 0.8, pz + (Math.random() - 0.5), 0, 2, 0, { life: 0.8, size: 0.22, color: 0xffffff, gravity: 2 });
        g.rotation.z = Math.sin(chick.t * 22) * 0.25; face(Math.sin(chick.t * 3) * 0.4);
        if (chick.t > 0.4 && Math.random() < dt * 1.5) audio.sfx('note', { vol: 0.2, rate: 2.2 });
        if (chick.t > 3.6) { if (s.layers.length > 1) { const l = s.layers.pop(); syncCake(s); stats.pecks++; fx.texts.add('PIK! ' + KIND[l.k].name + ' weg!', px, top + 2.2, pz, '#ff9a9a', 1.2); audio.sfx('hurt', { vol: 0.5 }); drawTicket(s); } flee(); }
      } else if (chick.st === 'flee') {
        chick.x += chick.fx * dt; chick.z += chick.fz * dt; chick.vy -= 30 * dt; chick.y = Math.max(0, chick.y + chick.vy * dt); if (chick.y <= 0) chick.vy = 6; chick.a.speed = 1; face(Math.atan2(chick.fx, chick.fz));
        if (chick.t > 1.3) { chick.on = false; g.visible = false; g.rotation.z = 0; }
      }
      g.position.set(chick.x, chick.y, chick.z); chick.a.update(dt);
    }
    function flee() { const s = S[chick.tgt]; chick.st = 'flee'; chick.t = 0; chick.vy = 9; s.blocked = false; chick.fx = -s.sd * (6 + Math.random() * 3) + (Math.random() - 0.5) * 4; chick.fz = 4 + Math.random() * 3; }
    function updateDragon(dt) {
      if (!drag.on) return; const s = S[drag.tgt], g = drag.d.group; drag.t += dt; const ox = s.ov.x, oz = s.ov.z;
      const home = new THREE.Vector3(ox, 4.9, 0.4);
      if (drag.st === 'in') { const k = smoothstep(0, 1.1, drag.t); g.position.set(lerp(-s.sd * 8, ox, k), lerp(9.5, 4.9, k), lerp(-1, 0.4, k)); if (drag.t > 1.1) { drag.st = 'fire'; drag.t = 0; } }
      else if (drag.st === 'fire') {
        g.position.copy(home).y += Math.sin(drag.t * 5) * 0.12; if (Math.random() < dt * 60) fx.particles.emit(ox + (Math.random() - 0.5) * 0.4, 4.2, 0.0, (Math.random() - 0.5) * 1, -2.6 - Math.random() * 1, -2.5, { life: 0.5, size: 0.7, color: Math.random() < 0.5 ? 0xff9a1a : 0xffe14a, gravity: -1 });
        if (drag.t > 0.3 && !s.oven.heatT) { s.oven.heatT = HEAT_T; s.oven.heat = HEAT_MUL; ctx.shake(0.35); audio.sfx('explode', { vol: 0.4, rate: 1.4 }); fx.texts.add('OVEN SNELLER!', ox, 3.7, oz + 1, '#ff9a3a', 1.4); }
        if (drag.t > 1.8) { drag.st = 'out'; drag.t = 0; }
      } else { const k = smoothstep(0, 1.0, drag.t); g.position.set(ox + s.sd * k * 8, 4.9 + k * 5, 0.4 - k); if (drag.t > 1.0) { drag.on = false; g.visible = false; } }
      g.rotation.set(0.35, Math.PI, 0); drag.d.update(dt);
    }
    function throwBag(from, to) {
      const a = S[from], b = S[to]; bag.on = true; bag.t = 0; bag.tgt = to; bag.from.set(a.x, 2.6, a.z); bag.to.set(b.sd * ST.plateP, 2.2, ST.plateZ); bag.m.visible = true; a.c.swing(); audio.sfx('whoosh');
    }
    function updateBag(dt) {
      if (!bag.on) return; bag.t += dt / (0.55 / (GR < 1 ? 0.8 : 1)); const k = clamp(bag.t, 0, 1);
      bag.m.position.lerpVectors(bag.from, bag.to, k); bag.m.position.y += Math.sin(k * Math.PI) * 3; bag.m.rotation.x += dt * 12;
      if (k >= 1) { bag.on = false; bag.m.visible = false; const v = S[bag.tgt]; v.flour = FLOUR_T; fx.particles.burst(bag.to.x, 2.0, bag.to.z, { count: 40, speed: 6, up: 1.2, life: 1.2, size: 0.9, colors: [0xffffff, 0xf4ecd8], gravity: 1.5 }); audio.sfx('pop', { rate: 0.6 }); audio.sfx('splash', { vol: 0.3 }); ctx.shake(0.4); fx.texts.add('BLOEM!', bag.to.x, 3.8, bag.to.z, '#ffffff', 1.5); }
    }
    function updateFlour(dt) {
      const hh = Math.tan(camera.fov * Math.PI / 360) * 3.0, ww = hh * camera.aspect; const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      for (const s of S) {
        s.flour = Math.max(0, s.flour - dt); const a = clamp(s.flour / 1.2, 0, 1) * 0.97; s.fl.visible = a > 0.01; if (!s.fl.visible) continue;
        s.fl.material.opacity = a; s.fl.position.copy(camera.position).addScaledVector(fwd, 3.0).addScaledVector(right, s.sd * ww * 0.5); s.fl.quaternion.copy(camera.quaternion); s.fl.scale.set(ww * 1.35, hh * 2.4, 1);
      }
    }

    // ---------------- spelers ----------------
    function zoneOf(s) {
      const p = Math.abs(s.x);
      if (s.z < -1.2) for (const k of KINDS) if (Math.abs(p - ST.crateP[k]) < 0.62) return { t: 'crate', k };
      if (Math.hypot(p - ST.ovenStandP, s.z - ST.ovenStandZ) < 1.8) return { t: 'oven' };
      if (p < 2.5) return { t: 'border' };
      if (Math.hypot(p - ST.plateP, s.z - ST.plateZ) < 2.6) return { t: 'plate' };
      return { t: 'none' };
    }
    function pickUp(s, kind) { s.hold = kind; s.c.jump(); s.acts++; audio.sfx('pop', { vol: 0.5, rate: 1.3 }); fx.particles.burst(s.x, 3.2, s.z, { count: 6, speed: 2, up: 1, life: 0.4, size: 0.2, color: 0xffffff, gravity: 2 }); }
    function place(s, kind, q, t) {
      const idx = s.layers.length; s.layers.push({ k: kind, q: q || 1, t }); if (s.layers[idx].k !== recipe[idx]) s.mistakes++; syncCake(s, true); drawTicket(s);
      const px = s.sd * ST.plateP, top = 1.05 + layerY(s, s.layers.length);
      s.c.swing(); const ok = kind === recipe[idx]; audio.sfx(ok ? 'good' : 'bad', { vol: 0.6 }); fx.particles.burst(px, top, ST.plateZ, { count: 10, speed: 3, up: 1.5, life: 0.6, size: 0.25, colors: [0xffffff, 0xffe9b0], gravity: 5 });
      fx.texts.add(ok ? KIND[kind].name + '!' : 'Oeps, ' + KIND[kind].name + '?', px, top + 1.6, ST.plateZ, ok ? '#7affb0' : '#ff9a9a', 1.0);
    }
    function act(s, A, B) {
      const z = zoneOf(s); const o = S[1 - s.i];
      if (A) {
        if (z.t === 'crate') { if (s.hold !== z.k) pickUp(s, z.k); }
        else if (z.t === 'oven') { if (s.hold === 'deeg' && s.oven.st === 'empty') { s.oven = { ...s.oven, st: 'baking', t: 0, burnt: false }; s.hold = null; s.c.swing(); audio.sfx('door'); s.dough.visible = s.gauge.visible = s.needle.visible = true; fx.particles.burst(s.ov.x, 1.5, s.ov.z + 1, { count: 8, speed: 2, up: 1, life: 0.5, size: 0.3, color: 0xffa040, gravity: 0 }); } else audio.sfx('click2'); }
        else if (z.t === 'plate') {
          if (s.blocked) { chick.on && flee(); stats.shoos[s.i]++; s.c.swing(); fx.texts.add('HOES! WEG!', s.sd * ST.plateP, 4.0, ST.plateZ, '#ffe14a', 1.4); audio.sfx('hit'); ctx.shake(0.25); fx.particles.burst(s.sd * ST.plateP, 2.5, ST.plateZ, { count: 16, speed: 5, up: 2, life: 1, size: 0.3, colors: [0xffffff, 0xf0e8d0], gravity: 3 }); }
          else if (s.served) audio.sfx('click2');
          else if (s.hold === 'gold') { if (s.layers.length && !s.gold) { s.gold = true; s.hold = null; syncCake(s); s.c.swing(); audio.sfx('sparkle'); fx.texts.add('GOUD OP DE TAART!', s.sd * ST.plateP, 4.0, ST.plateZ, '#ffe14a', 1.3); fx.particles.burst(s.sd * ST.plateP, 3.0, ST.plateZ, { count: 20, speed: 4, up: 2, life: 0.9, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); } else { fx.texts.add('Eerst een bodem!', s.sd * ST.plateP, 3.5, ST.plateZ, '#ffb0b0', 1); audio.sfx('buzz', { vol: 0.2 }); } }
          else if (s.hold) {
            if (s.layers.length >= N) { fx.texts.add('Taart is vol! B = bel', s.sd * ST.plateP, 3.8, ST.plateZ, '#ffe14a', 1); audio.sfx('click2'); }
            else if (!s.layers.length && s.hold !== 'deeg') { fx.texts.add('Eerst de bodem!', s.sd * ST.plateP, 3.5, ST.plateZ, '#ffb0b0', 1); audio.sfx('buzz', { vol: 0.2 }); }
            else { if (s.hold === 'deeg') place(s, 'deeg', 1, 0.5); else place(s, s.hold, 1); s.hold = null; }
          } else if (s.layers.length && s.sprN < 32) { addSprinkles(s); s.c.swing(); audio.sfx('sparkle', { vol: 0.3, rate: 1.4 }); fx.particles.burst(s.sd * ST.plateP, layerY(s, s.layers.length) + 1.8, ST.plateZ, { count: 10, speed: 2, up: 0, life: 0.6, size: 0.18, colors: [0xff3a8a, 0xffe14a, 0x58d6ff, 0x7aff7a], gravity: 6 }); }
        } else if (z.t === 'border') {
          if (gold.on && !gold.taken) { gold.on = false; gold.m.visible = goldGlow.visible = false; s.hold = 'gold'; stats.golds[s.i]++; s.c.jump(); audio.sfx('powerup'); fx.texts.add('GOUD!', s.x, 3.6, s.z, '#ffe14a', 1.4); }
          else if (s.cdSteal <= 0 && !o.served && Math.abs(o.x) < 5.2) {
            if (o.hold) { const it = o.hold; o.hold = null; s.hold = it; s.cdSteal = 6; stats.steals[s.i]++; s.c.swing(); fx.texts.add('DIEF!', o.x, 3.6, o.z, '#ff9a9a', 1.4); audio.sfx('hurt', { vol: 0.5 }); ctx.shake(0.3); o.c.pose = 'scared'; }
            else if (o.layers.length >= 2 && !o.blocked) { const l = o.layers.pop(); syncCake(o); drawTicket(o); s.hold = l.k; s.cdSteal = 6; stats.steals[s.i]++; s.c.swing(); fx.texts.add('TAARTENDIEF!', o.x, 4.0, o.z, '#ff9a9a', 1.4); audio.sfx('hurt', { vol: 0.5 }); ctx.shake(0.4); }
            else { fx.texts.add('Niks te stelen', s.x, 3.4, s.z, '#c8c8d8', 0.9); audio.sfx('click2'); }
          } else audio.sfx('click2');
        }
      }
      if (B) {
        if (z.t === 'oven') {
          if (s.oven.st === 'baking') {
            const t = s.oven.t, q = bakeStars(t); s.oven.st = 'empty'; s.dough.visible = s.gauge.visible = s.needle.visible = false; s.oven.heat = 1; s.oven.heatT = 0; audio.sfx('door');
            if (q >= 5) { stats.perfects[s.i]++; fx.texts.add('PERFECT GEBAKKEN!', s.ov.x, 3.8, s.ov.z + 1, '#7affb0', 1.4); audio.sfx('sparkle'); } else fx.texts.add(t >= 5.5 ? 'VERBRAND!' : t > 4.2 ? 'Te lang...' : t < 2 ? 'RAUW!' : 'Te kort...', s.ov.x, 3.8, s.ov.z + 1, t >= 5.5 ? '#aaaaaa' : '#ffd0a0', 1.2);
            // bodem vliegt naar de taartentafel
            s.layers.length < N ? place(s, 'deeg', q, t) : audio.sfx('bad'); s.c.swing();
            fx.particles.burst(s.ov.x, 1.6, s.ov.z + 1, { count: 10, speed: 3, up: 1.5, life: 0.6, size: 0.4, colors: [0xffffff, 0xcccccc], gravity: -1 });
          } else { fx.texts.add('Oven is leeg', s.ov.x, 3.4, s.ov.z + 1, '#c8c8d8', 0.9); audio.sfx('click2'); }
        } else if (z.t === 'plate') {
          if (s.served) audio.sfx('click2');
          else if (!s.layers.length) { fx.texts.add('Nog geen taart!', s.sd * ST.plateP, 3.4, ST.plateZ, '#c8c8d8', 0.9); audio.sfx('click2'); }
          else if (s.layers.length >= N || hurry || roundLeft < 9) serve(s);
          else { fx.texts.add('Taart is nog niet af!', s.sd * ST.plateP, 3.8, ST.plateZ, '#ffb0b0', 1); audio.sfx('buzz', { vol: 0.25 }); }
        } else if (z.t === 'border') {
          if (s.cdFlour > 0) { fx.texts.add(`Zak vult bij: ${Math.ceil(s.cdFlour)}s`, s.x, 3.4, s.z, '#c8c8d8', 0.9); audio.sfx('click2'); }
          else { s.cdFlour = 8; stats.flours[s.i]++; throwBag(s.i, 1 - s.i); }
        }
      }
    }
    function serve(s) {
      s.served = true; s.servedFrac = roundLeft / R_TIME[round]; s.speedSum += s.servedFrac; stats.serves[s.i]++; s.blocked && chick.on && chick.tgt === s.i && flee();
      if (firstServed < 0) { firstServed = s.i; s.first = true; hurry = true; roundLeft = Math.min(roundLeft, 9); ctxBig(`${names[s.i]} is klaar!`, 1100, '#ffe14a'); hud.toast('De klant wordt ongeduldig!', 1500); }
      audio.sfx('bell'); audio.sfx('ding', { rate: 1.2 }); s.c.pose = 'cheer'; ctx.shake(0.25); s.doneRing.material.opacity = 0.9;
      fx.texts.add('KLAAR!', s.sd * ST.plateP, 4.2, ST.plateZ, '#7affb0', 1.6); fx.particles.burst(s.sd * ST.plateP, 3, ST.plateZ, { count: 24, speed: 5, up: 2, life: 1, size: 0.35, colors: [0xffe14a, 0xffffff, 0x7affb0], gravity: 4 });
    }
    function updatePlayer(s, dt) {
      const inp = pv.input(s.i); const tm = clamp(pv.speed(s.i), 0.6, 1.6);
      const lam = lerp(12, 1.6, SLIP); const tx = inp.x * SP * tm, tz = inp.y * SP * tm; const k = 1 - Math.exp(-lam * dt);
      s.vx += (tx - s.vx) * k; s.vz += (tz - s.vz) * k;
      s.x += s.vx * dt; s.z += s.vz * dt; s.x = s.sd * clamp(s.sd * s.x, ST.pMin, ST.pMax); s.z = clamp(s.z, ST.zMin, ST.zMax);
      // taartentafel is een obstakel
      const px = s.sd * ST.plateP, dx = s.x - px, dz = s.z - ST.plateZ, d = Math.hypot(dx, dz); if (d < 1.75) { const f = 1.75 / Math.max(d, 0.01); s.x = px + dx * f; s.z = ST.plateZ + dz * f; }
      s.cdFlour = Math.max(0, s.cdFlour - dt); s.cdSteal = Math.max(0, s.cdSteal - dt);
      if (inp.aP || inp.bP) act(s, inp.aP, inp.bP);
      // oven
      const ov = s.oven;
      if (ov.st === 'baking') {
        const prev = ov.t; ov.t += dt * ov.heat; ov.heatT = Math.max(0, ov.heatT - dt); if (ov.heatT <= 0) ov.heat = 1;
        const tickA = Math.floor(prev * 2), tickB = Math.floor(ov.t * 2); if (tickB > tickA && ov.t < 5.5) audio.sfx('tick', { vol: 0.25, rate: 0.9 + ov.t * 0.1 });
        if (prev < 3.5 && ov.t >= 3.5) { audio.sfx('ding', { vol: 0.5 }); fx.particles.burst(s.ov.x, 3.5, s.ov.z + 1, { count: 10, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0x7affb0, 0xffffff], gravity: 1 }); }
        if (prev < 5.5 && ov.t >= 5.5) { audio.sfx('buzz', { vol: 0.35 }); fx.texts.add('BRAND!', s.ov.x, 3.4, s.ov.z + 1.2, '#ff6a4a', 1.4); }
        if (ov.t > 5.5 && Math.random() < dt * 14) fx.particles.emit(s.ov.x + (Math.random() - 0.5) * 1.5, 3.4, s.ov.z, (Math.random() - 0.5), 1.8, 0.3, { life: 1.2, size: 0.9, color: 0x333333, gravity: -0.5 });
        s.dough.material.color.copy(bakeColor(ov.t)); s.dough.scale.set(1.1 + ov.t * 0.04, 0.7 + ov.t * 0.05, 1);
        s.needle.position.set(s.ov.x - 1.4 + 2.8 * (8 + clamp(ov.t / BAKE_MAX, 0, 1) * 496) / 512, 3.95, s.ov.z + 1.05); s.needle.material.color.setHex(ov.heat > 1 ? 0xff6a2a : 0xffffff);
        if (ov.heat > 1 && Math.random() < dt * 20) fx.particles.emit(s.ov.x + (Math.random() - 0.5) * 1.6, 3.2, s.ov.z + 1, 0, 1.5, 0, { life: 0.5, size: 0.3, color: 0xff8a2a, gravity: -1 });
      }
      s.ov.win.material.emissiveIntensity = ov.st === 'baking' ? (ov.heat > 1 ? 1.6 : 0.9) : 0.25;
      // visueel
      s.c.speed = clamp(Math.hypot(s.vx, s.vz) / SP, 0, 1); if (Math.hypot(s.vx, s.vz) > 0.4) s.c.faceDir(s.vx, s.vz); else s.c.faceDir(-s.sd * 0.3, 1);
      const alive = !s.c.swingT; if (s.c.pose !== 'cheer' && s.c.pose !== 'sad') s.c.pose = s.hold ? 'carry' : (s.blocked ? 'scared' : 'idle');
    }
    function labelFor(s) {
      if (ph !== 'cook' || s.served) return s.served ? 'KLAAR! Wacht op de jury' : '';
      const z = zoneOf(s);
      if (s.blocked && z.t === 'plate') return 'A: SCHOEI DE KIP WEG!';
      if (z.t === 'crate') return `A: pak ${KIND[z.k].name}`;
      if (z.t === 'oven') return s.oven.st === 'baking' ? 'B: haal eruit!' : s.hold === 'deeg' ? 'A: deeg in de oven' : 'Pak eerst deeg';
      if (z.t === 'border') return gold.on ? 'A: PAK DE GOUDEN STER' : s.cdFlour > 0 ? `A: steel · B: bloem (${Math.ceil(s.cdFlour)}s)` : 'A: steel · B: BLOEMZAK';
      if (z.t === 'plate') { if (s.hold === 'gold') return 'A: goud op de taart'; if (s.hold) return `A: leg ${hname(s.hold)} erop`; if (s.layers.length >= N) return 'B: BEL! (klaar) · A: strooi'; return s.layers.length ? 'A: hagelslag · B: bel' : 'Eerst een bodem'; }
      return s.hold ? hname(s.hold) : '';
    }

    // ---------------- beoordeling ----------------
    function evalCake(s) {
      let m = 0; for (let k = 0; k < N; k++) if (s.layers[k] && s.layers[k].k === recipe[k]) m++;
      const acc = 1 + Math.round(4 * m / N), dec = clamp(1 + Math.min(3, Math.ceil(s.sprN / 8)) + (s.gold ? 2 : 0), 1, 5);
      const bk = s.layers[0] && s.layers[0].k === 'deeg' ? s.layers[0].q : 1;
      const speed = s.served ? Math.round(s.servedFrac * 3) + (s.first ? 1 : 0) : 0;
      const mult = round === ROUNDS - 1 ? 2 : 1;
      return { acc, dec, bk, speed, mult, pts: (acc + dec + bk + speed) * mult, m };
    }
    function beginJudge() {
      ph = 'judge'; judgeT = 0; for (const s of S) { s.res = evalCake(s); s.tot += s.res.pts; s.c.pose = 'idle'; s.hold = null; s.blocked = false; s.speedSum += 0; }
      if (chick.on) { chick.on = false; chick.a.group.visible = false; } drag.on = false; drag.d.group.visible = false; gold.on = false; gold.m.visible = goldGlow.visible = false;
      hud.setTimer(null); ctxBig('DE JURY PROEFT!', 1000, '#ffe14a'); audio.sfx('bell'); jury.pose = 'wave';
      const w = S[0].res.pts === S[1].res.pts ? -1 : S[0].res.pts > S[1].res.pts ? 0 : 1; juryLine = '';
      const worst = S.reduce((a, s) => (s.res.pts < a.res.pts ? s : a)); const r = worst.res;
      juryLine = r.bk <= 1 && worst.layers[0] ? (worst.layers[0].t > 5 ? 'Verbrand! Ik hoest!' : 'Rauw deeg?! Bah!') : r.acc <= 2 ? 'Dit heb ik niet besteld!' : S.every((s) => s.res.pts >= 14) ? 'FANTASTISCH! Allebei!' : w < 0 ? 'Gelijk! Hoe dan?!' : pick(['Mmm, lekker!', 'Smaakt naar feest!', 'Nog een stukje!']);
      for (const s of S) { drawCard(s, 0); }
      for (const s of S) if (s.res.pts >= 14) s.c.pose = 'cheer';
      refreshHud();
    }
    const cards = S.map((s) => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.58), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false })); m.renderOrder = 18; m.visible = false; m.position.set(s.sd * 5.6, 4.6, 2.2); scene.add(m); return { cv, t, m, g: cv.getContext('2d') }; });
    function drawCard(s, step) {
      const c = cards[s.i], g = c.g, r = s.res; c.m.visible = true; g.clearRect(0, 0, 512, 300);
      g.fillStyle = '#fffbe8'; g.strokeStyle = players[s.i].css; g.lineWidth = 10; g.beginPath(); g.roundRect(6, 6, 500, 288, 24); g.fill(); g.stroke();
      g.fillStyle = '#3a2410'; g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText(names[s.i], 256, 46);
      const rows = [['Nauwkeurig', r.acc], ['Versiering', r.dec], ['Bakstand', r.bk]];
      rows.forEach(([n, v], k) => { const y = 92 + k * 52; g.textAlign = 'left'; g.font = 'bold 26px Fredoka, Arial, sans-serif'; g.fillStyle = '#3a2410'; g.fillText(n, 24, y + 8); if (step > k) for (let q = 0; q < 5; q++) starPath(g, 300 + q * 40, y, 17, q < v); });
      if (step > 3) { g.fillStyle = '#3a2410'; g.textAlign = 'left'; g.fillText(`Tempo${s.served ? '' : ' (te laat)'}`, 24, 256); g.fillStyle = '#1a8a3a'; g.textAlign = 'right'; g.font = 'bold 30px Fredoka, Arial Black'; g.fillText(`+${r.speed}`, 270, 256); }
      if (step > 4) { g.fillStyle = '#a02a1a'; g.textAlign = 'right'; g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.fillText(`${r.pts}${r.mult > 1 ? ' (x2)' : ''}`, 488, 270); }
      c.t.needsUpdate = true;
    }
    function updateJudge(dt) {
      const prev = judgeT; judgeT += dt; const T_STEP = 0.55;
      const stepOf = (t) => Math.floor((t - 0.5) / T_STEP) + 1;
      const a = stepOf(prev), b = stepOf(judgeT);
      if (b !== a && b >= 1 && b <= 5) {
        for (const s of S) drawCard(s, b); const k = b - 1;
        if (b <= 3) for (const s of S) { const v = [s.res.acc, s.res.dec, s.res.bk][k]; for (let q = 0; q < v; q++) setTimeout(() => { try { audio.sfx('star', { rate: 0.8 + q * 0.12, vol: 0.35 }); } catch (e) { /* weg */ } }, q * 70); }
        else audio.sfx('ding', { rate: 1 + b * 0.1 });
        if (b === 5) { audio.sfx('coin'); fx.texts.add('+' + S[0].res.pts, S[0].sd * 5.6, 6.2, 2.2, '#ffe14a', 1.5); fx.texts.add('+' + S[1].res.pts, S[1].sd * 5.6, 6.2, 2.2, '#ffe14a', 1.5); ctx.shake(0.2); fx.texts.add(juryLine, 0, 4.6, 5.2, '#ffffff', 1.6); }
      }
      if (judgeT > 4.4) endJudge();
    }
    function endJudge() {
      for (const c of cards) c.m.visible = false; jury.pose = 'sit';
      for (const s of S) { s.c.pose = 'idle'; s.doneRing.material.opacity = 0; }
      if (round + 1 >= ROUNDS) return endGame();
      startRound(round + 1);
    }
    function endGame() {
      if (finished) return; finished = true; over = true; ph = 'end';
      const a = S[0], b = S[1]; let winner = a.tot > b.tot ? 0 : b.tot > a.tot ? 1 : a.speedSum > b.speedSum ? 0 : b.speedSum > a.speedSum ? 1 : a.mistakes < b.mistakes ? 0 : b.mistakes < a.mistakes ? 1 : (Math.random() < 0.5 ? 0 : 1);
      const tie = a.tot === b.tot; hud.showBig(`${names[winner]} wint!`, 1200, '#ffe14a');
      const bits = []; if (stats.steals[0] + stats.steals[1]) bits.push(`${stats.steals[0] + stats.steals[1]}× gestolen`); if (stats.flours[0] + stats.flours[1]) bits.push(`${stats.flours[0] + stats.flours[1]}× bloemzak`); if (stats.pecks) bits.push('kip pikte een taart kaal'); if (stats.golds[0] + stats.golds[1]) bits.push('gouden ster gepakt');
      ctx.finishPvp({ winner, score: [a.tot, b.tot], delay: 1100, summary: `${names[winner]} bakt de beste taarten: <b>${S[winner].tot}</b> tegen ${S[1 - winner].tot} punten${tie ? ' (gelijk: het tempo besliste)' : ''}.<br><small>${bits.join(' · ') || 'Schone strijd!'} ${pick(WIN_TXT)}</small>` });
    }

    // ---------------- visuals ----------------
    let bulbT = 0; const BC = [0xff3a8a, 0xffd23f, 0x58d6ff, 0x7aff7a, 0xff8a1c];
    function visuals(dt, tt) {
      for (const s of S) {
        s.holder.position.set(s.x, 0, s.z); s.c.update(dt);
        const hh = 3.0 * Math.pow(pv.size(s.i), 0.8);
        s.ring.position.set(s.x, 0.05, s.z); s.ring.visible = ph === 'cook' && !s.served;
        const L = labelFor(s); if (L !== s.lastLab) { s.lastLab = L; s.lab.material.map = labelTex(L || ' ', '#ffffff', 512, 64, 34); s.lab.material.needsUpdate = true; } s.lab.visible = !!L; s.lab.position.set(s.x, hh + 1.6, s.z + 0.5);
        s.held.visible = !!s.hold; if (s.hold) { s.held.geometry = itemGeo(s.hold); s.held.material = s.hold === 'gold' ? matGold : matVC; s.held.position.set(s.x, hh + 0.55 + Math.sin(tt * 4 + s.i) * 0.08, s.z); s.held.rotation.y = tt * 2; s.held.scale.setScalar(s.hold === 'gold' ? 1.2 : 1.0); }
        // taart: lagen vallen erin, plaat draait
        s.spin += dt * 0.4; s.cakeG.rotation.y = s.spin;
        for (const m of s.meshes) { if (m.t < 1) { m.t = Math.min(1, m.t + dt * 4 * (GR < 1 ? 0.6 : 1)); m.t2 = 0; } else if ((m.t2 ?? 1) < 1) m.t2 += dt * 5; const e = 1 - Math.pow(1 - m.t, 3); m.mesh.position.y = m.y + (1 - e) * 2.2; m.mesh.scale.y = m.t >= 1 && m.t2 < 1 ? 1 + Math.sin(m.t2 * Math.PI) * 0.12 : 1; }
        if (s.goldM.visible) s.goldM.rotation.y = tt * 2.5;
        if (s.doneRing.material.opacity > 0) s.doneRing.material.opacity = 0.55 + Math.sin(tt * 6) * 0.3;
        s.holder.visible = true;
        if (s.oven.st === 'empty') s.ov.win.material.emissiveIntensity = 0.25;
      }
      // klant
      const cu = custs[Math.min(round, ROUNDS - 1)]; cu.c.update(dt);
      jury.update(dt);
      if (ph === 'cook') { const st = patience > 0.66 ? 0 : patience > 0.4 ? 1 : patience > 0.18 ? 2 : 3; cu.c.pose = st === 0 ? 'idle' : st === 1 ? 'point' : st === 2 ? 'push' : 'scared'; }
      else if (ph === 'judge' && judgeT > 2.5 && S[0].res) { const avg = (S[0].res.pts + S[1].res.pts) / 2 / S[0].res.mult; cu.c.pose = avg >= 10 ? 'cheer' : 'sad'; }
      // gouden ster
      if (gold.on) { gold.m.rotation.y = tt * 2.5; gold.m.position.y = 1.9 + Math.sin(tt * 4) * 0.15; goldGlow.scale.setScalar(1 + Math.sin(tt * 6) * 0.12); if (Math.random() < dt * 12) fx.particles.emit((Math.random() - 0.5) * 1.2, 2.0 + Math.random() * 1.2, 0.2 + (Math.random() - 0.5), 0, 0.8, 0, { life: 0.6, size: 0.22, color: 0xffe14a, gravity: 0 }); }
      bulbT -= dt; if (bulbT <= 0) { bulbT = 0.16; const ph2 = Math.floor(tt * 6); for (let k = 0; k < W.bulbN; k++) { _c.setHex(BC[(k + (ph2 >> 1)) % 5]); if ((k + ph2) % 3 === 0) _c.multiplyScalar(0.3); W.bulbs.setColorAt(k, _c); } W.bulbs.instanceColor.needsUpdate = true; }
    }
    function updateCamera(dt) { punch = damp(punch, 0, 4, dt); camera.position.copy(tgt).addScaledVector(camDir, camD * (1 - punch * 0.05)); camera.lookAt(tgt); }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      started = true; T += dt; phT += dt;
      if (ph === 'intro') { for (const s of S) { s.vx *= 0.8; s.vz *= 0.8; } if (phT > 1.4) { ph = 'cook'; phT = 0; hud.showBig('BAKKEN!', 700, '#7affb0'); audio.sfx('go'); } }
      else if (ph === 'cook') {
        roundLeft -= dt; hud.setTimer(Math.max(0, roundLeft), 8);
        patience = clamp(roundLeft / R_TIME[round], 0, 1); bubT -= dt;
        const st = patience > 0.66 ? 0 : patience > 0.4 ? 1 : patience > 0.18 ? 2 : 3; if (st !== stage) { stage = st; drawBubble(); if (st >= 2) audio.sfx('buzz', { vol: 0.15, rate: 1.5 }); bubT = 0.2; } else if (bubT <= 0) { bubT = 0.25; drawBubble(); }
        for (const e of plan) if (!e.done && phT >= e.t) { e.done = true; e.f(); }
        if (gold.on) { gold.t -= dt; if (gold.t <= 0) { gold.on = false; gold.m.visible = goldGlow.visible = false; } }
        for (const s of S) updatePlayer(s, dt);
        updateChicken(dt); updateDragon(dt); updateBag(dt);
        if (roundLeft <= 0 || (S[0].served && S[1].served)) { roundLeft = Math.max(0, roundLeft); beginJudge(); }
      } else if (ph === 'judge') { updateJudge(dt); for (const s of S) { s.vx = s.vz = 0; } }
      for (const s of S) hud.setPlayerInfo(s.i, `${s.tot} pnt · ${s.hold ? 'Heeft: ' + hname(s.hold) : s.served ? 'Klaar!' : s.oven.st === 'baking' ? 'Oven bakt...' : ''}`);
      visuals(dt, T + introT); updateCamera(dt); updateFlour(dt);
    }
    function resultUpdate(dt) { T += dt; for (const s of S) { s.c.speed = 0; } if (jury) jury.pose = 'cheer'; visuals(dt, T + introT); updateCamera(dt); updateFlour(dt); }
    function introUpdate(dt) { introT += dt; for (const s of S) { s.c.pose = 'idle'; } visuals(dt, introT); updateCamera(dt); }
    startRound(0); ph = 'intro'; hud.setTimer(R_TIME[0], 8); visuals(0.016, 0); updateCamera(0);

    return {
      update, resultUpdate, introUpdate,
      onResize() { fitCamera(); },
      onStart() { ph = 'intro'; phT = 0; },
      onSwap() { for (const s of S) fx.particles.burst(s.x, 2, s.z, { count: 14, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && !finished) { const s = S[i]; s.tot = Math.max(0, s.tot - 2); s.hold = null; fx.texts.add('-2', s.x, 3.6, s.z, '#ff6a6a', 1.5); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); s.c.pose = 'scared'; refreshHud(); } }); },
      celebrate(w) { S[w].c.pose = 'cheer'; S[1 - w].c.pose = 'sad'; jury.pose = 'cheer'; for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst((Math.random() - 0.5) * 18, 6 + Math.random() * 3, 3, { count: 24, speed: 7, up: 1, life: 1.2, size: 0.5, colors: BC, gravity: 4 }); } catch (e) { /* weg */ } }, k * 250); },
      dispose() {},
      dbg: {
        state: () => ({ T, ph, round, N, recipe: [...recipe], roundLeft, finished, tot: S.map((s) => s.tot), hurry, gold: { on: gold.on }, chick: { on: chick.on, st: chick.st, tgt: chick.tgt }, drag: { on: drag.on }, stats,
          p: S.map((s) => ({ x: s.x, z: s.z, hold: s.hold, layers: s.layers.map((l) => l.k), served: s.served, oven: { st: s.oven.st, t: s.oven.t, heat: s.oven.heat }, spr: s.sprN, gold: s.gold, blocked: s.blocked, cdFlour: s.cdFlour, cdSteal: s.cdSteal, flour: s.flour, res: s.res })) }),
        setTime: (t) => { roundLeft = t; }, spawnGold, startChicken, startDragon, ST, KINDS, setTot: (a, b) => { S[0].tot = a; S[1].tot = b; refreshHud(); }, S, endGame,
      },
    };
  },
};

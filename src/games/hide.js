import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { Animal } from '../engine/chars.js';
import * as PR from '../engine/props.js';
import { buildPlaza, PLAZA, KINDS } from './hide_world.js';
import { makeCrowd } from './hide_crowd.js';

// Verkleed-Verstoppertje — Prop Hunt op een kermisplein bij nacht, 1 tegen 1, twee rondes met rolwissel.
//  * VERSTOPPER: verkleedt zich als voorwerp terwijl de zoeker "ogen dicht" heeft (zwart scherm). A = ontkleden/opnieuw verkleden, B = afleiding.
//  * ZOEKER: lantaarn (de rest is donker). A = tik op een voorwerp (fout = stuntelen + tijdverlies + een kans minder), B = scan-flits (verkleedde dingen glinsteren).
//  * Punten per ronde (totaal 28 s): verstopper = seconden ongezien, zoeker = seconden over bij het vinden. Na 2 rondes wint het hoogste totaal; gelijk = de kip kiest.
//  * Gimmicks: verraderkip (loopt naar de verstopper en kakelt), de Deurman die de poort opent (iedereen stil staan!), comeback-hulp in ronde 2.

const HUNT_T = 28, PREP_T = 6, INTRO_T = 2.2, FOUND_T = 2.7, CHANCES = 4;
const SEEK_SPEED = 6.8, WADDLE = 1.9, RUN_SPEED = 5.4, PREP_SPEED = 6.5, TAP_REACH = 1.75, DISGUISE_REACH = 3.6;
const SCAN_R = 8.5, SCAN_CD = 8.5, CH_SPD = 1.55;
const BAD_TAPS = ['Dat is gewoon een {k}!', 'Au, een {k}!', 'Je tikt een {k}... saai!', 'Alleen maar een {k}!', 'Die {k} zegt: "nee hoor".'];
const NPC_NAMES = ['Piet de bakker', 'Oma Gerda', 'Boer Kees', 'Tante Truus', 'Meneer Jansen', 'Kleine Joep'];

export default {
  id: 'hide',
  name: 'Verkleed-Verstoppertje',
  giver: 'Kermisbaas Kees',
  icon: '🎪',
  mode: 'pvp',
  time: 75,
  music: 'tense',
  blurb: 'Nacht op de <b>kermis</b>! De <b>verstopper</b> verkleedt zich als voorwerp terwijl de zoeker <b>ogen dicht</b> heeft. De <b>zoeker</b> heeft een lantaarn. Na 28 s wisselen jullie! Punten: ongezien blijven of snel vinden.',
  controls: ['{move} lopen (als voorwerp: schuifelen)', 'Zoeker: {a} tik · {b} scan', 'Verstopper: {a} ontkleden · {b} afleiding'],
  tip: 'Pas op voor de verraderkip en de Deurman: stil staan!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud, renderer } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tw = ctx.twist.id;
    const L = ctx.lights('night', { shadows: false, fogNear: 55, fogFar: 150, center: [0, 0, 0] });
    camera.fov = 44; camera.updateProjectionMatrix();
    const W = buildPlaza(ctx, L);
    const crowd = makeCrowd(scene, 18, PLAZA, { blockers: W.blockers, props: W.props }, 5);
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const dummy = new THREE.Object3D();

    // ---------------- schaduw-vlekjes (instanced) ----------------
    const blobTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    const blobGeo = new THREE.PlaneGeometry(2, 2); blobGeo.rotateX(-Math.PI / 2);
    const propBlobs = new THREE.InstancedMesh(blobGeo, blobMat, W.props.length); propBlobs.frustumCulled = false;
    W.props.forEach((p, i) => { dummy.position.set(p.x, 0.03, p.z); dummy.scale.setScalar(p.r * 1.5); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); propBlobs.setMatrixAt(i, dummy.matrix); }); scene.add(propBlobs);
    const npcBlobs = new THREE.InstancedMesh(blobGeo, blobMat, crowd.npcs.length); npcBlobs.frustumCulled = false; scene.add(npcBlobs);

    // ---------------- poppetjes ----------------
    const lanternGeo = new THREE.BoxGeometry(0.2, 0.28, 0.2);
    const P = players.map((pp, i) => {
      const c = ctx.make.brother(i); const holder = new THREE.Group(); holder.add(c.group); const k = 1.7 / c.height * pv.size(i); holder.scale.setScalar(k); scene.add(holder);
      const lan = new THREE.Group(); const lb = new THREE.Mesh(lanternGeo, new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); lb.position.y = -0.1; lan.add(lb);
      lan.add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 8, Math.PI), new THREE.MeshBasicMaterial({ color: 0x333333 }))); lan.position.set(0, 0.0, 0.1); lan.visible = false; c.hold(lan, 'r');
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.2, 0.82, 1); tag.renderOrder = 15; scene.add(tag);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; scene.add(ring);
      const shadow = PR.shadowBlob(0.9); scene.add(shadow);
      return { i, c, holder, lan, tag, ring, shadow, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, k, vis: true, y: 0, vy: 0 };
    });
    // lantaarn-licht + lichtvlek op de grond
    const lamp = new THREE.PointLight(0xffd9a0, 0, 16, 2); scene.add(lamp);
    const poolTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,225,150,.55)'); gr.addColorStop(0.6, 'rgba(255,200,110,.2)'); gr.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; pool.scale.setScalar(14); scene.add(pool);

    // ---------------- verraderkip ----------------
    const hen = new Animal('chicken'); hen.group.scale.setScalar(1.5); scene.add(hen.group); hen.group.visible = false;
    const CH = { x: 0, z: 0, mode: 'wait', cluck: 0.4, hop: 0, decoyT: 0, dx: 0, dz: 0, on: false };
    const exclTex = canvasTex(64, 64, (g) => { g.font = 'bold 56px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#300'; g.strokeText('!', 32, 34); g.fillStyle = '#ffe14a'; g.fillText('!', 32, 34); });
    const excl = new THREE.Sprite(new THREE.SpriteMaterial({ map: exclTex, transparent: true, depthTest: false })); excl.scale.set(1.2, 1.2, 1); excl.renderOrder = 18; excl.visible = false; scene.add(excl);

    // ---------------- glinster-effecten ----------------
    const starTex = canvasTex(128, 128, (g) => { g.translate(64, 64); const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,240,150,.7)'); gr.addColorStop(1, 'rgba(255,220,100,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); g.fillStyle = 'rgba(255,255,255,.95)'; for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-60, 0); g.lineTo(0, -4); g.lineTo(60, 0); g.lineTo(0, 4); g.closePath(); g.fill(); } });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending })); halo.renderOrder = 17; halo.visible = false; scene.add(halo);
    const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); scanRing.rotation.x = -Math.PI / 2; scanRing.position.y = 0.1; scene.add(scanRing);

    // ---------------- toestand ----------------
    const S = { phase: 'idle', round: 0, first: Math.random() < 0.5 ? 0 : 1, hider: 0, t: 0, left: HUNT_T, prepT: PREP_T, started: false, help: -1, over: false, results: [], stats: { found: 0, wrong: 0, scans: 0, decoys: 0, pops: 0, deur: 0, clucks: 0 } };
    const pts = [0, 0]; let finished = false, Tm = 0, introT = 0, camFocusK = 0, flashT = 0;
    const H = { dis: false, prop: null, kind: '', x: 0, z: 0, vx: 0, vz: 0, popped: false, cdPop: 0, cdDecoy: 0, reveal: 0, disT: 0, stepT: 0, sparkT: 0, hopT: 0 };
    const Sk = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, stun: 0, tapCd: 0, scanCd: 0, chances: CHANCES, scanBoost: 0 };
    const D = { state: 'idle', t: 0, next: 12, punished: false };
    const decoy = { x: 0, z: 0, t: 0 };
    let scanFx = null; const shaking = [];
    const hiI = () => S.hider, seI = () => 1 - S.hider;
    const role = (i) => (i === S.hider ? 'verstopper' : 'zoeker');
    const colCss = players.map((p) => p.css);

    // ---------------- overlay (donker scherm / lantaarn) ----------------
    let ov = null, vig = null, msg = null, lastVig = '';
    function ensureOv() {
      if (ov && ov.isConnected) return true;
      const hudEl = document.getElementById('hud'); if (!hudEl) return false;
      ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
      vig = document.createElement('div'); vig.style.cssText = 'position:absolute;inset:0'; ov.append(vig);
      msg = document.createElement('div'); msg.style.cssText = 'position:absolute;left:0;right:0;top:14%;text-align:center;font-family:MedievalSharp,serif;color:#ffe9a0;text-shadow:0 4px 0 #000,0 0 24px rgba(255,200,80,.6);line-height:1.05';
      ov.append(msg); hudEl.prepend(ov); lastVig = ''; return true;
    }
    function setVig(cx, cy, r0, r1, a0, a1, rest) {
      if (!ensureOv()) return;
      const s = `radial-gradient(circle at ${cx.toFixed(0)}px ${cy.toFixed(0)}px, rgba(4,6,20,${a0}) ${r0.toFixed(0)}px, rgba(4,6,20,${a1}) ${r1.toFixed(0)}px, rgba(4,6,20,${rest}) ${(r1 * 2.1).toFixed(0)}px)`;
      if (s !== lastVig) { vig.style.background = s; lastVig = s; }
    }
    function setMsg(html, size = 64) { if (!ensureOv()) return; if (msg.dataset.h !== html) { msg.dataset.h = html; msg.innerHTML = html; } msg.style.fontSize = size + 'px'; msg.style.display = html ? 'block' : 'none'; }
    const tv = new THREE.Vector3();
    function toScreen(x, y, z) { tv.set(x, y, z).project(camera); const cw = renderer.domElement.clientWidth || 1100, ch = renderer.domElement.clientHeight || 650; return [(tv.x * 0.5 + 0.5) * cw, (-tv.y * 0.5 + 0.5) * ch, cw, ch]; }
    function pxPerUnit(x, z) { const a = toScreen(x, 0.8, z), b = toScreen(x + 1, 0.8, z); return Math.abs(b[0] - a[0]) || 28; }

    // ---------------- hulpfuncties ----------------
    function burst(x, y, z, n, colors, sp = 4, up = 1.2) { fx.particles.burst(x, y, z, { count: n, speed: sp, up, life: 0.7, size: 0.4, colors, gravity: 5 }); }
    function pushOut(o, rr) { for (const b of W.blockers) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz), m = b.r + rr; if (d < m && d > 1e-4) { o.x = b.x + dx / d * m; o.z = b.z + dz / d * m; } } o.x = clamp(o.x, -PLAZA.X + 0.7, PLAZA.X - 0.7); o.z = clamp(o.z, -PLAZA.Z + 0.7, PLAZA.Z - 0.2); }
    function pushOutProps(o, rr) { for (const p of W.props) { const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz), m = p.r * 0.75 + rr; if (d < m && d > 1e-4) { o.x = p.x + dx / d * m; o.z = p.z + dz / d * m; } } }
    function moveWith(o, inp, spd, dt) {
      const lam = lerp(14, 2.4, SLIP); const tx = inp.x * spd, tz = inp.y * spd;
      o.vx = damp(o.vx, tx, lam, dt); o.vz = damp(o.vz, tz, lam, dt); o.x += o.vx * dt; o.z += o.vz * dt;
    }
    const nearestProp = (x, z, maxD) => { let best = null, bd = maxD; for (const p of W.props) { const d = Math.hypot(p.x - x, p.z - z) - p.r * 0.5; if (d < bd) { bd = d; best = p; } } return best; };

    // ---------------- ronde-flow ----------------
    function clearHider() { if (H.prop) { W.removeInstance(H.prop); H.prop = null; } H.dis = false; H.popped = false; H.reveal = 0; }
    function startRound(r) {
      S.round = r; S.hider = r === 0 ? S.first : 1 - S.first; S.phase = 'intro'; S.t = 0; S.left = HUNT_T; S.prepT = PREP_T; S.over = false;
      clearHider(); H.cdPop = 0; H.cdDecoy = 0; H.vx = H.vz = 0;
      const p0 = pick(W.props); const a = Math.random() * TAU; H.x = clamp(p0.x + Math.cos(a) * 2.6, -PLAZA.X + 2, PLAZA.X - 2); H.z = clamp(p0.z + Math.sin(a) * 2.6, -PLAZA.Z + 2, PLAZA.Z - 2); pushOut(H, 0.6);
      Sk.x = 0; Sk.z = PLAZA.Z - 1.3; Sk.vx = Sk.vz = 0; Sk.stun = 0; Sk.tapCd = 0; Sk.scanCd = 2.5; Sk.chances = CHANCES; Sk.scanBoost = 0;
      D.state = 'idle'; D.next = 9 + Math.random() * 4; decoy.t = 0; CH.on = false; CH.mode = 'wait'; CH.decoyT = 0; scanFx = null; scanRing.material.opacity = 0; halo.visible = false; excl.visible = false;
      // comeback in ronde 2: wie achterstaat krijgt hulp
      S.help = -1; if (r === 1) { if (pts[0] < pts[1] - 4) S.help = 0; else if (pts[1] < pts[0] - 4) S.help = 1; }
      const hi = S.hider, se = 1 - S.hider;
      P[hi].lan.visible = false; P[se].lan.visible = true; P[hi].c.pose = 'idle'; P[se].c.pose = 'scared'; P[hi].vis = P[se].vis = true;
      P[se].x = Sk.x; P[se].z = Sk.z; P[hi].x = H.x; P[hi].z = H.z; P[se].yaw = Math.PI; P[hi].yaw = 0;
      P[se].c.faceDir(0, -1); P[hi].c.faceDir(0, 1);
      hud.setTimer(null); refreshHud();
      hud.showBig(`Ronde ${r + 1}/2`, 1500, '#ffe14a');
      hud.toast(`${names[hi]} verstopt zich, ${names[se]} zoekt!`, 2000);
      if (S.help >= 0) setTimeout(() => hud.toast(`Hulp voor ${names[S.help]}: ${S.help === se ? 'toverlantaarn (grotere scan)' : 'slimme afleiding (kip loopt trager)'}!`, 2600), 1300);
      audio.sfx('door', { vol: 0.4 });
    }
    function enterPrep() {
      S.phase = 'prep'; S.t = 0; S.prepT = PREP_T; S.disT = 0; hud.showBig('', 1);
      hud.setHint(`<b>${names[hiI()]}</b>: loop naar een voorwerp en druk <b>A</b> om je te verkleden!  ·  ${names[seI()]}: ogen dicht!`);
      audio.sfx('creak', { vol: 0.2, rate: 1.5 });
    }
    function enterHunt() {
      if (!H.dis) autoDisguise();
      S.phase = 'hunt'; S.t = 0; flashT = 0.5; H.popped = false; P[hiI()].vis = false;
      P[seI()].c.pose = 'carry'; P[hiI()].c.pose = 'idle';
      // kip start ver weg
      const far = [[-PLAZA.X + 2, -PLAZA.Z + 2], [PLAZA.X - 2, -PLAZA.Z + 2], [-PLAZA.X + 2, PLAZA.Z - 2], [PLAZA.X - 2, PLAZA.Z - 2]].sort((a, b) => Math.hypot(b[0] - H.x, b[1] - H.z) - Math.hypot(a[0] - H.x, a[1] - H.z))[0];
      CH.x = far[0]; CH.z = far[1]; CH.on = true; CH.mode = 'walk'; CH.cluck = 1; hen.group.visible = true;
      setMsg(''); hud.setHint(`Zoeker <b>${names[seI()]}</b>: <b>A</b> = tik · <b>B</b> = scan  ·  Verstopper <b>${names[hiI()]}</b>: <b>A</b> = ontkleden · <b>B</b> = afleiding`);
      hud.showBig('OGEN OPEN!', 900, '#ffe14a'); audio.sfx('go', { vol: 0.4 }); audio.sfx('whoosh', { vol: 0.4 });
      fx.particles.burst(Sk.x, 1.5, Sk.z, { count: 30, speed: 6, up: 1, life: 0.8, size: 0.4, colors: [0xffe9a0, 0xffffff], gravity: 3 });
    }
    function autoDisguise() { const p = nearestProp(H.x, H.z, 99); if (p) { H.x = p.x + (H.x < p.x ? -1 : 1) * (p.r + 0.9); H.z = p.z + 0.4; } disguiseAs(p); }
    function refreshHud() {
      hud.setScore(`Ronde ${Math.min(2, S.round + 1)}/2 · ${names[0]} ${Math.round(pts[0])} – ${Math.round(pts[1])} ${names[1]}`);
      for (let i = 0; i < 2; i++) {
        let tx;
        if (i === S.hider) tx = S.phase === 'hunt' || S.phase === 'prep' ? `Verstopper · ${H.dis ? KINDS[H.kind].name : 'zonder voorwerp'} · afleiding ${H.cdDecoy > 0 ? Math.ceil(H.cdDecoy) + 's' : 'klaar'}` : 'Verstopper';
        else tx = `Zoeker · kansen: ${Sk.chances} · scan ${Sk.scanCd > 0 ? Math.ceil(Sk.scanCd) + 's' : 'klaar'}`;
        hud.setPlayerInfo(i, tx);
      }
    }

    // ---------------- verkleden ----------------
    function disguiseAs(p) {
      if (!p) return false;
      const sz = pv.size(hiI());
      H.kind = p.kind; H.dis = true; H.popped = false; H.disT = S.t; H.cdPop = S.phase === 'hunt' ? 7 : 0;
      H.prop = W.addInstance(p.kind, H.x, H.z, sz); if (H.prop) { H.prop.breath = true; H.prop.rot = Math.random() * TAU; }
      P[hiI()].vis = false; burst(H.x, 0.9, H.z, 22, [0xffffff, 0xd8c8ff, 0xffe14a], 4, 1.2); audio.sfx('pop', { vol: 0.6 }); audio.sfx('sparkle', { vol: 0.3 });
      fx.texts.add(KINDS[p.kind].name + '!', H.x, 2.2, H.z, '#ffe9a0', 1.1);
      return true;
    }
    function tryDisguise() {
      const p = nearestProp(H.x, H.z, DISGUISE_REACH);
      if (!p) { fx.texts.add('Geen voorwerp!', H.x, 2.4, H.z, '#ff8a8a', 1); audio.sfx('buzz', { vol: 0.4 }); return false; }
      // niet precies op het origineel gaan staan: schuif er een stukje naast
      const dx = H.x - p.x, dz = H.z - p.z, d = Math.hypot(dx, dz); const m = p.r + 0.8;
      if (d < m) { const k = d > 1e-3 ? 1 / d : 0; const nx = d > 1e-3 ? dx * k : 1, nz = d > 1e-3 ? dz * k : 0; H.x = p.x + nx * m; H.z = p.z + nz * m; pushOut(H, 0.5); }
      return disguiseAs(p);
    }
    function undisguise() {
      if (!H.dis) return; if (H.prop) { W.removeInstance(H.prop); H.prop = null; }
      H.dis = false; P[hiI()].vis = true; P[hiI()].x = H.x; P[hiI()].z = H.z;
      burst(H.x, 0.9, H.z, 24, [0xffffff, 0xaaaaaa, P[hiI()].c ? 0x66ff99 : 0xffffff], 4, 1);
      audio.sfx('whoosh', { vol: 0.4 });
    }

    // ---------------- zoeker: tikken en scannen ----------------
    function onFound() {
      if (S.phase !== 'hunt') return;
      const hiP = Math.max(0, HUNT_T - S.left), seP = Math.max(0, S.left); endRound('found', hiP, seP);
    }
    function wrongTap(best) {
      Sk.stun = 1.15; Sk.chances--; S.left -= 2; S.stats.wrong++;
      P[seI()].c.pose = 'scared'; ctx.shake(0.35); audio.sfx('hurt', { vol: 0.5 }); audio.sfx('thud', { vol: 0.5 });
      let txt;
      if (best.type === 'prop') { best.obj.shake = 1.0; txt = pick(BAD_TAPS).replace('{k}', KINDS[best.obj.kind].name); }
      else if (best.type === 'npc') { crowd.hop(best.obj); txt = `Hé! Dat is ${pick(NPC_NAMES)}!`; audio.sfx('hit', { vol: 0.4, rate: 0.7 }); }
      else { CH.hop = 0.7; txt = 'De kip pikt je in je teen!'; }
      fx.texts.add(txt, best.x, 2.6, best.z, '#ff8a8a', 1.3); hud.toast(`${txt}  (-2 s, nog ${Sk.chances} kansen)`, 1600);
      burst(best.x, 1.2, best.z, 12, [0xffe14a, 0xffffff], 3, 1.2);
      for (let k = 0; k < 3; k++) fx.particles.emit(Sk.x + rand(-0.4, 0.4), 2.2, Sk.z + rand(-0.4, 0.4), rand(-1, 1), 0.5, rand(-1, 1), { life: 0.8, size: 0.35, color: 0xffe14a, gravity: 0 });
      if (Sk.chances <= 0) endRound('chances', HUNT_T, 0);
      else if (S.left <= 0) endRound('time', HUNT_T, 0);
    }
    function tap() {
      Sk.tapCd = 0.45; P[seI()].c.swing(); audio.sfx('swing', { vol: 0.4 });
      const reach = TAP_REACH * pv.size(seI()) * (S.help === seI() ? 1.3 : 1);
      let best = null, bd = 1e9;
      const consider = (type, obj, x, z, r) => { const d = Math.hypot(Sk.x - x, Sk.z - z) - r; if (d < reach && d < bd) { bd = d; best = { type, obj, x, z }; } };
      for (const p of W.props) consider('prop', p, p.x, p.z, p.r);
      if (H.dis && H.prop) consider('hider', H, H.x, H.z, H.prop.r); else if (!H.dis && P[hiI()].vis) consider('hider', H, H.x, H.z, 0.55);
      const nn = crowd.nearest(Sk.x, Sk.z, reach); if (nn && nn.d < bd) { bd = nn.d; best = { type: 'npc', obj: nn.o, x: nn.o.x, z: nn.o.z }; }
      if (CH.on) consider('chicken', CH, CH.x, CH.z, 0.5);
      if (!best) { fx.particles.dust(Sk.x + Math.sin(P[seI()].yaw) * 1.2, 0.1, Sk.z + Math.cos(P[seI()].yaw) * 1.2, 3); return; }
      if (best.type === 'hider') onFound(); else wrongTap(best);
    }
    function scan() {
      const R = SCAN_R * (S.help === seI() ? 1.35 : 1);
      Sk.scanCd = SCAN_CD * (S.help === seI() ? 0.7 : 1); S.stats.scans++;
      scanFx = { t: 0, x: Sk.x, z: Sk.z, R, hit: false }; Sk.scanBoost = 1;
      audio.sfx('sparkle', { vol: 0.7 }); audio.tone(660, 0.5, { type: 'sine', vol: 0.12, slide: 1320 }); ctx.shake(0.1);
      P[seI()].c.swing();
    }

    // ---------------- verstopper: afleiding ----------------
    function doDecoy() {
      H.cdDecoy = (S.help === hiI() ? 3.5 : 7); S.stats.decoys++;
      const cand = W.props.filter((p) => { const d = Math.hypot(p.x - H.x, p.z - H.z); return d > 3.5 && d < 14 && !(H.prop && p.kind === H.kind && d < 1); });
      const p = cand.length ? pick(cand) : pick(W.props);
      p.shake = 1.5; if (!shaking.includes(p)) shaking.push(p);
      decoy.x = p.x; decoy.z = p.z; decoy.t = 7; CH.decoyT = 7; CH.mode = 'walk';
      audio.sfx('knock', { vol: 0.5 }); audio.tone(520, 0.1, { type: 'square', vol: 0.06, slide: 300 }); fx.texts.add('klop klop!', p.x, 2.2, p.z, '#cfe8ff', 1.1);
      burst(p.x, 0.6, p.z, 14, [0xd8c8a8, 0xffffff], 3, 1);
      hud.toast(`${names[hiI()]} maakt afleiding!`, 900);
    }

    // ---------------- einde van een ronde ----------------
    function endRound(kind, hiP, seP) {
      if (S.phase !== 'hunt') return;
      S.phase = 'found'; S.t = 0; S.over = true; hud.setTimer(null);
      const hi = hiI(), se = seI(); pts[hi] += hiP; pts[se] += seP; S.results.push({ kind, hider: hi, hiP, seP });
      if (kind === 'found') S.stats.found++;
      // onthullen
      const x = H.x, z = H.z; if (H.dis) undisguise(); P[hi].vis = true; P[hi].x = x; P[hi].z = z;
      if (kind === 'found') {
        P[se].c.pose = 'cheer'; P[hi].c.pose = 'sad'; hud.showBig('GEVONDEN!', 1500, '#ffe14a'); audio.sfx('win', { vol: 0.6 }); audio.sfx('bell', { vol: 0.5 });
        fx.particles.burst(x, 1.4, z, { count: 60, speed: 8, up: 1.4, life: 1.2, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); ctx.shake(0.6);
        hud.toast(`${names[se]} vond ${names[hi]} na ${hiP.toFixed(1)} s!  ${names[hi]} +${Math.round(hiP)} · ${names[se]} +${Math.round(seP)}`, 2600);
      } else {
        P[hi].c.pose = 'cheer'; P[se].c.pose = 'sad'; hud.showBig(kind === 'chances' ? 'GEEN KANSEN MEER!' : 'NIET GEVONDEN!', 1500, '#8dff9a'); audio.sfx('win', { vol: 0.5 });
        hud.toast(`${names[hi]} bleef ${Math.round(HUNT_T)} s ongezien!  +${Math.round(hiP)} punten`, 2600);
        fx.particles.burst(x, 1.4, z, { count: 40, speed: 7, up: 1.4, life: 1.1, size: 0.45, colors: [0x8dff9a, 0xffffff, 0xffe14a], gravity: 5 }); ctx.shake(0.3);
      }
      halo.visible = false; excl.visible = false; scanRing.material.opacity = 0; D.state === 'stare' && (W.gate.target = 0); W.gate.target = 0; D.state = 'idle';
      refreshHud();
    }
    function finishMatch() {
      if (finished) return; finished = true;
      let w = pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1, coin = false; if (Math.abs(pts[0] - pts[1]) < 0.05) { w = Math.random() < 0.5 ? 0 : 1; coin = true; }
      const l = 1 - w, diff = Math.abs(pts[0] - pts[1]);
      const jokes = [`${names[w]} is de meester-verkleder van de kermis! ${names[l]} tikte nog een ton aan voor de zekerheid.`, `${names[w]} verdween tussen de kermisspullen als een echte tonnenspion. ${names[l]} zoekt nog.`, `Gevonden of niet: ${names[w]} had de beste neus en het beste verstopje.`, `De kip keek tevreden naar ${names[w]}. ${names[l]} kreeg een veertje als troostprijs.`];
      const extra = coin ? ' Precies gelijk! De kip koos zelf de winnaar.' : diff < 3 ? ' Dat was op het nippertje!' : '';
      ctx.finishPvp({ winner: w, score: [Math.round(pts[0]), Math.round(pts[1])], delay: 700, summary: `${pick(jokes)}${extra} (gevonden: ${S.stats.found} van 2, ${S.stats.wrong} foute tikken, ${S.stats.decoys} afleidingen).` });
      P[w].c.pose = 'cheer'; P[l].c.pose = 'sad'; P[0].vis = P[1].vis = true; P[w].lan.visible = false; P[l].lan.visible = false; setMsg(''); setVig(0, 0, 9999, 9999, 0, 0, 0);
      P[w].x = -2.2 + 4.4 * w; P[l].x = -2.2 + 4.4 * l; P[w].z = P[l].z = 3; clearHider();
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      dt = Math.min(dt, 0.05); Tm += dt; S.t += dt;
      if (!S.started) { S.started = true; startRound(0); }
      if (Tm > 260 && !finished && S.phase !== 'end') { S.phase = 'end'; finishMatch(); }
      const hi = hiI(), se = seI(), inH = pv.input(hi), inS = pv.input(se);
      let freeze = false;
      if (S.phase === 'intro') { if (S.t > INTRO_T) enterPrep(); }
      else if (S.phase === 'prep') {
        S.prepT -= dt; moveWith(H, inH, PREP_SPEED * pv.speed(hi), dt); pushOut(H, 0.55); P[hi].x = H.x; P[hi].z = H.z;
        if (inH.aP) { if (H.dis) { undisguise(); H.disT = 0; } else tryDisguise(); }
        if (H.dis) { H.vx = H.vz = 0; if (S.t - H.disT > 2.0 || S.prepT <= 0) enterHunt(); }
        else if (S.prepT <= 0) enterHunt();
        const left = Math.max(0, Math.ceil(S.prepT));
        setMsg(`<div style="font-size:60px">${names[se]}: OGEN DICHT!</div><div style="font-size:30px;color:#fff;margin-top:6px">${names[hi]} verstopt zich... ${left}</div>`, 60);
      } else if (S.phase === 'hunt') {
        updateHunt(dt, inH, inS); freeze = D.state === 'stare';
      } else if (S.phase === 'found') {
        if (S.t > FOUND_T) { if (S.round === 0) startRound(1); else { S.phase = 'end'; finishMatch(); } }
      }
      crowd.update(dt, freeze, [{ x: Sk.x, z: Sk.z, r: 0.6 }, ...(P[hi].vis ? [{ x: H.x, z: H.z, r: 0.6 }] : [])], Tm);
      refreshHud();
      visuals(dt);
    }

    function updateHunt(dt, inH, inS) {
      const hi = hiI(), se = seI();
      S.left -= dt; hud.setTimer(Math.max(0, S.left), 8);
      Sk.tapCd = Math.max(0, Sk.tapCd - dt); Sk.scanCd = Math.max(0, Sk.scanCd - dt); H.cdPop = Math.max(0, H.cdPop - dt); H.cdDecoy = Math.max(0, H.cdDecoy - dt); H.reveal = Math.max(0, H.reveal - dt); Sk.scanBoost = Math.max(0, Sk.scanBoost - dt * 1.4);
      decoy.t = Math.max(0, decoy.t - dt); CH.decoyT = Math.max(0, CH.decoyT - dt);
      if (S.left <= 0) { endRound('time', HUNT_T, 0); return; }
      // Deurman-poort
      D.t += dt; const wasStare = D.state === 'stare';
      if (D.state === 'idle') { D.next -= dt; if (D.next <= 0 && S.left > 4) { D.state = 'warn'; D.t = 0; W.gate.target = 1; audio.sfx('creak', { vol: 0.7 }); hud.toast('De poort kraakt open...', 1200); } }
      else if (D.state === 'warn') { if (D.t > 0.9) { D.state = 'stare'; D.t = 0; D.punished = false; S.stats.deur++; audio.sfx('heartbeat', { vol: 0.6 }); hud.showBig('NIET BEWEGEN!', 900, '#ff6a6a'); ctx.shake(0.3); } }
      else if (D.state === 'stare') { if (D.t > 1.7) { D.state = 'idle'; D.next = 11 + Math.random() * 4; W.gate.target = 0; audio.sfx('door', { vol: 0.5 }); } }
      const frozen = D.state === 'stare';
      // ----- zoeker -----
      if (Sk.stun > 0) { Sk.stun -= dt; if (Sk.stun <= 0) P[se].c.pose = 'carry'; }
      if (Sk.stun <= 0 && !frozen) {
        moveWith(Sk, inS, SEEK_SPEED * pv.speed(se), dt); pushOut(Sk, 0.5); pushOutProps(Sk, 0.35);
        if (inS.aP && Sk.tapCd <= 0) tap();
        if (inS.bP && Sk.scanCd <= 0) scan();
      } else { Sk.vx = Sk.vz = 0; if (frozen) P[se].c.pose = 'scared'; }
      if (!frozen && Sk.stun <= 0 && P[se].c.pose === 'scared') P[se].c.pose = 'carry';
      // ----- verstopper -----
      const moveMag = Math.hypot(inH.x, inH.y);
      if (frozen && !D.punished && (moveMag > 0.2 || inH.aP || inH.bP) && S.phase === 'hunt') {
        D.punished = true; H.reveal = 3.2; fx.texts.add('BEWOOGEN!', H.x, 2.8, H.z, '#ff6a6a', 1.6); audio.sfx('bad', { vol: 0.5 }); hud.toast(`${names[hi]} bewoog voor de Deurman!`, 1600);
      }
      if (!frozen) {
        if (H.dis) {
          H.vx = damp(H.vx, inH.x * WADDLE * pv.speed(hi), lerp(14, 3, SLIP), dt); H.vz = damp(H.vz, inH.y * WADDLE * pv.speed(hi), lerp(14, 3, SLIP), dt);
          H.x += H.vx * dt; H.z += H.vz * dt; pushOut(H, 0.5);
          const sp = Math.hypot(H.vx, H.vz);
          if (H.prop) {
            H.prop.x = H.x; H.prop.z = H.z;
            if (sp > 0.25) { H.prop.shake = 0.35; H.stepT -= dt; if (H.stepT <= 0) { H.stepT = 0.28; fx.particles.dust(H.x, 0.05, H.z, 2); audio.sfx('step', { vol: 0.25, rate: 0.6 }); } }
          }
          if (inH.aP && H.cdPop <= 0) { S.stats.pops++; undisguise(); H.popped = true; H.hopT = 0; P[hi].vis = true; hud.toast(`${names[hi]} sprint weg! Druk A bij een voorwerp om je te verstoppen`, 1500); }
          else if (inH.aP) { fx.texts.add('wacht even...', H.x, 2.2, H.z, '#cfcfcf', 0.9); }
          H.sparkT -= dt; const dd = Math.hypot(Sk.x - H.x, Sk.z - H.z);
          if (dd < 3.4 && H.sparkT <= 0) { H.sparkT = 0.8 + Math.random() * 0.5; fx.particles.emit(H.x + rand(-0.3, 0.3), 1.4, H.z + rand(-0.3, 0.3), 0, 0.8, 0, { life: 0.6, size: 0.22, color: 0xfff0a0, gravity: 0 }); }
        } else {
          moveWith(H, inH, RUN_SPEED * pv.speed(hi), dt); pushOut(H, 0.5); P[hi].x = H.x; P[hi].z = H.z;
          if (inH.aP) tryDisguise();
        }
        if (H.dis && inH.bP && H.cdDecoy <= 0) doDecoy(); else if (!H.dis && inH.bP && H.cdDecoy <= 0) doDecoy();
      } else { H.vx = H.vz = 0; }
      // ----- scan-flits -----
      if (scanFx) {
        scanFx.t += dt; const u = clamp(scanFx.t / 0.9, 0, 1), r = scanFx.R * (1 - Math.pow(1 - u, 2));
        scanRing.position.set(scanFx.x, 0.1, scanFx.z); scanRing.scale.setScalar(Math.max(0.1, r)); scanRing.material.opacity = (1 - u) * 0.9;
        if (!scanFx.hit && H.dis && Math.hypot(H.x - scanFx.x, H.z - scanFx.z) <= r) { scanFx.hit = true; H.reveal = 2.2; audio.sfx('ding', { vol: 0.8 }); fx.texts.add('GLINSTER!', H.x, 2.6, H.z, '#fff08a', 1.6); burst(H.x, 1.0, H.z, 24, [0xfff08a, 0xffffff], 3, 1.5); }
        if (u >= 1) { scanFx = null; scanRing.material.opacity = 0; }
      }
      // ----- verraderkip -----
      updateChicken(dt);
      // ----- schuddende voorwerpen -----
      for (let i = shaking.length - 1; i >= 0; i--) { const p = shaking[i]; p.shake -= dt * 1.2; if (p.shake <= 0) { p.shake = 0; shaking.splice(i, 1); } W.writeProp(p, Tm); }
    }
    function updateChicken(dt) {
      if (!CH.on) return;
      const tgx = CH.decoyT > 0 ? decoy.x : H.x, tgz = CH.decoyT > 0 ? decoy.z : H.z;
      const dx = tgx - CH.x, dz = tgz - CH.z, d = Math.hypot(dx, dz); const spd = CH_SPD * (S.help === hiI() ? 0.65 : 1);
      CH.hop = Math.max(0, CH.hop - dt * 2);
      if (d > 2.5) { CH.mode = 'walk'; CH.x += dx / d * spd * dt + Math.sin(Tm * 3) * 0.01; CH.z += dz / d * spd * dt; hen.targetYaw = Math.atan2(dx, dz); hen.speed = 0.8; excl.visible = false; }
      else {
        CH.mode = 'betray'; hen.speed = 0; hen.targetYaw = Math.atan2(dx, dz);
        CH.cluck -= dt; if (CH.cluck <= 0) {
          CH.cluck = 1.2; S.stats.clucks++; const ds = Math.hypot(Sk.x - CH.x, Sk.z - CH.z); const v = clamp(0.55 - ds * 0.02, 0.18, 0.55);
          audio.tone(520, 0.1, { type: 'square', vol: 0.12 * v / 0.4, slide: 900 }); audio.tone(780, 0.12, { type: 'square', vol: 0.1 * v / 0.4, slide: 380, delay: 0.1 }); audio.tone(620, 0.1, { type: 'square', vol: 0.1 * v / 0.4, slide: 300, delay: 0.24 });
          fx.texts.add(Math.random() < 0.5 ? 'KOKOKO!' : 'KO-KO-KOEK!', CH.x, 2.3, CH.z, '#fff6a8', 1.3); CH.hop = 1;
          fx.particles.burst(CH.x, 0.9, CH.z, { count: 8, speed: 3, up: 1.4, life: 0.8, size: 0.28, colors: [0xffffff, 0xf6f1e4], gravity: 3 });
        }
        excl.visible = true; excl.position.set(CH.x, 2.2 + Math.abs(Math.sin(Tm * 8)) * 0.2, CH.z);
      }
    }

    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(0, 0, -0.2), camDir = new THREE.Vector3(0, Math.sin(0.98), Math.cos(0.98)), camBase = new THREE.Vector3(), tmpV = new THREE.Vector3();
    const fitPts = [[-PLAZA.X - 3, 0, PLAZA.Z + 1.5], [PLAZA.X + 3, 0, PLAZA.Z + 1.5], [-PLAZA.X - 3, 0, -PLAZA.Z - 1], [PLAZA.X + 3, 0, -PLAZA.Z - 1], [-18, 7, -15], [18, 7, -15]];
    let fitDist = 40, lastAspect = 0;
    function fitCamera() {
      let lo = 14, hi2 = 160;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi2) / 2; camera.position.copy(camLook).addScaledVector(camDir, d); camera.lookAt(camLook); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { tmpV.set(q[0], q[1], q[2]).project(camera); if (Math.abs(tmpV.x) > 0.97 || tmpV.y > 0.93 || tmpV.y < -0.95) { ok = false; break; } }
        if (ok) hi2 = d; else lo = d;
      }
      fitDist = hi2; lastAspect = camera.aspect;
    }
    fitCamera();
    const up3 = new THREE.Vector3(0, 1, 0), off = new THREE.Vector3(), look = new THREE.Vector3();
    function updateCamera(dt) {
      if (Math.abs(camera.aspect - lastAspect) > 0.001) fitCamera();
      let yaw = 0, zoom = 1, hy = 0;
      if (S.phase === 'intro') { const k = smoothstep(0, INTRO_T, S.t); yaw = (1 - k) * (S.round ? -1.5 : 1.5); zoom = 1 + (1 - k) * 0.2; hy = (1 - k) * 0.5; }
      else if (S.phase === 'idle' || !S.started) { yaw = Math.sin(introT * 0.3) * 0.12; }
      const tf = S.phase === 'found' ? Math.min(1, S.t / 0.7) : 0; camFocusK = damp(camFocusK, tf, 4, dt);
      look.set(camLook.x + H.x * 0.45 * camFocusK, 0, camLook.z + H.z * 0.45 * camFocusK);
      off.copy(camDir); off.y += hy; off.normalize().applyAxisAngle(up3, yaw).multiplyScalar(fitDist * zoom * (1 - 0.1 * camFocusK));
      camera.position.copy(look).add(off); camera.lookAt(look);
    }
    function placePuppet(p, dt, speedFrac) {
      const c = p.c; p.holder.visible = p.vis;
      const mvx = p === P[seI()] ? Sk.vx : (p === P[hiI()] ? H.vx : 0), mvz = p === P[seI()] ? Sk.vz : (p === P[hiI()] ? H.vz : 0);
      p.holder.position.set(p.x, p.y, p.z); c.speed = clamp(Math.hypot(mvx, mvz) / 6.5, 0, 1) * speedFrac; if (Math.hypot(mvx, mvz) > 0.3) c.faceDir(mvx, mvz); c.update(dt);
      p.tag.visible = p.vis; p.tag.position.set(p.x, 2.7 * pv.size(p.i) * (1.7 / 1.84) + 0.2, p.z); p.ring.visible = p.vis; p.ring.position.set(p.x, 0.06, p.z); p.shadow.visible = p.vis; p.shadow.position.set(p.x, 0.03, p.z);
    }
    function visuals(dt) {
      const hi = hiI(), se = seI();
      // zoeker volgt Sk, verstopper-poppetje volgt H
      P[se].x = Sk.x; P[se].z = Sk.z; if (S.phase !== 'found' && S.phase !== 'end') { P[hi].x = H.x; P[hi].z = H.z; }
      const idleSeeker = S.phase === 'prep' || S.phase === 'intro';
      placePuppet(P[se], dt, 1); placePuppet(P[hi], dt, 1);
      if (idleSeeker) P[se].c.faceDir(0, -1);
      // lantaarnlicht en -vlek
      const seekerOn = S.phase === 'hunt' || S.phase === 'found';
      const lampI = S.phase === 'hunt' ? 55 : S.phase === 'found' ? 25 : 8; lamp.intensity = damp(lamp.intensity, D.state === 'warn' || D.state === 'stare' ? lampI * (Math.random() < 0.5 ? 0.2 : 1) : lampI, 20, dt);
      lamp.position.set(Sk.x, 2.1, Sk.z); pool.position.set(Sk.x, 0.05, Sk.z); pool.scale.setScalar(S.phase === 'hunt' ? 12 + Sk.scanBoost * 8 : 7); pool.material.opacity = S.phase === 'hunt' ? 0.9 : 0.3;
      // voorwerpen: verstopper ademt/wobbelt
      if (H.prop) { H.prop.x = H.x; H.prop.z = H.z; if (H.prop.shake > 0) H.prop.shake = Math.max(0, H.prop.shake - dt * 2); W.writeProp(H.prop, Tm); }
      // glinstering (onthulling)
      if (H.reveal > 0 && H.dis) {
        halo.visible = true; halo.position.set(H.x, 1.3, H.z); halo.scale.setScalar(3.2 + Math.sin(Tm * 14) * 0.5); halo.material.opacity = Math.min(1, H.reveal);
        if (Math.random() < dt * 25) fx.particles.emit(H.x + rand(-0.6, 0.6), 0.6 + Math.random() * 1.2, H.z + rand(-0.6, 0.6), 0, 1.2, 0, { life: 0.6, size: 0.3, color: 0xfff08a, gravity: -0.5 });
      } else halo.visible = false;
      // verraderkip
      hen.group.visible = CH.on; if (CH.on) { hen.update(dt); hen.group.position.set(CH.x, hen.group.position.y + CH.hop * 0.5, CH.z); if (CH.mode === 'betray') hen.group.rotation.z = Math.sin(Tm * 26) * CH.hop * 0.3; else hen.group.rotation.z = 0; }
      // schaduwen van dorpelingen
      crowd.npcs.forEach((o, i) => { dummy.position.set(o.x, 0.03, o.z); dummy.scale.setScalar(0.6 * o.scale); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); npcBlobs.setMatrixAt(i, dummy.matrix); }); npcBlobs.instanceMatrix.needsUpdate = true;
      // overlay
      updateOverlay(dt);
      W.update(Tm + introT, dt);
      updateCamera(dt);
    }
    function updateOverlay(dt) {
      if (!ensureOv()) return;
      const cw = renderer.domElement.clientWidth || 1100, ch = renderer.domElement.clientHeight || 650;
      if (S.phase === 'prep') {
        const [sx, sy] = toScreen(H.x, 0.8, H.z); const ppu = pxPerUnit(H.x, H.z);
        setVig(sx, sy, ppu * 3.2, ppu * 5.2, 0, 0.55, 0.97);
      } else if (S.phase === 'hunt' || S.phase === 'found') {
        const [sx, sy] = toScreen(Sk.x, 0.8, Sk.z); const ppu = pxPerUnit(Sk.x, Sk.z); const R = (S.phase === 'found' ? 14 : 5.3 * (S.help === hiI() ? 0.85 : 1) + Sk.scanBoost * 4) * ppu;
        const fl = D.state === 'warn' || D.state === 'stare' ? (Math.random() < 0.3 ? 0.97 : 0.8) : 0.76;
        setVig(sx, sy, R * 0.55, R, 0, 0.42, S.phase === 'found' ? 0 : fl);
        if (flashT > 0) { flashT -= dt; }
      } else if (S.phase === 'intro') { setVig(cw / 2, ch / 2, 9999, 9999, 0, 0, 0); }
      if (S.phase !== 'prep' && S.phase !== 'hunt') setMsg('');
      if (S.phase === 'hunt') setMsg('');
    }
    function introUpdate(dt) {
      introT += dt; Tm += dt;
      if (!S.started) { for (const p of P) { p.c.pose = 'idle'; } P[0].x = -3; P[0].z = 6; P[1].x = 3; P[1].z = 6; P[0].c.faceDir(0.4, 1); P[1].c.faceDir(-0.4, 1); P[0].yaw = P[0].c.targetYaw; P[1].yaw = P[1].c.targetYaw; for (const p of P) { p.vis = true; p.holder.visible = true; } }
      crowd.update(dt, false, [{ x: P[0].x, z: P[0].z, r: 1 }, { x: P[1].x, z: P[1].z, r: 1 }], Tm);
      for (const p of P) { p.holder.position.set(p.x, 0, p.z); p.c.update(dt); p.tag.position.set(p.x, 2.7, p.z); p.ring.position.set(p.x, 0.06, p.z); p.shadow.position.set(p.x, 0.03, p.z); }
      crowd.npcs.forEach((o, i) => { dummy.position.set(o.x, 0.03, o.z); dummy.scale.setScalar(0.6 * o.scale); dummy.updateMatrix(); npcBlobs.setMatrixAt(i, dummy.matrix); }); npcBlobs.instanceMatrix.needsUpdate = true;
      W.update(Tm, dt); updateCamera(dt); lamp.intensity = 0; pool.visible = false; setVig(0, 0, 9999, 9999, 0, 0, 0.0);
    }
    function resultUpdate(dt) {
      Tm += dt; crowd.update(dt, false, [], Tm); for (const p of P) { p.holder.position.set(p.x, 0, p.z); p.c.update(dt); p.tag.position.set(p.x, 2.7, p.z); p.ring.position.set(p.x, 0.06, p.z); p.shadow.position.set(p.x, 0.03, p.z); }
      W.update(Tm, dt); updateCamera(dt);
    }
    refreshHud();

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } if (!pool.visible) pool.visible = true; update(dt); },
      introUpdate, resultUpdate,
      onResize() { lastAspect = 0; },
      onSwap() { for (const p of P) burst(p.x, 1.5, p.z, 16, [0xffe14a, 0xffffff], 4, 1); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { pts[i] -= 3; fx.texts.add('-3 DEURMAN!', i === hiI() ? H.x : Sk.x, 2.8, i === hiI() ? H.z : Sk.z, '#ff6a6a', 1.6); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
        refreshHud();
      },
      celebrate(w) { P[w].c.pose = 'cheer'; P[1 - w].c.pose = 'sad'; },
      dispose() { if (ov) ov.remove(); crowd.dispose(); },
      dbg: {
        state: () => ({ T: Tm, phase: S.phase, round: S.round, hider: S.hider, left: S.left, prepT: S.prepT, pts: [...pts], chances: Sk.chances, help: S.help, finished, results: S.results.map((r) => ({ ...r })), stats: { ...S.stats },
          H: { dis: H.dis, kind: H.kind, x: H.x, z: H.z, popped: H.popped, cdPop: H.cdPop, cdDecoy: H.cdDecoy, reveal: H.reveal }, Sk: { x: Sk.x, z: Sk.z, stun: Sk.stun, scanCd: Sk.scanCd, tapCd: Sk.tapCd }, D: D.state, chicken: { x: CH.x, z: CH.z, mode: CH.mode }, props: W.props.length, npcs: crowd.npcs.length }),
        setLeft: (t) => { S.left = t; }, setPts: (a, b) => { pts[0] = a; pts[1] = b; }, startDeur: () => { D.next = 0; }, doScan: () => scan(), doDecoy: () => doDecoy(), skipPrep: () => { if (S.phase === 'prep') S.prepT = 0.01; },
        W, H, Sk, S, crowd, CH,
      },
    };
  },
};

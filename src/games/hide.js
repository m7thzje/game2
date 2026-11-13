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
  players: [2, 3, 4],   // 2 = twee rondes met rolwissel; 4 = vier rondes, elk poppetje is één keer verstopper tegen drie zoekers
  time: 75,
  music: 'tense',
  blurb: 'Met <b>4 spelers</b> is elke ronde één verstopper tegen <b>drie zoekers</b> (vier rondes, iedereen verstopt zich één keer; de snelste vinder pakt de punten). Nacht op de <b>kermis</b>! De <b>verstopper</b> verkleedt zich als voorwerp terwijl de zoeker <b>ogen dicht</b> heeft. De <b>zoeker</b> heeft een lantaarn. Na 28 s wisselen jullie! Punten: ongezien blijven of snel vinden.',
  controls: ['{move} lopen (als voorwerp: schuifelen)', 'Zoeker: {a} tik · {b} scan', 'Verstopper: {a} ontkleden · {b} afleiding'],
  tip: 'Pas op voor de verraderkip en de Deurman: stil staan!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud, renderer } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tw = ctx.twist.id;
    const N = players.length, NS = N - 1;   // NS = aantal zoekers per ronde
    const HUNT_T = N > 2 ? 24 : 28;         // bij 4 spelers iets korter (vier rondes)
    const ROUNDS = N === 2 ? 2 : N;
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
    const lamps = Array.from({ length: NS }, () => { const l = new THREE.PointLight(0xffd9a0, 0, 16, 2); scene.add(l); return l; });
    const poolTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,225,150,.55)'); gr.addColorStop(0.6, 'rgba(255,200,110,.2)'); gr.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const pools = Array.from({ length: NS }, () => { const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; pool.scale.setScalar(14); scene.add(pool); return pool; });

    // ---------------- verraderkip ----------------
    const hen = new Animal('chicken'); hen.group.scale.setScalar(1.5); scene.add(hen.group); hen.group.visible = false;
    const CH = { x: 0, z: 0, mode: 'wait', cluck: 0.4, hop: 0, decoyT: 0, dx: 0, dz: 0, on: false };
    const exclTex = canvasTex(64, 64, (g) => { g.font = 'bold 56px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#300'; g.strokeText('!', 32, 34); g.fillStyle = '#ffe14a'; g.fillText('!', 32, 34); });
    const excl = new THREE.Sprite(new THREE.SpriteMaterial({ map: exclTex, transparent: true, depthTest: false })); excl.scale.set(1.2, 1.2, 1); excl.renderOrder = 18; excl.visible = false; scene.add(excl);

    // ---------------- glinster-effecten ----------------
    const starTex = canvasTex(128, 128, (g) => { g.translate(64, 64); const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,240,150,.7)'); gr.addColorStop(1, 'rgba(255,220,100,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); g.fillStyle = 'rgba(255,255,255,.95)'; for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-60, 0); g.lineTo(0, -4); g.lineTo(60, 0); g.lineTo(0, 4); g.closePath(); g.fill(); } });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending })); halo.renderOrder = 17; halo.visible = false; scene.add(halo);
    const scanRings = Array.from({ length: NS }, () => { const r = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); r.rotation.x = -Math.PI / 2; r.position.y = 0.1; scene.add(r); return r; });

    // ---------------- toestand ----------------
    const order0 = players.map((_, i) => i); for (let i = order0.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order0[i], order0[j]] = [order0[j], order0[i]]; }   // volgorde van de verstoppers
    const S = { phase: 'idle', round: 0, order: order0, get first() { return this.order[0]; }, set first(v) { this.order = N === 2 ? [v, 1 - v] : [v, ...this.order.filter((q) => q !== v)]; }, hider: 0, t: 0, left: HUNT_T, prepT: PREP_T, started: false, help: -1, over: false, results: [], stats: { found: 0, wrong: 0, scans: 0, decoys: 0, pops: 0, deur: 0, clucks: 0 } };
    const pts = new Array(N).fill(0); let finished = false, Tm = 0, introT = 0, camFocusK = 0, flashT = 0;
    const H = { dis: false, prop: null, kind: '', x: 0, z: 0, vx: 0, vz: 0, popped: false, cdPop: 0, cdDecoy: 0, reveal: 0, disT: 0, stepT: 0, sparkT: 0, hopT: 0 };
    const K = Array.from({ length: NS }, (_, j) => ({ j, slot: -1, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, stun: 0, tapCd: 0, scanCd: 0, chances: CHANCES, scanBoost: 0, out: false }));   // de zoekers van deze ronde
    const Sk = K[0];   // (N=2: de enige zoeker)
    const D = { state: 'idle', t: 0, next: 12, punished: false };
    const decoy = { x: 0, z: 0, t: 0 };
    const scanFxs = new Array(NS).fill(null); const shaking = [];
    const hiI = () => S.hider, seI = () => (N === 2 ? 1 - S.hider : -1);
    const seekSlots = () => players.map((_, i) => i).filter((i) => i !== S.hider);
    const kOf = (slot) => K.find((k) => k.slot === slot) || null;
    const nameList = (slots) => slots.map((i) => names[i]).join(' & ');
    const role = (i) => (i === S.hider ? 'verstopper' : 'zoeker');
    const colCss = players.map((p) => p.css);

    // ---------------- overlay (donker scherm / lantaarn) ----------------
    let ov = null, vig = null, msg = null, lastVig = '', cv = null, cg = null;
    function ensureOv() {
      if (ov && ov.isConnected) return true;
      const hudEl = document.getElementById('hud'); if (!hudEl) return false;
      ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
      vig = document.createElement('div'); vig.style.cssText = 'position:absolute;inset:0'; ov.append(vig);
      if (N > 2) { cv = document.createElement('canvas'); cv.width = 440; cv.height = 260; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; ov.append(cv); cg = cv.getContext('2d'); }   // meerdere lantaarns: donkere laag met gaten
      msg = document.createElement('div'); msg.style.cssText = 'position:absolute;left:0;right:0;top:14%;text-align:center;font-family:MedievalSharp,serif;color:#ffe9a0;text-shadow:0 4px 0 #000,0 0 24px rgba(255,200,80,.6);line-height:1.05';
      ov.append(msg); hudEl.prepend(ov); lastVig = ''; return true;
    }
    function setVig(cx, cy, r0, r1, a0, a1, rest) {
      if (!ensureOv()) return;
      const s = `radial-gradient(circle at ${cx.toFixed(0)}px ${cy.toFixed(0)}px, rgba(4,6,20,${a0}) ${r0.toFixed(0)}px, rgba(4,6,20,${a1}) ${r1.toFixed(0)}px, rgba(4,6,20,${rest}) ${(r1 * 2.1).toFixed(0)}px)`;
      if (s !== lastVig) { vig.style.background = s; lastVig = s; }
    }
    // holes = [{ cx, cy, r0, r1, a0, a1 }] (schermpixels); rest = donkerte buiten de gaten. Bij 4 spelers op een canvas (meerdere lantaarns), bij 2 spelers het oude CSS-verloop.
    function setDark(holes, rest) {
      if (N === 2) { const h = holes[0]; if (h) setVig(h.cx, h.cy, h.r0, h.r1, h.a0, h.a1, rest); else setVig(0, 0, 9999, 9999, 0, 0, rest); return; }
      if (!ensureOv() || !cg) return;
      const cw = renderer.domElement.clientWidth || 1100, chh = renderer.domElement.clientHeight || 650, sx = cv.width / cw, sy = cv.height / chh;
      const sig = rest + '|' + holes.map((h) => [h.cx, h.cy, h.r0, h.r1, h.a1].map((v) => Math.round(v)).join(',')).join(';');
      if (sig === lastVig) return; lastVig = sig;
      cg.globalCompositeOperation = 'source-over'; cg.clearRect(0, 0, cv.width, cv.height);
      if (rest <= 0) return;
      cg.fillStyle = `rgba(4,6,20,${rest})`; cg.fillRect(0, 0, cv.width, cv.height);
      cg.globalCompositeOperation = 'destination-out';
      for (const h of holes) {
        const gr = cg.createRadialGradient(h.cx * sx, h.cy * sy, 0, h.cx * sx, h.cy * sy, h.r1 * 2.1 * sx);
        const f0 = Math.min(0.999, h.r0 / (h.r1 * 2.1)), f1 = Math.min(0.999, h.r1 / (h.r1 * 2.1));
        gr.addColorStop(0, `rgba(0,0,0,${1 - h.a0 / rest})`); gr.addColorStop(f0, `rgba(0,0,0,${1 - h.a0 / rest})`); gr.addColorStop(f1, `rgba(0,0,0,${Math.max(0, 1 - h.a1 / rest)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        cg.fillStyle = gr; cg.fillRect(0, 0, cv.width, cv.height);
      }
      cg.globalCompositeOperation = 'source-over';
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
      S.round = r; S.hider = S.order[r]; S.phase = 'intro'; S.t = 0; S.left = HUNT_T; S.prepT = PREP_T; S.over = false;
      clearHider(); H.cdPop = 0; H.cdDecoy = 0; H.vx = H.vz = 0;
      const p0 = pick(W.props); const a = Math.random() * TAU; H.x = clamp(p0.x + Math.cos(a) * 2.6, -PLAZA.X + 2, PLAZA.X - 2); H.z = clamp(p0.z + Math.sin(a) * 2.6, -PLAZA.Z + 2, PLAZA.Z - 2); pushOut(H, 0.6);
      const ss = seekSlots();
      K.forEach((k, j) => { k.slot = ss[j]; k.x = (j - (NS - 1) / 2) * 3.4; k.z = PLAZA.Z - 1.3; k.vx = k.vz = 0; k.stun = 0; k.tapCd = 0; k.scanCd = 2.5; k.chances = CHANCES; k.scanBoost = 0; k.out = false; scanFxs[j] = null; scanRings[j].material.opacity = 0; });
      D.state = 'idle'; D.next = 9 + Math.random() * 4; decoy.t = 0; CH.on = false; CH.mode = 'wait'; CH.decoyT = 0; halo.visible = false; excl.visible = false;
      // comeback in ronde 2 (alleen bij 2 spelers): wie achterstaat krijgt hulp
      S.help = -1; if (N === 2 && r === 1) { if (pts[0] < pts[1] - 4) S.help = 0; else if (pts[1] < pts[0] - 4) S.help = 1; }
      const hi = S.hider;
      P[hi].lan.visible = false; P[hi].c.pose = 'idle'; P[hi].vis = true;
      for (const k of K) { P[k.slot].lan.visible = true; P[k.slot].c.pose = 'scared'; P[k.slot].vis = true; P[k.slot].x = k.x; P[k.slot].z = k.z; P[k.slot].yaw = Math.PI; P[k.slot].c.faceDir(0, -1); }
      P[hi].x = H.x; P[hi].z = H.z; P[hi].yaw = 0; P[hi].c.faceDir(0, 1);
      hud.setTimer(null); refreshHud();
      hud.showBig(`Ronde ${r + 1}/${ROUNDS}`, 1500, '#ffe14a');
      hud.toast(`${names[hi]} verstopt zich, ${nameList(ss)} ${ss.length > 1 ? 'zoeken' : 'zoekt'}!`, 2000);
      if (S.help >= 0) setTimeout(() => hud.toast(`Hulp voor ${names[S.help]}: ${S.help === seI() ? 'toverlantaarn (grotere scan)' : 'slimme afleiding (kip loopt trager)'}!`, 2600), 1300);
      audio.sfx('door', { vol: 0.4 });
    }
    function enterPrep() {
      S.phase = 'prep'; S.t = 0; S.prepT = PREP_T; S.disT = 0; hud.showBig('', 1);
      hud.setHint(`<b>${names[hiI()]}</b>: loop naar een voorwerp en druk <b>A</b> om je te verkleden!  ·  ${nameList(seekSlots())}: ogen dicht!`);
      audio.sfx('creak', { vol: 0.2, rate: 1.5 });
    }
    function enterHunt() {
      if (!H.dis) autoDisguise();
      S.phase = 'hunt'; S.t = 0; flashT = 0.5; H.popped = false; P[hiI()].vis = false;
      for (const k of K) P[k.slot].c.pose = 'carry'; P[hiI()].c.pose = 'idle';
      // kip start ver weg
      const far = [[-PLAZA.X + 2, -PLAZA.Z + 2], [PLAZA.X - 2, -PLAZA.Z + 2], [-PLAZA.X + 2, PLAZA.Z - 2], [PLAZA.X - 2, PLAZA.Z - 2]].sort((a, b) => Math.hypot(b[0] - H.x, b[1] - H.z) - Math.hypot(a[0] - H.x, a[1] - H.z))[0];
      CH.x = far[0]; CH.z = far[1]; CH.on = true; CH.mode = 'walk'; CH.cluck = 1; hen.group.visible = true;
      setMsg(''); hud.setHint(`${NS > 1 ? 'Zoekers' : 'Zoeker'} <b>${nameList(seekSlots())}</b>: <b>A</b> = tik · <b>B</b> = scan  ·  Verstopper <b>${names[hiI()]}</b>: <b>A</b> = ontkleden · <b>B</b> = afleiding`);
      hud.showBig('OGEN OPEN!', 900, '#ffe14a'); audio.sfx('go', { vol: 0.4 }); audio.sfx('whoosh', { vol: 0.4 });
      for (const k of K) fx.particles.burst(k.x, 1.5, k.z, { count: 30, speed: 6, up: 1, life: 0.8, size: 0.4, colors: [0xffe9a0, 0xffffff], gravity: 3 });
    }
    function autoDisguise() { const p = nearestProp(H.x, H.z, 99); if (p) { H.x = p.x + (H.x < p.x ? -1 : 1) * (p.r + 0.9); H.z = p.z + 0.4; } disguiseAs(p); }
    function refreshHud() {
      if (N === 2) hud.setScore(`Ronde ${Math.min(2, S.round + 1)}/2 · ${names[0]} ${Math.round(pts[0])} – ${Math.round(pts[1])} ${names[1]}`);
      else hud.setScore(`Ronde ${Math.min(ROUNDS, S.round + 1)}/${ROUNDS}`);
      for (let i = 0; i < N; i++) {
        let tx;
        if (i === S.hider) tx = S.phase === 'hunt' || S.phase === 'prep' ? `Verstopper · ${H.dis ? KINDS[H.kind].name : 'zonder voorwerp'} · afleiding ${H.cdDecoy > 0 ? Math.ceil(H.cdDecoy) + 's' : 'klaar'}` : 'Verstopper';
        else { const k = kOf(i); tx = k ? `Zoeker · kansen: ${k.chances} · scan ${k.scanCd > 0 ? Math.ceil(k.scanCd) + 's' : 'klaar'}` : 'Zoeker'; }
        if (N > 2) {   // compacte tekst voor de vier vakjes
          const k = kOf(i);
          tx = `${Math.round(pts[i])} pnt · ` + (i === S.hider ? (S.phase === 'hunt' || S.phase === 'prep' ? `verstopt${H.dis ? ': ' + KINDS[H.kind].name : ''}` : 'verstopper') : (k ? `zoekt · ${k.chances}♥ · ${k.scanCd > 0 ? 'scan ' + Math.ceil(k.scanCd) + 's' : 'scan klaar'}` : 'zoeker'));
        }
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
    function onFound(k) {
      if (S.phase !== 'hunt') return;
      const hiP = Math.max(0, HUNT_T - S.left), seP = Math.max(0, S.left); endRound('found', hiP, seP, k.slot);
    }
    function wrongTap(k, best) {
      const p = P[k.slot];
      k.stun = 1.15; k.chances--; if (N === 2) S.left -= 2; S.stats.wrong++;
      p.c.pose = 'scared'; ctx.shake(0.35); audio.sfx('hurt', { vol: 0.5 }); audio.sfx('thud', { vol: 0.5 });
      let txt;
      if (best.type === 'prop') { best.obj.shake = 1.0; txt = pick(BAD_TAPS).replace('{k}', KINDS[best.obj.kind].name); }
      else if (best.type === 'npc') { crowd.hop(best.obj); txt = `Hé! Dat is ${pick(NPC_NAMES)}!`; audio.sfx('hit', { vol: 0.4, rate: 0.7 }); }
      else { CH.hop = 0.7; txt = 'De kip pikt je in je teen!'; }
      fx.texts.add(txt, best.x, 2.6, best.z, '#ff8a8a', 1.3); hud.toast(N === 2 ? `${txt}  (-2 s, nog ${k.chances} kansen)` : `${names[k.slot]}: ${txt}  (nog ${k.chances} kansen)`, 1600);
      burst(best.x, 1.2, best.z, 12, [0xffe14a, 0xffffff], 3, 1.2);
      for (let q = 0; q < 3; q++) fx.particles.emit(k.x + rand(-0.4, 0.4), 2.2, k.z + rand(-0.4, 0.4), rand(-1, 1), 0.5, rand(-1, 1), { life: 0.8, size: 0.35, color: 0xffe14a, gravity: 0 });
      if (k.chances <= 0) { k.out = true; p.c.pose = 'sad'; if (K.every((q) => q.chances <= 0)) endRound('chances', HUNT_T, 0); }
      else if (S.left <= 0) endRound('time', HUNT_T, 0);
    }
    function tap(k) {
      const p = P[k.slot];
      k.tapCd = 0.45; p.c.swing(); audio.sfx('swing', { vol: 0.4 });
      const reach = TAP_REACH * pv.size(k.slot) * (S.help === k.slot ? 1.3 : 1);
      let best = null, bd = 1e9;
      const consider = (type, obj, x, z, r) => { const d = Math.hypot(k.x - x, k.z - z) - r; if (d < reach && d < bd) { bd = d; best = { type, obj, x, z }; } };
      for (const q of W.props) consider('prop', q, q.x, q.z, q.r);
      if (H.dis && H.prop) consider('hider', H, H.x, H.z, H.prop.r); else if (!H.dis && P[hiI()].vis) consider('hider', H, H.x, H.z, 0.55);
      const nn = crowd.nearest(k.x, k.z, reach); if (nn && nn.d < bd) { bd = nn.d; best = { type: 'npc', obj: nn.o, x: nn.o.x, z: nn.o.z }; }
      if (CH.on) consider('chicken', CH, CH.x, CH.z, 0.5);
      if (!best) { fx.particles.dust(k.x + Math.sin(p.yaw) * 1.2, 0.1, k.z + Math.cos(p.yaw) * 1.2, 3); return; }
      if (best.type === 'hider') onFound(k); else wrongTap(k, best);
    }
    function scan(k) {
      const R = SCAN_R * (S.help === k.slot ? 1.35 : 1);
      k.scanCd = SCAN_CD * (S.help === k.slot ? 0.7 : 1); S.stats.scans++;
      scanFxs[k.j] = { t: 0, x: k.x, z: k.z, R, hit: false }; k.scanBoost = 1;
      audio.sfx('sparkle', { vol: 0.7 }); audio.tone(660, 0.5, { type: 'sine', vol: 0.12, slide: 1320 }); ctx.shake(0.1);
      P[k.slot].c.swing();
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
    function endRound(kind, hiP, seP, finder = -1) {
      if (S.phase !== 'hunt') return;
      S.phase = 'found'; S.t = 0; S.over = true; hud.setTimer(null);
      const hi = hiI(), se = finder >= 0 ? finder : (N === 2 ? seI() : -1); pts[hi] += hiP; if (se >= 0 && kind === 'found') pts[se] += seP; else if (N === 2) pts[seI()] += seP; S.results.push({ kind, hider: hi, hiP, seP, finder: se });
      if (kind === 'found') S.stats.found++;
      // onthullen
      const x = H.x, z = H.z; if (H.dis) undisguise(); P[hi].vis = true; P[hi].x = x; P[hi].z = z;
      if (kind === 'found') {
        for (const k of K) P[k.slot].c.pose = k.slot === se ? 'cheer' : 'sad';
        P[hi].c.pose = 'sad'; hud.showBig('GEVONDEN!', 1500, '#ffe14a'); audio.sfx('win', { vol: 0.6 }); audio.sfx('bell', { vol: 0.5 });
        fx.particles.burst(x, 1.4, z, { count: 60, speed: 8, up: 1.4, life: 1.2, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); ctx.shake(0.6);
        hud.toast(`${names[se]} vond ${names[hi]} na ${hiP.toFixed(1)} s!  ${names[hi]} +${Math.round(hiP)} · ${names[se]} +${Math.round(seP)}`, 2600);
      } else {
        P[hi].c.pose = 'cheer'; for (const k of K) P[k.slot].c.pose = 'sad'; hud.showBig(kind === 'chances' ? 'GEEN KANSEN MEER!' : 'NIET GEVONDEN!', 1500, '#8dff9a'); audio.sfx('win', { vol: 0.5 });
        hud.toast(`${names[hi]} bleef ${Math.round(HUNT_T)} s ongezien!  +${Math.round(hiP)} punten`, 2600);
        fx.particles.burst(x, 1.4, z, { count: 40, speed: 7, up: 1.4, life: 1.1, size: 0.45, colors: [0x8dff9a, 0xffffff, 0xffe14a], gravity: 5 }); ctx.shake(0.3);
      }
      halo.visible = false; excl.visible = false; for (const r of scanRings) r.material.opacity = 0; scanFxs.fill(null); W.gate.target = 0; D.state = 'idle';
      refreshHud();
    }
    function finishMatch() {
      if (finished) return; finished = true;
      if (N === 2) {
        let w = pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1, coin = false; if (Math.abs(pts[0] - pts[1]) < 0.05) { w = Math.random() < 0.5 ? 0 : 1; coin = true; }
        const l = 1 - w, diff = Math.abs(pts[0] - pts[1]);
        const jokes = [`${names[w]} is de meester-verkleder van de kermis! ${names[l]} tikte nog een ton aan voor de zekerheid.`, `${names[w]} verdween tussen de kermisspullen als een echte tonnenspion. ${names[l]} zoekt nog.`, `Gevonden of niet: ${names[w]} had de beste neus en het beste verstopje.`, `De kip keek tevreden naar ${names[w]}. ${names[l]} kreeg een veertje als troostprijs.`];
        const extra = coin ? ' Precies gelijk! De kip koos zelf de winnaar.' : diff < 3 ? ' Dat was op het nippertje!' : '';
        ctx.finishPvp({ winner: w, score: [Math.round(pts[0]), Math.round(pts[1])], delay: 700, summary: `${pick(jokes)}${extra} (gevonden: ${S.stats.found} van 2, ${S.stats.wrong} foute tikken, ${S.stats.decoys} afleidingen).` });
        P[w].c.pose = 'cheer'; P[l].c.pose = 'sad'; P[0].vis = P[1].vis = true; P[w].lan.visible = false; P[l].lan.visible = false; setMsg(''); setDark([], 0);
        P[w].x = -2.2 + 4.4 * w; P[l].x = -2.2 + 4.4 * l; P[w].z = P[l].z = 3; clearHider();
        return;
      }
      // 4 spelers: hoogste totaal wint, gelijk = de kip kiest (willekeurig tussen de gedeelde koppositie)
      const rp = pts.map((v) => Math.round(v * 10) / 10), top = Math.max(...rp), tied = rp.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
      const w = tied.length > 1 ? pick(tied) : tied[0], coin = tied.length > 1;
      const order = players.map((_, i) => i).sort((a, b) => (b === w) - (a === w) || rp[b] - rp[a] || a - b);
      const jokes = [`${names[w]} is de meester-verkleder van de kermis!`, `${names[w]} verdween tussen de kermisspullen als een echte tonnenspion.`, `Gevonden of niet: ${names[w]} had de beste neus en het beste verstopje.`, `De kip keek tevreden naar ${names[w]}.`];
      const extra = coin ? ' Precies gelijk! De kip koos zelf de winnaar.' : '';
      ctx.finishPvp({ winner: w, score: rp.map((v) => Math.round(v)), place: order, delay: 700, summary: `${pick(jokes)}${extra} (gevonden: ${S.stats.found} van ${ROUNDS}, ${S.stats.wrong} foute tikken, ${S.stats.decoys} afleidingen).` });
      for (const p of P) { p.vis = true; p.lan.visible = false; }
      setMsg(''); setDark([], 0); clearHider();
      order.forEach((q, r) => { P[q].c.pose = r === 0 ? 'cheer' : 'sad'; P[q].x = (r - (N - 1) / 2) * 2.6; P[q].z = 3; P[q].vx = P[q].vz = 0; });
    }

    // ---------------- hoofdlus ----------------
    function update(dt) {
      dt = Math.min(dt, 0.05); Tm += dt; S.t += dt;
      if (!S.started) { S.started = true; startRound(0); }
      if (Tm > 260 && !finished && S.phase !== 'end') { S.phase = 'end'; finishMatch(); }
      const hi = hiI(), inH = pv.input(hi);
      let freeze = false;
      if (S.phase === 'intro') { if (S.t > INTRO_T) enterPrep(); }
      else if (S.phase === 'prep') {
        S.prepT -= dt; moveWith(H, inH, PREP_SPEED * pv.speed(hi), dt); pushOut(H, 0.55); P[hi].x = H.x; P[hi].z = H.z;
        if (inH.aP) { if (H.dis) { undisguise(); H.disT = 0; } else tryDisguise(); }
        if (H.dis) { H.vx = H.vz = 0; if (S.t - H.disT > 2.0 || S.prepT <= 0) enterHunt(); }
        else if (S.prepT <= 0) enterHunt();
        const left = Math.max(0, Math.ceil(S.prepT));
        setMsg(`<div style="font-size:60px">${nameList(seekSlots())}: OGEN DICHT!</div><div style="font-size:30px;color:#fff;margin-top:6px">${names[hi]} verstopt zich... ${left}</div>`, 60);
      } else if (S.phase === 'hunt') {
        updateHunt(dt, inH); freeze = D.state === 'stare';
      } else if (S.phase === 'found') {
        if (S.t > FOUND_T) { if (S.round < ROUNDS - 1) startRound(S.round + 1); else { S.phase = 'end'; finishMatch(); } }
      }
      crowd.update(dt, freeze, [...K.map((k) => ({ x: k.x, z: k.z, r: 0.6 })), ...(P[hi].vis ? [{ x: H.x, z: H.z, r: 0.6 }] : [])], Tm);
      refreshHud();
      visuals(dt);
    }

    function updateHunt(dt, inH) {
      const hi = hiI();
      S.left -= dt; hud.setTimer(Math.max(0, S.left), 8);
      for (const k of K) { k.tapCd = Math.max(0, k.tapCd - dt); k.scanCd = Math.max(0, k.scanCd - dt); k.scanBoost = Math.max(0, k.scanBoost - dt * 1.4); }
      H.cdPop = Math.max(0, H.cdPop - dt); H.cdDecoy = Math.max(0, H.cdDecoy - dt); H.reveal = Math.max(0, H.reveal - dt);
      decoy.t = Math.max(0, decoy.t - dt); CH.decoyT = Math.max(0, CH.decoyT - dt);
      if (S.left <= 0) { endRound('time', HUNT_T, 0); return; }
      // Deurman-poort
      D.t += dt; const wasStare = D.state === 'stare';
      if (D.state === 'idle') { D.next -= dt; if (D.next <= 0 && S.left > 4) { D.state = 'warn'; D.t = 0; W.gate.target = 1; audio.sfx('creak', { vol: 0.7 }); hud.toast('De poort kraakt open...', 1200); } }
      else if (D.state === 'warn') { if (D.t > 0.9) { D.state = 'stare'; D.t = 0; D.punished = false; S.stats.deur++; audio.sfx('heartbeat', { vol: 0.6 }); hud.showBig('NIET BEWEGEN!', 900, '#ff6a6a'); ctx.shake(0.3); } }
      else if (D.state === 'stare') { if (D.t > 1.7) { D.state = 'idle'; D.next = 11 + Math.random() * 4; W.gate.target = 0; audio.sfx('door', { vol: 0.5 }); } }
      const frozen = D.state === 'stare';
      // ----- zoekers -----
      for (const k of K) {
        if (S.phase !== 'hunt') break;   // een vorige zoeker beëindigde de ronde net
        const inS = pv.input(k.slot), pp = P[k.slot];
        if (k.stun > 0) { k.stun -= dt; if (k.stun <= 0 && !k.out) pp.c.pose = 'carry'; }
        if (k.stun <= 0 && !frozen && !k.out) {
          moveWith(k, inS, SEEK_SPEED * pv.speed(k.slot), dt); pushOut(k, 0.5); pushOutProps(k, 0.35);
          if (inS.aP && k.tapCd <= 0) tap(k);
          if (S.phase === 'hunt' && inS.bP && k.scanCd <= 0) scan(k);
        } else { k.vx = k.vz = 0; if (frozen && !k.out) pp.c.pose = 'scared'; }
        if (!frozen && k.stun <= 0 && !k.out && pp.c.pose === 'scared') pp.c.pose = 'carry';
      }
      if (S.phase !== 'hunt') return;
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
          H.sparkT -= dt; const dd = Math.min(...K.map((k) => Math.hypot(k.x - H.x, k.z - H.z)));
          if (dd < 3.4 && H.sparkT <= 0) { H.sparkT = 0.8 + Math.random() * 0.5; fx.particles.emit(H.x + rand(-0.3, 0.3), 1.4, H.z + rand(-0.3, 0.3), 0, 0.8, 0, { life: 0.6, size: 0.22, color: 0xfff0a0, gravity: 0 }); }
        } else {
          moveWith(H, inH, RUN_SPEED * pv.speed(hi), dt); pushOut(H, 0.5); P[hi].x = H.x; P[hi].z = H.z;
          if (inH.aP) tryDisguise();
        }
        if (H.dis && inH.bP && H.cdDecoy <= 0) doDecoy(); else if (!H.dis && inH.bP && H.cdDecoy <= 0) doDecoy();
      } else { H.vx = H.vz = 0; }
      // ----- scan-flitsen -----
      scanFxs.forEach((scanFx, j) => {
        if (!scanFx) return; const scanRing = scanRings[j];
        scanFx.t += dt; const u = clamp(scanFx.t / 0.9, 0, 1), r = scanFx.R * (1 - Math.pow(1 - u, 2));
        scanRing.position.set(scanFx.x, 0.1, scanFx.z); scanRing.scale.setScalar(Math.max(0.1, r)); scanRing.material.opacity = (1 - u) * 0.9;
        if (!scanFx.hit && H.dis && Math.hypot(H.x - scanFx.x, H.z - scanFx.z) <= r) { scanFx.hit = true; H.reveal = 2.2; audio.sfx('ding', { vol: 0.8 }); fx.texts.add('GLINSTER!', H.x, 2.6, H.z, '#fff08a', 1.6); burst(H.x, 1.0, H.z, 24, [0xfff08a, 0xffffff], 3, 1.5); }
        if (u >= 1) { scanFxs[j] = null; scanRing.material.opacity = 0; }
      });
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
          CH.cluck = 1.2; S.stats.clucks++; const ds = Math.min(...K.map((k) => Math.hypot(k.x - CH.x, k.z - CH.z))); const v = clamp(0.55 - ds * 0.02, 0.18, 0.55);
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
      const kk = kOf(p.i), mvx = kk ? kk.vx : (p === P[hiI()] ? H.vx : 0), mvz = kk ? kk.vz : (p === P[hiI()] ? H.vz : 0);
      p.holder.position.set(p.x, p.y, p.z); c.speed = clamp(Math.hypot(mvx, mvz) / 6.5, 0, 1) * speedFrac; if (Math.hypot(mvx, mvz) > 0.3) c.faceDir(mvx, mvz); c.update(dt);
      p.tag.visible = p.vis; p.tag.position.set(p.x, 2.7 * pv.size(p.i) * (1.7 / 1.84) + 0.2, p.z); p.ring.visible = p.vis; p.ring.position.set(p.x, 0.06, p.z); p.shadow.visible = p.vis; p.shadow.position.set(p.x, 0.03, p.z);
    }
    function visuals(dt) {
      const hi = hiI();
      // zoekers volgen hun K, verstopper-poppetje volgt H
      for (const k of K) { P[k.slot].x = k.x; P[k.slot].z = k.z; }
      if (S.phase !== 'found' && S.phase !== 'end') { P[hi].x = H.x; P[hi].z = H.z; }
      const idleSeeker = S.phase === 'prep' || S.phase === 'intro';
      for (const k of K) placePuppet(P[k.slot], dt, 1);
      placePuppet(P[hi], dt, 1);
      if (idleSeeker) for (const k of K) P[k.slot].c.faceDir(0, -1);
      // lantaarnlicht en -vlek (per zoeker)
      const lampI = (S.phase === 'hunt' ? 55 : S.phase === 'found' ? 25 : 8) * (N > 2 ? 0.75 : 1);
      K.forEach((k, j) => {
        const lamp = lamps[j], pool = pools[j], on = !k.out;
        lamp.intensity = damp(lamp.intensity, !on ? 0 : D.state === 'warn' || D.state === 'stare' ? lampI * (Math.random() < 0.5 ? 0.2 : 1) : lampI, 20, dt);
        lamp.position.set(k.x, 2.1, k.z); pool.position.set(k.x, 0.05, k.z); pool.scale.setScalar(S.phase === 'hunt' ? 12 + k.scanBoost * 8 : 7); pool.material.opacity = on ? (S.phase === 'hunt' ? 0.9 : 0.3) : 0;
      });
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
        setDark([{ cx: sx, cy: sy, r0: ppu * 3.2, r1: ppu * 5.2, a0: 0, a1: 0.55 }], 0.97);
      } else if (S.phase === 'hunt' || S.phase === 'found') {
        const fl = D.state === 'warn' || D.state === 'stare' ? (Math.random() < 0.3 ? 0.97 : 0.8) : 0.76;
        const holes = K.filter((k) => !k.out || N === 2).map((k) => { const [sx, sy] = toScreen(k.x, 0.8, k.z); const ppu = pxPerUnit(k.x, k.z); const R = (S.phase === 'found' ? 14 : 5.3 * (S.help === hiI() ? 0.85 : 1) + k.scanBoost * 4) * ppu; return { cx: sx, cy: sy, r0: R * 0.55, r1: R, a0: 0, a1: 0.42 }; });
        setDark(holes, S.phase === 'found' ? 0 : fl);
        if (flashT > 0) { flashT -= dt; }
      } else if (S.phase === 'intro') { setDark([], 0); }
      if (S.phase !== 'prep' && S.phase !== 'hunt') setMsg('');
      if (S.phase === 'hunt') setMsg('');
    }
    function introUpdate(dt) {
      introT += dt; Tm += dt;
      if (!S.started) { for (const p of P) { p.c.pose = 'idle'; } P.forEach((p, i) => { p.x = N === 2 ? (i ? 3 : -3) : (i - (N - 1) / 2) * 2.8; p.z = 6; p.c.faceDir(N === 2 ? (i ? -0.4 : 0.4) : -(i - (N - 1) / 2) * 0.15, 1); p.yaw = p.c.targetYaw; }); for (const p of P) { p.vis = true; p.holder.visible = true; } }
      crowd.update(dt, false, P.map((p) => ({ x: p.x, z: p.z, r: 1 })), Tm);
      for (const p of P) { p.holder.position.set(p.x, 0, p.z); p.c.update(dt); p.tag.position.set(p.x, 2.7, p.z); p.ring.position.set(p.x, 0.06, p.z); p.shadow.position.set(p.x, 0.03, p.z); }
      crowd.npcs.forEach((o, i) => { dummy.position.set(o.x, 0.03, o.z); dummy.scale.setScalar(0.6 * o.scale); dummy.updateMatrix(); npcBlobs.setMatrixAt(i, dummy.matrix); }); npcBlobs.instanceMatrix.needsUpdate = true;
      W.update(Tm, dt); updateCamera(dt); for (const l of lamps) l.intensity = 0; for (const pl of pools) pl.visible = false; setDark([], 0);
    }
    function resultUpdate(dt) {
      Tm += dt; crowd.update(dt, false, [], Tm); for (const p of P) { p.holder.position.set(p.x, 0, p.z); p.c.update(dt); p.tag.position.set(p.x, 2.7, p.z); p.ring.position.set(p.x, 0.06, p.z); p.shadow.position.set(p.x, 0.03, p.z); }
      W.update(Tm, dt); updateCamera(dt);
    }
    refreshHud();

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } for (const pl of pools) if (!pl.visible) pl.visible = true; update(dt); },
      introUpdate, resultUpdate,
      onResize() { lastAspect = 0; },
      onSwap() { for (const p of P) burst(p.x, 1.5, p.z, 16, [0xffe14a, 0xffffff], 4, 1); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { pts[i] -= 3; const kk = kOf(i); fx.texts.add('-3 DEURMAN!', i === hiI() || !kk ? H.x : kk.x, 2.8, i === hiI() || !kk ? H.z : kk.z, '#ff6a6a', 1.6); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
        refreshHud();
      },
      celebrate(w, winners = [w]) { P.forEach((p, i) => { p.c.pose = winners.includes(i) ? 'cheer' : 'sad'; }); },
      dispose() { if (ov) ov.remove(); crowd.dispose(); },
      dbg: {
        state: () => ({ T: Tm, phase: S.phase, round: S.round, hider: S.hider, left: S.left, prepT: S.prepT, pts: [...pts], chances: Sk.chances, K: K.map((k) => ({ slot: k.slot, x: k.x, z: k.z, chances: k.chances, stun: k.stun, scanCd: k.scanCd, out: k.out })), order: S.order.slice(), help: S.help, finished, results: S.results.map((r) => ({ ...r })), stats: { ...S.stats },
          H: { dis: H.dis, kind: H.kind, x: H.x, z: H.z, popped: H.popped, cdPop: H.cdPop, cdDecoy: H.cdDecoy, reveal: H.reveal }, Sk: { x: Sk.x, z: Sk.z, stun: Sk.stun, scanCd: Sk.scanCd, tapCd: Sk.tapCd }, D: D.state, chicken: { x: CH.x, z: CH.z, mode: CH.mode }, props: W.props.length, npcs: crowd.npcs.length }),
        setLeft: (t) => { S.left = t; }, setPts: (a, b, c, d) => { pts[0] = a; pts[1] = b; if (N > 2) { pts[2] = c ?? 0; pts[3] = d ?? 0; } }, startDeur: () => { D.next = 0; }, doScan: (j = 0) => scan(K[j]), doDecoy: () => doDecoy(), skipPrep: () => { if (S.phase === 'prep') S.prepT = 0.01; },
        W, H, Sk, S, crowd, CH,
      },
    };
  },
};

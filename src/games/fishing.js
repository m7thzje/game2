import * as THREE from 'three';
import { clamp, lerp, damp, rand, TAU, mat, mesh } from '../engine/util.js';
import { PLAYER_COLORS, makeNPC } from '../engine/chars.js';
import { KEY_LABELS } from '../engine/input.js';
import { buildLake, TIP, NET_D, LANE_Z, radialTex } from './fishing_world.js';

// Samen Vissen: Daan hengelt, Sem schept. Halverwege wisselen de rollen.
// cast -> charge -> fly -> wait (nibbel) -> bite -> fight -> net -> caught / lost

const DURATION = 80;
const SWAP_AT = 33;          // seconden gespeeld; wissel bij de eerstvolgende worp
const GRACE = 9;             // extra seconden voor een vis die al aan de haak zit
const STAR_AT = [30, 80, 150];

const KINDS = {
  small: { id: 'small', name: 'Voorntje', pts: 10, len: 1.25, col: 0x04101c, op: 0.5, body: 0x9ad0ff, spd: 1.7, reel: 3.6, grow: 0.28, runP: 0.0, tol: 1.55, nib: 1, rad: 6.5, bite: 1.4 },
  medium: { id: 'medium', name: 'Dikke brasem', pts: 25, len: 1.8, col: 0x04101c, op: 0.55, body: 0xffa040, spd: 1.4, reel: 3.0, grow: 0.34, runP: 0.5, tol: 1.4, nib: 2, rad: 5.8, bite: 1.2 },
  gold: { id: 'gold', name: 'Gouden vis', pts: 60, len: 1.6, col: 0x8a6410, op: 0.7, body: 0xffd23a, spd: 2.5, reel: 2.5, grow: 0.40, runP: 0.85, tol: 1.2, nib: 3, rad: 5.2, bite: 0.95 },
  giant: { id: 'giant', name: 'Reuzenmeerval', pts: 150, len: 4.6, col: 0x02080e, op: 0.62, body: 0x55648c, spd: 1.0, reel: 0, grow: 0, runP: 1, tol: 2.0, nib: 2, rad: 8, bite: 1.3 },
  boot: { id: 'boot', name: 'Oude laars', pts: -5, len: 1.4, col: 0x1a0e04, op: 0.6, body: 0x6b4226, spd: 0.25, reel: 4, grow: 0.1, runP: 0, tol: 1.6, nib: 0, rad: 3.6, bite: 3.2 },
};
const WATER = { x0: -17, x1: 17, z0: -23, z1: -9.5 };
const MAXD = 21;

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SAY = {
  start: ['Welkom bij het meer, jongens! Gooi uit bij een schaduw en wacht op de dobber.', 'Mooie avond voor een visje! Hengelaar gooit uit, nettenman wacht in de boot.'],
  cast: ['Richt met links/rechts en houd de knop ingedrukt: laat los voor de worp!', 'Gooi bij een schaduw! Ver weg zit de grote vis...'],
  wait: ['Rustig... even geduld. De dobber gaat zo trillen.', 'Ssst... niet bewegen. Er komt er een aan!'],
  early: ['Te vroeg! Wacht tot de dobber helemaal onder gaat.', 'Hij schrok! Even wachten op de hap.'],
  late: ['Te laat, hij is weg!', 'Hij pakte het aas en ging ervandoor...'],
  bite: ['HAP! Nu draaien!', 'Hij bijt! Houd de knop ingedrukt!'],
  fight: ['Houd ingedrukt om te reelen, laat los als de lijn te strak staat!', 'Nettenman: houd het net bij de lijn!'],
  run: ['Hij schiet weg! LOSLATEN!', 'Pas op, de lijn knapt!'],
  net: ['Nu scheppen, nettenman! Net onder de vis!', 'Daar springt hij! Scheppen!'],
  snap: ['Au, de lijn knapte! Minder hard trekken.', 'Knap! Die was te strak gespannen.'],
  miss: ['Mis! Het net moet onder de vis zitten.', 'Net niet! Probeer het nog eens!'],
  good: ['Mooi gevangen!', 'Prachtig, jongens!', 'Dat is een goede vangst!'],
  swap: ['Wissel van plek! Nu doet de ander de hengel.', 'Tijd om te wisselen: hengelaar wordt nettenman!'],
  giant: ['Een REUZENVIS! Om en om reelen, jongens! Stop als hij rukt!', 'Dat is de oude meerval! Allebei draaien, om en om!'],
};

export default {
  id: 'fishing',
  name: 'Samen Vissen',
  giver: 'Visser Floris',
  icon: '🎣',
  mode: 'coop',
  time: DURATION,
  pay: 1.1,
  music: 'puzzle',
  blurb: 'Visser Floris wil vis voor het avondeten! Eén is <b>hengelaar</b>: gooi uit, wacht op de hap, en <b>reel</b> in zonder dat de lijn knapt. De ander is <b>nettenman</b> in de boot: houd het net <b>onder de lijn</b> en <b>schep</b> de vis. Halverwege wisselen jullie! Pas op voor de oude laars...',
  controls: ['Hengelaar: {a} houden = gooien / reelen', 'Nettenman: {move} boot, {a} scheppen', '{b} lijn terughalen'],
  tip: 'Een gouden vis is 60 punten, de reuzenvis 150: die moeten jullie samen om en om reelen!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const L = ctx.lights('dusk', { shadow: 17, center: [0, 0, -4], fog: false });
    L.sun.position.set(-16, 11, 4); L.sun.intensity = 2.3; L.sun.color.set(0xffa463); L.hemi.intensity = 1.15;
    const lake = buildLake(scene, camera, fx);
    camera.fov = 50; camera.updateProjectionMatrix();
    function fit() { const asp = camera.aspect || 1.7; camera.fov = Math.min(72, (2 * Math.atan(Math.max(0.466, 0.466 * 1.7 / asp)) * 180) / Math.PI); camera.updateProjectionMatrix(); }
    fit();
    const camBase = new THREE.Vector3(9.4, 10.6, 8.2), camLook = new THREE.Vector3(-1.0, 0, -9.0);
    camera.position.copy(camBase); camera.lookAt(camLook);

    // ---- personages
    const ch = [0, 1].map((i) => { const c = ctx.make.brother(i); scene.add(c.group); return c; });
    const floris = makeNPC('fisher'); floris.group.position.set(-4.6, 0.46, 8.6); floris.faceDir(0.7, -0.5); scene.add(floris.group);
    let florisPose = 'wave', florisT = 2.5;

    // ---- hengel
    const rod = new THREE.Group(); const rodSegs = [];
    {
      let parent = rod; const lens = [1.5, 1.4, 1.3], rad = [0.06, 0.045, 0.03];
      lens.forEach((L2, i) => {
        const seg = new THREE.Group(); parent.add(seg);
        seg.add(mesh(new THREE.CylinderGeometry(rad[i] * 0.8, rad[i], L2, 5), mat(i ? 0xb88a52 : 0x6b4a2e), { cast: false, pos: [0, 0, L2 / 2], rot: [Math.PI / 2, 0, 0] }));
        const next = new THREE.Group(); next.position.set(0, 0, L2); seg.add(next); rodSegs.push(seg); parent = next;
      });
      rod.userData.tip = parent;
      rod.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), mat(0x888890, { metalness: 0.6 }), { cast: false, pos: [0.08, -0.06, 0.4], rot: [0, 0, Math.PI / 2] }));
    }
    // ---- schepnet
    const net = new THREE.Group(); const netPole = new THREE.Group(); net.add(netPole);
    netPole.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.8, 6), mat(0x8a6238), { cast: false, pos: [0, 0, 1.4], rot: [Math.PI / 2, 0, 0] }));
    const hoop = new THREE.Group(); hoop.position.set(0, 0, 2.85); netPole.add(hoop);
    hoop.add(mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 24), mat(0xd8d0b0), { cast: false, rot: [Math.PI / 2, 0, 0] }));
    hoop.add(mesh(new THREE.SphereGeometry(0.85, 12, 6, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8e0c0, wireframe: true, transparent: true, opacity: 0.75 }), { cast: false, receive: false }));
    const hoopGlowM = new THREE.MeshBasicMaterial({ color: 0x6aff9a, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
    const hoopGlow = mesh(new THREE.CircleGeometry(0.85, 20), hoopGlowM, { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); hoopGlow.renderOrder = 4; hoop.add(hoopGlow);

    // ---- dobber + lijn
    const bobber = new THREE.Group();
    bobber.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xe8e8e8, { flatShading: false }), { cast: false }));
    bobber.add(mesh(new THREE.SphereGeometry(0.2, 10, 5, 0, TAU, 0, Math.PI / 2), mat(0xe03a2a, { flatShading: false }), { cast: false, pos: [0, 0.01, 0] }));
    bobber.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), mat(0xffffff), { cast: false, pos: [0, 0.38, 0] }));
    bobber.visible = false; scene.add(bobber);
    const N = 20; const lineGeo = new THREE.BufferGeometry();
    const lpos = new Float32Array(N * 2 * 3); const lidx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; lidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lineGeo.setIndex(lidx);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const lineMesh = new THREE.Mesh(lineGeo, lineMat); lineMesh.frustumCulled = false; lineMesh.visible = false; scene.add(lineMesh);
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vp = new THREE.Vector3(), vs = new THREE.Vector3(), vt = new THREE.Vector3();
    function setLine(a, b, sag, w = 0.045) {
      vt.copy(b).sub(a);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1); vp.copy(a).lerp(b, u); vp.y -= sag * 4 * u * (1 - u);
        vs.copy(camera.position).sub(vp).cross(vt).normalize().multiplyScalar(w);
        lpos[i * 6] = vp.x - vs.x; lpos[i * 6 + 1] = vp.y - vs.y; lpos[i * 6 + 2] = vp.z - vs.z;
        lpos[i * 6 + 3] = vp.x + vs.x; lpos[i * 6 + 4] = vp.y + vs.y; lpos[i * 6 + 5] = vp.z + vs.z;
      }
      lineGeo.attributes.position.needsUpdate = true; lineMesh.visible = true;
    }

    // ---- markeringen op het water
    const aimRing = mesh(new THREE.TorusGeometry(0.8, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }), { cast: false, receive: false, rot: [Math.PI / 2, 0, 0] }); aimRing.visible = false; aimRing.renderOrder = 4; scene.add(aimRing);
    const crossRing = mesh(new THREE.TorusGeometry(1.0, 0.09, 6, 28), new THREE.MeshBasicMaterial({ color: 0x6aff9a, transparent: true, opacity: 0.85, depthWrite: false }), { cast: false, receive: false, rot: [Math.PI / 2, 0, 0] }); crossRing.visible = false; crossRing.renderOrder = 4; scene.add(crossRing);
    const crossBeam = mesh(new THREE.PlaneGeometry(0.14, 4.2), new THREE.MeshBasicMaterial({ color: 0x6aff9a, transparent: true, opacity: 0.35, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); crossBeam.visible = false; crossBeam.renderOrder = 4; scene.add(crossBeam);

    // ---- meter + uitroepteken boven de hengelaar (canvas-sprite)
    const gc = document.createElement('canvas'); gc.width = 384; gc.height = 120; const gg = gc.getContext('2d');
    const gtex = new THREE.CanvasTexture(gc); gtex.colorSpace = THREE.SRGBColorSpace;
    const gauge = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, transparent: true, depthTest: false })); gauge.scale.set(4.4, 1.38, 1); gauge.renderOrder = 30; gauge.visible = false; scene.add(gauge);
    let gKey = '';
    function rr(x, y, w, h, r) { gg.beginPath(); gg.roundRect(x, y, w, h, r); }
    function drawGauge(mode, v = 0, a = 0, b = 0) {
      const key = mode + '|' + Math.round(v * 60) + '|' + a + '|' + b; if (key === gKey) return; gKey = key;
      gg.clearRect(0, 0, 384, 120);
      gg.font = 'bold 34px Fredoka, Arial Black, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.lineJoin = 'round';
      const label = (txt, y = 22, col = '#fff') => { gg.lineWidth = 7; gg.strokeStyle = 'rgba(20,8,30,.9)'; gg.strokeText(txt, 192, y); gg.fillStyle = col; gg.fillText(txt, 192, y); };
      const bar = (y, val, zones) => {
        gg.fillStyle = 'rgba(20,10,30,.8)'; rr(14, y, 356, 34, 17); gg.fill();
        const gr = gg.createLinearGradient(24, 0, 360, 0); zones.forEach(([p, c]) => gr.addColorStop(p, c));
        gg.fillStyle = gr; rr(22, y + 6, 340 * clamp(val, 0, 1), 22, 11); gg.fill();
        gg.strokeStyle = '#fff'; gg.lineWidth = 3; rr(14, y, 356, 34, 17); gg.stroke();
        const mx = 22 + 340 * clamp(val, 0, 1); gg.fillStyle = '#fff'; gg.beginPath(); gg.moveTo(mx, y - 4); gg.lineTo(mx - 9, y - 14); gg.lineTo(mx + 9, y - 14); gg.fill();
      };
      if (mode === 'power') { label('Kracht!', 20); bar(44, v, [[0, '#58d8ff'], [0.5, '#6aff7a'], [1, '#ffd23a']]); gg.font = 'bold 22px Arial'; label('laat los om te gooien', 100); }
      else if (mode === 'tension') { label(a ? 'LOSLATEN!' : 'Spanning', 20, a ? '#ff6a5a' : '#fff'); bar(44, v, [[0, '#6aff7a'], [0.55, '#e8ff5a'], [0.78, '#ffb03a'], [1, '#ff3a3a']]); }
      else if (mode === 'giant') { label(a ? 'STOP! Hij rukt!' : 'Om en om!', 20, a ? '#ff6a5a' : '#fff'); bar(44, v, [[0, '#6aff7a'], [0.55, '#e8ff5a'], [0.78, '#ffb03a'], [1, '#ff3a3a']]); }
      else if (mode === 'bite') { gg.fillStyle = b ? '#58b8ff' : '#ffd23a'; gg.beginPath(); gg.arc(192, 58, 50, 0, TAU); gg.fill(); gg.lineWidth = 8; gg.strokeStyle = '#7a1a1a'; gg.stroke(); gg.font = 'bold 82px Fredoka, Arial Black, sans-serif'; gg.fillStyle = b ? '#103a6a' : '#d8211a'; gg.fillText(b ? '?' : '!', 192, 62); }
      gtex.needsUpdate = true;
    }

    // ---- vissen (schaduwen)
    const swimmers = [];
    function spawnFish(kind, x, z) {
      const K = KINDS[kind]; const g = lake.makeSilhouette(kind, K.len, K.col, K.op); g.position.set(x ?? rand(WATER.x0, WATER.x1), -0.45, z ?? rand(WATER.z0, WATER.z1));
      scene.add(g);
      let glow = null;
      if (kind === 'gold') { glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffd23a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 })); glow.scale.setScalar(2.8); glow.renderOrder = 3; scene.add(glow); }
      const s = { kind: K, K, g, glow, x: g.position.x, z: g.position.z, hd: rand(0, TAU), tgx: 0, tgz: 0, tT: 0, spook: 0, hooked: false, committed: false, dead: false, ph: rand(0, 6), depth: -0.45, off: 0 };
      pickTarget(s); s.tT = rand(1, 3); swimmers.push(s); return s;
    }
    function pickTarget(s) { s.tgx = rand(WATER.x0, WATER.x1); s.tgz = rand(WATER.z0, WATER.z1); s.tT = rand(2.5, 5.5); }
    for (let i = 0; i < 6; i++) spawnFish('small');
    for (let i = 0; i < 3; i++) spawnFish('medium');
    spawnFish('gold'); spawnFish('boot'); spawnFish('boot');
    const respawn = []; // {t, kind}
    let giantT = 10, giant = null;

    // ---- toestand
    let t = 0, elapsed = 0, timeLeft = DURATION, score = 0, caughtN = 0, done = false, started = false, overtime = false;
    let angler = 0; const nettr = () => 1 - angler;
    let phase = 'cast', pt = 0, needRelease = false;
    let aim = 0, power = 0, powerDir = 1, lastPower = 0.55;
    const bob = { x: 0, z: 0, y: 0.15, fromX: 0, fromY: 0, fromZ: 0, tx: 0, tz: 0, sub: 'seek', nibT: 0, nibN: 0, biteT: 0, waitT: 0, D0: 12, dip: 0, F: null };
    const H = { F: null, theta: 0, D: 12, T: 0.2, mode: 'calm', modeT: 2, runDir: 1, thVel: 0, wander: 0, wT: 0, lastP: -1, misses: 0, netT: 0, scoopT: -1, scoopAligned: false, leapT: 0, leapGap: 0.3, cool: 0, pressT: [-9, -9], flee: 0 };
    let swapDone = false, swapWarn = false, swapNext = false;
    const catchAnim = { on: false, t: 0, obj: null, from: new THREE.Vector3(), to: new THREE.Vector3(), kind: null };
    let leapObj = null, leapKind = null;
    const boatS = { x: 0, vx: 0 };
    const pose = [{ p: 'carry', t: 0 }, { p: 'carry', t: 0 }];
    const setPose = (i, p, d = 1.4) => { pose[i].p = p; pose[i].t = d; };
    let netPitch = 0.4, netPitchTarget = 0.4, scoopAnim = -1, rodPitch = 0.6, rodTargetPitch = 0.6, rodBend = 0.1;
    let sayT = 0, graceT = 0, camShake = 0, reelTick = 0, warnBeep = 0, hintKey = '';

    const KA = (i) => KEY_LABELS[i].a;
    function say(txt) { hud.setHint(`🎣 <b>Floris:</b> “${txt}”`); }
    function pinfo() {
      const a = angler, n = nettr(); let ta = '', tn = '';
      switch (phase) {
        case 'cast': ta = `Hengel: richt + houd ${KA(a)}`; tn = `Net: sturen met ${KEY_LABELS[n].move}`; break;
        case 'charge': ta = `Laat ${KA(a)} los!`; tn = 'Wacht op de worp'; break;
        case 'fly': case 'wait': ta = 'Wacht op een hap...'; tn = 'Wacht, houd het net klaar'; break;
        case 'bite': ta = `NU ${KA(a)} indrukken!`; tn = 'Hij bijt! Klaar maken'; break;
        case 'fight': ta = H.F && H.F.kind === KINDS.giant ? `Om en om ${KA(a)}!` : `${KA(a)} = reelen, los = rust`; tn = H.F && H.F.kind === KINDS.giant ? `Om en om ${KA(n)}!` : 'Volg de lijn met het net!'; break;
        case 'net': ta = 'Laat los, wacht...'; tn = H.F && H.F.kind === KINDS.giant ? `Samen ${KA(n)} scheppen!` : `Schep met ${KA(n)}!`; break;
        case 'caught': ta = 'Gevangen!'; tn = 'Gevangen!'; break;
        default: ta = tn = '...'; break;
      }
      hud.setPlayerInfo(a, '🎣 ' + ta); hud.setPlayerInfo(n, '🥅 ' + tn);
    }
    function updateHud() { hud.setScore(`Vangst: ${score} punten · ${caughtN} vis${caughtN === 1 ? '' : 'sen'}`); }

    // ---- hulpfuncties
    const splash = (x, z, n = 14, s = 3.4) => { fx.particles.burst(x, 0.2, z, { count: n, speed: s, up: 1.4, spread: 0.7, size: 0.3, colors: [0xffffff, 0xcfeaff, 0x9ad0ff], life: 0.8, gravity: 11 }); lake.ripple(x, z, 2.4, 1.2); };
    const fishX = (th, D) => TIP.x + D * Math.sin(th), fishZ = (th, D) => TIP.z - D * Math.cos(th);
    const rodTip = new THREE.Vector3();
    function placeCast(i, role) {
      const c = ch[i];
      if (role === 'angler') { c.group.position.set(TIP.x, TIP.y, TIP.z + 1.0); c.group.add(rod); rod.position.set(0.12, c.height * 0.58, 0.18); }
      else { c.group.add(net); net.position.set(0.1, c.height * 0.56, 0.2); c.group.position.set(boatS.x, 0.2, lake.boatZ + 0.1); }
      c.faceDir(0, -1);
    }
    placeCast(0, 'angler'); placeCast(1, 'netter');
    function rodUpdate(dt) {
      rodPitch = damp(rodPitch, rodTargetPitch, rodTargetPitch > rodPitch + 0.3 ? 5 : 14, dt);
      rod.rotation.set(-rodPitch, 0, 0);
      const bend = rodBend; rodSegs.forEach((s, i) => { s.rotation.x = bend * (0.5 + i * 0.35); });
      rod.updateWorldMatrix(true, true); rod.userData.tip.getWorldPosition(rodTip);
    }

    // =============================================================== fases
    function startCharge() { phase = 'charge'; pt = 0; power = 0; powerDir = 1; rodTargetPitch = 1.6; audio.sfx('click'); setPose(angler, 'carry', 9); }
    function launch() {
      phase = 'fly'; pt = 0; const D0 = lerp(8.4, 18, power); lastPower = power; bob.D0 = D0;
      bob.tx = TIP.x + D0 * Math.sin(aim); bob.tz = TIP.z - D0 * Math.cos(aim);
      bob.fromX = rodTip.x; bob.fromY = rodTip.y; bob.fromZ = rodTip.z; bob.x = bob.fromX; bob.z = bob.fromZ; bob.y = bob.fromY;
      bobber.visible = true; rodTargetPitch = 0.5; rodPitch = 1.7; bob.sub = 'seek'; bob.waitT = 0; bob.F = null; bob.dip = 0; bob.hinted = false;
      audio.sfx('whoosh', { vol: 0.8 }); gauge.visible = false; swimmers.forEach((s) => { s.committed = false; });
      ch[angler].swing(); say(pick(SAY.wait)); pinfo();
    }
    function enterWait() {
      phase = 'wait'; pt = 0; bob.sub = 'seek'; bob.waitT = 0; bob.x = bob.tx; bob.z = bob.tz; bob.y = 0.12;
      splash(bob.x, bob.z, 12, 3); audio.sfx('splash', { vol: 0.6 }); pinfo();
    }
    function retract(msg, sayKind) {
      phase = 'lost'; pt = 0; bobber.visible = true; H.F = null; gauge.visible = false; crossRing.visible = crossBeam.visible = false; aimRing.visible = false;
      if (msg) fx.texts.add(msg, bob.x, 1.6, bob.z, '#ffb0a0', 1.1);
      if (sayKind) say(pick(SAY[sayKind]));
      bob.fromX = bob.x; bob.fromY = bob.y; bob.fromZ = bob.z; rodTargetPitch = 0.6; rodBend = 0.1;
      pinfo();
    }
    function nearestBait() {
      let best = null, bd = 1e9;
      for (const s of swimmers) {
        if (s.hooked || s.dead || s.spook > 0) continue;
        const d = Math.hypot(s.x - bob.x, s.z - bob.z); const lim = s.K.rad;
        if (d < lim && d / lim < bd) { bd = d / lim; best = s; }
      }
      return best;
    }
    function bait(s) { bob.F = s; s.committed = true; }
    function hookFish() {
      const F = bob.F; phase = 'fight'; pt = 0; H.F = F; F.hooked = true; F.committed = false;
      H.D = Math.hypot(F.x - TIP.x, F.z - TIP.z); H.theta = Math.atan2(F.x - TIP.x, TIP.z - F.z); if (F.kind === KINDS.giant) H.D = Math.max(H.D, 14.5); H.T = 0.22; H.mode = 'calm'; H.modeT = F.kind === KINDS.giant ? 2.0 : 1.4; H.thVel = 0; H.wander = 0; H.wT = 0; H.lastP = -1; H.misses = 0; H.D0 = H.D;
      F.x = fishX(H.theta, H.D); F.z = fishZ(H.theta, H.D);
      bobber.visible = false; splash(F.x, F.z, 18, 4); audio.sfx('splash'); audio.sfx('powerup', { vol: 0.35 }); ctx.shake(0.3);
      fx.texts.add('Beet!', F.x, 1.8, F.z, '#ffe14a', 1.3);
      rodTargetPitch = 0.95; setPose(angler, 'push', 99);
      if (F.kind === KINDS.giant) { say(pick(SAY.giant)); ctx.hud.showBig('REUZENVIS!', 1300, '#9ad8ff'); audio.sfx('bell'); }
      else if (F.kind === KINDS.boot) say('Hm, dat voelt slap... zou het een laars zijn?');
      else say(pick(SAY.fight));
      pinfo();
    }
    function fishLost(why, sayKind) {
      const F = H.F; if (F) { F.hooked = false; F.spook = 7; F.committed = false; F.x = clamp(F.x, WATER.x0, WATER.x1); F.z = clamp(F.z, WATER.z0, WATER.z1); F.g.position.y = -0.45; F.hd = Math.atan2(F.z - TIP.z, F.x - TIP.x); }
      bob.x = F ? F.x : bob.x; bob.z = F ? F.z : bob.z; bob.y = 0.1;
      ctx.shake(0.25); audio.sfx('bad');
      setPose(angler, 'sad', 1.2); setPose(nettr(), 'sad', 1.2);
      retract(why, sayKind);
    }
    function removeFish(F) {
      F.dead = true; scene.remove(F.g); if (F.glow) scene.remove(F.glow);
      const i = swimmers.indexOf(F); if (i >= 0) swimmers.splice(i, 1);
      if (F.kind === KINDS.giant) { giant = null; giantT = rand(26, 34); }
      else respawn.push({ t: F.kind === KINDS.gold ? 9 : F.kind === KINDS.boot ? 7 : 3, kind: F.kind.id });
    }
    function landed(F) {
      // vangst gelukt
      const K = F.kind; let pts = K.pts; score = Math.max(0, score + pts); if (K !== KINDS.boot) caughtN++;
      updateHud();
      phase = 'caught'; pt = 0;
      const hp = new THREE.Vector3(); hoop.getWorldPosition(hp);
      const obj = K === KINDS.boot ? lake.makeBoot3D() : lake.makeFish3D(K.body, K.len * 1.1, K.id); obj.position.copy(hp); scene.add(obj);
      catchAnim.on = true; catchAnim.t = 0; catchAnim.obj = obj; catchAnim.from.copy(hp); catchAnim.kind = K;
      catchAnim.to.set(lake.boat.position.x + lake.catchBucketPos.x, 0.9, lake.boat.position.z + lake.catchBucketPos.z);
      removeFish(F); H.F = null; leapObj && (leapObj.visible = false);
      crossRing.visible = crossBeam.visible = false; lineMesh.visible = false; bobber.visible = false; gauge.visible = false;
      const col = pts < 0 ? '#ff7a6a' : K === KINDS.giant ? '#9ad8ff' : K === KINDS.gold ? '#ffd23a' : '#9affc0';
      fx.texts.add((pts > 0 ? '+' : '') + pts, hp.x, 3.4, hp.z, col, 1.5);
      fx.texts.add(K.name + (K === KINDS.gold ? '!' : ''), hp.x, 2.7, hp.z, '#ffffff', 1.1);
      splash(hp.x, hp.z, 22, 4.6);
      if (pts > 0) {
        audio.sfx(K === KINDS.giant ? 'win' : 'coin'); audio.sfx('sparkle', { vol: 0.6 });
        setPose(0, 'cheer', 1.6); setPose(1, 'cheer', 1.6); florisPose = 'cheer'; florisT = 1.8;
        fx.particles.burst(hp.x, 2.4, hp.z, { count: 26, speed: 5, up: 2, size: 0.35, colors: [0xffd23a, 0xffffff, 0x6aff9a, 0x9ad8ff], life: 1.0, gravity: 4 });
        say(K === KINDS.giant ? 'DE REUZENVIS! Ongelooflijk, jongens! Dat is een legende!' : K === KINDS.gold ? 'Een GOUDEN vis! Die is zijn gewicht in goud waard!' : pick(SAY.good));
        if (K === KINDS.giant) { ctx.shake(0.6); audio.sfx('powerup'); }
      } else { audio.sfx('buzz'); setPose(0, 'sad', 1.4); setPose(1, 'sad', 1.4); say('Haha, een oude laars! Daar eten we niet van.'); florisPose = 'wave'; florisT = 1.5; }
      rodTargetPitch = 0.6; rodBend = 0.1; pinfo();
    }

    // ------------------------------------------------------------ vissen bewegen
    function swimmersUpdate(dt) {
      // reus plannen
      if (!giant && started) { giantT -= dt; if (giantT <= 0 && phase !== 'fight' && phase !== 'net') {
        const left = Math.random() < 0.5; giant = spawnFish('giant', left ? -24 : 24, rand(-18, -12)); giant.dir = left ? 1 : -1; giant.life = 36; giant.hd = left ? 0 : Math.PI; giant.tgx = left ? 26 : -26; giant.tgz = giant.z + rand(-1.5, 1.5);
        fx.texts.add('Grote schaduw!', left ? -14 : 14, 1.5, giant.z, '#9ad8ff', 1.6); audio.sfx('bell', { vol: 0.5 }); giantT = 999;
        say('Kijk! Een enorme schaduw in het meer... dat is de oude meerval!');
      } }
      for (let i = respawn.length - 1; i >= 0; i--) { respawn[i].t -= dt; if (respawn[i].t <= 0) { const r = respawn.splice(i, 1)[0]; const f = spawnFish(r.kind, rand(WATER.x0, WATER.x1), rand(WATER.z0, WATER.z1 + 4)); f.g.visible = true; } }
      for (let k = swimmers.length - 1; k >= 0; k--) {
        const s = swimmers[k]; if (s.dead) continue;
        s.spook = Math.max(0, s.spook - dt);
        if (s.hooked) { s.g.position.set(s.x, s.depth, s.z); }
        else {
          let tx = s.tgx, tz = s.tgz, sp = s.K.spd * (0.7 + Math.sin(t * 0.7 + s.ph) * 0.3);
          if (s.committed && bob.F === s && (phase === 'wait' || phase === 'bite')) { tx = bob.x; tz = bob.z; sp *= 1.5; }
          else if (s.spook > 0) sp *= 1.8;
          s.tT -= dt;
          if (s.kind !== KINDS.giant && (s.tT <= 0 || Math.hypot(tx - s.x, tz - s.z) < 0.8) && !s.committed) pickTarget(s);
          if (s.kind === KINDS.giant) { s.life -= dt; if (Math.abs(s.x) > 26 && s.life < 30 || s.life <= 0) { removeFish(s); continue; } }
          const want = Math.atan2(tz - s.z, tx - s.x); let dA = want - s.hd; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
          s.hd += clamp(dA, -2.4 * dt, 2.4 * dt);
          if (s.kind === KINDS.boot) { sp = 0.18; }
          s.x += Math.cos(s.hd) * sp * dt; s.z += Math.sin(s.hd) * sp * dt;
          s.x = clamp(s.x, s.kind === KINDS.giant ? -30 : WATER.x0 - 1, s.kind === KINDS.giant ? 30 : WATER.x1 + 1); s.z = clamp(s.z, WATER.z0 - 1, WATER.z1);
          s.g.position.set(s.x, -0.45 + Math.sin(t * 0.9 + s.ph) * 0.06, s.z);
        }
        const wig = s.kind === KINDS.boot ? 0 : Math.sin(t * (s.hooked ? 16 : 6) + s.ph) * (s.hooked ? 0.35 : 0.14);
        s.g.rotation.y = -s.hd + wig; if (s.glow) { s.glow.position.set(s.x, 0.15, s.z); s.glow.material.opacity = 0.35 + Math.sin(t * 5 + s.ph) * 0.2; }
        s.g.userData.mat.opacity = s.K.op * (s.hooked ? 1 : 1);
      }
    }

    // ============================================================== hoofdlus
    function ambient(dt) {
      t += dt;
      lake.update(t, dt);
      ch.forEach((c, i) => { if (pose[i].t > 0) { pose[i].t -= dt; if (pose[i].t <= 0) pose[i].p = 'carry'; } c.pose = pose[i].p; c.update(dt); });
      florisT -= dt; if (florisT <= 0) florisPose = 'idle'; floris.pose = florisPose; floris.update(dt);
      // boot
      const b = lake.boat; b.position.x = boatS.x; b.position.y = Math.sin(t * 1.6) * 0.05 - 0.03; b.rotation.z = Math.sin(t * 1.3) * 0.03 - boatS.vx * 0.012; b.rotation.x = Math.sin(t * 1.1 + 1) * 0.02; b.position.z = lake.boatZ + Math.sin(t * 0.9) * 0.05;
      const nc = ch[nettr()]; nc.group.position.set(boatS.x, 0.28 + b.position.y, lake.boatZ + 0.1);
      if (Math.abs(boatS.vx) > 1.2 && Math.random() < 0.4) lake.ripple(boatS.x - Math.sign(boatS.vx) * 1.4, lake.boatZ + 0.6, 1.4, 0.9, 0xcfeaff);
      // net
      netPitch = damp(netPitch, netPitchTarget, scoopAnim >= 0 ? 22 : 8, dt); netPole.rotation.x = netPitch;
      // hengelaar kijkt in worprichting
      const ac = ch[angler]; ac.group.position.set(TIP.x, TIP.y, TIP.z + 1.0); ac.faceDir(Math.sin(aim), -Math.cos(aim));
      ch[nettr()].faceDir(0, -1);
      rodUpdate(dt);
    }

    function boatUpdate(dt, ctrl) {
      const p = input.p[nettr()]; const target = ctrl ? p.x * 8.4 : 0;
      boatS.vx = damp(boatS.vx, ctrl ? target : boatS.vx * 0.9, 7, dt);
      boatS.x = clamp(boatS.x + boatS.vx * dt, -7.8, 7.8);
    }

    function setGaugePos() { const c = ch[angler]; gauge.position.set(TIP.x, c.height + TIP.y + 1.5, TIP.z + 1.0); }

    function alignInfo() {
      const lineX = fishX(H.theta, NET_D); const dx = boatS.x - lineX; const mis = clamp(Math.abs(dx) / 2.8, 0, 1);
      return { lineX, dx, mis };
    }
    function showCross(al, vis = true) {
      const ok = Math.abs(al.dx) < 1.0, near = Math.abs(al.dx) < 2.0;
      const col = ok ? 0x6aff9a : near ? 0xffe14a : 0xff6a5a;
      crossRing.visible = crossBeam.visible = vis; crossRing.position.set(al.lineX, 0.07, LANE_Z); crossBeam.position.set(al.lineX, 0.06, LANE_Z - 1.6);
      crossRing.material.color.setHex(col); crossBeam.material.color.setHex(col); crossRing.scale.setScalar(1 + Math.sin(t * 8) * 0.06);
      hoopGlowM.color.setHex(col); hoopGlowM.opacity = ok ? 0.5 : 0.22;
      return ok;
    }

    function endCycle() {
      // wissel van rol bij de volgende worp
      phase = 'cast'; pt = 0; needRelease = true; bobber.visible = false; lineMesh.visible = false; crossRing.visible = crossBeam.visible = false; hoopGlowM.opacity = 0; gauge.visible = false;
      rodTargetPitch = 0.6; rodBend = 0.1; setPose(0, 'carry', 0); setPose(1, 'carry', 0); H.F = null; bob.F = null;
      if (swapNext) doSwap();
      if (timeLeft <= 0) { finishGame(); return; }
      say(pick(SAY.cast)); pinfo();
    }
    function doSwap() {
      swapNext = false; swapDone = true;
      const old = angler; angler = 1 - angler;
      placeCast(angler, 'angler'); placeCast(1 - angler, 'netter');
      fx.particles.burst(TIP.x, TIP.y + 1, TIP.z + 1, { count: 20, speed: 3, up: 1.5, size: 0.4, colors: [0xffffff, 0xffd23a, 0x9ad8ff], life: 0.8, gravity: 2 });
      fx.particles.burst(boatS.x, 1.2, lake.boatZ, { count: 20, speed: 3, up: 1.5, size: 0.4, colors: [0xffffff, 0xffd23a, 0x9ad8ff], life: 0.8, gravity: 2 });
      audio.sfx('whoosh'); audio.sfx('sparkle', { vol: 0.5 });
      ctx.hud.showBig('Wissel van rol!', 1600, '#9ad8ff'); say(pick(SAY.swap));
      ctx.hud.toast(`${players[angler].name} is nu de hengelaar, ${players[1 - angler].name} de nettenman`, 3200);
      aim = 0;
    }
    function finishGame() {
      if (done) return; done = true; hud.setTimer(0);
      const stars = score >= STAR_AT[2] ? 3 : score >= STAR_AT[1] ? 2 : score >= STAR_AT[0] ? 1 : 0;
      ch.forEach((c, i) => setPose(i, stars ? 'cheer' : 'sad', 99)); florisPose = stars ? 'cheer' : 'sad'; florisT = 99;
      lineMesh.visible = false; bobber.visible = false; gauge.visible = false; crossRing.visible = crossBeam.visible = aimRing.visible = false;
      ctx.finish({ stars, score, summary: `Jullie vingen <b>${caughtN}</b> vis${caughtN === 1 ? '' : 'sen'} voor <b>${score}</b> punten!` + (stars === 3 ? '<br>Floris is sprakeloos. Wat een visserslatijn!' : stars ? '<br>Floris bakt vanavond verse vis voor jullie.' : '<br>Floris: “Misschien lukt het morgen beter...”') });
    }

    function update(dt) {
      started = true;
      swimmersUpdate(dt);
      ambient(dt);
      // camera
      camera.position.set(camBase.x + Math.sin(t * 0.21) * 0.4, camBase.y + Math.sin(t * 0.17) * 0.12, camBase.z); camera.lookAt(camLook);
      if (done) return;
      elapsed += dt;
      if (!overtime) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          if (phase === 'fight' || phase === 'net' || phase === 'bite') { overtime = true; graceT = GRACE; ctx.hud.showBig('Laatste vis!', 1200, '#ffe14a'); }
          else if (phase === 'caught' || phase === 'lost') overtime = true;
          else { finishGame(); return; }
        }
      } else {
        graceT -= dt;
        if (graceT <= 0 && phase !== 'caught' && phase !== 'lost') { finishGame(); return; }
      }
      hud.setTimer(Math.max(0, timeLeft), 10);
      if (!swapWarn && elapsed >= SWAP_AT - 9) { swapWarn = true; ctx.hud.toast('Straks wisselen jullie van rol!', 2400); }
      if (!swapDone && !swapNext && elapsed >= SWAP_AT) swapNext = true;
      const A = input.p[angler], B = input.p[nettr()];
      pt += dt;
      boatUpdate(dt, true);

      switch (phase) {
        case 'cast': {
          aim = clamp(aim + A.x * 1.05 * dt, -0.7, 0.7);
          if (needRelease && !A.a) needRelease = false;
          const D = lerp(8.4, 18, lastPower); aimRing.visible = true; aimRing.position.set(TIP.x + D * Math.sin(aim), 0.08, TIP.z - D * Math.cos(aim)); aimRing.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
          aimRing.material.opacity = 0.55;
          rodTargetPitch = 0.6 + Math.sin(t * 1.5) * 0.04;
          setGaugePos();
          if (A.aP && !needRelease) { startCharge(); }
          hintKey = ''; break;
        }
        case 'charge': {
          aim = clamp(aim + A.x * 0.9 * dt, -0.7, 0.7);
          power += powerDir * dt / 0.95; if (power >= 1) { power = 1; powerDir = -1; } if (power <= 0) { power = 0; powerDir = 1; }
          const D = lerp(8.4, 18, power); aimRing.position.set(TIP.x + D * Math.sin(aim), 0.08, TIP.z - D * Math.cos(aim)); aimRing.scale.setScalar(1.1 + power * 0.4); aimRing.material.opacity = 0.9;
          rodTargetPitch = 1.6 + power * 0.3; rodBend = 0.2 + power * 0.2;
          setGaugePos(); gauge.visible = true; drawGauge('power', power);
          reelTick -= dt; if (reelTick <= 0) { reelTick = 0.1; audio.tone(300 + power * 700, 0.05, { type: 'triangle', vol: 0.06 }); }
          if (A.aR || !A.a) { launch(); }
          break;
        }
        case 'fly': {
          const k = clamp(pt / 0.75, 0, 1);
          bob.x = lerp(bob.fromX, bob.tx, k); bob.z = lerp(bob.fromZ, bob.tz, k); bob.y = lerp(bob.fromY, 0.12, k) + Math.sin(k * Math.PI) * 4.2;
          bobber.position.set(bob.x, bob.y, bob.z);
          setLine(rodTip, bobber.position, 0.2 * (1 - k));
          aimRing.visible = false;
          if (k >= 1) enterWait();
          break;
        }
        case 'wait': {
          bob.waitT += dt; aimRing.visible = false;
          // visje zoeken
          if (bob.sub === 'seek') {
            if (!bob.F || bob.F.dead || bob.F.hooked) { const s = nearestBait(); if (s) bait(s); }
            if (!bob.F && bob.waitT > 6.5) { // hulpje: een voorntje komt nieuwsgierig kijken
              const s = swimmers.find((q) => q.kind === KINDS.small && !q.hooked && q.spook <= 0) || swimmers.find((q) => !q.hooked && q.kind !== KINDS.giant);
              if (s) { const a = rand(0, TAU); s.x = bob.x + Math.cos(a) * 4.5; s.z = bob.z + Math.sin(a) * 4.5; s.hd = a + Math.PI; bait(s); }
            }
            if (bob.F && Math.hypot(bob.F.x - bob.x, bob.F.z - bob.z) < 0.9) {
              bob.sub = 'nibble'; bob.nibT = 0; bob.nibN = bob.F.K.nib; if (bob.nibN === 0) { bob.sub = 'bite'; bob.biteT = bob.F.K.bite; startBite(); }
            }
          } else if (bob.sub === 'nibble') {
            bob.nibT += dt; const cyc = 0.85;
            const ph = bob.nibT % cyc; const nth = Math.floor(bob.nibT / cyc);
            bob.dip = ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI) * 0.16 : 0;
            if (ph < dt + 0.001 && nth < bob.nibN) { lake.ripple(bob.x, bob.z, 1.2, 0.8); audio.sfx('tick', { vol: 0.6 }); }
            if (nth >= bob.nibN) { bob.sub = 'bite'; bob.biteT = bob.F.K.bite; startBite(); }
            else if (A.aP) { // te vroeg!
              bob.F.spook = 6; bob.F.committed = false; fx.particles.burst(bob.x, 0.1, bob.z, { count: 6, speed: 2, size: 0.2, color: 0xffffff, life: 0.5 });
              retract('Te vroeg!', 'early'); audio.sfx('miss'); break;
            }
          } else if (bob.sub === 'bite') {
            bob.biteT -= dt; bob.dip = 0.45 + Math.sin(t * 30) * 0.05;
            if (A.aP) { hookFish(); break; }
            if (bob.biteT <= 0) { bob.F.spook = 6; bob.F.committed = false; retract(bob.F.kind === KINDS.boot ? 'Laars weg' : 'Te laat!', bob.F.kind === KINDS.boot ? null : 'late'); audio.sfx('miss'); break; }
          }
          if (B.bP || A.bP) { if (bob.sub !== 'bite') { retract('', null); audio.sfx('whoosh', { vol: 0.5 }); break; } }
          // dobber
          bob.y = 0.12 + Math.sin(t * 2.4) * 0.03 - bob.dip;
          bobber.position.set(bob.x + Math.sin(t * 1.3) * 0.03, bob.y, bob.z); bobber.rotation.z = Math.sin(t * 3) * 0.1;
          setLine(rodTip, bobber.position, 0.35);
          rodBend = 0.08 + bob.dip * 0.5; rodTargetPitch = 0.7;
          setGaugePos();
          if (bob.sub === 'bite') { gauge.visible = true; drawGauge('bite', 0, 0, bob.F.kind === KINDS.boot ? 1 : 0); }
          else { gauge.visible = false; }
          if (bob.waitT > 4.5 && !bob.F && !bob.hinted) { bob.hinted = true; say('Geen visje in de buurt... Gooi dichter bij een schaduw! (B = lijn binnenhalen)'); }
          break;
        }
        case 'fight': fightUpdate(dt, A, B); break;
        case 'net': netUpdate(dt, A, B); break;
        case 'caught': {
          const ca = catchAnim; ca.t += dt;
          if (ca.on && ca.obj) {
            const k = clamp(ca.t / 0.9, 0, 1); ca.obj.position.lerpVectors(ca.from, ca.to, k); ca.obj.position.y += Math.sin(k * Math.PI) * 2.2; ca.obj.rotation.z = k * 6; ca.obj.rotation.y += dt * 4;
            if (k >= 1) { ca.on = false; scene.remove(ca.obj); ca.obj = null; audio.sfx('wood', { vol: 0.5 }); fx.particles.burst(ca.to.x, ca.to.y, ca.to.z, { count: 8, speed: 2, size: 0.25, colors: [0xffffff, 0x9ad8ff], life: 0.5, gravity: 8 }); }
          }
          netPitchTarget = pt < 0.4 ? -0.8 : 0.4;
          if (pt > 1.8) endCycle();
          break;
        }
        case 'lost': {
          const k = clamp(pt / 0.55, 0, 1);
          bobber.position.set(lerp(bob.fromX, rodTip.x, k), lerp(bob.fromY, rodTip.y, k) + Math.sin(k * Math.PI) * 1.2, lerp(bob.fromZ, rodTip.z, k));
          setLine(rodTip, bobber.position, 0.2); if (k >= 1) { bobber.visible = false; lineMesh.visible = false; }
          if (pt > 1.2) endCycle();
          break;
        }
        default: break;
      }
      if (phase !== 'fight' && phase !== 'net') { hoopGlowM.opacity = damp(hoopGlowM.opacity, 0, 8, dt); netPitchTarget = phase === 'caught' ? netPitchTarget : 0.4; }
      // ruststand van de net-animatie
      if (scoopAnim >= 0) { scoopAnim += dt; const k = scoopAnim / 0.55; netPitchTarget = k < 0.35 ? -0.95 : 0.4; if (k >= 1) { scoopAnim = -1; } }
      updateHud();
      pinfoThrottle();
      if (camShake > 0) camShake = Math.max(0, camShake - dt);
    }
    let pinT = 0, pinPhase = ''; function pinfoThrottle() { const k = phase + (H.F ? H.F.kind.id : '') + angler; if (k !== pinPhase) { pinPhase = k; pinfo(); } }

    function startBite() {
      const F = bob.F; const boot = F.kind === KINDS.boot;
      lake.ripple(bob.x, bob.z, 2.4, 1.0); splash(bob.x, bob.z, 10, 2.6);
      audio.sfx(boot ? 'miss' : 'ding'); if (!boot) audio.tone(880, 0.25, { type: 'triangle', vol: 0.25, send: 0.2 });
      ctx.shake(0.15);
      say(boot ? 'De dobber zakt zo slap weg... zou dat een laars zijn?' : pick(SAY.bite));
      setPose(angler, 'scared', 0.5); ch[angler].jump();
      fx.texts.add(boot ? '?' : '!', bob.x, 2.3, bob.z, boot ? '#9ad8ff' : '#ffe14a', 1.8);
    }

    // ----------------------------------------------------------- vecht-fase
    function fightUpdate(dt, A, B) {
      const F = H.F, K = F.kind, giantFight = K === KINDS.giant;
      const al = alignInfo(); const mult = 1 + 1.3 * al.mis;
      showCross(al, true);
      // modi
      H.modeT -= dt;
      if (H.modeT <= 0) {
        if (H.mode === 'calm') { if (Math.random() < (giantFight ? 0.8 : K.runP)) { H.mode = 'warn'; H.modeT = giantFight ? 0.7 : 0.55; audio.sfx('tick'); } else H.modeT = rand(0.9, 2); }
        else if (H.mode === 'warn') { H.mode = 'run'; H.modeT = giantFight ? rand(1.1, 1.5) : rand(0.9, 1.4); H.runDir = Math.abs(H.theta) > 0.4 ? -Math.sign(H.theta) : (Math.random() < 0.5 ? -1 : 1); audio.sfx('whoosh', { vol: 0.5 }); fx.texts.add(giantFight ? 'STOP!' : 'LOS!', F.x, 2.2, F.z, '#ff6a5a', 1.3); ctx.shake(0.2); }
        else { H.mode = 'calm'; H.modeT = giantFight ? rand(2.3, 3.6) : rand(1.5, 2.8); }
      }
      const run = H.mode === 'run', warn = H.mode === 'warn';
      H.wT -= dt; if (H.wT <= 0) { H.wT = rand(0.7, 1.5); H.wander = rand(-0.55, 0.55) - H.theta * 0.5; }
      H.thVel = damp(H.thVel, run ? H.runDir * 1.7 : H.wander, 4, dt);
      H.theta += H.thVel * dt; if (Math.abs(H.theta) > 0.82) { H.theta = Math.sign(H.theta) * 0.82; H.thVel *= -0.4; H.wander = -Math.sign(H.theta) * 0.4; }
      const holding = A.a;
      if (!giantFight) {
        if (run) { H.D += 2.0 * dt; if (holding) H.D -= K.reel * dt; }
        else if (holding) H.D -= K.reel * dt; else H.D += 0.3 * dt;
        let dT;
        if (holding) dT = run ? 1.15 * mult : K.grow * mult; else dT = run ? -0.22 : -0.55;
        if (warn && holding) dT += 0.1;
        H.T = clamp(H.T + dT * dt, 0, 1.2);
        if (holding) { reelTick -= dt; if (reelTick <= 0) { reelTick = 0.085; audio.tone(420 + H.T * 900, 0.04, { type: 'square', vol: 0.05 }); } }
      } else {
        H.D += (run ? 2.8 : 1.15) * dt;
        H.T += (run ? 0.5 : 0.15) * mult * dt;
        for (const p of [angler, nettr()]) {
          if (!input.p[p].aP) continue;
          if (run) { H.T += 0.24; fx.texts.add('Stop!', ch[p].group.position.x, 3.2, ch[p].group.position.z, '#ff6a5a', 0.9); audio.sfx('buzz', { vol: 0.4 }); }
          else if (p === H.lastP) { H.T += 0.13; fx.texts.add('Om en om!', ch[p].group.position.x, 3.2, ch[p].group.position.z, '#ffe14a', 0.9); audio.sfx('miss', { vol: 0.5 }); }
          else { H.D -= 1.0; H.T = Math.max(0, H.T - 0.055); H.lastP = p; ch[p].swing(); audio.tone(420 + (H.D0 - H.D) * 40, 0.07, { type: 'triangle', vol: 0.15 }); fx.particles.burst(F.x, 0.2, F.z, { count: 4, speed: 2, size: 0.22, color: 0xcfeaff, life: 0.5, gravity: 8 }); }
        }
        H.T = clamp(H.T, 0, 1.2);
      }
      H.D = clamp(H.D, NET_D, MAXD);
      // positie
      F.x = fishX(H.theta, H.D); F.z = fishZ(H.theta, H.D); F.depth = lerp(-0.1, -0.4, clamp((H.D - NET_D) / 8, 0, 1));
      F.hd = Math.atan2(F.z - TIP.z, F.x - TIP.x) + Math.PI + Math.sin(t * 9) * 0.5 * (run ? 1 : 0.4);
      // water-effecten
      if (Math.random() < (run ? 0.5 : 0.18)) lake.ripple(F.x + rand(-0.4, 0.4), F.z + rand(-0.4, 0.4), run ? 2.2 : 1.4, 0.8);
      if (run && Math.random() < 0.5) fx.particles.burst(F.x, 0.1, F.z, { count: 3, speed: 2, size: 0.25, color: 0xffffff, life: 0.5, gravity: 8 });
      // lijn + hengel
      vb.set(F.x, 0.08, F.z); setLine(rodTip, vb, (1 - clamp(H.T, 0, 1)) * 0.7 + 0.05, 0.05 + H.T * 0.02);
      lineMat.color.setRGB(1, 1 - H.T * 0.7, 1 - H.T * 0.8);
      rodBend = 0.12 + H.T * 0.45; rodTargetPitch = 0.85 + H.T * 0.2;
      setGaugePos(); gauge.visible = true; drawGauge(giantFight ? 'giant' : 'tension', clamp(H.T, 0, 1), run || warn ? 1 : 0);
      if (H.T > 0.8) { warnBeep -= dt; if (warnBeep <= 0) { warnBeep = 0.16; audio.tone(1100 + H.T * 400, 0.05, { type: 'square', vol: 0.06 }); } }
      // netman op de goede plek? kleine hulp-feedback
      B.x;
      if (H.T >= 1) { audio.sfx('hurt'); fx.particles.burst(rodTip.x, rodTip.y, rodTip.z, { count: 10, speed: 3, size: 0.2, color: 0xffffff, life: 0.5 }); fishLost('Lijn knapt!', 'snap'); return; }
      if (H.D <= NET_D + 0.02) { enterNet(); }
    }
    function enterNet() {
      phase = 'net'; pt = 0; H.netT = 0; H.leapT = -0.4; H.leapGap = 0.4; H.misses = 0; H.scoopT = -1; H.cool = 0; H.pressT = [-9, -9]; H.wT = 0;
      const F = H.F; leapKind = F.kind;
      if (leapObj) { scene.remove(leapObj); leapObj = null; }
      leapObj = F.kind === KINDS.boot ? lake.makeBoot3D() : lake.makeFish3D(F.kind.body, F.kind.len * 1.1, F.kind.id); leapObj.visible = false; scene.add(leapObj);
      say(F.kind === KINDS.giant ? 'Samen scheppen! Allebei tegelijk drukken als het net eronder zit!' : F.kind === KINDS.boot ? 'Hij is er! Wil je die laars echt scheppen?' : pick(SAY.net));
      audio.sfx('bell', { vol: 0.5 }); pinfo();
    }
    function netUpdate(dt, A, B) {
      const F = H.F, K = F.kind, giantFight = K === KINDS.giant;
      H.netT += dt; H.cool -= dt;
      // vis zwemt heen en weer vlak voor de boot
      H.wT -= dt; if (H.wT <= 0) { H.wT = rand(0.7, 1.3); H.wander = rand(-0.9, 0.9) * (giantFight ? 0.5 : 1) - H.theta * 0.8; }
      H.thVel = damp(H.thVel, H.wander * 0.8, 3.5, dt); H.theta = clamp(H.theta + H.thVel * dt, -0.55, 0.55);
      const holding = A.a;
      if (giantFight) { H.T = Math.max(0, H.T - 0.1 * dt); if (A.aP || B.aP) {} }
      else { H.T = clamp(H.T + (holding ? 0.55 : -0.5) * dt, 0, 1.2); }
      F.x = fishX(H.theta, NET_D); F.z = fishZ(H.theta, NET_D); F.depth = -0.15;
      const al = alignInfo(); const ok = showCross(al, true);
      // springen
      H.leapGap -= dt;
      if (H.leapT < 0 && H.leapGap <= 0) { H.leapT = 0; audio.sfx('splash', { vol: 0.35 }); splash(F.x, F.z, 8, 2.4); }
      if (H.leapT >= 0) {
        H.leapT += dt; const k = H.leapT / 0.75;
        if (k >= 1) { H.leapT = -1; H.leapGap = 0.25 + Math.random() * 0.2; leapObj.visible = false; splash(F.x, F.z, 8, 2.2); }
        else { const hgt = Math.sin(k * Math.PI) * (giantFight ? 2.2 : 1.7); leapObj.visible = true; leapObj.position.set(F.x + Math.cos(F.hd) * (k - 0.5) * 0.8, 0.1 + hgt, F.z + Math.sin(F.hd) * (k - 0.5) * 0.8); leapObj.rotation.set(0, -F.hd + Math.PI, 0); leapObj.rotation.z = (0.5 - k) * 2.2 * (leapKind === KINDS.boot ? 0.3 : 1) + (leapKind === KINDS.boot ? t * 8 : 0); }
      }
      F.hd = -Math.PI / 2 + Math.sin(t * 3) * 0.6;
      // lijn
      vb.set(F.x, H.leapT >= 0 ? leapObj.position.y : 0.08, F.z); setLine(rodTip, vb, 0.4 * (1 - H.T), 0.045);
      rodBend = 0.15 + H.T * 0.4; rodTargetPitch = 0.9;
      setGaugePos(); gauge.visible = true; drawGauge(giantFight ? 'giant' : 'tension', clamp(H.T, 0, 1), 0);
      if (!giantFight && H.T >= 1) { fishLost('Lijn knapt!', 'snap'); return; }
      // scheppen
      if (scoopAnim < 0 && H.cool <= 0) {
        let go = false;
        if (giantFight) {
          if (A.aP) H.pressT[angler] = t; if (B.aP) H.pressT[nettr()] = t;
          const both = Math.abs(H.pressT[0] - H.pressT[1]) < 0.55 && t - Math.max(H.pressT[0], H.pressT[1]) < 0.1;
          if (both) go = true; else if (B.aP && H.cool <= 0) { fx.texts.add('Samen!', boatS.x, 2.6, lake.boatZ, '#ffe14a', 1.1); }
        } else if (B.aP) go = true;
        if (go) { scoopAnim = 0; H.scoopT = 0; H.cool = 0.9; audio.sfx('swing'); ch[nettr()].swing(); H.pressT = [-9, -9]; }
      }
      if (H.scoopT >= 0) {
        H.scoopT += dt;
        if (H.scoopT >= 0.2) {
          H.scoopT = -1; const dx = boatS.x - F.x; const tol = K.tol * (giantFight ? 1 : 1);
          if (Math.abs(dx) <= tol) { splash(boatS.x, LANE_Z, 16, 4); landed(F); return; }
          H.misses++; H.cool = 0.6; fx.texts.add('Mis!', boatS.x, 2.2, LANE_Z + 0.5, '#ff9a8a', 1.2); audio.sfx('miss'); splash(boatS.x, LANE_Z, 6, 2.5); say(pick(SAY.miss));
          if (H.misses >= 3) { if (leapObj) leapObj.visible = false; fishLost('Ontsnapt!', 'late'); return; }
        }
      }
      // te lang wachten?
      if (H.netT > (giantFight ? 10 : 7.5)) { if (leapObj) leapObj.visible = false; fishLost(K === KINDS.boot ? 'Laars viel af' : 'Eraf!', K === KINDS.boot ? null : 'late'); return; }
    }

    function onStart() { started = true; say(pick(SAY.start)); setTimeout(() => { if (!done && phase === 'cast') say(pick(SAY.cast)); }, 4200); pinfo(); }
    hud.setTimer(DURATION, 10); updateHud(); pinfo();
    drawGauge('none');

    function idleUpdate(dt) { ambient(dt); camera.position.set(camBase.x + Math.sin(t * 0.21) * 0.4, camBase.y, camBase.z); camera.lookAt(camLook); swimmersUpdate(dt * 0.6); }
    return {
      update, introUpdate: idleUpdate, resultUpdate: idleUpdate, onStart, onResize() { fit(); },
      dbgPower: () => power,
      dbg: () => ({ phase, angler, score, caughtN, timeLeft, elapsed, bobSub: bob.sub, T: H.T, D: H.D, mode: H.mode, kind: H.F && H.F.kind.id, theta: H.theta, boatX: boatS.x, lineX: fishX(H.theta, NET_D), fx: H.F ? H.F.x : 0, fz: H.F ? H.F.z : 0, aim, bobx: bob.x, bobz: bob.z, giant: !!giant, lastP: H.lastP, swimmers: swimmers.map((s) => ({ k: s.kind, x: s.x, z: s.z })) }),
      dispose() {},
    };
  },
};

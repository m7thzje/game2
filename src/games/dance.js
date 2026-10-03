import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, shuffle, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { Animal } from '../engine/chars.js';
import { buildStage } from './dance_world.js';
import { NOTES, BEAT, BAR, SONG_END, LAST_NOTE_T, EVENTS, mtof, sectionAt } from './dance_song.js';

// Dansduel — Dance-Dance-Revolution voor twee broers, ieder met een eigen baan (dezelfde pijlen-reeks voor allebei).
//  * richtingen = pijl op tijd raken (Perfect / Goed / Mis), combo's geven meer punten
//  * A = SABOTAGE zodra je meter vol is (een bol vliegt naar de baan van je broer: spiegel-, knipper-, turbo-pijlen of een kip in beeld)
//  * B = SCHILD: kaatst een aankomende sabotage terug naar de afzender (en vergeeft even je missers); daarna een tijdje wachten
//  * comeback: wie achterstaat krijgt gouden pijlen (dubbele punten), meter vult sneller
//  * winnaar: hoogste score na het nummer (gelijk: meeste perfects, dan langste combo)

const LANE_X = [-6.3, 6.3];
const AW = 1.1;                           // afstand tussen de vier pijlen
const REC_Y = 7.0, SPAWN_Y = 1.45;
const LOOK = 1.5;                         // seconden vooruit zichtbaar
const SPEED = (REC_Y - SPAWN_Y) / LOOK;
const W_PERF = 0.075, W_GOOD = 0.165, W_WRONG = 0.24;
const FLIP_AT = 0.95;                     // spiegelpijlen draaien zo lang voor de treffer om
const SAB_T = 6.0, SHIELD_T = 1.15, SHIELD_CD = 7.5, ORB_T = 0.9;
const DIR_ROT = [Math.PI / 2, Math.PI, 0, -Math.PI / 2];     // links, omlaag, omhoog, rechts (pijl-model wijst omhoog)
const DIR_COL = [0xff4fa8, 0x4fd8ff, 0x8dff6a, 0xffb03a];
const DIR_NAMES = ['links', 'omlaag', 'omhoog', 'rechts'];
const SABS = [
  { id: 'spiegel', name: 'SPIEGEL-PIJLEN!', col: '#d98aff' },
  { id: 'knipper', name: 'KNIPPER-PIJLEN!', col: '#ffe14a' },
  { id: 'turbo', name: 'TURBO-PIJLEN!', col: '#ff6a4a' },
  { id: 'kip', name: 'KIP IN BEELD!', col: '#ffffff' },
];
const NA = NOTES.length;

function arrowGeo(s = 1) {
  const sh = new THREE.Shape(); sh.moveTo(0, 0.5); sh.lineTo(0.5, -0.06); sh.lineTo(0.2, -0.06); sh.lineTo(0.2, -0.46); sh.lineTo(-0.2, -0.46); sh.lineTo(-0.2, -0.06); sh.lineTo(-0.5, -0.06); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 1 });
  g.translate(0, 0.03, -0.08); g.scale(s, s, 1); return g;
}
function labelTex(txt, col, w = 256, h = 72, size = 46) {
  return canvasTex(w, h, (g, W, H) => { g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 11; g.strokeStyle = 'rgba(20,6,40,.95)'; g.lineJoin = 'round'; g.strokeText(txt, W / 2, H / 2 + 2, W - 12); g.fillStyle = col; g.fillText(txt, W / 2, H / 2 + 2, W - 12); });
}
function shieldTex() {
  return canvasTex(96, 96, (g) => {
    g.translate(48, 48); g.beginPath(); g.moveTo(0, -38); g.quadraticCurveTo(34, -30, 34, -6); g.quadraticCurveTo(34, 26, 0, 40); g.quadraticCurveTo(-34, 26, -34, -6); g.quadraticCurveTo(-34, -30, 0, -38); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#1a0830'; g.stroke();
    g.fillStyle = '#1a0830'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', 0, 2);
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function laneTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1c0c36'); gr.addColorStop(1, '#10081f'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, w, 6); g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, h / 2, w, 3);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.keep = true; return t;
}

export default {
  id: 'dance',
  name: 'Dansduel',
  giver: 'Disco-Dino',
  icon: '🪩',
  mode: 'pvp',
  time: 80,
  music: 'concert',
  blurb: 'Dans-battle in de disco van het kasteel! Tik de <b>pijlen</b> precies op de lijn: <b>Perfect</b> geeft de meeste punten. Een volle meter laat je met <b>A</b> een gemene <b>sabotage</b> naar je broer sturen. Met <b>B</b> kaats je zo\'n sabotage terug! Wie achterstaat krijgt <b>gouden pijlen</b> (dubbele punten).',
  controls: ['{move} de pijl raken als hij de lijn bereikt', '{a} SABOTAGE sturen (als je meter vol is)', '{b} SCHILD: kaatst sabotage terug'],
  tip: 'Een schild houdt maar 1 seconde stand: gebruik hem als de sabotage-bol naar je toe vliegt!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp, names = players.map((p) => p.name), tid = ctx.twist.id;
    const GRAV = pv.gravity || 1, SLIP = pv.slip || 0;
    const tempo = tid === 'turbo' ? 1.24 : tid === 'slowmo' ? 0.86 : 1;

    const L = ctx.lights('indoor', { shadow: 12, center: [0, 2, 0], fogNear: 30, fogFar: 80 });
    L.hemi.intensity = 0.95; L.hemi.color.set(0xd8b8ff); L.hemi.groundColor.set(0x40206a);
    L.sun.color.set(0xffd8f0); L.sun.intensity = 1.2; L.sun.position.set(-4, 16, 14);
    camera.fov = 48; camera.updateProjectionMatrix();
    const S = buildStage(ctx);

    // ---------------- banen ----------------
    const lt = laneTex(); const gt = glowTex();
    const lanes = players.map((pp, p) => {
      const x = LANE_X[p], hex = p ? 0x4a8cff : 0x35c46f;
      const panelM = new THREE.MeshBasicMaterial({ map: lt.clone(), color: 0xffffff, transparent: true, opacity: 0.93 }); panelM.map.needsUpdate = true; panelM.map.repeat.set(1, 1.5); panelM.map.wrapS = panelM.map.wrapT = THREE.RepeatWrapping;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4 * AW + 0.5, 7.5), panelM); panel.position.set(x, 4.75, -0.2); scene.add(panel);
      for (const sx of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.14, 7.7, 0.25), new THREE.MeshBasicMaterial({ color: hex }), { cast: false, pos: [x + sx * (2 * AW + 0.3), 4.75, -0.1] }));
      scene.add(mesh(new THREE.BoxGeometry(4 * AW + 0.75, 0.14, 0.25), new THREE.MeshBasicMaterial({ color: hex }), { cast: false, pos: [x, 8.55, -0.1] }));
      scene.add(mesh(new THREE.BoxGeometry(4 * AW + 0.75, 0.14, 0.25), new THREE.MeshBasicMaterial({ color: hex }), { cast: false, pos: [x, 0.97, -0.1] }));
      // ontvangstlijn-gloed
      const band = new THREE.Mesh(new THREE.PlaneGeometry(4 * AW + 0.4, 1.3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })); band.position.set(x, REC_Y, -0.15); scene.add(band);
      // meter (onder de baan)
      const mBack = mesh(new THREE.BoxGeometry(4 * AW, 0.36, 0.14), new THREE.MeshBasicMaterial({ color: 0x1a0c30 }), { cast: false, pos: [x - 0.2, 0.55, 0.0] }); scene.add(mBack);
      const fg = new THREE.BoxGeometry(1, 0.26, 0.12); fg.translate(0.5, 0, 0);
      const mFill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x4fd8ff })); mFill.position.set(x - 0.2 - 2 * AW, 0.55, 0.08); mFill.scale.x = 0.001; scene.add(mFill);
      const mLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('A: SABOTAGE!', '#ffe14a', 256, 72, 40), transparent: true, depthTest: false })); mLabel.scale.set(2.8, 0.8, 1); mLabel.position.set(x - 0.2, 1.1, 0.5); mLabel.visible = false; mLabel.renderOrder = 15; scene.add(mLabel);
      // schild-icoon + herlaadbalkje
      const sh = new THREE.Sprite(new THREE.SpriteMaterial({ map: shieldTex(), color: 0x6fe8ff, transparent: true, depthTest: false })); sh.scale.set(0.95, 0.95, 1); sh.position.set(x + 2 * AW + 0.05, 0.62, 0.4); sh.renderOrder = 15; scene.add(sh);
      const cg = new THREE.BoxGeometry(1, 0.08, 0.1); cg.translate(0.5, 0, 0);
      const cd = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffffff })); cd.position.set(x + 2 * AW - 0.42, 0.06, 0.1); cd.scale.x = 0.85; scene.add(cd);
      // schild-effect over de ontvangstlijn
      const dome = new THREE.Mesh(new THREE.PlaneGeometry(4 * AW + 0.6, 2.2), new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); dome.position.set(x, REC_Y, 0.3); scene.add(dome);
      // oordeel + combo
      const jt = { perfect: labelTex('PERFECT!', '#ffe14a'), good: labelTex('GOED', '#8dff6a'), miss: labelTex('MIS', '#ff7a7a'), gold: labelTex('GOUD x2!', '#ffd23f'), block: labelTex('GEBLOKT!', '#6fe8ff'), back: labelTex('TERUGGEKAATST!', '#6fe8ff', 384, 72, 40) };
      const judge = new THREE.Sprite(new THREE.SpriteMaterial({ map: jt.perfect, transparent: true, depthTest: false, opacity: 0 })); judge.scale.set(2.8, 0.8, 1); judge.position.set(x, REC_Y - 1.7, 0.6); judge.renderOrder = 16; scene.add(judge);
      const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 128; const cctx = cvs.getContext('2d'); const ctex = new THREE.CanvasTexture(cvs); ctex.colorSpace = THREE.SRGBColorSpace;
      const comboS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, depthTest: false, opacity: 0.9 })); comboS.scale.set(2.6, 1.3, 1); comboS.position.set(x, 4.1, 0.5); comboS.renderOrder = 14; comboS.visible = false; scene.add(comboS);
      // kip-saboteur
      const chick = new Animal('chicken'); chick.group.scale.setScalar(3.4); chick.group.visible = false; scene.add(chick.group);
      return { x, hex, panel, panelM, band, mFill, mLabel, sh, cd, dome, jt, judge, comboS, cctx, ctex, chick };
    });
    // pijlen: 1 InstancedMesh (+ rand erachter) voor beide banen, en 8 ontvangers
    const AG = arrowGeo(0.9), AGB = arrowGeo(1.12);
    const ARR_N = 120;
    const arrows = new THREE.InstancedMesh(AG, new THREE.MeshBasicMaterial({ color: 0xffffff }), ARR_N); arrows.frustumCulled = false; arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const borders = new THREE.InstancedMesh(AGB, new THREE.MeshBasicMaterial({ color: 0xffffff }), ARR_N); borders.frustumCulled = false; borders.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    arrows.setColorAt(0, new THREE.Color(1, 1, 1)); borders.setColorAt(0, new THREE.Color(1, 1, 1)); arrows.count = borders.count = 0; scene.add(borders, arrows);
    const recs = new THREE.InstancedMesh(AGB, new THREE.MeshBasicMaterial({ color: 0xffffff }), 8); recs.frustumCulled = false; recs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); recs.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(recs);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
    function put(im, i, x, y, z, rot, sc, col, flipY = 1) { _q.setFromEuler(_e.set(0, 0, rot)); _p.set(x, y, z); _s.set(sc, sc * flipY, sc); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); if (col !== null) im.setColorAt(i, _c.setHex(col)); }

    // ---------------- poppetjes op het podium ----------------
    const dancers = players.map((pp, p) => {
      const c = ctx.make.brother(p); const k = 1.75 * pv.size(p); c.group.scale.setScalar(k);
      const holder = new THREE.Group(); holder.add(c.group); const bx = p ? 2.05 : -2.05; holder.position.set(bx, 0.3, 1.2); scene.add(holder);
      c.faceDir((p ? -1 : 1) * 0.3, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: p ? 0x4a8cff : 0x35c46f, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(bx, 0.33, 1.2); scene.add(pool);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.4, 0.9, 1); tag.renderOrder = 15; scene.add(tag);
      return { c, holder, k, bx, tag, pool, J: { lx: 0, rx: 0, alx: 0, arx: 0, alz: 0, arz: 0, tz: 0, tx: 0, hz: 0, hy: 0, by: 0 }, mv: { d: -1, t: 9, gold: false }, spin: 0, stumble: 0, cheer: 0, slideX: 0 };
    });

    // ---------------- toestand ----------------
    let T = 0, introT = 0, songT = 0, started = false, finished = false, ending = false, endT = 0, beatIdxLast = -1, evI = 0, timeLeft = 80;
    const score = [0, 0], combo = [0, 0], maxCombo = [0, 0], meter = [0, 0], perfects = [0, 0], goods = [0, 0], misses = [0, 0], golds = [0, 0], hits = [0, 0];
    const ptr = [0, 0], vptr = [0, 0];
    const ns = [Array.from({ length: NA }, () => ({ s: 0, init: false, gold: false, flip: false, t0: 0 })), Array.from({ length: NA }, () => ({ s: 0, init: false, gold: false, flip: false, t0: 0 }))];
    const sab = [{ id: null, t: 0, from: -1 }, { id: null, t: 0, from: -1 }];
    const shield = [{ on: 0, cd: 0 }, { on: 0, cd: 0 }];
    const sabQueue = [shuffle(SABS.map((s) => s.id)), shuffle(SABS.map((s) => s.id))];
    const orbs = []; const speedMul = [1, 1];
    const aHold = [-1, -1];
    const flashRec = [[0, 0, 0, 0], [0, 0, 0, 0]], judgeT = [9, 9], sabSent = [0, 0], reflects = [0, 0], blocks = [0, 0];
    const stats = { total: NA, sabs: [0, 0], reflects: [0, 0], golds: [0, 0], wrong: [0, 0] };
    let comboDraw = [-1, -1], infoTxt = ['', ''], lastBar = -1, sectionName = '', deurPenalty = [0, 0];

    // ---------------- hulp ----------------
    const tNow = () => (started ? songT : introT);
    function behind(p) { const o = score[1 - p], me = score[p]; return o - me > 400 + 0.06 * o; }
    function dirNow(p, i) { const n = NOTES[i], q = ns[p][i]; return q.flip ? 3 - n.d : n.d; }
    function refreshInfo() {
      for (let p = 0; p < 2; p++) {
        const m = Math.floor(meter[p]), sh = shield[p];
        const txt = `${score[p]} pt · combo ${combo[p]} · ${m >= 100 ? 'A: SABOTAGE!' : `meter ${m}%`}${sh.cd > 0 ? '' : ' · schild klaar'}`;
        if (txt !== infoTxt[p]) { infoTxt[p] = txt; hud.setPlayerInfo(p, txt); }
      }
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}`);
    }
    function drawCombo(p) {
      const l = lanes[p], g = l.cctx; g.clearRect(0, 0, 256, 128);
      if (combo[p] < 3) { l.comboS.visible = false; comboDraw[p] = combo[p]; return; }
      l.comboS.visible = true; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.font = 'bold 74px Fredoka, Arial Black, sans-serif'; g.lineWidth = 12; g.strokeStyle = 'rgba(20,6,40,.9)'; g.strokeText(String(combo[p]), 128, 48); g.fillStyle = combo[p] >= 30 ? '#ffd23f' : combo[p] >= 10 ? '#ff9ad5' : '#ffffff'; g.fillText(String(combo[p]), 128, 48);
      g.font = 'bold 32px Fredoka, Arial Black, sans-serif'; g.lineWidth = 8; g.strokeText('COMBO', 128, 104); g.fillStyle = '#ffe14a'; g.fillText('COMBO', 128, 104);
      l.ctex.needsUpdate = true; comboDraw[p] = combo[p];
    }
    function setJudge(p, kind) { const l = lanes[p]; l.judge.material.map = l.jt[kind]; l.judge.material.opacity = 1; judgeT[p] = 0; }
    function multOf(p) { return 1 + Math.min(1, Math.floor(combo[p] / 10) * 0.2) ; }
    function addScore(p, base, gold) {
      const pts = Math.round(base * multOf(p) * (gold ? 2 : 1)); score[p] += pts; return pts;
    }
    function gain(p, v) { const f = behind(p) ? 1.45 : 1; meter[p] = Math.min(100, meter[p] + v * f); if (meter[p] >= 100 && !lanes[p].mLabel.visible) { lanes[p].mLabel.visible = true; audio.sfx('powerup', { vol: 0.5 }); fx.texts.add('METER VOL!', lanes[p].x, 1.7, 0.8, '#ffe14a', 1.1); } }
    function noteSound(p, n, q) {
      const f = mtof(n.midi + 12);
      if (p === 0) { audio.tone(f, 0.3, { type: 'square', vol: 0.07, filter: 2400, send: 0.2 }); audio.tone(f, 0.25, { type: 'triangle', vol: 0.12 }); }
      else { audio.tone(f, 0.3, { type: 'sawtooth', vol: 0.05, filter: 2200, send: 0.2 }); audio.tone(f * 2, 0.2, { type: 'sine', vol: 0.07 }); audio.tone(f, 0.25, { type: 'triangle', vol: 0.12 }); }
      if (q === 'perfect') audio.tone(f * 3, 0.14, { type: 'sine', vol: 0.05, send: 0.3 });
    }
    function recX(p, d) { return lanes[p].x + (d - 1.5) * AW; }

    // ---------------- noten raken ----------------
    function hitNote(p, i, kind) {
      const n = NOTES[i], q = ns[p][i]; q.s = 1; const d = dirNow(p, i);
      const gold = q.gold; const base = kind === 'perfect' ? 100 : 55;
      combo[p]++; maxCombo[p] = Math.max(maxCombo[p], combo[p]); hits[p]++;
      if (kind === 'perfect') perfects[p]++; else goods[p]++;
      const pts = addScore(p, base, gold); if (gold) { golds[p]++; stats.golds[p]++; }
      gain(p, kind === 'perfect' ? 4 : 2.4);
      flashRec[p][d] = 1; setJudge(p, gold ? 'gold' : kind);
      noteSound(p, n, kind);
      const x = recX(p, d), col = gold ? 0xffd23f : DIR_COL[d];
      fx.particles.burst(x, REC_Y, 0.6, { count: kind === 'perfect' ? 16 : 8, speed: 4, up: 0.4, spread: 1.2, life: 0.5, size: 0.28, colors: [col, 0xffffff], gravity: 3 });
      if (kind === 'perfect') fx.particles.ring(x, REC_Y, 0.6, { count: 14, speed: 5, color: col, size: 0.25, life: 0.45 });
      if (gold) { fx.particles.burst(x, REC_Y, 0.8, { count: 22, speed: 5, up: 1, life: 0.9, size: 0.35, colors: [0xffd23f, 0xffffff], gravity: 2 }); audio.sfx('coin', { vol: 0.5 }); }
      // het poppetje danst de pas bij de pijl
      const D = dancers[p]; D.mv.d = d; D.mv.t = 0; D.mv.gold = gold; D.stumble = 0;
      if (combo[p] > 0 && combo[p] % 10 === 0) { D.spin = 0.001; fx.texts.add(`${combo[p]} COMBO!`, D.bx, 4.9, 1.8, '#ffe14a', 1.3); audio.sfx('ding', { vol: 0.6, rate: 1 + combo[p] / 80 }); S.crowdHype = Math.min(1.4, S.crowdHype + 0.3); }
      if (combo[p] % 5 === 0) drawCombo(p);
      void pts;
    }
    function missNote(p, i, wrong = false) {
      const q = ns[p][i]; q.s = 2; q.t0 = songT; misses[p]++; if (wrong) stats.wrong[p]++;
      if (shield[p].on > 0) { setJudge(p, 'block'); return; }       // het schild vergeeft missers
      combo[p] = 0; drawCombo(p); setJudge(p, 'miss'); dancers[p].stumble = 0.7; dancers[p].mv.d = -1;
      if (!wrong) audio.tone(130 + Math.random() * 30, 0.1, { type: 'square', vol: 0.05, filter: 500 });
      else { audio.sfx('miss', { vol: 0.35 }); }
    }
    function press(p, d) {
      const tp = songT - 0.0;   // tijdstip van de druk (de harness levert hem aan het begin van dit frame)
      const lenient = Math.min(0.06, lastDt * tempo * 0.6);
      let cand = -1, near = -1;
      for (let i = ptr[p]; i < NA; i++) {
        const q = ns[p][i]; if (q.s !== 0) continue;
        const dtn = NOTES[i].t - tp;
        if (dtn > W_WRONG + lenient) break;
        if (Math.abs(dtn) <= W_GOOD + lenient && dirNow(p, i) === d) { cand = i; break; }
        if (near < 0 && dtn >= -W_GOOD - lenient) near = i;
      }
      if (cand >= 0) { const e = Math.abs(NOTES[cand].t - tp); hitNote(p, cand, e <= W_PERF + lenient * 0.5 ? 'perfect' : 'good'); }
      else if (near >= 0 && Math.abs(NOTES[near].t - tp) <= W_WRONG) missNote(p, near, true);    // verkeerde pijl: telt als mis (tegen knop-gehamer)
    }
    function readDirs(p) {
      const inp = pv.input(p), out = [];
      if (tid === 'drunk') {            // dronken: de besturing is gedraaid (alleen de analoge as wiebelt), dus daar de richting uit afleiden
        const x = inp.x, y = inp.y, m = Math.hypot(x, y); let d = -1;
        if (m > 0.55) d = Math.abs(x) > Math.abs(y) ? (x < 0 ? 0 : 3) : (y < 0 ? 2 : 1);
        if (d !== aHold[p]) { aHold[p] = d; if (d >= 0) out.push(d); }
      } else { if (inp.leftP) out.push(0); if (inp.downP) out.push(1); if (inp.upP) out.push(2); if (inp.rightP) out.push(3); }
      return out;
    }

    // ---------------- sabotage en schild ----------------
    function fireSabotage(p) {
      if (meter[p] < 100) { audio.sfx('buzz', { vol: 0.35 }); return; }
      meter[p] = 0; lanes[p].mLabel.visible = false; sabSent[p]++; stats.sabs[p]++;
      if (!sabQueue[p].length) sabQueue[p] = shuffle(SABS.map((s) => s.id));
      const id = sabQueue[p].pop();
      launchOrb(p, 1 - p, id, false);
      audio.sfx('whoosh', { vol: 0.7 }); audio.sfx('shoot', { vol: 0.4 });
      react(p, 'point');
    }
    function launchOrb(from, to, id, reflected) {
      const S0 = SABS.find((s) => s.id === id);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: parseInt(S0.col.slice(1), 16), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spr.scale.set(1.9, 1.9, 1); scene.add(spr);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); core.scale.set(0.9, 0.9, 1); scene.add(core);
      orbs.push({ from, to, id, t: 0, reflected, spr, core, x0: lanes[from].x - (from ? -1 : 1) * 0.0, y0: reflected ? 4.5 : 0.7 });
      if (!reflected) fx.texts.add(S0.name, lanes[to].x, 8.7, 1, S0.col, 1.15);
    }
    function applySabotage(o) {
      const p = o.to, S0 = SABS.find((s) => s.id === o.id);
      if (shield[p].on > 0) {
        if (!o.reflected) {          // schild: terugkaatsen naar de afzender
          reflects[p]++; stats.reflects[p]++; shield[p].on = 0.35;
          setJudge(p, 'back'); audio.sfx('boing', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.5 }); ctx.shake(0.3);
          fx.particles.burst(lanes[p].x, REC_Y, 0.8, { count: 40, speed: 8, up: 0.6, spread: 1.4, life: 0.8, size: 0.4, colors: [0x6fe8ff, 0xffffff], gravity: 1 });
          fx.texts.add('TERUGGEKAATST!', lanes[p].x, 6.2, 1.2, '#6fe8ff', 1.4); gain(p, 20); react(p, 'cheer');
          launchOrb(p, 1 - p, o.id, true); return;
        }
        blocks[p]++; setJudge(p, 'block'); fx.texts.add('GEBLOKT!', lanes[p].x, 6.2, 1.2, '#6fe8ff', 1.3); audio.sfx('click', { vol: 0.6 }); return;
      }
      sab[p].id = o.id; sab[p].t = SAB_T; sab[p].from = o.from;
      audio.sfx('hurt', { vol: 0.6 }); audio.sfx('buzz', { vol: 0.4 }); ctx.shake(0.45);
      fx.particles.burst(lanes[p].x, REC_Y - 1, 0.8, { count: 36, speed: 7, up: 0.5, spread: 1.4, life: 0.8, size: 0.4, colors: [parseInt(S0.col.slice(1), 16), 0xffffff], gravity: 2 });
      hud.toast(`${names[o.from]} stuurt ${names[p]}: ${S0.name}`, 1700);
      react(p, 'scared');
      if (o.id === 'kip') { const ch = lanes[p].chick; ch.group.visible = true; ch.t0 = 0; ch.dir = Math.random() < 0.5 ? -1 : 1; }
    }
    function raiseShield(p) {
      const sh = shield[p];
      if (sh.cd > 0 || sh.on > 0) { audio.sfx('buzz', { vol: 0.25 }); return; }
      sh.on = SHIELD_T; sh.cd = SHIELD_CD; audio.sfx('select', { vol: 0.6 }); audio.sfx('whoosh', { vol: 0.3 });
      fx.particles.ring(lanes[p].x, REC_Y, 0.6, { count: 20, speed: 5, color: 0x6fe8ff, size: 0.28, life: 0.5 });
    }
    function react(p, what) { dancers[p].cheer = what === 'cheer' ? 1.2 : 0; if (what === 'scared') dancers[p].dizzy = 1.6; if (what === 'point') dancers[p].point = 0.8; }

    // ---------------- muziek ----------------
    function play(kind, a, b, when) {
      const A = audio, v = 1;
      switch (kind) {
        case 'hat': A.noise(0.04, { type: 'highpass', freq: 7500, vol: 0.025 * a, when }); break;
        case 'ohat': A.noise(0.1, { type: 'highpass', freq: 6500, vol: 0.04 * a, when }); break;
        case 'kick': A.tone(150, 0.2, { type: 'sine', vol: 0.4 * a, slide: 42, when }); break;
        case 'clap': A.noise(0.12, { type: 'bandpass', freq: 1700, q: 1.2, vol: 0.14 * a, when }); A.noise(0.05, { type: 'bandpass', freq: 2400, q: 1.5, vol: 0.1 * a, when: when + 0.012 }); break;
        case 'bass': A.tone(mtof(a), b, { type: 'sawtooth', vol: 0.12, filter: 520, attack: 0.008, when }); break;
        case 'stab': A.tone(mtof(a), b, { type: 'square', vol: 0.022, filter: 2200, when }); break;
        case 'pad': A.tone(mtof(a), b, { type: 'triangle', vol: 0.028, attack: 0.5, filter: 1100, when }); break;
        case 'arp': A.tone(mtof(a), 0.16, { type: 'triangle', vol: 0.04, when, send: 0.3 }); break;
        case 'lead': A.tone(mtof(a + 12), b, { type: 'square', vol: 0.025, filter: 1800, when, send: 0.2 }); break;
        case 'crash': A.noise(1.1, { type: 'highpass', freq: 3800, vol: 0.14 * a, when }); break;
        case 'riser': A.noise(a, { type: 'bandpass', freq: 400, freq2: 6000, q: 2, vol: 0.12, attack: a * 0.8, when }); break;
        default: break;
      }
      void v;
    }
    function schedule(upTo) {
      if (!audio.ctx) { while (evI < EVENTS.length && EVENTS[evI][0] < upTo) evI++; return; }
      const now = audio.ctx.currentTime;
      while (evI < EVENTS.length && EVENTS[evI][0] < upTo) { const e = EVENTS[evI++]; play(e[1], e[2], e[3], now + Math.max(0, (e[0] - songT) / tempo)); }
    }

    // ---------------- einde ----------------
    function winnerOf() {
      if (score[0] !== score[1]) return score[0] > score[1] ? 0 : 1;
      if (perfects[0] !== perfects[1]) return perfects[0] > perfects[1] ? 0 : 1;
      if (maxCombo[0] !== maxCombo[1]) return maxCombo[0] > maxCombo[1] ? 0 : 1;
      return Math.random() < 0.5 ? 0 : 1;
    }
    function endSong() {
      if (finished) return; finished = true;
      const w = winnerOf(); const tie = score[0] === score[1];
      hud.setTimer(null); hud.showBig(`${names[w]} wint!`, 1800, players[w].css);
      dancers[w].cheer = 99; dancers[1 - w].cheer = -99; S.crowdHype = 1.5; audio.sfx('win'); ctx.shake(0.5);
      for (let k = 0; k < 4; k++) setTimeout(() => fx.particles.burst(rand(-6, 6), 8, 1.5, { count: 40, speed: 8, up: 1, life: 1.4, size: 0.5, colors: [0xffe14a, 0xff4fa8, 0x4fd8ff, 0x8dff6a], gravity: 6 }), k * 300);
      const J = [`${names[w]} is de nieuwe Disco-Koning! ${names[1 - w]} had twee linkervoeten.`, `Het publiek draagt ${names[w]} op handen. ${names[1 - w]} struikelt nog door.`, `${names[w]} danst de sokken van de dino. ${names[1 - w]} danst de schoenen kapot.`, `Disco-Dino geeft ${names[w]} een gouden pijl. ${names[1 - w]} krijgt een pleister.`];
      const bits = [`${names[0]}: ${perfects[0]} perfect, beste combo ${maxCombo[0]}`, `${names[1]}: ${perfects[1]} perfect, beste combo ${maxCombo[1]}`];
      if (stats.sabs[0] + stats.sabs[1]) bits.push(`${stats.sabs[0] + stats.sabs[1]} sabotages`);
      if (stats.reflects[0] + stats.reflects[1]) bits.push(`${stats.reflects[0] + stats.reflects[1]}x teruggekaatst`);
      ctx.finishPvp({ winner: w, score: [score[0], score[1]], delay: 1400, summary: `${pick(J)}${tie ? ' (Gelijke stand: de meeste perfects besliste.)' : ''} ${bits.join(' · ')}.` });
    }

    // ---------------- hoofdlus ----------------
    let lastDt = 0.016;
    function update(dt) {
      lastDt = dt; T += dt;
      if (!started) { started = true; songT = 0; }
      if (!ending) {
        songT += dt * tempo;
        schedule(songT + 0.35);
        // invoer
        for (let p = 0; p < 2; p++) {
          const inp = pv.input(p);
          for (const d of readDirs(p)) press(p, d);
          if (inp.aP) fireSabotage(p);
          if (inp.bP) raiseShield(p);
        }
        // te laat voor een pijl = mis
        for (let p = 0; p < 2; p++) {
          for (let i = ptr[p]; i < NA; i++) { const q = ns[p][i]; if (q.s !== 0) continue; if (NOTES[i].t < songT - W_GOOD - 0.02) missNote(p, i); else break; }
          while (ptr[p] < NA && ns[p][ptr[p]].s !== 0) ptr[p]++;
        }
        if (songT > LAST_NOTE_T + 1.2 && ptr[0] >= NA && ptr[1] >= NA || songT > SONG_END - 0.2) { ending = true; endT = 0; endSong(); }
        timeLeft = Math.max(0, (SONG_END - songT) / tempo);
        hud.setTimer(timeLeft, 10);
      } else endT += dt;
      timers(dt);
      visuals(dt);
    }
    function timers(dt) {
      for (let p = 0; p < 2; p++) {
        const sb = sab[p]; if (sb.t > 0) { sb.t -= dt; if (sb.t <= 0) { sb.id = null; lanes[p].chick.group.visible = false; } }
        const sh = shield[p]; if (sh.on > 0) sh.on -= dt; if (sh.cd > 0) sh.cd -= dt; if (sh.cd < 0) sh.cd = 0;
        judgeT[p] += dt;
        // meter komt ook langzaam vanzelf bij (comeback)
        if (!ending && behind(p)) meter[p] = Math.min(100, meter[p] + dt * 0.8);
      }
      // bollen
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i]; o.t += dt; const u = Math.min(1, o.t / ORB_T);
        const tx = lanes[o.to].x, ty = 4.6; const fx0 = lanes[o.from].x, fy0 = o.y0;
        const x = lerp(fx0, tx, u * u * (3 - 2 * u)), y = lerp(fy0, ty, u) + Math.sin(u * Math.PI) * 3.2;
        o.spr.position.set(x, y, 1.4); o.core.position.set(x, y, 1.5); o.spr.scale.setScalar(1.7 + Math.sin(o.t * 30) * 0.3);
        if (Math.random() < dt * 40) fx.particles.emit(x, y, 1.4, rand(-0.7, 0.7), rand(-0.7, 0.7), 0, { life: 0.5, size: 0.3, color: o.spr.material.color.getHex(), gravity: 0 });
        if (u >= 1) { scene.remove(o.spr, o.core); o.spr.material.dispose(); o.core.material.dispose(); orbs.splice(i, 1); applySabotage(o); }
      }
    }

    // ---------------- beelden ----------------
    function pose(p, dt, bt, bi, bp) {
      const D = dancers[p], c = D.c, J = D.J, mv = D.mv, s = D.k;
      const tgt = { lx: 0, rx: 0, alx: -0.2, arx: -0.2, alz: 0.15, arz: -0.15, tz: 0, tx: 0, hz: 0, hy: 0, by: 0 };
      const beat = Math.sin(Math.PI * (bi + bp));              // wisselt per tel van teken
      const style = Math.floor(bi / 8) % 4, hop = Math.abs(Math.sin(Math.PI * bp));
      const air = GRAV < 1 ? 2.4 : 1;
      let spinK = 0;
      mv.t += dt; D.stumble = Math.max(0, D.stumble - dt);
      if (finished && D.cheer > 0) { c.pose = 'cheer'; c.update(dt); c.group.rotation.y = c.yaw; D.tag.visible = true; return place(D, dt, bt); }
      if (finished && D.cheer < 0) { c.pose = 'sad'; c.update(dt); return place(D, dt, bt); }
      c.pose = 'idle'; c.speed = 0; c.update(dt);
      // basis-groove per stijl
      tgt.by = hop * 0.1 * air; tgt.tz = beat * 0.1;
      tgt.lx = beat * 0.35; tgt.rx = -beat * 0.35;
      if (style === 0) { const a = bi % 2 ? 1 : -1; tgt.arx = -2.7 * (a > 0 ? 1 : 0.15) - 0.2; tgt.arz = -0.35; tgt.alx = -2.7 * (a > 0 ? 0.15 : 1) - 0.2; tgt.alz = 0.35; }
      else if (style === 1) { tgt.alx = -1.5 + beat * 0.3; tgt.arx = -1.5 - beat * 0.3; tgt.alz = 0.5; tgt.arz = -0.5; tgt.tx = 0.1; }
      else if (style === 2) { tgt.alx = beat * 1.0; tgt.arx = -beat * 1.0; tgt.alz = 0.3; tgt.arz = -0.3; tgt.hz = beat * 0.2; }
      else { tgt.alx = -1.0; tgt.arx = -1.0; tgt.alz = 1.1 + beat * 0.2; tgt.arz = -1.1 + beat * 0.2; tgt.tz = beat * 0.15; tgt.by = hop * 0.16 * air; }
      // pas bij de laatst geraakte pijl
      if (mv.d >= 0 && mv.t < 0.42) {
        const u = mv.t / 0.42, k = Math.sin(Math.PI * Math.min(1, u)), g = mv.gold ? 1.25 : 1;
        if (mv.d === 0) { tgt.tz = 0.5 * k; tgt.arx = 0.1; tgt.arz = -1.5 * k; tgt.alx = -1.3 * k; tgt.alz = -0.6 * k; tgt.rx = -0.7 * k; tgt.by = 0.04; }
        else if (mv.d === 3) { tgt.tz = -0.5 * k; tgt.alx = 0.1; tgt.alz = 1.5 * k; tgt.arx = -1.3 * k; tgt.arz = 0.6 * k; tgt.lx = -0.7 * k; tgt.by = 0.04; }
        else if (mv.d === 2) { tgt.alx = tgt.arx = -2.9; tgt.alz = 0.35; tgt.arz = -0.35; tgt.by = 0.55 * k * air * g; tgt.lx = tgt.rx = -0.5 * k; tgt.hz = 0; }
        else { tgt.by = -0.28 * k; tgt.lx = tgt.rx = -1.0 * k; tgt.tx = 0.5 * k; tgt.alx = tgt.arx = -0.9 * k; tgt.alz = 0.45; tgt.arz = -0.45; }
      }
      if (D.spin > 0) { D.spin += dt * 9; spinK = D.spin; if (D.spin > TAU) D.spin = 0; }
      if (D.stumble > 0) { const w = Math.sin(bt * 30) * 0.5; tgt.alx = 0.3; tgt.arx = 0.3; tgt.alz = 0.9 + w; tgt.arz = -0.9 + w; tgt.tx = 0.35; tgt.hz = w * 0.4; tgt.by = -0.05; }
      if (sab[p].t > 0) { tgt.hz = Math.sin(bt * 12) * 0.3; tgt.tz += Math.sin(bt * 9) * 0.12; }
      if (shield[p].on > 0) { tgt.alx = -1.25; tgt.arx = -1.25; tgt.alz = -1.0; tgt.arz = 1.0; tgt.by = 0; }
      if (D.cheer > 0 && !finished) { D.cheer -= dt; tgt.alx = tgt.arx = -2.9; tgt.alz = 0.4; tgt.arz = -0.4; tgt.by = Math.abs(Math.sin(bt * 12)) * 0.2; }
      if (D.dizzy > 0) D.dizzy -= dt;
      if (D.point > 0) { D.point -= dt; tgt.arx = -1.6; tgt.arz = -0.05; }
      const k = 22;
      for (const key in tgt) J[key] = damp(J[key], tgt[key], k, dt);
      c.legL.rotation.x = J.lx; c.legR.rotation.x = J.rx; c.armL.rotation.x = J.alx; c.armR.rotation.x = J.arx; c.armL.rotation.z = J.alz; c.armR.rotation.z = J.arz;
      c.torso.rotation.z = J.tz; c.torso.rotation.x = J.tx; c.head.rotation.z = J.hz; c.head.rotation.y = J.hy; c.body.position.y += J.by * s;
      c.group.rotation.y = c.yaw + spinK;
      place(D, dt, bt);
    }
    function place(D, dt, bt) {
      const slide = SLIP > 0.3 ? Math.sin(bt * 1.1 + D.bx) * 1.1 * SLIP : 0;
      D.slideX = damp(D.slideX, slide, 3, dt);
      D.holder.position.x = D.bx + D.slideX; D.pool.position.x = D.holder.position.x;
      D.holder.position.y = 0.3 + (GRAV < 1 ? 0.4 + Math.sin(bt * 2 + D.bx) * 0.35 : 0);
      D.tag.position.set(D.holder.position.x, 0.3 + D.c.height * D.k + 0.9, 1.6);
      D.pool.material.opacity = 0.3 + S.kick * 0.25;
    }
    const recCol = new THREE.Color();
    function visuals(dt) {
      const bt = tNow(), tn = bt / BEAT, bi = Math.floor(tn), bp = tn - bi;
      // sectie-wissel: toast voor de grote momenten
      const bar = Math.floor(bt / BAR); if (bar !== lastBar) { lastBar = bar; const sc = sectionAt(bar); if (started && !finished && sc.name !== sectionName) { sectionName = sc.name; if (sc.name === 'refrein') hud.toast('Refrein! Allebei vol gas!', 1200); else if (sc.name === 'finale' && bar === 30) hud.toast('FINALE! De pijlen worden razend snel!', 1500); else if (sc.name === 'break' ) hud.toast('Even op adem komen...', 1200); } }
      const energy = started ? (['refrein', 'finale', 'opbouw'].includes(sectionAt(bar).name) ? 1 : sectionAt(bar).name === 'break' ? 0.25 : 0.55) : 0.4;
      S.update(dt, T + introT, bp, bi, energy);
      // banen
      let idx = 0;
      for (let p = 0; p < 2; p++) {
        const l = lanes[p], sb = sab[p], act = sb.t > 0 ? sb.id : null;
        speedMul[p] = damp(speedMul[p], act === 'turbo' ? 1.75 : 1, 5, dt);
        l.panelM.map.offset.y = (-(bt / BEAT) * 0.5) % 1;
        l.panelM.color.setRGB(1, 1, 1); if (act) { const f = 0.7 + 0.3 * Math.sin(T * 12); l.panelM.color.setRGB(1, f, f); }
        l.band.material.opacity = 0.07 + S.kick * 0.1;
        // pijlen
        if (started) for (let i = vptr[p]; i < NA; i++) {
          const n = NOTES[i], q = ns[p][i], dtn = n.t - songT;
          if (dtn > LOOK * 1.08) break;
          if (!q.init) { q.init = true; q.flip = act === 'spiegel'; const lastSecs = timeLeft < 15; q.gold = behind(p) && Math.random() < (lastSecs ? 0.6 : 0.3); }
          if (q.s === 1) { if (i === vptr[p]) vptr[p]++; continue; }
          const y = REC_Y - dtn * SPEED * speedMul[p];
          if (q.s === 2 && dtn < -0.7) { if (i === vptr[p]) vptr[p]++; continue; }
          if (y < SPAWN_Y - 0.1 || idx >= ARR_N) continue;
          if (act === 'knipper' && q.s === 0 && ((Math.floor(songT * 3.4 + i * 0.7) % 3) === 0) && dtn > 0.12) continue;   // knipper: soms onzichtbaar
          // spiegel: draait vlak voor de treffer om
          let rot = DIR_ROT[n.d], d = n.d;
          if (q.flip) { const k = smoothstep(FLIP_AT, FLIP_AT - 0.3, dtn); rot = lerp(DIR_ROT[n.d], DIR_ROT[n.d] + Math.PI * (n.d % 3 === 0 ? 1 : 1), k); d = k > 0.5 ? 3 - n.d : n.d; }
          const grow = smoothstep(SPAWN_Y, SPAWN_Y + 0.9, y);
          const x = l.x + (n.d - 1.5) * AW + (SLIP > 0.3 ? Math.sin(y * 1.6 + T * 2) * 0.12 * SLIP : 0) + (GRAV < 1 ? Math.sin(T * 2 + i) * 0.05 : 0);
          const missed = q.s === 2;
          let col = missed ? 0x6a6478 : DIR_COL[q.flip ? d : n.d]; if (q.gold && !missed) col = Math.floor(T * 10) % 2 ? 0xffd23f : 0xfff2a8;
          const sc = (0.55 + 0.45 * grow) * (missed ? 0.9 : 1);
          put(arrows, idx, x, y, 0.02, rot, sc, col); put(borders, idx, x, y, -0.02, rot, sc, missed ? 0x2a2438 : q.gold ? 0xffffff : q.flip ? 0xd98aff : 0x120824);
          idx++;
        }
        // ontvangers
        for (let d = 0; d < 4; d++) {
          const f = flashRec[p][d] = Math.max(0, flashRec[p][d] - dt * 4.5);
          const pulse = Math.max(0, 1 - bp * 3) * 0.12;
          const x = recX(p, d); const sc = 0.95 * (1 + f * 0.3 + pulse);
          const ri = p * 4 + d; recCol.setHex(0x3c3258).lerp(_c.setHex(DIR_COL[d]), 0.15 + pulse * 2).lerp(_c.setHex(0xffffff), f);
          put(recs, ri, x, REC_Y, -0.06, DIR_ROT[d], sc, recCol.getHex());
        }
        // meter
        const m = clamp(meter[p] / 100, 0, 1); l.mFill.scale.x = Math.max(0.001, m * 4 * AW);
        l.mFill.material.color.setHex(m >= 1 ? (Math.floor(T * 8) % 2 ? 0xffe14a : 0xffffff) : 0x4fd8ff).lerp(_c.setHex(0xff4fa8), m >= 1 ? 0 : m * 0.8);
        l.mLabel.scale.setScalar(1 + (m >= 1 ? Math.sin(T * 10) * 0.08 : 0)); l.mLabel.scale.set(2.8, 0.8, 1);
        // schild
        const sh = shield[p]; l.dome.material.opacity = sh.on > 0 ? 0.35 + Math.sin(T * 30) * 0.12 : 0;
        l.sh.material.color.setHex(sh.on > 0 ? 0xffffff : sh.cd > 0 ? 0x5a5a78 : 0x6fe8ff); l.cd.scale.x = sh.cd > 0 ? Math.max(0.001, 0.85 * (1 - sh.cd / SHIELD_CD)) : 0.85; l.cd.material.color.setHex(sh.cd > 0 ? 0x8888aa : 0x6fe8ff);
        // oordeel
        const jt = judgeT[p]; l.judge.material.opacity = jt < 0.7 ? Math.min(1, 1.6 - jt * 1.6) : 0; l.judge.position.y = REC_Y - 1.7 + Math.min(jt, 0.4) * 0.8; l.judge.scale.set(2.8 * (1 + Math.max(0, 0.3 - jt) * 1.5), 0.8 * (1 + Math.max(0, 0.3 - jt) * 1.5), 1);
        if (combo[p] !== comboDraw[p] && (combo[p] < 5 || combo[p] === 0)) drawCombo(p);
        // de kip
        const ch = l.chick;
        if (ch.group.visible && sb.t > 0) {
          const u = (SAB_T - sb.t); ch.t0 = u; const x = l.x + Math.sin(u * 1.9 + (ch.dir > 0 ? 0 : 2)) * 1.7, y = 4.2 + Math.sin(u * 1.3) * 1.6 + Math.sin(u * 7) * 0.12;
          ch.group.position.set(x, y, 1.0); ch.speed = 1; ch.group.rotation.y = Math.cos(u * 1.9) > 0 ? 1.2 : -1.2; ch.group.rotation.z = Math.sin(u * 16) * 0.25; ch.update(dt);
          if (Math.random() < dt * 8) fx.particles.emit(x, y, 1.2, rand(-1, 1), rand(0, 1), 0.3, { life: 0.8, size: 0.22, color: 0xffffff, gravity: 2 });
        } else ch.group.visible = false;
      }
      arrows.count = borders.count = idx; arrows.instanceMatrix.needsUpdate = borders.instanceMatrix.needsUpdate = true; if (arrows.instanceColor) { arrows.instanceColor.needsUpdate = borders.instanceColor.needsUpdate = true; }
      recs.instanceMatrix.needsUpdate = true; recs.instanceColor.needsUpdate = true;
      // dansers
      for (let p = 0; p < 2; p++) pose(p, dt, T + introT, bi, bp);
      refreshInfo();
      placeCamera();
    }

    // ---------------- camera ----------------
    const camTgt = new THREE.Vector3(0, 4.3, 0), camBase = new THREE.Vector3(), camTmp = new THREE.Vector3();
    const fitPts = [[-LANE_X[1] - 2.5, 0.0, 1.5], [LANE_X[1] + 2.5, 0.0, 1.5], [-LANE_X[1] - 2.5, 8.7, 0], [LANE_X[1] + 2.5, 8.7, 0]];
    function fitCamera() {
      const dir = new THREE.Vector3(0, 0.1, 1).normalize(), v = new THREE.Vector3(); let lo = 8, hi = 80;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2; camera.position.copy(camTgt).addScaledVector(dir, d); camera.lookAt(camTgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        let ok = true; for (const q of fitPts) { v.set(q[0], q[1], q[2]).project(camera); if (Math.abs(v.x) > 0.98 || v.y > 0.66 || v.y < -0.92) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      camBase.copy(camTgt).addScaledVector(dir, hi);
    }
    function placeCamera() {
      const sw = Math.sin(T * 0.4 + introT) * 0.35; camTmp.copy(camBase); camTmp.x += sw; camTmp.z -= S.kick * 0.1;
      camera.position.copy(camTmp); camera.lookAt(camTgt);
    }
    fitCamera();

    function resultUpdate(dt) { T += dt; endT += dt; timers(dt); visuals(dt); }
    function introUpdate(dt) { introT += dt; visuals(dt); }
    refreshInfo(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onStart() { try { audio.stopMusic(); } catch (e) { /* geen audio */ } started = true; songT = 0; },
      onResize() { camera.updateProjectionMatrix(); fitCamera(); },
      onSwap(sw) { for (let p = 0; p < 2; p++) fx.particles.burst(dancers[p].holder.position.x, 3, 1.5, { count: 24, speed: 4, up: 1, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff], gravity: 2 }); hud.toast(sw ? '🔄 Wissel! Wes bestuurt de baan van Jor en andersom' : '🔄 Terug naar je eigen baan!', 2200); },
      onDeurman(movers) {
        movers.forEach((m, p) => { if (!m) return; combo[p] = 0; drawCombo(p); score[p] = Math.max(0, score[p] - 400); meter[p] = Math.max(0, meter[p] - 30); dancers[p].stumble = 1.2; fx.texts.add('DEURMAN! -400', dancers[p].bx, 5.6, 1.8, '#ff6a4a', 1.3); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); });
      },
      celebrate(w) { dancers[w].cheer = 99; dancers[1 - w].cheer = -99; S.crowdHype = 1.5; },
      dispose() { for (const o of orbs) { o.spr.material.dispose(); o.core.material.dispose(); } },
      dbg: {
        state: () => ({ songT, T, started, finished, ending, score: [...score], combo: [...combo], maxCombo: [...maxCombo], meter: meter.map((m) => +m.toFixed(1)), perfects: [...perfects], goods: [...goods], misses: [...misses], golds: [...golds], hits: [...hits], ptr: [...ptr], sab: sab.map((s) => ({ ...s })), shield: shield.map((s) => ({ ...s })), orbs: orbs.length, stats: { ...stats }, behind: [behind(0), behind(1)], timeLeft, tempo, NA, sabSent: [...sabSent], reflects: [...reflects], blocks: [...blocks] }),
        // volgende onbeslisten pijl van speler p: { t, d (huidige richting), i }
        next(p) { for (let i = ptr[p]; i < NA; i++) if (ns[p][i].s === 0) return { i, t: NOTES[i].t, d: dirNow(p, i), flip: ns[p][i].flip, gold: ns[p][i].gold }; return null; },
        setMeter(p, v) { meter[p] = v; }, setScore(a, b) { score[0] = a; score[1] = b; }, jumpTo(t) { songT = t; evI = EVENTS.findIndex((e) => e[0] >= t); if (evI < 0) evI = EVENTS.length; for (let p = 0; p < 2; p++) for (let i = 0; i < NA; i++) if (NOTES[i].t < t - 0.3 && ns[p][i].s === 0) { ns[p][i].s = 2; } },
        orbsInfo: () => orbs.map((o) => ({ from: o.from, to: o.to, id: o.id, t: o.t, reflected: o.reflected })),
        notes: NOTES,
      },
    };
  },
};

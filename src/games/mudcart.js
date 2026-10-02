import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, smoothstep, TAU, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeBrother, makeNPC, PLAYER_COLORS } from '../engine/chars.js';
import { KEY_LABELS } from '../engine/input.js';
import * as P from '../engine/props.js';
import { buildWorld, roadY, roadSlope, LOG_X, S3A, S3B, GATE_X, barkTexture, ringsTexture } from './mudcart_world.js';

// Karretje uit de Modder — synchroon duwen in drie fasen: modder (samen op de maat), boomstam (hefboom + duwen,
// rollen wisselen) en een glibberhelling (om de beurt tikken).

const DURATION = 58;
const P1_END = 30;                              // einde modderstuk
const XS = [31.15, 32.72, 34.28, 35.85];        // grenzen van de 3 segmenten onder de boomstam
const P3_START = S3A;                           // begin helling
const FINISH_X = 73.5;
const BEAT1 = 0.64;                             // fase 1: tijd tussen maten
const BEAT2 = 0.56;                             // fase 2: duwer
const SLOT3 = 0.46;                             // fase 3: om de beurt
const WIN = 0.24;                               // tikvenster rond een noot
const SEG_NEED = 5;
const K1 = 3.3, K3 = 1.85;                      // duw-impuls fase 1 / 3
const LOOK = 1.95, SPEED = 250;
const PENTA = [0, 2, 4, 7, 9, 12];

export default {
  id: 'mudcart',
  name: 'Karretje uit de Modder',
  giver: 'Karrenman Koen',
  icon: '🛒',
  mode: 'coop',
  time: 55,
  pay: 1.1,
  music: 'game',
  blurb: 'Koens karretje met melkkannen en appels zit muurvast in de modder! Duw <b>precies tegelijk</b> op de maat. Daarna ligt er een <b>boomstam</b>: één broer heft hem met de hefboom, de ander duwt — en jullie wisselen om en om. Op de <b>glibberhelling</b> tikken jullie juist <b>om de beurt</b>, anders glijdt het karretje terug!',
  controls: ['{a} tikken op de maat (samen!)', '{b} vasthouden: hefboom bij de boomstam'],
  tip: 'Rammelen zonder ritme helpt niet: kijk naar de ringen en tik als de bolletjes erin vallen.',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    const sunRig = ctx.lights('day', { shadow: 22, center: [0, 0, 0] });
    scene.fog = new THREE.Fog(0xcfe3f2, 55, 150);
    camera.fov = 46; camera.updateProjectionMatrix();

    const wrng = mulberry32(1234);
    const world = buildWorld(ctx, wrng);

    // ---------------- karretje ----------------
    const cart = new THREE.Group(); scene.add(cart);
    const cartBody = new THREE.Group(); cart.add(cartBody);
    const wood = new THREE.MeshStandardMaterial({ map: tex.planks(2, 1, '#a9774a'), roughness: 0.9 });
    const darkWood = mat(0x6b4a2e);
    cartBody.add(mesh(new THREE.BoxGeometry(3.3, 0.22, 2.0), wood, { pos: [0, 1.15, 0] }));
    for (const sz of [-1, 1]) cartBody.add(mesh(new THREE.BoxGeometry(3.3, 0.62, 0.12), wood, { pos: [0, 1.57, sz * 0.94] }));
    for (const sx of [-1, 1]) cartBody.add(mesh(new THREE.BoxGeometry(0.12, 0.62, 2.0), wood, { pos: [sx * 1.6, 1.57, 0] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cartBody.add(mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), darkWood, { pos: [sx * 1.6, 1.6, sz * 0.95] }));
    for (const sz of [-1, 1]) cartBody.add(mesh(new THREE.BoxGeometry(3.4, 0.1, 0.1), darkWood, { pos: [0, 1.98, sz * 0.95] }));
    const plaque = mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshStandardMaterial({ map: tex.sign('Koens Melk', { w: 256, h: 76, size: 34, bg: '#c43d2e', fg: '#fff3d0' }), roughness: 0.8 }), { cast: false, pos: [0.2, 1.55, 1.011] });
    cartBody.add(plaque);
    const plaque2 = plaque.clone(); plaque2.position.z = -1.011; plaque2.rotation.y = Math.PI; cartBody.add(plaque2);
    // as + wielen
    cartBody.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.7, 6), darkWood, { pos: [-0.1, 0.85, 0], rot: [Math.PI / 2, 0, 0] }));
    const wheels = [];
    for (const sz of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(-0.1, 0.85, sz * 1.25);
      w.add(mesh(new THREE.TorusGeometry(0.82, 0.1, 6, 18), mat(0x7a5230), { cast: true }));
      w.add(mesh(new THREE.TorusGeometry(0.9, 0.04, 5, 18), mat(0x4a4a52, { metalness: 0.5 }), { cast: false }));
      w.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 8), mat(0x4a3220), { rot: [Math.PI / 2, 0, 0] }));
      for (let k = 0; k < 3; k++) w.add(mesh(new THREE.BoxGeometry(1.66, 0.1, 0.1), mat(0x8a5a30), { rot: [0, 0, k * Math.PI / 3] }));
      cartBody.add(w); wheels.push(w);
    }
    // duwbalk achter
    for (const sz of [-1, 1]) cartBody.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.6, 6), darkWood, { pos: [-2.35, 1.25, sz * 0.8], rot: [0, 0, Math.PI / 2 + 0.06] }));
    cartBody.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 6), mat(0x8a5a2b), { pos: [-3.1, 1.2, 0], rot: [Math.PI / 2, 0, 0] }));
    // lading: melkkannen, appelmand, zak
    const cans = [];
    const steel = mat(0xc9ced6, { metalness: 0.7, roughness: 0.3 });
    [[-1.0, -0.42], [-1.0, 0.42], [-0.25, -0.42], [-0.25, 0.42]].forEach(([cx, cz], i) => {
      const c = new THREE.Group(); c.position.set(cx, 1.26, cz);
      c.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.85, 12), steel, { pos: [0, 0.42, 0] }));
      c.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 12), mat(0xc43d2e), { pos: [0, 0.5, 0] }));
      c.add(mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.2, 12), steel, { pos: [0, 0.95, 0] }));
      c.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), steel, { pos: [0, 1.1, 0] }));
      cartBody.add(c); cans.push(c);
    });
    const basket = new THREE.Group(); basket.position.set(0.95, 1.26, 0); cartBody.add(basket);
    basket.add(mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.5, 12, 1, true), mat(0xc89a52, { side: THREE.DoubleSide }), { pos: [0, 0.25, 0] }));
    basket.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 5, 16), mat(0x9b7348), { pos: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0] }));
    const apples = [];
    for (let i = 0; i < 9; i++) { const a = i < 6 ? i / 6 * TAU : (i - 6) / 3 * TAU + 0.5; const r = i < 6 ? 0.34 : 0.12; const ap = P.apple(i % 4 === 3 ? 0xe8c43a : 0xd83a2a); ap.scale.setScalar(1.05); ap.position.set(Math.cos(a) * r, 0.3 + (i < 6 ? 0 : 0.2), Math.sin(a) * r); ap.userData.by = ap.position.y; basket.add(ap); apples.push(ap); }
    const sk = P.sack(1.1, 0xd8c08a); sk.position.set(0.1, 1.26, 0.0); sk.scale.set(0.8, 0.8, 0.8); cartBody.add(sk);
    scene.userData.cart = cart;

    // ---------------- boomstam + hefboom ----------------
    const logG = new THREE.Group(); logG.position.set(LOG_X, 0.55, -5.2); scene.add(logG);
    const barkM = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1, flatShading: true });
    const capM = new THREE.MeshStandardMaterial({ map: ringsTexture(), roughness: 0.9 });
    const logMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.74, 10.4, 12), [barkM, capM, capM]); logMesh.rotation.x = Math.PI / 2; logMesh.position.set(0, 0, 5.2); logMesh.castShadow = true; logMesh.receiveShadow = true; logG.add(logMesh);
    for (const [lz, ang] of [[3, 0.6], [6.5, 2.4], [8.2, 4]]) { const m = mesh(new THREE.SphereGeometry(0.28, 7, 5), mat(0x4f9a3a), { cast: false, pos: [Math.cos(ang) * 0.6, Math.sin(ang) * 0.6, lz], scale: [1.4, 0.5, 1.6] }); m.lookAt(0, 0, lz); logG.add(m); }
    const lm = P.mushroom(0.7, 0xe03a3a); lm.position.set(0.2, 0.6, 7.6); logG.add(lm);
    const branch = mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.4, 6), darkWood, { pos: [0.5, 0.7, 2.6], rot: [0.3, 0, -0.9] }); logG.add(branch);
    // hefboom (wip): speler duwt het uiteinde omlaag, de punt tilt de stam bij het scharnier op
    const F = new THREE.Vector3(LOG_X - 3.6, 0.9, -3.7);
    scene.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.9), darkWood, { pos: [F.x, 0.45, F.z] }));
    for (const sz of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.4, 1.3, 0.14), darkWood, { pos: [F.x, 0.65, F.z + sz * 0.3] }));
    for (const [rx, rz, rs] of [[F.x - 0.9, F.z + 0.9, 0.8], [F.x + 0.9, F.z - 0.8, 0.7], [F.x + 0.6, F.z + 1.0, 0.5]]) { const r = P.rock(rs); r.position.set(rx, 0, rz); scene.add(r); }
    const pole = new THREE.Group(); pole.position.copy(F); scene.add(pole);
    pole.add(mesh(new THREE.CylinderGeometry(0.13, 0.17, 8.0, 8), mat(0x8a5a2b), { pos: [0.4, 0, 0], rot: [0, 0, Math.PI / 2] }));
    pole.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), mat(0x6b4a2e), { pos: [-4.4, 0, 0], rot: [Math.PI / 2, 0, 0] }));
    pole.add(mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), mat(0x555560, { metalness: 0.5 }), { pos: [3.6, 0.05, 0] }));
    const hilite = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    hilite.rotation.x = -Math.PI / 2; scene.add(hilite);
    const LEVER_POS = new THREE.Vector3(F.x - 4.4 - 0.62, 0, F.z);

    // ---------------- spelers ----------------
    const pl = players.map((p, i) => {
      const c = makeBrother(i); scene.add(c.group); c.pose = 'push';
      const ring = mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.85 }), { cast: false, rot: [Math.PI / 2, 0, 0] });
      scene.add(ring);
      return { c, ring, px: 0, pz: 0, lunge: 0, ox: 0, tapFlash: 0, taps: 0, hits: 0 };
    });
    const SIDE = [-1, 1];   // Daan achter-links (ver), Sem achter-rechts (dichtbij)
    const pushSpot = (i) => ({ x: x - 3.1 - (i ? 0.45 : 0.95), z: SIDE[i] * 1.0 });

    // ---------------- toestand ----------------
    let T = 0, timeLeft = DURATION, done = false, started = false;
    let phase = 1, sub = 'play';
    let x = 0, v = 0, wheelRot = 0, sink = 0.2, wob = 0;
    let combo = 0, bestCombo = 0, sync = 0.35, perfects = 0, hitsTotal = 0, missesTotal = 0, slips = 0, bonks = 0;
    const notes = []; let nextNoteT = 1.2, lastP = 1;
    let seg = 0, segHits = 0, leverP = 0, pusher = 1, swapT = 0, lift = 0, liftTarget = 0, xTarget = XS[0], bonked = false, leadT = 0, bonkCd = 0;
    let camX = -2, camY = 0, finishT = 0, tickedUntil = 0, txtCd = 0, hintCd = 0;
    const phaseTimes = {};
    let cheerT = 0;

    // ---------------- hulp: geluid ----------------
    const note = (i, vol = 0.22, len = 0.14) => audio.tone(262 * Math.pow(2, PENTA[Math.min(i, PENTA.length * 3 - 1) % PENTA.length] / 12) * (1 + Math.floor(i / PENTA.length) * 0.5), len, { type: 'triangle', vol, send: 0.15 });
    const squelch = (vol = 0.22) => audio.noise(0.2, { type: 'lowpass', freq: 900, freq2: 180, vol, attack: 0.01 });

    function mud(px, pz, n = 8, strong = 1) {
      const y = roadY(px) + 0.2;
      fx.particles.burst(px, y, pz, { count: n, speed: 2.6 * strong, up: 1.3, spread: 0.8, life: 0.7, size: 0.32, colors: phase === 3 ? [0xb8894e, 0x8a5e35, 0xd6b078] : [0x5c3b1e, 0x7a5230, 0x3d2812], gravity: 14 });
    }
    function say(txt, px, py, pz, col, sc = 1) { fx.texts.add(txt, px, py, pz, col, sc); }

    // ---------------- UI-canvas ----------------
    const cv = document.createElement('canvas'); cv.width = 860; cv.height = 178;
    cv.style.cssText = 'position:absolute;left:50%;bottom:10px;transform:translateX(-50%);width:min(860px,96vw);pointer-events:none;';
    const g2 = cv.getContext('2d');
    const mount = () => { const r = document.getElementById('hud'); if (r && !cv.isConnected) r.appendChild(cv); };
    const lanesY = [66, 114];
    const HITX = 170;
    const keyTxt = (i) => (i ? 'Enter' : 'F');
    const noteTxt = (i) => (i ? '⏎' : 'F');
    const keyTxtB = (i) => (i ? 'Shift' : 'G');
    function rr(g, x0, y0, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, r) : g.rect(x0, y0, w, h); }
    function drawNote(g, px, py, col, label, alpha = 1, r = 16, bad = false) {
      g.globalAlpha = alpha;
      g.fillStyle = bad ? '#7b7584' : col; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 14px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, px, py + 1);
      g.globalAlpha = 1;
    }
    function drawUI() {
      mount();
      cv.style.display = phase === 4 ? 'none' : 'block';
      const g = g2, W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(22,14,34,0.8)'; rr(g, 3, 3, W - 6, H - 6, 18); g.fill();
      g.strokeStyle = '#f2c14e'; g.lineWidth = 3; g.stroke();
      // kop
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const titles = { 1: '1 · MODDER', 2: '2 · BOOMSTAM', 3: '3 · GLIBBERHELLING', 4: 'DORP BEREIKT!' };
      g.fillStyle = '#f2c14e'; g.font = 'bold 19px MedievalSharp, serif'; g.fillText(titles[phase], 20, 26);
      let instr = '';
      if (phase === 1) instr = 'Tik allebei TEGELIJK als de bolletjes in de ring vallen!';
      else if (phase === 2) {
        if (sub === 'seg') instr = `${names[leverP]} houdt ${keyTxtB(leverP)} vast (hefboom) · ${names[pusher]} tikt ${keyTxt(pusher)} op de maat`;
        else if (sub === 'swap') instr = `WISSEL! ${names[leverP]} pakt de hefboom (${keyTxtB(leverP)}) · ${names[pusher]} duwt`;
        else if (sub === 'approach') instr = 'Rol naar de boomstam... pak de hefboom!';
        else instr = 'Door! Weg van die stam!';
      } else if (phase === 3) instr = sub === 'lead' ? 'Straks: om de beurt tikken. Eerst Daan, dan Sem...' : 'Om de beurt tikken! Mis je een beurt, dan glijdt het karretje terug.';
      else instr = 'Koen is dolblij!';
      g.fillStyle = '#fff'; g.font = '600 16px Fredoka, sans-serif'; g.fillText(instr, 235, 27, 610);
      // banen
      const pulse = (() => { let best = 9; for (const n of notes) if (!n.done) best = Math.min(best, Math.abs(n.t - T)); return Math.max(0, 1 - best / 0.18); })();
      for (let i = 0; i < 2; i++) {
        const ly = lanesY[i];
        g.fillStyle = 'rgba(255,255,255,0.07)'; rr(g, 96, ly - 21, 566, 42, 21); g.fill();
        g.fillStyle = players[i].css; g.font = 'bold 17px Fredoka, sans-serif'; g.textAlign = 'left'; g.fillText(names[i], 20, ly - 7);
        g.font = '600 12px Fredoka, sans-serif'; g.fillStyle = '#cfc6e6'; g.fillText(phase === 2 && sub !== 'approach' && leverP === i ? `[${keyTxtB(i)}] hefboom` : `[${keyTxt(i)}] tikken`, 20, ly + 11);
        // trefring
        const activeLane = !(phase === 2 && leverP === i && sub !== 'exit');
        g.strokeStyle = players[i].css; g.lineWidth = 3 + (activeLane ? pulse * 3 : 0);
        g.globalAlpha = activeLane ? 1 : 0.25;
        g.beginPath(); g.arc(HITX, ly, 20 + (activeLane ? pulse * 4 : 0), 0, TAU); g.stroke(); g.globalAlpha = 1;
        if (lock[i] > 0) { g.fillStyle = 'rgba(229,72,77,0.35)'; rr(g, 96, ly - 21, 566, 42, 21); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 16px Fredoka, sans-serif'; g.textAlign = 'center'; g.fillText('Rustig! Tik alleen op de maat', 380, ly + 1); g.textAlign = 'left'; }
        if (tapFlashUI[i] > 0) { g.fillStyle = `rgba(255,255,255,${tapFlashUI[i] * 0.5})`; g.beginPath(); g.arc(HITX, ly, 21, 0, TAU); g.fill(); }
      }
      // verbindingslijnen + noten
      for (const n of notes) {
        const age = T - n.t;
        if (n.done && T - n.doneT > 0.45) continue;
        const px = HITX + (n.t - T) * SPEED;
        if (px > 650 || px < 100) continue;
        const lanes = n.p === 2 ? [0, 1] : [n.p];
        if (n.p === 2 && !n.done) { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(px, lanesY[0]); g.lineTo(px, lanesY[1]); g.stroke(); }
        for (const l of lanes) {
          if (n.done) {
            const k = (T - n.doneT) / 0.45; const ok = n.tp[l] != null && n.q >= 1;
            if (ok) { g.strokeStyle = '#fff'; g.globalAlpha = 1 - k; g.lineWidth = 4; g.beginPath(); g.arc(HITX, lanesY[l], 20 + k * 26, 0, TAU); g.stroke(); g.globalAlpha = 1; }
            else drawNote(g, Math.max(100, px), lanesY[l] + k * 14, players[l].css, '✕', 1 - k, 14, true);
          } else drawNote(g, px, lanesY[l], players[l].css, n.blocked ? '' : noteTxt(l), age > 0 ? 0.85 : 1, 16, false);
        }
      }
      // hefboombalk
      if (phase === 2 && sub !== 'exit') {
        const ly = lanesY[leverP];
        g.fillStyle = 'rgba(12,8,22,0.92)'; rr(g, 98, ly - 19, 562, 38, 19); g.fill();
        const holding = input.p[leverP].b;
        g.fillStyle = holding ? '#58d86b' : '#ff9a3a'; rr(g, 102, ly - 15, Math.max(12, 554 * lift), 30, 15); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 17px Fredoka, sans-serif'; g.textAlign = 'center';
        g.fillText(lift > 0.9 ? `Stam is omhoog! Hou [${keyTxtB(leverP)}] vast!` : holding ? 'Hijsen...' : `HOU [${keyTxtB(leverP)}] INGEDRUKT!`, 380, ly + 1);
      }
      // samen-meter
      g.textAlign = 'left'; g.fillStyle = '#cfc6e6'; g.font = '600 13px Fredoka, sans-serif'; g.fillText(phase === 3 ? 'RITME-METER' : 'SAMEN-METER', 690, 52);
      g.fillStyle = 'rgba(255,255,255,0.1)'; rr(g, 690, 62, 150, 18, 9); g.fill();
      const gr = g.createLinearGradient(690, 0, 840, 0); gr.addColorStop(0, '#e5484d'); gr.addColorStop(0.5, '#f2c14e'); gr.addColorStop(1, '#58d86b');
      g.fillStyle = gr; rr(g, 690, 62, Math.max(10, 150 * sync), 18, 9); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; rr(g, 690, 62, 150, 18, 9); g.stroke();
      g.fillStyle = combo >= 5 ? '#ffb23a' : '#fff'; g.font = `bold ${combo >= 5 ? 30 : 26}px Fredoka, sans-serif`; g.textAlign = 'center';
      g.fillText(combo > 1 ? `x${combo}` : 'x0', 765, 108);
      g.font = '600 12px Fredoka, sans-serif'; g.fillStyle = '#cfc6e6'; g.fillText(combo > 1 ? 'COMBO' : 'geen combo', 765, 130);
      g.fillText(`beste: x${bestCombo}`, 765, 146);
      // route
      const rx0 = 24, rx1 = 836, ry = 160;
      g.fillStyle = 'rgba(255,255,255,0.15)'; rr(g, rx0, ry - 4, rx1 - rx0, 8, 4); g.fill();
      const prog = clamp(x / FINISH_X, 0, 1);
      g.fillStyle = '#f2c14e'; rr(g, rx0, ry - 4, (rx1 - rx0) * prog, 8, 4); g.fill();
      for (const [px, lab] of [[P1_END, 'boomstam'], [P3_START, 'helling'], [FINISH_X, 'dorp']]) { const sx = rx0 + (rx1 - rx0) * (px / FINISH_X); g.fillStyle = '#fff'; g.fillRect(sx - 1, ry - 7, 2, 14); g.font = '11px Fredoka, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#cfc6e6'; g.fillText(lab, sx - 18, ry - 12); }
      g.font = '18px sans-serif'; g.textAlign = 'center'; g.fillText('🛒', rx0 + (rx1 - rx0) * prog, ry - 14);
    }
    const tapFlashUI = [0, 0];

    // ---------------- noten ----------------
    function addNote(t, p) { notes.push({ t, p, tp: [null, null], d: [0, 0], done: false, doneT: 0, q: -1, ticked: false }); }
    function clearNotes() { for (const n of notes) { if (!n.done) { n.done = true; n.doneT = T - 1; n.q = 0; } } }

    function spawnNotes() {
      if (phase === 1) { while (nextNoteT < T + LOOK) { addNote(nextNoteT, 2); nextNoteT += BEAT1; } }
      else if (phase === 2 && sub === 'seg') {
        let pending = 0; for (const n of notes) if (!n.done) pending++;
        while (segHits + pending < SEG_NEED && nextNoteT < T + LOOK) { addNote(Math.max(nextNoteT, T + 0.9), pusher); nextNoteT = Math.max(nextNoteT, T + 0.9) + BEAT2; pending++; }
      } else if (phase === 3 && sub === 'play') { while (nextNoteT < T + LOOK) { lastP = 1 - lastP; addNote(nextNoteT, lastP); nextNoteT += SLOT3; } }
    }

    // ---------------- tikken ----------------
    function tapFeedback(i) {
      const p = pl[i]; p.lunge = 1; p.c.squash = 0.1; p.taps++; tapFlashUI[i] = 1;
    }
    const chaos = [0, 0], lock = [0, 0];
    function tap(i) {
      if (phase === 4) { tapFeedback(i); return; }
      if (lock[i] > 0) { pl[i].lunge = 0.2; audio.sfx('click', { vol: 0.25 }); return; }
      tapFeedback(i);
      if (phase === 2 && (sub !== 'seg' || i !== pusher)) { audio.sfx('click', { vol: 0.4 }); return; }
      if (phase === 3 && sub !== 'play') return;
      if (phase === 2 && sub === 'seg' && i === pusher) { /* ok */ }
      let best = null, bd = 9;
      for (const n of notes) {
        if (n.done || (n.p !== 2 && n.p !== i) || n.tp[i] != null) continue;
        const d = Math.abs(T - n.t);
        if (d <= WIN && d < bd) { best = n; bd = d; }
      }
      if (!best) return offBeat(i);
      best.tp[i] = T; best.d[i] = T - best.t;
      note(Math.max(0, combo), 0.2, 0.12);
      if (best.p === 2) { if (best.tp[1 - i] != null) resolve(best); else mud(pl[i].c.group.position.x + 0.4, pl[i].c.group.position.z, 3, 0.6); }
      else resolve(best);
    }
    function offBeat(i) {
      const p = pl[i];
      chaos[i] += 1;
      if (chaos[i] >= 2) {
        lock[i] = 1.0; chaos[i] = 0; combo = 0; sync = Math.max(0, sync - 0.1);
        say('Rustig! Tik op de maat', p.c.group.position.x, 3.2, p.c.group.position.z, '#ff7a7a', 1);
        audio.sfx('buzz', { vol: 0.4 }); p.c.pose = 'scared';
      }
      if (phase === 1) {
        combo = 0; sync = Math.max(0, sync - 0.05);
        audio.sfx('thud', { vol: 0.35 }); squelch(0.14);
        if (hintCd <= 0) { say('Op de maat!', p.c.group.position.x, 3.0, p.c.group.position.z, '#ff9a8a', 0.8); hintCd = 0.9; }
        mud(p.c.group.position.x + 0.8, p.c.group.position.z, 4, 0.6);
      } else if (phase === 2) {
        combo = 0; sync = Math.max(0, sync - 0.05); audio.sfx('thud', { vol: 0.3 });
        if (hintCd <= 0) { say('Op de maat!', p.c.group.position.x, 3.0, p.c.group.position.z, '#ff9a8a', 0.8); hintCd = 0.9; }
      } else if (phase === 3) {
        slips++; combo = 0; sync = Math.max(0, sync - 0.1); v -= 0.9; audio.sfx('miss', { vol: 0.5 });
        if (hintCd <= 0) { say('Verkeerde beurt!', p.c.group.position.x, 3.0, p.c.group.position.z, '#ff7a7a', 0.9); hintCd = 0.6; }
        mud(x - 1.2, 0.0, 6, 0.8);
      }
    }
    function resolve(n) {
      n.done = true; n.doneT = T;
      const cx = x - 1.8, cy = roadY(x) + 2.8;
      let q;
      if (phase === 1) {
        const a = n.tp[0] != null, b = n.tp[1] != null;
        if (a && b) { const dd = Math.abs(n.tp[0] - n.tp[1]); q = dd < 0.1 ? 3 : dd < 0.2 ? 2 : 1; } else q = (a || b) ? 0 : -1;
      } else {
        const i = n.p; if (n.tp[i] == null) q = -1;
        else if (phase === 2 && lift < 0.85) q = 0.5;
        else { const dd = Math.abs(n.d[i]); q = phase === 2 ? (dd < 0.08 ? 3 : dd < 0.15 ? 2 : 1) : (dd < 0.07 ? 3 : dd < 0.14 ? 2 : 1); }
      }
      n.q = q;
      if (q === 0.5) { n.blocked = true; say('De stam zit in de weg!', cx, cy, 0, '#ffb04a', 0.9); audio.sfx('wood'); combo = 0; return; }
      if (q >= 1) {
        combo++; bestCombo = Math.max(bestCombo, combo); hitsTotal++; if (q === 3) perfects++;
        sync = clamp(sync + [0, 0.04, 0.09, 0.16][q], 0, 1);
        const col = q === 3 ? '#ffe14a' : q === 2 ? '#8dff9a' : '#ffffff';
        const lab = phase === 1 ? (q === 3 ? 'SAMEN!' : q === 2 ? 'Goed!' : 'Net!') : (q === 3 ? 'PERFECT!' : q === 2 ? 'Goed!' : 'Ok');
        say(lab, cx, cy, n.p === 2 ? 0 : pl[n.p].c.group.position.z, col, q === 3 ? 1.2 : 0.95);
        if (q === 3) { audio.sfx('ding', { vol: 0.5, rate: 1 + Math.min(combo, 12) * 0.03 }); fx.particles.ring(x - 1.5, roadY(x) + 0.3, 0, { count: 16, speed: 4, color: 0xffe14a, size: 0.25, life: 0.5 }); }
        else audio.sfx('good', { vol: 0.35 });
        for (let k = 0; k < 2; k++) if (n.p === 2 || n.p === k) fx.particles.burst(pl[k].c.group.position.x, pl[k].c.group.position.y + 2.2, pl[k].c.group.position.z, { count: 6, speed: 2, up: 1.2, life: 0.6, size: 0.22, color: players[k].color, gravity: 4 });
        if (combo % 5 === 0 && combo > 0) { say(`COMBO x${combo}!`, x, cy + 1.2, 0, '#ff9a3a', 1.5); audio.sfx('powerup', { vol: 0.5 }); ctx.shake(0.3); }
        // beweging
        if (phase === 1) {
          const s = [0.3, 0.55, 0.8, 1.0][q] * (1 + Math.min(combo, 12) * 0.03) * (0.85 + 0.3 * sync);
          v += K1 * s; wob = 1; squelch(0.2); mud(x - 1.4, 1.2, 8, 1); mud(x - 1.4, -1.2, 8, 1);
          cans.forEach((c, k) => { c.userData.j = 1; }); apples.forEach((a) => { a.userData.j = 1; });
        } else if (phase === 2) {
          segHits++; xTarget = XS[seg] + (XS[seg + 1] - XS[seg]) * Math.min(1, segHits / SEG_NEED);
          wob = 0.7; audio.sfx('wood', { vol: 0.5 }); mud(x - 1.4, 1.0, 5, 0.8);
        } else {
          const s = [0.7, 0.75, 0.9, 1.0][q] * (1 + Math.min(combo, 12) * 0.015);
          v += K3 * s; wob = 0.8; mud(x - 1.4, 1.1, 6, 0.9);
        }
      } else {
        // solo of gemist
        combo = 0; sync = clamp(sync - (q === 0 ? 0.12 : 0.2), 0, 1); missesTotal++;
        if (phase === 1 && q === 0) {
          const miss = n.tp[0] == null ? 0 : 1;
          const mp = pl[miss].c.group.position;
          say('Mis!', mp.x, 3.0, mp.z, '#ff7a7a', 1);
          say('Samen!', cx, cy, 0, '#ffd2a0', 0.85);
          v += K1 * 0.3; squelch(0.12); audio.sfx('miss', { vol: 0.4 });
        } else {
          const who = n.p === 2 ? 0 : n.p; const mp = pl[who].c.group.position;
          say('Mis!', n.p === 2 ? cx : mp.x, n.p === 2 ? cy : 3.0, n.p === 2 ? 0 : mp.z, '#ff7a7a', 1);
          audio.sfx('miss', { vol: 0.45 });
          if (phase === 3) { slips++; v -= 0.5; mud(x - 1.2, 0, 5, 0.7); }
        }
      }
    }

    // ---------------- fases ----------------
    function startSegment() {
      sub = 'seg'; segHits = 0; leverP = seg % 2; pusher = 1 - leverP; nextNoteT = T + 1.2; clearNotes();
      xTarget = XS[seg];
      hud.toast(`${names[leverP]} heft de stam · ${names[pusher]} duwt!`, 2200);
    }
    function beginPhase2() {
      phase = 2; sub = 'approach'; clearNotes(); combo = 0; seg = 0; leverP = 0; pusher = 1;
      phaseTimes.p1 = DURATION - timeLeft;
      hud.showBig('BOOMSTAM!', 1100, '#ffb04a'); audio.sfx('wood');
      hud.toast(`${names[0]} pakt eerst de hefboom (${keyTxtB(0)} vasthouden)`, 2600);
    }
    function beginPhase3() {
      phase = 3; sub = 'lead'; leadT = 1.9; clearNotes(); combo = 0; nextNoteT = 0; lastP = 1;
      phaseTimes.p2 = DURATION - timeLeft;
      hud.showBig('GLIBBER!', 1100, '#8fd8ff'); audio.sfx('whoosh');
      hud.toast('Om de beurt tikken: Daan, Sem, Daan, Sem...', 2800);
    }
    function finishGame(win) {
      if (done) return; done = true; phase = win ? 4 : phase;
      const el = DURATION - timeLeft;
      clearNotes();
      if (win) {
        phaseTimes.p3 = el;
        const left = timeLeft;
        const stars = left >= 15 && bestCombo >= 8 ? 3 : left >= 5 ? 2 : 1;
        pl.forEach((p) => { p.c.pose = 'cheer'; });
        for (const n of world.crowd) n.pose = 'cheer';
        world.npcs.koen.pose = 'cheer'; world.npcs.koen.group.position.set(GATE_X - 9, roadY(GATE_X - 9), 7); world.npcs.koen.faceDir(1, -1);
        audio.sfx('bell'); ctx.shake(0.5);
        for (let k = 0; k < 6; k++) setTimeout(() => { try { fx.particles.burst(GATE_X - 2 + (Math.random() - 0.5) * 8, roadY(GATE_X) + 6 + Math.random() * 3, (Math.random() - 0.5) * 8, { count: 30, speed: 7, up: 1.2, life: 1.5, size: 0.4, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, k * 260);
        const secs = Math.round(el);
        const txt = stars === 3 ? 'Wat een teamwork! Koen huilt van geluk (en hij deelt appels uit).' : stars === 2 ? 'Mooi gedaan! Alleen de melkkannen zijn een beetje door elkaar geschud.' : 'Net op tijd! Koen zijn melk is een beetje boter geworden...';
        ctx.finish({ stars, score: Math.round(left * 10 + bestCombo * 5), delay: 2400, summary: `Het karretje is in <b>${secs}</b> seconden bij de dorpspoort! Beste combo: <b>x${bestCombo}</b>, ${perfects} perfecte duwen.<br>${txt}` });
      } else {
        pl.forEach((p) => { p.c.pose = 'sad'; });
        ctx.finish({ stars: 0, score: Math.round(x), delay: 1200, summary: `De zon gaat onder en het karretje staat nog bij ${Math.round(x / FINISH_X * 100)}% van de weg. Koen moet zijn melk zelf nog brengen... Oefen het ritme en probeer opnieuw!` });
      }
    }

    // ---------------- positionering ----------------
    function placePlayers(dt) {
      pl.forEach((p, i) => {
        let tx, tz, pose = 'push';
        if (phase === 2 && leverP === i && sub !== 'exit' && sub !== 'approach' || (phase === 2 && sub === 'approach' && i === 0)) { tx = LEVER_POS.x; tz = LEVER_POS.z; pose = lift > 0.2 ? 'push' : 'hands_up'; }
        else if (phase === 4) { tx = x + (i ? 1.7 : -0.5); tz = 3.3 - i * 0.2; pose = 'cheer'; }
        else { const s = pushSpot(i); tx = s.x; tz = s.z; }
        if (p.px === 0 && p.pz === 0) { p.px = tx; p.pz = tz; }
        const dx = tx - p.px, dz = tz - p.pz; const dist = Math.hypot(dx, dz);
        const sp = Math.min(dist, 9 * dt * (1 + dist * 0.25));
        if (dist > 0.01) { p.px += dx / dist * sp; p.pz += dz / dist * sp; }
        p.lunge = damp(p.lunge, 0, 9, dt);
        const walking = dist > 0.25;
        const g = p.c.group;
        const lungeX = (phase === 1 || phase === 3 || (phase === 2 && i === pusher)) ? p.lunge * 0.35 : 0;
        g.position.set(p.px + lungeX, roadY(p.px) + (phase === 2 && i === leverP && lift > 0.5 ? Math.sin(T * 30) * 0.015 : 0), p.pz);
        p.c.speed = walking ? Math.min(1, dist) : 0;
        if (walking && phase !== 4) p.c.faceDir(dx, dz); else if (phase === 4) p.c.faceDir(0.25, 1); else p.c.faceDir(1, 0);
        if (!done) p.c.pose = lock[i] > 0 ? 'scared' : walking ? 'idle' : pose; else if (phase === 4) p.c.pose = walking ? 'idle' : 'cheer';
        p.c.update(dt);
        p.ring.position.set(g.position.x, g.position.y + 0.07, g.position.z);
        p.ring.material.opacity = 0.5 + p.lunge * 0.4; p.ring.scale.setScalar(1 + p.lunge * 0.3);
      });
    }

    function updateCart(dt) {
      const y = roadY(x);
      const sl = roadSlope(x); const pitch = Math.atan(sl);
      const sinkT = phase === 1 ? 0.22 * (1 - smoothstep(24, P1_END, x)) : 0;
      sink = damp(sink, sinkT, 4, dt);
      wob = damp(wob, 0, 5, dt);
      cart.position.set(x, y - sink, 0);
      cart.rotation.z = pitch;
      cartBody.rotation.x = Math.sin(T * 24) * 0.03 * wob + (phase === 1 ? Math.sin(T * 1.7) * 0.012 : 0);
      cartBody.rotation.z = -Math.sin(T * 17) * 0.025 * wob;
      wheelRot += (x - (cart.userData.lastX ?? x)) / 0.85; cart.userData.lastX = x;
      wheels.forEach((w) => { w.rotation.z = -wheelRot; });
      cans.forEach((c, k) => { c.userData.j = damp(c.userData.j || 0, 0, 6, dt); c.rotation.z = Math.sin(T * 30 + k * 1.7) * 0.07 * c.userData.j; c.position.y = 1.26 + Math.abs(Math.sin(T * 22 + k)) * 0.07 * c.userData.j; });
      apples.forEach((a, k) => { a.userData.j = damp(a.userData.j || 0, 0, 5, dt); a.position.y = a.userData.by + Math.abs(Math.sin(T * 20 + k * 2.1)) * 0.28 * a.userData.j; });
    }

    function updateLog(dt) {
      const rate = liftTarget > lift ? 1.5 : 3.2;
      lift = clamp(lift + Math.sign(liftTarget - lift) * Math.min(Math.abs(liftTarget - lift), rate * dt), 0, 1);
      const ease = lift * lift * (3 - 2 * lift);
      const phi = ease * 0.5;
      logG.rotation.x = -phi;
      // hefboom: speler-uiteinde (links) omlaag, punt (rechts) omhoog
      const tipY = 0.25 + ease * 0.78;
      const beta = Math.asin(clamp((tipY - F.y) / 3.6, -1, 1));
      pole.rotation.z = beta;
      // gloeiende ring om hefboom-speler
      const holderActive = phase === 2 && (sub === 'seg' || sub === 'swap' || sub === 'approach');
      hilite.position.set(LEVER_POS.x, 0.1, LEVER_POS.z);
      hilite.material.opacity = holderActive ? (input.p[leverP].b ? 0.0 : 0.5 + Math.sin(T * 8) * 0.4) : 0;
    }

    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), wantP = new THREE.Vector3(), wantL = new THREE.Vector3();
    let camInit = false;
    function updateCamera(dt, introT) {
      let lead = 2.0, h = 5.2, dist = 13.8, ly = 1.3, yaw = 4.5, k = 30;
      if (phase === 2) { lead = LOG_X - 1.5 - x; h = 6.2; dist = 16.5; yaw = 4.0; }
      if (phase === 3) { lead = 1.4; h = 4.4; dist = 13.0; ly = 0.5; yaw = 4.5; }
      camX = damp(camX, x + lead, phase === 2 ? 2.4 : 3.2, dt);
      camY = damp(camY, roadY(camX), 3, dt);
      const sway = introT ? Math.sin(introT * 0.5) * 1.2 : 0;
      wantP.set(camX - yaw + sway, camY + h, dist);
      wantL.set(camX + 1.2, camY + ly, 0);
      if (phase === 4) {
        const y8 = roadY(GATE_X);
        wantP.set(GATE_X - 15, y8 + 6.0, 17); wantL.set(GATE_X - 2.0, y8 + 3.4, 0); k = 2.0;
      }
      if (!camInit) { camP.copy(wantP); camL.copy(wantL); camInit = true; }
      const f = 1 - Math.exp(-k * dt);
      camP.lerp(wantP, f); camL.lerp(wantL, f);
      camera.position.copy(camP); camera.lookAt(camL);
      if (sunRig && sunRig.sun) { const s = sunRig.sun; s.target.position.set(camP.x + 3, camY, 0); s.position.set(camP.x + 25, camY + 42, 18); s.target.updateMatrixWorld(); }
    }

    // ---------------- init ----------------
    x = 0; cart.userData.lastX = 0;
    pl.forEach((p, i) => { const s = pushSpot(i); p.px = s.x; p.pz = s.z; });
    camX = x + 3.8;
    updateCart(0.016); updateLog(0.016); placePlayers(0.016); updateCamera(1, 0);
    hud.setTimer(DURATION); hud.setScore('Afstand: 0%');
    hud.setPlayerInfo(0, 'Duw op de maat!'); hud.setPlayerInfo(1, 'Duw op de maat!');

    // ---------------- hoofdlus ----------------
    function update(dt) {
      if (done) { postUpdate(dt); return; }
      T += dt; timeLeft -= dt; hintCd -= dt; bonkCd -= dt;
      for (let i = 0; i < 2; i++) { lock[i] = Math.max(0, lock[i] - dt); chaos[i] = Math.max(0, chaos[i] - dt / 1.2); }
      for (let i = 0; i < 2; i++) tapFlashUI[i] = Math.max(0, tapFlashUI[i] - dt * 5);
      const ip = input.p;
      // --- invoer: tikken
      for (let i = 0; i < 2; i++) if (ip[i].aP) tap(i);
      // --- fasestatus
      if (phase === 2) {
        if (sub === 'approach') {
          liftTarget = (ip[0].b ? 1 : 0);
          v = damp(v, 3.0, 3, dt); x += v * dt;
          if (x >= XS[0] - 0.05) { x = XS[0] - 0.05; v = 0; audio.sfx('wood'); ctx.shake(0.15); startSegment(); }
        } else if (sub === 'seg') {
          liftTarget = ip[leverP].b ? 1 : 0;
          x = damp(x, xTarget, 8, dt);
          if (segHits >= SEG_NEED && Math.abs(x - XS[seg + 1]) < 0.06) {
            x = XS[seg + 1]; seg++;
            if (seg >= 3) { sub = 'exit'; clearNotes(); v = 2.4; audio.sfx('good'); }
            else { sub = 'swap'; swapT = 1.2; clearNotes(); leverP = seg % 2; pusher = 1 - leverP; audio.sfx('bell', { vol: 0.5 }); hud.showBig('WISSEL!', 900, '#8fd8ff'); }
          }
        } else if (sub === 'swap') {
          liftTarget = (ip[0].b || ip[1].b) ? 1 : 0; swapT -= dt;
          if (swapT <= 0) startSegment();
        } else if (sub === 'exit') {
          liftTarget = x < XS[3] + 0.4 ? 1 : 0;
          v = damp(v, 3.4, 2.5, dt); x += v * dt;
          if (x >= XS[3] + 0.5 && lift > 0.5) { liftTarget = 0; }
          if (x >= P3_START) beginPhase3();
        }
        // bonk: stam valt op het karretje
        if (phase === 2) {
        const under = x > XS[0] + 0.15 && x < XS[3] - 0.1 && sub !== 'exit';
        if (under && lift < 0.5 && bonkCd <= 0) {
          bonks++; bonkCd = 1.2; x = XS[0] - 0.05 - 0.2; xTarget = XS[0]; v = 0; segHits = 0; clearNotes(); nextNoteT = T + 1.6;
          audio.sfx('thud', { vol: 1 }); ctx.shake(0.7); say('BONK! Hou B vast!', LOG_X, 4.5, 0, '#ff6a5a', 1.3);
          fx.particles.burst(LOG_X, 0.8, 0, { count: 26, speed: 5, up: 1.2, life: 0.9, size: 0.4, colors: [0x8a6a42, 0xb09068, 0x6b4a2e], gravity: 14 });
        }
        // veilige duwpositie als stam omlaag is en karretje ervoor staat
        if (lift < 0.5 && x > XS[0] - 0.05 && !under && sub !== 'exit') x = Math.min(x, XS[0] - 0.05);
        }
      } else if (phase === 1) {
        v *= Math.exp(-2.0 * dt); x += v * dt; x = Math.max(0, x);
        if (x >= P1_END) beginPhase2();
        liftTarget = 0;
      } else if (phase === 3) {
        liftTarget = 0;
        if (sub === 'lead') {
          v = damp(v, 0, 1.5, dt); x += v * dt; leadT -= dt;
          if (leadT <= 0) { sub = 'play'; nextNoteT = T + 0.9; }
        } else {
          const grad = Math.max(0, roadSlope(x));
          v += -grad * 4.0 * dt - (grad > 0.02 ? 0.25 : 0) * dt;
          v *= Math.exp(-0.75 * dt);
          x += v * dt;
          if (x < P3_START - 0.3) { x = P3_START - 0.3; v = Math.max(0, v); }
          if (x >= FINISH_X) { v = 0; x = FINISH_X; finishGame(true); }
        }
      }
      // wielen modderspatten tijdens het rijden
      if (Math.abs(v) > 0.8 && Math.random() < dt * 14) mud(x - 0.4, (Math.random() < 0.5 ? -1 : 1) * 1.3, 2, 0.5);
      if (phase === 3 && Math.abs(v) > 0.5 && Math.random() < dt * 10) fx.particles.dust(x - 1, roadY(x), (Math.random() - 0.5) * 2, 1, 0xc9a874);

      // --- noten
      spawnNotes();
      for (const n of notes) {
        if (!n.ticked && n.t <= T && n.t > T - 0.2) {
          n.ticked = true;
          if (!n.done) {
            if (phase === 1) audio.tone(n.p === 2 ? 392 : 330, 0.05, { type: 'square', vol: 0.05 });
            else audio.tone(n.p ? 620 : 410, 0.05, { type: 'square', vol: 0.06 });
          }
        }
        if (!n.done && T > n.t + WIN) resolve(n);
      }
      while (notes.length && notes[0].done && T - notes[0].doneT > 0.6) notes.shift();
      if (notes.length > 40) notes.splice(0, notes.length - 40);
      sync = Math.max(0, sync - dt * 0.012);
      if (phase !== 4 && !done && timeLeft <= 0) { finishGame(false); }

      postUpdate(dt);
      // hud
      hud.setTimer(Math.max(0, timeLeft), 12);
      hud.setScore(`Afstand: ${Math.round(clamp(x / FINISH_X, 0, 1) * 100)}%`);
      const info = (i) => (phase === 2 && sub !== 'approach' ? (leverP === i ? 'Hefboom! (B)' : 'Duwen! (A)') : phase === 3 ? (sub === 'lead' ? 'Klaar...' : 'Om de beurt!') : `Tikken: ${pl[i].taps}`);
      hud.setPlayerInfo(0, info(0)); hud.setPlayerInfo(1, info(1));
      drawUI();
    }

    function postUpdate(dt) {
      updateCart(dt); updateLog(dt); placePlayers(dt);
      updateCamera(dt, 0);
      world.update(T + cheerT, dt, camX);
      if (done && phase === 4) {
        cheerT += dt;
        // karretje rolt door de poort
        const open = clamp((cheerT - 0.2) / 1.2, 0, 1);
        for (const d of world.doors) d.pivot.rotation.y = -d.sz * (Math.PI / 2) * 0.92 * open;
        if (cheerT > 0.9) { x = Math.min(x + dt * 2.6, GATE_X - 5.0); }
      }
    }

    return {
      update,
      introUpdate(dt) { T += 0; cheerT += dt; pl.forEach((p) => { p.c.pose = 'push'; }); placePlayers(dt); updateCart(dt); updateCamera(dt, cheerT); world.update(cheerT, dt, camX); },
      resultUpdate(dt) { postUpdate(dt); },
      onStart() { started = true; },
      onCountdown() { mount(); drawUI(); },
      dispose() { cv.remove(); },
      dbg: {
        state: () => ({ T, phase, sub, x, v, lift, seg, segHits, combo, bestCombo, sync, timeLeft, done, leverP, pusher, perfects, hitsTotal, missesTotal, slips, bonks, phaseTimes }),
        notes: () => notes.filter((n) => !n.done).map((n) => ({ t: n.t, p: n.p })),
      },
    };
  },
};

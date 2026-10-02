import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { KEY_LABELS } from '../engine/input.js';
import { buildLavaWorld, LAVA_Y, CLIFF_E } from './tugwar_world.js';

// Touwtrekken boven de Lava — duel (Mario Party "Tug o' War"). Best-of-3 rondes.
//  * A en B om en om = ritme-bonus; een gloeiende ster op het touw = power-surge als je de goede knop op tijd indrukt
//  * een dikke kip trekt soms een ronde lang mee, het touw kan knappen (spanningsmeter), de achterblijver krijgt een Boost
//  * wie over de streep wordt getrokken, valt in de lava en komt verkoold terug.

const S0 = CLIFF_E + 4.0;          // startplek (x) van de spelers
const DD = 4.0;                    // verschuiving bij lead = ±1 (dan staat de verliezer op de rand)
const BACK = 1.2;                  // de winnaar stapt zo ver achteruit
const ROUND_TIME = 20;
const WIN_ROUNDS = 2;
const GAIN = 0.036, VMAX = 0.34, TAU_PW = 0.8;
const ROPE_N = 28;

function makeFatChicken() {
  const g = new THREE.Group();
  const white = mat(0xfff7ea, { flatShading: false }), white2 = mat(0xf0e6d2, { flatShading: false }), org = mat(0xf2a33a), red = mat(0xd83a2a, { flatShading: false });
  const body = new THREE.Group(); g.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.66, 12, 9), white, { pos: [0, 0.8, 0], scale: [1.05, 0.95, 1.15] }));
  for (let k = -1; k <= 1; k++) body.add(mesh(new THREE.ConeGeometry(0.17, 0.7, 5), k ? white2 : white, { pos: [k * 0.2, 1.1, -0.75], rot: [-1.15, 0, k * 0.4] }));
  const wings = [];
  for (const sd of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sd * 0.62, 0.95, 0.05); body.add(w);
    w.add(mesh(new THREE.SphereGeometry(0.4, 8, 6), white2, { pos: [sd * 0.18, -0.12, 0], scale: [0.3, 0.9, 1.1] }));
    wings.push(w);
  }
  const head = new THREE.Group(); head.position.set(0, 1.55, 0.6); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.33, 10, 8), white));
  head.add(mesh(new THREE.ConeGeometry(0.11, 0.3, 4), org, { pos: [0, -0.03, 0.36], rot: [Math.PI / 2, 0, 0] }));
  for (let k = 0; k < 3; k++) head.add(mesh(new THREE.SphereGeometry(0.1 - k * 0.012, 6, 5), red, { cast: false, pos: [0, 0.37 + (k === 1 ? 0.05 : 0), -0.08 + k * 0.1] }));
  head.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), red, { cast: false, pos: [0, -0.2, 0.3] }));
  for (const sd of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.075, 6, 5), mat(0xffffff, { flatShading: false }), { cast: false, pos: [sd * 0.15, 0.08, 0.25] }));
    head.add(mesh(new THREE.SphereGeometry(0.038, 5, 4), mat(0x111111), { cast: false, pos: [sd * 0.15 + sd * 0.015, 0.08, 0.31] }));
    head.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0xf4a0a0, { flatShading: false }), { cast: false, pos: [sd * 0.24, -0.06, 0.18] }));
  }
  const legs = [];
  for (const sd of [-1, 1]) { const l = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 4), org, { pos: [sd * 0.2, 0.22, 0.05] }); g.add(l); legs.push(l); g.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.3), org, { cast: false, pos: [sd * 0.2, 0.04, 0.12] })); }
  return { group: g, body, head, wings, legs };
}

function keyTex(label, color) {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, color); gr.addColorStop(1, 'rgba(255,200,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(20,10,40,.85)'; g.beginPath(); g.arc(64, 64, 33, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${label.length > 2 ? 22 : 40}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 64, 66, 60);
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

export default {
  id: 'tugwar',
  name: 'Touwtrekken boven de Lava',
  giver: 'Lavameester Lars',
  icon: '🪢',
  mode: 'pvp',
  time: 70,
  music: 'game_fast',
  twists: ['swapab', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  blurb: 'Twee klippen, één lavameer en een <b>touw</b> met een vlag! Trek je broer over de streep en <b>hij plonst in de lava</b>. Best-of-3. Druk <b>A en B om en om</b> voor een ritme-bonus. Trek niet te hard tegelijk: het touw kan <b>knappen</b>! Soms springt er een <b>dikke kip</b> bij die een ronde lang meetrekt, en wie achterstaat krijgt een <b>Boost</b>.',
  controls: ['{a} en {b} om en om indrukken = trekken (ritme = extra kracht)', 'Gloeiende ster op het touw: druk de juiste knop = POWER-SURGE'],
  tip: 'Snelle vingers winnen, maar een regelmatig ritme (A-B-A-B) trekt veel harder dan alleen maar A rammen. Beiden te hard trekken laat het touw knappen!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' ? 1.4 : tw === 'slowmo' ? 0.85 : 1;
    const gainMul = tw === 'turbo' ? 1.35 : tw === 'slowmo' ? 0.85 : 1;

    const L = ctx.lights('cave', { shadow: 17, center: [0, 0, 0], fogNear: 36, fogFar: 100 });
    L.hemi.intensity = 1.25; L.hemi.color.set(0xb89ab0); L.hemi.groundColor.set(0xff5a22);
    L.sun.color.set(0xffd2a8); L.sun.intensity = 1.7; L.sun.position.set(-8, 22, 18);
    camera.fov = 50; camera.updateProjectionMatrix();
    const W = buildLavaWorld(ctx, L);

    // ---------------- spelers ----------------
    const sizeOf = (i) => pv.size(i);
    const pl = players.map((pp, i) => {
      const c = makeBrother(i);
      const kS = 3.1 / c.height * sizeOf(i);
      const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(kS); scene.add(holder);
      c.faceDir(i ? -1 : 1, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })); aura.position.y = c.height * 0.5; aura.scale.set(0.9, 1.35, 0.9); aura.visible = false; holder.add(aura);
      // vlammen op het achterwerk
      const flames = new THREE.Group(); flames.visible = false; c.torso.add(flames); flames.position.set(0, 0.08 * c.s, -0.36 * c.s); flames.scale.setScalar(1.9);
      const fl = [];
      for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.17 * c.s * (1 - k * 0.15), 0.55 * c.s, 6), new THREE.MeshBasicMaterial({ color: [0xff6a10, 0xffb020, 0xffe680][k], transparent: true, opacity: 0.95, depthWrite: false })); f.position.set((k - 1) * 0.14 * c.s, 0.2 * c.s, -0.02 * c.s * k); flames.add(f); fl.push(f); }
      const blob = P.shadowBlob(1.3 * sizeOf(i)); blob.position.y = 0.02; scene.add(blob);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.3, 0.86, 1); tag.renderOrder = 15; scene.add(tag);
      // verkool-materialen (per mesh een gedimde kloon)
      const burnList = [];
      c.group.traverse((o) => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial && !Array.isArray(o.material)) { const b = o.material.clone(); b.color.multiplyScalar(0.3); burnList.push({ o, orig: o.material, burnt: b }); } });
      return {
        i, c, holder, kS, aura, flames, fl, blob, tag, burnList, burned: false,
        x: i ? S0 : -S0, y: 0, vy: 0, vx: 0, st: 'stand', hidden: false, wins: 0,
        pw: 0, rm: 0, lastBtn: null, lastT: -9, lastIv: 0, boostT: 0, jerk: 0, eff: 0, dragged: 0, spin: 0, fallT: 0,
        powMul: 1 + (sizeOf(i) - 1) * 0.2, rmGain: sizeOf(i) < 1 ? 1.4 : 1, frozen: 0, presses: 0, surges: 0, bestRm: 0,
        keyOff: 0,
      };
    });
    const setBurned = (p, on) => { if (p.burned === on) return; p.burned = on; for (const b of p.burnList) b.o.material = on ? b.burnt : b.orig; };

    // ---------------- touw + vlag ----------------
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), ropeMat, 64); rope.frustumCulled = false; rope.castShadow = true; scene.add(rope);
    { const c1 = new THREE.Color(0xcaa25e), c2 = new THREE.Color(0x8a6a38); for (let k = 0; k < 64; k++) rope.setColorAt(k, k % 2 ? c1 : c2); rope.instanceColor.needsUpdate = true; }
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const pts = Array.from({ length: ROPE_N + 1 }, () => new THREE.Vector3());
    const halfA = Array.from({ length: 16 }, () => new THREE.Vector3()), halfB = Array.from({ length: 16 }, () => new THREE.Vector3());
    function layRope(arrs) {
      let n = 0;
      for (const [arr, cnt] of arrs) {
        for (let k = 0; k < cnt - 1 && n < 64; k++) {
          const a = arr[k], b = arr[k + 1]; _d.subVectors(b, a); const len = _d.length() || 0.001; _d.multiplyScalar(1 / len);
          _q.setFromUnitVectors(UP, _d); _p.addVectors(a, b).multiplyScalar(0.5); _s.set(1, len * 1.05, 1);
          _m.compose(_p, _q, _s); rope.setMatrixAt(n++, _m);
        }
      }
      rope.count = n; rope.instanceMatrix.needsUpdate = true;
    }
    // vlag
    const flagTex = canvasTex(256, 176, (g, w, h) => {
      g.fillStyle = '#c81e2e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffd24a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#ffd24a'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 24 : 54; g.lineTo(w / 2 + Math.cos(a) * r, 78 + Math.sin(a) * r); } g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 30px MedievalSharp, serif'; g.textAlign = 'center'; g.fillText('TREK!', w / 2, 154);
    });
    const flag = new THREE.Group(); scene.add(flag);
    const flagGeo = new THREE.PlaneGeometry(1.9, 1.3, 6, 4);
    const flagBase = Float32Array.from(flagGeo.attributes.position.array);
    const flagCloth = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 })); flagCloth.position.y = -0.8; flagCloth.castShadow = true; flag.add(flagCloth);
    flag.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6), mat(0x5a3a20), { rot: [0, 0, Math.PI / 2], pos: [0, -0.12, 0] }));
    flag.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xffd24a, { metalness: 0.6 }), { cast: false, pos: [1.05, -0.12, 0] }), mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xffd24a, { metalness: 0.6 }), { cast: false, pos: [-1.05, -0.12, 0] }));
    const F = { fall: false, y: 0, vy: 0, vis: true, x: 0, rot: 0 };

    // ---------------- kip ----------------
    const chickObj = makeFatChicken(); chickObj.group.scale.setScalar(1.5); chickObj.group.visible = false; scene.add(chickObj.group);
    let chick = null; let chickenRounds = 0;

    // ---------------- surge-orbs ----------------
    const gTex = glowTex();
    const orbTexCache = {};
    function orbTexFor(i, btn) {
      const physical = pv.swapped ? 1 - i : i; const swapAB = tw === 'swapab';
      const lbl = KEY_LABELS[physical][(btn === 'a') !== swapAB ? 'a' : 'b'];
      const key = lbl + btn; if (!orbTexCache[key]) orbTexCache[key] = keyTex(lbl, btn === 'a' ? 'rgba(255,200,40,.9)' : 'rgba(80,220,255,.9)');
      return orbTexCache[key];
    }
    const orbs = [0, 1].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, transparent: true, depthTest: false, blending: THREE.NormalBlending })); s.renderOrder = 18; s.visible = false; scene.add(s); return s; });
    const orbRings = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide })); m.renderOrder = 17; m.visible = false; scene.add(m); return m; });

    // ---------------- toestand ----------------
    const R = { n: 0, state: 'ready', t: 0, tugT: 0, left: ROUND_TIME, sd: 0, nextSurge: 4, nextBoost: 6, loser: -1, winner: -1, plan: null, snapT: 0, snaps: 0, ropeVis: 1, timeUp: 0, matchOver: false, burnT: 0, hitX: 0, lastWinner: -1 };
    let lead = 0, leadV = 0, tension = 0, T = 0, introT = 0, started = false, finished = false, camX = 0, camLy = 0, hintT = 0;
    let surge = [null, null]; let snapSfxT = 0, creakT = 0;
    let stats = { chickenHelped: -1, snaps: 0 };
    const hist = [];

    // ---------------- DOM (meters) ----------------
    const dom = { root: null };
    const css = (el, o) => { Object.assign(el.style, o); return el; };
    const mk = (tag, o, text) => { const e = document.createElement(tag); css(e, o); if (text != null) e.textContent = text; return e; };
    function buildDom() {
      const hudEl = document.getElementById('hud'); if (!hudEl) return;
      const root = mk('div', { position: 'absolute', inset: '0', pointerEvents: 'none', fontFamily: 'Fredoka, Arial Black, sans-serif', color: '#fff', textShadow: '0 2px 0 #000' });
      // tug-meter
      const wrap = mk('div', { position: 'absolute', left: '50%', bottom: '74px', transform: 'translateX(-50%)', width: 'min(560px, 54vw)', height: '24px', borderRadius: '14px', border: '3px solid #ffd24a', background: 'linear-gradient(90deg,#2f9e5b 0 50%,#3a78e0 50% 100%)', boxShadow: '0 4px 0 rgba(0,0,0,.5)', overflow: 'visible' });
      const dangerL = mk('div', { position: 'absolute', left: 0, top: 0, bottom: 0, width: '10%', borderRadius: '11px 0 0 11px', background: 'repeating-linear-gradient(45deg,#7a0d0d 0 6px,#d8372c 6px 12px)', opacity: 0.8 });
      const dangerR = mk('div', { position: 'absolute', right: 0, top: 0, bottom: 0, width: '10%', borderRadius: '0 11px 11px 0', background: 'repeating-linear-gradient(-45deg,#7a0d0d 0 6px,#d8372c 6px 12px)', opacity: 0.8 });
      const mid = mk('div', { position: 'absolute', left: '50%', top: '-4px', bottom: '-4px', width: '2px', background: 'rgba(255,255,255,.7)' });
      const marker = mk('div', { position: 'absolute', top: '-12px', width: '14px', height: '44px', marginLeft: '-7px', background: '#fff', borderRadius: '6px', border: '3px solid #c81e2e', boxShadow: '0 0 12px rgba(255,255,255,.9)', left: '50%' });
      const nL = mk('div', { position: 'absolute', left: '8px', top: '-24px', fontSize: '16px', color: '#7dffb0' }, names[0]);
      const nR = mk('div', { position: 'absolute', right: '8px', top: '-24px', fontSize: '16px', color: '#8fb8ff' }, names[1]);
      wrap.append(dangerL, dangerR, mid, marker, nL, nR);
      // spanning-meter
      const tWrap = mk('div', { position: 'absolute', left: '50%', bottom: '50px', transform: 'translateX(-50%)', width: 'min(300px, 30vw)', height: '14px', borderRadius: '9px', border: '2px solid #000', background: '#2a1a1a', overflow: 'hidden' });
      const tFill = mk('div', { height: '100%', width: '0%', background: 'linear-gradient(90deg,#ffd24a,#ff8a1c,#ff2a1a)' });
      const tLab = mk('div', { position: 'absolute', inset: 0, textAlign: 'center', fontSize: '11px', lineHeight: '14px', letterSpacing: '1px' }, 'SPANNING');
      tWrap.append(tFill, tLab);
      const panels = [0, 1].map((i) => {
        const side = i ? { right: '14px' } : { left: '14px' };
        const p = mk('div', { position: 'absolute', bottom: '14px', width: 'min(250px, 28vw)', padding: '8px 10px 9px', borderRadius: '14px', background: 'rgba(20,12,30,.72)', border: `3px solid ${players[i].css}`, ...side });
        const title = mk('div', { display: 'flex', justifyContent: 'space-between', fontSize: '17px' });
        const nm = mk('span', { color: players[i].css }, names[i]); const rl = mk('span', { fontSize: '13px', opacity: 0.9 }, 'RITME x1.0');
        title.append(nm, rl);
        const bar = mk('div', { height: '12px', marginTop: '4px', borderRadius: '8px', background: '#1d1428', border: '2px solid #000', overflow: 'hidden' });
        const fill = mk('div', { height: '100%', width: '0%', background: 'linear-gradient(90deg,#4ad7ff,#ffe14a,#ff6a3a)' }); bar.append(fill);
        const info = mk('div', { fontSize: '13px', marginTop: '4px', minHeight: '18px', opacity: 0.95 });
        const sg = mk('div', { position: 'absolute', left: '50%', top: '-46px', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: '14px', background: '#ffe14a', color: '#2a1a00', fontSize: '22px', textShadow: 'none', border: '3px solid #fff', boxShadow: '0 0 18px #ffe14a', display: 'none', whiteSpace: 'nowrap' });
        p.append(title, bar, info, sg);
        return { p, rl, fill, info, sg, last: {} };
      });
      root.append(wrap, tWrap, panels[0].p, panels[1].p);
      hudEl.append(root);
      dom.root = root; dom.marker = marker; dom.tFill = tFill; dom.tWrap = tWrap; dom.panels = panels;
    }
    function setT(o, key, val, fn) { if (o.last[key] !== val) { o.last[key] = val; fn(val); } }
    function updateDom() {
      if (!dom.root || !dom.root.isConnected) { buildDom(); if (!dom.root) return; }
      dom.marker.style.left = `${(clamp(lead, -1, 1) + 1) * 50}%`;
      dom.tFill.style.width = `${Math.round(tension * 100)}%`;
      dom.tWrap.style.borderColor = tension > 0.75 ? '#ff2a1a' : '#000';
      for (let i = 0; i < 2; i++) {
        const q = dom.panels[i], p = pl[i];
        const mult = 1 + 0.7 * p.rm;
        setT(q, 'rl', `RITME x${mult.toFixed(1)}`, (v) => { q.rl.textContent = v; });
        setT(q, 'fill', Math.round(p.rm * 50), (v) => { q.fill.style.width = `${v * 2}%`; });
        const phys = pv.swapped ? 1 - i : i;
        const hint = hintT > 0 ? `Druk ${KEY_LABELS[phys].a} en ${KEY_LABELS[phys].b} om en om!` : '';
        const txt = p.boostT > 0 ? '🔥 BOOST! Trek!' : p.frozen > 0 ? '😵 Suf van de klap...' : hint;
        setT(q, 'info', txt, (v) => { q.info.textContent = v; });
        const o = surge[i];
        const showSg = !!o && o.t > o.travel * 0.45 && o.state !== 'done';
        setT(q, 'sg', showSg ? o.btn + (o.t >= o.travel - 0.15 ? '!' : '') : '', (v) => { if (v) { q.sg.style.display = 'block'; q.sg.textContent = `⚡ ${KEY_LABELS[phys][(o.btn === 'a') !== (tw === 'swapab') ? 'a' : 'b']} ⚡`; q.sg.style.background = v.endsWith('!') ? '#fff04a' : '#ffd24a'; } else q.sg.style.display = 'none'; });
        q.sg.style.transform = `translateX(-50%) scale(${surge[i] && surge[i].t >= surge[i].travel - 0.15 ? 1.15 + Math.sin(T * 30) * 0.08 : 1})`;
      }
    }

    // ---------------- ronde-flow ----------------
    const pips = (w) => '●'.repeat(w) + '○'.repeat(WIN_ROUNDS - w);
    function refreshHud() {
      hud.setScore(`Ronde ${Math.min(R.n, 3)}   ${names[0]} ${pips(pl[0].wins)}  –  ${pips(pl[1].wins)} ${names[1]}`);
      hud.setPlayerInfo(0, `Rondes: ${pl[0].wins}`); hud.setPlayerInfo(1, `Rondes: ${pl[1].wins}`);
    }
    function resetPlayer(p) {
      p.st = 'stand'; p.y = 0; p.vy = 0; p.hidden = false; p.pw = 0; p.rm = 0; p.lastBtn = null; p.boostT = 0; p.frozen = 0; p.spin = 0; p.jerk = 0; p.eff = 0;
      setBurned(p, false); p.flames.visible = false; p.holder.rotation.set(0, 0, 0); p.c.pose = 'idle'; p.c.air = false; p.c.speed = 0; p.holder.visible = true;
    }
    function startRound() {
      R.n++; R.snaps = 0; R._cheered = false; R.state = 'ready'; R.t = 0; R.tugT = 0; R.left = ROUND_TIME / (tw === 'turbo' ? 1.1 : 1); R.sd = 0; R.snapT = 0; R.ropeVis = 1; R.timeUp = 0; R.loser = R.winner = -1;
      lead = 0; leadV = 0; tension = 0; surge = [null, null]; orbs.forEach((o) => (o.visible = false)); orbRings.forEach((o) => (o.visible = false));
      R.nextSurge = 3.8 / TEMPO; R.nextBoost = 5.5 + Math.random() * 2;
      pl.forEach(resetPlayer);
      // kip-plan voor deze ronde
      const prob = R.n === 1 ? 0.4 : 0.85;
      R.plan = (Math.random() < prob || (R.n === 3 && chickenRounds === 0)) ? { at: rand(2.5, 6), side: Math.random() < 0.5 ? 0 : 1 } : null;
      if (chick) { chick = null; chickObj.group.visible = false; }
      F.fall = false; F.vis = true; flag.visible = true;
      refreshHud(); hud.setTimer(null);
      hud.showBig(R.n === 1 ? 'TREKKEN!' : `RONDE ${R.n}`, 900, '#ffd24a'); audio.sfx('bell', { vol: 0.5 });
      W.cheer(false);
      hintT = R.n === 1 ? 7 : 0;
      R.readyLen = R.n === 1 ? 0.5 : 1.4;
      camLy = 0;
    }
    function press(i, btn) {
      const p = pl[i];
      p.presses++;
      const iv = T - p.lastT;
      if (p.lastBtn && p.lastBtn !== btn && iv > 0.09 && iv < 0.6) {
        const reg = p.lastIv > 0 ? 1 - clamp(Math.abs(iv - p.lastIv) / Math.max(iv, p.lastIv) / 0.6, 0, 1) : 0.7;
        p.rm = Math.min(1, p.rm + (0.10 + 0.07 * reg) * p.rmGain); p.lastIv = iv;
        if (p.rm > p.bestRm) p.bestRm = p.rm;
      } else if (p.lastBtn === btn) p.rm = Math.max(0, p.rm * 0.93 - 0.01);
      else p.lastIv = 0;
      p.lastBtn = btn; p.lastT = T;
      p.pw += (1 + 0.7 * p.rm) / TAU_PW;
      p.jerk = 1;
      if (p.y < 0.05) p.vy = 2.4 + (GRAV < 1 ? 2.4 : 0);
      audio.sfx('tick', { vol: 0.4, rate: 0.9 + p.rm * 0.7 });
      // surge?
      const o = surge[i];
      if (o && o.state !== 'done' && o.btn === btn && o.t >= o.travel - 0.15 && o.t <= o.travel + 0.5) {
        const perfect = Math.abs(o.t - o.travel) <= 0.2;
        p.pw += perfect ? 14 : 8; p.surges++; o.state = 'done'; o.fade = 0.4;
        const hp = handMid(i);
        fx.texts.add(perfect ? 'SUPER SURGE!' : 'SURGE!', hp.x, hp.y + 1.6, 1, perfect ? '#fff04a' : '#ffd24a', perfect ? 1.4 : 1.1);
        fx.particles.burst(hp.x, hp.y, hp.z, { count: perfect ? 40 : 24, speed: 7, up: 1, life: 0.7, size: 0.35, colors: [0xfff04a, 0xffffff, 0x9fe8ff, 0xffb020], gravity: 3 });
        fx.particles.ring(hp.x, hp.y, hp.z, { count: 22, speed: 6, color: 0xffe14a, size: 0.3, life: 0.5 });
        audio.sfx('powerup', { vol: 0.6 }); audio.sfx('sparkle', { vol: 0.5 }); ctx.shake(perfect ? 0.45 : 0.25);
      }
    }
    function giveBoost(i) {
      const p = pl[i]; p.boostT = 3.2;
      const hp = handMid(i);
      fx.texts.add('BOOST!', hp.x, hp.y + 2, 1, '#ff8a2a', 1.4);
      fx.particles.burst(p.x, 1.4, 0, { count: 40, speed: 6, up: 1.4, life: 0.8, size: 0.4, colors: [0xff5a0a, 0xffb020, 0xffe680], gravity: -2 });
      audio.sfx('powerup', { vol: 0.7 }); audio.sfx('whoosh', { vol: 0.5 });
      hud.toast(`🔥 BOOST voor ${names[i]}!`, 1500);
    }

    // ---------------- hulpfuncties voor posities ----------------
    const hv = [new THREE.Vector3(), new THREE.Vector3()], hmid = [new THREE.Vector3(), new THREE.Vector3()];
    function handMid(i) {
      const p = pl[i]; p.holder.updateMatrixWorld(true);
      p.c.handL.getWorldPosition(hv[0]); p.c.handR.getWorldPosition(hv[1]);
      return hmid[i].addVectors(hv[0], hv[1]).multiplyScalar(0.5);
    }
    function ropeAt(u, out) {   // u = 0..1 langs de punten
      const f = clamp(u, 0, 1) * ROPE_N, k = Math.min(ROPE_N - 1, Math.floor(f)); return out.lerpVectors(pts[k], pts[k + 1], f - k);
    }

    // ---------------- stappen ----------------
    function triggerSnap() {
      R.snapT = 2.0; R.snaps++; stats.snaps++;
      tension = 0; surge = [null, null]; orbs.forEach((o) => (o.visible = false)); orbRings.forEach((o) => (o.visible = false));
      pl.forEach((p) => { p.pw *= 0.15; p.frozen = 0; });
      F.fall = true; F.vy = 1.5; F.x = flag.position.x; F.y = flag.position.y; F.rot = 0;
      hud.showBig('KRAAK!', 1100, '#ff5a3a'); hud.toast('Het touw is geknapt! De vlag valt weg...', 1800);
      audio.sfx('explode', { vol: 0.35 }); audio.sfx('creak', { vol: 0.8 }); ctx.shake(0.7);
      fx.particles.burst(flag.position.x, flag.position.y, 0, { count: 40, speed: 5, up: 0.8, life: 0.9, size: 0.3, colors: [0xcaa25e, 0x8a6a38, 0xffffff], gravity: 10 });
      if (chick && chick.st !== 'leave') chick.st = 'leave', chick.t = 0;
    }
    function startDrop(l) {
      const w = 1 - l; R.state = 'drop'; R.loser = l; R.winner = w; R.t = 0; R.lastWinner = w;
      pl[w].wins++; hist.push([pl[0].wins, pl[1].wins]);
      const p = pl[l]; p.st = 'fly'; p.vx = (l === 0 ? 1 : -1) * 6.2; p.vy = 8.5; p.c.pose = 'scared'; p.c.air = true; p.spin = (l === 0 ? 1 : -1) * 5;
      pl[w].c.pose = 'cheer';
      R.matchOver = pl[w].wins >= WIN_ROUNDS;
      pl.forEach((q) => { q.boostT = 0; });
      refreshHud(); hud.setTimer(null);
      hud.showBig(`${names[l]} valt!`, 900, '#ff7a3a');
      audio.sfx('miss', { vol: 0.8 }); audio.sfx('whoosh', { vol: 0.6 }); ctx.shake(0.4); W.gasp();
      if (chick && chick.st !== 'leave') { chick.st = 'leave'; chick.t = 0; }
      surge = [null, null]; orbs.forEach((o) => (o.visible = false)); orbRings.forEach((o) => (o.visible = false));
    }
    function lavaImpact(p) {
      R.state = 'lava'; R.t = 0; p.hidden = true; p.holder.visible = false; R.hitX = p.x;
      W.splash(p.x, 0, 1.2); W.column(p.x, 0, 1.2);
      audio.sfx('splash', { vol: 1 }); audio.sfx('sizzle', { vol: 0.9 }); audio.sfx('explode', { vol: 0.35 }); audio.sfx('splash', { vol: 0.6, rate: 0.6 });
      ctx.shake(0.95);
      fx.texts.add('PLONS!', p.x, LAVA_Y + 3.5, 1, '#ffb030', 1.7);
      hud.showBig('PLONS!', 900, '#ff8a2a');
    }
    function popOut(p) {
      const tx = (p.i === 0 ? -1 : 1) * (CLIFF_E + 2.2);
      const g = 26, vy = 18, y0 = p.y;
      const tFl = (vy + Math.sqrt(Math.max(1, vy * vy + 2 * g * y0))) / g;
      p.vx = (tx - p.x) / tFl; p.vy = vy; p.st = 'fly2'; p.hidden = false; p.holder.visible = true;
      setBurned(p, true); p.flames.visible = true; p.spin = (p.i === 0 ? -1 : 1) * 7; p.c.pose = 'scared'; p.c.air = true;
      R.state = 'pop'; R.t = 0; R.tx = tx;
      W.splash(p.x, 0, 0.7);
      audio.sfx('boing', { vol: 0.8 }); audio.sfx('hurt', { vol: 0.7 });
      fx.texts.add('AUWWW!', p.x, 3, 1, '#ff5a3a', 1.5);
      W.gasp();
    }
    function landBurn(p) {
      R.state = 'burn'; R.burnT = 0; p.st = 'run'; p.y = 0; p.vy = 0; p.holder.rotation.set(0, 0, 0);
      fx.particles.dust(p.x, 0, 0, 8, 0xb0a090); audio.sfx('thud', { vol: 0.8 }); ctx.shake(0.4);
    }
    function forceFinish() {
      if (finished) return;
      let w = pl[0].wins !== pl[1].wins ? (pl[0].wins > pl[1].wins ? 0 : 1) : (Math.abs(lead) > 0.02 ? (lead > 0 ? 1 : 0) : (pl[0].presses >= pl[1].presses ? 0 : 1));
      endMatch(w, true);
    }
    function endMatch(w, forced) {
      if (finished) return; finished = true;
      hud.setTimer(null);
      const l = 1 - w;
      const jokes = [
        `${names[w]} sleurde ${names[l]} met een gigantische plons de lava in!`,
        `${names[l]} ruikt nu naar verbrande toast. ${names[w]} is de touwkampioen!`,
        `${names[w]} trok als een stier. ${names[l]} is nu een knapperig lavakoekje.`,
        `Het publiek joelt voor ${names[w]}. ${names[l]} moet even afkoelen.`,
      ];
      let extra = '';
      if (stats.chickenHelped >= 0) extra += ` De kip koos voor ${names[stats.chickenHelped]}.`;
      if (stats.snaps) extra += ` Het touw knapte ${stats.snaps}x.`;
      ctx.finishPvp({ winner: w, score: [pl[0].wins, pl[1].wins], delay: forced ? 300 : 1500, summary: `${pick(jokes)}${extra}` });
    }

    // ---------------- hoofd-update ----------------
    function tugStep(dt, inp) {
      R.tugT += dt; hintT = Math.max(0, hintT - dt);
      const snapping = R.snapT > 0;
      // invoer
      if (!snapping && !R.timeUp) for (let i = 0; i < 2; i++) {
        const p = pl[i]; if (p.frozen > 0) { p.frozen -= dt; continue; }
        if (inp[i].aP) press(i, 'a'); if (inp[i].bP) press(i, 'b');
      }
      // ritme/pw verval, boost
      for (const p of pl) {
        p.pw *= Math.exp(-dt / TAU_PW);
        if (T - p.lastT > 0.5) p.rm = Math.max(0, p.rm - 0.45 * dt);
        p.boostT = Math.max(0, p.boostT - dt);
        p.eff = snapping ? 0 : p.pw * (p.boostT > 0 ? 1.75 : 1) * p.powMul;
        p.jerk = Math.max(0, p.jerk - dt * 6);
      }
      // kip
      let bias = 0;
      if (chick && chick.st === 'pull') bias = (chick.side === 1 ? 1 : -1) * 3.6;
      // flag-dynamica
      if (snapping) {
        R.snapT -= dt; lead = damp(lead, 0, 3, dt); leadV = damp(leadV, 0, 6, dt);
        if (R.snapT <= 0) { // touw weer knopen
          R.snapT = 0; hud.toast('Touw weer geknoopt! Trekken maar!', 1300); audio.sfx('wood', { vol: 0.6 }); audio.sfx('powerup', { vol: 0.4 });
          F.fall = false; F.vis = true; flag.visible = true; fx.particles.burst(0, 2, 0, { count: 24, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 3 });
        }
      } else {
        let vT = (pl[1].eff - pl[0].eff + bias) * GAIN * gainMul + lead * 0.05;   // wie voorligt krijgt een beetje hefboom
        if (R.timeUp) { vT = R.timeUp * 0.5; }
        const lam = lerp(4.5, 1.0, SLIP) * (GRAV < 1 ? 0.65 : 1);
        leadV = clamp(damp(leadV, vT, R.timeUp ? 8 : lam, dt), -VMAX * (R.timeUp ? 3 : 1), VMAX * (R.timeUp ? 3 : 1));
        lead = clamp(lead + leadV * dt, -1, 1);
        // spanning
        const mn = Math.min(pl[0].eff, pl[1].eff);
        const thr = 9 + R.snaps * 3;   // na een knap wordt het touw sterker
        if (mn > thr && !R.timeUp && R.snaps < 3) tension = Math.min(1.05, tension + (mn - thr) * 0.04 * dt); else tension = Math.max(0, tension - 0.25 * dt);
        if (tension > 0.72) { creakT -= dt; if (creakT <= 0) { creakT = 0.55; audio.sfx('creak', { vol: 0.35 + tension * 0.3, rate: 1 + tension * 0.5 }); const rp = ropeAt(0.5, _v1); fx.particles.burst(rp.x, rp.y, 0, { count: 6, speed: 2, up: 1, life: 0.5, size: 0.18, colors: [0xcaa25e, 0xffd24a], gravity: 6 }); } }
        if (tension >= 1 && Math.abs(lead) < 0.95 && !R.timeUp) triggerSnap();
        // tijd en einde
        R.left -= dt;
        if (R.left <= 0 && !R.timeUp) {
          if (Math.abs(lead) > 0.05) { R.timeUp = Math.sign(lead); hud.showBig('TIJD!', 900, '#ffd24a'); hud.toast('De lava trekt de verliezer erin!', 1800); audio.sfx('bell', { vol: 0.8 }); }
          else if (R.sd < 1) { R.sd++; R.left = 5; hud.showBig('GOUDEN TREK!', 1000, '#ffd24a'); hud.toast('Gelijkspel! Nog even doortrekken...', 1600); }
          else R.timeUp = (pl[1].presses >= pl[0].presses) ? 1 : -1;
        }
        if (lead >= 0.999) startDrop(0); else if (lead <= -0.999) startDrop(1);
      }
      hud.setTimer(R.timeUp ? 0 : Math.max(0, R.left), 6);
      // surge-orbs
      if (!snapping && !R.timeUp) {
        R.nextSurge -= dt;
        if (R.nextSurge <= 0 && R.left > 4) {
          R.nextSurge = rand(5.5, 7.5) / TEMPO;
          for (let i = 0; i < 2; i++) { const btn = Math.random() < 0.5 ? 'a' : 'b'; surge[i] = { btn, t: 0, travel: 1.5 / TEMPO, state: 'travel', fade: 0 }; orbs[i].material.map = orbTexFor(i, btn); orbs[i].material.needsUpdate = true; orbs[i].visible = true; }
          audio.sfx('sparkle', { vol: 0.4 });
        }
      }
      for (let i = 0; i < 2; i++) {
        const o = surge[i]; if (!o) continue;
        o.t += dt;
        if (o.state === 'done') { o.fade -= dt; if (o.fade <= 0) { surge[i] = null; orbs[i].visible = false; orbRings[i].visible = false; } continue; }
        if (o.t > o.travel + 0.5) { // mislukt
          const hp = handMid(i); fx.particles.burst(hp.x, hp.y, hp.z, { count: 10, speed: 2, up: 0.5, life: 0.5, size: 0.25, colors: [0x999999, 0xdddddd], gravity: 0 }); audio.sfx('miss', { vol: 0.25, rate: 1.6 });
          surge[i] = null; orbs[i].visible = false; orbRings[i].visible = false;
        }
      }
      // boost voor de achterblijver
      R.nextBoost -= dt;
      if (R.nextBoost <= 0 && !snapping && !R.timeUp) {
        let tr = lead > 0.2 ? 0 : lead < -0.2 ? 1 : -1;
        if (tr < 0 && pl[0].wins !== pl[1].wins && Math.random() < 0.4) tr = pl[0].wins < pl[1].wins ? 0 : 1;
        if (tr >= 0 && pl[tr].boostT <= 0) giveBoost(tr);
        R.nextBoost = rand(6.5, 9.5);
      }
      // kip
      if (R.plan && !chick && R.tugT >= R.plan.at && !snapping && !R.timeUp) {
        chick = { st: 'fall', t: 0, u: 0.5 + (Math.random() - 0.5) * 0.08, y: 11, side: R.plan.side, x: 0, flap: 0 }; R.plan = null; chickenRounds++;
        chickObj.group.visible = true; audio.sfx('whoosh', { vol: 0.5 });
      }
      if (chick) chickStep(dt);
    }
    const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
    let chickDip = 0;
    function chickStep(dt) {
      const c = chick; c.t += dt; c.flap += dt;
      if (c.st === 'fall') {
        c.y -= (10 + c.t * 14) * dt;
        const rp = ropeAt(c.u, _v1);
        if (c.y <= rp.y + 0.1) {
          c.st = 'wobble'; c.t = 0; chickDip = 1;
          fx.particles.burst(rp.x, rp.y + 0.3, 0, { count: 26, speed: 4, up: 1.2, life: 0.8, size: 0.3, colors: [0xffffff, 0xfff0c0], gravity: 5 });
          fx.texts.add('KOEKOEK!', rp.x, rp.y + 2.8, 1, '#ffffff', 1.4); audio.sfx('boing', { vol: 0.8 }); audio.tone(520, 0.18, { type: 'square', vol: 0.12, slide: 260 }); ctx.shake(0.5);
          hud.toast('Een dikke kip landt op het touw!', 1600);
        }
      } else if (c.st === 'wobble') {
        chickDip = damp(chickDip, 0.6, 3, dt);
        if (c.t > 1.3) { c.st = 'walk'; c.t = 0; c.targetU = c.side === 0 ? 0.3 : 0.7; }
      } else if (c.st === 'walk') {
        const dir = Math.sign(c.targetU - c.u); c.u += dir * 0.2 * dt;
        if ((c.targetU - c.u) * dir <= 0) { c.u = c.targetU; c.st = 'pull'; c.t = 0; stats.chickenHelped = c.side; hud.toast(`🐔 De kip helpt ${names[c.side]}!`, 2000); fx.texts.add('KIP-KRACHT!', _v1.x, _v1.y + 3, 1, '#ffd24a', 1.3); audio.sfx('powerup', { vol: 0.5 }); }
      } else if (c.st === 'pull') {
        chickDip = damp(chickDip, 0.4, 3, dt);
        c.fx = (c.fx || 0) - dt; if (c.fx <= 0) { c.fx = 0.35; const rp = ropeAt(c.u, _v1); fx.particles.burst(rp.x, rp.y + 1.5, 0, { count: 4, speed: 2.5, up: 1.2, life: 0.9, size: 0.22, colors: [0xffffff, 0xfff0c0], gravity: 3 }); if (Math.random() < 0.4) audio.tone(480 + Math.random() * 200, 0.1, { type: 'square', vol: 0.06, slide: -120 }); }
      } else if (c.st === 'leave') {
        chickDip = damp(chickDip, 0, 3, dt);
        c.y = (c.y ?? 3) + 9 * dt; c.leaveX = (c.leaveX || 0) + (c.side ? 1 : -1) * 6 * dt;
        if (c.t > 1.6) { chick = null; chickObj.group.visible = false; return; }
      }
    }

    function fallStep(dt) {
      const p = pl[R.loser]; R.t += dt;
      const g = 26;
      if (R.state === 'drop') {
        p.vy -= g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y <= LAVA_Y + 0.4) { p.y = LAVA_Y + 0.4; lavaImpact(p); }
      } else if (R.state === 'lava') {
        if (R.t < 0.7 && Math.random() < dt * 30) fx.particles.emit(R.hitX + (Math.random() - 0.5) * 2, LAVA_Y + 0.2, (Math.random() - 0.5) * 1.5, 0, 3, 0, { life: 0.8, size: 0.3, color: Math.random() < 0.5 ? 0xff9a2a : 0xffe07a, gravity: 8 });
        if (R.t > 0.9) popOut(p);
      } else if (R.state === 'pop') {
        p.vy -= g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vy < 0 && p.y <= 0) { p.y = 0; landBurn(p); }
      } else if (R.state === 'burn') {
        R.burnT += dt;
        const bt = R.burnT;
        if (bt < 2.5) { p.x = R.tx + Math.sin(bt * 4.2) * 2.0; p.c.faceDir(Math.cos(bt * 4.2), 0.15); p.c.pose = 'scared'; p.c.speed = 1; }
        else if (p.flames.visible) {
          p.flames.visible = false; p.c.speed = 0; p.c.pose = 'sad';
          fx.particles.burst(p.x, 1.2, 0, { count: 22, speed: 2, up: 1.4, life: 1.4, size: 0.5, colors: [0x333333, 0x555555, 0x888888], gravity: -1.5 });
          fx.texts.add('tsssss...', p.x, 4.2, 1, '#cfcfcf', 1.1); audio.sfx('sizzle', { vol: 0.8 }); p.c.faceDir(p.i === 0 ? 1 : -1, 0);
        }
        if (bt < 2.5 && Math.random() < dt * 40) { // vlammen
          fx.particles.emit(p.x + (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.4, -0.5, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 2, 0.3, { life: 0.5, size: 0.4, color: [0xff6a10, 0xffb020, 0xffe680][(Math.random() * 3) | 0], gravity: -4 });
        }
        if (bt > 3.4) { R.state = 'end'; R.t = 0; }
      }
      // touw intrekken zodra het slachtoffer eruit knalt
      if (R.state === 'pop' || R.state === 'burn' || R.state === 'end') R.ropeVis = Math.max(0, R.ropeVis - dt * 1.4);
      if (R.state === 'lava') R.ropeVis = Math.max(0.6, R.ropeVis - dt * 0.2);
    }
    function endStep(dt) {
      R.t += dt; R.ropeVis = Math.max(0, R.ropeVis - dt * 1.4);
      if (R.matchOver) {
        if (R.t > 0.01 && !R._cheered) { R._cheered = true; W.cheer(true); audio.sfx('win', { vol: 0.6 }); for (let k = 0; k < 5; k++) fx.particles.burst(pl[R.winner].x + rand(-3, 3), 3 + rand(0, 3), rand(-1, 1), { count: 30, speed: 7, up: 1.2, life: 1.4, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 }); }
        if (R.t > 1.5) endMatch(R.winner, false);
      } else {
        if (R.t > 1.2) startRound();
      }
    }

    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; startRound(); }
      if (finished) { resultUpdate(dt); return; }
      if (T > 170) forceFinish();
      const inp = [pv.input(0), pv.input(1)];
      if (R.state === 'ready') {
        R.t += dt;
        if (R.t > R.readyLen) { R.state = 'tug'; audio.sfx('go', { vol: 0.5 }); }
      } else if (R.state === 'tug') tugStep(dt, inp);
      else if (R.state === 'end') endStep(dt);
      else fallStep(dt);
      visuals(dt);
    }

    // ---------------- visuals ----------------
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    function updateCamera(dt, cine) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = clamp(13.4 / (tanH * asp), 15, 34);
      let lx = 0, ly = 0.5, lk = 0.35;
      if (R.state === 'drop' || R.state === 'lava') { const p = pl[R.loser]; lx = p.x * 0.08; ly = -0.4; }
      else if (R.state === 'pop' || R.state === 'burn') { const p = pl[R.loser]; lx = p.x * 0.1; ly = 0.5; }
      camX = damp(camX, lx, 3, dt); camLy = damp(camLy, ly, 2.5, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.5;
      const zoom = 1;
      camPos.set(camX + sway, camLy + dist * 0.46 + 0.4, dist * 0.92 * zoom);
      camLook.set(camX, camLy + 0.3, 0);
      camera.position.copy(camPos); camera.lookAt(camLook);
    }

    const _vr = new THREE.Vector3();
    function visuals(dt) {
      const tugging = R.state === 'tug';
      const leadNow = lead;
      for (const p of pl) {
        const i = p.i, dir = i ? -1 : 1;
        // hop-fysica
        if (p.st === 'stand') {
          p.vy -= 22 * GRAV * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0 && p.vy < 0) p.vy = 0;
          { const toward = i === 0 ? leadNow : -leadNow; p.x = (i ? S0 : -S0) + dir * (toward > 0 ? toward * DD : toward * BACK); }
          if (R.state === 'end' || R.state === 'drop' || R.state === 'lava' || R.state === 'pop' || R.state === 'burn') { /* winnaar blijft staan */ }
        }
        const holder = p.holder, c = p.c;
        holder.position.set(p.x, p.y, 0);
        const eff = clamp(p.eff / 11, 0, 1.3);
        if (p.st === 'stand') {
          let lean = 0.08 + 0.22 * eff + p.jerk * 0.06;
          const dragged = tugging || R.state === 'ready' ? clamp((i === 0 ? leadV : -leadV) / VMAX, -1, 1) : 0;   // >0 = wordt naar de rand gesleept
          p.dragged = damp(p.dragged, dragged, 6, dt);
          lean += clamp(-p.dragged * 0.18, -0.2, 0.1);
          const danger = clamp(((i === 0 ? leadNow : -leadNow) - 0.55) / 0.4, 0, 1);   // dicht bij de rand
          let rz = dir * lean; let rx = 0;
          if (R.snapT > 0 && tugging) { rz = dir * lerp(0.2, 1.25, smoothstep(0, 0.35, 2 - R.snapT)); }
          if (danger > 0) { rz += Math.sin(T * 14 + i) * 0.12 * danger; rx = Math.sin(T * 9) * 0.05 * danger; if (Math.random() < dt * 8 * danger) fx.particles.emit(p.x + dir * 1.2, 0.1, (Math.random() - 0.5) * 3, dir * 1.5, 1.2, 0, { life: 0.7, size: 0.2, color: 0x8a7a72, gravity: 9 }); }
          holder.rotation.set(rx, 0, p.y > 0.05 ? rz * 0.6 : rz);
          if (R.state === 'ready' || R.state === 'tug') {
            c.pose = R.snapT > 0 ? 'sad' : danger > 0.25 ? 'scared' : R.state === 'ready' ? 'idle' : 'carry';
            c.speed = tugging && R.snapT <= 0 ? clamp(eff * 0.9 + Math.abs(p.dragged) * 0.5, 0, 1) : 0;
            c.faceDir(dir, 0);
          } else if (R.state === 'end' && R.matchOver && R.winner === i) { c.pose = 'cheer'; c.speed = 0; }
          else if (R.winner === i) { c.pose = 'cheer'; c.speed = 0; }
          // stof bij sleepvoeten
          if (tugging && p.dragged > 0.3 && Math.random() < dt * 14) fx.particles.dust(p.x - dir * 0.2, 0.05, (Math.random() - 0.5) * 0.8, 1, 0xa89888);
          if (tugging && p.rm > 0.7 && Math.random() < dt * 10) fx.particles.emit(p.x + dir * 0.9 + (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 1.2, 0, { life: 0.5, size: 0.22, color: i ? 0x8fb8ff : 0x7dffb0, gravity: -1 });
        } else if (p.st === 'fly' || p.st === 'fly2') {
          holder.rotation.z += p.spin * dt; holder.rotation.x += p.spin * 0.4 * dt;
          if (p.st === 'fly2' && Math.random() < dt * 40) fx.particles.emit(p.x, p.y + 0.8, 0, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 2, 0, { life: 0.6, size: 0.45, color: Math.random() < 0.5 ? 0xff7a14 : 0xffd24a, gravity: -3 });
        } else if (p.st === 'run') {
          holder.rotation.set(0, 0, 0);
        }
        if (p.burned && p.flames.visible) for (let k = 0; k < 3; k++) { const f = p.fl[k]; f.scale.set(1 + Math.sin(T * 25 + k) * 0.2, 1 + Math.sin(T * 31 + k * 2) * 0.35, 1); }
        // boost-aura
        p.aura.visible = p.boostT > 0 && !p.hidden;
        if (p.aura.visible) { p.aura.material.opacity = p.boostT < 0.8 ? (Math.sin(T * 30) > 0 ? 0.25 : 0.05) : 0.22; p.aura.scale.set(0.9 + Math.sin(T * 12) * 0.05, 1.35, 0.9); if (Math.random() < dt * 30) fx.particles.emit(p.x + (Math.random() - 0.5) * 1.2, 0.2, (Math.random() - 0.5) * 0.8, 0, 2.5, 0, { life: 0.5, size: 0.35, color: 0xff8a1c, gravity: -3 }); }
        c.update(dt);
        p.blob.visible = !p.hidden && p.st !== 'fly' && p.st !== 'fly2';
        p.blob.position.set(p.x, 0.04, 0);
        p.tag.visible = !p.hidden;
        p.tag.position.set(p.x, p.y + p.c.height * p.kS * 1.12 + 0.9, 0.5);
      }
      // touw berekenen
      const a = handMid(0), b = handMid(1);
      const taut = clamp((pl[0].eff + pl[1].eff) / 15, 0, 1);
      const sagBase = R.snapT > 0 ? 1.2 : lerp(1.0, 0.16, taut) + (R.state === 'ready' ? 0.4 : 0);
      const wig = (1 - taut) * 0.12;
      const tens = tension;
      for (let k = 0; k <= ROPE_N; k++) {
        const u = k / ROPE_N, v = pts[k];
        v.lerpVectors(a, b, u);
        let sag = sagBase * 4 * u * (1 - u);
        if (chick && chick.st !== 'fall') sag += chickDip * 0.9 * Math.exp(-Math.pow((u - chick.u) / 0.1, 2));
        v.y += -sag + Math.sin(u * 9 + T * 3) * wig * Math.sin(u * Math.PI) + (R.state === 'tug' ? Math.sin(u * 40 - T * 60) * 0.015 * tens : 0);
        v.z += Math.sin(u * 6 + T * 2) * wig * 0.5 * Math.sin(u * Math.PI);
      }
      // gebroken touw: twee hangende helften
      if (R.snapT > 0 && tugging) {
        const k = clamp((2 - R.snapT) / 0.9, 0, 1);
        for (let h = 0; h < 2; h++) {
          const arr = h ? halfB : halfA, hand = h ? b : a, d = h ? -1 : 1;
          const endX = d * (CLIFF_E - 0.7);   // het losse eind hangt net over de rand
          for (let q = 0; q < 16; q++) {
            const u = q / 15, wob = Math.sin(T * 5 + h + u * 4) * 0.12 * (1 - k);
            const y = u < 0.85 ? lerp(hand.y, 0.2, Math.min(1, u / 0.5)) + wob : 0.2 - ((u - 0.85) / 0.15) * (0.4 + k * 2.2);
            arr[q].set(lerp(hand.x, endX, u), y, hand.z + Math.sin(u * 5 + h) * 0.2 * k);
          }
        }
        layRope([[halfA, 16], [halfB, 16]]);
      } else if (R.ropeVis < 0.999 && R.winner >= 0) {
        // intrekken richting de winnaar
        const wEnd = R.winner === 0 ? a : b;
        for (let k = 0; k <= ROPE_N; k++) { _vr.copy(pts[k]).sub(wEnd).multiplyScalar(R.ropeVis).add(wEnd); pts[k].copy(_vr); }
        rope.visible = R.ropeVis > 0.02; layRope([[pts, ROPE_N + 1]]);
      } else { rope.visible = true; layRope([[pts, ROPE_N + 1]]); }
      // spanning-kleur
      ropeMat.emissive.setRGB(tens * (0.5 + 0.5 * Math.sin(T * 25)) * 0.9, tens * 0.1, 0);
      // vlag
      if (!F.fall) {
        const mp = ropeAt(0.5, _v2);
        flag.position.copy(mp); flag.position.y -= 0.05;
        flag.rotation.z = damp(flag.rotation.z, -leadV * 2.2 + Math.sin(T * 2.4) * 0.05, 8, dt);
        flag.visible = F.vis && rope.visible && !(R.state === 'end' && R.ropeVis < 0.05);
        F.x = flag.position.x; F.y = flag.position.y;
      } else {
        F.vy -= 24 * dt; F.y += F.vy * dt; F.rot += dt * 5; flag.position.set(F.x, F.y, 0); flag.rotation.z = F.rot * 0.3;
        if (F.y < LAVA_Y + 0.5 && flag.visible) { flag.visible = false; W.splash(F.x, 0, 0.5); audio.sfx('sizzle', { vol: 0.7 }); fx.texts.add('Fsss!', F.x, LAVA_Y + 2.4, 1, '#ffb030', 1.1); }
      }
      { const gp = flagGeo.attributes.position, amp = 0.09 + Math.abs(leadV) * 0.4; for (let k = 0; k < gp.count; k++) { const x = flagBase[k * 3], y = flagBase[k * 3 + 1]; const top = 1 - (y + 0.65) / 1.3; gp.setZ(k, Math.sin(T * 6 + x * 3 + y * 1.5) * amp * top); } gp.needsUpdate = true; }
      // kip
      if (chick) {
        const c = chick, g = chickObj.group;
        if (c.st === 'fall') { g.position.set(ropeAt(c.u, _v1).x, c.y, 0.2); g.rotation.set(0, 0, 0); }
        else if (c.st === 'leave') { const rp = ropeAt(c.u, _v1); g.position.set(rp.x + (c.leaveX || 0), (c.y ?? rp.y) , 0.2); }
        else { const rp = ropeAt(c.u, _v1); const ahead = ropeAt(c.u + 0.03, _v2); g.position.set(rp.x, rp.y - 0.05 + (c.st === 'walk' ? Math.abs(Math.sin(T * 12)) * 0.12 : 0), 0.15); g.rotation.z = Math.atan2(ahead.y - rp.y, ahead.x - rp.x) * (c.st === 'walk' && c.targetU < c.u ? -1 : 1) * 0.5; }
        // kijkrichting
        const faceX = c.st === 'walk' ? Math.sign(c.targetU - c.u) : c.st === 'pull' ? (c.side === 0 ? -1 : 1) : c.st === 'leave' ? (c.side ? 1 : -1) : 0;
        g.rotation.y = damp(g.rotation.y, faceX === 0 ? 0 : faceX * Math.PI / 2, 10, dt);
        const flapping = c.st === 'pull' || c.st === 'fall' || c.st === 'leave' || c.st === 'wobble';
        const fa = flapping ? 0.5 + 0.8 * Math.abs(Math.sin(T * (c.st === 'pull' ? 22 : 30))) : 0.1;
        chickObj.wings[0].rotation.z = fa; chickObj.wings[1].rotation.z = -fa;
        chickObj.body.rotation.z = c.st === 'wobble' ? Math.sin(T * 14) * 0.25 : c.st === 'pull' ? Math.sin(T * 24) * 0.08 : 0;
        chickObj.body.rotation.x = c.st === 'pull' ? -0.25 : 0;
        chickObj.head.rotation.x = c.st === 'pull' ? 0.5 + Math.sin(T * 24) * 0.15 : Math.sin(T * 9) * 0.1;
        chickObj.legs.forEach((l, k) => { l.rotation.x = c.st === 'walk' ? Math.sin(T * 14 + k * Math.PI) * 0.7 : 0; });
      }
      // surge-orbs
      for (let i = 0; i < 2; i++) {
        const o = surge[i]; if (!o) continue;
        const hp = handMid(i);
        const k = clamp(o.t / o.travel, 0, 1);
        const centre = flag.position;
        const spr = orbs[i];
        const tmp = _v1.lerpVectors(centre, hp, smoothstep(0, 1, k));
        spr.position.set(tmp.x, tmp.y + 0.15, 0.4);
        const pulse = 1 + Math.sin(T * 18) * 0.12;
        const waiting = o.t >= o.travel - 0.15;
        const sc = (o.state === 'done' ? 2.4 + (0.4 - o.fade) * 6 : 1.3 + k * 0.9) * pulse * (waiting ? 1.25 : 1);
        spr.scale.set(sc, sc, 1); spr.material.opacity = o.state === 'done' ? clamp(o.fade / 0.4, 0, 1) : 1;
        const ring = orbRings[i]; ring.visible = waiting && o.state !== 'done';
        if (ring.visible) { ring.position.set(hp.x, hp.y, 0.5); ring.lookAt(camera.position); const rs = 1.8 - ((o.t - (o.travel - 0.15)) % 0.4) * 2.2; ring.scale.setScalar(Math.max(0.6, rs)); ring.material.opacity = 0.9; }
        if (o.state !== 'done' && Math.random() < dt * 40) fx.particles.emit(spr.position.x, spr.position.y, 0.3, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0, { life: 0.45, size: 0.25, color: o.btn === 'a' ? 0xffd24a : 0x6fe8ff, gravity: 0 });
      }
      updateDom();
      W.update(T + introT, dt, camera.position);
      updateCamera(dt);
    }
    function resultUpdate(dt) {
      T += dt; R.ropeVis = Math.max(0, R.ropeVis - dt);
      visuals(dt);
    }
    function introUpdate(dt) {
      introT += dt;
      visuals(dt);
    }
    refreshHud();
    visuals(0.016);

    return {
      update, resultUpdate, introUpdate,
      onCountdown() { buildDom(); },
      onSwap() { for (const p of pl) { fx.particles.burst(p.x, 2, 0, { count: 18, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); } },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { lead = clamp(lead + (i === 0 ? 0.3 : -0.3), -0.95, 0.95); pl[i].pw = 0; pl[i].rm = 0; pl[i].frozen = 1.2; ctx.shake(0.4); fx.texts.add('-1', pl[i].x, 4.5, 1, '#ff5a5a', 1.4); } });
      },
      celebrate(w) {
        pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; W.cheer(true);
      },
      dispose() { if (dom.root) dom.root.remove(); },
      dbg: {
        state: () => ({ T, round: R.n, rstate: R.state, lead, leadV, tension, left: R.left, snapT: R.snapT, wins: pl.map((p) => p.wins), eff: pl.map((p) => p.eff), rm: pl.map((p) => p.rm), boost: pl.map((p) => p.boostT), chick: chick ? chick.st : null, surge: surge.map((o) => (o ? { btn: o.btn, t: o.t, travel: o.travel, state: o.state } : null)), finished, hist, stats, pos: pl.map((p) => [p.x, p.y]), burned: pl.map((p) => p.burned), timeUp: R.timeUp }),
        setLead: (v) => { lead = v; },
        forceSnap: () => triggerSnap(),
        forceChick: (side = 0) => { R.plan = { at: 0, side }; },
        forceSurge: () => { R.nextSurge = 0; },
        forceBoost: (i) => giveBoost(i),
        pl,
      },
    };
  },
};

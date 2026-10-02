import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, smoothstep, rand, pick, TAU, mulberry32 } from '../engine/util.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { buildCellar, buildScrew, buildCage, wrench, PITCH } from './screws_world.js';
import { makeBars } from './screws_bars.js';

// Schroef-Duel (Silly Screws-achtig): stamp je reuzenschroef naar beneden. Wie het eerst beneden is, wint.
// A en B om en om = ritme (extra draaiing). Te snel mashen = vastgeroest. Raaf, moersleutels, roestvlekken, aardbeving, gnoom.

const COL_X = [-6.8, 6.8];
const Y0 = 24.0, BLOCK_H = 2.2, HEAD_FINAL = BLOCK_H + 1.0, TRAVEL = Y0 - HEAD_FINAL;
const REQ = 225;                         // draai-eenheden tot de schroef beneden is
const MAXT = 110;                        // noodstop: wie dan het diepst zit wint
const PATCH_P = [0.19, 0.41, 0.62, 0.82];
const PATCH_SKIP = 5;                    // eenheden die je overslaat bij een geslaagde timing
const SHAFT_LEN = 25;
const NEEDLE_SPEED = 1.25, ZONE = 0.15;
const CAM_FOV = 50;

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export default {
  id: 'screws',
  name: 'Schroef-Duel',
  giver: 'Smid Schroef',
  icon: '🔩',
  mode: 'pvp',
  time: 50,
  music: 'game',
  twists: ['invert', 'swapab', 'drunk', 'bodyswap', 'turbo', 'slowmo', 'lowgrav', 'deurman'],
  blurb: 'In de kelder van het kasteel staan twee <b>reuzenschroeven</b>. Stamp erop om je schroef <b>naar beneden te draaien</b>: de eerste die helemaal beneden is, rinkelt de bel en wint! Stamp <b>A en B om en om</b> voor een ritme-bonus, maar mash niet te wild, want dan <b>roest</b> je schroef vast. Pas op voor de <b>raaf</b>, pak de <b>moersleutels</b> en timing de <b>roestvlekken</b>!',
  controls: ['{a} / {b} stampen (om en om = ritme!)', '{move} links/rechts: ontwijk en pak dingen', 'omlaag: veeg raaf-poep weg'],
  tip: 'Een gouden moersleutel is turbo! Wie ver achterstaat krijgt hulp van een gnoom met een boor.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name), css = players.map((p) => p.css);
    const rng = ctx.rng;
    const L = ctx.lights('indoor', { shadow: 28, center: [0, 12, 0], fogNear: 55, fogFar: 150 });
    L.hemi.intensity = 1.05; L.sun.intensity = 1.5; L.sun.position.set(14, 44, 26);
    camera.fov = CAM_FOV; camera.updateProjectionMatrix();
    scene.fog.color.set(0x2a1c14);

    const world = buildCellar(ctx, { colX: COL_X, names, css });

    // ---------- schroeven ----------
    const patchP = PATCH_P.map((p) => p + (rng() - 0.5) * 0.03);
    const collarDepths = patchP.map((p) => TRAVEL * (1 - p));
    const pl = [0, 1].map((i) => {
      const sc = buildScrew(i, { shaftLen: SHAFT_LEN, collarDepths, color: PLAYER_COLORS[i] });
      sc.group.position.set(COL_X[i], Y0, 0); scene.add(sc.group);
      const cage = buildCage(Y0 + 4.2, BLOCK_H); cage.position.x = COL_X[i]; scene.add(cage);
      cage.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow && false; });
      // poppetje
      const c = ctx.make.brother(i); const sz = ctx.pvp.size(i); const base = 2.7 / c.height;
      c.group.scale.setScalar(base * sz); scene.add(c.group); c.faceDir(0, 1);
      // markeringen op de kop
      const mk = (col) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; sc.group.add(m); return m; };
      const mWrench = mk(0xffe14a), mPoop = mk(0xcfe8a0);
      const goo = new THREE.Mesh(new THREE.CircleGeometry(2.7, 26), new THREE.MeshStandardMaterial({ color: 0xe9efd6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.0, emissive: 0x6a7a50, emissiveIntensity: 0.3 })); goo.rotation.x = -Math.PI / 2; goo.position.y = 0.03; goo.visible = false; sc.group.add(goo);
      // meters (ritme + roest), buitenkant van de kooi
      const mt = new THREE.Group(); scene.add(mt);
      const panel = (y, col, label) => {
        const g = new THREE.Group(); g.position.y = y; mt.add(g);
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(4.25, 0.74), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.55, depthWrite: false })); g.add(edge);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 0.6), new THREE.MeshBasicMaterial({ color: 0x120a06, transparent: true, opacity: 0.85, depthWrite: false })); back.position.z = 0.005; g.add(back);
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.42), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, depthWrite: false })); fill.position.z = 0.012; g.add(fill);
        const lt = labelTex(label); const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false })); lab.position.set(0, 0.62, 0.02); g.add(lab);
        return { g, fill, back };
      };
      const mR = panel(0, 0x7dff6a, 'RITME'), mX = panel(-1.05, 0xff8a2a, 'ROEST');
      // timing-meter bij roestvlekken
      const gg = new THREE.Group(); gg.visible = false; scene.add(gg);
      const gf = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.95), new THREE.MeshBasicMaterial({ color: 0xffe9b0, depthTest: false })); gf.renderOrder = 24; gg.add(gf);
      const gb = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 0.75), new THREE.MeshBasicMaterial({ color: 0x1c100a, depthTest: false })); gb.renderOrder = 25; gb.position.z = 0.005; gg.add(gb);
      const gz = new THREE.Mesh(new THREE.PlaneGeometry(4.3 * ZONE * 2, 0.6), new THREE.MeshBasicMaterial({ color: 0x4cff6a, depthTest: false })); gz.renderOrder = 26; gz.position.z = 0.01; gg.add(gz);
      const gn = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.15), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); gn.renderOrder = 27; gn.position.z = 0.02; gg.add(gn);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: labelTex('ROESTVLEK! Druk in het groen!'), transparent: true, depthTest: false })); gl.renderOrder = 27; gl.position.set(0, 1.0, 0.02); gg.add(gl);
      return {
        i, sc, c, cage, mWrench, mPoop, goo, mt, mR, mX, gg, gn, gz, base, sz,
        units: 0, shown: 0, rhythm: 0, rust: 0, jam: 0, lastT: -9, lastBtn: '', hopT: -1, hopFoot: 0, dip: 0, offX: 0, gooV: 0, wipes: 0, turbo: 0, gnome: 0,
        cleared: patchP.map(() => false), atPatch: -1, patchT: 0, lockT: 0, spinAng: 0, stompCount: 0, tintRust: 0, slipT: 0, wob: 0, lastMilestone: 0, shake: 0,
        hopV: 0, hy: Y0, quakeMiss: 0, stallT: 0, rhythmTier: 0,
      };
    });
    function labelTex(txt) {
      const t = document.createElement('canvas'); t.width = 256; t.height = 64; const g = t.getContext('2d');
      g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(20,8,4,.95)'; g.lineJoin = 'round'; g.strokeText(txt, 128, 34, 246); g.fillStyle = '#ffe9b0'; g.fillText(txt, 128, 34, 246);
      const tx = new THREE.CanvasTexture(t); tx.colorSpace = THREE.SRGBColorSpace; return tx;
    }
    const bars = makeBars(ctx, { colors: PLAYER_COLORS, vertical: true });

    // ---------- toestand ----------
    let T = 0, done = false, phase = 'play', winner = null, winT = 0, introT = 0, cine = 1, resultT = 0;
    let finishCalled = false;
    const E = { ravenT: 7 + rng() * 3, raven: null, blob: null, wrenchT: 5 + rng() * 2, wrench: null, quakeT: 21 + rng() * 6, quake: 0, quakes: 0, gnomeCd: [6, 6], gnomes: [0, 0], gnome: [null, null], stalled: 0 };
    let hudT = 0; const lastInfo = ['', ''];
    const tmp = new THREE.Vector3();
    const headY = (p) => Y0 - TRAVEL * clamp(p.shown / REQ, 0, 1);
    const gSpeed = (i) => ctx.pvp.speed(i);
    const gGrav = () => 1 + (1 / Math.max(0.3, ctx.pvp.gravity) - 1) * 0.28;
    const note = (i, text, color = '#ffe14a', s = 1, dy = 4.2) => fx.texts.add(text, COL_X[i] + pl[i].offX, headY(pl[i]) + dy, 1.5, color, s);

    hud.setTimer(MAXT, 15); hud.setScore('🔩 Draai je schroef naar beneden!');

    // ---------- stampen ----------
    function startHop(p, btn) {
      p.hopT = 0; p.hopFoot = btn === 'a' ? 0 : 1; p.hopV = 0;
    }
    function sparks(p, big = 1) {
      const y = BLOCK_H + 0.7;
      if (p.sc.wood) fx.particles.burst(COL_X[p.i], y, 1.8, { count: Math.round(8 * big), speed: 3.5, up: 1.1, life: 0.6, size: 0.26, colors: [0xf0d6a0, 0xd9a860, 0xffffff], gravity: 9 });
      else fx.particles.burst(COL_X[p.i], y, 1.8, { count: Math.round(10 * big), speed: 4.5, up: 1.2, life: 0.5, size: 0.2, colors: [0xffe9a0, 0xffb040, 0xffffff], gravity: 10 });
    }
    function stomp(p, btn) {
      const gap = T - p.lastT; p.lastT = T;
      const alt = btn !== p.lastBtn; p.lastBtn = btn;
      if (p.lockT > 0) return;
      startHop(p, btn);
      if (p.jam > 0) { p.jam = Math.min(2.6, p.jam + 0.22); audio.sfx('buzz', { vol: 0.25 }); fx.particles.dust(COL_X[p.i], headY(p) + 0.3, 0.5, 2, 0xa05a2a); return; }
      if (p.atPatch >= 0) { patchAttempt(p); return; }
      const boosted = p.turbo > 0 || p.gnome > 0;
      let mult = 1;
      if (gap < 0.16 && !boosted) {
        p.rust += 0.3; p.rhythm *= 0.55; mult = 0.35;
        if (p.rust >= 1) {
          p.jam = 1.5; p.rust = 0.25; p.rhythm = 0;
          note(p.i, 'VASTGEROEST!', '#ff7a3a', 1.3); audio.sfx('creak', { vol: 0.6 }); audio.sfx('hurt', { vol: 0.4 }); ctx.shake(0.4);
          fx.particles.burst(COL_X[p.i], headY(p) - 0.5, 0.5, { count: 26, speed: 3.5, up: 0.8, life: 0.8, size: 0.35, colors: [0x9a4a1c, 0xc8703a, 0x6a3010], gravity: 6 });
        }
      } else if (gap < 0.95) {
        p.rust = Math.max(0, p.rust - 0.05);
        if (alt && gap >= 0.16 && gap <= 0.62) { p.rhythm = Math.min(1, p.rhythm + 0.17); mult = 1 + p.rhythm; }
        else if (alt) { mult = 1 + p.rhythm * 0.6; p.rhythm = Math.max(0, p.rhythm - 0.05); }
        else { p.rhythm = Math.max(0, p.rhythm - 0.12); mult = 1 + p.rhythm * 0.3; }
      } else { p.rhythm = Math.max(0, p.rhythm - 0.4); }
      if (boosted) mult *= p.turbo > 0 ? 2.2 : 1.7;
      mult *= gSpeed(p.i) * gGrav();
      if (p.gooV > 0.05) {
        mult *= 0.5;
        if (rng() < 0.35) { slip(p); return; }
      }
      p.units = addUnits(p, mult);
      p.stompCount++; p.stallT = 0;
      // ritme-feedback
      const tier = p.rhythm >= 1 ? 3 : p.rhythm >= 0.65 ? 2 : p.rhythm >= 0.35 ? 1 : 0;
      if (tier > p.rhythmTier && tier >= 1) { note(p.i, tier === 3 ? 'PERFECT RITME!' : tier === 2 ? 'RITME x2!' : 'RITME!', tier === 3 ? '#ffe14a' : '#9dff7a', 0.85 + tier * 0.15, 5.0); audio.sfx(tier === 3 ? 'powerup' : 'ding', { vol: 0.5 }); }
      p.rhythmTier = tier;
      audio.sfx('thud', { vol: 0.35 + p.rhythm * 0.25, rate: 0.85 + p.rhythm * 0.5 });
      if (p.rhythm > 0.2) audio.tone(200 + p.rhythm * 420 + (alt ? 60 : 0), 0.09, { type: 'triangle', vol: 0.09 });
      sparks(p, 1 + p.rhythm);
    }
    function addUnits(p, d) {
      let u = p.units + d;
      // roestvlek in de weg?
      for (let j = 0; j < patchP.length; j++) {
        if (p.cleared[j]) continue;
        const cap = patchP[j] * REQ;
        if (u >= cap) { u = cap; if (p.atPatch !== j) { p.atPatch = j; p.patchT = 0; p.lockT = 0; note(p.i, 'ROESTVLEK!', '#ff9a3a', 1.2); audio.sfx('creak', { vol: 0.5 }); } }
        break;
      }
      return Math.min(REQ, u);
    }
    function slip(p) {
      p.units = Math.max(0, p.units - 4); p.slipT = 0.6; p.rhythm = 0; p.offX += (rng() < 0.5 ? -1 : 1) * 1.3;
      note(p.i, 'SLIBBER!', '#d8f09a', 1.1); audio.sfx('boing', { vol: 0.5, rate: 1.4 }); audio.sfx('miss', { vol: 0.3 });
      fx.particles.burst(COL_X[p.i] + p.offX, headY(p) + 0.3, 0.5, { count: 10, speed: 2.5, up: 1, life: 0.6, size: 0.3, colors: [0xe9efd6, 0xb6c88a], gravity: 8 });
    }
    function needlePos(p) { const u = (p.patchT * NEEDLE_SPEED) % 2; return u < 1 ? u : 2 - u; }
    function patchAttempt(p) {
      if (p.patchT < 0.3) return;
      const n = needlePos(p);
      if (Math.abs(n - 0.5) <= ZONE) {
        const j = p.atPatch; p.cleared[j] = true; p.atPatch = -1; p.units = Math.min(REQ, p.units + PATCH_SKIP);
        const col = p.sc.collars[j]; col.g.visible = false;
        fx.particles.burst(COL_X[p.i], BLOCK_H + 0.8, 0.5, { count: 34, speed: 5, up: 1.3, life: 0.9, size: 0.34, colors: [0xffd070, 0xffffff, 0xff9a3a, 0x4cff6a], gravity: 8 });
        note(p.i, 'KNAP! Erdoor!', '#4cff6a', 1.25); audio.sfx('powerup', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.5 }); ctx.shake(0.25);
        p.rhythm = Math.min(1, p.rhythm + 0.2);
      } else {
        p.lockT = 0.55; note(p.i, 'KRAAK!', '#ff6a4a', 1); audio.sfx('buzz', { vol: 0.5 }); ctx.shake(0.18);
        fx.particles.burst(COL_X[p.i], BLOCK_H + 0.8, 0.5, { count: 12, speed: 3, up: 0.8, life: 0.6, size: 0.3, colors: [0x9a4a1c, 0xc8703a], gravity: 6 });
      }
    }

    // ---------- raaf ----------
    const raven = (() => {
      const g = new THREE.Group(); const bm = mat(0x15121c, { flatShading: false }), bk = mat(0xf0a830);
      g.add(mesh(new THREE.SphereGeometry(0.75, 10, 8), bm, { scale: [1.2, 0.8, 0.8], cast: false }));
      const hd = mesh(new THREE.SphereGeometry(0.42, 10, 8), bm, { pos: [1.0, 0.35, 0], cast: false }); g.add(hd);
      g.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 5), bk, { pos: [1.5, 0.28, 0], rot: [0, 0, -Math.PI / 2], cast: false }));
      for (const sz2 of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [1.25, 0.48, sz2 * 0.24] }));
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.12, 0.5), bm, { pos: [-1.2, 0.0, 0], rot: [0, 0, 0.25], cast: false }));
      const wm = new THREE.MeshStandardMaterial({ color: 0x1d1a28, side: THREE.DoubleSide, flatShading: true });
      const wings = [1, -1].map((sd) => { const pv = new THREE.Group(); pv.position.set(0.1, 0.2, sd * 0.5); const w = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 2.4), wm); w.position.z = sd * 1.2; pv.add(w); g.add(pv); return { pv, sd }; });
      g.scale.setScalar(1.5); g.visible = false; scene.add(g);
      return { g, wings };
    })();
    const blobMesh = mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf1f4e4, emissive: 0x8a9a60, emissiveIntensity: 0.35, roughness: 0.2, flatShading: false }), { cast: false, scale: [0.8, 1.2, 0.8] }); blobMesh.visible = false; scene.add(blobMesh);

    function spawnRaven() {
      const lead = pl[0].units - pl[1].units;
      const tgt = Math.abs(lead) > 8 && rng() < 0.65 ? (lead > 0 ? 0 : 1) : (rng() < 0.5 ? 0 : 1);
      const dir = rng() < 0.5 ? 1 : -1;
      E.raven = { i: tgt, dir, x: -dir * 30, off: (rng() * 2 - 1) * 1.7, dropped: false, t: 0, y: headY(pl[tgt]) + 9.5 };
      raven.g.visible = true; audio.tone(520, 0.25, { type: 'sawtooth', vol: 0.07, slide: -240 }); hud.toast('Een raaf! Hij heeft honger... of iets anders', 1700);
    }
    function updateRaven(dt) {
      const r = E.raven;
      if (r) {
        r.t += dt; r.x += r.dir * 15.5 * dt; r.y = damp(r.y, headY(pl[r.i]) + 9.5 + Math.sin(r.t * 4) * 0.5, 4, dt);
        raven.g.position.set(r.x, r.y, 7); raven.g.rotation.y = r.dir > 0 ? 0 : Math.PI;
        const f = Math.sin(r.t * 17) * 0.9; raven.wings[0].pv.rotation.x = f; raven.wings[1].pv.rotation.x = -f;
        const tx = COL_X[r.i] + r.off, p = pl[r.i];
        const dist = (tx - r.x) * r.dir;
        if (!r.dropped && dist < 9) { p.mPoop.visible = true; }
        if (!r.dropped && dist <= 0) {
          r.dropped = true; E.blob = { i: r.i, x: tx, y: r.y - 0.8, vy: -2 }; blobMesh.visible = true; audio.sfx('whoosh', { vol: 0.3, rate: 1.4 }); audio.tone(300, 0.2, { type: 'square', vol: 0.06, slide: -180 });
          note(r.i, 'PLETS!', '#e9efd6', 0.8, 7);
        }
        if (Math.abs(r.x) > 32) { E.raven = null; raven.g.visible = false; }
        if (p.mPoop.visible) { p.mPoop.position.x = r.off; p.mPoop.scale.setScalar(1 + Math.sin(T * 14) * 0.12); }
      }
      const b = E.blob;
      if (b) {
        const p = pl[b.i], hy = headY(p);
        b.vy -= 24 * dt; b.y += b.vy * dt; blobMesh.position.set(b.x, b.y, 0.5); blobMesh.rotation.y += dt * 4;
        if (b.y <= hy + 0.5) {
          blobMesh.visible = false; E.blob = null; p.mPoop.visible = false;
          const hit = Math.abs(p.offX + COL_X[b.i] - b.x) < 1.3 && p.sz >= 0;
          fx.particles.burst(b.x, hy + 0.3, 0.5, { count: 22, speed: 4, up: 1.2, life: 0.7, size: 0.4, colors: [0xf1f4e4, 0xc9d8a0, 0xffffff], gravity: 9 });
          audio.sfx('splash', { vol: 0.6, rate: 1.5 }); audio.sfx('thud', { vol: 0.3 });
          if (hit) { p.gooV = 1; p.wipes = 0; p.c.pose = 'scared'; ctx.shake(0.3); note(b.i, 'GLAD! Veeg met ' + '▼', '#d8f09a', 1.1, 5.2); hud.toast(`${names[b.i]} is bepoept! Veeg de poep weg (omlaag)`, 2000); }
          else note(b.i, 'Gemist!', '#ffffff', 0.9, 4.5);
        }
      }
    }

    // ---------- moersleutel ----------
    const wr = { silver: wrench(0xc9d0dc, 1.15), gold: wrench(0xffd23f, 1.35) };
    for (const k of ['silver', 'gold']) { wr[k].visible = false; scene.add(wr[k]); }
    function spawnWrench() {
      const lead = pl[0].units - pl[1].units;
      const tgt = Math.abs(lead) > 6 ? (lead > 0 ? 1 : 0) : (rng() < 0.5 ? 0 : 1);
      const trail = Math.abs(lead) > 14;
      const gold = rng() < (trail ? 0.55 : 0.22);
      E.wrench = { i: tgt, gold, off: (rng() * 2 - 1) * 1.7, y: headY(pl[tgt]) + 12, state: 'fall', t: 0, vx: 0, vy: 0 };
      pl[tgt].mWrench.visible = true; pl[tgt].mWrench.material.color.set(gold ? 0xffd23f : 0xffffff);
      wr.silver.visible = !gold; wr.gold.visible = gold;
      audio.sfx('sparkle', { vol: 0.4 });
      note(tgt, gold ? 'GOUDEN SLEUTEL!' : 'Moersleutel!', gold ? '#ffd23f' : '#cfd8e8', 1, 8.5);
    }
    function updateWrench(dt) {
      const w = E.wrench; if (!w) return;
      const p = pl[w.i], hy = headY(p), obj = w.gold ? wr.gold : wr.silver; w.t += dt;
      const wx = COL_X[w.i] + w.off;
      p.mWrench.position.x = w.off; p.mWrench.scale.setScalar(1 + Math.sin(T * 10) * 0.1);
      if (w.state === 'fall') {
        w.y -= 7.5 * dt; obj.position.set(wx, w.y, 0.5); obj.rotation.z += dt * 7; obj.rotation.y = Math.sin(T * 3) * 0.6;
        if (rng() < dt * 12) fx.particles.emit(wx + (rng() - 0.5) * 0.6, w.y, 0.5, 0, 0.2, 0, { life: 0.4, size: 0.22, color: w.gold ? 0xffe680 : 0xffffff, gravity: 0 });
        const near = w.y <= hy + 2.4 && Math.abs(p.offX + COL_X[w.i] - wx) < 1.25;
        if (near) {
          obj.visible = false; p.mWrench.visible = false; E.wrench = null;
          if (w.gold) {
            p.turbo = 5; note(w.i, 'TURBO!!', '#ffd23f', 1.6, 5.5); hud.toast(`${names[w.i]} pakt de gouden sleutel: TURBO!`, 1800); audio.sfx('powerup', { vol: 0.9 }); audio.sfx('win', { vol: 0.3 });
          } else {
            p.units = addUnits(p, 14); note(w.i, '+14 KLONG!', '#cfe8ff', 1.3, 5.5); audio.sfx('powerup', { vol: 0.6 });
          }
          fx.particles.burst(COL_X[w.i] + p.offX, hy + 2, 0.8, { count: 30, speed: 5, up: 1.2, life: 0.9, size: 0.35, colors: w.gold ? [0xffd23f, 0xffffff, 0xff9a3a] : [0xcfe8ff, 0xffffff], gravity: 6 });
          ctx.shake(0.2);
        } else if (w.y <= hy + 0.5) {
          w.state = 'clang'; w.t = 0; w.vy = 6; w.vx = (rng() < 0.5 ? -1 : 1) * 4; p.mWrench.visible = false; audio.sfx('hit', { vol: 0.5 }); audio.sfx('thud', { vol: 0.4, rate: 1.5 });
          fx.particles.burst(wx, hy + 0.4, 0.5, { count: 12, speed: 4, up: 1.2, life: 0.5, size: 0.22, colors: [0xffffff, 0xffe9a0], gravity: 10 });
          note(w.i, 'Gemist!', '#ffffff', 0.9, 4.5);
        }
      } else {
        w.vy -= 24 * dt; w.y += w.vy * dt; obj.position.x += w.vx * dt; obj.position.y = w.y; obj.rotation.z += dt * 9;
        if (w.t > 1.2) { obj.visible = false; E.wrench = null; }
      }
    }

    // ---------- gnoom met boor ----------
    function makeGnome(i) {
      const g = new THREE.Group(); const c = ctx.make.npc('dwarf'); c.group.scale.setScalar(2.3); c.faceDir(i ? -1 : 1, 0); c.pose = 'push'; g.add(c.group);
      const plat = mesh(new THREE.BoxGeometry(3.6, 0.45, 2.4), mat(0x8a5a30), { pos: [0, -0.22, 0] }); g.add(plat);
      for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 40, 4), mat(0x25252c), { cast: false, pos: [sx * 1.6, 20, 0] }));
      const dir = i ? -1 : 1;
      const drill = new THREE.Group(); drill.position.set(0, 1.45, 0.6); drill.rotation.y = dir * 0.4; g.add(drill);
      drill.add(mesh(new THREE.BoxGeometry(1.3, 0.65, 0.6), mat(0xe8742a), { cast: false, pos: [dir * 0.5, 0, 0] }));
      drill.add(mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), mat(0x2b2b30), { cast: false, pos: [dir * 0.1, -0.6, 0] }));
      const bit = new THREE.Group(); bit.position.x = dir * 2.9; drill.add(bit);
      const bm = new THREE.MeshStandardMaterial({ color: 0xc9d0dc, metalness: 0.85, roughness: 0.3, flatShading: true });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.0, 6), bm); rod.rotation.z = Math.PI / 2; rod.position.x = dir * -0.6; bit.add(rod);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 6), bm); tip.rotation.z = -dir * Math.PI / 2; tip.position.x = dir * 1.3; bit.add(tip);
      for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 4, 8), bm); r.rotation.y = Math.PI / 2; r.position.x = dir * (0.9 - k * 0.55); bit.add(r); }
      g.userData = { c, bit, dir };
      scene.add(g); return g;
    }
    function updateGnomes(dt) {
      for (let i = 0; i < 2; i++) {
        const p = pl[i], o = pl[1 - i];
        E.gnomeCd[i] -= dt;
        const g = E.gnome[i];
        if (!g && E.gnomeCd[i] <= 0 && E.gnomes[i] < 3 && o.units - p.units >= REQ * 0.14 && phase === 'play') {
          const ng = makeGnome(i); E.gnome[i] = ng; E.gnomes[i]++; ng.userData.t = 0; p.gnome = 6.5;
          note(i, 'Een gnoom komt helpen!', '#ffd9a0', 1.1, 6.2); hud.toast(`Een vriendelijke gnoom helpt ${names[i]} met zijn boor!`, 2200); audio.sfx('powerup', { vol: 0.6 }); audio.sfx('sparkle', { vol: 0.6 });
        }
        if (g) {
          const u = g.userData; u.t += dt;
          const sg = i ? 1 : -1, hy = headY(p);
          const inT = smoothstep(0, 0.5, u.t), outT = smoothstep(6.0, 6.5, u.t);
          const sc = inT * (1 - outT) + 0.001; g.scale.setScalar(sc);
          g.position.set(COL_X[i] + sg * 7.6, hy - 1.45, 2.4);
          u.c.update(dt); u.bit.rotation.x += dt * 30;
          if (u.t > 0.5 && u.t < 6.2 && rng() < dt * 25) fx.particles.emit(COL_X[i] + sg * 3.2, hy - 0.5, 0.9, sg * (0.5 + rng() * 2), 1 + rng() * 2, (rng() - 0.5) * 2, { life: 0.35, size: 0.2, color: pick([0xffe9a0, 0xffb040, 0xffffff]), gravity: 10 });
          if (u.t > 0.7 && (u.shout = (u.shout || 0) - dt) <= 0) { u.shout = 1.4; note(i, 'BRRRR!', '#ffb040', 0.9, 6.0); audio.sfx('scrape', { vol: 0.3, rate: 1.6 }); }
          if (u.t >= 6.5) { scene.remove(g); g.traverse((o2) => { if (o2.geometry) o2.geometry.dispose(); }); E.gnome[i] = null; E.gnomeCd[i] = 14; fx.particles.burst(g.position.x, g.position.y + 1, 0.5, { count: 18, speed: 3, up: 1, life: 0.6, size: 0.4, colors: [0xffffff, 0xd8c8a8], gravity: 2 }); }
        }
      }
    }

    // ---------- aardbeving ----------
    function updateQuake(dt) {
      E.quakeT -= dt;
      if (E.quake <= 0 && E.quakeT <= 0 && E.quakes < 3 && phase === 'play') {
        E.quake = 1.7; E.quakes++; E.quakeT = 22 + rng() * 10;
        hud.showBig('AARDBEVING!', 1400, '#ffb040'); hud.toast('De schroeven worden weer omhoog gedraaid!', 2000);
        audio.sfx('explode', { vol: 0.4 }); audio.sfx('creak', { vol: 0.7 }); audio.sfx('scrape', { vol: 0.7, rate: 0.5 });
        for (const p of pl) {
          p.units = Math.max(0, p.units - 8); p.rhythm = 0; p.rust = Math.max(0, p.rust - 0.2);
          if (p.atPatch >= 0 && p.units < patchP[p.atPatch] * REQ) p.atPatch = -1;
          note(p.i, '-8', '#ff9a5a', 1.2, 5);
        }
      }
      if (E.quake > 0) {
        E.quake -= dt; ctx.shake(0.45);
        if (rng() < dt * 40) fx.particles.emit((rng() - 0.5) * 36, headCam() + 12, -3 + rng() * 6, (rng() - 0.5), -8 - rng() * 6, 0, { life: 1.3, size: 0.45, color: pick([0x8a8278, 0x6e665e, 0xb0a698]), gravity: 12 });
      }
    }
    const headCam = () => (headY(pl[0]) + headY(pl[1])) / 2;

    // ---------- deurman ----------
    function onDeurman(movers) {
      movers.forEach((m, i) => { if (m) { const p = pl[i]; p.units = Math.max(0, p.units - 10); p.atPatch = p.atPatch >= 0 && p.units < patchP[p.atPatch] * REQ ? -1 : p.atPatch; p.lockT = 0.5; note(i, 'De Deurman! -10', '#ff6a6a', 1.2); } });
    }

    // ---------- eind ----------
    function endGame(w) {
      if (finishCalled) return; finishCalled = true; phase = 'won'; winner = w; winT = 0;
      const pc = pl.map((p) => Math.round(p.units / REQ * 100));
      const nm = w == null ? null : names[w];
      let summary;
      if (w == null) summary = 'Allebei even diep gedraaid. Gelijkspel!';
      else if (pl[w].units < REQ) summary = `Tijd om! ${nm} zit het diepst (${pc[w]}%), ${names[1 - w]} staat op ${pc[1 - w]}%.`;
      else {
        const jokes = [`${nm} draait zijn schroef helemaal naar beneden en rinkelt de bel!`, `${nm} is de snelste schroevendraaier van het kasteel!`, `De gnomen joelen voor ${nm}. ${names[1 - w]} zit nog vast aan zijn roest.`];
        summary = jokes[Math.floor(rng() * jokes.length)] + `<br>${names[w]} ${pc[w]}% - ${names[1 - w]} ${pc[1 - w]}% (${Math.round(T)} sec)`;
      }
      ctx.finishPvp({ winner: w, score: pc, summary, delay: 3000 });
    }

    // ---------- per-speler update ----------
    function playerStep(p, dt, active) {
      const i = p.i, inp = ctx.pvp.input(i);
      p.lockT = Math.max(0, p.lockT - dt);
      if (active) {
        // links/rechts over de kop lopen
        const target = clamp(inp.x, -1, 1) * 1.9;
        p.offX += clamp(target - p.offX, -5.2 * dt, 5.2 * dt);
        if (p.slipT > 0) p.offX += Math.sin(T * 30) * 0.02;
        p.offX = clamp(p.offX, -2.0, 2.0);
        if (inp.aP) stomp(p, 'a');
        if (inp.bP) stomp(p, 'b');
        // poep wegvegen
        if (p.gooV > 0 && inp.downP) { p.gooV = Math.max(0, p.gooV - 0.34); p.wipes++; audio.sfx('whoosh', { vol: 0.3, rate: 1.7 }); fx.particles.burst(COL_X[i] + p.offX, headY(p) + 0.4, 0.8, { count: 6, speed: 2.5, up: 0.8, life: 0.4, size: 0.25, colors: [0xe9efd6, 0xffffff], gravity: 7 }); if (p.gooV <= 0.01) { p.gooV = 0; note(i, 'Schoon!', '#9dff7a', 1, 4.5); audio.sfx('good', { vol: 0.4 }); } }
        // timers
        p.slipT = Math.max(0, p.slipT - dt);
        if (p.gooV > 0) p.gooV = Math.max(0, p.gooV - dt * 0.12);
        p.rust = Math.max(0, p.rust - dt * 0.4);
        if (p.jam > 0) { p.jam -= dt; if (p.jam <= 0) { p.jam = 0; note(i, 'Los!', '#9dff7a', 1, 4.5); audio.sfx('good', { vol: 0.4 }); } }
        if (p.turbo > 0) { p.turbo -= dt; p.rust = 0; }
        if (p.gnome > 0) { p.gnome -= dt; p.rust = 0; }
        // ritme zakt weg als je stilstaat
        if (T - p.lastT > 0.95) p.rhythm = Math.max(0, p.rhythm - dt * 0.5);
        if (p.atPatch >= 0) p.patchT += dt;
        p.stallT += dt;
      }
      p.shown = damp(p.shown, p.units, p.units - p.shown > 6 ? 9 : 15, dt);
      if (Math.abs(p.shown - p.units) < 0.01) p.shown = p.units;
    }

    // ---------- visuals ----------
    const goldCol = new THREE.Color(0xffd23f);
    function visuals(dt) {
      for (const p of pl) {
        const i = p.i, hy = headY(p), c = p.c;
        // schroef
        const desc = Y0 - hy; p.spinAng = (desc / PITCH) * TAU;
        p.sc.spinner.rotation.y = p.spinAng;
        p.dip = damp(p.dip, 0, 16, dt);
        p.sc.group.position.set(COL_X[i] + (E.quake > 0 ? Math.sin(T * 60 + i) * 0.1 : 0), hy - p.dip * 0.22, 0);
        p.tintRust = damp(p.tintRust, p.jam > 0 ? 1 : Math.min(0.8, p.rust * 0.9), 6, dt);
        p.sc.setRust(p.tintRust);
        // hop
        let hop = 0;
        if (p.hopT >= 0) {
          const dur = 0.2 / Math.sqrt(Math.max(0.3, ctx.pvp.gravity)); p.hopT += dt;
          const k = p.hopT / dur;
          if (k >= 1) {
            p.hopT = -1; p.dip = 1;
            fx.particles.ring(COL_X[i] + p.offX, hy + 0.1, 0.4, { count: 10, speed: 3.2, color: p.sc.wood ? 0xe0c898 : 0xb8c0cc, size: 0.26, life: 0.35 });
            ctx.shake(0.04 + p.rhythm * 0.06);
          } else hop = Math.sin(k * Math.PI) * (0.75 + p.rhythm * 0.35) * (1 / Math.max(0.3, ctx.pvp.gravity)) ** 0.5;
        }
        p.hy = hy;
        if (!(phase === 'won' && winner === i && winT >= 0.6)) c.group.position.set(COL_X[i] + p.offX, hy + hop, 0.3);
        c.group.scale.setScalar(p.base * p.sz);
        c.faceDir(0, 1); c.air = hop > 0.12;
        const mood = phase === 'won' ? (winner === i ? 'cheer' : winner == null ? 'idle' : 'sad') : p.jam > 0 ? 'scared' : (p.turbo > 0 || p.gnome > 0) ? 'cheer' : p.gooV > 0.05 ? 'scared' : p.rhythm > 0.6 ? 'dance' : 'idle';
        if (!(phase === 'won' && winner === i && winT > 0.5 && winT < 1.9)) c.pose = mood;
        c.speed = 0; if (hop > 0.05) c.squash = -0.05;
        // voet-wiebel: A = linkervoet, B = rechtervoet
        if (p.hopT >= 0) { (p.hopFoot ? c.legR : c.legL).rotation.x = -0.9; }
        c.update(dt);
        // goo
        p.goo.visible = p.gooV > 0.01; p.goo.material.opacity = Math.min(0.9, p.gooV * 1.2);
        if (p.gooV > 0.05 && rng() < dt * 6) fx.particles.emit(COL_X[i] + p.offX + (rng() - 0.5) * 1.2, hy + 1.8 + rng(), 0.5, 0, -1, 0, { life: 0.6, size: 0.26, color: 0xe9efd6, gravity: 4 });
        // markers
        p.mWrench.position.y = 0.06; p.mPoop.position.y = 0.05;
        // turbo gloed
        if (p.turbo > 0 && rng() < dt * 40) fx.particles.emit(COL_X[i] + p.offX + (rng() - 0.5) * 1.5, hy + 0.3 + rng() * 2.5, 0.5, 0, 1.5, 0, { life: 0.5, size: 0.3, color: 0xffd23f, gravity: -1 });
        if (p.jam > 0 && rng() < dt * 12) fx.particles.emit(COL_X[i] + (rng() - 0.5) * 2, BLOCK_H + 1, 1.5, (rng() - 0.5), 1.5, 0, { life: 0.8, size: 0.4, color: 0x7a3a18, gravity: -0.5 });
        // meters
        const outer = i === 0 ? -1 : 1;
        p.mt.position.set(COL_X[i], hy - 3.3, 4.8); p.mt.scale.setScalar(1.0);
        p.mR.fill.scale.x = Math.max(0.001, 3.9 * p.rhythm); p.mR.fill.position.x = -1.95 + 3.9 * p.rhythm / 2;
        p.mR.fill.material.color.setHSL(0.33 - (p.rhythm > 0.95 ? 0.18 + 0.06 * Math.sin(T * 20) : 0), 0.9, 0.55);
        const rv = p.jam > 0 ? 1 : p.rust;
        p.mX.fill.scale.x = Math.max(0.001, 3.9 * rv); p.mX.fill.position.x = -1.95 + 3.9 * rv / 2;
        p.mX.fill.material.color.setHSL(p.jam > 0 ? 0.0 : 0.09 - p.rust * 0.07, 1, p.jam > 0 ? 0.45 + 0.15 * Math.sin(T * 20) : 0.5);
        // timing-meter
        p.gg.visible = p.atPatch >= 0 && phase === 'play';
        if (p.gg.visible) {
          p.gg.position.set(COL_X[i], hy + 4.9, 3.0);
          p.gn.position.x = (needlePos(p) - 0.5) * 4.3; p.gn.material.color.set(p.lockT > 0 ? 0xff5a4a : 0xffffff); p.gg.scale.setScalar(1.25 + Math.sin(T * 8) * 0.03);
          p.gz.material.color.setHSL(0.35, 1, p.patchT < 0.3 ? 0.3 : 0.55);
        }
        // collars: laten flikkeren als ze er bijna zijn
        p.sc.collars.forEach((col, j) => { if (!p.cleared[j]) col.g.children[0].material.emissiveIntensity = 0.5 + (p.atPatch === j ? 0.5 + 0.4 * Math.sin(T * 12) : 0); });
      }
      // HUD
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.15;
        for (const p of pl) {
          const pct = Math.round(p.units / REQ * 100);
          const tags = [p.jam > 0 ? 'VASTGEROEST!' : '', p.turbo > 0 ? 'TURBO' : p.gnome > 0 ? 'gnoom!' : '', p.gooV > 0.05 ? 'poep!' : '', p.atPatch >= 0 ? 'roestvlek!' : ''].filter(Boolean).join(' ');
          const rb = 'x' + (1 + p.rhythm).toFixed(1);
          hud.setPlayerInfo(p.i, `${pct}%  ritme ${rb}${tags ? '  ' + tags : ''}`);
        }
      }
      bars.update([pl[0].shown / REQ, pl[1].shown / REQ]);
      if (phase === 'play') hud.setTimer(Math.max(0, MAXT - T), 15);
    }

    // ---------- camera ----------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), wantP = new THREE.Vector3(), wantL = new THREE.Vector3(), introP = new THREE.Vector3(), introL = new THREE.Vector3();
    let camInit = false; const gpV = new THREE.Vector3(), glV = new THREE.Vector3();
    function cam(dt) {
      const hy = headCam(), sp = Math.abs(headY(pl[0]) - headY(pl[1]));
      let ty = hy + 2.2, tz = 23.5 + sp * 0.55;
      if (phase === 'won') { const k = smoothstep(0.4, 2.2, winT); ty = lerp(ty, 5.5, k); tz = lerp(tz, 24, k); }
      wantP.set(0, ty + 3.4, tz); wantL.set(0, ty, 0);
      introP.set(Math.sin(introT * 0.3) * 7, 20, 64); introL.set(0, 14, 0);
      gpV.copy(wantP).lerp(introP, cine); glV.copy(wantL).lerp(introL, cine); const gp = gpV, gl = glV;
      if (!camInit) { camP.copy(gp); camL.copy(gl); camInit = true; }
      const f = 1 - Math.exp(-(phase === 'won' ? 3.5 : 6) * dt); camP.lerp(gp, f); camL.lerp(gl, f);
      camera.position.copy(camP); camera.lookAt(camL);
    }

    // ---------- winnaar-animatie ----------
    let landed = false;
    function wonStep(dt) {
      winT += dt;
      if (winner == null) return;
      const p = pl[winner];
      if (winT < 0.6) return;
      const k = clamp((winT - 0.6) / 1.1, 0, 1);
      if (k < 1) {
        // boogje van de schroefkop naar de vloer
        const x0 = COL_X[winner] + p.offX, x1 = COL_X[winner] * 0.35, y0 = HEAD_FINAL + 0.2;
        p.c.group.position.set(lerp(x0, x1, k), lerp(y0, 0, k * k) + Math.sin(k * Math.PI) * 4.2, lerp(0.3, 5, k));
        p.c.air = true; p.c.pose = 'cheer'; p.c.group.rotation.z = 0;
        p.hopT = -1;
      } else if (!landed) {
        landed = true; world.ringBell(); audio.sfx('bell', { vol: 1 }); audio.sfx('bell', { vol: 0.6, rate: 0.75 }); audio.sfx('win'); ctx.shake(0.6);
        fx.particles.ring(p.c.group.position.x, 0.2, 5, { count: 26, speed: 6, color: 0xffffff, size: 0.35, life: 0.6 });
        for (let q = 0; q < 6; q++) setTimeout(() => { try { fx.particles.burst((rng() - 0.5) * 22, headCam() + 9 + rng() * 5, 3 + rng() * 6, { count: 44, speed: 8, up: 1.1, life: 1.8, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff, 0xff9a3a], gravity: 5 }); audio.sfx('sparkle', { vol: 0.4 }); } catch (e) { /* weg */ } }, q * 280);
      }
    }
    // pauze-vrije positie voor het winnende poppetje na de landing
    function winnerFloor() {
      if (winner == null || !landed) return;
      const p = pl[winner]; p.c.group.position.set(COL_X[winner] * 0.35, 0, 5); p.c.air = false; p.c.pose = 'cheer';
    }

    // ---------- hoofd-update ----------
    function tick(dt, active) {
      T += dt;
      if (cine > 0) cine = damp(cine, 0, 3, dt);
      if (active && phase === 'play') {
        for (const p of pl) playerStep(p, dt, true);
        // events
        E.ravenT -= dt; if (!E.raven && !E.blob && E.ravenT <= 0) { spawnRaven(); E.ravenT = 9 + rng() * 5; }
        E.wrenchT -= dt; if (!E.wrench && E.wrenchT <= 0) { spawnWrench(); E.wrenchT = 8 + rng() * 4; }
        updateRaven(dt); updateWrench(dt); updateGnomes(dt); updateQuake(dt);
        // einde?
        const f0 = pl[0].units >= REQ, f1 = pl[1].units >= REQ;
        if (f0 || f1) {
          let w = f0 && f1 ? (pl[0].lastT >= pl[1].lastT ? 1 : 0) : (f0 ? 0 : 1);
          endGame(w);
        } else if (T >= MAXT) {
          const d = pl[0].units - pl[1].units; endGame(Math.abs(d) < 0.5 ? null : d > 0 ? 0 : 1);
        }
      } else {
        for (const p of pl) playerStep(p, dt, false);
        if (phase === 'won') { updateRaven(dt); updateWrench(dt); updateGnomes(dt); }
        E.quake = Math.max(0, E.quake - dt);
      }
      if (phase === 'won') wonStep(dt);
      visuals(dt);
      winnerFloor();
      world.update(T + introT, dt, headCam(), E.quake > 0 ? 1 : 0);
      cam(dt);
    }
    function update(dt) { tick(dt, true); }
    function resultUpdate(dt) { tick(dt, false); }
    let counting = false;
    function introUpdate(dt) {
      introT += dt; cine = counting ? damp(cine, 0, 1.3, dt) : 1;
      for (const p of pl) { p.c.pose = 'idle'; p.c.faceDir(0, 1); p.c.update(dt); }
      visuals(dt); world.update(introT, dt, headCam(), 0); cam(dt);
    }

    // beginstand
    visuals(0.016); cam(0.016);
    return {
      update, resultUpdate, introUpdate,
      onCountdown() { counting = true; hud.setTimer(MAXT, 15); hud.setScore('🔩 Draai je schroef naar beneden!'); },
      onStart() { hud.setTimer(MAXT, 15); hud.setScore('🔩 Draai je schroef naar beneden!'); },
      onDeurman,
      celebrate(w) { pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; },
      onSwap() { for (const p of pl) fx.particles.ring(COL_X[p.i] + p.offX, headY(p) + 1.6, 0.5, { count: 18, speed: 3, color: 0xffe14a, size: 0.3, life: 0.5 }); },
      dispose() { },
      dbg: {
        state: () => ({ T, phase, winner, units: pl.map((p) => p.units), rhythm: pl.map((p) => p.rhythm), rust: pl.map((p) => p.rust), jam: pl.map((p) => p.jam), atPatch: pl.map((p) => p.atPatch), cleared: pl.map((p) => p.cleared.slice()), goo: pl.map((p) => p.gooV), turbo: pl.map((p) => p.turbo), gnome: pl.map((p) => p.gnome), offX: pl.map((p) => p.offX), needle: pl.map((p) => needlePos(p)), patchT: pl.map((p) => p.patchT), raven: !!E.raven, blob: E.blob ? { x: E.blob.x, i: E.blob.i } : null, wrench: E.wrench ? { i: E.wrench.i, gold: E.wrench.gold, off: E.wrench.off, state: E.wrench.state } : null, quakes: E.quakes, gnomes: E.gnomes.slice(), finished: finishCalled, REQ, patchP }),
        force: {
          raven() { E.ravenT = 0; }, wrench() { E.wrenchT = 0; }, quake() { E.quakeT = 0; },
          setUnits(i, u) { const p = pl[i]; p.units = u; p.shown = u; patchP.forEach((q, j) => { if (q * REQ <= u) p.cleared[j] = true; }); p.atPatch = -1; },
          gnome(i) { E.gnomeCd[i] = 0; },
        },
        pl, E,
      },
    };
  },
};

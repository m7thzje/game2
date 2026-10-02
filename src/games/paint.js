import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex, mulberry32 } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { Slime } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildPaintHall } from './paint_world.js';

// Verfgevecht — duel: verf de meeste tegels in jouw kleur in de Toverschilderszaal.
// Wes = groen, Jor = blauw. A = verfbom (3x3, laatste 10 s: 5x5), B = sprint met breed verfspoor.
// Gimmicks: Schoonmaak-Slijm (wist tegels, stuur hem naar je broer), Gouden Verfemmer (reuzenexplosie), regenboogtegels (tellen dubbel).

const N = 12, TS = 1.5, HALF = N * TS / 2, NN = N * N;
const TIME = 60, FINAL = 10, OVERTIME = 8;
const CHARGE_MAX = 3;
const TILE_COL = {
  0: [new THREE.Color(0xe6decc), new THREE.Color(0xcfc5ae)],
  1: [new THREE.Color(0x2fcf70), new THREE.Color(0x27b862)],
  2: [new THREE.Color(0x3f86ff), new THREE.Color(0x3373e6)],
};
const cellC = (g) => (g - (N - 1) / 2) * TS;
const cellOf = (v) => clamp(Math.floor(v / TS + N / 2), 0, N - 1);

export default {
  id: 'paint',
  name: 'Verfgevecht',
  giver: 'Schilder Splash',
  icon: '🎨',
  mode: 'pvp',
  time: TIME,
  pay: 1,
  music: 'game_fast',
  twists: ['invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'],
  blurb: 'In de <b>Toverschilderszaal</b> is de vloer een groot schilderbord! Verf zoveel mogelijk tegels in jouw kleur: <b>Wes is groen, Jor is blauw</b>. Overschilderen mag! Pas op voor het <b>Schoonmaak-Slijm</b> dat alle verf wegpoetst, pak de <b>Gouden Verfemmer</b> in het midden en jaag op de <b>regenboog-tegels</b> (tellen dubbel). Wie na 60 seconden de meeste punten heeft, wint!',
  controls: ['{move} lopen = tegels verven', '{a} verfbom (3x3 rondom jou)', '{b} sprint met breed verfspoor (duwt je broer weg)'],
  tip: 'Botst je tegen het Schoonmaak-Slijm? Dan stuiter je hem weg: stuur hem naar het gebied van je broer! In de laatste 10 seconden zijn verfbommen veel groter.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pvp = ctx.pvp;
    const names = players.map((p) => p.name);
    const L = ctx.lights('indoor', { shadow: 16, center: [0, 0, 0], fogNear: 60, fogFar: 150 });
    L.hemi.intensity = 1.55; L.hemi.color.set(0xfff0ff); L.hemi.groundColor.set(0x8a7aa0);
    L.sun.intensity = 1.7; L.sun.color.set(0xfff2dc); L.sun.position.set(-9, 30, 16);
    scene.fog.color.set(0x3a2a52);
    camera.fov = 44; camera.updateProjectionMatrix();
    const hall = buildPaintHall(ctx);

    // ------------------------------------------------------------------ tegels
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(TS * 0.94, 0.42, TS * 0.94), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }), NN);
    tiles.receiveShadow = true; tiles.castShadow = false; tiles.frustumCulled = false;
    scene.add(tiles);
    const owner = new Uint8Array(NN), bonus = new Uint8Array(NN), pop = new Float32Array(NN);
    const cur = Array.from({ length: NN }, (_, i) => TILE_COL[0][((i % N) + ((i / N) | 0)) & 1].clone());
    const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), qI = new THREE.Quaternion();
    const baseColor = (i) => TILE_COL[owner[i]][((i % N) + ((i / N) | 0)) & 1];
    function setMatrix(i) {
      const u = 1 - pop[i], s = Math.sin(u * Math.PI);
      tmpP.set(cellC(i % N), -0.21 + s * 0.34, cellC((i / N) | 0)); tmpS.set(1 + s * 0.05, 1, 1 + s * 0.05);
      tmpM.compose(tmpP, qI, tmpS); tiles.setMatrixAt(i, tmpM);
    }
    for (let i = 0; i < NN; i++) { setMatrix(i); tiles.setColorAt(i, cur[i]); }
    tiles.instanceMatrix.needsUpdate = true; tiles.instanceColor.needsUpdate = true;

    const sc = [0, 0, 0];            // gewogen score per eigenaar-id (1,2)
    const cnt = [0, 0, 0];           // aantal tegels per eigenaar-id
    let dirtyScore = true;
    function recount() {
      sc[1] = sc[2] = 0; cnt[0] = cnt[1] = cnt[2] = 0;
      for (let i = 0; i < NN; i++) { const o = owner[i]; cnt[o]++; if (o) sc[o] += bonus[i] ? 2 : 1; }
      dirtyScore = false;
    }

    // ------------------------------------------------------------------ toestand
    const stats = { painted: [0, 0], bombs: [0, 0], bumps: [0, 0], bucket: [0, 0], wiped: [0, 0], dashHits: [0, 0], slimed: [0, 0] };
    let T = 0, done = false, introT = 0, over = false, overT = 0, winnerIdx = -1, resultT = 0, finalMode = false, endT = 0;
    let freeze = 0;
    const pq = [];           // vertraagde verfplekken {idx, who, t}
    const bonusList = [];

    function paintTile(idx, who, quiet = false) {
      if (owner[idx] === who) return false;
      const prev = owner[idx];
      owner[idx] = who; pop[idx] = 1; dirtyScore = true;
      if (who && prev !== who) stats.painted[who - 1]++;
      if (!quiet && Math.random() < 0.55) {
        const c = who === 1 ? PLAYER_COLORS[0] : who === 2 ? PLAYER_COLORS[1] : 0xffffff;
        fx.particles.burst(cellC(idx % N), 0.3, cellC((idx / N) | 0), { count: 3, speed: 2.4, up: 1.2, life: 0.55, size: 0.3, color: c, gravity: 9 });
      }
      return true;
    }
    function queuePaint(idx, who, delay) { if (delay <= 0.001) paintTile(idx, who); else pq.push({ idx, who, t: delay }); }
    function paintCells(gx, gz, who, R, shape, base) {
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const x = gx + dx, z = gz + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const d = Math.hypot(dx, dz); if (shape === 'disc' && d > R + 0.35) continue;
        queuePaint(z * N + x, who, base + d * (shape === 'disc' ? 0.05 : 0.07));
      }
    }

    // ------------------------------------------------------------------ rondes/effecten
    const rings = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; scene.add(m); rings.push({ m, t: 1, dur: 0.5, R: 3 });
    }
    function shock(x, z, R, color, dur = 0.5) {
      const r = rings.find((q) => q.t >= 1) || rings[0]; r.t = 0; r.dur = dur; r.R = R; r.m.material.color.set(color); r.m.position.set(x, 0.3, z); r.m.visible = true;
    }
    function updateRings(dt) {
      for (const r of rings) {
        if (r.t >= 1) { r.m.visible = false; continue; }
        r.t = Math.min(1, r.t + dt / r.dur); const k = r.t * (2 - r.t);
        r.m.scale.setScalar(Math.max(0.01, k * r.R)); r.m.material.opacity = (1 - r.t) * 0.9;
      }
    }

    // ------------------------------------------------------------------ spelers
    const START = [[-3.75, 3.75], [3.75, 3.75]];
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      // verfkwast in de hand
      const brush = new THREE.Group();
      brush.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 5), mat(0x9b6a2e), { cast: false, pos: [0, 0.2, 0] }));
      brush.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 6), mat(0xd0d0e0, { metalness: 0.7 }), { cast: false, pos: [0, 0.5, 0] }));
      brush.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 7), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[i], emissive: PLAYER_COLORS[i], emissiveIntensity: 0.4 }), { cast: false, pos: [0, 0.73, 0] }));
      brush.rotation.x = Math.PI / 2; brush.position.set(0, 0, 0.1); c.hold(brush, 'r');
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4; scene.add(ring);
      const blob = P.shadowBlob(1.0); scene.add(blob);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(2.0, 0.75, 1); tag.renderOrder = 15; scene.add(tag);
      const pips = [0, 1, 2].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, depthTest: false })); m.renderOrder = 16; scene.add(m); return m; });
      return { i, id: i + 1, c, holder, ring, blob, tag, pips, x: START[i][0], z: START[i][1], vx: 0, vz: 0, face: i ? -2.4 : 2.4, sz: 1, dashT: 0, dashCd: 0, dashDx: 0, dashDz: 0, charges: 2, bombCd: 0, stun: 0, slow: 0, hop: 0, hitCd: 0, paintT: 0, pose: 'idle', infoKey: '' };
    });

    // ------------------------------------------------------------------ Schoonmaak-slijm
    const spongeG = new THREE.Group(); scene.add(spongeG);
    const slime = new Slime(0xf2e24a, 2.7); spongeG.add(slime.group);
    {
      const rr = 0.5 * 2.7, rnd = mulberry32(5);
      for (let k = 0; k < 11; k++) {
        const az = rnd() * TAU, el = 0.15 + rnd() * 0.95;
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.1 * 2.7 * (0.6 + rnd() * 0.7), 7, 5), new THREE.MeshStandardMaterial({ color: 0xb8a418, roughness: 0.8 }));
        h.position.set(Math.sin(el) * Math.cos(az) * rr * 0.99, Math.cos(el) * rr * 0.99, Math.sin(el) * Math.sin(az) * rr * 0.99); h.scale.set(1, 0.7, 1); slime.blob.add(h);
      }
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rnd() * 0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, transparent: true, opacity: 0.92 })); f.position.set((rnd() - 0.5) * 0.9, rr * 0.93 + rnd() * 0.12, (rnd() - 0.5) * 0.7); slime.blob.add(f); }
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 5, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x4a3a10 })); mouth.position.set(0, 0.42, rr * 0.93); mouth.rotation.z = Math.PI; slime.blob.add(mouth);
      const labelTex = canvasTex(512, 96, (g, w, hh) => { g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,30,0,.92)'; g.strokeText('SCHOONMAAK-SLIJM', w / 2, hh / 2, w - 20); g.fillStyle = '#fff6a0'; g.fillText('SCHOONMAAK-SLIJM', w / 2, hh / 2, w - 20); });
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false })); lab.scale.set(3.8, 0.72, 1); lab.position.set(0, 3.2, 0); lab.renderOrder = 15; spongeG.add(lab);
    }
    const spongeBlob = P.shadowBlob(1.9); scene.add(spongeBlob);
    const sp = { on: false, x: 0, z: -4.5, vx: 0, vz: 0, tx: 0, tz: 0, retarget: 0, spawnT: 3.2, grow: 0, last: -1, bumpCd: [0, 0], faceA: 0, hop: 0, bubT: 0 };
    spongeG.visible = false; spongeBlob.visible = false;
    const SP_R = 1.35;

    function spongeTarget() {
      const lead = sc[1] > sc[2] + 3 ? 1 : sc[2] > sc[1] + 3 ? 2 : 0;
      if (lead && Math.random() < 0.7) {
        const mine = []; for (let i = 0; i < NN; i++) if (owner[i] === lead) mine.push(i);
        if (mine.length) { const k = pick(mine); sp.tx = cellC(k % N); sp.tz = cellC((k / N) | 0); return; }
      }
      sp.tx = rand(-HALF + 2, HALF - 2); sp.tz = rand(-HALF + 2, HALF - 2);
    }
    function updateSponge(dt) {
      if (!sp.on) {
        sp.spawnT -= dt;
        if (sp.spawnT <= 0) {
          sp.on = true; sp.x = 0; sp.z = -HALF + 2.2; sp.vx = 0; sp.vz = 0; sp.grow = 0; spongeG.visible = true; spongeBlob.visible = true; spongeTarget(); sp.retarget = 3;
          hud.showBig('SCHOONMAAK-SLIJM!', 800, '#fff06a'); audio.sfx('boing', { vol: 0.8 }); audio.sfx('sparkle', { vol: 0.5 }); ctx.shake(0.3);
          fx.particles.burst(sp.x, 0.5, sp.z, { count: 40, speed: 5, up: 1.4, life: 1.0, size: 0.5, colors: [0xffffff, 0xcfeaff, 0xfff6a0], gravity: 3 });
        }
        return;
      }
      sp.grow = Math.min(1, sp.grow + dt * 2.2);
      const speedNow = Math.hypot(sp.vx, sp.vz);
      const cruise = 2.5 + 1.3 * clamp(T / TIME, 0, 1) + (finalMode ? 0.5 : 0);
      sp.retarget -= dt; if (sp.retarget <= 0 || Math.hypot(sp.tx - sp.x, sp.tz - sp.z) < 1.2) { spongeTarget(); sp.retarget = rand(2.4, 4.2); }
      const dx = sp.tx - sp.x, dz = sp.tz - sp.z, dl = Math.hypot(dx, dz) || 1;
      if (speedNow > cruise * 1.35) { const f = Math.exp(-1.15 * dt); sp.vx *= f; sp.vz *= f; }
      else { const k = Math.min(1, 2.2 * dt); sp.vx += (dx / dl * cruise - sp.vx) * k; sp.vz += (dz / dl * cruise - sp.vz) * k; }
      sp.x += sp.vx * dt; sp.z += sp.vz * dt;
      const lim = HALF - SP_R * 0.7;
      if (sp.x < -lim) { sp.x = -lim; sp.vx = Math.abs(sp.vx) * 0.8; } if (sp.x > lim) { sp.x = lim; sp.vx = -Math.abs(sp.vx) * 0.8; }
      if (sp.z < -lim) { sp.z = -lim; sp.vz = Math.abs(sp.vz) * 0.8; } if (sp.z > lim) { sp.z = lim; sp.vz = -Math.abs(sp.vz) * 0.8; }
      // tegels wissen
      const gx0 = cellOf(sp.x - 1.6), gx1 = cellOf(sp.x + 1.6), gz0 = cellOf(sp.z - 1.6), gz1 = cellOf(sp.z + 1.6);
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        if (Math.hypot(cellC(gx) - sp.x, cellC(gz) - sp.z) > 1.05) continue;
        const idx = gz * N + gx; const o = owner[idx];
        if (o) { if (paintTile(idx, 0, true)) { stats.wiped[o - 1]++; if (Math.random() < 0.5) fx.particles.burst(cellC(gx), 0.4, cellC(gz), { count: 4, speed: 2.2, up: 1.5, life: 0.7, size: 0.35, colors: [0xffffff, 0xcfeaff], gravity: 2 }); } }
      }
      // botsen met spelers
      sp.bumpCd[0] -= dt; sp.bumpCd[1] -= dt;
      for (const p of pl) {
        const dxp = sp.x - p.x, dzp = sp.z - p.z, d = Math.hypot(dxp, dzp) || 0.01; const minD = SP_R + 0.5 * p.sz;
        if (d >= minD) continue;
        const nx = dxp / d, nz = dzp / d;
        if (sp.bumpCd[p.i] <= 0 && !(p.stun > 0)) {
          // speler stuurt de slijm weg
          const power = 7.5 + (p.dashT > 0 ? 10 : 0) + Math.hypot(p.vx, p.vz) * 0.35;
          sp.vx = nx * power; sp.vz = nz * power; sp.last = p.i; sp.bumpCd[p.i] = 0.6; sp.hop = 1; stats.bumps[p.i]++;
          p.vx -= nx * (p.dashT > 0 ? 0 : 3.0); p.vz -= nz * (p.dashT > 0 ? 0 : 3.0);
          fx.particles.burst(p.x + nx * 0.9, 1.0, p.z + nz * 0.9, { count: 22, speed: 5, up: 1.1, life: 0.7, size: 0.42, colors: [0xffffff, 0xcfeaff, 0xfff06a], gravity: 4 });
          fx.texts.add(p.dashT > 0 ? 'SPLOEF!' : 'PLOF!', sp.x, 3.6, sp.z, p.i ? '#8fb8ff' : '#7dffa8', 1.0); audio.sfx('boing', { vol: 0.7, rate: 1.1 }); audio.sfx('hit', { vol: 0.4 }); ctx.shake(0.22);
        }
        // overlap oplossen (spons is zwaar)
        const over2 = minD - d; p.x -= nx * over2 * 0.7; p.z -= nz * over2 * 0.7; sp.x += nx * over2 * 0.3; sp.z += nz * over2 * 0.3;
        // geraakt door een snel rollende slijm (niet door de eigen afzender)
        const spd = Math.hypot(sp.vx, sp.vz);
        if (spd > 6 && sp.last !== p.i && p.slow <= 0) {
          p.slow = 1.4; p.stun = Math.max(p.stun, 0.3); p.vx = -nx * 6; p.vz = -nz * 6; stats.slimed[p.i]++;
          fx.texts.add('SLIJM!', p.x, 3.4 * p.sz, p.z, '#fff06a', 1.1); audio.sfx('splash', { vol: 0.7 }); audio.sfx('buzz', { vol: 0.3, rate: 1.6 }); ctx.shake(0.4);
          fx.particles.burst(p.x, 1.2, p.z, { count: 30, speed: 4, up: 1.3, life: 0.9, size: 0.42, colors: [0xfff06a, 0xffffff, 0xc8e86a], gravity: 6 });
        }
      }
      // visuals
      sp.faceA = dampAngle(sp.faceA, Math.atan2(sp.vx, sp.vz), 5, dt);
      sp.hop = Math.max(0, sp.hop - dt * 1.6);
      const spd2 = Math.hypot(sp.vx, sp.vz);
      const hopY = Math.abs(Math.sin(T * 4.2)) * 0.28 * clamp(spd2 / 4, 0.3, 1.6) + sp.hop * Math.sin(sp.hop * Math.PI) * 0.8;
      spongeG.position.set(sp.x, hopY, sp.z); spongeG.rotation.y = sp.faceA;
      const gk = sp.grow < 1 ? (1 - Math.pow(1 - sp.grow, 3)) * (1 + Math.sin(sp.grow * 10) * 0.08 * (1 - sp.grow)) : 1;
      spongeG.scale.set(gk * (1 + sp.hop * 0.2), gk * (1 - sp.hop * 0.18), gk * (1 + sp.hop * 0.2));
      slime.update(dt, 1 + spd2 * 0.2);
      spongeBlob.position.set(sp.x, 0.03, sp.z); spongeBlob.scale.setScalar(1.15 * gk);
      sp.bubT -= dt;
      if (sp.bubT <= 0) { sp.bubT = 0.07; fx.particles.emit(sp.x + rand(-1.2, 1.2), 0.5 + rand(0, 1.2), sp.z + rand(-1.2, 1.2), rand(-0.3, 0.3), rand(0.8, 1.6), rand(-0.3, 0.3), { life: 1.1, size: 0.34, color: pick([0xffffff, 0xcfeaff, 0xe8fff8]), gravity: -0.4 }); }
    }

    // ------------------------------------------------------------------ Gouden verfemmer
    const bucketG = new THREE.Group(); scene.add(bucketG); bucketG.visible = false;
    {
      const gold = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xff9a10, emissiveIntensity: 0.6, metalness: 0.85, roughness: 0.25 });
      const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.8, 14, 1, true), gold); bk.material.side = THREE.DoubleSide; bk.position.y = 0.4; bucketG.add(bk);
      bucketG.add(mesh(new THREE.CircleGeometry(0.45, 14), gold, { cast: false, pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }));
      bucketG.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), gold, { cast: false, pos: [0, 0.8, 0], rot: [Math.PI / 2, 0, 0] }));
      bucketG.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 5, 14, Math.PI), gold, { cast: false, pos: [0, 0.8, 0] }));
      const paint = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffef7a })); paint.position.y = 0.72; bucketG.add(paint);
      bucketG.scale.setScalar(1.7);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 11, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 5.8; beam.scale.setScalar(1 / 1.7); bucketG.add(beam); bucketG.userData.beam = beam;
      const halo = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.55, 36), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.1; halo.scale.setScalar(1 / 1.7 * 1.0); bucketG.add(halo); bucketG.userData.halo = halo;
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(512, 96, (g, w, hh) => { g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = 'rgba(60,30,0,.92)'; g.strokeText('GOUDEN VERFEMMER', w / 2, hh / 2, w - 20); g.fillStyle = '#ffe45a'; g.fillText('GOUDEN VERFEMMER', w / 2, hh / 2, w - 20); }), transparent: true, depthTest: false }));
      lab.scale.set(4.2, 0.8, 1); lab.position.set(0, 2.3, 0); lab.renderOrder = 15; bucketG.add(lab);
    }
    const bk = { on: false, t: 0, life: 0, next: 11, x: 0, z: 0, n: 0 };
    function updateBucket(dt) {
      if (!bk.on) {
        if (T >= bk.next) {
          bk.on = true; bk.life = 9; bk.t = 0; bk.x = 0; bk.z = 0; bucketG.visible = true; bucketG.position.set(0, 0, 0); bk.n++;
          hud.showBig('GOUDEN EMMER!', 750, '#ffe45a'); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('sparkle', { vol: 0.7 }); shock(0, 0, 5, 0xffe36a, 0.7);
          fx.particles.ring(0, 0.5, 0, { count: 30, speed: 5, color: 0xffe36a, size: 0.4, life: 0.7 });
        }
        return;
      }
      bk.t += dt; bk.life -= dt;
      const sp2 = 1 + Math.sin(bk.t * 6) * 0.05;
      bucketG.position.y = 0.35 + Math.sin(bk.t * 3) * 0.2; bucketG.rotation.y += dt * 1.8; bucketG.scale.setScalar(1.7 * sp2);
      bucketG.userData.halo.rotation.z += dt; bucketG.userData.beam.material.opacity = 0.14 + 0.08 * Math.sin(bk.t * 5);
      bucketG.visible = bk.life > 2 || Math.sin(bk.life * 22) > -0.2;
      if (Math.random() < dt * 25) fx.particles.emit(rand(-1, 1), 1 + rand(0, 2.2), rand(-1, 1), 0, 1.2, 0, { life: 0.8, size: 0.3, color: pick([0xffe36a, 0xffffff, 0xffb02a]), gravity: -0.5 });
      const order = Math.random() < 0.5 ? [pl[0], pl[1]] : [pl[1], pl[0]];
      for (const p of order) {
        if (Math.hypot(p.x - bk.x, p.z - bk.z) < 1.45 + 0.4 * p.sz) {
          bk.on = false; bucketG.visible = false; bk.next = T + rand(14, 17); stats.bucket[p.i]++;
          const gx = cellOf(bk.x), gz = cellOf(bk.z);
          paintCells(gx, gz, p.id, 4, 'disc', 0);
          shock(bk.x, bk.z, 8, PLAYER_COLORS[p.i], 0.8); shock(bk.x, bk.z, 4, 0xffe36a, 0.5);
          const cols = [PLAYER_COLORS[p.i], 0xffe36a, 0xffffff];
          fx.particles.burst(bk.x, 1.2, bk.z, { count: 120, speed: 11, up: 1.5, life: 1.3, size: 0.55, colors: cols, gravity: 9 });
          fx.particles.ring(bk.x, 0.6, bk.z, { count: 44, speed: 9, color: 0xffe36a, size: 0.45, life: 0.8 });
          fx.texts.add('BOEM! GOUD!', bk.x, 4.2, bk.z, '#ffe45a', 1.5); hud.showBig('VERF-EXPLOSIE!', 750, p.i ? '#8fb8ff' : '#7dffa8');
          audio.sfx('explode', { vol: 0.7 }); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('splash', { vol: 0.8 }); ctx.shake(0.9); p.hop = 1; p.c.swing();
          break;
        }
      }
      if (bk.on && bk.life <= 0) { bk.on = false; bucketG.visible = false; bk.next = T + 7; fx.particles.burst(0, 1, 0, { count: 24, speed: 4, up: 1, life: 0.7, size: 0.4, colors: [0xffe36a], gravity: 6 }); audio.sfx('miss', { vol: 0.4 }); }
    }

    // ------------------------------------------------------------------ regenboogtegels (tellen dubbel)
    const starShape = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, r = k % 2 ? 0.28 : 0.62; (k ? starShape.lineTo : starShape.moveTo).call(starShape, Math.sin(a) * r, Math.cos(a) * r); }
    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.07, bevelEnabled: false });
    const stars = Array.from({ length: 7 }, () => { const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); m.rotation.x = Math.PI / 2; m.visible = false; scene.add(m); return m; });
    let bonusT = 4;
    function addBonus(initial = false) {
      let tries = 0, idx;
      do { idx = Math.floor(Math.random() * NN); tries++; } while ((bonus[idx] || (tries < 30 && pl.some((p) => cellOf(p.x) + cellOf(p.z) * N === idx))) && tries < 60);
      if (bonus[idx]) return;
      if (bonusList.length >= 6) { const old = bonusList.shift(); bonus[old] = 0; fx.particles.burst(cellC(old % N), 0.6, cellC((old / N) | 0), { count: 6, speed: 2, up: 1, life: 0.5, size: 0.3, color: 0xffffff }); }
      bonus[idx] = 1; bonusList.push(idx); pop[idx] = 1; dirtyScore = true;
      if (!initial) { audio.sfx('sparkle', { vol: 0.5 }); fx.particles.ring(cellC(idx % N), 0.5, cellC((idx / N) | 0), { count: 14, speed: 3, color: 0xffffff, size: 0.3, life: 0.5 }); }
    }
    const _hc = new THREE.Color();
    function updateStars(t, dt) {
      stars.forEach((m, k) => {
        const idx = bonusList[k];
        if (idx == null) { m.visible = false; return; }
        m.visible = true; m.position.set(cellC(idx % N), 0.2 + Math.sin(t * 3 + k) * 0.05 + pop[idx] * 0.3, cellC((idx / N) | 0)); m.rotation.z = t * 1.2 + k; m.scale.setScalar(1 + Math.sin(t * 4 + k) * 0.08);
        m.material.color.setHSL((t * 0.4 + k * 0.17) % 1, 1, 0.58);
      });
    }

    // ------------------------------------------------------------------ acties
    function doBomb(p) {
      p.charges -= 1; p.bombCd = 0.4; p.hop = 1; p.c.swing(); stats.bombs[p.i]++;
      const R = finalMode ? 2 : 1;
      paintCells(cellOf(p.x), cellOf(p.z), p.id, R, 'square', 0.02);
      const col = PLAYER_COLORS[p.i];
      shock(p.x, p.z, (R + 0.7) * TS, col, 0.45);
      fx.particles.burst(p.x, 0.9, p.z, { count: finalMode ? 90 : 50, speed: finalMode ? 9 : 7, up: 1.4, life: 0.9, size: 0.5, colors: [col, col, 0xffffff, 0xffe14a], gravity: 10 });
      fx.texts.add(finalMode ? 'MEGA-BOM!' : 'SPLAT!', p.x, 3.6 * p.sz, p.z, p.i ? '#8fb8ff' : '#7dffa8', 1.0);
      audio.sfx('splash', { vol: 0.7 }); audio.sfx('pop', { vol: 0.6, rate: 0.8 }); ctx.shake(finalMode ? 0.4 : 0.22);
    }
    function startDash(p, inp) {
      let dx = inp.x, dz = inp.y; const m = Math.hypot(dx, dz);
      if (m < 0.25) { dx = Math.sin(p.face); dz = Math.cos(p.face); } else { dx /= m; dz /= m; }
      p.dashT = 0.32; p.dashCd = 1.6; p.dashDx = dx; p.dashDz = dz; p.face = Math.atan2(dx, dz);
      audio.sfx('whoosh', { vol: 0.6, rate: 1.2 }); p.c.swing();
      fx.particles.burst(p.x, 0.4, p.z, { count: 10, speed: 3, up: 0.6, life: 0.5, size: 0.4, color: PLAYER_COLORS[p.i], gravity: 4 });
    }

    function playerStep(p, dt, active) {
      const inp = pvp.input(p.i); const sz = pvp.size(p.i), spd = pvp.speed(p.i);
      p.sz = damp(p.sz, sz, 6, dt);
      const slipL = lerp(13, 1.5, pvp.slip);
      let mx = inp.x, mz = inp.y; const mm = Math.hypot(mx, mz); if (mm > 1) { mx /= mm; mz /= mm; }
      const can = active && !(p.stun > 0);
      // oplaadtijd en laden
      const rate = (finalMode ? 1 / 1.6 : 1 / 3.2);
      p.charges = Math.min(CHARGE_MAX, p.charges + dt * rate);
      p.bombCd = Math.max(0, p.bombCd - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.stun = Math.max(0, p.stun - dt); p.slow = Math.max(0, p.slow - dt); p.hitCd = Math.max(0, p.hitCd - dt);
      if (can && inp.aP && p.charges >= 1 && p.bombCd <= 0) doBomb(p);
      else if (can && inp.aP && p.charges < 1) { audio.sfx('click', { vol: 0.3, rate: 0.6 }); }
      if (can && inp.bP && p.dashCd <= 0 && p.dashT <= 0) startDash(p, inp);
      // bewegen
      const base = 6.3 * spd * (p.slow > 0 ? 0.45 : 1);
      if (p.dashT > 0) {
        p.dashT -= dt; const ds = 15.5 * (0.75 + 0.25 * spd);
        p.vx = p.dashDx * ds; p.vz = p.dashDz * ds;
      } else {
        const tx = can ? mx * base : 0, tz = can ? mz * base : 0; const lam = p.stun > 0 ? 3.5 : slipL;
        p.vx = damp(p.vx, tx, lam, dt); p.vz = damp(p.vz, tz, lam, dt);
        if (can && mm > 0.25) p.face = Math.atan2(mx, mz);
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      const lim = HALF - 0.55 * p.sz;
      if (p.x < -lim) { p.x = -lim; p.vx = Math.abs(p.vx) * 0.3; } if (p.x > lim) { p.x = lim; p.vx = -Math.abs(p.vx) * 0.3; }
      if (p.z < -lim) { p.z = -lim; p.vz = Math.abs(p.vz) * 0.3; } if (p.z > lim) { p.z = lim; p.vz = -Math.abs(p.vz) * 0.3; }
      // verven
      if (active) {
        const r = TS * (p.dashT > 0 ? 0.78 : 0.55) * p.sz;
        const gx0 = cellOf(p.x - r), gx1 = cellOf(p.x + r), gz0 = cellOf(p.z - r), gz1 = cellOf(p.z + r);
        let n = 0;
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
          if (Math.hypot(cellC(gx) - p.x, cellC(gz) - p.z) > r && !(gx === cellOf(p.x) && gz === cellOf(p.z))) continue;
          if (paintTile(gz * N + gx, p.id)) n++;
        }
        if (n && p.dashT > 0) audio.sfx('pop', { vol: 0.2, rate: 1.4 + Math.random() * 0.3 });
        else if (n && (p.paintT -= dt) <= 0) { p.paintT = 0.18; audio.sfx('step', { vol: 0.25, rate: 1.3 + Math.random() * 0.4 }); }
        if (p.dashT > 0) fx.particles.emit(p.x + rand(-0.4, 0.4), 0.35, p.z + rand(-0.4, 0.4), -p.vx * 0.08, 0.6, -p.vz * 0.08, { life: 0.5, size: 0.5, color: PLAYER_COLORS[p.i], gravity: 2 });
      }
    }

    function collide(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz) || 0.001; const minD = 0.55 * (a.sz + b.sz) + 0.1;
      if (d >= minD) return;
      const nx = dx / d, nz = dz / d;
      // sprint-aanval
      for (const [x, y, kx, kz] of [[a, b, nx, nz], [b, a, -nx, -nz]]) {
        if (x.dashT > 0 && y.dashT <= 0 && x.hitCd <= 0) {
          y.vx = kx * 12; y.vz = kz * 12; y.stun = 0.45; y.hitCd = 0.5; x.hitCd = 0.5; x.dashT = Math.min(x.dashT, 0.08); y.c.pose = 'scared'; stats.dashHits[x.i]++;
          fx.texts.add('BONK!', y.x, 3.4 * y.sz, y.z, '#ffd24a', 1.1); audio.sfx('hit', { vol: 0.8 }); ctx.shake(0.4);
          fx.particles.burst((x.x + y.x) / 2, 1.0, (x.z + y.z) / 2, { count: 20, speed: 5, up: 1, life: 0.6, size: 0.4, colors: [PLAYER_COLORS[x.i], 0xffffff, 0xffe14a], gravity: 8 });
        }
      }
      const over2 = minD - d; a.x -= nx * over2 * 0.5; a.z -= nz * over2 * 0.5; b.x += nx * over2 * 0.5; b.z += nz * over2 * 0.5;
    }

    // ------------------------------------------------------------------ visuals
    const _col = new THREE.Color();
    function updateTiles(t, dt) {
      let mUp = false;
      for (let i = 0; i < NN; i++) {
        const tgt = baseColor(i); const c = cur[i];
        if (bonus[i]) { _hc.setHSL((t * 0.5 + i * 0.07) % 1, 0.75, 0.62); _col.copy(tgt).lerp(_hc, 0.38); } else _col.copy(tgt);
        const k = bonus[i] ? 1 : Math.min(1, dt * 14);
        c.lerp(_col, k); tiles.setColorAt(i, c);
        if (pop[i] > 0) { pop[i] = Math.max(0, pop[i] - dt * 3.2); setMatrix(i); mUp = true; }
      }
      tiles.instanceColor.needsUpdate = true; if (mUp) tiles.instanceMatrix.needsUpdate = true;
    }
    function visuals(dt, t, idle) {
      pl.forEach((p, i) => {
        const c = p.c;
        p.hop = Math.max(0, p.hop - dt / (0.45 / Math.sqrt(pvp.gravity)));
        const hopH = Math.sin(p.hop * Math.PI) * 0.95 / Math.pow(pvp.gravity, 0.6) * (p.hop > 0 ? 1 : 0);
        const S = 1.6 * p.sz; p.holder.scale.setScalar(S); p.holder.position.set(p.x, hopH, p.z);
        c.faceDir(Math.sin(p.face), Math.cos(p.face));
        const speedN = Math.hypot(p.vx, p.vz);
        c.speed = done ? 0 : clamp(speedN / (6.3 * pvp.speed(i)), 0, 1);
        c.air = hopH > 0.12;
        if (done || over && winnerIdx >= 0) c.pose = winnerIdx < 0 ? 'idle' : winnerIdx === i ? 'cheer' : 'sad';
        else if (p.stun > 0) c.pose = 'scared'; else if (p.dashT > 0) c.pose = 'push'; else if (p.hop > 0) c.pose = 'cheer'; else c.pose = 'idle';
        c.update(dt);
        const lean = clamp(speedN * 0.025, 0, 0.35);
        p.holder.rotation.x = p.dashT > 0 ? 0.28 : lean * 0.4;
        p.ring.position.set(p.x, 0.07, p.z); p.ring.scale.setScalar(p.sz * (1 + Math.sin(t * 7 + i) * 0.04)); p.ring.material.opacity = p.dashCd > 0 ? 0.35 : 0.95;
        p.blob.position.set(p.x, 0.06, p.z); p.blob.scale.setScalar(Math.max(0.4, 1.2 - hopH * 0.35) * p.sz);
        const head = c.height * S;
        p.tag.position.set(p.x, head + 1.05, p.z);
        for (let k = 0; k < 3; k++) {
          const m = p.pips[k]; const f = clamp(p.charges - k, 0, 1);
          m.position.set(p.x + (k - 1) * 0.5, head + 0.5, p.z); m.scale.setScalar(0.35 + f * 0.65); m.material.opacity = 0.25 + f * 0.75;
          m.material.color.set(f >= 1 ? (finalMode ? 0xffe14a : PLAYER_COLORS[i]) : 0x777788);
        }
        if (p.slow > 0 && Math.random() < dt * 14) fx.particles.emit(p.x + rand(-0.4, 0.4), 0.5 + rand(0, 1.6), p.z + rand(-0.4, 0.4), 0, 1, 0, { life: 0.6, size: 0.3, color: 0xfff06a, gravity: -0.5 });
        // HUD-info
        const key = `${Math.floor(p.charges)}|${p.dashCd <= 0 ? 1 : 0}|${sc[p.id]}`;
        if (key !== p.infoKey) { p.infoKey = key; const n = Math.floor(p.charges); hud.setPlayerInfo(i, `💣 ${'●'.repeat(n)}${'○'.repeat(CHARGE_MAX - n)}  ${p.dashCd <= 0 ? '💨 klaar' : '💨 ...'}  ·  ${sc[p.id]} p`); }
      });
    }

    // ------------------------------------------------------------------ live scorebalk (DOM)
    const bar = document.createElement('div');
    bar.style.cssText = 'width:min(520px,44vw);height:30px;border-radius:16px;overflow:hidden;background:#4a4058;border:3px solid #ffd24a;box-shadow:0 3px 0 rgba(0,0,0,.5);display:flex;position:relative;pointer-events:none;font:700 17px Fredoka,Arial,sans-serif;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.7)';
    const f0 = document.createElement('div'), fm = document.createElement('div'), f1 = document.createElement('div');
    f0.style.cssText = 'background:linear-gradient(#4ee08a,#27b862);width:0%;transition:width .25s'; f1.style.cssText = 'background:linear-gradient(#6aa0ff,#3373e6);width:0%;transition:width .25s'; fm.style.cssText = 'flex:1;background:repeating-linear-gradient(45deg,#6a5f7a,#6a5f7a 8px,#5d5270 8px,#5d5270 16px)';
    const t0 = document.createElement('div'), t1 = document.createElement('div'), tm = document.createElement('div');
    t0.style.cssText = 'position:absolute;left:12px;top:2px'; t1.style.cssText = 'position:absolute;right:12px;top:2px'; tm.style.cssText = 'position:absolute;left:50%;top:-1px;bottom:-1px;width:3px;background:rgba(255,255,255,.7);transform:translateX(-50%)';
    bar.append(f0, fm, f1, tm, t0, t1);
    let barDirty = true;
    function ensureBar() { const mid = hud.scoreEl && hud.scoreEl.parentNode; if (mid && bar.parentNode !== mid) { mid.append(bar); hud.setScore(null); } }
    function updateBar() {
      const total = NN + bonusList.length; f0.style.width = (sc[1] / total * 100).toFixed(1) + '%'; f1.style.width = (sc[2] / total * 100).toFixed(1) + '%';
      t0.textContent = `${names[0]} ${sc[1]}`; t1.textContent = `${sc[2]} ${names[1]}`; barDirty = false;
    }

    // ------------------------------------------------------------------ camera
    const camBase = new THREE.Vector3(0, 20, 23), camLook = new THREE.Vector3(0, 1.2, -0.4);
    function cam(t) { camera.position.set(camBase.x + Math.sin(t * 0.3) * 0.5, camBase.y + Math.sin(t * 0.4) * 0.15, camBase.z); camera.lookAt(camLook); }

    // ------------------------------------------------------------------ einde
    function finishGame() {
      if (done) return; done = true;
      recount(); updateBar();
      const a = sc[1], b = sc[2]; winnerIdx = a > b ? 0 : b > a ? 1 : -1;
      pl.forEach((p) => { p.dashT = 0; });
      const w = winnerIdx;
      const diff = Math.abs(a - b);
      let line;
      if (w < 0) line = 'Precies gelijk! Zelfs de verf kan er niet tussen.';
      else {
        const win = names[w], lose = names[1 - w];
        if (diff <= 4) line = pick([`Fotofinish! ${win} wint met maar ${diff} puntje${diff === 1 ? '' : 's'} voorsprong.`, `Wat een spanning! ${lose} miste het net.`]);
        else if (diff >= 45) line = pick([`${lose} is helemaal ondergesneeuwd in ${win}'s verf!`, `Een verfbad voor ${lose}. ${win} is de Meester-Schilder!`]);
        else line = pick([`${win} is de beste schilder van het kasteel!`, `${lose} moet nog even oefenen met de kwast.`, `Mooi werk, ${win}! ${lose} krijgt een emmertje troost.`]);
      }
      const extra = [];
      if (stats.wiped[0] + stats.wiped[1] >= 10) extra.push(`Het Schoonmaak-Slijm poetste ${stats.wiped[0]} tegels van ${names[0]} en ${stats.wiped[1]} van ${names[1]} weg.`);
      if (stats.bucket[0] + stats.bucket[1] > 0) extra.push(`Gouden emmers: ${names[0]} ${stats.bucket[0]}, ${names[1]} ${stats.bucket[1]}.`);
      ctx.finishPvp({ winner: w < 0 ? null : w, score: [a, b], delay: 1300, summary: `<b>${a} – ${b}</b> punten (${cnt[1]} tegels tegen ${cnt[2]} tegels)<br>${line}${extra.length ? '<br><small>' + extra.join(' ') + '</small>' : ''}` });
      hud.setTimer(0);
      pl.forEach((p, i) => { p.c.pose = w < 0 ? 'idle' : w === i ? 'cheer' : 'sad'; });
    }

    // ------------------------------------------------------------------ hoofdlus
    function worldUpdate(dt, t) {
      hall.update(t, dt);
      for (let k = pq.length - 1; k >= 0; k--) { const q = pq[k]; q.t -= dt; if (q.t <= 0) { paintTile(q.idx, q.who); pq.splice(k, 1); } }
      updateTiles(t, dt); updateStars(t, dt); updateRings(dt);
      if (dirtyScore) { recount(); barDirty = true; }
      if (barDirty) updateBar();
    }
    function update(dt) {
      ensureBar();
      if (done) { resultUpdate(dt); return; }
      T += dt;
      const active = true;
      const timeLeft = TIME - T;
      if (!over && timeLeft <= 0) {
        recount();
        if (sc[1] === sc[2]) { over = true; overT = OVERTIME; hud.showBig('VERLENGING!', 1300, '#ff7a5a'); hud.setTimer(overT, 99); audio.sfx('bell', { vol: 0.6 }); }
        else { finishGame(); return; }
      }
      if (over) { overT -= dt; hud.setTimer(Math.max(0, overT), 99); if (overT <= 0) { finishGame(); return; } } else hud.setTimer(timeLeft, 10);
      if (!finalMode && timeLeft <= FINAL && !over) {
        finalMode = true; hud.showBig('DUBBELE BOMMEN!', 1100, '#ffe14a'); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('bell', { vol: 0.5 }); ctx.shake(0.4);
        pl.forEach((p) => { p.charges = Math.max(p.charges, 2); });
      }
      if (freeze > 0) freeze -= dt;
      // lopen (substeps voor stabiele botsingen)
      const n = Math.ceil(dt / 0.02), h = dt / n;
      for (let s = 0; s < n; s++) {
        for (const p of pl) playerStep(p, h, active);
        collide(pl[0], pl[1]);
      }
      updateSponge(dt); updateBucket(dt);
      bonusT -= dt; if (bonusT <= 0) { addBonus(); bonusT = rand(4.5, 6.5); }
      visuals(dt, T + introT, false);
      worldUpdate(dt, T + introT);
      cam(T + introT);
    }
    function resultUpdate(dt) {
      resultT += dt; ensureBar();
      for (const p of pl) { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); p.x += p.vx * dt; p.z += p.vz * dt; }
      updateSponge(dt * 0.4); visuals(dt, T + introT + resultT, true); worldUpdate(dt, T + introT + resultT); cam(T + introT + resultT);
      if (winnerIdx >= 0 && Math.random() < dt * 5) { const w = pl[winnerIdx]; fx.particles.burst(w.x + rand(-2, 2), 3 + rand(0, 2), w.z + rand(-2, 2), { count: 18, speed: 5, up: 1, life: 1.1, size: 0.4, colors: [PLAYER_COLORS[winnerIdx], 0xffe14a, 0xffffff, 0xff6fa5], gravity: 4 }); }
    }
    function introUpdate(dt) {
      introT += dt; ensureBar();
      pl.forEach((p, i) => { p.c.pose = Math.sin(introT * 2 + i) > 0.6 ? 'wave' : 'idle'; p.face = lerp(p.face, i ? -2.6 : 2.6, 0.1); });
      visuals(dt, introT, true); worldUpdate(dt, introT); cam(introT);
    }

    // beginstand
    for (let k = 0; k < 3; k++) addBonus(true);
    pl.forEach((p) => { p.c.update(0.016); });
    recount(); updateBar(); visuals(0.016, 0, true); worldUpdate(0.016, 0); cam(0);
    hud.setTimer(TIME); hud.setScore(null);

    return {
      update, resultUpdate, introUpdate,
      onCountdown() { ensureBar(); hud.setTimer(TIME); hud.setHint('★ tegels tellen dubbel  ·  Gouden emmer = reuzen-explosie  ·  Slijm wist verf'); },
      onStart() { ensureBar(); setTimeout(() => { if (!done) hud.setHint(null); }, 9000); },
      celebrate(w) { winnerIdx = w; },
      onSwap() { ctx.shake(0.2); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return;
          const mine = []; for (let k = 0; k < NN; k++) if (owner[k] === i + 1) mine.push(k);
          for (let k = 0; k < 6 && mine.length; k++) { const j = Math.floor(Math.random() * mine.length); const idx = mine.splice(j, 1)[0]; paintTile(idx, 0); }
          fx.texts.add('-6 tegels!', pl[i].x, 3.5, pl[i].z, '#ff7a7a', 1.2);
        });
      },
      dispose() { bar.remove(); pq.length = 0; },
      dbg: {
        state: () => ({ T, done, over, sc: sc.slice(1), cnt: cnt.slice(), winnerIdx, finalMode, sponge: { on: sp.on, x: sp.x, z: sp.z, vx: sp.vx, vz: sp.vz }, bucket: { on: bk.on, n: bk.n }, bonus: bonusList.length, stats, p: pl.map((p) => ({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, charges: p.charges, dashCd: p.dashCd, dashT: p.dashT, stun: p.stun, slow: p.slow, sz: p.sz })) }),
        owner, pl, sp, bk,
        tp: (i, x, z) => { pl[i].x = x; pl[i].z = z; },
        setSponge: (x, z, vx, vz) => { sp.on = true; sp.spawnT = 0; sp.x = x; sp.z = z; sp.vx = vx; sp.vz = vz; },
      },
    };
  },
};

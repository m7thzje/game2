import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, smoothstep, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as WD from './curling_world.js';

// Curling-Chaos — duel: curling op een ijsvloer in een bevroren zee. 4 ends van 3 stenen per speler, om-en-om, het laatste end telt dubbel.
//  * links/rechts = richting (de stippellijn laat de baan zien), omhoog/omlaag = draai (curl), A vast = kracht (meter gaat op en neer), los = slingeren
//  * tijdens het glijden: B herhaald tikken = VEGEN (sneller + rechter), links/rechts = bijsturen
//  * stenen botsen elastisch; chaos: ijsheuvel, ijsbeer/pinguïn die stenen wegduwt, zeehond die opduikt, bomsteen, gouden steen (dubbel) voor wie achterstaat
//  * wie de dichtstbijzijnde steen heeft scoort per steen die dichterbij ligt dan de beste van de ander. Gelijk: één beslissende steen.

const { HW, HACK, HZ, HOG, HR, BACK, SR } = WD.SH;
const Z0 = WD.SH.Z0;
const ENDS = 4, PER = 3, DEC = 3.6, KC = 1.1, STEER = 0.5, E_STONE = 0.9, E_WALL = 0.6, VMIN = 7, VMAX = 16.5, RELEASE_GAP = 1.1, AUTO_T = 9, SOFT_TIME = 150;
const HILL_R = 2.2, SEAL_R = 0.85;
const SCHEDULE = [[['bear', 9]], [['seal', 5], ['penguin', 13]], [['bear', 4], ['seal', 10]], [['penguin', 3], ['seal', 8], ['bear', 15]]];   // gimmicks per end: [soort, seconde in het end]
const tri = (u) => { u = ((u % 2) + 2) % 2; return u < 1 ? u : 2 - u; };

export default {
  id: 'curling',
  name: 'Curling-Chaos',
  giver: 'Pinguïn Piet',
  icon: '🥌',
  mode: 'pvp',
  time: 100,
  music: 'game',
  blurb: 'Curling op een bevroren zee! Slinger je steen naar het <b>huis</b>, <b>veeg</b> met B en knal elkaars stenen weg. Pas op voor <b>ijsheuvel, ijsbeer en zeehond</b>! Dichtste bij de roos scoort, laatste end <b>dubbel</b>.',
  controls: ['{move} richting en draai', '{a} vast = kracht, los = gooien', '{b} tikken tijdens glijden = vegen'],
  tip: 'Gouden steen = dubbel, bomsteen = knal!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name); const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const FM = lerp(1, 0.38, SLIP) * lerp(1, 0.72, clamp((1 - GRAV) / 0.6, 0, 1));    // wrijving (zeepvloer / maan: glad)
    const VS = Math.sqrt(FM);                                                          // zelfde meter-bereik, ook als het glad is
    const L = ctx.lights('ice', { shadow: 24, center: [0, 0, -2], fogNear: 90, fogFar: 240 });
    L.hemi.intensity = 1.25; L.sun.intensity = 2.3; L.sun.position.set(-16, 34, 18);
    camera.fov = 40; camera.updateProjectionMatrix();
    const W = WD.buildWorld(ctx);
    const rnd = Math.random;
    const cssCols = ['#7dffb0', '#8fb8ff'];

    // ---------------- stenen-pool (7 stuks: 6 + beslissende) ----------------
    const objs = Array.from({ length: 7 }, () => {
      const s = WD.makeStone(); s.g.visible = false; scene.add(s.g);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.scale.set(3.4, 3.4, 1); glow.position.y = 0.5; scene.add(glow);
      const shadow = mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x103050, transparent: true, opacity: 0.28, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); shadow.position.y = 0.025; scene.add(shadow);
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 80; const lg = lc.getContext('2d'); const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false })); label.scale.set(3.2, 1.0, 1); label.renderOrder = 15; label.visible = false; scene.add(label);
      return { ...s, glow, shadow, label, lc, lg, lt, labelKey: '' };
    });
    function setLabel(o, text, col) {
      const key = text + col; if (o.labelKey === key) return; o.labelKey = key; const g = o.lg;
      g.clearRect(0, 0, 256, 80); g.font = 'bold 44px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(15,10,40,.9)'; g.lineJoin = 'round'; g.strokeText(text, 128, 42); g.fillStyle = col; g.fillText(text, 128, 42); o.lt.needsUpdate = true;
    }

    // ---------------- spelers ----------------
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const kS = (2.5 / c.height) * lerp(1, pv.size(i), 0.5);
      const holder = new THREE.Group(); holder.add(c.group); holder.scale.setScalar(kS); const side = i ? 1 : -1; holder.position.set(side * 7.6, 0.3, HACK + 0.5); scene.add(holder);
      const broom = WD.makeBroom(); c.hold(broom, 'r'); broom.rotation.set(-0.9, 0, 0.0); broom.scale.setScalar(1 / kS * 1.3); broom.position.set(0, -0.05, 0.05);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, (g, w, h) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, h / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, h / 2); }), transparent: true, depthTest: false })); tag.scale.set(2.6, 0.97, 1); tag.renderOrder = 15; scene.add(tag);
      // richting-markering + stippellijn + stop-ring + meter
      const col = PLAYER_COLORS[i];
      const marker = mesh(new THREE.RingGeometry(0.45, 0.65, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); marker.position.y = 0.05; marker.visible = false; scene.add(marker);
      const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.17, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), 40); dots.frustumCulled = false; dots.visible = false; dots.count = 0; scene.add(dots);
      const stopR = mesh(new THREE.RingGeometry(0.62, 0.86, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); stopR.position.y = 0.06; stopR.visible = false; scene.add(stopR);
      const gc = document.createElement('canvas'); gc.width = 128; gc.height = 320; const gg = gc.getContext('2d'); const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
      const gauge = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, transparent: true, depthTest: false })); gauge.scale.set(1.5, 3.75, 1); gauge.renderOrder = 14; gauge.visible = false; scene.add(gauge);
      return { i, c, holder, broom, tag, side, kS, marker, dots, stopR, gauge, gg, gt, gkey: '', mx: 0, spin: 0, st: 'wait', charging: false, gT: 0, power: 0.44, pending: -1, aimT: 0, sweep: 0, tapT: 0, stone: null, score: 0, hx: side * 7.6, hz: HACK + 0.5, react: 0, run: 0, bounceT: 0 };
    });
    function drawGauge(p) {
      const key = `${Math.round(p.power * 40)}|${p.spin}|${p.charging ? 1 : 0}|${p.pending >= 0 ? 1 : 0}|${canRelease() ? 1 : 0}`; if (key === p.gkey) return; p.gkey = key; const g = p.gg;
      g.clearRect(0, 0, 128, 320);
      g.fillStyle = 'rgba(15,20,50,.72)'; g.beginPath(); g.roundRect(4, 4, 120, 312, 18); g.fill();
      g.font = 'bold 20px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.fillStyle = cssCols[p.i]; g.fillText('KRACHT', 64, 28);
      const x = 44, y0 = 44, h = 190, w = 40; const gr = g.createLinearGradient(0, y0 + h, 0, y0); gr.addColorStop(0, '#4aa8ff'); gr.addColorStop(0.45, '#6dff8a'); gr.addColorStop(0.75, '#ffe14a'); gr.addColorStop(1, '#ff5a3a');
      g.fillStyle = gr; g.beginPath(); g.roundRect(x, y0, w, h, 8); g.fill();
      // huis-zone: waar de steen ongeveer in het huis stopt
      const pHouse = (Math.sqrt(2 * DEC * FM * (HACK - HZ)) / VS - VMIN) / (VMAX - VMIN);
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.roundRect(x - 4, y0 + h - (pHouse + 0.07) * h, w + 8, 0.14 * h, 5); g.stroke();
      const my = y0 + h - p.power * h; g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 10, my - 9); g.lineTo(x + w + 10, my); g.lineTo(x - 10, my + 9); g.closePath(); g.stroke(); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 20px Fredoka, Arial Black, sans-serif'; g.fillText('DRAAI', 64, 262);
      g.font = 'bold 34px Arial'; g.fillStyle = p.spin === 0 ? '#9aa6d0' : '#ffe14a'; g.fillText(p.spin < 0 ? '↶ links' : p.spin > 0 ? 'rechts ↷' : '— recht —', 64, 296);
      p.gt.needsUpdate = true;
    }

    // ---------------- toestand ----------------
    let T0 = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0, timeLeft = SOFT_TIME, hudSec = -1, impactCd = 0;
    const G = { st: 'init', t: 0, end: 0, endT: 0, turnIdx: 0, sinceThrow: 9, first: Math.floor(rnd() * 2), sd: false, rush: false, winner: -1, order: [], results: [] };
    const ends = [];                 // per end [scoreP0, scoreP1]
    let stones = [];                 // stenen van het huidige end
    const stats = { collisions: 0, bombs: 0, seal: 0, walker: 0, outs: 0, tekort: 0, gold: 0, sweeps: [0, 0], throws: 0, knock: 0 };
    const hill = { x: 0, z: -2.5, m: WD.makeHill() }; hill.m.scale.set(HILL_R, HILL_R, HILL_R); scene.add(hill.m);
    const hole = { m: WD.makeHole(), seal: WD.makeSeal(), st: 'idle', t: 0, x: 0, z: -6, kicked: false }; hole.m.visible = false; hole.seal.visible = false; scene.add(hole.m, hole.seal);
    const walker = { on: false, kind: 'bear', obj: null, x: 0, z: -2, vx: 0, r: 1, t: 0 };
    const bear = WD.makeBear(), peng = WD.makePenguin(); bear.visible = peng.visible = false; scene.add(bear, peng);
    let sched = [];                  // nog te starten gimmicks in dit end
    const dm = new THREE.Object3D();
    const rings = Array.from({ length: 6 }, () => { const m = mesh(new THREE.RingGeometry(0.72, 0.95, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); m.visible = false; m.position.y = 0.07; scene.add(m); return m; });

    const total = (i) => pl[i].score;
    const curEndMul = () => (G.sd ? 1 : G.end === ENDS - 1 ? 2 : 1);
    function refreshHud() {
      hud.setScore(`${names[0]} ${pl[0].score} – ${pl[1].score} ${names[1]}  ·  ${G.sd ? 'BESLISSENDE STEEN' : `eind ${Math.min(G.end + 1, ENDS)}/${ENDS}${G.end === ENDS - 1 ? ' (dubbel!)' : ''}`}`);
      for (const p of pl) { const left = stones.filter((q) => q.owner === p.i && q.st === 'queued').length + (p.stone && p.stone.st === 'ready' ? 1 : 0); hud.setPlayerInfo(p.i, `${p.score} pt · ${left} stenen`); }
      W.board(names, cssCols, ends, [pl[0].score, pl[1].score], G.sd ? 4 : G.end);
    }
    function say(text, x, y, z, col = '#ffe14a', sc = 1.6) { fx.texts.add(text, x, y, z, col, sc); }

    // ---------------- natuurkunde ----------------
    function curlOf(q, sp) { return q.spin * KC * clamp(1 - sp / 14, 0.15, 1) * (1 - 0.7 * q.sweep) + q.steer * STEER; }
    function stepStone(q, h) {
      let sp = Math.hypot(q.vx, q.vz);
      let ax = 0, az = 0, dec = DEC * FM * (1 - 0.22 * q.sweep);
      // ijsheuvel: stoot weg + remt
      const hx = q.x - hill.x, hz = q.z - hill.z, hd = Math.hypot(hx, hz);
      if (hd < HILL_R) { const k = 1 - hd / HILL_R; if (k > 0.1 || sp > 0.3) { const a = 10 * k * (hd > 1e-3 ? 1 : 0); ax += hx / (hd || 1) * a; az += hz / (hd || 1) * a; dec *= 1 + 1.2 * k; q.hillT = 0.2; } }
      if (sp > 0.004) {
        const nx = q.vx / sp, nz = q.vz / sp; sp = Math.max(0, sp - dec * h);
        const cu = curlOf(q, sp) * h; q.vx = nx * sp - nz * cu; q.vz = nz * sp + nx * cu;
      } else { q.vx = q.vz = 0; }
      q.vx += ax * h; q.vz += az * h;
      if (Math.hypot(q.vx, q.vz) < 0.02 && Math.abs(ax) + Math.abs(az) < 0.6) { q.vx = q.vz = 0; }
      q.x += q.vx * h; q.z += q.vz * h;
      // zijkanten (stootkussens) en achterkant van de hack
      const lim = HW - q.r; if (q.x > lim) { q.x = lim; if (q.vx > 0) { q.vx = -q.vx * E_WALL; q.wallHit = 1; } } else if (q.x < -lim) { q.x = -lim; if (q.vx < 0) { q.vx = -q.vx * E_WALL; q.wallHit = 1; } }
      const zl = Z0 - 0.5 - q.r; if (q.z > zl) { q.z = zl; if (q.vz > 0) { q.vz = -q.vz * E_WALL; q.wallHit = 1; } }
    }
    function predict(mx, spin, power, outPath) {
      const dx = mx, dz = HZ - HACK, dl = Math.hypot(dx, dz); const v = lerp(VMIN, VMAX, power) * VS;
      const q = { x: 0, z: HACK, vx: dx / dl * v, vz: dz / dl * v, spin, sweep: 0, steer: 0, r: SR, wallHit: 0 };
      let n = 0, idx = 0; const H = 1 / 40;
      for (let s = 0; s < 260; s++) {
        stepStone(q, H); if (outPath && s % 4 === 0 && idx < 40) { outPath[idx++] = q.x; outPath[idx++] = q.z; }
        if (q.z < BACK) break; if (Math.hypot(q.vx, q.vz) < 0.02) break; n++;
      }
      if (outPath) outPath.n = idx / 2;
      return { x: q.x, z: q.z, out: q.z < BACK };
    }
    function collide(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, mm = a.r + b.r, d2 = dx * dx + dz * dz; if (d2 >= mm * mm || d2 < 1e-8) return;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, im = 1 / a.m + 1 / b.m, ov = mm - d;
      a.x -= nx * ov * (1 / a.m) / im; a.z -= nz * ov * (1 / a.m) / im; b.x += nx * ov * (1 / b.m) / im; b.z += nz * ov * (1 / b.m) / im;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; if (rel <= 0) return;
      const j = (1 + E_STONE) * rel / im; a.vx -= j / a.m * nx; a.vz -= j / a.m * nz; b.vx += j / b.m * nx; b.vz += j / b.m * nz;
      a.spin *= 0.3; b.spin *= 0.3; a.hit = b.hit = 1;
      impact(rel, (a.x + b.x) / 2, (a.z + b.z) / 2, a, b);
    }
    function impact(rel, x, z, a, b) {
      if (rel > 1) stats.collisions++;
      const k = clamp(rel / 12, 0, 1);
      if (k > 0.07) { audio.sfx('hit', { vol: 0.3 + k * 0.6, rate: 0.8 + k * 0.5 }); audio.sfx('ding', { vol: 0.12 + k * 0.2, rate: 1.2 + k * 0.4 }); }
      if (k > 0.12) fx.particles.burst(x, 0.5, z, { count: 5 + Math.round(k * 16), speed: 2 + k * 5, up: 1, life: 0.5, size: 0.25, colors: [0xffffff, 0xcfeeff, 0x9fe0ff], gravity: 8 });
      if (k > 0.3) ctx.shake(0.1 + k * 0.3);
      if (rel > 8 && impactCd <= 0) { impactCd = 1.2; slow = 0.3; slowHold = 0.35; say('KNAL!', x, 2.2, z, '#ffffff', 1.8); fx.particles.ring(x, 0.4, z, { count: 22, speed: 6, color: 0xffffff, size: 0.35, life: 0.5 }); W.cheer(1.2, 0.5); stats.knock++; }
    }
    function physics(dt) {
      const live = stones.filter((q) => q.st === 'glide' || q.st === 'rest');
      let vmax = 1; for (const q of live) vmax = Math.max(vmax, Math.hypot(q.vx, q.vz));
      const n = clamp(Math.ceil(vmax * dt / 0.1), 1, 12), h = dt / n;
      for (let s = 0; s < n; s++) {
        for (const q of live) {
          if (q.st === 'out') continue;
          stepStone(q, h);
          // zeehond (vast obstakel zolang hij boven water is) en wandelaar (bewegend)
          if (hole.st === 'up') { const dx = q.x - hole.x, dz = q.z - hole.z, d = Math.hypot(dx, dz), mm = q.r + SEAL_R; if (d < mm && d > 1e-4) { const nx = dx / d, nz = dz / d; q.x = hole.x + nx * mm; q.z = hole.z + nz * mm; const vn = q.vx * nx + q.vz * nz; if (vn < 0) { q.vx -= 1.9 * vn * nx; q.vz -= 1.9 * vn * nz; audio.sfx('boing', { vol: 0.4 }); hole.hit = 1; } } }
          if (walker.on) { const dx = q.x - walker.x, dz = q.z - walker.z, d = Math.hypot(dx, dz), mm = q.r + walker.r; if (d < mm && d > 1e-4) { const nx = dx / d, nz = dz / d; q.x = walker.x + nx * mm; q.z = walker.z + nz * mm; const vn = (q.vx - walker.vx) * nx + q.vz * nz; if (vn < 0) { q.vx -= 1.8 * vn * nx; q.vz -= 1.8 * vn * nz; walker.hit = 1; if (q.pushT === undefined || q.pushT <= 0) { audio.sfx(walker.kind === 'bear' ? 'thud' : 'pop', { vol: 0.5 }); say(walker.kind === 'bear' ? 'BROM!' : 'POEF!', q.x, 2, q.z, '#ffd2a0', 1.2); stats.walker++; q.pushT = 0.8; } } } }
        }
        for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) collide(live[a], live[b]);
      }
      for (const q of live) { q.pushT = (q.pushT || 0) - dt; q.hit = Math.max(0, (q.hit || 0) - dt * 4); if (q.wallHit) { audio.sfx('thud', { vol: 0.25, rate: 1.3 }); fx.particles.burst(q.x, 0.4, q.z, { count: 5, speed: 2, up: 1, life: 0.4, size: 0.2, colors: [0xffffff], gravity: 6 }); q.wallHit = 0; } }
      // buiten spel / tot stilstand komen
      for (const q of live) {
        const sp = Math.hypot(q.vx, q.vz);
        if (q.z < BACK) { outStone(q, 'water'); continue; }
        if (q.st === 'glide' && sp < 0.12 && !q.hillT) {
          q.vx = q.vz = 0; q.st = 'rest'; const p = pl[q.owner]; p.sweep = 0;
          if (q.z > HOG - 0.05 && !q.bomb) outStone(q, 'tekort');
          else if (q.bomb) { q.fuse = 1.7; say('TIK TIK...', q.x, 2.3, q.z, '#ff7a6a', 1.2); audio.sfx('tick', { vol: 0.5 }); }
          else audio.sfx('click', { vol: 0.25, rate: 0.7 });
        }
        if (q.hillT) q.hillT = Math.max(0, q.hillT - dt);
        if (q.bomb && q.st === 'rest' && q.fuse > 0) { const f0 = q.fuse; q.fuse -= dt; if (Math.floor(f0 * 4) !== Math.floor(q.fuse * 4)) audio.sfx('tick', { vol: 0.3, rate: 1 + (1.7 - q.fuse) * 0.5 }); if (q.fuse <= 0) explode(q); }
      }
    }
    function outStone(q, why) {
      if (q.st === 'out') return; q.st = 'out'; q.outT = 0; q.why = why; stats.outs++;
      const p = pl[q.owner]; if (q.owner >= 0) p.sweep = 0;
      if (why === 'water') { fx.particles.burst(q.x, 0.2, Math.max(q.z, BACK - 0.4), { count: 36, speed: 6, up: 2, life: 1.0, size: 0.5, colors: [0xffffff, 0x9fe0ff, 0x4a9aff], gravity: 9 }); audio.sfx('splash', { vol: 0.7 }); say('PLONS!', q.x, 2.4, BACK - 0.5, '#9fe8ff', 1.5); ctx.shake(0.2); }
      else if (why === 'tekort') { stats.tekort++; say('TE KORT!', q.x, 2.2, q.z, '#ff9a9a', 1.3); audio.sfx('buzz', { vol: 0.35 }); fx.particles.burst(q.x, 0.5, q.z, { count: 14, speed: 3, up: 1, life: 0.6, size: 0.3, colors: [0xffffff, 0xcfeeff], gravity: 6 }); }
      else if (why === 'bom') { /* ontploft */ }
    }
    function explode(q) {
      stats.bombs++; q.st = 'out'; q.why = 'bom'; q.outT = 9; slow = 0.35; slowHold = 0.6;
      const R = 4.6;
      for (const o of stones) { if (o === q || (o.st !== 'rest' && o.st !== 'glide')) continue; const dx = o.x - q.x, dz = o.z - q.z, d = Math.hypot(dx, dz); if (d < R) { const k = 1 - d / R, f = (5 + 12 * k) / Math.sqrt(o.m); const nn = d > 1e-3 ? d : 1; o.vx += dx / nn * f; o.vz += dz / nn * f; if (!d) o.vx += f; if (o.st === 'rest') o.st = 'rest'; } }
      fx.particles.burst(q.x, 0.6, q.z, { count: 80, speed: 9, up: 1.4, life: 1.1, size: 0.6, colors: [0xff7a1a, 0xffd23f, 0xff3a0a, 0xffffff], gravity: 5 });
      fx.particles.ring(q.x, 0.4, q.z, { count: 36, speed: 10, color: 0xffd23f, size: 0.5, life: 0.6 }); fx.particles.burst(q.x, 0.5, q.z, { count: 30, speed: 6, up: 0.3, life: 1.2, size: 1.0, colors: [0x555566, 0x888899], gravity: -1 });
      say('BOEM!', q.x, 2.6, q.z, '#ff9a3a', 2.4); audio.sfx('explode', { vol: 0.9 }); ctx.shake(0.7); W.cheer(2.5, 1);
    }

    // ---------------- end opzetten ----------------
    function beginEnd(sd, silent) {
      G.sd = !!sd; G.t = 0; G.endT = 0; G.turnIdx = 0; G.sinceThrow = 9;
      for (const o of objs) { o.g.visible = false; o.glow.material.opacity = 0; o.shadow.visible = false; o.label.visible = false; }
      for (const r of rings) r.visible = false;
      const f = G.first; G.order = sd ? [f, 1 - f] : [f, 1 - f, f, 1 - f, f, 1 - f];
      stones = G.order.map((owner, k) => {
        const p = pl[owner]; const r = SR * lerp(1, pv.size(owner), 0.35);
        return { k, owner, o: objs[k], r, m: (r / SR) ** 2, x: 0, z: HACK, vx: 0, vz: 0, spin: 0, sweep: 0, steer: 0, st: 'queued', gold: false, bomb: false, fuse: 0, outT: 0, y: 0, hit: 0, ang: 0 };
      });
      for (const p of pl) { p.stone = null; p.st = 'wait'; p.charging = false; p.pending = -1; p.mx = 0; p.spin = 0; p.sweep = 0; }
      // gimmicks per end: heuvel, gouden steen (achterstaander), bomstenen (eind 2 en 3)
      if (!sd) {
        const e = G.end;
        if (e >= 1 && pl[0].score !== pl[1].score) { const tr = pl[0].score < pl[1].score ? 0 : 1; const lastK = G.order.map((o, k) => (o === tr ? k : -1)).filter((k) => k >= 0).pop(); stones[lastK].gold = true; stats.gold++; }
        if (e === 1 || e === 2) for (const o of [0, 1]) { const ks = stones.filter((q) => q.owner === o && !q.gold); pick(ks).bomb = true; }
      }
      stones.forEach((q) => { q.o.hm.color.setHex(q.gold ? 0xffd23f : PLAYER_COLORS[q.owner]); q.o.hm.emissive.setHex(q.gold ? 0x8a5a00 : 0x000000); q.o.bodyMat.color.setHex(q.gold ? 0xd8b24a : q.bomb ? 0x23252c : 0x8e939c); q.o.bodyMat.metalness = q.gold ? 0.7 : 0.1; q.o.fuse.visible = q.bomb; q.o.g.scale.setScalar(q.r); q.o.shadow.scale.setScalar(q.r * 1.15); });
      // heuvel
      hill.x = rand(-2.4, 2.4); hill.z = rand(-4.2, -0.8); hill.m.visible = true; hill.m.position.set(hill.x, 0, hill.z); hill.m.scale.set(0.01, 0.01, 0.01); hill.pop = 0;
      sched = sd ? [] : SCHEDULE[Math.min(G.end, SCHEDULE.length - 1)].map(([k, t]) => ({ kind: k, t })); walker.on = false; bear.visible = peng.visible = false; hole.st = 'idle'; hole.m.visible = false; hole.seal.visible = false;
      if (silent) { refreshHud(); return; }
      if (!sd) hud.showBig(G.end === ENDS - 1 ? 'LAATSTE END: DUBBEL!' : `EIND ${G.end + 1}`, 1300, G.end === ENDS - 1 ? '#ffd23f' : '#ffffff');
      else hud.showBig('BESLISSENDE STEEN!', 1600, '#ffd23f');
      if (!sd && G.end >= 1) { const g = stones.find((q) => q.gold); if (g) hud.toast(`✨ ${names[g.owner]} krijgt een GOUDEN steen (telt dubbel)!`, 2200); }
      if (!sd && (G.end === 1 || G.end === 2)) hud.toast('💣 Iedereen heeft één BOMSTEEN dit end!', 2000);
      audio.sfx('bell', { vol: 0.5 }); refreshHud();
    }
    function spawnWalker(kind) {
      const dir = rnd() < 0.5 ? 1 : -1; const z = rand(-5.2, -0.4);
      walker.kind = kind; walker.on = true; walker.r = kind === 'bear' ? 1.05 : 0.6; walker.z = z; walker.x = -dir * (HW + 2.2); walker.vx = dir * (kind === 'bear' ? 2.2 : 3.8); walker.t = 0; walker.hit = 0; walker.dir = dir;
      walker.obj = kind === 'bear' ? bear : peng; bear.visible = kind === 'bear'; peng.visible = kind !== 'bear';
      hud.toast(kind === 'bear' ? '🐻‍❄️ Een ijsbeer wandelt over de baan!' : '🐧 Een pinguïn komt aangeslid!', 1800); audio.sfx(kind === 'bear' ? 'creak' : 'pop', { vol: 0.5 });
    }
    function spawnSeal() {
      for (let t = 0; t < 12; t++) { const x = rand(-3.6, 3.6), z = rand(-9.6, -3.5); if (stones.some((q) => q.st === 'rest' && Math.hypot(q.x - x, q.z - z) < 1.6) && t < 11) continue; Object.assign(hole, { x, z, st: 'crack', t: 0, kicked: false, hit: 0 }); break; }
      hole.m.visible = true; hole.m.position.set(hole.x, 0, hole.z); hole.m.scale.set(0.01, 1, 0.01); hud.toast('🦭 Het ijs kraakt... een zeehond komt eraan!', 1800); audio.sfx('creak', { vol: 0.6 });
    }

    // ---------------- worp / invoer ----------------
    const canRelease = () => G.sinceThrow >= RELEASE_GAP || G.rush;
    function readyStone(p) {
      const q = stones[G.turnIdx]; p.stone = q; q.st = 'ready'; q.x = 0; q.z = HACK; q.vx = q.vz = 0; q.o.g.visible = true; q.o.shadow.visible = true; q.o.g.position.set(0, 0, HACK); q.pop = 0; p.aimT = 0; p.st = 'aim'; p.power = 0.44; p.charging = false; p.pending = -1;
      audio.sfx('click', { vol: 0.25, rate: 1.5 }); refreshHud();
    }
    function throwStone(p, power) {
      const q = p.stone; if (!q) return; const dl = Math.hypot(p.mx, HZ - HACK); const v = lerp(VMIN, VMAX, power) * VS;
      q.vx = p.mx / dl * v; q.vz = (HZ - HACK) / dl * v; q.spin = p.spin; q.st = 'glide'; q.sweep = 0; q.steer = 0; q.hillT = 0.3;
      p.st = 'glide'; p.charging = false; p.pending = -1; G.sinceThrow = 0; G.turnIdx++; stats.throws++; p.sweep = 0; p.tapT = 0;
      audio.sfx('swing', { vol: 0.6, rate: 0.7 + power * 0.5 }); audio.sfx('whoosh', { vol: 0.4, rate: 0.8 }); ctx.shake(0.06 + power * 0.1);
      fx.particles.burst(0, 0.3, HACK - 0.4, { count: 10, speed: 3, up: 0.6, life: 0.5, size: 0.3, colors: [0xffffff, 0xcfeeff], gravity: 4 }); p.c.swing();
      if (q.gold) say('GOUD x2!', 0, 2.6, HACK - 1, '#ffd23f', 1.6);
      if (q.bomb) say('BOM!', 0, 2.6, HACK - 1, '#ff7a6a', 1.6);
      refreshHud();
    }
    function updatePlayer(p, dt) {
      const inp = pv.input(p.i); const live = G.st === 'play' || G.st === 'sudden';
      if (!live) { p.charging = false; return; }
      // beurt-logica: wie mag aanleggen?
      const myTurn = G.turnIdx < G.order.length && G.order[G.turnIdx] === p.i;
      const busy = stones.some((q) => q.owner === p.i && q.st === 'glide');
      if (p.st === 'wait' && myTurn && !busy) readyStone(p);
      if (p.st === 'glide') {
        const q = p.stone;
        if (!q || q.st !== 'glide') { p.st = 'wait'; p.sweep = 0; }
        else {
          // vegen: B tikken
          if (inp.bP) { p.sweep = Math.min(1, p.sweep + 0.3 * pv.speed(p.i)); p.c.swing(); stats.sweeps[p.i]++; audio.sfx('scrape', { vol: 0.25 + p.sweep * 0.2, rate: 1.1 + p.sweep * 0.5 }); fx.particles.burst(q.x, 0.2, q.z - q.r - 0.3, { count: 4, speed: 2.5, up: 0.7, life: 0.4, size: 0.22, colors: [0xffffff, 0xcfeeff], gravity: 5 }); p.bounceT = 0.25; }
          p.sweep = Math.max(0, p.sweep - dt * 1.15); q.sweep = p.sweep; q.steer = clamp(inp.x, -1, 1) * pv.speed(p.i);
          if (p.sweep > 0.2 && Math.random() < dt * 20) fx.particles.emit(q.x + (Math.random() - 0.5), 0.3, q.z - q.r - 0.2, (Math.random() - 0.5) * 1.5, 1, (Math.random() - 0.3) * 1.5, { life: 0.4, size: 0.2, color: 0xffffff, gravity: 3 });
        }
      } else if (p.st === 'aim') {
        const q = p.stone; p.aimT += dt;
        p.mx = clamp(p.mx + inp.x * 4.2 * pv.speed(p.i) * dt, -HW + 0.9, HW - 0.9);
        if (inp.upP) { p.spin = clamp(p.spin + 0.5, -1, 1); audio.sfx('click', { vol: 0.25, rate: 1.6 }); } if (inp.downP) { p.spin = clamp(p.spin - 0.5, -1, 1); audio.sfx('click', { vol: 0.25, rate: 1.2 }); }
        // spin: omhoog = naar rechts draaien, omlaag = naar links (gebruik tekenwissel zodat omhoog 'rechts' is)
        if (inp.aP && !p.charging) { p.charging = true; p.gT = 0; p.pending = -1; audio.sfx('select', { vol: 0.3, rate: 1.4 }); }
        if (p.charging) {
          p.gT += dt * pv.speed(p.i); p.power = tri(p.gT / 0.9);
          if (Math.floor(p.gT * 14) !== Math.floor((p.gT - dt) * 14)) audio.tone(200 + p.power * 700, 0.05, { type: 'triangle', vol: 0.05 });
          if (!inp.a) { p.charging = false; if (canRelease()) throwStone(p, p.power); else p.pending = p.power; }
        }
        if (p.pending >= 0 && canRelease()) throwStone(p, p.pending);
        if (p.aimT > AUTO_T || (G.rush && p.st === 'aim' && canRelease())) { if (p.st === 'aim' && canRelease()) { if (!G.rush) hud.toast(`🐧 ${names[p.i]} slaapt! De pinguïn gooit de steen`, 1500); throwStone(p, 0.42 + rnd() * 0.06); } }
      }
    }

    // ---------------- scoren ----------------
    function scoreEnd() {
      const R = HR + SR;
      const inHouse = stones.filter((q) => q.st === 'rest' && Math.hypot(q.x, q.z - HZ) <= R).map((q) => ({ q, d: Math.hypot(q.x, q.z - HZ) })).sort((a, b) => a.d - b.d);
      let winner = -1, pts = 0; const sc = [];
      if (inHouse.length) {
        winner = inHouse[0].q.owner;
        for (const it of inHouse) { if (it.q.owner !== winner) break; pts += it.q.gold ? 2 : 1; sc.push(it.q); }
      }
      return { winner, pts, sc, inHouse };
    }
    function finishScoring() {
      if (G.sd) { sdResolve(); return; }
      const r = scoreEnd(); const mul = curEndMul(); const res = [0, 0];
      if (r.winner >= 0) res[r.winner] = r.pts * mul;
      ends[G.end] = res; for (const p of pl) p.score += res[p.i];
      G.st = 'scoring'; G.t = 0;
      for (let k = 0; k < rings.length; k++) { const q = r.sc[k]; rings[k].visible = !!q; if (q) rings[k].position.set(q.x, 0.07, q.z); }
      if (r.winner >= 0) { const w = r.winner; hud.showBig(`${names[w]} scoort ${res[w]}!${mul > 1 ? ' (dubbel)' : ''}`, 1800, w ? '#8fb8ff' : '#7dffb0'); audio.sfx('win', { vol: 0.5 }); audio.sfx('coin', { vol: 0.5 }); W.cheer(2.5, 1); pl[w].react = 1.6; pl[w].c.pose = 'cheer'; G.first = 1 - w; for (const q of r.sc) fx.particles.burst(q.x, 0.8, q.z, { count: 22, speed: 5, up: 1.2, life: 0.9, size: 0.4, colors: [0xffd23f, 0xffffff, 0xff9a3a], gravity: 4 }); }
      else { hud.showBig('Niemand scoort!', 1500, '#cfe0ff'); audio.sfx('buzz', { vol: 0.3 }); G.first = 1 - G.first; }
      refreshHud();
    }
    function sdResolve() {
      const R = 99; const d = [0, 1].map((o) => { const q = stones.find((s) => s.owner === o); return q && q.st === 'rest' ? Math.hypot(q.x, q.z - HZ) : R; });
      let w; if (d[0] !== d[1]) w = d[0] < d[1] ? 0 : 1; else w = rnd() < 0.5 ? 0 : 1;
      G.sdD = d; for (const k of [0, 1]) { const q = stones.find((s) => s.owner === k); if (q && q.st === 'rest') { rings[k].visible = true; rings[k].position.set(q.x, 0.07, q.z); } }
      G.winner = w; endMatch(w, true);
    }
    function endMatch(w, viaSd) {
      if (G.st === 'end') return; G.st = 'end'; G.t = 0; G.winner = w; G.viaSd = !!viaSd; slow = 1; hud.setTimer(null);
      if (w != null) { pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; pl[w].react = 99; pl[1 - w].react = 99; hud.showBig(`${names[w]} WINT!`, 1600, w ? '#8fb8ff' : '#7dffb0'); W.cheer(6, 1); audio.sfx('win', { vol: 0.6 }); }
    }
    function finishMatch() {
      if (finished) return; finished = true; const w = G.winner;
      const l = 1 - w;
      const jokes = [`${names[w]} is de Curling-Koning! ${names[l]} veegt nog steeds.`, `${names[w]} slingert als een pro. ${names[l]} slingerde vooral in het water.`, `De pinguïns joelen voor ${names[w]}. ${names[l]} krijgt een troostvis.`, `Dikke knal van ${names[w]}! ${names[l]} zoekt de steen nog.`];
      const bits = []; if (stats.bombs) bits.push(`${stats.bombs} bom${stats.bombs > 1 ? 'men' : ''}`); if (stats.walker) bits.push(`${stats.walker}× weggeduwd door een dier`); if (stats.outs) bits.push(`${stats.outs} stenen uit het spel`);
      ctx.finishPvp({ winner: w, score: [pl[0].score, pl[1].score], delay: 900, summary: `${pick(jokes)}${G.viaSd ? ' De beslissende steen gaf de doorslag.' : ''}${bits.length ? ' (' + bits.join(', ') + ')' : ''}` });
    }

    // ---------------- hoofd-flow ----------------
    function update(dt) {
      dt = Math.min(dt, 0.05); T0 += dt;
      if (!started) { started = true; G.st = 'play'; G.end = 0; beginEnd(false); }
      impactCd -= dt;
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3.5, dt);
      const sdt = dt * slow;
      if (T0 > 330 && !finished && G.st !== 'end') endMatch(pl[0].score === pl[1].score ? (rnd() < 0.5 ? 0 : 1) : (pl[0].score > pl[1].score ? 0 : 1));
      if (G.st === 'play' || G.st === 'sudden') {
        G.endT += sdt; G.sinceThrow += sdt; if (!G.sd) { timeLeft -= sdt; if (Math.floor(timeLeft) !== hudSec) { hudSec = Math.floor(timeLeft); hud.setTimer(Math.max(0, timeLeft), 15); } if (timeLeft <= 0 && !G.rush) { G.rush = true; hud.showBig('TIJD! Snel afmaken', 1400, '#ffd23f'); audio.sfx('bell', { vol: 0.8 }); } }
        for (const p of pl) updatePlayer(p, sdt);
        physics(sdt);
        updateHazards(sdt);
        // einde van het end: alles gegooid en alles tot rust
        if (G.turnIdx >= G.order.length && stones.every((q) => q.st !== 'glide' && q.st !== 'queued' && q.st !== 'ready' && (q.vx === 0 && q.vz === 0 || q.st === 'out') && !(q.bomb && q.st === 'rest' && q.fuse > 0)) && !(walker.on && walker.x * walker.dir < HW + 1) && hole.st !== 'up') {
          G.settle = (G.settle || 0) + dt; if (G.settle > 0.7) { G.settle = 0; finishScoring(); }
        } else G.settle = 0;
      } else if (G.st === 'scoring') {
        G.t += dt; physics(sdt);
        if (G.t > 3.4) {
          if (G.end + 1 >= ENDS || G.rush) { if (pl[0].score !== pl[1].score) endMatch(pl[0].score > pl[1].score ? 0 : 1); else { G.st = 'sudden'; G.first = Math.floor(rnd() * 2); G.sdMode = true; beginEnd(true); G.st = 'sudden'; } }
          else { G.end++; G.st = 'play'; beginEnd(false); }
        }
      } else if (G.st === 'end') { G.t += dt; if (G.t > 2.4 && !finished) finishMatch(); }
      visuals(dt); updateCamera(dt);
    }
    function updateHazards(dt) {
      if (G.sd) return;
      for (let k = sched.length - 1; k >= 0; k--) { if (G.endT >= sched[k].t && G.turnIdx >= 1) { const s = sched.splice(k, 1)[0]; if (s.kind === 'seal') { if (hole.st === 'idle') spawnSeal(); } else spawnWalker(s.kind); } }
      if (walker.on) { walker.t += dt; walker.x += walker.vx * dt; walker.hit = Math.max(0, walker.hit - dt * 3); if (walker.x * walker.dir > HW + 2.6) { walker.on = false; bear.visible = peng.visible = false; } }
      if (hole.st !== 'idle') {
        hole.t += dt; hole.hit = Math.max(0, (hole.hit || 0) - dt * 3);
        if (hole.st === 'crack' && hole.t > 1.7) { hole.st = 'up'; hole.t = 0; stats.seal++; audio.sfx('splash', { vol: 0.7 }); audio.sfx('boing', { vol: 0.6 }); ctx.shake(0.35);
          fx.particles.burst(hole.x, 0.4, hole.z, { count: 40, speed: 6, up: 2, life: 0.9, size: 0.45, colors: [0xffffff, 0x9fe0ff, 0x4a9aff], gravity: 9 }); say('PLONS!', hole.x, 3.6, hole.z, '#9fe8ff', 1.6);
          for (const q of stones) { if (q.st !== 'rest' && q.st !== 'glide') continue; const dx = q.x - hole.x, dz = q.z - hole.z, d = Math.hypot(dx, dz); if (d < 2.4) { const f = 8 * (1 - d / 2.4) + 3; q.vx += dx / (d || 1) * f; q.vz += dz / (d || 1) * f; if (q.st === 'rest') { q.st = 'rest'; } } } }
        else if (hole.st === 'up' && hole.t > 2.0) { hole.st = 'down'; hole.t = 0; audio.sfx('pop', { vol: 0.4, rate: 0.7 }); }
        else if (hole.st === 'down' && hole.t > 0.5) { hole.st = 'idle'; hole.m.visible = false; hole.seal.visible = false; }
      }
    }
    function visuals(dt) {
      const tt = T0 + introT;
      // heuvel-pop
      hill.pop = Math.min(1, (hill.pop || 0) + dt * 2.5); const hs = smoothstep(0, 1, hill.pop) * HILL_R; hill.m.scale.set(hs, hs, hs);
      // stenen
      for (const q of stones) {
        const o = q.o; const g = o.g;
        if (q.st === 'queued') { g.visible = false; o.shadow.visible = false; o.label.visible = false; o.glow.material.opacity = 0; continue; }
        q.pop = Math.min(1, (q.pop ?? 1) + dt * 3.2);
        let y = 0, sc = q.r;
        if (q.st === 'ready') { y = 0 + (1 - smoothstep(0, 1, q.pop)) * 1.6; }
        if (q.st === 'out') {
          q.outT += dt; if (q.why === 'water') { y = -q.outT * 3.0; q.x += 0; } else if (q.why === 'bom') { sc = 0.001; } else { sc = q.r * Math.max(0.001, 1 - q.outT * 2.5); y = q.outT * 1.2; }
          if (q.outT > 1.0) { g.visible = false; o.shadow.visible = false; o.label.visible = false; o.glow.material.opacity = 0; continue; }
        }
        if (GRAV < 1 && q.st === 'glide') y += Math.abs(Math.sin(tt * 4)) * 0.25;
        g.position.set(q.x, y, q.z); g.scale.setScalar(sc * (1 + (q.hit || 0) * 0.1)); q.ang += (q.spin * 1.5 + Math.hypot(q.vx, q.vz) * 0.0) * dt; g.rotation.y = q.ang;
        o.shadow.position.set(q.x, 0.03, q.z); o.shadow.scale.setScalar(q.r * 1.12 * (1 - Math.min(0.5, y * 0.2))); o.shadow.visible = q.st !== 'out' || q.why !== 'water';
        if (q.bomb) { const fl = q.st === 'rest' && q.fuse > 0 ? (Math.sin(tt * (10 + (1.7 - q.fuse) * 14)) > 0 ? 1 : 0.2) : 0.35 + Math.sin(tt * 6) * 0.15; o.bodyMat.emissive.setRGB(fl * 0.8, fl * 0.1, 0); o.fuse.visible = q.st !== 'out'; o.fuse.children[1].scale.setScalar(1 + Math.sin(tt * 30) * 0.3); if (Math.random() < dt * 12) fx.particles.emit(q.x, 0.8 + y + q.r, q.z, (Math.random() - 0.5), 1.2, (Math.random() - 0.5), { life: 0.35, size: 0.22, color: Math.random() < 0.5 ? 0xffa020 : 0xffe14a, gravity: -1 }); }
        else if (q.gold) { o.glow.material.color.setHex(0xffd23f); o.glow.material.opacity = q.st === 'out' ? 0 : 0.35 + Math.sin(tt * 5) * 0.12; o.glow.position.set(q.x, 0.5, q.z); if (q.st !== 'out' && Math.random() < dt * 6) fx.particles.emit(q.x + (Math.random() - 0.5), 0.6 + Math.random(), q.z + (Math.random() - 0.5), 0, 0.8, 0, { life: 0.6, size: 0.22, color: 0xffe680, gravity: 0 }); }
        else o.glow.material.opacity = 0;
        // labels: wie moet gooien / speciale steen
        const showL = (q.gold || q.bomb) && q.st !== 'out' && q.st !== 'queued';
        if (showL) { setLabel(o, q.bomb ? 'BOM!' : 'GOUD x2', q.bomb ? '#ff8a7a' : '#ffd23f'); o.label.visible = true; o.label.position.set(q.x, 2.2 + y, q.z); } else o.label.visible = false;
      }
      // zeehond / wak
      if (hole.st !== 'idle') {
        const up = hole.st === 'up' ? smoothstep(0, 0.25, hole.t) : hole.st === 'down' ? 1 - smoothstep(0, 0.4, hole.t) : 0;
        const k = hole.st === 'crack' ? smoothstep(0, 0.8, hole.t) : 1; const wob = hole.st === 'crack' ? 1 + Math.sin(tt * 30) * 0.06 : 1;
        hole.m.scale.set(1.1 * k * wob, 1, 1.1 * k * wob); hole.m.position.set(hole.x, 0, hole.z);
        hole.seal.visible = up > 0.01; hole.seal.position.set(hole.x, -1.4 + up * 1.4 + (hole.hit || 0) * 0.2, hole.z); hole.seal.rotation.y = Math.sin(tt * 2) * 0.4; hole.seal.scale.setScalar(1.15);
        const u = hole.seal.userData; if (u.fl) u.fl.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (0.5 + Math.sin(tt * 9) * 0.5); });
        if (hole.st === 'crack' && Math.random() < dt * 8) fx.particles.emit(hole.x + (Math.random() - 0.5) * 1.6, 0.3, hole.z + (Math.random() - 0.5) * 1.6, 0, 1.2, 0, { life: 0.5, size: 0.2, color: 0x9fe0ff, gravity: 3 });
      }
      // wandelaar
      if (walker.on) {
        const o = walker.obj; o.position.set(walker.x, 0, walker.z); o.rotation.y = walker.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const u = o.userData;
        if (walker.kind === 'bear') { o.position.y = Math.abs(Math.sin(walker.t * 5)) * 0.1; u.legs.forEach((l, i) => { l.rotation.x = Math.sin(walker.t * 5 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.5 : 0)) * 0.5; }); u.head.rotation.y = Math.sin(walker.t * 1.5) * 0.3; o.scale.setScalar(1 + walker.hit * 0.1); }
        else { o.rotation.y += Math.PI / 2 * 0; o.rotation.z = 0; u.body.rotation.x = 1.3; u.body.position.y = 0.25; u.fl.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (1.2 + Math.sin(walker.t * 12) * 0.3); }); u.head.rotation.x = -0.5; if (Math.random() < dt * 20) fx.particles.emit(walker.x - walker.dir * 0.7, 0.2, walker.z, 0, 0.6, 0, { life: 0.4, size: 0.25, color: 0xffffff, gravity: 2 }); }
      }
      // spelers
      const thrower = G.turnIdx < G.order.length ? G.order[G.turnIdx] : -1;
      for (const p of pl) {
        if (p.react < 50) p.react = Math.max(0, p.react - dt);
        const c = p.c, side = p.side; let tx, tz, tpose = 'idle', sp = 0, face = [0, -1];
        const gl = p.stone && p.st === 'glide' ? p.stone : null;
        if (G.st === 'end' || p.react > 50) { tx = p.hx; tz = p.hz; face = [0, 1]; }
        else if (gl) { tx = clamp(gl.x + side * 1.2, -HW + 0.5, HW - 0.5); tz = gl.z + 1.1; tpose = 'push'; sp = Math.min(1, Math.hypot(gl.vx, gl.vz) / 6); face = [0, -1]; }
        else if (p.st === 'aim') { tx = p.mx * 0.0 + 0; tz = HACK + 1.5; tpose = 'push'; face = [0, -1]; }
        else { tx = p.hx; tz = p.hz; face = [-side, -0.3]; tpose = p.react > 0 ? 'cheer' : 'idle'; }
        const hp = p.holder.position; const oldx = hp.x, oldz = hp.z;
        hp.x = damp(hp.x, tx, gl ? 9 : 4, dt); hp.z = damp(hp.z, tz, gl ? 9 : 4, dt);
        const mv = Math.hypot(hp.x - oldx, hp.z - oldz) / Math.max(dt, 1e-3); sp = Math.max(sp, clamp(mv / 7, 0, 1));
        c.speed = sp; c.faceDir(face[0] + (hp.x - oldx) * 0.0, face[1]); if (G.st === 'end' || p.react > 50) c.faceDir(0, 1);
        if (p.react <= 0 || p.react > 50) c.pose = G.st === 'end' ? c.pose : tpose; else c.pose = 'cheer';
        c.update(dt);
        p.bounceT = Math.max(0, p.bounceT - dt); p.broom.rotation.z = Math.sin(tt * 22) * 0.5 * (p.bounceT > 0 ? 1 : 0.1);
        p.tag.position.set(hp.x, 3.5, hp.z); p.tag.visible = G.st !== 'end';
        // richt-UI
        const aiming = p.st === 'aim' && (G.st === 'play' || G.st === 'sudden');
        p.marker.visible = p.dots.visible = p.stopR.visible = p.gauge.visible = aiming;
        if (aiming) {
          const path = predict.path || (predict.path = []); const pw = p.charging ? p.power : 0.44;
          const res = predict(p.mx, p.spin, pw, path);
          p.marker.position.set(p.mx, 0.05, HZ); p.marker.scale.setScalar(1 + Math.sin(tt * 6) * 0.08);
                    p.dots.count = path.n | 0;
          for (let k = 0; k < p.dots.count; k++) { dm.position.set(path[k * 2], 0.05, path[k * 2 + 1]); dm.scale.setScalar(0.6 + 0.4 * (k / p.dots.count)); dm.updateMatrix(); p.dots.setMatrixAt(k, dm.matrix); }
          p.dots.instanceMatrix.needsUpdate = true;
          p.stopR.position.set(res.x, 0.06, Math.max(res.z, BACK)); p.stopR.scale.setScalar(res.out ? 1.15 : 1); p.stopR.material.opacity = res.out ? 0.35 : 0.95;
          p.gauge.position.set(side * (HW + 1.5), 2.3, HACK + 0.3); p.gauge.material.opacity = canRelease() || p.charging ? 1 : 0.65; drawGauge(p);
        }
      }
      W.update(tt, dt);
    }
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7; let lead = null;
      for (const q of stones) if (q.st === 'glide' && (!lead || q.z < lead.z)) lead = q;
      const want = lead ? clamp(lead.z + 8, -4, 4) : (G.st === 'scoring' || G.st === 'end' ? -4 : 0);
      camFocus = damp(camFocus, want * 0.4, 1.8, dt);
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const k = Math.max(1, 15.5 / (tanH * asp * 28));
      const sway = Math.sin((T0 + introT) * 0.22) * 0.6;
      camera.position.set(sway, 25 * k, 27 * k + camFocus);
      camera.lookAt(0, 0, -1.2 + camFocus);
    }
    let camFocus = 0;
    function idleUpdate(dt, over) {
      T0 += over ? dt : 0; introT += over ? 0 : dt;
      if (over) physics(dt);
      visuals(dt); updateCamera(dt);
    }
    beginEnd(false, true); G.st = 'init'; refreshHud(); visuals(0.016); updateCamera(0.016);

    return {
      update: (dt) => { if (finished) { idleUpdate(Math.min(dt, 0.05), true); return; } update(dt); },
      introUpdate: (dt) => idleUpdate(Math.min(dt, 0.05), false),
      resultUpdate: (dt) => idleUpdate(Math.min(dt, 0.05), true),
      onSwap() { for (const p of pl) fx.particles.burst(p.holder.position.x, 1.5, p.holder.position.z, { count: 18, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (!m || G.st === 'end') return; const p = pl[i]; if (p.score > 0) { p.score--; refreshHud(); } const q = p.stone; if (q && q.st === 'glide') { q.vx = q.vz = 0; } say('BEVROREN! -1', p.holder.position.x, 3.8, p.holder.position.z, '#9fe8ff', 1.5); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.3); });
      },
      celebrate(w) { for (const p of pl) p.react = 99; pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; W.cheer(6, 1); },
      dispose() {},
      dbg: {
        state: () => ({ T: T0, st: G.st, end: G.end, sd: G.sd, turnIdx: G.turnIdx, order: [...G.order], score: [pl[0].score, pl[1].score], ends: ends.map((e) => [...e]), finished, timeLeft, rush: G.rush, sinceThrow: G.sinceThrow,
          p: pl.map((p) => ({ st: p.st, mx: p.mx, spin: p.spin, power: p.power, charging: p.charging, sweep: p.sweep, aimT: p.aimT })),
          stones: stones.map((q) => ({ k: q.k, owner: q.owner, x: +q.x.toFixed(2), z: +q.z.toFixed(2), vx: +q.vx.toFixed(2), vz: +q.vz.toFixed(2), st: q.st, gold: q.gold, bomb: q.bomb })), stats, walker: walker.on, seal: hole.st, hill: [hill.x, hill.z], canRelease: canRelease() }),
        predict: (mx, spin, power) => predict(mx, spin, power), setTime: (t) => { timeLeft = t; }, setScore: (a, b) => { pl[0].score = a; pl[1].score = b; refreshHud(); },
        spawnWalker: (k) => spawnWalker(k), spawnSeal: () => spawnSeal(), pl, get stones() { return stones; },
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { S } from '../save.js';
import { GOLD, pickHoles, makeCourse, makeBall, stepBall, stepCourse, collideBalls, powerToV, bounds, inPoly, waterAt, unsafeAt, inRect, segDist, BALL_R, CUP_R, MAX_STROKES, MAXV, HOLES } from './golf_course.js';
import { buildScenery, buildHole } from './golf_world.js';

// Minigolf-Race — 1 tegen 1, TEGELIJK op dezelfde baan. Een potje = 3/6/9/12 holes (instelling S.arcade.golfHoles, standaard 6), willekeurig uit een pool van 17
// verschillende holes (zonder herhaling, makkelijk -> moeilijk, de laatste is een spectaculaire finale die dubbel telt) + eventueel een gouden sudden-death-hole. De ballen botsen met elkaar!
//  * links/rechts = richten, omhoog/omlaag = max kracht, A ingedrukt = slingermeter, loslaten = slaan, B = ballon (1x per hole): bonk de bal van je broer weg, of turbo-slag
//  * water (strafslag), schansen, bumpers, molens, hamers, schuifdeuren, portalen, ijs, zand, lopende banden, carrousel, ophaalbrug, bewegend gat en een draak die de bal van de koploper kaapt
//  * punten per hole: eerste in het gat 2 (+1 als hij binnen par blijft), tweede 1; de laatste hole telt dubbel. Gelijk = gouden putt.
// Prestaties: alleen de huidige hole + de volgende staan in het geheugen; statische meshes zijn samengevoegd (golf_merge), geometrieen/materialen gedeeld (golf_gfx).
const SUB = 1 / 240, GRACE = 8;
const HOLE_OPTIONS = [3, 6, 9, 12];
const holesSetting = () => { const n = S && S.arcade ? S.arcade.golfHoles : 6; return HOLE_OPTIONS.includes(n) ? n : 6; };
// gewenste speeltijd per hole (s) per potjeslengte: 3 holes ca. 75 s, 6 holes ca. 2,8 min, 12 holes ca. 5 min (inclusief ca. 3-4 s tussenscherm per hole)
const PLAY_TARGET = { 3: 21, 6: 23.5, 9: 22, 12: 21 };
const PAUSE_END = { 3: 3.6, 6: 3.6, 9: 3.1, 12: 2.8 };
const tri = (u) => { const f = u - Math.floor(u); return f < 0.5 ? f * 2 : 2 - f * 2; };
const angWrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
// komt het lijnstuk a->b langs een muur?
function blocked(C, ax, az, bx, bz) {
  for (const w of C.walls) {
    const d1x = bx - ax, d1z = bz - az, d2x = w[2] - w[0], d2z = w[3] - w[1], den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) continue;
    const t = ((w[0] - ax) * d2z - (w[1] - az) * d2x) / den, u = ((w[0] - ax) * d1z - (w[1] - az) * d1x) / den;
    if (t > 0 && t < 1 && u > 0 && u < 1) return true;
  }
  return false;
}

export default {
  id: 'golf',
  name: 'Minigolf-Race',
  giver: 'Kapitein Putter',
  icon: '⛳',
  mode: 'pvp',
  get time() { const n = holesSetting(); return Math.round(n * (PLAY_TARGET[n] + PAUSE_END[n] + 1.3) / 5) * 5; },
  music: 'game',
  get blurb() { const n = holesSetting(); return `Minigolf voor twee, <b>tegelijk</b> op dezelfde baan: <b>${n} holes</b>, steeds lastiger. Eerst in het gat = de meeste punten. <b>Bonk</b> je broer in het water en pas op voor de <b>draak</b>! De laatste hole telt dubbel.`; },
  controls: ['{move} richten + max kracht', '{a} houd = meter, los = slaan', '{b} ballon: bonk of turbo (1x)'],
  tip: 'Laat los op de top van de meter voor een vol schot.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const N = holesSetting(), matchHoles = pickHoles(N, ctx.rng);
    const tscale = Math.max(0.75, Math.min(1.3, PLAY_TARGET[N] / (matchHoles.reduce((a, h) => a + h.time, 0) / N)));
    const holeTime = (d) => (d.sudden ? d.time : Math.round(d.time * tscale));
    const endPause = PAUSE_END[N], readyT = N >= 9 ? 1.0 : 1.3;
    const defAt = (n) => (n >= N ? GOLD : matchHoles[n]);
    const maxMatchT = matchHoles.reduce((a, h) => a + holeTime(h) + endPause + readyT + 2, 0) + holeTime(GOLD) + endPause + 60;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const popts = { fric: SLIP > 0.3 ? 0.28 : 1, grav: GRAV, hop: GRAV < 1 };

    const L = ctx.lights('day', { shadow: 24, center: [0, 0, 0], fogNear: 75, fogFar: 190 });
    L.hemi.intensity = 1.15; L.sun.intensity = 2.0; L.sun.position.set(-14, 34, 20); L.sun.color.set(0xfff0d0);
    camera.fov = 45; camera.updateProjectionMatrix();
    const S0 = buildScenery(ctx);

    // ---------------- spelers ----------------
    const sizeOf = (i) => Math.pow(pv.size(i), 0.7);
    const arrowDot = new THREE.CircleGeometry(0.17, 8); arrowDot.rotateX(-Math.PI / 2);
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const holder = new THREE.Group(); holder.add(c.group); scene.add(holder);
      const club = new THREE.Group(); club.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), mat(0xd8d8e0, { metalness: 0.6 }), { cast: false, pos: [0, -0.35, 0] }), mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), mat(PLAYER_COLORS[i]), { cast: false, pos: [0, -0.82, 0.08] })); c.hold(club, 'r');
      const r = BALL_R * sizeOf(i);
      const bm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[i], roughness: 0.2, metalness: 0.1, emissive: PLAYER_COLORS[i], emissiveIntensity: 0.25 })); bm.castShadow = true; scene.add(bm);
      const shadow = P.shadowBlob(0.6); scene.add(shadow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 20), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const dots = new THREE.InstancedMesh(arrowDot, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }), 16); dots.frustumCulled = false; dots.renderOrder = 5; scene.add(dots);
      for (let k = 0; k < 16; k++) dots.setColorAt(k, new THREE.Color(1, 1, 1));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })); head.geometry.rotateZ(-Math.PI / 2); scene.add(head);
      const tagTex = canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false })); tag.scale.set(3.0, 1.12, 1); tag.renderOrder = 15; scene.add(tag);
      return { i, c, holder, bm, shadow, ring, dots, head, tag, ball: makeBall(0, 0, r), r, ang: 0, pw: 0.75, m: 0, charging: false, chargeT: 0, holdT: 0, state: 'wait', strokes: 0, rest: { x: 0, z: 0 }, restT: 0,
        bonkUsed: false, boost: false, frozen: 0, penT: 0, sunkT: 0, outT: 0, pts: 0, total: 0, carried: false, hx: 0, hz: 0, hitCd: 0, wallCd: 0, shots: 0, bonks: 0, txt: '', poseT: 0, trail: 0, dist: 0 };
    });

    // ---------------- toestand ----------------
    const G = { state: 'init', t: 0, hole: -1, timeLeft: 0, grace: false, sunkCount: 0, sd: false, results: [], winner: -1, end: false, ready: 0, resT: 0, popT: 0, next: null, boardEl: null, boardOn: false };
    let T = 0, introT = 0, started = false, finished = false;
    let C = null, Hh = null, def = null, bnd = null, maxS = MAX_STROKES;
    const D = { state: 'idle', t: 0, cd: 10, target: null, S: new THREE.Vector3(), Pp: new THREE.Vector3(), E: new THREE.Vector3(), Dp: new THREE.Vector3(), g: null, marker: null, count: 0 };
    D.g = new Dragon(0x7a2fd4, 0.55); D.g.group.visible = false; scene.add(D.g.group);
    D.marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 24), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); D.marker.rotation.x = -Math.PI / 2; D.marker.visible = false; scene.add(D.marker);
    const stats = { water: 0, bonks: 0, dragon: 0, bumps: 0, collisions: 0 };
    const total = (i) => pl[i].total;
    const bonkBall = { vis: false };
    const bonkB = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff6ad0, emissive: 0xff2aa0, emissiveIntensity: 0.4, roughness: 0.2 })); bonkB.visible = false; scene.add(bonkB);
    const balloon = { on: false, t: 0, from: [0, 0], to: [0, 0], by: -1 };

    // DOM-krachtmeters (onderin); worden telkens opnieuw gemonteerd, want de harness leegt de HUD bij het aftellen
    const hudEl = document.getElementById('hud');
    const bars = pl.map((p, i) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;bottom:14px;${i ? 'right' : 'left'}:14px;width:230px;padding:6px 10px;border-radius:12px;background:rgba(20,12,30,.62);border:3px solid ${players[i].css};pointer-events:none;font-size:13px;color:#fff`;
      el.innerHTML = '<div class="gl" style="margin-bottom:3px"></div><div style="position:relative;height:14px;background:rgba(255,255,255,.18);border-radius:7px;overflow:hidden"><div class="gf" style="position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#4aff7a,#ffe14a,#ff4a3a)"></div><div class="gc" style="position:absolute;top:0;bottom:0;width:3px;background:#fff"></div></div>';
      return { el, gl: el.querySelector('.gl'), gf: el.querySelector('.gf'), gc: el.querySelector('.gc'), last: '' };
    });
    function mountBars(show) { for (const b of bars) { if (show && !b.el.isConnected && hudEl) hudEl.append(b.el); if (!show && b.el.isConnected) b.el.remove(); } }

    const isFinal = () => !G.sd && G.hole === N - 1;
    const holeLabel = () => (G.sd ? 'GOUDEN PUTT' : `Hole ${Math.max(1, G.hole + 1)}/${N}${isFinal() ? ' · FINALE' : ''}`);
    function refreshHud() { hud.setScore(`${holeLabel()} · ${names[0]} ${pl[0].total} – ${pl[1].total} ${names[1]}`); }

    // ---------------- baan laden ----------------
    // Alleen de huidige hole en de volgende staan in het geheugen: de volgende wordt tijdens het spelen alvast opgebouwd, de vorige meteen opgeruimd.
    function dropHole(h) { if (!h) return; if (h.group.parent) h.group.parent.remove(h.group); h.dispose(); }
    function prepNext(n, override) {
      const d = override || defAt(n); if (G.next && G.next.n === n && G.next.def === d) return G.next;
      if (G.next) dropHole(G.next.H);
      const C2 = makeCourse(d); G.next = { n, def: d, C: C2, H: buildHole(ctx, C2) }; return G.next;
    }
    function loadHole(n, override) {
      const nx = prepNext(n, override); G.next = null;
      dropHole(Hh);
      G.hole = n; def = nx.def; G.sd = !!def.sudden; C = nx.C; Hh = nx.H; scene.add(Hh.group); bnd = bounds(def); maxS = def.maxStrokes || MAX_STROKES;
      Hh.group.scale.setScalar(0.01); G.popT = 0; S0.placeFans(bnd);
      if (G.boardEl) { G.boardEl.remove(); G.boardEl = null; }
      G.timeLeft = holeTime(def); G.grace = false; G.sunkCount = 0; G.holeDone = false; G.nextBuilt = false; G.liftSnd = [];
      D.state = 'idle'; D.cd = 8 + Math.random() * 3; D.g.group.visible = false; D.marker.visible = false; D.target = null; for (const p of pl) p.carried = false;
      pl.forEach((p, i) => {
        const t = def.tee[i]; p.ball = makeBall(t[0], t[1], p.r); p.rest = { x: t[0], z: t[1] }; p.safe = { x: t[0], z: t[1] }; p.strokes = 0; p.state = 'wait'; p.bonkUsed = false; p.boost = false; p.frozen = 0; p.pts = 0; p.charging = false; p.m = 0; p.pw = 0.75; p.outT = 0; p.penT = 0; p.restT = 0; p.sunkT = 0; p.slowT = 0;
        p.bm.visible = true; p.bm.scale.setScalar(p.r); p.c.pose = 'idle'; aimAtCup(p); p.hx = t[0] - Math.cos(p.ang) * 1.7; p.hz = t[1] - Math.sin(p.ang) * 1.7;
      });
      G.state = 'ready'; G.t = 0; refreshHud(); hud.setTimer(null);
    }
    // eerste richting: naar het gat, of naar het eerste tussenpunt dat vrij zicht heeft (ook gespiegeld voor spiegelholes)
    function aimAtCup(p) {
      const b = p.ball; let tx = C.cup[0], tz = C.cup[1];
      if (blocked(C, b.x, b.z, tx, tz) && def.route) {
        const tries = [def.route]; if (def.mirror) tries.push(def.route.map((w) => [w[0], -w[1]]));
        let found = false;
        for (const rt of tries) { for (const w of rt) if (!blocked(C, b.x, b.z, w[0], w[1])) { tx = w[0]; tz = w[1]; found = true; break; } if (found) break; }
      }
      p.ang = Math.atan2(tz - b.z, tx - b.x);
    }

    // ---------------- slaan / abilities ----------------
    function fire(p, m, boost = false) {
      const b = p.ball; const v = Math.min(MAXV, powerToV(m) * (p.boost ? 1.3 : 1));
      b.vx = Math.cos(p.ang) * v; b.vz = Math.sin(p.ang) * v; p.state = 'roll'; p.strokes++; p.shots++; p.charging = false; p.restT = 0; p.rest = { x: b.x, z: b.z }; if (!unsafeAt(C, b.x, b.z)) p.safe = { x: b.x, z: b.z };
      const strong = m > 0.9;
      audio.sfx('swing', { vol: 0.5, rate: 0.9 + m * 0.4 }); audio.sfx('hit', { vol: 0.35 + m * 0.5, rate: 1.2 - m * 0.3 }); p.c.swing(); ctx.shake(0.06 + m * 0.3);
      fx.particles.burst(b.x, 0.3, b.z, { count: 6 + Math.round(m * 18), speed: 3 + m * 5, up: 0.8, life: 0.5, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 7 });
      fx.texts.add(p.boost ? 'TURBO!' : strong ? 'KRACHT!' : 'TOK!', b.x, 1.8, b.z, p.boost ? '#ff6ad0' : strong ? '#ff7a3a' : '#ffffff', p.boost ? 1.3 : 0.9);
      p.boost = false;
    }
    function useBalloon(p) {
      if (p.bonkUsed || p.state === 'sunk' || p.state === 'out' || p.state === 'wait' || G.state !== 'play') { audio.sfx('click', { vol: 0.2, rate: 0.6 }); return; }
      const o = pl[1 - p.i], b = p.ball, ob = o.ball; p.bonkUsed = true; p.bonks++;
      const d = Math.hypot(ob.x - b.x, ob.z - b.z);
      if (!ob.sunk && o.state !== 'out' && !o.carried && d < 9) {
        const dx = ob.x - b.x, dz = ob.z - b.z, l = d || 1; ob.vx += dx / l * 16; ob.vz += dz / l * 16; if (o.state === 'aim') { o.state = 'roll'; o.charging = false; o.restT = 0; }
        o.c.pose = 'scared'; o.poseT = 1; stats.bonks++;
        balloon.on = true; balloon.t = 0; balloon.from = [b.x, b.z]; balloon.to = [ob.x, ob.z]; balloon.by = p.i;
        audio.sfx('pop', { vol: 0.8, rate: 0.8 }); audio.sfx('boing', { vol: 0.7 }); audio.sfx('whoosh', { vol: 0.6 }); ctx.shake(0.35);
        fx.particles.burst(ob.x, 0.6, ob.z, { count: 30, speed: 6, up: 1, life: 0.8, size: 0.4, colors: [0xff6ad0, 0xffffff, 0xffe14a], gravity: 5 });
        fx.texts.add('BONK!', ob.x, 2.2, ob.z, '#ff6ad0', 1.5); hud.toast(`${names[p.i]} bonkt ${names[1 - p.i]}!`, 1400);
      } else {
        p.boost = true; audio.sfx('powerup', { vol: 0.8 }); fx.texts.add('TURBO-SLAG!', b.x, 2.2, b.z, '#ff6ad0', 1.4); fx.particles.burst(b.x, 0.6, b.z, { count: 24, speed: 4, up: 1.2, life: 0.8, size: 0.4, colors: [0xff6ad0, 0xffffff], gravity: 3 });
      }
    }

    // ---------------- hole-einde ----------------
    function endHole(reason) {
      if (G.holeDone) return; G.holeDone = true; G.state = 'holeEnd'; G.t = 0; hud.setTimer(null); mountBars(false); D.state = 'idle'; D.g.group.visible = false; D.marker.visible = false;
      for (const p of pl) { p.charging = false; if (p.carried) { p.carried = false; } }
      const sunk = pl.filter((p) => p.state === 'sunk').sort((a, b) => a.sunkT - b.sunkT);
      const add = [0, 0]; let first = -1;
      const mult = isFinal() ? 2 : 1;
      if (sunk.length) { first = sunk[0].i; add[first] = 2 + (sunk[0].strokes <= def.par ? 1 : 0); if (sunk[1]) add[sunk[1].i] = 1; }
      else { const d = pl.map((p) => Math.hypot(p.ball.x - C.cup[0], p.ball.z - C.cup[1])); first = Math.abs(d[0] - d[1]) < 0.05 ? Math.floor(Math.random() * 2) : (d[0] < d[1] ? 0 : 1); add[first] = 1; }
      if (def.sudden) { add[0] = add[1] = 0; add[first] = 1; }
      for (const i of [0, 1]) { add[i] *= mult; pl[i].pts = add[i]; pl[i].total += add[i]; }
      G.results.push({ hole: def.name, add: [...add], strokes: pl.map((p) => p.strokes), first, reason, sd: G.sd, final: isFinal() });
      G.lastFirst = first;
      refreshHud();
      const w = first;
      hud.showBig(sunk.length ? `${names[w]} wint de hole!` : (reason === 'time' ? 'TIJD OP! Dichtstbij wint' : `${names[w]} dichtbij!`), 1800, w ? '#8fb8ff' : '#7dffb0');
      hud.toast(`+${add[0]} ${names[0]} · +${add[1]} ${names[1]}${mult > 1 ? ' (finale: dubbel!)' : ''}`, 2200);
      audio.sfx('bell', { vol: 0.8 });
      for (const p of pl) { p.c.pose = add[p.i] > add[1 - p.i] ? 'cheer' : (add[p.i] < add[1 - p.i] ? 'sad' : 'idle'); p.poseT = 5; }
      S0.cheer(2.4);
    }
    // holeborden-tussenscherm: stand per hole
    function showBoard() {
      if (!hudEl) return; if (G.boardEl) G.boardEl.remove();
      const el = document.createElement('div'); G.boardEl = el;
      const sd = G.sd, last = !sd && G.hole >= N - 1, nextName = !last && !sd ? defAt(G.hole + 1).name : '';
      const rows = G.results.map((r, k) => `<div style="display:flex;gap:6px;align-items:center;white-space:nowrap"><span style="opacity:.6;width:20px;text-align:right">${r.sd ? '⭐' : k + 1}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${r.hole}${r.final ? ' ×2' : ''}</span><b style="width:22px;text-align:center;color:${players[0].css}">${r.add[0]}</b><b style="width:22px;text-align:center;color:${players[1].css}">${r.add[1]}</b></div>`);
      const cols = rows.length > 6 ? 2 : 1;
      el.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-44%);width:${cols === 2 ? 560 : 330}px;max-width:94%;padding:10px 14px 12px;border-radius:16px;background:rgba(20,12,30,.86);border:3px solid #ffe14a;color:#fff;font-size:15px;pointer-events:none;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.45)`;
      el.innerHTML = `<div style="font-size:19px;font-weight:700;color:#ffe14a;margin-bottom:6px">${sd ? 'Gouden putt!' : last ? 'Eindstand' : `Stand na hole ${G.hole + 1}/${N}`}</div>`
        + `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:2px 18px;text-align:left;margin-bottom:8px">${rows.join('')}</div>`
        + `<div style="font-size:22px;font-weight:700"><span style="color:${players[0].css}">${names[0]} ${pl[0].total}</span> – <span style="color:${players[1].css}">${pl[1].total} ${names[1]}</span></div>`
        + (nextName ? `<div style="font-size:13px;opacity:.8;margin-top:6px">Straks: ${nextName}</div>` : '');
      hudEl.append(el);
    }
    function nextAfterHole() {
      if (G.sd) return finishMatch();
      if (G.hole + 1 < N) return loadHole(G.hole + 1);
      if (pl[0].total !== pl[1].total) return finishMatch();
      hud.showBig('GELIJK! GOUDEN PUTT!', 1600, '#ffd23f'); audio.sfx('bell', { vol: 0.9 }); loadHole(N);
    }
    function finishMatch() {
      if (finished) return; finished = true; G.state = 'end'; hud.setTimer(null); mountBars(false); if (G.boardEl) { G.boardEl.remove(); G.boardEl = null; } if (G.next) { dropHole(G.next.H); G.next = null; }
      let w = pl[0].total === pl[1].total ? Math.floor(Math.random() * 2) : (pl[0].total > pl[1].total ? 0 : 1);
      const jokes = [`${names[w]} is de Putter-Koning! ${names[1 - w]} zoekt zijn bal nog in de vijver.`, `${names[w]} golft als een kampioen. De draak is onder de indruk.`, `${names[w]} wint de race! ${names[1 - w]} heeft stiekem een bonk gevoeld.`];
      const holes = G.results.map((r, k) => `${r.sd ? '⭐' : k + 1}: ${r.add[0]}-${r.add[1]}`).join(', ');
      for (const p of pl) { p.c.pose = p.i === w ? 'cheer' : 'sad'; p.poseT = 99; } S0.cheer(6);
      ctx.finishPvp({ winner: w, score: [pl[0].total, pl[1].total], delay: 600, summary: `${jokes[Math.floor(Math.random() * jokes.length)]} Holes: ${holes}.${stats.bonks ? ` Er werd ${stats.bonks}x gebonkt` : ''}${stats.dragon ? ` en de draak kaapte ${stats.dragon}x een bal.` : stats.bonks ? '.' : ''}` });
    }

    // ---------------- draak ----------------
    function startDragon() {
      const cands = pl.filter((p) => !p.ball.sunk && p.state !== 'out' && p.state !== 'pen' && !p.carried && p.state !== 'wait'); if (!cands.length) { D.cd = 3; return; }
      cands.sort((a, b) => Math.hypot(a.ball.x - C.cup[0], a.ball.z - C.cup[1]) - Math.hypot(b.ball.x - C.cup[0], b.ball.z - C.cup[1]));
      D.target = cands[0]; D.state = 'warn'; D.t = 0; D.marker.visible = true; stats.dragonWarn = (stats.dragonWarn || 0) + 1;
      audio.tone(110, 0.9, { type: 'sawtooth', vol: 0.18, slide: 70 }); audio.sfx('creak', { vol: 0.5 }); hud.toast(`🐉 De draak heeft zijn oog op ${names[D.target.i]}'s bal!`, 1800);
    }
    function pickDrop(target) {
      const dc = Math.hypot(target.ball.x - C.cup[0], target.ball.z - C.cup[1]); let best = null;
      for (let k = 0; k < 90; k++) {
        const x = bnd.x0 + Math.random() * bnd.w, z = bnd.z0 + Math.random() * bnd.d;
        if (!inPoly(def.poly, x, z) || waterAt(C, x, z) || Math.hypot(x - C.cup[0], z - C.cup[1]) < 3.5) continue;
        if (C.bumpers.some((b) => Math.hypot(x - b[0], z - b[1]) < b[2] + 1.4) || C.pillars.some((b) => Math.hypot(x - b[0], z - b[1]) < b[2] + 1.6) || C.ramps.some((q) => inRect(q.r, x, z, -1.2)) || C.pads.some((q) => inRect(q.r, x, z, -1.2)) || C.belts.some((q) => inRect(q.r, x, z, -1.2)) || C.swirls.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 0.6) || unsafeAt(C, x, z, 1.4)) continue;
        if (C.walls.some((w) => { const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz; const u = clamp(((x - w[0]) * dx + (z - w[1]) * dz) / l2, 0, 1); return Math.hypot(x - (w[0] + dx * u), z - (w[1] + dz * u)) < 1.1; })) continue;
        const d = Math.hypot(x - C.cup[0], z - C.cup[1]); const sc = Math.abs(d - (dc + 4)) + Math.random() * 6; if (!best || sc < best.sc) best = { x, z, sc };
      }
      return best || { x: def.tee[0][0], z: def.tee[0][1] };
    }
    const bez = (a, b, h, u, out) => { out.set(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + Math.sin(u * Math.PI) * h, lerp(a.z, b.z, u)); return out; };
    const tmpV = new THREE.Vector3(), prevV = new THREE.Vector3();
    function updateDragon(dt) {
      const g = D.g.group; D.t += dt;
      if (D.state === 'idle') { if (G.state === 'play' && def.dragon && !G.grace) { D.cd -= dt; if (D.cd <= 0) startDragon(); } return; }
      if (D.state !== 'idle' && D.target && (D.target.ball.sunk || D.target.state === 'out') && D.state === 'warn') { D.state = 'idle'; D.marker.visible = false; D.cd = 5; return; }
      prevV.copy(g.position);
      if (D.state === 'warn') {
        const b = D.target.ball; D.marker.position.set(b.x, 0.07, b.z); D.marker.scale.setScalar(1.6 - Math.min(1, D.t / 1.6) * 0.8); D.marker.material.opacity = 0.4 + 0.4 * Math.abs(Math.sin(D.t * 10));
        if (Math.random() < dt * 8) fx.texts.add('!', b.x, 2.4, b.z, '#ff3a2a', 1.0);
        if (D.t >= 1.7) { D.state = 'in'; D.t = 0; const side = Math.random() < 0.5 ? -1 : 1; D.S.set(bnd.cx + side * (bnd.w / 2 + 12), 9, bnd.cz + rand(-5, 5)); D.Pp.set(b.x, 1.3, b.z); g.visible = true; g.position.copy(D.S); audio.sfx('whoosh', { vol: 0.7, rate: 0.6 }); }
      } else if (D.state === 'in') {
        const u = clamp(D.t / 1.15, 0, 1); const b = D.target.ball; D.Pp.set(b.x, 1.3, b.z); bez(D.S, D.Pp, 0, u * u * (3 - 2 * u), g.position);
        if (u >= 1) {
          if (!b.sunk && D.target.state !== 'out') { D.target.carried = true; stats.dragon++; D.target.charging = false; D.Dp = pickDrop(D.target); D.state = 'carry'; D.t = 0; D.from = D.Pp.clone(); D.to = new THREE.Vector3(D.Dp.x, 1.3, D.Dp.z); D.E.set(bnd.cx + (D.Dp.x > bnd.cx ? 1 : -1) * (bnd.w / 2 + 14), 10, bnd.cz + rand(-6, 6));
            audio.sfx('scare', { vol: 0.25 }); audio.sfx('hurt', { vol: 0.6 }); ctx.shake(0.5); fx.texts.add('GEKAAPT!', b.x, 2.6, b.z, '#ff7a3a', 1.6); hud.toast(`De draak kaapt ${names[D.target.i]}'s bal!`, 1800); D.marker.visible = false; D.target.c.pose = 'scared'; D.target.poseT = 1.2; }
          else { D.state = 'leave'; D.t = 0; D.from = D.Pp.clone(); D.to = D.E.clone().set(D.S.x, 10, D.S.z); D.marker.visible = false; }
        }
      } else if (D.state === 'carry') {
        const u = clamp(D.t / 1.5, 0, 1), e = u * u * (3 - 2 * u); bez(D.from, D.to, 2.2, e, g.position);
        const b = D.target.ball; b.x = g.position.x; b.z = g.position.z; b.y = g.position.y - 1.0; b.vx = b.vz = 0; b.vy = 0;
        if (u >= 1) { D.target.carried = false; b.y = 0.9; b.vy = 0; b.x = D.Dp.x; b.z = D.Dp.z; D.target.restT = 0; D.target.state = 'roll'; D.target.rest = { x: b.x, z: b.z }; audio.sfx('land', { vol: 0.7 }); audio.sfx('boing', { vol: 0.5 }); fx.particles.burst(b.x, 0.4, b.z, { count: 16, speed: 4, up: 1.2, life: 0.6, size: 0.35, colors: [0xffffff, 0xd9a8ff], gravity: 6 }); D.state = 'leave'; D.t = 0; D.from = g.position.clone(); D.to = D.E.clone(); }
      } else if (D.state === 'leave') {
        const u = clamp(D.t / 1.6, 0, 1); bez(D.from, D.to, 0, u * u, g.position);
        if (u >= 1) { D.state = 'idle'; D.cd = rand(10, 13); g.visible = false; }
      }
      tmpV.copy(g.position).sub(prevV); if (tmpV.lengthSq() > 1e-6) g.rotation.y = damp(g.rotation.y, Math.atan2(tmpV.x, tmpV.z), 8, dt);
      g.rotation.x = D.state === 'in' ? 0.35 : 0; D.g.update(dt);
    }

    // ---------------- ballen: events ----------------
    function ballEvent(p, ev, b) {
      if (ev === 'wall') { if (p.wallCd <= 0) { p.wallCd = 0.1; const v = clamp((b.hitV || 4) / 16, 0.1, 0.6); audio.sfx('thud', { vol: v, rate: 1.1 }); if (b.hitV > 8) fx.particles.burst(b.x, 0.5, b.z, { count: 4, speed: 2, up: 0.6, life: 0.3, size: 0.22, colors: [0xffffff, 0xd8c8a0], gravity: 6 }); } }
      else if (ev === 'bump') { stats.bumps++; audio.sfx('boing', { vol: 0.5, rate: 1.1 + Math.random() * 0.4 }); audio.sfx('ding', { vol: 0.3 }); const hb = Hh.bump.find((q) => q.bp === b.bump); if (hb) hb.hit = 1; fx.texts.add('BOING!', b.x, 1.8, b.z, '#ffd23f', 0.9); fx.particles.ring(b.bump[0], 0.6, b.bump[1], { count: 12, speed: 4, color: 0xffffff, size: 0.28, life: 0.35 }); }
      else if (ev === 'mill') { if (p.wallCd <= 0) { p.wallCd = 0.15; audio.sfx('wood', { vol: 0.6 }); audio.sfx('thud', { vol: 0.4 }); fx.texts.add('WOEF!', b.x, 1.8, b.z, '#ffffff', 0.9); } }
      else if (ev === 'launch') { audio.sfx('jump', { vol: 0.6 }); audio.sfx('whoosh', { vol: 0.5 }); fx.texts.add('SCHANS!', b.x, 2.2, b.z, '#ffa23a', 1.0); fx.particles.burst(b.x, 0.3, b.z, { count: 10, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffa23a, 0xffffff], gravity: 5 }); }
      else if (ev === 'land') { if (b.air === 0 && p.wallCd <= 0 && !popts.hop) { p.wallCd = 0.1; audio.sfx('land', { vol: 0.3 }); fx.particles.dust(b.x, 0.1, b.z, 3); } }
      else if (ev === 'portal') { const e0 = b.portal, e1 = b.portalTo; audio.sfx('whoosh', { vol: 0.5, rate: 1.6 }); audio.sfx('powerup', { vol: 0.3, rate: 1.4 }); fx.texts.add('ZWOEF!', e1.x, 2.2, e1.z, '#d9a8ff', 1.1); for (const e of [e0, e1]) fx.particles.burst(e.x, 0.4, e.z, { count: 12, speed: 3, up: 1.2, life: 0.5, size: 0.3, colors: [e.col, 0xffffff], gravity: 2 }); }
      else if (ev === 'pad') { if (p.wallCd <= 0) { p.wallCd = 0.4; audio.sfx('whoosh', { vol: 0.35, rate: 1.4 }); } }
    }
    function waterHit(p, why) {
      const b = p.ball; stats.water++; p.state = 'pen'; p.penT = 1.1; p.strokes++; b.vx = b.vz = 0; b.y = 0; b.vy = 0;
      if (why === 'water') { audio.sfx('splash', { vol: 0.9 }); fx.particles.burst(b.x, 0.3, b.z, { count: 30, speed: 5, up: 2, life: 0.9, size: 0.4, colors: [0x8ad0ff, 0xffffff, 0x4aa8ff], gravity: 10 }); fx.texts.add('PLONS! +1', b.x, 2.2, b.z, '#8ad0ff', 1.4); }
      else { audio.sfx('miss', { vol: 0.6 }); fx.texts.add('BUITEN! +1', b.x, 2.2, b.z, '#ffb0b0', 1.3); }
      p.bm.visible = false; p.c.pose = 'sad'; p.poseT = 1.2;
    }
    function ballSunk(p) {
      const b = p.ball; p.state = 'sunk'; p.sunkT = T; p.charging = false; G.sunkCount++; b.vx = b.vz = 0;
      const first = G.sunkCount === 1;
      audio.sfx('coin', { vol: 0.8, rate: 0.7 }); audio.sfx(first ? 'win' : 'good', { vol: 0.7 }); audio.sfx('ding', { vol: 0.5 }); ctx.shake(first ? 0.5 : 0.25);
      fx.particles.burst(C.cup[0], 0.8, C.cup[1], { count: first ? 60 : 30, speed: 7, up: 1.4, life: 1.2, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
      fx.particles.ring(C.cup[0], 0.3, C.cup[1], { count: 24, speed: 6, color: p.i ? 0x8fb8ff : 0x7dffb0, size: 0.35, life: 0.6 });
      const word = p.strokes === 1 ? 'HOLE-IN-ONE!' : p.strokes < def.par ? 'BIRDIE!' : first ? 'IN HET GAT!' : 'OOK IN!';
      fx.texts.add(word, C.cup[0], 3.4, C.cup[1], first ? '#ffe14a' : '#ffffff', 1.8); if (first || p.strokes === 1) hud.showBig(word, 1200, p.i ? '#8fb8ff' : '#7dffb0');
      p.c.pose = 'cheer'; p.poseT = 99; S0.cheer(2);
      if (first && !def.sudden) { G.grace = true; G.timeLeft = Math.min(G.timeLeft, GRACE); hud.toast(`${names[1 - p.i]} heeft nog ${GRACE} seconden!`, 1800); }
      if (def.sudden) { endHole('sudden'); }
    }

    // ---------------- update ----------------
    function readInput(p, dt) {
      const inp = pv.input(p.i), spd = pv.speed(p.i);
      if (p.state !== 'aim') { if (p.state === 'roll' && inp.aP) audio.sfx('click', { vol: 0.12, rate: 0.6 }); p.charging = false; p.m = 0; if (inp.bP) useBalloon(p); return; }
      if (p.frozen > 0) { p.frozen -= dt; p.charging = false; p.m = 0; return; }
      if (Math.abs(inp.x) > 0.2) { p.holdT += dt; p.ang += inp.x * lerp(0.9, 3.0, Math.min(1, p.holdT / 0.9)) * Math.sqrt(spd) * dt; } else p.holdT = 0;
      if (Math.abs(inp.y) > 0.3) p.pw = clamp(p.pw - inp.y * 0.7 * dt, 0.25, 1);
      if (inp.aP && !p.charging) { p.charging = true; p.chargeT = 0; audio.sfx('select', { vol: 0.3, rate: 1.3 }); }
      if (p.charging) {
        p.chargeT += dt * spd; p.m = tri(p.chargeT * 0.85) * p.pw;
        if (Math.floor(p.chargeT * 12) !== Math.floor((p.chargeT - dt * spd) * 12)) audio.tone(220 + p.m * 700, 0.05, { type: 'triangle', vol: 0.05 });
        if (inp.aR || !inp.a) { const m = p.m; p.charging = false; if (m >= 0.06) fire(p, m); else audio.sfx('click', { vol: 0.2, rate: 0.7 }); p.m = 0; }
      }
      if (inp.bP) useBalloon(p);
    }
    function stepPhysics(dt) {
      const n = clamp(Math.ceil(dt / SUB), 1, 14), h = dt / n;
      for (let s = 0; s < n; s++) {
        stepCourse(C, h);
        for (const p of pl) {
          const b = p.ball; if (b.sunk || p.state === 'out' || p.state === 'pen' || p.state === 'wait' || p.carried) continue;
          const ev = stepBall(C, b, h, popts);
          if (b.ev) ballEvent(p, b.ev, b);
          if (ev === 'water' || ev === 'oob') { waterHit(p, ev); if (p.strokes >= maxS) { p.state = 'out'; } }
          else if (ev === 'sunk') ballSunk(p);
          if (p.state === 'aim' && Math.hypot(b.vx, b.vz) > 0.6) { p.state = 'roll'; p.charging = false; p.restT = 0; }
        }
        const a = pl[0], b = pl[1];
        if (!a.carried && !b.carried && a.state !== 'pen' && b.state !== 'pen' && a.state !== 'wait') {
          const rv = collideBalls(a.ball, b.ball);
          if (rv > 0 && a.hitCd <= 0) { a.hitCd = 0.12; stats.collisions++; const x = (a.ball.x + b.ball.x) / 2, z = (a.ball.z + b.ball.z) / 2; audio.sfx('hit', { vol: clamp(rv / 18, 0.15, 0.7), rate: 1.5 }); if (rv > 3) { fx.particles.burst(x, 0.5, z, { count: 6, speed: 3, up: 1, life: 0.4, size: 0.28, colors: [0xffffff, 0xffe14a], gravity: 6 }); if (rv > 8) fx.texts.add('KLONK!', x, 1.8, z, '#ffffff', 1.0); } }
        }
      }
    }
    function updatePlayerState(p, dt) {
      p.hitCd -= dt; p.wallCd -= dt; const b = p.ball;
      if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0 && p.state !== 'sunk') p.c.pose = 'idle'; }
      if (p.state === 'roll' && !p.carried) {
        const still = b.vx === 0 && b.vz === 0 && b.y <= 0.001 && b.vy <= 0;
        p.restT = still ? p.restT + dt : 0;
        if (still && p.restT > 0.12) { p.state = 'aim'; p.rest = { x: b.x, z: b.z }; p.restT = 0; if (p.strokes >= maxS) { p.state = 'out'; audio.sfx('buzz', { vol: 0.4 }); fx.texts.add('MAX SLAGEN!', b.x, 2.2, b.z, '#ffb0b0', 1.3); p.c.pose = 'sad'; p.poseT = 99; } else aimAtCup(p); }
        { const sp = Math.hypot(b.vx, b.vz); p.slowT = sp > 0 && sp < 0.9 ? p.slowT + dt : 0; if (p.slowT > 1.2) { b.vx = b.vz = 0; p.slowT = 0; } }   // kruipt eindeloos (lopende band tegen een muur): laat hem stilstaan
        if (Math.hypot(b.vx, b.vz) > 6 && Math.random() < dt * 24) fx.particles.emit(b.x, 0.25, b.z, 0, 0.4, 0, { life: 0.35, size: 0.28, color: p.i ? 0x8fb8ff : 0x7dffb0, gravity: 0 });
      }
      if (p.state === 'pen') { p.penT -= dt; if (p.penT <= 0) { if (p.strokes >= maxS) { p.state = 'out'; p.c.pose = 'sad'; p.poseT = 99; fx.texts.add('MAX SLAGEN!', p.rest.x, 2.2, p.rest.z, '#ffb0b0', 1.3); } else { const rp = unsafeAt(C, p.rest.x, p.rest.z) ? (p.safe || { x: def.tee[p.i][0], z: def.tee[p.i][1] }) : p.rest; p.rest = { x: rp.x, z: rp.z }; b.x = rp.x; b.z = rp.z; b.vx = b.vz = 0; b.y = 0.6; b.vy = 0; p.state = 'roll'; p.restT = 0; p.bm.visible = true; fx.particles.burst(b.x, 0.5, b.z, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffffff], gravity: 4 }); audio.sfx('pop', { vol: 0.4 }); } } }
      if (p.state === 'sunk') { p.outT += dt; }
    }
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt; G.t += dt;
      if (!started) { started = true; G.state = 'ready'; G.t = 0; }
      if (T > maxMatchT && !finished && !G.noCap) finishMatch();
      Hh.group.scale.setScalar(Math.min(1, smooth(G.popT += dt * 2.2)));
      if (G.state === 'ready') { if (G.t > readyT) { G.state = 'play'; G.t = 0; for (const p of pl) { p.state = 'aim'; } audio.sfx('go', { vol: 0.4 }); hud.showBig(`${isFinal() ? 'FINALE! ' : ''}${def.name}`, 1100, '#ffe14a'); hud.toast(`Par ${def.par}${isFinal() ? ' · dubbele punten!' : ''}${def.hint ? ' · ' + def.hint : ''}`, 2600); } }
      if (G.state === 'play') {
        G.timeLeft -= dt; hud.setTimer(G.timeLeft, 8);
        for (const p of pl) readInput(p, dt);
        stepPhysics(dt);
        for (const p of pl) updatePlayerState(p, dt);
        updateDragon(dt);
        if (!G.nextBuilt && G.t > 2.5 && !G.sd && G.hole + 1 < N) { G.nextBuilt = true; prepNext(G.hole + 1); }
        for (const l of C.lifts) { const k = C.lifts.indexOf(l); if (G.liftSnd[k] !== l.down) { if (G.liftSnd[k] !== undefined) { audio.sfx(l.down ? 'thud' : 'creak', { vol: 0.5, rate: 0.8 }); ctx.shake(0.15); } G.liftSnd[k] = l.down; } }
        if (G.state === 'play') {
          if (pl.every((p) => p.state === 'sunk' || p.state === 'out')) endHole('klaar');
          else if (G.timeLeft <= 0) { audio.sfx('bell', { vol: 0.6 }); endHole('time'); }
        }
      } else if (G.state === 'holeEnd') {
        stepPhysics(dt); for (const p of pl) updatePlayerState(p, dt);
        if (G.t > 0.9 && !G.boardEl && !finished) showBoard();
        if (G.t > endPause && !finished) nextAfterHole();
      } else if (G.state === 'ready') { stepCourse(C, dt); for (const p of pl) updatePlayerState(p, dt); }
      visuals(dt);
    }

    // ---------------- beeld ----------------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), fitV = new THREE.Vector3();
    let fitKey = '', fitDist = 40, camX = 0, camZ = 0, camD = 40;
    function updateCamera(dt, snap) {
      const asp = camera.aspect || 1.7, pitch = THREE.MathUtils.degToRad(58), key = (def ? def.id : 0) + ':' + asp.toFixed(2);
      if (key !== fitKey) {
        fitKey = key; let lo = 12, hi = 110; const sh = 1.2;
        for (let k = 0; k < 14; k++) {
          const d = (lo + hi) / 2; camL.set(bnd.cx, 0, bnd.cz - sh); camP.set(camL.x, Math.sin(pitch) * d, camL.z + Math.cos(pitch) * d); camera.position.copy(camP); camera.lookAt(camL); camera.updateMatrixWorld(true);
          let ok = true;
          for (const [sx, sz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const yy of [0, 1.0]) { fitV.set(bnd.x0 - 0.7 + sx * (bnd.w + 1.4), yy, bnd.z0 - 0.7 + sz * (bnd.d + 1.4)).project(camera); if (Math.abs(fitV.x) > 0.94 || fitV.y > 0.7 || fitV.y < -0.84) ok = false; }
          if (ok) hi = d; else lo = d;
        }
        fitDist = hi; if (snap || camD === 40) { camX = bnd.cx; camZ = bnd.cz - sh; camD = fitDist; }
      }
      camX = damp(camX, bnd.cx, 2.5, dt); camZ = damp(camZ, bnd.cz - 1.2, 2.5, dt); camD = damp(camD, fitDist, 2.5, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.4;
      camL.set(camX, 0, camZ); camP.set(camX + sway, Math.sin(pitch) * camD, camZ + Math.cos(pitch) * camD); camera.position.copy(camP); camera.lookAt(camL);
    }
    const smooth = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3) * (1 + 0.6 * Math.sin(t * 3)) * (1 - t * 0.0); };
    const dm = new THREE.Object3D(), col = new THREE.Color();
    function visuals(dt) {
      const tt = T + introT;
      for (const p of pl) {
        const b = p.ball, vis = p.bm.visible;
        let sc = p.r, by = p.r + b.y;
        if (p.state === 'sunk') { const k = clamp(p.outT / 0.45, 0, 1); b.x = lerp(b.x, C.cup[0], 0.3); b.z = lerp(b.z, C.cup[1], 0.3); sc = p.r * (1 - k); by = p.r * (1 - k) - k * 0.2; if (k >= 1) p.bm.visible = false; }
        p.bm.position.set(b.x, by, b.z); p.bm.scale.setScalar(Math.max(0.001, sc)); p.bm.rotation.x += b.vz * dt * 2.5 / p.r * 0.5; p.bm.rotation.z -= b.vx * dt * 2.5 / p.r * 0.5;
        p.shadow.position.set(b.x, 0.05, b.z); p.shadow.scale.setScalar(p.r * 2.2 * (1 - Math.min(0.5, b.y * 0.15))); p.shadow.visible = p.bm.visible;
        const aiming = p.state === 'aim' && G.state === 'play' && p.frozen <= 0;
        p.ring.visible = p.bm.visible && p.state !== 'sunk'; p.ring.position.set(b.x, 0.07, b.z); p.ring.scale.setScalar(p.r * (aiming ? 1.5 + Math.sin(tt * 6) * 0.1 : 1.2)); p.ring.material.opacity = aiming ? 0.9 : 0.35;
        // pijl
        p.dots.visible = aiming || (G.state === 'ready'); p.head.visible = p.dots.visible;
        if (p.dots.visible) {
          const capL = 1.4 + 11 * p.pw, curL = p.charging ? 1.4 + 11 * p.m : capL, dx = Math.cos(p.ang), dz = Math.sin(p.ang); let n = Math.min(16, Math.floor(capL / 0.85));
          for (let k = 0; k < n; k++) { const d = 1.1 + k * 0.85; dm.position.set(b.x + dx * d, 0.09, b.z + dz * d); dm.rotation.set(0, 0, 0); const s = (p.charging && d > curL) ? 0.5 : 1 + (p.charging ? 0.25 : 0); dm.scale.setScalar(s); dm.updateMatrix(); p.dots.setMatrixAt(k, dm.matrix); const q = clamp((d - 1.1) / 11, 0, 1); if (p.charging && d > curL) col.setRGB(0.5, 0.5, 0.55); else col.setRGB(clamp(q * 2, 0, 1), clamp(2 - q * 2, 0, 1), 0.25); p.dots.setColorAt(k, col); }
          p.dots.count = n; p.dots.instanceMatrix.needsUpdate = true; if (p.dots.instanceColor) p.dots.instanceColor.needsUpdate = true;
          const hd = 1.1 + n * 0.85 + 0.2; p.head.position.set(b.x + dx * hd, 0.1, b.z + dz * hd); p.head.rotation.y = -p.ang; p.head.material.color.setHex(p.boost ? 0xff6ad0 : 0xffffff);
        }
        // poppetje
        const dx = Math.cos(p.ang), dz = Math.sin(p.ang), tx = b.x - dx * 1.7, tz = b.z - dz * 1.7;
        const ox = p.hx, oz = p.hz; p.hx = damp(p.hx, tx, 6, dt); p.hz = damp(p.hz, tz, 6, dt);
        const sc2 = 2.3 / p.c.height * pv.size(p.i) ** 0.6; p.holder.scale.setScalar(sc2); p.holder.position.set(p.hx, popts.hop ? Math.abs(Math.sin(tt * 4 + p.i)) * 0.5 : 0, p.hz);
        const mv = Math.hypot(p.hx - ox, p.hz - oz) / Math.max(dt, 1e-3); p.c.speed = clamp(mv / 7, 0, 1);
        p.c.faceDir(dx, dz);
        if (p.poseT <= 0 && p.state !== 'sunk') p.c.pose = p.charging ? 'scared' : (p.state === 'aim' ? 'carry' : 'idle');
        p.c.update(dt);
        p.tag.position.set(p.hx, 2.3 * pv.size(p.i) ** 0.6 + 1.0, p.hz + 0.2); p.tag.visible = G.state !== 'holeEnd';
        // HUD
        const bar = bars[p.i]; const txt = p.state === 'sunk' ? 'IN HET GAT!' : p.state === 'out' ? 'Max slagen' : p.state === 'pen' ? 'Strafslag...' : p.frozen > 0 ? 'Bevroren!' : `Slag ${p.strokes}/${maxS} · Ballon ${p.bonkUsed ? '✘' : (p.boost ? 'TURBO' : '✔')}`;
        if (txt !== p.txt) { p.txt = txt; hud.setPlayerInfo(p.i, txt); }
        const lab = p.charging ? `KRACHT ${Math.round(p.m * 100)}%` : (p.state === 'aim' ? `Max ${Math.round(p.pw * 100)}% · houd A` : (p.state === 'roll' ? 'rollen...' : '—'));
        if (bar.last !== lab) { bar.last = lab; bar.gl.textContent = `${players[p.i].name}: ${lab}`; }
        bar.gf.style.width = (p.charging ? p.m * 100 : p.state === 'aim' ? 0 : 0) + '%'; bar.gc.style.left = `calc(${p.pw * 100}% - 3px)`;
      }
      // ballon-animatie
      if (balloon.on) { balloon.t += dt; const u = balloon.t / 0.4; bonkB.visible = u < 1; const x = lerp(balloon.from[0], balloon.to[0], clamp(u, 0, 1)), z = lerp(balloon.from[1], balloon.to[1], clamp(u, 0, 1)); bonkB.position.set(x, 1 + Math.sin(clamp(u, 0, 1) * Math.PI) * 1.5, z); bonkB.scale.setScalar(1 + u * 0.5); if (u >= 1) balloon.on = false; }
      if (G.state === 'ready' || G.state === 'play') mountBars(true);
      Hh.update(tt, dt); S0.update(tt, dt); updateCamera(dt, false);
    }
    function resultUpdate(dt) { T += dt; for (const p of pl) p.c.update(dt); S0.update(T + introT, dt); Hh.update(T + introT, dt); updateCamera(dt, false); mountBars(false); }
    function introUpdate(dt) { introT += dt; stepCourse(C, dt); Hh.group.scale.setScalar(Math.min(1, smooth(G.popT += dt * 2.2))); for (const p of pl) { p.c.pose = 'idle'; } visuals(dt); }

    loadHole(0); G.state = 'ready'; refreshHud(); updateCamera(0.016, true); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(p.ball.x, 1, p.ball.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) { movers.forEach((m, i) => { if (!m) return; const p = pl[i]; if (p.state === 'aim' || p.state === 'roll') { p.strokes = Math.min(maxS, p.strokes + 1); p.frozen = 1.5; p.charging = false; fx.texts.add('DEURMAN! +1', p.ball.x, 2.6, p.ball.z, '#ff9a9a', 1.3); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } }); },
      celebrate(w) { pl[w].c.pose = 'cheer'; pl[1 - w].c.pose = 'sad'; for (const p of pl) p.poseT = 99; S0.cheer(8); },
      dispose() { mountBars(false); if (G.boardEl) { G.boardEl.remove(); G.boardEl = null; } if (G.next) { dropHole(G.next.H); G.next = null; } },
      dbg: {
        state: () => ({ T, gstate: G.state, hole: G.hole, sd: G.sd, timeLeft: G.timeLeft, grace: G.grace, finished, totals: pl.map((p) => p.total), results: G.results, dragon: D.state, stats,
          mill: C ? C.t : 0, N, holeIds: matchHoles.map((h) => h.id), defId: def ? def.id : 0, tscale, maxS, finals: G.results.map((r) => r.final), pl: pl.map((p) => ({ x: p.ball.x, z: p.ball.z, vx: p.ball.vx, vz: p.ball.vz, y: p.ball.y, state: p.state, strokes: p.strokes, ang: p.ang, pw: p.pw, m: p.m, charging: p.charging, bonkUsed: p.bonkUsed, boost: p.boost, pts: p.pts, r: p.r, carried: p.carried })) }),
        course: () => C, def: () => def, pl, fire: (i, ang, m) => { pl[i].ang = ang; pl[i].state = 'aim'; fire(pl[i], m); }, loadHole, setTime: (t) => { G.timeLeft = t; }, loadDef: (id) => { const d = HOLES.find((h) => h.id === id); loadHole(Math.max(0, G.hole), d); }, matchHoles: () => matchHoles, N, noCap: () => { G.noCap = true; }, setTotals: (a, b) => { pl[0].total = a; pl[1].total = b; refreshHud(); },
        startDragon, sink: (i) => { const p = pl[i]; p.ball.x = C.cup[0]; p.ball.z = C.cup[1]; p.ball.vx = p.ball.vz = 0; ballSunk(p); }, bonk: (i) => useBalloon(pl[i]), teleport: (i, x, z) => { pl[i].ball.x = x; pl[i].ball.z = z; pl[i].ball.vx = pl[i].ball.vz = 0; },
      },
    };
  },
};

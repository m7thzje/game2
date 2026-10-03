import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, mulberry32, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeBrother, PLAYER_COLORS, Animal, Slime, Dragon } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { B, cx, cz, setI, buildWorld, itemTexture, ITEM_COL } from './bomber_world.js';

// Boem-Man Arena — duel: Bomberman in een vulkaan-kerker. Best-of-3 rondes (wie raakt, is af).
//  * richtingen = lopen (vrij, met gladde botsingen), A = bom leggen (lont, kruisvormige explosie, kettingreacties), B = schoppen (bom wegschoppen of je broer wegduwen)
//  * kratten bevatten power-ups (bereik, extra bom, snelheid, schild, mega-bom), gouden krat in het midden
//  * gimmicks: kippen (laten een cadeautje vallen), slijmerds (plakken je vast), de draak die een bom dropt op de sterkste
//  * sudden death: na 20 s vallen er stenen van het plafond (altijd in gespiegelde paren, dus eerlijk). Gelijk? Dan kiest Kip Kiki.
//  * 3 spelers (Juul): drie startpunten (links, rechts, midden onder; onderling even ver), links-rechts gespiegelde kratten/stenen/slijm, de laatste die overleeft wint
//    de ronde (eerste tot 2 ronde-winsten); de draak mikt op de sterkste; gelijke leiders na 3 rondes: Kip Kiki kiest een van hen.
const { COLS, ROWS, CELL } = B;
const N = COLS * ROWS;
const idx = (c, r) => r * COLS + c;
const toC = (x) => Math.round(x / CELL) + 6, toR = (z) => Math.round(z / CELL) + 5;
const inb = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
const SPAWN2 = [[0, 0], [COLS - 1, ROWS - 1]], SPAWN3 = [[0, 4], [COLS - 1, 4], [6, ROWS - 1]];   // 2: tegenover elkaar in de hoeken; 3: links, rechts en onder (paarsgewijs 12 stappen uit elkaar: eerlijk)
const FACE2 = [[1, 0], [-1, 0]], FACE3 = [[1, 0], [-1, 0], [0, -1]];       // kijkrichting bij de start
const PCSS_ALL = ['#7dffb0', '#8fb8ff', '#ffc58a'];
const BASE_SPEED = 5.2, FUSE = 2.5, FLAME_T = 0.62, SLIDE_V = 11;
const NEED_WINS = 2, MAX_ROUNDS = 3, SUDDEN_T = 20, SUDDEN_T_FINAL = 13;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ITEM_NAME = { range: 'BEREIK +1!', bomb: 'EXTRA BOM!', speed: 'SNELLER!', shield: 'SCHILD!', mega: 'MEGA-BOM!', gold: 'GOUD-PAKKET!' };
const ITEM_W = [['range', 28], ['bomb', 28], ['speed', 17], ['shield', 10], ['mega', 8]];
const ITEM_FRAC = 0.4;                                  // aandeel kratten met power-up
const KAAS = ['Kapot!', 'BOEM!', 'KRAK!', 'POEF!'];

const _qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), _mm = new THREE.Matrix4(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3();

export default {
  id: 'bomber',
  name: 'Boem-Man Arena',
  giver: 'Meester Lont',
  icon: '💣',
  mode: 'pvp',
  players: [2, 3],                       // 2 spelers (duel) of 3 spelers (vrij voor allen, Juul doet mee)
  time: 90,
  music: 'game_fast',
  blurb: 'Leg <b>bommen</b>, sloop kratten, pak <b>power-ups</b> en blaas je broer op! Wie geraakt wordt is af. Eerste met <b>2 rondes</b> wint. Na 20 seconden vallen er <b>stenen van het plafond</b>. Pas op voor de <b>draak</b> en de <b>slijmerds</b>! Met drie spelers wint wie als laatste overeind blijft.',
  controls: ['{move} lopen', '{a} bom leggen', '{b} schoppen (bom of broer)'],
  tip: 'Schop een bom naar je broer toe en ren om een hoek! Kippen laten cadeautjes vallen.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const NP = players.length;                                          // 2 of 3 deelnemers (slots)
    const SPAWN = NP === 3 ? SPAWN3 : SPAWN2, FACE = NP === 3 ? FACE3 : FACE2, PCSS = players.map((p) => PCSS_ALL[p.id]);
    const mir = NP === 3 ? (i) => i - (i % COLS) + (COLS - 1 - (i % COLS)) : (i) => N - 1 - i;   // gespiegelde cel: 2 spelers puntspiegeling, 3 spelers links-rechts
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = tw === 'turbo' || tw === 'slowmo' ? ctx.twist.speed : 1;
    const FUSE_T = FUSE / (1 + (TEMPO - 1) * 0.6);
    const rng = mulberry32((Date.now() ^ 0x5eed) >>> 0);
    const rnd = () => rng();

    const L = ctx.lights('cave', { shadow: 22, center: [0, 0, 0], fogNear: 50, fogFar: 120 });
    camera.fov = 46; camera.updateProjectionMatrix();
    const W = buildWorld(ctx, L, players.map((p) => p.id));

    // ---------------- toestand ----------------
    const g = new Uint8Array(N);                  // 0 vrij, 1 pilaar, 2 krat, 3 gouden krat, 4 steen
    const hid = new Array(N).fill(null);          // power-up in een krat
    const flameT = new Float32Array(N), flameOwner = new Int8Array(N).fill(-1);
    const bombAt = new Int16Array(N).fill(-1);
    const G = { state: 'init', t: 0, roundT: 0, round: 0, sudden: false, ending: false, slow: 1, slowT: 0, wins: new Array(NP).fill(0), winner: null, final: false, hudT: 0, tick: 0, endSet: [], hintOn: false, camPunch: 0 };
    const stats = { bombs: 0, crates: 0, chickens: 0, kicks: 0, items: 0, dragons: 0, slimes: 0, crush: 0, shoves: 0 };
    let T = 0, introT = 0, finished = false, baseSeed = (rnd() * 1e6) | 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (c % 2 === 1 && r % 2 === 1) g[idx(c, r)] = 1;

    // ---------------- spelers ----------------
    const pads = [];
    const tagTex = (pp) => canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(20,8,10,.9)'; c.lineJoin = 'round'; c.strokeText(pp.name, w / 2, hh / 2); c.fillStyle = pp.css; c.fillText(pp.name, w / 2, hh / 2); });
    const pl = players.map((pp, i) => {
      const c = makeBrother(i); const sz = pv.size(i); const k = 2.3 / c.height * sz; c.group.scale.setScalar(k); scene.add(c.group);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.92, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
      const shadow = P.shadowBlob(0.8); scene.add(shadow);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(pp), transparent: true, depthTest: false })); tag.scale.set(2.3, 0.86, 1); tag.renderOrder = 15; scene.add(tag);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x6adcff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); bubble.visible = false; scene.add(bubble);
      return { i, c, k, sz, ring, shadow, tag, bubble, r: 0.62 * lerp(1, sz, 0.5), x: 0, z: 0, vx: 0, vz: 0, fx: FACE[i][0], fz: FACE[i][1], alive: true, deadTick: -1, bombsMax: 1, range: 2, speedLv: 0, shield: false, inv: 0, mega: false, kickCd: 0, stun: 0, slow: 0, y: 0, dvy: 0, spin: 0, deadT: 0, bombsOut: 0, dirty: 0, hopT: 0, lastTxt: '' };
    });

    // ---------------- bommen-pool ----------------
    const bombGeo = new THREE.SphereGeometry(0.72, 14, 10), capGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.2, 8), bandGeo = new THREE.TorusGeometry(0.69, 0.07, 5, 16), fuseGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 5);
    const sparkTex = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,220,80,.9)'); gr.addColorStop(1, 'rgba(255,100,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
    const bombs = Array.from({ length: 18 }, () => {
      const grp = new THREE.Group();
      const bm = new THREE.MeshStandardMaterial({ color: 0x20202c, roughness: 0.4, metalness: 0.35, emissive: 0xff2200, emissiveIntensity: 0 });
      const body = mesh(bombGeo, bm, { pos: [0, 0.78, 0] });
      const band = mesh(bandGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }), { cast: false, pos: [0, 0.78, 0], rot: [Math.PI / 2, 0, 0] });
      const capm = mesh(capGeo, mat(0x777788, { metalness: 0.6 }), { cast: false, pos: [0, 1.5, 0] }); const fuse = mesh(fuseGeo, mat(0xb08a50), { cast: false, pos: [0, 1.72, 0] });
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spark.scale.set(0.9, 0.9, 1); spark.position.set(0, 1.98, 0);
      grp.add(body, band, capm, fuse, spark); grp.visible = false; scene.add(grp);
      return { on: false, grp, body, bm, band, spark, c: 0, r: 0, x: 0, z: 0, t: 0, owner: 0, range: 2, slide: null, prog: 0, pass: new Array(NP).fill(false), fy: 0, fvy: 0, wob: rnd() * 6, ghost: false };
    });
    const shadows = Array.from({ length: 18 }, () => { const s = P.shadowBlob(0.9); s.visible = false; scene.add(s); return s; });

    // ---------------- power-ups (sprites) ----------------
    const itemTex = {}; for (const k of Object.keys(ITEM_COL)) itemTex[k] = itemTexture(k);
    const items = Array.from({ length: 24 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTex.range, transparent: true, depthWrite: false })); s.scale.set(1.6, 1.6, 1); s.visible = false; scene.add(s); const sh = P.shadowBlob(0.6); sh.visible = false; scene.add(sh); return { on: false, s, sh, c: 0, r: 0, type: '', t: 0, imm: 0 }; });

    // ---------------- dieren, slijm, draak ----------------
    const chickens = []; const slimes = [];
    const dragon = new Dragon(0xc8321e, 0.8); dragon.group.visible = false; scene.add(dragon.group);
    const D = { state: 'idle', t: 9, tc: 0, tr: 0, ft: 0, dir: 1, dropped: false };
    const dMark = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.7, 24), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); dMark.rotation.x = -Math.PI / 2; dMark.position.y = 0.07; dMark.visible = false; scene.add(dMark);
    const bigChicken = new Animal('chicken'); bigChicken.group.scale.setScalar(3.2); bigChicken.group.visible = false; scene.add(bigChicken.group);

    // ---------------- stenen (sudden death) ----------------
    const stoneGeo = new THREE.BoxGeometry(1.98, 1.7, 1.98), stoneMat = new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0xb07058, emissive: 0x401408, emissiveIntensity: 0.6, roughness: 0.95, flatShading: true });
    const fall = Array.from({ length: NP === 3 ? 18 : 10 }, () => { const m = mesh(stoneGeo, stoneMat); m.visible = false; scene.add(m); return { on: false, m, i: 0, t: 0, y: 0, vy: 0 }; });
    let stoneQ = [], stoneQi = 0, stoneT = 0, stoneBack = [];     // stoneBack: stenen die wachten op een vrij plekje in de pool (nooit een cel overslaan)

    const power = (p) => p.bombsMax + p.range + p.speedLv + (p.shield ? 1 : 0);
    const solidG = (i) => g[i] !== 0;
    const flameAt = (c, r) => inb(c, r) && flameT[idx(c, r)] > 0;
    function circleHitsCell(x, z, rad, c, r) { const nx = clamp(x, cx(c) - CELL / 2, cx(c) + CELL / 2), nz = clamp(z, cz(r) - CELL / 2, cz(r) + CELL / 2); return (x - nx) * (x - nx) + (z - nz) * (z - nz) < rad * rad; }

    // ---------------- level genereren ----------------
    function genLevel(seed) {
      const lr = mulberry32(seed); g.fill(0); hid.fill(null); flameT.fill(0); flameOwner.fill(-1); bombAt.fill(-1);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (c % 2 === 1 && r % 2 === 1) g[idx(c, r)] = 1;
      const safeCells = NP === 3 ? [[0, 3], [0, 4], [0, 5], [1, 4], [0, 6], [0, 7], [0, 8], [6, 10], [5, 10], [6, 9], [6, 6], [6, 7], [6, 8]] : [[0, 0], [1, 0], [0, 1], [0, 4], [0, 5], [0, 6]];   // startvelden + ruimte voor de kippen
      const safe = new Set(); for (const [c, r] of safeCells) { safe.add(idx(c, r)); safe.add(mir(idx(c, r))); }
      const totW = ITEM_W.reduce((a, [, w]) => a + w, 0);
      for (let i = 0; i < N; i++) {
        const j = mir(i); if (j < i || g[i] === 1 || safe.has(i)) continue;
        if (i === j) {                                    // midden: gouden krat (3 spelers: de rest van de middenkolom zijn gewone losse kratten)
          if (i === idx(6, 5)) g[i] = 3; else if (lr() < 0.74) { g[i] = 2; if (lr() < ITEM_FRAC) { let q = lr() * totW, t = 'range'; for (const [k, w] of ITEM_W) { q -= w; if (q <= 0) { t = k; break; } } hid[i] = t; } }
          continue;
        }
        if (lr() < 0.74) {
          g[i] = g[j] = 2;
          if (lr() < ITEM_FRAC) { let q = lr() * totW, t = 'range'; for (const [k, w] of ITEM_W) { q -= w; if (q <= 0) { t = k; break; } } hid[i] = hid[j] = t; }
        }
      }
      for (let i = 0; i < N; i++) { const c = i % COLS, r = (i / COLS) | 0; if (g[i] === 2) setI(W.crates, i, cx(c), 0.78, cz(r)); else setI(W.crates, i, 0, -50, 0, 0); setI(W.stones, i, 0, -50, 0, 0); }
      W.crates.instanceMatrix.needsUpdate = true; W.stones.instanceMatrix.needsUpdate = true;
      W.gold.visible = true; W.gold.position.set(cx(6), 0.9, cz(5));
    }
    function buildStoneQueue() {
      const cells = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!(c % 2 === 1 && r % 2 === 1)) cells.push({ i: idx(c, r), ring: Math.min(c, r, COLS - 1 - c, ROWS - 1 - r), a: Math.atan2(r - 5, c - 6) });
      stoneQ = [];
      if (NP === 3) {   // 3 spelers: buitenste ring eerst, daarbinnen eerst de cellen vlakbij een startpunt (alle drie tegelijk), in groepjes van max 6
        const kd = (i) => Math.min(...SPAWN.map(([c, r]) => Math.abs(c - (i % COLS)) + Math.abs(r - ((i / COLS) | 0))));
        for (const q of cells) q.k = kd(q.i);
        cells.sort((p, q) => p.ring - q.ring || p.k - q.k || p.a - q.a);
        let cur = null; for (const q of cells) { if (!cur || cur.ring !== q.ring || cur.k !== q.k || cur.list.length >= 6) { cur = { ring: q.ring, k: q.k, list: [] }; stoneQ.push(cur.list); } cur.list.push(q.i); }
      } else {
        cells.sort((p, q) => p.ring - q.ring || p.a - q.a);
        const seen = new Set();
        for (const { i } of cells) { if (seen.has(i)) continue; seen.add(i); seen.add(mir(i)); stoneQ.push(i === mir(i) ? [i] : [i, mir(i)]); }
      }
      stoneQi = 0; stoneT = 0; stoneBack.length = 0;
    }

    // ---------------- ronde ----------------
    function resetPlayer(p) {
      const [c, r] = SPAWN[p.i]; p.x = cx(c); p.z = cz(r); p.vx = p.vz = 0; p.alive = true; p.bombsMax = 1; p.range = 2; p.speedLv = 0; p.shield = false; p.inv = 0; p.mega = false; p.kickCd = 0; p.stun = 0; p.slow = 0; p.y = 0; p.dvy = 0; p.spin = 0; p.deadT = 0; p.bombsOut = 0; p.hopT = 0;
      p.fx = FACE[p.i][0]; p.fz = FACE[p.i][1]; p.deadTick = -1; p.c.pose = 'idle'; p.c.group.rotation.set(0, 0, 0); p.c.group.visible = true; p.c.faceDir(p.fx, p.fz); p.c.yaw = p.c.targetYaw; p.ring.visible = true; p.tag.visible = true;
      // troostschild: wie achterstaat begint met een schild
      if (G.round > 1 && G.wins[p.i] < Math.max(...G.wins)) { p.shield = true; fx.texts.add('TROOSTSCHILD!', p.x, 3.4, p.z, '#6adcff', 1.4); }
    }
    function startRound(n) {
      G.round = n; G.roundT = 0; G.sudden = false; G.ending = false; G.slow = 1; G.final = n >= MAX_ROUNDS; G.state = n === 1 ? 'play' : 'intro'; G.t = 0; G.hintOn = false;
      genLevel(baseSeed + n * 7919);
      for (const b of bombs) { b.on = false; b.grp.visible = false; b.slide = null; } shadows.forEach((s) => { s.visible = false; });
      for (const it of items) { it.on = false; it.s.visible = false; it.sh.visible = false; }
      for (const f of fall) { f.on = false; f.m.visible = false; }
      pl.forEach(resetPlayer);
      // kippen en slijm
      for (const a of chickens) scene.remove(a.a.group); chickens.length = 0;
      for (const s of slimes) scene.remove(s.a.group); slimes.length = 0;
      for (const [c, r] of (NP === 3 ? [[0, 7], [COLS - 1, 7], [6, 7]] : [[0, 5], [COLS - 1, 5]])) { const a = new Animal('chicken'); a.group.scale.setScalar(1.35); scene.add(a.group); chickens.push({ a, x: cx(c), z: cz(r), tc: c, tr: r, c, r, wait: rand(0.3, 1.2), moving: false, dead: false, prog: 0 }); }
      D.state = 'idle'; D.t = rand(8, 11); dragon.group.visible = false; dMark.visible = false; slimeT = rand(9, 12);
      buildStoneQueue();
      G.slowT = 0;
      refreshHud();
      if (n > 1) { hud.showBig(G.final ? 'LAATSTE RONDE!' : `RONDE ${n}!`, 1300, '#ffe14a'); audio.sfx('bell', { vol: 0.5 }); }
    }
    let slimeT = 10;

    function refreshHud() {
      hud.setScore(NP === 3 ? `${names[0]} ${G.wins[0]} – ${G.wins[1]} ${names[1]} – ${G.wins[2]} ${names[2]}   (ronde ${G.round}/${MAX_ROUNDS})` : `${names[0]} ${G.wins[0]} – ${G.wins[1]} ${names[1]}   (ronde ${G.round}/${MAX_ROUNDS})`);
    }
    function infoText(p) { return `💣${p.bombsMax} 🔥${p.range} 👟${p.speedLv}${p.shield ? ' 🛡' : ''}${p.mega ? ' ☄' : ''}${p.alive ? '' : ' 💀'}  ·  ${G.wins[p.i]} gewonnen`; }

    // ---------------- bommen ----------------
    function spawnBomb(c, r, owner, { range = 2, fuse = FUSE_T, ghost = false, fall: fy = 0, mega = false } = {}) {
      const b = bombs.find((q) => !q.on); if (!b) return null;
      b.on = true; b.c = c; b.r = r; b.x = cx(c); b.z = cz(r); b.t = fuse; b.owner = owner; b.range = range; b.slide = null; b.prog = 0; b.fy = fy; b.fvy = 0; b.ghost = ghost; b.mega = mega;
      b.pass.fill(false); for (const p of pl) if (p.alive && circleHitsCell(p.x, p.z, p.r, c, r)) b.pass[p.i] = true;
      b.band.material.color.set(owner >= 0 ? PLAYER_COLORS[owner] : 0xaa44ff); b.band.material.emissive.set(owner >= 0 ? PLAYER_COLORS[owner] : 0xaa44ff);
      b.bm.color.set(mega ? 0x401040 : ghost ? 0x6a2a8a : 0x20202c);
      bombAt[idx(c, r)] = bombs.indexOf(b); b.grp.visible = true; b.grp.position.set(b.x, fy, b.z); return b;
    }
    function placeBomb(p) {
      const c = toC(p.x), r = toR(p.z), i = idx(c, r);
      if (!inb(c, r) || g[i] !== 0 || bombAt[i] >= 0 || p.bombsOut >= p.bombsMax || flameT[i] > 0) { if (p.bombsOut >= p.bombsMax) { fx.texts.add('Geen bommen!', p.x, 3, p.z, '#ff9a9a', 0.9); audio.sfx('buzz', { vol: 0.25 }); } return; }
      const mega = p.mega; p.mega = false;
      const b = spawnBomb(c, r, p.i, { range: p.range + (mega ? 4 : 0), mega }); if (!b) return;
      p.bombsOut++; stats.bombs++; audio.sfx('thud', { vol: 0.35 }); audio.sfx('click', { vol: 0.3 }); p.c.swing(); fx.particles.dust(b.x, 0.1, b.z, 4, 0xd8c8a8);
    }
    function trigger(b) { if (b.t > 0.07) b.t = 0.07; }
    function destroyCrate(i, byStone = false) {
      const c = i % COLS, r = (i / COLS) | 0; const gold = g[i] === 3; g[i] = 0; stats.crates++;
      setI(W.crates, i, 0, -50, 0, 0); W.crates.instanceMatrix.needsUpdate = true; if (gold) W.gold.visible = false;
      fx.particles.burst(cx(c), 1, cz(r), { count: gold ? 36 : 14, speed: 5, up: 1.4, life: 0.8, size: 0.4, colors: gold ? [0xffd23f, 0xfff0a0, 0xffa010] : [0xb98a54, 0x8a5a2e, 0xd8b078], gravity: 12 });
      if (!byStone) { if (gold) spawnItem(c, r, 'gold'); else if (hid[i]) spawnItem(c, r, hid[i]); }
      hid[i] = null;
    }
    function explode(b) {
      if (!b.on) return; b.on = false; b.grp.visible = false; const bi = bombs.indexOf(b); if (bombAt[idx(b.c, b.r)] === bi) bombAt[idx(b.c, b.r)] = -1;
      if (b.owner >= 0) pl[b.owner].bombsOut = Math.max(0, pl[b.owner].bombsOut - 1);
      const flame = (c, r) => { const i = idx(c, r); flameT[i] = FLAME_T; flameOwner[i] = b.owner; fx.particles.burst(cx(c), 0.9, cz(r), { count: 6, speed: 3.2, up: 1.5, life: 0.55, size: 0.55, colors: [0xff7a1a, 0xffd23f, 0xff3a0a, 0x555555], gravity: -2 }); };
      flame(b.c, b.r);
      for (const [dx, dz] of DIRS) for (let k = 1; k <= b.range; k++) {
        const c = b.c + dx * k, r = b.r + dz * k; if (!inb(c, r)) break; const i = idx(c, r), gi = g[i];
        if (gi === 1 || gi === 4) break;
        flame(c, r);
        if (gi === 2 || gi === 3) { destroyCrate(i); break; }
        if (bombAt[i] >= 0) { trigger(bombs[bombAt[i]]); break; }
      }
      audio.sfx('explode', { vol: 0.6 }); ctx.shake(b.mega ? 0.7 : 0.4); W.cheer(0.8); G.camPunch = Math.max(G.camPunch, b.mega ? 0.6 : 0.3);
      fx.particles.ring(b.x, 0.5, b.z, { count: 22, speed: 8, color: 0xffd23f, size: 0.45, life: 0.45 });
      if (rnd() < 0.5) fx.texts.add(pick(KAAS), b.x, 3.4, b.z, '#ffb03a', 1.1);
    }
    function kickBomb(b, dx, dz) {
      const nc = b.c + dx, nr = b.r + dz; if (!inb(nc, nr)) return false; const ni = idx(nc, nr);
      if (g[ni] !== 0 || bombAt[ni] >= 0) return false;
      for (const p of pl) if (p.alive && circleHitsCell(p.x, p.z, p.r + 0.05, nc, nr)) return false;
      b.slide = { dx, dz }; b.prog = 0; b.sx = b.x; b.sz = b.z; bombAt[idx(b.c, b.r)] = -1; b.c = nc; b.r = nr; bombAt[ni] = bombs.indexOf(b); b.pass.fill(false); return true;
    }
    function stepSlide(b, dt) {
      const s = b.slide; b.prog += dt * SLIDE_V / CELL;
      while (b.prog >= 1) {
        b.prog -= 1; b.x = cx(b.c); b.z = cz(b.r); b.sx = b.x; b.sz = b.z;
        const nc = b.c + s.dx, nr = b.r + s.dz; let ok = inb(nc, nr) && g[idx(nc, nr)] === 0 && bombAt[idx(nc, nr)] < 0;
        if (ok) for (const p of pl) if (p.alive && circleHitsCell(p.x, p.z, p.r + 0.05, nc, nr)) ok = false;
        if (ok) for (const a of chickens) if (!a.dead && a.c === nc && a.r === nr) ok = false;
        if (ok) for (const a of slimes) if (!a.dead && a.c === nc && a.r === nr) ok = false;
        if (!ok) { b.slide = null; b.prog = 0; audio.sfx('thud', { vol: 0.3 }); fx.particles.dust(b.x, 0.1, b.z, 3); return; }
        bombAt[idx(b.c, b.r)] = -1; b.c = nc; b.r = nr; bombAt[idx(nc, nr)] = bombs.indexOf(b);
      }
      b.x = lerp(b.sx, cx(b.c), b.prog); b.z = lerp(b.sz, cz(b.r), b.prog);
      if (rnd() < dt * 30) fx.particles.emit(b.x, 0.3, b.z, 0, 0.5, 0, { life: 0.3, size: 0.35, color: 0xffd23f, gravity: 0 });
    }

    // ---------------- power-ups ----------------
    function spawnItem(c, r, type, imm = 0.9) {
      const it = items.find((q) => !q.on); if (!it) return; it.on = true; it.c = c; it.r = r; it.type = type; it.t = 0; it.imm = imm; it.s.material.map = itemTex[type]; it.s.visible = true; it.sh.visible = true;
      fx.particles.ring(cx(c), 0.4, cz(r), { count: 10, speed: 3, color: 0xffffff, size: 0.3, life: 0.4 });
    }
    function applyItem(p, type) {
      const col = ITEM_COL[type];
      if (type === 'range') p.range = Math.min(8, p.range + 1);
      else if (type === 'bomb') p.bombsMax = Math.min(5, p.bombsMax + 1);
      else if (type === 'speed') p.speedLv = Math.min(4, p.speedLv + 1);
      else if (type === 'shield') p.shield = true;
      else if (type === 'mega') p.mega = true;
      else if (type === 'gold') { p.bombsMax = Math.min(5, p.bombsMax + 1); p.range = Math.min(8, p.range + 1); p.shield = true; }
      stats.items++;
      fx.texts.add(ITEM_NAME[type], p.x, 3.6, p.z, col, 1.5); audio.sfx(type === 'gold' ? 'win' : 'powerup', { vol: type === 'gold' ? 0.4 : 0.7 }); if (type === 'gold') audio.sfx('sparkle', { vol: 0.6 });
      fx.particles.burst(p.x, 1, p.z, { count: type === 'gold' ? 50 : 24, speed: 5, up: 1.3, life: 0.9, size: 0.4, colors: [parseInt(col.slice(1), 16), 0xffffff], gravity: 4 }); p.c.jump();
    }

    // ---------------- dood / raak ----------------
    function hurt(p, crush = false) {
      if (!p.alive || G.state === 'roundEnd' || G.state === 'end' || G.state === 'chicken') return;
      if (!crush && p.inv > 0) return;
      if (!crush && p.shield) { p.shield = false; p.inv = 1.6; fx.texts.add('SCHILD WEG!', p.x, 3.4, p.z, '#6adcff', 1.3); audio.sfx('hit', { vol: 0.6 }); ctx.shake(0.3); fx.particles.burst(p.x, 1, p.z, { count: 30, speed: 6, up: 1, life: 0.6, size: 0.35, colors: [0x6adcff, 0xffffff], gravity: 2 }); return; }
      p.alive = false; p.deadTick = G.tick; p.dvy = 9; p.spin = (rnd() < 0.5 ? -1 : 1) * 7; p.deadT = 0; p.c.pose = 'scared'; p.y = 0.1;
      audio.sfx('hurt', { vol: 0.7 }); audio.sfx('lose', { vol: 0.25 }); ctx.shake(0.6);
      fx.particles.burst(p.x, 1.2, p.z, { count: 40, speed: 7, up: 1.3, life: 0.9, size: 0.45, colors: [0xffd23f, 0xff7a1a, 0xffffff, PLAYER_COLORS[p.i]], gravity: 6 });
      fx.texts.add(crush ? 'PLETS!' : 'AUW!', p.x, 3.5, p.z, '#ff6a5a', 1.6);
      // de ronde is voorbij zodra er nog maar één speler over is; eindset (voor gelijkspel) = overlevenden + wie in dit tijdstip viel
      if (!G.ending && pl.filter((q) => q.alive).length <= 1) { G.ending = true; G.t = 0; G.slow = 0.35; G.endSet = pl.filter((q) => q.alive || q.deadTick === G.tick).map((q) => q.i); }
    }

    // ---------------- spelers bewegen ----------------
    function solidFor(p, c, r) {
      if (!inb(c, r)) return true; const i = idx(c, r); if (g[i] !== 0) return true;
      const bi = bombAt[i]; if (bi >= 0 && !bombs[bi].pass[p.i]) return true; return false;
    }
    function collide(p) {
      const rad = p.r; const c0 = Math.floor((p.x - rad) / CELL + 6.5), c1 = Math.floor((p.x + rad) / CELL + 6.5), r0 = Math.floor((p.z - rad) / CELL + 5.5), r1 = Math.floor((p.z + rad) / CELL + 5.5);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (!solidFor(p, c, r)) continue;
        const minx = cx(c) - CELL / 2, maxx = cx(c) + CELL / 2, minz = cz(r) - CELL / 2, maxz = cz(r) + CELL / 2;
        const nx = clamp(p.x, minx, maxx), nz = clamp(p.z, minz, maxz); let dx = p.x - nx, dz = p.z - nz; const d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2), push = rad - d; p.x += dx / d * push; p.z += dz / d * push; }
        else { // middelpunt in de cel: eruit via de dichtstbijzijnde rand
          const l = p.x - minx, rr = maxx - p.x, u = p.z - minz, dn = maxz - p.z, m = Math.min(l, rr, u, dn);
          if (m === l) p.x = minx - rad; else if (m === rr) p.x = maxx + rad; else if (m === u) p.z = minz - rad; else p.z = maxz + rad;
        }
      }
    }
    function movePlayer(p, dt, canAct) {
      const inp = pv.input(p.i);
      let ix = canAct && p.stun <= 0 ? inp.x : 0, iy = canAct && p.stun <= 0 ? inp.y : 0; const mg = Math.hypot(ix, iy); if (mg > 1) { ix /= mg; iy /= mg; }
      if (mg < 0.12) { ix = 0; iy = 0; }
      const sp = BASE_SPEED * pv.speed(p.i) * (1 + 0.11 * p.speedLv) * (p.slow > 0 ? 0.5 : 1);
      const lam = lerp(24, 2.0, SLIP);
      p.vx = damp(p.vx, ix * sp, lam, dt); p.vz = damp(p.vz, iy * sp, lam, dt);
      const dist = Math.hypot(p.vx, p.vz) * dt, steps = Math.max(1, Math.ceil(dist / 0.3));
      for (let s = 0; s < steps; s++) { p.x += p.vx * dt / steps; p.z += p.vz * dt / steps; collide(p); }
      if (Math.abs(ix) + Math.abs(iy) > 0.3) { if (Math.abs(ix) > Math.abs(iy) * 1.1) { p.fx = Math.sign(ix); p.fz = 0; } else if (Math.abs(iy) > Math.abs(ix) * 1.1) { p.fx = 0; p.fz = Math.sign(iy); } }
      // bommen waar je uit gestapt bent worden vast
      for (const b of bombs) if (b.on) for (const q of pl) if (b.pass[q.i] && !circleHitsCell(q.x, q.z, q.r - 0.04, b.c, b.r)) b.pass[q.i] = false;
      if (!canAct || !p.alive) return;
      if (inp.aP && p.stun <= 0) placeBomb(p);
      p.kickCd -= dt; if (inp.bP && p.kickCd <= 0 && p.stun <= 0) kick(p);
      p.inv = Math.max(0, p.inv - dt); p.stun = Math.max(0, p.stun - dt); p.slow = Math.max(0, p.slow - dt);
    }
    function kick(p) {
      p.kickCd = 0.45; const pc = toC(p.x), pr = toR(p.z); let tb = null;
      for (const b of bombs) { if (!b.on || b.slide || b.fy > 0.3) continue; if (b.c === pc + p.fx && b.r === pr + p.fz) { tb = b; break; } if (b.c === pc && b.r === pr) tb = b; }
      p.c.swing();
      if (tb) {
        // vlak voor je (of onder je voeten): wegschoppen in kijkrichting
        if (kickBomb(tb, p.fx, p.fz)) { stats.kicks++; audio.sfx('hit', { vol: 0.4 }); audio.sfx('whoosh', { vol: 0.4 }); fx.texts.add('SCHOP!', tb.x, 2.8, tb.z, '#ffe14a', 1.1); ctx.shake(0.15); }
        else { audio.sfx('thud', { vol: 0.3 }); }
        return;
      }
      let o = null, bd = 1e9;                                       // dichtstbijzijnde levende tegenstander vlak voor je
      for (const q of pl) { if (q === p || !q.alive) continue; const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d < 2.3 && (dx * p.fx + dz * p.fz) > d * 0.35 && d < bd) { bd = d; o = q; } }
      if (o) { o.vx += p.fx * 14; o.vz += p.fz * 14; o.stun = 0.3; stats.shoves++; audio.sfx('hit', { vol: 0.5 }); fx.texts.add('DUW!', o.x, 3.2, o.z, '#ffe14a', 1.1); fx.particles.burst(o.x, 1, o.z, { count: 10, speed: 4, up: 1, life: 0.4, size: 0.3, color: 0xffffff, gravity: 4 }); ctx.shake(0.2); p.kickCd = 1.0; return; }
      audio.sfx('swing', { vol: 0.25 });
    }

    // ---------------- kippen en slijm ----------------
    function walkable(c, r) { if (!inb(c, r)) return false; const i = idx(c, r); return g[i] === 0 && bombAt[i] < 0 && flameT[i] <= 0; }
    function updateCreature(o, dt, speed, slime) {
      if (o.dead) return;
      const ci = idx(o.c, o.r);
      if (flameT[ci] > 0 || g[ci] === 4) { killCreature(o, slime, g[ci] === 4); return; }
      if (!o.moving) {
        o.wait -= dt;
        if (o.wait <= 0) {
          const opts = DIRS.map(([dx, dz]) => [o.c + dx, o.r + dz]).filter(([c, r]) => walkable(c, r));
          if (opts.length) { const [c, r] = opts[(rnd() * opts.length) | 0]; o.tc = c; o.tr = r; o.moving = true; o.prog = 0; o.sx = o.x; o.sz = o.z; o.a.targetYaw = Math.atan2(cx(c) - o.x, cz(r) - o.z); }
          else o.wait = rand(0.4, 1.0);
        }
        if (!slime) o.a.speed = 0;
      } else {
        if (!walkable(o.tc, o.tr)) { o.moving = false; o.wait = 0.4; }
        else { o.prog += dt * speed / CELL; if (o.prog >= 1) { o.c = o.tc; o.r = o.tr; o.x = cx(o.c); o.z = cz(o.r); o.moving = false; o.wait = rand(0.2, slime ? 0.7 : 1.5); } else { o.x = lerp(o.sx, cx(o.tc), o.prog); o.z = lerp(o.sz, cz(o.tr), o.prog); } if (!slime) o.a.speed = 0.8; }
        if (o.prog > 0.5) { o.c = o.tc; o.r = o.tr; }
      }
    }
    function killCreature(o, slime, byStone) {
      o.dead = true; o.a.group.visible = false; fx.particles.burst(o.x, 0.6, o.z, { count: 18, speed: 4, up: 1.4, life: 0.8, size: 0.4, colors: slime ? [0x58d86b, 0xb8ffa0] : [0xffffff, 0xf6f1e4, 0xd83a2a], gravity: 8 });
      if (slime) { stats.slimes++; fx.texts.add('SPLATS!', o.x, 2.4, o.z, '#8dff6a', 1.1); audio.sfx('pop', { vol: 0.5 }); }
      else { stats.chickens++; fx.texts.add('BOK BOK!', o.x, 2.6, o.z, '#fff', 1.2); audio.sfx('boing', { vol: 0.5 }); audio.sfx('pop', { vol: 0.4 }); if (!byStone) { const t = pick(['range', 'bomb', 'speed', 'shield', 'mega', 'bomb', 'range']); spawnItem(o.c, o.r, t, 0.9); } }
    }
    function spawnSlimes() {
      const far = (j) => pl.every((p) => Math.hypot(p.x - cx(j % COLS), p.z - cz((j / COLS) | 0)) > 7);
      const free = []; for (let i = 0; i < N; i++) if (g[i] === 0 && mir(i) > i && walkable(i % COLS, (i / COLS) | 0) && far(i) && far(mir(i))) free.push(i);
      if (!free.length) return; const i = pick(free);
      const spots = [i, mir(i)];
      if (NP === 3) { const ax = []; for (let r = 0; r < ROWS; r++) { const j = idx(6, r); if (g[j] === 0 && walkable(6, r) && far(j)) ax.push(j); } if (ax.length) spots.push(pick(ax)); }   // 3 spelers: ook een slijmerd op de middenlijn
      for (const j of spots) { const c = j % COLS, r = (j / COLS) | 0; const a = new Slime(0x58d86b, 1.3); scene.add(a.group); a.group.position.set(cx(c), 0, cz(r)); slimes.push({ a, x: cx(c), z: cz(r), c, r, tc: c, tr: r, wait: 0.3, moving: false, dead: false, prog: 0, sx: 0, sz: 0, hit: new Array(NP).fill(0) }); fx.particles.burst(cx(c), 0.5, cz(r), { count: 14, speed: 3, up: 1.3, life: 0.6, size: 0.4, colors: [0x58d86b, 0xb8ffa0], gravity: 4 }); }
      fx.texts.add('SLIJMERDS!', cx(6), 3, cz(5), '#8dff6a', 1.4); audio.sfx('splash', { vol: 0.4 }); hud.toast('🟢 Er kruipen slijmerds uit de put! Niet aanraken!', 2000);
    }

    // ---------------- draak ----------------
    function updateDragon(dt) {
      D.t -= dt;
      if (D.state === 'idle' && D.t <= 0 && !G.ending) {
        // doelwit: de sterkste speler (Robin Hood), anders een willekeurige vrije cel
        const free = []; for (let i = 0; i < N; i++) if (g[i] === 0 && bombAt[i] < 0) free.push(i);
        if (!free.length) { D.t = 4; return; }
        let aim = null;
        if (NP === 2) aim = power(pl[0]) === power(pl[1]) || !pl[0].alive || !pl[1].alive ? null : (power(pl[0]) > power(pl[1]) ? pl[0] : pl[1]);
        else { const al = pl.filter((q) => q.alive); if (al.length >= 2) { const mp = Math.max(...al.map(power)), top = al.filter((q) => power(q) === mp); if (top.length === 1) aim = top[0]; } }   // 3 spelers: de sterkste van de levenden
        let best = pick(free); if (aim) { let bd = 1e9; for (const i of free) { const d = Math.hypot(cx(i % COLS) - aim.x, cz(((i / COLS) | 0)) - aim.z) + rnd() * 3; if (d < bd) { bd = d; best = i; } } }
        D.tc = best % COLS; D.tr = (best / COLS) | 0; D.state = 'warn'; D.ft = 0; D.dir = rnd() < 0.5 ? -1 : 1; D.dropped = false; D.vx = 20;
        dMark.visible = true; dMark.position.set(cx(D.tc), 0.07, cz(D.tr)); dragon.group.visible = true; stats.dragons++;
        hud.toast('🐉 De draak komt! Hij dropt een bom op de rode ring!', 2000); audio.sfx('creak', { vol: 0.3 });
      } else if (D.state === 'warn') {
        D.ft += dt; const arrive = 1.5;
        dragon.group.position.set(cx(D.tc) - D.dir * D.vx * (arrive - D.ft), 8 + Math.sin(D.ft * 3) * 0.4, cz(D.tr)); dragon.group.rotation.y = D.dir > 0 ? Math.PI / 2 : -Math.PI / 2; dragon.update(dt);
        dMark.material.opacity = 0.5 + Math.abs(Math.sin(D.ft * 12)) * 0.5; dMark.scale.setScalar(1 + (D.ft / arrive) * 0.0 + Math.sin(D.ft * 12) * 0.08);
        if (!D.dropped && D.ft >= arrive) {
          D.dropped = true; let c = D.tc, r = D.tr;
          if (g[idx(c, r)] !== 0 || bombAt[idx(c, r)] >= 0) { // bezet? zoek een buurcel
            const o = DIRS.map(([dx, dz]) => [c + dx, r + dz]).find(([cc, rr]) => inb(cc, rr) && g[idx(cc, rr)] === 0 && bombAt[idx(cc, rr)] < 0); if (o) [c, r] = o; else { D.state = 'idle'; D.t = 5; dragon.group.visible = false; dMark.visible = false; return; }
          }
          spawnBomb(c, r, -1, { range: 4, fuse: 1.9, fall: 8, mega: true }); audio.sfx('whoosh', { vol: 0.5 }); fx.texts.add('BOEM-DROP!', cx(c), 4, cz(r), '#ff7a4a', 1.4);
        }
        if (D.ft > arrive + 1.4) { D.state = 'idle'; D.t = rand(11, 15); dragon.group.visible = false; dMark.visible = false; }
        if (D.dropped) dMark.visible = false;
      }
    }

    // ---------------- sudden death ----------------
    function updateStones(dt) {
      if (!G.sudden && G.roundT >= (G.final ? SUDDEN_T_FINAL : SUDDEN_T)) { G.sudden = true; hud.setTimer(null); hud.toast('⚠️ DOODGEWOON! Stenen vallen van het plafond!', 2400); audio.sfx('creak', { vol: 0.5 }); ctx.shake(0.4); }
      if (G.sudden && !G.ending && stoneQi < stoneQ.length) {
        stoneT -= dt;
        if (stoneT <= 0) { stoneT = NP === 3 ? Math.max(0.16, 0.6 - stoneQi * 0.014) : Math.max(0.12, 0.42 - stoneQi * 0.006); stoneBack.push(...stoneQ[stoneQi]); stoneQi++; }
      }
      while (G.sudden && !G.ending && stoneBack.length) { const f = fall.find((q) => !q.on); if (!f) break; f.on = true; f.i = stoneBack.shift(); f.t = 0; f.y = 16; f.vy = 0; f.m.visible = false; }
      let wk = 0;
      for (const f of fall) {
        if (!f.on) continue; f.t += dt; const c = f.i % COLS, r = (f.i / COLS) | 0;
        const wt = 0.75;
        if (f.t < wt) { if (wk < 24) { _pp.set(cx(c), 0.06, cz(r)); const s = 0.8 + Math.abs(Math.sin(f.t * 14)) * 0.2 + f.t * 0.3; _ss.set(s, s, 1); _mm.compose(_pp, _qx, _ss); W.warn.setMatrixAt(wk++, _mm); } continue; }
        f.m.visible = true; f.vy += 55 * Math.max(0.5, GRAV) * dt; f.y -= f.vy * dt; f.m.position.set(cx(c), Math.max(0.85, f.y), cz(r));
        if (f.y <= 0.85) { f.on = false; f.m.visible = false; landStone(f.i); }
        else { if (wk < 24) { _pp.set(cx(c), 0.06, cz(r)); _ss.set(1.2, 1.2, 1); _mm.compose(_pp, _qx, _ss); W.warn.setMatrixAt(wk++, _mm); } }
      }
      for (let k = wk; k < 24; k++) { _pp.set(0, -50, 0); _ss.set(0, 0, 0); _mm.compose(_pp, _qx, _ss); W.warn.setMatrixAt(k, _mm); }
      W.warn.instanceMatrix.needsUpdate = true;
    }
    function landStone(i) {
      const c = i % COLS, r = (i / COLS) | 0;
      if (g[i] === 1) return;
      if (g[i] === 2 || g[i] === 3) destroyCrate(i, true);
      g[i] = 4; setI(W.stones, i, cx(c), 0.85, cz(r)); W.stones.instanceMatrix.needsUpdate = true; hid[i] = null; flameT[i] = 0;
      if (bombAt[i] >= 0) { const b = bombs[bombAt[i]]; explode(b); }
      for (const it of items) if (it.on && it.c === c && it.r === r) { it.on = false; it.s.visible = false; it.sh.visible = false; }
      for (const p of pl) if (p.alive && toC(p.x) === c && toR(p.z) === r) { stats.crush++; hurt(p, true); }
      audio.sfx('thud', { vol: 0.6 }); ctx.shake(0.3); fx.particles.burst(cx(c), 1, cz(r), { count: 16, speed: 5, up: 1.2, life: 0.7, size: 0.5, colors: [0x8a7a9a, 0x6a5a7a, 0xb8a8c8], gravity: 9 });
    }

    // ---------------- hoofdlus ----------------
    function updateSim(dt, canAct) {
      G.tick++;
      // spelers
      for (const p of pl) { if (p.alive) movePlayer(p, dt, canAct); }
      // bommen
      for (const b of bombs) {
        if (!b.on) continue;
        if (b.fy > 0) { b.fvy += 40 * GRAV * dt; b.fy = Math.max(0, b.fy - b.fvy * dt); if (b.fy <= 0) { audio.sfx('thud', { vol: 0.4 }); fx.particles.dust(b.x, 0.1, b.z, 6); } }
        if (b.slide) stepSlide(b, dt);
        b.t -= dt; if (flameT[idx(b.c, b.r)] > 0 && b.t > 0.07) b.t = 0.07;
        if (b.t <= 0) explode(b);
      }
      // vlammen
      for (let i = 0; i < N; i++) if (flameT[i] > 0) flameT[i] -= dt;
      for (const p of pl) if (p.alive && canAct !== null) { const c = toC(p.x), r = toR(p.z); if (inb(c, r) && flameT[idx(c, r)] > 0) hurt(p); }
      // items
      for (const it of items) {
        if (!it.on) continue; it.t += dt; it.imm -= dt;
        const i = idx(it.c, it.r); if (it.imm <= 0 && flameT[i] > 0) { it.on = false; it.s.visible = false; it.sh.visible = false; fx.particles.burst(cx(it.c), 0.8, cz(it.r), { count: 10, speed: 3, up: 1, life: 0.5, size: 0.4, colors: [0x555555, 0xff7a1a], gravity: 1 }); continue; }
        for (const p of pl) if (p.alive && canAct && toC(p.x) === it.c && toR(p.z) === it.r) { applyItem(p, it.type); it.on = false; it.s.visible = false; it.sh.visible = false; break; }
      }
      // dieren
      for (const a of chickens) updateCreature(a, dt, 1.5, false);
      for (const s of slimes) { updateCreature(s, dt, 1.1, true); if (!s.dead) for (const p of pl) { s.hit[p.i] -= dt; if (p.alive && s.hit[p.i] <= 0 && Math.hypot(p.x - s.x, p.z - s.z) < 1.15) { s.hit[p.i] = 1.5; p.slow = 2.0; fx.texts.add('PLAK!', p.x, 3.3, p.z, '#8dff6a', 1.2); audio.sfx('splash', { vol: 0.3 }); fx.particles.burst(p.x, 0.5, p.z, { count: 12, speed: 3, up: 1, life: 0.6, size: 0.4, colors: [0x58d86b, 0xb8ffa0], gravity: 4 }); } } }
      updateDragon(dt);
      updateStones(dt);
      for (const p of pl) if (p.alive) { collide(p); collide(p); }     // net geland / net verschenen vaste dingen: eruit duwen
    }

    function update(dtRaw) {
      if (finished) return;
      G.t += dtRaw; T += dtRaw;
      let dt = dtRaw * G.slow;
      if (G.state === 'intro') {
        pl.forEach((p) => { p.c.pose = 'carry'; });
        if (G.t >= 1.5) { G.state = 'play'; G.t = 0; hud.showBig('BOEM!', 600, '#ff9a3a'); audio.sfx('go', { vol: 0.5 }); }
      } else if (G.state === 'play' || G.state === 'ending') {
        G.roundT += dt;
        if (!G.sudden) hud.setTimer(Math.max(0, (G.final ? SUDDEN_T_FINAL : SUDDEN_T) - G.roundT), 5);
        if (G.ending) {
          G.slowT += dtRaw; G.slow = G.slowT < 0.5 ? 0.35 : 1;
          const alive = pl.filter((p) => p.alive);
          if (!alive.length) endRound(null);
          else if (G.slowT > 0.8) endRound(alive[0].i);
        }
      }
      if (G.state === 'play' || G.state === 'ending') updateSim(dt, true);
      else if (G.state === 'roundEnd' || G.state === 'chicken' || G.state === 'end') {
        updateSim(dt, false);
        if (G.state === 'roundEnd' && G.t > 2.3) nextStep();
        else if (G.state === 'chicken') chickenScene(dtRaw);
        else if (G.state === 'end' && G.t > 1.2 && !finished) finishMatch(G.winner);
      }
      // gedeelde zaken
      visuals(dt, dtRaw);
    }

    function endRound(w) {
      G.state = 'roundEnd'; G.t = 0; G.slow = 1; G.ending = false; hud.setTimer(null);
      if (w == null) { for (const i of G.endSet.length ? G.endSet : pl.map((p) => p.i)) G.wins[i]++; hud.showBig('ALLEMAAL BOEM!', 1800, '#ffd23f'); }
      else { G.wins[w]++; hud.showBig(`${names[w]} wint ronde ${G.round}!`, 1800, PCSS[w]); pl[w].c.pose = 'cheer'; pl[w].c.jump(); audio.sfx('win', { vol: 0.5 }); W.cheer(3); }
      G.lastRoundWinner = w; refreshHud(); audio.sfx('bell', { vol: 0.5 });
    }
    function nextStep() {
      const mx = Math.max(...G.wins), lead = pl.filter((p) => G.wins[p.i] === mx).map((p) => p.i);
      const over = (mx >= NEED_WINS && lead.length === 1) || G.round >= MAX_ROUNDS;
      if (!over) { startRound(G.round + 1); return; }
      if (lead.length === 1) { G.state = 'end'; G.t = 0; G.winner = lead[0]; celebrate(G.winner); return; }
      // gelijkspel (2 of 3 gelijke leiders): Kip Kiki beslist
      G.state = 'chicken'; G.t = 0; G.chickW = lead[(rnd() * lead.length) | 0]; bigChicken.group.visible = true; bigChicken.group.position.set(cx(6), 0, cz(5)); hud.showBig('KIP KIKI KIEST!', 1600, '#fff'); audio.sfx('boing', { vol: 0.6 });
    }
    function chickenScene(dt) {
      const p = pl[G.chickW]; const k = Math.min(1, G.t / 1.8); const tx = p.x, tz = p.z;
      bigChicken.group.position.set(lerp(cx(6), tx - (p.x > 0 ? 1.5 : -1.5), k), Math.abs(Math.sin(G.t * 9)) * 0.5, lerp(cz(5), tz, k)); bigChicken.targetYaw = Math.atan2(tx - bigChicken.group.position.x, tz - bigChicken.group.position.z); bigChicken.speed = 0.9; bigChicken.update(dt);
      if (rnd() < dt * 20) fx.particles.emit(bigChicken.group.position.x, 0.3, bigChicken.group.position.z, rand(-1, 1), 1, rand(-1, 1), { life: 0.5, size: 0.4, color: 0xffffff, gravity: 3 });
      if (G.t > 2.4) { G.state = 'end'; G.t = 0; G.winner = G.chickW; G.byChicken = true; bigChicken.group.visible = false; fx.texts.add('GOUDEN EI!', p.x, 3.8, p.z, '#ffd23f', 1.6); celebrate(G.winner); }
    }
    function celebrate(w) {
      pl.forEach((p) => { p.c.pose = p.i === w ? 'cheer' : 'sad'; }); W.cheer(6); audio.sfx('win', { vol: 0.6 });
      hud.showBig(`${names[w]} WINT!`, 1600, PCSS[w]);
      fx.particles.burst(pl[w].x, 2, pl[w].z, { count: 60, speed: 8, up: 1.3, life: 1.3, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
    }
    function finishMatch(w) {
      if (finished) return; finished = true;
      const lw = w == null ? 0 : pl.filter((p) => p.i !== w).sort((p, q) => G.wins[p.i] - G.wins[q.i])[0].i;   // de grootste verliezer (minste rondes)
      const L2 = w == null ? '' : names[w], V = w == null ? '' : names[lw];
      const jokes = [`${L2} is de Boem-Koning! ${V} ruikt nog naar rook.`, `${V} liep recht in de explosie. ${L2} deed niets verkeerd.`, `${L2} bombardeert de concurrentie weg. De goblins joelen!`, `${V} heeft nog steeds kruit in de oren.`];
      const bits = [`${stats.crates} kratten gesloopt`];
      if (stats.chickens) bits.push(stats.chickens === 1 ? '1 kip de lucht in gestuurd' : `${stats.chickens} kippen de lucht in gestuurd`);
      if (stats.kicks) bits.push(stats.kicks === 1 ? '1 bom weggeschopt' : `${stats.kicks} bommen weggeschopt`);
      const tail = `${G.byChicken ? ' Kip Kiki besliste het gelijkspel met een gouden ei.' : ''} Samen ${bits.join(', ')}.`;
      ctx.finishPvp({ winner: w, score: G.wins.slice(), delay: 600, summary: pick(jokes) + tail });
    }

    // ---------------- beeld ----------------
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(); let camShiftX = 0;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * asp;
      const dist = clamp(Math.max(16.2 / tanH, 11.6 / tanV) * 1.08, 22, 60);
      G.camPunch = Math.max(0, G.camPunch - dt * 1.5);
      const mid = pl.every((p) => p.alive) ? pl.reduce((a, p) => a + p.x, 0) / NP : 0; camShiftX = damp(camShiftX, mid * 0.05, 2, dt);
      const el = 1.12, d = dist * (1 - G.camPunch * 0.03); const sway = 0;
      camP.set(camShiftX + sway, Math.sin(el) * d, 2.4 + Math.cos(el) * d); camL.set(camShiftX * 0.6, 0, -0.9);
      camera.position.copy(camP); camera.lookAt(camL);
    }
    function visuals(dt, dtRaw) {
      const tt = T + introT;
      // vlammen
      for (let i = 0; i < N; i++) {
        const c = i % COLS, r = (i / COLS) | 0, f = flameT[i];
        if (f > 0) { const u = f / FLAME_T, grow = smoothstep(0, 0.12, FLAME_T - f) * (u < 0.3 ? u / 0.3 : 1); const pul = 1 + Math.sin(tt * 40 + i) * 0.08; setI(W.flameO, i, cx(c), 1.05 * grow, cz(r), 0.95 * grow * pul, (0.9 + Math.sin(tt * 31 + i * 1.7) * 0.15) * grow, 0.95 * grow * pul, tt * 3 + i); setI(W.flameI, i, cx(c), 0.8 * grow, cz(r), 0.6 * grow, (0.85 + Math.sin(tt * 27 + i) * 0.15) * grow, 0.6 * grow, -tt * 4); }
        else if (flameT[i] > -1) { setI(W.flameO, i, 0, -50, 0, 0); setI(W.flameI, i, 0, -50, 0, 0); flameT[i] = -9; }
      }
      W.flameO.instanceMatrix.needsUpdate = true; W.flameI.instanceMatrix.needsUpdate = true;
      // bommen
      bombs.forEach((b, k) => {
        const sh = shadows[k]; if (!b.on) { sh.visible = false; return; }
        const fr = clamp(b.t / FUSE_T, 0, 1), rate = 6 + (1 - fr) * 26, wob = Math.sin(tt * rate + b.wob);
        const pulse = 1 + wob * 0.07 * (1 + (1 - fr) * 1.5);
        b.grp.position.set(b.x, b.fy + Math.abs(wob) * 0.05, b.z); b.grp.scale.set(pulse, 2 - pulse, pulse);
        b.bm.emissiveIntensity = b.t < 0.9 ? (Math.sin(tt * 30) > 0 ? 0.9 : 0.1) : 0;
        b.spark.visible = true; b.spark.scale.setScalar(0.7 + Math.sin(tt * 30 + k) * 0.25);
        sh.visible = true; sh.position.set(b.x, 0.04, b.z); sh.scale.setScalar(1 - Math.min(0.5, b.fy * 0.08)); if (rnd() < dtRaw * 24) fx.particles.emit(b.x + 0.1, 2.0 + b.fy, b.z, rand(-0.5, 0.5), 1.4, rand(-0.5, 0.5), { life: 0.35, size: 0.28, color: rnd() < 0.5 ? 0xffd23f : 0xff6a1a, gravity: -1 });
      });
      // items
      for (const it of items) { if (!it.on) continue; const bob = 1.5 + Math.sin(it.t * 4 + it.c) * 0.2, k = smoothstep(0, 0.25, it.t); it.s.position.set(cx(it.c), bob, cz(it.r)); it.s.scale.setScalar(1.45 * k * (1 + Math.sin(it.t * 6) * 0.05)); it.sh.position.set(cx(it.c), 0.04, cz(it.r)); it.sh.scale.setScalar(0.8); }
      // spelers
      for (const p of pl) {
        const c = p.c, gp = c.group;
        if (p.alive) {
          const sp = Math.hypot(p.vx, p.vz);
          if (GRAV < 1) { p.hopT += dtRaw * (2.5 + sp * 0.5); p.y = (Math.abs(Math.sin(p.hopT)) * 1.1 + 0.05) * (0.4 + Math.min(1, sp / 3)); c.air = p.y > 0.4; } else { p.y = 0; c.air = false; }
          c.speed = clamp(sp / BASE_SPEED, 0, 1); if (sp > 0.6) c.faceDir(p.vx, p.vz); else if (G.state !== 'roundEnd' && G.state !== 'end') c.faceDir(p.fx, p.fz);
          if (G.state === 'play' || G.state === 'ending') c.pose = p.stun > 0 ? 'scared' : 'carry';
          gp.position.set(p.x, p.y, p.z); gp.rotation.x = 0; gp.rotation.z = 0;
          gp.visible = p.inv <= 0 || Math.sin(tt * 40) > 0;
          if (p.slow > 0 && rnd() < dtRaw * 12) fx.particles.emit(p.x + rand(-0.4, 0.4), 0.2, p.z + rand(-0.4, 0.4), 0, 0.6, 0, { life: 0.5, size: 0.3, color: 0x58d86b, gravity: -1 });
        } else {
          p.deadT += dtRaw; if (p.y > 0 || p.dvy > 0) { p.dvy -= 24 * Math.max(0.5, GRAV) * dtRaw; p.y += p.dvy * dtRaw; if (p.y <= 0) { p.y = 0; p.dvy = 0; p.spin = 0; gp.rotation.x = 0; gp.rotation.z = 0; c.pose = 'sad'; audio.sfx('thud', { vol: 0.3 }); } }
          gp.position.set(p.x, p.y, p.z); gp.rotation.x += p.spin * dtRaw * 0.8; gp.rotation.z += p.spin * dtRaw * 0.4; gp.visible = true; c.speed = 0;
          if (p.deadT > 0.4 && p.y === 0 && rnd() < dtRaw * 6) fx.particles.emit(p.x + rand(-0.4, 0.4), 2.4, p.z + rand(-0.4, 0.4), 0, 0.8, 0, { life: 0.8, size: 0.3, color: 0xffe14a, gravity: 0 });
        }
        c.update(dtRaw);
        p.ring.position.set(p.x, 0.05, p.z); p.ring.scale.setScalar(p.r * 1.35 * (1 + Math.sin(tt * 6 + p.i) * 0.04)); p.ring.visible = p.alive; p.ring.material.opacity = 0.55 + p.bombsOut * 0.1;
        p.shadow.position.set(p.x, 0.03, p.z); p.shadow.scale.setScalar(0.9 * p.sz * (p.alive ? 1 - p.y * 0.1 : 1));
        p.tag.position.set(p.x, 2.3 * p.sz + 0.7 + p.y, p.z + 0.2); p.tag.visible = p.alive || p.deadT < 1.2; p.tag.scale.set(2.3, 0.86, 1);
        p.bubble.visible = p.shield && p.alive; if (p.bubble.visible) { p.bubble.position.set(p.x, 1.0 * p.sz + p.y, p.z); p.bubble.scale.setScalar(1.25 * p.sz + Math.sin(tt * 8) * 0.04); }
        const txt = infoText(p); if (txt !== p.lastTxt) { p.lastTxt = txt; hud.setPlayerInfo(p.i, txt); }
      }
      // dieren
      for (const a of chickens) if (!a.dead) { a.a.group.position.set(a.x, 0, a.z); a.a.update(dtRaw); }
      for (const s of slimes) if (!s.dead) { s.a.group.position.set(s.x, 0, s.z); s.a.update(dtRaw, s.moving ? 2 : 0.8); }
      if (G.state === 'play' && !G.sudden && G.roundT > SUDDEN_T - 3 && !G.hintOn) { G.hintOn = true; hud.toast('⏰ Nog even... dan vallen er stenen!', 1500); }
      // krat-schommel: goud glimt
      if (W.gold.visible) { W.gold.rotation.y = Math.sin(tt * 2) * 0.1; W.gold.position.y = 0.9 + Math.sin(tt * 3) * 0.05; }
      W.update(dtRaw);
      updateCamera(dtRaw);
    }
    function introUpdate(dt) { introT += dt; pl.forEach((p) => { p.c.pose = p.i ? 'wave' : 'wave'; p.c.faceDir(0, 1); }); for (const p of pl) { p.c.update(dt); } W.update(dt); for (const a of chickens) { a.a.update(dt); } updateCamera(dt); }
    function resultUpdate(dt) { T += dt; for (const p of pl) p.c.update(dt); W.update(dt); for (const a of chickens) if (!a.dead) a.a.update(dt); updateCamera(dt); }

    startRound(1);
    G.state = 'intro0'; // wacht op GA
    visuals(0.016, 0.016);
    let started = false;

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } if (!started) { started = true; G.state = 'play'; G.t = 0; } update(dt); },
      onStart() { if (!started) { started = true; G.state = 'play'; G.t = 0; } },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(p.x, 1, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => {
          if (!m) return; const p = pl[i]; if (!p.alive) return;
          p.bombsMax = Math.max(1, p.bombsMax - 1); p.range = Math.max(2, p.range - 1);
          const c = toC(p.x), r = toR(p.z); if (g[idx(c, r)] === 0 && bombAt[idx(c, r)] < 0) spawnBomb(c, r, -1, { range: 2, fuse: 1.6, ghost: true });
          fx.texts.add('SPOOKBOM!', p.x, 3.6, p.z, '#d9a8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4);
        });
      },
      celebrate(w) { pl.forEach((p) => { p.c.pose = p.i === w ? 'cheer' : 'sad'; }); W.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, round: G.round, roundT: G.roundT, sudden: G.sudden, wins: [...G.wins], finished, winner: G.winner, byChicken: !!G.byChicken, stats: { ...stats }, ending: G.ending, grid: Array.from(g), flame: Array.from(flameT, (v) => (v > 0 ? v : 0)),
          bombs: bombs.filter((b) => b.on).map((b) => ({ c: b.c, r: b.r, t: b.t, range: b.range, owner: b.owner, slide: !!b.slide, fy: b.fy })), warn: fall.filter((f) => f.on).map((f) => ({ i: f.i, t: f.t })),
          items: items.filter((q) => q.on).map((q) => ({ c: q.c, r: q.r, type: q.type })), chickens: chickens.filter((a) => !a.dead).map((a) => ({ c: a.c, r: a.r })), slimes: slimes.filter((a) => !a.dead).map((a) => ({ c: a.c, r: a.r })), dragon: D.state,
          players: pl.map((p) => ({ x: p.x, z: p.z, c: toC(p.x), r: toR(p.z), alive: p.alive, bombsMax: p.bombsMax, bombsOut: p.bombsOut, range: p.range, speedLv: p.speedLv, shield: p.shield, mega: p.mega, fx: p.fx, fz: p.fz, kickCd: p.kickCd, rad: p.r, slow: p.slow, stun: p.stun })) }),
        kill: (i) => { hurt(pl[i], true); },
        pl, bombs, g, flameT, bombAt, spawnBomb, explode, placeBomb, kick, spawnSlimes, spawnItem, startRound, G,
        skipIntro: () => { started = true; G.state = 'play'; },
        forceDragon: () => { D.t = 0; },
        setRoundT: (t) => { G.roundT = t; },
        giveAll: (i) => { const p = pl[i]; p.bombsMax = 5; p.range = 8; p.speedLv = 4; p.shield = true; p.mega = true; },
      },
    };
  },
};

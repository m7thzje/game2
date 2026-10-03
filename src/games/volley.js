import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_COLORS, Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { buildBeach, VW } from './volley_world.js';

// Slijm-Volleybal — duel: zijaanzicht, twee slijmblobs aan weerszijden van een netpaal op een kermis-strand. Eerste tot 11 punten of 90 s.
//  * lopen + springen (omhoog), A = SLAG (timing + hoogte bepalen smash / set / redding), B = DUIKSLAG (lage ballen omhoog tillen)
//  * regels: max 3 slagen per kant, de bal mag de grond niet raken; wie scoort serveert
//  * chaos: gouden bal (extra punt), bom-bal (hete aardappel), wind, kip die over het veld rent, spiegel-wissel van kant
//  * comeback: wie 3+ punten achter staat krijgt een bredere, snellere slag (slijmkracht); laatste 15 s tellen dubbel

const { W, NH, NR } = VW;
const RB = 0.62;                     // straal van de bal
const R0 = 1.55;                     // straal van de blob
const GB = 17, GP = 36;              // zwaartekracht bal / blob
const JUMP = 13.2, MOVE = 9.5, DIVE_V = 15.5;
const WIN = 11, MATCH_TIME = 90, SERVE_WAIT = 1.1;
const BALL_MAX = 27, CEIL = 12.8;
const SLAP_T = 0.24, SLAP_X = 0.5;

function ballTex() {
  return canvasTex(256, 128, (g, w, h) => {
    const cols = ['#ff4f7a', '#ffffff', '#4fb8ff', '#ffffff', '#ffd23f', '#ffffff', '#7dff8a', '#ffffff'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cols[i]; g.fillRect(i * w / 8, 0, w / 8 + 1, h); }
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 8; i++) g.fillRect(i * w / 8, 0, 3, h);
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function labelTex(text, css) {
  return canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 58px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(10,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(text, w / 2, hh / 2); c.fillStyle = css; c.fillText(text, w / 2, hh / 2); });
}

export default {
  id: 'volley',
  name: 'Slijm-Volleybal',
  giver: 'Strandmeester Sjaak',
  icon: '🏐',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Volleybal met <b>slijmblobs</b> op een kermis-strand! Laat de bal op de grond van je broer vallen: eerste tot <b>11</b>, max <b>3 slagen</b> per kant. Pas op voor de <b>bom-bal</b>, de <b>kip</b>, de <b>wind</b> en de <b>spiegel</b>!',
  controls: ['{move} lopen, omhoog = springen', '{a} SLAG (smash of lob)', '{b} DUIKSLAG (redding)'],
  tip: 'Spring en sla vlak voor de bal je kop raakt = SMASH! Wie 3 punten achterstaat krijgt een bredere slag.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const tw = ctx.twist.id;
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = ctx.twist.speed && (tw === 'turbo' || tw === 'slowmo') ? ctx.twist.speed : 1;
    const PHYS_T = 1 + (TEMPO - 1) * 0.45;
    const GBALL = GB * lerp(1, GRAV, 0.6), GBLOB = GP * GRAV;
    const colorsCss = ['rgba(60,200,120,1)', 'rgba(70,140,255,1)'];

    const L = ctx.lights('dusk', { shadow: 16, center: [0, 3, 0], fog: false });
    camera.fov = 45; camera.updateProjectionMatrix();
    const B = buildBeach(ctx, L, colorsCss);

    // ---------------- bal ----------------
    const ballG = new THREE.Group(); scene.add(ballG);
    const bT = ballTex();
    const mNormal = new THREE.MeshStandardMaterial({ map: bT, roughness: 0.35 });
    const mGold = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.2, metalness: 0.85, emissive: 0xff9a10, emissiveIntensity: 0.45 });
    const mBomb = new THREE.MeshStandardMaterial({ color: 0x25252e, roughness: 0.45, metalness: 0.3, emissive: 0xff2200, emissiveIntensity: 0 });
    const ballM = mesh(new THREE.SphereGeometry(RB, 20, 14), mNormal, { cast: true });
    ballG.add(ballM);
    const fuse = new THREE.Group(); fuse.position.set(0, RB * 0.95, 0); ballG.add(fuse);
    fuse.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 5), mat(0xd8b070), { cast: false, pos: [0, 0.12, 0] }));
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spark.scale.set(0.9, 0.9, 1); spark.position.y = 0.3; fuse.add(spark);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd23f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); halo.scale.set(3.2, 3.2, 1); ballG.add(halo);
    const bShadow = P.shadowBlob(RB * 1.5); scene.add(bShadow);
    const ball = { x: 0, y: 7, vx: 0, vy: 0, spin: 0, rot: 0, kind: 'normal', fuse: 0, fuse0: 8, held: true, last: -1, hitT: 9 };

    // ---------------- blobs ----------------
    const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff }), eyeB = new THREE.MeshBasicMaterial({ color: 0x14142a });
    const pipOn = new THREE.MeshBasicMaterial({ color: 0xffe14a }), pipOff = new THREE.MeshBasicMaterial({ color: 0x3a3a5a, transparent: true, opacity: 0.55 }), pipHot = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
    const pl = players.map((pp, i) => {
      const colr = PLAYER_COLORS[i];
      const g = new THREE.Group(); scene.add(g);
      const bodyM = new THREE.MeshStandardMaterial({ color: colr, roughness: 0.18, metalness: 0, emissive: colr, emissiveIntensity: 0.18, flatShading: false });
      const body = mesh(new THREE.SphereGeometry(1, 24, 14, 0, TAU, 0, Math.PI / 2), bodyM, {}); g.add(body);
      g.add(mesh(new THREE.CircleGeometry(1, 20), bodyM, { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.001, 0] }));
      const gloss = mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), { cast: false, pos: [-0.32, 0.82, 0.38], scale: [1.6, 0.8, 0.7] }); g.add(gloss);
      const eyes = [-1, 1].map((sd) => { const e = new THREE.Group(); e.userData.sd = sd; e.position.set(sd * 0.27, 0.56, 0.78); e.add(mesh(new THREE.SphereGeometry(0.21, 10, 8), eyeW, { cast: false })); const pu = mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeB, { cast: false, pos: [0, 0, 0.17] }); e.add(pu); e.userData.pu = pu; g.add(e); return e; });
      const mouth = mesh(new THREE.TorusGeometry(0.14, 0.035, 5, 10, Math.PI), eyeB, { cast: false, pos: [0, 0.26, 0.93], rot: [0, 0, Math.PI] }); g.add(mouth);
      // haar (Wes: stekels, Jor: pet achterstevoren)
      if (i === 0) { for (let k = 0; k < 3; k++) g.add(mesh(new THREE.ConeGeometry(0.17, 0.55, 5), mat(0x7a4a24), { cast: false, pos: [(k - 1) * 0.3, 1.02, 0.0], rot: [0, 0, -(k - 1) * 0.35] })); g.add(mesh(new THREE.TorusGeometry(0.62, 0.07, 5, 18), mat(0xd8372c, { flatShading: false }), { cast: false, pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0] })); }
      else { g.add(mesh(new THREE.SphereGeometry(0.62, 12, 6, 0, TAU, 0, 1.2), mat(0xffc93c, { flatShading: false }), { cast: false, pos: [0, 0.54, -0.06] })); g.add(mesh(new THREE.BoxGeometry(0.7, 0.05, 0.4), mat(0xffc93c), { cast: false, pos: [0, 0.78, -0.62] })); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.16, 28, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(ring);
      const shadow = P.shadowBlob(1.3); scene.add(shadow);
      const pips = [0, 1, 2].map((k) => { const m = mesh(new THREE.SphereGeometry(0.16, 8, 6), pipOff, { cast: false }); scene.add(m); return m; });
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(pp.name, pp.css), transparent: true, depthTest: false })); tag.scale.set(2.3, 0.86, 1); tag.renderOrder = 15; scene.add(tag);
      const R = R0 * lerp(1, pv.size(i), 0.6);
      return { i, side: i ? 1 : -1, g, body, bodyM, eyes, mouth, ring, shadow, pips, tag, R0: R, R, Rc: R,
        x: (i ? 1 : -1) * 5.2, y: 0, vx: 0, vy: 0, grounded: true, state: 'idle', st: 0, slapUsed: false, slapQ: 0, slapCd: 0, diveCd: 0, diveDir: 1, stun: 0, frozen: 0, assist: false, sx: 1, sy: 1, lastHit: 9, face: i ? -1 : 1, jumpBuf: 0, mood: 'play', hits: 0, smashes: 0, digs: 0, tagTxt: '' };
    });
    pl.forEach((p) => { p.g.position.set(p.x, 0, 0); });

    // ---------------- toestand ----------------
    const score = [0, 0];
    let T = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0;
    const G = { state: 'init', t: 0, timeLeft: MATCH_TIME, timeUp: false, server: 0, cnt: [0, 0], lastSide: -1, end: false, winner: -1, camPunch: 0, rally: 0, rallyT: 0, mirrorNext: false, sinceSpecial: 0, golden: false, stall: 0, lastPointer: -1 };
    const stats = { smashes: [0, 0], digs: [0, 0], gold: 0, bombs: 0, chickens: 0, mirrors: 0, gusts: 0, faults: 0, longest: 0 };
    let wind = 0, windTarget = 0, gustT = rand(10, 16), gustLeft = 0, chickenT = rand(14, 22), eventDir = 1;
    const chick = { on: false, a: new Animal('chicken'), x: 0, dir: 1, t: 0, vy: 0, y: 0, flap: 0 };
    chick.a.group.scale.setScalar(2.1); chick.a.group.visible = false; scene.add(chick.a.group);
    const lead = (i) => score[1 - i] - score[i];
    const sidx = (p) => (p.side < 0 ? 0 : 1);
    const late = () => !G.golden && G.timeLeft <= 15 && G.timeLeft > 0;

    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${G.golden ? '  (GOUDEN PUNT)' : ''}`);
      B.scoreboard(names, score, G.timeLeft, G.golden ? 'GOUDEN PUNT' : null);
    }
    function refreshInfo(p) {
      const sl = p.slapCd > 0 ? `slag ${p.slapCd.toFixed(1)}s` : 'slag klaar'; const dv = p.diveCd > 0 ? `duik ${p.diveCd.toFixed(1)}s` : 'duik klaar';
      const txt = p.frozen > 0 ? 'Verstijfd!' : p.stun > 0 ? 'Kip-schrik!' : `${sl} · ${dv}${p.assist ? ' · SLIJMKRACHT' : ''}`;
      if (txt !== p.tagTxt) { p.tagTxt = txt; hud.setPlayerInfo(p.i, `${score[p.i]} punten · ${txt}`); }
    }

    // ---------------- punten / flow ----------------
    function setBallKind(k) {
      ball.kind = k; ballM.material = k === 'gold' ? mGold : k === 'bomb' ? mBomb : mNormal;
      fuse.visible = k === 'bomb'; halo.material.opacity = k === 'gold' ? 0.5 : 0; halo.material.color.set(k === 'gold' ? 0xffd23f : 0xff3a1a);
    }
    function startServe(server, first = false) {
      G.state = 'serve'; G.t = 0; G.server = server; G.cnt[0] = G.cnt[1] = 0; G.lastSide = -1; G.rally = 0; G.rallyT = 0; G.stall = 0; G.lastPointer = -1;
      // spiegel-wissel: kanten ruilen (alles gespiegeld, incl. de besturing-gevoel)
      if (G.mirrorNext && !first) { G.mirrorNext = false; doMirror(); }
      const sp = pl[server];
      ball.held = true; ball.x = sp.side * 5.4; ball.y = 7.4; ball.vx = ball.vy = 0; ball.spin = 0; ball.last = -1; ball.hitT = 9;
      // speciale ballen (niet te vaak; comeback: de achterstaander krijgt vaker een gouden bal)
      let kind = 'normal'; G.sinceSpecial++;
      const diff = Math.abs(score[0] - score[1]);
      if (!first && G.sinceSpecial >= 2 && T > 12) {
        const r = Math.random();
        if (r < (diff >= 2 ? 0.34 : 0.2)) kind = 'gold'; else if (r < (diff >= 2 ? 0.34 : 0.2) + (T > 22 ? 0.17 : 0)) kind = 'bomb';
        else if (T > 25 && Math.random() < 0.22 && stats.mirrors < 2) G.mirrorNext = true;
      }
      if (kind !== 'normal') G.sinceSpecial = 0;
      setBallKind(kind); ball.fuse = ball.fuse0 = kind === 'bomb' ? 7.5 : 0;
      if (kind === 'gold') { stats.gold++; hud.toast('🌟 GOUDEN BAL! Deze rally is 2 punten waard', 2200); fx.texts.add('GOUDEN BAL!', ball.x, 9.4, 0, '#ffd23f', 1.7); audio.sfx('powerup', { vol: 0.7 }); audio.sfx('sparkle', { vol: 0.6 }); }
      if (kind === 'bomb') { stats.bombs++; hud.toast('💣 BOM-BAL! Hij ontploft aan jouw kant als je hem te lang houdt', 2400); fx.texts.add('BOM-BAL!', ball.x, 9.4, 0, '#ff6a3a', 1.7); audio.sfx('buzz', { vol: 0.5 }); }
      refreshHud();
    }
    function doMirror() {
      stats.mirrors++;
      for (const p of pl) { p.side *= -1; p.x = -p.x; p.vx = -p.vx; p.face = -p.face; }
      wind = -wind; windTarget = -windTarget;
      hud.showBig('SPIEGEL! WISSEL VAN KANT', 1500, '#d9a8ff'); hud.toast('🪞 De spiegel draait het veld om!', 2200);
      audio.sfx('sparkle', { vol: 0.8 }); audio.sfx('whoosh', { vol: 0.5 }); audio.sfx('boing', { vol: 0.4, rate: 1.3 }); ctx.shake(0.4);
      for (const p of pl) fx.particles.burst(p.x, 1.2, 0, { count: 36, speed: 6, up: 1.4, life: 1.0, size: 0.4, colors: [0xffffff, 0xd9a8ff, 0x9fe8ff], gravity: 3 });
      fx.texts.add('SPIEGEL!', 0, 6.5, 1, '#d9a8ff', 2.0);
    }
    function pointsNow(kind) { return 1 + (ball.kind === 'gold' ? 1 : 0) + (late() ? 1 : 0) + (kind === 'bomb' ? 1 : 0); }
    function rallyEnd(winner, why, bombBoom = false) {
      if (G.state !== 'play') return;
      const pts = pointsNow(bombBoom ? 'bomb' : '');
      score[winner] += pts; G.state = 'point'; G.t = 0; G.winnerP = winner; slow = 0.3; slowHold = 0.55; G.camPunch = 1;
      stats.longest = Math.max(stats.longest, G.rally);
      G.end = score[winner] >= WIN || G.golden || (G.timeUp && score[0] !== score[1]);
      if (G.timeUp && !G.end) { G.golden = true; hud.toast('Gelijkspel! Het volgende punt wint', 2200); }
      refreshHud();
      const col = winner ? '#8fb8ff' : '#7dffb0';
      const wp = pl[winner], lp = pl[1 - winner];
      hud.showBig(G.end ? `${names[winner]} WINT!` : pts > 1 ? `+${pts} PUNTEN!` : `PUNT ${names[winner].toUpperCase()}!`, 1500, col);
      const spot = clamp(ball.x, -W + 1, W - 1);
      fx.texts.add(`+${pts}`, spot, 3.2, 0.5, col, 1.6 + pts * 0.2);
      if (why) hud.toast(why, 2000);
      audio.sfx('bell', { vol: 0.6 }); audio.sfx('win', { vol: 0.35 });
      if (!bombBoom) { audio.sfx('thud', { vol: 0.6 }); ctx.shake(0.35); }
      B.cheer(2.4); wp.mood = 'cheer'; lp.mood = 'sad';
      fx.particles.burst(wp.x, 1.5, 0.5, { count: 40, speed: 7, up: 1.3, life: 1.2, size: 0.45, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 5 });
      applyAssist();
    }
    function groundHit() {
      const lx = ball.x, side = lx < 0 ? 0 : 1;            // kant waar de bal landt
      const loser = pl.find((p) => sidx(p) === side); const winner = pl.find((p) => p !== loser);
      fx.particles.dust(ball.x, 0.1, 0, 10, 0xfff0c8); fx.particles.ring(ball.x, 0.15, 0, { count: 16, speed: 5, color: 0xfff0c8, size: 0.3, life: 0.5 });
      if (ball.kind === 'bomb') { explode(ball.x, ball.y); rallyEnd(winner.i, 'BOEM! De bom ontplofte op de grond', false); return; }
      rallyEnd(winner.i, null);
    }
    function fault(p, why) {
      stats.faults++; const w = pl.find((q) => q !== p);
      fx.texts.add('FOUT!', p.x, p.R * 2 + 2.5, 0.5, '#ff5a3a', 1.6); audio.sfx('buzz', { vol: 0.6 });
      rallyEnd(w.i, why);
    }
    function explode(x, y) {
      audio.sfx('explode', { vol: 0.9 }); ctx.shake(0.9);
      fx.particles.burst(x, y, 0.4, { count: 70, speed: 11, up: 0.8, life: 1.2, size: 0.7, colors: [0xff7a1a, 0xffd23f, 0xff3a0a, 0x555555], gravity: 3 });
      fx.particles.ring(x, y, 0.4, { count: 30, speed: 12, color: 0xffd23f, size: 0.5, life: 0.7 });
      fx.texts.add('BOEM!', x, y + 1.5, 0.5, '#ff7a3a', 2.2);
      for (const p of pl) { const d = Math.hypot(p.x - x, p.y + 1 - y); if (d < 6) { const k = (6 - d) / 6; p.vx += Math.sign(p.x - x || 1) * 12 * k; p.vy += 9 * k; p.stun = Math.max(p.stun, 0.5 * k + 0.2); } }
      ballG.visible = false; ball.held = true; ball.vx = ball.vy = 0;
    }
    function endMatch(winner) {
      G.state = 'end'; G.t = 0; G.winner = winner; slow = 1; hud.setTimer(null);
      if (winner != null) { pl[winner].mood = 'cheer'; pl[1 - winner].mood = 'sad'; B.cheer(5); }
    }
    function finishMatch(winner) {
      if (finished) return; finished = true;
      const w = winner, l = winner == null ? null : 1 - winner;
      const jokes = w == null ? ['Gelijkspel! Beide blobs rollen lachend over het zand.'] : [
        `${names[w]} sloeg ${names[l]} van het strand! Het publiek joelt.`, `${names[w]} is de nieuwe Slijmkoning van het strand. ${names[l]} zoekt de bal nog in zee.`,
        `${names[w]} smashte alles kapot. ${names[l]} zit nu onder het zand.`, `Wat een ballen! ${names[w]} wint, ${names[l]} balt zijn blob-vuistjes.`];
      const extra = [stats.gold ? `Er vloog ${stats.gold}x een gouden bal` : '', stats.bombs ? `${stats.bombs}x een bom-bal` : '', stats.chickens ? `en de kip rende ${stats.chickens}x langs` : ''].filter(Boolean).join(', ');
      ctx.finishPvp({ winner, score: [score[0], score[1]], delay: 800, summary: `${pick(jokes)}${G.tiebreak ? ' Bij precies gelijk besliste: wie het dichtst bij de bal stond.' : ''}${extra ? ` (${extra}.)` : ''}` });
    }
    function applyAssist() {
      for (const p of pl) {
        const want = lead(p.i) >= 3;
        if (want !== p.assist) {
          p.assist = want;
          if (want) { fx.texts.add('SLIJMKRACHT!', p.x, p.R * 2 + 2.6, 0.5, '#ffd23f', 1.5); hud.toast(`✨ ${names[p.i]} krijgt slijmkracht: een bredere slag!`, 2200); audio.sfx('powerup', { vol: 0.7 }); fx.particles.burst(p.x, 1, 0.3, { count: 30, speed: 5, up: 1.4, life: 0.9, size: 0.35, colors: [0xffd23f, 0xffffff], gravity: 3 }); }
        }
      }
    }

    // ---------------- natuurkunde ----------------
    function onTouch(p, kind, info = {}) {
      p.lastHit = 0; p.hits++; ball.last = p.i; ball.hitT = 0; G.stall = 0;
      if (G.state === 'play') {
        const si = sidx(p);
        if (G.lastSide !== si) { G.cnt[si] = 0; G.lastSide = si; G.cnt[1 - si] = 0; }
        G.cnt[si]++; G.rally++; audio.sfx('click', { vol: 0.15, rate: 1 + G.cnt[si] * 0.15 });
        if (G.cnt[si] > 3) { fault(p, `${names[p.i]} sloeg 4 keer! (max 3 slagen)`); }
      }
    }
    function bumpBall(p, n, vn) {
      // gewone aanraking: stuiter met kop/zij van de blob, snelheid wordt deels overgenomen
      const rvx = ball.vx - p.vx, rvy = ball.vy - p.vy;
      const tx = rvx - vn * n.x, ty = rvy - vn * n.y;
      const out = Math.max(10.5, -vn * 0.85);
      ball.vx = p.vx * 0.75 + tx * 0.7 + n.x * out; ball.vy = p.vy * 0.6 + ty * 0.7 + n.y * out;
      ball.spin = clamp(ball.spin * 0.5 - p.vx * 0.4 * n.y, -14, 14);
      const sp = Math.hypot(ball.vx, ball.vy); if (sp > BALL_MAX) { ball.vx *= BALL_MAX / sp; ball.vy *= BALL_MAX / sp; }
      const imp = clamp(-vn / 18, 0, 1);
      fx.particles.burst(ball.x - n.x * RB, ball.y - n.y * RB, 0.3, { count: 4 + Math.round(imp * 10), speed: 2 + imp * 4, up: 0.8, life: 0.45, size: 0.25, colors: [0xffffff, PLAYER_COLORS[p.i]], gravity: 6 });
      audio.sfx('boing', { vol: 0.25 + imp * 0.35, rate: 1.1 + imp * 0.5 }); p.sx = 1 + imp * 0.25; p.sy = 1 - imp * 0.3;
    }
    function slapBall(p, n) {
      const sdir = -p.side; const inp = pv.input(p.i);
      const fwd = clamp(inp.x * sdir, -1, 1), up = clamp(-inp.y, -1, 1);
      const sweet = p.st >= 0.02 && p.st <= 0.13 ? 1 : 0;
      const bonus = p.assist ? 1.07 : 1;
      let ang, pow, spin, label, col;
      const smash = p.y > 0.4 && ball.y > p.y + p.Rc * 0.7 && n.y > 0.25 && ball.y > 2.4;
      if (smash) { ang = -(30 - fwd * 13 + (fwd < 0 ? -fwd * 22 : 0)) * Math.PI / 180; pow = (23 + sweet * 4.5) * bonus; spin = -sdir * 16; label = sweet ? 'SMASH!' : 'smash'; col = sweet ? '#ff5a3a' : '#ffb24a'; p.smashes++; stats.smashes[p.i]++; }
      else if (ball.y < 1.5 + p.y) { ang = 74 * Math.PI / 180; pow = 15.5 * bonus; spin = sdir * 8; label = 'REDDING!'; col = '#8dff9a'; stats.digs[p.i]++; p.digs++; }
      else { ang = (42 + up * 20 - Math.max(0, fwd) * 4) * Math.PI / 180; pow = (18 + sweet * 2.2) * bonus; spin = sdir * 6; label = sweet ? 'SET!' : 'slag'; col = '#ffe14a'; }
      ball.vx = Math.cos(ang) * pow * sdir + p.vx * 0.25; ball.vy = Math.sin(ang) * pow + p.vy * 0.2; ball.spin = spin;
      const imp = smash ? 1 : 0.6;
      fx.particles.burst(ball.x, ball.y, 0.4, { count: 14 + (smash ? 24 : 6), speed: 6 + imp * 5, up: 0.8, life: 0.6, size: 0.4, colors: [0xffffff, 0xffe14a, 0xffa020], gravity: 6 });
      fx.particles.ring(ball.x, ball.y, 0.4, { count: 22, speed: 8, color: smash ? 0xff7a3a : 0xffe14a, size: 0.32, life: 0.4 });
      if (label !== 'slag') fx.texts.add(label, ball.x, ball.y + 1.4, 0.5, col, smash ? 1.6 : 1.1);
      audio.sfx('hit', { vol: 0.9 }); if (smash) { audio.sfx('explode', { vol: 0.2 + sweet * 0.15 }); audio.sfx('whoosh', { vol: 0.4 }); ctx.shake(0.25 + sweet * 0.25); G.camPunch = 0.6; if (sweet) { slow = 0.12; slowHold = 0.07; } }
      p.slapUsed = true; p.slapCd = p.assist ? 0.18 : 0.3; p.sx = 1.25; p.sy = 0.8;
    }
    function diveBall(p, n) {
      const sdir = -p.side; const vy = 15.2; const tflight = 2 * vy / GBALL; const tgtX = sdir * 3.8;
      ball.vy = vy; ball.vx = clamp((tgtX - ball.x) / tflight, sdir > 0 ? 2.5 : -9, sdir > 0 ? 9 : -2.5); ball.spin = sdir * 9;
      stats.digs[p.i]++; p.digs++;
      fx.particles.burst(ball.x, ball.y, 0.4, { count: 18, speed: 5, up: 1.4, life: 0.6, size: 0.35, colors: [0xffffff, 0xfff0c8, 0x8dff9a], gravity: 6 });
      fx.texts.add('DUIK-REDDING!', ball.x, ball.y + 1.5, 0.5, '#8dff9a', 1.3); audio.sfx('hit', { vol: 0.7 }); audio.sfx('boing', { vol: 0.4, rate: 1.4 }); ctx.shake(0.2);
      p.state = 'rec'; p.st = 0;
    }
    function contactBlob(p, h) {
      if (p.frozen > 0 && false) return;
      const slapping = p.state === 'slap' && !p.slapUsed;
      const diving = p.state === 'dive';
      const reach = p.Rc + (p.state === 'slap' ? SLAP_X + (p.assist ? 0.35 : 0) : 0) + (diving ? 0.4 : 0);
      const dx = ball.x - p.x, dy = ball.y - (p.y + (diving ? 0.1 : 0));
      const minD = reach + RB, d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) return;
      let d = Math.sqrt(d2); const n = { x: 0, y: 1 }; if (d > 1e-4) { n.x = dx / d; n.y = dy / d; } else d = 0;
      const rvx = ball.vx - p.vx, rvy = ball.vy - p.vy, vn = rvx * n.x + rvy * n.y;
      const canTouch = p.lastHit > 0.13 || slapping || diving;
      if (slapping && d < minD) { ball.x = p.x + n.x * Math.max(d, p.Rc + RB); ball.y = p.y + n.y * Math.max(d, p.Rc + RB); onTouch(p, 'slap'); slapBall(p, n); return; }
      if (diving && p.lastHit > 0.2) { onTouch(p, 'dive'); diveBall(p, n); return; }
      if (d < p.Rc + RB) {
        ball.x = p.x + n.x * (p.Rc + RB + 0.001); ball.y = p.y + n.y * (p.Rc + RB + 0.001);
        if (vn < 0 && canTouch) { onTouch(p, 'bump'); bumpBall(p, n, vn); }
        else if (vn < 0) { const o = Math.max(10.5, -vn * 0.85); ball.vx = p.vx * 0.7 + n.x * o; ball.vy = p.vy * 0.5 + n.y * o; }
      }
    }
    function stepBall(h) {
      if (ball.held) return;
      let ax = wind * 0.7, ay = -GBALL; const sk = 0.016;
      ax += -sk * ball.spin * ball.vy; ay += sk * ball.spin * ball.vx;
      ball.vx += ax * h; ball.vy += ay * h;
      const sp = Math.hypot(ball.vx, ball.vy); if (sp > BALL_MAX) { ball.vx *= BALL_MAX / sp; ball.vy *= BALL_MAX / sp; }
      ball.x += ball.vx * h; ball.y += ball.vy * h; ball.spin *= Math.exp(-0.35 * h); ball.rot += ball.spin * h * 0.8;
      // zijmuren (opblaas-pilaren)
      if (ball.x > W - RB) { ball.x = W - RB; if (ball.vx > 0) { ball.vx = -ball.vx * 0.8; wallFx(1); } }
      else if (ball.x < -W + RB) { ball.x = -W + RB; if (ball.vx < 0) { ball.vx = -ball.vx * 0.8; wallFx(-1); } }
      if (ball.y > CEIL) { ball.y = CEIL; if (ball.vy > 0) { ball.vy = -ball.vy * 0.4; audio.sfx('boing', { vol: 0.2, rate: 1.6 }); } }
      // netpaal
      const cy = clamp(ball.y, 0, NH), ndx = ball.x, ndy = ball.y - cy, nd = Math.hypot(ndx, ndy), mm = NR + RB;
      if (nd < mm) {
        let nx = ndx, ny = ndy; if (nd < 1e-4) { nx = Math.random() < 0.5 ? 1 : -1; ny = 0; } else { nx /= nd; ny /= nd; }
        if (ny > 0.9 && Math.abs(nx) < 0.15) nx = (ball.vx >= 0 ? 1 : -1) * 0.4;      // bovenop de paal: rol eraf
        const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        ball.x = nx * mm; ball.y = cy + ny * mm;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) { ball.vx -= 1.75 * vn * nx; ball.vy -= 1.75 * vn * ny; ball.spin *= 0.5; if (-vn > 4) { audio.sfx('thud', { vol: clamp(-vn / 20, 0.1, 0.5), rate: 1.4 }); fx.particles.burst(ball.x, ball.y, 0.3, { count: 6, speed: 3, up: 0.8, life: 0.4, size: 0.25, colors: [0xffffff, 0xff4f7a], gravity: 6 }); if (-vn > 12) { ctx.shake(0.15); fx.texts.add('NET!', ball.x, ball.y + 1, 0.5, '#ffffff', 0.9); } } }
      }
      // spelers + kip
      for (const p of pl) contactBlob(p, h);
      if (chick.on) chickenBall();
      if (ball.x > W - RB) { ball.x = W - RB; if (ball.vx > 0) ball.vx = -ball.vx * 0.5; } else if (ball.x < -W + RB) { ball.x = -W + RB; if (ball.vx < 0) ball.vx = -ball.vx * 0.5; }
      // grond
      if (ball.y <= RB) {
        ball.y = RB;
        if (G.state === 'play') { groundHit(); ball.vy = Math.abs(ball.vy) * 0.4; ball.vx *= 0.6; }
        else { if (ball.vy < 0) { ball.vy = -ball.vy * 0.5; ball.vx *= 0.8; if (ball.vy < 1.5) ball.vy = 0; } ball.vx *= (1 - 0.8 * h); }
      }
    }
    function wallFx(side) { audio.sfx('boing', { vol: 0.3, rate: 1.2 }); B.wallFlash(side); fx.particles.burst(side * (W - 0.4), ball.y, 0.3, { count: 8, speed: 3, up: 0.6, life: 0.4, size: 0.3, colors: [0xffffff, side < 0 ? 0x7dffb0 : 0x8fb8ff], gravity: 4 }); }
    function chickenBall() {
      const cx = chick.x, cy = 0.75 + chick.y, dx = ball.x - cx, dy = ball.y - cy, mm = RB + 0.85, d2 = dx * dx + dy * dy;
      if (d2 < mm * mm && ball.hitT > 0.2) {
        const d = Math.sqrt(d2) || 1e-3, nx = dx / d, ny = Math.max(0.35, dy / d);
        ball.x = cx + nx * mm; ball.y = cy + ny * mm; ball.vx = clamp(ball.vx * 0.5 + nx * 6 + rand(-3, 3), -12, 12); ball.vy = Math.max(13, Math.abs(ball.vy) * 0.8); ball.hitT = 0;
        chick.flap = 1; chick.vy = 7; G.stall = 0;
        fx.texts.add('KOEKELOEKOE!', ball.x, ball.y + 1.4, 0.8, '#ffe9a0', 1.3); audio.sfx('boing', { vol: 0.6, rate: 1.8 }); audio.sfx('pop', { vol: 0.5, rate: 1.4 }); ctx.shake(0.2);
        fx.particles.burst(cx, cy, 0.5, { count: 22, speed: 4, up: 1.4, life: 1.0, size: 0.35, colors: [0xffffff, 0xf6f1e4, 0xe8e0d0], gravity: 3 });
      }
    }
    function stepPlayer(p, h) {
      const g = GBLOB;
      if (p.state === 'dive') {
        p.vx = p.diveDir * DIVE_V * Math.min(1.15, pv.speed(p.i));
        if (!p.grounded) p.vy -= g * h * 0.5;
      } else p.vy -= g * h;
      p.x += p.vx * h; p.y += p.vy * h;
      if (p.y <= 0) { if (!p.grounded && p.vy < -6) { audio.sfx('land', { vol: clamp(-p.vy / 25, 0.1, 0.4) }); fx.particles.dust(p.x, 0.1, 0.4, 5, 0xfff0c8); p.sx = 1.2; p.sy = 0.75; } p.y = 0; p.vy = 0; p.grounded = true; } else p.grounded = false;
      const R = p.Rc;
      if (p.side < 0) { p.x = clamp(p.x, -W + R, -NR - R - 0.02); } else { p.x = clamp(p.x, NR + R + 0.02, W - R); }
    }
    function readInput(p, dt) {
      const inp = pv.input(p.i);
      p.slapCd = Math.max(0, p.slapCd - dt); p.diveCd = Math.max(0, p.diveCd - dt); p.lastHit += dt; p.stun = Math.max(0, p.stun - dt);
      p.Rc = damp(p.Rc, p.R0, 10, dt);
      if (p.frozen > 0) { p.frozen -= dt; p.vx = damp(p.vx, 0, 10, dt); p.state = 'idle'; return; }
      const dead = p.stun > 0;
      const speed = MOVE * pv.speed(p.i);
      // staten
      if (p.state === 'slap') { p.st += dt; if (p.st >= SLAP_T) { p.state = 'idle'; if (!p.slapUsed) p.slapCd = p.assist ? 0.25 : 0.45; } }
      else if (p.state === 'dive') { p.st += dt; if (p.st >= 0.36) { p.state = 'rec'; p.st = 0; p.diveCd = p.assist ? 0.8 : 1.1; } }
      else if (p.state === 'rec') { p.st += dt; if (p.st >= 0.2) p.state = 'idle'; }
      if (p.state !== 'dive' && !dead) {
        const ix = p.state === 'rec' ? 0 : clamp(inp.x * (1 + 0.41 * Math.min(1, Math.abs(inp.y) * 1.4)), -1, 1);   // diagonaal (springen + lopen) niet trager
        const lam = p.grounded ? lerp(16, 2.2, SLIP) : lerp(8, 1.6, SLIP);
        const k = 1 - Math.exp(-lam * dt); const sc = p.state === 'slap' ? 0.85 : 1;
        p.vx += (ix * speed * sc - p.vx) * k;
        if (Math.abs(ix) > 0.2) p.face = Math.sign(ix);
        // springen
        if (inp.up || inp.y < -0.5) p.jumpBuf = 0.1;
        if (p.jumpBuf > 0) { p.jumpBuf -= dt; if (p.grounded && p.state !== 'rec') { p.vy = JUMP; p.grounded = false; p.jumpBuf = 0; p.sx = 0.8; p.sy = 1.3; audio.sfx('jump', { vol: 0.3 }); fx.particles.dust(p.x, 0.1, 0.4, 5, 0xfff0c8); } }
        if (inp.aP && p.state === 'idle' && p.slapCd <= 0) { p.state = 'slap'; p.st = 0; p.slapUsed = false; audio.sfx('swing', { vol: 0.5, rate: 1 + Math.random() * 0.2 }); p.sx = 1.15; p.sy = 0.9; fx.particles.ring(p.x, 0.9, 0.5, { count: 10, speed: 4, color: 0xffffff, size: 0.2, life: 0.25 }); }
        else if (inp.aP && p.state === 'idle') audio.sfx('click', { vol: 0.12, rate: 0.6 });
        if (inp.bP && (p.state === 'idle' || p.state === 'slap') && p.diveCd <= 0) {
          p.state = 'dive'; p.st = 0; p.diveDir = Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) : (Math.abs(ball.x - p.x) > 1 && !ball.held ? Math.sign(ball.x - p.x) : -p.side);
          if (p.grounded) { p.vy = 4.5; p.grounded = false; }
          audio.sfx('whoosh', { vol: 0.5 }); p.sx = 1.4; p.sy = 0.55; fx.particles.dust(p.x, 0.1, 0.4, 8, 0xfff0c8);
        }
      }
      if (dead) p.vx = damp(p.vx, 0, 6, dt);
    }

    // ---------------- events ----------------
    function updateEvents(dt) {
      if (G.state === 'play' || G.state === 'serve') {
        // wind
        gustT -= dt;
        if (gustT <= 0 && gustLeft <= 0) { gustLeft = rand(6, 8); eventDir = Math.random() < 0.5 ? 1 : -1; windTarget = eventDir * rand(2.6, 3.8); gustT = rand(15, 22); stats.gusts++; hud.toast(`💨 WINDVLAAG! De wind blaast naar ${eventDir > 0 ? 'rechts' : 'links'}`, 2000); audio.tone(200, 1.0, { type: 'sawtooth', vol: 0.05, slide: 500 }); audio.sfx('whoosh', { vol: 0.5 }); fx.texts.add('WINDVLAAG!', 0, 8.6, 1, '#d8f4ff', 1.5); }
        if (gustLeft > 0) { gustLeft -= dt; if (gustLeft <= 0) windTarget = Math.sin(T * 0.3) * 0.7; }
        else windTarget = Math.sin(T * 0.27) * 0.8 + Math.sin(T * 0.11 + 1) * 0.4;
        if (tw === 'slowmo') windTarget *= 0.6;
        wind = damp(wind, windTarget, 1.2, dt); B.wind = wind; B.setWindIcon(wind);
      }
      if (G.state === 'play') {
        chickenT -= dt;
        if (!chick.on && chickenT <= 0 && T > 8) startChicken();
      }
      if (chick.on) updateChicken(dt);
    }
    function startChicken() {
      chick.on = true; chick.dir = Math.random() < 0.5 ? 1 : -1; chick.x = -chick.dir * (W + 1.5); chick.t = 0; chick.y = 0; chick.vy = 0; chick.flap = 0; stats.chickens++;
      chick.a.group.visible = true; chick.a.group.position.set(chick.x, 0, 0.3);
      hud.toast('🐔 Een kip rent over het veld! Niet op trappen...', 2200); audio.sfx('pop', { vol: 0.5, rate: 1.6 }); fx.texts.add('KIP!', chick.x * 0.6, 3, 1, '#ffe9a0', 1.3);
      chickenT = rand(18, 26);
    }
    function updateChicken(dt) {
      chick.t += dt; chick.x += chick.dir * 4.6 * dt;
      // hop over de netpaal
      const hop = Math.abs(chick.x) < 1.1 ? Math.cos(chick.x / 1.1 * Math.PI / 2) * 2.2 : 0;
      chick.vy -= 22 * dt; chick.y = Math.max(0, chick.y + chick.vy * dt); if (chick.y === 0) chick.vy = Math.max(0, chick.vy);
      chick.flap = Math.max(0, chick.flap - dt * 2);
      const g = chick.a.group; g.position.set(chick.x, hop + chick.y, 0.3); chick.a.targetYaw = chick.dir > 0 ? Math.PI / 2 : -Math.PI / 2; chick.a.speed = 1; chick.a.update(dt);
      g.rotation.z = Math.sin(chick.t * 14) * 0.06 + chick.flap * 0.5 * Math.sin(chick.t * 40);
      if (Math.random() < dt * 9) fx.particles.emit(chick.x, hop + chick.y + 0.7, 0.3, -chick.dir * 1, 1, 0, { life: 0.5, size: 0.18, color: 0xfff0c8, gravity: 2 });
      // blobs stoten tegen de kip: kort verstijfd
      if (G.state === 'play') for (const p of pl) if (p.stun <= 0 && p.state !== 'dive' && p.y < 0.9 && Math.abs(p.x - chick.x) < p.Rc * 0.75 + 0.55) {
        p.stun = 0.5; p.vx = (p.x >= chick.x ? 1 : -1) * 6; p.vy = 5; p.grounded = false; if (p.state === 'slap') p.state = 'idle';
        fx.texts.add('KIP-SCHRIK!', p.x, p.Rc * 2 + 1.5, 0.5, '#ffe9a0', 1.1); audio.sfx('hurt', { vol: 0.35, rate: 1.4 }); audio.sfx('pop', { vol: 0.4 }); chick.flap = 1; chick.vy = 6;
        fx.particles.burst(p.x, 1.2, 0.5, { count: 16, speed: 4, up: 1.2, life: 0.8, size: 0.3, colors: [0xffffff, 0xffe9a0], gravity: 3 });
      }
      if ((chick.dir > 0 && chick.x > W + 2.5) || (chick.dir < 0 && chick.x < -W - 2.5)) { chick.on = false; g.visible = false; }
    }

    // ---------------- update ----------------
    let lastSb = -1;
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; hud.toast(`${names[G.server]} begint met serveren`, 1500); }
      if (T > 330 && !finished && G.state !== 'end') endMatch(decideByCloseness());
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3.5, dt);
      const sdt = dt * slow * PHYS_T;
      G.t += dt;
      // klok
      if ((G.state === 'play' || G.state === 'serve') && !G.timeUp) {
        G.timeLeft -= dt;
        if (G.timeLeft <= 0) {
          G.timeLeft = 0; G.timeUp = true; audio.sfx('bell', { vol: 1 });
          if (G.state === 'serve' && score[0] !== score[1]) { hud.showBig('TIJD!', 1100, '#ffd23f'); endMatch(score[0] > score[1] ? 0 : 1); }
          else if (score[0] === score[1]) { G.golden = true; hud.showBig('GOUDEN PUNT!', 1500, '#ffd23f'); hud.toast('Gelijkspel! Het volgende punt wint', 2200); }
          else { hud.showBig('TIJD! Laatste rally...', 1400, '#ffd23f'); }
        }
        hud.setTimer(G.timeLeft, 10);
        if (Math.floor(G.timeLeft) !== lastSb) { lastSb = Math.floor(G.timeLeft); B.scoreboard(names, score, G.timeLeft, G.golden ? 'GOUDEN PUNT' : null); }
      } else if (G.golden) hud.setTimer(0);
      // rally-timer
      if (G.state === 'play') {
        G.rallyT += dt; ball.hitT += dt;
        if (G.rallyT > 28 && ball.kind !== 'bomb' && !G.noDoom) { G.noDoom = true; setBallKind('bomb'); ball.fuse = ball.fuse0 = 6; hud.toast('💣 Te lange rally! De bal is nu een BOM', 2200); audio.sfx('buzz', { vol: 0.5 }); }
      }
      // serve: bal hangt even boven de serveerder
      if (G.state === 'serve') {
        ball.y = 7.4 + Math.sin(T * 5) * 0.18; ball.x = pl[G.server].side * 5.4;
        if (G.t > SERVE_WAIT) { ball.held = false; G.state = 'play'; G.t = 0; G.noDoom = false; audio.sfx('go', { vol: 0.25 }); fx.texts.add('AANSLAG!', ball.x, 8.8, 0.5, G.server ? '#8fb8ff' : '#7dffb0', 1.3); }
      }
      // bom-lont
      if (G.state === 'play' && ball.kind === 'bomb') {
        const prev = ball.fuse; ball.fuse -= dt;
        const rate = ball.fuse < 2 ? 0.2 : ball.fuse < 4 ? 0.4 : 0.7;
        if (Math.floor(prev / rate) !== Math.floor(ball.fuse / rate)) audio.sfx('tick', { vol: 0.35, rate: 1.4 + (7 - ball.fuse) * 0.12 });
        if (ball.fuse <= 0) { const side = ball.x < 0 ? 0 : 1; const loser = pl.find((p) => sidx(p) === side); explode(ball.x, ball.y); rallyEnd(1 - loser.i, `BOEM! De bom ontplofte aan de kant van ${names[loser.i]}`, true); }
      }
      // spelers lezen
      for (const p of pl) { const can = G.state === 'play' || G.state === 'serve' || G.state === 'point'; if (can) readInput(p, dt * (G.state === 'point' ? slow : 1)); else { p.vx = 0; } }
      // natuurkunde in substappen
      if (G.state === 'play' || G.state === 'serve' || G.state === 'point') {
        const vmax = Math.max(15, Math.hypot(ball.vx, ball.vy)); const n = clamp(Math.ceil(vmax * sdt / 0.2), 1, 12), h = sdt / n;
        for (let s = 0; s < n; s++) { for (const p of pl) stepPlayer(p, h); stepBall(h); }
        // schade-vrij: bal duwt blob niet
      }
      updateEvents(dt);
      if (G.state === 'point') {
        if (G.t > 2.1) {
          if (G.end) endMatch(score[0] === score[1] ? decideByCloseness() : (score[0] > score[1] ? 0 : 1));
          else { ballG.visible = true; for (const p of pl) p.mood = 'play'; startServe(G.winnerP); }
        }
      } else if (G.state === 'end') {
        if (G.t > (G.winner == null ? 1.6 : 2.4) && !finished) finishMatch(G.winner);
      }
      applyAssist();
      visuals(dt);
    }
    function decideByCloseness() {
      G.tiebreak = true;
      const d0 = Math.abs(pl[0].x - ball.x), d1 = Math.abs(pl[1].x - ball.x);
      return Math.abs(d0 - d1) < 0.01 ? (Math.random() < 0.5 ? 0 : 1) : (d0 < d1 ? 0 : 1);
    }

    // ---------------- visuals ----------------
    const camLook = new THREE.Vector3(); let camX = 0, camZoom = 1;
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist0 = clamp(12.3 / (tanV * asp), 14, 34);
      G.camPunch = Math.max(0, G.camPunch - dt * 0.9);
      camZoom = damp(camZoom, 1 - G.camPunch * 0.05, 6, dt);
      camX = damp(camX, clamp(ball.x * 0.1, -1.5, 1.5), 2, dt);
      const sway = Math.sin((T + introT) * 0.3) * 0.25;
      camera.position.set(camX + sway, 5.9, dist0 * camZoom + 1); camLook.set(camX * 0.6, 4.9, 0); camera.lookAt(camLook);
    }
    function visuals(dt) {
      const tt = T + introT;
      // bal
      if (ballG.visible) {
        ballG.position.set(ball.x, ball.y, 0.05); ballM.rotation.z = ball.rot; ballM.rotation.y += dt * 1.5;
        const spd = Math.hypot(ball.vx, ball.vy);
        const sq = clamp(spd / 70, 0, 0.18); ballM.scale.set(1 + sq, 1 - sq, 1 + sq); ballM.rotation.z = ball.rot;
        bShadow.position.set(ball.x, 0.04, 0.2); const hh = clamp(1 - ball.y / 14, 0.25, 1); bShadow.scale.setScalar(1.1 * hh * (ball.held ? 0.8 : 1)); bShadow.material.opacity = 0.35 + hh * 0.5;
        if (ball.kind === 'bomb') {
          const fr = ball.fuse < 2 ? 14 : ball.fuse < 4 ? 8 : 4; const bl = Math.sin(tt * fr) > 0 ? 1 : 0;
          mBomb.emissiveIntensity = G.state === 'play' ? bl * (0.5 + (7.5 - ball.fuse) * 0.1) : 0.2; halo.material.opacity = bl * 0.5;
          halo.scale.setScalar(2.4 + (ball.fuse < 2 ? Math.sin(tt * 30) * 0.5 : 0));
          spark.material.opacity = 0.8 + Math.sin(tt * 40) * 0.2; fuse.rotation.z = -ball.rot * 0.0;
          if (Math.random() < dt * 40) fx.particles.emit(ball.x, ball.y + RB + 0.4, 0.1, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, 0, { life: 0.4, size: 0.22, color: Math.random() < 0.5 ? 0xffd23f : 0xff6a1a, gravity: -2 });
        } else if (ball.kind === 'gold') {
          halo.scale.setScalar(3 + Math.sin(tt * 6) * 0.3); if (Math.random() < dt * 30) fx.particles.emit(ball.x + (Math.random() - 0.5), ball.y + (Math.random() - 0.5), 0.2, 0, 0.5, 0, { life: 0.6, size: 0.3, color: Math.random() < 0.5 ? 0xffd23f : 0xffffff, gravity: -1 });
        }
        if (!ball.held && G.state === 'play') {
          const sp = Math.hypot(ball.vx, ball.vy);
          if (sp > 13 && Math.random() < dt * (8 + sp * 0.8)) fx.particles.emit(ball.x - ball.vx * 0.015, ball.y - ball.vy * 0.015, 0.1, 0, 0, 0, { life: 0.35, size: 0.3, color: ball.kind === 'gold' ? 0xffd23f : 0xffffff, gravity: 0 });
        }
      }
      // blobs
      for (const p of pl) {
        p.sx = damp(p.sx, 1, 9, dt); p.sy = damp(p.sy, 1, 9, dt);
        let sx = p.sx, sy = p.sy;
        if (p.state === 'dive') { sx *= 1.3; sy *= 0.6; } else if (!p.grounded) { sy *= 1 + clamp(Math.abs(p.vy) / 60, 0, 0.12); sx *= 1 - clamp(Math.abs(p.vy) / 120, 0, 0.06); }
        const bob = p.grounded && p.state === 'idle' && Math.abs(p.vx) < 1 ? Math.sin(tt * 3 + p.i) * 0.03 : 0;
        const R = p.Rc * (p.mood === 'cheer' ? 1 + Math.abs(Math.sin(tt * 9)) * 0.08 : 1);
        if (p.mood === 'cheer' && p.grounded && G.state !== 'play' && Math.random() < dt * 3) { p.vy = 8; p.grounded = false; }
        if (p.frozen > 0 && p.grounded) sy *= 1 + Math.sin(tt * 50) * 0.04;
        p.g.position.set(p.x, p.y, 0); p.g.scale.set(R * sx * (1 + bob), R * sy * (1 - bob), R * 0.92);
        p.g.rotation.z = p.state === 'dive' ? -p.diveDir * 0.35 : clamp(p.vx * -0.012, -0.12, 0.12) + (p.stun > 0 ? Math.sin(tt * 30) * 0.15 : 0);
        // ogen kijken naar de bal; pupillen groter bij een slag
        const lx = ball.x - p.x, ly = ball.y - (p.y + R * 0.7); const ll = Math.hypot(lx, ly) || 1;
        for (const e of p.eyes) { e.position.x = e.userData.sd * 0.27 + (-p.side) * 0.1; e.userData.pu.position.set(lx / ll * 0.07, ly / ll * 0.07, 0.17); e.userData.pu.scale.setScalar(p.state === 'slap' ? 1.5 : p.mood === 'sad' ? 0.8 : 1); e.scale.y = p.stun > 0 || p.frozen > 0 ? 0.3 : 1; }
        p.mouth.rotation.z = p.mood === 'sad' || p.stun > 0 ? 0 : Math.PI; p.mouth.scale.set(p.state === 'slap' ? 1.5 : 1, p.state === 'slap' ? 1.5 : 1, 1);
        p.bodyM.emissiveIntensity = 0.18 + (p.state === 'slap' ? 0.5 : 0) + (p.assist ? 0.25 + Math.sin(tt * 8) * 0.12 : 0);
        p.bodyM.color.setHex(p.frozen > 0 ? 0x9fd8ff : PLAYER_COLORS[p.i]);
        // slag-ring
        const slap = p.state === 'slap'; const rr = p.Rc + (slap ? SLAP_X + (p.assist ? 0.35 : 0) : 0);
        p.ring.position.set(p.x, p.y, 0.1); p.ring.scale.setScalar(rr * (slap ? 1 + p.st * 0.4 : 1));
        p.ring.material.opacity = slap ? 0.85 * (1 - p.st / SLAP_T) : 0; p.ring.material.color.setHex(p.assist ? 0xffd23f : 0xffffff);
        p.shadow.position.set(p.x, 0.04, 0.2); p.shadow.scale.setScalar(R * (1 - clamp(p.y / 10, 0, 0.5)) * 1.2); p.shadow.material.opacity = 0.9 - clamp(p.y / 8, 0, 0.5);
        // slagen-bolletjes + naamplaatje
        const top = p.y + p.Rc * sy * 1.0 + 0.9; const si = sidx(p);
        const used = G.lastSide === si ? G.cnt[si] : 0;
        p.pips.forEach((m, k) => { m.position.set(p.x + (k - 1) * 0.5, top, 0.3); m.material = k < used ? (used >= 3 ? pipHot : pipOn) : pipOff; m.scale.setScalar(k < used ? 1 + (k === used - 1 ? Math.sin(tt * 12) * 0.12 : 0) : 0.8); m.visible = G.state === 'play' || G.state === 'serve'; });
        p.tag.position.set(p.x, top + 0.95, 0.4); p.tag.visible = G.state !== 'point' || G.t < 1.6;
        refreshInfo(p);
        p.g.visible = true;
      }
      B.update(tt, dt); updateCamera(dt);
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const p of pl) { if (p.mood === 'cheer' && Math.random() < dt * 3) { p.vy = 9; p.grounded = false; } p.vy -= GBLOB * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.grounded = true; } visuals(dt); }
    function introUpdate(dt) { introT += dt; visuals(dt); }
    startServe(Math.random() < 0.5 ? 0 : 1, true); ballG.visible = true; refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(p.x, 1.2, 0, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = pl[i]; p.frozen = 1.8; p.state = 'idle'; if (score[i] > 0) { score[i]--; refreshHud(); applyAssist(); } fx.texts.add('BEWOGEN!', p.x, p.Rc * 2 + 2, 0.5, '#9fe8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { pl[w].mood = 'cheer'; pl[1 - w].mood = 'sad'; B.cheer(6); },
      dispose() {},
      dbg: {
        state: () => ({ T, gstate: G.state, timeLeft: G.timeLeft, golden: G.golden, score: [...score], finished, slow, server: G.server, cnt: [...G.cnt], lastSide: G.lastSide, rally: G.rally, wind, mirrorNext: G.mirrorNext,
          ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, kind: ball.kind, held: ball.held, fuse: ball.fuse, spin: ball.spin },
          pl: pl.map((p) => ({ i: p.i, side: p.side, x: p.x, y: p.y, vx: p.vx, vy: p.vy, st: p.state, slapCd: p.slapCd, diveCd: p.diveCd, R: p.Rc, grounded: p.grounded, assist: p.assist, stun: p.stun, frozen: p.frozen, smashes: p.smashes, digs: p.digs })),
          chicken: chick.on ? { x: chick.x } : null, stats }),
        setScore: (a, b) => { score[0] = a; score[1] = b; refreshHud(); applyAssist(); },
        setTime: (t) => { G.timeLeft = t; }, forceKind: (k) => { setBallKind(k); ball.fuse = ball.fuse0 = k === 'bomb' ? 7.5 : 0; }, chicken: () => startChicken(), gust: (d) => { gustLeft = 7; windTarget = d * 3.5; stats.gusts++; }, mirror: () => { G.mirrorNext = true; },
        setBall: (x, y, vx, vy) => { ball.x = x; ball.y = y; ball.vx = vx; ball.vy = vy; ball.held = false; if (G.state === 'serve') { G.state = 'play'; G.t = 0; } },
        setServe: (i) => startServe(i),
        pl, ball, G,
      },
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_COLORS, makeBrother, Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { BK, buildCourt, makeBallMesh, iconTex, makeTrampoline } from './basket_world.js';

// Mand-Mania — duel: straatbasketbal 1-tegen-1 in zijaanzicht. 90 s of eerste tot 21; wie voorstaat wint (sudden death bij gelijk).
//  * lopen, omhoog = sprong · A = pakken; daarna A ingedrukt = kracht laden, loslaten = schot (loslaten op de top van je sprong in de groene zone = PERFECT)
//  * B = dunk (met bal bij de mand), blokkeren (bal in de lucht), stelen (bal bij de ander); 3-puntslijn, 8 s schotklok
//  * power-ups: reuzenbal (alleen dunken telt, 4 punten), raketschoenen, trampoline · gimmicks: bewegende manden, bal wordt een kip, Deurman kijkt (geen B-beuken!)
//  * comeback: in de laatste 15 s scoort de achterstaander dubbel; achterstaander krijgt vaker power-ups en iets meer steel-kans

const { HX, BB, RR, RT, RIMY, BR, PLX, WALLX, ZP } = BK;
const MATCH_T = 90, WIN = 21, SHOT_CLOCK = 8, CHARGE_T = 1.0, OVER_T = 1.3, THREE_D = 6.4;
const MOVE_V = 7.6, JUMP_V = 12.6, GP = 36, GB = 26, TRAMP_V = 22;
const ITEMS = [{ id: 'giant', name: 'REUZENBAL!', col: '#ffb24a' }, { id: 'boots', name: 'RAKETSCHOENEN!', col: '#ff6a4a' }, { id: 'tramp', name: 'TRAMPOLINE!', col: '#ffe14a' }];
const sm01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function labelTex(text, css, size = 46) {
  return canvasTex(256, 96, (c, w, hh) => { c.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 11; c.strokeStyle = 'rgba(10,10,30,.92)'; c.lineJoin = 'round'; c.strokeText(text, w / 2, hh / 2, w - 10); c.fillStyle = css; c.fillText(text, w / 2, hh / 2, w - 10); });
}

export default {
  id: 'basket',
  name: 'Mand-Mania',
  giver: 'Coach Klepper',
  icon: '🏀',
  mode: 'pvp',
  time: 90,
  music: 'game_fast',
  blurb: 'Straatbasketbal in het steegje! <b>90 s</b> of eerste tot <b>21</b>. Pak de bal, schiet in de <b>mand</b> en pas op voor de <b>Deurman</b>: als hij kijkt, mag je niet beuken!',
  controls: ['{move} lopen, omhoog = sprong', '{a} pak; houd = laad, los = schot', '{b} dunk / blok / steel'],
  tip: 'Loslaten op de top van je sprong in het groen = PERFECT. Achterstaand in de laatste 15 s? Dubbele punten!',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp;
    const names = players.map((p) => p.name);
    const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const CSS = ['#7dffb0', '#8fb8ff'];
    const colorsCss = ['rgba(60,200,120,1)', 'rgba(70,140,255,1)'];

    const L = ctx.lights('dusk', { shadow: 20, center: [0, 3, 0], fog: false });
    L.hemi.intensity = 1.1; L.sun.intensity = 2.1; L.sun.position.set(-14, 24, 20);
    camera.fov = 40; camera.updateProjectionMatrix(); scene.add(camera);
    const C = buildCourt(ctx, L, colorsCss);

    // ---------------- spelers ----------------
    const nameTex = names.map((n, i) => labelTex(n.toUpperCase(), CSS[i], 50));
    const clockTex = [...Array(9).keys()].map((n) => labelTex(String(n), '#ff6a4a', 90));
    const pl = players.map((pp, i) => {
      const dir = i ? -1 : 1, c = makeBrother(i); c.group.userData.dynamic = true; scene.add(c.group);
      const shadow = P.shadowBlob(1.0); scene.add(shadow);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex[i], transparent: true, depthTest: false })); tag.scale.set(2.6, 0.97, 1); tag.renderOrder = 15; scene.add(tag);
      const clk = new THREE.Sprite(new THREE.SpriteMaterial({ map: clockTex[8], transparent: true, depthTest: false })); clk.scale.set(1.5, 1.4, 1); clk.renderOrder = 16; clk.visible = false; scene.add(clk);
      const s = 1.3 * pv.size(i); c.group.scale.setScalar(s);
      const bootG = [c.legL, c.legR].map((leg) => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(0.28, 0.22, 0.42), new THREE.MeshStandardMaterial({ color: 0xe8402a, emissive: 0x601008, roughness: 0.5 }), { cast: false, pos: [0, -0.62, 0.06] })); g.add(mesh(new THREE.ConeGeometry(0.12, 0.34, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }), { cast: false, pos: [0, -0.84, 0], rot: [Math.PI, 0, 0] })); g.visible = false; leg.add(g); return g; });
      return { i, dir, c, bootG, shadow, tag, clk, s, x: -dir * 3.5, y: 0, vx: 0, vy: 0, z: ZP[i], face: dir, grounded: true, hold: false, aBuf: 0, grabAge: 9, charging: false, chargeT: 0, upPrev: false, stun: 0, swing: 0, swingCd: 0, stealChecked: false, boots: 0, dunk: null, mood: 'play', grabCd: 0, sc: SHOT_CLOCK, fake: 0, trampCd: 0, apex: false, lastTick: -1, bumpCd: 0 };
    });
    // bal, kip-bal, orb, trampoline
    const ballM = makeBallMesh(); scene.add(ballM); const ballShadow = P.shadowBlob(0.6); scene.add(ballShadow);
    const chick = new Animal('chicken'); chick.group.visible = false; scene.add(chick.group); chick.group.userData.dynamic = true;
    const itemTex = Object.fromEntries(ITEMS.map((it) => [it.id, iconTex(it.id)]));
    const itemG = new THREE.Group(); itemG.visible = false; scene.add(itemG);
    const itemOrb = mesh(new THREE.SphereGeometry(0.95, 14, 10), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, emissive: 0x6a9aff, emissiveIntensity: 0.6, roughness: 0.1 }), { cast: false }); itemG.add(itemOrb);
    const itemIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTex.giant, transparent: true, depthWrite: false })); itemIcon.scale.set(1.7, 1.7, 1); itemG.add(itemIcon);
    const tramp = makeTrampoline(); tramp.visible = false; scene.add(tramp);

    // ---------------- overlay: schot-meters ----------------
    const ov = new THREE.Group(); camera.add(ov);
    const rmat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false });
    const oplane = (c, o = 1, ro = 60) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rmat(c, o)); m.renderOrder = ro; ov.add(m); return m; };
    const meters = [0, 1].map((i) => ({ frame: oplane(0x0a0a1e, 0.85, 60), fill: oplane(0x222a4a, 1, 61), good: oplane(0xe8c83a, 0.9, 62), perf: oplane(0x3ac86a, 1, 63), mark: oplane(0xffffff, 1, 65), apex: oplane(0x888899, 1, 64), lab: (() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(names[i].toUpperCase(), CSS[i], 44), transparent: true, depthTest: false })); s.renderOrder = 66; ov.add(s); return s; })() }));

    // ---------------- toestand ----------------
    const score = [0, 0];
    let T = 0, introT = 0, started = false, finished = false, slow = 1, slowHold = 0, camX = 0, camD = 21, punch = 0, lastSb = -1, ended = false;
    const G = { state: 'tip', t: 0, timeLeft: MATCH_T, sd: false, sdT: 0, winner: -1, lastScorer: -1, timeUp: false, waitT: 0, comebackAnn: false, endT: 0, tipN: 4 };
    const b = { state: 'free', x: 0, y: 5, vx: 0, vy: 0, r: BR, holder: -1, shooter: -1, pts: 2, from: 0, t: 0, rimHit: false, boardHit: false, perfect: false, chick: 0, giant: 0, deadT: 0, heldT: 0, lastTouch: -1, hopT: 0, prevY: 5, spin: 0, k: -1 };
    const stats = { shots: [0, 0], makes: [0, 0], threes: [0, 0], dunks: [0, 0], blocks: [0, 0], steals: [0, 0], fouls: [0, 0], perfect: [0, 0], items: 0, violations: 0, tipins: 0 };
    let item = null, itemT = 6, trampo = null, evT = rand(14, 20);
    const EV = { hoops: 0, chick: 0 };
    const ref = { st: 'away', t: rand(5, 8), look: 0 };
    const tmpV = new THREE.Vector3(), hp = { x: 0, y: 0, z: 0 };
    const hs = (k) => (k === 0 ? 1 : -1), hoopX = (k) => hs(k) * HX, rimY = () => RIMY + C.hoopOff;
    const idealOf = (p, x = p.x) => clamp(0.2 + 0.66 * Math.min(Math.abs(hoopX(p.i) - x), 10) / 10, 0.2, 0.9);
    const lead = (i) => score[i] - score[1 - i];
    const hoopOffAt = (dtA) => { const rem = EV.hoops - dtA; if (rem <= 0) return 0; return Math.sin((T + dtA) * 1.8) * clamp(Math.min(rem, 12 - rem) / 1.2, 0, 1) * 0.95; };

    function refreshHud() {
      hud.setScore(`${names[0]} ${score[0]} – ${score[1]} ${names[1]}${G.sd ? '  (GOUDEN MAND)' : ''}`);
      C.scoreboard(names, score, G.sd ? 0 : G.timeLeft, G.sd ? 'GOUDEN MAND' : null);
    }
    function refreshInfo(p) {
      const t = `${p.hold ? '🏀 bal' : ''}${p.boots > 0 ? ` 🚀${Math.ceil(p.boots)}s` : ''}${p.stun > 0 ? ' 😵' : ''}${p.hold && p.sc < 4 ? ` ⏱${Math.ceil(p.sc)}` : ''}`.trim() || '–';
      if (p.infoTxt !== t) { p.infoTxt = t; hud.setPlayerInfo(p.i, `${score[p.i]} pnt · ${t}`); }
    }

    // ---------------- spelverloop ----------------
    function giveBall(p, how) {
      b.state = 'held'; b.holder = p.i; b.shooter = -1; b.heldT = 0; b.vx = b.vy = 0; b.rimHit = b.boardHit = false; b.perfect = false; b.lastTouch = p.i;
      p.hold = true; p.grabAge = 0; p.sc = SHOT_CLOCK; p.lastTick = -1; p.aBuf = 0; p.charging = false; p.chargeT = 0; p.dunk = null;
      for (const o of pl) if (o !== p) { o.hold = false; o.charging = false; o.chargeT = 0; }
    }
    function dropBall(vx, vy) { const p = pl[b.holder]; if (p) { p.hold = false; p.charging = false; p.chargeT = 0; p.grabCd = 0.45; } b.state = 'free'; b.holder = -1; b.vx = vx; b.vy = vy; }
    function tipOff() {
      G.state = 'tip'; G.t = 0; G.tipN = 4; b.state = 'free'; b.holder = -1; b.x = 0; b.y = 5.2; b.vx = b.vy = 0; b.t = 0; b.shooter = -1;
      for (const p of pl) { p.hold = false; p.charging = false; p.chargeT = 0; p.x = -p.dir * 3.2; p.y = 0; p.vx = p.vy = 0; p.dunk = null; p.stun = 0; p.mood = 'play'; p.face = p.dir; }
    }
    function inbound(who) {
      const p = pl[who], o = pl[1 - who]; G.state = 'play'; G.t = 0;
      p.x = -p.dir * 5.0; p.y = 0; p.vx = p.vy = 0; o.x = p.x + p.dir * 3.2; o.y = 0; o.vx = o.vy = 0; p.dunk = o.dunk = null; p.stun = o.stun = 0; p.mood = o.mood = 'play'; p.face = p.dir; o.face = -p.dir;
      b.x = p.x; b.y = 1.2; giveBall(p); p.grabCd = 0;
      fx.particles.burst(p.x, 1, p.z, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xffe14a], gravity: 3 });
    }
    function startPlay() { G.state = 'play'; G.t = 0; if (!G.hinted) { G.hinted = true; hud.setHint('<b>A</b> pak · <b>houd A</b> laden, <b>los</b> = schot · <b>B</b> dunk/blok/steel'); G.hintT = 11; } b.vy = 13.5; b.vx = rand(-1, 1); audio.sfx('go', { vol: 0.4 }); fx.texts.add('SPRONGBAL!', 0, 6.5, 0, '#ffe14a', 1.8); ctx.shake(0.2); hud.showBig('GA!', 700, '#ffe14a'); }

    function scoreBasket(k, pts, how) {
      if (G.state === 'scored' || G.state === 'end') return;
      const trail = score[k] < score[1 - k]; let mult = 1;
      if (G.timeLeft <= 15 && !G.sd && trail) { mult = 2; }
      const chick = b.chick > 0 && how !== 'dunk'; if (chick) pts += 1;
      const tot = pts * mult; score[k] += tot; G.state = 'scored'; G.t = 0; G.lastScorer = k; b.state = 'dead'; b.deadT = 0; b.holder = -1;
      stats.makes[k]++; if (how === 'three') stats.threes[k]++;
      const hp0 = C.hoops[k]; C.swish(k, 1);
      const col = CSS[k], big = tot >= 3 || how === 'dunk';
      hud.showBig(how === 'dunk' ? (pts >= 4 ? 'REUZEN-DUNK! +4' : 'DUNK!') : how === 'three' ? 'TRIPLE! +3' : `+${tot}`, 1100, col);
      const label = how === 'dunk' ? 'SLAM DUNK!' : b.perfect ? 'PERFECT!' : (!b.rimHit && !b.boardHit ? 'SWISH!' : b.boardHit && !b.rimHit ? 'BANK!' : 'RIM-IN!');
      fx.texts.add(label, hoopX(k) * 0.8, rimY() + 2.4, 0, how === 'dunk' ? '#ff9a3a' : col, 1.7); fx.texts.add(`+${tot}${mult > 1 ? ' (x2!)' : ''}${chick ? ' kip!' : ''}`, hoopX(k) * 0.85, rimY() + 1.3, 0, '#ffffff', 1.2);
      if (mult > 1) { fx.texts.add('DUBBELE PUNTEN!', 0, 7.0, 0, '#ffd23f', 1.7); audio.sfx('powerup', { vol: 0.6 }); }
      audio.sfx(how === 'dunk' ? 'explode' : 'ding', { vol: how === 'dunk' ? 0.5 : 0.8 }); audio.sfx(big ? 'win' : 'coin', { vol: big ? 0.45 : 0.6 }); audio.noise(1.0, { type: 'bandpass', freq: 800, freq2: 2000, q: 0.8, vol: 0.2, attack: 0.15 });
      fx.particles.burst(hoopX(k), rimY() - 0.3, 0, { count: big ? 60 : 36, speed: 7, up: 1.2, life: 1.2, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
      ctx.shake(how === 'dunk' ? 0.9 : 0.35); C.cheer(big ? 3 : 1.8);
      pl[k].mood = 'cheer'; pl[1 - k].mood = 'sad';
      if (b.perfect) stats.perfect[k]++;
      // schoon: hang de bal door het net
      b.vx *= 0.2; b.vy = Math.min(b.vy, -3);
      refreshHud();
      if (G.sd || score[k] >= WIN) { G.endDelay = 1.3; G.pendingWin = k; }
    }
    function endMatch(w) {
      if (G.state === 'end') return; G.state = 'end'; G.t = 0; G.winner = w; slow = 1; hud.setTimer(null);
      if (w != null) { pl[w].mood = 'cheer'; pl[1 - w].mood = 'sad'; C.cheer(6); }
      for (const p of pl) { p.charging = false; p.hold = false; }
    }
    function finishMatch(w) {
      if (finished) return; finished = true; const l = 1 - w;
      const jokes = [`${names[w]} scoort alsof de mand een magneet heeft. ${names[l]} kijkt naar de kip.`, `${names[w]} is de Koning van het Steegje! ${names[l]} zoekt de bal onder een vuilnisbak.`, `Wat een show! ${names[w]} wint en de Deurman klapt (voorzichtig).`, `${names[w]} dunkt zich naar de zege. ${names[l]} dunkt alleen in de rimpels.`];
      const ex = [stats.perfect[0] + stats.perfect[1] ? `${stats.perfect[0] + stats.perfect[1]}x perfect` : '', stats.dunks[0] + stats.dunks[1] ? `${stats.dunks[0] + stats.dunks[1]} dunks` : '', stats.blocks[0] + stats.blocks[1] ? `${stats.blocks[0] + stats.blocks[1]} blokken` : '', stats.fouls[0] + stats.fouls[1] ? `${stats.fouls[0] + stats.fouls[1]} fouten (Deurman!)` : '', G.coin ? 'de Deurman gooide een munt' : ''].filter(Boolean).join(' · ');
      ctx.finishPvp({ winner: w, score: [score[0], score[1]], delay: 800, summary: `${pick(jokes)}${ex ? ` (${ex}.)` : ''}` });
    }

    // ---------------- schieten ----------------
    function holdPos(p, out) {
      const S = p.s; let x = p.x + p.face * 0.62 * S, y;
      if (p.dunk) { x = p.x + p.face * 0.2 * S; y = p.y + 2.6 * S; }
      else if (p.charging) { x = p.x + p.face * 0.1 * S; y = p.y + 2.65 * S + Math.min(p.chargeT, 1) * 0.12 * S; }
      else if (!p.grounded) { x = p.x + p.face * 0.45 * S; y = p.y + 1.75 * S; }
      else { const amp = Math.abs(p.vx) > 1 ? 1 : 0.5, ph = Math.abs(Math.sin(T * 9 + p.i * 1.7)); y = p.y + 0.15 * S + ph * 0.95 * S * amp + b.r; }
      out.x = x; out.y = Math.max(y, b.r); out.z = p.z; return out;
    }
    function shoot(p, power) {
      holdPos(p, hp); const S = p.s, k = p.i, dir = p.dir, hx = hoopX(k), x0 = hp.x, y0 = hp.y; let ry = rimY();
      const airborne = p.y > 0.35, apex = airborne && Math.abs(p.vy) < 3.2;
      const dxa = Math.abs(hx - x0), g = GB * GRAV; let th = 1, v = 1;
      for (let it = 0; it < 2; it++) {          // mikt op de plek waar de (bewegende) mand aankomt
        const dy = ry - y0; th = lerp(1.18, 0.86, clamp(dxa / 10, 0, 1));
        for (let n = 0; n < 16; n++) {       // boog hoog genoeg: de bal moet over de voorkant van de ring vallen
          const kk = dxa * Math.tan(th) - dy;
          if (kk > 0.35) { const c2 = Math.cos(th) * Math.cos(th); v = Math.sqrt(g * dxa * dxa / (2 * c2 * kk)); const xf = Math.max(0, dxa - RR), yf = y0 + xf * Math.tan(th) - g * xf * xf / (2 * v * v * c2); if (yf > ry + 0.62 || th >= 1.5) break; }
          th = Math.min(1.5, th + 0.05);
        }
        if (EV.hoops > 0 && it === 0) ry = RIMY + hoopOffAt(dxa / Math.max(1, v * Math.cos(th)));
      }
      const ideal = idealOf(p, p.x), dp = power - ideal, perfect = Math.abs(dp) < 0.075 && apex, good = Math.abs(dp) < 0.2;
      const K = 0.36 * clamp(dxa / 6, 0.35, 1);
      let f = perfect ? 1 : 1 + dp * K; const o = pl[1 - k]; const contested = Math.abs(o.x - p.x) < 2.0 && (o.y > 0.4 || o.swing > 0);
      const jit = perfect ? 0 : (apex ? 0.01 : airborne ? 0.03 : 0.06) * (contested ? 1.8 : 1) + (power > 0.99 ? 0.02 : 0);
      f *= 1 + (Math.random() - 0.5) * 2 * jit; v *= f;
      b.state = 'flight'; b.shooter = k; b.holder = -1; b.t = 0; b.x = x0; b.y = y0; b.vx = dir * v * Math.cos(th); b.vy = v * Math.sin(th); b.rimHit = b.boardHit = false; b.perfect = perfect; b.from = Math.abs(hx - p.x); b.pts = b.from > THREE_D ? 3 : 2; b.k = k;
      p.hold = false; p.charging = false; p.chargeT = 0; p.grabCd = 0.5; p.mood = 'play'; stats.shots[k]++; p.c.swing();
      audio.sfx('whoosh', { vol: 0.45, rate: 0.9 + power * 0.4 });
      if (perfect) { audio.sfx('sparkle', { vol: 0.7 }); fx.texts.add('PERFECT!', p.x, p.y + 4.2 * S, 0, '#7dff9a', 1.3); fx.particles.ring(x0, y0, 0, { count: 22, speed: 6, color: 0x7dff9a, size: 0.35, life: 0.5 }); }
      else if (!good) { fx.texts.add(dp > 0 ? 'te hard!' : 'te zacht!', p.x, p.y + 4.2 * S, 0, '#ffb09a', 0.9); }
      if (b.pts === 3) fx.texts.add('3!', p.x, p.y + 4.9 * S, 0, '#ffd23f', 1.1);
    }
    function startDunk(p) {
      const hx = hoopX(p.i), S = p.s, dxa = Math.abs(hx - p.x);
      p.dunk = { t: 0, T: 0.42 + 0.06 * dxa, x0: p.x, y0: p.y, tx: hx - p.dir * 0.85, ty: Math.max(1.6, rimY() - 2.55 * S), slam: false, hang: 0 };
      p.charging = false; p.chargeT = 0; p.vx = p.vy = 0; b.state = 'held'; b.holder = p.i; p.face = p.dir; stats.shots[p.i]++;
      audio.sfx('whoosh', { vol: 0.7, rate: 0.7 }); audio.sfx('swing', { vol: 0.4, rate: 0.7 }); slow = 0.5; slowHold = 0.35;
      fx.texts.add('DUNK!', p.x, p.y + 4.5, 0, '#ff9a3a', 1.3); fx.particles.dust(p.x, 0.1, p.z, 8, 0xd8c8a8);
    }
    function blockBall(o, ball) {
      stats.blocks[o.i]++; const spike = ball.y > o.y + 2.2 * o.s;
      b.state = 'free'; b.vx = o.face * rand(5, 10); b.vy = spike ? -rand(4, 9) : rand(-1, 6); b.perfect = false; b.lastTouch = o.i; b.shooter = -1; b.t = 0;
      fx.texts.add('GEBLOKT!', b.x, b.y + 1.4, 0, CSS[o.i], 1.7); audio.sfx('hit', { vol: 0.9 }); audio.sfx('good', { vol: 0.3 }); ctx.shake(0.45); slow = 0.4; slowHold = 0.3;
      fx.particles.burst(b.x, b.y, 0, { count: 24, speed: 6, up: 0.6, life: 0.5, size: 0.4, colors: [0xffffff, 0xff9a3a, 0xffe14a], gravity: 5 }); o.swing = 0;
    }
    function stealTry(p, v) {
      p.stealChecked = true; stats.steals[p.i] += 0;
      if (ref.st === 'look') {   // Deurman ziet het: FOUL
        stats.fouls[p.i]++; p.stun = 1.0; p.swing = 0; p.mood = 'sad'; score[v.i] += 1; refreshHud();
        fx.texts.add('FOUL!', p.x, p.y + 4.2 * p.s, 0, '#ff5a4a', 1.6); fx.texts.add('+1 voor ' + names[v.i], v.x, v.y + 5.0 * v.s, 0, CSS[v.i], 1.1); hud.toast(`👁 FOUL! ${names[v.i]} krijgt +1`, 1800);
        audio.sfx('buzz', { vol: 0.6 }); audio.sfx('static', { vol: 0.3 }); ctx.shake(0.3); C.refAlert = 0.6;
        if (score[v.i] >= WIN) { G.endDelay = 0.6; G.pendingWin = v.i; } return;
      }
      const chance = 0.4 + (ref.st === 'away' ? 0.12 : 0) + (lead(p.i) < 0 ? 0.1 : 0) - (v.charging ? 0.12 : 0) - (!v.grounded ? 0.2 : 0);
      if (v.grabAge < 0.9) { fx.texts.add('veilig!', v.x, v.y + 4.2 * v.s, 0, '#cfe0ff', 0.9); return; }
      if (Math.random() < chance) {
        stats.steals[p.i]++; giveBall(p); p.grabAge = 0; v.grabCd = 0.5; v.stun = 0.25; p.face = p.dir;
        fx.texts.add('STEAL!', p.x, p.y + 4.3 * p.s, 0, CSS[p.i], 1.5); audio.sfx('hit', { vol: 0.6 }); audio.sfx('good', { vol: 0.3 }); ctx.shake(0.25); fx.particles.burst(v.x, v.y + 1.5, 0, { count: 18, speed: 5, up: 0.8, life: 0.5, size: 0.35, colors: [0xffffff, 0xffe14a], gravity: 4 });
      } else {
        p.stun = 0.95; p.vx = p.face * 3; fx.texts.add('mis!', p.x, p.y + 4.2 * p.s, 0, '#ffb09a', 1.0); audio.sfx('boing', { vol: 0.5, rate: 1.4 }); audio.sfx('miss', { vol: 0.3 });
      }
    }
    function violation(p) {
      stats.violations++; audio.sfx('buzz', { vol: 0.7 }); hud.showBig('SCHOTKLOK!', 900, '#ff7a6a'); fx.texts.add('SCHOTKLOK!', p.x, p.y + 4.5, 0, '#ff6a4a', 1.5);
      p.hold = false; p.charging = false; p.chargeT = 0; inbound(1 - p.i);
    }

    // ---------------- spelers bewegen ----------------
    function stepPlayer(p, dt) {
      const inp = pv.input(p.i), sp = pv.speed(p.i), S = p.s, o = pl[1 - p.i];
      p.stun = Math.max(0, p.stun - dt); p.swing = Math.max(0, p.swing - dt); p.swingCd = Math.max(0, p.swingCd - dt); p.grabCd = Math.max(0, p.grabCd - dt); p.aBuf = Math.max(0, p.aBuf - dt); p.grabAge += dt; p.boots = Math.max(0, p.boots - dt); p.trampCd = Math.max(0, p.trampCd - dt); p.bumpCd = Math.max(0, p.bumpCd - dt);
      const play = G.state === 'play' || G.state === 'scored' || G.state === 'tip';
      if (p.dunk) {
        const d = p.dunk; d.t += dt;
        if (!d.slam) {
          const u = clamp(d.t / d.T, 0, 1), e = 1 - (1 - u) * (1 - u); p.x = lerp(d.x0, d.tx, e); p.y = lerp(d.y0, d.ty, u * u * (3 - 2 * u)) + Math.sin(Math.PI * u) * 1.1; p.vx = p.vy = 0;
          if (o.swing > 0 && u > 0.2 && Math.abs(o.x - p.x) < 2.6 * o.s && o.y > 0.25) { p.dunk = null; p.vy = -3; p.stun = 0.8; p.hold = false; blockBall(o, b); b.x = p.x; b.y = p.y + 2.5; return; }
          if (u >= 1) {
            d.slam = true; d.hang = 0; stats.dunks[p.i]++; b.x = hoopX(p.i); b.y = rimY() - 0.3; b.hold = false; p.hold = false; b.vx = 0; b.vy = -6; b.pts = 2; b.perfect = false;
            const pts = b.giant > 0 ? 4 : 2; b.state = 'free'; scoreBasket(p.i, pts, 'dunk'); slow = 0.3; slowHold = 0.45; punch = 1; ctx.shake(1.0);
            fx.particles.ring(hoopX(p.i), rimY(), 0, { count: 30, speed: 8, color: 0xffa040, size: 0.5, life: 0.7 }); audio.sfx('explode', { vol: 0.6 }); audio.sfx('thud', { vol: 0.8, rate: 0.6 });
          }
        } else { d.hang += dt; p.x = d.tx; p.y = d.ty; p.vx = p.vy = 0; if (d.hang > 0.4) { p.dunk = null; p.vy = -2; } }
        p.grounded = false; return;
      }
      // invoer
      let mx = (play && p.stun <= 0) ? inp.x : 0; if (Math.abs(mx) < 0.15) mx = 0;
      const vmax = MOVE_V * sp * (p.boots > 0 ? 1.55 : 1) * (p.hold ? 0.92 : 1) * (p.charging ? 0.75 : 1);
      const lam = p.grounded ? lerp(13, 1.5, SLIP) : lerp(4.5, 2, SLIP);
      p.vx = damp(p.vx, mx * vmax, lam, dt);
      const upNow = inp.y < -0.5; if (upNow && !p.upPrev && p.grounded && p.stun <= 0 && play) { p.vy = JUMP_V * Math.sqrt(sp) * (p.boots > 0 ? 1.3 : 1); p.grounded = false; p.c.jump(); audio.sfx('jump', { vol: 0.3, rate: p.boots > 0 ? 1.4 : 1 }); fx.particles.dust(p.x, 0.1, p.z, 3); }
      p.upPrev = upNow;
      if (play && p.stun <= 0 && inp.aP) p.aBuf = 0.25;
      // schot laden
      if (p.hold && play && G.state === 'play') {
        if (!p.charging && inp.aP && p.grabAge > 0.1 && p.stun <= 0) { p.charging = true; p.chargeT = 0; audio.sfx('select', { vol: 0.25, rate: 1.4 }); }
        if (p.charging) { p.chargeT += dt * sp; if (!inp.a || p.chargeT >= OVER_T) { const pw = clamp(p.chargeT / CHARGE_T, 0, 1.0); shoot(p, pw); } }
      } else if (p.charging) { p.charging = false; p.chargeT = 0; }
      // B: dunk / slag
      if (play && G.state === 'play' && p.stun <= 0 && inp.bP && p.swingCd <= 0) {
        if (p.hold) {
          const dxa = Math.abs(hoopX(p.i) - p.x);
          if (dxa < 3.9) startDunk(p); else { p.fake = 0.3; p.swingCd = 0.5; audio.sfx('swing', { vol: 0.2, rate: 1.6 }); }
        } else { p.swing = 0.3; p.swingCd = 0.8; p.stealChecked = false; audio.sfx('swing', { vol: 0.4 }); p.c.swing(); }
      }
      if (p.fake > 0) p.fake = Math.max(0, p.fake - dt);
      if (p.dunk) return;
      // slag: stelen / blokkeren
      if (p.swing > 0 && G.state === 'play') {
        if (!p.stealChecked && o.hold && !o.dunk && Math.abs(o.x - p.x) < 2.1 * Math.max(p.s, o.s) && Math.abs(o.y - p.y) < 2.6) stealTry(p, o);
        if (b.state === 'flight' && b.shooter !== p.i && b.t < 1.1 && !b.rimHit && !b.boardHit) { const hx = p.x + p.face * 0.4 * S, hy = p.y + 2.0 * S; if (Math.hypot(b.x - hx, b.y - hy) < 1.3 * S + b.r) blockBall(p, b); }
      }
      // fysica
      if (mx > 0.3) p.face = 1; else if (mx < -0.3) p.face = -1; else if (p.hold) p.face = p.dir;
      p.vy -= GP * GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, -PLX, PLX);
      p.apex = !p.grounded && Math.abs(p.vy) < 3.2;
      if (p.y <= 0) { if (!p.grounded && p.vy < -6) { audio.sfx('land', { vol: clamp(-p.vy / 24, 0.1, 0.4) }); fx.particles.dust(p.x, 0.1, p.z, 3); p.c.squash = 0.15; } p.y = 0; p.vy = 0; p.grounded = true; }
      if (p.boots > 0 && Math.random() < dt * 40) fx.particles.emit(p.x + rand(-0.3, 0.3), p.y + 0.15, p.z, rand(-1, 1), -rand(2, 4), rand(-0.3, 0.3), { life: 0.35, size: 0.5, color: Math.random() < 0.5 ? 0xffa020 : 0xffe9a0, gravity: -1 });
    }
    function bumpPlayers() {
      const a = pl[0], c = pl[1]; if (a.dunk || c.dunk) return; const dx = c.x - a.x, mm = (a.s + c.s) * 0.5; if (Math.abs(dx) < 0.95 * mm && Math.abs(c.y - a.y) < 1.7 * mm) {
        const ov = (0.95 * mm - Math.abs(dx)) / 2, sg = Math.sign(dx) || (a.i ? 1 : -1); a.x -= sg * ov; c.x += sg * ov; a.x = clamp(a.x, -PLX, PLX); c.x = clamp(c.x, -PLX, PLX);
        const rv = Math.abs(a.vx - c.vx); if (rv > 9 && a.bumpCd <= 0) { a.bumpCd = c.bumpCd = 0.4; audio.sfx('thud', { vol: 0.4, rate: 1.3 }); fx.particles.burst((a.x + c.x) / 2, 1.5, 0, { count: 8, speed: 3, up: 1, life: 0.4, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 4 }); for (const q of [a, c]) if (q.boots > 0 && q.stun <= 0) { const w = pl[1 - q.i]; if (w.boots <= 0) { w.stun = 0.5; w.vx += (w.x - q.x) * 3; } } }
      }
    }
    function grabTry(p) {
      if (b.state !== 'free' && b.state !== 'flight') return; if (G.state !== 'play') return; if (p.grabCd > 0 || p.stun > 0 || p.aBuf <= 0 || p.dunk || p.hold) return;
      if (b.state === 'flight' && (b.shooter === p.i ? b.t < 0.6 : (b.vy > 0 && !b.rimHit && !b.boardHit))) return;
      const S = p.s, reach = (1.25 + b.r) * S + 0.35; if (Math.abs(b.x - p.x) > reach) return; if (b.y < p.y - 0.3 || b.y > p.y + 3.0 * S) return;
      if (b.state === 'flight' && Math.hypot(b.x - hoopX(p.i), b.y - rimY()) < 1.3 && b.vy < 0) return;     // niet uit de ring plukken
      const was = b.state; giveBall(p); fx.particles.burst(b.x, b.y, 0, { count: 8, speed: 3, up: 0.8, life: 0.4, size: 0.3, colors: [0xffffff, 0xffe14a], gravity: 3 }); audio.sfx('click', { vol: 0.5, rate: 1.3 });
      if (was === 'flight') fx.texts.add('REBOUND!', p.x, p.y + 4.3 * S, 0, CSS[p.i], 1.2);
    }

    // ---------------- bal-natuurkunde ----------------
    function rimHitPt(px, py) {
      const dx = b.x - px, dy = b.y - py, rr = b.r + RT, d2 = dx * dx + dy * dy; if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d; b.x = px + nx * rr; b.y = py + ny * rr; const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= (1 + 0.56) * vn * nx; b.vy -= (1 + 0.56) * vn * ny; b.vx *= 0.96; if (!b.rimHit || Math.abs(vn) > 3) { audio.sfx('hit', { vol: clamp(-vn / 14, 0.15, 0.7), rate: 1.7 }); audio.sfx('bell', { vol: clamp(-vn / 20, 0.05, 0.3), rate: 2.2 }); if (-vn > 3) fx.particles.burst(px, py, 0, { count: 6, speed: 3, up: 0.8, life: 0.35, size: 0.25, colors: [0xffffff, 0xffa040], gravity: 4 }); } b.rimHit = true; b.perfect = b.perfect && false; }
      return true;
    }
    function stepBall(h) {
      if (b.state === 'held') return;
      const g = GB * GRAV, py = b.y; b.prevY = py;
      b.x += b.vx * h; b.y += b.vy * h - 0.5 * g * h * h; b.vy -= g * h; b.t += h; b.spin += b.vx * h;
      if (b.y < b.r) { b.y = b.r; if (b.vy < 0) { const imp = -b.vy; b.vy = imp > 2.2 ? imp * 0.76 : 0; b.vx *= 0.97; if (b.state === 'flight') { b.t = Math.max(b.t, 1.2); } if (imp > 3) { audio.sfx('thud', { vol: clamp(imp / 22, 0.1, 0.5), rate: 1.2 + (b.giant > 0 ? -0.5 : 0) }); fx.particles.dust(b.x, 0.1, 0, 2, 0xb8b0c8); } } const f = Math.exp(-(b.state === 'dead' ? 2.2 : 0.7) * h); b.vx *= f; }
      if (Math.abs(b.x) > WALLX - b.r) { b.x = Math.sign(b.x) * (WALLX - b.r); b.vx *= -0.7; }
      if (b.y > 16) { b.y = 16; b.vy = -Math.abs(b.vy) * 0.3; }
      const ry = rimY();
      for (let k = 0; k < 2; k++) {
        const s = hs(k), face = s * (BB - 0.1);
        if (b.state !== 'dead') {
          if (s * b.x + b.r > s * face && s * b.x < s * face + 0.4 && b.y > ry - 0.5 && b.y < ry + 1.9 && s * b.vx > 0) { b.x = face - s * b.r; b.vx *= -0.62; b.boardHit = true; b.perfect = b.perfect && false; audio.sfx('thud', { vol: clamp(Math.abs(b.vx) / 14, 0.1, 0.5), rate: 1.8 }); fx.particles.burst(face, b.y, 0, { count: 5, speed: 3, up: 0.6, life: 0.3, size: 0.25, colors: [0xffffff, 0xaaddff], gravity: 3 }); }
          rimHitPt(s * (HX - RR), ry); rimHitPt(s * (HX + RR), ry);
        }
        // score: ring doorkruisen van boven naar beneden
        if (b.state !== 'dead' && b.state !== 'held' && G.state === 'play' && py > ry && b.y <= ry && b.vy < 0 && Math.abs(b.x - s * HX) < RR - 0.04 && (b.vx * s) > -6) {
          const pts = (b.state === 'flight' && b.shooter === k) ? b.pts : 2; const how = (b.state === 'flight' && b.shooter === k && pts === 3) ? 'three' : 'shot';
          if (!(b.state === 'flight' && b.shooter === k)) stats.tipins++;
          scoreBasket(k, pts, how);
        }
      }
      if (b.state === 'dead') { b.deadT += h; for (let k = 0; k < 2; k++) { const s = hs(k), dx = b.x - s * HX; if (Math.abs(dx) < RR && b.y < rimY() && b.y > rimY() - 1.4) { b.vx *= Math.exp(-6 * h); if (b.vy < -3) b.vy *= Math.exp(-4 * h); } } }
      // trampoline
      if (trampo && b.y <= b.r + 0.9 && b.vy < 0 && Math.abs(b.x - trampo.x) < 1.15 && b.state !== 'held') { b.vy = 17; audio.sfx('boing', { vol: 0.5 }); trampo.sq = 0.3; }
      // kip-bal hupt
      if (b.chick > 0 && b.state === 'free' && b.y <= b.r + 0.02) { b.hopT -= h; if (b.hopT <= 0) { b.hopT = rand(0.35, 0.8); b.vy = rand(6, 9); b.vx += (Math.random() < 0.5 ? -1 : 1) * rand(3, 6); audio.sfx('pop', { vol: 0.25, rate: 1.8 }); if (Math.random() < 0.4) fx.texts.add('TOK!', b.x, b.y + 1.5, 0, '#ffe9a0', 0.8); } }
    }
    function simBall(sdt) {
      if (b.state === 'held') return; const sp = Math.hypot(b.vx, b.vy), n = clamp(Math.ceil(sp * sdt / 0.11), 1, 14), h = sdt / n;
      for (let s = 0; s < n; s++) stepBall(h);
    }

    // ---------------- items / events ----------------
    function spawnItem() {
      const t = pick(ITEMS); const trail = score[0] === score[1] ? -1 : (score[0] < score[1] ? 0 : 1);
      let x = rand(-8, 8); if (trail >= 0 && Math.random() < 0.6) x = pl[trail].dir * rand(1, 8); const y = Math.random() < 0.5 ? 0.95 : 3.3;
      item = { type: t, x, y, t: 0, life: 11 }; itemG.visible = true; itemIcon.material.map = itemTex[t.id]; itemOrb.material.emissive.set(t.col);
      fx.particles.ring(x, y, 0, { count: 18, speed: 4, color: 0xffffff, size: 0.35, life: 0.6 }); audio.sfx('sparkle', { vol: 0.5 });
      if (!stats.itemTold) { stats.itemTold = true; hud.toast('✨ Een power-up! Raak hem aan', 1800); }
    }
    function removeItem(poof = true) { if (!item) return; if (poof) fx.particles.burst(item.x, item.y, 0, { count: 12, speed: 3, up: 1, life: 0.5, size: 0.3, colors: [0xffffff, 0xaaccff], gravity: 4 }); item = null; itemG.visible = false; }
    function takeItem(p) {
      const it = item.type; removeItem(false); itemT = rand(9, 13); stats.items++;
      fx.particles.burst(p.x, p.y + 1.5, 0, { count: 30, speed: 6, up: 1.3, life: 0.8, size: 0.45, colors: [0xffffff, 0xaaccff, 0xffe14a], gravity: 4 });
      fx.texts.add(it.name, p.x, p.y + 4.2 * p.s, 0, it.col, 1.5); hud.toast(`${names[p.i]} pakt een power-up: ${it.name}`, 1800); audio.sfx('powerup', { vol: 0.8 }); ctx.shake(0.2);
      if (it.id === 'boots') p.boots = 7.5;
      else if (it.id === 'giant') { b.giant = 10; hud.toast('🏀 REUZENBAL: alleen dunken telt (4 pnt)', 2400); }
      else { trampo = { x: clamp(p.x + p.dir * 3.2, -9.5, 9.5), life: 11, sq: 0 }; tramp.visible = true; tramp.position.set(trampo.x, 0, 0); fx.particles.ring(trampo.x, 0.4, 0, { count: 22, speed: 5, color: 0xffe14a, size: 0.4, life: 0.6 }); }
    }
    function startEvent() {
      const t = pick(['hoops', 'chick']);
      if (t === 'hoops') { EV.hoops = 12; hud.showBig('MANDEN OP DE LOOP!', 1200, '#ffd23f'); hud.toast('🎯 De manden schuiven op en neer!', 2000); audio.sfx('creak', { vol: 0.5, rate: 1.4 }); }
      else { EV.chick = 9; b.chick = 9; hud.showBig('KIP-BAL!', 1200, '#ffe9a0'); hud.toast('🐔 De bal is een kip! +1 bij scoren', 2200); audio.sfx('pop', { vol: 0.6, rate: 1.4 }); fx.particles.burst(b.x, b.y, 0, { count: 30, speed: 5, up: 1, life: 0.6, size: 0.45, colors: [0xffffff, 0xf6f1e4, 0xffd23f], gravity: 4 }); }
    }
    function updateRef(dt) {
      ref.t -= dt;
      if (ref.st === 'away' && ref.t <= 0) { ref.st = 'warn'; ref.t = 0.9; C.refLook = 0.5; audio.sfx('creak', { vol: 0.5, rate: 1.2 }); hud.toast('👁 De Deurman draait zich om...', 1000); }
      else if (ref.st === 'warn' && ref.t <= 0) { ref.st = 'look'; ref.t = rand(2.2, 3.0); C.refLook = 1; audio.sfx('static', { vol: 0.35 }); }
      else if (ref.st === 'look' && ref.t <= 0) { ref.st = 'away'; ref.t = rand(7, 11); C.refLook = 0; }
      C.refAlert = Math.max(0, C.refAlert - dt);
    }

    // ---------------- update ----------------
    function update(dt) {
      dt = Math.min(dt, 0.05); T += dt;
      if (!started) { started = true; tipOff(); refreshHud(); hud.toast('Eerste tot 21 of de meeste na 90 s!', 1800); }
      if (T > 420 && !finished && G.state !== 'end') endMatch(score[0] === score[1] ? (Math.random() < 0.5 ? 0 : 1) : (score[0] > score[1] ? 0 : 1));
      if (slowHold > 0) slowHold -= dt; else slow = damp(slow, 1, 3.5, dt);
      // slow-motion vlak voor de ring bij een schot dat telt
      if (b.state === 'flight' && G.state === 'play') { const k = b.shooter; if (k >= 0 && Math.hypot(b.x - hoopX(k), b.y - rimY()) < 2.0 && b.vy < 0) slow = Math.min(slow, 0.45); }
      const sdt = dt * slow; G.t += dt;
      punch = Math.max(0, punch - dt * 0.8); if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0) hud.setHint(null); }

      if (G.state === 'tip') {
        const prev = G.tipN; G.tipN = 3.0 - G.t * 1.7; const n = Math.ceil(G.tipN), pn = Math.ceil(prev); if (n !== pn && n >= 1 && n <= 3) { fx.texts.add(String(n), 0, 6.5, 0, '#ffe14a', 2.2); audio.sfx('countdown', { vol: 0.3, rate: 0.8 + (3 - n) * 0.2 }); }
        b.y = 5.2 + Math.sin(T * 4) * 0.2; b.x = 0; if (G.t >= 1.6) startPlay();
      }
      // klok
      if (G.state === 'play' || G.state === 'scored') {
        if (!G.sd) { G.timeLeft -= dt; hud.setTimer(Math.max(0, G.timeLeft), 15); if (Math.floor(G.timeLeft) !== lastSb) { lastSb = Math.floor(G.timeLeft); C.scoreboard(names, score, G.timeLeft, null); }
          if (G.timeLeft <= 15 && !G.comebackAnn) { G.comebackAnn = true; hud.showBig('LAATSTE 15 s!', 1300, '#ff7a6a'); hud.toast('🔥 Achterstaander scoort DUBBEL!', 2400); audio.sfx('bell', { vol: 0.6 }); }
          if (G.timeLeft <= 0 && !G.timeUp) { G.timeLeft = 0; G.timeUp = true; G.waitT = 0; audio.sfx('buzz', { vol: 0.8 }); audio.sfx('bell', { vol: 1 }); }
        } else { G.sdT += dt; hud.setTimer(null); if (G.sdT > 45 && !G.endDelay) { G.coin = true; hud.toast('De Deurman gooit een munt!', 1500); endMatch(Math.random() < 0.5 ? 0 : 1); } }
        if (G.timeUp && G.state !== 'end') {
          G.waitT += dt; const busy = (b.state === 'flight' && G.waitT < 2.6) || pl.some((p) => p.dunk) || G.state === 'scored';
          if (!busy) { G.timeUp = false; if (score[0] !== score[1]) { hud.showBig('TIJD!', 1100, '#ffd23f'); endMatch(score[0] > score[1] ? 0 : 1); } else { G.sd = true; G.sdT = 0; G.state = 'tip'; G.t = 0; G.tipN = 4; tipOff(); hud.showBig('GOUDEN MAND!', 1500, '#ffd23f'); hud.toast('Gelijkspel! De eerste mand wint', 2200); refreshHud(); } }
        }
      }
      if (G.state === 'play' || G.state === 'scored' || G.state === 'tip') {
        // gimmicks
        if (G.state === 'play') {
          evT -= dt; if (evT <= 0) { evT = rand(15, 22); startEvent(); }
          if (item) { item.t += dt; item.life -= dt; for (const p of pl) if (p.stun <= 0 && Math.abs(p.x - item.x) < 1.3 * p.s && item.y > p.y - 0.8 && item.y < p.y + 3.4 * p.s) { takeItem(p); break; } if (item && item.life <= 0) { removeItem(); itemT = rand(7, 10); } }
          else { itemT -= dt; if (itemT <= 0) spawnItem(); }
          updateRef(dt);
        }
        if (EV.hoops > 0) { EV.hoops -= dt; const amp = clamp(Math.min(EV.hoops, 12 - EV.hoops) / 1.2, 0, 1) * 0.95; C.setHoopOff(Math.sin(T * 1.8) * amp); } else if (C.hoopOff !== 0) C.setHoopOff(damp(C.hoopOff, 0, 6, dt));
        if (EV.chick > 0) { EV.chick -= dt; b.chick = Math.max(b.chick, EV.chick); if (EV.chick <= 0) { b.chick = 0; fx.particles.burst(b.x, b.y, 0, { count: 20, speed: 4, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xff9a3a], gravity: 3 }); audio.sfx('pop', { vol: 0.5 }); } }
        if (b.giant > 0) { b.giant -= dt; if (b.giant <= 0) { audio.sfx('pop', { vol: 0.5, rate: 0.6 }); } }
        b.r = damp(b.r, b.giant > 0 ? BR * 1.95 : BR, 8, dt);
        if (trampo) { trampo.life -= dt; trampo.sq = Math.max(0, trampo.sq - dt); if (trampo.life <= 0) { tramp.visible = false; trampo = null; } }
        // spelers
        const order = Math.floor(T * 60) % 2 ? [0, 1] : [1, 0];
        for (const i of order) stepPlayer(pl[i], Math.max(sdt, dt * 0.35));
        for (const p of pl) { if (trampo && p.grounded === true && p.trampCd <= 0 && Math.abs(p.x - trampo.x) < 1.15 && p.y <= 0.05 && !p.dunk) { p.vy = TRAMP_V; p.grounded = false; p.y = 0.1; p.trampCd = 0.6; trampo.sq = 0.35; audio.sfx('boing', { vol: 0.8, rate: 0.8 }); ctx.shake(0.2); fx.particles.ring(p.x, 0.5, p.z, { count: 16, speed: 5, color: 0xffe14a, size: 0.35, life: 0.5 }); fx.texts.add('BOING!', p.x, 2.5, 0, '#ffe14a', 1.2); } }
        bumpPlayers();
        for (const i of order) grabTry(pl[i]);
        // vasthouden: bal volgt de speler
        if (b.state === 'held') { const p = pl[b.holder]; if (p) { holdPos(p, hp); b.x = hp.x; b.y = hp.y; b.vx = p.vx; b.vy = 0; p.heldT = 0; b.heldT += dt; p.sc -= dt * (G.state === 'play' ? 1 : 0); const sc = Math.ceil(p.sc); if (p.sc <= 3 && sc !== p.lastTick && sc >= 1) { p.lastTick = sc; audio.sfx('tick', { vol: 0.35, rate: 1.1 + (3 - sc) * 0.1 }); } if (p.sc <= 0 && G.state === 'play' && !p.dunk) violation(p);
          if (b.chick > 0 && b.heldT > 2.8 && !p.dunk && G.state === 'play') { fx.texts.add('AU! KIP PIKT!', p.x, p.y + 4.2 * p.s, 0, '#ffe9a0', 1.3); audio.sfx('hurt', { vol: 0.5 }); p.stun = 0.4; dropBall(p.face * 3, 7); b.hopT = 0.5; } } }
        else simBall(sdt);
        if (G.state === 'scored') { if (G.endDelay > 0) { G.endDelay -= dt; if (G.endDelay <= 0) { endMatch(G.pendingWin); G.endDelay = 0; } } else if (G.t > 1.6 && G.state === 'scored') { G.pendingWin = undefined; inbound(1 - G.lastScorer); } }
        else if (G.endDelay > 0 && G.state === 'play') { G.endDelay -= dt; if (G.endDelay <= 0) { endMatch(G.pendingWin); G.endDelay = 0; } }
      } else if (G.state === 'end') {
        for (const p of pl) p.c.pose = p.mood === 'cheer' ? 'cheer' : 'sad';
        simBall(sdt); if (G.t > 2.4 && !finished) finishMatch(G.winner);
      }
      visuals(dt);
    }

    // ---------------- visuals ----------------
    function layoutOverlay() {
      const asp = camera.aspect || 1.7, hh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), ww = hh * asp, mw = ww * 0.2, mhh = hh * 0.04, z = -1;
      for (const p of pl) {
        const m = meters[p.i], vis = G.state === 'play' && p.hold && !p.dunk; const all = [m.frame, m.fill, m.good, m.perf, m.mark, m.apex, m.lab]; for (const q of all) q.visible = vis; if (!vis) continue;
        const cx = (p.i ? 1 : -1) * ww * 0.35, my = -hh * 0.42, id = idealOf(p), ch = clamp(p.chargeT / CHARGE_T, 0, 1.3);
        m.frame.scale.set(mw + hh * 0.012, mhh + hh * 0.012, 1); m.frame.position.set(cx, my, z); m.fill.scale.set(mw, mhh, 1); m.fill.position.set(cx, my, z);
        m.good.scale.set(mw * 0.4, mhh * 0.7, 1); m.good.position.set(cx + (id - 0.5) * mw, my, z); m.perf.scale.set(mw * 0.15, mhh * 0.7, 1); m.perf.position.set(cx + (id - 0.5) * mw, my, z); m.perf.material.color.set(p.apex ? 0x7dff9a : 0x3ac86a);
        m.mark.scale.set(hh * 0.01, mhh * 1.4, 1); m.mark.position.set(cx + (Math.min(ch, 1.05) - 0.5) * mw, my, z); m.mark.material.color.set(ch > 1 ? 0xff6a4a : 0xffffff); m.mark.visible = vis && p.charging;
        m.apex.scale.set(hh * 0.035, hh * 0.035, 1); m.apex.position.set(cx + mw / 2 + hh * 0.04, my, z); m.apex.material.color.set(p.apex ? 0x7dff9a : (!p.grounded ? 0xe8c83a : 0x555566));
        m.lab.scale.set(hh * 0.13, hh * 0.05, 1); m.lab.position.set(cx - mw / 2 + hh * 0.05, my + hh * 0.045, z);
      }
    }
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * asp;
      const D = clamp(12.6 / tanH, 17, 32); camD = damp(camD, D * (1 - punch * 0.1), 3, dt);
      camX = damp(camX, clamp(b.x * 0.1, -1.2, 1.2), 2, dt); const sway = Math.sin((T + introT) * 0.25) * 0.4;
      camera.position.set(camX + sway, 5.3 + punch * 0.4, camD); camera.lookAt(camX * 0.8, 3.2, 0);
    }
    function visuals(dt) {
      const tt = T + introT;
      // spelers
      for (const p of pl) {
        const S = p.s, c = p.c, pos = c.group.position;
        pos.set(p.x, p.y, p.z); c.faceDir(p.face, 0); c.speed = p.grounded && !p.dunk ? clamp(Math.abs(p.vx) / MOVE_V, 0, 1) : 0; c.air = !p.grounded;
        c.pose = p.stun > 0 ? 'sad' : p.mood === 'cheer' ? 'cheer' : p.mood === 'sad' && G.state !== 'play' ? 'sad' : p.dunk ? 'hands_up' : p.hold ? (p.charging || p.fake > 0 ? 'hands_up' : 'carry') : p.swing > 0 ? 'hands_up' : 'idle';
        c.update(dt); for (const g of p.bootG) { g.visible = p.boots > 0; if (g.visible) g.children[1].scale.y = 0.8 + Math.random() * 0.6; }
        p.shadow.position.set(p.x, 0.04, p.z); p.shadow.scale.setScalar(S * (1.2 - Math.min(p.y, 5) * 0.08)); p.shadow.material.opacity = clamp(0.8 - p.y * 0.08, 0.25, 0.8);
        p.tag.position.set(p.x, p.y + 3.55 * S, p.z + 0.3); p.tag.scale.set(2.2, 0.82, 1);
        const showClk = p.hold && p.sc <= 4 && G.state === 'play'; p.clk.visible = showClk; if (showClk) { p.clk.position.set(p.x, p.y + 4.7 * S, p.z + 0.3); p.clk.material.map = clockTex[clamp(Math.ceil(p.sc), 0, 8)]; p.clk.material.opacity = 0.6 + Math.sin(tt * 14) * 0.4; }
        { const ph = Math.abs(Math.sin(tt * 9 + p.i * 1.7)); if (p.hold && p.grounded && !p.charging && G.state === 'play' && (p.dribPh ?? 1) > 0.2 && ph <= 0.2) audio.sfx('thud', { vol: 0.06, rate: 2.2 }); p.dribPh = ph; }
        refreshInfo(p);
      }
      // bal
      const held = b.state === 'held' && b.holder >= 0;
      const isChick = b.chick > 0;
      ballM.visible = !isChick; chick_(isChick);
      ballM.position.set(b.x, b.y, held ? pl[b.holder].z : 0); ballM.scale.setScalar(b.r);
      if (!held) { ballM.rotation.z -= b.vx * dt / b.r * 0.8; ballM.rotation.x += 0; } else ballM.rotation.z += pl[b.holder].vx * dt * 0.5;
      ballShadow.position.set(b.x, 0.04, held ? pl[b.holder].z : 0); ballShadow.scale.setScalar(b.r * 2.2 * clamp(1 - (b.y - b.r) / 9, 0.3, 1)); ballShadow.material.opacity = 0.75;
      if (b.state === 'flight' && b.perfect && Math.random() < dt * 40) fx.particles.emit(b.x, b.y, 0, 0, 0, 0, { life: 0.4, size: 0.35, color: 0x7dff9a, gravity: 0 });
      else if (b.state === 'flight' && Math.hypot(b.vx, b.vy) > 8 && Math.random() < dt * 25) fx.particles.emit(b.x, b.y, 0, 0, 0, 0, { life: 0.3, size: 0.25, color: 0xffd8a0, gravity: 0 });
      if (b.giant > 0 && Math.random() < dt * 12) fx.particles.emit(b.x + rand(-1, 1), b.y + rand(-1, 1), 0, 0, 1, 0, { life: 0.5, size: 0.4, color: 0xffb24a, gravity: -1 });
      // item / trampoline
      if (item) { itemG.position.set(item.x, item.y + Math.sin(item.t * 3) * 0.2, 0); itemOrb.rotation.y += dt * 2; itemG.visible = item.life > 3 || Math.sin(item.life * 18) > 0; if (Math.random() < dt * 8) fx.particles.emit(item.x + rand(-0.6, 0.6), item.y + rand(-0.6, 0.6), 0, 0, 0.8, 0, { life: 0.7, size: 0.25, color: 0xcfe8ff, gravity: -0.5 }); }
      if (trampo) { const sq = trampo.sq > 0 ? 1 - Math.sin(trampo.sq / 0.35 * Math.PI) * 0.3 : 1; tramp.scale.set(1, sq, 1); tramp.userData.star.rotation.z += dt * 2; tramp.visible = trampo.life > 2 || Math.sin(trampo.life * 18) > 0; }
      C.update(tt, dt); layoutOverlay(); updateCamera(dt);
    }
    // kip-bal: een Animal op de plek van de bal
    function chick_(on) {
      chick.group.visible = on; if (!on) return; const held = b.state === 'held' && b.holder >= 0, sp = Math.hypot(b.vx, b.vy);
      chick.group.scale.setScalar(b.r * 2.6); chick.group.position.set(b.x, b.y - b.r * 0.9, held ? pl[b.holder].z : 0); chick.targetYaw = (b.vx || 1) > 0 ? Math.PI / 2 : -Math.PI / 2; chick.speed = 1; chick.update(0.016);
      chick.group.rotation.z = Math.sin(T * 20) * 0.25; chick.group.rotation.x = clamp(-b.vy * 0.02, -0.4, 0.4);
    }
    function resultUpdate(dt) { T += dt; slow = 1; for (const p of pl) { p.c.pose = p.mood === 'cheer' ? 'cheer' : 'sad'; p.c.speed = 0; p.c.update(dt); p.c.group.position.set(p.x, p.mood === 'cheer' ? Math.abs(Math.sin(T * 7)) * 0.5 : 0, p.z); } C.update(T + introT, dt); layoutOverlay(); updateCamera(dt); }
    function introUpdate(dt) { introT += dt; for (const p of pl) { p.x = -p.dir * 3.2; p.c.pose = 'idle'; } visuals(dt); }
    refreshHud(); visuals(0.016);

    return {
      update: (dt) => { if (finished) { resultUpdate(dt); return; } update(dt); },
      resultUpdate, introUpdate,
      onSwap() { for (const p of pl) fx.particles.burst(p.x, p.y + 1.2, p.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m) { const p = pl[i]; if (score[i] > 0) { score[i]--; refreshHud(); } fx.texts.add('BEWOGEN!', p.x, p.y + 4.2, 0, '#9fe8ff', 1.4); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); } });
      },
      celebrate(w) { pl[w].mood = 'cheer'; pl[1 - w].mood = 'sad'; C.cheer(6); },
      dispose() { hud.setHint(null); },
      dbg: {
        state: () => ({ T, gstate: G.state, timeLeft: G.timeLeft, sd: G.sd, sdT: G.sdT, score: [...score], finished, slow, ref: ref.st, ev: { hoops: EV.hoops, chick: EV.chick }, hoopOff: C.hoopOff, stats,
          ball: { state: b.state, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, holder: b.holder, shooter: b.shooter, t: b.t, giant: b.giant, chick: b.chick, perfect: b.perfect, from: b.from },
          players: pl.map((p) => ({ i: p.i, dir: p.dir, x: p.x, y: p.y, vx: p.vx, vy: p.vy, hold: p.hold, charging: p.charging, chargeT: p.chargeT, ideal: idealOf(p), sc: p.sc, stun: p.stun, boots: p.boots, dunk: !!p.dunk, grounded: p.grounded, swingCd: p.swingCd, apex: p.apex, grabAge: p.grabAge, s: p.s })),
          item: item ? { id: item.type.id, x: item.x, y: item.y } : null, tramp: trampo ? { x: trampo.x } : null }),
        setScore: (a, c) => { score[0] = a; score[1] = c; refreshHud(); }, setTime: (t) => { G.timeLeft = t; },
        giveBall: (i) => { giveBall(pl[i]); }, setPlayer: (i, x, y) => { pl[i].x = x; pl[i].y = y; pl[i].vx = pl[i].vy = 0; }, setBall: (x, y, vx, vy) => { if (b.state === 'held') { const p = pl[b.holder]; p.hold = false; } b.state = 'free'; b.holder = -1; b.x = x; b.y = y; b.vx = vx; b.vy = vy; },
        spawnItem: () => spawnItem(), giveItem: (id, i) => { item = { type: ITEMS.find((t) => t.id === id), x: pl[i].x, y: pl[i].y + 1, t: 0, life: 9 }; takeItem(pl[i]); }, event: (t) => { if (t === 'hoops') { EV.hoops = 12; } else { EV.chick = 9; b.chick = 9; } }, ref: (st) => { ref.st = st; C.refLook = st === 'look' ? 1 : st === 'warn' ? 0.5 : 0; ref.t = 9; },
        shootNow: (i, power) => { const p = pl[i]; if (b.state === 'held' && b.holder === i) shoot(p, power); }, dunkNow: (i) => { const p = pl[i]; if (b.state === 'held' && b.holder === i) startDunk(p); }, b, G, pl,
      },
    };
  },
};

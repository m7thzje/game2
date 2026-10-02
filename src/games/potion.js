import * as THREE from 'three';
import { clamp, lerp, damp, rand, TAU, mat, mesh } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { buildHut, makeHendrika, ING, PED_POS } from './potion_hut.js';

// Toverdrank Memory (Simon Says voor twee): Heks Hendrika toont een reeks ingrediënten,
// Wes en Jor herhalen die om en om. Vanaf reeks 5 zijn er gouden "dubbele" stappen.

const MAX_LEN = 12, START_LEN = 2, LIVES = 3, REPLAYS = 2, DBL_FROM = 5, DBL_WIN = 0.9;
const DIRS = ['up', 'left', 'right', 'down'];
const GOLD = 0xffd24a;
const starsFor = (n) => (n >= 12 ? 3 : n >= 9 ? 2 : n >= 6 ? 1 : 0);

const pickOf = (a) => a[Math.floor(Math.random() * a.length)];
const SAY = {
  hello: ['Welkom in mijn hut, jongens! Onthoud de reeks en herhaal hem om en om.', 'Hihihi, nieuwe leerlingen! Onthoud de volgorde goed!'],
  look: ['Kijk goed... en luister naar de tonen!', 'Let op mijn ingrediënten!', 'Oogjes open, jongens!'],
  go: ['Nu jullie! Om en om, hè!', 'Jullie beurt! Denk aan de volgorde...', 'Toe maar, tovenaarsleerlingen!'],
  good: ['Prachtig! De drank borrelt al!', 'Hihihi, zo hoort het!', 'Mijn spinnen zijn onder de indruk!', 'Wat een talent! Bijna een heks!', 'Mmm, die geur! Perfect!'],
  err: ['Auw! Mijn ketel hoest!', 'Verkeerd ingrediënt! Brrr, rook!', 'Pas op mijn drank!', 'Hoest! Dat was niet de bedoeling...'],
  stir: ['Roeren, roeren! Anders kookt hij over!', 'Snel, de drank wordt onrustig! Allebei roeren!'],
};

export default {
  id: 'potion',
  name: 'Toverdrank Memory',
  giver: 'Heks Hendrika',
  icon: '🧪',
  mode: 'puzzle',
  pay: 1.1,
  music: 'puzzle',
  blurb: 'Hendrika toont een reeks <b>ingrediënten</b> die oplichten. Herhaal de reeks <b>om en om</b>: Wes de eerste stap, Jor de tweede... Een <b>gouden stap</b> doen jullie <b>tegelijk</b>! Roer de drank tussen de rondes. Drie levens!',
  controls: ['{move} ingrediënt kiezen (zelfde richting)', '{a} roeren', '{b} reeks nog eens bekijken (2x)'],
  tip: 'Reeks 6, 9 en 12 geven 1, 2 en 3 sterren. Een pijl boven je hoofd = jouw beurt.',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const L = ctx.lights('indoor', { shadow: 16, center: [0, 0, 0] });
    L.sun.intensity = 0.55; L.sun.color.set(0xc0a8ff); L.hemi.intensity = 0.95; L.hemi.color.set(0xb8a0ff); L.hemi.groundColor.set(0x4a3040);
    scene.background = new THREE.Color(0x120a1c);
    scene.fog = new THREE.Fog(0x120a1c, 38, 80);

    const hut = buildHut(scene, fx);
    const peds = hut.pedestals;

    // ---- camera
    function fit() { const asp = camera.aspect || 1.7; camera.fov = Math.min(76, (2 * Math.atan(Math.max(0.466, 0.466 * 1.7 / asp)) * 180) / Math.PI); camera.updateProjectionMatrix(); }
    fit();
    const camBase = new THREE.Vector3(0, 10.6, 13.4), camLook = new THREE.Vector3(0, 1.9, -0.6);
    camera.position.copy(camBase); camera.lookAt(camLook);

    // ---- personages
    const pl = players.map((p, i) => {
      const c = makeBrother(i); c.group.position.set(i ? 6.3 : -6.3, 0, 5.8); c.faceDir(i ? -0.55 : 0.55, 1); scene.add(c.group);
      const ring = mesh(new THREE.TorusGeometry(1.0, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.45 }), { cast: false, receive: false, pos: [c.group.position.x, 0.08, c.group.position.z], rot: [Math.PI / 2, 0, 0] }); scene.add(ring);
      const arrow = new THREE.Group(); arrow.position.set(c.group.position.x, c.height + 0.7, c.group.position.z);
      arrow.add(mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i] }), { cast: false, receive: false, scale: [1, 1.5, 1] }));
      arrow.visible = false; scene.add(arrow);
      return { c, ring, arrow, pose: 'idle', poseT: 0, warnT: 0, glow: 0, stir: 0, x: c.group.position.x, z: c.group.position.z };
    });
    const hen = makeHendrika(); hen.group.position.set(-9.3, 0, -1.6); hen.faceDir(0.6, 1); scene.add(hen.group);
    let henPose = 'wave', henPoseT = 2;
    const setHen = (p, t = 1.4) => { henPose = p; henPoseT = t; };

    // ---- kralen (volgorde-tracker boven de ketel)
    const beads = [];
    for (let i = 0; i < MAX_LEN; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.3 });
      const b = new THREE.Group(); const core = mesh(new THREE.SphereGeometry(0.3, 12, 9), m, { cast: false, receive: false }); b.add(core);
      const rm = new THREE.MeshBasicMaterial({ color: GOLD });
      const r = mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), rm, { cast: false, receive: false }); r.visible = false; b.add(r);
      const ring2 = mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), rm, { cast: false, receive: false, rot: [Math.PI / 2, 0, 0] }); ring2.visible = false; b.add(ring2);
      b.visible = false; scene.add(b);
      beads.push({ g: b, m, r, ring2, state: 'todo', flash: 0, dbl: false, owner: 0, x: 0 });
    }

    // ---- spelstatus
    let phase = 'wait', pt = 0, done = false, t = 0;
    let lives = LIVES, replays = REPLAYS, len = START_LEN, best = 0, errors = 0, doubles = 0;
    let seq = []; let idx = 0, pending = null, idleT = 0, showT = 0, showK = -1, stirNeed = 3, stirKick = 0, errPlayer = -1;
    let swapOff = 0, lastSwap = 0, sayT = 0, bannerT = 0;
    const markT = [0, 0, 0, 0];

    const owner = (i) => (i + swapOff) % 2;
    const swapFor = (n) => Math.floor((n - 1) / 3) % 2;
    const nm = (i) => players[i].name;
    function newStep() {
      const dbl = len >= DBL_FROM && seq.length === DBL_FROM - 1 ? true : len >= DBL_FROM && ctx.rng() < 0.35;
      seq.push({ dir: Math.floor(ctx.rng() * 4), dbl });
    }
    for (let i = 0; i < START_LEN; i++) newStep();
    swapOff = swapFor(len); lastSwap = swapOff;

    function say(txt, ms = 0) { sayT = ms; hud.setHint(`🧙‍♀️ <b>Hendrika:</b> “${txt}”`); }
    function sayRand(k) { say(pickOf(SAY[k])); }
    function updateHud() {
      hud.setScore(`${'❤️'.repeat(lives)}${'🖤'.repeat(LIVES - lives)}   Reeks ${len} / ${MAX_LEN}`);
    }
    function pinfo(a, b) { hud.setPlayerInfo(0, a); hud.setPlayerInfo(1, b); }

    function layoutBeads() {
      const sp = Math.min(1.12, 11.8 / len);
      beads.forEach((b, k) => {
        b.g.visible = k < len;
        if (k >= len) return;
        const st = seq[k]; b.dbl = st.dbl; b.owner = owner(k);
        b.x = (k - (len - 1) / 2) * sp;
        const col = st.dbl ? GOLD : PLAYER_COLORS[b.owner];
        b.m.color.setHex(col); b.m.emissive.setHex(col);
        b.r.visible = b.ring2.visible = st.dbl;
        b.g.scale.setScalar(Math.min(1, sp / 0.95 + 0.15) * (st.dbl ? 1.15 : 1));
        b.g.position.set(b.x, 6.15 - (b.x / 8) * (b.x / 8) * 0.5, -1.4);
      });
    }
    function setBeads(state) { beads.forEach((b, k) => { b.state = state; b.flash = 0; }); }

    // ---- effecten
    function tone(dir, dur = 0.5, vol = 0.38, dbl = false) {
      const f = ING[dir].freq;
      audio.tone(f, dur, { type: 'triangle', vol, send: 0.35 });
      audio.tone(f * 2, dur * 0.6, { type: 'sine', vol: vol * 0.3, send: 0.3 });
      if (dbl) audio.tone(f * 1.5, dur, { type: 'triangle', vol: vol * 0.7, send: 0.3 });
    }
    function sparkToPot(dir, n = 12) {
      const p = peds[dir]; const life = 0.75;
      for (let i = 0; i < n; i++) fx.particles.emit(p.x + rand(-0.3, 0.3), 3.0, p.z + rand(-0.3, 0.3), (-p.x + rand(-0.4, 0.4)) / life, (2.8 - 3.0) / life + rand(0.6, 2.2), (-p.z + rand(-0.4, 0.4)) / life, { life: life * rand(0.8, 1.1), size: rand(0.2, 0.4), color: i % 3 ? ING[dir].color : 0xffffff, gravity: 0 });
    }
    function flashPed(dir, dur, who, dbl) {
      const p = peds[dir]; p.hold = dur;
      tone(dir, Math.max(0.35, dur * 1.1), 0.4, dbl);
      fx.particles.burst(p.x, 3.0, p.z, { count: 14, speed: 3, size: 0.28, color: ING[dir].color, colors: [ING[dir].color, 0xffffff], life: 0.7, gravity: 3 });
      fx.particles.ring(p.x, 1.7, p.z, { count: 16, speed: 3.2, size: 0.22, color: ING[dir].color, life: 0.5 });
      sparkToPot(dir, 8);
      hut.setTint(ING[dir].color, dur * 0.9); hut.owlLook = p.x / 5.5;
      p.markColors = dbl ? [PLAYER_COLORS[0], PLAYER_COLORS[1]] : [PLAYER_COLORS[who]]; p.markT = 0; markT[dir] = dur + 0.1;
      for (const i of dbl ? [0, 1] : [who]) { pl[i].c.jump(); pl[i].glow = dur + 0.15; }
    }

    function startShow(lead = 0.9) { phase = 'show'; pt = 0; showT = -lead; showK = -1; setBeads('todo'); layoutBeads(); pinfo('Kijk goed...', 'Kijk goed...'); sayRand('look'); setHen('point', 99); }
    function showTimings() { const prog = (len - START_LEN) / (MAX_LEN - START_LEN); const spd = 1 + 0.15 * (ctx.difficulty - 1); const on = lerp(0.62, 0.36, prog) / spd; return { on, gap: on * 0.5 }; }

    function startInput() {
      phase = 'input'; pt = 0; idx = 0; pending = null; idleT = 0; setBeads('todo'); layoutBeads();
      sayRand('go'); setHen('idle', 1); audio.sfx('ding', { vol: 0.5 });
      fx.texts.add('Jullie beurt!', 0, 8.3, -1.5, '#9affc0', 1.2);
      updateTurn();
    }
    function updateTurn() {
      const s = seq[idx];
      for (let i = 0; i < 2; i++) {
        const mine = s.dbl || owner(idx) === i;
        pl[i].arrow.visible = mine && phase === 'input';
        if (phase !== 'input') continue;
        hud.setPlayerInfo(i, s.dbl ? 'Samen met je broer!' : mine ? 'Jouw beurt!' : 'Wacht...');
      }
    }

    function dirOf(p) { return p.upP ? 0 : p.leftP ? 1 : p.rightP ? 2 : p.downP ? 3 : -1; }

    function stepOk(who, dir) {
      const s = seq[idx]; const b = beads[idx];
      flashPed(dir, 0.3, who, s.dbl);
      b.state = 'done'; b.flash = 1;
      fx.texts.add(s.dbl ? 'Samen! ✨' : '✓', peds[dir].x, 4.4, peds[dir].z, s.dbl ? '#ffd24a' : '#9affc0', 0.9);
      audio.sfx('pop', { vol: 0.3, rate: 1 + idx * 0.04 });
      idx++; pending = null; idleT = 0;
      if (idx >= len) roundDone(); else updateTurn();
    }

    function fail(why, who = -1) {
      if (phase !== 'input') return;
      lives--; errors++; pending = null; errPlayer = who;
      updateHud();
      hut.cough(); hut.heave = 0.8; hut.setTint(0xff3a2a, 0.9);
      ctx.shake(0.55);
      audio.sfx('hurt', { vol: 0.8 });
      audio.tone(130, 0.55, { type: 'sawtooth', vol: 0.3, slide: 55, filter: 700 });
      audio.noise(0.6, { freq: 1100, freq2: 150, vol: 0.5 });
      for (let k = 0; k < 4; k++) fx.particles.burst((Math.random() - 0.5) * 2, 3 + k * 0.4, (Math.random() - 0.5) * 2, { count: 14, speed: 2.5, up: 2.2, spread: 0.7, size: 1.5, life: 1.8, colors: [0x2a2630, 0x3a3640, 0x55505c, 0x1a1620], gravity: -1.2 });
      fx.texts.add(why, 0, 6.2, 0, '#ff6a5a', 1.3);
      pl.forEach((p) => { p.arrow.visible = false; p.pose = 'scared'; p.poseT = 1.4; });
      setHen('scared', 1.6); hut.owlLook = 0;
      if (lives <= 0) {
        say(pickOf(['Neeeee, mijn drank! Alles is mislukt...', 'Boem! Die ketel is toch te heet geworden...']));
        phase = 'lost'; pt = 0; pinfo('Mislukt...', 'Mislukt...');
      } else {
        say(`${pickOf(SAY.err)} ${lives === 1 ? 'Nog maar één leven over!' : ''}`);
        phase = 'err'; pt = 0; pinfo('Ketel hoest!', 'Ketel hoest!');
      }
    }

    function roundDone() {
      best = len; phase = 'ok'; pt = 0;
      pl.forEach((p) => { p.arrow.visible = false; p.pose = 'cheer'; p.poseT = 1.1; });
      setHen('cheer', 1.4);
      audio.sfx('good'); audio.sfx('sparkle', { vol: 0.6 });
      hut.setTint(0xffffff, 0.3);
      fx.particles.burst(0, 3.2, 0, { count: 26, speed: 4.5, up: 2, size: 0.3, colors: [0x6aff9a, 0xffd24a, 0xffffff, 0xb070ff], life: 1.0, gravity: 3 });
      let extra = '';
      if (len >= 6 && len % 3 === 0 && len < MAX_LEN && lives < LIVES) { lives++; extra = ' Een extra hartje van mij!'; audio.sfx('powerup', { vol: 0.5 }); fx.texts.add('+❤️', 0, 6.4, 0, '#ff7a9a', 1.3); }
      updateHud();
      if (len >= MAX_LEN) { win(); return; }
      say(pickOf(SAY.good) + extra);
      pinfo('Goed zo!', 'Goed zo!');
    }

    function startStir() {
      phase = 'stir'; pt = 0; stirNeed = len < 7 ? 3 : 4; stirKick = 0; pl.forEach((p) => { p.stir = 0; p.pose = 'idle'; });
      sayRand('stir'); hut.boil = 3; setHen('wave', 99);
      fx.texts.add('Roeren!', 0, 6.4, 0, '#ffd24a', 1.3);
      audio.sfx('sizzle', { vol: 0.4 });
      stirInfo();
    }
    function stirInfo() { for (let i = 0; i < 2; i++) hud.setPlayerInfo(i, pl[i].stir >= stirNeed ? 'Klaar! Wacht op je broer' : `Roeren: ${pl[i].stir}/${stirNeed}`); }

    function nextRound() {
      len++; newStep();
      swapOff = swapFor(len);
      let sw = null;
      if (len === DBL_FROM) { sw = 'dbl'; }
      if (swapOff !== lastSwap) { lastSwap = swapOff; sw = 'swap'; }
      hut.boil = 1;
      updateHud();
      startShow(sw ? 1.9 : 0.9);
      if (sw === 'dbl') { say('Pas op! Een <b>gouden stap</b> doen jullie <b>tegelijk</b>!'); ctx.hud.showBig('Gouden stappen!', 1500, '#ffd24a'); audio.sfx('powerup', { vol: 0.6 }); }
      else if (sw === 'swap') { say(`Wissel! Nu begint <b>${nm(owner(0))}</b>.`); ctx.hud.showBig('Wissel!', 1100, '#9ad8ff'); audio.sfx('whoosh'); }
    }

    function win() {
      phase = 'won'; pt = 0; done = true;
      pl.forEach((p) => { p.pose = 'cheer'; }); setHen('cheer', 99);
      say('Een perfecte drank! Jullie zijn echte tovenaarsleerlingen!');
      pinfo('Geweldig!', 'Geweldig!');
      hut.setTint(0xffffff, 1.2); audio.sfx('sparkle'); audio.sfx('powerup');
      for (let k = 0; k < 8; k++) setTimeout(() => { if (!ctx.playing && 0) return; fx.particles.burst(rand(-6, 6), rand(3, 8), rand(-4, 2), { count: 30, speed: 5, up: 1, size: 0.35, colors: [0xffd24a, 0x6aff9a, 0xff4f86, 0x58b8ff, 0xffffff], life: 1.3, gravity: 4 }); audio.sfx('pop', { rate: 0.8 + k * 0.1, vol: 0.4 }); }, k * 260);
      finish(3);
    }
    function lose() {
      done = true;
      pl.forEach((p) => { p.pose = 'sad'; }); setHen('scared', 99);
      hut.cough();
      finish(starsFor(best));
    }
    function finish(stars) {
      const sum = stars === 0 ? `De drank mislukte na <b>${best}</b> ingrediënten...<br>Hendrika zucht. Probeer het nog eens! (Reeks 6 geeft 1 ster.)` : best > 0 ? `Jullie brouwden een toverdrank met <b>${best}</b> ingrediënten in de goede volgorde${stars === 3 && errors === 0 ? ' — foutloos tot het einde' : ''}!<br>Fouten: ${errors} · ` + (stars === 3 ? 'Hendrika is door het dolle heen!' : stars > 0 ? 'Hendrika is tevreden.' : 'Hendrika is niet tevreden...') : 'De drank ging al bij het begin mis...';
      ctx.finish({ stars, score: best, summary: sum, delay: stars === 3 ? 2400 : 1400 });
    }

    // ---- invoer afhandelen
    function handleInput(dt) {
      idleT += dt;
      // reeks nog eens bekijken
      for (let i = 0; i < 2; i++) if (input.p[i].bP) {
        if (replays > 0) { replays--; fx.texts.add(`Nog ${replays}x`, 0, 6.6, 0, '#9ad8ff', 1); startShow(0.5); return; }
        pl[i].warnT = 0; audio.sfx('miss', { vol: 0.5 }); fx.texts.add('Geen meer!', pl[i].x, 3.6, pl[i].z, '#bbb', 0.9);
      }
      if (pending && t - pending.t > DBL_WIN) { fail('Tegelijk!'); return; }
      const s = seq[idx];
      for (let i = 0; i < 2; i++) {
        const d = dirOf(input.p[i]); if (d < 0) continue;
        if (s.dbl) {
          if (!pending) {
            if (d !== s.dir) { fail('Verkeerd!', i); return; }
            pending = { p: i, t, dir: d }; peds[d].hold = 0.25; tone(d, 0.35, 0.22); fx.texts.add('Wacht...', pl[i].x, 4.3, pl[i].z, i ? '#7ab0ff' : '#6aff9a', 0.8);
            peds[d].markColors = [PLAYER_COLORS[i]]; peds[d].markT = 0; markT[d] = DBL_WIN;
            hud.setPlayerInfo(1 - i, 'NU! Zelfde richting!');
          } else if (pending.p !== i) {
            if (d === s.dir) { doubles++; stepOk(i, d); } else { fail('Verkeerd!', i); }
            return;
          }
        } else {
          if (owner(idx) !== i) {
            if (pl[i].warnT <= 0) { pl[i].warnT = 1.4; fx.texts.add('Wacht!', pl[i].x, 4.3, pl[i].z, '#ccc', 0.8); audio.sfx('click', { vol: 0.4 }); }
            continue;
          }
          if (d !== s.dir) { fail('Verkeerd!', i); return; }
          stepOk(i, d); return;
        }
      }
      if (idleT > 14) { idleT = 0; if (s.dbl) say('Gouden stap! Allebei dezelfde richting, tegelijk.'); else say(`Het is de beurt van <b>${nm(owner(idx))}</b>. Welke kant ook alweer?`); }
    }

    // ---- hoofdlus
    function ambient(dt, playing) {
      t += dt;
      hut.update(t, dt, { stirring: stirKick > 0, baseColor: phase === 'stir' ? STIR_COL : null, glow: phase === 'ok' ? 0.5 : 0, runeGlow: phase === 'input' ? 0.4 : 0 });
      stirKick -= dt;
      pl.forEach((p, i) => {
        p.warnT -= dt; p.glow -= dt;
        if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0) p.pose = 'idle'; }
        p.c.pose = p.pose; p.c.update(dt);
        p.ring.material.opacity = 0.4 + (p.arrow.visible ? 0.4 + Math.sin(t * 8) * 0.2 : 0) + Math.max(0, p.glow) * 0.5;
        p.ring.scale.setScalar(1 + (p.arrow.visible ? Math.sin(t * 8) * 0.06 : 0));
        if (p.arrow.visible) p.arrow.position.y = p.c.height + 0.7 + Math.sin(t * 6 + i) * 0.12;
        p.arrow.rotation.y = t * 2;
      });
      henPoseT -= dt; if (henPoseT <= 0 && henPose !== 'idle') henPose = 'idle';
      hen.pose = henPose; hen.update(dt);
      for (let d = 0; d < 4; d++) if (markT[d] > 0) { markT[d] -= dt; if (markT[d] <= 0) peds[d].markColors = null; }
      // kralen
      beads.forEach((b, k) => {
        if (!b.g.visible) return;
        b.flash = Math.max(0, b.flash - dt * 2.5);
        let e = b.state === 'done' ? 0.9 : b.state === 'cur' ? 1.2 : 0.18;
        e += b.flash * 1.5;
        b.m.emissiveIntensity = e;
        const base = b.dbl ? 1.15 : 1;
        b.g.scale.setScalar(damp(b.g.scale.x, (b.state === 'done' ? 1.1 : 0.85) * base * (1 + b.flash * 0.4), 14, dt));
        b.g.position.y = 6.15 - (b.x / 8) * (b.x / 8) * 0.5 + Math.sin(t * 2 + k * 0.7) * 0.07;
        b.r.rotation.z = t * 1.5; b.ring2.rotation.y = t * 1.2;
      });
    }
    const STIR_COL = new THREE.Color(0xff9a4a);

    function update(dt) {
      ambient(dt, true);
      camera.position.set(camBase.x + Math.sin(t * 0.25) * 0.5, camBase.y + Math.sin(t * 0.31) * 0.15, camBase.z);
      camera.lookAt(camLook);
      if (done && phase !== 'lost') return;
      pt += dt;
      switch (phase) {
        case 'wait':
          if (pt === dt) { updateHud(); hud.setTimer(null); pinfo('Klaar?', 'Klaar?'); say(pickOf(SAY.hello)); }
          if (pt > 3.4) startShow(0.4);
          break;
        case 'show': {
          showT += dt; const { on, gap } = showTimings(); const per = on + gap;
          const k = showT < 0 ? -1 : Math.floor(showT / per);
          if (k > showK && k < len) {
            showK = k; const s = seq[k]; const own = owner(k);
            flashPed(s.dir, on, own, s.dbl);
            beads[k].state = 'cur'; beads[k].flash = 1;
            for (let i = 0; i < 2; i++) pl[i].arrow.visible = s.dbl || own === i;
            pinfo(s.dbl || own === 0 ? (s.dbl ? 'Samen!' : 'Jij!') : '', s.dbl || own === 1 ? (s.dbl ? 'Samen!' : 'Jij!') : '');
            if (k > 0) beads[k - 1].state = 'done';
          }
          if (showK >= 0 && showT - showK * per > on) pl.forEach((p) => { p.arrow.visible = false; });
          if (showT > len * per + 0.35) { pl.forEach((p) => { p.arrow.visible = false; }); startInput(); }
          break;
        }
        case 'input': handleInput(dt); break;
        case 'ok': if (pt > 1.3) startStir(); break;
        case 'stir': {
          for (let i = 0; i < 2; i++) {
            const p = pl[i], ip = input.p[i];
            if (ip.aP && p.stir < stirNeed) {
              p.stir++; stirKick = 0.4; hut.stirSpeed = Math.min(1.4, hut.stirSpeed + 0.4); p.c.swing(); audio.sfx('splash', { vol: 0.35, rate: 1 + p.stir * 0.1 });
              fx.particles.burst(rand(-0.8, 0.8), 2.9, rand(-0.8, 0.8), { count: 8, speed: 2, up: 1.8, size: 0.28, color: 0xb8ffd0, life: 0.6, gravity: 5 });
              stirInfo();
              if (p.stir >= stirNeed) fx.texts.add('Geroerd!', p.x, 4.2, p.z, i ? '#7ab0ff' : '#6aff9a', 0.9);
            }
          }
          const prog = (pl[0].stir + pl[1].stir) / (2 * stirNeed);
          hut.boil = lerp(3, 0.8, prog);
          if (Math.random() < 0.5) fx.particles.emit(rand(-1.5, 1.5), 2.8, rand(-1.5, 1.5), rand(-1, 1), rand(1, 2.5), rand(-1, 1), { life: 0.7, size: 0.45, color: 0xeaffee, gravity: 4 });
          if (pl[0].stir >= stirNeed && pl[1].stir >= stirNeed) { audio.sfx('win', { vol: 0.35, rate: 1.4 }); hut.setTint(0x9affd0, 0.4); setHen('cheer', 1.2); phase = 'calm'; pt = 0; hut.boil = 1; fx.texts.add('Rustig!', 0, 6.4, 0, '#9affd0', 1.1); }
          else if (pt > 12 && Math.floor(pt) % 6 === 0 && pt - dt < Math.floor(pt)) say('Allebei roeren! Hij kookt over!');
          break;
        }
        case 'calm': if (pt > 0.8) nextRound(); break;
        case 'err': if (pt > 2.4) { hut.boil = 1; startShow(0.6); } break;
        case 'lost':
          if (pt < 1.2 && Math.random() < 0.6) fx.particles.burst(rand(-1, 1), 3, rand(-1, 1), { count: 6, speed: 2, up: 2, size: 1.4, life: 1.8, colors: [0x2a2630, 0x3a3640, 0x55505c], gravity: -1.2 });
          if (pt > 1.3 && !this_lost) { this_lost = true; lose(); }
          break;
        default: break;
      }
      if (sayT > 0) { sayT -= dt; }
    }
    let this_lost = false;

    function idleUpdate(dt) { ambient(dt, false); camera.position.set(camBase.x + Math.sin(t * 0.25) * 0.5, camBase.y, camBase.z); camera.lookAt(camLook); }
    hud.setTimer(null); updateHud(); pinfo('Klaar?', 'Klaar?');
    layoutBeads();

    return {
      update,
      introUpdate: idleUpdate,
      resultUpdate: idleUpdate,
      onResize() { fit(); },
      dbg: () => ({ phase, seq, idx, len, lives, best, pending: !!pending, stirNeed, st: pl.map((p) => p.stir), swapOff, replays, showK }),
      dispose() {},
    };
  },
};

import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, dampAngle, rand, pick, TAU, canvasTex } from '../engine/util.js';
import { PLAYER_COLORS, PLAYER_CSS } from '../engine/chars.js';
import { TRK, hY, flowAt, makeCourse, buildWorld } from './ducks_world.js';
import { makeDuck, makeCroc, makeBoat, makeCannon, bubbleMaterial } from './ducks_models.js';

// Eendenrace — duel: kermis-waterspel. Twee rubber eendjes drijven door een vaart met stroming, draaikolken, lelies, stenen en watervallen.
//  * richtingen = je richtkruis verplaatsen (t.o.v. je eigen eend), A = spuiten: de straal DUWT elke eend weg van het richtkruis
//    (richt achter je eigen eend = vooruit; richt vóór de eend van je broer = hem terugduwen!), B = zeepbel-blokkade (cooldown)
//  * watertank raakt leeg bij spuiten (dan even wachten); comeback: wie achterligt pompt harder, krijgt de gouden eend; de krokodil pakt de leider
//  * gimmicks: krokodil, gouden eend (boost), golven, de Deurman als stuurloze visser, kikkers op lelies
const { L, W } = TRK;
const RJ = 3.5;                 // straal van de waterstraal
const P0 = 25;                  // spuitkracht
const TANK_DRAIN = 36, TANK_REGEN = 17, TANK_LOCK = 26;
const BUB_CD = 6.5;
const LANE = [3.5, -3.5];       // Wes = voorste baan (+z), Jor = achterste baan
const MATCH_TIME = 80;
const VMAX = 14;
const AIM_SPEED = 15;
const PNAME = ['Wes', 'Jor'];

export default {
  id: 'ducks', name: 'Eendenrace', giver: 'Kermisbaas Kees', icon: '🦆', mode: 'pvp', time: 80, music: 'game_fast',
  blurb: 'Rubber <b>eendjes-race</b> op de kermis! Je bestuurt een <b>waterkanon</b>: de straal <b>duwt eenden weg</b> van je richtkruis. Spuit <b>achter je eigen eend</b> om te racen, of <b>vóór de eend van je broer</b> om hem terug te duwen! Pas op voor <b>draaikolken, lelies, stenen, een krokodil</b> en een stuurloze visser. Eerste over de finish wint (of de verste na 80 s).',
  controls: ['{move} richtkruis bewegen', '{a} SPUITEN (houd ingedrukt, tank loopt leeg)', '{b} ZEEPBEL neerzetten (blokkeert de baan)'],
  tip: 'Wie achterligt pompt harder en krijgt de gouden eend (turbo!). Een zeepbel vlak voor je broer laat hem terugketsen.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const pv = ctx.pvp; const names = players.map((p) => p.name);
    const tw = ctx.twist.id; const SLIP = pv.slip || 0, GRAV = pv.gravity || 1;
    const TEMPO = ctx.twist.speed || 1; const FM = 1 + (TEMPO - 1) * 0.5, PM = 1 + (TEMPO - 1) * 0.4;
    const rng = ctx.rng;

    ctx.lights('day', { shadows: false, fogNear: 110, fogFar: 300 });
    camera.fov = 50; camera.updateProjectionMatrix(); scene.add(camera);
    const course = makeCourse(rng); const world = buildWorld(ctx, course, rng);

    // ---------------- eenden ----------------
    const D = [0, 1].map((i) => {
      const model = makeDuck(i); scene.add(model.group);
      const size = pv.size(i);
      const tag = canvasTex(256, 112, () => {}); const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag, transparent: true, depthTest: false })); spr.scale.set(3.6, 1.575, 1); spr.renderOrder = 15; scene.add(spr);
      return { i, model, size, R: 0.85 * size, mass: size * size, x: TRK.START + 1, z: LANE[i], vx: 0, vz: 0, y: 0, vy: 0, ang: 0, spin: 0, boost: 0, tank: 100, lock: false, bubCd: 0, ox: -2.6, oz: 0, spray: false, hitCd: 0, hopCd: 0, stuck: 0, squash: 0, ph: i * 2, cheer: 0, snd: 0,
        tag, spr, tagKey: '', ax: 0, az: 0, cb: 0, bonks: 0, bubbles: 0, sprayT: 0, lily: 0, wake: 0, finishedAt: 0 };
    });
    D[0].ang = D[1].ang = 0;

    // kanonnen (op de rails) + richtkruizen
    const cannons = [0, 1].map((i) => { const c = makeCannon(i); scene.add(c.group); c.group.position.set(D[i].x - 2.6, hY(0) + 0.9, i ? -(W + 1.6) : W + 1.6); c.group.rotation.y = i ? 0 : Math.PI; return c; });
    const reticleTex = (col) => canvasTex(256, 256, (g, w, h) => {
      g.translate(128, 128); g.strokeStyle = col; g.lineWidth = 9; g.lineCap = 'round';
      for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(0, 0, 112, k / 16 * TAU, k / 16 * TAU + 0.26); g.stroke(); }
      g.lineWidth = 12; for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); g.beginPath(); g.moveTo(0, -28); g.lineTo(0, -62); g.stroke(); g.restore(); }
      g.fillStyle = col; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(0, 0, 108, 0, TAU); g.fill();
    });
    const reticles = [0, 1].map((i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * RJ, 2 * RJ), new THREE.MeshBasicMaterial({ map: reticleTex(PLAYER_CSS[i]), transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 6; scene.add(m); return m;
    });
    const aim = [{ x: 0, z: 0 }, { x: 0, z: 0 }];

    // zeepbellen (pool)
    const bubGeo = new THREE.SphereGeometry(1, 18, 14); const bubMat = bubbleMaterial();
    const bubbles = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(bubGeo, bubMat); m.visible = false; m.renderOrder = 5; scene.add(m); return { on: false, m, x: 0, z: 0, r: 0, rt: 2.4, life: 0, t: 0, hits: 0, owner: 0 }; });

    // krokodil, boot, gouden eend, golf
    const croc = { on: false, c: makeCroc(), x: 0, z: 0, t: 0, state: '', snd: 0, snap: 0, jaw: 0 }; croc.c.group.visible = false; scene.add(croc.c.group);
    const boat = { on: false, b: makeBoat(), x: 0, z: 0, t: 0, z0: 0, ph: 0, vz: 0 }; boat.b.group.visible = false; scene.add(boat.b.group);
    const gold = { on: false, m: makeDuck(0, { gold: true, rider: false }), x: 0, z: 0, life: 0, halo: null }; gold.m.group.visible = false; scene.add(gold.m.group);
    gold.m.group.scale.setScalar(1.25);
    { const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,230,120,.95)'); gr.addColorStop(1, 'rgba(255,200,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); hs.scale.set(4.2, 4.2, 1); hs.position.y = 0.9; gold.m.group.add(hs); gold.halo = hs; }
    const wave = { on: false, x: 0, dir: 1, t: 0, k: 0, hit: [false, false], type: 'surf' };

    // ---------------- toestand ----------------
    let T = 0, introT = 0, started = false, finished = false, ended = false, endT = 0, winner = -1, timeLeft = MATCH_TIME, camX = TRK.START + 6, camD = 23, camTx = 0, shakeCd = 0, cheerAmt = 0;
    const EV = { croc: 12 + rand(0, 3), gold: 16 + rand(0, 4), wave: 22 + rand(0, 4), boat: 33 + rand(0, 5) };
    const stats = { crocs: 0, golds: 0, waves: 0, boats: 0, bonks: 0, bubbles: 0, sprays: 0, jetHits: 0 };
    const FL = { x: 0, z: 0 };
    const leaderIdx = () => (D[0].x >= D[1].x ? 0 : 1);

    // ---------------- overlay: voortgangsbalk (aan de camera) ----------------
    const stripC = document.createElement('canvas'); stripC.width = 1024; stripC.height = 80; const sg = stripC.getContext('2d');
    const stripTex = new THREE.CanvasTexture(stripC); stripTex.colorSpace = THREE.SRGBColorSpace;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, depthTest: false, depthWrite: false, fog: false })); strip.renderOrder = 50; camera.add(strip);
    let stripT = 0;
    function drawStrip() {
      sg.clearRect(0, 0, 1024, 80);
      sg.fillStyle = 'rgba(20,12,40,.62)'; sg.beginPath(); sg.roundRect(8, 10, 1008, 60, 24); sg.fill();
      const x0 = 70, x1 = 954, y = 42;
      sg.lineCap = 'round'; sg.strokeStyle = '#2aa9d8'; sg.lineWidth = 16; sg.beginPath(); sg.moveTo(x0, y); sg.lineTo(x1, y); sg.stroke();
      sg.strokeStyle = 'rgba(255,255,255,.55)'; sg.lineWidth = 3; sg.setLineDash([10, 12]); sg.beginPath(); sg.moveTo(x0, y); sg.lineTo(x1, y); sg.stroke(); sg.setLineDash([]);
      for (const k of TRK.CASC) { const cx = x0 + (k.x / L) * (x1 - x0); sg.fillStyle = '#fff'; sg.font = '16px sans-serif'; sg.textAlign = 'center'; sg.fillText('〰', cx, y - 14); }
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { sg.fillStyle = (r + c) % 2 ? '#111' : '#fff'; sg.fillRect(x1 + 6 + c * 8, y - 16 + r * 8, 8, 8); }
      sg.fillStyle = '#7dffb0'; sg.fillRect(x0 - 8, y - 14, 4, 28);
      for (const d of [D[1], D[0]]) {
        const u = clamp(d.x / L, 0, 1), cx = x0 + u * (x1 - x0); const col = PLAYER_CSS[d.i];
        sg.fillStyle = col; sg.strokeStyle = '#fff'; sg.lineWidth = 4; sg.beginPath(); sg.arc(cx, y + (d.i ? 6 : -6) * 0.0, 17, 0, TAU); sg.fill(); sg.stroke();
        sg.fillStyle = '#fff'; sg.font = 'bold 20px Fredoka, Arial, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText(PNAME[d.i][0], cx, y + 1);
      }
      sg.fillStyle = '#fff'; sg.font = 'bold 18px Fredoka, Arial, sans-serif'; sg.textAlign = 'left'; sg.textBaseline = 'middle';
      sg.fillStyle = PLAYER_CSS[0]; sg.fillText(`${Math.round(D[0].x)} m`, 16, 17); sg.textAlign = 'right'; sg.fillStyle = PLAYER_CSS[1]; sg.fillText(`${Math.round(D[1].x)} m`, 1008, 17);
      stripTex.needsUpdate = true;
    }
    function placeStrip() {
      const dist = 3, halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * (camera.aspect || 1.7);
      const w = Math.min(2 * halfW * 0.7, 2 * halfH * 1.5); const h = w * 80 / 1024; strip.scale.set(w, h, 1); strip.position.set(0, -halfH + h * 0.62, -dist);
    }

    // ---------------- hulpfuncties ----------------
    const lead = (i) => D[1 - i].x - D[i].x;      // >0: i ligt achter
    function refreshHud() {
      hud.setScore(`${names[0]} ${Math.round(D[0].x)} m – ${Math.round(D[1].x)} m ${names[1]}`);
      hud.setTimer(Math.max(0, Math.ceil(timeLeft)), 10);
      for (const d of D) {
        const n = Math.round(d.tank / 12.5); const bar = '▰'.repeat(n) + '▱'.repeat(8 - n);
        const st = d.boost > 0 ? '⚡TURBO!' : d.lock ? '💧leeg...' : d.bubCd > 0 ? `🫧${d.bubCd.toFixed(0)}s` : '🫧klaar';
        const txt = `💧${bar} ${st}${d.cb > 0.05 ? ' 💪' : ''}`;
        if (d.hudTxt !== txt) { d.hudTxt = txt; hud.setPlayerInfo(d.i, txt); }
      }
    }
    function drawTag(d) {
      const n = Math.round(d.tank / 100 * 20), cdq = d.bubCd <= 0 ? 8 : Math.ceil((1 - d.bubCd / BUB_CD) * 7);
      const key = `${n}|${d.lock ? 1 : 0}|${cdq}|${d.boost > 0 ? 1 : 0}`; if (key === d.tagKey) return; d.tagKey = key;
      const c = d.tag.image, g = c.getContext('2d'); g.clearRect(0, 0, 256, 112);
      g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 11; g.strokeStyle = 'rgba(10,10,40,.9)'; g.strokeText(names[d.i], 128, 34); g.fillStyle = PLAYER_CSS[d.i]; g.fillText(names[d.i], 128, 34);
      g.fillStyle = 'rgba(10,10,40,.8)'; g.beginPath(); g.roundRect(14, 68, 168, 28, 12); g.fill();
      g.fillStyle = d.boost > 0 ? '#ffd23f' : d.lock ? '#ff6a5a' : '#58d6ff'; g.beginPath(); g.roundRect(18, 72, Math.max(4, 160 * n / 20), 20, 9); g.fill();
      g.fillStyle = cdq >= 8 ? '#ffffff' : 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(218, 82, 16, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      if (cdq < 8) { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(218, 82); g.arc(218, 82, 16, -Math.PI / 2, -Math.PI / 2 + TAU * cdq / 7); g.closePath(); g.fill(); }
      d.tag.needsUpdate = true;
    }
    function text(t, x, z, col, sc = 1, y = 2.4) { fx.texts.add(t, x, hY(x) + y, z, col, sc); }
    function splash(x, z, n = 10, up = 1.6, col = [0xffffff, 0xbff4ff, 0x8fe0ff]) { fx.particles.burst(x, hY(x) + 0.3, z, { count: n, speed: 3.4, up, life: 0.7, size: 0.34, colors: col, gravity: 9 }); }

    // ---------------- bubbel ----------------
    function spawnBubble(i) {
      const b = bubbles.find((q) => !q.on) || bubbles[0]; b.on = true; b.x = aim[i].x; b.z = clamp(aim[i].z, -W + 1.6, W - 1.6); b.r = 0.2; b.rt = 2.4; b.life = 5.0; b.t = 0; b.hits = 0; b.owner = i; b.m.visible = true;
      fx.particles.burst(b.x, hY(b.x) + 1, b.z, { count: 22, speed: 3.5, up: 1.2, life: 0.8, size: 0.3, colors: [0xffffff, 0xffb8f0, 0xb8e8ff, 0xfff0b8], gravity: -1 });
      audio.sfx('pop', { vol: 0.6, rate: 1.4 }); audio.sfx('sparkle', { vol: 0.3 }); stats.bubbles++; D[i].bubbles++;
    }
    function popBubble(b, loud = true) { if (!b.on) return; b.on = false; b.m.visible = false; if (loud) { fx.particles.burst(b.x, hY(b.x) + 1, b.z, { count: 26, speed: 4.5, up: 1.0, life: 0.8, size: 0.32, colors: [0xffffff, 0xffb8f0, 0xb8e8ff], gravity: 3 }); audio.sfx('pop', { vol: 0.5, rate: 0.9 }); } }

    // ---------------- gebeurtenissen ----------------
    function startCroc() {
      const t = D[leaderIdx()]; const tgt = Math.abs(D[0].x - D[1].x) < 3 ? D[Math.random() < 0.5 ? 0 : 1] : t;
      if (tgt.x > L - 34 || tgt.x < 14) return false;
      const sgn = (tgt.z >= 0 ? 1 : -1); croc.on = true; croc.state = 'warn'; croc.t = 0; croc.x = Math.min(tgt.x + 15, L - 22); croc.z = sgn * 3.5; croc.snd = 0; croc.snap = 0; croc.jaw = 0; croc.c.group.visible = true; croc.c.group.position.set(croc.x, hY(croc.x) - 1.6, croc.z);
      stats.crocs++; hud.toast('🐊 KROKODIL in de baan van ' + names[tgt.i] + '!', 1900); audio.sfx('buzz', { vol: 0.4 }); text('KROKODIL!', croc.x, croc.z, '#9dff6a', 1.5, 3);
      return true;
    }
    function startGold() {
      const tr = D[1 - leaderIdx()]; const base = Math.abs(D[0].x - D[1].x) < 2 ? D[Math.random() < 0.5 ? 0 : 1] : tr;
      if (base.x > L - 26) return false;
      gold.on = true; gold.x = Math.min(base.x + 10 + rand(0, 5), L - 12); gold.z = (base.z >= 0 ? 1 : -1) * 3.4 + rand(-0.8, 0.8); gold.life = 9; gold.m.group.visible = true; stats.golds++;
      hud.toast('✨ GOUDEN EEND! Pak hem voor TURBO!', 1900); audio.sfx('sparkle', { vol: 0.5 }); return true;
    }
    function startWave(type) {
      wave.on = true; wave.type = type; wave.t = 0; wave.hit = [false, false]; const half = camD * 0.466 * (camera.aspect || 1.7) + 6;
      wave.dir = type === 'surf' ? 1 : -1; wave.x = camX + (type === 'surf' ? -half : half); wave.k = 0; stats.waves++;
      hud.toast(type === 'surf' ? '🌊 SURF-GOLF! Hij duwt jullie vooruit!' : '🌊 TEGENGOLF! Hou je vast!', 2000); audio.sfx('whoosh', { vol: 0.6, rate: 0.7 }); audio.sfx('splash', { vol: 0.4, rate: 0.7 });
    }
    function startBoat() {
      const t = D[leaderIdx()]; if (t.x > L - 40) return false;
      boat.on = true; boat.t = 0; boat.x = Math.min(t.x + 15, L - 28); boat.z0 = (Math.random() < 0.5 ? 1 : -1) * rand(0, 2.5); boat.z = boat.z0; boat.ph = rand(0, 6); boat.b.group.visible = true; boat.vz = 0; stats.boats++;
      hud.toast('🎣 De Deurman-visser drijft stuurloos rond!', 2200); audio.sfx('creak', { vol: 0.3 }); return true;
    }
    function updateEvents(dt) {
      const nearEnd = Math.max(D[0].x, D[1].x) > L - 30;
      EV.croc -= dt; EV.gold -= dt; EV.wave -= dt; EV.boat -= dt;
      if (EV.croc <= 0 && !croc.on) { if (!nearEnd && startCroc()) EV.croc = rand(17, 24); else EV.croc = 3; }
      if (EV.gold <= 0 && !gold.on) { if (!nearEnd && startGold()) EV.gold = rand(15, 21); else EV.gold = 3; }
      if (EV.wave <= 0 && !wave.on) { if (!nearEnd) { startWave(Math.random() < 0.5 ? 'surf' : 'back'); EV.wave = rand(22, 30); } else EV.wave = 5; }
      if (EV.boat <= 0 && !boat.on) { if (!nearEnd && startBoat()) EV.boat = rand(26, 34); else EV.boat = 4; }
      // krokodil
      if (croc.on) {
        croc.t += dt; croc.x += 1.0 * dt; const s = croc.state;
        if (s === 'warn') { if (Math.random() < dt * 14) fx.particles.emit(croc.x + rand(-1.5, 1.5), hY(croc.x) + 0.2, croc.z + rand(-1, 1), 0, 1.2, 0, { life: 0.8, size: 0.35, color: 0xffffff, gravity: -1 }); if (croc.t > 1.5) { croc.state = 'up'; croc.t = 0; splash(croc.x, croc.z, 26, 2.4); audio.sfx('splash', { vol: 0.7, rate: 0.6 }); ctx.shake(0.35); } }
        else if (s === 'up') { if (croc.t > 5.2) { croc.state = 'dive'; croc.t = 0; } }
        else if (s === 'dive') { if (croc.t > 0.7) { croc.on = false; croc.c.group.visible = false; splash(croc.x, croc.z, 14, 1.6); } }
        const rise = croc.state === 'warn' ? 0 : croc.state === 'up' ? Math.min(1, croc.t / 0.5) : 1 - croc.t / 0.7;
        croc.c.group.position.set(croc.x, hY(croc.x) - 1.3 + rise * 1.4 + Math.sin(T * 2) * 0.05, croc.z);
        croc.snap = Math.max(0, croc.snap - dt); croc.jaw = damp(croc.jaw, croc.snap > 0.9 ? 1.4 : (Math.sin(T * 3) > 0.7 ? 0.7 : 0.25), 14, dt);
        croc.c.update(T, croc.jaw);
        croc.active = croc.state === 'up' && croc.t > 0.35;
      }
      // golf
      if (wave.on) {
        wave.t += dt; wave.x += wave.dir * (wave.type === 'surf' ? 14 : 16) * dt; wave.k = Math.min(1, wave.t / 0.8);
        const half = camD * 0.466 * (camera.aspect || 1.7) + 8;
        for (const d of D) if (!wave.hit[d.i] && Math.abs(d.x - wave.x) < 1.6) {
          wave.hit[d.i] = true; d.vx += wave.dir * (wave.type === 'surf' ? 8 : 7); d.vy = 4.5 / Math.sqrt(GRAV); d.squash = 1; d.cheer = 1.2; d.spin = rand(-4, 4);
          text(wave.type === 'surf' ? 'SURF!' : 'WOEPS!', d.x, d.z, '#9fe8ff', 1.3); splash(d.x, d.z, 22, 3); audio.sfx('splash', { vol: 0.5 }); ctx.shake(0.25);
        }
        if (Math.abs(wave.x - camX) > half + 6 || wave.t > 9) { wave.on = false; }
      }
      // boot
      if (boat.on) {
        boat.t += dt; flowAt(boat.x, boat.z, FL); boat.x += (FL.x * 0.55 + 0.6) * dt;
        const tz = clamp(boat.z0 + 3.6 * Math.sin(boat.t * 0.55 + boat.ph), -5.4, 5.4); boat.vz = damp(boat.vz, (tz - boat.z) * 1.5, 3, dt); boat.z += boat.vz * dt;
        boat.b.group.position.set(boat.x, hY(boat.x) - 0.05 + Math.sin(T * 2.2) * 0.06, boat.z); boat.b.group.rotation.y = Math.sin(boat.t * 0.5) * 0.35 + boat.vz * 0.1; boat.b.group.rotation.z = Math.sin(T * 1.7) * 0.05; boat.b.update(T, dt);
        const behind = Math.min(D[0].x, D[1].x) - boat.x > 22;
        if (boat.t > 26 || behind || boat.x > L - 12) { boat.on = false; boat.b.group.visible = false; splash(boat.x, boat.z, 10); }
      }
      // gouden eend
      if (gold.on) {
        gold.life -= dt; flowAt(gold.x, gold.z, FL); gold.x += FL.x * 0.6 * dt; const g = gold.m.group; g.position.set(gold.x, hY(gold.x) + 0.15 + Math.sin(T * 3) * 0.12, gold.z); g.rotation.y += dt * 2.2; gold.halo.material.opacity = 0.65 + Math.sin(T * 6) * 0.3;
        g.visible = gold.life > 2 || Math.sin(gold.life * 20) > 0; if (Math.random() < dt * 12) fx.particles.emit(gold.x + rand(-0.7, 0.7), hY(gold.x) + 1 + rand(0, 1), gold.z + rand(-0.7, 0.7), 0, 0.8, 0, { life: 0.7, size: 0.22, color: 0xffe14a, gravity: -0.5 });
        for (const d of D) if (Math.hypot(d.x - gold.x, d.z - gold.z) < d.R + 1.1) {
          gold.on = false; g.visible = false; d.boost = 4.2; d.cheer = 1.5; d.squash = 0.6; text('TURBO!', d.x, d.z, '#ffd23f', 1.7, 3); audio.sfx('powerup', { vol: 0.8 }); audio.sfx('sparkle', { vol: 0.6 }); ctx.shake(0.25);
          fx.particles.burst(d.x, hY(d.x) + 1, d.z, { count: 40, speed: 5, up: 1.4, life: 1.0, size: 0.4, colors: [0xffe14a, 0xffffff, 0xff9a10], gravity: 3 }); break;
        }
        if (gold.life <= 0) { gold.on = false; g.visible = false; splash(gold.x, gold.z, 8); }
      }
    }

    // ---------------- natuurkunde ----------------
    const dyn = [];   // dynamische cirkels: bubbels, krokodil, boot
    function collectDyn() {
      dyn.length = 0;
      for (const b of bubbles) if (b.on) dyn.push({ x: b.x, z: b.z, r: b.r, e: 1.25, kind: 'bub', ref: b });
      if (croc.on && croc.state !== 'warn' && croc.t > (croc.state === 'up' ? 0.3 : 0) && !(croc.state === 'dive' && croc.t > 0.35)) { dyn.push({ x: croc.x - 1.5, z: croc.z, r: 1.15, e: 0.4, kind: 'croc' }, { x: croc.x + 0.3, z: croc.z, r: 1.15, e: 0.4, kind: 'croc' }, { x: croc.x + 2.0, z: croc.z, r: 0.95, e: 0.4, kind: 'croc' }); }
      if (boat.on) dyn.push({ x: boat.x - 0.9, z: boat.z, r: 1.0, e: 0.9, kind: 'boat' }, { x: boat.x + 0.9, z: boat.z, r: 1.0, e: 0.9, kind: 'boat' });
    }
    function bonk(d, impact, x, z, soft) {
      if (impact < 2.2) return;
      d.squash = Math.min(1, impact * 0.12); d.hitCd = 0.2;
      if (impact > 3.5 && d.snd <= 0) { d.snd = 0.25; audio.sfx(soft ? 'boing' : 'thud', { vol: clamp(impact * 0.07, 0.15, 0.6), rate: 0.8 + Math.random() * 0.4 }); splash(x, z, 6 + Math.floor(impact), 1.2); if (impact > 6) { ctx.shake(clamp(impact * 0.04, 0.1, 0.35)); text('BONK!', d.x, d.z, '#ffe14a', 1, 2.6); d.bonks++; stats.bonks++; d.cheer = 0; d.rider('scared', 0.7); } }
    }
    function stepDuck(d, dt) {
      const air = d.y > 0.4;
      flowAt(d.x, d.z, FL);
      let k = lerp(1.5, 0.8, SLIP) * (air ? 0.35 : 1); let lily = false;
      if (!air) for (const p of course.pads) { if (Math.abs(p.x - d.x) > p.r + 1) continue; const dd = Math.hypot(p.x - d.x, p.z - d.z); if (dd < p.r * 0.95) { k *= 3.4; lily = true; break; } }
      d.lily = lily ? 1 : Math.max(0, d.lily - dt * 3);
      const fm = FM * (1 + Math.min(1.5, d.stuck * 0.4)); let ax = -k * (d.vx - FL.x * fm), az = -k * (d.vz - FL.z * fm);
      if (d.stuck > 2.5 && Math.random() < dt * 3) az += (Math.random() - 0.5) * 60;
      // waterstralen (iedereen spuit op iedereen)
      for (const j of D) if (j.spray) {
        const dx = d.x - aim[j.i].x, dz = d.z - aim[j.i].z; const r = Math.hypot(dx, dz); if (r > RJ + d.R * 0.4) continue;
        const f = r < 0.7 ? 1 : clamp((RJ - r) / (RJ - 0.7), 0, 1); const pw = j.pw * f / Math.pow(d.size, 1.5);
        if (r > 0.15) { ax += dx / r * pw; az += dz / r * pw; } else ax += pw;
        if (f > 0.2 && j !== d) { stats.jetHits++; }
        if (f > 0.35 && d.y < 0.12 && d.hopCd <= 0) { d.vy = (1.6 + f * 1.4) / Math.sqrt(GRAV) * 1.0; d.hopCd = 0.28; }
      }
      // draaikolken
      if (!air) for (const w of course.whirls) {
        if (Math.abs(w.x - d.x) > w.r) continue; const dx = d.x - w.x, dz = d.z - w.z; const r = Math.hypot(dx, dz); if (r > w.r || r < 0.01) continue;
        const f = 1 - r / w.r; const tx = -dz / r * w.dir, tz = dx / r * w.dir;
        ax += tx * 13 * f * f - dx / r * 3.2 * f; az += tz * 13 * f * f - dz / r * 3.2 * f; d.spin += w.dir * 9 * f * dt;
        if (r < 1.6 && d.snd <= 0) { d.snd = 0.9; text('WHOEEE!', d.x, d.z, '#9fe8ff', 0.9); audio.sfx('whoosh', { vol: 0.25, rate: 1.4 }); }
      }
      if (d.boost > 0) { ax += 16; az += -d.vz * 0.4; }
      d.vx += ax * dt; d.vz += az * dt;
      const sp = Math.hypot(d.vx, d.vz), vm = d.boost > 0 ? VMAX + 5 : VMAX;
      if (sp < 0.9 && !lily && !d.spray) d.stuck += dt; else d.stuck = Math.max(0, d.stuck - dt * 2); if (sp > vm) { d.vx *= vm / sp; d.vz *= vm / sp; }
      d.x += d.vx * dt; d.z += d.vz * dt;
      // verticaal
      d.vy -= 20 * GRAV * dt; d.y += d.vy * dt;
      if (d.y < 0) { if (d.vy < -3 && d.snd <= 0) { splash(d.x, d.z, 8, 1.2); audio.sfx('splash', { vol: 0.25 }); d.snd = 0.2; } d.y = 0; d.vy = d.vy < -2 ? -d.vy * 0.3 : 0; }
      d.hopCd -= dt; d.snd -= dt; d.hitCd -= dt;
      // oevers
      const zl = W - d.R * 0.9;
      if (d.z > zl) { const v = d.vz; d.z = zl; if (v > 0) { d.vz = -v * 0.35; bonk(d, v, d.x, d.z + 0.4, false); } }
      if (d.z < -zl) { const v = -d.vz; d.z = -zl; if (v > 0) { d.vz = v * 0.35; bonk(d, v, d.x, d.z - 0.4, false); } }
      if (d.x < 0.5) { d.x = 0.5; if (d.vx < 0) d.vx *= -0.3; }
      // vaste obstakels + dynamische
      const hit = (o) => {
        const dx = d.x - o.x, dz = d.z - o.z; const rr = d.R + o.r; if (dx * dx + dz * dz >= rr * rr) return; const dd = Math.sqrt(dx * dx + dz * dz) || 0.01; const nx = dx / dd, nz = dz / dd;
        d.x = o.x + nx * rr; d.z = o.z + nz * rr; const vn = d.vx * nx + d.vz * nz;
        if (vn < 0) { const e = o.e * (o.kind === 'bub' ? 1 : 1); d.vx -= (1 + e) * vn * nx; d.vz -= (1 + e) * vn * nz; bonk(d, -vn, o.x + nx * o.r, o.z + nz * o.r, o.kind === 'bub' || o.kind === 'buoy'); d.spin += (nx * d.vz - nz * d.vx) * 0.15;
          if (o.kind === 'bub') { o.ref.hits++; if (o.ref.hits >= 3) popBubble(o.ref); else audio.sfx('boing', { vol: 0.4, rate: 1.2 }); } if (o.kind === 'buoy') audio.sfx('boing', { vol: 0.3, rate: 1.6 }); }
      };
      for (const o of course.obs) { if (o.x < d.x - 4) continue; if (o.x > d.x + 4) break; hit(o); }
      for (const o of dyn) hit(o);
      // krokodil hapt
      if (croc.on && croc.active && croc.snap <= 0) { const dd = Math.hypot(d.x - (croc.x - 0.5), d.z - croc.z); if (dd < 3.0 + d.R * 0.5 && d.y < 1) { croc.snap = 1.3; d.vx = -9; d.vz += (d.z >= croc.z ? 1 : -1) * 5.5; d.vy = 5; d.squash = 1; d.tank = Math.max(0, d.tank - 20); text('HAP!', d.x, d.z, '#ff6a5a', 1.6, 2.8); audio.sfx('hit', { vol: 0.8 }); audio.sfx('buzz', { vol: 0.3 }); ctx.shake(0.55); splash(croc.x, croc.z, 24, 2.4); d.rider('sad', 1.0); d.spin = rand(-8, 8); } }
    }
    function duckVsDuck() {
      const a = D[0], b = D[1]; const dx = b.x - a.x, dz = b.z - a.z; const rr = a.R + b.R; const d2 = dx * dx + dz * dz; if (d2 >= rr * rr) return;
      const dd = Math.sqrt(d2) || 0.01, nx = dx / dd, nz = dz / dd; const ov = rr - dd; const ma = a.mass, mb = b.mass, ms = ma + mb;
      a.x -= nx * ov * mb / ms; a.z -= nz * ov * mb / ms; b.x += nx * ov * ma / ms; b.z += nz * ov * ma / ms;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz; if (rv >= 0) return;
      const j = -(1 + 0.9) * rv / (1 / ma + 1 / mb); a.vx -= j / ma * nx; a.vz -= j / ma * nz; b.vx += j / mb * nx; b.vz += j / mb * nz;
      const imp = -rv; a.spin += rand(-3, 3); b.spin += rand(-3, 3);
      if (imp > 1.5 && a.snd <= 0) { a.snd = b.snd = 0.3; audio.sfx('thud', { vol: clamp(imp * 0.08, 0.2, 0.6) }); audio.sfx('boing', { vol: 0.3, rate: 1.3 }); splash((a.x + b.x) / 2, (a.z + b.z) / 2, 10, 1.6); ctx.shake(clamp(imp * 0.04, 0.1, 0.35)); text('BONK!', (a.x + b.x) / 2, (a.z + b.z) / 2, '#ffe14a', 1.2, 2.6); a.squash = b.squash = 0.8; stats.bonks++; }
    }
    function physics(dt) {
      for (const d of D) {
        d.cb = clamp((lead(d.i) - 10) / 20, 0, 0.4);
        d.pw = P0 * (1 + d.cb) * (d.boost > 0 ? 1.35 : 1) * PM * (1 - 0.3 * SLIP);
      }
      const n = 2; const h = dt / n;
      for (let s = 0; s < n; s++) { collectDyn(); for (const d of D) stepDuck(d, h); duckVsDuck(); }
      for (const b of bubbles) if (b.on) {
        b.t += dt; b.life -= dt; b.r = lerp(b.r, b.rt, 1 - Math.exp(-14 * dt)); flowAt(b.x, b.z, FL); b.x += FL.x * 0.65 * dt; b.z += FL.z * 0.3 * dt; b.z = clamp(b.z, -W + b.r * 0.7, W - b.r * 0.7);
        if (b.life <= 0) popBubble(b);
      }
    }

    // ---------------- spelverloop ----------------
    function startMatch() { started = true; for (const d of D) { d.vx = 2; } refreshHud(); }
    function endRace(w, why) {
      if (ended) return; ended = true; endT = 0; winner = w;
      hud.showBig(`${names[w]} WINT!`, 1800, w ? '#8fb8ff' : '#7dffb0'); audio.sfx('bell', { vol: 0.8 }); audio.sfx('win', { vol: 0.5 }); ctx.shake(0.5);
      const d = D[w]; D[w].rider('cheer', 5); D[1 - w].rider('sad', 5);
      fx.particles.burst(d.x, hY(d.x) + 2, d.z, { count: 80, speed: 9, up: 1.2, life: 1.5, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff], gravity: 6 });
      D[w].why = why;
    }
    function finishMatch() {
      if (finished) return; finished = true;
      const w = winner, d = D[w];
      const sum = D[w].why === 'finish' ? `<b>${names[w]}</b> zwemt als eerste over de finish! (${Math.round(D[1 - w].x)} m voor ${names[1 - w]})` : `Tijd om! <b>${names[w]}</b> was het verst (${Math.round(d.x)} m tegen ${Math.round(D[1 - w].x)} m).`;
      ctx.finishPvp({ winner: w, score: [Math.round(D[0].x), Math.round(D[1].x)], summary: `${sum}<br>🫧 zeepbellen: ${D[0].bubbles}/${D[1].bubbles} · 💥 bonks: ${D[0].bonks}/${D[1].bonks}` });
    }
    for (const d of D) { d.rt = 0; d.rp = 'sit'; d.rider = (p, t = 0.8) => { d.rp = p; d.rt = t; }; }

    function update(dt) {
      if (finished) { resultUpdate(dt); return; }
      T += dt;
      if (!started) startMatch();
      if (!ended) {
        timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; const w = D[0].x > D[1].x ? 0 : D[1].x > D[0].x ? 1 : (Math.random() < 0.5 ? 0 : 1); endRace(w, 'time'); }
        // invoer
        for (const d of D) {
          const inp = pv.input(d.i); const sp = AIM_SPEED * pv.speed(d.i);
          d.ox = clamp(d.ox + inp.x * sp * dt, -17, 17); d.oz = clamp(d.oz + inp.y * sp * dt, -W - 0.9 - d.z, W + 0.9 - d.z);
          aim[d.i].x = d.x + d.ox; aim[d.i].z = d.z + d.oz;
          const can = d.tank > 0.5 && !d.lock;
          d.spray = !!inp.a && (can || d.boost > 0);
          if (d.spray) { if (d.boost <= 0) d.tank = Math.max(0, d.tank - TANK_DRAIN * dt); if (d.tank <= 0) { d.lock = true; d.spray = false; text('LEEG!', d.x, d.z, '#ff8a6a', 1, 3); audio.sfx('buzz', { vol: 0.3, rate: 1.4 }); } d.sprayT += dt; }
          else d.tank = Math.min(100, d.tank + TANK_REGEN * (1 + d.cb * 1.2) * dt * (d.lock ? 0.8 : 1));
          if (d.lock && d.tank >= TANK_LOCK) { d.lock = false; text('TANK VOL!', d.x, d.z, '#7dffb0', 0.8, 3); }
          if (inp.bP && d.bubCd <= 0) { d.bubCd = BUB_CD; spawnBubble(d.i); }
          d.bubCd = Math.max(0, d.bubCd - dt); d.boost = Math.max(0, d.boost - dt);
        }
        updateEvents(dt);
        physics(dt);
        for (const d of D) if (d.x >= L && !ended) { const other = D[1 - d.i]; const w = other.x >= L && other.x > d.x ? other.i : d.i; endRace(w, 'finish'); }
      } else {
        endT += dt; physics(dt * 0.6); updateEvents(dt * 0.3); for (const d of D) { d.spray = false; }
        if (endT > 2.6) finishMatch();
      }
      visuals(dt);
    }

    // ---------------- visuals ----------------
    const rip = Array.from({ length: 8 }, () => [0, 0, 0, 1]); const camLook = new THREE.Vector3();
    let sprayAcc = [0, 0], sndT = [0, 0];
    function setRip(k, x, z, a, r) { const q = rip[k]; q[0] = x; q[1] = z; q[2] = a; q[3] = r; }
    function updateCamera(dt) {
      const asp = camera.aspect || 1.7, th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const a = D[0], b = D[1]; const gap = Math.abs(a.x - b.x);
      let tx = (a.x + b.x) / 2 + 3.5, wantD = clamp(Math.max(21, (gap / 2 + 8) / (th * asp)), 21, 50);
      if (ended) { const w = D[winner]; tx = w.x + 1; wantD = Math.max(17, Math.min(wantD, 24)); }
      if (!started) { tx = TRK.START + 10 + Math.sin(introT * 0.4) * 4; wantD = 24; }
      camX = damp(camX, tx, 3, dt); camD = damp(camD, wantD, 2.2, dt);
      const pitch = 0.88; const hh = lerp(hY(a.x), hY(b.x), 0.5);
      camLook.set(camX, hh, 0.8);
      camera.position.set(camX, hh + Math.sin(pitch) * camD, 0.8 + Math.cos(pitch) * camD); camera.lookAt(camLook);
      placeStrip();
    }
    function visuals(dt) {
      const tt = T + introT;
      for (const d of D) {
        const m = d.model, sp = Math.hypot(d.vx, d.vz);
        // heading + spin
        if (sp > 1.4) d.ang = dampAngle(d.ang, Math.atan2(d.vz, d.vx), 4, dt);
        d.spin = damp(d.spin, 0, 2.6, dt); d.ang += d.spin * dt;
        const slope = (hY(d.x + 0.6) - hY(d.x - 0.6)) / 1.2;
        const bob = Math.sin(tt * 3 + d.ph) * 0.05;
        const g = m.group; g.position.set(d.x, hY(d.x) + bob + d.y + 0.02, d.z); g.rotation.y = Math.PI / 2 - d.ang;
        d.squash = damp(d.squash, 0, 7, dt); const sq = d.squash;
        const ks = d.size * 1.22; g.scale.set(ks * (1 + sq * 0.18), ks * (1 - sq * 0.28), ks * (1 + sq * 0.18));
        m.tilt.rotation.x = clamp(-sp * 0.012 + d.vy * 0.04 + slope * 0.3 * 0 + Math.sin(tt * 2 + d.ph) * 0.02, -0.4, 0.4);
        m.tilt.rotation.z = clamp(d.spin * 0.06, -0.5, 0.5) + Math.sin(tt * 2.4 + d.ph) * 0.03;
        m.wings.forEach((w) => { w.rotation.z = w.userData.s * (0.35 + Math.sin(tt * (d.spray ? 18 : 6) + d.ph) * (0.15 + Math.min(0.5, sp * 0.04))); });
        m.head.rotation.x = Math.sin(tt * 4 + d.ph) * 0.05;
        // poppetje
        d.rt -= dt; if (d.rt <= 0 && !ended) d.rp = d.boost > 0 ? 'cheer' : d.lily > 0.5 ? 'scared' : d.spray ? 'push' : 'sit';
        if (d.cheer > 0) { d.cheer -= dt; if (d.rt <= 0) d.rp = 'cheer'; }
        const r = m.rider; r.pose = d.rp; r.speed = 0; r.update(dt);
        // naamlabel + tank
        drawTag(d); d.spr.position.set(d.x, hY(d.x) + 3.6 + d.y, d.z + 0.5);
        // kielzog
        if (sp > 2 && d.y < 0.3 && Math.random() < dt * (6 + sp * 1.4)) fx.particles.emit(d.x - Math.cos(d.ang) * 0.9, hY(d.x) + 0.15, d.z - Math.sin(d.ang) * 0.9 + rand(-0.3, 0.3), -d.vx * 0.15 + rand(-0.4, 0.4), 0.5, rand(-0.5, 0.5), { life: 0.5, size: 0.3, color: 0xffffff, gravity: 2 });
        if (d.boost > 0 && Math.random() < dt * 40) fx.particles.emit(d.x - Math.cos(d.ang) * 1.1, hY(d.x) + 0.6, d.z - Math.sin(d.ang) * 1.1, rand(-1, 1), rand(0.5, 2), rand(-1, 1), { life: 0.5, size: 0.4, color: Math.random() < 0.5 ? 0xffd23f : 0xff8a1a, gravity: -1 });
        if (d.lily > 0.5 && Math.random() < dt * 8) fx.particles.emit(d.x + rand(-0.8, 0.8), hY(d.x) + 0.3, d.z + rand(-0.8, 0.8), 0, 0.6, 0, { life: 0.5, size: 0.25, color: 0x6fe86a, gravity: 1 });
      }
      // kanonnen + richtkruizen + straal
      for (const d of D) {
        const i = d.i; const c = cannons[i]; const cz = i ? -(W + 1.6) : W + 1.6; const cxT = aim[i].x;
        c.group.position.x = damp(c.group.position.x, cxT, 8, dt); c.group.position.set(c.group.position.x, hY(c.group.position.x) + 0.88, cz);
        const dx = aim[i].x - c.group.position.x, dz = aim[i].z - cz; c.group.rotation.y = Math.atan2(dx, dz); c.barrel.rotation.x = -0.45;
        c.tank.scale.setScalar(0.6 + 0.4 * d.tank / 100); c.tank.material.color.setHex(d.lock ? 0xff9a8a : 0xbfe8ff);
        const rt = reticles[i]; const ready = d.spray; rt.position.set(aim[i].x, hY(aim[i].x) + 0.35, aim[i].z); rt.rotation.z += dt * (d.spray ? 3.5 : 0.7);
        const sc = d.spray ? 1.0 + Math.sin(tt * 22) * 0.04 : 0.86; rt.scale.setScalar(sc); rt.material.opacity = d.spray ? 1 : 0.7;
        if (d.spray) {
          sprayAcc[i] += dt * 70; const sx = c.group.position.x + Math.sin(c.group.rotation.y) * 1.4, sz = cz + Math.cos(c.group.rotation.y) * 1.4, sy = 2.8;
          const dist = Math.hypot(aim[i].x - sx, aim[i].z - sz), Tf = clamp(dist / 15, 0.32, 0.85), gr = 18;
          while (sprayAcc[i] > 1) { sprayAcc[i] -= 1; const tx = aim[i].x + rand(-0.6, 0.6), tz2 = aim[i].z + rand(-0.6, 0.6), ty = hY(tx) + 0.25; fx.particles.emit(sx, sy, sz, (tx - sx) / Tf, (ty - sy) / Tf + 0.5 * gr * Tf, (tz2 - sz) / Tf, { life: Tf, size: 0.34, color: Math.random() < 0.5 ? 0xffffff : 0xa8ecff, gravity: gr }); }
          if (Math.random() < dt * 22) fx.particles.burst(aim[i].x, hY(aim[i].x) + 0.3, aim[i].z, { count: 3, speed: 2.4, up: 1.1, life: 0.5, size: 0.3, colors: [0xffffff, 0xbff4ff], gravity: 9 });
          sndT[i] -= dt; if (sndT[i] <= 0) { sndT[i] = 0.13; audio.noise(0.16, { type: 'bandpass', freq: 2400, freq2: 1500, q: 0.7, vol: 0.05 }); }
        }
      }
      // bellen
      bubbleMaterial().uniforms.uT.value = tt;
      for (const b of bubbles) if (b.on) { const wob = 1 + Math.sin(tt * 5 + b.x) * 0.04; b.m.position.set(b.x, hY(b.x) + b.r * 0.8, b.z); b.m.scale.set(b.r * wob, b.r * 0.9 / wob, b.r * wob); }
      // golf-uniform + rimpels
      setRip(0, D[0].x, D[0].z, 0.45 + Math.min(0.5, Math.hypot(D[0].vx, D[0].vz) * 0.04), 2.6); setRip(1, D[1].x, D[1].z, 0.45 + Math.min(0.5, Math.hypot(D[1].vx, D[1].vz) * 0.04), 2.6);
      setRip(2, aim[0].x, aim[0].z, D[0].spray ? 1 : 0.3, 3.4); setRip(3, aim[1].x, aim[1].z, D[1].spray ? 1 : 0.3, 3.4);
      setRip(4, croc.x, croc.z, croc.on ? (croc.state === 'warn' ? 0.9 : 0.5) : 0, 4); setRip(5, boat.x, boat.z, boat.on ? 0.5 : 0, 3); setRip(6, gold.x, gold.z, gold.on ? 0.6 : 0, 2.4);
      const bb = bubbles.find((q) => q.on); setRip(7, bb ? bb.x : 0, bb ? bb.z : 0, bb ? 0.5 : 0, 3.2);
      if (ended) cheerAmt = Math.min(1, cheerAmt + dt * 0.8);
      world.update(dt, camX, rip, cheerAmt + (D[0].boost > 0 || D[1].boost > 0 ? 0.3 : 0), wave.on ? { x: wave.x, k: wave.k } : null);
      world.frogUpdate(dt, D, fx, audio);
      updateCamera(dt);
      stripT -= dt; if (stripT <= 0) { stripT = 0.05; drawStrip(); }
      refreshHud();
    }
    function resultUpdate(dt) { T += dt; physics(dt * 0.5); for (const d of D) d.spray = false; visuals(dt); }
    function introUpdate(dt) { introT += dt; for (const d of D) { d.spray = false; d.rp = 'sit'; } aim[0].x = D[0].x + D[0].ox; aim[0].z = D[0].z; aim[1].x = D[1].x + D[1].ox; aim[1].z = D[1].z; visuals(dt); }
    placeStrip(); visuals(0.016);

    return {
      update, resultUpdate, introUpdate,
      onResize() { placeStrip(); },
      onSwap() { for (const d of D) fx.particles.burst(d.x, hY(d.x) + 1, d.z, { count: 20, speed: 4, up: 1, life: 0.6, size: 0.3, colors: [0xffe14a, 0xffffff], gravity: 2 }); },
      onDeurman(movers) {
        movers.forEach((m, i) => { if (m && !ended) { const d = D[i]; d.vx = -16; d.vy = 6; d.tank = 0; d.lock = true; d.squash = 1; d.spin = 9; text('DEURMAN!', d.x, d.z, '#ff8a6a', 1.5, 3); audio.sfx('static', { vol: 0.4 }); ctx.shake(0.4); splash(d.x, d.z, 20, 2.4); } });
      },
      celebrate(w) { D[w].rider('cheer', 99); D[1 - w].rider('sad', 99); },
      dispose() {},
      dbg: {
        state: () => ({ T, timeLeft, started, ended, finished, winner, camD, d: D.map((d) => ({ x: +d.x.toFixed(1), z: +d.z.toFixed(1), vx: +d.vx.toFixed(1), vz: +d.vz.toFixed(1), tank: +d.tank.toFixed(0), lock: d.lock, boost: +d.boost.toFixed(1), bubCd: +d.bubCd.toFixed(1), ox: +d.ox.toFixed(1), oz: +d.oz.toFixed(1), bonks: d.bonks, lily: d.lily })),
          aim: aim.map((a) => ({ x: +a.x.toFixed(1), z: +a.z.toFixed(1) })), croc: croc.on ? croc.state : null, boat: boat.on, gold: gold.on, wave: wave.on, bubbles: bubbles.filter((b) => b.on).length, stats: { ...stats } }),
        setTime: (t) => { timeLeft = t; }, setTank: (i, v) => { D[i].tank = v; D[i].lock = false; }, tele: (i, x, z) => { D[i].x = x; if (z != null) D[i].z = z; }, croc: () => startCroc(), gold: () => startGold(), wave: (t) => startWave(t || 'surf'), boat: () => startBoat(), D, aim, course, setEv: (o) => Object.assign(EV, o), rad: () => ({ RJ, W, L }),
      },
    };
  },
};

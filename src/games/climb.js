import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, rand, pick, TAU, canvasTex, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeBrother, Animal, Dragon, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';
import * as LY from './climb_layout.js';
import { buildClimbWorld } from './climb_world.js';

// De Torenklim — race naar de Kasteeltop op twee naast elkaar liggende torens, terwijl de lava stijgt.
//   links/rechts = lopen · A = springen (in de lucht nog eens = dubbele sprong) · B = duw je broer van zijn platform!

const TIME_LIMIT = 80;
const LAVA_START = -7;
const DEAD_TIME = 2.4;
const PUSH_CD = 1.1;

export default {
  id: 'climb',
  name: 'De Torenklim',
  giver: 'Torenwachter Toon',
  icon: '🧗',
  mode: 'pvp',
  time: 70,
  music: 'game_fast',
  blurb: 'Wie plant als eerste de vlag op de <b>Kasteeltop</b>? Spring omhoog langs vliegende stenen, wolken en trampolines, maar pas op voor <b>stekels</b>, <b>rollende tonnen</b> en een <b>vuurspuwende draak</b>. Onderin stijgt de <b>lava</b>! Duw je broer van zijn platform af voor de winst.',
  controls: ['{move} lopen', '{a} springen (in de lucht nog eens = dubbele sprong)', '{b} duw / grijp je broer (laad op: 1 seconde)'],
  tip: 'Pak de <b>gouden schoen</b> voor extra hoge sprongen. Je mag ook naar het midden springen om je broer te duwen. Valt je broer in de lava? Dan krijgt hij een tijdstraf.',

  create(ctx) {
    const { scene, camera, fx, players, audio, hud } = ctx;
    const names = players.map((p) => p.name);
    ctx.lights('day', { shadow: 30, center: [0, 8, 0], fogNear: 90, fogFar: 260 });
    let sun = null; scene.traverse((o) => { if (o.isDirectionalLight) sun = o; });
    camera.fov = 50; camera.updateProjectionMatrix();
    const layout = LY.buildLayout();
    const W = buildClimbWorld(ctx, layout);
    const gm = ctx.pvp.gravity, slip = ctx.pvp.slip;
    const WORLD = { P: layout, gm, sp: 1, slip, size: 1 };

    // ---------------- spelers ----------------
    const GOLD = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffa500, emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.25 });
    const pl = players.map((pp, i) => {
      const ch = makeBrother(i), holder = new THREE.Group(); holder.add(ch.group); scene.add(holder);
      const size = ctx.pvp.size(i), sp = ctx.pvp.speed(i);
      ch.group.scale.setScalar(2.05 / ch.height * size);
      const s = ch.s, boots = [ch.legL, ch.legR].map((lg) => { const b = mesh(new THREE.BoxGeometry(0.27 * s, 0.22 * s, 0.4 * s), GOLD, { pos: [0, -ch.legLen + 0.09 * s, 0.05 * s] }); b.visible = false; lg.add(b); return b; });
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); aura.position.y = 1.0 * size; aura.visible = false; holder.add(aura);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, (g, w, hh) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,30,.9)'; g.lineJoin = 'round'; g.strokeText(pp.name, w / 2, hh / 2); g.fillStyle = pp.css; g.fillText(pp.name, w / 2, hh / 2); }), transparent: true, depthTest: false }));
      tag.scale.set(2.4, 0.9, 1); tag.renderOrder = 15; scene.add(tag);
      const st = LY.newPlayer(i);
      return { i, name: pp.name, css: pp.css, color: PLAYER_COLORS[i], pl: st, ch, holder, boots, aura, tag, size, sp, z: i ? -0.15 : 0.3, pushT: 0, pushCd: 0, inv: 0, knockInv: 0, dead: false, deadT: 0, falls: 0, pushes: 0, hits: 0, blink: 0, burnT: 0, squash: 0, spawnT: 0, maxY: 0, height: 0, hFloor: 0, lastTX: 0, win: false };
    });
    pl.forEach((p) => { p.pl.x = LY.towerX(p.i, 0); p.pl.y = 0; p.pl.ground = layout[0]; p.pl.lastStatic = layout[0]; });

    // ---------------- toestand ----------------
    let T = 0, simT = 0, done = false, state = 'race', endT = 0, winner = null, lavaY = LAVA_START, lavaMult = 1, bestY = 0, lastProgT = 0, stallMsg = 0, introT = 0, camInit = false;
    const textUp = (t, x, y, z, c = '#ffe14a', s = 1) => fx.texts.add(t, x, y, z, c, s);
    const other = (p) => pl[1 - p.i];

    // ---------------- hulp: schade en duwen ----------------
    function knock(p, dirX, vx, vy, stun, why, color = '#ff7a5a') {
      const q = p.pl; q.vx = dirX * vx; q.vy = vy; q.ground = null; q.stun = Math.max(q.stun, stun); q.jumping = false; p.squash = 0.5;
      p.ch.pose = 'scared';
      if (why) textUp(why, q.x, q.y + 2.8 * p.size, p.z, color, 1.1);
    }
    function hurt(p, dirX, why = 'AU!') {
      if (p.dead || p.inv > 0) return false;
      p.inv = 1.0; p.hits++; knock(p, dirX, 6, 10, 0.55, why);
      audio.sfx('hurt', { vol: 0.7 }); ctx.shake(0.3);
      fx.particles.burst(p.pl.x, p.pl.y + 1, p.z, { count: 14, speed: 4, up: 1.2, life: 0.6, size: 0.35, colors: [0xffe14a, 0xff7a5a, 0xffffff], gravity: 9 });
      return true;
    }
    function doPushes(pushers) {
      const hits = [];
      for (const a of pushers) {
        const b = other(a), A = a.pl, B = b.pl;
        a.pushCd = PUSH_CD; a.pushT = 0.3; a.ch.swing(); audio.sfx('swing', { vol: 0.5 }); A.vx += A.face * 2.2;
        if (b.dead || b.knockInv > 0 || b.spawnT > 0) { a.pushCd = 0.7; continue; }
        const dx = B.x - A.x, dy = B.y - A.y, reach = 2.0 * a.size + 0.55 * b.size;
        if (dx * A.face >= -0.6 && Math.abs(dx) <= reach && Math.abs(dy) < 1.7 * Math.max(a.size, b.size) + 0.2) hits.push([a, b, Math.sign(dx) || A.face]);
        else a.pushCd = 0.75;
      }
      for (const [a, b, dir] of hits) {
        const k = clamp(Math.pow(a.size / b.size, 0.5), 0.75, 1.5);
        knock(b, dir, 13.5 * k, 9, 0.55, pick(['BOEM!', 'DUW!', 'WOEPS!', 'VLIEG!']), '#ffffff'); b.knockInv = 0.5; a.pushes++;
        audio.sfx('hit', { vol: 0.8 }); audio.sfx('thud', { vol: 0.4 }); ctx.shake(0.35);
        fx.particles.burst((a.pl.x + b.pl.x) / 2, a.pl.y + 1.1, a.z, { count: 16, speed: 5, up: 1, life: 0.5, size: 0.4, colors: [0xffffff, 0xffe14a], gravity: 6 });
        fx.particles.ring((a.pl.x + b.pl.x) / 2, a.pl.y + 1.1, a.z, { count: 14, speed: 6, color: 0xffffff, size: 0.3, life: 0.3 });
      }
    }

    // ---------------- speler-stap ----------------
    const ci = { x: 0, aP: false, a: false };
    function stepPlayer(p, h, first) {
      const inp = ctx.pvp.input(p.i), q = p.pl;
      if (p.dead) return;
      ci.x = inp.x; ci.aP = first && inp.aP; ci.a = inp.a;
      WORLD.sp = p.sp; WORLD.size = p.size;
      LY.stepPlayer(q, ci, h, WORLD);
      if (q.y > Math.max(p.height, p.hFloor) + 0.01) p.height = q.y;
      for (const e of q.ev) {
        if (e === 'jump') { audio.sfx('jump', { vol: 0.45 }); p.ch.jump(); fx.particles.dust(q.x, q.y, p.z, 4, 0xe8e0d0); }
        else if (e === 'djump') { audio.sfx('boing', { vol: 0.35, rate: 1.5 }); fx.particles.ring(q.x, q.y + 0.2, p.z, { count: 10, speed: 3.5, color: 0xffffff, size: 0.28, life: 0.35 }); p.ch.jump(); }
        else if (e === 'land') { audio.sfx('land', { vol: 0.35 }); fx.particles.dust(q.x, q.y, p.z, 5, 0xe8e0d0); p.squash = 0.35; }
        else if (e === 'spring') { audio.sfx('boing', { vol: 0.8 }); ctx.shake(0.1); fx.particles.burst(q.x, q.y, p.z, { count: 16, speed: 4, up: 1.5, life: 0.6, size: 0.35, colors: [0xffffff, 0xff6a5a, 0xffe14a], gravity: 6 }); textUp('BOING!', q.x, q.y + 2.5, p.z, '#ffd23f', 1); const sm = q.bounce && W.meshes.get(q.bounce.id); if (sm && sm.parts.top) { sm.parts.top.position.y = 0.9; sm.g.scale.y = 0.6; } }
        else if (e === 'pad') { audio.sfx('whoosh', { vol: 0.7 }); fx.particles.burst(q.x, q.y, p.z, { count: 14, speed: 3, up: 2, life: 0.6, size: 0.35, colors: [0x7fe8ff, 0xffffff], gravity: 2 }); }
      }
      // stekels
      const g = q.ground;
      if (g && g.spikes && p.inv <= 0) {
        const hw = LY.FEET_HW * p.size;
        for (const [xa, xb] of LY.spikeRanges(g)) if (q.x + hw > xa && q.x - hw < xb) { hurt(p, q.x < (xa + xb) / 2 ? -1 : 1, 'STEKELS!'); break; }
      }
    }

    // ---------------- lava ----------------
    function respawnPlatform(p) {
      const q = p.pl, last = q.lastStatic ? q.lastStatic.y0 : 0, minY = lavaY + 3.2;
      const ok = layout.filter((r) => (r.tower === p.i || r.tower === 2) && !r.spikes && (r.type === 'stone' || r.type === 'bridge' || r.type === 'ground') && r.y0 >= minY && r.w >= 3);
      let c = ok.filter((r) => r.y0 <= Math.max(last, minY) + 0.01);
      if (!c.length) c = ok.sort((a, b) => a.y0 - b.y0).slice(0, 1);
      return c.reduce((a, b) => (b.y0 > a.y0 ? b : a), c[0]);
    }
    function burn(p) {
      if (p.dead || state !== 'race') return;
      p.dead = true; p.deadT = DEAD_TIME; p.falls++; const q = p.pl;
      audio.sfx('splash', { vol: 0.8, rate: 0.7 }); audio.sfx('sizzle', { vol: 0.8 }); ctx.shake(0.5);
      fx.particles.burst(q.x, lavaY + 0.3, p.z, { count: 40, speed: 7, up: 1.8, life: 1.0, size: 0.6, colors: [0xff7a1a, 0xffe070, 0xff4a1a, 0x444444], gravity: 12 });
      textUp('PSSSSSST!', q.x, lavaY + 2.5, p.z, '#ff8a3a', 1.3); hud.toast(`${p.name} valt in de lava! (2,4 sec straf)`, 1600);
      p.holder.visible = false; p.tag.visible = false;
      if (pl.every((r) => r.dead)) endGame(pl[0].height >= pl[1].height ? (Math.abs(pl[0].height - pl[1].height) < 0.3 ? null : pl[0]) : pl[1], 'lava');
    }
    function respawn(p) {
      const t = respawnPlatform(p), q = p.pl;
      p.dead = false; p.hFloor = t.y > p.height ? t.y : 0; q.x = t.x; q.y = t.y; q.vx = q.vy = 0; q.ground = t; q.stun = 0; q.jumping = false; p.inv = 1.4; p.spawnT = 0.5; p.knockInv = 0.5;
      p.holder.visible = true; p.tag.visible = true; audio.sfx('powerup', { vol: 0.5 }); textUp('Terug!', q.x, q.y + 3, p.z, '#7fe8ff', 1);
      fx.particles.burst(q.x, q.y + 0.2, p.z, { count: 22, speed: 5, up: 1.4, life: 0.6, size: 0.4, colors: [0xffe14a, 0xff7a1a, 0xffffff], gravity: 5 });
    }
    function lavaStep(dt) {
      const maxY = Math.max(pl[0].height, pl[1].height);
      if (maxY > bestY + 1.0) { bestY = maxY; lastProgT = T; }
      const stalled = T - lastProgT > 5.5;
      if (stalled && T - stallMsg > 6) { stallMsg = T; hud.toast('🌋 De lava wordt ongeduldig!', 1500); audio.sfx('creak', { vol: 0.5 }); }
      lavaMult = damp(lavaMult, stalled ? 2.6 : 1, 2, dt);
      let sp = (0.5 + 0.0045 * T) * lavaMult;
      // wie ver voor ligt trekt de lava mee omhoog: nooit meer dan 30 eenheden onder de leider
      const minY = Math.max(pl[0].height, pl[1].height) - 30;
      lavaY += sp * dt; if (lavaY < minY) lavaY = Math.min(minY, lavaY + 3 * dt);
      for (const p of pl) if (!p.dead && p.pl.y + 0.5 < lavaY) burn(p);
    }

    // ---------------- tonnen op de bruggen ----------------
    const bridges = layout.filter((p) => p.bridge), barrels = [];
    const barrelTex = tex.planks(2, 1, '#8a5a30');
    function makeBarrel() {
      const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
      inner.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 12), new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.9 }), { rot: [Math.PI / 2, 0, 0] }));
      for (const z of [-0.4, 0.4]) inner.add(mesh(new THREE.TorusGeometry(0.64, 0.05, 5, 14), mat(0x555555, { metalness: 0.5 }), { pos: [0, 0, z] }));
      inner.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 1.4), mat(0xffd23f), { cast: false }));
      g.userData.inner = inner; scene.add(g); return g;
    }
    const bTimers = bridges.map((b, i) => 3 + i * 1.7);
    function barrelStep(dt) {
      bridges.forEach((b, i) => {
        bTimers[i] -= dt;
        if (bTimers[i] <= 0) {
          bTimers[i] = rand(4.2, 6.2);
          if (pl.some((p) => !p.dead && Math.abs(p.pl.y - b.y) < 15)) {
            const side = Math.random() < 0.5 ? -1 : 1, m = makeBarrel();
            barrels.push({ m, b, x: b.x + side * (b.w / 2 + 0.2), y: b.y + 0.62, vx: -side * 4.6, vy: 0, on: true, rot: 0 });
            audio.sfx('wood', { vol: 0.35 });
          }
        }
      });
      for (let n = barrels.length - 1; n >= 0; n--) {
        const o = barrels[n];
        if (o.on) {
          o.x += o.vx * dt; o.y = o.b.y + 0.62;
          if (Math.abs(o.x - o.b.x) > o.b.w / 2 + 0.7) { o.on = false; o.vy = 2; o.vx *= 1.1; }
        } else { o.vy -= 32 * dt; o.y += o.vy * dt; o.x += o.vx * dt; }
        o.rot -= o.vx * dt / 0.62; o.m.userData.inner.rotation.z = o.rot; o.m.position.set(o.x, o.y, 0.15);
        if (Math.random() < dt * 8 && o.on) fx.particles.dust(o.x, o.y - 0.6, 0.2, 1, 0xd8c8a8);
        for (const p of pl) {
          if (p.dead || p.inv > 0) continue;
          const q = p.pl, dx = q.x - o.x;
          if (Math.abs(dx) < 0.55 * p.size + 0.62 && q.y < o.y + 0.75 && q.y + 1.9 * p.size > o.y - 0.5) {
            hurt(p, Math.sign(dx) || 1, 'TON!'); q.vx = (Math.sign(dx) || 1) * 8;
          }
        }
        if (o.y < lavaY - 2 || o.y < -8) { scene.remove(o.m); barrels.splice(n, 1); }
      }
    }

    // ---------------- draak ----------------
    const dragon = new Dragon(0x7a2fd4, 0.95); dragon.group.visible = false; scene.add(dragon.group);
    const bandM = new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bandM); band.visible = false; band.renderOrder = 6; scene.add(band);
    const jetM = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const jet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), jetM); jet.visible = false; jet.renderOrder = 7; scene.add(jet);
    const D = { state: 'wait', t: 12, side: 1, x: 0, y: 0, ty: 0, tower: 0, time: 0, hit: [false, false] };
    function dragonStep(dt) {
      if (state !== 'race') { dragon.group.visible = false; band.visible = jet.visible = false; return; }
      if (D.state === 'wait') {
        D.t -= dt; if (D.t > 0) return;
        const leader = pl[0].pl.y >= pl[1].pl.y ? pl[0] : pl[1];
        D.tower = leader.i; D.side = leader.i === 0 ? -1 : 1; D.state = 'arrive'; D.time = 0; D.x = D.side * 27; D.y = leader.pl.y + 2; D.hit = [false, false];
        dragon.group.visible = true; hud.toast('🐉 De draak kijkt naar de leider...', 1800); audio.sfx('creak', { vol: 0.6 });
      }
      D.time += dt;
      const leader = pl[D.tower], ty = leader.pl.y + 1.0;
      if (D.state === 'arrive') { D.x = lerp(D.side * 27, D.side * 15.8, smoothstep(0, 1.4, D.time)); D.y = damp(D.y, ty + 1.2, 3, dt); if (D.time > 1.4) { D.state = 'aim'; D.time = 0; } }
      else if (D.state === 'aim') { D.y = damp(D.y, ty + 1.2, 3, dt); if (D.time > 1.5) { D.state = 'fire'; D.time = 0; D.ly = D.y; audio.sfx('explode', { vol: 0.5, rate: 0.6 }); ctx.shake(0.3); } }
      else if (D.state === 'fire') { if (D.time > 1.2) { D.state = 'leave'; D.time = 0; } }
      else if (D.state === 'leave') { D.x = lerp(D.side * 15.8, D.side * 28, smoothstep(0, 1.2, D.time)); if (D.time > 1.2) { D.state = 'wait'; D.t = rand(15, 20); dragon.group.visible = false; band.visible = jet.visible = false; return; } }
      dragon.group.position.set(D.x, D.y - 1.2, 2.2); dragon.group.rotation.y = -D.side * Math.PI / 2; dragon.update(dt);
      const mouthX = D.x - D.side * 3.2, mouthY = (D.state === 'fire' ? D.ly : D.y) + 0.1, len = 19;
      if (D.state === 'aim' || D.state === 'fire') {
        const cx = mouthX - D.side * len / 2;
        band.visible = D.state === 'aim'; band.position.set(cx, mouthY, 1.0); band.scale.set(len, 2.0, 1); bandM.opacity = 0.14 + 0.18 * Math.abs(Math.sin(D.time * (D.state === 'aim' ? 9 : 1)));
        jet.visible = D.state === 'fire'; jet.position.set(cx, mouthY, 1.0); jet.scale.set(len * clamp(D.time * 6, 0.1, 1), 1.6 + Math.sin(T * 40) * 0.25, 1); jet.position.x = mouthX - D.side * jet.scale.x / 2;
        if (D.state === 'fire') {
          for (let k = 0; k < 4; k++) fx.particles.emit(mouthX - D.side * rand(0.5, 3), mouthY + rand(-0.6, 0.6), 1, -D.side * rand(14, 22), rand(-1, 1), 0, { life: 0.5, size: rand(0.6, 1.1), color: Math.random() < 0.5 ? 0xff8a1a : 0xffd23f, gravity: -1 });
          for (const p of pl) {
            if (p.dead || D.hit[p.i]) continue;
            const q = p.pl, inX = D.side < 0 ? (q.x > mouthX && q.x < mouthX + jet.scale.x) : (q.x < mouthX && q.x > mouthX - jet.scale.x);
            if (inX && q.y + 2.0 * p.size > mouthY - 1.0 && q.y < mouthY + 1.0 && p.inv <= 0) { D.hit[p.i] = true; p.burnT = 1.0; hurt(p, -D.side, 'VUUR!'); q.vx = -D.side * 7.5; q.vy = 11; q.stun = 0.8; }
          }
        }
      } else { band.visible = false; jet.visible = false; }
      if (D.state === 'aim' && Math.random() < dt * 8) fx.particles.emit(mouthX, mouthY, 1.2, -D.side * rand(2, 4), rand(0, 1), 0, { life: 0.4, size: 0.5, color: 0xffa020, gravity: -1 });
    }

    // ---------------- kip uit een tonnetje ----------------
    const chickens = []; let chT = 8;
    function makeChicken() {
      const a = new Animal('chicken'); a.group.scale.setScalar(2.1); scene.add(a.group);
      const wings = [1, -1].map((sd) => { const w = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), mat(0xf6f1e4), { cast: false, pos: [sd * 0.3, 0.5, 0] }); a.group.add(w); return w; });
      const bar = P.barrel(1.6); scene.add(bar);
      return { a, wings, bar };
    }
    function chickenStep(dt) {
      if (state !== 'race') return;
      chT -= dt;
      if (chT <= 0) {
        chT = rand(8, 12); const ref = Math.max(pl[0].pl.y, pl[1].pl.y), side = Math.random() < 0.5 ? -1 : 1, y0 = clamp(ref + rand(-5, 6), 7, LY.TOP_Y - 8);
        const c = makeChicken(); c.bar.position.set(side * 19.5, y0 - 1.2, 0.5); c.bar.rotation.z = side * 0.8;
        chickens.push({ ...c, x: side * 19, y0, y: y0, vx: -side * 9, t: 0, dead: false, spin: 0, side, pop: 0.5 });
        audio.sfx('pop', { vol: 0.6 }); hud.toast('🐔 Kip uit het tonnetje!', 1300); fx.particles.burst(side * 19, y0, 0.5, { count: 14, speed: 4, up: 1.2, life: 0.6, size: 0.4, colors: [0xffffff, 0xf2a33a, 0xd8372c], gravity: 6 });
      }
      for (let n = chickens.length - 1; n >= 0; n--) {
        const c = chickens[n]; c.t += dt; c.pop -= dt;
        if (!c.dead) {
          c.x += c.vx * dt; c.y = c.y0 + Math.sin(c.t * 2.6) * 2.4 + c.t * 0.3; c.a.group.position.set(c.x, c.y, 0.2); c.a.group.rotation.set(0, Math.sign(c.vx) * Math.PI / 2, Math.sin(c.t * 18) * 0.15); c.a.speed = 1; c.a.update(dt);
          c.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(c.t * 26) * 0.9; });
          if (Math.random() < dt * 14) fx.particles.emit(c.x, c.y + 0.6, 0.2, rand(-1, 1), rand(0, 1), rand(-1, 1), { life: 0.6, size: 0.25, color: 0xffffff, gravity: 3 });
          for (const p of pl) {
            if (p.dead || p.inv > 0) continue;
            const q = p.pl;
            if (Math.abs(q.x - c.x) < 0.65 * p.size + 0.8 && q.y < c.y + 0.8 && q.y + 2 * p.size > c.y - 0.3) {
              knock(p, Math.sign(c.vx), 7, 7, 0.35, 'KOEK!', '#ffffff'); p.inv = 0.6; c.dead = true; c.vy = 6; audio.sfx('boing', { vol: 0.6, rate: 1.4 }); ctx.shake(0.15);
              fx.particles.burst(c.x, c.y, 0.2, { count: 22, speed: 5, up: 1, life: 0.9, size: 0.4, colors: [0xffffff, 0xf6f1e4, 0xf2a33a], gravity: 4 });
            }
          }
          if (Math.abs(c.x) > 22) { scene.remove(c.a.group); scene.remove(c.bar); chickens.splice(n, 1); }
        } else {
          c.vy -= 30 * dt; c.y += c.vy * dt; c.x += c.vx * dt * 0.4; c.spin += dt * 10; c.a.group.position.set(c.x, c.y, 0.2); c.a.group.rotation.set(c.spin, c.a.group.rotation.y, 0);
          if (c.y < lavaY - 3) { scene.remove(c.a.group); scene.remove(c.bar); chickens.splice(n, 1); }
        }
        c.bar.scale.setScalar(Math.max(0.01, c.pop > 0 ? 1 + c.pop * 0.6 : 1)); c.bar.visible = c.t < 1.6;
      }
    }

    // ---------------- blauwe schildpad (comeback: de leider krijgt even last) ----------------
    const shell = new THREE.Group(); shell.visible = false; scene.add(shell);
    {
      const blue = mat(0x2a6aff, { flatShading: false, roughness: 0.4 }), wh = mat(0xf4f0e6);
      shell.add(mesh(new THREE.SphereGeometry(0.9, 14, 10, 0, TAU, 0, Math.PI / 2), blue, { pos: [0, 0, 0], scale: [1.1, 0.9, 1.1] }));
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; shell.add(mesh(new THREE.ConeGeometry(0.16, 0.55, 5), wh, { pos: [Math.cos(a) * 0.95, 0.35, Math.sin(a) * 0.95], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] })); }
      shell.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 5), wh, { pos: [0, 0.95, 0] }));
      shell.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0x7fcf4a), { pos: [0, 0.2, 1.0] })); shell.scale.setScalar(1.3);
    }
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 24), new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false })); mark.visible = false; mark.renderOrder = 8; scene.add(mark);
    const Tt = { state: 'wait', t: 14, tgt: null, x: 0, y: 0, lockX: 0, time: 0, leadT: 0 };
    function turtleStep(dt) {
      if (state !== 'race') { shell.visible = false; mark.visible = false; return; }
      const lead = pl[0].pl.y >= pl[1].pl.y ? pl[0] : pl[1], trail = other(lead), gap = lead.pl.y - trail.pl.y;
      if (Tt.state === 'wait') {
        Tt.t -= dt; Tt.leadT = (gap > 7 && !lead.dead && !trail.dead) ? Tt.leadT + dt : Math.max(0, Tt.leadT - dt);
        if (Tt.t <= 0 && Tt.leadT > 3.5 && lead.pl.y > 14) { Tt.state = 'warn'; Tt.tgt = lead; Tt.time = 0; Tt.x = lead.pl.x; Tt.y = lead.pl.y + 10; hud.showBig('🐢 BLAUWE SCHILDPAD!', 1400, '#6fb4ff'); audio.sfx('creak', { vol: 0.6 }); shell.visible = true; mark.visible = true; }
        return;
      }
      const tg = Tt.tgt; Tt.time += dt;
      if (Tt.state === 'warn') {
        // zweeft boven de leider en volgt hem; na 1,6 s duikt hij naar beneden en stopt met volgen vlak voor de inslag
        Tt.x = damp(Tt.x, tg.pl.x, 6, dt); Tt.y = lead.pl.y + 9.5 + Math.sin(Tt.time * 6) * 0.3;
        shell.position.set(Tt.x, Tt.y, 0.3); shell.rotation.y += dt * 9; mark.position.set(Tt.x, tg.pl.y + 0.1, 0.9); mark.rotation.x = 0; mark.scale.setScalar(1 + Math.sin(Tt.time * 12) * 0.12);
        if (Tt.time > 1.7) { Tt.state = 'dive'; Tt.time = 0; }
      } else if (Tt.state === 'dive') {
        const down = 24; Tt.py = Tt.y; Tt.y -= down * dt; const toGround = Tt.y - (tg.pl.y + 0.8);
        if (toGround > 5) Tt.x = damp(Tt.x, tg.pl.x, 4, dt);                     // laatste 5 eenheden: vergrendeld, de leider kan nog opzij
        shell.position.set(Tt.x, Tt.y, 0.3); shell.rotation.y += dt * 12; mark.position.set(Tt.x, tg.pl.y + 0.1, 0.9);
        let impact = false;
        for (const r of layout) { if (r.gone || r.spring || r.pad) continue; if (Math.abs(r.x - Tt.x) < r.w / 2 + 0.5 && Tt.y - 0.3 <= r.y && Tt.py - 0.3 > r.y - 0.01) impact = true; }
        for (const p of pl) if (!p.dead && Math.abs(p.pl.x - Tt.x) < 0.9 + 0.4 * p.size && Tt.y < p.pl.y + 2.0 * p.size && Tt.y > p.pl.y - 0.2) impact = true;
        if (impact || Tt.time > 3) {
          shell.visible = false; mark.visible = false; Tt.state = 'wait'; Tt.t = rand(20, 26); Tt.leadT = 0;
          audio.sfx('explode', { vol: 0.8 }); ctx.shake(0.6);
          fx.particles.burst(Tt.x, Tt.y, 0.3, { count: 40, speed: 8, up: 1.4, life: 0.9, size: 0.55, colors: [0x2a6aff, 0x7fcfff, 0xffffff], gravity: 7 });
          fx.particles.ring(Tt.x, Tt.y + 0.2, 0.3, { count: 22, speed: 8, color: 0x7fcfff, size: 0.4, life: 0.5 });
          textUp('SPLASH!', Tt.x, Tt.y + 2, 0.5, '#7fcfff', 1.3);
          for (const p of pl) if (!p.dead && Math.abs(p.pl.x - Tt.x) < 2.4 && Math.abs(p.pl.y - Tt.y) < 3) { if (p.inv <= 0) { hurt(p, Math.sign(p.pl.x - Tt.x) || 1, 'SCHILDPAD!'); p.pl.stun = 1.0; p.pl.vy = 6; } }
        }
      }
    }

    // ---------------- gouden schoenen ----------------
    const shoeTaken = new Set();
    function shoeStep(dt) {
      for (const p of layout) {
        if (!p.shoe || shoeTaken.has(p.id)) continue;
        const m = W.meshes.get(p.id).parts.shoe; if (m) { m.rotation.y += dt * 2.5; m.position.y = 0.9 + Math.sin(T * 3 + p.id) * 0.15; }
        for (const q of pl) {
          if (q.dead) continue;
          if (Math.abs(q.pl.x - p.x) < 1.0 + 0.3 * q.size && Math.abs(q.pl.y + 0.9 - (p.y + 0.9)) < 1.6) {
            shoeTaken.add(p.id); if (m) m.visible = false; q.pl.shoe = 9; audio.sfx('powerup', { vol: 0.8 }); audio.sfx('sparkle', { vol: 0.6 });
            textUp('GOUDEN SCHOEN!', q.pl.x, q.pl.y + 3.2, q.z, '#ffe14a', 1.3); hud.toast(`${q.name} heeft de gouden schoen! Extra hoge sprongen`, 1500);
            fx.particles.burst(q.pl.x, q.pl.y + 0.3, q.z, { count: 26, speed: 5, up: 1.4, life: 0.8, size: 0.4, colors: [0xffe14a, 0xffffff, 0xffa500], gravity: 5 });
          }
        }
      }
    }

    // ---------------- visuals ----------------
    function visuals(dt) {
      // platforms
      for (const p of layout) {
        const m = W.meshes.get(p.id); m.g.position.set(p.x, p.y, 0);
        if (p.type === 'cloud') {
          const cg = m.parts.cloud; cg.visible = !p.gone; const shake = p.standT > 0.3 ? Math.sin(T * 60) * 0.08 * (p.standT - 0.3) : 0; cg.position.x = shake; cg.position.y = p.gone ? 0 : -clamp(p.standT - 0.5, 0, 1) * 0.3; const s2 = p.gone && p.goneT < 0.5 ? 1 : 1; cg.scale.setScalar(s2);
          if (p.standT > 0.6 && Math.random() < dt * 20) fx.particles.emit(p.x + rand(-p.w / 2, p.w / 2), p.y - 0.3, 0, rand(-0.5, 0.5), rand(-1, -0.2), 0, { life: 0.5, size: 0.35, color: 0xffffff, gravity: 3 });
        }
        if (p.spring && m.parts.top) { m.parts.top.position.y = damp(m.parts.top.position.y, 0, 14, dt); m.g.scale.y = damp(m.g.scale.y, 1, 14, dt); }
        if (p.pad && m.parts.plate) m.parts.plate.material.emissiveIntensity = 0.7 + Math.sin(T * 6 + p.id) * 0.3;
      }
      for (const p of pl) {
        const q = p.pl, c = p.ch;
        p.holder.position.set(q.x, q.y + (p.spawnT > 0 ? (0.5 - p.spawnT) * 0 : 0), p.z);
        p.squash = Math.max(0, p.squash - dt * 2);
        const sq = 1 + Math.sin(clamp(p.squash, 0, 0.5) / 0.5 * Math.PI) * 0.12; p.holder.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        const moving = Math.abs(q.vx) > 0.6;
        if (moving) c.faceDir(q.face, 0.38); else c.faceDir(q.face * 0.5, 1);
        c.speed = q.ground ? clamp(Math.abs(q.vx) / LY.RUN, 0, 1) : 0; c.air = !q.ground;
        p.pushT = Math.max(0, p.pushT - dt); p.pushCd = Math.max(0, p.pushCd - dt); p.inv = Math.max(0, p.inv - dt); p.knockInv = Math.max(0, p.knockInv - dt); p.spawnT = Math.max(0, p.spawnT - dt); p.burnT = Math.max(0, p.burnT - dt);
        c.pose = state !== 'race' ? (p.win ? 'cheer' : 'sad') : q.stun > 0 ? 'scared' : p.pushT > 0 ? 'push' : 'idle';
        c.update(dt);
        p.holder.visible = !p.dead && !(p.inv > 0 && p.inv < 1.2 && p.spawnT <= 0 && Math.sin(T * 40) > 0.3 && q.stun <= 0);
        for (const b of p.boots) b.visible = q.shoe > 0;
        p.aura.visible = q.shoe > 0; if (q.shoe > 0) { p.aura.scale.setScalar(1 + Math.sin(T * 9) * 0.06); p.aura.material.opacity = q.shoe < 2 ? (Math.sin(T * 26) > 0 ? 0.2 : 0.04) : 0.18; if (Math.random() < dt * 20) fx.particles.emit(q.x + rand(-0.4, 0.4), q.y + 0.1, p.z, 0, 0.5, 0, { life: 0.5, size: 0.3, color: 0xffe14a, gravity: -0.5 }); }
        if (p.burnT > 0 && Math.random() < dt * 40) fx.particles.emit(q.x + rand(-0.4, 0.4), q.y + rand(0.2, 2), p.z, 0, 2, 0, { life: 0.5, size: 0.4, color: Math.random() < 0.5 ? 0xff8a1a : 0xffd23f, gravity: -2 });
        p.tag.visible = !p.dead; p.tag.position.set(q.x, q.y + 2.05 * p.size + 0.9, p.z + 0.4);
        if (q.ground && Math.abs(q.vx) > 3 && Math.random() < dt * 6) fx.particles.dust(q.x - q.face * 0.3, q.y, p.z, 1, 0xe8e0d0);
      }
      for (const b of barrels) { /* positie in barrelStep */ }
    }

    // ---------------- camera ----------------
    const camP = new THREE.Vector3(0, 12, 28), camT = new THREE.Vector3(0, 10, 0);
    let camY = 9, camDist = 26;
    function cam(dt, cine = null) {
      const a = pl[0].pl, b = pl[1].pl;
      const yA = pl[0].dead ? Math.max(lavaY + 2, a.y) : a.y, yB = pl[1].dead ? Math.max(lavaY + 2, b.y) : b.y;
      const hi = Math.max(yA, yB), lo = Math.min(yA, yB), gap = hi - lo;
      const need = Math.max(10, gap / 2 + 6.2);
      let dist = need / 0.466; dist = Math.max(dist, 17.8 / (0.466 * Math.max(1.2, camera.aspect)));
      let wantY = (hi + lo) / 2 + 2.2;
      if (cine) { wantY = cine.y; dist = cine.dist; }
      if (!camInit) { camY = wantY; camDist = dist; camInit = true; }
      camY = damp(camY, wantY, cine ? 3 : 5, dt); camDist = damp(camDist, dist, 2.6, dt);
      camera.position.set(cine ? cine.x : 0, camY + 1.0, camDist); camera.lookAt(cine ? cine.x : 0, camY, 0);
      W.setSky(camY);
      if (sun) { sun.position.set(14, camY + 30, 24); sun.target.position.set(0, camY, 0); sun.target.updateMatrixWorld(); }
    }

    // ---------------- einde ----------------
    function endGame(w, why) {
      if (state !== 'race') return;
      state = 'end'; endT = 0; winner = w; if (w) w.win = true;
      const sc = pl.map((p) => Math.round(p.height)); const loser = w ? other(w) : null;
      hud.setHint(null);
      if (w) { hud.showBig(why === 'top' ? '🚩 KASTEELTOP!' : why === 'lava' ? '🌋 LAVA!' : '⏱ TIJD!', 1300, w.css); audio.sfx('win', { vol: 0.6 }); }
      const funny = w ? [`${w.name} plant de vlag op de Kasteeltop!`, `${loser.name} duwde, sprong en viel ${loser.falls}x in de lava...`, `${w.name} duwde ${w.pushes}x en klom als een kasteelgeit.`, `Wat een klim, ${w.name}!`] : ['Even hoog! Lava wint.'];
      const why2 = why === 'top' ? '' : why === 'tijd' ? 'De tijd is om: ' : 'Allebei in de lava: ';
      ctx.finishPvp({ winner: w ? w.i : null, score: sc, delay: 3000, summary: `${why2}<b>${w ? w.name + ' komt het hoogst' : 'Gelijkspel'}</b> (${sc[0]} m tegen ${sc[1]} m).<br>${pick(funny)}${pl[0].pushes + pl[1].pushes ? `<br>Duwtjes: ${names[0]} ${pl[0].pushes}, ${names[1]} ${pl[1].pushes}. Lava-duiken: ${pl[0].falls} / ${pl[1].falls}.` : ''}` });
    }
    function flagCheck() {
      for (const p of pl) {
        if (p.dead) continue;
        for (const t of layout) {
          if (!t.top) continue;
          if (Math.abs(p.pl.x - t.x) < 1.6 && p.pl.y >= t.y - 0.2 && p.pl.y < t.y + 5) { endGame(p, 'top'); return; }
        }
      }
    }
    function endStep(dt) {
      endT += dt;
      for (const p of pl) { p.ch.pose = p.win ? 'cheer' : 'sad'; }
      if (endT > 0.2 && Math.random() < dt * 14) { const w = winner || pl[0]; fx.particles.burst(w.pl.x + rand(-5, 5), w.pl.y + rand(3, 8), 1, { count: 26, speed: 6, up: 1, life: 1.3, size: 0.5, colors: [0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a, 0xffffff, 0xff8a3a], gravity: 3 }); if (Math.random() < 0.5) audio.sfx('sparkle', { vol: 0.35 }); }
    }

    // ---------------- hoofdlus ----------------
    function allSteps(dt, active) {
      const n = Math.max(1, Math.ceil(dt / 0.025)), h = dt / n;
      for (let s = 0; s < n; s++) {
        simT += h; LY.updatePlatforms(layout, simT, h);
        if (active) {
          const pushers = pl.filter((p) => !p.dead && p.pl.stun <= 0 && p.pushCd <= 0 && s === 0 && ctx.pvp.input(p.i).bP);
          if (pushers.length) doPushes(pushers);
        }
        for (const p of pl) { if (!active) { if (p.pl.ground) { p.pl.x += p.pl.ground.dx; p.pl.y = p.pl.ground.y; } continue; } stepPlayer(p, h, s === 0); }
      }
    }
    function update(dt) {
      if (done) return;
      T += dt;
      if (state === 'end') { allSteps(dt, false); endStep(dt); finish(dt); return; }
      allSteps(dt, true);
      if (state === 'race') {
        for (const p of pl) if (p.dead) { p.deadT -= dt; if (p.deadT <= 0) respawn(p); }
        lavaStep(dt); flagCheck();
      }
      if (state === 'race') { barrelStep(dt); dragonStep(dt); chickenStep(dt); turtleStep(dt); shoeStep(dt); }
      if (state === 'race' && T >= TIME_LIMIT) { const a = pl[0].height, b = pl[1].height; hud.toast('Tijd is om!', 1300); endGame(Math.abs(a - b) < 0.3 ? null : a > b ? pl[0] : pl[1], 'tijd'); }
      finish(dt);
    }
    function finish(dt) {
      const camCine = state === 'end' && winner ? { x: clamp(winner.pl.x * 0.4, -6, 6), y: winner.pl.y + 2.5, dist: 22 } : null;
      visuals(dt); W.update(T, dt, camY); W.setLava(lavaY, T); cam(dt, camCine);
      // lava-bubbels, alleen als de lava in beeld is
      if (camY - camDist * 0.466 < lavaY + 3 && Math.random() < dt * 30) fx.particles.emit(rand(-18, 18), lavaY + 0.2, 1.8, rand(-1, 1), rand(3, 7), 0, { life: 0.8, size: 0.5, color: Math.random() < 0.5 ? 0xff8a1a : 0xffd23f, gravity: 10 });
      // HUD
      const rank = pl[0].height >= pl[1].height ? 0 : 1;
      pl.forEach((p) => hud.setPlayerInfo(p.i, `↑ ${Math.round(p.height)} m${p.i === rank && Math.round(pl[0].height) !== Math.round(pl[1].height) ? ' 👑' : ''}${p.dead ? ' 🔥' : ''}${p.pl.shoe > 0 ? ' 👟' : ''}`));
      hud.setScore(`🧗 ${names[0]} ${Math.round(pl[0].height)} m  –  ${Math.round(pl[1].height)} m ${names[1]}   ·   top ${Math.round(LY.TOP_Y)} m`);
      hud.setTimer(Math.max(0, TIME_LIMIT - T), 12);
    }
    function introUpdate(dt) {
      introT += dt; T = 0;
      for (const p of pl) { p.ch.pose = 'idle'; p.ch.faceDir(p.pl.face * 0.5, 1); p.ch.update(dt); p.holder.position.set(p.pl.x, 0, p.z); }
      LY.updatePlatforms(layout, 0, 0); visuals(dt); W.update(introT, dt, 0); W.setLava(lavaY, introT);
      // beginshot: de torens van onder naar boven
      const a = Math.min(1, introT / 5), f = a * a * (3 - 2 * a);
      cam(dt, { x: 0, y: lerp(60, 9, f), dist: lerp(40, 27, f) });
      hud.setTimer(TIME_LIMIT); hud.setScore('🧗 Wie bereikt als eerste de Kasteeltop?');
    }
    function resultUpdate(dt) { T += dt; allSteps(dt, false); endStep(dt); finish(dt); }

    hud.setTimer(TIME_LIMIT); hud.setScore('🧗');
    LY.updatePlatforms(layout, 0, 0); visuals(0.016); W.setLava(lavaY, 0); cam(0.016);
    return {
      update, introUpdate, resultUpdate,
      onStart() { hud.setHint('<b>A</b> = springen (in de lucht nog eens = dubbele sprong) · <b>B</b> = duw je broer · pak de gouden schoen!'); setTimeout(() => hud.setHint(null), 6000); },
      celebrate(w) { pl.forEach((p) => { p.win = p.i === w; }); },
      onDeurman(movers) { movers.forEach((m, i) => { if (m && !pl[i].dead) { pl[i].pl.stun = 1.3; textUp('BEWOOOGD!', pl[i].pl.x, pl[i].pl.y + 3, pl[i].z, '#ff5a5a', 1.2); audio.sfx('hurt'); } }); },
      onSwap() { pl.forEach((p) => { fx.particles.ring(p.pl.x, p.pl.y + 1, p.z, { count: 20, speed: 5, color: 0xffe14a, size: 0.4, life: 0.5 }); textUp('WISSEL!', p.pl.x, p.pl.y + 3, p.z, '#ffe14a', 1.2); }); },
      dispose() { /* meshes worden door het raamwerk opgeruimd */ },
      dbg: {
        P: layout, players: pl, W, D, Tt, barrels, chickens, LY,
        state: () => ({ T, state, lava: lavaY, lavaMult, winner: winner ? winner.i : -1, dragon: D.state, turtle: Tt.state, p: pl.map((p) => ({ x: p.pl.x, y: p.pl.y, vx: p.pl.vx, vy: p.pl.vy, maxY: p.pl.maxY, height: p.height, dead: p.dead, stun: p.pl.stun, shoe: p.pl.shoe, ground: p.pl.ground ? p.pl.ground.id : -1, falls: p.falls, pushes: p.pushes, hits: p.hits, inv: p.inv })) }),
        warp: (i, x, y) => { const q = pl[i].pl; q.x = x; q.y = y; q.vx = q.vy = 0; q.ground = null; if (y > q.maxY) q.maxY = y; pl[i].height = Math.max(pl[i].height, y); },
        warpTo: (i, id) => { const q = pl[i].pl, t = layout.find((p) => p.id === id); q.x = t.x; q.y = t.y; q.vx = q.vy = 0; q.ground = t; q.maxY = Math.max(q.maxY, t.y); pl[i].height = Math.max(pl[i].height, t.y); },
        setLava: (y) => { lavaY = y; },
        dragonNow: () => { D.t = 0; }, turtleNow: () => { Tt.t = 0; Tt.leadT = 10; }, chickenNow: () => { chT = 0; },
        endNow: (i, why) => endGame(pl[i], why),
      },
    };
  },
};

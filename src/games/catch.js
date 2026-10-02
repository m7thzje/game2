import * as THREE from 'three';
import { mat, mesh, clamp, damp, lerp, rand, pick, TAU, glow } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';

// Broodjes Vangen (Mario Party "vang-de-regen"): samen zoveel mogelijk vers brood opvangen.
// Voorbeeldgame: lees dit om te zien hoe een minigame in elkaar zit (zie docs/MINIGAME_API.md).

const DURATION = 45;
const KINDS = [
  { id: 'loaf', w: 34, pts: 1, make: () => P.bread('loaf') },
  { id: 'bun', w: 26, pts: 1, make: () => P.bread('bun') },
  { id: 'pretzel', w: 16, pts: 2, make: () => P.bread('pretzel') },
  { id: 'croissant', w: 10, pts: 2, make: () => P.bread('croissant') },
  { id: 'golden', w: 5, pts: 6, make: () => { const g = P.bread('loaf'); g.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 }); }); g.scale.setScalar(1.3); return g; } },
  { id: 'burnt', w: 14, pts: -3, make: () => { const g = P.bread('loaf'); g.traverse((o) => { if (o.isMesh) o.material = mat(0x1d1612); }); return g; } },
];
const TOTAL_W = KINDS.reduce((a, k) => a + k.w, 0);

export default {
  id: 'catch',
  name: 'Broodjes Vangen',
  giver: 'Bakker Bram',
  icon: '🥖',
  mode: 'coop',
  time: DURATION,
  pay: 1,
  music: 'game',
  blurb: 'De oven van Bakker Bram spuugt brood de lucht in! Vang alles met jullie manden, maar laat het <b>verbrande brood</b> vallen. Vang het <b>tegelijk</b> en jullie krijgen een combo!',
  controls: ['{move} lopen', '{b} duiken (snel naar voren)'],
  tip: 'Gouden broden zijn 6 punten waard. Allebei tegelijk vangen = combo!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    const { sun } = ctx.lights('day', { shadow: 18, center: [0, 0, 2] });
    scene.fog = new THREE.Fog(0xcfeaff, 45, 120);

    // ---- wereld ----
    const ground = mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshStandardMaterial({ map: tex.grass(30, 22) }), { cast: false });
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const plaza = mesh(new THREE.BoxGeometry(26, 0.3, 14), new THREE.MeshStandardMaterial({ map: tex.cobble(6, 3.5), roughness: 1 }), { cast: false, pos: [0, 0.0, 2.5] });
    scene.add(plaza);
    const bakery = P.houseSimple(16, 7, 5.5, { wall: '#f6e7c8', roof: '#c04a3a' }); bakery.position.set(0, 0, -12); scene.add(bakery);
    // uithangbord
    const sign = mesh(new THREE.BoxGeometry(6, 1.4, 0.2), new THREE.MeshStandardMaterial({ map: tex.sign('Bakkerij Bram\n🥖', { w: 384, h: 112, size: 38, bg: '#6b3f1c' }) }), { pos: [0, 7.2, -8.4] }); scene.add(sign);
    for (const x of [-12, 12]) { const t = P.tree(5.5); t.position.set(x, 0, -6); scene.add(t); }
    for (let i = 0; i < 14; i++) { const t = P.tree(4 + Math.random() * 3); t.position.set(-30 + i * 4.6 + rand(-1, 1), 0, -22 - rand(0, 8)); scene.add(t); }
    const f1 = P.flowerPatch(0xff6fa5, 8, 1.2); f1.position.set(-13, 0, 4); scene.add(f1);
    const f2 = P.flowerPatch(0xffe14a, 8, 1.2); f2.position.set(13.5, 0, 6); scene.add(f2);
    for (const x of [-10, 10]) { const b = P.barrel(); b.position.set(x, 0, -4.5); scene.add(b); }
    // oven-goot waar het brood uit komt (hoog in de lucht)
    const chute = mesh(new THREE.BoxGeometry(22, 0.6, 1.2), mat(0x6b4a2e), { pos: [0, 15, -2] }); scene.add(chute);
    for (const x of [-11, 11]) scene.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 15, 6), mat(0x5b3d24), { pos: [x, 7.5, -2] }));
    for (let i = 0; i < 8; i++) scene.add(mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), mat(0x2a1a10), { cast: false, pos: [-9.5 + i * 2.7, 14.65, -2] }));

    camera.fov = 48; camera.updateProjectionMatrix();
    camera.position.set(0, 15, 23); camera.lookAt(0, 5.5, 0);

    // ---- spelers ----
    const pl = players.map((p, i) => {
      const c = makeBrother(i); c.group.position.set(i ? 3 : -3, 0.15, 4); scene.add(c.group);
      const basket = new THREE.Group();
      const bm = mat(0xc89a52, { side: THREE.DoubleSide });
      basket.add(mesh(new THREE.CylinderGeometry(1.15, 0.8, 0.7, 12, 1, true), bm, { pos: [0, 0, 0] }));
      basket.add(mesh(new THREE.CircleGeometry(0.8, 12), bm, { pos: [0, -0.34, 0], rot: [-Math.PI / 2, 0, 0] }));
      basket.add(mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 18), mat(PLAYER_COLORS[i]), { pos: [0, 0.35, 0], rot: [Math.PI / 2, 0, 0] }));
      basket.position.y = c.height + 0.45; c.group.add(basket); c.pose = 'carry';
      const ring = mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.8 }), { cast: false, pos: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0] });
      scene.add(ring);
      return { c, basket, ring, x: i ? 3 : -3, z: 4, dash: 0, dashCd: 0, caught: 0, last: -9, vx: 0, vz: 0 };
    });

    const items = []; let score = 0, caughtTotal = 0, missed = 0, combo = 0, lastCatchT = [-9, -9], timeLeft = DURATION, spawnT = 1.2, t = 0, done = false;
    const pick_kind = () => { let r = Math.random() * TOTAL_W; for (const k of KINDS) { r -= k.w; if (r <= 0) return k; } return KINDS[0]; };

    function spawn() {
      const k = pick_kind(); const obj = k.make(); const x = rand(-10, 10), z = rand(0, 7.5);
      obj.position.set(x, 15, z); obj.scale.multiplyScalar(1.9); scene.add(obj);
      const shadow = P.shadowBlob(0.7); shadow.position.set(x, 0.35, z); scene.add(shadow);
      items.push({ k, obj, shadow, x, z, y: 15, vy: -rand(2, 4), spin: rand(-4, 4), tilt: rand(0, 6) });
    }

    hud.setTimer(DURATION); hud.setScore('Broodjes: 0'); hud.setPlayerInfo(0, 'Vang het brood!'); hud.setPlayerInfo(1, 'Vang het brood!');

    function updatePlayers(dt) {
      pl.forEach((p, i) => {
        const inp = input.p[i];
        const sp = 9.5 * (p.dash > 0 ? 2.4 : 1);
        if (inp.bP && p.dashCd <= 0) { p.dash = 0.22; p.dashCd = 1.1; audio.sfx('whoosh', { vol: 0.5 }); fx.particles.dust(p.x, 0, p.z, 6); }
        p.dash -= dt; p.dashCd -= dt;
        let dx = inp.x, dz = inp.y;
        if (p.dash > 0 && Math.abs(dx) + Math.abs(dz) < 0.1) dz = -1;
        p.vx = damp(p.vx, dx * sp, 14, dt); p.vz = damp(p.vz, dz * sp, 14, dt);
        p.x = clamp(p.x + p.vx * dt, -11.5, 11.5); p.z = clamp(p.z + p.vz * dt, -1, 8.5);
        p.c.group.position.set(p.x, 0.15, p.z);
        p.c.speed = Math.min(1, Math.hypot(p.vx, p.vz) / 9);
        if (Math.abs(p.vx) + Math.abs(p.vz) > 0.5) p.c.faceDir(p.vx, p.vz);
        p.c.update(dt);
        p.ring.position.set(p.x, 0.12, p.z);
        p.basket.position.y = p.c.height + 0.45 + Math.sin(t * 8 + i) * 0.03 * p.c.speed;
        if (p.c.speed > 0.4 && Math.random() < 0.25) fx.particles.dust(p.x, 0, p.z, 1);
      });
    }

    function update(dt) {
      if (done) { pl.forEach((p) => p.c.update(dt)); return; }
      t += dt; timeLeft -= dt;
      updatePlayers(dt);
      spawnT -= dt;
      const prog = 1 - timeLeft / DURATION;
      if (spawnT <= 0) { spawn(); if (Math.random() < prog * 0.5) spawn(); spawnT = lerp(0.85, 0.33, prog) * rand(0.8, 1.2); }

      for (let n = items.length - 1; n >= 0; n--) {
        const it = items[n];
        it.vy -= 9 * dt * (1 + prog * 0.3); it.vy = Math.max(it.vy, -14); it.y += it.vy * dt;
        it.obj.position.y = it.y; it.obj.rotation.y += it.spin * dt; it.obj.rotation.x = Math.sin(t * 3 + it.tilt) * 0.3;
        const s = clamp(1 - (it.y - 1) / 16, 0.2, 1); it.shadow.scale.setScalar(0.5 + s); it.shadow.material.opacity = 0.2 + s * 0.5;
        // opvangen?
        let hit = -1;
        if (it.y < 3.6 && it.y > 2.2) for (let i = 0; i < 2; i++) { const p = pl[i]; if (Math.hypot(p.x - it.x, p.z - it.z) < 1.35) { hit = i; break; } }
        if (hit >= 0) {
          const p = pl[hit]; const pts = it.k.pts;
          if (pts > 0) {
            lastCatchT[hit] = t;
            const other = pl[1 - hit];
            const coCatch = Math.abs(lastCatchT[0] - lastCatchT[1]) < 0.9;
            if (coCatch) combo = Math.min(5, combo + 1); else if (combo > 0 && t - Math.max(...lastCatchT) > 3) combo = 0;
            const mult = coCatch ? 1 + Math.min(combo, 4) * 0.5 : 1;
            const gained = Math.round(pts * mult);
            score += gained; caughtTotal++; p.caught++;
            fx.texts.add((coCatch ? '🔥 ' : '+') + gained, it.x, 4.8, it.z, coCatch ? '#ff9a3a' : '#ffe14a', coCatch ? 1.2 : 1);
            fx.particles.burst(it.x, 3.4, it.z, { count: 10, colors: [0xffd27a, 0xffffff, 0xd9954a], speed: 3.5, size: 0.28 });
            audio.sfx(it.k.id === 'golden' ? 'powerup' : 'pop', { rate: 0.9 + Math.min(combo, 5) * 0.1 });
            if (coCatch) audio.sfx('ding', { vol: 0.5 });
            p.basket.scale.set(1.15, 0.85, 1.15); p.c.squash = 0.12;
          } else {
            score = Math.max(0, score + pts); combo = 0;
            fx.texts.add(String(pts), it.x, 4.8, it.z, '#ff5a5a');
            fx.particles.burst(it.x, 3.4, it.z, { count: 16, colors: [0x222222, 0x555555, 0xff5a1a], speed: 4, size: 0.35 });
            audio.sfx('hurt'); ctx.shake(0.5); p.c.pose = 'scared'; setTimeout(() => (p.c.pose = 'carry'), 600);
          }
          scene.remove(it.obj); scene.remove(it.shadow); items.splice(n, 1); continue;
        }
        if (it.y < 0.4) {
          if (it.k.pts > 0) { missed++; combo = Math.max(0, combo - 1); fx.particles.dust(it.x, 0, it.z, 3, 0xe8c890); audio.sfx('land', { vol: 0.3 }); }
          else fx.particles.burst(it.x, 0.4, it.z, { count: 5, color: 0x333333, speed: 2 });
          scene.remove(it.obj); scene.remove(it.shadow); items.splice(n, 1);
        }
      }
      pl.forEach((p) => p.basket.scale.set(damp(p.basket.scale.x, 1, 12, dt), damp(p.basket.scale.y, 1, 12, dt), damp(p.basket.scale.z, 1, 12, dt)));
      hud.setTimer(timeLeft, 8);
      hud.setScore(`Punten: ${score}` + (combo > 1 ? `   🔥 combo x${combo}` : ''));
      hud.setPlayerInfo(0, `Gevangen: ${pl[0].caught}`); hud.setPlayerInfo(1, `Gevangen: ${pl[1].caught}`);

      if (timeLeft <= 0) {
        done = true; hud.setTimer(0);
        const stars = score >= 70 ? 3 : score >= 45 ? 2 : score >= 22 ? 1 : 0;
        pl.forEach((p) => { p.c.pose = stars ? 'cheer' : 'sad'; });
        for (const it of items) { scene.remove(it.obj); scene.remove(it.shadow); } items.length = 0;
        ctx.finish({ stars, score, summary: `Jullie vingen samen <b>${caughtTotal}</b> broden (${score} punten)!${missed ? ` ${missed} vielen op de grond.` : ''}` });
      }
    }
    return { update, resultUpdate: (dt) => pl.forEach((p) => p.c.update(dt)), introUpdate: (dt) => pl.forEach((p) => { p.c.update(dt); }), dispose() {} };
  },
};

import * as THREE from 'three';
import { makeBrother } from '../engine/chars.js';
import { mesh, mat, clamp, damp } from '../engine/util.js';

// Minimale duel-voorbeeldgame (ook voor tests): loop rond, A = punt scoren als je bij het midden staat. Eerste tot 3.
export default {
  id: 'dueltest', name: 'Duel-test', giver: 'Koning Klopper', icon: '🧪', mode: 'pvp', time: 30,
  blurb: 'Test van het duel-systeem. Sta op het gouden vak en druk A!', controls: ['{move} lopen', '{a} punt pakken'],
  create(ctx) {
    const { scene, camera } = ctx; ctx.lights('day', { shadow: 12 });
    scene.add(mesh(new THREE.PlaneGeometry(30, 20), mat(0x7ab86a), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    const spot = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.1, 16), mat(0xffd23f), { pos: [0, 0.06, 0] }); scene.add(spot);
    camera.position.set(0, 14, 12); camera.lookAt(0, 0, 0);
    const P = [0, 1].map((i) => { const c = makeBrother(i); c.group.position.set(i ? 5 : -5, 0, 0); scene.add(c.group); return { c, v: { x: 0, z: 0 }, pts: 0 }; });
    let t = 0, done = false;
    return {
      update(dt) {
        t += dt; if (done) return;
        P.forEach((p, i) => {
          const inp = ctx.pvp.input(i); const sp = 7 * ctx.pvp.speed(i); const k = ctx.pvp.size(i);
          p.v.x = damp(p.v.x, inp.x * sp, 12 - ctx.pvp.slip * 10, dt); p.v.z = damp(p.v.z, inp.y * sp, 12 - ctx.pvp.slip * 10, dt);
          p.c.group.position.x = clamp(p.c.group.position.x + p.v.x * dt, -14, 14); p.c.group.position.z = clamp(p.c.group.position.z + p.v.z * dt, -9, 9);
          p.c.group.scale.setScalar(k); p.c.speed = Math.hypot(p.v.x, p.v.z) / 7; p.c.faceDir(p.v.x, p.v.z); p.c.update(dt);
          if (inp.aP && Math.hypot(p.c.group.position.x, p.c.group.position.z) < 2) { p.pts++; ctx.audio.sfx('coin'); }
          ctx.hud.setPlayerInfo(i, `Punten: ${p.pts}`);
        });
        if (P.some((p) => p.pts >= 3) || t > 25) { done = true; const w = P[0].pts === P[1].pts ? null : P[0].pts > P[1].pts ? 0 : 1; ctx.finishPvp({ winner: w, score: [P[0].pts, P[1].pts], summary: 'Test voltooid!' }); }
      },
      onDeurman(movers) { movers.forEach((m, i) => { if (m) P[i].pts = Math.max(0, P[i].pts - 1); }); },
      celebrate(w) { P[w].c.pose = 'cheer'; P[1 - w].c.pose = 'sad'; },
      dispose() {},
    };
  },
};

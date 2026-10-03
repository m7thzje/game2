import * as THREE from 'three';
import { mat, mesh, clamp } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';

// Testspel voor de 3-slot-pijplijn (NIET geregistreerd in index.js; ?game=_tri_test&players=3).
// Drie poppetjes (slot 0..2) lopen over een plank; elke A-druk is een punt, eerst bij 3 punten wint. Bij tijd: meeste punten.
export default {
  id: 'tri_test', name: 'Drie-Test', giver: 'Test-team', icon: '🔺', mode: 'pvp', players: [3], time: 40,
  twists: ['none', 'invert', 'swapab', 'giant', 'bodyswap', 'turbo', 'deurman'],
  music: 'game_fast',
  blurb: 'Drie spelers tegelijk. Druk op A voor een punt: wie het eerst 3 heeft, wint!',
  controls: ['{move} lopen', '{a} punt scoren'], tip: 'Alleen voor de test van de drie-spelers-pijplijn.',
  create(ctx) {
    const { scene, camera, hud } = ctx, pv = ctx.pvp, n = ctx.players.length;
    ctx.lights('day', { shadow: 12 });
    scene.add(mesh(new THREE.BoxGeometry(18, 0.4, 7), mat(0x8a6a44), { pos: [0, -0.2, 0] }));
    camera.position.set(0, 7, 9); camera.lookAt(0, 0.8, 0);
    const score = new Array(n).fill(0); let t = 0, tleft = 40, done = false;
    const P = ctx.players.map((pl, i) => {
      const c = makeBrother(i);   // slot -> personage van de speler in dat slot
      const x = (i - (n - 1) / 2) * 5;
      c.group.position.set(x, 0, 0); c.targetYaw = c.yaw = 0; scene.add(c.group);
      const ring = mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 20), mat(pl.color), { pos: [x, 0.05, 0], rot: [Math.PI / 2, 0, 0], cast: false }); scene.add(ring);
      return { c, ring, x, z: 0, pl };
    });
    const show = () => P.forEach((p, i) => hud.setPlayerInfo(i, `Punten: ${score[i]}`));
    show();
    const finish = (w) => {
      if (done) return; done = true;
      ctx.finishPvp({ winner: w, score: score.slice(), delay: 400, summary: w == null ? 'Gelijkspel in de test.' : `${ctx.players[w].name} was het snelst (test).` });
    };
    return {
      onStart() { hud.setTimer(tleft); },
      update(dt) {
        if (done) return;
        tleft -= dt; t += dt; hud.setTimer(tleft);
        P.forEach((p, i) => {
          const inp = pv.input(i), sp = 4.2 * pv.speed(i), sz = pv.size(i);
          p.x = clamp(p.x + inp.x * sp * dt, -8, 8); p.z = clamp(p.z + inp.y * sp * dt, -2.8, 2.8);
          p.c.group.position.set(p.x, 0, p.z); p.c.group.scale.setScalar(sz); p.ring.position.set(p.x, 0.05, p.z);
          p.c.speed = inp.mag; if (inp.mag > 0.1) p.c.faceDir(inp.x, inp.y);
          if (inp.aP) { score[i]++; p.c.swing && p.c.swing(); ctx.sfx('select'); show(); if (score[i] >= 3) finish(i); }
          p.c.update(dt);
        });
        if (tleft <= 0) { const m = Math.max(...score); const ws = score.map((s, i) => (s === m ? i : -1)).filter((k) => k >= 0); finish(ws.length === 1 ? ws[0] : null); }
      },
      celebrate(w) { P.forEach((p, i) => { p.c.pose = i === w ? 'cheer' : 'sad'; }); },
      resultUpdate(dt) { P.forEach((p) => p.c.update(dt)); },
      dispose() {},
      dbg: { score: (i) => { score[i]++; show(); }, finish, get scores() { return score.slice(); }, P },
    };
  },
};

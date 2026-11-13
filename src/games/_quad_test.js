import * as THREE from 'three';
import { mat, mesh, clamp } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';

// Testspel voor de 4-slot-pijplijn (NIET geregistreerd in index.js; ?game=_quad_test&players=4).
// Twee tot vier poppetjes (slot 0..N-1) lopen over een plank; elke A-druk is een punt. Zonder teams wint wie het eerst 3 punten heeft;
// met teams (def.teams, bij 4 spelers ctx.teams = bijv. [[0,1],[2,3]]) tellen de punten per team op en wint het team dat het eerst 4 heeft
// via finishPvp({ winners: [slot, slot], score }). Bij tijd: meeste punten (gelijk = gelijkspel).
export default {
  id: 'quad_test', name: 'Vier-Test', giver: 'Test-team', icon: '🔷', mode: 'pvp', players: [2, 3, 4], teams: true, time: 40,
  twists: ['none', 'invert', 'swapab', 'giant', 'bodyswap', 'turbo', 'deurman'],
  music: 'game_fast',
  blurb: 'Tot vier spelers tegelijk. Druk op A voor een punt: wie het eerst 3 heeft wint (bij teams: het team met 4 punten)!',
  controls: ['{move} lopen', '{a} punt scoren'], tip: 'Alleen voor de test van de vier-spelers-pijplijn.',
  create(ctx) {
    const { scene, camera, hud } = ctx, pv = ctx.pvp, n = ctx.players.length, teams = ctx.teams;
    ctx.lights('day', { shadow: 12 });
    scene.add(mesh(new THREE.BoxGeometry(22, 0.4, 7), mat(0x8a6a44), { pos: [0, -0.2, 0] }));
    camera.position.set(0, 7, 10); camera.lookAt(0, 0.8, 0);
    const score = new Array(n).fill(0), teamScore = teams ? teams.map(() => 0) : null; let t = 0, tleft = 40, done = false;
    const P = ctx.players.map((pl, i) => {
      const c = makeBrother(i);   // slot -> personage van de speler in dat slot
      const x = (i - (n - 1) / 2) * 4.6;
      c.group.position.set(x, 0, 0); c.targetYaw = c.yaw = 0; scene.add(c.group);
      const ring = mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 20), mat(teams ? ctx.teamInfo[ctx.teamOf[i]].color : pl.color), { pos: [x, 0.05, 0], rot: [Math.PI / 2, 0, 0], cast: false }); scene.add(ring);
      return { c, ring, x, z: 0, pl };
    });
    const show = () => P.forEach((p, i) => hud.setPlayerInfo(i, teams ? `Team ${ctx.teamOf[i] + 1}: ${teamScore[ctx.teamOf[i]]} (jij ${score[i]})` : `Punten: ${score[i]}`));
    show();
    const finish = (winners) => {   // winners = lijst slots ([] = gelijkspel)
      if (done) return; done = true;
      ctx.finishPvp({ winners, score: teams ? score.map((_, i) => teamScore[ctx.teamOf[i]]) : score.slice(), delay: 400, summary: !winners.length ? 'Gelijkspel in de test.' : `${winners.map((k) => ctx.players[k].name).join(' & ')} ${winners.length > 1 ? 'waren' : 'was'} het snelst (test).` });
    };
    const point = (i) => {
      score[i]++; if (teams) teamScore[ctx.teamOf[i]]++; show();
      if (teams) { const ti = ctx.teamOf[i]; if (teamScore[ti] >= 4) finish(teams[ti].slice()); } else if (score[i] >= 3) finish([i]);
    };
    return {
      onStart() { hud.setTimer(tleft); },
      update(dt) {
        if (done) return;
        tleft -= dt; t += dt; hud.setTimer(tleft);
        P.forEach((p, i) => {
          const inp = pv.input(i), sp = 4.2 * pv.speed(i), sz = pv.size(i);
          p.x = clamp(p.x + inp.x * sp * dt, -10, 10); p.z = clamp(p.z + inp.y * sp * dt, -2.8, 2.8);
          p.c.group.position.set(p.x, 0, p.z); p.c.group.scale.setScalar(sz); p.ring.position.set(p.x, 0.05, p.z);
          p.c.speed = inp.mag; if (inp.mag > 0.1) p.c.faceDir(inp.x, inp.y);
          if (inp.aP) { p.c.swing && p.c.swing(); ctx.sfx('select'); point(i); }
          p.c.update(dt);
        });
        if (tleft <= 0) {
          const sc = teams ? teamScore : score, m = Math.max(...sc), top = sc.map((s, i) => (s === m ? i : -1)).filter((k) => k >= 0);
          finish(top.length === 1 ? (teams ? teams[top[0]].slice() : [top[0]]) : []);
        }
      },
      celebrate(w, winners = [w]) { P.forEach((p, i) => { p.c.pose = winners.includes(i) ? 'cheer' : 'sad'; }); },
      resultUpdate(dt) { P.forEach((p) => p.c.update(dt)); },
      dispose() {},
      dbg: { point, finish, score: (i) => { score[i]++; show(); }, get scores() { return score.slice(); }, get teamScores() { return teamScore ? teamScore.slice() : null; }, P },
    };
  },
};

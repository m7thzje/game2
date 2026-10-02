const ok = (c, m) => console.log((c ? 'OK   ' : 'FAIL ') + m);
export default async function (S) {
  const { ev, step, shot, start } = S;
  await start(); await step(100);   // ronde 1 loopt
  const press = async (i, b = 'a') => { await ev(([i, b]) => { V(i)[b] = true; }, [i, b]); await step(1); await ev(([i, b]) => { V(i)[b] = false; }, [i, b]); };
  const place = (i, x, z, fx = 0, fz = 1) => ev(([i, x, z, fx, fz]) => { const e = K().E[i]; e.x = x; e.z = z; e.vx = e.vz = 0; e.fx = fx; e.fz = fz; e.stun = 0; e.dashCd = 0; e.dashT = 0; e.knockT = 0; e.immT = 0; e.shieldT = 0; e.slowT = 0; }, [i, x, z, fx, fz]);
  const holder = () => ev(() => K().st.holder && K().st.holder.name);
  // stop AI-zwervers: zet NPC's vast met stun
  const freeze = (i) => ev((i) => { K().E[i].stun = 99; }, i);
  const setHolder = (i) => ev((i) => { const k = K(); for (const e of k.E) e.holder = false; k.E[i].holder = true; k.st.holder = k.E[i]; k.st.lock = 0; k.E[i].immT = 0; k.st.fuse = 50; k.st.fuseMax = 60; }, i);
  await ev(() => { K().st.fuse = 50; K().st.fuseMax = 60; });
  // 1. Daan (houder) duikt op Dobber
  await setHolder(0); await place(0, 0, 4, 0, -1); await place(1, -6, 0); await place(2, 6, 0); await place(3, 0, 1.5, 0, 1); await freeze(2); await freeze(3); await freeze(1);
  await press(0, 'a'); await step(8);
  ok((await holder()) === 'Dobber', 'duik van bomhouder geeft de bom door (houder=' + (await holder()) + ')');
  // 2. bom kan niet direct terug (lock)
  const st1 = await ev(() => K().st.lock); ok(st1 > 0, 'lock na tik > 0 (' + st1.toFixed(2) + ')');
  // 3. Sem duwt Dobber (houder) weg
  await ev(() => { K().st.lock = 0; K().E[3].stun = 0; K().E[3].immT = 0; });
  await place(3, 3, -3, 0, 1); await freeze(3); await ev(() => { K().E[3].stun = 0; K().E[3].immT = 0; }); await place(1, 3, 0, 0, -1); await ev(() => { K().E[3].stun = 0; });
  const before = await ev(() => ({ x: K().E[3].x, z: K().E[3].z }));
  await press(1, 'a'); await step(6);
  const after = await ev(() => ({ x: K().E[3].x, z: K().E[3].z, st: K().st.protects }));
  ok(Math.hypot(after.x - before.x, after.z - before.z) > 1.0, `Sem duwt Dobber weg (${Math.hypot(after.x - before.x, after.z - before.z).toFixed(1)} u)  protects=${after.st}`);
  ok((await holder()) === 'Dobber', 'duw geeft de bom NIET door');
  // 4. schild blokkeert
  await setHolder(0); await place(0, 0, 4, 0, -1); await place(3, 0, 1.5, 0, 1); await place(1, -7, 0); await place(2, 7, 0);
  await ev(() => { const k = K(); k.E[3].shieldT = 4; k.E[3].stun = 99; k.E[1].stun = 99; k.E[2].stun = 99; k.st.lock = 0; });
  await press(0, 'a'); await step(6);
  ok((await holder()) === 'Daan', 'schild blokkeert de tik (houder=' + (await holder()) + ')');
  ok((await ev(() => K().E[0].stun)) > 0.1 || (await ev(() => K().E[0].knockT)) > 0, 'aanvaller wordt teruggekaatst');
  // 5. sprint
  await ev(() => { const e = K().E[1]; e.stun = 0; e.sprintCd = 0; e.x = -3; e.z = 0; e.vx = e.vz = 0; });
  await ev(() => { V(1).x = 1; V(1).y = 0; }); await step(8); const x0 = await ev(() => K().E[1].x);
  await press(1, 'b'); await step(10); const x1 = await ev(() => K().E[1].x);
  await ev(() => { V(1).x = 0; });
  await ev(() => { const e = K().E[1]; e.sprintT = 0; e.x = -3; e.vx = 0; e.sprintCd = 99; V(1).x = 1; }); await step(18); const x2 = await ev(() => K().E[1].x);
  await ev(() => { V(1).x = 0; });
  console.log(`   sprint-afstand ${(x1 - x0).toFixed(1)} u in 0.5s met sprint, zonder sprint over 0.9s: ${(x2 + 3).toFixed(1)}`);
  // 6. powerups
  await ev(() => { const k = K(); k.st.powerT = 0; });
  await step(4); const pu = await ev(() => K().powerups.map((p) => p.type));
  ok(pu.length >= 1, 'power-up verschijnt (' + pu.join(',') + ')');
  await ev(() => { const k = K(); const p = k.powerups[0]; if (p) { p.type = 'ice'; const e = k.E[1]; e.x = p.x; e.z = p.z; e.stun = 0; } });
  await step(3);
  ok((await ev(() => K().st.holder.iceT)) > 0, 'ijsbloem bevriest de bomhouder (iceT=' + (await ev(() => K().st.holder.iceT)).toFixed(1) + ')');
  // 7. explosie + toeschouwer
  await setHolder(1); await ev(() => { K().E[1].stun = 0; });
  await ev(() => { K().st.fuse = 0.1; }); await step(4);
  console.log(JSON.stringify(await ev(() => K().stats)));
  ok((await ev(() => K().E[1].alive)) === false, 'houder is uit na ontploffing');
  await step(40); ok((await ev(() => K().E[1].state)) === 'out', 'speler is toeschouwer langs de rand (state=' + (await ev(() => K().E[1].state)) + ')');
  const ang0 = await ev(() => K().E[1].ang); await ev(() => { V(1).x = 1; V(1).y = 1; }); await step(20); await ev(() => { V(1).x = 0; V(1).y = 0; });
  const ang1 = await ev(() => K().E[1].ang); ok(Math.abs(ang1 - ang0) > 0.1, 'toeschouwer beweegt langs de rand (' + ang0.toFixed(2) + ' -> ' + ang1.toFixed(2) + ')');
  const c0 = await ev(() => K().st.cheers); await press(1, 'a'); await step(3); ok((await ev(() => K().st.cheers)) === c0 + 1, 'aanmoedigen met A');
  await shot('spectator');
  await step(200);
  console.log(JSON.stringify(await ev(() => K().stats)));
}

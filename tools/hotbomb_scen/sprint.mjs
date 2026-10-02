export default async function (S) {
  const { ev, step, start } = S;
  await start(); await step(100);
  await ev(() => { const k = K(); k.st.fuse = 50; k.st.fuseMax = 60; for (const e of k.E) { e.stun = 99; } const e = k.E[1]; e.stun = 0; e.x = -3; e.z = 5; e.vx = e.vz = 0; e.sprintCd = 0; e.dashCd = 0; e.holder = false; k.st.holder = k.E[0]; k.E[0].holder = true; k.E[0].x = 6; k.E[0].z = -6; });
  await ev(() => { V(1).x = 1; V(1).y = 0; }); await step(10);
  console.log('after 0.5s walk', await ev(() => { const e = K().E[1]; return [e.x.toFixed(2), e.vx.toFixed(2), e.stun, e.knockT, e.slowT]; }));
  const x0 = await ev(() => K().E[1].x);
  await ev(() => { V(1).b = true; }); await step(1); await ev(() => { V(1).b = false; }); await step(9);
  const x1 = await ev(() => K().E[1].x);
  console.log('sprint 0.5s dx=', (x1 - x0).toFixed(2), ' walk 0.5s dx=', (x0 - -3).toFixed(2) );
}

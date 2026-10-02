export default async function ({ ev, start }) {
  await start();
  const r = await ev(() => {
    const k = K(); const specs = [];
    for (const c of ['ui', 'wortel', 'vlees', 'brood', 'kaas']) specs.push({ t: 'crate', kind: c });
    specs.push({ t: 'board', i: 0 }, { t: 'board', i: 1 }, { t: 'cooker', i: 0 }, { t: 'cooker', i: 1 }, { t: 'cooker', i: 2 }, { t: 'plates' }, { t: 'hatch' }, { t: 'trash' });
    for (let i = 0; i < 8; i++) specs.push({ t: 'slot', i });
    const stand = (sp) => {
      let st, sx, sz, fx, fz;
      if (sp.t === 'crate') { st = k.stations.find((s) => s.type === 'crate' && s.kind === sp.kind); sx = st.x + 1.2; sz = st.z; fx = -1; fz = 0; }
      else if (sp.t === 'board') { st = k.boards[sp.i]; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
      else if (sp.t === 'slot') { st = k.slots[sp.i]; if (Math.abs(st.x) < 0.1) { const L = Math.random() < 0.5; sx = L ? -1.25 : 1.25; sz = st.z; fx = L ? 1 : -1; fz = 0; } else { sx = st.x; sz = -3.3; fx = 0; fz = -1; } }
      else if (sp.t === 'cooker') { st = k.cookers[sp.i]; sx = 6.9; sz = st.z; fx = 1; fz = 0; }
      else if (sp.t === 'plates') { st = k.plateSt; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
      else if (sp.t === 'hatch') { st = k.hatch; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
      else { sx = 7.3; sz = -3.0; fx = 1; fz = -0.3; }
      return { sx, sz, fx, fz };
    };
    let steps = 0, finished = 0; const m = __app.mode; const f = m.finish.bind(m); m.finish = (x) => { finished++; return f(x); };
    const V = (i) => __app.input.virtual[i];
    while (__app.mode.state === 'play' && steps < 4000) {
      if (steps % 4 === 0) {
        const i = Math.random() < 0.5 ? 0 : 1; const p = k.pl[i]; const s = stand(specs[Math.floor(Math.random() * specs.length)]);
        p.x = s.sx; p.z = s.sz; p.vx = p.vz = 0; p.fx = s.fx; p.fz = s.fz;
        V(i).a = Math.random() < 0.7; V(i).b = Math.random() < 0.5; V(1 - i).a = false; V(1 - i).b = Math.random() < 0.3;
      }
      __app.input.update(); __app.mode.update(0.05); steps++;
      if (steps % 4 === 2) { V(0).a = false; V(1).a = false; }
    }
    return { steps, finished, state: __app.mode.state, s: k.state };
  });
  console.log(JSON.stringify(r));
}

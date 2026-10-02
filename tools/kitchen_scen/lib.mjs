// Hulpfuncties voor Taverne-keuken scenario's
export function helpers({ ev, step }) {
  const stand = async (i, spec) => ev(([i, spec]) => {
    const k = K(); const p = k.pl[i]; const [type, arg] = spec.split(':');
    let st, sx, sz, fx, fz;
    if (type === 'crate') { st = k.stations.find((s) => s.type === 'crate' && s.kind === arg); sx = st.x + 1.2; sz = st.z; fx = -1; fz = 0; }
    else if (type === 'board') { st = k.boards[+arg]; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
    else if (type === 'slot') { st = k.slots[+arg.split(',')[0]]; const side = arg.split(',')[1] || 'L'; if (Math.abs(st.x) < 0.1) { sx = side === 'L' ? -1.25 : 1.25; sz = st.z; fx = side === 'L' ? 1 : -1; fz = 0; } else { sx = st.x; sz = -3.3; fx = 0; fz = -1; } }
    else if (type === 'cooker') { st = k.cookers[+arg]; sx = 6.9; sz = st.z; fx = 1; fz = 0; }
    else if (type === 'plates') { st = k.plateSt; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
    else if (type === 'hatch') { st = k.hatch; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
    else if (type === 'trash') { st = k.stations.find((s) => s.type === 'trash'); sx = 7.3; sz = -3.0; fx = 1; fz = -0.3; }
    p.x = sx; p.z = sz; p.vx = p.vz = 0; p.fx = fx; p.fz = fz; p.c.group.position.set(sx, 0, sz);
  }, [i, spec]);
  const press = async (i, btn = 'a') => { await ev(([i, b]) => { V(i)[b] = true; }, [i, btn]); await step(1); await ev(([i, b]) => { V(i)[b] = false; }, [i, btn]); await step(1); };
  const hold = async (i, btn, n) => { await ev(([i, b]) => { V(i)[b] = true; }, [i, btn]); await step(n); await ev(([i, b]) => { V(i)[b] = false; }, [i, btn]); await step(1); };
  const holding = (i) => ev((i) => { const h = K().pl[i].hold; return h ? JSON.stringify(h) : null; }, i);
  const state = () => ev(() => K().state);
  const seatInfo = () => ev(() => K().seats.map((s) => `${s.i}:${s.state}${s.order ? ':' + s.order.recipe + ':' + s.order.left.toFixed(0) : ''}`).join(' '));
  const ck = () => ev(() => K().cookers.map((c) => `${c.kind}:${c.state}:${c.items.map((x) => x.k).join('+')}:${c.t.toFixed(1)}`).join(' | '));
  return { stand, press, hold, holding, state, seatInfo, ck };
}

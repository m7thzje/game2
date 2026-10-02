// Eenvoudige test-bot voor Taverne-keuken (draait in de pagina). bot.tick(dt) vóór elke input.update().
(function () {
  const RAD = 0.47, CELL = 0.25, X0 = -9, X1 = 9.3, Z0 = -5, Z1 = 4.7;
  const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
  const REC = { soep: ['ui', 'wortel'], stoof: ['vlees', 'wortel'], broodje: ['brood', 'kaas'] };
  const CHOP = { ui: 1.6, wortel: 1.6, vlees: 2.3, brood: 1.1, kaas: 1.1 };
  let grid = null;
  function buildGrid(obstacles) {
    grid = new Uint8Array(NX * NZ);
    for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
      const x = X0 + (ix + 0.5) * CELL, z = Z0 + (iz + 0.5) * CELL; let bad = x < -8.5 || x > 8.55 || z < -4.55 || z > 4.28;
      if (!bad) for (const o of obstacles) { const cx = Math.max(o.x0, Math.min(o.x1, x)), cz = Math.max(o.z0, Math.min(o.z1, z)); if (Math.hypot(x - cx, z - cz) < RAD) { bad = true; break; } }
      grid[ix * NZ + iz] = bad ? 1 : 0;
    }
  }
  const cellOf = (x, z) => [Math.max(0, Math.min(NX - 1, Math.floor((x - X0) / CELL))), Math.max(0, Math.min(NZ - 1, Math.floor((z - Z0) / CELL)))];
  function nearestFree(ix, iz) {
    if (!grid[ix * NZ + iz]) return [ix, iz];
    for (let r = 1; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const a = ix + dx, b = iz + dz; if (a >= 0 && b >= 0 && a < NX && b < NZ && !grid[a * NZ + b]) return [a, b]; }
    return [ix, iz];
  }
  function path(fx, fz, tx, tz) {
    let [sx, sz] = nearestFree(...cellOf(fx, fz)); const [gx, gz] = nearestFree(...cellOf(tx, tz));
    const key = (a, b) => a * NZ + b; const g = new Map(), came = new Map(); const open = [[0, sx, sz]]; g.set(key(sx, sz), 0);
    const h = (a, b) => Math.hypot(a - gx, b - gz);
    while (open.length) {
      open.sort((p, q) => p[0] - q[0]); const [, cx, cz] = open.shift();
      if (cx === gx && cz === gz) break;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ || grid[key(nx, nz)]) continue;
        if (dx && dz && (grid[key(cx + dx, cz)] || grid[key(cx, cz + dz)])) continue;
        const ng = g.get(key(cx, cz)) + Math.hypot(dx, dz); if (!g.has(key(nx, nz)) || ng < g.get(key(nx, nz))) { g.set(key(nx, nz), ng); came.set(key(nx, nz), [cx, cz]); open.push([ng + h(nx, nz), nx, nz]); }
      }
    }
    const out = []; let c = [gx, gz];
    while (c && !(c[0] === sx && c[1] === sz)) { out.push([X0 + (c[0] + 0.5) * CELL, Z0 + (c[1] + 0.5) * CELL]); c = came.get(key(c[0], c[1])); }
    return out.reverse();
  }
  const standOf = (k, spec, side) => {
    const [type, arg] = spec.split(':'); let st, sx, sz, fx, fz;
    if (type === 'crate') { st = k.stations.find((s) => s.type === 'crate' && s.kind === arg); sx = st.x + 1.15; sz = st.z; fx = -1; fz = 0; }
    else if (type === 'board') { st = k.boards[+arg]; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
    else if (type === 'slot') { st = k.slots[+arg]; if (Math.abs(st.x) < 0.1) { sx = side === 'R' ? 1.2 : -1.2; sz = st.z; fx = side === 'R' ? -1 : 1; fz = 0; } else { sx = st.x; sz = -3.3; fx = 0; fz = -1; } }
    else if (type === 'cooker') { st = k.cookers[+arg]; sx = 6.85; sz = st.z; fx = 1; fz = 0; }
    else if (type === 'plates') { st = k.plateSt; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
    else if (type === 'hatch') { st = k.hatch; sx = st.x; sz = -3.3; fx = 0; fz = -1; }
    else if (type === 'trash') { sx = 7.3; sz = -3.0; fx = 1; fz = -0.2; }
    return { x: sx, z: sz, fx, fz };
  };

  const agents = [{ q: [], cur: null, wait: 0 }, { q: [], cur: null, wait: 0 }];
  const K = () => window.__app.mode.instance.dbg;
  let reaction = 0.25;

  // taak-uitvoering ------------------------------------------------------------
  function drive(i, dt) {
    const a = agents[i], k = K(), p = k.pl[i], v = window.__app.input.virtual[i];
    v.x = 0; v.y = 0; v.a = false; v.b = false;
    if (a.wait > 0) { a.wait -= dt; return; }
    if (!a.cur) { a.cur = a.q.shift(); a.path = null; a.t = 0; if (!a.cur) return; }
    const c = a.cur; a.t = (a.t || 0) + dt;
    if (window.BOTLOG && a.last !== c) { a.last = c; window.BOTLOG.push(`${K().state.t.toFixed(1)} p${i} ${JSON.stringify(c)}`); }
    if (a.t > 25) { a.cur = null; a.q.length = 0; return; } // vast -> opnieuw plannen
    if (c.go) {
      if (!a.path) { const s = standOf(k, c.go, c.side); a.stand = s; a.path = path(p.x, p.z, s.x, s.z); }
      while (a.path.length && Math.hypot(a.path[0][0] - p.x, a.path[0][1] - p.z) < 0.25) a.path.shift();
      if (a.path.length) { const [wx, wz] = a.path[0]; const d = Math.hypot(wx - p.x, wz - p.z); v.x = (wx - p.x) / d; v.y = (wz - p.z) / d; return; }
      // aangekomen: kijk naar het station
      const s = a.stand; const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 0.2) { v.x = (s.x - p.x) / d * Math.min(1, d * 3); v.y = (s.z - p.z) / d * Math.min(1, d * 3); return; }
      v.x = s.fx * 0.3; v.y = s.fz * 0.3; a.faced = (a.faced || 0) + 1; if (a.faced < 4) return;
      a.faced = 0; a.cur = null; a.wait = reaction; return;
    }
    if (c.a) { v.a = true; a.cur = null; a.wait = reaction; return; }
    if (c.chop) { // hak tot item gehakt
      const st = c.st(); if (!st || !st.item || st.item.chopped) { a.cur = null; a.wait = 0.1; return; }
      v.b = true; return;
    }
    if (c.ext) { const st = c.st(); if (!st || st.state !== 'burning') { a.cur = null; return; } v.b = true; return; }
    if (c.wait) { c.wait -= dt; if (c.wait <= 0) a.cur = null; return; }
    if (c.until) { if (c.until()) a.cur = null; return; }
  }

  // planning ----------------------------------------------------------------------
  function inventory(k) {
    const have = { ui: 0, wortel: 0, vlees: 0, brood: 0, kaas: 0 };
    const cnt = (it) => { if (it && it.k !== 'plate') have[it.k]++; };
    k.pl.forEach((p) => cnt(p.hold)); k.boards.forEach((b) => cnt(b.item)); k.slots.forEach((s) => cnt(s.item)); k.cookers.forEach((c) => { if (c.state === 'loading') c.items.forEach(cnt); });
    return have;
  }
  function demand(k) {
    const d = { soep: 0, stoof: 0, broodje: 0 };
    k.seats.forEach((s) => { if ((s.state === 'waiting' || s.state === 'arriving') && s.order) d[s.order.recipe]++; });
    k.cookers.forEach((c) => { if ((c.state === 'cooking' || c.state === 'done') && c.dish) d[c.dish]--; });
    const dish = (it) => { if (it && it.k === 'plate' && it.dish) d[it.dish]--; };
    k.pl.forEach((p) => dish(p.hold)); k.slots.forEach((s) => dish(s.item));
    return d;
  }
  function toMake(k) {
    const d = demand(k), have = inventory(k), need = { ui: 0, wortel: 0, vlees: 0, brood: 0, kaas: 0 };
    for (const r of Object.keys(d)) if (d[r] > 0) for (const ing of REC[r]) need[ing] += d[r];
    return Object.keys(need).map((ing) => [ing, need[ing] - have[ing]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  }
  const claims = {};   // key -> agent index
  const dist = (p, x, z) => Math.hypot(p.x - x, p.z - z);
  function candidates(k, i) {
    const p = k.pl[i], out = []; const hd = p.hold;
    const add = (key, prio, x, z, seq) => out.push({ key, prio, cost: dist(p, x, z), seq });
    const cks = k.cookers;
    cks.forEach((c, idx) => { if (c.state === 'burning') add('ext' + idx, 0, c.x, c.z, [{ go: 'cooker:' + idx }, { ext: 1, st: () => cks[idx] }]); });
    if (hd && hd.k === 'plate') {
      if (hd.dish) { add('serve' + i, 1, k.hatch.x, k.hatch.z, [{ go: 'hatch:0' }, { a: 1 }]); return out; }
      const done = cks.findIndex((c) => c.state === 'done');
      if (done >= 0) { add('fill', 1, cks[done].x, cks[done].z, [{ go: 'cooker:' + done }, { a: 1 }]); return out; }
      const soon = cks.map((c, idx) => [idx, c]).filter(([, c]) => c.state === 'cooking').sort((x, y) => y[1].t - x[1].t)[0];
      if (soon) { add('wait', 1, cks[soon[0]].x, cks[soon[0]].z, [{ go: 'cooker:' + soon[0] }, { until: () => cks[soon[0]].state !== 'cooking' }, { a: 1 }]); return out; }
      add('park', 1, 5.5, -4.4, [{ go: 'slot:7' }, { a: 1 }]); return out;
    }
    if (hd) {
      if (hd.chopped) {
        let best = -1;
        cks.forEach((c, idx) => {
          if (!((c.state === 'empty' || c.state === 'loading') && c.items.length < 2)) return;
          if ((c.kind === 'pan') !== (hd.k === 'brood' || hd.k === 'kaas')) return;
          if (c.items.length === 1) { const o = c.items[0].k; const ok = Object.values(REC).some((r) => r.includes(o) && r.includes(hd.k)) && o !== hd.k; if (!ok) return; best = idx; } else if (best < 0) best = idx;
        });
        // alleen als ik aan de kookkant sta of er geen beter alternatief is
        if (best >= 0 && p.x > 0.8) { add('add', 2, cks[best].x, cks[best].z, [{ go: 'cooker:' + best }, { a: 1 }]); return out; }
        const si = [3, 4, 2, 5].find((s) => !k.slots[s].item);
        if (si !== undefined && p.x < 0.8) { add('toslot', 2, 0, k.slots[si].z, [{ go: 'slot:' + si, side: 'L' }, { a: 1 }]); return out; }
        if (best >= 0) { add('add', 2, cks[best].x, cks[best].z, [{ go: 'cooker:' + best }, { a: 1 }]); return out; }
        add('park', 2, 5.5, -4.4, [{ go: 'slot:7' }, { a: 1 }]); return out;
      }
      const bi = k.boards.findIndex((b, idx) => !b.item && !(claims['board' + idx] !== undefined && claims['board' + idx] !== i));
      if (bi >= 0) { add('board' + bi, 2, k.boards[bi].x, -4.4, [{ go: 'board:' + bi }, { a: 1 }, { chop: 1, st: () => k.boards[bi] }, { a: 1 }]); return out; }
      add('trash', 2, 8, -3, [{ go: 'trash:0' }, { a: 1 }]); return out;
    }
    // handen vrij
    k.boards.forEach((b, idx) => {
      if (b.item && b.item.chopped) add('grabb' + idx, 3, b.x, b.z, [{ go: 'board:' + idx }, { a: 1 }]);
      else if (b.item) add('chop' + idx, 3.5, b.x, b.z, [{ go: 'board:' + idx }, { chop: 1, st: () => b }, { a: 1 }]);
    });
    k.slots.forEach((s, idx) => { if (i === 1 && s.item && s.item.k !== 'plate' && s.item.chopped) add('carry' + idx, 3.2, s.x, s.z, [{ go: 'slot:' + idx, side: 'R' }, { a: 1 }]); });
    const dn = cks.findIndex((c) => c.state === 'done');
    if (k.plateSt.count > 0 && (dn >= 0 || cks.some((c) => c.state === 'cooking' && c.t > 5)) && !(k.pl.some((q) => q.hold && q.hold.k === 'plate'))) add('plate', 2.5, k.plateSt.x, k.plateSt.z, [{ go: 'plates:0' }, { a: 1 }]);
    const mk = toMake(k);
    const freeB = k.boards.some((b) => !b.item);
    if (mk.length && freeB) { const need = mk[0][0]; const st = k.stations.find((q) => q.type === 'crate' && q.kind === need); add('crate' + need, 4, st.x, st.z, [{ go: 'crate:' + need }, { a: 1 }]); }
    return out;
  }
  function think() {
    const k = K();
    for (const key of Object.keys(claims)) { const ag = agents[claims[key]]; if (!ag.cur && !ag.q.length) delete claims[key]; }
    agents.forEach((a, i) => {
      if (a.cur || a.q.length) return;
      const c = candidates(k, i).filter((x) => claims[x.key] === undefined || claims[x.key] === i).sort((x, y) => x.prio - y.prio || x.cost - y.cost);
      if (!c.length) { a.q.push({ wait: 0.25 }); return; }
      claims[c[0].key] = i; a.q.push(...c[0].seq);
    });
  }
  window.bot = {
    init() { buildGrid(K().collide ? window.__app.mode.instance.dbg.obstacles : []); },
    tick(dt) { if (!grid) buildGrid(K().obstacles); think(); drive(0, dt); drive(1, dt); },
    agents, setReaction(r) { reaction = r; },
  };
})();

// Eenvoudige bot voor tests: beide spelers jagen op de dichtstbijzijnde goblin met schaap / dichtstbijzijnde goblin.
export const botFn = () => {
  const skill = window.__skill ?? 1;
  const app = window.__app, inst = app.mode.instance, d = inst.debug; if (!d) return;
  const inp = app.input;
  const pl = d.pl, en = d.enemies.filter((e) => e.active && e.dying <= 0);
  for (let k = 0; k < 2; k++) {
    const p = pl[k], v = inp.virtual[k], o = pl[1 - k];
    v.a = false; v.b = false;
    if (o.ko && !p.ko) { // revive
      const dx = o.x - p.x, dz = o.z - p.z, dd = Math.hypot(dx, dz);
      if (skill < 1 && Math.random() > 0.5) { v.x = 0; v.y = 0; continue; }
      if (dd > 1.8) { v.x = dx / dd; v.y = dz / dd; } else { v.x = 0; v.y = 0; v.a = true; }
      continue;
    }
    if (p.ko) { v.x = 0; v.y = 0; continue; }
    // doel: goblin met schaap > dichtstbij
    let best = null, bs = 1e9;
    if (skill < 1 && Math.random() < 0.25 * (1 - skill) * 4) { v.x = Math.random() * 2 - 1; v.y = Math.random() * 2 - 1; continue; }
    for (const e of en) { const dd = Math.hypot(e.x - p.x, e.z - p.z); const sc = dd - (e.carrying ? 8 : 0) + (e.type === 'bomber' ? -4 : 0) + (k === 0 ? e.x * 0.05 : -e.x * 0.05); if (sc < bs) { bs = sc; best = e; } }
    if (best) {
      const dx = best.x - p.x, dz = best.z - p.z, dd = Math.hypot(dx, dz);
      // blijf op afstand ~6, richt via bewegen
      if (dd > 7) { v.x = dx / dd; v.y = dz / dd; } else if (dd < 3.5) { v.x = -dx / dd * 0.9; v.y = -dz / dd * 0.9; } else { v.x = dz / dd * 0.6 * (k ? -1 : 1) + 0.0001 * dx; v.y = -dx / dd * 0.6 * (k ? -1 : 1); }
      // richt: aim moet naar de vijand wijzen
      const ang = Math.atan2(p.ax * dz - p.az * dx, p.ax * dx + p.az * dz);
      if (dd < 15 && Math.random() < skill) { if (Math.abs(ang) > 0.35) { v.x = dx / dd * 0.3; v.y = dz / dd * 0.3; } v.a = true; }
      if (dd < 2.2 && p.rollCd <= 0 && Math.random() < 0.3) v.b = true;
    } else { v.x = (6 - p.x) * 0.1; v.y = (6 - p.z) * 0.1; }
  }
};

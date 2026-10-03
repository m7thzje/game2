// Natuurkunde voor "Tafeltennis-Tornado" (puur rekenwerk, geen three.js, dus ook in node te testen):
// zwaartekracht, luchtweerstand, Magnus-effect (spin buigt de baan), stuit met wrijving/spin, net, kantballen, bumpers, tafel-kanteling en wind.
// Verder een "schot-planner" die de beginsnelheid zoekt waarmee de bal op een gewenst punt van de tegenstander-helft stuitert.

export const PP = { L: 7, W: 3.9, TOP: 2.2, NET: 0.95, R: 0.27, G: 30, E: 0.86, EDGE: 0.12, CM: 0.0065, BH: 0.5 };

export const newEnv = () => ({ grav: 1, th: 0, c: 1, s: 0, windX: 0, windZ: 0, bumpers: [] });
export function setTilt(env, th) { env.th = th; env.c = Math.cos(th); env.s = Math.sin(th); }
export const newBall = () => ({ x: 0, y: PP.TOP + 1, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 });

// Eén stapje; events worden in `ev` gepusht: {t:'bounce'|'net'|'floor'|'out'|'bumper', ...}
export function stepBall(b, dt, env, ev) {
  const { L, W, TOP, NET, R, G, E, EDGE, CM, BH } = PP;
  const px = b.x;
  let ax = env.windX - 0.045 * b.vx, ay = -G * env.grav - 0.045 * b.vy, az = env.windZ - 0.045 * b.vz;
  ax += CM * (b.wy * b.vz - b.wz * b.vy); ay += CM * (b.wz * b.vx - b.wx * b.vz); az += CM * (b.wx * b.vy - b.wy * b.vx);
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  const sd = 1 - 0.12 * dt; b.wx *= sd; b.wy *= sd; b.wz *= sd;
  if (!ev) return;
  const c = env.c, s = env.s;
  let ly = (b.y - TOP) * c + b.z * s, lz = -(b.y - TOP) * s + b.z * c;
  // net (in tafelruimte)
  if ((px < 0) !== (b.x < 0) && ly < NET + R * 0.35 && ly > -0.3 && Math.abs(lz) < W + 0.6) {
    b.x = px < 0 ? -R * 0.7 : R * 0.7; b.vx = -b.vx * 0.2; b.vy *= 0.55; b.vz *= 0.5; ev.push({ t: 'net' });
    return;
  }
  // bumpers
  for (let i = 0; i < env.bumpers.length; i++) {
    const m = env.bumpers[i]; if (!m.on || m.k < 0.7) continue;
    const dx = b.x - m.x, dz = lz - m.z, d = Math.hypot(dx, dz);
    if (d < m.r + R && ly < BH + R * 0.8 && ly > -0.3) {
      const nx = dx / (d || 1), nz = dz / (d || 1);
      // lokale snelheid
      let lvy = b.vy * c + b.vz * s, lvz = -b.vy * s + b.vz * c, lvx = b.vx;
      const vn = lvx * nx + lvz * nz;
      if (vn < 0) {
        lvx -= 1.9 * vn * nx; lvz -= 1.9 * vn * nz; const sp = 1.12; lvx *= sp; lvz *= sp;
        b.vx = lvx; b.vy = lvy * c - lvz * s; b.vz = lvy * s + lvz * c;
        b.x = m.x + nx * (m.r + R + 0.01); lz = m.z + nz * (m.r + R + 0.01); b.y = TOP + ly * c - lz * s; b.z = ly * s + lz * c;
        ev.push({ t: 'bumper', i, x: b.x, y: b.y, z: b.z });
      }
    }
  }
  // tafel
  const lvy = b.vy * c + b.vz * s;
  if (lvy < 0 && ly < R && ly > -0.5 && Math.abs(b.x) < L + EDGE && Math.abs(lz) < W + EDGE) {
    const lvx = b.vx, lvz = -b.vy * s + b.vz * c;
    const wyl = b.wy * c + b.wz * s, wzl = -b.wy * s + b.wz * c, wxl = b.wx;
    const edge = Math.abs(b.x) > L - 0.1 || Math.abs(lz) > W - 0.1;
    let nvx = lvx, nvz = lvz, nvy = -lvy * (edge ? (0.55 + Math.random() * 0.5) : E), nwx = wxl, nwz = wzl;
    // wrijving + spin
    const ux = lvx + R * wzl, uz = lvz - R * wxl, um = Math.hypot(ux, uz);
    if (um > 1e-5) {
      const jm = Math.min((2 / 7) * um, 0.28 * (1 + E) * -lvy), jx = -ux / um * jm, jz = -uz / um * jm;
      nvx += jx; nvz += jz; nwx += -2.5 * jz / R; nwz += 2.5 * jx / R;
    }
    if (edge) { nvz += (Math.random() - 0.5) * 7; nvx += (Math.random() - 0.5) * 4; nvy += Math.random() * 1.2; }
    b.vx = nvx; b.vy = nvy * c - nvz * s; b.vz = nvy * s + nvz * c;
    b.wx = nwx; b.wy = wyl * c - nwz * s; b.wz = wyl * s + nwz * c;
    // wereldpositie: net boven het tafelvlak
    const ny = R + 0.001; b.y = TOP + ny * c - lz * s; b.z = ny * s + lz * c;
    ev.push({ t: 'bounce', side: b.x < 0 ? 0 : 1, edge, x: b.x, y: TOP, z: b.z, vn: -lvy });
    return;
  }
  if (b.y < R + 0.02 && b.vy < 0) { b.y = R + 0.02; b.vy *= -0.45; b.vx *= 0.7; b.vz *= 0.7; ev.push({ t: 'floor' }); }
  else if (Math.abs(b.x) > 17 || Math.abs(b.z) > 12 || b.y > 40) ev.push({ t: 'out' });
}

// Simuleer tot de eerste tafelraking (voor de planner). Geeft {x,z,t,yNet,tNet} terug.
const _env = newEnv(); const _b = newBall();
export function simToTable(x0, y0, z0, v, spin, grav, tmax = 3.2) {
  const e = _env; e.grav = grav; e.th = 0; e.c = 1; e.s = 0; e.windX = e.windZ = 0; e.bumpers = [];
  const b = _b; b.x = x0; b.y = y0; b.z = z0; b.vx = v[0]; b.vy = v[1]; b.vz = v[2]; b.wx = spin[0]; b.wy = spin[1]; b.wz = spin[2];
  const dt = 1 / 240; let t = 0, yNet = 99, tNet = -1;
  while (t < tmax) {
    const px = b.x; stepBall(b, dt, e, null); t += dt;
    if ((px < 0) !== (b.x < 0) && tNet < 0) { yNet = b.y - PP.TOP; tNet = t; }
    if (b.y - PP.TOP < PP.R && b.vy < 0) return { x: b.x, z: b.z, t, yNet, tNet, ok: true };
  }
  return { x: b.x, z: b.z, t, yNet, tNet, ok: false };
}

// Plan een schot: vanuit (x0,y0,z0) zo dat de bal rond (xt,zt) op de tafel komt, in ongeveer Tf seconden, en het net met `clear` marge passeert.
// aimZ=false: zijwaartse fout (Magnus bij een curve-bal) niet bijsturen.
export function planShot(x0, y0, z0, xt, zt, Tf, spin, grav, clear = 0.35, aimZ = true, zStart = zt) {
  const g = PP.G * grav, yt = PP.TOP + PP.R;
  const v = [(xt - x0) / Tf, (yt - y0 + 0.5 * g * Tf * Tf) / Tf, (zStart - z0) / Tf];
  let r = null;
  for (let it = 0; it < 5; it++) {
    r = simToTable(x0, y0, z0, v, spin, grav);
    if (!r.ok) break;
    v[0] += (xt - r.x) / r.t * 0.9;
    if (aimZ) v[2] += (zt - r.z) / r.t * 0.9;
    // nethoogte: te laag? dan hogere boog
    if (r.tNet > 0 && r.yNet < PP.NET + clear) v[1] += (PP.NET + clear - r.yNet) / r.tNet;
    else if (Math.abs(r.x - xt) < 0.25 && Math.abs(r.z - zt) < 0.25) break;
  }
  return { v, land: r };
}

// Drakengrot: levels + spelregels (puur, zonder THREE) zodat tools/solve_plates.mjs exact dezelfde regels gebruikt als de game.
//
// Een kaart is een lijst rijen; elke cel is een token van 2 tekens, gescheiden door spaties:
//   ..  vloer        ##  rots (muur)     --  leegte        ~~  lava (dodelijk)     ii  ijs (je glijdt door)     XX  uitgang (2 stuks)
//   @D  start Daan   @S  start Sem
//   P0..P3  drukplaat (kanaal/kleur 0..3)         G0..G3  deur (open zolang kanaal actief)
//   W0..W3  stenen muur (zelfde als deur, maar gaat omlaag; bedoeld voor hendels)      B0..B3  brug over een gat (dicht = gat = vallen!)
//   V0..V3  hendel (A ernaast = aan/uit, blijft staan)   K0..K3  sleutel    L0..L3  slot (open met sleutel van dezelfde kleur)
//   M/ M\   draaibare kristal-spiegel (A ernaast = draaien)   E^ E> Ev E<  lichtbron (straalt in die richting)   T0..T3  sensor (kanaal actief als de straal erop valt)
// Kanaal-kleuren: 0 rood, 1 blauw, 2 groen, 3 geel.
//
// Regels:
//  * Een kanaal is actief als er een speler op een drukplaat van die kleur staat, OF een hendel van die kleur aan staat, OF een sensor van die kleur wordt verlicht.
//  * Deur/muur (G/W) is open als het kanaal actief is, of als er iemand in staat (hij sluit pas als je eruit bent). Een brug (B) is alleen begaanbaar als het kanaal actief is; anders is het een gat.
//  * Lopen: 1 vakje per stap; op ijs glijd je door tot iets je tegenhoudt (rots, dichte deur, slot, de andere speler...). In lava of een gat vallen = terug naar je start.
//  * Een sleutel pak je op door er overheen te lopen. Loop je tegen een slot met de sleutel van dezelfde kleur, dan gaat het open (sleutel is op).
//  * Lichtstralen worden tegengehouden door rots, dichte deuren/muren, sloten en objecten; spiegels buigen ze 90 graden. Spelers houden een straal niet tegen.
//  * Uitgang: beide spelers moeten tegelijk op de twee XX-vakjes staan.

export const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // omhoog, omlaag, links, rechts
export const CH_COLORS = [0xe8453c, 0x3a8ae8, 0x35c46f, 0xf2c230];
export const CH_CSS = ['#e8453c', '#3a8ae8', '#35c46f', '#f2c230'];
export const CH_NAMES = ['rode', 'blauwe', 'groene', 'gele'];

export const LEVELS = [
  { name: 'De eerste plaat',
    hint: 'Eén van jullie gaat op de <b>drukplaat</b> staan: dan blijft de deur open. De ander loopt erdoor. Daarna moeten jullie <b>allebei op een uitgang</b> staan.',
    map: [
      '## ## ## ## ## ## ## ##',
      '## @D .. .. ## .. XX ##',
      '## @S P0 .. G0 .. .. ##',
      '## XX .. .. ## .. .. ##',
      '## ## ## ## ## ## ## ##',
    ] },
  { name: 'Lava en brug',
    hint: 'Pas op voor de <b>lava</b>! De brug is er alleen zolang iemand op een plaat van dezelfde kleur staat. Aan de overkant ligt ook zo\'n plaat.',
    map: [
      '## ## ## ## ## ## ## ## ## ## ##',
      '## .. .. .. ~~ ~~ ~~ .. .. XX ##',
      '## @D P0 .. B0 B0 B0 .. P0 .. ##',
      '## @S .. .. ~~ ~~ ~~ .. .. XX ##',
      '## ## ## ## ## ## ## ## ## ## ##',
    ] },
  { name: 'Hendel en sleutel',
    hint: 'Loop naast een <b>hendel</b> en druk op <b>{A}</b> om hem om te halen. Een <b>sleutel</b> pak je door erover te lopen; het slot van dezelfde kleur gaat open als je ertegenaan loopt.',
    map: [
      '## ## ## ## ## ## V1 ## ## ## ## ## ## ## ##',
      '## @D .. P0 ## .. P0 .. ## .. .. .. ## XX ##',
      '## .. .. .. G0 .. .. K3 W1 .. .. .. L3 .. ##',
      '## @S .. .. ## .. .. .. ## .. .. .. ## XX ##',
      '## ## ## ## ## ## ## ## ## ## ## ## ## ## ##',
    ] },
  { name: 'Gladde grot',
    hint: 'Op <b>ijs</b> glijd je door tot iets je tegenhoudt: een rots, een dichte deur... of je broer! Pas op voor lava.',
    map: [
      '## ## ## ## ## ## ## ## ## ##',
      '## @S ii ii ii ~~ ii ii XX ##',
      '## .. ii ~~ ii ii ii ii XX ##',
      '## @D ## ii ii ii ii ## .. ##',
      '## .. ii .. ii ii ## ~~ .. ##',
      '## .. ii ## ii ii ii ## .. ##',
      '## ## ## ## ## ## ## ## ## ##',
    ] },
  { name: 'Draaiende kristallen',
    hint: 'De lichtstraal moet de <b>sensor</b> raken. Draai de <b>kristal-spiegels</b> met <b>{A}</b> (ernaast staan). Eén spiegel staat achter een deur... Aan de straal kun je dwars door lava kijken!',
    map: [
      '## ## ## ## ## ## ## ## ## ## ## ## ## ##',
      'E> .. .. .. .. .. M/ .. .. .. ## XX ## ##',
      '## @D .. .. .. .. .. .. .. .. G1 P1 ## ##',
      '## @S .. ## ## ## ~~ ## ## ## ## XX ## ##',
      '## .. P0 ## .. .. .. .. .. ## ## ## ## ##',
      '## .. .. G0 .. .. M/ .. .. T1 ## ## ## ##',
      '## .. .. ## .. .. .. .. P0 ## ## ## ## ##',
      '## ## ## ## ## ## ## ## ## ## ## ## ## ##',
    ] },
  { name: 'De schatkamer',
    hint: 'Alles komt samen! De sleutel ligt ergens op het ijs. Zorg dat de straal de sensor raakt, en sta dan <b>samen</b> op de uitgang. Sssst, de draak slaapt...',
    map: [
      '## ## ## ## ## ## ## ## ## ## ## ## ## ##',
      '## .. .. .. .. ii ii ## .. ## .. ## XX ##',
      '## @D .. .. .. ii ii ii ii ## .. ## XX ##',
      '## .. .. .. .. ii ~~ ~~ ii ## ## T1 G1 ##',
      '## .. .. .. .. ~~ ii ii .. L3 .. .. .. ##',
      '## @S .. .. .. ~~ ii ~~ ~~ ## .. .. .. ##',
      '## .. .. .. .. ## K3 ii ii ## .. M/ .. E<',
      '## .. .. .. .. ii ii ii ## ## .. .. .. ##',
      '## ## ## ## ## ## ## ## ## ## ## ## ## ##',
    ] },
];

export function parseLevel(def) {
  const rows = def.map.map((r) => r.trim().split(/\s+/));
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const n = w * h;
  const L = {
    w, h, name: def.name, hint: def.hint, def,
    terrain: new Uint8Array(n),            // 0 void, 1 vloer, 2 rots, 3 lava, 4 ijs
    starts: [-1, -1], exits: [],
    plates: [], gates: [], levers: [], keys: [], locks: [], mirrors: [], emitters: [], sensors: [],
    obj: new Int16Array(n).fill(-1),       // index in de lijst van het object op deze cel
    objKind: new Array(n).fill(null),
    walkableList: [],
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tk = rows[y][x] || '--', i = y * w + x, a = tk[0], b = tk[1];
    const reg = (list, kind, o) => { L.obj[i] = list.length; L.objKind[i] = kind; list.push({ cell: i, ...o }); };
    L.terrain[i] = 1;
    if (tk === '##') L.terrain[i] = 2;
    else if (tk === '--') L.terrain[i] = 0;
    else if (tk === '~~') L.terrain[i] = 3;
    else if (tk === 'ii') L.terrain[i] = 4;
    else if (tk === 'XX') L.exits.push(i);
    else if (tk === '@D') L.starts[0] = i;
    else if (tk === '@S') L.starts[1] = i;
    else if (tk === '..') { /* vloer */ }
    else if (a === 'P') reg(L.plates, 'plate', { ch: +b });
    else if (a === 'G') reg(L.gates, 'gate', { ch: +b, kind: 'door' });
    else if (a === 'W') reg(L.gates, 'gate', { ch: +b, kind: 'wall' });
    else if (a === 'B') { reg(L.gates, 'gate', { ch: +b, kind: 'bridge' }); }
    else if (a === 'V') reg(L.levers, 'lever', { ch: +b });
    else if (a === 'K') reg(L.keys, 'key', { c: +b });
    else if (a === 'L') reg(L.locks, 'lock', { c: +b });
    else if (a === 'M') reg(L.mirrors, 'mirror', { o0: b === '/' ? 0 : 1 });
    else if (a === 'E') reg(L.emitters, 'emitter', { dir: '^v<>'.indexOf(b) });
    else if (a === 'T') reg(L.sensors, 'sensor', { ch: +b });
    else throw new Error(`onbekend token "${tk}" op ${x},${y}`);
  }
  // bruggen liggen boven een gat: terrein van een brug is 'gat' (dodelijk als dicht)
  L.n = n;
  return L;
}

// ------------------------------------------------------------------ toestand
export function initState(L) {
  return {
    p: [L.starts[0], L.starts[1]],
    lever: L.levers.map(() => 0),
    mirror: L.mirrors.map((m) => m.o0),
    key: L.keys.map(() => 0),     // 0 op de grond, 1 Daan heeft 'm, 2 Sem heeft 'm, 3 gebruikt
    lock: L.locks.map(() => 0),   // 1 = open
    deaths: 0,
  };
}
export function cloneState(s) { return { p: [s.p[0], s.p[1]], lever: s.lever.slice(), mirror: s.mirror.slice(), key: s.key.slice(), lock: s.lock.slice(), deaths: s.deaths }; }

// pakt de toestand in een getal (voor BFS)
export function packState(L, s) {
  let k = s.p[0] * 128 + s.p[1];
  let b = 0; for (let i = 0; i < s.lever.length; i++) b |= s.lever[i] << i; k = k * 16 + b;
  b = 0; for (let i = 0; i < s.mirror.length; i++) b |= s.mirror[i] << i; k = k * 64 + b;
  b = 0; for (let i = 0; i < s.key.length; i++) b |= s.key[i] << (2 * i); k = k * 256 + b;
  b = 0; for (let i = 0; i < s.lock.length; i++) b |= s.lock[i] << i; k = k * 16 + b;
  return k;
}
export function unpackState(L, k) {
  const s = { p: [0, 0], lever: [], mirror: [], key: [], lock: [], deaths: 0 };
  let b = k % 16; k = (k - b) / 16; for (let i = 0; i < L.locks.length; i++) s.lock.push((b >> i) & 1);
  b = k % 256; k = (k - b) / 256; for (let i = 0; i < L.keys.length; i++) s.key.push((b >> (2 * i)) & 3);
  b = k % 64; k = (k - b) / 64; for (let i = 0; i < L.mirrors.length; i++) s.mirror.push((b >> i) & 1);
  b = k % 16; k = (k - b) / 16; for (let i = 0; i < L.levers.length; i++) s.lever.push((b >> i) & 1);
  s.p[1] = k % 128; s.p[0] = (k - s.p[1]) / 128;
  return s;
}

// ------------------------------------------------------------------ afgeleide toestand: kanalen, deuren, straal
// excl = speler die net wegloopt (telt niet mee voor platen / deur-bezetting)
export function derive(L, s, excl = -1) {
  const press = [0, 0, 0, 0], plateOn = new Array(L.plates.length).fill(0);
  const occ = (cell) => (s.p[0] === cell && excl !== 0) || (s.p[1] === cell && excl !== 1);
  L.plates.forEach((pl, i) => { if (occ(pl.cell)) { press[pl.ch] = 1; plateOn[i] = 1; } });
  const lev = [0, 0, 0, 0]; L.levers.forEach((lv, i) => { if (s.lever[i]) lev[lv.ch] = 1; });
  const lit = new Array(L.sensors.length).fill(0);
  let active = [0, 0, 0, 0], gateOpen = new Array(L.gates.length).fill(0), beam = [];
  const calcOpen = () => L.gates.map((g, i) => (active[g.ch] || (g.kind !== 'bridge' && occ(g.cell))) ? 1 : 0);
  for (let it = 0; it < 6; it++) {
    for (let c = 0; c < 4; c++) { active[c] = press[c] | lev[c]; }
    L.sensors.forEach((sn, i) => { if (lit[i]) active[sn.ch] = 1; });
    gateOpen = calcOpen();
    const res = traceBeams(L, s, gateOpen);
    let changed = false;
    res.lit.forEach((v, i) => { if (v && !lit[i]) { lit[i] = 1; changed = true; } });
    beam = res.segs;
    if (!changed) break;
  }
  return { active, gateOpen, plateOn, lit, beam, occ };
}

export function cellX(L, i) { return i % L.w; }
export function cellY(L, i) { return (i / L.w) | 0; }
export function nbr(L, cell, d) {
  const x = cell % L.w + DIRS[d][0], y = ((cell / L.w) | 0) + DIRS[d][1];
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return -1;
  return y * L.w + x;
}

// De lichtstralen. Geeft {lit[], segs: [{from, to}] (celindexen, voor tekenen)}
export function traceBeams(L, s, gateOpen) {
  const lit = new Array(L.sensors.length).fill(0), segs = [];
  for (const em of L.emitters) {
    let cur = em.cell, d = em.dir;
    for (let step = 0; step < 90; step++) {
      const nx = nbr(L, cur, d); if (nx < 0) break;
      const t = L.terrain[nx];
      if (t === 0 || t === 2) { segs.push({ from: cur, to: nx, end: true }); break; }
      const kind = L.objKind[nx], oi = L.obj[nx];
      if (kind === 'gate') { const g = L.gates[oi]; if (g.kind !== 'bridge' && !gateOpen[oi]) { segs.push({ from: cur, to: nx, end: true }); break; } }
      else if (kind === 'lock') { if (!s.lock[oi]) { segs.push({ from: cur, to: nx, end: true }); break; } }
      else if (kind === 'lever' || kind === 'emitter') { segs.push({ from: cur, to: nx, end: true }); break; }
      else if (kind === 'sensor') { lit[oi] = 1; segs.push({ from: cur, to: nx, end: true }); break; }
      else if (kind === 'mirror') {
        segs.push({ from: cur, to: nx });
        const o = s.mirror[oi]; const dx = DIRS[d][0], dy = DIRS[d][1];
        const ndx = o === 0 ? -dy : dy, ndy = o === 0 ? -dx : dx; // '/' : (dx,dy)->(-dy,-dx);  '\' : (dx,dy)->(dy,dx)
        d = DIRS.findIndex(([a, b]) => a === ndx && b === ndy);
        cur = nx; continue;
      }
      segs.push({ from: cur, to: nx }); cur = nx;
    }
  }
  return { lit, segs };
}

// ------------------------------------------------------------------ acties
// Is cel `c` te betreden voor `who`? -> 'blocked' | 'ok'
function enterable(L, s, d, who, c) {
  const t = L.terrain[c];
  if (t === 0 || t === 2) return false;
  if (s.p[1 - who] === c) return false;
  const kind = L.objKind[c], oi = L.obj[c];
  if (kind === 'mirror' || kind === 'emitter' || kind === 'sensor' || kind === 'lever') return false;
  if (kind === 'gate') { const g = L.gates[oi]; if (g.kind === 'bridge') return true; return !!d.gateOpen[oi]; }
  if (kind === 'lock') { if (s.lock[oi]) return true; const lk = L.locks[oi]; return s.key.some((st, ki) => st === who + 1 && L.keys[ki].c === lk.c); }
  return true;
}

export function isDeadly(L, s, d, cell) {
  if (L.terrain[cell] === 3) return true;
  if (L.objKind[cell] === 'gate') { const oi = L.obj[cell]; if (L.gates[oi].kind === 'bridge' && !d.gateOpen[oi]) return true; }
  return false;
}

// vrije cel dichtbij de start (voor respawn)
export function respawnCell(L, s, who) {
  const st = L.starts[who]; const other = s.p[1 - who];
  if (st !== other) return st;
  for (let d = 0; d < 4; d++) { const c = nbr(L, st, d); if (c >= 0 && L.terrain[c] === 1 && c !== other && !L.objKind[c]) return c; }
  for (let c = 0; c < L.n; c++) if (L.terrain[c] === 1 && c !== other && !L.objKind[c]) return c;
  return st;
}

// Zet een stap (met glijden). Retourneert { s, path:[cellen], events:[...] } of null als er niets gebeurt.
export function actMove(L, s0, who, dir) {
  const s = cloneState(s0); const events = []; const path = [];
  const d = derive(L, s, who);
  let cur = s.p[who], moved = false;
  for (let guard = 0; guard < 60; guard++) {
    const nx = nbr(L, cur, dir);
    if (nx < 0 || !enterable(L, s, d, who, nx)) break;
    cur = nx; moved = true; path.push(cur);
    const kind = L.objKind[cur], oi = L.obj[cur];
    if (isDeadly(L, s, d, cur)) { s.p[who] = cur; return finishDeath(L, s, who, events, path, cur); }
    if (kind === 'key' && s.key[oi] === 0) { s.key[oi] = who + 1; events.push({ t: 'key', who, idx: oi, cell: cur }); }
    if (kind === 'lock' && !s.lock[oi]) {
      const lk = L.locks[oi]; const ki = s.key.findIndex((st, k) => st === who + 1 && L.keys[k].c === lk.c);
      s.key[ki] = 3; s.lock[oi] = 1; events.push({ t: 'unlock', who, idx: oi, cell: cur }); break;
    }
    if (L.terrain[cur] !== 4) break;
  }
  if (!moved) return null;
  s.p[who] = cur;
  return settle(L, s, events, path, who);
}

export function actInteract(L, s0, who) {
  const s = cloneState(s0); const c = s.p[who];
  for (let d = 0; d < 4; d++) {
    const nx = nbr(L, c, d); if (nx < 0) continue; const kind = L.objKind[nx], oi = L.obj[nx];
    if (kind === 'lever') { s.lever[oi] ^= 1; return settle(L, s, [{ t: 'lever', who, idx: oi, cell: nx, on: s.lever[oi] }], [], who); }
    if (kind === 'mirror') { s.mirror[oi] ^= 1; return settle(L, s, [{ t: 'mirror', who, idx: oi, cell: nx }], [], who); }
  }
  return null;
}

function finishDeath(L, s, who, events, path, cell) {
  events.push({ t: 'die', who, cell, cause: L.terrain[cell] === 3 ? 'lava' : 'gat' });
  s.p[who] = respawnCell(L, s, who); s.deaths++;
  return settle(L, s, events, path, who);
}

// na elke actie: val door dichtgegane bruggen e.d. en bepaal of het level klaar is
export function settle(L, s, events, path, who) {
  for (let it = 0; it < 4; it++) {
    const d = derive(L, s, -1);
    let died = false;
    for (let w = 0; w < 2; w++) if (isDeadly(L, s, d, s.p[w])) {
      events.push({ t: 'die', who: w, cell: s.p[w], cause: L.terrain[s.p[w]] === 3 ? 'lava' : 'gat', fall: true });
      s.p[w] = respawnCell(L, s, w); s.deaths++; died = true;
    }
    if (!died) break;
  }
  return { s, path, events, win: isWin(L, s) };
}

export function isWin(L, s) {
  const [a, b] = L.exits; if (a == null || b == null) return false;
  return (s.p[0] === a && s.p[1] === b) || (s.p[0] === b && s.p[1] === a);
}

// alle mogelijke acties: 0..3 = lopen, 4 = A
export function act(L, s, who, a) { return a < 4 ? actMove(L, s, who, a) : actInteract(L, s, who); }

export function validateLevel(L) {
  const errs = [];
  if (L.starts[0] < 0 || L.starts[1] < 0) errs.push('starts ontbreken');
  if (L.exits.length !== 2) errs.push('er moeten precies 2 uitgangen zijn');
  const chOf = (list) => list.map((o) => o.ch);
  const sources = new Set([...chOf(L.plates), ...chOf(L.levers), ...chOf(L.sensors)]);
  const gateCh = new Set(chOf(L.gates));
  for (const c of gateCh) if (!sources.has(c)) errs.push(`kanaal ${c}: deur zonder bron`);
  for (const c of sources) if (!gateCh.has(c)) errs.push(`kanaal ${c}: bron zonder deur`);
  L.locks.forEach((lk) => { if (L.locks.filter((o) => o.c === lk.c).length !== 1 || L.keys.filter((o) => o.c === lk.c).length !== 1) errs.push(`slot/sleutel kleur ${lk.c}: moet precies 1 slot en 1 sleutel hebben`); });
  L.keys.forEach((k) => { if (!L.locks.some((o) => o.c === k.c)) errs.push(`sleutel ${k.c} zonder slot`); });
  // elke begaanbare cel mag naast hoogstens 1 bedienbaar object (hendel/spiegel) liggen
  for (let c = 0; c < L.n; c++) {
    if (L.terrain[c] === 0 || L.terrain[c] === 2 || L.objKind[c] === 'mirror' || L.objKind[c] === 'lever' || L.objKind[c] === 'emitter' || L.objKind[c] === 'sensor') continue;
    let cnt = 0; for (let d = 0; d < 4; d++) { const nx = nbr(L, c, d); if (nx >= 0 && (L.objKind[nx] === 'lever' || L.objKind[nx] === 'mirror')) cnt++; }
    if (cnt > 1) errs.push(`cel ${c % L.w},${(c / L.w) | 0} ligt naast ${cnt} bedienbare objecten`);
  }
  return errs;
}

export function renderAscii(L, s) {
  const out = [];
  for (let y = 0; y < L.h; y++) {
    let r = '';
    for (let x = 0; x < L.w; x++) {
      const c = y * L.w + x; let ch = ' ';
      const t = L.terrain[c]; const k = L.objKind[c];
      ch = t === 0 ? ' ' : t === 2 ? '#' : t === 3 ? '~' : t === 4 ? 'i' : '.';
      if (L.exits.includes(c)) ch = 'X';
      if (k === 'plate') ch = String(L.plates[L.obj[c]].ch + 1);
      if (k === 'gate') { const g = L.gates[L.obj[c]]; ch = (g.kind === 'bridge' ? 'ABCD' : g.kind === 'wall' ? 'wxyz' : 'abcd')[g.ch]; }
      if (k === 'lever') ch = 'v'; if (k === 'key') ch = 'k'; if (k === 'lock') ch = 'l'; if (k === 'mirror') ch = s && s.mirror[L.obj[c]] ? '\\' : '/'; if (k === 'emitter') ch = 'E'; if (k === 'sensor') ch = 'T';
      if (s && s.p[0] === c) ch = 'D'; if (s && s.p[1] === c) ch = 'S';
      r += ch;
    }
    out.push(r);
  }
  return out.join('\n');
}

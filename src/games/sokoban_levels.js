// Kratten Schuiven: levels + spelregels (puur, zonder THREE) zodat tools/solve_sokoban.mjs
// exact dezelfde regels gebruikt als de game.
//
// Legenda:  #=muur  .=vloer  G=doelvak  $=krat  *=krat op doelvak  D=Wes (speler 0)  S=Jor (speler 1)
//           spatie = leegte (buiten het magazijn)
// Regels: een speler loopt 1 vakje; staat daar een krat dan wordt die 1 vakje meegeduwd, mits het vakje erachter
// vrij is (geen muur, krat of speler). Spelers kunnen niet door elkaar of elkaar duwen.

export const LEVELS = [
  { name: 'Eerste krat',
    hint: 'Loop tegen de krat om hem te duwen. Duw hem op de <b>gloeiende plaat</b>!',
    map: [
      '########',
      '#S.....#',
      '#..$..G#',
      '#D.....#',
      '########',
    ] },
  { name: 'Twee kratten',
    hint: 'Twee kratten, twee platen. Jullie mogen <b>tegelijk</b> duwen, maar niet door elkaar heen lopen!',
    map: [
      '#########',
      '#D......#',
      '#.$..$..#',
      '#.....#G#',
      '#S....#G#',
      '#########',
    ] },
  { name: 'Jor zit vast!',
    hint: 'Oei, Jor zit opgesloten! <b>Wes</b>, maak de weg vrij. <b>Jor</b>, duw de krat naar buiten. Duwen kan alleen als er <b>niets</b> achter de krat staat.',
    map: [
      '########',
      '#D..#S.#',
      '#...#$##',
      '#....$.#',
      '#..GG..#',
      '########',
    ] },
  { name: 'Hoekje om',
    hint: 'Een krat kun je alleen <b>duwen</b>, nooit trekken. Duw hem dus nooit in een hoek (tenzij daar een plaat ligt)!',
    map: [
      '########',
      '###..D.#',
      '##.#...#',
      '#S$.$..#',
      '#.GG.#.#',
      '########',
    ] },
  { name: 'Smalle gang',
    hint: 'Jullie staan elkaar in de weg. Wissel van plek, of ga opzij zodat de ander erlangs kan.',
    map: [
      '########',
      '#####G##',
      '#..$D..#',
      '#.$$#.##',
      '#.GS#G##',
      '########',
    ] },
  { name: 'Aan twee kanten',
    hint: 'Sommige kratten moeten van <b>twee kanten</b> geduwd worden. Verdeel het werk!',
    map: [
      '########',
      '#.#....#',
      '#.##$.$#',
      '#G$.D..#',
      '#G..#SG#',
      '########',
    ] },
  { name: 'Drukte in het magazijn',
    hint: 'Drie kratten, drie platen. Denk eerst na over de <b>volgorde</b>: welke krat moet als eerste?',
    map: [
      '########',
      '#G#.DS.#',
      '#.##$$.#',
      '#G.G.$.#',
      '#.#....#',
      '########',
    ] },
  { name: 'Het grote magazijn',
    hint: 'Het laatste level! Wes zit in de gang links, Jor in de hal. Help elkaar en let op de volgorde.',
    map: [
      '#########',
      '#.#.....#',
      '#.#$..$.#',
      '#D#S.#..#',
      '#...$#G.#',
      '#G.G.#.##',
      '#########',
    ] },
];

export const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // omhoog, omlaag, links, rechts

export function parseLevel(def) {
  const rows = def.map;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const L = { w, h, name: def.name, hint: def.hint, wall: new Uint8Array(w * h), void: new Uint8Array(w * h), goal: new Uint8Array(w * h), crates: [], players: [-1, -1], floors: [] };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] || ' ', i = y * w + x;
    if (ch === '#') L.wall[i] = 1;
    else if (ch === ' ') { L.wall[i] = 1; L.void[i] = 1; }
    else {
      L.floors.push(i);
      if (ch === 'G' || ch === '*') L.goal[i] = 1;
      if (ch === '$' || ch === '*') L.crates.push(i);
      if (ch === 'D') L.players[0] = i;
      if (ch === 'S') L.players[1] = i;
    }
  }
  L.goals = []; for (let i = 0; i < w * h; i++) if (L.goal[i]) L.goals.push(i);
  return L;
}

// Probeer speler `who` een stap (dx,dy) te laten zetten. Retourneert null of {to, crate (index of -1), crateTo}.
export function tryMove(L, p, c, who, dx, dy) {
  const from = p[who];
  const x = from % L.w + dx, y = ((from / L.w) | 0) + dy;
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return null;
  const n = y * L.w + x;
  if (L.wall[n] || n === p[1 - who]) return null;
  const ci = c.indexOf(n);
  if (ci < 0) return { to: n, crate: -1, crateTo: -1 };
  const mx = x + dx, my = y + dy;
  if (mx < 0 || my < 0 || mx >= L.w || my >= L.h) return null;
  const m = my * L.w + mx;
  if (L.wall[m] || m === p[1 - who] || c.indexOf(m) >= 0) return null;
  return { to: n, crate: ci, crateTo: m };
}

export function isSolved(L, c) {
  for (let i = 0; i < c.length; i++) if (!L.goal[c[i]]) return false;
  return true;
}

export function validateLevel(L) {
  const errs = [];
  if (L.players[0] < 0 || L.players[1] < 0) errs.push('spelers ontbreken');
  if (L.crates.length !== L.goals.length) errs.push(`kratten (${L.crates.length}) != doelen (${L.goals.length})`);
  return errs;
}

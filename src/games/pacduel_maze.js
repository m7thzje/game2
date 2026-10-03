// Doolhof van "Spookjacht-Duel" — alleen data en rooster-logica (geen THREE), zodat het ook in node te testen is.
// De linkerhelft (kolom 0..10) wordt gespiegeld: wat links geldt, geldt rechts precies zo. Eerlijk dus.
//  '#' muur  '.' gang  'o' krachtbol  'S' startplek  'G' spookjes-startplek (midden)
const LEFT = [
  '###########',
  '#o...#.....',
  '#.##.#.####',
  '#.##.#.####',
  '..........#',
  '#.##.#.##.#',
  '#....#.#...',
  '#o##.#.#.#G',
  '#.##.#.#...',
  '#.##.#.#.#.',
  '...........',
  '#.##.###.##',
  '#.##.......',
  '#....#.S...',
  '###########',
];
export const W = 21, H = LEFT.length;
export const CELL = 1.8;                             // wereld-eenheden per vakje
export const TUNNEL_ROWS = [4, 10];                  // in deze rijen lopen de zijkanten door (wrap-around)

export function buildMaze() {
  const wall = new Uint8Array(W * H), orbs = [], starts = [], ghosts = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < 11; x++) {
    const c = LEFT[z][x];
    for (const xx of x === 10 ? [10] : [x, W - 1 - x]) {
      const i = z * W + xx;
      if (c === '#') wall[i] = 1;
      else if (c === 'o') orbs.push([xx, z]);
      else if (c === 'S') starts[xx === x ? 0 : 1] = [xx, z];
      else if (c === 'G' && xx === 10) ghosts.push([xx, z]);
    }
  }
  // spiegel-garantie
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (wall[z * W + x] !== wall[z * W + (W - 1 - x)]) throw new Error('doolhof niet symmetrisch');
  const cells = [];   // alle vakjes waar munten kunnen liggen
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (!wall[z * W + x]) cells.push([x, z]);
  return { wall, orbs, starts, ghost: ghosts[0] || [10, 7], cells };
}

// Indeling van het dorp en de omgeving. x = oost(+)/west(-), z = zuid(+)/noord(-). Camera kijkt standaard naar het noorden.
export const WORLD = 300;

export const riverX = (z) => -37 + 6 * Math.sin(z / 19) + 2 * Math.sin(z / 7.3);
export const BRIDGE = { z: 8, len: 20, w: 4.4, y: 0.55 };
BRIDGE.x = riverX(BRIDGE.z);

// Alle klussen: NPC, plek, gebouw
// yaw: richting waarin NPC kijkt (0 = naar +z/zuid, PI = noord, PI/2 = oost(+x), -PI/2 = west)
export const JOBS = [
  { id: 'catch',    npc: 'baker',    who: 'Bakker Bram',            x: -19.5, z: -6,  yaw: Math.PI / 2,  place: 'Bakkerij',            when: 'dag' },
  { id: 'kitchen',  npc: 'innkeeper',who: 'Waardin Wilma',          x: 20.5,  z: -8,  yaw: -Math.PI / 2, place: 'Taverne De Gouden Griffioen', when: 'dag' },
  { id: 'rhythm',   npc: 'bard',     who: 'Bard Bas',               x: 0,     z: -9.4,yaw: 0, lift: 0.55,            place: 'Podium op het plein', when: 'dag' },
  { id: 'hotbomb',  npc: 'jester',   who: 'Nar Nico',               x: 12.8,  z: 5.8, yaw: -2.0,         place: 'Kermistent op het plein', when: 'dag' },
  { id: 'sokoban',  npc: 'foreman',  who: 'Voorman Wim',            x: 27,    z: 12,  yaw: Math.PI,      place: 'Magazijn',            when: 'dag' },
  { id: 'whack',    npc: 'farmer',   who: 'Boer Boris',             x: -14,   z: 31,  yaw: Math.PI,      place: 'Boerderij (moestuin)', when: 'dag' },
  { id: 'mudcart',  npc: 'carter',   who: 'Karrenman Koen',         x: -13.5, z: 13.5, yaw: -1.4,         place: 'Modderpad ten westen van het plein, bij de rivier', when: 'dag' },
  { id: 'goblins',  npc: 'shepherd', who: 'Schaapherder Sjoerd',    x: 14,    z: 44,  yaw: Math.PI,      place: 'Schapenweide (zuiden)', when: 'nacht' },
  { id: 'fishing',  npc: 'fisher',   who: 'Visser Floris',          x: -34,   z: -17, yaw: -Math.PI / 2, place: 'Steiger aan de rivier', when: 'dag' },
  { id: 'potion',   npc: 'witch',    who: 'Heks Hendrika',          x: -56,   z: 4,   yaw: Math.PI / 2,  place: 'Heksenhut in het moeras (over de brug)', when: 'dag' },
  { id: 'plates',   npc: 'dwarf',    who: 'Dwerg Dolf',             x: 54,    z: -12, yaw: Math.PI / 2,  place: 'Grot in het oosten', when: 'dag' },
  { id: 'sweeper',  npc: 'captain',  who: 'Kapitein Karel',         x: -4,    z: -47, yaw: 0,            place: 'Kasteelplein (noorden)', when: 'dag' },
  { id: 'breakout', npc: 'mason',    who: 'Metselaar Mo',           x: -24,   z: -48, yaw: 0.8,          place: 'Oude muur bij het kasteel', when: 'dag' },
  { id: 'sumo',     npc: 'sumo',     who: 'Sumo-Sjaak',             x: 38,    z: -39, yaw: Math.PI / 2,  place: 'Bevroren vijver (noordoosten)', when: 'dag' },
];
export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));

export const HOME = { x: -9, z: 24, yaw: Math.PI / 2 };   // huisje van de broers (deur kijkt oost, naar de weg)
export const SPAWN = { x: -1.5, z: 20 };
export const PLAZA = { x: 0, z: 0, r: 14 };
export const BOOTH = { x: 9, z: -5 };                       // kaartverkoop
export const BOARD = { x: 0, z: 12 };                       // klussenbord
export const CAVE = { x: 62, z: -12 };
export const CASTLE = { x: 0, z: -80, y: 11 };
export const CONCERT_GATE = { x: 0, z: -63 };
export const ICE = { x: 44, z: -40, r: 13 };
export const SWAMP = { x: -58, z: 8, r: 26 };
export const FARM = { x: -14, z: 38 };
export const PASTURE = { x: 14, z: 46, r: 16 };

// paden: polylijnen waarlangs een zandpad wordt geschilderd
export const PATHS = [
  [[0, 14], [-1, 22]], [[0, 24], [-5.5, 24]],
  [[-14, 0], [-20, -6]], [[14, 0], [20, -8]],
  [[0, 14], [0, 24], [-4, 31], [-14, 31]],
  [[0, 14], [8, 30], [14, 44]],
  [[-5.5, 24], [-10, 18], [-14, 14]],
  [[14, 6], [27, 12]],
  [[14, 2], [24, -2], [36, -6], [54, -12]],
  [[0, -14], [0, -30], [-2, -47], [0, -63]],
  [[-2, -47], [-24, -48]],
  [[14, -4], [24, -20], [38, -39]],
  [[-14, 0], [-28, 4], [-33, 8], [-48, 6], [-56, 4]],
  [[-18, -8], [-30, -15], [-34, -17]],
];

// zones waar GEEN bomen/struiken mogen staan: {x,z,r}
export const KEEPOUT = [
  { x: 0, z: 0, r: 17 }, { x: HOME.x, z: HOME.z, r: 9 }, { x: -22, z: -6, r: 11 }, { x: 25, z: -8, r: 13 }, { x: 27, z: 14, r: 11 },
  { x: -15, z: 36, r: 18 }, { x: 14, z: 46, r: 19 }, { x: -17, z: 13.5, r: 9 }, { x: -34, z: -17, r: 6 }, { x: -56, z: 4, r: 9 },
  { x: 56, z: -12, r: 10 }, { x: -2, z: -48, r: 15 }, { x: -24, z: -48, r: 9 }, { x: 38, z: -39, r: 9 }, { x: ICE.x, z: ICE.z, r: ICE.r + 2 },
  { x: CASTLE.x, z: CASTLE.z + 10, r: 30 }, { x: 0, z: -63, r: 6 }, { x: 9, z: -5, r: 4 }, { x: 11, z: 6.5, r: 7 }, { x: 0, z: -9, r: 9 },
  { x: BRIDGE.x, z: BRIDGE.z, r: 13 },
];

// verspreide verzamelobjecten: gouden deurknoppen (8) en schatkisten
export const DOORKNOBS = [
  { id: 'k1', x: -5, z: 19, hint: 'Vlak bij huis, achter de bloemen' },
  { id: 'k2', x: 33, z: 30, hint: 'Achter het magazijn' },
  { id: 'k3', x: -26, z: -34, hint: 'Langs de rivier in het noordwesten' },
  { id: 'k4', x: 22, z: 52, hint: 'Aan de rand van de schapenweide' },
  { id: 'k5', x: 50, z: -26, hint: 'In de sneeuw bij de bevroren vijver' },
  { id: 'k6', x: -62, z: 22, hint: 'Diep in het moeras' },
  { id: 'k7', x: -12, z: -60, hint: 'Bij de oude kasteelmuur' },
  { id: 'k8', x: 58, z: 8, hint: 'Op een rots bij de grot' },
];
export const CHESTS = [
  { id: 'c1', x: -47, z: 42, v: 25 }, { id: 'c2', x: 40, z: 38, v: 25 }, { id: 'c3', x: 28, z: -26, v: 25 }, { id: 'c4', x: -48, z: -8, v: 25 },
  { id: 'c5', x: 60, z: -30, v: 30 }, { id: 'c6', x: -74, z: 24, v: 30 }, { id: 'c7', x: 8, z: -44, v: 25 }, { id: 'c8', x: -20, z: 56, v: 25 },
];
export function coinTrail() {
  // ~60 muntjes langs de paden
  const out = []; let n = 0;
  for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cnt = Math.floor(len / 9);
    for (let k = 1; k <= cnt; k++) { const t = k / (cnt + 1); out.push({ id: 'm' + n++, x: a[0] + (b[0] - a[0]) * t + ((n * 7) % 3 - 1) * 0.8, z: a[1] + (b[1] - a[1]) * t, v: 2 }); }
  }
  return out;
}

export const TICKET_PRICE = 600;
export const VIP_PRICE = 400;

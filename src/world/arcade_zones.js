// Zones (thema-eilanden) per speelhal: data + opstellingen. De spel-ids komen uit ARCADE_HALLS (src/games/index.js);
// ids die in geen enkele zone staan worden automatisch aan de laatste zone toegevoegd, zodat er nooit een spel kwijtraakt.
import { ARCADE_HALLS } from '../games/index.js';

export const HALL_SIZE = { w: 56, d: 40 };   // x: -28..28, z: -20..20

// Opstellingen: geven [{ x, z, yaw }] relatief aan het zonemiddelpunt. yaw 0 = kijkt naar +z (de camera).
const D2R = Math.PI / 180;
// boog van n kasten op straal R rond (0,0); mid = richting van het midden van de boog (graden, -90 = achterkant) ; kijken naar het centrum
export const arc = (n, R, span = 140, mid = -90) => Array.from({ length: n }, (_, i) => {
  const a = (mid + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span)) * D2R; const x = Math.cos(a) * R, z = Math.sin(a) * R;
  return { x, z, yaw: Math.atan2(-x, -z) };
});
export const row = (n, gap, z = 0, yaw = 0) => Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * gap, z, yaw }));
export const stagger = (n, gap, dz = 2.6, z = -2) => Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * gap, z: z + (i % 2 ? dz : 0), yaw: 0 }));

// Per hal: lijst zones. rug: patroon van het kleed; prop: sfeer-decor (zie arcade_props.js)
export const ZONES = [
  [   // 0 Speelhal (koninklijk)
    { id: 'arena', name: 'Arena', icon: '⚔️', sub: 'knokken & mikken', color: 0xd8372c, color2: 0xf6f0e0, cx: -18.5, cz: -3, R: 8.2, rug: 'target', prop: 'arena', style: 'upright',
      ids: ['dodgeball', 'cakefight', 'tugwar', 'airhockey', 'tanks'], at: arc(5, 6.6, 150), tableIds: ['airhockey'] },
    { id: 'denk', name: 'Denkhoek', icon: '🧠', sub: 'slim zijn loont', color: 0x2f6fe0, color2: 0xffe14a, cx: 20.5, cz: -3, R: 8.2, rug: 'stars', prop: 'denk', style: 'upright',
      ids: ['memory', 'quickdraw', 'chairs', 'screws'], at: stagger(4, 3.5, 3.2, -3.2), tableIds: ['memory'] },
    { id: 'race', name: 'Racebaan', icon: '🏁', sub: 'gas geven!', color: 0x2fae5b, color2: 0x1a1a22, cx: -17.5, cz: 11, R: 8.6, rug: 'track', prop: 'race', style: 'sit',
      ids: ['karts', 'minecart', 'ticktock', 'climb', 'vines'], at: row(5, 4.5, -4.6), tableIds: [] },
    { id: 'gek', name: 'Gekke Hoek', icon: '🤪', sub: 'alles mag, niks klopt', color: 0xb05aff, color2: 0xffe14a, cx: 17.5, cz: 11, R: 8.6, rug: 'dots', prop: 'gek', style: 'upright',
      ids: ['paint', 'duckshoot', 'buttons', 'chop'], at: [{ x: -5.5, z: -2.8, yaw: 0.45 }, { x: -1.2, z: -5.2, yaw: 0.05 }, { x: 3.4, z: -4.2, yaw: -0.35 }, { x: 6.8, z: -0.4, yaw: -0.8 }], tableIds: [] },
    { id: 'drie', name: 'Drietjes', icon: '3️⃣', sub: 'voor Wes, Jor én Juul', color: 0xff9a3c, color2: 0xffe14a, cx: 0, cz: 12.5, R: 6.2, rug: 'dots', prop: 'gek', style: 'upright',
      ids: ['koningsberg', 'driehoek', 'buzz3', 'sneeuwgevecht'], at: arc(4, 4.4, 150, 90), tableIds: [] },
  ],
  [   // 1 Neonkelder
    { id: 'dans', name: 'Dansvloer', icon: '🪩', sub: 'swingen met je duim', color: 0xff2bd6, color2: 0x00e5ff, cx: -19, cz: -4, R: 8, rug: 'led', prop: 'dans', style: 'upright',
      ids: ['dance', 'tron', 'hexagone'], at: arc(3, 5.6, 110), tableIds: [] },
    { id: 'ring', name: 'Vechtring', icon: '🥊', sub: 'ding ding ding', color: 0xff4a3a, color2: 0xffe14a, cx: 19, cz: -4, R: 8.2, rug: 'ring', prop: 'ring', style: 'upright',
      ids: ['brawl', 'bomber', 'tag', 'spacewar'], at: arc(4, 6.8, 140), tableIds: [] },
    { id: 'puzzel', name: 'Puzzel-lounge', icon: '🧩', sub: 'even rustig nadenken', color: 0x7bff00, color2: 0x00e5ff, cx: -18, cz: 11.5, R: 8.6, rug: 'puzzle', prop: 'puzzel', style: 'upright',
      ids: ['connect4', 'blocks', 'stack', 'pacduel'], at: stagger(4, 4.4, 3.2, -3.4), tableIds: ['connect4', 'blocks'] },
    { id: 'sport', name: 'Sportcourt', icon: '⚽', sub: 'goal! of toch niet', color: 0xffe14a, color2: 0x00ffa8, cx: 18, cz: 11.5, R: 8.6, rug: 'court', prop: 'sport', style: 'upright',
      ids: ['soccer', 'volley', 'golf'], at: row(3, 4.8, -4.8), tableIds: [] },
  ],
  [   // 2 Kermis: kraampjes (elke kast is een eigen kraam)
    { id: 'eten', name: 'Eten & Show', icon: '🍰', sub: 'taart, quiz en kip', color: 0xe8372c, color2: 0xf6f0e0, cx: -18.5, cz: -4, R: 8.4, rug: 'straw', prop: 'eten', style: 'stall',
      ids: ['bake', 'quiz', 'claw'], at: [{ x: -4.6, z: -3.2, yaw: 0.35 }, { x: 0.8, z: -5.8, yaw: 0 }, { x: 6.2, z: -2.6, yaw: -0.4 }], tableIds: [] },
    { id: 'gooi', name: 'Gooi & Rol', icon: '🎯', sub: 'raak of mis', color: 0x2f9be0, color2: 0xffd23f, cx: 18.5, cz: -4, R: 8.4, rug: 'straw', prop: 'gooi', style: 'stall',
      ids: ['bowling', 'ducks', 'catapult'], at: [{ x: -6.2, z: -2.4, yaw: 0.4 }, { x: -0.4, z: -5.6, yaw: 0 }, { x: 5.8, z: -2.2, yaw: -0.4 }], tableIds: [] },
    { id: 'tent', name: 'Mysterietenten', icon: '🔮', sub: 'niemand weet wat erin zit', color: 0xb05aff, color2: 0xffd23f, cx: -18, cz: 11.5, R: 8.4, rug: 'straw', prop: 'tent', style: 'stall',
      ids: ['code', 'hide', 'heist'], at: [{ x: -5.8, z: -2.8, yaw: 0.4 }, { x: -0.2, z: -5.4, yaw: 0 }, { x: 5.6, z: -2.4, yaw: -0.4 }], tableIds: [] },
    { id: 'gok', name: 'Gokhoek', icon: '🎰', sub: 'alles of niets', color: 0xffa030, color2: 0xff7ab0, cx: 18, cz: 11.5, R: 8.4, rug: 'straw', prop: 'gok', style: 'stall',
      ids: ['pinball', 'kalaha', 'flappy'], at: [{ x: -6, z: -2.4, yaw: 0.4 }, { x: -0.2, z: -5.4, yaw: 0 }, { x: 5.8, z: -2.4, yaw: -0.4 }], tableIds: [] },
  ],
  [   // 3 Sporthal: sportkasten als mini-arena's; 'kantine' is een zone zonder kasten (alleen sfeer + easter egg)
    { id: 'balsport', name: 'Balsporten', icon: '⚽', sub: 'trap, gooi, tik', color: 0x2fae5b, color2: 0xffe14a, cx: -19, cz: -4, R: 8.6, rug: 'parket', prop: 'balsport', style: 'sport',
      ids: ['penalty', 'basket', 'pingpong'], at: [{ x: -5.6, z: -2.4, yaw: 0.5 }, { x: 0, z: -5.8, yaw: 0 }, { x: 5.8, z: -2.6, yaw: -0.5 }], tableIds: [] },
    { id: 'mikken', name: 'Mikken', icon: '🎯', sub: 'raak! (of toch niet)', color: 0xe8372c, color2: 0xf6f0e0, cx: 19, cz: -4, R: 8.4, rug: 'mik', prop: 'mikken', style: 'sport',
      ids: ['darts', 'boog'], at: [{ x: -3.8, z: -3.6, yaw: 0.4 }, { x: 3.8, z: -3.6, yaw: -0.4 }], tableIds: [] },
    { id: 'kantine', name: 'Kantine', icon: '🌭', sub: 'worstjes & water', color: 0xffa030, color2: 0xf6f0e0, cx: -18, cz: 11.5, R: 8.2, rug: 'kantine', prop: 'kantine', style: 'sport',
      ids: [], at: [], tableIds: [] },
    { id: 'ijsbaan', name: 'IJsbaan', icon: '🥌', sub: 'glijden en vegen', color: 0x5ad8ff, color2: 0xf6f0e0, cx: 18, cz: 11.5, R: 8.6, rug: 'ijs', prop: 'ijsbaan', style: 'sport',
      ids: ['curling'], at: [{ x: 0, z: -1.2, yaw: 0 }], tableIds: [] },
  ],
  [   // 4 Deurenhal: elke kast is een eigen deur
    { id: 'zeg', name: 'Zeg-Gang', icon: '🗣️', sub: 'de Deurman zegt...', color: 0x4aa8e8, color2: 0xffe14a, cx: -19, cz: -4, R: 8.4, rug: 'deurmat', prop: 'zeg', style: 'door',
      ids: ['deurzegt'], at: [{ x: 0, z: -3.6, yaw: 0 }], tableIds: [] },
    { id: 'hand', name: 'Handtekeningen', icon: '✍️', sub: 'pen mee!', color: 0xff6fa5, color2: 0xffe14a, cx: 19, cz: -4, R: 8.4, rug: 'handtek', prop: 'hand', style: 'door',
      ids: ['handtekening'], at: [{ x: 0, z: -3.6, yaw: 0 }], tableIds: [] },
    { id: 'race', name: 'Deurenrace', icon: '🏁', sub: 'klop, klop, ren!', color: 0x4fd88a, color2: 0xf6f0e0, cx: -18, cz: 11.5, R: 8.4, rug: 'deurrace', prop: 'drace', style: 'door',
      ids: ['deurenrace'], at: [{ x: 0, z: -3.6, yaw: 0 }], tableIds: [] },
    { id: 'disco', name: 'Disco-Gang', icon: '🪩', sub: 'dans door de deur', color: 0xb06aff, color2: 0xff7ab0, cx: 18, cz: 11.5, R: 8.4, rug: 'deurdisco', prop: 'ddisco', style: 'door',
      ids: ['deurdisco'], at: [{ x: 0, z: -3.6, yaw: 0 }], tableIds: [] },
  ],
];

// Geeft per hal de zones terug met geplaatste kasten: zone.cabs = [{ id, x, z, yaw, zone }]. Ids die ontbreken in de data komen in de laatste zone.
export function layoutHall(hallId) {
  const hall = ARCADE_HALLS[hallId]; const zones = ZONES[hallId].map((z) => ({ ...z, ids: z.ids.filter((id) => hall.ids.includes(id)) }));
  const known = new Set(zones.flatMap((z) => z.ids)); const last = zones[zones.length - 1];
  for (const id of hall.ids) if (!known.has(id)) last.ids.push(id);
  for (const z of zones) {
    const spots = z.at.slice();
    // te weinig plekken (er zijn spellen bijgekomen): extra plekken in een rij erachter
    while (spots.length < z.ids.length) spots.push({ x: (spots.length - 3) * 4.4, z: -8.4, yaw: 0 });
    z.cabs = z.ids.map((id, i) => ({ id, x: z.cx + spots[i].x, z: z.cz + spots[i].z, yaw: spots[i].yaw, zone: z }));
  }
  return zones;
}

// FEESTBORD: pure data en spelregels (geen THREE). Bord-graaf, vakjes, items, kaarten, Deurman-gebeurtenissen.
import { S } from '../save.js';

export const TILES = {
  blue:   { icon: '🔵', name: 'Blauw vakje', color: 0x3a82f0, desc: '+3 munten' },
  red:    { icon: '🔴', name: 'Rood vakje', color: 0xe8453c, desc: '−3 munten' },
  dice:   { icon: '🎲', name: 'Dobbelvakje', color: 0xffb81c, desc: 'Nog een keer dobbelen!' },
  shop:   { icon: '🛍️', name: 'Itemwinkel', color: 0xff7ad0, desc: 'Koop slimme items' },
  trophy: { icon: '🏆', name: 'Trofee-vakje', color: 0xffe14a, desc: 'Koop de Trofee!' },
  duel:   { icon: '🎪', name: 'Duel-vakje', color: 0xff8a2a, desc: 'Direct een duel tegen de ander' },
  deur:   { icon: '🚪', name: 'Deurman-vakje', color: 0x8a5ad8, desc: 'De Deurman kijkt uit zijn deur' },
  chance: { icon: '❓', name: 'Kanskaart', color: 0x2fc79a, desc: 'Een grappige kaart' },
  party:  { icon: '⭐', name: 'Feestvakje', color: 0xff5ab0, desc: 'Feest! Jij +4, de ander +2' },
};
// beschrijving per aantal spelers (bij 3 spelers: "de anderen")
export const TILE_DESC3 = { duel: 'Direct een duel tegen een ander (de derde kijkt toe)', party: 'Feest! Jij +4, de anderen +2' };
export const tileDesc = (type, n = 2) => (n === 3 && TILE_DESC3[type]) || TILES[type].desc;
export const TILE_ORDER = ['blue', 'red', 'dice', 'shop', 'trophy', 'duel', 'deur', 'chance', 'party'];

export const ITEMS = {
  double:   { id: 'double', icon: '🎲', name: 'Dubbel-dobbelsteen', price: 5, desc: 'Gooi met twee dobbelstenen tegelijk.' },
  teleport: { id: 'teleport', icon: '🌀', name: 'Teleporteer', price: 8, desc: 'Spring meteen naar de Trofee.' },
  speed:    { id: 'speed', icon: '👟', name: 'Snelschoen', price: 4, desc: '+3 vakjes extra bij je worp.' },
  banana:   { id: 'banana', icon: '🍌', name: 'Banaan-val', price: 3, desc: 'Leg een banaan: wie erover loopt glijdt uit (−3 munten).' },
  shield:   { id: 'shield', icon: '🛡️', name: 'Schild', price: 5, desc: 'Blokkeert het eerstvolgende verlies.' },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const MAX_ITEMS = 3;

export const CFG = { spectBonus: 3, comfort: 2, startCoins: 10, trophyPrice: 20, blue: 3, red: 3, duelWin: 10, duelLose: 3, tileWin: 8, tileTrophyChance: 0.25, dieMax: 10, speedBonus: 3 };

// ---------------------------------------------------------------- bord-graaf
const RING = [
  'blue', 'blue', 'chance', 'blue', 'red', 'duel', 'blue', 'shop',      // 0-7
  'party', 'blue', 'dice', 'blue', 'red', 'chance', 'blue', 'deur',     // 8-15 (8 = splitsing: brug)
  'blue', 'duel', 'blue', 'blue', 'red', 'dice', 'blue', 'chance',      // 16-23
  'party', 'duel', 'red', 'blue', 'shop', 'blue', 'blue', 'chance',     // 24-31 (24 = brug komt hier uit)
];
const RING_SPOTS = [11, 19, 27];
export const START_NODE = 30;
const BRIDGE = ['blue', 'dice', 'blue', 'chance', 'blue'];     // 32..36 (34 = trofee-plek)
const LAGOON = ['blue', 'blue', 'shop'];                       // 37..39 (38 = trofee-plek)

export function buildGraph() {
  const N = 32, A = 17, Bz = 11.5; const nodes = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    nodes.push({ id: i, x: Math.cos(th) * A, z: Math.sin(th) * Bz, y: 0, type: RING[i], next: [(i + 1) % N], spot: RING_SPOTS.includes(i), kind: 'ring' });
  }
  BRIDGE.forEach((type, k) => {
    const id = N + k; nodes.push({ id, x: 0, z: Bz - (2 * Bz * (k + 1)) / 6, y: 0.3, type, next: [id + 1], spot: k === 2, kind: 'bridge' });
  });
  nodes[N + 4].next = [24]; nodes[8].next.push(N);
  // lagune: bochtje buiten de ring tussen vakje 0 en 4
  const a0 = nodes[0], a4 = nodes[4]; const bulge = [3.8, 5.0, 3.8];
  LAGOON.forEach((type, k) => {
    const t = (k + 1) / 4; const x = a0.x + (a4.x - a0.x) * t, z = a0.z + (a4.z - a0.z) * t;
    const nx = x / (A * A), nz = z / (Bz * Bz), nl = Math.hypot(nx, nz) || 1;
    const id = N + 5 + k; nodes.push({ id, x: x + (nx / nl) * bulge[k], z: z + (nz / nl) * bulge[k], y: 0, type, next: [id + 1], spot: k === 1, kind: 'lagoon' });
  });
  nodes[N + 7].next = [4]; nodes[0].next.push(N + 5);
  const prev = nodes.map(() => []); for (const n of nodes) for (const m of n.next) prev[m].push(n.id);
  nodes.forEach((n) => { n.prev = prev[n.id]; });
  return { nodes, spots: nodes.filter((n) => n.spot).map((n) => n.id), start: START_NODE };
}
export const GRAPH = buildGraph();

// Typ van een vakje op dit moment (de trofee-plek is dynamisch)
export const tileType = (B, id) => (id === B.trophyNode ? 'trophy' : GRAPH.nodes[id].type);

// ---------------------------------------------------------------- spelstatus (blijft bewaard tussen duels)
// aantal spelers: 2 (standaard) of 3 (Juul doet mee)
export const playerCount = () => (S.settings && S.settings.players === 3 ? 3 : 2);
export function newState(rounds = 10, n = playerCount()) {
  const spots = [11, 19, 34];   // begin-plek van de Trofee (niet vlak bij de start)
  return {
    v: 1, n, rounds, round: 1, turn: 0, phase: 'turn', over: false,
    players: Array.from({ length: n }, () => ({ node: GRAPH.start, coins: CFG.startCoins, trophies: 0, items: [], shield: false, hat: 0, mods: {} })),
    trophyNode: spots[Math.floor(Math.random() * spots.length)],
    traps: [], pendingDuel: null, lastDuels: [], duelsWon: new Array(n).fill(0), tilesDuels: 0, log: [],
  };
}
export const score = (p) => p.trophies * 1000 + p.coins;
// spelers-id's van de anderen (bij 2 spelers precies één)
export const others = (B, i) => B.players.map((p, k) => k).filter((k) => k !== i);
// doelwit onder de anderen: 'rich' = meeste munten, 'poor' = minste munten, 'lead' = hoogste stand, 'rand' = willekeurig
export function pickTarget(B, i, mode = 'rich') {
  const os = others(B, i); if (os.length === 1) return os[0];
  if (mode === 'rand') return os[Math.floor(Math.random() * os.length)];
  const key = { rich: (k) => B.players[k].coins, poor: (k) => -B.players[k].coins, lead: (k) => score(B.players[k]) }[mode] || ((k) => B.players[k].coins);
  return os.reduce((best, k) => (key(k) > key(best) ? k : best), os[0]);
}
// Achterstaander (Mario Party-stijl): minder trofeeën, of gelijk en ≥6 munten achter.
// Bij 3 spelers telt alleen de (gedeeld) laagste speler als achterstaander: die krijgt hulp.
export function isBehind(B, i) {
  const me = B.players[i], os = others(B, i).map((k) => B.players[k]);
  const cond = (o) => o.trophies > me.trophies || (o.trophies === me.trophies && o.coins - me.coins >= 6);
  if (os.length === 1) return cond(os[0]);
  return os.some(cond) && os.every((o) => score(o) >= score(me));
}
// Trofee-prijs: korting naar de mate waarin je trofeeën achterstaat op de koploper
export function trophyPrice(B, i) { const me = B.players[i]; const mx = Math.max(...others(B, i).map((k) => B.players[k].trophies)); return CFG.trophyPrice - 5 * Math.min(2, Math.max(0, mx - me.trophies)); }
export function leader(B) { const sc = B.players.map((p) => score(p)); const mx = Math.max(...sc); return sc.filter((x) => x === mx).length > 1 ? null : sc.indexOf(mx); }
// laagste speler (id) als die duidelijk lager staat dan de rest, anders null (troostprijs bij 3 spelers)
export function lowest(B) { const sc = B.players.map((p) => score(p)); const mn = Math.min(...sc); return sc.filter((x) => x === mn).length > 1 ? null : sc.indexOf(mn); }
// ranglijst (ids, beste eerst): trofeeën, dan munten, dan het lot
export function ranking(B) { return B.players.map((p, i) => ({ i, t: p.trophies, c: p.coins, r: Math.random() })).sort((a, b) => b.t - a.t || b.c - a.c || a.r - b.r).map((x) => x.i); }
// punten per plek bij een 3-speler-spel: 10 / 6 / 3, bij gelijke stand gedeeld (gemiddelde, afgerond). keys[i] = hoger is beter; undefined = laatste.
export const PLACE_PTS = [10, 6, 3];
export function placePoints(keys) {
  const n = keys.length, ord = keys.map((k, i) => ({ i, k: Number.isFinite(k) ? k : -Infinity })).sort((a, b) => b.k - a.k);
  const pts = new Array(n).fill(0), place = new Array(n).fill(0); let pos = 0;
  while (pos < n) {
    let e = pos; while (e + 1 < n && ord[e + 1].k === ord[pos].k) e++;
    let sum = 0; for (let q = pos; q <= e; q++) sum += PLACE_PTS[q] ?? 0; const avg = Math.round(sum / (e - pos + 1));
    for (let q = pos; q <= e; q++) { pts[ord[q].i] = avg; place[ord[q].i] = pos + 1; } pos = e + 1;
  }
  return { pts, place };
}

// Duel kiezen uit de geladen spellen: pvp, niet uitgezet, hal ontgrendeld, liefst niet de laatste paar keer gespeeld
export function pickDuelId(app, { isUnlocked, ARCADE_HALLS }, last = []) {
  const ex = (S.arcade && S.arcade.excluded) || [];
  const hallOf = (id) => { const h = ARCADE_HALLS.find((x) => x.ids.includes(id)); return h ? h.id : 0; };
  const open = (id) => !ex.includes(id) && (S.settings.unlockAll || isUnlocked(hallOf(id)));
  const ok = (id) => { const d = app.games[id]; return d && d.mode === 'pvp' && (!d.players || d.players.includes(2)) && open(id); };
  return choosePool(Object.keys(app.games).filter(ok), last);
}
// 3-speler-spel kiezen (spel-definitie met players die 3 bevat), of null als er geen is
export function pickPartyId(app, { isUnlocked, ARCADE_HALLS }, last = []) {
  const ex = (S.arcade && S.arcade.excluded) || [];
  const hallOf = (id) => { const h = ARCADE_HALLS.find((x) => x.ids.includes(id)); return h ? h.id : 0; };
  const ok = (id) => { const d = app.games[id]; return d && Array.isArray(d.players) && d.players.includes(3) && !ex.includes(id) && (S.settings.unlockAll || isUnlocked(hallOf(id))); };
  return choosePool(Object.keys(app.games).filter(ok), last);
}
function choosePool(all, last) {
  if (!all.length) return null;
  const fresh = all.filter((id) => !last.includes(id));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------- kanskaarten
// cond(me, other) bepaalt of de kaart mag komen. w = gewicht.
export const CARDS = [
  { id: 'egg', icon: '🐔', title: 'Gouden Ei!', text: 'De gouden kip legt een ei in je hoed. +4 munten!', w: 3 },
  { id: 'duck', icon: '🦆', title: 'Eendenpech', text: 'Je struikelt over een eend. De eend is OK. Jij −2 munten.', w: 3 },
  { id: 'gift', icon: '🎁', title: 'Cadeautje!', text: 'Iemand heeft een cadeautje in de bosjes laten liggen: een gratis item!', w: 2, cond: (me) => me.items.length < MAX_ITEMS },
  { id: 'swap', icon: '🔁', title: 'Ruilkaart!', text: 'Jullie ruilen van portemonnee. Ja echt. Geen ruilen-terug.', text3: 'Jij en {o} ruilen van portemonnee. Ja echt. Geen ruilen-terug.', w: 2, cond: (me, o) => o.coins - me.coins >= 5 },
  { id: 'forward', icon: '🚀', title: 'Raketschoenen', text: 'Pssjjjt! Je schiet 3 vakjes vooruit!', w: 2 },
  { id: 'party', icon: '🎉', title: 'Verrassingsfeestje', text: 'Surprise! Iedereen krijgt taart en +3 munten.', text3: 'Surprise! Iedereen krijgt taart en +3 munten, ook de toeschouwers.', w: 2 },
  { id: 'gamble', icon: '🎰', title: 'Dubbel of niets', text: 'Munt opgooien! Kop: +6 munten. Munt: −3 munten.', w: 2 },
  { id: 'robber', icon: '🦝', title: 'Wasbeer-roof', text: 'Een wasbeer pikt 3 munten van de ander en geeft ze aan jou. Hij vindt het niet erg.', text3: 'Een wasbeer pikt 3 munten van {o} (de rijkste) en geeft ze aan jou. Hij vindt het niet erg.', w: 2 },
  { id: 'trophy', icon: '🏆', title: 'De Trofee verhuist!', text: 'De Trofee krijgt zin in een verhuizing. Hij pakt zijn koffer.', w: 1 },
  { id: 'hat', icon: '🎩', title: 'Hoedvondst', text: 'Je vindt een hoge hoed met 2 munten erin. En een konijn. Het konijn mag je houden.', w: 2 },
  { id: 'shield', icon: '🛡️', title: 'Ridder in nood', text: 'Een ridder leent je zijn schild. Hij heeft er nog twee.', w: 1, cond: (me) => !me.shield },
  { id: 'again', icon: '🎲', title: 'Nog een keer!', text: 'De dobbelsteen rolt vanzelf terug naar je toe. Nog eens gooien!', w: 2 },
  { id: 'give', icon: '💝', title: 'Verjaardagscadeau', text: 'De ander is jarig! Jij geeft 2 munten. Je mag zingen.', text3: '{o} is jarig! (Die heeft het minste.) Jij geeft 2 munten. Je mag zingen.', w: 1, cond: (me) => me.coins >= 4 },
  { id: 'pie', icon: '🥧', title: 'Taartgevecht!', text: 'Jij gooit een taart. De ander verliest 2 munten (en zijn waardigheid).', text3: 'Jij gooit een taart naar de koploper: {o}. Die verliest 2 munten (en zijn waardigheid).', w: 2 },
];
export function drawCard(B, i) {
  const me = B.players[i], o = B.players[pickTarget(B, i, 'rich')];
  const pool = CARDS.filter((c) => !c.cond || c.cond(me, o));
  let r = Math.random() * pool.reduce((a, c) => a + c.w, 0);
  for (const c of pool) { r -= c.w; if (r <= 0) return c; }
  return pool[0];
}

// ---------------------------------------------------------------- Deurman-gebeurtenissen (lief en grappig, géén horror)
export const DEUR_EVENTS = [
  { id: 'swap', title: 'Plekkenwissel!', text: 'De Deurman kijkt heel aardig uit zijn deur... en wisselt jullie plekken. Hij vond het gewoon leuk.', text3: 'De Deurman kijkt heel aardig uit zijn deur... en draait jullie plekken rond: iedereen schuift door naar de plek van de volgende. Hij vond het gewoon leuk.', w: 3 },
  { id: 'sign', title: 'Handtekening!', text: 'De Deurman schenkt je een handtekening. Hij is er héél trots op. Je krijgt 5 munten.', w: 3 },
  { id: 'steal', title: 'Hoed-mop', text: 'De Deurman steelt 2 munten en geeft je een hoed-mop: "Wat zegt de hoed tegen de muts? Ik sta boven je!"', w: 2 },
  { id: 'dance', title: 'Deurman-dansje', text: 'De Deurman doet een dansje. Een te lang dansje. Iedereen +1 munt, want applaus.', text3: 'De Deurman doet een dansje. Een te lang dansje. Alle drie +1 munt, want applaus.', w: 3 },
  { id: 'hold', title: 'Deur open!', text: 'De Deurman houdt de deur voor je open. Beleefd! Je mag nog een keer dobbelen.', w: 2 },
  { id: 'gift', title: 'Deur-cadeautje', text: 'Achter de deur ligt een cadeautje. De Deurman zwaait verlegen met al zijn lange vingers.', w: 2, cond: (me) => me.items.length < MAX_ITEMS },
  { id: 'comfort', only: 3, title: 'Troostprijs!', text: 'De Deurman heeft medelijden met wie het minste heeft: die krijgt +4 munten. Hij noemt het "een lening". Terugbetalen hoeft niet.', w: 3 },
];
export function drawDeur(B, i) {
  const me = B.players[i], o = B.players[pickTarget(B, i, 'rich')];
  const pool = DEUR_EVENTS.filter((c) => (!c.only || c.only === B.players.length) && (!c.cond || c.cond(me, o)));
  let r = Math.random() * pool.reduce((a, c) => a + c.w, 0);
  for (const c of pool) { r -= c.w; if (r <= 0) return c; }
  return pool[0];
}

export const PARTY_LINES = ['FEEST! De confetti-kanon ging per ongeluk af.', 'Feestvakje! Iemand heeft de muziek harder gezet.', 'Polonaise! Jij voorop, de ander erachter.'];
export const WIN_LINES = ['{w} wint het duel! {l} was er ook bij. Dat telt.', 'Wat een duel! {w} wint. {l} krijgt een stickertje.', '{w} pakt de winst. {l}: "Ik liet hem winnen." Ja hoor.'];

export const PARTY3_LINES = ['{a} pakt goud, {b} zilver en {c} brons. Het brons glimt het mooist.', 'Wat een spel! {a} wint, {b} wordt tweede en {c} staat op de derde plek.', '{a} wint! {b} en {c} zeggen dat ze het zo bedoeld hadden.'];

import { S } from '../save.js';

// ============================================================================
// Hoeden en kleuren voor Wes (0) en Jor (1). Alleen data + hulpfuncties; de winkel zit in world/shop.js,
// het tekenen in engine/chars.js (makeBrother leest S.cosmetics.equipped[i]).
//   S.cosmetics = { owned: [{hat:[id], shirt:[id], hair:[id], cape:[id]}, {...}], equipped: [{hat,shirt,hair,cape}, {...}] }
// id 'std' = standaarduitrusting van die broer (altijd gratis).
// ============================================================================
export const CATS = ['hat', 'shirt', 'hair', 'cape'];
export const CAT_LABEL = { hat: 'Hoeden', shirt: 'Shirt', hair: 'Haar', cape: 'Cape' };
export const CAT_ICON = { hat: '👒', shirt: '👕', hair: '💇', cape: '🧣' };
export const catLabel = (cat, i) => (cat === 'cape' ? (i === 0 ? 'Sjaal' : 'Cape') : CAT_LABEL[cat]);

// 'gold' = glimmend goud, 'rainbow' = regenboog (zie chars.js)
export const HATS = [
  { id: 'cap', name: 'Honkbalpet', price: 30, kind: 'cap', c: 0xd8372c, icon: '🧢' },
  { id: 'beanie', name: 'Wintermuts', price: 30, kind: 'beanie', c: 0x3a78e0, c2: 0xffffff, icon: '🧶' },
  { id: 'straw', name: 'Strohoed', price: 35, kind: 'straw', c: 0xd8372c, icon: '🌾' },
  { id: 'party', name: 'Feesthoed', price: 40, kind: 'party', c: 0xff4aa8, c2: 0xffe14a, icon: '🥳' },
  { id: 'chef', name: 'Koksmuts', price: 45, kind: 'chef', icon: '👨‍🍳' },
  { id: 'cheese', name: 'Kaashoed', price: 50, kind: 'cheese', icon: '🧀' },
  { id: 'pot', name: 'Bloempot', price: 50, kind: 'pot', icon: '🪴' },
  { id: 'cowboy', name: 'Cowboyhoed', price: 60, kind: 'cowboy', c: 0x8a5a2b, c2: 0xffd24a, icon: '🤠' },
  { id: 'helmet', name: 'Ridderhelm', price: 60, kind: 'helmet', c: 0xd8372c, icon: '🛡️' },
  { id: 'pirate', name: 'Piratenhoed', price: 70, kind: 'pirate', icon: '🏴‍☠️' },
  { id: 'tophat', name: 'Hoge hoed', price: 75, kind: 'tophat', c: 0x1e1c24, c2: 0xd8372c, icon: '🎩' },
  { id: 'chicken', name: 'Kippenhoed', price: 80, kind: 'chickenhat', icon: '🐔' },
  { id: 'wizard', name: 'Tovenaarshoed', price: 90, kind: 'wizard', c: 0x5b2a86, c2: 0xffd24a, icon: '🧙' },
  { id: 'jester', name: 'Narrenmuts', price: 90, kind: 'jester', c: 0xd8357f, c2: 0x2f6fe0, icon: '🃏' },
  { id: 'horns', name: 'Vikinghelm', price: 100, kind: 'horns', icon: '⚔️' },
  { id: 'crown', name: 'Kroon', price: 120, kind: 'crown', icon: '👑' },
  { id: 'goldcrown', name: 'Gouden Koningskroon', price: 150, kind: 'goldcrown', icon: '🏆' },
  { id: 'rainbow', name: 'Regenboog-hoed', price: 150, kind: 'rainbowhat', icon: '🌈' },
  // Deurman-hoeden (meme-merch)
  { id: 'deurparty', name: 'Deurman-feesthoed', price: 55, kind: 'deurparty', icon: '🥳' },
  { id: 'minidoor', name: 'Mini-deur op je hoofd', price: 95, kind: 'minidoor', c: 0x8a5a2b, c2: 0xffd23f, icon: '🚪' },
  { id: 'deurhead', name: 'Deurman-hoofd', price: 85, kind: 'deurhead', icon: '😁' },
  { id: 'doorknob', name: 'Deurknop-kroon', price: 120, kind: 'doorknobcrown', icon: '🔑' },
];
const col = (id, name, c, price, fx) => ({ id, name, c, price, fx });
const GOLD = (p = 100) => col('gold', 'Goud ✨', 0xf2c230, p, 'gold');
const RAIN = (p = 150) => col('rainbow', 'Regenboog 🌈', 0xffffff, p, 'rainbow');
export const SHIRTS = [
  col('red', 'Rood', 0xd8372c, 20), col('orange', 'Oranje', 0xf0862a, 20), col('yellow', 'Geel', 0xf2c830, 20), col('green', 'Groen', 0x35b24a, 20),
  col('teal', 'Turkoois', 0x22b8b0, 25), col('blue', 'Blauw', 0x2f6fe0, 25), col('purple', 'Paars', 0x8a3fd8, 30), col('pink', 'Roze', 0xff6fb5, 30),
  col('black', 'Zwart', 0x2a2830, 30), col('white', 'Wit', 0xf2f0ea, 30),
  col('dsuit', 'Deurman-pak 🕴️', 0x14141a, 45, 'dsuit'), col('dsuitw', 'Wit Deurman-pak', 0xeeeef2, 45, 'dsuitw'), GOLD(), RAIN(),
];
export const HAIRS = [
  col('black', 'Zwart', 0x1e1a1c, 20), col('dbrown', 'Donkerbruin', 0x4a2e1c, 20), col('brown', 'Bruin', 0x7a4a24, 20), col('blond', 'Blond', 0xe8b84a, 20),
  col('ginger', 'Gember', 0xc8581e, 25), col('white', 'Wit', 0xe8e6ee, 25), col('blue', 'Blauw', 0x3a78e0, 30), col('green', 'Groen', 0x4ac84a, 30),
  col('pink', 'Roze', 0xff6fb5, 30), col('purple', 'Paars', 0x8a3fd8, 30), col('dpale', 'Deurman-bleek', 0xe4e4e0, 25), GOLD(), RAIN(),
];
export const CAPES = [
  col('red', 'Rood', 0xd8372c, 25), col('orange', 'Oranje', 0xf0862a, 25), col('yellow', 'Geel', 0xf2c830, 25), col('green', 'Groen', 0x2f9e5b, 25),
  col('teal', 'Turkoois', 0x22b8b0, 30), col('blue', 'Blauw', 0x2f6fe0, 30), col('purple', 'Paars', 0x8a3fd8, 35), col('pink', 'Roze', 0xff6fb5, 35),
  col('black', 'Zwart', 0x2a2830, 35), col('white', 'Wit', 0xf2f0ea, 35), col('dtie', 'Deurman-stropdas', 0xb3182a, 35), GOLD(), RAIN(),
];
const LISTS = { shirt: SHIRTS, hair: HAIRS, cape: CAPES };
// standaardkleuren per broer (voor het staal bij 'standaard'); komt overeen met BROTHER_SPECS in chars.js
const STD = { hat: [null, 0xffc93c], shirt: [0x2f9e5b, 0x3a78e0], hair: [0x7a4a24, 0xe8b84a], cape: [0xd8372c, 0xe5484d] };
const STD_NAME = { hat: ['Blote kop (standaard)', 'Pet achterstevoren (standaard)'], shirt: ['Standaardshirt', 'Standaardshirt'], hair: ['Eigen haar', 'Eigen haar'], cape: ['Standaard sjaal', 'Standaard cape'] };

// Alle opties voor een broer in een categorie (inclusief standaard)
export function itemsFor(i, cat) {
  const std = { id: 'std', name: STD_NAME[cat][i], price: 0, c: STD[cat][i], icon: cat === 'hat' ? (i ? '🧢' : '🙂') : null };
  if (cat === 'hat') return [std, ...(i === 1 ? [{ id: 'none', name: 'Blote kop', price: 0, icon: '🙂' }] : []), ...HATS];
  return [std, ...LISTS[cat]];
}
export const findItem = (i, cat, id) => itemsFor(i, cat).find((x) => x.id === id) || null;

const blank = () => ({ hat: ['std'], shirt: ['std'], hair: ['std'], cape: ['std'] });
export const defaultCosmetics = () => ({ owned: [blank(), blank()], equipped: [{ hat: 'std', shirt: 'std', hair: 'std', cape: 'std' }, { hat: 'std', shirt: 'std', hair: 'std', cape: 'std' }] });
// Altijd veilig te gebruiken, ook voor oude opslag zonder dit veld
export function cosm() {
  const c = (S.cosmetics ||= defaultCosmetics());
  if (!Array.isArray(c.owned)) c.owned = []; if (!Array.isArray(c.equipped)) c.equipped = [];
  for (let i = 0; i < 2; i++) {
    const ow = (c.owned[i] ||= blank()), eq = (c.equipped[i] ||= {});
    for (const cat of CATS) {
      if (!Array.isArray(ow[cat])) ow[cat] = ['std']; if (!ow[cat].includes('std')) ow[cat].unshift('std');
      const it = findItem(i, cat, eq[cat]);
      if (!it || !(it.price === 0 || ow[cat].includes(it.id))) eq[cat] = 'std';
    }
  }
  return c;
}
export const owns = (i, cat, id) => { const it = findItem(i, cat, id); return !!it && (it.price === 0 || cosm().owned[i][cat].includes(id)); };
export const equippedId = (i, cat) => cosm().equipped[i][cat];
export const lookSig = (i) => JSON.stringify(cosm().equipped[i]);
export function equip(i, cat, id) { if (!owns(i, cat, id)) return false; cosm().equipped[i][cat] = id; return true; }
// Koop (trekt van het gedeelde S.coins af); persist() doet de aanroeper
export function buy(i, cat, id) {
  const it = findItem(i, cat, id); if (!it) return { ok: false, why: 'onbekend' };
  if (owns(i, cat, id)) return { ok: true, already: true };
  if (S.coins < it.price) return { ok: false, why: 'arm', need: it.price - S.coins };
  S.coins -= it.price; cosm().owned[i][cat].push(id); return { ok: true, item: it };
}

// Vertaalt de uitrusting naar Character-spec-velden bovenop de standaardspec van de broer
export function applyCosmetics(base, i, eq = cosm().equipped[i]) {
  const o = { ...base };
  if (eq.hat === 'none') o.hat = null;
  else if (eq.hat !== 'std') { const h = HATS.find((x) => x.id === eq.hat); if (h) { o.hat = h.kind; o.hatColor = h.c ?? 0xcc3333; o.hatColor2 = h.c2 ?? 0xffd24a; } }
  const sh = SHIRTS.find((x) => x.id === eq.shirt);
  if (eq.shirt !== 'std' && sh) { o.shirt = sh.c; o.shirtFx = sh.fx; if (base.tunic) { o.tunic = sh.c; o.tunicFx = sh.fx; } if (base.sleeve === base.shirt) { o.sleeve = sh.c; o.sleeveFx = sh.fx; } }
  const hr = HAIRS.find((x) => x.id === eq.hair);
  if (eq.hair !== 'std' && hr) { o.hair = hr.c; o.hairFx = hr.fx; }
  const cp = CAPES.find((x) => x.id === eq.cape);
  if (eq.cape !== 'std' && cp) { if (base.cape != null) { o.cape = cp.c; o.capeFx = cp.fx; } if (base.scarf != null) { o.scarf = cp.c; o.scarfFx = cp.fx; } }
  return o;
}

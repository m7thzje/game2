import * as THREE from 'three';
import { mat, mesh, TAU } from '../engine/util.js';
import * as P from '../engine/props.js';
import { BROTHER_SPECS, Character, PLAYER_COLORS } from '../engine/chars.js';
import { mergeStatic } from './quickdraw_merge.js';

// Gegevens van "Smash-Arena": slagen, vechters (stats, uiterlijk, speciale zetten), items.

// ---------------- slag-tabel ----------------
// box = [x-offset (voor, tov midden), y-offset (tov voeten), breedte, hoogte]; sym = niet spiegelen; away = wegduwen van de aanvaller; back = achter je
// wind/act/rec = voorbereiding/actief/herstel (sec); lunge = stap vooruit; drive = blijft glijden tijdens de slag; armor = super-armor; smash = laadbaar (reus)
export const BASE_AT = {
  jab1: { wind: 0.05, act: 0.09, rec: 0.1, dmg: 3, bkb: 5, kbg: 0.045, ang: 28, box: [0.1, 0.5, 1.8, 1.2], lunge: 2.5 },
  jab2: { wind: 0.05, act: 0.09, rec: 0.1, dmg: 3, bkb: 5.5, kbg: 0.045, ang: 34, box: [0.1, 0.5, 1.9, 1.2], lunge: 2.5 },
  jab3: { wind: 0.09, act: 0.1, rec: 0.26, dmg: 5, bkb: 10, kbg: 0.09, ang: 40, box: [0.1, 0.3, 2.3, 1.5], lunge: 5, snd: 'thud' },
  fsmash: { wind: 0.2, act: 0.12, rec: 0.3, dmg: 12, bkb: 11, kbg: 0.15, ang: 34, box: [0.1, 0.2, 2.9, 1.7], lunge: 5, big: 1, smash: 1 },
  usmash: { wind: 0.15, act: 0.14, rec: 0.28, dmg: 11, bkb: 11, kbg: 0.15, ang: 82, box: [-1.15, 1.3, 2.3, 2.3], sym: 1, big: 1, smash: 1 },
  dsmash: { wind: 0.1, act: 0.1, rec: 0.28, dmg: 8, bkb: 8, kbg: 0.09, ang: 52, box: [-2.2, 0, 4.4, 0.9], sym: 1, away: 1, smash: 1 },
  nair: { wind: 0.04, act: 0.2, rec: 0.14, dmg: 6, bkb: 7, kbg: 0.09, ang: 45, box: [-1.5, 0.2, 3.0, 2.0], sym: 1, away: 1, air: 1 },
  fair: { wind: 0.1, act: 0.12, rec: 0.18, dmg: 9, bkb: 10, kbg: 0.12, ang: 30, box: [0.1, 0.3, 2.6, 1.7], air: 1 },
  bair: { wind: 0.08, act: 0.12, rec: 0.18, dmg: 10, bkb: 11, kbg: 0.13, ang: 32, box: [0.1, 0.4, 2.3, 1.6], back: 1, air: 1 },
  uair: { wind: 0.08, act: 0.12, rec: 0.18, dmg: 8, bkb: 9, kbg: 0.12, ang: 85, box: [-1.0, 1.5, 2.0, 2.0], sym: 1, air: 1 },
  dair: { wind: 0.14, act: 0.22, rec: 0.26, dmg: 9, bkb: 8, kbg: 0.105, ang: -78, box: [-0.85, -1.7, 1.7, 2.0], sym: 1, air: 1, spike: 1 },
  // voorwerpen
  hammer: { wind: 0.3, act: 0.14, rec: 0.38, dmg: 24, bkb: 18, kbg: 0.18, ang: 38, box: [0, -0.1, 3.4, 2.9], lunge: 3, big: 1, hs: 0.2, snd: 'explode', item: 1 },
  swordI: { wind: 0.09, act: 0.12, rec: 0.2, dmg: 10, bkb: 10, kbg: 0.12, ang: 36, box: [0.2, 0.2, 3.5, 1.7], lunge: 4, big: 1, snd: 'thud', item: 1 },
  stickI: { wind: 0.04, act: 0.08, rec: 0.12, dmg: 5, bkb: 6.5, kbg: 0.06, ang: 32, box: [0.1, 0.4, 2.9, 1.2], lunge: 3, item: 1 },
  boost: { wind: 0, act: 0.32, rec: 0.12, dmg: 5, bkb: 9, kbg: 0.075, ang: 65, box: [-1.0, 0.0, 2.0, 2.6], sym: 1 },
  // super-slagen (zelf aangestuurd)
  swirl: { dmg: 4, bkb: 4, kbg: 0.02, ang: 62, box: [-2.4, 0.1, 4.8, 2.6], sym: 1, away: 1 },
};
// speciale zetten per vechter (B + links/rechts)
export const SPECIAL_AT = {
  spin: { wind: 0.1, act: 0.2, rec: 0.22, dmg: 9, bkb: 9, kbg: 0.12, ang: 50, box: [-2.3, 0.0, 4.6, 2.4], sym: 1, away: 1, big: 1, drive: 5, cd: 1.3, snd: 'thud', spin: 1 },
  mbolt: { wind: 0.14, act: 0.04, rec: 0.22, dmg: 0, box: [0, 0, 0, 0], cd: 0.9, proj: { spd: 13, vy: 6, dmg: 8, bkb: 9, kbg: 0.1, ang: 52, size: 0.8, life: 2.4, grav: 22, bounce: 3, big: 1 } },
  rush: { wind: 0.14, act: 0.34, rec: 0.3, dmg: 13, bkb: 12, kbg: 0.15, ang: 38, box: [0.1, 0.1, 2.8, 2.7], drive: 13, armor: 1, big: 1, cd: 2.2, hs: 0.1, snd: 'thud' },
  dash: { wind: 0.03, act: 0.2, rec: 0.12, dmg: 5, bkb: 8, kbg: 0.06, ang: 55, box: [-0.5, 0.0, 3.2, 2.2], drive: 32, inv: 1, cd: 1.1, through: 1 },
};

const mul = (A, k, v) => { if (A[k] != null) A[k] *= v; };
// Bouwt de slag-tabel van een vechter
export function buildAT(ft) {
  const m = ft.atk || {}, T = {};
  for (const [k, a] of Object.entries({ ...BASE_AT, ...SPECIAL_AT })) {
    const A = { ...a, box: a.box ? [...a.box] : null };
    const isItem = A.item || k === 'boost' || k === 'swirl';
    if (!isItem) {
      mul(A, 'wind', m.wind ?? 1); mul(A, 'rec', m.rec ?? 1); mul(A, 'act', m.act ?? 1);
      mul(A, 'dmg', A.smash ? (m.smashDmg ?? m.dmg ?? 1) : (m.dmg ?? 1));
      if (A.box && !A.sym && m.reach) A.box[2] *= m.reach;
      if (A.box && A.sym && m.reach && k !== 'dsmash') { const c = A.box[0] + A.box[2] / 2; A.box[2] *= 1 + (m.reach - 1) * 0.5; A.box[0] = c - A.box[2] / 2; }
      if (m.smash && A.smash) { A.armor = 1; }
    }
    T[k] = A;
  }
  for (const [k, o] of Object.entries(ft.over || {})) T[k] = { ...(T[k] || {}), ...o, box: o.box || (T[k] && T[k].box) || [0, 0, 0, 0] };
  return T;
}

// ---------------- vechters ----------------
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const dark = (c, t = 0.45) => mix(c, 0x000000, t);

function swordWeapon(pc) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.82, 0.025), mat(0xe8edf6, { metalness: 0.8, roughness: 0.2 }), { cast: false, pos: [0, 0.56, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), mat(0xe8c24a, { metalness: 0.6 }), { cast: false, pos: [0, 0.15, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 5), mat(0x5b3d24), { cast: false, pos: [0, 0.02, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(pc, { flatShading: false }), { cast: false, pos: [0, -0.1, 0] }));
  mergeStatic(g); g.scale.setScalar(1.8); g.rotation.x = Math.PI - 0.75; g.position.set(0, -0.12, 0);
  return g;
}
function shieldMesh(pc) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), mat(pc, { flatShading: false }), { cast: false, rot: [0, 0, Math.PI / 2] }));
  g.add(mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 14), mat(0xd8dde8, { metalness: 0.7, roughness: 0.3 }), { cast: false, rot: [0, Math.PI / 2, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0xe8c24a, { metalness: 0.6 }), { cast: false, pos: [0.04, 0, 0] }));
  mergeStatic(g); g.scale.setScalar(1.15); g.position.set(0.12, -0.05, 0);
  return g;
}
function staffWeapon(pc) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 6), mat(0x6b4a2e), { cast: false, pos: [0, 0.5, 0] }));
  for (const a of [0, 1, 2]) g.add(mesh(new THREE.ConeGeometry(0.035, 0.22, 4), mat(0xe8c24a, { metalness: 0.6 }), { cast: false, pos: [Math.cos(a * 2.1) * 0.1, 1.28, Math.sin(a * 2.1) * 0.1], rot: [Math.sin(a * 2.1) * 0.3, 0, -Math.cos(a * 2.1) * 0.3] }));
  mergeStatic(g);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshBasicMaterial({ color: mix(pc, 0xffffff, 0.5) })); orb.position.y = 1.32; g.add(orb); g.userData.orb = orb;
  g.scale.setScalar(1.7); g.rotation.x = 0.55; g.position.set(0, -0.25, 0);
  return g;
}
function clubWeapon(pc) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.06, 1.1, 7), mat(0x8a5a2e), { cast: false, pos: [0, 0.6, 0] }));
  for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(mesh(new THREE.ConeGeometry(0.05, 0.16, 4), mat(0xc8ccd6, { metalness: 0.6 }), { cast: false, pos: [Math.cos(a) * 0.2, 0.75 + (i % 3) * 0.12, Math.sin(a) * 0.2], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] })); }
  g.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 8), mat(pc, { flatShading: false }), { cast: false, pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] }));
  mergeStatic(g); g.scale.setScalar(1.25); g.rotation.x = 0.45; g.position.set(0, -0.3, 0);
  return g;
}
function daggerWeapon(pc) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.6, 0.02), mat(0xc8ced8, { metalness: 0.8, roughness: 0.25 }), { cast: false, pos: [0, 0.4, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mat(0x222230), { cast: false, pos: [0, 0.1, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), mat(pc, { flatShading: false }), { cast: false, pos: [0, 0.0, 0] }));
  mergeStatic(g); g.scale.setScalar(1.8); g.rotation.x = Math.PI - 0.9; g.position.set(0, -0.12, 0);
  return g;
}

// Statistieken: weight = zwaarder = minder terugslag, run/air/jump = vermenigvuldigers, grav/fall = zwaartekracht en valsnelheid, jumps = aantal sprongen
export const FT = {
  sword: {
    id: 'sword', name: 'Zwaardvechter', icon: '⚔️', css: '#ffc14a', scaleT: 1.0,
    stats: { weight: 1.0, run: 1.0, jump: 1.0, air: 1.0, grav: 1.0, fall: 1.0, jumps: 2, pow: 1.0 },
    bars: { Kracht: 3, Tempo: 3, Gewicht: 3, Bereik: 4 },
    atk: { reach: 1.18 },
    over: {},
    side: 'spin', up: { kind: 'rocket', dur: 0.32, spd: 22, dmg: 5, name: 'RAKET!' },
    sup: { id: 'storm', name: 'ZWAARDSTORM' },
    blurb: 'Gebalanceerd. Zwaardslagen met veel bereik.',
    tips: ['<b>A</b> zwaardslag (tik 3x = combo), +richting = smash', '<b>B + ←/→</b> Zwaardwervel (slaat naar beide kanten)', '<b>B + ↑</b> Raketsprong', '<b>SUPER</b>: Zwaardstorm, een wervelwind van slagen!'],
    spec: (b, pc) => ({ ...b, scale: 1, shirt: pc, sleeve: 0xdfe4ee, tunic: dark(pc, 0.25), pants: 0x4a4a62, boots: 0x555566, belt: 0xe8c24a, hat: 'helmet', hatColor: pc, scarf: null, backpack: null, cape: null }),
    weapon: swordWeapon, offhand: shieldMesh, swing: 0xffffff,
  },
  mage: {
    id: 'mage', name: 'Magiër', icon: '🧙', css: '#c58bff', scaleT: 0.94,
    stats: { weight: 0.82, run: 0.93, jump: 0.97, air: 1.0, grav: 0.8, fall: 0.55, jumps: 2, pow: 0.95, glide: 1.7 },
    bars: { Kracht: 2, Tempo: 3, Gewicht: 1, Bereik: 5 },
    atk: { dmg: 0.7, reach: 0.9, smashDmg: 0.8 },
    over: {
      fsmash: { wind: 0.24, act: 0.05, rec: 0.34, dmg: 0, box: [0, 0, 0, 0], lunge: 0, smash: 0, proj: { spd: 19, vy: 0, dmg: 11, bkb: 12, kbg: 0.15, ang: 30, size: 1.0, life: 1.5, big: 1 } },
      fair: { wind: 0.1, act: 0.05, rec: 0.2, dmg: 0, box: [0, 0, 0, 0], proj: { spd: 26, vy: -4, dmg: 5, bkb: 6, kbg: 0.07, ang: 35, size: 0.55, life: 0.9 } },
      usmash: { dmg: 8, box: [-1.1, 1.0, 2.2, 3.4] },
      dsmash: { dmg: 7, box: [-2.4, -0.2, 4.8, 1.3] },
    },
    side: 'mbolt', up: { kind: 'blink', dur: 0.14, spd: 56, dmg: 0, name: 'TELEPORT!' },
    sup: { id: 'meteor', name: 'METEOOR-REGEN' },
    blurb: 'Zweeft en tovert. Zwak van dichtbij, sterk van ver.',
    tips: ['<b>A</b> staf-tikje, <b>A + →</b> grote magische bal', '<b>B + ←/→</b> stuiterende vuurbal', '<b>B + ↑</b> Teleport. Houd <b>↑</b> in de lucht = zweven!', '<b>SUPER</b>: Meteoor-regen uit de lucht!'],
    spec: (b, pc) => { const rb = mix(0x7a3ad0, pc, 0.42); return { ...b, scale: 1, shirt: rb, tunic: rb, sleeve: dark(rb, 0.15), pants: dark(rb, 0.4), boots: 0x3a2a4a, belt: 0xe8c24a, hat: 'wizard', hatColor: mix(0x4a1f78, pc, 0.3), hatColor2: 0xffd24a, hairStyle: 'none', beard: 'long', beardColor: 0xf4f0ff, scarf: null, backpack: null, cape: dark(rb, 0.35), eyeScale: 1.15 }; },
    weapon: staffWeapon, swing: 0xd9a8ff,
  },
  giant: {
    id: 'giant', name: 'Reus', icon: '🪨', css: '#ff9a6a', scaleT: 1.3,
    stats: { weight: 1.4, run: 0.8, jump: 0.92, air: 0.85, grav: 1.1, fall: 1.1, jumps: 2, pow: 1.1 },
    bars: { Kracht: 5, Tempo: 1, Gewicht: 5, Bereik: 3 },
    atk: { wind: 1.2, rec: 1.1, dmg: 1.1, smashDmg: 1.4, reach: 1.1, smash: 1 },
    over: { jab3: { armor: 1 } },
    side: 'rush', up: { kind: 'rocket', dur: 0.26, spd: 17, dmg: 8, name: 'BOEM-SPRONG!' },
    sup: { id: 'quake', name: 'AARDBEVING' },
    blurb: 'Zwaar en traag, maar enorme klappen. Slaan zonder te wankelen.',
    tips: ['<b>Houd A + richting</b> = smash laden (super-armor!)', '<b>B + ←/→</b> Stormram (rent iedereen omver)', '<b>B + ↑</b> Boem-sprong (trager)', '<b>SUPER</b>: Aardbeving! Spring op tijd!'],
    spec: (b, pc) => ({ ...b, scale: 1, bodyW: 1.55, headScale: 1.12, shirt: 0x9a6a3a, tunic: 0x6b4a2e, sleeve: b.skin, pants: 0x4a3a2a, boots: 0x3a2a1e, belt: pc, hat: 'horns', hatColor: pc, beard: 'full', beardColor: 0xc8742a, hairStyle: 'none', scarf: pc, backpack: null, cape: null, nose: 1.4 }),
    weapon: clubWeapon, swing: 0xffc090,
  },
  ninja: {
    id: 'ninja', name: 'Ninja', icon: '🥷', css: '#79e0c4', scaleT: 0.9,
    stats: { weight: 0.78, run: 1.32, jump: 1.04, air: 1.1, grav: 0.97, fall: 1.0, jumps: 3, pow: 0.92 },
    bars: { Kracht: 3, Tempo: 5, Gewicht: 1, Bereik: 2 },
    atk: { wind: 0.7, rec: 0.75, dmg: 0.86, reach: 0.95 },
    over: { jab3: { rec: 0.18 } },
    side: 'dash', up: { kind: 'rocket', dur: 0.24, spd: 25, dmg: 3, name: 'WOEEESJ!' },
    sup: { id: 'clones', name: 'SCHADUWKLONEN' },
    blurb: 'Snel en lenig. Driedubbele sprong en een schaduwdash.',
    tips: ['<b>A</b> razendsnelle tikken (tik 3x)', '<b>B + ←/→</b> Schaduwdash (onkwetsbaar, door je tegenstander heen!)', '<b>B + ↑</b> Rookwolk-sprong. Je kunt <b>3x</b> springen!', '<b>SUPER</b>: Schaduwklonen vallen aan!'],
    spec: (b, pc) => ({ ...b, scale: 1, shirt: 0x24242e, sleeve: 0x24242e, tunic: null, pants: 0x24242e, boots: 0x15151c, belt: pc, hat: 'hood', hatColor: 0x24242e, scarf: pc, hairStyle: 'none', backpack: null, cape: null, eyeScale: 1.25 }),
    weapon: daggerWeapon, swing: 0xa8ffe8,
  },
};
export const FT_IDS = ['sword', 'mage', 'giant', 'ninja'];

// Bouwt het poppetje van een vechter voor speler i
export function buildFighterChar(type, i) {
  const ft = FT[type], pc = PLAYER_COLORS[i];
  const c = new Character(ft.spec(BROTHER_SPECS[i], pc));
  const w = ft.weapon(pc); c.hold(w, 'r'); c.weapon = w;
  if (ft.offhand) c.hold(ft.offhand(pc), 'l');
  if (type === 'ninja') {
    const hr = 0.3;
    c.head.add(mesh(new THREE.TorusGeometry(hr * 1.1, 0.04, 5, 14), mat(pc, { flatShading: false }), { cast: false, pos: [0, 0.2, 0], rot: [Math.PI / 2 + 0.1, 0, 0] }));
  }
  if (type === 'giant') c.head.add(mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 8, Math.PI), mat(0x3a2a1e), { cast: false, pos: [0, 0.14, 0.3], rot: [0, 0, 0] }));
  return c;
}

// ---------------- voorwerpen ----------------
// hold = je draagt het; instant = effect bij aanraken; thr = B + richting = gooien
export const ITEMS = {
  hammer: { name: 'HAMER!', col: '#c8d0e0', hex: 0xc8d0e0, w: 14, hold: 1, uses: 3 },
  bomb: { name: 'BOM!', col: '#ff8a4a', hex: 0xff8a4a, w: 20, hold: 1, uses: 1 },
  ice: { name: 'IJSBAL!', col: '#8fe8ff', hex: 0x8fe8ff, w: 16, hold: 1, uses: 2 },
  tramp: { name: 'TRAMPOLINE!', col: '#ff6fa5', hex: 0xff6fa5, w: 12 },
  sword: { name: 'ZWAARD!', col: '#e8f0ff', hex: 0xdfe8ff, w: 15, hold: 1, uses: 5, thr: 1 },
  stick: { name: 'STOK!', col: '#d8a868', hex: 0xd8a868, w: 12, hold: 1, uses: 8, thr: 1 },
  banana: { name: 'BANANENSCHIL!', col: '#ffe14a', hex: 0xffe14a, w: 13, hold: 1, uses: 1 },
  mine: { name: 'MIJN!', col: '#ff6b6b', hex: 0xff6b6b, w: 11, hold: 1, uses: 1 },
  heart: { name: 'HARTJE!', col: '#ff7fb0', hex: 0xff7fb0, w: 13, instant: 1 },
  star: { name: 'STER!', col: '#fff08a', hex: 0xffe45a, w: 4, instant: 1 },
  orb: { name: 'GOUDEN BAL!', col: '#ffd24a', hex: 0xffd24a, w: 0, instant: 1 },
};

let _heartGeo = null, _starGeo = null;
function heartGeo() {
  if (_heartGeo) return _heartGeo;
  const s = new THREE.Shape(); s.moveTo(0, -0.5); s.bezierCurveTo(-0.9, 0.1, -0.5, 0.7, 0, 0.35); s.bezierCurveTo(0.5, 0.7, 0.9, 0.1, 0, -0.5);
  _heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 6 }); _heartGeo.translate(0, 0, -0.11);
  return _heartGeo;
}
function starGeo() {
  if (_starGeo) return _starGeo;
  const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.28 : 0.62, a = i / 10 * TAU + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath();
  _starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }); _starGeo.translate(0, 0, -0.1);
  return _starGeo;
}
const emi = (c, e = 0.7, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.35, flatShading: true, ...o });
// Mesh van een voorwerp (staat op y=0, hoogte ~1.2). held = in de hand
export function mkItemMesh(type, held = false) {
  const g = new THREE.Group();
  if (type === 'hammer') { const hm = P.hammer(0xb8c4d8); hm.scale.setScalar(held ? 1.9 : 1.6); hm.position.y = held ? -0.1 : 0; g.add(hm); }
  else if (type === 'bomb') {
    g.add(mesh(new THREE.SphereGeometry(0.46, 12, 10), new THREE.MeshStandardMaterial({ color: 0x20202c, roughness: 0.4, metalness: 0.3 }), { cast: false, pos: [0, 0.5, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), mat(0x8a6a3a), { cast: false, pos: [0, 1.08, 0] }));
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd040 })); sp.position.y = 1.3; g.add(sp); g.userData.spark = sp;
  } else if (type === 'ice') {
    g.add(mesh(new THREE.IcosahedronGeometry(0.52, 0), new THREE.MeshStandardMaterial({ color: 0xbff0ff, emissive: 0x58c8f8, emissiveIntensity: 0.8, roughness: 0.15, flatShading: true }), { cast: false, pos: [0, 0.55, 0] }));
    g.add(mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0.15, 0.7, 0.2] }));
  } else if (type === 'sword') {
    const sw = P.sword(); sw.scale.setScalar(held ? 1.7 : 1.5); sw.rotation.z = held ? 0 : 0.5; sw.position.set(held ? 0 : -0.3, held ? -0.1 : 0.1, 0); if (held) sw.rotation.x = Math.PI - 0.75; g.add(sw);
  } else if (type === 'stick') {
    const st = new THREE.Group();
    st.add(mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.5, 6), mat(0xb98a54), { cast: false, pos: [0, 0.75, 0] }));
    st.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(0x8a6a3a), { cast: false, pos: [0.06, 1.1, 0] }));
    st.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(0x8a6a3a), { cast: false, pos: [-0.05, 0.5, 0] }));
    st.rotation.z = held ? 0 : 0.7; if (held) { st.rotation.x = Math.PI - 0.7; st.position.set(0, -0.1, 0); } else st.position.set(-0.45, 0.05, 0);
    g.add(st);
  } else if (type === 'banana') {
    const bm = mat(0xffe14a, { flatShading: false });
    g.add(mesh(new THREE.TorusGeometry(0.5, 0.15, 6, 12, 2.5), bm, { cast: false, pos: [0, 0.55, 0], rot: [0, 0, 3.6], scale: [1, 1, 0.8] }));
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x6a4a1e), { cast: false, pos: [-0.35, 0.95, 0] }));
    if (held) g.scale.setScalar(0.9);
  } else if (type === 'mine') {
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.3, 10), mat(0x34343e, { metalness: 0.4, roughness: 0.5 }), { cast: false, pos: [0, 0.2, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }), { cast: false, pos: [0, 0.42, 0] }));
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(mesh(new THREE.ConeGeometry(0.07, 0.2, 4), mat(0x555566), { cast: false, pos: [Math.cos(a) * 0.5, 0.38, Math.sin(a) * 0.5], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] })); }
    g.userData.light = g.children[1];
  } else if (type === 'heart') {
    g.add(mesh(heartGeo(), emi(0xff5a8a, 0.6, { flatShading: false }), { cast: false, pos: [0, 0.7, 0], scale: 1.15 }));
  } else if (type === 'star') {
    g.add(mesh(starGeo(), emi(0xffe45a, 0.9), { cast: false, pos: [0, 0.7, 0], scale: 1.2 }));
  } else if (type === 'orb') {
    g.add(mesh(new THREE.IcosahedronGeometry(0.55, 1), emi(0xffd24a, 1.2), { cast: false, pos: [0, 0.7, 0] }));
    g.add(mesh(new THREE.TorusGeometry(0.85, 0.05, 5, 18), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }), { cast: false, pos: [0, 0.7, 0], rot: [1.2, 0.3, 0] }));
  } else { // trampoline
    g.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.28, 16), mat(0xff6fa5, { flatShading: false }), { cast: false, pos: [0, 0.65, 0] }));
    g.add(mesh(new THREE.TorusGeometry(1.35, 0.12, 6, 18), mat(0xffe14a, { flatShading: false }), { cast: false, pos: [0, 0.78, 0], rot: [Math.PI / 2, 0, 0] }));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.65, 5), mat(0x555566), { cast: false, pos: [sx * 1.0, 0.32, 0] }));
  }
  return g;
}

export const STAGES = {
  island: { id: 'island', name: 'Zwevend Eiland', icon: '🏝️', blurb: 'Een eiland boven de wolken. Pas op voor de draak!' },
  dragon: { id: 'dragon', name: 'Drakenrug', icon: '🐉', blurb: 'Platforms op een rondvliegende draak. Hij duikt, hij waait en hij spuwt vuur!' },
  volcano: { id: 'volcano', name: 'Vulkaantoren', icon: '🌋', blurb: 'Stijgende lava, brokkelende platforms en gevaarlijke geisers!' },
};
export const STAGE_IDS = ['island', 'dragon', 'volcano'];

import * as THREE from 'three';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { scare } from '../engine/scare.js';
import { S, persist } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, makeNPC, drawScareFace, PLAYER_CSS, PLAYER_COLORS } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { h, mesh, mat, glow, canvasTex, clamp, damp, dampAngle, rand, pick, shuffle, TAU, lerp, smoothstep, disposeObject } from '../engine/util.js';
import { ARCADE_IDS, ARCADE_HALLS } from '../games/index.js';
import { floatLabel } from './build.js';
import { TWISTS } from '../engine/twist.js';
import { ArcadeDeurman } from './arcade_deur.js';
import { Deco } from './arcade_deco.js';
import { HALL_SIZE, layoutHall } from './arcade_zones.js';
import { cabUpright, cabSit, cabTable, STALLS } from './arcade_cabs.js';
import { rugTexture, zoneSign, ZONE_PROPS, shell } from './arcade_decor.js';
import { ArcadeLife } from './arcade_life.js';
import { mergeStatic } from './merge.js';
import { dailyInfo, dailyDone, dailyBonus, dailyStreak } from '../engine/daily.js';
import { isUnlocked, unlockHall, HALL_COST, HALL_NAMES, DEUR_HALL_STICKERS, rank, rankFrac, rankUp, RANKS, nextHall, hallStatus, hallExists, unlockedIds, stickers } from '../engine/progress.js';
import { openSettings, openOnline } from './menu.js';
import { hallCameoTick, openAlbum, stickerCount, STICKERS } from '../engine/cameo.js';
import { SPORT_CABS, SPORT_PROPS, SPORT_RUGS, sportFloor, sportWall, sportShell, sportCenter, sportBack, SportHall } from './arcade_sport.js';
import { DOOR_CABS, DEUR_PROPS, DEUR_RUGS, deurWall, deurShell, deurCenter, deurBack, DeurHall, DEUR_HOST } from './arcade_deurhal.js';
import { buildPartyTable, buildAlbumStand, refreshAlbum, SecretDoor } from './arcade_extra.js';
import { nPlayers, activeIds, inp, anyP, pcol, pcss, pname, klabel, LABEL_CSS, joinNames, standTxt, sum, wins3, topOf, pairLabel, allPairs, supports, wantsAll, mainQueue, newQueue, readResult, Menu3 } from './players3.js';
Object.assign(ZONE_PROPS, SPORT_PROPS, DEUR_PROPS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HALL = HALL_SIZE;              // 56 x 40: x: -28..28, z: -20..20 (zones/decor: arcade_zones.js, arcade_decor.js, arcade_cabs.js, arcade_life.js)
const PIC = { dodgeball: '🔥', cakefight: '🎂', tugwar: '🪢', airhockey: '🏒', quickdraw: '🤠', memory: '🃏', paint: '🎨', duckshoot: '🦆', karts: '🏎️', climb: '🧗', tanks: '💥', chairs: '🪑', ticktock: '🕰️', minecart: '🚃', buttons: '🧱', vines: '🌿', screws: '🔩', chop: '🪓', bomber: '💣', tron: '🏍️', hexagone: '⬡', tag: '🧨', brawl: '🥊', spacewar: '🚀', volley: '🏐', soccer: '⚽', pacduel: '👻', golf: '⛳', stack: '🏗️', blocks: '🧩', connect4: '🔴', dance: '💃', quiz: '🎤', code: '🔮', bake: '🥧', claw: '🧸', kalaha: '💎', bowling: '🎳', ducks: '🛁', flappy: '🐲', pinball: '🎱', hide: '🕵️', heist: '💰', catapult: '🏰', penalty: '🥅', basket: '🏀', darts: '🎯', pingpong: '🏓', boog: '🏹', curling: '🥌', deurzegt: '🚪', handtekening: '✍️', deurenrace: '🏁', deurdisco: '🪩' };
const NAME = { dodgeball: 'Vuurbal-Duel', cakefight: 'Taartengevecht', tugwar: 'Touwtrekken', airhockey: 'IJshockey-Chaos', quickdraw: 'Snelle Vingers', memory: 'Geheugen-Duel', paint: 'Verfgevecht', duckshoot: 'Schiettent', karts: 'Kartrace', climb: 'Torenklim', tanks: 'Kanonnenduel', chairs: 'Stoelendans', ticktock: 'Klokkentoren-Sprong', minecart: 'Mijnkar-Race', buttons: 'Knoppen-Breker', vines: 'Lianen-Zwaaien', screws: 'Schroef-Duel', chop: 'Houthakkers-Duel', bomber: 'Boem-Man Arena', tron: 'Lichtspoor-Duel', hexagone: 'Zinkende Vloer', tag: 'Bommentikkertje', brawl: 'Smash-Arena', spacewar: 'Ruimtegevecht', volley: 'Slijm-Volleybal', soccer: 'Raket-Voetbal', pacduel: 'Spookjacht-Duel', golf: 'Minigolf-Race', stack: 'Torenbouw-Duel', blocks: 'Blokkenstrijd', connect4: 'Vier op een Rij', dance: 'Dansduel', quiz: 'Quizshow', code: 'Kristal-Code', bake: 'Taartenbakkers-Battle', claw: 'Grijpkraan-Gekte', kalaha: 'Edelsteen-Kalaha', bowling: 'Reuzen-Bowling', ducks: 'Eendenrace', flappy: 'Wolkenrace', pinball: 'Flipper-Duel', hide: 'Verkleed-Verstoppertje', heist: 'Dievenduel', catapult: 'Kasteelbelegering', penalty: 'Strafschop-Showdown', basket: 'Mand-Mania', darts: 'Pijlen-Poeha', pingpong: 'Tafeltennis-Tornado', boog: 'Boogschieten-Battle', curling: 'Curling-Chaos', deurzegt: 'Deurman Zegt', handtekening: 'Handtekening-Jacht', deurenrace: 'Deurenrace', deurdisco: 'Deurman-Disco' };
const KING_WINS = [
  '{w} wint! {l}, niet huilen. De koning huilt ook weleens. Meestal om uien.',
  'Een glansrijke overwinning voor {w}! {l} had pech. Of geen talent. Dat weten we nog niet.',
  '{w} pakt de kroon! Of in elk geval de zitzak die ik daarvoor heb neergelegd.',
  'Wat een gevecht! {w} wint met stijl, {l} verliest met... ook stijl, maar anders.',
  '{w} wint! Schrijf het op, {l}, dan kun je het later nog eens teruglezen.',
];
const KING_DRAW = ['Gelijkspel! Dat is net zo saai als een stoel zonder poten.', 'Niemand wint! Dan moet je het gewoon nog eens doen. Met kracht.'];

// gastheer per hal: naam, label boven het podium, begroeting, reacties na een duel en toernooi-teksten
const HOSTS = [
  { name: 'Koning Klopper', label: '👑 Koning Klopper', hello: ['Ha, de uitdagers! Wie van jullie durft het eerst?', 'Kom maar op met je duels. Ik heb popcorn.', 'Mijn hal is de beste van het hele Koninkrijk. Ook de enige. Maar toch.'], wins: KING_WINS, draw: KING_DRAW },
  { name: 'DJ Dobber', label: '🎧 DJ Dobber', hello: ['Yo yo! Wie draait er vanavond de hoogste score?', 'De beat is aan, de duels zijn open. Doe maar iets geks.', 'Ik draai de muziek. Jullie draaien de toernooien. Samen draaien we door.'], wins: KING_WINS, draw: KING_DRAW },
  { name: 'Kermis-Kees', label: '🎟️ Kermis-Kees', hello: ['Kom d\'ren, kom d\'ren! Wie wil er winnen?', 'Een duelletje? Een toernooitje? Ik heb ook suikerspinnen.', 'Alles hier is gratis. Behalve de dingen die geld kosten.'], wins: KING_WINS, draw: KING_DRAW },
  { name: 'Trainer Tim', label: '📣 Trainer Tim', hello: ['FLUIT! Wie wil er als eerste zweten?', 'Warming-up gedaan? Nee? Dan is dit je warming-up.', 'Sport is gezond. Behalve als je verliest, dan is het gewoon pijnlijk.'],
    wins: ['{w} wint! {l}, even je schoenen strikken en door.', 'DOELPUNT! Of basket. Of bullseye. {w} wint, {l} mag water drinken.', '{w} heeft gewonnen! Applaus! Klap klap klap. {l} krijgt een stickertje voor meedoen.', 'Wat een prestatie van {w}! {l}: volgende keer eerst rekken en strekken. Of in elk geval strekken.'], draw: ['Gelijkspel! In de sport noemen wij dat: nog een keer.', 'Niemand wint, iedereen zweet. Zo hoort het.'],
    tstart: 'FLUIT! Het TOERNOOI begint! {n} duels: {icons}. Wie de meeste wint, krijgt een medaille. Van chocola. Die ik al half heb opgegeten.', champ: '{w} is KAMPIOEN! Naar het erepodium! {l}, jij mag op de reservebank zitten. Het is een heel comfortabele bank.', bonus: 'Hier zijn 50 heitjes. Koop er een bidon van. Of een sportdrankje. Of een deur.' },
  { name: 'De Deurman', label: '🚪 De Deurman', hello: DEUR_HOST.hello, wins: DEUR_HOST.wins, draw: DEUR_HOST.draw,
    tstart: 'Klop klop! Het TOERNOOI is geopend! {n} deuren... ik bedoel duels: {icons}. Wie wint, krijgt een gouden deurknop. (Alleen de knop. De deur blijft zitten.)', champ: '{w} is KAMPIOEN van alle hallen! {l}, jij krijgt de deurmat. Hij is zacht. Je kunt erop staan.', bonus: '50 heitjes uit mijn zak. Mijn zak zit in de deur. Het is een lang verhaal.' },
];
const HALL_INTRO = [null, [{ who: 'DJ Dobber', text: 'Welkom in de NEONKELDER! Hier draait de muziek hard en zijn de spellen nóg gekker. Bommen, ruimteschepen, flipperkasten... jullie zeggen het maar.' }, { who: 'Jor', text: 'Waar is de pauzeknop?' }, { who: 'DJ Dobber', text: 'Die is stuk. Veel plezier!' }],
  [{ who: 'Kermis-Kees', text: 'Kom d\'ren, kom d\'ren! Welkom op de KERMIS! Quiz, taart, bowlen, eendjes... en gratis kauwgom voor wie wint. Ik ben er heel gul in.' }, { who: 'Wes', text: 'Is dat een kip in de grijpkraan?' }, { who: 'Kermis-Kees', text: 'Ja. Niet aanraken. Hij weet wat hij doet.' }],
  [{ who: 'Trainer Tim', text: 'FLUIT! Welkom in de SPORTHAL! Strafschoppen, basketbal, darts, boogschieten, tafeltennis en curling. Even je warming-up doen: loop maar naar een kast.' }, { who: 'Wes', text: 'Moeten we ons omkleden?' }, { who: 'Trainer Tim', text: 'Alleen je moed. Een beetje spieren helpt ook.' }],
  [{ who: 'De Deurman', text: 'Klop klop! Welkom in mijn Deurenhal! Jullie hebben genoeg stickers verzameld. Ik ben zó trots. Ik heb ze allemaal zelf geplakt.' }, { who: 'Jor', text: 'Waarom zweven er deuren?' }, { who: 'De Deurman', text: 'Ze zijn op vakantie. Dat is een ding. Veel plezier!' }]];

let TOURNEY = null;   // { queue:[ids], idx, score:[per spelers-id], hall, dq }
const getDQ = () => (nPlayers() === 3 ? mainQueue() : null);   // wachtrij 'winnaar blijft' (alleen met 3 spelers)
const hallOf = (id) => { const h0 = ARCADE_HALLS.find((x) => x.ids.includes(id)); return h0 ? h0.id : 0; };
const THEMES = [
  { bg: 0x120a1e, floorA: '#cbbfdc', floorB: '#6a4a8a', lights: [0xff5ad8, 0x5ad8ff, 0xffe14a], banner: [0x7a2fd4, 0xd8372c, 0x2f6fe0], flame: 0xffa030, trim: [0xff5ad8, 0x5ad8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c], host: 'Koning Klopper', hostTag: 'toernooi & regels' },
  { bg: 0x040a1c, floorA: '#0a1230', floorB: '#101c46', lights: [0x00e5ff, 0xff2bd6, 0x7bff00], banner: [0x00b8d4, 0xd81bb0, 0x5fc800], flame: 0x20f0ff, trim: [0x00e5ff, 0xff2bd6, 0x7bff00, 0xffe14a, 0xb05aff, 0x00ffa8], host: 'DJ Dobber', hostTag: 'toernooi & regels' },
  { bg: 0x1a0e2e, floorA: '#f1d9a6', floorB: '#d49a58', lights: [0xffd23f, 0xff7ab0, 0xffa030], banner: [0xe8372c, 0xf6f0e0, 0x2f9be0], flame: 0xffd23f, trim: [0xe8372c, 0xffd23f, 0x2f9be0, 0x7bff7b, 0xff7ab0, 0xffa030], host: 'Kermis-Kees', hostTag: 'toernooi & regels' },
  { bg: 0x0c1c30, floorA: '#e2b274', floorB: '#d09a5a', lights: [0xfff0c0, 0x7ad8ff, 0xff9a5a], banner: [0xd8372c, 0x2f6fe0, 0x2fae5b], flame: 0xffd23f, trim: [0xe8372c, 0x2f6fe0, 0xffd23f, 0x2fae5b, 0xff8a1c, 0xf6f0e0], host: 'Trainer Tim', hostTag: 'toernooi & regels' },
  { bg: 0x2a1840, floorA: '#fffbea', floorB: '#d9c8f0', lights: [0xffe9a0, 0xff9ad8, 0x9ae0ff], banner: [0xe8b82a, 0xff7ab0, 0x5ad8ff], flame: 0xffe9a0, trim: [0xffd23f, 0xff7ab0, 0x5ad8ff, 0x7bff9b, 0xb08aff, 0xffa060], host: 'De Deurman', hostTag: 'toernooi & regels' },
];
// deuren per hal (achtermuur). Hal 0: twee brede deuren bij de troon + twee smalle daarbuiten: Sporthal (links) en de geheime Deurenhal (rechts, vermomd)
const DOORS = [[{ to: 1, x: -6.5 }, { to: 2, x: 6.5 }, { to: 3, x: -12.9, w: 3.6 }, { to: 4, x: 12.9, w: 3.6, secret: true }], [{ to: 0, x: 6.5 }], [{ to: 0, x: 6.5 }], [{ to: 0, x: 6.5 }], [{ to: 0, x: 6.5 }]];
const DOOR_FRAME = [0x7a2fd4, 0x1a2a6a, 0xb03020, 0x1d4fa8, 0xe8b82a], DOOR_GLOW = [0xffd23f, 0xff2bd6, 0xffa030, 0x7ad8ff, 0xffe9a0];

export class ArcadeMode {
  static async create(app, opts = {}) { return new ArcadeMode(app, opts); }
  constructor(app, opts) {
    this.app = app; this.opts = opts;
    this.hallId = (opts.extra && opts.extra.hall != null) ? opts.extra.hall : (opts.from ? hallOf(opts.from) : 0);
    if (!isUnlocked(this.hallId) || !ARCADE_HALLS[this.hallId]) this.hallId = 0;
    this.hall = ARCADE_HALLS[this.hallId]; this.theme = THEMES[this.hallId]; this.hostName = this.theme.host; this.H = HOSTS[this.hallId];
    this.t = 0; this.busy = false; this.menu = null; this.modal = null; this.hudT = 0; this.spin = null; this.promptKey = '';
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 300);
    this.fx = new Particles(1500); this.scene.add(this.fx.points); this.fx.setViewportHeight(innerHeight);
    const L = setupLights(this.scene, 'indoor', { shadow: 32, center: [0, 0, 0], fog: true, fogNear: 50, fogFar: 140, shadows: S.settings.quality !== 'low' });
    this.sun = this.sunL = L.sun; this.hemi = L.hemi; L.sun.intensity = 1.0; L.sun.position.set(10, 30, 15); L.hemi.intensity = 1.35;
    this.scene.background = new THREE.Color(THEMES[this.hallId].bg); this.scene.fog.color.set(THEMES[this.hallId].bg);
    this.W = HALL.w; this.Dp = HALL.d;
    this.colliders = []; this.interact = []; this.cabs = []; this.glows = []; this.eggs = []; this.doorInfo = {}; this.fallers = []; this.pointers = []; this.noAct = false;
    this.games = this.loadedIds(); this.D = new Deco(); this.zones = layoutHall(this.hallId);
    const first = this.scene.children.length;
    this.buildHall(); this.buildDoor(); this.buildCabinets(); this.buildCenter(); this.buildBack(); this.buildExtras();
    this.deco = this.D.build(this.scene, { shadow: S.settings.quality !== 'low' });
    for (const e of this.eggs) this.interact.push({ ...e, type: 'egg', egg: e.id });
    mergeStatic(this.scene, first, { cell: 120 });
    const ids = activeIds(), np = ids.length;
    this.players = ids.map((i) => {
      const c = makeBrother(i); this.scene.add(c.group);
      const ring = mesh(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: pcol(i), transparent: true, opacity: 0.7, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); this.scene.add(ring);
      const label = floatLabel(pname(i), '', LABEL_CSS[i]); label.scale.set(2.6, 0.8, 1); label.position.y = c.height + 0.95; label.material.depthTest = false; c.group.add(label);
      const viaDoor = opts.via === 'door'; const dxs = (DOORS[this.hallId].find((d) => d.to === opts.fromHall) || DOORS[this.hallId][0]).x;
      const off = np === 3 ? (i - 1) * 1.8 : (i ? 1.4 : -1.4), sx0 = np === 3 ? (i - 1) * 2.6 : (i ? 1 : -1) * 2;
      return { i, c, ring, x: viaDoor ? clamp(dxs + off, -HALL.w / 2 + 1.6, HALL.w / 2 - 1.6) : sx0, z: viaDoor ? -HALL.d / 2 + 7.5 : HALL.d / 2 - 6, y: 0, vx: 0, vz: 0, vy: 0, grounded: true, yaw: Math.PI, stepT: 0 };
    });
    this.mid = new THREE.Vector3(0, 0, 12); this.camPos = new THREE.Vector3(0, 40, 44); this.camLook = new THREE.Vector3(0, 0, 2); this.intro = 3.2;
    this.nextGlitch = rand(40, 80); this.camShake = 0; this.camOverride = null;
    this.deur = new ArcadeDeurman(this);
    this.life = new ArcadeLife(this);
  }
  hasTourney() { return !!TOURNEY; }
  loadedIds() { return this.hall.ids.filter((id) => this.app.games[id]); }
  allLoaded() { const ok = new Set(unlockedIds()); return ARCADE_IDS.filter((id) => this.app.games[id] && ok.has(id) && supports(this.app.games[id])); }   // alleen spellen uit ontgrendelde hallen
  isOff(id) { return (S.arcade.excluded || []).includes(id) || !supports(this.app.games[id]); }
  defOf(id) { return this.app.games[id] || { name: NAME[id], icon: PIC[id] }; }

  // ------------------------------------------------------------------ gebouw
  buildHall() {
    const T = this.theme; const neon = this.hallId === 1, fair = this.hallId === 2, sport = this.hallId === 3, doorh = this.hallId === 4; const D = this.D;
    const sc = this.scene; const deurMat = (r) => { const m = deurWall(r); return new THREE.MeshStandardMaterial({ map: m, roughness: 0.9, emissive: 0xffffff, emissiveMap: m, emissiveIntensity: 0.3 }); }; const sm = sport ? new THREE.MeshStandardMaterial({ map: sportWall(), roughness: 0.9 }) : doorh ? deurMat(3.5) : neon ? new THREE.MeshStandardMaterial({ color: 0x2a3664, roughness: 0.8, flatShading: true, emissive: 0x0c1840, emissiveIntensity: 0.9 }) : fair ? new THREE.MeshStandardMaterial({ map: (() => { const t = canvasTex(256, 64, (g, w, hh) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f6f0e0' : '#d8372c'; g.fillRect(i * w / 8, 0, w / 8 + 1, hh); } g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 8; i++) g.fillRect(i * w / 8, 0, 3, hh); }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 2); return t; })(), roughness: 0.9 }) : new THREE.MeshStandardMaterial({ map: tex.stone(8, 2), roughness: 0.95, flatShading: true });
    if (neon) {
      const gt = canvasTex(256, 256, (g, w, hh) => { g.fillStyle = '#0a1230'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, hh - 2); g.strokeStyle = 'rgba(255,43,214,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, hh); g.moveTo(0, hh / 2); g.lineTo(w, hh / 2); g.stroke(); g.fillStyle = 'rgba(0,229,255,.12)'; g.fillRect(0, 0, w / 2, hh / 2); g.fillRect(w / 2, hh / 2, w / 2, hh / 2); });
      gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(HALL.w / 6, HALL.d / 6);
      sc.add(mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.25, metalness: 0.4, emissive: 0x0a2a4a, emissiveMap: gt, emissiveIntensity: 0.9 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    } else if (sport) {
      sc.add(mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshStandardMaterial({ map: sportFloor(HALL.w, HALL.d), roughness: 0.4, metalness: 0.1 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    } else {
      sc.add(mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshStandardMaterial({ map: tex.checker(HALL.w / 5, HALL.d / 5, T.floorA, T.floorB), roughness: doorh ? 0.2 : 0.35, metalness: doorh ? 0.35 : 0.15 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
      if (this.hallId === 0 || doorh) sc.add(mesh(new THREE.PlaneGeometry(5.2, 15), new THREE.MeshStandardMaterial({ map: tex.carpet(1, 3), roughness: 1 }), { cast: false, pos: [0, 0.03, -HALL.d / 2 + 8.4], rot: [-Math.PI / 2, 0, 0] }));   // loper naar de troon
    }
    const wallH = 15;
    const wall = (w, hh, x, y, z, ry = 0) => sc.add(mesh(new THREE.BoxGeometry(w, hh, 1.4), sm, { pos: [x, y, z], rot: [0, ry, 0] }));
    wall(HALL.w + 2, wallH, 0, wallH / 2, -HALL.d / 2 - 0.7); const smS = doorh ? deurMat(2.5) : sm; for (const sx of [-1, 1]) sc.add(mesh(new THREE.BoxGeometry(HALL.d + 2, wallH, 1.4), smS, { pos: [sx * (HALL.w / 2 + 0.7), wallH / 2, 0], rot: [0, Math.PI / 2, 0] }));
    // voorkant is open (poppenhuis-doorsnede) zodat de camera altijd naar binnen kijkt; de uitgang is een gloeiend portaal op de vloer
    const ez = HALL.d / 2 - 2.5;
    this.exitDoor = mesh(new THREE.CircleGeometry(3.0, 28), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.08, ez], rot: [-Math.PI / 2, 0, 0] }); sc.add(this.exitDoor);
    D.tor(3.0, 0.18, 0, 0.2, ez, 0xffe14a, { kind: 'p0', rx: Math.PI / 2 }, 28);
    for (let i = 0; i < 3; i++) D.cone(0.5, 0.9, 3, (i - 1) * 1.6, 0.1, ez + 3.6, 0xffe14a, { kind: 'p' + i, rx: Math.PI / 2, ry: 0 });   // pijltjes naar buiten
    const exl = floatLabel('🚪 Uitgang', 'terug naar het dorp', '#ffe14a'); exl.position.set(0, 3.8, ez); sc.add(exl);
    this.interact.push({ type: 'exit', x: 0, z: ez, r: 3.4, label: 'Terug naar het dorp' });
    shell(this, D); if (sport) sportShell(this, D); if (doorh) deurShell(this, D);
    // fakkels (vlam = instanced mesh, geen licht) + steunen
    const fl = []; for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) { const fx = sx * (HALL.w / 2 - 0.8), fz = -HALL.d / 2 + 4.5 + i * 8.2; D.cyl(0.07, 0.1, 1.1, 5, fx, 4.3, fz, 0x5b3d24); D.box(0.4, 0.1, 0.4, fx, 3.8, fz, 0x333338); fl.push([fx, 4.9, fz]); }
    if (this.hallId === 0) for (const sx of [-1, 1]) { D.cyl(0.1, 0.14, 4.4, 6, sx * 8.6, 2.2, -HALL.d / 2 + 1.2, 0x333338); D.cyl(0.4, 0.2, 0.4, 8, sx * 8.6, 4.5, -HALL.d / 2 + 1.2, 0x333338, { kind: 'metal' }); fl.push([sx * 8.6, 5.1, -HALL.d / 2 + 1.2]); }
    const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.55, 5), new THREE.MeshBasicMaterial({ color: T.flame }), fl.length); flames.frustumCulled = false; flames.userData.pos = fl; flames.castShadow = false; sc.add(flames); this.glows.push(flames); this.flames = flames;
    // spandoeken langs de zijmuren (de doek beweegt, dus dynamisch)
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      const b = P.banner(T.banner[i % 3], 6.5, 1.8); b.position.set(sx * (HALL.w / 2 - 1.2), 5.5, -9 + i * 11 - 1.8); b.rotation.y = -sx * Math.PI / 2; b.children.forEach((c) => { if (c === b.userData.cloth) c.userData.dynamic = true; }); sc.add(b); (this.banners ||= []).push(b);
    }
    // discobal + kleurlichten
    this.disco = new THREE.Group();
    this.disco.add(mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.1, flatShading: true, emissive: 0x444466, emissiveIntensity: 0.6 }), { cast: false }));
    this.disco.position.set(0, 13, -HALL.d / 2 + 5); sc.add(this.disco);
    this.lights = T.lights.map((c, i) => { const l = new THREE.PointLight(c, S.settings.quality === 'low' ? 0 : [110, 80, 110, 100, 95][this.hallId], 30, 1.6); l.position.set(0, 9, 2); sc.add(l); return l; });
    if (neon) {   // neonbuizen langs de muren + speakers + gloeiend DJ-bord
      for (const [y, c] of [[3, 0x00e5ff], [12, 0xff2bd6]]) { for (const sx of [-1, 1]) D.box(0.2, 0.25, HALL.d - 2, sx * (HALL.w / 2 - 0.15), y, 0, c, { kind: 'p' + (y > 5 ? 1 : 0) }); D.box(HALL.w - 2, 0.25, 0.2, 0, y, -HALL.d / 2 + 0.15, c, { kind: 'p' + (y > 5 ? 1 : 0) }); }
      for (const sx of [-1, 1]) { const spx = sx * 23, spz = -HALL.d / 2 + 2; D.box(2.4, 4.4, 2.2, spx, 2.2, spz, 0x10162c); for (const yy of [1.3, 3.2]) D.cyl(0.75, 0.75, 0.1, 14, spx, yy, spz + 1.12, yy > 2 ? 0xff2bd6 : 0x00e5ff, { kind: yy > 2 ? 'p1' : 'p2', rx: Math.PI / 2 }); this.colliders.push({ x: spx, z: spz, r: 1.6 }); }
      const nt = canvasTex(512, 128, (g, w, hh) => { g.fillStyle = '#05081a'; g.fillRect(0, 0, w, hh); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 84px Fredoka, Arial Black, sans-serif'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 24; g.fillStyle = '#ffd6f6'; g.fillText('NEONKELDER', w / 2, hh / 2 + 4, w - 30); g.strokeStyle = '#00e5ff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, hh - 12); });
      sc.add(mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: nt }), { cast: false, receive: false, pos: [0, 10.2, -HALL.d / 2 + 0.2] }));
    }
    if (fair) {   // kermis: de tent-muren hebben al strepen; een groot bord boven het kassakraam
      const kt = canvasTex(512, 128, (g, w, hh) => { g.fillStyle = '#d8372c'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#ffd23f'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, hh - 16); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 86px Fredoka, Arial Black, sans-serif'; g.lineWidth = 12; g.strokeStyle = '#7a1010'; g.strokeText('KERMIS!', w / 2, hh / 2 + 4); g.fillStyle = '#ffe14a'; g.fillText('KERMIS!', w / 2, hh / 2 + 4); });
      sc.add(mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: kt }), { cast: false, receive: false, pos: [0, 10.5, -HALL.d / 2 + 0.2] }));
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const bx = sx * (HALL.w / 2 - 3), bz = -12 + i * 14; D.box(2.2, 1.0, 1.1, bx, 0.5, bz, 0xe0c060); D.box(2.2, 1.0, 1.1, bx, 1.5, bz, 0xd0b050, { ry: 0.1 }); this.colliders.push({ x: bx, z: bz, r: 1.3 }); }
    }
  }
  buildDoor() {
    const sc = this.scene; const zb = -HALL.d / 2;
    for (const d of DOORS[this.hallId]) {
      if (d.secret) { this.sec = new SecretDoor(this, d, zb); continue; }
      const other = ARCADE_HALLS[d.to]; const dx = d.x; const sw = (d.w || 5) / 5; const col = DOOR_GLOW[d.to] || 0xffd23f;
      const g = new THREE.Group(); g.scale.x = sw; const fr = mat(DOOR_FRAME[d.to] || 0x4a3a7a, { metalness: 0.5, roughness: 0.4 });
      for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.7, 8, 0.8), fr, { pos: [sx * 2.1, 4, 0] }));
      g.add(mesh(new THREE.BoxGeometry(5, 0.8, 0.8), fr, { pos: [0, 8.2, 0] }));
      const gl = mesh(new THREE.PlaneGeometry(3.6, 7.6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false }), { cast: false, receive: false, pos: [0, 4, 0.15] }); g.add(gl); (this.doorGlows ||= []).push(gl);
      g.add(mesh(new THREE.TorusGeometry(2.1, 0.12, 5, 20, Math.PI), glow(col, 1.4), { cast: false, pos: [0, 7.6, 0.3] }));
      g.position.set(dx, 0, zb + 0.5); sc.add(g);
      const back = d.to === 0;
      const info = this.doorInfo[d.to] = { to: d.to, x: dx, z: zb + 3.8, gl, sw, name: HALL_NAMES[d.to] || other.name, back };
      info.it = { type: 'door', to: d.to, x: dx, z: zb + 3.8, r: 3.4 * Math.max(0.8, sw), label: `Naar de ${other.name}` }; this.interact.push(info.it);
      if (!back && !isUnlocked(d.to)) this.buildLock(info, zb);
      this.setDoorLabel(info);
    }
  }

  // ---- hallen bouwen: dichtgetimmerde deur ('in aanbouw') met planken, bouwhekken, hoedjes en een bord
  buildLock(info, zb) {
    const L = new THREE.Group(); L.userData.dynamic = true; L.position.set(info.x, 0, zb + 0.5); L.scale.x = info.sw || 1; this.scene.add(L); info.lock = L; info.parts = [];
    const wood = new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#b98a54'), roughness: 0.9 });
    const add = (m) => { L.add(m); info.parts.push(m); return m; };
    for (const [y, rz] of [[1.6, 0.05], [3.2, -0.07], [4.9, 0.06], [6.6, -0.04]]) add(mesh(new THREE.BoxGeometry(5.6, 0.55, 0.22), wood, { pos: [0, y, 0.45], rot: [0, 0, rz] }));
    for (const rz of [0.62, -0.62]) add(mesh(new THREE.BoxGeometry(0.5, 9.4, 0.2), wood, { pos: [0, 4.2, 0.7], rot: [0, 0, rz] }));
    const stripe = canvasTex(256, 64, (g, w, hh) => { g.fillStyle = '#f6f0e0'; g.fillRect(0, 0, w, hh); g.fillStyle = '#ff7a1a'; for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 40, hh); g.lineTo(i * 40 + 20, hh); g.lineTo(i * 40 + 52, 0); g.lineTo(i * 40 + 32, 0); g.fill(); } });
    for (const sx of [-1, 1]) { const b = add(mesh(new THREE.BoxGeometry(3.0, 0.8, 0.14), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.8 }), { pos: [sx * 2.0, 1.1, 2.4], rot: [0, sx * 0.25, 0] })); for (const lx of [-1.2, 1.2]) b.add(mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), mat(0x888890), { pos: [lx, -0.5, 0] })); }
    for (const sx of [-1, 1]) { const c = add(mesh(new THREE.ConeGeometry(0.42, 1.1, 8), mat(0xff7a1a), { pos: [sx * 3.9, 0.55, 3.0] })); c.add(mesh(new THREE.CylinderGeometry(0.27, 0.31, 0.2, 8), mat(0xf6f0e0), { pos: [0, 0.12, 0] })); }
    const sg = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), new THREE.MeshBasicMaterial({ map: null }))); sg.position.set(0, 4.3, 1.0); sg.scale.x = 1 / (info.sw || 1); info.sign = sg;
    info.gl.material.opacity = 0.1;
    this.drawLockSign(info);
  }
  drawLockSign(info) {
    if (!info.sign) return; const cost = HALL_COST[info.to] || 0, need = Math.max(0, cost - S.coins);
    const t = canvasTex(340, 210, (g, w, hh) => {
      g.fillStyle = '#f2e2b0'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#7a4a1a'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, hh - 12); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#2a1a50'; g.font = 'bold 44px Fredoka, Arial Black, sans-serif'; g.fillText(info.name.toUpperCase(), w / 2, 48, w - 30);
      g.fillStyle = '#d8372c'; g.font = 'bold 36px Fredoka, Arial, sans-serif'; g.fillText('🚧 IN AANBOUW', w / 2, 100, w - 30);
      g.fillStyle = '#3a2412'; g.font = 'bold 32px Fredoka, Arial, sans-serif'; g.fillText(need > 0 ? `nog ${need} heitjes` : `bouw nu voor ${cost}!`, w / 2, 152, w - 30);
      g.font = '22px Fredoka, Arial, sans-serif'; g.fillStyle = '#7a5a3a'; g.fillText(`(kost ${cost} heitjes)`, w / 2, 186, w - 30);
    });
    const old = info.sign.material.map; info.sign.material.map = t; info.sign.material.needsUpdate = true; if (old) old.dispose();
  }
  setDoorLabel(info) {
    if (info.lb) { this.scene.remove(info.lb); info.lb.material.map && info.lb.material.map.dispose(); info.lb.material.dispose(); }
    const locked = !!info.lock && !info.built; const o = ARCADE_HALLS[info.to];
    const lb = floatLabel(`${info.back ? '↩' : locked ? '🚧' : ['', '🌀', '🎪', '⚽', '🚪'][info.to] || '🚪'} ${o.name}`, info.back ? 'terug naar de Speelhal' : locked ? 'in aanbouw!' : 'meer spellen!', info.back ? '#ffe14a' : locked ? '#ffb347' : '#ff9aef');
    lb.scale.set(4.4 * Math.max(0.85, info.sw || 1), 1.4, 1); lb.position.set(info.x, 10.2, -HALL.d / 2 + 1); this.scene.add(lb); info.lb = lb;
    info.it.label = locked ? `Bouwen: ${o.name}` : `Naar de ${o.name}`;
  }
  refreshDoors() { for (const i of Object.values(this.doorInfo)) if (i.lock && !i.built) this.drawLockSign(i); }
  // Bouwanimatie: hameren, planken vallen weg, confetti en fanfare; daarna werkt de deur
  async buildAnim(to) {
    const info = this.doorInfo[to]; const L = info.lock; const zb = -HALL.d / 2; const dx = info.x;
    this.camOverride = { x: dx, z: -15, t: 99 }; await sleep(800);
    for (let i = 0; i < 8; i++) { audio.sfx(i % 2 ? 'wood' : 'chop'); this.camShake = 0.22; L.position.x = dx + rand(-0.06, 0.06); this.fx.burst(dx + rand(-2.5, 2.5), 1 + rand(0, 5), zb + 2.2, { count: 8, color: 0xd8c8a8, speed: 3, life: 0.6, gravity: 4, size: 0.45 }); await sleep(190); }
    L.position.x = dx; audio.sfx('win'); audio.sfx('powerup'); ui.flash('#fff', 300);
    for (let i = 0; i < 5; i++) setTimeout(() => this.fx.burst(dx + rand(-3, 3), 4 + rand(0, 5), zb + 3, { count: 40, colors: [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b], speed: 8, size: 0.45, life: 1.5, gravity: 3 }), i * 220);
    for (const m of info.parts) this.fallers.push({ m, vx: rand(-4, 4), vy: rand(4, 9), vz: rand(3, 9), wx: rand(-4, 4), wz: rand(-4, 4), t: 3.5 });
    info.built = true; info.gl.material.opacity = 0.55; this.setDoorLabel(info); this.life.cheer && this.life.cheer(); this.refreshHud();
    await sleep(2300); this.camOverride = null;
    S.flags['built_' + to] = true; persist();
    await this.say([{ who: 'Koning Klopper', text: `KLAAR! De ${info.name} is gebouwd! De bouwvakkers nemen vanaf nu vrij. Voor altijd, zeiden ze. Ik denk dat ze twee dagen bedoelden.` }, { who: 'Koning Klopper', text: `Er zijn ${ARCADE_HALLS[to].ids.length} nieuwe spellen. Ze doen nu ook mee aan het Wiel en de toernooien!` }]);
  }
  async buildHallDoor(it) {
    const id = it.to, cost = HALL_COST[id] || 0, name = (this.doorInfo[id] && this.doorInfo[id].name) || ARCADE_HALLS[id].name;
    const c = await this.choose(`🚧 Laat de ${name} bouwen voor ${cost} heitjes?`, ['Ja, bouwen!', 'Nee, nog niet'], `Jullie hebben 🪙 ${S.coins} heitjes · ${ARCADE_HALLS[id].ids.length} nieuwe spellen erbij`);
    if (c !== 0) return;
    if (S.coins < cost) { await this.say([{ who: 'Koning Klopper', text: `Dat kost ${cost} heitjes en jullie hebben er ${S.coins}. Win nog ${cost - S.coins} heitjes met duels, toernooien of de Uitdaging van de dag!` }]); return; }
    if (!unlockHall(id)) return;
    this.refreshHud(); await this.buildAnim(id);
  }
  // Bouwplan-bord (kaart met alle hallen, rang en statistieken)
  buildPlan() {
    const D = this.D; const px = 7.5, pz = 14.2;
    D.cyl(0.1, 0.12, 3.0, 6, px - 1.2, 1.5, pz, 0x6b4a2e); D.cyl(0.1, 0.12, 3.0, 6, px + 1.2, 1.5, pz, 0x6b4a2e);
    const bt = canvasTex(256, 160, (g, w, hh) => { g.fillStyle = '#1d4a9a'; g.fillRect(0, 0, w, hh); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); } for (let y = 0; y < hh; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.strokeStyle = '#fff'; g.lineWidth = 3; for (let i = 0; i < 5; i++) g.strokeRect(14 + i * 48, 62, 40, 56); g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.fillText('BOUWPLAN', w / 2, 38); });
    this.scene.add(mesh(new THREE.BoxGeometry(2.8, 1.8, 0.12), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 }), { pos: [px, 2.4, pz], cast: false }));
    const pl = floatLabel('🏗️ Bouwplan', 'hallen, rang & stand', '#9ad8ff'); pl.position.set(px, 4.9, pz); this.scene.add(pl);
    this.colliders.push({ x: px, z: pz, r: 1.0 });
    this.interact.push({ type: 'plan', x: px, z: pz + 2, r: 3.2, label: 'Bouwplan bekijken' });
  }
  async planModal() {
    const r = rank(), A = S.arcade, n = S.names; const cards = [];
    for (let id = 0; id <= 4; id++) {
      const st = hallStatus(id), cost = HALL_COST[id] || 0, ex = hallExists(id), nm = st === 'built' || (ex && id !== 4) ? (HALL_NAMES[id] || ARCADE_HALLS[id].name) : null;
      let body, cls;
      if (st === 'built') { body = `✅ Gebouwd${ex ? ` · ${ARCADE_HALLS[id].ids.length} spellen` : ''}`; cls = '#1d9a52'; }
      else if (st === 'building') { body = `🚧 In aanbouw · kost ${cost} 🪙<br><small>${S.coins >= cost ? 'Genoeg heitjes! Ga naar de deur.' : `nog ${cost - S.coins} heitjes`}</small>`; cls = '#c77a1a'; }
      else body = id === 4 ? `Geheim<br><small>Deurman-stickers: ${stickers().length}/${DEUR_HALL_STICKERS}</small>` : `Geheim<br><small>${cost ? `kost later ${cost} 🪙` : 'nog niet klaar'}</small>`, cls = '#7a5aa8';
      cards.push(h('div', { style: { border: `3px solid ${cls}`, borderRadius: '12px', padding: '6px 10px', background: 'rgba(255,255,255,.55)', textAlign: 'center', minWidth: '118px', flex: '1' }, html: `<b style="font-size:19px">${nm ? ['🏛️', '🌀', '🎪', '⚽', '🚪'][id] + ' ' + nm : '❓ ???'}</b><br><span style="color:${cls};font-weight:700">${body}</span>` }));
    }
    const nx = r.next; const goal = nx ? `Volgende rang: ${nx.icon} ${nx.name} bij ${nx.at} punten (nu ${r.points})` : 'Hoogste rang bereikt! Vraag Koning Klopper om het Slotfeest.';
    const bar = h('div', { style: { height: '14px', borderRadius: '8px', background: '#cdbf9a', overflow: 'hidden', border: '2px solid #5b3a1e', margin: '4px 0' } }, h('i', { style: { display: 'block', height: '100%', width: Math.round(rankFrac() * 100) + '%', background: 'linear-gradient(90deg,#ffcf3a,#ff8a3a)' } }));
    const fav = Object.entries(A.byGame).sort((a, b) => b[1].plays - a[1].plays)[0];
    const stats = `🎮 ${A.plays} duels · 🏅 ${standTxt(A.wins)} · 🤝 ${A.draws} gelijk · 🏆 toernooien ${activeIds().map((i) => (A.tourneys[i] || 0)).join(' – ')}<br>🌟 dagduels ${(S.daily && S.daily.total) || 0} · 📒 Deurman-stickers ${stickerCount()}/${STICKERS.length} · 🪙 ${S.coins} heitjes${fav ? ` · favoriet: ${this.defOf(fav[0]).icon || ''} ${this.defOf(fav[0]).name}` : ''}`;
    const body = h('div', { style: { maxHeight: '62vh', overflow: 'auto' } }, h('p', { style: { textAlign: 'center', fontSize: '22px', margin: '4px 0' }, html: `Rang: <b>${r.icon} ${r.name}</b>` }), bar, h('p', { class: 'small-note', style: { margin: '2px 0 8px' } }, goal), h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0' } }, ...cards), h('p', { style: { textAlign: 'center', fontSize: '16px' }, html: stats }));
    await this.cardModal('🏗️ Bouwplan van de Speelhal', body);
  }
  // Rang-HUD linksonder: rang + voortgangsbalk + doel
  refreshRankHud() {
    if (!this.rankEl || !this.rankEl.isConnected) { this.rankEl = h('div', { class: 'hud-quest', style: { maxWidth: '330px' } }); ui.hudEl.append(this.rankEl); this._rk = null; }
    const r = rank(), nh = nextHall(); const nx = r.next; const frac = Math.round(rankFrac() * 100);
    const nextTxt = (nh != null ? `Volgende hal: ${HALL_NAMES[nh]} (🪙 ${Math.min(S.coins, HALL_COST[nh])}/${HALL_COST[nh]})` : 'Alle hallen gebouwd!') + ` · 📒 ${stickerCount()}/${STICKERS.length} stickers`;
    const key = [r.index, r.points, frac, nh, S.coins, stickerCount()].join('|'); if (this._rk === key) return; this._rk = key;
    this.rankEl.innerHTML = `<h4>Bouw de Speelhal uit!</h4><div>Rang: <b>${r.icon} ${r.name}</b>${nx ? ` <small>(${r.points}/${nx.at})</small>` : ' 👑'}</div><div style="height:9px;margin:3px 0;background:#2a1a3a;border-radius:6px;overflow:hidden;border:2px solid #000"><i style="display:block;height:100%;width:${frac}%;background:linear-gradient(90deg,#ffcf3a,#ff8a3a)"></i></div><div style="font-size:13px">${nextTxt}</div>`;
  }
  // Rang gestegen: feestje, fanfare en een regel van Koning Klopper
  async checkRankUp() {
    const r = rankUp(); if (!r) return;
    this.busy = true; this.refreshHud(); audio.sfx('win'); audio.sfx('powerup'); ui.flash('#fff', 300); ui.hud.showBig(`${r.icon} ${r.name}!`, 2400, '#ffe14a');
    for (let i = 0; i < 6; i++) setTimeout(() => this.fx.burst(rand(-10, 10), 6 + rand(0, 5), rand(-2, 10), { count: 36, colors: [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b], speed: 8, size: 0.45, life: 1.5, gravity: 3 }), i * 240);
    this.life.party && this.life.party(7); this.players.forEach((p) => (p.c.pose = 'cheer'));
    const lines = [{ who: 'Koning Klopper', text: pick([`RANGSTIJGING! Jullie zijn nu ${r.icon} ${r.name}! Ik heb er een fanfare voor laten maken. De fanfare is nog aan het oefenen.`, `${r.icon} ${r.name}! Dat staat mooi op jullie visitekaartje. Als jullie een visitekaartje hadden.`, `Hoor je dat? Dat is het geluid van ${r.icon} ${r.name} worden. Het klinkt een beetje als confetti.`]) }];
    if (r.index === RANKS.length - 1) lines.push({ who: 'Koning Klopper', text: 'Jullie zijn SPEELHAL-LEGENDES! Voor jullie geef ik het GROTE SLOTFEEST. Praat met mij en kies "Het Grote Slotfeest" wanneer jullie klaar zijn. Doorspelen mag daarna gewoon.' });
    await this.say(lines); this.players.forEach((p) => (p.c.pose = 'idle')); this.busy = false; input.reset();
  }
  // Wijzer (bouncende pijl) voor de uitleg
  pointAt(pts) {
    this.pointOff();
    for (const [x, z, y] of pts) { const g = new THREE.Group(); g.add(mesh(new THREE.ConeGeometry(0.8, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, receive: false, rot: [Math.PI, 0, 0] })); g.add(mesh(new THREE.RingGeometry(1.5, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.7, depthWrite: false }), { cast: false, receive: false, pos: [0, -(y || 3) + 0.1, 0], rot: [-Math.PI / 2, 0, 0] })); g.position.set(x, y || 3, z); g.userData.y0 = y || 3; this.scene.add(g); this.pointers.push(g); }
  }
  pointOff() { for (const g of this.pointers) { this.scene.remove(g); disposeObject(g); } this.pointers = []; }
  waitMove() {
    const st = this.players.map((p) => [p.x, p.z]); const t0 = Date.now(); ui.hud.setHint('Loop een stukje rond! Wes: WASD · Jor: pijltjes' + (nPlayers() === 3 ? ' · Juul: IJKL' : ''));
    return new Promise((res) => { const iv = setInterval(() => { if (Date.now() - t0 > 20000 || this.players.every((p, i) => Math.hypot(p.x - st[i][0], p.z - st[i][1]) > 2.5)) { clearInterval(iv); ui.hud.setHint(null); res(); } }, 200); });
  }
  // Begroeting + uitleg (guided tutorial) na de opening
  async introTutorial() {
    this.busy = true; this.noAct = true; S.flags.met_king = true; S.flags.intro_done = true; persist();
    const K = 'Koning Klopper'; const cab = (id) => this.cabs.find((c) => c.id === id);
    this.camOverride = { x: 0, z: -13, t: 999 };
    await this.say([{ who: K, text: `WELKOM, WELKOM! ${nPlayers() === 3 ? 'Wes, Jor en Juul' : 'Wes en Jor'}, de nieuwe beheerders van mijn Speelhal! De Deurman heeft jullie handtekening netjes bezorgd. Hij wilde hem eerst inlijsten.` }, { who: 'Wes', text: 'Wat een mooie hal!' }, { who: K, text: 'Dank je. Ik heb hem vorige week gepoetst. Met een sok.' }]);
    const c = await this.choose('Uitleg nodig?', ['Ja, leg maar uit!', 'Nee, ik weet het al']);
    if (c === 0) {
      this.camOverride = null; await this.say([{ who: K, text: 'Eerst het lopen. Wes loopt met W A S D, Jor met de pijltjestoetsen' + (nPlayers() === 3 ? ' en Juul met I J K L' : '') + '. Probeer maar eens!' }]);
      this.busy = false; await this.waitMove(); this.busy = true;
      await this.say([{ who: K, text: 'Prachtig! Als er niks in de buurt is, spring je met je actieknop (' + (nPlayers() === 3 ? 'F, Enter of U' : 'F of Enter') + '). Dat doet niks, maar het ziet er geweldig uit.' }]);
      const tg = cab('tugwar') || this.cabs[0]; this.camOverride = { x: tg.x, z: tg.z, t: 999 }; this.pointAt([[tg.ix, tg.iz, 3.2]]);
      await this.say([{ who: K, text: 'Dit zijn de kasten. Loop ernaartoe en druk op je actieknop: dan kiezen jullie een duel. Elk duel is 1 tegen 1' + (nPlayers() === 3 ? ' (met z\'n drieën kies je wie er speelt: de derde kijkt toe en wacht op de winnaar)' : '') + ' en krijgt een TWIST. Die is soms een ramp.' }]);
      this.camOverride = { x: 0, z: 3, t: 999 }; this.pointAt([[0, this.centerZ + this.wheelC.hit + 1.3, 3.2]]);
      await this.say([{ who: K, text: 'Het WIEL VAN GEKTE kiest een duel voor jullie. Draaien kost niets. Behalve geduld.' }]);
      this.camOverride = { x: 0, z: -13, t: 999 }; this.pointAt([[0, -HALL.d / 2 + 9.2, 3.2]]);
      await this.say([{ who: K, text: 'Bij mij start je een TOERNOOI: meerdere duels achter elkaar. Ik ga ook over de Uitdaging van de dag en de hoedenwinkel.' }]);
      this.camOverride = { x: 0, z: -15, t: 999 }; this.pointAt(Object.values(this.doorInfo).filter((i) => !i.back && !i.secret).map((i) => [i.x, -HALL.d / 2 + 3.8, 4.5]));
      await this.say([{ who: K, text: Object.values(this.doorInfo).some((i) => i.lock && !i.built) ? 'En die dichtgetimmerde deuren? Daar komen nieuwe hallen! Met heitjes uit jullie duels laat je ze bouwen. De bouwvakkers staan al klaar. Ze staan er al sinds maandag.' : 'En die deuren leiden naar nog meer hallen. Veel plezier daarin!' }]);
      const pt = this.interact.find((i) => i.type === 'party'), al = this.interact.find((i) => i.type === 'album');
      if (pt && al) { this.camOverride = { x: (pt.x + al.x) / 2, z: 3, t: 999 }; this.pointAt([[pt.x, pt.z - 4.4, 8.4], [al.x, al.z - 2.2, 5.2]]); await this.say([{ who: K, text: 'Dit is het FEESTBORD: een bordspel voor ' + (nPlayers() === 3 ? 'drie' : 'twee') + ', met duels erin! En daar het VRIENDENBOEK van de Deurman. Als je genoeg stickers hebt, gebeurt er iets geheimzinnigs. Met een deur.' }]); }
      const pl = this.interact.find((i) => i.type === 'plan'); if (pl) { this.camOverride = { x: pl.x, z: pl.z - 2, t: 999 }; this.pointAt([[pl.x, pl.z - 2, 5.6]]); }
      await this.say([{ who: K, text: 'Op het BOUWPLAN zie je welke hallen er komen. Linksonder zie je jullie rang: hoe meer jullie spelen, hoe hoger. En het dorp heeft ook nog karweitjes, via de uitgang!' }]);
      this.pointOff(); this.camOverride = null;
    }
    this.pointOff(); this.camOverride = null; this.noAct = false; const g = this.app.games.tugwar;
    if (g) {
      const c2 = await this.choose('Eerste duel?', ['Touwtrekken!', 'Later, ik kijk eerst rond'], 'Touwtrekken is een lekker vriendelijk spel om mee te beginnen.');
      if (c2 === 0) { await this.say([{ who: K, text: 'Touwtrekken! Het enige spel waarbij trekken wél mag. Veel succes, en niet loslaten!' }]); await this.launch('tugwar'); }
    }
    this.busy = false; input.reset();
  }
  // Het Grote Slotfeest (einde): alleen als de rang Speelhal-Legende is bereikt
  async slotfeest() {
    const c = await this.choose('🎉 Het Grote Slotfeest?', ['Feest!', 'Nog niet'], 'Een feest met iedereen uit de Speelhal. Daarna kun je gewoon doorspelen.');
    if (c !== 0) return;
    this.leaving = true; TOURNEY = null; await ui.fade(1, 600); persist(); this.app.goEnding({}); await new Promise(() => {});
  }
  async pauseMenu() {
    if (this.busy) return; this.busy = true; ui.hud.setPrompt(null);
    try {
      for (;;) {
        const r = rank();
        const c = await this.choose('Pauze', ['Doorgaan', '🏗️ Rang & Bouwplan', '🎲 Feestbord (Mario Party)', '📒 Deurman-vriendenboek', '👒 Hoeden & kleuren', 'Instellingen', '🌐 Online spelen', 'Naar het titelscherm'], `${r.icon} ${r.name}${r.next ? ` · ${r.points}/${r.next.at} punten` : ''} · 🪙 ${S.coins}`, true);
        if (c === 0 || c == null) break;
        if (c === 1) await this.planModal();
        else if (c === 2) { await this.partyMenu(); if (this.leaving) break; }
        else if (c === 3) await this.album();
        else if (c === 4) await this.openShop();
        else if (c === 5) {
          const n0 = nPlayers(); await new Promise((res) => openSettings(res));
          if (nPlayers() !== n0) { this.leaving = true; TOURNEY = null; await ui.fade(1, 500); persist(); this.app.goArcade({ extra: { hall: this.hallId } }); await new Promise(() => {}); }   // Juul aan/uit: hal opnieuw opbouwen
        }
        else if (c === 6) await new Promise((res) => openOnline(this.app, res));
        else if (c === 7) { this.leaving = true; TOURNEY = null; await ui.fade(1, 500); persist(); await this.app.goMenu(); ui.fade(0, 500); await new Promise(() => {}); }
      }
    } finally { if (!this.leaving) { this.busy = false; input.reset(); } }
  }

  cabTexture(id, glitch = false) {
    const def = this.defOf(id); const hue = (id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
    return canvasTex(256, 192, (g, w, hh) => {
      if (glitch) { drawScareFace(g, w, hh, 0.4, 0.5); return; }
      const gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, `hsl(${hue},80%,45%)`); gr.addColorStop(1, `hsl(${(hue + 60) % 360},85%,25%)`); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      g.fillStyle = 'rgba(255,255,255,.1)'; for (let y = 0; y < hh; y += 6) g.fillRect(0, y, w, 2);
      g.font = '84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(def.icon || PIC[id] || '🎮', w / 2, 76);
      g.font = 'bold 26px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#2a0a50'; g.lineWidth = 6; g.strokeText(def.name || NAME[id], w / 2, 150, w - 16); g.fillText(def.name || NAME[id], w / 2, 150, w - 16);
    });
  }
  buildCabinets() {
    const sc = this.scene; const D = this.D; const neon = this.hallId === 1;
    this.zoneSigns = [];
    this.zones.forEach((z, zi) => {
      const rf = SPORT_RUGS[z.rug] || DEUR_RUGS[z.rug]; const rt = rf ? rf(z.color, z.color2, z.name) : rugTexture(z.rug, z.color, z.color2, z.name);
      const rm = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.9, emissive: neon ? 0xffffff : 0x000000, emissiveMap: neon ? rt : null, emissiveIntensity: neon ? 0.5 : 0 });
      sc.add(mesh(new THREE.CircleGeometry(z.R, 48), rm, { cast: false, pos: [z.cx, 0.03, z.cz], rot: [-Math.PI / 2, 0, 0] }));
      // looplichtjes langs de rand van het kleed
      for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; D.disc(0.2, z.cx + Math.cos(a) * (z.R - 0.55), 0.06, z.cz + Math.sin(a) * (z.R - 0.55), i % 2 ? z.color : z.color2, { kind: 'p' + (i % 3) }, 8); }
      const sg = zoneSign(z); const front = z.cz > 5; sg.position.set(z.cx, front ? 10.2 : 12.2, front ? z.cz - 3 : z.cz - 6.5); sc.add(sg); this.zoneSigns.push(sg); z.sign = sg;   // voorste zones: lager, zodat het bord niet over de achterste zones hangt
      (ZONE_PROPS[z.prop] || (() => {}))(this, D, z);
      z.cabs.forEach((c, n) => this.addCab(c, z, zi * 3 + n, n));
    });
    this.refreshLabels();
  }
  addCab(c, z, k, n) {
    const sc = this.scene, D = this.D, id = c.id; const fair = this.hallId === 2;
    const trim = fair ? [0xe8372c, 0x2f9be0, 0xffa030, 0xb05aff][k % 4] : this.theme.trim[k % 6];
    let spec;
    D.at(c.x, 0, c.z, c.yaw, () => {
      if (this.hallId === 3) spec = (SPORT_CABS[id] || SPORT_CABS.default)(D, trim);
      else if (this.hallId === 4) spec = (DOOR_CABS[id] || DOOR_CABS.default)(D, trim);
      else if (fair) spec = (STALLS[id] || STALLS.default)(D, trim);
      else if (z.tableIds.includes(id)) spec = cabTable(D, trim);
      else if (z.style === 'sit') spec = cabSit(D, trim);
      else spec = cabUpright(D, trim, [0x2a1a46, 0x1d2a52, 0x3a1a3a, 0x1a3a3a][k % 4]);
    });
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw; sc.add(g);
    const S2 = spec.scr; const scr = new THREE.Mesh(new THREE.PlaneGeometry(S2.w, S2.h), new THREE.MeshBasicMaterial({ map: this.cabTexture(id) })); scr.position.set(S2.x, S2.y, S2.z); scr.rotation.x = S2.rx; g.add(scr);
    const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
    for (const [dx, dz, r] of spec.hit) this.colliders.push({ x: c.x + dx * cs + dz * sn, z: c.z - dx * sn + dz * cs, r });
    const ix = c.x + sn * spec.ix, iz = c.z + cs * spec.ix;
    D.ring(0.95, 1.45, ix, 0.07, iz, z.color, { kind: 'p' + (k % 3) }, 20);
    this.cabs.push({ id, g, scr, lbl: null, x: c.x, z: c.z, side: 0, ix, iz, ly: spec.lblY + (n % 2 ? 0.7 : 0), zone: z });
    this.interact.push({ type: 'cab', id, x: ix, z: iz, r: 3.2, label: `${this.defOf(id).name || NAME[id]} spelen` });
  }
  refreshLabels() {
    for (const c of this.cabs) {
      const gm = S.arcade.byGame[c.id]; const kg = gm ? topOf(gm.wins) : []; const sub = !supports(this.app.games[c.id]) ? (this.app.games[c.id].players.includes(3) ? '(alleen met 3 spelers)' : '(alleen met 2 spelers)') : this.isOff(c.id) ? '(uit het toernooi)' : gm ? `${kg.length === 1 ? '👑' + pname(kg[0])[0] + ' ' : ''}${activeIds().map((i) => gm.wins[i] || 0).join(' – ')}` : (this.games.includes(c.id) ? 'NIEUW!' : 'binnenkort');
      if (c.lbl) { this.scene.remove(c.lbl); c.lbl.material.map && c.lbl.material.map.dispose(); c.lbl.material.dispose(); }
      const lbl = floatLabel(`${this.defOf(c.id).icon || PIC[c.id]} ${this.defOf(c.id).name || NAME[c.id]}`, sub, '#ffe14a'); lbl.scale.set(4.0, 1.24, 1); lbl.position.set(c.x, c.ly, c.z); this.scene.add(lbl); c.lbl = lbl;
    }
  }
  drawWheel() {
    const ids = this.hall.ids; const N = ids.length;
    const c = this.wheelCanvas || (this.wheelCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 })); const g = c.getContext('2d');
    for (let i = 0; i < N; i++) {
      const off = this.isOff(ids[i]);
      const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; g.fillStyle = off ? '#555' : `hsl(${(i * 47) % 360},75%,${i % 2 ? 48 : 58}%)`; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, a0, a1); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      const am = (a0 + a1) / 2; g.save(); g.translate(256 + Math.cos(am) * 170, 256 + Math.sin(am) * 170); g.rotate(am + Math.PI / 2); g.font = (N > 16 ? 52 : 62) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = off ? 0.35 : 1; g.fillText(this.defOf(ids[i]).icon || PIC[ids[i]] || '🎮', 0, 0); g.restore();
    }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(256, 256, 34, 0, TAU); g.fill(); g.fillStyle = '#7a2fd4'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 256, 258);
    if (this.wheelTex) this.wheelTex.needsUpdate = true;
  }
  buildCenter() {
    const sc = this.scene; const D = this.D; const id = this.hallId; const CZ = 3;
    const C = [{ r: 3.5, y: 2.9, hit: 5.7 }, { r: 3.1, y: 1.8, hit: 3.7 }, { r: 3.9, y: 0.95, hit: 4.7 }, { r: 3.4, y: 2.05, hit: 5.0 }, { r: 3.3, y: 2.0, hit: 4.6 }][id];
    this.centerZ = CZ; this.drawWheel();
    const wt = this.wheelTex = new THREE.CanvasTexture(this.wheelCanvas); wt.colorSpace = THREE.SRGBColorSpace;
    this.wheel = new THREE.Group(); this.wheel.userData.dynamic = true;
    const gold = mat(0xffd23f, { metalness: 0.6 });
    this.wheelDisc = mesh(new THREE.CylinderGeometry(C.r, C.r, 0.4, 40), [gold, new THREE.MeshStandardMaterial({ map: wt, roughness: 0.4 }), gold], { pos: [0, C.y, 0] });
    this.wheel.add(this.wheelDisc);
    this.wheelPtr = mesh(new THREE.ConeGeometry(0.5, 1.4, 4), mat(0xd8372c), { pos: [0, C.y + 0.8, C.r + 0.3], rot: [Math.PI / 2 + 0.3, 0, 0] }); this.wheel.add(this.wheelPtr);
    this.wheel.add(mesh(new THREE.TorusGeometry(C.r + 0.15, 0.16, 6, 40), glow(0xffe14a, 1.0), { cast: false, pos: [0, C.y + 0.2, 0], rot: [Math.PI / 2, 0, 0] }));
    this.wheel.position.set(0, 0, CZ); sc.add(this.wheel);
    this.colliders.push({ x: 0, z: CZ, r: C.hit });
    this.wheelLabel = floatLabel('🎡 Wiel van Gekte', 'draai en laat het lot kiezen', '#ff9aef'); this.wheelLabel.position.set(0, C.y + (id === 2 ? 5.6 : 3.7), CZ); sc.add(this.wheelLabel);
    const wz = CZ + C.hit + 1.3; this.interact.push({ type: 'wheel', x: 0, z: wz, r: 3.3, label: 'Draai aan het Wiel van Gekte' });
    this.wheelC = C;
    if (id === 0) {   // fontein met het Wiel op een sokkel
      D.cyl(5.3, 5.5, 0.9, 28, 0, 0.45, CZ, 0xb8aec8); D.tor(5.4, 0.22, 0, 0.92, CZ, 0xe8b82a, { kind: 'metal', rx: Math.PI / 2 }, 28); D.cyl(5.0, 5.0, 0.1, 28, 0, 0.5, CZ, 0x6a8ab8);
      D.cyl(1.4, 1.9, 2.0, 12, 0, 1.45, CZ, 0xcfc4e0); D.tor(1.5, 0.16, 0, 2.45, CZ, 0xe8b82a, { kind: 'metal', rx: Math.PI / 2 }, 14); D.cyl(2.3, 2.5, 0.5, 14, 0, 0.8, CZ, 0xb8aec8);
      this.nozzles = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; const nx = Math.cos(a) * 4.3, nz = CZ + Math.sin(a) * 4.3; D.cyl(0.16, 0.24, 0.5, 6, nx, 1.1, nz, 0xe8b82a, { kind: 'metal' }); this.nozzles.push({ x: nx, y: 1.4, z: nz, dx: -Math.cos(a), dz: -Math.sin(a) }); }
      for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 1.6 + (i % 4) * 0.7; D.cyl(0.2, 0.2, 0.04, 8, Math.cos(a) * r, 0.58, CZ + Math.sin(a) * r, 0xffd23f, { kind: 'glow' }); }
      const wm = new THREE.MeshBasicMaterial({ map: tex.water(4, 4), transparent: true, opacity: 0.8, depthWrite: false }); this.waterMat = wm;
      sc.add(mesh(new THREE.CircleGeometry(5.0, 32), wm, { cast: false, receive: false, pos: [0, 0.72, CZ], rot: [-Math.PI / 2, 0, 0] }));
    } else if (id === 1) {   // draaitafel-wiel midden in de lichtshow-dansvloer
      D.cyl(1.2, 1.7, 1.7, 12, 0, 0.85, CZ, 0x10162c); D.tor(1.3, 0.14, 0, 1.5, CZ, 0x00e5ff, { kind: 'p0', rx: Math.PI / 2 }, 16); D.tor(1.75, 0.14, 0, 0.12, CZ, 0xff2bd6, { kind: 'p1', rx: Math.PI / 2 }, 20);
      const n = 8, tw = 2.0; const g = new THREE.PlaneGeometry(tw - 0.12, tw - 0.12); g.rotateX(-Math.PI / 2);
      this.led = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), n * n); this.led.frustumCulled = false; this.led.userData.cells = [];
      D.box(n * tw + 0.5, 0.06, n * tw + 0.5, 0, 0.03, CZ, 0x05081a);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = (i - (n - 1) / 2) * tw, z = CZ + (j - (n - 1) / 2) * tw; this.led.setMatrixAt(i * n + j, new THREE.Matrix4().makeTranslation(x, 0.075, z)); this.led.setColorAt(i * n + j, new THREE.Color(0x101830)); this.led.userData.cells.push([i, j]); }
      this.led.instanceColor.needsUpdate = true; sc.add(this.led);
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; }
      // truss met bewegende spots boven de dansvloer
      const gz = -5.6; for (const sx of [-1, 1]) { D.cyl(0.18, 0.22, 11.4, 6, sx * 9.4, 5.7, gz, 0x555566, { kind: 'metal' }); D.box(0.9, 0.3, 0.9, sx * 9.4, 0.15, gz, 0x333344); }
      D.box(19.2, 0.3, 0.3, 0, 11.4, gz, 0x555566, { kind: 'metal' }); D.box(19.2, 0.3, 0.3, 0, 10.8, gz, 0x555566, { kind: 'metal' });
      this.beams = []; const bc = [0xff2bd6, 0x00e5ff, 0x7bff00, 0xffe14a, 0xb05aff];
      bc.forEach((c, i) => { const bx = -6.4 + i * 3.2; D.cyl(0.35, 0.28, 0.5, 8, bx, 10.7, gz, 0x222233); D.sph(0.18, bx, 10.4, gz, c, { kind: 'glow' }, 6);
        const gr = new THREE.Group(); gr.position.set(bx, 10.5, gz); const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 12.5, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.position.y = -6.25; gr.add(cone); sc.add(gr); this.beams.push({ gr, ph: i * 1.3 }); });
    } else if (id === 3) { sportCenter(this, D, CZ, C);
    } else if (id === 4) { deurCenter(this, D, CZ, C);
    } else {   // draaimolen van gekte: het Wiel is het draaiende platform
      const wd = this.wheelDisc; const R = new Deco();
      const hc = [0xff7ab0, 0x5ad8ff, 0xffd23f, 0x7bff7b, 0xb05aff, 0xff8a1c];
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, r = 2.55; R.at(Math.sin(a) * r, 0.2, Math.cos(a) * r, a + Math.PI / 2, () => { const c = hc[i];
        R.cyl(0.05, 0.05, 3.6, 5, 0, 1.8, 0, 0xffd23f, { kind: 'metal' });
        R.box(0.55, 0.5, 1.2, 0, 1.4, 0, c); R.box(0.4, 0.7, 0.4, 0, 1.8, 0.55, c, { rx: -0.4 }); R.box(0.36, 0.34, 0.5, 0, 2.15, 0.85, c); R.box(0.1, 0.4, 0.1, 0, 1.75, -0.65, 0xf6f0e0, { rx: 0.4 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) R.box(0.12, 0.6, 0.12, sx * 0.18, 0.95, sz * 0.4, c);
        R.box(0.5, 0.06, 0.8, 0, 1.12, 0, 0xffd23f); R.sph(0.1, 0, 3.5, 0, 0xfff0a0, { kind: 'p' + (i % 3) }, 6); }); }
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; R.sph(0.17, Math.sin(a) * (C.r - 0.25), 0.28, Math.cos(a) * (C.r - 0.25), 0xfff0a0, { kind: 'p' + (i % 3) }, 6); }
      this.carouselDeco = R.build(wd);
      // vast: middenpaal en een open dakje (zo blijven de paardjes vanuit de lucht zichtbaar) + lampjes
      D.cyl(0.35, 0.4, 5.6, 8, 0, 2.8, CZ, 0xffd23f, { kind: 'metal' });
      for (let i = 0; i < 12; i++) D.add(new THREE.ConeGeometry(2.4, 1.5, 3, 1, true, i * TAU / 12, TAU / 12), i % 2 ? 0xf6f0e0 : 0xd8372c, 0, 6.3, CZ, { kind: 'dbl' });
      D.cyl(2.4, 2.4, 0.14, 24, 0, 5.55, CZ, 0xffd23f, { kind: 'metal' }); D.sph(0.3, 0, 7.2, CZ, 0xffd23f, { kind: 'glow' }, 8); D.cyl(0.04, 0.04, 1.0, 4, 0, 7.6, CZ, 0xcfa060); D.tri(1.0, 0.6, 0.5, 8.0, CZ, 0xd8372c, { kind: 'dbl', rz: Math.PI / 2 });
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; D.sph(0.2, Math.sin(a) * 2.35, 5.35, CZ + Math.cos(a) * 2.35, [0xffd23f, 0xff7ab0, 0x7be0ff][i % 3], { kind: 'p' + (i % 3) }, 6); }
      D.cyl(4.2, 4.4, 0.35, 24, 0, 0.18, CZ, 0x7a2fd4); D.cyl(0.8, 0.8, 0.2, 10, 0, 0.95, CZ, 0xffd23f, { kind: 'metal' });
    }
  }
  buildBack() {
    const sc = this.scene; const D = this.D; const zb = -HALL.d / 2; this.hostZ = zb + 3.7;
    // troon + koning
    const gold = 0xe8b82a;
    if (this.hallId === 0) {
      D.box(5, 1.4, 4, 0, 0.7, zb + 3.5, 0x7a2fd4); D.box(2.6, 0.5, 2.2, 0, 1.65, zb + 3.5, gold, { kind: 'metal' }); D.box(2.6, 4.2, 0.5, 0, 3.7, zb + 2.5, gold, { kind: 'metal' });
      D.cone(0.4, 1.0, 5, -1.1, 6.2, zb + 2.5, gold, { kind: 'metal' }); D.cone(0.4, 1.0, 5, 1.1, 6.2, zb + 2.5, gold, { kind: 'metal' }); D.sph(0.25, 0, 6.1, zb + 2.5, 0xd8372c, { kind: 'p1' }, 6);
      this.colliders.push({ x: 0, z: zb + 3.5, r: 3.2 });
      for (const sx of [-1, 1]) { D.box(2.4, 9.5, 0.15, sx * 3.3, 8.6, zb + 0.4, 0x7a2fd4); D.box(2.7, 0.3, 0.2, sx * 3.3, 13.5, zb + 0.4, gold, { kind: 'metal' }); D.tri(2.4, 1.6, sx * 3.3, 3.9, zb + 0.4, 0x7a2fd4, { kind: 'dbl' }); D.sph(0.5, sx * 3.3, 9.2, zb + 0.5, gold, { kind: 'metal' }, 8); }
      this.king = makeNPC('captain', { hat: 'crown', hatColor: 0xffd23f, beard: 'full', hair: 0xf0f0f0, beardColor: 0xf0f0f0, cape: 0x7a2fd4, shirt: 0xd8357f, sleeve: 0xd8357f, scale: 1.25, bodyW: 1.5 });
      this.king.group.position.set(0, 1.9, zb + 3.7);
    } else if (this.hallId === 2) {   // kassa-kraam van Kermis-Kees
      D.box(7, 2.2, 3, 0, 1.1, zb + 3.5, 0xe8372c); D.box(7.4, 0.3, 3.4, 0, 2.3, zb + 3.5, 0xf6f0e0);
      for (let i = 0; i < 7; i++) D.box(1.0, 0.12, 2.2, -3 + i, 5.6, zb + 3.7, i % 2 ? 0xf6f0e0 : 0xe8372c, { rx: 0.35, kind: 'dbl' });
      for (const sx of [-1, 1]) D.cyl(0.12, 0.12, 5.4, 6, sx * 3.4, 2.7, zb + 4.7, 0xcfa060);
      for (let i = 0; i < 8; i++) D.sph(0.13, -3.2 + i * 0.9, 4.95, zb + 5.1, 0xfff0a0, { kind: 'p' + (i % 3) }, 5);
      this.colliders.push({ x: 0, z: zb + 3.5, r: 3.4 });
      this.king = makeNPC('innkeeper', { scale: 1.25 }); this.king.group.position.set(0, 0.2, zb + 2.4);
    } else if (this.hallId === 3) { sportBack(this, D, zb);
    } else if (this.hallId === 4) { deurBack(this, D, zb);
    } else {   // DJ-booth in de Neonkelder
      D.box(7, 1.8, 3, 0, 0.9, zb + 3.5, 0x10162c); D.box(7.2, 0.15, 3.2, 0, 1.85, zb + 3.5, 0x00e5ff, { kind: 'p0' });
      for (const sx of [-1, 1]) { D.cyl(0.9, 0.9, 0.18, 18, sx * 2, 1.95, zb + 3.9, 0x222222); D.cyl(0.3, 0.3, 0.2, 12, sx * 2, 2.0, zb + 3.9, sx > 0 ? 0xff2bd6 : 0x7bff00, { kind: 'p' + (sx > 0 ? 1 : 2) }); }
      this.colliders.push({ x: 0, z: zb + 3.5, r: 3.4 });
      this.king = makeNPC('jester', { scale: 1.25 });
      this.king.group.position.set(0, 0.2, zb + 2.4);
    }
    this.king.yaw = this.king.targetYaw = 0; this.king.pose = 'idle'; sc.add(this.king.group);
    const kl = floatLabel(this.H.label, 'toernooi & regels', '#ffe14a'); kl.position.set(0, this.hallId === 4 ? 9.0 : 7.5, zb + 3.7); sc.add(kl);
    this.interact.push({ type: 'king', x: 0, z: zb + 9.2, r: 5, label: `Praten met ${this.hostName}` });
    // scorebord
    const k0 = this.hallId === 0 ? 0.8 : 1, BX = this.hallId === 0 ? -21.6 : -17, TX = this.hallId === 0 ? 21.8 : 17;   // hal 0: bord en kast smaller, zodat er vier deuren in de achtermuur passen
    this.boardTex = null; this.board = mesh(new THREE.PlaneGeometry(13 * k0, 8 * k0), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [BX, 8, zb + 0.32] }); sc.add(this.board);
    D.box(13.8 * k0, 8.8 * k0, 0.3, BX, 8, zb + 0.1, 0xe8b82a, { kind: 'metal' });
    this.drawBoard();
    this.interact.push({ type: 'board', x: BX, z: zb + 6, r: 5, label: 'Scorebord bekijken' });
    // trofeeënkast
    D.box(14 * k0, 0.4, 2.2, TX, 2.0, zb + 1.6, 0x4a2e17); D.box(14 * k0, 0.4, 2.2, TX, 5.2, zb + 1.6, 0x4a2e17); D.box(14.4 * k0, 7, 0.4, TX, 3.6, zb + 0.5, 0x2a1a10);
    for (const sx of [-1, 1]) D.box(0.4, 7, 2.2, TX + sx * 7.1 * k0, 3.6, zb + 1.6, 0x4a2e17);
    const A = S.arcade; const totalWins = sum(A.wins);
    const defs = [['Eerste Bloed', totalWins >= 1, 0xcd7f32], ['Duelist', totalWins >= 5, 0xc0c0c0], ['Meester', totalWins >= 12, 0xffd23f], ['Legende', totalWins >= 30, 0x5ad8ff], ['Gelijkspel-koning', A.draws >= 4, 0xff9aef], ['Toernooi-winnaar', sum(A.tourneys) >= 1, 0xffd23f], ['Allesspeler', Object.keys(A.byGame).length >= 8, 0x7bff7b], ['Rivaliteit', A.plays >= 20, 0xff5a5a]];
    this.trophies = [];
    defs.forEach(([name, got, c], i) => {
      const row = Math.floor(i / 4), colI = i % 4; const tx = TX - 5.2 * k0 + colI * 3.5 * k0, ty = 2.3 + row * 3.2, k = got ? 'metal' : 'lit', cc = got ? c : 0x555555;
      D.at(tx, ty, zb + 1.6, 0, () => { D.cyl(0.5, 0.25, 0.9, 10, 0, 0.6, 0, cc, { kind: k }); D.cyl(0.2, 0.2, 0.4, 8, 0, 0.1, 0, cc, { kind: k }); D.box(0.8, 0.12, 0.8, 0, -0.1, 0, cc, { kind: k }); for (const sx of [-1, 1]) D.tor(0.3, 0.06, sx * 0.55, 0.65, 0, cc, { kind: k, rz: sx > 0 ? -Math.PI / 2 : Math.PI / 2 }, 8, Math.PI); if (got) D.sph(0.14, 0, 1.25, 0, 0xffffff, { kind: 'p' + (i % 3) }, 5); });
    });
    for (let r = 0; r < 2; r++) {   // naamplaatjes per rij: een texture per plank
      const nt = canvasTex(1024, 128, (g, w, hh) => { g.textAlign = 'center'; g.textBaseline = 'middle'; for (let c2 = 0; c2 < 4; c2++) { const [name, got] = defs[r * 4 + c2]; g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = 'rgba(25,10,35,.95)'; const tx = w / 8 + c2 * w / 4; g.strokeText(got ? name : '???', tx, 48, w / 4 - 12); g.fillStyle = got ? '#ffe14a' : '#9a9a9a'; g.fillText(got ? name : '???', tx, 48, w / 4 - 12); if (!got) { g.font = 'bold 28px Fredoka, Arial'; g.fillStyle = '#bbb'; g.fillText('nog niet gehaald', tx, 96, w / 4 - 12); } } });
      sc.add(mesh(new THREE.PlaneGeometry(14 * k0, 1.75), new THREE.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false }), { cast: false, receive: false, pos: [TX, 4.2 + r * 3.2, zb + 2.8], rot: [-0.2, 0, 0] }));
    }
    this.interact.push({ type: 'trophies', x: TX, z: zb + 6.5, r: 5, label: 'Trofeeën bekijken' });
    if (this.hallId === 0) this.buildPlan();
  }
  // Feestbord-tafel + Vriendenboek (hal 0), Vriendenboek + zwevende deuren (Deurenhal)
  buildExtras() {
    if (this.hallId === 0) { buildPartyTable(this, 9.2, -10.2); buildAlbumStand(this, -7.4, 14.4); }
    else if (this.hallId === 3) this.hx = new SportHall(this);
    else if (this.hallId === 4) { buildAlbumStand(this, 7.5, 14.2); this.hx = new DeurHall(this); }
    refreshAlbum(this);
  }
  album() { return openAlbum(); }
  // Feestbord (Mario Party): keuzekaart, daarna naar het bord (board.js)
  async partyMenu() {
    for (;;) {
      const c = await this.choose('🎲 Feestbord (Mario Party)', ['🎲 Feestbord starten!', 'Hoe werkt het?', 'Terug'], `Een bordspel voor ${nPlayers() === 3 ? 'drie' : 'twee'}: dobbelen, muntjes pakken, trofeeën jagen — met duels uit de hallen tussendoor!`);
      if (c === 1) { await this.say([{ who: this.hostName, text: 'Jullie dobbelen om de beurt en lopen over het bord. Op vakjes pak je muntjes, krijg je pech of volgt er een DUEL. Wie na de laatste ronde de meeste trofeeën heeft, wint het Feestbord. En jullie pionnen? Die doen alsof ze het snappen.' }]); continue; }
      if (c !== 0) return;
      this.leaving = true; TOURNEY = null; audio.sfx('powerup'); await ui.fade(1, 450); persist(); this.app.goBoard({}); await new Promise(() => {});
    }
  }
  drawBoard() {
    const A = S.arcade; const ids = activeIds(); const W3 = ids.length === 3;
    const t = canvasTex(1024, 630, (g, w, hh) => {
      const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#1a0a3a'); gr.addColorStop(1, '#3a1a6a'); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      g.textAlign = 'center'; g.fillStyle = '#ffe14a'; g.font = 'bold 64px MedievalSharp, serif'; g.fillText('SCOREBORD', w / 2, 80);
      const tl = ids.map((i) => (A.tourneys[i] || 0)).join(' – ');
      if (!W3) {
        g.font = 'bold 54px Fredoka, sans-serif'; g.fillStyle = LABEL_CSS[0]; g.fillText(pname(0), 230, 175); g.fillStyle = LABEL_CSS[1]; g.fillText(pname(1), 794, 175);
        g.font = 'bold 190px Fredoka, sans-serif'; g.fillStyle = LABEL_CSS[0]; g.fillText(String(A.wins[0] || 0), 230, 360); g.fillStyle = LABEL_CSS[1]; g.fillText(String(A.wins[1] || 0), 794, 360); g.fillStyle = '#fff'; g.font = 'bold 90px Fredoka'; g.fillText('–', 512, 330);
      } else {   // drie kolommen: Wes, Jor, Juul
        ids.forEach((i, k) => { const cx = 190 + k * 322; g.font = 'bold 54px Fredoka, sans-serif'; g.fillStyle = LABEL_CSS[i]; g.fillText(pname(i), cx, 175); g.font = 'bold 170px Fredoka, sans-serif'; g.fillText(String(A.wins[i] || 0), cx, 345); });
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(350, 120, 4, 250); g.fillRect(672, 120, 4, 250);
      }
      g.textAlign = 'center'; g.font = '34px Fredoka, sans-serif'; g.fillStyle = '#d8c8ff'; g.fillText(`${A.plays} duels gespeeld · ${A.draws} gelijkspel · toernooien: ${tl}`, w / 2, 430);
      const best = Object.entries(A.byGame).sort((a, b) => b[1].plays - a[1].plays).slice(0, 3);
      g.font = '30px Fredoka, sans-serif'; g.fillStyle = '#fff'; best.forEach(([id, v], i) => g.fillText(`${this.defOf(id).icon || PIC[id] || ''} ${this.defOf(id).name || NAME[id] || id}: ${ids.map((k) => (v.wins[k] || 0)).join(' – ')}`, w / 2, 490 + i * 42));
      if (!best.length) g.fillText('Nog geen duels gespeeld. Kies een kast!', w / 2, 500);
    });
    this.board.material.map = t; this.board.material.needsUpdate = true;
  }

  // ------------------------------------------------------------------ start / stop
  async enter() {
    ui.hud.reset(); this.hudSetup(); audio.music(this.hallId === 4 ? 'deurparty' : 'concert'); this.refreshHud(); ui.hudEl.append(this.deur.bar);
    if (this.deur.takeover) { audio.music('deurparty'); ui.hud.setHint('Deurenfeestje! De Deurman is DJ geworden. Speel één feest-duel om de hal terug te winnen!'); }
    ui.fade(0, 600);
    const o = this.opts;
    if (o.intro && !o.result) await this.introTutorial();
    else if (o.result && o.result.pvp) await this.afterDuel(o.result);
    else if (o.result === null && TOURNEY) { TOURNEY = null; ui.hud.toast('Toernooi afgebroken.', 2200); }
    else if (o.via === 'door' && !S.flags['met_hall' + this.hallId] && HALL_INTRO[this.hallId]) { this.busy = true; S.flags['met_hall' + this.hallId] = true; await ui.say(HALL_INTRO[this.hallId]); this.busy = false; }
    else if (!S.flags.met_king) { this.busy = true; S.flags.met_king = true; S.flags.intro_done = true; await ui.say([{ who: 'Koning Klopper', text: 'WELKOM in mijn Speelhal! Hier winnen jullie heitjes met duels, en met die heitjes laat je nieuwe hallen bouwen. Zo werkt dat hier.' }, { who: 'Koning Klopper', text: 'Elk duel krijgt een TWIST: soms loop je achterstevoren, soms ruil je van lichaam, en soms staat de Deurman te zwaaien. Wie dan beweegt, verliest.' }, { who: 'Wes', text: 'Ik ga zo hard winnen.' }, { who: 'Jor', text: 'Dat dacht je.' }, ...(nPlayers() === 3 ? [{ who: 'Juul', text: 'Ik ook. En ik wil de mooiste hoed.' }] : [])]); this.busy = false; }
    await this.checkRankUp();
    if (this.sec && !this.sec.opened && isUnlocked(4) && !S.settings.unlockAll && !this.leaving) await this.sec.unlockAnim();
    if (!o.result && !o.intro && !dailyDone() && !this.deur.takeover) setTimeout(() => { if (!this.leaving) ui.hud.toast(`🌟 Uitdaging van de dag wacht bij ${this.hostName}! Bonus: +${dailyBonus()} heitjes`, 4200); }, 2500);
  }
  exit() { this.deur && this.deur.cleanup(); try { disposeObject(this.scene); this.fx.dispose(); } catch (e) { console.warn('opruimen speelhal', e); } ui.clearScreens(); ui.activeMenus = []; ui.hudEl.innerHTML = ''; ui.setVignette(0); }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }
  hudSetup() { ui.hud.setHint(`Loop naar een kast en druk op je actieknop om te duelleren · Wiel van Gekte = verrassing · ${this.hostName} = toernooi` + (this.hallId === 0 ? ' · dichtgetimmerde deuren = nieuwe hallen bouwen!' : '') + ' · Esc = pauze'); setTimeout(() => ui.hud.setHint(null), 14000); }
  // 3 spelers + 'winnaar blijft': rechtsonder staat wie er aan de beurt is en wie wacht
  refreshQueueHud() {
    const q = getDQ(); const on = !!q && S.arcade.queueMode !== 'pick';
    if (!on) { if (this.queueEl) { this.queueEl.remove(); this.queueEl = null; } return; }
    if (!this.queueEl || !this.queueEl.isConnected) { this.queueEl = h('div', { class: 'hud-quest', style: { left: 'auto', right: '12px', maxWidth: '260px' } }); ui.hudEl.append(this.queueEl); }
    const pr = q.next(), wt = q.waiting();
    this.queueEl.innerHTML = `<h4>Winnaar blijft</h4><div>Aan de beurt: <b style="color:${pcss(pr[0])}">${pname(pr[0])}</b> vs <b style="color:${pcss(pr[1])}">${pname(pr[1])}</b></div><div style="font-size:13px;opacity:.85">${wt.map(pname).join(' en ')} wacht</div>`;
  }
  refreshHud() {
    const A = S.arcade; this.refreshRankHud(); this.refreshQueueHud(); this.refreshDoors(); refreshAlbum(this);
    const ids = activeIds();
    ui.hud.setScore(`Stand: ${ids.length === 3 ? standTxt(A.wins, ids, ' · ') : `${pname(0)} ${A.wins[0] || 0} – ${A.wins[1] || 0} ${pname(1)}`}   ·   🪙 ${S.coins}` + (TOURNEY ? `   ·   🏆 Toernooi ${TOURNEY.idx + 1}/${TOURNEY.queue.length}: ${ids.map((i) => TOURNEY.score[i] || 0).join(' – ')}` : ''));
    for (const i of ids) ui.hud.setPlayerInfo(i, `Duels gewonnen: ${A.wins[i] || 0}`);
  }

  // ------------------------------------------------------------------ dialoog-hulp
  async say(lines, o) { await ui.say(lines, o); }
  choose(title, labels, sub, center = false, sel0 = 0) {
    return new Promise((resolve) => {
      const items = labels.map((l, i) => ({ label: l, onSelect: () => { this.menu = null; el.remove(); resolve(i); } }));
      const menu = new Menu3(items); menu.sel = sel0; menu.render(); this.menu = menu;
      const card = h('div', { class: 'card', style: { width: 'min(560px,92vw)' } }, h('h2', { style: { fontSize: '28px' } }, title), sub ? h('p', { style: { textAlign: 'center' } }, sub) : null, menu.el);
      const el = ui.overlay(card, center ? '' : 'clear'); if (!center) { el.style.alignItems = 'flex-end'; el.style.paddingBottom = '200px'; el.style.background = 'none'; el.style.backdropFilter = 'none'; }
    });
  }
  cardModal(title, body, note) {
    return new Promise((resolve) => {
      const card = h('div', { class: 'card' }, h('h2', {}, title), body, h('div', { class: 'small-note' }, (note ? note + ' · ' : '') + `Sluiten: ${activeIds().map((i) => klabel(i).a).join(' of ')}`));
      const el = ui.overlay(card); this.modal = { el, resolve, t: 0.25 };
    });
  }

  // ------------------------------------------------------------------ interacties
  async doInteract(it, p) {
    if (this.busy) return; this.busy = true; ui.hud.setPrompt(null);
    try {
      audio.sfx('select');
      if (it.type === 'cab') await this.cab(it.id);
      else if (it.type === 'wheel') await this.wheelSpin();
      else if (it.type === 'king') await this.kingTalk();
      else if (it.type === 'board') { this.drawBoard(); await this.rankModal(); }
      else if (it.type === 'plan') await this.planModal();
      else if (it.type === 'party') await this.partyMenu();
      else if (it.type === 'album') await this.album();
      else if (it.type === 'trophies') await this.cardModal('Trofeeënkast', h('p', { style: { textAlign: 'center' }, html: 'Win duels, speel veel verschillende spellen en win toernooien om trofeeën te verdienen.<br>Eerste Bloed (1 winst) · Duelist (5) · Meester (12) · Legende (30) · Gelijkspel-koning (4 gelijk) · Toernooi-winnaar · Allesspeler (8 spellen) · Rivaliteit (20 duels).' }));
      else if (it.type === 'egg') this.life.doEgg(it);
      else if (it.type === 'exit') await this.leave();
      else if (it.type === 'door') await this.useDoor(it);
    } finally { if (!this.leaving) { this.busy = false; input.reset(); } }
  }
  async cab(id) {
    const def = this.app.games[id];
    if (!def) { await this.say([{ who: 'Koning Klopper', text: 'Die kast is nog kapot. De rekenmeester repareert hem. (Dit spel is nog niet geladen.)' }]); return; }
    if (!supports(def)) { await this.say([{ who: this.hostName, text: def.players && def.players.includes(3) ? 'Dit spel heeft precies drie spelers nodig. Zet Juul aan bij Instellingen!' : 'Dit spel is alleen voor twee spelers. Zet Juul uit bij Instellingen om het te spelen.' }]); return; }
    const gm = S.arcade.byGame[id];
    const c = await this.choose(`${def.icon || ''} ${def.name}`, ['Spelen!', 'Wat doet dit spel?', 'Terug'], gm ? `Stand in dit spel: ${nPlayers() === 3 ? standTxt(gm.wins, activeIds(), ' · ') : `${pname(0)} ${gm.wins[0] || 0} – ${gm.wins[1] || 0} ${pname(1)}`}` : 'Nog nooit gespeeld');
    if (c === 1) { await this.say([{ who: def.giver || this.hostName, text: (def.blurb || '').replace(/<[^>]+>/g, '') }]); return this.cab(id); }
    if (c !== 0) return;
    await this.launch(id);
  }
  // 3 spelers: wie speelt er? Geeft { pair:[a,b], q:bool } of null (terug). Onthoudt de keuze in S.arcade.queueMode.
  async pickPair() {
    const A = S.arcade; const dq = getDQ();
    for (;;) {
      const pr = dq.next(), wt = dq.waiting();
      const c = await this.choose('Wie spelen?', [`🏆 Winnaar blijft: ${pairLabel(pr)}`, '👫 Zelf kiezen', 'Terug'], `Aan de beurt: ${pname(pr[0])} vs ${pname(pr[1])}, ${wt.map(pname).join(' en ')} wacht`, true, A.queueMode === 'pick' ? 1 : 0);
      if (c === 0) { A.queueMode = 'queue'; persist(); return { pair: pr, q: true }; }
      if (c === 1) {
        A.queueMode = 'pick'; persist(); const prs = allPairs(activeIds());
        const c2 = await this.choose('Wie spelen er?', [...prs.map((x) => `${pairLabel(x)}${x[0] === pr[0] && x[1] === pr[1] ? ' (aan de beurt)' : ''}`), 'Terug'], 'Kies het paar. De derde speler kijkt toe en is de volgende.', true);
        if (c2 != null && c2 < prs.length) return { pair: prs[c2], q: false };
        continue;
      }
      return null;
    }
  }
  async launch(id, extra = null, twist = null) {
    if (nPlayers() === 3 && !(extra && extra.players)) {   // met drie spelers: 3-speler-spel = iedereen, anders eerst kiezen wie er speelt
      if (wantsAll(this.app.games[id])) extra = { ...(extra || {}), players: [0, 1, 2] };
      else { const sel = await this.pickPair(); if (!sel) return; extra = { ...(extra || {}), players: sel.pair, q: sel.q }; }
    }
    this.leaving = true; audio.sfx('powerup'); await ui.fade(1, 450); persist();
    if (this.deur.takeover) { extra = { ...(extra || {}), spooky: true }; twist = 'deurman'; }   // de Deurman heeft de hal: elk duel is een spookduel
    this.app.playGame(id, { back: 'arcade', twist, extra: { ...(extra || {}), hall: this.hallId } });
    await new Promise(() => {});
  }
  // Ranglijst per spel: wie is de koning van elk duel?
  async rankModal() {
    const A = S.arcade; const ids = activeIds(); const rows = [];
    for (const hl of ARCADE_HALLS) for (const id of hl.ids) { const g = A.byGame[id]; if (g && g.plays) rows.push({ id, hall: hl.name, g }); }
    rows.sort((x, y) => y.g.plays - x.g.plays);
    const unplayed = ARCADE_IDS.filter((id) => this.app.games[id] && !(A.byGame[id] && A.byGame[id].plays)).length;
    const crown = (g) => { const t = topOf(g.wins, ids); return t.length === 1 ? `👑 ${pname(t[0])}` : '🤝'; };   // koning van het spel = hoogste aantal winsten
    const th = ids.map((i) => `<th${ids.length === 3 ? ` style="color:${pcss(i)}"` : ''}>${pname(i)}</th>`).join('');
    const tbl = h('table', { class: 'ranktbl', html: `<tr><th>Spel</th>${th}<th>Koning</th><th>Reeks</th></tr>` + rows.map(({ id, g }) => `<tr><td>${this.defOf(id).icon || ''} ${this.defOf(id).name || NAME[id]}</td>${ids.map((i) => `<td>${(g.wins && g.wins[i]) || 0}</td>`).join('')}<td>${crown(g)}</td><td>${g.streak > 1 ? '🔥' + g.streak + ' ' + pname(g.streakWho) : '–'}</td></tr>`).join('') });
    const top = topOf(A.wins, ids); const king = top.length === 1 ? `👑 ${pname(top[0])} staat voor` : 'Gelijk!';
    const head = ids.length === 3 ? ids.map((i) => `<b style="color:${pcss(i)}">${pname(i)}</b> ${A.wins[i] || 0}`).join(' · ') : `<b style="color:#1d9a52">${pname(0)}</b> ${A.wins[0] || 0} – ${A.wins[1] || 0} <b style="color:#2f6fe0">${pname(1)}</b>`;
    const body = h('div', { style: { maxHeight: '56vh', overflow: 'auto' } }, h('p', { style: { textAlign: 'center', fontSize: '22px', margin: '4px 0' }, html: `${head} · ${king}<br><small>${A.plays} duels · ${A.draws} gelijkspel · toernooien ${ids.map((i) => A.tourneys[i] || 0).join(' – ')}${S.banished ? ' · Deurman weggedanst: ' + S.banished + '×' : ''}</small>` }), rows.length ? tbl : h('p', { style: { textAlign: 'center' } }, 'Nog geen duels gespeeld. Kies een kast!'), h('p', { class: 'small-note' }, unplayed ? `Nog ${unplayed} spellen om te proberen!` : 'Alle spellen gespeeld. Wauw.'));
    await this.cardModal('🏆 Ranglijst per spel', body);
  }
  async useDoor(it) {
    if (it.to === 4 && this.sec) { if (!this.sec.opened) return isUnlocked(4) ? this.sec.unlockAnim() : this.sec.knock(); }
    else if (!isUnlocked(it.to)) return this.buildHallDoor(it);
    const o = ARCADE_HALLS[it.to]; const c = await this.choose(`${it.to === 0 ? '↩' : it.to === 4 ? '🚪✨' : '🚪'} ${o.name}`, [`Ja, naar de ${o.name}!`, 'Nog niet'], `${o.ids.length} spellen`); if (c !== 0) return;
    this.leaving = true; audio.sfx('powerup'); await ui.fade(1, 450); persist(); this.app.goArcade({ extra: { hall: it.to }, via: 'door', fromHall: this.hallId }); await new Promise(() => {});
  }
  async leave() {
    const c = await this.choose('Speelhal verlaten?', ['Ja, naar het dorp (karweitjes!)', 'Nog niet']); if (c !== 0) return;
    this.leaving = true; TOURNEY = null; await ui.fade(1, 500); persist(); this.app.goHub({ fromArcade: true }); await new Promise(() => {});
  }
  async kingTalk() {
    if (this.deur.takeover) return this.deur.talk();
    const H = this.hostName; const A = S.arcade; A.excluded ||= []; A.tlen ||= 5;
    await this.say([{ who: H, text: pick(this.H.hello) }]);
    const done = dailyDone(); const keys = []; const labels = [];
    if (TOURNEY) { keys.push('go', 'stop'); labels.push('Toernooi voortzetten', 'Toernooi stoppen'); } else { keys.push('start'); labels.push(`🏆 Toernooi starten (${A.tlen} duels)`); }
    keys.push('daily'); labels.push(done ? '🌟 Uitdaging van de dag (gedaan ✔)' : '🌟 Uitdaging van de dag (+bonus!)');
    if (this.hallId === 0 && rank().index === RANKS.length - 1) { keys.push('party'); labels.push('🎉 Het Grote Slotfeest!'); }
    if (this.hallId === 4) { keys.push('album'); labels.push('📒 Deurman-vriendenboek'); }
    keys.push('plan', 'shop', 'pick', 'how', 'none'); labels.push('🏗️ Rang & Bouwplan', '👒 Hoeden & kleuren', '⚙️ Spellen & twists kiezen', 'Hoe werkt het?', 'Niets');
    const c = await this.choose(H, labels); const key = keys[c];
    if (key === 'start') { await this.startTourney(); return; }
    if (key === 'go') { await this.nextTourney(); return; }
    if (key === 'stop') { TOURNEY = null; this.refreshHud(); ui.hud.toast('Toernooi gestopt.', 1800); return; }
    if (key === 'daily') { await this.dailyChallenge(); return; }
    if (key === 'party') { await this.slotfeest(); return; }
    if (key === 'album') { await this.album(); return this.kingTalk(); }
    if (key === 'plan') { await this.planModal(); return this.kingTalk(); }
    if (key === 'shop') { await this.openShop(); return this.kingTalk(); }
    if (key === 'pick') { await this.pickGames(); return this.kingTalk(); }
    if (key === 'how') await this.say([{ who: H, text: 'Elk duel is 1 tegen 1 op hetzelfde scherm' + (nPlayers() === 3 ? ' (met drie spelers kies je wie er speelt: winnaar blijft, of zelf een paar kiezen)' : '') + '. Voor elk spel wordt een TWIST geloot: omgekeerde besturing, verwisselde knoppen, dronken kikker, reus tegen dwerg, zeepvloer, maanzwaartekracht, lichaamswissel of de Deurman die komt kijken.' }, { who: H, text: `In een toernooi spelen jullie ${A.tlen} verschillende duels uit álle gebouwde hallen. Spellen die jullie niet leuk vinden kun je uitzetten bij "Spellen kiezen". Elke dag is er ook een Uitdaging van de dag met bonus-heitjes. En pas op: soms neemt de Deurman een hal over...` }]);
  }
  async openShop() {
    try { const m = await import('./shop.js'); await m.openShop(this.app, {}); this.refreshHud(); }
    catch (e) { console.warn('winkel niet beschikbaar', e); await this.say([{ who: this.hostName, text: 'De hoedenwinkel is nog dicht. Kom straks terug!' }]); }
  }
  async dailyChallenge() {
    const ok = new Set(unlockedIds()); const gs = {}; for (const id of Object.keys(this.app.games)) if ((ARCADE_IDS.includes(id) ? ok.has(id) : true) && supports(this.app.games[id])) gs[id] = this.app.games[id];
    const info = dailyInfo(gs); const H = this.hostName;
    if (!info) { await this.say([{ who: H, text: 'Ik heb vandaag geen uitdaging. Vreemd.' }]); return; }
    const def = this.defOf(info.id); const tw = TWISTS.find((t) => t.id === info.twist) || TWISTS[0];
    const st = dailyStreak();
    if (dailyDone()) { await this.say([{ who: H, text: `De uitdaging van vandaag is al gedaan! Reeks: ${st} ${st === 1 ? 'dag' : 'dagen'}. Kom morgen terug voor een nieuwe.` }]); return; }
    const c = await this.choose('🌟 Uitdaging van de dag', ['Spelen!', 'Terug'], `${def.icon || ''} ${def.name} met twist: ${tw.icon || ''} ${tw.name} · bonus +${dailyBonus()} heitjes (reeks: ${st})`);
    if (c === 0) await this.launch(info.id, { daily: true }, info.twist);
  }
  // Keuzescherm: welke spellen doen mee aan toernooi en wiel + toernooilengte
  pickGames() {
    return new Promise((resolve) => {
      const A = S.arcade; A.excluded ||= []; A.tlen ||= 5; const LENS = [3, 5, 8, 10, 15];
      const ids = this.allLoaded(); const total = ids.length;
      const entries = [{ k: 'len' }, { k: 'all' }, { k: 'none' }, { k: 'done' }];
      for (const hl of ARCADE_HALLS) for (const id of hl.ids) if (ids.includes(id)) entries.push({ k: 'game', id, hall: hl.name });
      A.offTwists ||= []; const TW = TWISTS.filter((t) => t.id !== 'none');
      entries.push({ k: 'twall' }, { k: 'twnone' }, { k: 'golf' }, { k: 'blank' }); for (const t of TW) entries.push({ k: 'tw', id: t.id, t });
      let sel = 0; const head = h('p', { style: { textAlign: 'center', margin: '4px 0' } }); const grid = h('div', { class: 'pickgrid' });
      const card = h('div', { class: 'card', style: { width: 'min(900px,96vw)', maxHeight: '90vh', overflow: 'auto' } }, h('h2', {}, 'Spellen & twists kiezen'), head, grid, h('div', { class: 'small-note' }, 'Pijltjes = kiezen · actieknop = aan/uit · Esc = klaar'));
      const on = (id) => !A.excluded.includes(id);
      const tiles = [];
      const act = (e) => {
        if (e.k === 'blank') return;
        if (e.k === 'len') { A.tlen = LENS[(LENS.indexOf(A.tlen) + 1) % LENS.length]; }
        else if (e.k === 'all') A.excluded = [];
        else if (e.k === 'none') A.excluded = ids.slice();
        else if (e.k === 'game') { A.excluded = on(e.id) ? [...A.excluded, e.id] : A.excluded.filter((x) => x !== e.id); }
        else if (e.k === 'twall') A.offTwists = [];
        else if (e.k === 'twnone') A.offTwists = TW.map((t) => t.id);
        else if (e.k === 'tw') { A.offTwists = A.offTwists.includes(e.id) ? A.offTwists.filter((x) => x !== e.id) : [...A.offTwists, e.id]; }
        else if (e.k === 'golf') { const L = [3, 6, 9, 12]; A.golfHoles = L[(L.indexOf(A.golfHoles || 6) + 1) % L.length]; }
        else if (e.k === 'done') { close(); return; }
        audio.sfx('select'); draw();
      };
      const draw = () => {
        const n = ids.filter(on).length; head.innerHTML = `Doen mee: <b>${n}</b> van ${total} spellen · Toernooi: <b>${Math.min(A.tlen, Math.max(n, 0))}</b> duels · Twists aan: <b>${TW.length - A.offTwists.length}</b> van ${TW.length}`;
        tiles.forEach((t, i) => { const e = entries[i]; t.className = 'pick' + (i === sel ? ' sel' : '') + ((e.k === 'game' && !on(e.id)) || (e.k === 'tw' && A.offTwists.includes(e.id)) ? ' off' : '') + (e.k === 'game' || e.k === 'tw' ? '' : e.k === 'blank' ? ' blank' : ' ctl'); });
        if (tiles[sel]) tiles[sel].scrollIntoView({ block: 'nearest' });
      };
      entries.forEach((e, i) => {
        const label = e.k === 'len' ? () => `🎯 Lengte: ${A.tlen}` : e.k === 'all' ? () => '✅ Alles aan' : e.k === 'none' ? () => '⛔ Alles uit' : e.k === 'done' ? () => '👍 Klaar' : e.k === 'twall' ? () => '🎲 Twists: alles aan' : e.k === 'twnone' ? () => '🚫 Twists: allemaal uit' : e.k === 'golf' ? () => `⛳ Minigolf: ${A.golfHoles || 6} holes` : e.k === 'blank' ? () => '' : e.k === 'tw' ? () => `${A.offTwists.includes(e.id) ? '✖' : '✔'} ${e.t.icon || ''} ${e.t.name}` : () => `${on(e.id) ? '✔' : '✖'} ${this.defOf(e.id).icon || PIC[e.id] || ''} ${this.defOf(e.id).name || NAME[e.id]}`;
        const t = h('div', { onClick: () => { sel = i; act(e); } }); tiles.push(t); grid.append(t); t._label = label;
      });
      const origDraw = draw; const draw2 = () => { origDraw(); tiles.forEach((t) => { t.textContent = t._label(); }); };
      const el = ui.overlay(card); el.style.overflow = 'auto';
      let closed = false; const close = () => { if (closed) return; closed = true; persist(); this.refreshLabels(); this.drawWheel(); el.remove(); this.picker = null; input.reset(); resolve(); };
      // eerste tekening
      const redraw = () => draw2(); redraw();
      const COLS = 4;
      this.picker = { t: 0.3, update: (dt) => {
        this.picker.t -= dt; if (this.picker.t > 0) return;
        let moved = false;
        for (const p of activeIds().map(inp)) {
          if (p.leftP) { sel = Math.max(0, sel - 1); moved = true; } if (p.rightP) { sel = Math.min(entries.length - 1, sel + 1); moved = true; }
          if (p.upP) { sel = Math.max(0, sel - COLS); moved = true; } if (p.downP) { sel = Math.min(entries.length - 1, sel + COLS); moved = true; }
          if (p.aP) { act(entries[sel]); redraw(); }
        }
        if (moved) { audio.sfx('click'); redraw(); }
        if (input.pressed('Escape')) close();
      } };
      // klik-act ook opnieuw tekenen
      tiles.forEach((t, i) => t.addEventListener('click', () => redraw()));
    });
  }
  async wheelSpin() {
    const hall = this.hall.ids; const ids = hall.filter((id) => this.games.includes(id) && !this.isOff(id)); if (!ids.length) { await this.say([{ text: 'Het wiel heeft geen spellen om uit te kiezen (alles staat uit!).' }]); return; }
    const N = hall.length; const pickId = pick(ids); const i = hall.indexOf(pickId);
    const alpha = ((i + 0.5) / N) * TAU;             // hoek in de canvas
    const cur = this.wheelDisc.rotation.y; let target = alpha; while (target < cur + TAU * 4) target += TAU;
    this.spin = { from: cur, to: target, t: 0, dur: 4.2, lastTick: 0 };
    await new Promise((res) => { this.spin.done = res; });
    audio.sfx('win'); this.fx.burst(0, 3, 4, { count: 50, colors: [0xffd23f, 0xff5ad8, 0x5ad8ff], speed: 7, size: 0.4, life: 1.2 });
    await new Promise((r) => setTimeout(r, 700));
    await this.say([{ text: `Het Wiel van Gekte kiest: ${this.defOf(pickId).icon} ${this.defOf(pickId).name}!` }]);
    await this.launch(pickId);
  }

  // ------------------------------------------------------------------ toernooi
  async startTourney() {
    const A = S.arcade; const pool = this.allLoaded().filter((id) => !this.isOff(id));
    if (pool.length < 2) { await this.say([{ who: this.hostName, text: 'Er zijn te weinig spellen aangezet voor een toernooi. Kies er meer bij "Spellen kiezen".' }]); return; }
    const n = Math.min(A.tlen || 5, pool.length); const ids = shuffle(pool.slice()).slice(0, n);
    TOURNEY = { queue: ids, idx: 0, score: [0, 0, 0], hall: this.hallId, dq: nPlayers() === 3 ? newQueue(activeIds()) : null };
    const icons = ids.map((id) => this.defOf(id).icon).join(' '); await this.say([{ who: this.hostName, text: this.H.tstart ? this.H.tstart.replace('{n}', ids.length).replace('{icons}', icons) : `Het TOERNOOI begint! ${ids.length} duels: ${icons}. Wie de meeste wint, is Kampioen. En de winnaar mag een fanfare kiezen.` }]);
    await this.nextTourney();
  }
  tourneyStand(sep = null) { const T = TOURNEY, ids = activeIds(); const f = (x) => String(Math.round((x || 0) * 10) / 10); return ids.length === 3 ? ids.map((i) => `${pname(i)} ${f(T.score[i])}`).join(' · ') : `${pname(0)} ${f(T.score[0])} – ${f(T.score[1])} ${pname(1)}`; }
  async nextTourney() {
    const T = TOURNEY; const id = T.queue[T.idx]; const def = this.defOf(id); const extra = { tourney: true }; let wie = '';
    if (nPlayers() === 3) {   // elke ronde een paar uit de wachtrij (winnaar blijft); 3-speler-spellen met allemaal
      if (wantsAll(this.app.games[id])) { extra.players = [0, 1, 2]; wie = ' Alle drie doen mee!'; }
      else { const pr = T.dq.next(); extra.players = pr.slice(); extra.q = false; wie = ` ${pname(pr[0])} tegen ${pname(pr[1])}, ${T.dq.waiting().map(pname).join(' en ')} wacht.`; }
    }
    await this.say([{ who: this.hostName, text: `Duel ${T.idx + 1} van ${T.queue.length}: ${def.icon} ${def.name}! Stand: ${this.tourneyStand()}.${wie}` }]);
    await this.launch(id, extra);
  }
  async afterDuel(r) {
    this.busy = true; this.refreshLabels(); this.drawBoard(); this.refreshHud();
    const { ids, winnerId: w } = readResult(r); const ex = this.opts.extra || {};
    const losers = ids.filter((i) => i !== w); const P = (i) => this.players.find((p) => p.i === i);
    const line = w == null ? pick(this.H.draw) : pick(this.H.wins).replace(/\{w\}/g, pname(w)).replace(/\{l\}/g, joinNames(losers));
    if (w != null) { P(w) && (P(w).c.pose = 'cheer'); losers.forEach((i) => P(i) && (P(i).c.pose = 'sad')); this.life.cheer(); }
    this.players.forEach((p) => { if (!ids.includes(p.i)) p.c.pose = 'wave'; });   // de derde speler juicht mee vanaf de zijlijn
    const q = getDQ(); if (q && ex.q && ids.length === 2) { q.report(w); this.refreshQueueHud(); }
    await new Promise((res) => setTimeout(res, 500));
    await this.say([{ who: this.hostName, text: line }]);
    if (q && ex.q && !TOURNEY) { const pr = q.next(); ui.hud.toast(`Volgende: ${pname(pr[0])} vs ${pname(pr[1])}, ${q.waiting().map(pname).join(' en ')} wacht`, 3600); }
    this.players.forEach((p) => (p.c.pose = 'idle'));
    if (this.opts.extra && this.opts.extra.spooky) await this.deur.endTakeover();
    if (r.daily) await this.say([{ who: this.hostName, text: `🌟 Dagduel voltooid! +${r.daily} heitjes bonus. Reeks: ${dailyStreak()} ${dailyStreak() === 1 ? 'dag' : 'dagen'} achter elkaar!` }]);
    if (TOURNEY) {
      const T = TOURNEY; if (w != null) T.score[w] = (T.score[w] || 0) + 1; else for (const i of ids) T.score[i] = (T.score[i] || 0) + 1 / ids.length;
      if (T.dq && ids.length === 2) T.dq.report(w);
      T.idx++; this.refreshHud();
      if (T.idx >= T.queue.length) await this.finishTourney();
      else { this.busy = false; const c = await this.choose('Toernooi', ['Volgend duel!', 'Even pauzeren'], `Stand: ${this.tourneyStand()}`); this.busy = true; if (c === 0) await this.nextTourney(); }
    }
    this.busy = false; input.reset();
  }
  async finishTourney() {
    const T = TOURNEY; TOURNEY = null; const ids = activeIds();
    const tops = topOf(T.score, ids); const win = tops.length === 1 ? tops[0] : null;   // eindwinnaar = meeste punten
    if (win != null) S.arcade.tourneys[win] = (S.arcade.tourneys[win] || 0) + 1; S.coins += 50; S.totalEarned += 50; persist(); this.refreshHud();
    audio.sfx('win'); ui.flash('#fff', 400);
    for (let i = 0; i < 6; i++) setTimeout(() => this.fx.burst(rand(-8, 8), 7 + rand(0, 4), rand(0, 10), { count: 40, colors: [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b], speed: 8, size: 0.45, life: 1.4, gravity: 3 }), i * 260);
    if (win != null) this.players.forEach((p) => (p.c.pose = p.i === win ? 'cheer' : 'sad'));
    this.life.party(10);
    const others = ids.filter((i) => i !== win);
    await this.say([{ who: this.hostName, text: win == null ? (ids.length === 3 ? 'Het toernooi eindigt in een GELIJKSPEL aan de top! Dat is zo zeldzaam als een stille kip. De besten zijn allebei Kampioen. En de rest... ook, een beetje.' : 'Het toernooi eindigt in een GELIJKSPEL! Dat is zo zeldzaam als een stille kip. Jullie zijn allebei Kampioen. En allebei een beetje verliezer.') : this.H.champ ? this.H.champ.replace('{w}', pname(win)).replace('{l}', joinNames(others)) : `${pname(win)} is KAMPIOEN van de Speelhallen! ${joinNames(others)}, jij krijgt een applausje. Hier, ik klap voor je. Klap klap.` }, { who: this.hostName, text: this.H.bonus || 'Als beloning voor jullie moed krijgen jullie samen 50 heitjes van mijn schatkist. Gebruik ze verstandig. Of niet.' }]);
    this.players.forEach((p) => (p.c.pose = 'idle'));
  }

  // ------------------------------------------------------------------ frame
  movePlayer(p, dt, frozen) {
    const ip = inp(p.i); const sp = 7.6;
    p.vx = damp(p.vx, frozen ? 0 : ip.x * sp, 12, dt); p.vz = damp(p.vz, frozen ? 0 : ip.y * sp, 12, dt);
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    nx = clamp(nx, -HALL.w / 2 + 1.2, HALL.w / 2 - 1.2); nz = clamp(nz, -HALL.d / 2 + 1.5, HALL.d / 2 - 1.0);
    for (const c of this.colliders) { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + 0.5; if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; } }
    for (const o of this.players) { if (o === p) continue; const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz); if (d < 1.1 && d > 1e-3) { nx += dx / d * (1.1 - d) * 0.5; nz += dz / d * (1.1 - d) * 0.5; } }
    p.x = nx; p.z = nz;
    if (!p.grounded) { p.vy -= 24 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; p.c.air = false; } }
    const spd = Math.hypot(p.vx, p.vz); if (spd > 0.5) { p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), 14, dt); p.c.targetYaw = p.yaw; }
    p.c.speed = clamp(spd / sp, 0, 1); p.c.group.position.set(p.x, p.y, p.z); p.ring.position.set(p.x, 0.07, p.z);
    if (p.grounded && spd > 3) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.3; audio.sfx('step', { vol: 0.35 }); } }
  }
  nearest(p) { let best = null, bd = 1e9; for (const it of this.interact) { const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; } } return best; }
  update(dt) {
    this.t += dt; const t = this.t;
    if (this.modal) { this.modal.t -= dt; if (this.modal.t <= 0 && (anyP('aP') || input.pressed('Escape'))) { this.modal.el.remove(); const r = this.modal.resolve; this.modal = null; r(); input.reset(); } }
    if (this.menu) this.menu.update();
    if (this.picker) this.picker.update(dt);
    const frozen = this.busy || scare.active;
    const esc = input.pressed('Escape'); if (esc && !this._esc && !frozen && !this.modal && !this.picker) this.pauseMenu(); this._esc = esc;
    for (let i = this.fallers.length - 1; i >= 0; i--) { const f = this.fallers[i], m = f.m; f.vy -= 22 * dt; m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt; m.rotation.x += f.wx * dt; m.rotation.z += f.wz * dt; if (m.position.y < 0.2 && f.vy < 0) { m.position.y = 0.2; f.vy *= -0.3; f.vx *= 0.6; f.vz *= 0.6; f.wx *= 0.5; f.wz *= 0.5; } f.t -= dt; if (f.t < 0.6) m.scale.setScalar(Math.max(0.01, f.t / 0.6)); if (f.t <= 0) { m.parent && m.parent.remove(m); this.fallers.splice(i, 1); } }
    for (const g of this.pointers) { g.position.y = g.userData.y0 + Math.sin(t * 5) * 0.35; }
    for (const p of this.players) {
      if (!frozen && inp(p.i).aP) { const it = this.noAct ? null : this.nearest(p); if (it && this.deur.active && it.type !== 'exit') { ui.hud.toast('Nu niet! De Deurman komt eraan...', 1400); } else if (it) this.doInteract(it, p); else if (p.grounded) { p.vy = 8; p.grounded = false; p.c.air = true; p.c.jump(); audio.sfx('jump', { vol: 0.5 }); } }
      this.movePlayer(p, dt, frozen); p.c.update(dt);
    }
    const np = this.players.length; this.mid.set(this.players.reduce((a, p) => a + p.x, 0) / np, 0, this.players.reduce((a, p) => a + p.z, 0) / np);
    // camera: poppenhuis-overzicht; zoomt uit als de broers uit elkaar lopen, met een kleine zwaai en een openingsshot
    let sep = 0; for (const a of this.players) for (const b of this.players) sep = Math.max(sep, Math.hypot(a.x - b.x, a.z - b.z)); const k = clamp((sep - 6) / 26, 0, 1);   // grootste afstand tussen twee spelers: de camera omvat iedereen
    const pan = lerp(11, 3, k);
    let lz = clamp(this.mid.z * 0.7 - 1, -11, 10);
    const tx = clamp(this.mid.x, -pan, pan), ty = lerp(23, 35, k), tz = lz + lerp(16, 22, k);
    let tx2 = tx, tz2 = tz, ty2 = ty;
    if (this.intro > 0) { this.intro -= dt; const q = smoothstep(0, 1, this.intro / 3.2); ty2 = lerp(ty, ty + 20, q); tz2 = lerp(tz, tz + 14, q); }
    if (this.camOverride) { this.camOverride.t -= dt; if (this.camOverride.t <= 0) this.camOverride = null; else { tx2 = this.camOverride.x; tz2 = this.camOverride.z + 15; lz = this.camOverride.z; } }
    tx2 += Math.sin(t * 0.25) * 0.5;
    this.camPos.x = damp(this.camPos.x, tx2, 4, dt); this.camPos.y = damp(this.camPos.y, ty2, 3, dt); this.camPos.z = damp(this.camPos.z, tz2, 4, dt);
    this.camLook.x = damp(this.camLook.x, tx2, 5, dt); this.camLook.z = damp(this.camLook.z, lz, 5, dt);
    this.camera.position.copy(this.camPos);
    if (this.camShake > 0.001) { this.camera.position.x += (Math.random() - 0.5) * this.camShake; this.camera.position.y += (Math.random() - 0.5) * this.camShake; this.camShake *= 0.9; } this.camera.lookAt(this.camLook.x, 1.5, this.camLook.z);
    // decor
    this.disco.rotation.y += dt * 0.8; this.lights.forEach((l, i) => { const a = t * 0.7 + i * TAU / 3; l.position.set(Math.cos(a) * 12, 9, 2 + Math.sin(a) * 8); });
    (this.banners || []).forEach((b, i) => P.animateBanner(b, t + i));
    this.life.update(dt);
    this.deur.update(dt); hallCameoTick(this, dt);
    if (this.hx) this.hx.update(dt, this.deur.k);
    if (this.extraUpd) for (const f of this.extraUpd) f(dt, t);
    if (this.sec) { this.sec.update(dt); this._secT = (this._secT || 0) - dt; if (this._secT <= 0) { this._secT = 1; if (!this.sec.opened && isUnlocked(4) && !S.settings.unlockAll && !this.busy && !this.leaving && !this.deur.active && !this.modal && !this.menu && !this.picker) this.sec.unlockAnim(); } }
    this.king.update(dt); this.king.pose = this.nearKing() ? 'wave' : 'idle';
    this.wheelPtr.rotation.z = Math.sin(t * 2) * 0.03;
    if (this.spin) {
      const s = this.spin; s.t += dt; const k2 = Math.min(1, s.t / s.dur); const e = 1 - Math.pow(1 - k2, 3);
      const prev = this.wheelDisc.rotation.y; this.wheelDisc.rotation.y = lerp(s.from, s.to, e);
      const seg = TAU / this.hall.ids.length; if (Math.floor(prev / seg) !== Math.floor(this.wheelDisc.rotation.y / seg)) { audio.sfx('tick', { rate: 1 + (1 - k2) * 0.5, vol: 0.7 }); this.wheel.scale.setScalar(1.01); }
      this.wheel.scale.setScalar(damp(this.wheel.scale.x, 1, 14, dt));
      if (k2 >= 1) { const done = s.done; this.spin = null; done && done(); }
    }
    // Deurman-gezichtje op een kast (glitch-grap)
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0 && S.settings.scare >= 1 && this.cabs.length && !this.deur.moodOn) { this.nextGlitch = rand(70, 140); const cab = pick(this.cabs); const old = cab.scr.material.map; cab.scr.material.map = this.cabTexture(cab.id, true); cab.scr.material.needsUpdate = true; audio.sfx('static'); setTimeout(() => { cab.scr.material.map = old; cab.scr.material.needsUpdate = true; }, 1600); }
    this.fx.update(dt);
    // prompt
    if (this.busy || this.noAct) ui.hud.setPrompt(null);
    else { const lines = []; for (const p of this.players) { const it = this.nearest(p); if (it) lines.push(`<span style="color:${pcss(p.i)}">${pname(p.i)}</span> <b>${klabel(p.i).a}</b> ${it.label}`); } ui.hud.setPrompt(lines.length ? lines.join('<br>') : null); }
  }
  nearKing() { return this.players.some((p) => Math.hypot(p.x - 0, p.z - (-HALL.d / 2 + 3.7)) < 9); }
  render(renderer) { renderer.render(this.scene, this.camera); }
}

// impactID Gamehal: ALLE humor en kantoorteksten op één plek (toon: kort, warm, droog, mensgericht; zie docs/IMPACTID_STIJL.md).
// Dit bestand heeft alleen data en kleine helpers en importeert niets behalve de variantvlag, zodat het overal veilig te laden is
// (ook in de gewone versie: daar doen alle `apply*`-functies niets en geeft `coin()` gewoon 'heitjes').
// Spelregels humor: collega-vriendelijk, nooit kwetsend; geen echte namen, klanten, interne cijfers, politiek of seksuele grappen.
import { GAMEHAL } from '../variant.js';

export const TITLE = 'impactID Gamehal';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const lc1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ---------------------------------------------------------------- valuta: heitjes heten in de Gamehal impact-punten
// De interne sleutels (S.coins, totalEarned, ...) blijven zoals ze zijn. coin(1) = enkelvoud, anders meervoud.
export const coin = (n = 2) => (GAMEHAL ? (n === 1 ? 'impact-punt' : 'impact-punten') : 'heitjes');
export const coins = (n) => `${n} ${coin(n)}`;

// ---------------------------------------------------------------- hallen en zones (ids blijven gelijk)
export const HALL_TITLES = ['De Kantine', 'De Serverruimte', 'De Vrijdagborrel', 'Het Teamuitje', 'Vergaderzaal 3.14'];
// ondertitel onder de hal-naam op de deuren (en dus ook 'terug naar ...' voor hal 0)
export const HALL_DOOR_SUB = ['waar alles begint', 'koud, blauw en knipperend', 'hapjes, hoge scores', 'verplicht leuk', 'altijd bezet (nu niet)'];
// 'Naar de Kantine' i.p.v. 'Naar de De Kantine': de naam zonder hoofdletter-lidwoord
export const hallLc = (name) => (GAMEHAL ? name.replace(/^(De|Het) /, (m) => lc1(m)) : name);
export const hallName = (i, fallback = '') => (GAMEHAL ? HALL_TITLES[i] || fallback : fallback);
// naam met zachte afbreekstreepjes voor smalle kaarten (HTML)
export const hallHtml = (name) => (GAMEHAL ? name.replace(/^(.*?)(Server|Vrijdag|Vergader)(?=\w)/, '$1$2&shy;') : name);
export const hallBack = () => (GAMEHAL ? 'terug naar de koffie' : 'terug naar de Speelhal');
export const doorSub = (i, fb) => (GAMEHAL && HALL_DOOR_SUB[i]) || fb;
// 'Naar de Speelhal' (gewoon) of 'Naar de Kantine' (Gamehal: lidwoord zit al in de naam)
export const naarHal = (name, cap = true) => (cap ? 'Naar ' : 'naar ') + (GAMEHAL ? hallLc(name) : 'de ' + name);
export function applyHallNames(names, halls) {
  if (!GAMEHAL) return;
  HALL_TITLES.forEach((n, i) => { if (names) names[i] = n; if (halls && halls[i]) halls[i].name = n; });
}
// zone-id -> [naam, ondertitel] per hal (bord boven het kleed, max ca. 18 + 30 tekens)
export const ZONE_TEXT = [
  { arena: ['Escalatie-Arena', 'als mailen niet meer helpt'], denk: ['Brainstormhoek', 'geen slechte ideeën'], race: ['Deadline-Baan', 'gas geven, het is vrijdag'], gek: ['De Koffiehoek', 'alles mag, cafeïne regeert'], drie: ['Driehoeksoverleg', 'drie of vier, geen notulist'] },
  { dans: ['Teamdisco', 'swingen tot de stand-up'], ring: ['Feedbackronde', 'ding ding: constructief!'], puzzel: ['Planning-Lounge', 'even de puzzel leggen'], sport: ['Bedrijfssport', 'sporten tussen de mails'] },
  { eten: ['Borrelbuffet', 'bitterballen, quiz en kip'], gooi: ['Actiepunten Gooien', 'raak, of naar volgend kwartaal'], tent: ['Besloten Besprekingen', 'wat besloten is, is geheim'], gok: ['Kwartaalrisico', 'alles of niets, net als Q4'] },
  { balsport: ['Teambuilding-Veld', 'trap, gooi, tik, vertrouw'], mikken: ['Doelstellingen', 'raak! (of: volgend kwartaal)'], kantine: ['Lunchbuffet', "tosti's & lauwe koffie"], ijsbaan: ['De IJsbreker', 'ijs breken, stenen glijden'] },
  { zeg: ['De Spreekbeurt', 'de Deurman wil afstemmen'], hand: ['Ter Ondertekening', 'pen mee, paraaf hier'], race: ['Spoedvergadering', 'klop, klop, de volgende wacht'], disco: ['Afterwork-Disco', 'dans door de vergaderzaal'] },
];
// ZONES uit arcade_zones.js: namen en ondertitels vervangen (in-place; ids, kleuren en plekken blijven)
export function applyZones(ZONES) {
  if (!GAMEHAL) return;
  ZONES.forEach((hall, hi) => hall.forEach((z) => { const t = ZONE_TEXT[hi] && ZONE_TEXT[hi][z.id]; if (t) { z.name = t[0]; z.sub = t[1]; } }));
}

// ---------------------------------------------------------------- rangen
export const RANKS_GH = [
  { name: 'Stagiair', at: 0, icon: '🌱' }, { name: 'Junior', at: 6, icon: '☕' }, { name: 'Medior', at: 16, icon: '💼' }, { name: 'Senior', at: 34, icon: '🎯' },
  { name: 'Lead', at: 62, icon: '🧭' }, { name: 'Directeur van de Speelhal', at: 105, icon: '🏢', big: 'Directeur!' }, { name: 'impact-Legende', at: 170, icon: '👑' },
];
export function applyRanks(RANKS) { if (GAMEHAL) RANKS.splice(0, RANKS.length, ...RANKS_GH.map((r) => ({ ...r }))); }
const RANK_UP = [
  null,
  'Gefeliciteerd, je bent nu Junior Koffiezetter. Salaris blijft hetzelfde.',
  'Gefeliciteerd, je bent nu Medior Afstemmer. Salaris blijft hetzelfde.',
  'Gefeliciteerd, je bent nu Senior Pingpongspecialist. Salaris blijft hetzelfde.',
  'Gefeliciteerd, je bent nu Lead Actiepunt-Eigenaar. Salaris blijft hetzelfde, de verantwoordelijkheid niet.',
  'Gefeliciteerd, je bent nu Directeur van de Speelhal. Eigen stoel, eigen koffiekop, zelfde salaris.',
  'Gefeliciteerd, je bent nu impact-Legende. Dit staat voortaan in elke presentatie.',
];
export const rankBig = (r) => (GAMEHAL && r.big) || `${r.name}!`;
export const rankUpLine = (r) => RANK_UP[r.index] || `Gefeliciteerd, je bent nu ${r.name}. Salaris blijft hetzelfde.`;
export const RANK_TOP = 'Hoogste rang bereikt. Meer dan impact-Legende bestaat niet, behalve een eigen parkeerplek.';

// ---------------------------------------------------------------- toernooi
export const TOURNEY_NAME = 'Het Jaarlijks Kwartaaloverleg-Toernooi';
export const TOURNEY_SHORT = 'Kwartaaloverleg';
export const tourneyLabel = (n) => `🏆 Kwartaaloverleg-Toernooi starten (${n} duels)`;
export const tourneyStart = (n, icons) => `${TOURNEY_NAME} is geopend! ${n} duels: ${icons}. Wie de meeste wint, krijgt de eervolle titel “Medewerker van het Kwartaal”. Er is geen pasfoto bij.`;
export const tourneyBonus = () => 'Als bonus krijgen jullie samen 50 impact-punten. Niet declarabel, wel verdiend.';
export const tourneyChamp = (w, l) => pick([
  `${w} is Medewerker van het Kwartaal! ${l}: jullie krijgen een warm applaus en een uitnodiging voor het volgende overleg.`,
  `${w} wint ${TOURNEY_NAME}! ${l} mag de notulen schrijven. Het zijn korte notulen.`,
  `Eindoverleg afgerond: ${w} kampioen. ${l} neemt de actiepunten mee. Er zijn er een stuk of veertig.`,
]);

// ---------------------------------------------------------------- resultaatkaart: quips (≥ 40 zinnen, wisselend, nooit twee keer dezelfde achter elkaar)
// {w} winnaar(s), {l} verliezer(s) of de laatste, {p1}..{p4} plaatsen, {n} aantal potjes in de reeks
const Q = {
  win: [
    '{w} wint. Dit staat in de notulen.',
    '{l}: actiepunt = een rondje koffie halen.',
    '{w} wint. {l} krijgt een leermoment, gratis.',
    'Winnaar mag de laatste versie_def_FINAL2 kiezen.',
    '{w} wint. Graag even delen in de teamchat. Of beter niet.',
    '{l} neemt dit mee naar de volgende retro.',
    'Uitslag: {w} voor, {l} tegen. De voorzitter beslist: {w}.',
    '{w} gaat naar de volgende ronde. {l} naar de koffieautomaat.',
    'Gefeliciteerd {w}. Je mag een foto voor de nieuwsbrief uitzoeken.',
    '{l}: dit was geen verlies, maar een tussentijdse oplevering.',
    '{w} levert op tijd. Zeldzaam. Noteer de datum.',
    '{l}: “Mijn toetsenbord had een slechte dag.”',
    '{w} wint. {l} wil het even offline afstemmen.',
    '{w} wint. De taart is voor jou. De taart bestaat niet.',
    '{l} vraagt om een second opinion. Die is van {w}: gewonnen.',
    '{l} zet het op de agenda voor volgende week.',
    'Eindstand vastgesteld. Bezwaar indienen kan tot het einde van de dag.',
    '{w} deelt de winst met niemand. Teamgeest is ook maar een woord.',
  ],
  ffa: [
    '{w} wint. De anderen vroegen om een tweede ronde.',
    '{l} sluit de rij en zet de stoelen terug.',
    'Knap van {w}. De rest was er ook. Dat telt.',
    '{w} pakt de hoekkamer. {l} krijgt de flexplek bij de printer.',
    'Iedereen deed mee, {w} won. Verdeel de lof naar eigen inzicht.',
    '{l} schrijft de notulen. Dat is geen straf, dat is een rol.',
    '{w} wint. De overige spelers vormen een werkgroep.',
    '{w} wint. {l} had “een andere prioriteit”.',
  ],
  tie: [
    'Gelijkspel. Laten we dit offline afstemmen.',
    'Gelijkspel. We nemen het mee naar de volgende vergadering.',
    'Niemand wint. Dat noemen we een win-win.',
    'Gelijkspel: de werkgroep wordt opgericht.',
    'Gelijkspel. Er volgt een uitgebreide mail met vijf bijlagen.',
    'Gelijkstand. De notulist weet het ook niet meer.',
    'Uitslag: nader te bepalen. Plan een revanche in.',
    'Gelijkspel: ideaal voor een compromis, minder voor de krant.',
  ],
  team: [
    '{w}: sterk teamwerk. {l}: sterk overleg.',
    '{w} werken samen. {l} werken vooral door elkaar.',
    'Teamwork makes the dream work. Voor {w} dan.',
    '{l} hadden een heldere visie. Alleen niet dezelfde.',
    '{w} won met een duidelijke rolverdeling. {l} zijn nog aan het afstemmen.',
    'Synergie! {w} mogen het woord officieel gebruiken.',
    '{w}: samen sterk. {l}: samen aanwezig.',
    '{l}, bedankt voor jullie inzet. Er volgt een evaluatie.',
  ],
  places: [
    '{p1} voorop, {p2} en {p3} volgen, {p4} zet de stoelen terug.',
    '{p4} regelt de lunch. {p1} bepaalt het beleg.',
    '{p4} sluit af. Iemand moet het licht uitdoen.',
    'De volgorde ligt vast: {p1}, {p2}, {p3}, {p4}. Wijzigingen via de gebruikelijke kanalen.',
    '{p1} wint. {p4} noteert de actiepunten. Zo gaat dat.',
    '{p1} wint, {p4} kan alleen maar stijgen. Ook een carrièrepad.',
  ],
  series: [
    'Reeks: {w} blijft winnen. Dit heet “consistent presteren”.',
    'Dit is al potje {n}. We noemen het een iteratie.',
    'Potje {n}. De definitie van “nog eentje” is ruim.',
    'Dit is nu een terugkerend overleg. Zet er een serie van in de agenda.',
    '{w} is op dreef. De rest vraagt om een tussentijdse evaluatie.',
    '{n} potjes. Dit is officieel een kwartaalcyclus.',
    'Revanche? Mijn agenda is vrij, die van jullie ook.',
  ],
};
export const QUIP_COUNT = Object.values(Q).reduce((a, b) => a + b.length, 0);
const bags = {}; let lastQuip = '';
// één zin uit de pool, zonder herhaling tot de pool leeg is (en nooit twee keer dezelfde achter elkaar)
function draw(kind) {
  const src = Q[kind]; let bag = bags[kind];
  if (!bag || !bag.length) bag = bags[kind] = src.map((_, i) => i).sort(() => Math.random() - 0.5);
  let i = bag.pop(); if (src[i] === lastQuip && bag.length) { const j = bag.pop(); bag.unshift(i); i = j; }
  lastQuip = src[i]; return src[i];
}
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : v[k]));
// ctx: { names: [naam per slot], winners: [slots], teams: bool, n: aantal spelers, order: [slots 1e..laatste], series: aantal potjes in de reeks }
export function resultQuip(ctx) {
  if (!GAMEHAL || !ctx) return '';
  const { names = [], winners = [], teams = false, order = [], series = 0 } = ctx; const n = names.length;
  const nm = (k) => names[k] || '';
  const losers = order.length ? order.filter((k) => !winners.includes(k)) : names.map((_, k) => k).filter((k) => !winners.includes(k));
  const v = { w: winners.map(nm).join(' & '), l: (teams ? losers.map(nm).join(' & ') : nm(losers[losers.length - 1])), n: series };
  order.forEach((k, i) => { v['p' + (i + 1)] = nm(k); });
  let kind;
  if (!winners.length) kind = 'tie';
  else if (series >= 2 && !teams && winners.length === 1 && Math.random() < 0.4) kind = 'series';
  else if (teams || winners.length > 1) kind = 'team';
  else if (n >= 4 && order.length >= 4 && Math.random() < 0.5) kind = 'places';
  else kind = n >= 3 ? 'ffa' : 'win';
  return fill(draw(kind), v);
}

// ---------------------------------------------------------------- knock-out
const KO = {
  semi: ['Halve finale = tweede overleg. Zelfde agenda, meer spanning.', 'Halve finale = tweede overleg. Neem je eigen stoel mee.', 'Halve finale = tweede overleg. Er is nog koffie, maar niet voor lang.'],
  final: ['Finale = het eindoverleg met de directie. Neem koffie mee.', 'Finale = het eindoverleg met de directie. Geen laptops, wel zenuwen.', 'Finale = het eindoverleg met de directie. Er worden notulen gemaakt.'],
  third: ['Troostfinale = het overleg over het overleg.'],
  champ: ['{w} sluit af met een knallend eindoverleg. De directie tekent bij.', '{w} is kampioen. Het besluit is genomen en niemand vraagt om herhaling.', '{w} wint de knock-out. Dit gaat in het jaarverslag.'],
};
export const koLine = (kind) => (GAMEHAL ? pick(KO[kind] || KO.semi) : '');
export const koChamp = (w) => (GAMEHAL ? fill(pick(KO.champ), { w }) : '');

// ---------------------------------------------------------------- kast-taglines: één grap-ondertitel per arcadespel (alle 58 ids uit ARCADE_IDS)
export const GAME_JOKES = {
  dodgeball: 'Teamuitje: de ballen vliegen je om de oren',
  cakefight: 'Het verjaardagsrondje loopt uit de hand',
  tugwar: 'Onderhandelen, maar dan met een touw',
  airhockey: 'Heen-en-weer-mailen, maar dan met een puck',
  quickdraw: 'Wie klikt het snelst op “Akkoord”?',
  memory: 'Wat was ook alweer het actiepunt van vorige week?',
  paint: 'Alles in jouw huisstijlkleur, graag',
  duckshoot: 'Mik op je doelen. Of op de eendjes.',
  karts: 'Woon-werkverkeer, maar dan leuk',
  climb: 'De carrièreladder, nu met stijgende lava',
  tanks: 'Escalatie via de juiste kanalen',
  chairs: 'Flexplekken: wie zit er op mijn stoel?',
  ticktock: 'De deadline draait. Spring erover.',
  minecart: 'Racen door de mijn van de backlog',
  buttons: 'Druk op de juiste knop. Niet die andere.',
  vines: 'Van project naar project zwaaien, mind the gap',
  screws: 'Wie schroeft het eerst de planning vast?',
  chop: 'Schrappen in het budget, maar dan letterlijk',
  koningsberg: 'De strijd om het hoekkantoor',
  driehoek: 'Driehoeksoverleg, maar dan met een puck',
  buzz3: 'Wie het eerst op de knop drukt, heeft gelijk',
  sneeuwgevecht: 'Het kerstborreltje loopt uit de hand',
  bomber: 'Een presentatie die als een bom inslaat',
  tron: 'Impact achterlaten, maar niet botsen',
  hexagone: 'De grond onder je planning zakt langzaam weg',
  tag: 'Hete aardappel: “dit is niet mijn actiepunt”',
  brawl: 'Feedback geven, zonder sandwichmethode',
  spacewar: 'Dit lossen we buiten de atmosfeer op',
  volley: 'Slijmen mag, aan beide kanten van het net',
  soccer: 'Raketvoetbal: ja, dit is ook teambuilding',
  pacduel: 'Verdwalen in het doolhof van het intranet',
  golf: 'Zaken doen op de golfbaan, maar dan minigolf',
  stack: 'Je takenlijst: wat niet past, valt eraf',
  blocks: 'Puzzelen met de planning: past nooit helemaal',
  connect4: 'Strategisch overleg, 4 op een rij',
  dance: 'Volg de pijlen, net als de roadmap',
  quiz: 'Wie wordt de slimste van de afdeling?',
  code: 'Wachtwoord vergeten? Raad maar mee',
  bake: 'Taart voor de afdeling, vóór de call begint',
  claw: 'Grijp je kans. Daar heb je een klauw voor.',
  kalaha: 'Stenen verschuiven tot de sprint klopt',
  bowling: 'Alles omgooien behalve de planning',
  ducks: 'Al je eendjes op een rij, zoals de audit wil',
  flappy: 'Door de gaten in de planning vliegen',
  pinball: 'Stuiteren van meeting naar meeting',
  hide: 'Verstoppen zodra iemand “wie wil notuleren?” zegt',
  heist: 'Wie pakte mijn yoghurt uit de koelkast?',
  catapult: 'Problemen over de muur gooien, nu met katapult',
  penalty: 'Scoren en meteen “Top!” in de chat',
  basket: 'Scoren voor de lunch, daarna doorpakken',
  pingpong: 'Het enige overleg waar iemand echt iets terugzegt',
  darts: 'Mikken op de deadline, raken wat je raakt',
  boog: 'In de roos, of in ieder geval in de buurt',
  curling: 'Het pad vrijmaken voor een collega: echte teamsport',
  deurzegt: 'Deurman zegt: dit kan ook in een mail',
  handtekening: 'Paraaf hier, paraaf daar, paraaf overal',
  deurenrace: 'Alle vergaderzalen zijn bezet. Probeer de volgende deur.',
  deurdisco: 'Dansen in de vergaderzaal (na vijven mag dat)',
};
export const gameJoke = (id) => (GAMEHAL && GAME_JOKES[id]) || '';

// ---------------------------------------------------------------- lobby-tips, laadregels
export const TIPS = [
  'Tip: een standup duurt nooit 15 minuten.',
  'Reply-all is geen spelmodus.',
  'Dit spel is volledig AVG-proof: wij weten niks over jullie.',
  'Wie “even afstemmen” zegt, wil eigenlijk een vergadering.',
  'Koffie helpt niet tegen verliezen, maar het voelt wel zo.',
  'De beste ideeën ontstaan bij de koffieautomaat. De rest bij de printer.',
  'Je bent niet verslagen, je hebt een leermoment.',
  'Verliezen heet hier “bijsturen”.',
  'Een goed spel begint met een agenda en eindigt zonder notulen.',
  'Er is nog taart. (Er is nooit nog taart.)',
  'Spreadsheet vol? Geen zorgen, hier tel je alleen punten.',
  'Elk spel heeft een twist. Net als elke planning.',
  'Ctrl+Z werkt hier niet. Op die ene zet ook niet.',
  'Het Feestbord: strategie, geluk en een tikje frustratie. Zoals een kwartaalplanning.',
  'Gamehal-regel 1: wie de laatste koffie pakt, zet nieuwe.',
  'Stagiairs mogen ook winnen. Zeker de stagiairs.',
  'Gamehal-uren zijn niet declarabel. Helaas.',
  'Een goede winnaar bedankt de verliezers. In de notulen.',
  'De man van vergaderzaal 3.14 kijkt graag even mee. Hij vraagt alleen of het uitkomt.',
  'Je staat op mute? Hier is dat geen excuus.',
  'Standup met vier spelers: iedereen staat, niemand is klaar.',
  'Plan nooit een revanche op vrijdagmiddag. Of juist wel.',
  'We hebben geen bugs, alleen onverwachte functies.',
  'Dit spel draait op ambitie, koffie en een vrij oud toetsenbord.',
  'Lees de spelregels. Of doe alsof, dat doet iedereen.',
  'Er is geen tijd voor een retro, wel voor een revanche.',
  'Contribute to a fair world. Begin met eerlijk delen van de gamepads.',
  'Een rimpeling begint bij één speler en waaiert uit. Zeker bij een revanche.',
  'Hartelijk dank voor uw geduld. Uw spel is belangrijk voor ons.',
  'Dit spel is niet gesponsord door de koffieautomaat. Wel geïnspireerd.',
  'Vier spelers, één scherm: de ultieme hybride vergadering.',
  'Laat de laptop dicht. Hier hoef je niets te delen, behalve de bitterballen.',
  'Wie verliest, mag de planning maken. Wie wint, mag haar negeren.',
  'Goed teamwork: samen verliezen van de Deurman.',
];
let tipBag = []; let lastTip = '';
export function nextTip() {
  if (!tipBag.length) tipBag = TIPS.map((_, i) => i).sort(() => Math.random() - 0.5);
  let i = tipBag.pop(); if (TIPS[i] === lastTip && tipBag.length) { const j = tipBag.pop(); tipBag.unshift(i); i = j; }
  lastTip = TIPS[i]; return TIPS[i];
}
// tekst in `el` wisselt om de `ms` ms van tip (zachte fade); stopt zodra el uit de pagina is. Geeft een stop-functie terug.
export function rotateTips(el, ms = 7000) {
  if (!el) return () => {};
  const set = () => { el.style.opacity = '0'; setTimeout(() => { el.textContent = nextTip(); el.style.opacity = '1'; }, 350); };
  el.style.transition = 'opacity .35s'; el.textContent = nextTip();
  const t = setInterval(() => { if (!el.isConnected) { clearInterval(t); return; } set(); }, ms);
  return () => clearInterval(t);
}
export const BOOT_LINES = [
  'De Gamehal wordt opgebouwd…', 'De koffie wordt gezet…', 'Even afstemmen met de servers…', 'De agenda wordt geladen (er is nog niets in te plannen)…',
  'Stoelen worden aangeschoven…', 'Het wifi-wachtwoord wordt gezocht…', 'De beamer start op (dit duurt even)…', 'Vergaderzaal 3.14 blijkt bezet…',
  'De actiepunten worden verdeeld…', 'Bitterballen worden opgewarmd…', 'De kantoortuin wordt omgebouwd tot speelhal…', 'Er wordt nog even iemand uitgenodigd…',
];
// laadscherm van gamehal.html: wisselende regel in #boot span (de pagina roept dit aan zodra humor.js geladen is)
export function bootRotate() {
  if (!GAMEHAL || typeof document === 'undefined') return;
  const sp = document.querySelector('#boot span'); if (!sp) return;
  let i = Math.floor(Math.random() * BOOT_LINES.length); sp.textContent = BOOT_LINES[i];
  const t = setInterval(() => { if (!sp.isConnected) { clearInterval(t); return; } i = (i + 1 + Math.floor(Math.random() * 3)) % BOOT_LINES.length; sp.textContent = BOOT_LINES[i]; }, 2300);
}

// ---------------------------------------------------------------- Deurman: de man van vergaderzaal 3.14
const CAMEO = {
  handtekening: ['Paraaf graag', 'Een paraaf? Alleen even hier.'],
  highfive: ['Even afstemmen', 'Ik wilde alleen even afstemmen.'],
  deuropen: ['Is deze ruimte bezet?', 'Is deze ruimte nog bezet?'],
  pizza: ['Pizza van gisteren', '...Pizza van de vorige vergadering.'],
  niksgebeurd: ['Niks gebeurd', 'Ik was hier niet. Welke vergadering?'],
  goedgespeeld: ['Goed gespeeld', 'Goed gespeeld. Staat in de notulen.'],
  kijkdeur: ['Een vergaderzaal', 'Kijk, een vergaderzaal. Bezet.'],
  toeter: ['De tijd is om', 'TOET! De tijd is om.'],
  dansen: ['Teams-gesprek?', 'Is dit het Teams-gesprek?'],
  selfie: ['Groepsfoto', 'Groepsfoto voor de nieuwsbrief?'],
  bloem: ['Collega van de maand', 'Voor de collega van de maand.'],
  verstopt: ['Wachten op zaal 3.14', 'Niet kijken. Ik wacht tot de vorige uitloopt.'],
  trombone: ['Wachtmuziek', 'Ik speel de wachtmuziek.'],
  zonnebril: ['Staat in de agenda', 'Staat al in de agenda.'],
  kleurenruil: ['Huisstijl', 'Ik pas even de huisstijl aan.'],
  confetti: ['Kwartaaldoel gehaald', 'Confetti! Het kwartaal is gehaald.'],
};
export function applyCameo(K) {
  if (!GAMEHAL) return;
  for (const [id, [name, text]] of Object.entries(CAMEO)) if (K[id]) { K[id].name = name; K[id].text = text; }
}
export const ALBUM = {
  title: '📒 Het album van zaal 3.14',
  note: 'De man van vergaderzaal 3.14 komt overal even om de hoek kijken. Elke nieuwe grap is een sticker!',
  toast: (n, left) => '📒 Nieuwe sticker van de man van zaal 3.14!' + (left > 0 && left <= 2 ? ` (nog ${left} en de zaal is vrij)` : n >= 6 ? ' Vergaderzaal 3.14 is vrij!' : ''),
  hall: (n, need) => (n >= need ? '🚪 Genoeg stickers: vergaderzaal 3.14 is (eindelijk) vrij!' : `Nog ${need - n} sticker${need - n === 1 ? '' : 's'} en vergaderzaal 3.14 is misschien vrij.`),
};

// ---------------------------------------------------------------- diversen
export const LEAVE_LOBBY = ['Echt weg? De standup begint zo.', 'Echt weg? Er staat nog een overleg open.', 'Terug naar de lobby? De koffie is nog warm.', 'Weggaan midden in het overleg? Dat valt op.'];
export const leaveLine = () => pick(LEAVE_LOBBY);
export const PAUSE_TITLES = ['Pauze: koffie halen mag', 'Pauze (tien minuten, echt)', 'Even pauze, niet vergaderen', 'Pauze: de agenda wacht'];
export const pauseTitle = () => (GAMEHAL ? pick(PAUSE_TITLES) : 'Pauze');
export const howToExtra = 'Kort samengevat: spelen, winnen, het overleg verplaatsen.';
export const SHOP_WARN = 'Je verdient impact-punten met elk spel dat je speelt (20 per spel). Besteed ze aan hoedjes, niet aan de koffieautomaat.';
export const RANK_BOARD = { title: 'impactID Gamehal', goalMax: 'Hoogste rang bereikt. Meer impact kan niet.', coinLine: (n) => `${n} ${coin(n)} · voor hoedjes` };

// ---------------------------------------------------------------- Feestbord: kaarten en lijnen (aantallen munten blijven gelijk aan de regels)
const BOARD_CARDS = {
  egg: ['Gouden Ei!', 'Een kip uit de kantine legt een ei in je hoed. +4 munten!'],
  duck: ['Eendenpech', 'Je struikelt over een eend op de gang. De eend is OK. Jij −2 munten.'],
  gift: ['Cadeautje!', 'Iemand heeft een cadeautje op de gang laten liggen: een gratis item!'],
  party: ['Verrassingsfeestje', 'Surprise! Er was nog taart. Iedereen krijgt +3 munten.'],
  gamble: ['Dubbel of niets', 'Munt opgooien! Kop: +6 munten. Munt: −3 munten. Net als een kwartaalcijfer.'],
  trophy: ['De Trofee verhuist!', 'De Trofee wordt verplaatst naar een andere vergaderzaal. Niemand weet waarom.'],
  hat: ['Hoedvondst', 'Je vindt een hoed met 2 munten erin. En een visitekaartje. Het visitekaartje mag je houden.'],
  shield: ['Ridder in nood', 'Een collega leent je zijn schild. Hij heeft er nog twee.'],
  again: ['Nog een keer!', 'De agenda schuift door. Je mag nog een keer gooien!'],
  pie: ['Taartgevecht!', 'Jij gooit een taart. De ander verliest 2 munten (en zijn waardigheid).'],
};
const BOARD_DEUR = {
  swap: ['Plekkenwissel!', 'De man van zaal 3.14 kijkt om de deur en wisselt jullie plekken. “Ik wilde alleen even afstemmen.”', 'De man van zaal 3.14 kijkt om de deur en draait jullie plekken rond: iedereen schuift door. “Ik wilde alleen even afstemmen.”'],
  sign: ['Paraaf!', 'De man van zaal 3.14 zet een paraaf bij je naam. Hij is er héél trots op. Je krijgt 5 munten.'],
  steal: ['Flauwe mop', 'De man van zaal 3.14 neemt 2 munten mee en laat een mop achter: “Wat zegt de hoed tegen de muts? Ik sta boven je!”'],
  gift: ['Cadeautje bij de deur', 'Achter de deur van zaal 3.14 ligt een cadeautje. De man zwaait verlegen met een uitgeprinte agenda.'],
  dance: ['Teams-dansje', 'De man van zaal 3.14 doet een dansje. Een te lang dansje. Iedereen +1 munt, want applaus.'],
  hold: ['Deur open!', 'De man van zaal 3.14 houdt de deur voor je open: “Is deze ruimte nog bezet?” Je mag nog een keer gooien.'],
  comfort: ['Troostprijs!', 'De man van zaal 3.14 heeft medelijden met wie het minste heeft: die krijgt +4 munten. Hij noemt het “een bijdrage”.'],
};
const BOARD_WIN = ['{w} wint het duel! {l} was er ook bij. Dat staat in de notulen.', 'Wat een duel! {w} wint. {l} neemt de actiepunten mee.', '{w} pakt de winst. {l}: “Ik liet hem winnen, voor de teamgeest.”'];
const BOARD_PARTY = ['FEEST! De confetti-kanon ging per ongeluk af. Dat staat niet in het huishoudelijk reglement.', 'Feestvakje! Iemand heeft de muziek harder gezet. Niemand weet wie.', 'Polonaise door de kantoortuin! Jij voorop.'];
const BOARD_TEAM = ['{w} wint het teamspel! {l} had ook kunnen samenwerken. Volgend kwartaal misschien.', 'Teamwork! {w} wint. {l} geeft elkaar de schuld, vriendelijk.', '{w} pakt de winst. {l}: “Wij liepen gewoon warm.”'];
export function applyBoard(D) {
  if (!GAMEHAL || !D) return;
  const set = (list, map) => list.forEach((c) => {
    const t = map[c.id]; if (!t) return; c.title = t[0]; c.text = t[1];
    // varianten voor 3/4 spelers: de nieuwe tekst geldt voor alle aantallen, behalve als er een eigen variant is of de variant een naam ({o}) invult
    if (t[2]) c.text3 = t[2]; else if (c.text3 && !/\{o\}/.test(c.text3)) delete c.text3;
    if (c.text4) delete c.text4;
  });
  set(D.CARDS, BOARD_CARDS); set(D.DEUR_EVENTS, BOARD_DEUR);
  D.WIN_LINES.splice(0, D.WIN_LINES.length, ...BOARD_WIN); D.PARTY_LINES.splice(0, D.PARTY_LINES.length, ...BOARD_PARTY); D.TEAM_LINES.splice(0, D.TEAM_LINES.length, ...BOARD_TEAM);
}

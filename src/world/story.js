// Alle teksten van het verhaal. Spreker 'D' = Wes, 'S' = Jor.
export const D = 'Wes', S_ = 'Jor';

export const INTRO = [
  { text: 'Heitjesveen. Een rustig dorp met een taverne, een kasteel, een draak (of drie) en... heel veel karweitjes.' },
  { who: 'Jor', text: 'DAAN! KIJK! DutchTuber komt LIVE naar het kasteel! Met vuurwerk, een echt podium en alles!' },
  { who: 'Wes', text: 'Kaartjes kosten 600 heitjes. Voor ons samen, dan.' },
  { who: 'Jor', text: 'Hoeveel hebben wij?' },
  { who: 'Wes', text: '...Nul.' },
  { who: 'Jor', text: 'Nul is toch ook een getal?' },
  { who: 'Wes', text: 'Dan gaan we karweitjes doen! Het hele dorp heeft werk voor ons. Heitjes voor karweitjes. Samen lukt het vast.' },
  { text: '*kraaaaaak*', sfx: 'creak' },
  { who: 'Jor', text: 'Wes... waarom gaat onze voordeur vanzelf open?' },
  { who: 'Wes', text: 'Tocht.' },
  { who: 'Jor', text: 'We hebben alle ramen dicht.' },
  { who: 'Wes', text: '...Kom. Naar het dorp. Nu.' },
];

export const FIRST_DOOR = [
  { who: 'Jor', text: 'Wes. Er staat iemand in de deuropening.' },
  { who: 'Wes', text: 'Niet bewegen. Misschien ziet hij ons niet.' },
  { who: 'Jor', text: 'Hij heeft geen oren, maar ik denk dat hij ons wél hoort.' },
];

export const DEURMAN_HINTS = [
  'Houd je lantaarn (G / Shift) op de Deurman gericht. Daar kan hij niet tegen!',
  'De Deurman is bang voor licht. Richt je lantaarn en hij verdwijnt.',
  'Samen schijnen werkt sneller: allebei je lantaarn op hem!',
];

// ---- klus-NPC's ----
// intro: eerste keer, idle: daarna; ask: vraag; result: reactie na de klus (op sterren)
export const NPC = {
  catch: {
    intro: ['Aha, de gebroeders! Mijn oven heeft een eigen willetje vandaag: hij schiet het brood de lucht in.', 'Vang het in jullie manden! Vers brood op de grond is zonde. Verbrand brood... ook zonde, maar dan zonde van je manden.'],
    idle: ['Ruikt u dat? Dat is de geur van geld. Of van brood. Meestal allebei.', 'Mijn oven heeft het weer gedaan. Zin om te vangen?', 'Brood op de grond? Dat noemen wij hier: "grondbrood". Niet te vreten.'],
    ask: 'Brood vangen voor Bram?',
    res: ['Hmm. De eendjes in de rivier hebben veel gegeten vandaag.', 'Niet slecht! De klanten klagen alleen een beetje over zandkorreltjes.', 'Mooi gevangen! Jullie hebben vingers van goud!', 'PERFECT! Dit was het beste vangwerk sinds de Grote Croissantregen!'],
  },
  kitchen: {
    intro: ['Net op tijd! De taverne zit stampvol en mijn kok is... eh... weggelopen. Zegt hij.', 'Jullie nemen de keuken over: ingrediënten pakken, hakken, koken en serveren. Laat niets aanbranden!'],
    idle: ['De gasten hebben honger en geduld hebben ze niet.', 'Een ridder wil stoofpot. Een elf wil soep. Een dwerg wil gewoon alles.', 'Aanbranden is toegestaan. Maar niet in mijn pannen.'],
    ask: 'In de keuken helpen?',
    res: ['Mijn gasten eten nu vooral brood. Heel veel brood.', 'Geslaagd! Alleen die ene soep was een beetje... bruin.', 'Heerlijk! De ridder vroeg om jullie recept!', 'Een sterrenmaaltijd! Mijn taverne is vanavond uitverkocht dankzij jullie!'],
  },
  rhythm: {
    intro: ['Ah, de jonge muzikanten! Mijn snaren zijn gestemd en het publiek wil een deuntje.', 'Speel mee op de beat: raak de noten op het juiste moment. Als jullie samen een duet spelen gaat het publiek door het lint!'],
    idle: ['Een goed lied begint met een slecht idee.', 'Ik zou zelf spelen, maar mijn vingers zijn vandaag boos op me.', 'Het publiek staat klaar met het gooigeld!'],
    ask: 'Een duet spelen op het podium?',
    res: ['Het publiek is... beleefd weggelopen.', 'Een prima optreden! Er werd zelfs geklapt. Door twee mensen. En een kip.', 'Prachtig duet! De muntjes vlogen je om de oren!', 'LEGENDARISCH! Zelfs de kikkers in de vijver zingen jullie lied!'],
  },
  hotbomb: {
    intro: ['Hihi! Welkom bij de kermis! Ik ben Nico de Nar en ik heb een bom. EEN BOM! Een heel hete aardappel eigenlijk.', 'Wie hem vasthoudt als hij ontploft, is eruit. Geef hem door door iemand aan te tikken! Probeer slimmer te zijn dan mijn twee gekke vrienden.'],
    idle: ['Hihi! Heet, heet, heet!', 'De lont is kort en mijn geduld ook.', 'Wist je dat een nar nooit "au" zegt? Hij zegt "TA-DAA"!'],
    ask: 'Hete-aardappel-spel spelen?',
    res: ['Beng! Dat deed pijn... bij mij, ik moest lachen.', 'Redelijk overleefd! Mijn vrienden zijn nog steeds aan het jammeren.', 'Goed gespeeld! Zo hoort een broerenteam te werken!', 'ONGELOOFLIJK! Jullie lieten mijn vrienden ploffen als echte toverballen!'],
  },
  sokoban: {
    intro: ['Daar zijn ze. Het magazijn is een puinhoop: overal kratten die niet op hun plek staan.', 'Duw de kratten naar de gloeiende platen. Je kunt trekken noch tillen, alleen duwen. En let op dat jullie elkaar niet in de weg staan!'],
    idle: ['Een krat op zijn plek is een gelukkige krat.', 'Als je vastzit: begin opnieuw. Houd G / Shift ingedrukt.', 'Denk eerst, duw dan. Anders duw je jezelf in een hoekje.'],
    ask: 'Magazijn opruimen?',
    res: ['Het is er nog rommeliger dan eerst. Knap, dat is ook een talent.', 'Er staat al wat op zijn plek. Bijna goed!', 'Mooi opgeruimd. Je kunt weer lopen!', 'PERFECT! Elke krat staat waar hij hoort. Ik ben bijna ontroerd.'],
  },
  whack: {
    intro: ['Mollen! Overal mollen! Ze eten mijn kolen op en lachen me ook nog uit.', 'Pak de hamers en meppen maar. Niet de stekelvarkens raken, die zijn nog nooit blij geweest. En de reuzenmol? Die moeten jullie TEGELIJK raken.'],
    idle: ['Ik hoor ze lachen onder de grond.', 'Mijn kolen zijn mijn kinderen. Die mollen zijn... buren.', 'Een goede boer meppen alleen als het moet. En ik moet vaak.'],
    ask: 'Mollen meppen?',
    res: ['De mollen vieren feest. Dank je wel, hoor.', 'Veel mollen geraakt! Mijn kolen leven nog.', 'Prima werk! De mollen zijn onder de indruk.', 'LEGENDARISCHE MEPPERS! Zelfs de reuzenmol bood zijn excuses aan!'],
  },
  mudcart: {
    intro: ['Mijn kar zit muurvast in de modder! De melk wordt zuur en ik word chagrijnig.', 'Duw samen: tik in het ritme, links-rechts-links-rechts! Alleen als jullie tegelijk duwen komt hij los.'],
    idle: ['Modder is de vijand van de melkboer.', 'Ritme! Alles draait om ritme!', 'Ik zou helpen, maar ik moet dringend naar mijn schoenen kijken.'],
    ask: 'De kar uit de modder duwen?',
    res: ['De kar zit er nog steeds. Ik ga maar een boom planten.', 'Hij staat weer op de weg! Half melk, half modder.', 'Goed geduwd! Mijn rug zegt dank je wel.', 'WAT EEN KRACHT! De kar zoefde zo het dorp in!'],
  },
  goblins: {
    intro: ['Psst. Schaapherder Sjoerd hier. Elke nacht komen er goblins. Ze willen mijn schaapjes!', 'Verdedig de kooi. Schiet ze met je katapult, rol weg als het te heet wordt, en help elkaar overeind als je KO gaat.'],
    idle: ['Hoor je dat? Het gegrom? Dat zijn geen schapen.', 'Ik heb geteld: vijf schaapjes. Ik wil er morgen nog steeds vijf.', 'Kom \'s nachts terug als de maan op is.'],
    ask: 'De schapen verdedigen?',
    notNight: 'Goblins komen pas als het donker is. Kom terug in de avond of nacht — of ga slapen in jullie huisje!',
    res: ['Mijn schaapjes... mijn arme schaapjes...', 'Een paar schaapjes gered. De rest is nu avontuurlijker.', 'Goed geschoten! De goblins gaan met hangende oren naar huis.', 'GOBLINBEZWINGERS! Zelfs de koning ging huilend naar huis!'],
  },
  fishing: {
    intro: ['Sssst. Je moet stil zijn voor de vissen. Ik ben Floris, ik vis al veertig jaar en ik heb nog nooit... eh, genoeg gevangen.', 'Eén van jullie hengelt, de ander schept met het net. Na een tijdje ruilen jullie. En pas op voor de reuzenvis. Die is niet bang voor mij.'],
    idle: ['Vissen is wachten. En dan wat meer wachten.', 'Een laars is ook een vangst. Een slechte, maar toch.', 'Hoor je het? Het water fluistert.'],
    ask: 'Samen gaan vissen?',
    res: ['Alleen kroos gevangen. Het was ontspannend.', 'Een paar visjes! Net genoeg voor een stevige soep.', 'Mooie vangst! De vissen hebben respect voor jullie.', 'DE REUZENVIS! Dit verhaal vertel ik de rest van mijn leven!'],
  },
  potion: {
    intro: ['Kijk eens aan, twee nieuwsgierige jongens. Ik ben Hendrika, en ja, ik kook inderdaad iets in die ketel.', 'Mijn drank heeft een speciaal recept: de ingrediënten moeten in de goede volgorde. Jullie doen om en om één ingrediënt. Vergeet de volgorde en BOEM!'],
    idle: ['Pas op voor de spinnen. Ze zijn aardig, maar ze hebben honger.', 'Kikkerbilletjes zijn eigenlijk maar zelden kikkerbilletjes.', 'Mijn uil weet alles. Hij zegt het alleen nooit.'],
    ask: 'Samen de toverdrank maken?',
    res: ['De ketel is ontploft. Gelukkig was ik net... eh... ergens anders.', 'Niet slecht! De drank is groen. Dat hoort zo.', 'Heel goed gedaan! Mijn drank gloeit zelfs een beetje.', 'MEESTERLIJK! Dit is de beste drank in tweehonderd jaar!'],
  },
  plates: {
    intro: ['Welkom bij mijn grot, jongens! Stil een beetje: de draak slaapt. Heel diep. Hij heeft een korte lont.', 'Hier zijn deuren die alleen opengaan als iemand op een plaat blijft staan. Werk samen en kom allebei bij de uitgang.'],
    idle: ['Niet naar de draak kijken. Hij voelt het.', 'Ijs is glad. Lava is heet. Dat zijn de twee regels.', 'Ik graaf kristallen. De draak slaapt erop.'],
    ask: 'De Drakengrot in?',
    res: ['We hebben de draak bijna wakker gemaakt. Bijna.', 'Een paar kamers gehaald. Jullie leven nog, dat is al wat.', 'Goed samengewerkt! De draak snurkte door.', 'GEWELDIG! Jullie lopen door een grot of het een tuin is!'],
  },
  sweeper: {
    intro: ['Soldaten! Eh, jongens. Ik ben Kapitein Karel en mijn wachters trainen hun reflexen.', 'Een draaiende balk, een gracht vol water. Spring over de lage, duik onder de hoge. Als iemand valt: haal hem er samen uit!'],
    idle: ['Een goede wacht kijkt altijd om zich heen.', 'De gracht is... niet erg warm.', 'Wie goed springt, blijft droog. Dat is mijn motto sinds gisteren.'],
    ask: 'De wachters-training doen?',
    res: ['Plons. Plons. Nou ja, dat was te verwachten.', 'Prima! Jullie zijn nog bijna droog.', 'Goed gedaan, rekruten! Eh, jongens.', 'UITSTEKEND! Jullie mogen mijn helm een keer passen!'],
  },
  breakout: {
    intro: ['De oude kastelenmuur moet weg: daar komt een podium voor DutchTuber! Ik ben Mo, ik mag alleen metselen, geen slopen.', 'Dus jullie slopen. Kaats de sloopkogel terug met de planken en laat hem niet de grond raken. Samenspel levert bonuspunten op!'],
    idle: ['Stenen, stenen, stenen. En dan nog meer stenen.', 'Een muur is maar een mening die je kunt weerleggen.', 'Pas op voor de bommenstenen, die gaan met een knal.'],
    ask: 'Muur slopen?',
    res: ['De muur staat er nog. Hij lijkt zelfs trots.', 'Een flink gat! Daar kan een kip doorheen.', 'Mooi sloopwerk! Het podium kan komen.', 'Magnifiek! Er staat bijna niets meer overeind. Ik huil. Van geluk.'],
  },
  sumo: {
    intro: ['Gwoar! Ik ben Sumo-Sjaak. En jullie zijn broers. Broers moeten vechten. Dat is de wet van het ijs.', 'Duw elkaar van het ijs af! Wie in het water valt, verliest. Het ijs wordt steeds kleiner, dus wees snel.'],
    idle: ['Een sumoworstelaar valt niet. Hij glijdt gecontroleerd.', 'De ijsplaat wordt kleiner. Net als mijn geduld.', 'Eerlijk vechten, broers! Of nou ja: gelijk.'],
    ask: 'Een potje ijs-sumo?',
    res: ['Jullie vielen allebei in het water. Dat telt niet als winnen.', 'Een prima gevecht!', 'Spannend! Allebei goed gestreden.', 'EEN EPISCH DUEL! Mijn kleine sumo-hart klopt sneller!'],
  },
};

export const VILLAGER_LINES = [
  'Heb je de Deurman al gezien? Lang, bleek, altijd in een deuropening... Ik heb gezegd dat hij eens moet aankloppen.',
  'Mooi weer vandaag! Of het wordt donker. Of allebei.',
  'Mijn kip is weg. Hij staat altijd bij de fontein. Dat geloof ik tenminste.',
  'Wist je dat de draken eigenlijk best lief zijn? De groene tenminste.',
  'DutchTuber! Ik heb zijn kanaal bekeken tot drie uur \'s nachts. Mijn moeder weet het niet.',
  '\'s Nachts gaan hier deuren vanzelf open. Ik heb mijn deur vastgebonden met een touw. Hij is toch open.',
  'Je kunt in de fontein een munt gooien voor een wens. Mijn wens is nog niet uitgekomen. Ik had om een snelle fiets gevraagd.',
  'Er liggen gouden muntjes langs de wegen. Gewoon laten liggen? Niet doen!',
  'Zag ik daar een glinsterend deurknopje bij de rivier? Of was het een vis?',
  'Als je de moeras wilt: neem de brug. En kijk niet naar de ogen in het riet.',
  'Mijn opa zei altijd: "Ga nooit naar het kasteel als de maan op is." Maar hij zei ook dat de maan van kaas was.',
  'Ik ben geen wachter, ik zie er alleen zo uit.',
  'Oude Hendrika heeft een toverdrank die je laat zweven. Of laat lachen. Of laat... verdwijnen. Weet ik veel.',
  'De baas van de taverne zoekt nog een kok. Mijn tip: neem geen vis.',
];
export const ELDER_LORE = [
  { need: 0, text: 'Ach, de Deurman... Hij was vroeger de portier van het kasteel. Hij opende deuren voor iedereen die kwam. Ik was nog jong.' },
  { need: 2, text: 'Hij had acht gouden deurknoppen. Prachtig gewerkt. Die zijn op een nacht allemaal verdwenen. Sindsdien zoekt hij ze. Overal. In elk huis.' },
  { need: 4, text: 'Daarom opent hij elke deur die hij ziet. Hij zoekt zijn knoppen. En omdat hij niet praat, schrikt iedereen. Ach, die arme man.' },
  { need: 6, text: 'Misschien kunnen jullie ze terugvinden? Ze glinsteren. Ze liggen verspreid door het hele dorp. Ik ben te oud om te bukken.' },
];

export const BOOTH_LINES = {
  intro: ['Welkom bij het loket van DutchTuber LIVE! Eén kaartje is 300 heitjes, maar ik verkoop alleen aan tweetallen: 600 samen.', 'Geen kaartje, geen concert. Mijn baas kijkt mee. Hij staat achter je. Nee, niet kijken.'],
  noMoney: 'Je hebt nog niet genoeg heitjes. Ga karweitjes doen! Je hebt {need} heitjes meer nodig.',
  buy: 'Twee kaartjes voor DutchTuber LIVE! Het concert begint zodra het donker is, bij de poort van het kasteel. Veel plezier!',
  vip: 'Voor 400 heitjes extra krijgen jullie VIP-kaartjes: backstage ontmoeten! Maar... misschien hoeft dat niet, als je de Deurman blij maakt.',
  already: 'Jullie hebben al kaartjes! Ga naar de poort van het kasteel zodra het donker wordt.',
};

export const WISHES = [
  'Je wens: een snelle fiets. De fontein zegt: "Hmm, nee."', 'Je wens: nog een heitje. De fontein zegt: "Doe maar gewoon een karweitje."', 'Je wens: nooit meer de Deurman zien. De fontein giechelt zenuwachtig.',
  'Je wens: DutchTuber! De fontein knippert met een oog. Dat is een ja.', 'Plons! De fontein zegt: "Dank je. Ik heb net een nieuwe schoen nodig."', 'Je wens: een draak! De fontein zegt: "Kijk omhoog."',
];

// ---- eindscène ----
export const GATE_TALK = [
  { who: 'Deurman', text: 'Kaartjes.', creepy: true },
  { who: 'Jor', text: '(fluistert) Wes, hij praat.' },
  { who: 'Wes', text: 'Eh, hier. Twee kaartjes. Gewoon betaald. Met heitjes.' },
  { who: 'Deurman', text: 'Eindelijk... gasten die aankloppen. In plaats van weglopen.', creepy: true },
  { who: 'Deurman', text: 'Ik ben de Deurman. Ik open deuren. Maar iemand heeft mijn acht gouden deurknoppen gestolen. Ik zoek ze al jaren.', creepy: true },
];
export const GATE_ALL_KNOBS = [
  { who: 'Wes', text: 'Wacht. Misschien zijn dit ze?' },
  { who: 'Jor', text: 'We hebben ze ALLEMAAL gevonden! Acht gouden deurknoppen!' },
  { who: 'Deurman', text: '...', creepy: true },
  { who: 'Deurman', text: 'Mijn knoppen. Mijn mooie knoppen. Dank jullie wel. Dit is het aardigste dat iemand ooit voor mij deed.', creepy: true },
  { who: 'Deurman', text: 'Jullie zijn mijn gasten. Geen gewone kaartjes. Jullie gaan naar... BACKSTAGE.', creepy: true },
];
export const GATE_FEW_KNOBS = [
  { who: 'Jor', text: 'Sorry, meneer. We hebben er nog niet alle acht gevonden. Maar we blijven zoeken!' },
  { who: 'Deurman', text: 'Dat is... lief. Ga maar naar binnen. Veel plezier.', creepy: true },
];
export const AFTER_CONCERT = [
  { text: 'Het concert was onvergetelijk. Vuurwerk, een enorme speelhal, DutchTuber die iedereen toezwaaide...' },
  { who: 'Jor', text: 'Wes, dat was het BESTE wat ik ooit heb meegemaakt.' },
  { who: 'Wes', text: 'Zelfs de Deurman danste. Ik zag het.' },
  { text: 'En sindsdien gaat de voordeur nog steeds soms vanzelf open. Maar nu zwaaien ze gewoon terug.' },
];

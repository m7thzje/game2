// Alle teksten van het dorp. Het dorp is de plek voor karweitjes (heitjes verdienen); de Speelhal van Koning Klopper is het hart van het spel.
export const D = 'Wes', S_ = 'Jor';

// Korte begroeting bij het eerste bezoek aan het dorp
export const INTRO = [
  { text: 'Heitjesveen. Een gezellig dorp met een taverne, een kasteel, een draak (of drie) en... heel veel karweitjes.' },
  { who: 'Jor', text: 'Wes! Karweitje doen = heitjes verdienen. Heitjes = nieuwe hallen in de Speelhal!' },
  { who: 'Wes', text: 'En nieuwe hallen betekenen nieuwe duels. Waar jij gaat verliezen.' },
  { who: 'Jor', text: 'In je dromen. Kom, aan de slag!' },
];

// Eerste keer dat de Deurman in het dorp opduikt: een lieve grapjas
export const FIRST_DOOR = [
  { who: 'Jor', text: 'Wes. Er staat iemand in onze deuropening.' },
  { who: 'Wes', text: 'Dat is de Deurman. Hij houdt gewoon van deuren.' },
  { who: 'Jor', text: 'Hoi Deurman! Mooie deur, hè?' },
  { text: 'De Deurman knikt tevreden en houdt de deur nog even extra open.' },
];

// Tips die de Deurman-logica af en toe laat zien (hubdeur.js gebruikt deze lijst)
export const DEURMAN_HINTS = [
  'De Deurman is een grapjas. Zwaai maar eens!',
  'De Deurman verzamelt gouden deurknoppen en stickers. Hij is er gek op!',
  'Heb je al een Deurman-sticker? Zes stickers = de geheime Deurenhal in de Speelhal.',
];

// Hints/herinneringen als de spelers lang in het dorp zijn (hub.js laat er af en toe één zien)
export const HERINNERING = [
  'Koning Klopper belt: "Waar blijven jullie? Ik heb niemand om te verslaan!"',
  'Ergens in de verte roept iemand: "TOERNOOI! Er is weer een toernooi!"',
  'Je hoort een verre jingle... de Speelhal mist jullie.',
  'Een duif landt op je schouder. Hij draagt een briefje: "Kom spelen! Groetjes, Klopper."',
  'Wes: "Zullen we een potje gaan duelleren?" Jor: "Ik ga je zo verslaan!"',
  'De Deurman zwaait vanuit een deuropening. Hij wijst naar de Speelhal. Slimme meneer.',
  'Je maag rommelt. Of was dat de Speelhal-jingle? Toch maar even terug!',
];
export const HERINNERING_HAL = (naam, kost) => `Jullie hebben genoeg heitjes voor de ${naam} (${kost})! Terug naar de Speelhal: laat Klopper bouwen!`;

// ---- klus-NPC's ----
// intro: eerste keer, idle: daarna; ask: vraag; res: reactie na de klus (op sterren 0-3)
export const NPC = {
  catch: {
    intro: ['Aha, de gebroeders! Mijn oven heeft een eigen willetje vandaag: hij schiet het brood de lucht in.', 'Vang het in jullie manden! Verdien heitjes, dan laat Koning Klopper de Neonkelder bouwen. Ik hoor dat daar neonbroodjes zijn.'],
    idle: ['Ruikt u dat? Dat is de geur van geld. Of van brood. Meestal allebei.', 'Koning Klopper bestelt elke dag tien broden. Hij gooit ze naar zijn tegenstanders.', 'De Deurman bezorgde vanochtend mijn post... zonder brief. Wel met een stokbrood.'],
    ask: 'Brood vangen voor Bram?',
    res: ['Hmm. De eendjes in de rivier hebben veel gegeten vandaag.', 'Niet slecht! De klanten klagen alleen een beetje over zandkorreltjes.', 'Mooi gevangen! Jullie hebben vingers van goud!', 'PERFECT! Dit was het beste vangwerk sinds de Grote Croissantregen!'],
  },
  kitchen: {
    intro: ['Net op tijd! De taverne zit stampvol met mensen die net uit de Speelhal komen. Winnen maakt hongerig. Mijn kok is weggelopen. Zegt hij.', 'Jullie nemen de keuken over: ingrediënten pakken, hakken, koken en serveren. Laat niets aanbranden!'],
    idle: ['De gasten hebben honger en geduld hebben ze niet.', 'Koning Klopper eet hier elke dinsdag. Hij betaalt nooit. Hij zegt dat hij de koning is.', 'De Deurman hield de deur open voor tien gasten, bestelde niets en ging weer weg. Beste personeel ooit.'],
    ask: 'In de keuken helpen?',
    res: ['Mijn gasten eten nu vooral brood. Heel veel brood.', 'Geslaagd! Alleen die ene soep was een beetje... bruin.', 'Heerlijk! De ridder vroeg om jullie recept!', 'Een sterrenmaaltijd! Mijn taverne is vanavond uitverkocht dankzij jullie!'],
  },
  rhythm: {
    intro: ['Ah, de jonge muzikanten! Mijn snaren zijn gestemd en het publiek wil een deuntje.', 'Speel mee op de beat: raak de noten op het juiste moment. Goed gedaan? Dan krijg je heitjes voor de Speelhal!'],
    idle: ['Een goed lied begint met een slecht idee.', 'Koning Klopper danst op mijn liedjes. Hij zegt dat het training is voor het Dansmatten-duel.', 'De Deurman klopte vanmorgen op mijn deur. Heel beleefd. Daarna deed hij hem zelf open.'],
    ask: 'Een duet spelen op het podium?',
    res: ['Het publiek is... beleefd weggelopen.', 'Een prima optreden! Er werd zelfs geklapt. Door twee mensen. En een kip.', 'Prachtig duet! De muntjes vlogen je om de oren!', 'LEGENDARISCH! Zelfs de kikkers in de vijver zingen jullie lied!'],
  },
  hotbomb: {
    intro: ['Hihi! Welkom bij de kermis! Ik ben Nico de Nar en ik heb een bom. EEN BOM! Een heel hete aardappel eigenlijk.', 'Wie hem vasthoudt als hij ontploft, is eruit. Net als in de Speelhal, maar dan met een aardappel. Geef hem door!'],
    idle: ['Hihi! Heet, heet, heet!', 'In de Speelhal komt een Kermis-hal. Dan krijg ik een grotere aardappel!', 'Wist je dat een nar nooit "au" zegt? Hij zegt "TA-DAA"!'],
    ask: 'Hete-aardappel-spel spelen?',
    res: ['Beng! Dat deed pijn... bij mij, ik moest lachen.', 'Redelijk overleefd! Mijn vrienden zijn nog steeds aan het jammeren.', 'Goed gespeeld! Zo hoort een broerenteam te werken!', 'ONGELOOFLIJK! Jullie lieten mijn vrienden ploffen als echte toverballen!'],
  },
  sokoban: {
    intro: ['Daar zijn ze. Het magazijn is een puinhoop: overal kratten die niet op hun plek staan.', 'Duw de kratten naar de gloeiende platen. Je kunt trekken noch tillen, alleen duwen. En laat jullie elkaar niet in de weg staan!'],
    idle: ['Een krat op zijn plek is een gelukkige krat.', 'Als je vastzit: begin opnieuw. Houd G / Shift ingedrukt.', 'De Deurman heeft mijn kratten open gedaan. Het zijn kratten. Ze hadden geen deur. Hij deed het toch.'],
    ask: 'Magazijn opruimen?',
    res: ['Het is er nog rommeliger dan eerst. Knap, dat is ook een talent.', 'Er staat al wat op zijn plek. Bijna goed!', 'Mooi opgeruimd. Je kunt weer lopen!', 'PERFECT! Elke krat staat waar hij hoort. Ik ben bijna ontroerd.'],
  },
  whack: {
    intro: ['Mollen! Overal mollen! Ze eten mijn kolen op en lachen me ook nog uit.', 'Pak de hamers en meppen maar. Niet de stekelvarkens raken, die zijn nog nooit blij geweest. De reuzenmol moeten jullie TEGELIJK raken.'],
    idle: ['Ik hoor ze lachen onder de grond.', 'Mijn neefje speelt Mollen Meppen in de Speelhal. Hij is nog niet beter dan ik. Ik oefen dus gewoon veel.', 'Een goede boer meppen alleen als het moet. En ik moet vaak.'],
    ask: 'Mollen meppen?',
    res: ['De mollen vieren feest. Dank je wel, hoor.', 'Veel mollen geraakt! Mijn kolen leven nog.', 'Prima werk! De mollen zijn onder de indruk.', 'LEGENDARISCHE MEPPERS! Zelfs de reuzenmol bood zijn excuses aan!'],
  },
  mudcart: {
    intro: ['Mijn kar zit muurvast in de modder! De melk wordt zuur en ik word chagrijnig.', 'Duw samen: tik in het ritme, links-rechts-links-rechts! Alleen als jullie tegelijk duwen komt hij los.'],
    idle: ['Modder is de vijand van de melkboer.', 'In de Speelhal staan echte kartjes! Ik wil ook, maar mijn kar is... eh... iets trager.', 'Ik zou helpen, maar ik moet dringend naar mijn schoenen kijken.'],
    ask: 'De kar uit de modder duwen?',
    res: ['De kar zit er nog steeds. Ik ga maar een boom planten.', 'Hij staat weer op de weg! Half melk, half modder.', 'Goed geduwd! Mijn rug zegt dank je wel.', 'WAT EEN KRACHT! De kar zoefde zo het dorp in!'],
  },
  goblins: {
    intro: ['Psst. Schaapherder Sjoerd hier. Elke nacht komen er goblins. Ze willen mijn schaapjes!', 'Verdedig de kooi. Schiet ze met je katapult, rol weg als het te heet wordt, en help elkaar overeind als je KO gaat.'],
    idle: ['Hoor je dat? Het gegrom? Dat zijn geen schapen. Dat zijn goblins met honger.', 'Ik heb geteld: vijf schaapjes. Ik wil er morgen nog steeds vijf.', 'Kom \'s nachts terug als de maan op is.'],
    ask: 'De schapen verdedigen?',
    notNight: 'Goblins komen pas als het donker is. Kom terug in de avond of nacht, of ga slapen in jullie huisje!',
    res: ['Mijn schaapjes... mijn arme schaapjes...', 'Een paar schaapjes gered. De rest is nu avontuurlijker.', 'Goed geschoten! De goblins gaan met hangende oren naar huis.', 'GOBLINBEZWINGERS! Zelfs de goblins klapten voor jullie!'],
  },
  fishing: {
    intro: ['Sssst. Je moet stil zijn voor de vissen. Ik ben Floris, ik vis al veertig jaar en ik heb nog nooit... eh, genoeg gevangen.', 'Eén van jullie hengelt, de ander schept met het net. Na een tijdje ruilen jullie. En pas op voor de reuzenvis. Die is niet bang voor mij.'],
    idle: ['Vissen is wachten. En dan wat meer wachten.', 'Een laars is ook een vangst. Een slechte, maar toch.', 'De Deurman stond gisteren op mijn steiger. Met een deur. Er viel niks te openen, maar hij was erg tevreden.'],
    ask: 'Samen gaan vissen?',
    res: ['Alleen kroos gevangen. Het was ontspannend.', 'Een paar visjes! Net genoeg voor een stevige soep.', 'Mooie vangst! De vissen hebben respect voor jullie.', 'DE REUZENVIS! Dit verhaal vertel ik de rest van mijn leven!'],
  },
  potion: {
    intro: ['Kijk eens aan, twee nieuwsgierige jongens. Ik ben Hendrika, en ja, ik kook inderdaad iets in die ketel.', 'Mijn drank heeft een speciaal recept: de ingrediënten moeten in de goede volgorde. Jullie doen om en om één ingrediënt. Vergeet de volgorde en BOEM!'],
    idle: ['Pas op voor de spinnen. Ze zijn aardig, maar ze hebben honger.', 'Ik maak een drankje voor Koning Klopper. Het smaakt naar verlies. Hij vroeg erom.', 'Kikkerbilletjes zijn eigenlijk maar zelden kikkerbilletjes.'],
    ask: 'Samen de toverdrank maken?',
    res: ['De ketel is ontploft. Gelukkig was ik net... eh... ergens anders.', 'Niet slecht! De drank is groen. Dat hoort zo.', 'Heel goed gedaan! Mijn drank gloeit zelfs een beetje.', 'MEESTERLIJK! Dit is de beste drank in tweehonderd jaar!'],
  },
  plates: {
    intro: ['Welkom bij mijn grot, jongens! Stil een beetje: de draak slaapt. Heel diep. Hij snurkt als een stofzuiger.', 'Hier zijn deuren die alleen opengaan als iemand op een plaat blijft staan. Werk samen en kom allebei bij de uitgang.'],
    idle: ['Niet naar de draak kijken. Hij voelt het.', 'Ijs is glad. Lava is heet. Dat zijn de twee regels.', 'Ik graaf kristallen. De draak slaapt erop. De Deurman vond een deur in de grot. Ik weet het niet. Ik heb niks gezegd.'],
    ask: 'De Drakengrot in?',
    res: ['We hebben de draak bijna wakker gemaakt. Bijna.', 'Een paar kamers gehaald. Jullie leven nog, dat is al wat.', 'Goed samengewerkt! De draak snurkte door.', 'GEWELDIG! Jullie lopen door een grot of het een tuin is!'],
  },
  sweeper: {
    intro: ['Soldaten! Eh, jongens. Ik ben Kapitein Karel en mijn wachters trainen hun reflexen.', 'Een draaiende balk, een gracht vol water. Spring over de lage, duik onder de hoge. Als iemand valt: haal hem er samen uit!'],
    idle: ['Een goede wacht kijkt altijd om zich heen.', 'Koning Klopper traint hier ook. Hij zegt dat de balk van hem wint. Dat klopt.', 'Wie goed springt, blijft droog. Dat is mijn motto sinds gisteren.'],
    ask: 'De wachters-training doen?',
    res: ['Plons. Plons. Nou ja, dat was te verwachten.', 'Prima! Jullie zijn nog bijna droog.', 'Goed gedaan, rekruten! Eh, jongens.', 'UITSTEKEND! Jullie mogen mijn helm een keer passen!'],
  },
  breakout: {
    intro: ['De oude kastelenmuur moet weg: daar komt ruimte voor een nieuwe tent voor de Speelhal. Ik ben Mo, ik mag alleen metselen, geen slopen.', 'Dus jullie slopen. Kaats de sloopkogel terug met de planken en laat hem niet de grond raken. Samenspel levert bonuspunten op!'],
    idle: ['Stenen, stenen, stenen. En dan nog meer stenen.', 'Een muur is maar een mening die je kunt weerleggen.', 'Pas op voor de bommenstenen, die gaan met een knal.'],
    ask: 'Muur slopen?',
    res: ['De muur staat er nog. Hij lijkt zelfs trots.', 'Een flink gat! Daar kan een kip doorheen.', 'Mooi sloopwerk! Koning Klopper heeft weer ruimte.', 'Magnifiek! Er staat bijna niets meer overeind. Ik huil. Van geluk.'],
  },
  sumo: {
    intro: ['Gwoar! Ik ben Sumo-Sjaak. En jullie zijn broers. Broers moeten vechten. Dat is de wet van het ijs.', 'Duw elkaar van het ijs af! Wie in het water valt, verliest. Het ijs wordt steeds kleiner, dus wees snel.'],
    idle: ['Een sumoworstelaar valt niet. Hij glijdt gecontroleerd.', 'Koning Klopper heeft weer een toernooi! Ik heb me ingeschreven. Als zaalverwarming.', 'Eerlijk vechten, broers! Of nou ja: gelijk.'],
    ask: 'Een potje ijs-sumo?',
    res: ['Jullie vielen allebei in het water. Dat telt niet als winnen.', 'Een prima gevecht!', 'Spannend! Allebei goed gestreden.', 'EEN EPISCH DUEL! Mijn kleine sumo-hart klopt sneller!'],
  },
};

// Praatjes van de wandelende dorpelingen
export const VILLAGER_LINES = [
  'Heb je de Deurman al gezien? Lang, bleek, altijd in een deuropening. Hij is zo aardig. Hij houdt de deur voor me open. Ook als ik er al uit ben.',
  'Mooi weer vandaag! Of het wordt donker. Of allebei.',
  'Mijn kip is weg. Hij staat altijd bij de fontein. Dat geloof ik tenminste.',
  'Wist je dat de draken eigenlijk best lief zijn? De groene tenminste.',
  'Koning Klopper heeft weer een toernooi! Ik doe mee. Ik heb nog nooit gewonnen. Ik ben dus erg goed in meedoen.',
  'De Deurman bezorgde vanochtend mijn post... zonder brief. Wel een mooie lege envelop.',
  'Je kunt in de fontein een munt gooien voor een wens. Mijn wens is nog niet uitgekomen. Ik had om een snelle fiets gevraagd.',
  'Er liggen gouden muntjes langs de wegen. Gewoon laten liggen? Niet doen!',
  'Zag ik daar een glinsterend deurknopje bij de rivier? Of was het een vis?',
  'Als je het moeras in wilt: neem de brug. En kijk niet naar de kikkers, die geven je een zoen.',
  'Heitjes verdienen met karweitjes en dan naar de Speelhal: dat is het goede leven.',
  'Ik ben geen wachter, ik zie er alleen zo uit.',
  'Oude Hendrika heeft een toverdrank die je laat zweven. Of laat lachen. Of laat... niesen. Weet ik veel.',
  'De baas van de taverne zoekt nog een kok. Mijn tip: neem geen vis.',
  'In de Speelhal hebben ze een Luchthockey-tafel. Ik heb de puck nog nooit gezien. Hij is te snel. Of ik ben te langzaam.',
];

// Opa Okke vertelt (steeds meer, naarmate er meer klussen zijn gedaan) over de Deurman
export const ELDER_LORE = [
  { need: 0, text: 'Ach, de Deurman... Hij is al jaren onze dorpsportier. Hij opent deuren voor iedereen. Ook voor mensen die er al uit waren.' },
  { need: 2, text: 'Hij had acht gouden deurknoppen. Die zijn ooit verdwenen en sindsdien is hij er gek op. Hij kijkt in elk huis of er nog eentje ligt. Hij is erg beleefd. Hij klopt nooit aan.' },
  { need: 4, text: 'Hij plakt ook stickers. Zes stickers en hij laat je binnen in zijn geheime Deurenhal in de Speelhal. Dat weet ik van Koning Klopper. Die weet het van niemand.' },
  { need: 6, text: 'Misschien kunnen jullie die knoppen terugvinden? Ze glinsteren. Ze liggen verspreid door het hele dorp. Ik ben te oud om te bukken.' },
];

export const WISHES = [
  'Je wens: een snelle fiets. De fontein zegt: "Hmm, nee."', 'Je wens: nog een heitje. De fontein zegt: "Doe maar gewoon een karweitje."', 'Je wens: een gouden deurknop. De fontein zegt: "Kijk eens onder de bloemen."',
  'Je wens: nooit meer verliezen in de Speelhal. De fontein giechelt: "Nee."', 'Plons! De fontein zegt: "Dank je. Ik heb net een nieuwe schoen nodig."', 'Je wens: een draak! De fontein zegt: "Kijk omhoog."',
  'Je wens: dat Koning Klopper eens verliest. De fontein zegt: "Ik zal het proberen."',
];

// Straatpraatjes: korte grappen over de Speelhal-spellen. Een regel is tekst, of { t: tekst, w: 'Jor', r: reactie }.
export const STRAAT = {
  lotte: { who: 'Lotte van de Tipkraam', lines: [
    'Welkom bij de Tipkraam! Tip één: wie het eerst lacht, verliest bij Pingpong. Tip twee: er is geen tip twee.',
    'Mijn beste tip? Kom met heitjes terug uit het dorp. Dan laat Klopper de Neonkelder bouwen!',
    { t: 'Ik verkoop gratis tips. Dat is eigenlijk een slecht verdienmodel.', w: 'Jor', r: 'Mag ik een tip? Hoe versla ik Wes?' },
    'Tip van de dag: de Deurman helpt je niet met winnen. Maar hij kijkt wel heel enthousiast mee.',
    'Als je zes Deurman-stickers hebt, mag je naar de geheime Deurenhal. Ik heb er vijf. Zo gemeen.',
  ] },
  piet: { who: 'Pixel-Piet', lines: [
    'Ik ben de beste in Luchthockey! Tenminste... in mijn hoofd. Daar win ik altijd.',
    { t: 'Mijn duim doet pijn van het Flipperkast-duel. Ik heb er een pleister op gedaan. Een heel groot pleister.', w: 'Wes', r: 'Dat is een sok.' },
    'Weet je wat het moeilijkste duel is? Vliegen met Flappy. Ik ben vijf keer tegen een buis gevlogen. Ik ben nu vriendjes met de buis.',
    'Bij Tikkertje in de Speelhal ben ik altijd de tikker. Niemand weet waarom. Ik ook niet.',
    'Wes is vast beter dan Jor. Of Jor beter dan Wes. Ik durf niks te zeggen, jullie kijken zo.',
  ] },
  oma: { who: 'Oma Arcadia', lines: [
    'Vroeger hadden we alleen touwtjespringen. En nu 44 duels! Ik heb alles geprobeerd. Alleen Sumo niet. Mijn heup.',
    { t: 'Ik ben de Pacman-kampioen van Heitjesveen. Ik eet alles op. Ook mijn eigen punten.', w: 'Jor', r: 'Dat is het idee, oma.' },
    'Mijn kleinzoon verloor van me bij Vier op een Rij. Hij huilde. Ik gaf hem een koekje. Daarna won ik weer.',
    'De Deurman komt elke week langs om mijn deurknop te bewonderen. Hij draagt hem nooit weg. Wel heel lang kijken.',
    'Neem karweitjes aan, jongens! Heitjes zijn de brandstof van de Speelhal. Net als pepermunt van oma.',
  ] },
  rick: { who: 'Ridder Rick', lines: [
    'Ik bewaak de weg naar de Speelhal! Eigenlijk gewoon een stukje zand, maar ik doe het heel serieus.',
    { t: 'Ik versloeg gisteren Koning Klopper bij Armpje Drukken. Hij zegt dat hij me liet winnen.', w: 'Wes', r: 'Dat zegt hij altijd.' },
    'Mijn zwaard is stuk. Ik gebruik nu een stok. Hij heet Zwaard II.',
    'De Deurman liep gisteren langs en hield voor me de poort open. Er is geen poort. Hij nam hem mee.',
    'Neonkelder, Kermis, Sporthal: drie hallen die nog gebouwd moeten worden. Ik heb er al een bank besteld.',
  ] },
  joop: { who: 'Joystick-Joop', lines: [
    'Mijn joystick is kapot. Ik gebruik nu een pastinaak. Werkt prima. Beetje glibberig.',
    { t: 'Ik oefen elke dag voor het Toernooi. Nog twee weken en dan win ik. Dat zeg ik al twee jaar.', w: 'Jor', r: 'Dat noemen we vol houden.' },
    'Bij Kratten Schuiven in de Speelhal ben ik de beste. Alleen bij de echte krat niet. Die is zwaar.',
    'Wil je weten hoe je wint bij Tanks? Rijd weg. Dat is mijn hele plan.',
    'De Deurman stond vanochtend in mijn schuur. Met een gouden knop! Ik vroeg of hij hem kwijt was. Hij schudde nee. Het was zijn nieuwe knop.',
  ] },
  pieter: { who: 'Poortwachter Pieter', lines: [
    'Het kasteel is vandaag dicht! Koning Klopper zit al de hele dag in zijn Speelhal. Hij is bezig met winnen.',
    { t: 'Ik mag niemand binnenlaten. Ook de Deurman niet. Maar die komt gewoon... door de deur. Elke keer.', w: 'Wes', r: 'Hij is ook de Deurman.' },
    'Nu de koning in de Speelhal zit, bewaak ik een lege poort. Het is eenzaam. Soms speel ik mezelf bij Boter-Kaas-en-Eieren. Ik verlies altijd.',
    'Een gouden deurknop? Niet bij mij! Probeer langs de oude kasteelmuur.',
    'Zoek je de Speelhal? West, voorbij de brug. Je ziet de roze lichtzuil. Hij is helemaal niet opvallend.',
  ] },
};

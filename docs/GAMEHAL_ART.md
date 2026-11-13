# impactID Gamehal — art direction (bindend voor iedereen die aan het uiterlijk werkt)

Probleem nu (screenshots 1100x650, 4 spelers): de hal is een kermis. Paars/roze schaakbordvloer, ballonnen, confetti, vlaggetjes,
tien verzadigde kastkleuren door elkaar, 3 labels per kast (naam + badge + "NIEUW!"), vloertekst die half afgesneden is,
HUD-vakken en toasts die over elkaar vallen, een hint-balk onderin die over het rangpaneel valt, en **de spelers zijn niet te zien**
(ze staan achter kasten). De lobby is wél goed: rustig, wit/blauw, logo. De hal moet dezelfde rust en klasse krijgen.

**Alles in dit document geldt alleen onder `GAMEHAL` (src/variant.js). De gewone versie (index.html) blijft er exact zo uitzien als nu.**
Lees ook `docs/IMPACTID_STIJL.md` (palet, lettertype, toon) en `docs/PLAYERS4.md`.

## Het idee: "het mooiste kantoor van Nederland, na vijven"
Een strak, modern impactID-kantoor dat stiekem een gamehal is: gepolijste donkerblauwe vloer, witte meubels en kasten,
zachte blauwe gloed, veel lucht. De grap zit in de herkenbare kantoor-details (koffieautomaat, kanban-bord met post-its, de ficus,
flexplekken, een vergaderzaal die altijd bezet is), niet in drukte. Denk: Apple Store × Monument Valley × een kantoortuin.

## Palet (3D en UI)
| rol | kleur | gebruik |
|---|---|---|
| nacht | `#001a38` | vloer (basis), achtergrond/mist |
| impact-blauw | `#003872` | wanden, grote vlakken, kastvoeten |
| accent-blauw | `#007fd8` | gloed, lijnen, actieve dingen, knoppen |
| lucht | `#99ccef`, `#e0effa` | zachte highlights, glas, tekst op donker |
| wit | `#ffffff` / `#f4f8fc` | kasten, meubels, borden, kaarten |
| inkt | `#26313f` | tekst op wit |
| product-accenten | oranje `#ff3a00`, roze `#cc0254`, groen `#00912b` | **klein**: maximaal ~10% van het beeld |

Elke hal heeft **één** accentkleur naast blauw/wit: De Kantine = oranje (warm, hout-accenten `#d9b38c` mogen), De Serverruimte = cyaan/blauwe gloed
(donkerder, `#00d0ff` voor ledjes), De Vrijdagborrel = roze, Het Teamuitje = groen, Vergaderzaal 3.14 = wit/grijs glas met één rood "BEZET"-lampje.
Spelerskleuren (groen `#35c46f`, blauw `#4a8cff`, oranje `#ff9a3c`, paars `#d45cf0`) zijn heilig en alleen voor spelers.

## Vormtaal en materiaal
* Afgeronde, zachte vormen (afgeschuinde hoeken, pil-vormen, cirkels); het impactID-beeldmerk is een **ripple** (concentrische ellipsen): gebruik ripples als vloerpatroon, als zone-markering en als lichtring.
* Mat, licht glanzende materialen; emissive alleen voor schermen, ledlijnen en neon. Geen textuur-ruis, geen schaakbord, geen stippen/strepen-tapijten.
* Typografie in de wereld (borden, vloer, kastlabels): Plus Jakarta Sans ExtraBold (font staat in `css/fonts/`, wordt geladen door gamehal.html; canvas-teksten pas tekenen als `document.fonts.ready`), labels in HOOFDLETTERS met letterafstand, wit op blauw of inkt op wit. Nooit tekst die uit beeld loopt of wordt afgesneden.
* Licht: helder en zacht. Eén warme key light, een blauwe rim/fill, zachte schaduwen; personages moeten goed uitgelicht zijn (in de lobby zijn ze nu te donker). Mist in nachtblauw, niet zwart.

## Rust-regels (het belangrijkste)
1. **Weg in de Gamehal**: ballonnen, confetti, vlaggenlijnen, "NIEUW!"-tags, de kleurige stippen/cirkel-tapijten, het paarse schaakbord, losse kermisprops.
2. **Eén label per kast**: de naam op een strak wit pil-bordje met een klein badge-chipje (👥 2–4 / 👥 4 / 🏆) erin. Leesbaar op 1100x650, niet overlappend met de buurkast. Het label van de kast waar een speler bij staat mag groter/oplichten; de rest mag kleiner of op afstand vervagen.
3. **Kasten zijn familie**: één kastmodel (wit met blauwe voet, afgeronde kap, scherm met het spel-icoon/emoji en zachte gloed), per zone één accentkleur als dunne ledlijn en schermtint. Geen tien felle kastkleuren.
4. **Zones** zijn rustige ronde vloer-eilanden: een ripple-ring in de zonekleur met de zonenaam strak langs de rand (volledig leesbaar, naar de camera toe), en één herkenbaar kantoor-object als blikvanger.
5. **Negatieve ruimte**: looppaden blijven leeg; spawn in een open plein. Minder is beter.
6. **Spelers altijd zichtbaar**: wat tussen camera en speler staat (kasten, zuilen) wordt doorzichtig of zakt weg; spelers hebben een gekleurde grondring + naam.

## HUD in de hal
* Boven: één smalle balk (pil) met de vier namen in spelerskleur + aantal winsten en de impact-punten; **geen** vier losse vakken met toetsen in de hal (die horen in een spel). Toasts verschijnen onder die balk en overlappen niets.
* Onder: het prompt-paneel (wie kan wat doen) compact; het rangpaneel linksonder klein; de lange uitlegregel verdwijnt na de eerste keer (of wordt een kleine "? Hoe werkt het"-chip).
* Niets overlapt iets anders op 1100x650 en op 1920x1080.

## Kantoor-humor in beeld (set dressing per hal)
* **De Kantine**: koffieautomaat ("Koffie is op"-lampje), lange houten tafel met broodtrommels, de ficus, een tosti-ijzer, een prikbord.
* **De Serverruimte**: serverrekken met knipperende ledjes, kabelgoten, een rode noodknop onder plexiglas, een bordje "Niet aanraken. Echt niet.".
* **De Vrijdagborrel**: een bar met tapkraan, statafels, een schaal bitterballen, lichtslinger (subtiel), een dj-tafeltje.
* **Het Teamuitje**: sportvloer-lijnen, een scorebord, een krat sportdrankjes, pionnen, een podium.
* **Vergaderzaal 3.14**: glazen wand met matglas-strepen, een lange vergadertafel met stoelen, een scherm met "Even geduld, het scherm wordt gedeeld…", een whiteboard vol post-its, en het bordje **BEZET**. De Deurman kijkt om de deur.
* Overal: whiteboards met een kanban (To do / Doing / Done; in Done hangt bijna niets), flexplekken met twee schermen, de ficus.
Geen echte namen, klanten of interne gegevens.

## Budget en techniek
* Per hal maximaal ~260 draw calls en ~130k driehoeken (nu ~205 / 59k): merge geometrie, gebruik InstancedMesh, deel materialen. Bij `S.settings.quality === 'low'` minder props en geen schaduwen.
* Alles procedureel (geen downloads behalve het bestaande logo/font). Canvas-texturen: niet groter dan 1024, hergebruik.
* Nieuwe code bij voorkeur in `src/gamehal/` (bijv. `look.js`, `cabs.js`, `props.js`, `hud.js`), met kleine haakjes in `src/world/arcade*.js` achter `GAMEHAL`. Lees een gedeeld bestand vlak vóór elke Edit opnieuw: er werken meer agents tegelijk.
* Colliders: props mogen looppaden en kast-interactiepunten niet blokkeren; `tools/hallstest.mjs` (Gamehal) moet alle kasten kunnen bereiken.

## Klaar als
`GAMEHAL=1 PLAYERS=2|3|4 node tools/hallstest.mjs`, `GAMEHAL=1 PLAYERS=4 node tools/e2e.mjs`, `node tools/hallstest.mjs`, `node tools/e2e.mjs` groen;
screenshots (`GAMEHAL=1 PLAYERS=4 node tools/hallshot.mjs <hal> start mid zone0 …`, ook met `QUALITY=high` als de tool dat kent, en op 1920x1080)
kritisch bekeken: rustig, samenhangend, impactID-blauw/wit, spelers zichtbaar, niets overlapt, alle tekst leesbaar.

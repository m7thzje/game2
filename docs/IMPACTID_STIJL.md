# impactID-huisstijl voor de Gamehal

Bron: het impactID-designsysteem (tokens, lettertypen) uit de eigen impactID-artifacts van de opdrachtgever (digitale visitekaart, impactIDstart-landingspagina, "Our story"-pagina) en de Designbriefing impactID.nl (huisstijl). Alleen kleuren, lettertypen, logo, vormtaal en toon zijn overgenomen. Geen namen, klanten, adressen of contactgegevens.

Niet gebruikt, want andere organisaties met een eigen huisstijl: de roll-up "stages IT Hub" (Barlow Condensed, marine #111C4E + geel #EEE400), de DTZ-e-mailhandtekening en de "VO on Tour"-visual (Dutch TechZone: Open Sans + vijfkleurenstreep). Die horen niet in de Gamehal.

## Samenvatting
impactID maakt software voor NGO's en non-profits. Merk: donkerblauw + helder blauw, veel wit, Plus Jakarta Sans (ExtraBold voor koppen), afgeronde kaarten en pil-knoppen, de "ripple" (kringen in water) als beeldmerk. Toon: warm, direct, kort, mensgericht, een tikje droog. Missie-gedreven, niet "standaard softwarebedrijf".

## Kleurtokens (hex, exact uit `tokens.json`)
Merk
| token | hex | gebruik |
|---|---|---|
| `--blue-900` (merk) | `#003872` | koppen, primaire knop, donkere vlakken |
| `--blue-700` | `#33608e` | gedempte tekst |
| `--blue-400` | `#99afc7` | subtiele tekst, strong border |
| `--blue-200` | `#ccd7e3` | standaard rand |
| `--blue-100` | `#ebeff4` | muted vlak, subtiele rand |
| `--blue-50` | `#f5f7f9` | subtiel vlak |
| `--sky-600` (accent) | `#007fd8` | accent, links, "ID" in het logo, focus |
| `--sky-500` | `#3399e0` | lichter accent |
| `--sky-300` | `#99ccef` | zacht accent, tekst op donkerblauw |
| `--sky-200` | `#cce5f7` | |
| `--sky-100` | `#e0effa` | accentvlak |
| `--white` / `--black` | `#ffffff` / `#111111` | |
| tekst body | `#26313f` | lopende tekst |

Productaccenten (alleen als klein accent, nooit als merkkleur; elk heeft schakeringen 100-600)
| product | 600 | 500 | 300 | 200 | 100 |
|---|---|---|---|---|---|
| FundWise (oranje) | `#ff3a00` | `#ff6133` | `#ffb099` | `#ffd8cc` | `#ffe8e0` |
| ProjectConnect (roze) | `#cc0254` | `#d63576` | `#eb9abb` | `#f5ccdd` | `#f9e0eb` |
| FieldCollab (groen) | `#00912b` | `#33a755` | `#99d3aa` | `#cce9d5` | `#e0f2e6` |

Verlopen (de "ripple/kleurverloop", licht naar merkblauw, echo van de ringen)
* `gradient-ripple`: `radial-gradient(circle at 50% 0%, #007fd8 0%, #003872 60%)` (hero's, donkere vlakken)
* `gradient-brand`: `linear-gradient(135deg, #ffffff 0%, #007fd8 55%, #003872 100%)`
* `gradient-sky`: `linear-gradient(135deg, #e0effa 0%, #007fd8 100%)`

Schaduwen (blauwgetint): `--shadow-sm 0 2px 6px rgba(0,56,114,.08)`, `--shadow-md 0 8px 24px rgba(0,56,114,.10)`, `--shadow-lg 0 18px 48px rgba(0,56,114,.14)`, focusring `0 0 0 4px rgba(0,127,216,.28)`.

Spelerskleuren van de Gamehal (groen, blauw, oranje, paars) blijven zoals ze zijn en staan los van de huisstijl.

## Lettertype
* Familie: **Plus Jakarta Sans** (Google Fonts, SIL OFL). Koppen: ExtraBold 800, krap (`letter-spacing -0.01em`, regelhoogte 1.08). Body: Regular 400, UI: Medium/SemiBold 500-600, regelhoogte 1.55.
* Hoofdletters en pay-off: `text-transform: uppercase; letter-spacing: 0.08em` ("tracking 80", huisregel), vaak Bold 700 in `#007fd8`.
* Schaal: display 68px, h1 48, h2 36, h3 26, h4 20, lg 18, base 16, sm 14, xs 12.
* In de repo: `css/fonts/PlusJakartaSans-Variable.ttf` (lokale kopie, 200-800) + Google Fonts-link in `gamehal.html`; fallback `system-ui, "Segoe UI", sans-serif`.

## Logo
* **Er is geen SVG van het logo te vinden**: in alle impactID-artifacts staat het logo als PNG (663 x 334, transparant). Het is niet benaderd of nagetekend.
* `img/impactid/logo.png`: het originele logo, byte-voor-byte (ripple met bol, woord "impactID" met donkerblauw "impact" en `#007fd8` "ID", regel "CONTRIBUTE TO A FAIR WORLD").
* `img/impactid/logo.svg`: dezelfde PNG verpakt in een SVG (ingebed, dus nog steeds geen vector). Handig als `<img>`/favicon-bron; schaalt niet scherper dan het origineel.
* `img/impactid/beeldmerk.png`: alleen de ripple (uitsnede van `logo.png`, 565 x 159, transparant).
* `img/impactid/icon.png` / `icon.svg`: favicon/app-icoon: de ripple-uitsnede op een `gradient-ripple`-tegel met afgeronde hoeken (256 x 256).
* Er is geen wit/negatief logo. Het donkerblauwe "impact" verdwijnt op een donkere ondergrond: zet het logo daarom op **wit** of op een witte afgeronde plaat (zo gebruikt de Gamehal het in de lobby en op het neonbord). Het woord alleen op donkerblauw zetten kan in tekst (Plus Jakarta Sans ExtraBold, wit + `#99ccef`), maar dat is dan geen logo.
* Een hoger-resolutie bestand ontbreekt; het logo wordt in de Gamehal nooit groter dan zijn 663 px getoond (op scherm met pixelratio 2 is dat maximaal ~330 css-px breed om scherp te blijven).

## Vormtaal
* Hoeken: `--radius-sm 6`, `md 10`, `lg 16`, `xl 24`, knoppen en tags `pill 999px`, avatars/bollen `50%`. Kaarten zijn wit met `radius-xl` (24px), rand `#ccd7e3`, schaduw `md`.
* Knoppen: pil-vorm. Primair `#003872` met witte tekst, accent `#007fd8`, secundair wit met 1.5px rand `#003872`. Hover: iets lichter/donkerder blauw, `translateY(-1px)` en schaduw; actief `scale(.97)`. Hoogte 48-54px.
* Eyebrow-labels boven koppen: klein, uppercase, tracking 0.08em, SemiBold, `#33608e` (of `#99ccef` op donker).
* Vlakken: veel wit, een lichte tint (`#f5f7f9`), donkerblauw voor nadruk. Geen fotoringen of zwevende bollen meer (briefing: "minder decoratie").
* Het beeldmerk is de ripple: concentrische ellipsen die uitwaaieren. Beweging: rustig, `ease-out cubic-bezier(0.16,1,0.3,1)`, 140-420 ms; ringen die langzaam uitdijen en vervagen.
* Iconen: eenvoudige lijniconen (stroke 2-2.6, ronde uiteinden), niet te veel.

## Toon (voorbeelden van hoe impactID schrijft)
* "From code to compassion."
* "Stop copying the same update into five places."
* "Good people shouldn't spend their evenings in spreadsheets."
* "Their time belongs to their mission."
* "Your mission is to change lives or protect the planet. Ours is to give you the time to do it."
* "We never built it for NGOs. We built it with them."
* "Made by people. Shaped by our partners."
* "Let's team up and make a difference where it matters." / "Let's connect" / "Get your free demo"
* Pay-off: "Contribute to a fair world" (hoofdletters, tracking 80).
* Het logo is "a ripple: impact starts in one place and spreads outward, through people, partners and networks."
* Waarden: Stewardship, Transparency, Trust, Collaboration.
* Kenmerken: korte zinnen, actief, "je/jij" (NL) of "you" (EN), begrijpelijk (geen jargon), menselijk, concreet in plaats van groots; humor mag, maar droog en warm, nooit ten koste van de mensen. Liever een verbinding ("samen", "met") dan een slogan. De briefing zegt het zelf: niet overkomen als standaard softwarebedrijf, maar als een bedrijf "met een mooie duidelijke missie".

## Doe / laat (voor de Gamehal)
Doe
* Logo op wit of op een witte plaat; alleen het originele bestand, niet vervormen, niet kleuren.
* Donkerblauw `#003872` + `#007fd8` + wit als basis; lichtblauw `#99ccef`/`#e0effa` voor gloed en tekst op donker.
* Plus Jakarta Sans ExtraBold voor titels, uppercase met tracking 0.08em voor labels en pay-off.
* Pil-knoppen, afgeronde (24px) witte kaarten met blauwe schaduw, ripple-gloed (radiale verlopen) als "neon".
* Productkleuren (oranje, roze, groen) hooguit als klein accent in decor/labels.
* Korte, warme, droge zinnen; met een knipoog naar de ripple ("het begint bij één speler en waaiert uit").

Laat
* Het logo op donkerblauw of op felle neonkleuren zetten, nabouwen, nabootsen of de kleuren omwisselen.
* Een hele pagina/zaal in een productkleur (roze, oranje, groen) zetten.
* Cirkelfoto's met ring, zwevende bollen, veel verlopen door elkaar.
* Andere lettertypen (Fredoka, MedievalSharp) in impactID-elementen: die blijven alleen voor de spelletjes zelf.
* Gedateerd/jargon-taal, uitroeptekens op elke regel, grappen ten koste van collega's of sector.

## Wat niet te achterhalen was
* Een vector-logo (SVG/AI/EPS): alleen PNG gevonden; geen negatief/wit logo.
* Exacte regels voor beschermzone en minimale logogrootte: niet in de gelezen bronnen (het Huisstijlhandboek 2026 zelf is niet gelezen, alleen de tokens en de briefing).
* Het ExtraBold-snit staat als apart bestand in het designsysteem; in de repo is alleen het variabele font (weight 800) opgenomen, dat is visueel gelijk.

## Hoe de Gamehal dit toepast
* `gamehal.html`: `<body class="gamehal">`, favicon `img/impactid/icon.png`, Plus Jakarta Sans.
* `css/gamehal.css`: tokens `--ii-*` (hierboven) onder `:root`, componenten gescoped met `body.gamehal`.
* 3D: lobby-achterwand, neon, truss en spots in impactID-blauw/wit/roze; `src/world/arcade_decor.js`: `impactidSign()` (logo-reclamezuil) in de hal.
* Scherpte: zie `S.settings.sharp` in `src/game.js` en de menuregel "Scherpte" in de lobby.

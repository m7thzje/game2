# Impactid Gamehal — 4 spelers, zonder dorp (contract voor alle onderdelen)

Een **aparte versie** van het spel naast de gewone: `gamehal.html` (titel "Impactid Gamehal"). Zelfde code-basis, eigen opslag,
geen dorp/opening/karweitjes: je start direct in de Speelhal. De gewone versie (`index.html`) blijft **exact werken** zoals nu
(2 of 3 spelers). Alles wat hieronder staat is een uitbreiding van `docs/PLAYERS3.md` (lees die eerst) van 3 naar **4 spelers**.

## Spelers
* Spelers-id 0 Wes, 1 Jor, 2 Juul, 3 **Sam** (standaardnaam, in de Gamehal-lobby aan te passen: klik op de naam). `S.names` heeft altijd 4 items.
* `S.settings.players` = 2 | 3 | 4. (Gewone versie biedt alleen 2|3 aan in het menu; 4 kan alleen in de Gamehal of met `?players=4`.)
* Kleuren (`PLAYER_COLORS/CSS`, index = id): Wes groen, Jor blauw, Juul oranje, **Sam paars/magenta** (duidelijk anders dan de rest). Sam krijgt een eigen look (bijv. paarse hoodie, pet achterstevoren, grote grijns) via `BROTHER_SPECS[3]`; hoedjes/kleuren (`cosmetics.js`) werken ook voor Sam.
* Toetsenbord Sam: lopen **Numpad 8 4 5 6** (Numpad2 ook = omlaag), A = **Numpad7**, B = **Numpad9**. `BASE_KEY_LABELS[3] = { move: 'Numpad 8456', a: 'Num7', b: 'Num9' }`. Gamepad 4 = Sam. (Eerlijk: 4 spelers op één toetsenbord geeft ghosting; in de lobby staat een tip "gebruik gamepads of online".)

## Engine-kern (`src/engine/*`, `src/save.js`)
* Alles wat nu "altijd 3" is wordt "altijd **4**": `input.all` (4 ruwe staten), `KEYMAP[3]`, `input.virtual` (4), `input.pads`, `PLAYER_COLORS/CSS`, `BASE_KEY_LABELS`, `S.names`, `S.arcade.wins`, `byGame[id].wins`, cosmetics. `migrate()` vult oude opslag aan tot 4. `input.update()` leest speler i alleen als `i < S.settings.players`. `isGameKey` idem.
* `input.mapSlots(ids)` / `setSlotPlayers(ids)` / `ui.hud.setSlots(ids)` accepteren 2, 3 of 4 id's. `input.setRemote(playerId, ...)`: playerId 1, 2 of 3.
* `party.js`: `playerCount()` 2|3|4, `activeIds()`, `pairsOf`, `DuelQueue` werkt voor 2..4 spelers (bij 4: twee spelers spelen, twee wachten; winnaar blijft). **Nieuw: `class Bracket`** — knock-out voor 4 spelers (of 3: 1 bye) met 1-tegen-1-spellen: `new Bracket(ids, {seed})`; `b.round()` -> `{ name: 'Halve finale 1/2' | 'Finale' | 'Troostfinale'?, pair:[a,b] }` of `null` als klaar; `b.report(winnerId)`; `b.done`; `b.standings()` -> id's van 1e..4e plaats; `b.label()` voor de intro. Zo kan **elk 1-tegen-1-spel** met 4 spelers (2 halve finales, dan finale, + optioneel troostfinale om de 3e plek) en blijft de rest kijken.
* Harness (`resolveParticipants`): `extra.players` = 2..4 unieke id's. `def.players` = lijst ondersteunde aantallen (standaard `[2]`; bijv. `[2,3,4]` of `[4]`, `[2,4]`). Is het aantal gevraagde spelers niet ondersteund -> eerste 2 (zoals nu). `ctx.players.length` = deelnemers (2..4). `ctx.pvp.input(slot)`, `speed/size(slot)` voor slot 0..3. `ctx.teams` = `null` of, als `extra.teams` (bijv. `[[0,1],[2,3]]` in SLOTS) is meegegeven en het spel `def.teams: true` declareert, die indeling; de kleur van het team is die van het eerste lid. Teams-spellen melden winnaars via `finishPvp({ winners: [slot, slot], score:[...] })`; `winner` (enkelvoudig slot) blijft werken. Resultaat krijgt `result.winnerIds` (array spelers-id's, leeg bij gelijkspel), `result.winnerId` (eerste), `result.ids`, `result.scoreById`, `result.place` = spelers-id's gesorteerd op score (1e eerst; bij teams eerst de winnaars). Statistieken (`wins`, `byGame`, streak) tellen voor alle winnaars. HUD: **4 vakken** (2 in de bovenhoeken + 2 daaronder, compact) + timer in het midden; intro en resultaatkaart tonen 4 spelers (resultaat met 1e-4e plaats). `modeTxt`: `Voor 4 spelers` (alleen 4), `2 tot 4 spelers`, `Duel: 1 tegen 1`.
* Twists werken bij 4 spelers (`bodyswap`: willekeurig paar of twee paren wisselen; `giant`: 1 reus, rest dwerg; `deurman`: alle slots tellen).
* Revanche/series: `SERIES` per sleutel van gesorteerde id's blijft werken voor 2..4.

## Een spel declareert (4 spelers)
```js
players: [2, 3, 4],      // ondersteunde aantallen; alleen-4: [4]; teamspel: [2, 4] + teams: true
teams: true,             // (optioneel) bij 4 spelers 2 tegen 2, indeling in ctx.teams (slots)
```
Gebruik `const N = ctx.players.length` en loop over slots `0..N-1`; hardcode nergens 2 of 3. Spelers die niet spelen (bij 2 uit 4) bestaan niet in het spel (geen slot). Een 4-speler spel moet bij N=2,3,4 bruikbaar blijven als `players` die aantallen noemt; test elk aantal.

## Gamehal-wereld (`gamehal.html`, `src/gamehal/*`, `src/variant.js`)
* `gamehal.html` = kopie van `index.html` met `<script>window.GAMEHAL = true</script>` vóór de module, titel "Impactid Gamehal", dezelfde `css/` en `lib/`. `src/variant.js` exporteert `GAMEHAL` (bool: `window.GAMEHAL === true`). **Eigen opslag**: bij `GAMEHAL` is de localStorage-sleutel `impactid_gamehal_v1` (anders blijft `heitjes_voor_karweitjes_v1`). Standaard `S.settings.players = 4`, `unlockAll = true` (alle hallen open, geen Deurenhal-stickers nodig), geen Deurman-schrik buiten de Deurenhal-spellen (`scare` standaard 0 tenzij ingesteld).
* Geen dorp, geen opening, geen Slotfeest, geen karweitjes-menu. Flow: **Lobby** (titel "Impactid Gamehal", kies aantal spelers 2/3/4, namen aanpassen, toetsenhulp, kwaliteit, geluid, "Online spelen") -> **Speelhal** (de bestaande 5 hallen/zones; geen uitgang naar het dorp: de portaal-uitgang wordt "Terug naar lobby"). Alle spellen staan erin; een filter/label toont per kast `👥 2-4`, `👥 4` of `🏆 knock-out` (spel zonder 4-speler-modus, speelt via de Bracket).
* Spel kiezen in de hal met 4 spelers: heeft het spel `players` met 4 -> alle vier doen mee (eventueel teams). Heeft het die niet -> **Bracket** (halve finales + finale). Met 3 spelers: spel met 3 -> alle drie; anders 2-uit-3 zoals nu (DuelQueue/Bracket). Zelf kiezen/winnaar-blijft blijft bestaan.
* Toernooi/Feestbord/dagelijkse uitdaging/ranglijst/winkel-cosmetica blijven beschikbaar in de Gamehal, voor 2..4 spelers; Feestbord met 4 pionnen. Stickers/Deurman-cameo's: alleen in de Deurenhal en als grap in de lobby, niet verplicht.
* Heitjes: 20 per gespeeld spel zoals nu (voor winkel/hoedjes); geen hal-ontgrendelkosten.

## Online
Host = Wes (0), gast 1 = Jor (1), gast 2 = Juul (2), **gast 3 = Sam (3)**. Links `?join=CODE&as=jor|juul|sam`. Host streamt naar elke gast (eigen verbinding), ontvangt toetsen per gast. Menu "Online spelen" laat de host 1, 2 of 3 gasten uitnodigen en koppelt `S.settings.players` (1 gast = 2, 2 gasten = 3, 3 gasten = 4). Werkt ook vanuit `gamehal.html` (gast-links wijzen naar dezelfde pagina als de host).

## Tests
`tools/arcadetest.mjs`, `hallstest.mjs`, `e2e.mjs`, `tourneytest.mjs`, `playerstest.mjs` krijgen `PLAYERS=4`; elk spel met een 4-speler-modus heeft in zijn `tools/test_<id>.mjs` een PLAYERS=4 run (bots/virtual input), bruikbaar zonder GPU (headless Chromium/Playwright zoals de bestaande tools). Gewone versie: `PLAYERS=2` en `PLAYERS=3` blijven groen.

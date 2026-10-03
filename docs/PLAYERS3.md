# Derde speler "Juul" — contract (alle onderdelen houden zich hieraan)

Doel: Wes (0), Jor (1) en Juul (2). **Standaard blijft het spel 2 spelers** (`S.settings.players === 2`): dan moet alles exact zo werken als nu.
Met `S.settings.players === 3` is Juul een volwaardige speler: eigen besturing, naam, kleur, hoedjes, rang-statistieken, eigen online-plek.
Bijna alle duels blijven 1-tegen-1: dan spelen **2 van de 3** ("winnaar blijft" of kiezen wie speelt). Het Feestbord en de nieuwe party-spellen zijn echte 3-speler.

## Besturing
* Toetsenbord Juul: lopen `I J K L`, actie A = `U`, actie B = `O` (ook `Numpad`-alternatieven mogen niet botsen met Wes/Jor). Gamepad 3 = Juul. `KEY_LABELS[2] = { move: 'IJKL', a: 'U', b: 'O' }`.
* `src/engine/input.js`:
  * `input.all` = array van ALTIJD 3 ruwe spelerstaten (index = spelers-id 0/1/2). Staat 2 is nul als `S.settings.players === 2`.
  * `input.p` = **slot-view**: standaard `[all[0], all[1]]` (dus bestaande code en alle duels blijven werken). Tijdens een spel kan de harness `input.mapSlots([idA, idB])` (of 3 ids) aanroepen zodat slot 0/1/(2) naar andere spelers wijst; `input.resetSlots()` zet terug. Werelden (hal, dorp, bord, winkel, menu) die alle spelers tonen gebruiken `input.all` (en `S.settings.players` of `party.activeIds()`).
  * Remote (online): `input.setRemote(playerId, state, keys)`, `input.clearRemote(playerId)` (playerId 1 of 2). `input.online` is true zodra er minstens één remote-speler is; remote-spelers lezen geen lokale toetsen/gamepad.
  * `input.virtual` wordt een array van 3 (voor tests).
* `src/save.js`: `S.names = ['Wes','Jor','Juul']` (altijd 3, ook in oude opslag), `S.settings.players` (2|3, standaard 2), `S.cosmetics` voor 3 (owned/equipped), `S.arcade.wins` als array van 3 (oude opslag met 2 elementen aanvullen met 0), `byGame[id].wins` idem; `S.arcade.pairs` mag voor paar-statistieken.
* `src/engine/party.js` (NIEUW, eigenaar: kern-agent): `playerCount()`, `activeIds()` ([0,1] of [0,1,2]), `pairsOf(ids)`, `class DuelQueue` ("winnaar blijft": `next()` geeft het volgende paar `[a,b]` uit de wachtrij, `report(winnerId|null)` werkt de wachtrij bij; bij 2 spelers altijd [0,1]), `chooseNames(ids)`.

## Personages
* `src/engine/chars.js`: `PLAYER_COLORS`/`PLAYER_CSS` hebben 3 items (index = spelers-id; Juul = oranje/roze, duidelijk anders dan groen en blauw). `makeBrother(slotOrId)`: er is een **slot-mapping** `setSlotPlayers(ids)` (standaard [0,1,2] identiteit): `makeBrother(slot)` bouwt het personage van `slotPlayers[slot]` (uiterlijk, cosmetica, naamlabel). `KEY_LABELS` en `S.names` worden door de harness niet gewijzigd: gebruik `ctx.players[slot].name/id`.
* Juul krijgt een eigen look (haar/shirt/accessoire) die goed leest naast Wes en Jor.

## Duels (harness)
* `new MinigameMode(app, def, { extra: { players: [idA, idB] } })` (standaard [0,1]); bij een spel met `def.players` (bijv. `[2,3]`) en `extra.players` met 3 ids spelen alle drie.
* De harness zet `input.mapSlots(ids)` en `setSlotPlayers(ids)` bij start en herstelt ze bij dispose. `ctx.players` bevat voor elk slot `{ id, name, color, css, index }` (index = slot). `ctx.pvp.input(slot)` werkt voor slot 0..2 (bij 3 spelers). `ctx.pvp.speed/size(slot)` ook.
* **Een spel geeft zijn winnaar als SLOT-index** (`finishPvp({winner: 0|1|2|null, score:[..]})`); de harness vertaalt en levert in het resultaat: `result.ids` (de spelers-id's per slot), `result.winnerId` (spelers-id of null), `result.scoreById`. Oude velden `result.winner` (slot) blijven bestaan. Statistieken (`S.arcade.wins[winnerId]++`, byGame) gebruiken de spelers-id.
* Spellen met 3 spelers declareren `players: [2, 3]` (of `[3]`) op hun definitie en gebruiken `ctx.players.length`.

## Netwerk (online met 2 gasten)
* Host = Wes (id 0). Gast 1 = Jor (id 1), gast 2 = Juul (id 2). Eén code, maar elke gast opent zijn eigen link: `?join=CODE&as=jor` of `&as=juul`, en de host kan beide links kopiëren. Een tweede gast met dezelfde `as` wordt geweigerd; zonder `as` krijgt hij de eerstvolgende vrije plek.
* De host streamt beeld+geluid naar elke gast (elk eigen verbinding) en ontvangt toetsen per gast (`input.setRemote(playerId, ...)`).
* Menu "Online spelen" laat de host 1 of 2 gasten uitnodigen (met `S.settings.players` gekoppeld: 2 gasten = Juul mee).

## Werelden
* Hal/dorp/bord/menu/winkel/einde tonen met `players === 3` ook Juul (3 personages, 3 prompts, camera die 3 spelers omvat). Duels in de hal: bij 3 spelers kiest een keuzescherm wie speelt (standaard "winnaar blijft" via `DuelQueue`; alternatief handmatig paar kiezen); de derde kijkt toe (spectator-bonus op het Feestbord). Co-op karweitjes in het dorp: kies 2 van de 3.
* Statistieken/rang/trofeeën rekenen per spelers-id; scorebord toont 2 of 3 spelers.

---
## Werkelijkheid: wat de engine-kern (agent "kern") precies levert
Afwijkingen/aanvullingen op het contract hierboven (code: `src/engine/*`, `src/save.js`; test: `node tools/playerstest.mjs`).

**Slot-view buiten én binnen een spel.** Buiten een spel zijn `input.p`, `KEY_LABELS`, `PLAYER_COLORS`, `PLAYER_CSS` en `makeBrother(i)` gewoon per spelers-id (identiteit). *Tijdens* een `MinigameMode` zet de harness ze om naar **slots** (`input.mapSlots(ids)`, `setSlotPlayers(ids)`, `ui.hud.setSlots(ids)`) en herstelt ze bij `dispose()`. Gevolg: een duel dat `PLAYER_COLORS[i]`, `KEY_LABELS[i]`, `makeBrother(i)` en `ctx.pvp.input(i)` met slot-index i gebruikt, werkt ongewijzigd voor elk paar. (Het contract zei dat `KEY_LABELS` niet wordt gewijzigd; dat is aangepast zodat toets-hints in duels kloppen.) Voor spelers-id-gebonden info in een spel: `ctx.players[slot] = { id, index, name, color, css }` (color/css zijn de vaste kleuren van die speler). Basiswaarden altijd beschikbaar als `BASE_COLORS`, `BASE_CSS` (chars.js) en `BASE_KEY_LABELS` (input.js), index = spelers-id.

**`input.virtual[k]` is per spelers-id** (niet per slot): bij paar `[2,0]` stuurt `virtual[2]` slot 0 aan. `input.update()` leest Juul alleen als `S.settings.players === 3`.

**input.js**: `input.all[0..2]`, `input.p` (in-place bijgewerkt, nooit vervangen), `mapSlots(ids)`, `resetSlots()`, `slotIds`, `anyA()/anyB()` over `all`, `setRemote(playerId, state, keys)`, `clearRemote(playerId?)` (zonder id: alle), `input.isRemote(id)`, `input.online` (true als er een remote-speler is; oude `input.online = true` + `setRemote(state, keys)` = speler 1 blijft werken). `setRemote(id, null, [])` markeert een speler alvast als remote (lokale toetsen/pad genegeerd).

**save.js**: `migrate()` (aangeroepen door `load()`, idempotent) vult namen/wins/tourneys/byGame/cosmetics aan tot 3. `S.settings.players` (2|3). `S.arcade.pairs['a-b']` (a<b) = `{ plays, draws, wins:[winstenVanA, winstenVanB] }` (alleen 1-tegen-1-duels).

**party.js**: `playerCount()`, `activeIds()`, `pairsOf(ids)`, `chooseNames(ids)`, `nameOf(id)`, `spectators(pair, ids)`, `recordPair(a,b,winnerId)`, `pairStats(a,b)`, `class DuelQueue(ids, {maxStreak})` met `next()` (huidig paar, oplopend op id), `report(winnerId|null)`, `pick(a,b)`, `waiting()`, `champion`, `streak`, `reset(ids)`; `duelQueue()` = gedeelde sessie-wachtrij (wordt vernieuwd als het aantal spelers wijzigt), `resetDuelQueue()`.

**chars.js**: `BROTHER_SPECS[2]` (Juul: oranje tuniek, donkere knot, ronde bril, roze sjaal, huid donkerder, schaal 0.92), `PLAYER_COLORS/CSS[2]` = oranje, `setSlotPlayers(ids)`, `getSlotPlayers()`. `makeBrother(slot)` zet `c.brother` en `c.playerId` (= spelers-id), `c.playerName`; met expliciete `eq` (winkelvoorbeeld) is het argument een spelers-id. cosmetics.js: `cosm()` migreert/vult 3 spelers, `itemsFor(2, …)`, Juul draagt een sjaal (net als Wes), Jor een cape.

**harness.js**: `resolveParticipants(def, extra)` (geëxporteerd): `extra.players` (2 of 3 unieke id's) of standaard `[0,1]`; `def.players` is de lijst ondersteunde aantallen (standaard `[2]`): 3 ids bij een 1-tegen-1-spel -> alleen de eerste twee; zonder `extra.players` en `def.players` met 3 + `players===3` -> `[0,1,2]`. `ctx.players` heeft `length` = aantal deelnemers. `finishPvp({winner: SLOT|null, score: [per slot]})` -> `result = { winner (slot), scoreArr, ids, winnerId, scoreById ({id: score}), ... }`; ook niet-pvp `result.ids`. Statistieken in `close()`: `S.arcade.wins[winnerId]`, `byGame[id].wins[winnerId]`, streak per id, `recordPair` bij 2 deelnemers. `SERIES = { id, key (gesorteerde ids), wins (per slot), winsById, n }`: reeks per paar. Revanche (`close(true)`) en `restart()` behouden `extra` en dus de deelnemers. Twists: `bodyswap` bij 3 deelnemers wisselt een willekeurig paar (`ctx.pvp.swapPair`), `giant` kiest 1 reus (rest dwerg), `deurman` (scare.stare telt alle slots in `input.p`; `onDeurman(movers)` krijgt één boolean per slot). Intro/resultaat/HUD tonen 2 of 3 spelers; `result` van de harness gebruikt `S.names[id]`.

**ui.js**: `ui.hud.setSlots(ids|null)` (null = standaard: 2 of 3 volgens `S.settings.players`), HUD met 3 vakken (middelste onder de timer); `ui.hud.setPlayerInfo(slot, tekst)`. Helpers voor werelden (index = spelers-id): `ui.pName(id)`, `ui.pColor(id)`, `ui.playerTag(id)` (gekleurde naam), `ui.keyHtmlFor(id, 'a'|'b')`, `ui.anyKeysHtml('a')` (alle actieve spelers, bijv. `F / Enter / U`), `ui.promptLine(id, 'a', 'praten')`. `Menu.update` en `ui.say` luisteren naar alle spelers (`input.all`/`anyA()`).

**Test**: `?players=3` / `?players=2` in de URL zet `S.settings.players`. `src/games/_tri_test.js` (id `tri_test`, `players: [3]`, niet geregistreerd in index.js; `?game=_tri_test&players=3`) bewijst de 3-slot-pijplijn. `scare.js` is minimaal aangepast (loopt over `input.p` i.p.v. vaste slots 0 en 1).

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

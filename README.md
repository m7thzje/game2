# Heitjes voor Karweitjes

Een **co-op 3D-game voor twee spelers** op één toetsenbord. Wes en Jor doen *heitjes voor karweitjes* om geld te
verdienen voor een concert van hun favoriete YouTuber **DutchTuber**. Ondertussen gaat er in het dorp steeds
een deur vanzelf open... en staat daar **de Deurman**.

Alles (modellen, textures, geluid, muziek) wordt door code gegenereerd. Geen downloads, geen build-stap, geen assets.

## Spelen

```bash
node tools/serve.mjs          # of: python3 -m http.server 8080
# open http://localhost:8080
```

Een moderne browser met WebGL is genoeg (Chrome, Edge, Firefox). Het spel werkt volledig offline.

### Besturing

| | Speler 1 (Wes) | Speler 2 (Jor) |
|---|---|---|
| Lopen | `W` `A` `S` `D` | pijltjestoetsen |
| Actie A (praten / springen / acties) | `F` (of spatiebalk) | `Enter` |
| Actie B (lantaarn / tweede actie) | `G` (of `E`) | `Shift` rechts |

Gamepads werken ook (pad 1 = Wes, pad 2 = Jor). Online mag de gast zowel WASD als de pijltjes gebruiken. `Esc` = pauze/menu, `Tab` = dagboek, `M` = geluid uit/aan.

## Online spelen met 2 apparaten (2 links)

Eén van jullie is de **host** (Wes) en draait het spel. De ander doet mee als **Jor** via een link. Het beeld en geluid van de host
worden live doorgestuurd (WebRTC), Jor stuurt alleen zijn toetsen terug. Daardoor werken alle 14 minigames, de Speelhal met 44 duels, het dorp, de Deurman en het concert
meteen online. Niemand hoeft iets te installeren; een computer met Chrome of Edge is genoeg.

1. **Zet het spel online** (eenmalig, voor een publieke link): GitHub-repo → *Settings* → *Pages* → *Source: Deploy from a branch* →
   branch `claude/epic-edison-p6qo95` (of `main` na een merge), map `/ (root)` → *Save*. Na een minuutje staat het spel op
   `https://m7thzje.github.io/game2/`.
2. **Host:** open die link → kies **🌐 Online spelen (host)** → je krijgt een code en een link (`…/?join=123456`). Stuur de link naar je broer.
3. **Gast:** opent de link, klikt **Meedoen!** en speelt mee als Jor (WASD of pijltjes, F/Enter en G/Shift). Of kies in het menu *Meedoen met een code*.

Tips: de host moet het tabblad zichtbaar houden (anders pauzeert de browser het spel). Er zit ±0,1-0,2 s vertraging op de toetsen van de gast;
het ritmespel is daardoor wat lastiger. Lukt de verbinding niet (strenge netwerken)? Dan kan een eigen TURN-server mee: `?turn=turn:server:3478|gebruiker|wachtwoord`
(op host- én gast-link). Eigen signaalserver: `?peerhost=…&peerport=…` (zie `tools/nettest.mjs`). Lokaal testen: `node tools/nettest.mjs`.

## Het spel

* Een levendige fantasy-dorpswereld met dag/nacht-cyclus, rivier, brug, moeras, grot, bevroren vijver, kasteel op een heuvel,
  draken in de lucht, zwevende eilanden, dieren, wandelende dorpelingen, vuurvliegjes en sneeuw.
* **14 minigames** (karweitjes), elk van een andere dorpeling, gebaseerd op bekende spelconcepten
  (Mario Party, Overcooked, Sokoban, Guitar Hero, Breakout, Fall Guys, Simon Says, Whack-a-Mole...):

  | Klus | Soort | Geïnspireerd op |
  |---|---|---|
  | 🥖 Broodjes Vangen | samenwerken | Mario Party *catch* |
  | 🍲 Taverne-keuken | samenwerken | Overcooked |
  | 🎸 Straatmuzikant | samenwerken | Guitar Hero |
  | 💣 Hete Aardappel | team vs NPC's | Mario Party *Hot Bomb* |
  | 📦 Kratten Schuiven | puzzel | Sokoban (2 spelers) |
  | 🔨 Mollen Meppen | samenwerken | Whack-a-mole |
  | 🛒 Karretje uit de Modder | samenwerken | ritme-duwen |
  | 🐑 Goblin-jacht | samenwerken | twin-stick arena shooter |
  | 🎣 Samen Vissen | samenwerken | Stardew-vissen |
  | 🧪 Toverdrank | puzzel | Simon Says |
  | 🐉 Drakengrot | puzzel | Vuur-en-Waterjongen / Portal co-op |
  | 🏰 Zwaaibalk | samenwerken | Fall Guys *sweeper* |
  | 🧱 Muur Slopen | samenwerken | Breakout (2 batjes) |
  | 🤼 IJs-Sumo | broer vs broer | Mario Party *bumper* |

* **De Speelhal** (🎮, poort in de berg linksboven in het dorp): een kasteel met **drie hallen vol 1-tegen-1-spellen** voor Wes en Jor op één scherm
  (**44 duels**). Voor elk duel wordt een **twist** geloot: omgekeerde besturing, verwisselde knoppen, dronken kikker, turbo, slow-mo,
  reus tegen dwerg, zeepvloer, maanzwaartekracht, lichaamswissel of **de Deurman die komt kijken** (wie beweegt, verliest). Elke hal heeft een scorebord,
  een trofeeënkast, een **Wiel van Gekte** (willekeurig duel) en een gastheer die een **toernooi** organiseert (+50 heitjes). Bij *Spellen kiezen*
  zet je spellen uit die je niet leuk vindt en stel je de toernooilengte in. Een duel levert 20 heitjes op (12 bij herhaling).
  Via de twee deuren achter de troon kom je in de andere hallen.

  | Hal | Spellen |
  |---|---|
  | **Speelhal** (Koning Klopper) | 🏐 Vuurbal-Duel · 🎂 Taartengevecht · 🪢 Touwtrekken boven de Lava · 🏒 IJshockey-Chaos · 🤠 Quickdraw (Shy Guy Showdown) · 🃏 Geheugen-Duel · 🎨 Verfgevecht · 🦆 Schiettent · 🏎️ Kartrace · 🧗 Torenklim · 💥 Kanonnenduel · 🪑 Stoelendans · 🕰️ Klokkentoren-Sprong (Ticktock Hop) · 🚃 Mijnkar-Race (Motor Rooter) · 🧱 Knoppen-Breker (Button Mashers) · 🌿 Lianen-Zwaaien (Vine with Me) · 🔩 Schroef-Duel (Silly Screws) · 🪓 Houthakkers-Duel (Skyline Hack) |
  | **Neonkelder** (DJ Dobber) | 💣 Boem-Man Arena (Bomberman) · 🏍️ Lichtspoor-Duel (Tron) · ⬡ Zinkende Vloer (Hex-A-Gone) · 🧨 Bommentikkertje · 🥊 Smash-Arena · 🚀 Ruimtegevecht (Spacewar) · 🏐 Slijm-Volleybal (Blobby Volley) · ⚽ Raket-Voetbal · 👻 Spookjacht-Duel (Pac-Man) · ⛳ Minigolf-Race · 🏗️ Torenbouw-Duel (Stack) · 🧩 Blokkenstrijd (Tetris-battle) · 🔴 Vier op een Rij met power-ups · 💃 Dansduel (DDR) |
  | **Kermis** (Kermis-Kees) | 🎤 Quizshow Heitjesmiljonair · 🔮 Kristal-Code (Mastermind) · 🥧 Taartenbakkers-Battle · 🧸 Grijpkraan-Gekte · 💎 Edelsteen-Kalaha · 🎳 Reuzen-Bowling · 🛁 Eendenrace · 🐲 Wolkenrace · 🎱 Flipper-Duel · 🕵️ Verkleed-Verstoppertje (Prop Hunt) · 💰 Dievenduel · 🏰 Kasteelbelegering |

* **Hoedenmaker Hettie** (kraam op het plein, ook via `Esc` → *Hoeden & kleuren*): 18 hoeden en 12 kleuren per categorie (shirt, haar, sjaal/cape, o.a. goud en regenboog) voor Wes én Jor, elk met de eigen toetsen. Je betaalt met de gedeelde heitjes (die zijn dan niet meer voor het concert!). Wat je aantrekt zie je overal terug: dorp, Speelhal en minigames. Code: `src/world/shop.js` (`openShop(app, { onClose })`), `src/engine/cosmetics.js`, opslag in `S.cosmetics`.
* De weg naar de Speelhal: gloeiende lichtzuil boven de poort, een pad van pijlen vanaf de spawn, wegwijzers, een pijl aan de rand van het scherm en **Heraut Hans** bij het huisje van de broers.
* Elke klus betaalt 0-3 sterren. Spaar **600 heitjes**, koop kaartjes bij het loket, en ga 's avonds naar de kasteelpoort.
* Verzamel muntjes, schatkisten en de **8 gouden deurknoppen** van de Deurman.
* **De Deurman** (creepypasta-stijl): deuren kraken open, hij staat in de opening, en tijdens klusjes moet je *stil blijven staan*
  als hij kijkt. In het dorp volgt hij je — verjaag hem met je lantaarn. Er zijn jumpscares.
  Kies in **Instellingen** het griezelniveau (uit / gezellig / eng / doodeng) en zet *flitsvrij* aan als je gevoelig bent voor flitsen.

## Techniek

* [Three.js](https://threejs.org) (r170) als ES-module, opgeslagen in `lib/` (geen CDN nodig).
* `src/engine/` — invoer, procedurele audio (WebAudio), poppetjes/animatie, props, textures, deeltjes, UI, Deurman-scares, minigame-harness.
* `src/world/` — terrein, vegetatie (instanced), dorp, hemel/dag-nacht, leven, verzamelobjecten, verhaal, menu en einde.
* `src/games/` — de 14 minigames en 44 duels (één bestand per game, plus `*_world.js` voor de 3D-wereld). Zie `docs/MINIGAME_API.md` en `docs/PVP_API.md` om er zelf een toe te voegen.
* `src/world/arcade.js` — de Speelhal; `src/engine/twist.js` — de twists.
* `tools/` — `serve.mjs` (server), `shot.mjs` (headless test van één minigame met screenshots), `hubtest.mjs`, `e2e.mjs` (dorp + flow), `arcadetest.mjs` (alle 44 duels via de Speelhal), `tourneytest.mjs` (volledig toernooi), `test_<duel>.mjs` per duel (bots, twists, screenshots).

## Eigen minigame toevoegen

1. Maak `src/games/mijngame.js` (zie `src/games/catch.js` en `docs/MINIGAME_API.md`).
2. Voeg het id toe aan `GAME_IDS` in `src/games/index.js`.
3. Geef het een locatie in `src/world/layout.js` (`JOBS`) en tekst in `src/world/story.js` (`NPC`).
4. Test: `http://localhost:8080/?game=mijngame` (oefenmodus) of `node tools/shot.mjs mijngame`.

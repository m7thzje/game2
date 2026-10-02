# Heitjes voor Karweitjes

Een **co-op 3D-game voor twee spelers** op één toetsenbord. Daan en Sem doen *heitjes voor karweitjes* om geld te
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

| | Speler 1 (Daan) | Speler 2 (Sem) |
|---|---|---|
| Lopen | `W` `A` `S` `D` | pijltjestoetsen |
| Actie A (praten / springen / acties) | `F` (of spatiebalk) | `Enter` |
| Actie B (lantaarn / tweede actie) | `G` (of `E`) | `Shift` rechts |

Gamepads werken ook (pad 1 = Daan, pad 2 = Sem). `Esc` = pauze/menu, `Tab` = dagboek, `M` = geluid uit/aan.

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

* Elke klus betaalt 0-3 sterren. Spaar **600 heitjes**, koop kaartjes bij het loket, en ga 's avonds naar de kasteelpoort.
* Verzamel muntjes, schatkisten en de **8 gouden deurknoppen** van de Deurman.
* **De Deurman** (creepypasta-stijl): deuren kraken open, hij staat in de opening, en tijdens klusjes moet je *stil blijven staan*
  als hij kijkt. In het dorp volgt hij je — verjaag hem met je lantaarn. Er zijn jumpscares.
  Kies in **Instellingen** het griezelniveau (uit / gezellig / eng / doodeng) en zet *flitsvrij* aan als je gevoelig bent voor flitsen.

## Techniek

* [Three.js](https://threejs.org) (r170) als ES-module, opgeslagen in `lib/` (geen CDN nodig).
* `src/engine/` — invoer, procedurele audio (WebAudio), poppetjes/animatie, props, textures, deeltjes, UI, Deurman-scares, minigame-harness.
* `src/world/` — terrein, vegetatie (instanced), dorp, hemel/dag-nacht, leven, verzamelobjecten, verhaal, menu en einde.
* `src/games/` — de 14 minigames (één bestand per game). Zie `docs/MINIGAME_API.md` om er zelf een toe te voegen.
* `tools/` — `serve.mjs` (server), `shot.mjs` (headless test van één minigame met screenshots), `hubtest.mjs`, `e2e.mjs` (dorp + flow).

## Eigen minigame toevoegen

1. Maak `src/games/mijngame.js` (zie `src/games/catch.js` en `docs/MINIGAME_API.md`).
2. Voeg het id toe aan `GAME_IDS` in `src/games/index.js`.
3. Geef het een locatie in `src/world/layout.js` (`JOBS`) en tekst in `src/world/story.js` (`NPC`).
4. Test: `http://localhost:8080/?game=mijngame` (oefenmodus) of `node tools/shot.mjs mijngame`.

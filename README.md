# Wes & Jor: De Speelhal

Een **3D-partygame voor twee spelers** op één toetsenbord (of online met 2 apparaten). Wes en Jor worden uitgenodigd voor de grote heropening van
**de Speelhal** van Koning Klopper: een kasteel in de berg vol 1-tegen-1-spellen, een Mario Party-bordspel, een winkel voor hoedjes en... **de Deurman**,
de lieve meme-mascotte die steeds uit een deur komt kijken. Bouw de Speelhal uit, word Speelhal-Legende en geef het Grote Slotfeest.

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
| Actie B (selfie-licht / tweede actie) | `G` (of `E`) | `Shift` rechts |

Gamepads werken ook (pad 1 = Wes, pad 2 = Jor). Online mag de gast zowel WASD als de pijltjes gebruiken. `Esc` = pauze/menu, `Tab` = dagboek, `M` = geluid uit/aan.

## Online spelen met 2 of 3 apparaten (eigen link per gast)

Eén van jullie is de **host** (Wes) en draait het spel. **Jor** (en eventueel **Juul**) doen mee op een eigen apparaat via een eigen link. Het beeld en geluid van de host
worden live doorgestuurd (WebRTC, elke gast een eigen verbinding), de gasten sturen alleen hun toetsen terug. Daardoor werken alle minigames, de Speelhal met zijn duels, het Feestbord, het dorp en de Deurman
meteen online. Niemand hoeft iets te installeren; een computer met Chrome of Edge is genoeg. Maximaal **2 gasten**.

1. **Zet het spel online** (eenmalig, voor een publieke link): GitHub-repo → *Settings* → *Pages* → *Source: Deploy from a branch* →
   branch `claude/epic-edison-p6qo95` (of `main` na een merge), map `/ (root)` → *Save*. Na een minuutje staat het spel op
   `https://m7thzje.github.io/game2/`.
2. **Host:** open die link → kies **🌐 Online spelen** → kies **Met z'n tweeën** (alleen Jor) of **Met z'n drieën** (Jor én Juul; dit zet het spel ook op 3 spelers).
   Je ziet één code en per gast een eigen link (`…/?join=123456&as=jor` en `…&as=juul`) met een kopieerknop, plus per gast de status (✅ verbonden, ⏳ wachten, ⚠️ weggevallen).
   Stuur elke gast zijn eigen link. Zodra iedereen er is: **Klaar — spelen maar!** (of **Toch beginnen** met degenen die er zijn).
3. **Gast:** opent zijn link, klikt **Meedoen!** en ziet "Je speelt als Jor" (of Juul). Lopen kan met **WASD**, de **pijltjes** of **IJKL**; actieknoppen **F / Enter / U** en **G / Shift / O**.
   Zonder `&as=…` in de link (of via het menu *Meedoen met een code*) krijgt de gast de eerstvolgende vrije plek; hij kan ook zelf Jor of Juul kiezen.
   Is een plek al bezet (twee keer dezelfde link) of zit het spel vol, dan krijgt de gast een nette melding. Een gast die zijn tabblad herlaadt neemt zijn eigen plek gewoon weer in.

Tips: de host moet het tabblad zichtbaar houden (anders pauzeert de browser het spel). Er zit ±0,1-0,2 s vertraging op de toetsen van de gasten;
het ritmespel is daardoor wat lastiger. Met twee gasten gaat er twee keer zoveel beeld uit de host: een goede upload helpt. Valt één gast weg, dan spelen de anderen gewoon door.
Lukt de verbinding niet (strenge netwerken)? Dan kan een eigen TURN-server mee: `?turn=turn:server:3478|gebruiker|wachtwoord`
(op host- én gast-link). Eigen signaalserver: `?peerhost=…&peerport=…` (zie `tools/nettest.mjs`). Lokaal testen: `node tools/nettest.mjs` (1 host + 1 gast en 1 host + 2 gasten, alles in één browser).

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

* **De Speelhal** (🎮, poort in de berg linksboven in het dorp): een kasteel met **vijf hallen vol 1-tegen-1-spellen** voor Wes en Jor op één scherm
  (**54 duels**). Nieuwe hallen laat je **bouwen** met heitjes (dichtgetimmerde deuren in de achtermuur van de Speelhal); de **Deurenhal** is geheim. Voor elk duel wordt een **twist** geloot: omgekeerde besturing, verwisselde knoppen, dronken kikker, turbo, slow-mo,
  reus tegen dwerg, zeepvloer, maanzwaartekracht, lichaamswissel of **de Deurman die komt kijken** (wie beweegt, verliest). Elke hal heeft een scorebord,
  een trofeeënkast, een **Wiel van Gekte** (willekeurig duel) en een gastheer die een **toernooi** organiseert (+50 heitjes). Bij *Spellen kiezen*
  zet je spellen uit die je niet leuk vindt en stel je de toernooilengte in. Een duel levert 20 heitjes op (12 bij herhaling).
  Via de vier deuren in de achtermuur van de Speelhal kom je in de andere hallen (Neonkelder, Kermis, Sporthal en de geheime Deurenhal).

  | Hal | Spellen |
  |---|---|
  | **Speelhal** (Koning Klopper) | 🏐 Vuurbal-Duel · 🎂 Taartengevecht · 🪢 Touwtrekken boven de Lava · 🏒 IJshockey-Chaos · 🤠 Quickdraw (Shy Guy Showdown) · 🃏 Geheugen-Duel · 🎨 Verfgevecht · 🦆 Schiettent · 🏎️ Kartrace · 🧗 Torenklim · 💥 Kanonnenduel · 🪑 Stoelendans · 🕰️ Klokkentoren-Sprong (Ticktock Hop) · 🚃 Mijnkar-Race (Motor Rooter) · 🧱 Knoppen-Breker (Button Mashers) · 🌿 Lianen-Zwaaien (Vine with Me) · 🔩 Schroef-Duel (Silly Screws) · 🪓 Houthakkers-Duel (Skyline Hack) |
  | **Neonkelder** (DJ Dobber) | 💣 Boem-Man Arena (Bomberman) · 🏍️ Lichtspoor-Duel (Tron) · ⬡ Zinkende Vloer (Hex-A-Gone) · 🧨 Bommentikkertje · 🥊 Smash-Arena · 🚀 Ruimtegevecht (Spacewar) · 🏐 Slijm-Volleybal (Blobby Volley) · ⚽ Raket-Voetbal · 👻 Spookjacht-Duel (Pac-Man) · ⛳ Minigolf-Race · 🏗️ Torenbouw-Duel (Stack) · 🧩 Blokkenstrijd (Tetris-battle) · 🔴 Vier op een Rij met power-ups · 💃 Dansduel (DDR) |
  | **Kermis** (Kermis-Kees) | 🎤 Quizshow Heitjesmiljonair · 🔮 Kristal-Code (Mastermind) · 🥧 Taartenbakkers-Battle · 🧸 Grijpkraan-Gekte · 💎 Edelsteen-Kalaha · 🎳 Reuzen-Bowling · 🛁 Eendenrace · 🐲 Wolkenrace · 🎱 Flipper-Duel · 🕵️ Verkleed-Verstoppertje (Prop Hunt) · 💰 Dievenduel · 🏰 Kasteelbelegering |
  | **Sporthal** (Trainer Tim, bouwen: 450 🪙) | 🥅 Strafschop-Showdown · 🏀 Mand-Mania · 🏓 Tafeltennis-Tornado · 🎯 Pijlen-Poeha · 🏹 Boogschieten-Battle · 🥌 Curling-Chaos |
  | **Deurenhal** (De Deurman, geheim) | 🚪 Deurman Zegt · ✍️ Handtekening-Jacht · 🏁 Deurenrace · 🪩 Deurman-Disco |

* **Hoedenmaker Hettie** (kraam op het plein, ook via `Esc` → *Hoeden & kleuren*): 18 hoeden en 12 kleuren per categorie (shirt, haar, sjaal/cape, o.a. goud en regenboog) voor Wes én Jor, elk met de eigen toetsen. Je betaalt met de gedeelde heitjes (die heb je dan niet meer om nieuwe hallen te laten bouwen!). Wat je aantrekt zie je overal terug: dorp, Speelhal en minigames. Code: `src/world/shop.js` (`openShop(app, { onClose })`), `src/engine/cosmetics.js`, opslag in `S.cosmetics`.
* De weg naar de Speelhal: gloeiende lichtzuil boven de poort, een pad van pijlen vanaf de spawn, wegwijzers, een pijl aan de rand van het scherm en **Heraut Hans** bij het huisje van de broers.
* **Meer in de Speelhal:** een 🔁 *Revanche*-knop met reeks-teller na elk duel, een **Uitdaging van de dag** (vast duel + twist, bonus-heitjes en een reeks), een **ranglijst per spel** (👑 koning per duel),
  **twists aan/uit zetten** en het aantal **minigolf-holes** (3/6/9/12 uit een pool van 17) instellen bij *Spellen & twists kiezen*, en **Smash-Arena** met 4 vechters, 3 podia en een super-meter.
  Soms houdt **de Deurman een Deurenfeestje**: de lichten worden disco, een deur gaat open en hij danst naar jullie toe voor een high-five. Laat hem blozen met je selfie-licht (G / Shift vasthouden en richten), of speel één feest-duel om de hal terug te winnen van DJ Deurman.
  Op de achtermuur zit ook een **geheime deur** (een gewone deur met een ❓-bord): zodra je genoeg **Deurman-stickers** in het **Vriendenboek** hebt (de Deurman duikt overal op met cameo's), verandert hij in een gouden deur naar de **Deurenhal** (zwevende deuren, deurknoppen, spiegels en de Deurman zelf als gastheer).
  Naast de troon staat de **Feestbord-tafel** (🎲 Mario Party voor twee, ook via `Esc`) en een standaard met het **Deurman-vriendenboek** (ook via `Esc`).
  In het dorp koop je bij **Hoedenmaker Hettie** hoedjes en kleuren voor Wes en Jor; **Heraut Hans** wijst de weg naar de Speelhal.
* Elke klus in het dorp betaalt 0-3 sterren en heitjes. Heitjes gebruik je voor nieuwe hallen in de Speelhal en voor hoedjes. Je stijgt in **rang** (Nieuwkomer → Speelhal-Legende), en dan volgt het **Grote Slotfeest** met de dansende Deurman.
* Verzamel muntjes, schatkisten en de **8 gouden deurknoppen** van de Deurman.
* **De Deurman** (lieve meme-mascotte): staat in deuropeningen, wil high-fives en handtekeningen en duikt met cameo's overal op. Elke grap is een **sticker** in het Vriendenboek.
  Kies in **Instellingen** het Deurman-gedrag (uit / af en toe / vaak / overal) en zet *flitsvrij* aan als je gevoelig bent voor flitsen.

## Techniek

* [Three.js](https://threejs.org) (r170) als ES-module, opgeslagen in `lib/` (geen CDN nodig).
* `src/engine/` — invoer, procedurele audio (WebAudio), poppetjes/animatie, props, textures, deeltjes, UI, Deurman-scares, minigame-harness.
* `src/world/` — terrein, vegetatie (instanced), dorp, hemel/dag-nacht, leven, verzamelobjecten, verhaal, menu en einde.
* `src/games/` — de 14 minigames en 54 duels (één bestand per game, plus `*_world.js` voor de 3D-wereld). Zie `docs/MINIGAME_API.md` en `docs/PVP_API.md` om er zelf een toe te voegen.
* `src/world/arcade.js` — de Speelhallen (+ `arcade_sport.js` Sporthal, `arcade_deurhal.js` Deurenhal, `arcade_extra.js` Feestbord-tafel / Vriendenboek / geheime deur); `src/engine/twist.js` — de twists.
* `tools/` — `serve.mjs` (server), `shot.mjs` (headless test van één minigame met screenshots), `hubtest.mjs`, `e2e.mjs` (dorp + flow), `arcadetest.mjs` (alle 54 duels via de Speelhal), `hallstest.mjs` (Sporthal bouwen, geheime Deurenhal ontgrendelen, Feestbord-tafel, Vriendenboek), `hallshot.mjs` (screenshots van een hal), `tourneytest.mjs` (volledig toernooi), `test_<duel>.mjs` per duel (bots, twists, screenshots).

## Eigen minigame toevoegen

1. Maak `src/games/mijngame.js` (zie `src/games/catch.js` en `docs/MINIGAME_API.md`).
2. Voeg het id toe aan `GAME_IDS` in `src/games/index.js`.
3. Geef het een locatie in `src/world/layout.js` (`JOBS`) en tekst in `src/world/story.js` (`NPC`).
4. Test: `http://localhost:8080/?game=mijngame` (oefenmodus) of `node tools/shot.mjs mijngame`.

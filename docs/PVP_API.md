# Duel-spellen (1 tegen 1) voor de Speelhal — aanvulling op MINIGAME_API.md

Lees eerst `docs/MINIGAME_API.md` en `src/games/sumo.js` (bestaand versus-spel). Een duel is een gewone minigame met `mode: 'pvp'`.
Twee broers op **één scherm**, ieder een eigen poppetje, **eerlijk en symmetrisch**. Mario Party-gevoel: snel te begrijpen, grappig, chaotisch, een beetje gemeen.

## Verschillen met een gewone minigame
```js
export default {
  id: 'dodgeball', name: 'Vuurbal-Duel', giver: 'Koning Klopper', icon: '🔥',
  mode: 'pvp',
  time: 90,
  twists: ['invert','swapab','drunk','turbo','slowmo','giant','slippery','lowgrav','bodyswap','deurman'], // welke twists zinvol zijn voor dit spel (weglaten = alle)
  music: 'game_fast',
  blurb: '...', controls: ['{move} lopen', '{a} gooien', '{b} duiken'], tip: '...',
  create(ctx) { ... }
};
```
* **Invoer: gebruik `ctx.pvp.input(i)` in plaats van `ctx.input.p[i]`** voor alles wat de speler bestuurt (lopen, knoppen). Dat object heeft dezelfde velden
  (`x y a b aP bP aR bR up down left right upP downP leftP rightP mag`) maar is al aangepast door de twist (omgekeerd, verwisselde knoppen, dronken, lichaamswissel...).
  Gebruik het ook voor menu-achtige keuzes binnen het spel. Gebruik nooit rechtstreeks `ctx.input.p[i]` voor gameplay (de twists zouden dan niet werken).
* **`ctx.twist`** `{id, name, desc, icon}` — de gekozen twist (de intro-kaart toont hem al). Daarnaast:
  * `ctx.pvp.speed(i)` → vermenigvuldiger voor loopsnelheid/bewegingssnelheid van speler i (turbo 1.6, slakkentempo 0.65, reus 0.8, dwerg 1.3, anders 1).
  * `ctx.pvp.size(i)` → schaal van poppetje + hitbox (reus 1.55, dwerg 0.65, anders 1). Schaal je `Character.group.scale` ermee en gebruik het voor botsingsstralen.
  * `ctx.pvp.slip` → 0..1: hoe glad de vloer is (0 = normaal; gebruik het om je versnelling/demping te verlagen: `damp(v, target, lerp(14, 1.5, slip), dt)`).
  * `ctx.pvp.gravity` → 1 normaal, 0.4 maan (vermenigvuldig je zwaartekracht ermee, of vlieg/springen hoger).
  * `ctx.pvp.swapped` → true tijdens lichaamswissel (je hoeft niets te doen: `input(i)` levert dan de toetsen van de andere broer). Optionele hook `onSwap(swapped)` voor een grappig effect.
  * Je hoeft niet alle twists zelf in te bouwen: `invert/swapab/drunk/bodyswap` werken automatisch via `ctx.pvp.input`. Pas **speed, size, slip, gravity** toe waar het zin heeft, en lijst in `twists` alleen op wat bij jouw spel past.
* **Einde:** `ctx.finishPvp({ winner: 0 | 1 | null, score: [a, b], summary: 'HTML-tekst' })` precies één keer (null = gelijkspel; liever niet, maar kan).
  De harness toont de winnaar met een kroon, geeft de broers samen heitjes en houdt het scorebord van de Speelhal bij. Geen sterren.
* Optionele hooks op het teruggegeven object: `celebrate(winnerIndex)` (laat de winnaar juichen en de verliezer balen), `onDeurman(movers)` (twist 'Deurman kijkt mee': `movers = [bool,bool]` wie bewoog — trek die speler een punt af, doe iets grappigs),
  `onSwap(swapped)`.
* `players[i].name`/`ctx.players` zijn Wes (index 0, groen, WASD+F/G) en Jor (index 1, blauw, pijltjes+Enter/Shift). Toon score/levens in de HUD (`ctx.hud.setPlayerInfo(i, ...)`, `setScore`, `setTimer`).

## Ontwerp-eisen
1. **Eerlijk**: beide spelers hebben exact dezelfde regels, startpositie gespiegeld. Geen AI-tegenstander voor de broers (wel eventuele NPC's als obstakel/gimmick).
2. **Kort en herhaalbaar**: een potje duurt 60–100 s (best-of-3 rondes of een vaste tijd). Altijd een winnaar (sudden death / hoogste score als de tijd om is).
3. **Comeback-mechanieken** (Mario Party-stijl): wie achterstaat krijgt af en toe een kans (power-up, gouden bal, dubbele punten in de laatste 15 s...). Een beetje chaos is goed!
4. **Grappige gimmick(s)** in het spel zelf, naast de twist (een kip die in beeld rent, een taart die ontploft, de Deurman die even kijkt...). Mario Party draait om gekke wendingen.
5. Duidelijke feedback (deeltjes, `ctx.shake`, zwevende tekst, geluid, poppetjes die juichen/balen via `Character.pose`).
6. Alles zelf genereren (geen assets). Fantasy-sfeer: het is een speelhal in een kasteel in de berg, maar de arena zelf mag overal zijn (ijsbaan, taverne, kermis...).
7. Test: `node tools/shot.mjs <id> 20 /tmp/<id>.png` en kies een twist met `?game=<id>&twist=<twist-id>` (bijv. `?game=dodgeball&twist=giant`). Controleer elke twist die je in `twists` zet.
   Schrijf (zoals de andere games) een bot/scenario-test in `tools/test_<id>.mjs` die aantoont dat `finishPvp` altijd wordt aangeroepen (ook bij time-out) en dat beide spelers kunnen winnen.
8. Pas **geen** gedeelde bestanden aan. Eigen hulpbestanden: `src/games/<id>_*.js`.

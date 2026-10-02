# Minigame API — "Heitjes voor Karweitjes"

Een minigame is **één bestand** `src/games/<id>.js` dat een object exporteert (`export default {...}`).
Zie `src/games/catch.js` voor een complete, werkende voorbeeldgame. Taal van alle tekst: **Nederlands**.

## Wat het raamwerk (harness) voor je doet
`src/engine/harness.js` (`MinigameMode`) regelt: intro-kaart met uitleg + "allebei klaar", aftellen 3-2-1-GA, pauzemenu (Esc),
resultaatkaart met sterren + heitjes, het *Deurman*-spookevent (spel wordt tijdelijk gepauzeerd, jij hoeft niets te doen),
camera-shake, deeltjes, zwevende tekst, belichting. Jij levert alleen de game zelf.

## Het definitie-object
```js
export default {
  id: 'catch',                 // = bestandsnaam
  name: 'Broodjes Vangen',     // titel
  giver: 'Bakker Bram',        // wie geeft de klus
  icon: '🥖',
  mode: 'coop' | 'versus' | 'puzzle',
  time: 45,                    // seconden (alleen voor de intro-kaart; jij beheert de klok zelf). Weglaten = "geen tijdslimiet"
  pay: 1,                      // vermenigvuldiger voor de beloning (0.8 - 1.4)
  music: 'game',               // 'game' | 'game_fast' | 'game_minor' | 'puzzle' | 'tense'
  blurb: 'HTML-uitleg in 2-3 zinnen',
  controls: ['{move} lopen', '{a} pakken', '{b} gooien'],   // {move} {a} {b} worden per speler vervangen door de echte toetsen
  tip: 'optionele tip',
  create(ctx) { ...; return { update(dt), dispose(), introUpdate?(dt), resultUpdate?(dt), onStart?(), onResize?(w,h) }; }
}
```
* `update(dt)` wordt alleen aangeroepen tijdens het spelen (niet tijdens intro/aftellen/pauze/Deurman-event). `dt` is max 0.05.
* `introUpdate(dt)` loopt tijdens intro en aftellen: animeer daar alleen idle-dingen (poppetjes, vlammen). Géén spelogica!
* `resultUpdate(dt)` loopt nadat je `ctx.finish` hebt aangeroepen (laat poppetjes juichen).
* `onStart()` wordt aangeroepen op het moment van "GA!" (start je klok/spawners hier óf begin gewoon in de eerste `update`).
* `dispose()` ruim je eigen event-listeners/timers op. Scene-objecten worden door het raamwerk opgeruimd.

## `ctx`
| veld | betekenis |
|---|---|
| `ctx.scene`, `ctx.camera`, `ctx.renderer` | verse `THREE.Scene` en `PerspectiveCamera` (fov 50). Zet zelf de camera. |
| `ctx.input` | zie Invoer hieronder |
| `ctx.audio.sfx(naam, {vol, rate})` | geluidseffecten, zie lijst |
| `ctx.hud` | `setTimer(sec, lowAt=10)` / `setTimer(null)`, `setScore(tekst)`, `setPlayerInfo(i, tekst)`, `setHint(htmlTekst)`, `showBig(tekst, ms, kleur)`, `toast(tekst, ms)` |
| `ctx.fx.particles` | `burst(x,y,z,{count,speed,up,spread,life,size,color,colors,gravity})`, `emit(...)`, `ring(x,y,z,{...})`, `dust(x,y,z,n,color)` |
| `ctx.fx.texts.add(tekst, x,y,z, kleur='#ffe14a', schaal=1)` | zwevende tekst in de wereld ("+10") |
| `ctx.lights(mood, opts)` | zet zon+hemellicht+achtergrond+mist. `mood`: `'day' 'dusk' 'night' 'indoor' 'cave' 'ice' 'swamp'`. `opts`: `{shadow: 24 (helft van schaduwvak), center:[x,y,z], fog:true, fogNear, fogFar}`. Retourneert `{sun, hemi}` |
| `ctx.players` | `[{index, name, color (0xRRGGBB), css}]` — Wes (index 0, groen, WASD) en Jor (index 1, blauw, pijltjes) |
| `ctx.make.brother(i)` | `Character` van Wes/Jor (zie chars.js) |
| `ctx.shake(0..1)` | camera-schud |
| `ctx.penalty(n, melding?)` / `ctx.bonus(n, melding?)` | heitjes aftrekken/bijtellen (optioneel) |
| `ctx.rng()` | seeded random 0..1 |
| `ctx.difficulty` | 1.0 .. 2.0 (stijgt bij herhaling) — gebruik om moeilijkheid iets te schalen |
| **`ctx.finish({stars, score, summary, delay?})`** | **Einde van de game.** `stars` 0-3 (0 = mislukt, 1 = ok, 2 = goed, 3 = perfect), `summary` is HTML-tekst voor de resultaatkaart. Roep dit precies één keer aan. |

Sterren zijn gedeeld: de broers hebben één portemonnee. Maak 2 sterren *haalbaar* voor een gemiddeld duo en 3 sterren echt een uitdaging.

## Invoer (`ctx.input.p[0]` = Wes, `p[1]` = Jor)
```
p.x  -1..1 (links..rechts)     p.y  -1..1 (OMHOOG = -1 .. OMLAAG = +1; "omhoog" = van de speler af, dus -z in de wereld als de camera naar -z kijkt)
p.mag 0..1 stick-grootte       p.a  p.b  = knop ingedrukt (F / Enter, G / Shift)
p.aP p.bP = net ingedrukt (1 frame)      p.aR p.bR = net losgelaten
p.up p.down p.left p.right = richting ingedrukt, p.upP .. p.rightP = net ingedrukt (voor rooster-/menu-besturing)
```
Toetsen: Wes WASD + F/G, Jor pijltjes + Enter/Shift. (Gamepads werken automatisch.) **Elke game moet speelbaar zijn met alleen: bewegen (4 richtingen) + knop A + knop B.**
Gebruik géén andere toetsen. Gebruik `ctx.input.p[i]`, nooit rechtstreeks `keydown`.

## Geluid (`ctx.audio.sfx`)
coin click select jump land boing hit hurt miss good bad buzz pop whoosh swing throw shoot splash chop sizzle bell ding thud sparkle step tick
countdown go powerup explode win lose star note wood scrape door. (`note` met `{rate}` voor toonhoogte; `tone(freq, dur, {type,vol,slide})` voor eigen tonen.)
Muziek wordt via `def.music` gekozen. Je mag `ctx.audio.tone`/`noise` gebruiken voor eigen effecten (bv. muziek-notenspel).

## Beschikbare hulpmodules (relatief importeren vanuit `src/games/`)
* `../engine/util.js`: `clamp lerp damp dampAngle smoothstep rand randInt pick shuffle mulberry32 mat(color,opts) glow(color,intens) mesh(geo,mat,{pos,rot,scale,cast,receive}) canvasTex h(...)`.
  `mat()` geeft gecachte flat-shaded `MeshStandardMaterial`.
* `../engine/textures.js`: `tex.grass(rx,ry) dirt sand cobble stone planks(rx,ry,hex) bricks plaster thatch roof water checker snow ice lava carpet tiles sign(tekst,{...}) poster()` — canvas-texturen (herhalend).
* `../engine/chars.js`:
  * `makeBrother(i)`, `makeNPC(kind, overrides)` met kind: baker farmer witch carter fisher foreman dwarf innkeeper jester shepherd bard captain mason sumo kid elder guard princess goblin skeleton.
  * `Character`: `.group` (voeten op y=0, kijkt naar **+z**), `.height`, `.speed` (0..1 loopanimatie), `.pose` (`idle cheer sad carry push scared wave point sit hands_up dance`), `.air` (bool, springhouding), `.faceDir(dx,dz)`, `.faceTowards(x,z)`, `.swing()` (rechterarm slag), `.jump()` (squash), `.hold(mesh,'r'|'l')`, `.squash`, `.update(dt)` ← **roep elke frame aan.**
  * `Animal('chicken'|'sheep'|'cow')`, `Slime(color,size)`, `Dragon`, `Butterfly`, `makeDeurman()` (de griezel).
* `../engine/props.js`: `tree pine rock bush mushroom flowerPatch crate barrel sack fence torch lampPost chest coin gem crystal bread apple fish cauldron signpost banner door windmill houseSimple tower well campfire hammer sword bucket bridge cloud shadowBlob floor` (+ `animateFire`, `animateBanner`).
* `../engine/particles.js`: `Particles`, `FloatTexts` (heb je al via `ctx.fx`).
* Eigen hulpbestanden mogen: `src/games/<id>_xxx.js`.

## Regels
1. **Geen externe assets.** Alle modellen/textures procedureel (primitives, canvas). Geen netwerkverzoeken.
2. 2 spelers op één scherm, één gedeelde camera (geen splitscreen nodig). Het moet in een **fantasy-sfeer** staan (dorp, taverne, grot, kasteel, bos, ijs, moeras...). Maak de omgeving levend: decoratie, deeltjes, bewegende details.
3. Coöperatief of puzzel is de voorkeur; `versus` mag (maar zie `sumo`). Elke game moet echt **samenwerking** afdwingen of belonen.
4. Juice: deeltjes, `ctx.shake`, zwevende tekst, geluid bij elke belangrijke actie, poppetjes die juichen/balen (`pose`).
5. Geen allocatie in de hot path waar het kan (hergebruik vectors); houd draw calls laag (< ~600 meshes, gebruik `InstancedMesh` voor veel dezelfde dingen). Schaduwen: alleen `castShadow` op wat telt.
6. Spelduur 40-120 s (puzzels: ~3-5 min met meerdere levels). Eerlijke, duidelijke feedback; nooit onduidelijk waarom je verliest.
7. Zorg dat `ctx.finish` altijd aangeroepen wordt (ook bij time-out) en dat er geen console-errors zijn.
8. Pas **geen** gedeelde bestanden aan (`src/main.js`, `src/engine/*`, `src/games/index.js`, `src/world/*`) behalve een minimale, noodzakelijke bugfix in `src/engine/*` — vermeld die dan expliciet in je eindrapport.

## Testen
```
node tools/shot.mjs <id> [seconden] [/tmp/uit.png]
```
Start de game headless (software-rendering, ~10 fps, dus `dt`-clamp werkt; wees niet verbaasd over lage fps), laat allebei de spelers "klaar" drukken, speelt `secs` seconden random input en schrijft `uit_intro.png`, `uit.png`, `uit_end.png` + console-errors.
Bekijk de PNG's met de Read-tool om je visuals te beoordelen. Kopieer `tools/shot.mjs` naar `tools/test_<id>.mjs` voor eigen scenario's
(bv. input scripten via `window.__app.input.virtual[i].x/.y/.a/.b`, de game-instantie staat in `window.__app.mode.instance`, de harness in `window.__app.mode`).
Voor puzzels: schrijf een solver/validator in node om te bewijzen dat elk level oplosbaar is.
Handig: URL `?game=<id>&scare=0` start direct een game in oefenmodus zonder Deurman-events.

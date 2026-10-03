// Register van alle minigames. Voeg hier een id toe en maak src/games/<id>.js
export const GAME_IDS = [
  'catch', 'mudcart', 'whack', 'potion', 'fishing', 'sokoban', 'plates',
  'kitchen', 'hotbomb', 'goblins', 'rhythm', 'sweeper', 'breakout', 'sumo',
];

// Duel-spellen voor de Speelhal (1 tegen 1, met een willekeurige twist), verdeeld over twee hallen
export const ARCADE_HALLS = [
  { id: 0, name: 'Speelhal', ids: [
    'dodgeball', 'cakefight', 'tugwar', 'airhockey', 'quickdraw', 'memory',
    'paint', 'duckshoot', 'karts', 'climb', 'tanks', 'chairs',
    'ticktock', 'minecart', 'buttons', 'vines', 'screws', 'chop',
  ] },
  { id: 1, name: 'Neonkelder', ids: [
    'bomber', 'tron', 'hexagone', 'tag', 'brawl', 'spacewar', 'volley',
    'soccer', 'pacduel', 'golf', 'stack', 'blocks', 'connect4', 'dance',
  ] },
  { id: 2, name: 'Kermis', ids: [
    'quiz', 'code', 'bake', 'claw', 'kalaha', 'bowling',
    'ducks', 'flappy', 'pinball', 'hide', 'heist', 'catapult',
  ] },
];
export const ARCADE_IDS = ARCADE_HALLS.flatMap((h) => h.ids);

const cache = {};
export async function loadGame(id) {
  if (cache[id]) return cache[id];
  const m = await import(`./${id}.js`);
  cache[id] = m.default;
  return m.default;
}
export async function loadAllGames() {
  const out = {};
  await Promise.all([...GAME_IDS, ...ARCADE_IDS].map(async (id) => { try { out[id] = await loadGame(id); } catch (e) { console.warn('minigame niet geladen:', id, e.message); } }));
  return out;
}

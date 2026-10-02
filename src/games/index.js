// Register van alle minigames. Voeg hier een id toe en maak src/games/<id>.js
export const GAME_IDS = [
  'catch', 'mudcart', 'whack', 'potion', 'fishing', 'sokoban', 'plates',
  'kitchen', 'hotbomb', 'goblins', 'rhythm', 'sweeper', 'breakout', 'sumo',
];

const cache = {};
export async function loadGame(id) {
  if (cache[id]) return cache[id];
  const m = await import(`./${id}.js`);
  cache[id] = m.default;
  return m.default;
}
export async function loadAllGames() {
  const out = {};
  await Promise.all(GAME_IDS.map(async (id) => { try { out[id] = await loadGame(id); } catch (e) { console.warn('minigame niet geladen:', id, e.message); } }));
  return out;
}

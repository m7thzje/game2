// Welke versie draait er? gamehal.html zet vóór de module `window.GAMEHAL = true` (Impactid Gamehal, 4 spelers, zonder dorp).
// De gewone versie (index.html) laat dit ongemoeid: dan is GAMEHAL false.
export const GAMEHAL = typeof window !== 'undefined' && window.GAMEHAL === true;

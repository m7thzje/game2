// Startpunt: gast (?join=CODE&as=jor|juul) laadt alleen de dunne client, anders het hele spel.
const q = new URLSearchParams(location.search);
if (q.has('join')) import('./net/guest.js').then((m) => m.runGuest());
else import('./game.js');

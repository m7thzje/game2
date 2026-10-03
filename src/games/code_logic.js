// Pure Mastermind-logica voor Kristal-Code (geen afhankelijkheden, ook in node testbaar).
export const NC = 6, NP = 4;
// Standaard Mastermind-feedback met dubbele kleuren: exact = goede plek+kleur, color = goede kleur op een andere plek
export function feedback(code, guess) {
  const cc = new Array(NC).fill(0), gc = new Array(NC).fill(0); let exact = 0;
  for (let i = 0; i < NP; i++) { if (guess[i] === code[i]) exact++; else { cc[code[i]]++; gc[guess[i]]++; } }
  let color = 0; for (let k = 0; k < NC; k++) color += Math.min(cc[k], gc[k]);
  return { exact, color };
}
export const randomCode = (rnd = Math.random) => Array.from({ length: NP }, () => Math.floor(rnd() * NC));
export function allCodes() { const out = []; for (let n = 0; n < NC ** NP; n++) { const c = []; let x = n; for (let i = 0; i < NP; i++) { c.push(x % NC); x = Math.floor(x / NC); } out.push(c); } return out; }
export const quality = (r) => r.exact * 3 + r.color;

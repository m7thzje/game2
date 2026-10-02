// Een simpele bot voor De Torenklim (alleen voor tests: tools/test_climb.mjs). Gebruikt dezelfde natuurkunde als het spel.
import { canReach, spikeRanges, DJUMP_V, GRAV, JUMP_H } from './climb_layout.js';

export function makeBot(tower, opts = {}) {
  return { tower, target: null, cur: null, skill: { err: 0.25, react: 0.05, push: 0.01, jumpAll: false, ...opts }, wait: 0, rnd: opts.rnd || Math.random, stuck: 0 };
}

function pickTarget(bot, pl, P) {
  const A = pl.ground; if (!A) return null;
  let best = null, bestScore = -1e9;
  for (const B of P) {
    if (B === A || B.spring || B.pad || B.gone || B.ground) continue;
    if (B.tower !== bot.tower && B.tower !== 2) continue;
    if (B.y0 - (B.ay || 0) < A.y0 - 0.2) continue;
    if (B.y0 > A.y0 + 4.5) continue;
    const r = canReach(A, B, { margin: 0.88 }); if (!r.ok) continue;
    const score = B.y0 * 10 - r.gap;
    if (score > bestScore) { bestScore = score; best = B; }
  }
  return best;
}

// Vult out = { x, aP, a, bP } voor één frame.
export function botInput(bot, pl, P, t, dt, out, ctx = {}) {
  out.x = 0; out.aP = false; out.a = false; out.bP = false;
  if (pl.dead || pl.stun > 0) return out;
  const sk = bot.skill;
  if (bot.wait > 0) { bot.wait -= dt; }
  const A = pl.ground;
  if (A) {
    if (!bot.target || bot.target.gone || bot.target.y0 <= A.y0 + 0.1 || bot.target.tower !== bot.tower && bot.target.tower !== 2 || !canReach(A, bot.target, { margin: 0.88 }).ok) bot.target = pickTarget(bot, pl, P);
    const B = bot.target;
    // geen doel? blijf in het midden van het platform en wacht
    if (!B) { const dx = A.x - pl.x; out.x = Math.abs(dx) > 0.5 ? Math.sign(dx) : 0; return out; }
    const aLo = A.x - A.w / 2 + 0.35, aHi = A.x + A.w / 2 - 0.35, bLo = B.x - B.w / 2 + 0.45, bHi = B.x + B.w / 2 - 0.45;
    let aim, overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo) > 0.2;
    if (overlap) aim = (Math.max(aLo, bLo) + Math.min(aHi, bHi)) / 2;
    else aim = B.x > A.x ? aHi : aLo;
    // stekels vermijden
    const sp = spikeRanges(A);
    if (sp) for (const [xa, xb] of sp) if (aim > xa - 0.7 && aim < xb + 0.7) aim = aim - xa < xb - aim ? xa - 0.8 : xb + 0.8;
    const e = (bot.err ??= (bot.rnd() - 0.5) * sk.err * 2);
    aim += e; aim = Math.max(aLo, Math.min(aHi, aim));
    const dx = aim - pl.x;
    if (Math.abs(dx) > 0.3) { out.x = Math.sign(dx); return out; }
    // op de plek: springen (soms met een kleine wachttijd)
    const needTime = !overlap && bot.skill.react > 0 && bot.wait <= 0 && bot.armed !== true;
    if (needTime) { bot.armed = true; bot.wait = bot.rnd() * sk.react; }
    if (bot.wait > 0) return out;
    bot.armed = false; bot.err = undefined;
    // bewegende doelen: spring alleen als hij niet te hoog/te ver staat
    if (B.y - pl.y > JUMP_H * 0.93) { out.x = 0; return out; }       // wacht tot de lift lager staat
    out.aP = true; out.x = B.x > pl.x ? 1 : B.x < pl.x ? -1 : 0; if (overlap) out.x = Math.abs(B.x - pl.x) > 0.5 ? Math.sign(B.x - pl.x) * 0.5 : 0;
    return out;
  }
  // in de lucht
  const B = bot.target;
  if (B) {
    const tx = Math.max(B.x - B.w / 2 + 0.5, Math.min(B.x + B.w / 2 - 0.5, pl.x));
    const dxs = tx - pl.x;
    // naar het doel sturen: richt op het midden als we er niet boven zijn
    const want = (pl.x < B.x - B.w / 2 + 0.5 || pl.x > B.x + B.w / 2 - 0.5) ? B.x : tx;
    const dx = want - pl.x;
    out.x = Math.abs(dx) > 0.15 ? Math.sign(dx) : 0;
    if (pl.canDouble && pl.vy < -1 && pl.y < B.y - 0.25 && B.y - pl.y < 2.2 && Math.abs(B.x - pl.x) < B.w / 2 + 2.2) out.aP = true;
  } else out.x = 0;
  return out;
}

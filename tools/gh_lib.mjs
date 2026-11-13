// Gedeelde hulpjes voor de Gamehal-tests (hallstest.mjs en e2e.mjs met GAMEHAL=1 of PLAYERS=4).
// De Gamehal draait via /gamehal.html (window.GAMEHAL). Aantal spelers: env PLAYERS=2|3|4 (standaard 4).
export const GH_N = (() => { const n = +(process.env.PLAYERS || 4); return n === 2 || n === 3 ? n : 4; })();
export const wantGamehal = () => process.env.GAMEHAL === '1' || process.env.PLAYERS === '4';

export function ghHelpers(page, { check, shot }) {
  const press = (i = 0, k = 'a') => page.evaluate(async ([i, k]) => { const v = window.__app.input.virtual[i]; const raf = () => new Promise((r) => requestAnimationFrame(r)); v[k] = true; await raf(); v[k] = false; await raf(); await raf(); }, [i, k]);
  const modalText = () => page.evaluate(() => (document.querySelector('.card') || {}).innerText || '');
  const dialog = () => page.evaluate(() => (document.querySelector('.dialog .txt') || {}).textContent || '');
  const choose = (i) => page.evaluate((i) => { const m = window.__app.mode; m.menu.sel = i; m.menu.activate(1); }, i);
  const waitMenu = (ms = 25000) => page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.menu, null, { timeout: ms });
  const modeName = () => page.evaluate(() => window.__app.mode && window.__app.mode.constructor.name);
  const isIdle = () => page.evaluate(() => { const m = window.__app.mode; return !!(m && m.interact && !m.busy && !m.menu && !m.modal); });
  const waitHall = (ms = 90000) => page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.constructor.name === 'ArcadeMode' && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: ms });
  const clickUntil = async (cond, max = 80) => { for (let i = 0; i < max; i++) { if (await cond()) return true; await press(0, 'a'); await page.waitForTimeout(120); } return await cond(); };
  const toCab = (id) => page.evaluate((id) => { const m = window.__app.mode; const c = m.cabs.find((x) => x.id === id); const n = m.players.length; m.players.forEach((p, i) => { p.x = c.ix + (i - (n - 1) / 2) * 1.2; p.z = c.iz + 0.3 + (i % 2) * 0.3; p.vx = p.vz = 0; }); m.intro = 0; return c.id; }, id);
  const goto = (x, z) => page.evaluate(([x, z]) => { const m = window.__app.mode; const n = m.players.length; m.players.forEach((p, i) => { p.x = x + (i - (n - 1) / 2) * 1.2; p.z = z; p.vx = p.vz = 0; }); m.intro = 0; }, [x, z]);
  const names = () => page.evaluate(() => window.__app.S.names.slice());
  // een spel (MinigameMode) afspelen: iedereen klaar, laat het spel meteen eindigen met `res` (finishPvp-argument), sluit het resultaat.
  // res kan een functie zijn (ctx -> object), bijv. (ctx) => ({ winner: 0, score: [1, 0] }). Geeft { ids, n, names } terug.
  const playMatch = async (res = { winner: 0, score: [1, 0] }, { rematch = false } = {}) => {
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx && window.__app.mode.ids, null, { timeout: 60000 });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; const ids = m.ids.slice();
      for (const id of ids) inp.virtual[id].a = true; inp.update(); m.update(0.016); for (const id of ids) inp.virtual[id].a = false; inp.update(); m.update(0.016);
      return { ids, n: m.n, names: m.ctx.players.map((q) => q.name), extra: m.extra && { bracket: !!m.extra.bracket, name: m.extra.bracketName, teams: m.ctx.teams } }; });
    await page.waitForTimeout(600);   // het aftellen begint 350 ms na 'iedereen klaar'
    await page.evaluate((src) => { const app = window.__app, m = app.mode, inp = app.input; let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
      const r = typeof src === 'string' ? new Function('ctx', 'return (' + src + ')(ctx)')(m.ctx) : src; m.ctx.finishPvp(r); }, typeof res === 'function' ? res.toString() : res);
    await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 });
    await page.evaluate((re) => { const app = window.__app, m = app.mode, inp = app.input; const id = m.ids[0]; if (m.canRematch) { m.resSel = re ? 0 : 1; m.drawResOpts(); } inp.virtual[id].a = true; inp.update(); m.update(0.016); inp.virtual[id].a = false; inp.update(); m.update(0.016); }, rematch);
    return info;
  };
  return { press, modalText, dialog, choose, waitMenu, modeName, isIdle, waitHall, clickUntil, toCab, goto, names, playMatch, check, shot, page };
}

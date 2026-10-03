// Gebruik: node tools/test_tag.mjs [scenario...]   scenario: bots | twists | idle | timeout | rules | shots
//   TW=<twist-id> kiest een twist (anders "none"). Bots spelen versneld (zonder renderen) hele potjes; rapporteert ontploffingen, winnaar, finishPvp-aantal, fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failed = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

async function open(twist, size = [1100, 650]) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=tag&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
  });
  return { browser, page, errors };
}

// bots: cfg[i] = { skill 0..1, style: 'play' | 'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ dir: [1, 0], keep: 0, a: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.pl[i], op = st.pl[1 - i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.rstate !== 'play') continue;
          const hold = me.bomb, ox = op.x - me.x, oz = op.z - me.z, od = Math.hypot(ox, oz) || 1;
          b.keep -= dt;
          if (b.keep <= 0) {
            let best = -1e9, ba = 0;
            for (let a = 0; a < 16; a++) {
              const an = a / 16 * Math.PI * 2, cx = Math.cos(an), cz = Math.sin(an); let sc = 0;
              const dot = (cx * ox + cz * oz) / od; sc += hold ? dot * 3 : -dot * 2.2;
              for (const dd of [1.6, 3.2]) { const x = me.x + cx * dd, z = me.z + cz * dd; for (const o of st.obst) { const e = Math.hypot(o.x - x, o.z - z); if (e < o.r + 1.0) sc -= 4 / dd; } sc -= (Math.abs(x) > 14 ? 5 : 0) + (Math.abs(z) > 7.7 ? 5 : 0); }
              if (!hold) { const nx = me.x + cx * 5, nz = me.z + cz * 5; sc -= (Math.abs(nx) > 13.5 ? 2 : 0) + (Math.abs(nz) > 7 ? 2 : 0); }
              sc += rnd() * (1 - c.skill) * 5;
              if (sc > best) { best = sc; ba = an; }
            }
            b.dir = [Math.cos(ba), Math.sin(ba)]; b.keep = 0.1 + (1 - c.skill) * 0.25;
          }
          v.x = b.dir[0]; v.y = b.dir[1];
          if (me.stun > 0) { v.x = 0; v.y = 0; }
          b.a -= dt;
          if ((hold ? od < 9 : od < 7) && me.stam > 0.25 && b.a <= 0) { v.a = true; if (me.dive <= 0 && me.stam > 0.3 && od < 3.4 && rnd() < 0.2 + c.skill * 0.3) b.a = 0.12; }
          else if (me.stam > 0.9 && b.a <= 0) v.a = false;
          if (b.a > 0) v.a = false;
          if (!hold && od < 5.5 && me.trapCd <= 0 && rnd() < 0.05 + c.skill * 0.1) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function playMatch(page, maxFrames = 60 * 300) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance, log = []; let last = '', g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = `${st.count}:${st.rstate}:${st.lives}`;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} bom#${st.count} ${st.rstate} lives=${st.lives} holder=${st.holder} fuse=${st.fuse} obst=${st.obst.length} matchT=${st.matchT}${st.sd ? ' SD' : ''}`); last = key; }
    }
    window.__app.mode.paused = false; for (let k = 0; k < 400 && !window.__app.mode.result; k++) { window.__app.input.update(); m.update(1 / 60); } window.__app.mode.paused = true;
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  }, maxFrames);
}

for (const name of scen) {
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const P = (skill, style = 'play') => ({ skill, style });
    const list = name === 'twists' ? TWISTS.map((t) => [t, [P(0.9), P(0.7)]])
      : name === 'idle' ? [['none', [P(0, 'idle'), P(0, 'idle')]], ['none', [P(1), P(0, 'idle')]], ['none', [P(0, 'idle'), P(1)]]]
        : name === 'timeout' ? [['none', [P(1), P(1)]]]
          : [[process.env.TW || 'none', [P(0.95), P(0.5)]], [process.env.TW || 'none', [P(0.5), P(0.95)]], [process.env.TW || 'none', [P(0.85), P(0.85)]], [process.env.TW || 'none', [P(0.7), P(0.9)]]];
    const wins = [0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setMatchT(4); });
      const res = await playMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} lives=${st.lives} stats=${JSON.stringify(st.stats)} pl=${st.pl.map((p) => `tags${p.tags}/peels${p.peels}/slips${p.slips}/dives${p.dives}/it${p.items}/boom${p.booms}`)}`);
      console.log(`RESULT winner=${res.result?.winner} score=${res.result?.scoreArr} fin=${res.fin?.length} ::`, (res.result?.summary || '').replace(/<[^>]+>/g, ' '));
      check(res.fin.length === 1 && res.finished, `finishPvp precies één keer (${res.fin.length}) twist=${res.twist}`);
      check(res.result && (res.result.winner === 0 || res.result.winner === 1), 'er is een winnaar');
      check(st.T < 130, `potje niet te lang (${st.T.toFixed(0)} s)`);
      check(!errors.length, errors.length ? 'console-errors: ' + errors.slice(0, 5).join(' | ') : 'geen console-errors');
      if (name === 'timeout') check(res.log.some((l) => l.includes('SD')), 'noodbom (sudden death) werd gebruikt');
      if (res.result && res.result.winner != null) wins[res.result.winner]++;
      await browser.close();
    }
    if (name === 'bots') check(wins[0] > 0 && wins[1] > 0, `beide spelers kunnen winnen (${wins})`);
    continue;
  }
  if (name === 'rules') {
    const out = {}; const allErr = [];
    const run = async (fn) => { const { browser, page, errors } = await open(process.env.TW || 'none'); await installBots(page, [{ skill: 1, style: 'idle' }, { skill: 1, style: 'idle' }]); const r = await page.evaluate(fn); allErr.push(...errors); await browser.close(); return r; };
    const step = `const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input; const step = (n) => { m.paused = false; for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };`;
    const mk = (body) => new Function(`${step} ${body}`);
    out.tag = await run(mk(`step(120); d.chickens.forEach((c) => { c.cd = 999; }); d.setFuse(60); d.giveBomb(0); d.place(0, -9, 5); d.place(1, -7.6, 5); step(3); const s1 = d.state(); step(10); d.place(0, -9, 3); d.place(1, -7.6, 3); step(3); const s2 = d.state(); return { holder1: s1.holder, safe: s1.pl[0].safe, tags: s1.pl[0].tags, holder2: s2.holder, passes: s2.stats.passes };`));
    out.fuse = await run(mk(`step(120); d.giveBomb(1); d.setFuse(1.0); const x0 = d.state().lives; step(70); const s = d.state(); return { x0, lives: s.lives, rstate: s.rstate, obst: s.obst.length, booms: s.stats.booms };`));
    out.peel = await run(mk(`step(120); d.giveBomb(0); d.setFuse(60); d.place(0, -6, -7); d.place(1, 6, 7); inp.virtual[1].x = 0.01; inp.virtual[1].b = true; inp.update(); m.paused = false; m.update(1 / 60); inp.virtual[1].b = false; step(30); const s0 = d.state(); const pe = s0.peels[0]; if (pe) { d.place(0, pe.x, pe.z); } step(2); const s = d.state(); return { placed: s0.peels.length, slips: s.pl[0].slips + s.pl[1].slips, st: s.stats.slips };`));
    out.shield = await run(mk(`step(120); d.chickens.forEach((c) => { c.cd = 999; }); d.setFuse(60); d.giveBomb(0); d.giveGift(1, 'shield'); d.place(0, -9, 5); d.place(1, -7.6, 5); step(3); const s = d.state(); return { holder: s.holder, sh: s.pl[1].sh, stun: s.pl[0].stun };`));
    out.chicken = await run(mk(`step(120); d.setFuse(60); d.giveBomb(0); d.place(0, -8, 6); d.place(1, 8, -6); d.stealNow(0); step(5); const s1 = d.state(); step(60 * 5); const s2 = d.state(); return { carry1: s1.carry, holder1: s1.holder, carry2: s2.carry, holder2: s2.holder, chick: s2.stats.chicken };`));
    out.post = await run(mk(`step(120); d.chickens[1].cd = 999; d.setFuse(60); d.giveBomb(0); d.place(0, -12, 6.2); d.place(1, -8.6, 6.2); d.stealNow(0); step(60 * 2); const s = d.state(); return { holder: s.holder, carry: s.carry, chick: s.stats.chicken, safe: s.pl[0].safe };`));
    out.gifts = await run(mk(`step(120); d.setFuse(60); d.giveBomb(0); d.place(0, -8, 6); d.place(1, 8, -6); d.giveGift(0, 'speed'); d.giveGift(1, 'teleport'); const s = d.state(); return { spd: s.pl[0].spd, tx: s.pl[1].x, tz: s.pl[1].z };`));
    out.ufo = await run(mk(`step(120); d.setFuse(80); d.giveBomb(0); d.place(0, -13, 7); d.place(1, 13, -7); d.ufoNow(); const n0 = d.state().obst.length; let seen = false; for (let k = 0; k < 60 * 14; k++) { step(1); if (d.state().ufo !== 'idle') seen = true; } const s = d.state(); return { n0, n1: s.obst.length, seen, st: s.stats.ufo, ufo: s.ufo };`));
    console.log(JSON.stringify(out));
    check(out.tag.holder1 === 1 && out.tag.tags === 1, 'tikken geeft de bom door');
    check(out.tag.holder2 === 1 && out.tag.passes === 1, 'niet direct terug te tikken (onaantastbaarheid)');
    check(out.fuse.lives[1] === out.fuse.x0 - 0 || out.fuse.lives[1] === 2, 'ontploffing kost de houder een leven');
    check(out.fuse.booms === 1, 'bom ontploft');
    check(out.peel.placed >= 1 && out.peel.st >= 1, 'bananenschil legt neer en laat uitglijden');
    check(out.shield.holder === 0 && out.shield.sh === false, 'schild blokkeert de tik');
    check(out.chicken.carry1 >= 0 && out.chicken.carry2 === -1 && out.chicken.holder2 >= 0, 'kip steelt en bezorgt/geeft de bom terug');
    check(out.post.holder === 1 && out.post.chick === 1, 'kip bezorgt de bom bij de ander (Kip-post)');
    check(out.gifts.spd && Math.hypot(out.gifts.tx + 8, out.gifts.tz + 6) > 0, 'kadootjes (turbo, teleport)');
    check(out.ufo.seen && out.ufo.st >= 1, 'ufo komt langs');
    check(!allErr.length, allErr.length ? allErr.join('|') : 'geen console-errors');
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'play' }, { skill: 0.8, style: 'play' }]);
    const snap = async (tag) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tag_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { st: s.rstate, fuse: s.fuse, lives: s.lives, holder: s.holder, gifts: s.gifts, ufo: s.ufo }; }))); };
    const go = (cond, max = 60 * 120) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    const dbg = (code) => page.evaluate(new Function(`const d = window.__app.mode.instance.dbg; ${code}`));
    await page.evaluate(() => window.__bot(60 * 3)); await snap('play');
    await dbg(`d.spawnGift('speed'); d.spawnGift('shield'); `); await page.evaluate(() => window.__bot(20)); await snap('gifts');
    await go('s.stats.passes>0', 60 * 40); await page.evaluate(() => window.__bot(4)); await snap('tag');
    await dbg(`d.setFuse(2.5);`); await page.evaluate(() => window.__bot(40)); await snap('danger');
    await go('s.rstate==="boom"', 60 * 10); await page.evaluate(() => window.__bot(8)); await snap('boom');
    await page.evaluate(() => window.__bot(60 * 2)); await snap('after');
    await go('s.rstate==="play"', 60 * 10); await dbg(`d.ufoNow();`); await go('s.ufo==="carry"||s.ufo==="lift"', 60 * 14); await page.evaluate(() => window.__bot(10)); await snap('ufo');
    await dbg(`d.stealNow(0);`); await page.evaluate(() => window.__bot(40)); await snap('chicken');
    await go('s.stats.peels>0 || s.rstate!=="play"', 60 * 30); await page.evaluate(() => window.__bot(6)); await snap('peel');
    await dbg(`d.setMatchT(0.5);`); await page.evaluate(() => window.__bot(60 * 3)); await snap('suddendeath');
    await go('s.finished', 60 * 200); await page.waitForTimeout(1800); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
console.log(failed ? `\n${failed} CONTROLES MISLUKT` : '\nALLE CONTROLES OK'); process.exit(failed ? 1 : 0);

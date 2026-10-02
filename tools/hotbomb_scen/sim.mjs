// Laat 4x AI het spel spelen (broers als 'slimme' AI) om balans te meten.
export default async function (S) {
  const { ev, step, start } = S;
  const N = +(process.env.N || 12);
  const rows = []; const place = {};
  for (let g = 0; g < N; g++) {
    if (g > 0) { await ev(() => __app.mode.restart()); }
    await start();
    await ev(() => K().aiOnly(true));
    const res = await ev(() => {
      let steps = 0; const log = []; let lastRound = 0, rt = 0;
      while (__app.mode.state === 'play' && steps < 4000) {
        __app.input.update(); __app.mode.update(0.05); steps++;
        const st = K().st; if (st.phase === 'round') rt += 0.05; if (st.round !== lastRound) { lastRound = st.round; rt = 0; }
      }
      const E = K().E;
      return { steps, t: steps * 0.05, ranks: E.map((e) => e.name + ':' + e.rank), passes: K().st.passes, state: __app.mode.state, summary: __app.mode.result && __app.mode.result.stars };
    });
    rows.push(res);
    console.log(g, res.t.toFixed(0) + 's', res.ranks.join(' '), 'passes', res.passes, 'stars', res.summary);
  }
  const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const rk = (n) => avg((r) => +r.ranks.find((x) => x.startsWith(n)).split(':')[1]);
  console.log('gem. rang (4=winnaar):', ['Daan', 'Sem', 'Fonkel', 'Dobber'].map((n) => n + '=' + rk(n).toFixed(2)).join(' '), ' sterren gem.', avg((r) => r.summary).toFixed(2), ' passes gem.', avg((r) => r.passes).toFixed(1), ' duur gem.', avg((r) => r.t).toFixed(0));
}

export default async function ({ ev, step, start }) {
  await start();
  const r = await ev(() => {
    let steps = 0, finished = 0; const m = __app.mode; const f = m.finish.bind(m); m.finish = (x) => { finished++; return f(x); };
    while (__app.mode.state === 'play' && steps < 3000) {
      if (steps % 6 === 0) for (const i of [0, 1]) { const v = __app.input.virtual[i]; v.x = Math.sign(Math.random() - 0.5) * (Math.random() < 0.6); v.y = Math.sign(Math.random() - 0.5) * (Math.random() < 0.6); }
      for (const i of [0, 1]) { const v = __app.input.virtual[i]; v.a = Math.random() < 0.25; v.b = Math.random() < 0.3; }
      __app.input.update(); __app.mode.update(0.05); steps++;
    }
    return { steps, finished, state: __app.mode.state, s: K().state };
  });
  console.log(JSON.stringify(r));
}

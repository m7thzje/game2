export default async function (S) {
  const { ev, step, start } = S;
  for (let g = 0; g < 9; g++) {
    if (g > 0) await ev(() => __app.mode.restart());
    await start();
    console.log(g, await ev(() => ({ st: __app.mode.state, ph: K().st.phase, ready: __app.mode.ready, hud: document.getElementById('hud').children.length, styles: document.querySelectorAll('style').length, roster: document.querySelectorAll('.hb-roster').length })));
    await ev(() => K().aiOnly(true));
    await step(300);
  }
}

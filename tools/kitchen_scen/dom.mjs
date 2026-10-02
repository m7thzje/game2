export default async function ({ ev, step, start, shot }) {
  await start();
  for (let k = 0; k < 6; k++) {
    await step(100);
    console.log(await ev(() => { const w = document.querySelector('.kt-wrap'); return JSON.stringify({ t: K().state.t.toFixed(0), wrapConnected: !!w, kids: w ? w.children.length : -1, orders: K().seats.filter(s => s.state === 'waiting').length, hud: document.getElementById('hud').children.length }); }));
  }
  await shot('dom');
}

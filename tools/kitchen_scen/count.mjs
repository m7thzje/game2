export default async function ({ ev, step, start }) {
  await start(); await step(20);
  console.log(JSON.stringify(await ev(() => {
    const out = []; const sc = __app.mode.scene;
    let top = 0;
    for (const c of sc.children) {
      if (c.isMesh) { top++; continue; }
      let n = 0; c.traverse((o) => { if (o.isMesh) n++; });
      if (n) out.push(n + ':' + (c.type) + '@' + c.position.x.toFixed(1) + ',' + c.position.y.toFixed(1) + ',' + c.position.z.toFixed(1));
    }
    return { top, groups: out.sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 40) };
  })));
}

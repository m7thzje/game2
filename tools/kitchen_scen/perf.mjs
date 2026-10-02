export default async function ({ ev, step, start }) {
  await start(); await step(200);
  console.log(JSON.stringify(await ev(() => { let m = 0, l = 0; __app.mode.scene.traverse((o) => { if (o.isMesh) m++; if (o.isLight) l++; }); return { meshes: m, lights: l, calls: __app.renderer.info.render.calls, tris: __app.renderer.info.render.triangles, geos: __app.renderer.info.memory.geometries, tex: __app.renderer.info.memory.textures }; })));
}

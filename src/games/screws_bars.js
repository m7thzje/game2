import * as THREE from 'three';

// Voortgangsbalken die aan de camera hangen (altijd in beeld, ook als de camera meebeweegt).
// Gebruikt door 'screws' (verticaal) en 'chop' (horizontaal).
//   const bars = makeBars(ctx, { colors: [0x2f9e5b, 0x3a78e0], vertical: true });
//   bars.update([0..1, 0..1]);
export function makeBars(ctx, { colors, vertical = true, dist = 12, length = 0.62 } = {}) {
  const { camera, scene } = ctx;
  if (!camera.parent) scene.add(camera);   // kinderen van de camera worden alleen getekend als de camera in de scene zit
  const root = new THREE.Group(); camera.add(root);
  const mk = (color, op = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, fog: false });
  const plane = new THREE.PlaneGeometry(1, 1);
  const ring = new THREE.CircleGeometry(0.5, 16);
  const items = [0, 1].map((i) => {
    const g = new THREE.Group();
    const back = new THREE.Mesh(plane, mk(0x120a06, 0.6)); back.renderOrder = 30;
    const edge = new THREE.Mesh(plane, mk(0xffffff, 0.25)); edge.renderOrder = 29;
    const fill = new THREE.Mesh(plane, mk(colors[i], 0.95)); fill.renderOrder = 31;
    const dotO = new THREE.Mesh(ring, mk(0xffffff, 1)); dotO.renderOrder = 32;
    const dot = new THREE.Mesh(ring, mk(colors[i], 1)); dot.renderOrder = 33;
    const flag = new THREE.Mesh(plane, mk(0xffe14a, 0.9)); flag.renderOrder = 31;
    g.add(edge, back, fill, flag, dotO, dot); root.add(g);
    return { g, back, edge, fill, flag, dotO, dot };
  });
  let lastAspect = 0;
  function update(vals) {
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
    lastAspect = camera.aspect;
    const th = halfH * 0.05;     // dikte
    for (let i = 0; i < 2; i++) {
      const it = items[i], v = Math.max(0, Math.min(1, vals[i] || 0));
      it.g.position.z = -dist;
      if (vertical) {
        const L = halfH * 2 * length, x = (i === 0 ? -1 : 1) * (halfW - halfH * 0.11), yTop = halfH * length;
        it.edge.scale.set(th + 0.06, L + 0.06, 1); it.edge.position.set(x, 0, 0);
        it.back.scale.set(th, L, 1); it.back.position.set(x, 0, 0);
        it.fill.scale.set(th * 0.7, Math.max(0.001, L * v), 1); it.fill.position.set(x, yTop - L * v / 2, 0);
        it.flag.scale.set(th * 2.2, th * 0.5, 1); it.flag.position.set(x, -yTop, 0);
        it.dotO.scale.set(th * 2.0, th * 2.0, 1); it.dot.scale.set(th * 1.45, th * 1.45, 1);
        it.dotO.position.set(x, yTop - L * v, 0.01); it.dot.position.set(x, yTop - L * v, 0.02);
      } else {
        const L = halfW * length, y = halfH * 0.58, xo = halfH * 0.1;
        const sg = i === 0 ? -1 : 1, x0 = sg * (halfW - xo);        // buitenrand
        const cx = x0 - sg * L / 2;                                  // midden van de balk (loopt naar het midden)
        it.edge.scale.set(L + 0.06, th + 0.06, 1); it.edge.position.set(cx, y, 0);
        it.back.scale.set(L, th, 1); it.back.position.set(cx, y, 0);
        it.fill.scale.set(Math.max(0.001, L * v), th * 0.7, 1); it.fill.position.set(x0 - sg * L * v / 2, y, 0);
        it.flag.scale.set(th * 0.5, th * 2.2, 1); it.flag.position.set(x0 - sg * L, y, 0);
        it.dotO.scale.set(th * 2.0, th * 2.0, 1); it.dot.scale.set(th * 1.45, th * 1.45, 1);
        it.dotO.position.set(x0 - sg * L * v, y, 0.01); it.dot.position.set(x0 - sg * L * v, y, 0.02);
      }
    }
  }
  return { update, root };
}

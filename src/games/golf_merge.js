import * as THREE from 'three';

// Voegt statische meshes met hetzelfde materiaal samen (veel minder draw calls). Objecten met userData.dyn (of een ouder met dyn) blijven los.
// Ook bruikbaar voor pacduel (hergebruikt als eigen hulpbestandje, zodat we niet van andere games afhangen).
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const isDyn = (o) => { for (let p = o; p; p = p.parent) if (p.userData && p.userData.dyn) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.visible || isDyn(o)) return;
    const g = o.geometry; if (!g || !g.attributes.position || !g.attributes.normal) return;
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let b = buckets.get(key); if (!b) { b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, list: [] }; buckets.set(key, b); }
    b.list.push(o);
  });
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = b.list.map((o) => (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry));
    const n = geos.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let off = 0;
    b.list.forEach((o, k) => {
      const g = geos[k], m = o.matrixWorld; nm.getNormalMatrix(m);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos[(off + i) * 3] = v.x; pos[(off + i) * 3 + 1] = v.y; pos[(off + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[(off + i) * 3] = v.x; nor[(off + i) * 3 + 1] = v.y; nor[(off + i) * 3 + 2] = v.z;
        if (U) { uv[(off + i) * 2] = U.getX(i); uv[(off + i) * 2 + 1] = U.getY(i); }
      }
      off += P.count;
    });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mg.computeBoundingSphere();
    const mm = new THREE.Mesh(mg, b.mat); mm.castShadow = b.cast; mm.receiveShadow = b.recv; mm.renderOrder = b.ro; mm.userData.merged = true;
    root.add(mm);
    for (const o of b.list) if (o.parent) o.parent.remove(o);
    merged += b.list.length;
  }
  return merged;
}

import * as THREE from 'three';

// Voegt statische meshes samen per (materiaal, ruimtecel) om draw calls te sparen.
// Alles met userData.dynamic (of onder zo'n object) blijft ongemoeid.
function matKey(m) {
  if (!m || Array.isArray(m)) return null;
  if (m.isMeshBasicMaterial || m.transparent || m.wireframe) return null;
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.001) return null;
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null;
  return [m.type, m.map ? m.map.uuid : '', m.color ? m.color.getHexString() : '', m.roughness, m.metalness, m.flatShading ? 1 : 0, m.side, m.vertexColors ? 1 : 0].join('|');
}
export function mergeStatic(scene, startIndex, { cell = 36 } = {}) {
  const roots = scene.children.slice(startIndex);
  const meshes = [];
  const walk = (o) => {
    if (o.userData && o.userData.dynamic) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.normal) meshes.push(o);
    for (const c of o.children) walk(c);
  };
  roots.forEach(walk);
  const groups = new Map();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    if (!m.visible) continue;
    const k = matKey(m.material); if (!k) continue;
    m.updateWorldMatrix(true, false);
    v.setFromMatrixPosition(m.matrixWorld);
    const key = `${k}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${Math.floor(v.x / cell)},${Math.floor(v.z / cell)}`;
    let g = groups.get(key); if (!g) { g = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, list: [] }; groups.set(key, g); }
    g.list.push(m);
  }
  let removed = 0, added = 0;
  for (const g of groups.values()) {
    if (g.list.length < 2) continue;
    const useColor = g.list.some((m) => m.geometry.attributes.color);
    let total = 0; const geos = [];
    for (const m of g.list) { const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); geos.push(geo); total += geo.attributes.position.count; }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = useColor ? new Float32Array(total * 3).fill(1) : null;
    let o = 0;
    for (const geo of geos) {
      const n = geo.attributes.position.count;
      pos.set(geo.attributes.position.array, o * 3); nor.set(geo.attributes.normal.array, o * 3);
      if (geo.attributes.uv) uv.set(geo.attributes.uv.array, o * 2);
      if (col && geo.attributes.color) col.set(geo.attributes.color.array, o * 3);
      o += n; geo.dispose();
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mg.computeBoundingSphere();
    const mesh = new THREE.Mesh(mg, g.mat); mesh.castShadow = g.cast; mesh.receiveShadow = g.recv; mesh.matrixAutoUpdate = false; scene.add(mesh); added++;
    for (const m of g.list) { m.parent && m.parent.remove(m); removed++; }
  }
  return { removed, added };
}

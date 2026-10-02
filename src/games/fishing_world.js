import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, rand, TAU, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';

// De wereld van "Samen Vissen": meer bij zonsondergang met steiger, roeiboot, riet, lelies, libellen...
// buildLake(scene, camera, fx) -> lake { tip, laneZ, boat, water, update(t,dt), ripple(x,z,size), makeSilhouette(kind), makeFish3D(color,len) ... }

export const TIP = { x: 0, y: 0.86, z: -1.5 };
export const NET_D = 5.5;
export const LANE_Z = TIP.z - NET_D;
export const SUN_DIR = new THREE.Vector3(-0.2, 0.07, -1).normalize();

const GLSL_SKY = `
vec3 skyCol(vec3 d){
  float y = clamp(d.y, 0.0, 1.0);
  vec3 hor = vec3(1.0, 0.56, 0.30);
  vec3 low = vec3(0.92, 0.38, 0.45);
  vec3 mid = vec3(0.50, 0.26, 0.58);
  vec3 top = vec3(0.10, 0.09, 0.30);
  vec3 c = mix(hor, low, smoothstep(0.0, 0.10, y));
  c = mix(c, mid, smoothstep(0.08, 0.35, y));
  c = mix(c, top, smoothstep(0.3, 0.9, y));
  return c;
}`;

function shapeFish() {
  const s = new THREE.Shape();
  s.moveTo(1.0, 0);
  s.bezierCurveTo(0.8, 0.3, 0.35, 0.4, -0.15, 0.3);
  s.lineTo(-0.35, 0.55); s.lineTo(-0.55, 0.25); // rugvin
  s.bezierCurveTo(-0.7, 0.14, -0.75, 0.1, -0.78, 0.07);
  s.lineTo(-1.1, 0.36); s.lineTo(-0.95, 0); s.lineTo(-1.1, -0.36); s.lineTo(-0.78, -0.07);
  s.bezierCurveTo(-0.75, -0.1, -0.7, -0.14, -0.55, -0.25);
  s.lineTo(-0.35, -0.55); s.lineTo(-0.15, -0.3);
  s.bezierCurveTo(0.35, -0.4, 0.8, -0.3, 1.0, 0);
  return new THREE.ShapeGeometry(s, 8);
}
function shapeBoot() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.45); s.lineTo(0.0, 0.45); s.lineTo(0.05, 0.0); s.lineTo(0.8, -0.05); s.bezierCurveTo(1.0, -0.05, 1.0, -0.4, 0.8, -0.42); s.lineTo(-0.5, -0.4); s.closePath();
  return new THREE.ShapeGeometry(s, 4);
}
function shapeWhisker() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-0.9, 0.05); s.lineTo(-0.9, -0.03); s.closePath(); return new THREE.ShapeGeometry(s);
}
const G_FISH = shapeFish(), G_BOOT = shapeBoot(), G_WHISK = shapeWhisker();

export function buildLake(scene, camera, fx) {
  const R = mulberry32(2024);
  const upd = [];
  const lake = { tip: TIP, laneZ: LANE_Z };

  // ------------------------------------------------------------ lucht
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `varying vec3 vD; uniform vec3 sunDir; ${GLSL_SKY}
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vD);
        vec3 c = skyCol(d);
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0,0.78,0.42) * pow(s, 400.0) * 3.0 + vec3(1.0,0.5,0.22) * pow(s, 14.0) * 0.55 + vec3(1.0,0.6,0.3)*pow(s,3.0)*0.18;
        float st = step(0.9965, hash(floor(d*220.0))) * smoothstep(0.3, 0.7, d.y);
        c += vec3(st);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  scene.background = new THREE.Color(0x2a1a40);
  upd.push(() => sky.position.copy(camera.position));

  // wolken
  const clouds = [];
  const cloudCols = [0xff9a78, 0xe86a8a, 0xffb48a, 0xc86a9a, 0xff8a70];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(); const col = cloudCols[i % cloudCols.length]; const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, fog: false });
    const n = 4 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), m); b.position.set((k - n / 2) * 6 + R() * 3, R() * 1.4, R() * 3); b.scale.set(6 + R() * 5, 1.4 + R() * 1.2, 2.4 + R() * 1.5); g.add(b); }
    g.position.set(-150 + i * 40 + R() * 20, 24 + R() * 38, -150 - R() * 40); g.userData.sp = 0.35 + R() * 0.5; scene.add(g); clouds.push(g);
  }
  upd.push((t, dt) => { for (const c of clouds) { c.position.x += c.userData.sp * dt; if (c.position.x > 200) c.position.x = -200; } });

  // zon
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: 0xffe9b8, fog: false }));
  sunDisc.position.copy(SUN_DIR).multiplyScalar(260); sunDisc.lookAt(0, 0, 0); scene.add(sunDisc);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xff9a50, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
  sunGlow.position.copy(SUN_DIR).multiplyScalar(255); sunGlow.scale.setScalar(120); scene.add(sunGlow);

  // ------------------------------------------------------------ bergen en overkant
  const mountain = (x, z, r, h, col) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshBasicMaterial({ color: col, fog: false })); m.position.set(x, h / 2 - 1, z); m.rotation.y = R() * 3; scene.add(m); };
  for (let i = 0; i < 9; i++) mountain(-150 + i * 38 + R() * 14, -190 - R() * 10, 38 + R() * 20, 38 + R() * 30, 0x5a3f7e);
  for (let i = 0; i < 10; i++) mountain(-140 + i * 32 + R() * 14, -140, 26 + R() * 14, 20 + R() * 20, 0x3e3068);
  const far = mesh(new THREE.BoxGeometry(260, 4, 18), new THREE.MeshBasicMaterial({ color: 0x23404a }), { cast: false, receive: false, pos: [0, 1, -78] }); scene.add(far);
  for (let i = 0; i < 20; i++) { const t = P.pine(9 + R() * 7, 0x1f4a44); t.position.set(-70 + i * 7 + R() * 3, 2, -72 - R() * 10); scene.add(t); t.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); }
  const wm = P.windmill(1.8); wm.position.set(-34, 3, -66); wm.rotation.y = 0.5; scene.add(wm); wm.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  upd.push((t, dt) => { wm.userData.blades.rotation.z += dt * 0.35; });
  const cot = P.houseSimple(6, 5, 3.4, { wall: '#e8d6b0', roof: '#a8483a', thatch: true }); cot.position.set(28, 3, -64); cot.rotation.y = -0.3; cot.scale.setScalar(1.7); scene.add(cot);
  cot.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  (cot.userData.windows || []).forEach((w) => { w.material = new THREE.MeshBasicMaterial({ color: 0xffd27a }); });
  const smoke = { t: 0 };
  upd.push((t, dt) => { smoke.t -= dt; if (smoke.t <= 0) { smoke.t = 0.5; fx.particles.emit(28 + 3.4, 17, -64, 0.8, 1.6, 0, { life: 6, size: 3, color: 0xb8a8b8, gravity: -0.05, shrink: false }); } });

  // ------------------------------------------------------------ bodem + water
  const bedTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2c5258'; g.fillRect(0, 0, w, h); const r = mulberry32(3);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${40 + r() * 40},${90 + r() * 50},${90 + r() * 40},.5)`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rad = 10 + r() * 22; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(170,255,235,.16)'); gr.addColorStop(1, 'rgba(170,255,235,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  }, { repeat: [28, 18] });
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(280, 180), new THREE.MeshBasicMaterial({ map: bedTex, color: 0x9ab8b8 }));
  bed.rotation.x = -Math.PI / 2; bed.position.set(0, -1.7, -75); scene.add(bed);
  upd.push((t) => { bedTex.offset.set(Math.sin(t * 0.12) * 0.05, t * 0.01); });
  for (let i = 0; i < 26; i++) { const rk = mesh(new THREE.DodecahedronGeometry(0.6 + R() * 1.2, 0), mat(0x2a4048), { cast: false, receive: false, pos: [-40 + R() * 80, -1.7, -6 - R() * 40], scale: [1, 0.5, 1] }); scene.add(rk); }

  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { t: { value: 0 }, sunDir: { value: SUN_DIR }, cam: { value: camera.position } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float t; uniform vec3 sunDir; uniform vec3 cam; varying vec3 vW; ${GLSL_SKY}
      float hgt(vec2 p){
        float a = 0.0;
        a += sin(p.x*0.9 + t*1.3 + sin(p.y*0.5 + t*0.4)) * 0.5;
        a += sin(p.y*1.3 - t*1.1 + p.x*0.3) * 0.35;
        a += sin((p.x+p.y)*2.1 + t*2.2) * 0.18;
        a += sin((p.x-p.y)*3.7 - t*2.9) * 0.10;
        a += sin((p.x*0.7-p.y*1.9)*5.0 + t*3.3) * 0.05;
        return a;
      }
      void main(){
        vec2 p = vW.xz;
        float e = 0.06;
        float h0 = hgt(p), hx = hgt(p + vec2(e,0.0)), hz = hgt(p + vec2(0.0,e));
        vec3 n = normalize(vec3(-(hx-h0)/e*0.07, 1.0, -(hz-h0)/e*0.07));
        vec3 v = normalize(cam - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 r = reflect(-v, n); r.y = abs(r.y);
        vec3 deep = vec3(0.04, 0.20, 0.26);
        vec3 col = mix(deep, skyCol(r), clamp(0.22 + fres*0.95, 0.0, 1.0));
        float s = max(dot(r, normalize(sunDir)), 0.0);
        col += vec3(1.0,0.82,0.5) * pow(s, 160.0) * 2.4 + vec3(1.0,0.5,0.2) * pow(s, 10.0) * 0.4;
        float dist = length(cam - vW);
        vec3 hz3 = skyCol(normalize(vec3(vW.x-cam.x, 0.015, vW.z-cam.z)));
        col = mix(col, hz3, smoothstep(45.0, 150.0, dist));
        float crest = smoothstep(0.55, 1.0, h0) * 0.12;
        col += vec3(1.0,0.8,0.7) * crest;
        float alpha = mix(0.70, 0.97, fres);
        alpha = mix(alpha, 1.0, smoothstep(60.0, 130.0, dist));
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(280, 190), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -85); water.renderOrder = 2; scene.add(water);
  upd.push((t) => { waterMat.uniforms.t.value = t; });
  lake.water = water;

  // golfjes-rimpelingen (ringen op het water)
  const rippleGeo = new THREE.RingGeometry(0.86, 1, 36);
  const ripples = [];
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false; scene.add(m); ripples.push({ m, t: 0, life: 1, size: 1, on: false });
  }
  let rn = 0;
  lake.ripple = (x, z, size = 1.5, life = 1.1, color = 0xffffff) => { const r = ripples[rn++ % ripples.length]; r.on = true; r.t = 0; r.life = life; r.size = size; r.m.position.set(x, 0.04, z); r.m.material.color.set(color); r.m.visible = true; };
  upd.push((t, dt) => { for (const r of ripples) { if (!r.on) continue; r.t += dt; const k = r.t / r.life; if (k >= 1) { r.on = false; r.m.visible = false; continue; } r.m.scale.setScalar(0.15 + k * r.size); r.m.material.opacity = (1 - k) * 0.7; } });

  // ------------------------------------------------------------ oever en grond
  const bankM = new THREE.MeshStandardMaterial({ map: tex.sand(10, 3), roughness: 1, color: 0xd8b890 });
  const bank = mesh(new THREE.BoxGeometry(150, 2.4, 40), bankM, { cast: false, pos: [0, -0.8, 27.4] }); scene.add(bank);
  const grass = mesh(new THREE.BoxGeometry(150, 0.5, 36), new THREE.MeshStandardMaterial({ map: tex.grass(30, 7), roughness: 1, color: 0xb0c880 }), { cast: false, pos: [0, 0.2, 29.5] }); scene.add(grass);
  const sandStrip = mesh(new THREE.BoxGeometry(150, 0.46, 3.2), bankM, { cast: false, pos: [0, 0.18, 9.1] }); scene.add(sandStrip);
  // oeverrand: stenen
  for (let i = 0; i < 40; i++) { const x = -30 + i * 1.6 + R(); if (Math.abs(x) < 2.6) continue; const rk = P.rock(0.35 + R() * 0.5, 0x9a9488); rk.position.set(x, 0.2, 7.4 + R() * 0.8); rk.rotation.y = R() * 6; scene.add(rk); rk.traverse((o) => { o.castShadow = false; }); }
  // bomen & struiken op de oever
  for (const [x, z, h] of [[-13, 12, 8], [-18, 9, 9.5], [15, 11, 8.5], [20, 8, 10], [-26, 14, 10], [27, 14, 9.5]]) { const t = P.pine(h, 0x2a5a48); t.position.set(x, 0.3, z); scene.add(t); }
  for (const [x, z, s] of [[-10, 10.5, 1.8], [9.5, 10, 1.6], [-21, 11, 2.2], [23, 11, 2]]) { const b = P.bush(s, 0x3b7a4a); b.position.set(x, 0.3, z); scene.add(b); }
  for (let i = 0; i < 5; i++) { const f = P.flowerPatch([0xff6fa5, 0xffe14a, 0xffffff, 0xb08aff, 0xff9a5a][i], 7, 1.4); f.position.set(-16 + i * 8 + R() * 3, 0.45, 10.5 + R() * 3); scene.add(f); }

  // ------------------------------------------------------------ steiger
  const jetty = new THREE.Group(); scene.add(jetty);
  const deckM = new THREE.MeshStandardMaterial({ map: tex.planks(1, 5, '#a2754a'), roughness: 0.9 });
  const jz0 = 8.2, jz1 = TIP.z - 0.4; const jlen = jz0 - jz1; const jcz = (jz0 + jz1) / 2;
  jetty.add(mesh(new THREE.BoxGeometry(2.6, 0.2, jlen), deckM, { pos: [0, TIP.y - 0.1, jcz] }));
  const beamM = mat(0x4a3220);
  for (const sx of [-1, 1]) jetty.add(mesh(new THREE.BoxGeometry(0.2, 0.28, jlen), beamM, { pos: [sx * 1.3, TIP.y - 0.14, jcz] }));
  for (let z = jz0 - 0.6; z > jz1; z -= 1.15) jetty.add(mesh(new THREE.BoxGeometry(2.9, 0.1, 0.12), mat(0x5b3d24), { cast: false, pos: [0, TIP.y + 0.015, z] }));
  const postZ = [7.2, 4.4, 1.6, TIP.z + 0.1];
  for (const z of postZ) for (const sx of [-1, 1]) {
    jetty.add(mesh(new THREE.CylinderGeometry(0.15, 0.19, 3.6, 7), mat(0x5b3d24), { pos: [sx * 1.3, TIP.y - 0.1, z] }));
    jetty.add(mesh(new THREE.SphereGeometry(0.17, 7, 5), mat(0x5b3d24), { cast: false, pos: [sx * 1.3, TIP.y + 1.7, z] }));
  }
  for (const sx of [-1, 1]) for (let i = 0; i < postZ.length - 1; i++) {
    const z0 = postZ[i], z1 = postZ[i + 1];
    jetty.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, Math.abs(z0 - z1), 4), mat(0xd8c090), { cast: false, pos: [sx * 1.3, TIP.y + 1.25, (z0 + z1) / 2], rot: [Math.PI / 2, 0, 0] }));
  }
  // lantaarn aan het eind
  const lantern = new THREE.Group(); lantern.position.set(1.3, TIP.y + 2.2, TIP.z + 0.1); jetty.add(lantern);
  lantern.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), beamM, { cast: false, pos: [0, 0.4, 0] }));
  lantern.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd27a }), { cast: false }));
  lantern.add(mesh(new THREE.ConeGeometry(0.3, 0.25, 4), mat(0x2e2e3a), { cast: false, pos: [0, 0.33, 0], rot: [0, Math.PI / 4, 0] }));
  const lampLight = new THREE.PointLight(0xffb060, 1.6, 16, 1.5); lampLight.position.set(1.3, TIP.y + 2.1, TIP.z + 0.6); jetty.add(lampLight);
  const lampHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffa850, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 })); lampHalo.scale.setScalar(3); lampHalo.position.copy(lantern.position); jetty.add(lampHalo);
  upd.push((t) => { const k = 1 + Math.sin(t * 9) * 0.05 + Math.sin(t * 5.3) * 0.04; lampLight.intensity = 1.6 * k; lampHalo.scale.setScalar(3 * k); lantern.rotation.z = Math.sin(t * 1.1) * 0.05; });
  // rommel op de steiger
  const barrel = P.barrel(1.1); barrel.position.set(-0.85, TIP.y, 6.4); jetty.add(barrel);
  const crate = P.crate(0.8); crate.position.set(0.8, TIP.y, 5.6); crate.rotation.y = 0.3; jetty.add(crate);
  const bucket = P.bucket(); bucket.scale.setScalar(1.6); bucket.position.set(-0.7, TIP.y, 3.2); jetty.add(bucket);
  const signB = mesh(new THREE.BoxGeometry(2.4, 0.7, 0.1), new THREE.MeshStandardMaterial({ map: tex.sign('Floris\' Steiger', { w: 256, h: 72, size: 28, bg: '#5b3a1e' }) }), { pos: [-1.3, TIP.y + 2.35, 7.2] }); jetty.add(signB);
  jetty.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), beamM, { cast: false, pos: [-1.3, TIP.y + 1.95, 7.2] }));

  // ------------------------------------------------------------ roeiboot (voor de netten-man)
  const boat = new THREE.Group(); scene.add(boat);
  const hullM = new THREE.MeshStandardMaterial({ map: tex.planks(2, 1, '#9a6a3e'), roughness: 0.9, side: THREE.DoubleSide, flatShading: false });
  const hull = mesh(new THREE.SphereGeometry(1, 20, 10, 0, TAU, Math.PI * 0.5, Math.PI * 0.5), hullM, { scale: [1.25, 0.8, 2.3], pos: [0, 0.4, 0] }); boat.add(hull);
  boat.add(mesh(new THREE.TorusGeometry(1, 0.06, 6, 28), mat(0x5b3d24), { cast: false, pos: [0, 0.4, 0], rot: [Math.PI / 2, 0, 0], scale: [1.25, 2.3, 1] }));
  boat.add(mesh(new THREE.CircleGeometry(1, 20), mat(0x3a2818, { side: THREE.DoubleSide }), { cast: false, receive: false, pos: [0, 0.14, 0], rot: [-Math.PI / 2, 0, 0], scale: [1.15, 2.1, 1] }));
  boat.add(mesh(new THREE.BoxGeometry(2.3, 0.1, 0.5), mat(0x7a5530), { cast: false, pos: [0, 0.5, 0.8] }));
  boat.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 5), mat(0xd8372c), { cast: false, pos: [0, 0.5, -2.4], rot: [-Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) { const oar = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), mat(0x8a6238), { cast: false, pos: [sx * 1.3, 0.75, 0.4], rot: [0, 0, sx * 1.1] }); boat.add(oar); boat.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.3), mat(0x8a6238), { cast: false, pos: [sx * 2.2, 0.15, 0.4], rot: [0, 0, sx * 0.2] })); }
  const boatLantern = mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }), { cast: false, pos: [0, 1.0, 2.3] }); boat.add(boatLantern);
  boat.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), beamM, { cast: false, pos: [0, 0.7, 2.3] }));
  const boatHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffa850, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 })); boatHalo.scale.setScalar(1.8); boatHalo.position.set(0, 1.0, 2.3); boat.add(boatHalo);
  // vangstemmer in de boot
  const catchBucket = P.bucket(); catchBucket.scale.setScalar(1.3); catchBucket.position.set(0.6, 0.15, 1.5); boat.add(catchBucket);
  boat.position.set(0, 0, LANE_Z + 2.6); lake.boat = boat; lake.boatZ = LANE_Z + 2.6; lake.catchBucketPos = new THREE.Vector3(0.6, 0.6, 1.5);

  // ------------------------------------------------------------ riet
  const stalkGeo = new THREE.CylinderGeometry(0.025, 0.045, 1, 4); stalkGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.CapsuleGeometry(0.075, 0.38, 3, 6);
  const reedPos = [];
  const cluster = (cx, cz, n, spread, hMin, hMax) => { for (let i = 0; i < n; i++) reedPos.push({ x: cx + (R() - 0.5) * spread, z: cz + (R() - 0.5) * spread, h: hMin + R() * (hMax - hMin), ph: R() * 6, head: R() < 0.7 }); };
  for (const x of [-22, -17, -12, -8, 8, 12, 17, 22, 27]) cluster(x, 6.9, 12, 3.4, 2.2, 4.0);
  cluster(-15, -9, 8, 2.4, 1.6, 2.8); cluster(16, -12, 8, 2.4, 1.6, 2.8); cluster(-24, -2, 8, 3, 2, 3.4); cluster(25, -3, 8, 3, 2, 3.4); cluster(-11, -19, 7, 2.2, 1.6, 2.6);
  const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ color: 0x6f9a3a, roughness: 0.9 }), reedPos.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x6a3f22, roughness: 0.9 }), reedPos.length);
  stalks.frustumCulled = false; heads.frustumCulled = false; scene.add(stalks, heads);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  upd.push((t) => {
    reedPos.forEach((r, i) => {
      const sw = Math.sin(t * 1.2 + r.ph) * 0.1 + Math.sin(t * 0.5 + r.x) * 0.05;
      _e.set(sw, 0, sw * 0.6); _q.setFromEuler(_e); _p.set(r.x, 0.1, r.z); _s.set(1, r.h, 1); _m.compose(_p, _q, _s); stalks.setMatrixAt(i, _m);
      _p.set(r.x + Math.sin(sw) * r.h, 0.1 + Math.cos(sw) * r.h * 0.98, r.z + Math.sin(sw * 0.6) * r.h); _s.set(r.head ? 1 : 0.0001, 1, r.head ? 1 : 0.0001); _m.compose(_p, _q, _s); heads.setMatrixAt(i, _m);
    });
    stalks.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  });

  // ------------------------------------------------------------ lelies
  const padGeo = new THREE.CircleGeometry(0.75, 14, 0.4, TAU - 0.5);
  const pads = [];
  const padM = [0x3f9a4a, 0x4aa850, 0x35884a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
  let placed = 0, guard = 0;
  while (placed < 20 && guard++ < 200) {
    const x = -22 + R() * 44, z = -4 - R() * 22;
    if (Math.abs(x) < 8.5 && z > -11.5) continue;
    if (Math.abs(x) < 3.5) continue;
    const g = new THREE.Group(); g.position.set(x, 0.05, z); const s = 0.7 + R() * 0.9;
    const pad = new THREE.Mesh(padGeo, padM[placed % 3]); pad.rotation.x = -Math.PI / 2; pad.rotation.z = R() * 6; pad.scale.setScalar(s); pad.receiveShadow = true; g.add(pad);
    if (R() < 0.45) { const fl = new THREE.Group(); fl.position.set(0.1 * s, 0.05, 0.1 * s); const col = R() < 0.5 ? 0xff8ac0 : 0xffffff; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; fl.add(mesh(new THREE.ConeGeometry(0.1 * s, 0.26 * s, 4), mat(col, { flatShading: false }), { cast: false, pos: [Math.cos(a) * 0.12 * s, 0.1 * s, Math.sin(a) * 0.12 * s], rot: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] })); } fl.add(mesh(new THREE.SphereGeometry(0.06 * s, 5, 4), mat(0xffe14a), { cast: false, pos: [0, 0.1 * s, 0] })); g.add(fl); }
    scene.add(g); pads.push({ g, ph: R() * 6, x, z }); placed++;
  }
  upd.push((t) => { for (const p of pads) { p.g.position.y = 0.05 + Math.sin(t * 1.1 + p.ph) * 0.025; p.g.rotation.y = Math.sin(t * 0.3 + p.ph) * 0.1; } });

  // ------------------------------------------------------------ libellen
  const dragons = [];
  const wingM = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group(); const col = [0x3ad8c8, 0xff5a8a, 0x5a8aff, 0x9aff5a, 0xffb040][i % 5];
    const body = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.4 });
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.62, 5), body, { cast: false, receive: false, rot: [0, 0, Math.PI / 2] }));
    g.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), body, { cast: false, receive: false, pos: [0.34, 0, 0] }));
    const wings = [];
    for (const sz of [-1, 1]) for (const dx of [0.1, -0.05]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), wingM); w.position.set(dx, 0.02, sz * 0.17); const pv = new THREE.Group(); pv.position.set(dx, 0.02, 0); pv.add(w); w.position.set(0, 0, sz * 0.17); w.rotation.x = Math.PI / 2; g.add(pv); wings.push({ pv, sz }); }
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 })); h.scale.setScalar(0.9); g.add(h);
    g.scale.setScalar(1.5); scene.add(g); dragons.push({ g, wings, ph: R() * 10, cx: -14 + i * 7, cz: -6 - R() * 12, cy: 1.8 + R() * 1.6, sp: 0.4 + R() * 0.4 });
  }
  const _d = new THREE.Vector3();
  upd.push((t, dt) => {
    for (const d of dragons) {
      const a = t * d.sp + d.ph; const x = d.cx + Math.sin(a) * 4 + Math.sin(a * 2.3) * 1.2, z = d.cz + Math.cos(a * 0.8) * 3, y = d.cy + Math.sin(a * 3.1) * 0.35;
      _d.set(x - d.g.position.x, 0, z - d.g.position.z); if (_d.lengthSq() > 1e-6) d.g.rotation.y = Math.atan2(-_d.z, _d.x);
      d.g.position.set(x, y, z);
      const f = Math.sin(t * 60 + d.ph) * 0.7; for (const w of d.wings) w.pv.rotation.x = w.sz * f;
    }
  });

  // ------------------------------------------------------------ vis-schaduwen
  lake.makeSilhouette = (kind, len, color, opacity) => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const body = new THREE.Mesh(kind === 'boot' ? G_BOOT : G_FISH, m); body.rotation.x = -Math.PI / 2; body.scale.set(len, len, len); body.renderOrder = 3; g.add(body);
    if (kind === 'giant') for (const sy of [-1, 1]) { const w = new THREE.Mesh(G_WHISK, m); w.rotation.x = -Math.PI / 2; w.position.set(len * 0.95, 0, sy * len * 0.1); w.rotation.z = sy * 0.5; w.scale.set(len * 0.8, len * 0.8, 1); w.renderOrder = 3; g.add(w); }
    g.userData.body = body; g.userData.mat = m;
    return g;
  };
  lake.makeFish3D = (color, len, kind) => {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25, flatShading: false, emissive: kind === 'gold' ? 0xffa800 : 0x000000, emissiveIntensity: kind === 'gold' ? 0.5 : 0 });
    g.add(mesh(new THREE.SphereGeometry(0.5, 12, 9), m, { cast: false, scale: [1.8, 0.8, 0.5] }));
    g.add(mesh(new THREE.ConeGeometry(0.4, 0.6, 4), m, { cast: false, pos: [-0.95, 0, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.3] }));
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.5, 4), m, { cast: false, pos: [-0.1, 0.45, 0], rot: [0, 0, 0.2], scale: [1, 1, 0.25] }));
    g.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [0.65, 0.1, 0.2] }));
    g.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [0.65, 0.1, -0.2] }));
    g.add(mesh(new THREE.SphereGeometry(0.4, 10, 6), mat(0xffffff, { flatShading: false }), { cast: false, pos: [0.05, -0.1, 0], scale: [1.4, 0.4, 0.5] }));
    if (kind === 'giant') for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.01, 0.02, 0.9, 4), m, { cast: false, pos: [0.95, -0.15, sz * 0.2], rot: [0, sz * 0.4, Math.PI / 2 + 0.3] }));
    g.scale.setScalar(len); return g;
  };
  lake.makeBoot3D = () => {
    const g = new THREE.Group(); const m = mat(0x6b4226, { flatShading: false });
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8), m, { cast: false, pos: [0, 0.45, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), m, { cast: false, pos: [0.3, 0.1, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8), mat(0x3a2a1e), { cast: false, pos: [0, 0.92, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), mat(0x3a8a3a), { cast: false, pos: [0.1, 0.95, 0.1] }));
    g.scale.setScalar(1.5); return g;
  };

  // ------------------------------------------------------------ licht-effect: vuurvliegjes
  let ffT = 0;
  upd.push((t, dt) => {
    ffT -= dt; if (ffT > 0) return; ffT = 0.22;
    fx.particles.emit(rand(-22, 22), rand(0.6, 4.5), rand(-18, 8), rand(-0.3, 0.3), rand(-0.1, 0.25), rand(-0.3, 0.3), { life: rand(3, 5), size: rand(0.16, 0.3), color: R() < 0.7 ? 0xffe9a0 : 0x9affea, gravity: 0 });
  });

  lake.update = (t, dt) => { for (const f of upd) f(t, dt); };
  return lake;
}

let _rt = null;
function radialTex() {
  if (_rt) return _rt;
  _rt = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  _rt.userData.keep = true; return _rt;
}
export { radialTex };

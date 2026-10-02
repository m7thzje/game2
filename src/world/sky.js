import * as THREE from 'three';
import { clamp, lerp, smoothstep, mesh, mat, glow, TAU, rand, canvasTex } from '../engine/util.js';
import * as P from '../engine/props.js';
import { Dragon } from '../engine/chars.js';
import { CASTLE, ICE, WORLD } from './layout.js';

const skyVS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const skyFS = `
varying vec3 vDir;
uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; uniform float time; uniform vec3 moonDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(bottom, mid, smoothstep(-0.05, 0.25, h));
  col = mix(col, top, smoothstep(0.2, 0.9, h));
  // zon
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 700.0) * 4.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
  // maan
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85,0.9,1.0) * smoothstep(0.9985, 0.9992, md) * night * 1.5 + vec3(0.4,0.5,0.8) * pow(md, 90.0) * night * 0.35;
  // sterren
  vec3 sp = floor(d * 260.0);
  float st = hash(sp);
  float star = step(0.9965, st) * (0.6 + 0.4 * sin(time * 2.0 + st * 80.0));
  col += vec3(star) * night * smoothstep(0.0, 0.2, h);
  gl_FragColor = vec4(col, 1.0);
}`;

const K = {
  // sunHeight -> kleuren
  day:   { top: new THREE.Color('#2f7fe0'), mid: new THREE.Color('#79b6f0'), bottom: new THREE.Color('#d6eeff'), sun: new THREE.Color('#fff2d0'), hemiTop: new THREE.Color('#bfe0ff'), hemiBot: new THREE.Color('#6a8a4a') },
  dusk:  { top: new THREE.Color('#3b2f7a'), mid: new THREE.Color('#d9669a'), bottom: new THREE.Color('#ffa05a'), sun: new THREE.Color('#ff9a50'), hemiTop: new THREE.Color('#c0a0d8'), hemiBot: new THREE.Color('#7a4a3a') },
  night: { top: new THREE.Color('#03051a'), mid: new THREE.Color('#0b1236'), bottom: new THREE.Color('#1b2a58'), sun: new THREE.Color('#8fa8ff'), hemiTop: new THREE.Color('#3a4a8a'), hemiBot: new THREE.Color('#12121e') },
};

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 }, time: { value: 0 }, moonDir: { value: new THREE.Vector3(0, -1, 0) } } });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), this.mat); this.dome.frustumCulled = false; this.dome.renderOrder = -10; scene.add(this.dome);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera; c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 1; c.far = 220; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun); scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xcfeaff, 70, 260);
    this.tod = 0.12; this.night = 0; this.sunHeight = 1; this.clouds = []; this.cloudMats = [];
    for (let i = 0; i < 16; i++) {
      const cl = P.cloud(2 + Math.random() * 3); cl.position.set(rand(-220, 220), rand(65, 100), rand(-220, 220)); cl.userData.sp = rand(0.8, 2.4);
      cl.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.cloudMats.push(o.material); } });
      scene.add(cl); this.clouds.push(cl);
    }
    this.islands = [];
    const spots = [[-120, 62, -90], [135, 75, -70], [70, 55, 135], [-90, 80, 110], [0, 95, -150]];
    for (const [x, y, z] of spots) { const isl = this.makeIsland(); isl.position.set(x, y, z); isl.userData.base = y; isl.userData.ph = Math.random() * 6; scene.add(isl); this.islands.push(isl); }
    this.dragons = [];
    const d1 = new Dragon(0x7a2fd4, 1.5); scene.add(d1.group); this.dragons.push({ d: d1, cx: CASTLE.x, cz: CASTLE.z, r: 48, y: 46, sp: 0.22, ph: 0 });
    const d2 = new Dragon(0xd83a2a, 1.0); scene.add(d2.group); this.dragons.push({ d: d2, cx: 0, cz: 0, r: 95, y: 62, sp: -0.14, ph: 2 });
    const d3 = new Dragon(0x2fb06a, 0.8); scene.add(d3.group); this.dragons.push({ d: d3, cx: 30, cz: 30, r: 75, y: 52, sp: 0.18, ph: 4 });
    // vogels, luchtballon en regenboog
    this.birds = [];
    for (let f = 0; f < 4; f++) {
      const cx = rand(-80, 80), cz = rand(-80, 80), cy = rand(22, 38);
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Group(); b.add(mesh(new THREE.SphereGeometry(0.22, 6, 5), mat(0x2a2a34), { cast: false, scale: [0.7, 0.7, 1.6] }));
        const wl = mesh(new THREE.PlaneGeometry(0.9, 0.35), new THREE.MeshBasicMaterial({ color: 0x2a2a34, side: THREE.DoubleSide }), { cast: false, pos: [0.45, 0, 0] }); const wp = new THREE.Group(); wp.add(wl); b.add(wp);
        const wl2 = wl.clone(); wl2.position.x = -0.45; const wp2 = new THREE.Group(); wp2.add(wl2); b.add(wp2); b.userData = { wp, wp2, cx, cz, cy, r: rand(25, 45), sp: rand(0.15, 0.25) * (f % 2 ? 1 : -1), off: i * 0.18, ph: rand(0, 6) };
        scene.add(b); this.birds.push(b);
      }
    }
    this.balloon = new THREE.Group();
    this.balloon.add(mesh(new THREE.SphereGeometry(5, 14, 10), new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (g, w, hh) => { const c = ['#e8453c', '#ffd23f', '#3a78e0', '#fff3d6']; for (let i = 0; i < 8; i++) { g.fillStyle = c[i % 4]; g.fillRect(i * w / 8, 0, w / 8 + 1, hh); } }), roughness: 0.8 }), { cast: false, scale: [1, 1.15, 1], pos: [0, 8, 0] }));
    this.balloon.add(mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), mat(0x8a5a2b), { cast: false, pos: [0, 0, 0] }));
    for (const [sx, sz] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) this.balloon.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 6.2, 3), mat(0x5b3d24), { cast: false, pos: [sx * 2.2, 3.5, sz * 2.2], rot: [sz * 0.35, 0, -sx * 0.35] }));
    scene.add(this.balloon);
    this.rainbow = new THREE.Group(); ['#ff3b3b', '#ff9b3b', '#ffe83b', '#4bd85a', '#3b9bff', '#6b4bff', '#b04bff'].forEach((c, i) => { const arc = new THREE.Mesh(new THREE.TorusGeometry(90 - i * 2.2, 1.1, 6, 40, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.0, fog: false, depthWrite: false })); this.rainbow.add(arc); });
    this.rainbow.position.set(-70, -6, -90); this.rainbow.rotation.y = 0.5; scene.add(this.rainbow);
    this.fireflies = this.makeFireflies();
    this.snow = this.makeSnow();
    this.lampMats = []; this.lampLights = [];
    this.sunCol = new THREE.Color(); this.tmp1 = new THREE.Color(); this.tmp2 = new THREE.Color();
  }
  makeIsland() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(11, 20, 8), mat(0x7a6a5a), { pos: [0, -9, 0], rot: [Math.PI, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(11.5, 11, 1.6, 10), mat(0x58b846), { pos: [0, 1, 0] }));
    const t = P.tree(5 + Math.random() * 3); t.position.set(-3, 1.8, 1); g.add(t); const t2 = P.pine(6); t2.position.set(4, 1.8, -2); g.add(t2);
    const c = P.crystal([0x9d6bff, 0x58e0ff, 0xff6bd8][Math.floor(Math.random() * 3)], 3); c.position.set(2, 1.8, 4); c.traverse((o) => { if (o.isPointLight) o.parent.remove(o); }); g.add(c);
    const wf = mesh(new THREE.PlaneGeometry(2.5, 18), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }), { cast: false, pos: [-9, -8, 5], rot: [0, 0.5, 0] }); g.add(wf);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return g;
  }
  makeFireflies() {
    const n = 140; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-40, 40); pos[i * 3 + 1] = rand(0.5, 5); pos[i * 3 + 2] = rand(-40, 40); ph[i] = Math.random() * 6; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, vis: { value: 0 }, scale: { value: 600 } },
      vertexShader: `uniform float time; uniform float scale; attribute float dummy; varying float vA; void main(){ vec3 p = position; vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = 0.6*scale / -mv.z; vA = 0.5+0.5*sin(time*2.0 + p.x*3.0 + p.z*2.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float vis; varying float vA; void main(){ float r = length(gl_PointCoord-0.5); if(r>0.5) discard; gl_FragColor = vec4(vec3(1.0,0.95,0.4), smoothstep(0.5,0.0,r)*vA*vis); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; this.scene.add(pts); pts.userData.base = pos.slice(); pts.userData.ph = ph; return pts;
  }
  makeSnow() {
    const n = 700; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-40, 40); pos[i * 3 + 1] = rand(0, 30); pos[i * 3 + 2] = rand(-40, 40); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { vis: { value: 0 }, scale: { value: 600 } },
      vertexShader: `uniform float scale; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = 0.28*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float vis; void main(){ float r = length(gl_PointCoord-0.5); if(r>0.5) discard; gl_FragColor = vec4(1.0,1.0,1.0,smoothstep(0.5,0.1,r)*vis); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.visible = false; this.scene.add(pts); return pts;
  }
  setViewportHeight(hh) { this.fireflies.material.uniforms.scale.value = hh * 0.9; this.snow.material.uniforms.scale.value = hh * 0.9; }

  // t: 0..1 (0 = zonsopgang, 0.25 = middag, 0.5 = zonsondergang, 0.75 = middernacht)
  setTime(t) { this.tod = ((t % 1) + 1) % 1; }
  phase() { const s = this.sunHeight; return s > 0.35 ? 'dag' : s > 0.0 ? (this.tod < 0.4 ? 'ochtend' : 'avond') : s > -0.25 && this.tod > 0.5 ? 'avond' : s > -0.25 ? 'ochtend' : 'nacht'; }
  isNight() { return this.night > 0.6; }

  update(dt, time, focus, camera) {
    const ang = this.tod * TAU; const s = Math.sin(ang); this.sunHeight = s;
    const dayF = smoothstep(-0.12, 0.28, s); const warm = (1 - smoothstep(0.0, 0.5, Math.abs(s))) * (s > -0.2 ? 1 : 0);
    this.night = 1 - smoothstep(-0.25, 0.05, s);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.9, s, -0.4).normalize();
    const moonDir = sunDir.clone().multiplyScalar(-1);
    const U = this.mat.uniforms;
    const mixC = (out, key) => { out.copy(K.night[key]).lerp(K.day[key], dayF); if (warm > 0) out.lerp(K.dusk[key], warm * 0.85); return out; };
    mixC(U.top.value, 'top'); mixC(U.mid.value, 'mid'); mixC(U.bottom.value, 'bottom');
    U.sunDir.value.copy(sunDir); U.moonDir.value.copy(moonDir); U.night.value = this.night; U.time.value = time;
    this.sunCol.copy(K.day.sun).lerp(K.dusk.sun, warm); U.sunCol.value.copy(this.sunCol).multiplyScalar(dayF);
    // belichting
    const useSun = s > -0.05; const dir = useSun ? sunDir : moonDir;
    this.sun.position.copy(focus).addScaledVector(dir, 90); this.sun.target.position.copy(focus);
    this.tmp1.copy(K.night.sun).lerp(this.sunCol, dayF);
    this.sun.color.copy(this.tmp1);
    const sunI = useSun ? Math.max(0.05, smoothstep(-0.05, 0.3, s)) * 2.8 : smoothstep(-0.05, -0.4, s) * 0.55 + 0.1;
    this.sun.intensity = sunI;
    mixC(this.hemi.color, 'hemiTop'); mixC(this.hemi.groundColor, 'hemiBot');
    this.hemi.intensity = lerp(0.9, 1.15, dayF);
    this.scene.fog.color.copy(U.bottom.value).lerp(U.mid.value, 0.15); this.scene.fog.near = lerp(40, 80, dayF); this.scene.fog.far = lerp(170, 270, dayF);
    this.dome.position.copy(camera.position);
    // wolken
    for (const cl of this.clouds) { cl.position.x += cl.userData.sp * dt; if (cl.position.x > 240) cl.position.x = -240; }
    const cc = this.tmp2.copy(K.night.hemiTop).lerp(new THREE.Color(1, 1, 1), dayF); if (warm > 0) cc.lerp(new THREE.Color(1, 0.75, 0.65), warm * 0.6);
    for (const m of this.cloudMats) m.color.copy(cc);
    // eilanden
    for (const isl of this.islands) { isl.position.y = isl.userData.base + Math.sin(time * 0.4 + isl.userData.ph) * 1.5; isl.rotation.y += dt * 0.02; }
    // vogels
    for (const b of this.birds) { const u = b.userData; const a = time * u.sp + u.off; const x = u.cx + Math.cos(a) * u.r, z = u.cz + Math.sin(a) * u.r; b.position.set(x, u.cy + Math.sin(time * 0.7 + u.ph) * 1.2, z); b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI); const f = Math.sin(time * 9 + u.ph) * 0.7; u.wp.rotation.z = f; u.wp2.rotation.z = -f; b.visible = this.night < 0.8; }
    const ba = time * 0.02; this.balloon.position.set(Math.cos(ba) * 70 - 20, 30 + Math.sin(time * 0.3) * 1.5, Math.sin(ba) * 55 + 10); this.balloon.rotation.y = time * 0.05;
    const rb = Math.max(0, dayF - 0.55) * 0.5; this.rainbow.children.forEach((m) => (m.material.opacity = rb * 0.55));
    // draken
    for (const dr of this.dragons) {
      const a = time * dr.sp + dr.ph; const x = dr.cx + Math.cos(a) * dr.r, z = dr.cz + Math.sin(a) * dr.r; const y = dr.y + Math.sin(time * 0.6 + dr.ph) * 4;
      const nx = dr.cx + Math.cos(a + 0.05 * Math.sign(dr.sp)) * dr.r, nz = dr.cz + Math.sin(a + 0.05 * Math.sign(dr.sp)) * dr.r;
      dr.d.group.position.set(x, y, z); dr.d.group.lookAt(nx, y - 1, nz); dr.d.group.rotateZ(-0.35 * Math.sign(dr.sp)); dr.d.update(dt);
    }
    // vuurvliegjes
    const ff = this.fireflies; ff.material.uniforms.time.value = time; ff.material.uniforms.vis.value = this.night; ff.visible = this.night > 0.05;
    if (ff.visible) {
      const p = ff.geometry.attributes.position, b = ff.userData.base, ph = ff.userData.ph;
      const wrap = (v) => (((v + 40) % 80) + 80) % 80 - 40;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, focus.x + wrap(b[i * 3] - focus.x) + Math.sin(time * 0.3 + ph[i]) * 1.5, b[i * 3 + 1] + Math.sin(time * 0.8 + ph[i] * 2) * 0.6, focus.z + wrap(b[i * 3 + 2] - focus.z) + Math.cos(time * 0.27 + ph[i]) * 1.5);
      p.needsUpdate = true;
    }
    // sneeuw alleen bij de ijsvijver
    const dIce = Math.hypot(focus.x - ICE.x, focus.z - ICE.z);
    this.snow.visible = dIce < 60; if (this.snow.visible) {
      this.snow.material.uniforms.vis.value = 0.85 * (1 - smoothstep(35, 60, dIce));
      const p = this.snow.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * (2 + (i % 5) * 0.5); if (y < 0) y += 30; p.setXYZ(i, focus.x + (((p.getX(i) - focus.x + Math.sin(time + i) * dt * 2 + 40) % 80 + 80) % 80) - 40, y, focus.z + (((p.getZ(i) - focus.z + 40) % 80 + 80) % 80) - 40); }
      p.needsUpdate = true;
    }
    return { night: this.night, dayF, warm };
  }
}

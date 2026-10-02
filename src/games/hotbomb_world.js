import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, TAU, rand, pick, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';

// Het kermis-plein voor "Hete Aardappel": ronde arena, publiek, tenten, slingers, lampionnen en een meipaal.

export const ARENA_R = 8.6;        // speelveld
export const RIM_R = 9.75;         // waar toeschouwers (uitgeschakelde spelers) staan
export const OBSTACLES = [         // cirkels [x, z, r]
  [0, 0, 1.0],
  ...[45, 135, 225, 315].map((d) => [Math.cos(d * Math.PI / 180) * 6.0, Math.sin(d * Math.PI / 180) * 6.0, 0.95]),
];

function plazaTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const r = mulberry32(77); const c = w / 2;
    g.fillStyle = '#a8957a'; g.fillRect(0, 0, w, h);
    // kasseien
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h; const l = 120 + r() * 70;
      g.fillStyle = `rgb(${l + 18},${l + 4},${l - 18})`; g.beginPath(); g.ellipse(x, y, 11 + r() * 8, 9 + r() * 6, r() * 3, 0, 7); g.fill();
      g.strokeStyle = 'rgba(60,45,30,.35)'; g.lineWidth = 1.5; g.stroke();
    }
    // sierringen
    const ring = (r0, r1, col) => { g.beginPath(); g.arc(c, c, r1, 0, 7); g.arc(c, c, r0, 0, 7, true); g.fillStyle = col; g.fill(); };
    ring(448, 470, '#8c2331'); ring(470, 480, '#e8c24a'); ring(398, 406, '#e8c24a');
    // gekleurde blokken tussen de ringen
    for (let i = 0; i < 48; i++) {
      const a0 = i / 48 * TAU, a1 = (i + 0.9) / 48 * TAU; const col = ['#d8372c', '#2f6fe0', '#f2c230', '#2f9e5b', '#e8e0d0'][i % 5];
      g.beginPath(); g.arc(c, c, 438, a0, a1); g.arc(c, c, 410, a1, a0, true); g.closePath(); g.fillStyle = col; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
    }
    // ster in het midden
    g.save(); g.translate(c, c); g.fillStyle = 'rgba(232,194,74,.9)';
    for (let k = 0; k < 8; k++) { g.rotate(TAU / 8); g.beginPath(); g.moveTo(0, -330); g.lineTo(34, -80); g.lineTo(-34, -80); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(140,35,49,.9)'; g.beginPath(); g.arc(c, c, 120, 0, 7); g.fill(); g.strokeStyle = '#e8c24a'; g.lineWidth = 8; g.stroke();
    g.fillStyle = 'rgba(232,194,74,.55)'; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; g.beginPath(); g.arc(c + Math.cos(a) * 250, c + Math.sin(a) * 250, 12, 0, 7); g.fill(); }
  });
}
function stripeTexture(a, b, n = 8) {
  return canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * w / n, 0, w / n + 1, h); } });
}

export function buildArena(ctx) {
  const { scene } = ctx;
  const anim = [];
  const add = (o) => { scene.add(o); return o; };
  const rnd = mulberry32(2024);

  // ---------- grond ----------
  add(mesh(new THREE.PlaneGeometry(160, 130), new THREE.MeshStandardMaterial({ map: tex.grass(40, 32), roughness: 1 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, -0.02, 0] }));
  // plein
  add(mesh(new THREE.CylinderGeometry(10.5, 10.7, 0.35, 64), mat(0x7a6a58), { pos: [0, -0.17, 0] }));
  add(mesh(new THREE.CircleGeometry(10.3, 64), new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 1 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.012, 0] }));
  // witte aanduiding speelveld
  add(mesh(new THREE.RingGeometry(ARENA_R - 0.08, ARENA_R + 0.08, 64), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.55 }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.03, 0] }));

  // ---------- touw met paaltjes ----------
  {
    const N = 34; const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.05, 6), ballGeo = new THREE.SphereGeometry(0.17, 8, 6);
    const posts = new THREE.InstancedMesh(postGeo, mat(0x6b4a2e), N), balls = new THREE.InstancedMesh(ballGeo, mat(0xe8c24a, { metalness: 0.6, roughness: 0.35 }), N);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) { const a = i / N * TAU; d.position.set(Math.cos(a) * 9.15, 0.52, Math.sin(a) * 9.15); d.updateMatrix(); posts.setMatrixAt(i, d.matrix); d.position.y = 1.1; d.updateMatrix(); balls.setMatrixAt(i, d.matrix); }
    posts.castShadow = true; add(posts); add(balls);
    add(mesh(new THREE.TorusGeometry(9.15, 0.055, 6, 96), mat(0xc22a3a), { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.92, 0] }));
  }

  // podium voor uitgeschakelde spelers
  add(mesh(new THREE.CylinderGeometry(10.35, 10.35, 0.55, 64, 1, true), mat(0x6b4a2e, { side: THREE.DoubleSide }), { cast: false, pos: [0, 0.275, 0] }));
  add(mesh(new THREE.RingGeometry(9.3, 10.35, 64), new THREE.MeshStandardMaterial({ map: tex.planks(8, 1, '#b8844e'), roughness: 1 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.56, 0] }));
  // ---------- tribune + publiek ----------
  const crowdRoot = new THREE.Group(); add(crowdRoot);
  add(mesh(new THREE.CylinderGeometry(13.5, 13.7, 0.7, 64, 1, true), mat(0x6b4a2e, { side: THREE.DoubleSide }), { cast: false, pos: [0, 0.35, 0] }));
  add(mesh(new THREE.RingGeometry(10.4, 13.5, 64), new THREE.MeshStandardMaterial({ map: tex.planks(10, 2, '#9b6a40'), roughness: 1 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.38, 0] }));
  add(mesh(new THREE.CylinderGeometry(10.4, 10.4, 0.38, 64, 1, true), mat(0x6b4a2e, { side: THREE.DoubleSide }), { cast: false, pos: [0, 0.19, 0] }));
  const crowd = (() => {
    const N = 56;
    const cols = [0xd8372c, 0x2f6fe0, 0xf2c230, 0x2f9e5b, 0xb85aa8, 0xe8e0d0, 0xe0803a, 0x7a5aa8];
    const skins = [0xf4c9a0, 0xe0a67a, 0xf7d2ae, 0xc98a5e, 0xf0b890];
    const mk = (geo, n = N) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), n); m.castShadow = false; crowdRoot.add(m); return m; };
    const body = mk(new THREE.CylinderGeometry(0.27, 0.36, 0.95, 8)), head = mk(new THREE.SphereGeometry(0.25, 9, 7)), hat = mk(new THREE.SphereGeometry(0.29, 8, 5, 0, TAU, 0, Math.PI * 0.55));
    const armL = mk(new THREE.CapsuleGeometry(0.07, 0.4, 3, 6)), armR = mk(new THREE.CapsuleGeometry(0.07, 0.4, 3, 6));
    const people = [];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const row = i < 26 ? 0 : 1; const n = row ? N - 26 : 26; const k = row ? i - 26 : i;
      const a = (k + (row ? 0.5 : 0)) / n * TAU + rnd() * 0.04; const rad = row ? 12.7 : 11.3;
      const sc = 0.85 + rnd() * 0.45;
      people.push({ a, rad, y: row ? 0.75 : 0.42, sc, ph: rnd() * 10, sp: 5 + rnd() * 4, wave: rnd() < 0.5 });
      body.setColorAt(i, c.setHex(pick(cols))); head.setColorAt(i, c.setHex(pick(skins))); hat.setColorAt(i, c.setHex(pick(cols))); armL.setColorAt(i, c.setHex(pick(skins))); armR.setColorAt(i, c.setHex(pick(skins)));
    }
    const d = new THREE.Object3D();
    let energy = 1;
    function update(t, boost = 0) {
      for (let i = 0; i < N; i++) {
        const p = people[i]; const e = (1 + boost * 1.6);
        const bob = Math.abs(Math.sin(t * p.sp * (0.7 + 0.3 * e) + p.ph)) * 0.18 * e;
        const x = Math.cos(p.a) * p.rad, z = Math.sin(p.a) * p.rad, yaw = -p.a - Math.PI / 2 + Math.PI;
        const s = p.sc;
        d.rotation.set(0, yaw, 0); d.scale.setScalar(s);
        d.position.set(x, p.y + bob + 0.5 * s, z); d.updateMatrix(); body.setMatrixAt(i, d.matrix);
        d.position.set(x, p.y + bob + 1.22 * s, z); d.updateMatrix(); head.setMatrixAt(i, d.matrix);
        d.position.set(x, p.y + bob + 1.27 * s, z); d.updateMatrix(); hat.setMatrixAt(i, d.matrix);
        // armen: zwaaien omhoog
        const raise = (p.wave ? 2.6 : 1.5) + Math.sin(t * p.sp * 1.3 + p.ph) * 0.5 * e;
        for (const [m, sd] of [[armL, 1], [armR, -1]]) {
          const lx = sd * 0.38 * s, ox = Math.cos(yaw) * lx, oz = -Math.sin(yaw) * lx;
          d.position.set(x + ox, p.y + bob + 1.0 * s, z + oz); d.rotation.set(0, yaw, sd * (raise - Math.PI * 0.5 + (sd > 0 ? 0 : Math.sin(t * 7 + p.ph) * 0.3)));
          d.rotation.z = sd * (0.3 + Math.max(0, raise - 1.2) * 0.45); d.scale.setScalar(s);
          d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        }
      }
      for (const m of [body, head, hat, armL, armR]) m.instanceMatrix.needsUpdate = true;
    }
    for (const m of [body, head, hat, armL, armR]) { if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; }
    return { update };
  })();

  // ---------- paar herkenbare dorpelingen vooraan ----------
  // (worden in hotbomb.js gemaakt; hier alleen een lijst posities)
  const hosts = [];

  // ---------- tenten ----------
  const flagsToAnimate = [];
  const tentCols = [['#d8372c', '#f4ecd0'], ['#2f6fe0', '#f4ecd0'], ['#f2c230', '#8c2331'], ['#2f9e5b', '#f4ecd0'], ['#b85aa8', '#f4ecd0'], ['#e0803a', '#f4ecd0'], ['#2f6fe0', '#e8c24a'], ['#d8372c', '#e8c24a']];
  [170, 200, 230, 260, 290, 320, 350, 10].forEach((deg, k) => {
    const a = deg * Math.PI / 180, rad = 20.5 + (k % 2) * 1.3; const [c1, c2] = tentCols[k];
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); add(g);
    const stripes = new THREE.MeshStandardMaterial({ map: stripeTexture(c1, c2, 10), roughness: 0.9, flatShading: true });
    g.add(mesh(new THREE.CylinderGeometry(3.3, 3.3, 2.4, 16), stripes, { pos: [0, 1.2, 0] }));
    g.add(mesh(new THREE.ConeGeometry(4.0, 3.2, 16), new THREE.MeshStandardMaterial({ map: stripeTexture(c2, c1, 10), roughness: 0.9, flatShading: true }), { pos: [0, 4.0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), mat(0xe8c24a), { pos: [0, 6.5, 0] }));
    const fl = P.banner(0xe8c24a, 1.0, 0.8); fl.position.set(0, 5.9, 0); fl.scale.setScalar(0.8); g.add(fl); flagsToAnimate.push(fl);
    g.add(mesh(new THREE.BoxGeometry(1.6, 1.7, 0.15), glow(0xffc86a, 0.9), { cast: false, pos: [0, 1.0, 3.2] }));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.12, 0.2), mat(0x6b4a2e), { cast: false, pos: [0, 1.9, 3.22] }));
  });
  // ---------- bomen en struiken buiten de tenten ----------
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + rnd() * 0.2, r = 30 + rnd() * 10; const t = P.tree(5 + rnd() * 3); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); add(t); }

  // ---------- palen, slingers en lampionnen ----------
  const POLES = 12, POLE_R = 14.4, POLE_H = 7.2;
  const poleTops = [];
  for (let i = 0; i < POLES; i++) {
    const a = (i + 0.5) / POLES * TAU; const x = Math.cos(a) * POLE_R, z = Math.sin(a) * POLE_R;
    add(mesh(new THREE.CylinderGeometry(0.14, 0.2, POLE_H, 7), mat(0x6b4a2e), { pos: [x, POLE_H / 2, z] }));
    add(mesh(new THREE.SphereGeometry(0.25, 8, 6), mat(0xe8c24a, { metalness: 0.5 }), { pos: [x, POLE_H + 0.2, z] }));
    poleTops.push(new THREE.Vector3(x, POLE_H - 0.1, z));
  }
  {
    const pos = [], col = [];
    const cols = [0xd8372c, 0x2f6fe0, 0xf2c230, 0x2f9e5b, 0xb85aa8, 0xffffff, 0xe0803a];
    const tmp = new THREE.Color();
    const stringPts = [];
    for (let i = 0; i < POLES; i++) {
      const A = poleTops[i], B = poleTops[(i + 1) % POLES]; const M = 14;
      for (let k = 0; k < M; k++) {
        const u0 = k / M, u1 = (k + 1) / M, um = (k + 0.5) / M;
        const p0 = A.clone().lerp(B, u0), p1 = A.clone().lerp(B, u1), pm = A.clone().lerp(B, um);
        const sag = (u) => -Math.sin(u * Math.PI) * 1.3;
        p0.y += sag(u0); p1.y += sag(u1); pm.y += sag(um);
        stringPts.push(p0, p1);
        const f = 0.62, dropV = new THREE.Vector3(0, -0.85, 0);
        const q0 = pm.clone().lerp(p0, f * 0.45), q1 = pm.clone().lerp(p1, f * 0.45), tip = pm.clone().add(dropV);
        tmp.setHex(cols[(i * M + k) % cols.length]);
        for (const v of [q0, q1, tip]) { pos.push(v.x, v.y, v.z); col.push(tmp.r, tmp.g, tmp.b); }
      }
    }
    const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gf.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const flags = new THREE.Mesh(gf, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); flags.frustumCulled = false; add(flags);
    const gl = new THREE.BufferGeometry().setFromPoints(stringPts); add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: 0x3a2a1a })));
  }
  // lampionnen langs de slingers
  const lanterns = [];
  {
    const cols = [0xff6a3a, 0xffd23f, 0xff4a8a, 0x7aff9a, 0x6ab8ff];
    for (let i = 0; i < POLES; i++) {
      const A = poleTops[i], B = poleTops[(i + 1) % POLES];
      for (const u of [0.25, 0.75]) {
        const p = A.clone().lerp(B, u); p.y += -Math.sin(u * Math.PI) * 1.3 - 0.35;
        const g = new THREE.Group(); g.position.copy(p); add(g);
        const c = cols[(i * 2 + (u > 0.5 ? 1 : 0)) % cols.length];
        g.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.5 }), { cast: false, scale: [1, 1.15, 1] }));
        g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 6), mat(0x3a2a1a), { cast: false, pos: [0, 0.4, 0] }));
        lanterns.push({ g, ph: Math.random() * 6, base: p.clone() });
      }
    }
  }
  anim.push((t) => { for (const l of lanterns) { l.g.rotation.z = Math.sin(t * 1.3 + l.ph) * 0.12; l.g.position.y = l.base.y + Math.sin(t * 2 + l.ph) * 0.05; } });

  // ---------- meipaal in het midden ----------
  const pole = new THREE.Group(); add(pole);
  {
    const stripeTex = canvasTex(32, 256, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f4ecd0' : '#d8372c'; g.fillRect(0, i * 16, w, 16); } });
    stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.repeat.set(1, 2);
    pole.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 5.8, 10), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 }), { pos: [0, 2.9, 0] }));
    pole.add(mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.45, 14), mat(0x7a6a58), { pos: [0, 0.22, 0] }));
    pole.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 14), mat(0x4a8a3a), { pos: [0, 0.5, 0] }));
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; pole.add(mesh(new THREE.SphereGeometry(0.11, 6, 5), mat([0xff6fa5, 0xffe14a, 0xffffff][i % 3]), { cast: false, pos: [Math.cos(a) * 0.6, 0.62, Math.sin(a) * 0.6] })); }
    pole.add(mesh(new THREE.TorusGeometry(0.75, 0.09, 6, 16), mat(0x4a8a3a), { pos: [0, 5.5, 0], rot: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; pole.add(mesh(new THREE.SphereGeometry(0.13, 6, 5), mat([0xff6fa5, 0xffe14a, 0xffffff, 0x8fb8ff][i % 4]), { cast: false, pos: [Math.cos(a) * 0.75, 5.5, Math.sin(a) * 0.75] })); }
    pole.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 5), glow(0xffd23f, 1.2), { cast: false, pos: [0, 6.1, 0] }));
  }
  const ribbons = new THREE.Group(); ribbons.position.y = 0; add(ribbons);
  {
    const cols = [0xd8372c, 0x2f6fe0, 0xf2c230, 0x2f9e5b, 0xb85aa8, 0xe0803a, 0xffffff, 0x58d8ff];
    cols.forEach((c, i) => {
      const a = i / cols.length * TAU; const len = Math.hypot(5.4, 1.9);
      const m = mesh(new THREE.PlaneGeometry(0.16, len, 1, 1), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }), { cast: false, receive: false });
      const grp = new THREE.Group(); grp.rotation.y = a; ribbons.add(grp);
      m.position.set(1.0, 2.75, 0); m.rotation.z = -Math.atan2(1.9, 5.4); grp.add(m);
    });
  }
  anim.push((t) => { ribbons.rotation.y = t * 0.35; });

  // ---------- hooibalen / vaten bij de hoeken ----------
  const nooks = [];
  for (const [x, z, r] of OBSTACLES.slice(1)) {
    const g = new THREE.Group(); g.position.set(x, 0, z); add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 1, flatShading: true, map: tex.thatch(1, 1) }), { pos: [0, 0.45, 0], rot: [0, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 1, flatShading: true, map: tex.thatch(1, 1) }), { pos: [0.1, 1.3, 0.05] }));
    const b = P.barrel(0.8); b.position.set(-0.7, 0, 0.5); g.add(b);
    const c = P.crate(0.7); c.position.set(0.6, 0, -0.65); c.rotation.y = 0.4; g.add(c);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.5, 5), mat([0xe0803a, 0xb85aa8, 0x2f9e5b, 0xd8372c][nooks.length % 4]), { pos: [0.1, 1.95, 0.05] }));
    nooks.push(g);
  }

  // ---------- decor: kraampjes voor de tenten, spandoek, vlaggen ----------
  const sign = mesh(new THREE.BoxGeometry(7.2, 1.2, 0.2), new THREE.MeshStandardMaterial({ map: tex.sign('HETE AARDAPPEL!\n🥔💣', { w: 512, h: 160, size: 48, bg: '#8c2331', fg: '#ffe14a' }) }), { pos: [0, 5.0, -14.1] }); add(sign);
  for (const sx of [-3.7, 3.7]) add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), mat(0x3a2a1a), { cast: false, pos: [sx * 0.9, 6.2, -14.1] }));
  anim.push((t) => { for (const f of flagsToAnimate) P.animateBanner(f, t); });

  // ---------- twee lichtjes ----------
  const l1 = new THREE.PointLight(0xffa860, 40, 34, 1.6); l1.position.set(-8, 7, 4); add(l1);
  const l2 = new THREE.PointLight(0xff7aa0, 30, 34, 1.6); l2.position.set(8, 7, -4); add(l2);
  anim.push((t) => { l1.intensity = 40 + Math.sin(t * 3) * 3; l2.intensity = 30 + Math.sin(t * 2.3 + 1) * 3; });

  return {
    update(t, dt, crowdBoost = 0) { for (const f of anim) f(t, dt); crowd.update(t, crowdBoost); },
    lights: [l1, l2],
  };
}

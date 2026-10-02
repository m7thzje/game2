import * as THREE from 'three';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { scare } from '../engine/scare.js';
import { S, persist } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, makeNPC, drawScareFace, PLAYER_CSS, PLAYER_COLORS } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { h, mesh, mat, glow, canvasTex, clamp, damp, dampAngle, rand, pick, shuffle, TAU, lerp, smoothstep } from '../engine/util.js';
import { ARCADE_IDS } from '../games/index.js';
import { floatLabel } from './build.js';
import { TWISTS } from '../engine/twist.js';

const HALL = { w: 72, d: 52 };       // x: -36..36, z: -26..26
const PIC = { dodgeball: '🔥', cakefight: '🎂', tugwar: '🪢', airhockey: '🏒', quickdraw: '🤠', memory: '🃏', paint: '🎨', duckshoot: '🦆', karts: '🏎️', climb: '🧗', tanks: '💥', chairs: '🪑', ticktock: '🕰️', minecart: '🚃', buttons: '🧱', vines: '🌿', screws: '🔩', chop: '🪓' };
const NAME = { dodgeball: 'Vuurbal-Duel', cakefight: 'Taartengevecht', tugwar: 'Touwtrekken', airhockey: 'IJshockey-Chaos', quickdraw: 'Snelle Vingers', memory: 'Geheugen-Duel', paint: 'Verfgevecht', duckshoot: 'Schiettent', karts: 'Kartrace', climb: 'Torenklim', tanks: 'Kanonnenduel', chairs: 'Stoelendans', ticktock: 'Klokkentoren-Sprong', minecart: 'Mijnkar-Race', buttons: 'Knoppen-Breker', vines: 'Lianen-Zwaaien', screws: 'Schroef-Duel', chop: 'Houthakkers-Duel' };
const KING_WINS = [
  '{w} wint! {l}, niet huilen. De koning huilt ook weleens. Meestal om uien.',
  'Een glansrijke overwinning voor {w}! {l} had pech. Of geen talent. Dat weten we nog niet.',
  '{w} pakt de kroon! Of in elk geval de zitzak die ik daarvoor heb neergelegd.',
  'Wat een gevecht! {w} wint met stijl, {l} verliest met... ook stijl, maar anders.',
  '{w} wint! Schrijf het op, {l}, dan kun je het later nog eens teruglezen.',
];
const KING_DRAW = ['Gelijkspel! Dat is net zo saai als een stoel zonder poten.', 'Niemand wint! Dan moet je het gewoon nog eens doen. Met kracht.'];

let TOURNEY = null;   // { queue:[ids], idx, score:[0,0], log:[] }

export class ArcadeMode {
  static async create(app, opts = {}) { return new ArcadeMode(app, opts); }
  constructor(app, opts) {
    this.app = app; this.opts = opts; this.t = 0; this.busy = false; this.menu = null; this.modal = null; this.hudT = 0; this.spin = null; this.promptKey = '';
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 300);
    this.fx = new Particles(1500); this.scene.add(this.fx.points); this.fx.setViewportHeight(innerHeight);
    const L = setupLights(this.scene, 'indoor', { shadow: 36, center: [0, 0, 0], fog: true, fogNear: 50, fogFar: 140, shadows: S.settings.quality !== 'low' });
    this.sun = L.sun; L.sun.intensity = 1.0; L.sun.position.set(10, 30, 15); L.hemi.intensity = 1.35;
    this.scene.background = new THREE.Color(0x120a1e); this.scene.fog.color.set(0x120a1e);
    this.colliders = []; this.interact = []; this.cabs = []; this.glows = [];
    this.games = this.loadedIds();
    this.buildHall(); this.buildCabinets(); this.buildCenter(); this.buildBack();
    this.players = [0, 1].map((i) => {
      const c = makeBrother(i); this.scene.add(c.group);
      const ring = mesh(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.7, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); this.scene.add(ring);
      const label = floatLabel(S.names[i], '', i ? '#7fb2ff' : '#6bf09a'); label.scale.set(2.6, 0.8, 1); label.position.y = c.height + 0.95; label.material.depthTest = false; c.group.add(label);
      return { i, c, ring, x: (i ? 1 : -1) * 2, z: 22, y: 0, vx: 0, vz: 0, vy: 0, grounded: true, yaw: Math.PI, stepT: 0 };
    });
    this.mid = new THREE.Vector3(0, 0, 18); this.camPos = new THREE.Vector3(0, 16, 36); this.camLook = new THREE.Vector3(0, 0, 18);
    this.nextGlitch = rand(40, 80);
  }
  loadedIds() { return ARCADE_IDS.filter((id) => this.app.games[id]); }
  defOf(id) { return this.app.games[id] || { name: NAME[id], icon: PIC[id] }; }

  // ------------------------------------------------------------------ gebouw
  buildHall() {
    const sc = this.scene; const sm = new THREE.MeshStandardMaterial({ map: tex.stone(10, 3), roughness: 0.95, flatShading: true });
    sc.add(mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshStandardMaterial({ map: tex.checker(HALL.w / 5, HALL.d / 5, '#cbbfdc', '#6a4a8a'), roughness: 0.35, metalness: 0.15 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    // loper naar de troon
    sc.add(mesh(new THREE.PlaneGeometry(7, HALL.d - 4), new THREE.MeshStandardMaterial({ map: tex.carpet(1, 8), roughness: 1 }), { cast: false, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] }));
    const wallH = 15;
    const wall = (w, hh, x, y, z, ry = 0) => sc.add(mesh(new THREE.BoxGeometry(w, hh, 1.4), sm, { pos: [x, y, z], rot: [0, ry, 0] }));
    wall(HALL.w + 2, wallH, 0, wallH / 2, -HALL.d / 2 - 0.7); wall(HALL.d + 2, wallH, -HALL.w / 2 - 0.7, wallH / 2, 0, Math.PI / 2); wall(HALL.d + 2, wallH, HALL.w / 2 + 0.7, wallH / 2, 0, Math.PI / 2);
    // voorkant is open (poppenhuis-doorsnede) zodat de camera altijd naar binnen kijkt; de uitgang is een gloeiend portaal op de vloer
    this.exitDoor = mesh(new THREE.CircleGeometry(3.2, 28), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.08, HALL.d / 2 - 2.5], rot: [-Math.PI / 2, 0, 0] }); sc.add(this.exitDoor);
    sc.add(mesh(new THREE.TorusGeometry(3.2, 0.18, 6, 28), glow(0xffe14a, 1.2), { cast: false, pos: [0, 0.2, HALL.d / 2 - 2.5], rot: [Math.PI / 2, 0, 0] }));
    const exl = floatLabel('🚪 Uitgang', 'terug naar het dorp', '#ffe14a'); exl.position.set(0, 4.0, HALL.d / 2 - 2.5); sc.add(exl);
    this.interact.push({ type: 'exit', x: 0, z: HALL.d / 2 - 2.5, r: 4.2, label: 'Terug naar het dorp' });
    // gekleurde ramen
    const cols = [0xff5ad8, 0x5ad8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c];
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
      const wnd = mesh(new THREE.PlaneGeometry(2.6, 6), new THREE.MeshBasicMaterial({ color: cols[(i + (sx > 0 ? 3 : 0)) % 6], transparent: true, opacity: 0.85, fog: false }), { cast: false, pos: [sx * (HALL.w / 2 - 0.1), 10, -21 + i * 8.4], rot: [0, -sx * Math.PI / 2, 0] }); sc.add(wnd);
      sc.add(mesh(new THREE.TorusGeometry(1.3, 0.2, 5, 12, Math.PI), sm, { cast: false, pos: [sx * (HALL.w / 2 - 0.2), 13, -21 + i * 8.4], rot: [0, -sx * Math.PI / 2, 0] }));
    }
    // banieren en fakkels (vlam = alleen een mesh, geen licht)
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
      const b = P.banner([0x7a2fd4, 0xd8372c, 0x2f6fe0][i % 3], 6.5, 1.8); b.position.set(sx * (HALL.w / 2 - 1.2), 5.5, -17 + i * 6.8 - 1.8); b.rotation.y = -sx * Math.PI / 2; sc.add(b); (this.banners ||= []).push(b);
    }
    for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) {
      const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 5), mat(0x5b3d24), { pos: [0, 0, 0] }));
      const f = mesh(new THREE.ConeGeometry(0.17, 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffa030 }), { cast: false, pos: [0, 0.75, 0] }); g.add(f); this.glows.push(f);
      g.position.set(sx * (HALL.w / 2 - 0.8), 4.3, -23 + i * 5.1); sc.add(g);
    }
    // discobal + kleurlichten
    this.disco = new THREE.Group();
    this.disco.add(mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.1, flatShading: true, emissive: 0x444466, emissiveIntensity: 0.6 }), { cast: false }));
    this.disco.position.set(0, 13, -21); sc.add(this.disco);
    this.lights = [0xff5ad8, 0x5ad8ff, 0xffe14a].map((c, i) => { const l = new THREE.PointLight(c, S.settings.quality === 'low' ? 0 : 420, 40, 1.6); l.position.set(0, 9, 2); sc.add(l); return l; });
  }

  cabTexture(id, glitch = false) {
    const def = this.defOf(id); const hue = (id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
    return canvasTex(256, 192, (g, w, hh) => {
      if (glitch) { drawScareFace(g, w, hh, 0.4, 0.5); return; }
      const gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, `hsl(${hue},80%,45%)`); gr.addColorStop(1, `hsl(${(hue + 60) % 360},85%,25%)`); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      g.fillStyle = 'rgba(255,255,255,.1)'; for (let y = 0; y < hh; y += 6) g.fillRect(0, y, w, 2);
      g.font = '84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(def.icon || PIC[id] || '🎮', w / 2, 76);
      g.font = 'bold 26px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#2a0a50'; g.lineWidth = 6; g.strokeText(def.name || NAME[id], w / 2, 150, w - 16); g.fillText(def.name || NAME[id], w / 2, 150, w - 16);
    });
  }
  buildCabinets() {
    const ids = ARCADE_IDS; const sc = this.scene;
    ids.forEach((id, n) => {
      const per = Math.ceil(ids.length / 2); const side = n < per ? -1 : 1; const k = n % per; const z = -17 + k * (35 / Math.max(1, per - 1)); const x = side * (HALL.w / 2 - 4.2);
      const g = new THREE.Group(); const body = mat(0x2a1a46), trim = mat([0xff5ad8, 0x5ad8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c][n % 6]);
      g.add(mesh(new THREE.BoxGeometry(3.4, 5.2, 2.6), body, { pos: [0, 2.6, 0] }));
      g.add(mesh(new THREE.BoxGeometry(3.6, 0.5, 2.8), trim, { pos: [0, 5.4, 0] }));
      g.add(mesh(new THREE.BoxGeometry(3.6, 0.3, 2.8), trim, { pos: [0, 0.15, 0] }));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.0), new THREE.MeshBasicMaterial({ map: this.cabTexture(id) })); scr.position.set(0, 3.5, 1.32); scr.rotation.x = -0.12; g.add(scr);
      g.add(mesh(new THREE.BoxGeometry(3.2, 0.9, 1.6), mat(0x1a1030), { pos: [0, 1.9, 1.5], rot: [-0.25, 0, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), mat(0xcccccc, { metalness: 0.7 }), { pos: [-0.8, 2.4, 1.7] })); g.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xd8372c), { pos: [-0.8, 2.75, 1.7] }));
      for (let b = 0; b < 3; b++) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), glow([0x5ad8ff, 0xffe14a, 0x7bff7b][b], 1.0), { cast: false, pos: [0.4 + b * 0.5, 2.2, 1.78] }));
      const mq = mesh(new THREE.PlaneGeometry(3.0, 0.7), new THREE.MeshBasicMaterial({ map: tex.sign((this.defOf(id).name || NAME[id]), { w: 384, h: 90, size: 46, bg: '#1a0a3a', fg: '#ffe14a', border: '#ff5ad8' }) }), { cast: false, pos: [0, 5.45, 1.42] }); g.add(mq);
      g.position.set(x, 0, z); g.rotation.y = -side * Math.PI / 2; sc.add(g);
      sc.add(mesh(new THREE.RingGeometry(1.6, 2.1, 20), new THREE.MeshBasicMaterial({ color: trim.color, transparent: true, opacity: 0.55, depthWrite: false }), { cast: false, receive: false, pos: [x - side * 4.2, 0.06, z], rot: [-Math.PI / 2, 0, 0] }));
      this.colliders.push({ x, z, r: 2.1 });
      const lbl = floatLabel(`${this.defOf(id).icon || PIC[id]} ${this.defOf(id).name || NAME[id]}`, '', '#ffe14a'); lbl.scale.set(4.3, 1.34, 1); lbl.position.set(x, 8.2, z); sc.add(lbl);
      this.cabs.push({ id, g, scr, lbl, x, z, side, ix: x - side * 4.2 });
      this.interact.push({ type: 'cab', id, x: x - side * 4.2, z, r: 3.2, label: `${this.defOf(id).name || NAME[id]} spelen` });
    });
    this.refreshLabels();
  }
  refreshLabels() {
    for (const c of this.cabs) {
      const gm = S.arcade.byGame[c.id]; const sub = gm ? `${gm.wins[0]} – ${gm.wins[1]}` : (this.games.includes(c.id) ? 'NIEUW!' : 'binnenkort');
      this.scene.remove(c.lbl); const lbl = floatLabel(`${this.defOf(c.id).icon || PIC[c.id]} ${this.defOf(c.id).name || NAME[c.id]}`, sub, '#ffe14a'); lbl.scale.set(4.3, 1.34, 1); lbl.position.set(c.x, 8.2, c.z); this.scene.add(lbl); c.lbl = lbl;
    }
  }

  buildCenter() {
    const sc = this.scene; const ids = ARCADE_IDS; const N = ids.length;
    // Wiel van Gekte
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    for (let i = 0; i < N; i++) {
      const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; g.fillStyle = `hsl(${(i * 47) % 360},75%,${i % 2 ? 48 : 58}%)`; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, a0, a1); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      const am = (a0 + a1) / 2; g.save(); g.translate(256 + Math.cos(am) * 170, 256 + Math.sin(am) * 170); g.rotate(am + Math.PI / 2); g.font = '58px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(PIC[ids[i]] || '🎮', 0, 0); g.restore();
    }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(256, 256, 34, 0, TAU); g.fill(); g.fillStyle = '#7a2fd4'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 256, 258);
    const wt = new THREE.CanvasTexture(c); wt.colorSpace = THREE.SRGBColorSpace;
    this.wheel = new THREE.Group(); this.wheelDisc = mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.4, 36), [mat(0xffd23f, { metalness: 0.6 }), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.4 }), mat(0xffd23f, { metalness: 0.6 })], { pos: [0, 1.2, 0] });
    this.wheel.add(this.wheelDisc); this.wheel.add(mesh(new THREE.CylinderGeometry(0.8, 1.6, 1.2, 10), mat(0x7a2fd4), { pos: [0, 0.6, 0] }));
    const ptr = mesh(new THREE.ConeGeometry(0.5, 1.4, 4), mat(0xd8372c), { pos: [0, 2.0, 4.6], rot: [Math.PI / 2 + 0.3, 0, 0] }); this.wheel.add(ptr);
    this.wheel.add(mesh(new THREE.TorusGeometry(4.35, 0.18, 6, 36), glow(0xffe14a, 1.0), { cast: false, pos: [0, 1.4, 0], rot: [Math.PI / 2, 0, 0] }));
    this.wheel.position.set(0, 0, 4); sc.add(this.wheel); this.colliders.push({ x: 0, z: 4, r: 4.8 });
    this.wheelLabel = floatLabel('🎡 Wiel van Gekte', 'draai en laat het lot kiezen', '#ff9aef'); this.wheelLabel.position.set(0, 6.6, 4); sc.add(this.wheelLabel);
    this.interact.push({ type: 'wheel', x: 0, z: 10, r: 4.2, label: 'Draai aan het Wiel van Gekte' });
  }

  buildBack() {
    const sc = this.scene; const zb = -HALL.d / 2;
    // troon + koning
    const throne = new THREE.Group(); const gold = mat(0xe8b82a, { metalness: 0.6, roughness: 0.35 });
    throne.add(mesh(new THREE.BoxGeometry(5, 1.4, 4), mat(0x7a2fd4), { pos: [0, 0.7, 0] })); throne.add(mesh(new THREE.BoxGeometry(2.6, 0.5, 2.2), gold, { pos: [0, 1.65, 0] })); throne.add(mesh(new THREE.BoxGeometry(2.6, 4.2, 0.5), gold, { pos: [0, 3.7, -1] }));
    throne.add(mesh(new THREE.ConeGeometry(0.4, 1.0, 5), gold, { pos: [-1.1, 6.2, -1] })); throne.add(mesh(new THREE.ConeGeometry(0.4, 1.0, 5), gold, { pos: [1.1, 6.2, -1] }));
    throne.position.set(0, 0, zb + 3.5); sc.add(throne); this.colliders.push({ x: 0, z: zb + 3.5, r: 3.2 });
    this.king = makeNPC('captain', { hat: 'crown', hatColor: 0xffd23f, beard: 'full', hair: 0xf0f0f0, beardColor: 0xf0f0f0, cape: 0x7a2fd4, shirt: 0xd8357f, sleeve: 0xd8357f, scale: 1.25, bodyW: 1.5 });
    this.king.group.position.set(0, 1.9, zb + 3.7); this.king.yaw = this.king.targetYaw = 0; this.king.pose = 'idle'; sc.add(this.king.group);
    const kl = floatLabel('👑 Koning Klopper', 'toernooi & regels', '#ffe14a'); kl.position.set(0, 7.5, zb + 3.7); sc.add(kl);
    this.interact.push({ type: 'king', x: 0, z: zb + 9.2, r: 5, label: 'Praten met Koning Klopper' });
    // scorebord
    this.boardTex = null; this.board = mesh(new THREE.PlaneGeometry(13, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [-17, 8, zb + 0.2] }); sc.add(this.board);
    sc.add(mesh(new THREE.BoxGeometry(13.8, 8.8, 0.4), mat(0xe8b82a, { metalness: 0.6 }), { cast: false, pos: [-17, 8, zb + 0.05] }));
    this.drawBoard();
    this.interact.push({ type: 'board', x: -17, z: zb + 6, r: 5, label: 'Scorebord bekijken' });
    // trofeeënkast
    const shelf = new THREE.Group(); shelf.add(mesh(new THREE.BoxGeometry(14, 0.4, 2.2), mat(0x4a2e17), { pos: [0, 2.0, 0] })); shelf.add(mesh(new THREE.BoxGeometry(14, 0.4, 2.2), mat(0x4a2e17), { pos: [0, 5.2, 0] })); shelf.add(mesh(new THREE.BoxGeometry(14.4, 7, 0.4), mat(0x2a1a10), { pos: [0, 3.6, -1.1] }));
    shelf.position.set(17, 0, zb + 1.6); sc.add(shelf); this.trophies = [];
    const A = S.arcade; const totalWins = A.wins[0] + A.wins[1];
    const defs = [['Eerste Bloed', totalWins >= 1, 0xcd7f32], ['Duelist', totalWins >= 5, 0xc0c0c0], ['Meester', totalWins >= 12, 0xffd23f], ['Legende', totalWins >= 30, 0x5ad8ff], ['Gelijkspel-koning', A.draws >= 4, 0xff9aef], ['Toernooi-winnaar', A.tourneys[0] + A.tourneys[1] >= 1, 0xffd23f], ['Allesspeler', Object.keys(A.byGame).length >= 8, 0x7bff7b], ['Rivaliteit', A.plays >= 20, 0xff5a5a]];
    defs.forEach(([name, got, col], i) => {
      const row = Math.floor(i / 4), colI = i % 4; const tg = new THREE.Group(); const m = got ? new THREE.MeshStandardMaterial({ color: col, metalness: 0.8, roughness: 0.25, emissive: col, emissiveIntensity: 0.35 }) : mat(0x444444);
      tg.add(mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.9, 10), m, { pos: [0, 0.6, 0] })); tg.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), m, { pos: [0, 0.1, 0] })); tg.add(mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), m, { pos: [0, -0.1, 0] }));
      for (const sx of [-1, 1]) tg.add(mesh(new THREE.TorusGeometry(0.3, 0.06, 5, 8, Math.PI), m, { pos: [sx * 0.55, 0.65, 0], rot: [0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2] }));
      tg.position.set(17 - 5.2 + colI * 3.5, 2.55 + row * 3.2, zb + 1.6); sc.add(tg); this.trophies.push(tg);
      const lb = floatLabel(got ? name : '???', got ? '' : 'nog niet gehaald', got ? '#ffe14a' : '#9a9a9a'); lb.scale.set(3, 0.95, 1); lb.position.set(17 - 5.2 + colI * 3.5, 4.0 + row * 3.2, zb + 2.6); sc.add(lb);
    });
    this.interact.push({ type: 'trophies', x: 17, z: zb + 6.5, r: 5, label: 'Trofeeën bekijken' });
  }
  drawBoard() {
    const A = S.arcade; const names = S.names;
    const t = canvasTex(1024, 630, (g, w, hh) => {
      const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#1a0a3a'); gr.addColorStop(1, '#3a1a6a'); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      g.textAlign = 'center'; g.fillStyle = '#ffe14a'; g.font = 'bold 64px MedievalSharp, serif'; g.fillText('SCOREBORD', w / 2, 80);
      g.font = 'bold 54px Fredoka, sans-serif'; g.fillStyle = '#6bf09a'; g.fillText(names[0], 230, 175); g.fillStyle = '#7fb2ff'; g.fillText(names[1], 794, 175);
      g.font = 'bold 190px Fredoka, sans-serif'; g.fillStyle = '#6bf09a'; g.fillText(String(A.wins[0]), 230, 360); g.fillStyle = '#7fb2ff'; g.fillText(String(A.wins[1]), 794, 360); g.fillStyle = '#fff'; g.font = 'bold 90px Fredoka'; g.fillText('–', 512, 330);
      g.font = '34px Fredoka, sans-serif'; g.fillStyle = '#d8c8ff'; g.fillText(`${A.plays} duels gespeeld · ${A.draws} gelijkspel · toernooien: ${A.tourneys[0]} – ${A.tourneys[1]}`, w / 2, 430);
      const best = Object.entries(A.byGame).sort((a, b) => b[1].plays - a[1].plays).slice(0, 3);
      g.font = '30px Fredoka, sans-serif'; g.fillStyle = '#fff'; best.forEach(([id, v], i) => g.fillText(`${PIC[id] || ''} ${NAME[id] || id}: ${v.wins[0]} – ${v.wins[1]}`, w / 2, 490 + i * 42));
      if (!best.length) g.fillText('Nog geen duels gespeeld. Kies een kast!', w / 2, 500);
    });
    this.board.material.map = t; this.board.material.needsUpdate = true;
  }

  // ------------------------------------------------------------------ start / stop
  async enter() {
    ui.hud.reset(); this.hudSetup(); audio.music('concert'); this.refreshHud();
    ui.fade(0, 600);
    const o = this.opts;
    if (o.result && o.result.pvp) await this.afterDuel(o.result);
    else if (o.result === null && TOURNEY) { TOURNEY = null; ui.hud.toast('Toernooi afgebroken.', 2200); }
    else if (!S.flags.met_king) { this.busy = true; S.flags.met_king = true; await ui.say([{ who: 'Koning Klopper', text: 'WELKOM in mijn Speelhal! Hier zijn geen karweitjes en geen heitjes te verdienen... Alleen eer, glorie en een heleboel chaos.' }, { who: 'Koning Klopper', text: 'Elk duel krijgt een TWIST: soms loop je achterstevoren, soms ruil je van lichaam, en soms staat de Deurman te kijken. Wie dan beweegt, verliest.' }, { who: 'Wes', text: 'Ik ga zo hard winnen.' }, { who: 'Jor', text: 'Dat dacht je.' }]); this.busy = false; }
  }
  exit() { ui.clearScreens(); ui.activeMenus = []; ui.hudEl.innerHTML = ''; ui.setVignette(0); }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }
  hudSetup() { ui.hud.setHint('Loop naar een arcadekast en druk op je actieknop om te duelleren · Wiel van Gekte = verrassing · Koning Klopper = toernooi'); setTimeout(() => ui.hud.setHint(null), 14000); }
  refreshHud() {
    const A = S.arcade; ui.hud.setScore(`Stand: ${S.names[0]} ${A.wins[0]} – ${A.wins[1]} ${S.names[1]}` + (TOURNEY ? `   ·   🏆 Toernooi ${TOURNEY.idx + 1}/${TOURNEY.queue.length}: ${TOURNEY.score[0]} – ${TOURNEY.score[1]}` : ''));
    ui.hud.setPlayerInfo(0, `Duels gewonnen: ${A.wins[0]}`); ui.hud.setPlayerInfo(1, `Duels gewonnen: ${A.wins[1]}`);
  }

  // ------------------------------------------------------------------ dialoog-hulp
  async say(lines, o) { await ui.say(lines, o); }
  choose(title, labels, sub) {
    return new Promise((resolve) => {
      const items = labels.map((l, i) => ({ label: l, onSelect: () => { this.menu = null; el.remove(); resolve(i); } }));
      const menu = new Menu(items); this.menu = menu;
      const card = h('div', { class: 'card', style: { width: 'min(560px,92vw)' } }, h('h2', { style: { fontSize: '28px' } }, title), sub ? h('p', { style: { textAlign: 'center' } }, sub) : null, menu.el);
      const el = ui.overlay(card, 'clear'); el.style.alignItems = 'flex-end'; el.style.paddingBottom = '200px'; el.style.background = 'none'; el.style.backdropFilter = 'none';
    });
  }
  cardModal(title, body, note) {
    return new Promise((resolve) => {
      const card = h('div', { class: 'card' }, h('h2', {}, title), body, h('div', { class: 'small-note' }, (note ? note + ' · ' : '') + `Sluiten: ${KEY_LABELS[0].a} of ${KEY_LABELS[1].a}`));
      const el = ui.overlay(card); this.modal = { el, resolve, t: 0.25 };
    });
  }

  // ------------------------------------------------------------------ interacties
  async doInteract(it, p) {
    if (this.busy) return; this.busy = true; ui.hud.setPrompt(null);
    try {
      audio.sfx('select');
      if (it.type === 'cab') await this.cab(it.id);
      else if (it.type === 'wheel') await this.wheelSpin();
      else if (it.type === 'king') await this.kingTalk();
      else if (it.type === 'board') { this.drawBoard(); await this.cardModal('Scorebord', h('p', { style: { textAlign: 'center', fontSize: '24px' }, html: `<b style="color:#1d9a52">${S.names[0]}</b> ${S.arcade.wins[0]} – ${S.arcade.wins[1]} <b style="color:#2f6fe0">${S.names[1]}</b><br><small>${S.arcade.plays} duels · ${S.arcade.draws} gelijkspel · toernooien ${S.arcade.tourneys[0]} – ${S.arcade.tourneys[1]}</small>` })); }
      else if (it.type === 'trophies') await this.cardModal('Trofeeënkast', h('p', { style: { textAlign: 'center' }, html: 'Win duels, speel veel verschillende spellen en win toernooien om trofeeën te verdienen.<br>Eerste Bloed (1 winst) · Duelist (5) · Meester (12) · Legende (30) · Gelijkspel-koning (4 gelijk) · Toernooi-winnaar · Allesspeler (8 spellen) · Rivaliteit (20 duels).' }));
      else if (it.type === 'exit') await this.leave();
    } finally { if (!this.leaving) { this.busy = false; input.reset(); } }
  }
  async cab(id) {
    const def = this.app.games[id];
    if (!def) { await this.say([{ who: 'Koning Klopper', text: 'Die kast is nog kapot. De rekenmeester repareert hem. (Dit spel is nog niet geladen.)' }]); return; }
    const gm = S.arcade.byGame[id];
    const c = await this.choose(`${def.icon || ''} ${def.name}`, ['Spelen!', 'Wat doet dit spel?', 'Terug'], gm ? `Stand in dit spel: ${S.names[0]} ${gm.wins[0]} – ${gm.wins[1]} ${S.names[1]}` : 'Nog nooit gespeeld');
    if (c === 1) { await this.say([{ who: def.giver || 'Koning Klopper', text: (def.blurb || '').replace(/<[^>]+>/g, '') }]); return this.cab(id); }
    if (c !== 0) return;
    await this.launch(id);
  }
  async launch(id, extra = null) {
    this.leaving = true; audio.sfx('powerup'); await ui.fade(1, 450); persist();
    this.app.playGame(id, { back: 'arcade', extra });
    await new Promise(() => {});
  }
  async leave() {
    const c = await this.choose('Speelhal verlaten?', ['Ja, terug naar het dorp', 'Nog niet']); if (c !== 0) return;
    this.leaving = true; TOURNEY = null; await ui.fade(1, 500); persist(); this.app.goHub({ fromArcade: true }); await new Promise(() => {});
  }
  async kingTalk() {
    const lines = [{ who: 'Koning Klopper', text: pick(['Ha, de uitdagers! Wie van jullie durft het eerst?', 'Kom maar op met je duels. Ik heb popcorn.', 'Mijn Speelhal is de beste van het hele Koninkrijk. Ook de enige. Maar toch.']) }];
    await this.say(lines);
    const c = await this.choose('Koning Klopper', TOURNEY ? ['Toernooi voortzetten', 'Toernooi stoppen', 'Hoe werkt het?', 'Niets'] : ['🏆 Toernooi starten (5 duels)', 'Hoe werkt het?', 'Niets']);
    const idx = TOURNEY ? c : c + (c >= 1 ? 1 : 0);
    if (!TOURNEY && c === 0) { await this.startTourney(); return; }
    if (TOURNEY && c === 0) { await this.nextTourney(); return; }
    if (TOURNEY && c === 1) { TOURNEY = null; this.refreshHud(); ui.hud.toast('Toernooi gestopt.', 1800); return; }
    if ((TOURNEY && c === 2) || (!TOURNEY && c === 1)) await this.say([{ who: 'Koning Klopper', text: 'Elk duel is 1 tegen 1 op hetzelfde scherm. Voor elk spel wordt een TWIST geloot: omgekeerde besturing, verwisselde knoppen, dronken kikker, reus tegen dwerg, zeepvloer, maanzwaartekracht, lichaamswissel of de Deurman die komt kijken.' }, { who: 'Koning Klopper', text: 'In een toernooi spelen jullie 5 verschillende duels. Wie de meeste wint, wordt Kampioen van de Speelhal. En ja, jullie delen de heitjes. Ik ben niet van het gokken.' }]);
  }
  async wheelSpin() {
    const ids = ARCADE_IDS.filter((id) => this.games.includes(id)); if (!ids.length) { await this.say([{ text: 'Het wiel is nog kapot.' }]); return; }
    const N = ARCADE_IDS.length; const pickId = pick(ids); const i = ARCADE_IDS.indexOf(pickId);
    const alpha = ((i + 0.5) / N) * TAU;             // hoek in de canvas
    const cur = this.wheelDisc.rotation.y; let target = alpha; while (target < cur + TAU * 4) target += TAU;
    this.spin = { from: cur, to: target, t: 0, dur: 4.2, lastTick: 0 };
    await new Promise((res) => { this.spin.done = res; });
    audio.sfx('win'); this.fx.burst(0, 3, 4, { count: 50, colors: [0xffd23f, 0xff5ad8, 0x5ad8ff], speed: 7, size: 0.4, life: 1.2 });
    await new Promise((r) => setTimeout(r, 700));
    await this.say([{ text: `Het Wiel van Gekte kiest: ${this.defOf(pickId).icon} ${this.defOf(pickId).name}!` }]);
    await this.launch(pickId);
  }

  // ------------------------------------------------------------------ toernooi
  async startTourney() {
    const ids = shuffle(ARCADE_IDS.filter((id) => this.games.includes(id)).slice()).slice(0, 5);
    if (ids.length < 2) { await this.say([{ who: 'Koning Klopper', text: 'Er zijn nog te weinig werkende kasten voor een toernooi.' }]); return; }
    TOURNEY = { queue: ids, idx: 0, score: [0, 0], log: [] };
    await this.say([{ who: 'Koning Klopper', text: `Het TOERNOOI begint! ${ids.length} duels: ${ids.map((id) => this.defOf(id).icon).join(' ')}. Wie de meeste wint, is Kampioen. En de winnaar mag een fanfare kiezen.` }]);
    await this.nextTourney();
  }
  async nextTourney() {
    const T = TOURNEY; const id = T.queue[T.idx]; const def = this.defOf(id);
    await this.say([{ who: 'Koning Klopper', text: `Duel ${T.idx + 1} van ${T.queue.length}: ${def.icon} ${def.name}! Stand: ${S.names[0]} ${T.score[0]} – ${T.score[1]} ${S.names[1]}.` }]);
    await this.launch(id, { tourney: true });
  }
  async afterDuel(r) {
    this.busy = true; this.refreshLabels(); this.drawBoard(); this.refreshHud();
    const w = r.winner; const names = S.names;
    const line = w == null ? pick(KING_DRAW) : pick(KING_WINS).replace(/\{w\}/g, names[w]).replace(/\{l\}/g, names[1 - w]);
    if (w != null) { this.players[w].c.pose = 'cheer'; this.players[1 - w].c.pose = 'sad'; }
    await new Promise((res) => setTimeout(res, 500));
    await this.say([{ who: 'Koning Klopper', text: line }]);
    this.players.forEach((p) => (p.c.pose = 'idle'));
    if (TOURNEY) {
      const T = TOURNEY; if (w != null) T.score[w]++; else { T.score[0] += 0.5; T.score[1] += 0.5; }
      T.idx++; this.refreshHud();
      if (T.idx >= T.queue.length) await this.finishTourney();
      else { this.busy = false; const c = await this.choose('Toernooi', ['Volgend duel!', 'Even pauzeren'], `Stand: ${names[0]} ${T.score[0]} – ${T.score[1]} ${names[1]}`); this.busy = true; if (c === 0) await this.nextTourney(); }
    }
    this.busy = false; input.reset();
  }
  async finishTourney() {
    const T = TOURNEY; TOURNEY = null; const names = S.names;
    const win = T.score[0] === T.score[1] ? null : T.score[0] > T.score[1] ? 0 : 1;
    if (win != null) S.arcade.tourneys[win]++; S.coins += 50; S.totalEarned += 50; persist(); this.refreshHud();
    audio.sfx('win'); ui.flash('#fff', 400);
    for (let i = 0; i < 6; i++) setTimeout(() => this.fx.burst(rand(-8, 8), 7 + rand(0, 4), rand(0, 10), { count: 40, colors: [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b], speed: 8, size: 0.45, life: 1.4, gravity: 3 }), i * 260);
    if (win != null) { this.players[win].c.pose = 'cheer'; this.players[1 - win].c.pose = 'sad'; }
    await this.say([{ who: 'Koning Klopper', text: win == null ? 'Het toernooi eindigt in een GELIJKSPEL! Dat is zo zeldzaam als een stille kip. Jullie zijn allebei Kampioen. En allebei een beetje verliezer.' : `${names[win]} is KAMPIOEN van de Speelhal! ${names[1 - win]}, jij krijgt een applausje. Hier, ik klap voor je. Klap klap.` }, { who: 'Koning Klopper', text: 'Als beloning voor jullie moed krijgen jullie samen 50 heitjes van mijn schatkist. Gebruik ze verstandig. Of niet.' }]);
    this.players.forEach((p) => (p.c.pose = 'idle'));
  }

  // ------------------------------------------------------------------ frame
  movePlayer(p, dt, frozen) {
    const ip = input.p[p.i]; const sp = 7.6;
    p.vx = damp(p.vx, frozen ? 0 : ip.x * sp, 12, dt); p.vz = damp(p.vz, frozen ? 0 : ip.y * sp, 12, dt);
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    nx = clamp(nx, -HALL.w / 2 + 1.2, HALL.w / 2 - 1.2); nz = clamp(nz, -HALL.d / 2 + 1.5, HALL.d / 2 - 1.0);
    for (const c of this.colliders) { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + 0.5; if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; } }
    const o = this.players[1 - p.i]; const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz); if (d < 1.1 && d > 1e-3) { nx += dx / d * (1.1 - d) * 0.5; nz += dz / d * (1.1 - d) * 0.5; }
    p.x = nx; p.z = nz;
    if (!p.grounded) { p.vy -= 24 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; p.c.air = false; } }
    const spd = Math.hypot(p.vx, p.vz); if (spd > 0.5) { p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), 14, dt); p.c.targetYaw = p.yaw; }
    p.c.speed = clamp(spd / sp, 0, 1); p.c.group.position.set(p.x, p.y, p.z); p.ring.position.set(p.x, 0.07, p.z);
    if (p.grounded && spd > 3) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.3; audio.sfx('step', { vol: 0.35 }); } }
  }
  nearest(p) { let best = null, bd = 1e9; for (const it of this.interact) { const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; } } return best; }
  update(dt) {
    this.t += dt; const t = this.t;
    if (this.modal) { this.modal.t -= dt; if (this.modal.t <= 0 && (input.p[0].aP || input.p[1].aP || input.pressed('Escape'))) { this.modal.el.remove(); const r = this.modal.resolve; this.modal = null; r(); input.reset(); } }
    if (this.menu) this.menu.update();
    const frozen = this.busy || scare.active;
    for (const p of this.players) {
      if (!frozen && input.p[p.i].aP) { const it = this.nearest(p); if (it) this.doInteract(it, p); else if (p.grounded) { p.vy = 8; p.grounded = false; p.c.air = true; p.c.jump(); audio.sfx('jump', { vol: 0.5 }); } }
      this.movePlayer(p, dt, frozen); p.c.update(dt);
    }
    this.mid.set((this.players[0].x + this.players[1].x) / 2, 0, (this.players[0].z + this.players[1].z) / 2);
    // camera
    const sep = Math.hypot(this.players[0].x - this.players[1].x, this.players[0].z - this.players[1].z); const k = clamp((sep - 6) / 30, 0, 1);
    const tx = clamp(this.mid.x, -26, 26), ty = lerp(17, 28, k), tz = clamp(this.mid.z, -12, 20) + lerp(11, 18, k);
    this.camPos.x = damp(this.camPos.x, tx, 4, dt); this.camPos.y = damp(this.camPos.y, ty, 3, dt); this.camPos.z = damp(this.camPos.z, tz, 4, dt);
    this.camLook.x = damp(this.camLook.x, tx, 5, dt); this.camLook.z = damp(this.camLook.z, clamp(this.mid.z, -16, 22) - 1, 5, dt);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook.x, 1.5, this.camLook.z);
    // decor
    this.disco.rotation.y += dt * 0.8; this.lights.forEach((l, i) => { const a = t * 0.7 + i * TAU / 3; l.position.set(Math.cos(a) * 14, 9, 2 + Math.sin(a) * 9); });
    for (const f of this.glows) f.scale.y = 1 + Math.sin(t * 12 + f.position.x * 3) * 0.2;
    (this.banners || []).forEach((b, i) => P.animateBanner(b, t + i));
    this.king.update(dt); this.king.pose = this.nearKing() ? 'wave' : 'idle';
    this.wheel.children[2].rotation.z = Math.sin(t * 2) * 0.03;
    if (this.spin) {
      const s = this.spin; s.t += dt; const k2 = Math.min(1, s.t / s.dur); const e = 1 - Math.pow(1 - k2, 3);
      const prev = this.wheelDisc.rotation.y; this.wheelDisc.rotation.y = lerp(s.from, s.to, e);
      const seg = TAU / ARCADE_IDS.length; if (Math.floor(prev / seg) !== Math.floor(this.wheelDisc.rotation.y / seg)) { audio.sfx('tick', { rate: 1 + (1 - k2) * 0.5, vol: 0.7 }); this.wheel.scale.setScalar(1.01); }
      this.wheel.scale.setScalar(damp(this.wheel.scale.x, 1, 14, dt));
      if (k2 >= 1) { const done = s.done; this.spin = null; done && done(); }
    }
    // Deurman-spookje op een kast
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0 && S.settings.scare >= 1 && this.cabs.length) { this.nextGlitch = rand(70, 140); const cab = pick(this.cabs); const old = cab.scr.material.map; cab.scr.material.map = this.cabTexture(cab.id, true); cab.scr.material.needsUpdate = true; audio.sfx('static'); setTimeout(() => { cab.scr.material.map = old; cab.scr.material.needsUpdate = true; }, 1600); }
    this.fx.update(dt);
    // prompt
    if (this.busy) ui.hud.setPrompt(null);
    else { const lines = []; for (const p of this.players) { const it = this.nearest(p); if (it) lines.push(`<span style="color:${PLAYER_CSS[p.i]}">${S.names[p.i]}</span> <b>${KEY_LABELS[p.i].a}</b> ${it.label}`); } ui.hud.setPrompt(lines.length ? lines.join('<br>') : null); }
  }
  nearKing() { return this.players.some((p) => Math.hypot(p.x - 0, p.z - (-HALL.d / 2 + 3.7)) < 9); }
  render(renderer) { renderer.render(this.scene, this.camera); }
}

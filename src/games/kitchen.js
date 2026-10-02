import * as THREE from 'three';
import { mat, mesh, clamp, damp, lerp, rand, pick, TAU, h } from '../engine/util.js';
import { ING, RECIPES, itemMesh, dishMesh, ingMesh, plateMesh, emojiSprite, bubbleSprite, makeBar } from './kitchen_items.js';
import { buildWorld, makeCustomerPool, L, CY } from './kitchen_world.js';

// Taverne-keuken (Overcooked-achtig): Daan en Sem runnen samen de keuken van De Gouden Griffioen.
// Links: kratten + hakplanken (voorbereiden). Midden: doorgeef-aanrecht. Rechts: fornuis, borden, serveerluik.

const DURATION = 100;
const SPEED = 6.4;
const RAD = 0.42;
const COOK_T = 8, BURN_T = 6, EXT_T = 1.0;
const PLATES0 = 4;
const STAR_PTS = [18, 42, 80];   // 1, 2, 3 sterren (punten: 10 per gerecht + fooi tot +5, -3 per te late bestelling)

const CSS = `
.kt-wrap{position:absolute;top:104px;left:12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;align-items:flex-start}
.kt{width:196px;padding:4px 8px 5px;background:linear-gradient(#f9ebc6,#e6cd96);color:#3a2410;border:3px solid #7a4a22;border-radius:8px;box-shadow:0 3px 0 rgba(0,0,0,.4);animation:pop .3s ease-out;font-weight:600}
.kt-top{display:flex;align-items:center;gap:6px}
.kt-ic{font-size:26px;line-height:1}
.kt-n{font-size:14px;line-height:1.05;flex:1}
.kt-ing{font-size:15px;white-space:nowrap}
.kt-bar{height:9px;margin-top:3px;background:#5a3a1e;border-radius:6px;overflow:hidden;border:2px solid #3a2410}
.kt-bar i{display:block;height:100%;background:#6bd36b;width:100%}
.kt.warn{animation:kt-shake .35s infinite}
@keyframes kt-shake{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}
`;

export default {
  id: 'kitchen',
  name: 'Taverne-keuken',
  giver: 'Waardin Wilma',
  icon: '🍲',
  mode: 'coop',
  time: DURATION,
  pay: 1.15,
  music: 'game_fast',
  blurb: 'De taverne van <b>Waardin Wilma</b> zit vol hongerige gasten! Pak ingrediënten, <b>hak</b> ze, kook ze en serveer. De keuken is verdeeld door een <b>doorgeef-aanrecht</b>: geef gehakt eten door aan je broer. Laat niets aanbranden!',
  controls: ['{move} lopen', '{a} pakken / neerzetten', '{b} (ingedrukt) hakken of blussen'],
  tip: 'Soep = ui + wortel (pot) · Stoofpot = vlees + wortel (pot) · Kaasbroodjes = brood + kaas (pan). Alles eerst hakken, dan op een bord serveren!',

  create(ctx) {
    const { scene, camera, fx, players, input, audio, hud } = ctx;
    ctx.lights('indoor', { shadow: 15, center: [0, 0, -1] });
    scene.background = new THREE.Color(0x1d130c);
    scene.fog = null;
    const world = buildWorld(ctx);
    const obstacles = world.obstacles;

    camera.fov = 40; camera.updateProjectionMatrix();
    const camT = new THREE.Vector3(0.2, 0.4, -2.9);
    let fit = 1, camSway = 0;
    const placeCam = () => {
      camera.position.set(camT.x + camSway, camT.y + 17.0 * fit, camT.z + 11.0 * fit);
      camera.lookAt(camT.x + camSway, camT.y, camT.z);
    };
    function onResize(w, hh) { fit = clamp(1.8 / (w / hh), 1, 1.7); placeCam(); }
    onResize(innerWidth, innerHeight);

    // ================= stations =================
    const stations = [];
    const anchorHold = new Map();
    function showItem(anchor, item, sc = 1) {
      const old = anchorHold.get(anchor); if (old) { anchor.remove(old); anchorHold.delete(anchor); }
      if (!item) return;
      const m = itemMesh(item); m.scale.setScalar(sc); anchor.add(m); anchorHold.set(anchor, m);
    }
    for (const c of world.crates) stations.push({ type: 'crate', kind: c.kind, x: c.x, z: c.z, r: 0.8, y: 0.9, group: c.group });
    const boards = world.boards.map((b) => {
      const st = { type: 'board', x: b.x, z: b.z, r: 0.75, y: CY + 0.15, item: null, progress: 0, anchor: b.anchor, vis: b, bar: makeBar(1.2, 0.17), chop: 0 };
      st.bar.group.position.set(b.x, CY + 1.35, b.z); st.bar.group.visible = false; scene.add(st.bar.group);
      stations.push(st); return st;
    });
    const slots = world.slots.map((s) => { const st = { type: 'slot', x: s.x, z: s.z, r: 0.5, y: CY + 0.05, item: null, anchor: s.anchor }; stations.push(st); return st; });
    const plateSt = { type: 'plates', x: world.plates.x, z: world.plates.z, r: 0.6, y: CY + 0.4, count: PLATES0, returns: [] };
    stations.push(plateSt); world.plates.setCount(plateSt.count);
    const hatch = { type: 'hatch', x: world.hatchPos.x, z: world.hatchPos.z, r: 0.95, y: CY + 0.05 };
    stations.push(hatch);
    const trash = { type: 'trash', x: L.trash[0], z: L.trash[1], r: 0.55, y: 1.0 };
    stations.push(trash);

    const cookers = world.cookers.map((v) => {
      const ck = { type: 'cooker', kind: v.kind, x: v.x, z: v.z, r: v.kind === 'pot' ? 0.8 : 0.95, y: CY + 0.7, vis: v, items: [], state: 'empty', t: 0, dish: null, ext: 0, fxT: 0, warnT: 0 };
      ck.icon = [emojiSprite('🥣', 0.8), emojiSprite('🥣', 0.8)]; ck.icon.forEach((s) => { s.visible = false; scene.add(s); });
      ck.bar = makeBar(1.3, 0.18); ck.bar.group.visible = false; scene.add(ck.bar.group);
      stations.push(ck); return ck;
    });
    // dichtstbijzijnde afstand tot een station wordt gemeten vanaf de rand
    const iconCache = {};
    function setIcons(ck, list) {
      const e = (s, emoji) => { if (iconCache[emoji] === undefined) iconCache[emoji] = emojiSprite(emoji, 1).material.map; s.material.map = iconCache[emoji]; s.material.needsUpdate = true; };
      ck.icon.forEach((s, i) => { s.visible = !!list[i]; if (list[i]) e(s, list[i]); });
      const n = list.filter(Boolean).length;
      ck.icon.forEach((s, i) => { s.position.set(ck.x + (n === 2 ? (i - 0.5) * 0.75 : 0), CY + 2.55, ck.z); });
      ck.bar.group.position.set(ck.x, CY + 1.95, ck.z);
    }
    function blacken(g) { g.traverse((o) => { if (o.isMesh) o.material = mat(0x16110d); }); }
    function refreshCooker(ck) {
      const v = ck.vis; v.content.clear(); v.fire.visible = ck.state === 'burning';
      const lm = v.liquidMat;
      if (ck.state === 'empty' || ck.state === 'loading') {
        v.liquid.visible = false;
        ck.items.forEach((it, k) => { const m = ingMesh(it.k, true); m.scale.setScalar(ck.kind === 'pot' ? 0.9 : 1.1); m.position.set(0, 0, (k - (ck.items.length - 1) / 2) * (ck.kind === 'pot' ? 0.5 : 0.8)); m.rotation.y = k; v.content.add(m); });
        setIcons(ck, ck.items.map((it) => ING[it.k].icon)); ck.bar.group.visible = false;
        if (!ck.items.length) { ck.icon.forEach((s) => (s.visible = false)); }
      } else if (ck.state === 'cooking' || ck.state === 'done') {
        const col = RECIPES[ck.dish].color;
        if (ck.kind === 'pot') { v.liquid.visible = true; lm.color.setHex(col); lm.emissive.setHex(col); lm.emissiveIntensity = 0.3; } else { v.liquid.visible = false; const d = dishMesh('broodje'); d.scale.setScalar(1.5); v.content.add(d); }
        setIcons(ck, [RECIPES[ck.dish].icon]);
      } else if (ck.state === 'burning') {
        if (ck.kind === 'pot') { v.liquid.visible = true; lm.color.setHex(0x0a0807); lm.emissive.setHex(0x300800); lm.emissiveIntensity = 0.5; } else { v.liquid.visible = false; const d = dishMesh('broodje'); d.scale.setScalar(1.5); blacken(d); v.content.add(d); }
        setIcons(ck, ['🔥']);
      }
    }
    function cookerAccepts(ck, it) {
      if (!it || it.k === 'plate' || !it.chopped) return false;
      if (ck.state !== 'empty' && ck.state !== 'loading') return false;
      if (ck.items.length >= 2) return false;
      for (const r of Object.values(RECIPES)) {
        if (r.cooker !== ck.kind || !r.ing.includes(it.k)) continue;
        if (ck.items.every((x) => r.ing.includes(x.k) && x.k !== it.k)) return true;
      }
      return false;
    }

    // ================= spelers =================
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 28);
    const pl = players.map((pp, i) => {
      const c = ctx.make.brother(i);
      const x = i ? 3.0 : -3.0, z = -1.2;
      c.group.position.set(x, 0, z); scene.add(c.group);
      const ring = mesh(ringGeo, new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] });
      ring.renderOrder = 22; ring.visible = false; scene.add(ring);
      const arrow = mesh(new THREE.ConeGeometry(0.17, 0.38, 4), new THREE.MeshBasicMaterial({ color: pp.color, depthTest: false }), { cast: false, receive: false, rot: [Math.PI, Math.PI / 4, 0] });
      arrow.renderOrder = 22; arrow.visible = false; scene.add(arrow);
      const tag = mesh(new THREE.RingGeometry(0.5, 0.62, 20), new THREE.MeshBasicMaterial({ color: pp.color, transparent: true, opacity: 0.8 }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.05, 0] });
      c.group.add(tag);
      return { i, c, x, z, vx: 0, vz: 0, fx: 0, fz: -1, hold: null, holdG: null, tgt: null, bt: null, ring, arrow, color: pp.color, name: pp.name, swingT: 0, extFx: 0, dustT: 0 };
    });
    function setHold(p, item) {
      if (p.holdG) { p.c.group.remove(p.holdG); p.holdG = null; }
      p.hold = item;
      if (item) { const g = itemMesh(item); g.scale.setScalar(1.15); const s = p.c.s; g.position.set(0, 0.98 * s, 0.56 * s); p.c.group.add(g); p.holdG = g; }
      p.c.pose = item ? 'carry' : 'idle';
    }
    const holdText = (it) => !it ? '' : it.k === 'plate' ? (it.dish ? `${RECIPES[it.dish].icon} ${RECIPES[it.dish].name}` : '🍽️ leeg bord') : `${ING[it.k].icon} ${ING[it.k].name.toLowerCase()} ${it.chopped ? '(gehakt)' : '(rauw)'}`;

    // ================= acties =================
    // geeft null (niets), 'actie' of '!melding' (afgewezen, met uitleg)
    function actionFor(p, st) {
      const hd = p.hold;
      switch (st.type) {
        case 'crate': return hd ? null : 'take';
        case 'slot': return hd ? (st.item ? null : 'put') : (st.item ? 'grab' : null);
        case 'board':
          if (!hd) return st.item ? 'grab' : null;
          return st.item ? null : (hd.k !== 'plate' ? 'put' : null);
        case 'cooker':
          if (hd && hd.k === 'plate' && !hd.dish && st.state === 'done') return 'plate';
          if (hd && hd.k === 'plate' && st.state === 'done') return '!Bord is al vol';
          if (hd && hd.k !== 'plate') {
            if (cookerAccepts(st, hd)) return 'add';
            if (st.state === 'burning') return '!Blus het vuur (B)';
            if (!hd.chopped) return '!Eerst hakken!';
            if (st.state === 'cooking' || st.state === 'done') return '!Pot is bezig';
            return '!Dat past niet';
          }
          if (!hd) {
            if (st.state === 'loading') return 'retrieve';
            if (st.state === 'done') return '!Pak een bord';
            if (st.state === 'burning') return '!Blus met B!';
          }
          return null;
        case 'plates':
          if (!hd) return st.count > 0 ? 'ptake' : '!Geen borden';
          return (hd.k === 'plate' && !hd.dish) ? 'pput' : null;
        case 'hatch':
          if (!hd) return null;
          if (hd.k !== 'plate') return '!Op een bord!';
          if (!hd.dish) return '!Bord is leeg';
          return seats.some((s) => s.state === 'waiting' && s.order.recipe === hd.dish) ? 'serve' : '!Niemand wil dit';
        case 'trash': return hd ? 'trash' : null;
      }
      return null;
    }
    const BONUS = { put: 0, add: -0.35, plate: -0.35, serve: -0.35, trash: 0.25, pput: 0.1, retrieve: 0.1 };
    function findTarget(p) {
      const qx = p.x + p.fx * 0.5, qz = p.z + p.fz * 0.5;
      let best = null, bd = 9, rej = null, rd = 9;
      for (const st of stations) {
        const d = Math.hypot(qx - st.x, qz - st.z) - st.r;
        if (d > 1.0) continue;
        const a = actionFor(p, st); if (!a) continue;
        if (a[0] === '!') { if (d < rd) { rd = d; rej = { st, a }; } } else { const dd = d + (BONUS[a] || 0); if (dd < bd) { bd = dd; best = { st, a }; } }
      }
      return best || rej;
    }
    function findBTarget(p) {
      let best = null, bd = 1.3;
      for (const st of stations) {
        let ok = false;
        if (st.type === 'board') ok = !p.hold && st.item && !st.item.chopped;
        else if (st.type === 'cooker') ok = st.state === 'burning';
        if (!ok) continue;
        const d = Math.hypot(p.x - st.x, p.z - st.z) - st.r;
        if (d < bd) { bd = d; best = { st }; }
      }
      return best;
    }

    let score = 0, served = 0, failed = 0, tips = 0, stage = 0, firstServed = false, burned = 0, handoffs = 0;
    const popText = (txt, x, y, z, col, sc = 1) => fx.texts.add(txt, x, y, z, col, sc);
    const flyers = [];

    function act(p, tg) {
      const { st, a } = tg;
      const hd = p.hold;
      if (a[0] === '!') { popText(a.slice(1), p.x, 2.7, p.z, '#ff9a8a', 0.8); audio.sfx('buzz', { vol: 0.35 }); p.c.squash = 0.1; return; }
      switch (a) {
        case 'take': {
          setHold(p, { k: st.kind, chopped: false }); audio.sfx('pop', { rate: 1.1 });
          st.group.scale.set(1.04, 0.94, 1.04); stage = Math.max(stage, 1);
          fx.particles.burst(st.x + 0.4, 1.3, st.z, { count: 6, color: 0xffe9a0, speed: 2, size: 0.18 });
          break;
        }
        case 'put': {
          st.item = hd; setHold(p, null); showItem(st.anchor, st.item, st.type === 'board' ? 1 : 0.95);
          audio.sfx('thud', { vol: 0.5, rate: 1.2 });
          if (st.type === 'slot' && Math.abs(st.x) < 0.1) { st.droppedBy = p.i; }
          if (st.type === 'board') stage = Math.max(stage, 2);
          break;
        }
        case 'grab': {
          setHold(p, st.item); st.item = null; showItem(st.anchor, null); audio.sfx('pop', { rate: 0.9, vol: 0.6 });
          if (st.type === 'slot' && Math.abs(st.x) < 0.1 && st.droppedBy !== undefined && st.droppedBy !== p.i) { handoffs++; popText('Doorgegeven!', st.x, 2.5, st.z, '#9aff9a', 0.9); fx.particles.burst(st.x, CY + 0.5, st.z, { count: 8, colors: [0xffe14a, 0xffffff], speed: 2.4, size: 0.2 }); audio.sfx('sparkle', { vol: 0.5 }); }
          if (st.type === 'board' && hd == null && p.hold && p.hold.chopped) stage = Math.max(stage, 3);
          break;
        }
        case 'add': {
          ck_add(st, hd); setHold(p, null);
          break;
        }
        case 'retrieve': {
          const it = st.items.pop(); setHold(p, it); st.state = st.items.length ? 'loading' : 'empty'; refreshCooker(st); audio.sfx('pop', { rate: 0.9, vol: 0.6 }); break;
        }
        case 'plate': {
          hd.dish = st.dish; const d = st.dish;
          setHold(p, hd); p.c.pose = 'carry';
          st.state = 'empty'; st.items = []; st.dish = null; st.t = 0; refreshCooker(st);
          audio.sfx('pop', { rate: 1.3 }); fx.particles.burst(st.x, CY + 1.0, st.z, { count: 10, colors: [0xffffff, RECIPES[d].color], speed: 2.2, up: 1.4, size: 0.3 });
          stage = Math.max(stage, 4);
          break;
        }
        case 'ptake': st.count--; world.plates.setCount(st.count); setHold(p, { k: 'plate', dish: null }); audio.sfx('wood', { rate: 1.3, vol: 0.6 }); stage = Math.max(stage, 3); break;
        case 'pput': st.count++; world.plates.setCount(st.count); setHold(p, null); audio.sfx('wood', { rate: 1.0, vol: 0.5 }); break;
        case 'trash': {
          if (hd.k === 'plate') { plateSt.returns.push(t + 3); }
          setHold(p, null); audio.sfx('whoosh', { vol: 0.5 }); world.trashLid.rotation.z = Math.PI / 2 - 0.9; trashLidT = 0.35;
          fx.particles.burst(trash.x, 1.2, trash.z, { count: 8, color: 0x8a7a6a, speed: 2, size: 0.25 });
          break;
        }
        case 'serve': serve(p, st); break;
      }
    }
    let trashLidT = 0;

    function ck_add(ck, it) {
      ck.items.push(it);
      audio.sfx(ck.kind === 'pot' ? 'splash' : 'sizzle', { vol: 0.6, rate: 1.1 });
      fx.particles.burst(ck.x, CY + 0.9, ck.z, { count: 8, color: ck.kind === 'pot' ? 0xcfe8ff : 0xffe9a0, speed: 2, size: 0.25 });
      if (ck.items.length === 2) {
        const keys = ck.items.map((x) => x.k);
        const r = Object.values(RECIPES).find((rr) => rr.cooker === ck.kind && keys.every((k) => rr.ing.includes(k)));
        ck.dish = r.id; ck.state = 'cooking'; ck.t = 0; ck.warnT = 0; ck.fxT = 0;
        audio.sfx('sizzle', { vol: 0.5, rate: 0.8 });
        popText('Kookt!', ck.x, 3.2, ck.z, '#ffe14a', 0.8);
      } else ck.state = 'loading';
      refreshCooker(ck); stage = Math.max(stage, 3);
    }

    function serve(p, st) {
      const dish = p.hold.dish;
      let best = null, bf = 9;
      for (const s of seats) if (s.state === 'waiting' && s.order.recipe === dish) { const f = s.order.left / s.order.patience; if (f < bf) { bf = f; best = s; } }
      if (!best) return;
      const o = best.order;
      const frac = o.left / o.patience;
      const tip = frac > 0.66 ? 5 : frac > 0.33 ? 2 : 0;
      const gain = 10 + tip;
      score += gain; served++; tips += tip; firstServed = true;
      setHold(p, null);
      plateSt.returns.push(t + 6);
      // vliegend bord
      const m = plateMesh(dish); m.scale.setScalar(1.1); scene.add(m);
      flyers.push({ m, t: 0, from: new THREE.Vector3(st.x, CY + 0.4, st.z), to: new THREE.Vector3(best.x, 1.5, best.z), seat: best });
      best.state = 'served'; best.timer = 1.6; best.c.pose = 'cheer';
      removeTicket(o);
      audio.sfx('bell'); audio.sfx('coin', { vol: 0.7 }); wilmaReact('cheer', 1.4);
      world.bell.scale.setScalar(1.35); bellT = 0.4;
      popText(tip ? `+${gain} (fooi +${tip})` : `+${gain}`, best.x, 3.6, best.z + 0.2, tip >= 5 ? '#ffd23f' : '#ffffff', 1.1);
      fx.particles.burst(best.x, 2.2, best.z, { count: 20, colors: [0xffd23f, 0xffffff, 0xff9a3a], speed: 4, up: 1.3, size: 0.28 });
    }
    let bellT = 0;

    // Waardin Wilma kijkt toe vanaf de voorrand van de keuken
    const wilma = ctx.make.npc('innkeeper', { scale: 1.05 });
    wilma.group.position.set(-5.6, 0, 3.6); wilma.targetYaw = wilma.yaw = 0.3; obstacles.push({ x0: -6.0, x1: -5.2, z0: 3.2, z1: 4.0 }); scene.add(wilma.group);
    let wilmaT = 0, wilmaPose = 'idle';
    const wilmaReact = (pose, d) => { wilmaPose = pose; wilmaT = d; };
    function updateWilma(dt) {
      if (wilmaT > 0) { wilmaT -= dt; if (wilmaT <= 0) wilmaPose = 'idle'; }
      let pose = wilmaPose;
      if (pose === 'idle' && Math.sin(t * 0.35) > 0.93) pose = 'wave';
      wilma.pose = pose; wilma.update(dt);
    }

    // ================= klanten & bestellingen =================
    const specs = makeCustomerPool();
    const pool = specs.map((sp) => { const c = sp.make(); c.group.visible = false; scene.add(c.group); return { c, used: false, name: sp.name }; });
    const seats = L.seats.map((s, i) => ({ i, x: s.x, z: s.z, state: 'free', c: null, pc: null, order: null, path: [], timer: 0, bubble: null }));
    const wrap = h('div', { class: 'kt-wrap' });
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    let orderId = 0;
    const ordersAll = [];
    function addTicket(o) {
      const r = RECIPES[o.recipe];
      const el = h('div', { class: 'kt' },
        h('div', { class: 'kt-top' }, h('span', { class: 'kt-ic' }, r.icon), h('div', { class: 'kt-n' }, r.name, h('div', { class: 'kt-ing' }, r.ing.map((k) => ING[k].icon).join('+') + (r.cooker === 'pot' ? ' → pot' : ' → pan')))),
        h('div', { class: 'kt-bar' }, h('i')));
      o.el = el; o.barEl = el.querySelector('i'); wrap.append(el);
    }
    function removeTicket(o) { if (o.el) { o.el.remove(); o.el = null; } }
    function chooseRecipe() {
      const keys = ['soep', 'stoof', 'broodje'], w = [34, 34, 32];
      for (let k = 0; k < 3; k++) {   // vermijd drie keer hetzelfde achter elkaar
        let r = Math.random() * 100, pickIdx = 0; for (let i = 0; i < 3; i++) { r -= w[i]; if (r <= 0) { pickIdx = i; break; } }
        if (!(lastRecipes[0] === keys[pickIdx] && lastRecipes[1] === keys[pickIdx])) { return keys[pickIdx]; }
      }
      return pick(keys);
    }
    const lastRecipes = [];
    function spawnCustomer(seat, recipe, patience) {
      const free = pool.filter((q) => !q.used); if (!free.length) return false;
      const pc = pick(free); pc.used = true; seat.pc = pc; seat.c = pc.c;
      const c = pc.c; c.group.visible = true; c.group.position.set(L.door[0], 0, L.door[1]); c.pose = 'idle'; c.yaw = c.targetYaw = -Math.PI / 2;
      seat.state = 'arriving'; seat.path = [[seat.x, -8.0], [seat.x, seat.z]];
      const bubble = bubbleSprite(RECIPES[recipe].icon, 1.45); bubble.visible = false; scene.add(bubble);
      const bar = makeBar(1.1, 0.16); bar.group.visible = false; scene.add(bar.group);
      seat.order = { id: ++orderId, recipe, patience, left: patience, seat, bubble, bar, el: null };
      ordersAll.push(seat.order);
      lastRecipes.unshift(recipe); lastRecipes.length = Math.min(lastRecipes.length, 2);
      audio.sfx('door', { vol: 0.4 });
      return true;
    }
    function releaseSeat(seat) {
      if (seat.order) { seat.order.bubble.visible = false; scene.remove(seat.order.bubble); scene.remove(seat.order.bar.group); removeTicket(seat.order); }
      seat.order = null; seat.state = 'leaving'; seat.path = [[seat.x, -8.0], [L.door[0], -8.0], [L.door[0] + 1.2, L.door[1]]];
    }
    const activeCount = () => seats.filter((s) => s.state === 'arriving' || s.state === 'waiting').length;

    function updateSeats(dt) {
      for (const s of seats) {
        if (s.state === 'free') continue;
        const c = s.c; const gp = c.group.position;
        if (s.state === 'arriving' || s.state === 'leaving') {
          const goal = s.path[0];
          if (goal) {
            const dx = goal[0] - gp.x, dz = goal[1] - gp.z, d = Math.hypot(dx, dz);
            const sp = 3.1;
            if (d < 0.12) s.path.shift(); else { gp.x += dx / d * sp * dt; gp.z += dz / d * sp * dt; c.faceDir(dx, dz); c.speed = 0.7; }
          }
          if (!s.path.length) {
            c.speed = 0;
            if (s.state === 'arriving') { s.state = 'waiting'; c.faceDir(0, 1); addTicket(s.order); s.order.bubble.visible = true; s.order.bar.group.visible = true; audio.sfx('note', { vol: 0.5, rate: 1.3 }); c.jump(); }
            else { c.group.visible = false; s.pc.used = false; s.pc = null; s.c = null; s.state = 'free'; }
          }
        } else if (s.state === 'waiting') {
          const o = s.order; o.left -= dt; c.speed = 0;
          const f = o.left / o.patience;
          c.pose = f < 0.28 ? 'scared' : f < 0.55 ? 'idle' : 'idle';
          if (f < 0.28 && Math.floor(o.left * 2) !== Math.floor((o.left + dt) * 2)) c.squash = 0.08;
          if (o.left <= 0 && !done) {
            // te laat
            failed++; score = Math.max(0, score - 3);
            popText('Te laat! -3', s.x, 3.6, s.z + 0.2, '#ff6a6a', 1.1); audio.sfx('miss'); ctx.shake(0.25); wilmaReact('sad', 1.6);
            c.pose = 'sad'; s.state = 'served'; s.timer = 1.0; s.sad = true; removeTicket(o); fx.particles.burst(s.x, 2.2, s.z, { count: 10, colors: [0x555555, 0x888888], speed: 2.4, size: 0.3, gravity: 1 });
          }
        } else if (s.state === 'served') {
          c.speed = 0; s.timer -= dt;
          if (s.timer <= 0) { s.sad = false; releaseSeat(s); }
        }
        c.update(dt);
        // ballon + balkje
        const o = s.order;
        if (o && s.state === 'waiting') {
          const f = clamp(o.left / o.patience, 0, 1);
          const by = c.height + 0.75;
          o.bubble.position.set(s.x, by, s.z);
          o.bubble.scale.setScalar(1); o.bubble.scale.set(1.45 * 0.89 * (1 + (f < 0.28 ? Math.sin(t * 14) * 0.06 : 0)), 1.45 * (1 + (f < 0.28 ? Math.sin(t * 14) * 0.06 : 0)), 1);
          o.bar.group.position.set(s.x, by + 1.6, s.z);
          const col = f > 0.5 ? 0x6bd36b : f > 0.25 ? 0xf0c03a : 0xf05a4a;
          o.bar.set(f, col);
          if (o.barEl && o.el) { o.barEl.style.width = (f * 100) + '%'; o.barEl.style.background = '#' + col.toString(16).padStart(6, '0'); if (o.el) o.el.classList.toggle('warn', f < 0.28); }
        }
      }
    }

    // ================= bewegen =================
    function collideCircle(p) {
      p.x = clamp(p.x, -8.5, 8.55); p.z = clamp(p.z, -4.55, 4.28);
      for (const o of obstacles) {
        const cx = clamp(p.x, o.x0, o.x1), cz = clamp(p.z, o.z0, o.z1);
        let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 < RAD * RAD) {
          if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (RAD - d) / d; p.x += dx * k; p.z += dz * k; }
          else { // middelpunt in het blok: kleinste uitweg
            const l = p.x - o.x0, r = o.x1 - p.x, tp = p.z - o.z0, bt = o.z1 - p.z, m = Math.min(l, r, tp, bt);
            if (m === l) p.x = o.x0 - RAD; else if (m === r) p.x = o.x1 + RAD; else if (m === tp) p.z = o.z0 - RAD; else p.z = o.z1 + RAD;
          }
        }
      }
    }

    let t = 0, timeLeft = DURATION, nextSpawn = 0.8, done = false, steamT = 0, smokeT = 0;
    function updatePlayers(dt) {
      for (const p of pl) {
        const inp = input.p[p.i];
        const bt = inp.b ? findBTarget(p) : null; p.bt = bt;
        let mx = inp.x, mz = inp.y;
        if (bt) { mx = 0; mz = 0; p.c.faceTowards(bt.st.x, bt.st.z); const d = Math.hypot(bt.st.x - p.x, bt.st.z - p.z); if (d > 0.01) { p.fx = (bt.st.x - p.x) / d; p.fz = (bt.st.z - p.z) / d; } }
        else if (Math.hypot(mx, mz) > 0.15) { const m = Math.hypot(mx, mz); p.fx = mx / m; p.fz = mz / m; }
        p.vx = damp(p.vx, mx * SPEED, 16, dt); p.vz = damp(p.vz, mz * SPEED, 16, dt);
        p.x += p.vx * dt; p.z += p.vz * dt;
        collideCircle(p);
      }
      // zachte botsing tussen de broers
      const a = pl[0], b = pl[1];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < RAD * 2.1 && d > 1e-4) { const push = (RAD * 2.1 - d) * 0.5 * Math.min(1, 14 * dt); const nx = dx / d, nz = dz / d; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push; collideCircle(a); collideCircle(b); }
      for (const p of pl) {
        const inp = input.p[p.i];
        const spd = Math.hypot(p.vx, p.vz);
        p.c.group.position.set(p.x, 0, p.z);
        if (!p.bt && spd > 0.4) p.c.faceDir(p.vx, p.vz);
        p.c.speed = Math.min(1, spd / SPEED);
        if (p.c.speed > 0.35) { p.dustT -= dt; if (p.dustT < 0) { p.dustT = 0.16; fx.particles.dust(p.x, 0, p.z, 1); } }
        // doel bepalen
        p.tgt = findTarget(p);
        if (inp.aP) { if (p.tgt) act(p, p.tgt); else audio.sfx('click', { vol: 0.2 }); }
        // hakken / blussen
        if (p.bt) {
          const st = p.bt.st;
          if (st.type === 'board') {
            const ing = ING[st.item.k];
            st.progress += dt / ing.chop; st.chopping = 0.12;
            p.swingT -= dt; if (p.swingT <= 0) { p.swingT = 0.24; p.c.swing(); audio.sfx('chop', { vol: 0.55, rate: 0.9 + Math.random() * 0.3 }); fx.particles.burst(st.x + rand(-0.3, 0.3), CY + 0.3, st.z + rand(-0.2, 0.2), { count: 3, color: [0xf2dfa8, 0xf08a1c, 0xb53f3f, 0xefc27a, 0xffd23f][['ui', 'wortel', 'vlees', 'brood', 'kaas'].indexOf(st.item.k)], speed: 1.6, size: 0.14 }); }
            if (st.progress >= 1) {
              st.progress = 0; st.item = { k: st.item.k, chopped: true }; showItem(st.anchor, st.item);
              audio.sfx('ding', { vol: 0.7, rate: 1.4 }); popText('Gehakt!', st.x, 2.6, st.z, '#b8ff9a', 0.9);
              fx.particles.burst(st.x, CY + 0.4, st.z, { count: 12, colors: [0xffffff, 0xffe14a], speed: 2.6, up: 1.4, size: 0.2 });
              stage = Math.max(stage, 3);
            }
          } else if (st.type === 'cooker') {
            st.ext += dt; p.c.pose = 'push';
            p.extFx -= dt; if (p.extFx <= 0) { p.extFx = 0.07; fx.particles.emit(p.x + p.fx * 0.7, 1.3, p.z + p.fz * 0.7, p.fx * 4.5 + rand(-0.5, 0.5), 1.2 + Math.random(), p.fz * 4.5 + rand(-0.5, 0.5), { life: 0.45, size: 0.3, color: 0x7ac8ff, gravity: 8 }); }
            if (Math.floor(st.ext * 6) !== Math.floor((st.ext - dt) * 6)) audio.sfx('splash', { vol: 0.25, rate: 1.3 });
          }
        } else if (p.c.pose === 'push') p.c.pose = p.hold ? 'carry' : 'idle';
        p.c.update(dt);
      }
      // aanwijsring
      for (const p of pl) {
        const tg = p.tgt || (p.bt ? { st: p.bt.st, a: 'b' } : null);
        if (tg) {
          const st = tg.st; const rej = tg.a[0] === '!';
          p.ring.visible = true; p.arrow.visible = true;
          p.ring.position.set(st.x, (st.y || 1) + 0.04 + p.i * 0.01, st.z);
          const sc = (st.type === 'cooker' ? st.r * 1.3 : st.type === 'crate' ? 1.4 : st.r * 1.25) * (1 + Math.sin(t * 8) * 0.04);
          p.ring.scale.set(sc, sc, sc);
          p.ring.material.color.setHex(rej ? 0xff6a5a : p.color);
          p.arrow.position.set(st.x + (p.i ? 0.15 : -0.15), (st.y || 1) + 1.0 + Math.sin(t * 6 + p.i) * 0.12, st.z);
          p.arrow.rotation.y = t * 3;
          p.arrow.material.color.setHex(rej ? 0xff6a5a : p.color);
        } else { p.ring.visible = false; p.arrow.visible = false; }
        hud.setPlayerInfo(p.i, p.hold ? holdText(p.hold) : '✋ handen vrij');
      }
    }

    // ================= koken, hakken, borden =================
    function updateStations(dt) {
      for (const b of boards) {
        b.chopping = Math.max(0, (b.chopping || 0) - dt);
        const show = b.item && !b.item.chopped && b.progress > 0.001;
        b.bar.group.visible = !!show;
        if (show) b.bar.set(b.progress, 0xffd23f);
        b.vis.knife.rotation.z = b.chopping > 0 ? Math.sin(t * 40) * 0.35 : damp(b.vis.knife.rotation.z, 0, 10, dt);
        b.vis.knife.position.y = 0.14 + (b.chopping > 0 ? Math.abs(Math.sin(t * 20)) * 0.12 : 0);
        b.anchor.rotation.z = b.chopping > 0 ? Math.sin(t * 40) * 0.03 : 0;
      }
      for (const c of world.crates) c.group.scale.set(damp(c.group.scale.x, 1, 10, dt), damp(c.group.scale.y, 1, 10, dt), damp(c.group.scale.z, 1, 10, dt));
      for (const ck of cookers) {
        const v = ck.vis;
        if (ck.state === 'cooking') {
          ck.t += dt;
          ck.bar.group.visible = true; ck.bar.set(ck.t / COOK_T, 0xffb23a);
          ck.fxT -= dt;
          if (ck.fxT <= 0) { ck.fxT = 0.18; fx.particles.emit(ck.x + rand(-0.3, 0.3), CY + 1.0, ck.z + rand(-0.3, 0.3), rand(-0.15, 0.15), 1.3, rand(-0.15, 0.15), { life: 1.1, size: 0.5, color: 0xf2f2f2, gravity: -0.4 }); }
          v.group.position.y = v.baseY + Math.sin(t * 40) * 0.008;
          v.liquidMat.emissiveIntensity = 0.3 + Math.sin(t * 9) * 0.08;
          if (Math.random() < dt * 1.5) audio.sfx('sizzle', { vol: 0.12, rate: 1.4 });
          if (ck.t >= COOK_T) {
            ck.state = 'done'; ck.t = 0; refreshCooker(ck);
            audio.sfx('ding'); audio.sfx('bell', { vol: 0.35, rate: 1.6 }); popText('Klaar!', ck.x - 0.3, 3.3, ck.z, '#9aff9a', 1);
            fx.particles.burst(ck.x, CY + 1.0, ck.z, { count: 18, colors: [0xffe14a, 0xffffff, 0x9aff9a], speed: 3.5, up: 1.6, size: 0.28 });
          }
        } else if (ck.state === 'done') {
          ck.t += dt;
          const left = BURN_T - ck.t;
          ck.bar.group.visible = true;
          const warn = left < 2.8;
          ck.bar.set(left / BURN_T, warn ? 0xf05a4a : 0x6bd36b);
          v.liquidMat.emissiveIntensity = 0.5 + Math.sin(t * (warn ? 22 : 7)) * 0.3;
          ck.icon.forEach((s) => s.scale.setScalar(0.8 * (1 + Math.sin(t * (warn ? 18 : 6)) * 0.12)));
          ck.fxT -= dt;
          if (ck.fxT <= 0) { ck.fxT = warn ? 0.14 : 0.35; fx.particles.emit(ck.x + rand(-0.4, 0.4), CY + 1.0, ck.z + rand(-0.4, 0.4), rand(-0.3, 0.3), 2.2, rand(-0.3, 0.3), { life: 0.7, size: 0.22, color: warn ? 0xff9a6a : 0xffe14a, gravity: 1 }); }
          if (warn) { v.group.position.y = v.baseY + Math.sin(t * 50) * 0.015; const k = Math.floor(left * 2.5); if (k !== ck.warnT) { ck.warnT = k; audio.sfx('tick', { vol: 0.45, rate: 1.4 }); } }
          if (ck.t >= BURN_T) {
            ck.state = 'burning'; ck.t = 0; ck.ext = 0; burned++; refreshCooker(ck);
            audio.sfx('hurt', { vol: 0.5 }); ctx.shake(0.35); popText('AANGEBRAND!', ck.x - 0.5, 3.4, ck.z, '#ff7a3a', 1.2);
            fx.particles.burst(ck.x, CY + 1.0, ck.z, { count: 24, colors: [0x222222, 0x444444, 0xff7a1a], speed: 3, up: 1.6, size: 0.5 });
          }
        } else if (ck.state === 'burning') {
          ck.bar.group.visible = true; ck.bar.set(1 - ck.ext / EXT_T, 0x5ab8ff);
          v.group.position.y = v.baseY;
          ck.fxT -= dt;
          if (ck.fxT <= 0) { ck.fxT = 0.09; fx.particles.emit(ck.x + rand(-0.4, 0.4), CY + 1.4, ck.z + rand(-0.4, 0.4), rand(-0.3, 0.3), 2.0, rand(-0.3, 0.3), { life: 1.4, size: 0.7, color: 0x2a2a2a, gravity: -0.3 }); if (Math.random() < 0.4) fx.particles.emit(ck.x + rand(-0.3, 0.3), CY + 1.1, ck.z + rand(-0.3, 0.3), rand(-0.5, 0.5), 3, rand(-0.5, 0.5), { life: 0.6, size: 0.25, color: 0xff9a2a, gravity: 3 }); }
          if (Math.random() < dt * 2.5) audio.sfx('sizzle', { vol: 0.2, rate: 1.6 });
          v.fireParts.forEach((f) => { const s = 1 + Math.sin(t * 14 + f.ph) * 0.25; f.c.scale.set(1, s, 1); f.c.rotation.y = t * 3 + f.ph; });
          ck.icon.forEach((s) => s.scale.setScalar(0.85 * (1 + Math.sin(t * 12) * 0.1)));
          if (ck.ext >= EXT_T) {
            ck.state = 'empty'; ck.items = []; ck.dish = null; ck.ext = 0; ck.t = 0; refreshCooker(ck);
            audio.sfx('splash'); audio.sfx('sizzle', { vol: 0.5, rate: 0.6 });
            fx.particles.burst(ck.x, CY + 1.0, ck.z, { count: 26, colors: [0xdddddd, 0xffffff, 0x7ac8ff], speed: 3, up: 1.8, size: 0.55 });
            popText('Geblust!', ck.x - 0.3, 3.2, ck.z, '#7ac8ff', 1);
          }
        } else {
          ck.ext = 0; ck.bar.group.visible = false; v.group.position.y = v.baseY;
          if (ck.state === 'empty') ck.icon.forEach((s) => (s.visible = false));
        }
        if (ck.state !== 'burning') ck.ext = Math.max(0, ck.ext - dt * 0.5);
        if (ck.state === 'loading') ck.icon.forEach((s) => s.scale.setScalar(0.62));
        else if (ck.state === 'cooking') ck.icon.forEach((s) => s.scale.setScalar(0.8));
      }
      // schone borden komen terug
      for (let i = plateSt.returns.length - 1; i >= 0; i--) if (t >= plateSt.returns[i]) { plateSt.returns.splice(i, 1); plateSt.count = Math.min(7, plateSt.count + 1); world.plates.setCount(plateSt.count); audio.sfx('ding', { vol: 0.25, rate: 1.8 }); world.plates.group.scale.set(1.1, 0.9, 1.1); }
      world.plates.group.scale.set(damp(world.plates.group.scale.x, 1, 10, dt), damp(world.plates.group.scale.y, 1, 10, dt), damp(world.plates.group.scale.z, 1, 10, dt));
      if (bellT > 0) { bellT -= dt; if (bellT <= 0) world.bell.scale.setScalar(1); else world.bell.rotation.z = Math.sin(t * 60) * 0.25; } else world.bell.rotation.z = 0;
      if (trashLidT > 0) { trashLidT -= dt; if (trashLidT <= 0) world.trashLid.rotation.z = Math.PI / 2 - 0.2; }
      // vliegende borden
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i]; f.t += dt / 0.55; const k = Math.min(1, f.t);
        f.m.position.lerpVectors(f.from, f.to, k); f.m.position.y += Math.sin(k * Math.PI) * 1.6; f.m.rotation.y += dt * 10;
        if (k >= 1) { scene.remove(f.m); flyers.splice(i, 1); }
      }
      // schoorsteen + vonken
      smokeT -= dt;
      if (smokeT <= 0) { smokeT = 0.35; fx.particles.emit(8.9 + rand(-0.3, 0.3), 6.3, 0.6 + rand(-0.4, 0.4), rand(-0.3, -0.1), 1.2, rand(-0.2, 0.2), { life: 2.2, size: 0.8, color: 0x8a8480, gravity: -0.1 }); fx.particles.emit(7.9, 0.9, rand(-2.5, 3.2), rand(-0.2, 0.2), 1.6, 0, { life: 0.9, size: 0.12, color: 0xffa040, gravity: -0.2 }); }
    }

    // ================= hint-tekst (korte uitleg in het begin) =================
    let hintShown = '';
    function updateHint() {
      let msg = null;
      if (cookers.some((c) => c.state === 'burning')) msg = '🔥 Aangebrand! Ga erheen en houd <kbd>B</kbd> ingedrukt om te blussen';
      else if (t < 45 && !firstServed) {
        msg = ['Pak een ingrediënt uit een krat links (<kbd>A</kbd>) · leg het op een hakplank', 'Houd <kbd>B</kbd> ingedrukt bij de hakplank tot het gehakt is, pak het weer op (<kbd>A</kbd>)', 'Doe gehakt in de pot of pan (rechts) · geef het door via het midden-aanrecht!', 'Pak een bord, haal het gerecht uit de pot en lever het af bij het 🔔 luik!', 'Lever het gerecht af bij het 🔔 serveerluik!'][stage] || null;
      }
      if (msg !== hintShown) { hintShown = msg; hud.setHint(msg); }
    }

    // ================= update =================
    function ambient(dt) {
      world.update(t, dt);
      for (const p of pl) p.c.update(dt);
      updateWilma(dt);
    }
    function update(dt) {
      if (done) { ambient(dt); updateSeats(dt); return; }
      t += dt; timeLeft -= dt;
      if (!wrap.isConnected) { const he = document.getElementById('hud'); if (he) he.append(wrap); }
      // nieuwe bestellingen
      const prog = clamp((t - 15) / 75, 0, 1);
      if (t >= nextSpawn && timeLeft > 14) {
        const maxActive = t < 15 ? 2 : t < 55 ? 3 : 4;
        if (activeCount() < maxActive) {
          const free = seats.filter((s) => s.state === 'free');
          if (free.length) {
            const seat = t < 15 ? free.reduce((a, b) => (a.i < b.i ? a : b)) : pick(free);
            let recipe = chooseRecipe();
            if (t < 2) recipe = 'soep'; else if (t < 15) recipe = Math.random() < 0.6 ? 'broodje' : 'soep';
            const patience = t < 15 ? 85 : lerp(74, 50, prog) * (1.04 - ctx.difficulty * 0.04);
            spawnCustomer(seat, recipe, patience);
            nextSpawn = t + (t < 15 ? 11 : lerp(11, 7, prog) * rand(0.85, 1.15) / (0.92 + ctx.difficulty * 0.08));
          } else nextSpawn = t + 1;
        } else nextSpawn = t + 0.8;
      }
      updatePlayers(dt);
      updateStations(dt);
      updateSeats(dt);
      world.update(t, dt); updateWilma(dt);
      updateHint();
      // camera lichtjes volgen de spelers
      camSway = damp(camSway, ((pl[0].x + pl[1].x) / 2) * 0.1, 2, dt); placeCam();
      hud.setTimer(timeLeft, 15);
      hud.setScore(`Punten: ${score}   ·   Gerechten: ${served}`);
      if (timeLeft <= 0) finish();
    }
    function finish() {
      done = true; hud.setTimer(0); hud.setHint(null);
      for (const p of pl) { p.ring.visible = false; p.arrow.visible = false; }
      const stars = score >= STAR_PTS[2] ? 3 : score >= STAR_PTS[1] ? 2 : score >= STAR_PTS[0] ? 1 : 0;
      for (const p of pl) p.c.pose = stars ? 'cheer' : 'sad';
      wilmaReact(stars ? 'cheer' : 'sad', 99);
      for (const s of seats) if (s.state === 'waiting') s.c.pose = stars >= 2 ? 'cheer' : 'idle';
      for (const o of ordersAll) removeTicket(o);
      let txt = `Jullie serveerden <b>${served}</b> gerecht${served === 1 ? '' : 'en'}` + (tips ? ` en kregen <b>${tips}</b> fooi` : '') + `. `;
      if (failed) txt += `${failed} gast${failed === 1 ? '' : 'en'} wacht${failed === 1 ? '' : 'en'} te lang (-${failed * 3}). `;
      if (burned) txt += `Er brandde ${burned}× iets aan. `;
      if (handoffs) txt += `${handoffs}× doorgegeven via het midden-aanrecht. `;
      txt += `<br><b>${score} punten</b> (★ vanaf ${STAR_PTS[0]}, ★★ vanaf ${STAR_PTS[1]}, ★★★ vanaf ${STAR_PTS[2]}).`;
      ctx.finish({ stars, score, summary: txt, delay: 1100 });
    }

    // begin
    for (const ck of cookers) refreshCooker(ck);
    hud.setTimer(DURATION); hud.setScore('Punten: 0   ·   Gerechten: 0');
    hud.setPlayerInfo(0, '✋ handen vrij'); hud.setPlayerInfo(1, '✋ handen vrij');
    placeCam();

    const idle = (dt) => { ambient(dt); };
    return {
      update, dispose() { wrap.remove(); style.remove(); },
      introUpdate: idle, resultUpdate: (dt) => { ambient(dt); updateSeats(dt); },
      onResize,
      onStart() { hud.setScore('Punten: 0   ·   Gerechten: 0'); },
      // testhaakjes
      dbg: { pl, stations, seats, cookers, boards, slots, plateSt, hatch, obstacles, get state() { return { t, score, served, failed, burned, done, stage }; }, setHold, ordersAll, get nextSpawn() { return nextSpawn; }, set nextSpawn(v) { nextSpawn = v; }, collide: collideCircle },
    };
  },
};

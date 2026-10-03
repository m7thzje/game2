import * as THREE from 'three';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { h } from '../engine/util.js';
import { Character, brotherSpec, PLAYER_CSS, PLAYER_COLORS } from '../engine/chars.js';
import { CATS, CAT_ICON, catLabel, itemsFor, owns, equippedId, equip, buy, cosm } from '../engine/cosmetics.js';

// ============================================================================
// Hoedenmaker Hettie: winkel voor hoeden en kleuren, twee kolommen (Wes links, Jor rechts),
// elk met de eigen toetsen. Aanroepen: `await openShop(app, { onClose })`.
//   pijltjes omhoog/omlaag = kiezen · links/rechts = categorie · A = kopen/aantrekken · B = klaar · Esc = alles sluiten
// ============================================================================
const swatchStyle = (it) => it.fx === 'gold' ? 'linear-gradient(135deg,#fff3a0,#f2c230 45%,#b8860b)' : it.fx === 'rainbow' ? 'linear-gradient(90deg,#ff3b3b,#ff9a2a,#ffe53b,#4ad84a,#3ab4ff,#7a4aff,#e04aff)' : '#' + (it.c ?? 0x888888).toString(16).padStart(6, '0');

export function openShop(app, { onClose } = {}) {
  return new Promise((resolve) => {
    cosm();
    const st = [0, 1].map((i) => ({ cat: 0, sel: CATS.map((c) => Math.max(0, itemsFor(i, c).findIndex((x) => x.id === equippedId(i, c)))), done: false, msg: '', msgT: 0, cheer: 0 }));
    const itemOf = (i) => { const cat = CATS[st[i].cat]; return itemsFor(i, cat)[st[i].sel[st[i].cat]]; };

    // ---------- DOM ----------
    const coinEl = h('div', { class: 'shop-coins' }), warn = h('div', { class: 'shop-warn' }, '💡 Heitjes zijn ook nodig om nieuwe hallen in de Speelhal te laten bouwen!');
    const view = h('canvas', { class: 'shop-view', width: 960, height: 210 });
    const caps = [0, 1].map(() => h('div', { class: 'shop-cap' }));
    const cols = [0, 1].map((i) => {
      const tabs = h('div', { class: 'shop-tabs' }), list = h('div', { class: 'shop-list' }), msg = h('div', { class: 'shop-msg' }), done = h('div', { class: 'shop-done' }, '✔ Klaar!');
      const k = KEY_LABELS[i];
      const foot = h('div', { class: 'shop-foot', html: `<kbd>${k.move}</kbd> kiezen · <kbd>${k.a}</kbd> kopen/aantrekken · <kbd>${k.b}</kbd> klaar` });
      const el = h('div', { class: 'shop-col', style: { '--c': PLAYER_CSS[i] } }, h('h3', {}, S.names[i]), tabs, list, msg, foot, done);
      return { el, tabs, list, msg, done };
    });
    const card = h('div', { class: 'card shop' }, h('h2', {}, '👒 Hoedenmaker Hettie'), h('div', { class: 'shop-top' }, coinEl, warn), view, h('div', { class: 'shop-caps' }, ...caps), h('div', { class: 'shop-cols' }, cols[0].el, cols[1].el),
      h('div', { class: 'shop-bottom' }, h('div', { class: 'btn small', onClick: () => close() }, 'Klaar (Esc)')));
    const el = ui.overlay(card); el.style.overflow = 'auto';

    // ---------- 3D-voorbeeld (eigen kleine renderer, licht) ----------
    let rend = null, scene = null, cam = null, chars = [null, null], prevKey = ['', ''], rt = 0;
    try {
      rend = new THREE.WebGLRenderer({ canvas: view, antialias: true, alpha: true, preserveDrawingBuffer: true });
      rend.outputColorSpace = THREE.SRGBColorSpace; rend.toneMapping = THREE.ACESFilmicToneMapping; rend.toneMappingExposure = 1.05; rend.setPixelRatio(1); rend.setSize(960, 210, false); rend.setClearColor(0x000000, 0);
      scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(24, 960 / 210, 0.1, 50); cam.position.set(0, 1.05, 6.8); cam.lookAt(0, 1.05, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.7)); const dl = new THREE.DirectionalLight(0xffffff, 1.9); dl.position.set(2, 4, 5); scene.add(dl);
      for (let i = 0; i < 2; i++) {
        const x = i ? 2.9 : -2.9;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.7 })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.01, 0); scene.add(ring);
        chars[i] = new Character(brotherSpec(i)); chars[i].group.position.set(x, 0, 0); chars[i].targetYaw = chars[i].yaw = 0; scene.add(chars[i].group);
      }
    } catch (e) { console.warn('winkel-voorbeeld niet beschikbaar', e); rend = null; view.style.display = 'none'; }
    const syncPreview = () => {
      for (let i = 0; i < 2; i++) {
        const cat = CATS[st[i].cat], it = itemOf(i); const eq = { ...cosm().equipped[i], [cat]: it.id }; const key = JSON.stringify(eq);
        if (key !== prevKey[i]) { prevKey[i] = key; if (chars[i]) chars[i].restyle(brotherSpec(i, eq)); }
      }
    };

    // ---------- tekenen ----------
    const act = (i) => {
      const s = st[i], cat = CATS[s.cat], it = itemOf(i); if (!it) return;
      s.done = false;
      if (owns(i, cat, it.id)) {
        if (equippedId(i, cat) === it.id && it.id !== 'std') { equip(i, cat, 'std'); s.msg = 'Afgedaan.'; audio.sfx('click'); }
        else { equip(i, cat, it.id); s.msg = it.price ? 'Aangetrokken! Staat je goed!' : 'Aangetrokken!'; audio.sfx('select'); s.cheer = 0.9; }
      } else {
        const r = buy(i, cat, it.id);
        if (r.ok) { equip(i, cat, it.id); s.msg = `Gekocht voor ${it.price} heitjes! 🎉`; audio.sfx('coin'); audio.sfx('powerup'); s.cheer = 1.4; if (app?.mode?.onCoinsChanged) { try { app.mode.onCoinsChanged(); } catch (e) { /* hud niet beschikbaar */ } } }
        else { s.msg = `Te weinig heitjes! Nog ${r.need} nodig.`; audio.sfx('buzz'); }
      }
      s.msgT = 3; persist(); draw();
    };
    const draw = () => {
      coinEl.innerHTML = `🪙 <b>${S.coins}</b> heitjes`;
      for (let i = 0; i < 2; i++) {
        const s = st[i], col = cols[i], cat = CATS[s.cat], items = itemsFor(i, cat);
        col.tabs.innerHTML = '';
        CATS.forEach((c, ci) => col.tabs.append(h('div', { class: 'shop-tab' + (ci === s.cat ? ' sel' : ''), onClick: () => { s.cat = ci; s.done = false; audio.sfx('click'); draw(); } }, `${CAT_ICON[c]} ${catLabel(c, i)}`)));
        col.list.innerHTML = '';
        items.forEach((it, n) => {
          const wear = equippedId(i, cat) === it.id, own = owns(i, cat, it.id), poor = !own && S.coins < it.price;
          const sw = it.icon ? h('span', { class: 'shop-ic' }, it.icon) : h('span', { class: 'shop-sw', style: { background: swatchStyle(it) } });
          const status = wear ? h('span', { class: 'st wear' }, '★ gedragen') : own ? h('span', { class: 'st own' }, '✔ bezit') : h('span', { class: 'st price' + (poor ? ' poor' : '') }, `🪙 ${it.price}`);
          const row = h('div', { class: 'shop-row' + (n === s.sel[s.cat] ? ' sel' : '') + (wear ? ' wear' : ''), onMouseenter: () => { if (s.sel[s.cat] !== n) { s.sel[s.cat] = n; draw(); } }, onClick: () => { s.sel[s.cat] = n; act(i); } }, sw, h('span', { class: 'nm' }, it.name), status);
          col.list.append(row);
        });
        const selRow = col.list.children[s.sel[s.cat]];
        if (selRow) { if (selRow.offsetTop < col.list.scrollTop) col.list.scrollTop = selRow.offsetTop; else if (selRow.offsetTop + selRow.offsetHeight > col.list.scrollTop + col.list.clientHeight) col.list.scrollTop = selRow.offsetTop + selRow.offsetHeight - col.list.clientHeight; }
        col.msg.textContent = s.msgT > 0 ? s.msg : ''; col.done.style.display = s.done ? 'block' : 'none';
        const it = itemOf(i), own = owns(i, cat, it.id);
        caps[i].innerHTML = `<b style="color:${PLAYER_CSS[i]}">${S.names[i]}</b> ${own ? 'draagt' : 'past'}: ${it.icon || ''} ${it.name}${own ? '' : ` <span class="pr">(🪙 ${it.price})</span>`}`;
      }
      syncPreview();
    };
    draw();

    // ---------- besturing ----------
    let closed = false, t0 = 0.3, last = performance.now(), escPrev = input.pressed('Escape');
    const drv = { update() {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; rt += dt;
      if (closed) return;
      t0 -= dt;
      const esc = input.pressed('Escape'); const escEdge = esc && !escPrev; escPrev = esc;
      if (t0 <= 0) {
        for (let i = 0; i < 2; i++) {
          const p = input.p[i], s = st[i]; let ch = false;
          const n = itemsFor(i, CATS[s.cat]).length;
          if (p.upP) { s.sel[s.cat] = (s.sel[s.cat] + n - 1) % n; ch = true; }
          if (p.downP) { s.sel[s.cat] = (s.sel[s.cat] + 1) % n; ch = true; }
          if (p.leftP) { s.cat = (s.cat + CATS.length - 1) % CATS.length; ch = true; }
          if (p.rightP) { s.cat = (s.cat + 1) % CATS.length; ch = true; }
          if (ch) { s.done = false; audio.sfx('click'); draw(); }
          if (p.aP) act(i);
          if (p.bP) { s.done = !s.done; audio.sfx(s.done ? 'select' : 'click'); draw(); }
        }
        if (escEdge || (st[0].done && st[1].done)) { close(); return; }
      }
      for (let i = 0; i < 2; i++) { const s = st[i]; if (s.msgT > 0) { s.msgT -= dt; if (s.msgT <= 0) draw(); } if (s.cheer > 0) s.cheer -= dt; }
      if (rend) {
        chars.forEach((c, i) => { c.pose = st[i].cheer > 0 ? 'cheer' : 'idle'; c.targetYaw = Math.sin(rt * 0.9 + i * 1.7) * 0.55; c.update(dt); });
        rend.render(scene, cam);
      }
    } };
    ui.activeMenus.push(drv);

    function close() {
      if (closed) return; closed = true; persist();
      ui.activeMenus = ui.activeMenus.filter((m) => m !== drv); el.remove();
      if (rend) { chars.forEach((c) => c && c.group.traverse((o) => o.geometry && o.geometry.dispose())); rend.dispose(); rend.forceContextLoss(); }
      // alle getekende broers in de huidige modus bijwerken (dorp, Speelhal...)
      try { for (const p of app?.mode?.players || []) if (p.c && p.c.refreshBrother) p.c.refreshBrother(); } catch (e) { console.warn(e); }
      input.reset();
      try { onClose && onClose(); } catch (e) { console.warn(e); }
      resolve();
    }
  });
}

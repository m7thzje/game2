import { ui, Menu } from '../engine/ui.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { S, persist } from '../save.js';
import { h } from '../engine/util.js';
import { CSS } from './common.js';

// Menu dat alleen door de host (Wes, p[0]) bediend wordt: de gasten sturen ook toetsen en mogen deze dialoog niet verstellen.
class HostMenu extends Menu {
  update() {
    const p = input.p[0], it = this.items[this.sel];
    if (p.upP) { this.sel = (this.sel + this.items.length - 1) % this.items.length; this.refresh(); audio.sfx('click'); }
    if (p.downP) { this.sel = (this.sel + 1) % this.items.length; this.refresh(); audio.sfx('click'); }
    if (p.aP) this.activate(1);
    if (p.leftP && it.onSelect && it.cycle) { it.onSelect(-1); this.render(); audio.sfx('click'); }
    if (p.rightP && it.cycle) { it.onSelect(1); this.render(); audio.sfx('click'); }
  }
}

// Online spelen: jij bent de host (Wes); Jor (en eventueel Juul) doen mee op een eigen apparaat via een eigen link.
// onClose() wanneer de dialoog sluit (de host-sessie blijft gewoon doorlopen).
export function openOnline(app, onClose) {
  const host = app.net; let el;
  const statusEl = h('p', { style: { textAlign: 'center', fontWeight: 700, fontSize: '20px', margin: '6px 0' } }, 'Verbinding maken…');
  const codeEl = h('div', { style: { textAlign: 'center', fontSize: '54px', fontFamily: 'MedievalSharp,serif', letterSpacing: '6px', margin: '4px 0' } }, '······');
  const introEl = h('p', { style: { textAlign: 'center' } });
  const rowsEl = h('div', {});
  const warnEl = h('p', { class: 'small-note' }, '');
  const copied = {};            // spelers-id -> true na geslaagd kopiëren
  const copy = async (id) => {
    try { await navigator.clipboard.writeText(host.link(id)); copied[id] = true; setTimeout(() => { copied[id] = false; menu.render(); }, 3000); } catch (e) { copied[id] = false; }
  };
  const players3 = () => S.settings.players === 3;
  const info = () => host.guestInfo();
  const saved = ui.activeMenus.slice();    // andere (verborgen) menu's niet door gasten laten bedienen zolang deze dialoog open is
  const close = () => { off(); ui.activeMenus = saved; el.remove(); onClose && onClose(); };
  const setPlayers = (n) => { S.settings.players = n; persist(); host.refresh(); };
  const items = () => {
    const a = [{ label: () => (players3() ? "Met z'n drieën: Jor én Juul" : "Met z'n tweeën: alleen Jor"), sub: 'Links/rechts of Enter om te wisselen', cycle: true, onSelect: () => setPlayers(players3() ? 2 : 3) }];
    for (const g of info()) a.push({ label: () => (copied[g.id] ? `${g.name}-link gekopieerd ✓` : `${g.name}-link kopiëren`), onSelect: () => copy(g.id) });
    a.push({ label: () => { const gs = info(); return gs.every((g) => g.status === 'connected') ? 'Klaar — spelen maar!' : gs.some((g) => g.status === 'connected') ? 'Toch beginnen' : 'Terug'; }, onSelect: close });
    return a;
  };
  const menu = new HostMenu(items());
  const ICON = { connected: '✅', waiting: '⏳', lost: '⚠️', error: '⚠️' };
  const TXT = (g) => (g.status === 'connected' ? `${g.name} is verbonden${g.pingMs ? ' · ' + Math.round(g.pingMs) + ' ms' : ''}` : g.status === 'waiting' ? `Wachten tot ${g.name} meedoet…` : `${g.name} is weggevallen. Laat ${g.name === 'Jor' ? 'hem' : 'haar'} de link opnieuw openen.`);
  const render = () => {
    const gs = info();
    introEl.innerHTML = players3() ? 'Jij bent <b>Wes</b>. <b>Jor</b> en <b>Juul</b> spelen mee op hun eigen computer, elk met een eigen link.' : 'Jij bent <b>Wes</b>. Je broer speelt mee als <b>Jor</b> op zijn eigen computer.';
    const st = host.status;
    statusEl.textContent = st === 'error' ? '❌ Geen verbinding met de signaalserver. Heb je internet?' : st === 'starting' || st === 'idle' ? 'Verbinding maken…' : gs.every((g) => g.status === 'connected') ? (gs.length > 1 ? '✅ Iedereen is verbonden! Jullie kunnen nu samen spelen.' : '✅ Jor is verbonden! Jullie kunnen nu samen spelen.') : '';
    statusEl.style.display = statusEl.textContent ? '' : 'none';
    rowsEl.innerHTML = '';
    if (host.code) {
      codeEl.textContent = host.code;
      for (const g of gs) rowsEl.append(h('div', { style: { margin: '8px 0', textAlign: 'center' }, 'data-guest': g.id },
        h('div', { style: { fontWeight: 700, fontSize: '19px', color: CSS[g.id] }, 'data-st': g.status }, `${ICON[g.status] || '⏳'} ${TXT(g)}`),
        h('div', { style: { fontSize: '14px', wordBreak: 'break-all', background: 'rgba(255,255,255,.55)', borderRadius: '10px', padding: '6px 12px', margin: '4px 0', borderLeft: `6px solid ${CSS[g.id]}` } }, g.link)));
    }
    const loc = location.hostname; const many = gs.length > 1;
    warnEl.textContent = /^(localhost|127\.|192\.168\.|10\.|172\.)/.test(loc) ? `Let op: dit spel draait op jouw eigen computer. ${many ? 'Jor en Juul kunnen hun link' : 'Je broer kan de link'} alleen openen als ${many ? 'ze' : 'hij'} op hetzelfde netwerk ${many ? 'zitten' : 'zit'}. Zet het spel online (bijv. GitHub Pages, zie README) om over internet te spelen.` : `Stuur ${many ? 'Jor en Juul elk hun eigen link' : 'de link naar je broer'} (appen, mailen...). ${many ? 'Ze hoeven' : 'Hij hoeft'} niets te installeren: een computer met Chrome of Edge is genoeg.`;
    menu.items = items(); menu.sel = Math.min(menu.sel, menu.items.length - 1); menu.render();
  };
  const off = host.on(render);
  const card = h('div', { class: 'card', style: { width: 'min(680px,94vw)', maxHeight: '94vh', overflow: 'auto' } }, h('h2', {}, '🌐 Online spelen'), introEl, codeEl, statusEl, rowsEl, menu.el, warnEl);
  el = ui.overlay(card); ui.activeMenus = [menu]; render();
  host.start().then(render).catch((e) => { statusEl.style.display = ''; statusEl.textContent = '❌ ' + (e.message || 'Mislukt'); });
}

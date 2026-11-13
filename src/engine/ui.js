import { h, clamp } from './util.js';
import { input, KEY_LABELS, BASE_KEY_LABELS } from './input.js';
import { audio } from './audio.js';
import { PLAYER_CSS, BASE_CSS } from './chars.js';
import { S } from '../save.js';

const $ = (id) => document.getElementById(id);
export const ui = {
  hudEl: $('hud'), screens: $('screens'), fadeEl: $('fade'), vignette: $('vignette'),
  names: ['Wes', 'Jor', 'Juul', 'Sam'],
};
// Extra stijl voor de 3- en 4-spelers-HUD (css/style.css blijft ongemoeid): bij 3 staat het middelste vak onder de timer, bij 4 staan twee vakken onder de bovenhoeken (compact)
{
  const st = document.createElement('style');
  st.textContent = '.hud-top.three .pbox{min-width:150px;padding:6px 12px}.hud-top.three .hud-mid .pbox{min-width:140px;text-align:center;margin-top:2px}.card .ctrl.three{grid-template-columns:1fr 1fr 1fr}.card .ctrl.three>div{padding:8px 10px}.card .ctrl.three li{font-size:14px}.card.pvp .vs.three{gap:14px;font-size:28px;flex-wrap:wrap}@media (max-width:760px){.card .ctrl.three{grid-template-columns:1fr}}'
    + '.hud-top.four{align-items:flex-start}.hud-top.four .hud-col{display:flex;flex-direction:column;gap:6px}.hud-top.four .hud-col.r{align-items:flex-end}.hud-top.four .pbox{min-width:150px;padding:4px 10px;border-width:2px;border-radius:12px}.hud-top.four .pbox .n{font-size:16px}.hud-top.four .pbox .i{font-size:13px;min-height:16px}.hud-top.four .pbox .k{font-size:10px;margin-top:0}'
    + '.card .ctrl.four{grid-template-columns:repeat(4,1fr);gap:8px}.card .ctrl.four>div{padding:6px 8px}.card .ctrl.four h4{font-size:17px}.card .ctrl.four li{font-size:13px}.card .ready.four{flex-wrap:wrap;gap:8px}.card .ready.four>div{padding:5px 12px;font-size:16px}.card.pvp .places{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;font-size:24px;font-weight:700;margin:2px 0 8px}'
    + '@media (max-width:760px){.card .ctrl.four{grid-template-columns:1fr 1fr}.hud-top.four .pbox{min-width:105px}}';
  document.head.append(st);
}
// Hulpjes voor werelden en prompts (index = SPELERS-ID, niet slot): naam, kleur, toets-hint
ui.pName = (id) => ui.names[id] || ['Wes', 'Jor', 'Juul', 'Sam'][id];
ui.pColor = (id) => BASE_CSS[id];
ui.playerTag = (id) => `<b style="color:${BASE_CSS[id]}">${ui.pName(id)}</b>`;
ui.keyHtmlFor = (id, which) => `<kbd>${BASE_KEY_LABELS[id][which]}</kbd>`;
// Toetsen van alle spelers die meedoen, bijv. '<kbd>F</kbd> / <kbd>Enter</kbd>' (met <kbd>U</kbd> en <kbd>Num7</kbd> erbij bij 3 resp. 4 spelers)
const activeIds = () => [0, 1, 2, 3].slice(0, S.settings.players >= 4 ? 4 : S.settings.players === 3 ? 3 : 2);
ui.anyKeysHtml = (which = 'a', ids = activeIds()) => ids.map((id) => ui.keyHtmlFor(id, which)).join(' / ');
// Prompt per speler: ui.promptLine(0, 'F', 'praten') -> '<b style=...>Wes</b>: <kbd>F</kbd> praten' (id + knop 'a'|'b')
ui.promptLine = (id, which, text) => `${ui.playerTag(id)}: ${ui.keyHtmlFor(id, which)} ${text}`;


// ---------- fade ----------
ui.fade = (to = 1, ms = 450) => new Promise((res) => {
  ui.fadeEl.style.transition = `opacity ${ms}ms`;
  ui.fadeEl.style.opacity = String(to);
  setTimeout(res, ms);
});

// ---------- HUD ----------
const hud = {
  root: null, timerEl: null, scoreEl: null, pinfo: [null, null, null, null], hintEl: null, bigEl: null, promptEl: null, toastEl: null,
  slotIds: null,   // spelers-id per HUD-vak (null = alle actieve spelers: 2, 3 of 4 volgens S.settings.players)
  // De harness zet hier de deelnemers van het duel (bijv. [2, 0]); setSlots(null) herstelt de standaard
  setSlots(ids) { this.slotIds = ids ? ids.slice() : null; },
  ids() { return this.slotIds || activeIds(); },
  reset() {
    ui.hudEl.innerHTML = '';
    this.timerEl = h('div', { class: 'hud-timer', style: { display: 'none' } });
    this.scoreEl = h('div', { class: 'hud-score', style: { display: 'none' } });
    const ids = this.ids();
    this.pinfo = [null, null, null, null];
    // vak per slot: naam van de speler, kleur en toetsen van dat slot (PLAYER_CSS/KEY_LABELS zijn tijdens een spel slot-views)
    const mk = (slot) => {
      const k = KEY_LABELS[slot];
      const b = h('div', { class: 'pbox', 'data-slot': String(slot), style: { '--c': PLAYER_CSS[slot] } },
        h('div', { class: 'n' }, ui.names[ids[slot]]), h('div', { class: 'i' }), h('div', { class: 'k', html: `<kbd>${k.move}</kbd> <kbd>${k.a}</kbd> <kbd>${k.b}</kbd>` }));
      this.pinfo[slot] = b.querySelector('.i');
      return b;
    };
    const three = ids.length === 3, four = ids.length >= 4;
    const mid = h('div', { class: 'hud-mid' }, this.timerEl, this.scoreEl, three ? mk(1) : null);
    if (four) {   // slot 0 en 2 links boven elkaar, slot 1 en 3 rechts; timer in het midden
      const L = h('div', { class: 'hud-col' }, mk(0), mk(2)), R = h('div', { class: 'hud-col r' }, mk(1), mk(3));
      ui.hudEl.append(h('div', { class: 'hud-top four' }, L, mid, R));
    } else ui.hudEl.append(h('div', { class: 'hud-top' + (three ? ' three' : '') }, mk(0), mid, mk(three ? 2 : 1)));
    this.hintEl = h('div', { class: 'hud-hint', style: { display: 'none' } });
    ui.hudEl.append(this.hintEl);
    this.bigEl = null; this.promptEl = null;
  },
  clear() { ui.hudEl.innerHTML = ''; this.bigEl = this.promptEl = null; },
  setTimer(sec, low = 10) {
    if (sec == null) { this.timerEl.style.display = 'none'; return; }
    this.timerEl.style.display = 'block';
    const s = Math.max(0, Math.ceil(sec));
    const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (this.timerEl.textContent !== t) this.timerEl.textContent = t;
    this.timerEl.classList.toggle('low', sec <= low && sec > 0);
  },
  setScore(text) { if (text == null) { this.scoreEl.style.display = 'none'; return; } this.scoreEl.style.display = 'block'; if (this.scoreEl.textContent !== String(text)) this.scoreEl.textContent = text; },
  setPlayerInfo(i, text) { if (this.pinfo[i] && this.pinfo[i].textContent !== String(text)) this.pinfo[i].textContent = text; },
  setHint(text) { if (!text) { this.hintEl.style.display = 'none'; return; } this.hintEl.style.display = 'block'; this.hintEl.innerHTML = `<span>${text}</span>`; },
  showBig(text, ms = 900, color) {
    if (this.bigEl) this.bigEl.remove();
    const el = h('div', { class: 'hud-big' }, text); if (color) el.style.color = color;
    ui.hudEl.append(el); this.bigEl = el;
    clearTimeout(this._bigT); this._bigT = setTimeout(() => { el.remove(); if (this.bigEl === el) this.bigEl = null; }, ms);
  },
  toast(text, ms = 1800) {
    if (this.toastEl) this.toastEl.remove();
    const el = h('div', { class: 'hud-toast' }, text); ui.hudEl.append(el); this.toastEl = el;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { el.remove(); if (this.toastEl === el) this.toastEl = null; }, ms);
  },
  setPrompt(html) {
    if (!html) { if (this.promptEl) { this.promptEl.remove(); this.promptEl = null; this._ph = null; } return; }
    if (this._ph === html) return;
    this._ph = html;
    if (!this.promptEl) { this.promptEl = h('div', { class: 'hud-prompt' }); ui.hudEl.append(this.promptEl); }
    this.promptEl.innerHTML = html;
  },
};
ui.hud = hud;

// ---------- schermen ----------
ui.clearScreens = () => { ui.screens.innerHTML = ''; };
ui.overlay = (child, cls = '') => { const o = h('div', { class: 'overlay ' + cls }, child); ui.screens.append(o); return o; };
ui.keyHtml = (i, which) => `<kbd>${KEY_LABELS[i][which]}</kbd>`;

// Keyboard/mouse-bestuurbaar menu
export class Menu {
  constructor(items, { parent = ui.screens } = {}) {
    this.items = items; this.sel = 0; this.el = h('div', { class: 'btnrow' });
    this.render();
  }
  render() {
    this.el.innerHTML = '';
    this.btns = this.items.map((it, i) => {
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const b = h('div', { class: 'btn' + (i === this.sel ? ' sel' : ''), onClick: () => { this.sel = i; this.activate(0); }, onMouseenter: () => { this.sel = i; this.refresh(); } }, label);
      if (it.sub) b.append(h('small', {}, typeof it.sub === 'function' ? it.sub() : it.sub));
      this.el.append(b); return b;
    });
  }
  refresh() { this.btns.forEach((b, i) => b.classList.toggle('sel', i === this.sel)); }
  activate(dir) { const it = this.items[this.sel]; if (it.onSelect) it.onSelect(dir); audio.sfx('select'); this.render(); }
  update() {
    for (const p of input.all) {   // alle spelers mogen menu's bedienen (staat 2 is nul bij 2 spelers)
      if (p.upP) { this.sel = (this.sel + this.items.length - 1) % this.items.length; this.refresh(); audio.sfx('click'); }
      if (p.downP) { this.sel = (this.sel + 1) % this.items.length; this.refresh(); audio.sfx('click'); }
      if (p.aP) this.activate(1);
      if (p.leftP && this.items[this.sel].onSelect && this.items[this.sel].cycle) { this.items[this.sel].onSelect(-1); this.render(); audio.sfx('click'); }
      if (p.rightP && this.items[this.sel].cycle) { this.items[this.sel].onSelect(1); this.render(); audio.sfx('click'); }
    }
  }
}

// ---------- Dialoog (typemachine) ----------
// ui.say([{who:'Bakker Bram', text:'...'}, ...], {creepy:false}) -> Promise. Doorgaan met A (beide spelers).
let dlg = null;
ui.say = (lines, { creepy = false, speed = 38 } = {}) => new Promise((resolve) => {
  if (dlg) dlg.finish();
  if (!Array.isArray(lines)) lines = [lines];
  const who = h('div', { class: 'who' }), txt = h('div', { class: 'txt' }), nx = h('div', { class: 'nx', html: '▶ ' + ui.anyKeysHtml('a') });
  const el = h('div', { class: 'dialog' + (creepy ? ' creepy' : '') }, who, txt, nx);
  ui.screens.append(el);
  let idx = -1, pos = 0, full = '', done = true, t = 0;
  const next = () => {
    idx++;
    if (idx >= lines.length) { finish(); return; }
    const L = lines[idx]; who.textContent = L.who || ''; who.style.display = L.who ? 'block' : 'none';
    full = L.text; pos = 0; done = false; txt.textContent = '';
    el.classList.toggle('creepy', creepy || !!L.creepy);
    if (L.sfx) audio.sfx(L.sfx);
    if (L.onShow) L.onShow();
  };
  const finish = () => { el.remove(); dlg = null; resolve(); };
  dlg = { finish, update(dt) {
    if (!done) {
      t += dt * speed; const n = Math.floor(t);
      if (n > pos) { pos = Math.min(full.length, n); txt.textContent = full.slice(0, pos); if (pos % 3 === 0) audio.sfx('tick', { vol: 0.4, rate: 0.8 + Math.random() * 0.3 }); }
      if (pos >= full.length) done = true;
    }
    if (input.anyA()) {
      if (!done) { pos = full.length; txt.textContent = full; done = true; t = full.length; } else { t = 0; next(); }
    }
  } };
  next();
});
ui.activeMenus = [];
ui.update = (dt) => { if (dlg) dlg.update(dt); for (const m of ui.activeMenus) m.update(); };
ui.dialogActive = () => !!dlg;

// ---------- flash / schermschud ----------
ui.flash = (color = '#fff', ms = 200) => {
  const el = h('div', { style: { position: 'absolute', inset: 0, background: color, opacity: 0.85, transition: `opacity ${ms}ms`, pointerEvents: 'none', zIndex: 45 } });
  ui.screens.append(el); requestAnimationFrame(() => { el.style.opacity = 0; }); setTimeout(() => el.remove(), ms + 50);
};
ui.setVignette = (v) => { ui.vignette.style.opacity = String(clamp(v, 0, 1)); };

ui.Menu = Menu;

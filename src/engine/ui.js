import { h, clamp } from './util.js';
import { input, KEY_LABELS } from './input.js';
import { audio } from './audio.js';
import { PLAYER_CSS } from './chars.js';

const $ = (id) => document.getElementById(id);
export const ui = {
  hudEl: $('hud'), screens: $('screens'), fadeEl: $('fade'), vignette: $('vignette'),
  names: ['Daan', 'Sem'],
};

// ---------- fade ----------
ui.fade = (to = 1, ms = 450) => new Promise((res) => {
  ui.fadeEl.style.transition = `opacity ${ms}ms`;
  ui.fadeEl.style.opacity = String(to);
  setTimeout(res, ms);
});

// ---------- HUD ----------
const hud = {
  root: null, timerEl: null, scoreEl: null, pinfo: [null, null], hintEl: null, bigEl: null, promptEl: null, toastEl: null,
  reset() {
    ui.hudEl.innerHTML = '';
    this.timerEl = h('div', { class: 'hud-timer', style: { display: 'none' } });
    this.scoreEl = h('div', { class: 'hud-score', style: { display: 'none' } });
    const mk = (i) => {
      const k = KEY_LABELS[i];
      const b = h('div', { class: 'pbox', style: { '--c': PLAYER_CSS[i] } },
        h('div', { class: 'n' }, ui.names[i]), h('div', { class: 'i' }), h('div', { class: 'k', html: `<kbd>${k.move}</kbd> <kbd>${k.a}</kbd> <kbd>${k.b}</kbd>` }));
      this.pinfo[i] = b.querySelector('.i');
      return b;
    };
    ui.hudEl.append(h('div', { class: 'hud-top' }, mk(0), h('div', { class: 'hud-mid' }, this.timerEl, this.scoreEl), mk(1)));
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
    for (const p of input.p) {
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
  const who = h('div', { class: 'who' }), txt = h('div', { class: 'txt' }), nx = h('div', { class: 'nx', html: '▶ <kbd>F</kbd> / <kbd>Enter</kbd>' });
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
    if (input.p[0].aP || input.p[1].aP) {
      if (!done) { pos = full.length; txt.textContent = full; done = true; t = full.length; } else { t = 0; next(); }
    }
  } };
  next();
});
ui.update = (dt) => { if (dlg) dlg.update(dt); };
ui.dialogActive = () => !!dlg;

// ---------- flash / schermschud ----------
ui.flash = (color = '#fff', ms = 200) => {
  const el = h('div', { style: { position: 'absolute', inset: 0, background: color, opacity: 0.85, transition: `opacity ${ms}ms`, pointerEvents: 'none', zIndex: 45 } });
  ui.screens.append(el); requestAnimationFrame(() => { el.style.opacity = 0; }); setTimeout(() => el.remove(), ms + 50);
};
ui.setVignette = (v) => { ui.vignette.style.opacity = String(clamp(v, 0, 1)); };

ui.Menu = Menu;

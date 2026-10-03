// FEESTBORD: DOM-onderdelen (HUD, keuzemenu voor de speler aan de beurt, bijschriften). Eigen CSS wordt hier ingespoten.
import { h } from '../engine/util.js';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { PLAYER_CSS } from '../engine/chars.js';
import { S } from '../save.js';
import { ITEMS, CFG, trophyPrice } from './board_data.js';

// spelers-id's die meedoen en hun invoerstaten (input.all = altijd 3; terugval op input.p)
export const pids = () => (S.settings.players === 3 ? [0, 1, 2] : [0, 1]);
export const PI = () => input.all || input.p;
// CSS-variabele --c zetten (h() met style-object kan geen eigen variabelen zetten)
export const cvar = (el, c) => { el.style.setProperty('--c', c); return el; };
export const PNAMES = ['Wes', 'Jor', 'Juul'];
export const pcss = (i) => PLAYER_CSS[i] || '#ff9a4a';
export const klabel = (i) => KEY_LABELS[i] || { move: 'IJKL', a: 'U', b: 'O' };

const CSS = `
.bd-hud{position:absolute;inset:0;pointer-events:none;font-family:'Fredoka',system-ui,sans-serif}
.bd-top{position:absolute;top:10px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.bd-p{min-width:200px;padding:7px 14px 8px;border-radius:16px;background:rgba(30,16,60,.68);border:3px solid var(--c);backdrop-filter:blur(3px);box-shadow:0 4px 0 rgba(0,0,0,.35);transition:transform .25s,box-shadow .25s}
.bd-p.act{transform:scale(1.07);box-shadow:0 0 0 3px #fff,0 0 22px var(--c),0 4px 0 rgba(0,0,0,.35)}
.bd-p .n{font-weight:700;font-size:21px;color:var(--c);display:flex;justify-content:space-between;gap:10px}
.bd-p .n i{font-style:normal;font-size:13px;opacity:.85;color:#fff;font-weight:400;align-self:center}
.bd-p .st{font-size:23px;font-weight:700;display:flex;gap:14px;align-items:center}
.bd-p .pr{font-size:12px;font-weight:400;opacity:.7;margin-left:auto}.bd-p .pr.disc{opacity:1;color:#ffe14a;font-weight:700}
.bd-p .it{font-size:22px;min-height:28px;letter-spacing:2px}
.bd-p .it b{display:inline-block;margin-right:4px;padding:0 4px;border-radius:8px;background:rgba(255,255,255,.14);font-weight:400}
.bd-mid{display:flex;flex-direction:column;align-items:center;gap:5px;margin-top:2px}
.bd-round{font-family:'MedievalSharp',serif;font-size:34px;line-height:1;padding:4px 20px;background:rgba(30,16,60,.7);border-radius:16px;border:3px solid var(--gold);text-shadow:0 3px 0 #000}
.bd-turn{font-size:19px;font-weight:600;padding:2px 14px;border-radius:12px;background:rgba(30,16,60,.7);text-shadow:0 2px 0 #000}
.bd-bar{width:200px;height:10px;border-radius:6px;background:rgba(0,0,0,.45);overflow:hidden;border:2px solid #000}
.bd-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffcf3a,#ff5ab0);transition:width .5s}
.bd-hint{position:absolute;left:0;right:0;bottom:12px;text-align:center;pointer-events:none}
.bd-hint span{display:inline-block;max-width:min(960px,92vw);font-size:17px;background:rgba(30,16,60,.78);padding:6px 16px;border-radius:14px;border:2px solid rgba(255,255,255,.25);text-shadow:0 2px 0 #000}
.bd-hint kbd{margin:0 2px}
.bd-cap{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(780px,94vw);padding:14px 26px 16px;border-radius:20px;background:linear-gradient(180deg,#fff7dc,#f1d89a);color:#2c1a0c;border:5px solid #5b3a1e;box-shadow:0 0 0 3px #ffcf3a,0 8px 0 rgba(0,0,0,.4);pointer-events:auto;animation:bdpop .25s ease-out}
.bd-cap .t{font-family:'MedievalSharp',serif;font-size:28px;line-height:1.1;display:flex;gap:10px;align-items:center}
.bd-cap .t .ic{font-size:36px}
.bd-cap .x{font-size:21px;line-height:1.35;margin-top:4px}
.bd-cap .nx{position:absolute;right:16px;bottom:6px;font-size:13px;opacity:.6}
@keyframes bdpop{from{transform:translateX(-50%) scale(.85);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
.bd-choose{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(560px,94vw);max-height:70vh;overflow:auto;padding:14px 22px 12px;border-radius:20px;background:linear-gradient(180deg,#fff7dc,#f1d89a);color:#2c1a0c;border:5px solid #5b3a1e;box-shadow:0 0 0 3px var(--c,#ffcf3a),0 8px 0 rgba(0,0,0,.4);pointer-events:auto;animation:bdpop .25s ease-out}
.bd-choose h3{font-family:'MedievalSharp',serif;font-weight:400;font-size:27px;text-align:center}
.bd-choose p{text-align:center;font-size:17px;margin:2px 0 4px}
.bd-choose .btnrow{margin-top:5px;gap:5px}
.bd-choose .btn{font-size:19px;padding:5px 14px;border-width:3px}
.bd-choose .btn.dis{opacity:.45;filter:grayscale(.6)}
.bd-pop{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);font-family:'MedievalSharp',serif;font-size:min(10vw,84px);text-shadow:0 6px 0 #000,0 0 28px rgba(255,200,60,.7);pointer-events:none;animation:bdbig 1.4s ease-out forwards;white-space:nowrap}
@keyframes bdbig{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}15%{transform:translate(-50%,-50%) scale(1.15);opacity:1}30%{transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{transform:translate(-50%,-70%) scale(1);opacity:0}}
.card.bd-card{width:min(860px,95vw);padding:12px 24px 14px}
.bd-card h2{font-size:30px;margin-bottom:0}
.bd-card p{font-size:16px;margin:4px 0}
.bd-keys{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:15px;margin:6px 0}
.bd-keys div{background:rgba(255,255,255,.4);border-radius:12px;padding:5px 10px;border-left:6px solid var(--c);line-height:1.5}
.bd-legend{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 12px;margin:6px 0;font-size:14px;line-height:1.15}
.bd-legend div{display:flex;gap:8px;align-items:center}.bd-legend span{font-size:22px;min-width:28px;text-align:center}.bd-legend small{opacity:.8;font-size:12.5px}
.bd-grid .btnrow{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:6px}
.bd-grid .btn{width:calc(50% - 8px);font-size:20px;padding:7px 10px}
.bd-score{display:grid;grid-template-columns:1fr auto 1fr;gap:2px 20px;align-items:center;font-size:30px;font-weight:700;margin:4px 0;text-align:center}
.bd-score .l{font-size:17px;font-weight:600;opacity:.8}
.bd-score .n{font-size:20px;color:#1d9a52}.bd-score .n.b{color:#2f6fe0}
.bd-hud.n3 .bd-top{flex-wrap:wrap;justify-content:space-between}
.bd-hud.n3 .bd-p{min-width:0;width:calc(33% - 14px);padding:5px 10px 6px;border-radius:14px}
.bd-hud.n3 .bd-p .n{font-size:18px}.bd-hud.n3 .bd-p .n i{display:none}
.bd-hud.n3 .bd-p .st{font-size:19px;gap:10px}
.bd-hud.n3 .bd-p .it{font-size:18px;min-height:24px}
.bd-hud.n3 .bd-mid{position:absolute;left:50%;top:106px;transform:translateX(-50%);flex-direction:row;gap:8px;align-items:center;margin:0;white-space:nowrap}
.bd-hud.n3 .bd-round{font-size:22px;padding:2px 14px}.bd-hud.n3 .bd-turn{font-size:16px}.bd-hud.n3 .bd-bar{width:110px}
.bd-p .crown{margin-left:6px}
.bd-pred{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(640px,94vw);padding:12px 20px 14px;border-radius:20px;background:linear-gradient(180deg,#fff7dc,#f1d89a);color:#2c1a0c;border:5px solid #5b3a1e;box-shadow:0 0 0 3px var(--c,#ffcf3a),0 8px 0 rgba(0,0,0,.4);pointer-events:auto;animation:bdpop .25s ease-out;text-align:center}
.bd-pred h3{font-family:'MedievalSharp',serif;font-weight:400;font-size:25px}
.bd-pred p{font-size:15px;margin:2px 0 6px}
.bd-pred .bdp-row{display:flex;gap:14px;justify-content:center}
.bd-pred .bdp-opt{flex:1;border-radius:14px;padding:8px 6px;border:4px solid var(--c);background:rgba(255,255,255,.55);font-size:22px;font-weight:700;color:var(--c);cursor:pointer;transition:transform .15s}
.bd-pred .bdp-opt small{display:block;font-size:13px;font-weight:400;color:#2c1a0c;opacity:.8}
.bd-pred .bdp-opt.on{transform:scale(1.07);background:var(--c);color:#fff;box-shadow:0 0 0 3px #fff,0 0 14px var(--c)}
.bd-pred .bdp-opt.on small{color:#fff}
.bd-pred .bdp-tm{height:8px;border-radius:5px;background:rgba(0,0,0,.25);margin-top:9px;overflow:hidden}.bd-pred .bdp-tm i{display:block;height:100%;background:linear-gradient(90deg,#ffcf3a,#ff5ab0);width:100%}
.bd-score3{display:grid;grid-template-columns:repeat(4,auto);gap:3px 22px;align-items:center;justify-content:center;font-size:28px;font-weight:700;margin:4px 0;text-align:center}
.bd-score3 .l{font-size:17px;font-weight:600;opacity:.8;text-align:right}
.bd-score3 .nm{font-size:20px}
.bd-keys.k3{grid-template-columns:1fr 1fr 1fr;font-size:13.5px}
.bd-big{font-size:48px;text-align:center;line-height:1.1}
.bd-win{display:flex;gap:12px;align-items:center;justify-content:center;font-family:'MedievalSharp',serif;font-size:30px;margin:2px 0}
.bd-win span{font-size:42px}
`;
export function injectCss() { if (document.getElementById('board-css')) return; const s = document.createElement('style'); s.id = 'board-css'; s.textContent = CSS; document.head.append(s); }

// ---------------------------------------------------------------- HUD
export class BoardHud {
  constructor(n = 2) {
    this.n = n; this.root = h('div', { class: 'bd-hud' + (n === 3 ? ' n3' : '') }); this.sig = '';
    this.pEl = Array.from({ length: n }, (_, i) => cvar(h('div', { class: 'bd-p' }), pcss(i)));
    this.round = h('div', { class: 'bd-round' }); this.turn = h('div', { class: 'bd-turn' }); this.bar = h('div', { class: 'bd-bar' }, h('i'));
    this.hint = h('div', { class: 'bd-hint' }); this.capEl = null;
    const mid = h('div', { class: 'bd-mid' }, this.round, this.turn, this.bar);
    this.root.append(n === 3 ? h('div', { class: 'bd-top' }, ...this.pEl, mid) : h('div', { class: 'bd-top' }, this.pEl[0], mid, this.pEl[1]), this.hint);
    this.root.style.visibility = 'hidden'; ui.hudEl.innerHTML = ''; ui.hudEl.append(this.root);
  }
  show() { this.root.style.visibility = ''; }
  update(B, active) {
    const sig = JSON.stringify([B.round, B.rounds, active, B.players.map((p) => [p.coins, p.trophies, p.items, p.shield])]); if (sig === this.sig) return; this.sig = sig;
    B.players.forEach((p, i) => {
      const e = this.pEl[i]; e.className = 'bd-p' + (active === i ? ' act' : '');
      e.innerHTML = `<div class="n">${PNAMES[i]}<i>${klabel(i).a} dobbel · ${klabel(i).b} item</i></div><div class="st"><span>🪙 ${p.coins}</span><span>🏆 ${p.trophies}</span><span class="pr${trophyPrice(B, i) < CFG.trophyPrice ? ' disc' : ''}">Trofee ${trophyPrice(B, i)}🪙</span></div><div class="it">${p.shield ? '<b>🛡️</b>' : ''}${p.items.map((id) => `<b>${ITEMS[id].icon}</b>`).join('') || '<span style="opacity:.4;font-size:14px">geen items</span>'}</div>`;
    });
    this.round.textContent = `Ronde ${Math.min(B.round, B.rounds)} / ${B.rounds}`;
    this.bar.firstChild.style.width = `${Math.round(((B.round - 1 + (B.phase === 'turn' ? B.turn / (B.players.length + 0.5) : 0.8)) / B.rounds) * 100)}%`;
    this.turn.textContent = active == null ? '' : `${PNAMES[active]} is aan de beurt`; this.turn.style.color = active == null ? '' : pcss(active);
  }
  setHint(html) { this.hint.innerHTML = html ? `<span>${html}</span>` : ''; }
  pop(text, color = '#ffe14a') { const e = h('div', { class: 'bd-pop', style: { color } }, text); this.root.append(e); setTimeout(() => e.remove(), 1500); }
  caption(title, text, icon = '', color) {
    this.clearCaption();
    const e = h('div', { class: 'bd-cap', style: color ? { borderColor: color } : {} }, h('div', { class: 't' }, icon ? h('span', { class: 'ic' }, icon) : null, title), h('div', { class: 'x', html: text }), h('div', { class: 'nx' }, '▶ doorgaan: F / Enter'));
    this.root.append(e); this.capEl = e; return e;
  }
  clearCaption() { if (this.capEl) { this.capEl.remove(); this.capEl = null; } }
  dispose() { this.root.remove(); }
}

// ---------------------------------------------------------------- keuzemenu
// options: [{label, sub, disabled, cycle:(dir)=>void}]  who: 0|1 (alleen die speler) of -1 (beide)
// Besturing: omhoog/omlaag kiest, A bevestigt, links/rechts verandert een draai-optie, B = annuleren (als cancel gezet is)
export class Chooser {
  constructor({ who = -1, title = '', sub = '', options = [], cancel = null, host = null, plain = false } = {}) {
    this.who = who; this.options = options; this.cancel = cancel; this.sel = Math.max(0, options.findIndex((o) => !o.disabled)); this.t = 0.18; this.done = false;
    this.list = h('div', { class: 'btnrow' });
    this.el = plain ? h('div', {}, this.list) : cvar(h('div', { class: 'bd-choose' }, h('h3', {}, title), sub ? h('p', { html: sub }) : null, this.list), who >= 0 ? pcss(who) : '#ffcf3a');
    this.render();
    this.promise = new Promise((res) => { this.resolve = res; });
    (host || ui.hudEl).append(this.el);
  }
  render() {
    this.list.innerHTML = '';
    this.btns = this.options.map((o, i) => {
      const lab = typeof o.label === 'function' ? o.label() : o.label; const sub = typeof o.sub === 'function' ? o.sub() : o.sub;
      const b = h('div', { class: 'btn' + (i === this.sel ? ' sel' : '') + (o.disabled ? ' dis' : ''), onClick: () => { this.sel = i; this.pick(1); }, onMouseenter: () => { this.sel = i; this.refresh(); } }, lab);
      if (sub) b.append(h('small', {}, sub)); this.list.append(b); return b;
    });
  }
  refresh() { this.btns.forEach((b, i) => b.classList.toggle('sel', i === this.sel)); }
  pick(dir) {
    if (this.done) return; const o = this.options[this.sel]; if (!o || o.disabled) { audio.sfx('miss'); return; }
    if (o.cycle) { o.cycle(dir || 1); audio.sfx('click'); this.render(); return; }
    this.finish(this.sel);
  }
  finish(i) { if (this.done) return; this.done = true; audio.sfx('select'); this.el.remove(); this.resolve(i); }
  update(dt) {
    if (this.done) return; this.t -= dt; if (this.t > 0) return;
    for (const w of (this.who >= 0 ? [this.who] : pids())) {
      const p = PI()[w]; if (!p) continue;
      if (p.upP || p.downP) { const d = p.downP ? 1 : -1; const n = this.options.length; let k = this.sel; for (let s = 0; s < n; s++) { k = (k + d + n) % n; if (!this.options[k].disabled) break; } this.sel = k; this.refresh(); audio.sfx('click'); }
      if ((p.leftP || p.rightP) && this.options[this.sel].cycle) { this.options[this.sel].cycle(p.rightP ? 1 : -1); audio.sfx('click'); this.render(); }
      if (p.aP) this.pick(1);
      else if (p.bP && this.cancel != null) { this.finish(this.cancel); }
    }
  }
  dispose() { this.done = true; this.el.remove(); }
}

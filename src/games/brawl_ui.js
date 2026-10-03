import { h } from '../engine/util.js';
import { ui } from '../engine/ui.js';
import { PLAYER_CSS } from '../engine/chars.js';
import { FT, FT_IDS } from './brawl_data.js';

// DOM-onderdelen van "Smash-Arena": de vechter-keuze (met uitleg per vechter) en de super-meters.
const CSS = `
.bw-sel{position:absolute;inset:0;pointer-events:none}
.bw-panel{position:absolute;top:106px;width:296px;box-sizing:border-box;background:rgba(22,12,38,.84);border:3px solid var(--c);border-radius:16px;padding:8px 11px 9px;color:#fff;box-shadow:0 6px 22px rgba(0,0,0,.5);transition:transform .15s}
.bw-panel.ok{box-shadow:0 0 0 3px rgba(120,255,160,.7),0 6px 22px rgba(0,0,0,.5)}
.bw-panel.l{left:12px}.bw-panel.r{right:12px}
.bw-hd{display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:700;margin-bottom:6px}
.bw-hd .who{color:var(--c);text-shadow:0 2px 0 #000;font-size:18px}
.bw-hd .st{font-size:12px;opacity:.85}.bw-panel.ok .st{color:#8dffb0;opacity:1}
.bw-tiles{display:flex;gap:6px;margin-bottom:7px}
.bw-tile{flex:1;height:60px;border-radius:10px;background:rgba(255,255,255,.08);border:3px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:27px;line-height:1;position:relative;transition:transform .12s}
.bw-tile small{font-size:10px;margin-top:3px;opacity:.85}
.bw-tile.sel{border-color:var(--c);background:rgba(255,255,255,.2);transform:translateY(-3px) scale(1.07)}
.bw-panel.ok .bw-tile.sel::after{content:'✔';position:absolute;right:-6px;top:-8px;font-size:15px;background:#2fbf5f;border-radius:50%;width:20px;height:20px;line-height:20px;text-align:center}
.bw-nm{font-size:19px;font-weight:700;line-height:1.1}.bw-bl{font-size:12px;opacity:.9;margin:2px 0 5px;line-height:1.2}
.bw-bars{display:grid;grid-template-columns:1fr 1fr;gap:1px 10px;font-size:11px;margin-bottom:5px}
.bw-bar{display:flex;justify-content:space-between;align-items:center}.bw-pip{display:inline-block;width:9px;height:9px;border-radius:3px;background:rgba(255,255,255,.18);margin-left:2px}.bw-pip.on{background:var(--fc)}
.bw-tips{margin:0;padding:0;list-style:none;font-size:12px;line-height:1.28}.bw-tips li{margin-bottom:2px}.bw-tips b{color:#ffe14a}
.bw-stage{position:absolute;left:50%;top:106px;transform:translateX(-50%);background:rgba(22,12,38,.84);border:2px solid var(--gold,#e8c24a);border-radius:14px;padding:5px 16px;color:#fff;font-size:15px;white-space:nowrap;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.bw-stage b{color:#ffe14a}.bw-stage small{display:block;font-size:11px;opacity:.85;margin-top:1px}
.bw-hint{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);background:rgba(22,12,38,.84);border-radius:12px;padding:5px 14px;color:#fff;font-size:14px}
.bw-hint kbd{font-size:12px}
.bw-meter{position:absolute;bottom:12px;width:250px;height:34px;box-sizing:border-box;border-radius:12px;background:rgba(22,12,38,.8);border:3px solid var(--c);overflow:hidden;color:#fff;font-size:14px;font-weight:700;text-shadow:0 2px 0 #000;pointer-events:none}
.bw-meter.l{left:14px}.bw-meter.r{right:14px}
.bw-meter i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#ff9a3a,#ffe14a);transition:width .12s}
.bw-meter span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.bw-meter.full{animation:bwpulse .45s infinite alternate;border-color:#ffe14a}.bw-meter.full i{background:linear-gradient(90deg,#ff4a8a,#ffe14a,#4ad8ff)}
@keyframes bwpulse{from{transform:scale(1)}to{transform:scale(1.06);box-shadow:0 0 18px #ffe14a}}
@media (max-width:980px){.bw-panel{width:250px;padding:6px 8px}.bw-tips{font-size:11px}.bw-bl{font-size:11px}.bw-tile{height:52px;font-size:23px}.bw-tile small{display:none}.bw-meter{width:200px}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('bw-css')) return;
  const st = document.createElement('style'); st.id = 'bw-css'; st.textContent = CSS; document.head.append(st); cssDone = true;
}

// ----- vechter-keuze -----
export class SelectUI {
  constructor(names, stage, keyLabels) {
    ensureCss();
    this.names = names; this.el = h('div', { class: 'bw-sel' }); this.panels = [];
    this.el.append(h('div', { class: 'bw-stage', html: `${stage.icon} Podium: <b>${stage.name}</b><small>${stage.blurb}</small>` }));
    for (let i = 0; i < 2; i++) {
      const p = h('div', { class: `bw-panel ${i ? 'r' : 'l'}`, style: { '--c': PLAYER_CSS[i] } });
      const hd = h('div', { class: 'bw-hd' }, h('span', { class: 'who' }, names[i]), h('span', { class: 'st' }, '◀ ▶ kiezen'));
      const tiles = h('div', { class: 'bw-tiles' }, ...FT_IDS.map((id) => h('div', { class: 'bw-tile' }, FT[id].icon, h('small', {}, FT[id].name.split('vechter')[0]))));
      const det = h('div', { class: 'bw-det' });
      p.append(hd, tiles, det); this.el.append(p);
      this.panels.push({ p, st: hd.querySelector('.st'), tiles: [...tiles.children], det, last: '' });
    }
    this.hint = h('div', { class: 'bw-hint', html: `<kbd>${keyLabels[0].a}</kbd> / <kbd>${keyLabels[1].a}</kbd> = deze vechter!` });
    this.el.append(this.hint);
    ui.hudEl.append(this.el);
  }
  update(sel) {
    for (let i = 0; i < 2; i++) {
      const P = this.panels[i], s = sel[i], ft = FT[FT_IDS[s.idx]];
      P.p.classList.toggle('ok', s.ok);
      P.st.textContent = s.ok ? '✔ KLAAR!' : '◀ ▶ kiezen, A = klaar';
      P.tiles.forEach((t, k) => t.classList.toggle('sel', k === s.idx));
      if (P.last !== ft.id) {
        P.last = ft.id; P.det.style.setProperty('--fc', ft.css);
        P.det.innerHTML = `<div class="bw-nm">${ft.icon} ${ft.name}</div><div class="bw-bl">${ft.blurb}</div>`
          + `<div class="bw-bars">${Object.entries(ft.bars).map(([k, v]) => `<div class="bw-bar"><span>${k}</span><span>${[1, 2, 3, 4, 5].map((n) => `<i class="bw-pip${n <= v ? ' on' : ''}"></i>`).join('')}</span></div>`).join('')}</div>`
          + `<ul class="bw-tips">${ft.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
      }
    }
  }
  dispose() { this.el.remove(); }
}

// ----- super-meters onderin beeld -----
export class MeterUI {
  constructor(names) {
    ensureCss();
    this.els = [0, 1].map((i) => {
      const bar = h('i'), txt = h('span');
      const el = h('div', { class: `bw-meter ${i ? 'r' : 'l'}`, style: { '--c': PLAYER_CSS[i] } }, bar, txt);
      ui.hudEl.append(el); return { el, bar, txt, k: '' };
    });
  }
  update(fs) {
    for (let i = 0; i < 2; i++) {
      const f = fs[i], e = this.els[i], full = f.meter >= 99.5, k = `${Math.round(f.meter)}:${f.type}:${f.stT === 'super'}`;
      if (k === e.k) continue; e.k = k;
      e.el.classList.toggle('full', full); e.bar.style.width = `${Math.min(100, f.meter)}%`;
      e.txt.textContent = full ? `⭐ SUPER KLAAR: A+B! ⭐` : `${FT[f.type].icon} SUPER ${Math.round(f.meter)}%`;
    }
  }
  dispose() { for (const e of this.els) e.el.remove(); }
}

// ============================================================================
// DEURMAN-CAMEO'S: de Deurman loopt/glijdt door beeld of klapt uit een deurtje, met een tekstballon in memestijl.
// Alles procedureel (SVG + CSS), geen assets. 16 cameo-soorten, elk met eigen animatie, geluid en een STICKER (S.deur.stickers).
//
// API
//   cameo(kind, ctx = {})        -> Promise<boolean>   speelt één cameo af (altijd, ongeacht instelling; false als er al een loopt)
//                                  ctx: { where: 'duel'|'hall'|'village'|'result', small, silent (geen sticker/toast) }
//   maybeCameo(where, rng, ctx)  -> Promise|null        met kans (S.settings.scare: 0 nooit, 1 af en toe, 2 vaak, 3 overal) + cooldown;
//                                  nooit tijdens ui.say / menu / overlay (behalve 'result') / scare.active / andere cameo
//   hallCameoTick(arcade, dt)    -> aanroepen elke frame in arcade.update(dt): zet zelf een timer uit, kijkt of de hal rustig is
//   villageCameoTick(hub, dt)    -> idem voor hub.update(dt)
//   openAlbum(onClose)           -> Promise  vriendenboek met alle stickers (A / Enter / Esc / klik sluit); albumOpen() = true zolang open
//   giveSticker(id, {silent})    -> true als nieuw (plakt sticker + toast '📒 Nieuwe Deurman-sticker!')
//   STICKERS, cameoActive(), stickerCount()
// Duel-cameo's ('duel') zijn klein, in een hoek en hebben GEEN effect op punten of spelverloop (hooguit kleuren ruilen of confetti).
// Stickers ../engine/progress.js: DEUR_HALL_STICKERS stickers openen de geheime Deurenhal.
// ============================================================================
import { S, persist } from '../save.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { scare } from './scare.js';
import { KEY_LABELS } from './input.js';
import { addSticker, stickers, DEUR_HALL_STICKERS } from './progress.js';
import { drawDeurFace } from './chars.js';
import { h, rand, pick } from './util.js';

// ---------- SVG-Deurman ----------
const SUIT = '#14141a', SKIN = '#efefea';
// armen als lijnstukken (schouder -> elleboog -> hand), viewBox-eenheden; schouders op (52,126) en (108,126)
const POSES = {
  down: { L: [[52, 126], [38, 230], [36, 322]], R: [[108, 126], [122, 230], [124, 322]] },
  hold: { L: [[52, 126], [28, 190], [62, 224]], R: [[108, 126], [132, 190], [98, 224]] },
  wave: { L: [[52, 126], [38, 230], [36, 322]], R: [[108, 126], [136, 84], [140, 36]] },
  up: { L: [[52, 126], [26, 84], [20, 34]], R: [[108, 126], [134, 84], [140, 34]] },
  thumb: { L: [[52, 126], [38, 230], [36, 322]], R: [[108, 126], [138, 160], [128, 108]] },
  point: { L: [[52, 126], [38, 230], [36, 322]], R: [[108, 126], [150, 150], [196, 140]] },
  sign: { L: [[52, 126], [26, 180], [42, 214]], R: [[108, 126], [134, 170], [118, 206]] },
};
let _uid = 0;
function deurSVG({ pose = 'down', hat = null, shades = false, stache = false, headphones = false, props = [] } = {}) {
  const arm = (side) => {
    const pts = POSES[pose][side]; const d = pts.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' '); const [hx, hy] = pts[pts.length - 1];
    let hand = `<circle cx="${hx}" cy="${hy}" r="9" fill="${SKIN}" stroke="#222" stroke-width="2.5"/>`;
    if ((pose === 'wave' || pose === 'up') && (side === 'R' || pose === 'up')) for (let i = -2; i <= 2; i++) hand += `<line x1="${hx + i * 4}" y1="${hy - 6}" x2="${hx + i * 6}" y2="${hy - 20}" stroke="${SKIN}" stroke-width="4" stroke-linecap="round"/>`;
    if (pose === 'thumb' && side === 'R') hand = `<rect x="${hx - 9}" y="${hy - 6}" width="18" height="22" rx="8" fill="${SKIN}" stroke="#222" stroke-width="2.5"/><rect x="${hx - 4}" y="${hy - 26}" width="9" height="24" rx="4.5" fill="${SKIN}" stroke="#222" stroke-width="2.5"/>`;
    return `<g class="dm-arm dm-arm-${side} dm-p-${pose}"><path d="${d}" fill="none" stroke="${SUIT}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>${hand}</g>`;
  };
  const PR = {
    partyhat: '<polygon points="58,26 102,26 86,-46" fill="#ff4aa8" stroke="#222" stroke-width="3"/><circle cx="80" cy="6" r="4.5" fill="#ffe14a"/><circle cx="86" cy="-14" r="4" fill="#ffe14a"/><circle cx="87" cy="-48" r="8" fill="#4ac8ff" stroke="#222" stroke-width="2"/>',
    crown: '<path d="M54 28 L52 -8 L68 10 L80 -16 L92 10 L108 -8 L106 28 Z" fill="#f2c230" stroke="#8a6a00" stroke-width="3"/>',
    tophat: '<rect x="58" y="-30" width="44" height="56" fill="#17151c"/><rect x="46" y="22" width="68" height="8" rx="3" fill="#17151c"/><rect x="58" y="12" width="44" height="8" fill="#c4182a"/>',
    shades: '<rect x="52" y="40" width="24" height="18" rx="6" fill="#08080c"/><rect x="84" y="40" width="24" height="18" rx="6" fill="#08080c"/><rect x="74" y="45" width="12" height="4" fill="#08080c"/><rect x="55" y="43" width="9" height="3" fill="#fff" opacity=".7"/><rect x="87" y="43" width="9" height="3" fill="#fff" opacity=".7"/>',
    stache: '<path d="M80 71 C66 62 52 68 46 80 C58 76 68 78 80 78 C92 78 102 76 114 80 C108 68 94 62 80 71 Z" fill="#14141a"/>',
    headphones: '<path d="M46 52 A34 38 0 0 1 114 52" fill="none" stroke="#222" stroke-width="7"/><rect x="40" y="42" width="14" height="28" rx="6" fill="#ff4aa8" stroke="#222" stroke-width="2.5"/><rect x="106" y="42" width="14" height="28" rx="6" fill="#ff4aa8" stroke="#222" stroke-width="2.5"/>',
    pad: '<g transform="rotate(-8 40 214)"><rect x="12" y="190" width="46" height="58" rx="3" fill="#fff" stroke="#222" stroke-width="2.5"/><line x1="20" y1="204" x2="50" y2="204" stroke="#6aa" stroke-width="2"/><line x1="20" y1="214" x2="50" y2="214" stroke="#6aa" stroke-width="2"/><path d="M20 232 q6 -10 12 0 t12 -2" fill="none" stroke="#2a4ac8" stroke-width="2.5"/></g><line x1="118" y1="206" x2="102" y2="236" stroke="#2a4ac8" stroke-width="5" stroke-linecap="round"/>',
    pizza: '<rect x="46" y="212" width="68" height="14" rx="3" fill="#b8843a" stroke="#222" stroke-width="2.5"/><circle cx="80" cy="204" r="30" fill="#ffc83a" stroke="#222" stroke-width="2.5"/><circle cx="68" cy="198" r="6" fill="#d8372c"/><circle cx="90" cy="194" r="6" fill="#d8372c"/><circle cx="82" cy="214" r="6" fill="#d8372c"/><circle cx="96" cy="210" r="4" fill="#3b9a45"/>',
    flower: '<g stroke="#3b9a45" stroke-width="3"><line x1="62" y1="224" x2="52" y2="170"/><line x1="62" y1="224" x2="66" y2="164"/><line x1="62" y1="224" x2="80" y2="172"/></g><circle cx="52" cy="164" r="11" fill="#ff6fa5"/><circle cx="66" cy="156" r="11" fill="#ffe14a"/><circle cx="82" cy="165" r="11" fill="#ff4aa8"/><circle cx="52" cy="164" r="4" fill="#ffe14a"/><circle cx="82" cy="165" r="4" fill="#ffe14a"/>',
    camera: '<rect x="46" y="204" width="68" height="40" rx="6" fill="#222" stroke="#000" stroke-width="2"/><rect x="56" y="198" width="20" height="8" rx="2" fill="#555"/><circle cx="80" cy="224" r="14" fill="#35507a" stroke="#ccc" stroke-width="3"/><circle cx="75" cy="219" r="4" fill="#fff" opacity=".7"/><rect x="96" y="208" width="10" height="7" rx="2" fill="#ffe14a"/>',
    trombone: '<path d="M30 214 L128 214" stroke="#e0b030" stroke-width="9" stroke-linecap="round"/><path d="M30 214 L30 236 L112 236" fill="none" stroke="#e0b030" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M128 206 L168 190 L168 238 L128 222 Z" fill="#f2c230" stroke="#8a6a00" stroke-width="3"/>',
    horn: '<rect x="62" y="206" width="34" height="30" rx="5" fill="#d8372c" stroke="#222" stroke-width="2.5"/><path d="M96 214 L140 192 L140 246 L96 228 Z" fill="#f4f4f0" stroke="#222" stroke-width="2.5"/><path d="M148 206 q10 12 0 24 M158 198 q16 20 0 40" fill="none" stroke="#ff4aa8" stroke-width="4" stroke-linecap="round" class="dm-waves"/>',
  };
  const extra = [hat === 'party' ? 'partyhat' : hat, shades && 'shades', stache && 'stache', headphones && 'headphones'].filter(Boolean);
  const u = 'dm' + (++_uid);
  return `<svg class="dm-svg" viewBox="-40 -64 240 440" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <g class="dm-leg dm-legl"><rect x="62" y="205" width="12" height="125" rx="6" fill="${SUIT}"/><ellipse cx="64" cy="334" rx="15" ry="7" fill="#050505"/></g>
  <g class="dm-leg dm-legr"><rect x="86" y="205" width="12" height="125" rx="6" fill="${SUIT}"/><ellipse cx="96" cy="334" rx="15" ry="7" fill="#050505"/></g>
  <g class="dm-torso"><path d="M48 120 Q80 108 112 120 L102 212 L58 212 Z" fill="${SUIT}"/><path d="M70 112 L90 112 L80 192 Z" fill="#f4f4f0"/><path d="M76 122 L84 122 L87 176 L80 186 L73 176 Z" fill="#c4182a"/>
  ${arm('L')}
  <g class="dm-head"><rect x="72" y="92" width="16" height="26" fill="${SKIN}"/>
   <ellipse cx="80" cy="56" rx="31" ry="41" fill="url(#${u})" stroke="#222" stroke-width="3"/>
   <defs><radialGradient id="${u}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fbfbf7"/><stop offset=".8" stop-color="#e8e8e2"/><stop offset="1" stop-color="#c4c4bc"/></radialGradient></defs>
   <ellipse cx="55" cy="72" rx="8" ry="5" fill="#ff6a90" opacity=".5"/><ellipse cx="105" cy="72" rx="8" ry="5" fill="#ff6a90" opacity=".5"/>
   <g class="dm-eyes"><ellipse cx="66" cy="50" rx="10" ry="13" fill="#fff" stroke="#222" stroke-width="2.5"/><ellipse cx="94" cy="50" rx="10" ry="13" fill="#fff" stroke="#222" stroke-width="2.5"/>
    <circle cx="67" cy="52" r="5.5" fill="#000"/><circle cx="93" cy="52" r="5.5" fill="#000"/><circle cx="69" cy="49" r="1.8" fill="#fff"/><circle cx="95" cy="49" r="1.8" fill="#fff"/></g>
   <path d="M55 33 Q66 26 77 33 M83 33 Q94 26 105 33" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round"/>
   <path d="M80 56 Q75 68 82 69" fill="none" stroke="#999" stroke-width="2"/>
   <path d="M48 72 Q80 122 112 72 Q80 84 48 72 Z" fill="#4a0c16" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
   <path d="M52 73 Q80 85 108 73 L105 82 Q80 94 55 82 Z" fill="#fff"/><ellipse cx="80" cy="100" rx="13" ry="6" fill="#ff7a96"/>
   ${extra.map((k) => PR[k] || '').join('')}</g>
  ${arm('R')}</g>
  <g class="dm-props">${props.map((k) => PR[k] || '').join('')}</g>
</svg>`;
}

// ---------- cameo-soorten ----------
// anim: walk | slide | door | peekB | corner | zoom | center | bush | peekS | top.  pose/props/hat bepalen het uiterlijk; sfx = [[ms, naam]]
const K = {
  handtekening: { name: 'Handtekening', icon: '✍️', text: 'HANDTEKENING?', anim: 'walk', dir: 'l2r', pose: 'sign', props: ['pad'], dur: 6200, sfx: [[0, 'kazoo'], [2400, 'squeak']], where: ['hall', 'village', 'result'], bg: '#ffd34a' },
  highfive: { name: 'High-five', icon: '🙌', text: 'Mag ik even?', anim: 'slide', pose: 'wave', dur: 3400, sfx: [[0, 'slide'], [1000, 'highfive']], where: ['hall', 'village', 'result'], bg: '#7ad8ff' },
  deuropen: { name: 'Deur open!', icon: '🚪', text: 'Deur open!', anim: 'door', pose: 'up', hat: 'party', dur: 4400, sfx: [[0, 'doorbell'], [900, 'squeak'], [1500, 'tada']], where: ['hall', 'village', 'result'], bg: '#c89a5a' },
  pizza: { name: 'Pizza', icon: '🍕', text: '...Pizza.', anim: 'walk', dir: 'r2l', pose: 'hold', props: ['pizza'], dur: 6600, sfx: [[0, 'kazoo'], [3000, 'ding']], where: ['hall', 'village'], bg: '#ff9a5a' },
  niksgebeurd: { name: 'Niks gebeurd', icon: '🤫', text: 'Ik was hier. Niks gebeurd.', anim: 'peekB', pose: 'down', dur: 4200, sfx: [[0, 'squeak'], [2600, 'boop']], where: ['duel', 'hall', 'village'], bg: '#b6e6a0' },
  goedgespeeld: { name: 'Goed gespeeld', icon: '👍', text: 'Goed gespeeld.', anim: 'corner', side: 'r', pose: 'thumb', dur: 3400, sfx: [[0, 'cheer']], where: ['duel', 'result', 'hall'], bg: '#9ae88a' },
  kijkdeur: { name: 'Een deur', icon: '👉', text: 'Kijk, een deur.', anim: 'walk', dir: 'l2r', pose: 'point', extra: 'door', dur: 5800, sfx: [[0, 'boing'], [2000, 'doorbell']], where: ['hall', 'village'], bg: '#ffc0e0' },
  toeter: { name: 'Toeter', icon: '📯', text: 'TOET!', anim: 'zoom', pose: 'hold', props: ['horn'], dur: 3200, sfx: [[700, 'airhorn']], where: ['duel', 'hall', 'village', 'result'], bg: '#ff6a5a' },
  dansen: { name: 'Feestje', icon: '🪩', text: 'Feestje?', anim: 'center', pose: 'up', hat: 'party', dur: 4800, sfx: [[0, 'party'], [500, 'kazoo']], fx: 'confetti', where: ['hall', 'village', 'result'], bg: '#c08aff' },
  selfie: { name: 'Selfie', icon: '🤳', text: 'Selfie?', anim: 'corner', side: 'l', pose: 'hold', props: ['camera'], dur: 4000, sfx: [[1100, 'shutter']], fx: 'snap', where: ['hall', 'village'], bg: '#8ad8ff' },
  bloem: { name: 'Bloemetje', icon: '💐', text: 'Voor jou.', anim: 'walk', dir: 'l2r', slow: true, pose: 'hold', props: ['flower'], dur: 6000, sfx: [[1900, 'kiss']], fx: 'hearts', where: ['hall', 'village', 'result'], bg: '#ffb0d0' },
  verstopt: { name: 'Verstoppertje', icon: '🪴', text: 'Niet kijken. Ik verstop me.', anim: 'bush', pose: 'down', dur: 4600, sfx: [[0, 'squeak'], [2400, 'squeak']], where: ['duel', 'hall', 'village'], bg: '#98d870' },
  trombone: { name: 'Trombone', icon: '🎺', text: 'Ik speel trombone.', anim: 'corner', side: 'l', pose: 'hold', props: ['trombone'], dur: 4600, sfx: [[700, 'trombone']], where: ['hall', 'village', 'result'], bg: '#e8c84a' },
  zonnebril: { name: 'Deal with it', icon: '😎', text: 'Deal with it.', anim: 'zoom', pose: 'thumb', shades: true, stache: true, dur: 3200, sfx: [[0, 'slide'], [1200, 'tada']], where: ['duel', 'result', 'hall'], bg: '#5a8aff' },
  kleurenruil: { name: 'Kleuren ruilen', icon: '🎨', text: 'Ik ruil even de kleuren.', anim: 'peekS', pose: 'down', dur: 4000, sfx: [[0, 'swap']], fx: 'colorswap', where: ['duel', 'hall', 'village'], bg: '#ff8ad8' },
  confetti: { name: 'Confetti', icon: '🎉', text: 'Confetti!', anim: 'top', pose: 'up', hat: 'party', dur: 3800, sfx: [[0, 'party'], [400, 'cheer']], fx: 'confetti', where: ['duel', 'result', 'hall', 'village'], bg: '#ffa04a' },
};
export const CAMEO_KINDS = Object.keys(K);
export const cameoDuration = (kind) => (K[kind] ? K[kind].dur : 0);
export const cameoWhere = (kind) => (K[kind] ? K[kind].where : []);
// stickers = precies één per cameo-soort (16)
export const STICKERS = CAMEO_KINDS.map((id) => ({ id, name: K[id].name, icon: K[id].icon, text: K[id].text }));
export const stickerCount = () => stickers().filter((id) => K[id]).length;
export const cameoActive = () => !!_cur;
// Kapt een lopende cameo af (bijv. bij het verlaten van een duel)
export function resetCameoCooldown() { _last = -1e9; _lastKind = null; }   // voor tests
export function stopCameo() { if (_cur) { _cur.stop(); } }

// ---------- sticker geven ----------
export function giveSticker(id, { silent = false } = {}) {
  const isNew = addSticker(id);
  if (isNew && !silent) {
    const n = stickerCount(); const left = DEUR_HALL_STICKERS - n;
    try { ui.hud.toast('📒 Nieuwe Deurman-sticker!' + (n === DEUR_HALL_STICKERS ? ' De geheime Deurenhal is open!' : left > 0 && left <= 2 ? ` (nog ${left} voor de Deurenhal)` : ''), 2800); } catch (e) { /* geen hud */ }
    audio.sfx('star');
  }
  return isNew;
}

// ---------- effecten (geen invloed op het spel) ----------
const layer = () => {
  let l = document.getElementById('cameo-layer');
  if (!l) { l = h('div', { id: 'cameo-layer' }); document.getElementById('app').append(l); }
  return l;
};
function confetti(n = 70) {
  const L = layer(); const cols = ['#ff4aa8', '#ffe14a', '#4ac8ff', '#7bff7b', '#ff9a2a', '#b06aff'];
  for (let i = 0; i < n; i++) { const c = h('i', { class: 'dm-conf' }); c.style.cssText = `left:${rand(0, 100)}%;background:${pick(cols)};animation-duration:${rand(1.8, 3.4)}s;animation-delay:${rand(0, 0.8)}s;--r:${rand(-540, 540)}deg;--dx:${rand(-60, 60)}px`; L.append(c); setTimeout(() => c.remove(), 4600); }
}
function hearts() { const L = layer(); for (let i = 0; i < 8; i++) { const e = h('i', { class: 'dm-heart' }, pick(['💗', '💖', '💕'])); e.style.cssText = `left:${rand(25, 75)}%;animation-delay:${i * 0.25}s`; L.append(e); setTimeout(() => e.remove(), 3600); } }
let _swapT = null;
function colorSwap() {
  const gl = document.getElementById('gl'); if (!gl) return;
  gl.style.transition = 'filter .7s'; gl.style.filter = 'hue-rotate(160deg) saturate(1.25)';
  clearTimeout(_swapT); _swapT = setTimeout(() => { gl.style.filter = ''; setTimeout(() => { gl.style.transition = ''; }, 800); }, 2200);
}
function snap() { if (S.settings.flashFree) return; const e = h('div', { class: 'dm-snap' }); layer().append(e); setTimeout(() => e.remove(), 500); }
const FX = { confetti, hearts, colorswap: colorSwap, snap };

// ---------- afspelen ----------
let _cur = null, _last = -1e9, _lastKind = null;
export function cameo(kind, ctx = {}) {
  const d = K[kind]; if (!d || _cur) return Promise.resolve(false);
  const where = ctx.where || 'hall'; const small = ctx.small ?? (where === 'duel');
  return new Promise((resolve) => {
    const dur = d.dur * (small ? 0.8 : 1);
    const fig = h('div', { class: 'dm-fig', html: deurSVG({ pose: d.pose, hat: d.hat, shades: d.shades, stache: d.stache, headphones: d.headphones, props: d.props || [] }) });
    const clip = h('div', { class: 'dm-clip' }, fig);
    const bubble = h('div', { class: 'dm-bubble' }, d.text);
    const kids = [];
    if (d.extra === 'door') kids.push(h('div', { class: 'dm-minidoor' }, h('i')));
    if (d.anim === 'door') kids.push(h('div', { class: 'dm-doorframe' }, clip, h('div', { class: 'dm-leaf' }, h('i'))));
    else kids.push(clip);
    if (d.anim === 'bush') kids.push(h('div', { class: 'dm-plant', html: '<i></i><i></i><i></i><b></b>' }));
    kids.push(bubble);
    const dir = d.dir || 'l2r'; const cx = Math.round(rand(18, 72));
    const el = h('div', { class: `dm-cam dm-${d.anim} dm-${dir} dm-side-${d.side || 'r'}${small ? ' small' : ''}${d.slow ? ' slow' : ''}`, style: `--dur:${dur}ms;--cx:${cx}%` }, ...kids);
    layer().append(el); _cur = { kind, el };
    const timers = []; const end = () => { timers.forEach(clearTimeout); el.remove(); if (_cur && _cur.el === el) _cur = null; _last = performance.now(); resolve(true); };
    _cur.stop = end;
    for (const [ms, name] of d.sfx) timers.push(setTimeout(() => audio.sfx(name, { vol: small ? 0.6 : 1 }), ms * (small ? 0.8 : 1)));
    if (d.fx) timers.push(setTimeout(() => FX[d.fx] && FX[d.fx](), dur * 0.22));
    if (!ctx.silent) timers.push(setTimeout(() => { S.deur ||= { stickers: [], cameos: 0 }; S.deur.cameos = (S.deur.cameos || 0) + 1; giveSticker(kind); persist(); }, dur * 0.4));
    timers.push(setTimeout(end, dur + 150));
  });
}

// ---------- kans, cooldown en rustmomenten ----------
const COOLDOWN = [1e9, 100, 50, 20];   // seconden tussen twee cameo's per Deurman-gedrag (0 Uit, 1 Af en toe, 2 Vaak, 3 Overal!)
const CHANCE = [0, 0.35, 0.65, 1];
export function cameoBusy(allowOverlay = false) {
  if (_cur || scare.active || document.hidden) return true;
  if (ui.dialogActive && ui.dialogActive()) return true;
  if (ui.activeMenus && ui.activeMenus.length) return true;
  if (!allowOverlay && ui.screens && ui.screens.children.length) return true;
  return false;
}
export function maybeCameo(where, rng = Math.random, ctx = {}) {
  const lvl = S.settings.scare | 0; if (lvl <= 0) return null;
  if (cameoBusy(where === 'result' || ctx.allowOverlay)) return null;
  if (performance.now() - _last < COOLDOWN[lvl] * 1000) return null;
  if (rng() > CHANCE[lvl]) return null;
  const have = stickers(); const pool = CAMEO_KINDS.filter((k) => K[k].where.includes(where) && k !== _lastKind);
  if (!pool.length) return null;
  const w = pool.map((k) => (have.includes(k) ? 1 : 3)); let r = rng() * w.reduce((a, b) => a + b, 0), kind = pool[0];
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { kind = pool[i]; break; } }
  _lastKind = kind;
  return cameo(kind, { ...ctx, where });
}
const _tick = { hall: 12, village: 14 };
const tickInterval = () => rand(9, 16) / [1, 1, 1.6, 2.5][S.settings.scare | 0 || 0];
// Aanroepen in arcade.update(dt): alleen als de hal rustig is (geen dialoog/menu/Deurman-gebeurtenis).
export function hallCameoTick(arcade, dt) {
  if (!(S.settings.scare > 0)) return; _tick.hall -= dt; if (_tick.hall > 0) return; _tick.hall = tickInterval();
  const d = arcade.deur; if (arcade.busy || arcade.leaving || arcade.picker || arcade.modal || arcade.menu || (d && (d.active || d.takeover))) return;
  maybeCameo('hall', Math.random, { arcade });
}
// Aanroepen in hub.update(dt): alleen als het dorp rustig is.
export function villageCameoTick(hub, dt) {
  if (!(S.settings.scare > 0)) return; _tick.village -= dt; if (_tick.village > 0) return; _tick.village = tickInterval();
  if (hub.busy || hub.cinematic || hub.modal || (hub.deur && hub.deur.active)) return;
  maybeCameo('village', Math.random, { hub });
}

// ---------- vriendenboek ----------
export function stickerCanvas(id, size = 120) {
  const d = K[id]; const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, size, size); bg.addColorStop(0, d.bg); bg.addColorStop(1, '#fff');
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, size - 8, size - 8, size * 0.16); g.fill();
  g.save(); g.beginPath(); g.roundRect(4, 4, size - 8, size - 8, size * 0.16); g.clip();
  drawDeurFace(g, size * 0.5, size * 0.56, size * 0.3, { hat: d.hat === 'party' ? 'party' : null, stache: !!d.stache, shades: !!d.shades, open: 0.7, eye: 1.2 });
  g.restore();
  g.font = `${Math.round(size * 0.3)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.icon, size * 0.79, size * 0.2);
  return c;
}
let _album = null;
export const albumOpen = () => !!_album;
export function openAlbum(onClose) {
  if (_album) return _album.promise;
  const have = stickers(); const n = stickerCount(); const N = STICKERS.length;
  const cells = STICKERS.map((st) => {
    const got = have.includes(st.id);
    return h('div', { class: 'album-cell' + (got ? ' found' : ''), title: got ? st.text : 'Nog niet gevonden' }, got ? stickerCanvas(st.id, 120) : h('div', { class: 'q' }, '?'), h('span', {}, got ? st.name : '???'));
  });
  const hallTxt = n >= DEUR_HALL_STICKERS ? '🚪 Genoeg stickers: de geheime Deurenhal staat open!' : `Nog ${DEUR_HALL_STICKERS - n} sticker${DEUR_HALL_STICKERS - n === 1 ? '' : 's'} voor de geheime Deurenhal.`;
  const card = h('div', { class: 'card album' }, h('h2', {}, '📒 Deurman-vriendenboek'), h('div', { class: 'album-count' }, `${n} / ${N} stickers`),
    h('div', { class: 'album-grid' }, ...cells), h('p', { class: 'album-hall' }, hallTxt),
    h('div', { class: 'small-note' }, `De Deurman duikt overal op. Elke nieuwe grap is een sticker! · Sluiten: ${KEY_LABELS[0].a} of ${KEY_LABELS[1].a}`));
  const el = ui.overlay(card);
  let done; const promise = new Promise((r) => { done = r; });
  const t0 = performance.now();
  const close = () => { removeEventListener('keydown', onKey, true); el.remove(); _album = null; audio.sfx('click'); if (onClose) onClose(); done(); };
  const onKey = (e) => { if (performance.now() - t0 < 350) return; if (['Enter', 'NumpadEnter', 'Escape', 'Space', 'KeyF', 'KeyE', 'KeyG'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey, true); card.append(h('div', { class: 'btnrow', style: { display: 'flex', justifyContent: 'center', marginTop: '8px' } }, h('div', { class: 'btn', style: { width: 'auto', padding: '4px 24px', fontSize: '20px' }, onClick: close }, 'Sluiten')));
  _album = { promise, close };
  audio.sfx('select');
  return promise;
}
export function closeAlbum() { if (_album) _album.close(); }

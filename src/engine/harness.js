import * as THREE from 'three';
import { input, KEY_LABELS } from './input.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { scare } from './scare.js';
import { maybeCameo, stopCameo } from './cameo.js';
import { S, persist } from '../save.js';
import { Particles, FloatTexts } from './particles.js';
import { makeBrother, makeNPC, PLAYER_CSS, PLAYER_COLORS, BASE_CSS, BASE_COLORS, setSlotPlayers } from './chars.js';
import { recordPair } from './party.js';
import { setupLights } from './lights.js';
import { h, clamp, mulberry32, disposeObject, rand, pick } from './util.js';
import { pickTwist, applyTwist, blankIn, TWISTS } from './twist.js';
import { dailyDone, dailyBonus, completeDaily } from './daily.js';
import { GAMEHAL } from '../variant.js';
import { coin, resultQuip } from '../gamehal/humor.js';

// Revanche-reeks: opeenvolgende potjes van hetzelfde duel tussen dezelfde deelnemers (wordt gewist bij een ander spel of ander paar)
// wins = winsten per SLOT (zoals in het laatste potje), winsById = per spelers-id
export const SERIES = { id: null, key: '', wins: [0, 0], winsById: [0, 0, 0, 0], n: 0 };
const NAMES = ['Wes', 'Jor', 'Juul', 'Sam'];

// Wie spelen er mee? Spelers-id per slot. extra.players = 2..4 unieke id's; zonder extra.players: alle S.settings.players spelers als het spel dat aantal
// kent, anders het grootste ondersteunde aantal <= S.settings.players (minstens 2).
// def.players (bijv. [2, 3, 4], [4], [2, 4]; standaard [2]) = ondersteunde aantallen. Vraag je een niet-ondersteund aantal: het grootste ondersteunde
// aantal daaronder (de eerste die-en-die ids); is er geen kleiner aantal (bijv. 2 ids bij een alleen-4-spel) dan worden ids aangevuld tot het kleinste
// ondersteunde aantal dat in S.settings.players past.
export function resolveParticipants(def, extra) {
  const P = Math.max(2, Math.min(4, S.settings.players | 0)), sizes = Array.isArray(def.players) && def.players.length ? def.players : [2];   // zonder def.players: 1-tegen-1 (of 2 samen)
  let ids = extra && Array.isArray(extra.players) ? extra.players.filter((x, i, a) => Number.isInteger(x) && x >= 0 && x <= 3 && a.indexOf(x) === i).slice(0, 4) : null;
  if (!ids || ids.length < 2) {
    const want = sizes.includes(P) ? P : sizes.filter((k) => k >= 2 && k <= P).sort((a, b) => b - a)[0] || 2;
    return [0, 1, 2, 3].slice(0, want);
  }
  if (sizes.includes(ids.length)) return ids;
  const down = sizes.filter((k) => k >= 2 && k < ids.length).sort((a, b) => b - a)[0];
  if (down) return ids.slice(0, down);
  const up = sizes.filter((k) => k > ids.length && k <= P).sort((a, b) => a - b)[0];   // spel voor 3 of 4: de rest doet mee
  if (up) for (const k of [0, 1, 2, 3]) if (ids.length < up && !ids.includes(k)) ids.push(k);
  return ids;
}
// Teams (alleen als het spel `teams: true` declareert, bij 3 of 4 deelnemers): extra.teams = slot-indelingen, bijv. [[0, 1], [2, 3]].
// Ongeldig of niet meegegeven: bij 4 deelnemers [[0, 1], [2, 3]], anders null.
export function resolveTeams(def, extra, n) {
  if (!def.teams || n < 3) return null;
  const t = extra && Array.isArray(extra.teams) ? extra.teams : null;
  if (t && t.length >= 2 && t.every((a) => Array.isArray(a) && a.length > 0)) {
    const flat = t.flat();
    if (flat.length === n && flat.every((k, i) => Number.isInteger(k) && k >= 0 && k < n && flat.indexOf(k) === i)) return t.map((a) => a.slice());
  }
  return n === 4 ? [[0, 1], [2, 3]] : null;
}

export const PAY = [10, 30, 55, 85];   // heitjes bij 0..3 sterren (x def.pay)
export const PVP_PAY = 20;             // heitjes voor een afgespeeld duel (gedeelde portemonnee)

// Een minigame-sessie: intro-kaart -> aftellen -> spelen -> resultaat
export class MinigameMode {
  constructor(app, def, { onDone, seed = Date.now(), practice = false, twist = null, extra = null } = {}) {
    this.app = app; this.def = def; this.onDone = onDone; this.practice = practice; this.extra = extra; this.forceTwist = twist;
    this.state = 'intro'; this.t = 0; this.paused = false; this.finished = false;
    this.penalty = 0; this.bonus = 0; this.events = 0;
    this.shakeAmt = 0;
    // deelnemers: spelers-id per slot; slot-view van invoer, kleuren, toetslabels, personages en HUD volgt de mapping (hersteld bij dispose)
    this.ids = resolveParticipants(def, extra); this.n = this.ids.length; this.ready = this.ids.map(() => false);
    input.mapSlots(this.ids); setSlotPlayers(this.ids); ui.hud.setSlots(this.ids);
    const r = app.renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, r.domElement.width / r.domElement.height, 0.1, 500);
    this.camera.position.set(0, 12, 14); this.camera.lookAt(0, 0, 0);
    this.fx = { particles: new Particles(1800), texts: new FloatTexts(this.scene) };
    this.fx.particles.setViewportHeight(r.domElement.height);
    this.scene.add(this.fx.particles.points);
    this.rng = mulberry32(seed);
    this.timeScale = 1;
    // duel-modus: twist kiezen
    this.isPvp = def.mode === 'pvp';
    this.pvpIn = this.ids.map(() => blankIn()); this.swapped = false; this.swapPair = [0, 1]; this.swapPairs = [[0, 1]]; this.playT = 0; this.nextSwap = 12 + this.rng() * 8; this.giant = this.n === 2 ? (this.rng() < 0.5 ? 0 : 1) : Math.floor(this.rng() * this.n);
    const forced = new URLSearchParams(location.search).get('twist') || twist;
    const allowed = S.settings.scare <= 0 ? (def.twists || TWISTS.map((t) => t.id)).filter((id) => id !== 'deurman') : def.twists;
    this.twist = this.isPvp ? pickTwist(allowed, this.rng, forced) : { id: 'none', name: 'Geen twist', desc: '' };
    const self = this;
    this.ctx = {
      scene: this.scene, camera: this.camera, renderer: r, input, audio, hud: ui.hud, fx: this.fx,
      rng: this.rng, THREE,
      players: this.ids.map((id, slot) => ({ id, index: slot, name: S.names[id] || NAMES[id], color: BASE_COLORS[id], css: BASE_CSS[id] })),
      difficulty: 1 + Math.min(1, ((S.jobs[def.id]?.plays || 0)) * 0.15),
      lights: (mood, o) => setupLights(this.scene, mood, { shadows: S.settings.quality !== 'low', ...o }),
      make: { brother: makeBrother, npc: makeNPC },
      shake: (a = 0.3) => { this.shakeAmt = Math.max(this.shakeAmt, a); },
      sfx: (n, o) => audio.sfx(n, o),
      finish: (res) => this.finish(res),
      get time() { return self.t; },
      get playing() { return self.state === 'play' && !self.paused; },
      penalty: (n, why) => { this.penalty += n; if (why) ui.hud.toast(why); },
      bonus: (n, why) => { this.bonus += n; if (why) ui.hud.toast(why); },
      // zet een DOM-melding bij de speler
      tell: (i, text) => ui.hud.setPlayerInfo(i, text),
    };
    // teams (def.teams): ctx.teams = [[slot, slot], ...] of null; ctx.teamOf[slot] = teamindex; ctx.teamInfo[t] = { index, slots, color, css, name } (kleur = die van het eerste lid)
    this.teams = resolveTeams(def, extra, this.n);
    this.ctx.teams = this.teams;
    this.ctx.teamOf = this.teams ? this.ids.map((_, slot) => this.teams.findIndex((t) => t.includes(slot))) : null;
    this.ctx.teamInfo = this.teams ? this.teams.map((t, index) => ({ index, slots: t.slice(), color: this.ctx.players[t[0]].color, css: this.ctx.players[t[0]].css, name: t.map((k) => this.ctx.players[k].name).join(' & ') })) : null;
    ui.hud.setTeams(this.ctx.teamInfo);   // HUD: teamgenoten in één kolom met teamlabel (de HUD wordt pas bij ui.hud.reset() opgebouwd)
    // duel-API
    const T = this.twist; const me = this;
    this.ctx.twist = T;
    this.ctx.isPvp = this.isPvp;
    this.ctx.pvp = {
      twist: T,
      input: (i) => me.pvpIn[i],
      speed: (i) => (T.id === 'giant' ? (i === me.giant ? 0.8 : 1.3) : T.speed || 1),
      size: (i) => (T.id === 'giant' ? (i === me.giant ? 1.55 : 0.65) : 1),
      slip: T.slip || 0,
      gravity: T.gravity || 1,
      get swapped() { return me.swapped; },
      get swapPair() { return me.swapPair; },
      get swapPairs() { return me.swapPairs; },   // alle wisselparen van dit moment (bij 4 deelnemers 1 of 2 paren)
      get giantIndex() { return T.id === 'giant' ? me.giant : -1; },
    };
    this.ctx.finishPvp = (res) => this.finishPvp(res);
    ui.hud.reset();
    try { this.instance = def.create(this.ctx); } catch (e) { this._slotsFreed = true; input.resetSlots(); setSlotPlayers([0, 1, 2, 3]); ui.hud.setSlots(null); throw e; }   // mapping nooit laten hangen
    this.showIntro();
    audio.music(def.music || (def.mode === 'puzzle' ? 'puzzle' : 'game'));
    this._deurT = this.nextDeurTime(true);
    this._cameoT = 14 + Math.random() * 16; this._cameos = 0;   // Deurman-cameo's (alleen kijkgrapjes, geen gevolgen voor het spel)
    this._onBlur = () => { if (this.state === 'play' && !this.paused) this.pause(); };
    addEventListener('blur', this._onBlur);
  }

  nextDeurTime(first = false) {
    const lvl = S.settings.scare; if (lvl <= 0) return 1e9;
    const f = lvl === 1 ? 1.8 : lvl === 3 ? 0.65 : 1;
    if (this.extra && this.extra.spooky) return first ? rand(5, 8) : rand(9, 13);   // feest-duel (Deurenfeestje): hij kijkt steeds mee
    if (this.isPvp && this.twist.id !== 'deurman') return 1e9;          // in duels alleen met de Deurman-twist (Deurman kijkt mee)
    if (this.twist.id === 'deurman') return first ? rand(8, 14) : rand(12, 20);
    return (first ? rand(22, 38) : rand(30, 55)) * f;
  }

  // ---------------- intro ----------------
  slots() { return this.ids.map((_, i) => i); }          // slot-indexen 0..n-1
  nameOf(slot) { return S.names[this.ids[slot]]; }       // naam van de speler in dat slot
  keysA() { return this.slots().map((i) => KEY_LABELS[i].a).join(' of '); }   // 'F of Enter' (of met Juul/Sam erbij)
  controlLines(i) {
    const k = KEY_LABELS[i];
    const lines = (this.def.controls || ['{move} bewegen', '{a} actie']).map((l) => l.replace('{move}', `<kbd>${k.move}</kbd>`).replace('{a}', `<kbd>${k.a}</kbd>`).replace('{b}', `<kbd>${k.b}</kbd>`));
    return lines;
  }
  showIntro() {
    const d = this.def;
    const sizes = Array.isArray(d.players) ? d.players.filter((k) => k >= 2 && k <= 4) : [];
    const pvpTxt = sizes.length === 1 && sizes[0] >= 3 ? `Voor ${sizes[0]} spelers` : sizes.includes(4) ? `${Math.min(...sizes)} tot 4 spelers` : 'Duel: 1 tegen 1';   // alleen-3, alleen-4, 2 tot 4, anders 1 tegen 1
    const modeTxt = { coop: 'Samenwerken', versus: 'Broer tegen broer', pvp: pvpTxt, puzzle: 'Puzzel' }[d.mode] || 'Samenwerken';
    const card = h('div', { class: 'card' },
      h('h2', {}, `${d.icon || ''} ${d.name}`),
      h('div', { class: 'giver' }, d.giver ? `Klus van ${d.giver}` : ''),
      h('div', { class: 'tags' }, h('span', { class: `tag ${d.mode === 'pvp' ? 'versus' : d.mode || 'coop'}` }, modeTxt), h('span', { class: 'tag' }, d.time ? `± ${d.time} sec` : 'Geen tijdslimiet')),
      h('p', { html: d.blurb || '' }),
      h('div', { class: 'ctrl' + (this.n > 3 ? ' four' : this.n > 2 ? ' three' : '') },
        ...this.slots().map((i) => h('div', { style: { '--c': PLAYER_CSS[i] } }, h('h4', {}, this.nameOf(i)), h('ul', {}, ...this.controlLines(i).map((l) => h('li', { html: l })))))),
      this.isPvp ? h('div', { class: 'twist' }, h('b', {}, `${this.twist.icon || '🎲'} TWIST: ${this.twist.name}`), h('span', {}, this.twist.id === 'giant' ? (this.n === 2 ? `${this.nameOf(this.giant)} wordt de reus, ${this.nameOf(1 - this.giant)} de dwerg!` : `${this.nameOf(this.giant)} wordt de reus, de rest wordt dwerg!`) : this.twist.desc)) : null,
      this.teams ? h('div', { class: 'twist' }, h('b', {}, '🤝 TEAMS'), h('span', {}, this.ctx.teamInfo.map((t) => t.name).join('  tegen  '))) : null,
      d.tip ? h('p', { class: 'small-note', html: '💡 ' + d.tip }) : null,
      h('div', { class: 'ready' + (this.n > 3 ? ' four' : '') }, ...this.slots().map((i) => h('div', { style: { '--c': PLAYER_CSS[i] }, class: 'rdy' }, `${this.nameOf(i)}: druk ${KEY_LABELS[i].a}`))),
      h('div', { class: 'small-note' }, (this.n > 2 ? 'Iedereen klaar? Dan begint het!' : 'Allebei klaar? Dan begint het!') + ' (Esc = terug naar het dorp)'));
    this.introEl = ui.overlay(card, 'clear'); this.introEl.style.background = 'rgba(10,5,20,.35)';
    this.readyEls = [...card.querySelectorAll('.rdy')];
  }

  // ---------------- flow ----------------
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const esc = input.pressed('Escape') || input.pressed('KeyP');
    const escP = esc && !this._escHeld; this._escHeld = esc;
    if (this.paused) {
      if (this._pauseT > 0) this._pauseT -= dt; else if (this.pauseMenu) this.pauseMenu.update();
      if (escP && this._pauseT <= 0) this.resume();
      return;
    }
    if (this.isPvp && this.state !== 'play') for (let i = 0; i < this.n; i++) applyTwist(this.pvpIn[i], input.p[i], { id: 'none' }, this.t, i, false);
    if (this.state === 'intro') {
      for (let i = 0; i < this.n; i++) if (input.p[i].aP) { this.ready[i] = !this.ready[i]; audio.sfx(this.ready[i] ? 'select' : 'click'); this.readyEls[i].classList.toggle('on', this.ready[i]); }
      if (this.instance.introUpdate) this.instance.introUpdate(dt);
      if (this.ready.every(Boolean) && !this._starting) { this._starting = true; setTimeout(() => this.startCountdown(), 350); }
      if (escP) { this.quit(); return; }
    } else if (this.state === 'countdown') {
      this.cdT -= dt;
      const n = Math.ceil(this.cdT);
      if (n !== this._cdN && n > 0) { this._cdN = n; ui.hud.showBig(String(n), 800); audio.sfx('countdown'); }
      if (this.cdT <= 0) { this.state = 'play'; ui.hud.showBig('GA!', 700, '#ffe14a'); audio.sfx('go'); this.instance.onStart && this.instance.onStart(); if (this.extra && this.extra.spooky && !this.tintEl) { this.tintEl = h('div', { class: 'spook-tint' }); document.body.append(this.tintEl); audio.sfx('party'); ui.hud.toast('🥳 DEURENFEESTJE! Feest-duel!', 2200); } }
      if (this.instance.introUpdate) this.instance.introUpdate(dt);
    } else if (this.state === 'play') {
      if (escP) { this.pause(); return; }
      if (!scare.active) {
        if (this.isPvp) this.updatePvp(dt);
        this.instance.update(dt);
        this._deurT -= dt;
        if (this._deurT <= 0 && !this.finished) this.deurEvent();
        this.cameoTick(dt);
      }
    } else if (this.state === 'result') {
      if (this.instance.resultUpdate) this.instance.resultUpdate(dt);
      if (this.resultReady) {
        if (this.canRematch && this.isPvp) {
          for (const p of input.p) { if (p.leftP || p.rightP || p.upP || p.downP) { this.resSel = 1 - this.resSel; this.drawResOpts(); audio.sfx('click'); } }
          if (input.p.some((p) => p.aP)) this.close(this.resSel === 0);
        } else if (input.p.some((p) => p.aP)) this.close();
      }
    }
    this.fx.particles.update(dt); this.fx.texts.update(dt);
  }

  // Duel: twist toepassen op de invoer + lichaamswissel
  updatePvp(dt) {
    const T = this.twist; this.playT += dt;
    if (T.id === 'bodyswap') {
      this.nextSwap -= dt;
      if (this.nextSwap <= 0) {
        this.swapped = !this.swapped;
        if (this.swapped && this.n > 2) {   // bij 3 deelnemers: willekeurig paar wisselt; bij 4: een paar of twee paren
          const a = Math.floor(this.rng() * this.n); this.swapPair = [a, (a + 1 + Math.floor(this.rng() * (this.n - 1))) % this.n]; this.swapPairs = [this.swapPair];
          if (this.n === 4 && this.rng() < 0.5) this.swapPairs = [this.swapPair, [0, 1, 2, 3].filter((k) => !this.swapPair.includes(k))];
        }
        this.nextSwap = this.swapped ? 8 + this.rng() * 5 : 14 + this.rng() * 8;
        ui.hud.showBig(this.swapped ? '🔄 WISSEL!' : '🔄 TERUG!', 1100, '#ffe14a'); audio.sfx('boing'); ui.flash('#ffe14a', 250);
        this.instance.onSwap && this.instance.onSwap(this.swapped);
      }
    }
    const src = (i) => { if (!this.swapped) return i; for (const [x, y] of this.swapPairs) { if (i === x) return y; if (i === y) return x; } return i; };
    for (let i = 0; i < this.n; i++) applyTwist(this.pvpIn[i], input.p[src(i)], T, this.t, i, this.swapped);
  }

  startCountdown() {
    this.introEl.remove(); this.state = 'countdown'; this.cdT = 3.2; this._cdN = 4;
    ui.hud.reset();
    this.instance.onCountdown && this.instance.onCountdown();
  }

  // Cameo van de Deurman op een rustig moment (max 2 per potje, kans/cooldown volgens S.settings.scare). Geen invloed op punten.
  cameoTick(dt) {
    if (this._cameos >= 2 || this.finished || S.settings.scare <= 0) return;
    this._cameoT -= dt; if (this._cameoT > 0) return;
    if (this._deurT < 6) { this._cameoT = 3; return; }   // hij komt zo al kijken: even wachten
    const p = maybeCameo('duel', Math.random, { small: true });
    if (p) { this._cameos++; this._cameoT = 30 + Math.random() * 25; } else this._cameoT = 8;
  }
  async deurEvent() {
    this._deurT = this.nextDeurTime();
    this.events++;
    const lvl = S.settings.scare;
    if (this.events % 3 === 2 && lvl >= 1) { // alleen sfeer: deurbel en gekke geluidjes
      audio.sfx(Math.random() < 0.5 ? 'doorbell' : 'squeak'); ui.hud.toast(pick(['Ergens gaat een deurbel...', 'Hoorde je dat? De Deurman oefent zijn high-five.', 'Er staat iemand bij de deur. Het is vast de Deurman.'])); return;
    }
    const lunge = Math.random() < (lvl >= 3 ? 0.5 : lvl === 2 ? 0.28 : 0);
    if (lvl >= 3 && Math.random() < 0.4) await scare.flicker(3);
    const res = await scare.stare({ hold: 2.2 + Math.random() * 1.2 });
    if (this.isPvp) {   // duel: wie bewoog verliest een punt (spel bepaalt hoe)
      if (res.caught) { const who = res.movers.map((m, i) => (m ? this.nameOf(i) : null)).filter(Boolean).join(' en '); ui.hud.toast(`${who} bewoog! BOEM! De Deurman neemt een punt af.`, 2800); this.instance.onDeurman && this.instance.onDeurman(res.movers); }
      else ui.hud.toast('Niemand bewoog. De Deurman is apetrots op jullie!', 2200);
      return;
    }
    if (res.caught) { ui.hud.toast('Je bewoog! BOEM! De Deurman lacht zich slap.', 2600); }
    else if (lunge) { await scare.jumpscare(); this.bonus += 5; ui.hud.toast(`Hij sprong toch! (+5 ${coin(5)} durfal-bonus)`, 2600); }
    else { this.bonus += 5; ui.hud.toast(`Stil gebleven! +5 ${coin(5)} durfal-bonus`, 2200); }
  }

  pause() {
    if (this.paused || this.state !== 'play') return;
    this.paused = true; audio.duck(true);
    const menuItems = [
      { label: 'Doorgaan', onSelect: () => this.resume() },
      { label: 'Opnieuw beginnen', onSelect: () => this.restart() },
      { label: 'Stoppen (terug naar het dorp)', onSelect: () => this.quit() },
    ];
    this.pauseMenu = new ui.Menu(menuItems);
    const card = h('div', { class: 'card pause' }, h('h2', {}, 'Pauze'), this.pauseMenu.el, h('div', { class: 'small-note' }, 'Esc / P = doorgaan'));
    this.pauseEl = ui.overlay(card); this._pauseT = 0.25;
  }
  resume() { if (!this.paused) return; this.paused = false; this.pauseEl && this.pauseEl.remove(); this.pauseMenu = null; audio.duck(false); }
  restart() { const { app, def, onDone, practice, extra } = this; this.dispose(); app.setMode(new MinigameMode(app, def, { onDone, practice, extra })); }
  quit() { this.dispose(); this.onDone && this.onDone(null); }

  finish(res = {}) {
    if (this.finished) return; this.finished = true;
    this.state = 'result';
    const stars = clamp(Math.round(res.stars ?? 0), 0, 3);
    const jobsData = S.jobs[this.def.id];
    const repeat = jobsData && jobsData.plays > 0;
    const base = Math.round(PAY[stars] * (this.def.pay || 1) * (repeat ? 0.6 : 1));
    this.result = { id: this.def.id, ids: this.ids.slice(), stars, score: res.score ?? 0, base, penalty: this.penalty, bonus: this.bonus + (res.bonus || 0), summary: res.summary || '' };
    this.result.total = Math.max(0, base + this.result.bonus - this.penalty);
    audio.sfx(stars > 0 ? 'win' : 'lose'); audio.duck(false);
    ui.hud.setHint(null);
    setTimeout(() => this.showResult(), res.delay ?? 900);
  }
  // Einde van een duel: { winner: SLOT (0..3|null), winners: [SLOT, ...] (teamspel of meerdere winnaars), score: [per slot], place?: [SLOT, ...] (1e eerst), summary }.
  // Resultaat: winner (slot van de eerste winnaar), winners (slots), ids (spelers-id per slot), winnerId (eerste winnaar-id of null), winnerIds (alle winnaar-id's, [] = gelijkspel),
  // scoreArr (per slot), scoreById ({ id: score }), place (spelers-id's, 1e eerst), teams (slot-indeling of null).
  // Heeft het spel `teams` en geeft het alleen `winner` (een slot), dan winnen alle teamgenoten van dat slot mee.
  finishPvp(res = {}) {
    if (this.finished) return; this.finished = true; this.state = 'result';
    const rep = (S.arcade.byGame[this.def.id]?.plays || 0) > 0;
    const base = Math.round(PVP_PAY * (rep ? 0.6 : 1));
    const okSlot = (k) => Number.isInteger(k) && k >= 0 && k < this.n;
    let winners = Array.isArray(res.winners) ? res.winners.filter((k, i, a) => okSlot(k) && a.indexOf(k) === i) : null;
    if (!winners) {
      const w = okSlot(res.winner) ? res.winner : null;
      winners = w == null ? [] : this.teams ? (this.teams.find((t) => t.includes(w)) || [w]).slice() : [w];
    }
    const winner = winners.length ? winners[0] : null;
    const scoreArr = res.score || this.ids.map(() => 0), ids = this.ids.slice();
    const scoreById = {}; ids.forEach((id, slot) => { scoreById[id] = scoreArr[slot] ?? 0; });
    // volgorde: opgegeven place (geldige permutatie van de slots) of winnaars eerst, daarna op score (hoog naar laag, gelijk = slot-volgorde)
    let order = Array.isArray(res.place) && res.place.length === this.n && res.place.every((k, i, a) => okSlot(k) && a.indexOf(k) === i) ? res.place.slice()
      : [...winners, ...this.slots().filter((k) => !winners.includes(k)).sort((a, b) => (scoreArr[b] ?? 0) - (scoreArr[a] ?? 0) || a - b)];
    this.result = { id: this.def.id, pvp: true, winner, winners: winners.slice(), scoreArr, ids, winnerId: winner == null ? null : ids[winner], winnerIds: winners.map((k) => ids[k]), place: order.map((k) => ids[k]), placeSlots: order, teams: this.teams ? this.teams.map((t) => t.slice()) : null, scoreById, stars: 0, base, penalty: 0, bonus: res.bonus || 0, summary: res.summary || '', twist: this.twist.name };
    if (this.extra && this.extra.daily && !this.practice && !dailyDone()) { this.result.daily = dailyBonus(); this.result.bonus += this.result.daily; }
    this.result.total = base + this.result.bonus;
    const skey = ids.slice().sort().join('-');   // reeks per paar: ander spel of ander paar = nieuwe reeks
    if (SERIES.id !== this.def.id || SERIES.key !== skey) { SERIES.id = this.def.id; SERIES.key = skey; SERIES.winsById = [0, 0, 0, 0]; SERIES.n = 0; }
    SERIES.n++; for (const k of winners) SERIES.winsById[ids[k]]++;
    SERIES.wins = ids.map((id) => SERIES.winsById[id]);
    audio.sfx(winner == null ? 'good' : 'win'); audio.duck(false); ui.hud.setHint(null);
    setTimeout(() => this.showResult(), res.delay ?? 1100);
  }
  showPvpResult() {
    const r = this.result; const w = r.winner; const W = r.winners || (w == null ? [] : [w]);
    const names = this.ids.map((_, i) => this.nameOf(i));
    const crowned = (i) => (this.n > 2 && W.includes(i) ? '👑 ' : '');
    const vs = this.n === 2
      ? h('div', { class: 'vs' }, h('span', { style: { color: PLAYER_CSS[0] } }, `${names[0]} ${r.scoreArr[0]}`), h('span', {}, '–'), h('span', { style: { color: PLAYER_CSS[1] } }, `${r.scoreArr[1]} ${names[1]}`))
      : h('div', { class: 'vs three' }, ...names.flatMap((nm, i) => [i ? h('span', {}, '·') : null, h('span', { style: { color: PLAYER_CSS[i] } }, `${crowned(i)}${nm} ${r.scoreArr[i] ?? 0}`)]));
    const title = W.length === 0 ? 'Gelijkspel!' : W.length === 1 ? `${names[W[0]]} wint!` : `${this.teams ? 'Team ' : ''}${W.map((k) => names[k]).join(' & ')} ${this.teams ? 'wint' : 'winnen'}!`;
    const medal = ['🥇', '🥈', '🥉', '4️⃣'];
    const places = this.n > 3 ? h('div', { class: 'places' }, ...r.placeSlots.flatMap((k, pi) => [pi ? h('span', {}, '·') : null, h('span', { style: { color: PLAYER_CSS[k] } }, `${medal[pi]} ${names[k]}`)])) : null;
    const card = h('div', { class: 'card pvp' },
      h('div', { style: { fontSize: '70px', textAlign: 'center' } }, W.length === 0 ? '🤝' : '👑'),
      h('h2', {}, title),
      vs,
      places,
      GAMEHAL ? h('p', { class: 'gh-quip' }, resultQuip({ names, winners: W, teams: !!this.teams, order: r.placeSlots, series: SERIES.n })) : null,   // impactID Gamehal: kantoorgrap onder de uitslag
      h('p', { style: { textAlign: 'center' }, html: r.summary || '' }),
      h('p', { class: 'small-note' }, `${this.twist.icon || ''} Twist: ${this.twist.name}`),
      h('div', { class: 'reward', html: this.practice ? '' : `🪙 +${r.total} ${coin(r.total)} voor jullie samen` + (r.daily ? `<div style="font-size:16px;font-weight:400">🌟 Dagduel-bonus: +${r.daily}</div>` : '') }),
      SERIES.n >= 2 ? h('p', { class: 'small-note', style: { fontSize: '17px' } }, `🔁 Reeks: ${names.map((nm, i) => (i ? `${SERIES.wins[i]} ${nm}` : `${nm} ${SERIES.wins[i]}`)).join(' – ')}`) : null,
      (this.canRematch = !(this.extra && (this.extra.tourney || this.extra.daily || this.extra.spooky))) ? (this.resOpts = h('div', { class: 'btnrow', style: { flexDirection: 'row', justifyContent: 'center', gap: '14px' } })) : h('div', { class: 'small-note' }, `Doorgaan: ${this.keysA()}`));
    if (this.canRematch) { this.resSel = 0; this.drawResOpts(); }
    this.resEl = ui.overlay(card);
    if (w != null && this.instance.celebrate) this.instance.celebrate(w, W.slice());
    setTimeout(() => { this.resultReady = true; }, 900);
    this._resCameo = setTimeout(() => { if (!this.closed) maybeCameo('result', Math.random, { allowOverlay: true }); }, 1500);
    if (this.instance.onResult) this.instance.onResult(r);
  }
  drawResOpts() {
    this.resOpts.innerHTML = '';
    [['🔁 Revanche!', true], ['➡️ Doorgaan', false]].forEach(([label, re], i) => this.resOpts.append(h('div', { class: 'btn' + (this.resSel === i ? ' sel' : ''), style: { width: 'auto', padding: '10px 18px', fontSize: '22px' }, onClick: () => { if (this.resultReady) this.close(re); } }, label)));
  }
  showResult() {
    if (this.isPvp) return this.showPvpResult();
    const r = this.result;
    const stars = h('div', { class: 'stars' }, ...[0, 1, 2].map(() => h('span', {}, '⭐')));
    const lines = [h('p', { style: { textAlign: 'center' }, html: r.summary || (r.stars >= 3 ? 'Geweldig werk!' : r.stars >= 1 ? 'Goed gedaan!' : 'Volgende keer beter...') })];
    if (this.practice) lines.push(h('p', { class: 'small-note' }, `Oefenmodus: geen ${coin()}`));
    const rows = [`Betaling: <b>${r.base}</b>`]; if (r.bonus) rows.push(`Bonus: <b>+${r.bonus}</b>`); if (r.penalty) rows.push(`Deurman-boete: <b>-${r.penalty}</b>`);
    const card = h('div', { class: 'card' }, h('h2', {}, r.stars > 0 ? 'Klus gedaan!' : 'Mislukt...'), stars, ...lines,
      h('div', { class: 'reward', html: this.practice ? '' : `🪙 ${r.total} ${coin(r.total)}<div style="font-size:16px;font-weight:400;opacity:.75">${rows.join(' · ')}</div>` }),
      h('div', { class: 'small-note' }, `Doorgaan: ${this.keysA()}`));
    this.resEl = ui.overlay(card);
    [...stars.children].forEach((s, i) => { if (i < r.stars) setTimeout(() => { s.classList.add('on'); audio.sfx('star', { rate: 1 + i * 0.2 }); }, 400 + i * 450); });
    setTimeout(() => { this.resultReady = true; }, 600 + r.stars * 450);
    this._resCameo = setTimeout(() => { if (!this.closed) maybeCameo('result', Math.random, { allowOverlay: true }); }, 1800);
    if (this.instance.onResult) this.instance.onResult(r);
  }
  close(rematch = false) {
    if (this.closed) return; this.closed = true;   // dubbel drukken mag niet dubbel tellen
    const r = this.result; const { app, def, onDone, practice, extra } = this; this.dispose();
    if (r.pvp) {
      if (!this.practice) {
        S.coins += r.total; S.totalEarned += r.total;
        const A = S.arcade; A.plays++; const g = (A.byGame[r.id] ||= { plays: 0, wins: [0, 0, 0, 0] }); g.plays++;
        while (g.wins.length < 4) g.wins.push(0); while (A.wins.length < 4) A.wins.push(0);
        const wids = r.winnerIds || (r.winnerId == null ? [] : [r.winnerId]);   // statistieken per spelers-id (niet per slot), voor alle winnaars
        if (!Array.isArray(g.streaks)) { g.streaks = [0, 0, 0, 0]; if (g.streakWho != null && g.streak) g.streaks[g.streakWho] = g.streak; }
        while (g.streaks.length < 4) g.streaks.push(0);
        if (!wids.length) { A.draws++; g.streak = 0; g.streakWho = null; g.streaks = [0, 0, 0, 0]; } else {
          for (let id = 0; id < 4; id++) g.streaks[id] = wids.includes(id) ? g.streaks[id] + 1 : 0;   // reeks per winnaar (g.streak/streakWho = de winnaar met de langste reeks)
          for (const wid of wids) { A.wins[wid]++; g.wins[wid]++; }
          const lead = wids.reduce((best, id) => (g.streaks[id] > g.streaks[best] ? id : best), wids[0]);
          g.streakWho = lead; g.streak = g.streaks[lead];
          g.best = Math.max(g.best || 0, g.streak);
        }
        if (r.ids && r.ids.length === 2) recordPair(r.ids[0], r.ids[1], r.winnerId);
        if (r.daily) completeDaily();
        persist();
      }
      if (rematch) { app.setMode(new MinigameMode(app, def, { onDone, practice, extra })); return; }
      this.onDone && this.onDone(r); return;
    }
    if (!this.practice) {
      S.coins += r.total; S.totalEarned += r.total;
      const j = (S.jobs[r.id] ||= { plays: 0, bestStars: 0, bestScore: 0 });
      j.plays++; j.bestStars = Math.max(j.bestStars, r.stars); j.bestScore = Math.max(j.bestScore, r.score);
      persist();
    }
    this.onDone && this.onDone(r);
  }

  // ---------------- render ----------------
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.particles.setViewportHeight(hh); if (this.instance.onResize) this.instance.onResize(w, hh); }
  render(renderer) {
    let ox = 0, oy = 0;
    const sa = this.shakeAmt;
    if (sa > 0.001) { ox = (Math.random() - 0.5) * sa; oy = (Math.random() - 0.5) * sa; this.camera.position.x += ox; this.camera.position.y += oy; this.shakeAmt *= 0.88; }
    renderer.render(this.scene, this.camera);
    if (sa > 0.001) { this.camera.position.x -= ox; this.camera.position.y -= oy; }
  }
  dispose() {
    removeEventListener('blur', this._onBlur);
    try { this.instance.dispose && this.instance.dispose(); } catch (e) { console.error(e); }
    clearTimeout(this._resCameo); stopCameo();
    this.tintEl && this.tintEl.remove(); this.introEl && this.introEl.remove(); this.pauseEl && this.pauseEl.remove(); this.resEl && this.resEl.remove();
    this.fx.particles.dispose(); this.fx.texts.dispose();
    disposeObject(this.scene);
    ui.hud.clear(); ui.clearScreens(); audio.duck(false);
    if (!this._slotsFreed) { this._slotsFreed = true; input.resetSlots(); setSlotPlayers([0, 1, 2, 3]); ui.hud.setSlots(null); }   // slot-mapping terug naar identiteit
  }
}

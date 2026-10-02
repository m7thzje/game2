import * as THREE from 'three';
import { input, KEY_LABELS } from './input.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { scare } from './scare.js';
import { S, persist } from '../save.js';
import { Particles, FloatTexts } from './particles.js';
import { makeBrother, makeNPC, PLAYER_CSS, PLAYER_COLORS } from './chars.js';
import { setupLights } from './lights.js';
import { h, clamp, mulberry32, disposeObject, rand } from './util.js';
import { pickTwist, applyTwist, blankIn, TWISTS } from './twist.js';

export const PAY = [10, 30, 55, 85];   // heitjes bij 0..3 sterren (x def.pay)
export const PVP_PAY = 20;             // heitjes voor een afgespeeld duel (gedeelde portemonnee)

// Een minigame-sessie: intro-kaart -> aftellen -> spelen -> resultaat
export class MinigameMode {
  constructor(app, def, { onDone, seed = Date.now(), practice = false, twist = null, extra = null } = {}) {
    this.app = app; this.def = def; this.onDone = onDone; this.practice = practice; this.extra = extra; this.forceTwist = twist;
    this.state = 'intro'; this.t = 0; this.paused = false; this.finished = false;
    this.penalty = 0; this.bonus = 0; this.events = 0;
    this.shakeAmt = 0; this.ready = [false, false];
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
    this.pvpIn = [blankIn(), blankIn()]; this.swapped = false; this.playT = 0; this.nextSwap = 12 + this.rng() * 8; this.giant = this.rng() < 0.5 ? 0 : 1;
    const forced = new URLSearchParams(location.search).get('twist') || twist;
    const allowed = S.settings.scare <= 0 ? (def.twists || TWISTS.map((t) => t.id)).filter((id) => id !== 'deurman') : def.twists;
    this.twist = this.isPvp ? pickTwist(allowed, this.rng, forced) : { id: 'none', name: 'Geen twist', desc: '' };
    const self = this;
    this.ctx = {
      scene: this.scene, camera: this.camera, renderer: r, input, audio, hud: ui.hud, fx: this.fx,
      rng: this.rng, THREE,
      players: [0, 1].map((i) => ({ index: i, name: S.names[i] || ['Wes', 'Jor'][i], color: PLAYER_COLORS[i], css: PLAYER_CSS[i] })),
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
      get giantIndex() { return T.id === 'giant' ? me.giant : -1; },
    };
    this.ctx.finishPvp = (res) => this.finishPvp(res);
    ui.hud.reset();
    this.instance = def.create(this.ctx);
    this.showIntro();
    audio.music(def.music || (def.mode === 'puzzle' ? 'puzzle' : 'game'));
    this._deurT = this.nextDeurTime(true);
    this._onBlur = () => { if (this.state === 'play' && !this.paused) this.pause(); };
    addEventListener('blur', this._onBlur);
  }

  nextDeurTime(first = false) {
    const lvl = S.settings.scare; if (lvl <= 0) return 1e9;
    const f = lvl === 1 ? 1.8 : lvl === 3 ? 0.65 : 1;
    if (this.isPvp && this.twist.id !== 'deurman') return 1e9;          // in duels alleen met de Deurman-twist
    if (this.twist.id === 'deurman') return first ? rand(8, 14) : rand(12, 20);
    return (first ? rand(22, 38) : rand(30, 55)) * f;
  }

  // ---------------- intro ----------------
  controlLines(i) {
    const k = KEY_LABELS[i];
    const lines = (this.def.controls || ['{move} bewegen', '{a} actie']).map((l) => l.replace('{move}', `<kbd>${k.move}</kbd>`).replace('{a}', `<kbd>${k.a}</kbd>`).replace('{b}', `<kbd>${k.b}</kbd>`));
    return lines;
  }
  showIntro() {
    const d = this.def;
    const modeTxt = { coop: 'Samenwerken', versus: 'Broer tegen broer', pvp: 'Duel: 1 tegen 1', puzzle: 'Puzzel' }[d.mode] || 'Samenwerken';
    const card = h('div', { class: 'card' },
      h('h2', {}, `${d.icon || ''} ${d.name}`),
      h('div', { class: 'giver' }, d.giver ? `Klus van ${d.giver}` : ''),
      h('div', { class: 'tags' }, h('span', { class: `tag ${d.mode === 'pvp' ? 'versus' : d.mode || 'coop'}` }, modeTxt), h('span', { class: 'tag' }, d.time ? `± ${d.time} sec` : 'Geen tijdslimiet')),
      h('p', { html: d.blurb || '' }),
      h('div', { class: 'ctrl' },
        ...[0, 1].map((i) => h('div', { style: { '--c': PLAYER_CSS[i] } }, h('h4', {}, S.names[i]), h('ul', {}, ...this.controlLines(i).map((l) => h('li', { html: l })))))),
      this.isPvp ? h('div', { class: 'twist' }, h('b', {}, `${this.twist.icon || '🎲'} TWIST: ${this.twist.name}`), h('span', {}, this.twist.id === 'giant' ? `${S.names[this.giant]} wordt de reus, ${S.names[1 - this.giant]} de dwerg!` : this.twist.desc)) : null,
      d.tip ? h('p', { class: 'small-note', html: '💡 ' + d.tip }) : null,
      h('div', { class: 'ready' }, ...[0, 1].map((i) => h('div', { style: { '--c': PLAYER_CSS[i] }, class: 'rdy' }, `${S.names[i]}: druk ${KEY_LABELS[i].a}`))),
      h('div', { class: 'small-note' }, 'Allebei klaar? Dan begint het! (Esc = terug naar het dorp)'));
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
    if (this.isPvp && this.state !== 'play') for (let i = 0; i < 2; i++) applyTwist(this.pvpIn[i], input.p[i], { id: 'none' }, this.t, i, false);
    if (this.state === 'intro') {
      for (let i = 0; i < 2; i++) if (input.p[i].aP) { this.ready[i] = !this.ready[i]; audio.sfx(this.ready[i] ? 'select' : 'click'); this.readyEls[i].classList.toggle('on', this.ready[i]); }
      if (this.instance.introUpdate) this.instance.introUpdate(dt);
      if (this.ready[0] && this.ready[1] && !this._starting) { this._starting = true; setTimeout(() => this.startCountdown(), 350); }
      if (escP) { this.quit(); return; }
    } else if (this.state === 'countdown') {
      this.cdT -= dt;
      const n = Math.ceil(this.cdT);
      if (n !== this._cdN && n > 0) { this._cdN = n; ui.hud.showBig(String(n), 800); audio.sfx('countdown'); }
      if (this.cdT <= 0) { this.state = 'play'; ui.hud.showBig('GA!', 700, '#ffe14a'); audio.sfx('go'); this.instance.onStart && this.instance.onStart(); }
      if (this.instance.introUpdate) this.instance.introUpdate(dt);
    } else if (this.state === 'play') {
      if (escP) { this.pause(); return; }
      if (!scare.active) {
        if (this.isPvp) this.updatePvp(dt);
        this.instance.update(dt);
        this._deurT -= dt;
        if (this._deurT <= 0 && !this.finished) this.deurEvent();
      }
    } else if (this.state === 'result') {
      if (this.instance.resultUpdate) this.instance.resultUpdate(dt);
      if (this.resultReady && (input.p[0].aP || input.p[1].aP)) this.close();
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
        this.nextSwap = this.swapped ? 8 + this.rng() * 5 : 14 + this.rng() * 8;
        ui.hud.showBig(this.swapped ? '🔄 WISSEL!' : '🔄 TERUG!', 1100, '#ffe14a'); audio.sfx('boing'); ui.flash('#ffe14a', 250);
        this.instance.onSwap && this.instance.onSwap(this.swapped);
      }
    }
    for (let i = 0; i < 2; i++) applyTwist(this.pvpIn[i], input.p[this.swapped ? 1 - i : i], T, this.t, i, this.swapped);
  }

  startCountdown() {
    this.introEl.remove(); this.state = 'countdown'; this.cdT = 3.2; this._cdN = 4;
    ui.hud.reset();
    this.instance.onCountdown && this.instance.onCountdown();
  }

  async deurEvent() {
    this._deurT = this.nextDeurTime();
    this.events++;
    const lvl = S.settings.scare;
    if (this.events % 3 === 2 && lvl >= 1) { // alleen sfeer: gekraak en geklop
      audio.sfx(Math.random() < 0.5 ? 'knock' : 'creak'); ui.hud.toast(Math.random() < 0.5 ? 'Wie klopt daar...?' : 'Hoorde je dat?'); return;
    }
    const lunge = Math.random() < (lvl >= 3 ? 0.5 : lvl === 2 ? 0.28 : 0);
    if (lvl >= 3 && Math.random() < 0.4) await scare.flicker(3);
    const res = await scare.stare({ hold: 2.2 + Math.random() * 1.2 });
    if (this.isPvp) {   // duel: wie bewoog verliest een punt (spel bepaalt hoe)
      if (res.caught) { const who = res.movers.map((m, i) => (m ? S.names[i] : null)).filter(Boolean).join(' en '); ui.hud.toast(`${who} bewoog! De Deurman neemt een punt af.`, 2800); this.instance.onDeurman && this.instance.onDeurman(res.movers); }
      else ui.hud.toast('Niemand bewoog. De Deurman is teleurgesteld...', 2200);
      return;
    }
    if (res.caught) { this.penalty += 10; ui.hud.toast('Je bewoog! De Deurman pakt 10 heitjes...', 2600); }
    else if (lunge) { await scare.jumpscare(); this.bonus += 5; ui.hud.toast('Hij sprong toch! (+5 heitjes durfal-bonus)', 2600); }
    else { this.bonus += 5; ui.hud.toast('Stil gebleven! +5 heitjes durfal-bonus', 2200); }
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
    this.result = { id: this.def.id, stars, score: res.score ?? 0, base, penalty: this.penalty, bonus: this.bonus + (res.bonus || 0), summary: res.summary || '' };
    this.result.total = Math.max(0, base + this.result.bonus - this.penalty);
    audio.sfx(stars > 0 ? 'win' : 'lose'); audio.duck(false);
    ui.hud.setHint(null);
    setTimeout(() => this.showResult(), res.delay ?? 900);
  }
  // Einde van een duel: { winner: 0|1|null, score: [a, b], summary }
  finishPvp(res = {}) {
    if (this.finished) return; this.finished = true; this.state = 'result';
    const rep = (S.arcade.byGame[this.def.id]?.plays || 0) > 0;
    const base = Math.round(PVP_PAY * (rep ? 0.6 : 1));
    this.result = { id: this.def.id, pvp: true, winner: res.winner ?? null, scoreArr: res.score || [0, 0], stars: 0, base, penalty: 0, bonus: res.bonus || 0, summary: res.summary || '', twist: this.twist.name };
    this.result.total = base + this.result.bonus;
    audio.sfx(res.winner == null ? 'good' : 'win'); audio.duck(false); ui.hud.setHint(null);
    setTimeout(() => this.showResult(), res.delay ?? 1100);
  }
  showPvpResult() {
    const r = this.result; const w = r.winner;
    const names = S.names;
    const card = h('div', { class: 'card pvp' },
      h('div', { style: { fontSize: '70px', textAlign: 'center' } }, w == null ? '🤝' : '👑'),
      h('h2', {}, w == null ? 'Gelijkspel!' : `${names[w]} wint!`),
      h('div', { class: 'vs' }, h('span', { style: { color: PLAYER_CSS[0] } }, `${names[0]} ${r.scoreArr[0]}`), h('span', {}, '–'), h('span', { style: { color: PLAYER_CSS[1] } }, `${r.scoreArr[1]} ${names[1]}`)),
      h('p', { style: { textAlign: 'center' }, html: r.summary || '' }),
      h('p', { class: 'small-note' }, `${this.twist.icon || ''} Twist: ${this.twist.name}`),
      h('div', { class: 'reward', html: this.practice ? '' : `🪙 +${r.total} heitjes voor jullie samen` }),
      h('div', { class: 'small-note' }, `Doorgaan: ${KEY_LABELS[0].a} of ${KEY_LABELS[1].a}`));
    this.resEl = ui.overlay(card);
    if (w != null && this.instance.celebrate) this.instance.celebrate(w);
    setTimeout(() => { this.resultReady = true; }, 900);
    if (this.instance.onResult) this.instance.onResult(r);
  }
  showResult() {
    if (this.isPvp) return this.showPvpResult();
    const r = this.result;
    const stars = h('div', { class: 'stars' }, ...[0, 1, 2].map(() => h('span', {}, '⭐')));
    const lines = [h('p', { style: { textAlign: 'center' }, html: r.summary || (r.stars >= 3 ? 'Geweldig werk!' : r.stars >= 1 ? 'Goed gedaan!' : 'Volgende keer beter...') })];
    if (this.practice) lines.push(h('p', { class: 'small-note' }, 'Oefenmodus: geen heitjes'));
    const rows = [`Betaling: <b>${r.base}</b>`]; if (r.bonus) rows.push(`Bonus: <b>+${r.bonus}</b>`); if (r.penalty) rows.push(`Deurman-boete: <b>-${r.penalty}</b>`);
    const card = h('div', { class: 'card' }, h('h2', {}, r.stars > 0 ? 'Klus gedaan!' : 'Mislukt...'), stars, ...lines,
      h('div', { class: 'reward', html: this.practice ? '' : `🪙 ${r.total} heitjes<div style="font-size:16px;font-weight:400;opacity:.75">${rows.join(' · ')}</div>` }),
      h('div', { class: 'small-note' }, `Doorgaan: ${KEY_LABELS[0].a} of ${KEY_LABELS[1].a}`));
    this.resEl = ui.overlay(card);
    [...stars.children].forEach((s, i) => { if (i < r.stars) setTimeout(() => { s.classList.add('on'); audio.sfx('star', { rate: 1 + i * 0.2 }); }, 400 + i * 450); });
    setTimeout(() => { this.resultReady = true; }, 600 + r.stars * 450);
    if (this.instance.onResult) this.instance.onResult(r);
  }
  close() {
    const r = this.result; this.dispose();
    if (r.pvp) {
      if (!this.practice) {
        S.coins += r.total; S.totalEarned += r.total;
        const A = S.arcade; A.plays++; const g = (A.byGame[r.id] ||= { plays: 0, wins: [0, 0] }); g.plays++;
        if (r.winner == null) A.draws++; else { A.wins[r.winner]++; g.wins[r.winner]++; }
        persist();
      }
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
    this.introEl && this.introEl.remove(); this.pauseEl && this.pauseEl.remove(); this.resEl && this.resEl.remove();
    this.fx.particles.dispose(); this.fx.texts.dispose();
    disposeObject(this.scene);
    ui.hud.clear(); ui.clearScreens(); audio.duck(false);
  }
}

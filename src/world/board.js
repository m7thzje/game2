// FEESTBORD: Mario Party-achtig bordspel voor Wes en Jor (en Juul bij 3, Sam bij 4 spelers) op één scherm. Knoopt de duels van de Speelhal aan elkaar.
// Aanroepen: app.goBoard({})  (opts.resume = verder met een lopend potje; opts.result/from/extra komen terug na een duel).
// De spelstatus staat in de module-variabele BOARD en overleeft de duels (playGame -> goBoard({result})).
import * as THREE from 'three';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { Particles, FloatTexts } from '../engine/particles.js';
import { h, clamp, damp, lerp, TAU, pick, rand, disposeObject, mat, mesh } from '../engine/util.js';
import { ARCADE_HALLS } from '../games/index.js';
import { isUnlocked } from '../engine/progress.js';
import { TWISTS } from '../engine/twist.js';
import { BoardWorld, TOKEN_S, numSprite, setSpriteText } from './board_scene.js';
import { BoardHud, Chooser, injectCss, pids, PI, pcss, klabel, cvar, PNAMES, DARK } from './board_ui.js';
import { splitTeams } from '../engine/party.js';
import * as D from './board_data.js';

let BOARD = null;                        // lopend potje (blijft bewaard tussen duels)
export const boardState = () => BOARD;
const NAMES = PNAMES;   // namen volgen S.names (Wes, Jor, Juul, Sam; in de Gamehal aanpasbaar)
const pc = () => D.playerCount();
const CONFETTI = [0xff4a6a, 0xffd23f, 0x3a9aff, 0x4ad86a, 0xb05aff, 0xff8a3a];
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class BoardMode {
  static async create(app, opts = {}) { return new BoardMode(app, opts); }
  constructor(app, opts) {
    this.app = app; this.opts = opts || {}; this.t = 0; this.alive = true; this.paused = false; this.leaving = false;
    this.timers = []; this.pressWait = null; this.chooser = null; this.modal = null; this.wait = null; this.dice = null; this.branch = null; this.active = null;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 700);
    this.fx = new Particles(2200); this.scene.add(this.fx.points); this.fx.setViewportHeight(innerHeight); this.texts = new FloatTexts(this.scene);
    this.world = new BoardWorld(this.scene, { low: S.settings.quality === 'low', n: ((opts.result !== undefined || opts.resume) && BOARD && !BOARD.over && BOARD.n) || pc() });
    this.camPos = new THREE.Vector3(0, 60, 50); this.camLook = new THREE.Vector3(0, 0, 0);
    this.cam = { x: 0, y: 0, z: 1, d: 1, mode: 'overview' };
    this.B = null; this._escHeld = true; this.fxT = 0;
  }
  get names() { return NAMES; }

  // ------------------------------------------------------------------ levenscyclus
  enter() {
    injectCss(); this.hud = new BoardHud(this.world.tokens.length); audio.music('menu'); ui.fade(0, 700); this.enterT = this.t;
    this.start().catch((e) => { console.error('feestbord', e); });
  }
  exit() {
    this.alive = false; this.timers.length = 0; this.chooser && this.chooser.dispose(); this.hud && this.hud.dispose(); this.modal && this.modal.el.remove();
    try { disposeObject(this.scene); this.fx.dispose(); this.texts.dispose(); } catch (e) { console.warn('opruimen bord', e); }
    ui.clearScreens(); ui.activeMenus = []; ui.hudEl.innerHTML = ''; ui.setVignette(0);
  }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }
  render(renderer) { renderer.render(this.scene, this.camera); }

  async start() {
    const o = this.opts; const B0 = BOARD;
    this.camOverview(); this.camPos.set(0, 70, 52);   // openingsshot: van hoog naar beneden
    if (o.result !== undefined && B0 && B0.pendingDuel) { this.bind(B0); audio.music('concert'); await this.afterDuel(o.result); await this.run(); return; }
    if (o.resume && B0 && !B0.over) { this.bind(B0); audio.music('concert'); await this.run(); return; }
    if (o.manual) { const rounds = (S.arcade.board && S.arcade.board.rounds) || 10; this.fixStats(); BOARD = D.newState(rounds, this.world.tokens.length); this.bind(BOARD); this.camFollow(this.world.tokens[0].pos); return; }   // testhaak: geen lus, de test roept de onderdelen zelf aan
    const ch = await this.intro();
    if (ch === 'back') { await this.toArcade(); return; }
    audio.music('concert'); await this.run();
  }
  // koppelt de spelstatus aan de 3D-wereld
  bind(B) {
    this.B = B; const w = this.world;
    w.setTrophyNode(B.trophyNode);
    B.n ??= B.players.length; B.players.forEach((p, i) => { const tk = w.tokens[i]; tk.pos.copy(this.spot(i, p.node)); tk.c.targetYaw = tk.c.yaw = Math.PI; w.setHat(i, p.hat ? 'tophat' : null); });
    for (const t of B.traps) w.addTrap(t.node);
    this.hud.show(); this.setActive(null); this.hud.update(B, null);
  }
  // plek van speler i op vakje node, naast de anderen die er (volgens nodes) al staan
  spot(i, node, nodes = null) {
    const ps = this.B.players, at = (k) => (nodes ? nodes[k] : ps[k].node);
    const grp = ps.map((p, k) => k).filter((k) => k === i || at(k) === node);
    return this.world.slotAt(node, grp.indexOf(i), grp.length);
  }
  get n() { return this.B ? this.B.players.length : this.world.tokens.length; }
  // spelersstatistiek van het bord: wins altijd 4 lang (oude opslag met 2 of 3 waarden aanvullen)
  fixStats() { const A = S.arcade; const bs = (A.board ||= { plays: 0, wins: [0, 0, 0, 0] }); bs.plays ||= 0; bs.wins = [0, 1, 2, 3].map((k) => (bs.wins && bs.wins[k]) || 0); return bs; }
  setActive(i) { this.active = i; this.world.tokens.forEach((tk, k) => { tk.arrow.visible = i === k; }); }

  // ------------------------------------------------------------------ hulpjes: tijd, tweens, invoer
  sleep(sec) { return new Promise((res) => { this.timers.push({ t: sec, res }); }); }
  tween(dur, fn) { return new Promise((res) => { this.timers.push({ t: 0, dur, fn, res }); }); }
  hint(html) { this.hud.setHint(html); }
  key(i, k) { return `<kbd>${klabel(i)[k]}</kbd>`; }
  pressed(who) { const P = PI(); return who >= 0 ? P[who].aP : pids().some((k) => P[k].aP); }
  // keuzemenu voor de speler aan de beurt (who) -> index
  choose(who, title, options, { sub = '', cancel = null } = {}) {
    const c = new Chooser({ who, title, sub, options, cancel }); this.chooser = c; this.wait = { kind: 'menu', who, n: options.length };
    return c.promise.then((r) => { if (this.chooser === c) this.chooser = null; this.wait = null; return r; });
  }
  // bijschrift: wacht een tijdje of tot iemand op A drukt
  async say(title, text, { icon = '', sec = null, color = null } = {}) {
    const el = this.hud.caption(title, text, icon, color); const dur = sec ?? clamp(1.5 + text.replace(/<[^>]+>/g, '').length * 0.035, 2.0, 6);
    this.wait = { kind: 'say' };
    await new Promise((res) => { this.timers.push({ t: dur, res, skippable: true, minT: 0.5, age: 0 }); });
    this.wait = null; if (this.hud.capEl === el) this.hud.clearCaption();
  }
  modalCard(card) { return new Promise((res) => { const el = ui.overlay(card); this.modal = { el, res, t: 0.35 }; this.wait = { kind: 'modal' }; }); }
  confetti(p, n = 60, o = {}) { this.fx.burst(p.x, p.y, p.z, { count: n, colors: CONFETTI, speed: 7, size: 0.4, life: 1.5, gravity: 5, ...o }); }
  floatText(text, p, color = '#ffe14a', scale = 1) { this.texts.add(text, p.x, p.y + 2.4, p.z, color, scale); }

  // ------------------------------------------------------------------ camera
  camOverview() { this.cam = { x: 0, y: 0, z: 1.5, d: 1, mode: 'overview' }; }
  camFollow(v, zoom = 1) { this.cam = { x: v.x, y: v.y, z: v.z, d: zoom, mode: 'follow' }; }
  camBoth(zoom = 1) {   // alle poppetjes in beeld
    const ps = this.world.tokens.map((t) => t.pos); let sep = 0; for (const a of ps) for (const b of ps) sep = Math.max(sep, a.distanceTo(b));
    this.cam = { x: ps.reduce((q, v) => q + v.x, 0) / ps.length, y: 0, z: ps.reduce((q, v) => q + v.z, 0) / ps.length, d: zoom * (1 + clamp(sep / 24, 0, 0.7)), mode: 'follow' };
  }
  updateCamera(dt) {
    const asp = this.camera.aspect, ka = Math.max(1, 1.7 / asp); const c = this.cam;
    const base = c.mode === 'overview' ? [0, 26, 23.5] : [0, 13, 9];
    const k = c.d * ka; const gx = c.x + base[0] * k, gy = c.y + base[1] * k, gz = c.z + base[2] * k;
    this.camPos.x = damp(this.camPos.x, gx, 3.2, dt); this.camPos.y = damp(this.camPos.y, gy, 3, dt); this.camPos.z = damp(this.camPos.z, gz, 3.2, dt);
    this.camLook.x = damp(this.camLook.x, c.x, 4.5, dt); this.camLook.y = damp(this.camLook.y, c.y + 0.8, 4.5, dt); this.camLook.z = damp(this.camLook.z, c.z, 4.5, dt);
    this.camera.position.copy(this.camPos); this.camera.position.x += Math.sin(this.t * 0.3) * 0.25;
    if (this.shake > 0.001) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= 0.9; }
    this.camera.lookAt(this.camLook);
  }

  // ------------------------------------------------------------------ start-kaart met uitleg
  legendHtml() {
    const n = this.n; return Object.entries(D.TILES).map(([id, t]) => `<div><span>${t.icon}</span><div><b>${t.name.replace(' vakje', '')}</b><br><small>${D.tileDesc(id, n)}</small></div></div>`).join('');
  }
  async intro() {
    const A = S.arcade; const bs = this.fixStats(); bs.rounds ||= 10; const N = pc(); A.offTwists ||= [];
    const allTw = TWISTS.filter((t) => t.id !== 'none').map((t) => t.id);
    const twLabel = () => (allTw.every((id) => A.offTwists.includes(id)) ? 'uit' : A.offTwists.length ? `deels aan (${allTw.length - A.offTwists.length}/${allTw.length})` : 'aan');
    const old = BOARD && !BOARD.over && BOARD.players.length === N ? BOARD : null;
    const keys = [], opts = [];
    if (old) { keys.push('resume'); opts.push({ label: `▶ Verder spelen (ronde ${Math.min(old.round, old.rounds)}/${old.rounds})` }); }
    keys.push('start'); opts.push({ label: old ? '🔄 Nieuw potje' : '🎉 Start het feest!' });
    keys.push('rounds'); opts.push({ label: () => `⏱️ Rondes: ${bs.rounds}  (◀ ▶)`, cycle: (d) => { const L = [5, 10, 15]; bs.rounds = L[(L.indexOf(bs.rounds) + d + L.length) % L.length] || 10; } });
    keys.push('tw'); opts.push({ label: () => `🌀 Twists in duels: ${twLabel()}`, cycle: () => { A.offTwists = allTw.every((id) => A.offTwists.includes(id)) ? [] : allTw.slice(); } });
    keys.push('back'); opts.push({ label: '↩ Terug naar de Speelhal' });
    const card = h('div', { class: 'card bd-card bd-grid' },
      h('h2', {}, '🎉 Het Feestbord!'),
      h('p', { style: { textAlign: 'center' }, html: N === 4
        ? `<b>${NAMES[0]}</b>, <b>${NAMES[1]}</b>, <b>${NAMES[2]}</b> en <b>${NAMES[3]}</b> racen over het feesteiland: dobbel om de beurt, hop over de vakjes en verzamel <b>🏆 Trofeeën</b>. Na elke ronde volgt een <b>MINI-SPEL</b> uit de Speelhal: met zijn vieren (of 2 tegen 2), of een duel waarbij de andere twee als toeschouwers raden wie wint (+${D.CFG.spectBonus} munten)!`
        : N === 3
        ? `<b>${NAMES[0]}</b>, <b>${NAMES[1]}</b> en <b>${NAMES[2]}</b> racen over het feesteiland: dobbel om de beurt, hop over de vakjes en verzamel <b>🏆 Trofeeën</b>. Na elke ronde volgt een <b>MINI-SPEL</b> uit de Speelhal: een 3-speler-spel, of een duel waarbij de derde als toeschouwer raadt wie wint (+${D.CFG.spectBonus} munten)!`
        : `<b>${NAMES[0]}</b> en <b>${NAMES[1]}</b> racen over het feesteiland: dobbel om de beurt, hop over de vakjes en verzamel <b>🏆 Trofeeën</b>. Na elke ronde volgt een <b>MINI-DUEL</b> uit de Speelhal!` }),
      h('div', { class: 'bd-keys' + (N === 3 ? ' k3' : N === 4 ? ' k4' : '') }, ...pids().map((i) => cvar(h('div', { html: `<b>${NAMES[i]}</b>: <kbd>${klabel(i).a}</kbd> stop de dobbelsteen (timing!) · <kbd>${klabel(i).b}</kbd> item gebruiken · <kbd>${klabel(i).move}</kbd> route kiezen` }), pcss(i)))),
      h('div', { class: 'bd-legend', html: this.legendHtml() }),
      h('p', { class: 'small-note', html: `Winnen: de meeste 🏆 (${D.CFG.trophyPrice} munten, achterstaanders krijgen korting), dan de meeste munten, dan het lot. Beloning: heitjes voor jullie samen!${N >= 3 ? ' Wie achterstaat krijgt hulp van de Feestfee!' : ''} · <kbd>Esc</kbd> = pauze` }));
    const ch = new Chooser({ who: -1, options: opts, plain: true, host: card }); this.chooser = ch; this.wait = { kind: 'intro', n: opts.length };
    const el = ui.overlay(card, 'clear'); el.style.background = 'rgba(20,8,40,.35)'; el.style.alignItems = 'flex-start'; el.style.paddingTop = '2vh';
    const i = await ch.promise; this.chooser = null; this.wait = null; el.remove(); const k = keys[i];
    if (k === 'back') return 'back';
    if (k === 'resume') { this.bind(old); return 'go'; }
    BOARD = D.newState(bs.rounds, N); this.bind(BOARD); return 'go';
  }
  async helpCard() {
    const card = h('div', { class: 'card bd-card' }, h('h2', {}, 'Hoe werkt het Feestbord?'),
      h('p', { html: `Elke ronde dobbelt iedereen één keer. Druk op je actieknop om de draaiende dobbelsteen te <b>stoppen</b>: mik op een hoog getal! Met je B-knop gebruik je eerst een <b>item</b> (🎲 dubbel, 👟 snelschoen, 🌀 teleporteer, 🍌 banaan-val, 🛡️ schild). Na ieders beurt volgt een <b>${this.n >= 3 ? 'mini-spel' : 'mini-duel'}</b>: winnaar +${D.CFG.duelWin} munten, verliezer +${D.CFG.duelLose}.${this.n === 3 ? ` Bij een duel raadt de derde speler wie wint: goed geraden is +${D.CFG.spectBonus} munten. Een 3-speler-spel geeft ${D.PLACE_PTS.join(' / ')} munten voor plek 1 / 2 / 3.` : this.n === 4 ? ` Bij een duel raden de andere twee wie wint: goed geraden is +${D.CFG.spectBonus} munten. Een spel met zijn vieren geeft ${D.PLACE_PTS4.join(' / ')} munten voor plek 1 t/m 4; bij een teamspel krijgt elk lid van het winnende team +${D.CFG.duelWin} en van het andere team +${D.CFG.duelLose}.` : ''}` }),
      h('div', { class: 'bd-legend', html: this.legendHtml() }),
      h('p', { class: 'small-note', html: 'Drukken op een actieknop sluit dit scherm.' }));
    await this.modalCard(card);
  }

  // ------------------------------------------------------------------ hoofdlus
  async run() {
    const B = this.B;
    while (this.alive && !B.over) {
      if (B.phase === 'turn') await this.playTurn(B.turn);
      else if (B.phase === 'roundduel') await this.roundDuel();
      else if (B.phase === 'end') { await this.ceremony(); break; }
    }
  }
  nm(i) { return NAMES[i]; }
  cssName(i) { return `<b style="color:${DARK[i]}">${NAMES[i]}</b>`; }

  async playTurn(i) {
    const B = this.B, p = B.players[i], tk = this.world.tokens[i];
    this.setActive(i); this.hud.update(B, i); this.camFollow(tk.pos); audio.sfx('select');
    this.hud.pop(`${NAMES[i]}!`, pcss(i)); await this.sleep(0.9);
    p.mods = {};
    if (D.isBehind(B, i) && B.round >= 2 && Math.random() < 0.4) await this.feestfee(i);
    let again = true;
    while (again && this.alive) {
      again = false; const r = await this.rollAndMove(i); if (r && r.again) again = true; if (r && r.duel) return;
    }
    this.endTurn();
  }
  endTurn() {
    const B = this.B; B.turn++; if (B.turn >= B.players.length) { B.turn = 0; B.phase = 'roundduel'; }
    this.setActive(null); this.hud.update(B, null);
  }
  // Mario Party-comeback: achterstaander krijgt vaker een extra dobbelsteen of een item
  async feestfee(i) {
    const B = this.B, p = B.players[i]; this.camFollow(this.world.tokens[i].pos, 0.8);
    this.confetti(this.world.tokens[i].pos.clone().add(new THREE.Vector3(0, 2, 0)), 30); audio.sfx('sparkle');
    if (p.items.length < D.MAX_ITEMS && Math.random() < 0.5) { const id = this.randItem(); p.items.push(id); this.hud.update(B, i); await this.say('🧚 De Feestfee helpt!', `${this.cssName(i)} staat achter, dus de fee toverde een gratis item tevoorschijn: ${D.ITEMS[id].icon} <b>${D.ITEMS[id].name}</b>!`, { icon: '🧚', color: '#ff7ad0' }); }
    else { p.mods.double = true; await this.say('🧚 De Feestfee helpt!', `${this.cssName(i)} gooit deze beurt met <b>twee dobbelstenen</b>. Gratis, want de fee mag dat.`, { icon: '🧚', color: '#ff7ad0' }); }
  }
  randItem() { const bag = ['double', 'double', 'speed', 'speed', 'banana', 'banana', 'shield', 'shield', 'teleport']; return pick(bag); }

  // ------------------------------------------------------------------ dobbelen
  async rollAndMove(i) {
    const B = this.B, p = B.players[i], tk = this.world.tokens[i];
    this.camFollow(tk.pos); const r = await this.rollDice(i);
    if (r.teleport) return this.land(i);
    const steps = r.sum + (p.mods.speed ? D.CFG.speedBonus : 0); p.mods = {};
    await this.move(i, steps);
    return this.land(i);
  }
  async rollDice(i) {
    const B = this.B, p = B.players[i], w = this.world, tk = w.tokens[i];
    const dbl = !!p.mods.double; const maxV = dbl ? 6 : D.CFG.dieMax;
    this.dice = { who: i, count: dbl ? 2 : 1, max: maxV, ph: [0, 2.2], vals: [1, 1], stopped: 0, frozen: false, cool: 0.5, shown: [0, 0] };
    w.dice.visible = true; w.diceMeshes[1].visible = dbl;
    for (;;) {
      const d = this.dice; this.wait = { kind: 'dice', who: i };
      this.hint(`${this.cssName(i)}: ${this.key(i, 'a')} = stop de dobbelsteen${d.count > 1 ? ' (twee keer!)' : ''} · ${this.key(i, 'b')} = item gebruiken${p.mods.speed ? ' · 👟 actief' : ''}`);
      const ev = await new Promise((res) => { this.pressWait = { who: i, res }; });
      this.pressWait = null;
      if (ev === 'b' && d.stopped === 0) {
        d.frozen = true; const used = await this.itemMenu(i); d.frozen = false; this.hud.update(B, i);
        if (used === 'teleport') { w.dice.visible = false; this.dice = null; this.wait = null; this.hint(''); return { teleport: true }; }
        if (p.mods.double && d.count === 1) { d.count = 2; d.max = 6; w.diceMeshes[1].visible = true; }
        continue;
      }
      if (ev === 'a') {
        d.vals[d.stopped] = d.shown[d.stopped] || d.vals[d.stopped]; const k = d.stopped; d.stopped++; audio.sfx('pop'); w.diceMeshes[k].userData.pop = 0.4; this.shake = 0.15;
        if (d.stopped >= d.count) break;
      }
    }
    this.wait = null; this.hint('');
    const d = this.dice; const sum = d.vals.slice(0, d.count).reduce((a, b) => a + b, 0);
    await this.sleep(0.6); this.hud.pop(`${sum}${p.mods.speed ? ' +' + D.CFG.speedBonus : ''}`, '#ffe14a'); audio.sfx('win'); this.confetti(tk.pos.clone().add(new THREE.Vector3(0, 3, 0)), 24);
    await this.sleep(0.8); w.dice.visible = false; this.dice = null;
    return { sum };
  }
  async itemMenu(i) {
    const B = this.B, p = B.players[i], w = this.world;
    if (!p.items.length) { await this.say('Geen items', `Je hebt nog geen items. Koop ze in de 🛍️ winkel of win ze op de kanskaarten!`, { sec: 2.2 }); return null; }
    const opts = p.items.map((id) => ({ label: `${D.ITEMS[id].icon} ${D.ITEMS[id].name}`, sub: D.ITEMS[id].desc })); opts.push({ label: '← Terug' });
    const c = await this.choose(i, 'Welk item gebruik je?', opts, { cancel: opts.length - 1 });
    if (c >= p.items.length) return null; const id = p.items[c];
    if (id === 'banana' && B.traps.some((t) => t.node === p.node)) { await this.say('Al een banaan', 'Hier ligt al een banaan. Eentje is genoeg, anders wordt het een fruitmand.', { sec: 2 }); return null; }
    p.items.splice(c, 1); this.hud.update(B, i); audio.sfx('powerup');
    const tk = w.tokens[i]; this.fx.burst(tk.pos.x, tk.pos.y + 1.5, tk.pos.z, { count: 20, colors: [0xffe14a, 0xffffff], speed: 4, life: 0.8 });
    if (id === 'double') { p.mods.double = true; this.floatText('🎲🎲', tk.pos, '#ffffff'); }
    else if (id === 'speed') { p.mods.speed = true; this.floatText('👟 +3', tk.pos, '#ffe14a'); }
    else if (id === 'shield') { p.shield = true; this.floatText('🛡️', tk.pos, '#9cc8ff'); }
    else if (id === 'banana') { B.traps.push({ node: p.node, owner: i }); w.addTrap(p.node); this.floatText('🍌', tk.pos, '#ffe14a'); }
    else if (id === 'teleport') { await this.teleportTo(i, B.trophyNode); return 'teleport'; }
    return id;
  }
  async teleportTo(i, node) {
    const B = this.B, p = B.players[i], w = this.world, tk = w.tokens[i]; tk.busy = true; audio.sfx('whoosh');
    await this.tween(0.5, (k) => { tk.c.group.scale.setScalar(TOKEN_S * (1 - k)); tk.c.targetYaw += 0.4; });
    p.node = node; tk.pos.copy(this.spot(i, node)); this.camFollow(tk.pos); await this.sleep(0.25);
    this.confetti(tk.pos.clone().add(new THREE.Vector3(0, 1, 0)), 30); audio.sfx('sparkle');
    await this.tween(0.5, (k) => { tk.c.group.scale.setScalar(TOKEN_S * k); }); tk.c.group.scale.setScalar(TOKEN_S); tk.busy = false;
  }

  // ------------------------------------------------------------------ lopen
  async hop(i, to, dur = 0.34) {
    const B = this.B, w = this.world, tk = w.tokens[i], p = B.players[i]; tk.busy = true;
    const from = tk.pos.clone(); const dest = this.spot(i, to, B.players.map((q, k) => (k === i ? to : q.node)));
    tk.c.targetYaw = Math.atan2(dest.x - from.x, dest.z - from.z); tk.c.jump(); audio.sfx('jump', { vol: 0.25, rate: 1.1 });
    await this.tween(dur, (k) => { tk.pos.lerpVectors(from, dest, k); tk.y = Math.sin(k * Math.PI) * 1.2; tk.c.air = k > 0.1 && k < 0.9; });
    tk.pos.copy(dest); tk.y = 0; tk.c.air = false; tk.busy = false; p.node = to; this.fx.dust(dest.x, dest.y, dest.z, 4, 0xfff2c0);
  }
  async move(i, steps) {
    const B = this.B, p = B.players[i], w = this.world, tk = w.tokens[i];
    tk.cnt.visible = true; setSpriteText(tk.cnt, steps, '#ffe14a'); tk.arrow.visible = false; let rem = steps;
    while (rem > 0 && this.alive) {
      const nd = D.GRAPH.nodes[p.node]; let nxt = nd.next[0];
      if (nd.next.length > 1) { tk.cnt.visible = false; nxt = await this.pickBranch(i, nd, rem); tk.cnt.visible = true; }
      this.camFollow(w.nodeTop(nxt)); await this.hop(i, nxt); rem--; setSpriteText(tk.cnt, rem, '#ffe14a');
      this.camFollow(tk.pos);
      const tr = B.traps.find((t) => t.node === nxt && t.owner !== i); if (tr) { tk.cnt.visible = false; await this.slip(i, tr); return { slipped: true }; }
      if (rem > 0 && nxt === B.trophyNode) await this.trophyOffer(i, true);
    }
    tk.cnt.visible = false; tk.arrow.visible = this.active === i; return {};
  }
  // splitsing: speler kiest de route (pijltjes/richting + A)
  async pickBranch(i, nd, rem) {
    const w = this.world, opts = nd.next.map((id) => D.GRAPH.nodes[id]); let sel = 0; const marks = [];
    for (const o of opts) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffe14a })); m.position.set(o.x, o.y + 3.1, o.z); this.scene.add(m); marks.push(m); }
    const lb = nd.next.length; this.camFollow(w.tokens[i].pos, 1.25);
    this.hint(`${this.cssName(i)}: <b>splitsing!</b> Kies je route met ${klabel(i).move} (links/rechts) en bevestig met ${this.key(i, 'a')} · nog ${rem} stap${rem > 1 ? 'pen' : ''}`);
    this.branch = { who: i, opts, sel: 0, n: lb, t: 0.3, marks }; this.wait = { kind: 'branch', who: i, n: lb };
    sel = await new Promise((res) => { this.branch.res = res; });
    this.branch = null; this.wait = null; this.hint(''); marks.forEach((m) => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    this.camFollow(w.tokens[i].pos); return opts[sel].id;
  }
  async slip(i, tr) {
    const B = this.B, w = this.world, tk = w.tokens[i], p = B.players[i];
    B.traps = B.traps.filter((t) => t !== tr); w.removeTrap(tr.node); audio.sfx('boing'); tk.busy = true; const y0 = tk.c.yaw;
    await this.tween(0.8, (k) => { tk.c.yaw = y0 + k * TAU * 2; tk.c.targetYaw = tk.c.yaw; tk.y = Math.sin(k * Math.PI) * 1.6; }); tk.y = 0; tk.busy = false;
    this.floatText('🍌 Uitgegleden!', tk.pos, '#ffe14a'); await this.loseCoins(i, 3, `${this.cssName(i)} glijdt uit over de banaan van ${this.cssName(tr.owner)}!`, true);
  }

  // ------------------------------------------------------------------ munten
  coinFx(i, n) { const tk = this.world.tokens[i]; this.floatText((n > 0 ? '+' : '−') + Math.abs(n), tk.pos, n > 0 ? '#ffe14a' : '#ff6b6b', 1.2); if (n > 0) { audio.sfx('coin'); this.fx.burst(tk.pos.x, tk.pos.y + 1.6, tk.pos.z, { count: 14, colors: [0xffd23f, 0xfff0a0], speed: 4, life: 0.9, size: 0.3 }); } else audio.sfx('bad'); }
  addCoins(i, n) { const p = this.B.players[i]; p.coins += n; this.coinFx(i, n); this.hud.update(this.B, this.active); }
  // verlies (schild blokkeert); geeft true als het echt afgetrokken is
  async loseCoins(i, n, text = null, caption = false) {
    const p = this.B.players[i];
    if (p.shield) { p.shield = false; this.floatText('🛡️ Geblokt!', this.world.tokens[i].pos, '#9cc8ff', 1.2); audio.sfx('ding'); this.hud.update(this.B, this.active); if (caption) await this.say('🛡️ Schild!', 'Het schild blokkeert het verlies. Ping!', { sec: 1.6 }); else await this.sleep(0.5); return false; }
    const m = Math.min(n, p.coins); p.coins -= m; this.coinFx(i, -n); this.hud.update(this.B, this.active);
    if (caption && text) await this.say('Au!', `${text} <b>−${m}</b> munten.`, { sec: 2.2 }); else await this.sleep(0.6); return true;
  }
  giveItem(i, id) { const p = this.B.players[i]; if (p.items.length >= D.MAX_ITEMS) return false; p.items.push(id); this.hud.update(this.B, this.active); audio.sfx('powerup'); this.floatText(D.ITEMS[id].icon, this.world.tokens[i].pos, '#fff', 1.4); return true; }

  // ------------------------------------------------------------------ vakje-effecten
  async land(i) {
    const B = this.B, p = B.players[i], w = this.world, tk = w.tokens[i]; const type = D.tileType(B, p.node); const info = D.TILES[type];
    this.camFollow(tk.pos, 0.9); await this.sleep(0.15);
    this.fx.ring(tk.pos.x, tk.pos.y + 0.3, tk.pos.z, { count: 16, speed: 3, color: info.color });
    switch (type) {
      case 'blue': this.addCoins(i, D.CFG.blue); await this.sleep(0.8); return {};
      case 'red': await this.loseCoins(i, D.CFG.red, `${this.cssName(i)} stapt in een rood vakje.`, true); return {};
      case 'dice': audio.sfx('powerup'); await this.say('🎲 Extra dobbelsteen!', `${this.cssName(i)} mag nog een keer gooien!`, { icon: '🎲', sec: 1.8 }); if (D.isBehind(B, i)) this.addCoins(i, 2); return { again: true };
      case 'shop': return this.shop(i);
      case 'trophy': return this.trophyOffer(i, false).then(() => ({}));
      case 'duel': return this.tileDuel(i);
      case 'deur': return this.deurEvent(i);
      case 'chance': return this.chanceCard(i);
      case 'party': return this.party(i);
      default: return {};
    }
  }
  async party(i) {
    const w = this.world, os = D.others(this.B, i); audio.sfx('win'); this.addCoins(i, 4); os.forEach((k) => this.addCoins(k, 2)); w.tokens.forEach((tk) => { tk.c.pose = 'dance'; this.confetti(tk.pos.clone().add(new THREE.Vector3(0, 2, 0)), 40); });
    await this.say('⭐ FEEST!', `${pick(D.PARTY_LINES)} ${this.cssName(i)} +4, ${D.joinList(os.map((k) => this.cssName(k)))} +2.`, { icon: '⭐', sec: 2.8 }); w.tokens.forEach((tk) => { tk.c.pose = 'idle'; }); return {};
  }
  async shop(i) {
    const B = this.B, p = B.players[i]; this.camFollow(this.world.tokens[i].pos, 0.8); audio.sfx('bell');
    await this.say('🛍️ Itemwinkel', 'Welkom! Alles is tweedehands, behalve de dingen die nieuw zijn. Wat mag het zijn?', { icon: '🛍️', sec: 2.0 });
    for (;;) {
      const ids = D.ITEM_IDS; const opts = ids.map((id) => ({ label: `${D.ITEMS[id].icon} ${D.ITEMS[id].name} — ${D.ITEMS[id].price} 🪙`, sub: D.ITEMS[id].desc, disabled: p.coins < D.ITEMS[id].price || p.items.length >= D.MAX_ITEMS })); opts.push({ label: '✔ Klaar' });
      const c = await this.choose(i, `🛍️ Winkel — jij hebt ${p.coins} 🪙 (${p.items.length}/${D.MAX_ITEMS} items)`, opts, { cancel: opts.length - 1 });
      if (c >= ids.length) break; const it = D.ITEMS[ids[c]]; p.coins -= it.price; p.items.push(it.id); this.coinFx(i, -it.price); audio.sfx('coin'); this.hud.update(B, i); this.floatText(it.icon, this.world.tokens[i].pos, '#fff', 1.4);
      if (p.items.length >= D.MAX_ITEMS || p.coins < 3) break;
    }
    return {};
  }
  // Trofee kopen (bij landen, of onderweg langslopen)
  async trophyOffer(i, passing) {
    const B = this.B, p = B.players[i], w = this.world; const price = D.trophyPrice(B, i);
    this.camFollow(w.nodeTop(B.trophyNode), 0.8);
    if (p.coins < price) { if (!passing) await this.say('🏆 De Trofee', `De Trofee kost <b>${price}</b> munten, ${this.cssName(i)} heeft er ${p.coins}. Spaar nog even!`, { icon: '🏆', sec: 2.2 }); return; }
    const disc = price < D.CFG.trophyPrice ? ` <i>(achterstaander-korting!)</i>` : '';
    const c = await this.choose(i, `🏆 Koop de Trofee voor ${price} munten?`, [{ label: `Ja! Geef mij die Trofee (−${price} 🪙)` }, { label: 'Nee, ik spaar liever' }], { sub: `Je hebt ${p.coins} 🪙.${disc}`, cancel: 1 });
    if (c !== 0) return;
    p.coins -= price; p.trophies++; this.coinFx(i, -price); this.hud.update(B, i); audio.sfx('win'); ui.flash('#fff6c0', 260);
    const tk = w.tokens[i]; tk.c.pose = 'cheer'; this.confetti(tk.pos.clone().add(new THREE.Vector3(0, 2, 0)), 90, { speed: 9 });
    await this.say('🏆 TROFEE!', `${this.cssName(i)} koopt de Trofee! Hij is nu van jou. Echt waar. Je mag hem poetsen.`, { icon: '🏆', sec: 2.6 }); tk.c.pose = 'idle';
    await this.moveTrophy();
  }
  async moveTrophy() {
    const B = this.B, w = this.world; const cands = D.GRAPH.spots.filter((s) => s !== B.trophyNode); const to = pick(cands);
    this.camOverview(); await this.sleep(0.5); const from = w.trophy.position.clone(), dest = w.nodeTop(to); w.trophyNode = -1; w.refreshTiles(-1); audio.sfx('whoosh');
    await this.tween(1.4, (k) => { w.trophy.position.lerpVectors(from, dest, easeIO(k)); w.trophy.position.y += Math.sin(k * Math.PI) * 9; });
    B.trophyNode = to; w.setTrophyNode(to); audio.sfx('sparkle'); this.confetti(dest.clone().add(new THREE.Vector3(0, 1, 0)), 40);
    this.hud.pop('🏆 verhuisd!', '#ffe14a'); await this.sleep(1.0); this.camFollow(w.tokens[this.active ?? 0].pos);
  }

  // ------------------------------------------------------------------ kanskaarten
  async chanceCard(i) {
    const B = this.B, p = B.players[i], w = this.world; const c = (this.force && this.force.card && D.CARDS.find((e) => e.id === this.force.card)) || D.drawCard(B, i); audio.sfx('bell');
    // doelwit onder de anderen (bij 2 spelers: de ander): ruilen/roven = rijkste, cadeau = armste, taart = koploper
    const tid = D.pickTarget(B, i, { swap: 'rich', robber: 'rich', give: 'poor', pie: 'lead' }[c.id] || 'rand'), o = B.players[tid];
    await this.say(`${c.icon} ${c.title}`, D.textFor(c, B.players.length).replace(/\{o\}/g, this.cssName(tid)), { icon: '❓', sec: 3, color: '#2fc79a' });
    switch (c.id) {
      case 'egg': this.addCoins(i, 4); await this.sleep(0.7); break;
      case 'duck': await this.loseCoins(i, 2); break;
      case 'gift': this.giveItem(i, this.randItem()); await this.sleep(0.8); break;
      case 'swap': { const t = p.coins; p.coins = o.coins; o.coins = t; this.coinFx(i, 1); this.coinFx(tid, -1); this.hud.update(B, i); await this.sleep(0.9); break; }
      case 'forward': { await this.move(i, 3); return this.land(i); }
      case 'party': B.players.forEach((q, k) => this.addCoins(k, 3)); w.tokens.forEach((tk) => this.confetti(tk.pos.clone().add(new THREE.Vector3(0, 2, 0)), 30)); await this.sleep(0.9); break;
      case 'gamble': { const win = Math.random() < 0.5; await this.sleep(0.4); audio.sfx('tick'); await this.sleep(0.5); if (win) { this.addCoins(i, 6); await this.say('🎰 Kop!', 'Jij wint! +6 munten.', { sec: 1.4 }); } else { await this.loseCoins(i, 3, 'Munt... helaas.', true); } break; }
      case 'robber': { const ok = await this.loseCoins(tid, 3); if (ok) this.addCoins(i, Math.min(3, 3)); await this.sleep(0.4); break; }
      case 'trophy': await this.moveTrophy(); break;
      case 'hat': this.addCoins(i, 2); await this.sleep(0.7); break;
      case 'shield': p.shield = true; this.hud.update(B, i); audio.sfx('powerup'); this.floatText('🛡️', w.tokens[i].pos, '#9cc8ff', 1.3); await this.sleep(0.8); break;
      case 'again': return { again: true };
      case 'give': p.coins -= 2; o.coins += 2; this.coinFx(i, -2); this.coinFx(tid, 2); this.hud.update(B, i); await this.sleep(0.9); break;
      case 'pie': { const tk = w.tokens[tid]; this.fx.burst(tk.pos.x, tk.pos.y + 1.7, tk.pos.z, { count: 30, colors: [0xfff0d0, 0xffd0e0], speed: 5, life: 1 }); audio.sfx('splash'); await this.loseCoins(tid, 2); break; }
      default: break;
    }
    return {};
  }

  // ------------------------------------------------------------------ de Deurman
  async deurEvent(i) {
    const B = this.B, p = B.players[i], w = this.world; const ev = (this.force && this.force.deur && D.DEUR_EVENTS.find((e) => e.id === this.force.deur)) || D.drawDeur(B, i);
    this.camFollow(w.deurOut, 0.75); await this.sleep(0.4); audio.sfx('creak', { vol: 0.35, rate: 1.5 }); w.openDeur(true, false); await this.sleep(1.1);
    w.openDeur(true, true); await this.sleep(0.9); audio.sfx('bell', { vol: 0.5 });
    await this.say(`🚪 ${ev.title}`, D.textFor(ev, B.players.length), { icon: '🚪', sec: 3.2, color: '#8a5ad8' });
    let again = false;
    switch (ev.id) {
      case 'swap': {
        // plekken doorschuiven: speler k gaat naar het vakje van speler k+1 (bij 2 spelers: gewoon wisselen, bij 3: rondje draaien)
        const n = B.players.length, toks = w.tokens, old = B.players.map((q) => q.node), nw = old.map((_, k) => old[(k + 1) % n]);
        const from = toks.map((t) => t.pos.clone()), dest = nw.map((nd, k) => this.spot(k, nd, nw)); toks.forEach((t) => { t.busy = true; }); audio.sfx('whoosh');
        await this.tween(1.0, (k) => { toks.forEach((t, q) => { t.pos.lerpVectors(from[q], dest[q], easeIO(k)); t.y = Math.sin(k * Math.PI) * 3; t.c.air = true; }); });
        toks.forEach((t, q) => { t.y = 0; t.c.air = false; B.players[q].node = nw[q]; t.busy = false; this.confetti(t.pos.clone().add(new THREE.Vector3(0, 2, 0)), 20); });
        break;
      }
      case 'sign': this.addCoins(i, 5); await this.sleep(0.8); break;
      case 'steal': { const ok = await this.loseCoins(i, 2); if (ok) { p.hat = 1; w.setHat(i, 'tophat'); } this.floatText('🎩', w.tokens[i].pos, '#fff', 1.5); await this.sleep(0.7); break; }
      case 'dance': { w.deurDance = true; w.tokens.forEach((tk) => { tk.c.pose = 'dance'; }); B.players.forEach((q, k) => this.addCoins(k, 1)); await this.sleep(2.4); w.deurDance = false; w.deurman.arms.forEach((a) => { a.rotation.z = 0.04; }); w.tokens.forEach((tk) => { tk.c.pose = 'idle'; }); break; }
      case 'hold': again = true; break;
      case 'gift': this.giveItem(i, this.randItem()); await this.sleep(0.8); break;
      case 'comfort': { const lo = D.lowest(B) ?? B.players.map((q, k) => k).sort((a, b) => D.score(B.players[a]) - D.score(B.players[b]))[0]; this.addCoins(lo, 4); this.confetti(w.tokens[lo].pos.clone().add(new THREE.Vector3(0, 2, 0)), 30); await this.sleep(0.9); break; }
      default: break;
    }
    w.openDeur(false, false); await this.sleep(0.8); audio.sfx('door', { vol: 0.5 });
    return again ? { again: true } : {};
  }

  // ------------------------------------------------------------------ duels
  duelId() { return D.pickDuelId(this.app, { isUnlocked, ARCADE_HALLS }, this.B.lastDuels); }
  partyId(n = 3) { return D.pickPartyId(this.app, { isUnlocked, ARCADE_HALLS }, this.B.lastDuels, n); }
  async tileDuel(i) {
    const B = this.B; const id = this.duelId(); const def = id && this.app.games[id]; const multi = B.players.length >= 3;
    if (!def) { await this.say('🎪 Duel-vakje', 'Er staan geen duels aan, dus jullie dansen maar een rondje. Iedereen +2 munten.', { icon: '🎪', sec: 2.4 }); B.players.forEach((q, k) => this.addCoins(k, 2)); return {}; }
    let opp = 1 - i;
    if (multi) {   // bij 3 of 4 spelers kiest de uitdager zijn tegenstander; de rest kijkt toe en voorspelt
      const os = D.others(B, i); const c = await this.choose(i, '🎪 Wie daag je uit?', os.map((k) => ({ label: NAMES[k] })), { sub: os.length > 2 ? 'De anderen kijken toe en raden wie wint.' : 'De derde kijkt toe en raadt wie wint.' }); opp = os[c];
    }
    await this.say('🎪 DUEL!', `${this.cssName(i)} daagt ${this.cssName(opp)} uit voor <b>${def.icon || ''} ${def.name}</b>! Winnaar +${D.CFG.tileWin} munten en misschien een Trofee!`, { icon: '🎪', sec: 3, color: '#ff8a2a' });
    const pd = { kind: 'tile', who: i, id };
    if (multi) {
      pd.players = [i, opp].sort((x, y) => x - y); const specs = B.players.map((q, k) => k).filter((k) => !pd.players.includes(k));
      if (specs.length === 1) { pd.spec = specs[0]; pd.pred = await this.predict(pd.spec, pd.players); }
      else { pd.specs = specs; pd.preds = await this.predictMany(specs, pd.players); }
    }
    B.pendingDuel = pd; await this.launchDuel(id); return { duel: true };
  }
  async roundDuel() {
    const B = this.B; this.setActive(null); this.camOverview();
    if (B.players.length === 3) return this.roundMini3();
    if (B.players.length >= 4) return this.roundMini4();
    const id = this.duelId(); const def = id && this.app.games[id];
    if (!def) { await this.say('🎪 Mini-duel overgeslagen', 'Geen duels beschikbaar (alles staat uit in de Speelhal). Iedereen +3 munten.', { sec: 2.4 }); this.addCoins(0, 3); this.addCoins(1, 3); this.nextRound(); return; }
    this.world.tokens.forEach((tk) => { tk.c.pose = 'wave'; }); audio.sfx('bell');
    await this.say(`🎪 MINI-DUEL! (ronde ${B.round}/${B.rounds})`, `Tijd voor <b>${def.icon || ''} ${def.name}</b>! Winnaar +${D.CFG.duelWin} munten, verliezer +${D.CFG.duelLose}.`, { icon: '🎪', sec: 3, color: '#ff8a2a' });
    this.world.tokens.forEach((tk) => { tk.c.pose = 'idle'; });
    B.pendingDuel = { kind: 'round', id }; await this.launchDuel(id);
  }
  // Ronde-afsluiting met 3 spelers: een 3-speler-spel als dat er is, anders een duel met een toeschouwer die de winnaar voorspelt.
  // De toeschouwer wisselt elke ronde (ronde 1: Wes, 2: Jor, 3: Juul, ...), zodat iedereen even vaak kijkt.
  async roundMini3() {
    const B = this.B; const spec = (B.round - 1) % 3, pair = [0, 1, 2].filter((k) => k !== spec);
    const pid = this.partyId(3); const id = pid || this.duelId(); const def = id && this.app.games[id];
    if (!def) { await this.say('🎪 Mini-spel overgeslagen', 'Geen spellen beschikbaar (alles staat uit in de Speelhal). Iedereen +3 munten.', { sec: 2.4 }); B.players.forEach((q, k) => this.addCoins(k, 3)); this.nextRound(); return; }
    this.world.tokens.forEach((tk) => { tk.c.pose = 'wave'; }); audio.sfx('bell');
    if (pid) {
      await this.say(`🎪 MINI-SPEL! (ronde ${B.round}/${B.rounds})`, `Tijd voor <b>${def.icon || ''} ${def.name}</b> met zijn drieën! Plek 1: +${D.PLACE_PTS[0]} munten, plek 2: +${D.PLACE_PTS[1]}, plek 3: +${D.PLACE_PTS[2]}.`, { icon: '🎪', sec: 3, color: '#ff8a2a' });
      this.world.tokens.forEach((tk) => { tk.c.pose = 'idle'; }); B.pendingDuel = { kind: 'round', id, party: true, players: [0, 1, 2] };
    } else {
      await this.say(`🎪 MINI-DUEL! (ronde ${B.round}/${B.rounds})`, `${this.cssName(pair[0])} tegen ${this.cssName(pair[1])} in <b>${def.icon || ''} ${def.name}</b>! Winnaar +${D.CFG.duelWin}, verliezer +${D.CFG.duelLose}. ${this.cssName(spec)} kijkt toe en raadt wie wint: goed = +${D.CFG.spectBonus} munten!`, { icon: '🎪', sec: 3.4, color: '#ff8a2a' });
      this.world.tokens.forEach((tk) => { tk.c.pose = 'idle'; }); const pred = await this.predict(spec, pair);
      B.pendingDuel = { kind: 'round', id, players: pair, spec, pred };
    }
    await this.launchDuel(id);
  }
  // Ronde-afsluiting met 4 spelers: bij voorkeur een spel dat alle vier aankunnen (teamspel = 2 tegen 2), anders een 1-tegen-1-duel waarbij de andere
  // twee toekijken en voorspellen (snel, geen halve finales). Het duel-paar wisselt per ronde (D.PAIRS4), zodat iedereen even vaak speelt.
  async roundMini4() {
    const B = this.B; const all = [0, 1, 2, 3];
    const pid = this.partyId(4); const id = pid || this.duelId(); const def = id && this.app.games[id];
    if (!def) { await this.say('🎪 Mini-spel overgeslagen', 'Geen spellen beschikbaar (alles staat uit in de Speelhal). Iedereen +3 munten.', { sec: 2.4 }); B.players.forEach((q, k) => this.addCoins(k, 3)); this.nextRound(); return; }
    this.world.tokens.forEach((tk) => { tk.c.pose = 'wave'; }); audio.sfx('bell');
    if (pid) {
      const teams = def.teams ? splitTeams(4) : null;   // slots = spelers-id's (de harness krijgt alle vier in volgorde)
      const t = teams ? teams.map((tm) => D.joinList(tm.map((k) => this.cssName(k)))) : null;
      await this.say(`🎪 MINI-SPEL! (ronde ${B.round}/${B.rounds})`, teams
        ? `Tijd voor <b>${def.icon || ''} ${def.name}</b> in teams! 🤝 ${t[0]} <b>tegen</b> ${t[1]}. Elk lid van het winnende team +${D.CFG.duelWin} munten, het andere team +${D.CFG.duelLose}.`
        : `Tijd voor <b>${def.icon || ''} ${def.name}</b> met zijn vieren! Plek 1: +${D.PLACE_PTS4[0]} munten, plek 2: +${D.PLACE_PTS4[1]}, plek 3: +${D.PLACE_PTS4[2]}, plek 4: +${D.PLACE_PTS4[3]}.`, { icon: '🎪', sec: 3.2, color: '#ff8a2a' });
      this.world.tokens.forEach((tk) => { tk.c.pose = 'idle'; }); B.pendingDuel = { kind: 'round', id, party: true, players: all, teams };
    } else {
      const pair = D.roundPair4(B.round), specs = all.filter((k) => !pair.includes(k));
      await this.say(`🎪 MINI-DUEL! (ronde ${B.round}/${B.rounds})`, `${this.cssName(pair[0])} tegen ${this.cssName(pair[1])} in <b>${def.icon || ''} ${def.name}</b>! Winnaar +${D.CFG.duelWin}, verliezer +${D.CFG.duelLose}. ${D.joinList(specs.map((k) => this.cssName(k)))} kijken toe en raden wie wint: goed = +${D.CFG.spectBonus} munten!`, { icon: '🎪', sec: 3.4, color: '#ff8a2a' });
      this.world.tokens.forEach((tk) => { tk.c.pose = 'idle'; }); const preds = await this.predictMany(specs, pair);
      B.pendingDuel = { kind: 'round', id, players: pair, specs, preds };
    }
    await this.launchDuel(id);
  }
  // Toeschouwer-voorspelling (4 s): A / links = de linker speler, B / rechts = de rechter speler. Geeft het gekozen spelers-id of null.
  predict(spec, pair) { return this.predictMany([spec], pair).then((r) => r[spec] ?? null); }
  // Meerdere toeschouwers tegelijk (bij 4 spelers twee): elk met eigen toetsen. Geeft { spelersId: gekozen spelers-id | null }.
  predictMany(specs, pair) {
    const multi = specs.length > 1; const dur = multi ? 5 : 4;
    const opts = pair.map((k, q) => {
      const o = cvar(h('div', { class: 'bdp-opt', onClick: () => this.predPick(q, (this.pred && specs.find((s) => this.pred.picks[s] == null)) ?? specs[0]) }, NAMES[k], multi ? h('div', { class: 'bdp-who' }) : h('small', {}, q ? `${klabel(specs[0]).b} of ▶` : `${klabel(specs[0]).a} of ◀`)), pcss(k));
      return o;
    });
    const bar = h('i');
    const how = multi ? specs.map((sp) => `<b style="color:${DARK[sp]}">${NAMES[sp]}</b>: <kbd>${klabel(sp).a}</kbd>/◀ = links · <kbd>${klabel(sp).b}</kbd>/▶ = rechts`).join('<br>') : '';
    const el = cvar(h('div', { class: 'bd-pred' }, h('h3', {}, `🔮 ${D.joinList(specs.map((k) => NAMES[k]))}: wie wint?`),
      h('p', { html: multi ? `Jullie kijken toe! Raad de winnaar: goed geraden = <b>+${D.CFG.spectBonus} munten</b>.<br><small>${how}</small>` : `Jij kijkt toe! Raad de winnaar: goed geraden = <b>+${D.CFG.spectBonus} munten</b>.` }),
      h('div', { class: 'bdp-row' }, ...opts), h('div', { class: 'bdp-tm' }, bar)), pcss(specs[0]));
    this.hud.root.append(el); audio.sfx('select');
    return new Promise((res) => { this.pred = { specs, spec: specs[0], pair, picks: {}, since: 0, t: dur, max: dur, age: 0, el, opts, bar, res }; this.wait = { kind: 'predict', who: specs[0], specs }; });
  }
  predPick(q, spec) {
    const d = this.pred; if (!d || d.done) return; spec ??= d.spec; d.picks[spec] = q; d.since = 0;
    if (d.specs.length === 1) d.opts.forEach((e, k) => e.classList.toggle('on', k === q));
    else d.opts.forEach((e, k) => { e.classList.toggle('on', d.specs.some((sp) => d.picks[sp] === k)); const w = e.querySelector('.bdp-who'); if (w) { w.innerHTML = ''; d.specs.filter((sp) => d.picks[sp] === k).forEach((sp) => w.append(cvar(h('i', {}, NAMES[sp]), pcss(sp)))); } });
    audio.sfx('click');
  }
  tickPred(dt) {
    const d = this.pred; if (!d) return; d.age += dt; d.t -= dt; d.bar.style.width = `${Math.max(0, d.t / d.max) * 100}%`;
    for (const sp of d.specs) { const p = PI()[sp]; if (d.age > 0.3 && p) { if (p.aP || p.leftP) this.predPick(0, sp); else if (p.bP || p.rightP) this.predPick(1, sp); } }
    const all = d.specs.every((sp) => d.picks[sp] != null); if (d.specs.some((sp) => d.picks[sp] != null)) d.since += dt;
    if (d.t <= 0 || (all && d.since > 1.1)) { this.pred = null; this.wait = null; d.done = true; d.el.remove(); const out = {}; d.specs.forEach((sp) => { out[sp] = d.picks[sp] != null ? d.pair[d.picks[sp]] : null; }); d.res(out); }
  }
  async launchDuel(id) {
    const B = this.B; B.lastDuels = [...B.lastDuels, id].slice(-6); this.leaving = true; audio.sfx('powerup'); await ui.fade(1, 450); persist();
    const pd = B.pendingDuel, extra = { board: true, tourney: true, kind: pd.kind };
    if (B.players.length >= 3) extra.players = pd.players.slice();   // 2 tot 4 spelers-id's; de harness vertaalt slots terug
    if (pd.teams) extra.teams = pd.teams.map((tm) => tm.slice());   // 2 tegen 2 (slots = id's in extra.players)
    this.app.playGame(id, { back: 'board', extra });
    await new Promise(() => {});
  }
  nextRound() { const B = this.B; B.round++; B.turn = 0; B.phase = B.round > B.rounds ? 'end' : 'turn'; this.hud.update(B, null); }
  // comeback bij 3 of 4 spelers: wie duidelijk onderaan staat krijgt een troostprijs na het mini-spel
  async comfort() {
    const B = this.B; if (B.players.length < 3) return; const lo = D.lowest(B);
    if (lo == null || !D.isBehind(B, lo)) return;
    this.addCoins(lo, D.CFG.comfort); await this.say('🧚 Troostprijs', `${this.cssName(lo)} staat onderaan. De Feestfee strooit <b>+${D.CFG.comfort}</b> munten. Gewoon omdat het kan.`, { icon: '🧚', sec: 2, color: '#ff7ad0' });
  }
  // uitslag van een duel verwerken (na terugkomst uit de Speelhal)
  async afterDuel(res) {
    const B = this.B, pd = B.pendingDuel; B.pendingDuel = null; const w = this.world;
    this.camBoth(0.9); this.hud.update(B, null);
    if (pd.party) return pd.teams ? this.afterTeams(res, pd) : this.afterParty(res, pd);
    const ids = (res && res.ids) || pd.players || [0, 1], multi = B.players.length >= 3;
    let win = null;   // spelers-id van de winnaar (de harness levert winnerId; anders vertalen we de slot-winnaar)
    if (res && (res.pvp || res.ids)) { if (res.winnerId != null) win = res.winnerId; else if (res.winner != null) win = ids[res.winner] ?? null; }
    const lose = win == null ? null : ids.find((k) => k !== win);
    if (win != null) { B.duelsWon[win]++; w.tokens[win].c.pose = 'cheer'; if (lose != null) w.tokens[lose].c.pose = 'sad'; this.confetti(w.tokens[win].pos.clone().add(new THREE.Vector3(0, 2, 0)), 70, { speed: 9 }); audio.sfx('win'); }
    else audio.sfx('good');
    await this.sleep(0.8);
    const line = win == null ? 'Gelijkspel! Dat telt voor niemand. Behalve voor de dobbelsteen: die lacht.' : pick(D.WIN_LINES).replace('{w}', NAMES[win]).replace('{l}', NAMES[lose]);
    if (pd.kind === 'round') {
      const dw = D.CFG.duelWin, dl = D.CFG.duelLose;
      if (win == null) { ids.forEach((k) => this.addCoins(k, 5)); await this.say('🤝 Gelijkspel', `${line} ${multi ? 'Allebei' : 'Iedereen'} +5 munten.`, { sec: 2.6 }); }
      else { this.addCoins(win, dw); this.addCoins(lose, dl); await this.say(`👑 ${NAMES[win]} wint!`, `${line} <b>+${dw}</b> munten voor ${this.cssName(win)}, <b>+${dl}</b> voor ${this.cssName(lose)}.`, { sec: 3.2 }); }
    } else {
      if (win == null) await this.say('🤝 Gelijkspel', line, { sec: 2.4 });
      else {
        this.addCoins(win, D.CFG.tileWin); await this.say(`👑 ${NAMES[win]} wint het duel!`, `${line} <b>+${D.CFG.tileWin}</b> munten.`, { sec: 2.8 });
        const chance = D.isBehind(B, win) ? 0.4 : D.CFG.tileTrophyChance;
        if (Math.random() < chance) { await this.say('🧚 Trofee-kans!', `De Trofee-fee zag het hele duel en geeft ${this.cssName(win)} een <b>gratis Trofee</b>!`, { icon: '🏆', sec: 3 }); B.players[win].trophies++; this.hud.update(B, null); audio.sfx('win'); this.confetti(w.tokens[win].pos.clone().add(new THREE.Vector3(0, 2, 0)), 80); await this.sleep(0.6); await this.moveTrophy(); }
      }
    }
    // de toeschouwer(s) die goed raadden krijgen een bonus (3 spelers: pd.spec/pd.pred; 4 spelers: pd.specs/pd.preds)
    const specs = pd.specs || (pd.spec != null ? [pd.spec] : []), preds = pd.preds || (pd.spec != null ? { [pd.spec]: pd.pred } : {});
    if (win != null && specs.length) {
      const good = specs.filter((k) => preds[k] != null && preds[k] === win), bad = specs.filter((k) => preds[k] != null && preds[k] !== win);
      if (good.length) {
        good.forEach((k) => { this.addCoins(k, D.CFG.spectBonus); this.confetti(w.tokens[k].pos.clone().add(new THREE.Vector3(0, 2, 0)), 30); });
        await this.say('🔮 Goed geraden!', good.length === 1 && specs.length === 1 ? `${this.cssName(good[0])} voorspelde ${this.cssName(win)} en had gelijk: <b>+${D.CFG.spectBonus}</b> munten voor de toeschouwer!` : `${D.joinList(good.map((k) => this.cssName(k)))} voorspelde${good.length > 1 ? 'n' : ''} ${this.cssName(win)} en had${good.length > 1 ? 'den' : ''} gelijk: <b>+${D.CFG.spectBonus}</b> munten voor ${good.length > 1 ? 'elk' : 'de toeschouwer'}!`, { icon: '🔮', sec: 2.4 });
      }
      if (bad.length) await this.say('🔮 Net mis', bad.length === 1 && specs.length === 1 ? `${this.cssName(bad[0])} dacht dat ${this.cssName(preds[bad[0]])} zou winnen. Volgende keer beter!` : `${D.joinList(bad.map((k) => `${this.cssName(k)} dacht ${this.cssName(preds[k])}`))}. Volgende keer beter!`, { icon: '🔮', sec: 1.8 });
    }
    w.tokens.forEach((tk) => { tk.c.pose = 'idle'; });
    if (pd.kind === 'round') { await this.comfort(); this.nextRound(); } else { this.setActive(pd.who); this.endTurn(); }
  }
  // uitslag van een spel voor alle spelers (3 of 4): punten per plek (10 / 6 / 3, bij vier 10 / 6 / 4 / 2), bij gelijke stand gedeeld
  async afterParty(res, pd) {
    const B = this.B, w = this.world, N = B.players.length, all = Array.from({ length: N }, (_, k) => k), ids = (res && res.ids) || all;
    const wid = res ? (res.winnerId != null ? res.winnerId : (res.winner != null ? ids[res.winner] : null)) : null;
    const wids = res && Array.isArray(res.winnerIds) && res.winnerIds.length ? res.winnerIds : wid != null ? [wid] : [];
    let keys = all.map((id) => { const sc = res && res.scoreById ? res.scoreById[id] : res && res.scoreArr ? res.scoreArr[ids.indexOf(id)] : undefined; return Number.isFinite(sc) ? sc : undefined; });
    if (keys.every((k) => k === undefined) && res && Array.isArray(res.place) && res.place.length === N) keys = all.map((id) => N - res.place.indexOf(id));   // alleen een volgorde bekend
    else if (keys.every((k) => k === undefined)) keys = keys.map((_, id) => (wids.includes(id) ? 1 : 0));
    else keys = keys.map((k, id) => (wids.includes(id) ? 1e9 : (k ?? -1e8)));
    const { pts, place } = D.placePoints(keys); const order = all.slice().sort((a, b) => place[a] - place[b] || a - b);
    order.forEach((k) => { const tk = w.tokens[k]; tk.c.pose = place[k] === 1 ? 'cheer' : place[k] === N ? 'sad' : 'idle'; });
    const first = order.filter((k) => place[k] === 1); if (first.length === 1) B.duelsWon[first[0]]++;
    audio.sfx('win'); this.confetti(w.tokens[order[0]].pos.clone().add(new THREE.Vector3(0, 2, 0)), 70, { speed: 9 }); await this.sleep(0.8);
    order.forEach((k) => this.addCoins(k, pts[k]));
    const lbl = ['🥇', '🥈', '🥉', '4️⃣'], tie = new Set(place).size < N;
    const list = order.map((k) => `${lbl[place[k] - 1]} ${this.cssName(k)} <b>+${pts[k]}</b>`).join(' · ');
    const fill = (t) => t.replace('{a}', NAMES[order[0]]).replace('{b}', NAMES[order[1]]).replace('{c}', NAMES[order[2]]).replace('{d}', NAMES[order[3]]);
    await this.say(first.length === 1 ? `👑 ${NAMES[first[0]]} wint!` : '🤝 Gedeelde winst!', `${tie ? 'Gelijke stand: de punten worden gedeeld. ' : fill(pick(N >= 4 ? D.PARTY4_LINES : D.PARTY3_LINES)) + ' '}<br>${list}`, { sec: N >= 4 ? 4.4 : 4 });
    w.tokens.forEach((tk) => { tk.c.pose = 'idle'; });
    await this.comfort(); this.nextRound();
  }
  // uitslag van een teamspel (4 spelers, 2 tegen 2): elk lid van het winnende team +10, van het andere team +3; gelijkspel: iedereen +5
  async afterTeams(res, pd) {
    const B = this.B, w = this.world, N = B.players.length, all = Array.from({ length: N }, (_, k) => k);
    const wids = res && Array.isArray(res.winnerIds) && res.winnerIds.length ? res.winnerIds.filter((k) => all.includes(k)) : res && res.winnerId != null ? [res.winnerId] : [];
    const tm = (pd.teams || []).map((t) => t.slice()); const wTeam = wids.length ? tm.find((t) => wids.every((k) => t.includes(k))) : null;
    const winners = wTeam ? wTeam.slice() : wids.slice(), losers = all.filter((k) => !winners.includes(k)), nm = (list) => D.joinList(list.map((k) => this.cssName(k)));
    if (!winners.length) {
      audio.sfx('good'); await this.sleep(0.8); all.forEach((k) => this.addCoins(k, 5));
      await this.say('🤝 Gelijkspel', `Geen winnaar, dus <b>+5</b> munten voor iedereen. Teamwork was het in elk geval.`, { sec: 2.6 });
    } else {
      winners.forEach((k) => { B.duelsWon[k]++; w.tokens[k].c.pose = 'cheer'; }); losers.forEach((k) => { w.tokens[k].c.pose = 'sad'; });
      audio.sfx('win'); this.confetti(w.tokens[winners[0]].pos.clone().add(new THREE.Vector3(0, 2, 0)), 70, { speed: 9 }); winners.slice(1).forEach((k) => this.confetti(w.tokens[k].pos.clone().add(new THREE.Vector3(0, 2, 0)), 40, { speed: 8 })); await this.sleep(0.8);
      winners.forEach((k) => this.addCoins(k, D.CFG.duelWin)); losers.forEach((k) => this.addCoins(k, D.CFG.duelLose));
      const line = pick(D.TEAM_LINES).replace('{w}', winners.map((k) => NAMES[k]).join(' & ')).replace('{l}', losers.map((k) => NAMES[k]).join(' & '));
      await this.say(`👑 Team ${winners.map((k) => NAMES[k]).join(' & ')} wint!`, `${line} <b>+${D.CFG.duelWin}</b> munten voor ${nm(winners)}, <b>+${D.CFG.duelLose}</b> voor ${nm(losers)}.`, { sec: 3.6 });
    }
    w.tokens.forEach((tk) => { tk.c.pose = 'idle'; });
    await this.comfort(); this.nextRound();
  }

  // ------------------------------------------------------------------ einde: ceremonie
  async ceremony() {
    const B = this.B, w = this.world, P = B.players, N = P.length; B.over = true; this.setActive(null); this.hud.update(B, null); this.hint(''); audio.music('menu');
    const rank = D.ranking(B), win = rank[0], r1 = rank[1]; let why = '';
    if (P[win].trophies !== P[r1].trophies) why = 'meeste trofeeën'; else if (P[win].coins !== P[r1].coins) why = 'meeste munten'; else why = 'het lot (munt opgegooid!)';
    // podium: plek 1 (hoogst), 2 en 3
    const pod = new THREE.Group(); const px = 0, pz = 15.4;
    const spots = N >= 4 ? [[-1.65, 1.9], [-4.95, 1.35], [1.65, 0.95], [4.95, 0.55]] : N === 3 ? [[0, 1.7], [-3.3, 1.0], [3.3, 0.6]] : [[-1.9, 1.7], [1.9, 1.0]], cols = [0xffc21f, 0xb8c0d0, 0xcd7f32, 0x7a8aa8];
    const mk = (x, hgt, col, num) => { const m = mesh(new THREE.BoxGeometry(3, hgt, 3), mat(col), { pos: [x, hgt / 2, 0] }); pod.add(m); const s = numSprite(num, '#ffffff', 1.4); s.position.set(x, hgt + 0.2, 1.6); pod.add(s); };
    spots.forEach(([x, hh], r) => mk(x, hh, cols[r], String(r + 1))); pod.position.set(px, 0, pz); this.scene.add(pod);
    this.cam = N >= 4 ? { x: 0, y: 3.4, z: 12.2, d: 1.3, mode: 'follow' } : N === 3 ? { x: 0, y: 3.4, z: 12.6, d: 1.05, mode: 'follow' } : { x: 0, y: 3.4, z: 14.8, d: 0.85, mode: 'follow' };
    if (N >= 3) this.hud.root.style.visibility = 'hidden';   // bij 3 of 4 spelers ligt de eindkaart over de HUD heen
    const toks = rank.map((k) => w.tokens[k]); toks.forEach((t) => { t.busy = true; }); const fr = toks.map((t) => t.pos.clone());
    const to = spots.map(([x, hh]) => new THREE.Vector3(px + x, hh, pz)); audio.sfx('whoosh');
    await this.tween(1.3, (k) => { toks.forEach((t, r) => { t.pos.lerpVectors(fr[r], to[r], easeIO(k)); t.y = Math.sin(k * Math.PI) * 4; t.c.air = k < 0.9; }); });
    const poses = N >= 4 ? ['cheer', 'wave', 'idle', 'sad'] : N === 3 ? ['cheer', 'wave', 'sad'] : ['cheer', 'sad'];
    toks.forEach((t, r) => { t.y = 0; t.c.air = false; t.c.targetYaw = 0; t.c.group.rotation.y = 0; t.c.pose = poses[r]; t.arrow.visible = false; }); w.setHat(win, 'crown');
    audio.sfx('win'); ui.flash('#fff6c0', 300); this.finale = true;
    const base = 10 * (N + 1), reward = base + 10 * P.reduce((q, p) => q + p.trophies, 0);   // gedeelde pot voor iedereen, niemand verliest (30 / 40 / 50)
    const bs = this.fixStats(); bs.plays++; bs.wins[win]++; S.coins += reward; S.totalEarned += reward; persist();
    const el = h('div', { class: 'card bd-card bd-grid' });
    const add = (html) => { const d = h('div', { html }); el.append(d); audio.sfx('select'); return d; };
    const card = ui.overlay(el, 'clear'); card.style.alignItems = 'flex-start'; card.style.paddingTop = '1.5vh';
    el.append(h('h2', {}, '🎉 Eindstand!'));
    let row;
    if (N >= 3) {
      const tbl = h('div', { class: 'bd-score3', html: `<div></div>${P.map((_, i) => `<div class="nm" style="color:${DARK[i]}">${NAMES[i]}</div>`).join('')}` }); tbl.style.gridTemplateColumns = `repeat(${N + 1},auto)`; el.append(tbl);
      row = (lab, vals, ic) => { tbl.insertAdjacentHTML('beforeend', `<div class="l">${ic} ${lab}</div>${vals.map((v) => `<div>${v}</div>`).join('')}`); audio.sfx('select'); };
    } else {
      const tbl = h('div', { class: 'bd-score', html: `<div class="n">${NAMES[0]}</div><div></div><div class="n b">${NAMES[1]}</div>` }); el.append(tbl);
      row = (lab, vals, ic) => { tbl.insertAdjacentHTML('beforeend', `<div>${vals[0]}</div><div class="l">${ic} ${lab}</div><div>${vals[1]}</div>`); audio.sfx('select'); };
    }
    await this.sleep(1.0);
    row('Trofeeën', P.map((p) => p.trophies), '🏆'); await this.sleep(1.2);
    row('Munten', P.map((p) => p.coins), '🪙'); await this.sleep(1.2);
    if (why.startsWith('het lot')) { add(`<p style="text-align:center"><b>🎲 Helemaal gelijk! Het lot beslist...</b></p>`); await this.sleep(1.4); }
    add(`<div class="bd-win"><span>👑</span>${NAMES[win]} wint het Feestbord!</div><p style="text-align:center">Reden: ${why}. ${N >= 4 ? `🥈 ${NAMES[rank[1]]}: "Ik liet hem winnen." 🥉 ${NAMES[rank[2]]}: "Ik ook. Echt." 4️⃣ ${NAMES[rank[3]]}: "Ik deed het expres."` : N === 3 ? `🥈 ${NAMES[rank[1]]}: "Ik liet hem winnen." 🥉 ${NAMES[rank[2]]}: "Ik ook. Echt."` : `${NAMES[rank[1]]}: "Ik liet hem winnen."`}</p>`);
    this.fireworks = true; await this.sleep(1.2);
    add(`<p class="reward" style="text-align:center;font-size:24px">🪙 +${reward} heitjes voor jullie samen! <small style="font-size:13px;font-weight:400;opacity:.75">(${base} + 10 per Trofee)</small></p>`);
    await this.sleep(0.6);
    const ch = new Chooser({ who: -1, plain: true, host: el, options: [{ label: '🎉 Nog een potje!' }, { label: '↩ Terug naar de Speelhal' }] }); this.chooser = ch; this.wait = { kind: 'end', n: 2 };
    const i = await ch.promise; this.chooser = null; this.wait = null; BOARD = null; this.leaving = true; this.finale = false;
    await ui.fade(1, 500);
    if (i === 0) await this.app.goBoard({}); else await this.app.goArcade({});
    await new Promise(() => {});
  }
  async toArcade() { this.leaving = true; await ui.fade(1, 450); persist(); await this.app.goArcade({}); await new Promise(() => {}); }

  // ------------------------------------------------------------------ pauze
  async pauseMenu() {
    if (this.paused || this.leaving) return; this.paused = true; audio.duck(true);
    const wasChooser = this.chooser; if (wasChooser) wasChooser.el.style.display = 'none';
    const resume = () => { this.paused = false; audio.duck(false); if (wasChooser) wasChooser.el.style.display = ''; };
    for (;;) {
      const ch = new Chooser({ who: -1, title: 'Pauze', sub: 'Het Feestbord wacht op jullie.', options: [{ label: '▶ Doorgaan' }, { label: '❓ Uitleg' }, { label: '↩ Terug naar de Speelhal' }], cancel: 0 });
      this.pauseChooser = ch; const c = await ch.promise; this.pauseChooser = null;
      if (c === 0) { resume(); return; }
      if (c === 1) { await this.helpCard(); continue; }
      this.paused = false; audio.duck(false); await this.toArcade(); return;
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    dt = Math.min(dt, 0.05);
    const esc = input.pressed('Escape') || input.pressed('KeyP'); const escP = esc && !this._escHeld; this._escHeld = esc;
    if (this.leaving) { this.world.update(dt); this.fx.update(dt); this.updateCamera(dt); return; }
    if (this.modal) { this.modal.t -= dt; if (this.modal.t <= 0 && (this.pressed(-1) || escP)) { const m = this.modal; this.modal = null; m.el.remove(); this.wait = null; m.res(); } }
    else if (this.paused) { if (this.pauseChooser) this.pauseChooser.update(dt); }
    else {
      if (escP && this.B && this.hud && !this.chooserIsIntro()) { this.pauseMenu(); }
      else if (escP && this.chooserIsIntro()) { this.chooser.finish(this.chooser.options.length - 1); }
    }
    const frozen = this.paused || this.modal;
    if (!frozen) {
      this.t += dt;
      if (this.chooser) this.chooser.update(dt);
      this.tickTimers(dt); this.tickInput(dt); this.tickPred(dt); this.tickDice(dt);
      if (this.finale) { this.fxT -= dt; if (this.fxT <= 0) { this.fxT = this.fireworks ? 0.45 : 1.2; const p = new THREE.Vector3(rand(-9, 9), rand(6, 13), rand(8, 16)); this.fx.burst(p.x, p.y, p.z, { count: 46, colors: CONFETTI, speed: 8, size: 0.5, life: 1.5, gravity: 3, up: 0.6 }); audio.sfx('pop', { vol: 0.4, rate: 0.7 + Math.random() * 0.6 }); } }
      if (this.B && !this.finale) this.world.tokens.forEach((tk, k) => { if (!tk.busy && this.B.players[k]) tk.pos.lerp(this.spot(k, this.B.players[k].node), 1 - Math.exp(-9 * dt)); });
      if (this.B && !this.finale && this.B.players.length >= 4) {   // bij 4 spelers: namen boven drie of vier poppetjes op één vakje om en om hoger, zodat ze elkaar niet afdekken
        const ps = this.B.players; ps.forEach((p, k) => { const cnt = ps.filter((q) => q.node === p.node).length, idx = ps.slice(0, k).filter((q) => q.node === p.node).length, tk = this.world.tokens[k]; tk.lift = damp(tk.lift || 0, cnt >= 3 && idx % 2 ? 0.8 : 0, 10, dt); });
      }
      this.world.update(dt); this.fx.update(dt); this.texts.update(dt);
    }
    if (this.hud && this.B) this.hud.update(this.B, this.active);
    this.updateCamera(dt);
  }
  chooserIsIntro() { return !!(this.chooser && this.wait && this.wait.kind === 'intro'); }
  tickTimers(dt) {
    for (let k = this.timers.length - 1; k >= 0; k--) {
      const t = this.timers[k];
      if (t.fn) { t.t += dt; const q = clamp(t.t / t.dur, 0, 1); t.fn(q); if (q >= 1) { this.timers.splice(k, 1); t.res(); } }
      else { t.t -= dt; if (t.skippable) { t.age += dt; if (t.age > t.minT && this.pressed(-1)) t.t = 0; } if (t.t <= 0) { this.timers.splice(k, 1); t.res(); } }
    }
  }
  // wachten op A/B van de speler aan de beurt (dobbelen) of een richting kiezen (splitsing)
  tickInput(dt) {
    if (this.pressWait) {
      const p = PI()[this.pressWait.who];
      if (this.dice && this.dice.cool > 0) this.dice.cool -= dt;
      else if (p.aP || p.bP) { const r = this.pressWait.res; this.pressWait = null; if (this.dice) this.dice.hold = true; r(p.aP ? 'a' : 'b'); }
    }
    const br = this.branch;
    if (br && br.res) {
      br.t -= dt; const p = PI()[br.who]; const n = D.GRAPH.nodes[this.B.players[br.who].node]; const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      for (const k in dirs) if (p[k + 'P']) {
        let best = 0, bd = -9; br.opts.forEach((o, idx) => { const dx = o.x - n.x, dz = o.z - n.z, l = Math.hypot(dx, dz) || 1; const dot = (dx * dirs[k][0] + dz * dirs[k][1]) / l; if (dot > bd) { bd = dot; best = idx; } });
        br.sel = (best === br.sel && br.opts.length > 1 && bd < 0.45) ? (br.sel + 1) % br.opts.length : best; audio.sfx('click');
      }
      br.marks.forEach((m, k) => { const on = k === br.sel; m.position.y = br.opts[k].y + 3.1 + Math.sin(this.t * 6 + k) * 0.25; m.rotation.y += dt * 3; m.scale.setScalar(damp(m.scale.x, on ? 1.5 : 0.8, 12, dt)); m.material.color.setHex(on ? 0xffe14a : 0xb8a8c8); });
      if (p.aP && br.t <= 0) { const r = br.res; br.res = null; audio.sfx('select'); r(br.sel); }
    }
  }
  tickDice(dt) {
    const d = this.dice, w = this.world; if (!d) return; const tk = w.tokens[d.who]; const dm = w.diceMeshes;
    w.dice.position.set(tk.pos.x, tk.pos.y + tk.y + tk.c.height * TOKEN_S + 1.8, tk.pos.z); const hold = d.hold; d.hold = false;
    for (let k = 0; k < d.count; k++) {
      const m = dm[k], ud = m.userData; m.position.x = d.count > 1 ? (k ? 0.95 : -0.95) : 0;
      if (k >= d.stopped) {
        if (hold) { /* net gedrukt: deze frame niet doordraaien */ } else if (!d.frozen) { d.ph[k] += dt * (11 + k * 2); const span = d.max - 1; const ph = d.ph[k] % (2 * span); const v = 1 + Math.round(ph <= span ? ph : 2 * span - ph); if (v !== d.shown[k]) { d.shown[k] = v; setSpriteText(ud.sp, v, '#ffffff'); audio.sfx('tick', { vol: 0.12, rate: 1 + v * 0.05 }); } d.vals[k] = d.shown[k] || 1; }
        ud.body.rotation.x += dt * 8; ud.body.rotation.y += dt * 6.5; ud.sp.scale.setScalar(1.5);
      } else { ud.body.rotation.x = damp(ud.body.rotation.x, 0, 10, dt); ud.body.rotation.y = damp(ud.body.rotation.y, 0, 10, dt); if (ud.pop > 0) { ud.pop -= dt; ud.sp.scale.setScalar(1.5 + Math.sin((0.4 - ud.pop) / 0.4 * Math.PI) * 0.9); } }
      m.position.y = Math.sin(this.t * 4 + k) * 0.1;
    }
  }
}

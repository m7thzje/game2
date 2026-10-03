// Drie spelers (Wes 0, Jor 1, Juul 2) op één toetsenbord (of gamepads / online).
// input.all[id] = ruwe staat per spelers-id (ALTIJD 3; staat 2 is nul zolang S.settings.players !== 3).
// input.p = SLOT-view: standaard [all[0], all[1]]; de harness zet met mapSlots([idA, idB, ...]) slot i -> spelers-id (resetSlots() = terug).
// Per staat: x: links(-1)..rechts(+1)   y: omhoog(-1)..omlaag(+1)  (schermrichting; omhoog = van je af)
// a / b = ingedrukt gehouden, aP / bP = net ingedrukt deze frame, aR / bR = net losgelaten.
// up/down/left/right = gehouden, upP/downP/leftP/rightP = net ingedrukt.
import { S } from '../save.js';

export const KEYMAP = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyF', 'Space'], b: ['KeyG', 'KeyE'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter', 'NumpadEnter', 'Slash'], b: ['ShiftRight', 'Period', 'Numpad0'] },
  { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], a: ['KeyU'], b: ['KeyO'] },   // Juul
];
// Basislabels per spelers-id; KEY_LABELS is de actieve view (index = slot tijdens een spel, anders = spelers-id)
export const BASE_KEY_LABELS = [
  { move: 'WASD', a: 'F', b: 'G' },
  { move: 'Pijltjes', a: 'Enter', b: 'Shift' },
  { move: 'IJKL', a: 'U', b: 'O' },
];
export const KEY_LABELS = BASE_KEY_LABELS.map((k) => ({ ...k }));

const BTN = ['up', 'down', 'left', 'right', 'a', 'b'];

function blank() {
  const o = { x: 0, y: 0, mag: 0, any: false, anyP: false };
  for (const b of BTN) { o[b] = false; o[b + 'P'] = false; o[b + 'R'] = false; }
  return o;
}

class Input {
  constructor() {
    this.keys = new Set();
    this.virtual = [{}, {}, {}];   // voor tests: virtual[id].left = true enz., of virtual[id].x/.y analoog (id = spelers-id, niet slot)
    this.all = [blank(), blank(), blank()];
    this.p = [this.all[0], this.all[1]];   // slot-view (zie mapSlots)
    this.slotIds = [0, 1];
    this.prev = [{}, {}, {}];
    this.lastPressTime = 0;
    this.pads = [null, null, null];
    // online: een of meer spelers komen van een andere computer. remote[id] = { state, latch, keys }
    this.remote = {}; this._legacyOnline = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.isGameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.lastPressTime = performance.now();
      if (this.isGameKey(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
  }
  // true zodra er minstens één remote-speler is (oude netwerkcode mag nog input.online = true zetten: dan is speler 1 remote)
  get online() { return this._legacyOnline || Object.keys(this.remote).length > 0; }
  set online(v) { this._legacyOnline = !!v; }
  isRemote(id) { return !!this.remote[id] || (this._legacyOnline && id === 1); }
  isGameKey(code) {
    const n = S.settings.players === 3 ? 3 : 2;   // Juul-toetsen tellen alleen mee in een spel met 3 spelers
    for (let i = 0; i < n; i++) for (const b of BTN) if (KEYMAP[i][b].includes(code)) return true;
    return code === 'Escape' || code === 'KeyP' || code === 'KeyM' || code === 'Tab';
  }
  pressed(code) {
    if (this.keys.has(code)) return true;
    for (const id in this.remote) if (this.remote[id].keys.has(code)) return true;
    return false;
  }
  // Slot-mapping: slot i van input.p (en KEY_LABELS[i]) wijst naar spelers-id ids[i]. In-place, zodat bewaarde verwijzingen blijven kloppen.
  mapSlots(ids) {
    this.slotIds = ids.slice();
    this.p.length = 0;
    ids.forEach((id, slot) => { this.p.push(this.all[id]); if (KEY_LABELS[slot]) Object.assign(KEY_LABELS[slot], BASE_KEY_LABELS[id]); });
    for (let k = ids.length; k < 3; k++) Object.assign(KEY_LABELS[k], BASE_KEY_LABELS[k]);   // overige labels = identiteit
  }
  resetSlots() { this.mapSlots([0, 1]); }
  // Netwerklaag: toetsstand van remote-speler `playerId` (1 of 2). state = null markeert hem alleen als remote.
  // (Oude aanroep setRemote(state, keys) = speler 1.)
  setRemote(playerId, state, keys) {
    if (typeof playerId !== 'number') { keys = state; state = playerId; playerId = 1; }
    const r = (this.remote[playerId] ||= { state: null, latch: {}, keys: new Set() });
    r.state = state || null;
    r.keys = new Set(keys || []);
    if (state) for (const b of BTN) if (state[b]) r.latch[b] = true;   // korte tikjes mogen niet verloren gaan
  }
  // Remote-speler weg (lokale toetsen werken weer). Zonder argument: alle remote-spelers.
  clearRemote(playerId) { if (playerId == null) this.remote = {}; else delete this.remote[playerId]; }

  update() {
    // gamepads
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const connected = [];
    for (const g of gps) if (g && g.connected) connected.push(g);
    const three = S.settings.players === 3;
    for (let i = 0; i < 3; i++) {
      const raw = {};
      for (const b of BTN) raw[b] = false;
      let ax = 0, ay = 0;
      const active = i < 2 || three;   // Juul doet alleen mee bij 3 spelers
      const km = KEYMAP[i];
      const remoteSlot = this.isRemote(i);
      if (active && !remoteSlot) for (const b of BTN) for (const c of km[b]) if (this.keys.has(c)) raw[b] = true;
      const g = active && !remoteSlot ? connected[i] : null;
      const rem = remoteSlot ? this.remote[i] || null : null;
      if (rem && rem.state) {
        for (const b of BTN) if (rem.state[b] || rem.latch[b]) raw[b] = true;
        ax += rem.state.x || 0; ay += rem.state.y || 0;
        rem.latch = {};
      }
      if (g) {
        const dz = 0.25;
        let gx = g.axes[0] || 0, gy = g.axes[1] || 0;
        if (Math.hypot(gx, gy) < dz) { gx = 0; gy = 0; }
        ax += gx; ay += gy;
        if (g.buttons[14]?.pressed) raw.left = true;
        if (g.buttons[15]?.pressed) raw.right = true;
        if (g.buttons[12]?.pressed) raw.up = true;
        if (g.buttons[13]?.pressed) raw.down = true;
        if (g.buttons[0]?.pressed || g.buttons[5]?.pressed) raw.a = true;
        if (g.buttons[1]?.pressed || g.buttons[2]?.pressed || g.buttons[7]?.pressed) raw.b = true;
      }
      const v = this.virtual[i];
      if (active) {
        for (const b of BTN) if (v[b]) raw[b] = true;
        if (typeof v.x === 'number') ax += v.x;
        if (typeof v.y === 'number') ay += v.y;
      }

      const p = this.all[i], prev = this.prev[i];
      for (const b of BTN) {
        p[b] = raw[b];
        p[b + 'P'] = raw[b] && !prev[b];
        p[b + 'R'] = !raw[b] && !!prev[b];
        prev[b] = raw[b];
      }
      let x = (raw.right ? 1 : 0) - (raw.left ? 1 : 0) + ax;
      let y = (raw.down ? 1 : 0) - (raw.up ? 1 : 0) + ay;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      p.x = x; p.y = y; p.mag = Math.min(1, m);
      p.any = p.a || p.b || p.mag > 0.2;
      p.anyP = p.aP || p.bP || p.upP || p.downP || p.leftP || p.rightP;
    }
  }
  // helpers (over alle spelers-id's; staat 2 is nul zolang er maar 2 spelers zijn)
  anyA() { return this.all.some((p) => p.aP); }
  anyB() { return this.all.some((p) => p.bP); }
  reset() { this.keys.clear(); for (const id in this.remote) this.remote[id].latch = {}; for (const p of this.all) for (const k in p) p[k] = typeof p[k] === 'boolean' ? false : 0; for (const pr of this.prev) for (const k in pr) pr[k] = false; }
}

export const input = new Input();

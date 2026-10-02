// Twee spelers op één toetsenbord (of gamepads). Alles wordt per frame samengevat in input.p[0|1].
// x: links(-1)..rechts(+1)   y: omhoog(-1)..omlaag(+1)  (schermrichting; omhoog = van je af)
// a / b = ingedrukt gehouden, aP / bP = net ingedrukt deze frame, aR / bR = net losgelaten.
// up/down/left/right = gehouden, upP/downP/leftP/rightP = net ingedrukt.

export const KEYMAP = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyF', 'Space'], b: ['KeyG', 'KeyE'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter', 'NumpadEnter', 'Slash'], b: ['ShiftRight', 'Period', 'Numpad0'] },
];
export const KEY_LABELS = [
  { move: 'WASD', a: 'F', b: 'G' },
  { move: 'Pijltjes', a: 'Enter', b: 'Shift' },
];

const BTN = ['up', 'down', 'left', 'right', 'a', 'b'];

function blank() {
  const o = { x: 0, y: 0, mag: 0, any: false, anyP: false };
  for (const b of BTN) { o[b] = false; o[b + 'P'] = false; o[b + 'R'] = false; }
  return o;
}

class Input {
  constructor() {
    this.keys = new Set();
    this.virtual = [{}, {}];       // voor tests: virtual[i].left = true enz., of virtual[i].x/.y analoog
    this.p = [blank(), blank()];
    this.prev = [{}, {}];
    this.lastPressTime = 0;
    this.pads = [null, null];
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.isGameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.lastPressTime = performance.now();
      if (this.isGameKey(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
  }
  isGameKey(code) {
    for (const m of KEYMAP) for (const b of BTN) if (m[b].includes(code)) return true;
    return code === 'Escape' || code === 'KeyP' || code === 'KeyM' || code === 'Tab';
  }
  pressed(code) { return this.keys.has(code); }

  update() {
    // gamepads
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const connected = [];
    for (const g of gps) if (g && g.connected) connected.push(g);
    for (let i = 0; i < 2; i++) {
      const raw = {};
      for (const b of BTN) raw[b] = false;
      let ax = 0, ay = 0;
      const km = KEYMAP[i];
      for (const b of BTN) for (const c of km[b]) if (this.keys.has(c)) raw[b] = true;
      const g = connected[i];
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
      for (const b of BTN) if (v[b]) raw[b] = true;
      if (typeof v.x === 'number') ax += v.x;
      if (typeof v.y === 'number') ay += v.y;

      const p = this.p[i], prev = this.prev[i];
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
  // helpers
  anyA() { return this.p[0].aP || this.p[1].aP; }
  anyB() { return this.p[0].bP || this.p[1].bP; }
  reset() { this.keys.clear(); for (const p of this.p) for (const k in p) p[k] = typeof p[k] === 'boolean' ? false : 0; for (const pr of this.prev) for (const k in pr) pr[k] = false; }
}

export const input = new Input();

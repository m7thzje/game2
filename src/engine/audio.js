// Procedurele audio: geen bestanden nodig. sfx(naam) en music(naam).
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.musicName = null;
    this.musicVol = 0.5; this.sfxVol = 0.8;
    this._timer = null; this._step = 0; this._nextT = 0; this._track = null;
    this._lastSfx = {};
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    // voor online spelen: het geluid ook als stream beschikbaar maken
    try { this.streamDest = c.createMediaStreamDestination(); this.comp.connect(this.streamDest); } catch (e) { this.streamDest = null; }
    this.sfxG = c.createGain(); this.sfxG.gain.value = this.sfxVol; this.sfxG.connect(this.master);
    this.musG = c.createGain(); this.musG.gain.value = this.musicVol * 0.5; this.musG.connect(this.master);
    // delay/reverb-ish send voor muziek
    this.verb = c.createDelay(1); this.verb.delayTime.value = 0.23;
    const fb = c.createGain(); fb.gain.value = 0.32; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.verb.connect(lp); lp.connect(fb); fb.connect(this.verb);
    const vg = c.createGain(); vg.gain.value = 0.35; lp.connect(vg); vg.connect(this.musG);
    // noise buffer
    const len = c.sampleRate * 2; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    if (c.state === 'suspended') c.resume();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---------- primitieven ----------
  tone(freq, dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t = (o.when ?? c.currentTime) + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    if (o.vib) { const l = c.createOscillator(); const lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const g = c.createGain(); const v = (o.vol ?? 0.3);
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    let out = g;
    if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filterType || 'lowpass'; f.frequency.value = o.filter; g.connect(f); out = f; }
    out.connect(o.dest || this.sfxG);
    if (o.send) { const s = c.createGain(); s.gain.value = o.send; out.connect(s); s.connect(this.verb); }
    if (o.rate) osc.detune.value = o.rate;
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  noise(dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t = (o.when ?? c.currentTime) + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.freq2), t + dur);
    f.Q.value = o.q || 0.7;
    const g = c.createGain(); const v = o.vol ?? 0.3; const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfxG);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // ---------- geluidseffecten ----------
  sfx(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (this._lastSfx[name] && now - this._lastSfx[name] < 30) return;
    this._lastSfx[name] = now;
    const r = opts.rate || 1; const v = opts.vol ?? 1;
    const T = (f, d, o = {}) => this.tone(f * r, d, { ...o, vol: (o.vol ?? 0.3) * v });
    const N = (d, o = {}) => this.noise(d, { ...o, vol: (o.vol ?? 0.3) * v });
    switch (name) {
      case 'coin': T(988, 0.07, { type: 'square', vol: 0.12 }); T(1319, 0.25, { type: 'square', vol: 0.12, delay: 0.07 }); break;
      case 'click': T(600, 0.05, { type: 'triangle', vol: 0.2 }); break;
      case 'select': T(520, 0.06, { type: 'triangle', vol: 0.22 }); T(780, 0.1, { type: 'triangle', vol: 0.22, delay: 0.05 }); break;
      case 'jump': T(300, 0.18, { type: 'square', vol: 0.1, slide: 700 }); break;
      case 'land': N(0.1, { freq: 400, freq2: 100, vol: 0.25 }); break;
      case 'boing': T(200, 0.35, { type: 'sine', vol: 0.3, slide: 600, vib: 0.03 }); break;
      case 'hit': N(0.12, { freq: 1800, freq2: 200, vol: 0.4 }); T(140, 0.12, { type: 'square', vol: 0.2, slide: 60 }); break;
      case 'hurt': T(400, 0.3, { type: 'sawtooth', vol: 0.18, slide: 120 }); N(0.15, { freq: 800, vol: 0.2 }); break;
      case 'miss': T(220, 0.25, { type: 'triangle', vol: 0.25, slide: 110 }); break;
      case 'good': T(660, 0.1, { type: 'triangle', vol: 0.25 }); T(880, 0.18, { type: 'triangle', vol: 0.25, delay: 0.08 }); break;
      case 'bad': T(180, 0.2, { type: 'sawtooth', vol: 0.2 }); T(140, 0.3, { type: 'sawtooth', vol: 0.2, delay: 0.12 }); break;
      case 'buzz': T(110, 0.35, { type: 'sawtooth', vol: 0.25, filter: 700 }); break;
      case 'pop': T(500, 0.1, { type: 'sine', vol: 0.3, slide: 1100 }); break;
      case 'whoosh': N(0.3, { type: 'bandpass', freq: 400, freq2: 2400, q: 1.2, vol: 0.25, attack: 0.08 }); break;
      case 'swing': N(0.18, { type: 'bandpass', freq: 1800, freq2: 500, q: 1.5, vol: 0.28, attack: 0.03 }); break;
      case 'throw': N(0.2, { type: 'bandpass', freq: 600, freq2: 1800, q: 1.2, vol: 0.2 }); break;
      case 'shoot': T(900, 0.14, { type: 'square', vol: 0.1, slide: 150 }); N(0.06, { freq: 3000, vol: 0.1 }); break;
      case 'splash': N(0.45, { type: 'lowpass', freq: 2600, freq2: 300, vol: 0.35, attack: 0.02 }); N(0.25, { type: 'highpass', freq: 3000, vol: 0.12, delay: 0.05 }); break;
      case 'chop': N(0.05, { type: 'highpass', freq: 2500, vol: 0.3 }); T(180, 0.06, { type: 'square', vol: 0.12 }); break;
      case 'sizzle': N(0.6, { type: 'highpass', freq: 4000, vol: 0.14, attack: 0.1 }); break;
      case 'bell': T(1568, 0.9, { type: 'sine', vol: 0.2, send: 0.2 }); T(2349, 0.7, { type: 'sine', vol: 0.1 }); break;
      case 'ding': T(1760, 0.5, { type: 'sine', vol: 0.22, send: 0.15 }); break;
      case 'thud': T(90, 0.2, { type: 'sine', vol: 0.5, slide: 40 }); N(0.1, { freq: 300, vol: 0.2 }); break;
      case 'sparkle': for (let i = 0; i < 5; i++) T(1200 + i * 280, 0.18, { type: 'sine', vol: 0.12, delay: i * 0.05, send: 0.2 }); break;
      case 'step': N(0.05, { freq: 500 + Math.random() * 300, freq2: 150, vol: 0.08 }); break;
      case 'tick': T(1000, 0.03, { type: 'square', vol: 0.08 }); break;
      case 'countdown': T(440, 0.18, { type: 'square', vol: 0.15 }); break;
      case 'go': T(880, 0.35, { type: 'square', vol: 0.18 }); T(1320, 0.45, { type: 'square', vol: 0.12, delay: 0.02 }); break;
      case 'powerup': for (let i = 0; i < 6; i++) T(330 * Math.pow(1.26, i), 0.12, { type: 'square', vol: 0.1, delay: i * 0.05 }); break;
      case 'explode': N(0.8, { freq: 1500, freq2: 60, vol: 0.6, attack: 0.01 }); T(70, 0.6, { type: 'sine', vol: 0.5, slide: 25 }); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => T(f, i === 5 ? 0.6 : 0.16, { type: 'square', vol: 0.12, delay: i * 0.13, send: 0.15 })); break;
      case 'lose': [392, 370, 349, 330].forEach((f, i) => T(f, i === 3 ? 0.7 : 0.22, { type: 'triangle', vol: 0.25, delay: i * 0.2 })); break;
      case 'star': T(1047, 0.4, { type: 'triangle', vol: 0.25, send: 0.3 }); T(1568, 0.5, { type: 'sine', vol: 0.15, delay: 0.1, send: 0.3 }); break;
      case 'note': T(660, 0.12, { type: 'triangle', vol: 0.2 }); break;
      case 'wood': T(220, 0.08, { type: 'triangle', vol: 0.3, slide: 150 }); N(0.05, { freq: 900, vol: 0.15 }); break;
      case 'scrape': N(0.4, { type: 'bandpass', freq: 300, freq2: 200, q: 3, vol: 0.2 }); break;
      case 'click2': T(1400, 0.02, { type: 'square', vol: 0.1 }); break;
      case 'door': T(70, 0.25, { type: 'sine', vol: 0.4, slide: 40 }); N(0.2, { freq: 500, freq2: 100, vol: 0.2 }); break;
      // --- Deurman geluiden ---
      case 'creak': {
        const dur = 1.6 / Math.max(0.5, r);
        this.tone(95 * r, dur, { type: 'sawtooth', vol: 0.22 * v, slide: 210 * r, filter: 700, attack: 0.15 });
        this.tone(140 * r, dur, { type: 'sawtooth', vol: 0.12 * v, slide: 90 * r, filter: 900, attack: 0.2, vib: 0.05 });
        this.noise(dur, { type: 'bandpass', freq: 700, freq2: 1400, q: 6, vol: 0.12 * v, attack: 0.3 });
        break;
      }
      case 'knock': for (let i = 0; i < 3; i++) { this.tone(110, 0.12, { type: 'sine', vol: 0.55 * v, slide: 60, delay: i * 0.22 }); this.noise(0.06, { freq: 400, vol: 0.3 * v, delay: i * 0.22 }); } break;
      case 'slam': this.tone(60, 0.5, { type: 'sine', vol: 0.8 * v, slide: 28 }); this.noise(0.35, { freq: 900, freq2: 80, vol: 0.5 * v }); break;
      case 'heartbeat': for (let i = 0; i < 2; i++) this.tone(58, 0.2, { type: 'sine', vol: 0.55 * v, slide: 38, delay: i * 0.17 }); break;
      case 'drone': this.tone(55, 2.5, { type: 'sawtooth', vol: 0.12 * v, filter: 300, attack: 1.2 }); this.tone(58.3, 2.5, { type: 'sawtooth', vol: 0.1 * v, filter: 300, attack: 1.2 }); break;
      case 'static': this.noise(0.5, { type: 'highpass', freq: 2000, vol: 0.18 * v, attack: 0.02 }); break;
      case 'whisper': this.noise(1.2, { type: 'bandpass', freq: 3000, freq2: 5000, q: 4, vol: 0.12 * v, attack: 0.4 }); break;
      case 'scare': {
        // keiharde jumpscare: ruis + schreeuw + lage dreun
        this.noise(0.9, { type: 'bandpass', freq: 1800, freq2: 700, q: 0.8, vol: 0.9 * v, attack: 0.005 });
        this.tone(880, 0.9, { type: 'sawtooth', vol: 0.5 * v, slide: 1760, attack: 0.005 });
        this.tone(932, 0.9, { type: 'sawtooth', vol: 0.5 * v, slide: 1244, attack: 0.005 });
        this.tone(1480, 0.8, { type: 'square', vol: 0.25 * v, slide: 2100, attack: 0.005 });
        this.tone(50, 0.8, { type: 'sine', vol: 0.9 * v, slide: 30, attack: 0.005 });
        break;
      }
      case 'scareSoft': this.noise(0.5, { type: 'bandpass', freq: 1200, freq2: 500, q: 1, vol: 0.5 * v, attack: 0.005 }); this.tone(60, 0.5, { type: 'sine', vol: 0.6 * v, slide: 32 }); break;
      default: break;
    }
  }

  // ---------- muziek ----------
  music(name, { fade = 0.6 } = {}) {
    if (name === this.musicName) return;
    this.musicName = name;
    this._track = TRACKS[name] || null;
    if (!this.ctx) return;
    clearInterval(this._timer);
    if (!this._track) return;
    this._step = 0; this._nextT = this.ctx.currentTime + 0.1;
    this.musG.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musG.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musG.gain.linearRampToValueAtTime(this.musicVol * 0.5, this.ctx.currentTime + fade);
    this._timer = setInterval(() => this._tick(), 30);
  }
  stopMusic() { this.music(null); }
  resumeMusic() { if (this._track && this.ctx && !this._timer) { this._nextT = this.ctx.currentTime + 0.1; this._timer = setInterval(() => this._tick(), 30); } }
  duck(on) { if (this.musG) this.musG.gain.setTargetAtTime(on ? this.musicVol * 0.12 : this.musicVol * 0.5, this.ctx.currentTime, 0.1); }
  _tick() {
    const c = this.ctx; const tr = this._track;
    if (!c || !tr) return;
    if (this._nextT < c.currentTime - 0.5) this._nextT = c.currentTime + 0.05; // tab was weg
    const spb = 60 / tr.bpm / 4; // 16e noot
    while (this._nextT < c.currentTime + 0.18) {
      const step = this._step;
      tr.step(this, step % 16, Math.floor(step / 16), this._nextT, spb);
      this._step++; this._nextT += spb;
    }
  }
  // instrumenten
  pluck(m, when, dur = 0.4, vol = 0.18, type = 'triangle') { this.tone(mtof(m), dur, { type, vol, when, dest: this.musG, send: 0.35, attack: 0.004 }); }
  pad(m, when, dur = 1.5, vol = 0.08, type = 'sawtooth', filter = 900) { this.tone(mtof(m), dur, { type, vol, when, dest: this.musG, filter, attack: dur * 0.4 }); }
  bass(m, when, dur = 0.25, vol = 0.22) { this.tone(mtof(m), dur, { type: 'triangle', vol, when, dest: this.musG, attack: 0.01 }); }
  lead(m, when, dur = 0.25, vol = 0.1, type = 'square') { this.tone(mtof(m), dur, { type, vol, when, dest: this.musG, filter: 3000, send: 0.25 }); }
  flute(m, when, dur = 0.6, vol = 0.14) { this.tone(mtof(m), dur, { type: 'sine', vol, when, dest: this.musG, vib: 0.006, attack: 0.06, send: 0.4 }); }
  kick(when, vol = 0.5) { this.tone(130, 0.18, { type: 'sine', vol, when, dest: this.musG, slide: 40 }); }
  snare(when, vol = 0.22) { this.noise(0.14, { type: 'highpass', freq: 1800, vol, when, dest: this.musG }); }
  hat(when, vol = 0.07) { this.noise(0.04, { type: 'highpass', freq: 7000, vol, when, dest: this.musG }); }
}

const R = (a) => a[Math.floor(Math.random() * a.length)];
const MAJ = [0, 2, 4, 7, 9], MIN = [0, 3, 5, 7, 10];

function folk(root, prog, bpm, scale, { night = false } = {}) {
  let melody = [], mi = 0;
  return {
    bpm,
    step(A, s, bar, t, spb) {
      const ch = prog[bar % prog.length]; const r = root + ch[0]; const minor = ch[1] === 'min';
      const tri = [0, minor ? 3 : 4, 7, 12];
      if (s === 0) { A.bass(r - 12, t, spb * 6, 0.22); if (!night || bar % 2 === 0) A.pad(r + tri[1], t, spb * 15, 0.045, 'triangle', 700); A.pad(r + 7, t, spb * 15, 0.04, 'triangle', 700); }
      if (s === 8 && !night) A.bass(r - 12 + 7, t, spb * 4, 0.16);
      // harp arpeggio
      if (!night && s % 2 === 0) A.pluck(r + 12 + tri[(s / 2 + bar) % 4 | 0], t, 0.5, 0.075);
      if (night && s % 4 === 0 && Math.random() < 0.5) A.pluck(r + 24 + R(scale), t, 1.4, 0.07, 'sine');
      // melodie
      if (s === 0 && Math.random() < 0.8) { melody = [R(scale), R(scale), R(scale), R(scale)].map((n) => n + 12); mi = 0; }
      if (!night && (s === 0 || s === 4 || s === 8 || s === 12) && melody.length && Math.random() < 0.75) { A.flute(r + 12 + melody[mi++ % 4] , t, spb * 3.5, 0.11); }
      if (!night && (s === 4 || s === 12)) A.hat(t, 0.03);
      if (night && s === 0 && bar % 4 === 3) A.sfx('heartbeat', { vol: 0.2 });
    },
  };
}
function game(root, bpm, minor = false) {
  const sc = minor ? MIN : MAJ;
  const prog = minor ? [0, -2, -4, -5] : [0, 5, -3, -5];
  return {
    bpm,
    step(A, s, bar, t, spb) {
      const r = root + prog[bar % 4];
      if (s % 4 === 0) A.kick(t, 0.35);
      if (s === 4 || s === 12) A.snare(t, 0.12);
      if (s % 2 === 0) A.hat(t, 0.045);
      if (s % 2 === 0) A.bass(r - 12 + ((s / 2) % 4 === 2 ? 7 : 0), t, spb * 1.6, 0.17);
      const arp = [0, 4, 7, 12, 7, 4, 12, 16];
      if (s % 2 === 1 || s % 4 === 0) A.lead(r + (minor ? [0, 3, 7, 12, 7, 3, 12, 15][(s >> 1) % 8] : arp[(s >> 1) % 8]) + 12, t, spb * 1.4, 0.05);
      if (s === 0 && bar % 2 === 1) A.lead(r + 24 + R(sc), t, spb * 6, 0.06, 'triangle');
    },
  };
}
function puzzle(root, bpm) {
  const prog = [0, 7, 9, 5];
  return {
    bpm,
    step(A, s, bar, t, spb) {
      const r = root + prog[bar % 4];
      if (s % 8 === 0) A.bass(r - 12, t, spb * 7, 0.18);
      if (s % 2 === 0 && Math.random() < 0.8) A.pluck(r + 12 + R([0, 2, 4, 7, 9, 12]), t, 0.6, 0.07, 'sine');
      if (s % 4 === 2) A.hat(t, 0.02);
    },
  };
}
function tense() {
  return {
    bpm: 70,
    step(A, s, bar, t, spb) {
      if (s === 0) { A.pad(33, t, spb * 16, 0.12, 'sawtooth', 220); A.pad(39, t, spb * 16, 0.08, 'sawtooth', 220); }
      if (s % 8 === 0) A.tone(52, 0.25, { type: 'sine', vol: 0.4, when: t, dest: A.musG, slide: 38 });
      if (s % 8 === 3 && Math.random() < 0.5) A.pluck(76 + R([0, 1, 6]), t, 1.2, 0.04, 'sine');
    },
  };
}
const TRACKS = {
  menu: folk(60, [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], 108, MAJ),
  hub_day: folk(60, [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']], 96, MAJ),
  hub_dusk: folk(57, [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], 76, MIN),
  hub_night: folk(52, [[0, 'min'], [0, 'min'], [8, 'maj'], [7, 'min']], 56, MIN, { night: true }),
  game: game(57, 128),
  game_fast: game(62, 144),
  game_minor: game(55, 120, true),
  puzzle: puzzle(57, 100),
  tense: tense(),
  concert: game(60, 138),
};

export const audio = new AudioSys();

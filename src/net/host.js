import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { S } from '../save.js';
import { loadPeerLib, peerOptions, newCode, PREFIX, extraParams, NAMES, SLUG, slotOf } from './common.js';

// HOST (Wes): draait het hele spel, streamt beeld + geluid naar maximaal 2 gasten (Jor = speler 1, Juul = speler 2)
// en krijgt van elke gast zijn toetsen terug.
const KEEP_KEYS = ['Escape', 'Tab', 'KeyP'];
const STALE_MS = 8000;     // zo lang niets gehoord = de verbinding telt niet meer als "levend" (reload-vervanging)
const DEAD_MS = 20000;     // zo lang niets gehoord = gast is weggevallen

// Defensieve laag naar input.js: nieuwe engine = setRemote(id, state, keys); oude engine kende alleen gast 1.
const NEW_INPUT = () => Array.isArray(input.all);
function remoteSet(id, state, keys) { if (NEW_INPUT()) input.setRemote(id, state, keys); else if (id === 1) input.setRemote(state, keys); }
function remoteClear(id) { if (NEW_INPUT()) input.clearRemote(id); else if (id === 1) input.clearRemote(); }
// nieuwe engine: input.online volgt vanzelf de remote-spelers (de setter is alleen voor oude code: zou speler 1 als remote markeren)
function setOnline(v) { if (!NEW_INPUT()) try { input.online = v; } catch (e) { /* */ } }
const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
function cleanState(s) {
  s = s || {}; const o = { x: num(s.x), y: num(s.y) };
  for (const b of ['up', 'down', 'left', 'right', 'a', 'b']) o[b] = !!s[b];
  return o;
}

export class Host {
  constructor(app) {
    this.app = app; this.code = null; this.peer = null; this.base = 'idle'; this.listeners = new Set(); this._starting = null;
    // slot 0 = gast 1 (Jor, speler-id 1), slot 1 = gast 2 (Juul, speler-id 2)
    this.guests = [1, 2].map((id) => ({ id, name: NAMES[id], status: 'waiting', conn: null, call: null, token: null, lastSeen: 0, lastSeq: -1, pingMs: 0 }));
    this.comp = document.createElement('canvas'); this.g = this.comp.getContext('2d');
    this.lastSnap = ''; this.snapT = 0; this.stream = null;
    this.badge = document.createElement('div');
    this.badge.style.cssText = 'position:fixed;right:10px;top:10px;z-index:99;padding:3px 12px;border-radius:12px;background:rgba(20,12,30,.75);border:2px solid #35c46f;font:600 14px Fredoka,system-ui,sans-serif;color:#fff;display:none;pointer-events:none';
    document.body.append(this.badge);
  }
  // aantal gasten dat meedoet: volgt S.settings.players (2 spelers = 1 gast, 3 spelers = 2 gasten)
  get maxGuests() { return S.settings && S.settings.players === 3 ? 2 : 1; }
  active() { return this.guests.slice(0, this.maxGuests); }
  get connected() { return this.guests.some((g) => g.status === 'connected'); }
  get allConnected() { return this.active().every((g) => g.status === 'connected'); }
  get pingMs() { const c = this.guests.filter((g) => g.status === 'connected'); return c.length ? Math.max(...c.map((g) => g.pingMs)) : 0; }
  // totaalstatus (compatibel met de oude 1-gast-UI): starting/error/idle, anders connected > lost > waiting
  get status() {
    if (this.base !== 'ready') return this.base;
    const a = this.active();
    if (a.some((g) => g.status === 'connected')) return 'connected';
    if (a.some((g) => g.status === 'lost' || g.status === 'error')) return 'lost';
    return 'waiting';
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(this.status, this); } catch (e) { console.warn('net listener', e); } } this.updateBadge(); }
  setBase(s) { this.base = s; this.emit(); }
  // overzicht per gast voor de UI
  guestInfo() { return this.active().map((g) => ({ id: g.id, name: g.name, status: g.status, pingMs: g.pingMs, link: this.code ? this.link(g.id) : '' })); }
  // na wijziging van S.settings.players: gasten die er niet meer bij horen netjes wegsturen
  refresh() {
    for (const g of this.guests.slice(this.maxGuests)) if (g.status === 'connected') { this.sendTo(g, { t: 'reject', reason: 'kicked', msg: 'De host speelt nu met minder spelers. Jouw plek is vervallen.' }); this.drop(g, 'waiting'); }
    this.emit();
  }
  updateBadge() {
    const b = this.badge, a = this.active();
    if (this.base !== 'ready' || !a.length) { b.style.display = 'none'; return; }
    const parts = a.map((g) => (g.status === 'connected' ? `${g.name} online${g.pingMs ? ' ' + Math.round(g.pingMs) + ' ms' : ''}` : g.status === 'waiting' ? `wachten op ${g.name}…` : `${g.name} is weg`));
    const lost = a.some((g) => g.status === 'lost' || g.status === 'error'), all = this.allConnected;
    if (!this.connected && !lost) parts.push(`code ${this.code}`);
    b.style.display = 'block'; b.style.borderColor = lost ? '#e5484d' : all ? '#35c46f' : '#ffcf3a';
    b.textContent = '🌐 ' + parts.join(' · ');
  }
  link(as) {
    const u = new URL(location.href); u.search = ''; u.hash = '';
    const extra = extraParams(); const id = slotOf(as);
    return `${u.toString()}?join=${this.code}${id ? '&as=' + SLUG[id] : ''}${extra ? '&' + extra : ''}`;
  }
  start() {
    if (this.peer && this.code) return Promise.resolve(this.code);
    if (!this._starting) this._starting = this._start().finally(() => { this._starting = null; });
    return this._starting;
  }
  async _start() {
    await loadPeerLib();
    this.setBase('starting');
    let err = null;
    for (let attempt = 0; attempt < 5 && !this.peer; attempt++) {
      const code = newCode();
      try {
        await new Promise((resolve, reject) => {
          const peer = new window.Peer(PREFIX + code, peerOptions());
          const to = setTimeout(() => { peer.destroy(); reject(new Error('timeout')); }, 12000);
          peer.on('open', () => { clearTimeout(to); this.peer = peer; this.code = code; resolve(); });
          peer.on('error', (e) => { clearTimeout(to); if (e.type === 'unavailable-id') { peer.destroy(); reject(new Error('bezet')); } else if (!this.peer) { peer.destroy(); reject(e); } else console.warn('peer', e); });
        });
      } catch (e) { err = e; if (e.message !== 'bezet' && attempt >= 1) break; }
    }
    if (!this.peer) { this.setBase('error'); throw err || new Error('Geen verbinding met de signaalserver'); }
    this.peer.on('connection', (conn) => this.onConnection(conn));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* */ } });
    this.watch = setInterval(() => this.tick(), 2000);
    this.setBase('ready');
    return this.code;
  }
  // elke 2 s: gasten zonder levensteken laten vallen, overtollige gasten wegsturen
  tick() {
    const now = performance.now();
    for (const g of this.guests) if (g.status === 'connected' && now - g.lastSeen > DEAD_MS) this.drop(g, 'lost');
    if (this.guests.slice(this.maxGuests).some((g) => g.status === 'connected')) this.refresh();
  }
  sendTo(g, m) { try { if (g.conn && g.conn.open) { g.conn.send(m); return true; } } catch (e) { /* */ } return false; }
  live(g) { return g.status === 'connected' && g.conn && g.conn.open && performance.now() - g.lastSeen < STALE_MS; }

  // Nieuwe inkomende verbinding: plek kiezen (of weigeren) zodra het kanaal open is
  onConnection(conn) {
    let g = null;
    conn.on('open', () => {
      const pick = this.pick(conn.metadata || {});
      if (pick.reject) {
        try { conn.send({ t: 'reject', reason: pick.reject, msg: pick.msg }); } catch (e) { /* */ }
        setTimeout(() => { try { conn.close(); } catch (e) { /* */ } }, 600);
        return;
      }
      g = pick.g; this.attach(g, conn, conn.metadata || {});
    });
    conn.on('data', (m) => { if (g && g.conn === conn) this.onData(g, m); });
    conn.on('close', () => { if (g && g.conn === conn) this.drop(g, 'lost'); });
    conn.on('error', () => { if (g && g.conn === conn) this.drop(g, 'error'); });
  }
  pick(md) {
    const max = this.maxGuests, want = slotOf(md.as);
    const same = (g) => md.token && g.token === md.token;     // zelfde tabblad komt terug (herladen)
    if (want) {
      if (want > max) return { reject: 'noplayer', msg: `${NAMES[want]} doet niet mee: de host speelt nu met z'n tweeën. Vraag de host om "Met z'n drieën" te kiezen.` };
      const g = this.guests[want - 1];
      if (g.status === 'connected' && !same(g) && this.live(g)) return { reject: 'taken', msg: `${g.name} doet al mee op een ander apparaat. Gebruik jouw eigen link, of vraag de host om een nieuwe.` };
      return { g };
    }
    const mine = this.active().find(same); if (mine) return { g: mine };
    const free = this.active().find((g) => !this.live(g) && g.status !== 'connected') || this.active().find((g) => !this.live(g));
    if (free) return { g: free };
    return { reject: 'full', msg: max > 1 ? 'Het spel zit vol: Jor en Juul doen al mee.' : "Het spel zit vol: Jor doet al mee. Vraag de host om 'Met z'n drieën' te kiezen." };
  }
  attach(g, conn, md) {
    const old = g.conn, oldCall = g.call; g.conn = conn; g.call = null;      // eerst omzetten: de 'close' van de oude telt dan niet meer
    if (old && old !== conn) try { old.close(); } catch (e) { /* oude verbinding weg */ }
    try { if (oldCall) oldCall.close(); } catch (e) { /* */ }
    g.token = md.token || null; g.lastSeen = performance.now(); g.lastSeq = -1; g.pingMs = 0; g.status = 'connected';
    remoteClear(g.id); setOnline(true); this.lastSnap = '';
    conn.send({ t: 'welcome', id: g.id, name: g.name, players: S.settings.players === 3 ? 3 : 2 });
    this.startMedia(g);
    this.emit();
  }
  // gast weg (status 'lost'/'error') of teruggezet naar 'waiting'
  drop(g, status) {
    const was = g.status === 'connected';
    const conn = g.conn, call = g.call; g.conn = null; g.call = null; g.status = status;
    try { if (call) call.close(); } catch (e) { /* */ }
    try { if (conn) conn.close(); } catch (e) { /* */ }
    remoteClear(g.id); setOnline(this.connected);
    if (was || status === 'waiting') this.emit();
  }
  mediaStream() {
    this.resizeComp();
    if (!this.stream) this.stream = this.comp.captureStream(30);
    const at = audio.streamDest && audio.streamDest.stream.getAudioTracks()[0];
    if (at && !this.stream.getAudioTracks().includes(at)) this.stream.addTrack(at);
    return this.stream;
  }
  startMedia(g) {
    const stream = this.mediaStream();
    const call = this.peer.call(g.conn.peer, stream); g.call = call;     // elke gast een eigen call, dezelfde tracks
    call.on('error', (e) => console.warn('call', e));
    // genoeg bitrate voor een scherp beeld (bij twee gasten wat zuiniger voor de uplink van de host)
    setTimeout(() => {
      try {
        const kbps = this.guests.filter((x) => x.status === 'connected').length > 1 ? 2_500_000 : 4_000_000;
        call.peerConnection.getSenders().forEach((s) => { if (s.track && s.track.kind === 'video') { const p = s.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = kbps; p.encodings[0].maxFramerate = 30; s.setParameters(p).catch(() => {}); } });
      } catch (e) { /* */ }
    }, 1500);
  }
  onData(g, m) {
    if (!m || typeof m !== 'object') return;
    g.lastSeen = performance.now();
    if (m.t === 'in') {
      if (m.q <= g.lastSeq && m.q - g.lastSeq > -1000) return; g.lastSeq = m.q;
      remoteSet(g.id, cleanState(m.s), Array.isArray(m.k) ? m.k.filter((c) => KEEP_KEYS.includes(c)) : []);
    } else if (m.t === 'ping') {
      this.sendTo(g, { t: 'pong', ts: m.ts });
      if (typeof m.rtt === 'number' && m.rtt > 0) { g.pingMs = m.rtt; this.updateBadge(); }
    } else if (m.t === 'bye') this.drop(g, 'lost');
    else if (m.t === 'click') {
      const x = +m.x, y = +m.y; if (!isFinite(x) || !isFinite(y)) return;
      const el = document.elementFromPoint(x, y);
      const t = el && (el.closest('.btn') || el.closest('button') || el.closest('[data-remote-click]'));
      if (t) t.click();
    }
  }
  resizeComp() {
    const W = Math.min(1280, innerWidth), H = Math.round(W * innerHeight / innerWidth);
    if (this.comp.width !== W || this.comp.height !== H) { this.comp.width = W; this.comp.height = H; }
  }
  // Elke frame, na het renderen: beeld samenstellen + (af en toe) de HTML-laag doorsturen naar alle gasten
  afterRender(dt) {
    if (!this.connected) return;
    this.resizeComp();
    const { g, comp } = this; const gl = this.app.renderer.domElement;
    g.drawImage(gl, 0, 0, comp.width, comp.height);
    const sx = comp.width / innerWidth, sy = comp.height / innerHeight;
    for (const c of document.querySelectorAll('#hud canvas, #screens canvas')) {   // minimap, ritmebalk...
      const r = c.getBoundingClientRect(); if (r.width > 0) g.drawImage(c, r.left * sx, r.top * sy, r.width * sx, r.height * sy);
    }
    const sc = document.getElementById('scare'); if (sc && sc.style.display === 'block') g.drawImage(sc, 0, 0, comp.width, comp.height);
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.09;
      const snap = { t: 'ui', h: document.getElementById('hud').innerHTML, s: document.getElementById('screens').innerHTML, v: document.getElementById('vignette').style.opacity || '0', f: document.getElementById('fade').style.opacity || '0', w: innerWidth, hh: innerHeight };
      const key = snap.h + '\u0001' + snap.s + '\u0001' + snap.v + '\u0001' + snap.f + snap.w + 'x' + snap.hh;
      if (key !== this.lastSnap) { this.lastSnap = key; for (const x of this.guests) if (x.status === 'connected') this.sendTo(x, snap); }
    }
  }
}

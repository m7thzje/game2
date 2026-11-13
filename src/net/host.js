import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { S } from '../save.js';
import { loadPeerLib, peerOptions, newCode, PREFIX, extraParams, NAMES, SLUG, slotOf, isGamehal, maxGuestsAllowed, nameList } from './common.js';

// HOST (Wes): draait het hele spel, streamt beeld + geluid naar maximaal 3 gasten (Jor = speler 1, Juul = speler 2,
// Sam = speler 3, alleen in de Gamehal) en krijgt van elke gast zijn toetsen terug.
const KEEP_KEYS = ['Escape', 'Tab', 'KeyP'];
const STALE_MS = 8000;     // zo lang niets gehoord = de verbinding telt niet meer als "levend" (reload-vervanging)
const DEAD_MS = 20000;     // zo lang niets gehoord = gast is weggevallen

// Streamkwaliteit per gast, afhankelijk van het aantal verbonden gasten. Elke gast heeft een eigen encoder (WebRTC codeert per verbinding),
// dus 3 gasten = 3x de encoder-CPU en 3x de uplink van de host. Met 1 en 2 gasten blijft alles zoals het was; bij 3 gasten gaat de
// resolutie 1,5x omlaag (1280x720 -> ~853x480) en de framerate naar 25: dat is ~56% van de pixels per seconde van twee gasten in volle
// kwaliteit (3 x 0,41 Mpx x 25 = 31 Mpx/s tegen 2 x 0,92 Mpx x 30 = 55 Mpx/s) en 4,8 Mbit/s totaal i.p.v. 5 Mbit/s.
export function qualityFor(n) {
  if (n >= 3) return { bps: 1_600_000, fps: 25, scale: 1.5 };
  if (n === 2) return { bps: 2_500_000, fps: 30, scale: 1 };
  return { bps: 4_000_000, fps: 30, scale: 1 };
}

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
    // slot 0 = gast 1 (Jor, speler-id 1), slot 1 = gast 2 (Juul, speler-id 2), slot 2 = gast 3 (Sam, speler-id 3; alleen Gamehal)
    this.guests = [1, 2, 3].map((id) => ({ id, name: NAMES[id], status: 'waiting', conn: null, call: null, token: null, lastSeen: 0, lastSeq: -1, pingMs: 0 }));
    this.comp = document.createElement('canvas'); this.g = this.comp.getContext('2d');
    this.lastSnap = ''; this.snapT = 0; this.stream = null;
    this.badge = document.createElement('div');
    this.badge.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99;max-width:min(300px,34vw);padding:1px 9px;border-radius:10px;background:rgba(20,12,30,.7);border:2px solid #35c46f;font:600 11px/1.35 Fredoka,system-ui,sans-serif;color:#fff;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;pointer-events:none';   // rechtsboven, klein; placeBadge() zet hem onder de HUD-vakken zodat hij er nooit overheen valt
    document.body.append(this.badge);
  }
  // aantal gasten dat meedoet: volgt S.settings.players (2 spelers = 1 gast, 3 = 2 gasten, 4 = 3 gasten); de gewone versie stopt bij 2 gasten
  get maxGuests() { const p = S.settings ? S.settings.players : 2; return Math.min(p >= 4 ? 3 : p === 3 ? 2 : 1, maxGuestsAllowed()); }
  get players() { return Math.min(4, Math.max(2, (S.settings && S.settings.players) | 0)); }
  active() { return this.guests.slice(0, this.maxGuests); }
  get connected() { return this.guests.some((g) => g.status === 'connected'); }
  connectedCount() { return this.guests.reduce((n, g) => n + (g.status === 'connected' ? 1 : 0), 0); }
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
  // Statuspil rechtsboven maar onder de HUD-vakken die er horizontaal onder vallen (bij 2, 3 en 4 spelers, ook met teamkolommen); ~4x per seconde bijgewerkt
  placeBadge(dt) {
    const b = this.badge; this._bt = (this._bt || 0) - dt;
    if (this._bt > 0 || b.style.display === 'none') return;
    this._bt = 0.25;
    const left = innerWidth - 8 - b.offsetWidth; let y = 8;
    for (const e of document.querySelectorAll('#hud .pbox, #hud .hud-col, #hud .hud-mid')) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.right > left - 4 && r.left < innerWidth && r.top < 300) y = Math.max(y, r.bottom + 6); }
    const t = Math.round(y) + 'px'; if (b.style.top !== t) b.style.top = t;
  }
  updateBadge() {
    const b = this.badge, a = this.active();
    if (this.base !== 'ready' || !a.length) { b.style.display = 'none'; return; }
    const lost = a.some((g) => g.status === 'lost' || g.status === 'error'), all = this.allConnected;
    // compact (staat rechtsboven, klein): iedereen verbonden = '3/3 online · 54 ms', anders per gast een korte status
    const parts = all ? [`${a.length}/${a.length} online${this.pingMs ? ' · ' + Math.round(this.pingMs) + ' ms' : ''}`] : a.map((g) => (g.status === 'connected' ? `${g.name} ✓` : g.status === 'waiting' ? `${g.name} …` : `${g.name} ⚠`));
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
      if (want > max) return { reject: 'noplayer', msg: this.noPlayerMsg(want) };
      const g = this.guests[want - 1];
      if (g.status === 'connected' && !same(g) && this.live(g)) return { reject: 'taken', msg: `${g.name} doet al mee op een ander apparaat. Gebruik jouw eigen link, of vraag de host om een nieuwe.` };
      return { g };
    }
    const mine = this.active().find(same); if (mine) return { g: mine };
    const free = this.active().find((g) => !this.live(g) && g.status !== 'connected') || this.active().find((g) => !this.live(g));
    if (free) return { g: free };
    return { reject: 'full', msg: max > 2 ? `Het spel zit vol: ${nameList([1, 2, 3])} doen al mee.` : max > 1 ? 'Het spel zit vol: Jor en Juul doen al mee.' : "Het spel zit vol: Jor doet al mee. Vraag de host om 'Met z'n drieën' te kiezen." };
  }
  noPlayerMsg(want) {
    if (want === 3 && !isGamehal()) return 'Sam doet alleen mee in de Gamehal (met 4 spelers). Open de Gamehal-versie van het spel of speel zonder Sam.';
    const max = this.maxGuests;
    return `${NAMES[want]} doet niet mee: de host speelt nu met z'n ${max > 1 ? 'drieën' : 'tweeën'}. Vraag de host om "Met z'n ${want === 3 ? 'vieren' : 'drieën'}" te kiezen.`;
  }
  attach(g, conn, md) {
    const old = g.conn, oldCall = g.call; g.conn = conn; g.call = null;      // eerst omzetten: de 'close' van de oude telt dan niet meer
    if (old && old !== conn) try { old.close(); } catch (e) { /* oude verbinding weg */ }
    try { if (oldCall) oldCall.close(); } catch (e) { /* */ }
    const wasLost = g.status === 'lost' || g.status === 'error';
    g.token = md.token || null; g.lastSeen = performance.now(); g.lastSeq = -1; g.pingMs = 0; g.status = 'connected';
    remoteClear(g.id); setOnline(true); this.lastSnap = '';
    if (wasLost) this.notify(`✅ ${g.name} is terug!`);
    conn.send({ t: 'welcome', id: g.id, name: g.name, players: this.players });
    this.startMedia(g);
    this.applyQuality();      // de andere gasten krijgen (bij 3 gasten) meteen de zuinigere instelling
    this.emit();
  }
  // melding op het scherm van de host (en via de UI-snapshot ook bij alle gasten); alleen in het 3-gasten-spel, daar is het wegvallen van één gast anders makkelijk te missen
  notify(text) { if (this.maxGuests < 3) return; try { this.app.ui.hud.toast(text, 4000); } catch (e) { /* geen HUD */ } }
  // gast weg (status 'lost'/'error') of teruggezet naar 'waiting'
  drop(g, status) {
    const was = g.status === 'connected';
    const conn = g.conn, call = g.call; g.conn = null; g.call = null; g.status = status;
    try { if (call) call.close(); } catch (e) { /* */ }
    try { if (conn) conn.close(); } catch (e) { /* */ }
    remoteClear(g.id); setOnline(this.connected);    // zijn toetsen worden losgelaten en zijn plek is vrij: de speler valt terug op het lokale toetsenbord
    if (was && (status === 'lost' || status === 'error')) this.notify(`⚠️ ${g.name} is weggevallen — de plek blijft vrij`);
    this.applyQuality();      // overblijvende gasten mogen weer een scherper beeld
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
    // De encoder-instellingen kunnen pas als de verbinding onderhandeld is: ruim na het starten, en nog eens voor de zekerheid.
    setTimeout(() => this.applyQuality(), 1500); setTimeout(() => this.applyQuality(), 5000);
  }
  // Bitrate / framerate / resolutie van elke videosender aan het aantal verbonden gasten aanpassen (zie qualityFor)
  applyQuality() {
    const conn = this.guests.filter((x) => x.status === 'connected' && x.call);
    const q = this.quality = qualityFor(conn.length);
    for (const x of conn) {
      try {
        x.call.peerConnection.getSenders().forEach((s) => {
          if (!s.track || s.track.kind !== 'video') return;
          const p = s.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
          Object.assign(p.encodings[0], { maxBitrate: q.bps, maxFramerate: q.fps, scaleResolutionDownBy: q.scale });
          s.setParameters(p).catch(() => {});
        });
      } catch (e) { /* verbinding nog niet klaar of al weg */ }
    }
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
    this.placeBadge(dt);
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
      this.snapT = this.connectedCount() >= 3 ? 0.14 : 0.09;   // bij 3 gasten de HTML-laag wat minder vaak versturen
      const snap = { t: 'ui', h: document.getElementById('hud').innerHTML, s: document.getElementById('screens').innerHTML, v: document.getElementById('vignette').style.opacity || '0', f: document.getElementById('fade').style.opacity || '0', w: innerWidth, hh: innerHeight };
      const key = snap.h + '\u0001' + snap.s + '\u0001' + snap.v + '\u0001' + snap.f + snap.w + 'x' + snap.hh;
      if (key !== this.lastSnap) { this.lastSnap = key; for (const x of this.guests) if (x.status === 'connected') this.sendTo(x, snap); }
    }
  }
}

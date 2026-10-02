import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { loadPeerLib, peerOptions, newCode, PREFIX, extraParams } from './common.js';

// HOST: draait het hele spel, streamt beeld + geluid naar de gast en krijgt de toetsen van speler 2 terug.
export class Host {
  constructor(app) {
    this.app = app; this.code = null; this.peer = null; this.conn = null; this.call = null;
    this.connected = false; this.status = 'idle'; this.listeners = new Set();
    this.comp = document.createElement('canvas'); this.g = this.comp.getContext('2d');
    this.lastSnap = ''; this.snapT = 0; this.stream = null; this.lastSeq = -1; this.pingMs = 0;
    this.badge = document.createElement('div');
    this.badge.style.cssText = 'position:fixed;right:10px;top:10px;z-index:99;padding:3px 12px;border-radius:12px;background:rgba(20,12,30,.75);border:2px solid #35c46f;font:600 14px Fredoka,system-ui,sans-serif;color:#fff;display:none;pointer-events:none';
    document.body.append(this.badge);
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) f(this.status, this); }
  setStatus(s) { this.status = s; this.emit(); this.updateBadge(); }
  updateBadge() {
    const b = this.badge;
    if (this.status === 'connected') { b.style.display = 'block'; b.style.borderColor = '#35c46f'; b.textContent = `🌐 Jor is online · ${Math.round(this.pingMs)} ms`; }
    else if (this.status === 'waiting') { b.style.display = 'block'; b.style.borderColor = '#ffcf3a'; b.textContent = `🌐 Wachten op Jor… code ${this.code}`; }
    else if (this.status === 'lost') { b.style.display = 'block'; b.style.borderColor = '#e5484d'; b.textContent = '🌐 Jor is weg — vraag hem opnieuw te joinen'; }
    else b.style.display = 'none';
  }
  link() {
    const u = new URL(location.href); u.search = ''; u.hash = '';
    const extra = extraParams();
    return `${u.toString()}?join=${this.code}${extra ? '&' + extra : ''}`;
  }
  async start() {
    if (this.peer && this.code) return this.code;
    await loadPeerLib();
    this.setStatus('starting');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      try {
        await new Promise((resolve, reject) => {
          const peer = new window.Peer(PREFIX + code, peerOptions());
          const to = setTimeout(() => { peer.destroy(); reject(new Error('timeout')); }, 12000);
          peer.on('open', () => { clearTimeout(to); this.peer = peer; this.code = code; resolve(); });
          peer.on('error', (e) => { clearTimeout(to); if (e.type === 'unavailable-id') { peer.destroy(); reject(new Error('bezet')); } else if (!this.peer) { peer.destroy(); reject(e); } else console.warn('peer', e); });
        });
        break;
      } catch (e) { if (e.message !== 'bezet' && attempt >= 1) { this.setStatus('error'); throw e; } }
    }
    if (!this.peer) { this.setStatus('error'); throw new Error('Geen verbinding met de signaalserver'); }
    this.peer.on('connection', (conn) => this.onConnection(conn));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* */ } });
    this.setStatus('waiting');
    return this.code;
  }
  onConnection(conn) {
    if (this.conn && this.conn.open) { try { this.conn.close(); } catch (e) { /* oude verbinding weg */ } }
    this.conn = conn; this.lastSeq = -1;
    conn.on('open', () => {
      this.connected = true; input.online = true; input.clearRemote(); this.setStatus('connected'); this.lastSnap = '';
      this.startMedia(conn.peer);
    });
    conn.on('data', (m) => this.onData(m));
    const gone = () => { if (this.conn !== conn) return; this.connected = false; input.online = false; input.clearRemote(); this.setStatus('lost'); };
    conn.on('close', gone); conn.on('error', gone);
  }
  startMedia(guestId) {
    this.resizeComp();
    if (!this.stream) {
      this.stream = this.comp.captureStream(30);
      const at = audio.streamDest && audio.streamDest.stream.getAudioTracks()[0];
      if (at) this.stream.addTrack(at);
    }
    try { if (this.call) this.call.close(); } catch (e) { /* */ }
    this.call = this.peer.call(guestId, this.stream);
    this.call.on('error', (e) => console.warn('call', e));
    // genoeg bitrate voor een scherp beeld
    setTimeout(() => {
      try { const pc = this.call.peerConnection; pc.getSenders().forEach((s) => { if (s.track && s.track.kind === 'video') { const p = s.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = 4_000_000; p.encodings[0].maxFramerate = 30; s.setParameters(p).catch(() => {}); } }); } catch (e) { /* */ }
    }, 1500);
  }
  onData(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'in') { if (m.q <= this.lastSeq && m.q - this.lastSeq > -1000) return; this.lastSeq = m.q; input.setRemote(m.s, m.k); }
    else if (m.t === 'ping') { this.conn.send({ t: 'pong', ts: m.ts }); this.pingMs = m.rtt ?? this.pingMs; if (m.rtt != null) this.updateBadge(); }
    else if (m.t === 'click') {
      const el = document.elementFromPoint(m.x, m.y);
      if (el && (el.closest('.btn') || el.closest('button') || el.closest('[data-remote-click]'))) (el.closest('.btn') || el.closest('button') || el.closest('[data-remote-click]')).click();
    }
  }
  resizeComp() {
    const W = Math.min(1280, innerWidth), H = Math.round(W * innerHeight / innerWidth);
    if (this.comp.width !== W || this.comp.height !== H) { this.comp.width = W; this.comp.height = H; }
  }
  // Elke frame, na het renderen: beeld samenstellen + (af en toe) de HTML-laag doorsturen
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
    if (this.snapT <= 0 && this.conn && this.conn.open) {
      this.snapT = 0.09;
      const snap = { t: 'ui', h: document.getElementById('hud').innerHTML, s: document.getElementById('screens').innerHTML, v: document.getElementById('vignette').style.opacity || '0', f: document.getElementById('fade').style.opacity || '0', w: innerWidth, hh: innerHeight };
      const key = snap.h + '\u0001' + snap.s + '\u0001' + snap.v + '\u0001' + snap.f + snap.w + 'x' + snap.hh;
      if (key !== this.lastSnap) { this.lastSnap = key; try { this.conn.send(snap); } catch (e) { /* */ } }
    }
  }
}

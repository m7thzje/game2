// Gedeelde hulpjes voor online spelen (WebRTC via PeerJS)
export const PREFIX = 'hvk-karweitjes-';

export function loadPeerLib() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../../lib/peerjs.min.js', import.meta.url).href;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS niet gevonden')));
    s.onerror = () => reject(new Error('PeerJS kon niet geladen worden'));
    document.head.append(s);
  });
}

// Eigen signaalserver mogelijk via ?peerhost=localhost&peerport=9000&peersecure=0
export function peerOptions() {
  const q = new URLSearchParams(location.search);
  const o = { debug: 0 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 443); o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') ? q.get('peersecure') !== '0' : o.port === 443;
  }
  const ice = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
  // optioneel eigen TURN-server voor lastige netwerken:  ?turn=turn:server:3478|gebruiker|wachtwoord
  if (q.get('turn')) { const [urls, username, credential] = q.get('turn').split('|'); ice.push({ urls, username, credential }); }
  o.config = { iceServers: ice };
  return o;
}
export function newCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
export function extraParams() {   // geef eigen signaalserver-parameters door in de gedeelde link
  const q = new URLSearchParams(location.search); const keep = new URLSearchParams();
  for (const k of ['peerhost', 'peerport', 'peerpath', 'peersecure', 'turn']) if (q.get(k)) keep.set(k, q.get(k));
  return keep.toString();
}

// Spelers: host = Wes (0), gast 1 = Jor (1), gast 2 = Juul (2)
export const NAMES = ['Wes', 'Jor', 'Juul'];
export const SLUG = ['wes', 'jor', 'juul'];
export const CSS = ['#35c46f', '#4a8cff', '#ff8a3c'];
// 'jor' | 'juul' | 1 | 2 -> spelers-id (1 of 2), anders 0
export function slotOf(v) {
  if (v === 1 || v === 2) return v;
  const s = String(v || '').toLowerCase();
  return s === 'jor' ? 1 : s === 'juul' ? 2 : 0;
}
// Vast per tabblad (blijft bij herladen): zo herkent de host dezelfde gast en vervangt hij zijn oude verbinding
export function guestToken() {
  try { let t = sessionStorage.getItem('hvk-token'); if (!t) { t = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('hvk-token', t); } return t; } catch (e) { return Math.random().toString(36).slice(2, 12); }
}

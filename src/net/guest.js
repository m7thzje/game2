import { loadPeerLib, peerOptions, PREFIX, NAMES, SLUG, CSS, slotOf, guestToken } from './common.js';

// GAST (Jor = speler 2 of Juul = speler 3): dunne client. Toont het beeld van de host, stuurt alleen toetsen terug.
// Link: ?join=CODE&as=jor|juul  (zonder "as" wijst de host de eerstvolgende vrije plek toe).
const $ = (id) => document.getElementById(id);
const css = (el, s) => { el.style.cssText = s; return el; };

function overlay(html, extra = '') {
  const o = document.createElement('div');
  css(o, 'position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:radial-gradient(ellipse at center,#2a1c4a,#0c0814);color:#fff;font-family:Fredoka,system-ui,sans-serif;text-align:center;padding:20px;' + extra);
  o.innerHTML = html; document.body.append(o); return o;
}
const btnCss = "font:700 26px MedievalSharp,Fredoka,serif;padding:14px 34px;border-radius:16px;border:4px solid #3a2412;background:linear-gradient(180deg,#ffd45a,#e0a020);color:#3a2412;cursor:pointer;box-shadow:0 5px 0 #3a2412";

// Eigen toetsenbord: WASD, pijltjes én IJKL werken allemaal; F/Spatie/Enter/U = A, G/E/Shift/O = B
const KEYS = {
  up: ['KeyW', 'ArrowUp', 'KeyI'], down: ['KeyS', 'ArrowDown', 'KeyK'], left: ['KeyA', 'ArrowLeft', 'KeyJ'], right: ['KeyD', 'ArrowRight', 'KeyL'],
  a: ['KeyF', 'Space', 'Enter', 'NumpadEnter', 'Slash', 'KeyU'], b: ['KeyG', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Period', 'Numpad0', 'KeyO'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat().concat(['Escape', 'Tab', 'KeyP']));
const SEND_KEYS = ['Escape', 'Tab', 'KeyP'];

export async function runGuest() {
  const boot = $('boot'); if (boot) boot.remove();
  $('gl').style.display = 'none';
  const q = new URLSearchParams(location.search);
  let code = (q.get('join') || '').replace(/\D/g, '');
  let want = slotOf(q.get('as'));                                   // 0 = de host kiest
  const ask = want ? `Je doet mee als <b style="color:${CSS[want]}">${NAMES[want]}</b> (speler ${want + 1})` : `Je doet mee als <b style="color:${CSS[1]}">Jor</b> of <b style="color:${CSS[2]}">Juul</b>`;
  // 1. code + klik (nodig voor geluid)
  await new Promise((resolve) => {
    const o = overlay(`<div style="font:min(10vw,64px) MedievalSharp,serif;color:#ffcf3a;text-shadow:0 5px 0 #5b3a1e">Wes &amp; Jor: De Speelhal</div>
      <div style="font-size:24px">${ask}</div>
      ${want ? '' : `<select id="gas" style="font:700 22px Fredoka,sans-serif;padding:8px 14px;border-radius:12px;border:3px solid #ffcf3a"><option value="0">De host wijst mijn plek toe</option><option value="1">Ik ben Jor</option><option value="2">Ik ben Juul</option></select>`}
      ${code ? `<div style="font-size:22px">Code: <b>${code}</b></div>` : `<input id="gcode" inputmode="numeric" maxlength="6" placeholder="code van de host" style="font:700 30px Fredoka,sans-serif;padding:10px 16px;border-radius:12px;border:4px solid #4a8cff;text-align:center;width:min(320px,80vw)">`}
      <button id="gjoin" style="${btnCss}">Meedoen!</button>
      <div style="opacity:.75;max-width:520px;font-size:16px">Lopen met <b>WASD</b>, de <b>pijltjes</b> of <b>IJKL</b>. Actieknoppen: <b>F / Enter / U</b> en <b>G / Shift / O</b>. Het beeld komt van de computer van de host.</div>`);
    const go = () => {
      const inp = o.querySelector('#gcode'); if (inp) code = inp.value.replace(/\D/g, '');
      if (code.length < 4) return;
      const sel = o.querySelector('#gas'); if (sel) want = +sel.value;
      o.remove(); resolve();
    };
    o.querySelector('#gjoin').onclick = go; const inp = o.querySelector('#gcode'); if (inp) { inp.focus(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); }
  });
  const status = overlay('<div style="font-size:30px">🌐 Verbinden met de host…</div><div id="gstat" style="opacity:.8;font-size:18px">Even geduld</div>');
  const setStat = (t) => { const e = status.querySelector('#gstat'); if (e) e.textContent = t; };
  try { await loadPeerLib(); } catch (e) { setStat('PeerJS kon niet geladen worden'); return; }

  // 2. scherm: app-container krijgt de grootte van de host en wordt geschaald
  const app = $('app'); const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; css(video, 'position:absolute;left:0;top:0;width:100%;height:100%;background:#000;object-fit:fill');
  app.insertBefore(video, $('hud'));
  let HW = 1280, HH = 720, K = 1, OX = 0, OY = 0;
  const layout = () => {
    K = Math.min(innerWidth / HW, innerHeight / HH); OX = (innerWidth - HW * K) / 2; OY = (innerHeight - HH * K) / 2;
    css(app, `position:fixed;left:${OX}px;top:${OY}px;width:${HW}px;height:${HH}px;transform:scale(${K});transform-origin:0 0`);
  };
  addEventListener('resize', layout); layout();

  // 3. verbinding
  const peer = new window.Peer(undefined, peerOptions());
  let conn = null, gotVideo = false, rtt = 0, seq = 0, alive = true, me = null, ended = false, started = false;
  const G = window.__guest = { get id() { return me ? me.id : null; }, get name() { return me ? me.name : null; }, get state() { return ended ? 'ended' : me ? (gotVideo ? 'playing' : 'welcomed') : 'connecting'; }, reason: null, msg: null, peer, leave() { ended = true; alive = false; try { conn.send({ t: 'bye' }); } catch (e) { /* */ } setTimeout(() => { try { peer.destroy(); } catch (e) { /* */ } }, 150); } };
  const fail = (msg, reason) => {
    if (ended) return; ended = true; alive = false; G.reason = reason || 'lost'; G.msg = msg;
    status.remove();
    const o = overlay(`<div style="font-size:30px;max-width:640px">😕 ${msg}</div><button style="${btnCss}" id="gre">Opnieuw proberen</button>`, 'z-index:300');
    o.querySelector('#gre').onclick = () => location.reload();
  };
  peer.on('error', (e) => { if (e.type === 'peer-unavailable') fail('Die code bestaat niet (meer). Vraag de host om een nieuwe link.', 'nocode'); else if (!conn || !conn.open) fail('Geen verbinding met de server (' + e.type + ')', 'server'); });
  peer.on('call', (call) => {
    call.answer();
    call.on('stream', (stream) => { video.srcObject = stream; video.muted = false; video.play().catch(() => { video.muted = true; video.play(); }); if (!gotVideo) { gotVideo = true; status.remove(); } });
    call.on('close', () => { if (alive) fail('De verbinding met de host is verbroken.'); });
  });
  peer.on('open', () => {
    setStat('Code ' + code + ' zoeken…');
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { as: want ? SLUG[want] : null, token: guestToken() } });
    conn.on('open', () => setStat('Verbonden! Plek wordt gezocht…'));
    conn.on('data', onData);
    conn.on('close', () => { if (alive) fail('De host heeft het spel verlaten.'); });
    setTimeout(() => { if (!conn.open && alive) fail('De host is niet gevonden. Staat het spel bij hem open op het "Online" scherm?', 'notfound'); }, 20000);
  });

  // 4. UI-laag van de host weergeven
  const hud = $('hud'), screens = $('screens'), vig = $('vignette'), fade = $('fade');
  let last = { h: '', s: '' };
  function onData(m) {
    if (!m) return;
    if (m.t === 'ui') {
      if (m.w && (m.w !== HW || m.hh !== HH)) { HW = m.w; HH = m.hh; layout(); }
      if (m.h !== last.h) { hud.innerHTML = m.h; last.h = m.h; }
      if (m.s !== last.s) { screens.innerHTML = m.s; last.s = m.s; }
      vig.style.opacity = m.v; fade.style.opacity = m.f; fade.style.transition = 'none';
    } else if (m.t === 'pong') { rtt = performance.now() - m.ts; }
    else if (m.t === 'welcome') {
      me = { id: m.id, name: m.name };
      setStat(`Je speelt als ${me.name} — beeld wordt opgestart…`);
      labelEl.textContent = `🎮 Je speelt als ${me.name}`; labelEl.style.borderColor = CSS[me.id] || '#fff'; labelEl.style.display = 'block';
      banner(`Je speelt als <b style="color:${CSS[me.id]}">${me.name}</b>`);
      start();
    } else if (m.t === 'reject') {
      alive = false; fail(m.msg || 'Je mag niet meedoen.', m.reason || 'rejected');
    }
  }
  const labelEl = css(document.createElement('div'), 'position:fixed;left:8px;top:6px;z-index:90;font:700 16px Fredoka,sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:3px 14px;border-radius:12px;border:2px solid #fff;pointer-events:none;display:none');
  document.body.append(labelEl);
  function banner(html) {
    const b = css(document.createElement('div'), 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:250;font:700 min(6vw,44px) MedievalSharp,Fredoka,serif;color:#fff;background:rgba(0,0,0,.65);padding:10px 30px;border-radius:18px;pointer-events:none;transition:opacity .8s;text-align:center');
    b.innerHTML = html; document.body.append(b);
    setTimeout(() => { b.style.opacity = '0'; }, 3200); setTimeout(() => b.remove(), 4200);
  }

  // 5. toetsen terugsturen
  const held = new Set();
  const typing = (e) => e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  addEventListener('keydown', (e) => { if (typing(e)) return; held.add(e.code); if (GAME_KEYS.has(e.code)) e.preventDefault(); });
  addEventListener('keyup', (e) => { held.delete(e.code); });
  addEventListener('blur', () => held.clear());
  const down = (b) => KEYS[b].some((c) => held.has(c));
  function readState() {
    const s = { up: down('up'), down: down('down'), left: down('left'), right: down('right'), a: down('a'), b: down('b'), x: 0, y: 0 };
    s.x = (s.right ? 1 : 0) - (s.left ? 1 : 0); s.y = (s.down ? 1 : 0) - (s.up ? 1 : 0);
    const g = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((p) => p && p.connected);   // gamepad mag ook
    if (g) {
      let gx = g.axes[0] || 0, gy = g.axes[1] || 0; if (Math.hypot(gx, gy) < 0.25) { gx = 0; gy = 0; }
      s.x += gx; s.y += gy;
      if (g.buttons[14]?.pressed) { s.left = true; s.x -= 1; } if (g.buttons[15]?.pressed) { s.right = true; s.x += 1; }
      if (g.buttons[12]?.pressed) { s.up = true; s.y -= 1; } if (g.buttons[13]?.pressed) { s.down = true; s.y += 1; }
      if (g.buttons[0]?.pressed || g.buttons[5]?.pressed) s.a = true;
      if (g.buttons[1]?.pressed || g.buttons[2]?.pressed || g.buttons[7]?.pressed) s.b = true;
    }
    const m = Math.hypot(s.x, s.y); if (m > 1) { s.x /= m; s.y /= m; }
    s.x = Math.round(s.x * 100) / 100; s.y = Math.round(s.y * 100) / 100;
    return s;
  }
  function start() {
    if (started) return; started = true;
    let lastSent = '', lastT = 0;
    setInterval(() => {
      if (!alive || !conn.open) return;
      const s = readState(), k = SEND_KEYS.filter((c) => held.has(c));
      const key = JSON.stringify([s, k]); const now = performance.now();
      if (key !== lastSent || now - lastT > 60) { lastSent = key; lastT = now; try { conn.send({ t: 'in', s, k, q: ++seq }); } catch (e) { /* */ } }
    }, 16);
    setInterval(() => { if (!alive) return; try { conn.send({ t: 'ping', ts: performance.now(), rtt }); } catch (e) { /* */ } pingEl.textContent = `🌐 ${Math.round(rtt)} ms`; }, 1500);
  }
  const pingEl = css(document.createElement('div'), 'position:fixed;left:8px;bottom:6px;z-index:90;font:600 13px Fredoka,sans-serif;color:#fff;background:rgba(0,0,0,.5);padding:2px 10px;border-radius:10px;pointer-events:none');
  document.body.append(pingEl);
  // netjes afmelden bij sluiten van het tabblad (de host ziet het dan meteen)
  addEventListener('pagehide', () => { try { if (conn && conn.open && !ended) conn.send({ t: 'bye' }); } catch (e) { /* */ } });
  // klikken (menu's) doorgeven
  addEventListener('pointerdown', (e) => { if (conn && conn.open && me) { const x = (e.clientX - OX) / K, y = (e.clientY - OY) / K; try { conn.send({ t: 'click', x, y }); } catch (er) { /* */ } } });
  // F11-achtig: dubbelklik voor volledig scherm
  addEventListener('dblclick', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); });
}

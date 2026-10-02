import { loadPeerLib, peerOptions, PREFIX } from './common.js';

// GAST (speler 2 / Sem): dunne client. Toont het beeld van de host, stuurt alleen toetsen terug.
const $ = (id) => document.getElementById(id);
const css = (el, s) => { el.style.cssText = s; return el; };

function overlay(html, extra = '') {
  const o = document.createElement('div');
  css(o, 'position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:radial-gradient(ellipse at center,#2a1c4a,#0c0814);color:#fff;font-family:Fredoka,system-ui,sans-serif;text-align:center;padding:20px;' + extra);
  o.innerHTML = html; document.body.append(o); return o;
}
const btnCss = "font:700 26px MedievalSharp,Fredoka,serif;padding:14px 34px;border-radius:16px;border:4px solid #3a2412;background:linear-gradient(180deg,#ffd45a,#e0a020);color:#3a2412;cursor:pointer;box-shadow:0 5px 0 #3a2412";

export async function runGuest() {
  const boot = $('boot'); if (boot) boot.remove();
  $('gl').style.display = 'none';
  const q = new URLSearchParams(location.search);
  let code = (q.get('join') || '').replace(/\D/g, '');
  // 1. code + klik (nodig voor geluid)
  await new Promise((resolve) => {
    const o = overlay(`<div style="font:min(10vw,64px) MedievalSharp,serif;color:#ffcf3a;text-shadow:0 5px 0 #5b3a1e">Heitjes voor Karweitjes</div>
      <div style="font-size:24px">Je doet mee als <b style="color:#4a8cff">Sem</b> (speler 2)</div>
      ${code ? `<div style="font-size:22px">Code: <b>${code}</b></div>` : `<input id="gcode" inputmode="numeric" maxlength="6" placeholder="code van je broer" style="font:700 30px Fredoka,sans-serif;padding:10px 16px;border-radius:12px;border:4px solid #4a8cff;text-align:center;width:min(320px,80vw)">`}
      <button id="gjoin" style="${btnCss}">Meedoen!</button>
      <div style="opacity:.75;max-width:520px;font-size:16px">Gebruik <b>WASD</b> of de <b>pijltjes</b> om te lopen, <b>F / Enter</b> en <b>G / Shift</b> als actieknoppen. Het beeld komt van de computer van je broer.</div>`);
    const go = () => { const inp = o.querySelector('#gcode'); if (inp) code = inp.value.replace(/\D/g, ''); if (code.length < 4) return; o.remove(); resolve(); };
    o.querySelector('#gjoin').onclick = go; const inp = o.querySelector('#gcode'); if (inp) { inp.focus(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); }
  });
  const status = overlay('<div style="font-size:30px">🌐 Verbinden met je broer…</div><div id="gstat" style="opacity:.8;font-size:18px">Even geduld</div>');
  const setStat = (t) => { const e = status.querySelector('#gstat'); if (e) e.textContent = t; };
  try { await loadPeerLib(); } catch (e) { setStat('PeerJS kon niet geladen worden'); return; }
  const { input } = await import('../engine/input.js');

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
  let conn = null, gotVideo = false, rtt = 0, seq = 0, alive = true;
  const fail = (msg) => { alive = false; const o = overlay(`<div style="font-size:30px">😕 ${msg}</div><button style="${btnCss}" id="gre">Opnieuw proberen</button>`); o.querySelector('#gre').onclick = () => location.reload(); };
  peer.on('error', (e) => { if (e.type === 'peer-unavailable') fail('Die code bestaat niet (meer). Vraag je broer om een nieuwe link.'); else if (!conn) fail('Geen verbinding met de server (' + e.type + ')'); });
  peer.on('call', (call) => {
    call.answer();
    call.on('stream', (stream) => { video.srcObject = stream; video.muted = false; video.play().catch(() => { video.muted = true; video.play(); }); if (!gotVideo) { gotVideo = true; status.remove(); } });
    call.on('close', () => { if (alive) fail('De verbinding met je broer is verbroken.'); });
  });
  peer.on('open', () => {
    setStat('Code ' + code + ' zoeken…');
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => { setStat('Verbonden! Beeld wordt opgestart…'); start(); });
    conn.on('data', onData);
    conn.on('close', () => { if (alive) fail('Je broer heeft het spel verlaten.'); });
    setTimeout(() => { if (!conn.open && alive) fail('Je broer is niet gevonden. Staat het spel bij hem open op het "Online" scherm?'); }, 20000);
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
  }

  // 5. toetsen terugsturen
  function start() {
    let lastSent = '', lastT = 0;
    const tick = () => {
      if (!alive) return;
      input.update();
      const a = input.p[0], b = input.p[1];
      const s = { x: Math.max(-1, Math.min(1, a.x + b.x)), y: Math.max(-1, Math.min(1, a.y + b.y)), up: a.up || b.up, down: a.down || b.down, left: a.left || b.left, right: a.right || b.right, a: a.a || b.a, b: a.b || b.b };
      s.x = Math.round(s.x * 100) / 100; s.y = Math.round(s.y * 100) / 100;
      const k = ['Escape', 'Tab', 'KeyP'].filter((c) => input.keys.has(c));
      const key = JSON.stringify([s, k]); const now = performance.now();
      if (key !== lastSent || now - lastT > 60) { lastSent = key; lastT = now; try { conn.send({ t: 'in', s, k, q: ++seq }); } catch (e) { /* */ } }
    };
    setInterval(tick, 16);
    setInterval(() => { try { conn.send({ t: 'ping', ts: performance.now(), rtt }); } catch (e) { /* */ } pingEl.textContent = `🌐 ${Math.round(rtt)} ms`; }, 1500);
  }
  const pingEl = css(document.createElement('div'), 'position:fixed;left:8px;bottom:6px;z-index:90;font:600 13px Fredoka,sans-serif;color:#fff;background:rgba(0,0,0,.5);padding:2px 10px;border-radius:10px;pointer-events:none');
  document.body.append(pingEl);
  // klikken (menu's) doorgeven
  addEventListener('pointerdown', (e) => { if (conn && conn.open) { const x = (e.clientX - OX) / K, y = (e.clientY - OY) / K; try { conn.send({ t: 'click', x, y }); } catch (er) { /* */ } } });
  // F11-achtig: dubbelklik voor volledig scherm
  addEventListener('dblclick', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); });
}

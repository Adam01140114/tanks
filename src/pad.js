/* ---------- Phone controller (opened from the co-op QR code) ---------- */
function runPad(code){
  const cl = (v, a, b) => v < a ? a : v > b ? b : v, rd = v => Math.round(v * 100) / 100;
  document.getElementById('app').hidden = true;
  const pad = document.createElement('div'); pad.id = 'pad';
  pad.innerHTML = `
    <div class="padtop">
      <div><div class="padeyebrow">Tabletop Tanks controller</div><div class="padname"><i class="tico" id="padTank" style="visibility:hidden"></i><span id="padName">Connecting</span></div></div>
      <div class="padinfo" id="padInfo"></div>
    </div>
    <p class="padstatus" id="padStatus">Joining room ${code}…</p>
    <div class="padmain">
      <div class="padzone"><div class="padstick" id="padMove"><div class="padknob" id="padMoveK"></div></div><span class="padlbl">Drive · tap to fire</span></div>
      <div class="padmid"><button class="padmine" id="padMine">Mine</button></div>
      <div class="padzone"><div class="padstick aim" id="padAim"><div class="padknob" id="padAimK"></div></div><span class="padlbl">Drag to aim · let go to fire</span></div>
    </div>`;
  document.body.appendChild(pad);
  const q = s => pad.querySelector(s);
  const st = { mx: 0, my: 0, ax: 0, ay: 0, f: 0, m: 0 };
  let room = null, lastAlive = 1;
  const status = t => { q('#padStatus').textContent = t; };
  const send = () => { if (room) room.presence({ r: 'pad', mx: rd(st.mx), my: rd(st.my), ax: rd(st.ax), ay: rd(st.ay), f: st.f, m: st.m }).catch(() => {}); };
  const wake = () => { try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {} };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  // a stick reports -1..1 on each axis
  const stick = (el, knob, onMove, onEnd) => {
    let id = null, moved = false, t0 = 0, x0 = 0, y0 = 0, far = 0;
    const at = e => {
      const r = el.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      knob.style.transform = `translate(calc(-50% + ${dx * r.width * .34}px), calc(-50% + ${dy * r.height * .34}px))`;
      if (l > .22) moved = true;
      onMove(dx, dy, l);
    };
    el.addEventListener('pointerdown', e => { id = e.pointerId; moved = false; t0 = performance.now(); x0 = e.clientX; y0 = e.clientY; far = 0; el.setPointerCapture(id); el.classList.add('on'); wake(); at(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) { far = Math.max(far, Math.hypot(e.clientX - x0, e.clientY - y0)); at(e); } });
    const end = e => { if (e.pointerId !== id) return; id = null; el.classList.remove('on'); knob.style.transform = ''; onEnd(moved, performance.now() - t0 < 250 && far < 14); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };
  stick(q('#padMove'), q('#padMoveK'), (x, y, l) => { st.mx = l < .18 ? 0 : x; st.my = l < .18 ? 0 : y; send(); }, (moved, tap) => { st.mx = st.my = 0; if (tap) { st.f++; buzz(15); } send(); });
  // aiming keeps the last direction; letting go (or a plain tap) fires along it
  stick(q('#padAim'), q('#padAimK'), (x, y, l) => { if (l > .3) { st.ax = x; st.ay = y; send(); } }, () => { st.f++; send(); buzz(15); });
  q('#padMine').addEventListener('pointerdown', e => { e.preventDefault(); st.m++; q('#padMine').classList.add('on'); send(); buzz(25); });
  const up = () => q('#padMine').classList.remove('on');
  q('#padMine').addEventListener('pointerup', up); q('#padMine').addEventListener('pointercancel', up);
  // stop double-tap and pinch zoom: they blow the controls up and strand the player
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
  document.documentElement.style.touchAction = 'none'; document.body.style.touchAction = 'none';
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastEnd < 350) e.preventDefault(); lastEnd = n; }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  (async () => {
    const api = await getRoomApi();
    if (!api) { q('#padName').textContent = 'Not connected'; status('This phone cannot reach the game server. Check its internet connection, then scan the code again.'); return; }
    try { room = await api.join('tt-' + code); }
    catch (e) { q('#padName').textContent = 'Not connected'; status('Could not join this room. Scan the code on the TV again.'); return; }
    send();
    status('Connected. Looking for the TV…');
    room.onPeers(ch => {
      const me = ch.peers.find(p => p.sameTab), tv = ch.peers.find(p => p.presence && p.presence.r === 'tv');
      if (!tv) { q('#padName').textContent = 'Waiting'; status('Waiting for the TV screen. Keep this page open.'); return; }
      const T = tv.presence, ctl = Array.isArray(T.ctl) ? T.ctl : [], sl = Array.isArray(T.sl) ? T.sl : [];
      let idx = me ? ctl.indexOf(me.peer) : -1;
      const inLobby = T.ph === 'wait';
      if (idx < 0 && inLobby && me) idx = sl.indexOf(me.peer);
      pad.classList.toggle('p1', idx === 0); pad.classList.toggle('p2', idx === 1);
      q('#padTank').style.background = idx === 1 ? '#d8473a' : '#3b6fd8'; q('#padTank').style.visibility = idx < 0 ? 'hidden' : 'visible';
      if (idx < 0) { q('#padName').textContent = 'Waiting'; status(inLobby ? 'Getting you a seat…' : 'Both tanks are taken. You will get a seat if a player drops out.'); q('#padInfo').textContent = ''; return; }
      if (inLobby && sl.filter(Boolean).length === 1) q('#padName').textContent = 'Phone 1 connected';
      else q('#padName').textContent = `Player ${idx + 1} · ${idx ? 'Red' : 'Blue'}`;
      const alive = Array.isArray(T.al) ? (T.al[idx] ? 1 : 0) : 1;
      if (lastAlive && !alive) buzz([60, 40, 120]);
      lastAlive = alive;
      const vs = T.md === 'vs', sc = Array.isArray(T.sc) ? T.sc : [0, 0];
      if (typeof T.mi === 'number' && !inLobby) q('#padInfo').textContent = vs ? `Mission ${T.mi | 0} · You ${sc[idx] | 0} – ${sc[1 - idx] | 0} rival` : `Mission ${T.mi | 0} · Lives ${T.li | 0}`;
      status(inLobby ? 'Waiting on the TV. Press Start there, or scan a second phone.' : T.ph === 'play' ? (alive ? 'Left stick drives, right stick aims. Let go of the aim stick, or tap either stick, to fire.' : (vs ? 'Your tank is out. You come back next mission if your rival clears this one.' : 'Your tank is out. Your partner can still clear the mission.')) : T.ph === 'intro' ? 'Get ready…' : T.ph === 'over' ? (vs ? 'Game over. Check the TV for the winner.' : 'Run over. Check the TV.') : 'Next mission coming up…');
    }, () => status('The connection to the room was lost. Scan the code again.'));
  })();
}

/* ---------- Rooms: the game's own WebSocket relay when hosted, Claude's room capability as a fallback ---------- */
// Only function declarations live here: the phone controller calls them before the rest of the script has run.
// A failed lookup is not remembered, so pressing Co-op again (or a phone rescanning) tries afresh.
function getRoomApi(){
  if (!getRoomApi.p) {
    getRoomApi.p = (async () => {
      if (/^https?:$/.test(location.protocol)) {
        // a server that is still waking up can miss the first knock
        for (let i = 0; i < 3; i++) { if (await wsProbe()) return { kind: 'ws', join: wsJoin }; }
      }
      if (window.claude && typeof window.claude.use === 'function') {
        try { const r = await window.claude.use('room'); if (r) return { kind: 'claude', join: n => r.join(n) }; } catch (e) {}
      }
      return null;
    })();
    getRoomApi.p.then(api => { if (!api) getRoomApi.p = null; });
  }
  return getRoomApi.p;
}
function wsUrl(){ return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
function wsProbe(){
  return new Promise(res => {
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch (e) { res(false); return; }
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} res(false); }, 8000);
    ws.onopen = () => { clearTimeout(t); try { ws.close(); } catch (e) {} res(true); };
    ws.onerror = () => { clearTimeout(t); res(false); };
  });
}
function wsId(){
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789', r = new Uint32Array(16); let s = '';
  crypto.getRandomValues(r); for (const v of r) s += a[v % a.length];
  return s;
}
// Same shape as a named room from the room capability: presence, peers, onPeers, leave.
// Presence is sent whole (absolute state) at most ~30 times a second.
function wsJoin(name){
  return new Promise((resolve, reject) => {
    const me = wsId();
    let ws = null, peers = Object.freeze([]), mine = {}, closed = false, resolved = false, tries = 0, sendT = null, dirty = false;
    let handlers = [], errs = [];
    const room = {
      name,
      presence(patch){
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        dirty = true; flush(); return Promise.resolve();
      },
      peers(){ return peers; },
      onPeers(fn, onErr){
        handlers.push(fn); if (onErr) errs.push(onErr);
        if (peers.length) setTimeout(() => fn({ peers, joined: peers, left: [], updated: [] }), 0);
        return () => { handlers = handlers.filter(h => h !== fn); };
      },
      connected(){ return !!ws && ws.readyState === 1; },
      leave(){ closed = true; clearTimeout(sendT); try { ws && ws.close(); } catch (e) {} return Promise.resolve(); },
    };
    function flush(){
      if (sendT) return;
      sendT = setTimeout(() => {
        sendT = null;
        if (dirty && ws && ws.readyState === 1) { dirty = false; ws.send(JSON.stringify({ t: 'p', p: mine })); }
      }, 33);
    }
    function connect(){
      ws = new WebSocket(wsUrl());
      ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ t: 'join', room: name, id: me, p: mine })); };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (er) { return; }
        if (m.t === 'hello') { if (!resolved) { resolved = true; resolve(room); } if (dirty) flush(); }
        else if (m.t === 'peers' && Array.isArray(m.list)) {
          peers = Object.freeze(m.list.map(x => Object.freeze({ peer: String(x.id), presence: x.p && typeof x.p === 'object' ? x.p : {}, sameTab: x.id === me, isMe: x.id === me, kind: 'viewer', guest: false, by: null })));
          const ch = { peers, joined: [], left: [], updated: [] };
          for (const h of handlers.slice()) { try { h(ch); } catch (er) { console.error(er); } }
        }
      };
      ws.onclose = () => {
        if (closed) return;
        if (!resolved) { resolved = true; reject(new Error('upstream_error')); return; }
        // brief drops (phone screen off, wifi hiccup): reconnect with the same id so the seat is kept
        if (++tries > 10) { for (const f of errs) f({ code: 'upstream_error', message: 'The connection to the game server was lost.' }); return; }
        setTimeout(connect, Math.min(4000, 400 * tries));
      };
    }
    connect();
  });
}

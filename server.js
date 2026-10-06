// Tabletop Tanks server: serves the game and relays co-op rooms over WebSocket.
// Each room holds the TV screen and up to two phone controllers. Every client keeps one
// small "presence" object (stick positions, seats, HUD); the server shares everyone's
// presence with everyone in the room whenever something changes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');
const MAX_PRESENCE = 4096, MAX_PEERS = 8, ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/, ID_RE = /^[a-z0-9]{8,32}$/;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/' || url === '/index.html') {
    fs.readFile(INDEX, (err, body) => {
      if (err) { res.writeHead(500); res.end('index.html is missing'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(body);
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
});

// room name -> Map(id -> { ws, p })
const rooms = new Map();
const dirty = new Set();
function list(room){ return [...room.values()].map(m => ({ id: m.id, p: m.p })); }
function flush(){
  for (const name of dirty) {
    const room = rooms.get(name); if (!room) continue;
    const msg = JSON.stringify({ t: 'peers', list: list(room) });
    for (const m of room.values()) if (m.ws.readyState === 1) m.ws.send(msg);
  }
  dirty.clear();
}
setInterval(flush, 33);

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  let roomName = null, id = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join' && !roomName) {
      if (typeof m.room !== 'string' || !ROOM_RE.test(m.room) || typeof m.id !== 'string' || !ID_RE.test(m.id)) { ws.close(1008, 'bad join'); return; }
      let room = rooms.get(m.room);
      if (!room) { room = new Map(); rooms.set(m.room, room); }
      const old = room.get(m.id);
      // a reconnect with the same id replaces the stale socket and keeps the seat
      if (old && old.ws !== ws) { old.replaced = true; try { old.ws.close(); } catch (e) {} }
      else if (room.size >= MAX_PEERS) { ws.close(1013, 'room full'); return; }
      roomName = m.room; id = m.id;
      room.set(id, { id, ws, p: safePresence(m.p) });
      ws.send(JSON.stringify({ t: 'hello', id }));
      dirty.add(roomName);
    } else if (m.t === 'p' && roomName) {
      const me = rooms.get(roomName)?.get(id);
      if (me && me.ws === ws) { me.p = safePresence(m.p); dirty.add(roomName); }
    }
  });
  ws.on('close', () => {
    if (!roomName) return;
    const room = rooms.get(roomName); if (!room) return;
    const me = room.get(id);
    if (me && me.ws === ws) room.delete(id);
    if (room.size === 0) rooms.delete(roomName); else dirty.add(roomName);
  });
});
function safePresence(p){
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  try { return JSON.stringify(p).length <= MAX_PRESENCE ? p : {}; } catch (e) { return {}; }
}
// drop sockets that stopped answering (phones that locked or lost signal)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  }
}, 20000);

server.listen(PORT, () => console.log(`Tabletop Tanks on http://localhost:${PORT}`));

/* ---------- Couch co-op: this screen is the TV, phones are the controllers ---------- */
let coop = null; // { code, room, slots: [peer|null, peer|null], ctrl: ['kb'|peer|null, peer|null], hudT, wasAlive }
const newPad = () => ({ mx: 0, my: 0, ax: 0, ay: 0, f: null, m: null, fire: false, mine: false });
const padIn = [newPad(), newPad()];
const isNum = v => typeof v === 'number' && isFinite(v);
function makeCode(){
  const a = 'abcdefghjkmnpqrstuvwxyz23456789', r = new Uint32Array(6); let s = '';
  crypto.getRandomValues(r); for (const v of r) s += a[v % a.length];
  return s;
}
// player 2 starts a couple of cells from player 1, on open floor
function coopSpawn(m){
  const [pc, pr] = [Math.round(m.p[0]), Math.round(m.p[1])];
  const free = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && m.g[r * COLS + c] === '.' && !m.e.some(([, ec, er]) => Math.abs(ec - c) < 1.5 && Math.abs(er - r) < 1.5);
  const toward = pr > ROWS / 2 ? -1 : 1;
  const tries = [[0, 2 * toward], [0, -2 * toward], [2, 0], [-2, 0], [1, 2 * toward], [-1, 2 * toward], [2, 2], [-2, -2], [2, -2], [-2, 2], [0, 3 * toward], [3, 0], [-3, 0], [0, 1 * toward], [1, 0], [-1, 0]];
  for (const [dc, dr] of tries) if (free(pc + dc, pr + dr)) return [pc + dc, pr + dr];
  return [m.p[0], m.p[1]];
}
const lob = () => ({ sub: $('#lSub'), room: $('#lRoom'), qr: $('#qr'), link: $('#lLink'), seats: $('#lSeats'), start: $('#lStart'), note: $('#lNote') });
function lobbyMsg(t){ $('#lSub').textContent = t; }
async function openCoop(){
  audioInit(); sfx('ui');
  leaveCoop();
  $('#title').hidden = true; $('#lobby').hidden = false; $('#lRoom').hidden = true;
  lobbyMsg('Connecting to the game server…');
  const api = await getRoomApi();
  if ($('#lobby').hidden) return;
  if (!api) { lobbyMsg('Could not reach the game server. Press Back, then Co-op to try again. If you opened a saved copy of the game, open it from its web address instead.'); return; }
  const code = makeCode();
  let room;
  try { room = await api.join('tt-' + code); }
  catch (e) { lobbyMsg('The room could not be opened. Go back and try again in a moment.'); return; }
  if ($('#lobby').hidden) { room.leave().catch(() => {}); return; }
  coop = { code, room, base: api.kind === 'ws' ? location.origin + location.pathname : ARTIFACT_URL, slots: [null, null], ctrl: [null, null], hudT: 0, wasAlive: [true, true] };
  room.presence({ r: 'tv', sl: [null, null], ctl: [null, null], ph: 'wait' }).catch(() => {});
  room.onPeers(onCoopPeers, () => { if (!$('#lobby').hidden) lobbyMsg('The connection to the room was lost. Go back and open a new room.'); });
  showLobby();
}
function showLobby(){
  const L = lob();
  $('#lobby').hidden = false; L.room.hidden = false;
  lobbyMsg('Scan the code with one or two phones. Each phone becomes a tank controller, and this screen shows the battle. Put it on the TV.');
  const link = coop.base + '#pad-' + coop.code;
  L.link.textContent = link;
  L.qr.innerHTML = '';
  let ok = false;
  if (window.QRCode) { try { new QRCode(L.qr, { text: link, width: 320, height: 320, colorDark: '#2b2118', colorLight: '#fff8ec', correctLevel: QRCode.CorrectLevel.M }); ok = true; } catch (e) {} }
  L.qr.parentElement.hidden = !ok;
  renderSeats();
}
function renderSeats(){
  if (!coop) return;
  const L = lob(), n = coop.slots.filter(Boolean).length;
  L.seats.textContent = '';
  const rows = n === 1
    ? [[0, 'Player 1 · Blue', 'Keyboard and mouse on this computer', true], [1, 'Player 2 · Red', 'Phone connected', true]]
    : [0, 1].map(i => [i, i ? 'Player 2 · Red' : 'Player 1 · Blue', coop.slots[i] ? 'Phone connected' : 'Waiting for a phone', !!coop.slots[i]]);
  for (const [i, who, st, ok] of rows) {
    const li = document.createElement('li'), a = document.createElement('span'), dot = document.createElement('i'), b = document.createElement('span');
    dot.className = 'tico'; dot.style.background = TIERS[i ? 10 : 0].col; a.append(dot, who);
    b.className = ok ? 'ok' : 'wait'; b.textContent = st;
    li.append(a, b); L.seats.appendChild(li);
  }
  L.start.disabled = n === 0;
  L.start.textContent = n === 2 ? 'Start' : n === 1 ? 'Start with one phone' : 'Start';
  L.note.textContent = n === 1 ? 'With one phone, player 1 drives with the keyboard and mouse. Scan with a second phone to put both players on phones.' : 'Phones need internet access. They do not need to be on the same Wi-Fi as this screen.';
}
function pushTv(extra){
  if (!coop) return;
  const ph = G.state === 'play' ? 'play' : G.state === 'intro' ? 'intro' : G.state === 'results' ? 'over' : $('#lobby').hidden ? 'between' : 'wait';
  coop.room.presence(Object.assign({ sl: coop.slots.slice(), ctl: coop.ctrl.slice(), ph, mi: G.mission, li: G.lives, al: [player ? (player.alive ? 1 : 0) : 1, player2 ? (player2.alive ? 1 : 0) : 1] }, extra || {})).catch(() => {});
}
function onCoopPeers(ch){
  if (!coop) return;
  const pads = ch.peers.filter(p => !p.sameTab && p.presence && p.presence.r === 'pad');
  const has = id => pads.some(p => p.peer === id);
  for (let i = 0; i < 2; i++) if (coop.slots[i] && !has(coop.slots[i])) coop.slots[i] = null;
  for (const p of pads) if (!coop.slots.includes(p.peer)) { const i = coop.slots.indexOf(null); if (i >= 0) coop.slots[i] = p.peer; }
  // during a run: free the seat of a phone that left, and hand an empty seat to a phone that (re)joins
  if (G.coop && $('#lobby').hidden) {
    for (let i = 0; i < 2; i++) if (coop.ctrl[i] && coop.ctrl[i] !== 'kb' && !has(coop.ctrl[i])) { coop.ctrl[i] = null; padIn[i] = newPad(); toastMsg(`Player ${i + 1}'s phone disconnected. Scan the code again to rejoin.`); }
    for (const p of pads) if (!coop.ctrl.includes(p.peer)) { const i = coop.ctrl.indexOf(null); if (i >= 0) { coop.ctrl[i] = p.peer; padIn[i] = newPad(); toastMsg(`Player ${i + 1} is back.`); } }
  }
  pushTv();
  if (!$('#lobby').hidden) {
    renderSeats();
    if (coop.slots[0] && coop.slots[1]) coopGo();
  }
}
function coopGo(){
  if (!coop) return;
  const pads = coop.slots.filter(Boolean);
  if (!pads.length) return;
  coop.ctrl = pads.length === 2 ? [coop.slots[0], coop.slots[1]] : ['kb', pads[0]];
  padIn[0] = newPad(); padIn[1] = newPad();
  coop.wasAlive = [true, true];
  startRun(1, false, true);
  pushTv();
}
function coopRestart(){ coopGo(); }
function leaveCoop(){
  if (!coop) return;
  try { coop.room.leave().catch(() => {}); } catch (e) {}
  coop = null;
}
function readPads(){
  if (!coop) return;
  const peers = coop.room.peers();
  for (let i = 0; i < 2; i++) {
    const id = coop.ctrl[i]; if (!id || id === 'kb') continue;
    const pr = peers.find(p => p.peer === id), s = (pr && pr.presence) || {}, P = padIn[i];
    const c1 = v => isNum(v) ? clamp(v, -1, 1) : 0;
    P.mx = c1(s.mx); P.my = c1(s.my); P.ax = c1(s.ax); P.ay = c1(s.ay);
    // fire and mine are counters on the phone; a change means one press
    if (isNum(s.f)) { if (P.f !== null && s.f !== P.f) P.fire = true; P.f = s.f; }
    if (isNum(s.m)) { if (P.m !== null && s.m !== P.m) P.mine = true; P.m = s.m; }
  }
}
function coopBuzz(){ pushTv(); }
function coopTick(dt){
  if (!coop) return;
  coop.hudT -= dt;
  if (coop.hudT <= 0) { coop.hudT = .3; pushTv(); }
}
let toastT = null;
function toastMsg(t){
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200);
}
$('#tCoop').addEventListener('click', openCoop);
$('#lBack').addEventListener('click', () => { sfx('ui'); $('#lobby').hidden = true; leaveCoop(); toTitle(); });
$('#lStart').addEventListener('click', () => { sfx('ui'); coopGo(); });
$('#lCopy').addEventListener('click', () => {
  const el = $('#lLink'), t = el.textContent;
  const sel = () => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  try { navigator.clipboard.writeText(t).then(() => { $('#lCopy').textContent = 'Copied'; setTimeout(() => $('#lCopy').textContent = 'Copy link', 1500); }, sel); } catch (e) { sel(); }
});

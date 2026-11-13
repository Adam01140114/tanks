/* ---------- Game controllers: Nintendo Switch Pro Controller (and any standard gamepad) ----------
 * Chrome and Edge report the Pro Controller with the "standard" layout, buttons by position:
 *   0 bottom (B on Switch)  1 right (A)  2 left (Y)  3 top (X)
 *   4 L  5 R  6 ZL  7 ZR  8 −  9 +  10/11 stick clicks  12–15 d-pad  16 Home
 *   axes 0/1 left stick, 2/3 right stick
 * Xbox and PlayStation pads use the same positions, so they work too; only confirm/back swap sides.
 *
 * In a game:  left stick or d-pad drives, right stick aims, ZR / R / A fire, ZL / L / B lay a mine, + pauses.
 * In menus:   stick or d-pad moves, A picks, B goes back, + also picks (and resumes from pause).
 * Seats:      a controller that holds no co-op seat drives player 1 alongside the keyboard and mouse.
 *             In the co-op lobby, pressing A on a controller takes a seat, like a phone scanning the code.
 */
const GP_DEAD = .2;
const gpIn = {};   // by gamepad index: { mx, my, ax, ay, aiming, fire, mine }
const gpPrev = {}; // each pad's buttons last frame, to catch fresh presses
const isGpSeat = id => typeof id === 'string' && id.startsWith('gp:');
const gpSeatIndex = id => +id.slice(3);
const isNintendo = pad => /057e|nintendo|pro controller|joy-?con/i.test(pad.id);
// Nintendo puts A (confirm) on the right and B (back) at the bottom; Xbox and PlayStation are the other way round
const gpConfirm = pad => isNintendo(pad) ? 1 : 0;
const gpBack = pad => isNintendo(pad) ? 0 : 1;
const gpName = pad => isNintendo(pad) ? 'Pro Controller' : 'Controller';
const gpPads = () => navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : [];

// radial dead zone, rescaled so the stick still reaches full speed
function gpStick(x, y){
  const n = Math.hypot(x, y);
  if (n < GP_DEAD) return [0, 0, 0];
  const m = Math.min(1, (n - GP_DEAD) / (1 - GP_DEAD));
  return [x / n * m, y / n * m, m];
}

/* which co-op seat a controller holds, or -1 (lobby seats before the run, control seats during it) */
function gpSeatOf(idx){
  if (!coop) return -1;
  const list = G.coop && $('#lobby').hidden ? coop.ctrl : coop.slots;
  return list.indexOf('gp:' + idx);
}
// controllers without a seat help drive player 1 whenever player 1 is on the keyboard
const gpFreeIdx = () => gpPads().map(p => p.index).filter(i => gpSeatOf(i) < 0);

/* the tank side: steer, aim and shoot from one controller's state; returns the drive vector */
function gpDrive(p, g, seat){
  if (g.aiming) p.ta = Math.atan2(g.ax, g.ay);
  if (g.fire) { g.fire = false; if (fire(p)) gpRumbleSeat(seat, false); }
  if (g.mine) { g.mine = false; layMine(p); }
  return [g.mx, g.my];
}

/* rumble, where the browser and controller support it (Chrome does for the Pro Controller) */
function gpRumble(idx, strong){
  const pad = gpPads().find(p => p.index === idx), a = pad && pad.vibrationActuator;
  if (!a || !a.playEffect) return;
  a.playEffect('dual-rumble', strong
    ? { duration: 420, strongMagnitude: 1, weakMagnitude: .7 }
    : { duration: 60, strongMagnitude: 0, weakMagnitude: .45 }).catch(() => {});
}
function gpRumbleSeat(i, strong){
  const seat = G.coop && coop ? coop.ctrl[i] : null;
  if (isGpSeat(seat)) gpRumble(gpSeatIndex(seat), strong);
  else if (usesKeyboard(i) && inp.padAim) for (const k of gpFreeIdx()) gpRumble(k, strong);
}

/* ---------- menus ---------- */
const GP_MENUS = ['#paused', '#select', '#results', '#lobby', '#title'];
const GP_BACK = { '#paused': '#pResume', '#select': '#sClose', '#results': '#rMenu', '#lobby': '#lBack' };
function gpMenu(){
  for (const id of GP_MENUS) { const el = $(id); if (!el.hidden && el.offsetParent !== null) return id; }
  return null;
}
const gpButtons = menu => [...$(menu).querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
// the highlighted button carries .gpsel, so it shows even when the browser window isn't focused
const gpSel = () => document.querySelector('.gpsel');
function gpFocus(b){
  if (!b) return;
  const old = gpSel(); if (old && old !== b) old.classList.remove('gpsel');
  b.classList.add('gpsel');
  b.focus({ preventScroll: true });
  b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
// land on the main action: the red button if there is one, otherwise the first
function gpFocusDefault(menu){
  const list = gpButtons(menu);
  gpFocus(list.find(b => b.classList.contains('red')) || list[0]);
}
// move to the nearest button in that direction, or wrap around the list
function gpMove(menu, dx, dy){
  const list = gpButtons(menu); if (!list.length) return;
  const cur = list.includes(gpSel()) ? gpSel() : null;
  if (!cur) return gpFocusDefault(menu);
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, score = Infinity;
  for (const b of list) {
    if (b === cur) continue;
    const q = b.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
    const along = dx ? x * dx : y * dy;
    if (along <= 4) continue;
    const s = along + (dx ? Math.abs(y) : Math.abs(x)) * 2.5;
    if (s < score) { score = s; best = b; }
  }
  if (!best) { const i = list.indexOf(cur), step = dx || dy; best = list[(i + step + list.length) % list.length]; }
  if (best !== cur) { gpFocus(best); sfx('ui', .35); }
}
function gpPress(menu, pad){
  if (menu === '#lobby' && gpJoin(pad)) return;
  const cur = gpSel();
  if (gpButtons(menu).includes(cur)) cur.click(); else gpFocusDefault(menu);
}

/* ---------- co-op lobby: a controller takes a seat ---------- */
function gpJoin(pad){
  if (!coop || $('#lRoom').hidden) return false;
  const id = 'gp:' + pad.index;
  if (coop.slots.includes(id)) return false;
  const k = coop.slots.indexOf(null);
  if (k < 0) { toastMsg('Both seats are taken.'); return true; }
  coop.slots[k] = id;
  sfx('ui'); renderSeats(); pushTv();
  // both seats filled starts the game, the same as when a second phone joins
  if (coop.slots[0] && coop.slots[1]) coopGo(); else gpFocusDefault('#lobby');
  return true;
}
function gpLeaveSeats(idx){
  if (!coop) return;
  const id = 'gp:' + idx;
  const k = coop.slots.indexOf(id);
  if (k >= 0 && !$('#lobby').hidden) { coop.slots[k] = null; renderSeats(); pushTv(); }
  const c = coop.ctrl.indexOf(id);
  if (c >= 0 && G.coop && $('#lobby').hidden) toastMsg(`Player ${c + 1}'s controller disconnected. Reconnect it to keep playing.`);
}

/* ---------- every frame ---------- */
const gpNav = { dir: '', t: 0, menu: null };
function pollGamepads(dt){
  const pads = gpPads();
  if (!pads.length) return;
  const menu = gpMenu();
  if (menu !== gpNav.menu) { gpNav.menu = menu; if (menu && document.body.classList.contains('gp')) gpFocusDefault(menu); }
  let dir = '';
  for (const pad of pads) {
    const i = pad.index, b = pad.buttons.map(x => x.pressed), prev = gpPrev[i] || [];
    const down = k => !!b[k] && !prev[k];
    gpPrev[i] = b;
    const ax = pad.axes;
    let [mx, my] = gpStick(ax[0] || 0, ax[1] || 0);
    if (b[12]) my -= 1; if (b[13]) my += 1; if (b[14]) mx -= 1; if (b[15]) mx += 1;
    const [rx, ry, rn] = gpStick(ax[2] || 0, ax[3] || 0);
    const g = gpIn[i] || (gpIn[i] = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, mine: false });
    g.mx = mx; g.my = my; g.ax = rx; g.ay = ry; g.aiming = rn > .3;
    const used = b.some(Boolean) || mx || my || rn;
    if (used) document.body.classList.add('gp');
    const conf = gpConfirm(pad), back = gpBack(pad);
    if (menu) {
      if (Math.abs(mx) > .5 || Math.abs(my) > .5) dir = dir || (Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'r' : 'l') : (my > 0 ? 'd' : 'u'));
      if (menu === '#paused' && down(9)) { setPause(false); continue; }
      if (down(conf) || down(9)) { audioInit(); gpPress(menu, pad); }
      else if (down(back)) { const el = GP_BACK[menu] && $(GP_BACK[menu]); if (el && !el.disabled) el.click(); }
      continue;
    }
    if (down(9) && playing()) { setPause(true); continue; }
    if (G.state === 'play' && !G.paused) {
      if (down(7) || down(5) || down(conf)) g.fire = true;
      if (down(6) || down(4) || down(back)) g.mine = true;
    }
    // a free controller aiming or shooting takes the sight over from the mouse
    if (used && gpSeatOf(i) < 0) inp.padAim = true;
  }
  if (menu && dir) {
    const step = () => gpMove(menu, dir === 'r' ? 1 : dir === 'l' ? -1 : 0, dir === 'd' ? 1 : dir === 'u' ? -1 : 0);
    if (dir !== gpNav.dir) { gpNav.dir = dir; gpNav.t = .38; step(); }
    else if ((gpNav.t -= dt) <= 0) { gpNav.t = .13; step(); }
  } else gpNav.dir = '';
}

addEventListener('gamepadconnected', e => { toastMsg(`${gpName(e.gamepad)} connected`); });
addEventListener('gamepaddisconnected', e => {
  const i = e.gamepad.index;
  delete gpIn[i]; delete gpPrev[i];
  gpLeaveSeats(i);
});
// the mouse takes over again as soon as it moves
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) { document.body.classList.remove('gp'); inp.padAim = false; } });

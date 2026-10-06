/* ---------- run state ---------- */
const MEDALS = [null, { n: 'Bronze', col: '#c98a4b', at: 5 }, { n: 'Silver', col: '#c9d0d6', at: 10 }, { n: 'Gold', col: '#f2b632', at: 20 }, { n: 'Platinum', col: '#bfe9f2', at: 30 }];
const medalFor = n => n >= 30 ? 4 : n >= 20 ? 3 : n >= 10 ? 2 : n >= 5 ? 1 : 0;
const G = { duel: false, round: 1, wins: [0, 0], vs: false, score: [new Array(10).fill(0), new Array(10).fill(0)], state: 'title', mission: 1, lives: 3, kills: new Array(10).fill(0), killed: new Set(), practice: false, timer: 0, cleared: 0, paused: false, start: 1, medalShown: 0 };

function enemiesAlive(){ return tanks.filter(t => t.alive && t.team === 1); }
function hudUpdate(){
  $('#hMission').textContent = G.duel ? 'Round ' + G.round : 'Mission ' + G.mission;
  $('#hLives').textContent = G.lives;
  const two = G.vs || G.duel;
  $('#hLivesBox').hidden = two; $('#hScore').hidden = !two;
  if (two) { const [a, b] = pairScore(); $('#hS1').textContent = a; $('#hS2').textContent = b; }
  const box = $('#hEnemies'); box.textContent = '';
  for (const t of tanks) if (t.team === 1) {
    const i = document.createElement('i'); i.className = 'tico'; i.style.background = t.def.col;
    if (!t.alive) i.style.opacity = .25;
    box.appendChild(i);
  }
  const counts = new Array(10).fill(0); for (const t of enemiesAlive()) counts[t.tier]++;
  if (G.duel) for (const k of [1, 4, 5, 6]) counts[k] = 1; // no enemies on the board, so give the band a fixed line-up
  musicLayers(counts);
}
function banner(html, cls){
  const b = $('#banner');
  if (!html) { b.hidden = true; b.textContent = ''; return; }
  b.innerHTML = '<div class="ribbon ' + (cls || '') + '">' + html + '</div>'; b.hidden = false;
}
const livesHTML = n => '<span class="lv"><i class="tico" style="background:' + TIERS[0].col + '"></i>× ' + n + '</span>';

function loadMission(n, retry){
  G.mission = n;
  const m = MISSIONS[n - 1];
  clearEntities(); clearTreads();
  if (!retry) { clearDecals(); G.killed.clear(); }
  buildArena(m);
  player = spawnTank(0, cellX(m.p[0]), cellZ(m.p[1]), 0, -1);
  if (G.coop) { const [c2, r2] = coopSpawn(m); player2 = spawnTank(10, cellX(c2), cellZ(r2), 0, -2); }
  m.e.forEach(([tier, c, r], i) => { if (!G.killed.has(i)) spawnTank(tier, cellX(c), cellZ(r), 1, i); });
  for (const t of tanks) {
    if (t.team === 0) { t.a = t.ta = Math.atan2(-t.x, -t.z * .2); continue; }
    t.a = t.ta = t.ai.aimA = Math.atan2(player.x - t.x, player.z - t.z);
    if (t.def.spd) t.a = Math.round(t.a / (Math.PI / 2)) * (Math.PI / 2);
  }
  tanks.forEach(syncTank);
  hudUpdate();
  G.state = 'intro'; G.timer = 3;
  musicStop(.2);
  const left = enemiesAlive().length;
  banner('<h2>Mission ' + n + '</h2><p>Enemy tanks: ' + left + '</p>' + (G.vs ? scoreHTML() : livesHTML(G.lives)));
  jingle('start');
}
const vsTotal = i => G.score[i].reduce((a, b) => a + b, 0);
const pairScore = () => G.duel ? G.wins : [vsTotal(0), vsTotal(1)];
const scoreHTML = () => '<span class="lv"><i class="tico" style="background:' + TIERS[0].col + '"></i>' + pairScore()[0] + '<span style="opacity:.6">–</span>' + pairScore()[1] + '<i class="tico" style="background:' + TIERS[10].col + '"></i></span>';
function onTankKilled(t, by){
  if (t.team === 1) {
    G.killed.add(t.idx);
    G.kills[t.tier]++;
    // versus: a point to whichever player fired the shell or laid the mine
    if (G.vs && by && by.team === 0) G.score[by === player ? 0 : 1][t.tier]++;
    jingle('kill');
    hudUpdate();
  } else if (G.duel) {
    // rounds are settled in update()
  } else if ((G.state === 'play' || G.state === 'clearing') && !livePlayers().length) {
    // co-op: the mission only fails once both tanks are gone
    G.state = 'dying'; G.timer = 1.6;
  } else if (G.coop) coopBuzz(t === player ? 0 : 1);
}
function beginPlay(){
  G.state = 'play'; banner(null);
  for (const t of tanks) if (t.alive && t.def.invisible) vanish(t);
  musicStart();
}
function nextMission(){
  // the 2-player game on the Wii stops after mission 20 and crowns whoever scored more
  if (G.vs) { if (G.mission >= 20) return endRun(true); return loadMission(G.mission + 1); }
  if (!G.practice) save.reached = Math.max(save.reached, G.mission + 1);
  const won20 = G.mission === 20 && !save.unlocked && !G.practice;
  if (won20) { save.unlocked = true; persist(); return endRun(true, 'Missions 21–100 are now unlocked.'); }
  if (G.mission >= MISSIONS.length || (G.mission >= 20 && !save.unlocked)) return endRun(true);
  persist();
  loadMission(G.mission + 1);
}
function tallyTotal(){ return G.kills.reduce((a, b) => a + b, 0); }
function endRun(victory, note){
  G.state = 'results'; musicStop(.3); banner(null);
  $('#hud').hidden = true;
  const total = tallyTotal(), medal = G.practice || G.vs || G.start !== 1 ? 0 : medalFor(G.cleared);
  let best = false;
  if (!G.practice && !G.coop && G.start === 1) {
    if (G.cleared > save.best || (G.cleared === save.best && total > save.bestTotal)) { best = true; save.best = G.cleared; save.bestTotal = total; }
    save.medal = Math.max(save.medal, medal);
    persist();
  }
  const [a, b] = pairScore();
  $('#rTitle').textContent = G.duel ? (a > b ? 'Blue wins the duel!' : 'Red wins the duel!') : G.vs ? (a > b ? 'Blue wins!' : b > a ? 'Red wins!' : "It's a tie!") : victory ? 'Victory!' : 'Game over';
  $('#rSub').textContent = G.duel ? 'Duel · first to ' + DUEL_WINS + ' rounds · ' + (G.round) + ' rounds played' : (G.vs ? 'Versus · ' + (victory ? 'All 20 missions cleared' : 'Both tanks went down') + ' · ' : G.coop ? 'Co-op · ' : '') + (G.practice ? 'Practice run · ' : '') + 'Missions cleared: ' + G.cleared + (best ? ' · New best!' : '') + (note ? ' · ' + note : '');
  const tl = $('#rTally'); tl.textContent = '';
  for (let i = 1; i < 10; i++) {
    const row = document.createElement('div');
    row.innerHTML = '<i class="tico" style="background:' + TIERS[i].col + '"></i><span>' + TIERS[i].n + '</span><b>' + (G.vs ? vsPair(G.score[0][i], G.score[1][i]) : G.kills[i]) + '</b>';
    if (!G.kills[i]) row.style.opacity = .4;
    tl.appendChild(row);
  }
  if (G.duel) tl.textContent = '';
  $('#rTotalLbl').textContent = G.duel ? 'Rounds won' : 'Total';
  if (G.vs || G.duel) $('#rTotal').innerHTML = vsPair(a, b); else $('#rTotal').textContent = total;
  const md = MEDALS[medal];
  $('#rMedal').innerHTML = md ? '<span class="medal" style="background:' + md.col + '">' + md.n.slice(0, 4) + '</span>' : '';
  $('#results').hidden = false;
  jingle(victory ? 'medal' : 'over');
}
const vsPair = (a, b) => '<span style="color:#2f5fb8">' + a + '</span> – <span style="color:#c8382f">' + b + '</span>';
function startRun(n, practice, coopOn, vsOn, duelOn){
  audioInit();
  Object.assign(G, { duel: !!duelOn, round: 1, wins: [0, 0], vs: !!vsOn, score: [new Array(10).fill(0), new Array(10).fill(0)], lives: 3, kills: new Array(10).fill(0), practice, coop: !!coopOn, cleared: 0, start: n, paused: false, medalShown: 0 });
  for (const id of ['#title', '#results', '#select', '#paused', '#lobby']) $(id).hidden = true;
  $('#hud').hidden = false;
  if (G.duel) loadDuel(); else loadMission(n);
}

/* ---------- Duel: two tanks, no enemies, first to five rounds ---------- */
const DUEL_WINS = 5;
// campaign arenas with good cover on both sides, played in turn
const DUEL_MAPS = [9, 2, 14, 12, 6, 18, 31, 44, 27, 15];
function freeNear(m, c, r){
  for (let d = 0; d < 7; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
    if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
    const cc = c + dc, rr = r + dr;
    if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS && m.g[rr * COLS + cc] === '.') return [cc, rr];
  }
  return [c, r];
}
function loadDuel(){
  const m = MISSIONS[DUEL_MAPS[(G.round - 1) % DUEL_MAPS.length]];
  clearEntities(); clearTreads(); clearDecals(); G.killed.clear();
  buildArena(m);
  // blue starts at the mission's player spot, red at the mirror-image spot across the board
  const [c1, r1] = freeNear(m, Math.round(m.p[0]), Math.round(m.p[1]));
  const [c2, r2] = freeNear(m, COLS - 1 - c1, ROWS - 1 - r1);
  player = spawnTank(0, cellX(c1), cellZ(r1), 0, -1);
  player2 = spawnTank(10, cellX(c2), cellZ(r2), 2, -2);
  player.a = player.ta = Math.atan2(player2.x - player.x, player2.z - player.z);
  player2.a = player2.ta = wrapA(player.ta + Math.PI);
  tanks.forEach(syncTank);
  hudUpdate();
  G.state = 'intro'; G.timer = 2.6;
  musicStop(.2);
  banner('<h2>Round ' + G.round + '</h2><p>First to ' + DUEL_WINS + ' wins</p>' + scoreHTML());
  jingle('start');
}
function toTitle(){
  for (const id of ['#results', '#select', '#paused', '#hud', '#lobby']) $(id).hidden = true;
  banner(null); musicStop(.2); leaveCoop();
  G.state = 'title'; G.paused = false; G.coop = false; G.vs = false; G.duel = false;
  showTitle();
}
function showTitle(){
  $('#title').hidden = false;
  clearEntities(); clearTreads(); clearDecals();
  const m = MISSIONS[(Math.random() * 20) | 0];
  buildArena(m);
  m.e.forEach(([tier, c, r]) => { const t = spawnTank(tier, cellX(c), cellZ(r), 1, 0); t.a = Math.random() * 6.28; t.ta = t.a; });
  const p = spawnTank(0, cellX(m.p[0]), cellZ(m.p[1]), 0, -1); p.ta = 0;
  tanks.forEach(syncTank);
  const md = $('#tMedals'); md.textContent = '';
  for (let i = 1; i <= 4; i++) {
    const e = document.createElement('span'); e.className = 'medal'; e.textContent = MEDALS[i].at;
    e.title = MEDALS[i].n + ': clear mission ' + MEDALS[i].at;
    e.style.background = i <= save.medal ? MEDALS[i].col : 'rgba(255,248,236,.25)';
    if (i > save.medal) e.style.color = 'rgba(255,248,236,.7)';
    md.appendChild(e);
  }
  $('#tBest').textContent = save.best ? 'Best run: ' + save.best + ' missions · ' + save.bestTotal + ' tanks' + (save.unlocked ? ' · Missions 21–100 unlocked' : '') : 'Clear mission 20 to unlock all 100 missions';
  $('#tSound').textContent = save.sound ? 'Sound on' : 'Sound off';
}

/* ---------- state machine ---------- */
function update(dt){
  const S = G.state;
  if (S === 'title') {
    for (const t of tanks) { t.ta += Math.sin(performance.now() / 1300 + t.x) * dt * .6; syncTank(t); }
    return;
  }
  if (S === 'results') return;
  G.timer -= dt;
  if (S === 'intro') { if (G.timer <= 0) beginPlay(); return; }
  if (S === 'play' || S === 'dying' || S === 'clearing' || S === 'roundend') {
    if (S === 'play') { if (G.coop) readPads(); updatePlayer(player, 0, dt); if (player2) updatePlayer(player2, 1, dt); }
    const anyone = livePlayers().length > 0;
    for (const t of tanks) if (t.alive && t.team === 1 && anyone) updateEnemy(t, dt);
    separateTanks();
    updateBullets(dt);
    updateMines(dt);
    for (const t of tanks) if (t.alive) syncTank(t);
    if (G.duel) { if (G.state === 'play' && livePlayers().length < 2) { G.state = 'roundend'; G.timer = 1.1; } }
    else if (G.state === 'play' && enemiesAlive().length === 0) { G.state = 'clearing'; G.timer = 1; musicStop(.6); }
  }
  if (G.state === 'roundend' && G.timer <= 0) {
    // a short grace period lets a trade of shots end in a draw
    const alive = livePlayers(); musicStop(.4);
    if (alive.length === 1) {
      const w = alive[0] === player ? 0 : 1; G.wins[w]++;
      banner('<h2>' + (w ? 'Red' : 'Blue') + ' takes round ' + G.round + '</h2>' + scoreHTML(), w ? '' : 'blue'); jingle('clear');
    } else { banner('<h2>Draw!</h2><p>Both tanks went down</p>' + scoreHTML(), 'gold'); jingle('death'); }
    hudUpdate(); G.state = 'roundover'; G.timer = 2.8;
    for (const b of bullets) killBullet(b, true);
    for (const m of mines) { m.alive = false; scene.remove(m.mesh); m.owner.nm--; }
    return;
  }
  if (G.state === 'roundover' && G.timer <= 0) { if (Math.max(G.wins[0], G.wins[1]) >= DUEL_WINS) endRun(true); else { G.round++; loadDuel(); } return; }
  if (G.state === 'clearing' && G.timer <= 0) {
    if (!livePlayers().length) { G.state = 'dying'; G.timer = .1; return; }
    G.state = 'cleared'; G.timer = 3.2; G.cleared++;
    banner('<h2>Mission Cleared!</h2><p>Destroyed: ' + tallyTotal() + '</p>', 'blue'); jingle('clear');
    for (const b of bullets) killBullet(b, true);
    for (const m of mines) { m.alive = false; scene.remove(m.mesh); m.owner.nm--; }
  } else if (G.state === 'cleared' && G.timer <= 0) {
    const md = G.practice || G.start !== 1 ? 0 : medalFor(G.cleared);
    if (G.vs) nextMission();
    else if (MISSIONS[G.mission - 1].l) { G.state = 'bonus'; G.timer = 2.6; G.lives++; banner('<h2>Bonus tank!</h2>' + livesHTML(G.lives), 'gold'); jingle('life'); hudUpdate(); }
    else if (md > G.medalShown) { G.medalShown = md; G.state = 'medal'; G.timer = 2.6; banner('<h2>' + MEDALS[md].n + ' medal!</h2><p>Cleared mission ' + G.mission + '</p>', 'gold'); jingle('medal'); }
    else nextMission();
  } else if (G.state === 'bonus' && G.timer <= 0) {
    const md = G.practice || G.start !== 1 ? 0 : medalFor(G.cleared);
    if (md > G.medalShown) { G.medalShown = md; G.state = 'medal'; G.timer = 2.6; banner('<h2>' + MEDALS[md].n + ' medal!</h2><p>Cleared mission ' + G.mission + '</p>', 'gold'); jingle('medal'); }
    else nextMission();
  } else if (G.state === 'medal' && G.timer <= 0) nextMission();
  else if (G.state === 'dying' && G.timer <= 0 && G.vs) {
    // versus has no lives: both tanks down in the same mission ends the game
    musicStop(.2); jingle('over'); G.state = 'over'; G.timer = 2.6;
    banner('<h2>Both tanks down</h2><p>Missions cleared: ' + G.cleared + '</p>' + scoreHTML());
  }
  else if (G.state === 'dying' && G.timer <= 0) {
    G.lives--; musicStop(.2); jingle(G.lives > 0 ? 'death' : 'over');
    if (G.lives > 0) { G.state = 'lost'; G.timer = 2.4; banner('<h2>Tank destroyed</h2>' + livesHTML(G.lives), ''); hudUpdate(); }
    else { G.state = 'over'; G.timer = 2.6; banner('<h2>Game over</h2><p>Missions cleared: ' + G.cleared + '</p>'); }
  } else if (G.state === 'lost' && G.timer <= 0) {
    // traded shots with the last tank: the mission still counts as cleared
    if (enemiesAlive().length === 0) { G.cleared++; nextMission(); } else loadMission(G.mission, true);
  }
  else if (G.state === 'over' && G.timer <= 0) endRun(false);
}

/* ---------- input ---------- */
const keys = new Set();
const inp = { sx: 0, sz: 0, fire: false, mine: false, mx: innerWidth / 2, my: innerHeight / 3, aimX: 0, aimZ: 0, touchAim: false };
const playing = () => G.state !== 'title' && G.state !== 'results' && !G.paused;
addEventListener('keydown', e => {
  if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if ((e.code === 'Space' || e.code === 'KeyE' || e.code === 'ShiftLeft') && playing()) inp.mine = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && playing() !== false) setPause(!G.paused);
  else if ((e.code === 'KeyP' || e.code === 'Escape') && G.paused) setPause(false);
});
addEventListener('keyup', e => keys.delete(e.code));
// in co-op the players hold phones, so the TV window losing focus should not pause them
addEventListener('blur', () => { keys.clear(); if (G.state !== 'title' && G.state !== 'results' && !G.coop) setPause(true); });
function setPause(on){
  if (G.state === 'title' || G.state === 'results') return;
  G.paused = on; $('#paused').hidden = !on;
  if (AU.ctx) { if (on) AU.ctx.suspend(); else AU.ctx.resume(); }
}
const app = $('#app');
app.addEventListener('contextmenu', e => e.preventDefault());
app.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { inp.mx = e.clientX; inp.my = e.clientY; inp.touchAim = false; } });
app.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') document.body.classList.add('touch');
  if (e.target.closest('button, .stick, .card, #title')) return;
  audioInit();
  if (e.pointerType === 'mouse') {
    inp.mx = e.clientX; inp.my = e.clientY;
    if (e.button === 0 && playing()) inp.fire = true;
    if (e.button === 2 && playing()) inp.mine = true;
  } else if (playing()) {
    inp.mx = e.clientX; inp.my = e.clientY; inp.touchAim = true; inp.fire = true;
  }
});
// virtual stick
{
  const st = $('#stick'), kn = $('#knob'); let id = null;
  const upd = e => {
    const r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), m = r.width / 2;
    if (d > m) { dx = dx / d * m; dy = dy / d * m; }
    kn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const n = Math.hypot(dx, dy) / m;
    if (n < .2) { inp.sx = inp.sz = 0; } else { inp.sx = dx / m; inp.sz = dy / m; }
  };
  st.addEventListener('pointerdown', e => { id = e.pointerId; st.setPointerCapture(id); audioInit(); upd(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === id) upd(e); });
  const end = e => { if (e.pointerId !== id) return; id = null; inp.sx = inp.sz = 0; kn.style.transform = ''; };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
}
$('#mineBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (playing()) inp.mine = true; });
$('#bPause').addEventListener('click', () => setPause(true));
$('#pResume').addEventListener('click', () => setPause(false));
$('#pQuit').addEventListener('click', () => { setPause(false); toTitle(); });
$('#tStart').addEventListener('click', () => { sfx('ui'); startRun(1, false); });
$('#tSound').addEventListener('click', () => { audioInit(); setSound(!save.sound); $('#tSound').textContent = save.sound ? 'Sound on' : 'Sound off'; sfx('ui'); });
$('#tSelect').addEventListener('click', () => {
  audioInit(); sfx('ui');
  const g = $('#sGrid'); g.textContent = '';
  const max = Math.min(save.unlocked ? 100 : 20, Math.max(save.reached, 1));
  for (let i = 1; i <= (save.unlocked ? 100 : 20); i++) {
    const b = document.createElement('button'); b.textContent = i;
    if (i > max) { b.disabled = true; b.style.opacity = .35; b.style.cursor = 'not-allowed'; }
    else b.addEventListener('click', () => startRun(i, true));
    g.appendChild(b);
  }
  $('#select').hidden = false;
});
$('#sClose').addEventListener('click', () => { $('#select').hidden = true; });
$('#rAgain').addEventListener('click', () => { sfx('ui'); if (G.coop) { if (coop) coopRestart(); else toTitle(); } else startRun(G.practice ? G.start : 1, G.practice); });
$('#rMenu').addEventListener('click', () => { sfx('ui'); toTitle(); });

/* ---------- player ---------- */
const ray = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.58), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
function aimFromScreen(){
  _ndc.set(inp.mx / innerWidth * 2 - 1, -(inp.my / innerHeight) * 2 + 1);
  ray.setFromCamera(_ndc, camera);
  if (ray.ray.intersectPlane(aimPlane, _hit)) { inp.aimX = _hit.x; inp.aimZ = _hit.z; }
}
// seat 0 is the keyboard and mouse unless a phone holds it in co-op; seat 1 is always a phone
const usesKeyboard = i => i === 0 && (!G.coop || !coop || coop.ctrl[0] === 'kb');
function updatePlayer(p, i, dt){
  if (!p || !p.alive) return;
  p.cool -= dt; p.stun -= dt;
  let mx = 0, mz = 0;
  if (usesKeyboard(i)) {
    aimFromScreen();
    p.ta = Math.atan2(inp.aimX - p.x, inp.aimZ - p.z);
    if (inp.fire) { inp.fire = false; fire(p); }
    if (inp.mine) { inp.mine = false; layMine(p); }
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    mx += inp.sx; mz += inp.sz;
  } else {
    const s = padIn[i];
    if (Math.hypot(s.ax, s.ay) > .25) p.ta = Math.atan2(s.ax, s.ay);
    if (s.fire) { s.fire = false; fire(p); }
    if (s.mine) { s.mine = false; layMine(p); }
    mx = s.mx; mz = s.my;
  }
  const n = Math.hypot(mx, mz);
  if (n > 1) { mx /= n; mz /= n; }
  if (p.stun > 0) mx = mz = 0;
  const sp = p.def.spd * Math.min(1, n);
  driveTank(p, n > .05 ? mx / Math.max(n, 1e-6) : 0, n > .05 ? mz / Math.max(n, 1e-6) : 0, sp, dt, 8);
}

/* ---------- camera + HUD canvas ---------- */
const hud = $('#hudc'), hg = hud.getContext('2d');
const CAM_EL = 1.2, CAM_T = new THREE.Vector3(0, 0, .6);
function fitCamera(){
  const w = innerWidth, h = innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setSize(w, h, false);
  hud.width = w * dpr; hud.height = h * dpr; hg.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.aspect = w / h;
  camera.fov = w < h ? 50 : 36;
  camera.updateProjectionMatrix();
  const corners = [];
  for (const x of [-HX - .8, HX + .8]) for (const z of [-HZ - .8, HZ + .8]) for (const y of [0, .9]) corners.push(new THREE.Vector3(x, y, z));
  let lo = 8, hi = 120;
  for (let i = 0; i < 30; i++) {
    const d = (lo + hi) / 2; placeCam(d, 0, 0); camera.updateMatrixWorld();
    const ok = corners.every(c => { const p = c.clone().project(camera); return Math.abs(p.x) < .97 && p.y < .86 && p.y > -.97; });
    if (ok) hi = d; else lo = d;
  }
  G.camD = hi; placeCam(hi, 0, 0);
}
function placeCam(d, ox, oz){
  camera.position.set(CAM_T.x + ox, CAM_T.y + Math.sin(CAM_EL) * d, CAM_T.z + Math.cos(CAM_EL) * d + oz);
  camera.lookAt(CAM_T.x + ox, 0, CAM_T.z + oz);
}
addEventListener('resize', fitCamera);
const _pj = new THREE.Vector3();
function toScreen(x, y, z){ _pj.set(x, y, z).project(camera); return [(_pj.x + 1) / 2 * innerWidth, (1 - _pj.y) / 2 * innerHeight]; }
function drawHud(){
  hg.clearRect(0, 0, innerWidth, innerHeight);
  const live = (G.state === 'play' || G.state === 'intro') && !G.paused;
  // phone players get a short dotted sight line in their own colour
  if (live && G.coop) for (const [i, p] of [[0, player], [1, player2]]) {
    if (!p || !p.alive || usesKeyboard(i)) continue;
    hg.fillStyle = p.def.col;
    const sx = Math.sin(p.ta), sz = Math.cos(p.ta);
    for (let s = .9; s < 4.6; s += .45) {
      const [x, y] = toScreen(p.x + sx * s, .58, p.z + sz * s);
      hg.globalAlpha = 1 - s / 5.2; hg.beginPath(); hg.arc(x, y, 3.2, 0, 6.29); hg.fill();
    }
    hg.globalAlpha = 1;
  }
  const show = live && player && player.alive && usesKeyboard(0);
  app.classList.toggle('aiming', !!show && !inp.touchAim);
  if (!show) return;
  if (G.state === 'intro') aimFromScreen();
  const sx = player.x, sz = player.z, ex = inp.aimX, ez = inp.aimZ, L = Math.hypot(ex - sx, ez - sz);
  hg.fillStyle = 'rgba(59,111,216,.85)';
  for (let s = .9; s < L - .3; s += .45) {
    const [x, y] = toScreen(sx + (ex - sx) * s / L, .58, sz + (ez - sz) * s / L);
    hg.beginPath(); hg.arc(x, y, 3, 0, 6.29); hg.fill();
  }
  const [rx, ry] = toScreen(ex, .58, ez);
  hg.lineWidth = 3; hg.strokeStyle = '#3b6fd8';
  hg.beginPath(); hg.arc(rx, ry, 13, 0, 6.29); hg.stroke();
  hg.lineWidth = 2; hg.strokeStyle = '#fff8ec';
  hg.beginPath(); hg.arc(rx, ry, 16, 0, 6.29); hg.stroke();
  hg.beginPath(); hg.moveTo(rx - 20, ry); hg.lineTo(rx - 7, ry); hg.moveTo(rx + 7, ry); hg.lineTo(rx + 20, ry); hg.moveTo(rx, ry - 20); hg.lineTo(rx, ry - 7); hg.moveTo(rx, ry + 7); hg.lineTo(rx, ry + 20);
  hg.strokeStyle = '#3b6fd8'; hg.stroke();
}

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(.033, Math.max(0, (now - last) / 1000)); last = now;
  if (!G.paused) {
    update(dt);
    updatePool(firePool, dt, true); updatePool(smokePool, dt, true); updatePool(chipPool, dt, false);
    updateTreads(dt); updateBlasts(dt);
    shakeT -= dt;
    coopTick(dt);
  }
  if (shakeT > 0) placeCam(G.camD, rnd(shakeA * shakeT), rnd(shakeA * shakeT)); else { shakeA = 0; placeCam(G.camD, 0, 0); }
  renderer.render(scene, camera);
  drawHud();
}
fitCamera();
showTitle();
requestAnimationFrame(frame);

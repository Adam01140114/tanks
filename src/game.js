/* ---------- arena grid ---------- */
// cells: 0 empty, 1 wood, 2 cork, 3 hole. Cell (c,r) spans x∈[c-11,c-10], z∈[r-8.5,r-7.5]
const grid = new Uint8Array(COLS * ROWS);
const cellMesh = new Array(COLS * ROWS).fill(null);
const arena = new THREE.Group(); scene.add(arena);
const cellX = c => c - 10.5, cellZ = r => r - 8;
const colOf = x => Math.floor(x + HX), rowOf = z => Math.floor(z + HZ);
function cellAt(c, r){ return (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? 9 : grid[r * COLS + c]; }
// bullets bounce off wood, cork and the rails but fly over holes
function solidB(x, z){ const v = cellAt(colOf(x), rowOf(z)); return v === 1 || v === 2 || v === 9; }
const boxGeos = {};
function blockGeo(h){ if (!boxGeos[h]) { boxGeos[h] = new THREE.BoxGeometry(1, h, 1); boxGeos[h].translate(0, h / 2, 0); } return boxGeos[h]; }
const holeGeo = new THREE.CircleGeometry(.4, 24).rotateX(-Math.PI / 2);
const rimGeo = new THREE.RingGeometry(.39, .48, 24).rotateX(-Math.PI / 2);
function buildArena(m){
  while (arena.children.length) arena.remove(arena.children[0]);
  cellMesh.fill(null);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = m.g[r * COLS + c], k = r * COLS + c;
    grid[k] = 0;
    if (ch === '.') continue;
    if (ch === 'O') {
      grid[k] = 3;
      const g = new THREE.Group(); g.position.set(cellX(c), 0, cellZ(r));
      const h = new THREE.Mesh(holeGeo, MAT.hole); h.position.y = .006; g.add(h);
      const rim = new THREE.Mesh(rimGeo, MAT.holeRim); rim.position.y = .008; rim.receiveShadow = true; g.add(rim);
      arena.add(g); cellMesh[k] = g; continue;
    }
    const cork = ch >= 'a' && ch <= 'g', s = cork ? ch.charCodeAt(0) - 96 : +ch;
    grid[k] = cork ? 2 : 1;
    const h = Math.round((.55 + .22 * (Math.min(s, 5) - 1)) * 100) / 100;
    const side = cork ? MAT.corkSide : MAT.woodSide, top = cork ? MAT.corkTop : MAT.woodTop;
    const b = new THREE.Mesh(blockGeo(h), [side, side, top, side, side, side]);
    b.position.set(cellX(c), 0, cellZ(r)); b.castShadow = b.receiveShadow = true;
    arena.add(b); cellMesh[k] = b;
  }
}
function breakCork(c, r){
  const k = r * COLS + c; if (grid[k] !== 2) return;
  grid[k] = 0; const m = cellMesh[k]; if (m) arena.remove(m); cellMesh[k] = null;
  for (let i = 0; i < 14; i++) emit(chipPool, cellX(c) + rnd(.4), .2 + Math.random() * .6, cellZ(r) + rnd(.4), rnd(3), 2 + Math.random() * 4, rnd(3), Math.random() < .5 ? '#c99556' : '#8a5a2a', .1 + Math.random() * .12, 1.2 + Math.random() * .8, 14, .5);
  for (let i = 0; i < 4; i++) emit(smokePool, cellX(c) + rnd(.3), .4, cellZ(r) + rnd(.3), rnd(.6), .8, rnd(.6), '#d8c0a0', .7, 1, 0, 1);
}

/* ---------- entities ---------- */
const tanks = [], bullets = [], mines = [];
let player = null, player2 = null;
const livePlayers = () => [player, player2].filter(p => p && p.alive);
function nearestPlayer(t){ let b = null, bd = 1e9; for (const p of livePlayers()) { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < bd) { bd = d; b = p; } } return b; }
function spawnTank(tier, x, z, team, idx){
  const mdl = makeTankModel(tier);
  const t = Object.assign(mdl, {
    tier, def: TIERS[tier], team, idx, x, z, vx: 0, vz: 0, r: .42, alive: true,
    a: team ? -Math.PI / 2 : Math.PI / 2, ta: team ? -Math.PI / 2 : Math.PI / 2,
    cool: team ? 1.6 + Math.random() * 1.6 : 0, nb: 0, nm: 0, stun: 0, tread: 0, pivot: 0, hidden: false,
    ai: { think: Math.random() * .2, aimA: 0, best: 99, heading: Math.random() * 6.28, wander: Math.random() * 6.28, wanderT: 0, go: false, fleeT: 0, fleeDir: 0, mineCd: 2 + Math.random() * 2, stuckT: 0, sx: x, sz: z, wob: 0, chk: 0 },
  });
  t.grp.position.set(x, 0, z);
  tanks.push(t);
  return t;
}
function syncTank(t){
  t.grp.position.set(t.x, 0, t.z);
  t.base.rotation.y = t.a;
  t.tur.rotation.y = t.ta;
}
function clearEntities(){
  for (const t of tanks) scene.remove(t.grp);
  for (const b of bullets) scene.remove(b.mesh);
  for (const m of mines) scene.remove(m.mesh);
  tanks.length = bullets.length = mines.length = 0;
  for (const b of blasts) { scene.remove(b.m); b.m.material.dispose(); } blasts.length = 0;
  for (const p of [firePool, smokePool, chipPool]) for (const q of p.P) q.life = 0;
  player = player2 = null;
}

/* ---------- tank movement ---------- */
function blockedT(x, z, r){
  if (x < -HX + r || x > HX - r || z < -HZ + r || z > HZ - r) return true;
  return cellAt(colOf(x), rowOf(z)) !== 0 || cellAt(colOf(x + r), rowOf(z)) !== 0 || cellAt(colOf(x - r), rowOf(z)) !== 0 || cellAt(colOf(x), rowOf(z + r)) !== 0 || cellAt(colOf(x), rowOf(z - r)) !== 0;
}
function collideTank(t){
  for (let it = 0; it < 2; it++) {
    const c0 = colOf(t.x), r0 = rowOf(t.z);
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      const v = cellAt(c, r); if (v === 0 || v === 9) continue;
      const x0 = c - HX, x1 = x0 + 1, z0 = r - HZ, z1 = z0 + 1;
      const px = clamp(t.x, x0, x1), pz = clamp(t.z, z0, z1);
      let dx = t.x - px, dz = t.z - pz, d2 = dx * dx + dz * dz;
      if (d2 >= t.r * t.r) continue;
      if (d2 < 1e-8) { // centre inside the box: push out along the shallow side
        const ox = Math.min(t.x - x0, x1 - t.x), oz = Math.min(t.z - z0, z1 - t.z);
        if (ox < oz) t.x = t.x - x0 < x1 - t.x ? x0 - t.r : x1 + t.r; else t.z = t.z - z0 < z1 - t.z ? z0 - t.r : z1 + t.r;
        continue;
      }
      const d = Math.sqrt(d2), push = t.r - d;
      t.x += dx / d * push; t.z += dz / d * push;
    }
  }
  t.x = clamp(t.x, -HX + t.r, HX - t.r); t.z = clamp(t.z, -HZ + t.r, HZ - t.r);
}
function treadStamp(t){
  const px = Math.cos(t.a) * .33, pz = -Math.sin(t.a) * .33;
  addTread(t.x + px, t.z + pz, t.a); addTread(t.x - px, t.z - pz, t.a);
}
function driveTank(t, dx, dz, spd, dt, turn){
  const ox = t.x, oz = t.z;
  if (dx || dz) {
    const h = Math.atan2(dx, dz);
    let diff = wrapA(h - t.a);
    if (Math.abs(diff) > Math.PI / 2) diff = wrapA(diff + Math.PI); // treads run both ways
    const st = turn * dt;
    if (Math.abs(diff) > .6) { // sharp turns pivot in place
      const da = Math.sign(diff) * Math.min(st, Math.abs(diff)); t.a = wrapA(t.a + da);
      t.pivot += Math.abs(da); if (t.pivot > .45) { t.pivot = 0; treadStamp(t); }
    } else {
      t.a = wrapA(t.a + clamp(diff, -st, st));
      t.x += dx * spd * dt; t.z += dz * spd * dt;
    }
  }
  collideTank(t);
  const mv = Math.hypot(t.x - ox, t.z - oz);
  t.vx = (t.x - ox) / dt; t.vz = (t.z - oz) / dt;
  t.tread += mv; if (t.tread > .24) { t.tread = 0; treadStamp(t); }
}
function separateTanks(){
  for (let i = 0; i < tanks.length; i++) {
    const a = tanks[i]; if (!a.alive) continue;
    for (let j = i + 1; j < tanks.length; j++) {
      const b = tanks[j]; if (!b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = a.r + b.r;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), p = (rr - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * p; a.z -= nz * p; b.x += nx * p; b.z += nz * p;
      collideTank(a); collideTank(b);
    }
  }
}

/* ---------- bullets ---------- */
const shellGeo = new THREE.CylinderGeometry(.065, .075, .2, 10).rotateX(Math.PI / 2);
const noseGeo = new THREE.SphereGeometry(.068, 10, 6).translate(0, 0, .1);
function makeShell(rocket){
  const g = new THREE.Group();
  const a = new THREE.Mesh(shellGeo, rocket ? MAT.rocket : MAT.shell), b = new THREE.Mesh(noseGeo, rocket ? MAT.rocket : MAT.shell);
  a.castShadow = b.castShadow = true; g.add(a, b);
  if (rocket) g.scale.set(1.15, 1.15, 1.5);
  scene.add(g); return g;
}
function fire(t){
  const d = t.def;
  if (t.nb >= d.mb || t.cool > 0 || !t.alive) return false;
  const sx = Math.sin(t.ta), sz = Math.cos(t.ta), mx = t.x + sx * .7, mz = t.z + sz * .7;
  t.cool = d.cd; t.stun = t.team === 0 ? .08 : (d.firestun || .12);
  t.nb++;
  for (let i = 0; i < 5; i++) emit(smokePool, mx + rnd(.05), .58, mz + rnd(.05), sx * (1 + Math.random()) + rnd(.4), .3, sz * (1 + Math.random()) + rnd(.4), '#f4efe6', .22 + Math.random() * .12, .45, 0, 3);
  emit(firePool, mx, .6, mz, sx, 0, sz, '#ffd27a', .3, .08);
  sfx(d.rocket ? 'rocket' : 'fire', t.team === 0 ? 1 : .6);
  const b = { x: mx, z: mz, vx: sx * d.bspd, vz: sz * d.bspd, ric: d.ric, bn: 0, owner: t, rocket: !!d.rocket, age: 0, alive: true, trail: 0, mesh: makeShell(d.rocket) };
  bullets.push(b);
  // a barrel jammed into a wall pops the shell immediately
  if (solidB(mx, mz) || solidB(t.x + sx * .45, t.z + sz * .45)) killBullet(b, true);
  else b.mesh.position.set(mx, .58, mz);
  return true;
}
function killBullet(b, puff){
  if (!b.alive) return;
  b.alive = false; scene.remove(b.mesh); b.owner.nb--;
  if (puff) { for (let i = 0; i < 6; i++) emit(smokePool, b.x, .55, b.z, rnd(1.2), .6 + Math.random(), rnd(1.2), '#e9e2d6', .25, .5, 0, 3); sfx('fizz', .5); }
}
function bounce(b, ax){
  if (b.age < .085 || b.bn >= b.ric) { killBullet(b, true); return false; }
  b.bn++;
  if (ax === 0) b.vx = -b.vx; else b.vz = -b.vz;
  for (let i = 0; i < 5; i++) emit(firePool, b.x, .55, b.z, rnd(2.5), Math.random() * 2, rnd(2.5), '#fff2c0', .06, .18, 0, 2);
  sfx('ric', .55);
  return true;
}
function moveBullet(b, h){
  b.age += h;
  const nx = b.x + b.vx * h, sxn = Math.sign(b.vx) * .06;
  if (solidB(nx + sxn, b.z)) { if (!bounce(b, 0)) return; } else b.x = nx;
  const nz = b.z + b.vz * h, szn = Math.sign(b.vz) * .06;
  if (solidB(b.x, nz + szn)) { if (!bounce(b, 1)) return; } else b.z = nz;
  if (solidB(b.x, b.z)) killBullet(b, true);
}
function bulletHits(){
  for (const b of bullets) {
    if (!b.alive) continue;
    for (const t of tanks) {
      if (!t.alive || (t === b.owner && b.bn === 0 && b.age < .25)) continue;
      const dx = t.x - b.x, dz = t.z - b.z;
      if (dx * dx + dz * dz < (t.r + .08) * (t.r + .08)) { killBullet(b, false); killTank(t, b.owner); break; }
    }
    if (!b.alive) continue;
    for (const o of bullets) {
      if (o === b || !o.alive) continue;
      const dx = o.x - b.x, dz = o.z - b.z;
      if (dx * dx + dz * dz < .05) {
        killBullet(b, false); killBullet(o, false); sfx('clink');
        for (let i = 0; i < 8; i++) emit(firePool, b.x, .55, b.z, rnd(3), Math.random() * 3, rnd(3), '#ffe9a8', .08, .25, 4, 1);
        for (let i = 0; i < 4; i++) emit(smokePool, b.x, .55, b.z, rnd(.8), .5, rnd(.8), '#efe8dc', .3, .5, 0, 2);
        break;
      }
    }
    if (!b.alive) continue;
    for (const m of mines) {
      if (!m.alive) continue;
      const dx = m.x - b.x, dz = m.z - b.z;
      if (dx * dx + dz * dz < .12) { killBullet(b, false); explodeMine(m); break; }
    }
  }
}
function updateBullets(dt){
  const sub = 3, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of bullets) if (b.alive) moveBullet(b, h);
    bulletHits();
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (!b.alive) { bullets.splice(i, 1); continue; }
    b.mesh.position.set(b.x, .58, b.z);
    b.mesh.rotation.y = Math.atan2(b.vx, b.vz);
    b.trail -= dt;
    if (b.trail <= 0) {
      b.trail = b.rocket ? .016 : .035;
      const sp = Math.hypot(b.vx, b.vz), tx = b.x - b.vx / sp * .18, tz = b.z - b.vz / sp * .18;
      if (b.rocket) {
        emit(firePool, tx, .58, tz, rnd(.3), rnd(.2), rnd(.3), Math.random() < .5 ? '#ffb340' : '#ff6a2a', .16, .22);
        emit(smokePool, tx, .58, tz, rnd(.2), .2, rnd(.2), '#d8d2c8', .18, .6, 0, 2);
      } else emit(smokePool, tx, .58, tz, rnd(.1), .1, rnd(.1), '#f5f1ea', .12, .45, 0, 2);
    }
  }
}

/* ---------- mines ---------- */
const mineGeo = new THREE.CylinderGeometry(.27, .3, .1, 18);
const mineDomeGeo = new THREE.SphereGeometry(.15, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const mineLightGeo = new THREE.SphereGeometry(.055, 8, 6);
const MINE_R = 2.2;
function layMine(t){
  if (!t.alive || t.nm >= t.def.mm) return false;
  for (const m of mines) if (m.alive && Math.hypot(m.x - t.x, m.z - t.z) < .9) return false;
  const g = new THREE.Group(); g.position.set(t.x, 0, t.z);
  const a = new THREE.Mesh(mineGeo, MAT.mine); a.position.y = .05; a.castShadow = a.receiveShadow = true;
  const d = new THREE.Mesh(mineDomeGeo, MAT.mineTop); d.position.y = .1;
  const lm = new THREE.MeshBasicMaterial({ color: '#c8382f' });
  const l = new THREE.Mesh(mineLightGeo, lm); l.position.y = .25;
  g.add(a, d, l); scene.add(g);
  mines.push({ x: t.x, z: t.z, owner: t, team: t.team, fuse: 10, alive: true, mesh: g, light: lm, blink: 0, age: 0 });
  t.nm++; sfx('mine', t.team === 0 ? 1 : .6);
  return true;
}
function explodeMine(m){
  if (!m.alive) return;
  m.alive = false; scene.remove(m.mesh); m.light.dispose(); m.owner.nm--;
  addBlast(m.x, m.z, MINE_R, '#ffd27a', .7);
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 5; emit(firePool, m.x, .3, m.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, Math.random() < .5 ? '#ffb340' : '#ff7a2a', .3 + Math.random() * .3, .4 + Math.random() * .3, 0, 4); }
  for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, s = .5 + Math.random() * 2.4; emit(smokePool, m.x + Math.cos(a) * s * .3, .4 + Math.random() * .6, m.z + Math.sin(a) * s * .3, Math.cos(a) * s, 1 + Math.random(), Math.sin(a) * s, Math.random() < .5 ? '#6a625a' : '#958b80', .9 + Math.random() * .6, 1.4 + Math.random(), 0, 1.6); }
  sfx('boom'); shake(.35, .45);
  const c0 = colOf(m.x), r0 = rowOf(m.z), cr = Math.ceil(MINE_R);
  for (let r = r0 - cr; r <= r0 + cr; r++) for (let c = c0 - cr; c <= c0 + cr; c++)
    if (cellAt(c, r) === 2 && Math.hypot(cellX(c) - m.x, cellZ(r) - m.z) < MINE_R + .25) { breakCork(c, r); sfx('cork', .6); }
  for (const t of tanks) if (t.alive && Math.hypot(t.x - m.x, t.z - m.z) < MINE_R) killTank(t, m.owner);
  for (const b of bullets) if (b.alive && Math.hypot(b.x - m.x, b.z - m.z) < MINE_R) killBullet(b, false);
  for (const o of mines) if (o.alive && Math.hypot(o.x - m.x, o.z - m.z) < MINE_R) o.fuse = Math.min(o.fuse, .12);
}
function updateMines(dt){
  for (const m of mines) {
    if (!m.alive) continue;
    m.age += dt;
    // any tank from the other side rolling close trips the short fuse
    if (m.fuse > .5) for (const t of tanks) if (t.alive && t.team !== m.team && Math.hypot(t.x - m.x, t.z - m.z) < 1.3) { m.fuse = .5; break; }
    m.fuse -= dt;
    if (m.fuse <= 0) { explodeMine(m); continue; }
    const rate = m.fuse < .6 ? 18 : m.fuse < 2 ? 9 : 1.6;
    m.blink += dt * rate;
    const on = (m.blink % 2) < 1;
    m.light.color.set(on ? (m.fuse < 2 ? '#ffffff' : '#ff4a3a') : '#7a1a14');
    if (m.fuse < 2) m.mesh.children[0].material = on ? MAT.mineTop : MAT.mine;
    if (m.fuse < 2 && on && m.lastOn !== on) sfx('beep', .5);
    m.lastOn = on;
  }
  for (let i = mines.length - 1; i >= 0; i--) if (!mines[i].alive) mines.splice(i, 1);
}

/* ---------- destruction ---------- */
function killTank(t, by){
  if (!t.alive) return;
  t.alive = false; scene.remove(t.grp);
  addX(t.x, t.z, t.def.col);
  addBlast(t.x, t.z, 1.1, '#ffe08a', .5);
  for (let i = 0; i < 16; i++) emit(chipPool, t.x + rnd(.3), .4, t.z + rnd(.3), rnd(4), 3 + Math.random() * 4, rnd(4), Math.random() < .6 ? t.def.col : '#3a3532', .1 + Math.random() * .12, 1.4 + Math.random(), 14, .4);
  for (let i = 0; i < 14; i++) emit(firePool, t.x, .4, t.z, rnd(3), 1 + Math.random() * 3, rnd(3), Math.random() < .5 ? '#ffb340' : '#ff6a2a', .25 + Math.random() * .25, .35 + Math.random() * .3, 0, 3);
  for (let i = 0; i < 12; i++) emit(smokePool, t.x + rnd(.3), .5, t.z + rnd(.3), rnd(1), 1.2 + Math.random() * 1.5, rnd(1), Math.random() < .5 ? '#4a4540' : '#7d756c', .6 + Math.random() * .5, 1.6 + Math.random(), 0, 1.2);
  sfx('tankboom'); shake(t.team === 0 ? .5 : .25, .4);
  onTankKilled(t, by);
}

/* ---------- enemy AI ---------- */
// simulate a shell; returns how close it gets to the target before something stops it (99 = would hit a friend or itself)
function traceShot(t, ang, tgt, tx, tz){
  const d = t.def; let vx = Math.sin(ang), vz = Math.cos(ang);
  let x = t.x + vx * .7, z = t.z + vz * .7;
  if (solidB(x, z) || solidB(t.x + vx * .45, t.z + vz * .45)) return 99;
  let bn = 0, best = 99, travel = 0;
  const L = .2;
  while (travel < 36) {
    const nx = x + vx * L; if (solidB(nx + Math.sign(vx) * .06, z)) { if (bn >= d.ric) break; bn++; vx = -vx; } else x = nx;
    const nz = z + vz * L; if (solidB(x, nz + Math.sign(vz) * .06)) { if (bn >= d.ric) break; bn++; vz = -vz; } else z = nz;
    travel += L;
    const dd = Math.hypot(x - tx, z - tz); if (dd < best) best = dd;
    if (dd < .45) return best;
    for (const o of tanks) {
      if (!o.alive || o === tgt || (o === t && travel < 1.2)) continue;
      if ((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) < .36) return o.team === t.team ? 99 : 0;
    }
  }
  return best;
}
function aimTarget(t, P){
  const d = t.def;
  let tx = P.x, tz = P.z;
  if (d.predict) { const tof = Math.hypot(P.x - t.x, P.z - t.z) / d.bspd; tx += P.vx * tof * .9; tz += P.vz * tof * .9; }
  return [tx, tz];
}
function aimThink(t){
  const ai = t.ai, d = t.def, near = nearestPlayer(t);
  if (!near) { ai.best = 99; ai.tgt = null; return; }
  // look for a shot at each player; the closest one gets the lazy turret sweep
  let best = 99, bestA = 0, bestP = near, direct = 0;
  for (const P of livePlayers()) {
    const [tx, tz] = aimTarget(t, P), dA = Math.atan2(tx - t.x, tz - t.z);
    if (P === near) direct = dA;
    const cands = [dA, ai.aimA, t.ta, ai.aimA + .05, ai.aimA - .05];
    for (let i = 0; i < d.search; i++) cands.push(Math.random() * Math.PI * 2 - Math.PI);
    for (const a of cands) { const s = traceShot(t, a, P, tx, tz); if (s < best - .001) { best = s; bestA = a; bestP = P; } }
  }
  ai.best = best; ai.tgt = bestP;
  if (best < .5 + d.sloppy + .6) ai.aimA = bestA;
  else {
    // nothing lines up: sweep the turret around lazily, roughly toward the player
    ai.wob += rnd(.35); ai.wob = clamp(ai.wob, -1.6, 1.6);
    ai.aimA = direct + ai.wob;
  }
}
function tryFire(t){
  const d = t.def, ai = t.ai, P = ai.tgt;
  if (t.cool > 0 || t.nb >= d.mb || !P || !P.alive) return;
  if (Math.abs(wrapA(ai.aimA - t.ta)) > .1) return;
  const [tx, tz] = aimTarget(t, P);
  if (traceShot(t, t.ta, P, tx, tz) < .5 + d.sloppy) fire(t);
}
function clearance(t, h){
  const hx = Math.sin(h), hz = Math.cos(h);
  for (let s = .3; s <= 3; s += .3) if (blockedT(t.x + hx * s, t.z + hz * s, .36)) return s - .3;
  return 3;
}
function moveThink(t, dt){
  const d = t.def, ai = t.ai, P = nearestPlayer(t);
  ai.wanderT -= dt;
  if (ai.wanderT <= 0) { ai.wander = Math.random() * 6.28; ai.wanderT = 1.5 + Math.random() * 2.5; }
  // incoming shells
  const threats = [];
  if (d.aware > 0) for (const b of bullets) {
    if (!b.alive || (b.owner === t && b.bn === 0)) continue;
    const rx = t.x - b.x, rz = t.z - b.z, v2 = b.vx * b.vx + b.vz * b.vz;
    if (rx * rx + rz * rz > 36) continue;
    const tca = (rx * b.vx + rz * b.vz) / v2;
    if (tca < 0 || tca > 1.4) continue;
    let ax = rx - b.vx * tca, az = rz - b.vz * tca; const dd = Math.hypot(ax, az);
    if (dd > 1.2) continue;
    if (dd < 1e-3) { ax = -b.vz; az = b.vx; } const n = Math.hypot(ax, az);
    threats.push([ax / n, az / n, 1.4 - tca]);
  }
  const toP = P && P.alive ? Math.atan2(P.x - t.x, P.z - t.z) : null, distP = P ? Math.hypot(P.x - t.x, P.z - t.z) : 99;
  let best = -1e9, bh = ai.heading, bc = 0;
  for (let k = 0; k < 16; k++) {
    const h = k * Math.PI / 8 + rnd(.1), c = clearance(t, h), hx = Math.sin(h), hz = Math.cos(h);
    let s = c * 1.1 + .8 * Math.cos(h - ai.wander) + .7 * Math.cos(h - ai.heading);
    if (toP != null) s += d.aggr * 1.6 * (distP > 5 - d.aggr * 2.5 ? 1 : -.7) * Math.cos(h - toP);
    for (const [ax, az, w] of threats) s += d.aware * 4 * w * (hx * ax + hz * az);
    if (d.mm > 0) for (const m of mines) if (m.alive && Math.hypot(t.x + hx * 1.2 - m.x, t.z + hz * 1.2 - m.z) < MINE_R + .4) s -= 4;
    if (ai.fleeT > 0) s += 3 * Math.cos(h - ai.fleeDir);
    if (c < .5) s -= 6;
    if (s > best) { best = s; bh = h; bc = c; }
  }
  ai.heading = bh; ai.go = bc >= .3;
}
function maybeMine(t, dt){
  const d = t.def, ai = t.ai;
  if (!d.mm || t.nm >= d.mm || ai.mineCd > 0) return;
  const np = nearestPlayer(t), near = np && Math.hypot(np.x - t.x, np.z - t.z) < 4;
  if (Math.random() > d.mineRate * dt * (near ? 4 : 1)) return;
  for (const o of tanks) if (o !== t && o.alive && o.team === t.team && Math.hypot(o.x - t.x, o.z - t.z) < 2.6) return;
  for (const m of mines) if (m.alive && Math.hypot(m.x - t.x, m.z - t.z) < 2) return;
  if (layMine(t)) { ai.mineCd = 2.5; ai.fleeT = 1.8; ai.fleeDir = ai.heading; }
}
function updateEnemy(t, dt){
  const d = t.def, ai = t.ai;
  t.cool -= dt; t.stun -= dt; ai.fleeT -= dt; ai.mineCd -= dt; ai.think -= dt;
  if (ai.think <= 0) {
    const step = .14 + Math.random() * .06; ai.think = step;
    aimThink(t);
    if (d.spd) { moveThink(t, step); maybeMine(t, step); }
    tryFire(t);
  }
  const da = wrapA(ai.aimA - t.ta), ts = d.tts * dt;
  t.ta = wrapA(t.ta + clamp(da, -ts, ts));
  ai.chk -= dt;
  if (ai.chk <= 0 && Math.abs(da) < .1 && t.cool <= 0 && ai.best < 1.5 + d.sloppy) { ai.chk = .05; tryFire(t); }
  if (d.spd && t.stun <= 0 && ai.go) driveTank(t, Math.sin(ai.heading), Math.cos(ai.heading), d.spd, dt, 5);
  else { t.vx = t.vz = 0; }
  if (d.spd) {
    ai.stuckT += dt;
    if (ai.stuckT > .9) {
      if (ai.go && Math.hypot(t.x - ai.sx, t.z - ai.sz) < .15) { ai.wander = Math.random() * 6.28; ai.heading = ai.wander; ai.wanderT = 1.5; }
      ai.stuckT = 0; ai.sx = t.x; ai.sz = t.z;
    }
  }
}
function vanish(t){
  t.hidden = true; t.grp.visible = false;
  for (let i = 0; i < 16; i++) emit(smokePool, t.x + rnd(.4), .3 + Math.random() * .5, t.z + rnd(.4), rnd(1.4), .6 + Math.random(), rnd(1.4), '#f2efe8', .6 + Math.random() * .4, 1 + Math.random() * .6, 0, 2);
  sfx('puff', .7);
}

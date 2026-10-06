'use strict';
/* ---------- utilities ---------- */
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = a => (Math.random() * 2 - 1) * a;
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const COLS = 22, ROWS = 17, HX = 11, HZ = 8.5;

let save = { best: 0, bestTotal: 0, medal: 0, unlocked: false, sound: true, reached: 1 };
try { const s = JSON.parse(localStorage.getItem('tabletop-tanks') || 'null'); if (s) Object.assign(save, s); } catch (e) {}
function persist(){ try { localStorage.setItem('tabletop-tanks', JSON.stringify(save)); } catch (e) {} }

/* ---------- tank roster (the nine enemy colours + the player) ---------- */
// spd blocks/s, bspd bullet blocks/s, cd fire cooldown s, ric ricochets, mb max bullets, mm max mines,
// tts turret turn rad/s, sloppy = how close a shot has to look before it fires, search = ricochet angles tried per think,
// aware = bullet dodging, aggr = drive toward you, mineRate per second
const TIERS = [
  { n: 'Player', col: '#3b6fd8', acc: '#f2f5ff', spd: 3.6, bspd: 6, cd: .1, ric: 1, mb: 5, mm: 2 },
  { n: 'Brown', col: '#9a6a3a', acc: '#d9b48a', spd: 0, bspd: 6, cd: 5, ric: 1, mb: 1, mm: 0, tts: 1.1, sloppy: 1.6, search: 3, aware: 0, aggr: 0, pts: 1 },
  { n: 'Ash', col: '#8e8f8a', acc: '#c9cac4', spd: 2.4, bspd: 6, cd: 3, ric: 1, mb: 1, mm: 0, tts: 1.6, sloppy: 1.0, search: 3, aware: .25, aggr: .1, pts: 1 },
  { n: 'Marine', col: '#2f8a84', acc: '#9ed8cf', spd: 2.0, bspd: 12, cd: 3, ric: 0, mb: 1, mm: 0, tts: 4.5, sloppy: .15, search: 0, aware: .4, aggr: .3, rocket: true, pts: 1 },
  { n: 'Pink', col: '#e47aa6', acc: '#fbd0e1', spd: 2.4, bspd: 6, cd: .5, ric: 1, mb: 3, mm: 0, tts: 2.4, sloppy: .55, search: 4, aware: .5, aggr: .65, pts: 1 },
  { n: 'Yellow', col: '#e8c033', acc: '#fff0b0', spd: 3.6, bspd: 6, cd: 3, ric: 1, mb: 1, mm: 4, tts: 1.8, sloppy: .8, search: 3, aware: 0, aggr: -.1, mineRate: .32, pts: 1 },
  { n: 'Violet', col: '#8d55c8', acc: '#d8c0f2', spd: 3.6, bspd: 6, cd: .5, ric: 1, mb: 5, mm: 2, tts: 2.6, sloppy: .3, search: 14, aware: .75, aggr: .35, mineRate: .06, pts: 1 },
  { n: 'Green', col: '#53ad3c', acc: '#c5ecb0', spd: 0, bspd: 12, cd: 1, ric: 2, mb: 2, mm: 0, tts: 3.2, sloppy: .08, search: 20, aware: 0, aggr: 0, rocket: true, predict: true, pts: 1 },
  { n: 'White', col: '#f1efe7', acc: '#ffffff', spd: 2.4, bspd: 6, cd: .5, ric: 1, mb: 5, mm: 2, tts: 2.6, sloppy: .3, search: 10, aware: .6, aggr: .4, mineRate: .06, invisible: true, pts: 1 },
  { n: 'Black', col: '#2c2c31', acc: '#6b6b74', spd: 4.8, bspd: 12, cd: 1, ric: 0, mb: 3, mm: 2, tts: 3.6, sloppy: .2, search: 0, aware: 1, aggr: .5, mineRate: .1, rocket: true, predict: true, firestun: .3, pts: 1 },
  { n: 'Player 2', col: '#d8473a', acc: '#ffe9e2', spd: 3.6, bspd: 6, cd: .1, ric: 1, mb: 5, mm: 2 },
];

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#gl').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a2e1b');
const camera = new THREE.PerspectiveCamera(36, 1, .5, 200);
const hemi = new THREE.HemisphereLight(0xfff3df, 0x7a5a3c, .62); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e8, .72);
sun.position.set(-7, 22, 9); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 13, bottom: -13, near: 1, far: 60 });
sun.shadow.bias = -.0008; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw, rep){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function seeded(s){ return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function grain(g, x, y, w, h, base, dark, n, r){
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = 0; i < n; i++) {
    const yy = y + r() * h, amp = 1 + r() * 3, ph = r() * 6;
    g.strokeStyle = dark; g.globalAlpha = .08 + r() * .14; g.lineWidth = .6 + r() * 1.4;
    g.beginPath();
    for (let xx = x; xx <= x + w; xx += 6) g.lineTo(xx, yy + Math.sin(xx * .03 + ph) * amp);
    g.stroke();
  }
  g.restore(); g.globalAlpha = 1;
}
// the play mat: pale maple planks
const floorTex = canvasTex(1024, 1024, (g, w, h) => {
  const r = seeded(7), rows = 8, ph = h / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 300;
    while (x < w) {
      const len = 260 + r() * 260, tone = 228 + r() * 14;
      grain(g, x, i * ph, len, ph, `rgb(${tone},${tone - 22},${tone - 62})`, '#8a5a2a', 16, r);
      g.fillStyle = 'rgba(110,70,30,.28)'; g.fillRect(x, i * ph, 2, ph);
      x += len;
    }
    g.fillStyle = 'rgba(110,70,30,.3)'; g.fillRect(0, i * ph, w, 2);
  }
}, [2.75, 2.1]);
const tableTex = canvasTex(512, 512, (g, w, h) => {
  const r = seeded(3);
  for (let i = 0; i < 4; i++) grain(g, 0, i * 128, w, 128, `rgb(${110 + r() * 14},${66 + r() * 8},${36})`, '#2a1608', 26, r);
  g.fillStyle = 'rgba(30,15,5,.35)'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 128, w, 3);
}, [6, 6]);
function blockFace(top, cork){
  return canvasTex(128, 128, (g, w, h) => {
    const r = seeded(cork ? 11 : top ? 5 : 9);
    if (cork) {
      g.fillStyle = '#c99556'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const v = r(); g.fillStyle = v < .5 ? 'rgba(120,70,30,.5)' : v < .8 ? 'rgba(230,190,130,.6)' : 'rgba(80,45,20,.55)'; const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s); }
    } else {
      grain(g, 0, 0, w, h, top ? '#e8c48a' : '#d6a868', '#7a4a1c', 18, r);
    }
    g.strokeStyle = cork ? 'rgba(90,50,20,.45)' : 'rgba(110,64,24,.45)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = 'rgba(255,240,210,.35)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
  });
}
const MAT = {
  floor: new THREE.MeshLambertMaterial({ map: floorTex }),
  table: new THREE.MeshLambertMaterial({ map: tableTex }),
  rail: new THREE.MeshLambertMaterial({ color: '#a8703c', map: blockFace(false, false) }),
  woodSide: new THREE.MeshLambertMaterial({ map: blockFace(false, false) }),
  woodTop: new THREE.MeshLambertMaterial({ map: blockFace(true, false) }),
  corkSide: new THREE.MeshLambertMaterial({ map: blockFace(false, true) }),
  corkTop: new THREE.MeshLambertMaterial({ map: blockFace(true, true), color: '#fff2e0' }),
  hole: new THREE.MeshBasicMaterial({ color: '#1f140c' }),
  holeRim: new THREE.MeshLambertMaterial({ color: '#7a5532' }),
  tread: new THREE.MeshLambertMaterial({ color: '#3a3532' }),
  treadLite: new THREE.MeshLambertMaterial({ color: '#57504a' }),
  barrel: new THREE.MeshLambertMaterial({ color: '#4a4744' }),
  shell: new THREE.MeshLambertMaterial({ color: '#f4f1ea', emissive: '#2a2a2a' }),
  rocket: new THREE.MeshLambertMaterial({ color: '#f4f1ea', emissive: '#5a2a10' }),
  mine: new THREE.MeshLambertMaterial({ color: '#e7c34a' }),
  mineTop: new THREE.MeshLambertMaterial({ color: '#3a3532' }),
  xmark: new THREE.MeshBasicMaterial({ color: '#2b2118', transparent: true, opacity: .78 }),
};

/* ---------- static table ---------- */
{
  const t = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), MAT.table);
  t.rotation.x = -Math.PI / 2; t.position.y = -.02; t.receiveShadow = true; scene.add(t);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), MAT.floor);
  f.rotation.x = -Math.PI / 2; f.receiveShadow = true; scene.add(f);
  // wooden rails around the play field
  const rh = .9, rw = .7;
  const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, rh, d), MAT.rail); m.position.set(x, rh / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m); };
  add(COLS + rw * 2, rw, 0, -HZ - rw / 2); add(COLS + rw * 2, rw, 0, HZ + rw / 2);
  add(rw, ROWS, -HX - rw / 2, 0); add(rw, ROWS, HX + rw / 2, 0);
}

/* ---------- toy tank models ---------- */
const tankMats = new Map();
function tankMat(col){ if (!tankMats.has(col)) tankMats.set(col, new THREE.MeshLambertMaterial({ color: col })); return tankMats.get(col); }
const TG = {
  tread: new THREE.BoxGeometry(.2, .24, .98),
  wheel: new THREE.CylinderGeometry(.1, .1, .22, 10),
  hull: new THREE.BoxGeometry(.86, .2, .9),
  deck: new THREE.BoxGeometry(.6, .08, .66),
  nose: new THREE.BoxGeometry(.7, .12, .1),
  turret: new THREE.CylinderGeometry(.25, .28, .18, 18),
  dome: new THREE.SphereGeometry(.25, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  barrel: new THREE.CylinderGeometry(.055, .06, .56, 10),
  tip: new THREE.CylinderGeometry(.075, .075, .1, 10),
  hatch: new THREE.CylinderGeometry(.09, .09, .05, 10),
};
TG.barrel.rotateX(Math.PI / 2); TG.barrel.translate(0, 0, .3);
TG.tip.rotateX(Math.PI / 2); TG.tip.translate(0, 0, .58);
TG.wheel.rotateZ(Math.PI / 2);
function makeTankModel(tier){
  const d = TIERS[tier], body = tankMat(d.col), acc = tankMat(d.acc);
  const grp = new THREE.Group(), base = new THREE.Group(); grp.add(base);
  const m = (geo, mat, x, y, z, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; (parent || base).add(o); return o; };
  for (const s of [-1, 1]) {
    m(TG.tread, MAT.tread, s * .33, .13, 0);
    for (let i = -1; i <= 1; i++) m(TG.wheel, MAT.treadLite, s * .34, .12, i * .3);
  }
  m(TG.hull, body, 0, .33, 0);
  m(TG.deck, acc, 0, .47, -.04);
  m(TG.nose, acc, 0, .3, .46);
  const tur = new THREE.Group(); tur.position.y = .5; grp.add(tur);
  m(TG.turret, body, 0, .07, 0, tur);
  m(TG.dome, body, 0, .15, 0, tur);
  m(TG.hatch, acc, -.06, .38, -.06, tur);
  m(TG.barrel, d.rocket ? tankMat('#3a3a40') : MAT.barrel, 0, .1, 0, tur);
  m(TG.tip, d.rocket ? tankMat('#c8382f') : MAT.barrel, 0, .1, 0, tur);
  scene.add(grp);
  return { grp, base, tur };
}

/* ---------- instanced particles ---------- */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _c = new THREE.Color();
function makePool(n, mat, geo){
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  mesh.frustumCulled = false; scene.add(mesh);
  const P = []; for (let i = 0; i < n; i++) P.push({ life: 0 });
  _m4.makeScale(0, 0, 0); for (let i = 0; i < n; i++) mesh.setMatrixAt(i, _m4);
  return { mesh, P, i: 0 };
}
const sphereGeo = new THREE.IcosahedronGeometry(.5, 1);
const firePool = makePool(500, new THREE.MeshBasicMaterial({ color: '#ffffff' }), sphereGeo);
const smokePool = makePool(700, new THREE.MeshLambertMaterial({ color: '#ffffff' }), sphereGeo);
const chipPool = makePool(300, new THREE.MeshLambertMaterial({ color: '#ffffff' }), new THREE.BoxGeometry(1, 1, 1));
// kind: 0 puff (grows then shrinks), 1 debris (shrinks, bounces)
function emit(pool, x, y, z, vx, vy, vz, col, size, life, grav, drag){
  const k = pool.i, p = pool.P[k]; pool.i = (k + 1) % pool.P.length;
  Object.assign(p, { x, y, z, vx, vy, vz, size, life, max: life, grav: grav || 0, drag: drag || 0, rx: Math.random() * 6, ry: Math.random() * 6 });
  pool.mesh.setColorAt(k, _c.set(col));
  pool.mesh.instanceColor.needsUpdate = true;
}
function updatePool(pool, dt, puff){
  const { mesh, P } = pool;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.life <= 0) { if (p.dead !== true) { p.dead = true; _m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m4); } continue; }
    p.dead = false; p.life -= dt;
    p.vy -= p.grav * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < .03 && p.grav > 0) { p.y = .03; p.vy *= -.35; p.vx *= .6; p.vz *= .6; }
    const f = clamp(p.life / p.max, 0, 1);
    const s = puff ? p.size * Math.sin(Math.min(1, (1 - f) * 4 + .2) * Math.PI / 2) * (f < .5 ? f * 2 : 1) : p.size * Math.min(1, f * 3);
    _q.setFromAxisAngle(_v3.set(0, 1, 0), p.ry + (1 - f) * 3);
    _m4.compose(_v3.set(p.x, p.y, p.z), _q, _s3.set(s, s, s));
    mesh.setMatrixAt(i, _m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/* ---------- floor decals: tread marks + X marks ---------- */
const TREAD_N = 2400;
const treadMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.17, .09).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6f5232', transparent: true, opacity: .42, depthWrite: false }), TREAD_N);
treadMesh.frustumCulled = false; treadMesh.renderOrder = 1; scene.add(treadMesh);
const treads = []; let treadI = 0;
for (let i = 0; i < TREAD_N; i++) treads.push({ t: 0 });
function clearTreads(){ _m4.makeScale(0, 0, 0); for (let i = 0; i < TREAD_N; i++) { treads[i].t = 0; treadMesh.setMatrixAt(i, _m4); } treadMesh.instanceMatrix.needsUpdate = true; }
clearTreads();
function addTread(x, z, a){
  const k = treadI; treadI = (treadI + 1) % TREAD_N;
  Object.assign(treads[k], { x, z, a, t: 14 });
}
function updateTreads(dt){
  for (let i = 0; i < TREAD_N; i++) {
    const p = treads[i]; if (p.t <= 0) continue;
    p.t -= dt;
    const s = p.t <= 0 ? 0 : Math.min(1, p.t / 3);
    _q.setFromAxisAngle(_v3.set(0, 1, 0), p.a);
    _m4.compose(_v3.set(p.x, .012, p.z), _q, _s3.set(s, 1, s));
    treadMesh.setMatrixAt(i, _m4);
  }
  treadMesh.instanceMatrix.needsUpdate = true;
}
const decals = new THREE.Group(); scene.add(decals);
const xGeo = new THREE.BoxGeometry(.95, .015, .17);
function addX(x, z, col){
  const g = new THREE.Group(); g.position.set(x, .016, z);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(.35), transparent: true, opacity: .8, depthWrite: false });
  for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(xGeo, mat); b.rotation.y = a; g.add(b); }
  decals.add(g);
}
function clearDecals(){ while (decals.children.length) { const g = decals.children.pop(); g.children[0].material.dispose(); } }

/* ---------- expanding fireballs ---------- */
const blasts = [];
const blastGeo = new THREE.IcosahedronGeometry(1, 2);
function addBlast(x, z, r, col, dur){
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .95, depthWrite: false });
  const m = new THREE.Mesh(blastGeo, mat); m.position.set(x, .3, z); m.scale.setScalar(.01); scene.add(m);
  blasts.push({ m, r, t: 0, dur });
}
function updateBlasts(dt){
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]; b.t += dt; const f = b.t / b.dur;
    if (f >= 1) { scene.remove(b.m); b.m.material.dispose(); blasts.splice(i, 1); continue; }
    b.m.scale.setScalar(b.r * (1 - Math.pow(1 - Math.min(1, f * 2.2), 3)));
    b.m.scale.y *= .75;
    b.m.material.opacity = f < .45 ? .95 : .95 * (1 - (f - .45) / .55);
    b.m.material.color.lerpColors(_c.set('#fff3b0'), new THREE.Color('#e8551f'), Math.min(1, f * 1.6));
  }
}

/* ---------- screen shake ---------- */
let shakeT = 0, shakeA = 0;
function shake(a, t){ shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, t || .3); }

/* ---------- audio: synthesized SFX + a layered marching band ---------- */
const AU = { ctx: null, master: null, mus: null, sfx: null, noise: null, layers: [] };
function audioInit(){
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    AU.ctx = C;
    AU.master = C.createGain(); AU.master.gain.value = save.sound ? .9 : 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    AU.master.connect(comp); comp.connect(C.destination);
    AU.mus = C.createGain(); AU.mus.gain.value = .55; AU.mus.connect(AU.master);
    AU.sfx = C.createGain(); AU.sfx.gain.value = .8; AU.sfx.connect(AU.master);
    AU.jing = C.createGain(); AU.jing.gain.value = .6; AU.jing.connect(AU.master);
    const len = C.sampleRate * 1.5, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = buf;
    for (let i = 0; i < 10; i++) { const g = C.createGain(); g.gain.value = 0; g.connect(AU.mus); AU.layers.push(g); }
  } catch (e) { AU.ctx = null; }
}
function setSound(on){ save.sound = on; persist(); if (AU.master) AU.master.gain.setTargetAtTime(on ? .9 : 0, AU.ctx.currentTime, .05); }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function tone(dest, t, f, dur, type, vol, o){
  const C = AU.ctx; o = o || {};
  const os = C.createOscillator(), g = C.createGain();
  os.type = type; os.frequency.setValueAtTime(f, t);
  if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || dur));
  if (o.vib) { const l = C.createOscillator(), lg = C.createGain(); l.frequency.value = o.vib; lg.gain.value = f * .012; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + .05); }
  const a = o.att || .005;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  if (o.sus) { g.gain.setValueAtTime(vol, t + dur - .04); g.gain.linearRampToValueAtTime(0, t + dur); }
  else g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  let out = g;
  if (o.lp) { const fl = C.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = o.q || .7; g.connect(fl); out = fl; }
  os.connect(g); out.connect(dest);
  os.start(t); os.stop(t + dur + .05);
}
function noise(dest, t, dur, vol, ftype, freq, o){
  const C = AU.ctx; o = o || {};
  const s = C.createBufferSource(); s.buffer = AU.noise;
  const f = C.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = o.q || 1;
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = C.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * .5); s.stop(t + dur + .05);
}
// instruments
const INS = {
  piccolo: (d, t, m, dur) => { tone(d, t, mtof(m), dur, 'triangle', .16, { att: .015, vib: 6, sus: true }); tone(d, t, mtof(m + 12), dur, 'sine', .03, { att: .02, sus: true }); },
  snare: (d, t, v) => { noise(d, t, .13, .42 * (v || 1), 'bandpass', 2400, { q: .6 }); tone(d, t, 210, .06, 'triangle', .2 * (v || 1)); },
  click: (d, t) => { tone(d, t, 1650, .035, 'square', .07, { lp: 3000 }); tone(d, t, 820, .05, 'sine', .12); },
  cymbal: (d, t) => { noise(d, t, .6, .2, 'highpass', 6500); },
  timp: (d, t, m) => { tone(d, t, mtof(m), .55, 'sine', .45, { to: mtof(m) * .94, slide: .5 }); noise(d, t, .08, .12, 'lowpass', 500); },
  kick: (d, t) => { tone(d, t, 130, .3, 'sine', .7, { to: 42, slide: .18 }); },
  tuba: (d, t, m) => { tone(d, t, mtof(m), .26, 'sawtooth', .22, { lp: 520, att: .02, sus: true }); },
  bell: (d, t, m, v) => { const f = mtof(m); tone(d, t, f, 1.6, 'sine', .12 * (v || 1)); tone(d, t, f * 2.76, .8, 'sine', .04 * (v || 1)); tone(d, t, f * 5.4, .4, 'sine', .02 * (v || 1)); },
  synth: (d, t, m, dur) => { tone(d, t, mtof(m), dur || .12, 'square', .06, { lp: 1900 }); tone(d, t, mtof(m) * 1.006, dur || .12, 'square', .05, { lp: 1600 }); },
  trumpet: (d, t, m, dur, v) => { tone(d, t, mtof(m), dur, 'sawtooth', .2 * (v || 1), { lp: 2300, att: .02, sus: true, vib: 5 }); tone(d, t, mtof(m), dur, 'square', .05 * (v || 1), { lp: 1200, att: .02, sus: true }); },
};
// 8 bars of march in G, eighth-note grid; A then B section
const MEL = [
  67, null, 71, 74, 79, null, 74, 71, 69, null, 72, 74, 78, null, 74, 72,
  71, null, 74, 79, 83, null, 79, 74, 72, 71, 69, 66, 67, null, null, 62,
  76, null, 74, 72, 71, null, 69, 67, 69, null, 67, 66, 64, null, 62, null,
  67, null, 71, 74, 76, 74, 72, 71, 69, null, 66, 69, 67, null, null, null,
];
const BAR_ROOT = [43, 38, 43, 38, 48, 38, 43, 38];
const BAR_CHORD = [[67, 71, 74], [66, 69, 72], [67, 71, 74], [66, 69, 74], [64, 67, 72], [66, 69, 72], [67, 71, 74], [66, 69, 72]];
const MUS = { on: false, step: 0, next: 0, want: new Array(10).fill(0), timer: 0 };
const STEP = 60 / 128 / 2;
function musicStart(){
  if (!AU.ctx) return;
  MUS.on = true; MUS.step = 0; MUS.next = AU.ctx.currentTime + .08;
  AU.mus.gain.cancelScheduledValues(AU.ctx.currentTime); AU.mus.gain.setTargetAtTime(.55, AU.ctx.currentTime, .05);
}
function musicStop(fade){
  MUS.on = false;
  if (AU.ctx) AU.mus.gain.setTargetAtTime(0, AU.ctx.currentTime, fade || .05);
}
function musicLayers(alive){ for (let i = 1; i < 10; i++) MUS.want[i] = alive[i] > 0 ? 1 : 0; MUS.want[0] = 1; }
function schedStep(t, s){
  const L = AU.layers, bar = (s >> 3) % 8, b = s & 7, root = BAR_ROOT[bar], ch = BAR_CHORD[bar];
  const m = MEL[s % 64];
  if (m != null) { let len = 1; while (len < 4 && MEL[(s + len) % 64] == null) len++; INS.piccolo(L[0], t, m, STEP * len * .92); }
  if (b === 2 || b === 6 || (bar === 7 && b === 7)) INS.snare(L[1], t);
  if (bar === 7 && b >= 4) INS.snare(L[1], t + STEP / 2, .6);
  if ((b & 1) === 0) INS.click(L[2], t);
  if (b === 0 && bar % 2 === 0) INS.cymbal(L[3], t);
  if (b === 0 || b === 4) INS.timp(L[4], t, b === 0 ? root : root + 7);
  if (b === 0 || b === 4 || (b === 7 && bar % 2)) INS.kick(L[5], t);
  if (b === 0) INS.tuba(L[6], t, root); if (b === 4) INS.tuba(L[6], t, root + 7);
  if (b === 3) INS.tuba(L[6], t, root + 4);
  if (b === 0 && bar % 2 === 0) INS.bell(L[7], t, ch[2] + 12, 1);
  if (b === 4 && bar % 2 === 1) INS.bell(L[7], t, ch[0] + 12, .8);
  if (b === 2 || b === 6) for (const n of ch) INS.synth(L[8], t, n, .1);
  INS.bell(L[9], t, ch[(b + (bar & 1)) % 3] + 24, .45);
  if (b === 0) INS.synth(L[9], t, root + 12, STEP * 3);
}
function musicTick(){
  if (!AU.ctx) return;
  const now = AU.ctx.currentTime;
  for (let i = 0; i < 10; i++) {
    const g = AU.layers[i].gain; const w = MUS.want[i] * (i === 0 ? 1 : .85);
    if (Math.abs(g.value - w) > .01) g.setTargetAtTime(w, now, .4);
  }
  if (!MUS.on) return;
  if (MUS.next < now - .3) MUS.next = now + .05;
  while (MUS.next < now + .14) { schedStep(MUS.next, MUS.step); MUS.next += STEP; MUS.step++; }
}
setInterval(musicTick, 30);
function jingle(name){
  if (!AU.ctx) return;
  const d = AU.jing, t = AU.ctx.currentTime + .03, T = INS.trumpet;
  const seq = (notes, ins) => { let tt = t; for (const [m, len, v] of notes) { if (m) (ins || T)(d, tt, m, len * .95, v); tt += len; } return tt; };
  if (name === 'start') {
    const e = seq([[67, .14], [67, .14], [67, .14], [72, .42], [null, .06], [71, .14], [72, .14], [76, .7]]);
    for (let i = 0; i < 6; i++) INS.snare(d, t + i * .07, .5); INS.cymbal(d, e - .7);
    seq([[60, .42], [null, .06], [64, .42], [null, .06], [67, .7]].map(([m, l]) => [m && m - 12, l]), T);
  } else if (name === 'kill') {
    seq([[72, .09, .8], [79, .22, .8]]);
  } else if (name === 'death') {
    seq([[72, .2], [71, .2], [70, .2], [69, .7]]);
    seq([[60, .2], [59, .2], [58, .2], [57, .7]].map(([m, l]) => [m - 12, l]));
  } else if (name === 'clear') {
    seq([[67, .12], [72, .12], [76, .12], [79, .3], [76, .12], [79, .75]]);
    seq([[55, .36], [60, .3], [64, .12], [67, .75]].map(([m, l]) => [m - 12, l]));
    INS.cymbal(d, t + .66); INS.kick(d, t + .66);
  } else if (name === 'life') {
    [72, 76, 79, 84, 88, 91].forEach((m, i) => INS.bell(d, t + i * .08, m, 1.4));
    seq([[null, .5], [79, .15], [84, .5]]);
  } else if (name === 'over') {
    seq([[67, .32], [66, .32], [65, .32], [64, 1.1]]);
    seq([[55, .32], [54, .32], [53, .32], [48, 1.1]]);
  } else if (name === 'medal') {
    seq([[72, .1], [76, .1], [79, .1], [84, .1], [79, .1], [84, .6]]);
    [84, 88, 91, 96].forEach((m, i) => INS.bell(d, t + .6 + i * .1, m, 1.2));
  }
}
const sfxLast = {};
function sfx(name, vol){
  if (!AU.ctx) return;
  const C = AU.ctx, t = C.currentTime, d = AU.sfx; vol = vol == null ? 1 : vol;
  if (sfxLast[name] && t - sfxLast[name] < .03) return; sfxLast[name] = t;
  switch (name) {
    case 'fire': tone(d, t, 520, .09, 'square', .14 * vol, { to: 180, lp: 2200 }); noise(d, t, .09, .3 * vol, 'bandpass', 1400, { to: 400 }); break;
    case 'rocket': noise(d, t, .35, .35 * vol, 'bandpass', 900, { to: 3000, q: 2 }); tone(d, t, 300, .2, 'sawtooth', .08 * vol, { to: 900, lp: 1600 }); break;
    case 'ric': tone(d, t, 1900 + Math.random() * 500, .12, 'sine', .14 * vol, { to: 1200 }); tone(d, t, 3800, .05, 'triangle', .05 * vol); break;
    case 'fizz': noise(d, t, .12, .2 * vol, 'highpass', 2500); break;
    case 'clink': tone(d, t, 2600, .1, 'triangle', .14 * vol, { to: 1800 }); noise(d, t, .08, .2 * vol, 'highpass', 3000); break;
    case 'mine': tone(d, t, 300, .08, 'square', .1 * vol, { lp: 900 }); tone(d, t + .08, 200, .1, 'square', .1 * vol, { lp: 700 }); break;
    case 'beep': tone(d, t, 1320, .06, 'square', .05 * vol, { lp: 2500 }); break;
    case 'boom': noise(d, t, 1.1, .9 * vol, 'lowpass', 1600, { to: 120 }); tone(d, t, 110, .7, 'sine', .7 * vol, { to: 35 }); break;
    case 'tankboom': noise(d, t, .8, .75 * vol, 'lowpass', 2400, { to: 160 }); tone(d, t, 160, .45, 'triangle', .45 * vol, { to: 40 }); noise(d, t + .05, .3, .3 * vol, 'bandpass', 3000); break;
    case 'cork': noise(d, t, .25, .35 * vol, 'bandpass', 700, { q: .8 }); break;
    case 'puff': noise(d, t, .5, .25 * vol, 'lowpass', 1200, { to: 300 }); break;
    case 'ui': tone(d, t, 880, .06, 'triangle', .12 * vol); break;
  }
}

/* Quest-Engine: Overlays + automatische Zähler auf Basis der Tracker-Spuren */
(function () {
'use strict';
const M = () => window.PoiMirror, T = () => window.SkillTree;
let node = null, qi = 0, rt = {};

/* HUD */
const app = document.getElementById('app-container');
const hud = document.createElement('div'); hud.id = 'quest-hud';
hud.innerHTML = '<div class="qt"></div><div class="qb"><i></i></div><div class="qr"><span class="qc"></span><button data-a="prev">◀</button><button data-a="next">▶</button><button data-a="plus">+1</button><button data-a="tree">🌳</button></div>';
app.appendChild(hud);
const treeBtn = document.createElement('button'); treeBtn.id = 'tree-btn'; treeBtn.textContent = '🌳'; treeBtn.setAttribute('aria-label', 'Lernbaum');
app.appendChild(treeBtn);
treeBtn.onclick = () => { stop(false); T().show(); };
hud.onclick = e => {
  const a = e.target.dataset && e.target.dataset.a; if (!a || !node) return;
  if (a === 'tree') { stop(false); T().show(); return; }
  if (a === 'prev' || a === 'next') { qi = (qi + (a === 'next' ? 1 : node.q.length - 1)) % node.q.length; resetRt(); renderHud(); return; }
  const q = node.q[qi]; credit(T().add(node.id, q.id, q.u === 's' ? 5 : 1)); renderHud();
};
const q$ = () => node.q[qi];
function renderHud() {
  const q = q$(), v = T().val(node.id, q.id);
  hud.querySelector('.qt').textContent = node.i + ' ' + node.t + ' · ' + (qi + 1) + '/' + node.q.length + ': ' + q.x;
  const bar = hud.querySelector('.qb'); bar.classList.toggle('ok', v >= q.n);
  bar.firstChild.style.width = (v / q.n * 100) + '%';
  hud.querySelector('.qc').textContent = v + ' / ' + q.n + ' ' + q.u;
}
function credit(justMastered) {
  const q = q$();
  if (justMastered) M().toast('🎉 Skill gemeistert: ' + node.t);
  else if (T().val(node.id, q.id) >= q.n && !rt.done) { rt.done = true; M().toast('✅ Quest geschafft'); }
}

function start(id) {
  node = T().BY[id]; qi = node.q.findIndex(q => T().val(id, q.id) < q.n); if (qi < 0) qi = 0;
  const o = node.ov, m = M();
  m.setGrid(o.t === 'grid' ? o.g : 'none');
  m.setMetronome(!!o.bpm, o.bpm);
  T().hide(); m.start(); resetRt(); renderHud(); hud.classList.add('on');
}
function stop(keepOverlay) {
  if (node && !keepOverlay) { M().setMetronome(false); M().setGrid('none'); }
  node = null; hud.classList.remove('on');
}
function resetRt() { rt = { rev: [{}, {}], osc: [{}, {}], run: 0, lastOk: 0, last: 0, cross: {}, done: false }; }

/* Detektoren */
function revStep(r, p, cx, cy, base, minR, jit) {
  if (!p) { r.a = null; return 0; }
  const rad = Math.hypot(p.x - cx, p.y - cy) / base, a = Math.atan2(p.y - cy, p.x - cx);
  if (r.a == null) { r.a = a; r.acc = 0; r.rad = []; return 0; }
  let d = a - r.a; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  r.a = a; r.acc += d; r.rad.push(rad);
  if (r.rad.length > 400) { r.acc = 0; r.rad = []; }
  if (Math.abs(r.acc) < 2 * Math.PI) return 0;
  const mean = r.rad.reduce((s, v) => s + v, 0) / r.rad.length;
  const sd = Math.sqrt(r.rad.reduce((s, v) => s + (v - mean) ** 2, 0) / r.rad.length);
  r.acc = 0; r.rad = [];
  return mean >= minR && sd / mean <= jit ? 1 : 0;
}
function oscStep(o, y, A) {
  if (y == null) { o.ext = null; return 0; }
  if (o.ext == null) { o.ext = y; o.dir = 1; o.bot = null; return 0; }
  const h = A * 0.35;
  if (o.dir === 1) {
    if (y > o.ext) o.ext = y; else if (o.ext - y > h) { o.bot = o.ext; o.dir = -1; o.ext = y; }
  } else {
    if (y < o.ext) o.ext = y;
    else if (y - o.ext > h) { const top = o.ext; o.dir = 1; o.ext = y; if (o.bot != null && o.bot - top >= A) return 1; }
  }
  return 0;
}
function frame(now) {
  if (!node) return;
  const m = M(), { W, H } = m.size(), S = m.state, tr = m.tracks;
  const cx = W * S.centerPin.x, cy = H * S.centerPin.y, base = Math.min(W, H);
  const head = tr.map(t => (t.last && now - t.lastSeen < 150 ? t.last : null));
  const q = q$(), nid = node.id, dt = rt.last ? Math.min(100, now - rt.last) : 0; rt.last = now;
  let gain = 0, just = false;
  const tracks = q.tr == null ? [0, 1] : [q.tr];
  if (q.m === 'revolutions') {
    const mr = (node.ov.r || 0.3) * 0.4;
    tracks.forEach(i => { gain += revStep(rt.rev[i], head[i], cx, cy, base, mr, 0.3); });
    if (gain) just = T().add(nid, q.id, gain);
  } else if (q.m === 'oscillation') {
    tracks.forEach(i => { gain += oscStep(rt.osc[i], head[i] ? head[i].y : null, base * 0.15); });
    if (gain) just = T().add(nid, q.id, gain);
  } else if (q.m === 'beatSync') {
    const p = head[tracks[0]], o = rt.cross;
    if (p && head[0] && head[1]) {
      const s = p.x - cx > base * 0.03 ? 1 : p.x - cx < -base * 0.03 ? -1 : 0;
      if (s && o.s && s !== o.s) { o.n = (o.n || 0) + 1; if (o.n % 2 === 0) { gain = 1; just = T().add(nid, q.id, 1); } }
      if (s) o.s = s;
    } else { o.s = 0; o.n = 0; }
  } else if (q.m === 'cleanTime') {
    const need = q.need || 1, ok = tr.filter((t, i) => head[i] && Math.hypot(t.vx || 0, t.vy || 0) * 1000 > base * 0.5).length >= need;
    if (ok) { rt.lastOk = now; rt.run += dt / 1000; }
    else if (now - rt.lastOk > 600) rt.run = 0;
    const sec = Math.floor(rt.run);
    if (sec > T().val(nid, q.id)) { just = T().setMax(nid, q.id, sec); gain = 1; }
  } else return;
  if (gain) { credit(just); renderHud(); }
}

/* Overlay-Zeichnung (Kreis-Guide, Achsen) */
function draw(ctx, g) {
  if (!node) return;
  const o = node.ov, base = Math.min(g.W, g.H);
  ctx.save();
  if (o.t === 'circle') {
    const r = o.r * base;
    ctx.strokeStyle = 'rgba(34,197,94,.18)'; ctx.lineWidth = Math.max(2, 2 * o.tol * r);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, 7); ctx.stroke();
    ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(34,197,94,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, 7); ctx.stroke();
  } else if (o.t === 'axis') {
    if (o.z) { ctx.fillStyle = 'rgba(56,189,248,.06)'; ctx.fillRect(0, 0, g.cx, g.H); ctx.fillStyle = 'rgba(244,63,94,.06)'; ctx.fillRect(g.cx, 0, g.W - g.cx, g.H); }
    ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(250,204,21,.85)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (o.o !== 'horizontal') { ctx.moveTo(g.cx, 0); ctx.lineTo(g.cx, g.H); }
    if (o.o !== 'vertical') { ctx.moveTo(0, g.cy); ctx.lineTo(g.W, g.cy); }
    ctx.stroke();
  }
  ctx.restore();
}
window.Quest = { start, stop, frame, draw };
})();

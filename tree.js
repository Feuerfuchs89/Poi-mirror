/* Lernbaum: Daten, Fortschritt (localStorage) und Baum-UI */
(function () {
'use strict';
const OV = {pin:'Mittelpunkt',grid:'Raster',circle:'Kreis-Guide',axis:'Achsen-Guide'};
const DET = {manual:'manuell',revolutions:'Auto: Umläufe',oscillation:'Auto: Zyklen',beatSync:'Auto: Takt-Zyklen',cleanTime:'Auto: Aktivzeit'};
/* Quest-Felder: x Text, n Ziel, u Einheit, m Detektor, tr Track (0 = links im Bild, 1 = rechts), need Anzahl sichtbarer Poi */
const LEVELS = [
 {id:'L1',title:'Level 1 · Grundlagen & Haltung',sub:'Stand, Griff, Takt und die erste saubere Ebene.',nodes:[
  {id:'l1-stance-grip',t:'Stand & Griff',i:'🧍',req:[],ov:{t:'pin'},d:'Schulterbreiter Stand, Ellbogen locker, Schlaufe am Mittelfinger. Stelle den Pin auf dein Brustbein und prüfe im Spiegel, dass du mittig stehst.',q:[{id:'q1',x:'60 Sekunden mittig stehen, Poi ruhig hängen lassen',n:1,u:'✓',m:'manual'}]},
  {id:'l1-beat',t:'Takt fühlen',i:'🥁',req:['l1-stance-grip'],ov:{t:'grid',g:'4way',bpm:60},d:'Metronom an, Poi im Takt schwingen: ein Beat = ein Viertelkreis. Start bei 60 BPM.',q:[{id:'q1',x:'60 Sekunden im Takt bei 60 BPM',n:60,u:'s',m:'cleanTime',need:1}]},
  {id:'l1-wall-single',t:'Wall-Plane, ein Poi',i:'⭕',req:['l1-stance-grip'],ov:{t:'circle',r:0.3,tol:0.2},d:'Ein Poi kreist frontal vor dir wie auf einer Wand. Halte den Kreis rund und um den Pin zentriert.',q:[{id:'q1',x:'50 saubere Kreise, rechte Hand',n:50,u:'x',m:'revolutions',tr:1},{id:'q2',x:'50 saubere Kreise, linke Hand',n:50,u:'x',m:'revolutions',tr:0}]},
  {id:'l1-wheel-single',t:'Wheel-Plane, ein Poi',i:'🎡',req:['l1-stance-grip'],ov:{t:'axis',o:'vertical'},d:'Seitliche Ebene. Von vorn siehst du eine senkrechte Linie. Das Poi pendelt sauber auf der Achse.',q:[{id:'q1',x:'50 Umläufe, rechte Hand',n:50,u:'x',m:'oscillation',tr:1},{id:'q2',x:'50 Umläufe, linke Hand',n:50,u:'x',m:'oscillation',tr:0}]},
  {id:'l1-both-wall',t:'Beide Poi, Wall-Plane',i:'👐',req:['l1-wall-single','l1-wheel-single'],ov:{t:'circle',r:0.3,tol:0.2},d:'Beide Poi kreisen gleichzeitig in der Wall-Plane, gleiche Richtung. Zwei saubere Kreise nebeneinander.',q:[{id:'q1',x:'30 Sekunden beide Poi sauber im Kreis',n:30,u:'s',m:'cleanTime',need:2}]}]},
 {id:'L2',title:'Level 2 · Weaves & Planes',sub:'Timing zwischen den Händen und Ebenenwechsel.',nodes:[
  {id:'l2-same-time',t:'Same-Time',i:'🪞',req:['l1-both-wall'],ov:{t:'axis',o:'both',z:true,bpm:70},d:'Beide Poi erreichen dieselbe Position im selben Moment. Die Achse zeigt dir die Symmetrie. (Auch „Straight Time“.)',q:[{id:'q1',x:'30 Sekunden Same-Time ohne Abweichung',n:30,u:'s',m:'cleanTime',need:2}]},
  {id:'l2-split-time',t:'Split-Time',i:'↔️',req:['l2-same-time'],ov:{t:'axis',o:'both',z:true,bpm:70},d:'Die Poi sind einen halben Takt versetzt: ist eins oben, ist das andere unten. Grundmuster für Weaves.',q:[{id:'q1',x:'30 Sekunden Split-Time sauber',n:30,u:'s',m:'cleanTime',need:2}]},
  {id:'l2-weave-2',t:'2-Beat-Weave',i:'🧶',req:['l2-split-time'],ov:{t:'grid',g:'4way',bpm:80},d:'Das Poi kreuzt abwechselnd vor dem Körper die Mittellinie, zwei Beats pro Zyklus, in Split-Time.',q:[{id:'q1',x:'30 Sekunden fehlerfreier 2-Beat-Weave',n:30,u:'s',m:'cleanTime',need:2},{id:'q2',x:'20 Weave-Zyklen am Stück',n:20,u:'x',m:'beatSync',tr:0}]},
  {id:'l2-plane-switch',t:'Plane-Wechsel',i:'🔀',req:['l1-both-wall','l1-wheel-single'],ov:{t:'axis',o:'both'},d:'Fließend zwischen Wall- und Wheel-Plane wechseln, ohne den Rhythmus zu verlieren. Wechsel am höchsten Punkt.',q:[{id:'q1',x:'10 saubere Wechsel Wall ↔ Wheel',n:10,u:'x',m:'manual'}]},
  {id:'l2-weave-4',t:'4-Beat-Weave',i:'🕸️',req:['l2-weave-2','l2-plane-switch'],ov:{t:'grid',g:'8way',bpm:70},d:'Wie 2-Beat, aber vier Beats pro Zyklus: größeres Muster, mehr Kontrolle über die Mitte.',q:[{id:'q1',x:'30 Sekunden fehlerfreier 4-Beat-Weave',n:30,u:'s',m:'cleanTime',need:2}]}]}
];
const ALL = LEVELS.flatMap(l => l.nodes), BY = Object.fromEntries(ALL.map(n => [n.id, n]));
const KEY = 'poiTree.v1';
let S = {q:{}, days:[]};
try { const r = localStorage.getItem(KEY); if (r) S = Object.assign(S, JSON.parse(r)); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const day = d => d.toISOString().slice(0, 10);
const val = (nid, qid) => (S.q[nid] && S.q[nid][qid]) || 0;
const mastered = n => n.q.every(q => val(n.id, q.id) >= q.n);
const started = n => n.q.some(q => val(n.id, q.id) > 0);
function status(n) {
  if (n.req.some(r => !mastered(BY[r]))) return 'locked';
  return mastered(n) ? 'done' : started(n) ? 'prog' : 'open';
}
function streak() {
  let c = 0, d = new Date();
  if (!S.days.includes(day(d))) d.setDate(d.getDate() - 1);
  while (S.days.includes(day(d))) { c++; d.setDate(d.getDate() - 1); }
  return c;
}
/* Fortschritt setzen; gibt true zurück, wenn der Skill dadurch gemeistert wurde */
function setVal(nid, qid, v) {
  const n = BY[nid], q = n.q.find(x => x.id === qid), was = mastered(n);
  S.q[nid] = S.q[nid] || {};
  const old = S.q[nid][qid] || 0;
  S.q[nid][qid] = Math.max(0, Math.min(q.n, v));
  if (S.q[nid][qid] > old) { const t = day(new Date()); if (!S.days.includes(t)) S.days.push(t); }
  save();
  return !was && mastered(n);
}
const add = (nid, qid, d) => setVal(nid, qid, val(nid, qid) + d);
const setMax = (nid, qid, v) => (v > val(nid, qid) ? setVal(nid, qid, v) : false);

/* ---------- UI ---------- */
const scr = document.getElementById('tree-screen');
scr.innerHTML = '<header><div class="row"><h1>🌀 Poi Lernbaum</h1><div class="streak" id="t-streak"></div></div><div class="bar"><i id="t-total"></i></div><button class="free" id="t-free">📷 Freier Spiegel ohne Quest</button></header><main id="t-main"></main>';
const veil = document.createElement('div'); veil.id = 'tree-veil';
const sheet = document.createElement('section'); sheet.id = 'tree-sheet';
const app = document.getElementById('app-container');
app.append(veil, sheet);
const main = document.getElementById('t-main');
let cur = null;

function renderTree() {
  const done = ALL.filter(mastered).length;
  document.getElementById('t-total').style.width = (done / ALL.length * 100) + '%';
  document.getElementById('t-streak').textContent = '🔥 ' + streak() + ' · ' + done + '/' + ALL.length;
  main.innerHTML = '';
  LEVELS.forEach(l => {
    const h = document.createElement('div'); h.className = 'lvl';
    h.innerHTML = '<b></b><span></span>'; h.firstChild.textContent = l.title; h.lastChild.textContent = l.sub;
    const p = document.createElement('div'); p.className = 'path';
    l.nodes.forEach((n, i) => {
      const st = status(n), b = document.createElement('button');
      b.className = 'node ' + (st === 'locked' ? 'locked' : st);
      b.style.transform = 'translateX(' + Math.round(Math.sin(i * 1.3) * 64) + 'px)';
      b.innerHTML = '<span class="dot"></span><small></small>';
      b.querySelector('.dot').textContent = st === 'locked' ? '🔒' : st === 'done' ? '✅' : n.i;
      b.querySelector('small').textContent = n.t;
      if (st === 'prog') {
        const s = n.q.reduce((a, q) => a + Math.min(val(n.id, q.id), q.n), 0), t = n.q.reduce((a, q) => a + q.n, 0);
        const g = document.createElement('span'); g.className = 'badge'; g.textContent = Math.round(s / t * 100) + '%'; b.appendChild(g);
      }
      b.onclick = () => openSheet(n.id);
      p.appendChild(b);
    });
    main.append(h, p);
  });
}
function openSheet(id) { cur = id; renderSheet(); sheet.classList.add('on'); veil.classList.add('on'); }
function closeSheet() { cur = null; sheet.classList.remove('on'); veil.classList.remove('on'); }
veil.onclick = closeSheet;

function renderSheet() {
  if (!cur) return;
  const n = BY[cur], st = status(n);
  sheet.innerHTML = '';
  const el = (tag, txt, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; (parent || sheet).appendChild(e); return e; };
  el('h2', n.i + ' ' + n.t);
  el('p', n.d);
  const chips = el('div', null, 'chips');
  [OV[n.ov.t] + '-Overlay', ...new Set(n.q.map(q => DET[q.m]))].forEach(t => el('span', t, 'chip', chips));
  if (st === 'locked') el('p', '🔒 Gesperrt. Meistere zuerst: ' + n.req.filter(r => !mastered(BY[r])).map(r => BY[r].t).join(', '), 'hint');
  n.q.forEach(q => {
    const v = val(n.id, q.id), box = el('div', null, 'q' + (v >= q.n ? ' ok' : ''));
    const row = el('div', null, 'row', box); el('p', q.x, null, row);
    const stp = el('div', null, 'step', row);
    const mk = (l, d) => { const b = el('button', l, null, stp); b.disabled = st === 'locked'; b.setAttribute('aria-label', d > 0 ? 'plus' : 'minus'); b.onclick = () => { add(n.id, q.id, d * (q.u === 's' ? 5 : 1)); renderSheet(); renderTree(); }; };
    mk('−', -1); el('b', v + '/' + q.n + ' ' + q.u, null, stp); mk('+', 1);
    const bar = el('div', null, 'bar', box); bar.innerHTML = '<i></i>'; bar.firstChild.style.width = (v / q.n * 100) + '%';
  });
  const go = el('button', '📷 In den Spiegel', 'cta'); go.disabled = st === 'locked';
  go.onclick = () => { closeSheet(); window.Quest.start(n.id); };
  const rs = el('button', 'Fortschritt dieses Skills zurücksetzen', 'link');
  rs.onclick = () => { delete S.q[n.id]; save(); renderSheet(); renderTree(); };
}
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.getElementById('t-free').onclick = () => { window.Quest.stop(true); hide(); window.PoiMirror.start(); };

function show() { renderTree(); scr.classList.remove('hide'); document.getElementById('tree-btn').style.display = 'none'; }
function hide() { closeSheet(); scr.classList.add('hide'); document.getElementById('tree-btn').style.display = ''; }
window.SkillTree = { BY, ALL, val, setVal, add, setMax, mastered, show, hide, OV };
renderTree();
})();

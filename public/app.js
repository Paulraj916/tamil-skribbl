/* வரைந்து கண்டுபிடி! client */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const t = (k, v) => I18N.t(k, v);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- identity ----------
let pid = sessionStorage.getItem('ts_pid');
if (!pid) { pid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); sessionStorage.setItem('ts_pid', pid); }
let avatar = JSON.parse(localStorage.getItem('ts_avatar') || 'null') || Avatar.random();
const nameInput = $('#nameInput');
nameInput.value = localStorage.getItem('ts_name') || '';

const socket = io({ transports: ['websocket', 'polling'] });
let S = null;            // latest state
let roomCode = null;     // joined room
let prevPhase = null, prevRound = 0, prevDrawer = null, lastTickSec = -1;

// ---------- logo ----------
(function logo() {
  const word = 'வரைந்து கண்டுபிடி!';
  const cols = ['#ff5252', '#ffab00', '#69f0ae', '#40c4ff', '#ea80fc', '#ffd740', '#ff6e40', '#b2ff59'];
  const g = [...new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(word)].map(x => x.segment);
  $('#logo').innerHTML = '<span class="lw">' + g.map((c, i) => c === ' ' ? '</span><span class="sp"> </span><span class="lw">' : `<span style="color:${cols[i % cols.length]};animation-delay:${i * 0.08}s">${c}</span>`).join('') + '</span>';
})();

// ---------- home / avatar ----------
function renderAvatarMaker() {
  $('#avatarPreview').innerHTML = Avatar.svg(avatar, 120);
  $('#avatarColors').innerHTML = Avatar.COLORS.map((c, i) => `<button class="am-color ${i === avatar.color ? 'sel' : ''}" data-color="${i}" style="background:${c}" aria-label="colour ${i + 1}"></button>`).join('');
  localStorage.setItem('ts_avatar', JSON.stringify(avatar));
}
document.addEventListener('click', e => {
  const a = e.target.closest('.am-arrow');
  if (a) { const k = a.dataset.av; avatar[k] = (avatar[k] + (+a.dataset.d) + Avatar.N[k]) % Avatar.N[k]; renderAvatarMaker(); Sound.play('pop'); }
  const c = e.target.closest('.am-color');
  if (c) { avatar.color = +c.dataset.color; renderAvatarMaker(); }
});
$('#avatarRandom').onclick = () => { avatar = Avatar.random(); renderAvatarMaker(); Sound.play('pop'); };
renderAvatarMaker();

const inviteCode = (new URLSearchParams(location.search).get('room') || location.hash.replace('#', '') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
if (inviteCode) { $('#codeInput').value = inviteCode; }
function refreshHomeTexts() {
  const jb = $('#joinInviteBtn');
  if (inviteCode) { jb.hidden = false; jb.textContent = t('joinInvite', { code: inviteCode }); }
  fetch('/api/meta').then(r => r.json()).then(m => { $('#wordCountNote').textContent = t('wordsNote', { n: m.words, c: m.categories.length }); }).catch(() => {});
}

function getName() { const n = nameInput.value.trim(); localStorage.setItem('ts_name', n); return n; }
function homeError(k) { $('#homeError').textContent = k ? t(k) : ''; }
function enterRoom(code) {
  roomCode = code;
  sessionStorage.setItem('ts_room', code);
  history.replaceState(null, '', '?room=' + code);
  $('#home').classList.remove('active'); $('#game').classList.add('active');
  $('#chatLog').innerHTML = '';
  fitCanvas();
}
$('#createBtn').onclick = () => {
  Sound.unlock(); homeError();
  socket.emit('room:create', { name: getName(), avatar, pid }, res => { if (res.ok) enterRoom(res.code); });
};
function join(code) {
  Sound.unlock(); homeError();
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return;
  socket.emit('room:join', { code, name: getName(), avatar, pid }, res => { if (res.ok) enterRoom(res.code); else homeError(res.error); });
}
$('#joinBtn').onclick = () => join($('#codeInput').value);
$('#joinInviteBtn').onclick = () => join(inviteCode);
$('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') join(e.target.value); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') (inviteCode ? join(inviteCode) : $('#createBtn').click()); });

socket.on('connect', () => {
  // auto rejoin after network blips / reloads
  const rc = roomCode || (sessionStorage.getItem('ts_room') === inviteCode ? inviteCode : null);
  if (rc) socket.emit('room:join', { code: rc, name: getName(), avatar, pid }, res => {
    if (res.ok) { if (!roomCode) enterRoom(res.code); }
    else if (roomCode) { goHome(); homeError(res.error); }
  });
});
function goHome() {
  roomCode = null; S = null; sessionStorage.removeItem('ts_room');
  history.replaceState(null, '', location.pathname);
  $('#game').classList.remove('active'); $('#home').classList.add('active');
}

// ---------- global buttons ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a === 'lang') { I18N.toggle(); refreshHomeTexts(); if (S) render(); }
  if (a === 'sound') { Sound.toggle(); updateSoundBtn(); }
  if (a === 'leave') { if (confirm(t('leave'))) { socket.emit('room:leave'); goHome(); } }
});
function updateSoundBtn() { $('#soundBtn').textContent = Sound.enabled ? '🔊' : '🔇'; }
updateSoundBtn();

// ---------- canvas ----------
const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const CW = 800, CH = 600;
function clearCanvas() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, CW, CH); }
clearCanvas();

// Incremental smooth stroke renderer shared by local and remote drawing.
function StrokeRenderer(c, w) { this.c = c; this.w = w; this.pts = []; }
StrokeRenderer.prototype.add = function (p) {
  const pts = this.pts; pts.push(p);
  ctx.strokeStyle = this.c; ctx.fillStyle = this.c; ctx.lineWidth = this.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const n = pts.length;
  if (n === 1) { ctx.beginPath(); ctx.arc(p[0], p[1], this.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  if (n === 2) { ctx.moveTo(pts[0][0], pts[0][1]); const m = mid(pts[0], pts[1]); ctx.lineTo(m[0], m[1]); }
  else { const m1 = mid(pts[n - 3], pts[n - 2]), m2 = mid(pts[n - 2], pts[n - 1]); ctx.moveTo(m1[0], m1[1]); ctx.quadraticCurveTo(pts[n - 2][0], pts[n - 2][1], m2[0], m2[1]); }
  ctx.stroke();
};
StrokeRenderer.prototype.finish = function () {
  const pts = this.pts, n = pts.length; if (n < 2) return;
  const m = [(pts[n - 2][0] + pts[n - 1][0]) / 2, (pts[n - 2][1] + pts[n - 1][1]) / 2];
  ctx.strokeStyle = this.c; ctx.lineWidth = this.w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.lineTo(pts[n - 1][0], pts[n - 1][1]); ctx.stroke();
};

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function floodFill(x, y, hex) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= CW || y >= CH) return;
  const img = ctx.getImageData(0, 0, CW, CH), d = img.data;
  const [r, g, b] = hexToRgb(hex);
  const i0 = (y * CW + x) * 4;
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
  if (Math.abs(tr - r) < 3 && Math.abs(tg - g) < 3 && Math.abs(tb - b) < 3) return;
  const tol = 48;
  const match = i => Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol && Math.abs(d[i + 2] - tb) <= tol;
  const seen = new Uint8Array(CW * CH);
  const stack = [x, y];
  while (stack.length) {
    let cy = stack.pop(), cx = stack.pop();
    let idx = cy * CW + cx;
    while (cx >= 0 && !seen[idx] && match(idx * 4)) { cx--; idx--; }
    cx++; idx++;
    let up = false, down = false;
    while (cx < CW && !seen[idx] && match(idx * 4)) {
      seen[idx] = 1;
      if (cy > 0) { const u = idx - CW; if (!seen[u] && match(u * 4)) { if (!up) { stack.push(cx, cy - 1); up = true; } } else up = false; }
      if (cy < CH - 1) { const dn = idx + CW; if (!seen[dn] && match(dn * 4)) { if (!down) { stack.push(cx, cy + 1); down = true; } } else down = false; }
      cx++; idx++;
    }
  }
  // paint filled pixels, plus a 1px fringe to cover anti-aliased edges
  for (let p = 0; p < seen.length; p++) {
    if (!seen[p]) continue;
    const px = p % CW;
    const targets = [p];
    if (px > 0 && !seen[p - 1]) targets.push(p - 1);
    if (px < CW - 1 && !seen[p + 1]) targets.push(p + 1);
    if (p >= CW && !seen[p - CW]) targets.push(p - CW);
    if (p < seen.length - CW && !seen[p + CW]) targets.push(p + CW);
    for (const q of targets) { const k = q * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
}

let remoteStroke = null;
function applyOp(op) {
  if (op.t === 's') { remoteStroke = new StrokeRenderer(op.c, op.w); remoteStroke.add(op.p); }
  else if (op.t === 'p') { if (remoteStroke) op.p.forEach(p => remoteStroke.add(p)); }
  else if (op.t === 'e') { if (remoteStroke) remoteStroke.finish(); remoteStroke = null; }
  else if (op.t === 'f') floodFill(op.p[0], op.p[1], op.c);
  else if (op.t === 'c') clearCanvas();
}
function replay(actions) {
  clearCanvas(); remoteStroke = null;
  for (const a of actions) {
    if (a.t === 's') { const r = new StrokeRenderer(a.c, a.w); a.p.forEach(p => r.add(p)); r.finish(); }
    else applyOp(a);
  }
}
socket.on('canvas:op', applyOp);
socket.on('canvas:sync', replay);

// drawing input
const PALETTE = ['#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
                 '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d'];
const SIZES = [4, 8, 14, 24, 40];
const tool = { mode: 'pen', color: '#000000', size: 8 };
function buildToolbar() {
  $('#palette').innerHTML = PALETTE.map(c => `<button class="swatch" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
  $('#sizes').innerHTML = SIZES.map(s => `<button class="size" data-s="${s}" title="${s}px"><span style="width:${Math.min(28, s * 0.7 + 3)}px;height:${Math.min(28, s * 0.7 + 3)}px"></span></button>`).join('');
  updateToolUI();
}
function updateToolUI() {
  $$('.swatch').forEach(b => b.classList.toggle('sel', b.dataset.c === tool.color));
  $$('.size').forEach(b => b.classList.toggle('sel', +b.dataset.s === tool.size));
  $$('.tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool.mode));
  $('#tbCurrentDot').style.background = tool.mode === 'eraser' ? '#fff' : tool.color;
  $('#sizeSlider').value = tool.size;
  updateCursor();
}
function updateCursor() {
  if (!amDrawing()) { canvas.style.cursor = 'default'; return; }
  if (tool.mode === 'fill') { canvas.style.cursor = 'crosshair'; return; }
  const scale = canvas.getBoundingClientRect().width / CW || 1;
  const d = Math.max(4, Math.min(120, Math.round(tool.size * scale)));
  const col = tool.mode === 'eraser' ? '#ffffff' : tool.color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d + 4}" height="${d + 4}"><circle cx="${d / 2 + 2}" cy="${d / 2 + 2}" r="${d / 2}" fill="${col}" fill-opacity="0.5" stroke="black" stroke-width="1"/></svg>`;
  canvas.style.cursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${d / 2 + 2} ${d / 2 + 2}, crosshair`;
}
document.addEventListener('click', e => {
  const sw = e.target.closest('.swatch'); if (sw) { tool.color = sw.dataset.c; if (tool.mode === 'eraser') tool.mode = 'pen'; updateToolUI(); }
  const sz = e.target.closest('.size'); if (sz) { tool.size = +sz.dataset.s; updateToolUI(); }
  const tl = e.target.closest('.tool'); if (tl) {
    if (tl.dataset.tool) { tool.mode = tl.dataset.tool; updateToolUI(); }
    if (tl.dataset.act === 'undo') socket.emit('draw:undo');
    if (tl.dataset.act === 'clear') { clearCanvas(); socket.emit('draw:clear'); }
  }
});
$('#customColor').addEventListener('input', e => { tool.color = e.target.value; if (tool.mode === 'eraser') tool.mode = 'pen'; updateToolUI(); });
$('#sizeSlider').addEventListener('input', e => { tool.size = +e.target.value; updateToolUI(); });
document.addEventListener('keydown', e => {
  if (!amDrawing() || document.activeElement === $('#chatInput')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); socket.emit('draw:undo'); return; }
  const k = e.key.toLowerCase();
  if (k === 'b' || k === 'p') { tool.mode = 'pen'; updateToolUI(); }
  if (k === 'e') { tool.mode = 'eraser'; updateToolUI(); }
  if (k === 'f') { tool.mode = 'fill'; updateToolUI(); }
});
buildToolbar();

function amDrawing() { return S && S.phase === 'drawing' && S.drawerId === S.you; }
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.round((e.clientX - r.left) / r.width * CW * 10) / 10, Math.round((e.clientY - r.top) / r.height * CH * 10) / 10];
}
let localStroke = null, pending = [], flushTimer = null, activePointer = null;
function flush() { if (pending.length) { socket.emit('draw:pts', { p: pending }); pending = []; } flushTimer = null; }
canvas.addEventListener('pointerdown', e => {
  if (!amDrawing() || activePointer !== null) return;
  e.preventDefault();
  const p = canvasPoint(e);
  if (tool.mode === 'fill') { floodFill(p[0], p[1], tool.color); socket.emit('draw:fill', { p, c: tool.color }); return; }
  activePointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  const c = tool.mode === 'eraser' ? '#ffffff' : tool.color;
  localStroke = new StrokeRenderer(c, tool.size); localStroke.add(p);
  socket.emit('draw:start', { c, w: tool.size, p });
});
canvas.addEventListener('pointermove', e => {
  if (!localStroke || e.pointerId !== activePointer) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) {
    const p = canvasPoint(ev);
    const last = localStroke.pts[localStroke.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) continue;
    localStroke.add(p); pending.push(p);
  }
  if (!flushTimer) flushTimer = setTimeout(flush, 30);
});
function endStroke(e) {
  if (!localStroke || (e && e.pointerId !== activePointer)) return;
  flush(); localStroke.finish(); localStroke = null; activePointer = null;
  socket.emit('draw:end');
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('lostpointercapture', endStroke);

// keep cursor size right when resized
function fitCanvas() { updateCursor(); }
window.addEventListener('resize', fitCanvas);

// ---------- chat ----------
const chatLog = $('#chatLog');
let chatStick = true;
chatLog.addEventListener('scroll', () => { chatStick = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40; });
new ResizeObserver(() => { if (chatStick) chatLog.scrollTop = chatLog.scrollHeight; }).observe(chatLog);
function addChat(m) {
  const el = document.createElement('div');
  el.className = 'msg k-' + m.kind;
  if (m.kind === 'msg' || m.kind === 'guessedchat') el.innerHTML = `<b>${esc(m.name)}:</b> ${m.voice ? '🎤 ' : ''}${esc(m.text)}`;
  else el.textContent = (m.kind === 'like' ? '👍 ' : m.kind === 'dislike' ? '👎 ' : '') + m.text;
  const atBottom = chatStick;
  chatLog.appendChild(el);
  while (chatLog.children.length > 200) chatLog.firstChild.remove();
  if (atBottom || m.from === (S && S.you)) { chatLog.scrollTop = chatLog.scrollHeight; chatStick = true; }
}
socket.on('chat', m => {
  addChat(m);
  if (m.kind === 'join') Sound.play('join');
  if (m.kind === 'leave') Sound.play('leave');
  if (m.kind === 'close') Sound.play('close');
  if (m.kind === 'like') Sound.play('like');
  if (m.kind === 'dislike') Sound.play('dislike');
});
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (!v) return;
  socket.emit('chat', v);
  $('#chatInput').value = '';
});

socket.on('guessed', g => {
  Sound.play('correct');
  if (S && g.id === S.you) toast(t('youGuessed') + `  +${g.points}`);
  const row = document.querySelector(`.player[data-id="${g.id}"]`);
  if (row) { row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900); }
});
socket.on('turn:start', () => Sound.play('turn'));
socket.on('turn:end', () => Sound.play('roundEnd'));
socket.on('game:end', () => { Sound.play('win'); setTimeout(confetti, 200); });
socket.on('round', r => showRoundBanner(r.round));
socket.on('kicked', () => { goHome(); homeError('kicked'); });
socket.on('rated', () => {});

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------- rating ----------
$$('.rate-btn').forEach(b => b.onclick = () => { socket.emit('rate', b.dataset.rate === '1'); $('#rateBox').classList.add('used'); });

// ---------- state & rendering ----------
let stateAt = 0;
socket.on('state', st => {
  const phaseChanged = !S || st.phase !== S.phase || st.drawerId !== S.drawerId;
  S = st; stateAt = performance.now();
  if (phaseChanged) $('#rateBox').classList.remove('used');
  render();
  prevPhase = st.phase; prevRound = st.round; prevDrawer = st.drawerId;
});

function me() { return S && S.players.find(p => p.id === S.you); }
function pname(id) { const p = S.players.find(p => p.id === id); return p ? p.name : '?'; }

function render() {
  if (!S) return;
  I18N.apply();
  renderTop(); renderPlayers(); renderStage();
  const drawing = amDrawing();
  $('#toolbar').hidden = !drawing;
  document.body.classList.toggle('is-drawer', drawing);
  document.body.classList.toggle('in-lobby', S.phase === 'lobby');
  $('#rateBox').hidden = !(S.phase === 'drawing' && S.drawerId !== S.you);
  const meP = me();
  const guessing = S.phase === 'drawing' && S.drawerId !== S.you && !(meP && meP.guessed);
  $('#chatInput').placeholder = guessing ? t('chatGuess') : t('chatPh');
  Voice.update(guessing && S.settings.voiceGuess !== false);
  updateCursor();
}

function renderTop() {
  $('#roundInfo').textContent = S.phase === 'lobby' ? `#${S.code}` : (S.round ? t('round', { r: Math.min(S.round, S.settings.rounds), n: S.settings.rounds }) : '');
  const wa = $('#wordArea');
  const h = S.hint;
  if (S.phase === 'drawing' || S.phase === 'turnEnd' || (S.phase === 'choosing')) {
    if (S.phase === 'choosing') { wa.innerHTML = `<div class="word-label">${t('waiting')}</div>`; return; }
    const isDrawer = S.drawerId === S.you;
    let label = S.phase === 'turnEnd' ? t('wordWas') : isDrawer ? t('drawThis') : t('guessThis');
    if (!h) { wa.innerHTML = ''; return; }
    if (h.hidden) { wa.innerHTML = `<div class="word-label">${label}</div><div class="word hidden-word">? ? ?</div><div class="word-sub">${t('hiddenWord')}</div>`; return; }
    const letters = h.ta.map(x => x.s ? '<span class="gap"></span>' : x.c ? `<span class="ch shown">${esc(x.c)}</span>` : '<span class="ch blank"></span>').join('');
    let sub = h.full ? '' : `<span class="count">${h.count}</span>`;
    let extra = '';
    if (isDrawer && (h.meaning || h.translit)) extra = `<div class="word-sub">${esc(h.translit || '')}${h.translit && h.meaning ? ' · ' : ''}${esc((h.meaning || '').replace(/\//g, ' / '))}</div>`;
    if (h.en && !isDrawer) extra += `<div class="word-sub en-blanks">${esc(h.en).split('').map(c => c === ' ' ? '&nbsp;&nbsp;' : c).join(' ')}</div>`;
    wa.innerHTML = `<div class="word-label">${label}</div><div class="word">${letters}${sub}</div>${extra}`;
  } else wa.innerHTML = S.phase === 'lobby' ? `<div class="word-label">${t('roomCode')}</div><div class="word room-code">${S.code}</div>` : '';
}

function renderPlayers() {
  const sorted = [...S.players].sort((a, b) => b.score - a.score);
  const rankOf = id => { let r = 0, last = null, res = 1; sorted.forEach((p, i) => { if (p.score !== last) { r = i + 1; last = p.score; } if (p.id === id) res = r; }); return res; };
  const list = S.phase === 'lobby' ? S.players : sorted;
  $('#players').innerHTML = list.map(p => {
    const isMe = p.id === S.you;
    const cls = ['player', p.guessed ? 'guessed' : '', p.id === S.drawerId && S.phase !== 'lobby' ? 'drawer' : '', !p.connected ? 'offline' : '', isMe ? 'me' : ''].join(' ');
    return `<div class="${cls}" data-id="${p.id}">
      <div class="p-rank">${S.phase === 'lobby' ? '' : '#' + rankOf(p.id)}</div>
      <div class="p-info"><div class="p-name">${esc(p.name)}${isMe ? ` <i>(${t('you')})</i>` : ''}</div><div class="p-score">${p.score} ${t('points')}</div></div>
      <div class="p-av">${Avatar.svg(p.avatar, 44)}${p.id === S.hostId ? '<span class="crown" title="host">👑</span>' : ''}${p.id === S.drawerId && (S.phase === 'drawing' || S.phase === 'choosing') ? '<span class="pencil">✏️</span>' : ''}</div>
    </div>`;
  }).join('');
}

document.addEventListener('click', e => {
  const row = e.target.closest('.player');
  const pop = $('#popover');
  if (e.target.closest('#popover')) {
    const b = e.target.closest('[data-pop]');
    if (b) { socket.emit(b.dataset.pop, b.dataset.id); pop.hidden = true; }
    return;
  }
  if (!row || !S || row.dataset.id === S.you) { pop.hidden = true; return; }
  const p = S.players.find(x => x.id === row.dataset.id); if (!p) return;
  const hostBtn = S.hostId === S.you ? `<button class="btn btn-red small" data-pop="kick" data-id="${p.id}">${t('kick')}</button>` : '';
  pop.innerHTML = `<div class="pop-head">${Avatar.svg(p.avatar, 56)}<b>${esc(p.name)}</b></div>
    <button class="btn btn-orange small" data-pop="votekick" data-id="${p.id}">${t('voteKick')} (${p.kickVotes})</button>${hostBtn}`;
  const r = row.getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 200, r.right + 6) + 'px';
  pop.style.top = Math.max(6, Math.min(window.innerHeight - 170, r.top)) + 'px';
  pop.hidden = false;
});

function renderStage() {
  const ov = $('#overlay'), inner = $('#overlayInner'), lobby = $('#lobby');
  lobby.hidden = S.phase !== 'lobby';
  if (S.phase === 'lobby') { ov.hidden = true; renderLobby(); return; }
  let html = '';
  if (S.phase === 'choosing') {
    if (S.drawerId === S.you && S.choices) {
      html = `<h2>${t('chooseWord')}</h2><div class="choices">${S.choices.map((w, i) =>
        `<button class="choice" data-choice="${i}"><span class="c-ta">${esc(w.ta)}</span><span class="c-en">${esc(w.translit || '')}${w.translit && w.en ? ' · ' : ''}${esc((w.en || '').split('/')[0])}</span></button>`).join('')}</div><div class="ov-timer" data-countdown></div>`;
    } else {
      const d = S.players.find(p => p.id === S.drawerId);
      html = `<div class="ov-av bounce">${d ? Avatar.svg(d.avatar, 90) : ''}</div><h2>${t('isChoosing', { name: esc(pname(S.drawerId)) })}</h2>`;
    }
  } else if (S.phase === 'turnEnd' && S.lastTurn) {
    const lt = S.lastTurn;
    const reason = lt.reason === 'allGuessed' ? t('allGuessed') : lt.reason === 'drawerLeft' ? t('drawerLeft') : t('timeUp');
    html = `<div class="ov-reason">${reason}</div><h2>${t('wordWas')}: <span class="reveal-word">${esc(lt.word ? lt.word.ta : '?')}</span></h2>
      ${lt.word ? `<div class="reveal-sub">${esc(lt.word.translit || '')}${lt.word.translit && lt.word.en ? ' · ' : ''}${esc((lt.word.en || '').replace(/\//g, ' / '))}</div>` : ''}
      <div class="turn-scores">${lt.scores.map(s => `<div class="ts-row"><span>${esc(s.name)}</span><b class="${s.delta > 0 ? 'plus' : 'zero'}">${s.delta > 0 ? '+' + s.delta : 0}</b></div>`).join('')}</div>`;
  } else if (S.phase === 'gameEnd' && S.podium) {
    const top = S.podium;
    const slot = (r, cls) => r ? `<div class="pod ${cls}"><div class="pod-av">${Avatar.svg(r.avatar, cls === 'first' ? 96 : 72)}</div><div class="pod-name">${esc(r.name)}</div><div class="pod-score">${r.score}</div><div class="pod-block">${r.rank}</div></div>` : '<div class="pod empty"></div>';
    html = `<h2>${t('gameOver')}</h2><div class="podium">${slot(top[1], 'second')}${slot(top[0], 'first')}${slot(top[2], 'third')}</div>
      ${top.length > 3 ? `<div class="rest">${top.slice(3).map(r => `<div>#${r.rank} ${esc(r.name)} — ${r.score}</div>`).join('')}</div>` : ''}
      ${S.hostId === S.you ? `<button class="btn btn-green big" id="playAgainBtn">${t('playAgain')}</button>` : `<div class="muted">${t('waitingAgain')}</div>`}`;
  }
  if (html) { if (inner.dataset.key !== S.phase + S.drawerId + I18N.lang + (S.choices ? 'c' : '')) { inner.innerHTML = html; inner.dataset.key = S.phase + S.drawerId + I18N.lang + (S.choices ? 'c' : ''); } ov.hidden = false; }
  else { ov.hidden = true; inner.dataset.key = ''; }
  if (S.phase === 'turnEnd' || S.phase === 'gameEnd') inner.innerHTML = html, inner.dataset.key = '';
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-choice]'); if (c) { socket.emit('word:choose', +c.dataset.choice); }
  if (e.target.id === 'playAgainBtn') socket.emit('game:playAgain');
});

// ----- lobby -----
let lobbyBuilt = false;
function renderLobby() {
  const L = $('#lobby');
  const isHost = S.hostId === S.you;
  const s = S.settings;
  const link = location.origin + '/?room=' + S.code;
  const num = (k, min, max, step = 1) => `<label class="set"><span>${t(k)}</span><select data-set="${k}" ${isHost ? '' : 'disabled'}>${range(min, max, step).map(v => `<option ${v === s[k] ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  const sel = (k, opts) => `<label class="set"><span>${t(k)}</span><select data-set="${k}" ${isHost ? '' : 'disabled'}>${opts.map(o => `<option value="${o}" ${o === s[k] ? 'selected' : ''}>${t(o)}</option>`).join('')}</select></label>`;
  const chk = k => `<label class="set check"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''} ${isHost ? '' : 'disabled'}><span>${t(k)}</span></label>`;
  const focused = document.activeElement && document.activeElement.id === 'customWordsBox';
  if (focused) return; // don't clobber typing
  const enough = S.players.filter(p => p.connected).length >= 2;
  L.innerHTML = `<div class="lobby-inner">
    <h2>⚙️ ${t('settings')}</h2>
    <div class="settings-grid">
      ${num('maxPlayers', 2, 12)}
      ${num('rounds', 2, 10)}
      ${num('drawTime', 30, 240, 10)}
      ${num('wordCount', 1, 5)}
      ${num('hints', 0, 5)}
      ${sel('wordMode', ['normal', 'hidden', 'both'])}
      ${sel('difficulty', ['all', 'easy', 'medium', 'hard'])}
    </div>
    ${chk('acceptEnglish')}
    ${chk('voiceGuess')}
    <label class="set block"><span>${t('customWords')}</span>
      <textarea id="customWordsBox" data-set="customWords" rows="2" placeholder="${t('customHint')}" ${isHost ? '' : 'disabled'}>${esc(s.customWords)}</textarea></label>
    ${chk('customOnly')}
    ${isHost ? `<button class="btn btn-green big start-btn" id="startBtn" ${enough ? '' : 'disabled'}>${enough ? t('start') : t('needTwo')}</button>` : `<div class="muted wait">${t('waitingHost')}</div>`}
    <div class="invite"><div class="inv-title">${t('invite')}</div>
      <div class="inv-row"><input readonly value="${link}" id="inviteLink"><button class="btn btn-blue small" id="copyBtn">${t('copy')}</button>${navigator.share ? `<button class="btn btn-orange small" id="shareBtn">${t('share')}</button>` : ''}</div>
      <div class="inv-code">${t('roomCode')}: <b>${S.code}</b></div>
    </div></div>`;
}
function range(a, b, s) { const r = []; for (let v = a; v <= b; v += s) r.push(v); return r; }
document.addEventListener('change', e => {
  const el = e.target.closest('[data-set]'); if (!el || !S) return;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  socket.emit('settings:update', { [el.dataset.set]: v });
});
let cwTimer;
document.addEventListener('input', e => {
  if (e.target.id !== 'customWordsBox') return;
  clearTimeout(cwTimer); cwTimer = setTimeout(() => socket.emit('settings:update', { customWords: e.target.value }), 500);
});
document.addEventListener('focusout', e => { if (e.target.id === 'customWordsBox') { socket.emit('settings:update', { customWords: e.target.value }); setTimeout(render, 50); } });
document.addEventListener('click', e => {
  if (e.target.id === 'startBtn') { Sound.unlock(); socket.emit('game:start'); }
  if (e.target.id === 'copyBtn') {
    const inp = $('#inviteLink');
    (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).catch(() => { inp.select(); document.execCommand('copy'); });
    e.target.textContent = t('copied'); setTimeout(() => { if (e.target) e.target.textContent = t('copy'); }, 1500);
  }
  if (e.target.id === 'shareBtn') navigator.share({ title: 'வரைந்து கண்டுபிடி!', text: 'Come play Tamil Pictionary with me! Room ' + S.code, url: $('#inviteLink').value }).catch(() => {});
});

function showRoundBanner(r) {
  const b = document.createElement('div');
  b.className = 'round-banner'; b.textContent = t('roundBig', { r });
  $('#stage').appendChild(b); setTimeout(() => b.remove(), 2200);
}

// ---------- timer loop ----------
function timerLoop() {
  requestAnimationFrame(timerLoop);
  if (!S) return;
  const left = Math.max(0, S.timeLeft - (performance.now() - stateAt));
  const sec = Math.ceil(left / 1000);
  const active = ['drawing', 'choosing', 'turnEnd'].includes(S.phase);
  const txt = active && S.phase === 'drawing' ? sec : (S.phase === 'choosing' ? sec : '');
  const ct = $('#clockText'); if (ct.textContent != txt) ct.textContent = txt;
  const frac = S.phaseDuration ? left / S.phaseDuration : 0;
  const arc = $('#clockArc'); const C = 2 * Math.PI * 19;
  arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C * (1 - (active ? frac : 0));
  $('#clock').classList.toggle('urgent', S.phase === 'drawing' && sec <= 10);
  if (S.phase === 'drawing' && sec <= 10 && sec > 0 && sec !== lastTickSec) { lastTickSec = sec; Sound.play('tick'); }
  const cd = document.querySelector('[data-countdown]'); if (cd) cd.textContent = sec + 's';
}
requestAnimationFrame(timerLoop);

// ---------- confetti ----------
function confetti() {
  const stage = $('#stage');
  const cols = ['#ff9800', '#ffeb3b', '#e91e63', '#4caf50', '#2196f3', '#fff'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('i'); p.className = 'confetti';
    p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
    p.style.animationDelay = Math.random() * 0.8 + 's'; p.style.animationDuration = 2 + Math.random() * 2 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    stage.appendChild(p); setTimeout(() => p.remove(), 5000);
  }
}

Voice.init({ input: $('#chatInput'), btn: $('#micBtn'), langBtn: $('#micLang'), t,
  onFinal: (text, alts) => socket.emit('chat', { text, alts }), toast });
I18N.apply(); refreshHomeTexts();
window.__ts = { get state() { return S; }, socket };
})();

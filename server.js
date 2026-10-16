// வரைந்து கண்டுபிடி! — a skribbl.io-style Tamil drawing & guessing game.
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { graphemes, checkGuess, norm } = require('./lib/text');
const WORDDB = require('./data/words.json');

const PORT = process.env.PORT || 3000;
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', setHeaders(res, p) { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get('/healthz', (req, res) => res.json({ ok: true, rooms: rooms.size, words: WORDDB.words.length }));
app.get('/api/meta', (req, res) => res.json({ categories: WORDDB.categories, words: WORDDB.words.length }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 20000 });

// ---------- constants ----------
const W = 800, H = 600;
const CHOOSE_TIME = +process.env.CHOOSE_MS || 15000;
const TURN_END_TIME = +process.env.TURN_END_MS || 6000;
const RECONNECT_GRACE = 45000;
const DEFAULTS = {
  maxPlayers: 8, rounds: 3, drawTime: 80, wordCount: 3, hints: 2,
  wordMode: 'normal', customWords: '', customOnly: false, acceptEnglish: true, difficulty: 'all', voiceGuess: true,
};
const LIMITS = { maxPlayers: [2, 12], rounds: [2, 10], drawTime: [30, 240], wordCount: [1, 5], hints: [0, 5] };
const WORD_MODES = ['normal', 'hidden', 'both'];
const DIFFS = ['all', 'easy', 'medium', 'hard'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const rooms = new Map();

// ---------- helpers ----------
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 6 }, () => A[rnd(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function cleanName(n) {
  n = String(n || '').normalize('NFC').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return n || 'Player' + (100 + rnd(900));
}
function cleanAvatar(a) {
  a = a && typeof a === 'object' ? a : {};
  const int = (v, m) => clamp(parseInt(v, 10) || 0, 0, m);
  return { color: int(a.color, 15), eyes: int(a.eyes, 9), mouth: int(a.mouth, 9), extra: int(a.extra, 9) };
}
function parseCustomWords(text) {
  return String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 500).map(s => {
    const m = s.split(/[:=]/);
    const ta = m[0].normalize('NFC').trim().slice(0, 40);
    const en = (m[1] || '').trim().slice(0, 40);
    return { ta, en, translit: '', category: 'custom', difficulty: 'custom', custom: true };
  }).filter(w => w.ta);
}

function connectedPlayers(room) { return [...room.players.values()].filter(p => p.connected); }
function playerList(room) { return [...room.players.values()]; }

function newRoom(hostPid) {
  const room = {
    code: makeCode(), hostId: hostPid, players: new Map(), settings: { ...DEFAULTS },
    phase: 'lobby', round: 0, queue: [], drawerId: null, word: null, choices: null,
    endsAt: 0, phaseDuration: 0, hintTimes: [], revealed: new Set(), guessed: new Map(),
    turnScores: {}, actions: [], current: null, usedWords: new Set(), banned: new Set(),
    lastTurn: null, podium: null, ratings: new Map(), created: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function wordPool(room) {
  const s = room.settings;
  const custom = parseCustomWords(s.customWords);
  let db = WORDDB.words;
  if (s.difficulty !== 'all') db = db.filter(w => w.difficulty === s.difficulty);
  return { custom, db: s.customOnly && custom.length >= s.wordCount ? [] : db };
}
function pickChoices(room) {
  const n = room.settings.wordCount;
  const { custom, db } = wordPool(room);
  const avail = arr => arr.filter(w => !room.usedWords.has(w.ta));
  let c = avail(custom), d = avail(db);
  if (c.length + d.length < n) { room.usedWords.clear(); c = custom.slice(); d = db.slice(); }
  shuffle(c); shuffle(d);
  const out = [];
  while (out.length < n && (c.length || d.length)) {
    const useCustom = c.length && (!d.length || Math.random() < 0.5);
    const w = useCustom ? c.pop() : d.pop();
    if (!out.some(o => o.ta === w.ta)) out.push(w);
  }
  return out;
}

// ---------- state broadcasting ----------
function hintFor(room, pid) {
  if (!room.word) return null;
  const isDrawer = pid === room.drawerId;
  const guessed = room.guessed.has(pid);
  const g = graphemes(room.word.ta);
  const showAll = isDrawer || guessed || room.phase === 'turnEnd';
  if (room.settings.wordMode === 'hidden' && !showAll) return { hidden: true };
  const ta = g.map((ch, i) => ch === ' ' ? { s: 1 } : (showAll || room.revealed.has(i)) ? { c: ch } : {});
  const out = { ta, count: g.filter(x => x !== ' ').length };
  if (showAll) out.full = true;
  if (room.settings.wordMode === 'both' && room.word.en) {
    const en = room.word.en.split('/')[0];
    out.en = showAll ? en : en.replace(/[^ ]/g, '_');
  }
  if (isDrawer) { out.meaning = room.word.en; out.translit = room.word.translit; }
  return out;
}

function baseState(room) {
  const now = Date.now();
  return {
    code: room.code, hostId: room.hostId, settings: room.settings, phase: room.phase,
    round: room.round, drawerId: room.drawerId,
    timeLeft: room.endsAt ? Math.max(0, room.endsAt - now) : 0, phaseDuration: room.phaseDuration,
    players: playerList(room).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.connected,
      guessed: room.guessed.has(p.id), turnScore: room.turnScores[p.id] || 0,
      kickVotes: p.kickVotes.size,
    })),
    lastTurn: room.phase === 'turnEnd' ? room.lastTurn : null,
    podium: room.phase === 'gameEnd' ? room.podium : null,
    wordCountTotal: WORDDB.words.length,
  };
}
function broadcastState(room) {
  const base = baseState(room);
  for (const p of room.players.values()) {
    if (!p.socketId) continue;
    const st = { ...base, you: p.id, hint: hintFor(room, p.id) };
    if (room.phase === 'choosing' && p.id === room.drawerId) st.choices = room.choices.map(w => ({ ta: w.ta, en: w.en, translit: w.translit }));
    io.to(p.socketId).emit('state', st);
  }
}
function sys(room, text, kind = 'sys', to = null) {
  const msg = { kind, text, t: Date.now() };
  if (to) io.to(to).emit('chat', msg); else io.to(room.code).emit('chat', msg);
}
function sendTo(room, pids, ev, data) {
  for (const pid of pids) { const p = room.players.get(pid); if (p && p.socketId) io.to(p.socketId).emit(ev, data); }
}

// ---------- game flow ----------
function startGame(room) {
  if (connectedPlayers(room).length < 2) return false;
  for (const p of room.players.values()) { p.score = 0; p.kickVotes.clear(); }
  room.round = 0; room.queue = []; room.usedWords.clear(); room.podium = null; room.lastTurn = null;
  io.to(room.code).emit('game:start');
  nextTurn(room);
  return true;
}

function resetTurnState(room) {
  room.word = null; room.choices = null; room.revealed = new Set(); room.guessed = new Map();
  room.turnScores = {}; room.hintTimes = []; room.ratings = new Map();
  room.actions = []; room.current = null;
}

function nextTurn(room) {
  resetTurnState(room);
  // advance queue
  while (true) {
    while (room.queue.length && !(room.players.has(room.queue[0]) && room.players.get(room.queue[0]).connected)) room.queue.shift();
    if (room.queue.length) break;
    room.round++;
    if (room.round > room.settings.rounds) return endGame(room);
    room.queue = connectedPlayers(room).map(p => p.id);
    io.to(room.code).emit('round', { round: room.round, rounds: room.settings.rounds });
  }
  room.drawerId = room.queue.shift();
  room.choices = pickChoices(room);
  room.phase = 'choosing';
  room.phaseDuration = CHOOSE_TIME;
  room.endsAt = Date.now() + CHOOSE_TIME;
  io.to(room.code).emit('canvas:sync', []);
  broadcastState(room);
}

function chooseWord(room, idx) {
  if (room.phase !== 'choosing') return;
  const w = room.choices[clamp(idx | 0, 0, room.choices.length - 1)];
  room.word = w; room.usedWords.add(w.ta); room.choices = null;
  room.phase = 'drawing';
  const dt = room.settings.drawTime * 1000;
  room.phaseDuration = dt;
  room.endsAt = Date.now() + dt;
  // hints
  const g = graphemes(w.ta);
  const letters = g.filter(x => x !== ' ').length;
  const nh = room.settings.wordMode === 'hidden' ? 0 : Math.min(room.settings.hints, Math.max(0, letters - 1));
  room.hintTimes = [];
  for (let i = 1; i <= nh; i++) room.hintTimes.push(Date.now() + dt * (0.35 + 0.55 * (i - 1) / Math.max(1, nh)) );
  const drawer = room.players.get(room.drawerId);
  sys(room, `${drawer ? drawer.name : '?'} is drawing now!`, 'draw');
  io.to(room.code).emit('turn:start', { drawerId: room.drawerId });
  broadcastState(room);
}

function revealHint(room) {
  const g = graphemes(room.word.ta);
  const hidden = g.map((ch, i) => i).filter(i => g[i] !== ' ' && !room.revealed.has(i));
  if (hidden.length <= 1) return;
  room.revealed.add(hidden[rnd(hidden.length)]);
  broadcastState(room);
}

function endTurn(room, reason) {
  if (room.phase !== 'drawing' && room.phase !== 'choosing') return;
  const word = room.word || (room.choices && room.choices[0]);
  // drawer points already accumulated per guesser
  room.lastTurn = {
    reason, drawerId: room.drawerId,
    word: word ? { ta: word.ta, en: word.en, translit: word.translit } : null,
    scores: playerList(room).map(p => ({ id: p.id, name: p.name, delta: room.turnScores[p.id] || 0 })).sort((a, b) => b.delta - a.delta),
  };
  if (!room.word && word) room.word = word; // so hint shows on reveal
  room.phase = 'turnEnd';
  room.phaseDuration = TURN_END_TIME;
  room.endsAt = Date.now() + TURN_END_TIME;
  room.hintTimes = [];
  if (word) sys(room, `The word was: ${word.ta}${word.en ? ` (${word.en.split('/')[0]})` : ''}`, 'reveal');
  io.to(room.code).emit('turn:end', room.lastTurn);
  broadcastState(room);
}

function endGame(room) {
  const ranking = playerList(room).sort((a, b) => b.score - a.score).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score }));
  // assign ranks with ties
  let rank = 0, last = null;
  ranking.forEach((r, i) => { if (r.score !== last) { rank = i + 1; last = r.score; } r.rank = rank; });
  room.podium = ranking;
  room.phase = 'gameEnd'; room.drawerId = null; room.word = null; room.endsAt = 0; room.phaseDuration = 0;
  room.queue = [];
  io.to(room.code).emit('game:end', ranking);
  sys(room, `Game over! ${ranking[0] ? ranking[0].name + ' wins 🏆' : ''}`, 'reveal');
  broadcastState(room);
}

function backToLobby(room, msg) {
  resetTurnState(room);
  room.phase = 'lobby'; room.round = 0; room.drawerId = null; room.endsAt = 0; room.phaseDuration = 0; room.queue = [];
  room.podium = null; room.lastTurn = null;
  for (const p of room.players.values()) p.kickVotes.clear();
  if (msg) sys(room, msg);
  io.to(room.code).emit('canvas:sync', []);
  broadcastState(room);
}

function scoreGuess(room, pid) {
  const dt = room.phaseDuration;
  const frac = clamp((room.endsAt - Date.now()) / dt, 0, 1);
  const order = room.guessed.size; // 0 for first guesser
  const pts = Math.max(50, Math.round(100 + 400 * frac) - order * 20);
  const p = room.players.get(pid);
  p.score += pts;
  room.turnScores[pid] = (room.turnScores[pid] || 0) + pts;
  room.guessed.set(pid, Date.now());
  const d = room.players.get(room.drawerId);
  if (d) { const dp = Math.round(pts * 0.4); d.score += dp; room.turnScores[d.id] = (room.turnScores[d.id] || 0) + dp; }
  return pts;
}

function allGuessed(room) {
  const others = connectedPlayers(room).filter(p => p.id !== room.drawerId);
  return others.length > 0 && others.every(p => room.guessed.has(p.id));
}

function removePlayer(room, pid, reason) {
  const p = room.players.get(pid);
  if (!p) return;
  room.players.delete(pid);
  for (const q of room.players.values()) q.kickVotes.delete(pid);
  room.queue = room.queue.filter(x => x !== pid);
  const label = reason === 'kick' ? `${p.name} was kicked.` : `${p.name} left the room.`;
  sys(room, label, 'leave');
  afterPresenceChange(room, pid);
}

function afterPresenceChange(room, goneId) {
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (room.hostId === goneId || !room.players.has(room.hostId) || !room.players.get(room.hostId).connected) {
    const nh = connectedPlayers(room)[0];
    if (nh && nh.id !== room.hostId) { room.hostId = nh.id; sys(room, `${nh.name} is now the host.`); }
  }
  if (room.phase !== 'lobby' && room.phase !== 'gameEnd') {
    if (connectedPlayers(room).length < 2) return backToLobby(room, 'Not enough players — back to the lobby.');
    if (goneId === room.drawerId && (room.phase === 'drawing' || room.phase === 'choosing')) return endTurn(room, 'drawerLeft');
    if (room.phase === 'drawing' && allGuessed(room)) return endTurn(room, 'allGuessed');
  }
  broadcastState(room);
}

// global ticker
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    // drop players whose reconnect grace expired
    for (const p of [...room.players.values()]) if (!p.connected && now - p.leftAt > RECONNECT_GRACE) removePlayer(room, p.id, 'left');
    if (!rooms.has(room.code)) continue;
    if (room.phase === 'drawing') {
      while (room.hintTimes.length && now >= room.hintTimes[0]) { room.hintTimes.shift(); revealHint(room); }
      if (now >= room.endsAt) endTurn(room, 'time');
    } else if (room.phase === 'choosing') {
      if (now >= room.endsAt) chooseWord(room, rnd(room.choices.length));
    } else if (room.phase === 'turnEnd') {
      if (now >= room.endsAt) nextTurn(room);
    }
  }
}, 250);

// ---------- sockets ----------
io.on('connection', socket => {
  let room = null, me = null;
  let chatBucket = { t: Date.now(), n: 0 };

  function attach(r, pid, name, avatar) {
    const existing = r.players.get(pid);
    if (existing) {
      if (existing.socketId && existing.socketId !== socket.id) io.sockets.sockets.get(existing.socketId)?.disconnect(true);
      existing.socketId = socket.id; existing.connected = true; existing.name = name; existing.avatar = avatar;
      me = existing;
      sys(r, `${name} reconnected.`, 'join');
    } else {
      me = { id: pid, name, avatar, score: 0, socketId: socket.id, connected: true, kickVotes: new Set(), leftAt: 0, joinedAt: Date.now() };
      r.players.set(pid, me);
      sys(r, `${name} joined the room!`, 'join');
      // late joiner during a game draws this round if still pending
      if (r.phase !== 'lobby' && r.phase !== 'gameEnd') r.queue.push(pid);
    }
    room = r;
    socket.join(r.code);
    socket.emit('canvas:sync', r.actions);
    afterPresenceChange(r, null);
  }

  const validPid = pid => typeof pid === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(pid) ? pid : crypto.randomUUID();

  socket.on('room:create', (d, ack) => {
    if (typeof ack !== 'function') return;
    d = d || {};
    if (room) leave();
    const pid = validPid(d.pid);
    const r = newRoom(pid);
    attach(r, pid, cleanName(d.name), cleanAvatar(d.avatar));
    ack({ ok: true, code: r.code, pid });
  });

  socket.on('room:join', (d, ack) => {
    if (typeof ack !== 'function') return;
    d = d || {};
    const code = String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = rooms.get(code);
    if (!r) return ack({ ok: false, error: 'notfound' });
    const pid = validPid(d.pid);
    if (r.banned.has(pid)) return ack({ ok: false, error: 'banned' });
    if (!r.players.has(pid) && r.players.size >= r.settings.maxPlayers) return ack({ ok: false, error: 'full' });
    if (room && room !== r) leave();
    attach(r, pid, cleanName(d.name), cleanAvatar(d.avatar));
    ack({ ok: true, code: r.code, pid });
  });

  const isHost = () => room && me && room.hostId === me.id;

  socket.on('settings:update', d => {
    if (!isHost() || room.phase !== 'lobby' || !d || typeof d !== 'object') return;
    const s = room.settings;
    for (const k of Object.keys(LIMITS)) if (k in d) s[k] = clamp(parseInt(d[k], 10) || DEFAULTS[k], ...LIMITS[k]);
    if (WORD_MODES.includes(d.wordMode)) s.wordMode = d.wordMode;
    if (DIFFS.includes(d.difficulty)) s.difficulty = d.difficulty;
    if ('customWords' in d) s.customWords = String(d.customWords || '').slice(0, 10000);
    if ('customOnly' in d) s.customOnly = !!d.customOnly;
    if ('acceptEnglish' in d) s.acceptEnglish = !!d.acceptEnglish;
    if ('voiceGuess' in d) s.voiceGuess = !!d.voiceGuess;
    broadcastState(room);
  });

  socket.on('game:start', (ack) => {
    if (!isHost() || room.phase !== 'lobby') return;
    const ok = startGame(room);
    if (!ok) sys(room, 'Need at least 2 players to start.', 'sys', socket.id);
    if (typeof ack === 'function') ack({ ok });
  });

  socket.on('game:playAgain', () => {
    if (!isHost() || room.phase !== 'gameEnd') return;
    backToLobby(room, 'Back in the lobby. Ready for another game?');
  });

  socket.on('word:choose', idx => {
    if (!room || !me || room.phase !== 'choosing' || room.drawerId !== me.id) return;
    chooseWord(room, idx);
  });

  // ----- drawing -----
  const canDraw = () => room && me && room.phase === 'drawing' && room.drawerId === me.id;
  const pt = p => Array.isArray(p) ? [clamp(Math.round(+p[0] * 10) / 10 || 0, -10, W + 10), clamp(Math.round(+p[1] * 10) / 10 || 0, -10, H + 10)] : [0, 0];
  socket.on('draw:start', d => {
    if (!canDraw() || !d) return;
    if (room.actions.length > 4000) return;
    const a = { t: 's', c: COLOR_RE.test(d.c) ? d.c : '#000000', w: clamp(+d.w || 6, 1, 80), p: [pt(d.p)] };
    room.actions.push(a); room.current = a;
    socket.to(room.code).emit('canvas:op', { t: 's', c: a.c, w: a.w, p: a.p[0] });
  });
  socket.on('draw:pts', d => {
    if (!canDraw() || !room.current || !d || !Array.isArray(d.p)) return;
    const pts = d.p.slice(0, 200).map(pt);
    if (room.current.p.length > 20000) return;
    room.current.p.push(...pts);
    socket.to(room.code).emit('canvas:op', { t: 'p', p: pts });
  });
  socket.on('draw:end', () => { if (canDraw()) { room.current = null; socket.to(room.code).emit('canvas:op', { t: 'e' }); } });
  socket.on('draw:fill', d => {
    if (!canDraw() || !d) return;
    const a = { t: 'f', c: COLOR_RE.test(d.c) ? d.c : '#000000', p: pt(d.p) };
    room.actions.push(a); room.current = null;
    socket.to(room.code).emit('canvas:op', a);
  });
  socket.on('draw:undo', () => {
    if (!canDraw() || !room.actions.length) return;
    room.actions.pop(); room.current = null;
    io.to(room.code).emit('canvas:sync', room.actions);
  });
  socket.on('draw:clear', () => {
    if (!canDraw()) return;
    room.actions.push({ t: 'c' }); room.current = null;
    socket.to(room.code).emit('canvas:op', { t: 'c' });
  });

  // ----- chat & guessing -----
  // payload: "text" or { text, alts: [..] } (alts = speech-recognition alternatives, voice guessing)
  const cleanText = v => String(v || '').normalize('NFC').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
  socket.on('chat', payload => {
    if (!room || !me) return;
    const now = Date.now();
    if (now - chatBucket.t > 4000) chatBucket = { t: now, n: 0 };
    if (++chatBucket.n > 8) return sys(room, 'Slow down a little! 🙂', 'sys', socket.id);
    let text, alts = [], voice = false;
    if (payload && typeof payload === 'object') {
      text = cleanText(payload.text);
      if (Array.isArray(payload.alts) && room.settings.voiceGuess) {
        alts = payload.alts.slice(0, 5).map(cleanText).filter(Boolean);
        voice = true;
      }
      if (!text) text = alts[0] || '';
    } else text = cleanText(payload);
    if (!text) return;
    const msg = { kind: 'msg', from: me.id, name: me.name, text, t: now };
    if (room.phase === 'drawing') {
      const isDrawer = me.id === room.drawerId;
      const hasGuessed = room.guessed.has(me.id);
      if (isDrawer || hasGuessed) {
        // private channel: only drawer + guessed players
        if (checkGuess(text, room.word, true) === 'correct') return sys(room, "Don't give away the word! 🤫", 'sys', socket.id);
        const ids = [room.drawerId, ...room.guessed.keys()];
        return sendTo(room, ids, 'chat', { ...msg, kind: 'guessedchat' });
      }
      let res = checkGuess(text, room.word, room.settings.acceptEnglish);
      if (res !== 'correct') for (const a of alts) if (checkGuess(a, room.word, room.settings.acceptEnglish) === 'correct') { res = 'correct'; break; }
      if (res === 'correct') {
        const pts = scoreGuess(room, me.id);
        io.to(room.code).emit('chat', { kind: 'correct', text: `${me.name} guessed the word!`, t: now, from: me.id });
        io.to(room.code).emit('guessed', { id: me.id, points: pts });
        if (allGuessed(room)) return endTurn(room, 'allGuessed');
        return broadcastState(room);
      }
      if (voice) msg.voice = true;
      io.to(room.code).emit('chat', msg);
      if (res !== 'close') for (const a of alts) if (checkGuess(a, room.word, room.settings.acceptEnglish) === 'close') { res = 'close'; break; }
      if (res === 'close') sys(room, `'${text}' is close!`, 'close', socket.id);
      return;
    }
    io.to(room.code).emit('chat', msg);
  });

  socket.on('rate', like => {
    if (!room || !me || room.phase !== 'drawing' || me.id === room.drawerId || room.ratings.has(me.id)) return;
    room.ratings.set(me.id, !!like);
    io.to(room.code).emit('chat', { kind: like ? 'like' : 'dislike', text: `${me.name} ${like ? 'liked' : 'disliked'} the drawing!`, t: Date.now() });
    io.to(room.code).emit('rated', { like: !!like });
  });

  socket.on('kick', pid => {
    if (!isHost() || pid === me.id || !room.players.has(pid)) return;
    kickPlayer(room, pid);
  });
  socket.on('votekick', pid => {
    if (!room || !me || pid === me.id || !room.players.has(pid)) return;
    const target = room.players.get(pid);
    if (target.kickVotes.has(me.id)) return;
    target.kickVotes.add(me.id);
    const others = connectedPlayers(room).filter(p => p.id !== pid).length;
    const need = Math.max(2, Math.floor(others / 2) + 1);
    sys(room, `${me.name} is voting to kick ${target.name} (${target.kickVotes.size}/${need})`, 'vote');
    if (target.kickVotes.size >= need) kickPlayer(room, pid); else broadcastState(room);
  });

  function kickPlayer(r, pid) {
    const t = r.players.get(pid);
    if (!t) return;
    r.banned.add(pid);
    if (t.socketId) { io.to(t.socketId).emit('kicked'); io.sockets.sockets.get(t.socketId)?.leave(r.code); }
    removePlayer(r, pid, 'kick');
  }

  function leave() {
    if (!room || !me) return;
    const r = room, pid = me.id;
    socket.leave(r.code);
    room = null; me = null;
    removePlayer(r, pid, 'left');
  }
  socket.on('room:leave', leave);

  socket.on('disconnect', () => {
    if (!room || !me) return;
    if (me.socketId !== socket.id) return;
    me.connected = false; me.socketId = null; me.leftAt = Date.now();
    sys(room, `${me.name} disconnected…`, 'leave');
    afterPresenceChange(room, me.id);
  });
});

server.listen(PORT, () => console.log(`Tamil Skribbl running on http://localhost:${PORT} with ${WORDDB.words.length} words`));
module.exports = { server, rooms };

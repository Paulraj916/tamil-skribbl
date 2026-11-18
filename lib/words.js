// Word-list helpers and a per-room no-repeat picker.
// Each room keeps a Fisher-Yates shuffled deck of eligible words for its whole lifetime
// (across rounds and "play again"). Only the drawn word is retired; offered-but-not-picked
// words go to the back of the deck so they don't show up again immediately. The deck is
// reshuffled only once every remaining word has been drawn.
'use strict';

const RECENT_GLOBAL_MAX = 120;
let recentGlobal = []; // recently drawn word ids / concept keys, across rooms

function wordId(w) {
  return String(w.ta || '').normalize('NFC').trim().toLowerCase();
}

function conceptKeys(w) {
  const keys = new Set();
  const id = wordId(w);
  if (id) keys.add(id);
  if (w && w.lang === 'en' && id) keys.add('en:' + id);
  for (const m of String((w && w.en) || '').split(/[/;,]/)) {
    const t = m.trim().toLowerCase();
    if (t) keys.add('en:' + t);
  }
  return [...keys];
}

function dedupe(arr) {
  const seen = new Set(), out = [];
  for (const w of arr) {
    const id = wordId(w);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(w);
  }
  return out;
}

function normalizeTamil(words) {
  return dedupe((words || []).map(w => ({ ...w, lang: 'ta' })));
}
function normalizeEnglish(words) {
  return dedupe((words || []).map(w => ({
    ta: w.word, en: '', translit: '', category: w.category, difficulty: w.difficulty, lang: 'en',
  })));
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseCustomWords(text) {
  return String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 500).map(s => {
    const m = s.split(/[:=]/);
    const ta = m[0].normalize('NFC').trim().slice(0, 40);
    const en = (m[1] || '').trim().slice(0, 40);
    return { ta, en, translit: '', category: 'custom', difficulty: 'custom', custom: true, lang: 'custom' };
  }).filter(w => w.ta);
}

function filtered(list, s) {
  let out = list;
  if (s.difficulty && s.difficulty !== 'all') out = out.filter(w => w.difficulty === s.difficulty);
  if (s.category && s.category !== 'all') { const c = out.filter(w => w.category === s.category); out = c.length ? c : out; }
  return out.length ? out : list;
}

function wordPool(room, lists) {
  const s = room.settings;
  const custom = parseCustomWords(s.customWords);
  const onlyCustom = s.customOnly && custom.length >= s.wordCount;
  const ta = onlyCustom || s.wordLang === 'en' ? [] : filtered(lists.ta, s);
  const en = onlyCustom || s.wordLang === 'ta' ? [] : filtered(lists.en, s);
  return { custom, ta, en };
}

function poolKey(s) {
  return [s.wordLang || 'ta', s.difficulty || 'all', s.category || 'all', s.customOnly ? 1 : 0, String(s.customWords || '')].join('|');
}

function total(lists) {
  return (lists.custom ? lists.custom.length : 0) + (lists.ta ? lists.ta.length : 0) + (lists.en ? lists.en.length : 0);
}

function initRoomWords(room) {
  if (!room.usedWords) room.usedWords = new Set();
  if (!room.usedConcepts) room.usedConcepts = new Set();
  if (room.decks === undefined) room.decks = null;
  if (room.deckKey === undefined) room.deckKey = '';
}

function isUsed(room, w) {
  if (room.usedWords.has(wordId(w))) return true;
  return conceptKeys(w).some(k => room.usedConcepts.has(k));
}

function markUsed(room, w) {
  const id = wordId(w);
  room.usedWords.add(id);
  const concepts = conceptKeys(w);
  for (const k of concepts) room.usedConcepts.add(k);
  recentGlobal.push({ id, concepts });
  while (recentGlobal.length > RECENT_GLOBAL_MAX) recentGlobal.shift();
}

function globallyRecent(w) {
  const keys = new Set(conceptKeys(w));
  const id = wordId(w);
  return recentGlobal.some(g => g.id === id || g.concepts.some(c => keys.has(c)));
}

function buildUnused(pool, room) {
  const filt = arr => dedupe(arr).filter(w => !isUsed(room, w));
  return { custom: filt(pool.custom || []), ta: filt(pool.ta || []), en: filt(pool.en || []) };
}

function buildAll(pool) {
  return { custom: dedupe(pool.custom || []), ta: dedupe(pool.ta || []), en: dedupe(pool.en || []) };
}

function fillDecks(room, lists, rnd) {
  const out = { custom: [], ta: [], en: [] };
  for (const k of ['custom', 'ta', 'en']) {
    const fresh = [], stale = [];
    for (const w of lists[k]) (globallyRecent(w) ? stale : fresh).push(w);
    shuffle(fresh, rnd);
    shuffle(stale, rnd);
    out[k] = fresh.concat(stale); // prefer words not recently drawn in other rooms
  }
  room.decks = out;
  room.deckKey = poolKey(room.settings);
}

// Rebuild the deck when settings change, or when every word has been drawn (reshuffle).
function ensureDecks(room, pool, rnd) {
  initRoomWords(room);
  const key = poolKey(room.settings);
  const stale = !room.decks || room.deckKey !== key;
  if (!stale && total(room.decks) > 0) return;

  let lists = buildUnused(pool, room);
  if (total(lists) === 0) {
    // pool exhausted: every eligible word has been drawn in this room
    room.usedWords.clear();
    room.usedConcepts.clear();
    lists = buildAll(pool);
  }
  fillDecks(room, lists, rnd);
}

function langOf(w) {
  return (w.custom || w.lang === 'custom') ? 'custom' : w.lang;
}

// Put offered-but-not-picked words at the back of their deck so they skip the next few turns.
function returnUnpicked(room, chosen) {
  if (!room.choices || !room.decks) return;
  const cid = chosen ? wordId(chosen) : null;
  for (const o of room.choices) {
    if (cid && wordId(o) === cid) continue;
    const src = langOf(o);
    if (room.decks[src]) room.decks[src].push(o);
  }
}

function pickChoices(room, pool, rnd) {
  const n = Math.max(1, room.settings.wordCount | 0);
  ensureDecks(room, pool, rnd);
  const lists = room.decks;
  const langs = room.settings.wordLang === 'mixed' ? (rnd(2) ? ['ta', 'en'] : ['en', 'ta']) : [room.settings.wordLang || 'ta'];
  const out = [];
  let i = 0, guard = 0;
  const pop = src => (src && lists[src] && lists[src].length) ? lists[src].shift() : null;
  while (out.length < n && total(lists) > 0 && guard++ < 200) {
    let src;
    if (lists.custom.length && rnd(2) === 0) src = 'custom';
    else {
      src = langs[i++ % langs.length];
      if (!lists[src] || !lists[src].length) src = ['ta', 'en', 'custom'].find(k => lists[k] && lists[k].length);
    }
    const w = pop(src);
    if (w && !out.some(o => wordId(o) === wordId(w))) out.push(w);
  }
  room.choices = out;
  return out;
}

function takeChoice(room, idx) {
  const list = room.choices || [];
  if (!list.length) return null;
  const i = Math.max(0, Math.min(list.length - 1, idx | 0));
  const w = list[i];
  returnUnpicked(room, w);
  markUsed(room, w);
  room.choices = null;
  return w;
}

// If a turn is abandoned mid-choice, put every offered word back.
function releaseChoices(room) {
  if (!room.choices) return;
  returnUnpicked(room, null);
  room.choices = null;
}

function onGameStart(/* room */) {
  // Intentionally keep usedWords / decks: repeats are avoided for the room's whole life.
}

function resetGlobalRecent() { recentGlobal = []; }

module.exports = {
  wordId, conceptKeys, dedupe, shuffle, normalizeTamil, normalizeEnglish,
  parseCustomWords, filtered, wordPool, poolKey, total,
  initRoomWords, ensureDecks, pickChoices, takeChoice, releaseChoices,
  onGameStart, resetGlobalRecent, markUsed, isUsed, RECENT_GLOBAL_MAX,
};

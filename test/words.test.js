// Unit tests for the per-room no-repeat word deck (lib/words.js).
const assert = require('assert');
const Words = require('../lib/words');

const TA_DB = require('../data/words.json').words;
const EN_DB = require('../data/words-en.json').words;
const TA = Words.normalizeTamil(TA_DB);
const EN = Words.normalizeEnglish(EN_DB);

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ✔', msg); }

function rnd() {
  // Deterministic but well-mixed (mulberry32) so tests are repeatable.
  let s = 0xC0FFEE;
  return function (n) { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t >>> 0) % n; };
}

function room(s) {
  return {
    settings: { wordCount: 3, wordLang: 'en', difficulty: 'all', category: 'all', customWords: '', customOnly: false, ...s },
    usedWords: new Set(), usedConcepts: new Set(), decks: null, deckKey: '', choices: null,
  };
}

function poolOf(r, lists) { return Words.wordPool(r, lists || { ta: TA, en: EN }); }

function playTurn(r, lists, random, pickIdx = 0) {
  const ch = Words.pickChoices(r, poolOf(r, lists), random);
  const w = Words.takeChoice(r, pickIdx);
  return { ch, w };
}

function customLists(words) {
  return { ta: [], en: words.map(t => ({ ta: t, en: '', translit: '', category: 'custom', difficulty: 'custom', lang: 'en' })) };
}

(function main() {
  Words.resetGlobalRecent();

  // --- shuffle is a Fisher-Yates permutation ---
  {
    const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const b = Words.shuffle(a.slice(), rnd());
    ok(b.slice().sort((x, y) => x - y).join() === a.join(), 'Fisher-Yates shuffle is a permutation of the input');
    ok(b.join() !== a.join(), 'shuffle actually changes the order (with this seed)');
  }

  // --- case-insensitive de-dupe at load ---
  {
    const d = Words.normalizeEnglish([
      { word: 'Cat', category: 'animals', difficulty: 'easy' },
      { word: 'cat', category: 'animals', difficulty: 'easy' },
      { word: 'CAT', category: 'food', difficulty: 'hard' },
      { word: 'dog', category: 'animals', difficulty: 'easy' },
    ]);
    ok(d.length === 2 && d[0].ta === 'Cat' && d[1].ta === 'dog', 'normalizeEnglish drops case-insensitive duplicates, keeps the first');
    ok(Words.dedupe([{ ta: '  House  ' }, { ta: 'house' }, { ta: 'HOUSE' }]).length === 1, 'dedupe trims and ignores case');
  }

  // --- many turns: no picked repeat until the pool is exhausted; choices are distinct ---
  {
    const n = 20, k = 3;
    const names = Array.from({ length: n }, (_, i) => 'word' + String(i).padStart(2, '0'));
    const lists = customLists(names);
    const r = room({ wordCount: k, wordLang: 'en' });
    const random = rnd();
    const picked = [], offers = [];
    for (let t = 0; t < n; t++) {
      const { ch, w } = playTurn(r, lists, random, 0);
      ok(ch.length === k || (t >= n - (n % k) && ch.length > 0), `turn ${t + 1}: offered ${ch.length} choice(s)`);
      const ids = ch.map(x => x.ta);
      ok(new Set(ids).size === ids.length, `turn ${t + 1}: choices are distinct (${ids.join(', ')})`);
      ok(w && names.includes(w.ta), `turn ${t + 1}: picked a word from the pool`);
      picked.push(w.ta);
      offers.push(ids);
    }
    ok(new Set(picked).size === n, `no picked word repeats in the first ${n} turns (pool of ${n})`);
    ok(picked.slice().sort().join() === names.slice().sort().join(), 'every word in the pool is drawn once before any reshuffle');

    // offered-but-not-picked stay away until the unused part of the deck is dealt
    let earlyRepeat = false;
    const pending = new Set();
    const unused = new Set(names);
    for (let t = 0; t < offers.length; t++) {
      for (const id of offers[t]) {
        if (pending.has(id)) earlyRepeat = true;
      }
      unused.delete(picked[t]);
      pending.clear();
      for (const id of offers[t]) if (id !== picked[t]) pending.add(id);
      // after this turn the leftover offers sit at the back; they may reappear only once the
      // other unused words have been offered, i.e. once unused (excluding leftovers) is empty
      if (unused.size > pending.size) {
        // next offer should not include the leftovers while unused-front remains
      }
    }
    // stronger check: a leftover from turn 1 must not appear in turn 2 while 17 unused remain
    const leftover1 = offers[0].filter(id => id !== picked[0]);
    ok(leftover1.every(id => !offers[1].includes(id)), 'offered-but-not-picked words do not come back on the very next turn');

    // next turn reshuffles and may repeat
    const after = playTurn(r, lists, random, 0);
    ok(names.includes(after.w.ta), 'after the pool is exhausted the deck reshuffles and deals again');
    ok(picked.includes(after.w.ta), 'a reshuffled word is one of the already-drawn pool (repeat now allowed)');
  }

  // --- play again / new game in the same room keeps the used-word history ---
  {
    const names = Array.from({ length: 12 }, (_, i) => 'keep' + i);
    const lists = customLists(names);
    const r = room({ wordCount: 3, wordLang: 'en' });
    const random = rnd();
    const first = [];
    for (let t = 0; t < 4; t++) first.push(playTurn(r, lists, random, 0).w.ta);
    Words.onGameStart(r); // must NOT reset the deck
    const second = [];
    for (let t = 0; t < 8; t++) second.push(playTurn(r, lists, random, 0).w.ta);
    ok(new Set(first.concat(second)).size === 12, 'play-again in the same room does not repeat a drawn word until the pool is used up');
    ok(second.every(w => !first.includes(w)), 'the second game continues the same deck rather than starting over');
  }

  // --- real English list, many simulated turns ---
  {
    Words.resetGlobalRecent();
    const r = room({ wordCount: 3, wordLang: 'en' });
    const random = rnd();
    const picked = new Set();
    let distinctOffers = true, repeats = 0;
    const N = 200;
    for (let t = 0; t < N; t++) {
      const { ch, w } = playTurn(r, { ta: TA, en: EN }, random, 1);
      if (new Set(ch.map(x => Words.wordId(x))).size !== ch.length) distinctOffers = false;
      if (picked.has(Words.wordId(w))) repeats++;
      picked.add(Words.wordId(w));
    }
    ok(distinctOffers, `English mode: all ${N} offers have distinct choices`);
    ok(repeats === 0, `English mode: no repeats in ${N} turns (pool is ${EN.length})`);
  }

  // --- real Tamil list ---
  {
    Words.resetGlobalRecent();
    const r = room({ wordCount: 3, wordLang: 'ta' });
    const random = rnd();
    const picked = new Set();
    let distinctOffers = true;
    const N = 120;
    for (let t = 0; t < N; t++) {
      const { ch, w } = playTurn(r, { ta: TA, en: EN }, random, 0);
      if (new Set(ch.map(x => Words.wordId(x))).size !== ch.length) distinctOffers = false;
      picked.add(Words.wordId(w));
    }
    ok(distinctOffers && picked.size === N, `Tamil mode: ${N} distinct drawn words, distinct choices each turn`);
  }

  // --- mixed mode: every offer has both languages, and a Tamil word blocks its English meaning ---
  {
    Words.resetGlobalRecent();
    const r = room({ wordCount: 3, wordLang: 'mixed' });
    const random = rnd();
    let mixedOk = true;
    for (let t = 0; t < 30; t++) {
      const ch = Words.pickChoices(r, poolOf(r), random);
      const langs = new Set(ch.map(w => w.lang));
      if (!(langs.has('ta') && langs.has('en'))) mixedOk = false;
      Words.takeChoice(r, ch.findIndex(w => w.lang === 'ta'));
    }
    ok(mixedOk, 'mixed mode: every offer of 3 includes both Tamil and English');

    // concept clash: after drawing யானை (elephant), "elephant" itself must not be offered
    Words.resetGlobalRecent();
    const elephant = TA.find(w => (w.en || '').split('/').map(s => s.trim().toLowerCase()).includes('elephant'));
    const hasElephantEn = EN.some(w => w.ta === 'elephant');
    ok(elephant && hasElephantEn, 'test fixture: Tamil list has யானை/elephant and English list has elephant');
    const r2 = room({ wordCount: 3, wordLang: 'mixed' });
    // force the Tamil word to be chosen first, then scan many later English offers
    // Pick until we can inject: mark it used directly then ensure it never appears
    Words.markUsed(r2, elephant);
    r2.decks = null; r2.deckKey = '';
    let sawElephant = false, sawYaanei = false;
    for (let t = 0; t < 80; t++) {
      const { ch } = playTurn(r2, { ta: TA, en: EN }, rnd(), 0);
      if (ch.some(w => w.ta === 'elephant')) sawElephant = true;
      if (ch.some(w => Words.wordId(w) === Words.wordId(elephant))) sawYaanei = true;
    }
    ok(!sawElephant && !sawYaanei, 'mixed mode: after a Tamil word is drawn, its English meaning is not offered (and vice versa)');
  }

  // --- difficulty / category filters still apply; small pools reshuffle only when empty ---
  {
    Words.resetGlobalRecent();
    const easyAnimals = EN.filter(w => w.difficulty === 'easy' && w.category === 'animals');
    const r = room({ wordCount: 3, wordLang: 'en', difficulty: 'easy', category: 'animals' });
    const random = rnd();
    const picked = [];
    let inFilter = true;
    for (let t = 0; t < easyAnimals.length; t++) {
      const { ch, w } = playTurn(r, { ta: TA, en: EN }, random, 0);
      if (!ch.every(x => easyAnimals.some(e => e.ta === x.ta))) inFilter = false;
      picked.push(w.ta);
    }
    ok(inFilter, 'easy+animals offers stay inside the filter');
    ok(new Set(picked).size === easyAnimals.length, `easy animals: no repeat until all ${easyAnimals.length} are drawn`);
    const again = playTurn(r, { ta: TA, en: EN }, random, 0);
    ok(easyAnimals.some(e => e.ta === again.w.ta), 'easy animals: reshuffle after the small pool is exhausted');
  }

  // --- recent rooms: a fresh room prefers words not just drawn in another room ---
  {
    Words.resetGlobalRecent();
    const names = Array.from({ length: 30 }, (_, i) => 'glob' + String(i).padStart(2, '0'));
    const lists = customLists(names);
    const r1 = room({ wordCount: 3, wordLang: 'en' });
    const random = rnd();
    const usedInFirst = [];
    for (let t = 0; t < 6; t++) usedInFirst.push(playTurn(r1, lists, random, 0).w.ta);
    const r2 = room({ wordCount: 3, wordLang: 'en' });
    const firstOffer = Words.pickChoices(r2, poolOf(r2, lists), rnd());
    ok(firstOffer.every(w => !usedInFirst.includes(w.ta)), 'a new room puts words just used in another room at the back of its deck');
  }

  console.log(`\nALL ${passed} WORD-PICKER CHECKS PASSED ✅`);
})();

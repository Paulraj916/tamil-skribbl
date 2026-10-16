// Text helpers: Tamil grapheme splitting, guess normalisation, fuzzy matching.
const seg = new Intl.Segmenter('ta', { granularity: 'grapheme' });

function graphemes(s) {
  return Array.from(seg.segment(String(s).normalize('NFC')), x => x.segment);
}

// Normalise a typed guess / word for exact comparison.
function norm(s) {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // zero-width chars
    .replace(/[\s\-_.,!?'"`]+/g, '');
}

// Loose normalisation for romanised Tamil (tanglish) so that yaanai/yanai/yaanay match.
function looseLatin(s) {
  let t = norm(s).replace(/[^a-z]/g, '');
  t = t.replace(/ee/g, 'i').replace(/oo/g, 'u')
       .replace(/zh/g, 'l').replace(/th/g, 't').replace(/dh/g, 'd')
       .replace(/sh/g, 's').replace(/ch/g, 's').replace(/ph/g, 'f')
       .replace(/bh/g, 'b').replace(/kh/g, 'k').replace(/gh/g, 'g')
       .replace(/w/g, 'v').replace(/g/g, 'k').replace(/b/g, 'p').replace(/d/g, 't')
       .replace(/j/g, 's').replace(/y$/g, 'i').replace(/ai$/,'ai');
  t = t.replace(/(.)\1+/g, '$1');           // collapse doubled letters
  return t;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Build the set of acceptable answers for a word entry.
function answerForms(word, acceptEnglish) {
  const tamil = [norm(word.ta)];
  const latinExact = [], latinLoose = [];
  if (acceptEnglish) {
    const alts = [];
    if (word.en) alts.push(...String(word.en).split('/'));
    if (word.translit) alts.push(word.translit);
    for (const a of alts) {
      const n = norm(a); if (!n) continue;
      latinExact.push(n);
    }
    if (word.translit) latinLoose.push(looseLatin(word.translit));
  }
  return { tamil, latinExact, latinLoose };
}

// Returns 'correct' | 'close' | 'wrong'
function checkGuess(guess, word, acceptEnglish) {
  const g = norm(guess);
  if (!g) return 'wrong';
  const f = answerForms(word, acceptEnglish);
  if (f.tamil.includes(g)) return 'correct';
  if (f.latinExact.includes(g)) return 'correct';
  const gl = /[a-z]/.test(g) ? looseLatin(g) : '';
  if (gl && f.latinLoose.includes(gl)) return 'correct';
  // close checks
  if (g.length > f.tamil[0].length && g.includes(f.tamil[0])) return 'close';
  const gG = graphemes(g), wG = graphemes(f.tamil[0]);
  if (/[\u0B80-\u0BFF]/.test(g)) {
    const d = levenshtein(gG, wG);
    if (wG.length >= 2 && d === 1) return 'close';
    if (wG.length >= 5 && d === 2) return 'close';
    // same consonant skeleton but different vowel sign (e.g. கல vs கலா)
    const base = s => s.replace(/[\u0BBE-\u0BCD\u0BD7]/g, '');
    if (base(g) === base(f.tamil[0]) && g.length > 1) return 'close';
  }
  if (acceptEnglish && /[a-z]/.test(g)) {
    for (const a of f.latinExact) {
      const d = levenshtein(g, a);
      if (a.length >= 4 && d === 1) return 'close';
      if (a.length >= 7 && d === 2) return 'close';
    }
    for (const a of f.latinLoose) {
      if (a.length >= 4 && levenshtein(gl, a) === 1) return 'close';
    }
  }
  return 'wrong';
}

module.exports = { graphemes, norm, looseLatin, levenshtein, checkGuess };

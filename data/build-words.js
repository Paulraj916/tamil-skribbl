// Builds words.json from words.txt and validates the list.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'words.txt'), 'utf8');
const cats = [], words = [], errors = [];
let cur = null;
const seenTa = new Map();
const tamilRe = /^[\u0B80-\u0BFF ]+$/;
src.split(/\r?\n/).forEach((line, i) => {
  line = line.trim(); if (!line) return;
  if (line.startsWith('#')) {
    const [key, en, ta] = line.slice(1).trim().split('|');
    cur = { key, en, ta }; cats.push(cur); return;
  }
  const parts = line.split('|');
  if (parts.length !== 4) { errors.push(`line ${i+1}: expected 4 fields: ${line}`); return; }
  let [ta, en, translit, d] = parts.map(s => s.trim());
  ta = ta.normalize('NFC');
  if (!ta || !en || !translit) errors.push(`line ${i+1}: empty field`);
  if (!tamilRe.test(ta)) errors.push(`line ${i+1}: non-Tamil chars in "${ta}" ${[...ta].filter(c=>!tamilRe.test(c)).map(c=>c.codePointAt(0).toString(16))}`);
  if (/\s{2,}/.test(ta) || ta !== ta.trim()) errors.push(`line ${i+1}: bad spacing`);
  if (!/^[a-z ]+$/.test(translit)) errors.push(`line ${i+1}: translit must be a-z: ${translit}`);
  if (!/^[a-z0-9 \/'-]+$/i.test(en)) errors.push(`line ${i+1}: bad english: ${en}`);
  if (!['e','m','h'].includes(d)) errors.push(`line ${i+1}: bad difficulty ${d}`);
  if (/[\u0BCD]$/.test(ta.replace(/ /g,'')) && false) {}
  // a Tamil word should not start with a dependent vowel sign or virama
  if (/(^|\s)[\u0BBE-\u0BCD\u0BD7]/.test(ta)) errors.push(`line ${i+1}: starts with vowel sign: ${ta}`);
  if (/[\u0BCD][\u0BBE-\u0BCD]/.test(ta) || /[\u0BBE-\u0BCC][\u0BBE-\u0BCD]/.test(ta)) errors.push(`line ${i+1}: stacked signs: ${ta}`);
  if (seenTa.has(ta)) errors.push(`line ${i+1}: duplicate "${ta}" (first at ${seenTa.get(ta)})`);
  seenTa.set(ta, i+1);
  if (!cur) errors.push(`line ${i+1}: no category`);
  words.push({ ta, en, translit, category: cur && cur.key, difficulty: { e: 'easy', m: 'medium', h: 'hard' }[d] });
});
const counts = {};
words.forEach(w => counts[w.category] = (counts[w.category] || 0) + 1);
const diff = {}; words.forEach(w => diff[w.difficulty] = (diff[w.difficulty] || 0) + 1);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
fs.writeFileSync(path.join(__dirname, 'words.json'), JSON.stringify({ categories: cats, words }, null, 0));
console.log(`OK: ${words.length} words, ${cats.length} categories`);
console.log(counts); console.log(diff);

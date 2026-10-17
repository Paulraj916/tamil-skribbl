// Builds words-en.json from words-en.txt and validates the English list.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'words-en.txt'), 'utf8');
const tamilCats = require('./words.json').categories.map(c => c.key);
const D = { e: 'easy', m: 'medium', h: 'hard' };
const words = [], errors = [], seen = new Map();
let cat = null;
src.split(/\r?\n/).forEach((raw, i) => {
  const line = raw.trim();
  if (!line) return;
  if (line.startsWith('#')) {
    const key = line.slice(1).trim();
    if (/^[a-z]+$/.test(key)) { cat = key; if (!tamilCats.includes(key)) errors.push(`line ${i + 1}: category "${key}" not in Tamil list`); }
    return;
  }
  const m = line.match(/^([emh]):\s*(.+)$/);
  if (!m) { errors.push(`line ${i + 1}: bad line`); return; }
  if (!cat) errors.push(`line ${i + 1}: no category`);
  for (let w of m[2].split(',')) {
    w = w.trim().toLowerCase();
    if (!w) { errors.push(`line ${i + 1}: empty word`); continue; }
    if (!/^[a-z]+([ -][a-z]+)*$/.test(w)) errors.push(`line ${i + 1}: invalid chars in "${w}"`);
    if (w.replace(/[^a-z]/g, '').length < 2) errors.push(`line ${i + 1}: too short "${w}"`);
    if (seen.has(w)) errors.push(`line ${i + 1}: duplicate "${w}" (first on line ${seen.get(w)})`);
    seen.set(w, i + 1);
    words.push({ word: w, category: cat, difficulty: D[m[1]] });
  }
});
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const counts = {}, diff = {};
words.forEach(w => { counts[w.category] = (counts[w.category] || 0) + 1; diff[w.difficulty] = (diff[w.difficulty] || 0) + 1; });
fs.writeFileSync(path.join(__dirname, 'words-en.json'), JSON.stringify({ categories: Object.keys(counts), words }));
console.log(`OK: ${words.length} English words, ${Object.keys(counts).length} categories`);
console.log(JSON.stringify(counts)); console.log(JSON.stringify(diff));

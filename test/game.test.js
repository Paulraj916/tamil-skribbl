// End-to-end multiplayer test using real socket.io clients.
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const assert = require('assert');

const PORT = process.env.TEST_PORT || 3123;
const URL = process.env.TEST_URL || `http://localhost:${PORT}`;
let srv;
const log = (...a) => console.log('  ·', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ✔', msg); }

function client(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, name, pid: 'test-' + name + '-' + Math.random().toString(36).slice(2, 10), state: null, chats: [], ops: [], syncs: [] };
  s.on('state', st => c.state = st);
  s.on('chat', m => c.chats.push(m));
  s.on('canvas:op', o => c.ops.push(o));
  s.on('canvas:sync', a => c.syncs.push(a));
  return c;
}
const emitAck = (c, ev, data) => new Promise(r => c.s.emit(ev, data, r));
async function waitFor(fn, ms = 8000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('Timed out waiting for ' + label);
}

(async () => {
  if (!process.env.TEST_URL) {
    srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, TURN_END_MS: 800, CHOOSE_MS: 3000 }, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('running')) r(); }));
  }
  console.log('Testing against', URL);
  try {
    const amma = client('Amma'), appa = client('Appa'), anna = client('Anna'), me = client('Me');
    const all = [me, appa, amma, anna];

    // --- create & join ---
    const cr = await emitAck(me, 'room:create', { name: 'Me', avatar: { color: 2, eyes: 1 }, pid: me.pid });
    ok(cr.ok && /^[A-Z0-9]{6}$/.test(cr.code), 'host creates a private room with a 6-char code');
    const code = cr.code;
    const bad = await emitAck(appa, 'room:join', { code: 'ZZZZZZ', name: 'x', pid: appa.pid });
    ok(!bad.ok && bad.error === 'notfound', 'joining a wrong code fails cleanly');
    for (const c of [appa, amma, anna]) { const r = await emitAck(c, 'room:join', { code: code.toLowerCase(), name: c.name, avatar: {}, pid: c.pid }); assert.ok(r.ok); }
    await waitFor(() => all.every(c => c.state && c.state.players.length === 4), 4000, '4 players');
    ok(true, '3 family members joined (4 players total), everyone sees 4 players');
    ok(me.state.hostId === me.pid, 'room creator is host');

    // --- settings ---
    appa.s.emit('settings:update', { rounds: 9 }); // non-host ignored
    me.s.emit('settings:update', { rounds: 2, drawTime: 30, wordCount: 3, hints: 2, acceptEnglish: true, difficulty: 'easy', maxPlayers: 99 });
    await waitFor(() => appa.state.settings.rounds === 2 && appa.state.settings.drawTime === 30, 3000, 'settings');
    ok(appa.state.settings.maxPlayers === 12, 'settings sync to all; values clamped (maxPlayers 99 -> 12); non-host cannot change');

    // --- start game ---
    me.s.emit('game:start');
    await waitFor(() => all.every(c => c.state.phase === 'choosing'), 3000, 'choosing');
    ok(true, 'game started, first turn in choosing phase');

    const turns = [];
    let checkedTamil = false, checkedEnglish = false, checkedClose = false, checkedHidden = false, checkedDraw = false, checkedHint = false, checkedAutoPick = false;
    for (let turn = 0; turn < 8; turn++) {
      await waitFor(() => all.every(c => c.state.phase === 'choosing'), 6000, 'choosing turn ' + turn);
      const drawerId = me.state.drawerId;
      const drawer = all.find(c => c.pid === drawerId);
      const guessers = all.filter(c => c !== drawer);
      const st = await waitFor(() => drawer.state.choices && drawer.state, 2000, 'choices');
      if (turn === 0) {
        ok(st.choices.length === 3 && st.choices.every(w => /[\u0B80-\u0BFF]/.test(w.ta) && w.en && w.translit), 'drawer gets 3 Tamil word choices with meaning + transliteration');
        ok(guessers.every(g => !g.state.choices), 'guessers do not see the choices');
      }
      const roundBefore = me.state.round;
      let chosen;
      if (turn === 7) {
        // let it auto-pick on timeout
        await waitFor(() => all.every(c => c.state.phase === 'drawing'), 6000, 'auto pick');
        checkedAutoPick = true; ok(true, 'word auto-picked when drawer does not choose in time');
        chosen = null;
      } else {
        chosen = st.choices[0];
        drawer.s.emit('word:choose', 0);
        await waitFor(() => all.every(c => c.state.phase === 'drawing'), 3000, 'drawing');
      }
      const dstate = drawer.state;
      const word = chosen || { ta: dstate.hint.ta.map(x => x.c || ' ').join(''), en: dstate.hint.meaning, translit: dstate.hint.translit };
      if (!checkedHint) {
        const gh = guessers[0].state.hint;
        const segs = [...new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(word.ta)].map(x => x.segment).filter(x => x !== ' ');
        ok(gh.count === segs.length && gh.ta.every(x => !x.c), `guessers see ${gh.count} blanks = Tamil grapheme count of "${word.ta}" (no letters leaked)`);
        ok(dstate.hint.full && dstate.hint.meaning && dstate.hint.translit, 'drawer sees full word + English meaning + transliteration');
        checkedHint = true;
      }
      // drawing relay
      if (!checkedDraw) {
        drawer.s.emit('draw:start', { c: '#ff0000', w: 8, p: [100, 100] });
        drawer.s.emit('draw:pts', { p: [[120, 110], [140, 130]] });
        drawer.s.emit('draw:end');
        drawer.s.emit('draw:fill', { c: '#00ff00', p: [400, 300] });
        guessers[0].s.emit('draw:start', { c: '#000000', w: 8, p: [1, 1] }); // not allowed
        await waitFor(() => guessers[1].ops.length >= 4, 2000, 'ops');
        ok(guessers[1].ops.map(o => o.t).join('') === 'spef', 'strokes and fills from drawer relay to guessers in real time; non-drawers cannot draw');
        drawer.s.emit('draw:undo');
        await waitFor(() => guessers[1].syncs.length && guessers[1].syncs[guessers[1].syncs.length - 1].length === 1, 2000, 'undo sync');
        ok(true, 'undo re-syncs canvas (1 action left)');
        checkedDraw = true;
      }
      const scoresBefore = Object.fromEntries(me.state.players.map(p => [p.id, p.score]));
      // guesses
      const g0 = guessers[0], g1 = guessers[1], g2 = guessers[2];
      if (!checkedClose) {
        // wrong-by-one Tamil grapheme => close
        const segs = [...new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(word.ta)].map(x => x.segment);
        if (segs.filter(x => x !== ' ').length >= 2) {
          const wrong = segs.map((x, i) => i === segs.length - 1 ? (x === 'ம்' ? 'ன்' : 'ம்') : x).join('');
          const n0 = g0.chats.length;
          g0.s.emit('chat', wrong);
          await waitFor(() => g0.chats.slice(n0).some(m => m.kind === 'close'), 2000, 'close msg');
          ok(true, `near-miss "${wrong}" gets a private "close!" notice`);
          checkedClose = true;
        }
      }
      // g0 guesses in Tamil (with extra spaces), g1 in English, g2 via transliteration
      g0.s.emit('chat', '  ' + word.ta + ' ');
      await waitFor(() => me.state.players.find(p => p.id === g0.pid).guessed, 2000, 'g0 guessed');
      if (!checkedTamil) { ok(true, `correct Tamil guess "${word.ta}" accepted`); checkedTamil = true; }
      // hidden chat check: g0 (guessed) talks, g1 (not guessed) must not see it
      if (!checkedHidden) {
        const n1 = g1.chats.length, nd = drawer.chats.length;
        g0.s.emit('chat', 'super drawing!');
        await waitFor(() => drawer.chats.slice(nd).some(m => m.text === 'super drawing!'), 2000, 'drawer sees guessed chat');
        await sleep(150);
        ok(!g1.chats.slice(n1).some(m => m.text === 'super drawing!'), "guessed players' chat is hidden from players still guessing");
        ok(!g1.chats.some(m => m.kind === 'msg' && m.text.includes(word.ta)), 'the correct answer text is never broadcast to others');
        checkedHidden = true;
      }
      const en = (word.en || '').split('/')[0];
      g1.s.emit('chat', en.toUpperCase());
      await waitFor(() => me.state.players.find(p => p.id === g1.pid).guessed, 2000, 'g1 guessed (english)');
      if (!checkedEnglish) { ok(true, `English meaning "${en.toUpperCase()}" accepted (case-insensitive)`); checkedEnglish = true; }
      g2.s.emit('chat', word.translit);
      await waitFor(() => all.every(c => c.state.phase === 'turnEnd' || c.state.phase === 'choosing' || c.state.phase === 'gameEnd'), 3000, 'turn end after all guessed');
      const lt = me.state.lastTurn || {};
      const after = Object.fromEntries((me.state.players).map(p => [p.id, p.score]));
      const d0 = after[g0.pid] - scoresBefore[g0.pid], d1 = after[g1.pid] - scoresBefore[g1.pid], d2 = after[g2.pid] - scoresBefore[g2.pid], dd = after[drawer.pid] - scoresBefore[drawer.pid];
      turns.push({ turn, round: roundBefore, drawer: drawer.name, word: word.ta, d0, d1, d2, dd, reason: lt.reason });
      if (turn === 0) {
        ok(d0 > 0 && d1 > 0 && d2 > 0 && dd > 0, `everyone scored: Tamil ${d0}, English ${d1}, Tanglish ${d2}, drawer ${dd}`);
        ok(d0 >= d1 && d1 >= d2, 'earlier guessers get at least as many points as later ones');
        ok(lt.reason === 'allGuessed' && lt.word && lt.word.ta === word.ta, 'turn ends early when everyone guessed; word revealed');
      }
    }
    await waitFor(() => all.every(c => c.state.phase === 'gameEnd'), 6000, 'game end');
    console.table(turns);
    ok(new Set(turns.map(t => t.drawer)).size === 4 && turns.filter(t => t.round === 1).length === 4 && turns.filter(t => t.round === 2).length === 4, 'each player drew once per round across 2 rounds (8 turns)');
    const pod = me.state.podium;
    ok(pod.length === 4 && pod[0].score >= pod[1].score && pod[0].rank === 1, `game ended with podium: ${pod.map(p => `${p.rank}. ${p.name} ${p.score}`).join(', ')}`);
    const totals = Object.fromEntries(me.state.players.map(p => [p.name, p.score]));
    ok(Object.values(totals).every(v => v > 0), 'final scores all positive');

    // play again -> lobby
    appa.s.emit('game:playAgain');
    await sleep(200);
    ok(me.state.phase === 'gameEnd', 'non-host cannot restart');
    me.s.emit('game:playAgain');
    await waitFor(() => all.every(c => c.state.phase === 'lobby'), 2000, 'lobby');
    ok(true, 'host "Play again" returns everyone to the lobby');

    // late joiner receives canvas: start game, draw, then join
    me.s.emit('settings:update', { rounds: 2, drawTime: 60 });
    me.s.emit('game:start');
    await waitFor(() => me.state.phase === 'choosing', 2000);
    const dr = all.find(c => c.pid === me.state.drawerId);
    dr.s.emit('word:choose', 1);
    await waitFor(() => me.state.phase === 'drawing', 2000);
    dr.s.emit('draw:start', { c: '#123456', w: 10, p: [10, 10] }); dr.s.emit('draw:pts', { p: [[50, 50]] }); dr.s.emit('draw:end');
    await sleep(150);
    const late = client('Paati');
    const lr = await emitAck(late, 'room:join', { code, name: 'Paati', pid: late.pid });
    await waitFor(() => late.syncs.length && late.state, 2000, 'late sync');
    ok(lr.ok && late.syncs[0].length === 1 && late.syncs[0][0].p.length === 2 && late.state.phase === 'drawing', 'late joiner mid-game receives the current canvas and game state');

    // vote kick & host kick
    const voters = all.filter(c => c.pid !== late.pid);
    const kickedP = new Promise(r => late.s.on('kicked', r));
    voters[1].s.emit('votekick', late.pid);
    await sleep(100);
    ok(me.state.players.some(p => p.id === late.pid), 'one vote is not enough to kick');
    voters[2].s.emit('votekick', late.pid);
    voters[3].s.emit('votekick', late.pid);
    await Promise.race([kickedP, sleep(2000).then(() => { throw new Error('not kicked'); })]);
    await waitFor(() => !me.state.players.some(p => p.id === late.pid), 2000);
    ok(true, 'majority vote-kick removes the player');
    const rj = await emitAck(late, 'room:join', { code, name: 'Paati', pid: late.pid });
    ok(!rj.ok && rj.error === 'banned', 'kicked player cannot rejoin');

    // reconnect keeps score
    const annaScore = me.state.players.find(p => p.id === anna.pid).score;
    anna.s.disconnect();
    await waitFor(() => me.state.players.find(p => p.id === anna.pid && !p.connected), 2000, 'offline');
    const anna2 = client('Anna');
    anna2.pid = anna.pid;
    const rr = await emitAck(anna2, 'room:join', { code, name: 'Anna', pid: anna.pid });
    await waitFor(() => me.state.players.find(p => p.id === anna.pid && p.connected), 2000, 'reconnected');
    ok(rr.ok && me.state.players.find(p => p.id === anna.pid).score === annaScore, 'player reconnecting (e.g. phone screen locked) keeps their score');

    // host kick
    me.s.emit('kick', amma.pid);
    await waitFor(() => !me.state.players.some(p => p.id === amma.pid), 2000);
    ok(true, 'host can kick a player');

    // hints reveal progressively + 'both' word mode (back to lobby first)
    // ---- voice guessing: speech-recognition alternatives ----
    {
      const v1 = client('V1'), v2 = client('V2'), v3 = client('V3'), v4 = client('V4');
      const vr = await emitAck(v1, 'room:create', { name: 'V1', pid: v1.pid });
      for (const c of [v2, v3, v4]) await emitAck(c, 'room:join', { code: vr.code, name: c.name, pid: c.pid });
      v1.s.emit('settings:update', { drawTime: 60, rounds: 2 });
      await sleep(150);
      ok(v1.state.settings.voiceGuess === true, 'voice guessing is ON by default');
      v1.s.emit('game:start');
      await waitFor(() => v1.state && v1.state.phase === 'choosing', 3000);
      const vs = [v1, v2, v3, v4];
      const vd = vs.find(c => c.pid === v1.state.drawerId);
      vd.s.emit('word:choose', 0);
      await waitFor(() => vd.state.phase === 'drawing' && vd.state.hint && vd.state.hint.full, 2000);
      const vw = vd.state.hint.ta.map(x => x.c || ' ').join('');
      const [ga, gb, gc] = vs.filter(c => c !== vd);
      const isG = c => vd.state.players.find(p => p.id === c.pid).guessed;
      // correct word only in the 3rd alternative -> counted correct, nothing leaked
      const nb = gb.chats.length;
      ga.s.emit('chat', { text: 'வீடு வீடு', alts: ['வீடு வீடு', 'ஏதோ', vw] });
      await waitFor(() => isG(ga), 2000, 'alt match');
      await sleep(100);
      ok(!gb.chats.slice(nb).some(m => m.kind === 'msg' && (m.text.includes(vw) || m.text === 'வீடு வீடு')), `voice guess: correct word "${vw}" in alternative #3 counted as correct (and not shown to others)`);
      // more than 5 alternatives: 6th is ignored
      gb.s.emit('chat', { text: 'aaa', alts: ['aaa', 'bbb', 'ccc', 'ddd', 'eee', vw] });
      await sleep(250);
      ok(!isG(gb), 'only the first 5 alternatives are considered (6th ignored)');
      const voiceMsg = gc.chats.find(m => m.kind === 'msg' && m.text === 'aaa');
      ok(voiceMsg && voiceMsg.voice === true, 'non-matching voice guess is posted as a normal chat guess (top transcript, marked 🎤)');
      // overlong alternative is truncated (120 chars) and does not crash
      gb.s.emit('chat', { text: 'x', alts: ['y'.repeat(5000), 123, null, { a: 1 }] });
      await sleep(150);
      ok(vd.state.phase === 'drawing', 'malformed / oversized alternatives are sanitised safely');
      // host turns voice guessing off -> alternatives ignored (takes effect next game; flip mid-game via lobby only)
      vs.forEach(c => c.s.close());
      const w1 = client('W1'), w2 = client('W2'), w3 = client('W3');
      const wr = await emitAck(w1, 'room:create', { name: 'W1', pid: w1.pid });
      for (const c of [w2, w3]) await emitAck(c, 'room:join', { code: wr.code, name: c.name, pid: c.pid });
      w1.s.emit('settings:update', { voiceGuess: false, drawTime: 60 });
      await waitFor(() => w2.state && w2.state.settings.voiceGuess === false, 2000);
      w1.s.emit('game:start');
      await waitFor(() => w1.state.phase === 'choosing', 3000);
      const wd = [w1, w2, w3].find(c => c.pid === w1.state.drawerId);
      wd.s.emit('word:choose', 0);
      await waitFor(() => wd.state.phase === 'drawing' && wd.state.hint.full, 2000);
      const ww = wd.state.hint.ta.map(x => x.c || ' ').join('');
      const wg = [w1, w2, w3].find(c => c !== wd);
      wg.s.emit('chat', { text: 'zzz', alts: ['zzz', ww] });
      await sleep(250);
      ok(!wd.state.players.find(p => p.id === wg.pid).guessed, 'with "Voice guessing: Off" the alternatives are ignored');
      wg.s.emit('chat', { text: ww });
      await waitFor(() => wd.state.players.find(p => p.id === wg.pid).guessed, 2000);
      ok(true, 'object payload with just text still works as a normal guess');
      [w1, w2, w3].forEach(c => c.s.close());
    }

    // ---- English word list mode ----
    {
      const EN = require('../data/words-en.json').words;
      const enSet = new Map(EN.map(w => [w.word, w]));
      const e1 = client('E1'), e2 = client('E2'), e3 = client('E3');
      const er = await emitAck(e1, 'room:create', { name: 'E1', pid: e1.pid });
      for (const c of [e2, e3]) await emitAck(c, 'room:join', { code: er.code, name: c.name, pid: c.pid });
      await waitFor(() => e1.state && e1.state.settings.wordLang === 'ta', 2000);
      ok(true, "word language defaults to Tamil ('ta')");
      e1.s.emit('settings:update', { wordLang: 'en', drawTime: 60, rounds: 2, wordCount: 3 });
      await waitFor(() => e3.state.settings.wordLang === 'en', 2000, 'en setting');
      e1.s.emit('game:start');
      await waitFor(() => e1.state.phase === 'choosing', 3000);
      const es = [e1, e2, e3];
      const ed = es.find(c => c.pid === e1.state.drawerId);
      const ech = await waitFor(() => ed.state.choices, 2000, 'en choices');
      ok(ech.length === 3 && ech.every(w => enSet.has(w.ta) && w.lang === 'en'), `English mode offers 3 English words: ${ech.map(w => w.ta).join(', ')}`);
      // pick the longest word for blank / close tests
      const idx = ech.map(w => w.ta.length).reduce((bi, l, i, a) => l > a[bi] ? i : bi, 0);
      const ew = ech[idx].ta;
      ed.s.emit('word:choose', idx);
      await waitFor(() => ed.state.phase === 'drawing', 2000);
      const [eg1, eg2] = es.filter(c => c !== ed);
      const eh = eg1.state.hint;
      const letters = ew.replace(/[^a-z]/g, '').length;
      const spaces = (ew.match(/ /g) || []).length;
      ok(eh.count === letters && eh.ta.filter(x => x.s).length === spaces && eh.ta.every(x => x.s || !x.c || x.c === '-'), `guessers see ${letters} letter blanks${spaces ? ` + ${spaces} space(s)` : ''} for "${ew}" (no letters leaked)`);
      ok(!ed.state.hint.meaning && !ed.state.hint.translit && ed.state.hint.full, 'drawer sees the English word with nothing extra under it');
      if (ew.replace(/ /g, '').length >= 4) {
        const typo = ew.slice(0, -1) + (ew.slice(-1) === 'z' ? 'y' : 'z');
        const n0 = eg1.chats.length;
        eg1.s.emit('chat', typo);
        await waitFor(() => eg1.chats.slice(n0).some(m => m.kind === 'close'), 2000, 'en close');
        ok(true, `English near-miss "${typo}" gets a "close!" notice`);
      }
      eg1.s.emit('chat', '  ' + ew.toUpperCase() + ' ');
      await waitFor(() => ed.state.players.find(p => p.id === eg1.pid).guessed, 2000, 'en guess');
      ok(true, `English guess "${ew.toUpperCase()}" accepted (case-insensitive)`);
      eg2.s.emit('chat', ew.replace(/ /g, ''));
      await waitFor(() => es.every(c => c.state.phase === 'turnEnd'), 3000, 'en turn end');
      ok(eg2.state.lastTurn.word.ta === ew && eg2.state.lastTurn.reason === 'allGuessed', 'guess without spaces accepted; turn ends with English word revealed');
      es.forEach(c => c.s.close());

      // difficulty + category filters apply to the English list
      const f1 = client('F1'), f2 = client('F2');
      const fr = await emitAck(f1, 'room:create', { name: 'F1', pid: f1.pid });
      await emitAck(f2, 'room:join', { code: fr.code, name: 'F2', pid: f2.pid });
      f1.s.emit('settings:update', { wordLang: 'en', difficulty: 'easy', category: 'animals', wordCount: 5 });
      await waitFor(() => f2.state && f2.state.settings.category === 'animals', 2000);
      f1.s.emit('game:start');
      await waitFor(() => f1.state.phase === 'choosing', 3000);
      const fd = [f1, f2].find(c => c.pid === f1.state.drawerId);
      const fch = await waitFor(() => fd.state.choices, 2000);
      ok(fch.length === 5 && fch.every(w => enSet.get(w.ta) && enSet.get(w.ta).difficulty === 'easy' && enSet.get(w.ta).category === 'animals'), `difficulty "easy" + category "animals" filter English words: ${fch.map(w => w.ta).join(', ')}`);
      [f1, f2].forEach(c => c.s.close());

      // mixed mode: every offer has both Tamil and English words
      const x1 = client('X1'), x2 = client('X2');
      const xr = await emitAck(x1, 'room:create', { name: 'X1', pid: x1.pid });
      await emitAck(x2, 'room:join', { code: xr.code, name: 'X2', pid: x2.pid });
      x1.s.emit('settings:update', { wordLang: 'mixed', wordCount: 3, drawTime: 60 });
      await waitFor(() => x2.state && x2.state.settings.wordLang === 'mixed', 2000);
      x1.s.emit('game:start');
      let mixedOk = true, tamilGuessed = false, englishGuessed = false;
      for (let turn = 0; turn < 4; turn++) {
        await waitFor(() => x1.state.phase === 'choosing' && x2.state.phase === 'choosing', 9000, 'mixed choosing');
        const xd = [x1, x2].find(c => c.pid === x1.state.drawerId), xg = [x1, x2].find(c => c !== xd);
        const xch = await waitFor(() => xd.state.choices, 2000);
        const langs = new Set(xch.map(w => w.lang));
        if (!(langs.has('ta') && langs.has('en'))) mixedOk = false;
        const pickLang = turn % 2 ? 'en' : 'ta';
        const pi = xch.findIndex(w => w.lang === pickLang);
        xd.s.emit('word:choose', pi);
        await waitFor(() => xd.state.phase === 'drawing', 2000);
        xg.s.emit('chat', xch[pi].ta);
        await waitFor(() => xd.state.phase === 'turnEnd' || xd.state.phase === 'gameEnd', 3000, 'mixed guess');
        if (pickLang === 'ta') tamilGuessed = true; else englishGuessed = true;
      }
      ok(mixedOk, 'mixed mode: every word offer contains both Tamil (த) and English (EN) words (4 turns)');
      ok(tamilGuessed && englishGuessed, 'mixed mode: Tamil and English words can both be guessed');
      [x1, x2].forEach(c => c.s.close());
    }

    // fresh room for the hint test
    const h1 = client('H1'), h2 = client('H2');
    const hr = await emitAck(h1, 'room:create', { name: 'H1', pid: h1.pid });
    await emitAck(h2, 'room:join', { code: hr.code, name: 'H2', pid: h2.pid });
    h1.s.emit('settings:update', { drawTime: 30, hints: 2, wordMode: 'both', difficulty: 'hard' });
    await sleep(150);
    h1.s.emit('game:start');
    await waitFor(() => h1.state && h1.state.phase === 'choosing' && h2.state.phase === 'choosing', 3000);
    const hd = [h1, h2].find(c => c.pid === h1.state.drawerId), hg = [h1, h2].find(c => c !== hd);
    hd.s.emit('word:choose', 0);
    await waitFor(() => hg.state.phase === 'drawing', 2000);
    ok(typeof hg.state.hint.en === 'string' && /^[_ ]+$/.test(hg.state.hint.en), "'both' word mode shows English letter blanks too");
    await waitFor(() => hg.state.hint.ta.some(x => x.c), 14000, 'first hint');
    ok(hg.state.hint.ta.filter(x => x.c).length === 1, 'a hint reveals one Tamil letter (grapheme) after ~35% of draw time');
    [h1, h2].forEach(c => c.s.close());

    console.log(`\nALL ${passed} CHECKS PASSED ✅`);
    [...all, late, anna2].forEach(c => c.s.close());
    srv && srv.kill();
    process.exit(0);
  } catch (e) {
    console.error('\nTEST FAILED ❌', e);
    srv && srv.kill();
    process.exit(1);
  }
})();

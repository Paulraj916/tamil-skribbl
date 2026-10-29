// Mobile on-screen-keyboard layout check (headless Chrome).
// Simulates the keyboard opening by shrinking the viewport while the guess input is focused
// (what Android Chrome does with interactive-widget=resizes-content), then checks that the
// word hint (top bar), the guess input and a scrollable chat all stay on screen without the page scrolling.
// Usage: node test/mobile-keyboard.js [label]   -> screenshots/kb-<label>-*.png
const { chromium, devices } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const PORT = 3127, URL = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, '..', 'screenshots');
const LABEL = process.argv[2] || 'after';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let srv;
const DEVICES = [
  { name: 'iphone13', dev: devices['iPhone 13'], kbH: 340 },
  { name: 'pixel7', dev: devices['Pixel 7'], kbH: 420 },
];

function sock() { const s = io(URL, { transports: ['websocket'] }); s.st = null; s.on('state', x => s.st = x); return s; }

async function run(browser, D) {
  const host = sock(), p2 = sock();
  const code = await new Promise(r => host.emit('room:create', { name: 'Host', avatar: { color: 1, eyes: 1, mouth: 1, extra: 1 }, pid: 'host-' + D.name + '-123456' }, res => r(res.code)));
  await new Promise(r => p2.emit('room:join', { code, name: 'Appa', avatar: { color: 2, eyes: 2, mouth: 2, extra: 2 }, pid: 'appa-' + D.name + '-123456' }, r));
  const ctx = await browser.newContext({ ...D.dev });
  const M = await ctx.newPage();
  const errs = []; M.on('pageerror', e => errs.push(e.message));
  await M.goto(URL + '/?room=' + code);
  await M.fill('#nameInput', 'அம்மா');
  await M.click('#joinInviteBtn');
  await M.waitForSelector('#lobby:not([hidden])');
  host.emit('settings:update', { drawTime: 240 });
  await sleep(300);
  host.emit('game:start');
  // advance until the mobile player is a guesser in the drawing phase
  for (let i = 0; i < 60; i++) {
    const s = await M.evaluate(() => window.__ts.state);
    if (s.phase === 'drawing' && s.drawerId !== s.you) break;
    if (s.phase === 'choosing') {
      if (s.drawerId === s.you) await M.click('.choice >> nth=0').catch(() => {});
      for (const k of [host, p2]) if (k.st && k.st.drawerId === k.st.you) k.emit('word:choose', 0);
    } else if (s.phase === 'drawing') { // mobile is drawing: let the others guess to end the turn
      const h = s.hint; const w = h.ta.map(x => x.c || ' ').join('');
      host.emit('chat', w); p2.emit('chat', w);
    }
    await sleep(700);
  }
  await sleep(2500); // round banner
  for (let i = 0; i < 25; i++) { (i % 2 ? host : p2).emit('chat', 'guess number ' + i + ' 🙂'); }
  await sleep(500);
  const { width, height } = D.dev.viewport;
  await M.screenshot({ path: path.join(OUT, `kb-${LABEL}-${D.name}-1-normal.png`) });
  // "open the keyboard": focus input, shrink viewport, let the browser scroll the input into view
  await M.focus('#chatInput');
  await M.type('#chatInput', 'யானை');
  await M.setViewportSize({ width, height: D.kbH });
  await sleep(400);
  await M.evaluate(() => document.getElementById('chatInput').scrollIntoView({ block: 'nearest' }));
  await sleep(300);
  await M.screenshot({ path: path.join(OUT, `kb-${LABEL}-${D.name}-2-keyboard.png`) });
  const m = await M.evaluate(() => {
    const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    const log = document.getElementById('chatLog');
    const before = log.scrollTop; log.scrollTop = 0; const moved = log.scrollTop !== before; log.scrollTop = log.scrollHeight;
    return { vh: innerHeight, scrollY: Math.round(scrollY), docH: document.documentElement.scrollHeight, word: r('wordArea'), input: r('chatInput'), log: r('chatLog'), logScrollable: log.scrollHeight > log.clientHeight && moved };
  });
  const checks = {
    'word hint fully visible': m.word.top >= 0 && m.word.bottom <= m.vh && m.word.h > 10,
    'guess input fully visible': m.input.top >= 0 && m.input.bottom <= m.vh,
    'page did not scroll / overflow': m.scrollY === 0 && m.docH <= m.vh + 1,
    'chat log has room (>=60px) and scrolls': m.log.h >= 60 && m.logScrollable,
  };
  // close the keyboard again
  await M.evaluate(() => document.activeElement.blur());
  await M.setViewportSize({ width, height });
  await sleep(400);
  const back = await M.evaluate(() => ({ scrollY, docH: document.documentElement.scrollHeight, vh: innerHeight }));
  checks['layout restored after keyboard closes'] = back.scrollY === 0 && back.docH <= back.vh + 1;
  await M.screenshot({ path: path.join(OUT, `kb-${LABEL}-${D.name}-3-closed.png`) });
  if (errs.length) checks['no page errors'] = false;
  await ctx.close(); host.close(); p2.close();
  return { m, checks };
}

(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, TURN_END_MS: 1500 }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  let fail = 0;
  for (const D of DEVICES) {
    const { m, checks } = await run(browser, D);
    console.log(`\n${D.name} (${D.dev.viewport.width}x${D.dev.viewport.height} -> keyboard ${D.kbH}px):`, JSON.stringify(m));
    for (const [k, v] of Object.entries(checks)) { console.log(`  ${v ? '✔' : '✘'} ${k}`); if (!v) fail++; }
  }
  await browser.close(); srv.kill();
  console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL MOBILE KEYBOARD CHECKS PASSED ✅');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv && srv.kill(); process.exit(1); });

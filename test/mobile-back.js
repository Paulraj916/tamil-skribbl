// Mobile back-button / back-gesture / touch guard check (headless Chrome, iPhone 13 + Pixel 7 emulation, plus desktop).
// While in a game: the browser back (button or swipe gesture) must show an in-app "Leave the game?" confirm
// instead of leaving the page (also on repeated presses), Leave must exit cleanly, the canvas must not scroll,
// zoom, refresh or open the long-press menu, and closing/reloading the tab must ask first.
// Usage: node test/mobile-back.js   -> screenshots/back-confirm-<device>.png
const { chromium, devices } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const PORT = 3128, URL = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, '..', 'screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let srv;
const DEVICES = [
  { name: 'iphone13', dev: devices['iPhone 13'] },
  { name: 'pixel7', dev: devices['Pixel 7'] },
  { name: 'desktop', dev: { viewport: { width: 1280, height: 800 } } },
];
function sock() { const s = io(URL, { transports: ['websocket'] }); s.st = null; s.on('state', x => s.st = x); return s; }
const word = st => st.hint.ta.map(x => x.c || ' ').join('');

async function run(browser, D) {
  const checks = {};
  const host = sock(), p2 = sock();
  const code = await new Promise(r => host.emit('room:create', { name: 'Host', avatar: { color: 1, eyes: 1, mouth: 1, extra: 1 }, pid: 'host-b-' + D.name + '-123456' }, res => r(res.code)));
  await new Promise(r => p2.emit('room:join', { code, name: 'Appa', avatar: { color: 2, eyes: 2, mouth: 2, extra: 2 }, pid: 'appa-b-' + D.name + '-123456' }, r));
  const ctx = await browser.newContext({ ...D.dev });
  const M = await ctx.newPage();
  const errs = []; M.on('pageerror', e => errs.push(e.message));
  await M.goto(URL + '/');                          // a page "before" the game, so a real back would leave the game page
  await M.goto(URL + '/?room=' + code);
  await M.fill('#nameInput', 'அம்மா');
  await M.click('#joinInviteBtn');
  await M.waitForSelector('#lobby:not([hidden])');
  host.emit('settings:update', { drawTime: 240 });
  await sleep(300);
  host.emit('game:start');
  // advance until the phone player is the drawer
  for (let i = 0; i < 80; i++) {
    const s = await M.evaluate(() => window.__ts.state);
    if (s.phase === 'drawing' && s.drawerId === s.you) break;
    if (s.phase === 'choosing') {
      if (s.drawerId === s.you) await M.click('.choice >> nth=0').catch(() => {});
      for (const k of [host, p2]) if (k.st && k.st.drawerId === k.st.you) k.emit('word:choose', 0);
    } else if (s.phase === 'drawing') {         // a socket player draws: everyone else guesses to end the turn
      const d = [host, p2].find(k => k.st && k.st.drawerId === k.st.you);
      if (d) { const w = word(d.st); for (const k of [host, p2]) if (k !== d) k.emit('chat', w); await M.evaluate(w => window.__ts.socket.emit('chat', w), w); }
    }
    await sleep(600);
  }
  await sleep(2600); // round banner
  const st0 = await M.evaluate(() => window.__ts.state);
  checks['phone player is drawing'] = st0.phase === 'drawing' && st0.drawerId === st0.you;

  // --- touch / CSS guards
  const css = await M.evaluate(() => {
    const c = getComputedStyle(document.getElementById('canvas')), h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body);
    return { ta: c.touchAction, us: c.userSelect || c.webkitUserSelect, callout: c.webkitTouchCallout, ox: h.overscrollBehaviorX, oy: h.overscrollBehaviorY, bx: b.overscrollBehaviorX, by: b.overscrollBehaviorY };
  });
  checks['canvas touch-action: none'] = css.ta === 'none';
  checks['canvas not selectable'] = css.us === 'none';
  checks['no overscroll / pull-to-refresh / swipe-nav on html+body'] = [css.ox, css.oy, css.bx, css.by].every(v => v === 'none');
  checks['long-press menu blocked on canvas'] = await M.evaluate(() => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('canvas').dispatchEvent(ev); return ev.defaultPrevented; });
  checks['touchstart/touchmove on canvas are cancelled'] = await M.evaluate(() => {
    if (typeof Touch === 'undefined' || !('ontouchstart' in window)) return true; // desktop: n/a
    const c = document.getElementById('canvas'), r = c.getBoundingClientRect();
    const t = new Touch({ identifier: 1, target: c, clientX: r.left + 10, clientY: r.top + 10 });
    const a = new TouchEvent('touchstart', { cancelable: true, bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] });
    const b = new TouchEvent('touchmove', { cancelable: true, bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] });
    c.dispatchEvent(a); c.dispatchEvent(b); return a.defaultPrevented && b.defaultPrevented;
  });
  // real drag across the canvas (touch on phones, mouse on desktop): it should draw and the page must not move
  const box = await M.locator('#canvas').boundingBox();
  const x0 = box.x + box.width * .2, y0 = box.y + box.height * .3, x1 = box.x + box.width * .8, y1 = box.y + box.height * .7;
  if (D.dev.hasTouch) {
    const cdp = await ctx.newCDPSession(M);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await tp('touchStart', x0, y0);
    for (let i = 1; i <= 15; i++) { await tp('touchMove', x0 + (x1 - x0) * i / 15, y0 + (y1 - y0) * i / 15); await sleep(16); }
    await tp('touchEnd');
    // a downward "pull" swipe starting at the top of the canvas (pull-to-refresh / scroll attempt)
    await tp('touchStart', x0, box.y + 4);
    for (let i = 1; i <= 15; i++) { await tp('touchMove', x0, box.y + 4 + 25 * i); await sleep(16); }
    await tp('touchEnd');
  } else {
    await M.mouse.move(x0, y0); await M.mouse.down();
    for (let i = 1; i <= 15; i++) await M.mouse.move(x0 + (x1 - x0) * i / 15, y0 + (y1 - y0) * i / 15);
    await M.mouse.up();
  }
  await sleep(300);
  const drawn = await M.evaluate(() => {
    const c = document.getElementById('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) n++;
    return { ink: n, scrollY: scrollY, url: location.href, active: document.getElementById('game').classList.contains('active') };
  });
  checks['drag on canvas draws'] = drawn.ink > 200;
  checks['drag on canvas does not scroll / leave the page'] = drawn.scrollY === 0 && drawn.active && drawn.url.includes('room=' + code);

  // --- back button / back gesture (both fire a history traversal) → confirm, stay
  const visible = () => M.evaluate(() => !document.getElementById('leaveConfirm').hidden);
  const inGame = () => M.evaluate(c => document.getElementById('game').classList.contains('active') && location.search.includes(c) && !!window.__ts.state, code);
  await M.evaluate(() => history.back()); await sleep(400);
  checks['back → "Leave the game?" confirm shown, still on the game page'] = await visible() && await inGame();
  await M.screenshot({ path: path.join(OUT, `back-confirm-${D.name}.png`) });
  await M.click('#leaveStay'); await sleep(200);
  checks['Stay closes the confirm and keeps playing'] = !(await visible()) && await inGame();
  let repeated = true;
  for (let i = 0; i < 3; i++) {
    await M.evaluate(() => history.back()); await sleep(350);
    repeated = repeated && await visible() && await inGame();
    if (i < 2) { await M.click('#leaveStay'); await sleep(150); }
  }
  checks['repeated back presses are caught every time'] = repeated;
  // back pressed again while the confirm is open: still on the page
  await M.evaluate(() => history.back()); await sleep(350);
  checks['back while confirm open does not leave'] = await visible() && await inGame();
  // Playwright's own goBack (browser back button)
  await M.click('#leaveStay'); await sleep(150);
  await M.goBack({ timeout: 1500 }).catch(() => {}); await sleep(350);
  checks['browser back button (page.goBack) also caught'] = await visible() && await inGame();
  await M.click('#leaveStay'); await sleep(150);

  // --- close tab / reload during the game → beforeunload prompt
  let bu = null;
  M.once('dialog', d => { bu = d.type(); d.dismiss().catch(() => {}); });
  await M.close({ runBeforeUnload: true }); await sleep(600);
  checks['closing/reloading mid-game asks first (beforeunload)'] = bu === 'beforeunload' && !M.isClosed() && await inGame();

  // --- 🚪 button uses the same confirm; Leave exits cleanly
  await M.click('[data-action="leave"]'); await sleep(200);
  checks['🚪 button shows the same confirm'] = await visible();
  await M.click('#leaveStay'); await sleep(150);
  await M.evaluate(() => history.back()); await sleep(350);
  await M.click('#leaveGo'); await sleep(600);
  const after = await M.evaluate(() => ({ home: document.getElementById('home').classList.contains('active'), game: document.getElementById('game').classList.contains('active'), room: sessionStorage.getItem('ts_room'), search: location.search, conf: !document.getElementById('leaveConfirm').hidden }));
  checks['Leave → back on the home screen, room left'] = after.home && !after.game && !after.room && after.search === '' && !after.conf && host.st.players.length === 2;
  // after leaving, back is a normal back again (no confirm)
  await M.evaluate(() => history.back()); await sleep(400);
  checks['after leaving, back works normally (no confirm)'] = !(await M.evaluate(() => !document.getElementById('leaveConfirm').hidden));
  checks['no page errors'] = errs.length === 0;
  if (errs.length) console.log(errs);
  await ctx.close(); host.close(); p2.close();
  return { checks, drawn };
}

(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, TURN_END_MS: 1500 }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  let fail = 0;
  for (const D of DEVICES) {
    const { checks, drawn } = await run(browser, D);
    console.log(`\n${D.name}: ink=${drawn.ink}px scrollY=${drawn.scrollY}`);
    for (const [k, v] of Object.entries(checks)) { console.log(`  ${v ? '✔' : '✘'} ${k}`); if (!v) fail++; }
  }
  await browser.close(); srv.kill();
  console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL BACK-GUARD CHECKS PASSED ✅');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv && srv.kill(); process.exit(1); });

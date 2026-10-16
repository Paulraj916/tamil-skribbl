// Headless browser screenshots (desktop + mobile) of the main screens.
const { chromium, devices } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const PORT = 3124, URL = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, '..', 'screenshots');
let srv0 = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, TURN_END_MS: 3000 }, stdio: ['ignore', 'pipe', 'inherit'] });
  srv0 = srv;
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const desk = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const mob = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
  const D = await desk.newPage(), M = await mob.newPage();
  for (const [n, p] of [['desktop', D], ['mobile', M]]) {
    p.on('pageerror', e => errors.push(n + ': ' + e.message));
    p.on('console', m => m.type() === 'error' && errors.push(n + ' console: ' + m.text()));
  }
  const shot = async (p, name) => { await sleep(350); await p.screenshot({ path: path.join(OUT, name + '.png') }); console.log('saved', name); };

  await D.goto(URL); await M.goto(URL);
  await D.fill('#nameInput', 'Madha'); await M.fill('#nameInput', 'அம்மா');
  await sleep(500);
  await shot(D, '01-home-desktop'); await shot(M, '01-home-mobile');

  await D.click('#createBtn');
  await D.waitForSelector('#inviteLink');
  const link = await D.inputValue('#inviteLink');
  await M.goto(link);
  await M.fill('#nameInput', 'அம்மா');
  await shot(M, '02-invite-mobile');
  await M.click('#joinInviteBtn');
  await M.waitForSelector('#lobby:not([hidden])');
  // third player: Appa via socket
  const appa = io(URL, { transports: ['websocket'] });
  let appaState = null; appa.on('state', s => appaState = s);
  const code = link.split('room=')[1];
  await new Promise(r => appa.emit('room:join', { code, name: 'அப்பா', avatar: { color: 5, eyes: 3, mouth: 1, extra: 2 }, pid: 'appa-123456789' }, r));
  await D.selectOption('select[data-set="drawTime"]', '90');
  await D.selectOption('select[data-set="hints"]', '3');
  await D.selectOption('select[data-set="rounds"]', '2');
  await D.evaluate(() => { const ws = window.__ts.socket; ws.emit('chat', 'வணக்கம்! Ready?'); });
  appa.emit('chat', 'Ready 👍');
  await sleep(500);
  await shot(D, '03-lobby-desktop'); await shot(M, '03-lobby-mobile');

  await D.click('#startBtn');
  await D.waitForSelector('.choice');
  await sleep(2400); // round banner
  await shot(D, '04-choose-word-desktop'); await shot(M, '04-someone-choosing-mobile');
  // choose the word
  await D.click('.choice >> nth=0');
  await sleep(400);

  // draw a scene on desktop canvas
  const box = await D.locator('#canvas').boundingBox();
  const sx = box.width / 800, sy = box.height / 600;
  const P = (x, y) => [box.x + x * sx, box.y + y * sy];
  async function stroke(pts) { await D.mouse.move(...P(...pts[0])); await D.mouse.down(); for (const p of pts.slice(1)) await D.mouse.move(...P(...p), { steps: 4 }); await D.mouse.up(); }
  async function color(c) { await D.click(`.swatch[data-c="${c}"]`); }
  async function size(s) { await D.click(`.size[data-s="${s}"]`); }
  // ground
  await color('#00cc00'); await size(40); await stroke([[0, 540], [200, 530], [400, 545], [600, 530], [800, 540]]);
  // house
  await color('#a0522d'); await size(8);
  await stroke([[250, 500], [250, 330], [450, 330], [450, 500], [250, 500]]);
  await stroke([[230, 335], [350, 230], [470, 335], [230, 335]]);
  await D.click('.tool[data-tool="fill"]'); await color('#ffac8e'); await D.mouse.click(...P(350, 420));
  await color('#ef130b'); await D.mouse.click(...P(350, 300));
  await D.click('.tool[data-tool="pen"]'); await color('#00569e'); await size(8);
  await stroke([[320, 500], [320, 430], [380, 430], [380, 500]]);
  // sun
  await color('#ffe400'); await size(40);
  const sun = []; for (let a = 0; a <= 360; a += 20) sun.push([650 + 45 * Math.cos(a * Math.PI / 180), 110 + 45 * Math.sin(a * Math.PI / 180)]);
  await stroke(sun);
  await D.click('.tool[data-tool="fill"]'); await D.mouse.click(...P(650, 110));
  await D.click('.tool[data-tool="pen"]'); await size(4); await color('#ff7100');
  for (let a = 0; a < 360; a += 45) { const r1 = 70, r2 = 95, c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); await stroke([[650 + r1 * c, 110 + r1 * s], [650 + r2 * c, 110 + r2 * s]]); }
  // kolam dots
  await color('#e8a200'); await size(14);
  for (let i = 0; i < 5; i++) await stroke([[90 + i * 22, 560], [91 + i * 22, 561]]);
  await color('#000000'); await size(4);
  await stroke([[120, 140], [140, 130], [160, 140]]); await stroke([[170, 120], [190, 110], [210, 120]]);
  await sleep(600);
  // guesses from mobile: a wrong guess
  await M.fill('#chatInput', 'வீடா?'); await M.press('#chatInput', 'Enter');
  await sleep(300);
  appa.emit('chat', 'house'); // maybe right, maybe wrong
  await sleep(1200);
  await shot(D, '05-drawing-desktop'); await shot(M, '05-guessing-mobile');

  // let mobile guess correctly using drawer's word
  const word = await D.evaluate(() => window.__ts.state.hint.ta.map(x => x.c || ' ').join(''));
  await M.fill('#chatInput', word); await M.press('#chatInput', 'Enter');
  await sleep(900);
  await shot(M, '06-guessed-mobile');
  const appaWord = await D.evaluate(() => window.__ts.state.hint.translit);
  appa.emit('chat', appaWord);
  await sleep(700);
  await shot(D, '07-turn-end-desktop'); await shot(M, '07-turn-end-mobile');

  // next turn: whoever draws next
  await sleep(3500);
  const st = await M.evaluate(() => window.__ts.state);
  const mobIsDrawer = st.drawerId === st.you;
  if (mobIsDrawer) {
    await M.waitForSelector('.choice'); await shot(M, '08-choose-word-mobile');
    await M.click('.choice >> nth=1'); await sleep(500);
    const mb = await M.locator('#canvas').boundingBox();
    const mp = (x, y) => [mb.x + x * mb.width / 800, mb.y + y * mb.height / 600];
    await M.click('.swatch[data-c="#231fd3"]');
    await M.click('.size[data-s="14"]');
    // touch-ish drawing via mouse on mobile emulation
    async function mstroke(pts) { await M.mouse.move(...mp(...pts[0])); await M.mouse.down(); for (const p of pts.slice(1)) await M.mouse.move(...mp(...p), { steps: 3 }); await M.mouse.up(); }
    const circ = []; for (let a = 0; a <= 360; a += 15) circ.push([400 + 150 * Math.cos(a * Math.PI / 180), 300 + 150 * Math.sin(a * Math.PI / 180)]);
    await mstroke(circ);
    await M.click('.swatch[data-c="#ef130b"]');
    await mstroke([[330, 260], [332, 262]]); await mstroke([[470, 260], [472, 262]]);
    await mstroke([[320, 350], [400, 400], [480, 350]]);
    await sleep(600);
    await shot(M, '08-drawing-mobile'); await shot(D, '08-guessing-desktop');
  } else {
    await sleep(1500);
    await shot(M, '08-waiting-mobile'); await shot(D, '08-other-desktop');
  }
  // fast-forward: end the game to show podium by leaving flow quickly: set many guesses
  for (let i = 0; i < 80; i++) {
    const s = await D.evaluate(() => window.__ts.state);
    if (s.phase === 'gameEnd') break;
    // drawer picks
    const drawerPage = s.drawerId === s.you ? D : (await M.evaluate(() => window.__ts.state.drawerId === window.__ts.state.you)) ? M : null;
    if (s.phase === 'choosing') {
      if (drawerPage) { await drawerPage.click('.choice >> nth=0').catch(() => {}); }
      else if (appaState && appaState.drawerId === appaState.you) appa.emit('word:choose', 0);
      await sleep(400); continue;
    }
    if (s.phase === 'drawing') {
      // get the word from whoever knows it
      let w = null;
      for (const p of [D, M]) { const h = await p.evaluate(() => window.__ts.state.hint); if (h && h.full) { w = h.ta.map(x => x.c || ' ').join(''); break; } }
      if (!w && appaState && appaState.hint && appaState.hint.full) w = appaState.hint.ta.map(x => x.c || ' ').join('');
      if (w) { for (const p of [D, M]) await p.evaluate(w => window.__ts.socket.emit('chat', w), w); appa.emit('chat', w); }
      await sleep(600); continue;
    }
    await sleep(800);
  }
  await D.waitForFunction(() => window.__ts.state.phase === 'gameEnd', null, { timeout: 30000 });
  await sleep(1500);
  await shot(D, '09-podium-desktop'); await shot(M, '09-podium-mobile');
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close(); appa.close(); srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv0 && srv0.kill(); process.exit(1); });

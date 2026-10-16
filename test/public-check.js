// Verifies the public URL serves the app and websockets work through it.
const { io } = require('socket.io-client');
const URL = process.argv[2];
const mk = () => io(URL, { transports: ['websocket'], forceNew: true, timeout: 15000 });
const ack = (s, e, d) => new Promise(r => s.emit(e, d, r));
(async () => {
  const a = mk(), b = mk();
  await Promise.all([a, b].map(s => new Promise((r, j) => { s.on('connect', r); s.on('connect_error', j); })));
  console.log('websocket transport:', a.io.engine.transport.name, b.io.engine.transport.name);
  const r = await ack(a, 'room:create', { name: 'Check-A', pid: 'publiccheck-a-' + Date.now() });
  const r2 = await ack(b, 'room:join', { code: r.code, name: 'Check-B', pid: 'publiccheck-b-' + Date.now() });
  const got = new Promise(res => b.on('chat', m => m.text === 'வணக்கம் via tunnel' && res(m)));
  a.emit('chat', 'வணக்கம் via tunnel');
  const m = await Promise.race([got, new Promise((_, j) => setTimeout(() => j(new Error('no chat relay')), 8000))]);
  let st; b.on('state', s => st = s);
  a.emit('game:start');
  await new Promise(res => { const t = setInterval(() => { if (st && st.phase === 'choosing') { clearInterval(t); res(); } }, 50); });
  console.log('room', r.code, 'join ok:', r2.ok, '| chat relayed:', m.name, '->', m.text, '| game started, phase:', st.phase);
  a.emit('room:leave'); b.emit('room:leave');
  setTimeout(() => { a.close(); b.close(); console.log('PUBLIC WEBSOCKET CHECK PASSED'); process.exit(0); }, 300);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });

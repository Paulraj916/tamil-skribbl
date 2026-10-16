// Tiny Web Audio synth for game sounds.
window.Sound = (() => {
  let ctx = null, enabled = localStorage.getItem('ts_sound') !== '0';
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type = 'sine', vol = 0.2, slide = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sounds = {
    correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.22)); },
    tick() { tone(1200, 0, 0.05, 'square', 0.06); },
    turn() { [0, 0.0].forEach(() => { tone(880, 0, 1.4, 'sine', 0.18); tone(1320, 0, 1.0, 'sine', 0.07); tone(2210, 0, 0.6, 'sine', 0.03); }); },
    join() { tone(660, 0, 0.12, 'sine', 0.15); tone(880, 0.1, 0.15, 'sine', 0.15); },
    leave() { tone(660, 0, 0.12, 'sine', 0.12); tone(440, 0.1, 0.18, 'sine', 0.12); },
    roundEnd() { [784, 659, 523].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.18)); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.2)); },
    close() { tone(440, 0, 0.1, 'sawtooth', 0.06); tone(520, 0.08, 0.12, 'sawtooth', 0.06); },
    like() { tone(990, 0, 0.1, 'sine', 0.12, 1.5); },
    dislike() { tone(300, 0, 0.18, 'sine', 0.12, 0.6); },
    pop() { tone(700, 0, 0.06, 'sine', 0.1, 1.6); },
  };
  return {
    play(name) { if (enabled && sounds[name]) try { sounds[name](); } catch (e) {} },
    unlock() { ac(); },
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; localStorage.setItem('ts_sound', enabled ? '1' : '0'); return enabled; },
  };
})();

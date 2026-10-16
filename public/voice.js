// Voice guessing via the Web Speech API (Chrome, Edge, Safari). Tamil (ta-IN) by default, toggle to en-IN.
window.Voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let o = null, rec = null, listening = false, lang = localStorage.getItem('ts_voice_lang') || 'ta-IN';
  let denied = false, silenceTimer = null, enabled = false, gotFinal = false;
  const SILENCE_MS = 6000;

  function setTitle() {
    if (!o) return;
    const { btn, langBtn, t } = o;
    if (!SR) btn.title = t('voiceUnsupported');
    else if (denied) btn.title = t('voiceDenied');
    else btn.title = listening ? t('voiceStop') : t('voiceSpeak');
    langBtn.textContent = lang === 'ta-IN' ? 'த' : 'EN';
    langBtn.title = lang === 'ta-IN' ? t('voiceLangTa') : t('voiceLangEn');
  }
  function armSilence() { clearTimeout(silenceTimer); silenceTimer = setTimeout(stop, SILENCE_MS); }
  function stop() {
    clearTimeout(silenceTimer);
    if (rec) { try { rec.stop(); } catch (e) {} }
  }
  function cleanup() {
    listening = false; rec = null; clearTimeout(silenceTimer);
    o.btn.classList.remove('listening');
    o.input.placeholder = o.input.dataset.ph || o.input.placeholder;
    setTitle();
  }
  function start() {
    if (!SR || denied || listening || !enabled) return;
    rec = new SR();
    rec.lang = lang; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
    gotFinal = false;
    rec.onstart = () => {
      listening = true; o.btn.classList.add('listening');
      o.input.dataset.ph = o.input.placeholder; o.input.placeholder = o.t('voiceListening');
      setTitle(); armSilence();
    };
    rec.onresult = ev => {
      armSilence();
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const alts = [];
          for (let j = 0; j < r.length && j < 5; j++) { const tx = (r[j].transcript || '').trim(); if (tx && !alts.includes(tx)) alts.push(tx); }
          if (alts.length) {
            gotFinal = true;
            o.input.value = '';
            o.onFinal(alts[0], alts);
          }
          stop();
          return;
        } else interim += r[0].transcript;
      }
      o.input.value = interim; // live transcript in the input box
    };
    rec.onerror = ev => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        denied = true; o.btn.disabled = true; o.toast && o.toast(o.t('voiceDenied'));
      } else if (ev.error === 'no-speech') { o.toast && o.toast(o.t('voiceNoMatch')); }
    };
    rec.onend = () => { if (!gotFinal && o.input.value && listening) { /* keep interim text so user can send */ } cleanup(); };
    try { rec.start(); } catch (e) { cleanup(); }
  }
  function init(opts) {
    o = opts;
    o.btn.addEventListener('click', () => { if (listening) stop(); else { Sound && Sound.unlock && Sound.unlock(); start(); } });
    o.langBtn.addEventListener('click', () => {
      lang = lang === 'ta-IN' ? 'en-IN' : 'ta-IN'; localStorage.setItem('ts_voice_lang', lang); setTitle();
      if (listening) { stop(); }
    });
    setTitle();
  }
  // show only while guessing (not drawer, not yet guessed) and the host allows voice guessing
  function update(show) {
    if (!o) return;
    enabled = !!show;
    o.btn.hidden = !show; o.langBtn.hidden = !show || !SR || denied;
    o.btn.disabled = !SR || denied;
    if (!show && listening) stop();
    setTitle();
  }
  return { init, update, get supported() { return !!SR; }, get listening() { return listening; } };
})();

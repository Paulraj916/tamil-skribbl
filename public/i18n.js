// UI strings in English and Tamil.
window.I18N = (() => {
  const S = {
    en: {
      tagline: 'Tamil drawing & guessing game for the family', enterName: 'Enter your name', eyes: 'eyes', mouth: 'mouth', extra: 'style',
      createRoom: 'Create private room', join: 'Join', roomCode: 'Room code', joinInvite: 'Join room {code}',
      how1t: 'Draw', how1: 'Pick one of 3 Tamil words and draw it.', how2t: 'Guess', how2: 'Type your guess in Tamil (or English / Tanglish).',
      how3t: 'Win', how3: 'Faster guesses score more points!', wordsNote: '{n} Tamil words in {c} categories',
      settings: 'Room settings', players: 'Players', maxPlayers: 'Players', rounds: 'Rounds', drawTime: 'Draw time (s)', wordCount: 'Word choices', hints: 'Hints',
      wordMode: 'Word mode', normal: 'Normal', hidden: 'Hidden', both: 'Both (Tamil + English)', difficulty: 'Difficulty', all: 'All', easy: 'Easy', medium: 'Medium', hard: 'Hard',
      acceptEnglish: 'Accept English / Tanglish answers', customWords: 'Custom words', customHint: 'Comma separated. Optional meaning: கோலம்:kolam, பட்டம்:kite',
      customOnly: 'Use custom words only', start: 'Start!', invite: 'Invite your family', copy: 'Copy', copied: 'Copied!', share: 'Share',
      waitingHost: 'Waiting for the host to start the game…', needTwo: 'Need at least 2 players',
      chooseWord: 'Choose a word', isChoosing: '{name} is choosing a word…', wordWas: 'The word was', timeUp: 'Time is up!', allGuessed: 'Everyone guessed the word!', drawerLeft: 'The drawer left.',
      round: 'Round {r} of {n}', roundBig: 'Round {r}', drawThis: 'DRAW THIS', guessThis: 'GUESS THIS', waiting: 'WAITING', letters: '{n} letters', hiddenWord: 'Hidden word',
      chatGuess: 'Type your guess here…', chatPh: 'Type a message…', you: 'You', points: 'pts', host: 'Host', voteKick: 'Vote kick', kick: 'Kick',
      gameOver: 'Game over!', playAgain: 'Play again', waitingAgain: 'Waiting for the host…', leave: 'Leave room?', kicked: 'You were kicked from the room.',
      notfound: 'Room not found. Check the code.', full: 'This room is full.', banned: 'You were kicked from this room.', drawing: 'drawing', guessedIt: 'Guessed!', youGuessed: 'You guessed it! 🎉',
      tanglishTip: 'Tip: you can type in Tamil, English or Tanglish',
      voiceGuess: 'Voice guessing', voiceUnsupported: 'Voice guessing works in Chrome, Edge or Safari', voiceDenied: 'Microphone permission denied. Allow the mic in your browser settings. (Voice guessing works in Chrome, Edge or Safari)',
      voiceSpeak: 'Speak your guess', voiceListening: 'Listening… speak now', voiceStop: 'Tap to stop', voiceLangTa: 'Voice language: Tamil (tap for English)', voiceLangEn: 'Voice language: English (tap for Tamil)', voiceNoMatch: 'Didn\'t catch that, try again',
    },
    ta: {
      tagline: 'குடும்பத்துடன் விளையாடும் தமிழ் வரைதல் விளையாட்டு', enterName: 'உங்கள் பெயர்', eyes: 'கண்கள்', mouth: 'வாய்', extra: 'அலங்காரம்',
      createRoom: 'புதிய அறை உருவாக்கு', join: 'சேர்', roomCode: 'அறை குறியீடு', joinInvite: '{code} அறையில் சேர்',
      how1t: 'வரை', how1: '3 தமிழ் சொற்களில் ஒன்றைத் தேர்ந்தெடுத்து வரையுங்கள்.', how2t: 'கண்டுபிடி', how2: 'தமிழில் (அல்லது ஆங்கிலத்தில்) பதிலை எழுதுங்கள்.',
      how3t: 'வெல்', how3: 'சீக்கிரம் கண்டுபிடித்தால் அதிக புள்ளிகள்!', wordsNote: '{c} பிரிவுகளில் {n} தமிழ் சொற்கள்',
      settings: 'அறை அமைப்புகள்', players: 'வீரர்கள்', maxPlayers: 'வீரர்கள்', rounds: 'சுற்றுகள்', drawTime: 'வரையும் நேரம் (வி)', wordCount: 'சொல் தேர்வுகள்', hints: 'குறிப்புகள்',
      wordMode: 'சொல் முறை', normal: 'சாதாரணம்', hidden: 'மறைவு', both: 'இரண்டும் (தமிழ் + ஆங்கிலம்)', difficulty: 'கடினம்', all: 'அனைத்தும்', easy: 'எளிது', medium: 'நடுத்தரம்', hard: 'கடினம்',
      acceptEnglish: 'ஆங்கில / தங்கிலீஷ் பதில்களை ஏற்கவும்', customWords: 'சொந்த சொற்கள்', customHint: 'காற்புள்ளியால் பிரிக்கவும். எ.கா: கோலம்:kolam, பட்டம்:kite',
      customOnly: 'சொந்த சொற்கள் மட்டும்', start: 'தொடங்கு!', invite: 'குடும்பத்தினரை அழையுங்கள்', copy: 'நகலெடு', copied: 'நகலெடுக்கப்பட்டது!', share: 'பகிர்',
      waitingHost: 'ஆட்டத்தைத் தொடங்க காத்திருக்கிறோம்…', needTwo: 'குறைந்தது 2 வீரர்கள் தேவை',
      chooseWord: 'ஒரு சொல்லைத் தேர்ந்தெடுங்கள்', isChoosing: '{name} சொல்லைத் தேர்ந்தெடுக்கிறார்…', wordWas: 'சொல்', timeUp: 'நேரம் முடிந்தது!', allGuessed: 'எல்லோரும் கண்டுபிடித்தனர்!', drawerLeft: 'வரைபவர் வெளியேறினார்.',
      round: 'சுற்று {r} / {n}', roundBig: 'சுற்று {r}', drawThis: 'இதை வரையுங்கள்', guessThis: 'கண்டுபிடியுங்கள்', waiting: 'காத்திருப்பு', letters: '{n} எழுத்துகள்', hiddenWord: 'மறைந்த சொல்',
      chatGuess: 'உங்கள் பதிலை இங்கே எழுதுங்கள்…', chatPh: 'செய்தி எழுதுங்கள்…', you: 'நீங்கள்', points: 'புள்ளி', host: 'நடத்துநர்', voteKick: 'வெளியேற்ற வாக்கு', kick: 'வெளியேற்று',
      gameOver: 'ஆட்டம் முடிந்தது!', playAgain: 'மீண்டும் விளையாடு', waitingAgain: 'நடத்துநருக்காக காத்திருக்கிறோம்…', leave: 'அறையை விட்டு வெளியேறவா?', kicked: 'நீங்கள் அறையிலிருந்து வெளியேற்றப்பட்டீர்கள்.',
      notfound: 'அறை கிடைக்கவில்லை.', full: 'அறை நிரம்பியுள்ளது.', banned: 'இந்த அறையிலிருந்து நீக்கப்பட்டீர்கள்.', drawing: 'வரைகிறார்', guessedIt: 'கண்டுபிடித்தார்!', youGuessed: 'நீங்கள் கண்டுபிடித்தீர்கள்! 🎉',
      tanglishTip: 'தமிழ், ஆங்கிலம் அல்லது தங்கிலீஷில் எழுதலாம்',
      voiceGuess: 'குரல் மூலம் பதில்', voiceUnsupported: 'குரல் பதில் Chrome, Edge அல்லது Safari-யில் மட்டும் வேலை செய்யும்', voiceDenied: 'மைக் அனுமதி மறுக்கப்பட்டது. உலாவி அமைப்பில் மைக்கை அனுமதிக்கவும்.',
      voiceSpeak: 'பதிலைச் சொல்லுங்கள்', voiceListening: 'கேட்கிறது… இப்போது பேசுங்கள்', voiceStop: 'நிறுத்த தட்டவும்', voiceLangTa: 'குரல் மொழி: தமிழ் (ஆங்கிலத்துக்கு தட்டவும்)', voiceLangEn: 'குரல் மொழி: ஆங்கிலம் (தமிழுக்கு தட்டவும்)', voiceNoMatch: 'சரியாகக் கேட்கவில்லை, மீண்டும் முயலவும்',
    },
  };
  let lang = localStorage.getItem('ts_lang') || 'en';
  function t(key, vars) {
    let s = (S[lang] && S[lang][key]) || S.en[key] || key;
    if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
    root.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
    document.documentElement.lang = lang;
  }
  return { t, apply, get lang() { return lang; }, toggle() { lang = lang === 'en' ? 'ta' : 'en'; localStorage.setItem('ts_lang', lang); apply(); return lang; } };
})();

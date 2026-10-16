# வரைந்து கண்டுபிடி! · Varainthu Kandupidi

A skribbl.io-style multiplayer **drawing & guessing game with Tamil words**, made for playing with family on phones, tablets and laptops.

- Private rooms with an invite link and room code, 2 to 12 players
- 834 hand-picked, drawable, family-friendly Tamil words in 21 categories (animals, food, festivals and culture, places, actions and more), each with an English meaning, transliteration and difficulty
- The drawer picks 1 of N Tamil words (auto-pick after 15 s). Others see one blank per Tamil letter (grapheme cluster, so கா counts as one letter), with hints that reveal letters progressively
- Guess in **Tamil, English or Tanglish** (for example யானை / elephant / yaanai / yanai). "Close!" notices for near misses
- **Voice guessing** 🎤: tap the mic and say your guess. It uses the browser's Web Speech API, in Tamil (ta-IN) by default with a த/EN toggle for English. Up to 5 recognition alternatives are checked, and if any of them matches, the guess counts. Works in Chrome, Edge and Safari over HTTPS (Render gives you HTTPS). The host can turn it on or off in the lobby
- skribbl-style scoring: faster guesses earn more points, and the drawer earns points for every correct guesser. Round reveal, podium and play again
- Drawing tools: 26-colour palette plus a custom colour picker, 5 brush sizes plus a slider, pen, eraser, fill bucket, undo and clear. Works with touch and mouse. Fixed 800×600 canvas that scales to any screen. Late joiners get the current drawing
- Host settings: players, rounds (2–10), draw time (30–240 s), word choices (1–5), hints (0–5), word mode (normal / hidden / both Tamil and English blanks), difficulty filter, accept English answers, custom words (`கோலம்:kolam, பட்டம்:kite`), custom words only
- Chat with system messages. Guessed players chat privately. Like/dislike, vote-kick, host kick, reconnect without losing your score, synthesized sounds, English/தமிழ் UI toggle

## Run locally
```bash
npm install
npm start            # http://localhost:3000
npm test             # automated 4-player game test (socket.io clients)
```
Open the URL, create a room and share the invite link. Players on the same Wi-Fi can use `http://<your-computer-ip>:3000`.

## Deploy for free (permanent link) on Render
1. Put this folder in a GitHub repository (it already has `render.yaml`).
2. Go to https://render.com, then **New → Blueprint** (or **New → Web Service**) and pick the repository.
3. Settings, if you're not using the blueprint: Runtime **Node**, Build `npm install`, Start `npm start`, Plan **Free**.
4. You get a permanent `https://<name>.onrender.com` link. WebSockets work out of the box.
   On the free plan the server sleeps after about 15 minutes idle, and the first visit takes about 30–50 s to wake it.

Other free or cheap options: **Railway**, **Fly.io** (`fly launch`), **Koyeb**, or any VPS with `node server.js` behind nginx. Use a single instance, because rooms are kept in memory.

## Editing the word list
Words live in `data/words.txt` (one per line: `தமிழ்|english/alt|translit|d` where d is e, m or h, with `# key|English|தமிழ்` category headers).
Run `npm run build-words`. It validates the file (Tamil Unicode only, no duplicates, no empty fields, valid difficulty) and regenerates `data/words.json`.

## Tech
Node.js, Express and Socket.IO. Vanilla JS front end with no build step. In-memory rooms, so nothing is stored.
Noto Sans Tamil font loaded from Google Fonts (SIL Open Font License).

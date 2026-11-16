# djmeehan.github.io

Derek's browser games and apps, published with GitHub Pages at https://djmeehan.github.io/.

**This repo is public** (the one exception to the "all repos private" policy; see `guardrails/public-repos.txt`). Never commit keys, personal data or anything about the household or the Pi.

## Layout

- `index.html`: the landing page listing the games.
- `games/<name>/`: one folder per game. Plain static games (`index.html` + assets) are served as they are.
- A game that needs a build (Vite/TypeScript) keeps its source in its folder and is built and deployed by a GitHub Actions workflow (added with the first game that needs it).

## Games

- `games/demo/`: Ball Maze.
- `games/fudges-festive-frenzy/`: a Christmas side-scroller starring Fudge the hamster (photo cutouts in `assets/`, rules in `logic.js` with tests in `test.js`, drawing and input in `main.js`). Controls: hold the mouse or a finger to run toward it, press high up to jump, double-tap (or press E) to lunge and steal a present back from an elf. Each round has a clock and a delivery quota (presents minus what may be lost); miss the quota when time runs out and it is game over, clear the round early for a time bonus; arrows/WASD and Space also work. `index.html#bot=12` autoplays 12 seconds ahead (used for screenshots).
- `games/fudges-snowball-showdown/`: 2 to 4 players on their own phones throw snowballs across a Christmas rooftop city. Three hits take a player's Christmas spirit from 100% to 0%. Players type a name and pick Fudge, Smudge, Molly or Remy (face photos in `assets/`). One phone hosts and runs the rules (`logic.js`); friends join by scanning QR codes with their camera (`qr.js`, `signal.js`, `net.js`: direct phone-to-phone WebRTC, no server, same Wi-Fi). Controls: pull back anywhere like a slingshot; angle, power, wind and your last throw are on screen. Pinch or use the mouse wheel / buttons to zoom; two fingers move the view. `main.js` draws everything. Browser tests: `tools/browser-tests/run.sh`.

## Adding a game

1. Create `games/<name>/index.html` (and assets).
2. Add a link to it in the root `index.html`.
3. Commit and push to `main`; Pages redeploys within a minute or two.

Before a game can go live it needs a `test.js`, passing checks (`python3 tools/check.py`: tests, secrets, no external hosts, no `eval`) and Derek's sign-off after playing it locally: run `python3 tools/review.py`, play the game on the page, click Sign off (and approve the Mac dialog), then Publish. `tools/gate.py` enforces this on every push.

Run locally with `python3 -m http.server` in this folder.

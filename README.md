# djmeehan.github.io

Derek's browser games and apps, published with GitHub Pages at https://djmeehan.github.io/.

**This repo is public** (the one exception to the "all repos private" policy; see `guardrails/public-repos.txt`). Never commit keys, personal data or anything about the household or the Pi.

## Layout

- `index.html`: the landing page listing the games.
- `games/<name>/`: one folder per game. Plain static games (`index.html` + assets) are served as they are.
- A game that needs a build (Vite/TypeScript) keeps its source in its folder and is built and deployed by a GitHub Actions workflow (added with the first game that needs it).

## Adding a game

1. Create `games/<name>/index.html` (and assets).
2. Add a link to it in the root `index.html`.
3. Commit and push to `main`; Pages redeploys within a minute or two.

Before a game can go live it needs a `test.js`, passing checks (`python3 tools/check.py`: tests, secrets, no external hosts, no `eval`) and Derek's sign-off (`python3 tools/signoff.py <name>`, run in a terminal after playing it locally). `tools/gate.py` enforces this on every push.

Run locally with `python3 -m http.server` in this folder.

# CLAUDE.md

Public GitHub Pages site for Derek's browser games/apps, independent of Hearth and the Pi (no pideploy, no pi-provision entry, no port).

- **Everything here is public.** No API keys, personal data, family names or Pi/household details. Keys never go in this repo; a game needing one is a server job, not a Pages job.
- One folder per game under `games/`; link each from the root `index.html`. Static by default; use Vite/TS plus a Pages Actions workflow only where a game needs a build.
- Deploy = push to `main`. Test locally with `python3 -m http.server`.
- Guardrails allow this one repo to be public via `guardrails/public-repos.txt`; every other repo stays private.

## Nothing goes live untested or unsigned

- Every game needs `games/<name>/test.js` (run with `node`), and `python3 tools/check.py` must pass: layout, no secrets (guardrails' `secretscan`, tree and history), no external hosts, no `eval`/`Function`/`document.write`, JS syntax, each game's tests.
- Each game must be **signed off by Derek** after playing it locally: `python3 tools/signoff.py <game>` (he runs it himself with `! ...`; it refuses without a real terminal). It records the game's git tree hash in `signoff.json`, so any change to a game invalidates its sign-off.
- **Claude must never run `signoff.py` or edit `signoff.json`.** Workflow: build the game and its `test.js`, commit, tell Derek to play it at http://localhost:8000/games/<name>/, he signs off, Claude commits `signoff.json`, then push.
- `tools/gate.py` enforces this: guardrails' pre-push hook runs it for this repo and refuses the push otherwise; `audit.py` runs it too (so a `--no-verify` push shows up as an audit failure).

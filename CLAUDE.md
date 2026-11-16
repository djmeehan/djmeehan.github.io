# CLAUDE.md

Public GitHub Pages site for Derek's browser games/apps, independent of Hearth and the Pi (no pideploy, no pi-provision entry, no port).

- **Everything here is public.** No API keys, personal data, family names or Pi/household details. Keys never go in this repo; a game needing one is a server job, not a Pages job.
- One folder per game under `games/`; link each from the root `index.html`. Static by default; use Vite/TS plus a Pages Actions workflow only where a game needs a build.
- Deploy = push to `main`. Test locally with `python3 -m http.server`.
- Guardrails allow this one repo to be public via `guardrails/public-repos.txt`; every other repo stays private.

## Nothing goes live untested or unsigned

- Every game needs `games/<name>/test.js` (run with `node`), and `python3 tools/check.py` must pass: layout, no secrets (guardrails' `secretscan`, tree and history), no external hosts, no `eval`/`Function`/`document.write`, JS syntax, each game's tests.
- Each game must be **signed off by Derek** after playing it locally. He runs `python3 tools/review.py` (a local page at http://127.0.0.1:8765/__review/: play the game, see the checks, Sign off, Publish). Sign-off also needs him to click Approve in a macOS dialog. `tools/signoff.py <game>` is the terminal alternative (refuses without a real terminal). It records the game's git tree hash in `signoff.json`, so any change to a game invalidates its sign-off.
- **Claude must never run `signoff.py`, call the review server's sign-off or publish endpoints, click its dialog, or edit `signoff.json`.** Workflow: build the game and its `test.js`, commit, tell Derek to run `python3 tools/review.py`; he plays it, signs off and publishes from the page.
- `tools/gate.py` enforces this: guardrails' pre-push hook runs it for this repo and refuses the push otherwise; `audit.py` runs it too (so a `--no-verify` push shows up as an audit failure).

## Fudge's Snowball Showdown (multiplayer)

- **No server.** The host phone runs `logic.js` and sends the result of each throw (flight path plus the new state) to every friend over WebRTC data channels. Joining is a swap of two short codes (`signal.js` squeezes a WebRTC offer/answer to about 200 characters): the host shows a QR code, the friend scans it with the ordinary camera app (it opens the page with `#o=...`), the friend's screen shows a code back, the host scans that (it opens `#a=...` in a tab that tells the host's tab through BroadcastChannel) or pastes it. No STUN/TURN: it is meant for phones on the same Wi-Fi. If a Wi-Fi isolates devices (guest networks), joining fails.
- **Own QR encoder (`qr.js`)** because no third-party scripts are allowed. It is checked against the published capacity table in `test.js` and by decoding real renders with macOS's barcode reader (`tools/browser-tests/decode-qr.swift`). Do not "simplify" the tables.
- **Public pet photos.** `assets/*-face.*` are Derek's pets (Fudge, Smudge, Molly, Remy), metadata stripped and shrunk. They are public once published; strip metadata from any new photo the same way.
- **Trying it on real phones before sign-off:** `python3 tools/review.py --lan` also serves the games on the Wi-Fi (never the review page); open the printed address on each phone. Real-phone behaviour (camera app, Wi-Fi) has only been tested in headless Chrome so far.
- `tools/browser-tests/run.sh` drives real headless Chrome (menus, mouse and touch, three windows playing each other). Run it after changing the pages.
- Hidden tabs stop animating, and the host phone resolves turns after animations finish: the host must keep the game in the foreground.

# CLAUDE.md

Public GitHub Pages site for Derek's browser games/apps, independent of Hearth and the Pi (no pideploy, no pi-provision entry, no port).

- **Everything here is public.** No API keys, personal data, family names or Pi/household details. Keys never go in this repo; a game needing one is a server job, not a Pages job.
- One folder per game under `games/`; link each from the root `index.html`. Static by default; use Vite/TS plus a Pages Actions workflow only where a game needs a build.
- Deploy = push to `main`. Test locally with `python3 -m http.server`.
- Guardrails allow this one repo to be public via `guardrails/public-repos.txt`; every other repo stays private.

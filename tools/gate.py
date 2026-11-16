#!/usr/bin/env python3
"""Gate for pushing the games site: every game must be signed off at its committed content, and tools/check.py must pass.

Run by guardrails' pre-push hook (and by audit.py) from the repo root; exit 1 blocks the push. Sign-off is recorded in signoff.json
by tools/signoff.py, keyed by the git tree hash of games/<name>, so ANY change to a game invalidates its sign-off.
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def git(*args):
    r = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


def tree_hash(game):
    rc, out = git("rev-parse", f"HEAD:games/{game}")
    return out if rc == 0 else None


def main():
    problems = []
    rc, dirty = git("status", "--porcelain", "--", "games", "signoff.json", "index.html", "games.json")
    if dirty:
        problems.append("uncommitted changes in games/, index.html, games.json or signoff.json: commit them, then sign off")
    rc, raw = git("show", "HEAD:signoff.json")
    signed = json.loads(raw) if rc == 0 else {}
    rc, games = git("ls-tree", "--name-only", "HEAD", "games/")
    for path in games.splitlines():
        game = path.split("/", 1)[1]
        have = tree_hash(game)
        rec = signed.get(game, {}).get("tree")
        if rec != have:
            problems.append(f"games/{game}: " + ("not signed off" if rec is None else "changed since it was signed off") + f" (python3 tools/review.py, or tools/signoff.py {game})")
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "check.py")], capture_output=True, text=True)
    if r.returncode:
        problems.append("tools/check.py failed:\n" + r.stdout.strip())
    for p in problems:
        print(f"gate: {p}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

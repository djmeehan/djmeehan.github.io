#!/usr/bin/env python3
"""Record that YOU played a game locally and approve it going live. Usage: python3 tools/signoff.py <game>

Only works from an interactive terminal (a person at the keyboard). It requires the game to be committed, runs tools/check.py, makes you
type a confirmation, then writes signoff.json keyed by the game's git tree hash. Commit signoff.json, then push. Any later change to the
game invalidates the sign-off. Claude must never run this or edit signoff.json.
"""
import datetime
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def git(*args):
    r = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


def main():
    if len(sys.argv) != 2:
        return print(__doc__) or 2
    game = sys.argv[1]
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        print("signoff needs an interactive terminal: run it yourself (in Claude Code, type `! python3 tools/signoff.py " + game + "`).")
        return 2
    if not (ROOT / "games" / game / "index.html").is_file():
        print(f"no such game: games/{game}")
        return 2
    rc, dirty = git("status", "--porcelain", "--", f"games/{game}")
    if dirty:
        print(f"games/{game} has uncommitted changes: commit first, so the sign-off covers exactly what will be pushed.")
        return 1
    print(f"Running the checks for the whole site...\n")
    if subprocess.run([sys.executable, str(ROOT / "tools" / "check.py")]).returncode:
        print("\nChecks failed: fix them before signing off.")
        return 1
    rc, tree = git("rev-parse", f"HEAD:games/{game}")
    print(f"\nChecks passed. Now play it locally:\n  cd {ROOT} && python3 tools/review.py\n")
    want = f"I played {game}"
    if input(f'Type "{want}" to approve it going live: ').strip() != want:
        print("Not signed off.")
        return 1
    f = ROOT / "signoff.json"
    data = json.loads(f.read_text()) if f.exists() else {}
    data[game] = {"tree": tree, "at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
    f.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    print(f"Signed off games/{game} ({tree[:10]}). Commit signoff.json, then push.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

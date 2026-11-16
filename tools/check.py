#!/usr/bin/env python3
"""Tests and security checks for the games site. Exit 1 on any failure. Run from anywhere: python3 tools/check.py

Checks: layout (every game has an index.html and is linked from the root page), no secrets (guardrails' secretscan over the tree and
history), no external hosts, no eval/Function/document.write, JavaScript syntax (node --check), and each game's own test.js (node).
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GUARDRAILS = ROOT.parent / "guardrails"
GAMES = ROOT / "games"
EXTERNAL = re.compile(r"https?://(?!www\.w3\.org/)", re.I)
DANGEROUS = re.compile(r"\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(|\bimportScripts\s*\(")
SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)
SOURCES = {".html", ".js", ".mjs", ".css", ".svg", ".json"}

fails = []


def fail(msg):
    fails.append(msg)
    print(f"FAIL  {msg}")


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def game_dirs():
    return sorted(p for p in GAMES.iterdir() if p.is_dir()) if GAMES.is_dir() else []


def check_layout():
    root_html = (ROOT / "index.html").read_text()
    for g in game_dirs():
        if not (g / "index.html").is_file():
            fail(f"games/{g.name}: no index.html")
        if f"games/{g.name}/" not in root_html:
            fail(f"games/{g.name}: not linked from the root index.html")
    for name in re.findall(r'href="games/([^/"]+)/"', root_html):
        if not (GAMES / name / "index.html").is_file():
            fail(f"root index.html links to games/{name}/ which does not exist")


def check_secrets():
    if not GUARDRAILS.is_dir():
        return fail(f"guardrails not found at {GUARDRAILS}: cannot scan for secrets")
    sys.path.insert(0, str(GUARDRAILS))
    import secretscan
    for f in secretscan.scan_tree(ROOT):
        fail(f"key-shaped {f['kind']} in {f['file']}:{f['line']}")
    for f in secretscan.scan_history(ROOT):
        fail(f"key-shaped {f['kind']} in history: {f['file']} (commit {f['commit']})")


def check_sources():
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if not p.is_file() or p.suffix not in SOURCES or rel.parts[0] in (".git", "tools", "node_modules"):
            continue
        text = p.read_text(errors="replace")
        for n, line in enumerate(text.splitlines(), 1):
            if EXTERNAL.search(line):
                fail(f"{rel}:{n} references an external host (everything must be self-contained)")
            if p.suffix in (".html", ".js", ".mjs") and DANGEROUS.search(line):
                fail(f"{rel}:{n} uses eval/Function/document.write/importScripts")


def check_js_syntax():
    if run(["node", "--version"]).returncode != 0:
        return fail("node is required for the JavaScript checks and is not installed")
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if not p.is_file() or rel.parts[0] in (".git", "tools", "node_modules"):
            continue
        if p.suffix in (".js", ".mjs") and p.name != "test.js":
            r = run(["node", "--check", str(p)])
            if r.returncode:
                fail(f"{rel}: syntax error: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else '?'}")
        elif p.suffix == ".html":
            for i, body in enumerate(SCRIPT.findall(p.read_text()), 1):
                tmp = ROOT / ".check-inline.js"
                tmp.write_text(body)
                try:
                    r = run(["node", "--check", str(tmp)])
                finally:
                    tmp.unlink(missing_ok=True)
                if r.returncode:
                    fail(f"{rel}: inline script {i} has a syntax error")


def check_game_tests():
    for g in game_dirs():
        t = g / "test.js"
        if not t.is_file():
            fail(f"games/{g.name}: no test.js (every game needs tests)")
            continue
        r = run(["node", str(t)], cwd=g)
        if r.returncode:
            fail(f"games/{g.name}: test.js failed\n{(r.stdout + r.stderr).strip()}")
        else:
            print(f"ok    games/{g.name}: test.js")


def main():
    check_layout()
    check_secrets()
    check_sources()
    check_js_syntax()
    check_game_tests()
    print(f"\n{len(fails)} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

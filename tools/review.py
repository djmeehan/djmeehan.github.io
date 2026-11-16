#!/usr/bin/env python3
"""Local review page for the games site: play each game, see the checks, sign it off and publish, all in the browser.

Run:  python3 tools/review.py     (opens http://127.0.0.1:8765/__review/ ; Ctrl-C to stop)

Sign-off also needs you to click Approve in a macOS dialog, which is what stops anything but a person at this Mac approving a game.
It writes the same signoff.json as tools/signoff.py. Publish commits signoff.json and pushes; guardrails' pre-push gate still runs.
Claude must never call this server's sign-off or publish endpoints.
"""
import datetime
import html
import http.server
import json
import pathlib
import secrets
import socketserver
import subprocess
import sys
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOKEN = secrets.token_urlsafe(24)
PORT = 8765


def run(cmd, timeout=300):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr).strip()


def git(*args):
    return run(["git", *args])


def games():
    d = ROOT / "games"
    return sorted(p.name for p in d.iterdir() if (p / "index.html").is_file()) if d.is_dir() else []


def signed():
    f = ROOT / "signoff.json"
    return json.loads(f.read_text()) if f.exists() else {}


def status():
    out = []
    rec = signed()
    for g in games():
        rc, tree = git("rev-parse", f"HEAD:games/{g}")
        rc2, dirty = git("status", "--porcelain", "--", f"games/{g}")
        committed = rc == 0 and not dirty
        if not committed:
            state = "uncommitted"
        elif rec.get(g, {}).get("tree") == tree:
            state = "signed"
        else:
            state = "changed" if g in rec else "unsigned"
        out.append({"game": g, "state": state})
    rc, pending = git("status", "--porcelain", "--", "signoff.json")
    rc, ahead = git("rev-list", "--count", "@{u}..HEAD")
    return {"games": out, "unpublished": bool(pending) or ahead not in ("", "0")}


def checks():
    rc, out = run([sys.executable, "tools/check.py"])
    return {"ok": rc == 0, "output": out}


def sign(game):
    if game not in games():
        return 404, {"error": "no such game"}
    st = {g["game"]: g["state"] for g in status()["games"]}
    if st[game] == "uncommitted":
        return 409, {"error": f"games/{game} has uncommitted changes: ask Claude to commit it first"}
    c = checks()
    if not c["ok"]:
        return 409, {"error": "checks failed", **c}
    script = f'display dialog "Approve \\"{game}\\" to go live on djmeehan.github.io?" buttons {{"Cancel", "Approve"}} default button "Cancel" with title "Games sign-off" with icon note'
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return 408, {"error": "no answer to the approval dialog"}
    if "button returned:Approve" not in r.stdout:
        return 403, {"error": "not approved"}
    rc, tree = git("rev-parse", f"HEAD:games/{game}")
    data = signed()
    data[game] = {"tree": tree, "at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
    (ROOT / "signoff.json").write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    return 200, {"ok": True}


def publish():
    st = status()
    bad = [g["game"] for g in st["games"] if g["state"] != "signed"]
    if bad:
        return 409, {"error": "not signed off: " + ", ".join(bad)}
    git("add", "signoff.json")
    rc, staged = git("diff", "--cached", "--name-only")
    if staged:
        rc, out = git("commit", "-m", "Sign off " + ", ".join(g["game"] for g in st["games"]))
        if rc:
            return 500, {"error": out}
    rc, out = git("push")
    return (200 if rc == 0 else 409), {"ok": rc == 0, "output": out}


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review games</title><style>
:root{--bg:#14110f;--fg:#f2e9e0;--accent:#f2b36b;--ok:#5fd38d;--bad:#ff7a70;--card:#241d18}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif}
a{color:var(--accent)}main{max-width:60rem;margin:0 auto;padding:1.5rem 16px}
h1{font-weight:300;letter-spacing:.15em;text-transform:uppercase;color:var(--accent)}
.row{display:flex;gap:1rem;align-items:center;justify-content:space-between;background:var(--card);border-radius:.6rem;padding:.8rem 1rem;margin:.6rem 0}
.tag{padding:.15rem .6rem;border-radius:1rem;font-size:.85rem;border:1px solid}
.signed{color:var(--ok)}.unsigned,.changed,.uncommitted{color:var(--bad)}
button{font:inherit;padding:.5rem 1.1rem;border:0;border-radius:.5rem;background:var(--accent);color:#14110f;cursor:pointer}
button:disabled{opacity:.4;cursor:default}button.alt{background:transparent;color:var(--fg);border:1px solid var(--fg)}
pre{background:#0d0b0a;padding:.8rem;border-radius:.5rem;overflow:auto;max-height:14rem;white-space:pre-wrap}
iframe{width:100%;height:70vh;border:1px solid #3a2f27;border-radius:.6rem;background:#000}
#msg{min-height:1.4rem;margin:.6rem 0}.bar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
</style></head><body><main>__BODY__</main><script>
const T="__TOKEN__";
const post=(p)=>fetch(p,{method:"POST",headers:{"X-Token":T}}).then(async r=>({status:r.status,body:await r.json().catch(()=>({}))}));
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
__SCRIPT__
</script></body></html>"""

LIST_BODY = '<h1>Review games</h1><div id="list">Loading...</div><div class="bar"><button id="pub" disabled>Publish all signed games</button></div><div id="msg"></div><pre id="out" hidden></pre>'
LIST_SCRIPT = """
async function load(){const s=await (await fetch('/__review/api/status')).json();
 document.getElementById('list').innerHTML=s.games.map(g=>`<div class="row"><span><b>${esc(g.game)}</b> <span class="tag ${g.state}">${g.state}</span></span><a href="/__review/game/${encodeURIComponent(g.game)}"><button class="alt">Play and review</button></a></div>`).join('')||'No games yet.';
 const ready=s.games.length&&s.games.every(g=>g.state==='signed')&&s.unpublished;document.getElementById('pub').disabled=!ready;
 if(s.games.length&&s.games.every(g=>g.state==='signed')&&!s.unpublished)document.getElementById('msg').textContent='Everything is signed off and published.';}
document.getElementById('pub').onclick=async()=>{document.getElementById('msg').textContent='Publishing...';const r=await post('/__review/api/publish');
 const o=document.getElementById('out');o.hidden=false;o.textContent=r.body.output||r.body.error||'';document.getElementById('msg').textContent=r.body.ok?'Pushed. The site updates in a minute or two.':'Not published.';load();};
load();
"""
GAME_BODY = '<p><a href="/__review/">&larr; All games</a></p><h1>__NAME__</h1><div class="bar"><span id="state"></span><button id="chk" class="alt">Run checks</button><button id="sign">Sign off</button><button id="pub" class="alt" hidden>Publish</button></div><div id="msg"></div><pre id="out" hidden></pre><iframe src="/games/__NAME__/" title="__NAME__"></iframe>'
GAME_SCRIPT = """
const G="__JSNAME__";const msg=t=>document.getElementById('msg').textContent=t;
const show=t=>{const o=document.getElementById('out');o.hidden=!t;o.textContent=t||''};
async function load(){const s=await (await fetch('/__review/api/status')).json();const g=s.games.find(x=>x.game===G);
 document.getElementById('state').innerHTML=`<span class="tag ${g.state}">${g.state}</span>`;
 document.getElementById('sign').disabled=g.state==='signed'||g.state==='uncommitted';
 document.getElementById('pub').hidden=!(g.state==='signed'&&s.unpublished);}
document.getElementById('chk').onclick=async()=>{msg('Running checks...');const r=await post('/__review/api/check');show(r.body.output);msg(r.body.ok?'All checks passed.':'Checks failed.');};
document.getElementById('sign').onclick=async()=>{msg('Approve in the dialog on your Mac...');const r=await post('/__review/api/signoff/'+encodeURIComponent(G));
 show(r.body.output||'');msg(r.body.ok?'Signed off. Press Publish to put it live.':(r.body.error||'Failed'));load();};
document.getElementById('pub').onclick=async()=>{msg('Publishing...');const r=await post('/__review/api/publish');show(r.body.output||r.body.error||'');msg(r.body.ok?'Pushed. The site updates in a minute or two.':'Not published.');load();};
load();
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, *a):
        pass

    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_page(self, body, script):
        page = PAGE.replace("__BODY__", body).replace("__SCRIPT__", script).replace("__TOKEN__", TOKEN).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(page)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(page)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/__review/":
            return self.send_page(LIST_BODY, LIST_SCRIPT)
        if p == "/__review/api/status":
            return self.send_json(200, status())
        if p.startswith("/__review/game/"):
            name = p[len("/__review/game/"):].strip("/")
            if name not in games():
                return self.send_json(404, {"error": "no such game"})
            body = GAME_BODY.replace("__NAME__", html.escape(name))
            return self.send_page(body, GAME_SCRIPT.replace("__JSNAME__", json.dumps(name)[1:-1]))
        if p.startswith("/__review"):
            return self.send_json(404, {})
        super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin", "")
        if self.headers.get("X-Token") != TOKEN or origin != f"http://127.0.0.1:{PORT}" or self.headers.get("Host") != f"127.0.0.1:{PORT}":
            return self.send_json(403, {"error": "forbidden"})
        p = self.path
        if p == "/__review/api/check":
            return self.send_json(200, checks())
        if p.startswith("/__review/api/signoff/"):
            code, obj = sign(p.rsplit("/", 1)[1])
            return self.send_json(code, obj)
        if p == "/__review/api/publish":
            code, obj = publish()
            return self.send_json(code, obj)
        self.send_json(404, {})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main():
    global PORT
    for port in range(8765, 8775):
        try:
            srv = Server(("127.0.0.1", port), Handler)
            PORT = port
            break
        except OSError:
            continue
    else:
        sys.exit("no free port in 8765-8774")
    url = f"http://127.0.0.1:{PORT}/__review/"
    print(f"Review page: {url}   (Ctrl-C to stop)")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

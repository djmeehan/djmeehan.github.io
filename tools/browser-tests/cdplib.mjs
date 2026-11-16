import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function launch(port, extra = []) {
  rmSync(`${tmpdir()}/fss-chrome-profile-${port}`, { recursive: true, force: true });   // a fresh profile: no saved names or characters
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${tmpdir()}/fss-chrome-profile-${port}`, ...extra, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch (e) { await sleep(200); } }
  async function tab(url, w = 960, h = 540, mobile = false, preload = '') {
    // every tab gets its own window, so none of them is "hidden" (hidden tabs stop animating, which a real phone's foreground game never does)
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => bws.onopen = r);
    const targetId = await new Promise(res => { bws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.targetId); }; bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank', newWindow: true, width: w, height: h } })); });
    bws.close();
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const t = list.find(x => x.id === targetId);
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const pend = new Map();
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text)); return r.result.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    if (preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: preload });
    await send('Page.navigate', { url });
    await sleep(1200);
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const click = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
    const clickSel = async sel => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2]})()`); if (!r) throw new Error('no element ' + sel); await click(r[0], r[1]); };
    const shot = async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
    const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { /* page not ready */ } await sleep(100); } return false; };
    const errors = []; 
    return { ev, send, mouse, click, clickSel, shot, waitFor, close: () => { try { ws.close(); } catch (e) {} } };
  }
  return { tab, kill: () => chrome.kill() };
}
let fails = 0;
export const check = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };
export const done = (label) => { console.log(fails ? fails + ' failure(s)' : label + ' passed'); return fails; };

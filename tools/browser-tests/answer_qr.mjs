import { launch, sleep, check, done } from './cdplib.mjs';
const S = process.argv[2];
const B = await launch(9344);
const BASE = 'http://127.0.0.1:8790/games/fudges-snowball-showdown/';
const H = await B.tab(BASE + '#debug', 844, 390, true);
await H.clickSel('#b-host');
await H.waitFor(`window.__ssd.lobby.slots[0] && window.__ssd.lobby.slots[0].offer.length>100`);
const offer = await H.ev(`document.getElementById('offer-link').value`);
H.close();                       // nobody is listening for an answer now
// block the same-browser hand-off, as on a real second phone, so the answer code stays on screen
const G = await B.tab(offer, 844, 390, true, 'window.BroadcastChannel = undefined; Storage.prototype.setItem = function () {};');
await G.waitFor(`document.getElementById('answer-link').value.length>50`);
await sleep(300);
const url = await G.ev(`document.getElementById('answer-link').value`);
await G.shot(S + '/ph_join.png');
console.log('answer link length', url.length);
check(/#a=[A-Za-z0-9_-]+$/.test(url), 'the friend gets an answer link');
const top = await G.ev(`document.getElementById('qr2').getBoundingClientRect().top`);
const bottom = await G.ev(`document.getElementById('qr2').getBoundingClientRect().bottom`);
check(top >= 0 && bottom <= 390, `the whole QR code fits on a phone screen without scrolling (y ${Math.round(top)}-${Math.round(bottom)} of 390)`);
B.kill();
process.exit(done('answer QR test') ? 1 : 0);

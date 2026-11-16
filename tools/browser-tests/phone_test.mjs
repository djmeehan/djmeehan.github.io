import { launch, sleep, check, done } from './cdplib.mjs';
const S = process.argv[2];
const B = await launch(9343);
const URL = 'http://127.0.0.1:8790/games/fudges-snowball-showdown/#debug';
const t = await B.tab(URL, 844, 390, true);       // a phone held sideways, touch screen
const touch = (type, pts) => t.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
await t.shot(S + '/ph_title.png');
check(await t.ev(`window.innerWidth`) === 844, 'phone-sized screen (844x390)');
await t.clickSel('#b-practice');
check(await t.waitFor(`window.__ssd.G.s!==null && window.__ssd.role==='practice'`), 'practice starts on a phone-sized screen');
await sleep(1500);
await t.shot(S + '/ph_game.png');
check(await t.waitFor(`window.__ssd.G.s.turn===window.__ssd.G.me && !window.__ssd.G.anim`, 20000), 'it is my turn');
await sleep(800);
// pinch to zoom out with two fingers
const z0 = await t.ev(`window.__ssd.cam.z`);
await touch('touchStart', [[380, 200], [460, 200]]);
await touch('touchMove', [[340, 200], [500, 200]]);
await touch('touchMove', [[300, 200], [540, 200]]);
await touch('touchEnd', []);
await sleep(150);
const z1 = await t.ev(`window.__ssd.cam.z`);
check(z1 > z0 * 1.3, `pinching with two fingers zooms in (${z0.toFixed(2)} -> ${z1.toFixed(2)})`);
await touch('touchStart', [[300, 200], [540, 200]]);
await touch('touchMove', [[400, 200], [440, 200]]);
await touch('touchEnd', []);
await sleep(150);
const z2 = await t.ev(`window.__ssd.cam.z`);
check(z2 < z1 * 0.7, `pinching in zooms out (${z1.toFixed(2)} -> ${z2.toFixed(2)})`);
await touch('touchStart', [[300, 200], [400, 200]]);
await touch('touchMove', [[200, 200], [300, 200]]);
await touch('touchEnd', []);
check(await t.ev(`window.__ssd.G.anim===null && window.__ssd.H.auth.throws===0`), 'two-finger gestures never throw a snowball');
// one-finger slingshot with a thumb
await touch('touchStart', [[420, 230]]);
await touch('touchMove', [[380, 262]]);
await touch('touchMove', [[340, 290]]);
await sleep(120);
await t.shot(S + '/ph_aim.png');
const aim = JSON.parse(await t.ev(`JSON.stringify(window.__ssd.G.aim)`));
check(aim.power > 20 && aim.angle > 20 && aim.angle < 70, `a thumb slingshot aims (angle ${aim.angle.toFixed(0)}, power ${aim.power.toFixed(0)})`);
await touch('touchEnd', []);
check(await t.waitFor(`window.__ssd.G.anim!==null || window.__ssd.H.auth.throws>=1`, 3000), 'letting go throws');
check(await t.ev(`window.__ssd.H.auth.throws`) === 1, 'exactly one throw');
// tiny taps do not throw
await t.waitFor(`window.__ssd.G.s.turn===window.__ssd.G.me && !window.__ssd.G.anim`, 40000);
await sleep(500);
const n0 = await t.ev(`window.__ssd.H.auth.throws`);
await touch('touchStart', [[420, 230]]); await touch('touchEnd', []);
await sleep(400);
check(await t.ev(`window.__ssd.H.auth.throws`) === n0, 'a plain tap does not throw');
// full screen button exists and the page fills the screen
check(await t.ev(`!document.getElementById('fs').hidden`), 'the full-screen button is offered');
check(await t.ev(`document.getElementById('game').getBoundingClientRect().width`) === 844, 'the game canvas fills the whole screen width');
await t.shot(S + '/ph_game2.png');
B.kill();
process.exit(done('phone test') ? 1 : 0);

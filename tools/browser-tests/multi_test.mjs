import { launch, sleep, check, done } from './cdplib.mjs';
const S = process.argv[2];
const B = await launch(9342);
const BASE = 'http://127.0.0.1:8790/games/fudges-snowball-showdown/';
const H = await B.tab(BASE + '#debug', 960, 540);
await H.ev(`(()=>{const n=document.getElementById('name'); n.value='Hosty'; n.dispatchEvent(new Event('input'));})()`);
await H.clickSel('#b-host');
check(await H.waitFor(`window.__ssd.lobby.slots.length===3 && window.__ssd.lobby.slots[0].offer.length>100`), 'the host makes a join code for the first friend');
const offer1 = await H.ev(`document.getElementById('offer-link').value`);
console.log('join link length', offer1.length);
check(/#o=[A-Za-z0-9_-]+$/.test(offer1), 'the join link carries the code in the page address');
await H.shot(S + '/ss_lobby.png');
// friend 1 scans the code: their browser opens the link
const G1 = await B.tab(offer1 + '&debug', 960, 540);
check(await G1.waitFor(`window.__ssd && window.__ssd.role==='guest'`), 'the friend opens the link and is a guest');
check(await H.waitFor(`window.__ssd.lobby.slots[0].connected===true`, 15000), 'the host and friend 1 are connected (answer passed on automatically)');
await G1.shot(S + '/ss_join.png');
// friend 1 chooses a name and tries to take the host's character
await G1.ev(`(()=>{const n=document.getElementById('jname'); n.value='Mia'; n.dispatchEvent(new Event('input'));})()`);
await sleep(700);
await G1.clickSel('#chars-join .char:nth-child(1)');   // Fudge, which the host has
await sleep(600);
const slot1 = JSON.parse(await H.ev(`JSON.stringify({name:window.__ssd.lobby.slots[0].name,char:window.__ssd.lobby.slots[0].char})`));
check(slot1.name === 'Mia' && slot1.char !== 'fudge', `friend 1 is "Mia" and cannot take the host's character (got ${slot1.char})`);
await G1.clickSel('#chars-join .char:nth-child(3)');   // Molly
await sleep(500);
check(await H.ev(`window.__ssd.lobby.slots[0].char`) === 'molly', 'friend 1 chooses Molly');
check(await G1.ev(`document.querySelector('#chars-join .char.sel').textContent.includes('Molly')`), "friend 1's screen shows Molly selected");
check((await G1.ev(`document.querySelectorAll('#chars-join .char.taken').length`)) === 1, "friend 1 sees the host's character greyed out as taken");
// friend 2
await H.clickSel('#slot-tabs .tab:nth-child(2)');
check(await H.waitFor(`document.getElementById('offer-link').value.length>100`), 'a second join code is ready');
const offer2 = await H.ev(`document.getElementById('offer-link').value`);
const G2 = await B.tab(offer2 + '&debug', 960, 540);
check(await H.waitFor(`window.__ssd.lobby.slots[1].connected===true`, 15000), 'friend 2 is connected too');
await G2.ev(`(()=>{const n=document.getElementById('jname'); n.value='Sam'; n.dispatchEvent(new Event('input'));})()`);
await sleep(600);
await G2.clickSel('#chars-join .char:nth-child(4)');   // Remy
await sleep(500);
const roster = JSON.parse(await H.ev(`JSON.stringify(Array.from(document.querySelectorAll('#host-roster .who')).map(e=>e.textContent))`));
console.log('host roster:', roster.join(' | '));
check(roster.length === 2 && roster[0].startsWith('Mia') && roster[1].startsWith('Sam'), 'the host sees both friends by name');
check(await H.ev(`document.getElementById('host-start').disabled`) === false, 'Start is enabled with 3 players');
await H.shot(S + '/ss_lobby2.png');
// start
await H.clickSel('#host-start');
check(await G1.waitFor(`window.__ssd.G.s && window.__ssd.G.s.n===3`, 8000) && await G2.waitFor(`window.__ssd.G.s && window.__ssd.G.s.n===3`, 8000), 'the match starts on every phone');
const me = [await H.ev(`window.__ssd.G.me`), await G1.ev(`window.__ssd.G.me`), await G2.ev(`window.__ssd.G.me`)];
check(me.join() === '0,1,2', 'each phone knows which player it is (' + me.join() + ')');
const names = await G1.ev(`window.__ssd.G.s.players.map(p=>p.name+':'+p.char).join()`);
check(names === 'Hosty:fudge,Mia:molly,Sam:remy', 'everyone has the chosen names and characters (' + names + ')');
await sleep(800);
await G1.shot(S + '/ss_guest_game.png');
// play the round to the end: whoever's turn it is throws using the computer's aim
const tabs = [H, G1, G2];
let turns = 0;
const same = async () => { const a = await Promise.all(tabs.map(t => t.ev(`JSON.stringify([window.__ssd.G.s.h.join(), window.__ssd.G.s.players.map(p=>p.hp), window.__ssd.G.s.turn, window.__ssd.G.s.wind])`))); return a[0] === a[1] && a[1] === a[2]; };
let diverged = 0;
while (turns < 120) {
  const over = await H.ev(`window.__ssd.H.auth.phase==='over'`);
  if (over) break;
  const turn = await H.ev(`window.__ssd.H.auth.turn`);
  const t = tabs[turn];
  const ok = await t.waitFor(`(()=>{const g=window.__ssd.G; return g.s.phase==='aim' && g.s.turn===g.me && !g.anim && !g.queue.length && !g.waiting})()`, 20000);
  if (!ok) { check(false, `player ${turn} gets their turn`); break; }
  await t.ev(`(()=>{const d=window.__ssd; const th=d.Logic.chooseThrow(d.G.s, d.G.me, 0.7); d.doThrow(th.angle, th.power); return 1})()`);
  turns++;
  if (turns % 6 === 0) { await sleep(2500); if (!(await same())) diverged++; }
  await sleep(150);
}
await sleep(4000);
check(await H.ev(`window.__ssd.H.auth.phase`) === 'over', `the round finishes (${turns} throws)`);
check(diverged === 0, 'every phone showed the same city, spirit and turn whenever checked');
check(await H.waitFor(`document.getElementById('s-over').classList.contains('on')`, 8000), 'the host sees the round-over screen');
check(await G1.waitFor(`document.getElementById('s-over').classList.contains('on')`, 8000) && await G2.waitFor(`document.getElementById('s-over').classList.contains('on')`, 8000), 'the friends see it too');
const title = await H.ev(`document.getElementById('over-title').textContent`);
console.log('over screen:', title, '|', await H.ev(`document.getElementById('over-sub').textContent`));
await H.shot(S + '/ss_over.png');
check(await G1.ev(`document.getElementById('over-again').hidden`) === true, "friends can't start the next round (the host does)");
const winner = await H.ev(`window.__ssd.H.auth.winner`);
const finalState = JSON.parse(await H.ev(`JSON.stringify(window.__ssd.H.auth.players.map(p=>({hp:p.hp,alive:p.alive})))`));
check(finalState.filter(p => p.alive).length === 1 && finalState[winner].alive, 'exactly one pet is left standing');
// next round
await H.clickSel('#over-again');
check(await G1.waitFor(`window.__ssd.G.s.round===2 && window.__ssd.G.s.phase==='aim'`, 8000) && await G2.waitFor(`window.__ssd.G.s.round===2`, 8000), 'round 2 starts on every phone');
check(await G2.ev(`window.__ssd.G.s.wins.reduce((a,b)=>a+b,0)`) === 1, 'the win from round 1 is remembered');
// a friend drops out mid-round: the computer takes over their turns
await G2.ev(`window.__ssd.guest.link.close(); 1`);
check(await H.waitFor(`window.__ssd.H.bots.size===1`, 8000), 'the host notices the friend left');
let played = 0;
for (let i = 0; i < 40 && played < 6; i++) {
  const turn = await H.ev(`window.__ssd.H.auth.turn`), phase = await H.ev(`window.__ssd.H.auth.phase`);
  if (phase === 'over') break;
  if (turn === 2) { await sleep(2500); played++; continue; }   // the computer plays this one
  const t = tabs[turn];
  if (await t.waitFor(`(()=>{const g=window.__ssd.G; return g.s.phase==='aim' && g.s.turn===g.me && !g.anim && !g.queue.length && !g.waiting})()`, 20000)) { await t.ev(`(()=>{const d=window.__ssd; const th=d.Logic.chooseThrow(d.G.s, d.G.me, 0.7); d.doThrow(th.angle, th.power); return 1})()`); played++; }
  await sleep(300);
}
const th = await H.ev(`window.__ssd.H.auth.throws`);
check(th >= 4, `the game carries on after a friend leaves (${th} throws in round 2)`);
B.kill();
process.exit(done('multiplayer test') ? 1 : 0);

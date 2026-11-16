// Tests for the game rules in logic.js (run: node test.js). Headless: no browser needed.
const L = require('./logic.js');
const C = L.C;

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('FAIL: ' + msg); } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const none = { dir: 0, jump: false };

// A quiet scene: round 1, no sleigh drops or elves yet, so tests can set things up by hand.
function scene() {
  const s = L.createGame(7);
  s.elfQueue = [];
  s.sleigh.phase = 'fly';
  s.sleigh.xs = [1e9];
  s.sleigh.x = -1e6;
  return s;
}
function run(s, seconds, input, dt) {
  dt = dt || 1 / 60;
  for (let t = 0; t < seconds; t += dt) L.step(s, typeof input === 'function' ? input(s) : input || none, dt);
}

// Difficulty scales up and is capped.
{
  const r1 = L.roundConfig(1), r5 = L.roundConfig(5), r9 = L.roundConfig(9), r200 = L.roundConfig(200);
  check(r1.elves === 1, 'round 1 has one elf');
  check(r5.elves > r1.elves && r9.elves > r5.elves, 'more elves each few rounds');
  check(r5.presents > r1.presents, 'more presents in later rounds');
  check(r5.elfSpeed > r1.elfSpeed, 'elves get faster');
  check(r200.elves === C.MAX_ELVES && r200.presents <= 22 && r200.elfSpeed <= 215, 'difficulty is capped');
  check(L.roundConfig(4).allowance > L.roundConfig(3).allowance, 'allowance grows every third round');
}

// Touching a present puts it in Fudge's cheeks; a heavier load is slower; a load is worth more per present.
{
  const s = scene();
  L.addPresent(s, s.fudge.x, 0, 'ground');
  run(s, 0.1);
  check(s.fudge.load === 1, 'touching a present loads a cheek');
  check(s.presents[0].state === 'carried', 'the present is carried');
  check(L.fudgeSpeed(8) < L.fudgeSpeed(0), 'a bigger load is slower');
  check(L.fudgeSpeed(40) > 0, 'Fudge can always move');
  check(L.deliveryPoints(5) > 5 * L.deliveryPoints(1), 'a big load scores more than the same presents one at a time');
  const a = scene(), b = scene();
  b.fudge.load = 8;
  run(a, 1, { dir: 1, jump: false });
  run(b, 1, { dir: 1, jump: false });
  check(a.fudge.x - C.START_X > b.fudge.x - C.START_X + 30, 'a loaded Fudge covers less ground');
}

// Jumping: leaves the ground, comes back, can catch a present falling at head height.
{
  const s = scene();
  L.step(s, { dir: 0, jump: true }, 1 / 60);
  check(s.fudge.h > 0 && s.fudge.vh > 0, 'jump leaves the ground');
  run(s, 1.2);
  check(s.fudge.h === 0, 'Fudge lands again');
  const t = scene();
  const p = L.addPresent(t, t.fudge.x, 40, 'falling');
  run(t, 0.05);
  check(p.state === 'carried', 'a present falling past his head is caught');
}

// An elf that reaches a present first steals it; Fudge far away cannot stop it.
{
  const s = scene();
  s.fudge.x = 100;
  const p = L.addPresent(s, 1500, 0, 'ground');
  const e = L.addElf(s, 1450);
  run(s, 14.5);   // long enough to leave the field, but before the replacement elf (queued 3s later) arrives
  check(p.state === 'stolen', 'the elf got away with the present');
  check(s.roundStolen === 1, 'the theft is counted');
  check(s.elves.length === 0 && s.elfQueue.length === 1, 'the elf has left and will come back later');
}

// An elf that reaches Fudge snatches one present from his cheeks and runs; with an empty mouth it only shoves him.
{
  const s = scene();
  s.fudge.x = 1000;
  for (let i = 0; i < 6; i++) { L.addPresent(s, 1000, 0, 'carried'); s.fudge.load++; }
  const e = L.addElf(s, 1010);
  L.step(s, none, 1 / 60);
  check(s.fudge.load === 5, 'an elf snatches exactly one present (6 -> 5), got ' + s.fudge.load);
  check(e.state === 'flee' && e.present && e.present.state === 'carriedByElf', 'the elf runs off with it');
  check(s.fudge.stun > 0 && s.fudge.invuln > s.fudge.stun, 'Fudge is stunned briefly and then protected for a moment');
  const before = s.fudge.load;
  L.addElf(s, 1005);
  L.step(s, none, 1 / 60);
  check(s.fudge.load === before, 'no second snatch while protected');
  const j = scene();
  j.fudge.x = 1000; j.fudge.h = 90; j.fudge.vh = 0;
  j.fudge.load = 2;
  L.addPresent(j, 1000, 0, 'carried'); L.addPresent(j, 1000, 0, 'carried');
  L.addElf(j, 1005);
  L.step(j, none, 1 / 60);
  check(j.fudge.stun === 0 && j.fudge.load === 2, 'an elf cannot reach Fudge while he is in the air');
  const m = scene();
  m.fudge.x = 1000;
  L.addElf(m, 1010);
  L.step(m, none, 1 / 60);
  check(m.fudge.stun > 0 && m.fudge.load === 0 && m.presents.length === 0, 'with nothing in his cheeks an elf just shoves him');
}

// Stealing back: only a lunge (double tap) at a fleeing elf returns the present, straight into his cheeks.
{
  const make = () => {
    const s = scene();
    s.fudge.x = 1000; s.fudge.dir = 1;
    const p = L.addPresent(s, 1100, 46, 'carriedByElf');
    const e = L.addElf(s, 1100);
    e.state = 'flee'; e.exit = 1; e.present = p; p.carrier = e.id;
    return { s, p, e };
  };
  let { s, p, e } = make();
  run(s, 0.1);
  check(p.state === 'carriedByElf', 'just running at a fleeing elf does not get the present back');
  ({ s, p, e } = make());
  L.step(s, { dir: 0, jump: false, grab: true }, 1 / 60);
  run(s, 0.3);
  check(p.state === 'carried' && s.fudge.load === 1, 'a lunge grabs the present back into his cheeks');
  check(e.state === 'hunt' && e.present === null && e.pause > 0, 'the robbed elf is left stunned and empty-handed');
  ({ s, p, e } = make());
  s.fudge.x = 400;
  L.step(s, { dir: 0, jump: false, grab: true }, 1 / 60);
  run(s, 0.4);
  check(p.state !== 'carried', 'a lunge that falls short gets nothing');
  const q = scene();
  q.fudge.x = 1000;
  L.step(q, { dir: 0, jump: false, grab: true }, 1 / 60);
  const x1 = q.fudge.x;
  L.step(q, { dir: 0, jump: false, grab: true }, 1 / 60);
  check(q.fudge.x > x1 && q.fudge.lunge > 0, 'the lunge dashes forward');
  run(q, 0.5);
  check(q.fudge.lunge === 0, 'the lunge ends');
  const before = q.fudge.x;
  L.step(q, { dir: 0, jump: false, grab: true }, 1 / 60);
  check(q.fudge.x === before, 'a second lunge straight away is on cooldown');
  run(q, 1);
  L.step(q, { dir: 0, jump: false, grab: true }, 1 / 60);
  check(q.fudge.lunge > 0, 'the lunge is ready again after the cooldown');
}

// Elves arrive from both sides, including from behind Fudge.
{
  let behind = 0, far = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = L.createGame(seed);
    s.fudge.x = 1600; s.fudge.dir = 1;       // facing right: behind is the left
    s.elfQueue = [0];
    L.step(s, none, 1 / 60);
    const e = s.elves[0];
    if (Math.abs(e.x - 980) < 1) behind++; else far++;   // 980 = 620 behind Fudge (at 1600, facing right); otherwise the end of the field
    check(Math.abs(e.x - s.fudge.x) > 450, 'elves start off-screen, seed ' + seed);
  }
  check(behind > 10 && far > 10, 'elves come from behind and from ahead (behind ' + behind + ', ahead ' + far + ')');
}

// Delivery only works at the landed sleigh and scores the whole load.
{
  const s = scene();
  s.sleigh.phase = 'landed'; s.sleigh.x = 2600; s.sleigh.h = 0;
  s.fudge.x = 1000;
  for (let i = 0; i < 4; i++) { L.addPresent(s, 1000, 0, 'carried'); s.fudge.load++; }
  run(s, 0.2);
  check(s.fudge.load === 4 && s.score === 0, 'no delivery away from the sleigh');
  s.fudge.x = 2580;
  run(s, 0.1);
  check(s.fudge.load === 0, 'the load is handed over');
  // handing over the last presents also ends the round, which adds the round bonus
  check(s.score === L.deliveryPoints(4) + s.summary.bonus, 'delivery scored ' + s.score);
  check(s.roundDelivered === 4, 'delivered count recorded');
  const t = scene();
  t.sleigh.phase = 'landing'; t.sleigh.x = 1000;
  t.fudge.x = 1000; L.addPresent(t, 1000, 0, 'carried'); t.fudge.load = 1;
  run(t, 0.1);
  check(t.fudge.load === 1, 'cannot deliver before the sleigh has landed');
}

// The sleigh flies, drops every present, then lands.
{
  const s = L.createGame(3);
  s.elfQueue = [];
  const n = s.cfg.presents;
  run(s, 40, none);
  check(s.sleigh.dropped === n, 'all presents were dropped, got ' + s.sleigh.dropped + ' of ' + n);
  check(s.sleigh.phase === 'landed' && s.sleigh.h === 0, 'the sleigh lands');
  check(s.sleigh.landX > C.DROP_END && s.sleigh.landX < C.W, 'it lands ahead, inside the world');
  check(s.presents.every(p => p.state === 'ground'), 'presents are lying in the snow');
}

// Round end: everything delivered or stolen, then the next, harder round starts.
{
  const s = scene();
  s.sleigh.phase = 'landed'; s.sleigh.x = 2600; s.sleigh.h = 0; s.sleigh.xs = []; s.sleigh.dropped = 0;
  s.fudge.x = 2600;
  L.addPresent(s, 2600, 0, 'carried'); s.fudge.load = 1;
  run(s, 0.1);
  check(s.phase === 'between', 'the round ends when nothing is left');
  check(s.summary.delivered === 1 && s.summary.bonus > 0, 'round summary and bonus');
  run(s, 3.2);
  check(s.phase === 'play' && s.round === 2, 'round 2 starts');
  check(s.cfg.elves === L.roundConfig(2).elves && s.presents.length === 0 && s.fudge.load === 0, 'round 2 is a fresh, harder round');
  check(s.score > L.deliveryPoints(1), 'the bonus was added to the score');
}

// Too many stolen presents ends the game and records the best score.
{
  const s = scene();
  s.score = 120;
  s.roundStolen = s.cfg.allowance;
  s.fudge.x = 100;
  L.addPresent(s, 1500, 0, 'ground');
  L.addElf(s, 1480);
  run(s, 30);
  check(s.phase === 'over', 'game over after the allowance is exceeded');
  check(s.best === 120, 'best score recorded');
  const before = s.time;
  L.step(s, none, 0.1);
  check(s.time === before, 'nothing moves after game over');
}

// Same seed, same game; different seed, different game. The stand-in player can play a round.
{
  const play = seed => {
    const s = L.createGame(seed);
    run(s, 90, L.botInput);
    return JSON.stringify([s.round, s.score, s.stolenTotal, s.deliveredTotal, s.phase]);
  };
  check(play(5) === play(5), 'a game is repeatable from its seed');
  check(play(5) !== play(6), 'different seeds play differently');
  const s = L.createGame(11);
  let ended = false;
  for (let i = 0; i < 60 * 400 && !ended; i++) { L.step(s, L.botInput(s), 1 / 60); ended = s.phase === 'between' || s.phase === 'over'; }
  check(ended, 'a round always finishes');
  check(s.sleigh.dropped === s.cfg.presents, 'every present was dropped in that round');
}

// The game can always be lost or won: a long unattended game must terminate (no stuck state).
{
  const s = L.createGame(21);
  let steps = 0;
  while (s.phase !== 'over' && steps < 60 * 60 * 40) { L.step(s, none, 1 / 30); steps++; }
  check(s.phase === 'over', 'an idle player loses eventually');
}

if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('fudge tests passed');

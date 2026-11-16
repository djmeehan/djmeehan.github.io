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
  run(s, 30);
  check(p.state === 'stolen', 'the elf got away with the present');
  check(s.roundStolen === 1, 'the theft is counted');
  check(s.elves.length === 0 && s.elfQueue.length === 1, 'the elf has left and will come back later');
}

// Fudge can win a present back from a fleeing elf by touching it.
{
  const s = scene();
  s.fudge.x = 1500;
  const p = L.addPresent(s, 1500 - 120, 0, 'ground');
  p.state = 'carriedByElf';
  const e = L.addElf(s, 1500 - 20);
  e.state = 'flee'; e.exit = -1; e.present = p; p.carrier = e.id;
  L.step(s, none, 1 / 60);
  check(p.state === 'ground' && e.state === 'hunt', 'touching a fleeing elf makes it drop the present');
}

// A tackle spills part of the load and stuns Fudge; jumping over the elf avoids it.
{
  const s = scene();
  s.fudge.x = 1000;
  for (let i = 0; i < 6; i++) { const p = L.addPresent(s, 1000, 0, 'carried'); s.fudge.load++; }
  const e = L.addElf(s, 1010);
  L.step(s, none, 1 / 60);
  check(s.fudge.load === 3, 'a tackle spills half the load (6 -> 3), got ' + s.fudge.load);
  check(s.fudge.stun > 0, 'Fudge is stunned');
  check(s.presents.filter(p => p.state === 'falling').length === 3, 'spilled presents fall back down');
  const before = s.fudge.load;
  L.step(s, none, 1 / 60);
  check(s.fudge.load === before, 'no second tackle while protected');
  const j = scene();
  j.fudge.x = 1000; j.fudge.h = 90; j.fudge.vh = 0;
  j.fudge.load = 2;
  L.addElf(j, 1005);
  L.step(j, none, 1 / 60);
  check(j.fudge.stun === 0, 'an elf cannot tackle Fudge while he is in the air');
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

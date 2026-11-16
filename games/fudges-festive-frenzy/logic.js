// Fudge's Festive Frenzy: the game rules. No DOM, no clock, no Math.random: everything is driven by step(state, input, dt) and a seeded
// generator, so the rules can be tested headless (test.js) and replayed. The browser (main.js) only draws this state and feeds it input.
//
// Units are world pixels; world x runs 0..W, h is height above the snow (0 = on the ground).
(function (root) {
  'use strict';

  const C = {
    W: 3200,               // world width
    VIEW_W: 960,           // what the screen shows
    VIEW_H: 540,
    FUDGE_SPEED: 250,
    JUMP_V: 620,
    GRAVITY: 1700,
    FUDGE_R: 24,
    ELF_R: 22,
    PICK_R: 30,
    SLEIGH_H: 305,         // flying height
    SLEIGH_SPEED: 260,
    SLEIGH_LAND_SPEED: 110,
    DROP_START: 300,
    DROP_END: 2100,
    PRESENT_GRAVITY: 520,
    MAX_ELVES: 8,
    START_X: 160,
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // How hard round n is: more presents, more and faster elves, and a little more slack for stolen presents every third round.
  function roundConfig(n) {
    return {
      presents: Math.min(5 + 2 * n, 22),
      elves: Math.min(1 + Math.floor(n / 2), C.MAX_ELVES),
      elfSpeed: Math.min(95 + 14 * n, 215),
      allowance: 3 + Math.floor((n - 1) / 3),
    };
  }

  // Fudge slows down the more he carries: greed is a risk.
  function fudgeSpeed(load) {
    return C.FUDGE_SPEED / (1 + 0.09 * load);
  }

  // Points for one delivery: bigger loads are worth more per present, to reward the risk.
  function deliveryPoints(count) {
    return count * 10 + count * (count - 1) * 2;
  }

  function createGame(seed, best) {
    const s = { rng: mulberry32(seed || 1), seed: seed || 1, best: best || 0, round: 0, score: 0, stolenTotal: 0, deliveredTotal: 0,
                phase: 'play', time: 0, timer: 0, events: [], summary: null, nextId: 1 };
    startRound(s, 1);
    return s;
  }

  function startRound(s, n) {
    const cfg = roundConfig(n);
    const xs = [];
    for (let i = 0; i < cfg.presents; i++) {
      const base = C.DROP_START + (i * (C.DROP_END - C.DROP_START)) / Math.max(1, cfg.presents - 1);
      xs.push(base + (s.rng() - 0.5) * 60);
    }
    xs.sort((a, b) => a - b);
    s.round = n;
    s.cfg = cfg;
    s.phase = 'play';
    s.time = 0;
    s.roundStolen = 0;
    s.roundDelivered = 0;
    s.presents = [];
    s.elves = [];
    s.elfQueue = [];
    for (let i = 0; i < cfg.elves; i++) s.elfQueue.push(1.5 + i * 2.2);
    s.fudge = { x: C.START_X, h: 0, vh: 0, dir: 1, load: 0, stun: 0, invuln: 0, moving: false };
    s.sleigh = { x: -140, h: C.SLEIGH_H, phase: 'fly', xs, dropped: 0, landX: C.DROP_END + 400 + s.rng() * 500 };
  }

  function emit(s, type, data) {
    s.events.push(Object.assign({ type }, data || {}));
  }

  function addPresent(s, x, h, state) {
    const p = { id: s.nextId++, x, h: h || 0, vh: 0, vx: 0, state: state || 'ground', lock: 0, kind: Math.floor(s.rng() * 4), carrier: 0 };
    s.presents.push(p);
    return p;
  }

  function addElf(s, x) {
    const e = { id: s.nextId++, x, dir: 1, state: 'hunt', pause: 0, speed: s.cfg.elfSpeed * (0.9 + 0.2 * s.rng()), exit: 1, present: null };
    s.elves.push(e);
    return e;
  }

  function stepFudge(s, input, dt) {
    const f = s.fudge;
    f.stun = Math.max(0, f.stun - dt);
    f.invuln = Math.max(0, f.invuln - dt);
    const dir = f.stun > 0 ? 0 : clamp(input.dir || 0, -1, 1);
    f.moving = dir !== 0;
    if (dir) {
      f.dir = dir > 0 ? 1 : -1;
      f.x = clamp(f.x + dir * fudgeSpeed(f.load) * dt, 20, C.W - 20);
    }
    if (input.jump && f.h === 0 && f.vh === 0 && f.stun <= 0) {
      f.vh = C.JUMP_V * (1 - Math.min(0.3, 0.02 * f.load));
      emit(s, 'jump');
    }
    if (f.h > 0 || f.vh > 0) {
      f.vh -= C.GRAVITY * dt;
      f.h += f.vh * dt;
      if (f.h <= 0) {
        f.h = 0;
        f.vh = 0;
        emit(s, 'land');
      }
    }
  }

  function stepSleigh(s, dt) {
    const z = s.sleigh;
    if (z.phase === 'fly') {
      z.x += C.SLEIGH_SPEED * dt;
      while (z.dropped < z.xs.length && z.x >= z.xs[z.dropped]) {
        const p = addPresent(s, z.x, z.h - 20, 'falling');
        p.vx = 90;
        z.dropped++;
        emit(s, 'drop', { id: p.id });
      }
      if (z.dropped >= z.xs.length) z.phase = 'landing';
    } else if (z.phase === 'landing') {
      const dx = z.landX - z.x;
      const k = Math.min(1, Math.abs(dx) / 200 + 0.15);
      z.x += Math.sign(dx) * Math.min(Math.abs(dx), C.SLEIGH_SPEED * dt * k);
      z.h = Math.max(0, z.h - C.SLEIGH_LAND_SPEED * dt);
      if (Math.abs(z.landX - z.x) < 2 && z.h === 0) {
        z.x = z.landX;
        z.phase = 'landed';
        emit(s, 'sleighLanded');
      }
    }
  }

  function stepPresents(s, dt) {
    const f = s.fudge;
    for (const p of s.presents) {
      p.lock = Math.max(0, p.lock - dt);
      if (p.state === 'falling') {
        p.vh -= C.PRESENT_GRAVITY * dt;
        p.h += p.vh * dt;
        p.x = clamp(p.x + p.vx * dt, 10, C.W - 10);
        p.vx *= Math.max(0, 1 - 1.5 * dt);
        if (p.h <= 0) {
          p.h = 0;
          p.vh = 0;
          p.vx = 0;
          p.state = 'ground';
          emit(s, 'thud', { id: p.id });
        }
      }
      if ((p.state === 'falling' || p.state === 'ground') && p.lock <= 0 && f.stun <= 0 &&
          Math.abs(p.x - f.x) < C.PICK_R && p.h <= f.h + 55) {
        p.state = 'carried';
        f.load++;
        emit(s, 'pickup', { load: f.load });
      }
    }
  }

  function tackle(s, elf) {
    const f = s.fudge;
    const spill = f.load > 0 ? Math.max(1, Math.ceil(f.load * 0.5)) : 0;
    let left = spill;
    for (const p of s.presents) {
      if (left > 0 && p.state === 'carried') {
        p.state = 'falling';
        p.h = f.h + 30;
        p.vh = 320 + s.rng() * 120;
        p.vx = (s.rng() - 0.5) * 360;
        p.lock = 0.7;
        left--;
      }
    }
    f.load -= spill;
    f.stun = 1.0;
    f.invuln = 2.0;
    elf.pause = 0.9;
    elf.x += (elf.x >= f.x ? 1 : -1) * 40;
    emit(s, 'tackle', { spilled: spill });
  }

  function stepElves(s, dt) {
    const f = s.fudge;
    while (s.elfQueue.length && s.time >= s.elfQueue[0]) {
      s.elfQueue.shift();
      const fromRight = f.x < C.W / 2;
      addElf(s, fromRight ? C.W + 30 : -30);
    }
    for (const e of s.elves.slice()) {
      if (e.pause > 0) { e.pause -= dt; continue; }
      if (e.state === 'flee') {
        e.dir = e.exit;
        e.x += e.exit * e.speed * 1.1 * dt;
        e.present.x = e.x;
        e.present.h = 46;
        if (e.x < -60 || e.x > C.W + 60) {
          e.present.state = 'stolen';
          s.roundStolen++;
          s.stolenTotal++;
          s.elves.splice(s.elves.indexOf(e), 1);
          s.elfQueue.push(s.time + 3);
          emit(s, 'steal');
          if (s.roundStolen > s.cfg.allowance) gameOver(s);
          continue;
        }
        if (f.stun <= 0 && f.h < 50 && Math.abs(e.x - f.x) < C.FUDGE_R + C.ELF_R) {
          e.present.state = 'ground';
          e.present.h = 0;
          e.present.lock = 0.5;
          e.present = null;
          e.state = 'hunt';
          e.pause = 1.5;
          emit(s, 'recover');
        }
        continue;
      }
      let target = null;
      for (const p of s.presents) {
        if (p.state === 'ground' && (!target || Math.abs(p.x - e.x) < Math.abs(target.x - e.x))) target = p;
      }
      let goal = null, rate = 1;
      if (target) goal = target.x;
      else if (f.load > 0) goal = f.x;
      else if (Math.abs(f.x - e.x) > 220) { goal = f.x; rate = 0.35; }
      if (goal !== null) {
        const dx = goal - e.x;
        if (Math.abs(dx) > 2) e.dir = dx > 0 ? 1 : -1;
        e.x += Math.sign(dx) * Math.min(Math.abs(dx), e.speed * rate * dt);
      }
      if (target && Math.abs(target.x - e.x) < 18) {
        target.state = 'carriedByElf';
        target.carrier = e.id;
        e.present = target;
        e.state = 'flee';
        e.exit = e.x < C.W / 2 ? -1 : 1;
        emit(s, 'grab');
        continue;
      }
      if (f.invuln <= 0 && f.stun <= 0 && f.h < 35 && Math.abs(e.x - f.x) < (C.FUDGE_R + C.ELF_R) * 0.9) tackle(s, e);
    }
  }

  function deliver(s) {
    const f = s.fudge, z = s.sleigh;
    if (z.phase !== 'landed' || f.load <= 0 || Math.abs(f.x - z.x) > 90) return;
    const count = f.load;
    for (const p of s.presents) if (p.state === 'carried') p.state = 'delivered';
    f.load = 0;
    const points = deliveryPoints(count);
    s.score += points;
    s.roundDelivered += count;
    s.deliveredTotal += count;
    emit(s, 'deliver', { count, points });
  }

  function gameOver(s) {
    s.phase = 'over';
    s.best = Math.max(s.best, s.score);
    emit(s, 'gameOver');
  }

  function checkRoundEnd(s) {
    if (s.phase !== 'play' || s.sleigh.phase !== 'landed') return;
    const open = s.presents.some(p => p.state === 'falling' || p.state === 'ground' || p.state === 'carried' || p.state === 'carriedByElf');
    if (open) return;
    const bonus = 50 + Math.max(0, s.cfg.allowance - s.roundStolen) * 25;
    s.score += bonus;
    s.best = Math.max(s.best, s.score);
    s.summary = { round: s.round, delivered: s.roundDelivered, stolen: s.roundStolen, bonus };
    s.phase = 'between';
    s.timer = 3;
    emit(s, 'roundEnd');
  }

  // One tick. input = { dir: -1|0|1, jump: bool }. Events for sound/effects accumulate in s.events; the caller clears them.
  function step(s, input, dt) {
    dt = Math.min(dt, 0.05);
    if (s.phase === 'over') return;
    if (s.phase === 'between') {
      s.timer -= dt;
      if (s.timer <= 0) startRound(s, s.round + 1);
      return;
    }
    s.time += dt;
    stepFudge(s, input || {}, dt);
    stepSleigh(s, dt);
    stepPresents(s, dt);
    stepElves(s, dt);
    if (s.phase !== 'play') return;
    deliver(s);
    checkRoundEnd(s);
  }

  // A simple stand-in player (used for the title-screen demo and the tests): run to the nearest present, then to the landed sleigh.
  function botInput(s) {
    const f = s.fudge, z = s.sleigh;
    let goal = null;
    const greedy = f.load < 4;
    if (z.phase === 'landed' && f.load > 0 && (!greedy || !s.presents.some(p => p.state === 'ground'))) goal = z.x;
    if (goal === null) {
      let best = null;
      for (const p of s.presents) if (p.state === 'ground' && (!best || Math.abs(p.x - f.x) < Math.abs(best.x - f.x))) best = p;
      if (best) goal = best.x;
      else if (z.phase === 'landed') goal = z.x;
      else goal = Math.min(C.W - 200, z.x + 150);
    }
    const dx = goal - f.x;
    let jump = false;
    for (const e of s.elves) if (e.state === 'hunt' && Math.abs(e.x - f.x) < 90 && (e.x - f.x) * dx >= 0) jump = true;
    return { dir: Math.abs(dx) < 8 ? 0 : Math.sign(dx), jump };
  }

  const api = { C, roundConfig, fudgeSpeed, deliveryPoints, createGame, startRound, step, botInput, addPresent, addElf, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FudgeLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);

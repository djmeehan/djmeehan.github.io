// Fudge's Snowball Showdown: the rules. No DOM, no clock, no Math.random: everything comes from a seeded generator stored in the state
// (state.rs), so a match is plain JSON that can be sent to other phones, replayed and tested headless. The host phone runs these rules;
// everyone else only draws the results.
//
// Coordinates are screen coordinates (y grows downward). The ground is a row of columns; heights[c] is the y of the top of column c.
(function (root) {
  'use strict';

  const C = {
    W: 1920, H: 540,          // the world is twice as wide as a screen: players zoom and pan around it
    COLW: 4,                // ground resolution in pixels
    GRAV: 700,              // px/s^2
    SPEED_K: 13,            // launch speed = power * SPEED_K (full power reaches right across the world)
    WIND_K: 5,             // px/s^2 of sideways push per unit of wind
    MAX_WIND: 10,
    STEP: 1 / 120,
    MAX_T: 14,
    HIT_R: 26,              // how big a pet is for hit tests
    BALL_R: 5,
    CRATER_R: 34,
    HP: 3,
    MIN_POWER: 5, MAX_POWER: 100,
  };
  const COLS = C.W / C.COLW;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function rand(s) {
    s.rs = (s.rs + 0x6D2B79F5) >>> 0;
    let t = s.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const col = x => clamp(Math.floor(x / C.COLW), 0, COLS - 1);

  // ---- the city: a row of snowy rooftops of different heights, one pet on top of each of n of them ----
  function buildCity(s) {
    s.h = new Array(COLS).fill(0);
    s.buildings = [];
    let c = 0, prev = 330;
    while (c < COLS) {
      const w = Math.min(COLS - c, 20 + Math.floor(rand(s) * 21));
      let top = 250 + Math.floor(rand(s) * 170);
      if (Math.abs(top - prev) < 24) top += top > 340 ? -34 : 34;
      top = clamp(top, 240, 440);
      for (let i = c; i < c + w; i++) s.h[i] = top;
      s.buildings.push({ c0: c, c1: c + w, top, hue: Math.floor(rand(s) * 4) });
      prev = top;
      c += w;
    }
    // one pet per zone of the screen, on the rooftop closest to the middle of its zone
    const order = [];
    for (let i = 0; i < s.n; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const zone = COLS / s.n;
    const old = s.players || [];
    s.players = [];
    for (let z = 0; z < s.n; z++) {
      const mid = (z + 0.5) * zone;
      let best = null;
      for (const b of s.buildings) {
        if (b.c1 - b.c0 < 14) continue;
        const d = Math.abs((b.c0 + b.c1) / 2 - mid);
        if (!best || d < best.d) best = { b, d };
      }
      const b = best.b;
      const who = s.roster[order[z]];
      s.players[order[z]] = { name: who.name, char: who.char, x: ((b.c0 + b.c1) / 2) * C.COLW, hp: C.HP, alive: true, face: z < s.n / 2 ? 1 : -1, last: (old[order[z]] || {}).last || null };
    }
    s.wind = Math.round((rand(s) - 0.5) * 12 * 10) / 10;
  }

  // roster: 2 to 4 entries of { name, char }. (A bare number makes a default roster, for tests.)
  const DEFAULT_CHARS = ['fudge', 'smudge', 'molly', 'remy'];
  function createMatch(seed, roster, wins) {
    if (typeof roster === 'number' && (roster < 2 || roster > 4)) throw new Error('a match needs 2 to 4 players');
    if (typeof roster === 'number') roster = DEFAULT_CHARS.slice(0, roster).map((c, i) => ({ name: 'Player ' + (i + 1), char: c }));
    if (roster.length < 2 || roster.length > 4) throw new Error('a match needs 2 to 4 players');
    const n = roster.length;
    const s = { rs: (seed >>> 0) || 1, n, roster, round: 1, wins: wins || new Array(n).fill(0), turn: 0, phase: 'aim', winner: -1, throws: 0, players: [] };
    buildCity(s);
    s.turn = 0;
    return s;
  }

  function nextRound(s) {
    s.round++;
    s.phase = 'aim';
    s.winner = -1;
    s.throws = 0;
    buildCity(s);
    s.turn = (s.round - 1) % s.n;
  }

  // The y of the ground under a pet, and the middle of the pet (used for hit tests and for launching).
  const groundAt = (s, x) => s.h[col(x)];
  const centre = (s, i) => groundAt(s, s.players[i].x) - 22;

  // ---- a throw: pure simulation (nothing is changed) ----
  function simulate(s, who, angle, power) {
    const p = s.players[who];
    const a = (clamp(angle, 0, 180) * Math.PI) / 180;
    const v = clamp(power, C.MIN_POWER, C.MAX_POWER) * C.SPEED_K;
    let x = p.x + Math.cos(a) * 30, y = centre(s, who) - Math.sin(a) * 30;
    let vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
    const ax = s.wind * C.WIND_K, dt = C.STEP;
    const path = [Math.round(x), Math.round(y)];
    let t = 0, steps = 0, hit = null;
    while (t < C.MAX_T && !hit) {
      vx += ax * dt; vy += C.GRAV * dt;
      x += vx * dt; y += vy * dt;
      t += dt; steps++;
      if (steps % 3 === 0) path.push(Math.round(x), Math.round(y));
      for (let i = 0; i < s.n; i++) {
        const q = s.players[i];
        if (!q.alive || (i === who && t < 0.35)) continue;
        const dx = x - q.x, dy = y - centre(s, i);
        if (dx * dx + dy * dy <= (C.HIT_R + C.BALL_R) * (C.HIT_R + C.BALL_R)) { hit = { kind: 'player', player: i, x: Math.round(x), y: Math.round(y) }; break; }
      }
      if (!hit && x >= 0 && x < C.W && y >= s.h[col(x)]) hit = { kind: 'ground', x: Math.round(x), y: Math.round(y) };
      if (!hit && (x < -80 || x > C.W + 80 || y > C.H + 120)) hit = { kind: 'out', x: Math.round(x), y: Math.round(y) };
    }
    if (!hit) hit = { kind: 'out', x: Math.round(x), y: Math.round(y) };
    path.push(hit.x, hit.y);
    return { path, hit };
  }

  // A bite out of the rooftops: the circle removes snow and roof wherever it covers the surface.
  function carve(s, cx, cy, r) {
    for (let c = col(cx - r); c <= col(cx + r); c++) {
      const dx = c * C.COLW + C.COLW / 2 - cx;
      if (Math.abs(dx) >= r) continue;
      const dy = Math.sqrt(r * r - dx * dx);
      if (cy - dy <= s.h[c] && cy + dy > s.h[c]) s.h[c] = Math.min(C.H - 8, Math.round(cy + dy));
    }
  }

  // Christmas spirit: every snowball that lands takes a third away; at 0% the player is out.
  const spirit = p => Math.round((100 * Math.max(0, p.hp)) / C.HP);
  const aliveCount = s => s.players.filter(p => p.alive).length;
  function nextAlive(s, from) {
    for (let k = 1; k <= s.n; k++) { const i = (from + k) % s.n; if (s.players[i].alive) return i; }
    return from;
  }

  // Take a turn. Returns what happened (the flight path for everyone to animate); the state is updated in place.
  function resolveThrow(s, who, angle, power) {
    if (s.phase !== 'aim' || s.turn !== who || !s.players[who] || !s.players[who].alive) return null;
    const sim = simulate(s, who, angle, power);
    const hit = sim.hit;
    if (hit.kind === 'player') {
      const q = s.players[hit.player];
      q.hp--;
      if (q.hp <= 0) { q.alive = false; hit.down = true; }
      carve(s, hit.x, hit.y, 16);
    } else if (hit.kind === 'ground') {
      carve(s, hit.x, hit.y, C.CRATER_R);
    }
    s.players[who].last = { angle: Math.round(angle), power: Math.round(clamp(power, C.MIN_POWER, C.MAX_POWER)) };
    s.throws++;
    if (aliveCount(s) <= 1) {
      s.phase = 'over';
      s.winner = s.players.findIndex(p => p.alive);
      if (s.winner >= 0) s.wins[s.winner]++;
    } else {
      s.turn = nextAlive(s, who);
      s.wind = clamp(Math.round((s.wind + (rand(s) - 0.5) * 8) * 10) / 10, -C.MAX_WIND, C.MAX_WIND);
    }
    return { who, angle, power, path: sim.path, hit };
  }

  // ---- a computer player: tries lots of throws in its head and takes the one that lands closest to a target ----
  function chooseThrow(s, who, skill) {
    const p = s.players[who];
    let target = -1, bestD = 1e9;
    for (let i = 0; i < s.n; i++) {
      if (i === who || !s.players[i].alive) continue;
      const d = Math.abs(s.players[i].x - p.x) + s.players[i].hp * 0; // nearest enemy
      if (d < bestD) { bestD = d; target = i; }
    }
    if (target < 0) return { angle: 45, power: 50 };
    const ty = centre(s, target), tx = s.players[target].x;
    let best = null;
    for (let angle = 12; angle <= 168; angle += 3) {
      for (let power = 20; power <= 100; power += 3) {
        const r = simulate(s, who, angle, power);
        const d = r.hit.kind === 'player' ? (r.hit.player === target ? 0 : 6) : Math.hypot(r.hit.x - tx, r.hit.y - ty);
        if (!best || d < best.d) best = { d, angle, power };
        if (d === 0) break;
      }
      if (best && best.d === 0) break;
    }
    const sk = skill === undefined ? 1 : skill;       // 1 = sloppy, 0 = perfect
    const err = sk * 6;
    return { angle: clamp(Math.round(best.angle + (rand(s) - 0.5) * 2 * err), 0, 180), power: clamp(Math.round(best.power + (rand(s) - 0.5) * 2 * err * 1.4), C.MIN_POWER, C.MAX_POWER), aimedAt: target };
  }

  const api = { C, COLS, spirit, createMatch, nextRound, simulate, resolveThrow, chooseThrow, carve, groundAt, centre, aliveCount, nextAlive, rand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SnowLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);

// Tests for the maze generator in index.html (run: node test.js). Pulls makeMaze out of the page so the test runs the real code.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const dirs = html.match(/const DIRS = [^;]+;/)[0];
const fn = html.match(/function makeMaze\(n\) \{[\s\S]*?\n  \}\n/)[0];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${dirs}\n${fn}\nthis.makeMaze = makeMaze;`, ctx);

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('FAIL: ' + msg); } };

for (const n of [2, 8, 14, 26]) {
  for (let trial = 0; trial < 25; trial++) {
    const g = ctx.makeMaze(n);
    const open = (x, y, d) => !g[y][x][d];
    // walls agree from both sides of every shared edge
    let passages = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (x + 1 < n) { check(open(x, y, 'right') === open(x + 1, y, 'left'), `n=${n}: right/left mismatch at ${x},${y}`); if (open(x, y, 'right')) passages++; }
      if (y + 1 < n) { check(open(x, y, 'down') === open(x, y + 1, 'up'), `n=${n}: down/up mismatch at ${x},${y}`); if (open(x, y, 'down')) passages++; }
      check(!open(x, y, 'up') || y > 0, `n=${n}: opening through the outer top wall`);
      check(!open(x, y, 'left') || x > 0, `n=${n}: opening through the outer left wall`);
    }
    // a perfect maze is a spanning tree: exactly n*n-1 passages, and the goal is reachable from the start
    check(passages === n * n - 1, `n=${n}: expected ${n * n - 1} passages, got ${passages}`);
    const seen = new Set(['0,0']), q = [[0, 0]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [d, dx, dy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) {
        const k = `${x + dx},${y + dy}`;
        if (open(x, y, d) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
    check(seen.size === n * n, `n=${n}: only ${seen.size}/${n * n} cells reachable`);
  }
}
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('maze tests passed');

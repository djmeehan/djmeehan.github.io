// Tests for Fudge's Snowball Showdown (run: node test.js): the game rules (logic.js), the QR encoder (qr.js) and the connection-code
// packing (signal.js). The drawing, menus and live phone connections are checked in a real browser separately.
const L = require('./logic.js');
const Q = require('./qr.js');
const Sig = require('./signal.js');
const C = L.C;

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('FAIL: ' + msg); } };

// ---------------------------------------------------------------- the city and the players
{
  check(C.W === 1920 && L.COLS * C.COLW === C.W, 'the world is 1920 wide');
  for (const n of [2, 3, 4]) {
    let minGap = 1e9;
    for (let seed = 1; seed <= 40; seed++) {
      const s = L.createMatch(seed, n);
      check(s.players.length === n && s.n === n, `${n} players are created`);
      check(s.h.length === L.COLS && s.h.every(v => v >= 240 && v <= 440), 'rooftops are between y 240 and 440');
      check(s.players.every(p => p.hp === 3 && p.alive && L.spirit(p) === 100), 'everyone starts at full Christmas spirit');
      const xs = s.players.map(p => p.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
      check(xs[0] > 0 && xs[xs.length - 1] < C.W, 'players are inside the world');
      check(s.wind >= -C.MAX_WIND && s.wind <= C.MAX_WIND, 'wind is within range');
    }
    check(minGap >= 250, `${n} players are well spaced (closest pair ${minGap}px apart)`);
  }
  const a = JSON.stringify(L.createMatch(9, 4)), b = JSON.stringify(L.createMatch(9, 4)), c = JSON.stringify(L.createMatch(10, 4));
  check(a === b, 'the same seed makes the same match');
  check(a !== c, 'a different seed makes a different match');
  let threw = 0;
  for (const bad of [1, 5, 0]) { try { L.createMatch(1, bad); } catch (e) { threw++; } }
  check(threw === 3, 'a match needs 2 to 4 players');
  const named = L.createMatch(3, [{ name: 'Dad', char: 'fudge' }, { name: 'Mia', char: 'molly' }]);
  check(named.players.map(p => p.name + ':' + p.char).sort().join() === 'Dad:fudge,Mia:molly', 'names and characters are kept');
  check(L.spirit({ hp: 3 }) === 100 && L.spirit({ hp: 2 }) === 67 && L.spirit({ hp: 1 }) === 33 && L.spirit({ hp: 0 }) === 0 && L.spirit({ hp: -1 }) === 0, 'spirit is 100, 67, 33, 0 percent');
}

// ---------------------------------------------------------------- throwing
{
  const s = L.createMatch(5, 3);
  s.wind = 0;
  const p = s.players[0];
  const r1 = L.simulate(s, 0, 45, 70), r2 = L.simulate(s, 0, 45, 70);
  check(JSON.stringify(r1) === JSON.stringify(r2), 'a throw is repeatable');
  check(Math.abs(r1.path[0] - (p.x + Math.cos(Math.PI / 4) * 30)) < 1.5, 'it starts at the pet');
  // wind: on flat ground with nobody else to hit, a lob lands further the way the wind blows
  const flat = L.createMatch(5, 3);
  flat.h.fill(450); flat.players[1].alive = false; flat.players[2].alive = false;
  flat.wind = 0; const calm = L.simulate(flat, 0, 70, 60);
  flat.wind = 10; const right = L.simulate(flat, 0, 70, 60);
  flat.wind = -10; const left = L.simulate(flat, 0, 70, 60);
  check(right.hit.x > calm.hit.x + 20 && left.hit.x < calm.hit.x - 20, 'wind pushes the snowball the way it blows');
  s.wind = 0;
  const weak = L.simulate(s, 0, 45, 20), strong = L.simulate(s, 0, 45, 90);
  check(Math.abs(strong.hit.x - p.x) > Math.abs(weak.hit.x - p.x), 'more power goes further');
  const o = L.createMatch(1, 2); o.wind = 0;
  const far = L.simulate(o, 0, 40, 100);
  const dist = Math.abs(far.hit.x - o.players[0].x);
  check(dist > 900 || far.hit.kind === 'player', 'full power throws a long way (' + Math.round(dist) + 'px)');
  const wild = L.simulate(s, 0, -50, 500);
  check(wild.path.every(Number.isFinite) && wild.hit && wild.hit.kind, 'out-of-range angle and power are clamped, not broken');
  check(r1.path.length >= 4 && r1.path.length % 2 === 0, 'the path is a list of x,y pairs');
}

// ---------------------------------------------------------------- craters
{
  const s = L.createMatch(4, 2);
  const before = s.h.slice();
  L.carve(s, 800, s.h[200] - 2, 34);
  check(s.h.every((v, i) => v >= before[i]), 'a crater only ever lowers the ground');
  check(s.h.some((v, i) => v > before[i]), 'a crater lowers some of it');
  check(s.h.every(v => v <= C.H), 'the ground never sinks off the bottom');
  const t = L.createMatch(4, 2);
  const x = t.players[0].x, g0 = L.groundAt(t, x);
  L.carve(t, x, g0 - 4, 40);
  check(L.groundAt(t, x) > g0, 'a pet standing in a crater sits lower');
}

// ---------------------------------------------------------------- hits, spirit, turns, winning
function aimedHit(s, who, target) {
  // find a throw that lands directly on the target (what a perfect player would do)
  for (let angle = 5; angle <= 175; angle += 2) for (let power = 15; power <= 100; power += 2) {
    const r = L.simulate(s, who, angle, power);
    if (r.hit.kind === 'player' && r.hit.player === target) return { angle, power };
  }
  return null;
}
{
  const s = L.createMatch(12, 3);
  s.wind = 0;
  check(L.resolveThrow(s, 1, 45, 60) === null, 'you cannot throw out of turn');
  const t = aimedHit(s, 0, 1) || aimedHit(s, 0, 2);
  check(!!t, 'there is a direct-hit throw to test with');
  const target = L.simulate(s, 0, t.angle, t.power).hit.player;
  const res = L.resolveThrow(s, 0, t.angle, t.power);
  check(res.hit.kind === 'player' && res.hit.player === target, 'a direct hit is reported');
  check(s.players[target].hp === 2 && L.spirit(s.players[target]) === 67, 'one hit takes a third of the spirit (67% left)');
  check(s.turn === 1, 'the turn passes to the next player');
  check(JSON.stringify(s.players[0].last) === JSON.stringify({ angle: t.angle, power: t.power }), "the thrower's last angle and power are remembered");
  check(s.throws === 1 && s.phase === 'aim', 'the match carries on');
}
{
  // three hits eliminate; the dead are skipped; the last pet standing wins the round
  const s = L.createMatch(21, 3);
  s.wind = 0;
  let guard = 0;
  while (s.phase === 'aim' && guard++ < 60) {
    s.wind = 0;
    const who = s.turn;
    const foe = s.players.findIndex((p, i) => i !== who && p.alive);
    const t = aimedHit(s, who, foe);
    if (t) L.resolveThrow(s, who, t.angle, t.power); else L.resolveThrow(s, who, 90, 10);
  }
  check(s.phase === 'over', 'the match ends');
  const alive = s.players.filter(p => p.alive);
  check(alive.length === 1 && s.winner === s.players.indexOf(alive[0]), 'exactly one pet is left and it wins');
  check(s.players.filter(p => !p.alive).every(p => p.hp === 0 && L.spirit(p) === 0), 'eliminated pets are at 0% spirit');
  check(s.wins[s.winner] === 1 && s.wins.reduce((a, b) => a + b, 0) === 1, 'the win is counted once');
  check(s.players.filter(p => !p.alive).length === 2, 'it took out the other two');
  check(L.resolveThrow(s, s.turn, 45, 50) === null, 'no throws after the round is over');
  const keep = s.wins.slice(), lastKept = s.players[0].last;
  L.nextRound(s);
  check(s.phase === 'aim' && s.round === 2 && s.players.every(p => p.alive && p.hp === 3), 'the next round starts everyone at full spirit');
  check(JSON.stringify(s.wins) === JSON.stringify(keep), 'wins are kept between rounds');
  check(JSON.stringify(s.players[0].last) === JSON.stringify(lastKept), 'last throws are kept between rounds');
  check(s.roster.length === 3, 'the same players take part');
}
{
  // turns skip eliminated players
  const s = L.createMatch(30, 4);
  s.players[1].alive = false; s.players[1].hp = 0;
  check(L.nextAlive(s, 0) === 2, 'the dead are skipped in the turn order');
  check(L.nextAlive(s, 3) === 0, 'the order wraps round');
}

// ---------------------------------------------------------------- state travels as JSON, and the computer player
{
  const s = L.createMatch(8, 4);
  const copy = JSON.parse(JSON.stringify(s));
  const r1 = L.resolveThrow(s, 0, 50, 60), r2 = L.resolveThrow(copy, 0, 50, 60);
  check(JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(s) === JSON.stringify(copy), 'a match sent as JSON plays out identically');
  const size = JSON.stringify(s).length;
  check(size < 9000, 'a whole match state is small enough to send after every throw (' + size + ' bytes)');
}
{
  let hits = 0, total = 0;
  for (const n of [2, 3, 4]) for (let seed = 1; seed <= 30; seed++) {
    const s = L.createMatch(seed, n);
    const t = L.chooseThrow(s, 0, 0);
    total++;
    if (L.simulate(s, 0, t.angle, t.power).hit.kind === 'player') hits++;
  }
  check(hits / total >= 0.9, 'a perfect computer player hits at least 90% of the time (' + hits + '/' + total + ')');
  let sloppy = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = L.createMatch(seed, 3);
    const t = L.chooseThrow(s, 0, 1);
    if (L.simulate(s, 0, t.angle, t.power).hit.kind === 'player') sloppy++;
  }
  check(sloppy < 30, 'a sloppy computer player misses sometimes (' + sloppy + '/30)');
}
{
  // computer vs computer always finishes
  for (const n of [2, 3, 4]) {
    const s = L.createMatch(100 + n, n);
    let turns = 0;
    while (s.phase === 'aim' && turns++ < 400) { const t = L.chooseThrow(s, s.turn, 1); L.resolveThrow(s, s.turn, t.angle, t.power); }
    check(s.phase === 'over', n + ' computer players finish a round (' + turns + ' throws)');
  }
}

// ---------------------------------------------------------------- QR codes
{
  const knownL = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858];
  const knownM = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];
  for (let v = 1; v <= 20; v++) {
    check(Q.byteCapacity(v, 'L') === knownL[v - 1], 'version ' + v + '-L holds ' + knownL[v - 1] + ' bytes');
    check(Q.byteCapacity(v, 'M') === knownM[v - 1], 'version ' + v + '-M holds ' + knownM[v - 1] + ' bytes');
  }
  const q = Q.encode('games/fudges-snowball-showdown/#o=' + 'x'.repeat(200));
  check(q.size === q.version * 4 + 17, 'the grid size matches the version');
  const finder = (ox, oy) => {
    for (let d = 0; d < 7; d++) for (let e = 0; e < 7; e++) {
      const edge = d === 0 || d === 6 || e === 0 || e === 6, core = d >= 2 && d <= 4 && e >= 2 && e <= 4;
      if (q.get(ox + d, oy + e) !== (edge || core)) return false;
    }
    return true;
  };
  check(finder(0, 0) && finder(q.size - 7, 0) && finder(0, q.size - 7), 'the three corner squares are drawn correctly');
  let timing = true;
  for (let i = 8; i < q.size - 8; i++) if (q.get(i, 6) !== (i % 2 === 0) || q.get(6, i) !== (i % 2 === 0)) timing = false;
  check(timing, 'the timing stripes alternate');
  check(q.get(8, q.size - 8) === true, 'the fixed dark module is present');
  // the 15 format bits must be a valid BCH codeword that names the error-correction level and mask we used
  let fmt = 0;
  for (let i = 0; i <= 5; i++) fmt |= (q.get(8, i) ? 1 : 0) << i;
  fmt |= (q.get(8, 7) ? 1 : 0) << 6; fmt |= (q.get(8, 8) ? 1 : 0) << 7; fmt |= (q.get(7, 8) ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) fmt |= (q.get(14 - i, 8) ? 1 : 0) << i;
  const data = ({ L: 1, M: 0 }[q.ecl] << 3) | q.mask;
  let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  check(fmt === (((data << 10) | rem) ^ 0x5412), 'the format information matches the error-correction level and mask');
  // error correction: data followed by its check bytes divides exactly by the generator polynomial
  const bytes = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  const div = Q.rsDivisor(10), ecc = Q.rsRemainder(bytes, div);
  check(Q.rsRemainder(bytes.concat(ecc), div).every(v => v === 0), 'Reed-Solomon check bytes verify');
  check(Q.rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17].concat(ecc.map((v, i) => (i === 3 ? v ^ 1 : v))), div).some(v => v !== 0), 'a corrupted byte is noticed');
  check(Q.encode('hi').version === 1, 'short text fits in version 1');
  check(Q.encode('x'.repeat(100)).version > Q.encode('x'.repeat(10)).version, 'longer text needs a bigger code');
  check(Q.encode("Fudge's ☃ café").version >= 1, 'accents and symbols (UTF-8) are fine');
  let tooLong = false; try { Q.encode('x'.repeat(5000)); } catch (e) { tooLong = true; }
  check(tooLong, 'text that is too long is refused');
  check(JSON.stringify(Q.encode('same').modules) === JSON.stringify(Q.encode('same').modules), 'encoding is deterministic');
}

// ---------------------------------------------------------------- connection codes
{
  const sdp = [
    'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    'a=candidate:1 1 udp 2113937151 6b1f0a52-3c3d-4b0d-8f6e-5d1a6a0c2a11.local 53011 typ host generation 0 network-cost 999',
    'a=candidate:2 1 udp 2113939711 5f3c1d2e-aaaa-4bbb-9ccc-0123456789ab.local 61423 typ host generation 0 network-cost 999',
    'a=candidate:3 1 tcp 1518280447 192.168.1.20 9 typ host tcptype active generation 0 network-cost 999',
    'a=ice-ufrag:Zq4k', 'a=ice-pwd:8Qn2vJ0m1c5wXr7yT3uLpA9d', 'a=ice-options:trickle',
    'a=fingerprint:sha-256 4A:7B:12:9C:0F:E3:55:D1:8E:6A:21:B7:CC:09:F4:30:5E:AA:17:92:68:D4:0B:3F:E1:7C:25:96:B8:41:DE:03',
    'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
  const packed = Sig.pack({ kind: 'o', room: 'K7QD', slot: 2, sdp });
  check(/^[A-Za-z0-9_-]+$/.test(packed), 'a packed code is URL-safe');
  check(packed.length < 360, 'a packed code is short enough for a QR code (' + packed.length + ' chars)');
  const back = Sig.unpack(packed);
  check(back.kind === 'o' && back.room === 'K7QD' && back.slot === 2, 'kind, room and slot survive');
  check(/a=ice-ufrag:Zq4k\r\n/.test(back.sdp) && /a=ice-pwd:8Qn2vJ0m1c5wXr7yT3uLpA9d\r\n/.test(back.sdp), 'ICE credentials survive');
  check(back.sdp.includes('a=fingerprint:sha-256 4A:7B:12:9C:0F:E3:55:D1:8E:6A:21:B7:CC:09:F4:30:5E:AA:17:92:68:D4:0B:3F:E1:7C:25:96:B8:41:DE:03'), 'the fingerprint survives exactly');
  check(back.sdp.includes('6b1f0a52-3c3d-4b0d-8f6e-5d1a6a0c2a11.local 53011 typ host'), 'network addresses survive');
  check(!/tcp/i.test(back.sdp), 'TCP candidates are dropped');
  check(back.sdp.includes('a=setup:actpass') && back.sdp.includes('webrtc-datachannel'), 'an offer asks the other side to choose its DTLS role');
  const ans = Sig.unpack(Sig.pack({ kind: 'a', room: 'K7QD', slot: 2, sdp: sdp.replace('actpass', 'active') }));
  check(ans.kind === 'a' && ans.sdp.includes('a=setup:active'), 'an answer takes the active role');
  let bad = 0;
  for (const junk of ['', 'not-a-code', Buffer.from('[1,2]').toString('base64'), Buffer.from('["x","r",1,"u","p","f",[]]').toString('base64')]) { try { Sig.unpack(junk); } catch (e) { bad++; } }
  check(bad === 4, 'garbage is rejected');
  let noCreds = false; try { Sig.pack({ kind: 'o', room: 'A', slot: 1, sdp: 'v=0\r\n' }); } catch (e) { noCreds = true; }
  check(noCreds, 'a description without credentials is refused');
}

if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('snowball showdown tests passed');

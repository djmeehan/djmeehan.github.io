// Fudge's Snowball Showdown: menus, phone connections, drawing, zoom and the slingshot. The rules are in logic.js (run by the host phone),
// the QR codes in qr.js, and the phone-to-phone links in net.js / signal.js. This file ties them together.
(() => {
  'use strict';
  const Logic = window.SnowLogic, C = Logic.C, WW = C.W, WH = C.H;
  const DEBUG = location.hash.indexOf('debug') >= 0;     // #debug exposes window.__ssd for browser tests
  const $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = o => JSON.parse(JSON.stringify(o));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: just don't remember */ } },
  };

  // ======================================================= the four characters (faces are photos; a drawn initial is the fallback)
  const CHARS = {
    fudge:  { label: 'Fudge',  kind: 'Hamster', src: 'assets/fudge-face.png',  color: '#ff5a64', bg: '#35508f', focus: [0.5, 0.5],  zoom: 1.0 },
    smudge: { label: 'Smudge', kind: 'Cat',     src: 'assets/smudge-face.jpg', color: '#5bb6ff', bg: '#35508f', focus: [0.5, 0.42], zoom: 1.0 },
    molly:  { label: 'Molly',  kind: 'Dog',     src: 'assets/molly-face.jpg',  color: '#ffa94d', bg: '#35508f', focus: [0.5, 0.5],  zoom: 1.0 },
    remy:   { label: 'Remy',   kind: 'Dog',     src: 'assets/remy-face.jpg',   color: '#6fe08f', bg: '#35508f', focus: [0.5, 0.4],  zoom: 1.0 },
  };
  const CHAR_IDS = ['fudge', 'smudge', 'molly', 'remy'];
  const faceLoaded = [];
  for (const id of CHAR_IDS) {
    const img = new Image();
    img.onload = () => { CHARS[id].img = img; faceLoaded.forEach(f => f()); };
    img.src = CHARS[id].src;
  }
  function drawFace(ctx, id, x, y, r) {
    const ch = CHARS[id] || CHARS.fudge;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = ch.bg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    if (ch.img) {
      const sc = Math.max((2 * r) / ch.img.width, (2 * r) / ch.img.height) * ch.zoom;
      const w = ch.img.width * sc, h = ch.img.height * sc;
      ctx.drawImage(ch.img, x - r - (w - 2 * r) * ch.focus[0], y - r - (h - 2 * r) * ch.focus[1], w, h);
    } else {
      ctx.fillStyle = ch.color; ctx.font = `700 ${r * 1.2}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ch.label[0], x, y + r * 0.05);
    }
    ctx.restore();
  }
  function faceCanvas(id, css) {
    const cv = document.createElement('canvas'), d = 2;
    cv.width = cv.height = css * d;
    const ctx = cv.getContext('2d');
    drawFace(ctx, id, css * d / 2, css * d / 2, css * d / 2);
    cv.style.width = cv.style.height = css + 'px';
    return cv;
  }

  // ======================================================= profile: your name and character
  const profile = { name: store.get('fss-name') || '', char: CHARS[store.get('fss-char')] ? store.get('fss-char') : 'fudge' };
  const cleanName = (n, fallback) => (String(n || '').replace(/[^\p{L}\p{N} '_.-]/gu, '').trim().slice(0, 14)) || fallback;
  const saveProfile = () => { store.set('fss-name', profile.name); store.set('fss-char', profile.char); };

  // character pickers: a row of four cards; ones already taken are greyed out
  function buildChars(box, selected, taken, onPick) {
    box.innerHTML = '';
    for (const id of CHAR_IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'char' + (id === selected ? ' sel' : '') + (taken && taken.includes(id) && id !== selected ? ' taken' : '');
      b.append(faceCanvas(id, 64));
      b.append(document.createTextNode(CHARS[id].label));
      const small = document.createElement('small'); small.textContent = taken && taken.includes(id) && id !== selected ? 'taken' : CHARS[id].kind; b.append(small);
      b.addEventListener('click', () => { if (taken && taken.includes(id) && id !== selected) return; onPick(id); });
      box.append(b);
    }
  }

  // ======================================================= screens
  const screens = ['s-title', 's-host', 's-join', 's-over'];
  let current = 's-title';
  function show(id) {
    current = id;
    for (const s of screens) $(s).classList.toggle('on', s === id);
    const playing = id === null;
    $('menu').hidden = !playing;
    $('zoom').style.display = playing ? 'flex' : 'none';
    $('rotate').classList.toggle('show', playing);
    if (id === 's-title') renderTitle();
  }
  function notice(msg, tone) {
    let n = $('notice');
    if (!n) { n = document.createElement('div'); n.id = 'notice'; n.className = 'pill'; n.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:20;max-width:90vw;text-align:center'; document.body.append(n); }
    n.textContent = msg; n.style.borderColor = tone === 'bad' ? '#ff8a8a' : '#ffd166'; n.style.display = 'block';
    clearTimeout(notice.t); notice.t = setTimeout(() => { n.style.display = 'none'; }, 4500);
  }
  function renderTitle() {
    $('name').value = profile.name;
    buildChars($('chars-title'), profile.char, null, id => { profile.char = id; saveProfile(); renderTitle(); });
  }
  $('name').addEventListener('input', () => { profile.name = $('name').value.slice(0, 14); saveProfile(); });
  faceLoaded.push(() => { if (current === 's-title') renderTitle(); else if (current === 's-host') renderHost(); else if (current === 's-join') renderJoin(); });

  // ======================================================= sound (made in code; no audio files)
  const audio = (() => {
    let ac = null, muted = store.get('fss-muted') === '1';
    const unlock = () => { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } };
    const tone = (f, d, type, vol, slide, delay) => {
      if (muted || !ac) return;
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    };
    const play = k => {
      switch (k) {
        case 'throw': tone(300, 0.3, 'sine', 0.1, 900); break;
        case 'thud': tone(140, 0.18, 'sawtooth', 0.1, 50); break;
        case 'hit': tone(500, 0.2, 'square', 0.1, 120); tone(260, 0.25, 'sawtooth', 0.08, 90, 0.08); break;
        case 'down': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.09, null, i * 0.16)); break;
        case 'turn': tone(880, 0.1, 'triangle', 0.08); tone(1175, 0.12, 'triangle', 0.08, null, 0.09); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.14, null, i * 0.1)); break;
        case 'join': tone(660, 0.12, 'triangle', 0.1); tone(990, 0.15, 'triangle', 0.1, null, 0.1); break;
      }
    };
    return { unlock, play, get muted() { return muted; }, toggle() { muted = !muted; store.set('fss-muted', muted ? '1' : '0'); } };
  })();
  const narrow = () => window.innerWidth < 900;
  function labels() {
    $('mute').textContent = narrow() ? (audio.muted ? '🔇' : '🔊') : (audio.muted ? 'Sound off' : 'Sound on');
    $('menu').textContent = narrow() ? '☰' : 'Menu';
    syncFsLabel();
  }
  $('mute').addEventListener('click', () => { audio.toggle(); labels(); });
  addEventListener('resize', labels);

  // ======================================================= full screen (Android and desktop browsers; iPhones need Add to Home Screen)
  const fsEl = document.documentElement;
  const fsSupported = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  function goFullscreen() {
    if (!fsSupported || isFs()) return;
    const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not allowed here */ } }).catch(() => {});
  }
  function leaveFullscreen() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
  $('fs').hidden = !fsSupported;
  $('fs').addEventListener('click', () => { if (isFs()) leaveFullscreen(); else goFullscreen(); });
  function syncFsLabel() { $('fs').textContent = narrow() ? '⛶' : (isFs() ? '⛶ Exit full screen' : '⛶ Full screen'); }
  document.addEventListener('fullscreenchange', syncFsLabel); document.addEventListener('webkitfullscreenchange', syncFsLabel);
  $('ios-tip').hidden = !(isIos && !isStandalone());
  // on a phone, the first tap anywhere goes full screen
  if (touchDevice) addEventListener('pointerup', function once() { removeEventListener('pointerup', once); goFullscreen(); }, { once: true });

  // ======================================================= the game on screen
  const canvas = $('game'), ctx = canvas.getContext('2d');
  let cw = 800, ch = 450, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    clampCam();
  }
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 150));

  // ---- the camera: where in the 1920-wide city we are looking, and how far in
  const cam = { x: WW / 2, y: WH / 2, z: 1, auto: true, tx: WW / 2, ty: WH / 2, tz: 1 };
  const k0 = () => ch / WH;                    // zoom 1 shows the full height of the world
  const scale = () => k0() * cam.z;
  const minZoom = () => Math.max(0.35, Math.min(1, cw / (WW * k0())));   // fully zoomed out: the whole city
  const MAX_ZOOM = 2.6;
  function clampCam() {
    cam.z = clamp(cam.z, minZoom(), MAX_ZOOM);
    const s = scale(), hw = cw / (2 * s), hh = ch / (2 * s);
    cam.x = hw * 2 >= WW ? WW / 2 : clamp(cam.x, hw, WW - hw);
    const top = -260, bottom = WH + 40;
    cam.y = hh * 2 >= bottom - top ? (top + bottom) / 2 : clamp(cam.y, top + hh, bottom - hh);
  }
  const toWorld = (sx, sy) => ({ x: (sx - cw / 2) / scale() + cam.x, y: (sy - ch / 2) / scale() + cam.y });
  function zoomAt(factor, sx, sy) {
    const before = toWorld(sx, sy);
    cam.z = clamp(cam.z * factor, minZoom(), MAX_ZOOM);
    const s = scale();
    cam.x = before.x - (sx - cw / 2) / s; cam.y = before.y - (sy - ch / 2) / s;
    cam.auto = false; clampCam();
  }
  $('zin').addEventListener('click', () => zoomAt(1.4, cw / 2, ch / 2));
  $('zout').addEventListener('click', () => zoomAt(1 / 1.4, cw / 2, ch / 2));
  $('zfit').addEventListener('click', () => { cam.z = minZoom(); cam.x = WW / 2; cam.y = WH / 2 - 40; cam.auto = false; clampCam(); });

  // ---- the match as seen on this phone
  // G.s is what is drawn; results arrive in G.queue and are played one at a time. On the host, H.auth is the real state.
  const G = { s: null, me: 0, roster: [], queue: [], anim: null, fx: [], texts: [], aim: { angle: 50, power: 55 }, sling: null, shake: 0, hurt: {}, bannerT: 0, overTimer: null, over: false, botTimer: null, wasTurn: -1 };
  const H = { auth: null, slotOf: [], links: {}, bots: new Set() };
  let role = 'none';          // 'host' | 'guest' | 'practice' | 'none'

  function beginMatch(state, me) {
    G.s = state; G.me = me; G.waiting = false; G.queue.length = 0; G.anim = null; G.fx.length = 0; G.texts.length = 0; G.sling = null; G.over = false; G.hurt = {};
    clearTimeout(G.overTimer); clearTimeout(G.botTimer);
    show(null);
    $('overlay-over') && ($('overlay-over').hidden = true);
    const last = state.players[me] && state.players[me].last;
    G.aim = last ? { angle: last.angle, power: last.power } : { angle: state.players[me].face > 0 ? 50 : 130, power: 55 };
    focusShooter(true);
    pump();
  }
  const myTurn = () => G.s && G.s.phase === 'aim' && G.s.turn === G.me && G.s.players[G.me].alive && !G.anim && !G.queue.length && !G.waiting && G.me >= 0;
  function focusShooter(snap) {
    const s = G.s; if (!s) return;
    const p = s.players[s.turn]; if (!p) return;
    cam.auto = true; cam.tz = clamp(Math.max(cam.z, 1.0), minZoom(), MAX_ZOOM); cam.tx = p.x; cam.ty = Logic.centre(s, s.turn) - 40;
    if (snap) { cam.z = cam.tz; cam.x = cam.tx; cam.y = cam.ty; clampCam(); }
  }

  // enqueue what happened, then play it for everyone
  function enqueue(res, post) { G.queue.push({ res, post }); pump(); }
  function pump() {
    if (G.anim || !G.queue.length) { maybeBot(); return; }
    const { res, post } = G.queue.shift();
    G.anim = { res, post, t: 0, adopted: false, hold: 0 };
    audio.play('throw');
    cam.auto = true;
  }
  function adopt(a) {
    const prev = G.s;
    G.s = clone(a.post);
    const h = a.res.hit;
    audio.play(h.kind === 'player' ? 'hit' : 'thud');
    for (let i = 0; i < 16; i++) { const ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180; G.fx.push({ x: h.x, y: h.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 90, life: 0.8 + Math.random() * 0.5, max: 1.3, r: 2 + Math.random() * 3 }); }
    if (h.kind === 'player') {
      const q = G.s.players[h.player];
      G.hurt[h.player] = 0.7; G.shake = 0.6;
      G.texts.push({ x: h.x, y: h.y - 40, t: 0, text: h.down ? (q.name + ' is out!') : '-33%', color: h.down ? '#ff8a8a' : '#ffd166' });
      if (h.down) audio.play('down');
    }
    a.adopted = true;
    if (G.s.phase === 'over') { G.overTimer = setTimeout(showOver, 1400); G.over = true; }
  }
  function onAnimDone() {
    G.anim = null;
    if (G.s.phase === 'aim' && !G.queue.length) {
      focusShooter(false); G.bannerT = 3; audio.play('turn');
      const last = G.s.players[G.me] && G.s.players[G.me].last;
      if (G.s.turn === G.me && last) G.aim = { angle: last.angle, power: last.power };
    }
    pump();
  }

  // ---- the host: turns are resolved here
  const controller = i => {
    if (role === 'practice') return i === G.me ? 'me' : 'bot';
    const slot = H.slotOf[i];
    if (slot === 0) return 'me';
    return H.links[slot] && H.links[slot].open && !H.bots.has(slot) ? 'link' : 'bot';
  };
  function hostResolve(who, angle, power) {
    if (!H.auth || H.auth.phase !== 'aim' || H.auth.turn !== who) return;
    const res = Logic.resolveThrow(H.auth, who, angle, power);
    if (!res) return;
    const post = clone(H.auth);
    for (const slot of Object.keys(H.links)) if (H.links[slot].open) H.links[slot].send({ t: 'result', res, state: post });
    enqueue(res, post);
  }
  function maybeBot() {
    if (role !== 'host' && role !== 'practice') return;
    if (!H.auth || H.auth.phase !== 'aim' || G.anim || G.queue.length || G.botTimer) return;
    if (controller(H.auth.turn) !== 'bot') return;
    G.botTimer = setTimeout(() => {
      G.botTimer = null;
      if (!H.auth || H.auth.phase !== 'aim' || G.anim || G.queue.length || controller(H.auth.turn) !== 'bot') return maybeBot();
      const t = Logic.chooseThrow(H.auth, H.auth.turn, 1);
      hostResolve(H.auth.turn, t.angle, t.power);
    }, 1200);
  }
  // you throw: the host resolves it; a guest asks the host
  function doThrow(angle, power) {
    if (!myTurn()) return;
    G.sling = null;
    angle = Math.round(clamp(angle, 0, 180)); power = Math.round(clamp(power, C.MIN_POWER, C.MAX_POWER));
    G.aim = { angle, power };
    if (role === 'host' || role === 'practice') hostResolve(G.me, angle, power);
    else if (guest.link) { guest.link.send({ t: 'throw', angle, power }); G.waiting = true; }
  }

  // ---- the end of a round
  function showOver() {
    const s = G.s; if (!s) return;
    const w = s.winner >= 0 ? s.players[s.winner] : null;
    $('over-title').textContent = w ? (s.winner === G.me ? 'You win! \u{1F389}' : w.name + ' wins! \u{1F389}') : 'Nobody wins';
    $('over-sub').textContent = w ? w.name + ' kept their Christmas spirit with ' + Logic.spirit(w) + '% left.' : '';
    const board = $('over-board'); board.innerHTML = '';
    s.players.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'who';
      d.append(faceCanvas(p.char, 36));
      d.append(document.createTextNode(p.name + (i === G.me ? ' (you)' : '') + ' — ' + s.wins[i] + (s.wins[i] === 1 ? ' win' : ' wins')));
      board.append(d);
    });
    const canNext = role === 'host' || role === 'practice';
    $('over-again').hidden = !canNext;
    $('over-wait').textContent = canNext ? '' : 'Waiting for the host to start the next round…';
    audio.play('win');
    show('s-over');
  }
  $('over-again').addEventListener('click', () => {
    if (!H.auth) return;
    Logic.nextRound(H.auth);
    const st = clone(H.auth);
    for (const slot of Object.keys(H.links)) if (H.links[slot].open) H.links[slot].send({ t: 'round', state: st });
    beginMatch(st, G.me);
  });
  $('over-quit').addEventListener('click', quit);

  // ======================================================= practice against the computer
  function startPractice() {
    cleanup();
    role = 'practice';
    const others = CHAR_IDS.filter(c => c !== profile.char).slice(0, 2);
    const roster = [{ name: cleanName(profile.name, 'Me'), char: profile.char }, ...others.map(c => ({ name: CHARS[c].label, char: c }))];
    H.slotOf = [0, -1, -2]; H.links = {}; H.bots = new Set();
    H.auth = Logic.createMatch((Date.now() ^ (Math.random() * 1e9)) >>> 0, roster);
    G.roster = roster;
    beginMatch(clone(H.auth), 0);
  }

  // ======================================================= hosting: up to three friends join by QR code
  const lobby = { room: '', slots: [], sel: 1 };
  const baseUrl = () => location.origin + location.pathname;
  const randomRoom = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  const slotByN = n => lobby.slots.find(s => s.n === n);
  const lobbyRoster = () => {
    const r = [{ slot: 0, name: cleanName(profile.name, 'Host'), char: profile.char }];
    for (const s of lobby.slots) if (s.connected && s.char) r.push({ slot: s.n, name: s.name, char: s.char });
    return r;
  };
  const takenBy = exceptSlot => lobbyRoster().filter(r => r.slot !== exceptSlot).map(r => r.char);
  function broadcastRoster() {
    const roster = lobbyRoster();
    for (const s of lobby.slots) if (s.connected && s.link.open) s.link.send({ t: 'roster', roster, you: s.n, taken: roster.filter(r => r.slot !== s.n).map(r => r.char) });
    renderHost();
  }
  function hostOpen() {
    cleanup();
    role = 'host';
    lobby.room = randomRoom(); lobby.sel = 1;
    lobby.slots = [1, 2, 3].map(n => ({ n, link: null, offer: '', connected: false, name: '', char: null, answered: false }));
    show('s-host'); renderHost();
    (async () => { for (const s of lobby.slots) await makeSlot(s); })();
  }
  async function makeSlot(s) {
    if (s.link) s.link.close();
    const link = new Net.Link();
    Object.assign(s, { link, offer: '', connected: false, name: '', char: null, answered: false });
    link.onopen = () => { s.connected = true; audio.play('join'); renderHost(); };
    link.onmessage = m => onHostMsg(s, m);
    link.onclose = () => onSlotClosed(s);
    try { s.offer = await link.makeOffer(lobby.room, s.n); } catch (e) { notice('Could not make a join code: ' + e.message, 'bad'); }
    renderHost();
  }
  function onSlotClosed(s) {
    if (role !== 'host') return;
    const wasPlayer = s.connected && s.char;
    s.connected = false;
    if (G.s && !G.over && H.auth) {                // mid-match: the computer plays for them
      H.bots.add(s.n);
      notice((s.name || 'A player') + ' left; the computer takes over.', 'bad');
      maybeBot();
    } else {
      if (wasPlayer) notice((s.name || 'A player') + ' left.', 'bad');
      s.char = null;
      makeSlot(s).then(broadcastRoster);
    }
    renderHost();
  }
  function onHostMsg(s, m) {
    if (m.t === 'hello' || m.t === 'pick') {
      const taken = takenBy(s.n);
      let want = CHARS[m.char] ? m.char : null;
      if (!want || taken.includes(want)) want = CHAR_IDS.find(c => !taken.includes(c));
      s.char = want; s.name = cleanName(m.name, 'Player ' + (s.n + 1));
      broadcastRoster();
    } else if (m.t === 'throw' && H.auth) {
      const who = H.slotOf.indexOf(s.n);
      if (who >= 0 && H.auth.turn === who && !G.anim && !G.queue.length && !H.bots.has(s.n)) hostResolve(who, +m.angle || 0, +m.power || 0);
    }
  }
  function renderHost() {
    $('host-me').innerHTML = ''; $('host-me').append(faceCanvas(profile.char, 36));
    $('host-me').append(document.createTextNode(' ' + cleanName(profile.name, 'Host') + ' (' + CHARS[profile.char].label + ')'));
    const rb = $('host-roster'); rb.innerHTML = '';
    for (const r of lobbyRoster().slice(1)) { const d = document.createElement('div'); d.className = 'who'; d.append(faceCanvas(r.char, 36)); d.append(document.createTextNode(r.name + ' (' + CHARS[r.char].label + ')')); rb.append(d); }
    const tabs = $('slot-tabs'); tabs.innerHTML = '';
    for (const s of lobby.slots) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'tab' + (s.n === lobby.sel ? ' sel' : '') + (s.connected ? ' ok' : '');
      b.textContent = 'Player ' + (s.n + 1) + (s.connected && s.name ? ': ' + s.name : '');
      b.addEventListener('click', () => { lobby.sel = s.n; renderHost(); });
      tabs.append(b);
    }
    const s = slotByN(lobby.sel);
    const link = s && s.offer ? baseUrl() + '#o=' + s.offer : '';
    $('offer-link').value = link;
    const q = $('qr');
    if (link && !s.connected) { QR.draw(q, link, Math.max(2, Math.floor(600 / (QR.encode(link).size + 8)))); q.style.opacity = 1; }
    else { const x = q.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, q.width, q.height); q.style.opacity = s && s.connected ? 0.25 : 0.6; }
    const st = $('slot-status');
    st.className = 'status' + (s && s.connected ? ' good' : '');
    st.textContent = !s ? '' : s.connected ? (s.name || 'A friend') + ' is connected ✓' : s.answered ? 'Connecting…' : s.offer ? 'Waiting for a friend to scan this code…' : 'Making a code…';
    const n = lobbyRoster().length;
    $('host-start').disabled = n < 2;
    $('host-start').textContent = n < 2 ? 'Start game (need 2 to 4 players)' : 'Start game (' + n + ' players)';
  }
  $('b-host').addEventListener('click', () => { audio.unlock(); hostOpen(); });
  $('host-back').addEventListener('click', quit);
  $('copy-offer').addEventListener('click', () => copyText($('offer-link').value));
  $('host-start').addEventListener('click', () => {
    const roster = lobbyRoster();
    if (roster.length < 2) return;
    audio.unlock();
    H.slotOf = roster.map(r => r.slot); H.bots = new Set();
    H.links = {}; for (const s of lobby.slots) if (s.connected) H.links[s.n] = s.link;
    H.auth = Logic.createMatch((Date.now() ^ (Math.random() * 1e9)) >>> 0, roster.map(r => ({ name: r.name, char: r.char })));
    G.roster = roster;
    const st = clone(H.auth);
    roster.forEach((r, i) => { if (r.slot !== 0 && H.links[r.slot]) H.links[r.slot].send({ t: 'start', state: st, you: i }); });
    beginMatch(st, 0);
  });

  // the host receives an answer: pasted, scanned with the camera app (it opens a tab that tells this one) or scanned in the page
  async function receiveAnswer(text) {
    const m = String(text || '').match(/#a=([A-Za-z0-9_-]+)/);
    const packed = m ? m[1] : String(text || '').trim();
    try {
      const a = Signal.unpack(packed);
      if (a.kind !== 'a') throw new Error('that is a join code, not an answer');
      if (a.room !== lobby.room) throw new Error('that code is for a different game');
      const s = slotByN(a.slot);
      if (!s || !s.link || s.connected || s.answered) return;
      s.answered = true; lobby.sel = s.n; renderHost();
      await s.link.acceptAnswer(packed);
    } catch (e) { notice('That code did not work: ' + e.message, 'bad'); }
  }
  $('answer-go').addEventListener('click', () => { receiveAnswer($('answer-in').value); $('answer-in').value = ''; });
  try { const bc = new BroadcastChannel('fss-answers'); bc.onmessage = e => { if (role === 'host') receiveAnswer(e.data); }; window.__bc = bc; } catch (e) { /* no BroadcastChannel: the paste box still works */ }
  addEventListener('storage', e => { if (e.key === 'fss-answer' && e.newValue && role === 'host') receiveAnswer(e.newValue.split('|')[0]); });
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => notice('Link copied'), () => notice('Copy failed: select the link and copy it by hand', 'bad'));
    else notice('Select the link and copy it by hand', 'bad');
  }

  // optional: scan the friend's code inside the page (browsers that have a barcode detector, like Chrome on Android)
  let scanning = false;
  if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) $('scan-go').hidden = false;
  $('scan-go').addEventListener('click', async () => {
    try {
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('video'); v.srcObject = stream; await v.play(); $('scanner').classList.add('on'); scanning = true;
      const stop = () => { scanning = false; stream.getTracks().forEach(t => t.stop()); $('scanner').classList.remove('on'); };
      $('scan-stop').onclick = stop;
      (async function loop() {
        while (scanning) {
          try { const r = await det.detect(v); if (r.length) { const text = r[0].rawValue; if (/#a=/.test(text)) { stop(); receiveAnswer(text); return; } } } catch (e) { /* keep trying */ }
          await new Promise(res => setTimeout(res, 250));
        }
      })();
    } catch (e) { notice('Could not open the camera: ' + e.message, 'bad'); }
  });

  // ======================================================= joining
  const guest = { link: null, roster: [], taken: [], slot: 0, joined: false };
  function renderJoin() {
    $('jname').value = profile.name;
    buildChars($('chars-join'), profile.char, guest.taken, id => { profile.char = id; saveProfile(); sendPick(); renderJoin(); });
  }
  function sendPick() { if (guest.link && guest.link.open) guest.link.send({ t: 'pick', name: cleanName(profile.name, ''), char: profile.char }); }
  $('jname').addEventListener('input', () => { profile.name = $('jname').value.slice(0, 14); saveProfile(); clearTimeout(sendPick.t); sendPick.t = setTimeout(sendPick, 400); });
  $('b-join').addEventListener('click', () => { audio.unlock(); cleanup(); role = 'guest'; show('s-join'); $('join-paste').hidden = false; $('join-answer').hidden = true; renderJoin(); });
  $('join-back').addEventListener('click', quit);
  $('offer-go').addEventListener('click', () => { const m = $('offer-in').value.match(/#o=([A-Za-z0-9_-]+)/); guestJoin(m ? m[1] : $('offer-in').value.trim()); });
  $('copy-answer').addEventListener('click', () => copyText($('answer-link').value));
  async function guestJoin(packedOffer) {
    cleanup(); role = 'guest';
    show('s-join'); renderJoin();
    $('join-paste').hidden = true; $('join-answer').hidden = false; $('qr2').style.display = ''; $('join-linkrow').style.display = '';
    $('join-answer').querySelector('p').innerHTML = '<b>Now show this to the host.</b> They scan it with their camera (or you can send them the link).';
    const st = $('join-status'); st.className = 'status'; st.textContent = 'Making your code…';
    const link = new Net.Link(); guest.link = link; guest.joined = false;
    link.onopen = () => { st.className = 'status good'; st.textContent = 'Connected to the host ✓ Waiting for the game to start…'; $('qr2').style.display = 'none'; $('join-linkrow').style.display = 'none'; $('join-answer').querySelector('p').textContent = 'You are in!';  sendPick(); link.send({ t: 'hello', name: cleanName(profile.name, ''), char: profile.char }); audio.play('join'); };
    link.onmessage = onGuestMsg;
    link.onclose = () => { if (role === 'guest') { notice('Lost the connection to the host.', 'bad'); quit(); } };
    try {
      const r = await link.answerOffer(packedOffer);
      const url = baseUrl() + '#a=' + r.packed;
      $('answer-link').value = url;
      QR.draw($('qr2'), url, Math.max(2, Math.floor(600 / (QR.encode(url).size + 8))));
      st.textContent = 'Waiting for the host to scan this code…';
      try { new BroadcastChannel('fss-answers').postMessage(url); store.set('fss-answer', r.packed + '|' + Date.now()); } catch (e) { /* different device: the host scans the code */ }
    } catch (e) { st.className = 'status bad'; st.textContent = 'That join code did not work: ' + e.message; $('join-paste').hidden = false; }
  }
  function onGuestMsg(m) {
    if (m.t === 'roster') { guest.roster = m.roster; guest.taken = m.taken || []; guest.slot = m.you; if (current === 's-join') renderJoin(); }
    else if (m.t === 'start') { G.roster = m.state.roster; H.auth = null; beginMatch(m.state, m.you); }
    else if (m.t === 'result') { G.waiting = false; enqueue(m.res, m.state); }
    else if (m.t === 'round') { beginMatch(m.state, G.me); }
  }

  // ======================================================= leaving
  function cleanup() {
    for (const s of lobby.slots) if (s.link) s.link.close();
    lobby.slots = [];
    if (guest.link) guest.link.close();
    guest.link = null; guest.taken = []; guest.roster = [];
    clearTimeout(G.botTimer); clearTimeout(G.overTimer); G.botTimer = null;
    G.s = null; G.anim = null; G.queue.length = 0; H.auth = null; H.links = {}; H.bots = new Set(); H.slotOf = [];
    role = 'none';
  }
  function quit() {
    cleanup(); show('s-title');
  }
  $('menu').addEventListener('click', () => { if (confirm('Leave this game?')) quit(); });
  $('b-practice').addEventListener('click', () => { audio.unlock(); startPractice(); });

  // ======================================================= input: slingshot, pinch to zoom, wheel zoom, keyboard
  const ptrs = new Map();
  let gesture = null, pan = null;
  const rect = () => canvas.getBoundingClientRect();
  const local = e => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function aimFromDrag(a, p) {
    const dx = p.x - a.x, dy = p.y - a.y;
    const reach = Math.min(cw, ch) * 0.38;
    const power = clamp((Math.hypot(dx, dy) / reach) * 100, 0, 100);
    const angle = (Math.atan2(Math.max(dy, 0), -dx) * 180) / Math.PI;     // pull back to throw forward, like a slingshot
    return { angle: clamp(angle, 0, 180), power };
  }
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault(); audio.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.x, cy: cam.y };
      G.sling = null; pan = null;
    } else if (myTurn() && !G.over) {
      G.sling = { id: e.pointerId, a: local(e), power: 0, angle: G.aim.angle, live: false };
    } else {
      pan = { x: local(e).x, y: local(e).y, cx: cam.x, cy: cam.y };
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (gesture && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.z = clamp(gesture.z * (d / gesture.d), minZoom(), MAX_ZOOM);
      const s = scale();
      cam.x = gesture.cx - (mx - gesture.mx) / s; cam.y = gesture.cy - (my - gesture.my) / s;
      cam.auto = false; clampCam();
    } else if (G.sling && G.sling.id === e.pointerId) {
      const r = aimFromDrag(G.sling.a, local(e));
      G.sling.live = r.power > 4; G.sling.power = r.power; G.sling.angle = r.angle;
      if (G.sling.live) G.aim = { angle: r.angle, power: r.power };
    } else if (pan) {
      const p = local(e), s = scale();
      cam.x = pan.cx - (p.x - pan.x) / s; cam.y = pan.cy - (p.y - pan.y) / s; cam.auto = false; clampCam();
    }
  });
  const pointerEnd = e => {
    if (G.sling && G.sling.id === e.pointerId) {
      if (G.sling.live && G.sling.power >= 8) doThrow(G.sling.angle, G.sling.power);
      G.sling = null;
    }
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) gesture = null;
    if (!ptrs.size) pan = null;
  };
  canvas.addEventListener('pointerup', pointerEnd); canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (current !== null) return;
    const k = e.key;
    if (k === '+' || k === '=') zoomAt(1.25, cw / 2, ch / 2);
    else if (k === '-' || k === '_') zoomAt(0.8, cw / 2, ch / 2);
    else if (k === '0') $('zfit').click();
    else if (myTurn()) {
      const big = e.shiftKey ? 5 : 1;
      if (k === 'ArrowLeft') { G.aim.angle = clamp(G.aim.angle + big, 0, 180); }
      else if (k === 'ArrowRight') { G.aim.angle = clamp(G.aim.angle - big, 0, 180); }
      else if (k === 'ArrowUp') { G.aim.power = clamp(G.aim.power + big, C.MIN_POWER, 100); }
      else if (k === 'ArrowDown') { G.aim.power = clamp(G.aim.power - big, C.MIN_POWER, 100); }
      else if (k === ' ' || k === 'Enter') { doThrow(G.aim.angle, G.aim.power); }
      else return;
      e.preventDefault(); G.keyAim = true;
    }
  });

  // ======================================================= drawing
  let T = 0;
  const flakes = Array.from({ length: 140 }, (_, i) => ({ x: ((i * 97) % 1000) / 1000, y: ((i * 61) % 1000) / 1000, r: 0.8 + ((i * 37) % 100) / 45, sp: 14 + ((i * 53) % 100) / 2.2, ph: i }));
  const stars = Array.from({ length: 90 }, (_, i) => ({ x: ((i * 131) % 1000) / 1000, y: ((i * 71) % 1000) / 1000 * 0.55, r: 0.5 + ((i * 17) % 10) / 8, ph: i * 0.7 }));
  const PALETTE = ['#3b3470', '#2e4f86', '#5f3d63', '#2f6577'];

  function drawSkyAndFar() {
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#091649'); g.addColorStop(0.5, '#20409a'); g.addColorStop(0.85, '#6f92dd'); g.addColorStop(1, '#b3c8f2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    for (const s of stars) { const a = 0.4 + 0.6 * Math.abs(Math.sin(T * 1.5 + s.ph)); ctx.fillStyle = `rgba(255,255,240,${a * 0.85})`; ctx.fillRect(s.x * cw, s.y * ch, s.r, s.r); }
    const mx = cw * 0.8 - (cam.x - WW / 2) * 0.03 * scale(), my = ch * 0.17;
    const gl = ctx.createRadialGradient(mx, my, 0, mx, my, 90); gl.addColorStop(0, 'rgba(255,246,215,0.4)'); gl.addColorStop(1, 'rgba(255,246,215,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(mx, my, 90, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(mx, my, 24, 0, 7); ctx.fill();
    // far hills, slowly scrolling
    ctx.fillStyle = '#2c4aa0';
    ctx.beginPath(); ctx.moveTo(0, ch);
    const s = scale();
    for (let x = 0; x <= cw; x += 12) { const wx = (x - cw / 2) / s * 0.3 + cam.x * 0.3; ctx.lineTo(x, (WH * 0.62 - cam.y) * s * 0.9 + ch / 2 + Math.sin(wx * 0.006) * 26 * s + Math.sin(wx * 0.017) * 9 * s); }
    ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill();
  }

  function drawCity(s) {
    const h = s.h;
    // building bodies and windows
    s.buildings.forEach((b, bi) => {
      const x0 = b.c0 * C.COLW, x1 = b.c1 * C.COLW;
      if (x1 < cam.x - cw / (2 * scale()) - 20 || x0 > cam.x + cw / (2 * scale()) + 20) return;
      ctx.beginPath(); ctx.moveTo(x0, WH + 400);
      for (let c = b.c0; c < b.c1; c++) { ctx.lineTo(c * C.COLW, h[c]); ctx.lineTo(c * C.COLW + C.COLW, h[c]); }
      ctx.lineTo(x1, WH + 400); ctx.closePath();
      const gr = ctx.createLinearGradient(0, b.top, 0, WH + 100); gr.addColorStop(0, PALETTE[b.hue]); gr.addColorStop(1, '#171a3f');
      ctx.fillStyle = gr; ctx.fill();
      ctx.save(); ctx.clip();
      for (let wy = b.top + 26; wy < WH + 80; wy += 30) {
        for (let wx = x0 + 14, ix = 0; wx < x1 - 18; wx += 26, ix++) {
          let surf = 0; for (let c = Math.floor(wx / C.COLW); c <= Math.floor((wx + 12) / C.COLW); c++) surf = Math.max(surf, h[Math.min(c, h.length - 1)]);
          if (wy < surf + 10) continue;
          const lit = ((bi * 31 + ix * 7 + Math.floor((wy - b.top) / 30) * 13) % 5) !== 0;
          ctx.fillStyle = lit ? ((ix + bi) % 3 === 0 ? '#ffb86b' : '#ffd98a') : '#1c2552';
          ctx.fillRect(wx, wy, 12, 16);
        }
      }
      ctx.restore();
    });
    // snow on every roof, and fairy lights along the edge
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, h[0]);
    for (let c = 0; c < h.length; c++) { ctx.lineTo(c * C.COLW, h[c]); ctx.lineTo(c * C.COLW + C.COLW, h[c]); }
    ctx.strokeStyle = '#dfe9ff'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.translate(0, -2); ctx.stroke(); ctx.translate(0, 2);
    const cols = ['#ff5a64', '#ffd166', '#6bdc8f', '#6bb7ff'];
    const lo = Math.max(0, Math.floor((cam.x - cw / (2 * scale())) / C.COLW)), hi = Math.min(h.length - 1, Math.ceil((cam.x + cw / (2 * scale())) / C.COLW));
    for (let c = lo; c <= hi; c += 7) {
      const tw = 0.55 + 0.45 * Math.sin(T * 3 + c);
      const gl = ctx.createRadialGradient(c * C.COLW, h[c] - 7, 0, c * C.COLW, h[c] - 7, 10); gl.addColorStop(0, 'rgba(255,230,160,' + 0.5 * tw + ')'); gl.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(c * C.COLW, h[c] - 7, 10, 0, 7); ctx.fill();
      ctx.fillStyle = cols[(c / 7) & 3]; ctx.beginPath(); ctx.arc(c * C.COLW, h[c] - 7, 2.6, 0, 7); ctx.fill();
    }
  }

  const labelScale = () => clamp(1 / scale(), 0.85, 2.4);
  function drawPet(s, i) {
    const p = s.players[i], gy = Logic.groundAt(s, p.x), cy = gy - 22, ch0 = CHARS[p.char] || CHARS.fudge;
    const shake = G.hurt[i] > 0 ? Math.sin(T * 60) * 5 * G.hurt[i] : 0;
    ctx.save(); ctx.translate(p.x + shake, 0);
    if (!p.alive) {
      ctx.fillStyle = '#e8f0ff'; ctx.beginPath(); ctx.ellipse(0, gy - 2, 30, 14, 0, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = 0.5; drawFace(ctx, p.char, 0, gy - 14, 14); ctx.globalAlpha = 1;
      ctx.restore(); return;
    }
    if (i === s.turn && s.phase === 'aim') { const gl = ctx.createRadialGradient(0, cy, 8, 0, cy, 64); gl.addColorStop(0, 'rgba(255,209,102,' + (0.35 + 0.15 * Math.sin(T * 5)) + ')'); gl.addColorStop(1, 'rgba(255,209,102,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, cy, 64, 0, 7); ctx.fill(); }
    ctx.fillStyle = ch0.color; ctx.beginPath(); ctx.roundRect(-17, gy - 14, 34, 14, 6); ctx.fill();           // scarf
    ctx.fillStyle = '#fff'; ctx.fillRect(-17, gy - 9, 34, 3);
    drawFace(ctx, p.char, 0, cy, 26);
    ctx.strokeStyle = ch0.color; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, cy, 26, 0, 7); ctx.stroke();
    ctx.fillStyle = '#d32f3f'; ctx.beginPath(); ctx.moveTo(-18, cy - 20); ctx.quadraticCurveTo(-6, cy - 46, 14, cy - 34); ctx.lineTo(10, cy - 22); ctx.closePath(); ctx.fill();   // Santa hat
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(15, cy - 34, 5, 0, 7); ctx.fill(); ctx.fillRect(-20, cy - 24, 32, 5);
    // name and Christmas spirit
    const ls = labelScale(), pct = Logic.spirit(p), top = cy - 40 * 1;
    ctx.save(); ctx.translate(0, cy - 56); ctx.scale(ls, ls);
    ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(5,10,35,0.7)'; ctx.fillText(p.name, 1, -9); ctx.fillStyle = '#fff'; ctx.fillText(p.name, 0, -10);
    ctx.fillStyle = 'rgba(8,16,48,0.75)'; ctx.beginPath(); ctx.roundRect(-34, -2, 68, 11, 5); ctx.fill();
    ctx.fillStyle = pct > 60 ? '#6bdc8f' : pct > 30 ? '#ffd166' : '#ff7a70';
    if (pct > 0) { ctx.beginPath(); ctx.roundRect(-33, -1, 66 * pct / 100, 9, 4); ctx.fill(); }
    ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = '#0b1637'; ctx.fillText(pct + '%', 0, 4);
    ctx.restore();
    ctx.restore();
  }

  function pathPoint(path, t) {          // t counts path samples (40 per second)
    const n = path.length / 2 - 1, i = Math.min(n - 1, Math.floor(t)), f = Math.min(1, t - i);
    const x0 = path[i * 2], y0 = path[i * 2 + 1], x1 = path[i * 2 + 2], y1 = path[i * 2 + 3];
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
  }

  function drawWorld() {
    const s = G.s; if (!s) return;
    drawCity(s);
    for (let i = 0; i < s.n; i++) drawPet(s, i);
    // aiming preview: the first moments of the throw
    const aimingNow = myTurn() && (!G.sling || G.sling.live);
    if (aimingNow) {
      const r = Logic.simulate(s, G.me, G.aim.angle, G.aim.power), pts = Math.min(r.path.length / 2, 22);
      for (let i = 1; i < pts; i += 1) { ctx.fillStyle = 'rgba(255,255,255,' + (0.9 - i / pts * 0.7) + ')'; ctx.beginPath(); ctx.arc(r.path[i * 2], r.path[i * 2 + 1], 3.2, 0, 7); ctx.fill(); }
    }
    // the snowball in flight
    const a = G.anim;
    if (a) {
      const p = pathPoint(a.res.path, a.t * 40);
      for (let k = 1; k <= 8; k++) { const q = pathPoint(a.res.path, Math.max(0, a.t * 40 - k * 1.2)); ctx.fillStyle = 'rgba(255,255,255,' + (0.5 - k * 0.055) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, 6 - k * 0.4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(190,215,255,0.9)'; ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 3, 0, 7); ctx.fill();
    }
    for (const f of G.fx) { ctx.globalAlpha = clamp(f.life / f.max * 1.4, 0, 1); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const t of G.texts) { const ls = labelScale(); ctx.globalAlpha = clamp(1.6 - t.t, 0, 1); ctx.font = `800 ${22 * ls}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(5,10,35,0.7)'; ctx.fillText(t.text, t.x + 2, t.y - t.t * 40 + 2); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y - t.t * 40); }
    ctx.globalAlpha = 1;
  }

  // ---- the heads-up display (screen space)
  const txt = (s, x, y, size, color, align, weight, plain) => { ctx.font = `${weight || 700} ${size}px system-ui, -apple-system, sans-serif`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; if (!plain) { ctx.fillStyle = 'rgba(5,10,35,0.75)'; ctx.fillText(s, x + 1.5, y + 1.5); } ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y); };
  const panel = (x, y, w, h, r) => { ctx.fillStyle = 'rgba(8,16,48,0.72)'; ctx.strokeStyle = 'rgba(255,209,102,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, w, h, r || 12); ctx.fill(); ctx.stroke(); };

  function drawHud() {
    const s = G.s; if (!s) return;
    const u = clamp(Math.min(cw / 900, ch / 420), 0.7, 1.25);        // a unit that grows a little on bigger screens
    // one panel per player along the top: face, name, Christmas spirit bar and percentage
    const compact = cw < 900, left = 118 * u + 8, right = (compact ? 160 : 340) * u, avail = cw - left - right, pw = Math.min(210 * u, avail / s.n - 8), ph = 50 * u;
    for (let i = 0; i < s.n; i++) {
      const p = s.players[i], x = left + i * (pw + 8), y = 8, pct = Logic.spirit(p), cur = i === s.turn && s.phase === 'aim';
      ctx.globalAlpha = p.alive ? 1 : 0.5; panel(x, y, pw, ph, 12 * u);
      if (cur) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 12 * u); ctx.stroke(); }
      drawFace(ctx, p.char, x + 24 * u, y + ph / 2, 19 * u);
      txt(p.name + (i === G.me ? ' (you)' : ''), x + 48 * u, y + 14 * u, 13 * u, '#fff');
      const bx = x + 48 * u, bw = pw - 56 * u, by = y + 27 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, 14 * u, 7 * u); ctx.fill();
      ctx.fillStyle = pct > 60 ? '#6bdc8f' : pct > 30 ? '#ffd166' : '#ff7a70';
      if (pct > 0) { ctx.beginPath(); ctx.roundRect(bx, by, Math.max(10 * u, bw * pct / 100), 14 * u, 7 * u); ctx.fill(); }
      txt(p.alive ? pct + '% spirit' : 'out!', bx + bw / 2, by + 7.5 * u, 10.5 * u, '#0b1637', 'center', 800, true);
      ctx.globalAlpha = 1;
    }
    // wind: an arrow whose length shows the strength
    const wx = cw / 2, wy = 8 + ph + 22 * u;
    panel(wx - 92 * u, wy - 15 * u, 184 * u, 30 * u, 15 * u);
    const w = s.wind, len = Math.abs(w) / C.MAX_WIND * 46 * u;
    txt('Wind', wx - 82 * u, wy, 12 * u, '#b9c8ee', 'left', 600);
    ctx.strokeStyle = '#8fd3ff'; ctx.fillStyle = '#8fd3ff'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
    const dir = w >= 0 ? 1 : -1, cx0 = wx - 4 * u;
    ctx.beginPath(); ctx.moveTo(cx0 - dir * len / 2, wy); ctx.lineTo(cx0 + dir * len / 2, wy); ctx.stroke();
    if (Math.abs(w) > 0.2) { ctx.beginPath(); ctx.moveTo(cx0 + dir * (len / 2 + 7 * u), wy); ctx.lineTo(cx0 + dir * len / 2, wy - 5 * u); ctx.lineTo(cx0 + dir * len / 2, wy + 5 * u); ctx.closePath(); ctx.fill(); }
    txt((Math.abs(w) < 0.2 ? 'calm' : Math.abs(w).toFixed(1)), wx + 62 * u, wy, 13 * u, '#fff', 'center');
    // the shooter's numbers, bottom left
    const sh = s.players[s.turn], mine = s.turn === G.me, last = sh.last;
    const bw = 210 * u, bh = (mine ? 92 : 64) * u, bx = 10, by = ch - bh - 10;
    panel(bx, by, bw, bh, 14 * u);
    txt(G.anim ? 'Snowball away!' : mine ? 'Your turn' : sh.name + "'s turn", bx + 14 * u, by + 16 * u, 14 * u, '#ffd166');
    if (mine && myTurn()) {
      txt('Angle', bx + 14 * u, by + 40 * u, 13 * u, '#b9c8ee', 'left', 600); txt(Math.round(G.aim.angle) + '°', bx + bw - 14 * u, by + 40 * u, 17 * u, '#fff', 'right');
      txt('Power', bx + 14 * u, by + 62 * u, 13 * u, '#b9c8ee', 'left', 600); txt(Math.round(G.aim.power) + '%', bx + bw - 14 * u, by + 62 * u, 17 * u, '#fff', 'right');
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx + 70 * u, by + 69 * u, bw - 140 * u, 4 * u); ctx.fillStyle = '#ffd166'; ctx.fillRect(bx + 70 * u, by + 69 * u, (bw - 140 * u) * G.aim.power / 100, 4 * u);
      txt(last ? 'Last: ' + last.angle + '° at ' + last.power + '%' : 'Last: none yet', bx + 14 * u, by + 84 * u, 11.5 * u, '#9fb4e6', 'left', 600);
    } else {
      txt(last ? 'Last: ' + last.angle + '° at ' + last.power + '%' : 'No throws yet', bx + 14 * u, by + 42 * u, 13 * u, '#b9c8ee', 'left', 600);
    }
    // a hint at the start of your turn, and while waiting
    if (mine && myTurn() && G.bannerT > 0) {
      ctx.globalAlpha = clamp(G.bannerT, 0, 1);
      txt('Pull back anywhere and let go to throw!', cw / 2, ch - 34 * u, 19 * u, '#fff', 'center');
      txt('Two fingers: pinch to zoom, drag to move the view', cw / 2, ch - 12 * u, 12.5 * u, '#cfe0ff', 'center', 600);
      ctx.globalAlpha = 1;
    } else if (!mine && !G.anim && s.phase === 'aim') {
      txt('Waiting for ' + sh.name + '…', cw / 2, ch - 22 * u, 15 * u, '#cfe0ff', 'center', 600);
    }
    // the slingshot band while you drag
    if (G.sling && G.sling.live) {
      const sl = G.sling, p = ptrs.get(sl.id);
      if (p) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(sl.a.x, sl.a.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sl.a.x, sl.a.y, 7, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,209,102,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.fill();
        txt(Math.round(sl.angle) + '° · ' + Math.round(sl.power) + '%', p.x, p.y - 26, 18 * u, '#fff', 'center');
      }
    }
  }

  function drawSnow(dt) {
    const wind = G.s ? G.s.wind : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of flakes) {
      f.y += f.sp * dt / ch; f.x += (wind * 5 + Math.sin(T * 0.8 + f.ph) * 9) * dt / cw;
      if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      if (f.x < -0.02) f.x = 1.02; else if (f.x > 1.02) f.x = -0.02;
      ctx.beginPath(); ctx.arc(f.x * cw, f.y * ch, f.r * Math.max(0.8, scale() * 0.9), 0, 7); ctx.fill();
    }
  }

  // ======================================================= the loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    // animation clock
    const a = G.anim;
    if (a) {
      a.t += dt * 1.15;
      const total = (a.res.path.length / 2 - 1) / 40;
      if (!a.adopted && a.t >= total) adopt(a);
      if (a.adopted) { a.hold += dt; if (a.hold > 0.9) onAnimDone(); }
      else { const p = pathPoint(a.res.path, a.t * 40); cam.tx = p.x; cam.ty = p.y; }
    } else if (G.s && cam.auto) {
      const sh = G.s.players[G.s.turn]; if (sh) { cam.tx = sh.x; cam.ty = Logic.centre(G.s, G.s.turn) - 40; }
    }
    if (cam.auto && G.s) {
      const k = Math.min(1, dt * 4);
      cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k; clampCam();
    }
    G.bannerT = Math.max(0, G.bannerT - dt); G.shake = Math.max(0, G.shake - dt * 2);
    for (const k of Object.keys(G.hurt)) G.hurt[k] = Math.max(0, G.hurt[k] - dt);
    for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; f.life -= dt; f.vy += 420 * dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.life <= 0) G.fx.splice(i, 1); }
    for (let i = G.texts.length - 1; i >= 0; i--) { G.texts[i].t += dt; if (G.texts[i].t > 1.6) G.texts.splice(i, 1); }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (current !== null || !G.s) {
      // behind the menus: a calm snowy night
      drawSkyAndFar(); drawSnow(dt);
    } else {
      ctx.save();
      if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake * 10, (Math.random() - 0.5) * G.shake * 10);
      drawSkyAndFar();
      const s = scale();
      ctx.save(); ctx.translate(cw / 2, ch / 2); ctx.scale(s, s); ctx.translate(-cam.x, -cam.y);
      drawWorld();
      ctx.restore();
      drawSnow(dt);
      ctx.restore();
      drawHud();
    }
    requestAnimationFrame(frame);
  }

  // ======================================================= starting up: a scanned link may carry a join code or an answer
  resize();
  labels();
  show('s-title');
  (function route() {
    const h = location.hash, o = h.match(/^#o=([A-Za-z0-9_-]+)/), a = h.match(/^#a=([A-Za-z0-9_-]+)/);
    if (o) {
      history.replaceState(null, '', location.pathname + location.search);
      guestJoin(o[1]);
    } else if (a) {
      history.replaceState(null, '', location.pathname + location.search);
      try { new BroadcastChannel('fss-answers').postMessage(baseUrl() + '#a=' + a[1]); } catch (e) { /* ignore */ }
      store.set('fss-answer', a[1] + '|' + Date.now());
      document.querySelector('#s-title .sub').textContent = 'Code sent to the host\u2019s game. Go back to the game on the host phone \u2014 it should say your friend is connected. You can close this tab.';
      setTimeout(() => { try { window.close(); } catch (e) { /* tabs the page did not open stay open */ } }, 1200);
    }
  })();
  if (DEBUG) window.__ssd = { G, H, cam, lobby, guest, get role() { return role; }, doThrow, hostResolve, startPractice, profile, Logic };
  requestAnimationFrame(frame);
})();

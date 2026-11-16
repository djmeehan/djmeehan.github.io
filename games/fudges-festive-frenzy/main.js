// Fudge's Festive Frenzy: drawing, input, sound and screens. The rules live in logic.js; this file only draws that state and feeds it input.
(() => {
  'use strict';
  const L = window.FudgeLogic, C = L.C;
  const W = C.VIEW_W, H = C.VIEW_H, GROUND = 452, JUMP_LINE = H * 0.3;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const BEST_KEY = 'fudges-festive-frenzy-best', MUTE_KEY = 'fudges-festive-frenzy-muted';

  // ---------- small helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window etc: just don't remember */ } },
  };
  const circle = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const ellipse = (x, y, rx, ry, fill, rot) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.fill(); };
  const glow = (x, y, r, rgb, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const text = (s, x, y, size, color, align, weight) => {
    ctx.font = `${weight || 700} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#fff';
    ctx.fillText(s, x, y);
  };
  const shadowText = (s, x, y, size, color, align) => {
    text(s, x + 2, y + 2, size, 'rgba(5,10,35,0.7)', align);
    text(s, x, y, size, color, align);
  };

  // ---------- pictures of Fudge (the real face and the stretched-out leap); a drawn face is the fallback ----------
  const pics = {};
  // The face photo was cropped tightly (one ear touches the right edge, the chin the bottom), so soften those edges to hide the straight cut.
  function feather(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    const fade = (x0, y0, x1, y1) => {
      const gr = x.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
    };
    fade(c.width - 34, 0, c.width - 2, 0);      // right edge
    fade(0, c.height - 34, 0, c.height - 2);    // bottom edge
    return c;
  }
  for (const [k, src] of [['face', 'assets/fudge-face.png'], ['leap', 'assets/fudge-leap.png']]) {
    const img = new Image();
    img.onload = () => { pics[k] = k === 'face' ? feather(img) : img; };
    img.src = src;
  }

  // ---------- scenery (fixed, drawn from a seeded generator so it is the same every time) ----------
  const rnd = L.mulberry32(2024);
  const stars = Array.from({ length: 110 }, () => ({ x: rnd() * W, y: rnd() * H * 0.5, r: 0.5 + rnd() * 1.3, tw: rnd() * 6.28 }));
  const houses = Array.from({ length: 18 }, (_, i) => ({ x: 120 + i * 360 + rnd() * 140, w: 46 + rnd() * 30, h: 34 + rnd() * 22, lit: rnd() < 0.8 }));
  const pinesFar = Array.from({ length: 90 }, (_, i) => ({ x: i * 90 + rnd() * 60, s: 0.7 + rnd() * 0.6 }));
  const pinesMid = Array.from({ length: 60 }, (_, i) => ({ x: i * 150 + rnd() * 90, s: 0.9 + rnd() * 0.8 }));
  const snow = Array.from({ length: 170 }, () => ({ x: rnd() * W, y: rnd() * H, r: 0.8 + rnd() * 2.2, sp: 18 + rnd() * 50, ph: rnd() * 6.28, layer: rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2 }));
  const hill = (x, base, a, f1, f2, ph) => base + a * Math.sin(x * f1 + ph) + a * 0.55 * Math.sin(x * f2 + ph * 2.3);

  function drawSky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#0a1a52');
    g.addColorStop(0.45, '#1f3f93');
    g.addColorStop(0.8, '#5f86d8');
    g.addColorStop(1, '#a9c0f0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    glow(W * 0.62, GROUND - 70, 360, '255,196,150', 0.28);   // last light of the sun behind the hills
    for (const s of stars) {
      const a = 0.5 + 0.5 * Math.sin(t * 1.6 + s.tw);
      ctx.fillStyle = `rgba(255,255,240,${0.25 + 0.65 * a * (1 - s.y / (H * 0.55))})`;
      ctx.fillRect(s.x - cam * 0.02, s.y, s.r, s.r);
    }
    const mx = 790 - cam * 0.05;
    glow(mx, 92, 90, '255,246,215', 0.35);
    circle(mx, 92, 27, '#fff6dc');
    circle(mx - 8, 86, 5, 'rgba(210,200,170,0.5)');
    circle(mx + 9, 99, 3.5, 'rgba(210,200,170,0.5)');
  }

  function drawHills(factor, base, amp, top, bottom, ph) {
    const g = ctx.createLinearGradient(0, base - amp * 1.5, 0, GROUND);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W + 10; sx += 10) ctx.lineTo(sx, hill(sx + cam * factor, base, amp, 0.0042, 0.011, ph));
    ctx.lineTo(W + 10, H);
    ctx.closePath();
    ctx.fill();
  }

  function pine(x, y, s, body, snowCap) {
    for (let i = 0; i < 3; i++) {
      const w = (22 - i * 4.5) * s, top = y - (28 + i * 18) * s, bot = y - i * 16 * s;
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(x, top - 14 * s); ctx.lineTo(x + w, bot); ctx.lineTo(x - w, bot); ctx.closePath(); ctx.fill();
      ctx.fillStyle = snowCap;
      ctx.beginPath(); ctx.moveTo(x, top - 14 * s); ctx.lineTo(x + w * 0.55, top - 14 * s + 17 * s); ctx.lineTo(x - w * 0.55, top - 14 * s + 17 * s); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2a2230';
    ctx.fillRect(x - 3 * s, y, 6 * s, 8 * s);
  }

  function drawScenery(t) {
    drawHills(0.15, 330, 26, '#8aa8ea', '#2c4a98', 0.4);
    // a village far away, windows lit
    for (const h of houses) {
      const sx = h.x - cam * 0.3;
      if (sx < -80 || sx > W + 80) continue;
      const base = hill(h.x, 352, 16, 0.0042 * 0.3, 0.011 * 0.3, 1.1) + 10;
      ctx.fillStyle = '#243d86';
      ctx.fillRect(sx - h.w / 2, base - h.h, h.w, h.h);
      ctx.fillStyle = '#e9f0ff';
      ctx.beginPath(); ctx.moveTo(sx - h.w / 2 - 5, base - h.h); ctx.lineTo(sx, base - h.h - 20); ctx.lineTo(sx + h.w / 2 + 5, base - h.h); ctx.closePath(); ctx.fill();
      if (h.lit) { glow(sx, base - h.h / 2, 26, '255,200,110', 0.35); ctx.fillStyle = '#ffd37a'; ctx.fillRect(sx - 6, base - h.h / 2 - 6, 12, 12); }
    }
    for (const p of pinesFar) {
      const sx = p.x - cam * 0.3;
      if (sx < -40 || sx > W + 40) continue;
      pine(sx, hill(p.x, 372, 12, 0.0042 * 0.3, 0.011 * 0.3, 1.1) + 12, 0.55 * p.s, '#1b3070', '#7e9ee0');
    }
    drawHills(0.45, 392, 22, '#a9c1f2', '#35549f', 2.0);
    for (const p of pinesMid) {
      const sx = p.x - cam * 0.55;
      if (sx < -50 || sx > W + 50) continue;
      pine(sx, hill(p.x, 410, 12, 0.0042 * 0.55, 0.011 * 0.55, 2.4) + 14, 0.9 * p.s, '#14285e', '#b6caf2');
    }
  }

  function drawGround(t) {
    const g = ctx.createLinearGradient(0, GROUND - 26, 0, H);
    g.addColorStop(0, '#eef3ff');
    g.addColorStop(0.3, '#c9d8f7');
    g.addColorStop(1, '#8da6dc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W + 10; sx += 10) ctx.lineTo(sx, hill(sx + cam, GROUND - 22, 5, 0.01, 0.027, 0.3));
    ctx.lineTo(W + 10, H);
    ctx.closePath();
    ctx.fill();
    // lantern posts with fairy lights between them
    const gap = 520;
    const first = Math.floor((cam - 40) / gap) - 1;
    for (let k = first; k <= first + Math.ceil(W / gap) + 2; k++) {
      const wx = k * gap + 260, sx = wx - cam, nx = sx + gap;
      const postTop = GROUND - 96;
      ctx.strokeStyle = '#3a2d3d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(sx, GROUND + 6); ctx.lineTo(sx, postTop); ctx.stroke();
      glow(sx, postTop - 4, 46, '255,200,110', 0.35 + 0.08 * Math.sin(t * 3 + k));
      circle(sx, postTop - 4, 6, '#ffe2a0');
      const cols = ['#ff6b6b', '#ffd166', '#6bdc8f', '#6bb7ff'];
      ctx.strokeStyle = 'rgba(30,25,45,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, postTop); ctx.quadraticCurveTo((sx + nx) / 2, postTop + 46, nx, postTop); ctx.stroke();
      for (let i = 1; i < 12; i++) {
        const u = i / 12, bx = sx + gap * u, by = postTop + 2 * 23 * u * (1 - u) * 2 / 1;
        const col = cols[(i + k) & 3], tw = 0.55 + 0.45 * Math.sin(t * 4 + i * 1.7 + k);
        glow(bx, by + 4, 11, '255,230,160', 0.25 * tw);
        circle(bx, by + 4, 2.6, col);
      }
    }
  }

  // ---------- characters ----------
  function drawPresent(x, y, kind, t, rot, sc) {
    const cols = [['#e53935', '#ffd54f'], ['#2e9d57', '#ff8a80'], ['#3d7be0', '#f5f5f5'], ['#f4b400', '#d32f2f']][kind & 3];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.scale(sc || 1, sc || 1);
    glow(0, -12, 36, '255,220,150', 0.3 + 0.1 * Math.sin(t * 5 + x));
    ctx.fillStyle = cols[0]; ctx.fillRect(-14, -24, 28, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-14, -24, 28, 7);
    ctx.fillStyle = cols[1]; ctx.fillRect(-3, -24, 6, 24); ctx.fillRect(-14, -14, 28, 5);
    ctx.beginPath(); ctx.ellipse(-6, -27, 7, 4, -0.5, 0, 6.3); ctx.ellipse(6, -27, 7, 4, 0.5, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  function drawFaceFallback(x, y, w) {
    ellipse(x, y, w * 0.5, w * 0.46, '#ecd2ac');
    ellipse(x - w * 0.38, y - w * 0.38, w * 0.13, w * 0.16, '#e9b6b6');
    ellipse(x + w * 0.38, y - w * 0.38, w * 0.13, w * 0.16, '#e9b6b6');
    circle(x - w * 0.18, y - w * 0.05, w * 0.05, '#1a1a1a');
    circle(x + w * 0.18, y - w * 0.05, w * 0.05, '#1a1a1a');
    circle(x, y + w * 0.1, w * 0.06, '#d99a9a');
  }

  function cheek(x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#f6e4c9');
    g.addColorStop(0.7, '#ecd2ac');
    g.addColorStop(1, '#d9b98f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function cheekRadius(load) { return load <= 0 ? 0 : Math.min(36, 7 + load * 2.6); }

  function drawCape(flap, fast, bob) {
    const w1 = Math.sin(flap) * (fast ? 6 : 1.5), w2 = Math.sin(flap + 1.2) * (fast ? 9 : 2), f = fast ? 1 : 0, hang = fast ? 0 : 18;
    ctx.fillStyle = '#d32f3f';
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, -44 - bob);
    ctx.quadraticCurveTo(-8, -58 - bob, -30, -46 - bob);
    ctx.quadraticCurveTo(-48 - f * 12, -46 + w1, -58 - f * 18, -32 + hang + w2);
    ctx.lineTo(-44 - f * 8, -18 + hang * 0.6 + w1);
    ctx.quadraticCurveTo(-16, -16 - bob, 10, -26 - bob);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,10,25,0.5)'; ctx.lineWidth = 1.5;               // folds
    ctx.beginPath(); ctx.moveTo(-6, -48 - bob); ctx.quadraticCurveTo(-24, -38, -42 - f * 10, -22 + hang * 0.6 + w1); ctx.moveTo(-18, -50 - bob); ctx.quadraticCurveTo(-34, -40, -50 - f * 14, -28 + hang + w2); ctx.stroke();
  }

  function drawFudge(f, t, g) {
    const sx = f.x - cam, sy = GROUND - f.h;
    const stunned = f.stun > 0;
    const flicker = f.invuln > 0 && !stunned && Math.floor(t * 14) % 2 === 0;
    ellipse(sx, GROUND + 4, 30 - f.h * 0.12, 7, 'rgba(10,20,60,0.35)');
    ctx.save();
    if (flicker) ctx.globalAlpha = 0.55;
    ctx.translate(sx, sy);
    const air = f.h > 4;
    const r = cheekRadius(f.load);
    if (f.lunge > 0) {   // speed streaks behind him
      for (let i = 1; i <= 4; i++) { ctx.globalAlpha = 0.22 - i * 0.04; ellipse(-f.dir * i * 22, -26 - (air ? 0 : 0), 30 - i * 4, 18 - i * 2, '#fff'); }
      ctx.globalAlpha = flicker ? 0.55 : 1;
    }
    if (air && pics.leap) {
      // the stretched-out photo, nose first, for jumps
      const sc = 0.4, w = pics.leap.width, h = pics.leap.height;
      ctx.translate(0, -44);
      ctx.scale(f.dir, 1);
      ctx.rotate(-Math.PI / 2 - clamp(f.vh * 0.0006, -0.5, 0.5));
      ctx.scale(sc, sc);
      ctx.translate(-w / 2, -h / 2);
      if (r > 0) { const pr = r / sc * 0.5; cheek(w * 0.2, h * 0.86, pr); cheek(w * 0.8, h * 0.86, pr); }   // cheeks bulge out behind the head
      ctx.drawImage(pics.leap, 0, 0);
      // cape lying along his back, fluttering
      const fl = Math.sin(t * 22) * 10;
      ctx.fillStyle = '#d32f3f'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h * 0.66); ctx.lineTo(w * 0.7, h * 0.66);
      ctx.quadraticCurveTo(w * 0.8 + fl, h * 0.35, w * 0.62 - fl, h * 0.1);
      ctx.lineTo(w * 0.44 + fl, h * 0.1);
      ctx.quadraticCurveTo(w * 0.3 - fl, h * 0.35, w * 0.36, h * 0.66);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.scale(f.dir, 1);
      const sq = Math.min(1, landSquash);
      const run = f.moving && !stunned;
      const phase = t * (9 + (run ? 0 : -6));
      const bob = run ? Math.abs(Math.sin(phase)) * 4 : Math.sin(t * 2.5) * 1;
      ctx.scale(1 + 0.12 * sq + (f.lunge > 0 ? 0.2 : 0), 1 - 0.14 * sq - (f.lunge > 0 ? 0.1 : 0));
      if (f.lunge > 0) ctx.rotate(0.12);
      ellipse(-36, -18 - bob, 7, 6, '#ecd2ac');                              // tail
      ellipse(-4, -26 - bob, 35, 23, '#ecd2ac');                              // body
      ellipse(4, -21 - bob, 25, 14, '#f7ead6');                               // belly
      const swing = run ? Math.sin(phase) * 9 : 0;
      ellipse(-16 + swing, -5, 10, 5.5, '#fff3e4');                           // back paws
      ellipse(18 - swing, -5, 10, 5.5, '#fff3e4');                            // front paws
      drawCape(t * 10, run, bob);
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(12, -42 - bob, 4, 0, 6.3); ctx.fill(); // cape clasp
      const hw = 58, hh = hw * (256 / 233), hx = 28, hy = -52 - bob;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(stunned ? Math.sin(t * 30) * 0.22 : (run ? Math.sin(phase) * 0.05 : 0) - (f.vh < 0 ? -0.08 : 0));
      if (r > 0) { cheek(-hw * 0.4, hh * 0.16, r); cheek(hw * 0.4, hh * 0.16, r); }
      if (pics.face) ctx.drawImage(pics.face, -hw / 2, -hh / 2, hw, hh); else drawFaceFallback(0, 0, hw);
      if (r > 8) {
        // a soft puff over the lower corners of the photo so the cheeks look like part of the face
        const pr = r * 0.55;
        glow(-hw * 0.4, hh * 0.22, pr, '240,214,176', 0.45);
        glow(hw * 0.4, hh * 0.22, pr, '240,214,176', 0.45);
      }
      ctx.restore();
      if (stunned) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; text('★', hx + Math.cos(a) * 26, hy - 36 + Math.sin(a) * 6, 14, '#ffd166'); }
    }
    ctx.restore();
    if (f.load > 0) {
      const bx = sx, by = sy - 100;
      ctx.fillStyle = 'rgba(11,22,55,0.75)';
      ctx.beginPath(); ctx.roundRect(bx - 22, by - 12, 44, 24, 12); ctx.fill();
      drawPresent(bx - 8, by + 8, 0, t, 0, 0.5);
      text('×' + f.load, bx + 8, by, 15, '#ffd166');
    }
  }

  function drawElf(e, t) {
    const sx = e.x - cam;
    if (sx < -60 || sx > W + 60) return;
    const run = e.pause <= 0, flee = e.state === 'flee';
    const phase = t * (flee ? 16 : 12) + e.id;
    const bob = run ? Math.abs(Math.sin(phase)) * 5 : 0;
    ellipse(sx, GROUND + 4, 20, 5, 'rgba(10,20,60,0.35)');
    ctx.save();
    ctx.translate(sx, GROUND);
    ctx.scale(e.dir, 1);
    const sw = run ? Math.sin(phase) * 9 : 0;
    ctx.strokeStyle = '#d32f3f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, -18 - bob); ctx.lineTo(-4 + sw, -3); ctx.moveTo(5, -18 - bob); ctx.lineTo(5 - sw, -3); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(-4, -18 - bob); ctx.lineTo(-4 + sw, -3); ctx.moveTo(5, -18 - bob); ctx.lineTo(5 - sw, -3); ctx.stroke();
    ctx.setLineDash([]);
    ellipse(-4 + sw, -2, 6, 3, '#3a2d3d'); ellipse(5 - sw, -2, 6, 3, '#3a2d3d');
    ctx.fillStyle = '#1f9d55';
    ctx.beginPath(); ctx.moveTo(-12, -16 - bob); ctx.lineTo(12, -16 - bob); ctx.lineTo(8, -40 - bob); ctx.lineTo(-8, -40 - bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-12, -24 - bob, 24, 4);
    // arms: reaching, or holding the stolen present up high
    ctx.strokeStyle = '#1f9d55'; ctx.lineWidth = 5;
    ctx.beginPath();
    if (flee) { ctx.moveTo(-7, -36 - bob); ctx.lineTo(-6, -58 - bob); ctx.moveTo(7, -36 - bob); ctx.lineTo(6, -58 - bob); }
    else { ctx.moveTo(8, -36 - bob); ctx.lineTo(20, -30 - bob + Math.sin(phase) * 4); ctx.moveTo(-8, -36 - bob); ctx.lineTo(-18, -28 - bob - sw * 0.3); }
    ctx.stroke();
    circle(0, -50 - bob, 11, '#ffd9b3');                                     // head
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath(); ctx.moveTo(-9, -52 - bob); ctx.lineTo(-22, -60 - bob); ctx.lineTo(-10, -44 - bob); ctx.fill();  // pointy ears
    ctx.beginPath(); ctx.moveTo(9, -52 - bob); ctx.lineTo(22, -60 - bob); ctx.lineTo(10, -44 - bob); ctx.fill();
    ctx.fillStyle = '#1f9d55';                                              // hat
    ctx.beginPath(); ctx.moveTo(-12, -55 - bob); ctx.lineTo(0, -82 - bob + Math.sin(t * 8) * 2); ctx.lineTo(12, -55 - bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d32f3f'; ctx.fillRect(-12, -58 - bob, 24, 5);
    circle(0, -82 - bob + Math.sin(t * 8) * 2, 3.5, '#ffd166');
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;                         // scowling brows, sly grin
    ctx.beginPath(); ctx.moveTo(-8, -57 - bob); ctx.lineTo(-2, -53 - bob); ctx.moveTo(8, -57 - bob); ctx.lineTo(2, -53 - bob); ctx.stroke();
    circle(-4, -50 - bob, 1.8, '#1a1a1a'); circle(4, -50 - bob, 1.8, '#1a1a1a');
    ctx.beginPath(); ctx.arc(0, -46 - bob, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
    if (flee && e.present) drawPresent(sx, GROUND - 70 - bob, e.present.kind, t, Math.sin(t * 9) * 0.2, 0.8);
    if (e.pause > 0.3 && e.state === 'hunt') for (let i = 0; i < 2; i++) text('✦', sx + Math.cos(t * 7 + i * 3) * 16, GROUND - 90 + Math.sin(t * 7 + i * 3) * 4, 12, '#fff');
  }

  function drawReindeer(x, y, lead, t, flying) {
    const gal = flying ? Math.sin(t * 9 + x) : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#5b3a29'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, -22); ctx.lineTo(-24 + gal * 8, -4 + (flying ? -6 : 0)); ctx.moveTo(-8, -20); ctx.lineTo(-10 - gal * 8, -2);
    ctx.moveTo(14, -22); ctx.lineTo(22 - gal * 8, -4 + (flying ? -6 : 0)); ctx.moveTo(8, -20); ctx.lineTo(8 + gal * 8, -2);
    ctx.stroke();
    ellipse(0, -28, 22, 11, '#8a5a3c');
    ellipse(-4, -24, 14, 6, '#a97452');
    ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(14, -32); ctx.lineTo(26, -46); ctx.stroke();
    ellipse(31, -48, 9, 7, '#8a5a3c', 0.3);
    circle(35, -49, lead ? 3.2 : 2.2, lead ? '#ff3b3b' : '#1a1a1a');
    if (lead) glow(35, -49, 16, '255,60,60', 0.55);
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(27, -54); ctx.lineTo(24, -66); ctx.lineTo(30, -63); ctx.moveTo(24, -66); ctx.lineTo(20, -72); ctx.stroke();
    ctx.restore();
  }

  function drawSleigh(z, t) {
    const sx = z.x - cam, sy = GROUND - z.h;
    const flying = z.h > 2 || z.phase === 'fly';
    if (z.h < 5) ellipse(sx, GROUND + 4, 80, 9, 'rgba(10,20,60,0.35)');
    if (z.phase === 'landed' || z.phase === 'landing') {
      const g = ctx.createLinearGradient(0, 0, 0, sy);
      g.addColorStop(0, 'rgba(255,230,160,0)');
      g.addColorStop(1, 'rgba(255,230,160,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 40, 0, 80, sy);
    }
    ctx.save();
    ctx.translate(sx, sy + (flying ? Math.sin(t * 3) * 4 : 0));
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60, -22); ctx.lineTo(100, -26); ctx.moveTo(60, -18); ctx.lineTo(176, -26); ctx.stroke();   // reins
    drawReindeer(100, 0, false, t, flying);
    drawReindeer(176, 0, true, t, flying);
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 5; ctx.lineCap = 'round';                                                   // runners
    ctx.beginPath(); ctx.moveTo(-56, -4); ctx.lineTo(54, -4); ctx.quadraticCurveTo(76, -4, 70, -26); ctx.stroke();
    ctx.fillStyle = '#c62828'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;                                              // body
    ctx.beginPath(); ctx.moveTo(-52, -10); ctx.lineTo(-58, -40); ctx.lineTo(44, -40); ctx.quadraticCurveTo(66, -40, 60, -24); ctx.lineTo(50, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7b4a2a';                                                                                              // sack of presents
    ctx.beginPath(); ctx.ellipse(-34, -52, 22, 20, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#e53935'; ctx.fillRect(-44, -70, 9, 8);
    ctx.fillStyle = '#3d7be0'; ctx.fillRect(-30, -72, 9, 9);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-38, -64, 14, 3);
    ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(10, -52, 14, 0, 6.3); ctx.fill();                                    // Santa
    ctx.fillStyle = '#111'; ctx.fillRect(-4, -50, 28, 4);
    circle(10, -70, 9, '#ffd9b3');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(12, -64, 9, 8, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.moveTo(0, -75); ctx.lineTo(8, -92); ctx.lineTo(22, -76); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, -78, 22, 5); circle(8, -93, 4, '#fff');
    circle(14, -71, 1.4, '#1a1a1a');
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 6;                                                                         // waving arm when landed
    ctx.beginPath(); ctx.moveTo(18, -56); ctx.lineTo(34, z.phase === 'landed' ? -74 + Math.sin(t * 8) * 6 : -50); ctx.stroke();
    glow(60, -34, 40, '255,210,120', 0.4 + 0.1 * Math.sin(t * 5));                                                          // lantern
    ctx.restore();
    if (z.phase === 'landed') {
      const by = sy - 120 + Math.sin(t * 5) * 6;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(sx, by + 18); ctx.lineTo(sx - 14, by); ctx.lineTo(sx + 14, by); ctx.closePath(); ctx.fill();
      shadowText('SANTA', sx, by - 12, 18, '#ffd166');
    }
  }

  // ---------- state and effects ----------
  let grabPending = false, lastDown = 0, lastDownX = 0, grabHint = 0, g, mode = 'title', cam = 0, camShake = 0, landSquash = 0, t = 0, overAt = 0, roundBanner = 0, best = +store.get(BEST_KEY) || 0, hintFade = 1;
  const parts = [];
  const botMode = location.hash.indexOf('#bot') === 0;

  function burst(wx, h, n, colors, speed, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      parts.push({ x: wx, y: GROUND - h, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (up || 0), life: 0.6 + Math.random() * 0.6, max: 1.2, c: colors[i % colors.length], r: 2 + Math.random() * 2.5 });
    }
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  function newGame(seed) { g = L.createGame(seed, best); roundBanner = 2.2; cam = 0; parts.length = 0; }
  function startPlay() { mode = 'play'; hintFade = 1; newGame((Date.now() & 0x7fffffff) || 1); audio.unlock(); }
  newGame(12345);
  if (botMode) {
    mode = 'play';
    const skip = parseFloat(location.hash.split('=')[1]) || 0;   // #bot=12 plays 12 seconds ahead, for screenshots
    for (let i = 0; i < skip * 60 && g.phase !== 'over'; i++) L.step(g, L.botInput(g), 1 / 60);
    if (location.hash.indexOf('&air') > 0) { g.fudge.h = 70; g.fudge.vh = 150; }
    g.events.length = 0; roundBanner = 0; cam = clamp(g.fudge.x - W / 2, 0, C.W - W);
  }

  // ---------- sound: everything is made in code (no audio files) ----------
  const audio = (() => {
    let ac = null, muted = store.get(MUTE_KEY) === '1';
    const unlock = () => {
      try {
        if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
      } catch (e) { ac = null; }
    };
    const tone = (f, d, type, vol, slide, delay) => {
      if (muted || !ac) return;
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(gn); gn.connect(ac.destination);
      o.start(t0); o.stop(t0 + d + 0.02);
    };
    const thud = () => {
      if (muted || !ac) return;
      const n = ac.sampleRate * 0.2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const s = ac.createBufferSource(), gn = ac.createGain(), fl = ac.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 600; gn.gain.value = 0.5;
      s.buffer = buf; s.connect(fl); fl.connect(gn); gn.connect(ac.destination); s.start();
    };
    const play = ev => {
      switch (ev.type) {
        case 'pickup': tone(520 + ev.load * 40, 0.12, 'triangle', 0.18, 900 + ev.load * 40); break;
        case 'jump': tone(300, 0.14, 'square', 0.06, 560); break;
        case 'tackle': thud(); tone(200, 0.3, 'sawtooth', 0.12, 60); break;
        case 'grab': tone(700, 0.18, 'sawtooth', 0.07, 300); break;
        case 'snatch': tone(260, 0.25, 'sawtooth', 0.12, 700); tone(900, 0.12, 'square', 0.06, 400, 0.1); break;
        case 'lunge': tone(240, 0.22, 'sawtooth', 0.07, 900); break;
        case 'steal': tone(400, 0.4, 'sawtooth', 0.1, 90); break;
        case 'recover': [660, 880, 1100].forEach((f, i) => tone(f, 0.14, 'triangle', 0.17, null, i * 0.06)); break;
        case 'drop': tone(1400, 0.08, 'sine', 0.05, 1800); tone(1900, 0.08, 'sine', 0.04, 2300, 0.08); break;
        case 'deliver': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, null, i * 0.07)); break;
        case 'sleighLanded': tone(330, 0.5, 'sine', 0.12, 220); break;
        case 'roundEnd': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'triangle', 0.15, null, i * 0.12)); break;
        case 'gameOver': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.1, null, i * 0.2)); break;
      }
    };
    return { unlock, play, get muted() { return muted; }, toggle() { muted = !muted; store.set(MUTE_KEY, muted ? '1' : '0'); } };
  })();

  // ---------- input: mouse and touch (hold to run toward the pointer, press up high to jump) plus the keyboard ----------
  const pointers = new Map();
  const keys = new Set();
  let view = { left: 0, top: 0, w: W, h: H };
  const toLogical = e => ({ x: (e.clientX - view.left) / view.w * W, y: (e.clientY - view.top) / view.h * H });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    audio.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: fine */ }
    if (mode === 'title') return startPlay();
    if (mode === 'paused') return setPaused(false);
    if (mode === 'over') { if (t - overAt > 1) startPlay(); return; }
    const now = performance.now(), pt = toLogical(e);
    if (now - lastDown < 330 && Math.abs(pt.x - lastDownX) < 90 && pt.y >= JUMP_LINE) { grabPending = true; lastDown = 0; }   // double tap = lunge
    else { lastDown = now; lastDownX = pt.x; }
    pointers.set(e.pointerId, pt);
  });
  canvas.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, toLogical(e)); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, e => pointers.delete(e.pointerId));
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const LEFT = ['ArrowLeft', 'a', 'A'], RIGHT = ['ArrowRight', 'd', 'D'], UP = ['ArrowUp', 'w', 'W', ' '];
  addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (mode === 'play' || mode === 'paused') setPaused(mode === 'play'); return; }
    if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    if (['e', 'E', 'x', 'X', 'Shift'].includes(e.key)) { if (mode === 'play') grabPending = true; return; }
    if (![...LEFT, ...RIGHT, ...UP, 'Enter'].includes(e.key)) return;
    e.preventDefault();
    audio.unlock();
    if (mode === 'title') return startPlay();
    if (mode === 'paused') return setPaused(false);
    if (mode === 'over') { if (t - overAt > 1) startPlay(); return; }
    keys.add(e.key);
  });
  addEventListener('keyup', e => keys.delete(e.key));
  addEventListener('blur', () => { keys.clear(); pointers.clear(); if (mode === 'play') setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') setPaused(true); });

  function readInput() {
    if (botMode || mode === 'title') return L.botInput(g);
    let dir = 0, jump = false;
    const grab = grabPending; grabPending = false;
    if (LEFT.some(k => keys.has(k))) dir -= 1;
    if (RIGHT.some(k => keys.has(k))) dir += 1;
    if (UP.some(k => keys.has(k))) jump = true;
    if (dir === 0) {
      const fx = g.fudge.x - cam;
      for (const p of pointers.values()) {
        if (p.y < JUMP_LINE) { jump = true; continue; }
        const dx = p.x - fx;
        if (Math.abs(dx) > 16) dir = dx > 0 ? 1 : -1;
      }
    } else for (const p of pointers.values()) if (p.y < JUMP_LINE) jump = true;
    return { dir, jump, grab };
  }

  function setPaused(p) {
    if (p && mode === 'play') mode = 'paused';
    else if (!p && mode === 'paused') mode = 'play';
    document.getElementById('pause').textContent = mode === 'paused' ? 'Resume' : 'Pause';
  }
  function toggleMute() { audio.toggle(); document.getElementById('mute').textContent = audio.muted ? 'Sound off' : 'Sound on'; }
  document.getElementById('pause').addEventListener('click', () => { if (mode === 'play' || mode === 'paused') setPaused(mode === 'play'); });
  document.getElementById('mute').addEventListener('click', toggleMute);
  document.getElementById('mute').textContent = audio.muted ? 'Sound off' : 'Sound on';
  for (const id of ['pause', 'mute']) document.getElementById(id).addEventListener('pointerdown', e => e.stopPropagation());

  // ---------- drawing the screens ----------
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,16,48,0.82)';
    ctx.strokeStyle = 'rgba(255,209,102,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke();
  }

  function portrait(x, y, r) {
    glow(x, y, r * 1.8, '255,209,102', 0.25);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#243d86'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (pics.face) ctx.drawImage(pics.face, x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1 * 256 / 233); else drawFaceFallback(x, y, r * 1.8);
    ctx.restore();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d32f3f';                                    // a little Santa hat for the occasion
    ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.55); ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.6, x + r * 0.9, y - r * 1.1); ctx.lineTo(x + r * 0.7, y - r * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x - r * 0.9, y - r * 0.7, r * 1.7, r * 0.25, 8); ctx.fill();
    circle(x + r * 0.9, y - r * 1.1, r * 0.17, '#fff');
  }

  function drawHud() {
    const f = g.fudge;
    const slots = g.cfg.allowance + 1;   // the last one you can lose ends the game
    const pw = 150 + slots * 26;
    ctx.fillStyle = 'rgba(8,16,48,0.6)';
    ctx.beginPath(); ctx.roundRect(W / 2 - pw / 2, 8, pw, 62, 16); ctx.fill();
    shadowText(String(g.score), W / 2 - slots * 13, 30, 30, '#fff');
    shadowText('Round ' + g.round + ' \u00b7 Best ' + Math.max(best, g.best, g.score), W / 2 - slots * 13, 56, 13, '#cfe0ff');
    for (let i = 0; i < slots; i++) {
      const x = W / 2 + pw / 2 - 18 - (slots - 1 - i) * 26 - 8, lost = i < g.roundStolen;
      ctx.globalAlpha = lost ? 0.3 : 1;
      drawPresent(x, 50, lost ? 0 : 3, 0, 0, 0.75);
      ctx.globalAlpha = 1;
      if (lost) text('\u2715', x, 34, 20, '#ff6b6b');
    }
    for (const e of g.elves) {   // a red arrow at the screen edge for elves sneaking up out of sight
      const sx = e.x - cam, d = Math.abs(e.x - f.x);
      if ((sx >= -10 && sx <= W + 10) || d > 1100) continue;
      const right = sx > W / 2, ax = right ? W - 34 : 34, ay = 250;
      ctx.fillStyle = 'rgba(8,16,48,0.75)';
      ctx.beginPath(); ctx.roundRect(ax - 24, ay - 24, 48, 48, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,90,90,' + (0.7 + 0.3 * Math.sin(t * 10)) + ')';
      ctx.beginPath(); ctx.moveTo(ax + (right ? 16 : -16), ay); ctx.lineTo(ax - (right ? 4 : -4), ay - 14); ctx.lineTo(ax - (right ? 4 : -4), ay + 14); ctx.closePath(); ctx.fill();
      text('elf!', ax, ay + 36, 13, '#ff8a8a');
    }
    if (grabHint > 0) {
      ctx.globalAlpha = Math.min(1, grabHint);
      shadowText('An elf snatched a present! Double-tap (or press E) to lunge and steal it back!', W / 2, 128, 18, '#ffd166');
      ctx.globalAlpha = 1;
    }
    const z = g.sleigh;
    if ((z.phase === 'landed' || z.phase === 'landing') && f.load > 0) {
      const sx = z.x - cam;
      if (sx < 30 || sx > W - 30) {
        const right = sx > W / 2, ax = right ? W - 56 : 56;
        ctx.fillStyle = 'rgba(255,209,102,' + (0.7 + 0.3 * Math.sin(t * 8)) + ')';
        ctx.beginPath();
        ctx.moveTo(ax + (right ? 28 : -28), H / 2); ctx.lineTo(ax - (right ? 6 : -6), H / 2 - 22); ctx.lineTo(ax - (right ? 6 : -6), H / 2 + 22);
        ctx.closePath(); ctx.fill();
        shadowText('Santa', ax, H / 2 + 40, 16, '#ffd166');
      }
    }
    if (g.round === 1 && hintFade > 0) {
      ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,255,255,' + 0.25 * hintFade + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, JUMP_LINE); ctx.lineTo(W, JUMP_LINE); ctx.stroke(); ctx.setLineDash([]);
      text('press up here to jump', W / 2, JUMP_LINE - 14, 14, 'rgba(255,255,255,' + 0.7 * hintFade + ')', 'center', 500);
      text('hold anywhere below to run toward your finger', W / 2, H - 18, 14, 'rgba(255,255,255,' + 0.7 * hintFade + ')', 'center', 500);
    }
    if (roundBanner > 0 && g.phase === 'play') {
      ctx.globalAlpha = Math.min(1, roundBanner);
      shadowText('Round ' + g.round, W / 2, 232, 52, '#ffd166');
      shadowText(g.cfg.elves + (g.cfg.elves === 1 ? ' naughty elf' : ' naughty elves') + ' · ' + g.cfg.presents + ' presents', W / 2, 277, 20, '#fff');
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(6,12,40,0.55)'; ctx.fillRect(0, 0, W, H);
    portrait(W / 2, 112, 62);
    shadowText("Fudge's Festive Frenzy", W / 2, 218, 54, '#ffd166');
    shadowText("Fudge the hamster must stuff Santa's presents in his cheeks", W / 2, 266, 19, '#fff');
    shadowText('before the naughty elves steal them, then deliver them to the sleigh!', W / 2, 292, 19, '#fff');
    shadowText('Hold the mouse or your finger to run toward it. Press high up to jump.', W / 2, 336, 16, '#cfe0ff');
    shadowText('Elves snatch presents from your cheeks: double-tap (or press E) to lunge and steal one back!', W / 2, 360, 16, '#ffd166');
    shadowText('Keyboard: arrows or A / D to run, Space to jump, P to pause.', W / 2, 384, 16, '#cfe0ff');
    if (Math.floor(t * 1.6) % 2 === 0) shadowText('Tap, click or press a key to play', W / 2, 426, 26, '#fff');
    if (best > 0) shadowText('Best score: ' + best, W / 2, 460, 18, '#ffd166');
  }

  function drawBetween() {
    const s = g.summary;
    panel(W / 2 - 220, 150, 440, 200);
    shadowText('Round ' + s.round + ' complete!', W / 2, 188, 34, '#ffd166');
    shadowText('Delivered ' + s.delivered + '   ·   Stolen ' + s.stolen, W / 2, 232, 20, '#fff');
    shadowText('Round bonus +' + s.bonus, W / 2, 262, 20, '#6bdc8f');
    const nx = L.roundConfig(s.round + 1);
    shadowText('Next: ' + nx.elves + (nx.elves === 1 ? ' elf' : ' elves') + ', faster and sneakier', W / 2, 310, 16, '#cfe0ff');
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(6,12,40,0.6)'; ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 250, 70, 500, 340);
    portrait(W / 2, 150, 48);
    shadowText('Game over', W / 2, 232, 40, '#ffd166');
    shadowText('Score ' + g.score, W / 2, 272, 26, '#fff');
    const newBest = g.score > 0 && g.score >= g.best;
    shadowText(newBest ? 'New best!' : 'Best ' + g.best, W / 2, 304, 20, newBest ? '#6bdc8f' : '#cfe0ff');
    shadowText('Fudge delivered ' + g.deliveredTotal + ' present' + (g.deliveredTotal === 1 ? '' : 's') + ' to Santa', W / 2, 334, 17, '#fff');
    if (t - overAt > 1 && Math.floor(t * 1.6) % 2 === 0) shadowText('Tap, click or press a key to play again', W / 2, 378, 20, '#fff');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6,12,40,0.6)'; ctx.fillRect(0, 0, W, H);
    shadowText('Paused', W / 2, H / 2 - 14, 48, '#ffd166');
    shadowText('Tap, click or press P to carry on', W / 2, H / 2 + 30, 20, '#fff');
  }

  function render() {
    ctx.save();
    if (camShake > 0) ctx.translate((Math.random() - 0.5) * camShake * 14, (Math.random() - 0.5) * camShake * 14);
    drawSky(t);
    drawScenery(t);
    drawGround(t);
    const z = g.sleigh;
    if (z.phase !== 'fly' || z.h < 100) drawSleigh(z, t);
    const pres = g.presents;
    for (const p of pres) {
      if (p.state === 'ground') drawPresent(p.x - cam, GROUND - 2, p.kind, t, 0, 1);
      else if (p.state === 'falling') drawPresent(p.x - cam, GROUND - p.h, p.kind, t, p.x * 0.01 + t * 3, 1);
    }
    for (const e of g.elves) drawElf(e, t);
    drawFudge(g.fudge, t, g);
    if (z.phase === 'fly') drawSleigh(z, t);
    for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1); circle(p.x - cam, p.y, p.r, p.c); }
    ctx.globalAlpha = 1;
    for (const s of snow) {
      const sp = [0.6, 1, 1.5][s.layer], r = s.r * [0.7, 1, 1.4][s.layer];
      ctx.fillStyle = `rgba(255,255,255,${[0.45, 0.7, 0.9][s.layer]})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (mode === 'title') drawTitle();
    else {
      drawHud();
      if (g.phase === 'between') drawBetween();
      if (mode === 'over') drawOver();
      if (mode === 'paused') drawPaused();
    }
  }

  // ---------- main loop ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.min(innerWidth, innerHeight * W / H), ch = cw * H / W;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    const r = canvas.getBoundingClientRect();
    view = { left: r.left, top: r.top, w: r.width, h: r.height };
  }
  addEventListener('resize', resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    if (mode === 'play' || mode === 'title') {
      if (mode === 'title' && g.phase === 'over') newGame((Math.random() * 1e9) | 0 || 1);
      const input = readInput();
      const steps = Math.ceil(dt * 60);
      for (let i = 0; i < steps; i++) L.step(g, input, dt / steps);
      roundBanner = Math.max(0, roundBanner - dt);
      grabHint = Math.max(0, grabHint - dt);
      hintFade = Math.max(0, hintFade - (g.round === 1 && g.time > 8 ? dt * 0.5 : 0));
      if (mode === 'play' && g.phase === 'over') { mode = 'over'; overAt = t; best = Math.max(best, g.best); store.set(BEST_KEY, String(best)); }
      if (g.phase === 'between' && g.timer > 2.9) roundBanner = 0;
      if (g.phase === 'play' && g.time < 0.05 && g.round > 1) roundBanner = 2.2;
    }
    for (const ev of g.events) {
      if (mode === 'play' || botMode) audio.play(ev);
      const f = g.fudge;
      if (ev.type === 'pickup') burst(f.x, 40 + f.h, 8, ['#ffd166', '#fff3b0'], 120, 80);
      else if (ev.type === 'deliver') burst(g.sleigh.x, 70, 28, ['#ff6b6b', '#ffd166', '#6bdc8f', '#6bb7ff'], 260, 160);
      else if (ev.type === 'tackle') { camShake = 0.5; burst(f.x, 30 + f.h, 14, ['#fff', '#cfe0ff'], 200, 120); }
      else if (ev.type === 'land') landSquash = 1;
      else if (ev.type === 'snatch') { grabHint = 5; camShake = 0.4; burst(f.x, 50, 10, ['#ffd166', '#ff6b6b'], 180, 100); }
      else if (ev.type === 'recover') { grabHint = 0; burst(f.x, 50, 16, ['#6bdc8f', '#ffd166', '#fff'], 220, 120); }
      else if (ev.type === 'lunge') burst(f.x - f.dir * 20, 20, 6, ['#fff', '#cfe0ff'], 100, 20);
      else if (ev.type === 'steal') camShake = 0.2;
    }
    g.events.length = 0;
    if (mode !== 'paused') { stepParts(dt); landSquash = Math.max(0, landSquash - dt * 7); camShake = Math.max(0, camShake - dt * 2.5); }
    // camera: keep Fudge a little left of centre, looking ahead the way he faces
    const f = g.fudge;
    if (mode !== 'paused') cam += (clamp(f.x + f.dir * 90 - W / 2, 0, C.W - W) - cam) * Math.min(1, dt * 5);
    for (const s of snow) {
      const lay = [0.6, 1, 1.5][s.layer];
      s.y += s.sp * lay * dt * (mode === 'paused' ? 0 : 1);
      s.x += (Math.sin(t * 0.7 + s.ph) * 14 - 8) * lay * dt * (mode === 'paused' ? 0 : 1);
      if (s.y > H + 6) { s.y = -6; s.x = Math.random() * W; }
      if (s.x < -6) s.x = W + 6; else if (s.x > W + 6) s.x = -6;
    }
    render();
    requestAnimationFrame(frame);
  }

  if (location.hash.indexOf('debug') > 0) window.__fudge = { get g() { return g; }, get mode() { return mode; }, get cam() { return cam; } };   // for browser tests
  resize();
  requestAnimationFrame(frame);
})();

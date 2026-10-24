(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('c'), g = cv.getContext('2d');
let W, H, hor;
function resize() {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * d; cv.height = H * d;
  g.setTransform(d, 0, 0, d, 0, 0);
  hor = H * 0.4;
}
addEventListener('resize', resize); resize();

const D = 22, TP = 0.846;           // depth scale; screen t of player
const COLORS = ['#2a6cff', '#e8e8e8', '#1fb86a', '#c21e56', '#f2c200'];
let state = 'menu', px, pv, v, pos, score, curve, tCurve, cT, cars, spawnT, best = 0, shake = 0;
try { best = +localStorage.getItem('papayaBest') || 0; } catch (e) {}
const input = { l: false, r: false };

// ---------- projection ----------
const hw = t => W * (0.02 + 0.9 * t);                       // road full width at t
const cx = t => W / 2 + curve * (1 - t) * (1 - t) * W * 0.5; // curve offset
const tOf = d => 1 / (1 + (d + 4) / D);                      // world distance -> t

// ---------- car drawing (rear view) ----------
function drawCar(c, x, y, w, col, dark) {
  const u = w / 10;
  c.fillStyle = '#111';
  c.fillRect(x - 5 * u, y - 3.4 * u, 2.1 * u, 3.4 * u);
  c.fillRect(x + 2.9 * u, y - 3.4 * u, 2.1 * u, 3.4 * u);
  c.fillStyle = col;
  c.fillRect(x - 3 * u, y - 3 * u, 6 * u, 2.2 * u);
  c.beginPath();
  c.moveTo(x - 2.2 * u, y - 3 * u); c.lineTo(x - 1.1 * u, y - 4.8 * u);
  c.lineTo(x + 1.1 * u, y - 4.8 * u); c.lineTo(x + 2.2 * u, y - 3 * u); c.fill();
  c.fillStyle = dark;
  c.fillRect(x - 0.45 * u, y - 4.6 * u, 0.9 * u, 1.7 * u);
  c.fillRect(x - 3 * u, y - 1.2 * u, 6 * u, 0.5 * u);
  c.fillStyle = col;
  c.fillRect(x - 4.6 * u, y - 5.9 * u, 9.2 * u, 1.2 * u);
  c.fillStyle = dark;
  c.fillRect(x - 4.6 * u, y - 6.1 * u, 9.2 * u, 0.4 * u);
  c.fillRect(x - 4.7 * u, y - 6.2 * u, 0.4 * u, 1.6 * u);
  c.fillRect(x + 4.3 * u, y - 6.2 * u, 0.4 * u, 1.6 * u);
  c.fillStyle = '#ff2a2a';
  c.fillRect(x - 0.7 * u, y - 2.6 * u, 1.4 * u, 0.7 * u);
}
function drawCone(c, x, y, w) {
  const u = w / 10;
  c.fillStyle = '#ff7a00';
  c.beginPath(); c.moveTo(x - 3 * u, y); c.lineTo(x - 0.6 * u, y - 6 * u);
  c.lineTo(x + 0.6 * u, y - 6 * u); c.lineTo(x + 3 * u, y); c.fill();
  c.fillStyle = '#fff'; c.fillRect(x - 1.6 * u, y - 3.4 * u, 3.2 * u, 1 * u);
}

// ---------- game flow ----------
function reset() {
  px = 0; pv = 0; v = 45; pos = 0; score = 0; curve = 0; tCurve = 0; cT = 3;
  cars = []; spawnT = 0.5; shake = 0;
}
function start() {
  reset(); state = 'play';
  ['start', 'over'].forEach(i => $(i).classList.add('hidden'));
  ['hud', 'controls'].forEach(i => $(i).classList.remove('hidden'));
}
function gameOver() {
  state = 'over';
  const s = Math.floor(score);
  if (s > best) { best = s; try { localStorage.setItem('papayaBest', best); } catch (e) {} }
  $('final').textContent = s; $('best').textContent = best;
  $('over').classList.remove('hidden');
  ['hud', 'controls'].forEach(i => $(i).classList.add('hidden'));
  input.l = input.r = false;
  $('btnL').classList.remove('on'); $('btnR').classList.remove('on');
}

function update(dt) {
  v = Math.min(115, v + dt * 1.6);
  pos += v * dt * 2 / D;
  score += v * dt * 0.1;
  // road curves
  cT -= dt;
  if (cT <= 0) { tCurve = Math.random() < 0.3 ? 0 : (Math.random() * 2 - 1) * 0.9; cT = 2 + Math.random() * 3; }
  curve += (tCurve - curve) * Math.min(1, dt * 0.8);
  // steering
  const dir = (input.r ? 1 : 0) - (input.l ? 1 : 0);
  pv += (dir * 2.0 - pv) * Math.min(1, dt * (dir ? 7 : 5));
  px += pv * dt;
  px -= curve * (v / 100) * 0.35 * dt;
  px = Math.max(-0.85, Math.min(0.85, px));
  // spawn
  spawnT -= dt;
  if (spawnT <= 0) {
    const cone = Math.random() < 0.2;
    cars.push({ d: 230, x: (Math.random() * 2 - 1) * 0.75, v: cone ? 0 : 18 + Math.random() * 14,
      cone, col: COLORS[Math.random() * COLORS.length | 0] });
    spawnT = Math.max(0.35, 1.0 - v / 180) * (0.6 + Math.random() * 0.8);
  }
  for (const c of cars) {
    c.d -= (v - c.v) * dt;
    if (Math.abs(c.d) < 2.4 && Math.abs(c.x - px) < (c.cone ? 0.3 : 0.42)) { shake = 1; gameOver(); return; }
  }
  cars = cars.filter(c => c.d > -4);
  $('score').textContent = Math.floor(score);
  $('speed').textContent = Math.round(v * 3);
}

// ---------- rendering ----------
function render() {
  g.save();
  if (shake > 0) { g.translate((Math.random() - .5) * 10 * shake, (Math.random() - .5) * 10 * shake); shake -= 0.05; }
  // sky
  const sk = g.createLinearGradient(0, 0, 0, hor);
  sk.addColorStop(0, '#0a0f2a'); sk.addColorStop(1, '#ff8a3c');
  g.fillStyle = sk; g.fillRect(0, 0, W, hor + 2);
  // mountains
  g.fillStyle = '#1b1530'; g.beginPath(); g.moveTo(0, hor);
  const off = curve * 40 - px * 20;
  for (let i = 0; i <= 8; i++) g.lineTo(i * W / 8, hor - (i % 2 ? 46 : 18) - (i % 3) * 8 + off * 0);
  g.lineTo(W, hor); g.fill();

  // road rows (top to bottom)
  for (let y = Math.ceil(hor); y < H; y += 2) {
    const t = (y - hor) / (H - hor);
    if (t < 0.02) continue;
    const b = Math.floor(2 / t + pos) & 1;
    const w = hw(t) * 0.5, c0 = cx(t) - px * w, h = 2;
    g.fillStyle = b ? '#0d3b1e' : '#115028'; g.fillRect(0, y, W, h);
    g.fillStyle = b ? '#e8e8e8' : '#d1202a'; g.fillRect(c0 - w * 1.12, y, w * 2.24, h);
    g.fillStyle = b ? '#26272c' : '#2d2e34'; g.fillRect(c0 - w, y, w * 2, h);
    g.fillStyle = '#fff';
    g.fillRect(c0 - w * 0.96, y, w * 0.025, h); g.fillRect(c0 + w * 0.935, y, w * 0.025, h);
    if (b) { const lw = Math.max(1, w * 0.025);
      g.fillRect(c0 - w / 2 - lw / 2, y, lw, h); g.fillRect(c0 + w / 2 - lw / 2, y, lw, h); g.fillRect(c0 - lw / 2, y, lw, h); }
    // barriers
    g.fillStyle = b ? '#f2f2f2' : '#ff7a00';
    const bh = 2 + 12 * t, bw = w * 0.1;
    g.fillRect(c0 - w * 1.3, y - bh, bw, bh + h); g.fillRect(c0 + w * 1.2, y - bh, bw, bh + h);
  }

  // speed streaks
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = (pos * 0.15 + i * 0.137) % 1, r2 = Math.min(1, r + 0.08 * v / 100);
    const s = k => [W / 2 + Math.cos(a) * W * 0.9 * k * k, hor + Math.abs(Math.sin(a)) * (H - hor) * k * k];
    const p1 = s(r), p2 = s(r2);
    g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke();
  }

  // other cars far -> near
  cars.slice().sort((a, b) => b.d - a.d).forEach(c => {
    const t = tOf(c.d); if (t < 0.03 || t > 1.5) return;
    const y = hor + t * (H - hor), w = hw(t) * 0.5;
    const x = cx(t) + (c.x - px) * w, cw = w * 0.5;
    if (c.cone) drawCone(g, x, y, cw); else drawCar(g, x, y, cw, c.col, '#101010');
  });

  // player
  if (state !== 'menu') {
    const t = TP, y = hor + t * (H - hor) + H * 0.05, w = hw(t) * 0.5 * 0.5 * 1.35;
    g.save(); g.translate(W / 2 + px * W * 0.07, y); g.rotate(pv * 0.05);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-w * 0.55, -w * 0.04, w * 1.1, w * 0.07);
    drawCar(g, 0, 0, w, '#ff8000', '#1a1a1a');
    g.restore();
  }
  g.restore();
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
  if (state === 'play') update(dt);
  else if (state === 'menu') { pos += dt * 3; curve = Math.sin(ts / 2500) * 0.6; px = 0; }
  render();
  requestAnimationFrame(loop);
}

// ---------- input ----------
function hold(btn, key) {
  const on = e => { e.preventDefault(); input[key] = true; btn.classList.add('on'); };
  const off = e => { e.preventDefault(); input[key] = false; btn.classList.remove('on'); };
  btn.addEventListener('touchstart', on, { passive: false });
  btn.addEventListener('touchend', off, { passive: false });
  btn.addEventListener('touchcancel', off, { passive: false });
  btn.addEventListener('mousedown', on);
  btn.addEventListener('mouseup', off);
  btn.addEventListener('mouseleave', off);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
hold($('btnL'), 'l'); hold($('btnR'), 'r');
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') input.l = true;
  if (e.key === 'ArrowRight') input.r = true;
  if (e.key === 'Enter' && state !== 'play') start();
  if (e.key.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') input.l = false;
  if (e.key === 'ArrowRight') input.r = false;
});
// block page scroll / pinch / double-tap zoom on iOS
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
['gesturestart', 'gesturechange'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
let lastTap = 0;
document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTap < 300) e.preventDefault(); lastTap = n; }, { passive: false });

$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

// hero picture on start screen
(() => {
  const h = $('hero').getContext('2d');
  h.fillStyle = '#1a1a1f'; h.fillRect(20, 176, 320, 6);
  drawCar(h, 180, 176, 250, '#ff8000', '#1a1a1a');
})();

reset(); requestAnimationFrame(loop);
})();
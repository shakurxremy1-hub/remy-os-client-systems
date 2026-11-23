/* hero-v2.js — "Signal" hero.
   A field of drifting noise (an invisible business) that resolves into the headline
   (found, chosen, ready). The cursor parts the field, a click blows it apart, scrolling
   disperses it, and a light sweep runs through the finished words.

   - Vanilla canvas, no dependencies.
   - The real <h1> stays in the DOM (SEO, screen readers, no-JS). Geometry for the particles
     is read from the h1's word boxes, so the canvas always matches the live layout.
   - Honors prefers-reduced-motion (script does nothing; plain white headline shows).
   - Pauses when the hero is off-screen or the tab is hidden. */
(function () {
  'use strict';

  var hero = document.querySelector('.hero.hero--v2');
  if (!hero) return;
  var h1 = hero.querySelector('h1');
  if (!h1) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && !/[?&]fx=on/.test(location.search);
  if (reduce) return;

  var cv = document.createElement('canvas');
  cv.className = 'hero__sig';
  cv.setAttribute('aria-hidden', 'true');
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  hero.insertBefore(cv, hero.firstChild);

  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var WHITE = '#ffffff', GOLD = '#ccff00';
  var LEVELS = [0.38, 0.6, 0.82, 1];

  var W = 0, H = 0, dpr = 1, N = 0, size = 2;
  var hx, hy, x, y, vx, vy, sx, sy, col, ph, kk, dl, lv;
  var t0 = 0, last = 0, raf = 0, vis = true, live = false;
  var mx = -9999, my = -9999, pAct = false, pa = 0, dirty = false;

  /* ---------- geometry helpers ---------- */
  function rel(el, root) {
    var px = 0, py = 0, n = el;
    while (n && n !== root) { px += n.offsetLeft; py += n.offsetTop; n = n.offsetParent; }
    return { x: px, y: py, w: el.offsetWidth, h: el.offsetHeight };
  }
  function stretchKW(v) {
    var n = parseFloat(v); if (!n) return 'normal';
    if (n <= 56) return 'ultra-condensed';
    if (n <= 68) return 'extra-condensed';
    if (n <= 81) return 'condensed';
    if (n <= 93) return 'semi-condensed';
    return 'normal';
  }

  /* ---------- build the particle field from the live headline ---------- */
  function build() {
    W = hero.clientWidth; H = hero.clientHeight;
    if (!W || !H) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

    var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    var o = oc.getContext('2d', { willReadFrequently: true });
    if (!o) return false;

    var words = [].slice.call(h1.querySelectorAll('.tw'));
    var fitted = words.length > 0;
    var items = fitted ? words : [].slice.call(h1.children);

    items.forEach(function (el) {
      var src = el.querySelector('.twi') || el;
      var cs = getComputedStyle(src);
      var txt = (src.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt) return;
      if (cs.textTransform === 'uppercase') txt = txt.toUpperCase();
      var p = rel(el, hero);
      var fs = parseFloat(cs.fontSize) || 100;
      o.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
      try { o.fontStretch = stretchKW(cs.fontStretch); } catch (e) {}
      try { o.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing; } catch (e) {}
      var m = o.measureText(txt);
      var asc = m.fontBoundingBoxAscent || fs * 0.8, desc = m.fontBoundingBoxDescent || fs * 0.2;
      var fit = fitted && m.width ? p.w / m.width : 1;
      o.save();
      o.translate(p.x, p.y + p.h / 2 + (asc - desc) / 2);
      o.scale(fit, 1);
      o.textBaseline = 'alphabetic';
      o.fillStyle = el.closest && el.closest('em') ? GOLD : WHITE;
      o.fillText(txt, 0, 0);
      o.restore();
    });

    var d = o.getImageData(0, 0, W, H).data;
    var target = (coarse || W < 700) ? 5200 : 13000;

    function count(s) {
      var c = 0;
      for (var yy = s / 2; yy < H; yy += s) for (var xx = s / 2; xx < W; xx += s) if (d[((yy | 0) * W + (xx | 0)) * 4 + 3] > 128) c++;
      return c;
    }
    var step = Math.max(1.6, 4 * Math.sqrt(count(4) / target));
    var px = [], py = [], pc = [];
    for (var yy = step / 2; yy < H; yy += step) {
      for (var xx = step / 2; xx < W; xx += step) {
        var jx = xx + (Math.random() - 0.5) * step * 0.7, jy = yy + (Math.random() - 0.5) * step * 0.7;
        var k = ((jy | 0) * W + (jx | 0)) * 4;
        if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue;
        if (d[k + 3] > 128) { px.push(jx); py.push(jy); pc.push(d[k + 2] < 200 ? 1 : 0); }
      }
    }
    if (px.length < 200) return false;
    size = Math.min(2.1, Math.max(1.15, step * 0.72));

    var oldN = N, ox = x, oy = y, ovx = vx, ovy = vy;
    N = px.length;
    hx = new Float32Array(px); hy = new Float32Array(py);
    col = new Uint8Array(pc);
    x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    sx = new Float32Array(N); sy = new Float32Array(N); ph = new Float32Array(N); kk = new Float32Array(N);
    dl = new Float32Array(N); lv = new Uint8Array(N);
    for (var i = 0; i < N; i++) {
      if (oldN) { var j = i % oldN; x[i] = ox[j]; y[i] = oy[j]; vx[i] = ovx[j]; vy[i] = ovy[j]; }
      else { x[i] = Math.random() * W; y[i] = Math.random() * H; }
      sx[i] = (Math.random() - 0.5) * 320;
      sy[i] = -(40 + Math.random() * 460);
      ph[i] = Math.random() * 6.283;
      kk[i] = 0.045 + Math.random() * 0.05;
      dl[i] = (hx[i] / W) * 0.85 + Math.random() * 0.55;   // assembles as a left-to-right wave
    }
    return true;
  }

  /* ---------- animation ---------- */
  function frame(t) {
    raf = 0;
    if (!vis || document.hidden || !N) return;
    var dt = Math.min(2.2, (t - last) / 16.667 || 1); last = t;

    var sc = Math.min(1, Math.max(0, (window.pageYOffset || 0) / (H * 0.75)));
    var se = sc * sc * (3 - 2 * sc);
    var fade = Math.pow(1 - se, 1.15);
    var tt = (t - t0) / 1000;

    pa += ((pAct ? 1 : 0) - pa) * 0.1 * dt;
    var R = coarse ? 95 : 135, R2 = R * R;
    var sweepX = ((t * 0.00012) % 1.9 - 0.4) * W, sweepW = W * 0.065;

    if (dirty) { hero.style.setProperty('--hx', mx.toFixed(0) + 'px'); hero.style.setProperty('--hy', my.toFixed(0) + 'px'); dirty = false; }

    for (var i = 0; i < N; i++) {
      var xi = x[i], yi = y[i], ax, ay, homing = tt > dl[i];
      if (homing) {
        ax = (hx[i] + sx[i] * se - xi) * kk[i];
        ay = (hy[i] + sy[i] * se - yi) * kk[i];
      } else {
        ax = Math.sin(t * 0.0005 + ph[i]) * 0.07;
        ay = Math.cos(t * 0.00041 + ph[i] * 1.3) * 0.07;
      }
      var boost = 0;
      if (pa > 0.01) {
        var dx = xi - mx, dy = yi - my, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          var d = Math.sqrt(d2) || 1, f = 1 - d / R; boost = f;
          f = f * f * pa * 2.6;
          ax += dx / d * f - dy / d * f * 0.55;
          ay += dy / d * f + dx / d * f * 0.55;
        }
      }
      var nvx = (vx[i] + ax * dt) * 0.87, nvy = (vy[i] + ay * dt) * 0.87;
      xi += nvx * dt; yi += nvy * dt;
      if (!homing) { if (xi < 0) xi += W; else if (xi > W) xi -= W; if (yi < 0) yi += H; else if (yi > H) yi -= H; }
      x[i] = xi; y[i] = yi; vx[i] = nvx; vy[i] = nvy;

      var a = homing ? 0.62 : 0.36;
      a += 0.14 * Math.sin(t * 0.0021 + ph[i]);
      var sd = (xi - sweepX) / sweepW; a += 0.55 * Math.exp(-sd * sd);
      a += boost * 0.45 + Math.min(0.35, (Math.abs(nvx) + Math.abs(nvy)) * 0.09);
      lv[i] = a > 0.95 ? 3 : a > 0.72 ? 2 : a > 0.5 ? 1 : 0;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (fade > 0.01) {
      var half = size / 2;
      for (var c = 0; c < 2; c++) {
        ctx.fillStyle = c ? GOLD : WHITE;
        for (var l = 0; l < 4; l++) {
          ctx.globalAlpha = LEVELS[l] * fade;
          ctx.beginPath();
          for (var j = 0; j < N; j++) if (col[j] === c && lv[j] === l) ctx.rect(x[j] - half, y[j] - half, size, size);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && vis && !document.hidden && N) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  /* ---------- input ---------- */
  function setPointer(e) {
    var r = hero.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top; pAct = true; dirty = true;
  }
  hero.addEventListener('pointermove', setPointer, { passive: true });
  hero.addEventListener('pointerleave', function () { pAct = false; });
  hero.addEventListener('pointerdown', function (e) {
    setPointer(e);
    if (!N || (e.target.closest && e.target.closest('a,button,input,summary'))) return;
    var B = 280, B2 = B * B;
    for (var i = 0; i < N; i++) {
      var dx = x[i] - mx, dy = y[i] - my, d2 = dx * dx + dy * dy;
      if (d2 < B2) { var d = Math.sqrt(d2) || 1, f = (1 - d / B) * 26; vx[i] += dx / d * f; vy[i] += dy / d * f; }
    }
  }, { passive: true });
  if (coarse) hero.addEventListener('pointerup', function () { pAct = false; }, { passive: true });

  /* ---------- lifecycle ---------- */
  function start() {
    if (!build()) return;
    if (!live) {
      live = true;
      hero.classList.add('is-live');
      // let the intro curtain lift before the field starts to resolve
      t0 = performance.now() + Math.max(0, 900 - performance.now());
    }
    kick();
  }
  var rt = 0, lastW = 0, lastH = 0;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var w = hero.clientWidth, h = hero.clientHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 140) return;   // ignore mobile URL-bar jitter
      lastW = w; lastH = h; start();
    }, 180);
  });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis) kick(); }).observe(hero);
  }

  var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  ready.then(function () {
    lastW = hero.clientWidth; lastH = hero.clientHeight;
    start();
    addEventListener('load', function () { if (live) build(), kick(); });   // late layout shifts (images, fonts)
  });
})();

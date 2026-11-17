/* hero-fx.js — constellation network + cloud layer for hero sections.
   Vanilla canvas, no dependencies. Mount with:
   <canvas data-hero-fx data-rgb="R,G,B" data-alpha=".4"
           [data-horizon="R,G,B"]   dusk ridges along the bottom (dark sites)
           [data-haze="R,G,B"]      soft drifting mist blobs (light sites)
           [data-fade]              fade out as the page scrolls past the hero
           aria-hidden="true"></canvas>
   Pauses when off-screen / tab hidden. Honors prefers-reduced-motion (one still frame). */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rgbOf = function (s, d) { return (s || d).split(',').map(Number); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  function mount(cv) {
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var c = rgbOf(cv.dataset.rgb, '201,169,110');
    var A = parseFloat(cv.dataset.alpha || '.4');
    var hor = cv.dataset.horizon ? rgbOf(cv.dataset.horizon) : null;
    var haze = cv.dataset.haze ? rgbOf(cv.dataset.haze) : null;
    var fade = cv.hasAttribute('data-fade');
    var w = 0, h = 0, dpr = 1, nodes = [], blobs = [], link = 120;
    var onScreen = true, running = false, last = 0, t = 0;

    function seed() {
      var n = clamp(Math.round(w * h / 15000), 16, 64);
      if (w < 600) n = Math.round(n * 0.7);
      nodes = [];
      for (var i = 0; i < n; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18,
          r: Math.random() < .15 ? 2.2 : 1.1 + Math.random() * .8,
          p: Math.random() * 6.28
        });
      }
      blobs = [];
      for (var j = 0; j < 7; j++) {
        blobs.push({ x: Math.random() * w, y: h * (.55 + Math.random() * .4),
          r: w * (.18 + Math.random() * .22), v: (.05 + Math.random() * .08) * (Math.random() < .5 ? -1 : 1) });
      }
      link = clamp(Math.min(w, h) * .24, 90, 170);
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(); draw();
    }

    function ridges() {
      for (var L = 0; L < 5; L++) {
        var base = h * (.62 + L * .08), amp = h * (.035 - L * .003);
        ctx.beginPath(); ctx.moveTo(0, h);
        for (var x = 0; x <= w; x += 12) {
          var y = base + Math.sin(x * .004 + L * 1.7 + t * .00008 * (L + 1)) * amp +
                  Math.sin(x * .011 + L * 3.1) * amp * .45;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        var g = ctx.createLinearGradient(0, base - amp, 0, h);
        g.addColorStop(0, 'rgba(' + hor + ',' + (.20 - L * .025) + ')');
        g.addColorStop(1, 'rgba(' + hor + ',0)');
        ctx.fillStyle = g; ctx.fill();
      }
    }

    function mist() {
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(' + haze + ',.38)');
        g.addColorStop(1, 'rgba(' + haze + ',0)');
        ctx.fillStyle = g; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      if (hor) ridges();
      if (haze) mist();
      var i, j, a, b, dx, dy, d, al;
      ctx.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          b = nodes[j]; dx = a.x - b.x; dy = a.y - b.y;
          if (dx > link || dx < -link || dy > link || dy < -link) continue;
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < link) {
            al = (1 - d / link) * .55 * A;
            ctx.strokeStyle = 'rgba(' + c + ',' + al + ')';
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        var tw = .7 + .3 * Math.sin(t * .0016 + a.p);
        if (a.r > 2) {
          ctx.fillStyle = 'rgba(' + c + ',' + (.14 * A) + ')';
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 4, 0, 6.28); ctx.fill();
        }
        ctx.fillStyle = 'rgba(' + c + ',' + (A * tw) + ')';
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.28); ctx.fill();
      }
    }

    function step(ts) {
      if (!running) return;
      var dt = Math.min(ts - (last || ts), 50); last = ts; t += dt;
      var k = dt / 16.7, i, n, b;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i]; n.x += n.vx * k; n.y += n.vy * k;
        if (n.x < -10) n.x = w + 10; else if (n.x > w + 10) n.x = -10;
        if (n.y < -10) n.y = h + 10; else if (n.y > h + 10) n.y = -10;
      }
      for (i = 0; i < blobs.length; i++) {
        b = blobs[i]; b.x += b.v * k;
        if (b.x < -b.r) b.x = w + b.r; else if (b.x > w + b.r) b.x = -b.r;
      }
      draw(); requestAnimationFrame(step);
    }

    function sync() {
      var want = onScreen && !document.hidden && !reduce;
      if (want && !running) { running = true; last = 0; requestAnimationFrame(step); }
      else if (!want) running = false;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; sync(); }).observe(cv);
    }
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', resize, { passive: true });

    if (fade) {
      var ticking = false;
      var onScroll = function () {
        if (ticking) return; ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var o = clamp(1 - (window.pageYOffset || 0) / (window.innerHeight * .9), 0, 1);
          cv.style.opacity = o;
          onScreen = o > 0.01; sync();
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    resize(); sync();
  }

  function init() { var l = document.querySelectorAll('canvas[data-hero-fx]'); for (var i = 0; i < l.length; i++) mount(l[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// Dynamic Island, a plain-JS port of the Cult UI pattern.
// Shows the current section and page progress; expands into quick links.
// No network calls, nothing stored.
(function () {
  var fab = document.getElementById('fab');
  var book = fab ? fab.getAttribute('href') : 'https://calendly.com/shakur-opmventuresllc/30min';

  var sections = [
    { id: 'top', label: 'Home' },
    { id: 'services', label: 'Services' },
    { id: 'remy', label: 'Remy OS' },
    { id: 'start', label: 'How we start' },
    { id: 'operator', label: 'Operator' },
    { id: 'tiers', label: 'Tiers' },
    { id: 'faq', label: 'Questions' },
    { id: 'contact', label: 'Contact' }
  ].filter(function (s) { return document.getElementById(s.id); });
  if (!sections.length) return;

  var links = sections.filter(function (s) { return s.id !== 'top' && s.id !== 'faq'; });

  var el = document.createElement('div');
  el.className = 'isl';
  el.id = 'isl';
  el.setAttribute('role', 'navigation');
  el.setAttribute('aria-label', 'Quick navigation');
  el.innerHTML =
    '<div class="isl__box">' +
      '<button type="button" class="isl__pill" aria-expanded="false" aria-controls="isl-menu">' +
        '<svg class="isl__ring" viewBox="0 0 22 22" aria-hidden="true"><circle class="bg" cx="11" cy="11" r="9"/><circle class="fg" cx="11" cy="11" r="9"/></svg>' +
        '<span class="isl__lbl">Home</span><i class="isl__chev" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="isl__menu" id="isl-menu">' +
        links.map(function (s) { return '<a href="#' + s.id + '" data-s="' + s.id + '">' + s.label + '</a>'; }).join('') +
        '<a class="isl__cta" href="' + book + '">Book a call</a>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);

  var box = el.querySelector('.isl__box');
  var pill = el.querySelector('.isl__pill');
  var lbl = el.querySelector('.isl__lbl');
  var fg = el.querySelector('.fg');
  var menu = el.querySelector('.isl__menu');
  var menuLinks = menu.querySelectorAll('a[data-s]');
  var CIRC = 56.55;

  function size() {
    // open height = pill + menu content, measured so it never clips
    box.style.setProperty('--h', (44 + menu.scrollHeight + 4) + 'px');
  }
  function setOpen(v) {
    if (v) size();
    el.classList.toggle('open', v);
    pill.setAttribute('aria-expanded', v ? 'true' : 'false');
  }
  pill.addEventListener('click', function () { setOpen(!el.classList.contains('open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a[data-s]')) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', function (e) { if (!el.contains(e.target)) setOpen(false); });
  window.addEventListener('resize', function () { if (el.classList.contains('open')) size(); });

  // current section = last one whose top has passed the upper third of the viewport
  var current = '';
  function update() {
    var y = window.scrollY || window.pageYOffset;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    fg.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, Math.max(0, h > 0 ? y / h : 0))));
    el.classList.toggle('show', y > window.innerHeight * 0.6);
    var line = window.innerHeight * 0.35, found = sections[0];
    sections.forEach(function (s) {
      var n = document.getElementById(s.id);
      if (n && n.getBoundingClientRect().top <= line) found = s;
    });
    if (found.id !== current) {
      current = found.id;
      lbl.textContent = found.label;
      Array.prototype.forEach.call(menuLinks, function (a) { a.classList.toggle('on', a.getAttribute('data-s') === current); });
      // pill width follows the label so short names don't leave dead space
      box.style.setProperty('--w', Math.max(150, 12 + 22 + 10 + found.label.length * 8.6 + 10 + 10 + 16) + 'px');
    }
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }, { passive: true });
  update();
})();

// Sparkles on the "Recommended" badge: a few twinkling plus-shapes, staggered.
(function () {
  var badge = document.querySelector('.tier--feature .badge');
  if (!badge) return;
  [[-6, -6, 0], [92, -8, .8], [48, 100, 1.5], [102, 70, 2.1]].forEach(function (p) {
    var s = document.createElement('i');
    s.className = 'reel-sp';
    s.setAttribute('aria-hidden', 'true');
    s.style.left = p[0] + '%';
    s.style.top = p[1] + '%';
    s.style.animationDelay = p[2] + 's';
    badge.appendChild(s);
  });
})();

// Confetti burst when the email is copied (Magic UI Confetti, canvas, no library).
(function () {
  var btn = document.getElementById('copy');
  if (!btn) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && !/[?&]fx=on/.test(location.search);
  if (reduce) return;
  var colors = ['#f0d68a', '#ffffff', '#80ACFF', '#f6e3a8'];
  btn.addEventListener('click', function () {
    var r = btn.getBoundingClientRect();
    var cv = document.createElement('canvas');
    cv.className = 'reel-confetti';
    cv.setAttribute('aria-hidden', 'true');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    var ps = [];
    for (var i = 0; i < 60; i++) {
      var a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 6;
      ps.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[i % colors.length], life: 1 });
    }
    var last = performance.now();
    (function frame(t) {
      var dt = Math.min(2, (t - last) / 16.7); last = t;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      var alive = false;
      ps.forEach(function (p) {
        p.vy += .22 * dt; p.vx *= .985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= .012 * dt;
        if (p.life <= 0) return;
        alive = true;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (alive) requestAnimationFrame(frame); else cv.remove();
    })(last);
  });
})();

// Dot pattern glow: the dots under the cursor light up inside the facts band.
(function () {
  var el = document.querySelector('.facts');
  if (!el || !(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
  el.addEventListener('mousemove', function (e) {
    var r = el.getBoundingClientRect();
    el.style.setProperty('--dx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--dy', (e.clientY - r.top) + 'px');
    el.classList.add('dot-on');
  });
  el.addEventListener('mouseleave', function () { el.classList.remove('dot-on'); });
})();

// Scroll-scrubbed text reveal: words fade in one by one as the paragraph scrolls through the viewport.
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && !/[?&]fx=on/.test(location.search);
  if (reduce) return;
  var targets = Array.prototype.slice.call(document.querySelectorAll('#services .lead, #contact .lead'));
  if (!targets.length) return;
  var items = targets.map(function (p) {
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement('span'); s.className = 'rv-w'; s.textContent = part;
            words.push(s); frag.appendChild(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) { walk(n); }
      });
    })(p);
    return { p: p, words: words };
  });
  function update() {
    var vh = window.innerHeight;
    items.forEach(function (it) {
      var r = it.p.getBoundingClientRect();
      // progress 0 when the paragraph enters the bottom 15%, 1 once it reaches the upper 45%
      var t = (vh * 0.85 - r.top) / (vh * 0.4);
      t = Math.min(1, Math.max(0, t));
      var n = it.words.length;
      it.words.forEach(function (w, i) {
        var o = Math.min(1, Math.max(0, t * (n + 4) - i) / 4);
        w.style.setProperty('--o', (0.18 + 0.82 * o).toFixed(3));
      });
    });
  }
  var tick = false;
  window.addEventListener('scroll', function () { if (tick) return; tick = true; requestAnimationFrame(function () { tick = false; update(); }); }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

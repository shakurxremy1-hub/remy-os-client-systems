/* scroll-fx.js — GSAP ScrollTrigger layer for opmventuresllc.com.
   Needs assets/vendor/gsap.min.js + ScrollTrigger.min.js (self-hosted, CSP is script-src 'self').
   Runs on top of the existing Lenis smooth scroll (window.lenis) and fx.js, and touches
   only what fx.js does not: it never pins anything and never animates the same property
   fx.js / CSS transitions already drive.

   1. Services: cards enter one after another; a gold line draws down the divider and lights each step.
   2. Headings: the italic word in every big heading fills in as you scroll through it.
   3. Depth: the founder photo and the tiers heading drift at a different speed from the page.

   If GSAP is missing or the visitor prefers reduced motion, nothing here runs. */
(function () {
  'use strict';
  var gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) return;
  gsap.registerPlugin(ST);

  /* keep ScrollTrigger in step with Lenis (fx.js creates it and drives its rAF loop) */
  (function hook(n) {
    if (window.lenis && window.lenis.on) window.lenis.on('scroll', ST.update);
    else if (n < 80) setTimeout(function () { hook(n + 1); }, 100);
  })(0);

  var mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', function () {

    /* ---------- 1. services ---------- */
    var svc = document.querySelector('.svc');
    if (svc) {
      var arts = [].slice.call(svc.querySelectorAll('article'));
      // this script owns the entrance of these cards now (the CSS .reveal fade would fight it)
      arts.forEach(function (a) { a.classList.remove('reveal'); });
      gsap.set(arts, { opacity: 0, y: 70 });
      ST.batch(arts, {
        start: 'top 90%', once: true,
        onEnter: function (batch) {
          gsap.to(batch, { opacity: 1, y: 0, duration: 1.05, ease: 'power3.out', stagger: 0.15, overwrite: true, clearProps: 'opacity,transform' });
        }
      });

      var line = document.createElement('div');
      line.className = 'svc__line'; line.setAttribute('aria-hidden', 'true');
      svc.appendChild(line);
      var cta = svc.querySelector('article.cta');
      function place() {
        var cols = getComputedStyle(svc).gridTemplateColumns.split(' ').length;
        line.classList.toggle('is-edge', cols < 2);
        // stop above the full-width call-to-action row
        line.style.bottom = (cols > 1 && cta ? cta.offsetHeight : 0) + 'px';
      }
      place();
      ST.addEventListener('refreshInit', place);

      gsap.to(line, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: svc, start: 'top 72%', end: 'bottom 55%', scrub: 0.5 } });
      arts.forEach(function (a) {
        ST.create({
          trigger: a, start: 'top 66%',
          onEnter: function () { a.classList.add('is-lit'); },
          onLeaveBack: function () { a.classList.remove('is-lit'); }
        });
      });
    }

    /* ---------- 2. headings: italic word fills with scroll ---------- */
    gsap.utils.toArray('h2.big').forEach(function (h) {
      var words = [].slice.call(h.querySelectorAll('em .twi'));
      if (!words.length) return;
      words.forEach(function (w) { w.classList.add('fx-fw'); });
      function paint(p) {
        var n = words.length;
        words.forEach(function (w, i) {
          var f = Math.min(1, Math.max(0, p * (n + 0.8) - i));
          w.style.setProperty('--f', (f * 100).toFixed(1) + '%');
        });
      }
      paint(0);
      ST.create({
        trigger: h, start: 'top 88%', end: 'top 36%', scrub: true,
        onUpdate: function (self) { paint(self.progress); },
        onRefresh: function (self) { paint(self.progress); }
      });
    });

    /* ---------- 3. depth ---------- */
    var photo = document.querySelector('#founderPhoto img');
    if (photo) {
      gsap.fromTo(photo, { yPercent: -5 }, {
        yPercent: 5, ease: 'none',
        scrollTrigger: { trigger: '#operator', start: 'top bottom', end: 'bottom top', scrub: 0.6 }
      });
    }
    var th = document.querySelector('#tiers h2.big');
    if (th) {
      gsap.fromTo(th, { y: 46 }, {
        y: -34, ease: 'none',
        scrollTrigger: { trigger: '#tiers', start: 'top bottom', end: 'top 15%', scrub: 0.6 }
      });
    }

    return function () {
      // matchMedia reverts GSAP's own changes; tidy what we added by hand
      document.querySelectorAll('.svc__line').forEach(function (l) { l.remove(); });
      document.querySelectorAll('.fx-fw').forEach(function (w) { w.classList.remove('fx-fw'); w.style.removeProperty('--f'); });
    };
  });

  function refresh() { ST.refresh(); }
  addEventListener('load', refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
})();

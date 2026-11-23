/* ticker.js: pins the .ticker section and slides one long sentence sideways, scroll-linked.
   Inline icons draw themselves as they pass; words drift; the row leans with scroll speed.
   Falls back to a wrapped paragraph without GSAP or with reduced motion. */
(function () {
  'use strict';
  var sec = document.querySelector('.sentence'); if (!sec) return;
  var track = sec.querySelector('.sentence__track'), fill = sec.querySelector('.sentence__bar b');
  var gsap = window.gsap, ST = window.ScrollTrigger;
  function still() { sec.classList.add('is-static'); track.removeAttribute('aria-hidden'); }
  if (!gsap || !ST || matchMedia('(prefers-reduced-motion: reduce)').matches) { still(); return; }
  gsap.registerPlugin(ST);

  var dist = function () { return Math.max(0, track.scrollWidth - innerWidth); };
  var end = function () { return '+=' + dist(); };

  var main = gsap.to(track, { x: function () { return -dist(); }, ease: 'none', scrollTrigger: {
    trigger: sec, start: 'top top', end: end, pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1,
    onUpdate: function (s) { gsap.set(fill, { scaleX: s.progress }); }
  } });

  [].forEach.call(sec.querySelectorAll('.w'), function (w, i) {
    gsap.fromTo(w, { yPercent: i % 2 ? 7 : -7 }, { yPercent: i % 2 ? -7 : 7, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top top', end: end, scrub: true } });
  });

  [].forEach.call(sec.querySelectorAll('[data-g]'), function (g) {
    var paths = g.querySelectorAll('.dr');
    gsap.to(paths, { strokeDashoffset: 0, ease: 'none',
      scrollTrigger: { trigger: g, containerAnimation: main, start: 'left 92%', end: 'left 38%', scrub: true } });
    gsap.fromTo(g, { rotate: -10 }, { rotate: 10, ease: 'none',
      scrollTrigger: { trigger: g, containerAnimation: main, start: 'left 100%', end: 'right 0%', scrub: true } });
  });

  var sk = gsap.quickTo(track, 'skewX', { duration: 0.4, ease: 'power3' });
  ST.create({ trigger: sec, start: 'top bottom', end: 'bottom top', onUpdate: function (s) { sk(gsap.utils.clamp(-6, 6, s.getVelocity() / -300)); }, onLeave: function () { sk(0); }, onLeaveBack: function () { sk(0); } });
})();

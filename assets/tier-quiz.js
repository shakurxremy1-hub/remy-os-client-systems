/* tier-quiz.js — three questions -> one recommended plan. Uses only the plans already on the page.
 * Nothing is stored, sent or tracked. Edit QUESTIONS / the scoring map below to change it. */
(function () {
  var grid = document.querySelector('.tiers__grid'); if (!grid) return;
  var tiers = [].slice.call(grid.querySelectorAll('.tier')); if (tiers.length !== 4) return;
  var BOOK = 'https://calendly.com/shakur-opmventuresllc/30min';
  /* each answer adds points to plans [Foundation, Growth, Scale & Fund, Partner] */
  var QUESTIONS = [
    { q: 'What do you need most right now?', a: [
      { t: 'To be found. I need a site that converts.', s: [3, 0, 0, 0] },
      { t: 'To get leads. I need buyers coming in.', s: [0, 3, 0, 0] },
      { t: 'To get capital. I need to be lender-ready.', s: [0, 0, 3, 0] },
      { t: 'More than one location, or a bigger budget.', s: [0, 0, 0, 3] } ] },
    { q: 'Where is the business today?', a: [
      { t: 'No site, or one that does not bring in customers.', s: [2, 0, 0, 0] },
      { t: 'I have a site, but no steady traffic.', s: [0, 2, 0, 0] },
      { t: 'Traffic is coming, but I am not ready for lenders.', s: [0, 0, 2, 0] },
      { t: 'Several locations, or a larger operation.', s: [0, 0, 0, 2] } ] },
    { q: 'How would you like to pay?', a: [
      { t: 'One payment. No retainer.', s: [2, 0, 0, 0] },
      { t: 'A monthly plan with a minimum is fine.', s: [0, 1, 1, 0] },
      { t: 'A custom scope and quote.', s: [0, 0, 0, 2] } ] }
  ];
  var ans = [], step = 0;
  var box = document.createElement('section'); box.className = 'tq'; box.setAttribute('aria-label', 'Which tier fits? A three-question quiz');
  box.innerHTML = '<div class="tq__bar"><p class="tq__lead">Not sure which tier?</p><button type="button" class="tq__go" aria-expanded="false">Take the 3-question quiz</button></div><div class="tq__body" aria-live="polite"></div>';
  var body = box.querySelector('.tq__body'), go = box.querySelector('.tq__go');

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function scrollTo(node) {
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.lenis && window.lenis.scrollTo && !reduce) window.lenis.scrollTo(node, { offset: -110 });
    else node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
  function progress() {
    var p = el('div', 'tq__prog'); p.setAttribute('aria-hidden', 'true');
    QUESTIONS.forEach(function (_, i) { p.appendChild(el('i', i <= step ? 'on' : '')); });
    return p;
  }
  function render() {
    body.textContent = '';
    if (step >= QUESTIONS.length) return result();
    var Q = QUESTIONS[step], fs = el('fieldset'), lg = el('legend', '', Q.q);
    body.appendChild(progress());
    fs.appendChild(lg);
    var list = el('div', 'tq__opts'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', Q.q);
    Q.a.forEach(function (a, i) {
      var b = el('button', 'tq__opt', a.t); b.type = 'button';
      if (ans[step] === i) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () { ans[step] = i; step++; render(); var f = body.querySelector('.tq__opt,.tq__primary'); if (f) f.focus({ preventScroll: true }); });
      list.appendChild(b);
    });
    fs.appendChild(list); body.appendChild(fs);
    var nav = el('div', 'tq__nav'), back = el('button', '', 'Back'); back.type = 'button'; back.hidden = step === 0;
    back.addEventListener('click', function () { step--; render(); });
    var count = el('span', 'tq__note', 'Question ' + (step + 1) + ' of ' + QUESTIONS.length);
    nav.appendChild(back); nav.appendChild(count); body.appendChild(nav);
  }
  function pick() {
    var score = [0, 0, 0, 0];
    ans.forEach(function (ai, qi) { QUESTIONS[qi].a[ai].s.forEach(function (v, k) { score[k] += v; }); });
    var first = QUESTIONS[0].a[ans[0]].s, lead = first.indexOf(Math.max.apply(null, first));
    var best = 0;
    score.forEach(function (v, k) { if (v > score[best] || (v === score[best] && k === lead)) best = k; });
    return best;
  }
  function result() {
    var k = pick(), t = tiers[k], name = t.querySelector('h3').textContent.trim();
    var bl = (t.querySelector('.bl') || {}).textContent || '', price = ((t.querySelector('.price') || {}).textContent || '').replace(/\s+/g, ' ').trim();
    var sub = ((t.querySelector('.sub') || {}).textContent || '').replace(/ /g, ' ').trim();
    var res = el('div', 'tq__res'); res.tabIndex = -1;
    res.appendChild(el('p', 'tq__lead', 'Your best fit'));
    res.appendChild(el('h3', '', name));
    res.appendChild(el('p', 'tq__price', price + (sub ? ' · ' + sub : '')));
    res.appendChild(el('p', '', bl.trim()));
    var why = el('ul', 'tq__why'); why.setAttribute('aria-label', 'Your answers');
    ans.forEach(function (ai, qi) { why.appendChild(el('li', '', QUESTIONS[qi].a[ai].t)); });
    res.appendChild(why);
    var acts = el('div', 'tq__acts'), see = el('a', 'tq__primary', 'See ' + name); see.href = '#tiers';
    see.addEventListener('click', function (e) {
      e.preventDefault(); tiers.forEach(function (x) { x.classList.remove('match'); }); grid.classList.add('has-match'); t.classList.add('match'); scrollTo(t);
    });
    var book = el('a', 'tq__alt', 'Book a call'); book.href = BOOK;
    var again = el('button', '', 'Start over'); again.type = 'button';
    again.addEventListener('click', function () { ans = []; step = 0; tiers.forEach(function (x) { x.classList.remove('match'); }); grid.classList.remove('has-match'); render(); });
    acts.appendChild(see); acts.appendChild(book); acts.appendChild(again); res.appendChild(acts);
    res.appendChild(el('p', 'tq__note', 'A starting point, not a quote. The final scope and price are agreed with Shakur on the call. Your answers stay in this page and are not sent anywhere.'));
    body.appendChild(res); res.focus({ preventScroll: true });
  }
  go.addEventListener('click', function () { box.classList.add('is-open'); go.setAttribute('aria-expanded', 'true'); ans = []; step = 0; render(); });
  var pick0 = grid.parentNode.querySelector('.pick');
  grid.parentNode.insertBefore(box, pick0 ? pick0.nextSibling : grid);
})();

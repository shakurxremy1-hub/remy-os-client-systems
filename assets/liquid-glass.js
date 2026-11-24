/* liquid-glass.js: thick refracting glass for the site's panels.
   The optics follow rune-light's glass model (github.com/anomalyco/rune, crates/rune-light/src/shaders/glass.wgsl):
   a slab with a quarter-circle bevel shoulder, Snell refraction at n = 1.5, and a little dispersion so rims
   fringe. Each panel gets its own displacement map baked from that height field and applied through an SVG
   backdrop-filter. Chromium renders the refraction; other browsers keep the frosted-glass fallback in vision.css.
   A soft light follows the pointer and catches the glass like the lamp in rune-light. */
(function () {
  'use strict';
  var SEL = '.svc article,.proc article,.tier,.names>div:first-child,.faq details,.tq,.calc,.lc__card,.hero__sub';
  var IOR = 1.5, THICK = 22, DISP = 0.07;
  var isChromium = !!window.chrome && !/Edg\/.*Mobile/.test(navigator.userAgent) ? true : /Chrome\//.test(navigator.userAgent);
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var NS = 'http://www.w3.org/2000/svg';
  var defs = null, uid = 0, items = [];

  function ensureDefs() {
    if (defs) return defs;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;pointer-events:none';
    defs = document.createElementNS(NS, 'defs'); svg.appendChild(defs);
    document.body.appendChild(svg); return defs;
  }

  /* signed distance + outward gradient of a rounded rect centred at the origin */
  function sdr(px, py, hx, hy, r, out) {
    var qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
    var sx = px < 0 ? -1 : 1, sy = py < 0 ? -1 : 1, d, gx, gy;
    if (qx > 0 && qy > 0) { var l = Math.hypot(qx, qy) || 1e-6; d = l - r; gx = sx * qx / l; gy = sy * qy / l; }
    else if (qx > qy) { d = qx - r; gx = sx; gy = 0; }
    else { d = qy - r; gx = 0; gy = sy; }
    out[0] = d; out[1] = gx; out[2] = gy;
  }

  function bake(w, h, radius, bevel) {
    var sc = Math.min(1, 360 / Math.max(w, h));
    var cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(cw, ch), data = img.data;
    var hx = w / 2, hy = h / 2, o = [0, 0, 0], maxOff = Math.max(6, bevel * 0.85), eta = 1 / IOR;
    for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) {
      var px = (x + 0.5) / sc - hx, py = (y + 0.5) / sc - hy;
      sdr(px, py, hx, hy, radius, o);
      var d = o[0], dx = 0, dy = 0;
      if (d < 0) {
        var t = Math.min(1, -d / bevel);
        if (t < 1) {
          var u = 1 - t, root = Math.sqrt(Math.max(1 - u * u, 1e-4));
          var slope = (u / root) * (THICK / bevel);            // dh/d(depth) of the quarter-circle shoulder
          var nl = Math.hypot(slope, 1), nxy = slope / nl, nz = 1 / nl;   // normal tilts outward
          var k = eta * nz - Math.sqrt(Math.max(1 - eta * eta * (1 - nz * nz), 0));
          var rz = -(eta + k * nz);                              // refracted ray z (downward, negative)
          var travel = THICK / Math.max(-rz, 0.2);
          var m = Math.min(maxOff, Math.abs(k) * nxy * travel);  // inward lateral shift in px
          dx = -o[1] * m; dy = -o[2] * m;
        }
      }
      var i = (y * cw + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 + (dx / maxOff) * 127));
      data[i + 1] = Math.max(0, Math.min(255, 128 + (dy / maxOff) * 127));
      data[i + 2] = 128; data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { url: cv.toDataURL('image/png'), maxOff: maxOff };
  }

  function mkFilter(id, w, h, map) {
    var s = map.maxOff * 2;
    var f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', id); f.setAttribute('x', '0'); f.setAttribute('y', '0');
    f.setAttribute('width', '100%'); f.setAttribute('height', '100%');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    function chan(name, scale, keep) {
      return '<feDisplacementMap in="SourceGraphic" in2="m" scale="' + scale.toFixed(2) + '" xChannelSelector="R" yChannelSelector="G" result="d' + name + '"/>' +
        '<feColorMatrix in="d' + name + '" type="matrix" values="' + keep + '" result="c' + name + '"/>';
    }
    f.innerHTML =
      '<feImage href="' + map.url + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="m"/>' +
      chan('r', s * (1 + DISP), '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0') +
      chan('g', s, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0') +
      chan('b', s * (1 - DISP), '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0') +
      '<feBlend in="cr" in2="cg" mode="screen" result="rg"/><feBlend in="rg" in2="cb" mode="screen"/>';
    return f;
  }

  function apply(it) {
    var el = it.el, r = el.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(r.height);
    if (w < 40 || h < 30) return;
    if (it.w === w && it.h === h) { return; }
    it.w = w; it.h = h;
    var cs = getComputedStyle(el), rad = parseFloat(cs.borderTopLeftRadius) || 20;
    rad = Math.min(rad, Math.min(w, h) / 2);
    var bevel = Math.min(26, Math.min(w, h) * 0.3);
    var map = bake(w, h, rad, bevel);
    var id = it.id || (it.id = 'lg' + (++uid));
    var old = defs.querySelector('#' + id); if (old) old.remove();
    defs.appendChild(mkFilter(id, w, h, map));
    var v = 'url(#' + id + ') blur(5px) saturate(1.6) brightness(1.08)';
    el.style.webkitBackdropFilter = v; el.style.backdropFilter = v;
  }

  function init() {
    ensureDefs();
    var els = [].slice.call(document.querySelectorAll(SEL));
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var it = e.target.__lg; it.vis = e.isIntersecting;
        if (it.vis) { apply(it); e.target.classList.add('lg-on'); }
        else { e.target.classList.remove('lg-on'); e.target.style.backdropFilter = ''; e.target.style.webkitBackdropFilter = ''; it.w = it.h = 0; }
      });
    }, { rootMargin: '200px' });
    var ro = new ResizeObserver(function (es) { es.forEach(function (e) { var it = e.target.__lg; if (it.vis) apply(it); }); });
    els.forEach(function (el) { el.classList.add('lg'); var it = { el: el, vis: false }; el.__lg = it; items.push(it); io.observe(el); ro.observe(el); });

    /* the lamp: one soft highlight follows the pointer across every glass panel */
    if (!reduce.matches) {
      var raf = 0, px = 0, py = 0;
      addEventListener('pointermove', function (e) {
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          for (var i = 0; i < items.length; i++) {
            var it = items[i]; if (!it.vis) continue;
            var r = it.el.getBoundingClientRect();
            it.el.style.setProperty('--lx', (px - r.left).toFixed(0) + 'px');
            it.el.style.setProperty('--ly', (py - r.top).toFixed(0) + 'px');
          }
        });
      }, { passive: true });
    }
  }

  if (!isChromium) return;
  var go = function () { try { init(); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

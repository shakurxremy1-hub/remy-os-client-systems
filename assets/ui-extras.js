/* ui-extras.js — three features ported from the Airform concept, rebuilt for this site (no framework):
 *   1. Pause-motion toggle (stars, ticker/marquee/cube loops, smooth scroll, 3D stage). Remembered; honors reduced motion.
 *   2. Scroll-linked tint: the star backdrop's glow blends between sections ([data-tint] on a section, hex).
 *   3. Pinned 3D stage: Remy OS tile, rotation / tilt / zoom bound to scroll progress, reversible.
 */
(function () {
  var root = document.documentElement, $ = function (s, c) { return (c || document).querySelector(s); };
  var reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var KEY = 'opm-motion', off = false;
  try { off = localStorage.getItem(KEY) === 'off'; } catch (e) {}
  if (reduceMQ.matches && !/[?&]fx=on/.test(location.search)) off = true;
  var listeners = [];

  /* 1. toggle */
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'mtog';
  btn.innerHTML = '<svg class="ic-pause" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 0h3v10H1zM6 0h3v10H6z"/></svg><svg class="ic-play" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 0l9 5-9 5z"/></svg><span></span>';
  function apply(save) {
    root.classList.toggle('motion-off', off);
    btn.setAttribute('aria-pressed', String(off));
    btn.setAttribute('aria-label', off ? 'Play motion' : 'Pause motion');
    btn.lastChild.textContent = off ? 'Play motion' : 'Pause motion';
    if (window.lenis && window.lenis.options) window.lenis.options.lerp = off ? 1 : 0.12;
    if (save) { try { localStorage.setItem(KEY, off ? 'off' : 'on'); } catch (e) {} }
    listeners.forEach(function (f) { f(off); });
  }
  btn.addEventListener('click', function () { off = !off; apply(true); });
  document.body.appendChild(btn);

  /* 2. tint */
  var tintSecs = [].slice.call(document.querySelectorAll('[data-tint]')), stars = $('.stars');
  var hex = function (h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function tint() {
    if (!stars || !tintSecs.length) return;
    var mid = innerHeight * .5, a = null, b = null;
    for (var i = 0; i < tintSecs.length; i++) {
      var r = tintSecs[i].getBoundingClientRect(), c = r.top + r.height / 2;
      if (c <= mid) a = { c: c, h: tintSecs[i].dataset.tint }; else { b = { c: c, h: tintSecs[i].dataset.tint }; break; }
    }
    var from = a || b, to = b || a, f = a && b ? (mid - a.c) / (b.c - a.c) : 0;
    f = Math.max(0, Math.min(1, f)); f = f * f * (3 - 2 * f);
    var A = hex(from.h), B = hex(to.h);
    stars.style.setProperty('--glow', 'rgb(' + A.map(function (v, k) { return Math.round(v + (B[k] - v) * f); }).join(',') + ')');
  }
  var tk = false;
  function onScroll() { if (tk) return; tk = true; requestAnimationFrame(function () { tk = false; tint(); stageUpdate(); }); }
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);

  /* 3. stage */
  var sec = $('.stage3d'), lines = sec ? [].slice.call(sec.querySelectorAll('.stage3d__lines p')) : [];
  var api = null, loading = false, progress = 0, still = false;
  function setStill(v) { still = v; if (sec) sec.classList.toggle('is-still', v); }
  function stageUpdate() {
    if (!sec || still) return;
    var r = sec.getBoundingClientRect(), len = r.height - innerHeight;
    progress = Math.max(0, Math.min(1, -r.top / Math.max(1, len)));
    lines.forEach(function (p, i) {
      var n = lines.length, a = i / n, b = (i + 1) / n, w = 1 / n * .22;
      var o = Math.max(0, Math.min(1, (progress - a) / w, (b - progress) / w + (i === n - 1 ? 9 : 0)));
      p.style.opacity = o.toFixed(3); p.style.transform = 'translateY(' + ((1 - o) * 24).toFixed(1) + 'px)';
    });
    if (api) api.set(progress);
  }
  function initStage() {
    if (!sec || loading) return; loading = true;
    var canvas = $('canvas', sec);
    import('./vendor/three/three.module.min.js').then(function (T) {
      var renderer;
      try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); } catch (e) { setStill(true); return; }
      renderer.setClearColor(0, 0); renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
      var scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .1, 40); cam.position.set(0, 0, 8.4);
      /* small studio as the reflection source (same idea as the Airform scene) */
      var env = new T.Scene();
      env.add(new T.Mesh(new T.BoxGeometry(24, 14, 24), new T.MeshBasicMaterial({ color: 0x20242c, side: T.BackSide })));
      var panel = function (w, h, c, x, y, z, rx, ry, col) {
        var m = new T.MeshBasicMaterial({ color: new T.Color(col || 0xffffff).multiplyScalar(c), side: T.DoubleSide, toneMapped: false });
        var p = new T.Mesh(new T.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); env.add(p);
      };
      panel(10, 10, 4.2, 0, 6.8, 1, Math.PI / 2, 0); panel(3, 11, 3.4, -9.5, .5, 2, 0, Math.PI / 2, 0xffe9b8);
      panel(2, 11, 2.2, 10, .5, 0, 0, -Math.PI / 2, 0xb8d0ff); panel(9, 3, 1.6, 0, 3, 10, 0, Math.PI);
      var pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, .02).texture;
      var key = new T.DirectionalLight(0xffffff, .5); key.position.set(-2, 3, 4); scene.add(key);

      var S = 1.7, R = .3, d = .22, shape = new T.Shape(), h = S / 2;
      shape.moveTo(-h + R, -h); shape.lineTo(h - R, -h); shape.quadraticCurveTo(h, -h, h, -h + R); shape.lineTo(h, h - R);
      shape.quadraticCurveTo(h, h, h - R, h); shape.lineTo(-h + R, h); shape.quadraticCurveTo(-h, h, -h, h - R); shape.lineTo(-h, -h + R); shape.quadraticCurveTo(-h, -h, -h + R, -h);
      var geo = new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 6, curveSegments: 24 });
      geo.translate(0, 0, -d / 2);
      var body = new T.Mesh(geo, new T.MeshPhysicalMaterial({ color: 0x0b0b0c, metalness: .85, roughness: .28, clearcoat: 1, clearcoatRoughness: .12 }));
      var tex = new T.TextureLoader().load('assets/img/remy-os-logo.png'); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
      var face = new T.Mesh(new T.PlaneGeometry(S, S), new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      face.position.z = d / 2 + .0305;
      var back = face.clone(); back.rotation.y = Math.PI; back.position.z = -(d / 2 + .0305);
      var group = new T.Group(); group.add(body, face, back); scene.add(group);

      function size() {
        var w = canvas.clientWidth, hh = canvas.clientHeight; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, hh, false);
        cam.aspect = w / hh; cam.fov = w / hh < .8 ? 44 : 30; cam.updateProjectionMatrix();
      }
      size(); addEventListener('resize', size);
      var t = 0, cur = 0, live = true, vis = false, last = performance.now();
      function pose(p) { /* scroll progress -> rotation / tilt / dolly; fully a function of p, so reversing scroll reverses it */
        var s = p * p * (3 - 2 * p);
        group.rotation.y = -.5 + s * Math.PI * 2.0; group.rotation.x = .15 + Math.sin(p * Math.PI) * -.35;
        group.position.y = Math.sin(p * Math.PI) * .12; cam.position.z = 8.4 - Math.sin(p * Math.PI) * 1.2;
      }
      function frame(now) {
        requestAnimationFrame(frame); if (!vis || still) return;
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        cur += (t - cur) * (off ? 1 : 1 - Math.exp(-dt * 7.5)); pose(cur);
        renderer.render(scene, cam);
      }
      api = { set: function (p) { t = p; } };
      listeners.push(function () { /* smoothing handled via `off` */ });
      new IntersectionObserver(function (e) { vis = e[0].isIntersecting; }, { rootMargin: '200px' }).observe(sec);
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); setStill(true); });
      requestAnimationFrame(frame); stageUpdate();
    }).catch(function () { setStill(true); });
  }
  if (sec) {
    if (reduceMQ.matches && !/[?&]fx=on/.test(location.search)) setStill(true);
    else if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { io.disconnect(); initStage(); } }, { rootMargin: '600px' });
      io.observe(sec);
    } else initStage();
    reduceMQ.addEventListener && reduceMQ.addEventListener('change', function (e) { if (e.matches) setStill(true); });
  }
  apply(false); tint(); stageUpdate();
})();

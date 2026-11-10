/* Vortex Dust Fall — vanilla WebGL port (from the Originkit React component).
 * Usage: VortexDustFall(hostElement, { ring:{radius,thickness}, ... })
 * Adds a <canvas> to host, animates only while on screen, honours reduced motion. */
(function () {
  'use strict';
  var DPR_CAP = 1.5, FOV_DEG = 42, TAU = Math.PI * 2, PTS_PER_DENSITY = 300;
  var RADIUS_REF = 300, DOT_REF = 2.0, BLUR_REF = 5000, LIFE_AT_50 = 3.2;
  var DRIFT = 0.05, SPIN_LAMBDA = 3.0, FALL_EASE = 1.35, SPRAY_PEAK = 0.08, SPRAY_RIM = 0.5;
  var FRAME_SHIFT = 0.24, BIRTH_R0 = 0.35, ARM_SPREAD = TAU * 0.75, ARM_TURNS = 2.0;
  var RIBBON = 3.0, RING_SEG = 720;

  var VERT_DUST = [
    'precision highp float;',
    'attribute vec4 aA; attribute vec2 aB;',
    'uniform vec2 uRes; uniform float uFocal, uPhase, uRadius, uRise, uFall, uSpinTurns, uScatter, uDotWorld, uBlurK, uCamDist, uTilt, uYPx, uAlpha;',
    'varying float vAlpha;',
    'const float TAU = 6.2831853;',
    'void main(){',
    ' float tau = fract(aA.y + uPhase);',
    ' float ang = aA.x * ' + ARM_SPREAD.toFixed(6) + ' + aA.y * TAU * ' + ARM_TURNS.toFixed(1) + ';',
    ' float rN = mix(' + BIRTH_R0.toFixed(3) + ', 1.0, sqrt(aA.z));',
    ' float r = uRadius * rN * (1.0 + ' + DRIFT.toFixed(3) + ' * tau);',
    ' float tp = ' + SPRAY_PEAK.toFixed(3) + ';',
    ' float bump = (tau / tp) * exp(1.0 - tau / tp);',
    ' float rimW = smoothstep(' + SPRAY_RIM.toFixed(3) + ', 1.0, rN);',
    ' float y = uRise * bump * rimW - uFall * pow(tau, ' + FALL_EASE.toFixed(2) + ');',
    ' float L = ' + SPIN_LAMBDA.toFixed(1) + ';',
    ' float sp = (1.0 - exp(-L * tau)) / (1.0 - exp(-L));',
    ' float th = ang + uSpinTurns * TAU * sp;',
    ' vec3 p = vec3(r * cos(th), y, r * sin(th));',
    ' float n = aA.w * TAU;',
    ' p.x += uScatter * tau * sin(n * 3.1 + tau * 5.3);',
    ' p.z += uScatter * tau * sin(n * 4.7 + tau * 4.1 + 1.7);',
    ' p.y += uScatter * tau * 0.6 * sin(n * 2.3 + tau * 6.7 + 3.3);',
    ' float ct = cos(uTilt), st = sin(uTilt);',
    ' float y2 = p.y * ct - p.z * st;',
    ' float z2 = p.y * st + p.z * ct;',
    ' float rz = uCamDist - z2;',
    ' float live = step(1.0, rz); rz = max(rz, 1.0);',
    ' vec2 s = vec2(p.x, y2) * uFocal / rz; s.y += uYPx;',
    ' gl_Position = vec4(s / (uRes * 0.5), 0.0, 1.0);',
    ' float sizePx = uDotWorld * (0.6 + 0.8 * aB.x) * uFocal / rz;',
    ' float coc = uBlurK * uFocal / (rz * rz);',
    ' float tot = sizePx + coc;',
    ' float ratio = max(tot / max(sizePx, 0.0001), 1.0);',
    ' gl_PointSize = clamp(tot, 1.0, 64.0);',
    ' float fadeIn = smoothstep(0.0, 0.02, tau);',
    ' float fadeOut = pow(1.0 - tau, 0.7);',
    ' vAlpha = uAlpha * live * fadeIn * fadeOut * (0.35 + 0.65 * aB.y) * pow(ratio, -1.2);',
    '}'
  ].join('\n');

  var FRAG_DUST = [
    'precision highp float;',
    'uniform vec3 uColor; varying float vAlpha;',
    'void main(){',
    ' vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0;',
    ' if (r2 > 1.0) discard;',
    ' float a = vAlpha * exp(-r2 * 3.0);',
    ' gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  var VERT_RING = [
    'precision highp float;',
    'attribute vec2 aRing;',
    'uniform vec2 uRes; uniform float uFocal, uRadius, uCamDist, uTilt, uYPx, uThick, uSeg;',
    'varying float vSide; varying float vNear;',
    'const float TAU = 6.2831853;',
    'vec2 projPx(float a, out float rz){',
    ' vec3 p = vec3(uRadius * cos(a), 0.0, uRadius * sin(a));',
    ' float ct = cos(uTilt), st = sin(uTilt);',
    ' float y2 = p.y * ct - p.z * st; float z2 = p.y * st + p.z * ct;',
    ' rz = max(uCamDist - z2, 1.0);',
    ' return vec2(p.x, y2) * uFocal / rz + vec2(0.0, uYPx);',
    '}',
    'void main(){',
    ' float a0 = aRing.x * TAU; float a1 = a0 + TAU / uSeg;',
    ' float rz0, rz1; vec2 s0 = projPx(a0, rz0); vec2 s1 = projPx(a1, rz1);',
    ' vec2 d = s1 - s0; float dl = max(length(d), 0.0001);',
    ' vec2 nrm = vec2(-d.y, d.x) / dl;',
    ' float near = uCamDist / rz0;',
    ' float halfW = uThick * 0.5 * ' + RIBBON.toFixed(1) + ' * near;',
    ' vec2 px = s0 + nrm * aRing.y * halfW;',
    ' gl_Position = vec4(px / (uRes * 0.5), 0.0, 1.0);',
    ' vSide = aRing.y; vNear = near;',
    '}'
  ].join('\n');

  var FRAG_RING = [
    'precision highp float;',
    'uniform vec3 uColor; uniform float uAlpha;',
    'varying float vSide; varying float vNear;',
    'void main(){',
    ' float s = abs(vSide);',
    ' float core = exp(-pow(s * ' + RIBBON.toFixed(1) + ', 2.0) * 4.0);',
    ' float halo = exp(-s * s * 2.2) * 0.20;',
    ' float a = (core + halo) * uAlpha * clamp(vNear, 0.7, 1.4);',
    ' gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  function parseColor(s) {
    if (!s) return [1, 1, 1, 1];
    s = String(s).trim();
    var m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255, p.length > 3 && isFinite(p[3]) ? p[3] : 1];
    }
    var x = s.replace('#', '');
    if (x.length === 3 || x.length === 4) x = x.split('').map(function (c) { return c + c; }).join('');
    if (x.length < 6) return [1, 1, 1, 1];
    return [parseInt(x.slice(0, 2), 16) / 255, parseInt(x.slice(2, 4), 16) / 255, parseInt(x.slice(4, 6), 16) / 255,
      x.length >= 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1];
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function link(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('VortexDustFall shader:', gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn('VortexDustFall link:', gl.getProgramInfoLog(p));
    return p;
  }

  var DEFAULTS = {
    baseColor: '#FFFFFF', accentColor: '#FFFFFF', density: 129, dotSize: 107, speed: 46,
    distance: 1495, tilt: 7,
    ring: { radius: 142, thickness: 11 },
    fall: { height: 140, spin: 36, spray: 0 },
    field: { scatter: 300, blur: 0 },
    hover: { amount: 103, duration: 0.6 }
  };

  function merge(o) {
    o = o || {};
    var r = {};
    for (var k in DEFAULTS) {
      var d = DEFAULTS[k];
      if (d && typeof d === 'object') { r[k] = {}; for (var j in d) r[k][j] = (o[k] && o[k][j] != null) ? o[k][j] : d[j]; }
      else r[k] = o[k] != null ? o[k] : d;
    }
    return r;
  }

  function VortexDustFall(host, opts) {
    var P = merge(opts);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    host.appendChild(canvas);

    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false });
    if (!gl) { canvas.remove(); return null; }

    var dustProg = link(gl, VERT_DUST, FRAG_DUST), ringProg = link(gl, VERT_RING, FRAG_RING);
    var U = function (p, n) { return gl.getUniformLocation(p, n); };
    var dA = { a: gl.getAttribLocation(dustProg, 'aA'), b: gl.getAttribLocation(dustProg, 'aB') };
    var dU = {}; ['uRes', 'uFocal', 'uPhase', 'uRadius', 'uRise', 'uFall', 'uSpinTurns', 'uScatter', 'uDotWorld', 'uBlurK', 'uCamDist', 'uTilt', 'uYPx', 'uAlpha', 'uColor']
      .forEach(function (n) { dU[n] = U(dustProg, n); });
    var rA = gl.getAttribLocation(ringProg, 'aRing');
    var rU = {}; ['uRes', 'uFocal', 'uRadius', 'uCamDist', 'uTilt', 'uYPx', 'uThick', 'uSeg', 'uColor', 'uAlpha']
      .forEach(function (n) { rU[n] = U(ringProg, n); });

    var aBuf = gl.createBuffer(), bBuf = gl.createBuffer(), ringBuf = gl.createBuffer();
    var count = Math.max(1000, Math.round(P.density * PTS_PER_DENSITY));
    (function () {
      var A = new Float32Array(count * 4), B = new Float32Array(count * 2), rnd = mulberry32(0x51dd0c7);
      for (var i = 0; i < count; i++) {
        A[i * 4] = rnd(); A[i * 4 + 1] = rnd(); A[i * 4 + 2] = rnd(); A[i * 4 + 3] = rnd();
        B[i * 2] = rnd(); B[i * 2 + 1] = rnd();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, aBuf); gl.bufferData(gl.ARRAY_BUFFER, A, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bBuf); gl.bufferData(gl.ARRAY_BUFFER, B, gl.STATIC_DRAW);
      var ringVerts = (RING_SEG + 1) * 2, R = new Float32Array(ringVerts * 2);
      for (var j = 0; j <= RING_SEG; j++) {
        var t = j / RING_SEG;
        R[j * 4] = t; R[j * 4 + 1] = -1; R[j * 4 + 2] = t; R[j * 4 + 3] = 1;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf); gl.bufferData(gl.ARRAY_BUFFER, R, gl.STATIC_DRAW);
    })();
    var ringVerts = (RING_SEG + 1) * 2;

    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);

    var dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      var w = Math.max(1, Math.round((canvas.clientWidth || host.clientWidth || 1) * dpr));
      var h = Math.max(1, Math.round((canvas.clientHeight || host.clientHeight || 1) * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }
    resize();
    var ro = window.ResizeObserver ? new ResizeObserver(function () { resize(); if (reduce) draw(0); }) : null;
    if (ro) ro.observe(canvas);

    var pointer = { x: 0, y: 0, active: 0 };
    host.addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      pointer.active = 1;
    });
    host.addEventListener('pointerleave', function () { pointer.x = 0; pointer.y = 0; pointer.active = 0; });

    var phase = 0, last = performance.now(), raf = 0, hx = 0, hy = 0, ha = 0, visible = true;
    function draw(dt) {
      var hoverK = 1 - Math.exp(-dt / Math.max(0.05, P.hover.duration));
      hx += (pointer.x - hx) * hoverK; hy += (pointer.y - hy) * hoverK; ha += (pointer.active - ha) * hoverK;
      var hAmt = P.hover.amount / 100;
      phase = (phase + (dt * ((P.speed / 50) * (1 + ha * hAmt * 0.6))) / LIFE_AT_50) % 1;

      var w = canvas.width, h = canvas.height;
      var focal = h / (2 * Math.tan(((FOV_DEG / 2) * Math.PI) / 180));
      var radius = RADIUS_REF * (P.ring.radius / 100), fallH = radius * (P.fall.height / 100);
      var tiltRad = (P.tilt * Math.PI) / 180 + hy * hAmt * ha * ((10 * Math.PI) / 180);
      var camDist = P.distance - ha * hAmt * 150;
      var yPx = h * FRAME_SHIFT;
      var base = parseColor(P.baseColor), acc = parseColor(P.accentColor);

      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(dustProg);
      gl.uniform2f(dU.uRes, w, h); gl.uniform1f(dU.uFocal, focal); gl.uniform1f(dU.uPhase, phase);
      gl.uniform1f(dU.uRadius, radius); gl.uniform1f(dU.uRise, fallH * (P.fall.spray / 400));
      gl.uniform1f(dU.uFall, fallH); gl.uniform1f(dU.uSpinTurns, (P.fall.spin / 100) * 1.5);
      gl.uniform1f(dU.uScatter, radius * (P.field.scatter / 100) * 0.15);
      gl.uniform1f(dU.uDotWorld, DOT_REF * (P.dotSize / 100) * dpr);
      gl.uniform1f(dU.uBlurK, BLUR_REF * (P.field.blur / 100) * dpr);
      gl.uniform1f(dU.uCamDist, camDist); gl.uniform1f(dU.uTilt, tiltRad); gl.uniform1f(dU.uYPx, yPx);
      gl.uniform1f(dU.uAlpha, base[3]); gl.uniform3f(dU.uColor, base[0], base[1], base[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, aBuf); gl.enableVertexAttribArray(dA.a); gl.vertexAttribPointer(dA.a, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bBuf); gl.enableVertexAttribArray(dA.b); gl.vertexAttribPointer(dA.b, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, count);

      gl.useProgram(ringProg);
      gl.uniform2f(rU.uRes, w, h); gl.uniform1f(rU.uFocal, focal); gl.uniform1f(rU.uRadius, radius);
      gl.uniform1f(rU.uCamDist, camDist); gl.uniform1f(rU.uTilt, tiltRad); gl.uniform1f(rU.uYPx, yPx);
      gl.uniform1f(rU.uThick, P.ring.thickness * dpr); gl.uniform1f(rU.uSeg, RING_SEG);
      gl.uniform3f(rU.uColor, acc[0], acc[1], acc[2]); gl.uniform1f(rU.uAlpha, acc[3]);
      gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf); gl.enableVertexAttribArray(rA); gl.vertexAttribPointer(rA, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, ringVerts);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      draw(dt);
    }
    function start() { if (!raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    if (reduce) { phase = 0.3; draw(0.016); }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0 }).observe(host);
    } else start();

    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (visible && start()); });
    return { destroy: function () { stop(); if (ro) ro.disconnect(); canvas.remove(); } };
  }

  window.VortexDustFall = VortexDustFall;
})();

/*!
 * Vanilla-JS port of a React "LiquidGlass" component (squircle-outline
 * displacement maps + SVG filter chain + spring-physics press/hover/glow).
 * Ported for plain HTML pages with no React/build step. Chromium renders
 * true SVG-filter refraction via backdrop-filter; everything else frosts.
 *
 * Usage:
 *   const instance = LiquidGlassPill.mount(el, {
 *     material: 'clear' | 'regular', appearance: 'light' | 'dark',
 *     interactive: true, refraction, bezel, blur, tint, ...
 *   });
 *   instance.destroy();
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Environment
  // ------------------------------------------------------------------

  var detectedEngine = null;
  function detectEngine() {
    if (detectedEngine) return detectedEngine;
    if (typeof navigator === "undefined") return "webkit";
    var ua = navigator.userAgent;
    if (/Firefox\//.test(ua)) { detectedEngine = "gecko"; return detectedEngine; }
    var brands = navigator.userAgentData && navigator.userAgentData.brands;
    if (brands && brands.length) {
      var chromium = brands.some(function (b) { return /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand); });
      detectedEngine = chromium ? "chromium" : "webkit";
      return detectedEngine;
    }
    var chromium2 = /(Chrome|Chromium|Edg|SamsungBrowser)\/\d+/.test(ua) && !/Firefox\//.test(ua);
    detectedEngine = chromium2 ? "chromium" : "webkit";
    return detectedEngine;
  }

  var detectedMode = null;
  function detectMode() {
    if (detectedMode) return detectedMode;
    detectedMode = detectEngine() === "chromium" ? "refract" : "frost";
    return detectedMode;
  }

  // ------------------------------------------------------------------
  // Springs
  // ------------------------------------------------------------------

  var springs = {
    press: { duration: 0.24, bounce: 0.2 },
    release: { duration: 0.5, bounce: 0.42 },
    glow: { duration: 0.42, bounce: 0 },
    track: { duration: 0.18, bounce: 0 },
    layout: { duration: 0.4, bounce: 0.16 },
  };

  function Spring(value, options) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = 0;
    this.damping = 0;
    this.configure(options);
  }
  Spring.prototype.configure = function (o) {
    var omega = (2 * Math.PI) / o.duration;
    this.stiffness = omega * omega;
    this.damping = o.bounce >= 0
      ? (4 * Math.PI * (1 - o.bounce)) / o.duration
      : (4 * Math.PI) / (o.duration * (1 + o.bounce));
    return this;
  };
  Spring.prototype.jump = function (value) {
    this.value = this.target = value;
    this.velocity = 0;
    return this;
  };
  Object.defineProperty(Spring.prototype, "settled", {
    get: function () { return this.value === this.target && this.velocity === 0; },
  });
  Spring.prototype.step = function (dt) {
    if (this.settled || !(dt > 0)) return this;
    var omega = Math.sqrt(this.stiffness);
    var zeta = this.damping / (2 * omega);
    var x0 = this.value - this.target;
    var v0 = this.velocity;
    var x, v;
    if (zeta < 1) {
      var wd = omega * Math.sqrt(1 - zeta * zeta);
      var decay = Math.exp(-zeta * omega * dt);
      var a = x0, b = (v0 + zeta * omega * x0) / wd;
      var cos = Math.cos(wd * dt), sin = Math.sin(wd * dt);
      x = decay * (a * cos + b * sin);
      v = decay * ((b * wd - zeta * omega * a) * cos - (a * wd + zeta * omega * b) * sin);
    } else if (zeta === 1) {
      var decay2 = Math.exp(-omega * dt);
      var b2 = v0 + omega * x0;
      x = decay2 * (x0 + b2 * dt);
      v = decay2 * (b2 - omega * (x0 + b2 * dt));
    } else {
      var root = omega * Math.sqrt(zeta * zeta - 1);
      var r1 = -zeta * omega + root, r2 = -zeta * omega - root;
      var c2 = (v0 - r1 * x0) / (r2 - r1), c1 = x0 - c2;
      var e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
      x = c1 * e1 + c2 * e2;
      v = c1 * r1 * e1 + c2 * r2 * e2;
    }
    var scale = Math.max(1, Math.abs(this.target), Math.abs(x0));
    if (Math.abs(x) < 1e-4 * scale && Math.abs(v) < 1e-3 * scale) {
      this.value = this.target; this.velocity = 0;
    } else {
      this.value = this.target + x; this.velocity = v;
    }
    return this;
  };

  function rubberBand(offset, limit, coefficient) {
    coefficient = coefficient == null ? 0.55 : coefficient;
    if (limit <= 0) return 0;
    var magnitude = Math.abs(offset);
    return Math.sign(offset) * limit * (1 - 1 / ((magnitude * coefficient) / limit + 1));
  }

  var reducedQuery;
  function resolveMotion(motion) {
    if (motion === "none" || motion === "reduced") return motion;
    if (typeof matchMedia !== "function") return "full";
    reducedQuery = reducedQuery || matchMedia("(prefers-reduced-motion: reduce)");
    return reducedQuery.matches ? "reduced" : "full";
  }

  // ------------------------------------------------------------------
  // Materials / tone tables
  // ------------------------------------------------------------------

  var MATERIALS = {
    clear: {
      light: { shadowLift: 0.18, highlightRolloff: 0 },
      dark: { shadowLift: 0.15, highlightRolloff: 0.2 },
    },
    regular: {
      blur: 4.5,
      light: { fillSigma: 15, fillOpacity: 0.34, tone: [0.36, 0.67, -0.1113, 1.1031] },
      dark: { fillSigma: 14, fillOpacity: 0.65, tone: [0.105, 0.83, -0.2091, 1.0648] },
    },
  };

  var toneTableCache = {};
  function toneTable(material, appearance, nested) {
    var key = material + "|" + appearance + "|" + (nested ? "n" : "");
    if (toneTableCache[key]) return toneTableCache[key];
    var dark = appearance === "dark";
    var values;
    if (material === "regular") {
      var t = (dark ? MATERIALS.regular.dark : MATERIALS.regular.light).tone;
      var a = t[0], b = t[1], q = t[2];
      var toneWeight = dark ? 0.9 : 0.8;
      values = [];
      for (var n = 0; n <= 32; n++) {
        var v = n / 32;
        values.push(toneWeight * (a + b * v + q * v * v) + (1 - toneWeight) * v);
      }
    } else {
      var spec = dark ? MATERIALS.clear.dark : MATERIALS.clear.light;
      values = [];
      for (var n2 = 0; n2 <= 32; n2++) {
        var v2 = n2 / 32;
        var tone = v2 + spec.shadowLift * Math.pow(1 - v2, 3) - spec.highlightRolloff * Math.pow(v2, 3);
        var tinted = dark ? 0.38 * v2 + 0.2 : 0.78 * v2 + 0.26;
        var tintWeight = dark ? 0.14 : 0.06;
        var layerLight = dark && nested ? 0.08 * (1 - v2) : 0;
        values.push(Math.max(0, Math.min(1, (1 - tintWeight) * tone + tintWeight * tinted + layerLight)));
      }
    }
    var table = values.map(function (v) { return v.toFixed(5); }).join(" ");
    toneTableCache[key] = table;
    return table;
  }

  function tintChannels(tint) {
    if (!tint || !/^#[\da-f]{6}$/i.test(tint)) return undefined;
    return [
      parseInt(tint.slice(1, 3), 16) / 255,
      parseInt(tint.slice(3, 5), 16) / 255,
      parseInt(tint.slice(5, 7), 16) / 255,
    ];
  }

  // ------------------------------------------------------------------
  // Squircle outline math
  // ------------------------------------------------------------------

  var SMOOTHING = 0.8125;
  function rad(d) { return (d * Math.PI) / 180; }

  function cornerParams(radius, budget) {
    var e = radius;
    var p = (1 + SMOOTHING) * e;
    var o = 90 * (1 - SMOOTHING);
    var i = Math.sin(rad(o / 2)) * e * Math.SQRT2;
    var g = e * Math.tan(rad((90 - o) / 4));
    var c = g * Math.cos(rad(45 * SMOOTHING));
    var d = c * Math.tan(rad(45 * SMOOTHING));
    var u = (p - i - c - d) / 3;
    var a = 2 * u;
    if (p > budget) {
      var rem = budget - d - i - c;
      var m = rem / 6;
      var l = rem - m;
      u = Math.min(u, l);
      a = rem - u;
      p = budget;
    }
    return { a: a, b: u, c: c, d: d, p: p, i: i, radius: e };
  }

  function bezier(out, x0, y0, x1, y1, x2, y2, x3, y3, steps) {
    for (var s = 1; s <= steps; s++) {
      var t = s / steps, w = 1 - t;
      out.push(
        x0 * w * w * w + 3 * w * w * t * x1 + 3 * w * t * t * x2 + t * t * t * x3,
        y0 * w * w * w + 3 * w * w * t * y1 + 3 * w * t * t * y2 + t * t * t * y3
      );
    }
  }

  var outlineCache = {};
  var outlineCacheKeys = [];
  function squircleOutline(w, h, radius) {
    var key = w + "|" + h + "|" + radius;
    if (outlineCache[key]) return outlineCache[key];
    var hw = w / 2, hh = h / 2;
    var budget = Math.min(hw, hh);
    var r = Math.min(radius, budget);
    if (r < 0.5) {
      var outline0 = {
        corners: [new Float64Array(0), new Float64Array(0), new Float64Array(0), new Float64Array(0)],
        extent: 0,
        polygon: "polygon(0px 0px, " + w + "px 0px, " + w + "px " + h + "px, 0px " + h + "px)",
        width: w, height: h, radius: 0,
      };
      outlineCache[key] = outline0; outlineCacheKeys.push(key);
      return outline0;
    }
    var cp = cornerParams(r, budget);
    var a = cp.a, b = cp.b, c = cp.c, d = cp.d, p = cp.p, i = cp.i;

    var pts = [];
    var x0 = hw - p, y0 = -hh;
    bezier(pts, x0, y0, x0 + a, y0, x0 + a + b, y0, x0 + a + b + c, y0 + d, 24);
    var ax = x0 + a + b + c, ay = y0 + d;
    var chord = i * Math.SQRT2;
    var dx = i, dy = i;
    var offset = Math.sqrt(Math.max(0, r * r - (chord * chord) / 4));
    var cx = ax + dx / 2 - (dy / chord) * offset;
    var cy = ay + dy / 2 + (dx / chord) * offset;
    var angle = Math.atan2(ay - cy, ax - cx);
    var extent = 2 * Math.asin(Math.min(1, chord / (2 * r)));
    for (var s = 1; s <= 8; s++) {
      var theta = angle + (extent * s) / 8;
      pts.push(cx + r * Math.cos(theta), cy + r * Math.sin(theta));
    }
    var qx = ax + dx, qy = ay + dy;
    bezier(pts, qx, qy, qx + d, qy + c, qx + d, qy + b + c, qx + d, qy + a + b + c, 24);

    var withAnchors = [x0, y0].concat(pts, [hw, -hh + p]);
    var count = withAnchors.length / 2;
    var trPts = new Float64Array(count * 2);
    var trNormals = new Float64Array(count * 2);
    for (var k = 0; k < count; k++) {
      var px = withAnchors[2 * k], py = withAnchors[2 * k + 1];
      var pk = Math.max(0, k - 1), nk = Math.min(count - 1, k + 1);
      var prevX = withAnchors[2 * pk], prevY = withAnchors[2 * pk + 1];
      var nextX = withAnchors[2 * nk], nextY = withAnchors[2 * nk + 1];
      var tdx = nextX - prevX, tdy = nextY - prevY;
      if (k === 0) { tdx = 1; tdy = 0; }
      if (k === count - 1) { tdx = 0; tdy = 1; }
      var len = Math.hypot(tdx, tdy) || 1;
      trPts[2 * k] = px; trPts[2 * k + 1] = py;
      trNormals[2 * k] = tdy / len; trNormals[2 * k + 1] = -tdx / len;
    }

    function mirror(mx, my) {
      var run = new Float64Array(count * 4);
      var sx = mx ? -1 : 1, sy = my ? -1 : 1;
      for (var k2 = 0; k2 < count; k2++) {
        run[4 * k2] = sx * trPts[2 * k2];
        run[4 * k2 + 1] = sy * trPts[2 * k2 + 1];
        run[4 * k2 + 2] = sx * trNormals[2 * k2];
        run[4 * k2 + 3] = sy * trNormals[2 * k2 + 1];
      }
      return run;
    }
    var tr = mirror(false, false);
    var br = mirror(false, true);
    var bl = mirror(true, true);
    var tl = mirror(true, false);

    var poly = [];
    function push(run, step) {
      if (step > 0) { for (var kk = 0; kk < count; kk++) { poly.push((run[4 * kk] + hw).toFixed(2) + "px " + (run[4 * kk + 1] + hh).toFixed(2) + "px"); } }
      else { for (var kk2 = count - 1; kk2 >= 0; kk2--) { poly.push((run[4 * kk2] + hw).toFixed(2) + "px " + (run[4 * kk2 + 1] + hh).toFixed(2) + "px"); } }
    }
    push(tr, 1); push(br, -1); push(bl, 1); push(tl, -1);

    var outline = {
      corners: [tr, br, bl, tl],
      extent: p,
      polygon: "polygon(" + poly.join(", ") + ")",
      width: w, height: h, radius: r,
    };
    outlineCache[key] = outline; outlineCacheKeys.push(key);
    if (outlineCacheKeys.length > 256) delete outlineCache[outlineCacheKeys.shift()];
    return outline;
  }

  function sat(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function outlineField(px, py, outline) {
    var hw = outline.width / 2, hh = outline.height / 2, p = outline.extent;
    var ax = Math.abs(px), ay = Math.abs(py);
    var qx = ax - (hw - p), qy = ay - (hh - p);
    if (qx > 0 && qy > 0) {
      var run = px >= 0 ? (py < 0 ? outline.corners[0] : outline.corners[1]) : (py < 0 ? outline.corners[3] : outline.corners[2]);
      if (run.length === 0) {
        var dx0 = ax - hw, dy0 = ay - hh;
        var distance0 = Math.hypot(dx0, dy0);
        return { d: distance0, nx: dx0 / (distance0 || 1), ny: dy0 / (distance0 || 1) };
      }
      var best2 = Infinity, bx = 0, by = 0, bnx = 0, bny = 0;
      var n = run.length / 4;
      for (var k = 0; k < n - 1; k++) {
        var x1 = run[4 * k], y1 = run[4 * k + 1];
        var ex = run[4 * k + 4] - x1, ey = run[4 * k + 5] - y1;
        var len2 = ex * ex + ey * ey;
        var t = len2 > 1e-12 ? sat(((px - x1) * ex + (py - y1) * ey) / len2) : 0;
        var qxp = x1 + ex * t, qyp = y1 + ey * t;
        var dx = px - qxp, dy = py - qyp;
        var d2 = dx * dx + dy * dy;
        if (d2 < best2) { best2 = d2; bx = qxp; by = qyp; bnx = run[4 * k + 2]; bny = run[4 * k + 3]; }
      }
      var distance = Math.sqrt(best2);
      var delta = distance > 1e-5 ? 1 / distance : 0;
      var dxf = px - bx, dyf = py - by;
      var direction = dxf * bnx + dyf * bny >= 0 ? 1 : -1;
      return {
        d: distance * direction,
        nx: distance > 1e-5 ? (dxf * delta) * direction : bnx,
        ny: distance > 1e-5 ? (dyf * delta) * direction : bny,
      };
    }
    if (qx > qy) return { d: qx - p, nx: Math.sign(px) || 1, ny: 0 };
    return { d: qy - p, nx: 0, ny: Math.sign(py) || 1 };
  }

  function resolveRadius(value, w, h) {
    var n = parseFloat(value);
    if (!isFinite(n)) return 0;
    var r = /%\s*$/.test(value.trim()) ? (n / 100) * Math.min(w, h) : n;
    return Math.max(0, Math.min(r, w / 2, h / 2));
  }

  // ------------------------------------------------------------------
  // Canvas map rendering
  // ------------------------------------------------------------------

  var pow = Math.pow, sqrt = Math.sqrt;
  var COS_SPREAD = Math.cos(1.08);
  var COS_DIFFUSE = Math.cos(1.08 * 0.65);
  var COS_SIDE = Math.cos(0.98);

  function pixelScale(w, h) {
    return w * h > 250000 ? 0.5 : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  }

  function renderCanvases(w, h, radius, bezel, dark, tint) {
    try {
      var outline = squircleOutline(w, h, radius);
      var hw = w / 2, hh = h / 2, p = outline.extent;
      var bz = Math.max(1, Math.min(bezel, hw, hh));
      var k = pixelScale(w, h);
      var mw = Math.max(1, Math.round(w * k));
      var mh = Math.max(1, Math.round(h * k));

      var fieldCanvas = document.createElement("canvas");
      fieldCanvas.width = mw; fieldCanvas.height = mh;
      var fctx = fieldCanvas.getContext("2d");
      if (!fctx) return { field: null, overlay: null };
      var fimg = fctx.createImageData(mw, mh);

      var pad = 2;
      var bw = w + pad * 2, bh = h + pad * 2;
      var ok = pixelScale(bw, bh);
      var omw = Math.max(1, Math.round(bw * ok));
      var omh = Math.max(1, Math.round(bh * ok));
      var overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = omw; overlayCanvas.height = omh;
      var octx = overlayCanvas.getContext("2d");
      if (!octx) return { field: null, overlay: null };
      var oimg = octx.createImageData(omw, omh);

      for (var pass = 0; pass < 2; pass++) {
        var isField = pass === 0;
        var cw = isField ? w : bw, ch = isField ? h : bh;
        var scale = isField ? k : ok;
        var width = isField ? mw : omw, height = isField ? mh : omh;
        var img = isField ? fimg : oimg;
        var data = img.data;
        var aa = 1;
        for (var j = 0; j < height; j++) {
          var py = (j + 0.5) / scale - ch / 2;
          for (var i = 0; i < width; i++) {
            var px = (i + 0.5) / scale - cw / 2;
            var f = outlineField(px, py, outline);
            var d = f.d, nx = f.nx, ny = f.ny;
            var o = (j * width + i) * 4;
            if (isField) {
              var coverage = sat(0.5 - d / aa);
              if (d < -(bz + 4)) {
                data[o] = 128; data[o + 1] = 128; data[o + 2] = 128; data[o + 3] = 255;
                continue;
              }
              var depth = sat(-d / bz);
              var edge = 1 - sat(sqrt((2 - depth) * depth));
              data[o] = Math.round(255 * (0.5 - nx * edge * 0.5));
              data[o + 1] = Math.round(255 * (0.5 - ny * edge * 0.5));
              data[o + 2] = 128;
              data[o + 3] = Math.round(255 * coverage);
            } else {
              var qx = Math.abs(px) - (hw - p), qy = Math.abs(py) - (hh - p);
              if (Math.max(qx, qy) - p > pad + 6) continue;
              var coverage2 = sat(0.5 - d / aa);
              var directional = pow(sat((Math.abs(ny) - COS_SPREAD) / (1 - COS_SPREAD)), 1.25);
              var diffuseDir = pow(sat((Math.abs(ny) - COS_DIFFUSE) / (1 - COS_DIFFUSE)), 1.25);
              var stroke = sat((d + 0.9) / aa + 0.5) * sat(0.5 - d / aa);
              var specular = directional * stroke;
              specular = specular / (1 + 0.5 * (1 - specular));
              var diffuse = diffuseDir * 0.18 * pow(1 - sat(-d / 4.5), 2) * coverage2;
              var highlight = sat(specular * (dark ? 0.82 : 1) + diffuse * (dark ? 0.4 : 1));
              var adjusted = d - 0.5;
              var falloff = 1 - sat(-adjusted / 0.5);
              var ramp = (falloff > 0 ? 1 : 0) * 0.25 + falloff * 0.75;
              var outlineBand = ramp * sat((adjusted + 0.5) / aa + 0.5) * sat(-adjusted / aa + 0.5);
              var wx = sat((nx - COS_SIDE) / (1 - COS_SIDE)) * outlineBand;
              var wy = sat((-nx - COS_SIDE) / (1 - COS_SIDE)) * outlineBand;
              var shade = (wx / (1 + 0.4 * (1 - wx)) + wy / (1 + 0.4 * (1 - wy))) * (dark ? 0.6 : 0.48);
              var alpha = highlight + shade * (1 - highlight);
              if (alpha <= 0.002) continue;
              if (tint) {
                var base = highlight / Math.max(alpha, 1e-5);
                data[o] = Math.round(255 * Math.min(1, base * (0.45 + 0.55 * tint[0])));
                data[o + 1] = Math.round(255 * Math.min(1, base * (0.45 + 0.55 * tint[1])));
                data[o + 2] = Math.round(255 * Math.min(1, base * (0.45 + 0.55 * tint[2])));
                data[o + 3] = Math.round(255 * alpha);
              } else {
                var light = ((dark ? 0.82 : 1) * highlight) / Math.max(alpha, 1e-5);
                data[o] = data[o + 1] = data[o + 2] = Math.round(255 * Math.min(1, light));
                data[o + 3] = Math.round(255 * alpha);
              }
            }
          }
        }
        (isField ? fctx : octx).putImageData(img, 0, 0);
      }
      return { field: fieldCanvas, overlay: overlayCanvas };
    } catch (e) {
      return { field: null, overlay: null };
    }
  }

  // ------------------------------------------------------------------
  // Capsule baking
  // ------------------------------------------------------------------

  var bakeCache = {};
  var bakeCacheKeys = [];
  function capsuleShape(w, h, radius) {
    return radius >= Math.min(w, h) / 2 - 0.75 && w >= h * 2;
  }

  function slicedURLs(baked, w, h) {
    var cap = h / 2;
    function bake(source, sourcePad, destPad) {
      var cw = w + destPad * 2, ch = h + destPad * 2;
      var scale = pixelScale(cw, ch);
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cw * scale));
      canvas.height = Math.max(1, Math.round(ch * scale));
      var ctx = canvas.getContext("2d");
      var sh = source.height;
      var sk = sh / (h + sourcePad * 2);
      var startX = sourcePad * sk;
      var capPx = cap * sk;
      var destCap = cap * scale;
      var startDest = destPad * scale;
      var capSrc = startX + capPx;
      var capDest = Math.round(startDest + destCap);
      var midDest = Math.max(1, canvas.width - 2 * capDest);
      ctx.drawImage(source, 0, 0, capSrc, sh, 0, 0, capDest, canvas.height);
      ctx.drawImage(source, capSrc, 0, Math.max(1, source.width - 2 * capSrc), sh, capDest, 0, midDest, canvas.height);
      ctx.drawImage(source, source.width - capSrc, 0, capSrc, sh, canvas.width - capDest, 0, capDest, canvas.height);
      return canvas;
    }
    return {
      field: baked.field ? bake(baked.field, 0, 0).toDataURL("image/png") : "",
      overlay: baked.overlay ? bake(baked.overlay, 2, 2).toDataURL("image/png") : "",
    };
  }

  function capsuleBake(h, radius, o) {
    var key = "bake|h" + h + "|r" + radius + "|" + (o.dark ? "d" : "l") + "|" + (o.tint || "");
    var baked = bakeCache[key];
    if (!baked) {
      baked = renderCanvases(h * 3, h, radius, o.bezel, o.dark, o.tint);
      bakeCache[key] = baked; bakeCacheKeys.push(key);
      if (bakeCacheKeys.length > 16) delete bakeCache[bakeCacheKeys.shift()];
    }
    return baked;
  }

  var fieldCache = {}, fieldCacheKeys = [];
  var overlayCache = {}, overlayCacheKeys = [];
  var CACHE_LIMIT = 64;

  function remember(cache, keys, key, make) {
    if (cache[key]) return cache[key];
    var value = make();
    if (!value) return value;
    cache[key] = value; keys.push(key);
    if (keys.length > CACHE_LIMIT) delete cache[keys.shift()];
    return value;
  }

  function fieldURL(w, h, radius, o) {
    return remember(fieldCache, fieldCacheKeys, w + "x" + h + "r" + radius + "b" + o.bezel, function () {
      if (capsuleShape(w, h, radius)) {
        var baked = capsuleBake(h, radius, o);
        if (baked.field) return slicedURLs(baked, w, h).field;
      }
      var r = renderCanvases(w, h, radius, o.bezel, o.dark, o.tint);
      return (r.field && r.field.toDataURL("image/png")) || "";
    });
  }

  function overlayURL(w, h, radius, o) {
    return remember(overlayCache, overlayCacheKeys, w + "x" + h + "r" + radius + (o.dark ? "d" : "l") + (o.tint || ""), function () {
      if (capsuleShape(w, h, radius)) {
        var baked = capsuleBake(h, radius, o);
        if (baked.overlay) return slicedURLs(baked, w, h).overlay;
      }
      var r = renderCanvases(w, h, radius, o.bezel, o.dark, o.tint);
      return (r.overlay && r.overlay.toDataURL("image/png")) || "";
    });
  }

  // ------------------------------------------------------------------
  // Shared SVG filter host
  // ------------------------------------------------------------------

  var defsHost = null;
  var filterRefs = {};

  function host() {
    if (defsHost) return defsHost;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "fixed";
    svg.style.width = "0";
    svg.style.height = "0";
    svg.style.overflow = "hidden";
    svg.style.pointerEvents = "none";
    document.body.appendChild(svg);
    defsHost = svg;
    return svg;
  }

  function acquireFilter(id, markup) {
    var existing = filterRefs[id];
    if (existing) { existing.count++; return; }
    var filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.innerHTML = markup;
    host().appendChild(filter);
    filterRefs[id] = { el: filter, count: 1 };
  }

  function releaseFilter(id) {
    var entry = filterRefs[id];
    if (!entry) return;
    entry.count--;
    if (entry.count <= 0) { entry.el.remove(); delete filterRefs[id]; }
  }

  function filterMarkup(opts) {
    var w = opts.w, h = opts.h, field = opts.field, material = opts.material, appearance = opts.appearance,
      refraction = opts.refraction, dispersion = opts.dispersion, tint = opts.tint, nested = opts.nested;
    var dark = appearance === "dark";
    var spec = material === "regular" ? (dark ? MATERIALS.regular.dark : MATERIALS.regular.light) : null;
    var parts = ['<feImage href="' + field + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="field"/>'];
    var base = "SourceGraphic";
    if (spec) {
      parts.push(
        '<feGaussianBlur in="SourceGraphic" stdDeviation="' + MATERIALS.regular.blur + '" result="frost"/>',
        '<feGaussianBlur in="SourceGraphic" stdDeviation="' + spec.fillSigma + '" result="fill"/>',
        '<feBlend in="frost" in2="fill" mode="' + (dark ? "darken" : "lighten") + '" result="blend"/>',
        '<feComposite in="blend" in2="frost" operator="arithmetic" k2="' + spec.fillOpacity + '" k3="' + (1 - spec.fillOpacity) + '" result="mix"/>'
      );
      base = "mix";
    }
    if (dispersion > 0) {
      var s = refraction * 2;
      parts.push(
        '<feDisplacementMap in="' + base + '" in2="field" scale="' + (s * (1 + dispersion)) + '" xChannelSelector="R" yChannelSelector="G" result="dr"/>',
        '<feDisplacementMap in="' + base + '" in2="field" scale="' + s + '" xChannelSelector="R" yChannelSelector="G" result="dg"/>',
        '<feDisplacementMap in="' + base + '" in2="field" scale="' + (s * (1 - dispersion)) + '" xChannelSelector="R" yChannelSelector="G" result="db"/>',
        '<feColorMatrix in="dr" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>',
        '<feColorMatrix in="dg" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>',
        '<feColorMatrix in="db" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>',
        '<feBlend in="r" in2="g" mode="screen" result="rg"/>',
        '<feBlend in="rg" in2="b" mode="screen" result="refracted"/>'
      );
    } else {
      parts.push('<feDisplacementMap in="' + base + '" in2="field" scale="' + (refraction * 2) + '" xChannelSelector="R" yChannelSelector="G" result="refracted"/>');
    }
    var table = toneTable(material, appearance, nested);
    parts.push('<feComponentTransfer in="refracted" result="tone"><feFuncR type="table" tableValues="' + table + '"/><feFuncG type="table" tableValues="' + table + '"/><feFuncB type="table" tableValues="' + table + '"/></feComponentTransfer>');
    var color = "tone";
    if (material === "regular") {
      parts.push('<feColorMatrix in="tone" type="saturate" values="' + spec.tone[3] + '" result="color"/>');
      color = "color";
    }
    if (tint) {
      var body = material === "regular" ? 0.78 : 0.68;
      var rest = 1 - body;
      parts.push(
        '<feColorMatrix in="' + color + '" type="saturate" values="0" result="luminance"/>',
        '<feComponentTransfer in="luminance" result="tinted">',
        '<feFuncR type="linear" slope="' + (tint[0] * rest) + '" intercept="' + (tint[0] * body) + '"/>',
        '<feFuncG type="linear" slope="' + (tint[1] * rest) + '" intercept="' + (tint[1] * body) + '"/>',
        '<feFuncB type="linear" slope="' + (tint[2] * rest) + '" intercept="' + (tint[2] * body) + '"/>',
        '<feFuncA type="linear" slope="' + rest + '" intercept="' + body + '"/>',
        "</feComponentTransfer>"
      );
      color = "tinted";
    }
    parts.push('<feComposite in="' + color + '" in2="field" operator="in"/>');
    return parts.join("");
  }

  // ------------------------------------------------------------------
  // Interaction (press / hover / drag spring physics + pointer glow)
  // ------------------------------------------------------------------

  var claimed = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  var HOVER_QUERY = "(hover: hover) and (pointer: fine)";

  function isDisabled(element) {
    return element.matches(":disabled, [data-disabled], [aria-disabled='true']");
  }

  function attachInteraction(element, motionFn) {
    var view = element.ownerDocument.defaultView;
    var saved = { translate: element.style.translate, scale: element.style.scale };
    var tx = new Spring(0, springs.track);
    var ty = new Spring(0, springs.track);
    var press = new Spring(0, springs.press);
    var glow = new Spring(0, springs.glow);
    var pointer = null;
    var keyboard = false, hovering = false, previous = 0, written = false;
    var glowX = 0, glowY = 0;
    var raf = 0, awake = false;

    function writeStyle(name, value) {
      if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
    }
    function size() { return { width: element.offsetWidth || 1, height: element.offsetHeight || 1 }; }
    function layout() {
      var rect = element.getBoundingClientRect();
      var s = size();
      return { cx: rect.left + rect.width / 2 - tx.value, cy: rect.top + rect.height / 2 - ty.value, width: s.width, height: s.height, rect: rect };
    }
    function light(x, y) {
      var l = layout();
      glowX = ((x - l.rect.left) * l.width) / (l.rect.width || 1);
      glowY = ((y - l.rect.top) * l.height) / (l.rect.height || 1);
    }
    function set(spring, target, options) { spring.configure(options).target = target; }

    function move(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      pointer.clientX = event.clientX; pointer.clientY = event.clientY;
    }
    function release(event) {
      if (event && (!pointer || event.pointerId !== pointer.id)) return;
      pointer = null;
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", release);
      view.removeEventListener("pointercancel", release);
      set(press, 0, springs.release);
      set(tx, 0, springs.release);
      set(ty, 0, springs.release);
      set(glow, hovering ? 0.35 : 0, springs.glow);
    }
    function down(event) {
      if ((claimed && claimed.has(event)) || event.button !== 0 || isDisabled(element)) return;
      if (claimed) claimed.add(event);
      var l = layout();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, cx: l.cx, cy: l.cy, clientX: event.clientX, clientY: event.clientY };
      light(event.clientX, event.clientY);
      set(press, 1, springs.press);
      set(glow, 1, springs.press);
      var s = size();
      var follow = { duration: springs.track.duration + 0.0005 * Math.max(s.width, s.height), bounce: 0 };
      set(tx, 0, follow);
      set(ty, 0, follow);
      view.addEventListener("pointermove", move);
      view.addEventListener("pointerup", release);
      view.addEventListener("pointercancel", release);
    }
    function hover(event) {
      if (event.pointerType === "touch" || !view.matchMedia(HOVER_QUERY).matches) return;
      hovering = event.type !== "pointerleave";
      if (hovering) light(event.clientX, event.clientY);
      if (!pointer && !keyboard) set(glow, hovering ? 0.35 : 0, springs.glow);
    }
    function key(event) {
      if (event.key !== " " && event.key !== "Enter") return;
      if (event.type === "keydown") {
        if (event.repeat || (claimed && claimed.has(event)) || isDisabled(element) || pointer) return;
        if (claimed) claimed.add(event);
        keyboard = true;
        var s = size();
        glowX = s.width / 2; glowY = s.height / 2;
        set(press, 1, springs.press);
        set(glow, 1, springs.press);
      } else if (keyboard) {
        keyboard = false;
        set(press, 0, springs.release);
        set(glow, hovering ? 0.35 : 0, springs.glow);
      }
    }
    function drag(event) {
      if (!pointer) return;
      var origin = event.target;
      var source = origin && origin.nodeType === 1 ? origin : (origin && origin.parentElement);
      if (!(source && source.closest('[draggable="true"]'))) event.preventDefault();
    }
    function blur() {
      if (keyboard) { keyboard = false; set(press, 0, springs.release); set(glow, 0, springs.glow); }
    }

    function frame(now) {
      var dt = previous ? Math.max(0, (now - previous) / 1000) : 1 / 60;
      previous = now;
      var level = motionFn();
      var s = size();
      var width = s.width, height = s.height;
      if (pointer) {
        var l = layout();
        var small = Math.max(width, height) <= 72;
        var ox = small
          ? pointer.clientX - pointer.x - (l.cx - pointer.cx)
          : pointer.clientX - Math.max(l.cx - width / 2, Math.min(l.cx + width / 2, pointer.clientX));
        var oy = small
          ? pointer.clientY - pointer.y - (l.cy - pointer.cy)
          : pointer.clientY - Math.max(l.cy - height / 2, Math.min(l.cy + height / 2, pointer.clientY));
        var limit = small ? 4 + 0.15 * Math.max(width, height) : Math.min(10, 3 + 0.04 * Math.max(width, height));
        tx.target = rubberBand(ox, limit);
        ty.target = rubberBand(oy, limit);
        light(pointer.clientX, pointer.clientY);
      }
      [tx, ty, press, glow].forEach(function (spring) { spring.step(dt); });
      var elastic = level === "full";
      var grow = elastic ? Math.min(0.16, 8 / Math.max(width, height)) * press.value : 0;
      var cap = Math.max(width, height) <= 72 ? 0.2 : 0.12;
      var ex = elastic ? Math.min(cap, 0.5 * Math.abs(tx.value) / width + 0.00007 * Math.abs(tx.velocity)) : 0;
      var ey = elastic ? Math.min(cap, 0.5 * Math.abs(ty.value) / height + 0.00007 * Math.abs(ty.velocity)) : 0;
      var sx = ((1 + grow) * (1 + ex)) / sqrt(1 + ey);
      var sy = ((1 + grow) * (1 + ey)) / sqrt(1 + ex);
      var moved = elastic && (Math.abs(tx.value) > 0.01 || Math.abs(ty.value) > 0.01);
      var scaled = Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4;
      var lit = glow.value > 0.001;
      if (moved || scaled || lit || pointer || keyboard) {
        written = true;
        writeStyle("translate", moved ? tx.value.toFixed(3) + "px " + ty.value.toFixed(3) + "px" : saved.translate);
        writeStyle("scale", scaled ? sx.toFixed(5) + " " + sy.toFixed(5) : saved.scale);
        writeStyle("--lg-glow", lit ? glow.value.toFixed(4) : "0");
        writeStyle("--lg-glow-x", glowX.toFixed(2) + "px");
        writeStyle("--lg-glow-y", glowY.toFixed(2) + "px");
        writeStyle("--lg-glow-size", Math.max(36, Math.min(180, Math.max(width, height) * 0.9)).toFixed(1) + "px");
        if (pointer || keyboard) { if (element.dataset.glassPressed !== "") element.dataset.glassPressed = ""; }
        else if (element.dataset.glassPressed !== undefined) delete element.dataset.glassPressed;
      } else if (written) {
        written = false;
        element.style.translate = saved.translate;
        element.style.scale = saved.scale;
        ["--lg-glow", "--lg-glow-x", "--lg-glow-y", "--lg-glow-size"].forEach(function (n) { element.style.removeProperty(n); });
        delete element.dataset.glassPressed;
      }
      var active = Boolean(pointer) || [tx, ty, press, glow].some(function (spring) { return !spring.settled; });
      if (!active) previous = 0;
      return active;
    }

    function loop(now) {
      var active = frame(now);
      if (active) raf = view.requestAnimationFrame(loop);
      else awake = false;
    }
    function wake() { if (!awake) { awake = true; raf = view.requestAnimationFrame(loop); } }

    element.addEventListener("pointerdown", down);
    element.addEventListener("dragstart", drag);
    element.addEventListener("pointerenter", hover);
    element.addEventListener("pointermove", hover);
    element.addEventListener("pointerleave", hover);
    element.addEventListener("keydown", key);
    element.addEventListener("keyup", key);
    element.addEventListener("focusout", blur);
    element.addEventListener("pointerdown", wake);
    element.addEventListener("pointerenter", wake);
    element.addEventListener("keydown", wake);

    return {
      dispose: function () {
        release();
        view.cancelAnimationFrame(raf);
        awake = false;
        element.removeEventListener("pointerdown", down);
        element.removeEventListener("dragstart", drag);
        element.removeEventListener("pointerenter", hover);
        element.removeEventListener("pointermove", hover);
        element.removeEventListener("pointerleave", hover);
        element.removeEventListener("keydown", key);
        element.removeEventListener("keyup", key);
        element.removeEventListener("focusout", blur);
        element.removeEventListener("pointerdown", wake);
        element.removeEventListener("pointerenter", wake);
        element.removeEventListener("keydown", wake);
        element.style.translate = saved.translate;
        element.style.scale = saved.scale;
        ["--lg-glow", "--lg-glow-x", "--lg-glow-y", "--lg-glow-size"].forEach(function (n) { element.style.removeProperty(n); });
        delete element.dataset.glassPressed;
      },
    };
  }

  // ------------------------------------------------------------------
  // Mount — imperative equivalent of the React hook
  // ------------------------------------------------------------------

  function mount(element, options) {
    options = options || {};
    var material = options.material || "clear";
    var appearance = options.appearance || "light";
    var dark = appearance === "dark";
    var interactive = !!options.interactive;
    var blur = options.blur != null ? options.blur : 1;
    var saturation = options.saturation != null ? options.saturation : 1.2;
    var brightness = options.brightness != null ? options.brightness : 1.05;
    var dispersion = options.dispersion || 0;
    var fallbackBlurOpt = options.fallbackBlur != null ? options.fallbackBlur : 10;
    var requestedMode = options.mode || "auto";
    var tint = options.tint;
    var tintRGB = tintChannels(tint);
    var refractionOpt = options.refraction;
    var bezelOpt = options.bezel;
    var motionOpt = options.motion;

    var cs = getComputedStyle(element);
    if (cs.position === "static") element.style.position = "relative";
    if (!element.style.isolation) element.style.isolation = "isolate";
    element.style.setProperty("--lg-spring", "cubic-bezier(0.175, 0.885, 0.32, 1.275)");

    var mode = requestedMode === "auto" ? detectMode() : requestedMode;
    var nested = !!(element.parentElement && element.parentElement.closest("[data-liquid-glass]"));
    var amount = refractionOpt != null ? refractionOpt : (nested ? 8 : 18);

    var lens = document.createElement("span");
    lens.setAttribute("aria-hidden", "true");
    lens.style.cssText = "position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;";
    element.insertBefore(lens, element.firstChild);

    var overlay = null, fillEl = null, glowEl = null, heldFilter = null;

    function ensureOverlay() {
      if (overlay) return overlay;
      overlay = document.createElement("span");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = "position:absolute;inset:-2px;z-index:-1;pointer-events:none;background-size:100% 100%;background-repeat:no-repeat;";
      element.insertBefore(overlay, lens.nextSibling);
      return overlay;
    }
    function ensureFill() {
      if (fillEl) return fillEl;
      fillEl = document.createElement("span");
      fillEl.setAttribute("aria-hidden", "true");
      fillEl.style.cssText = "position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;";
      element.insertBefore(fillEl, (overlay || lens).nextSibling);
      return fillEl;
    }
    function removeFill() { if (fillEl) { fillEl.remove(); fillEl = null; } }

    function build(w, h, radius) {
      var bz = Math.round(bezelOpt != null ? bezelOpt : Math.min(32, Math.min(w, h) / 2));
      var planes = { bezel: bz, dark: dark, tint: tintRGB };
      var outline = squircleOutline(w, h, radius);
      lens.style.clipPath = outline.polygon;
      if (overlay) overlay.style.clipPath = "";

      var refracting = false;
      if (mode === "refract") {
        var field = fieldURL(w, h, radius, planes);
        if (field) {
          var filterId = ("lgf" + w + "x" + h + "r" + radius + "b" + bz + "f" + Math.round(amount * 10) + (dark ? "d" : "l") + (material === "regular" ? "R" : "C") + (tint || "") + "p" + Math.round(dispersion * 100) + (nested ? "n" : "")).replace(/[^a-zA-Z0-9-]/g, "");
          var markup = filterMarkup({ w: w, h: h, field: field, material: material, appearance: appearance, refraction: amount, dispersion: dispersion, tint: tintRGB, nested: nested });
          if (heldFilter && heldFilter !== filterId) releaseFilter(heldFilter);
          if (heldFilter !== filterId) acquireFilter(filterId, markup);
          heldFilter = filterId;
          var backdrop = "url(#" + filterId + ")" + (blur > 0 ? " blur(" + blur + "px)" : "");
          lens.style.backdropFilter = backdrop;
          lens.style.webkitBackdropFilter = backdrop;
          refracting = true;
        }
      }
      if (!refracting) {
        if (heldFilter) { releaseFilter(heldFilter); heldFilter = null; }
        var cssTone = "saturate(" + saturation + ") brightness(" + (dark ? brightness * 0.88 : brightness) + ")";
        var engine = detectEngine();
        var engineBlur = engine === "webkit" ? Math.min(fallbackBlurOpt, 16) : fallbackBlurOpt;
        var fallback = material === "regular"
          ? "blur(" + Math.max(2, engineBlur * 0.5) + "px) " + cssTone
          : "blur(" + engineBlur + "px) " + cssTone;
        lens.style.backdropFilter = fallback;
        lens.style.webkitBackdropFilter = fallback;
      }

      element.setAttribute("data-liquid-glass", refracting ? "refract" : "frost");
      ensureOverlay().style.backgroundImage = "url(" + overlayURL(w, h, radius, planes) + ")";

      var spec = material === "regular" ? (dark ? MATERIALS.regular.dark : MATERIALS.regular.light) : null;
      var needFill = (!refracting && (material === "regular" || dark)) || (refracting && material === "clear" && dark);
      if (!needFill) { removeFill(); return; }
      var fill = ensureFill();
      if (!refracting && material === "regular") {
        fill.style.backgroundColor = tintRGB
          ? "rgb(" + tintRGB.map(function (c) { return Math.round(c * 255); }).join(" ") + " / " + spec.fillOpacity + ")"
          : dark ? "rgb(16 16 18 / " + spec.fillOpacity + ")" : "rgb(255 255 255 / " + spec.fillOpacity + ")";
      } else if (!refracting && dark) {
        fill.style.backgroundColor = "rgb(8 8 10 / 0.16)";
      } else if (refracting && material === "clear" && dark) {
        fill.style.backgroundColor = "rgb(8 8 10 / 0.08)";
      }
    }

    var raf = 0;
    function measure() {
      raf = 0;
      var w = Math.round(element.offsetWidth);
      var h = Math.round(element.offsetHeight);
      if (w < 2 || h < 2) return;
      var radius = Math.round(resolveRadius(getComputedStyle(element).borderTopLeftRadius, w, h));
      build(w, h, radius);
    }
    var ro = new ResizeObserver(function () { if (!raf) raf = requestAnimationFrame(measure); });
    measure();
    ro.observe(element);

    var interaction = null;
    if (interactive) {
      glowEl = document.createElement("span");
      glowEl.setAttribute("aria-hidden", "true");
      glowEl.style.cssText = "position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;";
      glowEl.style.setProperty("--lg-glow-color", dark ? "rgb(255 255 255 / 0.16)" : "rgb(255 255 255 / 0.3)");
      glowEl.style.backgroundImage = "radial-gradient(var(--lg-glow-size, 64px) circle at var(--lg-glow-x, 50%) var(--lg-glow-y, 50%), color-mix(in srgb, var(--lg-glow-color) calc(var(--lg-glow, 0) * 100%), transparent), transparent 65%)";
      element.appendChild(glowEl);
      interaction = attachInteraction(element, function () { return resolveMotion(motionOpt); });
    }

    return {
      destroy: function () {
        ro.disconnect();
        cancelAnimationFrame(raf);
        if (heldFilter) releaseFilter(heldFilter);
        if (interaction) interaction.dispose();
        [lens, overlay, fillEl, glowEl].forEach(function (n) { if (n && n.parentNode) n.remove(); });
        element.removeAttribute("data-liquid-glass");
      },
    };
  }

  window.LiquidGlassPill = { mount: mount, detectEngine: detectEngine, detectMode: detectMode };
})();

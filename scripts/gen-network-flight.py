#!/usr/bin/env python3
"""Generate the hero flythrough frame sequence: a camera flying through a
curving wireframe data-corridor — glowing octagonal rings receding into the
distance, connected into tunnel walls, with drifting light nodes inside —
that starts sparse/dark and becomes dense, glowing, and gold as the journey
progresses (Invisible -> System -> ... -> Scale). A few flat HUD data-readout
panels (pipeline chart, systems meter, lead counter) fade in for the back
half. Fully procedural, no stock/AI assets.

Usage: python3 scripts/gen-network-flight.py [--frames N] [--test]
Writes assets/frames/f####.jpg (1920x1080) and assets/frames-m/f####.webp
(576x1024), matching the frameCount/frameDir config already wired into
mountScrollWorld in index.html.
"""
import argparse, math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

random.seed(7)
np.random.seed(7)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DESK = os.path.join(ROOT, "assets/frames")
OUT_MOB = os.path.join(ROOT, "assets/frames-m")

DESK_W, DESK_H = 1920, 1080
MOB_W, MOB_H = 576, 1024

NEAR = 30.0
FAR = 1500.0
RING_SPACING = 48.0
RING_SIDES = 8
TOTAL_TRAVEL = 4300.0
N_RINGS = int(TOTAL_TRAVEL / RING_SPACING) + int(FAR / RING_SPACING) + 6

N_PARTICLES = 170
LOOP = FAR - NEAR   # particle recycle range, independent of the ring index space

COOL = np.array([61, 169, 252])    # #3da9fc — Invisible / The System
COOL2 = np.array([104, 208, 255])  # #68d0ff — Paid Traffic
WARM = np.array([217, 178, 106])   # #d9b26a — Lender-Ready / Funded / Scale

FONT_PATH = "/System/Library/Fonts/Menlo.ttc"


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


# ---- the corridor's centerline: a lazy lissajous curve so the tunnel banks
# and winds instead of being a boring straight tube. k is "rings of distance".
def path_x(k):
    return 95 * math.sin(k * 0.052) + 40 * math.sin(k * 0.021 + 1.3)


def path_y(k):
    return 70 * math.sin(k * 0.037 + 0.6)


def ring_radius(k):
    return 130 + 22 * math.sin(k * 0.09 + 2.0)


def build_rings():
    rings = []
    for k in range(N_RINGS):
        rings.append({"k": k, "z0": k * RING_SPACING, "r": ring_radius(k),
                      "cx": path_x(k), "cy": path_y(k)})
    return rings


def build_particles():
    ps = []
    for _ in range(N_PARTICLES):
        ang = random.uniform(0, 2 * math.pi)
        rad = random.uniform(0.15, 0.92)
        ps.append({
            "ang": ang, "rad": rad,
            "z0": random.uniform(0, LOOP),
            "activation": random.uniform(0, 0.8),
            "size_bias": random.uniform(0.7, 1.5),
            "warm_bias": random.uniform(-0.15, 0.15),
        })
    return ps


def make_glow_sprite(radius, color):
    size = max(3, radius * 2 + 1)
    ys, xs = np.mgrid[0:size, 0:size]
    c = size / 2.0
    dist = np.sqrt((xs - c) ** 2 + (ys - c) ** 2) / (size / 2.0)
    alpha = np.clip(1 - dist, 0, 1) ** 2.3
    alpha = (alpha * 255).astype("uint8")
    img = Image.new("RGBA", (size, size), (int(color[0]), int(color[1]), int(color[2]), 0))
    img.putalpha(Image.fromarray(alpha, "L"))
    return img


def glow_bucket_sizes():
    return [3, 5, 8, 12, 18, 26, 36]


def make_bg(w, h, color):
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h * 0.46
    maxd = math.hypot(max(cx, w - cx), max(cy, h - cy))
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / maxd
    dist = np.clip(dist, 0, 1)
    base = np.array([5, 7, 12])
    core = np.clip(color * 0.22, 0, 40)
    t = (1 - dist) ** 1.6
    rgb = base[None, None, :] + (core[None, None, :] - base[None, None, :]) * t[:, :, None]
    return Image.fromarray(rgb.astype("uint8"), "RGB")


def make_vignette(w, h):
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h / 2.0
    maxd = math.hypot(cx, cy)
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / maxd
    a = np.clip((dist - 0.55) / 0.45, 0, 1) ** 1.4 * 160
    rgba = np.zeros((h, w, 4), dtype="uint8")
    rgba[:, :, 3] = a.astype("uint8")
    return Image.fromarray(rgba, "RGBA")


PIPELINE_WALK = None


def get_pipeline_walk(n=48):
    global PIPELINE_WALK
    if PIPELINE_WALK is None:
        rnd = random.Random(42)
        vals, v = [], 0.15
        for i in range(n):
            v += rnd.uniform(0.01, 0.05) + (0.02 if i % 7 == 0 else 0)
            vals.append(min(1.0, v))
        PIPELINE_WALK = vals
    return PIPELINE_WALK


def draw_hud(draw, w, h, t, accent, font_sm, font_lg):
    ac = tuple(int(c) for c in accent) + (255,)
    reveal = smoothstep((t - 0.40) / 0.5)
    if reveal > 0.02:
        pw, ph = int(w * 0.17), int(h * 0.15)
        px0, py0 = w - pw - int(w * 0.035), h - ph - int(h * 0.06)
        panel_a = int(140 * reveal)
        draw.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=14,
                                fill=(8, 10, 16, panel_a), outline=ac[:3] + (int(90 * reveal),), width=1)
        draw.text((px0 + 16, py0 + 12), "PIPELINE", font=font_sm, fill=ac[:3] + (int(200 * reveal),))
        walk = get_pipeline_walk()
        n_show = max(2, int(len(walk) * reveal))
        pad = 16
        cx0, cy0 = px0 + pad, py0 + ph - pad
        cw, ch = pw - pad * 2, ph - pad * 2 - 14
        pts = []
        for i in range(n_show):
            xx = cx0 + cw * (i / (len(walk) - 1))
            yy = cy0 - ch * walk[i]
            pts.append((xx, yy))
        if len(pts) >= 2:
            draw.line(pts, fill=ac[:3] + (int(210 * reveal),), width=2)
            draw.ellipse([pts[-1][0] - 3, pts[-1][1] - 3, pts[-1][0] + 3, pts[-1][1] + 3],
                         fill=ac[:3] + (int(255 * reveal),))
    reveal2 = smoothstep((t - 0.50) / 0.4)
    if reveal2 > 0.02:
        bx, by = int(w * 0.045), int(h * 0.16)
        draw.text((bx, by - 22), "SYSTEMS ONLINE", font=font_sm, fill=ac[:3] + (int(190 * reveal2),))
        for i in range(4):
            bw = int(w * 0.11)
            yy = by + i * 14
            level = 0.4 + 0.5 * (0.5 + 0.5 * math.sin(t * 14 + i * 1.7))
            draw.rounded_rectangle([bx, yy, bx + bw, yy + 5], radius=2, fill=(255, 255, 255, int(28 * reveal2)))
            draw.rounded_rectangle([bx, yy, bx + bw * level, yy + 5], radius=2, fill=ac[:3] + (int(220 * reveal2),))
    reveal3 = smoothstep((t - 0.58) / 0.35)
    if reveal3 > 0.02:
        val = int(4200 * smoothstep((t - 0.58) / 0.42))
        cx, cy = int(w * 0.80), int(h * 0.60)
        cw2, ch2 = int(w * 0.15), int(h * 0.10)
        draw.rounded_rectangle([cx, cy, cx + cw2, cy + ch2], radius=14,
                                fill=(8, 10, 16, int(140 * reveal3)), outline=ac[:3] + (int(90 * reveal3),), width=1)
        draw.text((cx + 16, cy + 10), "LEADS CAPTURED", font=font_sm, fill=ac[:3] + (int(180 * reveal3),))
        draw.text((cx + 16, cy + 26), f"{val:,}", font=font_lg, fill=(247, 250, 254, int(240 * reveal3)))


def ring_points(ring, sides=RING_SIDES):
    pts = []
    for s in range(sides):
        a = (s / sides) * 2 * math.pi
        pts.append((ring["cx"] + ring["r"] * math.cos(a), ring["cy"] + ring["r"] * math.sin(a)))
    return pts


def project(x, y, z, w, h, focal, cam_x, cam_y):
    sx = w / 2.0 + (x - cam_x) * focal / z
    sy = h * 0.46 + (y - cam_y) * focal / z
    return sx, sy


def render_frame(t, w, h, rings, particles, sprite_cache, font_sm, font_lg):
    focal = max(w, h) * 0.30
    S = (t ** 1.15) * TOTAL_TRAVEL
    st = smoothstep(t)
    color = COOL + (WARM - COOL) * st
    if st < 0.6:
        color = color + (COOL2 - COOL) * (0.4 * math.sin(t * 6.0) * 0.5 + 0.5) * 0.15
    cc = tuple(int(c) for c in color)

    cam_k = S / RING_SPACING
    cam_x, cam_y = path_x(cam_k), path_y(cam_k)

    img = make_bg(w, h, color)
    struct_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(struct_layer)

    # how "built out" the corridor is: fewer wall edges + dimmer early on,
    # a fully-braced glowing tube by the back half.
    edges_on = 2 + int(round(lerp(0, RING_SIDES - 2, smoothstep((t - 0.05) / 0.9))))
    wall_alpha_max = lerp(40, 190, st)
    ring_alpha_max = lerp(70, 230, st)

    visible = []
    for ring in rings:
        z = ring["z0"] - S + NEAR
        if z < NEAR or z > FAR:
            continue
        pts = [project(px, py, z, w, h, focal, cam_x, cam_y) for px, py in ring_points(ring)]
        depth_f = focal / z
        fade = smoothstep(1 - (z - NEAR) / (FAR - NEAR))
        visible.append((ring["k"], z, pts, depth_f, fade))

    visible.sort(key=lambda v: -v[1])   # far to near, so near rings draw on top

    # ring outlines
    for k, z, pts, depth_f, fade in visible:
        a = int(ring_alpha_max * fade)
        if a > 3:
            sd.line(pts + [pts[0]], fill=cc + (a,), width=max(1, int(depth_f * 2.2)))

    # longitudinal wall edges between consecutive rings
    by_k = {v[0]: v for v in visible}
    for k, z, pts, depth_f, fade in visible:
        nxt = by_k.get(k + 1)
        if not nxt:
            continue
        npts = nxt[2]
        nfade = nxt[4]
        a = int(wall_alpha_max * min(fade, nfade))
        if a <= 3:
            continue
        for s in range(min(edges_on, len(pts))):
            sd.line([pts[s], npts[s]], fill=cc + (a,), width=1)

    img = Image.alpha_composite(img.convert("RGBA"), struct_layer)

    # ---- drifting light nodes inside the corridor ----
    glow_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    active = []
    for p in particles:
        if t < p["activation"]:
            continue
        d = (p["z0"] - S) % LOOP
        z = NEAR + d
        k = z / RING_SPACING + cam_k
        r = ring_radius(k) * p["rad"]
        wx = path_x(k) + r * math.cos(p["ang"])
        wy = path_y(k) + r * math.sin(p["ang"])
        sx, sy = project(wx, wy, z, w, h, focal, cam_x, cam_y)
        if sx < -60 or sx > w + 60 or sy < -60 or sy > h + 60:
            continue
        depth_f = focal / z
        size = max(1.5, min(34, p["size_bias"] * depth_f * 1.6))
        bright = max(0.15, min(1.0, depth_f * 0.8))
        active.append((sx, sy, size, bright, p))

    buckets = glow_bucket_sizes()
    for sx, sy, size, bright, p in active:
        b = min(buckets, key=lambda r: abs(r - size))
        wc = color + (WARM - color) * max(0, p["warm_bias"]) * 2
        wc = np.clip(wc, 0, 255)
        key = (b, int(wc[0]), int(wc[1]), int(wc[2]))
        sprite = sprite_cache.get(key)
        if sprite is None:
            sprite = make_glow_sprite(b, wc)
            sprite_cache[key] = sprite
        a = sprite.split()[3].point(lambda v, br=bright: int(v * br))
        tinted = sprite.copy()
        tinted.putalpha(a)
        px0, py0 = int(sx - sprite.width / 2), int(sy - sprite.height / 2)
        glow_layer.alpha_composite(tinted, (px0, py0))

    img = Image.alpha_composite(img, glow_layer)

    hud_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hud_draw = ImageDraw.Draw(hud_layer)
    draw_hud(hud_draw, w, h, t, color, font_sm, font_lg)
    img = Image.alpha_composite(img, hud_layer)

    return img.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=360)
    ap.add_argument("--test", action="store_true", help="render 8 sample frames to /tmp for a quick look")
    args = ap.parse_args()

    rings = build_rings()
    particles = build_particles()
    vign_desk = make_vignette(DESK_W, DESK_H)
    vign_mob = make_vignette(MOB_W, MOB_H)
    font_sm = ImageFont.truetype(FONT_PATH, 12)
    font_lg = ImageFont.truetype(FONT_PATH, 26)
    sprite_cache = {}

    if args.test:
        os.makedirs("/tmp/flight-preview", exist_ok=True)
        for i, t in enumerate([0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1.0]):
            img = render_frame(t, DESK_W, DESK_H, rings, particles, sprite_cache, font_sm, font_lg)
            img = Image.alpha_composite(img.convert("RGBA"), vign_desk).convert("RGB")
            path = f"/tmp/flight-preview/t{t:.2f}.jpg"
            img.save(path, quality=85)
            print("wrote", path)
        return

    os.makedirs(OUT_DESK, exist_ok=True)
    os.makedirs(OUT_MOB, exist_ok=True)
    n = args.frames
    for i in range(n):
        t = i / (n - 1)
        d = render_frame(t, DESK_W, DESK_H, rings, particles, sprite_cache, font_sm, font_lg)
        d = Image.alpha_composite(d.convert("RGBA"), vign_desk).convert("RGB")
        d.save(os.path.join(OUT_DESK, f"f{i+1:04d}.jpg"), quality=82, optimize=True)

        m = render_frame(t, MOB_W, MOB_H, rings, particles, sprite_cache, font_sm, font_lg)
        m = Image.alpha_composite(m.convert("RGBA"), vign_mob).convert("RGB")
        m.save(os.path.join(OUT_MOB, f"f{i+1:04d}.webp"), quality=80)

        if (i + 1) % 30 == 0:
            print(f"{i+1}/{n}")


if __name__ == "__main__":
    main()

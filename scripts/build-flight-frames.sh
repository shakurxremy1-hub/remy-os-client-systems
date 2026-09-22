#!/usr/bin/env bash
# build-flight-frames.sh — concatenate src/s1..s6.mp4 (with short crossfades)
# into one continuous flight, then extract desktop + mobile frame sequences.
#
#   src/s1.mp4 .. src/s6.mp4   landscape 16:9 scene clips, ~5s each
#
# Output (overwrites in place, after backing up the old set):
#   assets/frames/fNNNN.jpg    1920x1080, JPEG q2 (desktop)
#   assets/frames-m/fNNNN.webp 576x1024, WebP q74 (mobile, 9:16 crop)
#
# Requires: ffmpeg, cwebp
set -euo pipefail

FPS=12                 # 6 scenes x 5s x 12fps = 360 frames, matches existing frameCount
XFADE=0.4              # crossfade duration between consecutive scenes, seconds
CLIP_DUR=5             # seconds per source clip (as generated)
DESKTOP_W=1920
DESKTOP_H=1080
MOBILE_W=576
MOBILE_H=1024
JPEG_Q=2
WEBP_Q=74

command -v ffmpeg >/dev/null || { echo "need ffmpeg"; exit 1; }
command -v cwebp  >/dev/null || { echo "need cwebp (brew install webp)"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CLIPS=(src/s1.mp4 src/s2.mp4 src/s3.mp4 src/s4.mp4 src/s5.mp4 src/s6.mp4)
for f in "${CLIPS[@]}"; do
  [ -f "$f" ] || { echo "missing $f — run scripts/generate-flight.mjs first"; exit 1; }
done
echo "clips: ${#CLIPS[@]}"

if [ ! -d assets/_old-frames-backup ]; then
  mkdir -p assets/_old-frames-backup
  cp -r assets/frames assets/frames-m assets/_old-frames-backup/
  echo "backed up existing frames to assets/_old-frames-backup/"
else
  echo "assets/_old-frames-backup already exists, leaving it (not re-backing-up)"
fi

# ---- normalize each clip to a consistent codec/res/fps for xfade concat ----
NORM=()
i=0
for f in "${CLIPS[@]}"; do
  i=$((i+1)); o="$WORK/n$(printf '%02d' $i).mp4"
  ffmpeg -v error -y -i "$f" \
    -vf "scale=${DESKTOP_W}:${DESKTOP_H}:force_original_aspect_ratio=increase,crop=${DESKTOP_W}:${DESKTOP_H},fps=${FPS},setsar=1,format=yuv420p" \
    -an -c:v libx264 -crf 16 -preset veryfast "$o"
  NORM+=("$o")
done

# ---- chain xfade transitions: n01 x n02 -> tmp1, tmp1 x n03 -> tmp2, ... ----
cur="${NORM[0]}"
# running total duration of `cur` so each successive xfade offset is correct
offset=$(awk -v d="$CLIP_DUR" -v x="$XFADE" 'BEGIN{print d - x}')
for ((k=1; k<${#NORM[@]}; k++)); do
  next="${NORM[$k]}"
  out="$WORK/chain$(printf '%02d' $k).mp4"
  ffmpeg -v error -y -i "$cur" -i "$next" \
    -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}[v]" \
    -map "[v]" -c:v libx264 -crf 16 -preset veryfast "$out"
  cur="$out"
  offset=$(awk -v o="$offset" -v d="$CLIP_DUR" -v x="$XFADE" 'BEGIN{print o + d - x}')
done

DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$cur")
echo "concatenated master: $cur (${DUR}s)"

# target: exactly 30s so 30 * FPS = 360 frames; xfade trimming shortens the
# chain below the naive 6*5s sum, so pad the tail by holding the last frame.
TARGET=30
PAD=$(awk -v d="$DUR" -v t="$TARGET" 'BEGIN{p=t-d; print (p>0?p:0)}')
echo "padding tail by ${PAD}s to reach ${TARGET}s"
padded="$WORK/padded.mp4"
ffmpeg -v error -y -i "$cur" -vf "tpad=stop_mode=clone:stop_duration=${PAD}" \
  -c:v libx264 -crf 16 -preset veryfast "$padded"
cur="$padded"

TOTAL_FRAMES=$((TARGET * FPS))

# ---- desktop frames ----
rm -rf assets/frames && mkdir -p assets/frames
ffmpeg -v error -i "$cur" -vf "scale=${DESKTOP_W}:${DESKTOP_H}:flags=lanczos" \
  -vframes "$TOTAL_FRAMES" -q:v "$JPEG_Q" assets/frames/f%04d.jpg
N=$(ls assets/frames | wc -l | tr -d ' ')
echo "desktop frames: $N  ($(du -sh assets/frames | cut -f1))"

# ---- mobile frames: 9:16 centre-crop of the same master ----
rm -rf assets/frames-m "$WORK/m" && mkdir -p assets/frames-m "$WORK/m"
ffmpeg -v error -i "$cur" -vf "crop=ih*${MOBILE_W}/${MOBILE_H}:ih,scale=${MOBILE_W}:${MOBILE_H}:flags=lanczos" \
  -vframes "$TOTAL_FRAMES" -q:v 3 "$WORK/m/f%04d.jpg"
for f in "$WORK"/m/f*.jpg; do
  cwebp -quiet -q "$WEBP_Q" -m 4 "$f" -o "assets/frames-m/$(basename "$f" .jpg).webp"
done
M=$(ls assets/frames-m | wc -l | tr -d ' ')
echo "mobile frames:  $M  ($(du -sh assets/frames-m | cut -f1))"

echo
if [ "$N" != "360" ] || [ "$M" != "360" ]; then
  echo "!! frame count is $N desktop / $M mobile, expected 360 — check FPS/XFADE math or trim manually"
else
  echo "==> exactly 360/360 — matches existing frameCount config, no index.html changes needed"
fi

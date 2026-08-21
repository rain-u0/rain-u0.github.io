#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Turn photos into web-ready files under images/
#
# Usage:  bash tools/optimize.sh <source-folder>
# e.g.    bash tools/optimize.sh ~/Downloads/iPhone15
#
# It does four things:
#   1. Converts HEIC / PNG / JPEG to JPEG. Chrome and Firefox
#      cannot display HEIC at all, only Safari can.
#   2. Caps the long edge at 1600px, landing around 200-400 KB.
#   3. Lower-cases filenames and folds them to plain ASCII.
#      This matters: GitHub Pages is case-sensitive and matches
#      paths byte for byte, while macOS is case-insensitive and
#      normalises Unicode. Skip this and everything looks fine
#      locally, then 404s once deployed. (Concretely: macOS stores
#      "ä" decomposed as NFD, a + combining diaeresis, but HTML
#      written elsewhere uses the composed NFC form. Different
#      bytes, same-looking name.)
#   4. Processes _demo files too. Those are lock-screen shots of a
#      photo set as a phone wallpaper, shown via the lightbox
#      toggle — not redundant high-resolution duplicates.
#
# Why it routes through qlmanage first:
#   A portrait iPhone photo is stored as landscape pixels plus
#   metadata saying how far to rotate it (an irot box in HEIC, EXIF
#   in JPEG). sips on its own either drops that information or
#   applies it twice, and the output comes out sideways — verified,
#   not theoretical. qlmanage uses the same renderer as Finder, so
#   its orientation is always right. Let it emit an upright PNG,
#   then hand that to sips for the resize. Temp files are deleted.
#
# Everything here ships with macOS. Nothing to install.
# Prints the w / h values that js/photos.js needs.
# ═══════════════════════════════════════════════════════════════
set -u

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "Usage: bash tools/optimize.sh <source-folder>"
  echo "e.g.   bash tools/optimize.sh ~/Downloads/iPhone15"
  exit 1
fi

cd "$(dirname "$0")/.."
OUT=images
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

MAX=1600      # long-edge cap in px
QUALITY=55    # sips' JPEG quality scale is not linear; 55 measures
              # around 300 KB and is visually indistinguishable

SNIPPET="$(dirname "$0")/photos-data.txt"
: > "$SNIPPET"

echo "Source: $SRC"
echo "Output: $OUT/  (long edge ${MAX}px)"
echo

n=0; demos=0; failed=0
for f in "$SRC"/*; do
  [ -f "$f" ] || continue

  base=$(basename "$f")
  ext=$(echo "${base##*.}" | tr 'A-Z' 'a-z')

  # Sanitise the filename: lower-case, fold non-ASCII to ASCII,
  # replace anything else with an underscore. See note 3 above for
  # why the ASCII fold is not optional.
  stem=$(python3 -c "
import sys, re, unicodedata
s = unicodedata.normalize('NFKD', sys.argv[1]).encode('ascii', 'ignore').decode()
print(re.sub(r'[^a-z0-9_]+', '_', s.lower()).strip('_'))
" "${base%.*}")

  if [ -z "$stem" ]; then
    printf '  %-28s x  unusable filename, skipped\n' "$base"
    continue
  fi

  case "$ext" in
    jpg|jpeg|png|heic|heif|tif|tiff) ;;
    *) continue ;;
  esac

  n=$((n+1))
  dest="$OUT/${stem}.jpg"

  # ── Pass 1: qlmanage produces a correctly oriented PNG ──
  rm -f "$TMP"/*.png 2>/dev/null
  qlmanage -t -s "$MAX" -o "$TMP" "$f" >/dev/null 2>&1
  upright=$(ls "$TMP"/*.png 2>/dev/null | head -1)

  # ── Pass 2: sips resizes and converts to JPEG ──
  if [ -n "$upright" ] && [ -f "$upright" ]; then
    sips -s format jpeg -s formatOptions "$QUALITY" -Z "$MAX" \
         "$upright" --out "$dest" >/dev/null 2>&1
  else
    # Fallback if qlmanage fails. Orientation may be wrong, so flag it.
    sips -s format jpeg -s formatOptions "$QUALITY" -Z "$MAX" \
         "$f" --out "$dest" >/dev/null 2>&1
    printf '  %-28s !  qlmanage failed, used sips (check orientation)\n' "$stem"
  fi

  if [ ! -f "$dest" ]; then
    printf '  %-28s x  conversion failed\n' "$stem"
    failed=$((failed+1))
    n=$((n-1))
    continue
  fi

  w=$(sips -g pixelWidth  "$dest" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$dest" | awk '/pixelHeight/{print $2}')
  kb=$(( $(wc -c < "$dest") / 1024 ))

  case "$stem" in
    *_demo)
      demos=$((demos+1))
      printf '  %-28s %4sx%-4s  %4s KB   (wallpaper shot)\n' "$stem" "$w" "$h" "$kb"
      ;;
    *)
      printf '  %-28s %4sx%-4s  %4s KB\n' "$stem" "$w" "$h" "$kb"
      echo "  { file: '$stem', zh: '', en: '', cat: '', w: $w, h: $h, demo: true }," >> "$SNIPPET"
      ;;
  esac
done

echo
echo "Done: $n file(s) written to $OUT/    ($demos wallpaper shot(s))"
[ "$failed" -gt 0 ] && echo "      $failed failed"
echo "Total size: $(du -sh "$OUT" | cut -f1)"
echo
echo "If you replaced photos, update the w / h values in js/photos.js."
echo "Ready-to-paste rows are in: tools/photos-data.txt"

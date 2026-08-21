#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Download originals from the shared Google Drive folder.
#
# NOTE: this list only covers 25 files; the folder actually holds 36.
#   The Drive listing page is lazy-loaded, so scraping it only
#   yielded the first 50 entries. Every photo has since been
#   downloaded and processed, so this script is no longer needed —
#   it is kept for reference. To re-fetch, download the folder from
#   the Drive web UI instead.
#
# Usage:  bash tools/download.sh
# Output: tools/_download/  (then run optimize.sh on it)
#
# It uses Drive's thumbnail endpoint, which has two useful
# properties:
#   1. It always returns JPEG, so HEIC is converted for free and
#      with correct orientation
#   2. It needs no sign-in, as the folder is publicly shared
# sz=w2400 caps the output width: plenty, without being huge.
# ═══════════════════════════════════════════════════════════════
set -u
cd "$(dirname "$0")"
OUT=_download
mkdir -p "$OUT"

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

# name:file-id pairs (photos only, no _demo entries)
FILES="
a_cup_of_fingers:1eadfEZvBAjPrt5RDqF8rgLg4M9zcUrlS
a_cup_of_rose:1i82e-whD-aIjNcQ4fJo9HHOOxZKLIIPE
baisha_penghu:1hxszl0-jbnYI-TW0Q7AEVBE0-EVb5nlk
baisha_penghu_blackwhite:1zObpADNF_i45zC1vELgDWtvAOTmdcJkt
blue_frozen_glow:1QvVbYEzMZx4f5SV_z8ba8PKenTmirHot
blue_frozen_glow_sip:1y20rTYAIg6zr0zKhtPXroBaQmiXWuR8b
boulevard_jourdan:1C1vhkFyyc_uPOB1wBX1QC3PRfODDLPay
cafe_yarn:1GCh0z-_m64zPn_YjEkREFKm6M1V-unsX
caffeine_therapy:1oGGOChkBNHeUx8gcJPf6ezUpSfNqcdYn
city_trail:1hqDDRY3XHmGPh90ILncFSCU47lFpFRft
cocoa_space:1vXMRWSZStIkajxtMB4YsJNcQhVq8Xnf1
daegu_83_tower_road:1ZsDmTrgDF12m3SfduloesXezlgkGpPJb
daegu_namgu_cafe_europe:1mIXVvrfxFwPcvFup0V3e4LlZN_Rc6XPI
dakeng_scenic_area:1Wi9pM9IMCpFF0pUfEvDEkXbsZxTrAV6z
dapi_beizhen:1l3_Seu2VULJSvAUxyTxNHPzyqFVRW0Ro
decibel_moka:1iReCqRFU_ej4IDN0MSsnx94lBRTfBUHh
friedrichshain:1T1WFj7bs_zAIZUH7qC08gOVMhIs2Dxxl
gathering_in_violet:1ls1zCSleSYyxuf_Wgf4mOdeTxL1Jqt2g
ginkgo_forest:1PrG6zNpHGd4Vm2UfOe7PXenLE1bm2ocz
glass_citrus:1RIKZgghjwoM7qgDASEHFid2NcmBy5H7K
huinnyeoul_seaside:1wyeLtnvHVS63fHcy1_FpjOmsML8SLJPF
konigssee:1tgzRYD4EHLnXuJzXQCYBgW0F-QOwJxCv
minxiong:1WQgwQYF1Px6nkY9mMT8cybiMqibGQI-_
petal_heart:10DcdYL-x5oCxcyhedXiVu_-sE3YaOqYW
purple_reflection:1o9ZpJElF_xp2J332tzixDR-an_KXks4R
"

n=0
for entry in $FILES; do
  name="${entry%%:*}"
  id="${entry##*:}"
  n=$((n+1))
  printf '[%2d/25] %-26s ' "$n" "$name"
  code=$(curl -sL --max-time 120 -A "$UA" \
    "https://drive.google.com/thumbnail?id=${id}&sz=w2400" \
    -o "$OUT/${name}.jpg" -w '%{http_code}')
  size=$(wc -c < "$OUT/${name}.jpg" | tr -d ' ')
  if [ "$code" = "200" ] && [ "$size" -gt 20000 ]; then
    echo "ok  ($((size/1024)) KB)"
  else
    echo "failed (HTTP $code, $size bytes)"
  fi
done

echo
echo "Downloaded to tools/$OUT"
echo "Next:  bash tools/optimize.sh tools/$OUT"

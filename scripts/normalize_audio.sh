#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-Assets/audio}"
TP="-1.0"
TP_LINEAR="0.891"   # 10^(-1.0/20), the same ceiling expressed for alimiter
LRA="7.0"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

# Canonical game-audio mastering targets. These are SOURCE FILE targets;
# runtime spatial attenuation and mix gain still happen in Babylon.
target_for() {
  local f="$1"
  case "$f" in
    */voices/*) echo "-18.0" ;;
    */weapons/foley/*.mp3) echo "-20.0" ;;
    "$ROOT/rifle.mp3"|"$ROOT/carbine.mp3"|"$ROOT/lmg.mp3"|"$ROOT/pistol.mp3"|*/weapons/rifle-*.mp3|*/weapons/smg-*.mp3|*/weapons/lmg-*.mp3|*/weapons/hmg-*.mp3|*/weapons/pistol-*.mp3) echo "-19.0" ;;
    */grenades/explosion-*.mp3|*/vehicles/tank-cannon-*.mp3|*/vehicles/tank-impact-*.mp3|*/vehicles/tank-destroyed-*.mp3|*/weapons/cannon-*.mp3|*/aircraft/bomb-explosion-*.mp3) echo "-21.0" ;;
    */vehicles/*.mp3|*/aircraft/*.mp3) echo "-22.0" ;;
    */ambience/*.mp3) echo "-26.0" ;;
    *) echo "" ;;
  esac
}

measure_json() {
  local file="$1" target="$2"
  ffmpeg -nostdin -hide_banner -nostats -i "$file" \
    -af "loudnorm=I=${target}:TP=${TP}:LRA=${LRA}:print_format=json" \
    -f null - 2>&1 | python3 -c '
import sys,re,json
s=sys.stdin.read()
m=re.findall(r"\{\s*\"input_i\".*?\}",s,re.S)
if not m:
    raise SystemExit(2)
print(m[-1])
'
}

normalize_one() {
  local file="$1" target="$2" dir base tmp stats filter
  dir="$(dirname "$file")"
  base="$(basename "$file")"
  tmp="$dir/.${base}.mastering.mp3"

  echo "MASTER $file -> ${target} LUFS / ${TP} dBTP"
  stats="$(measure_json "$file" "$target" || true)"

  if [[ -n "$stats" ]]; then
    filter="$(python3 - "$stats" "$target" "$TP" "$LRA" <<'PY'
import json,sys,math
j=json.loads(sys.argv[1]); I=sys.argv[2]; TP=sys.argv[3]; LRA=sys.argv[4]
keys=['input_i','input_tp','input_lra','input_thresh','target_offset']
try:
    vals=[float(j[k]) for k in keys]
    valid=all(math.isfinite(v) for v in vals)
except Exception:
    valid=False
if valid:
    print(f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true:print_format=summary")
else:
    print(f"loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=summary")
PY
)"
  else
    filter="loudnorm=I=${target}:TP=${TP}:LRA=${LRA}:print_format=summary"
  fi

  # loudnorm's one-pass fallback can let a very transient source (a rifle crack with a
  # 30 dB crest factor) through above the ceiling, so hard-limit to it afterwards.
  ffmpeg -nostdin -y -hide_banner -loglevel error -i "$file" \
    -map_metadata -1 -af "${filter},alimiter=limit=${TP_LINEAR}:level=disabled" \
    -ar 48000 -ac 1 -c:a libmp3lame -b:a 128k "$tmp"
  mv "$tmp" "$file"
}

count=0
while IFS= read -r -d '' file; do
  target="$(target_for "$file")"
  [[ -z "$target" ]] && continue
  normalize_one "$file" "$target"
  count=$((count+1))
done < <(find "$ROOT" -type f -name '*.mp3' -print0 | sort -z)

echo "Normalized $count MP3 files."

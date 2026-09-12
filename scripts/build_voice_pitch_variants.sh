#!/usr/bin/env bash
set -euo pipefail

MANIFEST="${1:-Assets/audio/manifest.json}"
SOURCE_ROOT="${2:-Assets/audio}"
OUTPUT_ROOT="${3:-.audio-deploy}"

command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
command -v python3 >/dev/null

test -s "$MANIFEST"
rm -rf "$OUTPUT_ROOT"
mkdir -p "$OUTPUT_ROOT"
cp "$MANIFEST" "$OUTPUT_ROOT/manifest.json"
mkdir -p "$OUTPUT_ROOT/voices"
cp -a "$SOURCE_ROOT/voices/." "$OUTPUT_ROOT/voices/"

mapfile -t PROFILES < <(python3 - "$MANIFEST" <<'PY'
import json,sys
m=json.load(open(sys.argv[1],encoding='utf-8'))
v=m.get('rules',{}).get('voice',{}).get('variation',{})
if not v.get('preserveDuration',False):
    raise SystemExit('voice variation must preserve duration')
for p in v.get('profiles',[]):
    st=float(p.get('semitones',0))
    suffix=str(p.get('suffix',''))
    if abs(st)>1e-9:
        if not suffix:
            raise SystemExit('non-neutral pitch profile is missing suffix')
        print(f"{st}\t{suffix}")
PY
)

if [[ ${#PROFILES[@]} -eq 0 ]]; then
  echo "No non-neutral voice pitch profiles configured."
  exit 0
fi

while IFS= read -r -d '' src; do
  rel="${src#${SOURCE_ROOT}/}"
  [[ "$rel" == *".pitch-"* ]] && continue
  sample_rate="$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=nw=1:nk=1 "$src")"
  [[ "$sample_rate" =~ ^[0-9]+$ ]] || { echo "Could not determine sample rate: $src" >&2; exit 1; }
  src_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$src")"

  for spec in "${PROFILES[@]}"; do
    IFS=$'\t' read -r semitones suffix <<<"$spec"
    ratio="$(python3 - "$semitones" <<'PY'
import math,sys
print(f"{2**(float(sys.argv[1])/12):.10f}")
PY
)"
    tempo="$(python3 - "$ratio" <<'PY'
import sys
print(f"{1/float(sys.argv[1]):.10f}")
PY
)"
    stem="${rel%.*}"; ext="${rel##*.}"
    out="$OUTPUT_ROOT/${stem}${suffix}.${ext}"
    mkdir -p "$(dirname "$out")"

    # asetrate changes pitch and tempo together; atempo inversely compensates tempo,
    # leaving the spoken duration effectively unchanged while retaining the pitch shift.
    ffmpeg -hide_banner -loglevel error -y -i "$src" \
      -af "asetrate=${sample_rate}*${ratio},aresample=${sample_rate},atempo=${tempo}" \
      -codec:a libmp3lame -q:a 4 "$out"

    out_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")"
    python3 - "$src" "$out" "$src_duration" "$out_duration" <<'PY'
import sys
src,out,a,b=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4])
tol=max(0.10,a*0.04)
if abs(a-b)>tol:
    raise SystemExit(f"duration drift too large: {src}={a:.3f}s {out}={b:.3f}s")
PY
  done
done < <(find "$SOURCE_ROOT/voices" -type f -name '*.mp3' -print0 | sort -z)

echo "Built pitch-preserving voice variants in $OUTPUT_ROOT/voices"

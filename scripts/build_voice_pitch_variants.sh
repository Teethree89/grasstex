#!/usr/bin/env bash
set -euo pipefail

MANIFEST="${1:-Assets/audio/manifest.json}"
SOURCE_ROOT="${2:-Assets/audio}"
OUTPUT_ROOT="${3:-.audio-deploy}"
REMOTE_INDEX="${4:-}"

command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
command -v python3 >/dev/null

test -s "$MANIFEST"
rm -rf "$OUTPUT_ROOT"
mkdir -p "$OUTPUT_ROOT"
cp "$MANIFEST" "$OUTPUT_ROOT/manifest.json"
mkdir -p "$OUTPUT_ROOT/voices"
# Preserve source mtimes so lftp can skip unchanged neutral/base voices.
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

REMOTE_AWARE=0
if [[ -n "$REMOTE_INDEX" && -s "$REMOTE_INDEX" ]]; then
  REMOTE_AWARE=1
  echo "Using deployed voice inventory: $REMOTE_INDEX"
else
  echo "No deployed voice inventory available; pitch variants will be rebuilt as a safe fallback."
fi

remote_has(){
  local rel="$1"
  [[ "$REMOTE_AWARE" -eq 1 ]] || return 1
  # lftp `find voices` reports paths relative to Assets/audio. Accept an optional leading ./.
  grep -Fxq "$rel" "$REMOTE_INDEX" || grep -Fxq "./$rel" "$REMOTE_INDEX"
}

built=0
skipped=0

while IFS= read -r -d '' src; do
  rel="${src#${SOURCE_ROOT}/}"
  [[ "$rel" == *".pitch-"* ]] && continue

  for spec in "${PROFILES[@]}"; do
    IFS=$'\t' read -r semitones suffix <<<"$spec"
    stem="${rel%.*}"; ext="${rel##*.}"
    variant_rel="${stem}${suffix}.${ext}"
    out="$OUTPUT_ROOT/$variant_rel"

    if remote_has "$variant_rel"; then
      # Do not recreate already-deployed derived audio. The remote copy remains in place because
      # voice deployment uses reverse mirror without --delete.
      rm -f "$out"
      skipped=$((skipped+1))
      echo "Pitch exists remotely; skip: $variant_rel"
      continue
    fi

    sample_rate="$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=nw=1:nk=1 "$src")"
    [[ "$sample_rate" =~ ^[0-9]+$ ]] || { echo "Could not determine sample rate: $src" >&2; exit 1; }
    src_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$src")"
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
    mkdir -p "$(dirname "$out")"

    # asetrate changes pitch and tempo together; atempo inversely compensates tempo,
    # leaving the spoken duration effectively unchanged while retaining the pitch shift.
    # -nostdin is required because this call runs inside the NUL-delimited find/read loop.
    ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" \
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
    built=$((built+1))
    echo "Built missing pitch variant: $variant_rel"
  done
done < <(find "$SOURCE_ROOT/voices" -type f -name '*.mp3' -print0 | sort -z)

echo "Pitch variants: built=$built skipped-existing=$skipped"
echo "Prepared incremental voice deployment in $OUTPUT_ROOT/voices"

#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-Assets/audio}"
TP="-1.0"
TP_LINEAR="0.891"   # 10^(-1.0/20), the same ceiling expressed for alimiter
LRA="7.0"
# Which files are already mastered, as <sha256>\t<path>. Mastering decodes and re-encodes,
# so running it again over an unchanged library is not a no-op: it burns a fresh MP3
# generation off every file and produces a diff the normalize workflow then commits. This
# state file is what makes a second run cost nothing, exactly as .battle-deploy.sha256.tsv
# does for uploads. Delete it to force a full remaster.
STATE="${MASTERING_STATE:-Assets/audio/.mastering-state.tsv}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

# One-shot weapon material is mastered on a different measure to everything else. EBU R128
# integrated loudness is gated and averages over a whole file, which is the wrong tool for a
# 0.3 s rifle crack: the gate rejects short clips outright, and where it does resolve, a long
# quiet tail drags the number down. Mastering gunshots to an integrated target therefore
# peak-normalises them in practice, leaving perceived level to follow each recording's crest
# factor - a 17 dB spread across the WW2 packs, loud enough that one weapon drowns another.
# These files are levelled on the loudest 100 ms instead, which is what the ear judges a shot
# by. Sustained material (voices, engines, ambience) keeps the R128 targets, where they work.
method_for() {
  case "$1" in
    */weapons/*.mp3) echo "transient" ;;
    "$ROOT/rifle.mp3"|"$ROOT/carbine.mp3"|"$ROOT/lmg.mp3"|"$ROOT/pistol.mp3") echo "transient" ;;
    *) echo "integrated" ;;
  esac
}

# Loudest-100 ms targets, dBFS RMS. Not LUFS - see method_for above.
transient_target_for() {
  case "$1" in
    */weapons/foley/*.mp3) echo "-26.0" ;;
    */weapons/cannon-*.mp3) echo "-13.0" ;;
    *) echo "-16.0" ;;
  esac
}

# Cutting a loud clip to target is free; boosting a quiet one costs crest factor, because the
# limiter then shaves the transient that made it a gunshot. Cap the boost so a distant take
# stays a distant take rather than being winched up into a mush of limiting.
MAX_BOOST_DB="6.0"

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

# Loudest 100 ms window, in dBFS RMS. Measured at the full 48 kHz: a rifle crack carries a
# lot of its energy above 4 kHz, and weapons differ in how much, so measuring off a
# downsampled copy would low-pass the very thing being levelled and reintroduce per-weapon
# variance. Pure stdlib - the normalize workflow installs ffmpeg and nothing else.
transient_level() {
  ffmpeg -nostdin -v error -i "$1" -ac 1 -ar 48000 -f f32le - 2>/dev/null | python3 -c '
import array, math, sys
x = array.array("f"); x.frombytes(sys.stdin.buffer.read())
w = 4800                                   # 100 ms at 48 kHz
if not len(x):
    print("-inf"); raise SystemExit
if len(x) < w:
    x.extend([0.0] * (w - len(x)))
total = sum(v * v for v in x[:w]); best = total
for i in range(w, len(x)):
    total += x[i] * x[i] - x[i - w] * x[i - w]
    if total > best: best = total
print(f"{20 * math.log10(max(math.sqrt(best / w), 1e-9)):.3f}")'
}

normalize_transient() {
  local file="$1" target="$2" dir base tmp level gain
  dir="$(dirname "$file")"; base="$(basename "$file")"
  tmp="$dir/.${base}.mastering.mp3"

  level="$(transient_level "$file")"
  if [[ "$level" == "-inf" ]]; then
    echo "SKIP   $file (silent)"
    return
  fi
  gain="$(python3 -c "print('%.3f' % min(float('$target') - float('$level'), float('$MAX_BOOST_DB')))")"
  echo "MASTER $file -> ${target} dBFS loudest-100ms (${gain} dB) / ${TP} dBTP"

  ffmpeg -nostdin -y -hide_banner -loglevel error -i "$file" \
    -map_metadata -1 -af "volume=${gain}dB,alimiter=limit=${TP_LINEAR}:level=disabled" \
    -ar 48000 -ac 1 -c:a libmp3lame -b:a 128k "$tmp"
  mv "$tmp" "$file"
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

digest() {
  python3 -c 'import hashlib,sys
h=hashlib.sha256()
with open(sys.argv[1],"rb") as f:
    for chunk in iter(lambda: f.read(1024*1024), b""): h.update(chunk)
print(h.hexdigest())' "$1"
}

declare -A mastered=()
if [[ -f "$STATE" ]]; then
  while IFS=$'\t' read -r recorded path; do
    [[ -n "${recorded:-}" && -n "${path:-}" ]] && mastered["$path"]="$recorded"
  done < "$STATE"
fi

count=0
skipped=0
declare -A seen=()
while IFS= read -r -d '' file; do
  target="$(target_for "$file")"
  [[ -z "$target" ]] && continue
  before="$(digest "$file")"
  if [[ "${mastered["$file"]:-}" == "$before" ]]; then
    seen["$file"]="$before"
    skipped=$((skipped+1))
    continue
  fi
  if [[ "$(method_for "$file")" == "transient" ]]; then
    normalize_transient "$file" "$(transient_target_for "$file")"
  else
    normalize_one "$file" "$target"
  fi
  seen["$file"]="$(digest "$file")"
  count=$((count+1))
done < <(find "$ROOT" -type f -name '*.mp3' -print0 | sort -z)

# Carry forward entries for files outside this run's ROOT so normalizing one directory
# does not orphan the rest of the library; drop entries whose file is gone.
for path in "${!mastered[@]}"; do
  [[ -n "${seen["$path"]:-}" ]] && continue
  [[ -f "$path" ]] && seen["$path"]="${mastered["$path"]}"
done

mkdir -p "$(dirname "$STATE")"
for path in "${!seen[@]}"; do
  printf '%s\t%s\n' "${seen["$path"]}" "$path"
done | sort -k2 > "$STATE"

echo "Normalized $count MP3 file(s); $skipped already on target."

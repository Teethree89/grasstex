# Battle Sim Audio Mastering Standard

This file is the canonical source-level loudness standard for `Assets/audio/`.
Runtime volume, distance attenuation, occlusion/air absorption, and mix decisions are applied separately by the Battle Sim.

## Two measures, by material

Sustained material is mastered to EBU R128 integrated loudness. One-shot weapon material is
not, because R128 is the wrong instrument for it: the gate rejects anything under ~400 ms
outright, and where it does resolve, a long quiet tail drags the average down. Mastering a
0.3 s rifle crack to an integrated target therefore just peak-normalises it, and perceived
level ends up following each recording's crest factor. Across the WW2 packs that left a
**17 dB spread** - a Mosin-Nagant drowning a Grease Gun fired beside it.

One-shots are levelled on the **loudest 100 ms window** instead, measured at full rate,
which is what the ear judges a shot by. That holds the same material inside ~4 dB.

### Sustained material - integrated loudness

| Category | Integrated loudness | True-peak ceiling | LRA target |
| --- | ---: | ---: | ---: |
| Soldier voices / callouts | -18 LUFS | -1.0 dBTP | 7 LU |
| Vehicle and aircraft engines / passes / mechanical loops | -22 LUFS | -1.0 dBTP | 7 LU |
| Battlefield ambience / wind / distant artillery beds | -26 LUFS | -1.0 dBTP | 7 LU |

### One-shots - loudest 100 ms

Values are dBFS RMS over the loudest 100 ms window. **Not LUFS**; the two are not comparable.

| Category | Loudest 100 ms | True-peak ceiling |
| --- | ---: | ---: |
| Small arms (rifle, carbine, LMG, pistol, SMG, HMG) | -16 dBFS | -1.0 dBTP |
| Cannon / howitzer | -13 dBFS | -1.0 dBTP |
| Weapon handling foley (bolts, magazines, cocking, dry fire) | -26 dBFS | -1.0 dBTP |

Boost is capped at **+6 dB**. Cutting a loud clip to target is free, but winching a quiet one
up costs crest factor once the limiter starts shaving the transient that made it a gunshot.
The cap is why a distant take stays audibly distant instead of being flattened to match a
close-mic one, and why the residual spread is a few dB rather than zero.

## Encoding

Mastered game assets are encoded as mono MP3 at 48 kHz / 128 kbps unless a future asset has a documented reason to remain stereo. Positional sounds should normally be mono; spatial placement is handled by Babylon/Web Audio.

## Processing

`scripts/normalize_audio.sh` performs EBU R128 normalization with FFmpeg's `loudnorm` filter
for sustained material. It uses a measured two-pass normalization when valid loudness
measurements are available and falls back to a one-pass `loudnorm` pass where the
measurements cannot be used safely. One-shots take the loudest-100 ms path described above.

Both paths end in a true-peak limiter at the ceiling. A rifle crack has a ~30 dB crest
factor, which puts it in the class where `loudnorm` falls back to a single pass and can
overshoot; the limiter is what makes the ceiling a guarantee rather than a request.

### The script is incremental

Mastering decodes and re-encodes, so re-running it over an unchanged library is **not** a
no-op - it burns a fresh MP3 generation off every file and produces a diff the normalize
workflow then commits. `Assets/audio/.mastering-state.tsv` records the SHA-256 of each file
as it was left, exactly as `.battle-deploy.sha256.tsv` does for uploads, and files whose hash
still matches are skipped. A full-tree run costs ~40 s the first time and ~4 s thereafter.

Delete the state file to force a full remaster - and do so whenever a target above changes,
or the new target will be skipped over on files that already carry a matching hash.

The mastering target is a **source-file standard**, not the final listening level. Do not compensate for battlefield distance by remastering the source quieter or louder. Use the runtime spatial mix for distance, air absorption, culling, reverb/echo, and category balance.

## Adding new assets

Before committing new audio, place it in the appropriate `Assets/audio/` category and run:

```bash
bash scripts/normalize_audio.sh Assets/audio
```

Only the new files are touched; the rest are skipped on their recorded hash.

The automated normalization workflow also runs when the mastering script/workflow is changed. New categories should be assigned a target here and in `scripts/normalize_audio.sh` before production use.

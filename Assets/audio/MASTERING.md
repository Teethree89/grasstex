# Battle Sim Audio Mastering Standard

This file is the canonical source-level loudness standard for `Assets/audio/`.
Runtime volume, distance attenuation, occlusion/air absorption, and mix decisions are applied separately by the Battle Sim.

## Targets

| Category | Integrated loudness | True-peak ceiling | LRA target |
| --- | ---: | ---: | ---: |
| Soldier voices / callouts | -18 LUFS | -1.0 dBTP | 7 LU |
| Small arms (rifle, carbine, LMG, pistol, SMG, HMG) | -19 LUFS | -1.0 dBTP | 7 LU |
| Weapon handling foley (bolts, magazines, cocking, dry fire) | -20 LUFS | -1.0 dBTP | 7 LU |
| Explosions / cannon / tank impacts / large weapon transients | -21 LUFS | -1.0 dBTP | 7 LU |
| Vehicle and aircraft engines / passes / mechanical loops | -22 LUFS | -1.0 dBTP | 7 LU |
| Battlefield ambience / wind / distant artillery beds | -26 LUFS | -1.0 dBTP | 7 LU |

## Encoding

Mastered game assets are encoded as mono MP3 at 48 kHz / 128 kbps unless a future asset has a documented reason to remain stereo. Positional sounds should normally be mono; spatial placement is handled by Babylon/Web Audio.

## Processing

`scripts/normalize_audio.sh` performs EBU R128 normalization with FFmpeg's `loudnorm` filter. It uses a measured two-pass normalization when valid loudness measurements are available and falls back to a one-pass `loudnorm` pass for very short/transient material whose measurements cannot be used safely.

The mastering target is a **source-file standard**, not the final listening level. Do not compensate for battlefield distance by remastering the source quieter or louder. Use the runtime spatial mix for distance, air absorption, culling, reverb/echo, and category balance.

## Adding new assets

Before committing new audio, place it in the appropriate `Assets/audio/` category and run:

```bash
bash scripts/normalize_audio.sh Assets/audio
```

The automated normalization workflow also runs when the mastering script/workflow is changed. New categories should be assigned a target here and in `scripts/normalize_audio.sh` before production use.

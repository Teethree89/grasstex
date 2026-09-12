# Battle Sim Voice Callout Generation

`Assets/audio/manifest.json` v3 is the source of truth for infantry callouts.

## Source of truth

Each faction has three related pieces:

- `generation`: the canonical `{event, file, text}` records used when creating neutral/base voice clips.
- `events`: the runtime lookup table used by the Battle Sim. Each event can list multiple alternate takes.
- `voiceDirection`: the intended faction voice/performance description.

`contactFront`, `contactLeft`, and `contactRight` are explicit directional events. Legacy `contact` remains mapped to the front-contact files for backward compatibility.

## Provider and voices

Neutral/base clips are synthesized with ElevenLabs `eleven_v3`.

| Faction | Voice | Voice ID |
| --- | --- | --- |
| US (English) | Jeffrey B. | `TxWZERZ5Hc6h9dGxVmXa` |
| German | Commander Blake | `Z2yQ1EdlDmcIgh9Pn4Lw` |

The current synthesis prefix is:

```text
[shouting][hoarse][panicked]
```

with:

```json
{"stability": 0.4, "similarity_boost": 0.7, "style": 0.9, "use_speaker_boost": true}
```

Keep the existing takes stylistically consistent unless intentionally re-recording the whole set. The manifest's `voiceDirection` fields describe the desired character, but changing performance direction for only some alternates can sound more jarring than keeping all takes matched.

## Generating neutral/base clips

The generator only creates files explicitly listed in `callouts.<faction>.generation`. It never creates `.pitch-low` or `.pitch-high` derivatives.

```bash
export ELEVENLABS_API_KEY=...   # never commit this key

python3 scripts/generate_voice_callouts.py
python3 scripts/generate_voice_callouts.py --faction us
python3 scripts/generate_voice_callouts.py --faction ge
python3 scripts/generate_voice_callouts.py --force
python3 scripts/generate_voice_callouts.py --force contactFront
python3 scripts/generate_voice_callouts.py --faction us --force contactLeft
```

A plain run fills missing clips only. `--force` regenerates all selected clips; `--force EVENT` regenerates only that event. `--faction` can be combined with either mode.

Do not rename generated files. The paths in the manifest are the runtime contract.

## Stable soldier voice variation

Individual soldiers receive one deterministic voice profile for the entire battle:

- **low**: `-1.4` semitones
- **neutral**: unchanged
- **high**: `+1.3` semitones

The distribution is currently 30% low, 40% neutral, 30% high. A soldier keeps the same profile for every callout.

### Speaking speed does not change

The runtime does **not** use `setPlaybackRate()` for voice variation because that would alter tempo along with pitch.

Deployment derives pitch variants from each neutral MP3 with ffmpeg using pitch shift plus inverse tempo compensation, keeping duration effectively unchanged.

Derived filenames are inserted before the extension:

```text
voices/us/contact-left-01.mp3
voices/us/contact-left-01.pitch-low.mp3
voices/us/contact-left-01.pitch-high.mp3
```

These pitch variants are deployment artifacts and do not need to be committed.

## Validation / deployment gate

Before production upload, CI runs:

```bash
python3 scripts/validate_voice_manifest.py Assets/audio/manifest.json Assets/audio
```

Every neutral/base file referenced by `callouts.*.events` must exist. If a required voice file is missing, deployment stops before modifying production. This prevents live 404s and manifest/runtime drift.

To build pitch variants locally:

```bash
bash scripts/build_voice_pitch_variants.sh Assets/audio/manifest.json Assets/audio .audio-deploy
```

The production Battle deployment uploads the neutral voice files, derived pitch variants, and finally the manifest so the hosted runtime and manifest remain synchronized.

## Mastering

Generated neutral clips can go through the normal mastering pass described in `MASTERING.md` before commit:

```bash
bash scripts/normalize_audio.sh Assets/audio
```

## Runtime use

The Battle Sim never calls ElevenLabs at runtime. It only plays static deployed audio. An ElevenLabs API key is needed only when generating or re-recording neutral/base clips.

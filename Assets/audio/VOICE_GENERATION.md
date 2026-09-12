# Battle Sim Voice Callout Generation

`Assets/audio/manifest.json` v3 is the source of truth for infantry callouts.

## Neutral/base voice generation

Claude should generate only the neutral/base MP3s declared under:

- `callouts.us.generation`
- `callouts.ge.generation`

Every record supplies:

- `event`: the semantic runtime event
- `file`: the exact repository path relative to `Assets/audio/`
- `text`: the exact line to synthesize

Do not rename files. Do not hand-generate `.pitch-low` or `.pitch-high` files.

The generation script defaults to **missing files only**, so existing approved clips are preserved:

```bash
export ELEVENLABS_API_KEY=...   # never commit this key
python3 scripts/generate_voice_callouts.py
```

Use `--faction us` or `--faction ge` to limit a run. Use `--force` only when intentionally re-recording existing clips.

## Provider and voices

The generator uses ElevenLabs `eleven_v3`.

| Faction | Voice | Voice ID |
| --- | --- | --- |
| US (English) | Jeffrey B. | `TxWZERZ5Hc6h9dGxVmXa` |
| German | Commander Blake | `Z2yQ1EdlDmcIgh9Pn4Lw` |

Each faction also has a `voiceDirection` field in the manifest. The current synthesis prefix is:

```text
[shouting][hoarse][panicked]
```

with these voice settings:

```json
{"stability": 0.4, "similarity_boost": 0.7, "style": 0.9, "use_speaker_boost": true}
```

## Directional contact vocabulary

Manifest v3 separates contact direction so AI can call the direction it actually sees:

- `contactFront`
- `contactLeft`
- `contactRight`

`contact` remains mapped to the front-contact files for backward compatibility with older behavior.

## Stable soldier voice variation

Individual soldiers receive one deterministic voice profile for the entire battle:

- **low**: `-1.4` semitones
- **neutral**: unchanged
- **high**: `+1.3` semitones

The distribution is currently 30% low, 40% neutral, 30% high. The assignment is derived from stable soldier identity fields, so a soldier keeps the same pitch on every callout.

### Speaking speed does not change

The runtime deliberately does **not** use `setPlaybackRate()` because that would alter speech tempo as well as pitch.

Instead, deployment derives pitch variants from the neutral MP3 with `ffmpeg`:

1. `asetrate` moves pitch and tempo together.
2. `atempo` applies the inverse tempo change.
3. The resulting clip keeps effectively the same duration while retaining the pitch shift.

Derived paths are inserted before the extension:

```text
voices/us/contact-left-01.mp3
voices/us/contact-left-01.pitch-low.mp3
voices/us/contact-left-01.pitch-high.mp3
```

The derived files are deployment artifacts and do not need to be committed.

## Validation / merge gate

Before production upload, CI runs:

```bash
python3 scripts/validate_voice_manifest.py Assets/audio/manifest.json Assets/audio
```

Every file referenced by `callouts.*.events` must exist as a committed neutral/base MP3. If Claude has not generated one yet, deployment stops before modifying production. This prevents manifest/runtime drift and live 404s.

To build pitch variants locally:

```bash
bash scripts/build_voice_pitch_variants.sh Assets/audio/manifest.json Assets/audio .audio-deploy
```

## Mastering

Neutral generated clips can still go through the normal mastering pass described in `MASTERING.md` before commit:

```bash
bash scripts/normalize_audio.sh Assets/audio
```

The Battle Sim never calls ElevenLabs at runtime; it only plays committed/deployed static audio files.

# Battle Sim Voice Callout Generation

This documents how the soldier voice callouts under `Assets/audio/voices/` were produced, so the set can be regenerated, extended, or re-cast without guesswork.

## Source of truth

`Assets/audio/manifest.json` → `callouts` is the canonical event/text/path contract. Each faction (`us`, `ge`) maps a stable event key (e.g. `contact`, `manDown`, `grenadeIncoming`) to:
- `events.<key>`: the runtime file path, relative to the manifest's `base` (`Assets/audio/`)
- `text.<key>`: the line spoken in that clip

Adding a new callout means adding it to both `events` and `text` in the manifest first; the generation script (below) derives everything else from that file, so no line list is duplicated elsewhere.

## Provider and voices

Lines are synthesized with the [ElevenLabs](https://elevenlabs.io) Text-to-Speech API, model `eleven_v3`.

| Faction | Voice | Voice ID |
| --- | --- | --- |
| US (English) | Jeffrey B. | `TxWZERZ5Hc6h9dGxVmXa` |
| German | Commander Blake | `Z2yQ1EdlDmcIgh9Pn4Lw` |

Both were picked from the ElevenLabs voice library for a rough, commanding "combat radio" character rather than a clean narration voice.

## Delivery style

Every line is prefixed with `eleven_v3` direction tags before synthesis:

```
[shouting][hoarse][panicked] <line text>
```

`eleven_v3` reads these bracketed tags as performance direction rather than speaking them aloud. This was chosen deliberately over just tweaking voice-stability sliders: earlier passes using `eleven_multilingual_v2` with low stability/high style produced a *shaky* voice, not an actually panicked/shouted one. The tag-driven `eleven_v3` takes landed much closer to "soldier yelling over gunfire" on listening review.

`voice_settings` used for every line:

```json
{"stability": 0.4, "similarity_boost": 0.7, "style": 0.9, "use_speaker_boost": true}
```

## Regenerating

`scripts/generate_voice_callouts.py` reads `Assets/audio/manifest.json`, calls the ElevenLabs API for every `(faction, event)` pair, and writes the resulting MP3 to the manifest's declared path.

```bash
export ELEVENLABS_API_KEY=...   # never commit this key
python3 scripts/generate_voice_callouts.py
```

The script needs no other configuration — voice IDs, model, tags, and settings above are the values baked into it. Re-run it after editing manifest text to refresh the affected lines (it regenerates the whole set; there's no per-line flag yet).

## Post-processing

Generated clips still go through the project's normal mastering pass — see `MASTERING.md` — to bring them to the -18 LUFS callout target and 48 kHz/128 kbps mono encoding:

```bash
bash scripts/normalize_audio.sh Assets/audio
```

## Is an ElevenLabs API key needed in this repo?

No, not for playback. The callouts are pre-rendered MP3s committed to `Assets/audio/voices/`; the Battle Sim only ever reads static files from the manifest and never calls ElevenLabs at runtime. A key is only needed transiently, on whichever machine runs `generate_voice_callouts.py`, and only when adding or re-recording lines.

If you want regeneration to run automatically (e.g. a CI workflow that re-synthesizes callouts when the manifest's `text` changes), a repository secret for `ELEVENLABS_API_KEY` would be needed for that workflow's job — but that's an opt-in convenience for future automation, not a requirement for anything currently in the repo.

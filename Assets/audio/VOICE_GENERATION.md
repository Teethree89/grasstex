# Battle Sim Voice Callout Generation

This documents how the soldier voice callouts under `Assets/audio/voices/` were produced, so the set can be regenerated, extended, or re-cast without guesswork.

## Source of truth

`Assets/audio/manifest.json` → `callouts` is the canonical event/text/path contract, with two different jobs split across two keys per faction:

- `generation`: the source-of-truth script — a flat list of `{event, file, text}`. This is what `scripts/generate_voice_callouts.py` reads. Adding a line means adding an entry here first.
- `events`: the runtime lookup table `battle/squad-ai.js` and `battle/acoustics.js` actually read — `events.<key>` is an array of alternate-take file paths for that event, picked at random per line so the same callout doesn't repeat identically. Every file that appears in `generation` should also be listed under its event in `events` (some events also carry a few older, hand-picked files with no `generation` entry — e.g. `armor-front-01.mp3` — left untouched rather than regenerated).
- `voiceDirection`: a plain-language description of the intended character/performance for that faction, informing the delivery-style tags below rather than being consumed literally by any code.

An event can have several takes (`contact-front-01.mp3`, `-02.mp3`, ...) so the same line doesn't get repetitive; `contact` is kept as an alias of `contactFront` for backward compatibility with existing callers.

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

The manifest's per-faction `voiceDirection` text (added later, asking for "not theatrical" delivery) is intentionally *not* mixed into these tags for now: it would have made new alternate takes of an event sound calmer than the existing take of the same event, which is more jarring in-game than staying consistent. If the direction is ever revised project-wide, regenerate the whole set together (`--force`) rather than only the new lines, so every take of every event matches.

`voice_settings` used for every line:

```json
{"stability": 0.4, "similarity_boost": 0.7, "style": 0.9, "use_speaker_boost": true}
```

## Regenerating

`scripts/generate_voice_callouts.py` reads the `generation` list for every faction in `Assets/audio/manifest.json`, calls the ElevenLabs API, and writes each resulting MP3 to its declared path.

```bash
export ELEVENLABS_API_KEY=...   # never commit this key

python3 scripts/generate_voice_callouts.py            # fills in only missing files
python3 scripts/generate_voice_callouts.py --force     # regenerates everything
python3 scripts/generate_voice_callouts.py --force contactFront  # regenerates one event, both factions
```

The script needs no other configuration — voice IDs, model, tags, and settings above are the values baked into it. After adding a new line to a `generation` array (and its file to the matching `events` array), a plain run will pick it up without touching anything already recorded.

## Post-processing

Generated clips still go through the project's normal mastering pass — see `MASTERING.md` — to bring them to the -18 LUFS callout target and 48 kHz/128 kbps mono encoding:

```bash
bash scripts/normalize_audio.sh Assets/audio
```

## Is an ElevenLabs API key needed in this repo?

No, not for playback. The callouts are pre-rendered MP3s committed to `Assets/audio/voices/`; the Battle Sim only ever reads static files from the manifest and never calls ElevenLabs at runtime. A key is only needed transiently, on whichever machine runs `generate_voice_callouts.py`, and only when adding or re-recording lines.

If you want regeneration to run automatically (e.g. a CI workflow that re-synthesizes callouts when the manifest's `text` changes), a repository secret for `ELEVENLABS_API_KEY` would be needed for that workflow's job — but that's an opt-in convenience for future automation, not a requirement for anything currently in the repo.

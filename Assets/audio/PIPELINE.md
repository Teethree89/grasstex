# Audio Pipeline

How sound gets into the battle sim, end to end. `MASTERING.md` owns the loudness targets,
`ACOUSTICS.md` owns runtime propagation, and `WW2_SOURCES.md` records where the current
clips came from. This file is the route between them.

Work on this lives on the **`audio-import`** branch.

## The route

```
  source          .runtime/          Assets/audio/        manifest.json      runtime
  ──────          ─────────          ─────────────        ─────────────      ───────
  Sonniss   ─┐                                                            ┌─ buildWeaponAudio
  bundles    ├─► fetch ──► raw WAV ──► slice ──► master ──► register ─────┤  (battle-sim.js)
  Freesound ─┘   scripts   gitignored  recipes   targets   categories     └─ voice scheduler
                                                                              (acoustics.js)
```

Nothing between `fetch` and `master` is committed. The raw pulls are hundreds of megabytes
and live in gitignored `.runtime/` directories; only the sliced, mastered MP3s go in.

## 1. Fetch

| Source | Script | Notes |
| --- | --- | --- |
| Sonniss GDC bundles | `scripts/fetch_sonniss_ww2.py` | Reads each 3-4 GB zip part's central directory over an HTTP range request and pulls only the members it wants. `scan <year>` first to see what is in which part. |
| Freesound (CC0 only) | `scripts/fetch_freesound_cc0.py` | Verifies the CC0 dedication on each sound page and refuses anything else. CC-BY would put an attribution obligation on the repo; CC-BY-NC could not ship at all. |

Both write into `.runtime/`, which is gitignored.

## 2. Slice

`scripts/slice_weapon_shots.py` against a recipe in `scripts/recipes/`. Two modes per entry:

- **Transient detection** (default) finds each report by its onset, keeps 30 ms of pre-roll
  and lets the tail decay. A take named "Triple shots x 1" holds one burst and correctly
  yields one clip, not three.
- **`segments`** takes explicit time ranges, for continuous material with no transient to
  find — an engine, a turret servo.

`--check-only` validates a recipe without touching audio, and refuses two entries that would
write the same output index. Sharing a stem across sources is legal and intended: the
Garand's two takes come from different recordists and land as `-01` and `-02` via
`startIndex`.

## 3. Master

```bash
bash scripts/normalize_audio.sh Assets/audio
```

Only new or changed files are touched; the rest are skipped on the SHA-256 recorded in
`.mastering-state.tsv`. A full run costs ~40 s the first time and ~4 s after.

Two measures, picked per file — see `MASTERING.md` for the tables and the reasoning:

- **One-shots** (weapons, grenades, tank cannon and impacts, bomb explosions) are levelled on
  the **loudest 100 ms**. EBU R128 gates out anything under ~400 ms, so mastering a 0.3 s
  crack to an integrated target just peak-normalises it and perceived level ends up
  following each recording's crest factor.
- **Sustained material** (voices, engines, ambience) keeps EBU R128 integrated loudness.

Ask which a path would get, without touching it:

```bash
bash scripts/normalize_audio.sh --explain Assets/audio/grenades/explosion-01.mp3
# transient  -14.0 dBFS/100ms  Assets/audio/grenades/explosion-01.mp3
```

A path the tables do not cover is reported as `UNCOVERED` and exits non-zero. This matters
more than it looks: a file with no target is skipped by the mastering loop rather than
failing, so it ships unmastered and nothing says so. `grenades/pin`, `throw` and `bounce` sat
in the manifest in exactly that state.

## 4. Register

Add the clips to the relevant `categories` group in `manifest.json`. The runtime reads paths
straight out of it — `buildWeaponAudio` pools one Babylon voice per variation so the
round-robin hands out a different take per shot.

Categories that are declared but not yet recorded are listed in `.manifest-placeholders.txt`.
**Adding the audio means deleting its line**, and CI fails if a listed clip exists, so the
list cannot rot into a blanket excuse for missing files.

## 5. CI

`.github/workflows/ci.yml` runs on every pull request. The audio job asserts:

- the voice manifest resolves (`validate_voice_manifest.py`)
- every manifest reference exists and every committed clip is referenced
  (`check_audio_manifest.py`)
- every recipe is collision-free
- every declared category has a mastering target
- **the mastering pass changes nothing** — the check that catches audio committed without
  running step 3

That last one is independent of the runner's FFmpeg build: a tree already on standard
re-encodes nothing, so it cannot produce a diff for encoder reasons.

## Adding a category that has no audio yet

`grenades`, `aircraft`, `vehicles/tank-cannon|impact|destroyed` and
`ambience/distant-battle|wind` are declared and empty. To fill one:

1. Fetch and slice as above.
2. `bash scripts/normalize_audio.sh --explain <paths>` — confirm the method and target read
   sensibly for the material. Impact-shaped sounds want the transient path; anything that
   sustains wants integrated.
3. Master, then delete the matching lines from `.manifest-placeholders.txt`.
4. Check `prepare_incremental_deploy.py`'s `AUDIO_ASSET_GLOBS` covers the directory, or the
   files are never uploaded and the manifest 404s against the live server.

Step 4 is easy to miss. Non-voice audio was absent from the deploy plan entirely until the
WW2 import; the existing `rifle.mp3` had been put on the server by hand.

## Licensing

Two regimes, both recorded per clip in `WW2_SOURCES.md`:

- **Sonniss GDC bundles** — royalty-free, commercial use, no attribution. May **not** be used
  to train AI models, and may not be redistributed as a sound library. Shipping them inside
  the game is the intended use.
- **Freesound CC0** — public domain, no conditions.

Keep new sources to one of these two. `fetch_freesound_cc0.py` enforces the CC0 half
mechanically; the Sonniss half is a property of the bundle licence.

# Weapon sound plan

`weapon-clip-manifest.json` is the clip baseline. It lists every clip each fielded weapon needs,
one entry per action, with the sim event that triggers it. It replaces the Sonniss/Freesound
`weapons` pools and the `weaponFoley` pools in `manifest.json`. No file in it exists yet.

Check it with:

```
python3 scripts/check_weapon_clips.py            # completeness against the backend roster
python3 scripts/check_weapon_clips.py --audio    # + single-shot check on every clip that exists
python3 scripts/check_weapon_clips.py --shots f.mp3 …   # vet candidate recordings before import
```

## Why replace the current set

- **The pools are keyed by sim kind, not by gun.** `rifle` mixes the Garand with the K98k,
  M1903A3, M38 and Mosin, so a US rifleman can sound like a Soviet one. `pistol` has no
  M1911A1 shot at all (Luger, TT-33, P38). `carbine` is M3 Grease Gun bursts, although the
  scouts carry an M1 Carbine, Thompson, FG42 or MP40.
- **The automatic "shots" are bursts.** The runtime plays one clip per sim shot, so a burst
  clip overlaps more bursts. The onset check found 37 of 62 current shot clips with two or
  more onsets. MG42 clips have 21–65 onsets, PPSh 27–35, MP40 up to 11, Thompson 3–4, M1919 3–8.
- **Foley is wired to nothing.** `weaponFoley` exists in the manifest, but no code plays it.

## Roster and clip counts

Weapons come from `WEAPON_MODELS` in `battle/modules/53-fbx-soldier-backend.js`. The checker
fails if a model is fielded there but has no manifest entry.

| Weapon | Side | Sim kind | Cyclic rpm | Fire takes | P0 | P1 | P2 | Total |
|---|---|---|---|---|---|---|---|---|
| M1 Garand | US | rifle | semi | 6 | 15 | 8 | – | 23 |
| Kar98k | GE | rifle | bolt | 6 | 17 | 8 | – | 25 |
| M1 Carbine | US | carbine | semi | 6 | 13 | 8 | – | 21 |
| Thompson M1A1 | US | carbine | 700 | 8 | 15 | 11 | – | 26 |
| FG 42 | GE | carbine | 750 | 8 | 15 | 11 | – | 26 |
| MP 40 | GE | carbine | 550 | 8 | 15 | 11 | – | 26 |
| M1919A6 | US | lmg | 450 | 10 | 18 | 15 | – | 33 |
| MG 42 | GE | lmg | 1200 | 12 | 20 | 15 | 2 | 37 |
| M1911A1 | US | pistol | semi | 6 | 13 | 7 | – | 20 |
| P38 | GE | pistol | semi | 6 | 13 | 7 | – | 20 |
| Shared (casings, bullet crack/whiz) | | | | | – | 22 | – | 22 |
| **Total** | | | | | **154** | **123** | **2** | **279** |

- **P0** is the baseline that ships: close shots, reload stages, the K98k bolt cycle and the Garand ping.
- **P1** adds distant shots, burst tails, stoppages, bipods, casings and flybys.
- **P2** is the MG42 barrel change, which nothing triggers today.

## Actions and their sim triggers

| Action | Weapons | Trigger |
|---|---|---|
| `fire` | all | Each round discharged. **One discharge per file.** |
| `fireDistant` | all | Each round when the listener is past 150 m, crossfading over 100–200 m |
| `fireTail` | automatics | Once when a burst ends. Reverb only, with no transient |
| `boltCycle` | Kar98k | ~0.35 s after every shot that leaves a round |
| `clipPing` | Garand | The shot that takes ammo to 0 (en bloc ejects) |
| `reload*` stages | all | `startReload` (46-ammunition-stoppages), placed along `reloadTime` |
| `stoppageClick` | all | `startStoppage`: the hammer falls with no bang |
| `stoppageClear` | all | `finishStoppage` |
| `bipodDeploy` / `bipodFold` | M1919A6, MG42 | Backend `fx.bipod` flips when the gunner goes prone or gets up |
| `casing*` | shared | Per round within 25 m of the listener |
| `crackSupersonic` / `whizSubsonic` | shared | A round passes near the listener (.45 ACP is subsonic) |

Reload stages per mechanism:

| Weapon type | Reload stages, in order |
|---|---|
| Garand | clip insert, then bolt release |
| K98k | bolt open, stripper clip, bolt close |
| Box magazine weapons | mag out, mag in, charge |
| Belt-fed MGs | cover open, belt lay, cover close, charge |
| Pistols | mag out, mag in, slide release |

## Single-shot rule (hard)

A `singleShot` clip must pass all of these:

- It contains exactly one onset. After the first transient, the level must not climb back
  within 10 dB of peak once it has dropped 18 dB below it.
- The attack starts within 10 ms of file start.
- It fits under the action's `maxDurationS` (0.9 s for close shots, 1.5 s for distant).

Rapid fire is built at runtime by retriggering `fire` at `cyclicRpm`, round-robin with no
immediate repeat. The last round's reverb comes from `fireTail`, so the shots stay dry. When
sourcing, reject recordings that only exist as bursts. Do not slice a burst into rounds: each
slice carries the previous round's tail under its attack.

## Runtime changes this implies (not done yet)

1. **Key audio by weapon model.** `soldier` → backend weapon file (e.g. `mg42.fbx`) → manifest
   entry. The sim-kind lookup stays only as a fallback.
2. **Automatic cadence.** The sim fires automatics at an abstract `rof`: lmg 3.4/s. A real
   MG42 is 20 rounds/s. Recommendation: make this audio-only, and expand each sim shot of an
   automatic into 3–5 `fire` triggers at `60/cyclicRpm` spacing. Ballistics and ammo are unchanged.
3. **Voice pools per weapon** of at least `ceil(rpm/60 × maxDurationS) + 2`, which is 20 for
   the MG42, so fast guns never cut off their own rounds.
4. **Hook the foley events** listed above. They already exist as sim events: reload, stoppage
   and bipod.
5. **Retire the old keys.** Remove `categories.weapons` and `weaponFoley` from `manifest.json`
   once P0 lands. Keep the mastering state and loudness rules in `MASTERING.md`.

## Sourcing

This plan does not pick a vendor. Any source must:

- Provide real single-shot recordings of the exact model, not a stand-in gun.
- Allow commercial use.
- Pass `check_weapon_clips.py --shots` before import.

`scripts/fetch_freesound_cc0.py` already enforces CC0 for Freesound pulls.

## Done means

- `check_weapon_clips.py` prints `manifest complete`. It does today.
- `check_weapon_clips.py --audio` reports `P0 missing 0` and zero FAIL lines. Today it
  reports `0/279`.

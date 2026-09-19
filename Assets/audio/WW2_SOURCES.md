# WW2 Weapon, Vehicle and Artillery Sources

The battle sim's original gunshots were ElevenLabs sound generations. The clips under
`weapons/`, `vehicles/` and `ambience/artillery-distant-*` replace and extend them with
field recordings of the real weapons, cut from the Sonniss GDC Game Audio Bundles.

## Licence

The bundles are royalty-free for personal and commercial use, on unlimited projects, with
no attribution required - see <https://sonniss.com/gdc-bundle-license/>. Two conditions
matter for this repository:

- The audio may **not** be used to train AI models. The battle sim's own learning loops
  (`battle_learning.php`, `battle/ai-trainer.js`) train on engagement telemetry, not audio,
  so they are unaffected - but do not feed these files to a model.
- The sound effects may not be redistributed as a sound library. Shipping them inside the
  game is the intended use; republishing the clips as a pack is not.

## What is here

| Weapon | Pack | Bundle |
| --- | --- | --- |
| Mauser K98k | Pole Position - Mauser Karabiner 98 kurz | GDC 2020 part 7 |
| Springfield 1903A3 | Pole Position - Springfield 1903A3 | GDC 2020 part 8 |
| Mosin-Nagant M38 | Pole Position - Mosin-Nagant M38 | GDC 2020 part 7 |
| Mosin-Nagant (close/50 m) | FLYSOUND - Mosin Nagant | GDC 2020 part 4 |
| MP 40 | Fascinated Sound - The Gun Locker; Pole Position - MP 40 (250 m) | GDC 2016 part 2, 2020 part 7 |
| Thompson M1928A1 | Pole Position - Thompson 1928A1; M1928A1 .45cal | GDC 2020 part 8, 2016 part 4 |
| PPSh-41 | Pole Position - Tokarev PPSh-41 | GDC 2020 part 9 |
| M3 "Grease Gun" | Pole Position - M3 Submachine; Super Thump - M3 Recorded Source | GDC 2016 part 4, 2020 part 13 |
| MG 42 | Pole Position - MG 42 machine gun | GDC 2020 part 7 |
| M1918 BAR | Pole Position - M1918 Browning Automatic Rifle | GDC 2016 part 4 |
| M1919A4 Browning | Pole Position - M1919A4 (ground and turret); Super Thump - WW2 Designed | GDC 2016 part 4, 2020 part 13 |
| Walther P38 | Pole Position - Walther P38 | GDC 2020 part 9 |
| Tokarev TT-33 | Pole Position - Tokarev TT-33 | GDC 2020 part 9 |
| Luger | Super Thump - Weapons of World War II - Designed | GDC 2020 part 13 |
| Colt M1911A1 (downrange) | Pole Position - Colt M1911A1 | GDC 2020 part 6 |
| M101 105 mm howitzer | Airborne Sound - Battlefield Howitzers | GDC 2019 part 1 |
| T-34-85 | Pole Position - T-34-85 Russian World War II Tank | GDC 2016 part 4 |

`weapons/distant/` equivalents (`smg-mp40-distant-*`, `pistol-m1911a1-downrange-*`) were
recorded downrange rather than at the muzzle. They are the report as it arrives across a
field, not the crack beside the shooter, and reading them as ordinary one-shots will sound
wrong up close.

## Reproducing the pull

The bundles ship as 3-4 GB zip parts and the WW2 packs are about 500 MB of that, so the
fetch reads each part's central directory over an HTTP range request and pulls only the
members it wants. Roughly 860 MB moves instead of 90 GB.

```bash
python3 scripts/fetch_sonniss_ww2.py scan  2020                    # what is in which part
python3 scripts/fetch_sonniss_ww2.py fetch 2020 --out .runtime/sonniss-ww2
python3 scripts/fetch_sonniss_ww2.py fetch 2016 --parts 2 4 --out .runtime/sonniss-ww2
python3 scripts/fetch_sonniss_ww2.py fetch 2019 --parts 1 --pattern howitzer --out .runtime/sonniss-ww2

python3 scripts/slice_weapon_shots.py scripts/recipes/ww2-sonniss.json
bash scripts/normalize_audio.sh Assets/audio
```

The raw pulls stay in `.runtime/sonniss-ww2/` and are gitignored; only the sliced, mastered
MP3s are committed.

## Slicing

Each source take is a minute of range work holding a handful of shots with the mic left
running between them. `scripts/slice_weapon_shots.py` finds each report by its transient,
keeps 30 ms of pre-roll, and lets the tail decay before cutting. A take named
"Triple shots x 1" contains one burst and correctly yields one clip, not three.

Continuous material - the T-34's engine and turret - has no transient to find, so those
recipe entries name explicit `segments` time ranges picked off the level profile instead.

## Mastering

Mastering is `scripts/normalize_audio.sh` against the targets in `MASTERING.md`. Levelling
these packs is what prompted the one-shot standard documented there: mastered to integrated
loudness they spanned 17 dB of perceived level, and on the loudest-100 ms measure they sit
inside about 4 dB.

Run the script against the whole tree (`bash scripts/normalize_audio.sh Assets/audio`); it
skips anything whose recorded hash still matches, so only new or changed clips are touched.

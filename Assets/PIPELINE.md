# Soldier and weapon asset pipeline

This is the accepted workflow for bringing a new character or weapon into the Battle Sim. Raw
generator exports (Meshy, auto-riggers) always need these steps; do not load them straight into
the game. Runtime behaviour is described in `battle/ANIMATION_CONTRACT.md`.

Blender: use the app bundle, `/Applications/Blender.app/Contents/MacOS/Blender`
(the `blender` on PATH is a broken install).

## Soldiers (`Assets/soldiers/<faction>-<name>.fbx`)

Requirements for the source FBX: one skinned mesh, one armature using the shared bone names
(`Hips`, `Spine02`, `Spine01`, `Spine`, `neck`, `Head`, `head_end`, `headfront`,
`Left/RightShoulder/Arm/ForeArm/Hand`, `Left/RightUpLeg/Leg/Foot/ToeBase`), at most 4-8 influences
per vertex. Extra end bones are fine. Rest orientations and units may differ: clips are retargeted
at load.

1. Repair and re-export (never changes the armature):

   ```
   Blender -b --factory-startup --python tools/fix-soldier-model.py -- \
     --input <raw>.fbx --output Assets/soldiers/<faction>-<name>.fbx --texture-name <faction>-<name>-albedo
   ```

   - rewinds inside-out faces, drops normal maps (Babylon's FBX loader shades them as blotches),
     removes stray emissive/alpha wiring, embeds the albedo as a unique JPEG name (identical embedded
     names such as `texture_0.png` or `bpy.fbm` make Babylon hand one soldier the other's texture);
   - add `--fit-skin` only if the skin sits off its skeleton: the script prints the mean forward
     offset between limb joints and the skin they drive (a good fit is under ~1-2 cm).
2. Use lowercase file names (the web host is case-sensitive; macOS is not: rename with `git mv`).
3. Register the pair in `MODEL_SETS` in `battle/modules/53-fbx-soldier-backend.js`.
4. Verify before committing:
   - bone rest transforms unchanged against the raw file (0 cm, < 0.1 degree);
   - the backend log says `FBX soldiers ready: <set> ...` and whether it retargeted;
   - a posed lineup (idle, aim, walk + aim, run, crouch aim, crouch walk, prone, reload, deaths)
     from front, side and behind, lit, with no holes or dark patches; rifle yaw/pitch within a few
     degrees of the target while aiming;
   - the two factions show different textures.

## Animations (`Assets/animations/<clean name>.fbx`)

`Assets/animations/new/` is the source library (Mixamo exports on our rig, in place or with root
motion); it is not deployed. To use a clip, copy it to `Assets/animations/` under a short lowercase
name and add a key to `CLIPS` (or a family: `FAMILIES` 8-way, `FOUR_WAY` 4-way) in the backend.
Only top-level `Assets/animations/*.fbx` files deploy. In-place loops get their speed from the
feet automatically; one-shot clips keep their authored travel. `battle/ANIMATION_CATALOG.md` lists
what is used and what is still available.

## Weapons (`Assets/weapons/<name>.fbx`)

Keep the untouched source pack (e.g. the Meshy `.zip`) next to it; only `.fbx` files deploy.

1. Prepare (orients, scales to real length, lays out for the hand calibration, 512 px albedo only):

   ```
   Blender -b --factory-startup --python tools/prepare-weapon-model.py -- \
     --input <raw>.fbx --output Assets/weapons/<name>.fbx --name <name> --length <metres>
   ```

   Layout: barrel along Babylon +Z, butt 0.40 m behind the grip origin, barrel top 0.03 m above it.
   Real lengths: M1 Garand 1.107, Kar98k 1.11, MG42 1.224, M1919A6 1.346.
   Machine guns exported with the bipod deployed: add `--fold-bipod` (legs folded forward and
   tucked under the barrel, for carrying and hip fire).
2. Check the printed muzzle/butt positions and render a side view: sights up, trigger down.
3. Measure where the hands go (weapon-local metres: right-hand `grip` on the wrist of the stock or
   pistol grip, left-hand fore-end line `[x, y, zFrom, zTo]`) and add them to `WEAPON_POINTS`.
   Register the file in `WEAPON_MODELS` under the faction and role kind (`rifle`, `carbine`, `lmg`,
   `pistol`) in the backend; unregistered kinds keep the procedural box weapon (pistol for now).
5. Verify in the lineup: stock at the shoulder, right hand on the wrist, left hand on the fore-end,
   every weapon at world scale 1 and on the hand.

## Muzzle flashes (`Assets/effects/muzzle-flash/NN.png`)

End-on flash sprites (looking down the barrel), centred on the flash. Keep the source pack zip.

```
python3 tools/prepare-muzzle-flashes.py --input <pack>.zip --output Assets/effects/muzzle-flash
```

Resizes to 256 px (13 x 1254 px, ~13 MB -> ~750 KB). The runtime (`BattleMuzzleFlash` in
`battle/modules/13-combat-fx-consistency.js`) picks one at random per shot, rolls it about the
barrel, and sizes it per weapon (`FLASH_SIZE` by kind, `FLASH_MODEL_SIZE` per model file). If the
number of images changes, update `FLASH_COUNT`.

## Deploy and preview

`scripts/prepare_incremental_deploy.py` uploads `Assets/soldiers`, `Assets/animations` and
`Assets/weapons` `.fbx` files and the muzzle-flash `.png` files by content hash. Pushing a `work/**` branch publishes
`https://test.ivandpopov.com/grasstex/preview/<slug>/battle_sim.php`, which carries its own copy of
these folders, so new models can be checked before they reach production.

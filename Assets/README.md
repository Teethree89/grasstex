# Grasstex assets

This directory is the canonical deployable asset tree for the hosted Grasstex demo and Battle Sim.

Expected root textures:
- grasstex0.png through grasstex5.png
- filltex.png
- dirttex.png
- roadtex.png
- skytex.png

Expected baked terrain pack:
- terrain/terrain.json
- terrain/terrain.bin
- terrain/splat.png
- terrain/roaduv.png

Battle audio is tracked here directly:
- audio/rifle.mp3
- audio/carbine.mp3
- audio/lmg.mp3
- audio/pistol.mp3
- audio/voices/us/*.mp3, audio/voices/ge/*.mp3 (soldier callouts; see `audio/VOICE_GENERATION.md`)

Imported soldiers are tracked here directly (see `battle/ANIMATION_CONTRACT.md`):
- soldiers/us-rifleman-rigged.fbx, soldiers/ge-rifleman-rigged.fbx (rigged, textured characters)
- animations/*.fbx (animation-only Mixamo rifle clips on the same rig; loaded by name)

The deploy plan (`scripts/prepare_incremental_deploy.py`) uploads both folders by content hash.

`battle_sim.php` mirrors every Git-tracked file under `Assets/` to the hosted `Assets/` directory without deleting hosted files that are not yet present in Git. This lets the current 50webs texture/terrain files continue working while their exact binaries are imported into this tree.

# Baked terrain asset slot

The live grass demo expects these binary files in this directory:

- terrain.json
- terrain.bin
- splat.png
- roaduv.png

They currently exist only on the 50webs deployment and were never committed to Git history. Do not add placeholder files with these names: the runtime should continue using the existing hosted binaries until their exact bytes are imported here.

Once exact copies are committed, `battle_sim.php` will mirror them to the hosted `Assets/terrain/` directory automatically.

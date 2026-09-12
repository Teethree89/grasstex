# grasstex

Reusable Babylon.js grass rendering prototype with deterministic chunk generation, near/medium/far LOD, streamed thin instances, wind, fill patches, image-based shadows, placement/masking, rough-terrain sampling, and a deformed horizon-road demo.

Current demo build: **v64**.

## Grass simulation is gated off by default

Grass rendering (from this repo) has been ported over to and tuned inside `ww2fps`, so
`grass-streaming.js` (chunk streaming/instance placement) and `grass-effects.js` (projected
grass shadow decals) no longer do anything unless asked to. The terrain, its road, and the
lighting/fog/sky setup in `grass-realism.js` are unaffected and keep working as before - only
the grass blades themselves are gated.

To turn the simulation back on for reference or prototyping, either open the page with
`?grass=1` or set `window.GRASS_SIM_ENABLED = true` before `grass-api.js` loads:

```html
<script>window.GRASS_SIM_ENABLED = true;</script>
<script src="grass-api.js"></script>
```

See `window.GrassSimulation` in `grass-api.js` for the flag itself.

## Battle sim (WW2 squad AI prototype)

A 50v50 US-vs-German battle sim used to test squad AI, not to look good - the terrain reuses
this repo's rolling-landscape shape and the soldiers/weapons are rudimentary low-poly
primitives built at runtime (see `battle/soldier.js`). It does not load any of the grass
files above.

The real page is `battle/battle_sim.html`; open it directly for local work (`python3 -m
http.server` from the repo root, or just double-click it). The root `battle_sim.html` is a
self-fetching loader in the same shape as `index.html`/`game.html` - it pulls
`battle/battle_sim.html` and the four `battle/*.js` files straight from GitHub `main` at load
time and inlines them, so it's the one file that needs to exist on a static host (like the
50webs deploy this repo already uses) for the battle sim to be reachable there; nothing else
ever needs re-uploading; a push to `main` is live immediately. Append `?ref=<branch>` to test
a branch there before it merges, e.g. `battle_sim.html?ref=claude/model-lab-runners-commits-b9s5ll`.

Five 10-soldier squads a side (1 captain, 1 gunner, 2
scouts, 6 riflemen - see `battle/squad-ai.js`'s `COMPOSITION`) spawn on opposite edges of the
field and advance, engage, and retreat on their own:

- **Captain** - pistol, formation anchor; the squad's accuracy drops if it dies.
- **Riflemen** - the bulk of the squad, hold a loose line either side of the captain.
- **Gunner** - LMG, stops and "sets up" once engaged for an accuracy bonus, otherwise slow.
- **Scouts** - fastest, carbines, swing out to the flanks rather than advancing head-on.

A squad falls back once 60% of it is down. Combat is resolved on a fixed ~6.7 Hz AI tick
(`battle/squad-ai.js`), independent of render framerate; targeting uses a terrain-height-only
line-of-sight check (hills can block a shot, nothing else can yet). The HUD shows alive/kill
counts per side, a speed multiplier, and a restart button; `window.__battle__` is the live
`BattleSim` instance for poking at from the console.

Known limitations, since this is a starting point for further modeling/AI work rather than a
finished sim: no soldier-blocks-soldier occlusion, no cover objects, no pathfinding around
terrain (everything steers straight at its destination), and the models/weapons are
placeholder primitives rather than real assets.

## Main files

- `game.html` — current demo loader/build.
- `grass-api.js` — reusable placement, exclusion, terrain-height, normal, and slope API.
- `grass-streaming.js` — deterministic chunk streaming and LOD instance generation.
- `grass-realism.js` — grass shaders, fill texture shader, lighting integration, sky setup, and world-locked dirt.
- `grass-effects.js` — projected grass shadows/effects.
- `terrain-demo.js` — rolling terrain demo, road deformation brush, `roadtex.png` painted into the terrain material, camera terrain following, and terrain shadow setup.
- `bodycam.js` — optional camera/post-processing layer used by the demo.
- `Assets/` on the hosted demo — grass/fill/sky/dirt/road textures.

## Recommended load order

```html
<script src="babylon.js"></script>
<script src="grass-api.js"></script>
<script src="terrain-demo.js"></script> <!-- demo only -->
<script src="grass-streaming.js"></script>
<script src="grass-realism.js"></script>
<script src="grass-effects.js"></script>
```

`grass-api.js` creates `window.GrassAPI` and exposes `window.GrassPlacementAPI`.

## Placement and exclusion API

With no inclusion areas or exclusions, grass is allowed everywhere. Once inclusion areas exist, grass is generated only inside them.

```js
GrassAPI.addArea({
  type: "polygon",
  points: [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 80 },
    { x: 0, z: 80 }
  ]
});
```

Road/path exclusion:

```js
GrassAPI.excludeCorridor([
  { x: 0, z: 10 },
  { x: 30, z: 12 },
  { x: 60, z: 18 },
  { x: 100, z: 20 }
], 6);
```

Other helpers:

```js
GrassAPI.excludeCircle(x, z, radius);
GrassAPI.excludeBox(x, z, width, depth, rotationRadians);
GrassAPI.excludePolygon(points);
GrassAPI.excludeSegment(start, end, clearance);
```

Supported shape types: `polygon`, `circle`, `box`, `corridor`, `segment`.

## Surface filtering

```js
GrassAPI.setSurfaceResolver((x, z) => terrainSurfaceAt(x, z));
GrassAPI.excludeSurface("road");
GrassAPI.excludeSurface("concrete");
GrassAPI.excludeSurface("building");
```

Allow-list mode:

```js
GrassAPI.allowSurface("terrain");
GrassAPI.allowSurface("meadow");
```

## Rough terrain

The grass system can sample arbitrary terrain once when clumps are generated. Height/normal values are baked into thin-instance matrices; there is no per-frame raycast for every clump.

```js
GrassAPI.setTerrainSampler((x, z) => ({
  height: terrainHeightAt(x, z),
  normal: terrainNormalAt(x, z)
}));

GrassAPI.setMaxSlope(42);
```

A sampler may return:

```js
{
  height: 2.35,
  normal: { x: -0.1, y: 0.98, z: 0.16 },
  slope: 11.5 // optional degrees; derived from normal when omitted
}
```

For Babylon terrain meshes:

```js
GrassAPI.setTerrainMesh(terrainMesh);
```

Useful methods:

```js
GrassAPI.sampleTerrain(x, z);
GrassAPI.setTerrainSampler(fn);
GrassAPI.clearTerrainSampler();
GrassAPI.setTerrainMesh(mesh);
GrassAPI.setMaxSlope(degrees);
```

Near, medium, far, fill patches, and projected grass shadows all inherit the sampled terrain Y position. Fill patches also use the terrain normal so they lie against slopes.

### Sample the rendered mesh, not the analytic surface

A height function and the mesh built from it are not the same surface. The GPU draws flat triangles between vertices, so placing grass at `heightAt(x, z)` puts it on a surface that is not the one being drawn — at the old uniform 4.69 m spacing that gap reached 0.41 m beside the road.

Measured against the real Babylon index buffer, that gap is 1.5 cm in open field but up to **0.41 m beside the road** — grass floating in the air on one side, sunk into the ground on the other, with decal shadows detached to match.

`sampleAt` therefore reads the baked vertex grid and interpolates the same triangle the GPU rasterizes, returning that triangle's face normal:

```js
// CreateGround: vertex = col + row*(SUBDIV+1), x rises with col, z FALLS with row.
// Each cell splits into (A,B,C) where u >= v, and (D,A,C) otherwise.
var k = i + j*GRID, hC = gridH[k], hB = gridH[k+1], hD = gridH[k+GRID], hA = gridH[k+GRID+1];
h = (u >= v) ? hC + u*(hB-hC) + v*(hA-hB)
             : hC + v*(hD-hC) + u*(hA-hD);
```

This is exact by construction at any subdivision — verified to 1e-14 m against ray-triangle intersection on the actual mesh — and it is also **~5.8× cheaper** than the analytic sampler, which spent five `heightAt` calls (twenty trig evaluations) per clump. Camera follow uses the same sampler, so the player walks on the drawn ground too.

Keep the analytic path as the fallback for positions outside the mesh, and remember that grass, fill patches, shadows, and camera height must all agree on *one* definition of "the ground".

### Grading the mesh around the corridor

Sampling the drawn mesh puts grass on the ground, but it does not make a 1.15 m ditch visible when vertices are 4.69 m apart — the road profile simply is not in the geometry. Because the demo road is straight along Z, only X needs refining, so the terrain is built by hand from a non-uniform column table instead of `CreateGround`:

```js
function colSpacing(a){            // a = |x| from the road centreline
  if (a <=   9) return 0.25;       // resolve crown, shoulders, ditch
  if (a <=  35) return lerp(0.25, 4.6875, smoothstep(a));
  if (a <= 150) return 4.6875;     // unchanged from before
  return 9.375;                    // far field, heavily fogged - pays for the corridor
}
```

Coarsening past 150 m funds the detail, so this costs **+4.7% triangles** (137,216 vs 131,072) while going from 0–1 columns across the ditch drop to five, and 13 across the crown. Rendered-vs-true profile error in the corridor falls from **0.429 m to 0.023 m**; the only regression is 1.6 cm → 4.2 cm beyond 150 m, under fog.

Two things must move together with the table, or the floating-grass bug returns:

- **`sampleAt` must use the real column width.** The triangle split (`u >= v`) is parametric and unaffected by cell aspect, but the X gradient becomes `(hB - hC) / (colX[i+1] - colX[i])`, not a constant. Column lookup is an O(1) bucket table plus a one-step correction, with buckets no wider than the finest column.
- **UVs must stay world-linear in X** (`uv.x = (x + SIZE/2) / SIZE`). `CreateGround` uses `col / subdivisions`, which with non-uniform columns would squeeze the dirt tiling into the narrow corridor.

The hand-built mesh keeps `CreateGround`'s exact vertex and index layout — vertex `col + row*GRID`, x rising with col, z *falling* with row, each cell split `(A,B,C)`/`(D,A,C)` — so the sampler indexes the same triangles the GPU rasterizes. Indices must be `Uint32Array`; the grid is well past 65,535 vertices.

## Projected grass shadows on rough terrain

A projected shadow is a grass card flattened onto the ground and stretched by `1/tan(sunElevation)` (clamped to 4.2), so at the demo's low sun it spans roughly 4.5 m. Anchoring that whole quad to a single Y buried its far tip in rising ground, so `grass-effects.js` instead tilts each shadow into the terrain's tangent plane at its clump:

```js
// per instance, from the normal the terrain sampler already returned
grad = [-normal.x / normal.y, -normal.z / normal.y];
```

```glsl
wp.y = clumpY + SHADOW_Y + dot(wp.xz - clumpXZ, instanceGrad);
```

This is exact to first order and needs no extra terrain sampling — the normal is already computed for slope rejection and fill patches. Measured over a 4.4 m shadow, mean vertical error drops from 4.5 cm to 0.4 cm and worst case from 28.6 cm to 2.3 cm, which is what keeps the quad above `SHADOW_Y` (3 cm) instead of clipping through hillsides.

Since the sampler returns the rendered triangle's face normal, the gradient is that triangle's own plane — so within a triangle the shadow lies exactly in the surface being drawn, not merely close to it.

The bake is deferred until `GrassAPI.snapshot().hasTerrainSampler` is true and re-runs whenever the API `revision` changes. `terrain-demo.js` boots asynchronously (it waits on the `CustomMaterial` CDN script), so without that the first bake would run with no terrain sampler — flattening every shadow to y=0 — and would leave shadows painted across the road until movement hysteresis happened to trip a rebuild.

Shadow alpha must reach zero at `SHADOW_END`. If it is still non-zero where the fragment shader discards, every streaming rebuild pops a whole ring of shadows in and out at that opacity as you cross chunks. `SHADOW_END`, `SHADOW_FADE_START`, `HYST`, and `PAD` are the cost knobs: shadow range and rebuild hysteresis together dominate streaming cost, since each clump bake runs a mask test plus a terrain sample.

## Far LOD on hills

Streaming ranges remain based on horizontal X/Z distance, so hills do not cause extra chunks to load merely because terrain rises vertically. Far density remains 1/7. Terrain height only changes the instance Y coordinate.

## Demo road deformation

`terrain-demo.js` demonstrates a terrain-native road rather than a floating flat strip.

The road:

- passes through spawn and extends across the full 1200 m demo terrain;
- uses `roadtex.png` mapped once across the full cross-section and repeated along road length;
- deforms terrain with a cross-section brush containing a crowned center, shoulders, drainage ditches, and smooth recovery to the untouched landscape;
- uses a generated edge opacity/splat texture to feather the textured road into surrounding dirt;
- clears grass with an exclusion corridor so near/medium/far grass and fill patches are never generated through the road footprint.

The important functions exposed by the demo are:

```js
GrassTerrainDemo.heightAt(x, z);
GrassTerrainDemo.sampleAt(x, z);
GrassTerrainDemo.road.profileOffset(crossRoadX);
GrassTerrainDemo.road.blend(crossRoadX);
```

A production road spline can use the same idea by evaluating each terrain point in road-local coordinates: longitudinal distance along the spline plus signed cross-road distance. Feed the cross-road distance to the profile brush, blend the result into the native terrain, and use the same centerline for the grass exclusion corridor.

## Terrain and road lighting / shadows

v57 enables standard Babylon lighting on both the terrain and `roadtex.png` road material and adds a `CascadedShadowGenerator` driven by the existing directional sun.

```js
terrain.receiveShadows = true;

const shadows = new BABYLON.CascadedShadowGenerator(1024, sun);
shadows.numCascades = 3;
shadows.addShadowCaster(terrain, true);
```

Since v58 the road is painted into the terrain material rather than being its own mesh, so there is no separate road mesh to register — the terrain carries the road and its shadowing together.

This lets rolling terrain cast long sunset shadows onto itself and onto the road. Cascades preserve substantially more near-camera shadow resolution than one giant orthographic shadow map covering the entire 1200 m terrain.

The road remains a normal lit `StandardMaterial`; `roadtex.png` is its diffuse texture. v57 slightly raises the material/texture response so the texture remains legible at the very low-angle sunset used by the demo instead of collapsing toward near-black.

## Dynamic buildings or map editing

Mask changes automatically request a rebuild when `autoRebuild` is enabled.

For bulk setup:

```js
GrassAPI.autoRebuild = false;

GrassAPI.excludeCorridor(roadA, 6);
GrassAPI.excludePolygon(houseA);
GrassAPI.excludeSegment(wall.start, wall.end, wall.width * 0.5 + 0.25);

GrassAPI.autoRebuild = true;
GrassAPI.requestRebuild();
```

## Clearing and querying masks

```js
GrassAPI.clearExclusions();
GrassAPI.clearIncludes();
GrassAPI.clearAreas();

if (GrassAPI.isAllowed(worldX, worldZ)) {
  // valid grass position
}

console.log(GrassAPI.snapshot());
```

## API reference

```js
GrassAPI.addArea(shape)
GrassAPI.includeArea(shape)
GrassAPI.excludeArea(shape)
GrassAPI.excludeCircle(x, z, radius)
GrassAPI.excludeBox(x, z, width, depth, rotationRadians)
GrassAPI.excludePolygon(points)
GrassAPI.excludeCorridor(pathPoints, width)
GrassAPI.excludeSegment(start, end, clearance)

GrassAPI.allowSurface(name)
GrassAPI.disallowSurface(name)
GrassAPI.excludeSurface(name)
GrassAPI.includeSurface(name)
GrassAPI.setSurfaceResolver(fn)

GrassAPI.setTerrainSampler(fn)
GrassAPI.clearTerrainSampler()
GrassAPI.setTerrainMesh(mesh)
GrassAPI.sampleTerrain(x, z)
GrassAPI.setMaxSlope(degrees)

GrassAPI.isAllowed(x, z, context?)
GrassAPI.test(x, z, context?)
GrassAPI.clearIncludes()
GrassAPI.clearExclusions()
GrassAPI.clearAreas()
GrassAPI.requestRebuild()
GrassAPI.snapshot()
```

## Determinism

The streamer consumes the complete deterministic RNG sequence for each candidate before placement, terrain, slope, or exclusion filtering. Given the same world seed, terrain sampler, and mask data, clients generate the same surviving grass clumps without networking every blade.

## Current integration boundary

The placement/terrain API is reusable, while the visual renderer still relies on demo globals such as `scene`, `camera`, `nearTypes`, `medTypes`, `farTypes`, `density`, and `CHUNK`. A future package cleanup can wrap those globals behind a `GrassSystem` class without changing the placement or terrain-sampling interface documented above.

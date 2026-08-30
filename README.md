# grasstex

Reusable Babylon.js grass rendering prototype with deterministic chunk generation, near/medium/far LOD, streamed thin instances, wind, fill patches, image-based shadows, placement/masking, rough-terrain sampling, and a deformed horizon-road demo.

Current demo build: **v63**.

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

A height function and the mesh built from it are not the same surface. `CreateGround` at `SUBDIV = 256` over 1200 m puts vertices 4.69 m apart, and the GPU draws flat triangles between them — but the road's cross-section brush (crown, shoulders, ditches, recovery) varies over 1–2 m, and the blend back to open landscape happens across only 1.75 m. The mesh cannot represent any of that, so placing grass at `heightAt(x, z)` puts it on a surface that is not the one being drawn.

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

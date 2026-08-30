# grasstex

Reusable Babylon.js grass rendering prototype with deterministic chunk generation, near/medium/far LOD, streamed thin instances, wind, fill patches, image-based shadows, placement masks, and terrain height/slope support.

Current demo build: **v55**.

## Main files

- `game.html` — current demo loader/build.
- `grass-api.js` — placement, exclusion, surface, terrain-height, terrain-normal, and slope API.
- `grass-streaming.js` — deterministic chunk streaming, terrain sampling, and LOD instance generation.
- `grass-realism.js` — grass shaders, fill texture shader, lighting integration, sky setup, and dirt material.
- `grass-effects.js` — projected grass shadows/effects; shadow roots follow sampled terrain height.
- `terrain-demo.js` — v55 bumpy-terrain reference adapter used by the demo.
- `bodycam.js` — optional camera/post-processing layer.
- `Assets/` — grass/fill/sky/dirt textures.

## Recommended load order

```html
<script src="babylon.js"></script>

<!-- Your base grass renderer / mesh setup -->
<script src="grass-api.js"></script>

<!-- Configure terrain sampling here, before grass-streaming.js -->
<script src="grass-streaming.js"></script>
<script src="grass-realism.js"></script>
<script src="grass-effects.js"></script>
```

`grass-api.js` creates `window.GrassAPI` and exposes the constructor `window.GrassPlacementAPI`.

# Terrain / rough landscape support

The engine no longer assumes grass is at `y = 0`. Each deterministic candidate can be sampled against the project's terrain **once when its chunk is built**. The resulting height is baked into the near, medium, and far thin-instance matrices, so there is no per-frame terrain raycast cost.

The current v55 demo uses `terrain-demo.js`, which replaces the flat visual ground with a subdivided rolling landscape and registers an analytic terrain sampler with the grass API.

## Custom terrain sampler

The most general integration is:

```js
GrassAPI.setTerrainSampler((x, z, context) => {
  return {
    height: terrainHeightAt(x, z),
    normal: terrainNormalAt(x, z)
  };
});
```

The sampler may return:

```js
{
  height: 3.2,
  normal: { x: -0.08, y: 0.99, z: 0.04 }
}
```

It may also supply `slope` directly in degrees:

```js
{
  height: 3.2,
  normal: { x: -0.08, y: 0.99, z: 0.04 },
  slope: 8.4
}
```

If `slope` is omitted, the API derives it from the normal.

A sampler may return only a number when only height is available:

```js
GrassAPI.setTerrainSampler((x, z) => terrainHeightAt(x, z));
```

In that case the normal defaults to straight up and slope filtering cannot distinguish steep terrain.

## Babylon GroundMesh helper

For a Babylon terrain mesh that implements `getHeightAtCoordinates()`:

```js
GrassAPI.setTerrainMesh(terrainMesh);
```

The API will use the mesh height method and, when available, its normal-at-coordinate method.

For very large worlds or custom terrain engines, a direct sampler is usually preferable because it can use the same heightfield/terrain data that generated the mesh without doing raycasts.

## Maximum slope

Grass can be prevented from growing on cliffs, rock faces, steep embankments, etc.:

```js
GrassAPI.setMaxSlope(42); // degrees
```

The v55 demo uses:

```js
GrassAPI.setMaxSlope(38);
```

Candidates steeper than the configured limit are rejected before any near/medium/far/fill instance is written.

To remove the terrain adapter:

```js
GrassAPI.clearTerrainSampler();
```

The engine then falls back to flat `y = 0` placement.

## What follows the terrain

In v55:

- near crossed-card grass is translated to sampled terrain height;
- medium billboards use the same sampled height;
- far billboards use the same sampled height;
- `filltex` patches use the same height and are oriented to the sampled terrain normal;
- grass-shadow roots use the same sampled terrain height;
- the demo camera follows the bumpy terrain while preserving bodycam bob/breathing.

The grass blades themselves remain mostly upright instead of tilting fully to the ground normal. This is intentional: real grass generally grows upward even when rooted on a slope. The fill patch follows the surface because it represents low ground cover.

## Far draw on rough terrain

The streaming ring still uses horizontal **XZ ground distance**, so hills do not cause extra chunks to stream simply because they are higher or lower. Current distances remain:

```text
Near:   0–30 m
Medium: 30–165 m
Far:    150–242 m
```

Far grass therefore receives the same terrain height as near and medium grass and continues across hills instead of hovering at sea level.

The shader-level LOD distance in the current realism shaders is still a 3D camera-to-clump distance. On ordinary rolling terrain the difference from XZ distance is tiny; for example, a 5 m elevation difference at roughly 240 m changes the effective distance by only about 0.05 m. For extreme mountainous maps, a future integration can switch those shader tests to XZ distance if strict horizontal LOD bands are desired.

The far density behavior is unchanged: far LOD still uses the deterministic sparse representation rather than restoring full clump density.

# Placement masks

With no inclusion areas or exclusions defined, grass is allowed everywhere.

To restrict grass to a particular region:

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

Once at least one inclusion exists, grass is generated only inside an included area.

`includeArea()` is an alias for `addArea()`.

# Excluding roads, buildings, walls, trenches, etc.

Exclusions are tested before a candidate clump enters the thin-instance buffers. Excluded grass is never rendered.

## Road / path / ditch

```js
GrassAPI.excludeCorridor([
  { x: 0, z: 10 },
  { x: 30, z: 12 },
  { x: 60, z: 18 },
  { x: 100, z: 20 }
], 6);
```

## Rectangular building

```js
GrassAPI.excludeBox(
  40,              // center x
  35,              // center z
  12,              // width
  18,              // depth
  Math.PI / 8      // rotation radians
);
```

## Irregular footprint

```js
GrassAPI.excludePolygon([
  { x: 20, z: 20 },
  { x: 31, z: 20 },
  { x: 34, z: 29 },
  { x: 25, z: 35 },
  { x: 18, z: 29 }
]);
```

## Wall footprint

```js
GrassAPI.excludeSegment(
  { x: 10, z: 10 },
  { x: 55, z: 10 },
  0.5
);
```

## Circular clearance

```js
GrassAPI.excludeCircle(25, 40, 3.5);
```

Supported shapes are `polygon`, `circle`, `box`, `corridor`, and `segment`.

# Surface/material filtering

```js
GrassAPI.setSurfaceResolver((x, z) => {
  return terrainSurfaceAt(x, z); // "terrain", "road", "concrete", etc.
});

GrassAPI.excludeSurface("road");
GrassAPI.excludeSurface("concrete");
GrassAPI.excludeSurface("building");
```

Or use an allow-list:

```js
GrassAPI.allowSurface("terrain");
GrassAPI.allowSurface("meadow");
```

# Dynamic map editing

Mask, terrain, surface, or slope changes automatically request a grass rebuild unless `autoRebuild` is disabled.

For bulk setup:

```js
GrassAPI.autoRebuild = false;

GrassAPI.setTerrainSampler(sampleTerrain);
GrassAPI.setMaxSlope(40);
GrassAPI.excludeCorridor(roadA, 6);
GrassAPI.excludePolygon(houseA);
GrassAPI.excludeSegment(wall.start, wall.end, 0.5);

GrassAPI.autoRebuild = true;
GrassAPI.requestRebuild();
```

# Clearing / querying

```js
GrassAPI.clearExclusions();
GrassAPI.clearIncludes();
GrassAPI.clearAreas();
GrassAPI.clearTerrainSampler();

if (GrassAPI.isAllowed(worldX, worldZ)) {
  // XZ placement masks permit grass here.
}

const terrain = GrassAPI.sampleTerrain(worldX, worldZ);
console.log(terrain.height, terrain.normal, terrain.slope);
```

`test()` is an alias for `isAllowed()`.

# API reference

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
GrassAPI.setTerrainMesh(mesh)
GrassAPI.clearTerrainSampler()
GrassAPI.sampleTerrain(x, z, context?)
GrassAPI.setMaxSlope(degrees)
GrassAPI.isSlopeAllowed(sample)

GrassAPI.isAllowed(x, z, context?)
GrassAPI.test(x, z, context?)

GrassAPI.clearIncludes()
GrassAPI.clearExclusions()
GrassAPI.clearAreas()
GrassAPI.requestRebuild()
GrassAPI.snapshot()
```

`snapshot()` now includes `maxSlope` and `hasTerrainSampler` in addition to the placement/surface rules.

# Determinism

`grass-streaming.js` consumes the complete deterministic random sequence for a candidate before performing placement, terrain, and slope filtering. That means filtering does not shift the RNG sequence for later clumps in the same chunk.

For deterministic multiplayer maps, every client should use the same world seed, inclusion/exclusion geometry, terrain sampler data, surface classifications, and maximum-slope rule. Individual grass clumps then do not need to be networked.

# Larger-project integration

A world generator should own authoritative roads/buildings/terrain and register them with the grass API while constructing the map:

```js
GrassAPI.autoRebuild = false;
GrassAPI.setTerrainSampler(world.sampleTerrain);
GrassAPI.setMaxSlope(40);
GrassAPI.addArea({ type: "polygon", points: playableTerrainPolygon });

for (const road of roads)
  GrassAPI.excludeCorridor(road.centerline, road.width + 1.0);

for (const building of buildings)
  GrassAPI.excludePolygon(building.footprint);

for (const wall of walls)
  GrassAPI.excludeSegment(wall.start, wall.end, wall.width * 0.5 + 0.25);

GrassAPI.autoRebuild = true;
GrassAPI.requestRebuild();
```

The visual renderer is still partly coupled to demo globals such as `scene`, `camera`, `nearTypes`, `medTypes`, `farTypes`, `density`, and `CHUNK`. `grass-api.js` is the reusable world-placement boundary; the next packaging cleanup would be wrapping the remaining renderer/streamer pieces behind a `GrassSystem` class while keeping v55 as the visual reference build.

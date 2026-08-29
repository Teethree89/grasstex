# grasstex

Reusable Babylon.js grass rendering prototype with deterministic chunk generation, near/medium/far LOD, streamed thin instances, wind, fill patches, image-based shadows, and a placement/masking API for controlling exactly where grass may appear.

Current demo build: **v54**.

## Main files

- `game.html` — current demo loader/build.
- `grass-api.js` — reusable placement and exclusion API.
- `grass-streaming.js` — deterministic chunk streaming and LOD instance generation.
- `grass-realism.js` — grass shaders, fill texture shader, lighting integration, sky setup, and world-locked dirt.
- `grass-effects.js` — projected grass shadows/effects.
- `bodycam.js` — optional camera/post-processing layer used by the demo. This is not required for the grass placement API itself.
- `Assets/` — grass/fill/sky/dirt textures used by the demo.

## Recommended load order

The current engine is written as browser scripts and expects Babylon.js plus the base grass meshes/material setup to exist first.

```html
<script src="babylon.js"></script>

<!-- Your base grass renderer / mesh setup -->
<script src="grass-api.js"></script>
<script src="grass-streaming.js"></script>
<script src="grass-realism.js"></script>
<script src="grass-effects.js"></script>
```

`grass-api.js` creates a global singleton:

```js
window.GrassAPI
```

It also exposes the constructor:

```js
window.GrassPlacementAPI
```

So another project can either use the default global API or create its own independent mask set.

## Basic use

With no inclusion areas or exclusions defined, grass is allowed everywhere.

To restrict grass to a specific field or terrain region, add one or more inclusion areas:

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

Once at least one inclusion area exists, grass is generated only inside one of the included areas.

`includeArea()` is an alias for `addArea()`:

```js
GrassAPI.includeArea({
  type: "circle",
  x: 50,
  z: 30,
  radius: 20
});
```

## Excluding roads, houses, walls, trenches, etc.

Exclusions are tested before a candidate clump is written to the thin-instance buffers. Grass is not generated there at all, so excluded grass does not consume render-instance cost.

### Road or path

For a road defined by a centerline/polyline:

```js
GrassAPI.excludeCorridor([
  { x: 0, z: 10 },
  { x: 30, z: 12 },
  { x: 60, z: 18 },
  { x: 100, z: 20 }
], 6); // total road-clearing width
```

This is usually the easiest way to clear grass for roads, trails, ditches, and similar long features.

### House footprint

For an axis-aligned or rotated rectangular building:

```js
GrassAPI.excludeBox(
  40,               // center x
  35,               // center z
  12,               // width
  18,               // depth
  Math.PI / 8       // rotation in radians
);
```

For an irregular building footprint:

```js
GrassAPI.excludePolygon([
  { x: 20, z: 20 },
  { x: 31, z: 20 },
  { x: 34, z: 29 },
  { x: 25, z: 35 },
  { x: 18, z: 29 }
]);
```

### Wall footprint

For a wall segment:

```js
GrassAPI.excludeSegment(
  { x: 10, z: 10 },
  { x: 55, z: 10 },
  0.5 // clearance radius around the wall centerline
);
```

Use a slightly larger clearance than the wall's physical half-width if you do not want grass touching the wall mesh.

### Circular object / tree base / emplacement

```js
GrassAPI.excludeCircle(25, 40, 3.5);
```

### Generic exclusion object

All helpers ultimately call `excludeArea()`:

```js
GrassAPI.excludeArea({
  type: "polygon",
  points: footprint
});
```

Supported shape types are:

- `polygon`
- `circle`
- `box`
- `corridor`
- `segment`

## Surface/material filtering

A larger game can let the terrain/world system tell the grass API what type of surface exists at a world position.

Example:

```js
GrassAPI.setSurfaceResolver((x, z) => {
  return terrainSurfaceAt(x, z); // e.g. "terrain", "road", "concrete", "building"
});

GrassAPI.excludeSurface("road");
GrassAPI.excludeSurface("concrete");
GrassAPI.excludeSurface("building");
```

You can also use an allow-list:

```js
GrassAPI.allowSurface("terrain");
GrassAPI.allowSurface("meadow");
```

If the allow-list contains one or more surface names, a candidate must resolve to one of those surfaces to receive grass.

Useful methods:

```js
GrassAPI.allowSurface("terrain");
GrassAPI.disallowSurface("terrain");
GrassAPI.excludeSurface("road");
GrassAPI.includeSurface("road"); // removes it from the excluded-surface set
```

## Dynamic buildings or map editing

The API automatically requests a grass rebuild when a mask changes, provided `rebuildWorld()` exists and `autoRebuild` has not been disabled.

That means a spawned house can clear its footprint immediately:

```js
function placeHouse(house) {
  scene.addMesh(house.mesh);

  GrassAPI.excludePolygon(house.footprint);
}
```

Likewise, a road generator can register its exclusion as soon as the road spline is created.

For bulk map setup, it is more efficient to turn automatic rebuilds off temporarily:

```js
GrassAPI.autoRebuild = false;

GrassAPI.excludeCorridor(roadA, 6);
GrassAPI.excludeCorridor(roadB, 5);
GrassAPI.excludePolygon(houseA);
GrassAPI.excludePolygon(houseB);

GrassAPI.autoRebuild = true;
GrassAPI.requestRebuild();
```

## Clearing masks

```js
GrassAPI.clearExclusions();
GrassAPI.clearIncludes();
GrassAPI.clearAreas(); // clears both includes and exclusions
```

## Querying the mask directly

Other systems can use the same placement logic:

```js
if (GrassAPI.isAllowed(worldX, worldZ)) {
  // this point is valid for grass
}
```

`test()` is an alias for `isAllowed()`.

You can inspect the currently registered rules:

```js
console.log(GrassAPI.snapshot());
```

The snapshot contains:

```js
{
  revision,
  includes,
  excludes,
  allowedSurfaces,
  excludedSurfaces
}
```

## Creating an independent API instance

If a project needs more than one vegetation mask system:

```js
const meadowMask = new GrassPlacementAPI({
  autoRebuild: false,
  allowedSurfaces: ["terrain", "meadow"],
  excludedSurfaces: ["road", "building"]
});

meadowMask.excludeCircle(10, 20, 4);
```

Constructor options:

```js
new GrassPlacementAPI({
  autoRebuild: true,
  allowedSurfaces: [],
  excludedSurfaces: [],
  surfaceResolver: null
});
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

GrassAPI.isAllowed(x, z, context?)
GrassAPI.test(x, z, context?)

GrassAPI.clearIncludes()
GrassAPI.clearExclusions()
GrassAPI.clearAreas()
GrassAPI.requestRebuild()
GrassAPI.snapshot()
```

## How the streamer uses the API

`grass-streaming.js` generates each deterministic candidate in the same order as before. After all random values for that candidate have been consumed, it performs this conceptual test:

```js
if (!GrassAPI.isAllowed(x, z, context)) {
  continue;
}
```

Only accepted candidates are placed into near, medium, far, fill, and shadow-related grass data.

This is important for multiplayer or deterministic maps: masking does not alter the random-number sequence for later clumps in the chunk. If every client uses the same world seed and the same inclusion/exclusion data, the resulting grass layout remains deterministic without networking every grass clump.

The optional `context` currently contains useful candidate metadata:

```js
{
  chunkX,
  chunkZ,
  index,
  seed
}
```

A custom `surfaceResolver` can use this if needed.

## Suggested integration pattern for a larger project

A map/world generator should own authoritative world features and register them with the grass API as those features are built.

For example:

```js
GrassAPI.autoRebuild = false;

// Only grow grass in the playable terrain region.
GrassAPI.addArea({
  type: "polygon",
  points: playableTerrainPolygon
});

// Roads.
for (const road of roads) {
  GrassAPI.excludeCorridor(road.centerline, road.width + 1.0);
}

// Buildings.
for (const building of buildings) {
  GrassAPI.excludePolygon(building.footprint);
}

// Walls.
for (const wall of walls) {
  GrassAPI.excludeSegment(wall.start, wall.end, wall.width * 0.5 + 0.25);
}

// Other no-grass features.
for (const crater of craters) {
  GrassAPI.excludeCircle(crater.x, crater.z, crater.radius);
}

GrassAPI.autoRebuild = true;
GrassAPI.requestRebuild();
```

This lets the grass renderer remain focused on rendering/LOD/streaming while the map generator decides where vegetation is physically valid.

## Notes about the current demo engine

The visual grass renderer is still partly coupled to the demo through globals such as `scene`, `camera`, `nearTypes`, `medTypes`, `farTypes`, `density`, `CHUNK`, and the existing base grass setup. `grass-api.js` is intentionally separated from that visual setup and is the first reusable boundary for importing the engine into a larger project.

For a full package/module conversion, the next cleanup step would be to wrap the remaining renderer/streamer globals behind a `GrassSystem` class while keeping this masking API as the placement layer. The current v54 demo is kept as the visual reference implementation so the reusable version can be checked against a known-good result.

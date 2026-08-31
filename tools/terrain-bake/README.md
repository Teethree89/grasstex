# terrain-bake (prototype)

Turns an authored SVG map into a terrain heightfield plus a material splat.
No dependencies; `node run.js` then `node render.js`.

    node --max-old-space-size=4096 run.js       # -> out/height.u16.bin, out/splat.png, out/stats.json
    node --max-old-space-size=4096 render.js    # -> out/fig1..fig4 .svg

## The map is generated (`genmap.js`)

    node genmap.js --seed 7            # -> map.svg, reproducible from the seed in its header

`map.svg` is an artifact, not source. Hills are random ellipses; roads are **routed, not
drawn** - a grade-penalised Dijkstra over a coarse lattice, then Douglas-Peucker,
resampling, min-radius relaxation and a centripetal Catmull-Rom fit.

Two cost terms, and both were found by measuring the bake rather than by taste:

- **Grade**, which the grade solver pays for. Measured over seed 7:

      weight   road m   max grade   mean cut   daylight p95   asset MB   route on slope
      naive      2048       6.70 %     0.267 m        20.7 m      2.36            58 %
         4       3083       3.42 %     0.147 m        13.1 m      2.32            21 %
        12       3259       3.01 %     0.117 m         1.8 m      2.46             0 %

  Past ~12 the router saturates - it always buys the flat detour and roads stop touching
  terrain at all, which is cheap and looks wrong. Default 5.

- **Cross-slope**, which the *daylight* solve pays for, and which penalising grade alone
  ignores entirely: a contour road cut into a steep face grades beautifully and daylights
  ruinously, because width goes as 1/(batter - cross). Adding it was worth:

      cross weight   road m   daylight p95   capped cells   asset MB   junction curv
                 0     2155         34.9 m            426       1.79           8.85
                12     2584          2.6 m            186       1.99           2.16

  p95 daylight 34.9 m means the corridor was pinned at its cap almost everywhere. The
  junction curvature falling with it was the surprise: what looked like a junction defect
  was two over-wide daylight cones meeting, not the junction geometry at all.

- **Road avoidance.** Cross-slope routing funnels every road down the same valleys. At
  600 m with 3 roads that is harmless; at 1200 m with 6 it put two of them parallel
  **11 m apart** with their ditches interleaved. Cells within `--avoid-radius` of a road
  already placed cost more, exempting the neighbourhood of a branch's start so it can
  still leave its host.

- **Relief is normalised, not summed.** Hills add, so raising `--hills` used to raise the
  whole world: 30 ellipses stacked to 149 m of relief over 1200 m. `--relief` (default
  60 m) sets the peak-to-peak and the ellipse heights are rescaled to hit it, so hill
  count controls texture and relief alone controls amplitude.

## Scaling to 1200 m

    node genmap.js --seed 7 --world 1200 --hills 30 --roads 6 --out map1200.svg
    WORLD=1200 MAP=map1200.svg OUTDIR=out1200 node --max-old-space-size=8192 run.js

23.0 M cells, ~700 MB of typed arrays, 36 s. Everything holds - seams 9.1e-7 m, cracks
9.3e-7 m, streaming still bit-identical to a cold build, grass-vs-mesh p99 under 0.28 px
at every distance, 156 k mesh vertices against 23.0 M for a uniform 0.25 m mesh.

Both generator fixes above were found here, and road curvature p99.9 is the number that
found them:

    149 m relief, roads sharing corridors ......... 53.7
    relief normalised to 60 m ..................... 37.5
    roads avoiding each other ......................  3.1   (600 m map: 3.1)

Tiling is 7.42 MB against 43.95 MB uniform, 5.9x - a weaker ratio than the 8.1x before
avoidance, because roads that no longer share corridors cover more ground. The shipped
pack is 7.44 MB gzipped, of which `roaduv.png` is 1.60 MB for a texture that is empty
away from roads; storing it per corridor tile rather than world-wide is the obvious next
saving.

### The guard that matters

After writing the SVG, genmap reads it **back**, flattens the beziers exactly as
`readMap` does, and checks every road's turning radius against its own prism half-width.
Below that ratio the offset prism folds through itself and nothing downstream can save it.

This caught a real defect: relaxing the control polyline to a 30 m radius still produced a
**0.2 m** radius once fitted, because uniform Catmull-Rom overshoots on uneven spans. The
centripetal parameterisation (alpha = 0.5) is what actually admits no cusps. Even then,
3 of 5 seeds still failed until the fit was re-checked and globally smoothed in a loop -
a hairpin out of a lattice router cannot be removed by local relaxation. Across 8 seeds
the tightest turn is now 2.2-3.0x the prism half-width, and the generator exits non-zero
if any road falls under 1.2x.

## The split

| Layer | Authored? | Why |
|---|---|---|
| Terrain base (`#terrain` ellipses, `data-height` in metres) | painted | smooth, so 8-bit quantisation survives a blur |
| Road cross-section (`MATERIALS` table in `bake.js`) | data, per class | sharp and sub-decimetre; a stroke gives width, never a transverse profile |
| Longitudinal grade, cut/fill, daylight | solved | all three depend on ground the author does not control |

`class` on a road path picks BOTH the splat channel and the cross-section geometry,
so dirt differs from asphalt in shape, not only in texture.

## What the bake does

1. Rasterise `#terrain` at 1 m, quantise to 8 bit **with dither**, blur, add fBm.
   Dither matters: plain quantisation error follows the contour bands, so it is
   spatially correlated and a blur does *not* average it away (59.3 mm rms residual).
   Dithering first decorrelates it and the same blur then leaves 4.9 mm rms.
2. Flatten road paths, snap branch endpoints to their host road (junction nodes).
3. Solve each longitudinal profile: attraction to natural ground + curvature penalty
   + a hard slope clamp, with junction elevations pinned to the already-graded host.
   Smoothing length is `SMOOTH_LEN` (40 m), not a per-sample smooth.
4. Nearest-road distance field (`t`, arc `s`) over the grid.
5. Compose: inside the prism, `designElevation(s) + profile(material, t)`. Outside,
   clamp natural ground into a cone around the road edge — that clamp *is* the
   daylight, and it stops binding exactly where the batter meets natural ground.

## Junctions

There is no junction-specific code. Bands are built outward from the crown the way a
vector would stroke it, so the geometry falls out of the construction:

    u = smin over roads of (distance to centreline - paved half-width)

`u` is distance past the edge of the **union** of the paved regions. In the wedge
between two roads `u` stays small from both sides, so the wedge reads as shoulder and
never reaches the ditch band - the collision that needed a suppression disc simply
cannot form. `smin` (polynomial smooth-min, `SMIN_K` metres) rounds the union corner
into a fillet, which is also what a real junction has.

Two things are blended rather than switched, and both matter:

- **Design elevation**, by inverse-square distance over the two nearest roads. All of
  crown, skirt and daylight cone hang off this one surface, so they cannot step
  against each other. This is what the old cone-intersection pass was working around.
- **Material parameters** - crown height, ditch depth and so on - not the per-road
  profiles. Blending profiles would let both roads assert a ditch in the wedge, which
  is the original artifact. The union distance picks the band; the blend picks its shape.

Measured: peak curvature in a +/-30 m window at the spur junction is 3.2 /m, equal to
the road's own 3.0 /m. Nearest-road was 19.8; an earlier blend-disc version reached
3.0 on p99.9 but still spiked to 8.8 locally, and needed ~40 lines of disc radius,
1/sin(theta) scaling, ditch fading and cone intersection that this replaces.

## Tiling — and what it does not solve

Coarse 1 m everywhere, fine 0.25 m only over road prisms (+3 m margin). Node-centred,
so a 4:1 refinement nests exactly; where a fine tile meets a coarse one its extra edge
nodes are snapped onto the coarse edge's linear interpolation, so both sides render the
same curve. Measured seam mismatch is 1.2e-6 m, i.e. the probe epsilon.

    TILE   fine/total     raw     gzip   off-prism err p99
      8    445/5625   1.61 MB  1.53 MB       7 mm
     32      59/361   2.58 MB  2.44 MB       7 mm
  uniform              10.99 MB  8.88 MB        —

Gzip does **not** close the gap on its own - only 19 % off the uniform file, because
the low byte of a Uint16 height is near-random. So the storage win is real: 5.8x on
the wire at 8 m tiles.

**But storage was never the binding constraint.** Because grass must agree with the
drawn mesh, mesh resolution is locked to sampling resolution, and that is the number
that decides the architecture:

    uniform 0.25 m over 600 m ....... 5.76 M vertices
    tiled 8 m ....................... 0.85 M
    shipped terrain-demo.js today ...  69 k   (over 1200 m, 4x the area)

Even the best tiling is ~50x today's vertex budget once scaled to 1200 m. Tiling
cannot fix that, because these tiles are fine where the *roads* are, permanently,
while a mesh needs to be fine where the *camera* is, dynamically. Orthogonal axes.

The way out is to relax the invariant from "grass samples the mesh's grid" to "grass
and the mesh sample the same field": displace the terrain mesh in its vertex shader
from the same heightfield grass reads. Tessellation then becomes a free camera-LOD
choice and the two agree by construction, with the residual being the mesh's chord
error at the current LOD - negligible near the camera, which is the only place it is
visible. Within NEAR_END (30 m) a 0.5 m mesh is 14.6 k vertices.

So the tiled heightfield is the right *storage* format, and camera-relative mesh LOD
is the other half. `lod.js` is that half.

## Mesh LOD (`lod.js`)

Chunked LOD over the tiled field. **Camera distance sets the ceiling on detail;
road content sets the floor** - the finest level only buys anything where a road
prism is, and the tiling already knows where those are. Everywhere else the near
field is capped one level coarser, which costs nothing visible because grass is
excluded from the corridor.

Cracks are handled the same way as tile seams: a fine chunk's extra edge vertices are
snapped onto the coarser neighbour's linear interpolation. T-junctions in the index
buffer, no gap. Measured 2.6e-6 m over 300-sample sweeps of every mixed-level edge.

Camera standing on the main road, 300 m range, 32 m chunks:

    uniform 0.25 m mesh ......... 5.76 M vertices
    camera LOD only .............  298 k
    + content floor .............  274 k      (163 k when the camera is off-road)
    shipped terrain-demo.js .....   69 k      (static, 1200 m)

The content floor saves 8 % standing on a road - the worst case, since most nearby
chunks then hold road - and 38 % anywhere else.

### Does grass still sit on the ground?

That is the whole question, so it is measured against what the GPU rasterises
(barycentric over the LOD triangle), sampling only where grass may actually stand:

    distance     p99        max        p99 px    max px
      0- 30 m    3.5 mm    13.9 mm     0.24      1.61
     30- 60 m    1.6 mm    12.3 mm     0.03      0.28
     60-120 m    5.0 mm   110.2 mm     0.05      1.40
    120-240 m   29.4 mm   500.6 mm     0.17      2.96
    240-300 m   78.1 mm   553.3 mm     0.29      2.26

Pixels at 1080p / 60 deg vertical. p99 stays under a third of a pixel at every
distance, so the relaxed invariant holds: grass and the mesh read the same field and
disagree by less than anyone can see. The half-metre maxima are daylight break lines -
the crease where a cut or fill cone meets natural ground - crossed by a 2 m mesh at
120 m+, which is a real feature the coarse level cannot resolve and nothing stands on.

## Streaming (`stream.js`)

Rebuilds only what the camera's move actually changed. Two things make this more than
calling `lod.build()` per frame:

- **Neighbour invalidation.** A chunk's edge vertices are snapped to its *coarser*
  neighbours, so when chunk A changes level, A's four neighbours hold stale snaps even
  though their own level did not change. Miss it and cracks reopen as you walk. Edges
  are re-sampled from the field before re-snapping rather than stored, so a re-snap can
  never compound a previous one.
- **Hysteresis.** Refining needs `d < BAND - H`, coarsening `d >= BAND + H`, so the two
  thresholds never coincide and a chunk on a band edge cannot flip on camera jitter.

Measured over a 4000-frame walk (1.5 m/s at 60 fps, ~100 m, +/-0.4 m lateral jitter),
32 m chunks, budget 4 chunks per tick:

| | |
|---|---|
| equivalence vs cold `lod.build` | **0 level mismatches, max grid diff 0 m** |
| cracks after the walk | 2.6e-6 m over 24 k samples |
| level changes, walking | 1599 -> **159** with H = 6 m |
| level changes, standing still + jitter | 132 -> **0** |
| idle ticks | 3048 / 3999 (76 %) |
| vertices touched | 1.48 M vs 1095 M rebuilding every tick (**741x**) |
| steady-state queue | peak 11 chunks, worst backlog 6 ticks (0.10 s) |
| cold start | 234 chunks; ground under the camera ready after **1 tick** |

The equivalence check is the one that matters: incremental state is bit-identical to a
cold build at the same position, so streaming cannot drift. It only holds with H = 0 -
with hysteresis the level set legitimately depends on how the camera got there, which
is the point.

The stand-still row is what hysteresis is actually for. Walking numbers flatter it
(most of those 1599 changes are real band crossings); a camera standing still with
footstep jitter does 132 completely pointless rebuilds without it and zero with it.

Drain order is nearest-first. In steady state the ~10 chunks a step dirties make this
irrelevant, but on a cold start or a teleport, scan order would fill the far field
while the ground under the camera was still missing.

## Runtime integration (`../../terrain-baked.js`)

Replaces `terrain-demo.js`. Loads the pack, rebuilds the tiles, and hands the SAME
field to both consumers - `GrassAPI.setTerrainSampler` and the streamed LOD mesh.

Ship `out/asset/` to `A + 'terrain/'` (or set `window.TERRAIN_ASSET_BASE`), and load
`tile.js`, `lod.js`, `stream.js`, `terrain-baked.js` in that order in place of
`terrain-demo.js`. The three tool modules are dual-export: `module.exports` under Node,
a global under a `<script>` tag, so the bake and the runtime share one implementation.

Verified in headless Chromium against real Babylon 8.26 (`scratchpad/harness.html`):

- **400 points sampled in the browser vs. Node: max height difference 0.00 mm**, normal.y
  within one float ULP (2.2e-16), slope within 1.1e-12 deg. The asset round-trips exactly.
- 233-302 chunks, 224-266 k vertices, no page errors, camera follow tracking.
- `GrassAPI.sampleTerrain` / `isSlopeAllowed` / `isAllowed` all answer correctly.

Two bugs the browser caught that Node could not:

1. **Scope collision.** `tile.js` declares `const sampleTiled`; `lod.js` and `stream.js`
   destructure the same name. Node wraps every module in its own function scope, so this
   only fails in a browser, where classic scripts share one global scope. All three are
   now wrapped in IIFEs like the rest of the repo.
2. **Arc-length wrap seam.** `roaduv.png` stored road arc length as a wrapped 0..1 ramp.
   2.9 % of road cells straddle the 255->0 cliff, and bilinear filtering sweeps the whole
   road texture across one texel - a hard line drawn across the carriageway. Arc length is
   now stored as a point on a circle (sin in R, cos in B) and the shader recovers the phase
   with `atan`, which interpolates through the wrap.

A third was caught by a static check before it ran: a missing `+` in the fragment-shader
concatenation. ASI made it parse, silently truncating the shader at that line.

### Known gap

The terrain material is a `ShaderMaterial`, so it does not receive the cascaded shadow map
the old `StandardMaterial` did. Terrain self-shadowing needs the CSM uniforms wired into
this shader; grass shadow decals are unaffected. Dropping `CustomMaterial` does remove the
CDN script this file used to boot behind - the async boot that made shadows bake flat at
y = 0 until you walked far enough.

## Known limitations

- Uniform 0.25 m grid (11.5 MB for 600 m). Tiling — coarse base plus corridor tiles —
  is the next step and is where the ~10x saving lives.
- Daylight cap is a hard stop; a real pipeline would place a retaining wall there.
- Only the two nearest roads are kept, so a true three-way node at a single point
  would lose one contribution. Two separate nearby junctions are fine.
- `smin` widens pavement slightly wherever two roads pass close without joining. At
  `SMIN_K` = 3 m the effect is under a metre and only within ~3 m of a genuine
  crossing, but a dense network would want the fillet gated on a real node.
- Faint scalloping along curves in the curvature figures is the 1 m polyline
  flattening of the beziers, not the surface: it is ~5 mm in height terms, and the
  gamma-compressed curvature view exaggerates it.

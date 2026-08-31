# terrain-bake (prototype)

Turns an authored SVG map into a terrain heightfield plus a material splat.
No dependencies; `node run.js` then `node render.js`.

    node --max-old-space-size=4096 run.js       # -> out/height.u16.bin, out/splat.png, out/stats.json
    node --max-old-space-size=4096 render.js    # -> out/fig1..fig4 .svg

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

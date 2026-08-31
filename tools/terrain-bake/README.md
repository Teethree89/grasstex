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

Three things were wrong with nearest-road assignment, fixed in that order:

1. **The daylight seam.** Two roads at different design elevations met at a Voronoi
   boundary, which is a *step*, and that boundary runs far past any junction disc.
   Fixed by keeping the two nearest roads and **intersecting their cones** — ground
   must daylight to every nearby road, and max/min of continuous functions stays
   continuous. This is the one that mattered most.
2. **Ditches through the pavement.** Inside a disc around each node, incident roads
   are blended by inverse-square distance to centreline and each ditch fades toward a
   crown-only apron.
3. **The acute-angle wedge.** Two prisms of half-width p crossing at angle t overlap
   over ~p/sin(t), so a disc sized by width alone leaves the wedge — exactly where the
   ditches collide — outside it. Radius is scaled by 1/sin(t), capped at 42 m.

Measured on the sample map: curvature p99.9 over junction cells 19.8 -> 3.0 /m, which
is below the road's own 3.0 /m. Junctions are no longer the sharpest feature.

## Known limitations

- Uniform 0.25 m grid (11.5 MB for 600 m). Tiling — coarse base plus corridor tiles —
  is the next step and is where the ~10x saving lives.
- Daylight cap is a hard stop; a real pipeline would place a retaining wall there.
- Only the two nearest roads are kept, so a true three-way node at a single point
  would lose one contribution. Two separate nearby junctions are fine.
- Faint scalloping along curves in the curvature figures is the 1 m polyline
  flattening of the beziers, not the surface: it is ~5 mm in height terms, and the
  gamma-compressed curvature view exaggerates it.

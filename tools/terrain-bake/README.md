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

## Known limitations

- Junction surfaces are nearest-road, not a proper blended junction polygon; the
  flared patches at the two branch points in `fig2-curvature.svg` are that artifact.
- Uniform 0.25 m grid (11.5 MB for 600 m). Tiling — coarse base plus corridor tiles —
  is the next step and is where the ~10x saving lives.
- Daylight cap is a hard stop; a real pipeline would place a retaining wall there.

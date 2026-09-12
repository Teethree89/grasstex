# Battle Sim Acoustic Realism

The battle sim treats one Babylon world unit as approximately one metre for acoustic propagation.

## Physical references

Outdoor point-source spreading is modeled from the free-field relationship of approximately 20 log10(r) dB attenuation relative to 1 m (about 6 dB per doubling of distance). Sound arrival is delayed by distance / 343 m/s at the 20 C reference condition.

Atmospheric absorption is frequency dependent and grows with distance; temperature, humidity, pressure and frequency all matter. The project records 20 C, 50% RH and 101.325 kPa as its reference environment. A full octave-band ISO 9613-1 filter is not yet run per voice because that would add substantial Web Audio work on mobile; instead the runtime preserves timing and level physics now and leaves frequency-selective distant layers as the next refinement.

## Source classes

### Human battlefield shout
- Reference source level: 84 dB(A) at 1 m (ISO-style shouted vocal effort).
- Clear quiet-air audibility can exceed 150 m, but word intelligibility collapses much sooner in battlefield masking.
- Runtime intelligibility target: about 90 m.
- Hard cull: 150 m.

### Small arms
- Reference peak class: 160 dB SPL at 1 m.
- Firearms can produce roughly 160-170 dB peak and sometimes 170-180 dB or higher.
- A rifle shot is therefore audible vastly farther than a shout under the same outdoor conditions; kilometres are plausible in quiet/favourable propagation.
- Runtime hard cull: 1200 m, well beyond the current 360 x 280 m battlefield, so shots anywhere on the map can be heard.

### Future classes
- Grenade explosion: 165 dB peak class, 1800 m runtime cull.
- Tank cannon: 175 dB peak class, 3000 m runtime cull.
- Vehicle engine: 105 dB(A) continuous class, 700 m runtime cull.
- Aircraft: 120 dB(A) continuous/event class, 3500 m runtime cull.

These future source levels are simulation calibration values, not claims that every real vehicle, grenade or cannon produces exactly that level. Exact levels vary strongly by weapon, ammunition, measurement geometry and operating state.

## Game-mix mapping

Physical SPL cannot be reproduced literally on a phone speaker. The runtime calculates physically motivated distance loss and arrival delay, then maps the resulting level through a compressed game-mix range. This preserves the ordering and spatial impression without clipping or making nearby gunshots dangerously loud.

The authoritative machine-readable settings live in `Assets/audio/acoustics.json`. Source-file loudness/mastering targets remain in `MASTERING.md`; mastering and propagation are intentionally separate systems.

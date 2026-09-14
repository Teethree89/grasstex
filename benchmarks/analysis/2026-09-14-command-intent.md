# Command intent and expanded benchmark investigation

Source: fetched `main` at `951f16d` and `benchmark-results` at `0b9c1fa`.
Evidence: [run 34795167087](https://github.com/Teethree89/grasstex/actions/runs/34795167087),
merged artifact `10329313240`, source commit `64a51c308835313384138df5952b510b0bd53b32`.
The benchmark ran on the feature branch; its source predates the merge commit. Runs 1–3
are older code and are not a baseline for the newly added diagnostic counters.

## Findings and fixes

### Engineer crash: guard unsupported meeting construction

The supplied run reports 945 runtime errors and the engineer `tacticalFrame` stack.
The regression reproduces the actual undefined `attackerSpawn.x` failure with the
shipping side builder and fortification planner. Meeting sides have no designated
attacker/defender frame, but runtime construction reached both `augmentPosts` and
subsequent garrison logic, which assume that frame.

`engineerTick` now exits before building any state or work in a meeting engagement.
**Decision:** this prepared-defender module does not construct runtime fortifications
in meeting engagements. Supporting symmetric field engineering would require a
faction-relative frame throughout construction, posts and garrison requests, rather
than one guard at the crash site followed by another crash later. Prepared scenarios
retain runtime construction; a positive regression builds exactly two works and
checks the existing limit. No exception is swallowed.

Expected effect: eliminate this exception stream, including partially registered
works from failed construction attempts. This is intentionally a feature boundary,
not a claim that meeting fortification has been implemented.

### Assigned but never reached: stale approach waypoints overwrite objective missions

The run has 157 never-owned objectives out of 436, 151 never-contested objectives,
839 route alerts and mean assignment spread 2.54/2.58. Reading the state machine
revealed that objective selection was gated by proximity to the town-centre route
terminus. Once a squad left that region (or a lease expired), the fallback wrote
that obsolete waypoint into `objective` without clearing `targetObjective`.
Both targetless recovery guards then correctly saw a nonempty ID and did nothing.
The urban-route and regroup-recovery extension had equivalent stale-route writes.

Force Command now continues a valid objective mission independently of the old
route. An unowned assigned objective remains selected while doctrine evaluates how
to pursue it; after ownership changes, normal scoring can choose the next mission.
The recovery extension cannot advance an obsolete route over an assignment, and
bounded regroup resumes the assigned objective when one exists. Cohesion, defensive
requests, tactical leases and individual engagement remain in their existing layers.
No soldier destination writer or post-hoc movement override was added.

Mechanism probe, identical sources/fixture except the fixes: one ten-man squad starts
65 m from the town-centre waypoint with a target at x=180, radius 28. Shipping squad
orders, fireteam stability, engagement, capture and movement resolver execute through
the existing node movement harness on unobstructed flat terrain.

| Observation | Original `951f16d` | Fixed |
|---|---:|---:|
| Capture within 180 simulated seconds | No | 34.2 s |
| Peak friendly presence in the zone | 0 | 10 |
| Frames targeting obsolete waypoint before capture | 676 | 0 |

Expected effect: more assigned objectives actually reached/contested/captured; fewer
reversals and order-churn alerts. This small controlled probe attributes the command
mechanism, not a projected 100-battle capture rate or a universal victory improvement.

### Strategic writers: real write-backs and detector artifacts both exist

The artifact retains only the first 20 conflict details per battle. There are 343
retained details, so they cannot individually explain all 553 counted conflicts:

- 327 retained strategic conflicts involve Force Command and Squad Stability.
- 7 retained strategic conflicts involve `in-place/unknown` and Force Command.
- 9 retained soldier `_fireteamDestination` conflicts involve `in-place/unknown`.

Example: `push-7-s1-0001` contains Force Command's vacant-objective extension changing
`assault` to `capture`, then Squad Stability immediately restoring `assault`, repeatedly.
The core commander's lease gate alone could not prevent later command extensions from
being overwritten by the stability hook.

A committed plan is now a predicate/constraint consumed by Force Command. Stability
can expire a superseded lease and commit the final commander intent, but never writes
`commandPhase`, `targetObjective` or `objective` back from its snapshot. An unchanged
lease still gates reconsideration; expiry still gives the commander an evaluation pass.

Separately, the fast setter's point threshold differs from the old sampler's threshold.
A legitimate small assignment could be invisible to the setter's event log and then
be mislabeled an in-place mutation by the sampler. The fast setter now keeps a separate
snapshot of every observed assignment. Sampling compares against that snapshot, while
normal event coalescing still accumulates distance against the last logged event.
Actual in-place changes remain observable. The original conflict detector now excludes
unknown/diagnostic identities as competing writers, matching the fast detector;
known Force Command–Squad Stability ping-pong remains detectable in a negative fixture.

Expected effect: fewer genuine strategic reversals and fewer false conflict alerts.
Any strategic health improvement is confounded by these simultaneous behavior and
detector corrections. The missing 210 details cannot be classified individually.

### Targetless and route counters: correct the measurement

All **799 targetless alerts occur at 17.6 s**: 798 in `approach`, one in `regroup`.
They do not demonstrate squads losing targets later. Route assignment explicitly
starts with `targetObjective=null`; the old detector treated an ordinary approach
mission as absent strategic intent.

The benchmark now shares tested predicates for active route intent and actionable
assignment gaps. A live squad following its current approach waypoint is not counted
as targetless; an exhausted route with no next objective still is. Eliminated squads
are excluded. Route stalls measure active approach routes, not distance from an old
town-centre waypoint after an objective mission superseded that route. This narrows
`routeStalls` to its stated meaning; it is not a new all-purpose objective-travel stall
counter. Existing vacant-objective diagnostics still cover their narrower case.

These counter definitions have changed. Lower targetless/route counts and derived
health scores must not be presented as pure gameplay gains against the supplied run.

## Leads evaluated without speculative gameplay changes

- **Owned-objective filter / saturation:** neither clears a target ID; penalties
  change ranking, not eligibility. The fallback can select owned objectives when all
  are owned. Across the eight existing worst-seed fixtures, neutral assignment scores
  settle with zero switches after warmup across 25 subsequent passes. This does not
  rule out churn with changing combat/ownership. The 748 retained loop alerts break
  down into 490 position-seeking, 200 order-churn and 58 decision-cycle alerts; they
  are not 748 proven saturation flips. Saturation cost stays 55.
- **Anchor gate:** it does not prevent the controlled outer-objective capture after
  strategic intent is repaired. No change to 55% arrival, 8 m slot radius, stride or
  combat gating. Some genuine pre-assignment route stalls may remain; these records
  lack the per-frame slot/anchor evidence to attribute all 839 alerts to that gate.
- **Capture geometry:** the movement probe supplies all ten weights inside a 28 m
  zone and captures without lowering the two-weight requirement or 12 s duration.
  A separate static line-slot sweep over 100 generated scenarios had a minimum zone
  radius of 28.02 m and all ten slots inside when centred. Neither result guarantees
  two survivors can hold every combat-contested zone. Formation/capture tuning stays.
- Do not bank the earlier 380–441 → 2 movement-stall count as clean attribution:
  its detector changed to exclude combat states. The independent historical nav
  sweep (114 deadlocks → 0) remains separate evidence. The additional footprint-navigation fixes below are separate from that historical wall fix.
- No combat, aim/hit probability, winner balance, health weighting or global loop
  suppression changes. No claim that all 151 never-contested zones are now fixed.

## Additional request: hedgerow wayfinding clearance

The user reported soldiers and squads getting stuck in gaps between nearly touching
hedgerows. The existing physical navigator already had a 0.45 m body radius (0.9 m
width), and a **1.15 m planning margin from each footprint edge**. The fix explicitly
relates these constants: planning margin = body width + 0.25 m. Increasing the margin
alone would not repair the bypasses reproduced in the shipping code:

1. Local search failure, empty rolling queues and complete-path assembly could
   manufacture unchecked direct segments through an obstructed goal.
2. The first 32 footprints were used for both candidate generation and collision
   checks. Obstacles beyond that budget or outside the original corridor could
   intersect a supposedly clear detour.
3. An escape edge from inside a buffer was added in both directions, wrongly allowing
   reverse entry. Escape tests also allowed crossing the obstacle to a farther point
   on the opposite side, and rejected very small genuinely outward steps.
4. Building-only `resolveStep` could hand back a step still intersecting a hedge.

Every candidate edge now checks the spatial index's complete nearby footprint set,
with direction-aware edges and monotonic outward escape. Candidate generation remains
bounded, expanding from 32 to 96 only after failure. No-path stays no-path, with a
bounded retry for an empty rolling route. Physical sliding validates every proposal
against both building and body-footprint collision. These changes only affect
navigation waypoints and integration steps; Movement Resolver still owns the final
soldier destination.

Regressions cover a 0.8 m hedge gap, a traversable rotated wider passage, rolling
movement around hedge ends, unreachable gap goals, dense geometry beyond the candidate
budget, illegal reverse/through-obstacle escape, tiny outward steps, footprint-aware
sliding, and safe timed retry in a closed enclosure. The seven newly failing physical
checks reproduce on the original tree and pass after the fix. We did not reproduce
the user's exact live seed, so these prove concrete underlying defects, not that every
possible squad obstruction is resolved. Formations targeting genuinely unreachable
places still need higher-level replanning; navigation must not pretend those places
are reachable. Conservative complete collision checks and bounded candidate expansion
can increase planning cost in dense terrain; full-run performance remains unmeasured.

Expected effect: fewer unsafe paths and collision-driven stalls. Truly unreachable
goals may now be reported as blocked instead of apparently moving through geometry;
a lower movement-stall count is not a guaranteed or appropriate success criterion.

## Validation

- `node --check` on every changed JavaScript source; `git diff --check`.
- `objective-nav-check.js`: **45/45 pass**. Copying the same test onto a separate
  checkout of `951f16d` produces **23 failures out of the same 45 checks**. The old
  benchmark predicates are read from its actual script for the negative control.
- Engagement contract: **48/48 pass each**, `HARNESS_SEED=1,7,42,12345`.
- Workflow YAML parses; every embedded shell block passes `bash -n`.
- Source gate executed against a disposable local git remote: manual main and tagged
  main ancestor accepted; unmerged tag and manual feature branch rejected. Output
  SHA equals the checked-out commit. No remote workflow dispatched for this check.
- No browser/live test, deployment claim, or 100-battle run is part of this validation.

## Explicit benchmark triggers

Ordinary branch pushes and changes to `run-request.txt` no longer trigger this suite.
Use manual **Run workflow** on **main**, or a unique **`benchmark-*` tag** pointing to
an already-merged main commit. Both routes retain all five shards and persistent
publication to `benchmark-results`. The workflow checks ancestry, pins every job to
the verified commit, normalizes report SHA metadata, and publishes only after all
shards succeed. A malformed heredoc delimiter in the existing publication shell was
also corrected; the old block failed `bash -n`.

Example when ready (not executed during this task):

```sh
git fetch origin main
git tag benchmark-2026-09-14-command-intent origin/main
git push origin benchmark-2026-09-14-command-intent
```

Use a new tag name for the next run. Tagging an old commit uses the workflow from
that commit, so use commits containing this trigger change. No benchmark tag was
created or pushed as part of the fix.

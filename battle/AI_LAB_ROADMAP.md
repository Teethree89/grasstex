# WW2FPS AI / Unit Lab Roadmap

`grasstex/battle` is the proving lab for systems intended to move into `ww2fps` after they are stable. The goal is portable behavior contracts, not a second game implementation.

## v20 baseline — seeded doctrine laboratory

- 2,000 m × 1,200 m battlefield footprint matching the current `ww2fps` generator scale.
- Every training generation has a reproducible training seed.
- Each generation evaluates candidate doctrine on multiple procedural scenario seeds and mirrored factions.
- Scenario generation varies terrain phase/roughness, settlement location/shape, buildings, roads, objectives and spawn context.
- Scenario descriptors carry a normalized fingerprint used for similarity recall.
- Policy Genome v2 includes:
  - execution parameters,
  - force-allocation doctrine,
  - constrained tactical rules,
  - structural mutation and crossover.
- Successful scenario/genome pairs are stored as compact experiences. New scenarios may blend doctrine from several similar successful experiences.
- Unit/objective/system modules are registered through `BattleModules` so future unit classes do not require hard-coding in the commander.

## Individual engagement

Per-soldier combat behavior is a single state machine in `battle/engagement.js`
(advance -> orient -> cover/bound -> engage -> pinned/assault -> alert), documented in
`battle/AI_ENGAGEMENT.md` and tested headless with `node tools/ai-sim-harness/run.js`. Modules feed
it position inputs; they no longer wrap `SquadAI.updateSoldier` to override stance or destination.
Sight and cover are stance-aware (`battle/obstacle-field.js`), so going prone is a real tactical
choice rather than a pose.

Next steps for this layer:

- grenades and smoke as suppression/assault enablers, which the bound cycle can then spend;
- casualty reaction (drag to cover, call out a man down) once a medic concept exists;
- per-role engagement profiles in the scenario memory, so terrain type can shift reaction and
  bounding behavior;
- stance-aware LOS for vehicles and windows so armor and hardpoints use the same contract.

## Buildings / hardpoints

### Current v20

- Single-storey, roofless procedural buildings.
- Real door and window openings in rendered wall geometry.
- Building-aware visibility graph / A* navigation around corners and through doors.
- Windows are LOS/fire portals, not movement portals.
- Infantry can claim interior window firing positions and navigate through a door to occupy them.
- Window occupants receive a first-pass defensive benefit.

### Hardpoint Phase 2

- Treat a building as a commander-visible tactical object with ownership, capacity and defensive value.
- Explicit orders: occupy, clear, defend, abandon, reinforce.
- Garrison state at squad/section level rather than opportunistic individual window claims.
- Reserve some occupants away from windows and rotate suppressed/wounded positions.
- Building-local sectors / rooms and door control.
- Assault entry selection and coordinated room clearing.
- Prevent friendly congestion at door portals.
- Track firing arcs and assign windows by weapon/role.
- Machine gunners favor wide fields of fire; scouts/captains favor observation/command positions.
- Counterattack behavior after a hardpoint is lost.
- Telemetry: time-to-clear, defenders/attackers committed, casualties, windows used, entry point, recaptures.

### Hardpoint Phase 3

- Engineers can breach alternate wall/door entry points, clear obstacles, repair and fortify.
- Sandbags, wire, mines and prepared firing positions become module-provided hardpoint upgrades.
- Suppression/morale affects whether a garrison holds, withdraws or surrenders the position.
- Building damage/destruction changes navigation and cover.
- Upper floors, stairs and roofs only after the ground-floor navigation/occupancy model is proven.

## Units

Planned portable capability-driven modules:

- Infantry squad — capture, direct fire, screen, defend.
- Tank — armor, breakthrough, mobile direct fire, anti-vehicle.
- Engineer — breach, repair, build, demolish, obstacle clearing.
- Anti-tank team / gun — anti-armor, ambush, area denial.
- Artillery / mortar observer — indirect fire, suppression, smoke.
- Medic / casualty system if later useful to `ww2fps` scale.

Commander policies should reason about capabilities (`breach`, `armor`, `antiArmor`, etc.) rather than concrete unit IDs.

## Objectives

The objective service is intentionally pluggable. Future objective types should include:

- occupation / capture zone,
- defend for time,
- destroy / demolish,
- repair / build,
- bridge or crossing control,
- escort / extraction,
- breakthrough / reach line,
- hardpoint clear-and-hold.

## Training curriculum / anti-overfitting

- Procedural scenario seeds are the default training curriculum.
- Mirrored faction evaluations reduce directional/map-side bias.
- Keep training, validation and held-out test seed sets separate once enough scenario variety exists.
- Score both average performance and worst-map/generalization performance.
- Maintain historical champion genomes (Hall of Fame) so new policies cannot specialize only against the current baseline.
- Add novelty scoring for genuinely different but competent doctrine.
- Add scenario-family labels (open, urban, bocage, river, defense, breakthrough, etc.) once generators exist.

## Scenario memory

Each completed useful experience stores:

- scenario seed and fingerprint,
- genome revision / candidate,
- match score and result,
- objective / force metrics,
- the genome used.

For a new scenario, similarity is computed from the fingerprint. The runtime can blend the global champion with multiple successful analogues, weighted by similarity and experience score. The dashboard should make those recalls visible so learned adaptation remains inspectable.

## Review / observability

`battle_metrics.php` is the operator-facing "What We Learned" page. Continue expanding it with:

- policy fitness history,
- candidate comparison,
- per-scenario generalization,
- rule additions/removals,
- parameter/doctrine changes,
- scenario similarity / recall sources,
- hardpoint metrics,
- future unit-specific performance,
- held-out validation score.

## Transfer to ww2fps

Before integration, keep interfaces data-oriented and isolate Babylon/render-specific pieces. The components intended to transfer are:

1. scenario descriptor / fingerprint contract,
2. module registry contracts,
3. objective service contract,
4. capability-based commander inputs,
5. Policy Genome v2 representation and evaluator,
6. telemetry / training result schema,
7. scenario-memory format,
8. navigation concepts where they fit the main game's movement stack.

The lab may use simplified visuals and combat, but learned inputs must represent concepts available in `ww2fps` so training does not optimize against lab-only artifacts.

# AGENTS.md

The single working guide for this repo. Every other doc was folded in here except
`battle/AI_TACTICS_OUTLINE.md` (tactical doctrine from MCDP 1-3 / MCTP 12-10B / MCWP 3-35.3),
which is design reference; read it when the task is about tactics, not plumbing. The full
original docs (roadmaps, lab notes, measurements) are in git history at `1a5b0cf`.

## Working rules

- **Don't create new plan/roadmap/summary `.md` files.** Update this file only when a command,
  contract or rule actually changes. Findings go in the commit message or PR body.
- **State success criteria up front, prove them with a harness below, report the output.**
  Never claim visual/browser validation that wasn't performed.
- **Stay in scope.** Don't touch audio, assets or animation unless asked. Unnamed uploads: ask
  what they are and where they belong.
- `main` deploys to production on every push. Put anything visual on a `work/**` or `preview/**`
  branch first (that publishes a preview; see Deploy).

## What's here

| Area | Entry points | Status |
| --- | --- | --- |
| **Battle Sim** (WW2 squad-AI lab, 50v50 US vs GE) | `battle_sim.php` → `battle/battle_sim.html`; runtime in `battle/*.js`, `battle/modules/NN-*.js` (auto-discovered, load in numeric order) | Active. Proving ground for systems that later move to `ww2fps`. |
| Grass renderer | `game.html`, `grass-api.js`, `grass-streaming.js`, `grass-realism.js`, `grass-effects.js`, `terrain-demo.js`, `terrain-baked.js` | Ported to `ww2fps`; grass is **off** unless `?grass=1` or `window.GRASS_SIM_ENABLED=true`. |
| Terrain bake | `tools/terrain-bake/` | Prototype. |
| Learning/telemetry backend | `battle_learning.php`, `battle_policy.php`, `battle_log*.php`, `battle_metrics.php` ("What We Learned" page) | Active. |
| FBX Motion Lab | `labs/fbx-animation-lab.html` (calibration workbench), in-page **Motion Lab** button | Previews clips; measures hand/weapon contacts and saves per-model sidecars the game loads. |

In the page: a load overlay (`BattleLoading`, in `battle_sim.html`) shows each boot phase (runtime
scripts, scenario, terrain, soldiers/weapons/clips, cover, navigation and squads); the FBX backend
reports per-file progress to it. **Start Battle** unpauses and unlocks audio (iOS needs the gesture).
`window.__battle__` is the live `BattleSim`. HUD buttons: World Debug, AI Graph, Motion Lab.
URL flags: `?seed=`, `?defender=us|ge`, `?soldiers=rifleman`, `?smooth=0`.

## Test harnesses

All of these run offline in seconds unless noted, and all pass on `main`.

**Node sim checks** (`tools/ai-sim-harness/`). They load the shipping sources with no Babylon and
no browser. CI runs every `*-check.js` plus `run.js` across 8 seeds.

```bash
for c in tools/ai-sim-harness/*-check.js; do node "$c" || break; done
for s in 12345 1 2 3 5 8 13 21; do HARNESS_SEED=$s node tools/ai-sim-harness/run.js >/dev/null || echo "seed $s FAIL"; done
```

| Check | Asserts |
| --- | --- |
| `run.js` | Engagement contract: orient before firing, cover used, get down in contact, a squad in contact stops marching, suppression pins, no stance churn, 10v10 resolves. `HARNESS_SEED=<n>` swaps the battle. |
| `objective-nav-check.js` | Real worst-seed defects: never permanently refused a step at a building, no all-squads-one-objective, a side attacks at most 2 objectives at once yet every objective is attacked once the efforts before it fall, capture progress survives an interrupted hold, door/window routing, `stepMovement` aim smoothing |
| `tactical-positions-check.js` | Window/hardpoint reservation ownership, ingress routes, release reasons, diagnostics |
| `cover-positions-check.js` | Cover-slot selection against obstacles and physical footprints |
| `personal-space-check.js` | Physical endpoint allocation and body separation |
| `movement-recovery-check.js` | Recovery episode state machine, goal resets, unreachable criteria, retreat override |
| `movement-state-check.js` | Resolver/movement-progress state for bounds and assault |
| `lean-runtime-check.js` | Squad-plan stability + resolver + tactical route with no extra modules |
| `macro-command-toggle-check.js` | Macro OFF suppresses Force Command while downstream hooks still run |
| `map-pipeline-check.js` | Scenario regeneration publishes the same geometry as a page load (benchmarks once ran 10-70x slow on 4x the hedges) |
| `impact-fx-check.js` | Impact materials, blood placement, FX budgets, restart cleanup (render stub) |
| `world-debug-check.js` | World Debug overlay UI handlers (DOM stub) |
| `extension-order-check.js` | No module replaces `SquadAI.tryFire`/`areaFire`/`updateSoldier`/`updateSquad` or `BattleEngagement.updateSoldier`; the declared fire order (ammunition → ballistics range → trigger-time LOS) holds; undeclared extensions throw |
| `lease-check.js` | `BattleLeases` primitive, tactical-plan and regroup lease lifecycles, regroup re-forms on the rally point |
| `reconstitution-check.js` | Retreated squads home and out of contact reaching 10 survivors group (fewest squads; none planned en route), march to the rally point, merge under one leader (promotion never picks the gunner), get re-tasked; below-strength groups dissolve; Macro OFF does nothing |
| `succession-check.js` | A killed leader is replaced by the most senior survivor after the 6 s `succession` lease, never more than one leader, the gunner only as the last man, successors replaced in turn, no lease on a led or wiped-out squad, seniority order |
| `voice-determinism-check.js` | Voice callouts never draw from the combat RNG: a battle is identical with and without voice |

`harness.js` mirrors `stepMovement()` from `battle/battle-sim.js`. **If that function changes,
change the mirror too.** `bootstrap()` returns the loaded globals for throwaway probes. Write
assertions about mechanism, not dice outcomes, and sweep `HARNESS_SEED=1..40` before trusting a
new check.

**M3C ownership checks** (`scripts/check-*.cjs`). Not in CI, so run them when touching command or movement ownership:

```bash
for c in scripts/check-*.cjs; do node "$c" || break; done
```

These are `macro-mission-command` (brief lifecycle; honours `GRASSTEX_SOURCE_ROOT=<checkout>` for
negative-control runs against another tree), `meso-formation-frame-stability`,
`meso-micro-movement-ownership`, `movement-order-ownership` and `physical-waypoint-refill`.

**Browser smoke + screenshot.** Proves the page boots and the sim runs. Playwright is installed
globally here; don't run `playwright install`.

```bash
mkdir -p /tmp/www && ln -sfn "$PWD" /tmp/www/grasstex
php -S 127.0.0.1:8765 -t /tmp/www >/tmp/php.log 2>&1 &
node scripts/smoke_battle_page.cjs          # SMOKE_SEED, SMOKE_SECONDS, SMOKE_OUTPUT=shot.png
```

Hosted textures 404 when served locally, so the ground renders red. That's expected.

**Deterministic replay / profilers** (Playwright, against the local server above):

| Script | Use |
| --- | --- |
| `scripts/run_m3c_replay.cjs` | One seed, fixed step, full diagnostic JSON. `M3C_SEED`, `M3C_URL`, `M3C_OUTPUT`, `M3C_MACRO=off`. Use for paired before/after comparisons. |
| `scripts/run_battle_benchmark.mjs` | N headless battles. `BATTLE_BENCHMARK_COUNT/SEED/URL/STEP/TIME_LIMIT/OUTPUT`. `merge_battle_benchmarks.mjs` merges shards. |
| `scripts/profile_battle_hotpaths.mjs` (+ `battle-hotpath-profiler.cjs`) | Inclusive wall time per hot function. `BATTLE_PROFILE_SEED/TYPE/SECONDS`. |
| `scripts/profile_meso_churn.mjs` (+ `meso-churn-profiler.cjs`) | Meso fireteam order churn attribution |
| `order-ingress-`, `physical-point-`, `movement-goal-transition-`, `resolver-order-mutation-profiler.cjs` | Inject-only observers: who proposes orders, destination provenance, goal transitions, resolver mutations. They never change behaviour. |
| `scripts/battle-benchmark-intent.cjs` | Shared benchmark predicates (targetless/route-active) |

**Repo-wide checks** (match CI):

```bash
python3 scripts/validate_voice_manifest.py     # voice manifest resolves
python3 scripts/check_audio_manifest.py        # every clip referenced and present
python3 scripts/check_deploy_coverage.py       # deploy plan covers every page runtime
python3 scripts/check_deploy_safety.py         # deploy never deletes/overwrites sidecar JSON, lab or unmanaged server files
for r in scripts/recipes/*.json; do python3 scripts/slice_weapon_shots.py "$r" --check-only; done
bash scripts/normalize_audio.sh Assets/audio && git diff --quiet -- Assets/audio   # needs ffmpeg
```

## CI and workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | PR, push to main | Syntax (JS/PHP/Py/sh/JSON), audio library, sim regressions (all harness checks + 8 seeds), deploy plan + deploy safety |
| `deploy-50webs-php.yml` | push to main | Stamps `build-v<N>`, reruns checks and the deploy-safety check, uploads by content hash to production |
| `deploy-50webs-preview.yml` | push `work/**`, `preview/**` | `https://test.ivandpopov.com/grasstex/preview/<slug>/battle_sim.php`; never touches prod, makes no telemetry/learning writes; its `mirror --delete` skips JSON and lab files |
| `battle-benchmark-standard.yml` | tag `standard-benchmark-*` or dispatch | 10 workers × 10 = **100 battles**: the routine 60 meeting / 20 US-defend / 20 GE-defend checkpoint |
| `battle-benchmark.yml` | tag `benchmark-*` or dispatch (source must be on main) | 30 workers × 10 = **300 battles**, 100 per type. Major milestones only. |
| `battle-hotpath-profile.yml` | dispatch (type/seed/seconds) | Hot-path profile on one seed |
| `tripo-model-sync.yml` | dispatch | Tripo FBX export via `scripts/tripo_models.py` (needs the `TRIP_API` secret) |

Benchmark battles are 600 simulated seconds at a fixed 0.15 s step. Results go to the
`benchmark-results` branch.

**Benchmarks run on GitHub, never locally.** Dispatch `battle-benchmark-standard.yml` on the branch
and on `main` with the same `seed` input for a paired comparison. A branch run publishes only an
artifact and the run summary. Local Playwright runs are for probes and single-seed replays only.

## Battle Sim architecture: M3C (Macro / Meso / Micro Combat)

**Prime rule: one owner per responsibility.** Fix a bad behaviour at the layer that owns it. Don't
stack cooldowns, blockers, retries or extra movement writers to make one counter improve. A fix is
good if the system is easier to explain afterwards.

`General (Macro) → Squad Leader (Meso) → Engagement → Movement Resolver → Movement Execution → Navigation`.
Intent flows down and status flows up. No layer rewrites another's state.

| Layer | Owner (file) | Owns | Must not |
| --- | --- | --- | --- |
| Macro: Force Command | `commander-ai.js`, `commander-doctrine.js`, `commander-routes.js` | `_macroMission` brief {intent, action, objectiveId, point, flank leg, status}, `targetObjective`, `commandRole`, force allocation, reserves | write `commandPhase`/`objective`/route legs, cover, slots or soldier destinations |
| Meso: Squad Leader / Squad Command | `modules/16-squad-plan-stability.js` (`executeMission`, `fireAndMovement`; SquadAI's `squadCommand` owner) | stable squad plan: fireteams, formation, order anchor, fire and movement (assault authorisation, bound cycle and team), corner pauses, defensive posts, regroup, objective phase; the only writer of `commandPhase` (setup states it through `initialPhase`) | do obstacle avoidance; republish orders every tick |
| Micro: Engagement | `engagement.js` (+ `modules/44-combat-urgency.js` drills on its `afterDrill` slot) | per-soldier state machine, stance (`prone`/`crawling`/`tacticalCrouch`), permission to fire, combat proposals to the resolver, the squad contact report (`inContact`, base of fire, pinned) | write final destination; pick objectives; decide squad bounds |
| Perception + shared primitives | `squad-ai.js` | who sees whom, shot resolution, shared `squad.contact`, `areaFire` suppression; hosts the declared extension points (`SquadAI.extend`) and `BattleLeases`; a status-only squad update when no `squadCommand` owner is loaded | set stance/destination in combat |
| Tactical positions | `modules/20-building-hardpoints.js` (`BattleTacticalPositions`: `claim`/`current`/`station`/`release`) | window/hardpoint reservations `assigned→ingress→occupying→holding→released`, committed ingress route | |
| Tactical routing | `modules/52-survival-tactical-route.js` | safe ingress, suppressed cover detours | resurrect an obsolete objective |
| Movement Resolver | `movement-resolver.js` | **sole normal-runtime writer of `soldier.destination`**; coalesces Engagement's per-tick combat requests and arbitrates Meso vs Micro proposals | act as a garbage collector for redundant producers |
| Diagnostics | `modules/36-order-provenance.js` (writer provenance, fast setters, 1.6 s in-place sampler), `32` Loop Watch, `43` forward progress, `99` the one diagnostics exporter (full, loops and orders via `BattleDiagnosticsExport.snapshot(kind)`; `38` only adds its AI Graph buttons) | observe only: removing them leaves a battle identical (~4% wall time) | change gameplay |
| Navigation | `battle-navigation.js`, `modules/39-navigation-physicality-debug.js` | doors, stations, pathfinding, 0.45 m body legality | assign or release tasks |
| Personal space | `modules/51-soldier-personal-space.js` | local physical correction | own commands |

Brief lifecycle: `issued → executing → completed | invalid | failed | superseded`. The General
wakes only on: initial brief, mission complete or invalid, reserve due, a defence request that
changes the task, an objective vacated or changing control on a defend brief, a 120 s strategic
stall, a Squad Leader `doctrine-review` escalation, or a merge (`squad-reconstituted`). Wakes are
exported under `macroCommand`.

**Main effort** (`commander-doctrine.js` `chooseObjective`, Macro only). Saturation (55 per squad past
an objective's allowance) stops a side piling onto one objective; the frontage limit stops it spreading
over all of them. A side attacks at most `maxEfforts` (2) objectives it does not hold at once; opening
another costs `frontageCost` (140), so the next squad reinforces an open effort. Taking an objective
closes its effort. Defending owned objectives doesn't count. Both are scores, never vetoes.

**Reconstitution** (`commander-ai.js` `reconstitute`, Macro only). A retreating squad's Squad Leader
walks it home (`_assembly` `to-base`); home and out of contact it is `at-base`. Only `at-base` squads
form the pool, so no group is planned for a squad still on its way. When the pool holds 10+ survivors
the General groups the fewest squads that reach 10 (never splitting one), picks the objective it will
send them to next (`chooseObjective`, strongest squad as reference) and gives each a `reconstitute`
brief to a rally point on the approach to it: on the spawn line 30 m forward, in line with the
objective, clamped to the side's lanes (centre of the home points if there is no objective). The
brief carries it as `plannedObjectiveId`, never `targetObjective`, so a retreating squad is not counted
at the objective; after the merge the General sends the squad there unless it changed hands
(`to-rally`, `SquadAI.retreatGoal`).
Once all are there the General merges them: the strongest squad with a living leader survives,
otherwise the most senior survivor is promoted (ex-leader, rifleman, scout, gunner last). The re-formed
squad has `leaderId`, `establishment` 10 and only living members; absorbed squads are `disbanded`.
Command is `SquadAI.leaderOf`/`isLeader`, never a role check. **Succession** (Squad Leader,
`updateSuccession`): a squad whose leader is killed is leaderless for the 6 s `succession` lease
(leaderless cohesion/corner rules, 0.8 accuracy), then `SquadAI.mostSenior` (sergeant, rifleman,
scout, gunner last; lowest id breaks ties) takes command and slot 0 and the penalty ends. At a merge
the most senior surviving leader commands.

**Ranks.** The squad leader is the `sergeant` role (US Staff Sergeant, GE Unteroffizier); the Meso
layer is the Squad Leader (`squad-leader`: `squadCommand` owner and lease owner). "Captain" is only
the company echelon in `00-battle-sides.js`. Names that stay `captain*` on purpose, because stored or
exported data uses them: the policy keys `captainlessCohesion`, `cornerNoCaptainExtra`,
`captainDead` (server genomes, `battle_policy.php`), the telemetry and wake names
`decision-captain-request` and `captain-request`, the export keys `captainAlive`, `captainRequest`,
`captainWindowAssignments` and `captainlessSamples`, the module file and system id
`13-captain-command-throttle`, and the trait seed in `11-soldier-individuality.js` (it still hashes
`captain` so existing seeds replay the same battle).

**Engagement states:** `advance → orient → (decide) → bound → engage`, then
`pinned`, `assault`, `alert`, `withdraw`, `station`. `orient` never fires (REACT 0.45 s scout to
0.85 s gunner). `engage` pins position and commits stance. `alert` holds the sector for
`ALERT_HOLD`. Fire requires: a live target, not reloading, past `eng.fireReadyAt`, speed ≤12% and
not crawling, within `AIM_CONE` (~12.6°), and gunner emplaced. `squad.inContact` is
`contactCount>0 || suppressors>0`. Suppression deals no damage, only pins. There are at most
`MAX_SUPPRESSORS` suppressors, the MG first. The Squad Leader (`fireAndMovement`) sends one fireteam
forward every `BOUND_CYCLE` if ≥2 are shooting, only in an assault phase, and the MG never moves.
Engagement constants live at the top of `engagement.js` (`BattleEngagement.tuning`), bound timing in
`16-squad-plan-stability.js`; both are deliberately outside the policy genome. Sight and cover are
per stance (`obstacle-field.js`), so going prone genuinely helps.

**Extend through declared slots, never by replacing a function.** `SquadAI` declares `fireGate`,
`shotModel`, `areaFireGate`, `afterShot`, `squadCommand`, `beforeSoldier`, `afterSoldier`;
`BattleEngagement` declares `afterDrill`. Add the id to the declared order and attach with
`extend(stage, id, fn)`; reassigning `tryFire`/`updateSoldier`/`updateSquad` makes behaviour depend
on module file order (`14-z-ballistic-raycast.js` once silently discarded the LOS gate that way).

**A command hold is a lease.** Commitments that block another layer's intent change live in
`BattleLeases` (`squad-ai.js`, one table per squad: kind, owner, since, until, reason, release, plus
an ended log): `tactical-plan`, `regroup`, `regroup-cooldown`, `regroup-bypass`, `corner-hold`,
`bound`, `bound-cycle`, `succession` (Squad Leader) and `objective-security` (capture zone). `holds()` is `t < until`.
Each owner declares its kinds with `BattleLeases.define(kind, {priority, timer, progress})`: priority
orders live leases (`active()`, `top()`); `timer: true` marks a pure clock that `prune()` ends as
`expired` once its time is up (the Squad Leader prunes each command tick); kinds whose expired record
still means something (`objective-security`, `succession`, `regroup`) are never timers; `progress` is
a read-only "is this hold getting anywhere?" test. The session export lists each squad's live and
recently ended leases and `missionHeldBy`, and the AI Graph **Leases** panel (`modules/37-lease-panel.js`)
shows them live. Don't add a new `...Until` field for a hold. Deliberately not leases: fireteam order renewal (on the order
record), the garrison request (a standing constraint), and execution timing inside one owner.

**Presentation never touches the combat RNG.** Voice, FX and audio must not draw from
`battle.random`; the same seed must simulate the same battle with or without assets
(`voice-determinism-check.js`).

**Formatting:** the M3C behaviour files (command, squad, engagement, movement, weapon rules) are
Prettier-formatted with `.prettierrc.json` (`npx prettier@3 --write <file>`). Don't hand-compress
them back into long single lines.

**Frozen:** path clearance, body width and hedgerow geometry. Hedges are one authoritative 3D
volume (2.2 m wide and tall) for rendering, nav, LOS and ballistics. Change it only on a
deterministic physical-navigation regression. v128 is the reference for movement feel.

### Evidence-first workflow (behaviour or performance regressions)

1. Reproduce on the exact seed/scenario. 2. Measure before editing (diagnostics, provenance,
route/movement/position state, counters). 3. Name the broken invariant in one sentence.
4. Name the one owning layer and subsystem; two apparent owners is itself the bug. 5. Trace the
**producer**, not the resolver. 6. Add a failing deterministic check (harness above) when
practical. 7. Make the smallest structural fix at the owner, preferring deletion. 8. Re-run the same
seed and compare before/after. 9. Run the full harness suite. 10. Benchmark only after a
material change is stable: standard 100 for checkpoints, 300 for milestones.

**Stop and write a root-cause chain** (observed → evidence → owner → invariant → fix → test)
before coding if any of these hold:

- the fix needs guards in two or more unrelated modules;
- a timer is added to counter another timer;
- A→B→A churn is being fixed in the resolver instead of the producer;
- a soldier with a legal destination stands still with `stuck=false`;
- reservations are unique but bodies still stack;
- metrics improve but it looks worse;
- the explanation got longer.

**Performance is a gate.** A median slowdown of more than ~25% per battle on the same profile
means stop and profile. Don't hide it with a bigger step, shorter battles or disabled systems.
Wrap hot functions in the harness and fix the dominant subsystem at its owner. Optimisations must
preserve determinism and behaviour.

**Change discipline:** one conceptual change per commit. Use a branch plus preview for anything
that crosses an ownership boundary. If a candidate regresses movement feel, revert it as a unit.
Small root-caused fixes may go straight to main.

**Statistics:** win splits are underpowered. Telling 10% from 3.3% needs ~216 runs per arm, and a
30-run arm can't carry a claim. Report Fisher p-values and don't read mechanism into a
four-run swing. Live-browser runs at `timeScale` 8 aren't deterministic, so use the replay script
for controlled pairs, and serve both arms the same way: `battle_sim_local.php` in preview mode (a
`preview.json` beside it) reads `state/` and the audio manifest two directories up.

### Open issues (as of v160 / 2026-09-24)

- Regroups: half used to time out at 18 s because the order anchor stayed with the leading men;
  fixed (timeouts 76 → 6 over 30 seeds). GitHub standard benchmark run 11 (PR #37, 2026-09-25,
  benchmark `regroups`): 9.4 regroups per battle in meeting, 7.3 in US-defend and 5.9 in GE-defend,
  with 15, 2 and 4 timeouts over 60/20/20 battles. Defend scenarios regroup no more often than
  meetings, so there is no defend-specific rise left to chase.
- Window crowding (closed 2026-09-25): bodies at firing stations don't stack. A probe on 6 full standard
  seeds found 1 sample in ~20k occupied-station samples with two men on one station, and a non-holder
  on a held window in one battle only. The old "claim collisions 23 → 3,838" swing was `select()`
  counting every held window it passed over; that is now `reservedStationsSkipped`, and
  `claimCollisionsPrevented` counts only real claim-time collisions.
- Personal-space corrections (~8-10k per battle on the GitHub standard benchmark) are mostly same-squad
  men crossing on the move, not fights: pairs still overlapping 1 s later are rare (5-20 per battle).
  In order: (1) two men both on formation slots crossing. 75-83% of those are between different
  fireteams, and the rate is ~7× higher in the 6 s after a formation or facing change. (2) Bounding men
  walking through men holding. (3) Engagement `hold` endpoints within 0.9 m of each other. Hold isn't a
  physically allocated kind in `51` `DEST_KINDS`.
  - **Fireteam frontage (preview, awaiting a movement-feel review):** branch `work/fireteam-frontage`,
    https://test.ivandpopov.com/grasstex/preview/fireteam-frontage/battle_sim.php. Team anchors were
    averages of per-man slots that alternate sides by `slotIndex`, while team membership also comes
    from `slotIndex`, so every team sat in the middle (alpha and bravo 1.2 m apart in line). The Squad
    Leader (`16` `desiredAnchor`) now gives each fireteam its own offset in the squad frame; new
    `fireteam-frontage-check.js` (main fails it). GitHub standard benchmark, main run 17 vs branch
    run 16: corrections −12% meeting, −2% US-defend, −12% GE-defend; destination conflicts −13 to −44%;
    wins within noise (meeting US 31 → 25 of 60, p=0.36); median wall 26.7 → 28.6 s; movement stalls
    40 → 49 (the worst is a straggler stopping in `alert` while catching up, a pattern main also shows).
    Open the PR if the preview reads right, else revert as a unit.
  - **Next: spawn men near their formation slots.** Cross-team crossings barely changed with frontage,
    and about half come in the first minute: men spawn in a random cluster around the lane
    (`battle-sim.js` `spawnSide`, `modules/10-infantry-squad.js`), ignoring their slot, then cross each
    other to sort out. Placing each man at his fireteam position at spawn is its own change, and it
    changes the seeded start, so benchmark it paired on GitHub.
- Strategic-stall wakes mostly re-pick the same objective, because doctrine has no alternative.
- Hot path is now navigation replans (~3.3 s) and `sightBlocked` (~3.5 s) per ~13.7 s battle.
- Movement Progress ignores retreat by design; `movementStopReason` is the observable.
- Next architecture steps: a versioned `SquadIntent` + one intent resolver (leases, with priority, progress tests and a graph view, now exist), a real Squad Leader local planner, then
  platoon/company command, fallback/counterattack and combined arms. Capture Zone and
  Prepared Defense already publish *requests* that Force Command accepts; follow that pattern.
- Meeting engagements deliberately get no runtime engineer fortification (`engineerTick` exits early).
- **Sergeant weapons.** Squad leaders carry the `smg` kind: US Thompson, GE MP40 (`WEAPON_MODELS`).
  Their grips use the generic `WEAPON_POINTS`; set per-model sidecars in the Motion Lab.
- **Secondary weapons (pending).** A soldier carries a sidearm only where it was historically
  issued. In a German squad the MG gunner (Schütze 1, P38/P08) did. In the US squad the M1919 gunner
  (M1911A1) did, and so did paratroopers more widely. Riflemen generally didn't. It needs a
  `secondary` weapon slot on the soldier (model, ammo and stats kept apart from the primary). It also
  needs an Engagement rule for when to switch: primary empty or jammed with a target inside pistol
  range. The pistol hold, the `m1911a1`/`p38` models and the pistol clips already exist. Presentation
  stays off the combat RNG.
- **General concentration of effort.** Done as a frontage limit in `chooseObjective` (see Main effort).
  GitHub standard benchmark, main run 12 vs PR #37 run 11 (same seeds, live policy rev 14): meeting
  spread fell 2.75/2.60 → 2.33/2.33 objectives per side with captures unchanged (4.53). Wins were
  unchanged too (US/GE 32/28 → 31/29 meeting, 19/1 → 18/2 US-defend, 2/18 → 0/20 GE-defend; median
  wall time 27.9 → 26.5 s). The win effect of concentrating is unmeasured; both sides concentrate, so
  it needs a one-sided arm of ~200+ battles. A platoon layer is not warranted at 5 squads per side;
  revisit at ~9+ squads or combined arms.

## Soldiers, weapons, animation

AI requests semantic tags and the backend renders them. The tags are `locomotion.idle|walk|crouch-walk|prone-crawl`,
`combat.aim|fire|reload|hit`, `stance.stand|crouch|prone` and `death.front|back|side`, and
`BattleSoldierModel.TAGS` is the source of truth. The backend (`modules/53-fbx-soldier-backend.js`)
never decides tactics, ammo, hits or paths.

- Models, one per class (`MODEL_SETS` in the backend, keyed by role): `Assets/soldiers/{us,ge}-captain.fbx`
  (sergeant; the file keeps its old name), `-scout`, `-gunner`, `-engineer`, and `-paratrooper` for
  riflemen and any role without a model. `?soldiers=rifleman` shows the older `-rifleman-rigged.fbx`.
- Clips: `Assets/animations/*.fbx` (Mixamo rig with fingers, named `<description> - <clip name>`),
  keyed in `CLIPS`, `FAMILIES` (8-way) and `FOUR_WAY` in `modules/53-fbx-clip-table.js`
  (`BattleFbxClips`, data only). The battle fetches only those files, and the lab loads the same table
  for its **Show all animation clips** toggle (off: only in-game clips; on: all, in-game marked ●).
  Bone names are canonicalised at load, so `mixamorig:` and older rigs bind the same clips.
- Weapons (`WEAPON_MODELS`, dealt per role, a list in turn): rifle Garand / Kar98k, LMG M1919A6 /
  MG42 (folded-bipod carry variants), scouts M1 Carbine + Thompson / FG42 + MP40, sergeants
  M1911A1 / P38. Babylon is pinned to `babylonjs@9.27.1`.
- **Weapon seats and sidecars.** Hand contacts and weapon points default to `SOLDIER_CONTACTS`,
  `WEAPON_POINTS` and `WEAPON_MODEL_POINTS`. A per-model sidecar `Assets/soldiers/<model>.fbx.json`
  (contacts, one slot per weapon: grip / fore-near / fore-far, pistol arm and wrist dials) overrides
  them; the backend fetches it on load (`BattleFbxSoldier.sidecars()` lists what loaded). Measure in
  `labs/fbx-animation-lab.html` (pick model, clip and weapon, click the contact vertices, **Seat
  weapon**, then **Per-model sidecar** → Save), which posts to `labs/save-calibration.php` (validated
  numbers, existing soldier FBX names only). Sidecars are server-owned: never committed, never
  deployed or deleted.
- Clips are retargeted at load (rest pose, units, hip height). Looping clips have hip drift removed,
  and that drift becomes their natural ground speed. Playback rate is ground speed ÷ clip speed.
  The upper-body overlay (aim/fire/reload) sits on the lower locomotion layer. The weapon grip snaps
  to a right-palm anchor, the fore-end runs through the left palm, and aim uses a capped spine twist (≤40°).
- Fallback: the procedural rig in `battle/soldier.js` is used while the FBX loads (25 s cap), and the
  trainer and headless benchmark always use it (`setImportedEnabled(scene,false)`). Such soldiers have
  `rig===null`.
- Wired beyond the basics: turn-in-place (standing, crouch, prone), death pools, hit reactions
  (`combat.hit`), idle variants and suppression flinches. Still unused: prone roll right (a left roll
  needs mirroring) and the kneel set. Jump clips need a nav vault edge.
  Not in the pack: sideways crawl, grenade throw, melee, limp, climb, window lean.

**Asset pipeline.** Use the Blender app bundle `/Applications/Blender.app/Contents/MacOS/Blender`, not the
broken `blender` on PATH. Use lowercase filenames, since the host is case-sensitive (`git mv` to rename).

```bash
Blender -b --factory-startup --python tools/fix-soldier-model.py -- --input raw.fbx --output Assets/soldiers/<fac>-<name>.fbx --texture-name <fac>-<name>-albedo [--fit-skin]
Blender -b --factory-startup --python tools/prepare-weapon-model.py -- --input raw.fbx --output Assets/weapons/<name>.fbx --name <name> --length <m> [--fold-bipod]
python3 tools/prepare-muzzle-flashes.py --input pack.zip --output Assets/effects/muzzle-flash   # update FLASH_COUNT if count changes
```

Soldier FBX requirements: one skinned mesh, the shared bone names (`Hips`, `Spine02/01/Spine`, `neck`,
`Head`, `Left/Right Shoulder/Arm/ForeArm/Hand/UpLeg/Leg/Foot/ToeBase`), no normal maps, and a unique
embedded albedo name. Weapon layout: barrel on +Z, butt 0.40 m behind the grip, barrel top +0.03 m.
Lengths: Garand 1.107, Kar98k 1.11, MG42 1.224, M1919A6 1.346, M1 Carbine 0.904, FG42 0.975,
Thompson 0.857, MP40 0.833, M1911A1 0.216, P38 0.216 (pistols add `--butt 0.06`). A generator
character in an A-pose must be moved to the library's T-pose rest first (`tools/match-rest-pose.py
--rest-from <library clip>`, refuses above 1°); an unrigged one borrows a rigged twin's weights
(`tools/rig-soldier-model.py`). `tools/blender-presets/` holds the matching manual FBX export presets.

Before committing, run the lineup: `node scripts/fbx-soldier-lineup.cjs` against the local server
checks every faction/role model + weapon pair and the two-hand hold, and writes close-ups to
`$FBX_OUT` (`FBX_CHROME` picks a browser; visual PASS is still a human judgement: lit, no holes,
factions textured differently, weapon on the hands). Keep weapon source `.zip` packs next to the
`.fbx`; new generator packs in `Assets/soldiers/new/` are gitignored. Only the `.fbx` deploys.

## Audio

`Assets/audio/manifest.json` is the runtime contract, and the runtime never calls an API.

- **Route:** fetch into gitignored `.runtime/`, slice, master, register in `manifest.json`, then commit
  the MP3s only.
  - Fetch: `fetch_sonniss_ww2.py scan|fetch <year>`, which does range requests into bundle zips, or
    `fetch_freesound_cc0.py <ids>`, which refuses anything not CC0.
  - Slice: `slice_weapon_shots.py scripts/recipes/<recipe>.json`. It uses transient detection, or
    `segments` for engines.
  - Master: `bash scripts/normalize_audio.sh Assets/audio`. It's incremental via `.mastering-state.tsv`.
    Delete that file to force a remaster when a target changes. `--explain <path>` shows the
    target, and `UNCOVERED` means no target exists, so the file would ship unmastered.
- **Targets:** mono MP3 48 kHz/128 kbps with a -1 dBTP ceiling.
  - One-shots are levelled on the loudest 100 ms (dBFS, not LUFS): small arms -16, cannon -13,
    foley -26, with at most +6 dB boost.
  - Sustained material uses EBU R128: voices -18, engines -22, ambience -26 LUFS.
  - Do distance in the runtime mix, never in the master.
- **Placeholders:** declared-but-unrecorded clips are listed in `Assets/audio/.manifest-placeholders.txt`.
  Delete a line when its audio lands; CI fails if a listed clip exists. New directories must be in
  `AUDIO_ASSET_GLOBS` in `prepare_incremental_deploy.py`, or they 404 live.
- **Voices:** generated with ElevenLabs `eleven_v3` via `scripts/generate_voice_callouts.py
  [--faction us|ge] [--force [EVENT]]`, which needs `ELEVENLABS_API_KEY` (never commit it).
  - Voice IDs: US `TxWZERZ5Hc6h9dGxVmXa`, GE `Z2yQ1EdlDmcIgh9Pn4Lw`. Prompt prefix
    `[shouting][hoarse][panicked]`, settings stability .4, similarity .7, style .9, speaker boost.
  - Don't rename generated files.
  - Pitch variants (-1.4 / 0 / +1.3 semitones, split 30/40/30, tempo-compensated) are built at deploy
    by `build_voice_pitch_variants.sh` and aren't committed.
- **Acoustics:** 1 unit ≈ 1 m, 20·log10(r) spreading, 343 m/s delay. Shout culls at 150 m,
  small arms at 1200 m. Settings live in `Assets/audio/acoustics.json`.
- **Licensing:** only Sonniss GDC bundles (royalty-free, no attribution; **no AI training and no
  redistribution as a library**) or Freesound CC0. The M1 Garand clips are Freesound 385785, 386842,
  505204, 460855 and 505206. Provenance per weapon: `git show 1a5b0cf:Assets/audio/WW2_SOURCES.md`.

## Deploy and assets

- Production `/grasstex/battle_sim.php` is `battle_sim_local.php`, uploaded under that name by the
  deploy; it serves the deployed runtime and writes nothing to the host. The repo's own
  `battle_sim.php` (a GitHub-mirroring loader that writes git-tracked `Assets/` to the host and
  never deletes) is not deployed.
- `scripts/prepare_incremental_deploy.py` uploads by content hash: `.fbx` from soldiers,
  animations and weapons, muzzle-flash `.png`, audio, and the Motion Lab's own files
  (`MANAGED_LAB`: `labs/fbx-animation-lab.html`, its two `.js`, `asset-list.php`,
  `save-calibration.php`). `scripts/build_version.py stamp|show|tag`
  derives the version from `build-v<N>` tags. Each deploy also lists the host's
  `Assets/{soldiers,animations,weapons}` and re-uploads any FBX the hash state records but the host
  no longer has (`prune_missing_remote_assets.py`), so a folder can be cleared on the host and
  refilled by running the deploy (Actions → Deploy Battle Runtime → Run workflow).
- **The deploy never deletes or overwrites server files the repo does not manage.** Hand-placed
  sidecar JSON (clip/model/lab metadata beside the FBX assets), the live FBX soldier-animation lab
  files and everything else unmanaged stay put. The planner may delete only a
  `battle/modules/*.js` it deployed itself that has left the repo; any JSON other than
  `battle/build-version.json` and `Assets/audio/manifest.json`, and any path containing `lab` or
  `sidecar`, can never be deleted or uploaded over, except the exact `MANAGED_LAB` paths, which
  are uploaded but never deleted; more than 8 deletes in one run aborts the
  deploy (`DEPLOY_MAX_DELETES` to override an intended bulk retirement). `check_deploy_safety.py`
  proves this in CI and again inside the deploy before anything is uploaded. Keep it that way:
  don't add `mirror --delete` or broaden the delete rule for production.
- `Assets/terrain/{terrain.json,terrain.bin,splat.png,roaduv.png}` exist only on the host. **Don't
  add placeholders** with those names.
- Hosted textures load only from `test.ivandpopov.com` (WebGL rejects them cross-origin).

## Grass & terrain (reference)

- `GrassAPI` (`grass-api.js`):
  - Masks: `addArea` / `excludeCircle|Box|Polygon|Corridor|Segment`.
  - Surfaces: `allowSurface` / `excludeSurface` + `setSurfaceResolver`.
  - Terrain: `setTerrainSampler` / `setTerrainMesh` / `setMaxSlope`.
  - Queries and rebuilds: `isAllowed`, `snapshot()`, `requestRebuild()`. Set `autoRebuild=false`
    for bulk edits.
  - Placement is deterministic per seed.
- **Invariant:** grass, shadows and the camera must sample *the rendered mesh* (or the same
  heightfield the mesh displaces from), never the analytic height. The gap was 0.41 m beside the road.
  - `sampleAt` interpolates the GPU's triangle: vertex `col+row*GRID`, z falls with row, split
    `(A,B,C)` if u≥v, else `(D,A,C)`.
  - With non-uniform columns, use the real column width, keep UVs world-linear in X, and use
    `Uint32Array` indices.
- Shadow decals tilt into the terrain tangent plane, and their alpha must reach 0 at `SHADOW_END`.
- `tools/terrain-bake/`:
  - `node genmap.js --seed 7` generates `map.svg`, with graded routed roads.
  - `node --max-old-space-size=4096 run.js` bakes the heightfield and splat, and `render.js` draws figures.
  - `lod.js` and `stream.js` do camera LOD with crack snapping and hysteresis.
  - `terrain-baked.js` feeds one field to both grass and mesh.
  - Known gap: its `ShaderMaterial` doesn't receive cascaded shadows.

## Conversation maintenance (local Codex / VS Code only)

Hooks in `.claude/settings.json` and `.codex/hooks.json` run `scripts/conversation-maintenance.py`
to queue `/compact` and `/clear` via keystrokes or the Codex app-server. They do nothing in cloud
sessions.

- When a task gets long, run `scripts/conversation-maintenance.py compact --reason "context is long"`.
- On a clear task pivot, tell the user it hit a task-pivot marker and run `clear "next task" --reason "task pivot" --summary "…" --criteria "…"`.
  This writes `.runtime/handoff-prompt.md`, which the SessionStart/UserPromptSubmit hooks inject once.
- Prerequisites: `codex` on PATH (or `CODEX_BIN`), plus macOS Accessibility permission for VS Code.
  Re-approve hook trust after editing either hook file.
- Use `--transport auto` and `--refresh-mode window`. `webview` froze Codex once.

# Tactical AI Comparative Benchmarks

## Purpose

Record the historical game-AI systems that are useful reference points for Battle Sim, quantify the
architectural comparison, and make the project's target explicit.

This is **not a claim that a larger score means a game has better AI**. The score measures documented
architectural coverage across seven dimensions. Encounter design, animation, audio, level geometry,
performance, tuning, and player readability can make a narrower system feel substantially smarter
than a broader one. Proprietary systems may also have capabilities that are not publicly documented.

Low scores for another game therefore mean **not central / not publicly evidenced / outside that
game's scope**, not necessarily "bad AI."

## Scoring rubric

Each dimension is scored from 0 to 5:

- **0** - outside the game's scope or no useful public evidence found.
- **1** - minimal or incidental capability.
- **2** - present, but limited or secondary.
- **3** - meaningful, explicit subsystem.
- **4** - strong and important to the architecture.
- **5** - defining capability or unusually explicit/complete implementation.

The seven dimensions are:

1. **Individual tactical adaptation** - an individual can react/replan rather than only execute a fixed script.
2. **Squad coordination** - group orders, fire/support behavior, formations, shared positional intent.
3. **Hierarchical command** - distinct higher/lower command layers with bounded authority.
4. **Physical navigation / positioning** - cover, firing positions, route selection, obstacle/building use.
5. **Systemic / world simulation** - autonomous activity outside the immediate firefight.
6. **Decision explainability** - explicit ownership/contracts/reasons that make a decision chain intelligible.
7. **Developer observability** - trace/debug tooling for paths, causes, state, loops, and ownership.

`Breadth >=4` counts how many of the seven dimensions score at least 4. It is useful as a compact
measure of how many areas are architectural strengths rather than merely present.

## Quantified comparison

| System | Individual | Squad | Hierarchy | Navigation / positioning | World simulation | Explainability | Observability | Total / 35 | Breadth >=4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **F.E.A.R.** | 5 | 4 | 1 | 4 | 1 | 2 | 2 | **19** | **3 / 7** |
| **Halo 2** | 4 | 5 | 3 | 5 | 1 | 3 | 3 | **24** | **3 / 7** |
| **Arma 3** | 3 | 4 | 4 | 3 | 3 | 2 | 2 | **21** | **2 / 7** |
| **S.T.A.L.K.E.R.: Shadow of Chernobyl** | 3 | 2 | 1 | 3 | 5 | 2 | 4 | **20** | **2 / 7** |
| **Alien: Isolation** | 5 | 0 | 3 | 4 | 1 | 3 | 2 | **18** | **2 / 7** |
| **Battle Sim - current architecture** | 4 | 4 | 3 | 5 | 2 | 5 | 5 | **28** | **5 / 7** |
| **Battle Sim - roadmap target** | 5 | 5 | 5 | 5 | 4 | 5 | 5 | **34** | **7 / 7** |

### How to read the Battle Sim scores

The **current 28/35** is not a claim that the current battle is already "better AI" than these shipped
games. It means the implementation already spans more of the selected architectural categories at
once: Force Command, squad/fireteam organization, Engagement, Movement Resolver, building/window
use, mesh-footprint navigation, order provenance, Loop Watch, world debug paths/waypoints, and
exportable diagnostics.

The **34/35 roadmap target** intentionally does not score world simulation at 5. Battle Sim is a
bounded tactical battle simulator, not an A-Life-style persistent world. Step 8 may add larger-unit
and combined-arms behavior, but persistent autonomous world simulation is not currently the core
product goal.

The strongest differentiator is therefore not "more complicated AI." The target is the combination:

```text
Force Intent
  -> owned strategic constraints / leases
  -> Captain Local Plan
  -> Squad / Fireteam Plan
  -> Engagement combat proposal
  -> Movement Resolver
  -> physical navigation / rolling waypoint queue
  -> observed execution and progress
```

with that same chain exposed through provenance, loop diagnostics, graph state, and world-debug
geometry.

## Historical reference points

### F.E.A.R. - individual planning and coordinated combat

Jeff Orkin's GDC material describes a system whose finite-state machine had only **three states**,
while **A\*** was used for both action planning and path planning. Enemies could dynamically re-plan
when circumstances changed, while higher-level squad behavior included suppression, advancing cover,
formation movement, organized searches, and flanking through alternate entrances.

That makes F.E.A.R. the strongest reference here for **real-time individual tactical adaptation**. It
is narrower than Battle Sim's planned hierarchy, but exceptionally focused on making individual and
small-group combat look deliberate.

Source:
- GDC Vault, Jeff Orkin, *Three States and a Plan: The AI of F.E.A.R.*
  https://www.gdcvault.com/play/1013459/contactUs

#### Project connection

F.E.A.R. is also a personal reference point rather than only an academic benchmark: the project
author was part of clan **[FKA]** during the original F.E.A.R. era. The planned Battle Sim should not
copy F.E.A.R.'s implementation, but reaching the same sense that opponents are actively solving the
fight is a meaningful quality bar.

### Halo 2 - squad orders, firing positions, and directability

Bungie's published Halo 2 AI architecture is one of the closest philosophical matches to the Battle
Sim hierarchy. Its core behavior system was described as a hierarchical behavior DAG with **on the
order of 50 behaviors**; later in the same discussion, parameter-management examples reference about
**115 behaviors** across roughly 30 character types.

More importantly, Halo 2 grouped AI into **squads**, firing positions into **areas**, and connected
them with **orders**. Assigning an order made a set of firing positions available to the squad, and
trigger conditions could transition the squad to another order. Orders also carried broad behavioral
constraints/styles: effectively "go here and behave this way."

This is very close to the Battle Sim principle that higher command should declare intent and bounded
options without directly puppeteering each soldier.

Source:
- Game Developer / GDC 2005, Damian Isla, *Handling Complexity in the Halo 2 AI*
  https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai

### Arma 3 - explicit military group command

Arma exposes a genuine group/leader model with waypoints, formations, behavior modes and rules of
engagement. Its documented group combat modes have **five named states** (`BLUE`, `GREEN`, `WHITE`,
`YELLOW`, `RED`), ranging from never-fire/formation behavior to fire-at-will and loose engagement.
Waypoints can change combat mode, behavior, formation and speed; High Command adds another layer for
controlling groups.

The official AI-behavior documentation also describes infantry in Combat mode using bounding
movement and available cover. This makes Arma the strongest reference here for visible military
command semantics, although its group/waypoint architecture and Battle Sim's planned versioned
intent/lease ownership are not the same design.

Sources:
- Bohemia Interactive Community, *Combat Modes*
  https://community.bohemia.net/wiki/Combat_Modes
- Bohemia Interactive Community, *AI Behaviour*
  https://community.bohemia.net/wiki/AI_Behaviour
- Bohemia Interactive Community, *Waypoints*
  https://community.bohemia.net/wiki/Waypoints
- Bohemia Interactive Community, *Arma 3: High Command*
  https://community.bohemia.net/wiki/Arma_3%3A_High_Command

### S.T.A.L.K.E.R. - simulation breadth and debug philosophy

Dmitriy Iassenev described A-Life using **two simulation modes**, online and offline. Offline NPCs
continued to move over the global navigation graph and pursue simplified goals; fully detailed
"online" simulation normally covered characters within about **150 m** of the player, with the radius
configurable by level.

Smart terrains assigned/prioritized activities and let characters migrate through the world as goals
changed. That is why S.T.A.L.K.E.R. scores 5 for systemic/world simulation even though its developer
explicitly described team combat as an area he wanted to improve.

Of particular relevance to Battle Sim, Iassenev's development advice was that each AI component should
have its own debug draw/mode/screen, including paths, visibility checks, and cover information. That
is remarkably aligned with the World Debug, path/waypoint overlay, order provenance, and Loop Watch
work already in Battle Sim.

Source:
- Game Developer interview, *Inside The AI Of S.T.A.L.K.E.R.*
  https://www.gamedeveloper.com/game-platforms/interview-inside-the-ai-of-i-s-t-a-l-k-e-r-i-

### Alien: Isolation - clean macro/micro authority separation

Creative Assembly used **two distinct AI management systems**: a macro/director layer and the
micro/Alien AI. The director knows where the player is and periodically points the Alien toward a
general area, while the Alien still has to sense, search and act using its own behavior system.

Public descriptions put the Alien's behavior tree at **more than 100 nodes**, with roughly **30
high-level nodes** involved in selecting broad behavior. The important reference for Battle Sim is
not the horror behavior itself; it is the clean authority boundary between a macro layer that says
"look in this area" and a micro layer that decides how to execute.

Sources:
- Game Developer, *The Perfect Organism: The AI of Alien: Isolation*
  https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation
- Game Developer, *Revisiting the AI of Alien: Isolation*
  https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation

## What Battle Sim is actually trying to combine

The comparison suggests that no one reference game is the template. The roadmap combines strengths
that historically appeared in different systems:

| Reference | Principle worth preserving |
| --- | --- |
| F.E.A.R. | real-time tactical replanning that makes an individual combatant look purposeful |
| Halo 2 | squad orders expose a bounded set of positions/behaviors instead of scripting every actor |
| Arma | military group hierarchy, formation and order semantics |
| S.T.A.L.K.E.R. | systemic autonomy plus aggressive visual debugging of paths/visibility/cover |
| Alien: Isolation | macro intent guides micro behavior without giving the lower AI omniscient answers |
| Battle Sim | explicit ownership, versioned intent, leases, movement arbitration, physical nav, and end-to-end causal diagnostics in one stack |

The design target is therefore **breadth with clean ownership**, not maximal complexity. A feature
should only raise the architecture score if it preserves the invariant that each decision class has
one authority and remains explainable after the battle.

## Quantitative acceptance target for the roadmap

The architecture benchmark becomes useful only if it drives measurable acceptance criteria. By the
end of Steps 3-7, a normal fixed-seed match should target:

- **1** authoritative strategic `SquadIntent` per squad at a time;
- **1** final normal-runtime writer of `soldier.destination` (`BattleMovementResolver`);
- **0** normal-match strategic-field writer conflicts in provenance;
- **100%** of active holds represented by a named lease/constraint with owner and release/progress reason;
- **100%** of Captain local plans linked to a parent Force Intent version;
- **100%** of movement-resolver winners attributable to an order or combat proposal;
- a loop alert capable of naming the active intent, lease, Captain/Squad plan, proposal owner and observed no-progress condition;
- fixed-seed regression runs showing no increase in pathological position-seeking after each command-layer change.

Those numbers are deliberately stricter than the comparative game scores. The advantage of building
an AI lab around the simulation is that internal causality can be measured directly instead of being
judged only by whether a soldier looked smart in one encounter.

## Research caution

These comparisons are based on publicly documented architecture, not access to proprietary source
code. Scores should be revised if better primary-source documentation is found. They should never be
used as marketing claims that Battle Sim "has better AI" than a shipped game without controlled
behavioral testing.
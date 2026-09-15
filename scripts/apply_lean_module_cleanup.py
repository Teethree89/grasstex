#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path, replacements):
    p = ROOT / path
    text = p.read_text()
    original = text
    for old, new in replacements:
        text = text.replace(old, new)
    if text != original:
        p.write_text(text)

# Harnesses point at the compatibility filenames that now contain the consolidated owners.
patch('tools/ai-sim-harness/harness.js', [
    ("battle/modules/16-squad-command.js", "battle/modules/16-squad-plan-stability.js"),
])
patch('tools/ai-sim-harness/lean-runtime-check.js', [
    ("battle/modules/16-squad-command.js", "battle/modules/16-squad-plan-stability.js"),
    ("battle/modules/44-combat-mobility.js", "battle/modules/44-assault-forward-guard.js"),
    ("battle/modules/52-movement-execution.js", "battle/modules/52-survival-tactical-route.js"),
])

# Existing movement checks now load the single execution owner instead of the deleted recovery file.
patch('tools/ai-sim-harness/movement-state-check.js', [
    ("if(fs.existsSync(path.join(H.REPO,'battle/modules/53-movement-progress.js')))load(r,'battle/modules/53-movement-progress.js');",
     "load(r,'battle/modules/52-survival-tactical-route.js');"),
])
patch('tools/ai-sim-harness/movement-recovery-check.js', [
    ("load(r,'battle/modules/53-movement-progress.js');", "load(r,'battle/modules/52-survival-tactical-route.js');"),
])

# Tactical-position tests only need the command owner, hardpoints, physicality, ammo and personal-space.
patch('tools/ai-sim-harness/tactical-positions-check.js', [
    ("load(r,'battle/modules/17-engagement-plan-doctrine.js');", ""),
    ("load(r,'battle/modules/47-assault-bound-momentum.js');", ""),
    ("load(r,'battle/modules/49-combat-urgency.js');", ""),
    ("load(r,'battle/modules/53-movement-progress.js');", ""),
])

# Objective/nav tests use the one command owner instead of manually ticking three overlapping systems.
patch('tools/ai-sim-harness/objective-nav-check.js', [
    ("load(r,'battle/modules/15-force-command-progress-recovery.js');", "load(r,'battle/modules/16-squad-plan-stability.js');"),
    ("'battle/modules/15-force-command-progress-recovery.js','battle/modules/16-squad-plan-stability.js'", "'battle/modules/16-squad-plan-stability.js'"),
    ("getSystem('force-command-progress-recovery')", "getSystem('squad-command')"),
    ("getSystem('squad-plan-stability')", "getSystem('squad-command')"),
    ("getSystem('regroup-hysteresis')", "getSystem('squad-command')"),
    ("for(const id of ['force-command-progress-recovery','regroup-hysteresis','squad-plan-stability'])r.BattleModules.getSystem(id).onCommanderTick(sim,{town});",
     "r.BattleModules.getSystem('squad-command').onCommanderTick(sim,{town});"),
])

# Remove the patch modules now absorbed by the three owners, plus temporary duplicate owner filenames.
remove = [
    'battle/modules/15-force-command-progress-recovery.js',
    'battle/modules/16a-engagement-command-lock.js',
    'battle/modules/17-engagement-plan-doctrine.js',
    'battle/modules/41-regroup-hysteresis.js',
    'battle/modules/47-assault-bound-momentum.js',
    'battle/modules/49-combat-urgency.js',
    'battle/modules/53-movement-progress.js',
    'battle/modules/16-squad-command.js',
    'battle/modules/44-combat-mobility.js',
    'battle/modules/52-movement-execution.js',
    'scripts/apply_lean_module_cleanup.py',
]
for rel in remove:
    p = ROOT / rel
    if p.exists():
        p.unlink()

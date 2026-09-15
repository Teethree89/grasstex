#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'tools/ai-sim-harness/tactical-positions-check.js'
s=p.read_text()
old="  systems['engagement-plan-doctrine'].onCommanderTick(sim);"
new="  sq._engagementPlan={serial:1,status:'active',phase:'support-hold',targetObjective:'house'};"
if old not in s: raise SystemExit('obsolete doctrine fixture call not found')
p.write_text(s.replace(old,new))
Path(__file__).unlink()

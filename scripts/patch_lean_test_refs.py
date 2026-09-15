#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'tools/ai-sim-harness/objective-nav-check.js'
s=p.read_text()
s=s.replace("for(const f of ['battle/modules/16-squad-plan-stability.js','battle/modules/41-regroup-hysteresis.js'])load(r,f);","load(r,'battle/modules/16-squad-plan-stability.js');")
p.write_text(s)
Path(__file__).unlink()

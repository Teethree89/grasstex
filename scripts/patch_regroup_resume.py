#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'battle/modules/16-squad-plan-stability.js'
s=p.read_text()
old="if(st.accepted){var age=t-st.enteredAt;if((age>=REGROUP_MIN&&ca.coreSpread<=release)||age>=REGROUP_MAX){st.accepted=false;st.exits++;st.cooldownUntil=t+REENTRY;sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,t+(age>=REGROUP_MAX?REGROUP_BYPASS:REENTRY));restoreForward(sq,st.lastForward);sq.commandHoldUntil=0;return;}sq.commandPhase='regroup';sq.objective=copy(st.anchor||ca.center);sq.commandHoldUntil=Math.max(+sq.commandHoldUntil||0,t+.6);return;}"
new="if(st.accepted){var age=t-st.enteredAt;if((age>=REGROUP_MIN&&ca.coreSpread<=release)||age>=REGROUP_MAX){var timedOut=age>=REGROUP_MAX;st.accepted=false;st.exits++;st.cooldownUntil=t+REENTRY;sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,t+(timedOut?REGROUP_BYPASS:REENTRY));restoreForward(sq,st.lastForward);if(timedOut){var obj=sq.targetObjective&&root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get&&root.BattleObjectiveSystem.get(sim,sq.targetObjective),op=point(obj&&obj.def||obj);sq._regroupTimedOutSerial=sq._regroupRecovery&&sq._regroupRecovery.serial||sq._regroupTimedOutSerial;if(op){sq.objective=op;if(!st.lastForward||st.lastForward.phase==='regroup')sq.commandPhase='approach';}}sq.commandHoldUntil=0;return;}sq.commandPhase='regroup';sq.objective=copy(st.anchor||ca.center);sq.commandHoldUntil=Math.max(+sq.commandHoldUntil||0,t+.6);return;}"
if old not in s: raise SystemExit('target regroup block not found')
p.write_text(s.replace(old,new))
Path(__file__).unlink()

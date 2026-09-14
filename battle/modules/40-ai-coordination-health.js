/* Objective-assignment and replan health, exported with AI diagnostics.

   This is deliberately observational. It records whether a side has made objective progress and
   whether its squads still carry role/target intent; Force Command remains responsible for the
   eventual replan policy. Keeping the signal separate makes a stalled plan visible before we
   teach the commander to react to it automatically.
*/
(function(root){
'use strict';
if(!root.BattleModules||root.BattleAICoordinationHealth)return;

var SAMPLE_SECONDS=2,REPLAN_AFTER=12;
function now(sim){return sim&&isFinite(+sim.time)?+sim.time:0;}
function objectiveSignature(sim){
  var all=sim&&sim.objectiveControl&&sim.objectiveControl.objectives||{};
  return Object.keys(all).sort().map(function(id){var s=all[id]||{};return[id,s.owner||'neutral',s.active||'',s.phase||'',Math.round((+s.progress||0)*10)].join('|');}).join(';');
}
function sideHealth(sim,faction,lastProgress){
  var squads=sim&&sim.factions&&sim.factions[faction]&&sim.factions[faction].squads||[],roles={},targets={},phases={},assignedRole=0,assignedTarget=0,active=0;
  squads.forEach(function(sq){
    if((sq.aliveCount||0)<=0)return;active++;var role=sq.commandRole||'unassigned',target=sq.targetObjective||'unassigned',phase=sq.commandPhase||'unknown';roles[role]=(roles[role]||0)+1;targets[target]=(targets[target]||0)+1;phases[phase]=(phases[phase]||0)+1;if(role!=='unassigned')assignedRole++;if(target!=='unassigned')assignedTarget++;
  });
  var stalled=Math.max(0,now(sim)-lastProgress),assaulting=(phases.assault||0)+(phases.capture||0)+(phases['clear-town']||0)+(phases.flank||0),missingRoles=Math.max(0,active-assignedRole),missingTargets=Math.max(0,active-assignedTarget),reasons=[];
  if(missingRoles)reasons.push('missing-role');if(missingTargets)reasons.push('missing-target');if(assaulting>0&&stalled>=REPLAN_AFTER)reasons.push('objective-stalled');
  return{activeSquads:active,assignedRoles:assignedRole,assignedTargets:assignedTarget,unassignedRoles:missingRoles,unassignedTargets:missingTargets,assignmentMissing:missingRoles>0||missingTargets>0,roles:roles,targets:targets,phases:phases,objectiveStallSeconds:+stalled.toFixed(1),replanReasons:reasons,replanDue:active>0&&reasons.length>0};
}
function reset(sim){
  if(!sim)return;var t=now(sim);sim._coordinationHealth={version:'1.0',sampledAt:t,lastSample:t,lastObjectiveProgressAt:t,objectiveSignature:objectiveSignature(sim),replanAfter:REPLAN_AFTER,sides:{us:sideHealth(sim,'us',t),ge:sideHealth(sim,'ge',t)}};
}
/* Not gated on trainingMode. Force Command consumes `replanDue` from this sampler, so skipping
   it under training/benchmark runs did not disable a diagnostic - it froze one the commander
   reads at its t=0 value (every squad targetless, so permanently "replan due", and
   objectiveStallSeconds permanently 0) for the whole battle, and made the benchmark exercise
   different recovery logic from live play. */
function sample(sim){
  if(!sim||sim.winner)return;var h=sim._coordinationHealth;if(!h){reset(sim);return;}var t=now(sim);
  /* A restart rewinds sim.time, which would otherwise leave lastSample in the future and stop
     this sampler for the whole of the next battle. */
  if(t<h.lastSample){reset(sim);return;}
  if(t-h.lastSample<SAMPLE_SECONDS)return;h.lastSample=t;
  var sig=objectiveSignature(sim);if(sig!==h.objectiveSignature){h.objectiveSignature=sig;h.lastObjectiveProgressAt=t;}
  h.sampledAt=t;h.sides={us:sideHealth(sim,'us',h.lastObjectiveProgressAt),ge:sideHealth(sim,'ge',h.lastObjectiveProgressAt)};
}
root.BattleModules.registerSystem('ai-coordination-health',{version:'1.0',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:function(sim){sample(sim);}});
root.BattleAICoordinationHealth={version:'1.0',replanAfter:REPLAN_AFTER,reset:reset,sample:sample,summary:function(sim){return sim&&sim._coordinationHealth?JSON.parse(JSON.stringify(sim._coordinationHealth)):null;}};
console.log('[AI-HEALTH] objective assignment and replan health active');
})(typeof window!=='undefined'?window:globalThis);

/* Active-engagement command lock.
   Engagement plans own command intent through a firefight. The legacy commander cohesion gate runs
   before the normal plan-stability gate, so a one-tick LOS blink could still inject
   assault -> regroup -> assault churn. Keep the regroup bypass alive while an engagement plan is
   active/quiet and restore the plan if an already-running commander tick slipped a transient
   regroup through. Staged approach plans are intentionally NOT protected: they may still regroup
   before contact when the formation is genuinely dispersed. */
(function(root){
'use strict';
if(!root.BattleModules||root.BattleEngagementCommandLock)return;

var BYPASS_SECONDS=1.25;
function copyPoint(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function activePlan(sq){
  var p=sq&&sq._engagementPlan;
  return p&&(p.status==='active'||p.status==='quiet')?p:null;
}
function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
function fresh(){return{bypassRefreshes:0,regroupRestores:0,byFaction:{us:0,ge:0}};}
function stats(sim){return sim._engagementCommandLockStats||(sim._engagementCommandLockStats=fresh());}
function protect(sim){
  if(!sim||!sim.factions)return;
  ['us','ge'].forEach(function(f){
    var squads=sim.factions[f]&&sim.factions[f].squads||[];
    for(var i=0;i<squads.length;i++){
      var sq=squads[i],plan=activePlan(sq);if(!plan)continue;
      sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,(+sim.time||0)+BYPASS_SECONDS);
      stats(sim).bypassRefreshes++;
      if(sq.commandPhase!=='regroup')continue;
      sq.commandPhase=plan.phase;
      if(plan.objective)sq.objective=copyPoint(plan.objective);
      if(plan.targetObjective!=null)sq.targetObjective=plan.targetObjective;
      sq.commandHoldUntil=Math.min(+sq.commandHoldUntil||sim.time,+sim.time||0);
      stats(sim).regroupRestores++;stats(sim).byFaction[f]=(stats(sim).byFaction[f]||0)+1;
      telemetry(sim,'decision-engagement-regroup-suppressed',{
        faction:f,squad:sq.id,serial:plan.serial,phase:plan.phase,reason:'active engagement owns command intent'
      });
    }
  });
}
function publish(sim){
  var out=JSON.parse(JSON.stringify(stats(sim)));out.bypassSeconds=BYPASS_SECONDS;
  sim._engagementCommandLockSummary=out;
  if(sim._coordinationHealth)sim._coordinationHealth.engagementCommandLock=JSON.parse(JSON.stringify(out));
}
function reset(sim){sim._engagementCommandLockStats=fresh();publish(sim);}
root.BattleModules.registerSystem('engagement-command-lock',{
  version:'1.0-active-plan-outranks-regroup',
  onBattleStart:reset,
  onBattleRestart:reset,
  onSimulationStep:protect,
  onCommanderTick:function(sim){protect(sim);publish(sim);}
});
root.BattleEngagementCommandLock={version:'1.0',summary:function(sim){return sim&&sim._engagementCommandLockSummary?JSON.parse(JSON.stringify(sim._engagementCommandLockSummary)):null;}};
console.log('[COMMAND] active engagement plans now outrank transient cohesion regroup');
})(typeof window!=='undefined'?window:globalThis);

/* Engagement-scoped command plans.

   Force Command owns intent, not continuous steering. A captain should establish a plan while the
   squad approaches, execute that plan when contact begins, and leave the engagement/fireteam/
   movement layers to solve the second-by-second problem. Re-running doctrine every commander tick
   made the captain behave like an RTS player and indirectly refreshed fireteam orders during a
   firefight.

   Lifecycle:
     staged  -> plan prepared while approaching the assigned objective
     active  -> first real contact activates the prepared plan
     quiet   -> contact has dropped, but the same engagement is retained through short LOS gaps
     closed  -> after sustained quiet, or a true emergency, Force Command may plan again

   This module deliberately consumes BattleSquadStability's commander gate instead of becoming a
   new strategic writer. Existing engagement.js remains the combat-drill owner and the survival
   router remains the soldier-level execution owner. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleSquadStability||!root.SquadAI||root.BattleEngagementPlans)return;

var QUIET_CLOSE=9.0,STAGED_REVIEW=45.0,LEGACY_LEASE_PIN=3600;
var PLANNABLE={contact:1,assault:1,flank:1,capture:1,defend:1,'support-hold':1,hold:1,'clear-town':1};
var EMERGENCY={retreat:1,regroup:1};
var baseHold=root.BattleSquadStability.holdCommittedPlan;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function copy(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
function captainId(sq){var a=sq&&sq.members||[];for(var i=0;i<a.length;i++)if(!a[i].dead&&a[i].role==='captain')return a[i].id;return null;}
function aliveCount(sq){var n=0,a=sq&&sq.members||[];for(var i=0;i<a.length;i++)if(!a[i].dead)n++;return n;}
function sig(sq){var p=sq&&sq.objective||{};return[String(sq&&sq.commandPhase||''),String(sq&&sq.targetObjective||''),Math.round((+p.x||0)/5),Math.round((+p.z||0)/5)].join('|');}
function objectiveOwner(sim,id){
  if(!id||!root.BattleObjectiveSystem||!root.BattleObjectiveSystem.get)return null;
  try{var o=root.BattleObjectiveSystem.get(sim,id);if(!o)return null;var st=root.BattleObjectiveSystem.status?root.BattleObjectiveSystem.status(sim,id):o.state;return st&&st.owner||null;}catch(_){return null;}
}
function freshStats(){return{staged:0,activated:0,quietClosures:0,emergencyBreaks:0,stagedReviews:0,holds:0,reactivations:0,byFaction:{us:{staged:0,activated:0,quietClosures:0,emergencyBreaks:0},ge:{staged:0,activated:0,quietClosures:0,emergencyBreaks:0}}};}
function stats(sim){return sim._engagementPlanStats||(sim._engagementPlanStats=freshStats());}
function bump(sim,sq,k){var s=stats(sim);s[k]=(s[k]||0)+1;var f=s.byFaction&&s.byFaction[sq.faction];if(f)f[k]=(f[k]||0)+1;}

/* The plan records fireteam jobs once. They are intentionally broad tactical tasks, not exact
   coordinates: execution still belongs to engagement.js and survival-aware movement. */
function tasksFor(sq,phase){
  if(phase==='defend'||phase==='hold')return{command:'control',alpha:'hold-left',bravo:'hold-right',charlie:'local-reserve'};
  if(phase==='flank')return{command:'control',alpha:'support-by-fire',bravo:'flank',charlie:'follow-assault'};
  if(phase==='capture'||phase==='clear-town')return{command:'control',alpha:'support-by-fire',bravo:'clear/maneuver',charlie:'secure'};
  if(phase==='support-hold')return{command:'control',alpha:'support-by-fire',bravo:'support-by-fire',charlie:'security'};
  /* contact / assault */
  return{command:'control',alpha:'support-by-fire',bravo:'maneuver',charlie:'assault/reserve'};
}
function syncTasks(sq,plan){
  var tasks=plan&&plan.tasks||null,a=sq&&sq.members||[];
  for(var i=0;i<a.length;i++){
    var s=a[i],key=s._fireteamKey||(root.BattleSquadStability.teamKeyFor&&root.BattleSquadStability.teamKeyFor(s))||null;
    s._engagementTask=tasks&&key?tasks[key]||null:null;
    s._engagementPlanSerial=plan?plan.serial:null;
  }
  sq._engagementTasks=tasks?copy(tasks):null;
}
function pinLegacyLease(sim,sq){
  /* Squad Stability's old 26/38 s lease is now subordinate to the engagement plan. Pinning its
     current lease prevents serial churn from recreating fresh fireteam destinations mid-fight. */
  if(sq&&sq._stablePlan)sq._stablePlan.until=Math.max(+sq._stablePlan.until||0,(+sim.time||0)+LEGACY_LEASE_PIN);
}
function planSnapshot(plan){if(!plan)return null;return{serial:plan.serial,status:plan.status,phase:plan.phase,targetObjective:plan.targetObjective||null,objective:point(plan.objective),createdAt:plan.createdAt,activatedAt:plan.activatedAt,lastContactAt:plan.lastContactAt,quietSince:plan.quietSince,tasks:copy(plan.tasks),doctrineRule:plan.doctrineRule||null};}
function stage(sim,sq,reason){
  var phase=String(sq.commandPhase||'');if(!PLANNABLE[phase]||sq.state==='retreat'||EMERGENCY[phase])return null;
  var serial=(sq._engagementPlanSerial||0)+1;sq._engagementPlanSerial=serial;
  var plan={serial:serial,status:sq.inContact?'active':'staged',phase:phase,targetObjective:sq.targetObjective||null,objective:point(sq.objective),signature:sig(sq),createdAt:sim.time,activatedAt:sq.inContact?sim.time:null,lastContactAt:sq.inContact?sim.time:null,quietSince:null,doctrineRule:sq._lastDoctrineRule||null,commandRole:sq.commandRole||null,captainId:captainId(sq),aliveAtCreate:aliveCount(sq),tasks:tasksFor(sq,phase),reason:reason||'commander intent'};
  sq._engagementPlan=plan;syncTasks(sq,plan);pinLegacyLease(sim,sq);bump(sim,sq,'staged');
  telemetry(sim,'decision-engagement-plan-stage',{faction:sq.faction,squad:sq.id,serial:serial,phase:phase,targetObjective:plan.targetObjective,status:plan.status,rule:plan.doctrineRule,tasks:copy(plan.tasks),reason:plan.reason});
  if(plan.status==='active'){bump(sim,sq,'activated');telemetry(sim,'decision-engagement-plan-activate',{faction:sq.faction,squad:sq.id,serial:serial,phase:phase,targetObjective:plan.targetObjective,reason:'contact already active'});if(sq._boundTurn==null||sq._boundTurn<0)sq._boundTurn=0;}
  return plan;
}
function activate(sim,sq,plan,reactivated){
  if(!plan)return;
  plan.status='active';if(plan.activatedAt==null)plan.activatedAt=sim.time;plan.lastContactAt=sim.time;plan.quietSince=null;pinLegacyLease(sim,sq);syncTasks(sq,plan);
  if(reactivated)bump(sim,sq,'reactivations');else bump(sim,sq,'activated');
  telemetry(sim,'decision-engagement-plan-activate',{faction:sq.faction,squad:sq.id,serial:plan.serial,phase:plan.phase,targetObjective:plan.targetObjective,reason:reactivated?'contact resumed':'first contact'});
  /* Alpha is the prepared base of fire; make Bravo the first maneuver team when the existing
     bounding drill starts. Later bounds may rotate normally. */
  sq._boundTurn=0;
}
function clearLegacyLease(sq){sq._stablePlan=null;sq._stablePlanAwaitingCommander=true;}
function close(sim,sq,reason,emergency){
  var plan=sq&&sq._engagementPlan;if(!plan)return false;
  var snap=planSnapshot(plan);snap.closedAt=sim.time;snap.closeReason=reason||'closed';snap.duration=+(sim.time-plan.createdAt).toFixed(2);snap.contactDuration=plan.activatedAt==null?0:+(sim.time-plan.activatedAt).toFixed(2);
  sq._lastEngagementPlan=snap;sq._engagementPlan=null;sq._engagementTasks=null;syncTasks(sq,null);clearLegacyLease(sq);sq._lastDoctrineRule=null;
  if(emergency)bump(sim,sq,'emergencyBreaks');else if(reason==='contact clear')bump(sim,sq,'quietClosures');else if(reason==='staged review')stats(sim).stagedReviews++;
  telemetry(sim,'decision-engagement-plan-close',{faction:sq.faction,squad:sq.id,serial:plan.serial,phase:plan.phase,targetObjective:plan.targetObjective,reason:reason||'closed',emergency:!!emergency,duration:snap.duration,contactDuration:snap.contactDuration});
  return true;
}
function resolvedBeforeContact(sim,sq,plan){
  if(!plan||plan.status!=='staged'||!plan.targetObjective)return false;
  if(plan.phase==='defend'||plan.phase==='hold'||plan.phase==='support-hold')return false;
  return objectiveOwner(sim,plan.targetObjective)===sq.faction;
}

/* This is the command gate consumed inside commander-ai.js. A live engagement plan outranks the
   old short lease. The captain is therefore not allowed to rediscover a new doctrine every .45 s. */
root.BattleSquadStability.holdCommittedPlan=function(sim,sq){
  var plan=sq&&sq._engagementPlan;
  if(!plan)return baseHold?baseHold(sim,sq):false;
  if(!sim||sq.state==='retreat'||EMERGENCY[sq.commandPhase]){close(sim,sq,'emergency '+(sq.commandPhase||sq.state||'retreat'),true);return false;}
  if(resolvedBeforeContact(sim,sq,plan)){close(sim,sq,'objective resolved before contact',false);return false;}
  /* If another higher-priority commander constraint already changed intent, do not restore the old
     plan over it. Capture-zone and prepared-defense requests are evaluated before this gate. */
  if(plan.status==='staged'&&sig(sq)!==plan.signature){close(sim,sq,'intent superseded',true);return false;}
  pinLegacyLease(sim,sq);syncTasks(sq,plan);stats(sim).holds++;return true;
};

function tickPlan(sim,sq){
  var plan=sq&&sq._engagementPlan,phase=String(sq&&sq.commandPhase||'');
  if(plan&&(sq.state==='retreat'||EMERGENCY[phase])){close(sim,sq,'emergency '+phase,true);return;}
  if(plan&&plan.status==='staged'&&sig(sq)!==plan.signature){close(sim,sq,'intent superseded',true);plan=null;}
  if(plan&&resolvedBeforeContact(sim,sq,plan)){close(sim,sq,'objective resolved before contact',false);return;}

  if(plan){
    if(sq.inContact){
      if(plan.status!=='active')activate(sim,sq,plan,plan.activatedAt!=null);
      else{plan.lastContactAt=sim.time;plan.quietSince=null;pinLegacyLease(sim,sq);syncTasks(sq,plan);}
      return;
    }
    if(plan.status==='active'||plan.status==='quiet'){
      if(plan.quietSince==null)plan.quietSince=sim.time;
      plan.status='quiet';pinLegacyLease(sim,sq);syncTasks(sq,plan);
      if(sim.time-plan.quietSince>=QUIET_CLOSE)close(sim,sq,'contact clear',false);
      return;
    }
    if(plan.status==='staged'){
      pinLegacyLease(sim,sq);syncTasks(sq,plan);
      if(sim.time-plan.createdAt>=STAGED_REVIEW)close(sim,sq,'staged review',false);
      return;
    }
  }

  /* Force Command has just had a free evaluation pass. Freeze the resulting tactical intent for
     the approach/engagement instead of letting the next .45 s tick reconsider it again. */
  if(PLANNABLE[phase]&&sq.state!=='retreat'&&!EMERGENCY[phase])stage(sim,sq,'post-command evaluation');
}
function publish(sim){
  var out=copy(stats(sim));out.quietCloseSeconds=QUIET_CLOSE;out.stagedReviewSeconds=STAGED_REVIEW;
  out.live={us:[],ge:[]};['us','ge'].forEach(function(f){var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)if(squads[i]._engagementPlan)out.live[f].push({squad:squads[i].id,plan:planSnapshot(squads[i]._engagementPlan)});});
  sim._engagementPlanSummary=out;if(sim._coordinationHealth)sim._coordinationHealth.engagementPlans=copy(out);
}
function reset(sim){
  sim._engagementPlanStats=freshStats();['us','ge'].forEach(function(f){var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){var sq=squads[i];sq._engagementPlan=null;sq._lastEngagementPlan=null;sq._engagementPlanSerial=0;sq._engagementTasks=null;syncTasks(sq,null);}});publish(sim);
}

root.BattleModules.registerSystem('engagement-plan-doctrine',{
  version:'1.0-engagement-scoped-command',
  onBattleStart:reset,
  onBattleRestart:reset,
  onCommanderTick:function(sim){['us','ge'].forEach(function(f){var squads=sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)tickPlan(sim,squads[i]);});publish(sim);}
});
root.BattleEngagementPlans={version:'1.0',quietCloseSeconds:QUIET_CLOSE,stagedReviewSeconds:STAGED_REVIEW,current:function(sq){return planSnapshot(sq&&sq._engagementPlan);},summary:function(sim){return sim&&sim._engagementPlanSummary?copy(sim._engagementPlanSummary):null;}};
console.log('[COMMAND] engagement-scoped plans active: stage -> contact execute -> quiet close -> replan');
})(typeof window!=='undefined'?window:globalThis);

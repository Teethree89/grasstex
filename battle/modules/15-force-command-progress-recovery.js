/* Force Command progress recovery.
   Keeps urban route progression from stalling just outside a waypoint, bounds regroup episodes,
   and gives targetless squads a real objective when coordination health says the attack has
   stopped making objective progress.  This module runs after the core commander decision and
   before Squad Stability commits the resulting tactical lease. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleCommanderAI||root.BattleForceProgressRecovery)return;

  var SYSTEM='force-command-progress-recovery';
  var REGROUP_MAX_SECONDS=18;
  var REGROUP_BYPASS_SECONDS=14;
  var URBAN_ARRIVAL_COHESION=.50;
  var RECOVERY_COOLDOWN=8;

  function dist(a,b){return a&&b?Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0)):Infinity;}
  function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function alive(sq){return(sq&&sq.members||[]).filter(function(s){return s&&!s.dead&&s.root;});}
  function average(sq){var m=alive(sq),x=0,z=0;if(!m.length)return null;for(var i=0;i<m.length;i++){x+=+m[i].root.position.x||0;z+=+m[i].root.position.z||0;}return{x:x/m.length,z:z/m.length};}
  function captainAlive(sq){var m=alive(sq);for(var i=0;i<m.length;i++)if(m[i].role==='captain')return true;return false;}
  function phase(sim,sq,next,why){
    if(!sq||sq.commandPhase===next)return;
    sq.commandPhase=next;
    telemetry(sim,'decision-phase',{faction:sq.faction,squad:sq.id,phase:next,why:why||''});
  }
  function asForce(reason,fn){
    var p=root.BattleOrderProvenanceFastPath||root.BattleOrderProvenance;
    if(p&&typeof p.withOwner==='function')return p.withOwner('force-command',reason,fn,'system:commander');
    return fn();
  }
  function policy(sim,sq){try{return root.BattleCommanderAI.policyFor(sim,sq.faction)||{};}catch(_){return{};}}
  function replanDue(sim,faction){var h=sim&&sim._coordinationHealth,s=h&&h.sides&&h.sides[faction];return!!(s&&s.replanDue);}
  function inTown(town,p){return!!(town&&town.center&&p&&dist(p,town.center)<(+town.radius||250));}
  function objectiveStatus(sim,obj){
    try{if(root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status)return root.BattleObjectiveSystem.status(sim,obj.id)||{};}catch(_){}
    return obj&&obj.state||{};
  }
  function objectivePoint(obj){var d=obj&&obj.def||obj;return point(d);}

  /* Prefer the commander's normal objective scorer.  If doctrine deliberately returns an owned
     defensive objective while we are recovering a stalled ATTACK, fall back to the nearest
     non-owned objective, preferring one with nobody currently inside it. */
  function chooseOpenObjective(sim,sq,pos){
    var chosen=null;
    try{chosen=root.BattleCommanderAI.chooseObjective(sim,sq,false);}catch(_){}
    if(chosen&&chosen.instance){var st=objectiveStatus(sim,chosen.instance);if(st.owner!==sq.faction)return chosen;}
    var list=sim&&sim._objectives||[],best=null,bestScore=Infinity;
    for(var i=0;i<list.length;i++){
      var obj=list[i],status=objectiveStatus(sim,obj),p=objectivePoint(obj);if(!p||status.owner===sq.faction)continue;
      var occupied=status.active!=null&&status.active!=='';
      var score=dist(pos,p)+(occupied?80:0)+(status.owner==null||status.owner==='neutral'?-12:0);
      if(score<bestScore){bestScore=score;best={instance:obj,point:p};}
    }
    return best;
  }
  function recordObjectiveRecovery(sim,sq,chosen,reason,now){
    var log=sim._objectiveRecovery||(sim._objectiveRecovery={us:{count:0,last:null},ge:{count:0,last:null}}),side=log[sq.faction]||(log[sq.faction]={count:0,last:null});
    var event={faction:sq.faction,squad:sq.id,objectiveId:String(chosen.instance.id),reason:reason,at:+now.toFixed(2)};
    side.count++;side.last=event;sq._objectiveRecovery=event;sq._forceRecoveryAt=now;
    telemetry(sim,'decision-objective-recovery',event);
  }

  function urbanRouteAdvance(sim,sq,town,pos,cfg){
    var route=sq.route||[],idx=Math.max(0,Math.min(route.length-1,+sq.routeIndex||0));
    if(sq.targetObjective||route.length<2||idx>=route.length-1)return false;
    var wp=point(route[idx]);if(!wp||!inTown(town,wp))return false;
    var cohesion=captainAlive(sq)?(+cfg.cohesionRadius||34):(+cfg.captainlessCohesion||26);
    var arrival=Math.max(+cfg.routeArrivalRadius||8,cohesion*URBAN_ARRIVAL_COHESION);
    var d=dist(pos,wp);if(d>arrival)return false;
    var old=idx,next=idx+1;sq.routeIndex=next;sq.commandHoldUntil=0;sq.objective=point(route[next]);
    telemetry(sim,'decision-route',{faction:sq.faction,squad:sq.id,from:old,to:next,x:sq.objective&&sq.objective.x,z:sq.objective&&sq.objective.z,recovery:true,arrivalRadius:+arrival.toFixed(2),distance:+d.toFixed(2)});
    return true;
  }

  function boundRegroup(sim,sq,now){
    var r=sq&&sq._regroupRecovery;
    if(!r||sq.commandPhase!=='regroup'||!isFinite(+r.startedAt))return false;
    var age=now-(+r.startedAt||0),bypass=+sq._regroupBypassUntil||0;
    if(age<REGROUP_MAX_SECONDS&&now>=bypass)return false;
    if(age>=REGROUP_MAX_SECONDS&&sq._regroupTimedOutSerial!==r.serial){
      sq._regroupTimedOutSerial=r.serial;sq._regroupBypassUntil=now+REGROUP_BYPASS_SECONDS;sq.commandHoldUntil=0;
      telemetry(sim,'decision-regroup-timeout',{faction:sq.faction,squad:sq.id,serial:r.serial,elapsed:+age.toFixed(2),spreadBypassSeconds:REGROUP_BYPASS_SECONDS});
    }
    if(now<(+sq._regroupBypassUntil||0)){
      /* Core Force Command has already evaluated this tick.  During the bounded bypass, replace
         only its repeated regroup intent; Engagement still decides whether each man can move. */
      sq.commandHoldUntil=0;
      sq.commandPhase='approach';
      return true;
    }
    return false;
  }

  function recoverObjective(sim,sq,town,pos,cfg,now,routeAdvanced,regroupBypass){
    if(!sq||sq.state==='retreat'||sq.targetObjective||sq.commandRole==='garrison'||sq.commandRole==='reserve')return false;
    if(now-(+sq._forceRecoveryAt||-Infinity)<RECOVERY_COOLDOWN)return false;
    var route=sq.route||[],idx=Math.max(0,Math.min(route.length-1,+sq.routeIndex||0)),atEnd=!!(route.length&&idx>=route.length-1);
    var stalled=replanDue(sim,sq.faction),urban=inTown(town,pos),phaseCandidate=sq.commandPhase==='clear-town'||sq.commandPhase==='contact'||sq.commandPhase==='approach'||regroupBypass;
    /* A current firefight is not a reason to have no strategic objective. Engagement owns the
       fight; Force Command may still say which open objective the squad should seize afterward. */
    if(!atEnd&&!stalled&&!routeAdvanced&&!phaseCandidate)return false;
    /* Mid-route recovery is intentionally an urban behavior.  A squad still out on the
       approach axis should resume its route rather than cutting cross-country to an objective. */
    if(!urban&&!atEnd)return false;
    var chosen=chooseOpenObjective(sim,sq,pos);if(!chosen||!chosen.instance||!chosen.point)return false;
    var radius=+chosen.instance.def.radius||30,d=dist(pos,chosen.point),why=stalled?'stalled targetless advance':(atEnd?'route-end targetless':'open objective recovery');
    sq.targetObjective=String(chosen.instance.id);sq.objective={x:chosen.point.x,z:chosen.point.z};sq.commandHoldUntil=0;
    phase(sim,sq,d<=radius*(+cfg.captureCommitRatio||.82)?'capture':'assault',why+' '+chosen.instance.id);
    recordObjectiveRecovery(sim,sq,chosen,why,now);return true;
  }

  function tick(sim,payload){
    if(!sim)return;var town=payload&&payload.town||null,now=+sim.time||0;
    ['us','ge'].forEach(function(f){
      var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];
      for(var i=0;i<squads.length;i++)(function(sq){
        if(!sq||sq.state==='retreat'||sq.commandRole==='garrison')return;
        asForce('progress recovery '+sq.id,function(){
          var cfg=policy(sim,sq),pos=average(sq);if(!pos)return;
          var bypass=boundRegroup(sim,sq,now);
          var advanced=urbanRouteAdvance(sim,sq,town,pos,cfg);
          if(advanced&&sq.commandPhase==='regroup')sq.commandPhase='approach';
          var recovered=recoverObjective(sim,sq,town,pos,cfg,now,advanced,bypass);
          if(bypass&&!advanced&&!recovered){
            /* Core Command's cohesion gate set the objective to the squad centroid before this
               hook ran. During the timeout bypass resume the assigned objective, falling back
               to its approach waypoint only when there is no objective mission yet. */
            var obj=sq.targetObjective&&root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(sim,sq.targetObjective);
            var route=sq.route||[],idx=Math.max(0,Math.min(route.length-1,+sq.routeIndex||0)),wp=obj?objectivePoint(obj):(route.length?point(route[idx]):null);
            if(wp){sq.objective=wp;sq.commandHoldUntil=0;}
          }
        });
      })(squads[i]);
    });
  }
  function reset(sim){
    ['us','ge'].forEach(function(f){var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){squads[i]._regroupBypassUntil=0;squads[i]._regroupTimedOutSerial=null;squads[i]._forceRecoveryAt=null;}});
  }

  root.BattleModules.registerSystem(SYSTEM,{
    version:'65-progress-recovery',
    onBattleStart:reset,beforeBattleRestart:reset,onCommanderTick:tick
  });
  root.BattleForceProgressRecovery={version:'65-progress-recovery',regroupMaxSeconds:REGROUP_MAX_SECONDS,regroupBypassSeconds:REGROUP_BYPASS_SECONDS,urbanArrivalCohesion:URBAN_ARRIVAL_COHESION};
  if(typeof console!=='undefined')console.log('[COMMAND] bounded regroup + urban waypoint + open-objective recovery active');
})(typeof window!=='undefined'?window:globalThis);

/* Hierarchical tactical coordinator for the Battle Sim / ww2fps AI lab.

   What is left in this file after the split is the part that is genuinely stateful: the per-squad
   phase machine, the commander tick, victory conditions and the simulation lifecycle wiring.

     commander-doctrine.js  what is worth doing, with what force  (genome, objective scores)
     commander-routes.js    who goes where                        (roles, approach routes)
     commander-ai.js        when intent changes                   (phases, ticks, victory)
     engagement.js          how a soldier fights                  (contact drills)

   The commander supplies intent only - route, phase and objective. It never writes a soldier's
   destination or stance, so it cannot pull a squad backwards out of a firefight. */
(function(root){
  'use strict';
  /* The build id belongs to the page, not to a runtime: stamping one here overwrote it. */
  console.log('[COMMAND] Genome v2 commander loaded');
  if(!root.BattleSim||!root.SquadAI||!root.BattleCommanderDoctrine||!root.BattleCommanderRoutes){
    console.warn('[COMMAND] doctrine/route modules missing; hierarchical AI disabled');return;
  }

  var D=root.BattleCommanderDoctrine,R=root.BattleCommanderRoutes;
  var oldStart=root.BattleSim.start,oldUpdateSquad=root.SquadAI.updateSquad;
  var COMMAND_TICK=.45,OBJECTIVE_HOLD_WIN=35;

  var dist=D.dist,avgPos=D.avgPos,maxSpread=D.maxSpread,captain=D.captain,enemyFaction=D.enemyFaction;
  var policy=D.policyFor,doctrine=D.doctrineFor,genome=D.genomeFor;

  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function setPhase(sim,sq,next,why){if(sq.commandPhase===next)return;sq.commandPhase=next;telemetry(sim,'decision-phase',{faction:sq.faction,squad:sq.id,phase:next,why:why||''});}
  function declare(sim,winner,reason){if(sim.winner)return;sim.winner=winner;sim.winReason=reason;telemetry(sim,'objective-victory',{winner:winner,reason:reason});console.log('[COMMAND] objective victory '+winner+' reason='+reason);if(sim.onWinner)sim.onWinner(winner,sim);}

  /* Capture Zone publishes this as a tactical constraint. Force Command is deliberately the only
     writer of strategic squad fields, so a post-capture secure window cannot race a regroup or
     route decision in the same command tick. */
  function acceptObjectiveDefenseRequest(sim,sq){
    var request=sq&&sq._captureZoneDefenseRequest;
    if(!request||!request.objectiveId||!request.point||sq.state==='retreat')return false;
    setPhase(sim,sq,'defend','objective security '+request.objectiveId);
    sq.targetObjective=request.objectiveId;
    sq.objective={x:+request.point.x||0,z:+request.point.z||0};
    return true;
  }
  /* Prepared Defense uses the same constraint boundary as Capture Zone. The request is persistent
     by design, but it does not own movement or write the squad's strategic compatibility fields. */
  function acceptPreparedDefenseRequest(sim,sq){
    var request=sq&&sq._preparedDefenseRequest;
    if(!request||!request.objectiveId||!request.point||sq.state==='retreat')return false;
    sq.commandRole='garrison';
    setPhase(sim,sq,'defend','prepared defense '+request.objectiveId);
    sq.targetObjective=request.objectiveId;
    sq.objective={x:+request.point.x||0,z:+request.point.z||0};
    return true;
  }

  /* Coordination Health is intentionally observational, but Force Command consumes its signal at
     the intent boundary. A squad that has exhausted its route and is still targetless must not
     remain in the broad `clear-town` fallback forever: select a real capture objective and let
     the normal squad/engagement/movement layers execute it. This also recovers a targetless
     regroup stranded off-route once side health shows an assignment gap or stalled progress. */
  function replanDue(sim,faction){
    var health=sim&&sim._coordinationHealth,side=health&&health.sides&&health.sides[faction];
    return !!(side&&side.replanDue);
  }
  function recordObjectiveRecovery(sim,sq,chosen,reason,now){
    var log=sim._objectiveRecovery||(sim._objectiveRecovery={us:{count:0,last:null},ge:{count:0,last:null}}),side=log[sq.faction]||(log[sq.faction]={count:0,last:null});
    var event={faction:sq.faction,squad:sq.id,objectiveId:chosen.instance.id,reason:reason,at:+now.toFixed(2)};
    side.count++;side.last=event;sq._objectiveRecovery=event;
    telemetry(sim,'decision-objective-recovery',event);
  }
  function recoverTargetlessObjective(sim,sq,town,enemy,p,cfg,now){
    if(!sq||sq.state==='retreat'||sq.inContact||sq.targetObjective||sq.commandRole==='garrison')return false;
    var route=sq.route||[],atRouteEnd=route.length&&sq.routeIndex>=route.length-1;
    if(!atRouteEnd)return false;
    var inTown=town&&town.center&&dist(p.x,p.z,town.center.x,town.center.z)<(town.radius||250),stalled=replanDue(sim,sq.faction);
    if(!inTown&&!stalled)return false;
    var chosen=D.chooseObjective(sim,sq,false)||D.chooseObjective(sim,sq,true);
    if(!chosen)return false;
    sq.targetObjective=chosen.instance.id;sq.objective={x:chosen.point.x,z:chosen.point.z};
    var radius=+chosen.instance.def.radius||30,objectiveDistance=dist(p.x,p.z,chosen.point.x,chosen.point.z),reason=inTown?'terminal clear-town':'stalled targetless route';
    setPhase(sim,sq,objectiveDistance<=radius*cfg.captureCommitRatio?'capture':'assault',reason+' '+chosen.instance.id);
    recordObjectiveRecovery(sim,sq,chosen,reason,now);
    return true;
  }

  /* One squad's intent for this tick. Order of business: cohesion, role gates, committed holds,
     route progress, then - once the route is spent - doctrine on a chosen objective. */
  function advanceRoute(sim,sq,town){
    if(!sq.route||!sq.route.length)return;
    var cfg=policy(sim,sq.faction),doc=doctrine(sim,sq.faction),p=avgPos(sq),spread=maxSpread(sq,p);
    var enemy=D.nearestEnemyToSquad(sim,sq),cap=captain(sq),now=sim.time,cohesionLimit=cap?cfg.cohesionRadius:cfg.captainlessCohesion;

    if(acceptPreparedDefenseRequest(sim,sq)||acceptObjectiveDefenseRequest(sim,sq))return;

    /* A squad already trading fire is not "spread out", it is deployed. Regrouping under fire used
       to drag men out of cover and back into the open. */
    if(spread>cohesionLimit&&!sq.inContact&&now>=(+sq._regroupBypassUntil||0)){setPhase(sim,sq,'regroup','spread '+spread.toFixed(1));sq.commandHoldUntil=Math.max(sq.commandHoldUntil,now+cfg.regroupHold);sq.objective={x:p.x,z:p.z};return;}

    /* This is deliberately after the cohesion gate: a genuinely scattered squad first reforms,
       then Force Command gives it its recovered capture intent. */
    if(recoverTargetlessObjective(sim,sq,town,enemy,p,cfg,now))return;

    /* Squad Stability owns an accepted tactical plan during its bounded commitment window. Check
       before issuing new intent so Force Command does not create a visible write/restore loop. */
    if(root.BattleSquadStability&&root.BattleSquadStability.holdCommittedPlan&&root.BattleSquadStability.holdCommittedPlan(sim,sq))return;

    /* Once Force Command has selected an objective, the approach route is spent for this
       assignment (including urban recovery before its last waypoint). Never retain a target ID
       while replacing its point with the old town-centre waypoint. Keep an unowned target until
       captured; saturation balances NEW assignments, not every tick of an ongoing assault. */
    var assigned=sq.targetObjective&&root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(sim,sq.targetObjective);
    if(assigned){
      var assignedStatus=D.objectiveStatus(sim,assigned)||{},chosen;
      if(assignedStatus.owner===sq.faction)chosen=D.chooseObjective(sim,sq,false)||D.chooseObjective(sim,sq,true);
      else chosen={instance:assigned,point:D.objectivePoint(assigned,sim,sq),status:assignedStatus};
      if(chosen&&applyDoctrine(sim,sq,town,chosen,enemy,p,cfg,now))return;
    }

    if(sq.commandRole==='reserve'){
      var counts=sim.objectiveControl&&sim.objectiveControl.counts||{},own=counts[sq.faction]||0,enemyCount=counts[enemyFaction(sq.faction)]||0;
      var release=now>45*(1-doc.riskTolerance)||enemyCount>own||enemy.distance<cfg.contactDistance*1.5;
      if(!release){setPhase(sim,sq,'reserve','holding reserve');sq.objective=sq.route[sq.route.length-1];return;}
      sq.commandRole='center';sq.routeIndex=Math.max(0,sq.route.length-1);setPhase(sim,sq,'approach','reserve committed');
      telemetry(sim,'decision-reserve-commit',{faction:sq.faction,squad:sq.id,time:+now.toFixed(1),objectives:counts});
    }
    if(sq.commandRole==='support'){
      var squads=sim.factions[sq.faction].squads,assaultCommitted=false;
      for(var a=0;a<squads.length;a++)if(squads[a]!==sq&&(squads[a].routeIndex>=2||squads[a].state==='engaged'))assaultCommitted=true;
      if(!assaultCommitted&&now<cfg.supportDelay&&sq.routeIndex>=1){setPhase(sim,sq,'support-hold','waiting for assault');sq.objective=sq.route[Math.min(1,sq.route.length-1)];return;}
    }
    if(now<sq.commandHoldUntil){sq.objective=sq.route[Math.min(sq.routeIndex,sq.route.length-1)];return;}

    var wp=sq.route[Math.min(sq.routeIndex,sq.route.length-1)],d=dist(p.x,p.z,wp.x,wp.z);
    if(d<cfg.routeArrivalRadius&&sq.routeIndex<sq.route.length-1){
      var oldIndex=sq.routeIndex,inTown=town&&town.center?dist(wp.x,wp.z,town.center.x,town.center.z)<(town.radius||250):false;
      if(inTown){sq.commandHoldUntil=now+cfg.cornerHold+(cap?0:cfg.cornerNoCaptainExtra);setPhase(sim,sq,'corner-check','route '+oldIndex);}
      sq.routeIndex++;wp=sq.route[sq.routeIndex];d=dist(p.x,p.z,wp.x,wp.z);
      telemetry(sim,'decision-route',{faction:sq.faction,squad:sq.id,from:oldIndex,to:sq.routeIndex,x:wp.x,z:wp.z});
    }

    if(sq.routeIndex>=sq.route.length-1&&d<Math.max(cfg.finalRouteRadius,32)){
      var chosen=D.chooseObjective(sim,sq,false)||D.chooseObjective(sim,sq,true);
      if(chosen&&applyDoctrine(sim,sq,town,chosen,enemy,p,cfg,now))return;
    }
    if(enemy.distance<cfg.contactDistance&&sq.commandRole!=='support')setPhase(sim,sq,'contact','enemy '+enemy.distance.toFixed(1)+'m');
    else if(town&&town.center&&dist(p.x,p.z,town.center.x,town.center.z)<(town.radius||250))setPhase(sim,sq,'clear-town','inside objective area');
    else setPhase(sim,sq,'approach','route advance');
    sq.objective={x:wp.x,z:wp.z};
  }

  /* Evaluates the genome's constrained rules against the chosen objective and turns the winning
     action into a phase + objective point. Returns true when it set the squad's intent. */
  function applyDoctrine(sim,sq,town,chosen,enemy,p,cfg,now){
    var context=D.buildContext(sim,sq,chosen,enemy,p);
    var rule=root.BattleAIPolicy?root.BattleAIPolicy.decide(genome(sim,sq.faction),context):null,action=rule&&rule.action||'assault';
    if(rule&&sq._lastDoctrineRule!==rule.id){
      sq._lastDoctrineRule=rule.id;
      telemetry(sim,'decision-doctrine',{faction:sq.faction,squad:sq.id,rule:rule.id,action:action,conditions:rule.when,objective:chosen.instance.id,localRatio:+context.localRatio.toFixed(2)});
    }
    var why='genome rule '+(rule&&rule.id||'');
    if(action==='regroup'){setPhase(sim,sq,'regroup',why);sq.objective={x:p.x,z:p.z};sq.commandHoldUntil=now+cfg.regroupHold;return true;}
    if(action==='hold'){setPhase(sim,sq,'hold',why);sq.objective={x:sq.rally.x,z:sq.rally.z};return true;}
    if(action==='support'){setPhase(sim,sq,'support-hold',why);sq.objective={x:p.x,z:p.z};return true;}
    if(action==='flank'){sq.objective=D.flankPoint(sq,chosen,town);sq.targetObjective=chosen.instance.id;setPhase(sim,sq,'flank',why);return true;}
    if(action==='defend'){var defend=D.chooseObjective(sim,sq,true);if(defend)chosen=defend;setPhase(sim,sq,'defend',why);}
    sq.objective={x:chosen.point.x,z:chosen.point.z};sq.targetObjective=chosen.instance.id;
    var radius=+chosen.instance.def.radius||30,objD=dist(p.x,p.z,chosen.point.x,chosen.point.z);
    if(objD<=radius*cfg.captureCommitRatio)setPhase(sim,sq,action==='defend'?'defend':'capture','objective '+chosen.instance.id);
    else setPhase(sim,sq,'assault','move to '+chosen.instance.id);
    return true;
  }

  function updateCommander(sim,town,dt){
    dt=dt||COMMAND_TICK;R.ensureAssignments(sim,town);
    if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.tick(sim,dt);
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)advanceRoute(sim,squads[i],town);});
    if(root.BattleModules)root.BattleModules.runHook('onCommanderTick',sim,{town:town,dt:dt});
    var snapshotSeconds=policy(sim,'us').decisionSnapshotSeconds||5;
    if(!sim._nextDecisionSnapshot||sim.time>=sim._nextDecisionSnapshot){
      sim._nextDecisionSnapshot=sim.time+snapshotSeconds;
      var counts=sim.objectiveControl&&sim.objectiveControl.counts||{};
      telemetry(sim,'decision-snapshot',{scenarioId:town&&town.id||null,seed:town&&town.seed||null,usAlive:D.forceUnits(sim,'us').length,geAlive:D.forceUnits(sim,'ge').length,usObjectives:counts.us||0,geObjectives:counts.ge||0,
        squads:{us:sim.factions.us.squads.map(function(q){return q.commandPhase;}),ge:sim.factions.ge.squads.map(function(q){return q.commandPhase;})},
        contact:{us:sim.factions.us.squads.filter(function(q){return q.inContact;}).length,ge:sim.factions.ge.squads.filter(function(q){return q.inContact;}).length}});
    }
    if(sim.objectiveHold&&sim.objectiveHold.us>=OBJECTIVE_HOLD_WIN)declare(sim,'us','held all objectives');
    else if(sim.objectiveHold&&sim.objectiveHold.ge>=OBJECTIVE_HOLD_WIN)declare(sim,'ge','held all objectives');
  }

  /* The squad layer owns personal slots and destination commitment.  Commander AI now
     supplies only intent (route, phase and objective), so it cannot pull everybody
     backwards through one shared rally point after the squad layer has issued orders. */
  root.SquadAI.updateSquad=function(sq,battle){
    var commanded=sq.route&&sq.route.length,objective=commanded&&sq.objective?{x:sq.objective.x,z:sq.objective.z}:null;
    oldUpdateSquad(sq,battle);
    if(commanded&&objective)sq.objective=objective;
  };

  function installVictory(sim){
    var stockCheck=sim._checkWinner.bind(sim);
    sim._checkWinner=function(){
      if(this.winner)return;
      var usUnits=D.forceUnits(this,'us'),geUnits=D.forceUnits(this,'ge');
      if(usUnits.length<=0||geUnits.length<=0){this.winner=usUnits.length===geUnits.length?'draw':(usUnits.length>geUnits.length?'us':'ge');if(this.onWinner)this.onWinner(this.winner,this);return;}
      if(this.time>=this.timeLimit){
        var u=D.objectiveValueScore(this,'us')*12+D.forceScore(this,'us'),g=D.objectiveValueScore(this,'ge')*12+D.forceScore(this,'ge');
        declare(this,u===g?'draw':(u>g?'us':'ge'),'time limit objective score');return;
      }
      if(this.time<this.timeLimit&&this.factions.us.alive<=0&&this.factions.ge.alive<=0)stockCheck();
    };
  }

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),town=scene.metadata&&scene.metadata.battleScenario||scene.metadata&&scene.metadata.battleTown;
    if(!town){console.warn('[COMMAND] no scenario metadata; hierarchical infantry AI disabled');return sim;}
    if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.attach(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});
    R.initForce(sim,'us',town);R.initForce(sim,'ge',town);
    sim.objectives=sim._objectives||[];sim._commandAccum=0;sim._nextDecisionSnapshot=0;sim._objectiveRecovery={us:{count:0,last:null},ge:{count:0,last:null}};
    var adapted={};
    if(root.BattleAIPolicy){['us','ge'].forEach(function(f){adapted[f]=root.BattleAIPolicy.adaptedForScenario(town);});telemetry(sim,'decision-scenario-recall',{scenarioId:town.id,seed:town.seed,sources:adapted.us.sources,fingerprint:town.fingerprint});}
    if(root.BattleModules)root.BattleModules.runHook('onBattleStart',sim,{town:town});
    installVictory(sim);

    var stockRestart=sim.restart.bind(sim);
    sim.restart=function(){
      stockRestart();
      town=scene.metadata&&scene.metadata.battleScenario||scene.metadata&&scene.metadata.battleTown||town;
      if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.reset(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});
      R.initForce(sim,'us',town);R.initForce(sim,'ge',town);
      sim._commandAccum=0;sim._nextDecisionSnapshot=0;sim._objectiveRecovery={us:{count:0,last:null},ge:{count:0,last:null}};
      if(root.BattleModules)root.BattleModules.runHook('onBattleRestart',sim,{town:town});
    };
    scene.onBeforeRenderObservable.add(function(){
      if(sim.paused||sim.winner||sim._trainerStepActive)return;
      var dt=Math.min(.25,Math.max(0,scene.getEngine().getDeltaTime()/1000*sim.timeScale));
      sim._commandAccum+=dt;
      while(sim._commandAccum>=COMMAND_TICK&&!sim.winner){sim._commandAccum-=COMMAND_TICK;updateCommander(sim,town,COMMAND_TICK);}
    });
    console.log('[COMMAND] Genome v2 doctrine + modular objectives active · build '+(root.BATTLE_BUILD||'dev'));return sim;
  };

  root.BattleCommanderAI={
    update:updateCommander,advanceRoute:advanceRoute,
    assignSquad:R.assignSquad,ensureAssignments:R.ensureAssignments,
    acceptObjectiveDefenseRequest:acceptObjectiveDefenseRequest,
    acceptPreparedDefenseRequest:acceptPreparedDefenseRequest,
    recoverTargetlessObjective:recoverTargetlessObjective,
    commandTick:COMMAND_TICK,objectiveHoldWin:OBJECTIVE_HOLD_WIN,
    policyFor:policy,genomeFor:genome,doctrineFor:doctrine,
    chooseObjective:D.chooseObjective,buildContext:D.buildContext
  };
})(typeof window!=='undefined'?window:globalThis);

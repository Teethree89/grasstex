/* Hierarchical tactical coordinator for the Battle Sim / ww2fps AI lab.

   M3C Macro / General. This file owns one thing per squad: the mission brief (`_macroMission`),
   plus the commander tick, victory conditions and lifecycle wiring.

     commander-doctrine.js  what is worth doing, with what force  (genome, objective scores)
     commander-routes.js    who goes where                        (roles, approach routes)
     commander-ai.js        which mission each squad holds        (event-driven wakes, victory)
     modules/16-squad-...   how the Captain executes that mission (legs, phase, rally)
     engagement.js          how a soldier fights                  (contact drills)

   The General is event-driven: it issues a brief, then sleeps until the mission completes, becomes
   invalid, a reserve is due, a strategic stall occurs or the Captain escalates. It never writes a
   phase, route leg, squad objective point or soldier destination. */
(function(root){
  'use strict';
  /* The build id belongs to the page, not to a runtime: stamping one here overwrote it. */
  console.log('[COMMAND] Genome v2 commander loaded');
  if(!root.BattleSim||!root.SquadAI||!root.BattleCommanderDoctrine||!root.BattleCommanderRoutes){
    console.warn('[COMMAND] doctrine/route modules missing; hierarchical AI disabled');return;
  }

  var D=root.BattleCommanderDoctrine,R=root.BattleCommanderRoutes;
  var oldStart=root.BattleSim.start;
  var COMMAND_TICK=.45,OBJECTIVE_HOLD_WIN=35,STRATEGIC_STALL_REPLAN=120;

  var enemyFaction=D.enemyFaction;
  var policy=D.policyFor,doctrine=D.doctrineFor,genome=D.genomeFor;

  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function declare(sim,winner,reason){if(sim.winner)return;sim.winner=winner;sim.winReason=reason;telemetry(sim,'objective-victory',{winner:winner,reason:reason});console.log('[COMMAND] objective victory '+winner+' reason='+reason);if(sim.onWinner)sim.onWinner(winner,sim);}
  function macroEnabled(sim){return !sim||sim.macroCommandEnabled!==false;}
  function setMacroEnabled(sim,enabled){
    if(!sim)return false;
    var next=enabled!==false,prev=macroEnabled(sim);
    sim.macroCommandEnabled=next;
    if(prev!==next)telemetry(sim,'decision-macro-command',{enabled:next,time:+(+sim.time||0).toFixed(2)});
    return next;
  }

  /* General owns this brief; Captain owns its execution. Compatibility fields are projections:
     targetObjective / commandRole belong to General, objective / phase / routeIndex to Captain.
     No periodic doctrine evaluation, local pause or route waypoint is a new mission. */
  function point(p){return p?{x:+p.x||0,z:+p.z||0}:null;}
  function missionState(sim){return sim._macroMissionState||(sim._macroMissionState={mode:'event-driven',wakeCount:0,strategicWrites:0,decisionsUnchanged:0,wakeReasons:{},lastWake:null,recentWakes:[],stallByFaction:{us:null,ge:null}});}
  function catalogKey(sim){return(sim._objectives||[]).map(function(o){return String(o.id);}).sort().join('|');}
  function defenseRequest(sim,sq){
    var r=sq._preparedDefenseRequest,source='prepared-defense';
    if(!r){r=sq._captureZoneDefenseRequest;source='objective-security';}
    if(!r||!r.objectiveId||!r.point||!root.BattleObjectiveSystem||!root.BattleObjectiveSystem.get(sim,r.objectiveId))return null;
    return{request:r,source:source,key:[source,r.objectiveId,+r.point.x||0,+r.point.z||0].join('|')};
  }
  function missionObservation(sim,sq,m){
    var obj=m.objectiveId&&root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(sim,m.objectiveId),st=obj&&D.objectiveStatus(sim,obj)||{};
    return{version:m.version,owner:st.owner||'neutral',vacant:!!st.vacantOwner,catalog:catalogKey(sim)};
  }
  function finishMission(sim,sq,status,reason){
    var m=sq._macroMission;if(!m||m.status==='completed'||m.status==='invalid'||m.status==='failed'||m.status==='superseded')return;
    m.status=status;m.endedAt=+sim.time||0;m.endReason=reason;sq._lastMacroMission=m;
    telemetry(sim,'decision-mission-end',{faction:sq.faction,squad:sq.id,version:m.version,status:status,reason:reason,objectiveId:m.objectiveId});
  }
  function briefKey(spec){return JSON.stringify([spec.intent,spec.action,spec.objectiveId,spec.point,spec.role,spec.route,spec.requestKey]);}
  function issueMission(sim,sq,spec,reason){
    var old=sq._macroMission,key=briefKey(spec),stats=missionState(sim);
    if(old&&old.key===key&&(old.status==='issued'||old.status==='executing')){stats.decisionsUnchanged++;sq._macroMissionObservation=missionObservation(sim,sq,old);return old;}
    finishMission(sim,sq,'superseded',reason);
    var m={version:(old?old.version:0)+1,owner:'force-command',intent:spec.intent,action:spec.action,objectiveId:spec.objectiveId||null,point:point(spec.point),route:(spec.route||[]).map(point),role:spec.role,requestKey:spec.requestKey||null,issuedAt:+sim.time||0,acceptedAt:null,status:'issued',reason:reason,key:key};
    sq._macroMission=m;sq._macroMissionObservation=missionObservation(sim,sq,m);
    sq.targetObjective=m.objectiveId;sq.commandRole=m.role;stats.strategicWrites++;
    telemetry(sim,'decision-mission-issued',{faction:sq.faction,squad:sq.id,version:m.version,intent:m.intent,objectiveId:m.objectiveId,reason:reason});
    return m;
  }
  function recordMacroWake(sim,sq,reason){
    var stats=missionState(sim),event={faction:sq.faction,squad:sq.id,reason:reason,target:sq._macroMission&&sq._macroMission.objectiveId||null,time:+(+sim.time||0).toFixed(2)};
    stats.wakeCount++;stats.wakeReasons[reason]=(stats.wakeReasons[reason]||0)+1;stats.lastWake=event;stats.recentWakes.push(event);if(stats.recentWakes.length>60)stats.recentWakes.shift();telemetry(sim,'decision-macro-replan',event);
  }
  function reserveDue(sim,sq){
    var cfg=policy(sim,sq.faction),doc=doctrine(sim,sq.faction),counts=sim.objectiveControl&&sim.objectiveControl.counts||{};
    return sim.time>45*(1-doc.riskTolerance)||(counts[enemyFaction(sq.faction)]||0)>(counts[sq.faction]||0)||D.nearestEnemyToSquad(sim,sq).distance<cfg.contactDistance*1.5;
  }
  function strategicStallKey(sim,faction){
    var health=sim._coordinationHealth,side=health&&health.sides&&health.sides[faction],age=side&&+side.objectiveStallSeconds||0;
    return age>=STRATEGIC_STALL_REPLAN?String(+health.lastObjectiveProgressAt||0)+':'+Math.floor(age/STRATEGIC_STALL_REPLAN):null;
  }
  function wakeReason(sim,sq,stallKey){
    var m=sq._macroMission;if(sq.state==='retreat'||!D.aliveMembers(sq).length){if(m)finishMission(sim,sq,'failed',sq.state==='retreat'?'squad-retreat':'squad-destroyed');return null;}
    if(!m)return'initial-mission';
    if(m.status==='failed'||m.status==='invalid'||m.status==='completed')return'mission-resume';
    /* A defense request is new information only when it changes the task: a squad already defending that
       objective keeps its brief while pressure comes and goes; releasing a request-bound brief is reassessed. */
    var request=defenseRequest(sim,sq);
    if(request?!(m.intent==='defend'&&m.objectiveId===request.request.objectiveId):!!m.requestKey)return'request-changed';
    var escalation=sq._macroMissionRequest;if(escalation&&escalation.missionVersion===m.version)return escalation.reason||'captain-request';
    if(m.intent==='reserve')return reserveDue(sim,sq)?'reserve-commit':null;
    if(!m.objectiveId)return catalogKey(sim)!==(sq._macroMissionObservation||{}).catalog?'objective-opportunity':null;
    var obj=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(sim,m.objectiveId);if(!obj)return'mission-invalid';
    var st=D.objectiveStatus(sim,obj)||{},obs=sq._macroMissionObservation||{};
    if(m.intent==='capture'&&st.owner===sq.faction)return'mission-complete';
    if(m.intent==='defend'&&st.owner!==obs.owner)return'objective-control-changed';
    if(m.intent==='capture'&&!!st.vacantOwner!==obs.vacant&&st.vacantOwner)return'objective-vacated';
    /* A faction-wide stall is only evidence against a mission that has had the whole stall window to work. */
    return m.intent==='capture'&&stallKey&&(+sim.time||0)-(+m.issuedAt||0)>=STRATEGIC_STALL_REPLAN?'strategic-stall':null;
  }
  function selectMission(sim,sq,town,reason){
    var request=defenseRequest(sim,sq),old=sq._macroMission,role=sq.commandRole||'center';
    if(request)return issueMission(sim,sq,{intent:'defend',action:'defend',objectiveId:request.request.objectiveId,point:request.request.point,role:request.source==='prepared-defense'?'garrison':role,route:[],requestKey:request.key},reason);
    if(reason==='reserve-commit'){
      role='center';finishMission(sim,sq,'completed',reason);
      telemetry(sim,'decision-reserve-commit',{faction:sq.faction,squad:sq.id,time:+(+sim.time||0).toFixed(1),objectives:sim.objectiveControl&&sim.objectiveControl.counts||{}});
    }
    if(role==='reserve')return issueMission(sim,sq,{intent:'reserve',action:'hold',objectiveId:null,point:(sq.route||[]).slice(-1)[0]||sq.home||sq.rally,role:role,route:[]},reason);
    var previous=old&&old.objectiveId||sq.targetObjective,assigned=previous&&root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(sim,previous),chosen=null;
    if(assigned&&reason!=='strategic-stall'&&reason!=='mission-complete'){
      var status=D.objectiveStatus(sim,assigned)||{};
      if(status.owner!==sq.faction)chosen={instance:assigned,point:D.objectivePoint(assigned,sim,sq),status:status};
    }
    if(!chosen)chosen=D.chooseObjective(sim,sq,false)||D.chooseObjective(sim,sq,true);
    if(!chosen)return issueMission(sim,sq,{intent:'hold',action:'hold',objectiveId:null,point:D.avgPos(sq),role:role,route:[]},reason);
    var intent=chosen.status&&chosen.status.owner===sq.faction?'defend':'capture';
    /* Doctrine is decided once per brief, when it is issued - never re-evaluated per tick. The brief goes
       straight for the objective: walking the old approach route first cost captures (12-seed replay
       3.2 vs 3.8/battle) and on main a shadow writer had already abandoned it within the first minute. */
    var p=D.avgPos(sq),enemy=D.nearestEnemyToSquad(sim,sq),context=D.buildContext(sim,sq,chosen,enemy,p),rule=root.BattleAIPolicy?root.BattleAIPolicy.decide(genome(sim,sq.faction),context):null;
    var action=rule&&rule.action||'assault',axis=[];
    var vacant=root.BattleVacantObjectiveAssault;
    if(vacant&&vacant.isVacantEnemyObjective(sim,sq,chosen.instance)&&enemy.distance>=vacant.immediateThreat)action='assault';
    if(action==='defend'){var defend=D.chooseObjective(sim,sq,true);if(defend){chosen=defend;intent='defend';}}
    if(action==='flank')axis.push(D.flankPoint(sq,chosen,town));
    if(rule)telemetry(sim,'decision-doctrine',{faction:sq.faction,squad:sq.id,rule:rule.id,action:action,conditions:rule.when,objective:chosen.instance.id,localRatio:+context.localRatio.toFixed(2)});
    if(intent==='defend')action='defend';
    return issueMission(sim,sq,{intent:intent,action:action,objectiveId:chosen.instance.id,point:chosen.point,role:role,route:axis},reason);
  }
  function reconsiderMission(sim,sq,town,reason){
    recordMacroWake(sim,sq,reason);
    if(reason==='mission-complete')finishMission(sim,sq,'completed',reason);
    else if(reason==='mission-invalid')finishMission(sim,sq,'invalid',reason);
    selectMission(sim,sq,town,reason);sq._macroMissionRequest=null;
  }

  function updateCommander(sim,town,dt){
    dt=dt||COMMAND_TICK;
    var macro=macroEnabled(sim),macroWake=false,wakeReasons={};
    if(macro)R.ensureAssignments(sim,town);
    if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.tick(sim,dt);
    if(macro)['us','ge'].forEach(function(f){
      var squads=sim.factions[f].squads,stats=missionState(sim),key=strategicStallKey(sim,f),stall=key&&stats.stallByFaction[f]!==key?key:null;
      for(var i=0;i<squads.length;i++){
        var sq=squads[i],reason=wakeReason(sim,sq,stall);if(!reason)continue;
        macroWake=true;wakeReasons[sq.id]=reason;reconsiderMission(sim,sq,town,reason);
      }
      if(key)stats.stallByFaction[f]=key;
    });
    if(root.BattleModules)root.BattleModules.runHook('onCommanderTick',sim,{town:town,dt:dt,macroCommandEnabled:macro,macroCommandWake:macroWake,macroWakeReasons:wakeReasons});
    var snapshotSeconds=policy(sim,'us').decisionSnapshotSeconds||5;
    if(!sim._nextDecisionSnapshot||sim.time>=sim._nextDecisionSnapshot){
      sim._nextDecisionSnapshot=sim.time+snapshotSeconds;
      var counts=sim.objectiveControl&&sim.objectiveControl.counts||{};
      telemetry(sim,'decision-snapshot',{scenarioId:town&&town.id||null,seed:town&&town.seed||null,macroCommandEnabled:macro,macroMissionState:missionState(sim),usAlive:D.forceUnits(sim,'us').length,geAlive:D.forceUnits(sim,'ge').length,usObjectives:counts.us||0,geObjectives:counts.ge||0,
        squads:{us:sim.factions.us.squads.map(function(q){return q.commandPhase;}),ge:sim.factions.ge.squads.map(function(q){return q.commandPhase;})},
        contact:{us:sim.factions.us.squads.filter(function(q){return q.inContact;}).length,ge:sim.factions.ge.squads.filter(function(q){return q.inContact;}).length}});
    }
    if(sim.objectiveHold&&sim.objectiveHold.us>=OBJECTIVE_HOLD_WIN)declare(sim,'us','held all objectives');
    else if(sim.objectiveHold&&sim.objectiveHold.ge>=OBJECTIVE_HOLD_WIN)declare(sim,'ge','held all objectives');
  }

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
    sim.macroCommandEnabled=!(opts&&opts.macroCommandEnabled===false);
    sim.objectives=sim._objectives||[];sim._commandAccum=0;sim._nextDecisionSnapshot=0;sim._objectiveRecovery={us:{count:0,last:null},ge:{count:0,last:null}};sim._macroMissionState=null;
    var adapted={};
    if(root.BattleAIPolicy){['us','ge'].forEach(function(f){adapted[f]=root.BattleAIPolicy.adaptedForScenario(town);});telemetry(sim,'decision-scenario-recall',{scenarioId:town.id,seed:town.seed,sources:adapted.us.sources,fingerprint:town.fingerprint});}
    if(root.BattleModules)root.BattleModules.runHook('onBattleStart',sim,{town:town});
    installVictory(sim);

    var stockRestart=sim.restart.bind(sim);
    sim.restart=function(){
      var macroCommandEnabled=sim.macroCommandEnabled!==false;
      stockRestart();
      town=scene.metadata&&scene.metadata.battleScenario||scene.metadata&&scene.metadata.battleTown||town;
      if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.reset(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});
      R.initForce(sim,'us',town);R.initForce(sim,'ge',town);
      sim.macroCommandEnabled=macroCommandEnabled;
      sim._commandAccum=0;sim._nextDecisionSnapshot=0;sim._objectiveRecovery={us:{count:0,last:null},ge:{count:0,last:null}};sim._macroMissionState=null;
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
    update:updateCommander,
    assignSquad:R.assignSquad,ensureAssignments:R.ensureAssignments,
    isMacroEnabled:macroEnabled,setMacroEnabled:setMacroEnabled,
    commandTick:COMMAND_TICK,objectiveHoldWin:OBJECTIVE_HOLD_WIN,strategicStallReplan:STRATEGIC_STALL_REPLAN,
    missionState:missionState,
    policyFor:policy,genomeFor:genome,doctrineFor:doctrine,
    chooseObjective:D.chooseObjective,buildContext:D.buildContext
  };
})(typeof window!=='undefined'?window:globalThis);

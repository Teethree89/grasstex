/* Hierarchical tactical coordinator for the Battle Sim / ww2fps AI lab v20.
   The commander consumes Policy Genome v2: numeric parameters still tune execution while doctrine
   and constrained tactical rules can change force allocation, objective selection and squad intent.
   Unit-specific behavior stays in modules. */
(function(root){
  'use strict';
  root.BATTLE_BUILD='v20';
  console.log('[COMMAND] Genome v2 commander v20 loaded');
  if(!root.BattleSim||!root.SquadAI)return;

  var oldStart=root.BattleSim.start,oldUpdateSquad=root.SquadAI.updateSquad,oldUpdateSoldier=root.SquadAI.updateSoldier;
  var COMMAND_TICK=.45,OBJECTIVE_HOLD_WIN=35;
  var FALLBACK={cohesionRadius:34,captainlessCohesion:26,regroupHold:.4,cornerHold:.8,cornerNoCaptainExtra:.35,supportDelay:20,sectorNeutralNeed:75,sectorEnemyNeed:110,sectorActiveBonus:18,sectorDistanceWeight:.55,routeArrivalRadius:8,finalRouteRadius:14,captureCommitRatio:.82,contactDistance:28,townBoundary:58,engagedRallyAdvance:.16,pressObjectiveMinDistance:7,pressEnemyClearance:35,scoutLead:4,gunnerTrail:3,decisionSnapshotSeconds:5};
  var FALLBACK_DOCTRINE={reserveFraction:.16,localSuperiority:1.15,flankPreference:.42,defenseCommitment:.34,riskTolerance:.56,objectiveStrategy:'balanced'};

  function genome(sim,faction){return root.BattleAIPolicy?root.BattleAIPolicy.genomeFor(sim,faction):{version:2,parameters:FALLBACK,doctrine:FALLBACK_DOCTRINE,rules:[]};}
  function policy(sim,faction){var g=genome(sim,faction);return g.parameters||FALLBACK;}
  function doctrine(sim,faction){var g=genome(sim,faction);return g.doctrine||FALLBACK_DOCTRINE;}
  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function aliveMembers(sq){return sq.members.filter(function(s){return !s.dead;});}
  function avgPos(sq){var a=aliveMembers(sq),x=0,z=0;if(!a.length)return{x:sq.rally.x,z:sq.rally.z};for(var i=0;i<a.length;i++){x+=a[i].root.position.x;z+=a[i].root.position.z;}return{x:x/a.length,z:z/a.length};}
  function maxSpread(sq,p){var a=aliveMembers(sq),m=0;for(var i=0;i<a.length;i++)m=Math.max(m,dist(a[i].root.position.x,a[i].root.position.z,p.x,p.z));return m;}
  function captain(sq){for(var i=0;i<sq.members.length;i++)if(sq.members[i].role==='captain'&&!sq.members[i].dead)return sq.members[i];return null;}
  function enemyFaction(f){return f==='us'?'ge':'us';}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function setPhase(sim,sq,next,why){if(sq.commandPhase===next)return;sq.commandPhase=next;telemetry(sim,'decision-phase',{faction:sq.faction,squad:sq.id,phase:next,why:why||''});}
  function objectivePoint(instance,sim,sq){if(instance&&instance.handler&&typeof instance.handler.commandPoint==='function')return instance.handler.commandPoint(instance,sim,sq);var d=instance&&instance.def||{};return{x:+d.x||0,z:+d.z||0};}
  function objectiveStatus(sim,obj){return root.BattleObjectiveSystem?root.BattleObjectiveSystem.status(sim,obj.id):(obj.state||{});}

  function rolePlan(sim,faction,index,count){
    var doc=doctrine(sim,faction),reserveCount=Math.round(count*doc.reserveFraction);
    if(reserveCount>0&&index>=count-reserveCount)return'reserve';
    var cycle=doc.flankPreference>.66?['left','right','center','left','right']:doc.flankPreference<.25?['center','support','center','left','right']:['left','center','support','center','right'];
    return cycle[index%cycle.length];
  }
  function routeFor(sq,role,town,index){
    var source=town&&town.routes&&town.routes[sq.faction]&&(town.routes[sq.faction][role]||town.routes[sq.faction].center);
    if(source&&source.length)return source.map(function(p){return{x:p.x,z:p.z};});
    var c=town&&town.center||{x:0,z:0},r=town&&town.radius||250,home=sq.home,dir=sq.faction==='us'?1:-1,side=role==='left'?-1:(role==='right'?1:0);
    if(role==='reserve')return[{x:home.x,z:home.z},{x:c.x+side*r*.52,z:c.z-dir*r*.82}];
    var flankScale=role==='support'?.18:.56;
    return[
      {x:home.x,z:home.z},
      {x:c.x+side*r*flankScale,z:c.z-dir*r*.76},
      {x:c.x+side*r*(role==='support'?.12:.42),z:c.z-dir*r*.34},
      {x:c.x,z:c.z}
    ];
  }
  function assignSquad(sim,sq,town,index){
    var count=sim.factions[sq.faction].squads.length||5,role=rolePlan(sim,sq.faction,index,count),route=routeFor(sq,role,town,index);
    sq._battleSim=sim;sq.commandRole=role;sq.route=route;sq.routeIndex=0;sq.commandPhase=role==='reserve'?'reserve':'approach';sq.commandHoldUntil=0;sq.lastCommandTime=0;sq.objective=route[0];sq._lastLoggedRoute=-1;sq.targetObjective=null;sq._lastDoctrineRule=null;
    telemetry(sim,'decision-assign',{faction:sq.faction,squad:sq.id,role:role,routePoints:route.length,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,genomeVersion:2});
  }
  function ensureAssignments(sim,town){['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)if(!squads[i].route)assignSquad(sim,squads[i],town,i);});}
  function initForce(sim,faction,town){var squads=sim.factions[faction].squads;for(var i=0;i<squads.length;i++)assignSquad(sim,squads[i],town,i);}

  function nearbyStrength(sim,faction,p,radius){var n=0,all=forceUnits(sim,faction);for(var i=0;i<all.length;i++){var u=all[i];if(u.root&&dist(p.x,p.z,u.root.position.x,u.root.position.z)<=radius)n+=u.scoreValue==null?1:+u.scoreValue;}return n;}
  function nearestEnemyToSquad(sim,sq){var p=avgPos(sq),enemy=forceUnits(sim,enemyFaction(sq.faction)),best=null,bd=Infinity;for(var i=0;i<enemy.length;i++){var e=enemy[i],d=dist(p.x,p.z,e.root.position.x,e.root.position.z);if(d<bd){bd=d;best=e;}}return{unit:best,distance:bd};}
  function ownerPressure(status,faction){if(!status)return 0;var enemy=enemyFaction(faction);return+(status[enemy]||0)-+(status[faction]||0);}

  function chooseObjective(sim,sq,wantOwned){
    var objectives=sim._objectives||[],p=avgPos(sq),cfg=policy(sim,sq.faction),doc=doctrine(sim,sq.faction),best=null,bestScore=-Infinity;
    var ordered=objectives.slice();if(doc.objectiveStrategy==='sequential'&&sq.faction==='ge')ordered.reverse();
    for(var i=0;i<ordered.length;i++){
      var obj=ordered[i],status=objectiveStatus(sim,obj)||{},owner=status.owner||'neutral',point=objectivePoint(obj,sim,sq),d=dist(p.x,p.z,point.x,point.z),value=+obj.def.value||1;
      if(wantOwned&&owner!==sq.faction)continue;
      if(!wantOwned&&owner===sq.faction&&doc.defenseCommitment<.58)continue;
      var need=owner===sq.faction?0:(owner==='neutral'?cfg.sectorNeutralNeed:cfg.sectorEnemyNeed),active=status.active===sq.faction?cfg.sectorActiveBonus:0,score=(need+active)*value-d*cfg.sectorDistanceWeight;
      if(doc.objectiveStrategy==='nearest')score=-d+value*15;
      else if(doc.objectiveStrategy==='highest-value')score=value*150-d*.18;
      else if(doc.objectiveStrategy==='weakest-pressure')score=90-ownerPressure(status,sq.faction)*18-d*.25+(owner===sq.faction?-30:30);
      else if(doc.objectiveStrategy==='sequential')score=200-i*35-d*.10+(owner===sq.faction?-150:0);
      if(obj.handler&&typeof obj.handler.commandScore==='function')score=obj.handler.commandScore(obj,sim,sq,score,cfg);
      if(score>bestScore){bestScore=score;best={instance:obj,point:point,status:status,score:score};}
    }
    return best;
  }

  function ruleContext(sim,sq,chosen,enemy,p){
    var doc=doctrine(sim,sq.faction),status=chosen&&chosen.status||{},owner=status.owner||'neutral',friendly=nearbyStrength(sim,sq.faction,p,90),hostile=nearbyStrength(sim,enemyFaction(sq.faction),p,90),ratio=friendly/Math.max(1,hostile);
    return{objectiveNeutral:owner==='neutral',objectiveEnemy:owner===enemyFaction(sq.faction),objectiveOwned:owner===sq.faction,enemyNear:enemy.distance<policy(sim,sq.faction).contactDistance*1.4,outnumbered:ratio<doc.localSuperiority,notOutnumbered:ratio>=doc.localSuperiority,captainDead:!captain(sq),supportRole:sq.commandRole==='support'||sq.commandRole==='reserve',insideObjective:!!(chosen&&dist(p.x,p.z,chosen.point.x,chosen.point.z)<(+chosen.instance.def.radius||30)),underPressure:owner===sq.faction&&ownerPressure(status,sq.faction)>0,ratio:ratio,friendly:friendl,y:undefined};
  }
  /* Keep plain context data separate from condition booleans; typo-safe correction below. */
  function buildContext(sim,sq,chosen,enemy,p){
    var doc=doctrine(sim,sq.faction),status=chosen&&chosen.status||{},owner=status.owner||'neutral',friendly=nearbyStrength(sim,sq.faction,p,90),hostile=nearbyStrength(sim,enemyFaction(sq.faction),p,90),ratio=friendly/Math.max(1,hostile);
    return{objectiveNeutral:owner==='neutral',objectiveEnemy:owner===enemyFaction(sq.faction),objectiveOwned:owner===sq.faction,enemyNear:enemy.distance<policy(sim,sq.faction).contactDistance*1.4,outnumbered:ratio<doc.localSuperiority,notOutnumbered:ratio>=doc.localSuperiority,captainDead:!captain(sq),supportRole:sq.commandRole==='support'||sq.commandRole==='reserve',insideObjective:!!(chosen&&dist(p.x,p.z,chosen.point.x,chosen.point.z)<(+chosen.instance.def.radius||30)),underPressure:owner===sq.faction&&ownerPressure(status,sq.faction)>0,localRatio:ratio,friendlyStrength:friendly,enemyStrength:hostile};
  }
  function flankPoint(sq,chosen,town){var p=chosen.point,c=town&&town.center||{x:0,z:0},vx=p.x-c.x,vz=p.z-c.z,len=Math.hypot(vx,vz)||1,side=(sq.commandRole==='left'||String(sq.id).length%2===0)?-1:1,off=Math.min(80,Math.max(35,(+chosen.instance.def.radius||30)*1.7));return{x:p.x+(-vz/len)*off*side,z:p.z+(vx/len)*off*side};}

  function advanceRoute(sim,sq,town){
    if(!sq.route||!sq.route.length)return;
    var cfg=policy(sim,sq.faction),doc=doctrine(sim,sq.faction),p=avgPos(sq),spread=maxSpread(sq,p),enemy=nearestEnemyToSquad(sim,sq),cap=captain(sq),now=sim.time,cohesionLimit=cap?cfg.cohesionRadius:cfg.captainlessCohesion;
    if(spread>cohesionLimit){setPhase(sim,sq,'regroup','spread '+spread.toFixed(1));sq.commandHoldUntil=Math.max(sq.commandHoldUntil,now+cfg.regroupHold);sq.objective={x:p.x,z:p.z};return;}

    if(sq.commandRole==='reserve'){
      var counts=sim.objectiveControl&&sim.objectiveControl.counts||{},own=counts[sq.faction]||0,enemyCount=counts[enemyFaction(sq.faction)]||0,release=now>45*(1-doc.riskTolerance)||enemyCount>own||enemy.distance<cfg.contactDistance*1.5;
      if(!release){setPhase(sim,sq,'reserve','holding reserve');sq.objective=sq.route[sq.route.length-1];return;}
      sq.commandRole='center';sq.routeIndex=Math.max(0,sq.route.length-1);setPhase(sim,sq,'approach','reserve committed');telemetry(sim,'decision-reserve-commit',{faction:sq.faction,squad:sq.id,time:+now.toFixed(1),objectives:counts});
    }
    if(sq.commandRole==='support'){
      var squads=sim.factions[sq.faction].squads,assaultCommitted=false;for(var a=0;a<squads.length;a++)if(squads[a]!==sq&&(squads[a].routeIndex>=2||squads[a].state==='engaged'))assaultCommitted=true;
      if(!assaultCommitted&&now<cfg.supportDelay&&sq.routeIndex>=1){setPhase(sim,sq,'support-hold','waiting for assault');sq.objective=sq.route[Math.min(1,sq.route.length-1)];return;}
    }
    if(now<sq.commandHoldUntil){sq.objective=sq.route[Math.min(sq.routeIndex,sq.route.length-1)];return;}

    var wp=sq.route[Math.min(sq.routeIndex,sq.route.length-1)],d=dist(p.x,p.z,wp.x,wp.z);
    if(d<cfg.routeArrivalRadius&&sq.routeIndex<sq.route.length-1){var oldIndex=sq.routeIndex,inTown=town&&town.center?dist(wp.x,wp.z,town.center.x,town.center.z)<(town.radius||250):false;if(inTown){sq.commandHoldUntil=now+cfg.cornerHold+(cap?0:cfg.cornerNoCaptainExtra);setPhase(sim,sq,'corner-check','route '+oldIndex);}sq.routeIndex++;wp=sq.route[sq.routeIndex];d=dist(p.x,p.z,wp.x,wp.z);telemetry(sim,'decision-route',{faction:sq.faction,squad:sq.id,from:oldIndex,to:sq.routeIndex,x:wp.x,z:wp.z});}

    if(sq.routeIndex>=sq.route.length-1&&d<Math.max(cfg.finalRouteRadius,32)){
      var chosen=chooseObjective(sim,sq,false)||chooseObjective(sim,sq,true);
      if(chosen){
        var context=buildContext(sim,sq,chosen,enemy,p),rule=root.BattleAIPolicy?root.BattleAIPolicy.decide(genome(sim,sq.faction),context):null,action=rule&&rule.action||'assault';
        if(rule&&sq._lastDoctrineRule!==rule.id){sq._lastDoctrineRule=rule.id;telemetry(sim,'decision-doctrine',{faction:sq.faction,squad:sq.id,rule:rule.id,action:action,conditions:rule.when,objective:chosen.instance.id,localRatio:+context.localRatio.toFixed(2)});}
        if(action==='regroup'){setPhase(sim,sq,'regroup','genome rule '+(rule&&rule.id||''));sq.objective={x:p.x,z:p.z};sq.commandHoldUntil=now+cfg.regroupHold;return;}
        if(action==='hold'){setPhase(sim,sq,'hold','genome rule '+(rule&&rule.id||''));sq.objective={x:sq.rally.x,z:sq.rally.z};return;}
        if(action==='support'){setPhase(sim,sq,'support-hold','genome rule '+(rule&&rule.id||''));sq.objective={x:p.x,z:p.z};return;}
        if(action==='defend'){
          var defend=chooseObjective(sim,sq,true);if(defend)chosen=defend;setPhase(sim,sq,'defend','genome rule '+(rule&&rule.id||''));
        }else if(action==='flank'){
          sq.objective=flankPoint(sq,chosen,town);sq.targetObjective=chosen.instance.id;setPhase(sim,sq,'flank','genome rule '+(rule&&rule.id||''));return;
        }
        sq.objective={x:chosen.point.x,z:chosen.point.z};sq.targetObjective=chosen.instance.id;
        var radius=+chosen.instance.def.radius||30,objD=dist(p.x,p.z,chosen.point.x,chosen.point.z);
        if(objD<=radius*cfg.captureCommitRatio)setPhase(sim,sq,action==='defend'?'defend':'capture','objective '+chosen.instance.id);else setPhase(sim,sq,'assault','move to '+chosen.instance.id);
        return;
      }
    }
    if(enemy.distance<cfg.contactDistance&&sq.commandRole!=='support')setPhase(sim,sq,'contact','enemy '+enemy.distance.toFixed(1)+'m');else if(town&&town.center&&dist(p.x,p.z,town.center.x,town.center.z)<(town.radius||250))setPhase(sim,sq,'clear-town','inside objective area');else setPhase(sim,sq,'approach','route advance');sq.objective={x:wp.x,z:wp.z};
  }

  function objectiveValueScore(sim,faction){var total=0;(sim._objectives||[]).forEach(function(o){var s=objectiveStatus(sim,o);if(s&&s.owner===faction)total+=(+o.def.value||1);});return total;}
  function forceUnits(sim,faction){if(root.BattleModules)return root.BattleModules.unitsFor(sim).filter(function(u){return u&&u.faction===faction&&!u.dead&&u.countsForElimination!==false;});return(sim._roster[faction]||[]).filter(function(u){return!u.dead;});}
  function forceScore(sim,faction){var units=forceUnits(sim,faction),score=0;for(var i=0;i<units.length;i++)score+=units[i].scoreValue==null?1:+units[i].scoreValue;return score;}
  function declare(sim,winner,reason){if(sim.winner)return;sim.winner=winner;sim.winReason=reason;telemetry(sim,'objective-victory',{winner:winner,reason:reason});console.log('[COMMAND] objective victory '+winner+' reason='+reason);if(sim.onWinner)sim.onWinner(winner,sim);}

  function updateCommander(sim,town,dt){
    dt=dt||COMMAND_TICK;ensureAssignments(sim,town);if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.tick(sim,dt);
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)advanceRoute(sim,squads[i],town);});if(root.BattleModules)root.BattleModules.runHook('onCommanderTick',sim,{town:town,dt:dt});
    var snapPolicy=policy(sim,'us'),snapshotSeconds=snapPolicy.decisionSnapshotSeconds||5;
    if(!sim._nextDecisionSnapshot||sim.time>=sim._nextDecisionSnapshot){sim._nextDecisionSnapshot=sim.time+snapshotSeconds;var counts=sim.objectiveControl&&sim.objectiveControl.counts||{};telemetry(sim,'decision-snapshot',{scenarioId:town&&town.id||null,seed:town&&town.seed||null,usAlive:forceUnits(sim,'us').length,geAlive:forceUnits(sim,'ge').length,usObjectives:counts.us||0,geObjectives:counts.ge||0,squads:{us:sim.factions.us.squads.map(function(q){return q.commandPhase;}),ge:sim.factions.ge.squads.map(function(q){return q.commandPhase;})}});}
    if(sim.objectiveHold&&sim.objectiveHold.us>=OBJECTIVE_HOLD_WIN)declare(sim,'us','held all objectives');else if(sim.objectiveHold&&sim.objectiveHold.ge>=OBJECTIVE_HOLD_WIN)declare(sim,'ge','held all objectives');
  }

  root.SquadAI.updateSquad=function(sq){var commanded=sq.route&&sq.route.length,objective=commanded&&sq.objective?{x:sq.objective.x,z:sq.objective.z}:null;oldUpdateSquad(sq);if(commanded&&objective){sq.objective=objective;var sim=sq._battleSim,cfg=policy(sim,sq.faction);if(sq.state==='engaged'&&['regroup','support-hold','hold','reserve','defend'].indexOf(sq.commandPhase)<0){var dx=objective.x-sq.rally.x,dz=objective.z-sq.rally.z,len=Math.hypot(dx,dz);if(len>1){sq.rally.x+=dx/len*cfg.engagedRallyAdvance;sq.rally.z+=dz/len*cfg.engagedRallyAdvance;}}}};

  root.SquadAI.updateSoldier=function(soldier,battle){
    oldUpdateSoldier(soldier,battle);var sq=soldier.squad;if(!sq||!sq.route||soldier.dead||sq.state==='retreat')return;var cfg=policy(battle,sq.faction),p=soldier.root.position;
    if((sq.commandPhase==='corner-check')&&battle.time<sq.commandHoldUntil){var wp=sq.route[Math.max(0,sq.routeIndex-1)]||sq.rally,dx=wp.x-p.x,dz=wp.z-p.z,len=Math.hypot(dx,dz)||1,back=soldier.role==='scout'?1.5:(soldier.role==='captain'?3.5:5+soldier.slotIndex*.35);soldier.destination={x:wp.x-dx/len*back,z:wp.z-dz/len*back};soldier.prone=false;return;}
    if(['approach','clear-town','capture','assault','flank','defend'].indexOf(sq.commandPhase)>=0&&sq.objective){var objD=dist(p.x,p.z,sq.objective.x,sq.objective.z),enemyD=soldier.target?dist(p.x,p.z,soldier.target.root.position.x,soldier.target.root.position.z):Infinity,canPress=soldier.role!=='gunner'&&objD>cfg.pressObjectiveMinDistance&&enemyD>cfg.pressEnemyClearance&&soldier.suppressedUntil<=battle.time;if(canPress){soldier.destination=root.SquadAI.formationSlot(sq,soldier,soldier.slotIndex);soldier.prone=false;}if(!soldier.target){var vx=sq.objective.x-sq.rally.x,vz=sq.objective.z-sq.rally.z,vlen=Math.hypot(vx,vz)||1;if(soldier.role==='scout'){soldier.destination.x+=vx/vlen*cfg.scoutLead;soldier.destination.z+=vz/vlen*cfg.scoutLead;}else if(soldier.role==='gunner'){soldier.destination.x-=vx/vlen*cfg.gunnerTrail;soldier.destination.z-=vz/vlen*cfg.gunnerTrail;}}}
  };

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),town=scene.metadata&&scene.metadata.battleScenario||scene.metadata&&scene.metadata.battleTown;if(!town){console.warn('[COMMAND] no scenario metadata; hierarchical infantry AI disabled');return sim;}
    if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.attach(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});initForce(sim,'us',town);initForce(sim,'ge',town);sim.objectives=sim._objectives||[];sim._commandAccum=0;sim._nextDecisionSnapshot=0;
    var adapted={};if(root.BattleAIPolicy){['us','ge'].forEach(function(f){adapted[f]=root.BattleAIPolicy.adaptedForScenario(town);});telemetry(sim,'decision-scenario-recall',{scenarioId:town.id,seed:town.seed,sources:adapted.us.sources,fingerprint:town.fingerprint});}
    if(root.BattleModules)root.BattleModules.runHook('onBattleStart',sim,{town:town});

    var stockCheck=sim._checkWinner.bind(sim);sim._checkWinner=function(){if(this.winner)return;var usUnits=forceUnits(this,'us'),geUnits=forceUnits(this,'ge');if(usUnits.length<=0||geUnits.length<=0){this.winner=usUnits.length===geUnits.length?'draw':(usUnits.length>geUnits.length?'us':'ge');if(this.onWinner)this.onWinner(this.winner,this);return;}if(this.time>=this.timeLimit){var u=objectiveValueScore(this,'us')*12+forceScore(this,'us'),g=objectiveValueScore(this,'ge')*12+forceScore(this,'ge');declare(this,u===g?'draw':(u>g?'us':'ge'),'time limit objective score');return;}if(this.time<this.timeLimit&&this.factions.us.alive<=0&&this.factions.ge.alive<=0)stockCheck();};

    var stockRestart=sim.restart.bind(sim);sim.restart=function(){stockRestart();town=scene.metadata&&scene.metadata.battleScenario||scene.metadata&&scene.metadata.battleTown||town;if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.reset(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});initForce(sim,'us',town);initForce(sim,'ge',town);sim._commandAccum=0;sim._nextDecisionSnapshot=0;if(root.BattleModules)root.BattleModules.runHook('onBattleRestart',sim,{town:town});};
    scene.onBeforeRenderObservable.add(function(){if(sim.paused||sim.winner||sim._trainerStepActive)return;var dt=Math.min(.25,Math.max(0,scene.getEngine().getDeltaTime()/1000*sim.timeScale));sim._commandAccum+=dt;while(sim._commandAccum>=COMMAND_TICK&&!sim.winner){sim._commandAccum-=COMMAND_TICK;updateCommander(sim,town,COMMAND_TICK);}});
    console.log('[COMMAND] v20 Genome v2 doctrine + modular objectives active');return sim;
  };

  root.BattleCommanderAI={update:updateCommander,assignSquad:assignSquad,ensureAssignments:ensureAssignments,commandTick:COMMAND_TICK,objectiveHoldWin:OBJECTIVE_HOLD_WIN,policyFor:policy,genomeFor:genome,doctrineFor:doctrine};
})(typeof window!=='undefined'?window:globalThis);

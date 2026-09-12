/* Hierarchical tactical coordinator for the Battle Sim / ww2fps AI lab v19.
   Infantry command is one policy-driven layer. Objective behavior and future unit systems
   (armor, engineers, artillery, etc.) plug in through BattleModules/BattleObjectiveSystem. */
(function(root){
  'use strict';
  root.BATTLE_BUILD='v19';
  console.log('[COMMAND] runtime v19 loaded');
  if(!root.BattleSim||!root.SquadAI)return;

  var oldStart=root.BattleSim.start;
  var oldUpdateSquad=root.SquadAI.updateSquad;
  var oldUpdateSoldier=root.SquadAI.updateSoldier;
  var COMMAND_TICK=.45,OBJECTIVE_HOLD_WIN=35;
  var FALLBACK={cohesionRadius:34,captainlessCohesion:26,regroupHold:.4,cornerHold:.8,cornerNoCaptainExtra:.35,supportDelay:20,sectorNeutralNeed:75,sectorEnemyNeed:110,sectorActiveBonus:18,sectorDistanceWeight:.55,routeArrivalRadius:8,finalRouteRadius:14,captureCommitRatio:.82,contactDistance:28,townBoundary:58,engagedRallyAdvance:.16,pressObjectiveMinDistance:7,pressEnemyClearance:35,scoutLead:4,gunnerTrail:3,decisionSnapshotSeconds:5};

  function policy(sim,faction){return root.BattleAIPolicy?root.BattleAIPolicy.policyFor(sim,faction):FALLBACK;}
  function dist(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}
  function aliveMembers(sq){var a=[];for(var i=0;i<sq.members.length;i++)if(!sq.members[i].dead)a.push(sq.members[i]);return a;}
  function avgPos(sq){var a=aliveMembers(sq),x=0,z=0;if(!a.length)return {x:sq.rally.x,z:sq.rally.z};for(var i=0;i<a.length;i++){x+=a[i].root.position.x;z+=a[i].root.position.z;}return {x:x/a.length,z:z/a.length};}
  function maxSpread(sq,p){var a=aliveMembers(sq),m=0;for(var i=0;i<a.length;i++)m=Math.max(m,dist(a[i].root.position.x,a[i].root.position.z,p.x,p.z));return m;}
  function captain(sq){for(var i=0;i<sq.members.length;i++)if(sq.members[i].role==='captain'&&!sq.members[i].dead)return sq.members[i];return null;}
  function enemyFaction(f){return f==='us'?'ge':'us';}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function setPhase(sim,sq,next,why){if(sq.commandPhase===next)return;sq.commandPhase=next;telemetry(sim,'decision-phase',{faction:sq.faction,squad:sq.id,phase:next,why:why||''});}

  function rolePlan(index){var cycle=['left','center','support','center','right'];return cycle[index%cycle.length];}
  function objectivePoint(instance,sim,sq){
    if(instance&&instance.handler&&typeof instance.handler.commandPoint==='function')return instance.handler.commandPoint(instance,sim,sq);
    var d=instance&&instance.def||{};return {x:+d.x||0,z:+d.z||0};
  }
  function routeFor(faction,role,town,index){
    var routes=town&&town.routes&&town.routes[faction],source=routes&&(routes[role]||routes.center),base=[];
    if(source)base=source.map(function(p){return {x:p.x,z:p.z};});
    if(!base.length&&town&&town.objectives&&town.objectives.length){
      var order=faction==='us'?town.objectives:town.objectives.slice().reverse();
      base=order.map(function(o){return {x:+o.x||0,z:+o.z||0};});
    }
    if(!base.length)base=[{x:0,z:0}];
    if(index%5===3)for(var r=0;r<base.length;r++)base[r].x+=(faction==='us'?12:-12);
    return base;
  }
  function assignSquad(sim,sq,town,index){
    var role=rolePlan(index),route=routeFor(sq.faction,role,town,index);
    sq._battleSim=sim;sq.commandRole=role;sq.route=route;sq.routeIndex=0;sq.commandPhase='approach';sq.commandHoldUntil=0;sq.lastCommandTime=0;sq.objective=route[0];sq._lastLoggedRoute=-1;sq.targetObjective=null;
    telemetry(sim,'decision-assign',{faction:sq.faction,squad:sq.id,role:role,routePoints:route.length,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0});
  }
  function ensureAssignments(sim,town){['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)if(!squads[i].route)assignSquad(sim,squads[i],town,i);});}
  function initForce(sim,faction,town){var squads=sim.factions[faction].squads;for(var i=0;i<squads.length;i++)assignSquad(sim,squads[i],town,i);}

  function nearestEnemyToSquad(sim,sq){
    var p=avgPos(sq),enemy=sim.rosterOf(enemyFaction(sq.faction)),best=null,bd=Infinity;
    for(var i=0;i<enemy.length;i++){var e=enemy[i];if(e.dead)continue;var d=dist(p.x,p.z,e.root.position.x,e.root.position.z);if(d<bd){bd=d;best=e;}}
    return {unit:best,distance:bd};
  }
  function chooseObjective(sim,sq){
    var objectives=sim._objectives||[],p=avgPos(sq),cfg=policy(sim,sq.faction),best=null,bestScore=-Infinity;
    for(var i=0;i<objectives.length;i++){
      var obj=objectives[i],status=root.BattleObjectiveSystem?root.BattleObjectiveSystem.status(sim,obj.id):(obj.state||{}),owner=status&&status.owner||'neutral',point=objectivePoint(obj,sim,sq);
      var need=owner===sq.faction?0:(owner==='neutral'?cfg.sectorNeutralNeed:cfg.sectorEnemyNeed),active=status&&status.active===sq.faction?cfg.sectorActiveBonus:0,value=+obj.def.value||1;
      var score=(need+active)*value-dist(p.x,p.z,point.x,point.z)*cfg.sectorDistanceWeight;
      if(obj.handler&&typeof obj.handler.commandScore==='function')score=obj.handler.commandScore(obj,sim,sq,score,cfg);
      if(score>bestScore){bestScore=score;best={instance:obj,point:point,status:status,score:score};}
    }
    return best;
  }

  function advanceRoute(sim,sq,town){
    if(!sq.route||!sq.route.length)return;
    var cfg=policy(sim,sq.faction),p=avgPos(sq),spread=maxSpread(sq,p),enemy=nearestEnemyToSquad(sim,sq),cap=captain(sq),now=sim.time;
    var cohesionLimit=cap?cfg.cohesionRadius:cfg.captainlessCohesion;
    if(spread>cohesionLimit){setPhase(sim,sq,'regroup','spread '+spread.toFixed(1));sq.commandHoldUntil=Math.max(sq.commandHoldUntil,now+cfg.regroupHold);sq.objective={x:p.x,z:p.z};return;}

    if(sq.commandRole==='support'){
      var own=sim.factions[sq.faction].squads,assaultCommitted=false;
      for(var a=0;a<own.length;a++)if(own[a]!==sq){var ap=avgPos(own[a]);if(Math.abs(ap.z)<cfg.townBoundary||own[a].state==='engaged')assaultCommitted=true;}
      if(!assaultCommitted&&sim.time<cfg.supportDelay&&sq.routeIndex>=1){setPhase(sim,sq,'support-hold','waiting for assault');sq.objective=sq.route[Math.min(1,sq.route.length-1)];return;}
    }

    if(now<sq.commandHoldUntil){sq.objective=sq.route[Math.min(sq.routeIndex,sq.route.length-1)];return;}
    var wp=sq.route[Math.min(sq.routeIndex,sq.route.length-1)],d=dist(p.x,p.z,wp.x,wp.z);
    if(d<cfg.routeArrivalRadius&&sq.routeIndex<sq.route.length-1){
      var oldIndex=sq.routeIndex,inTown=town&&town.center?dist(wp.x,wp.z,town.center.x,town.center.z)<(town.radius||70):Math.abs(wp.z)<cfg.townBoundary;
      if(inTown){sq.commandHoldUntil=now+cfg.cornerHold+(cap?0:cfg.cornerNoCaptainExtra);setPhase(sim,sq,'corner-check','route '+oldIndex);}
      sq.routeIndex++;wp=sq.route[sq.routeIndex];d=dist(p.x,p.z,wp.x,wp.z);
      telemetry(sim,'decision-route',{faction:sq.faction,squad:sq.id,from:oldIndex,to:sq.routeIndex,x:wp.x,z:wp.z});
    }

    if(sq.routeIndex>=sq.route.length-1&&d<cfg.finalRouteRadius){
      var chosen=chooseObjective(sim,sq);
      if(chosen){
        sq.objective={x:chosen.point.x,z:chosen.point.z};sq.targetObjective=chosen.instance.id;
        var radius=+chosen.instance.def.radius||20,objD=dist(p.x,p.z,chosen.point.x,chosen.point.z);
        if(objD<=radius*cfg.captureCommitRatio)setPhase(sim,sq,'capture','objective '+chosen.instance.id);
        else setPhase(sim,sq,'clear-town','move to '+chosen.instance.id);
        return;
      }
    }

    if(enemy.distance<cfg.contactDistance&&sq.commandRole!=='support')setPhase(sim,sq,'contact','enemy '+enemy.distance.toFixed(1)+'m');
    else if(town&&town.center&&dist(p.x,p.z,town.center.x,town.center.z)<(town.radius||70))setPhase(sim,sq,'clear-town','inside objective area');
    else if(Math.abs(p.z)<cfg.townBoundary)setPhase(sim,sq,'clear-town','inside objective area');
    else setPhase(sim,sq,'approach','route advance');
    sq.objective={x:wp.x,z:wp.z};
  }

  function objectiveValueScore(sim,faction){
    var total=0;(sim._objectives||[]).forEach(function(o){var s=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status(sim,o.id);if(s&&s.owner===faction)total+=(+o.def.value||1);});return total;
  }
  function forceUnits(sim,faction){
    if(root.BattleModules)return root.BattleModules.unitsFor(sim).filter(function(u){return u&&u.faction===faction&&!u.dead&&u.countsForElimination!==false;});
    return (sim._roster[faction]||[]).filter(function(u){return !u.dead;});
  }
  function forceScore(sim,faction){
    var units=forceUnits(sim,faction),score=0;for(var i=0;i<units.length;i++)score+=units[i].scoreValue==null?1:+units[i].scoreValue;return score;
  }
  function declare(sim,winner,reason){
    if(sim.winner)return;sim.winner=winner;sim.winReason=reason;
    telemetry(sim,'objective-victory',{winner:winner,reason:reason});
    console.log('[COMMAND] objective victory '+winner+' reason='+reason);
    if(sim.onWinner)sim.onWinner(winner,sim);
  }

  function updateCommander(sim,town,dt){
    dt=dt||COMMAND_TICK;ensureAssignments(sim,town);
    if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.tick(sim,dt);
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)advanceRoute(sim,squads[i],town);});
    if(root.BattleModules)root.BattleModules.runHook('onCommanderTick',sim,{town:town,dt:dt});

    var snapPolicy=policy(sim,'us'),snapshotSeconds=snapPolicy.decisionSnapshotSeconds||5;
    if(!sim._nextDecisionSnapshot||sim.time>=sim._nextDecisionSnapshot){
      sim._nextDecisionSnapshot=sim.time+snapshotSeconds;
      var counts=sim.objectiveControl&&sim.objectiveControl.counts||{us:sim.objectiveControl&&sim.objectiveControl.us||0,ge:sim.objectiveControl&&sim.objectiveControl.ge||0};
      telemetry(sim,'decision-snapshot',{usAlive:forceUnits(sim,'us').length,geAlive:forceUnits(sim,'ge').length,usObjectives:counts.us||0,geObjectives:counts.ge||0,squads:{us:sim.factions.us.squads.map(function(q){return q.commandPhase;}),ge:sim.factions.ge.squads.map(function(q){return q.commandPhase;})}});
    }
    if(sim.objectiveHold&&sim.objectiveHold.us>=OBJECTIVE_HOLD_WIN)declare(sim,'us','held all objectives');
    else if(sim.objectiveHold&&sim.objectiveHold.ge>=OBJECTIVE_HOLD_WIN)declare(sim,'ge','held all objectives');
  }

  root.SquadAI.updateSquad=function(sq){
    var commanded=sq.route&&sq.route.length,objective=commanded&&sq.objective?{x:sq.objective.x,z:sq.objective.z}:null;
    oldUpdateSquad(sq);
    if(commanded&&objective){
      sq.objective=objective;
      var sim=sq._battleSim,cfg=policy(sim,sq.faction);
      if(sq.state==='engaged'&&sq.commandPhase!=='regroup'&&sq.commandPhase!=='support-hold'){
        var dx=objective.x-sq.rally.x,dz=objective.z-sq.rally.z,len=Math.hypot(dx,dz);if(len>1){sq.rally.x+=dx/len*cfg.engagedRallyAdvance;sq.rally.z+=dz/len*cfg.engagedRallyAdvance;}
      }
    }
  };

  root.SquadAI.updateSoldier=function(soldier,battle){
    oldUpdateSoldier(soldier,battle);
    var sq=soldier.squad;if(!sq||!sq.route||soldier.dead||sq.state==='retreat')return;
    var cfg=policy(battle,sq.faction),p=soldier.root.position;
    if(sq.commandPhase==='corner-check'&&battle.time<sq.commandHoldUntil){
      var wp=sq.route[Math.max(0,sq.routeIndex-1)]||sq.rally,dx=wp.x-p.x,dz=wp.z-p.z,len=Math.hypot(dx,dz)||1,back=soldier.role==='scout'?1.5:(soldier.role==='captain'?3.5:5+soldier.slotIndex*.35);
      soldier.destination={x:wp.x-dx/len*back,z:wp.z-dz/len*back};soldier.prone=false;return;
    }
    if((sq.commandPhase==='approach'||sq.commandPhase==='clear-town'||sq.commandPhase==='capture')&&sq.objective){
      var objD=dist(p.x,p.z,sq.objective.x,sq.objective.z),enemyD=soldier.target?dist(p.x,p.z,soldier.target.root.position.x,soldier.target.root.position.z):Infinity;
      var canPress=soldier.role!=='gunner'&&objD>cfg.pressObjectiveMinDistance&&enemyD>cfg.pressEnemyClearance&&soldier.suppressedUntil<=battle.time;
      if(canPress){soldier.destination=root.SquadAI.formationSlot(sq,soldier,soldier.slotIndex);soldier.prone=false;}
      if(!soldier.target){
        var vx=sq.objective.x-sq.rally.x,vz=sq.objective.z-sq.rally.z,vlen=Math.hypot(vx,vz)||1;
        if(soldier.role==='scout'){soldier.destination.x+=vx/vlen*cfg.scoutLead;soldier.destination.z+=vz/vlen*cfg.scoutLead;}
        else if(soldier.role==='gunner'){soldier.destination.x-=vx/vlen*cfg.gunnerTrail;soldier.destination.z-=vz/vlen*cfg.gunnerTrail;}
      }
    }
  };

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),town=scene.metadata&&scene.metadata.battleTown;
    if(!town){console.warn('[COMMAND] no scenario metadata; hierarchical infantry AI disabled');return sim;}
    if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.attach(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});
    initForce(sim,'us',town);initForce(sim,'ge',town);sim.objectives=sim._objectives||[];sim._commandAccum=0;sim._nextDecisionSnapshot=0;
    if(root.BattleModules)root.BattleModules.runHook('onBattleStart',sim,{town:town});

    var stockCheck=sim._checkWinner.bind(sim);
    sim._checkWinner=function(){
      if(this.winner)return;
      var usUnits=forceUnits(this,'us'),geUnits=forceUnits(this,'ge');
      if(usUnits.length<=0||geUnits.length<=0){
        this.winner=usUnits.length===geUnits.length?'draw':(usUnits.length>geUnits.length?'us':'ge');
        if(this.onWinner)this.onWinner(this.winner,this);return;
      }
      if(this.time>=this.timeLimit){
        var u=objectiveValueScore(this,'us')*12+forceScore(this,'us'),g=objectiveValueScore(this,'ge')*12+forceScore(this,'ge');
        declare(this,u===g?'draw':(u>g?'us':'ge'),'time limit objective score');return;
      }
      /* Keep stock behavior available for any future core rule additions, but only before the time limit. */
      if(this.time<this.timeLimit&&this.factions.us.alive<=0&&this.factions.ge.alive<=0)stockCheck();
    };

    var stockRestart=sim.restart.bind(sim);
    sim.restart=function(){
      stockRestart();
      if(root.BattleObjectiveSystem)root.BattleObjectiveSystem.reset(sim,root.BattleObjectiveSystem.definitionsFromTown(town),{town:town});
      initForce(sim,'us',town);initForce(sim,'ge',town);sim._commandAccum=0;sim._nextDecisionSnapshot=0;
      if(root.BattleModules)root.BattleModules.runHook('onBattleRestart',sim,{town:town});
    };

    scene.onBeforeRenderObservable.add(function(){
      if(sim.paused||sim.winner||sim._trainerStepActive)return;
      var dt=Math.min(.25,Math.max(0,scene.getEngine().getDeltaTime()/1000*sim.timeScale));sim._commandAccum+=dt;
      while(sim._commandAccum>=COMMAND_TICK&&!sim.winner){sim._commandAccum-=COMMAND_TICK;updateCommander(sim,town,COMMAND_TICK);}
    });
    console.log('[COMMAND] v19 policy-driven infantry AI + modular objectives active');
    return sim;
  };

  root.BattleCommanderAI={update:updateCommander,assignSquad:assignSquad,ensureAssignments:ensureAssignments,commandTick:COMMAND_TICK,objectiveHoldWin:OBJECTIVE_HOLD_WIN,policyFor:policy};
})(typeof window!=='undefined'?window:globalThis);

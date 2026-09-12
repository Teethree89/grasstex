/* Hierarchical tactical coordinator for Battle Sim v18.
   Coordinates squads, presses objectives under fire, captures sectors over time, and emits
   concise decision telemetry for post-battle tuning. */
(function(root){
  'use strict';
  root.BATTLE_BUILD='v18';
  console.log('[COMMAND] runtime v18 loaded');
  if(!root.BattleSim||!root.SquadAI)return;

  var oldStart=root.BattleSim.start;
  var oldUpdateSquad=root.SquadAI.updateSquad;
  var oldUpdateSoldier=root.SquadAI.updateSoldier;
  var COMMAND_TICK=.45,CORNER_HOLD=.8,COHESION_RADIUS=34,OBJECTIVE_HOLD_WIN=35,CAPTURE_SECONDS=12;

  function dist(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}
  function aliveMembers(sq){var a=[];for(var i=0;i<sq.members.length;i++)if(!sq.members[i].dead)a.push(sq.members[i]);return a;}
  function avgPos(sq){var a=aliveMembers(sq),x=0,z=0;if(!a.length)return {x:sq.rally.x,z:sq.rally.z};for(var i=0;i<a.length;i++){x+=a[i].root.position.x;z+=a[i].root.position.z;}return {x:x/a.length,z:z/a.length};}
  function maxSpread(sq,p){var a=aliveMembers(sq),m=0;for(var i=0;i<a.length;i++)m=Math.max(m,dist(a[i].root.position.x,a[i].root.position.z,p.x,p.z));return m;}
  function captain(sq){for(var i=0;i<sq.members.length;i++)if(sq.members[i].role==='captain'&&!sq.members[i].dead)return sq.members[i];return null;}
  function enemyFaction(f){return f==='us'?'ge':'us';}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function setPhase(sim,sq,next,why){if(sq.commandPhase===next)return;sq.commandPhase=next;telemetry(sim,'decision-phase',{faction:sq.faction,squad:sq.id,phase:next,why:why||''});}

  function rolePlan(index){var cycle=['left','center','support','center','right'];return cycle[index%cycle.length];}
  function routeFor(faction,role,town,index){
    var base=(town.routes[faction][role]||town.routes[faction].center).map(function(p){return {x:p.x,z:p.z};});
    if(index%5===3)for(var r=0;r<base.length;r++)base[r].x+=(faction==='us'?12:-12);
    return base;
  }
  function assignSquad(sim,sq,town,index){
    var role=rolePlan(index),route=routeFor(sq.faction,role,town,index);
    sq.commandRole=role;sq.route=route;sq.routeIndex=0;sq.commandPhase='approach';sq.commandHoldUntil=0;sq.lastCommandTime=0;sq.objective=route[0];sq._lastLoggedRoute=-1;
    telemetry(sim,'decision-assign',{faction:sq.faction,squad:sq.id,role:role,routePoints:route.length});
  }
  function ensureAssignments(sim,town){
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)if(!squads[i].route)assignSquad(sim,squads[i],town,i);});
  }
  function initForce(sim,faction,town){var squads=sim.factions[faction].squads;for(var i=0;i<squads.length;i++)assignSquad(sim,squads[i],town,i);}

  function nearestEnemyToSquad(sim,sq){
    var p=avgPos(sq),enemy=sim.rosterOf(enemyFaction(sq.faction)),best=null,bd=Infinity;
    for(var i=0;i<enemy.length;i++){var e=enemy[i];if(e.dead)continue;var d=dist(p.x,p.z,e.root.position.x,e.root.position.z);if(d<bd){bd=d;best=e;}}
    return {unit:best,distance:bd};
  }
  function sectorState(sim,id){return sim._objectiveState&&sim._objectiveState[id]||null;}
  function chooseSector(sim,sq,town){
    var p=avgPos(sq),best=null,bestScore=-Infinity;
    for(var i=0;i<town.sectors.length;i++){
      var sec=town.sectors[i],st=sectorState(sim,sec.id),owner=st&&st.owner||'neutral';
      var need=owner===sq.faction?0:(owner==='neutral'?75:110);
      var active=st&&st.active===sq.faction?18:0;
      var score=need+active-dist(p.x,p.z,sec.x,sec.z)*.55;
      if(score>bestScore){bestScore=score;best=sec;}
    }
    if(!best){var order=sq.faction==='us'?town.sectors:town.sectors.slice().reverse();best=order[0];}
    return best;
  }

  function advanceRoute(sim,sq,town){
    if(!sq.route||!sq.route.length)return;
    var p=avgPos(sq),spread=maxSpread(sq,p),enemy=nearestEnemyToSquad(sim,sq),cap=captain(sq),now=sim.time;
    var cohesionLimit=cap?COHESION_RADIUS:26;
    if(spread>cohesionLimit){setPhase(sim,sq,'regroup','spread '+spread.toFixed(1));sq.commandHoldUntil=Math.max(sq.commandHoldUntil,now+.4);sq.objective={x:p.x,z:p.z};return;}

    if(sq.commandRole==='support'){
      var own=sim.factions[sq.faction].squads,assaultCommitted=false;
      for(var a=0;a<own.length;a++)if(own[a]!==sq){var ap=avgPos(own[a]);if(Math.abs(ap.z)<55||own[a].state==='engaged')assaultCommitted=true;}
      if(!assaultCommitted&&sim.time<20&&sq.routeIndex>=1){setPhase(sim,sq,'support-hold','waiting for assault');sq.objective=sq.route[Math.min(1,sq.route.length-1)];return;}
    }

    if(now<sq.commandHoldUntil){sq.objective=sq.route[Math.min(sq.routeIndex,sq.route.length-1)];return;}
    var wp=sq.route[Math.min(sq.routeIndex,sq.route.length-1)],d=dist(p.x,p.z,wp.x,wp.z);
    if(d<8&&sq.routeIndex<sq.route.length-1){
      var oldIndex=sq.routeIndex,inTown=Math.abs(wp.x)<70&&Math.abs(wp.z)<55;
      if(inTown){sq.commandHoldUntil=now+CORNER_HOLD+(cap?0:.35);setPhase(sim,sq,'corner-check','route '+oldIndex);}
      sq.routeIndex++;wp=sq.route[sq.routeIndex];
      telemetry(sim,'decision-route',{faction:sq.faction,squad:sq.id,from:oldIndex,to:sq.routeIndex,x:wp.x,z:wp.z});
    }

    if(sq.routeIndex>=sq.route.length-1&&d<14){
      var sec=chooseSector(sim,sq,town);sq.objective={x:sec.x,z:sec.z};
      if(dist(p.x,p.z,sec.x,sec.z)<=sec.radius*.82)setPhase(sim,sq,'capture','sector '+sec.id);
      else setPhase(sim,sq,'clear-town','move to '+sec.id);
      sq.targetSector=sec.id;
      return;
    }

    if(enemy.distance<28&&sq.commandRole!=='support')setPhase(sim,sq,'contact','enemy '+enemy.distance.toFixed(1)+'m');
    else if(Math.abs(p.z)<58)setPhase(sim,sq,'clear-town','inside village');
    else setPhase(sim,sq,'approach','route advance');
    sq.objective={x:wp.x,z:wp.z};
  }

  function initObjectiveState(sim,town){
    sim._objectiveState={};
    for(var i=0;i<town.sectors.length;i++)sim._objectiveState[town.sectors[i].id]={owner:'neutral',meter:0,active:null,lastActive:null};
    sim.objectiveStats={captures:0,neutralizations:0};
    sim.objectiveControl={us:0,ge:0,sectors:{}};sim.objectiveHold={us:0,ge:0};
  }

  function evaluateObjectives(sim,town){
    var result={us:0,ge:0,sectors:{}};
    for(var s=0;s<town.sectors.length;s++){
      var sector=town.sectors[s],uc=0,gc=0,roster=sim._roster.us.concat(sim._roster.ge);
      for(var i=0;i<roster.length;i++){
        var unit=roster[i];if(unit.dead)continue;
        if(dist(unit.root.position.x,unit.root.position.z,sector.x,sector.z)<=sector.radius){if(unit.faction==='us')uc++;else gc++;}
      }
      var st=sim._objectiveState[sector.id],active=null;
      if(uc>=2&&uc>gc)active='us';else if(gc>=2&&gc>uc)active='ge';
      st.active=active;
      if(active!==st.lastActive){if(active)telemetry(sim,'objective-pressure',{sector:sector.id,faction:active,us:uc,ge:gc,meter:+st.meter.toFixed(2)});st.lastActive=active;}

      var strength=active==='us'?uc-gc:(active==='ge'?gc-uc:0),step=COMMAND_TICK*(1+Math.min(2,Math.max(0,strength-1))*.25);
      if(active==='us')st.meter=Math.min(CAPTURE_SECONDS,st.meter+step);
      else if(active==='ge')st.meter=Math.max(-CAPTURE_SECONDS,st.meter-step);
      else if(st.owner==='neutral')st.meter+=st.meter>0?-Math.min(st.meter,COMMAND_TICK*.2):Math.min(-st.meter,COMMAND_TICK*.2);
      else if(st.owner==='us')st.meter=Math.min(CAPTURE_SECONDS,st.meter+COMMAND_TICK*.08);
      else if(st.owner==='ge')st.meter=Math.max(-CAPTURE_SECONDS,st.meter-COMMAND_TICK*.08);

      var previous=st.owner;
      if(previous==='us'&&st.meter<=0){st.owner='neutral';sim.objectiveStats.neutralizations++;telemetry(sim,'objective-neutralized',{sector:sector.id,by:'ge'});}
      if(previous==='ge'&&st.meter>=0){st.owner='neutral';sim.objectiveStats.neutralizations++;telemetry(sim,'objective-neutralized',{sector:sector.id,by:'us'});}
      if(st.meter>=CAPTURE_SECONDS&&st.owner!=='us'){st.owner='us';sim.objectiveStats.captures++;telemetry(sim,'objective-captured',{sector:sector.id,faction:'us',seconds:CAPTURE_SECONDS});}
      if(st.meter<=-CAPTURE_SECONDS&&st.owner!=='ge'){st.owner='ge';sim.objectiveStats.captures++;telemetry(sim,'objective-captured',{sector:sector.id,faction:'ge',seconds:CAPTURE_SECONDS});}

      if(st.owner==='us')result.us++;else if(st.owner==='ge')result.ge++;
      var pct=Math.round(Math.min(100,Math.abs(st.meter)/CAPTURE_SECONDS*100));
      result.sectors[sector.id]={owner:st.owner,us:uc,ge:gc,active:active,meter:+st.meter.toFixed(2),progress:pct};
    }
    sim.objectiveControl=result;
    if(result.us===town.sectors.length){sim.objectiveHold.us+=COMMAND_TICK;sim.objectiveHold.ge=0;}
    else if(result.ge===town.sectors.length){sim.objectiveHold.ge+=COMMAND_TICK;sim.objectiveHold.us=0;}
    else{sim.objectiveHold.us=0;sim.objectiveHold.ge=0;}
  }

  function declare(sim,winner,reason){
    if(sim.winner)return;sim.winner=winner;sim.winReason=reason;
    telemetry(sim,'objective-victory',{winner:winner,reason:reason});
    console.log('[COMMAND] objective victory '+winner+' reason='+reason);
    if(sim.onWinner)sim.onWinner(winner,sim);
  }

  function updateCommander(sim,town){
    ensureAssignments(sim,town);
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)advanceRoute(sim,squads[i],town);});
    evaluateObjectives(sim,town);
    if(!sim._nextDecisionSnapshot||sim.time>=sim._nextDecisionSnapshot){
      sim._nextDecisionSnapshot=sim.time+5;
      telemetry(sim,'decision-snapshot',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,usObjectives:sim.objectiveControl.us,geObjectives:sim.objectiveControl.ge,squads:{us:sim.factions.us.squads.map(function(q){return q.commandPhase;}),ge:sim.factions.ge.squads.map(function(q){return q.commandPhase;})}});
    }
    if(sim.objectiveHold.us>=OBJECTIVE_HOLD_WIN)declare(sim,'us','held all village sectors');
    else if(sim.objectiveHold.ge>=OBJECTIVE_HOLD_WIN)declare(sim,'ge','held all village sectors');
  }

  root.SquadAI.updateSquad=function(sq){
    var commanded=sq.route&&sq.route.length,objective=commanded&&sq.objective?{x:sq.objective.x,z:sq.objective.z}:null;
    oldUpdateSquad(sq);
    if(commanded&&objective){
      sq.objective=objective;
      if(sq.state==='engaged'&&sq.commandPhase!=='regroup'&&sq.commandPhase!=='support-hold'){
        var dx=objective.x-sq.rally.x,dz=objective.z-sq.rally.z,len=Math.hypot(dx,dz);if(len>1){sq.rally.x+=dx/len*.16;sq.rally.z+=dz/len*.16;}
      }
    }
  };

  root.SquadAI.updateSoldier=function(soldier,battle){
    oldUpdateSoldier(soldier,battle);
    var sq=soldier.squad;if(!sq||!sq.route||soldier.dead||sq.state==='retreat')return;
    var p=soldier.root.position;
    if(sq.commandPhase==='corner-check'&&battle.time<sq.commandHoldUntil){
      var wp=sq.route[Math.max(0,sq.routeIndex-1)]||sq.rally,dx=wp.x-p.x,dz=wp.z-p.z,len=Math.hypot(dx,dz)||1,back=soldier.role==='scout'?1.5:(soldier.role==='captain'?3.5:5+soldier.slotIndex*.35);
      soldier.destination={x:wp.x-dx/len*back,z:wp.z-dz/len*back};soldier.prone=false;return;
    }
    if((sq.commandPhase==='approach'||sq.commandPhase==='clear-town'||sq.commandPhase==='capture')&&sq.objective){
      var objD=dist(p.x,p.z,sq.objective.x,sq.objective.z),enemyD=soldier.target?dist(p.x,p.z,soldier.target.root.position.x,soldier.target.root.position.z):Infinity;
      var canPress=soldier.role!=='gunner'&&objD>7&&enemyD>35&&soldier.suppressedUntil<=battle.time;
      if(canPress){soldier.destination=root.SquadAI.formationSlot(sq,soldier,soldier.slotIndex);soldier.prone=false;}
      if(!soldier.target){
        var vx=sq.objective.x-sq.rally.x,vz=sq.objective.z-sq.rally.z,vlen=Math.hypot(vx,vz)||1;
        if(soldier.role==='scout'){soldier.destination.x+=vx/vlen*4;soldier.destination.z+=vz/vlen*4;}
        else if(soldier.role==='gunner'){soldier.destination.x-=vx/vlen*3;soldier.destination.z-=vz/vlen*3;}
      }
    }
  };

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),town=scene.metadata&&scene.metadata.battleTown;
    if(!town){console.warn('[COMMAND] no town metadata; hierarchical AI disabled');return sim;}
    initObjectiveState(sim,town);initForce(sim,'us',town);initForce(sim,'ge',town);sim.objectives=town.sectors;sim._commandAccum=0;sim._nextDecisionSnapshot=0;

    var stockCheck=sim._checkWinner.bind(sim);
    sim._checkWinner=function(){
      if(this.winner)return;
      if(this.factions.us.alive<=0||this.factions.ge.alive<=0){stockCheck();return;}
      if(this.time>=this.timeLimit){
        var u=(this.objectiveControl.us||0)*12+this.factions.us.alive,g=(this.objectiveControl.ge||0)*12+this.factions.ge.alive;
        declare(this,u===g?'draw':(u>g?'us':'ge'),'time limit objective score');
      }
    };

    var stockRestart=sim.restart.bind(sim);
    sim.restart=function(){stockRestart();initObjectiveState(sim,town);initForce(sim,'us',town);initForce(sim,'ge',town);sim._commandAccum=0;sim._nextDecisionSnapshot=0;};

    scene.onBeforeRenderObservable.add(function(){
      if(sim.paused||sim.winner)return;
      var dt=scene.getEngine().getDeltaTime()/1000*sim.timeScale;sim._commandAccum+=Math.min(.25,Math.max(0,dt));
      if(sim._commandAccum>=COMMAND_TICK){sim._commandAccum-=COMMAND_TICK;updateCommander(sim,town);}
    });
    console.log('[COMMAND] v18 hierarchical AI active; timed capture + pressure advance loaded');
    return sim;
  };

  root.BattleCommanderAI={update:updateCommander,assignSquad:assignSquad,ensureAssignments:ensureAssignments,captureSeconds:CAPTURE_SECONDS};
})(typeof window!=='undefined'?window:globalThis);

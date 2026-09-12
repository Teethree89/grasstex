/* Hierarchical tactical coordinator for Battle Sim v17.
   This is intentionally a game-AI command layer: it coordinates the five existing squads,
   assigns roles/routes, enforces cohesion, pauses at urban corners and adapts after losses.
   Individual fire/LOS/hit logic stays in squad-ai.js. */
(function(root){
  'use strict';
  root.BATTLE_BUILD='v17';
  console.log('[COMMAND] runtime v17 loaded');
  if(!root.BattleSim||!root.SquadAI)return;

  var oldStart=root.BattleSim.start;
  var oldUpdateSquad=root.SquadAI.updateSquad;
  var oldUpdateSoldier=root.SquadAI.updateSoldier;
  var COMMAND_TICK=.45,CORNER_HOLD=1.1,COHESION_RADIUS=24,OBJECTIVE_HOLD_WIN=45;

  function dist(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}
  function aliveMembers(sq){var a=[];for(var i=0;i<sq.members.length;i++)if(!sq.members[i].dead)a.push(sq.members[i]);return a;}
  function avgPos(sq){var a=aliveMembers(sq),x=0,z=0;if(!a.length)return {x:sq.rally.x,z:sq.rally.z};for(var i=0;i<a.length;i++){x+=a[i].root.position.x;z+=a[i].root.position.z;}return {x:x/a.length,z:z/a.length};}
  function maxSpread(sq,p){var a=aliveMembers(sq),m=0;for(var i=0;i<a.length;i++)m=Math.max(m,dist(a[i].root.position.x,a[i].root.position.z,p.x,p.z));return m;}
  function captain(sq){for(var i=0;i<sq.members.length;i++)if(sq.members[i].role==='captain'&&!sq.members[i].dead)return sq.members[i];return null;}
  function enemyFaction(f){return f==='us'?'ge':'us';}

  function rolePlan(index){return index===0?'left':index===1?'center':index===2?'support':index===3?'center':index===4?'right':'center';}

  function initForce(sim,faction,town){
    var squads=sim.factions[faction].squads,routes=town.routes[faction];
    for(var i=0;i<squads.length;i++){
      var sq=squads[i],role=rolePlan(i),route=routes[role].map(function(p){return {x:p.x,z:p.z};});
      if(i===3)for(var r=0;r<route.length;r++)route[r].x+=(faction==='us'?12:-12);
      sq.commandRole=role;sq.route=route;sq.routeIndex=0;sq.commandPhase='approach';sq.commandHoldUntil=0;sq.lastCommandTime=0;sq.objective=route[0];
    }
  }

  function nearestEnemyToSquad(sim,sq){
    var p=avgPos(sq),enemy=sim.rosterOf(enemyFaction(sq.faction)),best=null,bd=Infinity;
    for(var i=0;i<enemy.length;i++){var e=enemy[i];if(e.dead)continue;var d=dist(p.x,p.z,e.root.position.x,e.root.position.z);if(d<bd){bd=d;best=e;}}
    return {unit:best,distance:bd};
  }

  function advanceRoute(sim,sq,town){
    if(!sq.route||!sq.route.length)return;
    var p=avgPos(sq),wp=sq.route[sq.routeIndex],spread=maxSpread(sq,p),enemy=nearestEnemyToSquad(sim,sq),cap=captain(sq),now=sim.time;
    var cohesionLimit=cap?COHESION_RADIUS:18;
    if(spread>cohesionLimit){sq.commandPhase='regroup';sq.commandHoldUntil=Math.max(sq.commandHoldUntil,now+.55);sq.objective={x:p.x,z:p.z};return;}

    if(sq.commandRole==='support'){
      var own=sim.factions[sq.faction].squads,assaultCommitted=false;
      for(var a=0;a<own.length;a++)if(own[a]!==sq){var ap=avgPos(own[a]);if(Math.abs(ap.z)<48||own[a].state==='engaged')assaultCommitted=true;}
      if(!assaultCommitted&&sq.routeIndex>=1){sq.commandPhase='support-hold';sq.objective=sq.route[1];return;}
    }

    if(now<sq.commandHoldUntil){sq.objective={x:wp.x,z:wp.z};return;}
    var d=dist(p.x,p.z,wp.x,wp.z);
    if(d<8&&sq.routeIndex<sq.route.length-1){
      var inTown=Math.abs(wp.x)<70&&Math.abs(wp.z)<55;
      if(inTown){sq.commandHoldUntil=now+CORNER_HOLD+(cap?0:.8);sq.commandPhase='corner-check';}
      sq.routeIndex++;wp=sq.route[sq.routeIndex];
    }
    if(enemy.distance<42&&sq.commandRole!=='support')sq.commandPhase='contact';
    else if(Math.abs(p.z)<55)sq.commandPhase='clear-town';
    else sq.commandPhase='approach';
    sq.objective={x:wp.x,z:wp.z};
  }

  function evaluateObjectives(sim,town){
    var result={us:0,ge:0,sectors:{}};
    for(var s=0;s<town.sectors.length;s++){
      var sector=town.sectors[s],uc=0,gc=0,roster=sim._roster.us.concat(sim._roster.ge);
      for(var i=0;i<roster.length;i++){
        var unit=roster[i];if(unit.dead)continue;
        if(dist(unit.root.position.x,unit.root.position.z,sector.x,sector.z)<=sector.radius){if(unit.faction==='us')uc++;else gc++;}
      }
      var owner='contested';
      if(uc>=2&&uc>gc+1){owner='us';result.us++;}
      else if(gc>=2&&gc>uc+1){owner='ge';result.ge++;}
      result.sectors[sector.id]={owner:owner,us:uc,ge:gc};
    }
    sim.objectiveControl=result;
    if(result.us===town.sectors.length){sim.objectiveHold.us+=COMMAND_TICK;sim.objectiveHold.ge=0;}
    else if(result.ge===town.sectors.length){sim.objectiveHold.ge+=COMMAND_TICK;sim.objectiveHold.us=0;}
    else{sim.objectiveHold.us=0;sim.objectiveHold.ge=0;}
  }

  function declare(sim,winner,reason){
    if(sim.winner)return;sim.winner=winner;sim.winReason=reason;
    console.log('[COMMAND] objective victory '+winner+' reason='+reason);
    if(sim.onWinner)sim.onWinner(winner,sim);
  }

  function updateCommander(sim,town){
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)advanceRoute(sim,squads[i],town);});
    evaluateObjectives(sim,town);
    if(sim.objectiveHold.us>=OBJECTIVE_HOLD_WIN)declare(sim,'us','held all village sectors');
    else if(sim.objectiveHold.ge>=OBJECTIVE_HOLD_WIN)declare(sim,'ge','held all village sectors');
  }

  root.SquadAI.updateSquad=function(sq){
    var commanded=sq.route&&sq.route.length,objective=commanded?{x:sq.objective.x,z:sq.objective.z}:null;
    oldUpdateSquad(sq);if(commanded&&objective)sq.objective=objective;
  };

  root.SquadAI.updateSoldier=function(soldier,battle){
    oldUpdateSoldier(soldier,battle);
    var sq=soldier.squad;if(!sq||!sq.route||soldier.dead||soldier.target)return;
    var p=soldier.root.position;
    if(sq.commandPhase==='corner-check'&&battle.time<sq.commandHoldUntil){
      var wp=sq.route[Math.max(0,sq.routeIndex-1)]||sq.rally;
      var dx=wp.x-p.x,dz=wp.z-p.z,len=Math.hypot(dx,dz)||1,back=soldier.role==='scout'?1.5:(soldier.role==='captain'?4:6+soldier.slotIndex*.45);
      soldier.destination={x:wp.x-dx/len*back,z:wp.z-dz/len*back};soldier.prone=false;
    }
    if((sq.commandPhase==='approach'||sq.commandPhase==='clear-town')&&sq.objective){
      var vx=sq.objective.x-sq.rally.x,vz=sq.objective.z-sq.rally.z,vlen=Math.hypot(vx,vz)||1;
      if(soldier.role==='scout'){soldier.destination.x+=vx/vlen*5;soldier.destination.z+=vz/vlen*5;}
      else if(soldier.role==='gunner'){soldier.destination.x-=vx/vlen*4;soldier.destination.z-=vz/vlen*4;}
    }
  };

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),town=scene.metadata&&scene.metadata.battleTown;
    if(!town){console.warn('[COMMAND] no town metadata; hierarchical AI disabled');return sim;}
    initForce(sim,'us',town);initForce(sim,'ge',town);
    sim.objectives=town.sectors;sim.objectiveControl={us:0,ge:0,sectors:{}};sim.objectiveHold={us:0,ge:0};sim._commandAccum=0;

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
    sim.restart=function(){stockRestart();initForce(sim,'us',town);initForce(sim,'ge',town);sim.objectiveControl={us:0,ge:0,sectors:{}};sim.objectiveHold={us:0,ge:0};sim._commandAccum=0;};

    scene.onBeforeRenderObservable.add(function(){
      if(sim.paused||sim.winner)return;
      var dt=scene.getEngine().getDeltaTime()/1000*sim.timeScale;sim._commandAccum+=Math.min(.25,Math.max(0,dt));
      if(sim._commandAccum>=COMMAND_TICK){sim._commandAccum-=COMMAND_TICK;updateCommander(sim,town);}
    });
    console.log('[COMMAND] v17 hierarchical AI active; village sectors + coordinated routes loaded');
    return sim;
  };

  root.BattleCommanderAI={update:updateCommander};
})(typeof window!=='undefined'?window:globalThis);

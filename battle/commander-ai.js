/* Hierarchical tactical coordinator for Battle Sim v15.
   This is intentionally a game-AI command layer: it coordinates the five existing squads,
   assigns roles/routes, enforces cohesion, pauses at urban corners and adapts after losses.
   Individual fire/LOS/hit logic stays in squad-ai.js. */
(function(root){
  'use strict';
  if(!root.BattleSim||!root.SquadAI)return;

  var oldStart=root.BattleSim.start;
  var oldUpdateSquad=root.SquadAI.updateSquad;
  var oldUpdateSoldier=root.SquadAI.updateSoldier;
  var COMMAND_TICK=.45,CORNER_HOLD=1.1,COHESION_RADIUS=24;

  function dist(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}
  function aliveMembers(sq){var a=[];for(var i=0;i<sq.members.length;i++)if(!sq.members[i].dead)a.push(sq.members[i]);return a;}
  function avgPos(sq){var a=aliveMembers(sq),x=0,z=0;if(!a.length)return {x:sq.rally.x,z:sq.rally.z};for(var i=0;i<a.length;i++){x+=a[i].root.position.x;z+=a[i].root.position.z;}return {x:x/a.length,z:z/a.length};}
  function maxSpread(sq,p){var a=aliveMembers(sq),m=0;for(var i=0;i<a.length;i++)m=Math.max(m,dist(a[i].root.position.x,a[i].root.position.z,p.x,p.z));return m;}
  function captain(sq){for(var i=0;i<sq.members.length;i++)if(sq.members[i].role==='captain'&&!sq.members[i].dead)return sq.members[i];return null;}
  function enemyFaction(f){return f==='us'?'ge':'us';}

  function rolePlan(index){
    // 5 squads: left assault, center assault, support, center reserve/assault, right assault.
    return index===0?'left':index===1?'center':index===2?'support':index===3?'center':index===4?'right':'center';
  }

  function initForce(sim,faction,town){
    var squads=sim.factions[faction].squads,routes=town.routes[faction];
    for(var i=0;i<squads.length;i++){
      var sq=squads[i],role=rolePlan(i),route=routes[role].map(function(p){return {x:p.x,z:p.z};});
      // Second center squad offsets its route slightly so two squads do not occupy one lane.
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
    var p=avgPos(sq),wp=sq.route[sq.routeIndex],spread=maxSpread(sq,p),enemy=nearestEnemyToSquad(sim,sq),cap=captain(sq);
    var now=sim.time;

    // Broken leadership and badly stretched formations produce slower, more cautious movement.
    var cohesionLimit=cap?COHESION_RADIUS:18;
    if(spread>cohesionLimit){sq.commandPhase='regroup';sq.commandHoldUntil=Math.max(sq.commandHoldUntil,now+.55);sq.objective={x:p.x,z:p.z};return;}

    // Support element deliberately holds on the near side until the assault establishes contact
    // or reaches the village edge, then it edges forward rather than charging into the square.
    if(sq.commandRole==='support'){
      var own=sim.factions[sq.faction].squads,assaultCommitted=false;
      for(var a=0;a<own.length;a++)if(own[a]!==sq){var ap=avgPos(own[a]);if(Math.abs(ap.z)<48||own[a].state==='engaged')assaultCommitted=true;}
      if(!assaultCommitted&&sq.routeIndex>=1){sq.commandPhase='support-hold';sq.objective=sq.route[1];return;}
    }

    if(now<sq.commandHoldUntil){sq.objective={x:wp.x,z:wp.z};return;}
    var d=dist(p.x,p.z,wp.x,wp.z);
    if(d<8&&sq.routeIndex<sq.route.length-1){
      // Short deliberate halt at urban route changes: lets the squad bunch up, scan and then move.
      var inTown=Math.abs(wp.x)<70&&Math.abs(wp.z)<55;
      if(inTown){sq.commandHoldUntil=now+CORNER_HOLD+(cap?0:.8);sq.commandPhase='corner-check';}
      sq.routeIndex++;wp=sq.route[sq.routeIndex];
    }
    if(enemy.distance<42&&sq.commandRole!=='support')sq.commandPhase='contact';
    else if(Math.abs(p.z)<55)sq.commandPhase='clear-town';
    else sq.commandPhase='approach';
    sq.objective={x:wp.x,z:wp.z};
  }

  function updateCommander(sim,town){
    ['us','ge'].forEach(function(f){var squads=sim.factions[f].squads;for(var i=0;i<squads.length;i++)advanceRoute(sim,squads[i],town);});
  }

  // Keep the stock casualty/state bookkeeping, but do not let its free-running objective logic
  // overwrite the commander's route. We save/restore the command objective around it.
  root.SquadAI.updateSquad=function(sq){
    var commanded=sq.route&&sq.route.length,objective=commanded?{x:sq.objective.x,z:sq.objective.z}:null;
    oldUpdateSquad(sq);
    if(commanded&&objective)sq.objective=objective;
  };

  root.SquadAI.updateSoldier=function(soldier,battle){
    oldUpdateSoldier(soldier,battle);
    var sq=soldier.squad;if(!sq||!sq.route||soldier.dead||soldier.target)return;
    var p=soldier.root.position;

    // During deliberate corner checks, scouts lead slightly; the rest of the squad stacks back
    // from the waypoint instead of all clipping through the same corner at once.
    if(sq.commandPhase==='corner-check'&&battle.time<sq.commandHoldUntil){
      var wp=sq.route[Math.max(0,sq.routeIndex-1)]||sq.rally;
      var dx=wp.x-p.x,dz=wp.z-p.z,len=Math.hypot(dx,dz)||1,back=soldier.role==='scout'?1.5:(soldier.role==='captain'?4:6+soldier.slotIndex*.45);
      soldier.destination={x:wp.x-dx/len*back,z:wp.z-dz/len*back};
      soldier.prone=false;
    }

    // Scouts stay a little ahead on urban approaches; gunners trail to preserve a support role.
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
    sim.objectives=town.sectors;sim._commandAccum=0;
    scene.onBeforeRenderObservable.add(function(){
      if(sim.paused||sim.winner)return;
      var dt=scene.getEngine().getDeltaTime()/1000*sim.timeScale;sim._commandAccum+=Math.min(.25,Math.max(0,dt));
      if(sim._commandAccum>=COMMAND_TICK){sim._commandAccum-=COMMAND_TICK;updateCommander(sim,town);}
    });
    console.log('[COMMAND] hierarchical AI active; 5 squads/side, town objective plan loaded');
    return sim;
  };

  root.BattleCommanderAI={update:updateCommander};
})(typeof window!=='undefined'?window:globalThis);

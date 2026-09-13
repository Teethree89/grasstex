/* Tactical stability layer.
   Prevents sub-second commander churn from turning squads into a flock of individuals that
   continuously hunt new positions. Squads commit to tactical plans, move as 2-3 man fireteams,
   and soldiers who earn useful cover/posting positions hold them for meaningful time. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI)return;

  var oldUpdateSquad=root.SquadAI.updateSquad;
  var oldUpdateSoldier=root.SquadAI.updateSoldier;

  var ASSAULT_PLAN_SECONDS=26;
  var DEFENSE_PLAN_SECONDS=38;
  var TEAM_ORDER_SECONDS=12;
  var COVER_COMMIT_SECONDS=30;
  var DEFENSE_POST_SECONDS=45;

  var TACTICAL={contact:1,assault:1,flank:1,capture:1,defend:1,hold:1,'support-hold':1};
  var DEFENSIVE={capture:1,defend:1,hold:1,'support-hold':1};
  var EMERGENCY={retreat:1,regroup:1};

  function copyPoint(p){return p?{x:+p.x||0,z:+p.z||0}:null;}
  function dist(a,b){if(!a||!b)return Infinity;return Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0));}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function planSeconds(phase){return DEFENSIVE[phase]?DEFENSE_PLAN_SECONDS:ASSAULT_PLAN_SECONDS;}
  function tacticalSignature(sq){var p=sq.objective||{};return [sq.commandPhase||'',sq.targetObjective||'',Math.round((+p.x||0)/4),Math.round((+p.z||0)/4)].join('|');}

  function clearPlan(sq){sq._stablePlan=null;sq._stablePlanSerial=(sq._stablePlanSerial||0)+1;}
  function commitPlan(sim,sq){
    if(!TACTICAL[sq.commandPhase])return;
    var serial=(sq._stablePlanSerial||0)+1;
    sq._stablePlanSerial=serial;
    sq._stablePlan={
      phase:sq.commandPhase,
      objective:copyPoint(sq.objective),
      targetObjective:sq.targetObjective||null,
      signature:tacticalSignature(sq),
      serial:serial,
      until:sim.time+planSeconds(sq.commandPhase)
    };
    telemetry(sim,'decision-plan-commit',{faction:sq.faction,squad:sq.id,phase:sq.commandPhase,targetObjective:sq.targetObjective||null,seconds:planSeconds(sq.commandPhase)});
  }
  function stabilizePlan(sim,sq){
    if(!sq||!sim)return;
    var phase=sq.commandPhase||'';
    if(sq.state==='retreat'||EMERGENCY[phase]){if(sq._stablePlan)clearPlan(sq);return;}
    var plan=sq._stablePlan;
    if(!plan){if(TACTICAL[phase])commitPlan(sim,sq);return;}
    if(sim.time>=plan.until){clearPlan(sq);if(TACTICAL[phase])commitPlan(sim,sq);return;}

    /* While committed, commander proposals are advisory. Keep the accepted objective/phase until
       its commitment expires. Immediate retreat/regroup above is the escape hatch. */
    var proposed=tacticalSignature(sq);
    if(proposed!==plan.signature){
      sq.commandPhase=plan.phase;
      if(plan.objective)sq.objective=copyPoint(plan.objective);
      sq.targetObjective=plan.targetObjective;
    }else if(plan.objective){
      /* Even same-phase doctrine can recompute a slightly different flank/defense point every tick. */
      sq.objective=copyPoint(plan.objective);
    }
  }

  /* 10-man squad -> command pair + two 3-man maneuver teams + one 2-man team. */
  function teamKeyFor(s){
    var i=+s.slotIndex||0;
    if(i<=1)return'command';
    if(i===2||i===4||i===5)return'alpha';
    if(i===3||i===6||i===7)return'bravo';
    return'charlie';
  }
  function aliveTeamMembers(sq,key){return(sq.members||[]).filter(function(s){return !s.dead&&teamKeyFor(s)===key;}).sort(function(a,b){return(+a.slotIndex||0)-(+b.slotIndex||0);});}
  function desiredTeamAnchor(members){
    var x=0,z=0,n=0;
    for(var i=0;i<members.length;i++){
      var p=members[i].orderDestination||members[i].destination||members[i].root.position;
      if(!p)continue;x+=+p.x||0;z+=+p.z||0;n++;
    }
    return n?{x:x/n,z:z/n}:null;
  }
  function formationForward(sq){
    if(sq._formationForward)return sq._formationForward;
    var a=sq.orderAnchor||sq.rally||{x:0,z:0},g=sq.objective||sq.home||a,dx=g.x-a.x,dz=g.z-a.z,l=Math.hypot(dx,dz)||1;
    return{x:dx/l,z:dz/l};
  }
  function teamSlot(sq,key,s,index,count,anchor){
    var f=formationForward(sq),r={x:-f.z,z:f.x},lat=0,fwd=0;
    if(count===2){lat=index===0?-1.45:1.45;fwd=index===0?.45:-.45;}
    else if(count>=3){if(index===0){lat=0;fwd=1.15;}else if(index===1){lat=-1.7;fwd=-.85;}else{lat=1.7;fwd=-.85;}}
    if(key==='command'&&s.role==='captain'){lat=0;fwd=.5;}
    return{x:anchor.x+r.x*lat+f.x*fwd,z:anchor.z+r.z*lat+f.z*fwd};
  }
  function updateFireteamOrders(sq,battle){
    if(!sq||!battle)return;
    sq._fireteamOrders=sq._fireteamOrders||{};
    ['command','alpha','bravo','charlie'].forEach(function(key){
      var members=aliveTeamMembers(sq,key);if(!members.length)return;
      var desired=desiredTeamAnchor(members);if(!desired)return;
      var current=sq._fireteamOrders[key],urgent=sq.state==='retreat'||EMERGENCY[sq.commandPhase];
      if(!current||urgent||battle.time>=current.until||dist(current.anchor,desired)>20){
        current=sq._fireteamOrders[key]={anchor:copyPoint(desired),until:battle.time+(urgent?0:TEAM_ORDER_SECONDS)};
      }
      for(var i=0;i<members.length;i++){
        var d=teamSlot(sq,key,members[i],i,members.length,current.anchor);
        members[i]._fireteamKey=key;
        members[i]._fireteamDestination=d;
        /* Arrival/cohesion accounting should use the fireteam slot, not the obsolete individual
           formation slot that was averaged to create it. */
        members[i].orderDestination=copyPoint(d);
      }
    });
  }

  function threatSector(s,target){
    if(!s||!target||!target.root)return null;
    var dx=target.root.position.x-s.root.position.x,dz=target.root.position.z-s.root.position.z,a=Math.atan2(dz,dx),n=Math.round((a+Math.PI)/(Math.PI/4))%8;
    return(n+8)%8;
  }
  function sectorDistance(a,b){if(a==null||b==null)return 0;var d=Math.abs(a-b)%8;return Math.min(d,8-d);}
  function defensivePhase(s){return !!(s&&s.squad&&DEFENSIVE[s.squad.commandPhase]);}
  function emergency(s){return !!(s&&s.squad&&(s.squad.state==='retreat'||EMERGENCY[s.squad.commandPhase]));}
  function clearStablePosition(s){s._stableCover=null;s._defensePost=null;}

  function preserveUsefulCover(s,battle){
    if(!s||s.dead||emergency(s)||s._firingStation){clearStablePosition(s);return false;}
    var now=battle.time,sector=threatSector(s,s.target),stable=s._stableCover;

    if(stable){
      var directionBad=s.target&&sectorDistance(stable.sector,sector)>2;
      var canHold=now<stable.until&&!directionBad&&(!!s.target||defensivePhase(s));
      if(canHold){
        s._tacticMode='cover-hold';
        s._tacticCover={x:stable.x,z:stable.z,quality:stable.quality||.7,type:stable.type||'committed-cover'};
        s.crawling=false;
        s.destination={x:stable.x,z:stable.z};
        if(s.suppressedUntil>now&&s.role!=='captain'&&s.role!=='scout'){s.prone=true;s.tacticalCrouch=false;}else{s.prone=false;s.tacticalCrouch=true;}
        return true;
      }
      s._stableCover=null;
    }

    if(s._tacticMode==='cover-hold'){
      var c=s._tacticCover||{},hold=COVER_COMMIT_SECONDS+((+s.slotIndex||0)%4)*2;
      s._stableCover={x:s.root.position.x,z:s.root.position.z,quality:c.quality,type:c.type,sector:sector,until:now+hold,planSerial:s.squad&&s.squad._stablePlanSerial||0};
      s.destination={x:s._stableCover.x,z:s._stableCover.z};
      telemetry(battle,'decision-position-commit',{soldier:s.id,faction:s.faction,squad:s.squad&&s.squad.id,kind:'cover',seconds:hold});
      return true;
    }
    return false;
  }

  function preserveDefensePost(s,battle){
    if(!s||s.dead||emergency(s)||s.target||s._firingStation||!defensivePhase(s)){s._defensePost=null;return false;}
    var now=battle.time,serial=s.squad&&s.squad._stablePlanSerial||0,post=s._defensePost;
    if(post&&post.planSerial===serial&&now<post.until){s.destination={x:post.x,z:post.z};return true;}
    s._defensePost=null;
    var d=s.orderDestination?Math.hypot(s.root.position.x-s.orderDestination.x,s.root.position.z-s.orderDestination.z):Infinity;
    if(d<=2.6){
      s._defensePost={x:s.root.position.x,z:s.root.position.z,until:now+DEFENSE_POST_SECONDS,planSerial:serial};
      s.destination={x:s._defensePost.x,z:s._defensePost.z};
      telemetry(battle,'decision-position-commit',{soldier:s.id,faction:s.faction,squad:s.squad&&s.squad.id,kind:'defense-post',seconds:DEFENSE_POST_SECONDS});
      return true;
    }
    return false;
  }

  root.SquadAI.updateSquad=function(sq,battle){
    /* Apply the commander commitment before the stock squad layer turns intent into movement. */
    if(battle)stabilizePlan(battle,sq);
    oldUpdateSquad(sq,battle);
    if(battle){stabilizePlan(battle,sq);updateFireteamOrders(sq,battle);}
  };

  root.SquadAI.updateSoldier=function(s,battle){
    oldUpdateSoldier(s,battle);
    if(!s||s.dead||!battle)return;
    if(preserveUsefulCover(s,battle))return;
    if(preserveDefensePost(s,battle))return;
    if(!s.target&&!s._tacticMode&&!s._firingStation&&s._fireteamDestination){
      s.destination=copyPoint(s._fireteamDestination);
    }
  };

  function reset(sim){
    ['us','ge'].forEach(function(f){
      var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];
      squads.forEach(function(sq){sq._stablePlan=null;sq._stablePlanSerial=0;sq._fireteamOrders={};(sq.members||[]).forEach(function(s){s._stableCover=null;s._defensePost=null;s._fireteamDestination=null;s._fireteamKey=null;});});
    });
  }

  root.BattleModules.registerSystem('squad-plan-stability',{
    version:'23-stability',
    onBattleStart:function(sim){reset(sim);},
    beforeBattleRestart:function(sim){reset(sim);},
    onCommanderTick:function(sim){['us','ge'].forEach(function(f){var squads=sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)stabilizePlan(sim,squads[i]);});}
  });

  root.BattleSquadStability={
    planSeconds:{assault:ASSAULT_PLAN_SECONDS,defense:DEFENSE_PLAN_SECONDS},
    teamOrderSeconds:TEAM_ORDER_SECONDS,
    coverCommitSeconds:COVER_COMMIT_SECONDS,
    teamKeyFor:teamKeyFor
  };
  console.log('[TACTICS] committed plans + 2-3 man fireteams active; cover hold='+COVER_COMMIT_SECONDS+'s');
})(typeof window!=='undefined'?window:globalThis);
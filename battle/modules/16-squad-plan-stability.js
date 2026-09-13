/* Squad-level stability: committed tactical plans and 2-3 man fireteam slots.

   This module used to also fight engagement.js for control of each soldier's stance, cover point
   and destination. It no longer does. It now only produces INPUTS the engagement pipeline reads:

     - sq.commandPhase / sq.objective are held steady for the length of a plan, so sub-second
       commander churn cannot turn a squad into ten individuals hunting ten new positions.
     - each soldier's orderDestination becomes a fireteam slot rather than a lone formation slot.
     - in a defensive phase an arrived soldier's slot is frozen into a post, so a squad that has
       taken an objective digs in instead of orbiting through it.

   Everything about taking cover, going prone and shooting belongs to engagement.js. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI)return;

  var oldUpdateSquad=root.SquadAI.updateSquad;

  var ASSAULT_PLAN_SECONDS=26;
  var DEFENSE_PLAN_SECONDS=38;
  var TEAM_ORDER_SECONDS=12;
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
  function priorityDefenseRequest(sq){
    var r=sq&&sq._preparedDefenseRequest;
    if(r&&r.objectiveId)return{kind:'prepared-defense',request:r};
    r=sq&&sq._captureZoneDefenseRequest;
    if(r&&r.objectiveId)return{kind:'objective-security',request:r};
    return null;
  }
  /* Force Command accepts objective-security / prepared-defense requests before this module's
     commander-tick hook runs. Once that higher-priority request has become the live `defend`
     intent, the old committed assault plan must be retired rather than restored over it. */
  function supersedeCommittedPlan(sim,sq){
    var plan=sq&&sq._stablePlan,source=priorityDefenseRequest(sq);
    if(!plan||!source||sq.commandPhase!=='defend')return false;
    var target=source.request.objectiveId!=null?String(source.request.objectiveId):null;
    if(plan.phase==='defend'&&String(plan.targetObjective||'')===String(target||''))return false;
    telemetry(sim,'decision-plan-supersede',{
      faction:sq.faction,squad:sq.id,request:source.kind,
      fromPhase:plan.phase,fromTarget:plan.targetObjective||null,
      toPhase:'defend',toTarget:target,remaining:Math.max(0,(+plan.until||0)-sim.time)
    });
    clearPlan(sq);return true;
  }
  function updateRegroupRecovery(sim,sq){
    if(!sq||!sim)return;
    var active=sq.commandPhase==='regroup'&&sq.state!=='retreat';
    if(active){
      if(!sq._regroupRecovery){
        var serial=(sq._regroupRecoverySerial||0)+1;sq._regroupRecoverySerial=serial;
        sq._regroupRecovery={serial:serial,startedAt:sim.time,anchor:copyPoint(sq.orderAnchor||sq.rally||sq.objective),objective:copyPoint(sq.objective)};
        telemetry(sim,'decision-regroup-commit',{faction:sq.faction,squad:sq.id,serial:serial,anchor:copyPoint(sq._regroupRecovery.anchor)});
      }
      return;
    }
    if(sq._regroupRecovery){
      telemetry(sim,'decision-regroup-release',{faction:sq.faction,squad:sq.id,serial:sq._regroupRecovery.serial,duration:+Math.max(0,sim.time-sq._regroupRecovery.startedAt).toFixed(2),reason:sq.state==='retreat'?'retreat':'phase-exit'});
      sq._regroupRecovery=null;
    }
  }
  /* Called before Force Command evaluates a squad. It keeps the accepted plan authoritative for
     its commitment window, so the commander never writes a competing intent only for this module
     to restore it later in the same tick. Retreat/regroup remains the explicit escape hatch. */
  function holdCommittedPlan(sim,sq){
    if(!sq||!sim||sq.state==='retreat'||EMERGENCY[sq.commandPhase])return false;
    var plan=sq._stablePlan;if(!plan)return false;
    if(sim.time>=plan.until){clearPlan(sq);return false;}
    sq.commandPhase=plan.phase;
    if(plan.objective)sq.objective=copyPoint(plan.objective);
    sq.targetObjective=plan.targetObjective;
    return true;
  }
  function stabilizePlan(sim,sq){
    if(!sq||!sim)return;
    updateRegroupRecovery(sim,sq);
    var phase=sq.commandPhase||'';
    if(sq.state==='retreat'||EMERGENCY[phase]){if(sq._stablePlan)clearPlan(sq);return;}
    if(sq._stablePlan&&supersedeCommittedPlan(sim,sq))phase=sq.commandPhase||'';
    var plan=sq._stablePlan;
    if(!plan){if(TACTICAL[phase])commitPlan(sim,sq);return;}
    if(sim.time>=plan.until){clearPlan(sq);if(TACTICAL[phase])commitPlan(sim,sq);return;}

    /* While committed, commander proposals are advisory. Keep the accepted objective/phase until
       its commitment expires. Immediate retreat/regroup above is the escape hatch. */
    holdCommittedPlan(sim,sq);
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
  function desiredTeamAnchor(sq,members){
    var x=0,z=0,n=0;
    for(var i=0;i<members.length;i++){
      /* Average the squad-issued formation slots, never the live positions - averaging positions
         makes the anchor chase the team it is supposed to be leading. */
      var p=root.SquadAI.formationSlot(sq,members[i],members[i].slotIndex);
      if(!p)continue;x+=+p.x||0;z+=+p.z||0;n++;
    }
    return n?{x:x/n,z:z/n}:null;
  }
  function averagePosition(members){
    var x=0,z=0,n=0;
    for(var i=0;i<members.length;i++){var rootNode=members[i]&&members[i].root;if(!rootNode)continue;x+=+rootNode.position.x||0;z+=+rootNode.position.z||0;n++;}
    return n?{x:x/n,z:z/n}:null;
  }
  function intentSignature(sq){
    if(sq.commandPhase==='regroup'&&sq._regroupRecovery)return'regroup|'+sq._regroupRecovery.serial;
    var p=sq.objective||{};return[sq.commandPhase||'',sq.targetObjective||'',Math.round((+p.x||0)/4),Math.round((+p.z||0)/4),sq._stablePlanSerial||0].join('|');
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
  function holdPost(s,battle,serial){
    /* A man already standing on his defensive slot stops being given a new one. */
    var post=s._defensePost;
    if(post&&post.planSerial===serial&&battle.time<post.until)return post;
    if(!s.orderDestination)return null;
    if(Math.hypot(s.root.position.x-s.orderDestination.x,s.root.position.z-s.orderDestination.z)>2.6)return null;
    s._defensePost={x:s.root.position.x,z:s.root.position.z,until:battle.time+DEFENSE_POST_SECONDS,planSerial:serial};
    telemetry(battle,'decision-position-commit',{soldier:s.id,faction:s.faction,squad:s.squad&&s.squad.id,kind:'defense-post',seconds:DEFENSE_POST_SECONDS});
    return s._defensePost;
  }
  function updateFireteamOrders(sq,battle){
    if(!sq||!battle)return;
    sq._fireteamOrders=sq._fireteamOrders||{};
    var defensive=!!DEFENSIVE[sq.commandPhase]&&!sq.inContact,serial=sq._stablePlanSerial||0,regroup=sq.commandPhase==='regroup'&&sq.state!=='retreat';
    ['command','alpha','bravo','charlie'].forEach(function(key){
      var members=aliveTeamMembers(sq,key);if(!members.length)return;
      var desired=desiredTeamAnchor(sq,members);if(!desired)return;
      /* Retreat is physically urgent. Regroup is not: it is a bounded formation recovery and must
         keep one set of slots until cohesion returns instead of refreshing every update. */
      var current=sq._fireteamOrders[key],urgent=sq.state==='retreat',signature=intentSignature(sq),live=averagePosition(members);
      if(!current||urgent||current.signature!==signature){
        current=sq._fireteamOrders[key]={anchor:copyPoint(desired),origin:copyPoint(live),signature:signature,until:battle.time+(urgent?0:TEAM_ORDER_SECONDS),blocked:false};
      }else if(regroup){
        /* Keep the original recovery slot. Sliding/rotating it while the team converges is exactly
           what produced the high-travel/low-progress regroup loops in diagnostics. */
        current.until=battle.time+TEAM_ORDER_SECONDS;
      }else if(battle.time>=current.until||dist(current.anchor,desired)>20){
        var moved=live&&current.origin&&dist(live,current.origin)>=2.5,arrived=live&&dist(live,current.anchor)<=4.5;
        if(moved||arrived){
          current=sq._fireteamOrders[key]={anchor:copyPoint(desired),origin:copyPoint(live),signature:signature,until:battle.time+TEAM_ORDER_SECONDS,blocked:false};
        }else{
          /* Do not keep reissuing a shifted formation slot to a team that has made no progress.
             Retain the last viable order long enough for movement/contact logic to resolve it and
             publish the block once for diagnostics instead of creating a position-seeking loop. */
          current.until=battle.time+TEAM_ORDER_SECONDS;
          if(!current.blocked){current.blocked=true;telemetry(battle,'decision-team-no-progress',{faction:sq.faction,squad:sq.id,team:key,phase:sq.commandPhase||null,targetObjective:sq.targetObjective||null});}
        }
      }
      for(var i=0;i<members.length;i++){
        var s=members[i],d=teamSlot(sq,key,s,i,members.length,current.anchor);
        s._fireteamKey=key;
        if(!defensive)s._defensePost=null;
        /* Prepared Defense supplies a fixed post constraint. Squad Stability remains the only live
           formation writer: during a defensive posture it turns that constraint into this team's
           order, rather than Prepared Defense writing before and after the squad update. */
        var prepared=defensive&&s._preparedDefensePost,post=prepared?null:(defensive?holdPost(s,battle,serial):null);
        s._fireteamDestination=prepared?copyPoint(prepared):(post?{x:post.x,z:post.z}:d);
        /* Arrival/cohesion accounting should use the fireteam slot, not the obsolete individual
           formation slot that was averaged to create it. */
        if(root.BattleMovementResolver)root.BattleMovementResolver.proposeOrder(s,s._fireteamDestination,battle,urgent);
        else s.orderDestination=copyPoint(s._fireteamDestination);
      }
    });
  }

  root.SquadAI.updateSquad=function(sq,battle){
    /* Apply the commander commitment before the stock squad layer turns intent into movement. */
    if(battle)stabilizePlan(battle,sq);
    oldUpdateSquad(sq,battle);
    if(battle){stabilizePlan(battle,sq);updateFireteamOrders(sq,battle);}
  };

  function reset(sim){
    ['us','ge'].forEach(function(f){
      var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];
      squads.forEach(function(sq){sq._stablePlan=null;sq._stablePlanSerial=0;sq._fireteamOrders={};sq._regroupRecovery=null;sq._regroupRecoverySerial=0;(sq.members||[]).forEach(function(s){s._defensePost=null;s._fireteamDestination=null;s._fireteamKey=null;});});
    });
  }

  root.BattleModules.registerSystem('squad-plan-stability',{
    version:'63-regroup-stability',
    onBattleStart:function(sim){reset(sim);},
    beforeBattleRestart:function(sim){reset(sim);},
    onCommanderTick:function(sim){['us','ge'].forEach(function(f){var squads=sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)stabilizePlan(sim,squads[i]);});}
  });

  root.BattleSquadStability={
    planSeconds:{assault:ASSAULT_PLAN_SECONDS,defense:DEFENSE_PLAN_SECONDS},
    teamOrderSeconds:TEAM_ORDER_SECONDS,
    defensePostSeconds:DEFENSE_POST_SECONDS,
    teamKeyFor:teamKeyFor,holdCommittedPlan:holdCommittedPlan,supersedeCommittedPlan:supersedeCommittedPlan
  };
  console.log('[TACTICS] committed plans + bounded regroup recovery + 2-3 man fireteam slots active');
})(typeof window!=='undefined'?window:globalThis);

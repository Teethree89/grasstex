/* Squad-level stability: committed tactical plans and 2-3 man fireteam slots.

   This module used to also fight engagement.js for control of each soldier's stance, cover point
   and destination. It no longer does. It now only produces INPUTS the engagement pipeline reads:

     - sq.commandPhase / sq.objective are held steady for the length of a plan, so sub-second
       commander churn cannot turn a squad into ten individuals hunting ten new positions.
     - each soldier's orderDestination becomes a fireteam slot rather than a lone formation slot.
     - in a defensive phase a soldier's position is frozen into a post, so a squad that has taken
       an objective digs in instead of orbiting through it.

   Posts are the fix for position hunting, and two things about them were wrong.

   They used to be dropped the moment the squad made contact (`DEFENSIVE[phase] && !sq.inContact`),
   which is precisely backwards: being shot at is when you want men to stay in their holes. A post
   now survives contact and is only released when the squad stops defending, retreats or regroups.

   And they used to be "wherever the man was standing when he happened to arrive at a moving
   fireteam slot" - which he often never did, because the slot moved. A post now comes from the
   defender's prepared plan when there is one (defense-plan.js sites and claims them), and
   otherwise from the position engagement.js actually settled on to fight from. Engagement decides
   where a man fights; this module makes that decision stick.

   Everything about taking cover, going prone and shooting belongs to engagement.js. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI)return;

  var oldUpdateSquad=root.SquadAI.updateSquad;

  var ASSAULT_PLAN_SECONDS=26;
  var DEFENSE_PLAN_SECONDS=38;
  var TEAM_ORDER_SECONDS=12;
  /* A post lapses if it is abandoned, and renews for as long as the man is actually standing on
     it, so holding a position costs nothing and walking away from one costs the position. */
  var DEFENSE_POST_SECONDS=45,POST_RENEW_RADIUS=3.2,PLAN_POST_RANGE=90;

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
  function engagementState(s){return root.BattleEngagement?root.BattleEngagement.stateOf(s).state:null;}
  /* One plan per faction: the defender's is the prepared one, the attacker's is whatever his own
     engineers have put up on ground he now holds. Both are claimed the same way. */
  function defensePlan(battle,faction){
    var plans=battle&&battle._defensePlans;
    if(plans&&plans[faction])return plans[faction];
    var single=battle&&battle._defensePlan;
    return single&&single.defender===faction?single:null;
  }

  /* The defender's prepared positions, when this faction has any. A claim is held for as long as
     the man keeps it, so two soldiers never end up in the same hole and a post whose occupant was
     killed is reoccupied rather than left empty. */
  function claimPlannedPost(sq,s,battle){
    var plan=defensePlan(battle,s.faction),api=root.BattleDefensePlan;
    if(!plan||!api||!plan.posts.length)return null;
    if(s._planPost&&api.holdPost(s._planPost,s,battle))return s._planPost;
    return api.claimPost(plan,s,battle,{objectiveId:sq._objectiveDefenseId||sq.targetObjective||null,maxRange:PLAN_POST_RANGE});
  }
  /* No plan, or no post left in it: freeze the position the man is already holding. Arriving at his
     fireteam slot counts, and so does having settled into a firefight - engagement.js has by then
     either found him cover or decided this is where he fights, and re-deciding it every few seconds
     is the churn this is here to stop. */
  function improvisedPost(s,battle,serial){
    var settled=engagementState(s),fighting=settled==='engage'||settled==='pinned'||settled==='station';
    var arrived=s.orderDestination&&
      Math.hypot(s.root.position.x-s.orderDestination.x,s.root.position.z-s.orderDestination.z)<=2.6;
    if(!arrived&&!fighting)return null;
    return{x:s.root.position.x,z:s.root.position.z,facing:null,
      until:battle.time+DEFENSE_POST_SECONDS,planSerial:serial,planned:false,why:fighting?'settled':'arrived'};
  }
  function assignPost(sq,s,battle,serial){
    var post=s._defensePost,px=s.root.position;
    if(post&&post.planSerial===serial&&battle.time<post.until){
      if(Math.hypot(px.x-post.x,px.z-post.z)<=POST_RENEW_RADIUS)post.until=battle.time+DEFENSE_POST_SECONDS;
      return post;
    }
    var planned=claimPlannedPost(sq,s,battle);
    if(planned){
      s._defensePost={x:planned.x,z:planned.z,facing:planned.facing||null,postId:planned.id,
        until:battle.time+DEFENSE_POST_SECONDS,planSerial:serial,planned:true};
      telemetry(battle,'decision-position-commit',{soldier:s.id,faction:s.faction,squad:sq.id,
        kind:'prepared-post',post:planned.id,work:planned.type,objective:planned.objectiveId});
      return s._defensePost;
    }
    var improvised=improvisedPost(s,battle,serial);
    if(!improvised)return null;
    s._defensePost=improvised;
    telemetry(battle,'decision-position-commit',{soldier:s.id,faction:s.faction,squad:sq.id,
      kind:'defense-post',seconds:DEFENSE_POST_SECONDS,why:improvised.why});
    return improvised;
  }
  function releasePost(s){
    s._defensePost=null;
    if(root.BattleDefensePlan)root.BattleDefensePlan.releasePost(s);
  }
  function updateFireteamOrders(sq,battle){
    if(!sq||!battle)return;
    sq._fireteamOrders=sq._fireteamOrders||{};
    /* Contact deliberately does NOT clear the defensive posts. It used to, which meant a squad
       dropped its prepared positions at the exact moment they started mattering. */
    var defensive=!!DEFENSIVE[sq.commandPhase]&&sq.state!=='retreat',serial=sq._stablePlanSerial||0;
    ['command','alpha','bravo','charlie'].forEach(function(key){
      var members=aliveTeamMembers(sq,key);if(!members.length)return;
      var desired=desiredTeamAnchor(sq,members);if(!desired)return;
      var current=sq._fireteamOrders[key],urgent=sq.state==='retreat'||EMERGENCY[sq.commandPhase];
      if(!current||urgent||battle.time>=current.until||dist(current.anchor,desired)>20){
        current=sq._fireteamOrders[key]={anchor:copyPoint(desired),until:battle.time+(urgent?0:TEAM_ORDER_SECONDS)};
      }
      for(var i=0;i<members.length;i++){
        var s=members[i],d=teamSlot(sq,key,s,i,members.length,current.anchor);
        s._fireteamKey=key;
        if(!defensive)releasePost(s);
        var post=defensive?assignPost(sq,s,battle,serial):null;
        s._fireteamDestination=post?{x:post.x,z:post.z}:d;
        /* Arrival/cohesion accounting should use the fireteam slot, not the obsolete individual
           formation slot that was averaged to create it. */
        s.orderDestination=copyPoint(s._fireteamDestination);
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
      squads.forEach(function(sq){sq._stablePlan=null;sq._stablePlanSerial=0;sq._fireteamOrders={};(sq.members||[]).forEach(function(s){releasePost(s);s._fireteamDestination=null;s._fireteamKey=null;});});
    });
  }

  root.BattleModules.registerSystem('squad-plan-stability',{
    version:'30-posts',
    onBattleStart:function(sim){reset(sim);},
    beforeBattleRestart:function(sim){reset(sim);},
    onCommanderTick:function(sim){['us','ge'].forEach(function(f){var squads=sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)stabilizePlan(sim,squads[i]);});}
  });

  root.BattleSquadStability={
    planSeconds:{assault:ASSAULT_PLAN_SECONDS,defense:DEFENSE_PLAN_SECONDS},
    teamOrderSeconds:TEAM_ORDER_SECONDS,
    defensePostSeconds:DEFENSE_POST_SECONDS,
    postRenewRadius:POST_RENEW_RADIUS,
    teamKeyFor:teamKeyFor,assignPost:assignPost,releasePost:releasePost
  };
  console.log('[TACTICS] committed plans, fireteam slots and posts that survive contact');
})(typeof window!=='undefined'?window:globalThis);

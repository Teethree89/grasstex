from pathlib import Path

# Physical Navigation: choose a legal stand point for a blocked terrain-blind formation intent
# without turning it into a permanent "stop on the near hedge face" order.
p=Path('battle/modules/39-navigation-physicality-debug.js')
s=p.read_text()

old="""/* Formation/cover orders can land inside a mesh or its clearance buffer. Settle at a nearby
   legal stand point instead of repeatedly circling an unreachable point. Keep the resolved
   destination intact; only navigation owns this bounded endpoint adjustment. Building walls
   still gate the adjustment so a room/window order cannot jump to the other side of a wall. */
function standGoal(sim,soldier,start,dest){
  var shapes=routeFootprints(sim,dest,dest,soldier);
  if(edgeClear(sim,dest,dest,shapes,ROUTE_MARGIN))return dest;
  var radii=[.5,1,1.5,2,2.5,3,4,6],best=null;
  for(var ri=0;ri<radii.length;ri++){
    for(var i=0;i<16;i++){
      var a=i*Math.PI/8,p={x:dest.x+Math.cos(a)*radii[ri],z:dest.z+Math.sin(a)*radii[ri],kind:'stand-goal'};
      if(!baseMovementClear(dest,p)||!edgeClear(sim,p,p,shapes,ROUTE_MARGIN))continue;
      var score=dist(start,p);if(!best||score<best.score)best={point:p,score:score};
    }
    if(best)return best.point;
  }
  return dest;
}
"""
new="""/* Formation/cover orders can land inside a mesh or its clearance buffer. Physical execution
   owns the legal stand point, but it must preserve the *direction* of the command intent. The old
   resolver projected every blocked formation point back toward the soldier, permanently turning a
   terrain-blind slot in a hedge into a 'stand on this near hedge face' order. Prefer an equally
   close legal point on the command-progress side instead, then let normal pathfinding route around
   the obstacle. Building walls still gate the adjustment so a room/window order cannot jump sides. */
function endpointForward(soldier,start,dest){
  var sq=soldier&&soldier.squad,anchor=sq&&(sq.orderAnchor||sq.rally),goal=sq&&(sq.state==='retreat'?sq.home:(sq.objective||sq.home));
  var dx=goal&&anchor?(+goal.x||0)-(+anchor.x||0):dest.x-start.x,dz=goal&&anchor?(+goal.z||0)-(+anchor.z||0):dest.z-start.z,len=Math.hypot(dx,dz);
  if(len<.1){dx=dest.x-start.x;dz=dest.z-start.z;len=Math.hypot(dx,dz);}
  return{x:dx/(len||1),z:dz/(len||1)};
}
function standGoal(sim,soldier,start,dest){
  var shapes=routeFootprints(sim,dest,dest,soldier);
  if(edgeClear(sim,dest,dest,shapes,ROUTE_MARGIN))return dest;
  var f=endpointForward(soldier,start,dest),radii=[.5,1,1.5,2,2.5,3,4,6],best=null;
  for(var ri=0;ri<radii.length;ri++){
    for(var i=0;i<16;i++){
      var a=i*Math.PI/8,p={x:dest.x+Math.cos(a)*radii[ri],z:dest.z+Math.sin(a)*radii[ri],kind:'stand-goal'};
      if(!baseMovementClear(dest,p)||!edgeClear(sim,p,p,shapes,ROUTE_MARGIN))continue;
      var ox=p.x-dest.x,oz=p.z-dest.z,progress=ox*f.x+oz*f.z;
      /* Distance keeps the adjustment local; forward projection breaks the near/far tie in favor
         of continuing the Captain's movement intent. A tiny start-distance term is deterministic
         only and cannot overpower the command-side preference. */
      var score=dist(dest,p)-progress*.65+dist(start,p)*.002;
      if(!best||score<best.score)best={point:p,score:score};
    }
  }
  return best?best.point:dest;
}
"""
if old not in s: raise SystemExit('expected standGoal block not found')
s=s.replace(old,new,1)

old_export="""  footprints:function(sim){return staticFootprints(sim||currentSim()).slice();},shapeHit:shapeHit,shapeContains:shapeContains,routeNodes:routeNodes,
  planIngressPath:function(sim,soldier,start,end){return planComplete(sim,start,end,soldier,true);},
"""
new_export="""  footprints:function(sim){return staticFootprints(sim||currentSim()).slice();},shapeHit:shapeHit,shapeContains:shapeContains,routeNodes:routeNodes,
  resolveStandGoal:function(sim,soldier,end){sim=sim||currentSim();var dest=point(end);if(!sim||!dest)return dest;var start=point(soldier&&soldier.root&&soldier.root.position)||dest;return standGoal(sim,soldier,start,dest);},
  planIngressPath:function(sim,soldier,start,end){return planComplete(sim,start,end,soldier,true);},
"""
if old_export not in s: raise SystemExit('expected physicality export block not found')
s=s.replace(old_export,new_export,1)
p.write_text(s)

# Movement Resolver keeps Meso's raw formation slot as intentPoint, but delegates the terrain-legal
# endpoint to Physical Navigation. Micro combat goals retain the conservative existing projection.
p=Path('battle/movement-resolver.js')
s=p.read_text()

old_metrics="""  function metrics(b){return b._movementGoalStats||(b._movementGoalStats={requests:0,actualChanges:0,equivalentRequestsIgnored:0,hysteresisRetains:0,lowerPriorityRejected:0,emergencyOverrides:0,formationShadowsIgnored:0,goalLegalizations:0,tacticalWaypointBacktracks:0,blockedGoalFallbacks:0,illegalGoalsUnresolved:0,overridesByPriority:{},bySource:{}});}"""
new_metrics="""  function metrics(b){return b._movementGoalStats||(b._movementGoalStats={requests:0,actualChanges:0,equivalentRequestsIgnored:0,hysteresisRetains:0,lowerPriorityRejected:0,emergencyOverrides:0,formationShadowsIgnored:0,goalLegalizations:0,formationEndpointResolutions:0,tacticalWaypointBacktracks:0,blockedGoalFallbacks:0,illegalGoalsUnresolved:0,overridesByPriority:{},bySource:{}});}"""
if old_metrics not in s: raise SystemExit('expected movement metrics block not found')
s=s.replace(old_metrics,new_metrics,1)

old_legal="""  function legalizeGoal(soldier,battle,raw,kind,source){
    var p=point(raw);if(!p||!battle||PRECISE_GOALS[kind])return p;
    var cache=soldier&&soldier._movementLegalGoalCache;
    if(cache&&cache.kind===kind&&distance(cache.raw,p)<=ORDER_WRITE_EPS)return{x:cache.point.x,z:cache.point.z};
    var out=projectBlockedPoint(soldier,battle,p,'goalLegalizations',source);
    if(soldier)soldier._movementLegalGoalCache={kind:kind,raw:{x:p.x,z:p.z},point:{x:out.x,z:out.z}};
    return out;
  }
"""
new_legal="""  function legalizeGoal(soldier,battle,raw,kind,source){
    var p=point(raw);if(!p||!battle||PRECISE_GOALS[kind])return p;
    var P=root.BattleNavigationPhysicality,out;
    /* Formation intent is Meso-owned and terrain-blind. Do not collapse it onto the soldier's
       current side of a hedge. Physical Navigation resolves a route-margin-clear endpoint while
       intentPoint keeps the Captain's original slot for ownership/provenance. */
    if(kind==='formation'&&P&&typeof P.resolveStandGoal==='function'){
      out=P.resolveStandGoal(battle,soldier,p);
      if(out&&distance(out,p)>ORDER_WRITE_EPS){
        count(battle,'goalLegalizations',source);count(battle,'formationEndpointResolutions',source);
        if(soldier)soldier._movementEndpointResolution={kind:'formation',intent:{x:p.x,z:p.z},point:{x:out.x,z:out.z},at:now(battle)};
      }else if(soldier)delete soldier._movementEndpointResolution;
      var N=root.BattleNavigation;
      if(out&&(!N||typeof N.movementClear!=='function'||N.movementClear(out,out)))return{x:out.x,z:out.z};
      /* No bounded stand point was available. Retain the old conservative safety fallback rather
         than ever publishing a body-illegal endpoint. */
      return projectBlockedPoint(soldier,battle,p,'goalLegalizations',source);
    }
    var cache=soldier&&soldier._movementLegalGoalCache;
    if(cache&&cache.kind===kind&&distance(cache.raw,p)<=ORDER_WRITE_EPS)return{x:cache.point.x,z:cache.point.z};
    out=projectBlockedPoint(soldier,battle,p,'goalLegalizations',source);
    if(soldier)soldier._movementLegalGoalCache={kind:kind,raw:{x:p.x,z:p.z},point:{x:out.x,z:out.z}};
    return out;
  }
"""
if old_legal not in s: raise SystemExit('expected legalizeGoal block not found')
s=s.replace(old_legal,new_legal,1)

old_reset="""  function resetSoldier(soldier){if(soldier){delete soldier._movementResolver;delete soldier._movementTacticalReason;delete soldier._tacticalRoute;delete soldier._movementLegalGoalCache;}}"""
new_reset="""  function resetSoldier(soldier){if(soldier){delete soldier._movementResolver;delete soldier._movementTacticalReason;delete soldier._tacticalRoute;delete soldier._movementLegalGoalCache;delete soldier._movementEndpointResolution;}}"""
if old_reset not in s: raise SystemExit('expected resetSoldier block not found')
s=s.replace(old_reset,new_reset,1)
p.write_text(s)

# Deterministic end-to-end regression: a formation slot inside a transverse hedge remains the
# Captain's raw intent, resolves to a legal endpoint on the command-progress side, and is actually
# reached without crossing the hedge footprint.
p=Path('tools/ai-sim-harness/objective-nav-check.js')
s=p.read_text()
anchor="""  check('the resolver accepts a sub-metre adjustment to a window station',close.destination.x===station.x&&close.destination.z===station.z);

  const aimWorld=world([]),aim={root:{position:{x:0,z:0},rotation:{y:0}},destination:{x:0,z:0},speed:2.9,fireCooldown:0,_faceHint:{x:Math.sin(.02)*20,z:Math.cos(.02)*20}};
"""
insert="""  check('the resolver accepts a sub-metre adjustment to a window station',close.destination.x===station.x&&close.destination.z===station.z);

  const crossingWorld=world([hedge('crossing-hedge',0,0,8,.8)]),crossingSquad={state:'advance',commandPhase:'approach',orderAnchor:{x:0,z:-10},rally:{x:0,z:-10},objective:{x:0,z:30},members:[]};
  const crossing={id:'crossing-man',slotIndex:4,root:{position:{x:0,z:-12},rotation:{y:0}},destination:{x:0,z:-12},orderDestination:null,_fireteamDestination:{x:0,z:0},squad:crossingSquad,speed:2.9,moveSpeed:0,fireCooldown:0};crossingSquad.members=[crossing];
  r.BattleMovementResolver.proposeOrder(crossing,crossing._fireteamDestination,crossingWorld,false);r.BattleMovementResolver.resolve(crossing,crossingWorld);
  check('a formation slot inside a transverse hedge resolves on the command-progress side',crossing.orderDestination.z>1.5,JSON.stringify(crossing.orderDestination));
  check('physical endpoint resolution preserves the Captain fireteam intent',crossing._fireteamDestination.x===0&&crossing._fireteamDestination.z===0&&crossing._movementResolver.order.intentPoint.z===0);
  check('the resolved formation endpoint itself has route-margin clearance',!P.shapeContains(crossing.orderDestination,crossingWorld.obstacles.__physicalFootprints[0],P.routeMargin),JSON.stringify(crossing.orderDestination));
  let crossingIllegal=0;
  for(let i=0;i<500&&Math.hypot(crossing.root.position.x-crossing.orderDestination.x,crossing.root.position.z-crossing.orderDestination.z)>.7;i++){
    crossingWorld.time+=.15;r.BattleMovementResolver.resolve(crossing,crossingWorld);const before={x:crossing.root.position.x,z:crossing.root.position.z};r.stepMovementProbe(crossingWorld,crossing,.15);
    if(Math.hypot(before.x-crossing.root.position.x,before.z-crossing.root.position.z)>1e-8&&!N.movementClear(before,crossing.root.position))crossingIllegal++;
  }
  check('a blocked formation intent routes around the hedge instead of parking on its near face',crossing.root.position.z>1.0&&Math.hypot(crossing.root.position.x-crossing.orderDestination.x,crossing.root.position.z-crossing.orderDestination.z)<=.7,JSON.stringify(crossing.root.position));
  check('hedge-crossing endpoint recovery never violates body clearance',crossingIllegal===0,'illegal steps='+crossingIllegal);

  const aimWorld=world([]),aim={root:{position:{x:0,z:0},rotation:{y:0}},destination:{x:0,z:0},speed:2.9,fireCooldown:0,_faceHint:{x:Math.sin(.02)*20,z:Math.cos(.02)*20}};
"""
if anchor not in s: raise SystemExit('expected objective-nav insertion point not found')
s=s.replace(anchor,insert,1)
p.write_text(s)

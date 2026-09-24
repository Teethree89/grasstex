/* The one Battle diagnostics exporter.
   Builds every diagnostics JSON on demand - the full session dump (win/end banner button), and the
   Loop Watch / Order Trace / combined exports behind the AI Graph buttons (38-ai-diagnostics-export.js
   is only those buttons) - without changing battle behavior. Each squad record carries its derived
   analysis (spread vs cohesion limit, route progress, fireteam order progress, movement wins); the full
   dump adds loop alerts enriched with order provenance, provenance events and conflicts, writer-conflict
   metrics, coordination health, resolver summary and live leases. Nothing runs until an export. */
(function(root){
'use strict';
if(root.BattleDiagnosticsExport)return;

var activeSim=null;

function finite(v){return typeof v==='number'&&isFinite(v)?v:null;}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function safePlain(value,depth,seen){
  depth=depth==null?7:depth;seen=seen||[];
  if(value==null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return isFinite(value)?value:null;
  if(typeof value==='function'||depth<=0)return undefined;
  if(seen.indexOf(value)>=0)return '[circular]';
  if(Array.isArray(value)){
    seen.push(value);var a=[];
    for(var i=0;i<value.length;i++){var av=safePlain(value[i],depth-1,seen);if(av!==undefined)a.push(av);}
    seen.pop();return a;
  }
  if(typeof value==='object'){
    /* Rendering objects are enormous and circular. Diagnostics records their gameplay-facing state
       elsewhere, so do not serialize Babylon scene/mesh/material internals by accident. */
    if(value.getClassName||value.getScene||value._scene||value._engine)return '[render-object]';
    seen.push(value);var out={};
    Object.keys(value).forEach(function(k){
      if(k==='scene'||k==='root'||k==='mesh'||k==='socket'||k==='rig'||k==='animationBinding'||k==='poseRoot'||k==='weaponSocket')return;
      var v=safePlain(value[k],depth-1,seen);if(v!==undefined)out[k]=v;
    });
    seen.pop();return out;
  }
  return String(value);
}
/* ---- squad analysis and AI sections (formerly 38-ai-diagnostics-export.js) ---- */
function clone(v){
  if(v==null)return v;
  try{return JSON.parse(JSON.stringify(v));}catch(_){return null;}
}
function distance(a,b){return a&&b?Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0)):null;}
function rounded(v){return v==null||!isFinite(+v)?null:+(+v).toFixed(2);}
function defenseRequest(sq){var r=sq&&sq._captureZoneDefenseRequest;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),point:point(r.point),requestedAt:isFinite(+r.requestedAt)?+r.requestedAt:null,reason:r.reason||null}:null;}
function preparedDefenseRequest(sq){var r=sq&&sq._preparedDefenseRequest;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),point:point(r.point),requestedAt:isFinite(+r.requestedAt)?+r.requestedAt:null,reason:r.reason||null}:null;}
function objectiveRecovery(sq){var r=sq&&sq._objectiveRecovery;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),reason:r.reason||null,at:isFinite(+r.at)?+r.at:null}:null;}
function simNow(sim){return sim&&isFinite(+sim.time)?+sim.time:0;}
function aliveMembers(sq){return(sq&&sq.members||[]).filter(function(s){return s&&!s.dead&&s.root;});}
function squadPosition(sq){
  var m=aliveMembers(sq),x=0,z=0;if(!m.length)return null;
  for(var i=0;i<m.length;i++){x+=+m[i].root.position.x||0;z+=+m[i].root.position.z||0;}
  return{x:x/m.length,z:z/m.length};
}
function squadSpread(sq,p){
  p=p||squadPosition(sq);if(!p)return null;var m=aliveMembers(sq),best=0;
  for(var i=0;i<m.length;i++)best=Math.max(best,Math.hypot((+m[i].root.position.x||0)-p.x,(+m[i].root.position.z||0)-p.z));
  return best;
}
function leaderAlive(sq){return!!(root.SquadAI&&root.SquadAI.leaderOf(sq));}
function cohesionLimit(sim,sq){
  try{
    var cfg=root.BattleCommanderAI&&root.BattleCommanderAI.policyFor?root.BattleCommanderAI.policyFor(sim,sq.faction):null;
    if(!cfg)return null;return leaderAlive(sq)?+cfg.cohesionRadius:+cfg.captainlessCohesion;
  }catch(_){return null;}
}
function routeState(sq,pos){
  var route=sq&&sq.route||[],raw=sq&&isFinite(+sq.routeIndex)?+sq.routeIndex:0,index=Math.max(0,Math.min(route.length-1,raw)),waypoint=route.length?point(route[index]):null,finalWaypoint=route.length?point(route[route.length-1]):null;
  return{index:route.length?index:null,length:route.length,atRouteEnd:!!(route.length&&index>=route.length-1),waypoint:waypoint,finalWaypoint:finalWaypoint,distanceToWaypoint:rounded(distance(pos,waypoint)),distanceToFinal:rounded(distance(pos,finalWaypoint))};
}
function objectiveInstance(sim,id){
  if(id==null)return null;
  try{if(root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get){var o=root.BattleObjectiveSystem.get(sim,id);if(o)return o;}}catch(_){}
  var list=sim&&sim._objectives||[];for(var i=0;i<list.length;i++)if(String(list[i].id)===String(id))return list[i];return null;
}
function objectiveTargetState(sim,sq,pos){
  if(!sq||sq.targetObjective==null)return null;var obj=objectiveInstance(sim,sq.targetObjective);if(!obj)return{id:String(sq.targetObjective),missing:true};
  var def=obj.def||{},p=point(def),radius=isFinite(+def.radius)?+def.radius:null,st=null;
  try{st=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status?root.BattleObjectiveSystem.status(sim,obj.id):obj.state||null;}catch(_){st=obj.state||null;}
  var d=distance(pos,p);
  return{id:String(obj.id),point:p,radius:radius,distance:rounded(d),insideRadius:d!=null&&radius!=null?d<=radius:null,owner:st&&st.owner||null,active:st&&st.active||null,phase:st&&st.phase||null,progress:st&&isFinite(+st.progress)?+st.progress:null};
}
function planUntil(sq){var L=root.BattleLeases,u=L?L.until(sq,'tactical-plan'):0;return isFinite(u)&&u>0?u:null;}
function stablePlanState(sq,sim){
  var p=sq&&sq._stablePlan;if(!p)return null;var t=simNow(sim);
  return{phase:p.phase||null,targetObjective:p.targetObjective!=null?String(p.targetObjective):null,objective:point(p.objective),signature:p.signature||null,serial:isFinite(+p.serial)?+p.serial:null,until:planUntil(sq),remaining:planUntil(sq)!=null?rounded(Math.max(0,planUntil(sq)-t)):null};
}
function regroupRecoveryState(sq,sim){
  var r=sq&&sq._regroupRecovery;if(!r)return null;var t=simNow(sim);
  return{serial:isFinite(+r.serial)?+r.serial:null,startedAt:isFinite(+r.startedAt)?+r.startedAt:null,elapsed:isFinite(+r.startedAt)?rounded(Math.max(0,t-r.startedAt)):null,anchor:point(r.anchor),objective:point(r.objective)};
}
function teamKeyFor(s){
  try{if(root.BattleSquadStability&&root.BattleSquadStability.teamKeyFor)return root.BattleSquadStability.teamKeyFor(s);}catch(_){}
  return s&&s._fireteamKey||null;
}
function teamPosition(sq,key){
  var m=aliveMembers(sq),x=0,z=0,n=0;for(var i=0;i<m.length;i++)if(teamKeyFor(m[i])===key){x+=+m[i].root.position.x||0;z+=+m[i].root.position.z||0;n++;}
  return n?{x:x/n,z:z/n}:null;
}
function fireteamOrdersState(sq,sim){
  var orders=sq&&sq._fireteamOrders||{},keys=Object.keys(orders),out={},t=simNow(sim);
  for(var i=0;i<keys.length;i++){
    var key=keys[i],o=orders[key];if(!o)continue;var live=teamPosition(sq,key),anchor=point(o.anchor),origin=point(o.origin);
    out[key]={anchor:anchor,origin:origin,live:live,signature:o.signature||null,until:isFinite(+o.until)?+o.until:null,remaining:isFinite(+o.until)?rounded(Math.max(0,+o.until-t)):null,blocked:!!o.blocked,progressFromOrigin:rounded(distance(live,origin)),distanceToAnchor:rounded(distance(live,anchor))};
  }
  return out;
}
function movementState(sq){
  var out={orders:0,combat:0,changes:0,orderWins:0,combatWins:0,byKind:{}},m=aliveMembers(sq);
  for(var i=0;i<m.length;i++){
    var st=m[i]._movementResolver,last=st&&st.last;if(!st)continue;out.changes+=st.changes||0;out.orderWins+=st.orderWins||0;out.combatWins+=st.combatWins||0;
    if(!last)continue;if(last.owner==='engagement')out.combat++;else out.orders++;out.byKind[last.kind]=(out.byKind[last.kind]||0)+1;
  }
  return out;
}
function squadAnalysis(sim,sq){
  var pos=squadPosition(sq),spread=squadSpread(sq,pos),limit=cohesionLimit(sim,sq);
  return{
    position:pos,orderAnchor:point(sq.orderAnchor),commandPointDistance:rounded(distance(pos,point(sq.objective))),targetObjectiveState:objectiveTargetState(sim,sq,pos),
    distanceToRally:rounded(distance(pos,point(sq.rally))),distanceToOrderAnchor:rounded(distance(pos,point(sq.orderAnchor))),
    spread:rounded(spread),cohesionLimit:rounded(limit),overCohesionLimit:spread!=null&&limit!=null?spread>limit:null,lastDoctrineRule:sq._lastDoctrineRule||null,
    routeState:routeState(sq,pos),stablePlan:stablePlanState(sq,sim),regroupRecovery:regroupRecoveryState(sq,sim),fireteamOrders:fireteamOrdersState(sq,sim),movement:movementState(sq),
    objectiveRecovery:objectiveRecovery(sq),objectiveDefenseRequest:defenseRequest(sq),preparedDefenseRequest:preparedDefenseRequest(sq),
    strategicDefenseObjective:sq._strategicDefenseObjective!=null?String(sq._strategicDefenseObjective):null
  };
}
function policySnapshot(){
  try{return root.BattleAIPolicy&&root.BattleAIPolicy.get?clone(root.BattleAIPolicy.get()):null;}catch(_){return null;}
}
function loopAlerts(sim){
  try{return root.BattleAILoopWatch&&root.BattleAILoopWatch.alerts?root.BattleAILoopWatch.alerts(sim)||[]:[];}catch(_){return[];}
}
function orderEvents(sim){
  try{return root.BattleOrderProvenance&&root.BattleOrderProvenance.events?root.BattleOrderProvenance.events(sim)||[]:[];}catch(_){return[];}
}
function orderConflicts(sim){
  try{return root.BattleOrderProvenance&&root.BattleOrderProvenance.conflicts?root.BattleOrderProvenance.conflicts(sim)||[]:[];}catch(_){return[];}
}
function coordinationHealth(sim){
  try{return root.BattleAICoordinationHealth&&root.BattleAICoordinationHealth.summary?clone(root.BattleAICoordinationHealth.summary(sim)):null;}catch(_){return null;}
}
function sameId(a,b){return a!=null&&b!=null&&String(a)===String(b);}
function matchesAlert(item,alert){
  if(!item||!alert)return false;
  var squad=alert.squadId!=null?alert.squadId:alert.squad,soldier=alert.soldierId!=null?alert.soldierId:alert.soldier;
  if(alert.faction&&String(alert.faction).toLowerCase()!==String(item.faction||'').toLowerCase())return false;
  if(squad!=null&&!sameId(squad,item.squad))return false;
  if(soldier!=null&&!sameId(soldier,item.soldier))return false;
  return !!(alert.faction||squad!=null||soldier!=null);
}
function conflictMetrics(conflicts){
  var byField={},bySquad={},byKind={},strategic=0,strategicFields={commandPhase:1,targetObjective:1,objective:1,orderAnchor:1,rally:1};
  (conflicts||[]).forEach(function(c){var f=c.field||'unknown',k=c.kind||'unknown',s=(c.faction||'?')+'/'+(c.squad||'?');byField[f]=(byField[f]||0)+1;byKind[k]=(byKind[k]||0)+1;bySquad[s]=(bySquad[s]||0)+1;if(strategicFields[f])strategic++;});
  return{total:(conflicts||[]).length,strategic:strategic,byKind:byKind,byField:byField,bySquad:bySquad};
}
function tacticalMetrics(sim,conflicts){
  var out={squads:0,regrouping:[],retreating:[],targetless:[],activeStablePlans:[],blockedFireteams:[],activeDefenseRequests:[],writerConflicts:conflictMetrics(conflicts)};
  ['us','ge'].forEach(function(f){var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){
    var sq=squads[i],id=f+'/'+sq.id;out.squads++;
    if(sq.commandPhase==='regroup')out.regrouping.push(id);if(sq.state==='retreat')out.retreating.push(id);
    if(sq.targetObjective==null&&sq.commandRole!=='support'&&sq.commandRole!=='reserve'&&sq.commandRole!=='garrison')out.targetless.push(id);
    if(sq._stablePlan)out.activeStablePlans.push({squad:id,phase:sq._stablePlan.phase||null,targetObjective:sq._stablePlan.targetObjective||null,remaining:planUntil(sq)!=null?rounded(Math.max(0,planUntil(sq)-simNow(sim))):null});
    var orders=sq._fireteamOrders||{};Object.keys(orders).forEach(function(key){if(orders[key]&&orders[key].blocked)out.blockedFireteams.push(id+'/'+key);});
    if(sq._captureZoneDefenseRequest||sq._preparedDefenseRequest)out.activeDefenseRequests.push({squad:id,objectiveSecurity:!!sq._captureZoneDefenseRequest,preparedDefense:!!sq._preparedDefenseRequest});
  }});
  out.blockedFireteamCount=out.blockedFireteams.length;out.stablePlanCount=out.activeStablePlans.length;out.targetlessCount=out.targetless.length;out.regroupCount=out.regrouping.length;return out;
}
function enrichLoops(alerts,events,conflicts){
  return alerts.map(function(alert){
    var a=clone(alert)||{};
    return{
      alert:a,
      relatedOrderEvents:events.filter(function(e){return matchesAlert(e,a);}).slice(-80),
      relatedWriterConflicts:conflicts.filter(function(c){return matchesAlert(c,a);}).slice(0,30)
    };
  });
}
function engagement(s){return s&&s.eng?safePlain(s.eng,4):null;}
function soldier(s){
  var w=s&&s.weapon||{},p=s&&s.root&&s.root.position||{};
  return{
    id:s&&s.id,faction:s&&s.faction,role:s&&s.role,dead:!!(s&&s.dead),hp:finite(+s.hp),maxHp:finite(+s.maxHp),
    position:{x:finite(+p.x),y:finite(+p.y),z:finite(+p.z)},destination:point(s&&s.destination),orderDestination:point(s&&s.orderDestination),
    targetId:s&&s.target?s.target.id:null,state:s&&s.state||null,gait:s&&s._locomotionGait||null,speed:finite(+(s&&s.speed)),moveSpeed:finite(+(s&&s.moveSpeed)),
    moving:!!(s&&s.moving),movementStopReason:s&&s._movementStopReason||null,crouching:!!(s&&(s.crouching||s.tacticalCrouch)),prone:!!(s&&s.prone),crawling:!!(s&&s.crawling),
    suppressedUntil:finite(+(s&&s.suppressedUntil)),setUp:!!(s&&s.setUp),reloading:!!(s&&s.reloading),reloadUntil:finite(+(s&&s.reloadUntil)),
    clearingStoppage:!!(s&&s.clearingStoppage),stoppageUntil:finite(+(s&&s.stoppageUntil)),outOfAmmo:!!(s&&s.outOfAmmo),
    weapon:{kind:w.kind||null,ammo:finite(+w.ammo),reserveAmmo:finite(+w.reserveAmmo),magSize:finite(+w.magSize),heat:finite(+w.heat),jammed:!!w.jammed},
    ammoState:safePlain(s&&s._ammoState,3),engagement:engagement(s),
    movement:safePlain(s&&s._movementResolver?{last:s._movementResolver.last,changes:s._movementResolver.changes,requests:s._movementResolver.requests,history:(s._movementResolver.history||[]).slice(-6)}:null,5),
    movementProgress:safePlain(s&&s._movementProgress?{stuck:!!s._movementProgress.stuck,recoveries:s._movementProgress.recoveries||0,goalUnreachable:!!s._movementGoalUnreachable}:null,3),
    positionalTask:root.BattleTacticalPositions?safePlain(root.BattleTacticalPositions.current(s),7):null
  };
}
function squad(sq,sim){
  return{
    id:sq.id,faction:sq.faction,state:sq.state||null,commandPhase:sq.commandPhase||null,commandRole:sq.commandRole||null,
    aliveCount:finite(+sq.aliveCount),captainAlive:sq.captainAlive!==false,inContact:!!sq.inContact,targetObjective:sq.targetObjective||null,
    objective:point(sq.objective),rally:point(sq.rally),routeIndex:finite(+sq.routeIndex),route:safePlain(sq.route,3),
    commandHoldUntil:finite(root.BattleLeases?root.BattleLeases.until(sq,'corner-hold'):0),accuracyMultiplier:finite(+sq.accuracyMultiplier),
    regroup:(function(){var L=root.BattleLeases,rg=L&&L.get(sq,'regroup');return{accepted:!!rg,anchor:point(rg&&rg.data&&rg.data.anchor),enteredAt:rg?finite(+rg.since):null,entries:finite(+(sq._regroupHysteresis&&sq._regroupHysteresis.entries)),bypassUntil:finite(L?L.until(sq,'regroup-bypass'):0)};})(),
    /* Macro brief (General-owned) vs Squad Leader execution (Meso-owned): the two halves of the mission contract. */
    mission:safePlain(sq._macroMission?Object.assign({},sq._macroMission,{key:undefined}):null,4),lastMission:safePlain(sq._lastMacroMission?Object.assign({},sq._lastMacroMission,{key:undefined}):null,4),
    captainRequest:safePlain(sq._macroMissionRequest,3),
    /* Owned commitments (BattleLeases): what is live, who owns it, why, what releases it, and which one holds the mission now. */
    leases:root.BattleLeases?safePlain(root.BattleLeases.active(sq,sq._battleSim?+sq._battleSim.time||0:0),4):null,
    recentLeases:safePlain(sq._leases&&sq._leases.ended,4),missionHeldBy:sq._missionHold||null,
    missionExecution:sq._missionExecution?{version:sq._missionExecution.mission?sq._missionExecution.mission.version:null,acceptedAt:finite(+sq._missionExecution.acceptedAt),holdPoint:point(sq._missionExecution.holdPoint)}:null,
    contact:safePlain(sq._contact,4),analysis:squadAnalysis(sim,sq),members:(sq.members||[]).map(soldier)
  };
}
function objectives(sim){
  var list=sim&&sim._objectives||[];
  return list.map(function(o){
    var status=null;try{status=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status?root.BattleObjectiveSystem.status(sim,o.id):o.state||null;}catch(_){}
    return{id:o.id,type:o.type||o.def&&o.def.type||null,def:safePlain(o.def,4),status:safePlain(status,4)};
  });
}
function diagnosticFields(sim){
  var out={},deny={_roster:1,_moduleUnits:1,_rng:1,_disposables:1,_renderObserver:1,scene:1,factions:1};
  Object.keys(sim||{}).forEach(function(k){
    if(deny[k])return;
    if(!/(health|summary|stats|metric|telemetry|loop|coordination|ammunition|assault|objectiveControl|objectiveHold)/i.test(k))return;
    var v=safePlain(sim[k],6);if(v!==undefined)out[k]=v;
  });
  return out;
}
function consoleDump(){
  if(typeof document==='undefined')return null;
  var el=document.getElementById('debugConsole');return el?el.innerText:null;
}
function buildPayload(sim){
  sim=sim||activeSim;if(!sim)throw new Error('No active battle simulation');
  var scenario=sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||null;
  var systems=[];try{systems=root.BattleModules?root.BattleModules.listSystems().map(function(s){return{id:s.id,version:s.version||null};}):[];}catch(_){}
  var policy=null;try{policy=root.BattleAIPolicy&&root.BattleAIPolicy.get?root.BattleAIPolicy.get():null;}catch(_){}
  var ammo=null;try{ammo=root.BattleAmmunition&&root.BattleAmmunition.summary?root.BattleAmmunition.summary(sim):null;}catch(_){}
  var ai=aiSections(sim);
  return{
    format:'grasstex-battle-full-diagnostics-v1',
    exportedAt:new Date().toISOString(),
    build:root.BATTLE_BUILD||root.BATTLE_BUILD_DEPLOYED||'dev',ref:root.BATTLE_REF||null,
    page:typeof location!=='undefined'?location.href:null,userAgent:typeof navigator!=='undefined'?navigator.userAgent:null,
    battle:{time:finite(+sim.time),timeLimit:finite(+sim.timeLimit),timeScale:finite(+sim.timeScale),paused:!!sim.paused,winner:sim.winner||null,winReason:sim.winReason||null,manualEnded:!!sim.manualEnded},
    scenario:safePlain(scenario,7),
    telemetry:root.BattleTelemetry&&root.BattleTelemetry.state?root.BattleTelemetry.state():null,
    policy:{revision:root.BattleAIPolicy&&root.BattleAIPolicy.revision!=null?root.BattleAIPolicy.revision:null,genome:safePlain(policy,7)},
    modules:systems,
    objectives:objectives(sim),
    objectiveControl:safePlain(sim.objectiveControl,6),objectiveHold:safePlain(sim.objectiveHold,4),
    ammunition:ammo,
    tacticalPositions:root.BattleTacticalPositions?root.BattleTacticalPositions.summary(sim):null,
    coverPositions:root.BattleCoverPositions?root.BattleCoverPositions.snapshot(sim):null,
    macroCommand:{enabled:sim.macroCommandEnabled!==false,mode:sim._macroMissionState&&sim._macroMissionState.mode||'event-driven',state:safePlain(sim._macroMissionState,5)},
    ownership:sim._orderProvenance?{events:(sim._orderProvenance.seq||0),conflicts:(sim._orderProvenance.conflicts||[]).length,recentConflicts:safePlain((sim._orderProvenance.conflicts||[]).slice(0,20).map(function(c){return{kind:c.kind,time:c.time,field:c.field,squad:c.squad,soldier:c.soldier,owners:c.owners};}),4)}:null,
    factions:{
      us:{alive:sim.factions&&sim.factions.us&&sim.factions.us.alive,kills:sim.factions&&sim.factions.us&&sim.factions.us.kills,squads:(sim.factions&&sim.factions.us&&sim.factions.us.squads||[]).map(function(q){return squad(q,sim);})},
      ge:{alive:sim.factions&&sim.factions.ge&&sim.factions.ge.alive,kills:sim.factions&&sim.factions.ge&&sim.factions.ge.kills,squads:(sim.factions&&sim.factions.ge&&sim.factions.ge.squads||[]).map(function(q){return squad(q,sim);})}
    },
    runtimeDiagnostics:diagnosticFields(sim),
    coordinationHealth:ai.coordinationHealth,diagnosticMetrics:ai.diagnosticMetrics,movementResolver:ai.movementResolver,
    loopWatch:ai.loopWatch,orderProvenance:ai.orderProvenance,leases:ai.leases,
    console:consoleDump()
  };
}
function aiSections(sim){
  var alerts=loopAlerts(sim),events=orderEvents(sim),conflicts=orderConflicts(sim);
  return{
    coordinationHealth:coordinationHealth(sim),diagnosticMetrics:tacticalMetrics(sim,conflicts),
    movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
    loopWatch:{count:alerts.length,alerts:enrichLoops(alerts,events,conflicts)},
    orderProvenance:{version:root.BattleOrderProvenance&&root.BattleOrderProvenance.version||null,eventCount:events.length,conflictCount:conflicts.length,events:clone(events)||[],conflicts:clone(conflicts)||[]},
    leases:root.BattleLeasePanel?clone(root.BattleLeasePanel.snapshot(sim)):null
  };
}
/* Focused exports for the AI Graph buttons: the battle header, each squad's analysis, and one section. */
function snapshot(kind,sim){
  sim=sim||activeSim||root.__battle__;if(kind!=='loops'&&kind!=='orders')return buildPayload(sim);
  var ai=aiSections(sim),squads=[];
  ['us','ge'].forEach(function(f){(sim.factions&&sim.factions[f]&&sim.factions[f].squads||[]).forEach(function(q){squads.push({id:q.id,faction:f,commandPhase:q.commandPhase||null,state:q.state||null,analysis:squadAnalysis(sim,q)});});});
  var out={type:kind==='loops'?'battle-ai-loop-trace':'battle-ai-order-trace',format:'grasstex-battle-full-diagnostics-v1',exportedAt:new Date().toISOString(),build:root.BATTLE_BUILD||root.BATTLE_BUILD_DEPLOYED||'dev',
    battle:{time:finite(+sim.time),winner:sim.winner||null},scenario:{seed:(sim.scene&&sim.scene.metadata&&sim.scene.metadata.battleScenario&&sim.scene.metadata.battleScenario.seed)||sim.seed||null},squads:squads,coordinationHealth:ai.coordinationHealth,diagnosticMetrics:ai.diagnosticMetrics,movementResolver:ai.movementResolver,leases:ai.leases};
  if(kind==='loops')out.loopWatch=ai.loopWatch;else out.orderProvenance=ai.orderProvenance;
  return out;
}
function cleanName(v){return String(v||'battle').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'battle';}
function download(kind,sim){
  var payload=snapshot(kind,sim),seed=payload.scenario&&payload.scenario.seed||'battle',build=payload.build||'dev',prefix=kind==='loops'?'battle-ai-loop-trace':kind==='orders'?'battle-ai-order-trace':'battle-full-diag';
  var stamp=payload.exportedAt.replace(/[:.]/g,'-'),name=prefix+'-'+cleanName(seed)+'-'+cleanName(build)+'-'+stamp+'.json';
  if(typeof document==='undefined'||typeof Blob==='undefined'||!root.URL||!root.URL.createObjectURL)return payload;
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=root.URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){root.URL.revokeObjectURL(url);},1500);
  return payload;
}
function installButton(){
  if(typeof document==='undefined'||document.getElementById('bannerExportDiagnostics'))return;
  var restart=document.getElementById('bannerRestart'),host=restart&&restart.parentNode;if(!host)return;
  var b=document.createElement('button');b.id='bannerExportDiagnostics';b.type='button';b.textContent='Export Full Diagnostics';b.title='Download full battle state, squads, soldiers, ammo, objectives and runtime diagnostics as JSON';
  b.style.marginLeft='8px';b.style.background='#243247';b.style.borderColor='#58749a';
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();try{download('full',activeSim);}catch(err){console.error('[DIAG] export failed',err);}});
  host.appendChild(b);
}

/* This module sorts last, so it sees the fully wrapped BattleSim.start and only remembers the
   returned simulation. It does not participate in movement, AI or benchmark results. */
if(root.BattleSim&&typeof root.BattleSim.start==='function'){
  var oldStart=root.BattleSim.start;
  root.BattleSim.start=function(scene,opts){activeSim=oldStart.apply(this,arguments);return activeSim;};
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();
}
root.BattleDiagnosticsExport={version:'2.0',build:buildPayload,snapshot:snapshot,download:download,exportCurrent:function(sim){return download('full',sim);},current:function(){return activeSim;}};
console.log('[DIAG] end-session full diagnostics export ready');
})(typeof window!=='undefined'?window:globalThis);

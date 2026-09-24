/* Export Battle AI loop-watch and order-provenance diagnostics as portable JSON snapshots.
   UI-only/on-demand: this module adds no simulation tick hooks and does no work during combat
   until the operator explicitly exports a trace. */
(function(root){
'use strict';
if(typeof document==='undefined'||root.BattleAIDiagnosticsExport)return;

var VERSION='diagnostics-export-v2',tries=0;

function clone(v){
  if(v==null)return v;
  try{return JSON.parse(JSON.stringify(v));}catch(_){return null;}
}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function distance(a,b){return a&&b?Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0)):null;}
function rounded(v){return v==null||!isFinite(+v)?null:+(+v).toFixed(2);}
function defenseRequest(sq){var r=sq&&sq._captureZoneDefenseRequest;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),point:point(r.point),requestedAt:isFinite(+r.requestedAt)?+r.requestedAt:null,reason:r.reason||null}:null;}
function preparedDefenseRequest(sq){var r=sq&&sq._preparedDefenseRequest;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),point:point(r.point),requestedAt:isFinite(+r.requestedAt)?+r.requestedAt:null,reason:r.reason||null}:null;}
function objectiveRecovery(sq){var r=sq&&sq._objectiveRecovery;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),reason:r.reason||null,at:isFinite(+r.at)?+r.at:null}:null;}
function isoStamp(){return new Date().toISOString().replace(/[:.]/g,'-');}
function safeName(s){return String(s||'battle-ai').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();}
function downloadJson(name,data){
  var blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safeName(name)+'-'+isoStamp()+'.json';document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
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
function captainAlive(sq){return!!(root.SquadAI&&root.SquadAI.leaderOf(sq));}
function cohesionLimit(sim,sq){
  try{
    var cfg=root.BattleCommanderAI&&root.BattleCommanderAI.policyFor?root.BattleCommanderAI.policyFor(sim,sq.faction):null;
    if(!cfg)return null;return captainAlive(sq)?+cfg.cohesionRadius:+cfg.captainlessCohesion;
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
function factionSummary(sim,faction){
  var side=sim&&sim.factions&&sim.factions[faction],squads=side&&side.squads||[];
  return{
    alive:side&&isFinite(+side.alive)?+side.alive:null,
    squads:squads.map(function(sq){
      var pos=squadPosition(sq),spread=squadSpread(sq,pos),limit=cohesionLimit(sim,sq);
      return{
        id:sq.id!=null?String(sq.id):null,role:sq.commandRole||null,phase:sq.commandPhase||null,state:sq.state||null,
        targetObjective:sq.targetObjective!=null?String(sq.targetObjective):null,objective:point(sq.objective),position:pos,
        commandPointDistance:rounded(distance(pos,point(sq.objective))),targetObjectiveState:objectiveTargetState(sim,sq,pos),
        rally:point(sq.rally),distanceToRally:rounded(distance(pos,point(sq.rally))),orderAnchor:point(sq.orderAnchor),distanceToOrderAnchor:rounded(distance(pos,point(sq.orderAnchor))),
        spread:rounded(spread),cohesionLimit:rounded(limit),overCohesionLimit:spread!=null&&limit!=null?spread>limit:null,captainAlive:captainAlive(sq),
        commandHoldUntil:root.BattleLeases?root.BattleLeases.until(sq,'corner-hold'):null,commandHoldRemaining:root.BattleLeases?rounded(Math.max(0,root.BattleLeases.until(sq,'corner-hold')-simNow(sim))):null,
        inContact:!!sq.inContact,aliveCount:isFinite(+sq.aliveCount)?+sq.aliveCount:null,lastDoctrineRule:sq._lastDoctrineRule||null,
        route:routeState(sq,pos),stablePlan:stablePlanState(sq,sim),regroupRecovery:regroupRecoveryState(sq,sim),fireteamOrders:fireteamOrdersState(sq,sim),movement:movementState(sq),
        objectiveRecovery:objectiveRecovery(sq),objectiveDefenseRequest:defenseRequest(sq),preparedDefenseRequest:preparedDefenseRequest(sq),
        strategicDefenseObjective:sq._strategicDefenseObjective!=null?String(sq._strategicDefenseObjective):null
      };
    })
  };
}
function meta(sim){
  var control=sim&&sim.objectiveControl||null;
  return{
    formatVersion:VERSION,exportedAt:new Date().toISOString(),build:root.BATTLE_BUILD||null,
    battleTime:+simNow(sim).toFixed(3),paused:!!(sim&&sim.paused),timeScale:sim&&isFinite(+sim.timeScale)?+sim.timeScale:null,
    timeLimit:sim&&isFinite(+sim.timeLimit)?+sim.timeLimit:null,winner:sim&&sim.winner||null,winReason:sim&&sim.winReason||null,
    sideRoles:clone(sim&&sim.sideRoles||root.BATTLE_SIDE_ROLES||null),objectiveControl:clone(control),
    objectiveRecovery:clone(sim&&sim._objectiveRecovery||null),factions:{us:factionSummary(sim,'us'),ge:factionSummary(sim,'ge')}
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
function loopSnapshot(sim){
  sim=sim||root.__battle__;var alerts=loopAlerts(sim),events=orderEvents(sim),conflicts=orderConflicts(sim);
  return{
    type:'battle-ai-loop-trace',meta:meta(sim),policy:policySnapshot(),coordinationHealth:coordinationHealth(sim),diagnosticMetrics:tacticalMetrics(sim,conflicts),movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
    loopWatch:{count:alerts.length,alerts:enrichLoops(alerts,events,conflicts)},
    provenanceContext:{eventCount:events.length,conflictCount:conflicts.length}
  };
}
function orderSnapshot(sim){
  sim=sim||root.__battle__;var events=orderEvents(sim),conflicts=orderConflicts(sim);
  return{
    type:'battle-ai-order-trace',meta:meta(sim),policy:policySnapshot(),coordinationHealth:coordinationHealth(sim),diagnosticMetrics:tacticalMetrics(sim,conflicts),movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
    orderProvenance:{version:root.BattleOrderProvenance&&root.BattleOrderProvenance.version||null,eventCount:events.length,conflictCount:conflicts.length,events:clone(events)||[],conflicts:clone(conflicts)||[]}
  };
}
function combinedSnapshot(sim){
  sim=sim||root.__battle__;var alerts=loopAlerts(sim),events=orderEvents(sim),conflicts=orderConflicts(sim);
  return{
    type:'battle-ai-diagnostics',meta:meta(sim),policy:policySnapshot(),coordinationHealth:coordinationHealth(sim),diagnosticMetrics:tacticalMetrics(sim,conflicts),movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
    loopWatch:{count:alerts.length,alerts:enrichLoops(alerts,events,conflicts)},
    orderProvenance:{version:root.BattleOrderProvenance&&root.BattleOrderProvenance.version||null,eventCount:events.length,conflictCount:conflicts.length,events:clone(events)||[],conflicts:clone(conflicts)||[]}
  };
}
function exportLoops(){downloadJson('battle-ai-loop-trace',loopSnapshot(root.__battle__));}
function exportOrders(){downloadJson('battle-ai-order-trace',orderSnapshot(root.__battle__));}
function exportAll(){downloadJson('battle-ai-diagnostics',combinedSnapshot(root.__battle__));}

function button(id,text,title,fn){
  var b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.title=title;b.addEventListener('click',function(e){e.stopPropagation();fn();});return b;
}
function installStyle(){
  if(document.getElementById('agDiagnosticsExportStyle'))return;
  var s=document.createElement('style');s.id='agDiagnosticsExportStyle';s.textContent='\
#agLoopPanel .diag-export-row,#agOrderTracePanel .diag-export-row{display:flex;gap:6px;padding:8px;border-top:1px solid #34383c;background:#202428}\
#agLoopPanel .diag-export-row button,#agOrderTracePanel .diag-export-row button{flex:1;padding:6px 8px;background:#30363a;color:#dce3e6;border:1px solid #566068;border-radius:4px;cursor:pointer;font:9px Arial}\
#agLoopPanel .diag-export-row button:hover,#agOrderTracePanel .diag-export-row button:hover{background:#394147}\
#agDiagExport{border-color:#666a82!important;background:#34364a!important;color:#e4e4ff!important}\
';document.head.appendChild(s);
}
function install(){
  installStyle();
  var top=document.getElementById('agTop'),loop=document.getElementById('agLoopPanel'),order=document.getElementById('agOrderTracePanel');
  var ready=!!top;
  if(top&&!document.getElementById('agDiagExport')){
    var close=document.getElementById('agClose'),b=button('agDiagExport','Export Diagnostics','Export Loop Watch + Order Trace + current AI/battle context as JSON',exportAll);top.insertBefore(b,close||null);
  }
  if(loop&&!document.getElementById('agLoopExport')){
    var lr=document.createElement('div');lr.className='diag-export-row';lr.appendChild(button('agLoopExport','Export Loops JSON','Export Loop Watch alerts with matching order provenance',exportLoops));loop.appendChild(lr);
  }
  if(order&&!document.getElementById('agOrderExport')){
    var or=document.createElement('div');or.className='diag-export-row';or.appendChild(button('agOrderExport','Export Orders JSON','Export order provenance events and writer conflicts',exportOrders));order.appendChild(or);
  }
  if((!ready||!loop||!order)&&tries++<40)setTimeout(install,250);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
root.BattleAIDiagnosticsExport={
  version:VERSION,loopSnapshot:loopSnapshot,orderSnapshot:orderSnapshot,combinedSnapshot:combinedSnapshot,
  exportLoops:exportLoops,exportOrders:exportOrders,exportAll:exportAll
};
console.log('[AI-DIAGNOSTICS] loop/order JSON export v2 ready');
})(typeof window!=='undefined'?window:globalThis);

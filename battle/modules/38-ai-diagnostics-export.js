/* Export Battle AI loop-watch and order-provenance diagnostics as portable JSON snapshots.
   UI-only/on-demand: this module adds no simulation tick hooks and does no work during combat
   until the operator explicitly exports a trace. */
(function(root){
'use strict';
if(typeof document==='undefined'||root.BattleAIDiagnosticsExport)return;

var VERSION='diagnostics-export-v1',tries=0;

function clone(v){
  if(v==null)return v;
  try{return JSON.parse(JSON.stringify(v));}catch(_){return null;}
}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function defenseRequest(sq){var r=sq&&sq._captureZoneDefenseRequest;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),point:point(r.point),requestedAt:isFinite(+r.requestedAt)?+r.requestedAt:null,reason:r.reason||null}:null;}
function preparedDefenseRequest(sq){var r=sq&&sq._preparedDefenseRequest;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),point:point(r.point),requestedAt:isFinite(+r.requestedAt)?+r.requestedAt:null,reason:r.reason||null}:null;}
function objectiveRecovery(sq){var r=sq&&sq._objectiveRecovery;return r&&r.objectiveId?{objectiveId:String(r.objectiveId),reason:r.reason||null,at:isFinite(+r.at)?+r.at:null}:null;}
function routeState(sq){var route=sq&&sq.route||[],raw=sq&&isFinite(+sq.routeIndex)?+sq.routeIndex:0,index=Math.max(0,Math.min(route.length-1,raw));return{index:route.length?index:null,length:route.length,waypoint:route.length?point(route[index]):null,finalWaypoint:route.length?point(route[route.length-1]):null};}
function isoStamp(){return new Date().toISOString().replace(/[:.]/g,'-');}
function safeName(s){return String(s||'battle-ai').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();}
function downloadJson(name,data){
  var blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safeName(name)+'-'+isoStamp()+'.json';document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function simNow(sim){return sim&&isFinite(+sim.time)?+sim.time:0;}
function factionSummary(sim,faction){
  var side=sim&&sim.factions&&sim.factions[faction],squads=side&&side.squads||[];
  return{
    alive:side&&isFinite(+side.alive)?+side.alive:null,
    squads:squads.map(function(sq){
      return{
        id:sq.id!=null?String(sq.id):null,role:sq.commandRole||null,phase:sq.commandPhase||null,state:sq.state||null,
        targetObjective:sq.targetObjective!=null?String(sq.targetObjective):null,objective:point(sq.objective),rally:point(sq.rally),orderAnchor:point(sq.orderAnchor),
        inContact:!!sq.inContact,aliveCount:isFinite(+sq.aliveCount)?+sq.aliveCount:null,lastDoctrineRule:sq._lastDoctrineRule||null,route:routeState(sq),objectiveRecovery:objectiveRecovery(sq),objectiveDefenseRequest:defenseRequest(sq),preparedDefenseRequest:preparedDefenseRequest(sq),
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
  if(alert.faction&&item.faction&&String(alert.faction).toLowerCase()!==String(item.faction).toLowerCase())return false;
  if(alert.squad!=null&&item.squad!=null&&!sameId(alert.squad,item.squad))return false;
  if(alert.soldier!=null&&item.soldier!=null&&!sameId(alert.soldier,item.soldier))return false;
  return alert.faction||alert.squad!=null||alert.soldier!=null;
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
    type:'battle-ai-loop-trace',meta:meta(sim),policy:policySnapshot(),coordinationHealth:coordinationHealth(sim),movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
    loopWatch:{count:alerts.length,alerts:enrichLoops(alerts,events,conflicts)},
    provenanceContext:{eventCount:events.length,conflictCount:conflicts.length}
  };
}
function orderSnapshot(sim){
  sim=sim||root.__battle__;var events=orderEvents(sim),conflicts=orderConflicts(sim);
  return{
    type:'battle-ai-order-trace',meta:meta(sim),policy:policySnapshot(),coordinationHealth:coordinationHealth(sim),movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
    orderProvenance:{version:root.BattleOrderProvenance&&root.BattleOrderProvenance.version||null,eventCount:events.length,conflictCount:conflicts.length,events:clone(events)||[],conflicts:clone(conflicts)||[]}
  };
}
function combinedSnapshot(sim){
  sim=sim||root.__battle__;var alerts=loopAlerts(sim),events=orderEvents(sim),conflicts=orderConflicts(sim);
  return{
    type:'battle-ai-diagnostics',meta:meta(sim),policy:policySnapshot(),coordinationHealth:coordinationHealth(sim),movementResolver:clone(root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(sim):null),
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
console.log('[AI-DIAGNOSTICS] loop/order JSON export ready');
})(typeof window!=='undefined'?window:globalThis);

/* Performance hotfix for Step 2 order provenance.
   36-order-provenance v1 used Error().stack inside tracked property setters. `destination` is a
   hot combat field, so 100 soldiers could construct thousands of stacks per second. This module
   preserves the same provenance stores/UI format while replacing those setters with cheap owner
   contexts + field heuristics and throttling the fallback in-place sampler. No AI decisions change. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleOrderProvenance||root.BattleOrderProvenanceFastPath)return;

var VERSION='step2-fastpath-v1',active=[];
var SAMPLE_SECONDS=1.6,POINT_EPS=.9,MAX_TARGET=32,MAX_GLOBAL=420,MAX_CONFLICTS=80,PINGPONG_WINDOW=8;
var SQUAD={commandPhase:'state',targetObjective:'state',objective:'point',orderAnchor:'point',rally:'point'};
var SOLDIER={_fireteamDestination:'point',_preparedDefensePost:'point',_defensePost:'point',orderDestination:'point',destination:'point'};
  var KEYS={'force-command':'system:commander','capture-zone':'system:objective','squad-stability':'system:squad','prepared-defense':'defense:defense','building-hardpoints':'system:engagement','engagement':'system:engagement','movement-resolver':'system:resolver','squad-orders':'system:squad','engineer':'defense:engineer'};

function time(sim){return sim&&isFinite(sim.time)?+sim.time:0;}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function snap(v,type){if(type==='point')return point(v);if(v==null)return null;if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return v;if(v&&v.id!=null)return String(v.id);return String(v);}
function dist(a,b){if(!a&&!b)return 0;if(!a||!b)return Infinity;return Math.hypot(a.x-b.x,a.z-b.z);}
function eps(field){return field==='destination'||field==='orderDestination'?1.25:field==='_fireteamDestination'?1.0:POINT_EPS;}
function same(a,b,type,field){return type==='point'?dist(a,b)<=eps(field):a===b;}
function context(owner,reason,fn,key){active.push({owner:owner,reason:reason,key:key||KEYS[owner]||null});try{return fn();}finally{active.pop();}}
function current(){return active.length?active[active.length-1]:null;}
function ownerForSystem(id){id=String(id||'').toLowerCase();if(id.indexOf('capture')>=0)return'capture-zone';if(id.indexOf('squad-plan')>=0||id.indexOf('stability')>=0)return'squad-stability';if(id.indexOf('building-hardpoint')>=0)return'building-hardpoints';if(id.indexOf('engineer')>=0)return'engineer';if(id.indexOf('defender')>=0||id.indexOf('defense')>=0)return'prepared-defense';if(id.indexOf('order-provenance')>=0)return'diagnostics';return'module:'+id;}
function source(target,kind,field){
  var c=current();if(c)return{owner:c.owner,key:c.key||KEYS[c.owner]||null,site:c.reason||'execution context'};
  var owner='unknown';
  if(kind==='squad')owner=(field==='orderAnchor'||field==='rally')?'squad-orders':'force-command';
  else if(field==='_preparedDefensePost')owner='prepared-defense';
  else if(field==='_defensePost')owner='squad-stability';
  else if(field==='_fireteamDestination')owner=target._preparedDefensePost?'prepared-defense':'squad-stability';
  else if(field==='orderDestination')owner=target._preparedDefensePost?'prepared-defense':(target._fireteamDestination?'squad-stability':'squad-orders');
  else if(field==='destination')owner=target._movementResolvedOwner||'squad-orders';
  return{owner:owner,key:KEYS[owner]||null,proposalOwner:field==='destination'?(target._movementProposalOwner||null):null,site:'fast field ownership'};
}
function store(target){return target&&target.__orderProvenance||null;}
function simStore(sim){if(!sim._orderProvenance)sim._orderProvenance={version:VERSION,events:[],conflicts:[],seq:0,installedAt:time(sim)};sim._orderProvenance.version=VERSION;return sim._orderProvenance;}
function meta(target,kind){var sq=kind==='squad'?target:target&&target.squad;return{faction:(sq&&sq.faction)||(target&&target.faction)||null,squad:sq&&sq.id!=null?String(sq.id):null,soldier:kind==='soldier'&&target&&target.id!=null?String(target.id):null};}
function fieldEvents(ts,field){var out=[];for(var i=ts.events.length-1;i>=0&&out.length<7;i--)if(ts.events[i].field===field)out.unshift(ts.events[i]);return out;}
function conflict(events,t){
  function competing(owner){return owner&&owner!=='unknown'&&owner!=='in-place/unknown'&&owner!=='diagnostics';}
  if(events.length>=3){var a=events[events.length-3],b=events[events.length-2],c=events[events.length-1];if(competing(a.owner)&&competing(b.owner)&&competing(c.owner)&&a.owner===c.owner&&a.owner!==b.owner&&c.time-a.time<=PINGPONG_WINDOW)return'writer-ping-pong';}
  var start=Math.max(0,events.length-5),owners=[],switches=0,last=null,first=null;
  for(var i=start;i<events.length;i++){var e=events[i];if(!competing(e.owner))continue;if(first==null)first=e.time;if(e.owner!==last){if(last!=null)switches++;last=e.owner;if(owners.indexOf(e.owner)<0)owners.push(e.owner);}}
  return owners.length>=3&&switches>=3&&t-first<=PINGPONG_WINDOW?'writer-churn':null;
}
function addConflict(sim,target,event,kind,ts){
  var ss=simStore(sim),m=meta(target,event.targetKind),events=fieldEvents(ts,event.field),sig=[kind,m.faction,m.squad,m.soldier,event.field,events.slice(-3).map(function(e){return e.owner;}).join('>')].join('|');
  var last=ss.conflicts[0];if(last&&last.signature===sig&&event.time-last.time<4)return;
  var c={signature:sig,kind:kind,time:event.time,field:event.field,faction:m.faction,squad:m.squad,soldier:m.soldier,owners:events.slice(-5).map(function(e){return e.owner;}),events:events.slice(-5)};
  ss.conflicts.unshift(c);if(ss.conflicts.length>MAX_CONFLICTS)ss.conflicts.length=MAX_CONFLICTS;
  if(root.BattleTelemetry)root.BattleTelemetry.record('order-writer-conflict',{kind:kind,field:event.field,faction:m.faction,squad:m.squad,soldier:m.soldier,owners:c.owners},sim);
}
function record(sim,target,kind,field,from,to,src,st){
  var ts=store(target);if(!ts)return;var ss=simStore(sim),prev=st.lastEvent||null,m=meta(target,kind),event={id:++ss.seq,time:+time(sim).toFixed(3),targetKind:kind,field:field,from:from,to:to,owner:src.owner||'unknown',ownerKey:src.key||KEYS[src.owner]||null,proposalOwner:src.proposalOwner||null,site:src.site||'',reason:src.site||'',previousOwner:prev&&prev.owner||null,faction:m.faction,squad:m.squad,soldier:m.soldier,phase:(kind==='squad'?target.commandPhase:target.squad&&target.squad.commandPhase)||null,rule:(kind==='squad'?target._lastDoctrineRule:target.squad&&target.squad._lastDoctrineRule)||null,inContact:!!(kind==='squad'?target.inContact:target.squad&&target.squad.inContact)};
  ts.events.push(event);if(ts.events.length>MAX_TARGET)ts.events.shift();st.lastEvent=event;st.last=to;ss.events.push(event);if(ss.events.length>MAX_GLOBAL)ss.events.shift();var ck=conflict(fieldEvents(ts,field),event.time);if(ck)addConflict(sim,target,event,ck,ts);
}
function fastField(sim,target,kind,field,type){
  var ts=store(target);if(!ts||!ts.fields)return;var st=ts.fields[field];if(!st||st.fastPath)return;
  var desc;try{desc=Object.getOwnPropertyDescriptor(target,field);}catch(_){}if(desc&&desc.configurable===false)return;
  var value=target[field];st.fastPath=true;st.instrumented=true;st.type=type;st.last=snap(value,type);
  try{Object.defineProperty(target,field,{enumerable:desc?desc.enumerable!==false:true,configurable:true,get:function(){return value;},set:function(next){var before=st.last;value=next;var after=snap(next,type);if(!same(before,after,type,field)){record(sim,target,kind,field,before,after,source(target,kind,field),st);st.last=after;}}});}catch(_){st.fastPath=false;}
}
function installFast(sim){
  if(!sim)return;['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){var sq=squads[i];Object.keys(SQUAD).forEach(function(field){fastField(sim,sq,'squad',field,SQUAD[field]);});var members=sq.members||[];for(var j=0;j<members.length;j++)Object.keys(SOLDIER).forEach(function(field){fastField(sim,members[j],'soldier',field,SOLDIER[field]);});}});
}
function wrapEngagement(){if(!root.BattleEngagement||root.BattleEngagement.__provenanceFastPath)return;var old=root.BattleEngagement.updateSoldier;if(typeof old==='function')root.BattleEngagement.updateSoldier=function(s,b){return context('engagement','updateSoldier',function(){return old(s,b);},'system:engagement');};root.BattleEngagement.__provenanceFastPath=true;}
function wrapSystemHooks(){
  var systems=root.BattleModules.listSystems?root.BattleModules.listSystems():[];
  var hooks=['onBattleStart','onBattleRestart','onCommanderTick','beforeBattleRestart'];
  for(var i=0;i<systems.length;i++)(function(system){
    var owner=ownerForSystem(system.id),key=KEYS[owner]||null;
    for(var j=0;j<hooks.length;j++)(function(name){var old=system[name];if(typeof old!=='function'||old.__provenanceContext)return;var wrapped=function(sim,payload){return context(owner,'module '+system.id+'.'+name,function(){return old(sim,payload);},key);};wrapped.__provenanceContext=true;system[name]=wrapped;})(hooks[j]);
  })(systems[i]);
}
function throttleV1(){
  var sys=root.BattleModules.getSystem&&root.BattleModules.getSystem('zz-order-provenance');if(!sys||typeof sys.onCommanderTick!=='function'||sys.__fastThrottled)return;
  var old=sys.onCommanderTick,next=0;sys.onCommanderTick=function(sim,payload){var t=time(sim);if(t+1e-6<next)return;next=t+SAMPLE_SECONDS;return old(sim,payload);};sys.__fastThrottled=true;
}
function graphVisible(){var g=typeof document!=='undefined'&&document.getElementById('aiGraph');return!!(g&&!g.hidden);}
function maybeRefreshUi(){if(!graphVisible())return;try{root.BattleOrderProvenance.decorateLoopCards();}catch(_){}}

throttleV1();wrapSystemHooks();wrapEngagement();
root.BattleModules.registerSystem('zzz-order-provenance-fastpath',{
  version:VERSION,
  onBattleStart:function(sim){installFast(sim);maybeRefreshUi();},
  onBattleRestart:function(sim){installFast(sim);maybeRefreshUi();},
  onCommanderTick:function(sim){installFast(sim);}
});

root.BattleOrderProvenanceFastPath={version:VERSION,install:installFast,withOwner:context};
console.log('[ORDER-PROVENANCE] fast path active: stack inspection removed from hot movement writes; sampler '+SAMPLE_SECONDS.toFixed(1)+'s');
})(typeof window!=='undefined'?window:globalThis);

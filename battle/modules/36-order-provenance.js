/* Step 2: order provenance + writer-conflict diagnostics.
   Observational only. It does not choose orders or movement; it instruments the mutable fields
   already used by Force Command, Capture Zone, Squad Stability, Prepared Defense, Squad Orders
   and Engagement so Loop Watch can say WHO requested each change and WHO finally moved the man. */
(function(root){
'use strict';
if(!root.BattleModules||root.BattleOrderProvenance)return;

var VERSION='step2-v1';
var MAX_TARGET_EVENTS=40,MAX_GLOBAL_EVENTS=700,MAX_CONFLICTS=100;
var HANDOFF_WINDOW=2.5,PINGPONG_WINDOW=8,POINT_EPS=.65;
var activeContext=[];
var ui={panel:null,button:null,list:null,loopList:null,loopObserver:null,tries:0};

var SQUAD_FIELDS={
  commandPhase:'state',targetObjective:'state',objective:'point',orderAnchor:'point',rally:'point'
};
var SOLDIER_FIELDS={
  _fireteamDestination:'point',_preparedDefensePost:'point',_defensePost:'point',
  orderDestination:'point',destination:'point'
};

var SOURCE_MAP=[
  [/commander-ai\.js/i,'force-command','system:commander'],
  [/commander-routes\.js/i,'force-command','system:commander'],
  [/01-capture-zone\.js/i,'capture-zone','system:objective'],
  [/16-squad-plan-stability\.js/i,'squad-stability','system:squad'],
  [/21-defender-engineers\.js/i,'prepared-defense','defense:defense'],
  [/20-building-hardpoints\.js/i,'building-hardpoints','system:engagement'],
  [/engagement\.js/i,'engagement','system:engagement'],
  [/squad-ai\.js/i,'squad-orders','system:squad'],
  [/battle-sim\.js/i,'simulation','system:soldier']
];
var OWNER_KEYS={
  'force-command':'system:commander','capture-zone':'system:objective','squad-stability':'system:squad',
  'prepared-defense':'defense:defense','building-hardpoints':'system:engagement','engagement':'system:engagement','movement-resolver':'system:resolver',
  'squad-orders':'system:squad','simulation':'system:soldier','engineer':'defense:engineer'
};
var OWNER_LABELS={
  'force-command':'Force Command','capture-zone':'Capture Zone','squad-stability':'Squad Stability',
  'prepared-defense':'Prepared Defense','building-hardpoints':'Building Hardpoints','engagement':'Engagement','movement-resolver':'Movement Resolver',
  'squad-orders':'Squad Orders','simulation':'Simulation','engineer':'Engineer','in-place/unknown':'Unknown in-place writer','unknown':'Unknown writer'
};

function now(sim){return sim&&isFinite(sim.time)?+sim.time:0;}
function clonePoint(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function snap(v,type){
  if(type==='point')return clonePoint(v);
  if(v==null)return null;
  if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return v;
  if(v&&v.id!=null)return String(v.id);
  try{return JSON.parse(JSON.stringify(v));}catch(_){return String(v);}
}
function pointDist(a,b){if(!a&&!b)return 0;if(!a||!b)return Infinity;return Math.hypot(a.x-b.x,a.z-b.z);}
function same(a,b,type){return type==='point'?pointDist(a,b)<=POINT_EPS:a===b;}
function fmt(v){
  if(v==null)return'—';
  if(v&&isFinite(v.x)&&isFinite(v.z))return Math.round(v.x)+','+Math.round(v.z);
  return String(v);
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function cap(s){return String(s||'').replace(/[-_]+/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function ownerLabel(o){return OWNER_LABELS[o]||cap(String(o||'unknown').replace(/^module:/,''));}
function graphKey(owner){return OWNER_KEYS[owner]||null;}
function targetMeta(target,kind){
  var sq=kind==='squad'?target:target&&target.squad;
  return{kind:kind,faction:(sq&&sq.faction)||(target&&target.faction)||null,squad:sq&&sq.id!=null?String(sq.id):null,soldier:kind==='soldier'&&target&&target.id!=null?String(target.id):null};
}
function targetStore(target){
  if(!target)return null;
  if(!Object.prototype.hasOwnProperty.call(target,'__orderProvenance')){
    try{Object.defineProperty(target,'__orderProvenance',{value:{fields:Object.create(null),events:[]},writable:true,configurable:true,enumerable:false});}
    catch(_){target.__orderProvenance={fields:Object.create(null),events:[]};}
  }
  return target.__orderProvenance;
}
function simStore(sim){
  if(!sim)return null;
  if(!sim._orderProvenance)sim._orderProvenance={version:VERSION,events:[],conflicts:[],seq:0,installedAt:now(sim)};
  return sim._orderProvenance;
}
function functionName(line){
  var m=String(line||'').match(/\bat\s+([^\s(]+)\s*(?:\(|$)/);return m?m[1].replace(/^Object\./,''):'';
}
function inferSource(){
  if(activeContext.length){var c=activeContext[activeContext.length-1];return{owner:c.owner||'unknown',key:c.key||graphKey(c.owner),site:c.reason||'explicit context'};}
  var stack='';try{stack=(new Error()).stack||'';}catch(_){}
  var lines=String(stack).split('\n');
  for(var i=1;i<lines.length;i++){
    var line=lines[i];if(/36-order-provenance\.js/i.test(line))continue;
    for(var j=0;j<SOURCE_MAP.length;j++)if(SOURCE_MAP[j][0].test(line))return{owner:SOURCE_MAP[j][1],key:SOURCE_MAP[j][2],site:functionName(line)||SOURCE_MAP[j][1]};
    var mm=line.match(/\/battle\/modules\/[^/]*?([a-z0-9-]+)\.js/i);if(mm)return{owner:'module:'+mm[1],key:null,site:functionName(line)||mm[1]};
  }
  return{owner:'unknown',key:null,site:'unattributed assignment'};
}
function withOwner(owner,reason,fn,key){activeContext.push({owner:owner,reason:reason,key:key});try{return fn();}finally{activeContext.pop();}}

function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
function recentFieldEvents(store,field){var out=[];for(var i=store.events.length-1;i>=0&&out.length<8;i--)if(store.events[i].field===field)out.unshift(store.events[i]);return out;}
function conflictKind(events,t){
  if(events.length>=3){var a=events[events.length-3],b=events[events.length-2],c=events[events.length-1];if(a.owner===c.owner&&a.owner!==b.owner&&c.time-a.time<=PINGPONG_WINDOW)return'writer-ping-pong';}
  var start=Math.max(0,events.length-5),owners=[],switches=0,last=null,firstTime=null;
  for(var i=start;i<events.length;i++){var e=events[i];if(firstTime==null)firstTime=e.time;if(e.owner!==last){if(last!=null)switches++;last=e.owner;if(owners.indexOf(e.owner)<0)owners.push(e.owner);}}
  if(owners.length>=3&&switches>=3&&t-firstTime<=PINGPONG_WINDOW)return'writer-churn';
  return null;
}
function addConflict(sim,target,event,kind){
  var ss=simStore(sim);if(!ss)return;var meta=targetMeta(target,event.targetKind),fieldEvents=recentFieldEvents(targetStore(target),event.field);
  var sig=[kind,meta.faction,meta.squad,meta.soldier,event.field,fieldEvents.slice(-3).map(function(e){return e.owner;}).join('>')].join('|');
  var last=ss.conflicts.length?ss.conflicts[0]:null;if(last&&last.signature===sig&&event.time-last.time<4)return;
  var c={signature:sig,kind:kind,time:event.time,field:event.field,faction:meta.faction,squad:meta.squad,soldier:meta.soldier,owners:fieldEvents.slice(-5).map(function(e){return e.owner;}),events:fieldEvents.slice(-5)};
  ss.conflicts.unshift(c);if(ss.conflicts.length>MAX_CONFLICTS)ss.conflicts.length=MAX_CONFLICTS;
  telemetry(sim,'order-writer-conflict',{kind:kind,field:event.field,faction:meta.faction,squad:meta.squad,soldier:meta.soldier,owners:c.owners});
  refreshUi();
}
function record(sim,target,kind,field,type,from,to,source,reason){
  var ts=targetStore(target),ss=simStore(sim);if(!ts||!ss)return null;
  var prev=ts.fields[field]&&ts.fields[field].lastEvent||null,meta=targetMeta(target,kind),event={
    id:++ss.seq,time:+now(sim).toFixed(3),targetKind:kind,field:field,from:from,to:to,
    owner:source.owner||'unknown',ownerKey:source.key||graphKey(source.owner),site:source.site||'',reason:reason||source.site||'',
    previousOwner:prev&&prev.owner||null,faction:meta.faction,squad:meta.squad,soldier:meta.soldier,
    phase:(kind==='squad'?target.commandPhase:target.squad&&target.squad.commandPhase)||null,
    rule:(kind==='squad'?target._lastDoctrineRule:target.squad&&target.squad._lastDoctrineRule)||null,
    inContact:!!(kind==='squad'?target.inContact:target.squad&&target.squad.inContact)
  };
  ts.events.push(event);if(ts.events.length>MAX_TARGET_EVENTS)ts.events.splice(0,ts.events.length-MAX_TARGET_EVENTS);
  ts.fields[field]=ts.fields[field]||{};ts.fields[field].lastEvent=event;ts.fields[field].last=to;
  ss.events.push(event);if(ss.events.length>MAX_GLOBAL_EVENTS)ss.events.splice(0,ss.events.length-MAX_GLOBAL_EVENTS);
  var fieldEvents=recentFieldEvents(ts,field),ck=conflictKind(fieldEvents,event.time);if(ck)addConflict(sim,target,event,ck);
  return event;
}

function instrumentField(sim,target,kind,field,type){
  if(!target)return;var ts=targetStore(target);if(!ts)return;var existing=ts.fields[field];if(existing&&existing.instrumented)return;
  var desc;try{desc=Object.getOwnPropertyDescriptor(target,field);}catch(_){}
  if(desc&&desc.configurable===false)return;
  var value=target[field],last=snap(value,type),state=existing||{};state.instrumented=true;state.type=type;state.last=last;ts.fields[field]=state;
  try{Object.defineProperty(target,field,{enumerable:desc?desc.enumerable!==false:true,configurable:true,get:function(){return value;},set:function(next){var before=state.last;value=next;var after=snap(next,type);if(!same(before,after,type)){var src=inferSource();record(sim,target,kind,field,type,before,after,src,src.site);state.last=after;}}});}
  catch(_){state.instrumented=false;}
}
function instrumentSquad(sim,sq){Object.keys(SQUAD_FIELDS).forEach(function(f){instrumentField(sim,sq,'squad',f,SQUAD_FIELDS[f]);});}
function instrumentSoldier(sim,s){Object.keys(SOLDIER_FIELDS).forEach(function(f){instrumentField(sim,s,'soldier',f,SOLDIER_FIELDS[f]);});}
function instrumentAll(sim){
  if(!sim)return;['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){instrumentSquad(sim,squads[i]);var m=squads[i].members||[];for(var j=0;j<m.length;j++)instrumentSoldier(sim,m[j]);}});
}
function sampleTarget(sim,target,kind,fields){
  var ts=targetStore(target);if(!ts)return;Object.keys(fields).forEach(function(field){var st=ts.fields[field];if(!st||!st.instrumented)return;var cur=snap(target[field],fields[field]);if(!same(st.last,cur,fields[field])){record(sim,target,kind,field,fields[field],st.last,cur,{owner:'in-place/unknown',key:null,site:'mutated without property assignment'},'in-place mutation detected by sampler');st.last=cur;}});
}
function sampleAll(sim){
  if(!sim)return;['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){sampleTarget(sim,squads[i],'squad',SQUAD_FIELDS);var m=squads[i].members||[];for(var j=0;j<m.length;j++)sampleTarget(sim,m[j],'soldier',SOLDIER_FIELDS);}});
}
function explicitWrite(sim,target,field,value,owner,reason,key){return withOwner(owner,reason,function(){target[field]=value;return value;},key);}
function history(target,field,limit){var ts=targetStore(target),a=ts?ts.events.slice():[];if(field)a=a.filter(function(e){return e.field===field;});limit=limit||20;return a.slice(Math.max(0,a.length-limit));}
function findSoldier(sim,faction,squadId,soldierId){var list=sim&&sim._roster&&sim._roster[faction]||[];for(var i=0;i<list.length;i++)if(String(list[i].id)===String(soldierId)&&(!squadId||!list[i].squad||String(list[i].squad.id)===String(squadId)))return list[i];return null;}
function findSquad(sim,faction,squadId){var list=sim&&sim.factions&&sim.factions[faction]&&sim.factions[faction].squads||[];for(var i=0;i<list.length;i++)if(String(list[i].id)===String(squadId))return list[i];return null;}
function recentForTarget(target,seconds,limit){
  var sim=root.__battle__,cut=now(sim)-(seconds==null?16:seconds),a=history(target,null,MAX_TARGET_EVENTS).filter(function(e){return e.time>=cut;});return a.slice(Math.max(0,a.length-(limit||10)));
}

/* ----------------------- Loop Watch integration -------------------------------------------- */
function parseCard(card){
  var text=card&&card.textContent||'',m=text.match(/\b(US|GE)\s+([a-z0-9_-]+)\s*[·•]\s*Soldier\s+([a-z0-9_-]+)/i);if(m)return{faction:m[1].toLowerCase(),squad:m[2],soldier:m[3]};
  m=text.match(/\b(US|GE)\s+([a-z0-9_-]+)/i);return m?{faction:m[1].toLowerCase(),squad:m[2],soldier:null}:null;
}
function ownerSequence(events){var out=[],last=null;events.forEach(function(e){if(e.owner!==last){out.push(e.owner);last=e.owner;}});return out;}
function traceKeys(events){var keys=[];events.forEach(function(e){var k=e.ownerKey||graphKey(e.owner);if(k&&keys.indexOf(k)<0)keys.push(k);});return keys;}
function decorateLoopCards(){
  var sim=root.__battle__,list=document.getElementById('lwList');if(!sim||!list)return;var cards=list.querySelectorAll('.lw-card');
  for(var i=0;i<cards.length;i++){
    var card=cards[i],id=parseCard(card);if(!id)continue;var target=id.soldier?findSoldier(sim,id.faction,id.squad,id.soldier):findSquad(sim,id.faction,id.squad);if(!target)continue;
    var events=recentForTarget(target,18,8),sig=events.map(function(e){return e.id;}).join(',');var old=card.querySelector('.op-loop-trace');if(old&&old.dataset.sig===sig)continue;if(old)old.remove();
    var box=document.createElement('div');box.className='op-loop-trace';box.dataset.sig=sig;
    if(!events.length)box.innerHTML='<b>ORDER PROVENANCE</b><span>No tracked order writes in the last 18 s.</span>';
    else{
      var owners=ownerSequence(events),rows=events.map(function(e){return'<div class="op-row"><em>'+e.time.toFixed(1)+'s</em><strong>'+esc(ownerLabel(e.owner))+'</strong><span>'+esc(e.field)+' '+esc(fmt(e.from))+' → '+esc(fmt(e.to))+'</span><small>'+esc(e.site)+(e.previousOwner&&e.previousOwner!==e.owner?' · from '+esc(ownerLabel(e.previousOwner)):'')+'</small></div>';}).join('');
      box.innerHTML='<b>ORDER PROVENANCE</b><div class="op-owner-seq">'+owners.map(function(o){return'<button type="button" data-op-owner="'+esc(o)+'">'+esc(ownerLabel(o))+'</button>';}).join('<i>→</i>')+'</div>'+rows;
      box.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-op-owner]');if(!b)return;e.stopPropagation();var key=graphKey(b.dataset.opOwner);if(key&&root.BattleAILoopWatch&&root.BattleAILoopWatch.highlight)root.BattleAILoopWatch.highlight([key]);});
      card.dataset.opKeys=traceKeys(events).join(',');
    }
    card.appendChild(box);
  }
}
function installLoopObserver(){
  var list=document.getElementById('lwList');if(!list||ui.loopList===list)return false;ui.loopList=list;ui.loopObserver=new MutationObserver(function(){requestAnimationFrame(decorateLoopCards);});ui.loopObserver.observe(list,{childList:true,subtree:true});decorateLoopCards();return true;
}

/* ----------------------- Order Trace panel -------------------------------------------------- */
function installStyle(){
  var s=document.createElement('style');s.textContent='\
#agOrderTraceButton.hot{border-color:#b45f5f!important;background:#4c2929!important;color:#ffc0c0!important}\
#agOrderTracePanel{position:absolute;z-index:14;right:12px;top:12px;width:470px;max-height:calc(100% - 24px);overflow:auto;background:#1b1e21f6;border:1px solid #555b60;border-radius:6px;box-shadow:0 8px 24px #000a;color:#cdd2d5;font:10px Arial}#agOrderTracePanel[hidden]{display:none!important}\
#agOrderTracePanel .op-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:9px 10px;background:#292d31;border-bottom:1px solid #44494e}#agOrderTracePanel .op-head b{color:#fff;font-size:11px}#agOrderTracePanel .op-head button{background:#34383c;color:#ddd;border:1px solid #555;border-radius:3px;cursor:pointer}\
#agOrderTracePanel .op-help{padding:8px 10px;color:#929ba1;border-bottom:1px solid #34383c;line-height:1.45}.op-conflict{padding:8px 10px;border-bottom:1px solid #34383c;cursor:pointer}.op-conflict:hover{background:#272c30}.op-conflict.ping{border-left:3px solid #da6767}.op-conflict.churn{border-left:3px solid #d49a52}.op-conflict-head{display:flex;justify-content:space-between;gap:8px}.op-conflict-head b{color:#fff}.op-conflict-head span{font:8px ui-monospace,monospace;color:#e8aa82}.op-conflict-meta{margin-top:4px;color:#9ea6ab}.op-conflict-seq{margin-top:5px;color:#7fc0d8;font:9px ui-monospace,monospace}.op-empty{padding:18px;color:#8e979d;text-align:center}\
#agLoopPanel{width:430px!important}.op-loop-trace{margin-top:7px;padding-top:7px;border-top:1px solid #43484c;color:#9da5aa}.op-loop-trace>b{display:block;color:#d8c38a;font:8px ui-monospace,monospace;letter-spacing:.05em;margin-bottom:4px}.op-loop-trace>span{font-size:9px}.op-owner-seq{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin-bottom:5px}.op-owner-seq button{padding:2px 4px;border:1px solid #52616a;border-radius:3px;background:#283138;color:#a9cedd;font:8px Arial;cursor:pointer}.op-owner-seq i{color:#687177;font-style:normal}.op-row{display:grid;grid-template-columns:36px 92px 1fr;gap:2px 5px;padding:3px 0;border-top:1px dotted #353a3e;font-size:8px}.op-row em{color:#777f85;font-style:normal}.op-row strong{color:#c7d3d9}.op-row span{color:#9bb6c2;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.op-row small{grid-column:2/4;color:#737d82}@media(max-width:900px){#agOrderTracePanel{width:min(470px,calc(100% - 24px))}}\
';document.head.appendChild(s);
}
function renderPanel(){
  if(!ui.list)return;var sim=root.__battle__,ss=sim&&sim._orderProvenance,conf=ss&&ss.conflicts||[];if(ui.button){ui.button.textContent='Order Trace · '+conf.length;ui.button.classList.toggle('hot',conf.length>0);}
  if(!conf.length){ui.list.innerHTML='<div class="op-empty">No writer ping-pong detected yet. Loop Watch can still show each soldier\'s recent order provenance.</div>';return;}
  ui.list.innerHTML=conf.slice(0,30).map(function(c){var label=(c.faction?c.faction.toUpperCase()+' ':'')+(c.squad||'')+(c.soldier?' · soldier '+c.soldier:'');return'<div class="op-conflict '+(c.kind==='writer-ping-pong'?'ping':'churn')+'" data-op-conflict="'+esc(c.signature)+'"><div class="op-conflict-head"><b>'+esc(label)+'</b><span>'+esc(c.kind)+'</span></div><div class="op-conflict-meta">'+esc(c.field)+' · '+c.time.toFixed(1)+' s</div><div class="op-conflict-seq">'+c.owners.map(function(o){return esc(ownerLabel(o));}).join(' → ')+'</div></div>';}).join('');
  var cards=ui.list.querySelectorAll('[data-op-conflict]');for(var i=0;i<cards.length;i++)cards[i].addEventListener('click',function(){var sig=this.dataset.opConflict,item=null;for(var j=0;j<conf.length;j++)if(conf[j].signature===sig){item=conf[j];break;}if(!item)return;var keys=traceKeys(item.events);if(keys.length&&root.BattleAILoopWatch&&root.BattleAILoopWatch.highlight)root.BattleAILoopWatch.highlight(keys);});
}
function togglePanel(){if(!ui.panel)return;ui.panel.hidden=!ui.panel.hidden;if(!ui.panel.hidden)renderPanel();}
function installUi(){
  if(typeof document==='undefined')return;var graph=document.getElementById('aiGraph'),view=document.getElementById('agView'),top=document.getElementById('agTop');if(!graph||!view||!top){if(ui.tries++<20)setTimeout(installUi,250);return;}
  if(document.getElementById('agOrderTracePanel')){installLoopObserver();return;}
  installStyle();var b=document.createElement('button');b.id='agOrderTraceButton';b.textContent='Order Trace · 0';b.title='Show which system wrote each order and detect writer ping-pong';var close=document.getElementById('agClose');top.insertBefore(b,close||null);ui.button=b;b.addEventListener('click',togglePanel);
  var p=document.createElement('div');p.id='agOrderTracePanel';p.hidden=true;p.innerHTML='<div class="op-head"><b>ORDER PROVENANCE + WRITER CONFLICTS</b><button type="button" id="opClose">×</button></div><div class="op-help">Step 2 instrumentation. Tracks the system that writes strategic intent, squad orders, prepared posts and final soldier destinations. A conflict is only raised for rapid multi-owner churn or A → B → A writer ping-pong; normal one-way handoffs remain visible but are not called a conflict.</div><div id="opConflictList"></div>';view.appendChild(p);ui.panel=p;ui.list=p.querySelector('#opConflictList');p.querySelector('#opClose').addEventListener('click',function(){p.hidden=true;});installLoopObserver();renderPanel();
}
function refreshUi(){if(typeof document==='undefined')return;requestAnimationFrame(function(){renderPanel();decorateLoopCards();});}

function installSim(sim){simStore(sim);instrumentAll(sim);sampleAll(sim);refreshUi();}
function resetSim(sim){if(!sim)return;sim._orderProvenance={version:VERSION,events:[],conflicts:[],seq:0,installedAt:now(sim)};}
root.BattleModules.registerSystem('zz-order-provenance',{
  version:VERSION,
  onBattleStart:function(sim){installSim(sim);},
  beforeBattleRestart:function(sim){resetSim(sim);},
  onBattleRestart:function(sim){installSim(sim);},
  onCommanderTick:function(sim){instrumentAll(sim);sampleAll(sim);decorateLoopCards();}
});
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUi,{once:true});else installUi();}

root.BattleOrderProvenance={
  version:VERSION,instrument:instrumentAll,sample:sampleAll,history:history,recent:recentForTarget,
  reset:resetSim,conflicts:function(sim){var s=simStore(sim||root.__battle__);return s?s.conflicts.slice():[];},
  events:function(sim){var s=simStore(sim||root.__battle__);return s?s.events.slice():[];},
  findSoldier:findSoldier,findSquad:findSquad,graphKey:graphKey,ownerLabel:ownerLabel,
  withOwner:withOwner,write:explicitWrite,decorateLoopCards:decorateLoopCards
};
console.log('[ORDER-PROVENANCE] Step 2 writer tracing active; battle behavior unchanged');
})(typeof window!=='undefined'?window:globalThis);

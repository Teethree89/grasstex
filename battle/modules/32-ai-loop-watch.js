/* AI graph diagnostics: readable rule aliases, connection highlighting, and short-loop detection.

   The loop detector is intentionally observational. It does not change commander or engagement
   behavior; it samples the existing authoritative states and reports repeating decision cycles or
   destination churn with little net progress. This makes the graph useful for finding the exact
   position-seeking traps the AI lab is meant to eliminate. */
(function(root){
'use strict';
if(!root.BattleModules||root.BattleAILoopWatch)return;

var SAMPLE_SECONDS=.9,HISTORY=14,ALERT_LIMIT=16,ALERT_COOLDOWN=6;
var LABEL_STORE='battleAiRuleLabelsV1';
var labels=loadLabels();
var ui={root:null,view:null,svg:null,nodes:null,panel:null,button:null,overlay:null,selected:[],observer:null,insObserver:null};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function cap(s){return String(s||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]+/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function clone(v){return JSON.parse(JSON.stringify(v));}
function dist(a,b){return a&&b?Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0)):Infinity;}
function q(v,step){step=step||2;return Math.round((+v||0)/step);}
function pointSig(p,step){return p?(q(p.x,step)+','+q(p.z,step)):'-';}
function loadLabels(){try{var v=JSON.parse(localStorage.getItem(LABEL_STORE)||'{}');return v&&typeof v==='object'?v:{};}catch(_){return{};}}
function saveLabels(){try{localStorage.setItem(LABEL_STORE,JSON.stringify(labels));}catch(_){}}
function defaultLabel(id,rule){
  var known={'press-neutral':'Press Neutral Objective','defend-pressure':'Defend Under Pressure','flank-strongpoint':'Flank Strongpoint','regroup-leaderless':'Regroup Without Leader'};
  if(known[id])return known[id];
  if(/^r-[a-z0-9]+-[0-9]+$/i.test(id)||/^rule-[0-9]+$/i.test(id))return 'Custom '+cap(rule&&rule.action||'Decision')+' Rule';
  return cap(id);
}
function ruleLabel(id,rule){var s=String(labels[id]||'').trim();return s||defaultLabel(id,rule);}
function setRuleLabel(id,value){value=String(value||'').trim().slice(0,64);if(value)labels[id]=value;else delete labels[id];saveLabels();decorateRuleNames();decorateInspectorName();}
function graphDraft(){try{return root.BattleAIGraphEditor&&root.BattleAIGraphEditor.draft?root.BattleAIGraphEditor.draft():null;}catch(_){return null;}}
function ruleById(id){var d=graphDraft(),rs=d&&d.rules||[];for(var i=0;i<rs.length;i++)if(rs[i].id===id)return rs[i];return null;}

/* ---------- Graph selection / aliases ------------------------------------------------------- */
function installGraphUi(){
  if(typeof document==='undefined'||!root.BattleAIGraphEditor)return;
  ui.root=document.getElementById('aiGraph');ui.view=document.getElementById('agView');ui.svg=document.getElementById('agSvg');ui.nodes=document.getElementById('agNodes');
  if(!ui.root||!ui.view||!ui.svg||!ui.nodes)return;
  var style=document.createElement('style');style.textContent='\
#aiGraph.ag-trace-active .ag-wire:not(.ag-selection-wire){opacity:.09!important}#aiGraph.ag-trace-active .ag-node{opacity:.32;filter:saturate(.55)}#aiGraph.ag-trace-active .ag-node.ag-trace-node{opacity:1;filter:none}#aiGraph .ag-node.ag-trace-node{box-shadow:0 0 0 2px #e5c676,0 9px 24px #0009}#aiGraph .ag-wire.ag-selection-wire{stroke:#f0cf77;stroke-width:4;opacity:1;filter:drop-shadow(0 0 3px #f0cf7780);pointer-events:none}\
#aiGraph .ag-rule-id{margin-top:5px;padding-top:4px;border-top:1px solid #46494d;color:#777f85;font:8px ui-monospace,SFMono-Regular,Menlo,monospace}#aiGraph .ag-name-note{font-size:8px;color:#80878d;margin-top:4px}\
#agLoopButton.hot{border-color:#c89049!important;background:#55391f!important;color:#ffd99a!important}#agLoopPanel{position:absolute;z-index:11;right:12px;top:12px;width:360px;max-height:calc(100% - 24px);overflow:auto;background:#1b1e21f2;border:1px solid #555b60;border-radius:6px;box-shadow:0 8px 24px #0009;color:#cdd2d5;font:10px Arial}#agLoopPanel[hidden]{display:none!important}#agLoopPanel .lw-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:9px 10px;background:#292d31;border-bottom:1px solid #44494e}#agLoopPanel .lw-head b{color:#fff;font-size:11px}#agLoopPanel .lw-head button{background:#34383c;color:#ddd;border:1px solid #555;border-radius:3px;cursor:pointer}#agLoopPanel .lw-help{padding:8px 10px;color:#8f989e;border-bottom:1px solid #34383c;line-height:1.4}.lw-card{padding:8px 10px;border-bottom:1px solid #34383c;cursor:pointer}.lw-card:hover{background:#272c30}.lw-card.warn{border-left:3px solid #d09b50}.lw-card.hot{border-left:3px solid #d85f5f}.lw-title{display:flex;gap:6px;align-items:center;color:#fff;font-weight:700}.lw-kind{padding:2px 4px;border-radius:3px;background:#463b2c;color:#f0ce91;font:8px ui-monospace,monospace}.lw-card.hot .lw-kind{background:#512c2c;color:#f1a2a2}.lw-meta{margin-top:4px;color:#a8afb4;line-height:1.35}.lw-seq{margin-top:5px;color:#7fb9d2;font:9px ui-monospace,monospace;white-space:normal;word-break:break-word}.lw-empty{padding:18px;color:#8e979d;text-align:center}.lw-clear{margin:8px;width:calc(100% - 16px);padding:6px;background:#34383c;color:#ddd;border:1px solid #555;border-radius:4px;cursor:pointer}\
';document.head.appendChild(style);

  var top=document.getElementById('agTop');if(top&&!document.getElementById('agLoopButton')){var b=document.createElement('button');b.id='agLoopButton';b.textContent='Loop Watch · 0';var close=document.getElementById('agClose');top.insertBefore(b,close||null);ui.button=b;b.onclick=function(){toggleLoopPanel();};}
  var p=document.createElement('div');p.id='agLoopPanel';p.hidden=true;p.innerHTML='<div class="lw-head"><b>LOOP WATCH</b><button type="button" id="lwClose">×</button></div><div class="lw-help">Flags short decision cycles and destination churn where units travel but make little net progress. Click an alert to trace the implicated graph path.</div><div id="lwList"></div><button class="lw-clear" id="lwClear" type="button">Clear alerts</button>';ui.view.appendChild(p);ui.panel=p;p.querySelector('#lwClose').onclick=function(){p.hidden=true;};p.querySelector('#lwClear').onclick=function(){var sim=root.__battle__;if(sim&&sim._aiLoopWatch){sim._aiLoopWatch.alerts=[];sim._aiLoopWatch.reported={};}renderLoopPanel();};

  ui.root.addEventListener('click',function(e){var n=e.target.closest&&e.target.closest('.ag-node');if(!n)return;setTimeout(function(){highlightKeys([n.dataset.k]);decorateInspectorName();},0);});
  ui.observer=new MutationObserver(function(muts){var needNames=false,needTrace=false;for(var i=0;i<muts.length;i++){if(muts[i].target===ui.svg&&ui.selected.length&&!document.getElementById('agSelectionOverlay'))needTrace=true;else needNames=true;}if(needNames)requestAnimationFrame(function(){decorateRuleNames();decorateInspectorName();});if(needTrace)requestAnimationFrame(function(){highlightKeys(ui.selected);});});
  ui.observer.observe(ui.nodes,{subtree:true,childList:true});ui.observer.observe(ui.svg,{childList:true});
  var ins=document.getElementById('agInspectorBody');if(ins){ui.insObserver=new MutationObserver(function(){requestAnimationFrame(decorateInspectorName);});ui.insObserver.observe(ins,{childList:true});}
  decorateRuleNames();renderLoopPanel();
}
function decorateRuleNames(){
  if(!ui.root)return;var d=graphDraft(),map={};(d&&d.rules||[]).forEach(function(r){map[r.id]=r;});var nodes=ui.root.querySelectorAll('.ag-node.rule');
  for(var i=0;i<nodes.length;i++){var k=nodes[i].dataset.k||'',id=k.slice(5),r=map[id];if(!r)continue;var title=nodes[i].querySelector('.ag-head>span');if(title)title.textContent=ruleLabel(id,r);var body=nodes[i].querySelector('.ag-body');if(body&&!body.querySelector('.ag-rule-id')){var x=document.createElement('div');x.className='ag-rule-id';x.textContent='ID: '+id;body.appendChild(x);}}
}
function selectedRuleId(){if(!ui.root)return null;var n=ui.root.querySelector('.ag-node.rule.selected');return n?(n.dataset.k||'').slice(5):null;}
function decorateInspectorName(){
  if(!ui.root)return;var id=selectedRuleId(),body=document.getElementById('agInspectorBody');if(!id||!body)return;if(body.querySelector('[data-ag-display-name]'))return;var r=ruleById(id);if(!r)return;
  var section=document.createElement('div');section.className='ag-section';section.setAttribute('data-ag-display-name','1');section.innerHTML='<h3>Rule Name</h3><div class="ag-row"><label>Display Name</label><input class="ag-text" id="agRuleDisplayName" maxlength="64" value="'+esc(ruleLabel(id,r))+'"></div><div class="ag-name-note">Internal ID stays <b>'+esc(id)+'</b> so telemetry and saved graph positions remain stable. Display names are saved in this browser.</div>';
  body.insertBefore(section,body.firstChild);var input=section.querySelector('#agRuleDisplayName');input.oninput=function(){setRuleLabel(id,input.value);};
}
function graphEdges(){
  var d=graphDraft(),edges=[];(d&&d.rules||[]).forEach(function(r){var rk='rule:'+r.id;(r.when||[]).forEach(function(c){edges.push({from:'condition:'+c,to:rk,cls:'cond'});});edges.push({from:rk,to:'action:'+r.action,cls:'act'});});
  ['assault','flank','defend','hold','regroup','support'].forEach(function(a){edges.push({from:'action:'+a,to:'system:commander',cls:'core'});});
  edges.push({from:'doctrine:main',to:'system:commander',cls:'core'},{from:'param:0',to:'system:commander',cls:'core'},{from:'param:1',to:'system:commander',cls:'core'},{from:'system:objective',to:'system:commander',cls:'runtime'},{from:'system:commander',to:'system:squad',cls:'runtime'},{from:'system:squad',to:'system:engagement',cls:'runtime'},{from:'system:engagement',to:'system:soldier',cls:'runtime'},{from:'system:squad',to:'defense:engineer',cls:'runtime'},{from:'defense:engineer',to:'defense:defense',cls:'runtime'},{from:'defense:defense',to:'system:engagement',cls:'runtime'});return edges;
}
function worldPoint(clientX,clientY){var world=document.getElementById('agWorld');if(!world)return null;var r=world.getBoundingClientRect(),sx=r.width/(world.offsetWidth||2380),sy=r.height/(world.offsetHeight||1750);return{x:(clientX-r.left)/(sx||1),y:(clientY-r.top)/(sy||1)};}
function socketPoint(k,side){if(!ui.nodes)return null;var n=ui.nodes.querySelector('[data-k="'+cssEscape(k)+'"]');if(!n)return null;var s=n.querySelector('.ag-sock.'+side);if(!s)return null;var r=s.getBoundingClientRect();return worldPoint(r.left+r.width/2,r.top+r.height/2);}
function cssEscape(v){return String(v).replace(/(["\\])/g,'\\$1');}
function overlayWire(a,b,cls){if(!a||!b||!ui.overlay)return;var dx=Math.max(55,Math.abs(b.x-a.x)*.45),p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y);p.setAttribute('class','ag-wire ag-selection-wire '+cls);ui.overlay.appendChild(p);}
function highlightKeys(keys){
  if(!ui.root||!ui.svg)return;ui.selected=(keys||[]).filter(Boolean);var old=document.getElementById('agSelectionOverlay');if(old)old.remove();var nodes=ui.root.querySelectorAll('.ag-node');for(var i=0;i<nodes.length;i++)nodes[i].classList.remove('ag-trace-node');if(!ui.selected.length){ui.root.classList.remove('ag-trace-active');return;}
  var selected={};ui.selected.forEach(function(k){selected[k]=1;});var edges=graphEdges(),trace={};Object.keys(selected).forEach(function(k){trace[k]=1;});var active=[];edges.forEach(function(e){if(selected[e.from]||selected[e.to]){active.push(e);trace[e.from]=trace[e.to]=1;}});
  ui.root.classList.add('ag-trace-active');Object.keys(trace).forEach(function(k){var n=ui.nodes.querySelector('[data-k="'+cssEscape(k)+'"]');if(n)n.classList.add('ag-trace-node');});
  ui.overlay=document.createElementNS('http://www.w3.org/2000/svg','g');ui.overlay.id='agSelectionOverlay';ui.svg.appendChild(ui.overlay);active.forEach(function(e){overlayWire(socketPoint(e.from,'out'),socketPoint(e.to,'in'),e.cls);});
}

/* ---------- Loop detector ------------------------------------------------------------------ */
function avgPosition(members){var x=0,z=0,n=0;for(var i=0;i<members.length;i++){var s=members[i];if(s.dead||!s.root)continue;x+=+s.root.position.x||0;z+=+s.root.position.z||0;n++;}return n?{x:x/n,z:z/n}:null;}
function avgOrder(members){var x=0,z=0,n=0;for(var i=0;i<members.length;i++){var s=members[i],p=s._fireteamDestination||s.orderDestination;if(s.dead||!p)continue;x+=+p.x||0;z+=+p.z||0;n++;}return n?{x:x/n,z:z/n}:null;}
function pushHistory(map,k,sample){var h=map[k]||(map[k]=[]);h.push(sample);if(h.length>HISTORY)h.splice(0,h.length-HISTORY);return h;}
function travelStats(h,field){var total=0;for(var i=1;i<h.length;i++)total+=dist(h[i-1][field],h[i][field]);return{travel:total,net:h.length>1?dist(h[0][field],h[h.length-1][field]):0,duration:h.length>1?h[h.length-1].time-h[0].time:0};}
function changes(h,field,threshold){var n=0;for(var i=1;i<h.length;i++)if(dist(h[i-1][field],h[i][field])>threshold)n++;return n;}
function repeatingPeriod(h,field,maxP){
  for(var p=2;p<=maxP;p++){if(h.length<p*3)continue;var ok=true,uniq={};for(var i=0;i<p;i++){var a=h[h.length-1-i][field],b=h[h.length-1-p-i][field],c=h[h.length-1-2*p-i][field];uniq[a]=1;if(a!==b||a!==c){ok=false;break;}}if(ok&&Object.keys(uniq).length>1)return p;}return 0;
}
function stateFor(sim){if(!sim._aiLoopWatch)sim._aiLoopWatch={lastSample:-999,squads:{},soldiers:{},alerts:[],reported:{}};return sim._aiLoopWatch;}
function reset(sim){sim._aiLoopWatch={lastSample:-999,squads:{},soldiers:{},alerts:[],reported:{}};renderLoopPanel();}
function emitAlert(sim,alert){
  var st=stateFor(sim),key=alert.kind+'|'+alert.faction+'|'+alert.squadId+'|'+(alert.soldierId==null?'':alert.soldierId),last=st.reported[key]||-999;if(sim.time-last<ALERT_COOLDOWN)return;st.reported[key]=sim.time;alert.at=sim.time;alert.key=key;st.alerts.unshift(alert);if(st.alerts.length>ALERT_LIMIT)st.alerts.length=ALERT_LIMIT;
  if(root.BattleTelemetry)root.BattleTelemetry.record('ai-loop-detected',{kind:alert.kind,severity:alert.severity,faction:alert.faction,squad:alert.squadId,soldier:alert.soldierId==null?null:alert.soldierId,phaseSequence:alert.phases||[],ruleSequence:alert.rules||[],goalWriters:alert.goalWriters||alert.sources||[],destinationChanges:alert.destinationChanges||0,travel:alert.travel||0,net:alert.net||0,localAvoidance:!!alert.localAvoidance,stuck:!!alert.stuck,inContact:!!alert.inContact},sim);
}
function detectSquad(sim,sq,h){
  if(h.length<7)return;var recent=h.slice(-9),p=repeatingPeriod(recent,'decisionSig',3),move=travelStats(recent,'pos'),orderChanges=changes(recent,'order',2.5),rules=recent.map(function(s){return s.rule;}).filter(Boolean),phases=recent.map(function(s){return s.phase;});
  if(p&&move.net<7&&move.duration>=4.5){emitAlert(sim,{kind:'decision-cycle',severity:'warn',faction:sq.faction,squadId:sq.id,message:'Repeating '+p+'-step command cycle with little progress',phases:phases,rules:Array.from(new Set(rules)),sequence:recent.slice(-p*3).map(function(s){return s.phase+(s.rule?' / '+s.rule:'');}),travel:+move.travel.toFixed(1),net:+move.net.toFixed(1),destinationChanges:orderChanges,inContact:!!recent[recent.length-1].inContact});}
  if(orderChanges>=4&&move.travel>=5&&move.net<4.5&&move.duration>=5){emitAlert(sim,{kind:'order-churn',severity:'warn',faction:sq.faction,squadId:sq.id,message:'Squad orders keep moving while the squad goes nowhere',phases:phases,rules:Array.from(new Set(rules)),sequence:recent.slice(-6).map(function(s){return s.orderSig;}),travel:+move.travel.toFixed(1),net:+move.net.toFixed(1),destinationChanges:orderChanges,inContact:!!recent[recent.length-1].inContact});}
}
function detectSoldier(sim,s,sq,h){
  if(h.length<8)return;var recent=h.slice(-10),move=travelStats(recent,'pos'),destChanges=changes(recent,'dest',2.2),period=repeatingPeriod(recent,'destSig',3),ratio=move.net>.5?move.travel/move.net:move.travel*2;
  if((period||destChanges>=5)&&move.travel>=6&&move.net<4.5&&ratio>2.2&&move.duration>=5.5){emitAlert(sim,{kind:'position-seeking',severity:'hot',faction:s.faction,squadId:sq.id,soldierId:s.id,message:'Soldier is cycling destinations without meaningful net movement',phases:Array.from(new Set(recent.map(function(x){return x.phase;}))),rules:Array.from(new Set(recent.map(function(x){return x.rule;}).filter(Boolean))),sequence:recent.slice(-8).map(function(x){return x.destSig+' ['+x.eng+(x.src?' <'+x.src+'>':'')+']';}),sources:Array.from(new Set(recent.map(function(x){return x.src;}).filter(Boolean))),goalWriters:recent.slice(-8).map(function(x){return x.src||'?';}),oldGoalsValid:recent.slice(-8).map(function(x){return x.goalValid==null?'?':(x.goalValid?'valid':'stale');}),localAvoidance:recent.some(function(x){return x.avoid;}),stuck:!!(s._movementProgress&&s._movementProgress.stuck),travel:+move.travel.toFixed(1),net:+move.net.toFixed(1),destinationChanges:destChanges,period:period,inContact:!!recent[recent.length-1].inContact});}
}
/* Sampling also runs under training/benchmark: the alerts are the automated QA signal for loop
   and position-seeking defects, and the panel render below is a no-op with no DOM. */
function sample(sim){
  if(!sim||sim.winner)return;var st=stateFor(sim);
  if(sim.time<st.lastSample){reset(sim);return;}
  if(sim.time-st.lastSample<SAMPLE_SECONDS)return;st.lastSample=sim.time;
  ['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){
    var sq=squads[i],members=(sq.members||[]).filter(function(s){return !s.dead&&s.root;}),pos=avgPosition(members),order=avgOrder(members);if(!pos)continue;
    var ss={time:sim.time,pos:pos,order:order,orderSig:pointSig(order,2.5),phase:sq.commandPhase||'',rule:sq._lastDoctrineRule||'',target:sq.targetObjective||'',goal:pointSig(sq.objective,3),inContact:!!sq.inContact};ss.decisionSig=[ss.phase,ss.rule,ss.target,ss.goal].join('|');var sh=pushHistory(st.squads,f+':'+sq.id,ss);detectSquad(sim,sq,sh);
    for(var j=0;j<members.length;j++){var s=members[j],dest=s.destination?{x:+s.destination.x||0,z:+s.destination.z||0}:null,mr=s._movementResolver,hist=mr&&mr.history,lastWrite=hist&&hist.length?hist[hist.length-1]:null,sp={time:sim.time,pos:{x:+s.root.position.x||0,z:+s.root.position.z||0},dest:dest,destSig:pointSig(dest,1.8),eng:s.eng&&s.eng.state||s.state||'',phase:ss.phase,rule:ss.rule,inContact:ss.inContact,src:lastWrite?(lastWrite.source+'/'+(lastWrite.reason||lastWrite.kind||'')):null,goalValid:lastWrite?!!lastWrite.oldGoalValid:null,avoid:!!(s._movementYieldUntil>sim.time||s._separatedAt>sim.time-1)};var hh=pushHistory(st.soldiers,f+':'+sq.id+':'+s.id,sp);detectSoldier(sim,s,sq,hh);}
  }});renderLoopPanel();
}

/* ---------- Loop Watch UI ------------------------------------------------------------------ */
function toggleLoopPanel(){if(!ui.panel)return;ui.panel.hidden=!ui.panel.hidden;if(!ui.panel.hidden)renderLoopPanel();}
function renderLoopPanel(){
  if(!ui.panel||!ui.button)return;var sim=root.__battle__,st=sim&&sim._aiLoopWatch,alerts=st&&st.alerts||[],list=ui.panel.querySelector('#lwList');ui.button.textContent='Loop Watch · '+alerts.length;ui.button.classList.toggle('hot',alerts.length>0);if(!list)return;
  if(!alerts.length){list.innerHTML='<div class="lw-empty">No short loops detected yet.<br>Run the battle and this panel will flag decision cycling or position seeking.</div>';return;}
  list.innerHTML=alerts.map(function(a,i){var who=a.faction.toUpperCase()+' '+a.squadId+(a.soldierId==null?'':' · soldier '+a.soldierId),meta='travel '+a.travel+'m · net '+a.net+'m · '+(a.destinationChanges||0)+' destination changes'+(a.inContact?' · in contact':' · out of contact');return'<div class="lw-card '+(a.severity==='hot'?'hot':'warn')+'" data-lw="'+i+'"><div class="lw-title"><span class="lw-kind">'+esc(a.kind)+'</span><span>'+esc(who)+'</span></div><div class="lw-meta">'+esc(a.message)+'<br>'+esc(meta)+'</div><div class="lw-seq">'+esc((a.sequence||[]).join(' → '))+'</div></div>';}).join('');
  var cards=list.querySelectorAll('[data-lw]');for(var i=0;i<cards.length;i++)cards[i].onclick=function(){var idx=+this.dataset.lw,a=alerts[idx];if(a)traceAlert(a);};
}
function traceAlert(a){
  var keys=['system:squad','system:engagement'];if(a.kind==='position-seeking')keys.push('system:resolver','system:soldier');if((a.phases||[]).some(function(p){return p==='capture'||p==='defend'||p==='hold';}))keys.push('defense:defense');var d=graphDraft();(a.rules||[]).forEach(function(id){keys.push('rule:'+id);var r=d&&d.rules&&d.rules.find(function(x){return x.id===id;});if(r)keys.push('action:'+r.action);});highlightKeys(Array.from(new Set(keys)));if(ui.panel)ui.panel.hidden=true;var status=document.getElementById('agStatus');if(status)status.textContent='Tracing '+a.kind+' · '+a.faction.toUpperCase()+' '+a.squadId+(a.soldierId==null?'':' soldier '+a.soldierId);}

root.BattleModules.registerSystem('ai-loop-watch',{
  version:'1.0',
  onBattleStart:function(sim){reset(sim);},
  onBattleRestart:function(sim){reset(sim);},
  onCommanderTick:function(sim){sample(sim);}
});

if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installGraphUi,{once:true});else installGraphUi();}
root.BattleAILoopWatch={sample:sample,alerts:function(sim){var st=sim&&sim._aiLoopWatch;return clone(st&&st.alerts||[]);},clear:function(sim){if(sim)reset(sim);},labelFor:ruleLabel,setLabel:setRuleLabel,highlight:highlightKeys};
console.log('[AI-GRAPH] connection trace + rule aliases + short-loop watch loaded');
})(typeof window!=='undefined'?window:globalThis);

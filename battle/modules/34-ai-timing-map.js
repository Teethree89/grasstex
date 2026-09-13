/* Visual timing/loop map for the Battle AI workbench.
   This module is intentionally observational: it exposes timers and repeat cycles that already
   exist in Commander, Squad Stability, Capture Zones, Engagement and Engineer/Defense code.
   It does not add a second timing/state-machine layer. */
(function(root){
'use strict';
if(typeof document==='undefined'||!root.BattleAIGraphEditor||root.BattleAITimingMap)return;

/* Fixed values below mirror current runtime constants that are not exported by their owning
   modules. They are labelled as fixed source constants in the UI; tunable policy values are read
   from the graph draft every render. */
var FIXED={
  postCaptureSecure:18,
  engageReview:7.0,
  stanceHold:4.0,
  proneHold:5.5,
  gunnerSetup:1.4,
  aimSettle:.40,
  coverClaim:14,
  engineerBuild:10,
  engineerMax:2,
  garrisonHold:'persistent'
};
var ui={root:null,view:null,nodes:null,button:null,panel:null,observer:null,scheduled:false};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function n(v,fallback){v=+v;return isFinite(v)?v:fallback;}
function fmt(v){if(v==='persistent')return'persistent';v=+v;if(!isFinite(v))return'—';return(v<1?v.toFixed(2):v<10?v.toFixed(1):Math.round(v))+'s';}
function draft(){try{return root.BattleAIGraphEditor.draft();}catch(_){return null;}}
function node(k){return ui.nodes&&ui.nodes.querySelector('[data-k="'+String(k).replace(/(["\\])/g,'\\$1')+'"]');}
function captureSeconds(){
  var b=root.__battle__,vals=[];(b&&b._objectives||[]).forEach(function(o){if(o&&o.type==='capture-zone'){var v=n(o.def&&o.def.captureSeconds,12);if(vals.indexOf(v)<0)vals.push(v);}});
  if(!vals.length)return[12];return vals.sort(function(a,b){return a-b;});
}
function values(){
  var d=draft()||{},p=d.parameters||{},st=root.BattleSquadStability||{},eng=root.BattleEngagement&&root.BattleEngagement.tuning||{},cmd=root.BattleCommanderAI||{};
  return{
    commandTick:n(cmd.commandTick,.45),objectiveVictory:n(cmd.objectiveHoldWin,35),replanAfter:n(root.BattleAICoordinationHealth&&root.BattleAICoordinationHealth.replanAfter,12),
    supportDelay:n(p.supportDelay,20),regroupHold:n(p.regroupHold,.40),cornerHold:n(p.cornerHold,.80),snapshot:n(p.decisionSnapshotSeconds,5),
    assaultPlan:n(st.planSeconds&&st.planSeconds.assault,26),defensePlan:n(st.planSeconds&&st.planSeconds.defense,38),teamOrder:n(st.teamOrderSeconds,12),defensePost:n(st.defensePostSeconds,45),
    alertHold:n(eng.ALERT_HOLD,4.5),boundCycle:n(eng.BOUND_CYCLE,9),boundDuration:n(eng.BOUND_DURATION,3.6),suppressPause:n(eng.SUPPRESS_PAUSE,2.6),resolverCommit:n(root.BattleMovementResolver&&root.BattleMovementResolver.orderCommit,1.35),combatOverride:n(root.BattleMovementResolver&&root.BattleMovementResolver.combatTTL,.75),
    engageReview:FIXED.engageReview,stanceHold:FIXED.stanceHold,proneHold:FIXED.proneHold,gunnerSetup:FIXED.gunnerSetup,aimSettle:FIXED.aimSettle,coverClaim:FIXED.coverClaim,
    capture:captureSeconds(),postCaptureSecure:FIXED.postCaptureSecure,engineerBuild:FIXED.engineerBuild,engineerMax:FIXED.engineerMax,garrisonHold:FIXED.garrisonHold
  };
}
function chip(label,value,kind,jump,title){return'<button type="button" class="atm-chip '+(kind||'fixed')+'"'+(jump?' data-atm-jump="'+esc(jump)+'"':'')+' title="'+esc(title||'')+'"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></button>';}
function ensureNodeTiming(k,html,signature){
  var el=node(k);if(!el)return;var body=el.querySelector('.ag-body');if(!body)return;var box=body.querySelector('.atm-node-timing');if(!box){box=document.createElement('div');box.className='atm-node-timing';body.appendChild(box);}if(box.dataset.sig===signature)return;box.dataset.sig=signature;box.innerHTML=html;
  box.querySelectorAll('[data-atm-jump]').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var target=node(b.dataset.atmJump);if(target)target.click();});});
}
function decorate(){
  if(!ui.nodes)return;var v=values(),capture=v.capture.map(fmt).join(' / ');
  ensureNodeTiming('system:objective','<div class="atm-label">EXISTING TIMERS</div><div class="atm-chips">'+chip('capture',capture,'fixed','', 'Capture-zone definition; defaults to 12 s')+chip('all-objective win',fmt(v.objectiveVictory),'fixed','', 'Commander objective hold victory window')+'</div>','o|'+capture+'|'+v.objectiveVictory);
  ensureNodeTiming('system:commander','<div class="atm-label">CADENCE / HOLDS</div><div class="atm-chips">'+chip('tick',fmt(v.commandTick),'fixed','', 'Commander reevaluates on this cadence')+chip('replan watch',fmt(v.replanAfter),'fixed','', 'Diagnostics flag stalled objective progress after this interval')+chip('support delay',fmt(v.supportDelay),'editable','param:0','Editable policy parameter')+chip('regroup',fmt(v.regroupHold),'editable','param:1','Editable policy parameter')+chip('corner',fmt(v.cornerHold),'editable','param:1','Editable policy parameter')+'</div>','c|'+[v.commandTick,v.replanAfter,v.supportDelay,v.regroupHold,v.cornerHold].join('|'));
  ensureNodeTiming('system:squad','<div class="atm-label">PLAN COMMITMENT</div><div class="atm-chips">'+chip('assault plan',fmt(v.assaultPlan),'fixed','', 'Squad stability commitment')+chip('defense plan',fmt(v.defensePlan),'fixed','', 'Squad stability commitment')+chip('team orders',fmt(v.teamOrder),'fixed','', 'Fireteam order refresh')+chip('defense post',fmt(v.defensePost),'fixed','', 'Arrived defensive slot freeze')+'</div>','s|'+[v.assaultPlan,v.defensePlan,v.teamOrder,v.defensePost].join('|'));
  ensureNodeTiming('system:engagement','<div class="atm-label">CONTACT LOOP</div><div class="atm-chips">'+chip('cover review',fmt(v.engageReview),'fixed','', 'Engage state re-opens cover choice')+chip('alert hold',fmt(v.alertHold),'fixed','', 'Hold threat sector after target loss')+chip('bound cycle',fmt(v.boundCycle),'fixed','', 'Minimum time between fireteam bounds')+chip('bound window',fmt(v.boundDuration),'fixed','', 'How long one team is authorised to move')+chip('stance',fmt(v.stanceHold),'fixed','', 'Normal stance commitment')+chip('prone',fmt(v.proneHold),'fixed','', 'Prone stance commitment')+'</div>','e|'+[v.engageReview,v.alertHold,v.boundCycle,v.boundDuration,v.stanceHold,v.proneHold].join('|'));
  ensureNodeTiming('system:resolver','<div class="atm-label">DESTINATION ARBITRATION</div><div class="atm-chips">'+chip('order commit',fmt(v.resolverCommit),'fixed','', 'Minimum commitment to a resolved movement destination')+chip('combat override',fmt(v.combatOverride),'fixed','', 'Expiry for a combat proposal unless Engagement renews it')+'</div>','r|'+[v.resolverCommit,v.combatOverride].join('|'));
  ensureNodeTiming('defense:engineer','<div class="atm-label">FORTIFICATION LOOP</div><div class="atm-chips">'+chip('safe build',fmt(v.engineerBuild),'fixed','', 'Uninterrupted safe occupation required before a work is built')+chip('runtime works',String(v.engineerMax),'fixed','', 'Maximum additional engineer works per faction/objective')+'</div>','eng|'+v.engineerBuild+'|'+v.engineerMax);
  ensureNodeTiming('defense:defense','<div class="atm-label">OBJECTIVE DEFENSE</div><div class="atm-chips">'+chip('secure window',fmt(v.postCaptureSecure),'fixed','', 'Capture-zone post-capture secure window')+chip('garrison',String(v.garrisonHold),'fixed','', 'Prepared strategic garrisons have no normal expiry timer')+chip('post freeze',fmt(v.defensePost),'fixed','', 'Squad stability defensive post freeze')+'</div>','d|'+v.postCaptureSecure+'|'+v.garrisonHold+'|'+v.defensePost);
  renderPanel();
}
function loopData(){var v=values(),capture=v.capture.map(fmt).join(' / ');return[
  {id:'command',title:'Commander → stable plan → commander',kind:'intended',keys:['system:commander','system:squad'],seq:['Commander tick '+fmt(v.commandTick),'accept plan','assault lock '+fmt(v.assaultPlan)+' / defense lock '+fmt(v.defensePlan),'plan expires','commander proposal can replace it'],note:'This is the anti-churn gate. Commander keeps evaluating, but Squad Stability holds the accepted tactical plan until its commitment expires.'},
  {id:'replan-health',title:'Objective progress → Force recovery intent',kind:'watch',keys:['system:objective','system:commander','system:squad'],seq:['sample assignments','watch objective state','no progress for '+fmt(v.replanAfter),'flag replan due','Force assigns capture intent','export recovery cause'],note:'Force Command consumes the health signal only for a targetless squad at the end of its route. It assigns an explicit capture intent; Squad Stability, Engagement and the Movement Resolver retain their existing ownership.'},
  {id:'objective',title:'Capture → request security → release',kind:'intended',keys:['system:objective','system:commander','system:squad','defense:defense'],seq:['capture '+capture,'publish security request','Force Command accepts defend','secure window '+fmt(v.postCaptureSecure),'if clear: release'],note:'Capture Zone publishes the short post-capture security constraint. Force Command remains the only writer of phase, target, and objective.'},
  {id:'contact',title:'Contact → fight → review / alert',kind:'intended',keys:['system:squad','system:engagement','system:soldier'],seq:['contact','orient / react','engage','cover review every '+fmt(v.engageReview),'target lost → alert '+fmt(v.alertHold),'advance if sector stays clear'],note:'This is the soldier-level engagement state loop. Cover is deliberately reconsidered on a timer rather than every frame.'},
  {id:'resolver',title:'Squad order + combat proposal → resolved destination',kind:'intended',keys:['system:squad','system:engagement','system:resolver','system:soldier'],seq:['stable squad order','active combat proposal wins','resolver writes destination','combat proposal expires '+fmt(v.combatOverride),'return to squad order'],note:'This is the single-writer boundary. Squad formation and combat behavior may both propose movement, but neither can overwrite the physical destination directly.'},
  {id:'bound',title:'Base of fire → bound → base of fire',kind:'intended',keys:['system:squad','system:engagement','system:soldier'],seq:['in contact','≥2 effective shooters','every '+fmt(v.boundCycle)+' authorize one team','move for '+fmt(v.boundDuration),'return to engage','repeat while contact persists'],note:'This is an intentional tactical loop; Loop Watch should not treat normal forward progress through it as pathological.'},
  {id:'engineer',title:'Secure ground → engineer → prepared defense',kind:'intended',keys:['defense:engineer','defense:defense','system:commander','system:squad','system:engagement'],seq:['friendly owned objective','engineer safe / out of contact '+fmt(v.engineerBuild),'build work','publish garrison/post constraint','Force Command accepts','up to '+v.engineerMax+' runtime works'],note:'Prepared Defense publishes persistent garrison/post constraints. Force Command owns strategic intent; Squad Stability owns live post destinations.'},
  {id:'overlap',title:'Important timing overlap',kind:'watch',keys:['system:objective','system:squad','defense:defense'],seq:['post-capture secure '+fmt(v.postCaptureSecure),'defense plan commitment '+fmt(v.defensePlan),'defense-post freeze '+fmt(v.defensePost),'prepared garrison: persistent'],note:'These are different owners. A capture-zone can be ready to release at '+fmt(v.postCaptureSecure)+' while Squad Stability is still committed to a defensive plan for '+fmt(v.defensePlan)+'. This is a prime place to inspect when a unit appears “stuck” after taking ground.'}
];}
function renderPanel(){if(!ui.panel)return;var list=ui.panel.querySelector('#atmList');if(!list)return;var loops=loopData();list.innerHTML=loops.map(function(x){return'<button type="button" class="atm-loop '+x.kind+'" data-atm-loop="'+esc(x.id)+'"><div class="atm-loop-head"><b>'+esc(x.title)+'</b><span>'+(x.kind==='watch'?'WATCH INTERACTION':'DESIGNED LOOP')+'</span></div><div class="atm-seq">'+x.seq.map(esc).join(' → ')+'</div><div class="atm-note">'+esc(x.note)+'</div></button>';}).join('');list.querySelectorAll('[data-atm-loop]').forEach(function(card){card.addEventListener('click',function(){var id=card.dataset.atmLoop,item=loops.filter(function(x){return x.id===id;})[0];if(item&&root.BattleAILoopWatch&&root.BattleAILoopWatch.highlight)root.BattleAILoopWatch.highlight(item.keys);});});}
function togglePanel(){if(!ui.panel)return;ui.panel.hidden=!ui.panel.hidden;if(!ui.panel.hidden){decorate();}}
function schedule(){if(ui.scheduled)return;ui.scheduled=true;requestAnimationFrame(function(){ui.scheduled=false;decorate();});}
function install(){
  ui.root=document.getElementById('aiGraph');ui.view=document.getElementById('agView');ui.nodes=document.getElementById('agNodes');if(!ui.root||!ui.view||!ui.nodes)return;
  var style=document.createElement('style');style.textContent='\
#aiGraph .atm-node-timing{margin-top:7px;padding-top:6px;border-top:1px solid #45494d}.atm-label{font:700 8px ui-monospace,SFMono-Regular,Menlo,monospace;color:#918a72;letter-spacing:.07em;margin-bottom:4px}.atm-chips{display:flex;flex-wrap:wrap;gap:3px}.atm-chip{display:inline-flex;gap:4px;align-items:center;padding:2px 5px;border:1px solid #55504a;border-radius:3px;background:#25272a;color:#aaa;font:8px Arial;cursor:default}.atm-chip b{color:#ead9a6;font-weight:700}.atm-chip.editable{border-color:#3f6d78;cursor:pointer}.atm-chip.editable:hover{background:#29383d}.atm-chip.editable b{color:#8dc8d5}\
#agTimingButton.hot{border-color:#8c7446!important;background:#504329!important;color:#f2dda8!important}#agTimingPanel{position:absolute;z-index:13;right:12px;top:12px;width:440px;max-height:calc(100% - 24px);overflow:auto;background:#1b1e21f4;border:1px solid #555b60;border-radius:6px;box-shadow:0 8px 24px #0009;color:#cdd2d5;font:10px Arial}#agTimingPanel[hidden]{display:none!important}#agTimingPanel .atm-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:9px 10px;background:#292d31;border-bottom:1px solid #44494e}#agTimingPanel .atm-head b{color:#fff;font-size:11px}#agTimingPanel .atm-head button{background:#34383c;color:#ddd;border:1px solid #555;border-radius:3px;cursor:pointer}.atm-help{padding:8px 10px;color:#929ba1;border-bottom:1px solid #34383c;line-height:1.45}.atm-loop{display:block;width:100%;text-align:left;padding:9px 10px;border:0;border-bottom:1px solid #34383c;background:transparent;color:#cdd2d5;cursor:pointer}.atm-loop:hover{background:#272c30}.atm-loop.watch{border-left:3px solid #d19a50;background:#2d281f}.atm-loop-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.atm-loop-head b{color:#fff;font-size:10px}.atm-loop-head span{font:7px ui-monospace,monospace;color:#9ca4a9}.atm-loop.watch .atm-loop-head span{color:#efc27c}.atm-seq{margin-top:5px;color:#82b7ce;font:9px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.45}.atm-note{margin-top:5px;color:#9da5aa;line-height:1.4}@media(max-width:900px){#agTimingPanel{width:min(440px,calc(100% - 24px))}}\
';document.head.appendChild(style);
  var top=document.getElementById('agTop');if(top&&!document.getElementById('agTimingButton')){var b=document.createElement('button');b.id='agTimingButton';b.textContent='Timing Map';b.title='Show existing AI timers and designed loops';var close=document.getElementById('agClose');top.insertBefore(b,close||null);ui.button=b;b.addEventListener('click',togglePanel);}
  var p=document.createElement('div');p.id='agTimingPanel';p.hidden=true;p.innerHTML='<div class="atm-head"><b>TIMING + DESIGNED LOOP MAP</b><button type="button" id="atmClose">×</button></div><div class="atm-help">These are timers and cycles already present in the runtime. Nothing here adds a new hold/assault state machine. Click a loop to trace the owning graph nodes; click empty canvas to clear the trace.</div><div id="atmList"></div>';ui.view.appendChild(p);ui.panel=p;p.querySelector('#atmClose').addEventListener('click',function(){p.hidden=true;});
  ui.observer=new MutationObserver(schedule);ui.observer.observe(ui.nodes,{subtree:true,childList:true});
  decorate();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
root.BattleAITimingMap={values:values,loops:loopData,refresh:decorate,open:function(){if(ui.panel){ui.panel.hidden=false;decorate();}}};
console.log('[AI-GRAPH] existing timing + designed loop map loaded');
})(typeof window!=='undefined'?window:globalThis);

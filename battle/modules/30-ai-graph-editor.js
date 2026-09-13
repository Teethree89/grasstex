/* Blender-style visual workbench for the constrained Battle AI Policy Genome v2.
   This editor only manipulates fields BattleAIPolicy already validates; it never executes
   arbitrary graph-authored code. Runtime pipeline nodes are intentionally descriptive/read-only. */
(function(root){
'use strict';
if(!root.BattleAIPolicy||typeof document==='undefined'||root.BattleAIGraphEditor)return;

var A=root.BattleAIPolicy;
var CONDITIONS=A.conditions.slice(),ACTIONS=A.actions.slice();
var DOCTRINE_RANGES={reserveFraction:[0,.42],localSuperiority:[.75,2.1],flankPreference:[0,1],defenseCommitment:[0,1],riskTolerance:[0,1]};
var PARAM_GROUPS=[
  ['Command Thresholds',['cohesionRadius','captainlessCohesion','captureCommitRatio','contactDistance','supportDelay','sectorNeutralNeed','sectorEnemyNeed','sectorActiveBonus','sectorDistanceWeight']],
  ['Movement & Formation',['routeArrivalRadius','finalRouteRadius','engagedRallyAdvance','pressObjectiveMinDistance','pressEnemyClearance','scoutLead','gunnerTrail','regroupHold','cornerHold']]
];
var CONDITION_HELP={
  objectiveNeutral:'The selected objective has no owner.',objectiveEnemy:'The enemy owns the selected objective.',objectiveOwned:'This faction owns the selected objective.',
  enemyNear:'An enemy is inside the configured contact distance.',outnumbered:'Local friendly/enemy strength is below the superiority target.',notOutnumbered:'Local strength meets or exceeds the superiority target.',
  captainDead:'The squad captain has been killed.',supportRole:'The squad is currently reserve or support.',insideObjective:'The squad is inside the selected objective radius.',underPressure:'A friendly objective currently has enemy pressure.'
};
var ACTION_HELP={
  assault:'Close on and seize the selected objective.',flank:'Move around the strongpoint before closing.',defend:'Hold friendly ground while reacting to pressure.',hold:'Stop the advance and preserve the current position.',
  regroup:'Restore cohesion before continuing.',support:'Back the primary effort rather than leading it.'
};
var SYSTEM_HELP={
  objective:'Objective System owns capture state, pressure and control counts.',commander:'Commander resolves doctrine, thresholds and the highest-weight matching rule into squad intent.',
  squad:'Squad AI turns commander intent into formation anchors, routes and stable orders.',engagement:'Engagement proposes short-lived combat movement, stance, cover and permission to fire.',resolver:'Movement Resolver is the single writer of the physical destination. It gives an active combat proposal priority over the stable squad order.',
  engineer:'Engineers fortify friendly occupied objectives when safe to work.',defense:'Prepared-position planner supplies cover obstacles and persistent claimable fighting posts.',
  soldier:'Executes the resolved destination: move, seek cover, aim, suppress and fire.'
};
var NODE_COLORS={condition:'#286f91',rule:'#8a3e69',action:'#996329',doctrine:'#77731f',param:'#267986',system:'#4e5d68',defense:'#5f6735'};
var STORAGE_KEY='battleAiGraphLayoutV2';
var S={open:false,scale:.72,x:24,y:20,draft:A.get(),nodes:{},selected:null,wireStart:null,drag:null,pan:null,space:false,wasPaused:true};
var E={};

function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function cap(s){return String(s).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/^./,function(c){return c.toUpperCase();});}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function key(type,id){return type+':'+id;}
function clone(v){return JSON.parse(JSON.stringify(v));}
function ruleById(id){for(var i=0;i<S.draft.rules.length;i++)if(S.draft.rules[i].id===id)return S.draft.rules[i];return null;}
function setDirty(v){E.dirty.textContent=v?'UNSAVED':'SYNCED';E.dirty.classList.toggle('hot',!!v);}
function setStatus(text,bad){E.status.textContent=text;E.status.classList.toggle('bad',!!bad);}
function markDirty(){setDirty(true);renderNodes();renderWires();renderInspector();}

function installStyle(){
  var style=document.createElement('style');
  style.textContent='\
#aiGraphToggle{position:fixed;right:12px;bottom:52px;z-index:16;padding:7px 10px;border:1px solid #55727d;border-radius:5px;background:#19272e;color:#e7f0f3;font:700 11px Arial;cursor:pointer;box-shadow:0 4px 14px #0005}\
#aiGraph[hidden]{display:none!important}#aiGraph{position:fixed;inset:0;z-index:120;background:#17191c;color:#ddd;font:11px Arial;display:grid;grid-template-rows:42px minmax(0,1fr);grid-template-columns:minmax(0,1fr) 322px;user-select:none}\
#agTop{grid-column:1/3;display:flex;align-items:center;gap:6px;padding:0 8px;background:#25282c;border-bottom:1px solid #0a0b0c;min-width:0}#agTop b{font-size:13px;color:#fff;white-space:nowrap}#agTop button{height:27px;padding:0 9px;border:1px solid #4d5258;border-radius:4px;background:#32363b;color:#e5e7e8;cursor:pointer;white-space:nowrap}#agTop button:hover{background:#3c4248}#agTop .go{background:#285365;border-color:#4a7b8b}#agTop .save{background:#485527;border-color:#6a7c3c}#agDirty{font:700 9px ui-monospace,monospace;color:#94a097}#agDirty.hot{color:#e6a95c}#agStatus{margin-left:auto;color:#9ca2a8;font-size:10px;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#agStatus.bad{color:#e58a8a}\
#agView{grid-row:2;grid-column:1;position:relative;overflow:hidden;background:#17191c radial-gradient(circle,#34383d 1px,transparent 1.2px);background-size:22px 22px;touch-action:none}#agWorld{position:absolute;width:2380px;height:1750px;transform-origin:0 0}#agSvg{position:absolute;inset:0;width:2380px;height:1750px;pointer-events:none}.ag-wire{fill:none;stroke:#71818b;stroke-width:2.2;opacity:.74}.ag-wire.cond{stroke:#5f94ad}.ag-wire.act{stroke:#b5834d}.ag-wire.core{stroke:#78878c;stroke-dasharray:6 5}.ag-wire.runtime{stroke:#72906f;stroke-width:2.5}.ag-wire.pending{stroke:#e0b56a;stroke-dasharray:4 4}\
.ag-node{position:absolute;width:220px;background:#303236;border:1px solid #111;border-radius:7px;box-shadow:0 7px 16px #0006,0 0 0 1px #ffffff0d inset;overflow:visible}.ag-node.selected{box-shadow:0 0 0 2px #b6c8d2,0 9px 22px #0008}.ag-head{height:30px;padding:0 10px;display:flex;align-items:center;gap:6px;border-radius:6px 6px 0 0;color:#fff;font-weight:700;cursor:grab}.ag-head small{margin-left:auto;font:8px ui-monospace,monospace;opacity:.65}.ag-body{padding:8px;min-height:30px}.ag-muted{color:#9ba1a7;font-size:9px;line-height:1.4}.ag-tags{margin-top:5px}.ag-tag{display:inline-block;background:#202226;border-radius:3px;padding:2px 5px;margin:1px 2px 1px 0;font-size:9px}.ag-sock{position:absolute;top:39px;width:13px;height:13px;border-radius:50%;border:2px solid #202225;box-sizing:border-box;background:#aeb5ba;cursor:crosshair;z-index:3}.ag-sock.in{left:-7px}.ag-sock.out{right:-7px}.ag-node.condition .ag-sock{background:#70a9c5}.ag-node.rule .ag-sock.in{background:#70a9c5}.ag-node.rule .ag-sock.out,.ag-node.action .ag-sock{background:#c59660}.ag-node.system .ag-sock,.ag-node.defense .ag-sock{background:#82a17a}.ag-sock.hot{box-shadow:0 0 0 3px #e0b56a66;background:#e0b56a}\
#agInspector{grid-row:2;grid-column:2;background:#24272b;border-left:1px solid #0b0c0d;overflow:auto;box-shadow:-5px 0 18px #0004}#agInspectorHead{position:sticky;top:0;z-index:2;background:#2d3035;border-bottom:1px solid #151618;padding:11px 12px}#agInspectorHead b{display:block;color:#fff;font-size:12px}#agInspectorHead small{display:block;margin-top:2px;color:#939aa1}#agInspectorBody{padding:10px 12px 24px}.ag-section{margin:0 0 14px;padding:0 0 12px;border-bottom:1px solid #3a3e42}.ag-section:last-child{border-bottom:0}.ag-section h3{margin:0 0 7px;color:#dfe3e5;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.ag-row{display:grid;grid-template-columns:minmax(90px,1fr) 128px;align-items:center;gap:7px;margin:6px 0}.ag-row label{color:#b4bbc0;min-width:0}.ag-row input[type=number],.ag-row select,.ag-text{width:100%;box-sizing:border-box;background:#1d2023;color:#e0e2e3;border:1px solid #4b5156;border-radius:3px;padding:5px;font-size:10px}.ag-range{display:grid;grid-template-columns:1fr 58px;gap:5px;align-items:center}.ag-range input[type=range]{width:100%;margin:0}.ag-check{display:flex;gap:7px;align-items:flex-start;padding:5px;border-radius:3px}.ag-check:hover{background:#30343a}.ag-check input{margin:2px 0 0}.ag-check span{line-height:1.35}.ag-button{width:100%;padding:6px;border:1px solid #50565c;border-radius:4px;background:#32363a;color:#e4e6e7;cursor:pointer;margin-top:5px}.ag-button.danger{background:#492929;border-color:#714242;color:#edcaca}.ag-kv{display:grid;grid-template-columns:1fr auto;gap:5px;padding:3px 0;color:#abb1b5}.ag-kv strong{color:#e1e4e5;font-weight:600}.ag-tip{padding:8px;background:#1d2023;border:1px solid #3d4247;border-radius:4px;color:#9fa6ab;line-height:1.45}.ag-legend{position:absolute;left:10px;bottom:10px;padding:6px 8px;background:#1b1d20e8;border:1px solid #41454a;border-radius:4px;color:#aeb3b8;font-size:9px;pointer-events:none}\
@media(max-width:900px){#aiGraph{grid-template-columns:minmax(0,1fr) 270px}#agTop button:nth-of-type(3),#agTop button:nth-of-type(4),#agTop button:nth-of-type(7){display:none}#agStatus{display:none}}';
  document.head.appendChild(style);
}

function inject(){
  installStyle();
  var toggle=document.createElement('button');toggle.id='aiGraphToggle';toggle.type='button';toggle.textContent='AI Graph';document.body.appendChild(toggle);
  var rootEl=document.createElement('div');rootEl.id='aiGraph';rootEl.hidden=true;
  rootEl.innerHTML='<div id="agTop"><b>AI NODE GRAPH</b><span id="agDirty">SYNCED</span><button class="go" id="agApply">Apply Live</button><button class="save" id="agSave">Save Policy</button><button id="agReload">Reload</button><button id="agDefaults">Defaults</button><button id="agAdd">+ Rule</button><button id="agFrame">Frame All</button><button id="agExport">Export</button><button id="agImport">Import</button><span id="agStatus">Policy Genome v2</span><button id="agClose">×</button></div><div id="agView"><div id="agWorld"><svg id="agSvg"></svg><div id="agNodes"></div></div><div class="ag-legend">wheel zoom · middle drag / Space+drag pan · drag headers · click sockets to rewire · Ctrl/Cmd+S saves</div></div><aside id="agInspector"><div id="agInspectorHead"><b>Inspector</b><small>Select a node</small></div><div id="agInspectorBody"><div class="ag-tip">Select a node to inspect or edit it. Runtime pipeline nodes are read-only; policy nodes edit the constrained Genome v2 model.</div></div></aside><input id="agImportFile" type="file" accept="application/json,.json" hidden>';
  document.body.appendChild(rootEl);
  E={toggle:toggle,root:rootEl,view:rootEl.querySelector('#agView'),world:rootEl.querySelector('#agWorld'),svg:rootEl.querySelector('#agSvg'),nodes:rootEl.querySelector('#agNodes'),dirty:rootEl.querySelector('#agDirty'),status:rootEl.querySelector('#agStatus'),insHead:rootEl.querySelector('#agInspectorHead'),insBody:rootEl.querySelector('#agInspectorBody'),importFile:rootEl.querySelector('#agImportFile')};
  toggle.onclick=function(){open(true);};rootEl.querySelector('#agClose').onclick=function(){open(false);};rootEl.querySelector('#agApply').onclick=applyLive;rootEl.querySelector('#agSave').onclick=savePolicy;rootEl.querySelector('#agReload').onclick=reloadPolicy;rootEl.querySelector('#agDefaults').onclick=loadDefaults;rootEl.querySelector('#agAdd').onclick=addRule;rootEl.querySelector('#agFrame').onclick=frameAll;rootEl.querySelector('#agExport').onclick=exportPolicy;rootEl.querySelector('#agImport').onclick=function(){E.importFile.click();};E.importFile.onchange=importPolicy;
  installNavigation();
}

function open(v){
  v=!!v;if(v===S.open)return;S.open=v;E.root.hidden=!v;E.toggle.hidden=v;var b=root.__battle__;
  if(v){S.wasPaused=!b||b.paused;if(b&&!b.paused)b.pause();S.draft=A.get();S.selected=null;S.wireStart=null;setDirty(false);buildGraph();requestAnimationFrame(frameAll);setStatus('Revision '+A.revision+' · battle paused while editing');}
  else{S.wireStart=null;if(b&&!S.wasPaused&&!b.winner)b.resume();}
}

function defaultPositions(){
  var p={};
  CONDITIONS.forEach(function(c,i){p[key('condition',c)]={x:40,y:40+i*82};});
  S.draft.rules.forEach(function(r,i){p[key('rule',r.id)]={x:380,y:45+i*110};});
  ACTIONS.forEach(function(a,i){p[key('action',a)]={x:720,y:55+i*120};});
  p[key('doctrine','main')]={x:40,y:940};p[key('param','0')]={x:300,y:940};p[key('param','1')]={x:560,y:940};
  p[key('system','objective')]={x:1020,y:430};p[key('system','commander')]={x:1020,y:115};p[key('system','squad')]={x:1325,y:115};p[key('system','engagement')]={x:1585,y:115};p[key('system','resolver')]={x:1845,y:115};p[key('system','soldier')]={x:2100,y:115};p[key('defense','engineer')]={x:1325,y:430};p[key('defense','defense')]={x:1625,y:430};
  try{var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');Object.keys(saved).forEach(function(k){if(saved[k]&&isFinite(saved[k].x)&&isFinite(saved[k].y))p[k]=saved[k];});}catch(_){}
  return p;
}
function savePositions(){var p={};Object.keys(S.nodes).forEach(function(k){p[k]={x:S.nodes[k].x,y:S.nodes[k].y};});try{localStorage.setItem(STORAGE_KEY,JSON.stringify(p));}catch(_){}}

function createNode(spec,pos){
  pos=pos||{x:0,y:0};var k=key(spec.type,spec.id),el=document.createElement('div');el.className='ag-node '+spec.type;el.dataset.k=k;el.style.left=pos.x+'px';el.style.top=pos.y+'px';
  el.innerHTML='<div class="ag-head" style="background:'+spec.color+'"><span>'+esc(spec.title)+'</span><small>'+esc(spec.badge||'')+'</small></div><div class="ag-body">'+(spec.body||'')+'</div>'+(spec.input?'<i class="ag-sock in" title="Input"></i>':'')+(spec.output?'<i class="ag-sock out" title="Output"></i>':'');
  E.nodes.appendChild(el);S.nodes[k]={type:spec.type,id:spec.id,x:pos.x,y:pos.y,el:el,spec:spec};
  el.addEventListener('click',function(e){if(e.target.classList.contains('ag-sock'))return;selectNode(k);});installNodeDrag(el);
  var input=el.querySelector('.ag-sock.in'),output=el.querySelector('.ag-sock.out');if(input)input.onclick=function(e){e.stopPropagation();socketClick(k,'in',input);};if(output)output.onclick=function(e){e.stopPropagation();socketClick(k,'out',output);};
  return el;
}
function conditionBody(id){var n=S.draft.rules.filter(function(r){return r.when.indexOf(id)>=0;}).length;return'<div class="ag-muted">'+esc(CONDITION_HELP[id]||'Tactical condition')+'</div><div class="ag-tags"><span class="ag-tag">'+n+' rule'+(n===1?'':'s')+'</span></div>';}
function ruleBody(r){return'<div class="ag-muted">All listed conditions must be true.</div><div class="ag-tags">'+r.when.map(function(c){return'<span class="ag-tag">'+esc(cap(c))+'</span>';}).join('')+'</div><div class="ag-tags"><span class="ag-tag">→ '+esc(cap(r.action))+'</span><span class="ag-tag">weight '+(+r.weight).toFixed(2)+'</span></div>';}
function actionBody(id){var n=S.draft.rules.filter(function(r){return r.action===id;}).length;return'<div class="ag-muted">'+esc(ACTION_HELP[id]||'Commander action')+'</div><div class="ag-tags"><span class="ag-tag">'+n+' incoming rule'+(n===1?'':'s')+'</span></div>';}
function policySummaryBody(title,items){return'<div class="ag-muted">'+esc(title)+'</div><div class="ag-tags">'+items.slice(0,4).map(function(k){return'<span class="ag-tag">'+esc(cap(k))+'</span>';}).join('')+(items.length>4?'<span class="ag-tag">+'+(items.length-4)+'</span>':'')+'</div>';}
function systemBody(id){var s=liveSystemSummary(id);return'<div class="ag-muted">'+esc(SYSTEM_HELP[id]||'Runtime system')+'</div><div class="ag-tags">'+s.map(function(x){return'<span class="ag-tag">'+esc(x)+'</span>';}).join('')+'</div>';}

function buildGraph(){
  E.nodes.innerHTML='';E.svg.innerHTML='';S.nodes={};var p=defaultPositions();
  CONDITIONS.forEach(function(c){createNode({type:'condition',id:c,title:cap(c),badge:'condition',body:conditionBody(c),color:NODE_COLORS.condition,input:false,output:true},p[key('condition',c)]);});
  S.draft.rules.forEach(function(r){createNode({type:'rule',id:r.id,title:r.id,badge:'rule',body:ruleBody(r),color:NODE_COLORS.rule,input:true,output:true},p[key('rule',r.id)]);});
  ACTIONS.forEach(function(a){createNode({type:'action',id:a,title:cap(a),badge:'action',body:actionBody(a),color:NODE_COLORS.action,input:true,output:true},p[key('action',a)]);});
  createNode({type:'doctrine',id:'main',title:'Doctrine',badge:'policy',body:policySummaryBody('Force allocation and objective strategy.',Object.keys(DOCTRINE_RANGES)),color:NODE_COLORS.doctrine,input:false,output:true},p[key('doctrine','main')]);
  PARAM_GROUPS.forEach(function(g,i){createNode({type:'param',id:String(i),title:g[0],badge:'policy',body:policySummaryBody('Numerical tuning values.',g[1]),color:NODE_COLORS.param,input:false,output:true},p[key('param',String(i))]);});
  createNode({type:'system',id:'objective',title:'Objective System',badge:'runtime',body:systemBody('objective'),color:NODE_COLORS.system,input:false,output:true},p[key('system','objective')]);
  createNode({type:'system',id:'commander',title:'Commander Decision',badge:'runtime',body:systemBody('commander'),color:NODE_COLORS.system,input:true,output:true},p[key('system','commander')]);
  createNode({type:'system',id:'squad',title:'Squad Orders',badge:'runtime',body:systemBody('squad'),color:NODE_COLORS.system,input:true,output:true},p[key('system','squad')]);
  createNode({type:'system',id:'engagement',title:'Engagement',badge:'combat proposal',body:systemBody('engagement'),color:NODE_COLORS.system,input:true,output:true},p[key('system','engagement')]);
  createNode({type:'system',id:'resolver',title:'Movement Resolver',badge:'final writer',body:systemBody('resolver'),color:NODE_COLORS.system,input:true,output:true},p[key('system','resolver')]);
  createNode({type:'system',id:'soldier',title:'Move / Aim / Fire',badge:'runtime',body:systemBody('soldier'),color:NODE_COLORS.system,input:true,output:false},p[key('system','soldier')]);
  createNode({type:'defense',id:'engineer',title:'Engineer',badge:'runtime',body:systemBody('engineer'),color:NODE_COLORS.defense,input:true,output:true},p[key('defense','engineer')]);
  createNode({type:'defense',id:'defense',title:'Prepared Defense',badge:'runtime',body:systemBody('defense'),color:NODE_COLORS.defense,input:true,output:true},p[key('defense','defense')]);
  if(S.selected&&!S.nodes[S.selected])S.selected=null;renderSelection();requestAnimationFrame(renderWires);renderInspector();
}
function renderNodes(){
  CONDITIONS.forEach(function(c){var n=S.nodes[key('condition',c)];if(n)n.el.querySelector('.ag-body').innerHTML=conditionBody(c);});
  S.draft.rules.forEach(function(r){var n=S.nodes[key('rule',r.id)];if(n)n.el.querySelector('.ag-body').innerHTML=ruleBody(r);});
  ACTIONS.forEach(function(a){var n=S.nodes[key('action',a)];if(n)n.el.querySelector('.ag-body').innerHTML=actionBody(a);});
  ['objective','commander','squad','engagement','resolver','soldier'].forEach(function(id){var n=S.nodes[key('system',id)];if(n)n.el.querySelector('.ag-body').innerHTML=systemBody(id);});
  ['engineer','defense'].forEach(function(id){var n=S.nodes[key('defense',id)];if(n)n.el.querySelector('.ag-body').innerHTML=systemBody(id);});
}

function socketCenter(k,side){var n=S.nodes[k];if(!n)return null;var sock=n.el.querySelector('.ag-sock.'+side);if(!sock)return null;return{x:n.x+sock.offsetLeft+6.5,y:n.y+sock.offsetTop+6.5};}
function addWire(a,b,cls){if(!a||!b)return;var dx=Math.max(55,Math.abs(b.x-a.x)*.45),path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y);path.setAttribute('class','ag-wire '+cls);E.svg.appendChild(path);}
function renderWires(){
  if(!E.svg)return;E.svg.innerHTML='';
  S.draft.rules.forEach(function(r){var rk=key('rule',r.id);r.when.forEach(function(c){addWire(socketCenter(key('condition',c),'out'),socketCenter(rk,'in'),'cond');});addWire(socketCenter(rk,'out'),socketCenter(key('action',r.action),'in'),'act');});
  ACTIONS.forEach(function(a){addWire(socketCenter(key('action',a),'out'),socketCenter(key('system','commander'),'in'),'core');});
  addWire(socketCenter(key('doctrine','main'),'out'),socketCenter(key('system','commander'),'in'),'core');addWire(socketCenter(key('param','0'),'out'),socketCenter(key('system','commander'),'in'),'core');addWire(socketCenter(key('param','1'),'out'),socketCenter(key('system','commander'),'in'),'core');addWire(socketCenter(key('system','objective'),'out'),socketCenter(key('system','commander'),'in'),'runtime');
  addWire(socketCenter(key('system','commander'),'out'),socketCenter(key('system','squad'),'in'),'runtime');addWire(socketCenter(key('system','squad'),'out'),socketCenter(key('system','engagement'),'in'),'runtime');addWire(socketCenter(key('system','squad'),'out'),socketCenter(key('system','resolver'),'in'),'runtime');addWire(socketCenter(key('system','engagement'),'out'),socketCenter(key('system','resolver'),'in'),'runtime');addWire(socketCenter(key('system','resolver'),'out'),socketCenter(key('system','soldier'),'in'),'runtime');
  addWire(socketCenter(key('system','squad'),'out'),socketCenter(key('defense','engineer'),'in'),'runtime');addWire(socketCenter(key('defense','engineer'),'out'),socketCenter(key('defense','defense'),'in'),'runtime');addWire(socketCenter(key('defense','defense'),'out'),socketCenter(key('system','engagement'),'in'),'runtime');
}

function socketClick(k,side,sock){
  var n=S.nodes[k];if(!n)return;selectNode(k);
  if(!S.wireStart){
    if(side!=='out')return setStatus('Start from an output socket',true);
    if(n.type!=='condition'&&n.type!=='rule')return setStatus('Runtime wires are read-only',true);
    S.wireStart={k:k,type:n.type,id:n.id};sock.classList.add('hot');setStatus(n.type==='condition'?'Choose a rule input':'Choose an action input');return;
  }
  var start=S.wireStart;clearSocketHot();S.wireStart=null;
  if(side!=='in')return setStatus('Connection cancelled');
  if(start.type==='condition'&&n.type==='rule'){
    var r=ruleById(n.id);if(r&&r.when.indexOf(start.id)<0){r.when.push(start.id);markDirty();}else renderInspector();setStatus('Connected '+cap(start.id)+' → '+n.id);return;
  }
  if(start.type==='rule'&&n.type==='action'){
    var rule=ruleById(start.id);if(rule){rule.action=n.id;markDirty();setStatus('Connected '+start.id+' → '+cap(n.id));}return;
  }
  setStatus('Those sockets are not compatible',true);
}
function clearSocketHot(){Object.keys(S.nodes).forEach(function(k){var s=S.nodes[k].el.querySelectorAll('.ag-sock.hot');for(var i=0;i<s.length;i++)s[i].classList.remove('hot');});}

function selectNode(k){S.selected=k;renderSelection();renderInspector();}
function renderSelection(){Object.keys(S.nodes).forEach(function(k){S.nodes[k].el.classList.toggle('selected',k===S.selected);});}
function inspectorTitle(title,sub){E.insHead.innerHTML='<b>'+esc(title)+'</b><small>'+esc(sub||'')+'</small>';}
function row(label,control){return'<div class="ag-row"><label>'+esc(label)+'</label>'+control+'</div>';}
function numberRange(scope,k,v,r){var span=r[1]-r[0],step=span>20?.1:(span>2?.01:.01);return'<div class="ag-range"><input type="range" data-range="'+scope+'|'+k+'" min="'+r[0]+'" max="'+r[1]+'" step="'+step+'" value="'+v+'"><input type="number" data-number="'+scope+'|'+k+'" min="'+r[0]+'" max="'+r[1]+'" step="'+step+'" value="'+v+'"></div>';}
function bindInspectorRanges(){E.insBody.querySelectorAll('[data-range]').forEach(function(sl){var parts=sl.dataset.range.split('|'),scope=parts[0],k=parts[1],num=E.insBody.querySelector('[data-number="'+scope+'|'+k+'"]'),range=scope==='p'?A.ranges[k]:DOCTRINE_RANGES[k];function set(v){var x=clamp(+v,range[0],range[1]);if(scope==='p')S.draft.parameters[k]=x;else S.draft.doctrine[k]=x;sl.value=x;num.value=x;setDirty(true);renderNodes();}sl.oninput=function(){set(sl.value);};num.onchange=function(){set(num.value);};});}
function renderInspector(){
  if(!S.selected||!S.nodes[S.selected]){inspectorTitle('Inspector','Select a node');E.insBody.innerHTML='<div class="ag-tip">Policy nodes are editable. Runtime nodes explain how the graph feeds Commander → Squad → Engagement and Engineer/Defense.</div>';return;}
  var n=S.nodes[S.selected],type=n.type,id=n.id,html='';
  if(type==='condition'){
    inspectorTitle(cap(id),'Condition');html='<div class="ag-section"><h3>Meaning</h3><div class="ag-tip">'+esc(CONDITION_HELP[id]||'Tactical condition')+'</div></div><div class="ag-section"><h3>Connected Rules</h3>';
    var using=S.draft.rules.filter(function(r){return r.when.indexOf(id)>=0;});html+=using.length?using.map(function(r){return'<button class="ag-button" data-select="'+esc(key('rule',r.id))+'">'+esc(r.id)+' · disconnect</button>';}).join(''):'<div class="ag-muted">No rules currently use this condition.</div>';html+='</div>';E.insBody.innerHTML=html;E.insBody.querySelectorAll('[data-select]').forEach(function(b){b.onclick=function(){var rid=b.dataset.select.slice(5),r=ruleById(rid);if(r){r.when=r.when.filter(function(c){return c!==id;});if(!r.when.length)r.when=['objectiveNeutral'];markDirty();setStatus('Disconnected '+cap(id)+' from '+rid);}};});return;
  }
  if(type==='rule'){
    var r=ruleById(id);if(!r)return;inspectorTitle(r.id,'Decision Rule');html='<div class="ag-section"><h3>Output</h3>'+row('Action','<select id="agRuleAction">'+ACTIONS.map(function(a){return'<option value="'+a+'" '+(a===r.action?'selected':'')+'>'+esc(cap(a))+'</option>';}).join('')+'</select>')+row('Weight',numberRange('rule','weight',r.weight,[.05,1]))+'</div><div class="ag-section"><h3>Conditions</h3>'+CONDITIONS.map(function(c){var checked=r.when.indexOf(c)>=0;return'<label class="ag-check"><input type="checkbox" data-cond="'+c+'" '+(checked?'checked':'')+'><span><strong>'+esc(cap(c))+'</strong><br><span class="ag-muted">'+esc(CONDITION_HELP[c]||'')+'</span></span></label>';}).join('')+'</div><button class="ag-button danger" id="agDeleteRule">Delete Rule</button>';E.insBody.innerHTML=html;
    E.insBody.querySelector('#agRuleAction').onchange=function(e){r.action=e.target.value;markDirty();};var weight=E.insBody.querySelector('[data-range="rule|weight"]'),wNum=E.insBody.querySelector('[data-number="rule|weight"]');function setw(v){r.weight=clamp(+v,.05,1);weight.value=wNum.value=r.weight;setDirty(true);renderNodes();renderWires();}weight.oninput=function(){setw(weight.value);};wNum.onchange=function(){setw(wNum.value);};E.insBody.querySelectorAll('[data-cond]').forEach(function(cb){cb.onchange=function(){if(cb.checked&&r.when.indexOf(cb.dataset.cond)<0)r.when.push(cb.dataset.cond);else if(!cb.checked)r.when=r.when.filter(function(c){return c!==cb.dataset.cond;});if(!r.when.length){r.when=['objectiveNeutral'];setStatus('A rule needs at least one condition; Objective Neutral restored',true);}markDirty();};});E.insBody.querySelector('#agDeleteRule').onclick=function(){deleteRule(r.id);};return;
  }
  if(type==='action'){
    inspectorTitle(cap(id),'Action');var target=S.draft.rules.filter(function(r){return r.action===id;});html='<div class="ag-section"><h3>Meaning</h3><div class="ag-tip">'+esc(ACTION_HELP[id]||'Commander action')+'</div></div><div class="ag-section"><h3>Incoming Rules</h3>'+(target.length?target.map(function(r){return'<button class="ag-button" data-rule="'+esc(r.id)+'">'+esc(r.id)+' · weight '+(+r.weight).toFixed(2)+'</button>';}).join(''):'<div class="ag-muted">No rule currently selects this action.</div>')+'</div>';E.insBody.innerHTML=html;E.insBody.querySelectorAll('[data-rule]').forEach(function(b){b.onclick=function(){selectNode(key('rule',b.dataset.rule));};});return;
  }
  if(type==='doctrine'){
    inspectorTitle('Doctrine','Editable Policy');var d=S.draft.doctrine;html='<div class="ag-section"><h3>Objective Selection</h3>'+row('Strategy','<select id="agStrategy">'+A.strategies.map(function(s){return'<option '+(s===d.objectiveStrategy?'selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select>')+'</div><div class="ag-section"><h3>Force Doctrine</h3>'+Object.keys(DOCTRINE_RANGES).map(function(k){return row(cap(k),numberRange('d',k,d[k],DOCTRINE_RANGES[k]));}).join('')+'</div>';E.insBody.innerHTML=html;E.insBody.querySelector('#agStrategy').onchange=function(e){d.objectiveStrategy=e.target.value;setDirty(true);renderNodes();};bindInspectorRanges();return;
  }
  if(type==='param'){
    var g=PARAM_GROUPS[+id];inspectorTitle(g[0],'Editable Parameters');html='<div class="ag-section"><h3>Tuning</h3>'+g[1].map(function(k){return row(cap(k),numberRange('p',k,S.draft.parameters[k],A.ranges[k]));}).join('')+'</div>';E.insBody.innerHTML=html;bindInspectorRanges();return;
  }
  inspectorTitle(type==='defense'?(id==='engineer'?'Engineer':'Prepared Defense'):cap(id),'Runtime · Read Only');var live=liveSystemSummary(id);html='<div class="ag-section"><h3>Role</h3><div class="ag-tip">'+esc(SYSTEM_HELP[id]||'Runtime system')+'</div></div><div class="ag-section"><h3>Live State</h3>'+live.map(function(v){var parts=v.split(':');return'<div class="ag-kv"><span>'+esc(parts[0])+'</span><strong>'+esc(parts.slice(1).join(':')||'—')+'</strong></div>';}).join('')+'</div>';E.insBody.innerHTML=html;
}

function liveSystemSummary(id){
  var b=root.__battle__,out=[];if(!b)return['battle: not initialized'];
  if(id==='objective'){var c=b.objectiveControl&&b.objectiveControl.counts||{};out.push('US: '+(c.us||0),'GER: '+(c.ge||0),'total: '+(b.objectiveControl&&b.objectiveControl.total||0));}
  else if(id==='commander'){var h=b._coordinationHealth&&b._coordinationHealth.sides||{},due=['us','ge'].filter(function(f){return h[f]&&h[f].replanDue;}).map(function(f){return f.toUpperCase();}),missing=['us','ge'].map(function(f){return(f.toUpperCase()+':'+(h[f]&&h[f].unassignedTargets||0));}),recoveries=b._objectiveRecovery||{};out.push('revision: '+A.revision,'strategy: '+(S.draft.doctrine&&S.draft.doctrine.objectiveStrategy||'—'),'rules: '+S.draft.rules.length,'targets unassigned: '+missing.join(' '),'replan due: '+(due.join('/')||'none'),'objective recoveries: US '+(recoveries.us&&recoveries.us.count||0)+' · GER '+(recoveries.ge&&recoveries.ge.count||0));}
  else if(id==='squad'){var us=b.factions&&b.factions.us&&b.factions.us.squads||[],ge=b.factions&&b.factions.ge&&b.factions.ge.squads||[];out.push('US squads: '+us.filter(function(s){return s.aliveCount>0;}).length,'GER squads: '+ge.filter(function(s){return s.aliveCount>0;}).length);}
  else if(id==='engagement'){var squads=[];['us','ge'].forEach(function(f){squads=squads.concat(b.factions&&b.factions[f]&&b.factions[f].squads||[]);});out.push('in contact: '+squads.filter(function(s){return !!s.inContact;}).length,'time: '+(b.time||0).toFixed(1)+'s');}
  else if(id==='resolver'){var r=root.BattleMovementResolver&&root.BattleMovementResolver.summary?root.BattleMovementResolver.summary(b):null;out.push('combat override: '+(r?r.combat:0),'squad order: '+(r?r.orders:0),'destination changes: '+(r?r.changed:0));}
  else if(id==='engineer'){var n=0;['us','ge'].forEach(function(f){(b._roster&&b._roster[f]||[]).forEach(function(s){if(!s.dead&&s.role==='engineer')n++;});});out.push('alive: '+n,'active builds: '+Object.keys(b._engineerBuild&&b._engineerBuild.progress||{}).length);}
  else if(id==='defense'){var plan=b._defensePlan||{},sides=b._sides||{};out.push('defender: '+(sides.defender||'meeting'),'works: '+((plan.works||[]).length),'posts: '+((plan.posts||[]).length));}
  else if(id==='soldier'){out.push('US alive: '+(b.factions&&b.factions.us?b.factions.us.alive:0),'GER alive: '+(b.factions&&b.factions.ge?b.factions.ge.alive:0));}
  return out;
}

function installNodeDrag(el){
  el.onpointerdown=function(e){if(e.button!==0||!e.target.closest('.ag-head'))return;var n=S.nodes[el.dataset.k];S.drag={pointer:e.pointerId,n:n,cx:e.clientX,cy:e.clientY,x:n.x,y:n.y};el.setPointerCapture(e.pointerId);e.preventDefault();};
  el.onpointermove=function(e){if(!S.drag||S.drag.pointer!==e.pointerId)return;var d=S.drag,n=d.n;n.x=d.x+(e.clientX-d.cx)/S.scale;n.y=d.y+(e.clientY-d.cy)/S.scale;n.el.style.left=n.x+'px';n.el.style.top=n.y+'px';renderWires();};
  el.onpointerup=function(e){if(S.drag&&S.drag.pointer===e.pointerId){S.drag=null;savePositions();}};
}
function installNavigation(){
  E.view.onwheel=function(e){e.preventDefault();var rect=E.view.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top,old=S.scale,next=clamp(old*Math.exp(-e.deltaY*.0012),.35,1.6),wx=(mx-S.x)/old,wy=(my-S.y)/old;S.scale=next;S.x=mx-wx*next;S.y=my-wy*next;applyTransform();};
  E.view.onpointerdown=function(e){if(!(e.button===1||(e.button===0&&S.space))||e.target.closest('.ag-node'))return;S.pan={pointer:e.pointerId,cx:e.clientX,cy:e.clientY,x:S.x,y:S.y};E.view.setPointerCapture(e.pointerId);e.preventDefault();};
  E.view.onpointermove=function(e){if(!S.pan||S.pan.pointer!==e.pointerId)return;S.x=S.pan.x+e.clientX-S.pan.cx;S.y=S.pan.y+e.clientY-S.pan.cy;applyTransform();};E.view.onpointerup=function(e){if(S.pan&&S.pan.pointer===e.pointerId)S.pan=null;};
  window.addEventListener('keydown',function(e){if(!S.open)return;if(e.code==='Space'){S.space=true;e.preventDefault();}if(e.key==='Escape'){if(S.wireStart){clearSocketHot();S.wireStart=null;setStatus('Connection cancelled');}else open(false);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();savePolicy();}});window.addEventListener('keyup',function(e){if(e.code==='Space')S.space=false;});
}
function applyTransform(){E.world.style.transform='translate('+S.x+'px,'+S.y+'px) scale('+S.scale+')';}
function frameAll(){var ks=Object.keys(S.nodes);if(!ks.length)return;var a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;ks.forEach(function(k){var n=S.nodes[k];a=Math.min(a,n.x);b=Math.min(b,n.y);c=Math.max(c,n.x+(n.el.offsetWidth||220));d=Math.max(d,n.y+(n.el.offsetHeight||80));});var rect=E.view.getBoundingClientRect(),w=c-a,h=d-b;S.scale=clamp(Math.min((rect.width-70)/w,(rect.height-70)/h),.35,1.05);S.x=(rect.width-w*S.scale)/2-a*S.scale;S.y=(rect.height-h*S.scale)/2-b*S.scale;applyTransform();}

function addRule(){if(S.draft.rules.length>=12)return setStatus('Policy limit is 12 rules',true);var i=1,id;do{id='rule-'+i++;}while(ruleById(id));S.draft.rules.push({id:id,when:['objectiveNeutral'],action:'assault',weight:.5});setDirty(true);buildGraph();S.selected=key('rule',id);renderSelection();renderInspector();setStatus('Added '+id);}
function deleteRule(id){if(S.draft.rules.length<=1)return setStatus('At least one rule is required',true);S.draft.rules=S.draft.rules.filter(function(r){return r.id!==id;});S.selected=null;setDirty(true);buildGraph();setStatus('Deleted '+id);}
function normalizedDraft(){S.draft=A.normalize(S.draft);return S.draft;}
function applyLive(){normalizedDraft();A.set(S.draft);var b=root.__battle__;if(b&&A.setMatchPolicies)A.setMatchPolicies(b,S.draft,S.draft);setDirty(false);buildGraph();setStatus('Applied live to both factions · revision '+A.revision);}
function savePolicy(){normalizedDraft();setStatus('Saving…');A.persist(S.draft,{source:'visual-ai-graph-v2',build:root.BATTLE_BUILD||null}).then(function(j){S.draft=A.get();var b=root.__battle__;if(b&&A.setMatchPolicies)A.setMatchPolicies(b,S.draft,S.draft);setDirty(false);buildGraph();setStatus('Saved revision '+(j.revision||A.revision));}).catch(function(e){setStatus('Save failed: '+(e&&e.message||e),true);});}
function reloadPolicy(){setStatus('Reloading…');A.refresh().then(function(r){S.draft=r.genome;S.selected=null;setDirty(false);buildGraph();frameAll();setStatus('Loaded revision '+r.revision);}).catch(function(e){setStatus('Reload failed: '+(e&&e.message||e),true);});}
function loadDefaults(){S.draft=clone(A.defaults);S.selected=null;setDirty(true);buildGraph();frameAll();setStatus('Defaults loaded locally — Apply or Save to use them');}
function exportPolicy(){var blob=new Blob([JSON.stringify(A.normalize(S.draft),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='battle-ai-policy.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},0);setStatus('Exported battle-ai-policy.json');}
function importPolicy(){var file=E.importFile.files&&E.importFile.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){try{var parsed=JSON.parse(String(reader.result||''));S.draft=A.normalize(parsed);S.selected=null;setDirty(true);buildGraph();frameAll();setStatus('Imported '+file.name+' locally — Apply or Save to use it');}catch(e){setStatus('Import failed: '+(e&&e.message||e),true);}finally{E.importFile.value='';}};reader.readAsText(file);}

inject();
root.BattleAIGraphEditor={open:open,apply:applyLive,save:savePolicy,frame:frameAll,draft:function(){return clone(S.draft);}};
if(new URLSearchParams(location.search).get('editor')==='ai'||location.hash==='#ai-graph')setTimeout(function(){open(true);},0);
console.log('[AI-GRAPH] Blender-style Policy Genome workbench loaded');
})(typeof window!=='undefined'?window:globalThis);

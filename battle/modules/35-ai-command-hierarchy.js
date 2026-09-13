/* Command-hierarchy truth map for the Visual AI workbench.
   Step 1 is deliberately observational: it corrects the graph's mental model without changing
   battle decisions. Force Command owns strategic squad intent. The physical captain is currently
   a leadership/status influence and combatant, not a second tactical-order authority. */
(function(root){
'use strict';
if(typeof document==='undefined'||!root.BattleAIGraphEditor||root.BattleAICommandHierarchy)return;

var STORE='battleAiCaptainLeadershipNodeV1';
var ui={root:null,view:null,world:null,nodes:null,svg:null,captain:null,observer:null,scheduled:false,drag:null,trace:null};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function num(v,f){v=+v;return isFinite(v)?v:f;}
function graphNode(k){return ui.nodes&&ui.nodes.querySelector('[data-k="'+String(k).replace(/(["\\])/g,'\\$1')+'"]');}
function draft(){try{return root.BattleAIGraphEditor.draft();}catch(_){return null;}}
function params(){var d=draft();return d&&d.parameters||{};}
function nodeXY(n){return{x:num(n&&parseFloat(n.style.left),n&&n.offsetLeft||0),y:num(n&&parseFloat(n.style.top),n&&n.offsetTop||0)};}
function socketPoint(n,side){if(!n)return null;var s=n.querySelector('.ag-sock.'+side);if(!s)return null;var p=nodeXY(n);return{x:p.x+s.offsetLeft+s.offsetWidth/2,y:p.y+s.offsetTop+s.offsetHeight/2};}
function path(a,b){if(!a||!b)return'';var dx=Math.max(60,Math.abs(b.x-a.x)*.42);return'M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y;}
function savedPosition(){try{var p=JSON.parse(localStorage.getItem(STORE)||'null');if(p&&isFinite(p.x)&&isFinite(p.y))return{x:+p.x,y:+p.y};}catch(_){}return null;}
function savePosition(){if(!ui.captain)return;var p=nodeXY(ui.captain);try{localStorage.setItem(STORE,JSON.stringify(p));}catch(_){}}

function installStyle(){
  var s=document.createElement('style');s.textContent='\
#aiGraph .ach-owner{margin-top:7px;padding:6px;border:1px solid #4a5055;border-radius:4px;background:#26292c;color:#aab2b7;font-size:8px;line-height:1.45}#aiGraph .ach-owner b{color:#e6e9eb}#aiGraph .ach-owner .what{color:#87c7df;font-weight:700}#aiGraph .ach-owner .how{color:#a9d39e;font-weight:700}\
#aiGraph .ag-node.leadership{width:250px;background:#303531;border-color:#172018}#aiGraph .ag-node.leadership .ag-head{background:#526b48!important}#aiGraph .ag-node.leadership .ag-sock{background:#9abb83}#aiGraph .ach-captain-status{display:grid;grid-template-columns:1fr auto;gap:3px 8px;margin-top:5px;padding-top:5px;border-top:1px solid #485049;color:#9fa9a0;font-size:8px}#aiGraph .ach-captain-status b{color:#dce7d8}\
#aiGraph #agHierarchySvg{position:absolute;left:0;top:0;width:20000px;height:12000px;overflow:visible;z-index:4;pointer-events:none}#aiGraph .ach-wire{fill:none;stroke:#91aa83;stroke-width:2.6;stroke-dasharray:7 5;opacity:.82}#aiGraph .ach-wire-label{fill:#a9bc9f;font:8px ui-monospace,SFMono-Regular,Menlo,monospace;paint-order:stroke;stroke:#17191c;stroke-width:3px;stroke-linejoin:round}\
#aiGraph .ach-trace-node{opacity:1!important;filter:none!important;box-shadow:0 0 0 2px #a7d497,0 9px 24px #0009!important}#aiGraph #agHierarchyTrace{position:absolute;left:0;top:0;width:20000px;height:12000px;overflow:visible;z-index:55;pointer-events:none}#aiGraph #agHierarchyTrace .ach-wire{stroke:#b8e7a7;stroke-width:4.5;opacity:1;filter:drop-shadow(0 0 4px #8fca7daa)}\
#aiGraph .ach-key{position:absolute;left:10px;top:10px;z-index:12;max-width:330px;padding:7px 9px;border:1px solid #444a4f;border-radius:4px;background:#1b1e21e8;color:#939ca2;font:9px Arial;line-height:1.45;pointer-events:none}#aiGraph .ach-key b{color:#e5e8ea}#aiGraph .ach-key .what{color:#87c7df}#aiGraph .ach-key .how{color:#a9d39e}\
';document.head.appendChild(s);
}
function ensureSvg(id,z){var old=document.getElementById(id);if(old)return old;var s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.id=id;s.setAttribute('width','20000');s.setAttribute('height','12000');s.style.zIndex=String(z);ui.world.appendChild(s);return s;}
function addLabel(svg,a,b,text){var t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x',String((a.x+b.x)/2));t.setAttribute('y',String((a.y+b.y)/2-7));t.setAttribute('text-anchor','middle');t.setAttribute('class','ach-wire-label');t.textContent=text;svg.appendChild(t);}
function addWire(svg,from,to,label){var a=socketPoint(from,'out'),b=socketPoint(to,'in');if(!a||!b)return;var p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',path(a,b));p.setAttribute('class','ach-wire');svg.appendChild(p);if(label)addLabel(svg,a,b,label);}

function ownerBox(n,html,sig){if(!n)return;var body=n.querySelector('.ag-body');if(!body)return;var box=body.querySelector('.ach-owner');if(!box){box=document.createElement('div');box.className='ach-owner';body.appendChild(box);}if(box.dataset.sig===sig)return;box.dataset.sig=sig;box.innerHTML=html;}
function decorateCore(){
    var command=graphNode('system:commander'),squad=graphNode('system:squad'),eng=graphNode('system:engagement'),resolver=graphNode('system:resolver'),soldier=graphNode('system:soldier');
  if(command){var h=command.querySelector('.ag-head>span'),b=command.querySelector('.ag-head small');if(h)h.textContent='Force Command';if(b)b.textContent='mission intent';ownerBox(command,'<span class="what">OWNS WHAT</span><br><b>objective · route · phase · doctrine action</b><br>Evaluates squad intent every commander tick. Does not write individual soldier destinations.','force-v1');}
  if(squad){var hs=squad.querySelector('.ag-head>span'),bs=squad.querySelector('.ag-head small');if(hs)hs.textContent='Squad Orders';if(bs)bs.textContent='formation / orders';ownerBox(squad,'<span class="how">OWNS ORGANIZATION</span><br><b>formation · order anchor · member slots</b><br>Turns Force Command intent into stable squad/fireteam orders. Captain status modifies execution but does not create a competing mission.','squad-v1');}
    if(eng){var he=eng.querySelector('.ag-head>span'),be=eng.querySelector('.ag-head small');if(he)he.textContent='Engagement';if(be)be.textContent='combat proposal';ownerBox(eng,'<span class="how">OWNS HOW EACH MAN FIGHTS</span><br><b>cover · stance · bound · fire · temporary combat movement</b><br>Supplies a scoped combat proposal; it does not overwrite the physical destination.','eng-v2');}
    if(resolver)ownerBox(resolver,'<span class="what">OWNS FINAL MOVEMENT</span><br><b>one resolved soldier destination</b><br>Active Engagement proposals beat stable Squad Orders, then expire back to the formation plan.','resolver-v1');
    if(soldier)ownerBox(soldier,'<b>EXECUTES</b><br>Moves, aims and fires from the destination resolved upstream.','soldier-v2');
}
function captainBody(){var p=params(),coh=num(p.cohesionRadius,34),no=num(p.captainlessCohesion,26),extra=num(p.cornerNoCaptainExtra,.35);return'<div class="ag-muted"><b>Influence only — not a second order source.</b><br>The physical captain is currently a combatant and leadership/status input to Force Command and Squad Orders.</div><div class="ach-captain-status"><span>Captain alive</span><b>cohesion '+coh.toFixed(0)+' m</b><span>Captain KIA</span><b>cohesion '+no.toFixed(0)+' m</b><span>Corner penalty if KIA</span><b>+'+extra.toFixed(2)+' s</b><span>Policy condition</span><b>captainDead</b><span>Other current jobs</span><b>formation slot · voice</b></div>';}
function ensureCaptain(){
  var existing=graphNode('leadership:captain');if(existing){ui.captain=existing;var body=existing.querySelector('.ag-body');if(body)body.innerHTML=captainBody();return existing;}
  var squad=graphNode('system:squad');if(!squad)return null;var sp=nodeXY(squad),saved=savedPosition()||{x:sp.x-85,y:sp.y+250};
  var el=document.createElement('div');el.className='ag-node leadership';el.dataset.k='leadership:captain';el.style.left=saved.x+'px';el.style.top=saved.y+'px';el.innerHTML='<div class="ag-head"><span>Captain Leadership</span><small>influence / status</small></div><div class="ag-body">'+captainBody()+'</div><i class="ag-sock out" title="Leadership influence"></i>';
  ui.nodes.appendChild(el);ui.captain=el;
  el.addEventListener('click',function(e){e.stopPropagation();traceCaptain();});
  var head=el.querySelector('.ag-head');head.addEventListener('pointerdown',function(e){if(e.button!==0)return;var p=nodeXY(el);ui.drag={id:e.pointerId,cx:e.clientX,cy:e.clientY,x:p.x,y:p.y};head.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();});
  head.addEventListener('pointermove',function(e){if(!ui.drag||ui.drag.id!==e.pointerId)return;var worldRect=ui.world.getBoundingClientRect(),sx=worldRect.width/(ui.world.offsetWidth||20000),sy=worldRect.height/(ui.world.offsetHeight||12000);el.style.left=(ui.drag.x+(e.clientX-ui.drag.cx)/(sx||1))+'px';el.style.top=(ui.drag.y+(e.clientY-ui.drag.cy)/(sy||1))+'px';drawWires();drawTrace();});
  head.addEventListener('pointerup',function(e){if(ui.drag&&ui.drag.id===e.pointerId){ui.drag=null;savePosition();}});
  return el;
}
function drawWires(){var svg=ensureSvg('agHierarchySvg',4);svg.innerHTML='';var cap=ensureCaptain(),command=graphNode('system:commander'),squad=graphNode('system:squad');if(!cap)return;addWire(svg,cap,command,'leadership status / captainDead');addWire(svg,cap,squad,'cohesion / formation / voice');}
function clearTrace(){var t=document.getElementById('agHierarchyTrace');if(t)t.innerHTML='';var ns=ui.nodes&&ui.nodes.querySelectorAll('.ach-trace-node')||[];for(var i=0;i<ns.length;i++)ns[i].classList.remove('ach-trace-node');ui.trace=null;}
function drawTrace(){if(ui.trace!=='captain')return;var svg=ensureSvg('agHierarchyTrace',55);svg.innerHTML='';var cap=ensureCaptain(),command=graphNode('system:commander'),squad=graphNode('system:squad');if(!cap)return;[cap,command,squad].forEach(function(n){if(n)n.classList.add('ach-trace-node');});addWire(svg,cap,command,'STATUS INPUT');addWire(svg,cap,squad,'EXECUTION MODIFIER');}
function traceCaptain(){
  if(root.BattleAILoopWatch&&root.BattleAILoopWatch.highlight)root.BattleAILoopWatch.highlight([]);clearTrace();ui.trace='captain';drawTrace();
  var head=document.getElementById('agInspectorHead'),body=document.getElementById('agInspectorBody');if(head)head.innerHTML='<b>Captain Leadership</b><small>Influence · not an order authority</small>';if(body)body.innerHTML='<div class="ag-section"><h3>Current responsibility</h3><div class="ag-tip">Captain survival changes cohesion, corner delay and the <b>captainDead</b> policy condition. The captain also occupies a formation slot and voices squad state changes. He does <b>not</b> independently choose Hold / Assault / Flank / Regroup.</div></div><div class="ag-section"><h3>Future responsibility · Step 5</h3><div class="ag-tip"><b>Force Command decides WHAT.</b><br>Captain will decide HOW LOCALLY: approach side, formation, base of fire, bounding and occupation of prepared positions. He will not be allowed to replace the strategic objective.</div></div>';
}
function ensureKey(){if(document.getElementById('agHierarchyKey'))return;var k=document.createElement('div');k.id='agHierarchyKey';k.className='ach-key';k.innerHTML='<b>COMMAND OWNERSHIP</b><br><span class="what">Force Command = WHAT</span> · objective / route / phase<br><span class="how">Captain = HOW locally (future)</span> · currently leadership influence only<br><span class="how">Engagement = HOW each soldier fights</span>';ui.view.appendChild(k);}
function decorate(){decorateCore();ensureCaptain();ensureKey();drawWires();if(ui.trace)drawTrace();}
function schedule(){if(ui.scheduled)return;ui.scheduled=true;requestAnimationFrame(function(){ui.scheduled=false;decorate();});}
function install(){
  ui.root=document.getElementById('aiGraph');ui.view=document.getElementById('agView');ui.world=document.getElementById('agWorld');ui.nodes=document.getElementById('agNodes');if(!ui.root||!ui.view||!ui.world||!ui.nodes)return;
  installStyle();ensureSvg('agHierarchySvg',4);ensureSvg('agHierarchyTrace',55);decorate();
  ui.observer=new MutationObserver(schedule);ui.observer.observe(ui.nodes,{childList:true,subtree:true});
  ui.view.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.ag-node,#agLoopPanel,#agTimingPanel,.ag-legend,button,input,select,label'))return;clearTrace();},false);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
root.BattleAICommandHierarchy={refresh:decorate,clearTrace:clearTrace,traceCaptain:traceCaptain};
console.log('[AI-GRAPH] command hierarchy truth map loaded: Force Command -> Squad Orders; Captain is influence only');
})(typeof window!=='undefined'?window:globalThis);

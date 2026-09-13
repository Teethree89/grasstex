/* AI Graph usability layer: Blender-style wire dragging plus explicit IF / AND / THEN rule display.
   The underlying Policy Genome remains constrained: a rule matches only when ALL `when`
   conditions are true; if several rules match, the highest weight wins. */
(function(root){
'use strict';
if(typeof document==='undefined'||!root.BattleAIGraphEditor||root.BattleAIGraphLogic)return;

var state={drag:null,preview:null,synthetic:false,suppressUntil:0,observer:null,scheduled:false};
var rootEl=document.getElementById('aiGraph'),view=document.getElementById('agView'),world=document.getElementById('agWorld'),svg=document.getElementById('agSvg');
if(!rootEl||!view||!world||!svg)return;

function cap(s){return String(s||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/^./,function(c){return c.toUpperCase();});}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c];});}
function editorOpen(){return !rootEl.hidden;}
function setStatus(text,bad){var el=document.getElementById('agStatus');if(!el)return;el.textContent=text;el.classList.toggle('bad',!!bad);}
function draft(){try{return root.BattleAIGraphEditor.draft();}catch(_){return null;}}
function ruleById(id){var d=draft(),rules=d&&d.rules||[];for(var i=0;i<rules.length;i++)if(rules[i].id===id)return rules[i];return null;}
function nodeInfo(el){var n=el&&el.closest&&el.closest('.ag-node');if(!n)return null;var k=n.dataset.k||'',i=k.indexOf(':');return{el:n,key:k,type:i<0?'':k.slice(0,i),id:i<0?'':k.slice(i+1)};}
function compatible(source,target){return!!(source&&target&&((source.type==='condition'&&target.type==='rule')||(source.type==='rule'&&target.type==='action')));}

function installStyle(){
  var s=document.createElement('style');s.textContent='\
#aiGraph .ag-node.rule{width:270px}\
#aiGraph .ag-node.condition .ag-head small::before{content:"IF ";font-weight:800;color:#d9f2ff}\
#aiGraph .ag-node.action .ag-head small::before{content:"THEN ";font-weight:800;color:#ffe5bd}\
#aiGraph .ag-node.rule .ag-head small{color:#ffd4eb;opacity:.95}\
#aiGraph .ag-rule-logic{display:grid;gap:4px}.ag-logic-line{display:grid;grid-template-columns:42px 1fr;gap:6px;align-items:start;line-height:1.35}.ag-logic-word{font:800 9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em}.ag-logic-word.if{color:#87c9e8}.ag-logic-word.and{color:#b9dbea}.ag-logic-word.then{color:#e8b775}.ag-rule-then{margin-top:3px;padding-top:5px;border-top:1px solid #4a3a45}.ag-rule-then strong{color:#fff}.ag-rule-priority{margin-top:4px;color:#c8a4ba;font-size:9px}.ag-rule-priority b{color:#f1c6df}\
#aiGraph .ag-logic-help{position:absolute;top:10px;left:10px;z-index:8;width:255px;padding:9px 10px;background:#1d2023ef;border:1px solid #4b5055;border-radius:5px;box-shadow:0 5px 18px #0006;color:#aeb5ba;font-size:9px;line-height:1.45;pointer-events:none}.ag-logic-help b{display:block;color:#fff;font-size:10px;margin-bottom:4px}.ag-logic-help .if{color:#87c9e8}.ag-logic-help .and{color:#c8a4ba}.ag-logic-help .then{color:#e8b775}.ag-logic-help em{font-style:normal;font-weight:800}.ag-logic-help small{display:block;margin-top:4px;color:#858d93}\
#aiGraph .ag-sock.ag-drop-target{box-shadow:0 0 0 4px #75b98c55;background:#91d2a5;transform:scale(1.18)}#aiGraph .ag-sock.ag-drop-hover{box-shadow:0 0 0 5px #f1c66d66;background:#f1c66d;transform:scale(1.28)}#aiGraph .ag-sock.ag-drag-source{box-shadow:0 0 0 4px #e0b56a66;background:#e0b56a}\
#aiGraph .ag-wire.ag-drag-wire{stroke:#f0c56f;stroke-width:2.8;stroke-dasharray:6 4;opacity:1;filter:drop-shadow(0 0 3px #e0b56a66)}\
#aiGraph .ag-ifthen-inspector{margin-bottom:10px}.ag-ifthen-inspector strong{color:#fff}.ag-ifthen-inspector .if{color:#87c9e8}.ag-ifthen-inspector .then{color:#e8b775}\
';document.head.appendChild(s);
}

function ensureHelp(){
  if(document.getElementById('agLogicHelp'))return;
  var d=document.createElement('div');d.id='agLogicHelp';d.className='ag-logic-help';
  d.innerHTML='<b>READ RULES LEFT → RIGHT</b><span class="if"><em>IF</em> blue condition(s)</span> → <span class="and"><em>AND</em> pink rule</span> → <span class="then"><em>THEN</em> orange action</span><br>Every condition entering one rule must be true. If several rules match, the highest <b style="display:inline;font-size:9px">Priority</b> wins.<small>Need OR? Use another rule with the same THEN action.</small>';
  view.appendChild(d);
}

function decorateRules(){
  var d=draft();if(!d)return;var byId={};(d.rules||[]).forEach(function(r){byId[r.id]=r;});
  var nodes=rootEl.querySelectorAll('.ag-node.rule');
  for(var i=0;i<nodes.length;i++){
    var info=nodeInfo(nodes[i]),r=info&&byId[info.id];if(!r)continue;
    var sig=JSON.stringify([r.when,r.action,r.weight]);if(nodes[i].dataset.logicSignature===sig)continue;nodes[i].dataset.logicSignature=sig;
    var headSmall=nodes[i].querySelector('.ag-head small');if(headSmall)headSmall.textContent='IF / AND / THEN';
    var body=nodes[i].querySelector('.ag-body');if(!body)continue;
    var html='<div class="ag-rule-logic">';
    (r.when||[]).forEach(function(c,idx){html+='<div class="ag-logic-line"><span class="ag-logic-word '+(idx?'and':'if')+'">'+(idx?'AND':'IF')+'</span><span>'+esc(cap(c))+'</span></div>';});
    html+='<div class="ag-logic-line ag-rule-then"><span class="ag-logic-word then">THEN</span><strong>'+esc(cap(r.action))+'</strong></div>';
    html+='<div class="ag-rule-priority"><b>PRIORITY '+Math.round((+r.weight||0)*100)+'%</b> · higher wins when multiple rules match</div></div>';
    body.innerHTML=html;
  }
  var conds=rootEl.querySelectorAll('.ag-node.condition .ag-head small');for(i=0;i<conds.length;i++)conds[i].textContent='condition';
  var acts=rootEl.querySelectorAll('.ag-node.action .ag-head small');for(i=0;i<acts.length;i++)acts[i].textContent='action';
}

function decorateInspector(){
  var head=document.querySelector('#agInspectorHead small'),body=document.getElementById('agInspectorBody');if(!head||!body)return;
  var isRule=head.textContent==='Decision Rule';
  var note=body.querySelector('.ag-ifthen-inspector');
  if(isRule&&!note){note=document.createElement('div');note.className='ag-tip ag-ifthen-inspector';note.innerHTML='<strong><span class="if">IF</span> all checked conditions are true, <span class="then">THEN</span> run the selected action.</strong><br>Priority decides the winner when more than one rule matches.';body.insertBefore(note,body.firstChild);}
  if(!isRule&&note)note.remove();
  if(isRule){var labels=body.querySelectorAll('.ag-row label');for(var i=0;i<labels.length;i++)if(labels[i].textContent.trim()==='Weight')labels[i].textContent='Priority';}
}

function decorate(){if(!editorOpen())return;ensureHelp();decorateRules();decorateInspector();var legend=rootEl.querySelector('.ag-legend');if(legend)legend.textContent='drag output socket → input socket · wheel zoom · middle drag / Space+drag pan · drag headers · Ctrl/Cmd+S saves';}
function scheduleDecorate(){if(state.scheduled)return;state.scheduled=true;requestAnimationFrame(function(){state.scheduled=false;decorate();});}

function worldPoint(clientX,clientY){var r=world.getBoundingClientRect(),sx=r.width/(world.offsetWidth||2380),sy=r.height/(world.offsetHeight||1750);return{x:(clientX-r.left)/(sx||1),y:(clientY-r.top)/(sy||1)};}
function socketPoint(sock){var r=sock.getBoundingClientRect();return worldPoint(r.left+r.width/2,r.top+r.height/2);}
function pathD(a,b){var dx=Math.max(55,Math.abs(b.x-a.x)*.45);return'M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y;}
function ensurePreview(){if(state.preview&&state.preview.isConnected)return state.preview;var p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('class','ag-wire pending ag-drag-wire');svg.appendChild(p);state.preview=p;return p;}
function clearPreview(){if(state.preview&&state.preview.parentNode)state.preview.parentNode.removeChild(state.preview);state.preview=null;}
function clearTargets(){var q=rootEl.querySelectorAll('.ag-drop-target,.ag-drop-hover,.ag-drag-source');for(var i=0;i<q.length;i++)q[i].classList.remove('ag-drop-target','ag-drop-hover','ag-drag-source');}
function highlightTargets(source){clearTargets();source.sock.classList.add('ag-drag-source');var selector=source.info.type==='condition'?'.ag-node.rule .ag-sock.in':'.ag-node.action .ag-sock.in';var list=rootEl.querySelectorAll(selector);for(var i=0;i<list.length;i++)list[i].classList.add('ag-drop-target');}
function targetAt(x,y,source){var el=document.elementFromPoint(x,y),sock=el&&el.closest&&el.closest('.ag-sock.in');var old=rootEl.querySelectorAll('.ag-drop-hover');for(var i=0;i<old.length;i++)old[i].classList.remove('ag-drop-hover');if(!sock)return null;var info=nodeInfo(sock);if(compatible(source.info,info)){sock.classList.add('ag-drop-hover');return{sock:sock,info:info};}return null;}

function beginSocketPointer(e){
  if(!editorOpen()||e.button!==0)return;var sock=e.target.closest&&e.target.closest('.ag-sock.out');if(!sock||!rootEl.contains(sock))return;var info=nodeInfo(sock);if(!info||(info.type!=='condition'&&info.type!=='rule'))return;
  state.drag={pointer:e.pointerId,sock:sock,info:info,startX:e.clientX,startY:e.clientY,moved:false,target:null};
}
function moveSocketPointer(e){
  var d=state.drag;if(!d||d.pointer!==e.pointerId)return;var distance=Math.hypot(e.clientX-d.startX,e.clientY-d.startY);if(!d.moved&&distance<4)return;
  if(!d.moved){d.moved=true;highlightTargets(d);setStatus(d.info.type==='condition'?'Drop on a rule input · this adds an AND condition':'Drop on an action input · this changes THEN');}
  e.preventDefault();var p=ensurePreview(),a=socketPoint(d.sock),b=worldPoint(e.clientX,e.clientY);p.setAttribute('d',pathD(a,b));d.target=targetAt(e.clientX,e.clientY,d);
}
function endSocketPointer(e){
  var d=state.drag;if(!d||d.pointer!==e.pointerId)return;state.drag=null;
  if(!d.moved){clearPreview();clearTargets();return;}
  e.preventDefault();e.stopPropagation();state.suppressUntil=performance.now()+300;var target=targetAt(e.clientX,e.clientY,d);clearPreview();clearTargets();
  if(!target){setStatus('Connection cancelled — drop on a highlighted input socket');return;}
  state.synthetic=true;try{d.sock.click();target.sock.click();}finally{state.synthetic=false;}scheduleDecorate();
}
function cancelDrag(){if(!state.drag)return;state.drag=null;clearPreview();clearTargets();setStatus('Connection cancelled');}

function installWireDrag(){
  rootEl.addEventListener('pointerdown',beginSocketPointer,true);window.addEventListener('pointermove',moveSocketPointer,{passive:false});window.addEventListener('pointerup',endSocketPointer,true);window.addEventListener('pointercancel',cancelDrag,true);
  document.addEventListener('click',function(e){if(state.synthetic)return;if(performance.now()<state.suppressUntil&&e.target.closest&&e.target.closest('.ag-sock')){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('keydown',function(e){if(editorOpen()&&e.key==='Escape'&&state.drag){e.preventDefault();e.stopImmediatePropagation();cancelDrag();}},true);
}

installStyle();ensureHelp();installWireDrag();
state.observer=new MutationObserver(scheduleDecorate);state.observer.observe(rootEl,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
scheduleDecorate();
root.BattleAIGraphLogic={decorate:decorate,cancelDrag:cancelDrag};
console.log('[AI-GRAPH] IF/AND/THEN logic view + drag wiring loaded');
})(typeof window!=='undefined'?window:globalThis);

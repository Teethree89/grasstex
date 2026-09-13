/* AI Graph usability fixes layered on the visual editor/loop-watch modules.
   Keeps debugging readable without changing AI behavior:
     - display names may contain spaces while being typed; normalization happens on blur/Enter,
     - the graph world/SVG is large and unclipped so spread-out nodes do not clip wires,
     - selected trace wires are mirrored to a top SVG layer so they stay visible across nodes,
     - clicking empty canvas clears both the node selection and connection trace. */
(function(root){
'use strict';
if(typeof document==='undefined'||!root.BattleAIGraphEditor||!root.BattleAILoopWatch||root.BattleAIGraphUsability)return;

var WORLD_W=20000,WORLD_H=12000;
var ui={root:null,view:null,world:null,baseSvg:null,nodes:null,insHead:null,insBody:null,traceSvg:null,baseObserver:null,insObserver:null,nodesObserver:null,raf:0,cleared:false};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function selectedRuleId(){var n=ui.nodes&&ui.nodes.querySelector('.ag-node.rule.selected');return n?(n.dataset.k||'').slice(5):null;}
function ruleFor(id){try{var d=root.BattleAIGraphEditor.draft(),r=d&&d.rules||[];for(var i=0;i<r.length;i++)if(r[i].id===id)return r[i];}catch(_){}return null;}
function installStyle(){
  var s=document.createElement('style');
  s.textContent='\
#aiGraph #agWorld{width:'+WORLD_W+'px!important;height:'+WORLD_H+'px!important;overflow:visible!important}\
#aiGraph #agSvg{width:'+WORLD_W+'px!important;height:'+WORLD_H+'px!important;overflow:visible!important;z-index:1}\
#aiGraph #agNodes{position:absolute;left:0;top:0;width:'+WORLD_W+'px;height:'+WORLD_H+'px;overflow:visible!important;z-index:10;pointer-events:none}\
#aiGraph #agNodes .ag-node{pointer-events:auto}\
#aiGraph #agTraceSvg{position:absolute;left:0;top:0;width:'+WORLD_W+'px;height:'+WORLD_H+'px;overflow:visible!important;z-index:50;pointer-events:none}\
#aiGraph #agTraceSvg .ag-top-trace{fill:none;stroke:#ffe07a;stroke-width:4.6;opacity:1;filter:drop-shadow(0 0 4px #f0cf77aa)}\
#aiGraph #agTraceSvg .ag-top-trace.cond{stroke:#8fddff}#aiGraph #agTraceSvg .ag-top-trace.act{stroke:#ffd17c}#aiGraph #agTraceSvg .ag-top-trace.runtime{stroke:#a7dca0}#aiGraph #agTraceSvg .ag-top-trace.core{stroke:#d8e0e4;stroke-dasharray:7 5}\
';
  document.head.appendChild(s);
}
function ensureTraceSvg(){
  if(ui.traceSvg&&ui.traceSvg.isConnected)return ui.traceSvg;
  var old=document.getElementById('agTraceSvg');if(old){ui.traceSvg=old;return old;}
  var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='agTraceSvg';svg.setAttribute('width',WORLD_W);svg.setAttribute('height',WORLD_H);ui.world.appendChild(svg);ui.traceSvg=svg;return svg;
}
function traceClass(path){
  if(path.classList.contains('cond'))return'cond';if(path.classList.contains('act'))return'act';if(path.classList.contains('runtime'))return'runtime';if(path.classList.contains('core'))return'core';return'';
}
function syncTopTrace(){
  ui.raf=0;var top=ensureTraceSvg();top.innerHTML='';var overlay=document.getElementById('agSelectionOverlay');if(!overlay)return;
  var paths=overlay.querySelectorAll('path');for(var i=0;i<paths.length;i++){var p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',paths[i].getAttribute('d')||'');p.setAttribute('class','ag-top-trace '+traceClass(paths[i]));top.appendChild(p);}
}
function scheduleTrace(){if(ui.raf)return;ui.raf=requestAnimationFrame(syncTopTrace);}

/* Loop Watch v1 trims the display name on every input event. The trailing space typed between two
   words therefore vanishes before the second word arrives. Replace that one field's handler and
   commit through the existing label API only when editing finishes. */
function repairNameInput(){
  if(ui.cleared)return;var input=document.getElementById('agRuleDisplayName'),id=selectedRuleId();if(!input||!id)return;if(input.dataset.spaceFriendly===id)return;input.dataset.spaceFriendly=id;
  input.oninput=function(){/* Keep the browser's raw value intact while the user is typing. */};
  function commit(){var clean=String(input.value||'').replace(/\s+/g,' ').trim().slice(0,64);root.BattleAILoopWatch.setLabel(id,clean);var label=root.BattleAILoopWatch.labelFor(id,ruleFor(id));input.value=label;}
  input.onchange=commit;input.onblur=commit;input.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();input.blur();}};
}
function resetInspector(){
  if(!ui.insHead||!ui.insBody)return;if(ui.insBody.dataset.canvasClear==='1')return;
  ui.insHead.innerHTML='<b>Inspector</b><small>Select a node</small>';ui.insBody.innerHTML='<div class="ag-tip">Select a node to inspect or edit it. Click empty canvas space to clear a highlighted trace.</div>';ui.insBody.dataset.canvasClear='1';
}
function clearCanvasSelection(){
  ui.cleared=true;try{root.BattleAILoopWatch.highlight([]);}catch(_){}
  if(ui.root)ui.root.classList.remove('ag-trace-active');if(ui.nodes){var n=ui.nodes.querySelectorAll('.selected,.ag-trace-node');for(var i=0;i<n.length;i++){n[i].classList.remove('selected');n[i].classList.remove('ag-trace-node');}}
  resetInspector();scheduleTrace();
  var status=document.getElementById('agStatus');if(status)status.textContent='Trace cleared · select a node to follow its connections';
}
function markNodeActive(){ui.cleared=false;if(ui.insBody)delete ui.insBody.dataset.canvasClear;}
function emptyCanvasClick(e){
  if(e.button!==0)return;if(e.target.closest&&e.target.closest('.ag-node,#agLoopPanel,.ag-legend,button,input,select,label'))return;clearCanvasSelection();
}
function keepClearAfterRebuild(){
  if(!ui.cleared)return;var n=ui.nodes.querySelectorAll('.selected,.ag-trace-node');for(var i=0;i<n.length;i++){n[i].classList.remove('selected');n[i].classList.remove('ag-trace-node');}if(ui.root)ui.root.classList.remove('ag-trace-active');resetInspector();
}

function install(){
  ui.root=document.getElementById('aiGraph');ui.view=document.getElementById('agView');ui.world=document.getElementById('agWorld');ui.baseSvg=document.getElementById('agSvg');ui.nodes=document.getElementById('agNodes');ui.insHead=document.getElementById('agInspectorHead');ui.insBody=document.getElementById('agInspectorBody');
  if(!ui.root||!ui.view||!ui.world||!ui.baseSvg||!ui.nodes||!ui.insBody)return;
  installStyle();ensureTraceSvg();
  ui.baseObserver=new MutationObserver(scheduleTrace);ui.baseObserver.observe(ui.baseSvg,{childList:true,subtree:true,attributes:true,attributeFilter:['d']});
  ui.insObserver=new MutationObserver(function(){requestAnimationFrame(function(){if(ui.cleared)resetInspector();else repairNameInput();});});ui.insObserver.observe(ui.insBody,{childList:true,subtree:true});
  ui.nodesObserver=new MutationObserver(function(){requestAnimationFrame(function(){keepClearAfterRebuild();scheduleTrace();});});ui.nodesObserver.observe(ui.nodes,{childList:true,subtree:true});
  ui.root.addEventListener('pointerdown',function(e){if(e.button===0&&e.target.closest&&e.target.closest('.ag-node'))markNodeActive();},true);
  ui.root.addEventListener('pointermove',function(e){if((e.buttons&1)&&e.target.closest&&e.target.closest('.ag-node'))scheduleTrace();},true);
  ui.view.addEventListener('click',emptyCanvasClick,false);
  repairNameInput();syncTopTrace();
}

install();
root.BattleAIGraphUsability={clearSelection:clearCanvasSelection,syncTrace:syncTopTrace};
console.log('[AI-GRAPH] space-friendly names + unclipped/top trace wires + canvas deselect loaded');
})(typeof window!=='undefined'?window:globalThis);

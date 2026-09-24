/* AI Graph export buttons: full diagnostics, Loop Watch trace and order trace as JSON.
   UI only: the payloads are built by BattleDiagnosticsExport (99-session-diagnostics-export.js),
   resolved at click time because that module loads later. No simulation hooks. */
(function(root){
'use strict';
if(typeof document==='undefined'||root.BattleAIDiagnosticsExport)return;

var tries=0;
function exporter(kind){
  return function(){
    var x=root.BattleDiagnosticsExport;
    if(!x){console.warn('[AI-DIAGNOSTICS] BattleDiagnosticsExport is not loaded');return null;}
    return x.download(kind,root.__battle__);
  };
}
var exportAll=exporter('full'),exportLoops=exporter('loops'),exportOrders=exporter('orders');

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
  if(top&&!document.getElementById('agDiagExport')){
    var close=document.getElementById('agClose'),b=button('agDiagExport','Export Diagnostics','Export the full battle, squad analysis, Loop Watch, Order Trace and leases as JSON',exportAll);top.insertBefore(b,close||null);
  }
  if(loop&&!document.getElementById('agLoopExport')){
    var lr=document.createElement('div');lr.className='diag-export-row';lr.appendChild(button('agLoopExport','Export Loops JSON','Export Loop Watch alerts with matching order provenance',exportLoops));loop.appendChild(lr);
  }
  if(order&&!document.getElementById('agOrderExport')){
    var or=document.createElement('div');or.className='diag-export-row';or.appendChild(button('agOrderExport','Export Orders JSON','Export order provenance events and writer conflicts',exportOrders));order.appendChild(or);
  }
  if((!top||!loop||!order)&&tries++<40)setTimeout(install,250);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
root.BattleAIDiagnosticsExport={version:'diagnostics-export-v3',exportLoops:exportLoops,exportOrders:exportOrders,exportAll:exportAll};
})(typeof window!=='undefined'?window:globalThis);

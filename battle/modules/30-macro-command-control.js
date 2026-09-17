/* AI Graph control for isolating the M3C Macro layer.
   The runtime owner remains Commander AI: this module only exposes its enable/disable switch.
   OFF preserves the force intent seeded at battle start and prevents further Force Command rewrites. */
(function(root){
'use strict';
if(typeof document==='undefined'||root.BattleMacroCommandControl)return;

var BUTTON_ID='agMacroCommand';
var timer=null;

function commander(){return root.BattleCommanderAI||null;}
function battle(){return root.__battle__||null;}
function enabled(){
  var ai=commander(),sim=battle();
  return !sim||!ai||typeof ai.isMacroEnabled!=='function'?true:ai.isMacroEnabled(sim);
}
function render(){
  var btn=document.getElementById(BUTTON_ID);if(!btn)return;
  var sim=battle(),on=enabled();
  btn.textContent='Macro '+(on?'ON':'OFF');
  btn.classList.toggle('off',!on);
  btn.setAttribute('aria-pressed',on?'true':'false');
  btn.title=sim
    ?(on?'Macro / Force Command is active. Click to freeze strategic command at its current intent.':'Macro / Force Command is frozen. Meso and Micro continue executing the last strategic intent. Click to resume Macro command.')
    :'Macro / Force Command defaults ON. Start a battle to change it.';
  btn.disabled=!sim;
}
function toggle(){
  var ai=commander(),sim=battle();
  if(!ai||!sim||typeof ai.setMacroEnabled!=='function')return;
  ai.setMacroEnabled(sim,!ai.isMacroEnabled(sim));
  render();
}
function install(){
  if(document.getElementById(BUTTON_ID)){render();return true;}
  var top=document.getElementById('agTop');if(!top)return false;
  var style=document.createElement('style');
  style.textContent='#'+BUTTON_ID+'{background:#285365!important;border-color:#4a7b8b!important;font-weight:700}#'+BUTTON_ID+'.off{background:#4a3030!important;border-color:#765050!important;color:#f0c8c8!important}#'+BUTTON_ID+':disabled{opacity:.55;cursor:default}';
  document.head.appendChild(style);
  var btn=document.createElement('button');
  btn.id=BUTTON_ID;btn.type='button';btn.onclick=toggle;
  var status=document.getElementById('agStatus');
  if(status&&status.parentNode===top)top.insertBefore(btn,status);else top.appendChild(btn);
  render();
  return true;
}
function start(){
  install();
  if(timer==null)timer=setInterval(function(){install();render();},750);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
root.BattleMacroCommandControl={render:render,toggle:toggle,isEnabled:enabled};
})(typeof window!=='undefined'?window:globalThis);

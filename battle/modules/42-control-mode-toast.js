/* Small camera-mode toast for touch/gamepad handoff. UI-only; no simulation behavior changes. */
(function(root){
'use strict';
if(typeof document==='undefined'||root.BattleControlModeToast)return;
var shownPad=false,lastMode=null,pollTimer=0;
function ensure(){
  var el=document.getElementById('battleControlToast');if(el)return el;
  el=document.createElement('div');el.id='battleControlToast';
  el.style.cssText='position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translate(-50%,18px);z-index:80;padding:9px 13px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(14,17,12,.94);color:#f4f4ea;font:600 12px/1.2 Arial,sans-serif;letter-spacing:.01em;box-shadow:0 8px 26px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;white-space:nowrap;max-width:calc(100vw - 28px);overflow:hidden;text-overflow:ellipsis';
  document.body.appendChild(el);return el;
}
function show(text){var el=ensure();el.textContent=text;el.style.opacity='1';el.style.transform='translate(-50%,0)';clearTimeout(el._hideTimer);el._hideTimer=setTimeout(function(){el.style.opacity='0';el.style.transform='translate(-50%,18px)';},2200);}
function pads(){try{return navigator.getGamepads?navigator.getGamepads():[];}catch(_){return[];}}
function activePad(){var p=pads()||[];for(var i=0;i<p.length;i++)if(p[i]&&p[i].connected!==false)return p[i];return null;}
function notePad(p){if(!p||shownPad)return;shownPad=true;lastMode='gamepad';show('Xbox controller connected · Fly controls active');}
function startPoll(){if(pollTimer||!navigator.getGamepads)return;pollTimer=setInterval(function(){var p=activePad();if(p)notePad(p);},400);}
function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=0;}}

var original=root.BattleDesktopCamera&&root.BattleDesktopCamera.create;
if(original){root.BattleDesktopCamera.create=function(options){var result=original.apply(this,arguments);setTimeout(function(){if(result&&result.desktop){var p=activePad();if(p)notePad(p);else if(lastMode!=='desktop'){lastMode='desktop';show('Mouse + keyboard fly controls active');}}else{lastMode='touch';show('Touch controls active');startPoll();}},0);return result;};}
root.addEventListener('gamepadconnected',function(e){notePad(e&&e.gamepad);stopPoll();});
root.addEventListener('gamepaddisconnected',function(){shownPad=false;lastMode='touch';show('Controller disconnected · Touch controls active');startPoll();});
root.BattleControlModeToast={show:show,notePad:notePad};
})(typeof window!=='undefined'?window:globalThis);

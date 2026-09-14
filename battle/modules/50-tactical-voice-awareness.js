/* Tactical observation awareness.
   A squad only needs to be told about the same enemy in the same window/house once per contact
   episode. Nearby squads may independently spot him, but a short faction-wide echo guard prevents
   a chorus of identical location calls from firing almost simultaneously.

   Presentation only: this wraps the voice scheduler and never touches combat RNG or AI intent. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleVoiceScheduler||root.BattleTacticalVoiceAwareness)return;

var oldEnqueue=root.BattleVoiceScheduler.enqueue;
var OBS={enemyAtWindow:1,enemyInHouseGround:1,enemyInHouseUpper:1,enemyFlanking:1,enemyMovingLeft:1,enemyMovingRight:1};
var squadSeen=Object.create(null),globalSeen=Object.create(null),GLOBAL_ECHO_MS=9000;
function now(){return root.performance&&typeof root.performance.now==='function'?root.performance.now():Date.now();}
function sqKey(s){var q=s&&s.squad;return String(s&&s.faction||'?')+':'+String(q&&q.id||'?');}
function episode(s){var q=s&&s.squad,c=q&&q.contact;if(!q)return'none';if(isFinite(+q.contactSince)&&q.contactSince!=null)return'active:'+Math.floor(+q.contactSince*2)/2;if(c&&isFinite(+c.at))return'forming:'+Math.floor(+c.at*2)/2;return'none';}
function targetId(s){var q=s&&s.squad,c=q&&q.contact,t=c&&c.unit;return String(t&&t.id!=null?t.id:'?');}
function locationToken(s,event){
  var q=s&&s.squad,c=q&&q.contact,t=c&&c.unit,slot=t&&t._windowSlot;
  if(slot){var id=slot.id||slot.key||slot.stationId||slot.buildingId;if(id!=null)return String(id);var x=isFinite(+slot.x)?Math.round(+slot.x):'',z=isFinite(+slot.z)?Math.round(+slot.z):'',y=isFinite(+slot.yBottom)?Math.round(+slot.yBottom):'';return[x,z,y].join(',');}
  if(c&&isFinite(+c.x)&&isFinite(+c.z))return Math.round(+c.x/6)+','+Math.round(+c.z/6);
  return event;
}
function group(event){if(event==='enemyAtWindow'||event==='enemyInHouseGround'||event==='enemyInHouseUpper')return'building-location';if(event==='enemyMovingLeft'||event==='enemyMovingRight')return'enemy-movement';return event;}
function reset(){squadSeen=Object.create(null);globalSeen=Object.create(null);}
root.BattleVoiceScheduler.enqueue=function(soldier,type,cam,opts){
  if(!OBS[type])return oldEnqueue.apply(this,arguments);
  var sk=sqKey(soldier),ep=episode(soldier),tid=targetId(soldier),loc=locationToken(soldier,type),g=group(type),token=ep+'|'+tid+'|'+g+'|'+loc;
  var seen=squadSeen[sk]||(squadSeen[sk]=Object.create(null));if(seen[token])return false;
  var nk=String(soldier&&soldier.faction||'?')+'|'+tid+'|'+g+'|'+loc,t=now(),last=globalSeen[nk]||-1e12;
  if(t-last<GLOBAL_ECHO_MS)return false;
  var out=oldEnqueue.apply(this,arguments);if(out!==false){seen[token]=1;globalSeen[nk]=t;}return out;
};
root.BattleModules.registerSystem('tactical-voice-awareness',{version:'1.0',onBattleStart:reset,onBattleRestart:reset});
root.BattleTacticalVoiceAwareness={version:'1.0',reset:reset};
console.log('[VOICE] tactical location awareness active: one call per squad/contact/location episode');
})(typeof window!=='undefined'?window:globalThis);

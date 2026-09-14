/* Combat urgency / self-preservation.
   At 1x speed a man under fire must not leisurely crouch-walk into cover, and a squadmate should
   not keep route-marching for several seconds after somebody beside him has established contact.
   Engagement remains the combat-state owner: this layer promotes an exposed suppressed man into
   its existing cover-bound state and MARKS the move as urgent.  Soldier Individuality is the sole
   speed owner and maps that urgency to the realistic crouch-run/sprint gait bands. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleEngagement||!root.BattleMovementResolver||root.BattleCombatUrgency)return;

var COVER_SEARCH=22,COVER_ARRIVED=1.3,SHARED_REACT_AGE=2.5,SHARED_HOLD=1.8,URGENT_TTL=.55;
var oldUpdate=root.BattleEngagement.updateSoldier;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function pos(s){return point(s&&s.root&&s.root.position);}
function estate(s){try{return root.BattleEngagement.stateOf(s);}catch(_){return s.eng||{};}}
function fresh(){return{urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0,urgentFrames:0,byFaction:{us:{urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0},ge:{urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0}}};}
function stats(sim){return sim._combatUrgency||(sim._combatUrgency=fresh());}
function bump(sim,s,field){var st=stats(sim);st[field]++;if(st.byFaction[s.faction])st.byFaction[s.faction][field]++;}
function contact(s,battle){var sq=s&&s.squad,c=sq&&sq.contact;if(!c||!isFinite(+c.at)||(+battle.time||0)-(+c.at)>SHARED_REACT_AGE)return null;return c;}
function exposed(s,battle){try{var F=root.BattleObstacleField,p=pos(s);return !F||!p||F.coverPotentialAt(battle.obstacles,p.x,p.z)>.88;}catch(_){return true;}}
function threatFor(s,battle){if(s.target&&!s.target.dead)return s.target;var c=contact(s,battle);if(c&&c.unit&&!c.unit.dead)return c.unit;if(c&&isFinite(+c.x)&&isFinite(+c.z))return{root:{position:{x:+c.x,y:0,z:+c.z}}};return null;}
/* Reloading/stoppage handling can momentarily occupy the hands, but being out of ammunition is NOT
   a reason to stand in the open. Empty weapons retain the same right to seek physical cover. */
function safeToMove(s,battle){return!!(s&&!s.dead&&!s.reloading&&!s.clearingStoppage&&s.squad&&s.squad.state!=='retreat'&&!s._firingStation);}
function startUrgentCover(s,battle,e){
  if(!safeToMove(s,battle)||(+s.suppressedUntil||0)<=+battle.time||!exposed(s,battle))return false;
  var threat=threatFor(s,battle);if(!threat||!root.BattleEngagement.findCover)return false;
  if(e._urgentCoverSearchAt&&battle.time<e._urgentCoverSearchAt)return false;e._urgentCoverSearchAt=battle.time+.9;
  var cover=root.BattleEngagement.findCover(s,battle,{maxRange:COVER_SEARCH,threat:threat,minEnemyDistance:10});if(!cover)return false;
  e.cover=cover;e.state='bound';e.since=battle.time;e.until=battle.time+Math.max(2.0,cover.distance/Math.max(2.4,+s.crouchRunSpeed||+s.runSpeed||+s.speed||3)+1.0);e._urgentCover=true;
  s._combatUrgentUntil=battle.time+URGENT_TTL;s.prone=false;s.crawling=false;s.tacticalCrouch=true;s.setUp=false;
  root.BattleMovementResolver.proposeCombat(s,{x:cover.x,z:cover.z},battle,'cover-bound',.8);bump(battle,s,'urgentCoverStarts');return true;
}
function maintainUrgentCover(s,battle,e){
  if(!e._urgentCover||!e.cover)return false;var p=pos(s),goal=point(e.cover),d=dist(p,goal);
  if(d<=COVER_ARRIVED){e._urgentCover=false;s._combatUrgentUntil=0;bump(battle,s,'urgentCoverArrivals');return false;}
  if(!safeToMove(s,battle)||battle.time>=e.until){e._urgentCover=false;s._combatUrgentUntil=0;return false;}
  s._combatUrgentUntil=battle.time+URGENT_TTL;s.prone=false;s.crawling=false;s.tacticalCrouch=true;
  root.BattleMovementResolver.proposeCombat(s,goal,battle,'cover-bound',.8);return true;
}
function reactToSharedContact(s,battle,e){
  if(s.target||!s.squad||!s.squad.inContact||e.state!=='advance'||s.reloading||s.clearingStoppage)return;
  var c=contact(s,battle);if(!c)return;var p=pos(s),aim={x:+c.x||0,z:+c.z||0};if(!p)return;
  e.state='alert';e.since=battle.time;e.until=battle.time+SHARED_HOLD;e.lastSeen=aim;e.lastSeenAt=Math.max(+e.lastSeenAt||-999,+c.at||battle.time);s._faceHint=aim;s.tacticalCrouch=true;
  root.BattleMovementResolver.proposeCombat(s,p,battle,'contact-reaction',Math.min(.8,SHARED_HOLD));bump(battle,s,'sharedContactReactions');
}
root.BattleEngagement.updateSoldier=function(s,battle){
  var result=oldUpdate.apply(this,arguments);if(!s||!battle||s.dead)return result;var e=estate(s);
  if(!maintainUrgentCover(s,battle,e)&&(+s.suppressedUntil||0)>+battle.time&&['pinned','engage','orient'].indexOf(String(e.state||''))>=0)startUrgentCover(s,battle,e);
  reactToSharedContact(s,battle,e);return result;
};
function markUrgentPosture(sim){
  var t=+sim.time||0,a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++){
    var s=a[i];if(!s||s.dead||t>=(+s._combatUrgentUntil||0))continue;
    if(s.prone){s.prone=false;s.crawling=false;}s.tacticalCrouch=true;stats(sim).urgentFrames++;
  }
}
function publish(sim){var out=JSON.parse(JSON.stringify(stats(sim)));sim._combatUrgencySummary=out;if(sim._coordinationHealth)sim._coordinationHealth.combatUrgency=JSON.parse(JSON.stringify(out));}
function reset(sim){sim._combatUrgency=fresh();var a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++){a[i]._combatUrgentUntil=0;if(a[i].eng){a[i].eng._urgentCover=false;a[i].eng._urgentCoverSearchAt=0;}}publish(sim);}
root.BattleModules.registerSystem('combat-urgency',{version:'1.2-empty-can-cover',onBattleStart:reset,onBattleRestart:reset,onSimulationStep:markUrgentPosture,onCommanderTick:publish});
root.BattleCombatUrgency={version:'1.2-empty-can-cover',summary:function(sim){return sim&&sim._combatUrgencySummary?JSON.parse(JSON.stringify(sim._combatUrgencySummary)):null;}};
console.log('[ENGAGE] combat urgency active: shared-contact reaction + realistic crouch-run to cover');
})(typeof window!=='undefined'?window:globalThis);

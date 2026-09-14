/* Combat urgency / self-preservation.
   At 1x speed a man under fire must not leisurely crouch-walk into cover, and a squadmate should
   not keep route-marching for several seconds after somebody beside him has established contact.
   Engagement remains the combat-state owner: this layer promotes an exposed suppressed man into
   its existing cover-bound state and MARKS the move as urgent.  Soldier Individuality is the sole
   speed owner and maps that urgency to the realistic crouch-run/sprint gait bands. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleEngagement||!root.BattleMovementResolver||root.BattleCombatUrgency)return;

var COVER_SEARCH=22,COVER_ARRIVED=1.3,SHARED_REACT_AGE=2.5,SHARED_HOLD=1.8,SHARED_RESET_QUIET=4.5,URGENT_TTL=.55;
var oldUpdate=root.BattleEngagement.updateSoldier;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function pos(s){return point(s&&s.root&&s.root.position);}
function estate(s){try{return root.BattleEngagement.stateOf(s);}catch(_){return s.eng||{};}}
function fresh(){return{urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0,sharedContactRepeatBlocks:0,urgentFrames:0,byFaction:{us:{urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0,sharedContactRepeatBlocks:0},ge:{urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0,sharedContactRepeatBlocks:0}}};}
function stats(sim){return sim._combatUrgency||(sim._combatUrgency=fresh());}
function bump(sim,s,field){var st=stats(sim);st[field]=(st[field]||0)+1;if(st.byFaction[s.faction])st.byFaction[s.faction][field]=(st.byFaction[s.faction][field]||0)+1;}
function contact(s,battle){var sq=s&&s.squad,c=sq&&sq.contact;if(!c||!isFinite(+c.at)||(+battle.time||0)-(+c.at)>SHARED_REACT_AGE)return null;return c;}
function exposed(s,battle){try{var F=root.BattleObstacleField,p=pos(s);return !F||!p||F.coverPotentialAt(battle.obstacles,p.x,p.z)>.88;}catch(_){return true;}}
function threatFor(s,battle){if(s.target&&!s.target.dead)return s.target;var c=contact(s,battle);if(c&&c.unit&&!c.unit.dead)return c.unit;if(c&&isFinite(+c.x)&&isFinite(+c.z))return{root:{position:{x:+c.x,y:0,z:+c.z}}};return null;}
function sectorFor(s,p){var a=pos(s);if(!a||!p)return null;var ang=Math.atan2(p.z-a.z,p.x-a.x);return((Math.round((ang+Math.PI)/(Math.PI/4))%8)+8)%8;}
function sectorDistance(a,b){if(a==null||b==null)return 8;var d=Math.abs(a-b)%8;return Math.min(d,8-d);}
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
/* React to a squadmate's warning ONCE for the current threat sector. The old implementation let an
   alert expire back to advance, then immediately treated the same shared contact as brand-new and
   halted the man again. That produced thousands of advance/alert cycles in one battle. Awareness
   is forgotten only after the squad has actually been out of contact for several seconds, or a
   materially different threat sector appears. */
function reactToSharedContact(s,battle,e){
  var sq=s&&s.squad;
  if(!sq||!sq.inContact){
    if(e._sharedContactQuietAt==null)e._sharedContactQuietAt=+battle.time||0;
    if(e._sharedContactAware&&(+battle.time||0)-e._sharedContactQuietAt>=SHARED_RESET_QUIET){e._sharedContactAware=false;e._sharedContactSector=null;e._sharedContactReactedAt=-999;}
    return;
  }
  e._sharedContactQuietAt=null;
  if(s.target||e.state!=='advance'||s.reloading||s.clearingStoppage)return;
  var c=contact(s,battle);if(!c)return;var p=pos(s),aim={x:+c.x||0,z:+c.z||0};if(!p)return;
  var sector=sectorFor(s,aim);
  if(e._sharedContactAware&&sectorDistance(e._sharedContactSector,sector)<=1){bump(battle,s,'sharedContactRepeatBlocks');return;}
  e._sharedContactAware=true;e._sharedContactSector=sector;e._sharedContactReactedAt=+battle.time||0;
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
function reset(sim){sim._combatUrgency=fresh();var a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++){a[i]._combatUrgentUntil=0;if(a[i].eng){a[i].eng._urgentCover=false;a[i].eng._urgentCoverSearchAt=0;a[i].eng._sharedContactAware=false;a[i].eng._sharedContactSector=null;a[i].eng._sharedContactReactedAt=-999;a[i].eng._sharedContactQuietAt=null;}}publish(sim);}
root.BattleModules.registerSystem('combat-urgency',{version:'1.3-contact-awareness',onBattleStart:reset,onBattleRestart:reset,onSimulationStep:markUrgentPosture,onCommanderTick:publish});
root.BattleCombatUrgency={version:'1.3-contact-awareness',summary:function(sim){return sim&&sim._combatUrgencySummary?JSON.parse(JSON.stringify(sim._combatUrgencySummary)):null;}};
console.log('[ENGAGE] combat urgency active: committed cover movement + one shared-contact reaction per threat episode');
})(typeof window!=='undefined'?window:globalThis);

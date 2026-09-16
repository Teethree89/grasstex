/* Lean combat-mobility owner.
   One boundary owns ALL combat locomotion. Engagement owns combat state, stance and fire control;
   it requests a movement intent here, and only this owner publishes combat movement to the resolver.
   Repeated identical intents are coalesced instead of making the resolver reject the same request
   every AI tick. Combat mobility never rewrites Squad/Meso formation orders. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleEngagement||!root.BattleMovementResolver||root.BattleCombatMobility)return;
var MIN_COVER_FORWARD=1.5;
var PUSH_METERS=6.5,PUSH_ARRIVAL=1.25;
var COVER_SEARCH=22,COVER_ARRIVED=1.3,SHARED_REACT_AGE=2.5,SHARED_HOLD=1.8,SHARED_RESET_QUIET=4.5,URGENT_TTL=.55;
var INTENT_REFRESH=.55,INTENT_EPS=.18,HOLD_EPS=1.0;
var oldUpdate=root.BattleEngagement.updateSoldier,baseProposeCombat=root.BattleMovementResolver.proposeCombat;
function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function pos(s){return point(s&&s.root&&s.root.position);}
function estate(s){try{return root.BattleEngagement.stateOf(s);}catch(_){return s.eng||{};}}
function objectiveById(sim,id){var a=sim&&sim._objectives||[];for(var i=0;i<a.length;i++){var o=a[i];if(String(o&&o.id)===String(id)){var d=o.def||o,p=point(d);if(p)return p;}}return null;}
function axis(sim,sq){var a=point(sq&&sq.orderAnchor)||point(sq&&sq.rally),g=objectiveById(sim,sq&&sq.targetObjective)||point(sq&&sq._routeFinalObjective)||point(sq&&sq.objective);if(!a||!g)return null;var dx=g.x-a.x,dz=g.z-a.z,l=Math.hypot(dx,dz);return l<1?null:{anchor:a,fx:dx/l,fz:dz/l,rx:-dz/l,rz:dx/l};}
function fresh(){return{orderClamps:0,coverRejects:0,lateralCoverRejects:0,pushes:0,pushCompletions:0,pushCancels:0,urgentCoverStarts:0,urgentCoverArrivals:0,sharedContactReactions:0,sharedContactRepeatBlocks:0,urgentFrames:0,intentRequests:0,intentPublishes:0,intentCoalesced:0,byOrigin:{},byFaction:{us:{},ge:{}}};}
function stats(sim){return sim._combatMobilityStats||(sim._combatMobilityStats=fresh());}
function bump(sim,s,field){var st=stats(sim);st[field]=(st[field]||0)+1;var f=s&&s.faction||s&&s.squad&&s.squad.faction;if(f){var row=st.byFaction[f]||(st.byFaction[f]={});row[field]=(row[field]||0)+1;}}
function originBump(sim,origin,field){var st=stats(sim),row=st.byOrigin[origin]||(st.byOrigin[origin]={requests:0,publishes:0,coalesced:0});row[field]=(row[field]||0)+1;}
/* The only combat-locomotion publication boundary. State machines may call this every tick, but a
   stable intent is published at most twice per second. Holds are intentionally sticky: tiny body
   drift/personal-space corrections do not redefine where a soldier decided to stop and fight. */
function request(s,p,b,kind,ttl,meta){
  p=point(p);if(!s||!p||!b)return null;meta=meta||{};
  var origin=String(meta.origin||meta.source||'combat-mobility'),reason=String(meta.reason||kind||'combat'),now=+b.time||0,life=ttl==null?.8:Math.max(.2,+ttl||.8),old=s._combatMobilityIntent,eps=(kind==='hold'||kind==='contact-reaction'||kind==='reload-hold')?HOLD_EPS:INTENT_EPS;
  bump(b,s,'intentRequests');originBump(b,origin,'requests');
  var same=!!(old&&old.kind===kind&&old.reason===reason&&dist(old.point,p)<=eps),live=s._movementResolver&&s._movementResolver.combat;
  if(same&&now<(old.refreshAt||0)&&live&&live.kind===kind){
    old.requestedUntil=Math.max(old.requestedUntil||0,now+life);bump(b,s,'intentCoalesced');originBump(b,origin,'coalesced');return live;
  }
  if(same)p={x:old.point.x,z:old.point.z};
  s._combatMobilityIntent={point:{x:p.x,z:p.z},kind:kind,reason:reason,origin:origin,refreshAt:now+INTENT_REFRESH,requestedUntil:now+life};
  bump(b,s,'intentPublishes');originBump(b,origin,'publishes');
  return baseProposeCombat.call(root.BattleMovementResolver,s,p,b,kind,Math.max(life,INTENT_REFRESH+.25),{source:'combat-mobility',reason:reason});
}
function allowCover(s,sim,pt){var q=s&&s.squad;if(!q||q.commandPhase!=='assault'||q.state==='retreat'||(+s.suppressedUntil||0)>sim.time)return true;var ax=axis(sim,q),here=pos(s);if(!ax||!here)return true;var fw=(pt.x-here.x)*ax.fx+(pt.z-here.z)*ax.fz;if(fw>=MIN_COVER_FORWARD)return true;bump(sim,s,'coverRejects');if(fw>=-.25)bump(sim,s,'lateralCoverRejects');return false;}
function strategicForward(s){var q=s&&s.squad,h=pos(s),g=point(q&&q.objective);if(!q||!h||!g)return null;var dx=g.x-h.x,dz=g.z-h.z,l=Math.hypot(dx,dz);return l<2?null:{x:dx/l,z:dz/l,distance:l};}
function boundToken(s){return s&&s.squad?+s.squad._boundUntil||0:0;}
function boundUnsafe(s,b){var q=s&&s.squad;if(!q||s.dead||s.role==='gunner'||(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s))||s.reloading||s.clearingStoppage||s.outOfAmmo)return true;if((+s.suppressedUntil||0)>b.time)return true;if(q.state==='retreat'||q.commandPhase!=='assault'||!q._assaultAuthorized||!q.inContact||b.time>=boundToken(s))return true;if(s._fireteamKey&&q._boundTeam&&s._fireteamKey!==q._boundTeam)return true;return false;}
function clearPush(s,b,cancelled){var r=s&&s._assaultBoundPush;if(!r)return;if(cancelled&&!r.completed)bump(b,s,'pushCancels');delete s._assaultBoundPush;}
function startPush(s,b){var f=strategicForward(s);if(!f)return null;var h=pos(s),step=Math.min(PUSH_METERS,Math.max(2.5,f.distance-1)),r={token:boundToken(s),goal:{x:h.x+f.x*step,z:h.z+f.z*step},completed:false};s._assaultBoundPush=r;bump(b,s,'pushes');return r;}
function maintainPush(s,b){var r=s._assaultBoundPush;if(r&&r.token!==boundToken(s)){clearPush(s,b,true);r=null;}if(boundUnsafe(s,b)){clearPush(s,b,!!r);return;}var combat=s._movementResolver&&s._movementResolver.combat;if(!r){if(!(combat&&combat.kind==='hold'))return;r=startPush(s,b);if(!r)return;}var h=pos(s);if(dist(h,r.goal)<=PUSH_ARRIVAL){r.completed=true;bump(b,s,'pushCompletions');delete s._assaultBoundPush;if(root.BattleMovementProgress)root.BattleMovementProgress.clearFailuresNear(s,b,r.goal);return;}if(s._movementGoalUnreachable){s._movementGoalUnreachable=false;if(root.BattleMovementProgress)root.BattleMovementProgress.noteFailure(s,b,r.goal,'bound-unreachable');clearPush(s,b,true);return;}if(root.BattleMovementProgress&&!root.BattleMovementProgress.candidateAllowed(s,b,r.goal)){clearPush(s,b,true);return;}s._combatUrgentUntil=Math.max(+s._combatUrgentUntil||0,b.time+.5);s.prone=false;s.crawling=false;s.tacticalCrouch=true;request(s,r.goal,b,'assault-bound-push',.8,{origin:'combat-mobility',reason:'authorized fireteam bound'});}
function contact(s,b){var q=s&&s.squad,c=q&&q.contact;if(!c||!isFinite(+c.at)||b.time-(+c.at)>SHARED_REACT_AGE)return null;return c;}
function exposed(s,b){try{var F=root.BattleObstacleField,p=pos(s);return !F||!p||F.coverPotentialAt(b.obstacles,p.x,p.z)>.88;}catch(_){return true;}}
function threatFor(s,b){if(s.target&&!s.target.dead)return s.target;var c=contact(s,b);if(c&&c.unit&&!c.unit.dead)return c.unit;if(c&&isFinite(+c.x)&&isFinite(+c.z))return{root:{position:{x:+c.x,y:0,z:+c.z}}};return null;}
function sectorFor(s,p){var h=pos(s);if(!h||!p)return null;var a=Math.atan2(p.z-h.z,p.x-h.x);return((Math.round((a+Math.PI)/(Math.PI/4))%8)+8)%8;}
function sectorDistance(a,b){if(a==null||b==null)return 8;var d=Math.abs(a-b)%8;return Math.min(d,8-d);}
function safeToMove(s,b){return!!(s&&!s.dead&&!s.reloading&&!s.clearingStoppage&&s.squad&&s.squad.state!=='retreat'&&!(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s)));}
function startUrgent(s,b,e){if(!safeToMove(s,b)||(+s.suppressedUntil||0)<=b.time||!exposed(s,b))return false;var threat=threatFor(s,b);if(!threat||!root.BattleEngagement.findCover)return false;if(e._urgentCoverSearchAt&&b.time<e._urgentCoverSearchAt)return false;e._urgentCoverSearchAt=b.time+.9;var cover=root.BattleEngagement.findCover(s,b,{maxRange:COVER_SEARCH,threat:threat,minEnemyDistance:10});if(!cover)return false;e.cover=cover;e.state='bound';e.since=b.time;e.until=b.time+Math.max(2,cover.distance/Math.max(2.4,+s.crouchRunSpeed||+s.runSpeed||+s.speed||3)+1);e._urgentCover=true;s._combatUrgentUntil=b.time+URGENT_TTL;s.prone=false;s.crawling=false;s.tacticalCrouch=true;s.setUp=false;request(s,cover,b,'cover-bound',.8,{origin:'combat-mobility',reason:'suppressed cover move'});bump(b,s,'urgentCoverStarts');return true;}
function maintainUrgent(s,b,e){if(!e._urgentCover||!e.cover)return false;var d=dist(pos(s),e.cover);if(d<=COVER_ARRIVED){e._urgentCover=false;s._combatUrgentUntil=0;bump(b,s,'urgentCoverArrivals');return false;}if(!safeToMove(s,b)||e.state!=='bound'){e._urgentCover=false;s._combatUrgentUntil=0;return false;}s._combatUrgentUntil=b.time+URGENT_TTL;s.prone=false;s.crawling=false;s.tacticalCrouch=true;request(s,e.cover,b,'cover-bound',.8,{origin:'combat-mobility',reason:'suppressed cover move'});return true;}
function reactShared(s,b,e){var q=s&&s.squad;if(!q||!q.inContact){if(e._sharedContactQuietAt==null)e._sharedContactQuietAt=b.time;if(e._sharedContactAware&&b.time-e._sharedContactQuietAt>=SHARED_RESET_QUIET){e._sharedContactAware=false;e._sharedContactSector=null;e._sharedContactReactedAt=-999;}return;}e._sharedContactQuietAt=null;if(s.target||e.state!=='advance'||s.reloading||s.clearingStoppage)return;var c=contact(s,b);if(!c)return;var h=pos(s),aim={x:+c.x||0,z:+c.z||0};if(!h)return;var sec=sectorFor(s,aim);if(e._sharedContactAware&&sectorDistance(e._sharedContactSector,sec)<=1){bump(b,s,'sharedContactRepeatBlocks');return;}e._sharedContactAware=true;e._sharedContactSector=sec;e._sharedContactReactedAt=b.time;e.state='alert';e.since=b.time;e.until=b.time+SHARED_HOLD;e.lastSeen=aim;e.lastSeenAt=Math.max(+e.lastSeenAt||-999,+c.at||b.time);s._faceHint=aim;s.tacticalCrouch=true;request(s,h,b,'contact-reaction',Math.min(.8,SHARED_HOLD),{origin:'combat-mobility',reason:'new shared threat'});bump(b,s,'sharedContactReactions');}
root.BattleEngagement.updateSoldier=function(s,b){var result=oldUpdate.apply(this,arguments);if(!s||!b||s.dead)return result;maintainPush(s,b);var e=estate(s);if(!maintainUrgent(s,b,e)&&(+s.suppressedUntil||0)>b.time&&['pinned','engage','orient'].indexOf(String(e.state||''))>=0)startUrgent(s,b,e);reactShared(s,b,e);return result;};
function markUrgent(sim){var t=+sim.time||0,a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++){var s=a[i];if(!s||s.dead||t>=(+s._combatUrgentUntil||0))continue;if(s.prone){s.prone=false;s.crawling=false;}s.tacticalCrouch=true;stats(sim).urgentFrames++;}}
function reset(sim){sim._combatMobilityStats=fresh();var a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++){delete a[i]._assaultBoundPush;delete a[i]._combatMobilityIntent;a[i]._combatUrgentUntil=0;if(a[i].eng){a[i].eng._urgentCover=false;a[i].eng._urgentCoverSearchAt=0;a[i].eng._sharedContactAware=false;a[i].eng._sharedContactSector=null;a[i].eng._sharedContactQuietAt=null;}}}
function publish(sim){var st=JSON.parse(JSON.stringify(stats(sim)));sim._combatMobilitySummary=st;sim._assaultForwardGuardSummary={orderClamps:st.orderClamps,coverRejects:st.coverRejects,lateralCoverRejects:st.lateralCoverRejects};sim._assaultBoundMomentumSummary={pushes:st.pushes,completions:st.pushCompletions,cancels:st.pushCancels,pushMeters:PUSH_METERS};sim._combatUrgencySummary={urgentCoverStarts:st.urgentCoverStarts,urgentCoverArrivals:st.urgentCoverArrivals,sharedContactReactions:st.sharedContactReactions,sharedContactRepeatBlocks:st.sharedContactRepeatBlocks,urgentFrames:st.urgentFrames};}
root.BattleModules.registerSystem('combat-mobility',{version:'1.2-single-combat-writer',onBattleStart:reset,onBattleRestart:reset,onSimulationStep:markUrgent,onCommanderTick:publish});
root.BattleAssaultForwardGuard={version:'1.2-single-combat-writer',allowCover:allowCover,summary:function(sim){return sim&&sim._assaultForwardGuardSummary?JSON.parse(JSON.stringify(sim._assaultForwardGuardSummary)):null;}};
root.BattleAssaultBoundMomentum={version:'1.2-single-combat-writer',summary:function(sim){return sim&&sim._assaultBoundMomentumSummary?JSON.parse(JSON.stringify(sim._assaultBoundMomentumSummary)):null;}};
root.BattleCombatUrgency={version:'1.2-single-combat-writer',summary:function(sim){return sim&&sim._combatUrgencySummary?JSON.parse(JSON.stringify(sim._combatUrgencySummary)):null;}};
root.BattleCombatMobility={version:'1.2-single-combat-writer',request:request};
console.log('[ENGAGE] lean combat-mobility owner: sole combat locomotion writer; formation intent remains Meso-owned');
})(typeof window!=='undefined'?window:globalThis);

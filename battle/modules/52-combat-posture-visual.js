/* Visual combat-readiness continuity.
   Gameplay correctly drops a target the instant LOS is lost so hidden movement is not tracked.
   Visually, however, that made the imported/procedural rig snap aim -> idle -> aim as LOS flickered
   through cover. During the existing alert/suppress/orient memory window, feed animateWalk a
   temporary target at the STATIC last-seen point, then restore the real gameplay target before
   returning. AI, contact sharing and firing never see this presentation-only stand-in. */
(function(root){
'use strict';
if(!root.BattleSoldierModel||!root.BattleEngagement||root.BattleCombatPostureVisual)return;
var M=root.BattleSoldierModel,oldAnimate=M.animateWalk;
if(typeof oldAnimate!=='function')return;
function eligible(s,e){return!!(s&&!s.dead&&!s.target&&!s.reloading&&!s.clearingStoppage&&e&&e.lastSeen&&['alert','suppress','orient'].indexOf(String(e.state||''))>=0);}
M.animateWalk=function(s,dt,speed){
  if(!s)return oldAnimate.apply(this,arguments);var e;try{e=root.BattleEngagement.stateOf(s);}catch(_){e=s.eng;}
  if(!eligible(s,e))return oldAnimate.apply(this,arguments);
  var old=s.target,p=e.lastSeen,y=s.root&&s.root.position?+s.root.position.y||0:0;
  s.target={_visualOnly:true,root:{position:{x:+p.x||0,y:y,z:+p.z||0}}};
  try{return oldAnimate.apply(this,arguments);}finally{s.target=old||null;}
};
root.BattleCombatPostureVisual={version:'1.0'};
if(typeof console!=='undefined')console.log('[ANIM] combat-ready aim posture holds on static last-known threat point');
})(typeof window!=='undefined'?window:globalThis);

/* Trigger-time line-of-sight gate for direct fire.
   Perception already requires LOS, but a man can change stance or slide behind cover between
   target acquisition and the trigger pull.  Direct fire must therefore prove LOS again at the
   instant of firing.  Suppressive area fire keeps its separate canSuppress() semantics. */
(function(root){
  'use strict';
  if(!root.SquadAI||root.BattleDirectFireLOSGate)return;

  var oldTryFire=root.SquadAI.tryFire;
  if(typeof oldTryFire!=='function'||typeof root.SquadAI.hasLineOfSight!=='function')return;

  function blocked(s,battle){
    if(!s||!battle||!s.target||s.target.dead||!s.root||!s.target.root)return true;
    try{return !root.SquadAI.hasLineOfSight(s,s.target,battle.heightAt,battle.obstacles);}catch(_){return false;}
  }

  root.SquadAI.tryFire=function(s,battle){
    if(!s||!battle||!s.target||s.target.dead)return false;
    if(blocked(s,battle)){
      s._losBlockedFire=(s._losBlockedFire||0)+1;
      s._losBlockedFireAt=+battle.time||0;
      return false;
    }
    return oldTryFire(s,battle);
  };

  root.BattleDirectFireLOSGate={
    version:'65-trigger-los',
    blocked:blocked,
    blockedCount:function(s){return s&&s._losBlockedFire||0;}
  };
  if(typeof console!=='undefined')console.log('[FIRE] trigger-time stance-aware LOS gate active');
})(typeof window!=='undefined'?window:globalThis);

/* Bridges gameplay fire/reload events to semantic soldier animation tags.
   Ammunition ownership lives in BattleAmmunition when that system is present. This bridge only
   presents those states; its tiny legacy magazine fallback remains for stripped runtimes/tests
   that intentionally omit the finite-ammo module. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleSoldierModel||!root.SquadAI||!root.BattleSim)return;
  var oldStart=root.BattleSim.start,oldUpdate=root.SquadAI.updateSoldier,T=root.BattleSoldierModel.TAGS;
  function finiteAmmo(){return!!root.BattleAmmunition;}
  function startLegacyReload(s,battle){if(finiteAmmo()||!s||s.dead||!s.weapon||s.reloading)return;var dur=s.weapon.stats.reloadTime||2.5;s.reloading=true;s.reloadStart=battle.time;s.reloadUntil=battle.time+dur;s.fireCooldown=Math.max(s.fireCooldown||0,dur);root.BattleSoldierModel.triggerAnimation(s,T.reload,{weapon:s.weapon.kind,duration:dur});if(root.BattleTelemetry)root.BattleTelemetry.record('decision-reload',{soldier:s.id,faction:s.faction,weapon:s.weapon.kind,duration:dur},battle);}
  function finishLegacyReload(s){if(finiteAmmo()||!s||!s.weapon)return;s.reloading=false;s.weapon.ammo=s.weapon.magSize||s.weapon.stats.magazine||8;s.reloadStart=0;s.reloadUntil=0;}
  root.SquadAI.updateSoldier=function(s,battle){
    if(s&&!s.dead&&s.weapon){
      if(!finiteAmmo()){
        if(s.reloading&&battle.time>=s.reloadUntil)finishLegacyReload(s);
        if(!s.reloading&&s.weapon.ammo<=0)startLegacyReload(s,battle);
      }
      /* Whether the finite-ammo system or the fallback owns the timer, reloading is a real combat
         interruption: the man does not keep a firing-station/base-of-fire pose while swapping it. */
      if(s.reloading)s.fireCooldown=Math.max(s.fireCooldown||0,Math.max(.16,(+s.reloadUntil||battle.time)-battle.time));
    }
    oldUpdate(s,battle);
    if(s&&s.reloading){
      s.setUp=false;s.tacticalCrouch=true;
      if(s.target&&root.BattleMovementResolver){root.BattleMovementResolver.proposeCombat(s,{x:s.root.position.x,z:s.root.position.z},battle,'reload-hold',null,{source:'weapon-cycle',reason:'reload pause'});root.BattleMovementResolver.resolve(s,battle);}
      else if(s.target)s.destination={x:s.root.position.x,z:s.root.position.z};
    }
  };
  root.BattleSim.start=function(scene,opts){var sim=oldStart(scene,opts),oldFire=sim.onFire;sim.onFire=function(soldier){
    if(soldier&&soldier.weapon){
      /* BattleAmmunition consumes the round after a successful trigger. Do not double-decrement it
         here; this callback is now an animation/event bridge only. */
      if(!finiteAmmo())soldier.weapon.ammo=Math.max(0,(soldier.weapon.ammo==null?soldier.weapon.magSize:soldier.weapon.ammo)-1);
      root.BattleSoldierModel.triggerAnimation(soldier,T.fire,{weapon:soldier.weapon.kind,ammo:soldier.weapon.ammo});
    }
    if(oldFire)oldFire.apply(sim,arguments);
  };return sim;};
  root.BattleModules.registerSystem('soldier-combat-animation',{version:'23-finite-ammo-owner',beforeBattleRestart:function(sim){
    ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){
      s.reloading=false;s.reloadUntil=0;
      if(!finiteAmmo()&&s.weapon)s.weapon.ammo=s.weapon.magSize||s.weapon.stats.magazine||8;
    });});
  }});
  console.log('[ANIM] fire/reload event bridge loaded; finite ammo retains magazine ownership');
})(typeof window!=='undefined'?window:globalThis);

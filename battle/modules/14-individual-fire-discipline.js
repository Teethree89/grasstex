/* Individual fire discipline.
   Runs before the cover drill module so the stock soldier AI cannot fire during a relocation,
   immediately on target acquisition, or while the body is still facing somewhere else. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI)return;

  var oldUpdate=root.SquadAI.updateSoldier;
  var AIM_CONE=.22;             // ~12.6 degrees
  var AIM_SETTLE=.45;           // battle seconds after acquisition / large retarget
  var MOVEMENT_SETTLE=.30;      // keep the weapon down while relocating

  function targetSector(s,t){
    if(!s||!t||!t.root)return null;
    var dx=t.root.position.x-s.root.position.x,dz=t.root.position.z-s.root.position.z;
    var a=Math.atan2(dz,dx),n=Math.round((a+Math.PI)/(Math.PI/4))%8;
    return(n+8)%8;
  }
  function sectorDistance(a,b){if(a==null||b==null)return 8;var d=Math.abs(a-b)%8;return Math.min(d,8-d);}
  function facingError(s,t){
    if(!s||!t||!t.root)return Math.PI;
    var dx=t.root.position.x-s.root.position.x,dz=t.root.position.z-s.root.position.z;
    if(Math.abs(dx)+Math.abs(dz)<1e-5)return 0;
    var yaw=Math.atan2(dx,dz),diff=yaw-(s.root.rotation.y||0);
    return Math.abs(Math.atan2(Math.sin(diff),Math.cos(diff)));
  }
  function relocating(s){return s&&(['crawl','crouch-run'].indexOf(s._tacticMode)>=0||s.crawling);}
  function movingTooFast(s){return !!(s&&s.moving&&(s.moveSpeed||0)>Math.max(.16,(s.speed||1)*.12));}
  function inhibitFire(s,battle,seconds){
    if(!s||!battle)return;
    s.fireCooldown=Math.max(s.fireCooldown||0,seconds);
    s._aimReadyAt=Math.max(s._aimReadyAt||0,battle.time+seconds);
  }

  root.SquadAI.updateSoldier=function(s,battle){
    if(!s||!battle)return oldUpdate(s,battle);

    var before=s.target,oldSector=targetSector(s,before),badFacing=before&&facingError(s,before)>AIM_CONE;
    /* The stock AI resolves fire inside oldUpdate(). Keep its cooldown non-zero whenever the
       soldier has not earned a stable firing solution yet. This blocks the damage event itself,
       not merely the muzzle animation. */
    if(!before||s.reloading||relocating(s)||movingTooFast(s)||badFacing||battle.time<(s._aimReadyAt||0)){
      inhibitFire(s,battle,(!before||badFacing)?AIM_SETTLE:MOVEMENT_SETTLE);
    }

    oldUpdate(s,battle);
    if(s.dead)return;

    var after=s.target,newSector=targetSector(s,after);
    if(after&&(!before||before!==after)){
      var major=!before||sectorDistance(oldSector,newSector)>1;
      if(major)inhibitFire(s,battle,AIM_SETTLE);
      /* A different enemy in effectively the same direction is not a new cover problem. Tell the
         following individual-tactics module that this target belongs to the existing threat sector. */
      if(before&&sectorDistance(oldSector,newSector)<=1&&s._tacticMode){
        s._tacticTarget=after.id;
        s._tacticThreatSector=newSector;
      }
    }

    if(after){
      var err=facingError(s,after);
      s._aimFacingError=err;
      if(relocating(s)||movingTooFast(s)||err>AIM_CONE)inhibitFire(s,battle,err>AIM_CONE?AIM_SETTLE:MOVEMENT_SETTLE);
    }else{
      s._aimFacingError=null;
      s._aimReadyAt=Math.max(s._aimReadyAt||0,battle.time+.12);
    }
  };

  root.BattleModules.registerSystem('individual-fire-discipline',{
    version:'24-followup',
    beforeBattleRestart:function(sim){
      ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){s._aimReadyAt=0;s._aimFacingError=null;s._tacticThreatSector=null;});});
    }
  });
  root.BattleIndividualFireDiscipline={facingError:facingError,aimCone:AIM_CONE};
  console.log('[TACTICS] fire discipline active; soldiers must settle + face target before firing');
})(typeof window!=='undefined'?window:globalThis);
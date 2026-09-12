/* v20 first-pass building hardpoints.
   Soldiers can enter buildings through doors, claim interior window positions and establish fire
   from them. Full garrison/room-clearing/fortification behavior is a later hardpoint layer. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleNavigation)return;

  function eligible(s){return s&&!s.dead&&(s.role==='gunner'||s.role==='rifleman'||s.role==='captain');}
  function releaseInvalid(sim){
    ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){if(s._windowSlot&&(!s.target||s.target.dead||s.squad.state==='retreat'))root.BattleNavigation.releaseWindow(s);});});
  }
  function assignWindows(sim){
    releaseInvalid(sim);
    ['us','ge'].forEach(function(f){
      var squads=sim.factions[f].squads||[];
      for(var q=0;q<squads.length;q++){
        var sq=squads[q];if(sq.state!=='engaged'&&sq.commandPhase!=='capture'&&sq.commandPhase!=='defend')continue;
        var claimed=0;
        for(var i=0;i<sq.members.length&&claimed<3;i++){
          var s=sq.members[i];if(!eligible(s)||!s.target)continue;
          if(s._windowSlot){claimed++;continue;}
          var slot=root.BattleNavigation.claimWindow(s,s.target,s.role==='gunner'?62:48);
          if(slot){claimed++;if(root.BattleTelemetry)root.BattleTelemetry.record('decision-window',{faction:f,squad:sq.id,soldier:s.id,role:s.role,building:slot.building,window:slot.id},sim);}
        }
      }
    });
  }
  function directive(soldier,battle){
    if(!soldier||!soldier._windowSlot||!soldier.target)return null;
    var d=root.BattleNavigation.windowDirective(soldier,soldier.target);if(!d)return null;
    var range=Math.hypot(soldier.root.position.x-d.x,soldier.root.position.z-d.z);
    return{x:d.x,z:d.z,arrived:range<1.05,slot:d.slot};
  }

  root.BattleModules.registerSystem('building-hardpoints',{version:'20',onCommanderTick:function(sim){assignWindows(sim);},beforeBattleRestart:function(sim){['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){root.BattleNavigation.releaseWindow(s);});});}});

  /* Modules are intentionally loaded after commander-ai in v20. This final wrapper lets a
     hardpoint claim override ordinary formation movement without teaching commander-ai what a
     window is. */
  if(root.SquadAI&&root.SquadAI.updateSoldier){
    var oldUpdate=root.SquadAI.updateSoldier;
    root.SquadAI.updateSoldier=function(soldier,battle){
      oldUpdate(soldier,battle);
      var d=directive(soldier,battle);if(!d)return;
      soldier.destination={x:d.x,z:d.z};soldier.prone=false;
      if(d.arrived){soldier.destination={x:soldier.root.position.x,z:soldier.root.position.z};if(soldier.role==='gunner'){soldier.setUpSince=soldier.setUpSince||battle.time;soldier.setUp=battle.time-soldier.setUpSince>1.0;}}
    };
  }

  root.BattleBuildingHardpoints={assign:assignWindows,directive:directive};
  console.log('[HARDPOINT] window occupation tactics v20 loaded');
})(typeof window!=='undefined'?window:globalThis);

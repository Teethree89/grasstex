/* First full firing-station hardpoint pass.
   Soldiers reserve tactically useful interior window stations, enter through doors, crouch back
   from the frame, and aim through windows facing the enemy. Stations behave like vehicle seats. */
(function(root){
  'use strict';if(!root.BattleModules||!root.BattleNavigation)return;
  function eligible(s){return s&&!s.dead&&(s.role==='gunner'||s.role==='rifleman'||s.role==='captain');}
  function releaseInvalid(sim){['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){if(s._firingStation&&(!s.target||s.target.dead||s.squad.state==='retreat'||s.reloading))root.BattleNavigation.releaseFiringPosition(s);});});}
  function assignStations(sim){
    releaseInvalid(sim);['us','ge'].forEach(function(f){var squads=sim.factions[f].squads||[];for(var q=0;q<squads.length;q++){var sq=squads[q];if(sq.state!=='engaged'&&sq.commandPhase!=='capture'&&sq.commandPhase!=='defend')continue;var claimed=0;for(var i=0;i<sq.members.length&&claimed<3;i++){var s=sq.members[i];if(!eligible(s)||!s.target)continue;if(s._firingStation){claimed++;continue;}var station=root.BattleNavigation.claimFiringPosition(s,s.target,s.role==='gunner'?78:62);if(station){claimed++;s._tacticMode=null;s._tacticCover=null;if(root.BattleTelemetry)root.BattleTelemetry.record('decision-firing-station',{faction:f,squad:sq.id,soldier:s.id,role:s.role,building:station.building,station:station.id,window:station.windowId},sim);}}}});
  }
  function directive(soldier,battle){if(!soldier||!soldier._firingStation||!soldier.target)return null;var d=root.BattleNavigation.firingDirective(soldier,soldier.target);if(!d)return null;var range=Math.hypot(soldier.root.position.x-d.x,soldier.root.position.z-d.z);return{x:d.x,z:d.z,arrived:range<.65,slot:d.slot,stance:d.stance,aimPoint:d.aimPoint};}
  root.BattleModules.registerSystem('building-hardpoints',{version:'22-pr',onCommanderTick:function(sim){assignStations(sim);},beforeBattleRestart:function(sim){['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){root.BattleNavigation.releaseFiringPosition(s);});});}});
  if(root.SquadAI&&root.SquadAI.updateSoldier){var oldUpdate=root.SquadAI.updateSoldier;root.SquadAI.updateSoldier=function(s,battle){oldUpdate(s,battle);var d=directive(s,battle);if(!d)return;s.crawling=false;s.prone=false;s.tacticalCrouch=true;s.crouching=true;s.destination={x:d.x,z:d.z};if(d.arrived){s.destination={x:s.root.position.x,z:s.root.position.z};s.state='hardpoint';if(s.role==='gunner'){s.setUpSince=s.setUpSince||battle.time;s.setUp=battle.time-s.setUpSince>1.0;}}};}
  root.BattleBuildingHardpoints={assign:assignStations,directive:directive};console.log('[HARDPOINT] reservable interior firing stations loaded');
})(typeof window!=='undefined'?window:globalThis);

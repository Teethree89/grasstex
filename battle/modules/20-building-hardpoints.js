/* Reservable interior firing stations.

   A station is claimed like a vehicle seat: the commander tick decides WHO gets one, and
   engagement.js's 'station' state decides how that soldier moves in, crouches back from the frame
   and fires through it. This module no longer wraps SquadAI.updateSoldier - a claimed station is
   simply the highest-priority position input the engagement pipeline reads. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleNavigation)return;
  var MAX_PER_SQUAD=3;
  function eligible(s){return s&&!s.dead&&(s.role==='gunner'||s.role==='rifleman'||s.role==='captain');}
  function garrisonPhase(sq){return sq.state==='engaged'||sq.commandPhase==='capture'||sq.commandPhase==='defend';}
  function releaseInvalid(sim){
    ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){
      if(s._firingStation&&(!s.target||s.target.dead||s.squad.state==='retreat'||s.reloading))root.BattleNavigation.releaseFiringPosition(s);
    });});
  }
  function assignStations(sim){
    releaseInvalid(sim);
    ['us','ge'].forEach(function(f){
      var squads=sim.factions[f].squads||[];
      for(var q=0;q<squads.length;q++){
        var sq=squads[q];if(!garrisonPhase(sq))continue;
        var claimed=0;
        for(var i=0;i<sq.members.length&&claimed<MAX_PER_SQUAD;i++){
          var s=sq.members[i];if(!eligible(s)||!s.target)continue;
          if(s._firingStation){claimed++;continue;}
          var station=root.BattleNavigation.claimFiringPosition(s,s.target,s.role==='gunner'?78:62);
          if(!station)continue;
          claimed++;
          /* A station supersedes whatever cover the soldier was heading for. */
          if(root.BattleEngagement){var e=root.BattleEngagement.stateOf(s);e.cover=null;}
          if(root.BattleTelemetry)root.BattleTelemetry.record('decision-firing-station',{faction:f,squad:sq.id,soldier:s.id,role:s.role,building:station.building,station:station.id,window:station.windowId},sim);
        }
      }
    });
  }
  root.BattleModules.registerSystem('building-hardpoints',{
    version:'29-engagement',
    onCommanderTick:function(sim){assignStations(sim);},
    beforeBattleRestart:function(sim){['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){root.BattleNavigation.releaseFiringPosition(s);});});}
  });
  root.BattleBuildingHardpoints={assign:assignStations};
  console.log('[HARDPOINT] reservable interior firing stations loaded');
})(typeof window!=='undefined'?window:globalThis);

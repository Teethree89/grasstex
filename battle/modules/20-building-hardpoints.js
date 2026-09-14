/* Reservable interior firing stations.

   A station is claimed like a vehicle seat: the commander tick decides WHO gets one, and
   engagement.js's 'station' state decides how that soldier moves in, crouches back from the frame
   and fires through it. This module no longer wraps SquadAI.updateSoldier - a claimed station is
   simply the highest-priority position input the engagement pipeline reads. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleNavigation)return;
  var MAX_PER_SQUAD=3,STATION_CONTACT_GRACE=10.5,CLAIM_RETRY=2.0,MAX_NEW_CLAIMS_PER_TICK=1;
  function eligible(s){return s&&!s.dead&&(s.role==='gunner'||s.role==='rifleman'||s.role==='captain');}
  function garrisonPhase(sq){return sq.state==='engaged'||sq.commandPhase==='capture'||sq.commandPhase==='defend';}
  /* A firing station is an engagement assignment, not a disposable one-frame cover hint. Keep it
     through short LOS gaps, reloads and stoppage clearing so a man walking to a window does not
     abandon/reclaim a different slot halfway through the trip. */
  function recentThreat(s,sim){
    if(s.target&&!s.target.dead)return true;
    var e=root.BattleEngagement&&root.BattleEngagement.stateOf?root.BattleEngagement.stateOf(s):s.eng;
    if(e&&isFinite(+e.lastSeenAt)&&sim.time-(+e.lastSeenAt)<=STATION_CONTACT_GRACE)return true;
    var c=s.squad&&s.squad.contact;
    return!!(c&&isFinite(+c.at)&&sim.time-(+c.at)<=STATION_CONTACT_GRACE);
  }
  function releaseInvalid(sim){
    ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){
      if(!s._firingStation)return;
      var hardRelease=s.dead||s.hp<=0||s.squad.state==='retreat';
      if(hardRelease||!recentThreat(s,sim)){
        root.BattleNavigation.releaseFiringPosition(s);
        s._nextStationClaimAt=Math.max(+s._nextStationClaimAt||0,sim.time+CLAIM_RETRY);
      }
    });});
  }
  function assignStations(sim){
    releaseInvalid(sim);
    ['us','ge'].forEach(function(f){
      var squads=sim.factions[f].squads||[];
      for(var q=0;q<squads.length;q++){
        var sq=squads[q];if(!garrisonPhase(sq))continue;
        var claimed=0,newClaims=0;
        for(var i=0;i<sq.members.length&&claimed<MAX_PER_SQUAD;i++){
          var s=sq.members[i];if(!eligible(s)||!s.target)continue;
          if(s._firingStation){claimed++;continue;}
          if(newClaims>=MAX_NEW_CLAIMS_PER_TICK)break;
          if((+s._nextStationClaimAt||0)>sim.time)continue;
          var station=root.BattleNavigation.claimFiringPosition(s,s.target,s.role==='gunner'?78:62);
          if(!station){s._nextStationClaimAt=sim.time+CLAIM_RETRY;continue;}
          claimed++;newClaims++;s._nextStationClaimAt=0;s._stationClaimedAt=sim.time;
          /* A station supersedes whatever cover the soldier was heading for. */
          if(root.BattleEngagement){var e=root.BattleEngagement.stateOf(s);e.cover=null;}
          if(root.BattleTelemetry)root.BattleTelemetry.record('decision-firing-station',{faction:f,squad:sq.id,soldier:s.id,role:s.role,building:station.building,station:station.id,window:station.windowId},sim);
        }
      }
    });
  }
  root.BattleModules.registerSystem('building-hardpoints',{
    version:'46-committed-station-claims',
    onCommanderTick:function(sim){assignStations(sim);},
    beforeBattleRestart:function(sim){['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){root.BattleNavigation.releaseFiringPosition(s);s._nextStationClaimAt=0;});});}
  });
  root.BattleBuildingHardpoints={assign:assignStations,recentThreat:recentThreat,contactGrace:STATION_CONTACT_GRACE,claimRetry:CLAIM_RETRY};
  console.log('[HARDPOINT] firing stations persist through reloads/LOS gaps and new claims are amortized');
})(typeof window!=='undefined'?window:globalThis);

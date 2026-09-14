/* Make fire-and-movement doctrine respect finite weapon state.
   Engagement's squad update predates ammunition and counts an `engage` soldier as effective base
   of fire even while his weapon is reloading, clearing a stoppage or completely empty. It can also
   assign that man suppressor duty. Temporarily mask unavailable men while the squad-level contact
   and bound calculation runs, then restore their real engagement state before individual updates.
   Visible targets still count as contact; only firing capability is removed. */
(function(root){
'use strict';
if(!root.BattleEngagement||!root.BattleAmmunition||root.BattleAmmoEngagementIntegration)return;

var oldUpdateSquad=root.BattleEngagement.updateSquad;
function unavailable(s){
  if(!s||s.dead||!s.weapon)return true;
  if(s.reloading||s.clearingStoppage||s.weapon.jammed||s.outOfAmmo)return true;
  return(+s.weapon.ammo||0)<=0;
}
root.BattleEngagement.updateSquad=function(sq,battle){
  var held=[],members=sq&&sq.members||[];
  for(var i=0;i<members.length;i++){
    var s=members[i];if(!unavailable(s))continue;
    var e=root.BattleEngagement.stateOf&&root.BattleEngagement.stateOf(s);if(!e)continue;
    held.push({s:s,e:e,state:e.state,station:s._firingStation});
    e.state='weapon-cycle';s._firingStation={_ammoAvailabilityMask:true};
  }
  try{return oldUpdateSquad.apply(this,arguments);}
  finally{for(var j=0;j<held.length;j++){held[j].e.state=held[j].state;held[j].s._firingStation=held[j].station;}}
};

root.BattleAmmoEngagementIntegration={version:'1.0'};
console.log('[FIRE] squad base-of-fire accounting now excludes unavailable weapons');
})(typeof window!=='undefined'?window:globalThis);

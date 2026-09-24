/* Practical WW2 infantry effective ranges + battlefield spotting envelope.
   Ranges are practical tactical envelopes rather than maximum projectile travel.  The combat
   dispersion values are one-axis Gaussian sigma at 100 m; 14-z-ballistic-raycast converts them
   into a real two-dimensional shot group.  They intentionally describe a combat shooter, not a
   rifle clamped in a test fixture.

   Calibration targets (roughly 90% group diameter, rested/unsuppressed shooter):
     rifle: ~0.41 m @100 m, ~1.22 m @300 m, ~2.66 m @450 m
     deployed LMG: ~2.4 m @300 m (the gunner setup modifier tightens the base LMG group)
   Movement, suppression, stance and command degradation are layered on top by ballistics. */
(function(root){
'use strict';
if(!root.SquadAI||!root.BattleWeapons||root.BattleEffectiveRanges)return;

var EFFECTIVE={
  rifle:{range:450,falloffStart:300,combatSigmaAt100:.095,rangeDispersion:.45},
  carbine:{range:250,falloffStart:160,combatSigmaAt100:.140,rangeDispersion:.50},
  lmg:{range:500,falloffStart:300,combatSigmaAt100:.260,rangeDispersion:.50},
  pistol:{range:25,falloffStart:15,combatSigmaAt100:.200,rangeDispersion:.30},
  smg:{range:150,falloffStart:85,combatSigmaAt100:.300,rangeDispersion:.65},
  grenade:{range:35,falloffStart:35}
};
var ROLE={
  sergeant:{visionRange:450,engageRange:25},
  rifleman:{visionRange:500,engageRange:450},
  gunner:{visionRange:525,engageRange:500},
  scout:{visionRange:575,engageRange:250}
};

Object.keys(EFFECTIVE).forEach(function(kind){
  var stats=root.BattleWeapons.STATS&&root.BattleWeapons.STATS[kind],cfg=EFFECTIVE[kind];
  if(!stats)return;
  stats.range=cfg.range;stats.falloffStart=cfg.falloffStart;
  if(isFinite(+cfg.combatSigmaAt100))stats.combatSigmaAt100=+cfg.combatSigmaAt100;
  if(isFinite(+cfg.rangeDispersion))stats.rangeDispersion=+cfg.rangeDispersion;
});
Object.keys(ROLE).forEach(function(role){
  var r=root.SquadAI.ROLES&&root.SquadAI.ROLES[role],cfg=ROLE[role];if(!r)return;
  r.visionRange=cfg.visionRange;r.engageRange=cfg.engageRange;
});

root.BattleEffectiveRanges={version:'1.1-combat-groups',weapons:EFFECTIVE,roles:ROLE};
console.log('[COMBAT] practical WW2 ranges + combat shot-group calibration active');
})(typeof window!=='undefined'?window:globalThis);

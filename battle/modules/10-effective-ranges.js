/* Practical WW2 infantry effective ranges + battlefield spotting envelope.
   The weapon ranges below are deliberately practical combat ranges, not maximum projectile travel:
     rifle 400-500 m -> 450 m
     carbine 200-300 m -> 250 m
     light machine gun 300-600 m -> 500 m
     pistol about 50 m -> 50 m
   Future metadata also records SMG 150 m and hand grenade 35 m for when those weapon classes land.

   Perception must extend at least as far as the weapon it serves or a 450 m rifle remains a 140 m
   rifle in practice.  Standing troops in open terrain may therefore be detected around 450-575 m;
   the existing stance/cover/movement visibility multipliers and true LOS still reduce that sharply
   for crouched/prone men, hedgerows, buildings, dead ground and hills. */
(function(root){
'use strict';
if(!root.SquadAI||!root.BattleWeapons||root.BattleEffectiveRanges)return;

var EFFECTIVE={
  rifle:{range:450,falloffStart:300},
  carbine:{range:250,falloffStart:160},
  lmg:{range:500,falloffStart:300},
  pistol:{range:50,falloffStart:25},
  smg:{range:150,falloffStart:85},
  grenade:{range:35,falloffStart:35}
};
var ROLE={
  captain:{visionRange:450,engageRange:50},
  rifleman:{visionRange:500,engageRange:450},
  gunner:{visionRange:525,engageRange:500},
  scout:{visionRange:575,engageRange:250}
};

Object.keys(EFFECTIVE).forEach(function(kind){
  var stats=root.BattleWeapons.STATS&&root.BattleWeapons.STATS[kind],cfg=EFFECTIVE[kind];
  if(!stats)return;stats.range=cfg.range;stats.falloffStart=cfg.falloffStart;
});
Object.keys(ROLE).forEach(function(role){
  var r=root.SquadAI.ROLES&&root.SquadAI.ROLES[role],cfg=ROLE[role];if(!r)return;
  r.visionRange=cfg.visionRange;r.engageRange=cfg.engageRange;
});

root.BattleEffectiveRanges={version:'1.0',weapons:EFFECTIVE,roles:ROLE};
console.log('[COMBAT] practical WW2 weapon ranges + matching spotting envelope active');
})(typeof window!=='undefined'?window:globalThis);

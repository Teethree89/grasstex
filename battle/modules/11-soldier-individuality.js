/* Deterministic individual soldier morphology + locomotion variance.
   Infantry should not be identical clones: height/build vary subtly and those traits combine with
   a fitness factor to produce different walk/run speeds.  Variation is deterministic by faction/id
   so replays do not consume combat RNG or change when the battle is restarted. */
(function(root){
  'use strict';
  if(!root.BattleModules||root.BattleSoldierIndividuality)return;
  var SYSTEM='soldier-individuality';
  var ROLE={
    captain:{walk:1.72,run:4.65},
    rifleman:{walk:1.66,run:4.55},
    gunner:{walk:1.52,run:4.00},
    scout:{walk:1.80,run:4.95},
    engineer:{walk:1.62,run:4.35}
  };
  var RUN_DISTANCE=7.5;

  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function hash(str){var h=2166136261>>>0;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function unitRand(s,salt){var h=hash(String(s&&s.faction||'')+'|'+String(s&&s.id||0)+'|'+String(s&&s.role||'')+'|'+salt);h^=h<<13;h^=h>>>17;h^=h<<5;return(h>>>0)/4294967295;}
  function phenotype(s){
    if(!s)return null;if(s.phenotype&&s.phenotype.version==='66')return s.phenotype;
    var height=.94+unitRand(s,'height')*.12,width=.88+unitRand(s,'width')*.24,depth=.92+unitRand(s,'depth')*.18,fitness=.92+unitRand(s,'fitness')*.16;
    var buildPenalty=1-(width-1)*.18,heightEffect=1+(height-1)*.06,speedFactor=clamp(fitness*buildPenalty*heightEffect,.86,1.14),base=ROLE[s.role]||ROLE.rifleman;
    var p={version:'66',heightScale:+height.toFixed(3),widthScale:+width.toFixed(3),depthScale:+depth.toFixed(3),fitness:+fitness.toFixed(3),speedFactor:+speedFactor.toFixed(3),walkSpeed:+(base.walk*speedFactor).toFixed(2),runSpeed:+(base.run*speedFactor).toFixed(2)};
    s.phenotype=p;s.walkSpeed=p.walkSpeed;s.runSpeed=p.runSpeed;s.speed=p.runSpeed;
    /* Scale the pose hierarchy, not the navigation/world root. This changes stature/build and all
       attached equipment together without moving the soldier's ground anchor or collision point. */
    if(s.poseRoot&&s.poseRoot.scaling&&typeof s.poseRoot.scaling.set==='function')s.poseRoot.scaling.set(p.widthScale,p.heightScale,p.depthScale);
    return p;
  }
  function desiredGait(s){
    if(!s||s.dead||!s.root||!s.destination)return'walk';
    var d=Math.hypot((+s.destination.x||0)-(+s.root.position.x||0),(+s.destination.z||0)-(+s.root.position.z||0)),phase=s.squad&&s.squad.commandPhase||'';
    if(s.prone||s.reloading||s.clearingStoppage)return'walk';
    if(s.state==='retreat')return'run';
    if(d<RUN_DISTANCE)return'walk';
    if(phase==='defend'||phase==='hold'||phase==='support-hold'||phase==='reserve')return'walk';
    return'run';
  }
  function updateSpeeds(sim){
    var units=root.BattleModules.unitsFor(sim);for(var i=0;i<units.length;i++){
      var s=units[i],p=phenotype(s);if(!p)continue;var gait=desiredGait(s);s._locomotionGait=gait;s.speed=gait==='run'?p.runSpeed:p.walkSpeed;
    }
  }
  function applyAll(sim){var units=root.BattleModules.unitsFor(sim);for(var i=0;i<units.length;i++)phenotype(units[i]);updateSpeeds(sim);}
  root.BattleModules.registerSystem(SYSTEM,{version:'67-weapon-handling',onBattleStart:applyAll,onBattleRestart:applyAll,onSimulationStep:updateSpeeds});
  root.BattleSoldierIndividuality={version:'67-weapon-handling',roleSpeeds:ROLE,runDistance:RUN_DISTANCE,phenotype:phenotype,desiredGait:desiredGait};
  if(typeof console!=='undefined')console.log('[INFANTRY] individual body proportions + weapon-handling gait variance active');
})(typeof window!=='undefined'?window:globalThis);

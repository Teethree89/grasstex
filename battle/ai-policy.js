/* Battle Sim v19 AI policy layer.
   Tactical behavior lives in a parameter object so automated scenario batches can compare,
   score and persist better policies without rewriting commander code. */
(function(root){
  'use strict';

  var API_BASE=root.BATTLE_API_BASE||'/grasstex/';
  var ENDPOINT=API_BASE+'battle_policy.php';
  var DEFAULTS={
    cohesionRadius:34,
    captainlessCohesion:26,
    regroupHold:0.40,
    cornerHold:0.80,
    cornerNoCaptainExtra:0.35,
    supportDelay:20,
    sectorNeutralNeed:75,
    sectorEnemyNeed:110,
    sectorActiveBonus:18,
    sectorDistanceWeight:0.55,
    routeArrivalRadius:8,
    finalRouteRadius:14,
    captureCommitRatio:0.82,
    contactDistance:28,
    townBoundary:58,
    engagedRallyAdvance:0.16,
    pressObjectiveMinDistance:7,
    pressEnemyClearance:35,
    scoutLead:4,
    gunnerTrail:3,
    objectiveHoldWin:35,
    decisionSnapshotSeconds:5
  };
  var RANGES={
    cohesionRadius:[22,50],captainlessCohesion:[18,38],regroupHold:[0.15,1.2],cornerHold:[0.2,1.8],cornerNoCaptainExtra:[0,1.2],
    supportDelay:[0,45],sectorNeutralNeed:[35,120],sectorEnemyNeed:[60,170],sectorActiveBonus:[0,40],sectorDistanceWeight:[0.2,1.1],
    routeArrivalRadius:[5,14],finalRouteRadius:[8,24],captureCommitRatio:[0.55,0.98],contactDistance:[16,48],townBoundary:[45,75],
    engagedRallyAdvance:[0.04,0.34],pressObjectiveMinDistance:[3,14],pressEnemyClearance:[18,65],scoutLead:[0,10],gunnerTrail:[0,8],
    objectiveHoldWin:[20,60],decisionSnapshotSeconds:[3,12]
  };
  /* Game rules are deliberately excluded: the learner may tune tactics, not victory/capture rules. */
  var TUNABLE=['cohesionRadius','captainlessCohesion','regroupHold','cornerHold','supportDelay','sectorNeutralNeed','sectorEnemyNeed','sectorActiveBonus','sectorDistanceWeight','routeArrivalRadius','finalRouteRadius','captureCommitRatio','contactDistance','engagedRallyAdvance','pressEnemyClearance','scoutLead','gunnerTrail'];

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function normalize(input){
    var out=clone(DEFAULTS),src=input&&input.policy?input.policy:input||{};
    Object.keys(DEFAULTS).forEach(function(k){
      if(src[k]==null||!isFinite(+src[k]))return;
      var r=RANGES[k],v=+src[k];out[k]=r?clamp(v,r[0],r[1]):v;
    });
    return out;
  }
  var persisted=root.BATTLE_AI_POLICY||null;
  var current=normalize(persisted&&persisted.policy?persisted.policy:persisted);
  var revision=persisted&&persisted.revision||0;

  function get(){return clone(current);}
  function set(nextPolicy,meta){current=normalize(nextPolicy);if(meta&&meta.revision!=null)revision=meta.revision;return get();}
  function policyFor(sim,faction){if(sim&&sim.aiPolicies&&sim.aiPolicies[faction])return sim.aiPolicies[faction];return current;}
  function setMatchPolicies(sim,us,ge){sim.aiPolicies={us:normalize(us||current),ge:normalize(ge||current)};return sim.aiPolicies;}
  function clearMatchPolicies(sim){if(sim)sim.aiPolicies=null;}

  function mutate(base,strength){
    var out=normalize(base),s=strength==null?.16:+strength;
    TUNABLE.forEach(function(k){
      var r=RANGES[k],span=r[1]-r[0],jitter=(Math.random()+Math.random()+Math.random()-1.5)/1.5;
      out[k]=clamp(out[k]+jitter*span*s,r[0],r[1]);
      if(Math.abs(out[k])>=1)out[k]=+out[k].toFixed(3);else out[k]=+out[k].toFixed(4);
    });
    return out;
  }
  function distance(a,b){
    a=normalize(a);b=normalize(b);var sum=0;
    TUNABLE.forEach(function(k){var r=RANGES[k],span=r[1]-r[0];sum+=Math.pow((a[k]-b[k])/span,2);});
    return Math.sqrt(sum/TUNABLE.length);
  }
  function persist(nextPolicy,meta){
    var payload={policy:normalize(nextPolicy),meta:meta||{},baseRevision:revision};
    return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('policy save HTTP '+r.status);return r.json();})
      .then(function(j){if(!j||!j.ok)throw new Error(j&&j.error||'policy save failed');current=normalize(j.policy||payload.policy);revision=j.revision||revision;root.BATTLE_AI_POLICY=j;console.log('[POLICY] persisted revision '+revision);return j;});
  }
  function refresh(){
    return fetch(ENDPOINT+'?ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.ok&&j.policy){current=normalize(j.policy);revision=j.revision||revision;root.BATTLE_AI_POLICY=j;}return {policy:get(),revision:revision};});
  }

  root.BattleAIPolicy={
    defaults:clone(DEFAULTS),ranges:clone(RANGES),tunable:TUNABLE.slice(),normalize:normalize,get:get,set:set,policyFor:policyFor,
    setMatchPolicies:setMatchPolicies,clearMatchPolicies:clearMatchPolicies,mutate:mutate,distance:distance,persist:persist,refresh:refresh,
    get revision(){return revision;}
  };
  console.log('[POLICY] runtime v19 loaded; revision='+revision);
})(typeof window!=='undefined'?window:globalThis);

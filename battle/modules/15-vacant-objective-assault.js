/* Vacant-owned-objective query.
   An objective may remain enemy-owned after its defenders are dead or have left. That is a
   strategic fact the General consumes when it wakes (`objective-vacated`) and when it chooses a
   doctrine action: an empty ownership flag is not a reason to hold or regroup 100 m away unless a
   live enemy is close enough to demand an immediate contact drill. This module never writes squad
   state; the Squad Leader executes whatever mission results. */
(function (root) {
  'use strict';
  if (!root.BattleObjectiveSystem || root.BattleVacantObjectiveAssault) return;
  var IMMEDIATE_THREAT = 48;

  function isVacantEnemyObjective(sim, sq, obj) {
    if (!obj) return false;
    var st = root.BattleObjectiveSystem.status(sim, obj.id) || {},
      owner = st.owner || 'neutral';
    if (owner === 'neutral' || owner === sq.faction) return false;
    if (st.vacantOwner != null) return !!st.vacantOwner;
    var w = st.weights || {},
      ownerWeight = +w[owner] || +st[owner] || 0;
    return ownerWeight <= 0 && st.active == null;
  }
  root.BattleVacantObjectiveAssault = {
    version: '67-vacant-objective-query',
    immediateThreat: IMMEDIATE_THREAT,
    isVacantEnemyObjective: isVacantEnemyObjective
  };
  if (typeof console !== 'undefined')
    console.log('[COMMAND] vacant enemy-owned objectives inform Force Command missions');
})(typeof window !== 'undefined' ? window : globalThis);

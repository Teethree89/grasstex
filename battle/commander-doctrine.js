/* Commander doctrine: Policy Genome v2 access, force accounting and objective selection.

   Split out of commander-ai.js. This file answers "what is worth doing and with what force", using
   only plain scenario/objective data plus the genome. It holds no phase state and issues no orders,
   which makes every function here directly testable and reusable by future unit modules (armor,
   engineers) that need the same strength ratios and objective scores. */
(function (root) {
  'use strict';

  var FALLBACK = {
    cohesionRadius: 34,
    captainlessCohesion: 26,
    regroupHold: 0.4,
    cornerHold: 0.8,
    cornerNoCaptainExtra: 0.35,
    supportDelay: 20,
    sectorNeutralNeed: 75,
    sectorEnemyNeed: 110,
    sectorActiveBonus: 18,
    sectorDistanceWeight: 0.55,
    routeArrivalRadius: 8,
    finalRouteRadius: 14,
    captureCommitRatio: 0.82,
    contactDistance: 28,
    townBoundary: 58,
    engagedRallyAdvance: 0.16,
    pressObjectiveMinDistance: 7,
    pressEnemyClearance: 35,
    scoutLead: 4,
    gunnerTrail: 3,
    decisionSnapshotSeconds: 5
  };
  var FALLBACK_DOCTRINE = {
    reserveFraction: 0.16,
    localSuperiority: 1.15,
    flankPreference: 0.42,
    defenseCommitment: 0.34,
    riskTolerance: 0.56,
    objectiveStrategy: 'balanced'
  };

  function genome(sim, faction) {
    return root.BattleAIPolicy
      ? root.BattleAIPolicy.genomeFor(sim, faction)
      : { version: 2, parameters: FALLBACK, doctrine: FALLBACK_DOCTRINE, rules: [] };
  }
  function policy(sim, faction) {
    var g = genome(sim, faction);
    return g.parameters || FALLBACK;
  }
  function doctrine(sim, faction) {
    var g = genome(sim, faction);
    return g.doctrine || FALLBACK_DOCTRINE;
  }

  function dist(ax, az, bx, bz) {
    return Math.hypot(ax - bx, az - bz);
  }
  function enemyFaction(f) {
    return f === 'us' ? 'ge' : 'us';
  }
  function aliveMembers(sq) {
    return sq.members.filter(function (s) {
      return !s.dead;
    });
  }
  function avgPos(sq) {
    var a = aliveMembers(sq),
      x = 0,
      z = 0;
    if (!a.length) return { x: sq.rally.x, z: sq.rally.z };
    for (var i = 0; i < a.length; i++) {
      x += a[i].root.position.x;
      z += a[i].root.position.z;
    }
    return { x: x / a.length, z: z / a.length };
  }
  function maxSpread(sq, p) {
    var a = aliveMembers(sq),
      m = 0;
    for (var i = 0; i < a.length; i++)
      m = Math.max(m, dist(a[i].root.position.x, a[i].root.position.z, p.x, p.z));
    return m;
  }
  function captain(sq) {
    return root.SquadAI.leaderOf(sq);
  }

  /* Capability-oriented force accounting: modules register units, so nothing here knows about
     concrete unit ids. */
  function forceUnits(sim, faction) {
    if (root.BattleModules)
      return root.BattleModules.unitsFor(sim).filter(function (u) {
        return u && u.faction === faction && !u.dead && u.countsForElimination !== false;
      });
    return (sim._roster[faction] || []).filter(function (u) {
      return !u.dead;
    });
  }
  function forceScore(sim, faction) {
    var units = forceUnits(sim, faction),
      score = 0;
    for (var i = 0; i < units.length; i++) score += units[i].scoreValue == null ? 1 : +units[i].scoreValue;
    return score;
  }
  function nearbyStrength(sim, faction, p, radius) {
    var n = 0,
      all = forceUnits(sim, faction);
    for (var i = 0; i < all.length; i++) {
      var u = all[i];
      if (u.root && dist(p.x, p.z, u.root.position.x, u.root.position.z) <= radius)
        n += u.scoreValue == null ? 1 : +u.scoreValue;
    }
    return n;
  }
  function nearestEnemyToSquad(sim, sq) {
    var p = avgPos(sq),
      enemy = forceUnits(sim, enemyFaction(sq.faction)),
      best = null,
      bd = Infinity;
    for (var i = 0; i < enemy.length; i++) {
      var e = enemy[i],
        d = dist(p.x, p.z, e.root.position.x, e.root.position.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return { unit: best, distance: bd };
  }

  function objectivePoint(instance, sim, sq) {
    if (instance && instance.handler && typeof instance.handler.commandPoint === 'function')
      return instance.handler.commandPoint(instance, sim, sq);
    var d = (instance && instance.def) || {};
    return { x: +d.x || 0, z: +d.z || 0 };
  }
  function objectiveStatus(sim, obj) {
    return root.BattleObjectiveSystem ? root.BattleObjectiveSystem.status(sim, obj.id) : obj.state || {};
  }
  function objectiveValueScore(sim, faction) {
    var total = 0;
    (sim._objectives || []).forEach(function (o) {
      var s = objectiveStatus(sim, o);
      if (s && s.owner === faction) total += +o.def.value || 1;
    });
    return total;
  }
  function ownerPressure(status, faction) {
    if (!status) return 0;
    var enemy = enemyFaction(faction);
    return +(status[enemy] || 0) - +(status[faction] || 0);
  }

  /* Objective saturation.
     Every non-reserve route ends at the same point - the settlement centre - so every squad on a
     side used to score the objectives from the same position and pick the same winner. The central
     strongpoint sits at distance zero and carries the highest value, so it out-scored the next
     objective by ~80 points for all five squads of both sides at once. Both forces piled onto one
     zone, the outer objectives were never assigned to anybody, and a 600 s battle ended with about
     a third of the map still neutral. Force Command decides WHAT, so the deconfliction belongs
     here, in the score, rather than in anything that writes positions.
     A neutral, unoccupied zone only needs one squad to walk onto it; a contested or enemy-held one
     is worth committing a second. Past that, each further squad pays SATURATION_COST, which is
     enough to make the next objective the better answer without ever making an objective
     unchoosable - when there is nothing else left, the crowded one still wins. */
  var SATURATION_COST = 55;
  function saturationAllowance(status, owner) {
    return owner === 'neutral' && !status.active ? 1 : 2;
  }
  function squadsTargeting(sim, sq, id) {
    var squads = (sim && sim.factions && sim.factions[sq.faction] && sim.factions[sq.faction].squads) || [],
      n = 0;
    for (var i = 0; i < squads.length; i++) {
      var other = squads[i];
      if (!other || other === sq || other.state === 'retreat') continue;
      if ((other.aliveCount != null ? +other.aliveCount : aliveMembers(other).length) <= 0) continue;
      if (String(other.targetObjective || '') === String(id)) n++;
    }
    return n;
  }

  function chooseObjective(sim, sq, wantOwned) {
    var objectives = sim._objectives || [],
      p = avgPos(sq),
      cfg = policy(sim, sq.faction),
      doc = doctrine(sim, sq.faction),
      best = null,
      bestScore = -Infinity;
    var ordered = objectives.slice();
    if (doc.objectiveStrategy === 'sequential' && sq.faction === 'ge') ordered.reverse();
    for (var i = 0; i < ordered.length; i++) {
      var obj = ordered[i],
        status = objectiveStatus(sim, obj) || {},
        owner = status.owner || 'neutral',
        point = objectivePoint(obj, sim, sq),
        d = dist(p.x, p.z, point.x, point.z),
        value = +obj.def.value || 1;
      if (wantOwned && owner !== sq.faction) continue;
      if (!wantOwned && owner === sq.faction && doc.defenseCommitment < 0.58) continue;
      var need = owner === sq.faction ? 0 : owner === 'neutral' ? cfg.sectorNeutralNeed : cfg.sectorEnemyNeed,
        active = status.active === sq.faction ? cfg.sectorActiveBonus : 0,
        score = (need + active) * value - d * cfg.sectorDistanceWeight;
      if (doc.objectiveStrategy === 'nearest') score = -d + value * 15;
      else if (doc.objectiveStrategy === 'highest-value') score = value * 150 - d * 0.18;
      else if (doc.objectiveStrategy === 'weakest-pressure')
        score = 90 - ownerPressure(status, sq.faction) * 18 - d * 0.25 + (owner === sq.faction ? -30 : 30);
      else if (doc.objectiveStrategy === 'sequential')
        score = 200 - i * 35 - d * 0.1 + (owner === sq.faction ? -150 : 0);
      if (obj.handler && typeof obj.handler.commandScore === 'function')
        score = obj.handler.commandScore(obj, sim, sq, score, cfg);
      var assigned = squadsTargeting(sim, sq, obj.id),
        crowd = Math.max(0, assigned - (saturationAllowance(status, owner) - 1));
      score -= crowd * SATURATION_COST;
      if (score > bestScore) {
        bestScore = score;
        best = {
          instance: obj,
          point: point,
          status: status,
          score: score,
          assignedSquads: assigned,
          crowdPenalty: crowd * SATURATION_COST
        };
      }
    }
    return best;
  }

  /* Condition booleans the genome's constrained rules are evaluated against, plus the plain
     numbers the telemetry wants. Keeping them in one object is fine; keeping them in one object
     with a typo'd key was the bug this replaced. */
  function buildContext(sim, sq, chosen, enemy, p) {
    var doc = doctrine(sim, sq.faction),
      status = (chosen && chosen.status) || {},
      owner = status.owner || 'neutral';
    var friendly = nearbyStrength(sim, sq.faction, p, 90),
      hostile = nearbyStrength(sim, enemyFaction(sq.faction), p, 90),
      ratio = friendly / Math.max(1, hostile);
    return {
      objectiveNeutral: owner === 'neutral',
      objectiveEnemy: owner === enemyFaction(sq.faction),
      objectiveOwned: owner === sq.faction,
      enemyNear: enemy.distance < policy(sim, sq.faction).contactDistance * 1.4,
      outnumbered: ratio < doc.localSuperiority,
      notOutnumbered: ratio >= doc.localSuperiority,
      captainDead: !captain(sq),
      supportRole: sq.commandRole === 'support' || sq.commandRole === 'reserve',
      insideObjective: !!(
        chosen && dist(p.x, p.z, chosen.point.x, chosen.point.z) < (+chosen.instance.def.radius || 30)
      ),
      underPressure: owner === sq.faction && ownerPressure(status, sq.faction) > 0,
      localRatio: ratio,
      friendlyStrength: friendly,
      enemyStrength: hostile
    };
  }
  function flankPoint(sq, chosen, town) {
    var p = chosen.point,
      c = (town && town.center) || { x: 0, z: 0 },
      vx = p.x - c.x,
      vz = p.z - c.z,
      len = Math.hypot(vx, vz) || 1;
    var side = sq.commandRole === 'left' || String(sq.id).length % 2 === 0 ? -1 : 1,
      off = Math.min(80, Math.max(35, (+chosen.instance.def.radius || 30) * 1.7));
    return { x: p.x + (-vz / len) * off * side, z: p.z + (vx / len) * off * side };
  }

  root.BattleCommanderDoctrine = {
    FALLBACK: FALLBACK,
    FALLBACK_DOCTRINE: FALLBACK_DOCTRINE,
    genomeFor: genome,
    policyFor: policy,
    doctrineFor: doctrine,
    dist: dist,
    enemyFaction: enemyFaction,
    aliveMembers: aliveMembers,
    avgPos: avgPos,
    maxSpread: maxSpread,
    captain: captain,
    forceUnits: forceUnits,
    forceScore: forceScore,
    nearbyStrength: nearbyStrength,
    nearestEnemyToSquad: nearestEnemyToSquad,
    objectivePoint: objectivePoint,
    objectiveStatus: objectiveStatus,
    objectiveValueScore: objectiveValueScore,
    ownerPressure: ownerPressure,
    chooseObjective: chooseObjective,
    buildContext: buildContext,
    flankPoint: flankPoint,
    squadsTargeting: squadsTargeting,
    saturationCost: SATURATION_COST
  };
  console.log('[COMMAND] doctrine + objective scoring loaded');
})(typeof window !== 'undefined' ? window : globalThis);

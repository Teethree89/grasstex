/* Persistent positional tasks. Captain/Squad Command owns the Meso job; this manager alone owns
   its reservation, lifecycle and committed ingress. Navigation supplies geometry/routes,
   Engagement supplies Micro fire control, and Movement Resolver remains the only writer of
   soldier.destination. */
(function (root) {
  'use strict';
  if (!root.BattleModules || !root.BattleNavigation) return;
  var N = root.BattleNavigation,
    MAX_PER_SQUAD = 3,
    CLAIM_RETRY = 2;
  var contexts = new WeakMap(),
    assignments = new WeakMap();
  var POSITION_TASKS = { 'support-by-fire': 1, 'hold-left': 1, 'hold-right': 1, secure: 1, security: 1 };
  function point(p) {
    return p ? { x: +p.x, z: +p.z } : null;
  }
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
  function fresh() {
    return {
      assignmentsCreated: 0,
      assignmentsOccupied: 0,
      assignmentsReleased: 0,
      releaseReasons: {},
      reassignments: 0,
      claimCollisionsPrevented: 0,
      ingressRoutesCreated: 0,
      ingressRoutesInvalidated: 0,
      releasedLifetime: 0,
      assignmentsByRole: {},
      captainWindowAssignments: 0
    };
  }
  function context(sim) {
    var c = contexts.get(sim);
    if (!c) {
      c = { live: new Map(), reservations: new Map(), history: [], serial: 0, revision: 0, stats: fresh() };
      contexts.set(sim, c);
    }
    return c;
  }
  function current(s) {
    var a = s && assignments.get(s);
    return a ? a.task : null;
  }
  function station(s) {
    var t = current(s);
    return t ? t.position : null;
  }
  function eligible(s) {
    return !!(s && !s.dead && s.hp > 0 && !s.incapacitated && (s.role === 'gunner' || s.role === 'rifleman'));
  }
  function job(s) {
    return s._engagementTask || 'support-by-fire';
  }
  function phase(s) {
    return (s.squad && s.squad.commandPhase) || '';
  }
  function commandSignature(sq) {
    var p = (sq && sq.objective) || {},
      r = sq && sq._preparedDefenseRequest;
    return [
      String((sq && sq.commandPhase) || ''),
      String((sq && sq.commandRole) || ''),
      String((sq && sq.targetObjective) || ''),
      Math.round((+p.x || 0) / 4),
      Math.round((+p.z || 0) / 4),
      String((r && r.objectiveId) || '')
    ].join('|');
  }
  function canAssign(s) {
    var sq = s && s.squad;
    return (
      eligible(s) &&
      sq &&
      sq.state !== 'retreat' &&
      phase(s) !== 'retreat' &&
      phase(s) !== 'regroup' &&
      POSITION_TASKS[job(s)] &&
      (sq.state === 'engaged' || ['capture', 'defend', 'hold', 'support-hold'].indexOf(phase(s)) >= 0)
    );
  }
  function emit(sim, type, t, extra) {
    if (root.BattleTelemetry)
      root.BattleTelemetry.record(
        'position-' + type,
        Object.assign(
          {
            assignment: t.id,
            soldier: t.assignee,
            faction: t.faction,
            role: t.role,
            station: t.station,
            building: t.building,
            status: t.status
          },
          extra || {}
        ),
        sim
      );
  }
  function snapshot(t) {
    return JSON.parse(JSON.stringify(t));
  }
  function release(s, sim, reason) {
    var a = s && assignments.get(s);
    if (!a) return false;
    sim = a.sim;
    var c = context(sim),
      t = a.task;
    reason = reason || 'explicit-task-change';
    t.status = 'released';
    t.releasedAt = sim.time;
    t.releaseReason = reason;
    t.lifetime = Math.max(0, sim.time - t.assignedAt);
    c.revision++;
    c.reservations.delete(t.station);
    c.live.delete(s);
    assignments.delete(s);
    c.stats.assignmentsReleased++;
    c.stats.releaseReasons[reason] = (c.stats.releaseReasons[reason] || 0) + 1;
    c.stats.releasedLifetime += t.lifetime;
    c.history.push(snapshot(t));
    if (c.history.length > 80) c.history.shift();
    s._nextStationClaimAt = sim.time + CLAIM_RETRY;
    s._navCache = null;
    s._physicalPath = null;
    s._faceHint = null;
    s.setUp = false;
    if (s._movementResolver) s._movementResolver.combat = null;
    if (s.eng && s.eng.state === 'station') {
      s.eng.state = 'advance';
      s.eng.cover = null;
      s.eng.setUpSince = 0;
    }
    emit(sim, 'released', t, { reason: reason, lifetime: t.lifetime });
    return true;
  }
  function invalidReason(s, sim, t) {
    if (s.dead || s.hp <= 0) return 'death';
    if (s.incapacitated) return 'incapacitated';
    var sq = s.squad;
    if (!sq) return 'squad-removed';
    if (sq.state === 'retreat' || phase(s) === 'retreat') return 'retreat';
    if (phase(s) === 'regroup') return 'regroup';
    if (sim.winner || sim.manualEnded) return 'engagement-ended';
    if (N.version !== t.geometryVersion) return 'station-invalid';
    /* M3C boundary: target/contact state and engagement-plan serials are Micro state. A Captain-owned
     positional order survives target loss, plan quiet/closure and target reacquisition. Only a
     materially different Meso command invalidates the assignment. */
    if (commandSignature(sq) !== t.commandSignature) return 'explicit-task-change';
    return null;
  }
  function update(s, sim) {
    var a = s && assignments.get(s);
    if (!a) return null;
    var t = a.task,
      reason = invalidReason(s, sim, t);
    if (reason) {
      if (reason === 'station-invalid') context(sim).stats.ingressRoutesInvalidated++;
      release(s, sim, reason);
      return null;
    }
    /* Genuinely unable to reach the station after graduated recovery: release so the position can
     be reassigned. Temporarily delayed soldiers never set this flag, so their assignments stay. */
    if (s._movementGoalUnreachable) {
      s._movementGoalUnreachable = false;
      release(s, sim, 'station-unreachable');
      return null;
    }
    var R = root.BattleTacticalRoute;
    if (t.route && R && t.route.version !== R.ingressVersion(sim)) {
      context(sim).stats.ingressRoutesInvalidated++;
      t.route = R.createIngress(s, sim, t.position, t.threatSector);
      if (!t.route) {
        release(s, sim, 'station-unreachable');
        return null;
      }
      context(sim).stats.ingressRoutesCreated++;
      emit(sim, 'ingress', t, { door: t.route.door, reason: 'geometry-changed' });
    }
    var ingressDist = distance(s.root.position, t.position);
    if (t.lastIngressDist == null || ingressDist < t.lastIngressDist - 0.2) {
      t.lastIngressDist = ingressDist;
      t.lastIngressAt = sim.time;
    }
    t.ingressStallFor = Math.max(0, sim.time - (t.lastIngressAt != null ? t.lastIngressAt : t.assignedAt));
    if (ingressDist <= 0.35) {
      if (t.occupiedAt == null) {
        t.occupiedAt = sim.time;
        t.status = 'occupying';
        context(sim).stats.assignmentsOccupied++;
        emit(sim, 'occupied', t);
      } else t.status = 'holding';
      if (root.BattleMovementProgress) root.BattleMovementProgress.clearFailuresNear(s, sim, t.position);
    }
    return t;
  }
  function claim(s, sim, st, threat) {
    if (!canAssign(s) || !st || !threat) return null;
    var existing = current(s);
    if (existing) return existing;
    // Use the canonical geometry, so callers cannot invent a second identity for a physical port.
    st = N.firingStations.find(function (p) {
      return p.id === st.id;
    });
    if (!st) return null;
    var c = context(sim),
      owner = c.reservations.get(st.id);
    if (owner) {
      c.stats.claimCollisionsPrevented++;
      return null;
    }
    var sq = s.squad,
      t = {
        id: ++c.serial,
        task: job(s),
        positionType: 'window',
        building: st.building,
        station: st.id,
        position: st,
        assignee: s.id,
        faction: s.faction,
        role: s.role,
        squad: sq.id,
        status: 'assigned',
        threatSector: point(threat),
        assignedAt: sim.time,
        occupiedAt: null,
        commandPhase: phase(s),
        objective: String(sq.targetObjective || ''),
        commandSignature: commandSignature(sq),
        geometryVersion: N.version,
        route: null
      };
    c.revision++;
    c.reservations.set(st.id, s);
    c.live.set(s, t);
    assignments.set(s, { sim: sim, task: t });
    c.stats.assignmentsCreated++;
    if (s._positionAssignments) c.stats.reassignments++;
    s._positionAssignments = (s._positionAssignments || 0) + 1;
    c.stats.assignmentsByRole[s.role] = (c.stats.assignmentsByRole[s.role] || 0) + 1;
    if (s.role === 'captain') c.stats.captainWindowAssignments++;
    s._navCache = null;
    s._physicalPath = null;
    s._nextStationClaimAt = 0;
    if (s._movementResolver) s._movementResolver.combat = null;
    if (s.eng) {
      s.eng.cover = null;
      s.eng.boundOrder = false;
      s.eng.suppressOrder = false;
    }
    if (root.BattleTacticalRoute) root.BattleTacticalRoute.cancel(s, sim);
    emit(sim, 'assigned', t);
    var R = root.BattleTacticalRoute;
    t.route = R && R.createIngress ? R.createIngress(s, sim, st, threat) : null;
    if (!t.route) {
      c.stats.ingressRoutesInvalidated++;
      release(s, sim, 'station-unreachable');
      return null;
    }
    c.stats.ingressRoutesCreated++;
    t.status = 'ingress';
    emit(sim, 'ingress', t, { door: t.route.door });
    return t;
  }
  function select(s, sim, threat) {
    var c = context(sim),
      here = s.root.position,
      range = s.role === 'gunner' ? 78 : 62;
    var candidates = N.firingStations.filter(function (st) {
      if (distance(here, st) > range) return false;
      var dx = threat.x - st.windowX,
        dz = threat.z - st.windowZ,
        len = Math.hypot(dx, dz) || 1;
      if ((dx * st.normalX + dz * st.normalZ) / len < 0.32) return false;
      if (c.reservations.has(st.id)) {
        c.stats.claimCollisionsPrevented++;
        return false;
      }
      return !N.lineOfSightBlocked(st, threat, 1.08, 1.45);
    });
    // Cheap shortlist first; only a bounded number of committed ingress searches per commander tick.
    candidates.sort(function (a, b) {
      return distance(here, a) - distance(here, b);
    });
    for (var i = 0; i < Math.min(2, candidates.length); i++) {
      var t = claim(s, sim, candidates[i], threat);
      if (t) return t;
    }
    return null;
  }
  function maintain(sim) {
    context(sim).live.forEach(function (t, s) {
      update(s, sim);
    });
  }
  function assign(sim) {
    maintain(sim);
    ['us', 'ge'].forEach(function (f) {
      (sim.factions[f].squads || []).forEach(function (sq) {
        var count = sq.members.filter(function (s) {
          return !!current(s);
        }).length;
        if (count >= MAX_PER_SQUAD) return;
        var members = sq.members.slice().sort(function (a, b) {
          return (a.role === 'gunner' ? 0 : 1) - (b.role === 'gunner' ? 0 : 1);
        });
        for (var i = 0; i < members.length; i++) {
          var s = members[i];
          if (!canAssign(s) || current(s) || s._nextStationClaimAt > sim.time) continue;
          var R = root.BattleTacticalRoute,
            threat = R && R.knownThreat(s, sim);
          if (!threat) continue;
          var t = select(s, sim, threat);
          if (!t) s._nextStationClaimAt = sim.time + CLAIM_RETRY;
          // Amortize even failed route searches, not just successful claims.
          break;
        }
      });
    });
    publish(sim);
  }
  function waypoint(s, sim) {
    var t = update(s, sim);
    if (!t) return null;
    var r = t.route,
      here = s.root.position;
    while (
      r.index < r.steps.length - 1 &&
      distance(here, r.steps[r.index]) <= 0.85 &&
      N.movementClear(here, r.steps[r.index + 1])
    )
      r.index++;
    return {
      point: point(r.steps[r.index]),
      reason: 'position-ingress',
      intent: point(t.position),
      step: r.index,
      total: r.steps.length
    };
  }
  function summary(sim) {
    var c = context(sim),
      out = Object.assign({}, c.stats),
      live = [],
      lifetime = c.stats.releasedLifetime;
    c.live.forEach(function (t) {
      live.push(snapshot(t));
      lifetime += Math.max(0, sim.time - t.assignedAt);
    });
    out.averageAssignmentLifetime = c.stats.assignmentsCreated ? lifetime / c.stats.assignmentsCreated : 0;
    out.averageReleasedLifetime = c.stats.assignmentsReleased
      ? c.stats.releasedLifetime / c.stats.assignmentsReleased
      : 0;
    out.currentLiveAssignments = live.length;
    out.live = live;
    out.recentReleases = c.history;
    return snapshot(out);
  }
  function publish(sim) {
    sim._tacticalPositionSummary = summary(sim);
    if (sim._coordinationHealth) sim._coordinationHealth.tacticalPositions = sim._tacticalPositionSummary;
  }
  function reset(sim) {
    var c = context(sim);
    c.live.forEach(function (t, s) {
      release(s, sim, 'battle-reset');
    });
    contexts.delete(sim);
    (sim._roster.us || []).concat(sim._roster.ge || []).forEach(function (s) {
      s._positionAssignments = 0;
      s._nextStationClaimAt = 0;
    });
    publish(sim);
  }
  root.BattleTacticalPositions = {
    version: '1.1-m3c-captain-owned',
    revision: function (sim) {
      return context(sim).revision;
    },
    current: current,
    station: station,
    eligible: eligible,
    claim: claim,
    release: release,
    update: update,
    waypoint: waypoint,
    assign: assign,
    summary: summary
  };
  root.BattleModules.registerSystem('building-hardpoints', {
    version: '48-m3c-captain-owned-posts',
    onBattleStart: reset,
    onBattleRestart: reset,
    beforeBattleRestart: reset,
    onCommanderTick: assign,
    onSimulationStep: maintain
  });
})(typeof window !== 'undefined' ? window : globalThis);

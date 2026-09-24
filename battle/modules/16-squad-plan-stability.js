/* M3C meso-level squad-command owner.
   The General's mission brief (`_macroMission`) says what the squad must achieve; this module is
   the Captain layer that executes it. It is the only runtime writer of the squad's commandPhase,
   objective point, route legs and routeIndex, and it owns:

     - mission execution: route legs, corner pauses, objective phase, doctrine holds,
     - one tactical command lease (`_engagementPlan`),
     - one cohesion/regroup state,
     - one set of committed fireteam slots,
     - fire and movement: whether the squad may assault and which fireteam bounds.

   It never selects an objective. When a doctrine hold/support/regroup commitment ends it escalates to
   the General through `_macroMissionRequest`.

   It does NOT choose soldier cover, stance, physical paths or soldier.destination. Those are micro
   responsibilities. Contact may change micro combat behaviour without silently rewriting the meso
   formation plan. */
(function (root) {
  'use strict';
  if (!root.BattleModules || !root.SquadAI || root.BattleSquadStability) return;

  var ASSAULT_LEASE = 26,
    DEFENSE_LEASE = 38,
    QUIET_CLOSE = 9,
    TEAM_LEASE = 12;
  var REGROUP_ENTER = 1.35,
    REGROUP_RELEASE = 0.78,
    REGROUP_MIN = 2.4,
    REGROUP_MAX = 18,
    REGROUP_BYPASS = 14,
    REENTRY = 4;
  var STRAGGLER_BYPASS = 2.8,
    URBAN_ARRIVAL_COHESION = 0.5;
  var BOUND_CYCLE = 9.0,
    BOUND_DURATION = 3.6,
    BOUND_TEAMS = ['alpha', 'bravo', 'charlie'],
    ASSAULT_PHASES = { assault: 1, capture: 1, 'clear-town': 1 };
  var ORDER_STRIDE = 13,
    ORDER_ARRIVAL_RADIUS = 8,
    ORDER_COHESION = 0.55,
    ORDER_PUBLISH_EPS = 0.05;
  var TACTICAL = {
    assault: 1,
    flank: 1,
    capture: 1,
    defend: 1,
    hold: 1,
    'support-hold': 1,
    'clear-town': 1
  };
  var DEFENSIVE = { capture: 1, defend: 1, hold: 1, 'support-hold': 1 };
  var EMERGENCY = { retreat: 1, regroup: 1 };

  function point(p) {
    return p && isFinite(+p.x) && isFinite(+p.z) ? { x: +p.x, z: +p.z } : null;
  }
  function copy(p) {
    return p ? { x: +p.x || 0, z: +p.z || 0 } : null;
  }
  function dist(a, b) {
    return a && b ? Math.hypot((+a.x || 0) - (+b.x || 0), (+a.z || 0) - (+b.z || 0)) : Infinity;
  }
  function telemetry(sim, type, data) {
    if (root.BattleTelemetry) root.BattleTelemetry.record(type, data, sim);
  }
  function leaseSeconds(phase) {
    return DEFENSIVE[phase] ? DEFENSE_LEASE : ASSAULT_LEASE;
  }
  function signature(sq) {
    var p = (sq && sq.objective) || {};
    return [
      String((sq && sq.commandPhase) || ''),
      String((sq && sq.targetObjective) || ''),
      Math.round((+p.x || 0) / 4),
      Math.round((+p.z || 0) / 4)
    ].join('|');
  }
  function captainAlive(sq) {
    var a = (sq && sq.members) || [];
    for (var i = 0; i < a.length; i++) if (a[i] && !a[i].dead && a[i].role === 'captain') return true;
    return false;
  }
  function alive(sq) {
    return ((sq && sq.members) || []).filter(function (s) {
      return s && !s.dead && s.root && s.root.position;
    });
  }
  function average(sq) {
    var a = alive(sq),
      x = 0,
      z = 0;
    if (!a.length) return null;
    for (var i = 0; i < a.length; i++) {
      x += +a[i].root.position.x || 0;
      z += +a[i].root.position.z || 0;
    }
    return { x: x / a.length, z: z / a.length };
  }
  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) {
        return x - y;
      }),
      m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) * 0.5;
  }
  function cfg(sim, sq) {
    try {
      return root.BattleCommanderDoctrine.policyFor(sim, sq.faction) || {};
    } catch (_) {
      return {};
    }
  }
  /* Battle setup (route assignment, garrison placement) states the starting phase through here, so the
   Captain stays the only writer of commandPhase. No telemetry: nothing has been decided yet. */
  function initialPhase(sq, phase) {
    if (sq) sq.commandPhase = phase;
  }
  function setPhase(sim, sq, next, why) {
    if (!sq || sq.commandPhase === next) return;
    sq.commandPhase = next;
    telemetry(sim, 'decision-phase', { faction: sq.faction, squad: sq.id, phase: next, why: why || '' });
  }
  function commandForward(sq) {
    var a = sq.orderAnchor || sq.rally || { x: 0, z: 0 },
      g = sq.objective || sq.home || a,
      dx = (+g.x || 0) - (+a.x || 0),
      dz = (+g.z || 0) - (+a.z || 0),
      l = Math.hypot(dx, dz);
    if (l < 0.1 && sq._formationForward) {
      var f = sq._formationForward,
        fl = Math.hypot(+f.x || 0, +f.z || 0) || 1;
      return { x: (+f.x || 0) / fl, z: (+f.z || 0) / fl };
    }
    return { x: dx / (l || 1), z: dz / (l || 1) };
  }
  function publishStats(battle) {
    return (
      battle._squadCommandPublishStats ||
      (battle._squadCommandPublishStats = { intentChecks: 0, intentPublishes: 0, intentCoalesced: 0 })
    );
  }

  function tasksFor(phase) {
    if (phase === 'defend' || phase === 'hold')
      return { command: 'control', alpha: 'hold-left', bravo: 'hold-right', charlie: 'local-reserve' };
    if (phase === 'flank')
      return { command: 'control', alpha: 'support-by-fire', bravo: 'flank', charlie: 'follow-assault' };
    if (phase === 'capture' || phase === 'clear-town')
      return { command: 'control', alpha: 'support-by-fire', bravo: 'clear/maneuver', charlie: 'secure' };
    if (phase === 'support-hold')
      return { command: 'control', alpha: 'support-by-fire', bravo: 'support-by-fire', charlie: 'security' };
    return { command: 'control', alpha: 'support-by-fire', bravo: 'maneuver', charlie: 'assault/reserve' };
  }
  function teamKeyFor(s) {
    var i = +s.slotIndex || 0;
    if (i <= 1) return 'command';
    if (i === 2 || i === 4 || i === 5) return 'alpha';
    if (i === 3 || i === 6 || i === 7) return 'bravo';
    return 'charlie';
  }
  function syncTasks(sq, plan) {
    var tasks = (plan && plan.tasks) || null,
      a = (sq && sq.members) || [];
    for (var i = 0; i < a.length; i++) {
      var s = a[i],
        key = s._fireteamKey || teamKeyFor(s);
      s._engagementTask = tasks && key ? tasks[key] || null : null;
      s._engagementPlanSerial = plan ? plan.serial : null;
    }
    sq._engagementTasks = tasks ? JSON.parse(JSON.stringify(tasks)) : null;
  }
  function planSnapshot(p) {
    return p
      ? {
          serial: p.serial,
          status: p.status,
          phase: p.phase,
          targetObjective: p.targetObjective,
          objective: copy(p.objective),
          createdAt: p.createdAt,
          activatedAt: p.activatedAt,
          lastContactAt: p.lastContactAt,
          quietSince: p.quietSince,
          until: p.until,
          tasks: p.tasks
        }
      : null;
  }
  function closePlan(sim, sq, reason) {
    var p = sq && sq._engagementPlan;
    if (!p) return false;
    sq._lastEngagementPlan = planSnapshot(p);
    sq._lastEngagementPlan.closedAt = sim.time;
    sq._lastEngagementPlan.closeReason = reason || 'closed';
    sq._engagementPlan = null;
    sq._stablePlan = null;
    syncTasks(sq, null);
    return true;
  }
  function stagePlan(sim, sq) {
    var phase = String(sq.commandPhase || '');
    if (!TACTICAL[phase] || sq.state === 'retreat' || EMERGENCY[phase]) return null;
    var serial = (+sq._engagementPlanSerial || 0) + 1,
      p = {
        serial: serial,
        status: sq.inContact ? 'active' : 'staged',
        phase: phase,
        targetObjective: sq.targetObjective || null,
        objective: copy(sq.objective),
        missionVersion: missionVersion(sq),
        signature: signature(sq),
        createdAt: sim.time,
        activatedAt: sq.inContact ? sim.time : null,
        lastContactAt: sq.inContact ? sim.time : null,
        quietSince: null,
        until: sim.time + leaseSeconds(phase),
        tasks: tasksFor(phase)
      };
    sq._engagementPlanSerial = serial;
    sq._engagementPlan = p;
    sq._stablePlan = p;
    syncTasks(sq, p);
    telemetry(sim, 'decision-plan-commit', {
      faction: sq.faction,
      squad: sq.id,
      serial: serial,
      phase: phase,
      targetObjective: p.targetObjective,
      seconds: leaseSeconds(phase)
    });
    return p;
  }
  function missionVersion(sq) {
    return sq && sq._macroMission ? +sq._macroMission.version || 0 : 0;
  }
  /* A doctrine hold/support/regroup is a bounded commitment, not a new objective. When the Captain's
   plan for it ends (lease or contact closes) the Captain reports back once instead of the General
   re-evaluating doctrine on a timer. */
  var REVIEW_ACTIONS = { hold: 1, support: 1, regroup: 1 };
  function requestReview(sim, sq, why) {
    var m = sq && sq._macroMission;
    if (!m || !REVIEW_ACTIONS[m.action]) return;
    var r = sq._macroMissionRequest;
    if (r && r.missionVersion === m.version) return;
    sq._macroMissionRequest = {
      missionVersion: m.version,
      reason: 'doctrine-review',
      why: why,
      at: sim.time
    };
    telemetry(sim, 'decision-captain-request', {
      faction: sq.faction,
      squad: sq.id,
      version: m.version,
      reason: 'doctrine-review',
      why: why
    });
  }
  function updatePlan(sim, sq) {
    var p = sq._engagementPlan,
      phase = String(sq.commandPhase || ''),
      sig = signature(sq);
    if (sq.state === 'retreat' || phase === 'retreat') {
      closePlan(sim, sq, 'retreat');
      sq._planDormantSignature = null;
      return;
    }
    if (sq._planDormantSignature && sq._planDormantSignature !== sig) sq._planDormantSignature = null;
    if (p) {
      if (sq.inContact) {
        sq._planDormantSignature = null;
        if (p.status !== 'active' && p.activatedAt == null) p.activatedAt = sim.time;
        p.status = 'active';
        p.lastContactAt = sim.time;
        p.quietSince = null;
        sq._regroupBypassUntil = Math.max(+sq._regroupBypassUntil || 0, sim.time + 1.25);
      } else if (p.status === 'active' || p.status === 'quiet') {
        if (p.quietSince == null) p.quietSince = sim.time;
        p.status = 'quiet';
        if (sim.time - p.quietSince >= QUIET_CLOSE) {
          sq._planDormantSignature = p.signature;
          closePlan(sim, sq, 'contact clear');
          requestReview(sim, sq, 'contact clear');
          p = null;
        } else sq._regroupBypassUntil = Math.max(+sq._regroupBypassUntil || 0, sim.time + 1.25);
      }
      if (p && p.status === 'staged' && sig !== p.signature) {
        closePlan(sim, sq, 'intent replaced');
        p = null;
      }
      if (p && p.status === 'staged' && sim.time >= p.until) {
        closePlan(sim, sq, 'lease expired');
        requestReview(sim, sq, 'lease expired');
        p = null;
      }
    }
    if (
      !sq._engagementPlan &&
      TACTICAL[phase] &&
      !EMERGENCY[phase] &&
      (sq.inContact || sq._planDormantSignature !== sig)
    )
      stagePlan(sim, sq);
    else if (sq._engagementPlan) {
      sq._stablePlan = sq._engagementPlan;
      syncTasks(sq, sq._engagementPlan);
    }
  }

  /* Cohesion is directional. A lagging man may be temporarily excluded so nine men do not march
   backwards to fetch one casualty-delayed rifleman. A man who ran AHEAD is never an ignorable
   straggler: he expands the core, forcing the Captain to restore cohesion instead of allowing two
   scouts to sprint into the next fight alone. Lateral outliers are also non-trimmable. */
  function cohesionAssessment(sq, limit) {
    var m = alive(sq),
      n = m.length;
    if (!n)
      return {
        center: copy(sq.rally) || { x: 0, z: 0 },
        rawSpread: 0,
        coreSpread: 0,
        stragglers: [],
        outrunners: [],
        members: [],
        dispersed: false,
        allowed: 0
      };
    var xs = [],
      zs = [],
      i;
    for (i = 0; i < n; i++) {
      xs.push(+m[i].root.position.x || 0);
      zs.push(+m[i].root.position.z || 0);
    }
    var med = { x: median(xs), z: median(zs) },
      allowed = n >= 9 ? 2 : n >= 5 ? 1 : 0,
      far = [],
      lagging = [],
      blocking = [],
      f = commandForward(sq);
    for (i = 0; i < n; i++) {
      var p = m[i].root.position,
        d = dist(p, med);
      if (d <= limit) continue;
      var along = ((+p.x || 0) - med.x) * f.x + ((+p.z || 0) - med.z) * f.z,
        row = { s: m[i], d: d, along: along };
      far.push(row);
      if (along < -Math.max(2, limit * 0.1)) lagging.push(row);
      else blocking.push(row);
    }
    lagging.sort(function (a, b) {
      return b.d - a.d;
    });
    var trim = lagging.slice(0, Math.min(allowed, lagging.length)),
      ids = {};
    for (i = 0; i < trim.length; i++) ids[String(trim[i].s.id)] = 1;
    var core = m.filter(function (s) {
        return !ids[String(s.id)];
      }),
      cx = 0,
      cz = 0;
    for (i = 0; i < core.length; i++) {
      cx += +core[i].root.position.x || 0;
      cz += +core[i].root.position.z || 0;
    }
    var center = { x: cx / Math.max(1, core.length), z: cz / Math.max(1, core.length) },
      coreSpread = 0;
    for (i = 0; i < core.length; i++) coreSpread = Math.max(coreSpread, dist(core[i].root.position, center));
    var all = {
        x:
          xs.reduce(function (a, b) {
            return a + b;
          }, 0) / n,
        z:
          zs.reduce(function (a, b) {
            return a + b;
          }, 0) / n
      },
      raw = 0;
    for (i = 0; i < n; i++) raw = Math.max(raw, dist(m[i].root.position, all));
    return {
      center: center,
      rawSpread: raw,
      coreSpread: coreSpread,
      stragglers: trim.map(function (x) {
        return String(x.s.id);
      }),
      outrunners: blocking.map(function (x) {
        return String(x.s.id);
      }),
      members: trim.map(function (x) {
        return x.s;
      }),
      dispersed: blocking.length > 0 || lagging.length > allowed || coreSpread > limit,
      allowed: allowed
    };
  }
  function cohesionState(sq) {
    return (
      sq._regroupHysteresis ||
      (sq._regroupHysteresis = {
        overSince: null,
        accepted: false,
        enteredAt: 0,
        cooldownUntil: 0,
        anchor: null,
        lastForward: null,
        entries: 0,
        exits: 0,
        suppressed: 0,
        stragglerSuppressions: 0,
        regroupRequests: 0
      })
    );
  }
  function markCatchup(ca, t) {
    for (var i = 0; i < ca.members.length; i++) {
      var s = ca.members[i];
      s._cohesionCatchupUntil = t + 4;
      s._destinationCommitUntil = 0;
    }
  }
  function updateCohesion(sim, sq) {
    if (!sq || sq.state === 'retreat') return;
    var c = cfg(sim, sq),
      limit = +(captainAlive(sq) ? c.cohesionRadius : c.captainlessCohesion) || 34,
      release = limit * REGROUP_RELEASE,
      st = cohesionState(sq),
      t = sim.time,
      ca = cohesionAssessment(sq, limit);
    sq._cohesionAssessment = {
      rawSpread: +ca.rawSpread.toFixed(3),
      coreSpread: +ca.coreSpread.toFixed(3),
      stragglers: ca.stragglers.slice(),
      outrunners: ca.outrunners.slice(),
      allowed: ca.allowed,
      dispersed: ca.dispersed
    };
    var p = sq._engagementPlan,
      combatPlan = p && (p.status === 'active' || p.status === 'quiet');
    if (sq.inContact || combatPlan) {
      st.overSince = null;
      if (st.accepted) {
        st.accepted = false;
        st.exits++;
        st.cooldownUntil = t + REENTRY;
      }
      sq._regroupBypassUntil = Math.max(+sq._regroupBypassUntil || 0, t + 1.25);
      return;
    }
    /* Release hands the squad straight back to mission execution in the same Captain tick. */
    if (st.accepted) {
      var age = t - st.enteredAt;
      if ((age >= REGROUP_MIN && ca.coreSpread <= release) || age >= REGROUP_MAX) {
        st.accepted = false;
        st.exits++;
        st.cooldownUntil = t + REENTRY;
        sq._regroupBypassUntil = Math.max(
          +sq._regroupBypassUntil || 0,
          t + (age >= REGROUP_MAX ? REGROUP_BYPASS : REENTRY)
        );
        sq.commandHoldUntil = 0;
        return;
      }
      sq.commandPhase = 'regroup';
      sq.objective = copy(st.anchor || ca.center);
      return;
    }
    /* The Captain, not the General, decides a squad is too scattered to keep executing. */
    var requested = !sq.inContact && t >= (+sq._regroupBypassUntil || 0) && ca.rawSpread > limit;
    if (!requested) {
      st.overSince = null;
      return;
    }
    st.regroupRequests++;
    if (!ca.dispersed && ca.stragglers.length) {
      markCatchup(ca, t);
      st.stragglerSuppressions++;
      st.suppressed++;
      sq._regroupBypassUntil = t + STRAGGLER_BYPASS;
      return;
    }
    if (!ca.dispersed) {
      st.suppressed++;
      return;
    }
    if (st.overSince == null) st.overSince = t;
    if (t < st.cooldownUntil || t - st.overSince < REGROUP_ENTER) {
      st.suppressed++;
      return;
    }
    st.accepted = true;
    st.enteredAt = t;
    st.anchor = copy(ca.center);
    st.entries++;
    sq._regroupRecovery = {
      serial: (+sq._regroupRecoverySerial || 0) + 1,
      startedAt: t,
      anchor: copy(st.anchor)
    };
    sq._regroupRecoverySerial = sq._regroupRecovery.serial;
    sq.objective = copy(st.anchor);
    sq.commandPhase = 'regroup';
    telemetry(sim, 'decision-regroup-commit', {
      faction: sq.faction,
      squad: sq.id,
      serial: sq._regroupRecovery.serial,
      anchor: copy(st.anchor)
    });
  }

  function aliveTeam(sq, key) {
    return (sq.members || [])
      .filter(function (s) {
        return !s.dead && teamKeyFor(s) === key;
      })
      .sort(function (a, b) {
        return (+a.slotIndex || 0) - (+b.slotIndex || 0);
      });
  }
  function desiredAnchor(sq, m) {
    var x = 0,
      z = 0,
      n = 0;
    for (var i = 0; i < m.length; i++) {
      var p = root.SquadAI.formationSlot(sq, m[i], m[i].slotIndex);
      if (p) {
        x += p.x;
        z += p.z;
        n++;
      }
    }
    return n ? { x: x / n, z: z / n } : null;
  }
  function averageMembers(m) {
    var x = 0,
      z = 0,
      n = 0;
    for (var i = 0; i < m.length; i++)
      if (m[i].root) {
        x += +m[i].root.position.x || 0;
        z += +m[i].root.position.z || 0;
        n++;
      }
    return n ? { x: x / n, z: z / n } : null;
  }
  function forward(sq) {
    return commandForward(sq);
  }
  function teamSlot(sq, key, s, index, count, a, frame) {
    var f = frame || forward(sq),
      r = { x: -f.z, z: f.x },
      lat = 0,
      fw = 0;
    if (count === 2) {
      lat = index ? -1.45 : 1.45;
      fw = index ? -0.45 : 0.45;
    } else if (count >= 3) {
      if (index === 0) fw = 1.15;
      else if (index === 1) {
        lat = -1.7;
        fw = -0.85;
      } else {
        lat = 1.7;
        fw = -0.85;
      }
    }
    if (key === 'command' && s.role === 'captain') {
      lat = 0;
      fw = 0.5;
    }
    return { x: a.x + r.x * lat + f.x * fw, z: a.z + r.z * lat + f.z * fw };
  }
  /* A defensive post belongs to the Captain's command intent, not to a contact serial. Once a man has
   settled into his post, target acquisition/loss must not throw him back into formation and then
   recreate the same post a second later. It is released only when the defensive command signature
   materially changes. */
  function holdPost(s, key) {
    var p = s._defensePost;
    if (p && p.commandKey === key) return p;
    if (!s.orderDestination || dist(s.root.position, s.orderDestination) > 2.6) return null;
    s._defensePost = { x: s.root.position.x, z: s.root.position.z, commandKey: key };
    return s._defensePost;
  }
  /* Fireteam commitment is a meso command signature. Its anchor AND formation frame are committed:
   live command-ray jitter must not rotate individual slots underneath a still-valid Captain order.
   Engagement-plan serials are micro/contact state and deliberately do not belong here. */
  function fireteamSignature(sq) {
    var p = sq.objective || {};
    return [
      sq.commandPhase || '',
      sq.targetObjective || '',
      Math.round((+p.x || 0) / 4),
      Math.round((+p.z || 0) / 4),
      (sq._regroupRecovery && sq._regroupRecovery.serial) || 0
    ].join('|');
  }
  function orderCanAdvance(sq) {
    var living = alive(sq),
      arrived = 0;
    if (!living.length) return true;
    for (var i = 0; i < living.length; i++) {
      var s = living[i];
      if (s.orderDestination && dist(s.root.position, s.orderDestination) <= ORDER_ARRIVAL_RADIUS) arrived++;
    }
    return arrived / living.length >= ORDER_COHESION;
  }
  /* The legacy SquadAI issueOrders() both advanced the Captain's anchor AND published an individual
   formation point for every soldier every squad tick. M3C keeps the useful anchor cadence here and
   deletes that redundant individual producer entirely: only committed fireteam slots publish Meso
   locomotion. */
  function advanceSquadAnchor(sq, battle) {
    var anchor = sq.orderAnchor || (sq.orderAnchor = { x: sq.rally.x, z: sq.rally.z }),
      goal = sq.state === 'retreat' ? sq.home : sq.objective || sq.home,
      goalChanged = !sq._orderGoal || dist(goal, sq._orderGoal) > 3;
    var form = root.SquadAI.formationFor(sq),
      formChanged = form !== sq.formation,
      phase = sq.commandPhase || '',
      hold = ['regroup', 'support-hold', 'hold', 'reserve', 'defend', 'corner-check'].indexOf(phase) >= 0,
      force = false;
    if (goalChanged) {
      sq._orderGoal = copy(goal);
      force = true;
    }
    if (formChanged) {
      sq.formation = form;
      force = true;
    }
    var bounding = battle.time < (sq._boundUntil || 0),
      held = !!sq.inContact && !bounding,
      dx = goal.x - anchor.x,
      dz = goal.z - anchor.z,
      len = Math.hypot(dx, dz),
      mayAdvance = !hold && !held && (sq.state === 'advance' || sq.state === 'engaged');
    if ((force || orderCanAdvance(sq)) && mayAdvance && len > 2) {
      var stride = bounding
        ? ORDER_STRIDE * 0.5
        : sq.state === 'engaged'
          ? ORDER_STRIDE * 0.62
          : ORDER_STRIDE;
      anchor.x += (dx / len) * Math.min(stride, len);
      anchor.z += (dz / len) * Math.min(stride, len);
      sq._orderVersion = (+sq._orderVersion || 0) + 1;
    } else if (sq.state === 'retreat' && len > 2) {
      anchor.x += (dx / len) * Math.min(ORDER_STRIDE, len);
      anchor.z += (dz / len) * Math.min(ORDER_STRIDE, len);
      sq._orderVersion = (+sq._orderVersion || 0) + 1;
    }
    sq.rally = { x: anchor.x, z: anchor.z };
  }
  function updateFireteams(sq, battle) {
    sq._fireteamOrders = sq._fireteamOrders || {};
    var defensive = !!DEFENSIVE[sq.commandPhase],
      defenseKey = signature(sq),
      regroup = sq.commandPhase === 'regroup' && sq.state !== 'retreat',
      stats = publishStats(battle);
    ['command', 'alpha', 'bravo', 'charlie'].forEach(function (key) {
      var m = aliveTeam(sq, key);
      if (!m.length) return;
      var desired = desiredAnchor(sq, m);
      if (!desired) return;
      var live = averageMembers(m),
        sig = fireteamSignature(sq),
        cur = sq._fireteamOrders[key],
        urgent = sq.state === 'retreat';
      if (!cur || urgent || cur.signature !== sig)
        cur = sq._fireteamOrders[key] = {
          anchor: copy(desired),
          origin: copy(live),
          forward: forward(sq),
          signature: sig,
          until: battle.time + (urgent ? 0 : TEAM_LEASE),
          blocked: false
        };
      else if (regroup) cur.until = battle.time + TEAM_LEASE;
      else if (battle.time >= cur.until || dist(cur.anchor, desired) > 20) {
        var arrived = live && dist(live, cur.anchor) <= 4.5;
        if (arrived)
          cur = sq._fireteamOrders[key] = {
            anchor: copy(desired),
            origin: copy(live),
            forward: forward(sq),
            signature: sig,
            until: battle.time + TEAM_LEASE,
            blocked: false
          };
        else cur.until = battle.time + TEAM_LEASE;
      }
      for (var i = 0; i < m.length; i++) {
        var s = m[i],
          d = teamSlot(sq, key, s, i, m.length, cur.anchor, cur.forward),
          prepared = defensive && s._preparedDefensePost,
          post = prepared ? null : defensive ? holdPost(s, defenseKey) : null,
          next = prepared ? copy(prepared) : post ? { x: post.x, z: post.z } : d,
          kind = prepared ? 'prepared' : post ? 'defense-post' : 'formation',
          publishKey = sig + '|' + key + '|' + kind,
          previous = point(s._fireteamDestination);
        s._fireteamKey = key;
        if (!defensive) s._defensePost = null;
        stats.intentChecks++;
        if (
          !urgent &&
          previous &&
          dist(previous, next) <= ORDER_PUBLISH_EPS &&
          s._fireteamPublishKey === publishKey
        ) {
          stats.intentCoalesced++;
          continue;
        }
        s._fireteamDestination = copy(next);
        s._fireteamPublishKey = publishKey;
        stats.intentPublishes++;
        if (root.BattleMovementResolver)
          root.BattleMovementResolver.proposeOrder(s, s._fireteamDestination, battle, urgent);
        else s.orderDestination = copy(s._fireteamDestination);
      }
    });
  }
  /* Fire and movement. Engagement reports the squad's contact and base of fire; the Captain decides
   whether the phase allows an assault and, every BOUND_CYCLE seconds, sends one fireteam forward
   for BOUND_DURATION while at least two men keep shooting. */
  function fireAndMovement(sq, battle) {
    var E = root.BattleEngagement;
    if (!E || !sq || !battle) return;
    var r = E.updateSquad(sq, battle);
    if (!r) return;
    var members = sq.members || [],
      i,
      s;
    /* A bound order that was not taken up inside its window is stale, not pending. */
    if (battle.time >= (sq._boundUntil || 0)) E.clearBoundOrders(sq);
    if (r.contactStarted) {
      sq._boundUntil = 0;
      sq._nextBoundAt = battle.time + BOUND_CYCLE;
    }
    if (!sq.inContact) {
      sq._boundUntil = 0;
      sq._assaultAuthorized = false;
      return;
    }
    sq._assaultAuthorized = !!ASSAULT_PHASES[sq.commandPhase || ''];
    /* A bound needs a base of fire: somebody has to be shooting while somebody else moves. */
    if (
      !sq._assaultAuthorized ||
      battle.time < (sq._nextBoundAt || 0) ||
      battle.time < (sq._boundUntil || 0) ||
      r.effective < 2 ||
      r.pinned >= r.effective
    )
      return;
    /* Rotate teams, but skip a team whose departure would strip the base of fire: waiting a tick for
     the rotation to reach a team that can go is a missed bound. */
    var first = sq._boundTurn == null ? 0 : sq._boundTurn + 1,
      turn,
      team,
      movers,
      holding;
    for (var k = 0; k < BOUND_TEAMS.length; k++) {
      turn = first + k;
      team = BOUND_TEAMS[turn % BOUND_TEAMS.length];
      movers = [];
      for (i = 0; i < members.length; i++) {
        s = members[i];
        if (s.dead || s.suppressedUntil > battle.time || s.reloading || s.clearingStoppage || s.outOfAmmo)
          continue;
        if (s.role === 'gunner' || (root.BattleTacticalPositions && root.BattleTacticalPositions.current(s)))
          continue; // positional tasks hold the base of fire
        if (s._fireteamKey && s._fireteamKey !== team) continue;
        movers.push(s);
      }
      holding = r.fireSupport.filter(function (man) {
        return movers.indexOf(man) < 0;
      }).length;
      if (movers.length && holding >= 2) break;
    }
    if (!(movers.length && holding >= 2)) turn = first;
    sq._boundTurn = turn;
    if (movers.length && holding >= 2) {
      sq._boundTeam = team;
      sq._boundUntil = battle.time + BOUND_DURATION;
      sq._nextBoundAt = battle.time + BOUND_CYCLE;
      E.orderBound(movers);
      telemetry(battle, 'decision-bound', {
        faction: sq.faction,
        squad: sq.id,
        team: team,
        movers: movers.length,
        holding: holding
      });
    }
  }
  function updateSquadState(sq, battle) {
    var living = 0,
      anyEngaged = false;
    for (var i = 0; i < sq.members.length; i++) {
      var s = sq.members[i];
      if (!s.dead) living++;
      if (s.target) anyEngaged = true;
    }
    sq.aliveCount = living;
    var casualtyFrac = 1 - living / sq.members.length;
    if (casualtyFrac >= 0.6) sq.state = 'retreat';
    else sq.state = anyEngaged ? 'engaged' : 'advance';
    fireAndMovement(sq, battle);
  }
  root.SquadAI.updateSquad = function (sq, battle) {
    updateSquadState(sq, battle);
    if (!battle) return;
    advanceSquadAnchor(sq, battle);
    updateFireteams(sq, battle);
  };

  function inTown(town, p) {
    return !!(town && town.center && p && dist(p, town.center) < (+town.radius || 250));
  }
  function missionLegs(m) {
    var legs = (m.route || []).map(copy);
    if (m.point) legs.push(copy(m.point));
    return legs;
  }
  function assaultCommitted(sim, sq) {
    var a = sim.factions[sq.faction].squads;
    for (var i = 0; i < a.length; i++)
      if (a[i] !== sq && ((+a[i].routeIndex || 0) >= 2 || a[i].state === 'engaged')) return true;
    return false;
  }
  function objectivePhase(sim, sq, m, c, pos) {
    var obj = root.BattleObjectiveSystem && root.BattleObjectiveSystem.get(sim, m.objectiveId),
      radius = +(obj && obj.def && obj.def.radius) || 30,
      inside = dist(pos, m.point) <= radius * (+c.captureCommitRatio || 0.82);
    if (m.intent === 'defend') return m.requestKey || inside ? 'defend' : 'assault';
    return inside ? 'capture' : 'assault';
  }
  /* Captain execution of the General's brief: the only runtime writer of phase, legs and the squad
   objective point. Without a brief (Macro OFF) the Captain walks the assigned approach route. */
  function executeMission(sim, sq, town) {
    if (!sim || !sq || sq.state === 'retreat' || !alive(sq).length) return;
    var st = sq._regroupHysteresis;
    if (st && st.accepted) return;
    var m = sq._macroMission || null,
      ex = sq._missionExecution,
      t = sim.time,
      c = cfg(sim, sq),
      pos = average(sq);
    if (!ex || ex.mission !== m) {
      ex = sq._missionExecution = { mission: m, acceptedAt: t, holdPoint: copy(pos) };
      if (m) {
        sq.route = missionLegs(m);
        sq.routeIndex = 0;
        sq.commandHoldUntil = 0;
      }
      if (m && m.status === 'issued') {
        m.status = 'executing';
        m.acceptedAt = t;
        telemetry(sim, 'decision-mission-accepted', {
          faction: sq.faction,
          squad: sq.id,
          version: m.version,
          intent: m.intent,
          action: m.action,
          objectiveId: m.objectiveId
        });
      }
    }
    /* A firefight under this brief is a commitment: contact never advances legs or rewrites phase. */
    var plan = sq._engagementPlan;
    if (plan && (plan.status === 'active' || plan.status === 'quiet')) {
      if (plan.missionVersion === missionVersion(sq)) return;
      closePlan(sim, sq, 'mission superseded');
    }
    var legs = sq.route || [];
    if (!legs.length) return;
    var last = legs.length - 1,
      idx = Math.max(0, Math.min(last, +sq.routeIndex || 0)),
      wp = legs[idx];
    if ((m && m.intent === 'reserve') || (!m && sq.commandRole === 'reserve')) {
      setPhase(sim, sq, 'reserve', 'holding reserve');
      sq.objective = copy(legs[last]);
      return;
    }
    if (m && m.intent === 'hold') {
      setPhase(sim, sq, 'hold', 'mission hold');
      sq.objective = copy(legs[last]);
      return;
    }
    if (
      sq.commandRole === 'support' &&
      idx >= 1 &&
      t < (+c.supportDelay || 0) &&
      !assaultCommitted(sim, sq)
    ) {
      setPhase(sim, sq, 'support-hold', 'waiting for assault');
      sq.objective = copy(legs[Math.min(1, last)]);
      return;
    }
    if (t < (+sq.commandHoldUntil || 0)) {
      sq.objective = copy(wp);
      return;
    }
    var axisEnd = m ? (m.route || []).length - 1 : last,
      limit = +(captainAlive(sq) ? c.cohesionRadius : c.captainlessCohesion) || 34,
      urban = inTown(town, wp);
    var arrival =
      idx === axisEnd
        ? Math.max(+c.finalRouteRadius || 14, 32)
        : urban
          ? Math.max(+c.routeArrivalRadius || 8, limit * URBAN_ARRIVAL_COHESION)
          : +c.routeArrivalRadius || 8;
    if (idx < last && dist(pos, wp) < arrival) {
      var from = idx;
      sq.routeIndex = idx = idx + 1;
      wp = legs[idx];
      telemetry(sim, 'decision-route', {
        faction: sq.faction,
        squad: sq.id,
        from: from,
        to: idx,
        x: wp.x,
        z: wp.z
      });
      if (urban) {
        sq.commandHoldUntil =
          t + (+c.cornerHold || 0) + (captainAlive(sq) ? 0 : +c.cornerNoCaptainExtra || 0);
        setPhase(sim, sq, 'corner-check', 'route ' + from);
        sq.objective = copy(wp);
        return;
      }
    }
    if (m && m.objectiveId && idx === last) {
      if (m.action === 'hold' || m.action === 'regroup') {
        setPhase(sim, sq, 'hold', 'doctrine ' + m.action);
        sq.objective = copy(ex.holdPoint || pos);
        return;
      }
      if (m.action === 'support') {
        setPhase(sim, sq, 'support-hold', 'doctrine support');
        sq.objective = copy(ex.holdPoint || pos);
        return;
      }
      setPhase(sim, sq, objectivePhase(sim, sq, m, c, pos), 'mission ' + m.objectiveId);
      sq.objective = copy(wp);
      return;
    }
    /* No separate distance-based contact phase: a firefight is Engagement's inContact, which the
       plan lease and fire-and-movement already follow (2026-09-24 Macro-off benchmark: removing
       it left 29 of 30 battles identical). */
    if (m && m.action === 'flank' && idx === axisEnd) setPhase(sim, sq, 'flank', 'doctrine flank');
    else if (inTown(town, pos)) setPhase(sim, sq, 'clear-town', 'inside objective area');
    else setPhase(sim, sq, 'approach', 'route advance');
    sq.objective = copy(wp);
  }

  function summary(sim) {
    var out = {
      plans: 0,
      active: 0,
      quiet: 0,
      regroups: 0,
      fireteams: 0,
      orderPublishing: Object.assign(
        {},
        sim._squadCommandPublishStats || { intentChecks: 0, intentPublishes: 0, intentCoalesced: 0 }
      )
    };
    ['us', 'ge'].forEach(function (f) {
      var a = (sim && sim.factions && sim.factions[f] && sim.factions[f].squads) || [];
      for (var i = 0; i < a.length; i++) {
        var q = a[i],
          p = q._engagementPlan;
        if (p) {
          out.plans++;
          if (p.status === 'active') out.active++;
          if (p.status === 'quiet') out.quiet++;
        }
        if (q._regroupHysteresis && q._regroupHysteresis.accepted) out.regroups++;
        out.fireteams += Object.keys(q._fireteamOrders || {}).length;
      }
    });
    sim._squadCommandSummary = out;
    sim._engagementPlanSummary = { live: out.plans, active: out.active, quiet: out.quiet };
    sim._regroupHysteresisSummary = {
      active: out.regroups,
      enterGrace: REGROUP_ENTER,
      exitRatio: REGROUP_RELEASE
    };
    return out;
  }
  function reset(sim) {
    sim._squadCommandPublishStats = { intentChecks: 0, intentPublishes: 0, intentCoalesced: 0 };
    ['us', 'ge'].forEach(function (f) {
      var a = (sim && sim.factions && sim.factions[f] && sim.factions[f].squads) || [];
      for (var i = 0; i < a.length; i++) {
        var q = a[i];
        q._engagementPlan = null;
        q._stablePlan = null;
        q._engagementPlanSerial = 0;
        q._planDormantSignature = null;
        q._missionExecution = null;
        q._macroMissionRequest = null;
        q._regroupHysteresis = null;
        q._regroupRecovery = null;
        q._regroupRecoverySerial = 0;
        q._regroupBypassUntil = 0;
        q._fireteamOrders = {};
        q._boundUntil = 0;
        q._nextBoundAt = 0;
        q._boundTeam = null;
        q._boundTurn = null;
        q._assaultAuthorized = false;
        (q.members || []).forEach(function (s) {
          s._fireteamDestination = null;
          s._fireteamPublishKey = null;
          s._fireteamKey = null;
          s._defensePost = null;
          s._engagementTask = null;
        });
      }
    });
    summary(sim);
  }
  function commanderTick(sim, payload) {
    var town = (payload && payload.town) || null;
    ['us', 'ge'].forEach(function (f) {
      var a = (sim.factions && sim.factions[f] && sim.factions[f].squads) || [];
      for (var i = 0; i < a.length; i++) {
        var q = a[i];
        updateCohesion(sim, q);
        executeMission(sim, q, town);
        updatePlan(sim, q);
      }
    });
    summary(sim);
  }

  root.BattleModules.registerSystem('squad-command', {
    version: '1.5-m3c-mission-execution',
    onBattleStart: reset,
    beforeBattleRestart: reset,
    onBattleRestart: reset,
    onCommanderTick: commanderTick
  });
  root.BattleSquadStability = {
    version: '1.6-m3c-captain-fire-and-movement',
    planSeconds: { assault: ASSAULT_LEASE, defense: DEFENSE_LEASE },
    teamOrderSeconds: TEAM_LEASE,
    boundCycle: BOUND_CYCLE,
    boundDuration: BOUND_DURATION,
    fireAndMovement: fireAndMovement,
    initialPhase: initialPhase,
    teamKeyFor: teamKeyFor,
    executeMission: executeMission
  };
  root.BattleEngagementPlans = {
    version: '1.5-m3c-mission-execution',
    current: function (sq) {
      return planSnapshot(sq && sq._engagementPlan);
    },
    summary: function (sim) {
      return sim && sim._engagementPlanSummary
        ? JSON.parse(JSON.stringify(sim._engagementPlanSummary))
        : null;
    }
  };
  root.BattleRegroupHysteresis = {
    version: '1.5-m3c-mission-execution',
    enterGrace: REGROUP_ENTER,
    exitRatio: REGROUP_RELEASE,
    minRegroup: REGROUP_MIN,
    reentryCooldown: REENTRY,
    assessment: cohesionAssessment,
    summary: function (sim) {
      return sim && sim._regroupHysteresisSummary
        ? JSON.parse(JSON.stringify(sim._regroupHysteresisSummary))
        : null;
    }
  };
  console.log('[M3C] meso squad-command owner: stable Captain plan + coalesced fireteam publishing');
})(typeof window !== 'undefined' ? window : globalThis);

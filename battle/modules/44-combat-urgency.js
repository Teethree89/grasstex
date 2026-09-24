/* Combat urgency drills layered on Engagement.
   Two Micro reactions Engagement's state machine does not run itself: a suppressed man in the open
   bounds to nearby cover, and a man whose squad has just called a contact from a new direction
   halts and faces it. The assault forward guard also lives here: during an assault, cover behind
   the squad's axis is refused. Movement goes to the Movement Resolver like any other Engagement
   request; this module never rewrites Squad/Meso formation orders. */
(function (root) {
  'use strict';
  if (
    !root.BattleModules ||
    !root.BattleEngagement ||
    !root.BattleEngagement.extend ||
    !root.BattleMovementResolver ||
    root.BattleCombatUrgency
  )
    return;
  var MIN_COVER_FORWARD = 1.5;
  var COVER_SEARCH = 22,
    COVER_ARRIVED = 1.3,
    SHARED_REACT_AGE = 2.5,
    SHARED_HOLD = 1.8,
    SHARED_RESET_QUIET = 4.5,
    URGENT_TTL = 0.55;
  function point(p) {
    return p && isFinite(+p.x) && isFinite(+p.z) ? { x: +p.x, z: +p.z } : null;
  }
  function dist(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
  }
  function pos(s) {
    return point(s && s.root && s.root.position);
  }
  function estate(s) {
    try {
      return root.BattleEngagement.stateOf(s);
    } catch (_) {
      return s.eng || {};
    }
  }
  function objectiveById(sim, id) {
    var a = (sim && sim._objectives) || [];
    for (var i = 0; i < a.length; i++) {
      var o = a[i];
      if (String(o && o.id) === String(id)) {
        var d = o.def || o,
          p = point(d);
        if (p) return p;
      }
    }
    return null;
  }
  function axis(sim, sq) {
    var a = point(sq && sq.orderAnchor) || point(sq && sq.rally),
      g =
        objectiveById(sim, sq && sq.targetObjective) ||
        point(sq && sq._routeFinalObjective) ||
        point(sq && sq.objective);
    if (!a || !g) return null;
    var dx = g.x - a.x,
      dz = g.z - a.z,
      l = Math.hypot(dx, dz);
    return l < 1 ? null : { anchor: a, fx: dx / l, fz: dz / l, rx: -dz / l, rz: dx / l };
  }
  function bump(sim, field) {
    var st =
      sim._combatUrgencySummary ||
      (sim._combatUrgencySummary = {
        coverRejects: 0,
        lateralCoverRejects: 0,
        urgentCoverStarts: 0,
        urgentCoverArrivals: 0,
        sharedContactReactions: 0,
        sharedContactRepeatBlocks: 0,
        urgentFrames: 0
      });
    st[field]++;
  }
  function request(s, p, b, kind, ttl, reason) {
    return root.BattleMovementResolver.proposeCombat(s, p, b, kind, ttl, {
      source: 'engagement',
      reason: reason
    });
  }
  function allowCover(s, sim, pt) {
    var q = s && s.squad;
    if (!q || q.commandPhase !== 'assault' || q.state === 'retreat' || (+s.suppressedUntil || 0) > sim.time)
      return true;
    var ax = axis(sim, q),
      here = pos(s);
    if (!ax || !here) return true;
    var fw = (pt.x - here.x) * ax.fx + (pt.z - here.z) * ax.fz;
    if (fw >= MIN_COVER_FORWARD) return true;
    bump(sim, 'coverRejects');
    if (fw >= -0.25) bump(sim, 'lateralCoverRejects');
    return false;
  }
  function contact(s, b) {
    var q = s && s.squad,
      c = q && q.contact;
    if (!c || !isFinite(+c.at) || b.time - +c.at > SHARED_REACT_AGE) return null;
    return c;
  }
  function exposed(s, b) {
    try {
      var F = root.BattleObstacleField,
        p = pos(s);
      return !F || !p || F.coverPotentialAt(b.obstacles, p.x, p.z) > 0.88;
    } catch (_) {
      return true;
    }
  }
  function threatFor(s, b) {
    if (s.target && !s.target.dead) return s.target;
    var c = contact(s, b);
    if (c && c.unit && !c.unit.dead) return c.unit;
    if (c && isFinite(+c.x) && isFinite(+c.z)) return { root: { position: { x: +c.x, y: 0, z: +c.z } } };
    return null;
  }
  function sectorFor(s, p) {
    var h = pos(s);
    if (!h || !p) return null;
    var a = Math.atan2(p.z - h.z, p.x - h.x);
    return ((Math.round((a + Math.PI) / (Math.PI / 4)) % 8) + 8) % 8;
  }
  function sectorDistance(a, b) {
    if (a == null || b == null) return 8;
    var d = Math.abs(a - b) % 8;
    return Math.min(d, 8 - d);
  }
  function safeToMove(s, b) {
    return !!(
      s &&
      !s.dead &&
      !s.reloading &&
      !s.clearingStoppage &&
      s.squad &&
      s.squad.state !== 'retreat' &&
      !(root.BattleTacticalPositions && root.BattleTacticalPositions.current(s))
    );
  }
  function startUrgent(s, b, e) {
    if (!safeToMove(s, b) || (+s.suppressedUntil || 0) <= b.time || !exposed(s, b)) return false;
    var threat = threatFor(s, b);
    if (!threat || !root.BattleEngagement.findCover) return false;
    if (e._urgentCoverSearchAt && b.time < e._urgentCoverSearchAt) return false;
    e._urgentCoverSearchAt = b.time + 0.9;
    var cover = root.BattleEngagement.findCover(s, b, {
      maxRange: COVER_SEARCH,
      threat: threat,
      minEnemyDistance: 10
    });
    if (!cover) return false;
    e.cover = cover;
    e.state = 'bound';
    e.since = b.time;
    e.until =
      b.time +
      Math.max(2, cover.distance / Math.max(2.4, +s.crouchRunSpeed || +s.runSpeed || +s.speed || 3) + 1);
    e._urgentCover = true;
    s._combatUrgentUntil = b.time + URGENT_TTL;
    s.prone = false;
    s.crawling = false;
    s.tacticalCrouch = true;
    s.setUp = false;
    request(s, cover, b, 'cover-bound', 0.8, 'suppressed cover move');
    bump(b, 'urgentCoverStarts');
    return true;
  }
  function maintainUrgent(s, b, e) {
    if (!e._urgentCover || !e.cover) return false;
    var d = dist(pos(s), e.cover);
    if (d <= COVER_ARRIVED) {
      e._urgentCover = false;
      s._combatUrgentUntil = 0;
      bump(b, 'urgentCoverArrivals');
      return false;
    }
    if (!safeToMove(s, b) || e.state !== 'bound') {
      e._urgentCover = false;
      s._combatUrgentUntil = 0;
      return false;
    }
    s._combatUrgentUntil = b.time + URGENT_TTL;
    s.prone = false;
    s.crawling = false;
    s.tacticalCrouch = true;
    request(s, e.cover, b, 'cover-bound', 0.8, 'suppressed cover move');
    return true;
  }
  function reactShared(s, b, e) {
    var q = s && s.squad;
    if (!q || !q.inContact) {
      if (e._sharedContactQuietAt == null) e._sharedContactQuietAt = b.time;
      if (e._sharedContactAware && b.time - e._sharedContactQuietAt >= SHARED_RESET_QUIET) {
        e._sharedContactAware = false;
        e._sharedContactSector = null;
        e._sharedContactReactedAt = -999;
      }
      return;
    }
    e._sharedContactQuietAt = null;
    if (s.target || e.state !== 'advance' || s.reloading || s.clearingStoppage) return;
    var c = contact(s, b);
    if (!c) return;
    var h = pos(s),
      aim = { x: +c.x || 0, z: +c.z || 0 };
    if (!h) return;
    var sec = sectorFor(s, aim);
    if (e._sharedContactAware && sectorDistance(e._sharedContactSector, sec) <= 1) {
      bump(b, 'sharedContactRepeatBlocks');
      return;
    }
    e._sharedContactAware = true;
    e._sharedContactSector = sec;
    e._sharedContactReactedAt = b.time;
    e.state = 'alert';
    e.since = b.time;
    e.until = b.time + SHARED_HOLD;
    e.lastSeen = aim;
    e.lastSeenAt = Math.max(+e.lastSeenAt || -999, +c.at || b.time);
    s._faceHint = aim;
    s.tacticalCrouch = true;
    request(s, h, b, 'contact-reaction', Math.min(0.8, SHARED_HOLD), 'new shared threat');
    bump(b, 'sharedContactReactions');
  }
  /* Engagement's afterDrill slot runs this once the state machine has decided the soldier's tick. */
  root.BattleEngagement.extend('afterDrill', 'combat-urgency', function (s, b) {
    var e = estate(s);
    if (
      !maintainUrgent(s, b, e) &&
      (+s.suppressedUntil || 0) > b.time &&
      ['pinned', 'engage', 'orient'].indexOf(String(e.state || '')) >= 0
    )
      startUrgent(s, b, e);
    reactShared(s, b, e);
  });
  function markUrgent(sim) {
    var t = +sim.time || 0,
      a = root.BattleModules.unitsFor(sim);
    for (var i = 0; i < a.length; i++) {
      var s = a[i];
      if (!s || s.dead || t >= (+s._combatUrgentUntil || 0)) continue;
      if (s.prone) {
        s.prone = false;
        s.crawling = false;
      }
      s.tacticalCrouch = true;
      bump(sim, 'urgentFrames');
    }
  }
  function reset(sim) {
    sim._combatUrgencySummary = null;
    var a = root.BattleModules.unitsFor(sim);
    for (var i = 0; i < a.length; i++) {
      a[i]._combatUrgentUntil = 0;
      if (a[i].eng) {
        a[i].eng._urgentCover = false;
        a[i].eng._urgentCoverSearchAt = 0;
        a[i].eng._sharedContactAware = false;
        a[i].eng._sharedContactSector = null;
        a[i].eng._sharedContactQuietAt = null;
      }
    }
  }
  root.BattleModules.registerSystem('combat-urgency', {
    version: '1.3-resolver-coalesced',
    onBattleStart: reset,
    onBattleRestart: reset,
    onSimulationStep: markUrgent
  });
  root.BattleAssaultForwardGuard = { version: '1.3-resolver-coalesced', allowCover: allowCover };
  root.BattleCombatUrgency = {
    version: '1.3-resolver-coalesced',
    summary: function (sim) {
      return sim && sim._combatUrgencySummary ? JSON.parse(JSON.stringify(sim._combatUrgencySummary)) : null;
    }
  };
  console.log('[ENGAGE] combat urgency drills: suppressed cover bound + shared-contact reaction');
})(typeof window !== 'undefined' ? window : globalThis);

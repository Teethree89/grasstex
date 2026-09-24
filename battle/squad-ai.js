/* Squad + soldier AI for the battle sim.

   This file owns perception (who can see whom), the shot resolution, squad formations/orders and
   the squad state machine. The individual combat decision - stop, take cover, go prone, shoot,
   bound forward - lives in engagement.js, which this file delegates to. Keeping the two apart is
   what stops half a dozen modules from each writing soldier.destination on the same tick. */
(function (root) {
  'use strict';

  var ROLES = {
    captain: { weapon: 'pistol', speed: 3.0, visionRange: 150, engageRange: 55, hp: 110 },
    rifleman: { weapon: 'rifle', speed: 2.9, visionRange: 140, engageRange: 135, hp: 100 },
    gunner: { weapon: 'lmg', speed: 2.2, visionRange: 150, engageRange: 160, hp: 100 },
    scout: { weapon: 'carbine', speed: 3.8, visionRange: 175, engageRange: 105, hp: 90 }
  };
  var COMPOSITION = [
    'captain',
    'gunner',
    'scout',
    'scout',
    'rifleman',
    'rifleman',
    'rifleman',
    'rifleman',
    'rifleman',
    'rifleman'
  ];

  var RETREAT_CASUALTY_FRAC = 0.6,
    GUNNER_SETUP_TIME = 1.4,
    SUPPRESSION_TIME = 1.3,
    LOS_SAMPLES = 8;
  /* Fallback movement only (no Movement Resolver): hold a destination briefly before re-pathing. */
  var DESTINATION_COMMIT = 1.35;
  var EYE_HEIGHT = 1.55,
    EYE_HEIGHT_CROUCH = 1.05,
    EYE_HEIGHT_PRONE = 0.42;
  /* Perception cadence. Staggering the sweeps keeps a 100-man field cheap and stops a whole
     squad from acquiring the same target on the same frame. */
  var SCAN_INTERVAL = 0.3,
    TRACK_MARGIN = 1.15;
  /* How much of a man each stance leaves visible. Going prone is a real way to avoid being seen,
     which is what gives the engagement pipeline something to gain by getting down. */
  var VISIBILITY = { stand: 1, crouch: 0.72, prone: 0.45 },
    MOVING_VISIBILITY_BONUS = 0.22;
  /* How long a squad keeps acting on a last-known enemy position after nobody can see him. */
  var CONTACT_MEMORY = 12;
  /* Suppressing fire lands in a cone, not on a point: the further out, the looser the group. */
  var AREA_SPREAD_MIN = 3,
    AREA_SPREAD_PER_M = 0.05,
    AREA_SPREAD_MAX = 12,
    AREA_FIRE_RATE = 1.55,
    AREA_AIM_HEIGHT = 0.85;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function dist2(ax, az, bx, bz) {
    var dx = ax - bx,
      dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function rand(battle) {
    return battle && battle.random ? battle.random() : Math.random();
  }
  function field() {
    return root.BattleObstacleField;
  }
  function stanceOf(s) {
    return s.prone ? 'prone' : s.crouching || s.tacticalCrouch ? 'crouch' : 'stand';
  }
  function eyeHeight(s) {
    return s.prone ? EYE_HEIGHT_PRONE : s.crouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT;
  }

  /* Legacy height-blind circle test, kept as the fallback for callers that run without the
     obstacle field (old saved scenarios, unit tests, trimmed deployments). */
  function segmentHitsObstacle(ax, az, bx, bz, ob) {
    var dx = bx - ax,
      dz = bz - az,
      len2 = dx * dx + dz * dz;
    var t = len2 > 1e-6 ? ((ob.x - ax) * dx + (ob.z - az) * dz) / len2 : 0;
    t = clamp(t, 0, 1);
    var px = ax + dx * t,
      pz = az + dz * t,
      ddx = px - ob.x,
      ddz = pz - ob.z;
    return ddx * ddx + ddz * ddz <= ob.radius * ob.radius;
  }
  function obstacleBlocks(ax, az, bx, bz, obstacles) {
    if (!obstacles) return false;
    for (var i = 0; i < obstacles.length; i++)
      if (segmentHitsObstacle(ax, az, bx, bz, obstacles[i])) return true;
    return false;
  }

  function coverMultiplierAt(x, z, obstacles, stance) {
    var F = field();
    if (F) return F.coverAt(obstacles, x, z, stance || 'stand');
    if (!obstacles) return 1;
    var best = 1;
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i],
        dx = x - ob.x,
        dz = z - ob.z,
        r = ob.radius + 1.4;
      if (dx * dx + dz * dz <= r * r && ob.cover < best) best = ob.cover;
    }
    return best;
  }
  function coverPotentialAt(x, z, obstacles) {
    var F = field();
    return F ? F.coverPotentialAt(obstacles, x, z) : coverMultiplierAt(x, z, obstacles, 'prone');
  }

  function hasLineOfSight(a, b, heightAt, obstacles) {
    var ax = a.root.position.x,
      az = a.root.position.z,
      ay = heightAt(ax, az) + eyeHeight(a);
    var bx = b.root.position.x,
      bz = b.root.position.z,
      by = heightAt(bx, bz) + eyeHeight(b);
    var F = field();
    if (F) {
      if (F.sightBlocked(obstacles, { x: ax, z: az, y: ay }, { x: bx, z: bz, y: by })) return false;
    } else if (obstacleBlocks(ax, az, bx, bz, obstacles)) return false;
    if (
      root.BattleNavigation &&
      root.BattleNavigation.lineOfSightBlocked({ x: ax, z: az }, { x: bx, z: bz }, ay, by)
    )
      return false;
    for (var i = 1; i < LOS_SAMPLES; i++) {
      var t = i / LOS_SAMPLES,
        x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      var lineY = ay + (by - ay) * t,
        groundY = heightAt(x, z);
      if (groundY > lineY - 0.15) return false;
    }
    return true;
  }

  /* Effective spotting range against one particular man in one particular stance. */
  function detectionRange(observerRole, target) {
    var mult = VISIBILITY[stanceOf(target)] || 1;
    if (target.moving) mult += MOVING_VISIBILITY_BONUS;
    return observerRole.visionRange * clamp(mult, 0.3, 1.25);
  }
  /* Range first, sight second: sorting the in-range enemies by distance and stopping at the first
     visible one turns a full O(enemies) sight sweep into one or two sight tests, which matters now
     that sight tests consult a few thousand obstacles. */
  var scanBuffer = [];
  function findTarget(soldier, enemies, heightAt, obstacles) {
    var role = ROLES[soldier.role],
      p = soldier.root.position,
      i;
    scanBuffer.length = 0;
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var d = dist2(p.x, p.z, e.root.position.x, e.root.position.z);
      if (d > detectionRange(role, e)) continue;
      scanBuffer.push({ unit: e, d: d });
    }
    scanBuffer.sort(function (a, b) {
      return a.d - b.d;
    });
    for (i = 0; i < scanBuffer.length; i++)
      if (hasLineOfSight(soldier, scanBuffer[i].unit, heightAt, obstacles)) return scanBuffer[i].unit;
    return null;
  }
  /* Eyes already on a man stay on him past the point where he could have been spotted cold. */
  function stillTracking(soldier, heightAt, obstacles) {
    var t = soldier.target;
    if (!t || t.dead) return false;
    var role = ROLES[soldier.role],
      p = soldier.root.position;
    if (dist2(p.x, p.z, t.root.position.x, t.root.position.z) > role.visionRange * TRACK_MARGIN) return false;
    return hasLineOfSight(soldier, t, heightAt, obstacles);
  }

  /* Shared contact.
     Men used to acquire targets entirely on their own, so a squad had no collective idea where the
     enemy was: the moment a man lost line of sight he held his own last-seen point and everyone
     else carried on as if nothing had happened. One record per squad, written by whoever can
     currently see the enemy, gives the other nine a direction to face, a position to put fire on,
     and a reason to be already looking the right way when their own turn comes. */
  /* The record is the NEAREST enemy the squad currently knows about, not whichever man happened to
     write last. A scout's eyes reach 175 m and routinely mark someone a rifleman cannot even shoot
     at, so last-writer-wins pointed the whole squad at the furthest contact. Fresh news still
     always gets in: an entry older than CONTACT_REFRESH is replaced regardless of distance. */
  var CONTACT_REFRESH = 2;
  function shareContact(soldier, battle) {
    var sq = soldier.squad,
      t = soldier.target;
    if (!sq || !t || t.dead) return null;
    var p = t.root.position,
      anchor = sq.orderAnchor || sq.rally || p,
      held = sq.contact;
    if (
      held &&
      !held.unit.dead &&
      battle.time - held.at <= CONTACT_REFRESH &&
      held.unit !== t &&
      dist2(anchor.x, anchor.z, held.x, held.z) <= dist2(anchor.x, anchor.z, p.x, p.z)
    )
      return held;
    sq.contact = { unit: t, x: p.x, z: p.z, at: battle.time, seenBy: soldier.id, stance: stanceOf(t) };
    return sq.contact;
  }
  function squadContact(squad, battle) {
    var c = squad && squad.contact;
    if (!c) return null;
    /* Intel expires. Dropping the one man the squad had eyes on decays it faster - the reason for
       the record is gone - but it does NOT erase it: there are usually nine more enemies right
       there, and wiping the squad's whole picture because it scored a hit left it blind at exactly
       the moment it was winning. Any new sighting overwrites the record anyway. */
    var limit = c.unit && c.unit.dead ? CONTACT_MEMORY / 3 : CONTACT_MEMORY;
    if (battle.time - c.at > limit) {
      squad.contact = null;
      return null;
    }
    return c;
  }

  /* Suppressing fire at a POSITION rather than at a man.
     Deliberately deals no damage: the shooter has no line of sight to a body, so a round that
     would have hit is stopped by whatever is hiding him. What it does do is pin whoever is there,
     which is the whole tactical point - it is what makes a bound survivable and what stops a
     squad falling silent the instant line of sight breaks. No damage also means it can never be
     used to farm kills through cover. */
  /* Can this man put rounds on that spot at all - in range, and with something other than a hill
     in the way? Asked during suppression assignment as well as at the trigger, because a man who
     cannot reach the position should be left to get on with the advance rather than stood in the
     open pointing at something 180 m away. The scout's eyes routinely mark contacts further out
     than a rifle will carry, so this is the common case, not the edge case. */
  function canSuppress(shooter, point, battle) {
    if (!point || !shooter || shooter.dead || !shooter.weapon) return false;
    var stats = shooter.weapon.stats,
      p = shooter.root.position,
      d = dist2(p.x, p.z, point.x, point.z);
    if (d > stats.range * 0.95) return false;
    var eyeY = battle.heightAt(p.x, p.z) + eyeHeight(shooter),
      aimY = battle.heightAt(point.x, point.z) + AREA_AIM_HEIGHT,
      F = field();
    /* The obstacle field lets him shoot at the cover a man is behind without letting him shoot
       through a hill. */
    if (
      F &&
      F.sightBlocked(battle.obstacles, { x: p.x, z: p.z, y: eyeY }, { x: point.x, z: point.z, y: aimY })
    )
      return false;
    if (
      root.BattleNavigation &&
      root.BattleNavigation.lineOfSightBlocked({ x: p.x, z: p.z }, { x: point.x, z: point.z }, eyeY, aimY)
    )
      return false;
    return true;
  }
  /* Owned command leases. A lease is a commitment that holds a squad's intent for a while: one
     table per squad (sq._leases) says which commitments are live, who owns each, why it was taken,
     when it lapses and what releases it early, so no hold is an anonymous `...Until` field.
     `until` is an absolute sim time (Infinity while a condition, not the clock, holds it);
     holds() is `t < until`, the same test every migrated timer used. */
  var LEASE_LOG = 8;
  function leaseTable(sq) {
    if (!sq._leases) sq._leases = { live: {}, ended: [] };
    return sq._leases;
  }
  var Leases = {
    grant: function (sq, kind, owner, since, until, reason, release, data) {
      var l = { kind: kind, owner: owner, since: since, until: until, reason: reason || kind, release: release || 'expiry' };
      if (data) l.data = data;
      leaseTable(sq).live[kind] = l;
      return l;
    },
    /* Push an existing lease's expiry out (never in); grants it if absent. */
    extend: function (sq, kind, owner, since, until, reason, release) {
      var l = sq && sq._leases && sq._leases.live[kind];
      if (!l) return Leases.grant(sq, kind, owner, since, until, reason, release);
      if (until > l.until) {
        l.until = until;
        if (reason) l.reason = reason;
      }
      return l;
    },
    get: function (sq, kind) {
      return (sq && sq._leases && sq._leases.live[kind]) || null;
    },
    holds: function (sq, kind, t) {
      var l = sq && sq._leases && sq._leases.live[kind];
      return !!l && t < l.until;
    },
    until: function (sq, kind) {
      var l = sq && sq._leases && sq._leases.live[kind];
      return l ? l.until : 0;
    },
    end: function (sq, kind, t, why) {
      var table = sq && sq._leases,
        l = table && table.live[kind];
      if (!l) return null;
      delete table.live[kind];
      l.endedAt = t;
      l.endReason = why || 'released';
      table.ended.push(l);
      if (table.ended.length > LEASE_LOG) table.ended.shift();
      return l;
    },
    clear: function (sq) {
      if (sq) sq._leases = { live: {}, ended: [] };
    },
    /* Live leases at time t, for diagnostics and the operator view. */
    active: function (sq, t) {
      var live = (sq && sq._leases && sq._leases.live) || {},
        out = [];
      Object.keys(live).forEach(function (kind) {
        var l = live[kind];
        if (t < l.until)
          out.push({
            kind: l.kind,
            owner: l.owner,
            reason: l.reason,
            release: l.release,
            since: l.since,
            remaining: isFinite(l.until) ? +(l.until - t).toFixed(2) : null
          });
      });
      return out;
    }
  };

  /* Declared extension points. A module attaches to a named slot instead of replacing a SquadAI
     function, and the owner fixes the order each slot runs in, so the pipeline reads here rather
     than from whichever file happened to load last. */
  function extensionPoints(order) {
    var slots = {};
    Object.keys(order).forEach(function (stage) {
      slots[stage] = [];
    });
    return {
      order: order,
      attach: function (stage, id, fn) {
        var ids = order[stage],
          at = ids ? ids.indexOf(id) : -1;
        if (at < 0) throw new Error('Extension ' + id + ' is not declared for ' + stage);
        slots[stage][at] = fn;
      },
      /* Gates: any extension returning false vetoes the action. */
      pass: function (stage, a, b, c) {
        var fns = slots[stage];
        for (var i = 0; i < fns.length; i++) if (fns[i] && fns[i](a, b, c) === false) return false;
        return true;
      },
      run: function (stage, a, b, c) {
        var fns = slots[stage];
        for (var i = 0; i < fns.length; i++) if (fns[i]) fns[i](a, b, c);
      },
      /* Replaceable models: the first attached extension decides; otherwise the owner's default. */
      first: function (stage, fallback) {
        var fns = slots[stage];
        for (var i = 0; i < fns.length; i++) if (fns[i]) return fns[i];
        return fallback;
      }
    };
  }
  var EXT = extensionPoints({
    fireGate: ['ammunition', 'ballistics', 'direct-fire-los'], // before an aimed shot: weapon ready, target in range, trigger-time LOS
    shotModel: ['ballistics'], // where an aimed round goes (default: resolveFire accuracy roll)
    areaFireGate: ['ammunition'], // before a suppressive shot
    afterShot: ['ammunition'], // a round left the weapon: ammo, heat, stoppages
    squadCommand: ['captain'], // the squad's command owner; without one a squad only reports status
    beforeSoldier: ['weapon-cycle'], // each soldier AI tick, before perception
    afterSoldier: ['weapon-cycle'] // after engagement and movement resolution
  });

  function areaFire(shooter, point, battle) {
    if (!EXT.pass('areaFireGate', shooter, battle, point)) return 0;
    if (shooter.fireCooldown > 0 || !canSuppress(shooter, point, battle)) return 0;
    var stats = shooter.weapon.stats,
      p = shooter.root.position,
      d = dist2(p.x, p.z, point.x, point.z);
    var spread = clamp(AREA_SPREAD_MIN + d * AREA_SPREAD_PER_M, AREA_SPREAD_MIN, AREA_SPREAD_MAX);
    var enemies = battle.rosterOf(shooter.faction === 'us' ? 'ge' : 'us'),
      hold = SUPPRESSION_TIME * (stats.suppressive ? 1.25 : 0.85),
      hit = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (dist2(e.root.position.x, e.root.position.z, point.x, point.z) > spread) continue;
      e.suppressedUntil = Math.max(e.suppressedUntil || 0, battle.time + hold);
      hit++;
    }
    shooter.fireCooldown = (1 / stats.rof) * AREA_FIRE_RATE * (0.85 + rand(battle) * 0.3);
    battle.onFire && battle.onFire(shooter);
    battle.onSuppressiveShot && battle.onSuppressiveShot(shooter, point, hit);
    EXT.run('afterShot', shooter, battle);
    return hit;
  }

  function resolveFire(shooter, target, battle) {
    var stats = shooter.weapon.stats,
      d = dist2(
        shooter.root.position.x,
        shooter.root.position.z,
        target.root.position.x,
        target.root.position.z
      );
    if (d > stats.range) return null;
    var falloff =
      d <= stats.falloffStart
        ? 1
        : Math.max(0.15, 1 - (d - stats.falloffStart) / Math.max(1, stats.range - stats.falloffStart));
    var acc = stats.accuracy * falloff * (shooter.squad.accuracyMultiplier || 1);
    if (target.prone) acc *= 0.34;
    else if (target.crouching) acc *= 0.6;
    if (target.suppressedUntil > battle.time) acc *= 0.55;
    if (shooter.role === 'gunner' && shooter.setUp) acc *= 1.25;
    if (shooter.prone) acc *= 1.12;
    if (shooter.moving) acc *= 0.82;
    var targetPosition = root.BattleTacticalPositions && root.BattleTacticalPositions.current(target);
    if (targetPosition && targetPosition.occupiedAt != null) acc *= 0.46;
    /* Cover pays off in proportion to how much of the target's silhouette it actually hides. */
    acc *= coverMultiplierAt(
      target.root.position.x,
      target.root.position.z,
      battle.obstacles,
      stanceOf(target)
    );
    acc = clamp(acc, 0.02, 0.95);
    var hit = rand(battle) < acc;
    if (stats.suppressive) target.suppressedUntil = battle.time + SUPPRESSION_TIME;
    if (hit) {
      target.hp -= stats.damage * (0.85 + rand(battle) * 0.3);
      if (target.hp <= 0) battle.killSoldier(target, shooter);
    }
    battle.onShot && battle.onShot(shooter, target, hit, d);
    return hit;
  }

  function createSquad(id, faction, homePoint, objective) {
    return {
      id: id,
      faction: faction,
      members: [],
      state: 'advance',
      home: homePoint,
      objective: objective,
      rally: { x: homePoint.x, z: homePoint.z },
      orderAnchor: { x: homePoint.x, z: homePoint.z },
      formation: 'wedge',
      accuracyMultiplier: 1,
      captainAlive: true,
      inContact: false,
      contactCount: 0,
      contactSince: null,
      contact: null,
      suppressorCount: 0,
      _orderGoal: { x: homePoint.x, z: homePoint.z },
      _orderVersion: 0
    };
  }
  /* Command belongs to one man, not to a weapon role. `leaderId` names him once a squad has been
     re-formed; until then the squad is led by its living `captain` role, as it was spawned. */
  function leaderOf(squad) {
    var a = (squad && squad.members) || [],
      i;
    if (squad && squad.leaderId != null) {
      for (i = 0; i < a.length; i++) if (a[i] && a[i].id === squad.leaderId && !a[i].dead) return a[i];
      return null;
    }
    for (i = 0; i < a.length; i++) if (a[i] && !a[i].dead && a[i].role === 'captain') return a[i];
    return null;
  }
  function isLeader(soldier) {
    return !!(soldier && soldier.squad && leaderOf(soldier.squad) === soldier);
  }
  /* Casualties are measured against the squad's full strength, not its member list: a re-formed squad
     carries only its living men. */
  function establishment(squad) {
    return +squad.establishment || squad.members.length;
  }
  /* Where a retreating squad walks: home, or the rally point of the reconstitution brief once its
     Captain has brought it home safely (`_assembly`, 16-squad-plan-stability.js). */
  function retreatGoal(squad) {
    var a = squad._assembly,
      m = squad._macroMission;
    return a && a.phase === 'to-rally' && m && m.version === a.missionVersion && m.point
      ? m.point
      : squad.home;
  }
  function formationDirection(squad) {
    var anchor = squad.orderAnchor || squad.rally,
      goal = squad.state === 'retreat' ? retreatGoal(squad) : squad.objective || squad.home,
      dx = goal.x - anchor.x,
      dz = goal.z - anchor.z,
      len = Math.hypot(dx, dz);
    if (len < 0.1 && squad._formationForward) {
      return squad._formationForward;
    }
    var forward = { x: dx / (len || 1), z: dz / (len || 1) };
    squad._formationForward = forward;
    return forward;
  }
  function formationFor(squad) {
    var phase = squad.commandPhase || '';
    if (
      squad.state === 'retreat' ||
      phase === 'corner-check' ||
      phase === 'clear-town' ||
      phase === 'regroup'
    )
      return 'column';
    if (squad.state === 'engaged' || ['assault', 'capture', 'defend'].indexOf(phase) >= 0)
      return 'line';
    var anchor = squad.orderAnchor || squad.rally,
      goal = squad.objective || squad.home;
    return dist2(anchor.x, anchor.z, goal.x, goal.z) < 68 ? 'line' : 'wedge';
  }
  function slotJitter(soldier, axis) {
    var n = (soldier.slotIndex * 37 + String(soldier.id).length * 19 + (axis ? 11 : 3)) % 17;
    return (n - 8) * 0.22;
  }
  function formationSlot(squad, soldier, slotIndex) {
    var f = formationDirection(squad),
      fx = f.x,
      fz = f.z,
      rx = -fz,
      rz = fx,
      anchor = squad.orderAnchor || squad.rally,
      form = squad.formation || formationFor(squad),
      role = isLeader(soldier)
        ? 'captain'
        : soldier.slotRole || (soldier.role === 'captain' ? 'rifleman' : soldier.role),
      side = slotIndex % 2 === 0 ? 1 : -1,
      lateral = slotJitter(soldier, 0),
      depth = slotJitter(soldier, 1),
      forward = 0;
    if (form === 'column') {
      if (role === 'captain') {
        forward = -1;
        lateral = 0;
      } else if (role === 'scout') {
        forward = 5 + (slotIndex % 2) * 3;
        lateral = side * 2.4 + lateral;
      } else if (role === 'gunner') {
        forward = -5;
        lateral = 1.5 + lateral;
      } else {
        forward = -3 - (slotIndex - 4) * 2.7;
        lateral = side * (1.8 + (slotIndex % 3) * 0.8) + lateral;
      }
    } else if (form === 'line') {
      if (role === 'captain') {
        forward = -7;
        lateral = 0;
      } else if (role === 'gunner') {
        forward = -9;
        lateral = 2 + lateral;
      } else if (role === 'scout') {
        forward = 2;
        lateral = side * 14 + lateral;
      } else {
        var lane = slotIndex - 6;
        forward = -2 - (Math.abs(lane) % 2) * 2 + depth;
        lateral = lane * 5.3 + lateral;
      }
    } else {
      if (role === 'captain') {
        forward = -4;
        lateral = 0;
      } else if (role === 'gunner') {
        forward = -10;
        lateral = 1.5 + lateral;
      } else if (role === 'scout') {
        forward = 9;
        lateral = side * 10 + lateral;
      } else {
        var rank = Math.floor((slotIndex - 4) / 2),
          wing = slotIndex % 2 === 0 ? 1 : -1;
        forward = 1 - rank * 4 + depth;
        lateral = wing * (4 + rank * 4.3) + lateral;
      }
    }
    return { x: anchor.x + fx * forward + rx * lateral, z: anchor.z + fz * forward + rz * lateral };
  }

  function createSoldier(opts) {
    var role = ROLES[opts.role];
    return Object.assign({}, opts.model, {
      id: opts.id,
      faction: opts.faction,
      role: opts.role,
      squad: opts.squad,
      slotIndex: opts.slotIndex,
      weapon: opts.weapon,
      hp: role.hp,
      maxHp: role.hp,
      state: 'advance',
      target: null,
      destination: { x: opts.model.root.position.x, z: opts.model.root.position.z },
      orderDestination: null,
      _destinationCommitUntil: 0,
      _scanAt: 0,
      fireCooldown: Math.random() * 0.5,
      moving: false,
      crouching: false,
      prone: false,
      crawling: false,
      tacticalCrouch: false,
      suppressedUntil: 0,
      setUp: false,
      setUpSince: 0,
      speed: role.speed,
      moveSpeed: 0,
      voiceCooldown: Math.random() * 2,
      lastSquadState: 'advance'
    });
  }

  function setDestination(soldier, next, battle, urgent) {
    if (!next) return;
    if (root.BattleMovementResolver)
      return root.BattleMovementResolver.proposeOrder(soldier, next, battle, urgent);
    soldier.orderDestination = { x: next.x, z: next.z };
    var current = soldier.destination,
      atCurrent =
        current && dist2(soldier.root.position.x, soldier.root.position.z, current.x, current.z) < 1.8,
      changed = !current || dist2(current.x, current.z, next.x, next.z) > 2.4;
    if (urgent || atCurrent || (changed && battle.time >= (soldier._destinationCommitUntil || 0))) {
      soldier.destination = { x: next.x, z: next.z };
      soldier._destinationCommitUntil = battle.time + DESTINATION_COMMIT + (soldier.slotIndex % 3) * 0.22;
    }
  }
  /* Squad status only: alive count, retreat/engaged/advance state and the Engagement contact report.
     Orders, fire and movement belong to the squad's command owner (the Captain in
     16-squad-plan-stability.js), which attaches to the squadCommand slot and runs instead. */
  function squadStatus(squad, battle) {
    var alive = 0,
      anyEngaged = false;
    for (var i = 0; i < squad.members.length; i++) {
      if (!squad.members[i].dead) alive++;
      if (squad.members[i].target) anyEngaged = true;
    }
    squad.aliveCount = alive;
    if (1 - alive / establishment(squad) >= RETREAT_CASUALTY_FRAC) squad.state = 'retreat';
    else squad.state = anyEngaged ? 'engaged' : 'advance';
    if (battle && root.BattleEngagement) root.BattleEngagement.updateSquad(squad, battle);
  }
  function updateSquad(squad, battle) {
    return EXT.first('squadCommand', squadStatus)(squad, battle);
  }

  /* Voice never draws from the combat RNG: whether a callout plays depends on the voice modules and
     the audio manifest, so a random draw here made the same seed simulate a different battle with and
     without voice audio. The 4-9 s cooldown jitter is deterministic per soldier and callout instead. */
  function callout(soldier, battle, type) {
    if (!battle.onCallout || battle.time < (soldier.voiceCooldown || 0)) return;
    var n = (soldier._calloutCount = (soldier._calloutCount || 0) + 1);
    soldier.voiceCooldown = battle.time + 4 + (((+soldier.id || 0) * 37 + n * 11) % 50) / 10;
    battle.onCallout(soldier, type);
  }

  /* Perception only. What the soldier does about what he sees is engagement.js's job. */
  function perceive(soldier, battle) {
    var heightAt = battle.heightAt,
      obstacles = battle.obstacles,
      role = ROLES[soldier.role];
    var had = soldier.target;
    if (had && !stillTracking(soldier, heightAt, obstacles)) soldier.target = null;
    if (!soldier.target && battle.time >= (soldier._scanAt || 0)) {
      soldier._scanAt = battle.time + SCAN_INTERVAL + ((+soldier.id || 0) % 5) * 0.04;
      soldier.target = findTarget(
        soldier,
        battle.rosterOf(soldier.faction === 'us' ? 'ge' : 'us'),
        heightAt,
        obstacles
      );
    }
    if (soldier.target) shareContact(soldier, battle);
    if (!had && soldier.target) callout(soldier, battle, 'contact');
    if (soldier.lastSquadState !== soldier.squad.state) {
      if (isLeader(soldier))
        callout(
          soldier,
          battle,
          soldier.squad.state === 'retreat'
            ? 'retreat'
            : soldier.squad.state === 'advance'
              ? 'advance'
              : 'engage'
        );
      soldier.lastSquadState = soldier.squad.state;
    }
    return role;
  }

  function updateSoldier(soldier, battle) {
    EXT.run('beforeSoldier', soldier, battle);
    if (!soldier.dead) {
      var role = perceive(soldier, battle);
      if (root.BattleEngagement) root.BattleEngagement.updateSoldier(soldier, battle);
      else fallbackBehavior(soldier, battle, role);
      if (root.BattleMovementResolver) root.BattleMovementResolver.resolve(soldier, battle);
    }
    EXT.run('afterSoldier', soldier, battle);
  }

  /* Minimal stand-in used only when engagement.js failed to load, so a broken deployment still
     produces soldiers that shoot instead of soldiers that stand still. */
  function fallbackBehavior(soldier, battle, role) {
    if (soldier.squad.state === 'retreat') {
      if (root.BattleTacticalPositions) root.BattleTacticalPositions.release(soldier, battle, 'retreat');
      soldier.prone = false;
      soldier.state = 'retreat';
      setDestination(
        soldier,
        soldier.orderDestination || formationSlot(soldier.squad, soldier, soldier.slotIndex),
        battle,
        true
      );
      if (
        soldier.target &&
        dist2(
          soldier.root.position.x,
          soldier.root.position.z,
          soldier.target.root.position.x,
          soldier.target.root.position.z
        ) < 35
      )
        tryFire(soldier, battle);
      soldier.setUp = false;
      return;
    }
    if (soldier.target) {
      soldier.state = 'engage';
      var p = soldier.root.position,
        t = soldier.target.root.position,
        d = dist2(p.x, p.z, t.x, t.z);
      soldier.destination = { x: p.x, z: p.z };
      soldier.tacticalCrouch = true;
      soldier.prone =
        (soldier.role === 'rifleman' || soldier.role === 'gunner') &&
        (d > 80 || soldier.suppressedUntil > battle.time);
      if (soldier.role === 'gunner') {
        if (!soldier.setUpSince) soldier.setUpSince = battle.time;
        soldier.setUp = battle.time - soldier.setUpSince > GUNNER_SETUP_TIME;
      }
      if (d <= role.engageRange) tryFire(soldier, battle);
      return;
    }
    soldier.prone = false;
    soldier.tacticalCrouch = false;
    soldier.state = 'advance';
    soldier.setUp = false;
    soldier.setUpSince = 0;
    setDestination(
      soldier,
      soldier.orderDestination || formationSlot(soldier.squad, soldier, soldier.slotIndex),
      battle,
      false
    );
  }

  function shot(shooter, target, battle) {
    return EXT.first('shotModel', resolveFire)(shooter, target, battle);
  }
  function tryFire(soldier, battle) {
    if (!EXT.pass('fireGate', soldier, battle)) return false;
    if (soldier.fireCooldown > 0) return false;
    var stats = soldier.weapon.stats;
    shot(soldier, soldier.target, battle);
    soldier.fireCooldown = (1 / stats.rof) * (0.85 + rand(battle) * 0.3);
    battle.onFire && battle.onFire(soldier);
    EXT.run('afterShot', soldier, battle);
    return true;
  }

  root.BattleExtensionPoints = extensionPoints;
  root.BattleLeases = Leases;
  root.SquadAI = {
    extend: EXT.attach,
    extensionOrder: EXT.order,
    ROLES: ROLES,
    COMPOSITION: COMPOSITION,
    createSquad: createSquad,
    createSoldier: createSoldier,
    updateSquad: updateSquad,
    updateSoldier: updateSoldier,
    perceive: perceive,
    formationSlot: formationSlot,
    leaderOf: leaderOf,
    isLeader: isLeader,
    establishment: establishment,
    retreatGoal: retreatGoal,
    formationFor: formationFor,
    setDestination: setDestination,
    hasLineOfSight: hasLineOfSight,
    detectionRange: detectionRange,
    findTarget: findTarget,
    tryFire: tryFire,
    resolveFire: shot,
    areaFire: areaFire,
    canSuppress: canSuppress,
    shareContact: shareContact,
    squadContact: squadContact,
    CONTACT_MEMORY: CONTACT_MEMORY,
    CONTACT_REFRESH: CONTACT_REFRESH,
    coverMultiplierAt: coverMultiplierAt,
    coverPotentialAt: coverPotentialAt,
    stanceOf: stanceOf,
    eyeHeight: eyeHeight,
    dist2: dist2
  };
})(typeof window !== 'undefined' ? window : globalThis);

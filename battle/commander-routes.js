/* Commander force allocation and approach routes.

   Split out of commander-ai.js: who is left/right/centre/support/reserve, and the waypoint chain
   each of those roles walks to reach the settlement. Doctrine decides the mix; this file only turns
   that mix into geometry, so a new scenario generator can supply its own routes without the phase
   machine changing. */
(function (root) {
  'use strict';
  var D = function () {
    return root.BattleCommanderDoctrine;
  };

  function rolePlan(sim, faction, index, count) {
    var doc = D().doctrineFor(sim, faction),
      reserveCount = Math.round(count * doc.reserveFraction);
    if (reserveCount > 0 && index >= count - reserveCount) return 'reserve';
    var cycle =
      doc.flankPreference > 0.66
        ? ['left', 'right', 'center', 'left', 'right']
        : doc.flankPreference < 0.25
          ? ['center', 'support', 'center', 'left', 'right']
          : ['left', 'center', 'support', 'center', 'right'];
    return cycle[index % cycle.length];
  }
  function routeFor(sq, role, town, index) {
    var source =
      town &&
      town.routes &&
      town.routes[sq.faction] &&
      (town.routes[sq.faction][role] || town.routes[sq.faction].center);
    if (source && source.length)
      return source.map(function (p) {
        return { x: p.x, z: p.z };
      });
    var c = (town && town.center) || { x: 0, z: 0 },
      r = (town && town.radius) || 250,
      home = sq.home,
      dir = sq.faction === 'us' ? 1 : -1,
      side = role === 'left' ? -1 : role === 'right' ? 1 : 0;
    if (role === 'reserve')
      return [
        { x: home.x, z: home.z },
        { x: c.x + side * r * 0.52, z: c.z - dir * r * 0.82 }
      ];
    var flankScale = role === 'support' ? 0.18 : 0.56;
    return [
      { x: home.x, z: home.z },
      { x: c.x + side * r * flankScale, z: c.z - dir * r * 0.76 },
      { x: c.x + side * r * (role === 'support' ? 0.12 : 0.42), z: c.z - dir * r * 0.34 },
      { x: c.x, z: c.z }
    ];
  }
  function assignSquad(sim, sq, town, index) {
    var count = sim.factions[sq.faction].squads.length || 5,
      role = rolePlan(sim, sq.faction, index, count),
      route = routeFor(sq, role, town, index);
    sq._battleSim = sim;
    sq.commandRole = role;
    sq.route = route;
    sq.routeIndex = 0;
    var phase = role === 'reserve' ? 'reserve' : 'approach';
    /* The Captain owns commandPhase; route assignment only states where the squad starts. */
    if (root.BattleSquadStability) root.BattleSquadStability.initialPhase(sq, phase);
    else sq.commandPhase = phase;
    if (root.BattleLeases) root.BattleLeases.end(sq, 'corner-hold', +(sim && sim.time) || 0, 'route assigned');
    sq.lastCommandTime = 0;
    sq.objective = route[0];
    sq._lastLoggedRoute = -1;
    sq.targetObjective = null;
    sq._lastDoctrineRule = null;
    if (root.BattleTelemetry)
      root.BattleTelemetry.record(
        'decision-assign',
        {
          faction: sq.faction,
          squad: sq.id,
          role: role,
          routePoints: route.length,
          policyRevision: root.BattleAIPolicy ? root.BattleAIPolicy.revision : 0,
          genomeVersion: 2
        },
        sim
      );
  }
  function ensureAssignments(sim, town) {
    ['us', 'ge'].forEach(function (f) {
      var squads = sim.factions[f].squads;
      for (var i = 0; i < squads.length; i++) if (!squads[i].route) assignSquad(sim, squads[i], town, i);
    });
  }
  function initForce(sim, faction, town) {
    var squads = sim.factions[faction].squads;
    for (var i = 0; i < squads.length; i++) assignSquad(sim, squads[i], town, i);
  }

  root.BattleCommanderRoutes = {
    rolePlan: rolePlan,
    routeFor: routeFor,
    assignSquad: assignSquad,
    ensureAssignments: ensureAssignments,
    initForce: initForce
  };
  console.log('[COMMAND] force allocation + approach routes loaded');
})(typeof window !== 'undefined' ? window : globalThis);

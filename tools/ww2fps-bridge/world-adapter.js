/* ww2fps world export -> Battle Sim world.

   The merge seam between the two repos. ww2fps owns the world (terrain, buildings, hedges, roads,
   objectives); this repo owns soldiers, weapons, movement and AI. This file is the one place the
   ww2fps export (`scripts/export-world.mjs` over there: schema 2.0.0, scene_3d 1.0.0, plus
   `building_plans`) is turned into what the battle runtime already consumes:

     scenario            the v20 descriptor shape (buildings with side/offset openings, roads,
                         objectives, spawnZones, center, radius) BattleNavigation.installScenario reads
     obstacles           tactical cover records for BattleObstacleField (hedge prisms, trees, walls)
     physicalFootprints  the movement footprints (also hung on obstacles.__physicalFootprints)
     heightAt(x, z)      ground height in battle coordinates
     frame               toBattle/toWorld, so anything can be carried back into ww2fps metres

   Frame. ww2fps is metres from the map corner, X east / Z south. The battle is centred on the
   origin with the US (attacker here) spawning on -z. The adapter translates to the centre and
   rotates by a multiple of 90 degrees so the attacker->defender axis becomes +z; no other
   transform happens, so a building is exactly where ww2fps draws it, just in a rotated frame.

   Nothing here decides tactics; it only renames geometry. Pure JS, no Babylon: it loads as a
   classic script (window.Ww2fpsWorldAdapter) or with require(). */
(function (root) {
  'use strict';

  var SCHEMA = '2.0.0',
    SCENE_SCHEMA = '1.0.0';
  /* ww2fps sides are nations with a role; the battle has exactly two ids, 'us' and 'ge'. Until the
     runtime is keyed by side role, the attacker plays 'us' (spawns on -z) and the defender 'ge'. */
  var SIDE_FOR_ROLE = { attacker: 'us', defender: 'ge' };
  var GROUND_OPENING_MAX_BOTTOM = 1.5;
  var OBJECTIVE_RADIUS = [28, 40];

  function finite(v, d) {
    v = +v;
    return isFinite(v) ? v : d;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  /* Rotation of `angle` in the ww2fps worldRotate sense: (x, z) -> (x c - z s, x s + z c). */
  function rotate(x, z, angle) {
    var c = Math.cos(angle),
      s = Math.sin(angle);
    return { x: x * c - z * s, z: x * s + z * c };
  }

  function makeFrame(world) {
    var scene = world.scene_3d,
      bounds = scene.coordinateSystem.boundsM,
      unit = scene.coordinateSystem.mapUnitMeters || 20,
      cx = bounds[0] / 2,
      cz = bounds[1] / 2,
      byId = {};
    (world.spawns || []).forEach(function (s) {
      byId[s.id] = { x: s.x * unit, z: s.y * unit };
    });
    var atk = byId.attacker || { x: 0, z: cz },
      def = byId.defender || { x: bounds[0], z: cz },
      /* angle that turns attacker->defender onto +z, snapped to 90 degrees so the field stays a
         rectangle aligned with the battle's axes */
      raw = Math.atan2(def.x - atk.x, def.z - atk.z),
      angle = Math.round(raw / (Math.PI / 2)) * (Math.PI / 2),
      quarter = Math.round(angle / (Math.PI / 2)) & 1;
    return {
      angle: angle,
      unitM: unit,
      fieldW: quarter ? bounds[1] : bounds[0],
      fieldD: quarter ? bounds[0] : bounds[1],
      toBattle: function (wx, wz) {
        return rotate(wx - cx, wz - cz, angle);
      },
      toWorld: function (x, z) {
        var p = rotate(x, z, -angle);
        return { x: p.x + cx, z: p.z + cz };
      },
      /* a ww2fps yaw (worldRotate sense) as a battle `rot` (BattleNavigation rotates by -rot) */
      battleRot: function (yaw) {
        return -(yaw + angle);
      },
      spawns: { attacker: atk, defender: def }
    };
  }

  /* ww2fps plan walls: axis 'x' runs along the width at local z = offsetM (front is outward -1),
     axis 'z' along the depth at local x = offsetM. In battle terms +local z is north, +x east. */
  function sideOf(o) {
    if (o.axis === 'x') return o.outward < 0 ? 'south' : 'north';
    return o.outward < 0 ? 'west' : 'east';
  }

  function convertBuilding(b, plan, frame, stats) {
    var fp = b.footprintM,
      n = fp.length,
      sx = 0,
      sz = 0;
    for (var i = 0; i < n; i++) {
      sx += fp[i][0] / n;
      sz += fp[i][1] / n;
    }
    var c = frame.toBattle(sx, sz),
      out = {
        id: b.id,
        x: c.x,
        z: c.z,
        w: plan.widthM,
        d: plan.depthM,
        h: b.heightM,
        rot: frame.battleRot(plan.yawRad),
        kind: b.kind,
        storeys: plan.storeys,
        floorHeightM: plan.floorHeightM,
        baseElevationM: b.baseElevationM,
        source: 'ww2fps',
        openings: [],
        upperOpenings: []
      };
    plan.openings.forEach(function (o, index) {
      var type = o.type === 'garage' ? 'door' : o.type;
      if (type !== 'door' && type !== 'window') return;
      var rec = {
        id: b.id + '-' + type + '-' + o.wall + '-' + index,
        type: type,
        side: sideOf(o),
        offset: o.centerM,
        width: o.widthM,
        bottom: o.bottomM,
        top: o.topM,
        level: o.level || 0
      };
      /* The battle's navigation is one floor: only ground-level openings are portals or stations.
         Upper windows are kept so a later storey-aware station model has them. */
      if (rec.bottom <= GROUND_OPENING_MAX_BOTTOM) out.openings.push(rec);
      else out.upperOpenings.push(rec);
    });
    out.doorCount = out.openings.filter(function (o) {
      return o.type === 'door';
    }).length;
    out.windowCount = out.openings.length - out.doorCount;
    stats.doors += out.doorCount;
    stats.groundWindows += out.windowCount;
    stats.upperWindows += out.upperOpenings.length;
    stats.interiorWallsIgnored += (b.interiorWallsM || []).length;
    if (plan.storeys > 1) stats.multiStorey++;
    return out;
  }

  function obbRecord(id, type, ax, az, bx, bz, halfWidth, height, cover, heightAt, extra) {
    var dx = bx - ax,
      dz = bz - az,
      len = Math.hypot(dx, dz) || 0.001,
      ux = dx / len,
      uz = dz / len,
      y0 = heightAt(ax, az),
      y1 = heightAt(bx, bz),
      rec = {
        id: id,
        physicalId: id,
        type: type,
        shape: 'obb',
        volume: 'terrain-prism',
        x: (ax + bx) / 2,
        z: (az + bz) / 2,
        hx: len / 2,
        hz: halfWidth,
        ux: ux,
        uz: uz,
        vx: -uz,
        vz: ux,
        y: (y0 + y1) / 2,
        y0: y0,
        y1: y1,
        height: height,
        visibleHeight: height,
        radius: halfWidth,
        cover: cover
      };
    if (extra) for (var k in extra) rec[k] = extra[k];
    return rec;
  }

  function adapt(world, deps) {
    deps = deps || {};
    if (!world || !world.scene_3d) throw new Error('not a ww2fps world export (no scene_3d)');
    var warnings = [];
    if (world.schema_version !== SCHEMA)
      warnings.push('schema ' + world.schema_version + ' (adapter written for ' + SCHEMA + ')');
    if (world.scene_3d.schemaVersion !== SCENE_SCHEMA)
      warnings.push(
        'scene_3d ' + world.scene_3d.schemaVersion + ' (adapter written for ' + SCENE_SCHEMA + ')'
      );
    if (!world.building_plans)
      throw new Error('export has no building_plans; write it with ww2fps scripts/export-world.mjs');
    if (typeof deps.sampleHeight !== 'function')
      throw new Error(
        'deps.sampleHeight(terrain, elevationsM, xM, zM) is required (ww2fps js/terrain-height.mjs)'
      );

    var scene = world.scene_3d,
      frame = makeFrame(world),
      terrain = scene.terrain,
      elev = terrain.elevationsM;
    function heightAt(x, z) {
      var w = frame.toWorld(x, z);
      return deps.sampleHeight(terrain, elev, w.x, w.z);
    }

    var stats = {
      buildings: 0,
      ruinedSkipped: 0,
      doors: 0,
      groundWindows: 0,
      upperWindows: 0,
      multiStorey: 0,
      interiorWallsIgnored: 0,
      hedges: 0,
      trees: 0,
      walls: 0,
      defensesIgnored: (scene.defenses || []).length,
      bridges: (scene.bridges || []).length
    };
    var buildings = [];
    scene.buildings.forEach(function (b) {
      var plan = world.building_plans[b.id];
      if (!plan) return warnings.push('no plan for ' + b.id);
      if (plan.ruined) return stats.ruinedSkipped++;
      buildings.push(convertBuilding(b, plan, frame, stats));
    });
    stats.buildings = buildings.length;

    var obstacles = [],
      physical = [];
    function both(rec) {
      obstacles.push(rec);
      physical.push(rec);
    }
    function pt(m) {
      return frame.toBattle(m[0], m[2]);
    }
    (scene.vegetation.hedges || []).forEach(function (h) {
      var a = pt(h.aM),
        b = pt(h.bM);
      both(obbRecord(h.id, 'hedge', a.x, a.z, b.x, b.z, h.widthM / 2, h.heightM, 0.62, heightAt));
      stats.hedges++;
    });
    function lowWall(f, type) {
      var a = pt(f.aM),
        b = pt(f.bM),
        height = finite(f.heightM, 1.2);
      /* a fence or gate hides a man but stops nothing; masonry both hides and stops */
      var solid = !/fence|gate|hedge/i.test((f.material || '') + ' ' + (f.type || ''));
      both(
        obbRecord(f.id, type, a.x, a.z, b.x, b.z, 0.3, height, solid ? 0.7 : 0.35, heightAt, {
          material: f.material || null
        })
      );
      stats.walls++;
    }
    (scene.landscape.walls || []).forEach(function (w) {
      lowWall(w, 'wall');
    });
    (scene.landscape.settlementFeatures || []).forEach(function (f) {
      lowWall(f, f.type === 'wall' ? 'wall' : 'fence');
    });
    (scene.vegetation.woods || []).forEach(function (w) {
      var p = pt(w.positionM),
        trunk = { id: w.id + '-trunk', type: 'tree', shape: 'circle', x: p.x, z: p.z, radius: 0.3 };
      physical.push(trunk);
      obstacles.push({
        x: p.x,
        z: p.z,
        y: heightAt(p.x, p.z),
        radius: clamp(w.canopyRadiusM * 0.3, 0.6, 1.8),
        cover: 0.72,
        height: w.heightM,
        type: 'tree',
        physicalId: trunk.id
      });
      stats.trees++;
    });
    obstacles.__physicalFootprints = physical;

    var roads = (scene.roads || []).map(function (r) {
      var a = pt(r.fromM),
        b = pt(r.toM);
      return {
        id: r.id,
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        width: r.widthM,
        type: r.type,
        surface: r.surface
      };
    });

    var objectives = (world.capture_points || []).map(function (cp) {
      var p = frame.toBattle(cp.x * frame.unitM, cp.y * frame.unitM),
        radiusM = cp.radius * frame.unitM;
      return {
        id: cp.id,
        type: 'capture-zone',
        x: p.x,
        z: p.z,
        /* ww2fps objective radii are map-scale (a whole sector); a capture zone is a strongpoint */
        radius: clamp(radiusM, OBJECTIVE_RADIUS[0], OBJECTIVE_RADIUS[1]),
        sectorRadiusM: radiusM,
        label: cp.label,
        value: cp.sector_role === 'main' ? 1.35 : 1,
        sectorRole: cp.sector_role,
        defended: !!cp.defended
      };
    });

    var atk = frame.toBattle(frame.spawns.attacker.x, frame.spawns.attacker.z),
      def = frame.toBattle(frame.spawns.defender.x, frame.spawns.defender.z),
      half = frame.fieldW / 2 - 60;
    function lanes(x) {
      return [-2, -1, 0, 1, 2].map(function (k) {
        return clamp(x + k * 150, -half, half);
      });
    }
    var cx = 0,
      cz = 0;
    objectives.forEach(function (o) {
      cx += o.x / objectives.length;
      cz += o.z / objectives.length;
    });
    var spread = 0;
    objectives.forEach(function (o) {
      spread = Math.max(spread, Math.hypot(o.x - cx, o.z - cz));
    });

    var scenario = {
      version: 20,
      seed: 'ww2fps:' + world.seed,
      id: 'ww2fps-' + world.seed,
      source: {
        repo: 'ww2fps',
        schema: world.schema_version,
        scene: scene.schemaVersion,
        theatre: world.theatre
      },
      map: { width: frame.fieldW, depth: frame.fieldD, unitM: frame.unitM, source: 'ww2fps scene_3d' },
      terrain: { roughness: 0.5, minElevationM: terrain.minElevationM, maxElevationM: terrain.maxElevationM },
      sides: {
        us: { role: 'attacker', nation: world.attacker },
        ge: { role: 'defender', nation: world.defender }
      },
      spawnZones: { us: { z: atk.z, lanes: lanes(atk.x) }, ge: { z: def.z, lanes: lanes(def.x) } },
      roads: roads,
      buildings: buildings,
      objectives: objectives,
      sectors: objectives,
      center: { x: cx, z: cz },
      radius: Math.max(120, spread * 1.1),
      settlement: { cx: cx, cz: cz, spanX: spread * 2, spanZ: spread * 2 }
    };
    return {
      scenario: scenario,
      obstacles: obstacles,
      physicalFootprints: physical,
      heightAt: heightAt,
      frame: frame,
      stats: stats,
      warnings: warnings
    };
  }

  var api = {
    SCHEMA: SCHEMA,
    SCENE_SCHEMA: SCENE_SCHEMA,
    SIDE_FOR_ROLE: SIDE_FOR_ROLE,
    adapt: adapt,
    makeFrame: makeFrame
  };
  root.Ww2fpsWorldAdapter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

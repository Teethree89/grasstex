#!/usr/bin/env node
/* ww2fps bridge probe: can the battle runtime fight on a real ww2fps world today?

   For each seed it has a ww2fps checkout write its world export (scripts/export-world.mjs), turns
   it into a Battle Sim world with world-adapter.js, installs that into the shipping navigation and
   physicality code, and measures what holds and what breaks: buildings and openings converted,
   door portals a body fits through, whether spawns reach every objective and building, and a
   headless firefight on the real terrain with the shipping perception, engagement, squad command
   and wound model. Observe-only: it asserts nothing about the AI, it reports.

     WW2FPS_ROOT=../ww2fps node tools/ww2fps-bridge/probe.js
     BRIDGE_SEEDS=normandy_07:bocage,validation-2:ardennes BRIDGE_OUT=bridge.json node tools/ww2fps-bridge/probe.js

   Needs a ww2fps checkout with node_modules installed (npm ci there). Seeds are capped at 4 unless
   BRIDGE_SEEDS names more. */
'use strict';
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  { execFileSync } = require('child_process'),
  { pathToFileURL } = require('url');
const REPO = path.resolve(__dirname, '..', '..');
const H = require(path.join(REPO, 'tools/ai-sim-harness/harness.js'));
const Adapter = require('./world-adapter.js');

const WW2FPS = path.resolve(process.env.WW2FPS_ROOT || path.join(REPO, '..', 'ww2fps'));
const SEEDS = (
  process.env.BRIDGE_SEEDS ||
  'normandy_07:bocage,validation-2:ardennes,validation-3:italian,validation-4:urban'
)
  .split(',')
  .map(s => s.split(':'))
  .slice(0, process.env.BRIDGE_SEEDS ? undefined : 4);
const FIGHT_SECONDS = +(process.env.BRIDGE_FIGHT_SECONDS || 180);
const quiet = { log() {}, warn() {}, error() {} };

function load(root, rel) {
  const c = fs.readFileSync(path.join(REPO, rel), 'utf8');
  new Function('window', 'globalThis', 'console', 'BABYLON', c + '\n//# sourceURL=' + rel)(
    root,
    root,
    quiet,
    root.BABYLON
  );
}
function exportWorld(seed, theme) {
  const out = path.join(os.tmpdir(), 'ww2fps-bridge-' + seed + '-' + theme + '.json');
  execFileSync(
    process.execPath,
    [path.join(WW2FPS, 'scripts/export-world.mjs'), '--seed', seed, '--theme', theme, '--out', out],
    {
      cwd: WW2FPS,
      stdio: ['ignore', 'ignore', 'inherit']
    }
  );
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0) + '%';
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

/* The battle runtime a squad fights in: shipping perception/engagement/squad command/wounds from the
   harness bootstrap, plus the shipping navigation and physicality over the adapted world. */
function runtime(adapted) {
  const root = H.bootstrap();
  root.console = quiet;
  const systems = {};
  root.BattleModules.registerSystem = (n, h) => (systems[n] = h);
  root.BattleModules.getSystem = n => systems[n];
  root.BattleModules.listSystems = () => Object.values(systems);
  root.BABYLON.MeshBuilder.CreateLines = () => ({ dispose() {} });
  load(root, 'battle/battle-navigation.js');
  load(root, 'battle/modules/39-navigation-physicality-debug.js');
  const t0 = process.hrtime.bigint();
  root.BattleNavigation.installScenario(adapted.scenario);
  const navMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const battle = H.makeBattle(root, { obstacles: adapted.obstacles, heightAt: adapted.heightAt, seed: 4242 });
  battle.scene = { metadata: { battleScenario: adapted.scenario } };
  battle._units = [];
  if (systems['navigation-physicality-debug']) systems['navigation-physicality-debug'].onBattleStart(battle);
  return { root, battle, navMs, N: root.BattleNavigation, P: root.BattleNavigationPhysicality };
}

function pathLength(start, pts) {
  let p = start,
    len = 0;
  for (const q of pts) {
    len += Math.hypot(q.x - p.x, q.z - p.z);
    p = q;
  }
  return len;
}

async function probe(seed, theme, sampleHeight) {
  const world = exportWorld(seed, theme);
  const t0 = Date.now();
  const adapted = Adapter.adapt(world, { sampleHeight });
  const adaptMs = Date.now() - t0;
  const { scenario, frame, stats } = adapted;
  const report = {
    seed,
    theme,
    theatre: world.theatre,
    attacker: world.attacker,
    defender: world.defender,
    adaptMs,
    warnings: adapted.warnings
  };

  /* Frame: a round trip must be exact, and a building must stay where ww2fps put it. */
  let worst = 0;
  for (const b of world.scene_3d.buildings) {
    const c = b.footprintM.reduce((a, p) => ({ x: a.x + p[0] / 4, z: a.z + p[1] / 4 }), { x: 0, z: 0 });
    const q = frame.toWorld(frame.toBattle(c.x, c.z).x, frame.toBattle(c.x, c.z).z);
    worst = Math.max(worst, Math.hypot(q.x - c.x, q.z - c.z));
  }
  report.frame = {
    angleDeg: round((frame.angle * 180) / Math.PI, 1),
    field: [frame.fieldW, frame.fieldD],
    roundTripErrM: worst
  };
  report.world = stats;

  /* Footprint check: the battle's wall rectangle vs the ww2fps footprint, corner by corner. */
  let cornerErr = 0;
  for (const b of scenario.buildings) {
    const src = world.scene_3d.buildings
      .find(s => s.id === b.id)
      .footprintM.map(p => frame.toBattle(p[0], p[1]));
    const c = Math.cos(b.rot),
      s = Math.sin(b.rot);
    const mine = [
      [-b.w / 2, -b.d / 2],
      [b.w / 2, -b.d / 2],
      [b.w / 2, b.d / 2],
      [-b.w / 2, b.d / 2]
    ].map(([lx, lz]) => ({ x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c }));
    for (const m of mine)
      cornerErr = Math.max(cornerErr, Math.min(...src.map(p => Math.hypot(p.x - m.x, p.z - m.z))));
  }
  report.world.footprintCornerErrM = round(cornerErr, 3);

  const rt = runtime(adapted),
    { N, P, battle, root } = rt;
  report.nav = {
    buildMs: Math.round(rt.navMs),
    walls: N.walls.length,
    doorPortals: N.doorPortals.length,
    firingStations: N.firingStations.length
  };

  /* Doors: can a body cross each threshold? ww2fps doors are 0.95-2.6 m, the battle's were 1.35 m. */
  let doorsClear = 0;
  const narrow = [];
  for (const d of N.doorPortals) {
    if (N.movementClear(d.outside, d.inside) && N.movementClear(d.inside, d.outside)) doorsClear++;
    else narrow.push(d.id);
  }
  report.nav.doorsPassable = doorsClear + '/' + N.doorPortals.length;
  const doorWidths = scenario.buildings.flatMap(b =>
    b.openings.filter(o => o.type === 'door').map(o => o.width)
  );
  report.nav.doorWidthM = { min: round(Math.min(...doorWidths)), max: round(Math.max(...doorWidths)) };

  /* Reachability: each side's spawn to every objective and to the inside of every building. */
  const spawn = {
    us: { x: scenario.spawnZones.us.lanes[2], z: scenario.spawnZones.us.z },
    ge: { x: scenario.spawnZones.ge.lanes[2], z: scenario.spawnZones.ge.z }
  };
  const objectives = [];
  let tPath = 0,
    plans = 0;
  /* Physical planning is rolling (a ~96 m horizon), so reachability is a walk: the shipping
     nextWaypoint/resolveStep loop, as objective-nav-check drives it, 1 m a step. */
  function walk(start, goal, arrive) {
    const s = { id: 'walker', root: { position: { x: start.x, y: 0, z: start.z } }, _navCache: null };
    let walked = 0,
      illegal = 0;
    for (
      let i = 0;
      i < 5000 && Math.hypot(s.root.position.x - goal.x, s.root.position.z - goal.z) > arrive;
      i++
    ) {
      battle.time += 0.15;
      const p = s.root.position,
        w = N.nextWaypoint(battle, s, goal) || goal,
        d = Math.hypot(w.x - p.x, w.z - p.z),
        step = Math.min(1, d);
      if (d < 0.001) continue;
      let to = { x: p.x + ((w.x - p.x) / d) * step, z: p.z + ((w.z - p.z) / d) * step };
      if (!N.movementClear(p, to)) to = N.resolveStep(p, to);
      if (!to) continue;
      if (!N.movementClear(p, to)) illegal++;
      walked += Math.hypot(to.x - p.x, to.z - p.z);
      s.root.position = { x: to.x, y: 0, z: to.z };
    }
    const left = Math.hypot(s.root.position.x - goal.x, s.root.position.z - goal.z);
    return { reached: left <= arrive, left: Math.round(left), walked: Math.round(walked), illegal };
  }
  for (const o of scenario.objectives) {
    for (const side of ['us', 'ge']) {
      const t = process.hrtime.bigint(),
        r = walk(spawn[side], { x: o.x, z: o.z }, o.radius * 0.5);
      tPath += Number(process.hrtime.bigint() - t) / 1e6;
      plans++;
      objectives.push(
        Object.assign(
          { id: o.id, side, straightM: Math.round(Math.hypot(o.x - spawn[side].x, o.z - spawn[side].z)) },
          r
        )
      );
    }
  }
  report.objectives = {
    reachable: objectives.filter(o => o.reached).length + '/' + objectives.length,
    detour: round(
      objectives.filter(o => o.reached).reduce((a, o) => a + o.walked / Math.max(1, o.straightM), 0) /
        Math.max(1, objectives.filter(o => o.reached).length),
      2
    ),
    illegalSteps: objectives.reduce((a, o) => a + o.illegal, 0),
    unreached: objectives
      .filter(o => !o.reached)
      .map(o => o.side + '->' + o.id + ' (' + o.left + ' m short)'),
    meanWalkMs: round(tPath / Math.max(1, plans), 1)
  };
  let inside = 0,
    tried = 0;
  for (const b of scenario.buildings) {
    const door = N.doorPortals.find(d => d.building === b.id);
    if (!door) continue;
    tried++;
    const route = N.findPath(door.outside, { x: b.x, z: b.z });
    if (route && route.length) inside++;
  }
  report.nav.buildingsEnterable = inside + '/' + tried;

  /* Terrain the men walk on: relief across the battle area, and steepest ground under the routes. */
  let lo = Infinity,
    hi = -Infinity,
    steep = 0,
    samples = 0;
  for (let x = -frame.fieldW / 2 + 20; x < frame.fieldW / 2; x += 40)
    for (let z = -frame.fieldD / 2 + 20; z < frame.fieldD / 2; z += 40) {
      const h = adapted.heightAt(x, z),
        g =
          Math.hypot(
            adapted.heightAt(x + 2, z) - adapted.heightAt(x - 2, z),
            adapted.heightAt(x, z + 2) - adapted.heightAt(x, z - 2)
          ) / 4;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      samples++;
      if (g > 0.6) steep++;
    }
  report.terrain = {
    reliefM: round(hi - lo, 1),
    steeperThan31deg: pct(steep, samples),
    riverImpassableModelled: false
  };

  /* One firefight on the real ground: a US squad advancing on the first objective the defender
     holds, a German squad dug in on it, shipping AI throughout. */
  const obj =
    scenario.objectives.find(o => o.defended) ||
    scenario.objectives[Math.floor(scenario.objectives.length / 2)];
  H.resetIds();
  battle.time = 0; // the walks above advanced the clock
  const ge = H.addSquad(root, battle, {
    id: 'ge-0',
    faction: 'ge',
    x: obj.x,
    z: obj.z + 20,
    objective: { x: obj.x, z: obj.z },
    facing: Math.PI,
    seed: 11
  });
  const us = H.addSquad(root, battle, {
    id: 'us-0',
    faction: 'us',
    x: obj.x,
    z: obj.z - 220,
    objective: { x: obj.x, z: obj.z },
    facing: 0,
    seed: 12
  });
  let firstContact = null,
    losChecks = 0,
    losClear = 0;
  const tFight = Date.now();
  H.run(root, battle, FIGHT_SECONDS, b => {
    if (firstContact == null && (us.inContact || ge.inContact)) firstContact = round(b.time, 1);
    if (Math.round(b.time / 0.15) % 20 === 0)
      for (const a of b._roster.us)
        for (const e of b._roster.ge)
          if (!a.dead && !e.dead) {
            losChecks++;
            if (root.SquadAI.hasLineOfSight(a, e, b.heightAt, b.obstacles)) losClear++;
          }
  });
  const alive = f => battle._roster[f].filter(s => !s.dead).length;
  report.fight = {
    objective: obj.id,
    seconds: FIGHT_SECONDS,
    wallMs: Date.now() - tFight,
    firstContactS: firstContact,
    fired: battle.events.fired,
    hits: battle.events.hits,
    usAlive: alive('us') + '/' + battle._roster.us.length,
    geAlive: alive('ge') + '/' + battle._roster.ge.length,
    losClearSampled: pct(losClear, losChecks)
  };
  return report;
}

(async () => {
  if (!fs.existsSync(path.join(WW2FPS, 'scripts/export-world.mjs'))) {
    console.error('No ww2fps checkout with scripts/export-world.mjs at ' + WW2FPS + ' (set WW2FPS_ROOT)');
    process.exit(2);
  }
  const { sampleSmoothHeight } = await import(pathToFileURL(path.join(WW2FPS, 'js/terrain-height.mjs')).href);
  const reports = [];
  for (const [seed, theme] of SEEDS) {
    const r = await probe(seed, theme || 'bocage', sampleSmoothHeight);
    reports.push(r);
    console.log('\n== ' + seed + ' (' + r.theatre + ', ' + r.attacker + ' attacks ' + r.defender + ') ==');
    for (const k of ['frame', 'world', 'nav', 'objectives', 'terrain', 'fight'])
      console.log('  ' + k.padEnd(10) + JSON.stringify(r[k]));
    if (r.warnings.length) console.log('  warnings  ' + r.warnings.join('; '));
  }
  if (process.env.BRIDGE_OUT) fs.writeFileSync(process.env.BRIDGE_OUT, JSON.stringify(reports, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});

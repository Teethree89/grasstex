/* Deterministic browser replay of the shipping runtime. No gameplay replacements. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const seed = process.env.M3C_SEED || 'live-mu5gyen8-34vw9';
  const url = process.env.M3C_URL || 'http://127.0.0.1:8877/grasstex/battle_sim_local.php';
  const output = path.resolve(process.env.M3C_OUTPUT || '/private/tmp/m3c-evidence/replay.json');
  const macro = process.env.M3C_MACRO !== 'off';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.M3C_CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.stack || e)));
    // Pin initialization randomness as well as the battle's own seeded generator.
    await page.addInitScript(() => {
      let a = 12345;
      window.__m3cReseed = () => { a = 12345; window.__m3cDraws = 0; };
      Math.random = () => { window.__m3cDraws = (window.__m3cDraws || 0) + 1; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    });
    await page.route('**/*', async route => {
      const req = route.request();
      if (req.url().includes('/babylonjs@9.27.1/') && process.env.M3C_BABYLON) return route.fulfill({ path: process.env.M3C_BABYLON, contentType: 'text/javascript' });
      if (['media', 'font'].includes(req.resourceType())) return route.abort();
      // Replays never upload telemetry or use evolving server-side training policy.
      if (req.method() === 'POST' || /battle_(policy|learning|log|metrics).*\.php/.test(req.url())) return route.fulfill({ json: {} });
      return route.continue();
    });
    await page.goto(`${url}${url.includes('?') ? '&' : '?'}seed=${encodeURIComponent(seed)}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__battle__ && window.BattleDiagnosticsExport, null, { timeout: 120000 });
    await page.evaluate(({ macro, TRACE, PROFILE_SRC }) => {
      const sim = window.__battle__;
      sim.scene.getEngine().stopRenderLoop(); sim.pause();
      if (window.BattleTelemetry) for (const k of ['record', 'start', 'ensure', 'end', 'checkpoint', 'flush']) BattleTelemetry[k] = () => {};
      // Voice is scheduled on wall-clock time and draws Math.random; silence it so gameplay draws are replayable.
      if (window.BattleVoiceScheduler) BattleVoiceScheduler.enqueue = () => false;
      BattleAIPolicy.setMatchPolicies(sim, BattleAIPolicy.get(), BattleAIPolicy.get());
      sim.trainingMode = true;
      // Page load consumes a wall-clock-dependent number of draws; restart from a fixed stream.
      // UI/telemetry timers run between evaluate chunks on wall-clock time; none belongs to the simulation.
      const lastTimer = setTimeout(() => {}, 0); for (let id = 0; id <= lastTimer; id++) { clearTimeout(id); clearInterval(id); }
      window.__m3cReseed();
      // Any wall-clock read during a step becomes simulation time, so replays depend only on seed + code.
      const perfBase = 1e6, dateBase = Date.UTC(2026, 0, 1);
      window.__m3cRealClocks = [performance.now, Date.now];
      performance.now = () => perfBase + (sim.time || 0) * 1000; Date.now = () => dateBase + (sim.time || 0) * 1000;
      (sim._controlRawRestart || sim.restart.bind(sim))();
      BattleCommanderAI.setMacroEnabled(sim, macro);
      sim.paused = false; sim.timeScale = 1; sim.timeLimit = 600;
      sim.onCallout = sim.onUpdate = sim.onWinner = () => {};
      if (PROFILE_SRC) {
        // The profiler measures real wall time; the simulation keeps its deterministic clocks.
        const realNow = window.__m3cRealClocks[0].bind(performance);
        new Function('root', PROFILE_SRC.replace("var clock=(root.performance&&typeof root.performance.now==='function')?function(){return root.performance.now();}:function(){return Date.now();};", 'var clock=root.__m3cProfileClock;'))(Object.assign(window, { __m3cProfileClock: realNow }));
      }
      const stats = window.__m3cReplay = { trace: TRACE ? [] : null, shots: 0, hits: 0, destinationChanges: 0, sameTickReversals: 0, movementSamples: 0, stationaryRetreatSamples: 0, samples: [], writes: {}, startedAt: performance.now(), commandAccum: 0 };
      sim.onFire = () => stats.shots++;
      sim.onShot = (s, t, hit) => { if (hit) stats.hits++; };
      sim.onSuppressiveShot = () => {};
      const histories = new WeakMap(), resolve = BattleMovementResolver.resolve;
      BattleMovementResolver.resolve = function(s, sim) {
        const before = s.destination && { ...s.destination }, result = resolve.apply(this, arguments), after = s.destination;
        if (before && after && Math.hypot(before.x - after.x, before.z - after.z) > .1) {
          stats.destinationChanges++;
          const last = s._movementResolver?.last, key = `${last?.owner}/${last?.kind}/${last?.reason}`;
          stats.writes[key] = (stats.writes[key] || 0) + 1;
          const prev = histories.get(s);
          if (prev && prev.time === sim.time && Math.hypot(prev.from.x - after.x, prev.from.z - after.z) < .1) stats.sameTickReversals++;
          histories.set(s, { time: sim.time, from: before });
        }
        return result;
      };
    }, { macro, TRACE: !!process.env.M3C_TRACE, PROFILE_SRC: process.env.M3C_PROFILE ? fs.readFileSync(path.join(__dirname, 'battle-hotpath-profiler.cjs'), 'utf8') : null });
    let done = false;const wallStart = Date.now();
    while (!done) {
      const status = await page.evaluate((CHUNK) => {
        const sim = __battle__, st = __m3cReplay, tick = BattleCommanderAI.commandTick || .45;
        for (let i = 0; i < CHUNK && !sim.winner && sim.time < 600; i++) {
          sim._trainerStepActive = true;
          try { sim.step(.15); } finally { sim._trainerStepActive = false; }
          st.commandAccum += .15;
          if (st.trace) { const t = Math.round(sim.time * 100); if (t % 100 === 0) { let h = 0; for (const s of [...sim._roster.us, ...sim._roster.ge]) h = (h * 31 + Math.round(s.root.position.x * 1000) + Math.round(s.root.position.z * 7)) | 0; st.trace.push([+(sim.time.toFixed(2)), window.__m3cDraws, h, sim._rngState ?? null]); } }
          while (st.commandAccum + 1e-9 >= tick && !sim.winner) { st.commandAccum -= tick; BattleCommanderAI.update(sim, sim.scene.metadata.battleScenario, tick); }
        }
        const stationary = [];
        for (const s of [...sim._roster.us, ...sim._roster.ge]) if (!s.dead && s.destination) {
          st.movementSamples++;
          if ((s.state === 'retreat' || s.squad?.state === 'retreat') && !s.moving && Math.hypot(s.root.position.x-s.destination.x, s.root.position.z-s.destination.z) > 2) {
            st.stationaryRetreatSamples++;
            stationary.push({ id:s.id, state:s.state, position:{ x:s.root.position.x,z:s.root.position.z }, destination:s.destination, speed:s.moveSpeed, prone:s.prone, crawling:s.crawling, winner:s._movementResolver?.last, progress:s._movementProgress });
          }
        }
        const squadRows = [];
        for (const f of ['us', 'ge']) for (const q of sim.factions[f].squads) {
          const alive = q.members.filter(m => !m.dead); if (!alive.length) continue;
          const cx = alive.reduce((a, m) => a + m.root.position.x, 0) / alive.length, cz = alive.reduce((a, m) => a + m.root.position.z, 0) / alive.length, m = q._macroMission;
          const obj = q.targetObjective && window.BattleObjectiveSystem ? BattleObjectiveSystem.get(sim, q.targetObjective) : null;
          squadRows.push([q.id, q.state, q.commandPhase, q.targetObjective, obj ? Math.round(Math.hypot(cx - obj.def.x, cz - obj.def.z)) : null, obj ? Math.round(+obj.def.radius || 0) : null, !!q.inContact, q._engagementPlan ? q._engagementPlan.status : null, q.routeIndex + '/' + (q.route || []).length, Math.round(Math.hypot(cx - (q.objective?.x || 0), cz - (q.objective?.z || 0))), m ? m.version + ':' + m.action : null, q._regroupHysteresis?.accepted ? 'RG' : '']);
        }
        st.samples.push({ squads: squadRows, time:sim.time, us:sim.factions.us.alive, ge:sim.factions.ge.alive, captures:sim.objectiveStats?.captures, stationary });
        return { time:sim.time,winner:sim.winner,shots:st.shots,changes:st.destinationChanges };
      }, Number(process.env.M3C_CHUNK || 5000));
      console.log(JSON.stringify(status));
      done = !!status.winner || status.time >= 600;
    }
    const result = await page.evaluate((process_env_dump) => {
      __battle__.pause();
      if (window.__m3cRealClocks) { performance.now = window.__m3cRealClocks[0]; Date.now = window.__m3cRealClocks[1]; }
      // Retreat gate probe: re-evaluate the integrator's inputs for every stationary retreating soldier.
      const sim = __battle__, N = window.BattleNavigation, retreatProbe = [];
      for (const s of [...sim._roster.us, ...sim._roster.ge]) {
        if (s.dead || !s.destination || !(s.state === 'retreat' || s.squad?.state === 'retreat') || s.moving) continue;
        const here = { x: s.root.position.x, z: s.root.position.z }, far = Math.hypot(here.x - s.destination.x, here.z - s.destination.z);
        if (far <= 2) continue;
        const physical = s._physicalPath ? { index: s._physicalPath.index, points: (s._physicalPath.points || []).length, blocked: !!s._physicalPath.blocked, goal: s._physicalPath.goal || null } : null;
        const wp = N && N.nextWaypoint ? N.nextWaypoint(sim, s, s.destination) : null, d = wp ? Math.hypot(wp.x - here.x, wp.z - here.z) : null;
        const dir = wp && d > 1e-6 ? { x: (wp.x - here.x) / d, z: (wp.z - here.z) / d } : null, step = dir ? { x: here.x + dir.x * .3, z: here.z + dir.z * .3 } : null;
        retreatProbe.push({ id: s.id, speed: s.speed, moveSpeed: s.moveSpeed, prone: s.prone, crawling: s.crawling, stopReason: s._movementStopReason ?? null, observedWaypoint: s._movementWaypoint ?? null,
          here, destination: s.destination, destinationClear: N ? N.movementClear(s.destination, s.destination) : null, hereClear: N ? N.movementClear(here, here) : null,
          waypoint: wp, waypointDistance: d, stepClear: step && N ? N.movementClear(here, step) : null, resolveStep: step && N && N.resolveStep ? N.resolveStep(here, step) : null,
          physical, near: (() => { const P = window.BattleNavigationPhysicality; if (!P || !P.footprints) return null; try { return P.footprints(sim).map(fp => ({ id: fp.id, type: fp.type, shape: fp.shape, x: fp.x, z: fp.z, hx: fp.hx, hz: fp.hz, r: fp.radius, d: Math.hypot(fp.x - here.x, fp.z - here.z), inBody: P.shapeContains(here, fp, .45), inRoute: P.shapeContains(here, fp, P.routeMargin) })).filter(f => f.d < 12).sort((a, b) => a.d - b.d).slice(0, 8); } catch (e) { return String(e); } })(),
          fullPlan: (() => { const P = window.BattleNavigationPhysicality; try { const pts = P && P.planPath ? P.planPath(sim, here, s.destination) : null; return pts ? { length: pts.length, first: pts.slice(0, 3) } : null; } catch (e) { return String(e); } })(),
          local: (() => { const P = window.BattleNavigationPhysicality; try { const out = {}; for (const [k, dx, dz] of [['here', 0, 0], ['n1', 1, 0], ['s1', -1, 0], ['e1', 0, 1], ['w1', 0, -1], ['n4', 4, 4]]) { const st = { x: here.x + dx, z: here.z + dz }, r = P.planLocal(sim, st, s.destination); out[k] = { pts: (r.points || []).length, blocked: !!r.blocked, shapes: (r.shapes || []).map(f => f.type + ':' + (f.id ?? '')).slice(0, 6), segGoal: r.segmentGoal, baseClear: N.movementClear(st, r.segmentGoal) }; } return out; } catch (e) { return String(e.stack || e); } })(),
          navCache: s._navCache ? { index: s._navCache.index, length: (s._navCache.path || []).length } : null, replanHold: s._navReplanHold ?? null, time: sim.time });
      }
      let navWorld = null;
      if (retreatProbe.length && process_env_dump) {
        const scn = sim.scene.metadata.battleScenario, fps = sim.obstacles.__physicalFootprints || [];
        navWorld = { scenario: { buildings: scn.buildings, center: scn.center, radius: scn.radius, id: scn.id }, footprints: fps, physicalVersion: sim.obstacles.__physicalVersion || 0, soldiers: retreatProbe.map(p => ({ id: p.id, here: p.here, destination: p.destination })) };
      }
      const profile = window.BattleHotpathProfiler ? BattleHotpathProfiler.snapshot(60) : null;
      return { stats:{ ...__m3cReplay, retreatProbe, navWorld, profile }, diagnostic:BattleDiagnosticsExport.build(__battle__) };
    }, !!process.env.M3C_DUMP_NAV);
    result.stats.wallSeconds = (Date.now() - wallStart) / 1000;
    result.seed = seed; result.macro = macro; result.errors = errors;
    fs.mkdirSync(path.dirname(output), { recursive:true }); fs.writeFileSync(output, JSON.stringify(result, null, 2));
    await page.evaluate(() => __battle__.scene.render());
    await page.screenshot({ path:output.replace(/\.json$/, '.png') });
    console.log('REPLAY_RESULT', JSON.stringify({ output, errors, stats:{ ...result.stats,samples:result.stats.samples.length,writes:undefined }, battle:result.diagnostic.battle }));
    if (errors.length) process.exitCode = 1;
  } finally { await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]); }
})().catch(e => { console.error(e);process.exitCode=1; }).finally(() => process.exit());

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.BATTLE_PROFILE_URL || process.env.BATTLE_BENCHMARK_URL || 'http://127.0.0.1:8765/grasstex/battle_sim_local.php';
const seed = String(process.env.BATTLE_PROFILE_SEED || 'profile-battle');
const battleType = String(process.env.BATTLE_PROFILE_TYPE || 'meeting');
const fixedDt = Math.max(0.05, Math.min(0.3, Number.parseFloat(process.env.BATTLE_PROFILE_STEP || '0.15') || 0.15));
const simSeconds = Math.max(15, Math.min(600, Number.parseFloat(process.env.BATTLE_PROFILE_SECONDS || '120') || 120));
const snapshotSeconds = Math.max(10, Math.min(simSeconds, Number.parseFloat(process.env.BATTLE_PROFILE_SNAPSHOT_SECONDS || '30') || 30));
/* 'page' loads the exact seed through the page URL (historical profiler behavior). 'benchmark'
   mirrors scripts/run_battle_benchmark.mjs: bootstrap page seed, then BattleTownObjectives.regenerate
   with benchmark metadata. Used to explain profiler/benchmark wall-time disagreement on one seed. */
const setupMode = process.env.BATTLE_PROFILE_SETUP === 'benchmark' ? 'benchmark' : 'page';
const wallBudgetSeconds = Math.max(0, Number.parseFloat(process.env.BATTLE_PROFILE_WALL_BUDGET || '0') || 0);
const outputDir = path.resolve(process.env.BATTLE_PROFILE_OUTPUT || 'reports/profile');
const policyUrl = process.env.BATTLE_BENCHMARK_POLICY_URL || 'https://test.ivandpopov.com/grasstex/battle_policy.php';
const commit = process.env.BATTLE_BENCHMARK_SOURCE_SHA || process.env.GITHUB_SHA || 'local';
fs.mkdirSync(outputDir, { recursive: true });

async function getLivePolicy() {
  try {
    const response = await fetch(policyUrl, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json?.genome) return { source: 'live-policy-endpoint', revision: Number(json.revision || 0), genome: json.genome };
    return { source: 'runtime-default', revision: Number(json?.revision || 0), genome: null, warning: 'Policy endpoint returned no genome.' };
  } catch (error) {
    return { source: 'runtime-default', revision: 0, genome: null, warning: `Live policy fetch failed: ${error?.message || error}` };
  }
}

const policy = await getLivePolicy();
const browserErrors = [], browserWarnings = [];
const startedWall = Date.now();
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(120_000);
  page.on('pageerror', error => browserErrors.push(String(error?.stack || error)));
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') browserErrors.push(text);
    else if (msg.type() === 'warning') browserWarnings.push(text);
  });
  await page.route('**/*', async route => {
    const type = route.request().resourceType();
    if (type === 'media' || type === 'font') return route.abort();
    return route.continue();
  });

  const pageSeed = setupMode === 'benchmark' ? `${seed.replace(/-\d{4}$/, '')}-bootstrap` : seed;
  const pageUrl = `${url}${url.includes('?') ? '&' : '?'}seed=${encodeURIComponent(pageSeed)}`;
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !!(
    window.__battle__ && window.BattleCommanderAI && window.BattleTownObjectives &&
    window.BattleAIPolicy && window.BattleObjectiveSystem && window.BattleModules
  ), null, { timeout: 120_000 });
  await page.addScriptTag({ path: path.resolve('scripts/battle-hotpath-profiler.cjs') });

  const result = await page.evaluate(async ({ fixedDt, simSeconds, snapshotSeconds, suppliedPolicy, setupMode, seed, wallBudgetSeconds }) => {
    const root = window, sim = root.__battle__, engine = sim.scene?.getEngine?.(), renderLoop = root.__battleRenderLoop__;
    if (engine && renderLoop) engine.stopRenderLoop(renderLoop);
    sim.pause();

    const telemetry = root.BattleTelemetry || null;
    if (telemetry?.end) { try { await telemetry.end(sim, 'benchmark-profile-start'); } catch (_) {} }
    if (telemetry) {
      telemetry.record = function(){}; telemetry.start = function(){}; telemetry.ensure = function(){};
      telemetry.end = async function(){ return true; }; telemetry.checkpoint = async function(){ return true; }; telemetry.flush = async function(){ return true; };
    }

    function scenarioInfo(sc) {
      if (!sc) return null;
      return { id: sc.id || null, seed: sc.seed || null, fingerprint: sc.fingerprint || null, buildings: (sc.buildings || []).length, objectives: (sc.objectives || []).length, roads: (sc.roads || []).length, map: sc.map || null };
    }
    const pageScenario = scenarioInfo(sim.scene?.metadata?.battleScenario);
    const baseline = suppliedPolicy?.genome || root.BattleAIPolicy.get();
    const rawRestart = sim._controlRawRestart || sim.restart.bind(sim);
    let commandScenario = null;
    if (setupMode === 'benchmark') {
      sim.onFire = sim.onShot = sim.onSuppressiveShot = sim.onCallout = sim.onUpdate = sim.onWinner = function(){};
      commandScenario = root.BattleTownObjectives.regenerate(sim.scene, sim.heightAt, seed, { benchmark: true, benchmarkIndex: 0 }, sim);
    }
    root.BattleAIPolicy.setMatchPolicies(sim, baseline, baseline);
    sim.trainingMode = true;
    root.BattleSoldierModel?.setImportedEnabled?.(sim.scene, false);
    rawRestart();
    sim.manualEnded = false; sim.winner = null; sim.winReason = null; sim.paused = false; sim.timeScale = 1; sim.timeLimit = simSeconds;

    const N = root.BattleNavigation, metaScenario = sim.scene?.metadata?.battleScenario || null;
    const setup = {
      mode: setupMode, pageScenario, battleScenario: scenarioInfo(metaScenario), commandScenario: scenarioInfo(commandScenario),
      navScenarioMatchesBattle: !!(N && N.scenario && N.scenario === metaScenario),
      navWalls: N?.walls?.length ?? null, obstacles: (sim.obstacles || []).length,
      physicalFootprints: Array.isArray(sim.obstacles?.__physicalFootprints) ? sim.obstacles.__physicalFootprints.length : null,
      sceneMeshes: sim.scene?.meshes?.length ?? null,
      roster: { us: (sim._roster?.us || []).length, ge: (sim._roster?.ge || []).length }
    };
    const profiler = root.BattleHotpathProfiler;
    if (!profiler) throw new Error('BattleHotpathProfiler did not load');
    profiler.reset();
    const commandTick = +root.BattleCommanderAI.commandTick || 0.45;
    const maxSteps = Math.ceil((simSeconds + 2) / fixedDt);
    const snapshots = [];
    let commandAccum = 0, steps = 0, nextSnapshot = snapshotSeconds, wallBudgetReached = false;
    const wallStart = performance.now();

    function slimState() {
      return {
        simTime: +(+sim.time || 0).toFixed(2),
        winner: sim.winner || null,
        winReason: sim.winReason || null,
        usAlive: +(sim.factions?.us?.alive || 0), geAlive: +(sim.factions?.ge?.alive || 0),
        personalSpace: sim._personalSpaceSummary || sim._personalSpaceStats || null,
        tacticalPositions: sim._tacticalPositionSummary || null,
        combatMobility: sim._combatMobilityStats || null,
        squadCommand: sim._squadCommandStats || null,
        navigation: navigationState()
      };
    }
    /* Observational only: classify live soldiers' physical route state so blocked/no-path retries
       can be separated from arrived soldiers whose empty queue simply times out. */
    function navigationState() {
      const out = { soldiers: 0, withPath: 0, emptyQueue: 0, blocked: 0, arrived: 0, emptyNotArrived: 0, detours: 0, stationaryWithDestination: 0 };
      for (const f of ['us', 'ge']) for (const s of sim._roster?.[f] || []) {
        if (!s || s.dead || !s.root) continue; out.soldiers++;
        const c = s._physicalPath, p = s.root.position;
        if (s.destination && (+s.moveSpeed || 0) < 0.35 && Math.hypot(p.x - s.destination.x, p.z - s.destination.z) > 8) out.stationaryWithDestination++;
        if (s._fieldDetour) out.detours++;
        if (!c) continue; out.withPath++;
        if (c.blocked) out.blocked++;
        if (!c.points || !c.points.length) {
          out.emptyQueue++;
          if (c.standGoal && Math.hypot(p.x - c.standGoal.x, p.z - c.standGoal.z) <= 0.9) out.arrived++; else out.emptyNotArrived++;
        }
      }
      return out;
    }

    while (!sim.winner && sim.time < simSeconds + 0.5 && steps < maxSteps) {
      sim._trainerStepActive = true;
      try { sim.step ? sim.step(fixedDt) : sim._frame(fixedDt); }
      finally { sim._trainerStepActive = false; }
      steps++; commandAccum += fixedDt;
      while (commandAccum + 1e-9 >= commandTick && !sim.winner) {
        commandAccum -= commandTick;
        root.BattleCommanderAI.update(sim, commandScenario || root.__scenario__ || sim.scene?.metadata?.battleScenario || null, commandTick);
      }
      if (sim.time + 1e-9 >= nextSnapshot) {
        snapshots.push({ state: slimState(), wallSeconds: +((performance.now() - wallStart) / 1000).toFixed(3), profile: profiler.snapshot(40) });
        nextSnapshot += snapshotSeconds;
      }
      if (wallBudgetSeconds > 0 && steps % 20 === 0 && (performance.now() - wallStart) / 1000 >= wallBudgetSeconds) { wallBudgetReached = true; break; }
    }
    if (!sim.winner && sim._checkWinner) sim._checkWinner();
    const finalState = slimState(), profile = profiler.snapshot(80), wallSeconds = (performance.now() - wallStart) / 1000;
    return {
      build: root.BATTLE_BUILD || null,
      policyRevision: suppliedPolicy?.revision || root.BattleAIPolicy.revision || 0,
      simulatedSeconds: +(+sim.time || 0).toFixed(2), steps,
      wallSeconds: +wallSeconds.toFixed(3), realtimeMultiplier: wallSeconds > 0 ? +((+sim.time || 0) / wallSeconds).toFixed(2) : 0,
      finalState, profile, snapshots, setup, wallBudgetReached
    };
  }, { fixedDt, simSeconds, snapshotSeconds, suppliedPolicy: policy, setupMode, seed, wallBudgetSeconds });

  const report = {
    generatedAt: new Date().toISOString(), commit, build: result.build, battleType, seed,
    url, fixedDt, requestedSimSeconds: simSeconds, snapshotSeconds,
    policy: { source: policy.source, revision: result.policyRevision, warning: policy.warning || null },
    wallSeconds: result.wallSeconds, simulatedSeconds: result.simulatedSeconds, realtimeMultiplier: result.realtimeMultiplier,
    setupMode, pageSeed, setup: result.setup, wallBudgetSeconds, wallBudgetReached: result.wallBudgetReached,
    steps: result.steps, finalState: result.finalState, profile: result.profile, snapshots: result.snapshots,
    browserErrors, browserWarnings, harnessWallSeconds: +((Date.now() - startedWall) / 1000).toFixed(2)
  };
  fs.writeFileSync(path.join(outputDir, 'battle-hotpath-profile.json'), JSON.stringify(report, null, 2) + '\n');

  const top = (result.profile?.rows || []).slice(0, 25);
  const md = [
    '# Battle Sim hot-path profile', '',
    `- Commit: \`${commit}\``,
    `- Build: \`${result.build || 'unknown'}\``,
    `- Scenario: **${battleType}** · seed \`${seed}\` · setup **${setupMode}** (page seed \`${pageSeed}\`)`,
    `- Battle scenario: \`${JSON.stringify(result.setup?.battleScenario)}\` · nav matches battle: **${result.setup?.navScenarioMatchesBattle}** · obstacles ${result.setup?.obstacles} · footprints ${result.setup?.physicalFootprints}`,
    `- Wall budget: ${wallBudgetSeconds || 'none'}${result.wallBudgetReached ? ' · **reached (partial)**' : ''}`,
    `- Simulated: **${result.simulatedSeconds}s** in **${result.wallSeconds}s wall** (${result.realtimeMultiplier}× real-time)`,
    `- Fixed step: **${fixedDt}s** · snapshots every **${snapshotSeconds}s simulated**`,
    `- Policy: ${policy.source}, revision ${result.policyRevision}${policy.warning ? ` · ${policy.warning}` : ''}`, '',
    '## Inclusive hot paths', '',
    '| Rank | Path | Calls | Inclusive ms | Wall % | Avg µs | Max ms |',
    '|---:|---|---:|---:|---:|---:|---:|',
    ...top.map((r, i) => `| ${i + 1} | ${r.label} | ${r.calls} | ${r.totalMs} | ${r.wallPct}% | ${r.avgUs} | ${r.maxMs} |`), '',
    '> Times are inclusive. Nested rows can overlap, so percentages are diagnostic and do not sum to 100%.', ''
  ];
  fs.writeFileSync(path.join(outputDir, 'battle-hotpath-profile.md'), md.join('\n'));
  console.log(`PROFILE_SUMMARY ${JSON.stringify({ seed, battleType, wallSeconds: result.wallSeconds, simulatedSeconds: result.simulatedSeconds, realtimeMultiplier: result.realtimeMultiplier, top: top.slice(0, 12) })}`);
  console.log(md.join('\n'));
} finally {
  await browser.close();
}
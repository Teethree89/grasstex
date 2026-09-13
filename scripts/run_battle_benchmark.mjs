import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const count = Math.max(1, Number.parseInt(process.env.BATTLE_BENCHMARK_COUNT || '100', 10) || 100);
const seedPrefix = String(process.env.BATTLE_BENCHMARK_SEED || `benchmark-${(process.env.GITHUB_SHA || 'local').slice(0, 12)}`);
const url = process.env.BATTLE_BENCHMARK_URL || 'http://127.0.0.1:8765/grasstex/battle_sim_local.php';
const timeLimit = Math.max(60, Number.parseFloat(process.env.BATTLE_BENCHMARK_TIME_LIMIT || '600') || 600);
const fixedDt = Math.max(0.05, Math.min(0.3, Number.parseFloat(process.env.BATTLE_BENCHMARK_STEP || '0.15') || 0.15));
const outputDir = path.resolve(process.env.BATTLE_BENCHMARK_OUTPUT || 'reports');
const policyUrl = process.env.BATTLE_BENCHMARK_POLICY_URL || 'https://test.ivandpopov.com/grasstex/battle_policy.php';
const commit = process.env.GITHUB_SHA || 'local';

fs.mkdirSync(outputDir, { recursive: true });

function pct(n, d) { return d ? `${(100 * n / d).toFixed(1)}%` : '0.0%'; }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function quantile(values, q) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const p = (a.length - 1) * q;
  const lo = Math.floor(p), hi = Math.ceil(p);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (p - lo);
}
function csv(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

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
const browserErrors = [];
const browserWarnings = [];
const startedWall = Date.now();
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

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

  const pageUrl = `${url}${url.includes('?') ? '&' : '?'}seed=${encodeURIComponent(seedPrefix + '-bootstrap')}`;
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !!(
    window.__battle__ && window.BattleCommanderAI && window.BattleTownObjectives &&
    window.BattleAIPolicy && window.BattleObjectiveSystem && window.BattleModules
  ), null, { timeout: 120_000 });

  const result = await page.evaluate(async ({ count, seedPrefix, fixedDt, timeLimit, suppliedPolicy }) => {
    const root = window;
    const sim = root.__battle__;
    const engine = sim.scene && sim.scene.getEngine && sim.scene.getEngine();
    const renderLoop = root.__battleRenderLoop__;
    if (engine && renderLoop) engine.stopRenderLoop(renderLoop);
    sim.pause();

    const baseline = suppliedPolicy?.genome || root.BattleAIPolicy.get();
    const rawRestart = sim._controlRawRestart || sim.restart.bind(sim);
    const saved = {
      onFire: sim.onFire, onShot: sim.onShot, onSuppressiveShot: sim.onSuppressiveShot,
      onCallout: sim.onCallout, onUpdate: sim.onUpdate, onWinner: sim.onWinner,
      timeScale: sim.timeScale, timeLimit: sim.timeLimit, paused: sim.paused
    };
    const originalScenario = sim.scene.metadata && (sim.scene.metadata.battleScenario || sim.scene.metadata.battleTown);
    const originalSeed = originalScenario && originalScenario.seed;
    const telemetry = root.BattleTelemetry || null;
    if (telemetry?.end) { try { await telemetry.end(sim, 'benchmark-start'); } catch (_) {} }
    const telemetrySaved = telemetry ? {
      record: telemetry.record, start: telemetry.start, ensure: telemetry.ensure, end: telemetry.end,
      checkpoint: telemetry.checkpoint, flush: telemetry.flush
    } : null;
    const telemetryConsole = telemetry?.setConsoleLogging ? telemetry.setConsoleLogging(false) : null;
    if (telemetry) {
      telemetry.record = function(){}; telemetry.start = function(){}; telemetry.ensure = function(){};
      telemetry.end = async function(){ return true; }; telemetry.checkpoint = async function(){ return true; }; telemetry.flush = async function(){ return true; };
    }
    sim.onFire = sim.onShot = sim.onSuppressiveShot = sim.onCallout = sim.onUpdate = sim.onWinner = function(){};

    function units(faction) {
      const all = root.BattleModules.unitsFor(sim);
      return all.filter(u => u && u.faction === faction && !u.dead && u.countsForElimination !== false);
    }
    function forceValue(faction) {
      let total = 0;
      for (const u of units(faction)) total += u.scoreValue == null ? 1 : +u.scoreValue;
      return total;
    }
    function avgSquad(sq) {
      const alive = (sq?.members || []).filter(s => s && !s.dead && s.root);
      if (!alive.length) return null;
      let x = 0, z = 0;
      for (const s of alive) { x += +s.root.position.x || 0; z += +s.root.position.z || 0; }
      return { x: x / alive.length, z: z / alive.length };
    }
    function distance(a, b) {
      if (!a || !b) return Infinity;
      return Math.hypot((+a.x || 0) - (+b.x || 0), (+a.z || 0) - (+b.z || 0));
    }
    function objectiveStatus(obj) {
      try { return root.BattleObjectiveSystem.status(sim, obj.id) || obj.state || {}; }
      catch (_) { return obj.state || {}; }
    }
    function objectivePoint(obj) {
      const d = obj?.def || obj || {};
      return { x: +d.x || 0, z: +d.z || 0 };
    }
    function objectiveSignature() {
      return (sim._objectives || []).map(o => {
        const s = objectiveStatus(o);
        return `${o.id}:${s.owner || 'neutral'}:${s.active || '-'}:${Math.round(+s.progress || 0)}`;
      }).join('|');
    }
    function phaseAllowsAdvance(phase) {
      return ['approach', 'assault', 'capture', 'clear-town', 'flank', 'contact', 'corner-check'].includes(String(phase || ''));
    }
    function sampleDiagnostics(state) {
      const now = +sim.time || 0;
      const sig = objectiveSignature();
      if (sig !== state.lastObjectiveSig) {
        state.maxNoObjectiveProgress = Math.max(state.maxNoObjectiveProgress, now - state.lastObjectiveChangeAt);
        state.lastObjectiveChangeAt = now;
        state.lastObjectiveSig = sig;
      }

      for (const faction of ['us', 'ge']) {
        const squads = sim.factions?.[faction]?.squads || [];
        for (const sq of squads) {
          if (!sq || sq.state === 'retreat') continue;
          const key = `${faction}:${sq.id}`;
          const p = avgSquad(sq);
          const targetId = sq.targetObjective;
          const obj = targetId && root.BattleObjectiveSystem.get(sim, targetId);
          if (p && obj) {
            const st = objectiveStatus(obj), op = objectivePoint(obj), radius = +(obj.def?.radius || st.radius || 20);
            const enemyOwned = st.owner && st.owner !== 'neutral' && st.owner !== faction;
            const ownerPresence = +(st[st.owner] || st.weights?.[st.owner] || 0);
            const vacantOwner = st.vacantOwner === true || (enemyOwned && ownerPresence <= 0);
            const d = distance(p, op);
            if (enemyOwned && vacantOwner && d > radius * 1.08 && !sq.inContact) {
              state.vacantAssignmentSamples++;
              const prior = state.vacantTrack[key];
              if (!prior || prior.objective !== targetId) {
                state.vacantTrack[key] = { objective: targetId, bestDistance: d, lastProgress: now, reported: false };
              } else {
                if (d < prior.bestDistance - 2) { prior.bestDistance = d; prior.lastProgress = now; }
                if (!prior.reported && now - prior.lastProgress >= 15) {
                  prior.reported = true;
                  state.vacantObjectiveStalls.push({ faction, squad: sq.id, objective: targetId, at: +now.toFixed(1), distance: +d.toFixed(1), phase: sq.commandPhase || null });
                }
              }
            } else {
              delete state.vacantTrack[key];
            }
          }
        }

        for (const s of units(faction)) {
          if (!s.root || !s.destination || s.target || !phaseAllowsAdvance(s.squad?.commandPhase)) continue;
          const d = distance(s.root.position, s.destination);
          const key = `${faction}:${s.id}`;
          if (d < 8) { delete state.unitTrack[key]; continue; }
          const p = { x: +s.root.position.x || 0, z: +s.root.position.z || 0 };
          const prior = state.unitTrack[key];
          if (!prior) {
            state.unitTrack[key] = { x: p.x, z: p.z, lastMovedAt: now, reported: false };
            continue;
          }
          if (Math.hypot(p.x - prior.x, p.z - prior.z) >= 1.5) {
            prior.x = p.x; prior.z = p.z; prior.lastMovedAt = now; prior.reported = false;
          } else if (!prior.reported && now - prior.lastMovedAt >= 12 && (+s.moveSpeed || 0) < 0.35) {
            prior.reported = true;
            state.movementStalls.push({ faction, soldier: s.id, squad: s.squad?.id || null, at: +now.toFixed(1), destinationDistance: +d.toFixed(1), phase: s.squad?.commandPhase || null });
          }
        }
      }
    }
    function cleanup() {
      sim.paused = true;
      for (const faction of ['us', 'ge']) {
        const roster = sim._roster?.[faction] || [];
        for (const u of roster) {
          try { if (root.BattleNavigation) (root.BattleNavigation.releaseFiringPosition || root.BattleNavigation.releaseWindow)?.(u); } catch (_) {}
          u._navCache = null; u.target = null;
          try { if (u.root && (!u.root.isDisposed || !u.root.isDisposed())) u.root.dispose(); } catch (_) { try { u.root?.dispose(); } catch (__) {} }
        }
      }
      sim._roster = { us: [], ge: [] };
      sim._moduleUnits = [];
      sim.factions = { us: { alive: 0, kills: 0, squads: [] }, ge: { alive: 0, kills: 0, squads: [] } };
      sim.obstacles = [];
      sim.objectives = [];
      sim._objectives = [];
      sim.objectiveControl = null;
      sim.objectiveStats = null;
      sim.objectiveHold = null;
      sim._aiAccum = 0;
      sim._commandAccum = 0;
      try { root.BattleTownObjectives.releaseCurrent(sim.scene); } catch (_) {}
      try { if (engine?.wipeCaches) engine.wipeCaches(true); } catch (_) {}
    }

    const battles = [];
    const commandTick = +root.BattleCommanderAI.commandTick || 0.45;
    const maxSteps = Math.ceil((timeLimit + 2) / fixedDt);
    try {
      for (let index = 0; index < count; index++) {
        const seed = `${seedPrefix}-${String(index + 1).padStart(4, '0')}`;
        const scenario = root.BattleTownObjectives.regenerate(sim.scene, sim.heightAt, seed, { benchmark: true, benchmarkIndex: index }, sim);
        root.BattleAIPolicy.setMatchPolicies(sim, baseline, baseline);
        sim.trainingMode = true;
        if (root.BattleSoldierModel?.setImportedEnabled) root.BattleSoldierModel.setImportedEnabled(sim.scene, false);
        rawRestart();
        sim.manualEnded = false;
        sim.winner = null;
        sim.winReason = null;
        sim.paused = false;
        sim.timeScale = 1;
        sim.timeLimit = timeLimit;

        let commandAccum = 0, steps = 0, nextSample = 0;
        const diag = {
          lastObjectiveSig: objectiveSignature(), lastObjectiveChangeAt: 0, maxNoObjectiveProgress: 0,
          vacantTrack: Object.create(null), unitTrack: Object.create(null), vacantAssignmentSamples: 0,
          vacantObjectiveStalls: [], movementStalls: []
        };
        const wallStart = performance.now();
        while (!sim.winner && sim.time < timeLimit + 0.5 && steps < maxSteps) {
          sim._trainerStepActive = true;
          try { sim.step ? sim.step(fixedDt) : sim._frame(fixedDt); }
          finally { sim._trainerStepActive = false; }
          steps++;
          commandAccum += fixedDt;
          while (commandAccum + 1e-9 >= commandTick && !sim.winner) {
            commandAccum -= commandTick;
            root.BattleCommanderAI.update(sim, scenario, commandTick);
          }
          if (sim.time + 1e-9 >= nextSample) { sampleDiagnostics(diag); nextSample += 5; }
        }
        if (!sim.winner && sim._checkWinner) sim._checkWinner();
        diag.maxNoObjectiveProgress = Math.max(diag.maxNoObjectiveProgress, (+sim.time || 0) - diag.lastObjectiveChangeAt);

        const control = sim.objectiveControl || {};
        const counts = control.counts || { us: control.us || 0, ge: control.ge || 0 };
        const stats = sim.objectiveStats || {};
        const objectiveStates = (sim._objectives || []).map(o => {
          const st = objectiveStatus(o);
          return { id: o.id, owner: st.owner || 'neutral', active: st.active || null, vacantOwner: !!st.vacantOwner, us: +(st.us || st.weights?.us || 0), ge: +(st.ge || st.weights?.ge || 0) };
        });
        const recovery = sim._objectiveRecovery || {};
        const record = {
          index: index + 1,
          seed,
          scenarioId: scenario?.id || null,
          fingerprint: scenario?.fingerprint || null,
          winner: sim.winner || 'none',
          winReason: sim.winReason || null,
          simulatedSeconds: +(+sim.time || 0).toFixed(2),
          wallSeconds: +((performance.now() - wallStart) / 1000).toFixed(3),
          steps,
          usAlive: units('us').length,
          geAlive: units('ge').length,
          usForceValue: +forceValue('us').toFixed(2),
          geForceValue: +forceValue('ge').toFixed(2),
          usKills: +(sim.factions?.us?.kills || 0),
          geKills: +(sim.factions?.ge?.kills || 0),
          usObjectives: +(counts.us || 0),
          geObjectives: +(counts.ge || 0),
          captures: +(stats.captures || 0),
          neutralizations: +(stats.neutralizations || 0),
          capturesByFaction: stats.capturesByFaction || {},
          maxNoObjectiveProgressSeconds: +diag.maxNoObjectiveProgress.toFixed(1),
          vacantAssignmentSamples: diag.vacantAssignmentSamples,
          vacantObjectiveStalls: diag.vacantObjectiveStalls,
          movementStalls: diag.movementStalls,
          objectiveRecovery: { us: +(recovery.us?.count || 0), ge: +(recovery.ge?.count || 0) },
          finalObjectives: objectiveStates
        };
        battles.push(record);
        console.log(`[BENCH] ${index + 1}/${count} ${seed} winner=${record.winner} t=${record.simulatedSeconds}s captures=${record.captures} vacantStalls=${record.vacantObjectiveStalls.length} moveStalls=${record.movementStalls.length} wall=${record.wallSeconds}s`);
        cleanup();
        if ((index + 1) % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      root.BattleAIPolicy.clearMatchPolicies(sim);
      cleanup();
      if (originalSeed) root.BattleTownObjectives.regenerate(sim.scene, sim.heightAt, originalSeed, { restoredAfterBenchmark: true }, sim);
      sim.trainingMode = false;
      if (root.BattleSoldierModel?.setImportedEnabled) root.BattleSoldierModel.setImportedEnabled(sim.scene, true);
      rawRestart();
      sim.timeScale = saved.timeScale;
      sim.timeLimit = saved.timeLimit;
      sim.onFire = saved.onFire; sim.onShot = saved.onShot; sim.onSuppressiveShot = saved.onSuppressiveShot;
      sim.onCallout = saved.onCallout; sim.onUpdate = saved.onUpdate; sim.onWinner = saved.onWinner;
      sim.paused = true;
      if (telemetry && telemetrySaved) {
        telemetry.record = telemetrySaved.record; telemetry.start = telemetrySaved.start; telemetry.ensure = telemetrySaved.ensure;
        telemetry.end = telemetrySaved.end; telemetry.checkpoint = telemetrySaved.checkpoint; telemetry.flush = telemetrySaved.flush;
      }
      if (telemetryConsole !== null && telemetry?.setConsoleLogging) telemetry.setConsoleLogging(telemetryConsole);
    }

    return {
      build: root.BATTLE_BUILD || null,
      policyRevision: suppliedPolicy?.revision || root.BattleAIPolicy.revision || 0,
      policySource: suppliedPolicy?.source || 'runtime-default',
      fixedDt, timeLimit, battles
    };
  }, { count, seedPrefix, fixedDt, timeLimit, suppliedPolicy: policy });

  const wallSeconds = (Date.now() - startedWall) / 1000;
  const battles = result.battles || [];
  const winners = { us: 0, ge: 0, draw: 0, none: 0 };
  for (const b of battles) winners[b.winner] = (winners[b.winner] || 0) + 1;
  const durations = battles.map(b => b.simulatedSeconds);
  const wallDurations = battles.map(b => b.wallSeconds);
  const captures = battles.map(b => b.captures);
  const noCapture = battles.filter(b => b.captures === 0).length;
  const vacantStallBattles = battles.filter(b => b.vacantObjectiveStalls?.length).length;
  const movementStallBattles = battles.filter(b => b.movementStalls?.length).length;
  const vacantStalls = battles.reduce((n, b) => n + (b.vacantObjectiveStalls?.length || 0), 0);
  const movementStalls = battles.reduce((n, b) => n + (b.movementStalls?.length || 0), 0);
  const simulatedTotal = durations.reduce((a, b) => a + b, 0);
  const problematic = [...battles].sort((a, b) => {
    const score = x => (x.vacantObjectiveStalls?.length || 0) * 1000 + (x.movementStalls?.length || 0) * 100 + (x.captures === 0 ? 20 : 0) + x.maxNoObjectiveProgressSeconds;
    return score(b) - score(a);
  }).slice(0, 15);

  const summary = {
    generatedAt: new Date().toISOString(),
    commit,
    build: result.build,
    policySource: result.policySource,
    policyRevision: result.policyRevision,
    policyWarning: policy.warning || null,
    requestedBattles: count,
    completedBattles: battles.length,
    seedPrefix,
    fixedDt,
    timeLimit,
    wallSeconds: +wallSeconds.toFixed(2),
    simulatedSeconds: +simulatedTotal.toFixed(2),
    realtimeMultiplier: wallSeconds > 0 ? +(simulatedTotal / wallSeconds).toFixed(1) : 0,
    battlesPerMinute: wallSeconds > 0 ? +(battles.length / wallSeconds * 60).toFixed(2) : 0,
    winners,
    usWinRate: pct(winners.us || 0, battles.length),
    geWinRate: pct(winners.ge || 0, battles.length),
    drawRate: pct((winners.draw || 0) + (winners.none || 0), battles.length),
    avgBattleSeconds: +mean(durations).toFixed(2),
    p50BattleSeconds: +quantile(durations, 0.5).toFixed(2),
    p95BattleSeconds: +quantile(durations, 0.95).toFixed(2),
    avgWallSecondsPerBattle: +mean(wallDurations).toFixed(3),
    avgCaptures: +mean(captures).toFixed(2),
    noCaptureBattles: noCapture,
    vacantObjectiveStalls: vacantStalls,
    vacantObjectiveStallBattles: vacantStallBattles,
    movementStalls,
    movementStallBattles,
    maxNoObjectiveProgressSeconds: +Math.max(0, ...battles.map(b => b.maxNoObjectiveProgressSeconds || 0)).toFixed(1),
    browserErrors: browserErrors.length,
    browserWarnings: browserWarnings.length
  };

  const payload = { summary, policy, browserErrors, browserWarnings: browserWarnings.slice(0, 100), battles };
  fs.writeFileSync(path.join(outputDir, 'battle-benchmark.json'), JSON.stringify(payload, null, 2));

  const headers = ['index','seed','winner','winReason','simulatedSeconds','wallSeconds','usAlive','geAlive','usObjectives','geObjectives','captures','neutralizations','maxNoObjectiveProgressSeconds','vacantObjectiveStalls','movementStalls'];
  const csvLines = [headers.join(',')];
  for (const b of battles) csvLines.push(headers.map(h => csv(h === 'vacantObjectiveStalls' || h === 'movementStalls' ? (b[h]?.length || 0) : b[h])).join(','));
  fs.writeFileSync(path.join(outputDir, 'battle-benchmark.csv'), csvLines.join('\n') + '\n');

  const md = [];
  md.push('# 100-battle headless benchmark');
  md.push('');
  md.push(`- Commit: \`${summary.commit}\``);
  md.push(`- Build: \`${summary.build || 'unknown'}\``);
  md.push(`- Policy: ${summary.policySource}, revision ${summary.policyRevision}${summary.policyWarning ? ` — ${summary.policyWarning}` : ''}`);
  md.push(`- Completed: **${summary.completedBattles}/${summary.requestedBattles}** battles in **${summary.wallSeconds}s wall time** (${summary.realtimeMultiplier}× real-time, ${summary.battlesPerMinute} battles/min)`);
  md.push(`- Results: US **${winners.us || 0}** (${summary.usWinRate}), GER **${winners.ge || 0}** (${summary.geWinRate}), draw/none **${(winners.draw || 0) + (winners.none || 0)}** (${summary.drawRate})`);
  md.push(`- Battle duration: avg **${summary.avgBattleSeconds}s**, p50 **${summary.p50BattleSeconds}s**, p95 **${summary.p95BattleSeconds}s**`);
  md.push(`- Captures: avg **${summary.avgCaptures}**, no-capture battles **${summary.noCaptureBattles}**`);
  md.push(`- Vacant enemy-objective stalls: **${summary.vacantObjectiveStalls} events across ${summary.vacantObjectiveStallBattles} battles**`);
  md.push(`- Movement stalls while ordered to advance: **${summary.movementStalls} events across ${summary.movementStallBattles} battles**`);
  md.push(`- Longest interval without objective-state progress: **${summary.maxNoObjectiveProgressSeconds}s**`);
  md.push(`- Browser/runtime errors: **${summary.browserErrors}**; warnings: **${summary.browserWarnings}**`);
  md.push('');
  md.push('## Most problematic runs');
  md.push('');
  md.push('| # | Seed | Winner | Time | Captures | Vacant stalls | Move stalls | Max no-progress |');
  md.push('|---:|---|---|---:|---:|---:|---:|---:|');
  for (const b of problematic) md.push(`| ${b.index} | \`${b.seed}\` | ${b.winner} | ${b.simulatedSeconds}s | ${b.captures} | ${b.vacantObjectiveStalls?.length || 0} | ${b.movementStalls?.length || 0} | ${b.maxNoObjectiveProgressSeconds}s |`);
  if (browserErrors.length) {
    md.push('');
    md.push('## Browser/runtime errors');
    md.push('');
    for (const error of browserErrors.slice(0, 20)) md.push(`- \`${String(error).replaceAll('`', "'")}\``);
  }
  fs.writeFileSync(path.join(outputDir, 'battle-benchmark.md'), md.join('\n') + '\n');

  console.log('BENCHMARK_SUMMARY ' + JSON.stringify(summary));
  console.log(md.join('\n'));
} finally {
  await browser.close();
}

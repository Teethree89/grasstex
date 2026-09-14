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
const commit = process.env.BATTLE_BENCHMARK_SOURCE_SHA || process.env.GITHUB_SHA || 'local';

fs.mkdirSync(outputDir, { recursive: true });

function pct(n, d) { return d ? `${(100 * n / d).toFixed(1)}%` : '0.0%'; }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function quantile(values, q) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y), p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (p - lo);
}
function csv(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function clamp(v, a = 0, b = 100) { return Math.max(a, Math.min(b, v)); }
function sum(battles, fn) { return battles.reduce((n, b) => n + (+fn(b) || 0), 0); }
function rate(n, d) { return d > 0 ? n / d : 0; }
function dedupe(values, limit = 60) { return [...new Set(values.map(String))].slice(0, limit); }
function healthFor(b) {
  const sampleSquads = Math.max(1, +b.squadSamples || 0);
  const ordered = Math.max(1, +b.orderedMoveSamples || 0);
  const shots = Math.max(1, +b.fire?.total || 0);
  const strategic = clamp(100
    - rate(b.targetlessSamples, sampleSquads) * 45
    - Math.min(35, (b.targetlessStalls?.length || 0) * 8)
    - Math.min(30, (+b.strategicWriterConflicts || 0) * 6)
    - Math.min(25, (b.loopAlerts?.length || 0) * 4));
  const movement = clamp(100
    - Math.min(45, (b.routeStalls?.length || 0) * 7)
    - Math.min(35, (b.movementStalls?.length || 0) * 2.2)
    - rate(b.idleOrderedSamples, ordered) * 35);
  const cohesion = clamp(100
    - rate(b.overCohesionSamples, sampleSquads) * 55
    - Math.min(35, (b.longRegroups?.length || 0) * 7));
  const combat = clamp(100
    - rate(+b.losBlockedFireAttempts || 0, shots + (+b.losBlockedFireAttempts || 0)) * 30
    - Math.min(20, rate(+b.fire?.suppressedTargets || 0, shots) * 3));
  const objective = clamp(100
    - Math.min(45, (b.vacantObjectiveStalls?.length || 0) * 10)
    - (b.captures === 0 ? 22 : 0)
    /* An objective nobody ever owned is worse than a slow one: it usually means no squad was ever
       sent there at all, which is the failure mode that left a third of the map neutral. */
    - rate(+b.objectivesNeverOwned || 0, Math.max(1, +b.objectiveCount || 1)) * 40
    - Math.min(35, rate(+b.maxNoObjectiveProgressSeconds || 0, Math.max(1, +b.simulatedSeconds || timeLimit)) * 40));
  const overall = mean([strategic, movement, cohesion, combat, objective]);
  return {
    overall: +overall.toFixed(1), strategic: +strategic.toFixed(1), movement: +movement.toFixed(1),
    cohesion: +cohesion.toFixed(1), combat: +combat.toFixed(1), objective: +objective.toFixed(1)
  };
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

  const pageUrl = `${url}${url.includes('?') ? '&' : '?'}seed=${encodeURIComponent(seedPrefix + '-bootstrap')}`;
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !!(
    window.__battle__ && window.BattleCommanderAI && window.BattleTownObjectives &&
    window.BattleAIPolicy && window.BattleObjectiveSystem && window.BattleModules
  ), null, { timeout: 120_000 });

  await page.addScriptTag({ path: path.resolve('scripts/battle-benchmark-intent.cjs') });
  const result = await page.evaluate(async ({ count, seedPrefix, fixedDt, timeLimit, suppliedPolicy }) => {
    const root = window, sim = root.__battle__, engine = sim.scene?.getEngine?.(), renderLoop = root.__battleRenderLoop__;
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
    const originalSeed = originalScenario?.seed;
    const telemetry = root.BattleTelemetry || null;
    if (telemetry?.end) { try { await telemetry.end(sim, 'benchmark-start'); } catch (_) {} }
    const telemetrySaved = telemetry ? { record: telemetry.record, start: telemetry.start, ensure: telemetry.ensure, end: telemetry.end, checkpoint: telemetry.checkpoint, flush: telemetry.flush } : null;
    const telemetryConsole = telemetry?.setConsoleLogging ? telemetry.setConsoleLogging(false) : null;
    if (telemetry) {
      telemetry.record = function(){}; telemetry.start = function(){}; telemetry.ensure = function(){};
      telemetry.end = async function(){ return true; }; telemetry.checkpoint = async function(){ return true; }; telemetry.flush = async function(){ return true; };
    }

    let activeCombat = null;
    function stanceOf(s) { return String(s?.stance || s?.eng?.stance || 'unknown'); }
    sim.onFire = function(shooter){
      if (!activeCombat) return;
      activeCombat.total++;
      const stance = stanceOf(shooter); activeCombat.byStance[stance] = (activeCombat.byStance[stance] || 0) + 1;
      if (activeCombat.firstFireSeconds == null) activeCombat.firstFireSeconds = +sim.time.toFixed(2);
    };
    sim.onShot = function(shooter, target, hit){
      if (!activeCombat) return;
      activeCombat.direct++; if (hit) activeCombat.hits++;
      const stance = stanceOf(shooter); const key = hit ? 'hitsByStance' : 'missesByStance';
      activeCombat[key][stance] = (activeCombat[key][stance] || 0) + 1;
    };
    sim.onSuppressiveShot = function(shooter, point, count){
      if (!activeCombat) return;
      activeCombat.suppressive++; activeCombat.suppressedTargets += +count || 0;
    };
    sim.onCallout = sim.onUpdate = sim.onWinner = function(){};

    function allUnits() {
      const out = [];
      for (const faction of ['us', 'ge']) for (const u of sim._roster?.[faction] || []) if (u) out.push(u);
      for (const u of sim._moduleUnits || []) if (u && !out.includes(u)) out.push(u);
      return out;
    }
    function units(faction) { return root.BattleModules.unitsFor(sim).filter(u => u && u.faction === faction && !u.dead && u.countsForElimination !== false); }
    function forceValue(faction) { let total = 0; for (const u of units(faction)) total += u.scoreValue == null ? 1 : +u.scoreValue; return total; }
    function aliveMembers(sq) { return (sq?.members || []).filter(s => s && !s.dead && s.root); }
    function avgSquad(sq) {
      const alive = aliveMembers(sq); if (!alive.length) return null;
      let x = 0, z = 0; for (const s of alive) { x += +s.root.position.x || 0; z += +s.root.position.z || 0; }
      return { x: x / alive.length, z: z / alive.length };
    }
    function distance(a, b) { return !a || !b ? Infinity : Math.hypot((+a.x || 0) - (+b.x || 0), (+a.z || 0) - (+b.z || 0)); }
    function objectiveStatus(obj) { try { return root.BattleObjectiveSystem.status(sim, obj.id) || obj.state || {}; } catch (_) { return obj.state || {}; } }
    function objectivePoint(obj) { const d = obj?.def || obj || {}; return { x: +d.x || 0, z: +d.z || 0 }; }
    function objectiveSignature() {
      return (sim._objectives || []).map(o => { const s = objectiveStatus(o); return `${o.id}:${s.owner || 'neutral'}:${s.active || '-'}:${Math.round(+s.progress || 0)}`; }).join('|');
    }
    function phaseAllowsAdvance(phase) { return ['approach','assault','capture','clear-town','flank','contact','corner-check'].includes(String(phase || '')); }
    function captainAlive(sq) { return aliveMembers(sq).some(s => s.role === 'captain'); }
    function cohesionLimit(sq) {
      try { const cfg = root.BattleCommanderAI.policyFor?.(sim, sq.faction); return cfg ? +(captainAlive(sq) ? cfg.cohesionRadius : cfg.captainlessCohesion) : null; }
      catch (_) { return null; }
    }
    function squadSpread(sq, p) {
      if (!p) return null; let best = 0; for (const s of aliveMembers(sq)) best = Math.max(best, distance(s.root.position, p)); return best;
    }
    function engagementState(s) { try { return root.BattleEngagement?.stateOf?.(s) || s.eng || {}; } catch (_) { return s.eng || {}; } }
    function addMap(map, key, n = 1) { key = String(key || 'unknown'); map[key] = (map[key] || 0) + n; }
    function provenanceConflicts() { try { return root.BattleOrderProvenance?.conflicts?.(sim) || []; } catch (_) { return []; } }
    function loopAlerts() { try { return root.BattleAILoopWatch?.alerts?.(sim) || []; } catch (_) { return []; } }
    function coordinationHealth() { try { return root.BattleAICoordinationHealth?.summary?.(sim) || null; } catch (_) { return null; } }
    function movementResolverSummary() {
      const out = { soldiers: 0, changes: 0, orderWins: 0, combatWins: 0, byKind: {} };
      for (const s of allUnits()) {
        const st = s?._movementResolver; if (!st) continue; out.soldiers++;
        out.changes += +st.changes || 0; out.orderWins += +st.orderWins || 0; out.combatWins += +st.combatWins || 0;
        if (st.last?.kind) addMap(out.byKind, st.last.kind);
      }
      return out;
    }
    function losBlockedAttempts() { let n = 0; for (const s of allUnits()) n += +s._losBlockedFire || 0; return n; }

    const SAMPLE_SECONDS = 2.5;
    function sampleDiagnostics(state) {
      const now = +sim.time || 0, sig = objectiveSignature(), stats = sim.objectiveStats || {};
      if (sig !== state.lastObjectiveSig) {
        if (state.firstObjectiveProgressSeconds == null) state.firstObjectiveProgressSeconds = +now.toFixed(1);
        state.maxNoObjectiveProgress = Math.max(state.maxNoObjectiveProgress, now - state.lastObjectiveChangeAt);
        state.lastObjectiveChangeAt = now; state.lastObjectiveSig = sig;
      }
      if (state.firstCaptureSeconds == null && (+stats.captures || 0) > 0) state.firstCaptureSeconds = +now.toFixed(1);

      /* Which objectives anybody ever held or contested. An end-of-battle owner count cannot tell a
         zone that was taken and lost from one nobody ever walked into, and "never contested" is the
         sharper signal: it means no squad was ever sent there at all. */
      for (const o of (sim._objectives || [])) {
        const st = objectiveStatus(o);
        if (st.owner && st.owner !== 'neutral') state.everOwned[o.id] = st.owner;
        if (st.active) state.everContested[o.id] = true;
      }

      for (const faction of ['us', 'ge']) {
        /* How many distinct objectives this side's squads are actually assigned to. Every
           non-reserve route ends at the settlement centre, so squads score objectives from the
           same position: without deconfliction in the doctrine score this collapses to 1 and the
           outer objectives are never assigned to anybody. */
        const assignedTargets = new Set();
        for (const sq of sim.factions?.[faction]?.squads || []) {
          if (!sq) continue;
          if ((sq.aliveCount || 0) > 0 && sq.targetObjective) assignedTargets.add(String(sq.targetObjective));
          const key = `${faction}:${sq.id}`, p = avgSquad(sq), phase = String(sq.commandPhase || 'none');
          state.squadSamples++; addMap(state.phaseSamples, phase);
          if (sq.inContact) { state.inContactSamples++; if (state.firstContactSeconds == null) state.firstContactSeconds = +now.toFixed(1); }
          if (!captainAlive(sq)) state.captainlessSamples++;
          const spread = squadSpread(sq, p), limit = cohesionLimit(sq);
          if (spread != null && limit != null && spread > limit) state.overCohesionSamples++;
          if (sq._stablePlan) state.stablePlanSamples++;
          if (phase === 'regroup') state.regroupSamples++;
          if (phase === 'support-hold' || sq.commandRole === 'support') state.supportHoldSamples++;
          if (sq.state === 'retreat' || phase === 'retreat') state.retreatSamples++;
          const orders = sq._fireteamOrders || {}; let blocked = 0; for (const k of Object.keys(orders)) if (orders[k]?.blocked) blocked++;
          if (blocked) state.blockedFireteamSamples += blocked;

          const relevantTargetless = root.BattleBenchmarkIntent.targetless(sq, p);
          if (relevantTargetless) {
            state.targetlessSamples++;
            const t = state.targetlessTrack[key] || (state.targetlessTrack[key] = { since: now, reported: false });
            if (!t.reported && now - t.since >= 15) { t.reported = true; state.targetlessStalls.push({ faction, squad: sq.id, at: +now.toFixed(1), phase }); }
          } else delete state.targetlessTrack[key];

          if (phase === 'regroup') {
            const t = state.regroupTrack[key] || (state.regroupTrack[key] = { since: now, reported: false });
            if (!t.reported && now - t.since >= 30) { t.reported = true; state.longRegroups.push({ faction, squad: sq.id, at: +now.toFixed(1), seconds: +(now - t.since).toFixed(1) }); }
          } else delete state.regroupTrack[key];

          const route = sq.route || [], routeIndex = Math.max(0, Math.min(route.length - 1, +sq.routeIndex || 0));
          /* An assigned objective supersedes the approach route. Distance from its obsolete
             town-centre waypoint is not evidence that the squad has stalled. */
          if (p && root.BattleBenchmarkIntent.routeActive(sq, p) && phaseAllowsAdvance(phase) && !sq.inContact) {
            const d = distance(p, route[routeIndex]);
            let t = state.routeTrack[key];
            if (!t || t.index !== routeIndex) t = state.routeTrack[key] = { index: routeIndex, bestDistance: d, lastProgress: now, reported: false };
            else if (d < t.bestDistance - 3) { t.bestDistance = d; t.lastProgress = now; t.reported = false; }
            if (!t.reported && d > 12 && now - t.lastProgress >= 20) {
              t.reported = true; state.routeStalls.push({ faction, squad: sq.id, at: +now.toFixed(1), routeIndex, distance: +d.toFixed(1), phase });
            }
          } else delete state.routeTrack[key];

          const targetId = sq.targetObjective, obj = targetId && root.BattleObjectiveSystem.get(sim, targetId);
          if (p && obj) {
            const st = objectiveStatus(obj), op = objectivePoint(obj), radius = +(obj.def?.radius || st.radius || 20);
            const enemyOwned = st.owner && st.owner !== 'neutral' && st.owner !== faction;
            const ownerPresence = +(st[st.owner] || st.weights?.[st.owner] || 0), vacantOwner = st.vacantOwner === true || (enemyOwned && ownerPresence <= 0), d = distance(p, op);
            if (enemyOwned && vacantOwner && d > radius * 1.08 && !sq.inContact) {
              state.vacantAssignmentSamples++;
              const prior = state.vacantTrack[key];
              if (!prior || prior.objective !== targetId) state.vacantTrack[key] = { objective: targetId, bestDistance: d, lastProgress: now, reported: false };
              else {
                if (d < prior.bestDistance - 2) { prior.bestDistance = d; prior.lastProgress = now; }
                if (!prior.reported && now - prior.lastProgress >= 15) {
                  prior.reported = true; state.vacantObjectiveStalls.push({ faction, squad: sq.id, objective: targetId, at: +now.toFixed(1), distance: +d.toFixed(1), phase });
                }
              }
            } else delete state.vacantTrack[key];
          }
        }

        state.spreadSamples[faction].push(assignedTargets.size);

        for (const s of units(faction)) {
          const eng = engagementState(s); addMap(state.engagementStateSamples, eng.state || 'unknown');
          if (!s.root || !s.destination || s.target || !phaseAllowsAdvance(s.squad?.commandPhase)) continue;
          const combatState = ['orient','bound','engage','pinned','assault','station','withdraw','suppress'].includes(String(eng.state || ''));
          if (combatState) continue;
          const d = distance(s.root.position, s.destination), key = `${faction}:${s.id}`;
          if (d < 8) { delete state.unitTrack[key]; continue; }
          state.orderedMoveSamples++;
          if ((+s.moveSpeed || 0) < 0.35) state.idleOrderedSamples++;
          const p = { x: +s.root.position.x || 0, z: +s.root.position.z || 0 }, prior = state.unitTrack[key];
          if (!prior) { state.unitTrack[key] = { x: p.x, z: p.z, lastMovedAt: now, reported: false }; continue; }
          if (Math.hypot(p.x - prior.x, p.z - prior.z) >= 1.5) { prior.x = p.x; prior.z = p.z; prior.lastMovedAt = now; prior.reported = false; }
          else if (!prior.reported && now - prior.lastMovedAt >= 12 && (+s.moveSpeed || 0) < 0.35) {
            prior.reported = true; state.movementStalls.push({ faction, soldier: s.id, squad: s.squad?.id || null, at: +now.toFixed(1), destinationDistance: +d.toFixed(1), phase: s.squad?.commandPhase || null, engagementState: eng.state || null });
          }
        }
      }
    }

    function cleanup() {
      sim.paused = true;
      for (const faction of ['us', 'ge']) for (const u of sim._roster?.[faction] || []) {
        try { root.BattleNavigation && (root.BattleNavigation.releaseFiringPosition || root.BattleNavigation.releaseWindow)?.(u); } catch (_) {}
        u._navCache = null; u.target = null;
        try { if (u.root && (!u.root.isDisposed || !u.root.isDisposed())) u.root.dispose(); } catch (_) { try { u.root?.dispose(); } catch (__) {} }
      }
      sim._roster = { us: [], ge: [] }; sim._moduleUnits = [];
      sim.factions = { us: { alive: 0, kills: 0, squads: [] }, ge: { alive: 0, kills: 0, squads: [] } };
      sim.obstacles = []; sim.objectives = []; sim._objectives = []; sim.objectiveControl = null; sim.objectiveStats = null; sim.objectiveHold = null;
      sim._aiAccum = 0; sim._commandAccum = 0;
      try { root.BattleTownObjectives.releaseCurrent(sim.scene); } catch (_) {}
      try { engine?.wipeCaches?.(true); } catch (_) {}
    }

    const battles = [], commandTick = +root.BattleCommanderAI.commandTick || 0.45, maxSteps = Math.ceil((timeLimit + 2) / fixedDt);
    try {
      for (let index = 0; index < count; index++) {
        const seed = `${seedPrefix}-${String(index + 1).padStart(4, '0')}`;
        const scenario = root.BattleTownObjectives.regenerate(sim.scene, sim.heightAt, seed, { benchmark: true, benchmarkIndex: index }, sim);
        root.BattleAIPolicy.setMatchPolicies(sim, baseline, baseline); sim.trainingMode = true;
        root.BattleSoldierModel?.setImportedEnabled?.(sim.scene, false); rawRestart();
        sim.manualEnded = false; sim.winner = null; sim.winReason = null; sim.paused = false; sim.timeScale = 1; sim.timeLimit = timeLimit;

        activeCombat = { total: 0, direct: 0, hits: 0, suppressive: 0, suppressedTargets: 0, firstFireSeconds: null, byStance: {}, hitsByStance: {}, missesByStance: {} };
        let commandAccum = 0, steps = 0, nextSample = 0;
        const diag = {
          lastObjectiveSig: objectiveSignature(), lastObjectiveChangeAt: 0, maxNoObjectiveProgress: 0,
          firstObjectiveProgressSeconds: null, firstCaptureSeconds: null, firstContactSeconds: null,
          vacantTrack: Object.create(null), unitTrack: Object.create(null), targetlessTrack: Object.create(null), regroupTrack: Object.create(null), routeTrack: Object.create(null),
          vacantAssignmentSamples: 0, squadSamples: 0, targetlessSamples: 0, overCohesionSamples: 0, captainlessSamples: 0, inContactSamples: 0,
          stablePlanSamples: 0, blockedFireteamSamples: 0, regroupSamples: 0, supportHoldSamples: 0, retreatSamples: 0,
          orderedMoveSamples: 0, idleOrderedSamples: 0, phaseSamples: {}, engagementStateSamples: {},
          vacantObjectiveStalls: [], movementStalls: [], routeStalls: [], targetlessStalls: [], longRegroups: [],
          everOwned: Object.create(null), everContested: Object.create(null), spreadSamples: { us: [], ge: [] }
        };
        const wallStart = performance.now();
        while (!sim.winner && sim.time < timeLimit + 0.5 && steps < maxSteps) {
          sim._trainerStepActive = true; try { sim.step ? sim.step(fixedDt) : sim._frame(fixedDt); } finally { sim._trainerStepActive = false; }
          steps++; commandAccum += fixedDt;
          while (commandAccum + 1e-9 >= commandTick && !sim.winner) { commandAccum -= commandTick; root.BattleCommanderAI.update(sim, scenario, commandTick); }
          if (sim.time + 1e-9 >= nextSample) { sampleDiagnostics(diag); nextSample += SAMPLE_SECONDS; }
        }
        if (!sim.winner && sim._checkWinner) sim._checkWinner();
        diag.maxNoObjectiveProgress = Math.max(diag.maxNoObjectiveProgress, (+sim.time || 0) - diag.lastObjectiveChangeAt);

        const control = sim.objectiveControl || {}, counts = control.counts || { us: control.us || 0, ge: control.ge || 0 }, stats = sim.objectiveStats || {};
        const objectiveStates = (sim._objectives || []).map(o => { const st = objectiveStatus(o); return { id: o.id, owner: st.owner || 'neutral', active: st.active || null, vacantOwner: !!st.vacantOwner, us: +(st.us || st.weights?.us || 0), ge: +(st.ge || st.weights?.ge || 0) }; });
        const recovery = sim._objectiveRecovery || {}, conflicts = provenanceConflicts(), loops = loopAlerts();
        const strategicFields = new Set(['commandPhase','targetObjective','objective','orderAnchor','rally']);
        const strategicConflicts = conflicts.filter(c => strategicFields.has(c?.field)).length;
        const loopKinds = {}; for (const a of loops) addMap(loopKinds, a.kind || a.type || 'unknown');
        const objectiveCount = (sim._objectives || []).length, everOwnedIds = Object.keys(diag.everOwned);
        const meanSpread = f => diag.spreadSamples[f].length ? +(diag.spreadSamples[f].reduce((a, b) => a + b, 0) / diag.spreadSamples[f].length).toFixed(2) : 0;
        const record = {
          index: index + 1, seed, scenarioId: scenario?.id || null, fingerprint: scenario?.fingerprint || null,
          winner: sim.winner || 'none', winReason: sim.winReason || null, simulatedSeconds: +(+sim.time || 0).toFixed(2), wallSeconds: +((performance.now() - wallStart) / 1000).toFixed(3), steps,
          timeoutReached: (+sim.time || 0) >= timeLimit - fixedDt,
          usAlive: units('us').length, geAlive: units('ge').length, usForceValue: +forceValue('us').toFixed(2), geForceValue: +forceValue('ge').toFixed(2),
          usKills: +(sim.factions?.us?.kills || 0), geKills: +(sim.factions?.ge?.kills || 0), usObjectives: +(counts.us || 0), geObjectives: +(counts.ge || 0),
          captures: +(stats.captures || 0), neutralizations: +(stats.neutralizations || 0), capturesByFaction: stats.capturesByFaction || {},
          firstContactSeconds: diag.firstContactSeconds, firstFireSeconds: activeCombat.firstFireSeconds, firstObjectiveProgressSeconds: diag.firstObjectiveProgressSeconds, firstCaptureSeconds: diag.firstCaptureSeconds,
          maxNoObjectiveProgressSeconds: +diag.maxNoObjectiveProgress.toFixed(1), vacantAssignmentSamples: diag.vacantAssignmentSamples,
          objectiveCount, objectivesEverOwned: everOwnedIds.length,
          objectivesNeverOwned: Math.max(0, objectiveCount - everOwnedIds.length),
          objectivesNeverContested: Math.max(0, objectiveCount - Object.keys(diag.everContested).length),
          squadObjectiveSpread: { us: meanSpread('us'), ge: meanSpread('ge') },
          vacantObjectiveStalls: diag.vacantObjectiveStalls, movementStalls: diag.movementStalls, routeStalls: diag.routeStalls, targetlessStalls: diag.targetlessStalls, longRegroups: diag.longRegroups,
          squadSamples: diag.squadSamples, targetlessSamples: diag.targetlessSamples, overCohesionSamples: diag.overCohesionSamples, captainlessSamples: diag.captainlessSamples, inContactSamples: diag.inContactSamples,
          stablePlanSamples: diag.stablePlanSamples, blockedFireteamSamples: diag.blockedFireteamSamples, regroupSamples: diag.regroupSamples, supportHoldSamples: diag.supportHoldSamples, retreatSamples: diag.retreatSamples,
          orderedMoveSamples: diag.orderedMoveSamples, idleOrderedSamples: diag.idleOrderedSamples, phaseSamples: diag.phaseSamples, engagementStateSamples: diag.engagementStateSamples,
          writerConflicts: conflicts.length, strategicWriterConflicts: strategicConflicts, writerConflictDetails: conflicts.slice(0, 20), loopAlerts: loops.slice(0, 20), loopKinds,
          movementResolver: movementResolverSummary(), losBlockedFireAttempts: losBlockedAttempts(), fire: activeCombat,
          coordinationHealth: coordinationHealth(), objectiveRecovery: { us: +(recovery.us?.count || 0), ge: +(recovery.ge?.count || 0) }, finalObjectives: objectiveStates
        };
        battles.push(record);
        console.log(`[BENCH] ${index + 1}/${count} ${seed} winner=${record.winner} captures=${record.captures}/${record.objectiveCount} neverOwned=${record.objectivesNeverOwned} spread=${record.squadObjectiveSpread.us}/${record.squadObjectiveSpread.ge} vacant=${record.vacantObjectiveStalls.length} route=${record.routeStalls.length} move=${record.movementStalls.length} loops=${record.loopAlerts.length} conflicts=${record.writerConflicts} wall=${record.wallSeconds}s`);
        activeCombat = null; cleanup(); if ((index + 1) % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      activeCombat = null; root.BattleAIPolicy.clearMatchPolicies(sim); cleanup();
      if (originalSeed) root.BattleTownObjectives.regenerate(sim.scene, sim.heightAt, originalSeed, { restoredAfterBenchmark: true }, sim);
      sim.trainingMode = false; root.BattleSoldierModel?.setImportedEnabled?.(sim.scene, true); rawRestart();
      sim.timeScale = saved.timeScale; sim.timeLimit = saved.timeLimit; sim.onFire = saved.onFire; sim.onShot = saved.onShot; sim.onSuppressiveShot = saved.onSuppressiveShot;
      sim.onCallout = saved.onCallout; sim.onUpdate = saved.onUpdate; sim.onWinner = saved.onWinner; sim.paused = true;
      if (telemetry && telemetrySaved) Object.assign(telemetry, telemetrySaved);
      if (telemetryConsole !== null && telemetry?.setConsoleLogging) telemetry.setConsoleLogging(telemetryConsole);
    }
    return { build: root.BATTLE_BUILD || null, policyRevision: suppliedPolicy?.revision || root.BattleAIPolicy.revision || 0, policySource: suppliedPolicy?.source || 'runtime-default', fixedDt, timeLimit, sampleSeconds: SAMPLE_SECONDS, battles };
  }, { count, seedPrefix, fixedDt, timeLimit, suppliedPolicy: policy });

  const wallSeconds = (Date.now() - startedWall) / 1000, battles = result.battles || [];
  for (const b of battles) b.health = healthFor(b);
  const winners = { us: 0, ge: 0, draw: 0, none: 0 }; for (const b of battles) winners[b.winner] = (winners[b.winner] || 0) + 1;
  const durations = battles.map(b => b.simulatedSeconds), wallDurations = battles.map(b => b.wallSeconds), captures = battles.map(b => b.captures), simulatedTotal = durations.reduce((a, b) => a + b, 0);
  const assetNoisePattern = /(cors|cross-origin|failed to load resource|net::err_failed|texture|skytex|dirttex|audio\/|\.mp3|\.png|\.jpg|\.jpeg)/i;
  const runtimeErrors = browserErrors.filter(e => !assetNoisePattern.test(String(e))), assetLoadNoise = browserErrors.length - runtimeErrors.length;
  const issue = {
    vacantObjectiveStalls: sum(battles, b => b.vacantObjectiveStalls?.length), movementStalls: sum(battles, b => b.movementStalls?.length),
    routeStalls: sum(battles, b => b.routeStalls?.length), targetlessStalls: sum(battles, b => b.targetlessStalls?.length), longRegroups: sum(battles, b => b.longRegroups?.length),
    writerConflicts: sum(battles, b => b.writerConflicts), strategicWriterConflicts: sum(battles, b => b.strategicWriterConflicts), loopAlerts: sum(battles, b => b.loopAlerts?.length),
    losBlockedFireAttempts: sum(battles, b => b.losBlockedFireAttempts)
  };
  const aggregateHealth = {
    overall: +mean(battles.map(b => b.health.overall)).toFixed(1), strategic: +mean(battles.map(b => b.health.strategic)).toFixed(1), movement: +mean(battles.map(b => b.health.movement)).toFixed(1),
    cohesion: +mean(battles.map(b => b.health.cohesion)).toFixed(1), combat: +mean(battles.map(b => b.health.combat)).toFixed(1), objective: +mean(battles.map(b => b.health.objective)).toFixed(1)
  };
  const phaseSamples = {}, engagementStateSamples = {}; for (const b of battles) {
    for (const [k, v] of Object.entries(b.phaseSamples || {})) phaseSamples[k] = (phaseSamples[k] || 0) + v;
    for (const [k, v] of Object.entries(b.engagementStateSamples || {})) engagementStateSamples[k] = (engagementStateSamples[k] || 0) + v;
  }
  const summary = {
    generatedAt: new Date().toISOString(), commit, build: result.build, policySource: result.policySource, policyRevision: result.policyRevision, policyWarning: policy.warning || null,
    requestedBattles: count, completedBattles: battles.length, seedPrefix, fixedDt, sampleSeconds: result.sampleSeconds, timeLimit,
    wallSeconds: +wallSeconds.toFixed(2), simulatedSeconds: +simulatedTotal.toFixed(2), realtimeMultiplier: wallSeconds > 0 ? +(simulatedTotal / wallSeconds).toFixed(1) : 0, battlesPerMinute: wallSeconds > 0 ? +(battles.length / wallSeconds * 60).toFixed(2) : 0,
    winners, usWinRate: pct(winners.us || 0, battles.length), geWinRate: pct(winners.ge || 0, battles.length), drawRate: pct((winners.draw || 0) + (winners.none || 0), battles.length),
    avgBattleSeconds: +mean(durations).toFixed(2), p50BattleSeconds: +quantile(durations, .5).toFixed(2), p95BattleSeconds: +quantile(durations, .95).toFixed(2), avgWallSecondsPerBattle: +mean(wallDurations).toFixed(3),
    timeoutBattles: battles.filter(b => b.timeoutReached).length, avgCaptures: +mean(captures).toFixed(2), noCaptureBattles: battles.filter(b => b.captures === 0).length,
    avgFirstContactSeconds: +mean(battles.map(b => b.firstContactSeconds).filter(Number.isFinite)).toFixed(1), avgFirstFireSeconds: +mean(battles.map(b => b.firstFireSeconds).filter(Number.isFinite)).toFixed(1),
    avgFirstObjectiveProgressSeconds: +mean(battles.map(b => b.firstObjectiveProgressSeconds).filter(Number.isFinite)).toFixed(1), avgFirstCaptureSeconds: +mean(battles.map(b => b.firstCaptureSeconds).filter(Number.isFinite)).toFixed(1),
    maxNoObjectiveProgressSeconds: +Math.max(0, ...battles.map(b => b.maxNoObjectiveProgressSeconds || 0)).toFixed(1),
    avgNoObjectiveProgressSeconds: +mean(battles.map(b => b.maxNoObjectiveProgressSeconds || 0)).toFixed(1),
    avgObjectivesPerBattle: +mean(battles.map(b => b.objectiveCount || 0)).toFixed(2),
    objectivesNeverOwned: sum(battles, b => b.objectivesNeverOwned),
    objectivesNeverOwnedRate: pct(sum(battles, b => b.objectivesNeverOwned), sum(battles, b => b.objectiveCount)),
    objectivesNeverContested: sum(battles, b => b.objectivesNeverContested),
    avgSquadObjectiveSpread: { us: +mean(battles.map(b => b.squadObjectiveSpread?.us || 0)).toFixed(2), ge: +mean(battles.map(b => b.squadObjectiveSpread?.ge || 0)).toFixed(2) },
    issueCounts: issue, health: aggregateHealth, phaseSamples, engagementStateSamples,
    idleUnderOrdersRate: +rate(sum(battles, b => b.idleOrderedSamples), sum(battles, b => b.orderedMoveSamples)).toFixed(4),
    overCohesionRate: +rate(sum(battles, b => b.overCohesionSamples), sum(battles, b => b.squadSamples)).toFixed(4),
    targetlessSquadRate: +rate(sum(battles, b => b.targetlessSamples), sum(battles, b => b.squadSamples)).toFixed(4),
    shots: sum(battles, b => b.fire?.total), directShots: sum(battles, b => b.fire?.direct), hits: sum(battles, b => b.fire?.hits), suppressiveShots: sum(battles, b => b.fire?.suppressive),
    hitRate: +rate(sum(battles, b => b.fire?.hits), sum(battles, b => b.fire?.direct)).toFixed(4),
    movementResolverChanges: sum(battles, b => b.movementResolver?.changes), browserErrors: browserErrors.length, runtimeErrors: runtimeErrors.length, assetLoadNoise, browserWarnings: browserWarnings.length
  };

  const score = b => (100 - b.health.overall) * 10 + (b.strategicWriterConflicts || 0) * 80 + (b.routeStalls?.length || 0) * 45 + (b.targetlessStalls?.length || 0) * 40 + (b.vacantObjectiveStalls?.length || 0) * 50 + (b.longRegroups?.length || 0) * 35 + (b.loopAlerts?.length || 0) * 25 + (b.captures === 0 ? 80 : 0) + (b.objectivesNeverOwned || 0) * 60 + (b.maxNoObjectiveProgressSeconds || 0) * .25;
  const problematic = [...battles].sort((a, b) => score(b) - score(a)).slice(0, 20);
  const payload = { summary, policy, runtimeErrors: dedupe(runtimeErrors), assetLoadNoiseExamples: dedupe(browserErrors.filter(e => assetNoisePattern.test(String(e))), 20), browserWarnings: dedupe(browserWarnings, 100), battles };
  fs.writeFileSync(path.join(outputDir, 'battle-benchmark.json'), JSON.stringify(payload, null, 2));

  const headers = ['index','seed','winner','winReason','simulatedSeconds','timeoutReached','usAlive','geAlive','captures','neutralizations','objectiveCount','objectivesNeverOwned','objectivesNeverContested','usSquadSpread','geSquadSpread','healthOverall','firstContactSeconds','firstFireSeconds','firstCaptureSeconds','maxNoObjectiveProgressSeconds','vacantObjectiveStalls','movementStalls','routeStalls','targetlessStalls','longRegroups','writerConflicts','strategicWriterConflicts','loopAlerts','idleUnderOrdersRate','overCohesionRate','shots','hits','hitRate','losBlockedFireAttempts','movementResolverChanges'];
  const csvLines = [headers.join(',')];
  for (const b of battles) {
    const row = {
      ...b, healthOverall: b.health.overall, vacantObjectiveStalls: b.vacantObjectiveStalls?.length || 0, movementStalls: b.movementStalls?.length || 0, routeStalls: b.routeStalls?.length || 0,
      targetlessStalls: b.targetlessStalls?.length || 0, longRegroups: b.longRegroups?.length || 0, loopAlerts: b.loopAlerts?.length || 0,
      idleUnderOrdersRate: rate(b.idleOrderedSamples, b.orderedMoveSamples).toFixed(4), overCohesionRate: rate(b.overCohesionSamples, b.squadSamples).toFixed(4),
      shots: b.fire?.total || 0, hits: b.fire?.hits || 0, hitRate: rate(b.fire?.hits || 0, b.fire?.direct || 0).toFixed(4), movementResolverChanges: b.movementResolver?.changes || 0,
      usSquadSpread: b.squadObjectiveSpread?.us ?? 0, geSquadSpread: b.squadObjectiveSpread?.ge ?? 0
    };
    csvLines.push(headers.map(h => csv(row[h])).join(','));
  }
  fs.writeFileSync(path.join(outputDir, 'battle-benchmark.csv'), csvLines.join('\n') + '\n');

  const md = ['# 100-battle headless benchmark','',
    `- Commit: \`${summary.commit}\``, `- Build: \`${summary.build || 'unknown'}\``, `- Policy: ${summary.policySource}, revision ${summary.policyRevision}${summary.policyWarning ? ` — ${summary.policyWarning}` : ''}`,
    `- Completed: **${summary.completedBattles}/${summary.requestedBattles}** in **${summary.wallSeconds}s** (${summary.realtimeMultiplier}× real-time, ${summary.battlesPerMinute} battles/min)`,
    `- Results: US **${winners.us || 0}** (${summary.usWinRate}), GER **${winners.ge || 0}** (${summary.geWinRate}), draw/none **${(winners.draw || 0) + (winners.none || 0)}** (${summary.drawRate})`,
    `- Time-limit battles: **${summary.timeoutBattles}/${summary.completedBattles}**; captures avg **${summary.avgCaptures}** of **${summary.avgObjectivesPerBattle}** objectives; no-capture **${summary.noCaptureBattles}**`,
    `- Objectives nobody ever owned: **${summary.objectivesNeverOwned}** (${summary.objectivesNeverOwnedRate}) · never even contested **${summary.objectivesNeverContested}** · distinct objectives assigned per side US **${summary.avgSquadObjectiveSpread.us}**, GER **${summary.avgSquadObjectiveSpread.ge}**`,
    `- No objective progress: longest **${summary.maxNoObjectiveProgressSeconds}s** · mean per battle **${summary.avgNoObjectiveProgressSeconds}s**`,
    `- First contact avg **${summary.avgFirstContactSeconds}s** · first fire **${summary.avgFirstFireSeconds}s** · first objective progress **${summary.avgFirstObjectiveProgressSeconds}s** · first capture **${summary.avgFirstCaptureSeconds}s**`,
    `- Health: **${summary.health.overall}/100 overall** · strategic ${summary.health.strategic} · movement ${summary.health.movement} · cohesion ${summary.health.cohesion} · combat ${summary.health.combat} · objective ${summary.health.objective}`,
    `- Stalls: vacant objective **${issue.vacantObjectiveStalls}** · route **${issue.routeStalls}** · soldier movement **${issue.movementStalls}** · targetless command **${issue.targetlessStalls}** · long regroup **${issue.longRegroups}**`,
    `- Coordination: writer conflicts **${issue.writerConflicts}** (${issue.strategicWriterConflicts} strategic) · loop alerts **${issue.loopAlerts}** · idle-under-orders ${(summary.idleUnderOrdersRate * 100).toFixed(1)}% · over-cohesion ${(summary.overCohesionRate * 100).toFixed(1)}%`,
    `- Combat: **${summary.shots}** discharges · **${summary.directShots}** direct · **${summary.hits}** hits (${(summary.hitRate * 100).toFixed(1)}%) · **${issue.losBlockedFireAttempts}** trigger-time LOS blocks`,
    `- Runtime: **${summary.runtimeErrors} probable JS/runtime errors** · **${summary.assetLoadNoise} asset/CORS noise** · ${summary.browserWarnings} warnings`,
    '', '## Most problematic runs', '',
    '| Seed | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |',
    '|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const b of problematic) md.push(`| \`${b.seed}\` | ${b.winner} | ${b.health.overall} | ${b.captures}/${b.objectiveCount} | ${b.objectivesNeverOwned} | ${b.squadObjectiveSpread?.us ?? '-'}/${b.squadObjectiveSpread?.ge ?? '-'} | ${b.routeStalls?.length || 0} | ${b.movementStalls?.length || 0} | ${b.targetlessStalls?.length || 0} | ${b.vacantObjectiveStalls?.length || 0} | ${b.longRegroups?.length || 0} | ${b.writerConflicts || 0} | ${b.loopAlerts?.length || 0} | ${b.maxNoObjectiveProgressSeconds}s |`);
  md.push('', '## Diagnostic score note', '', 'Health scores are transparent triage aids, not pass/fail gates. They penalize observed stalls, command ownership conflicts, prolonged targetless/regroup states, cohesion violations and objective inactivity; raw counts remain authoritative.');
  if (runtimeErrors.length) { md.push('', '## Probable runtime errors', ''); for (const error of dedupe(runtimeErrors, 20)) md.push(`- \`${String(error).replaceAll('`', "'")}\``); }
  fs.writeFileSync(path.join(outputDir, 'battle-benchmark.md'), md.join('\n') + '\n');

  console.log('BENCHMARK_SUMMARY ' + JSON.stringify(summary));
  console.log(md.join('\n'));
} finally {
  await browser.close();
}

import fs from 'node:fs';
import path from 'node:path';

const inputDir = path.resolve(process.env.BATTLE_BENCHMARK_MERGE_INPUT || 'shard-reports');
const outputDir = path.resolve(process.env.BATTLE_BENCHMARK_OUTPUT || 'reports');
fs.mkdirSync(outputDir, { recursive: true });

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name === 'battle-benchmark.json') out.push(p);
  }
  return out;
}
function mean(a) { return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0; }
function quantile(values,q){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return l===h?a[l]:a[l]+(a[h]-a[l])*(p-l);}
function pct(n,d){return d?`${(100*n/d).toFixed(1)}%`:'0.0%';}
function csv(v){const s=v==null?'':String(v);return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
function sum(battles,fn){return battles.reduce((n,b)=>n+(+fn(b)||0),0);}
function rate(n,d){return d>0?n/d:0;}
function dedupe(values,limit=100){return [...new Set(values.map(String))].slice(0,limit);}
function mergeMaps(battles,field){const out={};for(const b of battles)for(const [k,v] of Object.entries(b[field]||{}))out[k]=(out[k]||0)+(+v||0);return out;}
function battleTypeOf(b){
  if (b && ['meeting','us-defend','ge-defend'].includes(b.battleType)) return b.battleType;
  const seed=String(b?.seed||''),m=seed.match(/(?:^|-)(meeting|us-defend|ge-defend)-s\d+-/);
  return m ? m[1] : 'unknown';
}
function winnerCounts(rows){const out={us:0,ge:0,draw:0,none:0};for(const b of rows)out[b.winner]=(out[b.winner]||0)+1;return out;}
function issueCounts(rows){return{
  vacantObjectiveStalls:sum(rows,b=>b.vacantObjectiveStalls?.length),movementStalls:sum(rows,b=>b.movementStalls?.length),routeStalls:sum(rows,b=>b.routeStalls?.length),
  targetlessStalls:sum(rows,b=>b.targetlessStalls?.length),longRegroups:sum(rows,b=>b.longRegroups?.length),writerConflicts:sum(rows,b=>b.writerConflicts),
  strategicWriterConflicts:sum(rows,b=>b.strategicWriterConflicts),loopAlerts:sum(rows,b=>b.loopAlerts?.length),losBlockedFireAttempts:sum(rows,b=>b.losBlockedFireAttempts)
};}
function healthSummary(rows){return{
  overall:+mean(rows.map(b=>+b.health?.overall||0)).toFixed(1),strategic:+mean(rows.map(b=>+b.health?.strategic||0)).toFixed(1),movement:+mean(rows.map(b=>+b.health?.movement||0)).toFixed(1),
  cohesion:+mean(rows.map(b=>+b.health?.cohesion||0)).toFixed(1),combat:+mean(rows.map(b=>+b.health?.combat||0)).toFixed(1),objective:+mean(rows.map(b=>+b.health?.objective||0)).toFixed(1)
};}
function summarizeType(rows){
  const winners=winnerCounts(rows),issues=issueCounts(rows),health=healthSummary(rows);
  return{
    completedBattles:rows.length,winners,usWinRate:pct(winners.us||0,rows.length),geWinRate:pct(winners.ge||0,rows.length),
    avgCaptures:+mean(rows.map(b=>+b.captures||0)).toFixed(2),noCaptureBattles:rows.filter(b=>+b.captures===0).length,
    objectivesNeverOwned:sum(rows,b=>b.objectivesNeverOwned),objectivesNeverContested:sum(rows,b=>b.objectivesNeverContested),
    avgNoObjectiveProgressSeconds:+mean(rows.map(b=>+b.maxNoObjectiveProgressSeconds||0)).toFixed(1),maxNoObjectiveProgressSeconds:+Math.max(0,...rows.map(b=>+b.maxNoObjectiveProgressSeconds||0)).toFixed(1),
    avgSquadObjectiveSpread:{us:+mean(rows.map(b=>+b.squadObjectiveSpread?.us||0)).toFixed(2),ge:+mean(rows.map(b=>+b.squadObjectiveSpread?.ge||0)).toFixed(2)},
    issueCounts:issues,health,
    idleUnderOrdersRate:+rate(sum(rows,b=>b.idleOrderedSamples),sum(rows,b=>b.orderedMoveSamples)).toFixed(4),
    overCohesionRate:+rate(sum(rows,b=>b.overCohesionSamples),sum(rows,b=>b.squadSamples)).toFixed(4),
    movementResolverChanges:sum(rows,b=>b.movementResolver?.changes),
    regroups:{perBattle:+mean(rows.map(b=>+b.regroups?.entries||0)).toFixed(2),timeouts:sum(rows,b=>b.regroups?.timeouts),contactExits:sum(rows,b=>b.regroups?.contactExits)}
  };
}

const files=walk(inputDir).sort();
if(!files.length)throw new Error(`No shard reports found under ${inputDir}`);
const shards=files.map(file=>({file,payload:JSON.parse(fs.readFileSync(file,'utf8'))}));
const battles=shards.flatMap(x=>x.payload.battles||[]).sort((a,b)=>String(a.seed).localeCompare(String(b.seed)));
for(const b of battles)b.battleType=battleTypeOf(b);
const winners=winnerCounts(battles);
const durations=battles.map(b=>+b.simulatedSeconds||0),captures=battles.map(b=>+b.captures||0),first=shards[0].payload;
const parallelWallSeconds=Math.max(...shards.map(x=>+x.payload.summary?.wallSeconds||0));
const cpuWallSeconds=shards.reduce((n,x)=>n+(+x.payload.summary?.wallSeconds||0),0),simulatedSeconds=durations.reduce((a,b)=>a+b,0);
const issue=issueCounts(battles);
const health=healthSummary(battles);
const typeOrder=['meeting','us-defend','ge-defend'],battleTypes={};
for(const type of typeOrder)battleTypes[type]=summarizeType(battles.filter(b=>b.battleType===type));
if(battles.some(b=>b.battleType==='unknown'))battleTypes.unknown=summarizeType(battles.filter(b=>b.battleType==='unknown'));
const validMean=field=>+mean(battles.map(b=>b[field]).filter(Number.isFinite)).toFixed(1);
const runtimeErrors=dedupe(shards.flatMap(x=>x.payload.runtimeErrors||[]),100),assetNoiseExamples=dedupe(shards.flatMap(x=>x.payload.assetLoadNoiseExamples||[]),30),browserWarnings=dedupe(shards.flatMap(x=>x.payload.browserWarnings||[]),200);
const summary={
  generatedAt:new Date().toISOString(),commit:first.summary?.commit||process.env.GITHUB_SHA||'unknown',build:first.summary?.build||null,policySource:first.summary?.policySource||'unknown',policyRevision:first.summary?.policyRevision||0,
  shardCount:shards.length,requestedBattles:shards.reduce((n,x)=>n+(+x.payload.summary?.requestedBattles||0),0),completedBattles:battles.length,battleTypes,
  parallelWallSeconds:+parallelWallSeconds.toFixed(2),cpuWallSeconds:+cpuWallSeconds.toFixed(2),simulatedSeconds:+simulatedSeconds.toFixed(2),realtimeMultiplier:parallelWallSeconds>0?+(simulatedSeconds/parallelWallSeconds).toFixed(1):0,battlesPerMinute:parallelWallSeconds>0?+(battles.length/parallelWallSeconds*60).toFixed(2):0,
  winners,usWinRate:pct(winners.us||0,battles.length),geWinRate:pct(winners.ge||0,battles.length),drawRate:pct((winners.draw||0)+(winners.none||0),battles.length),
  avgBattleSeconds:+mean(durations).toFixed(2),p50BattleSeconds:+quantile(durations,.5).toFixed(2),p95BattleSeconds:+quantile(durations,.95).toFixed(2),timeoutBattles:battles.filter(b=>b.timeoutReached).length,
  avgCaptures:+mean(captures).toFixed(2),noCaptureBattles:battles.filter(b=>+b.captures===0).length,
  avgFirstContactSeconds:validMean('firstContactSeconds'),avgFirstFireSeconds:validMean('firstFireSeconds'),avgFirstObjectiveProgressSeconds:validMean('firstObjectiveProgressSeconds'),avgFirstCaptureSeconds:validMean('firstCaptureSeconds'),
  maxNoObjectiveProgressSeconds:+Math.max(0,...battles.map(b=>+b.maxNoObjectiveProgressSeconds||0)).toFixed(1),
  avgNoObjectiveProgressSeconds:+mean(battles.map(b=>+b.maxNoObjectiveProgressSeconds||0)).toFixed(1),
  avgObjectivesPerBattle:+mean(battles.map(b=>+b.objectiveCount||0)).toFixed(2),
  objectivesNeverOwned:sum(battles,b=>b.objectivesNeverOwned),objectivesNeverOwnedRate:pct(sum(battles,b=>b.objectivesNeverOwned),sum(battles,b=>b.objectiveCount)),
  objectivesNeverContested:sum(battles,b=>b.objectivesNeverContested),
  avgSquadObjectiveSpread:{us:+mean(battles.map(b=>+b.squadObjectiveSpread?.us||0)).toFixed(2),ge:+mean(battles.map(b=>+b.squadObjectiveSpread?.ge||0)).toFixed(2)},
  issueCounts:issue,health,
  phaseSamples:mergeMaps(battles,'phaseSamples'),engagementStateSamples:mergeMaps(battles,'engagementStateSamples'),
  idleUnderOrdersRate:+rate(sum(battles,b=>b.idleOrderedSamples),sum(battles,b=>b.orderedMoveSamples)).toFixed(4),overCohesionRate:+rate(sum(battles,b=>b.overCohesionSamples),sum(battles,b=>b.squadSamples)).toFixed(4),targetlessSquadRate:+rate(sum(battles,b=>b.targetlessSamples),sum(battles,b=>b.squadSamples)).toFixed(4),
  shots:sum(battles,b=>b.fire?.total),directShots:sum(battles,b=>b.fire?.direct),hits:sum(battles,b=>b.fire?.hits),suppressiveShots:sum(battles,b=>b.fire?.suppressive),hitRate:+rate(sum(battles,b=>b.fire?.hits),sum(battles,b=>b.fire?.direct)).toFixed(4),
  movementResolverChanges:sum(battles,b=>b.movementResolver?.changes),browserErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.browserErrors||0),0),runtimeErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.runtimeErrors||0),0),assetLoadNoise:shards.reduce((n,x)=>n+(+x.payload.summary?.assetLoadNoise||0),0),browserWarnings:shards.reduce((n,x)=>n+(+x.payload.summary?.browserWarnings||0),0)
};
const payload={summary,policy:first.policy||null,shards:shards.map(x=>({file:x.file,summary:x.payload.summary})),runtimeErrors,assetLoadNoiseExamples:assetNoiseExamples,browserWarnings,battles};
fs.writeFileSync(path.join(outputDir,'battle-benchmark.json'),JSON.stringify(payload,null,2));

const headers=['seed','battleType','winner','winReason','simulatedSeconds','timeoutReached','usAlive','geAlive','captures','neutralizations','objectiveCount','objectivesNeverOwned','objectivesNeverContested','usSquadSpread','geSquadSpread','healthOverall','firstContactSeconds','firstFireSeconds','firstCaptureSeconds','maxNoObjectiveProgressSeconds','vacantObjectiveStalls','movementStalls','routeStalls','targetlessStalls','longRegroups','writerConflicts','strategicWriterConflicts','loopAlerts','idleUnderOrdersRate','overCohesionRate','shots','hits','hitRate','losBlockedFireAttempts','movementResolverChanges'];
const lines=[headers.join(',')];
for(const b of battles){const row={...b,healthOverall:b.health?.overall??'',vacantObjectiveStalls:b.vacantObjectiveStalls?.length||0,movementStalls:b.movementStalls?.length||0,routeStalls:b.routeStalls?.length||0,targetlessStalls:b.targetlessStalls?.length||0,longRegroups:b.longRegroups?.length||0,loopAlerts:b.loopAlerts?.length||0,idleUnderOrdersRate:rate(b.idleOrderedSamples,b.orderedMoveSamples).toFixed(4),overCohesionRate:rate(b.overCohesionSamples,b.squadSamples).toFixed(4),shots:b.fire?.total||0,hits:b.fire?.hits||0,hitRate:rate(b.fire?.hits||0,b.fire?.direct||0).toFixed(4),movementResolverChanges:b.movementResolver?.changes||0,usSquadSpread:b.squadObjectiveSpread?.us??0,geSquadSpread:b.squadObjectiveSpread?.ge??0};lines.push(headers.map(h=>csv(row[h])).join(','));}
fs.writeFileSync(path.join(outputDir,'battle-benchmark.csv'),lines.join('\n')+'\n');

const score=b=>(100-(+b.health?.overall||0))*10+(b.strategicWriterConflicts||0)*80+(b.routeStalls?.length||0)*45+(b.targetlessStalls?.length||0)*40+(b.vacantObjectiveStalls?.length||0)*50+(b.longRegroups?.length||0)*35+(b.loopAlerts?.length||0)*25+(b.captures===0?80:0)+(+b.objectivesNeverOwned||0)*60+(+b.maxNoObjectiveProgressSeconds||0)*.25;
const problematic=[...battles].sort((a,b)=>score(b)-score(a)).slice(0,20);
const md=['# M3C three-scenario headless benchmark','',`- Commit: \`${summary.commit}\``,`- Build: \`${summary.build||'unknown'}\``,`- Policy: ${summary.policySource}, revision ${summary.policyRevision}`,`- Scenario/shards available: **${summary.shardCount}/30**`,`- Completed: **${summary.completedBattles}/${summary.requestedBattles}** in about **${summary.parallelWallSeconds}s** (${summary.realtimeMultiplier}× real-time, ${summary.battlesPerMinute} battles/min)`,`- Results: US **${winners.us||0}** (${summary.usWinRate}), GER **${winners.ge||0}** (${summary.geWinRate}), draw/none **${(winners.draw||0)+(winners.none||0)}** (${summary.drawRate})`,`- Time-limit battles: **${summary.timeoutBattles}/${summary.completedBattles}**; captures avg **${summary.avgCaptures}** of **${summary.avgObjectivesPerBattle}** objectives; no-capture **${summary.noCaptureBattles}**`,`- Objectives nobody ever owned: **${summary.objectivesNeverOwned}** (${summary.objectivesNeverOwnedRate}) · never even contested **${summary.objectivesNeverContested}** · distinct objectives assigned per side US **${summary.avgSquadObjectiveSpread.us}**, GER **${summary.avgSquadObjectiveSpread.ge}**`,`- No objective progress: longest **${summary.maxNoObjectiveProgressSeconds}s** · mean per battle **${summary.avgNoObjectiveProgressSeconds}s**`,`- First contact avg **${summary.avgFirstContactSeconds}s** · first fire **${summary.avgFirstFireSeconds}s** · first objective progress **${summary.avgFirstObjectiveProgressSeconds}s** · first capture **${summary.avgFirstCaptureSeconds}s**`,`- Health: **${summary.health.overall}/100 overall** · strategic ${summary.health.strategic} · movement ${summary.health.movement} · cohesion ${summary.health.cohesion} · combat ${summary.health.combat} · objective ${summary.health.objective}`,`- Stalls: vacant objective **${issue.vacantObjectiveStalls}** · route **${issue.routeStalls}** · soldier movement **${issue.movementStalls}** · targetless command **${issue.targetlessStalls}** · long regroup **${issue.longRegroups}**`,`- Coordination: writer conflicts **${issue.writerConflicts}** (${issue.strategicWriterConflicts} strategic) · loop alerts **${issue.loopAlerts}** · idle-under-orders ${(summary.idleUnderOrdersRate*100).toFixed(1)}% · over-cohesion ${(summary.overCohesionRate*100).toFixed(1)}%`,`- Combat: **${summary.shots}** discharges · **${summary.directShots}** direct · **${summary.hits}** hits (${(summary.hitRate*100).toFixed(1)}%) · **${issue.losBlockedFireAttempts}** trigger-time LOS blocks`,`- Runtime: **${summary.runtimeErrors} probable JS/runtime errors** · **${summary.assetLoadNoise} asset/CORS noise** · ${summary.browserWarnings} warnings`,'','## By battle type','','| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts |','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|'];
for(const type of typeOrder){const t=battleTypes[type],i=t.issueCounts;md.push(`| ${type} | ${t.completedBattles} | ${t.winners.us}/${t.winners.ge} | ${t.health.overall} | ${t.health.strategic} | ${t.health.movement} | ${t.health.cohesion} | ${t.health.objective} | ${i.routeStalls} | ${i.movementStalls} | ${i.writerConflicts} | ${i.loopAlerts} | ${t.avgNoObjectiveProgressSeconds}s | ${t.avgSquadObjectiveSpread.us}/${t.avgSquadObjectiveSpread.ge} | ${t.regroups.perBattle} | ${t.regroups.timeouts} |`);}
md.push('','## Most problematic runs','','| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |','|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for(const b of problematic)md.push(`| \`${b.seed}\` | ${b.battleType} | ${b.winner} | ${b.health?.overall??''} | ${b.captures}/${b.objectiveCount} | ${b.objectivesNeverOwned} | ${b.squadObjectiveSpread?.us??'-'}/${b.squadObjectiveSpread?.ge??'-'} | ${b.routeStalls?.length||0} | ${b.movementStalls?.length||0} | ${b.targetlessStalls?.length||0} | ${b.vacantObjectiveStalls?.length||0} | ${b.longRegroups?.length||0} | ${b.writerConflicts||0} | ${b.loopAlerts?.length||0} | ${b.maxNoObjectiveProgressSeconds}s |`);
md.push('','## Diagnostic score note','','Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.');
if(runtimeErrors.length){md.push('','## Probable runtime errors','');for(const e of runtimeErrors.slice(0,20))md.push(`- \`${String(e).replaceAll('`',"'")}\``);}
fs.writeFileSync(path.join(outputDir,'battle-benchmark.md'),md.join('\n')+'\n');
console.log('BENCHMARK_SUMMARY '+JSON.stringify(summary));console.log(md.join('\n'));

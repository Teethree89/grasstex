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
function quantile(values, q) { if(!values.length)return 0; const a=[...values].sort((x,y)=>x-y),p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p); return l===h?a[l]:a[l]+(a[h]-a[l])*(p-l); }
function pct(n,d){return d?`${(100*n/d).toFixed(1)}%`:'0.0%';}
function csv(v){const s=v==null?'':String(v);return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}

const files = walk(inputDir).sort();
if (!files.length) throw new Error(`No shard reports found under ${inputDir}`);
const shards = files.map(file => ({ file, payload: JSON.parse(fs.readFileSync(file, 'utf8')) }));
const battles = shards.flatMap(x => x.payload.battles || []).sort((a,b)=>String(a.seed).localeCompare(String(b.seed)));
const winners={us:0,ge:0,draw:0,none:0}; for(const b of battles) winners[b.winner]=(winners[b.winner]||0)+1;
const durations=battles.map(b=>+b.simulatedSeconds||0), captures=battles.map(b=>+b.captures||0);
const vacantStalls=battles.reduce((n,b)=>n+(b.vacantObjectiveStalls?.length||0),0), movementStalls=battles.reduce((n,b)=>n+(b.movementStalls?.length||0),0);
const sum=(f)=>battles.reduce((n,b)=>n+(+f(b)||0),0);
const histogram=(f)=>{const out={};for(const b of battles)for(const e of (f(b)||[])){const k=String(e??'unknown');out[k]=(out[k]||0)+1;}return Object.fromEntries(Object.entries(out).sort((a,b2)=>b2[1]-a[1]));};
const movementStallPhases=histogram(b=>(b.movementStalls||[]).map(x=>x.phase));
const movementStallStates=histogram(b=>(b.movementStalls||[]).map(x=>x.engagementState));
const vacantStallPhases=histogram(b=>(b.vacantObjectiveStalls||[]).map(x=>x.phase));
const loopWatchAlerts=battles.reduce((acc,b)=>{for(const [k,n] of Object.entries(b.loopWatchAlerts||{}))acc[k]=(acc[k]||0)+n;return acc;},{});
const objectiveTotal=sum(b=>b.objectiveCount),neverOwnedTotal=sum(b=>b.objectivesNeverOwned),neverContestedTotal=sum(b=>b.objectivesNeverContested);
const decisiveBattles=battles.filter(b=>b.winReason&&b.winReason!=='time limit objective score').length;
const parallelWallSeconds=Math.max(...shards.map(x=>+x.payload.summary?.wallSeconds||0));
const cpuWallSeconds=shards.reduce((n,x)=>n+(+x.payload.summary?.wallSeconds||0),0);
const simulatedSeconds=durations.reduce((a,b)=>a+b,0);
const first=shards[0].payload;
const summary={
  generatedAt:new Date().toISOString(), commit:first.summary?.commit||process.env.GITHUB_SHA||'unknown', build:first.summary?.build||null,
  policySource:first.summary?.policySource||'unknown', policyRevision:first.summary?.policyRevision||0,
  shardCount:shards.length, requestedBattles:shards.reduce((n,x)=>n+(+x.payload.summary?.requestedBattles||0),0), completedBattles:battles.length,
  parallelWallSeconds:+parallelWallSeconds.toFixed(2), cpuWallSeconds:+cpuWallSeconds.toFixed(2), simulatedSeconds:+simulatedSeconds.toFixed(2),
  realtimeMultiplier:parallelWallSeconds>0?+(simulatedSeconds/parallelWallSeconds).toFixed(1):0,
  battlesPerMinute:parallelWallSeconds>0?+(battles.length/parallelWallSeconds*60).toFixed(2):0,
  winners, usWinRate:pct(winners.us||0,battles.length), geWinRate:pct(winners.ge||0,battles.length), drawRate:pct((winners.draw||0)+(winners.none||0),battles.length),
  avgBattleSeconds:+mean(durations).toFixed(2), p50BattleSeconds:+quantile(durations,.5).toFixed(2), p95BattleSeconds:+quantile(durations,.95).toFixed(2),
  avgCaptures:+mean(captures).toFixed(2), noCaptureBattles:battles.filter(b=>+b.captures===0).length,
  vacantObjectiveStalls:vacantStalls, vacantObjectiveStallBattles:battles.filter(b=>b.vacantObjectiveStalls?.length).length,
  movementStalls, movementStallBattles:battles.filter(b=>b.movementStalls?.length).length,
  maxNoObjectiveProgressSeconds:+Math.max(0,...battles.map(b=>+b.maxNoObjectiveProgressSeconds||0)).toFixed(1),
  avgNoObjectiveProgressSeconds:+mean(battles.map(b=>+b.maxNoObjectiveProgressSeconds||0)).toFixed(1),
  decisiveBattles, timeLimitBattles:battles.length-decisiveBattles,
  avgObjectivesPerBattle:battles.length?+(objectiveTotal/battles.length).toFixed(2):0,
  objectivesNeverOwned:neverOwnedTotal, objectivesNeverOwnedRate:pct(neverOwnedTotal,objectiveTotal), objectivesNeverContested:neverContestedTotal,
  avgSquadObjectiveSpread:{us:+mean(battles.map(b=>+b.squadObjectiveSpread?.us||0)).toFixed(2),ge:+mean(battles.map(b=>+b.squadObjectiveSpread?.ge||0)).toFixed(2)},
  movementStallPhases, movementStallStates, vacantStallPhases, loopWatchAlerts,
  pageErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.pageErrors||0),0),
  consoleErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.consoleErrors||0),0),
  assetLoadErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.assetLoadErrors||0),0),
  browserErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.browserErrors||0),0), browserWarnings:shards.reduce((n,x)=>n+(+x.payload.summary?.browserWarnings||0),0)
};
const pageErrors=shards.flatMap(x=>x.payload.pageErrors||[]), consoleErrors=shards.flatMap(x=>x.payload.consoleErrors||[]);
const browserErrors=shards.flatMap(x=>x.payload.browserErrors||[]), browserWarnings=shards.flatMap(x=>x.payload.browserWarnings||[]);
const payload={summary,policy:first.policy||null,shards:shards.map(x=>({file:x.file,summary:x.payload.summary})),pageErrors,consoleErrors:consoleErrors.slice(0,200),browserErrors,browserWarnings:browserWarnings.slice(0,200),battles};
fs.writeFileSync(path.join(outputDir,'battle-benchmark.json'),JSON.stringify(payload,null,2));
const headers=['seed','winner','winReason','simulatedSeconds','wallSeconds','usAlive','geAlive','usObjectives','geObjectives','objectiveCount','objectivesNeverOwned','usSquadSpread','geSquadSpread','captures','neutralizations','maxNoObjectiveProgressSeconds','vacantObjectiveStalls','movementStalls'];
const cell=(b,h)=>{if(h==='vacantObjectiveStalls'||h==='movementStalls')return b[h]?.length||0;if(h==='usSquadSpread')return b.squadObjectiveSpread?.us??0;if(h==='geSquadSpread')return b.squadObjectiveSpread?.ge??0;return b[h];};
const lines=[headers.join(',')];for(const b of battles)lines.push(headers.map(h=>csv(cell(b,h))).join(','));fs.writeFileSync(path.join(outputDir,'battle-benchmark.csv'),lines.join('\n')+'\n');
/* Same outcome-weighted ranking as the single-process runner: objectives nobody ever took and
   long intervals with no objective progress, not raw movement-stall counts (measured across the
   first three 100-battle runs as uncorrelated with the result, r = -0.03 against captures). */
const badness=x=>(+x.objectivesNeverOwned||0)*220+(+x.captures===0?300:0)+(+x.maxNoObjectiveProgressSeconds||0)+(x.vacantObjectiveStalls?.length||0)*120+(x.movementStalls?.length||0)*25;
const problematic=[...battles].sort((a,b)=>badness(b)-badness(a)).slice(0,20);
const md=['# 100-battle headless benchmark','',`- Commit: \`${summary.commit}\``,`- Build: \`${summary.build||'unknown'}\``,`- Policy: ${summary.policySource}, revision ${summary.policyRevision}`,`- Parallel shards: **${summary.shardCount}**`,`- Completed: **${summary.completedBattles}/${summary.requestedBattles}** battles in about **${summary.parallelWallSeconds}s parallel wall time** (${summary.realtimeMultiplier}× real-time, ${summary.battlesPerMinute} battles/min)`,`- Results: US **${winners.us||0}** (${summary.usWinRate}), GER **${winners.ge||0}** (${summary.geWinRate}), draw/none **${(winners.draw||0)+(winners.none||0)}** (${summary.drawRate})`,`- Battle duration: avg **${summary.avgBattleSeconds}s**, p50 **${summary.p50BattleSeconds}s**, p95 **${summary.p95BattleSeconds}s**`,`- Decisive finishes: **${summary.decisiveBattles}**; ran out the clock: **${summary.timeLimitBattles}**`,`- Captures: avg **${summary.avgCaptures}** of **${summary.avgObjectivesPerBattle}** objectives; no-capture battles **${summary.noCaptureBattles}**`,`- Objectives nobody ever owned: **${summary.objectivesNeverOwned}** (${summary.objectivesNeverOwnedRate} of all objectives); never even contested: **${summary.objectivesNeverContested}**`,`- Distinct objectives a side's squads were assigned to (mean): US **${summary.avgSquadObjectiveSpread.us}**, GER **${summary.avgSquadObjectiveSpread.ge}**`,`- Vacant enemy-objective stalls: **${summary.vacantObjectiveStalls} events across ${summary.vacantObjectiveStallBattles} battles**`,`- Movement stalls while ordered to advance: **${summary.movementStalls} events across ${summary.movementStallBattles} battles**`,`- Interval without objective-state progress: longest **${summary.maxNoObjectiveProgressSeconds}s**, mean per battle **${summary.avgNoObjectiveProgressSeconds}s**`,`- Uncaught page exceptions: **${summary.pageErrors}**; other console errors: **${summary.consoleErrors}**; asset/network failures: **${summary.assetLoadErrors}**; warnings: **${summary.browserWarnings}**`];
const table=(title,obj)=>{const e=Object.entries(obj||{});if(!e.length)return;md.push('',`### ${title}`,'');for(const [k,n] of e.slice(0,12))md.push(`- \`${k}\`: ${n}`);};
table('Movement stalls by squad phase',summary.movementStallPhases);
table('Movement stalls by engagement state',summary.movementStallStates);
table('Vacant-objective stalls by squad phase',summary.vacantStallPhases);
table('Loop Watch alerts by kind',summary.loopWatchAlerts);
md.push('','## Most problematic runs','','| Seed | Winner | Time | Captures | Never owned | Spread us/ge | Vacant stalls | Move stalls | Max no-progress |','|---|---|---:|---:|---:|---|---:|---:|---:|');
for(const b of problematic)md.push(`| \`${b.seed}\` | ${b.winner} | ${b.simulatedSeconds}s | ${b.captures}/${b.objectiveCount} | ${b.objectivesNeverOwned} | ${b.squadObjectiveSpread?.us??'-'}/${b.squadObjectiveSpread?.ge??'-'} | ${b.vacantObjectiveStalls?.length||0} | ${b.movementStalls?.length||0} | ${b.maxNoObjectiveProgressSeconds}s |`);
if(pageErrors.length||consoleErrors.length){md.push('','## Runtime errors','','Uncaught page exceptions first, then other console errors. Asset/network failures are counted in the summary and deliberately not listed: they are a harness/deployment signal, not a runtime defect.','');for(const e of [...pageErrors,...consoleErrors].slice(0,20))md.push(`- \`${String(e).replaceAll('`',"'")}\``);}
fs.writeFileSync(path.join(outputDir,'battle-benchmark.md'),md.join('\n')+'\n');
console.log('BENCHMARK_SUMMARY '+JSON.stringify(summary));console.log(md.join('\n'));

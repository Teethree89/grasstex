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
  browserErrors:shards.reduce((n,x)=>n+(+x.payload.summary?.browserErrors||0),0), browserWarnings:shards.reduce((n,x)=>n+(+x.payload.summary?.browserWarnings||0),0)
};
const browserErrors=shards.flatMap(x=>x.payload.browserErrors||[]), browserWarnings=shards.flatMap(x=>x.payload.browserWarnings||[]);
const payload={summary,policy:first.policy||null,shards:shards.map(x=>({file:x.file,summary:x.payload.summary})),browserErrors,browserWarnings:browserWarnings.slice(0,200),battles};
fs.writeFileSync(path.join(outputDir,'battle-benchmark.json'),JSON.stringify(payload,null,2));
const headers=['seed','winner','winReason','simulatedSeconds','wallSeconds','usAlive','geAlive','usObjectives','geObjectives','captures','neutralizations','maxNoObjectiveProgressSeconds','vacantObjectiveStalls','movementStalls'];
const lines=[headers.join(',')];for(const b of battles)lines.push(headers.map(h=>csv(h==='vacantObjectiveStalls'||h==='movementStalls'?(b[h]?.length||0):b[h])).join(','));fs.writeFileSync(path.join(outputDir,'battle-benchmark.csv'),lines.join('\n')+'\n');
const problematic=[...battles].sort((a,b)=>((b.vacantObjectiveStalls?.length||0)*1000+(b.movementStalls?.length||0)*100+(b.captures===0?20:0)+(+b.maxNoObjectiveProgressSeconds||0))-((a.vacantObjectiveStalls?.length||0)*1000+(a.movementStalls?.length||0)*100+(a.captures===0?20:0)+(+a.maxNoObjectiveProgressSeconds||0))).slice(0,20);
const md=['# 100-battle headless benchmark','',`- Commit: \`${summary.commit}\``,`- Build: \`${summary.build||'unknown'}\``,`- Policy: ${summary.policySource}, revision ${summary.policyRevision}`,`- Parallel shards: **${summary.shardCount}**`,`- Completed: **${summary.completedBattles}/${summary.requestedBattles}** battles in about **${summary.parallelWallSeconds}s parallel wall time** (${summary.realtimeMultiplier}× real-time, ${summary.battlesPerMinute} battles/min)`,`- Results: US **${winners.us||0}** (${summary.usWinRate}), GER **${winners.ge||0}** (${summary.geWinRate}), draw/none **${(winners.draw||0)+(winners.none||0)}** (${summary.drawRate})`,`- Battle duration: avg **${summary.avgBattleSeconds}s**, p50 **${summary.p50BattleSeconds}s**, p95 **${summary.p95BattleSeconds}s**`,`- Captures: avg **${summary.avgCaptures}**, no-capture battles **${summary.noCaptureBattles}**`,`- Vacant enemy-objective stalls: **${summary.vacantObjectiveStalls} events across ${summary.vacantObjectiveStallBattles} battles**`,`- Movement stalls while ordered to advance: **${summary.movementStalls} events across ${summary.movementStallBattles} battles**`,`- Longest interval without objective-state progress: **${summary.maxNoObjectiveProgressSeconds}s**`,`- Browser/runtime errors: **${summary.browserErrors}**; warnings: **${summary.browserWarnings}**`,'','## Most problematic runs','','| Seed | Winner | Time | Captures | Vacant stalls | Move stalls | Max no-progress |','|---|---|---:|---:|---:|---:|---:|'];
for(const b of problematic)md.push(`| \`${b.seed}\` | ${b.winner} | ${b.simulatedSeconds}s | ${b.captures} | ${b.vacantObjectiveStalls?.length||0} | ${b.movementStalls?.length||0} | ${b.maxNoObjectiveProgressSeconds}s |`);
if(browserErrors.length){md.push('','## Browser/runtime errors','');for(const e of browserErrors.slice(0,20))md.push(`- \`${String(e).replaceAll('`',"'")}\``);}
fs.writeFileSync(path.join(outputDir,'battle-benchmark.md'),md.join('\n')+'\n');
console.log('BENCHMARK_SUMMARY '+JSON.stringify(summary));console.log(md.join('\n'));

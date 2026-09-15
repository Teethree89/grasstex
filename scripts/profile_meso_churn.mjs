import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url=process.env.BATTLE_PROFILE_URL||'http://127.0.0.1:8765/grasstex/battle_sim_local.php';
const seed=String(process.env.BATTLE_PROFILE_SEED||'standard-benchmark-meeting-s1-b0001-0001');
const battleType=String(process.env.BATTLE_PROFILE_TYPE||'meeting');
const fixedDt=Math.max(.05,Math.min(.3,Number.parseFloat(process.env.BATTLE_PROFILE_STEP||'.15')||.15));
const simSeconds=Math.max(15,Math.min(600,Number.parseFloat(process.env.BATTLE_PROFILE_SECONDS||'120')||120));
const outputDir=path.resolve(process.env.BATTLE_PROFILE_OUTPUT||'reports/meso-churn');
const policyUrl=process.env.BATTLE_BENCHMARK_POLICY_URL||'https://test.ivandpopov.com/grasstex/battle_policy.php';
const commit=process.env.BATTLE_BENCHMARK_SOURCE_SHA||process.env.GITHUB_SHA||'local';
fs.mkdirSync(outputDir,{recursive:true});

async function getPolicy(){
  try{const r=await fetch(policyUrl,{headers:{'cache-control':'no-cache'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();return{source:j?.genome?'live-policy-endpoint':'runtime-default',revision:Number(j?.revision||0),genome:j?.genome||null};}
  catch(e){return{source:'runtime-default',revision:0,genome:null,warning:String(e?.message||e)};}
}

const policy=await getPolicy(),browserErrors=[];
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>browserErrors.push(String(e?.stack||e)));
  await page.route('**/*',async route=>{const t=route.request().resourceType();return(t==='media'||t==='font')?route.abort():route.continue();});
  const pageUrl=`${url}${url.includes('?')?'&':'?'}seed=${encodeURIComponent(seed)}`;
  await page.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>!!(window.__battle__&&window.BattleCommanderAI&&window.BattleAIPolicy&&window.BattleModules),null,{timeout:120000});
  await page.addScriptTag({path:path.resolve('scripts/battle-hotpath-profiler.cjs')});
  await page.addScriptTag({path:path.resolve('scripts/meso-churn-profiler.cjs')});
  await page.addScriptTag({path:path.resolve('scripts/physical-point-profiler.cjs')});
  await page.addScriptTag({path:path.resolve('scripts/movement-goal-transition-profiler.cjs')});

  const result=await page.evaluate(async({fixedDt,simSeconds,suppliedPolicy})=>{
    const root=window,sim=root.__battle__,engine=sim.scene?.getEngine?.(),renderLoop=root.__battleRenderLoop__;
    if(engine&&renderLoop)engine.stopRenderLoop(renderLoop);sim.pause();
    const telemetry=root.BattleTelemetry||null;if(telemetry?.end)try{await telemetry.end(sim,'meso-profile-start');}catch(_){}
    if(telemetry){telemetry.record=function(){};telemetry.start=function(){};telemetry.ensure=function(){};telemetry.end=async()=>true;telemetry.checkpoint=async()=>true;telemetry.flush=async()=>true;}
    const baseline=suppliedPolicy?.genome||root.BattleAIPolicy.get(),rawRestart=sim._controlRawRestart||sim.restart.bind(sim);
    root.BattleAIPolicy.setMatchPolicies(sim,baseline,baseline);sim.trainingMode=true;root.BattleSoldierModel?.setImportedEnabled?.(sim.scene,false);rawRestart();
    sim.manualEnded=false;sim.winner=null;sim.winReason=null;sim.paused=false;sim.timeScale=1;sim.timeLimit=simSeconds;
    const hot=root.BattleHotpathProfiler,meso=root.BattleMesoChurnProfiler,physical=root.BattlePhysicalPointProfiler,goalTransitions=root.BattleMovementGoalTransitionProfiler;
    if(!hot||!meso||!physical||!goalTransitions)throw new Error('profilers failed to load');hot.reset();meso.reset();physical.reset();goalTransitions.reset();
    const commandTick=+root.BattleCommanderAI.commandTick||.45,maxSteps=Math.ceil((simSeconds+2)/fixedDt);let commandAccum=0,steps=0;const wallStart=performance.now();
    while(!sim.winner&&sim.time<simSeconds+.5&&steps<maxSteps){
      sim._trainerStepActive=true;try{sim.step?sim.step(fixedDt):sim._frame(fixedDt);}finally{sim._trainerStepActive=false;}steps++;commandAccum+=fixedDt;
      while(commandAccum+1e-9>=commandTick&&!sim.winner){commandAccum-=commandTick;root.BattleCommanderAI.update(sim,root.__scenario__||sim.scene?.metadata?.battleScenario||null,commandTick);}
    }
    if(!sim.winner&&sim._checkWinner)sim._checkWinner();
    const wallSeconds=(performance.now()-wallStart)/1000;
    return{build:root.BATTLE_BUILD||null,policyRevision:suppliedPolicy?.revision||root.BattleAIPolicy.revision||0,simulatedSeconds:+(+sim.time||0).toFixed(2),wallSeconds:+wallSeconds.toFixed(3),realtimeMultiplier:wallSeconds>0?+((+sim.time||0)/wallSeconds).toFixed(2):0,steps,hot:hot.snapshot(120),meso:meso.snapshot(),physical:physical.snapshot(),goalTransitions:goalTransitions.snapshot(),squadCommand:sim._squadCommandSummary||null,movementGoalStats:sim._movementGoalStats||null,tacticalRouteStats:sim._tacticalRouteStats||null};
  },{fixedDt,simSeconds,suppliedPolicy:policy});

  const report={generatedAt:new Date().toISOString(),commit,build:result.build,battleType,seed,url,fixedDt,requestedSimSeconds:simSeconds,policy:{source:policy.source,revision:result.policyRevision,warning:policy.warning||null},...result,browserErrors};
  fs.writeFileSync(path.join(outputDir,'meso-churn-profile.json'),JSON.stringify(report,null,2)+'\n');
  const c=result.meso?.counts||{},pc=result.physical?.counts||{},gc=result.goalTransitions?.counts||{},hotRows=result.hot?.rows||[],pick=label=>hotRows.find(r=>r.label===label)?.calls||0;
  const summary={
    seed,battleType,wallSeconds:result.wallSeconds,
    goalShift:pick('navigation.physicalReplanReason.goal-shift'),
    squadStabilityGoalShift:pick('navigation.physicalReplan.goal-shift.owner.squad-stability'),
    fireteamProposals:c['proposeOrder.fireteam']||0,intentPublishes:c.intentPublishes||0,destinationChanges:c['fireteamDestination.changed']||0,
    signatureDestinationChanges:c['destinationChange.signatureChanged']||0,sameSignatureDestinationChanges:c['destinationChange.sameSignature']||0,slotDrift:c['destinationChange.slotDrift']||0,
    recommits:c['fireteamOrder.recommitted']||0,signatureRecommits:c['fireteamOrder.recommit.signatureChanged']||0,sameSignatureRecommits:c['fireteamOrder.recommit.sameSignature']||0,
    physicalDestinationChanges:pc['physicalDestination.changed']||0,
    physicalDirect:pc['producer.direct-pick']||0,
    physicalTacticalRoute:pc['producer.tactical-route']||0,
    physicalFiringStation:pc['producer.firing-station']||0,
    physicalLegalized:Object.entries(pc).filter(([k])=>k.includes('+legalize')).reduce((n,[,v])=>n+v,0),
    physicalSameHighLevelPick:pc['physicalChange.sameHighLevelPick']||0,
    physicalHighLevelPickChanged:pc['physicalChange.highLevelPickChanged']||0,
    squadStabilityPhysical:pc['squadStabilityPhysical.changed']||0,
    squadStabilityDirect:pc['squadStabilityProducer.direct-pick']||0,
    squadStabilityTacticalRoute:pc['squadStabilityProducer.tactical-route']||0,
    squadStabilitySameHighLevelPick:pc['squadStabilityPhysical.sameHighLevelPick']||0,
    squadStabilityHighLevelPickChanged:pc['squadStabilityPhysical.highLevelPickChanged']||0,
    squadStabilityRouteWaypointChanged:pc['squadStabilityPhysical.routeWaypointChanged']||0,
    movementGoalPhysicalChanges:gc.physicalChanged||0,
    movementGoalPhysicalChangesAfterWarmup:gc['physicalChanged.afterWarmup']||0,
    squadStabilityPhysicalAfterWarmup:gc['squadStabilityPhysical.afterWarmup']||0,
    squadStabilityIntraFormation:gc['squadStabilityPhysical.intraFormation']||0,
    squadStabilityIntraFormationPointChanged:gc['squadStabilityPhysical.intraFormation.pointChanged']||0,
    squadStabilityOwnershipReturns:gc['squadStabilityPhysical.ownershipReturn']||0,
    squadStabilityGoalMatchesFireteam:gc['squadStabilityPhysical.goalMatchesFireteam']||0,
    squadStabilityGoalDiffersFireteam:gc['squadStabilityPhysical.goalDiffersFireteam']||0,
    squadStabilityOrderMatchesFireteam:gc['squadStabilityPhysical.orderMatchesFireteam']||0,
    squadStabilityOrderDiffersFireteam:gc['squadStabilityPhysical.orderDiffersFireteam']||0,
    routePlanCreated:pc['tacticalRoute.planCreated']||0,routeStepAdvanced:pc['tacticalRoute.stepAdvanced']||0,routePlanCleared:pc['tacticalRoute.planCleared']||0,
    signatureComponents:Object.fromEntries(Object.entries(c).filter(([k])=>k.startsWith('signatureComponent.')||k.startsWith('destinationSignatureComponent.'))),
    routeReasons:result.physical?.routeReasons||[],
    movementGoalTransitions:(result.goalTransitions?.transitions||[]).slice(0,20)
  };
  fs.writeFileSync(path.join(outputDir,'meso-churn-summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('MESO_CHURN_SUMMARY '+JSON.stringify(summary));
  console.log('PHYSICAL_POINT_COUNTS '+JSON.stringify(result.physical?.counts||{}));
  console.log('MOVEMENT_GOAL_TRANSITION_COUNTS '+JSON.stringify(result.goalTransitions?.counts||{}));
  console.log('MOVEMENT_GOAL_TRANSITIONS '+JSON.stringify((result.goalTransitions?.transitions||[]).slice(0,30)));
  console.log('PHYSICAL_POINT_ROUTE_REASONS '+JSON.stringify(result.physical?.routeReasons||[]));
  console.log('MESO_CHURN_TOP_SIGNATURES '+JSON.stringify(result.meso?.signatureTransitions?.slice(0,20)||[]));
  if(browserErrors.length)throw new Error('Browser exceptions: '+browserErrors.join('\n'));
}finally{await browser.close();}

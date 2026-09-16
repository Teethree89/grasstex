import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// Visual validation trigger: regenerated Mixamo runtime assets v8.
const outDir=path.resolve(process.env.SKELETAL_VISUAL_OUTPUT||'artifacts/skeletal-soldier-visual');
fs.mkdirSync(outDir,{recursive:true});
const url=process.env.SKELETAL_VISUAL_URL||'http://127.0.0.1:8765/grasstex/battle_sim_local.php?seed=skeletal-visual-check';
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const pageErrors=[],consoleErrors=[];
const safe=v=>String(v).replaceAll('.','-').replaceAll('>','-');
try{
 const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:1});
 page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__battle__&&window.BattleSkeletalSoldierBackend&&window.BattleMixamoDiagnostics&&window.__battle__._roster?.us?.length&&window.__battle__._roster?.ge?.length,null,{timeout:120000});
 await page.waitForFunction(()=>window.__battle__._roster.us[0]._skeletal?.backend==='native-mixamo-v1'&&window.__battle__._roster.ge[0]._skeletal?.backend==='native-mixamo-v1',null,{timeout:120000});
 const initialStatus=await page.evaluate(()=>{const sim=window.__battle__,one=f=>sim._roster[f][0],sum=s=>({faction:s.faction,driver:s.animationBinding?.backend||null,skin:s._skeletal?.backend||null,retargeter:s._skeletal?.retargeter||null,targetCount:Object.keys(s._skeletal?.targets||{}).length,current:s._skeletal?.currentName||null,missing:Object.keys(s._skeletal?.missing||{})});return{us:sum(one('us')),ge:sum(one('ge')),version:window.BattleSkeletalSoldierBackend.version,retargeter:window.BattleSkeletalSoldierBackend.retargeter,engine:window.BABYLON?.Engine?.Version||null,hasAnimatorAvatar:typeof window.BABYLON?.AnimatorAvatar==='function',asset:window.BattleSkeletalSoldierBackend.asset};});
 if(!initialStatus.hasAnimatorAvatar||initialStatus.retargeter!=='AnimatorAvatar'||!String(initialStatus.engine||'').startsWith('9.26.'))throw Error('Babylon AnimatorAvatar runtime not active: '+JSON.stringify(initialStatus));
 for(const side of ['us','ge']){const s=initialStatus[side];if(s.skin!=='native-mixamo-v1'||s.driver!=='native-mixamo-v1'||s.retargeter!=='AnimatorAvatar'||s.targetCount<12)throw Error('Native Mixamo binding incomplete: '+JSON.stringify(initialStatus));}
 const diagnostics={initialStatus,pageErrors,consoleErrors};
 fs.writeFileSync(path.join(outDir,'visual-check.json'),JSON.stringify(diagnostics,null,2));
 await page.screenshot({path:path.join(outDir,'runtime.png'),fullPage:true});
} finally {
 await browser.close();
}

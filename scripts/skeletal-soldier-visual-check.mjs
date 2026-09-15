import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.env.SKELETAL_VISUAL_OUTPUT || 'reports/skeletal-soldier');
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.SKELETAL_VISUAL_URL || 'http://127.0.0.1:8765/grasstex/battle_sim_local.php?seed=skeletal-visual-check';
const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(String(e?.stack||e)));
  page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__battle__ && window.BattleSkeletalSoldierBackend && window.__battle__._roster?.us?.length && window.__battle__._roster?.ge?.length,{timeout:120000});
  await page.waitForFunction(()=>window.__battle__._roster.us[0]._skeletal && window.__battle__._roster.ge[0]._skeletal,{timeout:120000});

  const status=await page.evaluate(()=>{
    const sim=window.__battle__, one=f=>sim._roster[f][0];
    const summarize=s=>({faction:s.faction,backend:s.animationBinding?.backend||null,mapped:s._skeletal?.mapped||0,asset:s._skeletal?.faction||null,dead:!!s.dead});
    return {us:summarize(one('us')),ge:summarize(one('ge')),mapCount:window.BattleSkeletalSoldierBackend.map.length,asset:window.BattleSkeletalSoldierBackend.asset};
  });
  fs.writeFileSync(path.join(outDir,'status.json'),JSON.stringify({status,errors},null,2));
  if(status.us.backend!=='runtime-mixamo-driver'||status.ge.backend!=='runtime-mixamo-driver') throw new Error('Both factions did not bind runtime Mixamo backend');
  if(status.us.mapped<12||status.ge.mapped<12) throw new Error('Incomplete skeleton map: '+JSON.stringify(status));

  await page.screenshot({path:path.join(outDir,'battle-overview.png'),fullPage:true});
  await page.click('#animationLabToggle');
  await page.waitForSelector('#animationLab:not([hidden])');
  const poses=['idle','walk','aim','fire','reload','walk-aim','crouch','crouch-walk','crouch-aim','prone','prone-crawl','death.front','death.back','death.side'];
  for(const pose of poses){
    await page.selectOption('#animationLabPose',pose);
    await page.waitForTimeout(pose.startsWith('death.')?900:(pose==='reload'?600:300));
    await page.locator('#animationLab').screenshot({path:path.join(outDir,pose.replaceAll('.','-')+'.png')});
  }

  // Exercise every authored stance transition on a live skeletal soldier. We record pose-root and
  // transition state as a deterministic structural guard; the motion-lab screenshots cover visual pose quality.
  const transitions=await page.evaluate(()=>{
    const M=window.BattleSoldierModel,s=window.__battle__._roster.us[0],out=[];
    function settle(){for(let i=0;i<20;i++)M.animateWalk(s,.08,0);}
    function snap(label){out.push({label,crouching:!!s.crouching,prone:!!s.prone,active:s._stanceVisualTransition?.key||null,root:{x:+s.poseRoot.position.x.toFixed(4),y:+s.poseRoot.position.y.toFixed(4),z:+s.poseRoot.position.z.toFixed(4)}});}
    M.setProne(s,false);M.setCrouch(s,false);settle();
    M.setCrouch(s,true);M.animateWalk(s,.17,0);snap('stand>crouch-mid');settle();
    M.setCrouch(s,false);M.animateWalk(s,.16,0);snap('crouch>stand-mid');settle();
    M.setProne(s,true);M.animateWalk(s,.46,0);snap('stand>prone-mid');settle();
    M.setProne(s,false);M.animateWalk(s,.51,0);snap('prone>stand-mid');settle();
    M.setCrouch(s,true);settle();M.setProne(s,true);M.animateWalk(s,.34,0);snap('crouch>prone-mid');settle();
    M.setProne(s,false);M.animateWalk(s,.38,0);snap('prone>crouch-mid');settle();
    return out;
  });
  fs.writeFileSync(path.join(outDir,'transitions.json'),JSON.stringify(transitions,null,2));

  if(errors.length) throw new Error('Browser console/page errors: '+errors.join('\n'));
  console.log(JSON.stringify({ok:true,status,poses,transitions},null,2));
} finally { await browser.close(); }

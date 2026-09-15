import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.env.SKELETAL_VISUAL_OUTPUT || 'reports/skeletal-soldier');
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.SKELETAL_VISUAL_URL || 'http://127.0.0.1:8765/grasstex/battle_sim_local.php?seed=skeletal-visual-check';
const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const pageErrors=[], consoleErrors=[];

function safeName(v){return String(v).replaceAll('.','-').replaceAll('>','-to-');}

try {
  const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:1});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__battle__ && window.BattleSkeletalSoldierBackend && window.__battle__._roster?.us?.length && window.__battle__._roster?.ge?.length,null,{timeout:120000});
  await page.waitForFunction(()=>window.__battle__._roster.us[0]._skeletal && window.__battle__._roster.ge[0]._skeletal,null,{timeout:120000});

  const initialStatus=await page.evaluate(()=>{
    const sim=window.__battle__, one=f=>sim._roster[f][0];
    const summarize=s=>({faction:s.faction,driverBackend:s.animationBinding?.backend||null,skinBackend:s._skeletal?.backend||null,mapped:s._skeletal?.mapped||0,asset:s._skeletal?.faction||null});
    return {us:summarize(one('us')),ge:summarize(one('ge')),mapCount:window.BattleSkeletalSoldierBackend.map.length,asset:window.BattleSkeletalSoldierBackend.asset};
  });
  for(const side of ['us','ge']){
    const s=initialStatus[side];
    if(s.skinBackend!=='runtime-mixamo-skin') throw new Error(`${side} did not bind Mixamo skin: ${JSON.stringify(initialStatus)}`);
    if(!(s.driverBackend==='baked-procedural-v2'||String(s.driverBackend).startsWith('procedural'))) throw new Error(`${side} lost authoritative procedural animation driver: ${JSON.stringify(initialStatus)}`);
    if(s.mapped<12) throw new Error('Incomplete skeleton map: '+JSON.stringify(initialStatus));
  }

  await page.evaluate(()=>{
    const root=window,sim=root.__battle__,scene=sim.scene,M=root.BattleSoldierModel,W=root.BattleWeapons,B=root.BABYLON;
    sim.pause();
    for(const mesh of scene.meshes.slice())try{mesh.setEnabled(false);}catch(_){ }
    scene.fogMode=B.Scene.FOGMODE_NONE;
    scene.clearColor=new B.Color4(.18,.20,.22,1);
    for(const el of document.querySelectorAll('#hud,#hudToggle,#animationLab,#animationLabToggle,#banner'))el.style.display='none';
    const old=scene.activeCamera;try{old?.detachControl?.();}catch(_){ }
    const cam=new B.FreeCamera('__skeletalVisualCamera',new B.Vector3(2.35,1.18,3.25),scene);
    cam.minZ=.05;cam.maxZ=100;cam.fov=.72;cam.setTarget(new B.Vector3(0,.88,0));scene.activeCamera=cam;
    const hemi=new B.HemisphericLight('__skeletalVisualHemi',new B.Vector3(.25,1,.15),scene);hemi.intensity=1.25;hemi.groundColor=new B.Color3(.22,.22,.22);
    const key=new B.DirectionalLight('__skeletalVisualKey',new B.Vector3(-.4,-1,-.5),scene);key.intensity=.65;key.position=new B.Vector3(3,5,4);

    function disposeSubject(){const s=root.__skeletalVisualSubject;if(s&&s.root)try{s.root.dispose();}catch(_){ }root.__skeletalVisualSubject=null;}
    function make(faction){
      disposeSubject();
      const s=M.createSoldier(scene,faction,'rifleman',null);
      s.root.position.set(0,0,0);s.root.rotation.y=0;
      s.weapon=W.attachWeapon(scene,s.weaponSocket,'rifle');
      s.speed=1;s.moveSpeed=0;s.moving=false;s.target=null;s.crouching=false;s.tacticalCrouch=false;s.prone=false;s.crawling=false;s.reloading=false;s.dead=false;s.suppressedUntil=0;s.deathSide=1;
      root.__skeletalVisualSubject=s;return s;
    }
    function tick(s,seconds,speed){const dt=.05,n=Math.max(1,Math.ceil(seconds/dt));for(let i=0;i<n;i++)M.animateWalk(s,dt,speed||0);}
    function target(s){return{root:{position:new B.Vector3(s.root.position.x,s.root.position.y+1.15,s.root.position.z+6)}};}
    function summary(s,label){
      const roots=s._skeletal?.entry?.rootNodes||[],meshes=[];
      for(const r of roots){if(r.getChildMeshes)for(const m of r.getChildMeshes(false))if(!meshes.includes(m))meshes.push(m);if(r.getTotalVertices&&!meshes.includes(r))meshes.push(r);}
      let verts=0,min=new B.Vector3(Infinity,Infinity,Infinity),max=new B.Vector3(-Infinity,-Infinity,-Infinity),bounded=0;
      for(const m of meshes){try{verts+=m.getTotalVertices?.()||0;m.computeWorldMatrix(true);const bb=m.getBoundingInfo?.().boundingBox;if(bb){min=B.Vector3.Minimize(min,bb.minimumWorld);max=B.Vector3.Maximize(max,bb.maximumWorld);bounded++;}}catch(_){}}
      return{label,faction:s._skeletal?.faction||null,backend:s._skeletal?.backend||null,driverBackend:s.animationBinding?.backend||null,mapped:s._skeletal?.mapped||0,meshCount:meshes.length,boundedMeshes:bounded,vertices:verts,bounds:bounded?{min:[min.x,min.y,min.z],max:[max.x,max.y,max.z],size:[max.x-min.x,max.y-min.y,max.z-min.z]}:null};
    }
    function pose(faction,name){
      const s=make(faction);
      if(name==='bind')return summary(s,name);
      tick(s,.2,0);
      const moving=name==='walk'||name==='walk-aim'||name==='crouch-walk'||name==='prone-crawl';
      if(name==='aim'||name==='fire'||name==='reload'||name==='walk-aim'||name==='crouch-aim')s.target=target(s);
      if(name==='crouch'||name==='crouch-walk'||name==='crouch-aim'){M.setCrouch(s,true);tick(s,.65,0);}
      if(name==='prone'||name==='prone-crawl'){M.setProne(s,true);tick(s,1.25,0);}
      if(name==='reload'){s.reloading=true;M.triggerAnimation(s,M.TAGS.reload,{duration:2.6});}
      if(name==='fire')M.triggerAnimation(s,M.TAGS.fire,{});
      if(name.startsWith('death.')){s.dead=true;s.deathVariant=name.slice(6);s.deathSide=1;s.deathTag=name;M.triggerAnimation(s,name,{});}
      s.moving=moving;s.moveSpeed=moving?.65:0;
      const seconds=name.startsWith('death.')?.9:(name==='reload'?.7:(moving?.5:.3));tick(s,seconds,moving?(name==='prone-crawl'?.25:.65):0);
      return summary(s,name);
    }
    function transition(faction,from,to,midSeconds){
      const s=make(faction);
      if(from==='crouch'){M.setCrouch(s,true);tick(s,.7,0);}
      if(from==='prone'){M.setProne(s,true);tick(s,1.3,0);if(to==='crouch')M.setCrouch(s,true);}
      if(to==='crouch'&&from==='stand')M.setCrouch(s,true);
      else if(to==='stand'&&from==='crouch')M.setCrouch(s,false);
      else if(to==='prone')M.setProne(s,true);
      else if(from==='prone')M.setProne(s,false);
      tick(s,midSeconds,0);
      const info=summary(s,from+'>'+to);info.transition=s._stanceVisualTransition?.key||null;info.flags={crouching:!!s.crouching,prone:!!s.prone};return info;
    }
    root.__skeletalVisualHarness={pose,transition,disposeSubject};
  });

  const results={initialStatus,poses:[],transitions:[],consoleErrors};
  async function capturePose(faction,pose){
    const info=await page.evaluate(({faction,pose})=>window.__skeletalVisualHarness.pose(faction,pose),{faction,pose});
    if(info.backend!=='runtime-mixamo-skin'||!(info.driverBackend==='baked-procedural-v2'||String(info.driverBackend).startsWith('procedural'))||info.mapped<12||info.meshCount<1||info.vertices<1)throw new Error('Skeletal subject not visibly driven by authoritative animation rig: '+JSON.stringify(info));
    await page.waitForTimeout(90);
    await page.locator('#renderCanvas').screenshot({path:path.join(outDir,`${faction}-${safeName(pose)}.png`)});
    results.poses.push(info);
  }
  async function captureTransition(from,to,midSeconds){
    const info=await page.evaluate(({from,to,midSeconds})=>window.__skeletalVisualHarness.transition('us',from,to,midSeconds),{from,to,midSeconds});
    const expected=`${from}>${to}`;
    if(info.transition!==expected)throw new Error(`Expected active transition ${expected}, got ${info.transition}: ${JSON.stringify(info)}`);
    await page.waitForTimeout(90);
    await page.locator('#renderCanvas').screenshot({path:path.join(outDir,`us-transition-${safeName(expected)}.png`)});
    results.transitions.push(info);
  }

  const usPoses=['bind','idle','walk','aim','fire','reload','walk-aim','crouch','crouch-walk','crouch-aim','prone','prone-crawl','death.front','death.back','death.side'];
  for(const pose of usPoses)await capturePose('us',pose);
  for(const pose of ['bind','idle','walk','aim','crouch','prone'])await capturePose('ge',pose);

  await captureTransition('stand','crouch',.17);
  await captureTransition('crouch','stand',.16);
  await captureTransition('stand','prone',.46);
  await captureTransition('prone','stand',.51);
  await captureTransition('crouch','prone',.34);
  await captureTransition('prone','crouch',.38);

  results.pageErrors=pageErrors;
  fs.writeFileSync(path.join(outDir,'visual-check.json'),JSON.stringify(results,null,2));
  if(pageErrors.length)throw new Error('Browser page exceptions: '+pageErrors.join('\n'));
  console.log(JSON.stringify({ok:true,status:initialStatus,poseCount:results.poses.length,transitionCount:results.transitions.length,resourceConsoleErrors:consoleErrors.length},null,2));
} finally { await browser.close(); }

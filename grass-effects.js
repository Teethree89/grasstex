/* v61 grass shadows: amortized world-space directional blob splat with exclusion erase pass.
   Shadows are painted into an offscreen working canvas over multiple frames, then atomically
   swapped into the terrain texture. GrassAPI exclusion shapes are erased afterward, so roads,
   buildings, walls, etc. can remove shadows without per-clump mask checks or stale road shadows. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined'||typeof V==='undefined')return;

  var SHADOW_END=165,REBUILD_MOVE=8.0,BUDGET_MS=1.25;
  var shared=window.SunModel;
  var sunDir=(shared&&shared.lightDir)?shared.lightDir:((typeof sun!=='undefined'&&sun.direction)?sun.direction:new BABYLON.Vector3(-.4705,-.0993,.8767));
  var hx=sunDir.x,hz=sunDir.z,hlen=Math.hypot(hx,hz)||1;hx/=hlen;hz/=hlen;
  var sunElev=Math.atan2(-sunDir.y,Math.max(.0001,Math.hypot(sunDir.x,sunDir.z)));
  var SHADOW_STRETCH=BABYLON.Scalar.Clamp(1/Math.tan(Math.max(sunElev,.09)),1.4,4.2);

  var lastX=1e9,lastZ=1e9,lastDen=-1,lastRevision=-1,lastNear=-1,lastMedium=-1;
  var workCanvas=document.createElement('canvas'),workCtx=null,job=null;

  function getState(){return window.GrassTerrainDemo&&window.GrassTerrainDemo.grassShadow;}
  function apiRevision(){try{var s=window.GrassAPI&&window.GrassAPI.snapshot&&window.GrassAPI.snapshot();return s&&Number.isFinite(+s.revision)?+s.revision:0;}catch(_){return 0;}}

  function paintBlob(ctx,px,py,lengthPx,widthPx,angle){
    if(lengthPx<.6||widthPx<.4)return;
    ctx.save();ctx.translate(px,py);ctx.rotate(angle);
    ctx.scale(Math.max(.5,lengthPx*.5),Math.max(.35,widthPx*.5));
    var g=ctx.createRadialGradient(-.18,0,.05,-.08,0,1.0);
    g.addColorStop(0,'rgba(0,0,0,.85)');
    g.addColorStop(.42,'rgba(0,0,0,.85)');
    g.addColorStop(.76,'rgba(0,0,0,.40)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function mapPoint(x,z,j){return {x:(x-(j.cx-j.span*.5))*j.pxPerM,y:(z-(j.cz-j.span*.5))*j.pxPerM};}

  function eraseShape(ctx,s,j){
    if(!s||!s.type)return;ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';
    if(s.type==='circle'){
      var p=mapPoint(s.x,s.z,j);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0,s.radius)*j.pxPerM,0,Math.PI*2);ctx.fill();
    }else if(s.type==='box'){
      var q=mapPoint(s.x,s.z,j);ctx.translate(q.x,q.y);ctx.rotate(-(s.rotation||0));ctx.fillRect(-s.width*.5*j.pxPerM,-s.depth*.5*j.pxPerM,s.width*j.pxPerM,s.depth*j.pxPerM);
    }else if(s.type==='polygon'&&s.points&&s.points.length){
      var p0=mapPoint(s.points[0].x,s.points[0].z,j);ctx.beginPath();ctx.moveTo(p0.x,p0.y);
      for(var i=1;i<s.points.length;i++){var pp=mapPoint(s.points[i].x,s.points[i].z,j);ctx.lineTo(pp.x,pp.y);}ctx.closePath();ctx.fill();
    }else if(s.type==='corridor'&&s.points&&s.points.length>1){
      ctx.lineWidth=Math.max(1,s.width*j.pxPerM);var c0=mapPoint(s.points[0].x,s.points[0].z,j);ctx.beginPath();ctx.moveTo(c0.x,c0.y);
      for(var k=1;k<s.points.length;k++){var cp=mapPoint(s.points[k].x,s.points[k].z,j);ctx.lineTo(cp.x,cp.y);}ctx.stroke();
    }else if(s.type==='segment'&&s.start&&s.end){
      ctx.lineWidth=Math.max(1,(s.clearance||0)*2*j.pxPerM);var a=mapPoint(s.start.x,s.start.z,j),b=mapPoint(s.end.x,s.end.z,j);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.restore();
  }

  function eraseExclusions(j){
    var snap=null;try{snap=window.GrassAPI&&window.GrassAPI.snapshot&&window.GrassAPI.snapshot();}catch(_){ }
    var ex=snap&&snap.excludes||[];for(var i=0;i<ex.length;i++)eraseShape(workCtx,ex[i],j);
  }

  function startJob(){
    var state=getState();if(!state||!state.texture||!state.context)return false;
    var size=state.size||512,span=state.span||360,cx0=camera.position.x,cz0=camera.position.z;
    if(workCanvas.width!==size||workCanvas.height!==size){workCanvas.width=size;workCanvas.height=size;workCtx=workCanvas.getContext('2d');}
    workCtx.globalCompositeOperation='source-over';workCtx.globalAlpha=1;workCtx.fillStyle='#fff';workCtx.fillRect(0,0,size,size);

    var count=perChunkCount(),range=Math.ceil((SHADOW_END+CHUNK*1.5)/CHUNK),list=[];
    var baseCx=Math.floor(cx0/CHUNK),baseCz=Math.floor(cz0/CHUNK);
    for(var dz=-range;dz<=range;dz++)for(var dx=-range;dx<=range;dx++){
      var ccx=baseCx+dx,ccz=baseCz+dz,wx=(ccx+.5)*CHUNK,wz=(ccz+.5)*CHUNK;
      if(Math.hypot(wx-cx0,wz-cz0)<=SHADOW_END+CHUNK*.9)list.push({x:ccx,z:ccz,d:Math.hypot(wx-cx0,wz-cz0)});
    }
    list.sort(function(a,b){return a.d-b.d;});
    job={state:state,size:size,span:span,cx:cx0,cz:cz0,pxPerM:size/span,count:count,list:list,i:0,angle:Math.atan2(hz,hx),showNear:(typeof drawNear==='undefined'||drawNear.checked),showMedium:(typeof drawMedium==='undefined'||drawMedium.checked),revision:apiRevision(),den:+density.value};
    return true;
  }

  function paintChunk(j,e){
    var chunk=generateChunk(e.x,e.z,j.count);
    for(var i=0;i<chunk.length;i++){
      var g=chunk[i],ddx=g.x-j.cx,ddz=g.z-j.cz,d=Math.hypot(ddx,ddz);if(d>SHADOW_END)continue;
      if(d<30){if(!j.showNear||((i+e.x*3+e.z*5)&1))continue;}
      else{if(!j.showMedium||((i+e.x*7+e.z*11)%7)!==0)continue;}
      var def=V[g.v]||V[0],h=(def.height||1)*g.s*g.h,len=Math.max(.7,h*SHADOW_STRETCH),wid=Math.max(.28,(def.width||.7)*g.s*.72),start=.12*h;
      var mx=g.x+hx*(start+len*.42),mz=g.z+hz*(start+len*.42),u=(mx-(j.cx-j.span*.5))/j.span,v=(mz-(j.cz-j.span*.5))/j.span;
      if(u<-.05||u>1.05||v<-.05||v>1.05)continue;
      paintBlob(workCtx,u*j.size,v*j.size,len*j.pxPerM,wid*j.pxPerM,j.angle);
    }
  }

  function finishJob(j){
    eraseExclusions(j);
    var st=j.state,ctx=st.context;ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.clearRect(0,0,j.size,j.size);ctx.drawImage(workCanvas,0,0);st.centerX=j.cx;st.centerZ=j.cz;st.texture.update(false);st.revision=(st.revision||0)+1;
    lastX=j.cx;lastZ=j.cz;lastDen=j.den;lastRevision=j.revision;lastNear=j.showNear?1:0;lastMedium=j.showMedium?1:0;job=null;
  }

  function stepJob(){
    if(!job)return;var t0=performance.now();
    while(job.i<job.list.length){paintChunk(job,job.list[job.i++]);if(performance.now()-t0>BUDGET_MS)return;}
    finishJob(job);
  }

  function needsRebuild(){
    if(!getState())return false;var dx=camera.position.x-lastX,dz=camera.position.z-lastZ;
    var showNear=(typeof drawNear==='undefined'||drawNear.checked)?1:0,showMedium=(typeof drawMedium==='undefined'||drawMedium.checked)?1:0;
    return Math.hypot(dx,dz)>REBUILD_MOVE||+density.value!==lastDen||apiRevision()!==lastRevision||showNear!==lastNear||showMedium!==lastMedium;
  }

  var retry=0;function ensureInitial(){if(startJob())return;if(retry++<80)setTimeout(ensureInitial,50);}ensureInitial();
  var nextCheck=0;scene.onBeforeRenderObservable.add(function(){
    if(job){stepJob();return;}var now=performance.now();if(now<nextCheck)return;nextCheck=now+180;if(needsRebuild())startJob();
  });
  try{density.addEventListener('input',function(){lastDen=-1;});}catch(_){ }
  try{drawNear.addEventListener('change',function(){lastNear=-1;});}catch(_){ }
  try{drawMedium.addEventListener('change',function(){lastMedium=-1;});}catch(_){ }
  window.GrassShadowSplat={rebuild:function(){job=null;return startJob();},eraseExclusions:function(){if(job)eraseExclusions(job);},end:SHADOW_END,stretch:SHADOW_STRETCH,opacity:.85};
})();

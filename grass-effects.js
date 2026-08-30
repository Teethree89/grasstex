/* v60 grass shadows: world-space directional blob splat sampled by the terrain shader.
   No shadow geometry is rendered. This eliminates floating/intersecting decal cards on rough
   terrain and removes asynchronous shadow-instance leftovers when crossing masked areas. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined'||typeof V==='undefined')return;

  var SHADOW_END=165;
  var REBUILD_MOVE=8.0;
  var shared=window.SunModel;
  var sunDir=(shared&&shared.lightDir)?shared.lightDir:((typeof sun!=='undefined'&&sun.direction)?sun.direction:new BABYLON.Vector3(-.4705,-.0993,.8767));
  var hx=sunDir.x,hz=sunDir.z,hlen=Math.hypot(hx,hz)||1;hx/=hlen;hz/=hlen;
  var sunElev=Math.atan2(-sunDir.y,Math.max(.0001,Math.hypot(sunDir.x,sunDir.z)));
  var SHADOW_STRETCH=BABYLON.Scalar.Clamp(1/Math.tan(Math.max(sunElev,.09)),1.4,4.2);

  var lastX=1e9,lastZ=1e9,lastDen=-1,lastRevision=-1,lastNear=-1,lastMedium=-1;

  function getState(){return window.GrassTerrainDemo&&window.GrassTerrainDemo.grassShadow;}

  function allowed(g,cx,cz,i){
    if(!window.GrassAPI||!window.GrassAPI.isAllowed)return true;
    return window.GrassAPI.isAllowed(g.x,g.z,{chunkX:cx,chunkZ:cz,index:i,seed:g.seed});
  }

  function apiRevision(){
    try{var s=window.GrassAPI&&window.GrassAPI.snapshot&&window.GrassAPI.snapshot();return s&&Number.isFinite(+s.revision)?+s.revision:0;}catch(_){return 0;}
  }

  function paintBlob(ctx,px,py,lengthPx,widthPx,angle,alpha){
    if(lengthPx<.6||widthPx<.4||alpha<=0)return;
    ctx.save();
    ctx.translate(px,py);
    ctx.rotate(angle);
    ctx.scale(Math.max(.5,lengthPx*.5),Math.max(.35,widthPx*.5));
    var g=ctx.createRadialGradient(-.18,0,.05,-.08,0,1.0);
    g.addColorStop(0,'rgba(0,0,0,'+Math.min(.34,alpha*1.18)+')');
    g.addColorStop(.42,'rgba(0,0,0,'+alpha+')');
    g.addColorStop(.76,'rgba(0,0,0,'+(alpha*.46)+')');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function rebuild(){
    var state=getState();if(!state||!state.texture||!state.context)return false;
    var ctx=state.context,size=state.size||512,span=state.span||360;
    var cx0=camera.position.x,cz0=camera.position.z;
    state.centerX=cx0;state.centerZ=cz0;

    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);

    var count=perChunkCount(),range=Math.ceil((SHADOW_END+CHUNK*1.5)/CHUNK);
    var baseCx=Math.floor(cx0/CHUNK),baseCz=Math.floor(cz0/CHUNK);
    var showNear=typeof drawNear==='undefined'||drawNear.checked;
    var showMedium=typeof drawMedium==='undefined'||drawMedium.checked;
    var pxPerM=size/span;
    var angle=Math.atan2(hz,hx);

    for(var dz=-range;dz<=range;dz++)for(var dx=-range;dx<=range;dx++){
      var ccx=baseCx+dx,ccz=baseCz+dz;
      var centerX=(ccx+.5)*CHUNK,centerZ=(ccz+.5)*CHUNK;
      if(Math.hypot(centerX-cx0,centerZ-cz0)>SHADOW_END+CHUNK*.9)continue;
      var chunk=generateChunk(ccx,ccz,count);
      for(var i=0;i<chunk.length;i++){
        var g=chunk[i],ddx=g.x-cx0,ddz=g.z-cz0,d=Math.hypot(ddx,ddz);
        if(d>SHADOW_END)continue;
        if(d<30){if(!showNear||((i+ccx*3+ccz*5)&1))continue;}
        else{if(!showMedium||((i+ccx*7+ccz*11)%7)!==0)continue;}
        if(!allowed(g,ccx,ccz,i))continue;

        var def=V[g.v]||V[0],h=(def.height||1)*g.s*g.h;
        var len=Math.max(.7,h*SHADOW_STRETCH);
        var wid=Math.max(.28,(def.width||.7)*g.s*.72);
        var start=.12*h;
        var mx=g.x+hx*(start+len*.42),mz=g.z+hz*(start+len*.42);
        var u=(mx-(cx0-span*.5))/span,v=(mz-(cz0-span*.5))/span;
        if(u<-.05||u>1.05||v<-.05||v>1.05)continue;
        var px=u*size,py=v*size;
        var fade=1-Math.max(0,Math.min(1,(d-35)/(SHADOW_END-35)));
        var alpha=.12+.09*fade;
        paintBlob(ctx,px,py,len*pxPerM,wid*pxPerM,angle,alpha);
      }
    }

    state.texture.update(false);
    state.revision=(state.revision||0)+1;
    lastX=cx0;lastZ=cz0;lastDen=+density.value;lastRevision=apiRevision();lastNear=showNear?1:0;lastMedium=showMedium?1:0;
    return true;
  }

  function needsRebuild(){
    var state=getState();if(!state)return false;
    var dx=camera.position.x-lastX,dz=camera.position.z-lastZ;
    var showNear=typeof drawNear==='undefined'||drawNear.checked?1:0;
    var showMedium=typeof drawMedium==='undefined'||drawMedium.checked?1:0;
    return Math.hypot(dx,dz)>REBUILD_MOVE||+density.value!==lastDen||apiRevision()!==lastRevision||showNear!==lastNear||showMedium!==lastMedium;
  }

  var retry=0;
  function ensureInitial(){
    if(rebuild())return;
    if(retry++<80)setTimeout(ensureInitial,50);
  }
  ensureInitial();

  var nextCheck=0;
  scene.onBeforeRenderObservable.add(function(){
    var now=performance.now();if(now<nextCheck)return;nextCheck=now+180;
    if(needsRebuild())rebuild();
  });

  try{density.addEventListener('input',function(){lastDen=-1;});}catch(_){ }
  try{drawNear.addEventListener('change',function(){lastNear=-1;});}catch(_){ }
  try{drawMedium.addEventListener('change',function(){lastMedium=-1;});}catch(_){ }
  window.GrassShadowSplat={rebuild:rebuild,end:SHADOW_END,stretch:SHADOW_STRETCH};
})();

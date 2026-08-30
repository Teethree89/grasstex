/* v55 projected grass-image shadows with terrain-height support. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof engine==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined'||typeof V==='undefined'||typeof A==='undefined')return;

  /* Shadow alpha must reach 0 by SHADOW_END. The old code hard-discarded at 165 while
     alpha was still .19, so every streaming rebuild made a whole ring's worth of
     shadows appear/vanish at 19% opacity - which is what read as shadows "jumping"
     on a chunk crossing. Range and rebuild hysteresis are also most of the streaming
     cost, so both are tuned down here; these four numbers are the knobs. */
  var SHADOW_END=110,SHADOW_FADE_START=40,NEAR_SHADOW_END=30,SHADOW_Y=.03;
  var shared=window.SunModel;
  var sunDir=(shared&&shared.lightDir)?shared.lightDir:((typeof sun!=='undefined'&&sun.direction)?sun.direction:new BABYLON.Vector3(-.4705,-.0993,.8767));
  var SUN_YAW=Math.atan2(sunDir.x,sunDir.z);
  var sunElev=Math.atan2(-sunDir.y,Math.max(.0001,Math.hypot(sunDir.x,sunDir.z)));
  var SHADOW_STRETCH=BABYLON.Scalar.Clamp(1/Math.tan(Math.max(sunElev,.09)),1.4,4.2);

  BABYLON.Effect.ShadersStore.grassImageShadowVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;attribute float instanceSeed;attribute vec2 instanceGrad;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;
float hsh(float n){return fract(sin(n)*43758.5453123);}float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 c=world3.xyz;vec4 wp=mat4(world0,world1,world2,world3)*vec4(position,1.);vD=length(c.xz-cameraPosition.xz);
  float ht=1.0-smoothstep(0.,1.,uv.y);ht*=ht;vec2 dir=normalize(vec2(.82,.57));
  float gust=.72+.22*sin(c.x*.034+c.z*.022-uTime*.58)+.10*sin(c.x*.071-c.z*.047-uTime*1.07);vec2 bend=vec2(0.);
  if(vD<${NEAR_SHADOW_END.toFixed(1)}){float stiff=mix(.72,1.18,hsh(instanceSeed*91.17+3.1));float ph=uTime*1.28+instanceSeed*6.283+c.x*.010+c.z*.006;float turb=sin(ph*1.73+instanceSeed*9.7);float pulse=sin(ph)*.58+turb*.23;bend=(dir*(.020+.052*gust+.030*pulse)+vec2(-dir.y,dir.x)*turb*.012)*uWind*stiff*ht;}
  else{float sd=h2(floor(c.xz*.17));float stiff=mix(.74,1.16,sd);float ph=uTime*1.12+c.x*.37+c.z*.21;float turb=sin(ph*1.73+sd*7.1);bend=(dir*(.020+.050*gust+.027*(sin(ph)*.58+turb*.23))+vec2(-dir.y,dir.x)*turb*.010)*uWind*stiff*ht;}
  wp.x+=bend.x;wp.z+=bend.y;
  /* Ride the terrain's tangent plane at the clump instead of pinning the whole quad to
     one height. A stretched shadow is several metres long, so on rolling terrain a
     constant Y buries the far tip in rising ground and floats it over dips. instanceGrad
     is the baked surface gradient (dY/dX,dY/dZ), so this is exact to first order and
     costs no extra terrain sampling - the normal it comes from was already computed. */
  wp.y=c.y+${SHADOW_Y.toFixed(4)}+dot(wp.xz-c.xz,instanceGrad);
  gl_Position=viewProjection*wp;vUV=uv;
}`;

  BABYLON.Effect.ShadersStore.grassImageShadowFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;uniform sampler2D grassTexture;uniform float uDrawNear;uniform float uDrawMedium;
void main(){if(vD>${SHADOW_END.toFixed(1)})discard;if(vD<${NEAR_SHADOW_END.toFixed(1)}&&uDrawNear<0.5)discard;if(vD>=${NEAR_SHADOW_END.toFixed(1)}&&uDrawMedium<0.5)discard;vec4 g=texture2D(grassTexture,vUV);if(g.a<.10)discard;float distanceFade=1.0-smoothstep(${SHADOW_FADE_START.toFixed(1)},${SHADOW_END.toFixed(1)},vD);float a=g.a*.36*distanceFade;if(a<.012)discard;gl_FragColor=vec4(.036,.039,.049,a);}`;

  function makeShadowType(def,i){
    /* No DOUBLESIDE: that duplicates the geometry, and the material already draws both
       faces via backFaceCulling=false - so it was paying twice the vertex cost per
       shadow instance for nothing. */
    var p=BABYLON.MeshBuilder.CreatePlane('grassImageShadow'+i,{width:def.width,height:-def.height},scene);
    p.position.y=def.height*(def.ground-.5);p.bakeCurrentTransformIntoVertices();p.position.set(0,0,0);
    p.scaling.y=SHADOW_STRETCH;p.rotationQuaternion=BABYLON.Quaternion.RotationYawPitchRoll(SUN_YAW,Math.PI/2,0);p.bakeCurrentTransformIntoVertices();p.position.set(0,0,0);p.rotation.set(0,0,0);p.rotationQuaternion=null;p.scaling.set(1,1,1);
    p.isPickable=false;p.alwaysSelectAsActiveMesh=true;p.alphaIndex=10;
    var m=new BABYLON.ShaderMaterial('grassImageShadowMat'+i,scene,{vertex:'grassImageShadow',fragment:'grassImageShadow'},{attributes:['position','uv','world0','world1','world2','world3','instanceSeed','instanceGrad'],uniforms:['viewProjection','cameraPosition','uTime','uWind','uDrawNear','uDrawMedium'],samplers:['grassTexture'],needAlphaBlending:true});
    m.backFaceCulling=false;m.disableDepthWrite=true;var t=new BABYLON.Texture(A+def.file,scene,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);t.hasAlpha=true;t.wrapU=t.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;t.anisotropicFilteringLevel=4;m.setTexture('grassTexture',t);p.material=m;return{mesh:p,mat:m};
  }
  var shadowTypes=V.map(makeShadowType);try{if(typeof nearPatch!=='undefined')nearPatch.alphaIndex=0;}catch(_){ }

  var BUDGET_MS=1.2,HYST=CHUNK*.85,PAD=CHUNK*1.25,mats=[],seeds=[],grads=[],matN=new Int32Array(6),seedN=new Int32Array(6),boundBuf=new WeakMap();
  var job=null,haveShadows=false,builtX=1e9,builtZ=1e9,builtDen=-1,builtRev=-1;
  function fit(list,i,need){var a=list[i];if(!a||a.length<need)list[i]=new Float32Array(Math.ceil(need*1.25)+16);return list[i];}
  function push(mesh,kind,data,stride,instances){var b=boundBuf.get(mesh);if(!b){b={};boundBuf.set(mesh,b);}if(b[kind]!==data){mesh.thinInstanceSetBuffer(kind,data,stride,false);b[kind]=data;}else mesh.thinInstanceBufferUpdated(kind);if(instances>=0)mesh.thinInstanceCount=instances;}

  function startShadowJob(den,rev){
    var count=perChunkCount(),ox=camera.position.x,oz=camera.position.z,range=Math.ceil((SHADOW_END+PAD)/CHUNK)+1,list=[];
    for(var z=-range;z<=range;z++)for(var x=-range;x<=range;x++){var cx=Math.floor(ox/CHUNK)+x,cz=Math.floor(oz/CHUNK)+z,dx=(cx+.5)*CHUNK-ox,dz=(cz+.5)*CHUNK-oz,d=Math.sqrt(dx*dx+dz*dz);if(d>SHADOW_END+PAD)continue;list.push({x:cx,z:cz,d:d});}
    list.sort(function(a,b){return a.d-b.d;});var c6=new Int32Array(6);for(var i=0;i<count;i++)c6[i%6]++;
    for(var v=0;v<6;v++){fit(mats,v,list.length*c6[v]*16);fit(seeds,v,list.length*c6[v]);fit(grads,v,list.length*c6[v]*2);matN[v]=seedN[v]=0;}job={list:list,i:0,count:count,commit:0};builtX=ox;builtZ=oz;builtDen=den;builtRev=rev;
  }

  var visit=(window.GrassStream&&window.GrassStream.visitChunk)||function(cx,cz,count,sink){var chunk=generateChunk(cx,cz,count);for(var i=0;i<chunk.length;i++){var g=chunk[i],terrain=window.GrassAPI&&window.GrassAPI.sampleTerrain?window.GrassAPI.sampleTerrain(g.x,g.z,{chunkX:cx,chunkZ:cz,index:i,seed:g.seed}):{height:0};sink(i,g.x,g.z,g.yaw,g.s,g.h,g.seed,terrain);}};
  function bakeShadowChunk(e,count){
    visit(e.x,e.z,count,function(i,gx,gz,yaw,gs,gh,seed,terrain){
      var v=i%6,a=mats[v],o=matN[v],si=seedN[v],gy=terrain&&Number.isFinite(+terrain.height)?+terrain.height:0;
      a[o]=gs;a[o+1]=0;a[o+2]=0;a[o+3]=0;a[o+4]=0;a[o+5]=gs*gh;a[o+6]=0;a[o+7]=0;a[o+8]=0;a[o+9]=0;a[o+10]=gs;a[o+11]=0;a[o+12]=gx;a[o+13]=gy;a[o+14]=gz;a[o+15]=1;
      /* Surface gradient from the normal the terrain sampler already returned:
         for y=f(x,z) the normal is proportional to (-df/dx,1,-df/dz). */
      var n=terrain&&terrain.normal,ny=n&&Math.abs(+n.y)>1e-3?+n.y:1;
      grads[v][si*2]=n?-(+n.x||0)/ny:0;grads[v][si*2+1]=n?-(+n.z||0)/ny:0;
      matN[v]=o+16;seeds[v][si]=seed;seedN[v]=si+1;
    });
  }
  function stepShadows(unlimited){if(!job)return;var t0=performance.now(),L=job.list;while(job.i<L.length){bakeShadowChunk(L[job.i],job.count);job.i++;if(!unlimited&&performance.now()-t0>BUDGET_MS)return;}while(job.commit<6){var v=job.commit;push(shadowTypes[v].mesh,'matrix',mats[v],16,matN[v]/16);push(shadowTypes[v].mesh,'instanceSeed',seeds[v],1,-1);push(shadowTypes[v].mesh,'instanceGrad',grads[v],2,-1);job.commit++;if(!unlimited)return;}job=null;haveShadows=true;}
  /* terrain-demo boots asynchronously now (it waits on the CustomMaterial CDN script), so on
     the first frames there is no terrain sampler and no road exclusion corridor yet. Hold the
     initial bake until the sampler is registered, and rebuild whenever GrassAPI's revision
     changes - otherwise shadows bake flat at y=0 and stay painted across the road until you
     happen to walk far enough to trip the movement hysteresis. */
  function apiState(){try{var s=window.GrassAPI&&window.GrassAPI.snapshot&&window.GrassAPI.snapshot();return s?{rev:+s.revision||0,ready:!!s.hasTerrainSampler}:{rev:0,ready:false};}catch(_){return{rev:0,ready:false};}}
  function pumpShadows(){if(!job&&window.__grassStreamBusy)return;var st=apiState();if(!haveShadows&&!st.ready)return;var den=+density.value,dx=camera.position.x-builtX,dz=camera.position.z-builtZ,moved=Math.sqrt(dx*dx+dz*dz),jump=!haveShadows||moved>SHADOW_END;if(den!==builtDen||st.rev!==builtRev)startShadowJob(den,st.rev);else if(!job&&moved>HYST)startShadowJob(den,st.rev);if(job)stepShadows(jump);}

  var t=0;scene.onBeforeRenderObservable.add(function(){var dt=Math.min(engine.getDeltaTime()/1000,.05);t+=dt;var showNear=drawNear.checked?1:0,showMedium=drawMedium.checked?1:0,showAny=!!(showNear||showMedium);for(var i=0;i<6;i++){shadowTypes[i].mat.setVector3('cameraPosition',camera.globalPosition);shadowTypes[i].mat.setFloat('uTime',t);shadowTypes[i].mat.setFloat('uWind',+wind.value);shadowTypes[i].mat.setFloat('uDrawNear',showNear);shadowTypes[i].mat.setFloat('uDrawMedium',showMedium);shadowTypes[i].mesh.setEnabled(showAny);}pumpShadows();});
  density.addEventListener('input',function(){builtDen=-1;});/* first bake is kicked off by pumpShadows once the terrain sampler exists */
})();

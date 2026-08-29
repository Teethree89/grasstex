/* v41 projected grass-image shadows; corrected lateral sway, shadows above filltex, and budgeted (non-hitching) shadow streaming */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof engine==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined'||typeof V==='undefined'||typeof A==='undefined')return;

  var SHADOW_END=165;
  var NEAR_SHADOW_END=30;
  var SUN_YAW=.52;
  var SHADOW_Y=.0125;

  BABYLON.Effect.ShadersStore.grassImageShadowVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;attribute float instanceSeed;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;
void main(){
  vec3 c=world3.xyz;
  vec4 wp=mat4(world0,world1,world2,world3)*vec4(position,1.);
  vD=distance(c,cameraPosition);
  float h=1.0-smoothstep(0.,1.,uv.y);h*=h;
  vec2 windOffset=vec2(0.);
  if(vD<${NEAR_SHADOW_END.toFixed(1)}){
    float ph=uTime*1.2+instanceSeed*6.283;
    float f=sin(ph*1.71+instanceSeed*9.7);
    windOffset.x=-((sin(ph)*.72+f*.28)*.07*uWind*h);
    windOffset.y=f*.018*uWind*h;
  }else{
    vec3 toCam=cameraPosition-c;toCam.y=0.;
    vec3 fw=toCam/max(length(toCam),.0001);
    vec3 r=normalize(vec3(fw.z,0.,-fw.x));
    float ph=uTime*1.05+c.x*.37+c.z*.21;
    float sway=(sin(ph)+sin(ph*1.73)*.35)*.055*uWind*h;
    windOffset=vec2(-r.x,r.z)*sway;
  }
  wp.x+=windOffset.x;wp.z+=windOffset.y;wp.y=${SHADOW_Y.toFixed(4)};
  gl_Position=viewProjection*wp;vUV=uv;
}`;

  BABYLON.Effect.ShadersStore.grassImageShadowFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;uniform sampler2D grassTexture;
void main(){
  if(vD>${SHADOW_END.toFixed(1)})discard;
  vec4 g=texture2D(grassTexture,vUV);if(g.a<.10)discard;
  float distanceFade=1.0-smoothstep(55.0,${SHADOW_END.toFixed(1)},vD);
  float a=g.a*(.20+.18*distanceFade);if(a<.018)discard;
  gl_FragColor=vec4(.045,.041,.029,a);
}`;

  function makeShadowType(def,i){
    var p=BABYLON.MeshBuilder.CreatePlane('grassImageShadow'+i,{width:def.width,height:-def.height,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    p.position.y=def.height*(def.ground-.5);p.bakeCurrentTransformIntoVertices();p.position.set(0,0,0);
    p.scaling.y=1.55;p.rotationQuaternion=BABYLON.Quaternion.RotationYawPitchRoll(SUN_YAW,Math.PI/2,0);
    p.bakeCurrentTransformIntoVertices();p.position.set(0,0,0);p.rotation.set(0,0,0);p.rotationQuaternion=null;p.scaling.set(1,1,1);
    p.isPickable=false;p.alwaysSelectAsActiveMesh=true;p.alphaIndex=10;
    var m=new BABYLON.ShaderMaterial('grassImageShadowMat'+i,scene,{vertex:'grassImageShadow',fragment:'grassImageShadow'},{attributes:['position','uv','world0','world1','world2','world3','instanceSeed'],uniforms:['viewProjection','cameraPosition','uTime','uWind'],samplers:['grassTexture'],needAlphaBlending:true});
    m.backFaceCulling=false;m.disableDepthWrite=true;
    var t=new BABYLON.Texture(A+def.file,scene,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.hasAlpha=true;t.wrapU=t.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;t.anisotropicFilteringLevel=4;
    m.setTexture('grassTexture',t);p.material=m;return{mesh:p,mat:m};
  }

  var shadowTypes=V.map(makeShadowType);
  try{if(typeof nearPatch!=='undefined')nearPatch.alphaIndex=0}catch(_){ }

  var BUDGET_MS=1.2,HYST=CHUNK*0.4,PAD=CHUNK*2.0;
  var mats=[],seeds=[],matN=new Int32Array(6),seedN=new Int32Array(6),boundBuf=new WeakMap();
  var job=null,haveShadows=false,builtX=1e9,builtZ=1e9,builtDen=-1;

  function fit(list,i,need){var a=list[i];if(!a||a.length<need)list[i]=new Float32Array(Math.ceil(need*1.25)+16);return list[i]}
  function push(mesh,kind,data,stride,instances){var b=boundBuf.get(mesh);if(!b){b={};boundBuf.set(mesh,b)}if(b[kind]!==data){mesh.thinInstanceSetBuffer(kind,data,stride,false);b[kind]=data}else mesh.thinInstanceBufferUpdated(kind);if(instances>=0)mesh.thinInstanceCount=instances}

  function startShadowJob(den){
    var count=perChunkCount(),ox=camera.position.x,oz=camera.position.z;
    var range=Math.ceil((SHADOW_END+PAD)/CHUNK)+1,list=[];
    for(var z=-range;z<=range;z++)for(var x=-range;x<=range;x++){
      var cx=Math.floor(ox/CHUNK)+x,cz=Math.floor(oz/CHUNK)+z;
      var dx=(cx+.5)*CHUNK-ox,dz=(cz+.5)*CHUNK-oz,d=Math.sqrt(dx*dx+dz*dz);
      if(d>SHADOW_END+PAD)continue;list.push({x:cx,z:cz,d:d});
    }
    list.sort(function(a,b){return a.d-b.d});
    var c6=new Int32Array(6);for(var i=0;i<count;i++)c6[i%6]++;
    for(var v=0;v<6;v++){fit(mats,v,list.length*c6[v]*16);fit(seeds,v,list.length*c6[v]);matN[v]=seedN[v]=0}
    job={list:list,i:0,count:count,commit:0};builtX=ox;builtZ=oz;builtDen=den;
  }

  var visit=(window.GrassStream&&window.GrassStream.visitChunk)||function(cx,cz,count,sink){var chunk=generateChunk(cx,cz,count);for(var i=0;i<chunk.length;i++){var g=chunk[i];sink(i,g.x,g.z,g.yaw,g.s,g.h,g.seed)}};

  function bakeShadowChunk(e,count){
    visit(e.x,e.z,count,function(i,gx,gz,yaw,gs,gh,seed){
      var v=i%6,a=mats[v],o=matN[v];
      a[o]=gs;a[o+1]=0;a[o+2]=0;a[o+3]=0;
      a[o+4]=0;a[o+5]=gs*gh;a[o+6]=0;a[o+7]=0;
      a[o+8]=0;a[o+9]=0;a[o+10]=gs;a[o+11]=0;
      a[o+12]=gx;a[o+13]=SHADOW_Y;a[o+14]=gz;a[o+15]=1;
      matN[v]=o+16;seeds[v][seedN[v]++]=seed;
    });
  }

  function stepShadows(unlimited){
    if(!job)return;var t0=performance.now(),L=job.list;
    while(job.i<L.length){bakeShadowChunk(L[job.i],job.count);job.i++;if(!unlimited&&performance.now()-t0>BUDGET_MS)return}
    while(job.commit<6){var v=job.commit;push(shadowTypes[v].mesh,'matrix',mats[v],16,matN[v]/16);push(shadowTypes[v].mesh,'instanceSeed',seeds[v],1,-1);job.commit++;if(!unlimited)return}
    job=null;haveShadows=true;
  }

  function pumpShadows(){
    if(!job&&window.__grassStreamBusy)return;
    var den=+density.value,dx=camera.position.x-builtX,dz=camera.position.z-builtZ;
    var moved=Math.sqrt(dx*dx+dz*dz),jump=!haveShadows||moved>SHADOW_END;
    if(den!==builtDen)startShadowJob(den);else if(!job&&moved>HYST)startShadowJob(den);
    if(job)stepShadows(jump);
  }

  var t=0;
  scene.onBeforeRenderObservable.add(function(){
    var dt=Math.min(engine.getDeltaTime()/1000,.05);t+=dt;
    for(var i=0;i<6;i++){
      shadowTypes[i].mat.setVector3('cameraPosition',camera.globalPosition);
      shadowTypes[i].mat.setFloat('uTime',t);shadowTypes[i].mat.setFloat('uWind',+wind.value);
      shadowTypes[i].mesh.setEnabled(drawNear.checked||drawMedium.checked);
    }
    pumpShadows();
  });

  density.addEventListener('input',function(){builtDen=-1});
  startShadowJob(+density.value);stepShadows(true);
})();
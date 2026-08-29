/* v39 projected grass-image shadows; corrected lateral sway, filltex layering, and staggered/coarser shadow streaming */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof engine==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined'||typeof V==='undefined'||typeof A==='undefined')return;

  var SHADOW_END=165;
  var NEAR_SHADOW_END=30;
  var SUN_YAW=.52;
  var STREAM_STEP=2;
  var SHADOW_Y=.0025;

  BABYLON.Effect.ShadersStore.grassImageShadowVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;attribute float instanceSeed;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;
void main(){
  vec3 c=world3.xyz;
  vec4 wp=mat4(world0,world1,world2,world3)*vec4(position,1.);
  vD=distance(c,cameraPosition);

  /* Negative-height source plane flips the projected UV direction. Keep the
     planted edge fixed and ramp deformation only toward the projected tip. */
  float h=1.0-smoothstep(0.,1.,uv.y);
  h*=h;

  vec2 windOffset=vec2(0.);
  if(vD<${NEAR_SHADOW_END.toFixed(1)}){
    float ph=uTime*1.2+instanceSeed*6.283;
    float f=sin(ph*1.71+instanceSeed*9.7);
    /* Projection flips the horizontal handedness, so invert X only. Z already
       matches the grass' forward/back motion. */
    windOffset.x=-((sin(ph)*.72+f*.28)*.07*uWind*h);
    windOffset.y=f*.018*uWind*h;
  }else{
    vec3 toCam=cameraPosition-c;
    toCam.y=0.;
    vec3 fw=toCam/max(length(toCam),.0001);
    vec3 r=normalize(vec3(fw.z,0.,-fw.x));
    float ph=uTime*1.05+c.x*.37+c.z*.21;
    float sway=(sin(ph)+sin(ph*1.73)*.35)*.055*uWind*h;
    windOffset=vec2(-r.x,r.z)*sway;
  }

  wp.x+=windOffset.x;
  wp.z+=windOffset.y;
  wp.y=${SHADOW_Y.toFixed(4)};
  gl_Position=viewProjection*wp;
  vUV=uv;
}`;

  BABYLON.Effect.ShadersStore.grassImageShadowFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;
uniform sampler2D grassTexture;
void main(){
  if(vD>${SHADOW_END.toFixed(1)})discard;
  vec4 g=texture2D(grassTexture,vUV);
  if(g.a<.10)discard;
  float distanceFade=1.0-smoothstep(55.0,${SHADOW_END.toFixed(1)},vD);
  float a=g.a*(.20+.18*distanceFade);
  if(a<.018)discard;
  gl_FragColor=vec4(.045,.041,.029,a);
}`;

  function makeShadowType(def,i){
    var p=BABYLON.MeshBuilder.CreatePlane('grassImageShadow'+i,{width:def.width,height:-def.height,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    p.position.y=def.height*(def.ground-.5);
    p.bakeCurrentTransformIntoVertices();
    p.position.set(0,0,0);

    p.scaling.y=1.55;
    p.rotationQuaternion=BABYLON.Quaternion.RotationYawPitchRoll(SUN_YAW,Math.PI/2,0);
    p.bakeCurrentTransformIntoVertices();
    p.position.set(0,0,0);p.rotation.set(0,0,0);p.rotationQuaternion=null;p.scaling.set(1,1,1);
    p.isPickable=false;p.alwaysSelectAsActiveMesh=true;p.alphaIndex=0;

    var m=new BABYLON.ShaderMaterial('grassImageShadowMat'+i,scene,{vertex:'grassImageShadow',fragment:'grassImageShadow'},{
      attributes:['position','uv','world0','world1','world2','world3','instanceSeed'],
      uniforms:['viewProjection','cameraPosition','uTime','uWind'],
      samplers:['grassTexture'],needAlphaBlending:true
    });
    m.backFaceCulling=false;
    m.disableDepthWrite=true;
    var t=new BABYLON.Texture(A+def.file,scene,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.hasAlpha=true;t.wrapU=t.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;t.anisotropicFilteringLevel=4;
    m.setTexture('grassTexture',t);
    p.material=m;
    return{mesh:p,mat:m};
  }

  var shadowTypes=V.map(makeShadowType);
  /* Keep the fill patch visually above the fake shadow layer. */
  try{if(typeof nearPatch!=='undefined')nearPatch.alphaIndex=10}catch(_){ }

  var M2=new BABYLON.Matrix(),S2=new BABYLON.Vector3(),Q2=new BABYLON.Quaternion(),P2=new BABYLON.Vector3();
  var lastCx=999999,lastCz=999999,lastDen=-1,pending=false;

  function rebuildShadows(force){
    var cx=Math.floor(camera.position.x/(CHUNK*STREAM_STEP))*STREAM_STEP,
        cz=Math.floor(camera.position.z/(CHUNK*STREAM_STEP))*STREAM_STEP,
        den=+density.value;
    if(!force&&cx===lastCx&&cz===lastCz&&den===lastDen)return;
    lastCx=cx;lastCz=cz;lastDen=den;
    var count=perChunkCount(),range=Math.ceil((SHADOW_END+CHUNK*2.5)/CHUNK),arr=Array.from({length:6},function(){return[]}),seedArr=Array.from({length:6},function(){return[]});
    for(var z=cz-range;z<=cz+range;z++){
      for(var x=cx-range;x<=cx+range;x++){
        var centerX=(x+.5)*CHUNK,centerZ=(z+.5)*CHUNK,dx=centerX-camera.position.x,dz=centerZ-camera.position.z;
        if(Math.hypot(dx,dz)>SHADOW_END+CHUNK*1.75)continue;
        var chunk=generateChunk(x,z,count);
        for(var i=0;i<chunk.length;i++){
          var g=chunk[i];
          S2.set(g.s,g.s*g.h,g.s);
          BABYLON.Quaternion.RotationYawPitchRollToRef(0,0,0,Q2);
          P2.set(g.x,SHADOW_Y,g.z);
          BABYLON.Matrix.ComposeToRef(S2,Q2,P2,M2);
          for(var k=0;k<16;k++)arr[g.v].push(M2.m[k]);
          seedArr[g.v].push(g.seed);
        }
      }
    }
    for(var v=0;v<6;v++){
      shadowTypes[v].mesh.thinInstanceSetBuffer('matrix',new Float32Array(arr[v]),16,true);
      shadowTypes[v].mesh.thinInstanceSetBuffer('instanceSeed',new Float32Array(seedArr[v]),1,true);
    }
  }

  function scheduleShadowRebuild(){
    if(pending)return;
    pending=true;
    var run=function(){pending=false;rebuildShadows(false)};
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:120});
    else setTimeout(run,32);
  }

  var t=0;
  scene.onBeforeRenderObservable.add(function(){
    var dt=Math.min(engine.getDeltaTime()/1000,.05);t+=dt;
    for(var i=0;i<6;i++){
      shadowTypes[i].mat.setVector3('cameraPosition',camera.globalPosition);
      shadowTypes[i].mat.setFloat('uTime',t);
      shadowTypes[i].mat.setFloat('uWind',+wind.value);
      shadowTypes[i].mesh.setEnabled(drawNear.checked||drawMedium.checked);
    }
    scheduleShadowRebuild();
  });

  density.addEventListener('input',function(){lastDen=-1;scheduleShadowRebuild()});
  rebuildShadows(true);
})();
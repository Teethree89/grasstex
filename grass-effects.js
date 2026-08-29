/* v35 projected grass-image shadows, pivoted from the real grass base; balanced across all six grass variants */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof engine==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined'||typeof V==='undefined'||typeof A==='undefined')return;

  var SHADOW_END=165;
  var SUN_YAW=.52;

  BABYLON.Effect.ShadersStore.grassImageShadowVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;
void main(){
  vec4 wp=mat4(world0,world1,world2,world3)*vec4(position,1.);
  float ph=uTime*.95+world3.x*.31+world3.z*.23;
  float reach=smoothstep(0.,1.,uv.y);
  float sway=(sin(ph)+sin(ph*1.67)*.32)*.040*uWind*reach;
  wp.x+=sway;
  wp.z+=sway*.35;
  wp.y=.009;
  vD=distance(wp.xyz,cameraPosition);
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
    /* Build from the exact same card geometry/origin convention as the real grass.
       Bake the grass card's ground-line offset first so the contact point is y=0,
       then lay/stretch the card outward from that origin in one sun direction. */
    var p=BABYLON.MeshBuilder.CreatePlane('grassImageShadow'+i,{width:def.width,height:-def.height,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    p.position.y=def.height*(def.ground-.5);
    p.bakeCurrentTransformIntoVertices();
    p.position.set(0,0,0);

    p.scaling.y=1.55;
    p.rotationQuaternion=BABYLON.Quaternion.RotationYawPitchRoll(SUN_YAW,Math.PI/2,0);
    p.bakeCurrentTransformIntoVertices();
    p.position.set(0,0,0);p.rotation.set(0,0,0);p.rotationQuaternion=null;p.scaling.set(1,1,1);
    p.isPickable=false;p.alwaysSelectAsActiveMesh=true;

    var m=new BABYLON.ShaderMaterial('grassImageShadowMat'+i,scene,{vertex:'grassImageShadow',fragment:'grassImageShadow'},{
      attributes:['position','uv','world0','world1','world2','world3'],
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
  var M2=new BABYLON.Matrix(),S2=new BABYLON.Vector3(),Q2=new BABYLON.Quaternion(),P2=new BABYLON.Vector3();
  var lastCx=999999,lastCz=999999,lastDen=-1;

  function rebuildShadows(force){
    var cx=Math.floor(camera.position.x/CHUNK),cz=Math.floor(camera.position.z/CHUNK),den=+density.value;
    if(!force&&cx===lastCx&&cz===lastCz&&den===lastDen)return;
    lastCx=cx;lastCz=cz;lastDen=den;
    var count=perChunkCount(),range=Math.ceil((SHADOW_END+CHUNK*1.5)/CHUNK),arr=Array.from({length:6},function(){return[]});
    for(var z=cz-range;z<=cz+range;z++){
      for(var x=cx-range;x<=cx+range;x++){
        var centerX=(x+.5)*CHUNK,centerZ=(z+.5)*CHUNK,dx=centerX-camera.position.x,dz=centerZ-camera.position.z;
        if(Math.hypot(dx,dz)>SHADOW_END+CHUNK*.75)continue;
        var chunk=generateChunk(x,z,count);
        for(var i=0;i<chunk.length;i++){
          /* generateChunk assigns variants by i % 6. Stepping i += 2 only ever
             selected variants 0, 2 and 4. Keep every other GROUP of six instead,
             which preserves ~50% shadow density while including 0-5 equally. */
          if((Math.floor(i/6)&1)!==0)continue;
          var g=chunk[i];
          S2.set(g.s,g.s*g.h,g.s);
          BABYLON.Quaternion.RotationYawPitchRollToRef(0,0,0,Q2);
          P2.set(g.x,.009,g.z);
          BABYLON.Matrix.ComposeToRef(S2,Q2,P2,M2);
          for(var k=0;k<16;k++)arr[g.v].push(M2.m[k]);
        }
      }
    }
    for(var v=0;v<6;v++)shadowTypes[v].mesh.thinInstanceSetBuffer('matrix',new Float32Array(arr[v]),16,true);
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
    rebuildShadows(false);
  });

  density.addEventListener('input',function(){rebuildShadows(true)});
  rebuildShadows(true);
})();
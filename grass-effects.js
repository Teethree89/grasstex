/* v32 lightweight fake grass shadows */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof engine==='undefined'||typeof generateChunk==='undefined'||typeof perChunkCount==='undefined')return;

  var SHADOW_END=165;
  var shadowPlane=BABYLON.MeshBuilder.CreatePlane('grassShadow',{width:.78,height:1.18,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  shadowPlane.rotation.x=Math.PI/2;
  shadowPlane.position.y=.008;
  shadowPlane.bakeCurrentTransformIntoVertices();
  shadowPlane.rotation.set(0,0,0);
  shadowPlane.position.set(0,0,0);
  shadowPlane.isPickable=false;
  shadowPlane.alwaysSelectAsActiveMesh=true;

  BABYLON.Effect.ShadersStore.grassShadowVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;
void main(){
  vec4 wp=mat4(world0,world1,world2,world3)*vec4(position,1.);
  float ph=uTime*.95+world3.x*.31+world3.z*.23;
  float sway=(sin(ph)+sin(ph*1.67)*.32)*.045*uWind;
  float reach=uv.y-.22;
  wp.x+=.24*reach+sway;
  wp.z+=.11*reach+sway*.35;
  wp.y=.009;
  vD=distance(wp.xyz,cameraPosition);
  gl_Position=viewProjection*wp;
  vUV=uv;
}`;
  BABYLON.Effect.ShadersStore.grassShadowFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;
void main(){
  if(vD>${SHADOW_END.toFixed(1)})discard;
  vec2 p=(vUV-.5)*vec2(1.0,.72);
  float r=length(p)*2.0;
  float edge=1.0-smoothstep(.42,1.0,r);
  float distanceFade=1.0-smoothstep(55.0,${SHADOW_END.toFixed(1)},vD);
  float a=edge*(.20+.18*distanceFade);
  if(a<.018)discard;
  gl_FragColor=vec4(.055,.050,.035,a);
}`;

  var shadowMat=new BABYLON.ShaderMaterial('grassShadowMat',scene,{vertex:'grassShadow',fragment:'grassShadow'},{
    attributes:['position','uv','world0','world1','world2','world3'],
    uniforms:['viewProjection','cameraPosition','uTime','uWind'],
    needAlphaBlending:true
  });
  shadowMat.backFaceCulling=false;
  shadowMat.disableDepthWrite=true;
  shadowPlane.material=shadowMat;

  var M2=new BABYLON.Matrix(),S2=new BABYLON.Vector3(),Q2=new BABYLON.Quaternion(),P2=new BABYLON.Vector3();
  var lastCx=999999,lastCz=999999,lastDen=-1;

  function rebuildShadows(force){
    var cx=Math.floor(camera.position.x/CHUNK),cz=Math.floor(camera.position.z/CHUNK),den=+density.value;
    if(!force&&cx===lastCx&&cz===lastCz&&den===lastDen)return;
    lastCx=cx;lastCz=cz;lastDen=den;
    var count=perChunkCount(),range=Math.ceil((SHADOW_END+CHUNK*1.5)/CHUNK),arr=[];
    for(var z=cz-range;z<=cz+range;z++){
      for(var x=cx-range;x<=cx+range;x++){
        var centerX=(x+.5)*CHUNK,centerZ=(z+.5)*CHUNK,dx=centerX-camera.position.x,dz=centerZ-camera.position.z;
        if(Math.hypot(dx,dz)>SHADOW_END+CHUNK*.75)continue;
        var chunk=generateChunk(x,z,count);
        for(var i=0;i<chunk.length;i+=2){
          var g=chunk[i];
          S2.set(g.s*1.08,g.s*1.45,g.s*1.08);
          BABYLON.Quaternion.RotationYawPitchRollToRef(g.yaw,0,0,Q2);
          P2.set(g.x,.008,g.z);
          BABYLON.Matrix.ComposeToRef(S2,Q2,P2,M2);
          for(var k=0;k<16;k++)arr.push(M2.m[k]);
        }
      }
    }
    shadowPlane.thinInstanceSetBuffer('matrix',new Float32Array(arr),16,true);
  }

  var t=0;
  scene.onBeforeRenderObservable.add(function(){
    var dt=Math.min(engine.getDeltaTime()/1000,.05);t+=dt;
    shadowMat.setVector3('cameraPosition',camera.globalPosition);
    shadowMat.setFloat('uTime',t);
    shadowMat.setFloat('uWind',+wind.value);
    shadowPlane.setEnabled(drawNear.checked||drawMedium.checked);
    rebuildShadows(false);
  });

  density.addEventListener('input',function(){rebuildShadows(true)});
  rebuildShadows(true);
})();
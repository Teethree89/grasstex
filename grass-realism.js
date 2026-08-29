/* v50 grass/lighting/world realism: restored v46 world/grass lighting while preserving the fixed world-locked dirt UV compensation,
   one measured sun model drives directional light and grass lighting, physical sky-dome vertical offset equivalent
   to the old equirectangular UV shift, world-locked dirt ground, directional gust fields, stiffness/rest-lean variation,
   LOD-continuous dry clumps, base darkening, backlight, distance integration, and shared atmosphere tint. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined')return;

  /* v50 is intentionally a lighting-only rollback from the brighter v47 values. Keep later dirt/LOD/near-pair fixes intact. */
  try{
    document.title='Grass Game v50';
    var rows=document.querySelectorAll('#ui .row');
    for(var ri=0;ri<rows.length;ri++)if(rows[ri].textContent.indexOf('Version:')>=0){rows[ri].innerHTML='<strong>Version:</strong> v50';break;}
  }catch(_){ }

  var ATMO_R=.60,ATMO_G=.53,ATMO_B=.48;
  var ATMO_GLSL='vec3('+ATMO_R+','+ATMO_G+','+ATMO_B+')';

  var SUN_BEARING_DEG=151.8,SUN_ELEVATION_DEG=5.7;
  var sb=SUN_BEARING_DEG*Math.PI/180,se=SUN_ELEVATION_DEG*Math.PI/180,ce=Math.cos(se);
  var SUN_LIGHT_DIR=new BABYLON.Vector3(-Math.sin(sb)*ce,-Math.sin(se),-Math.cos(sb)*ce).normalize();
  var SUN_TO_SOURCE_H=new BABYLON.Vector3(-SUN_LIGHT_DIR.x,0,-SUN_LIGHT_DIR.z).normalize();
  window.SunModel={bearingDeg:SUN_BEARING_DEG,elevationDeg:SUN_ELEVATION_DEG,lightDir:SUN_LIGHT_DIR.clone(),toSunH:SUN_TO_SOURCE_H.clone()};
  var SUN_H_GLSL='vec3('+SUN_TO_SOURCE_H.x.toFixed(7)+',0.,'+SUN_TO_SOURCE_H.z.toFixed(7)+')';

  try{
    if(typeof hemi!=='undefined'){
      hemi.intensity=.68;
      hemi.diffuse=new BABYLON.Color3(.62,.70,.82);
      hemi.groundColor=new BABYLON.Color3(.40,.31,.20);
    }
    if(typeof sun!=='undefined'){
      sun.intensity=1.05;
      sun.diffuse=new BABYLON.Color3(1.0,.74,.50);
      sun.direction=SUN_LIGHT_DIR.clone();
    }
    scene.fogDensity=.00345;
    scene.fogColor=new BABYLON.Color3(ATMO_R,ATMO_G,ATMO_B);
    scene.clearColor=new BABYLON.Color4(ATMO_R,ATMO_G,ATMO_B,1);
  }catch(_){ }

  try{
    if(typeof ground!=='undefined'&&typeof gm!=='undefined'&&typeof A!=='undefined'){
      var GROUND_SIZE=560,GROUND_TILE=64;
      var dirt=new BABYLON.Texture(A+'dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
      dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
      dirt.uScale=dirt.vScale=GROUND_TILE;
      dirt.anisotropicFilteringLevel=4;
      gm.diffuseTexture=dirt;
      gm.diffuseColor=new BABYLON.Color3(1,1,1);
      gm.ambientColor=BABYLON.Color3.Black();
      gm.specularColor=BABYLON.Color3.Black();
      var texelsPerTile=GROUND_SIZE/GROUND_TILE;
      scene.onBeforeRenderObservable.add(function(){
        /* Ground follows the camera; compensate in UV space so dirt remains fixed in world coordinates. */
        var u=ground.position.x/texelsPerTile,v=ground.position.z/texelsPerTile;
        dirt.uOffset=u-Math.floor(u);dirt.vOffset=v-Math.floor(v);
      });
    }
  }catch(_){ }

  try{
    if(typeof A!=='undefined'){
      var SKY_OFFSET_UV=.110,SKY_RADIUS=500;
      BABYLON.Effect.ShadersStore.skyDomeVertexShader='precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDir;void main(){vDir=position;gl_Position=worldViewProjection*vec4(position,1.0);}';
      BABYLON.Effect.ShadersStore.skyDomeFragmentShader='precision highp float;varying vec3 vDir;uniform sampler2D skyTexture;void main(){vec3 d=normalize(vDir);float lon=atan(d.z,d.x);float lat=acos(clamp(d.y,-1.0,1.0));float s=lon/(2.0*3.14159265359)+0.5;float t=lat/3.14159265359;gl_FragColor=vec4(texture2D(skyTexture,vec2(s,t)).rgb,1.0);}';
      var sky=BABYLON.MeshBuilder.CreateSphere('skyDome',{diameter:SKY_RADIUS*2,segments:24},scene);
      sky.infiniteDistance=true;sky.isPickable=false;sky.applyFog=false;
      var skyMat=new BABYLON.ShaderMaterial('skyDomeMat',scene,{vertex:'skyDome',fragment:'skyDome'},{attributes:['position'],uniforms:['worldViewProjection'],samplers:['skyTexture']});
      skyMat.backFaceCulling=false;skyMat.disableDepthWrite=true;
      var skyTex=new BABYLON.Texture(A+'skytex.png',scene,false,false,BABYLON.Texture.BILINEAR_SAMPLINGMODE);
      skyMat.setTexture('skyTexture',skyTex);
      sky.material=skyMat;

      function setSkyPhysicalOffset(bias){
        var b=+bias||0;
        sky.position.y=SKY_RADIUS*Math.sin(Math.PI*b);
        sky.metadata=sky.metadata||{};
        sky.metadata.uvEquivalentOffset=b;
        sky.metadata.worldYOffset=sky.position.y;
        return sky.position.y;
      }
      window.setSkyPhysicalOffset=setSkyPhysicalOffset;
      window.skyUvToWorldY=function(bias){return SKY_RADIUS*Math.sin(Math.PI*(+bias||0));};
      setSkyPhysicalOffset(SKY_OFFSET_UV);
    }
  }catch(_){ }

  BABYLON.Effect.ShadersStore.nearVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;attribute float instanceSeed;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;varying float vBase;
float hsh(float n){return fract(sin(n)*43758.5453123);}
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec4 wp=mat4(world0,world1,world2,world3)*vec4(position,1.);
  vec2 c=world3.xz;
  float ht=clamp(abs(position.y),0.,1.);ht*=ht;
  float stiff=mix(.72,1.18,hsh(instanceSeed*91.17+3.1));
  vec2 dir=normalize(vec2(.82,.57));
  float gust=.72+.22*sin(c.x*.034+c.y*.022-uTime*.58)+.10*sin(c.x*.071-c.y*.047-uTime*1.07);
  float ph=uTime*1.28+instanceSeed*6.283+c.x*.010+c.y*.006;
  float turb=sin(ph*1.73+instanceSeed*9.7);
  float pulse=sin(ph)*.58+turb*.23;
  float lean=.020+.052*gust+.030*pulse;
  vec2 cross=vec2(-dir.y,dir.x)*turb*.012;
  vec2 bend=(dir*lean+cross)*uWind*stiff*ht;
  wp.xz+=bend;
  vD=distance(wp.xyz,cameraPosition);
  vUV=uv;
  vDry=step(.96,h2(floor(c*.31)+4.7));
  vec3 cardN=normalize(vec3(world2.x,0.,world2.z));
  vec3 sunH=normalize(${SUN_H_GLSL});
  float side=.84+.16*abs(dot(cardN,sunH));
  float back=.07*max(0.,-dot(cardN,sunH));
  vShade=side+back;
  vBase=1.0-uv.y;
  gl_Position=viewProjection*wp;
}`;

  BABYLON.Effect.ShadersStore.nearFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;varying float vBase;uniform sampler2D grassTexture;
void main(){
  if(vD>30.0)discard;
  vec4 c=texture2D(grassTexture,vUV);if(c.a<.12)discard;
  float root=mix(.72,1.0,smoothstep(.02,.36,vBase));
  vec3 col=c.rgb*root*vShade;
  vec3 dry=vec3(.58,.49,.25);
  col=mix(col,mix(col,dry,.32),vDry);
  float dTint=smoothstep(12.0,30.0,vD)*.12;
  col=mix(col,${ATMO_GLSL},dTint);
  gl_FragColor=vec4(col,1.);
}`;

  BABYLON.Effect.ShadersStore.medVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;varying float vBase;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 c=world3.xyz;vec3 toCam=cameraPosition-c;vD=length(toCam);toCam.y=0.;
  vec3 f=toCam/max(length(toCam),.0001);vec3 r=normalize(vec3(f.z,0.,-f.x));
  float sx=length(world0.xyz),sy=length(world1.xyz);
  float ht=clamp(abs(position.y),0.,1.);ht*=ht;
  float sd=h2(floor(c.xz*.17));float stiff=mix(.74,1.16,sd);
  vec2 dir=normalize(vec2(.82,.57));
  float gust=.72+.22*sin(c.x*.034+c.z*.022-uTime*.58)+.10*sin(c.x*.071-c.z*.047-uTime*1.07);
  float ph=uTime*1.12+c.x*.37+c.z*.21;
  float turb=sin(ph*1.73+sd*7.1);
  vec2 bend=(dir*(.020+.050*gust+.027*(sin(ph)*.58+turb*.23))+vec2(-dir.y,dir.x)*turb*.010)*uWind*stiff*ht;
  vec3 p=c+r*(position.x*sx)+vec3(0.,1.,0.)*(position.y*sy);p.xz+=bend;
  vUV=uv;vDry=step(.96,h2(floor(c.xz*.31)+4.7));vBase=1.0-uv.y;
  vec3 sunH=normalize(${SUN_H_GLSL});vShade=.88+.12*abs(dot(r,sunH))+.05*max(0.,-dot(r,sunH));
  gl_Position=viewProjection*vec4(p,1.);
}`;

  BABYLON.Effect.ShadersStore.medFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;varying float vBase;uniform sampler2D grassTexture;
void main(){
  if(vD<30.0||vD>165.0)discard;
  vec4 c=texture2D(grassTexture,vUV);if(c.a<.12)discard;
  float root=mix(.76,1.0,smoothstep(.02,.34,vBase));
  vec3 col=c.rgb*root*vShade;
  col=mix(col,mix(col,vec3(.58,.49,.25),.28),vDry);
  float haze=smoothstep(55.0,165.0,vD)*.30;
  col=mix(col,${ATMO_GLSL},haze);
  gl_FragColor=vec4(col,1.);
}`;

  BABYLON.Effect.ShadersStore.lodVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;
uniform mat4 viewProjection;uniform vec3 cameraPosition;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 c=world3.xyz;vec3 t=cameraPosition-c;vD=length(t);t.y=0.;vec3 f=t/max(length(t),.0001);vec3 r=normalize(vec3(f.z,0.,-f.x));
  float sx=length(world0.xyz),sy=length(world1.xyz);vec3 p=c+r*(position.x*sx)+vec3(0.,1.,0.)*(position.y*sy);
  vUV=uv;vDry=step(.96,h2(floor(c.xz*.31)+4.7));vec3 sunH=normalize(${SUN_H_GLSL});vShade=.90+.10*abs(dot(r,sunH));
  gl_Position=viewProjection*vec4(p,1.);
}`;

  BABYLON.Effect.ShadersStore.farFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;uniform sampler2D grassTexture;
void main(){
  if(vD<150.0||vD>242.0)discard;
  vec4 c=texture2D(grassTexture,vUV);if(c.a<.10)discard;
  vec3 col=c.rgb*vShade;col=mix(col,mix(col,vec3(.58,.49,.25),.22),vDry);
  float haze=smoothstep(150.0,242.0,vD)*.48+.22;
  col=mix(col,${ATMO_GLSL},haze);
  gl_FragColor=vec4(col,1.);
}`;

  BABYLON.Effect.ShadersStore.patchFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;uniform sampler2D fillTexture;
void main(){
  if(vD>30.0)discard;vec2 p=vUV-.5;float fade=1.-smoothstep(.42,1.,length(p)*2.);
  vec4 c=texture2D(fillTexture,vUV);float a=fade*.82;if(a<.025)discard;
  vec3 col=c.rgb*(.96+.04*fade);col=mix(col,${ATMO_GLSL},smoothstep(18.0,30.0,vD)*.10);
  gl_FragColor=vec4(col,a);
}`;
})();
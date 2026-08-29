/* v43 grass/lighting realism: directional gust fields, stiffness/rest-lean variation, subtle dry clumps, base darkening, backlight, distance integration, and coherent sun/sky lighting. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined')return;

  /* Coherent outdoor lighting: warm sun, cooler sky fill, warmer ground bounce. */
  try{
    if(typeof hemi!=='undefined'){
      hemi.intensity=.74;
      hemi.diffuse=new BABYLON.Color3(.72,.82,.92);
      hemi.groundColor=new BABYLON.Color3(.34,.27,.17);
    }
    if(typeof sun!=='undefined'){
      sun.intensity=1.02;
      sun.diffuse=new BABYLON.Color3(1.0,.91,.73);
      sun.direction=new BABYLON.Vector3(-.50,-1,.25);
    }
    scene.fogDensity=.00345;
    scene.fogColor=new BABYLON.Color3(.56,.69,.77);
    scene.clearColor=new BABYLON.Color4(.56,.70,.80,1);
    if(typeof gm!=='undefined'){
      gm.diffuseColor=new BABYLON.Color3(.285,.232,.145);
      gm.specularColor=BABYLON.Color3.Black();
    }
  }catch(_){ }

  /* The main wind direction is world-space and gusts travel across the field.
     Each clump gets its own stiffness from deterministic seed/position. */
  BABYLON.Effect.ShadersStore.nearVertexShader=`precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;attribute float instanceSeed;
uniform mat4 viewProjection;uniform vec3 cameraPosition;uniform float uTime;uniform float uWind;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;varying float vBase;
float hsh(float n){return fract(sin(n)*43758.5453123);}
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
  vDry=step(.955,hsh(instanceSeed*173.9+7.3));
  vec3 cardN=normalize(vec3(world2.x,0.,world2.z));
  vec3 sunH=normalize(vec3(.50,0.,-.25));
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
  col=mix(col,vec3(.56,.69,.77),dTint);
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
  vUV=uv;vDry=step(.958,h2(floor(c.xz*.31)+4.7));vBase=1.0-uv.y;
  vec3 sunH=normalize(vec3(.50,0.,-.25));vShade=.88+.12*abs(dot(r,sunH))+.05*max(0.,-dot(r,sunH));
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
  col=mix(col,vec3(.56,.69,.77),haze);
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
  vUV=uv;vDry=step(.965,h2(floor(c.xz*.31)+4.7));vec3 sunH=normalize(vec3(.50,0.,-.25));vShade=.90+.10*abs(dot(r,sunH));
  gl_Position=viewProjection*vec4(p,1.);
}`;

  BABYLON.Effect.ShadersStore.farFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;varying float vShade;varying float vDry;uniform sampler2D grassTexture;
void main(){
  if(vD<150.0||vD>242.0)discard;
  vec4 c=texture2D(grassTexture,vUV);if(c.a<.10)discard;
  vec3 col=c.rgb*vShade;col=mix(col,mix(col,vec3(.58,.49,.25),.22),vDry);
  float haze=smoothstep(150.0,242.0,vD)*.48+.22;
  col=mix(col,vec3(.56,.69,.77),haze);
  gl_FragColor=vec4(col,1.);
}`;

  /* Fill texture gets subtle distance integration instead of reading as a flat decal. */
  BABYLON.Effect.ShadersStore.patchFragmentShader=`precision highp float;
varying vec2 vUV;varying float vD;uniform sampler2D fillTexture;
void main(){
  if(vD>30.0)discard;vec2 p=vUV-.5;float fade=1.-smoothstep(.42,1.,length(p)*2.);
  vec4 c=texture2D(fillTexture,vUV);float a=fade*.82;if(a<.025)discard;
  vec3 col=c.rgb*(.96+.04*fade);col=mix(col,vec3(.56,.69,.77),smoothstep(18.0,30.0,vD)*.10);
  gl_FragColor=vec4(col,a);
}`;
})();

/* v57 demo terrain adapter.
   Rolling 1200m terrain plus a horizon-to-horizon road through spawn. The road uses
   a deterministic cross-section brush (crown -> shoulders -> drainage ditches -> recovery)
   to deform the actual terrain, roadtex.png is draped over the deformed surface, and a
   generated edge-opacity splat softly blends the road/ditch texture back into dirt.
   v57 adds directional-light cascaded terrain/road shadows and brighter physically-lit
   road material response so roadtex detail remains readable at the low sunset angle.
   The same analytic height sampler drives grass placement and first-person camera height. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||!window.GrassAPI)return;

  var SIZE=1200,SUBDIV=192,EYE=1.9;
  var ROAD_WIDTH=12.0,ROAD_HALF=ROAD_WIDTH*.5,ROAD_DEFORM_RADIUS=8.5;
  var ROAD_CLEAR_WIDTH=13.5,ROAD_REPEAT_M=9.0,ROAD_Z_EXTENT=SIZE*.5;

  function smooth(a,b,x){
    var t=Math.max(0,Math.min(1,(x-a)/Math.max(.0001,b-a)));
    return t*t*(3-2*t);
  }

  function landscapeHeight(x,z){
    return Math.sin(x*.024)*1.55 + Math.cos(z*.021)*1.10 +
      Math.sin((x+z)*.041)*.62 + Math.sin(x*.072-z*.057)*.28;
  }

  function roadCenterHeight(z){ return landscapeHeight(0,z); }

  function roadProfileOffset(x){
    var a=Math.abs(x),t;
    if(a<=3.15){
      t=a/3.15;
      return .18*(1-t*t);
    }
    if(a<=4.15){
      t=smooth(3.15,4.15,a);
      return .02*(1-t);
    }
    if(a<=5.30){
      t=smooth(4.15,5.30,a);
      return .02+(-.52-.02)*t;
    }
    if(a<=6.35){
      t=smooth(5.30,6.35,a);
      return -.52*(1-t);
    }
    return 0;
  }

  function roadBlend(x){
    var a=Math.abs(x);
    if(a<=6.35)return 1;
    if(a>=ROAD_DEFORM_RADIUS)return 0;
    return 1-smooth(6.35,ROAD_DEFORM_RADIUS,a);
  }

  function heightAt(x,z){
    var base=landscapeHeight(x,z),w=roadBlend(x);
    if(w<=0)return base;
    var target=roadCenterHeight(z)+roadProfileOffset(x);
    return base*(1-w)+target*w;
  }

  function sampleAt(x,z){
    var e=.35,h=heightAt(x,z);
    var dx=(heightAt(x+e,z)-heightAt(x-e,z))/(2*e);
    var dz=(heightAt(x,z+e)-heightAt(x,z-e))/(2*e);
    var nx=-dx,ny=1,nz=-dz,len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    nx/=len;ny/=len;nz/=len;
    return {height:h,normal:{x:nx,y:ny,z:nz},slope:Math.acos(Math.max(-1,Math.min(1,ny)))*180/Math.PI};
  }

  var terrain=BABYLON.MeshBuilder.CreateGround('demoBumpyTerrain',{width:SIZE,height:SIZE,subdivisions:SUBDIV,updatable:true},scene);
  var pos=terrain.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  var ind=terrain.getIndices();
  var nor=terrain.getVerticesData(BABYLON.VertexBuffer.NormalKind)||new Array(pos.length).fill(0);
  for(var i=0;i<pos.length;i+=3)pos[i+1]=heightAt(pos[i],pos[i+2]);
  BABYLON.VertexData.ComputeNormals(pos,ind,nor);
  terrain.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
  terrain.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nor,false,false);
  terrain.refreshBoundingInfo();
  terrain.isPickable=true;
  terrain.receiveShadows=true;

  var mat=new BABYLON.StandardMaterial('demoBumpyTerrainMat',scene);
  mat.diffuseColor=new BABYLON.Color3(1,1,1);mat.specularColor=BABYLON.Color3.Black();mat.ambientColor=new BABYLON.Color3(.08,.07,.055);
  if(typeof A!=='undefined'){
    var dirt=new BABYLON.Texture(A+'dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,null,function(){
      console.warn('dirttex.png failed to load from '+A+'dirttex.png'+' - falling back to flat terrain color so the terrain stays visible.');
      mat.diffuseTexture=null;
    });
    dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;dirt.uScale=dirt.vScale=128;dirt.anisotropicFilteringLevel=4;
    mat.diffuseTexture=dirt;
  }
  terrain.material=mat;
  try{if(typeof ground!=='undefined')ground.setEnabled(false);}catch(_){ }

  var cross=24,longSeg=Math.ceil(SIZE/4),rPos=[],rUV=[],rInd=[];
  for(var iz=0;iz<=longSeg;iz++){
    var z=-ROAD_Z_EXTENT+(iz/longSeg)*SIZE;
    for(var ix=0;ix<=cross;ix++){
      var u=ix/cross,x=-ROAD_HALF+u*ROAD_WIDTH;
      rPos.push(x,heightAt(x,z)+.022,z);
      rUV.push(u,(z+ROAD_Z_EXTENT)/ROAD_REPEAT_M);
    }
  }
  var row=cross+1;
  for(var zz=0;zz<longSeg;zz++)for(var xx=0;xx<cross;xx++){
    var a=zz*row+xx,b=a+1,c=a+row,d=c+1;
    rInd.push(a,c,b,b,c,d);
  }
  var rNor=new Array(rPos.length).fill(0);
  BABYLON.VertexData.ComputeNormals(rPos,rInd,rNor);
  var vd=new BABYLON.VertexData();vd.positions=rPos;vd.indices=rInd;vd.normals=rNor;vd.uvs=rUV;
  var road=new BABYLON.Mesh('demoRoad',scene);vd.applyToMesh(road,true);road.isPickable=true;road.receiveShadows=true;

  var roadMat=new BABYLON.StandardMaterial('demoRoadMat',scene);
  roadMat.diffuseColor=new BABYLON.Color3(1.16,1.12,1.06);
  roadMat.ambientColor=new BABYLON.Color3(.18,.155,.12);
  roadMat.specularColor=new BABYLON.Color3(.035,.03,.024);roadMat.specularPower=20;
  if(typeof A!=='undefined'){
    var roadTex=new BABYLON.Texture(A+'roadtex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,function(){
      roadTex.level=1.18;
    },function(){
      console.warn('roadtex.png failed to load from '+A+'roadtex.png'+' - falling back to flat road color so the road stays visible.');
      roadMat.diffuseTexture=null;
    });
    roadTex.wrapU=BABYLON.Texture.CLAMP_ADDRESSMODE;roadTex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    roadTex.anisotropicFilteringLevel=8;roadTex.level=1.18;roadMat.diffuseTexture=roadTex;

    /* Opacity is read from this texture's ALPHA channel (Babylon's default,
       unless opacityTexture.getAlphaFromRGB is set), not its RGB color - keep
       the gradient encoded as transparent(0)->opaque(1)->opaque(1)->transparent(0)
       alpha with a constant RGB, and mark hasAlpha so the edges actually fade
       into dirt instead of hard-clipping. */
    var splat=new BABYLON.DynamicTexture('roadEdgeSplat',{width:256,height:4},scene,false);
    var ctx=splat.getContext(),g=ctx.createLinearGradient(0,0,256,0);
    g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.055,'rgba(255,255,255,1)');
    g.addColorStop(.945,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.clearRect(0,0,256,4);ctx.fillStyle=g;ctx.fillRect(0,0,256,4);splat.update(false);
    splat.wrapU=BABYLON.Texture.CLAMP_ADDRESSMODE;splat.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    splat.hasAlpha=true;roadMat.opacityTexture=splat;
    roadMat.useAlphaFromDiffuseTexture=false;
  }
  roadMat.backFaceCulling=true;road.material=roadMat;

  /* Large outdoor directional shadows. CascadedShadowGenerator keeps useful resolution
     near the player while still allowing rolling terrain to shadow itself farther away. */
  var terrainShadows=null;
  try{
    if(typeof sun!=='undefined'&&BABYLON.CascadedShadowGenerator){
      terrainShadows=new BABYLON.CascadedShadowGenerator(1024,sun);
      terrainShadows.numCascades=3;
      terrainShadows.lambda=.72;
      terrainShadows.bias=.0008;
      terrainShadows.normalBias=.035;
      /* At the 5.7 deg sunset elevation set in grass-realism.js, direct sunlight on
         near-flat ground is already only ~10% of full intensity (dot(N,L)~=sin(5.7deg)),
         and the rolling terrain shadows itself heavily at that grazing angle. A low
         darkness value here on top of that left shadowed ground/road near-black.
         darkness is inverted from what it sounds like: 0 = darkest shadow, 1 = no
         shadow at all. Raised so shadowed ground stays visibly lit. */
      terrainShadows.darkness=.55;
      terrainShadows.stabilizeCascades=true;
      terrainShadows.autoCalcDepthBounds=true;
      terrainShadows.addShadowCaster(terrain,true);
      terrainShadows.addShadowCaster(road,true);
    }
  }catch(e){console.warn('Terrain shadow setup failed',e);terrainShadows=null;}

  window.GrassAPI.autoRebuild=false;
  window.GrassAPI.setTerrainSampler(sampleAt);
  window.GrassAPI.setMaxSlope(38);
  window.GrassAPI.excludeCorridor([{x:0,z:-5000},{x:0,z:5000}],ROAD_CLEAR_WIDTH);
  window.GrassAPI.autoRebuild=true;

  setTimeout(function(){
    scene.onBeforeRenderObservable.add(function(){
      var s=sampleAt(camera.position.x,camera.position.z);
      camera.position.y+=s.height;
    });
    try{
      document.title='Grass Game v57';
      var rows=document.querySelectorAll('#ui .row');
      for(var ri=0;ri<rows.length;ri++)if(rows[ri].textContent.indexOf('Version:')>=0){rows[ri].innerHTML='<strong>Version:</strong> v57';break;}
    }catch(_){ }
  },0);

  window.GrassTerrainDemo={
    mesh:terrain,heightAt:heightAt,landscapeHeight:landscapeHeight,sampleAt:sampleAt,size:SIZE,maxSlope:38,eyeHeight:EYE,
    shadows:terrainShadows,
    road:{mesh:road,material:roadMat,texture:roadTex,width:ROAD_WIDTH,clearWidth:ROAD_CLEAR_WIDTH,deformRadius:ROAD_DEFORM_RADIUS,profileOffset:roadProfileOffset,blend:roadBlend}
  };
})();

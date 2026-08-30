/* v55 demo terrain adapter.
   Creates a static bumpy 560m terrain, exposes the same analytic sampler to GrassAPI,
   and keeps the first-person camera at terrain height + the existing bodycam offset. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||!window.GrassAPI)return;

  var SIZE=560,SUBDIV=128,EYE=1.9;

  function heightAt(x,z){
    return Math.sin(x*.024)*1.55 + Math.cos(z*.021)*1.10 +
      Math.sin((x+z)*.041)*.62 + Math.sin(x*.072-z*.057)*.28;
  }
  function sampleAt(x,z){
    var e=.35,h=heightAt(x,z);
    var dx=(heightAt(x+e,z)-heightAt(x-e,z))/(2*e);
    var dz=(heightAt(x,z+e)-heightAt(x,z-e))/(2*e);
    var nx=-dx,ny=1,nz=-dz,len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    nx/=len;ny/=len;nz/=len;
    return {height:h,normal:{x:nx,y:ny,z:nz},slope:Math.acos(Math.max(-1,Math.min(1,ny)))*180/Math.PI};
  }

  var terrain=BABYLON.MeshBuilder.CreateGround('demoBumpyTerrain',{width:SIZE,height:SIZE,subdivisions:SUBDIV,updatable:false},scene);
  var pos=terrain.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  var ind=terrain.getIndices();
  var nor=terrain.getVerticesData(BABYLON.VertexBuffer.NormalKind)||new Array(pos.length).fill(0);
  for(var i=0;i<pos.length;i+=3)pos[i+1]=heightAt(pos[i],pos[i+2]);
  BABYLON.VertexData.ComputeNormals(pos,ind,nor);
  terrain.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
  terrain.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nor,false,false);
  terrain.refreshBoundingInfo();
  terrain.isPickable=true;

  var mat=new BABYLON.StandardMaterial('demoBumpyTerrainMat',scene);
  mat.diffuseColor=new BABYLON.Color3(1,1,1);mat.specularColor=BABYLON.Color3.Black();mat.ambientColor=BABYLON.Color3.Black();
  if(typeof A!=='undefined'){
    var dirt=new BABYLON.Texture(A+'dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;dirt.uScale=dirt.vScale=64;dirt.anisotropicFilteringLevel=4;
    mat.diffuseTexture=dirt;
  }
  terrain.material=mat;
  try{if(typeof ground!=='undefined')ground.setEnabled(false);}catch(_){ }

  window.GrassAPI.autoRebuild=false;
  window.GrassAPI.setTerrainSampler(sampleAt);
  window.GrassAPI.setMaxSlope(38);
  window.GrassAPI.autoRebuild=true;

  /* Register after the other helper scripts have had a chance to register their camera motion.
     The base demo/bodycam resets camera Y every frame; adding terrain height last preserves bob/breathe. */
  setTimeout(function(){
    scene.onBeforeRenderObservable.add(function(){
      var s=sampleAt(camera.position.x,camera.position.z);
      camera.position.y+=s.height;
    });
  },0);

  window.GrassTerrainDemo={mesh:terrain,heightAt:heightAt,sampleAt:sampleAt,size:SIZE,maxSlope:38,eyeHeight:EYE};
})();

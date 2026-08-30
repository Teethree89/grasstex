/* v58 demo terrain adapter.
   Rolling 1200m terrain plus a horizon-to-horizon road through spawn. The road is part
   of the terrain itself: one deterministic cross-section brush deforms the terrain and
   roadtex.png is painted directly into the lit terrain material in world space.
   No separate road surface mesh is used. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||!window.GrassAPI)return;

  function boot(){
    if(window.__grassTerrainV58Booted)return;
    window.__grassTerrainV58Booted=true;

    var SIZE=1200,SUBDIV=256,EYE=1.9;
    var ROAD_WIDTH=12.0,ROAD_HALF=ROAD_WIDTH*.5,ROAD_DEFORM_RADIUS=8.5;
    var ROAD_CLEAR_WIDTH=13.5,ROAD_REPEAT_M=9.0;

    function smooth(a,b,x){
      var t=Math.max(0,Math.min(1,(x-a)/Math.max(.0001,b-a)));
      return t*t*(3-2*t);
    }
    function landscapeHeight(x,z){
      return Math.sin(x*.024)*1.55 + Math.cos(z*.021)*1.10 +
        Math.sin((x+z)*.041)*.62 + Math.sin(x*.072-z*.057)*.28;
    }
    function roadCenterHeight(z){return landscapeHeight(0,z);}
    function roadProfileOffset(x){
      var a=Math.abs(x),t;
      if(a<=3.15){t=a/3.15;return .18*(1-t*t);}
      if(a<=4.15){t=smooth(3.15,4.15,a);return .02*(1-t);}
      if(a<=5.30){t=smooth(4.15,5.30,a);return .02+(-.52-.02)*t;}
      if(a<=6.35){t=smooth(5.30,6.35,a);return -.52*(1-t);}
      return 0;
    }
    function roadBlend(x){
      var a=Math.abs(x);
      if(a<=6.35)return 1;
      if(a>=ROAD_DEFORM_RADIUS)return 0;
      return 1-smooth(6.35,ROAD_DEFORM_RADIUS,a);
    }
    function roadPaintMask(x){
      var a=Math.abs(x);
      if(a<=5.65)return 1;
      if(a>=6.35)return 0;
      return 1-smooth(5.65,6.35,a);
    }
    function heightAt(x,z){
      var base=landscapeHeight(x,z),w=roadBlend(x);
      if(w<=0)return base;
      return base*(1-w)+(roadCenterHeight(z)+roadProfileOffset(x))*w;
    }
    function sampleAt(x,z){
      var e=.30,h=heightAt(x,z);
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

    var mat=new BABYLON.CustomMaterial('demoTerrainRoadPaintMat',scene);
    mat.diffuseColor=new BABYLON.Color3(1,1,1);
    mat.specularColor=BABYLON.Color3.Black();
    mat.ambientColor=new BABYLON.Color3(.08,.07,.055);

    var dirt=null,roadTex=null;
    if(typeof A!=='undefined'){
      dirt=new BABYLON.Texture(A+'dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,null,function(){
        console.warn('dirttex.png failed to load from '+A+'dirttex.png');
        mat.diffuseTexture=null;
      });
      dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
      dirt.uScale=dirt.vScale=128;
      dirt.anisotropicFilteringLevel=4;
      mat.diffuseTexture=dirt;

      roadTex=new BABYLON.Texture(A+'roadtex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,function(){
        roadTex.level=1.10;
      },function(){console.warn('roadtex.png failed to load from '+A+'roadtex.png');});
      roadTex.wrapU=BABYLON.Texture.CLAMP_ADDRESSMODE;
      roadTex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
      roadTex.anisotropicFilteringLevel=8;
      roadTex.level=1.10;

      mat.AddUniform('roadSampler','sampler2D');
      mat.AddUniform('roadHalfWidth','float',ROAD_HALF);
      mat.AddUniform('roadRepeatM','float',ROAD_REPEAT_M);
      mat.Fragment_Custom_Diffuse(
        'vec2 roadUV=vec2(clamp(vPositionW.x/(roadHalfWidth*2.0)+0.5,0.0,1.0),vPositionW.z/roadRepeatM);'+
        'vec3 roadCol=texture2D(roadSampler,roadUV).rgb;'+
        'float ax=abs(vPositionW.x);'+
        'float roadMask=1.0-smoothstep(roadHalfWidth-0.35,roadHalfWidth+0.35,ax);'+
        'diffuseColor=mix(diffuseColor,roadCol,roadMask);'
      );
      mat.onBindObservable.add(function(){
        var ef=mat.getEffect();if(!ef)return;
        ef.setTexture('roadSampler',roadTex);
        ef.setFloat('roadHalfWidth',ROAD_HALF);
        ef.setFloat('roadRepeatM',ROAD_REPEAT_M);
      });
    }
    terrain.material=mat;
    try{if(typeof ground!=='undefined')ground.setEnabled(false);}catch(_){ }

    var terrainShadows=null;
    try{
      if(typeof sun!=='undefined'&&BABYLON.CascadedShadowGenerator){
        terrainShadows=new BABYLON.CascadedShadowGenerator(1024,sun);
        terrainShadows.numCascades=3;
        terrainShadows.lambda=.72;
        terrainShadows.bias=.0008;
        terrainShadows.normalBias=.035;
        terrainShadows.darkness=.55;
        terrainShadows.stabilizeCascades=true;
        terrainShadows.autoCalcDepthBounds=true;
        terrainShadows.addShadowCaster(terrain,true);
      }
    }catch(e){console.warn('Terrain shadow setup failed',e);terrainShadows=null;}

    window.GrassAPI.autoRebuild=false;
    window.GrassAPI.setTerrainSampler(sampleAt);
    window.GrassAPI.setMaxSlope(38);
    window.GrassAPI.excludeCorridor([{x:0,z:-5000},{x:0,z:5000}],ROAD_CLEAR_WIDTH);
    window.GrassAPI.autoRebuild=true;
    setTimeout(function(){try{window.GrassAPI.requestRebuild();}catch(_){ }},0);

    setTimeout(function(){
      scene.onBeforeRenderObservable.add(function(){
        var s=sampleAt(camera.position.x,camera.position.z);
        camera.position.y+=s.height;
      });
      try{
        document.title='Grass Game v58';
        var rows=document.querySelectorAll('#ui .row');
        for(var ri=0;ri<rows.length;ri++)if(rows[ri].textContent.indexOf('Version:')>=0){rows[ri].innerHTML='<strong>Version:</strong> v58';break;}
      }catch(_){ }
    },0);

    window.GrassTerrainDemo={
      mesh:terrain,heightAt:heightAt,landscapeHeight:landscapeHeight,sampleAt:sampleAt,size:SIZE,maxSlope:38,eyeHeight:EYE,
      shadows:terrainShadows,
      road:{mesh:null,material:mat,texture:roadTex,width:ROAD_WIDTH,clearWidth:ROAD_CLEAR_WIDTH,deformRadius:ROAD_DEFORM_RADIUS,profileOffset:roadProfileOffset,blend:roadBlend,paintMask:roadPaintMask}
    };
  }

  if(typeof BABYLON.CustomMaterial==='function'){
    boot();
  }else{
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/babylonjs-materials@8.26.0/babylonjs.materials.min.js';
    s.onload=function(){if(typeof BABYLON.CustomMaterial==='function')boot();else console.error('CustomMaterial library loaded but BABYLON.CustomMaterial is unavailable');};
    s.onerror=function(){console.error('Failed to load Babylon materials library; road paint cannot initialize');};
    document.head.appendChild(s);
  }
})();

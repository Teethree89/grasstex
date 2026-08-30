/* v65 demo terrain adapter.
   Rolling 1200m terrain with a horizon-to-horizon painted road through spawn.
   Grass shadows are projected decal planes again (see grass-effects.js), so the terrain
   shader no longer samples a world-space shadow splat - that texture fetch and its 512^2
   dynamic texture are gone from the terrain material. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||!window.GrassAPI)return;

  function boot(){
    if(window.__grassTerrainV61Booted)return;
    window.__grassTerrainV61Booted=true;

    var SIZE=1200,NZ=256,EYE=1.9,CELLZ=SIZE/NZ,gridH=null;
    var ROAD_WIDTH=12.0,ROAD_HALF=ROAD_WIDTH*.5,ROAD_DEFORM_RADIUS=8.5;
    var ROAD_CLEAR_WIDTH=13.5,ROAD_REPEAT_M=9.0;

    function smooth(a,b,x){var t=Math.max(0,Math.min(1,(x-a)/Math.max(.0001,b-a)));return t*t*(3-2*t);}
    function landscapeHeight(x,z){return Math.sin(x*.024)*1.55+Math.cos(z*.021)*1.10+Math.sin((x+z)*.041)*.62+Math.sin(x*.072-z*.057)*.28;}
    function roadCenterHeight(z){return landscapeHeight(0,z);}
    function roadProfileOffset(x){var a=Math.abs(x),t;if(a<=3.15){t=a/3.15;return .18*(1-t*t);}if(a<=4.15){t=smooth(3.15,4.15,a);return .02*(1-t);}if(a<=5.30){t=smooth(4.15,5.30,a);return .02+(-.52-.02)*t;}if(a<=6.35){t=smooth(5.30,6.35,a);return -.52*(1-t);}return 0;}
    function roadBlend(x){var a=Math.abs(x);if(a<=6.35)return 1;if(a>=ROAD_DEFORM_RADIUS)return 0;return 1-smooth(6.35,ROAD_DEFORM_RADIUS,a);}
    function roadPaintMask(x){var a=Math.abs(x);if(a<=5.65)return 1;if(a>=6.35)return 0;return 1-smooth(5.65,6.35,a);}
    function heightAt(x,z){var base=landscapeHeight(x,z),w=roadBlend(x);if(w<=0)return base;return base*(1-w)+(roadCenterHeight(z)+roadProfileOffset(x))*w;}
    /* The road runs straight along Z at x=0, so only X needs refining. Uniform 4.69 m
       columns cannot show a 1.15 m ditch at all; these give 0.25 m across the corridor,
       grade out to the old spacing, and coarsen past 150 m to pay for it - +4.7% triangles
       for 5 columns across the ditch drop instead of 0-1. */
    function colSpacing(a){
      if(a<=9)return .25;
      if(a<=35){var t=(a-9)/26;return .25+(4.6875-.25)*(t*t*(3-2*t));}
      if(a<=150)return 4.6875;
      return 9.375;
    }
    var colX=(function(){
      var half=SIZE*.5,right=[0],last=0,out=[],i;
      while(last<half){var nx=last+colSpacing(last);if(nx>half)nx=half;right.push(nx);last=nx;}
      for(i=right.length-1;i>=1;i--)out.push(-right[i]);
      for(i=0;i<right.length;i++)out.push(right[i]);
      return Float64Array.from(out);
    })();
    var NX=colX.length-1,GRID=NX+1;

    /* O(1) column lookup. Buckets are no wider than the finest column, so at most one
       column boundary falls inside one - the while loop below then steps at most once,
       and stays correct even if the spacing table is retuned. */
    var LOOK=.25,LOOKN=Math.ceil(SIZE/LOOK)+1,colOf=new Int32Array(LOOKN);
    (function(){var c=0;for(var b=0;b<LOOKN;b++){var x=b*LOOK-SIZE*.5;while(c<NX-1&&colX[c+1]<=x)c++;colOf[b]=c;}})();

    function build(h,gx,gz){var nx=-gx,ny=1,nz=-gz,len=Math.sqrt(nx*nx+1+nz*nz)||1;nx/=len;ny/=len;nz/=len;return {height:h,normal:{x:nx,y:ny,z:nz},slope:Math.acos(Math.max(-1,Math.min(1,ny)))*180/Math.PI};}
    function sampleAnalytic(x,z){var e=.30;return build(heightAt(x,z),(heightAt(x+e,z)-heightAt(x-e,z))/(2*e),(heightAt(x,z+e)-heightAt(x,z-e))/(2*e));}

    /* Sample the terrain triangle that is actually rendered, not the analytic surface.
       Vertices are laid out col+row*GRID with x rising along col (non-uniform, see colX) and
       z FALLING along row; each cell splits into (A,B,C) where u>=v and (D,A,C) otherwise.
       Placing grass on the analytic surface instead left it floating above or sunk into the
       drawn ground by up to 0.4 m near the road. Reading the baked vertex grid is exact at
       any spacing, and cheaper than the five heightAt() calls it replaced. */
    /* Height-only form of sampleAt: same triangle, but no allocation, no normal and no
       acos. The shadow bake probes this several times per clump, so it stays off that path. */
    function heightOnMesh(x,z){
      if(!gridH)return heightAt(x,z);
      var b=Math.floor((x+SIZE*.5)/LOOK);
      if(b<0||b>=LOOKN)return heightAt(x,z);
      var i=colOf[b];while(i<NX-1&&x>=colX[i+1])i++;
      if(x<colX[i]||x>colX[i+1])return heightAt(x,z);
      var fj=NZ-(z+SIZE*.5)/CELLZ,j=Math.floor(fj),v=fj-j;
      if(j<0||j>=NZ)return heightAt(x,z);
      var u=(x-colX[i])/(colX[i+1]-colX[i]),k=i+j*GRID;
      var hC=gridH[k],hB=gridH[k+1],hD=gridH[k+GRID],hA=gridH[k+GRID+1];
      return (u>=v)?hC+u*(hB-hC)+v*(hA-hB):hC+v*(hD-hC)+u*(hA-hD);
    }

    function sampleAt(x,z){
      if(!gridH)return sampleAnalytic(x,z);
      var b=Math.floor((x+SIZE*.5)/LOOK);
      if(b<0||b>=LOOKN)return sampleAnalytic(x,z);
      var i=colOf[b];while(i<NX-1&&x>=colX[i+1])i++;
      if(x<colX[i]||x>colX[i+1])return sampleAnalytic(x,z);
      var fj=NZ-(z+SIZE*.5)/CELLZ,j=Math.floor(fj),v=fj-j;
      if(j<0||j>=NZ)return sampleAnalytic(x,z);
      var wx=colX[i+1]-colX[i],u=(x-colX[i])/wx;
      var k=i+j*GRID,hC=gridH[k],hB=gridH[k+1],hD=gridH[k+GRID],hA=gridH[k+GRID+1];
      if(u>=v)return build(hC+u*(hB-hC)+v*(hA-hB),(hB-hC)/wx,-(hA-hB)/CELLZ);
      return build(hC+v*(hD-hC)+u*(hA-hD),(hA-hD)/wx,-(hD-hC)/CELLZ);
    }

    /* Built by hand rather than CreateGround, but with CreateGround's exact vertex and
       index layout (vertex = col+row*GRID, x rising with col, z falling with row, each cell
       split (A,B,C)/(D,A,C)) so sampleAt above indexes the same triangles the GPU draws.
       UVs stay world-linear in x, otherwise the narrow corridor columns would squeeze the
       dirt tiling. */
    var terrain=new BABYLON.Mesh('demoBumpyTerrain',scene);
    var vcount=GRID*(NZ+1),pos=new Float32Array(vcount*3),uvs=new Float32Array(vcount*2),nor=new Float32Array(vcount*3),ind=new Uint32Array(NX*NZ*6);
    gridH=new Float32Array(vcount);
    for(var row=0;row<=NZ;row++){
      var zc=(NZ-row)*CELLZ-SIZE*.5;
      for(var col=0;col<GRID;col++){
        var vi=col+row*GRID,xc=colX[col],hv=heightAt(xc,zc);
        pos[vi*3]=xc;pos[vi*3+1]=hv;pos[vi*3+2]=zc;gridH[vi]=hv;
        uvs[vi*2]=(xc+SIZE*.5)/SIZE;uvs[vi*2+1]=1-row/NZ;
      }
    }
    var q=0;
    for(var rr=0;rr<NZ;rr++)for(var cc=0;cc<NX;cc++){
      ind[q++]=cc+1+(rr+1)*GRID;ind[q++]=cc+1+rr*GRID;ind[q++]=cc+rr*GRID;
      ind[q++]=cc+(rr+1)*GRID;ind[q++]=cc+1+(rr+1)*GRID;ind[q++]=cc+rr*GRID;
    }
    BABYLON.VertexData.ComputeNormals(pos,ind,nor);
    var vdata=new BABYLON.VertexData();vdata.positions=pos;vdata.indices=ind;vdata.normals=nor;vdata.uvs=uvs;
    vdata.applyToMesh(terrain,true);
    terrain.isPickable=true;terrain.receiveShadows=true;

    var mat=new BABYLON.CustomMaterial('demoTerrainRoadPaintMat',scene);mat.diffuseColor=new BABYLON.Color3(1.06,1.04,1.01);mat.specularColor=BABYLON.Color3.Black();mat.ambientColor=new BABYLON.Color3(.15,.125,.09);
    var dirt=null,roadTex=null;
    if(typeof A!=='undefined'){
      dirt=new BABYLON.Texture(A+'dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,null,function(){console.warn('dirttex.png failed to load from '+A+'dirttex.png');mat.diffuseTexture=null;});dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;dirt.uScale=dirt.vScale=128;dirt.anisotropicFilteringLevel=4;mat.diffuseTexture=dirt;
      roadTex=new BABYLON.Texture(A+'roadtex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE,function(){roadTex.level=1.16;},function(){console.warn('roadtex.png failed to load from '+A+'roadtex.png');});roadTex.wrapU=BABYLON.Texture.CLAMP_ADDRESSMODE;roadTex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;roadTex.anisotropicFilteringLevel=8;roadTex.level=1.16;
      mat.AddUniform('roadSampler','sampler2D');mat.AddUniform('roadHalfWidth','float',ROAD_HALF);mat.AddUniform('roadRepeatM','float',ROAD_REPEAT_M);
      mat.Fragment_Custom_Diffuse('vec2 roadUV=vec2(clamp(vPositionW.x/(roadHalfWidth*2.0)+0.5,0.0,1.0),vPositionW.z/roadRepeatM);vec3 roadCol=texture2D(roadSampler,roadUV).rgb;roadCol=min(vec3(1.0),roadCol*1.38+vec3(.060,.052,.040));float ax=abs(vPositionW.x);float roadMask=1.0-smoothstep(roadHalfWidth-0.35,roadHalfWidth+0.35,ax);diffuseColor=mix(diffuseColor,roadCol,roadMask);');
      mat.onBindObservable.add(function(){var ef=mat.getEffect();if(!ef)return;ef.setTexture('roadSampler',roadTex);ef.setFloat('roadHalfWidth',ROAD_HALF);ef.setFloat('roadRepeatM',ROAD_REPEAT_M);});
    }
    terrain.material=mat;try{if(typeof ground!=='undefined')ground.setEnabled(false);}catch(_){ }

    var terrainShadows=null;try{if(typeof sun!=='undefined'&&BABYLON.CascadedShadowGenerator){terrainShadows=new BABYLON.CascadedShadowGenerator(1024,sun);terrainShadows.numCascades=3;terrainShadows.lambda=.72;terrainShadows.bias=.0008;terrainShadows.normalBias=.035;terrainShadows.darkness=.78;terrainShadows.stabilizeCascades=true;terrainShadows.autoCalcDepthBounds=true;terrainShadows.addShadowCaster(terrain,true);}}catch(e){console.warn('Terrain shadow setup failed',e);terrainShadows=null;}

    window.GrassAPI.autoRebuild=false;window.GrassAPI.setTerrainSampler(sampleAt);window.GrassAPI.setMaxSlope(38);window.GrassAPI.excludeCorridor([{x:0,z:-5000},{x:0,z:5000}],ROAD_CLEAR_WIDTH);window.GrassAPI.autoRebuild=true;setTimeout(function(){try{window.GrassAPI.requestRebuild();}catch(_){ }},0);

    setTimeout(function(){scene.onBeforeRenderObservable.add(function(){var s=sampleAt(camera.position.x,camera.position.z);camera.position.y+=s.height;});try{document.title='Grass Game v65';var rows=document.querySelectorAll('#ui .row');for(var ri=0;ri<rows.length;ri++)if(rows[ri].textContent.indexOf('Version:')>=0){rows[ri].innerHTML='<strong>Version:</strong> v65';break;}}catch(_){ }},0);

    window.GrassTerrainDemo={mesh:terrain,heightAt:heightAt,meshHeightAt:heightOnMesh,landscapeHeight:landscapeHeight,sampleAt:sampleAt,size:SIZE,maxSlope:38,eyeHeight:EYE,shadows:terrainShadows,road:{mesh:null,material:mat,texture:roadTex,width:ROAD_WIDTH,clearWidth:ROAD_CLEAR_WIDTH,deformRadius:ROAD_DEFORM_RADIUS,profileOffset:roadProfileOffset,blend:roadBlend,paintMask:roadPaintMask}};
  }

  if(typeof BABYLON.CustomMaterial==='function'){boot();}else{var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/babylonjs-materials@8.26.0/babylonjs.materials.min.js';s.onload=function(){if(typeof BABYLON.CustomMaterial==='function')boot();else console.error('CustomMaterial library loaded but BABYLON.CustomMaterial is unavailable');};s.onerror=function(){console.error('Failed to load Babylon materials library; road paint cannot initialize');};document.head.appendChild(s);}
})();

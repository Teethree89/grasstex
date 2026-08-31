/* v65 baked-terrain adapter. Replaces terrain-demo.js.

   The analytic surface is gone. This loads the pack tools/terrain-bake emits
   (terrain.bin + terrain.json + splat.png + roaduv.png), rebuilds the two-level tile
   structure, and hands the SAME field to both consumers:

     - GrassAPI.setTerrainSampler -> TerrainTile.sampleTiled
     - the terrain mesh, streamed as camera-relative LOD chunks over that field

   which is the invariant this whole thing rests on. Grass no longer samples "the mesh's
   grid"; grass and the mesh sample one field, and measured disagreement stays under a
   third of a pixel at every distance (tools/terrain-bake/README.md).

   Road paint is a splat + road-space UVs rather than vPositionW.x, so curves and
   branches work. That also drops BABYLON.CustomMaterial, and with it the CDN script
   this file used to boot behind - the async boot that made shadows bake flat at y=0
   until you walked far enough (see grass-effects.js).

   KNOWN GAP: the terrain material is a ShaderMaterial, so it does not receive the
   cascaded shadow map the way the old StandardMaterial did. Terrain self-shadowing
   needs the CSM uniforms wiring into this shader; grass shadow decals are unaffected. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||!window.GrassAPI)return;
  if(!window.TerrainTile||!window.TerrainLod||!window.TerrainStream){
    console.error('terrain-baked: load tile.js, lod.js and stream.js first');return;}

  var BASE=window.TERRAIN_ASSET_BASE||((typeof A!=='undefined'?A:'')+'terrain/');
  var CHUNK_M=32, RANGE=300, BUDGET=4, EYE=1.9, DIRT_SCALE=1/6;

  function j(u){return fetch(u,{cache:'force-cache'}).then(function(r){if(!r.ok)throw new Error(u+' -> '+r.status);return r.json();});}
  function b(u){return fetch(u,{cache:'force-cache'}).then(function(r){if(!r.ok)throw new Error(u+' -> '+r.status);return r.arrayBuffer();});}

  Promise.all([j(BASE+'terrain.json'),b(BASE+'terrain.bin')]).then(function(res){
    boot(res[0],res[1]);
  }).catch(function(e){console.error('terrain-baked: asset load failed',e);});

  function boot(man,buf){
    if(window.__grassTerrainBaked)return;window.__grassTerrainBaked=true;
    var T=window.TerrainTile.fromPacked(man,buf), W=man.world, H=W*0.5;
    var sample=window.TerrainTile.sampleTiled;

    /* bake space (bx,by) in [0,W] <-> world (x,z). by runs opposite to z, which is the
       same handedness CreateGround uses, so the index winding below is unchanged. */
    function bx(x){return x+H;} function by(z){return H-z;}
    function heightAt(x,z){return sample(T,bx(x),by(z));}

    var E=0.25;
    function sampleAt(x,z){
      var u=bx(x),v=by(z);
      var dhdx=(sample(T,u+E,v)-sample(T,u-E,v))/(2*E);
      var dhdby=(sample(T,u,v+E)-sample(T,u,v-E))/(2*E);
      var nx=-dhdx, ny=1, nz=dhdby;                 /* dh/dz = -dh/dby */
      var len=Math.sqrt(nx*nx+1+nz*nz)||1;nx/=len;ny/=len;nz/=len;
      return {height:sample(T,u,v),normal:{x:nx,y:ny,z:nz},
        slope:Math.acos(Math.max(-1,Math.min(1,ny)))*180/Math.PI};
    }

    /* ---- material: splat weights + road-space UVs, no CustomMaterial ---- */
    BABYLON.Effect.ShadersStore.bakedTerrainVertexShader=
      'precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;'+
      'uniform mat4 worldViewProjection;varying vec3 vN;varying vec2 vUV;varying vec3 vP;'+
      'void main(){vP=position;vN=normal;vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}';
    BABYLON.Effect.ShadersStore.bakedTerrainFragmentShader=
      'precision highp float;varying vec3 vN;varying vec2 vUV;varying vec3 vP;'+
      'uniform sampler2D splatTex;uniform sampler2D roadUvTex;uniform sampler2D dirtTex;uniform sampler2D roadTex;'+
      'uniform vec3 uSunDir;uniform vec3 uSunCol;uniform vec3 uAmb;uniform float uDirtScale;uniform float uRoadRepeat;'+
      'void main(){'+
      ' vec4 sp=texture2D(splatTex,vUV);'+   /* r,g,b,a = grass,asphalt,dirt,cobble */
      ' vec3 detail=texture2D(dirtTex,vP.xz*uDirtScale).rgb;'+
      ' vec3 ruv=texture2D(roadUvTex,vUV).rgb;'+
      ' float rs=fract(atan(ruv.r*2.0-1.0,ruv.b*2.0-1.0)*0.15915494+1.0);'+   /* phase off the circle */
      ' vec3 asphalt=texture2D(roadTex,vec2(ruv.g,rs)).rgb*1.30+vec3(.055,.048,.038);'+
      ' vec3 grass=detail*vec3(1.03,1.02,0.99);'+
      ' vec3 dirtRd=detail*vec3(1.18,1.02,0.84);'+
      ' vec3 cobble=detail*vec3(0.92,0.92,0.96);'+
      ' float wsum=max(1e-4,sp.r+sp.g+sp.b+sp.a);'+
      ' vec3 col=(grass*sp.r+asphalt*sp.g+dirtRd*sp.b+cobble*sp.a)/wsum;'+
      ' float ndl=max(dot(normalize(vN),-uSunDir),0.0);'+
      ' gl_FragColor=vec4(col*(uAmb+uSunCol*ndl),1.0);}';

    var mat=new BABYLON.ShaderMaterial('bakedTerrainMat',scene,
      {vertex:'bakedTerrain',fragment:'bakedTerrain'},
      {attributes:['position','normal','uv'],
       uniforms:['worldViewProjection','uSunDir','uSunCol','uAmb','uDirtScale','uRoadRepeat'],
       samplers:['splatTex','roadUvTex','dirtTex','roadTex']});
    function tex(url,inv,wrap){var t=new BABYLON.Texture(url,scene,false,inv);
      t.wrapU=t.wrapV=wrap?BABYLON.Texture.WRAP_ADDRESSMODE:BABYLON.Texture.CLAMP_ADDRESSMODE;
      t.anisotropicFilteringLevel=4;return t;}
    var splatT=tex(BASE+'splat.png',false,false), roadUvT=tex(BASE+'roaduv.png',false,false);
    var dirtT=tex((typeof A!=='undefined'?A:'')+'dirttex.png',true,true);
    var roadT=tex((typeof A!=='undefined'?A:'')+'roadtex.png',true,true);
    mat.setTexture('splatTex',splatT);mat.setTexture('roadUvTex',roadUvT);
    mat.setTexture('dirtTex',dirtT);mat.setTexture('roadTex',roadT);
    mat.setFloat('uDirtScale',DIRT_SCALE);mat.setFloat('uRoadRepeat',man.roadRepeatM||9);
    var sd=(typeof sun!=='undefined'&&sun.direction)?sun.direction:new BABYLON.Vector3(-.47,-.10,.88);
    mat.setVector3('uSunDir',sd.normalizeToNew());
    mat.setVector3('uSunCol',new BABYLON.Vector3(.92,.88,.80));
    mat.setVector3('uAmb',new BABYLON.Vector3(.30,.30,.34));

    /* ---- streaming LOD mesh over the same field ---- */
    var tPC=CHUNK_M/T.TILE;
    function hasRoad(ci,cj){
      for(var q=0;q<tPC;q++)for(var p=0;p<tPC;p++){
        var ti=ci*tPC+p,tj=cj*tPC+q;
        if(ti<T.nT&&tj<T.nT&&T.fine.has(tj*T.nT+ti))return true;}
      return false;
    }
    /* off-road chunks never need the finest level (grass is excluded from the ditch,
       which is the only thing it resolves); corridor chunks never go coarser than
       ROAD_CAP, or the ditch aliases into a sawtooth along the verge at range. */
    var ROAD_CAP=2;
    function floorLevel(ci,cj){return hasRoad(ci,cj)?0:1;}
    function capLevel(ci,cj){return hasRoad(ci,cj)?ROAD_CAP:window.TerrainLod.LOD.length-1;}
    var st=window.TerrainStream.create(T,{chunk:CHUNK_M,range:RANGE,hyst:6,budget:BUDGET,
      floorLevel:floorLevel,capLevel:capLevel});
    var meshes=new Map(),root=new BABYLON.TransformNode('bakedTerrain',scene);

    function syncChunk(key,c){
      var m=meshes.get(key);
      if(m&&m.__g===c.g)return;
      var n=c.n,G=n+1,s=c.s,ox=c.ci*CHUNK_M,oy=c.cj*CHUNK_M;
      var pos=new Float32Array(G*G*3),nor=new Float32Array(G*G*3),uvs=new Float32Array(G*G*2);
      for(var jj=0;jj<G;jj++)for(var ii=0;ii<G;ii++){
        var u=ox+ii*s,v=oy+jj*s,vi=jj*G+ii;
        pos[vi*3]=u-H;pos[vi*3+1]=c.g[vi];pos[vi*3+2]=H-v;
        /* normals from the FIELD, not from this chunk's triangles: per-chunk
           ComputeNormals has no neighbour data and leaves a lighting seam on every
           chunk border, which reads as a grid over the whole terrain. */
        var dhdx=(sample(T,u+E,v)-sample(T,u-E,v))/(2*E), dhdby=(sample(T,u,v+E)-sample(T,u,v-E))/(2*E);
        var nx=-dhdx,ny=1,nz=dhdby,L=Math.sqrt(nx*nx+1+nz*nz)||1;
        nor[vi*3]=nx/L;nor[vi*3+1]=ny/L;nor[vi*3+2]=nz/L;
        uvs[vi*2]=u/T.WT;uvs[vi*2+1]=v/T.WT;
      }
      var ind=new Uint32Array(n*n*6),q=0;
      for(var rr=0;rr<n;rr++)for(var cc=0;cc<n;cc++){
        ind[q++]=cc+1+(rr+1)*G;ind[q++]=cc+1+rr*G;ind[q++]=cc+rr*G;
        ind[q++]=cc+(rr+1)*G;ind[q++]=cc+1+(rr+1)*G;ind[q++]=cc+rr*G;
      }
      if(!m){m=new BABYLON.Mesh('tc'+key,scene);m.parent=root;m.material=mat;
        m.isPickable=false;m.alwaysSelectAsActiveMesh=false;meshes.set(key,m);}
      var vd=new BABYLON.VertexData();vd.positions=pos;vd.normals=nor;vd.uvs=uvs;vd.indices=ind;
      vd.applyToMesh(m,true);m.__g=c.g;
    }

    var ready=false;
    function pump(){
      var cam=[bx(camera.position.x),by(camera.position.z)];
      window.TerrainStream.update(st,cam);
      for(var e of st.chunks){var k=e[0],c=e[1];if(c.g)syncChunk(k,c);}
      for(var k2 of Array.from(meshes.keys()))
        if(!st.chunks.has(k2)){meshes.get(k2).dispose();meshes.delete(k2);}
      if(!ready&&st.dirty.size===0){ready=true;
        if(typeof status!=='undefined'&&status)status.textContent='Terrain ready — '+meshes.size+' chunks';}
    }

    /* hand the field to grass BEFORE the first rebuild, then let it build */
    try{if(typeof ground!=='undefined')ground.setEnabled(false);}catch(_){}
    try{if(window.GrassTerrainDemo&&window.GrassTerrainDemo.mesh)window.GrassTerrainDemo.mesh.setEnabled(false);}catch(_){}
    window.GrassAPI.autoRebuild=false;
    window.GrassAPI.setTerrainSampler(sampleAt);
    window.GrassAPI.setMaxSlope(38);
    window.GrassAPI.clearExclusions();
    window.GrassAPI.autoRebuild=true;
    pump();
    setTimeout(function(){try{window.GrassAPI.requestRebuild();}catch(_){}},0);

    scene.onBeforeRenderObservable.add(function(){
      pump();
      if(window.__noFollow)return;   /* escape hatch for fixed debug cameras */
      var h=heightAt(camera.position.x,camera.position.z);
      if(isFinite(h))camera.position.y=h+EYE;
    });

    window.GrassTerrainBaked={tiles:T,manifest:man,sampleAt:sampleAt,heightAt:heightAt,
      stream:st,meshes:meshes,material:mat,size:W,eyeHeight:EYE,
      stats:function(){var v=0;st.chunks.forEach(function(c){if(c.g)v+=(c.n+1)*(c.n+1);});
        return {chunks:st.chunks.size,vertices:v,queued:st.dirty.size};}};
    console.log('terrain-baked: '+W+' m world, '+T.fine.size+' fine tiles, '+st.chunks.size+' chunks');
  }
})();

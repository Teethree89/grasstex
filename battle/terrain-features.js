/* Battlefield clutter: the cover field. Hedgerows are one authoritative combat volume shared by
   rendering, navigation, LOS, cover and ballistics. Other clutter still publishes tactical cover
   data plus a mesh-aligned movement footprint where those representations genuinely differ.

   The hedge volume is a short terrain-following oriented prism. Navigation uses its X/Z projection
   and inflates it by the soldier body radius; sight and bullets use its full vertical extent. This
   avoids the old three-hedge problem where a 1.1 m visual box, a 2D navigation rectangle and a row
   of giant LOS circles all disagreed about where the same bocage bank actually was. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var LEAF=[c3('3d5a2c'),c3('466233'),c3('35502a')],TRUNK=c3('4a3624'),HEDGE=c3('3f5a2e'),ROCK=c3('6d6a61'),STONE=c3('7a7568');
  /* Typical Normandy bocage is a bank/root mass with dense woody growth above it. A 2.2 m opaque
     combat volume is deliberately conservative: a standing 1.55 m eye cannot casually see over it,
     while gaps and hedge ends remain the natural places to see and move through. Short chunks let
     the base follow rolling terrain instead of floating a 50 m box from one midpoint sample. */
  var HEDGE_WIDTH=2.2,HEDGE_HEIGHT=2.2,HEDGE_CHUNK=3.0,HEDGE_BURY=.25;

  function paint(mesh,color){
    var n=mesh.getTotalVertices(),data=new Float32Array(n*4);
    for(var i=0;i<n;i++){data[i*4]=color.r;data[i*4+1]=color.g;data[i*4+2]=color.b;data[i*4+3]=1;}
    mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);
    return mesh;
  }
  function box(scene,size,color,pos,rot){
    var m=BABYLON.MeshBuilder.CreateBox('f',{width:size[0],height:size[1],depth:size[2]},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }
  function cone(scene,diam,height,color,pos){
    var m=BABYLON.MeshBuilder.CreateCylinder('f',{diameterTop:0,diameterBottom:diam,height:height,tessellation:7},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }
  function cylinder(scene,diam,height,color,pos){
    var m=BABYLON.MeshBuilder.CreateCylinder('f',{diameter:diam,height:height,tessellation:6},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }

  var sharedMat=null;
  function featureMaterial(scene){
    if(sharedMat&&sharedMat.getScene()===scene)return sharedMat;
    sharedMat=new BABYLON.StandardMaterial('terrainFeatureMat',scene);
    sharedMat.specularColor=BABYLON.Color3.Black();sharedMat.ambientColor=new BABYLON.Color3(1,1,1);
    return sharedMat;
  }

  function mulberry32(seed){
    var a=seed>>>0;
    return function(){
      a|=0;a=a+0x6D2B79F5|0;
      var t=Math.imul(a^a>>>15,1|a);
      t=t+Math.imul(t^t>>>7,61|t)^t;
      return((t^t>>>14)>>>0)/4294967296;
    };
  }

  function buildTree(scene,x,y,z,scale,leafColor){
    var trunkH=1.2*scale;
    var trunk=cylinder(scene,.22*scale,trunkH,TRUNK,[0,trunkH/2,0]);
    var foliage=cone(scene,2.4*scale,2.6*scale,leafColor,[0,trunkH+1.1*scale,0]);
    var mesh=BABYLON.Mesh.MergeMeshes([trunk,foliage],true,true,undefined,false,false);
    mesh.material=featureMaterial(scene);mesh.isPickable=false;mesh.position.set(x,y,z);return mesh;
  }
  /* Build the exact prism described by the combat-volume record. The lower edge is buried slightly
     below the sampled terrain, the same trick used by ww2fps terrain skirts, so interpolation cannot
     open a visual/LOS slit at the foot of the hedge. */
  function buildHedgePrism(scene,fp){
    var a={ux:fp.ux,uz:fp.uz,vx:fp.vx,vz:fp.vz},hx=fp.hx,hz=fp.hz;
    var ax=fp.x-a.ux*hx,az=fp.z-a.uz*hx,bx=fp.x+a.ux*hx,bz=fp.z+a.uz*hx;
    var y0=fp.y0,y1=fp.y1,top0=y0+fp.height,top1=y1+fp.height;
    var p=[
      ax+a.vx*hz,y0,az+a.vz*hz, ax-a.vx*hz,y0,az-a.vz*hz,
      bx-a.vx*hz,y1,bz-a.vz*hz, bx+a.vx*hz,y1,bz+a.vz*hz,
      ax+a.vx*hz,top0,az+a.vz*hz, ax-a.vx*hz,top0,az-a.vz*hz,
      bx-a.vx*hz,top1,bz-a.vz*hz, bx+a.vx*hz,top1,bz+a.vz*hz
    ];
    var ind=[0,2,1,0,3,2, 4,5,6,4,6,7, 0,4,7,0,7,3, 1,2,6,1,6,5, 0,1,5,0,5,4, 3,7,6,3,6,2];
    var m=new BABYLON.Mesh('hedge-prism',scene),vd=new BABYLON.VertexData(),norm=[],uv=[];
    BABYLON.VertexData.ComputeNormals(p,ind,norm);
    for(var ui=0;ui<p.length/3;ui++)uv.push(0,0);
    vd.positions=p;vd.indices=ind;vd.normals=norm;vd.uvs=uv;vd.applyToMesh(m);
    paint(m,HEDGE);m.material=featureMaterial(scene);m.isPickable=false;return m;
  }

  var MERGE_CELL=260;
  function mergeBuckets(scene,entries){
    var buckets={},out=[];
    for(var i=0;i<entries.length;i++){
      var e=entries[i],key=Math.round(e.x/MERGE_CELL)+'|'+Math.round(e.z/MERGE_CELL);
      (buckets[key]||(buckets[key]=[])).push(e.mesh);
    }
    Object.keys(buckets).forEach(function(key){
      var list=buckets[key];
      if(list.length===1){out.push(list[0]);return;}
      var merged=BABYLON.Mesh.MergeMeshes(list,true,true,undefined,false,false);
      if(merged){merged.material=featureMaterial(scene);merged.isPickable=false;merged.freezeWorldMatrix&&merged.freezeWorldMatrix();out.push(merged);}else out.push.apply(out,list);
    });
    return out;
  }

  function buildRock(scene,x,y,z,size,rot){var m=box(scene,[size*1.8,size,size*1.5],ROCK,[0,size/2,0],[0,rot,0]);m.position.set(x,y,z);return m;}
  function buildLog(scene,x,y,z,len,rot){var m=cylinder(scene,.55,len,TRUNK,null);m.rotation.z=Math.PI/2;m.rotation.y=rot;m.bakeCurrentTransformIntoVertices();m.position.set(x,y+.28,z);return m;}
  function buildWallStub(scene,x,y,z,len,rot){var m=box(scene,[len,1.05,.5],STONE,[0,.52,0],[0,rot,0]);m.position.set(x,y,z);return m;}

  function scatter(scene,heightAt,opts){
    opts=opts||{};
    var fieldW=opts.fieldW||360,fieldD=opts.fieldD||(opts.keepoutZ?opts.keepoutZ*2.2:190),keepoutZ=opts.keepoutZ||fieldD*.46;
    var rng=mulberry32(opts.seed||1337),halfW=fieldW*.46,entries=[],obstacles=[],physical=[],area=(halfW*2)*(keepoutZ*2),physicalSeq=0;
    var scenario=opts.scenario||(root.BattleScenarioGenerator&&root.BattleScenarioGenerator.current?root.BattleScenarioGenerator.current():null);
    var buildings=scenario&&scenario.buildings||[],BUILDING_KEEP=opts.buildingKeepout==null?2.2:+opts.buildingKeepout;

    function place(mesh,x,z){entries.push({mesh:mesh,x:x,z:z});}
    function addObstacle(x,z,radius,cover,height,type,physicalId){obstacles.push({x:x,z:z,y:heightAt(x,z),radius:radius,cover:cover,height:height,type:type,physicalId:physicalId||null});}
    function axes(rot){var c=Math.cos(rot||0),s=Math.sin(rot||0);return{ux:c,uz:-s,vx:s,vz:c};}
    function addObb(x,z,hx,hz,rot,type,id){var a=axes(rot),fp={id:id||('physical-'+physicalSeq++),type:type,shape:'obb',x:x,z:z,hx:hx,hz:hz,ux:a.ux,uz:a.uz,vx:a.vx,vz:a.vz};physical.push(fp);return fp;}
    function addCircle(x,z,radius,type,id){var fp={id:id||('physical-'+physicalSeq++),type:type,shape:'circle',x:x,z:z,radius:radius};physical.push(fp);return fp;}
    function addHedgeVolume(ax,az,bx,bz){
      var dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz)||.001,ux=dx/len,uz=dz/len,vx=-uz,vz=ux;
      var y0=heightAt(ax,az)-HEDGE_BURY,y1=heightAt(bx,bz)-HEDGE_BURY,id='hedge-'+physicalSeq++;
      var fp={id:id,physicalId:id,type:'hedge',shape:'obb',volume:'terrain-prism',x:(ax+bx)/2,z:(az+bz)/2,
        hx:len/2,hz:HEDGE_WIDTH/2,ux:ux,uz:uz,vx:vx,vz:vz,y:(y0+y1)/2,y0:y0,y1:y1,
        height:HEDGE_HEIGHT+HEDGE_BURY,visibleHeight:HEDGE_HEIGHT,radius:HEDGE_WIDTH/2,cover:.62};
      /* The SAME object is published to tactical and physical consumers. */
      physical.push(fp);obstacles.push(fp);return fp;
    }

    function buildingLocal(b,x,z){var c=Math.cos(b.rot||0),s=Math.sin(b.rot||0),dx=x-b.x,dz=z-b.z;return{x:dx*c-dz*s,z:dx*s+dz*c};}
    function segmentHitsBox(a,b,hx,hz){
      var dx=b.x-a.x,dz=b.z-a.z,t0=0,t1=1;
      function slab(p,d,min,max){
        if(Math.abs(d)<1e-9)return p>=min&&p<=max;
        var q0=(min-p)/d,q1=(max-p)/d;if(q0>q1){var q=q0;q0=q1;q1=q;}
        if(q0>t0)t0=q0;if(q1<t1)t1=q1;return t0<=t1;
      }
      return slab(a.x,dx,-hx,hx)&&slab(a.z,dz,-hz,hz)&&t1>=0&&t0<=1;
    }
    function pointBlockedByBuilding(x,z,radius){
      radius=radius||0;
      for(var i=0;i<buildings.length;i++){
        var b=buildings[i],p=buildingLocal(b,x,z);
        if(Math.abs(p.x)<=b.w/2+BUILDING_KEEP+radius&&Math.abs(p.z)<=b.d/2+BUILDING_KEEP+radius)return true;
      }
      return false;
    }
    function segmentBlockedByBuilding(ax,az,bx,bz,width){
      var pad=BUILDING_KEEP+(width||0)/2;
      for(var i=0;i<buildings.length;i++){
        var b=buildings[i],a=buildingLocal(b,ax,az),e=buildingLocal(b,bx,bz);
        if(segmentHitsBox(a,e,b.w/2+pad,b.d/2+pad))return true;
      }
      return false;
    }

    var rowGap=opts.hedgeRowGap||140,colGap=opts.hedgeColGap||260;
    function hedgeLine(along,fixed,horizontal){
      var span=horizontal?halfW*2:keepoutZ*2,cursor=-span/2+rng()*40;
      while(cursor<span/2-14){
        var segLen=26+rng()*34,gap=14+rng()*26;if(cursor+segLen>span/2)segLen=span/2-cursor;if(segLen<10)break;
        var jag=(rng()-.5)*7,ax=horizontal?cursor:fixed,az=horizontal?fixed+jag:cursor,bx=horizontal?cursor+segLen:fixed-jag,bz=horizontal?fixed-jag:cursor+segLen;
        if(!segmentBlockedByBuilding(ax,az,bx,bz,HEDGE_WIDTH)){
          var pieces=Math.max(1,Math.ceil(segLen/HEDGE_CHUNK));
          for(var h=0;h<pieces;h++){
            var u0=h/pieces,u1=(h+1)/pieces,pax=ax+(bx-ax)*u0,paz=az+(bz-az)*u0,pbx=ax+(bx-ax)*u1,pbz=az+(bz-az)*u1;
            var fp=addHedgeVolume(pax,paz,pbx,pbz);place(buildHedgePrism(scene,fp),fp.x,fp.z);
          }
        }
        cursor+=segLen+gap;
      }
    }
    for(var rz=-keepoutZ+rowGap*.5;rz<keepoutZ;rz+=rowGap)hedgeLine(0,rz+(rng()-.5)*22,true);
    for(var cx=-halfW+colGap*.5;cx<halfW;cx+=colGap)hedgeLine(0,cx+(rng()-.5)*30,false);

    var copses=opts.clumpCount||Math.max(8,Math.round(area/16000));
    for(var i=0;i<copses;i++){
      var ccx=(rng()-.5)*halfW*2,ccz=(rng()-.5)*keepoutZ*2,n=2+Math.floor(rng()*3);
      for(var t=0;t<n;t++){
        var tx=ccx+(rng()-.5)*11,tz=ccz+(rng()-.5)*11,scale=.85+rng()*.7,ty=heightAt(tx,tz);
        if(pointBlockedByBuilding(tx,tz,1.25*scale))continue;
        var treeFp=addCircle(tx,tz,.11*scale,'tree','tree-'+physicalSeq++);
        place(buildTree(scene,tx,ty,tz,scale,LEAF[Math.floor(rng()*LEAF.length)]),tx,tz);addObstacle(tx,tz,1.15*scale,.72,2.2*scale,'tree',treeFp.id);
      }
    }

    var lowCover=opts.lowCoverCount||Math.max(12,Math.round(area/3000));
    for(i=0;i<lowCover;i++){
      var lx=(rng()-.5)*halfW*2,lz=(rng()-.5)*keepoutZ*2,ly=heightAt(lx,lz),roll=rng();
      if(roll<.45){
        var size=.7+rng()*.5,rockRot=rng()*Math.PI,rockBound=Math.hypot(size*.9,size*.75);
        if(pointBlockedByBuilding(lx,lz,rockBound))continue;
        var rockFp=addObb(lx,lz,size*.9,size*.75,rockRot,'rock','rock-'+physicalSeq++);
        place(buildRock(scene,lx,ly,lz,size,rockRot),lx,lz);addObstacle(lx,lz,size*1.1,.55,size,'rock',rockFp.id);
      }else if(roll<.75){
        var len=2.6+rng()*2.4,logRot=rng()*Math.PI,logBound=Math.hypot(len/2,.275);
        if(pointBlockedByBuilding(lx,lz,logBound))continue;
        var logFp=addObb(lx,lz,len/2,.275,logRot,'log','log-'+physicalSeq++);
        place(buildLog(scene,lx,ly,lz,len,logRot),lx,lz);addObstacle(lx,lz,len*.42,.60,.62,'log',logFp.id);
      }else{
        var wl=4+rng()*7,rot=rng()*Math.PI,wallBound=Math.hypot(wl/2,.25);
        if(pointBlockedByBuilding(lx,lz,wallBound))continue;
        var wallFp=addObb(lx,lz,wl/2,.25,rot,'wall','wall-'+physicalSeq++);
        place(buildWallStub(scene,lx,ly,lz,wl,rot),lx,lz);
        var steps2=Math.max(1,Math.round(wl/3));
        for(var q=0;q<=steps2;q++){var v=(q/steps2-.5)*wl;addObstacle(lx+Math.cos(rot)*v,lz-Math.sin(rot)*v,1.6,.50,1.05,'wall',wallFp.id);}
      }
    }

    obstacles.__physicalFootprints=physical;
    obstacles.__physicalVersion=4;

    var meshes=mergeBuckets(scene,entries);
    console.log('[TERRAIN] cover field: '+obstacles.length+' tactical volumes · '+physical.length+' physical volumes · building keepouts='+buildings.length+' in '+meshes.length+' merged meshes over '+Math.round(halfW*2)+'x'+Math.round(keepoutZ*2)+'m');
    return{obstacles:obstacles,physicalFootprints:physical,dispose:function(){for(var i=0;i<meshes.length;i++){try{meshes[i].dispose();}catch(_){}}meshes.length=0;}};
  }

  root.BattleTerrainFeatures={scatter:scatter,hedgeWidth:HEDGE_WIDTH,hedgeHeight:HEDGE_HEIGHT,hedgeChunk:HEDGE_CHUNK};
})(typeof window!=='undefined'?window:globalThis);
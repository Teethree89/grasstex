/* Battlefield clutter: the cover field. Hedgerow network, tree copses and low cover (rocks,
   fallen logs, field-wall stubs), built the same way as soldier.js/weapons.js (merged primitives,
   vertex colors, one shared material) and then merged again per grid cell so a dense field still
   costs only a handful of draw calls.

   These are more than scenery. Each one registers a plain-data circular obstacle carrying its
   ground height and its physical height, which obstacle-field.js uses to answer sight and cover
   questions per stance: a knee-high rock hides a prone man and not a standing one. That is what
   gives the engagement pipeline a reason to put soldiers on the ground. Nothing here blocks
   MOVEMENT - soldiers steer around obstacles but can walk through the space a tree occupies;
   only building walls are hard barriers (see battle-navigation.js).

   Deterministic (seeded RNG) so the same seed always produces the same field - useful for
   comparing two AI changes on identical terrain rather than a different battlefield each time. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var LEAF=[c3('3d5a2c'),c3('466233'),c3('35502a')],TRUNK=c3('4a3624'),HEDGE=c3('3f5a2e'),ROCK=c3('6d6a61'),STONE=c3('7a7568');

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

  // A cheap deterministic PRNG (mulberry32) so a given seed always lays out the same field.
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
    mesh.material=featureMaterial(scene);mesh.isPickable=false;
    mesh.position.set(x,y,z);
    return mesh;
  }

  function buildHedgeSegment(scene,ax,az,bx,bz,y){
    var dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
    var mesh=box(scene,[len,1.5,1.1],HEDGE,[0,.75,0]);
    mesh.material=featureMaterial(scene);mesh.isPickable=false;
    mesh.position.set((ax+bx)/2,y,(az+bz)/2);
    mesh.rotation.y=-Math.atan2(dz,dx);
    return mesh;
  }

  /* Merged buckets: the field is scattered densely enough for infantry to always have something
     to get behind, so the meshes are combined per grid cell. One draw call per cell keeps the
     clutter cheap while frustum culling still works. */
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
      if(merged){merged.material=featureMaterial(scene);merged.isPickable=false;merged.freezeWorldMatrix&&merged.freezeWorldMatrix();out.push(merged);}
      else out.push.apply(out,list);
    });
    return out;
  }

  function buildRock(scene,x,y,z,size,rng){
    var m=box(scene,[size*1.8,size,size*1.5],ROCK,[0,size/2,0],[0,rng()*Math.PI,0]);
    m.position.set(x,y,z);
    return m;
  }
  function buildLog(scene,x,y,z,len,rng){
    var m=cylinder(scene,.55,len,TRUNK,null);
    m.rotation.z=Math.PI/2;m.rotation.y=rng()*Math.PI;m.bakeCurrentTransformIntoVertices();
    m.position.set(x,y+.28,z);
    return m;
  }
  function buildWallStub(scene,x,y,z,len,rot){
    var m=box(scene,[len,1.05,.5],STONE,[0,.52,0],[0,rot,0]);
    m.position.set(x,y,z);
    return m;
  }

  /* Scatters a whole battlefield's worth of cover: a gapped hedgerow network across both axes,
     tree copses, and low cover (rocks, fallen logs, field-wall stubs) in between.

     The old version only ever filled a ~190 m band of z and laid its hedgerow segments from one
     edge with no wrap, so a 2000 x 1200 m field ended up with about a hundred trees and a few
     hedge stubs in one corner. With nothing to get behind, the AI's cover drills could never fire
     and every soldier fought standing in the open - which is what made the battle look like a
     walking-and-aiming loop rather than a firefight. Density here is derived from the actual field
     area so any map size gets usable cover.

     Every obstacle carries its ground height y and its physical height, so obstacle-field.js can
     answer "does this hide a standing man / a crouching man / a prone man" rather than treating a
     knee-high rock as a wall. */
  function scatter(scene,heightAt,opts){
    opts=opts||{};
    var fieldW=opts.fieldW||360,fieldD=opts.fieldD||(opts.keepoutZ?opts.keepoutZ*2.2:190);
    var keepoutZ=opts.keepoutZ||fieldD*.46;
    var rng=mulberry32(opts.seed||1337);
    var halfW=fieldW*.46,entries=[],obstacles=[];
    var area=(halfW*2)*(keepoutZ*2);

    function place(mesh,x,z){entries.push({mesh:mesh,x:x,z:z});}
    function addObstacle(x,z,radius,cover,height,type){obstacles.push({x:x,z:z,y:heightAt(x,z),radius:radius,cover:cover,height:height,type:type});}

    /* --- hedgerow network: the spine of the field's cover and of its sight lines --------------- */
    var rowGap=opts.hedgeRowGap||140,colGap=opts.hedgeColGap||260;
    function hedgeLine(along,fixed,horizontal){
      var span=horizontal?halfW*2:keepoutZ*2,cursor=-span/2+rng()*40;
      while(cursor<span/2-14){
        var segLen=26+rng()*34,gap=14+rng()*26;
        if(cursor+segLen>span/2)segLen=span/2-cursor;
        if(segLen<10)break;
        var jag=(rng()-.5)*7;
        var ax=horizontal?cursor:fixed,az=horizontal?fixed+jag:cursor;
        var bx=horizontal?cursor+segLen:fixed-jag,bz=horizontal?fixed-jag:cursor+segLen;
        var y=heightAt((ax+bx)/2,(az+bz)/2);
        place(buildHedgeSegment(scene,ax,az,bx,bz,y),(ax+bx)/2,(az+bz)/2);
        /* A handful of point obstacles along the segment stand in for its whole length, rather
           than one long thin one, so every blocking test only reasons about circles. */
        var steps=Math.max(1,Math.round(segLen/7));
        for(var p=0;p<=steps;p++){
          var u=p/steps;
          addObstacle(ax+(bx-ax)*u,az+(bz-az)*u,3.4,.62,1.5,'hedge');
        }
        cursor+=segLen+gap;
      }
    }
    for(var rz=-keepoutZ+rowGap*.5;rz<keepoutZ;rz+=rowGap)hedgeLine(0,rz+(rng()-.5)*22,true);
    for(var cx=-halfW+colGap*.5;cx<halfW;cx+=colGap)hedgeLine(0,cx+(rng()-.5)*30,false);

    /* --- tree copses -------------------------------------------------------------------------- */
    var copses=opts.clumpCount||Math.max(8,Math.round(area/16000));
    for(var i=0;i<copses;i++){
      var ccx=(rng()-.5)*halfW*2,ccz=(rng()-.5)*keepoutZ*2,n=2+Math.floor(rng()*3);
      for(var t=0;t<n;t++){
        var tx=ccx+(rng()-.5)*11,tz=ccz+(rng()-.5)*11,scale=.85+rng()*.7,ty=heightAt(tx,tz);
        place(buildTree(scene,tx,ty,tz,scale,LEAF[Math.floor(rng()*LEAF.length)]),tx,tz);
        addObstacle(tx,tz,1.15*scale,.72,2.2*scale,'tree');
      }
    }

    /* --- low cover: the stuff a man actually drops behind -------------------------------------- */
    var lowCover=opts.lowCoverCount||Math.max(12,Math.round(area/3000));
    for(i=0;i<lowCover;i++){
      var lx=(rng()-.5)*halfW*2,lz=(rng()-.5)*keepoutZ*2,ly=heightAt(lx,lz),roll=rng();
      if(roll<.45){
        var size=.7+rng()*.5;
        place(buildRock(scene,lx,ly,lz,size,rng),lx,lz);
        addObstacle(lx,lz,size*1.1,.55,size,'rock');
      }else if(roll<.75){
        var len=2.6+rng()*2.4;
        place(buildLog(scene,lx,ly,lz,len,rng),lx,lz);
        addObstacle(lx,lz,len*.42,.60,.62,'log');
      }else{
        var wl=4+rng()*7,rot=rng()*Math.PI;
        place(buildWallStub(scene,lx,ly,lz,wl,rot),lx,lz);
        var steps2=Math.max(1,Math.round(wl/3));
        for(var q=0;q<=steps2;q++){
          var v=(q/steps2-.5)*wl;
          addObstacle(lx+Math.cos(rot)*v,lz-Math.sin(rot)*v,1.6,.50,1.05,'wall');
        }
      }
    }

    var meshes=mergeBuckets(scene,entries);
    console.log('[TERRAIN] cover field: '+obstacles.length+' obstacles in '+meshes.length+' merged meshes over '+Math.round(halfW*2)+'x'+Math.round(keepoutZ*2)+'m');
    return {
      obstacles:obstacles,
      dispose:function(){for(var i=0;i<meshes.length;i++){try{meshes[i].dispose();}catch(_){}}meshes.length=0;}
    };
  }

  root.BattleTerrainFeatures={scatter:scatter};
})(typeof window!=='undefined'?window:globalThis);

/* Battlefield clutter: tree clumps and hedgerows scattered across the field, built the same
   way as soldier.js/weapons.js (merged primitives, vertex colors, one shared material). They
   are more than scenery - each one registers a plain-data circular obstacle that squad-ai.js
   uses to block line-of-sight and to knock down a target's hit chance when it's fighting from
   near one. Nothing here blocks MOVEMENT yet (see battle-sim.js's known-limitations note):
   soldiers path straight through a tree trunk exactly as they path through open ground, they
   just can't always see or be seen through one.

   Deterministic (seeded RNG) so the same seed always produces the same field - useful for
   comparing two AI changes on identical terrain rather than a different battlefield each time. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var LEAF=[c3('3d5a2c'),c3('466233'),c3('35502a')],TRUNK=c3('4a3624'),HEDGE=c3('3f5a2e');

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

  /* Scatters tree clumps and gapped hedgerows across [-fieldW/2,fieldW/2] x
     [-keepoutZ,keepoutZ] (kept clear of the spawn lines themselves, which live further out
     at +/-fieldD/2-ish - see battle-sim.js's SPAWN_Z), and returns the plain-data obstacle
     list squad-ai.js reads, plus a dispose() to tear the meshes down again. */
  function scatter(scene,heightAt,opts){
    opts=opts||{};
    var fieldW=opts.fieldW||360,keepoutZ=opts.keepoutZ||95;
    var rng=mulberry32(opts.seed||1337);
    var meshes=[],obstacles=[];

    var clumpCount=opts.clumpCount||24;
    for(var i=0;i<clumpCount;i++){
      var cx=(rng()-.5)*fieldW*.92,cz=(rng()-.5)*keepoutZ*2;
      var n=1+Math.floor(rng()*3);
      for(var t=0;t<n;t++){
        var tx=cx+(rng()-.5)*9,tz=cz+(rng()-.5)*9;
        var scale=.85+rng()*.7,y=heightAt(tx,tz);
        meshes.push(buildTree(scene,tx,y,tz,scale,LEAF[Math.floor(rng()*LEAF.length)]));
        obstacles.push({x:tx,z:tz,radius:1.15*scale,cover:.75,type:'tree'});
      }
    }

    // Hedgerows run across X (perpendicular to the north/south advance) in a few gapped
    // segments each, so they read as bocage lines with crossing points rather than a wall.
    var rows=opts.hedgeRows||4,rowSpan=keepoutZ*1.7;
    for(var r=0;r<rows;r++){
      var rz=-rowSpan/2+ (r+.5)*(rowSpan/rows) + (rng()-.5)*8;
      var segCount=2+Math.floor(rng()*2),cursor=-fieldW*.42;
      for(var s=0;s<segCount;s++){
        var segLen=18+rng()*22,gap=10+rng()*14;
        var ax=cursor,bx=cursor+segLen;
        if(bx>fieldW*.42)break;
        var jag=(rng()-.5)*6,az=rz+jag,bz=rz-jag;
        var y=heightAt((ax+bx)/2,(az+bz)/2);
        meshes.push(buildHedgeSegment(scene,ax,az,bx,bz,y));
        // A handful of point obstacles along the segment stand in for its whole length,
        // rather than one long thin one, so the segment-vs-circle blocking test in
        // squad-ai.js only ever needs to reason about circles.
        var steps=Math.max(1,Math.round(segLen/4));
        for(var p=0;p<=steps;p++){
          var u=p/steps;
          obstacles.push({x:ax+(bx-ax)*u,z:az+(bz-az)*u,radius:2.4,cover:.65,type:'hedge'});
        }
        cursor=bx+gap;
      }
    }

    return {
      obstacles:obstacles,
      dispose:function(){for(var i=0;i<meshes.length;i++)meshes[i].dispose();}
    };
  }

  root.BattleTerrainFeatures={scatter:scatter};
})(typeof window!=='undefined'?window:globalThis);

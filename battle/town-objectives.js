/* Central village/objective layer for Battle Sim v18.
   Wraps BattleTerrainFeatures.scatter so existing callers automatically receive a small
   village, its collision/cover obstacles, urban corner nodes and capture sectors. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||!root.BattleTerrainFeatures)return;
  root.BATTLE_BUILD='v18';
  console.log('[TOWN] runtime v18 loaded');

  var oldScatter=root.BattleTerrainFeatures.scatter;
  var WALL=new BABYLON.Color3(.52,.48,.39),ROOF=new BABYLON.Color3(.28,.19,.14),ROAD=new BABYLON.Color3(.24,.23,.21),SQUARE=new BABYLON.Color3(.36,.34,.29);

  function mat(scene,name,color){var m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=BABYLON.Color3.Black();return m;}
  function addBuilding(scene,heightAt,meshes,obstacles,corners,id,x,z,w,d,h){
    var y=heightAt(x,z),body=BABYLON.MeshBuilder.CreateBox('town-'+id,{width:w,height:h,depth:d},scene);
    body.position.set(x,y+h/2,z);body.material=mat(scene,'townWall-'+id,WALL);body.isPickable=false;meshes.push(body);
    var roof=BABYLON.MeshBuilder.CreateCylinder('townRoof-'+id,{diameter:1,height:w*.72,tessellation:3},scene);
    roof.scaling.z=d/w;roof.rotation.z=Math.PI/2;roof.position.set(x,y+h+.85,z);roof.material=mat(scene,'townRoofMat-'+id,ROOF);roof.isPickable=false;meshes.push(roof);
    var nx=Math.max(2,Math.ceil(w/4)),nz=Math.max(2,Math.ceil(d/4));
    for(var ix=0;ix<nx;ix++)for(var iz=0;iz<nz;iz++)obstacles.push({x:x-w/2+(ix+.5)*w/nx,z:z-d/2+(iz+.5)*d/nz,radius:Math.max(w/nx,d/nz)*.62,cover:.28,type:'building',building:id});
    var pad=3.2;
    corners.push({x:x-w/2-pad,z:z-d/2-pad,building:id,kind:'corner'});corners.push({x:x+w/2+pad,z:z-d/2-pad,building:id,kind:'corner'});corners.push({x:x-w/2-pad,z:z+d/2+pad,building:id,kind:'corner'});corners.push({x:x+w/2+pad,z:z+d/2+pad,building:id,kind:'corner'});
  }

  function buildTown(scene,heightAt){
    var meshes=[],obstacles=[],corners=[];
    var roadMat=mat(scene,'townRoadMat',ROAD),squareMat=mat(scene,'townSquareMat',SQUARE);
    function slab(name,x,z,w,d,m){var y=heightAt(x,z)+.035,s=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:.07,depth:d},scene);s.position.set(x,y,z);s.material=m;s.isPickable=false;meshes.push(s);}
    slab('townRoadNS',0,0,9,92,roadMat);slab('townRoadEW',0,0,118,9,roadMat);slab('townSquare',0,0,24,24,squareMat);

    addBuilding(scene,heightAt,meshes,obstacles,corners,'NW1',-28,-26,18,14,7.2);addBuilding(scene,heightAt,meshes,obstacles,corners,'NE1',29,-27,16,15,6.8);addBuilding(scene,heightAt,meshes,obstacles,corners,'NW2',-31,20,15,18,7.5);addBuilding(scene,heightAt,meshes,obstacles,corners,'NE2',31,22,18,15,7.0);addBuilding(scene,heightAt,meshes,obstacles,corners,'W',-53,2,15,20,6.5);addBuilding(scene,heightAt,meshes,obstacles,corners,'E',53,-2,15,20,6.5);

    var sectors=[{id:'south-edge',x:0,z:-34,radius:23,label:'South edge'},{id:'square',x:0,z:0,radius:20,label:'Village square'},{id:'north-edge',x:0,z:34,radius:23,label:'North edge'}];
    var routes={
      us:{left:[{x:-58,z:-58},{x:-58,z:-22},{x:-43,z:-10},{x:-18,z:0},{x:0,z:0},{x:0,z:34}],center:[{x:0,z:-58},{x:0,z:-34},{x:-8,z:-15},{x:0,z:0},{x:0,z:34}],right:[{x:58,z:-58},{x:58,z:-22},{x:43,z:-10},{x:18,z:0},{x:0,z:0},{x:0,z:34}],support:[{x:0,z:-62},{x:0,z:-46},{x:0,z:-38}]},
      ge:{left:[{x:58,z:58},{x:58,z:22},{x:43,z:10},{x:18,z:0},{x:0,z:0},{x:0,z:-34}],center:[{x:0,z:58},{x:0,z:34},{x:8,z:15},{x:0,z:0},{x:0,z:-34}],right:[{x:-58,z:58},{x:-58,z:22},{x:-43,z:10},{x:-18,z:0},{x:0,z:0},{x:0,z:-34}],support:[{x:0,z:62},{x:0,z:46},{x:0,z:38}]}
    };
    var town={meshes:meshes,obstacles:obstacles,corners:corners,sectors:sectors,routes:routes,center:{x:0,z:0},radius:70,dispose:function(){for(var i=0;i<meshes.length;i++)meshes[i].dispose();}};
    scene.metadata=scene.metadata||{};scene.metadata.battleTown=town;return town;
  }

  root.BattleTerrainFeatures.scatter=function(scene,heightAt,opts){
    opts=opts||{};var base=oldScatter(scene,heightAt,Object.assign({},opts,{clumpCount:opts.clumpCount||17,hedgeRows:opts.hedgeRows||3}));
    var town=buildTown(scene,heightAt),oldDispose=base.dispose;base.obstacles=base.obstacles.concat(town.obstacles);base.town=town;base.dispose=function(){oldDispose&&oldDispose();town.dispose();};
    console.log('[TOWN] v18 village built; buildings=6 sectors=3 obstacles='+town.obstacles.length);return base;
  };

  root.BattleTownObjectives={build:buildTown};
})(typeof window!=='undefined'?window:globalThis);

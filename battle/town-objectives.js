/* Battle Sim / ww2fps AI lab v20 procedural settlement renderer.
   Scenario data comes from scenario-generator.js. Buildings are one-storey, roofless and truly
   enterable: walls are constructed around door/window holes instead of using a solid footprint. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||!root.BattleTerrainFeatures||!root.BattleScenarioGenerator)return;
  root.BATTLE_BUILD='v20';
  console.log('[TOWN] procedural settlement runtime v20 loaded');

  var oldScatter=root.BattleTerrainFeatures.scatter,currentRender=null;
  var WALL=new BABYLON.Color3(.52,.48,.39),WALL2=new BABYLON.Color3(.43,.40,.34),FLOOR=new BABYLON.Color3(.31,.29,.25),ROAD=new BABYLON.Color3(.24,.23,.21);
  function mat(scene,name,color){var m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=BABYLON.Color3.Black();return m;}
  function addBox(scene,parent,name,w,h,d,x,y,z,material){var m=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.parent=parent;m.position.set(x,y,z);m.material=material;m.isPickable=false;return m;}
  function sideOpenings(b,side){return(b.openings||[]).filter(function(o){return o.side===side;}).sort(function(a,c){return a.offset-c.offset;});}

  function buildWall(scene,rootNode,b,side,wallMat,meshes){
    var northSouth=side==='north'||side==='south',len=northSouth?b.w:b.d,thick=.32,h=b.h,constant=northSouth?(side==='north'?b.d/2:-b.d/2):(side==='east'?b.w/2:-b.w/2),opens=sideOpenings(b,side),cursor=-len/2;
    function piece(range,y0,y1){
      var width=range[1]-range[0];if(width<=.03||y1-y0<=.03)return;var along=(range[0]+range[1])/2,cy=(y0+y1)/2,m;
      if(northSouth)m=addBox(scene,rootNode,'wall-'+b.id+'-'+side,width,y1-y0,thick,along,cy,constant,wallMat);
      else m=addBox(scene,rootNode,'wall-'+b.id+'-'+side,thick,y1-y0,width,constant,cy,along,wallMat);
      meshes.push(m);
    }
    for(var i=0;i<opens.length;i++){
      var o=opens[i],a=Math.max(-len/2,o.offset-o.width/2),c=Math.min(len/2,o.offset+o.width/2);
      if(a>cursor)piece([cursor,a],0,h);
      if(o.bottom>0)piece([a,c],0,Math.min(h,o.bottom));
      if(o.top<h)piece([a,c],Math.max(0,o.top),h);
      cursor=Math.max(cursor,c);
    }
    if(cursor<len/2)piece([cursor,len/2],0,h);
  }

  function buildBuilding(scene,heightAt,b,index,meshes){
    var y=heightAt(b.x,b.z),node=new BABYLON.TransformNode('building-'+b.id,scene);node.position.set(b.x,y,b.z);node.rotation.y=b.rot||0;meshes.push(node);
    var wallMat=mat(scene,'wallmat-'+b.id,index%3===0?WALL2:WALL),floorMat=mat(scene,'floormat-'+b.id,FLOOR);
    var slab=addBox(scene,node,'floor-'+b.id,b.w,.08,b.d,0,.04,0,floorMat);meshes.push(slab);
    buildWall(scene,node,b,'north',wallMat,meshes);buildWall(scene,node,b,'south',wallMat,meshes);buildWall(scene,node,b,'east',wallMat,meshes);buildWall(scene,node,b,'west',wallMat,meshes);
    return node;
  }
  function buildRoad(scene,heightAt,r,index,meshes){
    var dx=r.bx-r.ax,dz=r.bz-r.az,len=Math.hypot(dx,dz),cx=(r.ax+r.bx)/2,cz=(r.az+r.bz)/2,y=heightAt(cx,cz)+.025;
    var mesh=BABYLON.MeshBuilder.CreateBox('scenario-road-'+index,{width:r.width||8,height:.05,depth:len},scene);mesh.position.set(cx,y,cz);mesh.rotation.y=Math.atan2(dx,dz);mesh.material=mat(scene,'scenario-road-mat-'+index,ROAD);mesh.isPickable=false;meshes.push(mesh);
  }

  function renderScenario(scene,heightAt,scenario){
    var meshes=[];if(currentRender&&currentRender.dispose)currentRender.dispose();
    for(var r=0;r<(scenario.roads||[]).length;r++)buildRoad(scene,heightAt,scenario.roads[r],r,meshes);
    for(var i=0;i<(scenario.buildings||[]).length;i++)buildBuilding(scene,heightAt,scenario.buildings[i],i,meshes);
    scenario.meshes=meshes;scenario.sectors=scenario.objectives;scenario.center=scenario.center||{x:scenario.settlement.cx,z:scenario.settlement.cz};scenario.radius=scenario.radius||Math.max(scenario.settlement.spanX,scenario.settlement.spanZ)*.62;
    scenario.dispose=function(){for(var j=0;j<meshes.length;j++)try{meshes[j].dispose();}catch(_){}};
    scene.metadata=scene.metadata||{};scene.metadata.battleScenario=scenario;scene.metadata.battleTown=scenario;
    root.BattleScenarioGenerator.setActive(scenario);if(root.BattleNavigation)root.BattleNavigation.installScenario(scenario);
    currentRender=scenario;
    console.log('[TOWN] v20 scenario '+scenario.id+' seed='+scenario.seed+' buildings='+scenario.buildings.length+' objectives='+scenario.objectives.length);
    return scenario;
  }

  function regenerate(scene,heightAt,seed,meta){var scenario=root.BattleScenarioGenerator.create(seed,meta||{});return renderScenario(scene,heightAt,scenario);}

  root.BattleTerrainFeatures.scatter=function(scene,heightAt,opts){
    opts=opts||{};var scenario=root.BattleScenarioGenerator.current();
    if(!scenario)scenario=root.BattleScenarioGenerator.activate(opts.scenarioSeed||root.BATTLE_SCENARIO_SEED||root.BattleScenarioGenerator.newSeed('live'));
    var seedInt=root.BattleScenarioGenerator.hashSeed(scenario.seed+'|terrain');
    var base=oldScatter(scene,heightAt,Object.assign({},opts,{seed:seedInt,fieldW:scenario.map.width,fieldD:scenario.map.depth,keepoutZ:scenario.map.depth*.40,clumpCount:opts.clumpCount||52,hedgeRows:opts.hedgeRows||7}));
    var rendered=renderScenario(scene,heightAt,scenario),oldDispose=base.dispose;base.town=rendered;base.scenario=rendered;base.dispose=function(){oldDispose&&oldDispose();rendered.dispose();};
    return base;
  };

  root.BattleTownObjectives={render:renderScenario,regenerate:regenerate,current:function(){return currentRender;},build:function(scene,heightAt){var s=root.BattleScenarioGenerator.current()||root.BattleScenarioGenerator.activate(root.BattleScenarioGenerator.newSeed('live'));return renderScenario(scene,heightAt,s);}};
})(typeof window!=='undefined'?window:globalThis);

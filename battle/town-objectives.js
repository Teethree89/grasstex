/* Battle Sim / ww2fps AI lab v20 procedural settlement/scenario renderer.
   Buildings are one-storey, roofless and truly enterable. Training regeneration changes seeded
   terrain, natural clutter, roads, buildings, objectives and navigation as one scenario. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||!root.BattleTerrainFeatures||!root.BattleScenarioGenerator)return;
  root.BATTLE_BUILD='v20';console.log('[TOWN] procedural scenario runtime v20 loaded');

  var oldScatter=root.BattleTerrainFeatures.scatter,currentRender=null,currentBase=null;
  var WALL=new BABYLON.Color3(.52,.48,.39),WALL2=new BABYLON.Color3(.43,.40,.34),FLOOR=new BABYLON.Color3(.31,.29,.25),ROAD=new BABYLON.Color3(.24,.23,.21);
  function mat(scene,name,color){var m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=BABYLON.Color3.Black();return m;}
  function renderMaterials(scene,tag){return{wall:mat(scene,'scenario-wall-'+tag,WALL),wall2:mat(scene,'scenario-wall2-'+tag,WALL2),floor:mat(scene,'scenario-floor-'+tag,FLOOR),road:mat(scene,'scenario-road-'+tag,ROAD)};}
  function disposeMaterials(mats){if(!mats)return;Object.keys(mats).forEach(function(k){try{mats[k].dispose();}catch(_){}});}
  function addBox(scene,parent,name,w,h,d,x,y,z,material){var m=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.parent=parent;m.position.set(x,y,z);m.material=material;m.isPickable=false;return m;}
  function sideOpenings(b,side){return(b.openings||[]).filter(function(o){return o.side===side;}).sort(function(a,c){return a.offset-c.offset;});}

  function buildWall(scene,rootNode,b,side,wallMat,meshes){
    var northSouth=side==='north'||side==='south',len=northSouth?b.w:b.d,thick=.32,h=b.h,constant=northSouth?(side==='north'?b.d/2:-b.d/2):(side==='east'?b.w/2:-b.w/2),opens=sideOpenings(b,side),cursor=-len/2;
    function piece(range,y0,y1){var width=range[1]-range[0];if(width<=.03||y1-y0<=.03)return;var along=(range[0]+range[1])/2,cy=(y0+y1)/2,m;if(northSouth)m=addBox(scene,rootNode,'wall-'+b.id+'-'+side,width,y1-y0,thick,along,cy,constant,wallMat);else m=addBox(scene,rootNode,'wall-'+b.id+'-'+side,thick,y1-y0,width,constant,cy,along,wallMat);meshes.push(m);}
    for(var i=0;i<opens.length;i++){var o=opens[i],a=Math.max(-len/2,o.offset-o.width/2),c=Math.min(len/2,o.offset+o.width/2);if(a>cursor)piece([cursor,a],0,h);if(o.bottom>0)piece([a,c],0,Math.min(h,o.bottom));if(o.top<h)piece([a,c],Math.max(0,o.top),h);cursor=Math.max(cursor,c);}if(cursor<len/2)piece([cursor,len/2],0,h);
  }
  function buildBuilding(scene,heightAt,b,index,meshes,mats){var y=heightAt(b.x,b.z),node=new BABYLON.TransformNode('building-'+b.id,scene);node.position.set(b.x,y,b.z);node.rotation.y=b.rot||0;meshes.push(node);var wallMat=index%3===0?mats.wall2:mats.wall;var slab=addBox(scene,node,'floor-'+b.id,b.w,.08,b.d,0,.04,0,mats.floor);meshes.push(slab);buildWall(scene,node,b,'north',wallMat,meshes);buildWall(scene,node,b,'south',wallMat,meshes);buildWall(scene,node,b,'east',wallMat,meshes);buildWall(scene,node,b,'west',wallMat,meshes);return node;}
  function buildRoad(scene,heightAt,r,index,meshes,mats){var dx=r.bx-r.ax,dz=r.bz-r.az,len=Math.hypot(dx,dz),cx=(r.ax+r.bx)/2,cz=(r.az+r.bz)/2,y=heightAt(cx,cz)+.025;var mesh=BABYLON.MeshBuilder.CreateBox('scenario-road-'+index,{width:r.width||8,height:.05,depth:len},scene);mesh.position.set(cx,y,cz);mesh.rotation.y=Math.atan2(dx,dz);mesh.material=mats.road;mesh.isPickable=false;meshes.push(mesh);}
  function disposeRender(){if(currentRender&&currentRender.dispose)currentRender.dispose();currentRender=null;}
  function activateTerrain(scenario){root.BattleScenarioGenerator.setActive(scenario);if(root.BattleSim&&root.BattleSim.applyScenarioTerrain)root.BattleSim.applyScenarioTerrain(scenario);}

  function renderScenario(scene,heightAt,scenario){
    disposeRender();activateTerrain(scenario);var meshes=[],mats=renderMaterials(scene,scenario.id||Date.now());
    for(var r=0;r<(scenario.roads||[]).length;r++)buildRoad(scene,heightAt,scenario.roads[r],r,meshes,mats);for(var i=0;i<(scenario.buildings||[]).length;i++)buildBuilding(scene,heightAt,scenario.buildings[i],i,meshes,mats);
    scenario.meshes=meshes;scenario.sectors=scenario.objectives;scenario.center=scenario.center||{x:scenario.settlement.cx,z:scenario.settlement.cz};scenario.radius=scenario.radius||Math.max(scenario.settlement.spanX,scenario.settlement.spanZ)*.62;
    scenario.dispose=function(){for(var j=meshes.length-1;j>=0;j--)try{meshes[j].dispose();}catch(_){}meshes.length=0;disposeMaterials(mats);};scene.metadata=scene.metadata||{};scene.metadata.battleScenario=scenario;scene.metadata.battleTown=scenario;if(root.BattleNavigation)root.BattleNavigation.installScenario(scenario);currentRender=scenario;
    console.log('[TOWN] v20 scenario '+scenario.id+' seed='+scenario.seed+' buildings='+scenario.buildings.length+' objectives='+scenario.objectives.length);return scenario;
  }
  function scatterNatural(scene,heightAt,scenario,opts){opts=opts||{};var seedInt=root.BattleScenarioGenerator.hashSeed(scenario.seed+'|terrain-clutter');return oldScatter(scene,heightAt,Object.assign({},opts,{seed:seedInt,fieldW:scenario.map.width,fieldD:scenario.map.depth,keepoutZ:scenario.map.depth*.40,clumpCount:opts.clumpCount||52,hedgeRows:opts.hedgeRows||7}));}
  function wireBase(base,rendered){var naturalDispose=base.dispose;base._naturalDispose=naturalDispose;base.town=rendered;base.scenario=rendered;base.dispose=function(){try{naturalDispose&&naturalDispose();}catch(_){}if(currentRender===rendered)disposeRender();if(currentBase===base)currentBase=null;};currentBase=base;return base;}
  function releaseCurrent(scene){
    if(currentBase&&currentBase._naturalDispose){try{currentBase._naturalDispose();}catch(_){}currentBase=null;}disposeRender();
    if(root.BattleNavigation)root.BattleNavigation.installScenario(null);
    if(scene&&scene.metadata){scene.metadata.battleScenario=null;scene.metadata.battleTown=null;}
  }
  function regenerate(scene,heightAt,seed,meta,sim){releaseCurrent(scene);var scenario=root.BattleScenarioGenerator.create(seed,meta||{});activateTerrain(scenario);var base=scatterNatural(scene,heightAt,scenario,{}),rendered=renderScenario(scene,heightAt,scenario);wireBase(base,rendered);if(sim)sim.obstacles=base.obstacles||[];return rendered;}

  root.BattleTerrainFeatures.scatter=function(scene,heightAt,opts){opts=opts||{};var scenario=root.BattleScenarioGenerator.current();if(!scenario)scenario=root.BattleScenarioGenerator.activate(opts.scenarioSeed||root.BATTLE_SCENARIO_SEED||root.BattleScenarioGenerator.newSeed('live'));activateTerrain(scenario);var base=scatterNatural(scene,heightAt,scenario,opts),rendered=renderScenario(scene,heightAt,scenario);return wireBase(base,rendered);};
  root.BattleTownObjectives={render:renderScenario,regenerate:regenerate,releaseCurrent:releaseCurrent,current:function(){return currentRender;},build:function(scene,heightAt){var s=root.BattleScenarioGenerator.current()||root.BattleScenarioGenerator.activate(root.BattleScenarioGenerator.newSeed('live'));return renderScenario(scene,heightAt,s);}};
})(typeof window!=='undefined'?window:globalThis);

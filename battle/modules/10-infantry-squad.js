/* Default infantry reinforcement module. Future tanks/engineers use the same scenario-aware spawn contract. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI||!root.BattleSoldierModel||!root.BattleWeapons||!root.BattleSim)return;
  function rand(sim){return sim&&sim.random?sim.random():Math.random();}
  function spawn(sim,faction,opts){
    opts=opts||{};var index=opts.squadIndex==null?sim.factions[faction].squads.length:+opts.squadIndex,scenario=sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown),zone=scenario&&scenario.spawnZones&&scenario.spawnZones[faction]||null;
    var lanes=opts.lanes||(zone&&zone.lanes)||[-700,-350,0,350,700],laneX=opts.x==null?(lanes[index%lanes.length]+(Math.floor(index/lanes.length)%3-1)*10):+opts.x;
    var z=opts.z==null?(zone?zone.z:(faction==='us'?-510:510)):+opts.z,center=scenario&&scenario.center||{x:0,z:0},objectiveX=opts.objectiveX==null?center.x:+opts.objectiveX,objectiveZ=opts.objectiveZ==null?center.z:+opts.objectiveZ;
    var home={x:laneX,z:z},objective={x:objectiveX,z:objectiveZ},sq=root.SquadAI.createSquad(faction+'-inf-'+index+'-'+Math.floor(sim.time||0),faction,home,objective),nextId=root.BattleModules.nextEntityId(sim),units=[];
    for(var si=0;si<root.SquadAI.COMPOSITION.length;si++){
      var role=root.SquadAI.COMPOSITION[si],jx=laneX+(rand(sim)-.5)*8,jz=z+(rand(sim)-.5)*6,model=root.BattleSoldierModel.createSoldier(sim.scene,faction,role,null);model.root.position.set(jx,sim.heightAt(jx,jz),jz);model.root.rotation.y=objectiveZ>z?0:Math.PI;
      var weapon=root.BattleWeapons.attachWeapon(sim.scene,model.weaponSocket,root.SquadAI.ROLES[role].weapon),soldier=root.SquadAI.createSoldier({id:nextId++,faction:faction,role:role,squad:sq,slotIndex:si,model:model,weapon:weapon});soldier.fireCooldown=rand(sim)*.5;soldier.unitType='infantry';soldier.captureWeight=1;soldier.scoreValue=1;
      sq.members.push(soldier);sim._roster[faction].push(soldier);sim.factions[faction].alive++;units.push(soldier);root.BattleModules.addUnit(sim,soldier,{unitType:'infantry',captureWeight:1});
    }
    sim.factions[faction].squads.push(sq);if(scenario&&root.BattleCommanderAI&&root.BattleCommanderAI.assignSquad)root.BattleCommanderAI.assignSquad(sim,sq,scenario,index);return{squad:sq,units:units,count:units.length};
  }
  root.BattleModules.registerUnitType('infantry-squad',{version:'20',label:'Infantry squad',category:'infantry',capabilities:['capture','direct-fire','screen','defend'],operatorSpawn:true,spawnCount:10,buttonLabel:'Infantry',captureWeight:1,spawn:spawn});
})(typeof window!=='undefined'?window:globalThis);

/* Default infantry reinforcement module. Future tanks/engineers can register the same spawn contract. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI||!root.BattleSoldierModel||!root.BattleWeapons||!root.BattleSim)return;

  function spawn(sim,faction,opts){
    opts=opts||{};
    var index=opts.squadIndex==null?sim.factions[faction].squads.length:+opts.squadIndex;
    var lanes=opts.lanes||[-140,-70,0,70,140],laneX=opts.x==null?(lanes[index%lanes.length]+(Math.floor(index/lanes.length)%3-1)*8):+opts.x;
    var z=opts.z==null?(faction==='us'?-110:110):+opts.z,objectiveZ=opts.objectiveZ==null?-z:+opts.objectiveZ;
    var home={x:laneX,z:z},objective={x:laneX,z:objectiveZ};
    var sq=root.SquadAI.createSquad(faction+'-inf-'+index+'-'+Math.floor(sim.time||0),faction,home,objective),nextId=root.BattleModules.nextEntityId(sim),units=[];

    for(var si=0;si<root.SquadAI.COMPOSITION.length;si++){
      var role=root.SquadAI.COMPOSITION[si],jx=laneX+(Math.random()-.5)*8,jz=z+(Math.random()-.5)*6;
      var model=root.BattleSoldierModel.createSoldier(sim.scene,faction,role,null);
      model.root.position.set(jx,root.BattleSim.heightAt(jx,jz),jz);model.root.rotation.y=objectiveZ>z?0:Math.PI;
      var weapon=root.BattleWeapons.attachWeapon(sim.scene,model.weaponSocket,root.SquadAI.ROLES[role].weapon);
      var soldier=root.SquadAI.createSoldier({id:nextId++,faction:faction,role:role,squad:sq,slotIndex:si,model:model,weapon:weapon});
      soldier.unitType='infantry';soldier.captureWeight=1;
      sq.members.push(soldier);sim._roster[faction].push(soldier);sim.factions[faction].alive++;units.push(soldier);root.BattleModules.addUnit(sim,soldier,{unitType:'infantry',captureWeight:1});
    }
    sim.factions[faction].squads.push(sq);
    var town=sim.scene.metadata&&sim.scene.metadata.battleTown;
    if(town&&root.BattleCommanderAI&&root.BattleCommanderAI.assignSquad)root.BattleCommanderAI.assignSquad(sim,sq,town,index);
    return {squad:sq,units:units,count:units.length};
  }

  root.BattleModules.registerUnitType('infantry-squad',{
    version:'19',label:'Infantry squad',category:'infantry',operatorSpawn:true,spawnCount:10,buttonLabel:'Infantry',captureWeight:1,spawn:spawn
  });
})(typeof window!=='undefined'?window:globalThis);

/* The defender's prepared position, made real.

   defense-plan.js decides what a defending commander builds and where. This module is the part
   that has to touch the running battle:

     - it turns the operator's choice of defending side into a BattleSides model and a plan;
     - it registers every work's obstacles into the live cover field, so a sandbag parapet is cover
       to exactly the same code that already treats a hedge as cover;
     - it draws them;
     - and it DEPLOYS the defending force onto the ground it is holding instead of marching it up
       from a start line. This is the change the whole feature exists for: a defender who has to
       walk to his own objective is not a defender, and two forces walking at each other is why
       every fight used to be decided by whoever reached the middle first.

   The defender starts owning the sectors he actually occupies - not every objective on the map.
   Owning all of them would hand him the "held all objectives" victory 35 seconds in, and the
   sectors outside his commander's span of control are exactly the ones he did not prepare, so
   they are the ones left neutral for the attack to walk onto cheaply. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleSides||!root.BattleDefensePlan)return;

  var SIDE_COLORS={sandbags:[.72,.66,.48],foxholes:[.38,.32,.24],trench:[.34,.29,.22],mg:[.66,.60,.44],
    op:[.60,.57,.45],dugout:[.44,.39,.29],commandpost:[.46,.41,.31],ammo:[.35,.34,.28],
    wire:[.52,.52,.50],roadblock:[.40,.33,.24]};
  var GARRISON_HOLD=1e9;
  /* An attack at parity against a prepared, dug-in defender is not a scenario, it is a massacre -
     the first headless runs of this feature ended 49 defenders alive to 16 attackers, every time,
     on every seed. Historical practice is roughly three to one for a deliberate attack; this is
     deliberately gentler than that, because the sim's defender has no artillery to be shelled by
     and the attacker still has to be able to lose. The attacker is brought up to strength with the
     same infantry-squad module the operator's reinforcement button uses. */
  var ATTACKER_SUPERIORITY=1.7;

  function scenarioOf(sim){var m=sim&&sim.scene&&sim.scene.metadata;return m&&(m.battleScenario||m.battleTown)||null;}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function chosenDefender(sim){
    var f=sim&&sim._defenderChoice;
    if(f===undefined)f=sim&&sim.scene&&sim.scene.metadata&&sim.scene.metadata.battleDefender;
    if(f===undefined)f=root.BATTLE_DEFENDER;
    return f==='us'||f==='ge'?f:null;
  }

  /* ---- the cover field ---------------------------------------------------------------------- */

  /* Works are appended to the same plain obstacle array terrain-features.js produced. The spatial
     index rebuilds itself when the array length changes, so nothing else has to be told. */
  function clearWorkObstacles(sim){
    if(!sim||!sim.obstacles)return;
    for(var i=sim.obstacles.length-1;i>=0;i--)if(sim.obstacles[i].work)sim.obstacles.splice(i,1);
    sim.obstacles.__battleField=null;
  }
  function addWorkObstacles(sim,work){
    if(!sim||!sim.obstacles)return;
    for(var i=0;i<work.obstacles.length;i++){
      var ob=work.obstacles[i];ob.work=work.id;ob.workType=work.type;
      sim.obstacles.push(ob);
    }
    sim.obstacles.__battleField=null;
  }

  /* ---- rendering ---------------------------------------------------------------------------- */

  var sharedMat=null;
  function material(scene){
    if(typeof BABYLON==='undefined')return null;
    if(sharedMat&&sharedMat.getScene&&sharedMat.getScene()===scene)return sharedMat;
    sharedMat=new BABYLON.StandardMaterial('defenseWorkMat',scene);
    sharedMat.specularColor=BABYLON.Color3.Black();sharedMat.ambientColor=new BABYLON.Color3(1,1,1);
    return sharedMat;
  }
  function paint(mesh,rgb){
    var n=mesh.getTotalVertices(),data=new Float32Array(n*4);
    for(var i=0;i<n;i++){data[i*4]=rgb[0];data[i*4+1]=rgb[1];data[i*4+2]=rgb[2];data[i*4+3]=1;}
    mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);
    return mesh;
  }
  function slab(scene,w,h,d,x,y,z,yaw,rgb){
    var m=BABYLON.MeshBuilder.CreateBox('work',{width:w,height:h,depth:d},scene);
    m.position.set(x,y+h/2,z);m.rotation.y=yaw;m.bakeCurrentTransformIntoVertices();
    return paint(m,rgb);
  }
  function buildWorkMesh(scene,sim,work){
    if(typeof BABYLON==='undefined')return null;
    var r=work.render,rgb=SIDE_COLORS[work.type]||[.5,.45,.35],parts=[],yaw=r.ang;
    var dx=Math.sin(yaw),dz=Math.cos(yaw),i,t,x,z;
    if(r.shape==='block'){
      parts.push(slab(scene,r.len*.7,r.height,r.len*.55,work.x,sim.heightAt(work.x,work.z),work.z,yaw,rgb));
    }else if(r.shape==='arc'){
      for(i=-1;i<=1;i++){
        t=i*(r.len*.34);x=work.x+dx*t;z=work.z+dz*t;
        parts.push(slab(scene,1.5,r.height,.8,x,sim.heightAt(x,z),z,yaw+i*.28,rgb));
      }
    }else{
      var steps=Math.max(2,Math.round(r.len/2.4));
      for(i=0;i<=steps;i++){
        t=(i/steps-.5)*r.len;x=work.x+dx*t;z=work.z+dz*t;
        parts.push(slab(scene,2.3,r.height,work.type==='wire'?.25:.7,x,sim.heightAt(x,z),z,yaw,rgb));
      }
    }
    var mesh=parts.length>1?BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false):parts[0];
    if(!mesh)return null;
    mesh.material=material(scene);mesh.isPickable=false;
    if(mesh.freezeWorldMatrix)mesh.freezeWorldMatrix();
    return mesh;
  }
  function disposeMeshes(sim){
    var list=sim&&sim._defenseMeshes;if(!list)return;
    for(var i=0;i<list.length;i++){try{list[i].dispose();}catch(_){}}
    sim._defenseMeshes=[];
  }
  function renderWork(sim,work){
    if(!sim.scene||typeof BABYLON==='undefined')return;
    var mesh=buildWorkMesh(sim.scene,sim,work);
    if(mesh)(sim._defenseMeshes||(sim._defenseMeshes=[])).push(mesh);
  }

  /* ---- deployment --------------------------------------------------------------------------- */

  function scatter(sim,squad,center,frame){
    var members=squad.members||[];
    for(var i=0;i<members.length;i++){
      var s=members[i];if(s.dead)continue;
      var lat=((i%5)-2)*3.4,back=(Math.floor(i/5))*3.6;
      var x=center.x+frame.left.x*lat+frame.approach.x*back,z=center.z+frame.left.z*lat+frame.approach.z*back;
      s.root.position.set(x,sim.heightAt(x,z),z);
      s.root.rotation.y=frame.facingYaw;
      s.destination={x:x,z:z};s.orderDestination={x:x,z:z};s._fireteamDestination=null;s._navCache=null;
      if(root.BattleEngagement)root.BattleEngagement.resetSoldier(s);
    }
  }
  /* Each defending squad gets a sector and stands on it. The best sector takes the first squads, so
     a five-squad defence on three sectors weights the ground that is worth weighting. */
  function deployDefenders(sim,sides,plan){
    var scenario=scenarioOf(sim);if(!scenario)return 0;
    var held=sides.heldSectors.slice().sort(function(a,b){return b.terrainValue-a.terrainValue;});
    if(!held.length)return 0;
    var squads=sim.factions[sides.defender].squads||[],placed=0;
    for(var i=0;i<squads.length;i++){
      var sq=squads[i],sector=held[i%held.length],point={x:sector.x,z:sector.z};
      var frame=root.BattleSides.tacticalFrame(sides,point);
      var lane=Math.floor(i/held.length)-((Math.ceil(squads.length/held.length)-1)/2);
      var center=root.BattleSides.offsetPoint(point,frame,sector.radius*.32,lane*sector.radius*.75);
      scatter(sim,sq,center,frame);
      /* Falling back means falling back through the position, not all the way to the start line. */
      sq.home={x:point.x+frame.approach.x*sector.radius*2.6,z:point.z+frame.approach.z*sector.radius*2.6};
      sq.route=[{x:center.x,z:center.z}];sq.routeIndex=0;
      sq.commandRole='garrison';sq.garrisonObjective=sector.objectiveId;sq.garrisonPoint=point;
      sq.commandPhase='defend';sq.objective={x:point.x,z:point.z};sq.targetObjective=sector.objectiveId;
      sq.commandHoldUntil=0;sq.orderAnchor={x:center.x,z:center.z};sq.rally={x:center.x,z:center.z};
      sq._orderGoal=null;sq._formationForward={x:frame.front.x,z:frame.front.z};
      sq._objectiveDefenseId=sector.objectiveId;sq._objectiveDefenseAnchor={x:center.x,z:center.z};
      sq._objectiveSecureUntil=GARRISON_HOLD;
      sq._stablePlan=null;sq._stablePlanSerial=(sq._stablePlanSerial||0)+1;sq._fireteamOrders={};
      placed++;
    }
    return placed;
  }
  /* Bring the attacker up to the strength an attack needs. Only ever done on a fresh roster (a
     battle start or a restart), because there is no despawn: topping up an already-topped-up force
     would ratchet. */
  function reinforceAttacker(sim,sides){
    if(!root.BattleModules.getUnitType||!root.BattleModules.getUnitType('infantry-squad'))return 0;
    var defending=(sim.factions[sides.defender].squads||[]).length;
    var attacking=(sim.factions[sides.attacker].squads||[]).length;
    var want=Math.round(defending*ATTACKER_SUPERIORITY),extra=Math.max(0,want-attacking),spawned=0;
    for(var i=0;i<extra;i++){
      try{
        var result=root.BattleModules.spawnUnitType('infantry-squad',sim,sides.attacker,{squadIndex:attacking+i});
        if(result&&result.squad){result.squad._sidesReinforcement=true;spawned++;}
      }catch(e){console.warn('[DEFENSE] attacker reinforcement failed',e&&e.message||e);break;}
    }
    return spawned;
  }

  /* The sectors he is standing on are his. The rest of the map is not - see the header. */
  function seedOwnership(sim,sides){
    var api=root.BattleObjectiveSystem;if(!api)return;
    sides.heldSectors.forEach(function(sector){
      var obj=api.get(sim,sector.objectiveId);
      if(obj&&obj.state)obj.state.owner=sides.defender;
    });
    if(api.tick)api.tick(sim,0);
  }

  /* ---- lifecycle ---------------------------------------------------------------------------- */

  function apply(sim,opts){
    opts=opts||{};
    var scenario=scenarioOf(sim),defender=chosenDefender(sim);
    clearWorkObstacles(sim);disposeMeshes(sim);
    if(root.BattleDefensePlan.resetClaims&&sim._defensePlan)root.BattleDefensePlan.resetClaims(sim._defensePlan);
    var sides=root.BattleSides.build(scenario,{defender:defender});
    var plan=root.BattleDefensePlan.build(scenario,sides,{heightAt:sim.heightAt,obstacles:sim.obstacles});
    sim._sides=sides;sim._defensePlan=plan;
    /* One plan per faction. The attacker's starts empty and his engineers fill it in on ground he
       takes, so both sides claim prepared positions through exactly the same path. */
    sim._defensePlans={us:root.BattleDefensePlan.empty('us'),ge:root.BattleDefensePlan.empty('ge')};
    if(defender)sim._defensePlans[defender]=plan;
    if(sim.scene&&sim.scene.metadata)sim.scene.metadata.battleSides=sides;
    if(!defender||!plan.works.length){
      telemetry(sim,'defense-plan',{defender:defender,works:0,meeting:!defender});
      return plan;
    }
    plan.works.forEach(function(work){addWorkObstacles(sim,work);renderWork(sim,work);});
    seedOwnership(sim,sides);
    var deployed=deployDefenders(sim,sides,plan);
    var reinforced=opts.reinforce?reinforceAttacker(sim,sides):0;
    telemetry(sim,'defense-plan',{defender:defender,commander:sides.commander,echelon:sides.echelonId,
      sectors:sides.heldSectors.map(function(s){return s.objectiveId+':'+s.role;}),
      works:plan.works.length,posts:plan.posts.length,obstacles:plan.obstacles.length,
      omitted:plan.budget.omitted.length,squadsDeployed:deployed,attackerSquadsAdded:reinforced});
    console.log('[DEFENSE] '+root.BattleSides.summary(sides)+' · '+plan.works.length+' works, '+
      plan.posts.length+' posts, '+deployed+' squads deployed'+(reinforced?', +'+reinforced+' attacking squads':''));
    return plan;
  }

  /* Changing sides re-lays the whole battle: works, ownership, where the defence is standing and
     how strong the attack is. That is a restart, not an edit, so before the first shot it runs one
     (which re-enters this module through onBattleRestart with a clean roster). Once the battle is
     running the choice is remembered and applied the next time the operator restarts. */
  function setDefender(sim,faction){
    sim._defenderChoice=faction==='us'||faction==='ge'?faction:null;
    root.BATTLE_DEFENDER=sim._defenderChoice;
    if(sim.scene&&sim.scene.metadata)sim.scene.metadata.battleDefender=sim._defenderChoice;
    if(sim.time>0&&!sim.paused)return{applied:false,reason:'battle running; applies on restart'};
    if(typeof sim.restart==='function')sim.restart();else apply(sim,{reinforce:true});
    return{applied:true,sides:sim._sides};
  }
  /* A work an engineer finished during the battle joins the field exactly like a planned one. */
  function commitWork(sim,faction,work,sector){
    var plan=sim._defensePlans&&sim._defensePlans[faction];
    if(!plan||!work)return null;
    root.BattleDefensePlan.register(plan,work,sector);
    addWorkObstacles(sim,work);renderWork(sim,work);
    return work;
  }

  root.BattleDefenseWorks={
    apply:apply,setDefender:setDefender,commitWork:commitWork,
    defenderOf:function(sim){return sim&&sim._sides?sim._sides.defender:null;},
    planOf:function(sim,faction){return sim&&sim._defensePlans?sim._defensePlans[faction]:null;},
    summary:function(sim){return sim&&sim._sides?root.BattleSides.summary(sim._sides):'No sides configured';}
  };

  root.BattleModules.registerSystem('defense-works',{
    version:'30-sides',
    onBattleStart:function(sim){apply(sim,{reinforce:true});},
    onBattleRestart:function(sim){apply(sim,{reinforce:true});},
    beforeBattleRestart:function(sim){clearWorkObstacles(sim);disposeMeshes(sim);}
  });
  console.log('[DEFENSE] prepared positions + defender deployment active');
})(typeof window!=='undefined'?window:globalThis);

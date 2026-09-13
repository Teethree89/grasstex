/* WW2FPS defender stratagem + combat engineers for the Battle Sim / AI lab.
   Ports the useful contract from ww2fps/js/defenses.js at Battle-Sim scale:
   attacker-relative defensive depth, a captain-sized span of defended objectives, prepared
   positions facing the attacker, and a finite engineering effort that turns occupied objectives
   into actual fieldworks.

   This module does not own individual movement. It supplies stable defensive position inputs
   (_preparedDefensePost -> _fireteamDestination/orderDestination) to engagement.js. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI||!root.BattleSim)return;

  var SYSTEM_ID='ww2fps-defender-stratagem';
  var DEFENSE_SPAN=3,ENGINEER_BUILD_SECONDS=10,MAX_RUNTIME_WORKS=2;
  var BANDS={us:[.32,.46,.73],ge:[.31,.46,.73]};
  var oldStart=root.BattleSim.start,oldUpdateSquad=root.SquadAI.updateSquad;

  function copy(p){return p?{x:+p.x||0,z:+p.z||0}:null;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dist(a,b){return Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0));}
  function enemyFaction(f){return f==='us'?'ge':'us';}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function scenarioOf(sim){return sim&&sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||null;}
  function objectiveStatus(sim,obj){return root.BattleObjectiveSystem?root.BattleObjectiveSystem.status(sim,obj.id):(obj.state||{});}
  function roleState(){
    var roles=root.BATTLE_SIDE_ROLES||{us:'attacker',ge:'attacker'};
    return {us:roles.us==='defender'?'defender':'attacker',ge:roles.ge==='defender'?'defender':'attacker'};
  }
  function defenderFaction(sim){
    var roles=sim&&sim.sideRoles||roleState();
    if(roles.us==='defender')return'us';
    if(roles.ge==='defender')return'ge';
    return null;
  }
  function centerSpawn(scenario,faction){
    var z=scenario&&scenario.spawnZones&&scenario.spawnZones[faction];
    if(!z)return{x:0,z:faction==='us'?-510:510};
    var lanes=z.lanes||[0],sum=0;for(var i=0;i<lanes.length;i++)sum+=+lanes[i]||0;
    return{x:lanes.length?sum/lanes.length:0,z:+z.z||0};
  }
  function attackFrame(point,scenario,defender){
    var attacker=centerSpawn(scenario,enemyFaction(defender)),dx=point.x-attacker.x,dz=point.z-attacker.z,l=Math.hypot(dx,dz)||1;
    var approach={x:dx/l,z:dz/l};
    return {approach:approach,front:{x:-approach.x,z:-approach.z},left:{x:-approach.z,z:approach.x}};
  }
  function attackProgress(point,scenario,defender){
    var a=centerSpawn(scenario,enemyFaction(defender)),d=centerSpawn(scenario,defender),vx=d.x-a.x,vz=d.z-a.z,l2=vx*vx+vz*vz||1;
    return ((point.x-a.x)*vx+(point.z-a.z)*vz)/l2;
  }
  function pointSegmentDistance(p,a,b){
    var dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz||1,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l2,0,1);
    return Math.hypot(p.x-(a.x+dx*t),p.z-(a.z+dz*t));
  }
  function nearRoad(point,scenario){
    var roads=scenario&&scenario.roads||[],best=Infinity;
    for(var i=0;i<roads.length;i++)best=Math.min(best,pointSegmentDistance(point,{x:roads[i].ax,z:roads[i].az},{x:roads[i].bx,z:roads[i].bz}));
    return best<12;
  }
  function nearBuildings(point,scenario,radius){
    var bs=scenario&&scenario.buildings||[];
    for(var i=0;i<bs.length;i++)if(Math.hypot(bs[i].x-point.x,bs[i].z-point.z)<radius)return true;
    return false;
  }
  function pointInBuilding(p,scenario){
    var bs=scenario&&scenario.buildings||[];
    for(var i=0;i<bs.length;i++){
      var b=bs[i],dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(-(b.rot||0)),s=Math.sin(-(b.rot||0)),lx=dx*c-dz*s,lz=dx*s+dz*c;
      if(Math.abs(lx)<b.w/2+.8&&Math.abs(lz)<b.d/2+.8)return true;
    }
    return false;
  }
  function buildScheme(sim,defender){
    var scenario=scenarioOf(sim),objectives=(sim._objectives||[]).filter(function(o){return o.type==='capture-zone';}),bands=BANDS[defender]||BANDS.ge,sectors=[];
    for(var i=0;i<objectives.length;i++){
      var obj=objectives[i],p={x:+obj.def.x||0,z:+obj.def.z||0},progress=attackProgress(p,scenario,defender),role=progress<bands[0]?'contact':progress<bands[1]?'security':progress<bands[2]?'main':'depth';
      var terrainValue=(nearBuildings(p,scenario,(+obj.def.radius||30)*1.6)?2.2:0)+(nearRoad(p,scenario)?.7:0)+(role==='main'?2:role==='depth'?1.3:role==='security'?.7:-5)+(+obj.def.value||1);
      sectors.push({id:'sector_'+obj.id,objectiveId:obj.id,progress:progress,role:role,doctrinalRole:role,active:role!=='contact',terrainValue:terrainValue,objective:obj,fallbackObjectiveId:null});
    }
    var candidates=sectors.filter(function(s){return s.active;}).sort(function(a,b){return b.terrainValue-a.terrainValue||Math.abs(a.progress-.6)-Math.abs(b.progress-.6);});
    var selected=candidates.slice(0,DEFENSE_SPAN);
    if(!selected.length)selected=sectors.slice().sort(function(a,b){return Math.abs(a.progress-.58)-Math.abs(b.progress-.58);}).slice(0,Math.min(DEFENSE_SPAN,sectors.length));
    var activeIds={};selected.forEach(function(s){activeIds[s.objectiveId]=1;s.active=true;});
    sectors.forEach(function(s){if(!activeIds[s.objectiveId])s.active=false;});
    var depth=selected.slice().sort(function(a,b){return a.progress-b.progress;});
    for(i=0;i<depth.length;i++)depth[i].fallbackObjectiveId=depth[i+1]?depth[i+1].objectiveId:null;
    return {defender:defender,attacker:enemyFaction(defender),command:'captain',span:DEFENSE_SPAN,bands:{contactEnd:bands[0],securityEnd:bands[1],mainEnd:bands[2]},sectors:sectors,active:selected};
  }

  function ensureEngineerClass(){
    if(!root.SquadAI.ROLES.engineer)root.SquadAI.ROLES.engineer={weapon:'rifle',speed:2.65,visionRange:140,engageRange:130,hp:100};
    var comp=root.SquadAI.COMPOSITION;
    if(comp.indexOf('engineer')<0){
      for(var i=comp.length-1;i>=0;i--)if(comp[i]==='rifleman'){comp[i]='engineer';break;}
    }
  }

  function installUi(){
    if(typeof document==='undefined'||document.getElementById('usDefenderToggle'))return;
    var usTag=document.querySelector('.tag.us'),geTag=document.querySelector('.tag.ge');
    if(!usTag||!geTag)return;
    var style=document.createElement('style');style.textContent='.defender-toggle{display:inline-flex;align-items:center;gap:3px;margin:0 auto 0 8px;color:#9da58f;font-size:10px;white-space:nowrap}.defender-toggle input{margin:0;accent-color:#8a9b61}.defender-toggle.locked{opacity:.45}';
    document.head.appendChild(style);
    function add(tag,id){
      var label=document.createElement('label');label.className='defender-toggle';label.title='Make this faction the prepared defender';
      var input=document.createElement('input');input.type='checkbox';input.id=id;input.setAttribute('aria-label','Defender');
      label.appendChild(input);label.appendChild(document.createTextNode('Defender'));tag.parentNode.insertBefore(label,tag.nextSibling);return input;
    }
    var us=add(usTag,'usDefenderToggle'),ge=add(geTag,'geDefenderToggle');
    function roles(){return{us:us.checked?'defender':'attacker',ge:ge.checked?'defender':'attacker'};}
    function changed(which){
      if(which===us&&us.checked)ge.checked=false;if(which===ge&&ge.checked)us.checked=false;
      root.BATTLE_SIDE_ROLES=roles();
      var battle=root.__battle__;
      if(battle&&battle.paused){
        battle.sideRoles=roleState();battle.restart();battle.pause();
        console.log('[SIDES] pre-battle roles changed '+JSON.stringify(battle.sideRoles));
      }
    }
    us.addEventListener('change',function(){changed(us);});ge.addEventListener('change',function(){changed(ge);});
    var start=document.getElementById('startBtn');
    if(start)start.addEventListener('click',function(){us.disabled=true;ge.disabled=true;us.parentNode.classList.add('locked');ge.parentNode.classList.add('locked');},true);
    root.BATTLE_SIDE_ROLES=roles();
  }

  function works(sim){
    if(!sim._engineerWorks)sim._engineerWorks={meshes:[],materials:{},obstacles:[],progress:{},counts:{},runtimeCounts:{},scheme:null,serial:0};
    return sim._engineerWorks;
  }
  function fieldMat(sim,faction){
    var w=works(sim),m=w.materials[faction];if(m)return m;
    m=new BABYLON.StandardMaterial('fieldwork-'+faction,sim.scene);m.diffuseColor=faction==='us'?new BABYLON.Color3(.35,.33,.23):new BABYLON.Color3(.39,.36,.29);m.specularColor=BABYLON.Color3.Black();w.materials[faction]=m;return m;
  }
  function addObstacle(sim,ob){
    ob._engineerFieldwork=true;sim.obstacles.push(ob);works(sim).obstacles.push(ob);
    try{delete sim.obstacles.__battleField;}catch(_){sim.obstacles.__battleField=null;}
  }
  function buildSandbags(sim,faction,site,frame,label){
    if(typeof BABYLON==='undefined')return{post:{x:site.x-frame.front.x*1.45,z:site.z-frame.front.z*1.45},type:'sandbags'};
    var width=7,mesh=BABYLON.MeshBuilder.CreateBox('sandbags-'+label,{width:width,height:.82,depth:.92},sim.scene),yaw=Math.atan2(frame.front.x,frame.front.z);
    mesh.position.set(site.x,sim.heightAt(site.x,site.z)+.41,site.z);mesh.rotation.y=yaw;mesh.material=fieldMat(sim,faction);mesh.isPickable=false;works(sim).meshes.push(mesh);
    for(var i=-2;i<=2;i++){var off=i*1.35,x=site.x+frame.left.x*off,z=site.z+frame.left.z*off;addObstacle(sim,{x:x,z:z,y:sim.heightAt(x,z),radius:.62,cover:.38,height:.86,type:'sandbag'});}
    return{post:{x:site.x-frame.front.x*1.55,z:site.z-frame.front.z*1.55},type:'sandbags',mesh:mesh};
  }
  function buildFoxhole(sim,faction,site,frame,label){
    var mesh=null;if(typeof BABYLON!=='undefined'){mesh=BABYLON.MeshBuilder.CreateTorus('foxhole-'+label,{diameter:2.8,thickness:.32,tessellation:18},sim.scene);mesh.position.set(site.x,sim.heightAt(site.x,site.z)+.08,site.z);mesh.scaling.y=.35;mesh.material=fieldMat(sim,faction);mesh.isPickable=false;works(sim).meshes.push(mesh);}
    var lip={x:site.x+frame.front.x*1.05,z:site.z+frame.front.z*1.05};addObstacle(sim,{x:lip.x,z:lip.z,y:sim.heightAt(lip.x,lip.z),radius:.78,cover:.48,height:.55,type:'foxhole-berm'});
    return{post:{x:site.x-frame.front.x*.15,z:site.z-frame.front.z*.15},type:'foxhole',mesh:mesh};
  }
  function clearWorks(sim){
    var w=sim&&sim._engineerWorks;if(!w)return;
    for(var i=w.meshes.length-1;i>=0;i--)try{w.meshes[i].dispose();}catch(_){}
    Object.keys(w.materials||{}).forEach(function(k){try{w.materials[k].dispose();}catch(_){}});
    if(sim.obstacles)for(i=sim.obstacles.length-1;i>=0;i--)if(sim.obstacles[i]&&sim.obstacles[i]._engineerFieldwork)sim.obstacles.splice(i,1);
    if(sim.obstacles)try{delete sim.obstacles.__battleField;}catch(_){sim.obstacles.__battleField=null;}
    sim._engineerWorks=null;
  }

  function bestPost(sim,desired,obj){
    var scenario=scenarioOf(sim),radius=+obj.def.radius||30,best=desired,bestScore=Infinity,F=root.BattleObstacleField;
    for(var ring=0;ring<=2;ring++)for(var i=0;i<(ring?10:1);i++){
      var a=(i/10)*Math.PI*2,c={x:desired.x+Math.cos(a)*ring*3,z:desired.z+Math.sin(a)*ring*3};
      if(dist(c,{x:+obj.def.x||0,z:+obj.def.z||0})>radius*.82||pointInBuilding(c,scenario))continue;
      var cover=F?F.coverPotentialAt(sim.obstacles,c.x,c.z):1,score=cover*9+dist(c,desired)*.22;
      if(score<bestScore){bestScore=score;best=c;}
    }
    return best;
  }
  function prepareSquadPosts(sim,sq,obj,teleport,squadIndex){
    var p={x:+obj.def.x||0,z:+obj.def.z||0},frame=attackFrame(p,scenarioOf(sim),sq.faction),radius=+obj.def.radius||30,side=((squadIndex||0)%3)-1;
    var anchor={x:p.x+frame.front.x*radius*.34+frame.left.x*side*11,z:p.z+frame.front.z*radius*.34+frame.left.z*side*11};
    sq._strategicDefenseObjective=obj.id;sq.targetObjective=obj.id;sq.objective=copy(p);sq.commandPhase='defend';sq.commandHoldUntil=Math.max(sq.commandHoldUntil||0,sim.time+2);
    sq.orderAnchor=copy(anchor);sq.rally=copy(anchor);sq._stablePlan=null;
    var alive=(sq.members||[]).filter(function(s){return!s.dead;});
    for(var i=0;i<alive.length;i++){
      var s=alive[i],lane=i-(alive.length-1)/2,lateral=lane*3.6,depth=(i%2)*2.2+(s.role==='captain'||s.role==='engineer'?4.4:0);
      var desired={x:anchor.x+frame.left.x*lateral-frame.front.x*depth,z:anchor.z+frame.left.z*lateral-frame.front.z*depth};
      var post=bestPost(sim,desired,obj);s._preparedDefensePost=copy(post);s._fireteamDestination=copy(post);s.orderDestination=copy(post);
      if(teleport&&s.root){s.root.position.x=post.x;s.root.position.z=post.z;s.root.position.y=sim.heightAt(post.x,post.z);s.root.rotation.y=Math.atan2(frame.front.x,frame.front.z);s.destination=copy(post);s._navCache=null;}
    }
  }
  function applyPreparedPosts(sq,battle){
    if(!sq||!battle||sq.state==='retreat')return;
    var defensive=sq.commandPhase==='defend'||sq.commandPhase==='capture'||sq.commandPhase==='hold'||!!sq._strategicDefenseObjective;
    if(!defensive)return;
    (sq.members||[]).forEach(function(s){if(!s.dead&&s._preparedDefensePost){s._fireteamDestination=copy(s._preparedDefensePost);s.orderDestination=copy(s._preparedDefensePost);}});
  }
  root.SquadAI.updateSquad=function(sq,battle){
    if(battle&&sq&&sq._strategicDefenseObjective){
      var obj=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(battle,sq._strategicDefenseObjective);
      if(obj){sq.commandPhase='defend';sq.targetObjective=obj.id;sq.objective={x:+obj.def.x||0,z:+obj.def.z||0};if(sq._stablePlan&&sq._stablePlan.phase!=='defend')sq._stablePlan=null;}
    }
    oldUpdateSquad(sq,battle);if(battle)applyPreparedPosts(sq,battle);
  };

  function prebuildSector(sim,sector){
    var obj=sector.objective,p={x:+obj.def.x||0,z:+obj.def.z||0},frame=attackFrame(p,scenarioOf(sim),sector.defender||defenderFaction(sim)),r=+obj.def.radius||30,defender=defenderFaction(sim);
    var usStyle=defender==='us',patterns=usStyle?['foxhole','sandbags','foxhole']:['sandbags','sandbags','foxhole'];
    for(var i=0;i<patterns.length;i++){
      var lateral=(i-1)*Math.min(10,r*.28),frontScale=.50+(i===1?.08:0),site={x:p.x+frame.front.x*r*frontScale+frame.left.x*lateral,z:p.z+frame.front.z*r*frontScale+frame.left.z*lateral};
      if(pointInBuilding(site,scenarioOf(sim)))continue;
      var fw=patterns[i]==='sandbags'?buildSandbags(sim,defender,site,frame,sector.objectiveId+'-pre-'+i):buildFoxhole(sim,defender,site,frame,sector.objectiveId+'-pre-'+i);
      works(sim).counts[defender+'|'+obj.id]=(works(sim).counts[defender+'|'+obj.id]||0)+1;
      telemetry(sim,'engineer-fortification-built',{faction:defender,objective:obj.id,type:fw.type,prepared:true});
    }
  }
  function applyInitialDefense(sim){
    clearWorks(sim);ensureEngineerClass();
    var defender=defenderFaction(sim);if(!defender){sim._defenseScheme=null;return;}
    var scheme=buildScheme(sim,defender),w=works(sim);w.scheme=scheme;sim._defenseScheme=scheme;
    (sim._objectives||[]).forEach(function(obj){if(obj.state){obj.state.owner=defender;obj.state.active=null;obj.state.lastActive=null;obj.state.progress=0;obj.state.phase='held';}});
    for(var i=0;i<scheme.active.length;i++){scheme.active[i].defender=defender;prebuildSector(sim,scheme.active[i]);}
    var squads=sim.factions[defender]&&sim.factions[defender].squads||[];
    for(i=0;i<squads.length;i++){var sector=scheme.active[i%scheme.active.length];if(sector)prepareSquadPosts(sim,squads[i],sector.objective,true,i);}
    telemetry(sim,'defense-scheme',{defender:defender,attacker:enemyFaction(defender),command:'captain',span:DEFENSE_SPAN,sectors:scheme.sectors.map(function(s){return{id:s.id,objective:s.objectiveId,role:s.role,active:s.active,progress:+s.progress.toFixed(3),fallback:s.fallbackObjectiveId};})});
    console.log('[DEFENSE] '+defender.toUpperCase()+' prepared '+scheme.active.length+' objectives; attacker='+enemyFaction(defender).toUpperCase());
  }

  function engineerBuildTick(sim,dt){
    var groups={},objectives=sim._objectives||[];
    ['us','ge'].forEach(function(f){
      (sim._roster[f]||[]).forEach(function(s){
        if(s.dead||s.role!=='engineer'||!s.root||s.suppressedUntil>sim.time||s.squad&&s.squad.inContact)return;
        for(var i=0;i<objectives.length;i++){
          var obj=objectives[i],st=objectiveStatus(sim,obj);if(!st||st.owner!==f)continue;
          var p={x:+obj.def.x||0,z:+obj.def.z||0},r=+obj.def.radius||30;if(dist(s.root.position,p)>r*.78)continue;
          var key=f+'|'+obj.id;if(!groups[key])groups[key]={faction:f,obj:obj,engineer:s};break;
        }
      });
    });
    var w=works(sim);
    Object.keys(groups).forEach(function(key){
      var g=groups[key],count=w.counts[key]||0,runtimeCount=w.runtimeCounts[key]||0;if(runtimeCount>=MAX_RUNTIME_WORKS)return;
      if(!w.progress[key]){w.progress[key]=0;telemetry(sim,'engineer-fortify-start',{faction:g.faction,objective:g.obj.id,engineer:g.engineer.id});}
      w.progress[key]+=dt;if(w.progress[key]<ENGINEER_BUILD_SECONDS)return;w.progress[key]=0;
      var p={x:+g.obj.def.x||0,z:+g.obj.def.z||0},frame=attackFrame(p,scenarioOf(sim),g.faction),r=+g.obj.def.radius||30,serial=++w.serial,lat=((serial%3)-1)*8;
      var site={x:p.x+frame.front.x*r*.46+frame.left.x*lat,z:p.z+frame.front.z*r*.46+frame.left.z*lat};
      if(pointInBuilding(site,scenarioOf(sim))){site.x=p.x+frame.front.x*r*.30;site.z=p.z+frame.front.z*r*.30;}
      var fw=(count%2===0)?buildSandbags(sim,g.faction,site,frame,g.obj.id+'-live-'+serial):buildFoxhole(sim,g.faction,site,frame,g.obj.id+'-live-'+serial);
      w.counts[key]=count+1;w.runtimeCounts[key]=runtimeCount+1;g.engineer._preparedDefensePost=copy(fw.post);
      if(g.engineer.squad)prepareSquadPosts(sim,g.engineer.squad,g.obj,false,serial);
      telemetry(sim,'engineer-fortification-built',{faction:g.faction,objective:g.obj.id,engineer:g.engineer.id,type:fw.type,prepared:false});
    });
  }

  function reinforceDefenderIntent(sim){
    var defender=defenderFaction(sim);if(!defender)return;
    /* Prepared defense is an assault scenario, not a 35-second free objective-hold win. The
       defender wins by stopping the attack (elimination/time); only the attacker can end it by
       taking and holding the entire objective set. */
    if(sim.objectiveHold)sim.objectiveHold[defender]=0;
    var squads=sim.factions[defender]&&sim.factions[defender].squads||[];
    squads.forEach(function(sq){
      if(!sq._strategicDefenseObjective||sq.state==='retreat')return;
      var obj=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get(sim,sq._strategicDefenseObjective);if(!obj)return;
      sq.commandPhase='defend';sq.targetObjective=obj.id;sq.objective={x:+obj.def.x||0,z:+obj.def.z||0};
      applyPreparedPosts(sq,sim);
    });
  }

  root.BattleSim.start=function(scene,opts){
    installUi();root.BATTLE_SIDE_ROLES=roleState();opts=Object.assign({},opts||{},{sideRoles:roleState()});
    var sim=oldStart(scene,opts);sim.sideRoles=roleState();return sim;
  };

  root.BattleModules.registerSystem(SYSTEM_ID,{
    version:'30-defender-engineers',
    beforeBattleRestart:function(sim){clearWorks(sim);['us','ge'].forEach(function(f){(sim.factions&&sim.factions[f]&&sim.factions[f].squads||[]).forEach(function(sq){sq._strategicDefenseObjective=null;(sq.members||[]).forEach(function(s){s._preparedDefensePost=null;});});});},
    onBattleStart:function(sim){sim.sideRoles=roleState();applyInitialDefense(sim);},
    onBattleRestart:function(sim){sim.sideRoles=sim.sideRoles||roleState();applyInitialDefense(sim);},
    onCommanderTick:function(sim,payload){reinforceDefenderIntent(sim);engineerBuildTick(sim,payload&&payload.dt||.45);}
  });

  root.BattleDefenderStratagem={
    roles:roleState,
    scheme:function(sim){return sim&&sim._defenseScheme||null;},
    setRoles:function(roles){
      root.BATTLE_SIDE_ROLES={us:roles&&roles.us==='defender'?'defender':'attacker',ge:roles&&roles.ge==='defender'?'defender':'attacker'};
      if(root.BATTLE_SIDE_ROLES.us==='defender')root.BATTLE_SIDE_ROLES.ge='attacker';
      if(root.BATTLE_SIDE_ROLES.ge==='defender')root.BATTLE_SIDE_ROLES.us='attacker';
      var sim=root.__battle__;if(sim&&sim.paused){sim.sideRoles=roleState();sim.restart();sim.pause();}
      return roleState();
    }
  };

  ensureEngineerClass();installUi();
  console.log('[DEFENSE] ww2fps captain stratagem + engineer fieldworks loaded');
})(typeof window!=='undefined'?window:globalThis);

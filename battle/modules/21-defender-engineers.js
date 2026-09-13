/* Prepared defender deployment + combat engineers.
   Consumes BattleSides/BattleDefensePlan and feeds stable posts into the existing engagement pipeline. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleSides||!root.BattleDefensePlan||!root.SquadAI)return;
  var SYSTEM='defender-engineers',BUILD_SECONDS=10,MAX_RUNTIME=2;
  var COLORS={sandbags:[.72,.66,.48],foxholes:[.38,.32,.24],trench:[.34,.29,.22],mg:[.66,.60,.44],op:[.60,.57,.45],wire:[.52,.52,.50],roadblock:[.40,.33,.24]};
  function copy(p){return p?{x:+p.x||0,z:+p.z||0}:null;}
  function dist(a,b){return Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0));}
  function scenarioOf(sim){var m=sim&&sim.scene&&sim.scene.metadata;return m&&(m.battleScenario||m.battleTown)||null;}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function defenderOf(sim){var f=sim&&sim._defenderChoice;if(f===undefined)f=sim&&sim.scene&&sim.scene.metadata&&sim.scene.metadata.battleDefender;if(f===undefined)f=root.BATTLE_DEFENDER;return f==='us'||f==='ge'?f:null;}
  function status(sim,obj){return root.BattleObjectiveSystem?root.BattleObjectiveSystem.status(sim,obj.id):(obj.state||{});}
  function ensureEngineer(){if(!root.SquadAI.ROLES.engineer)root.SquadAI.ROLES.engineer={weapon:'rifle',speed:2.65,visionRange:140,engageRange:130,hp:100};var c=root.SquadAI.COMPOSITION;if(c.indexOf('engineer')<0)for(var i=c.length-1;i>=0;i--)if(c[i]==='rifleman'){c[i]='engineer';break;}}

  function installUi(){
    if(typeof document==='undefined'||document.getElementById('usDefenderToggle'))return;
    var usTag=document.querySelector('.tag.us'),geTag=document.querySelector('.tag.ge');if(!usTag||!geTag)return;
    var st=document.createElement('style');st.textContent='.defender-toggle{display:inline-flex;align-items:center;gap:3px;margin-left:8px;color:#9da58f;font-size:10px}.defender-toggle input{margin:0;accent-color:#8a9b61}.defender-toggle.locked{opacity:.45}';document.head.appendChild(st);
    function add(tag,id){var l=document.createElement('label');l.className='defender-toggle';l.title='Deploy this faction as prepared defender';var i=document.createElement('input');i.type='checkbox';i.id=id;i.setAttribute('aria-label','Defender');l.appendChild(i);l.appendChild(document.createTextNode('Defender'));tag.parentNode.insertBefore(l,tag.nextSibling);return i;}
    var us=add(usTag,'usDefenderToggle'),ge=add(geTag,'geDefenderToggle');
    function selected(){return us.checked?'us':ge.checked?'ge':null;}
    function changed(which){if(which===us&&us.checked)ge.checked=false;if(which===ge&&ge.checked)us.checked=false;root.BATTLE_DEFENDER=selected();var b=root.__battle__;if(b&&b.paused){b._defenderChoice=root.BATTLE_DEFENDER;b.restart();b.pause();console.log('[SIDES] defender='+String(root.BATTLE_DEFENDER||'meeting'));}}
    us.addEventListener('change',function(){changed(us);});ge.addEventListener('change',function(){changed(ge);});var start=document.getElementById('startBtn');if(start)start.addEventListener('click',function(){us.disabled=ge.disabled=true;us.parentNode.classList.add('locked');ge.parentNode.classList.add('locked');},true);root.BATTLE_DEFENDER=selected();
  }

  var sharedMat=null;
  function material(scene){if(typeof BABYLON==='undefined')return null;if(sharedMat&&sharedMat.getScene&&sharedMat.getScene()===scene)return sharedMat;sharedMat=new BABYLON.StandardMaterial('defenseWorkMat',scene);sharedMat.specularColor=BABYLON.Color3.Black();sharedMat.ambientColor=new BABYLON.Color3(1,1,1);return sharedMat;}
  function paint(mesh,rgb){var n=mesh.getTotalVertices(),d=new Float32Array(n*4);for(var i=0;i<n;i++){d[i*4]=rgb[0];d[i*4+1]=rgb[1];d[i*4+2]=rgb[2];d[i*4+3]=1;}mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,d);return mesh;}
  function slab(scene,w,h,d,x,y,z,yaw,rgb){var m=BABYLON.MeshBuilder.CreateBox('defense-work',{width:w,height:h,depth:d},scene);m.position.set(x,y+h/2,z);m.rotation.y=yaw;m.bakeCurrentTransformIntoVertices();return paint(m,rgb);}
  function renderWork(sim,work){
    if(typeof BABYLON==='undefined'||!sim.scene||!work.render)return;
    var r=work.render,rgb=COLORS[work.type]||[.5,.45,.35],parts=[],dx=Math.sin(r.ang),dz=Math.cos(r.ang),visualYaw=r.ang+Math.PI/2,i,t,x,z;
    /* Planner yaw is measured along the prepared-work line from +Z. Babylon boxes are elongated
       along local X, so using planner yaw directly turns every slab ninety degrees across its own
       obstacle/post line. Keep the planner geometry untouched and rotate only the visual slab. */
    if(r.shape==='arc'){
      for(i=-1;i<=1;i++){t=i*r.len*.32;x=work.x+dx*t;z=work.z+dz*t;parts.push(slab(sim.scene,1.5,r.height,.8,x,sim.heightAt(x,z),z,visualYaw+i*.28,rgb));}
    }else{
      var steps=Math.max(2,Math.round(r.len/2.4));
      for(i=0;i<=steps;i++){t=(i/steps-.5)*r.len;x=work.x+dx*t;z=work.z+dz*t;parts.push(slab(sim.scene,2.2,r.height,work.type==='wire'?.25:.7,x,sim.heightAt(x,z),z,visualYaw,rgb));}
    }
    var mesh=parts.length>1?BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false):parts[0];if(mesh){mesh.material=material(sim.scene);mesh.isPickable=false;if(mesh.freezeWorldMatrix)mesh.freezeWorldMatrix();(sim._defenseMeshes||(sim._defenseMeshes=[])).push(mesh);}
  }
  function addWork(sim,work){(work.obstacles||[]).forEach(function(o){o.defenseWork=work.id;o.workType=work.type;sim.obstacles.push(o);});sim.obstacles.__battleField=null;renderWork(sim,work);}
  function clearWorks(sim){if(!sim)return;if(sim.obstacles)for(var i=sim.obstacles.length-1;i>=0;i--)if(sim.obstacles[i]&&sim.obstacles[i].defenseWork)sim.obstacles.splice(i,1);if(sim.obstacles)sim.obstacles.__battleField=null;(sim._defenseMeshes||[]).forEach(function(m){try{m.dispose();}catch(_){}});sim._defenseMeshes=[];}

  function augmentPosts(plan,sides){var serial=0;(plan.works||[]).forEach(function(work){if(work.type==='wire')return;var e=plan.bySector[work.objectiveId];if(!e)return;(work.obstacles||[]).forEach(function(o){if((o.cover==null?1:+o.cover)>=.95)return;var f=root.BattleSides.tacticalFrame(sides,o),back=(+o.radius||1)+.9,p={id:work.id+'-v'+(++serial),workId:work.id,type:work.type,objectiveId:work.objectiveId,sectorId:work.sectorId,x:o.x+f.approach.x*back,z:o.z+f.approach.z*back,yaw:f.facingYaw,weapon:null,claim:null};plan.posts.push(p);e.posts.push(p);});});if(plan.stats)plan.stats.posts=plan.posts.length;}
  function samePoint(a,b){return a&&b&&Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0))<.25;}
  function setPreparedPost(s,p){if(!s||!p||samePoint(s._preparedDefensePost,p))return;s._preparedDefensePost={x:p.x,z:p.z};}
  function claim(sim,sq,s,sector,plan){if(s._planPost&&s._planPost.objectiveId===sector.objectiveId){root.BattleDefensePlan.holdPost(s._planPost,s,sim);setPreparedPost(s,s._planPost);return s._planPost;}var p=root.BattleDefensePlan.claimPost(plan,s,sim,{objectiveId:sector.objectiveId,maxRange:250});if(p)setPreparedPost(s,p);return p;}
  function garrison(sim,sq,sector,plan,teleport){
    var point={x:sector.x,z:sector.z},frame=root.BattleSides.tacticalFrame(sim._sides,point),center=root.BattleSides.offsetPoint(point,frame,sector.radius*.30,0);
    sq._strategicDefenseObjective=sector.objectiveId;sq.garrisonObjective=sector.objectiveId;sq._preparedDefenseRequest={objectiveId:sector.objectiveId,point:copy(point),anchor:copy(center),requestedAt:+(sim.time||0),reason:'prepared garrison'};
    /* Initial placement is setup, outside the normal live ownership path. Runtime garrisons only
       publish the request/post constraints below; Force Command and Squad Stability apply them. */
    if(teleport){sq.commandRole='garrison';sq.commandPhase='defend';sq.targetObjective=sector.objectiveId;sq.objective=copy(point);sq.home=root.BattleSides.offsetPoint(point,frame,sector.radius*2.4,0);sq.route=[copy(center)];sq.routeIndex=0;sq.orderAnchor=copy(center);sq.rally=copy(center);sq._orderGoal=null;sq._formationForward={x:frame.front.x,z:frame.front.z};sq._stablePlan=null;sq._stablePlanSerial=(sq._stablePlanSerial||0)+1;sq._fireteamOrders={};}
    var alive=(sq.members||[]).filter(function(s){return!s.dead;});for(var i=0;i<alive.length;i++){var s=alive[i],post=claim(sim,sq,s,sector,plan);if(!post){var lat=(i-(alive.length-1)/2)*3.2;post={x:center.x+frame.left.x*lat,z:center.z+frame.left.z*lat,yaw:frame.facingYaw};setPreparedPost(s,post);}if(teleport&&s.root){s._fireteamDestination={x:post.x,z:post.z};s.orderDestination={x:post.x,z:post.z};s.root.position.x=post.x;s.root.position.z=post.z;s.root.position.y=sim.heightAt(post.x,post.z);s.root.rotation.y=post.yaw==null?frame.facingYaw:post.yaw;s.destination={x:post.x,z:post.z};s._navCache=null;if(root.BattleEngagement)root.BattleEngagement.resetSoldier(s);}}
  }
  function deploy(sim,sides){var held=sides.heldSectors.slice().sort(function(a,b){return b.terrainValue-a.terrainValue;});if(!held.length)return 0;var squads=sim.factions[sides.defender].squads||[],plan=sim._defensePlans[sides.defender];for(var i=0;i<squads.length;i++)garrison(sim,squads[i],held[i%held.length],plan,true);return squads.length;}
  function seedOwnership(sim,sides){var api=root.BattleObjectiveSystem;if(!api)return;(sim._objectives||[]).forEach(function(o){if(o.state){o.state.owner=null;o.state.active=null;o.state.lastActive=null;o.state.progress=0;o.state.phase='neutral';}});sides.heldSectors.forEach(function(s){var o=api.get(sim,s.objectiveId);if(o&&o.state){o.state.owner=sides.defender;o.state.phase='held';}});if(api.tick)api.tick(sim,0);}

  function runtimeFrame(sim,faction,obj){var scenario=scenarioOf(sim),point={x:+obj.def.x||0,z:+obj.def.z||0};if(sim._sides&&!sim._sides.meeting&&sim._sides.attacker===root.BattleSides.other(faction))return root.BattleSides.tacticalFrame(sim._sides,point);var enemy=root.BattleSides.spawnPoint(scenario,root.BattleSides.other(faction)),dx=point.x-enemy.x,dz=point.z-enemy.z,l=Math.hypot(dx,dz)||1;return{approach:{x:dx/l,z:dz/l},front:{x:-dx/l,z:-dz/l},left:{x:-dz/l,z:dx/l},facingYaw:Math.atan2(-dx/l,-dz/l),acrossYaw:Math.atan2(-dz/l,dx/l)};}
  function buildRuntime(sim,faction,obj,type,count){var frame=runtimeFrame(sim,faction,obj),p={x:+obj.def.x||0,z:+obj.def.z||0},r=+obj.def.radius||30,lat=((count%3)-1)*r*.22,site={x:p.x+frame.front.x*r*.48+frame.left.x*lat,z:p.z+frame.front.z*r*.48+frame.left.z*lat},sector=root.BattleSides.sectorFor(sim._sides,obj.id)||{id:'runtime-'+obj.id,objectiveId:obj.id,role:'main'},work={id:'eng-'+faction+'-'+obj.id+'-'+(count+1),type:type,x:site.x,z:site.z,ang:frame.acrossYaw,len:type==='sandbags'?6:6,objectiveId:obj.id,sectorId:sector.id,sectorRole:sector.role};root.BattleDefensePlan.materialise({heightAt:sim.heightAt,frameFor:function(){return frame;}},work);var plan=sim._defensePlans[faction]||(sim._defensePlans[faction]=root.BattleDefensePlan.empty(faction));root.BattleDefensePlan.register(plan,work,sector);addWork(sim,work);augmentPosts(plan,sim._sides);return work;}
  function engineerTick(sim,dt){var groups={},objs=sim._objectives||[];['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){if(s.dead||s.role!=='engineer'||!s.root||s.suppressedUntil>sim.time||s.squad&&s.squad.inContact)return;for(var i=0;i<objs.length;i++){var o=objs[i],st=status(sim,o);if(!st||st.owner!==f)continue;var p={x:+o.def.x||0,z:+o.def.z||0},r=+o.def.radius||30;if(dist(s.root.position,p)>r*.78)continue;var key=f+'|'+o.id;if(!groups[key])groups[key]={faction:f,obj:o,engineer:s};break;}});});var state=sim._engineerBuild||(sim._engineerBuild={progress:{},counts:{}});Object.keys(groups).forEach(function(key){var g=groups[key],count=state.counts[key]||0;if(count>=MAX_RUNTIME)return;state.progress[key]=(state.progress[key]||0)+dt;if(state.progress[key]<BUILD_SECONDS)return;state.progress[key]=0;var type=count%2?'foxholes':'sandbags',work=buildRuntime(sim,g.faction,g.obj,type,count);state.counts[key]=count+1;var sector=root.BattleSides.sectorFor(sim._sides,g.obj.id)||{id:'runtime-'+g.obj.id,objectiveId:g.obj.id,x:+g.obj.def.x||0,z:+g.obj.def.z||0,radius:+g.obj.def.radius||30,role:'main'};if(g.engineer.squad)garrison(sim,g.engineer.squad,sector,sim._defensePlans[g.faction],false);telemetry(sim,'engineer-fortification-built',{faction:g.faction,objective:g.obj.id,engineer:g.engineer.id,type:type,work:work.id});});}

  /* Route allocation runs before this module's battle-start hook. Clearing commandRole here used
     to erase every non-defender's Force Command role in a meeting engagement, producing the
     misleading "missing role" health signal and leaving targetless squads with no recovery
     context. Prepared deployment overwrites defender roles explicitly in garrison(). */
  function clearState(sim){if(!sim)return;if(sim._defensePlan)root.BattleDefensePlan.resetClaims(sim._defensePlan);clearWorks(sim);['us','ge'].forEach(function(f){(sim.factions&&sim.factions[f]&&sim.factions[f].squads||[]).forEach(function(sq){sq._strategicDefenseObjective=null;sq._preparedDefenseRequest=null;(sq.members||[]).forEach(function(s){root.BattleDefensePlan.releasePost(s);s._preparedDefensePost=null;});});});sim._sides=null;sim._defensePlan=null;sim._defensePlans=null;sim._engineerBuild=null;}
  function apply(sim){clearState(sim);ensureEngineer();var scenario=scenarioOf(sim),defender=defenderOf(sim),sides=root.BattleSides.build(scenario,{defender:defender}),plan=root.BattleDefensePlan.build(scenario,sides,{heightAt:sim.heightAt,obstacles:sim.obstacles});sim._sides=sides;sim._defensePlan=plan;sim._defensePlans={us:root.BattleDefensePlan.empty('us'),ge:root.BattleDefensePlan.empty('ge')};if(defender)sim._defensePlans[defender]=plan;if(sim.scene&&sim.scene.metadata){sim.scene.metadata.battleSides=sides;sim.scene.metadata.battleDefender=defender;}if(!defender)return plan;augmentPosts(plan,sides);plan.works.forEach(function(w){addWork(sim,w);});seedOwnership(sim,sides);var n=deploy(sim,sides);telemetry(sim,'defense-plan',{defender:defender,commander:sides.commander,sectors:sides.heldSectors.map(function(s){return s.objectiveId+':'+s.role;}),works:plan.works.length,posts:plan.posts.length,squadsDeployed:n});console.log('[DEFENSE] '+root.BattleSides.summary(sides)+' · '+plan.works.length+' works · '+plan.posts.length+' posts');return plan;}
  function setDefender(sim,faction){var f=faction==='us'||faction==='ge'?faction:null;root.BATTLE_DEFENDER=f;if(sim)sim._defenderChoice=f;if(sim&&sim.scene&&sim.scene.metadata)sim.scene.metadata.battleDefender=f;if(sim&&sim.time>0&&!sim.paused)return{applied:false,reason:'battle running; applies on restart'};if(sim){sim.restart();sim.pause();return{applied:true,sides:sim._sides};}return{applied:false,reason:'no battle'};}

  root.BattleModules.registerSystem(SYSTEM,{version:'64-defense-render-axis',beforeBattleRestart:function(sim){clearState(sim);},onBattleStart:function(sim){apply(sim);},onBattleRestart:function(sim){apply(sim);},onCommanderTick:function(sim,p){engineerTick(sim,p&&p.dt||.45);}});
  root.BattleDefenseWorks={apply:apply,setDefender:setDefender,defenderOf:function(sim){return sim&&sim._sides?sim._sides.defender:null;},planOf:function(sim,f){return sim&&sim._defensePlans?sim._defensePlans[f]:null;}};
  root.BattleDefenderStratagem={setDefender:function(f){return setDefender(root.__battle__,f);},scheme:function(sim){return sim&&sim._sides||null;}};
  ensureEngineer();installUi();console.log('[DEFENSE] terrain-aware defender + engineers loaded');
})(typeof window!=='undefined'?window:globalThis);

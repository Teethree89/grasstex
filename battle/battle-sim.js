/* Battle Sim core for the ww2fps AI/units laboratory.
   Owns terrain, initial infantry force, deterministic stepping, movement, combat FX and audio
   hooks. Tactical command/objectives/extra unit types are separate modules. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  var FIELD_W=360,FIELD_D=280,SPAWN_Z=110,LANES=[-140,-70,0,70,140];
  var AI_TICK=.15,DEFAULT_TIME_LIMIT=420,SUB_X=100,SUB_Z=78,GRIDX=SUB_X+1,GRIDZ=SUB_Z+1,gridH=null;

  function landscapeHeight(x,z){return Math.sin(x*.018)*2.4+Math.cos(z*.021)*1.8+Math.sin((x+z)*.015)*1.1+Math.sin(x*.05-z*.04)*.5;}
  function sampleAt(x,z){
    if(!gridH)return landscapeHeight(x,z);
    var cellW=FIELD_W/SUB_X,cellD=FIELD_D/SUB_Z,fcol=(x+FIELD_W/2)/cellW,i=Math.floor(fcol),u=fcol-i,frow=(FIELD_D/2-z)/cellD,j=Math.floor(frow),v=frow-j;
    if(i<0||j<0||i>=SUB_X||j>=SUB_Z)return landscapeHeight(x,z);
    var k=i+j*GRIDX,hC=gridH[k],hB=gridH[k+1],hD=gridH[k+GRIDX],hA=gridH[k+GRIDX+1];
    return u>=v?hC+u*(hB-hC)+v*(hA-hB):hC+v*(hD-hC)+u*(hA-hD);
  }

  function buildTerrain(scene){
    var ground=BABYLON.MeshBuilder.CreateGround('battleField',{width:FIELD_W,height:FIELD_D,subdivisionsX:SUB_X,subdivisionsY:SUB_Z,updatable:true},scene);
    var pos=ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);gridH=new Float32Array(GRIDX*GRIDZ);
    for(var i=0;i<pos.length;i+=3){var h=landscapeHeight(pos[i],pos[i+2]);pos[i+1]=h;gridH[i/3]=h;}
    ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos);
    var normals=[];BABYLON.VertexData.ComputeNormals(pos,ground.getIndices(),normals);ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind,normals);
    var mat=new BABYLON.StandardMaterial('battleFieldMat',scene);mat.specularColor=BABYLON.Color3.Black();
    var base=root.BATTLE_ASSET_BASE||'https://test.ivandpopov.com/grasstex/Assets/';
    var dirt=new BABYLON.Texture(base+'dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;dirt.uScale=FIELD_W/9;dirt.vScale=FIELD_D/9;dirt.anisotropicFilteringLevel=4;
    mat.diffuseTexture=dirt;mat.diffuseColor=new BABYLON.Color3(.62,.72,.48);ground.material=mat;ground.receiveShadows=true;ground.isPickable=false;return ground;
  }

  function buildSky(scene){
    var radius=500,offset=.110;
    BABYLON.Effect.ShadersStore.battleSkyDomeVertexShader='precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDir;void main(){vDir=position;gl_Position=worldViewProjection*vec4(position,1.0);}';
    BABYLON.Effect.ShadersStore.battleSkyDomeFragmentShader='precision highp float;varying vec3 vDir;uniform sampler2D skyTexture;void main(){vec3 d=normalize(vDir);float lon=atan(d.z,d.x);float lat=acos(clamp(d.y,-1.0,1.0));float s=lon/(2.0*3.14159265359)+0.5;float t=lat/3.14159265359;gl_FragColor=vec4(texture2D(skyTexture,vec2(s,t)).rgb,1.0);}';
    var sky=BABYLON.MeshBuilder.CreateSphere('battleSkyDome',{diameter:radius*2,segments:24},scene);sky.infiniteDistance=true;sky.isPickable=false;sky.applyFog=false;
    var mat=new BABYLON.ShaderMaterial('battleSkyDomeMat',scene,{vertex:'battleSkyDome',fragment:'battleSkyDome'},{attributes:['position'],uniforms:['worldViewProjection'],samplers:['skyTexture']});mat.backFaceCulling=false;mat.disableDepthWrite=true;
    var base=root.BATTLE_ASSET_BASE||'https://test.ivandpopov.com/grasstex/Assets/';mat.setTexture('skyTexture',new BABYLON.Texture(base+'skytex.png',scene,false,false,BABYLON.Texture.BILINEAR_SAMPLINGMODE));sky.material=mat;sky.position.y=radius*Math.sin(Math.PI*offset);return sky;
  }

  var flashMat=null,tracerMat=null;
  function fx(scene){if(!flashMat){flashMat=new BABYLON.StandardMaterial('muzzleFlashMat',scene);flashMat.emissiveColor=new BABYLON.Color3(1,.85,.4);flashMat.disableLighting=true;}if(!tracerMat){tracerMat=new BABYLON.StandardMaterial('tracerMat',scene);tracerMat.emissiveColor=new BABYLON.Color3(1,.95,.7);tracerMat.disableLighting=true;}}
  function spawnMuzzleFlash(scene,pos){fx(scene);var m=BABYLON.MeshBuilder.CreateSphere('flash',{diameter:.22,segments:4},scene);m.position.copyFrom(pos);m.material=flashMat;m.isPickable=false;setTimeout(function(){m.dispose();},60);}
  function spawnTracer(scene,from,to){fx(scene);var l=BABYLON.MeshBuilder.CreateLines('tracer',{points:[from,to]},scene);l.color=new BABYLON.Color3(1,.95,.7);l.isPickable=false;setTimeout(function(){l.dispose();},90);}
  function muzzleWorld(soldier){var w=soldier.weapon,local=BABYLON.Vector3.FromArray(w.muzzleLocal);return BABYLON.Vector3.TransformCoordinates(local,w.mesh.getWorldMatrix());}

  var POOL_SIZE=6,SFX_FILES={rifle:'rifle.mp3',carbine:'carbine.mp3',lmg:'lmg.mp3',pistol:'pistol.mp3'};
  function buildWeaponAudio(scene,audioBase){
    var pools={},cursors={};Object.keys(SFX_FILES).forEach(function(kind){var voices=[];for(var i=0;i<POOL_SIZE;i++)voices.push(new BABYLON.Sound(kind+'Sfx'+i,audioBase+SFX_FILES[kind],scene,null,{spatialSound:true,distanceModel:'linear',maxDistance:145,rolloffFactor:1.5,volume:.20,autoplay:false}));pools[kind]=voices;cursors[kind]=0;});
    return {play:function(kind,position,gain,rate){var voices=pools[kind];if(!voices)return;var voice=voices[cursors[kind]];cursors[kind]=(cursors[kind]+1)%voices.length;try{voice.setPosition(position);if(voice.setVolume)voice.setVolume(gain==null?.18:gain);if(voice.setPlaybackRate)voice.setPlaybackRate(rate||1);voice.play();}catch(_){}}};
  }

  function makeFaction(){return {alive:0,kills:0,squads:[]};}
  function BattleSim(scene,opts){
    opts=opts||{};this.scene=scene;this.heightAt=sampleAt;this.obstacles=opts.obstacles||[];this.time=0;this.timeScale=opts.timeScale||1.5;this.timeLimit=opts.timeLimit||DEFAULT_TIME_LIMIT;this.paused=false;this.winner=null;
    this.factions={us:makeFaction(),ge:makeFaction()};this._roster={us:[],ge:[]};this._moduleUnits=[];this._aiAccum=0;this._disposables=[];
    this.onFire=null;this.onShot=null;this.onCallout=null;this.onWinner=opts.onWinner||null;this.onUpdate=opts.onUpdate||null;
    var self=this;this._renderObserver=scene.onBeforeRenderObservable.add(function(){self._frame();});this.spawnAll();
  }
  BattleSim.prototype.rosterOf=function(faction){return this._roster[faction];};
  BattleSim.prototype.killSoldier=function(soldier,killer){if(soldier.dead)return;BattleSoldierModel.kill(soldier);soldier.hp=0;soldier.target=null;this.factions[soldier.faction].alive--;if(killer)this.factions[killer.faction].kills++;if(soldier.role==='captain'){soldier.squad.captainAlive=false;soldier.squad.accuracyMultiplier=.8;}};

  BattleSim.prototype.spawnAll=function(){
    var scene=this.scene;this.factions={us:makeFaction(),ge:makeFaction()};this._roster={us:[],ge:[]};this._moduleUnits=[];this.time=0;this.winner=null;this._aiAccum=0;var nextId=0,self=this;
    function spawnSide(faction,z,facingObjectiveZ){
      for(var li=0;li<LANES.length;li++){
        var laneX=LANES[li],home={x:laneX,z:z},objective={x:laneX,z:facingObjectiveZ},squad=SquadAI.createSquad(faction+'-'+li,faction,home,objective);
        for(var si=0;si<SquadAI.COMPOSITION.length;si++){
          var role=SquadAI.COMPOSITION[si],jx=laneX+(Math.random()-.5)*8,jz=z+(Math.random()-.5)*6,model=BattleSoldierModel.createSoldier(scene,faction,role,null);
          model.root.position.set(jx,sampleAt(jx,jz),jz);model.root.rotation.y=facingObjectiveZ>z?0:Math.PI;
          var weapon=BattleWeapons.attachWeapon(scene,model.weaponSocket,SquadAI.ROLES[role].weapon),soldier=SquadAI.createSoldier({id:nextId++,faction:faction,role:role,squad:squad,slotIndex:si,model:model,weapon:weapon});
          soldier.unitType='infantry';soldier.captureWeight=1;soldier.scoreValue=1;squad.members.push(soldier);self._roster[faction].push(soldier);self.factions[faction].alive++;
        }
        self.factions[faction].squads.push(squad);
      }
    }
    spawnSide('us',-SPAWN_Z,SPAWN_Z);spawnSide('ge',SPAWN_Z,-SPAWN_Z);
  };
  BattleSim.prototype.restart=function(){
    if(root.BattleModules)root.BattleModules.runHook('beforeBattleRestart',this,{});
    var all=this._roster.us.concat(this._roster.ge);for(var i=0;i<all.length;i++)all[i].root.dispose();this.spawnAll();
  };
  BattleSim.prototype.setTimeScale=function(v){this.timeScale=Math.max(0,+v||0);};BattleSim.prototype.pause=function(){this.paused=true;};BattleSim.prototype.resume=function(){this.paused=false;};

  var AVOID_LOOKAHEAD=1.8,AVOID_MARGIN=.5;
  function steerAroundObstacles(obstacles,x,z,dirx,dirz){
    if(!obstacles||!obstacles.length)return null;var lookX=x+dirx*AVOID_LOOKAHEAD,lookZ=z+dirz*AVOID_LOOKAHEAD,pushX=0,pushZ=0,any=false;
    for(var i=0;i<obstacles.length;i++){var ob=obstacles[i],dxo=lookX-ob.x,dzo=lookZ-ob.z,r=ob.radius+AVOID_MARGIN,dSq=dxo*dxo+dzo*dzo;if(dSq>=r*r)continue;any=true;var d=Math.sqrt(dSq)||.001;pushX+=dxo/d;pushZ+=dzo/d;}
    if(!any)return null;var nx=dirx+pushX*.9,nz=dirz+pushZ*.9,len=Math.hypot(nx,nz);return len>1e-4?{x:nx/len,z:nz/len}:null;
  }
  function stepMovement(self,soldier,dt){
    if(soldier.dead)return;soldier.fireCooldown=Math.max(0,soldier.fireCooldown-dt);
    var dx=soldier.destination.x-soldier.root.position.x,dz=soldier.destination.z-soldier.root.position.z,d=Math.hypot(dx,dz),wantCrouch=!soldier.prone&&((soldier.suppressedUntil>self.time)||(!!soldier.target&&d<=.6));
    var desiredSpeed=(d>.35&&!soldier.prone)?soldier.speed*(wantCrouch?.58:1):0,cur=soldier.moveSpeed||0,rate=desiredSpeed>cur?4.2:6.5;
    soldier.moveSpeed=Math.max(0,cur+Math.max(-rate*dt,Math.min(rate*dt,desiredSpeed-cur)));
    function turnToward(yaw){var diff=Math.atan2(Math.sin(yaw-soldier.root.rotation.y),Math.cos(yaw-soldier.root.rotation.y)),maxTurn=(soldier.prone?1.1:2.8)*dt;soldier.root.rotation.y+=Math.max(-maxTurn,Math.min(maxTurn,diff));}
    if(d>.35&&soldier.moveSpeed>.025&&!soldier.prone){
      var dirx=dx/d,dirz=dz/d,steered=steerAroundObstacles(self.obstacles,soldier.root.position.x,soldier.root.position.z,dirx,dirz);if(steered){dirx=steered.x;dirz=steered.z;}
      var step=Math.min(d,soldier.moveSpeed*dt),nx=soldier.root.position.x+dirx*step,nz=soldier.root.position.z+dirz*step;soldier.root.position.x=nx;soldier.root.position.z=nz;soldier.root.position.y=self.heightAt(nx,nz);turnToward(Math.atan2(dirx,dirz));soldier.moving=true;
    }else{soldier.moving=false;if(soldier.target){var tx=soldier.target.root.position.x-soldier.root.position.x,tz=soldier.target.root.position.z-soldier.root.position.z;if(Math.abs(tx)+Math.abs(tz)>1e-4)turnToward(Math.atan2(tx,tz));}}
    if(wantCrouch!==soldier.crouching)BattleSoldierModel.setCrouch(soldier,wantCrouch);if(BattleSoldierModel.setProne)BattleSoldierModel.setProne(soldier,!!soldier.prone);BattleSoldierModel.animateWalk(soldier,dt,soldier.speed>0?soldier.moveSpeed/soldier.speed:0);
  }

  BattleSim.prototype._frame=function(forcedDt){
    if(this.paused||this.winner)return;
    var dt=forcedDt==null?this.scene.getEngine().getDeltaTime()/1000*this.timeScale:+forcedDt;if(!(dt>0))return;dt=Math.min(dt,.25);this.time+=dt;
    var us=this._roster.us,ge=this._roster.ge,i;for(i=0;i<us.length;i++)stepMovement(this,us[i],dt);for(i=0;i<ge.length;i++)stepMovement(this,ge[i],dt);
    this._aiAccum+=dt;
    while(this._aiAccum>=AI_TICK&&!this.winner){
      this._aiAccum-=AI_TICK;var f=this.factions,squadsUs=f.us.squads,squadsGe=f.ge.squads;
      for(i=0;i<squadsUs.length;i++)SquadAI.updateSquad(squadsUs[i]);for(i=0;i<squadsGe.length;i++)SquadAI.updateSquad(squadsGe[i]);
      for(i=0;i<us.length;i++)SquadAI.updateSoldier(us[i],this);for(i=0;i<ge.length;i++)SquadAI.updateSoldier(ge[i],this);
      this._checkWinner();if(this.onUpdate)this.onUpdate(this);
    }
    if(root.BattleModules)root.BattleModules.runHook('onSimulationStep',this,{dt:dt});
  };
  BattleSim.prototype.step=function(dt){this._frame(+dt||AI_TICK);};
  BattleSim.prototype._checkWinner=function(){if(this.winner)return;var us=this.factions.us.alive,ge=this.factions.ge.alive,timeUp=this.time>=this.timeLimit;if(us<=0||ge<=0||timeUp){this.winner=us===ge?'draw':(us>ge?'us':'ge');if(this.onWinner)this.onWinner(this.winner,this);}};

  BattleSim.prototype._wireFx=function(audioBase){
    var self=this,audio=buildWeaponAudio(this.scene,audioBase||'audio/');
    this.onFire=function(soldier){var pos=muzzleWorld(soldier);spawnMuzzleFlash(self.scene,pos);if(root.BattleAudioScheduler)root.BattleAudioScheduler.enqueue(audio,soldier.weapon.kind,pos,self.scene.activeCamera);else audio.play(soldier.weapon.kind,pos,.18,1);};
    this.onCallout=function(soldier,type){if(root.BattleVoiceScheduler)root.BattleVoiceScheduler.enqueue(soldier,type,self.scene.activeCamera);};
    this.onShot=function(shooter,target,hit){if(!hit)return;spawnTracer(self.scene,muzzleWorld(shooter),target.root.position.add(new BABYLON.Vector3(0,1.2,0)));};
  };
  function start(scene,opts){opts=opts||{};var sim=new BattleSim(scene,opts);sim._wireFx(opts.audioBase);return sim;}

  root.BattleSim={FIELD_W:FIELD_W,FIELD_D:FIELD_D,heightAt:sampleAt,buildTerrain:buildTerrain,buildSky:buildSky,start:start,AI_TICK:AI_TICK};
})(typeof window!=='undefined'?window:globalThis);

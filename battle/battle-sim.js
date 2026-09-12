/* Battle sim orchestrator: builds a small rolling-terrain field (the same landscape formula
   terrain-demo.js uses, at a scale that suits a battle instead of a grass-density demo),
   spawns five 10-soldier squads per side (see squad-ai.js COMPOSITION) on opposite edges,
   and runs the render/AI loop that drives them into each other. battle_sim.html owns the
   engine/scene/camera/lights and the HUD markup; this file owns everything that happens
   once those exist.

   Load order: soldier.js, weapons.js, squad-ai.js, then this file. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  var FIELD_W=360,FIELD_D=280,SPAWN_Z=110;
  var LANES=[-140,-70,0,70,140]; // one squad per lane, mirrored on both spawn edges
  var AI_TICK=0.15,DEFAULT_TIME_LIMIT=420; // seconds of sim time before the timer decides it

  /* Same shape of formula as terrain-demo.js's landscapeHeight, retuned for a field a third
     the size: gentle enough that a rifleman never disappears entirely, pronounced enough
     that hasLineOfSight in squad-ai.js has hills worth blocking. */
  function heightAt(x,z){
    return Math.sin(x*.018)*2.4+Math.cos(z*.021)*1.8+Math.sin((x+z)*.015)*1.1+Math.sin(x*.05-z*.04)*.5;
  }

  function buildTerrain(scene){
    var SUB_X=100,SUB_Z=78;
    var ground=BABYLON.MeshBuilder.CreateGround('battleField',{width:FIELD_W,height:FIELD_D,subdivisions:{w:SUB_X,h:SUB_Z}},scene);
    var pos=ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for(var i=0;i<pos.length;i+=3)pos[i+1]=heightAt(pos[i],pos[i+2]);
    ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos);
    var normals=[];BABYLON.VertexData.ComputeNormals(pos,ground.getIndices(),normals);
    ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind,normals);
    var mat=new BABYLON.StandardMaterial('battleFieldMat',scene);
    mat.diffuseColor=new BABYLON.Color3(.30,.36,.20);mat.specularColor=BABYLON.Color3.Black();
    ground.material=mat;ground.receiveShadows=true;ground.isPickable=false;
    return ground;
  }

  // ---------- transient combat FX: cheap, disposed almost immediately ----------
  var flashMat=null,tracerMat=null;
  function fx(scene){
    if(!flashMat){flashMat=new BABYLON.StandardMaterial('muzzleFlashMat',scene);flashMat.emissiveColor=new BABYLON.Color3(1,.85,.4);flashMat.disableLighting=true;}
    if(!tracerMat){tracerMat=new BABYLON.StandardMaterial('tracerMat',scene);tracerMat.emissiveColor=new BABYLON.Color3(1,.95,.7);tracerMat.disableLighting=true;}
  }
  function spawnMuzzleFlash(scene,pos){
    fx(scene);
    var m=BABYLON.MeshBuilder.CreateSphere('flash',{diameter:.22,segments:4},scene);
    m.position.copyFrom(pos);m.material=flashMat;m.isPickable=false;
    setTimeout(function(){m.dispose();},60);
  }
  function spawnTracer(scene,from,to){
    fx(scene);
    var l=BABYLON.MeshBuilder.CreateLines('tracer',{points:[from,to]},scene);
    l.color=new BABYLON.Color3(1,.95,.7);l.isPickable=false;
    setTimeout(function(){l.dispose();},90);
  }
  function muzzleWorld(soldier){
    var w=soldier.weapon,local=BABYLON.Vector3.FromArray(w.muzzleLocal);
    return BABYLON.Vector3.TransformCoordinates(local,w.mesh.getWorldMatrix());
  }

  function makeFaction(){return {alive:0,kills:0,squads:[]};}

  function BattleSim(scene,opts){
    opts=opts||{};
    this.scene=scene;
    this.heightAt=heightAt;
    this.time=0;this.timeScale=opts.timeScale||1.5;this.timeLimit=opts.timeLimit||DEFAULT_TIME_LIMIT;
    this.paused=false;this.winner=null;
    this.factions={us:makeFaction(),ge:makeFaction()};
    this._roster={us:[],ge:[]};
    this._aiAccum=0;
    this._disposables=[];
    this.onFire=null;this.onShot=null;this.onWinner=opts.onWinner||null;this.onUpdate=opts.onUpdate||null;
    var self=this;
    this._renderObserver=scene.onBeforeRenderObservable.add(function(){self._frame();});
    this.spawnAll();
  }

  BattleSim.prototype.rosterOf=function(faction){return this._roster[faction];};

  BattleSim.prototype.killSoldier=function(soldier,killer){
    if(soldier.dead)return;
    BattleSoldierModel.kill(soldier);
    soldier.hp=0;soldier.target=null;
    this.factions[soldier.faction].alive--;
    if(killer)this.factions[killer.faction].kills++;
    if(soldier.role==='captain'){soldier.squad.captainAlive=false;soldier.squad.accuracyMultiplier=0.8;}
  };

  BattleSim.prototype.spawnAll=function(){
    var scene=this.scene;
    this.factions={us:makeFaction(),ge:makeFaction()};
    this._roster={us:[],ge:[]};
    this.time=0;this.winner=null;
    var nextId=0;
    var self=this;
    function spawnSide(faction,z,facingObjectiveZ){
      for(var li=0;li<LANES.length;li++){
        var laneX=LANES[li];
        var home={x:laneX,z:z},objective={x:laneX,z:facingObjectiveZ};
        var squad=SquadAI.createSquad(faction+'-'+li,faction,home,objective);
        for(var si=0;si<SquadAI.COMPOSITION.length;si++){
          var role=SquadAI.COMPOSITION[si];
          var jitterX=laneX+(Math.random()-.5)*8,jitterZ=z+(Math.random()-.5)*6;
          var parent=null; // world space; soldier.js's TransformNode is enough on its own
          var model=BattleSoldierModel.createSoldier(scene,faction,role,parent);
          model.root.position.set(jitterX,heightAt(jitterX,jitterZ),jitterZ);
          model.root.rotation.y=facingObjectiveZ>z?0:Math.PI;
          var weapon=BattleWeapons.attachWeapon(scene,model.weaponSocket,SquadAI.ROLES[role].weapon);
          var soldier=SquadAI.createSoldier({id:nextId++,faction:faction,role:role,squad:squad,slotIndex:si,model:model,weapon:weapon});
          squad.members.push(soldier);
          self._roster[faction].push(soldier);
          self.factions[faction].alive++;
        }
        self.factions[faction].squads.push(squad);
      }
    }
    spawnSide('us',-SPAWN_Z,SPAWN_Z);
    spawnSide('ge',SPAWN_Z,-SPAWN_Z);
  };

  BattleSim.prototype.restart=function(){
    var all=this._roster.us.concat(this._roster.ge);
    for(var i=0;i<all.length;i++)all[i].root.dispose();
    this.spawnAll();
  };

  BattleSim.prototype.setTimeScale=function(v){this.timeScale=Math.max(0,+v||0);};
  BattleSim.prototype.pause=function(){this.paused=true;};
  BattleSim.prototype.resume=function(){this.paused=false;};

  function stepMovement(self,soldier,dt){
    if(soldier.dead)return;
    soldier.fireCooldown=Math.max(0,soldier.fireCooldown-dt);
    var dx=soldier.destination.x-soldier.root.position.x,dz=soldier.destination.z-soldier.root.position.z,d=Math.hypot(dx,dz);
    var wantCrouch=(soldier.suppressedUntil>self.time)||(!!soldier.target&&d<=.6);
    if(d>.6){
      var spd=soldier.speed*(wantCrouch?.55:1),step=Math.min(d,spd*dt);
      var nx=soldier.root.position.x+dx/d*step,nz=soldier.root.position.z+dz/d*step;
      soldier.root.position.x=nx;soldier.root.position.z=nz;soldier.root.position.y=self.heightAt(nx,nz);
      soldier.root.rotation.y=Math.atan2(dx,dz);
      soldier.moving=true;
    }else{
      soldier.moving=false;
      if(soldier.target){
        var tx=soldier.target.root.position.x-soldier.root.position.x,tz=soldier.target.root.position.z-soldier.root.position.z;
        if(Math.abs(tx)+Math.abs(tz)>1e-4)soldier.root.rotation.y=Math.atan2(tx,tz);
      }
    }
    if(wantCrouch!==soldier.crouching){soldier.crouching=wantCrouch;BattleSoldierModel.setCrouch(soldier,wantCrouch);}
    BattleSoldierModel.animateWalk(soldier,dt,soldier.moving?(soldier.crouching?.5:1):0);
  }

  BattleSim.prototype._frame=function(){
    if(this.paused||this.winner)return;
    var dt=this.scene.getEngine().getDeltaTime()/1000*this.timeScale;
    if(!(dt>0)||dt>0.25)dt=Math.min(dt||0,0.25); // clamp huge dt after a tab-away stall
    this.time+=dt;
    var all=this._roster.us,ge=this._roster.ge,i;
    for(i=0;i<all.length;i++)stepMovement(this,all[i],dt);
    for(i=0;i<ge.length;i++)stepMovement(this,ge[i],dt);

    this._aiAccum+=dt;
    if(this._aiAccum>=AI_TICK){
      this._aiAccum-=AI_TICK;
      var f=this.factions,squadsUs=f.us.squads,squadsGe=f.ge.squads,s;
      for(i=0;i<squadsUs.length;i++)SquadAI.updateSquad(squadsUs[i]);
      for(i=0;i<squadsGe.length;i++)SquadAI.updateSquad(squadsGe[i]);
      for(i=0;i<all.length;i++)SquadAI.updateSoldier(all[i],this);
      for(i=0;i<ge.length;i++)SquadAI.updateSoldier(ge[i],this);
      this._checkWinner();
      if(this.onUpdate)this.onUpdate(this);
    }
  };

  BattleSim.prototype._checkWinner=function(){
    if(this.winner)return;
    var us=this.factions.us.alive,ge=this.factions.ge.alive;
    var timeUp=this.time>=this.timeLimit;
    if(us<=0||ge<=0||timeUp){
      this.winner=us===ge?'draw':(us>ge?'us':'ge');
      if(this.onWinner)this.onWinner(this.winner,this);
    }
  };

  // Fire/shot hooks used by squad-ai.js's resolveFire/tryFire, wired here so squad-ai.js
  // stays Babylon-free: it calls battle.onFire/onShot, this is where those become meshes.
  BattleSim.prototype._wireFx=function(){
    var self=this;
    this.onFire=function(soldier){spawnMuzzleFlash(self.scene,muzzleWorld(soldier));};
    this.onShot=function(shooter,target,hit){
      if(!hit)return;
      spawnTracer(self.scene,muzzleWorld(shooter),target.root.position.add(new BABYLON.Vector3(0,1.2,0)));
    };
  };

  function start(scene,opts){
    var sim=new BattleSim(scene,opts);
    sim._wireFx();
    return sim;
  }

  root.BattleSim={FIELD_W:FIELD_W,FIELD_D:FIELD_D,heightAt:heightAt,buildTerrain:buildTerrain,start:start};
})(typeof window!=='undefined'?window:globalThis);

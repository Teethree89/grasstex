/* Headless harness for the battle AI.

   obstacle-field.js, squad-ai.js, engagement.js and the squad-level modules are all deliberately
   free of Babylon, so the real decision code can be exercised in node. Only two things are
   reimplemented here:

     - a minimal BABYLON stub, just enough for weapons.js to hand over the real weapon stats
       instead of the harness inventing its own numbers;
     - a movement integrator that mirrors stepMovement() in battle-sim.js (speed ramp, crouch and
       crawl speed factors, turn rates, prone cannot walk). If that function changes, change this.

   Everything else - perception, engagement states, stances, fire gating, squad orders - is the
   shipping code. */
'use strict';
const fs=require('fs');
const path=require('path');
const REPO=path.resolve(__dirname,'..','..');

function stubBabylon(root){
  function Color3(r,g,b){this.r=r;this.g=g;this.b=b;}
  Color3.Black=function(){return new Color3(0,0,0);};
  function mesh(){
    return{
      position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
      rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
      scaling:{x:1,y:1,z:1,set(){}},
      material:null,isPickable:true,parent:null,
      bakeCurrentTransformIntoVertices(){return this;},
      getTotalVertices(){return 8;},
      setVerticesData(){return this;},
      dispose(){}
    };
  }
  root.BABYLON={
    Color3:Color3,
    VertexBuffer:{ColorKind:'color',PositionKind:'position',NormalKind:'normal'},
    MeshBuilder:{CreateBox:mesh,CreateCylinder:mesh,CreateSphere:mesh,CreateLines:mesh,CreateGround:mesh},
    Mesh:{MergeMeshes(){return mesh();}},
    StandardMaterial:function(){this.specularColor=null;this.ambientColor=null;this.getScene=function(){return null;};this.dispose=function(){};},
    getScene(){return null;}
  };
}

function load(root,rel){
  const code=fs.readFileSync(path.join(REPO,rel),'utf8');
  /* Sources are IIFEs taking the global object, exactly as the browser loads them. */
  new Function('window','globalThis','console','BABYLON',code+'\n//# sourceURL='+rel)(root,root,console,root.BABYLON);
}

/* The shipping code seeds a couple of per-soldier values from Math.random (fire and voice
   cooldowns). Those look harmless, but a voice cooldown decides whether a callout fires, and a
   callout draws from the battle's seeded RNG - so one unseeded value shifts the shared stream and
   the whole battle diverges. Pinning Math.random makes a harness run reproducible, and keeps it
   reproducible if more unseeded randomness appears in the sources later. */
function seededRandom(seed){
  let a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}
function withSeededRandom(seed,fn){
  const real=Math.random;
  Math.random=seededRandom(seed);
  try{return fn();}finally{Math.random=real;}
}

function bootstrap(opts){
  opts=opts||{};
  const root={};
  root.window=root;
  stubBabylon(root);
  load(root,'battle/weapons.js');
  load(root,'battle/obstacle-field.js');
  load(root,'battle/squad-ai.js');
  load(root,'battle/engagement.js');
  if(opts.modules!==false){
    root.BattleModules={registerSystem(){},registerUnitType(){},registerObjectiveType(){},runHook(){},unitsFor(){return[];}};
    load(root,'battle/modules/16-squad-plan-stability.js');
  }
  return root;
}

/* ---- fake world ---------------------------------------------------------------------------- */

function vec(x,y,z){return{x:x,y:y,z:z,set(a,b,c){this.x=a;this.y=b;this.z=c;}};}

function makeBattle(root,opts){
  opts=opts||{};
  let seed=opts.seed||12345;
  const battle={
    time:0,
    obstacles:opts.obstacles||[],
    heightAt:opts.heightAt||function(){return 0;},
    _roster:{us:[],ge:[]},
    factions:{us:{alive:0,kills:0,squads:[]},ge:{alive:0,kills:0,squads:[]}},
    events:{fired:0,hits:0,kills:0,suppressiveShots:0,suppressed:0,callouts:[]},
    rosterOf(f){return this._roster[f];},
    random(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;},
    killSoldier(s,killer){
      if(s.dead)return;
      s.dead=true;s.hp=0;s.target=null;
      this.factions[s.faction].alive--;
      if(killer)this.factions[killer.faction].kills++;
      this.events.kills++;
    },
    onFire(){battle.events.fired++;},
    onShot(shooter,target,hit){if(hit)battle.events.hits++;},
    onSuppressiveShot(shooter,point,count){battle.events.suppressiveShots++;battle.events.suppressed+=count||0;},
    onCallout(s,type){battle.events.callouts.push(type);}
  };
  return battle;
}

let nextId=0;
/* Soldier ids feed slot jitter and scan stagger, so letting them run on across tests would make
   every test depend on how many tests ran before it. Each scenario starts from zero. */
function resetIds(){nextId=0;}
function addSquad(root,battle,opts){
  const SquadAI=root.SquadAI;
  const squad=SquadAI.createSquad(opts.id,opts.faction,{x:opts.x,z:opts.z},{x:opts.objective.x,z:opts.objective.z});
  const composition=opts.composition||SquadAI.COMPOSITION;
  withSeededRandom((opts.seed||7331)+composition.length,function(){
  composition.forEach(function(role,slot){
    const jx=opts.x+((slot%5)-2)*2.5,jz=opts.z+(Math.floor(slot/5)-1)*2.5;
    const model={root:{position:vec(jx,battle.heightAt(jx,jz),jz),rotation:{x:0,y:opts.facing==null?0:opts.facing,z:0}}};
    const weapon=root.BattleWeapons.attachWeapon(null,{},SquadAI.ROLES[role].weapon);
    const soldier=SquadAI.createSoldier({id:nextId++,faction:opts.faction,role:role,squad:squad,slotIndex:slot,model:model,weapon:weapon});
    soldier.fireCooldown=0;
    squad.members.push(soldier);
    battle._roster[opts.faction].push(soldier);
    battle.factions[opts.faction].alive++;
  });
  });
  battle.factions[opts.faction].squads.push(squad);
  return squad;
}

/* Mirrors stepMovement() in battle-sim.js. Keep the two in step. */
function setCrouch(s,v){if(s.dead)return;s.crouching=!!v;if(v)s.prone=false;}
function setProne(s,v){if(s.dead)return;s.prone=!!v;if(v)s.crouching=false;}
function stepMovement(battle,s,dt){
  if(s.dead)return;
  s.fireCooldown=Math.max(0,s.fireCooldown-dt);
  const desired=s.destination;
  const dx=desired.x-s.root.position.x,dz=desired.z-s.root.position.z,d=Math.hypot(dx,dz);
  const crawl=!!(s.prone&&s.crawling);
  const wantCrouch=!s.prone&&(s.tacticalCrouch||(s.suppressedUntil>battle.time)||(!!s.target&&d<=.6));
  const desiredSpeed=d>.35?s.speed*(crawl?.23:(wantCrouch?.58:1)):0;
  const cur=s.moveSpeed||0,rate=desiredSpeed>cur?(crawl?1.2:4.2):(crawl?2.0:6.5);
  s.moveSpeed=Math.max(0,cur+Math.max(-rate*dt,Math.min(rate*dt,desiredSpeed-cur)));
  function turnToward(yaw){
    const diff=Math.atan2(Math.sin(yaw-s.root.rotation.y),Math.cos(yaw-s.root.rotation.y));
    const maxTurn=(s.prone?1.25:2.8)*dt;
    s.root.rotation.y+=Math.max(-maxTurn,Math.min(maxTurn,diff));
  }
  if(d>.35&&s.moveSpeed>.025&&(!s.prone||crawl)){
    const dirx=dx/d,dirz=dz/d,step=Math.min(d,s.moveSpeed*dt);
    s.root.position.x+=dirx*step;s.root.position.z+=dirz*step;
    s.root.position.y=battle.heightAt(s.root.position.x,s.root.position.z);
    turnToward(Math.atan2(dirx,dirz));
    s.moving=true;
  }else{
    s.moving=false;
    const face=s.target?s.target.root.position:s._faceHint;
    if(face){
      const tx=face.x-s.root.position.x,tz=face.z-s.root.position.z;
      if(Math.abs(tx)+Math.abs(tz)>1e-4)turnToward(Math.atan2(tx,tz));
    }
  }
  if(wantCrouch!==s.crouching)setCrouch(s,wantCrouch);
  setProne(s,!!s.prone);
}

const AI_TICK=.15;
function run(root,battle,seconds,onTick){
  const SquadAI=root.SquadAI;
  let elapsed=0;
  while(elapsed<seconds){
    battle.time+=AI_TICK;elapsed+=AI_TICK;
    ['us','ge'].forEach(function(f){battle._roster[f].forEach(function(s){stepMovement(battle,s,AI_TICK);});});
    ['us','ge'].forEach(function(f){battle.factions[f].squads.forEach(function(sq){SquadAI.updateSquad(sq,battle);});});
    ['us','ge'].forEach(function(f){battle._roster[f].forEach(function(s){SquadAI.updateSoldier(s,battle);});});
    if(onTick)onTick(battle);
  }
}

module.exports={bootstrap,makeBattle,addSquad,run,stepMovement,vec,resetIds,seededRandom,withSeededRandom,AI_TICK,REPO};

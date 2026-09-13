/* Physical navigation + firing-station debug overlay.

   The renderer's hedges/logs/trees/rocks already publish plain obstacle data, but historically
   only building walls were hard movement barriers. This module upgrades that data into a cheap
   physical navigation constraint without changing cover/LOS semantics:

     - the final small movement step may not enter solid battlefield clutter;
     - a short-lived, deterministic detour waypoint sends soldiers around the blocking object;
     - occupied firing stations become local keep-outs for everyone except their owner;
     - claimed window stations keep their recent-contact directive through short LOS flicker;
     - an optional in-world overlay shows the window opening and the actual interior stand point.

   It wraps BattleNavigation rather than becoming another destination writer. The Movement
   Resolver remains the sole owner of soldier.destination. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleNavigationPhysicality)return;

var N=root.BattleNavigation,F=root.BattleObstacleField;
var baseMovementClear=N.movementClear,baseNextWaypoint=N.nextWaypoint,baseFiringDirective=N.firingDirective;
var HARD_TYPES={hedge:1,tree:1,log:1,wall:1,rock:1};
var STEP_MARGIN=.48,DETOUR_MARGIN=.82,DETOUR_LOOK=11,DETOUR_SECONDS=1.15,STATION_RADIUS=1.15;
var CONTACT_GRACE=4.5;
var simRef=null,occupied=[],occupiedAt=-999,debug={visible:false,version:-1,markers:[],freeMat:null,usedMat:null,lineMat:null,button:null,nextUpdate:0};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function dist(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function currentSim(){var b=simRef||root.__battle__;if(!b||!b.obstacles)return null;var navScenario=N.scenario,battleScenario=b.scene&&b.scene.metadata&&b.scene.metadata.battleScenario;if(navScenario&&battleScenario&&navScenario!==battleScenario)return null;return b;}
function hardObstacle(ob){return!!(ob&&HARD_TYPES[String(ob.type||'').toLowerCase()]);}
function obstacleKey(ob){return ob._physicalKey||(ob._physicalKey=(ob.type||'ob')+':'+(+ob.x||0).toFixed(2)+':'+(+ob.z||0).toFixed(2)+':'+(+ob.radius||1).toFixed(2));}

function segmentCircle(a,b,ob,margin){
  var dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz,r=(+ob.radius||1)+(margin||0),sx=a.x-ob.x,sz=a.z-ob.z,ex=b.x-ob.x,ez=b.z-ob.z;
  var start2=sx*sx+sz*sz,end2=ex*ex+ez*ez,r2=r*r;
  /* Legacy saves can start a man inside clutter. Never imprison him: outward motion is allowed. */
  if(start2<r2&&end2>start2+.02)return null;
  if(len2<1e-6)return end2<r2?{t:1,obstacle:ob}:null;
  var t=clamp((-(sx*dx+sz*dz))/len2,0,1),px=a.x+dx*t-ob.x,pz=a.z+dz*t-ob.z;
  return px*px+pz*pz<r2?{t:t,obstacle:ob}:null;
}
function fieldCandidates(sim,a,b){
  if(!sim||!F||!F.nearby||!sim.obstacles||!sim.obstacles.length)return[];
  var dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),scan=Math.min(len,DETOUR_LOOK),ux=len?dx/len:0,uz=len?dz/len:0;
  var end={x:a.x+ux*scan,z:a.z+uz*scan},mid={x:(a.x+end.x)/2,z:(a.z+end.z)/2};
  return F.nearby(sim.obstacles,mid.x,mid.z,scan*.5+5.4);
}
function firstFieldBlock(sim,a,b,margin,ignoreKey){
  var dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1e-5)return null;
  var scan=Math.min(len,DETOUR_LOOK),end={x:a.x+dx/len*scan,z:a.z+dz/len*scan},list=fieldCandidates(sim,a,end),best=null;
  for(var i=0;i<list.length;i++){
    var ob=list[i];if(!hardObstacle(ob)||obstacleKey(ob)===ignoreKey)continue;
    var hit=segmentCircle(a,end,ob,margin);if(hit&&(!best||hit.t<best.t)){hit.key=obstacleKey(ob);hit.kind='terrain';best=hit;}
  }
  return best;
}
/* movementClear is called on the tiny physical step every frame. Keep this check intentionally
   local: routing of longer paths lives in nextWaypoint, while this is the hard 'do not enter the
   mesh footprint' safety net. */
function stepFieldClear(sim,a,b){
  if(!sim||!F||!F.nearby)return true;var len=dist(a,b);if(!(len<3.2))return true;
  var near=F.nearby(sim.obstacles,b.x,b.z,4.8);
  for(var i=0;i<near.length;i++)if(hardObstacle(near[i])&&segmentCircle(a,b,near[i],STEP_MARGIN))return false;
  return true;
}
N.movementClear=function(a,b){if(!baseMovementClear(a,b))return false;return stepFieldClear(currentSim(),a,b);};

function refreshOccupied(sim,force){
  if(!sim)return occupied=[];if(!force&&sim.time<occupiedAt+.22)return occupied;occupiedAt=sim.time;occupied=[];
  ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){var st=s&&!s.dead&&(s._firingStation||s._windowSlot);if(st)occupied.push({id:st.id,x:+st.x,z:+st.z,radius:STATION_RADIUS,type:'occupied-window',key:'station:'+st.id,soldier:s});});});return occupied;
}
function firstStationBlock(sim,soldier,a,b,ignoreKey){
  var list=refreshOccupied(sim,false),best=null;
  for(var i=0;i<list.length;i++){var ob=list[i];if(ob.soldier===soldier||ob.key===ignoreKey)continue;var hit=segmentCircle(a,b,ob,.18);if(hit&&(!best||hit.t<best.t)){hit.key=ob.key;hit.kind='station';best=hit;}}
  return best;
}
function firstBlock(sim,soldier,a,b,ignoreKey){var x=firstFieldBlock(sim,a,b,DETOUR_MARGIN,ignoreKey),y=firstStationBlock(sim,soldier,a,b,ignoreKey);return!x?y:(!y?x:(x.t<=y.t?x:y));}
function candidateClear(sim,soldier,a,c,ignoreKey){if(!baseMovementClear(a,c))return false;if(firstFieldBlock(sim,a,c,STEP_MARGIN,ignoreKey))return false;if(firstStationBlock(sim,soldier,a,c,ignoreKey))return false;return true;}
function detourPoint(sim,soldier,goal,hit){
  var start={x:+soldier.root.position.x,z:+soldier.root.position.z},ob=hit.obstacle,dx=goal.x-start.x,dz=goal.z-start.z,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,px=-uz,pz=ux;
  var r=(+ob.radius||STATION_RADIUS)+DETOUR_MARGIN,pref=soldier._physicalAvoidSide||(soldier._physicalAvoidSide=((+soldier.id||0)%2?1:-1)),scales=[1,1.35,1.75,2.2],best=null;
  for(var k=0;k<scales.length;k++)for(var j=0;j<2;j++){
    var side=j===0?pref:-pref,lat=r*scales[k],forward=Math.min(1.6,r*.35);
    var c={x:ob.x+px*lat*side+ux*forward,z:ob.z+pz*lat*side+uz*forward};
    if(!candidateClear(sim,soldier,start,c,hit.key))continue;
    var score=dist(c,goal)+(side===pref?0:.55)+k*.35;if(!best||score<best.score)best={x:c.x,z:c.z,score:score,side:side};
  }
  if(!best){var side=pref;best={x:ob.x+px*r*2.45*side,z:ob.z+pz*r*2.45*side,side:side};}
  soldier._physicalAvoidSide=best.side;
  soldier._fieldDetour={x:best.x,z:best.z,goalX:goal.x,goalZ:goal.z,until:sim.time+DETOUR_SECONDS,key:hit.key,kind:hit.kind};
  return{x:best.x,z:best.z};
}
N.nextWaypoint=function(sim,soldier,dest){
  simRef=sim||simRef;var base=baseNextWaypoint(sim,soldier,dest)||dest;if(!soldier||!soldier.root||!base)return base;
  var start={x:+soldier.root.position.x,z:+soldier.root.position.z},goal=point(base),held=soldier._fieldDetour;
  if(!goal)return base;
  if(held){var sameGoal=Math.hypot(goal.x-held.goalX,goal.z-held.goalZ)<3.5;if(sameGoal&&sim.time<held.until&&dist(start,held)>.7)return{x:held.x,z:held.z};soldier._fieldDetour=null;}
  var hit=firstBlock(sim,soldier,start,goal,null);if(!hit)return base;
  return detourPoint(sim,soldier,goal,hit);
};

/* A window remains tactically owned during the same short alert/contact grace used by hardpoint
   assignment. This stops firingDirective from immediately releasing it on one frame of lost LOS. */
function recentAim(s,sim){
  if(!s||!sim)return null;var c=s.squad&&s.squad.contact,e=s.eng;
  if(c&&isFinite(+c.at)&&sim.time-(+c.at)<=CONTACT_GRACE)return{x:+c.x,z:+c.z};
  if(e&&e.lastSeen&&isFinite(+e.lastSeenAt)&&sim.time-(+e.lastSeenAt)<=CONTACT_GRACE)return{x:+e.lastSeen.x,z:+e.lastSeen.z};
  return null;
}
N.firingDirective=function(soldier,target){
  if(target&&!target.dead)return baseFiringDirective(soldier,target);
  var st=soldier&&(soldier._firingStation||soldier._windowSlot),sim=currentSim(),aim=recentAim(soldier,sim);if(!st||!aim)return baseFiringDirective(soldier,target);
  var vx=aim.x-st.windowX,vz=aim.z-st.windowZ,vlen=Math.hypot(vx,vz)||1,face=(vx/vlen)*st.normalX+(vz/vlen)*st.normalZ;
  if(face<.18)return baseFiringDirective(soldier,target);
  return{x:st.x,z:st.z,slot:st,stance:st.stance,aimPoint:{x:st.windowX,z:st.windowZ}};
};
N.windowDirective=N.firingDirective;

/* -------------------- in-world firing-station overlay ------------------------------------- */
function makeMaterial(scene,name,r,g,b,alpha){var m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=new BABYLON.Color3(r,g,b);m.emissiveColor=new BABYLON.Color3(r*.72,g*.72,b*.72);m.specularColor=BABYLON.Color3.Black();m.alpha=alpha;m.disableDepthWrite=true;return m;}
function disposeMarkers(){for(var i=0;i<debug.markers.length;i++){var m=debug.markers[i];try{m.station.dispose();}catch(_){}try{m.window.dispose();}catch(_){}try{m.line.dispose();}catch(_){}}debug.markers=[];debug.version=-1;}
function ensureMaterials(scene){if(debug.freeMat&&debug.freeMat.getScene()===scene)return;debug.freeMat=makeMaterial(scene,'windowSlotFreeMat',.2,.85,1,.42);debug.usedMat=makeMaterial(scene,'windowSlotUsedMat',1,.46,.12,.58);}
function rebuildMarkers(sim){
  disposeMarkers();if(!debug.visible||typeof BABYLON==='undefined'||!sim||!sim.scene)return;ensureMaterials(sim.scene);var slots=N.firingStations||[];
  for(var i=0;i<slots.length;i++){
    var st=slots[i],sy=sim.heightAt(st.x,st.z)+.58,wx=st.windowX+st.normalX*.28,wz=st.windowZ+st.normalZ*.28,wy=sim.heightAt(st.windowX,st.windowZ)+((+st.yBottom||.9)+(+st.yTop||2.0))*.5;
    var sphere=BABYLON.MeshBuilder.CreateSphere('windowStationDebug',{diameter:.62,segments:8},sim.scene);sphere.position.set(st.x,sy,st.z);sphere.material=debug.freeMat;sphere.isPickable=false;sphere.renderingGroupId=3;
    var win=BABYLON.MeshBuilder.CreateSphere('windowOpeningDebug',{diameter:.34,segments:7},sim.scene);win.position.set(wx,wy,wz);win.material=debug.freeMat;win.isPickable=false;win.renderingGroupId=3;
    var line=BABYLON.MeshBuilder.CreateLines('windowSlotLink',{points:[new BABYLON.Vector3(st.x,sy,st.z),new BABYLON.Vector3(wx,wy,wz)]},sim.scene);line.color=new BABYLON.Color3(.45,.9,1);line.alpha=.55;line.isPickable=false;line.renderingGroupId=3;
    debug.markers.push({id:st.id,station:sphere,window:win,line:line});
  }
  debug.version=N.version;updateDebug(sim,true);
}
function updateDebug(sim,force){
  if(!debug.visible||!sim)return;if(debug.version!==N.version){rebuildMarkers(sim);return;}if(!force&&sim.time<debug.nextUpdate)return;debug.nextUpdate=sim.time+.22;
  var occ=refreshOccupied(sim,true),used={};for(var i=0;i<occ.length;i++)used[occ[i].id]=1;
  for(i=0;i<debug.markers.length;i++){var m=debug.markers[i],mat=used[m.id]?debug.usedMat:debug.freeMat;m.station.material=mat;m.window.material=mat;}
  if(debug.button)debug.button.textContent='Window Slots '+occ.length+'/'+debug.markers.length;
}
function setVisible(v){debug.visible=!!v;try{localStorage.setItem('battleWindowSlotsVisible',debug.visible?'1':'0');}catch(_){}var sim=currentSim();if(debug.visible)rebuildMarkers(sim);else{disposeMarkers();if(debug.button)debug.button.textContent='Window Slots';}if(debug.button)debug.button.classList.toggle('on',debug.visible);}
function installButton(){
  if(typeof document==='undefined'||debug.button)return;var s=document.createElement('style');s.textContent='#windowSlotDebugToggle{position:fixed;right:12px;bottom:92px;z-index:16;padding:7px 10px;border:1px solid #4d6f79;border-radius:5px;background:#17262c;color:#dcecef;font:700 10px Arial;cursor:pointer;box-shadow:0 4px 14px #0005}#windowSlotDebugToggle.on{border-color:#65c9dc;background:#1d4650;color:#dfffff}';document.head.appendChild(s);
  var b=document.createElement('button');b.id='windowSlotDebugToggle';b.type='button';b.textContent='Window Slots';b.title='Show reservable window firing positions and their interior stand points';document.body.appendChild(b);debug.button=b;b.onclick=function(){setVisible(!debug.visible);};
  try{if(localStorage.getItem('battleWindowSlotsVisible')==='1'){debug.visible=true;b.classList.add('on');}}catch(_){}
}

root.BattleModules.registerSystem('navigation-physicality-debug',{
  version:'45-physical-navigation',
  onBattleStart:function(sim){simRef=sim;occupiedAt=-999;installButton();if(debug.visible)rebuildMarkers(sim);},
  onBattleRestart:function(sim){simRef=sim;occupiedAt=-999;['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){delete s._fieldDetour;delete s._physicalAvoidSide;});});if(debug.visible)rebuildMarkers(sim);},
  onSimulationStep:function(sim){simRef=sim;if(debug.visible)updateDebug(sim,false);}
});
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();}

root.BattleNavigationPhysicality={
  version:'45-physical-navigation',setWindowDebug:setVisible,windowDebug:function(){return debug.visible;},
  firstFieldBlock:firstFieldBlock,occupiedStations:function(sim){return refreshOccupied(sim||currentSim(),true).slice();},
  hardTypes:Object.keys(HARD_TYPES),detourLook:DETOUR_LOOK
};
console.log('[NAV-PHYS] hard clutter detours + occupied-window keepouts + Window Slots debug loaded');
})(typeof window!=='undefined'?window:globalThis);

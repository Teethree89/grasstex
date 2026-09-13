/* World/navigation debug overlay for Battle Sim.

   Visualizes the data the AI actually navigates rather than the decorative render meshes:
     - building movement walls, doors and windows from BattleNavigation;
     - hard clutter collision footprints used by navigation-physicality;
     - hedgerow collision circles as their own layer;
     - cover influence footprints used by BattleObstacleField;
     - reservable window slots via the existing physicality debugger;
     - each soldier's building path, remaining waypoints, resolved/order destinations and
       short-lived hard-clutter detours.

   Everything is opt-in. Static line systems rebuild only when their layer is visible and the
   scenario/obstacle set changes. Dynamic soldier lines are throttled in real time, so this module
   is effectively idle when the overlay is closed/off. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleWorldDebug)return;

var N=root.BattleNavigation,P=root.BattleNavigationPhysicality||null;
var STORAGE='battleWorldDebugV1',STEP_MARGIN=.48,COVER_PAD=1.5;
var simRef=null,nextDynamicAt=0,nextStaticCheckAt=0;
var settings={windows:false,buildings:false,obstacles:false,hedges:false,cover:false,paths:false,waypoints:false,destinations:false,detours:false};
var ui={button:null,panel:null,status:null,filter:null,checks:{}};
var layers=Object.create(null),staticSig='';
var COLORS={
  building:[.92,.95,.98],door:[.30,1,.48],window:[.20,.82,1],
  obstacle:[1,.27,.20],hedge:[.35,1,.38],cover:[.18,.66,1],
  us:[.18,.74,1],ge:[1,.49,.20],waypoint:[1,.88,.15],
  destination:[1,.20,.78],order:[.26,1,.90],fireteam:[.70,.38,1],detour:[1,.26,1]
};

function nowMs(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function currentSim(){var b=simRef||root.__battle__;return b&&b.scene?b:null;}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(settings));}catch(_){}}
function load(){try{var v=JSON.parse(localStorage.getItem(STORAGE)||'null');if(v)Object.keys(settings).forEach(function(k){if(typeof v[k]==='boolean')settings[k]=v[k];});}catch(_){}try{if(localStorage.getItem('battleWindowSlotsVisible')==='1')settings.windows=true;}catch(_){}}
function anyStatic(){return settings.buildings||settings.obstacles||settings.hedges||settings.cover;}
function anyDynamic(){return settings.paths||settings.waypoints||settings.destinations||settings.detours;}
function color3(c){return new BABYLON.Color3(c[0],c[1],c[2]);}
function yAt(sim,x,z,lift){return sim.heightAt(x,z)+(lift==null?.10:lift);}
function v3(sim,x,z,lift){return new BABYLON.Vector3(x,yAt(sim,x,z,lift),z);}
function distance2(a,b){if(!a||!b)return Infinity;var dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}

function disposeLayer(name){var m=layers[name];if(m){try{m.dispose();}catch(_){}delete layers[name];}}
function disposePrefix(prefix){Object.keys(layers).forEach(function(k){if(k.indexOf(prefix)===0)disposeLayer(k);});}
function makeLines(name,lines,color,alpha){
  disposeLayer(name);var sim=currentSim();if(!sim||typeof BABYLON==='undefined'||!lines||!lines.length)return null;
  var clean=lines.filter(function(l){return l&&l.length>=2;});if(!clean.length)return null;
  var m=BABYLON.MeshBuilder.CreateLineSystem(name,{lines:clean,updatable:false},sim.scene);m.color=color3(color);m.alpha=alpha==null?.82:alpha;m.isPickable=false;m.renderingGroupId=3;m.alwaysSelectAsActiveMesh=true;layers[name]=m;return m;
}
function circleLine(sim,x,z,r,segments,lift){
  var line=[],n=segments||16;for(var i=0;i<=n;i++){var a=Math.PI*2*i/n;line.push(v3(sim,x+Math.cos(a)*r,z+Math.sin(a)*r,lift));}return line;
}
function dashedCircle(lines,sim,x,z,r,segments,lift){
  var n=segments||16;for(var i=0;i<n;i+=2){var a=Math.PI*2*i/n,b=Math.PI*2*(i+1)/n;lines.push([v3(sim,x+Math.cos(a)*r,z+Math.sin(a)*r,lift),v3(sim,x+Math.cos(b)*r,z+Math.sin(b)*r,lift)]);}
}
function cross(lines,sim,p,size,lift){if(!p)return;var s=size||.55;lines.push([v3(sim,p.x-s,p.z,lift),v3(sim,p.x+s,p.z,lift)]);lines.push([v3(sim,p.x,p.z-s,lift),v3(sim,p.x,p.z+s,lift)]);}
function ring(lines,sim,p,size,lift){if(p)lines.push(circleLine(sim,p.x,p.z,size||.65,12,lift));}

function wallPoint(w,u){return{x:w.a.x+(w.b.x-w.a.x)*u,z:w.a.z+(w.b.z-w.a.z)*u};}
function openingInterval(w,o){
  var len=+w.length||Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z)||1,half=(+o.width||1.1)/2;
  return{u0:Math.max(0,((+o.offset||0)-half+len/2)/len),u1:Math.min(1,((+o.offset||0)+half+len/2)/len),opening:o};
}
function buildingGeometry(sim){
  var walls=N.walls||[],solid=[],doors=[],windows=[];
  for(var i=0;i<walls.length;i++){
    var w=walls[i],doorInts=(w.openings||[]).filter(function(o){return o.type==='door';}).map(function(o){return openingInterval(w,o);}).sort(function(a,b){return a.u0-b.u0;}),cursor=0;
    for(var d=0;d<doorInts.length;d++){var di=doorInts[d];if(di.u0>cursor+.001){var a=wallPoint(w,cursor),b=wallPoint(w,di.u0);solid.push([v3(sim,a.x,a.z,.13),v3(sim,b.x,b.z,.13)]);}cursor=Math.max(cursor,di.u1);}
    if(cursor<1-.001){var sa=wallPoint(w,cursor),sb=wallPoint(w,1);solid.push([v3(sim,sa.x,sa.z,.13),v3(sim,sb.x,sb.z,.13)]);}
    (w.openings||[]).forEach(function(o){var q=openingInterval(w,o),a=wallPoint(w,q.u0),b=wallPoint(w,q.u1),line=[v3(sim,a.x,a.z,.15),v3(sim,b.x,b.z,.15)];if(o.type==='door')doors.push(line);else if(o.type==='window')windows.push(line);});
  }
  return{solid:solid,doors:doors,windows:windows};
}
function hardTypes(){var a=P&&P.hardTypes||['hedge','tree','log','wall','rock'],m={};for(var i=0;i<a.length;i++)m[String(a[i]).toLowerCase()]=1;return m;}
function rebuildStatic(force){
  var sim=currentSim();if(!sim||typeof BABYLON==='undefined')return;
  var sig=(N.version||0)+'|'+((sim.obstacles&&sim.obstacles.length)||0);if(!force&&sig===staticSig)return;staticSig=sig;
  disposePrefix('wd-static-');
  if(settings.buildings){var bg=buildingGeometry(sim);makeLines('wd-static-building-walls',bg.solid,COLORS.building,.92);makeLines('wd-static-building-doors',bg.doors,COLORS.door,.98);makeLines('wd-static-building-windows',bg.windows,COLORS.window,.98);}
  var obstacles=sim.obstacles||[],hard=hardTypes(),hardLines=[],hedgeLines=[],coverLines=[];
  for(var i=0;i<obstacles.length;i++){
    var ob=obstacles[i];if(!ob||!isFinite(+ob.x)||!isFinite(+ob.z))continue;var type=String(ob.type||'').toLowerCase(),r=Math.max(.12,+ob.radius||1);
    if(settings.hedges&&type==='hedge')hedgeLines.push(circleLine(sim,+ob.x,+ob.z,r+STEP_MARGIN,14,.11));
    if(settings.obstacles&&hard[type]&&type!=='hedge')hardLines.push(circleLine(sim,+ob.x,+ob.z,r+STEP_MARGIN,14,.11));
    if(settings.cover)dashedCircle(coverLines,sim,+ob.x,+ob.z,r+COVER_PAD,14,.07);
  }
  if(settings.obstacles)makeLines('wd-static-obstacles',hardLines,COLORS.obstacle,.86);
  if(settings.hedges)makeLines('wd-static-hedges',hedgeLines,COLORS.hedge,.90);
  if(settings.cover)makeLines('wd-static-cover',coverLines,COLORS.cover,.58);
  updateStatus();
}

function includedSoldier(s){if(!s||s.dead)return false;var f=ui.filter&&ui.filter.value||'all';return f==='all'||s.faction===f;}
function remainingNavPath(s){
  var c=s._navCache;if(!c||!Array.isArray(c.path)||!c.path.length)return[];var start=Math.max(0,Math.min(c.path.length-1,+c.index||0)),out=[];for(var i=start;i<c.path.length;i++){var p=point(c.path[i]);if(p)out.push(p);}return out;
}
function rebuildDynamic(){
  disposePrefix('wd-dyn-');var sim=currentSim();if(!sim||typeof BABYLON==='undefined'||!anyDynamic())return;
  var path={us:[],ge:[]},way=[],dest=[],order=[],fireteam=[],detour=[];
  ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){
    if(!includedSoldier(s)||!s.root)return;var here={x:+s.root.position.x,z:+s.root.position.z},nav=remainingNavPath(s),resolved=point(s.destination);
    if(settings.paths){var pts=[v3(sim,here.x,here.z,.18)],last=here;for(var i=0;i<nav.length;i++){if(distance2(last,nav[i])>.04){pts.push(v3(sim,nav[i].x,nav[i].z,.18));last=nav[i];}}if(resolved&&distance2(last,resolved)>.04)pts.push(v3(sim,resolved.x,resolved.z,.18));if(pts.length>1)path[f].push(pts);}
    if(settings.waypoints){for(var w=0;w<nav.length;w++)cross(way,sim,nav[w],w===0?.72:.36,.23);}
    if(settings.destinations){if(resolved)ring(dest,sim,resolved,.62,.20);var od=point(s.orderDestination);if(od)cross(order,sim,od,.42,.21);var ft=point(s._fireteamDestination);if(ft)cross(fireteam,sim,ft,.34,.22);}
    if(settings.detours&&s._fieldDetour&&sim.time<(+s._fieldDetour.until||Infinity)){var d=point(s._fieldDetour);if(d){detour.push([v3(sim,here.x,here.z,.28),v3(sim,d.x,d.z,.28)]);cross(detour,sim,d,.78,.29);var g={x:+s._fieldDetour.goalX,z:+s._fieldDetour.goalZ};if(isFinite(g.x)&&isFinite(g.z))detour.push([v3(sim,d.x,d.z,.28),v3(sim,g.x,g.z,.28)]);}}
  });});
  if(settings.paths){makeLines('wd-dyn-path-us',path.us,COLORS.us,.76);makeLines('wd-dyn-path-ge',path.ge,COLORS.ge,.76);}
  if(settings.waypoints)makeLines('wd-dyn-waypoints',way,COLORS.waypoint,.96);
  if(settings.destinations){makeLines('wd-dyn-destination',dest,COLORS.destination,.90);makeLines('wd-dyn-order',order,COLORS.order,.82);makeLines('wd-dyn-fireteam',fireteam,COLORS.fireteam,.86);}
  if(settings.detours)makeLines('wd-dyn-detours',detour,COLORS.detour,.98);
  updateStatus();
}

function applyWindowSetting(){if(P&&P.setWindowDebug)P.setWindowDebug(!!settings.windows);}
function syncChecks(){Object.keys(ui.checks).forEach(function(k){ui.checks[k].checked=!!settings[k];});}
function setSetting(k,v){if(!(k in settings))return;settings[k]=!!v;save();if(k==='windows')applyWindowSetting();if(k==='buildings'||k==='obstacles'||k==='hedges'||k==='cover')rebuildStatic(true);else rebuildDynamic();syncChecks();updateStatus();}
function updateStatus(){
  if(!ui.status)return;var sim=currentSim(),ob=sim&&sim.obstacles||[],hard=hardTypes(),hc=0,hh=0;for(var i=0;i<ob.length;i++){var t=String(ob[i].type||'').toLowerCase();if(t==='hedge')hh++;else if(hard[t])hc++;}
  var slots=N.firingStations||[],occ=P&&P.occupiedStations&&sim?P.occupiedStations(sim).length:0,alive=0;if(sim)['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){if(includedSoldier(s))alive++;});});
  ui.status.textContent='hard '+hc+' · hedge '+hh+' · windows '+occ+'/'+slots.length+' · soldiers '+alive;
}
function checkboxRow(parent,key,label,title){var l=document.createElement('label');l.className='wd-row';l.title=title||label;var c=document.createElement('input');c.type='checkbox';c.checked=!!settings[key];c.onchange=function(){setSetting(key,c.checked);};var s=document.createElement('span');s.textContent=label;l.appendChild(c);l.appendChild(s);parent.appendChild(l);ui.checks[key]=c;}
function installUi(){
  if(typeof document==='undefined'||ui.button)return;load();var style=document.createElement('style');style.textContent=
    '#windowSlotDebugToggle{display:none!important}#worldDebugToggle{position:fixed;right:12px;bottom:92px;z-index:18;padding:7px 10px;border:1px solid #59666b;border-radius:5px;background:#172126;color:#e6eef0;font:700 10px Arial;cursor:pointer;box-shadow:0 4px 14px #0006}#worldDebugToggle.on{border-color:#75c9dc;background:#203c45}.wd-panel{position:fixed;right:12px;bottom:128px;z-index:18;width:270px;padding:10px;background:#11191eea;border:1px solid #53636a;border-radius:7px;box-shadow:0 8px 28px #0009;color:#dce6e9;font:11px Arial;backdrop-filter:blur(5px)}.wd-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}.wd-head b{font:700 12px Arial;letter-spacing:.04em}.wd-close{border:0;background:transparent;color:#9dafb5;cursor:pointer;font-size:16px}.wd-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}.wd-row{display:flex;gap:6px;align-items:center;min-height:21px;cursor:pointer}.wd-row input{accent-color:#62bfd2}.wd-sub{margin-top:8px;padding-top:7px;border-top:1px solid #ffffff18}.wd-filter{width:100%;background:#172126;color:#dce6e9;border:1px solid #45545b;padding:4px;border-radius:4px}.wd-status{margin-top:7px;color:#92a5ab;font:10px monospace}.wd-legend{margin-top:7px;color:#8fa1a7;font-size:9px;line-height:1.45}.wd-swatch{display:inline-block;width:9px;height:2px;margin:0 3px 2px 7px;vertical-align:middle}';document.head.appendChild(style);
  var b=document.createElement('button');b.id='worldDebugToggle';b.type='button';b.textContent='World Debug';b.onclick=function(){ui.panel.hidden=!ui.panel.hidden;b.classList.toggle('on',!ui.panel.hidden);if(!ui.panel.hidden){rebuildStatic(false);rebuildDynamic();updateStatus();}};document.body.appendChild(b);ui.button=b;
  var p=document.createElement('div');p.className='wd-panel';p.hidden=true;p.innerHTML='<div class="wd-head"><b>WORLD / NAV DEBUG</b><button class="wd-close" title="Close">×</button></div><div class="wd-grid"></div><div class="wd-sub"><select class="wd-filter" title="Limit soldier navigation lines"><option value="all">Paths: all soldiers</option><option value="us">Paths: US only</option><option value="ge">Paths: GER only</option></select></div><div class="wd-status"></div><div class="wd-legend"><b>World truth:</b> white building walls · green doors/hedges · cyan windows · red hard clutter · blue dashed cover influence.<br><b>Wayfinding:</b><span class="wd-swatch" style="background:#2fbdff"></span>US path<span class="wd-swatch" style="background:#ff7d33"></span>GER path<span class="wd-swatch" style="background:#ffe026"></span>waypoint<span class="wd-swatch" style="background:#ff33c7"></span>resolved destination<span class="wd-swatch" style="background:#42ffe5"></span>squad order<span class="wd-swatch" style="background:#b261ff"></span>fireteam<span class="wd-swatch" style="background:#ff42ff"></span>detour</div>';document.body.appendChild(p);ui.panel=p;ui.status=p.querySelector('.wd-status');ui.filter=p.querySelector('.wd-filter');ui.filter.onchange=function(){rebuildDynamic();updateStatus();};p.querySelector('.wd-close').onclick=function(){p.hidden=true;b.classList.remove('on');};var grid=p.querySelector('.wd-grid');
  checkboxRow(grid,'windows','Window slots','Reservable interior firing positions; cyan free, orange occupied');checkboxRow(grid,'buildings','Buildings','Actual movement walls with door gaps and window openings');checkboxRow(grid,'obstacles','Hard obstacles','Physical collision footprint for rocks, trees, logs and field walls');checkboxRow(grid,'hedges','Hedgerows','Physical collision circles that form hedgerow barriers');checkboxRow(grid,'cover','Cover influence','Dashed footprint used by cover scoring (obstacle radius + cover pad)');checkboxRow(grid,'paths','Soldier paths','Remaining building-navigation route from each soldier to resolved destination');checkboxRow(grid,'waypoints','Waypoints','Remaining navigation waypoint crosses; first/current is larger');checkboxRow(grid,'destinations','Destinations','Resolved destination ring, squad-order cross and fireteam cross');checkboxRow(grid,'detours','Detours','Temporary hard-clutter/occupied-window avoidance waypoint and goal');
  syncChecks();applyWindowSetting();updateStatus();
}
function clearAll(){disposePrefix('wd-static-');disposePrefix('wd-dyn-');staticSig='';}
function attach(sim){simRef=sim;staticSig='';nextDynamicAt=0;nextStaticCheckAt=0;applyWindowSetting();if(anyStatic())rebuildStatic(true);if(anyDynamic())rebuildDynamic();updateStatus();}

root.BattleModules.registerSystem('world-debug-overlay',{
  version:'46-world-nav-debug',
  onBattleStart:function(sim){attach(sim);},
  beforeBattleRestart:function(){clearAll();},
  onBattleRestart:function(sim){attach(sim);},
  onSimulationStep:function(sim){simRef=sim;var t=nowMs();if(anyStatic()&&t>=nextStaticCheckAt){nextStaticCheckAt=t+650;rebuildStatic(false);}if(anyDynamic()&&t>=nextDynamicAt){nextDynamicAt=t+180;rebuildDynamic();}else if(ui.panel&&!ui.panel.hidden&&t>=nextStaticCheckAt-300)updateStatus();}
});
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUi,{once:true});else installUi();}
root.BattleWorldDebug={version:'46-world-nav-debug',settings:settings,set:setSetting,refresh:function(){rebuildStatic(true);rebuildDynamic();},dispose:clearAll};
console.log('[WORLD-DEBUG] collision/cover/building + soldier path/waypoint overlay loaded');
})(typeof window!=='undefined'?window:globalThis);

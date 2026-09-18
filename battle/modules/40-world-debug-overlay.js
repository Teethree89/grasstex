/* World/navigation debug overlay for Battle Sim.

   Static collision layers render the SAME mesh-aligned physical footprints used by navigation,
   including the hard body-clearance margin. Hedgerow cover/LOS now uses the same oriented volume
   rather than a second family of circles. Dynamic destination rings are the actual soldier body
   radius centered on the final legalized destination, so a screenshot answers the occupancy
   question directly. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleWorldDebug)return;

var N=root.BattleNavigation,P=root.BattleNavigationPhysicality||null;
var STORAGE='battleWorldDebugV1',COVER_PAD=1.5;
var simRef=null,nextDynamicAt=0,nextStaticCheckAt=0;
var settings={windows:false,buildings:false,obstacles:false,hedges:false,cover:false,coverSlots:false,paths:false,waypoints:false,destinations:false,detours:false};
var ui={button:null,panel:null,status:null,filter:null,checks:{}};
var layers=Object.create(null),staticSig='';
var coverCounts={occupied:0,reserved:0,total:0};
var COLORS={building:[.92,.95,.98],door:[.30,1,.48],window:[.20,.82,1],obstacle:[1,.27,.20],hedge:[.35,1,.38],cover:[.18,.66,1],us:[.18,.74,1],ge:[1,.49,.20],waypoint:[1,.88,.15],destination:[1,.20,.78],order:[.26,1,.90],fireteam:[.70,.38,1],detour:[1,.26,1]};

function nowMs(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function currentSim(){var b=simRef||root.__battle__;return b&&b.scene?b:null;}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(settings));}catch(_){} }
function load(){try{var v=JSON.parse(localStorage.getItem(STORAGE)||'null');if(v)Object.keys(settings).forEach(function(k){if(typeof v[k]==='boolean')settings[k]=v[k];});}catch(_){}try{if(localStorage.getItem('battleWindowSlotsVisible')==='1')settings.windows=true;}catch(_){} }
function anyStatic(){return settings.buildings||settings.obstacles||settings.hedges||settings.cover;}
function anyDynamic(){return settings.coverSlots||settings.paths||settings.waypoints||settings.destinations||settings.detours;}
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
function circleLine(sim,x,z,r,segments,lift){var line=[],n=segments||16;for(var i=0;i<=n;i++){var a=Math.PI*2*i/n;line.push(v3(sim,x+Math.cos(a)*r,z+Math.sin(a)*r,lift));}return line;}
function dashedCircle(lines,sim,x,z,r,segments,lift){var n=segments||16;for(var i=0;i<n;i+=2){var a=Math.PI*2*i/n,b=Math.PI*2*(i+1)/n;lines.push([v3(sim,x+Math.cos(a)*r,z+Math.sin(a)*r,lift),v3(sim,x+Math.cos(b)*r,z+Math.sin(b)*r,lift)]);}}
function cross(lines,sim,p,size,lift){if(!p)return;var s=size||.55;lines.push([v3(sim,p.x-s,p.z,lift),v3(sim,p.x+s,p.z,lift)]);lines.push([v3(sim,p.x,p.z-s,lift),v3(sim,p.x,p.z+s,lift)]);}
function ring(lines,sim,p,size,lift){if(p)lines.push(circleLine(sim,p.x,p.z,size||.65,12,lift));}

function axes(fp){var ux=isFinite(+fp.ux)?+fp.ux:1,uz=isFinite(+fp.uz)?+fp.uz:0,l=Math.hypot(ux,uz)||1;ux/=l;uz/=l;var vx=isFinite(+fp.vx)?+fp.vx:-uz,vz=isFinite(+fp.vz)?+fp.vz:ux,vl=Math.hypot(vx,vz)||1;return{ux:ux,uz:uz,vx:vx/vl,vz:vz/vl};}
function fpPoint(fp,lx,lz){var a=axes(fp);return{x:(+fp.x||0)+a.ux*lx+a.vx*lz,z:(+fp.z||0)+a.uz*lx+a.vz*lz};}
function footprintLine(sim,fp,margin,lift){
  margin=margin||0;if(fp.shape!=='obb')return circleLine(sim,+fp.x,+fp.z,(+fp.radius||1)+margin,18,lift);
  var hx=(+fp.hx||.5)+margin,hz=(+fp.hz||.5)+margin,c=[fpPoint(fp,-hx,-hz),fpPoint(fp,hx,-hz),fpPoint(fp,hx,hz),fpPoint(fp,-hx,hz),fpPoint(fp,-hx,-hz)],line=[];
  for(var i=0;i<c.length;i++)line.push(v3(sim,c[i].x,c[i].z,lift));return line;
}

function wallPoint(w,u){return{x:w.a.x+(w.b.x-w.a.x)*u,z:w.a.z+(w.b.z-w.a.z)*u};}
function openingInterval(w,o){var len=+w.length||Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z)||1,half=(+o.width||1.1)/2;return{u0:Math.max(0,((+o.offset||0)-half+len/2)/len),u1:Math.min(1,((+o.offset||0)+half+len/2)/len),opening:o};}
function doorRails(sim,w,a,b,doors){
  var dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,depth=(isFinite(+N.doorPad)?+N.doorPad:1.55);
  doors.push([v3(sim,a.x-nx*depth,a.z-nz*depth,.16),v3(sim,a.x+nx*depth,a.z+nz*depth,.16)]);
  doors.push([v3(sim,b.x-nx*depth,b.z-nz*depth,.16),v3(sim,b.x+nx*depth,b.z+nz*depth,.16)]);
}
function buildingGeometry(sim){
  var walls=N.walls||[],solid=[],doors=[],windows=[];
  for(var i=0;i<walls.length;i++){
    var w=walls[i],doorInts=(w.openings||[]).filter(function(o){return o.type==='door';}).map(function(o){return openingInterval(w,o);}).sort(function(a,b){return a.u0-b.u0;}),cursor=0;
    for(var d=0;d<doorInts.length;d++){
      var di=doorInts[d];if(di.u0>cursor+.001){var a=wallPoint(w,cursor),b=wallPoint(w,di.u0);solid.push([v3(sim,a.x,a.z,.13),v3(sim,b.x,b.z,.13)]);}
      var da=wallPoint(w,di.u0),db=wallPoint(w,di.u1);doorRails(sim,w,da,db,doors);cursor=Math.max(cursor,di.u1);
    }
    if(cursor<1-.001){var sa=wallPoint(w,cursor),sb=wallPoint(w,1);solid.push([v3(sim,sa.x,sa.z,.13),v3(sim,sb.x,sb.z,.13)]);}
    (w.openings||[]).forEach(function(o){if(o.type==='door')return;var q=openingInterval(w,o),a=wallPoint(w,q.u0),b=wallPoint(w,q.u1);if(o.type==='window')windows.push([v3(sim,a.x,a.z,.15),v3(sim,b.x,b.z,.15)]);});
  }
  return{solid:solid,doors:doors,windows:windows};
}
function physicalFootprints(sim){if(P&&P.footprints)return P.footprints(sim);var obs=sim&&sim.obstacles||[],out=[];for(var i=0;i<obs.length;i++){var o=obs[i],t=String(o.type||'').toLowerCase();if(['hedge','tree','log','wall','rock'].indexOf(t)>=0)out.push(o.shape?o:{type:t,shape:'circle',x:+o.x,z:+o.z,radius:+o.radius||1});}return out;}
function navMargin(){return P&&isFinite(+P.navMargin)?+P.navMargin:.45;}
function routeMargin(){return P&&isFinite(+P.routeMargin)?+P.routeMargin:1.15;}
function bodyRadius(){return P&&isFinite(+P.bodyRadius)?+P.bodyRadius:.45;}
function rebuildStatic(force){
  var sim=currentSim();if(!sim||typeof BABYLON==='undefined')return;
  var phys=physicalFootprints(sim),sig=(N.version||0)+'|'+phys.length+'|'+((sim.obstacles&&sim.obstacles.length)||0)+'|'+((sim.obstacles&&sim.obstacles.__physicalVersion)||0);if(!force&&sig===staticSig)return;staticSig=sig;disposePrefix('wd-static-');
  if(settings.buildings){var bg=buildingGeometry(sim);makeLines('wd-static-building-walls',bg.solid,COLORS.building,.92);makeLines('wd-static-building-doors',bg.doors,COLORS.door,.98);makeLines('wd-static-building-windows',bg.windows,COLORS.window,.98);}
  var hardLines=[],hedgeLines=[],coverLines=[],margin=navMargin(),i;
  for(i=0;i<phys.length;i++){var fp=phys[i],type=String(fp.type||'').toLowerCase();if(settings.hedges&&type==='hedge')hedgeLines.push(footprintLine(sim,fp,margin,.11));else if(settings.obstacles&&type!=='hedge')hardLines.push(footprintLine(sim,fp,margin,.11));}
  var obstacles=sim.obstacles||[];
  if(settings.cover)for(i=0;i<obstacles.length;i++){
    var ob=obstacles[i];if(!ob||!isFinite(+ob.x)||!isFinite(+ob.z))continue;
    if(ob.shape==='obb')coverLines.push(footprintLine(sim,ob,COVER_PAD,.07));else dashedCircle(coverLines,sim,+ob.x,+ob.z,Math.max(.12,+ob.radius||1)+COVER_PAD,14,.07);
  }
  if(settings.obstacles)makeLines('wd-static-obstacles',hardLines,COLORS.obstacle,.90);
  if(settings.hedges)makeLines('wd-static-hedges',hedgeLines,COLORS.hedge,.94);
  if(settings.cover)makeLines('wd-static-cover',coverLines,COLORS.cover,.52);
  updateStatus();
}

function includedSoldier(s){if(!s||s.dead)return false;var f=ui.filter&&ui.filter.value||'all';return f==='all'||s.faction===f;}
function remainingPath(s){
  var c=s._physicalPath;if(c&&Array.isArray(c.points)&&c.points.length){var si=Math.max(0,Math.min(c.points.length-1,+c.index||0)),p=[];for(var j=si;j<c.points.length;j++){var q=point(c.points[j]);if(q)p.push(q);}return p;}
  c=s._navCache;if(!c||!Array.isArray(c.path)||!c.path.length)return[];var start=Math.max(0,Math.min(c.path.length-1,+c.index||0)),out=[];for(var i=start;i<c.path.length;i++){var n=point(c.path[i]);if(n)out.push(n);}return out;
}
function rebuildCoverSlots(sim){
  var api=root.BattleCoverPositions,slots=api&&api.snapshot?api.snapshot(sim):[],lines={free:[],reserved:[],occupied:[]},filter=ui.filter&&ui.filter.value||'all',radius=bodyRadius();
  coverCounts={occupied:0,reserved:0,total:slots.length};
  for(var i=0;i<slots.length;i++){
    var slot=slots[i],status=slot.status;if(!lines[status])continue;
    if(status!=='free'){coverCounts[status]++;if(filter!=='all'&&slot.faction!==filter)continue;}
    var at=point(slot);if(!at)continue;ring(lines[status],sim,at,radius,.24);
    var nx=+slot.normalX||0,nz=+slot.normalZ||0,length=Math.hypot(nx,nz);
    if(length>.001){nx/=length;nz/=length;lines[status].push([v3(sim,at.x+nx*radius,at.z+nz*radius,.24),v3(sim,at.x+nx*(radius+.65),at.z+nz*(radius+.65),.24)]);}
  }
  makeLines('wd-dyn-cover-slots-free',lines.free,COLORS.window,.76);
  makeLines('wd-dyn-cover-slots-reserved',lines.reserved,COLORS.waypoint,.98);
  makeLines('wd-dyn-cover-slots-occupied',lines.occupied,COLORS.ge,.98);
}
function rebuildDynamic(){
  disposePrefix('wd-dyn-');var sim=currentSim();if(!sim||typeof BABYLON==='undefined'||!anyDynamic())return;
  if(settings.coverSlots)rebuildCoverSlots(sim);
  var path={us:[],ge:[]},way=[],dest=[],order=[],fireteam=[],detour=[];
  ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){
    if(!includedSoldier(s)||!s.root)return;var here={x:+s.root.position.x,z:+s.root.position.z},nav=remainingPath(s),resolved=point(s.destination);
    if(settings.paths){var pts=[v3(sim,here.x,here.z,.18)],last=here;for(var i=0;i<nav.length;i++){if(distance2(last,nav[i])>.04){pts.push(v3(sim,nav[i].x,nav[i].z,.18));last=nav[i];}}if(pts.length>1)path[f].push(pts);}
    if(settings.waypoints){for(var w=0;w<nav.length;w++)cross(way,sim,nav[w],w===0?.72:.36,.23);}
    if(settings.destinations){if(resolved)ring(dest,sim,resolved,bodyRadius(),.20);var od=point(s.orderDestination);if(od)cross(order,sim,od,.42,.21);var ft=point(s._fireteamDestination);if(ft)cross(fireteam,sim,ft,.34,.22);}
    if(settings.detours&&s._physicalPath&&nav.length){var first=nav[0],fg={x:+s._physicalPath.finalGoalX,z:+s._physicalPath.finalGoalZ};if(first&&isFinite(fg.x)&&isFinite(fg.z)&&distance2(first,fg)>1){detour.push([v3(sim,here.x,here.z,.28),v3(sim,first.x,first.z,.28)]);cross(detour,sim,first,.78,.29);}}
  });});
  if(settings.paths){makeLines('wd-dyn-path-us',path.us,COLORS.us,.84);makeLines('wd-dyn-path-ge',path.ge,COLORS.ge,.84);}
  if(settings.waypoints)makeLines('wd-dyn-waypoints',way,COLORS.waypoint,.98);
  if(settings.destinations){makeLines('wd-dyn-destination',dest,COLORS.destination,.90);makeLines('wd-dyn-order',order,COLORS.order,.82);makeLines('wd-dyn-fireteam',fireteam,COLORS.fireteam,.86);}
  if(settings.detours)makeLines('wd-dyn-detours',detour,COLORS.detour,.98);
  updateStatus();
}

function applyWindowSetting(){if(P&&P.setWindowDebug)P.setWindowDebug(!!settings.windows);}
function syncChecks(){Object.keys(ui.checks).forEach(function(k){ui.checks[k].checked=!!settings[k];});}
function setSettings(values){
  var changed=false,staticChanged=false,dynamicChanged=false,windowsChanged=false;
  Object.keys(settings).forEach(function(k){
    if(!Object.prototype.hasOwnProperty.call(values,k)||settings[k]===!!values[k])return;
    settings[k]=!!values[k];changed=true;
    if(k==='windows')windowsChanged=true;
    else if(k==='buildings'||k==='obstacles'||k==='hedges'||k==='cover')staticChanged=true;
    else dynamicChanged=true;
  });
  if(!changed)return;save();if(windowsChanged)applyWindowSetting();
  if(staticChanged)rebuildStatic(true);if(dynamicChanged)rebuildDynamic();syncChecks();updateStatus();
}
function setSetting(k,v){var values={};values[k]=v;setSettings(values);}
function setAll(v){var values={};Object.keys(settings).forEach(function(k){values[k]=!!v;});setSettings(values);}
function updateStatus(){
  if(!ui.status)return;var sim=currentSim(),phys=physicalFootprints(sim),hc=0,hh=0;
  for(var i=0;i<phys.length;i++){if(String(phys[i].type||'').toLowerCase()==='hedge')hh++;else hc++;}
  var slots=N.firingStations||[],occ=P&&P.occupiedStations&&sim?P.occupiedStations(sim).length:0,alive=0;
  if(sim)['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){if(includedSoldier(s))alive++;});});
  ui.status.textContent='physical '+hc+' · hedge '+hh+' · windows '+occ+'/'+slots.length+(settings.coverSlots?' · cover '+coverCounts.occupied+' occupied / '+coverCounts.reserved+' reserved / '+coverCounts.total+' total':'')+' · soldiers '+alive+' · body '+bodyRadius().toFixed(2)+'m · collision '+navMargin().toFixed(2)+'m · route '+routeMargin().toFixed(2)+'m';
}
function checkboxRow(parent,key,label,title){var l=document.createElement('label');l.className='wd-row';l.title=title||label;var c=document.createElement('input');c.type='checkbox';c.checked=!!settings[key];c.onchange=function(){setSetting(key,c.checked);};var s=document.createElement('span');s.textContent=label;l.appendChild(c);l.appendChild(s);parent.appendChild(l);ui.checks[key]=c;}
function installUi(){
  if(typeof document==='undefined'||ui.button)return;load();
  var style=document.createElement('style');style.textContent='#windowSlotDebugToggle{display:none!important}#worldDebugToggle{position:fixed;right:12px;bottom:92px;z-index:18;padding:7px 10px;border:1px solid #59666b;border-radius:5px;background:#172126;color:#e6eef0;font:700 10px Arial;cursor:pointer;box-shadow:0 4px 14px #0006}#worldDebugToggle.on{border-color:#75c9dc;background:#203c45}.wd-panel{position:fixed;right:12px;bottom:128px;z-index:18;width:294px;padding:10px;background:#11191eea;border:1px solid #53636a;border-radius:7px;box-shadow:0 8px 28px #0009;color:#dce6e9;font:11px Arial;backdrop-filter:blur(5px)}.wd-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}.wd-head b{font:700 12px Arial;letter-spacing:.04em}.wd-close{border:0;background:transparent;color:#9dafb5;cursor:pointer;font-size:16px}.wd-actions{display:flex;gap:6px;margin-bottom:7px}.wd-actions button{flex:1;border:1px solid #45545b;border-radius:4px;background:#172126;color:#dce6e9;padding:4px 7px;font:11px Arial;cursor:pointer}.wd-actions button:hover{background:#203c45}.wd-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}.wd-row{display:flex;gap:6px;align-items:center;min-height:21px;cursor:pointer}.wd-row input{accent-color:#62bfd2}.wd-sub{margin-top:8px;padding-top:7px;border-top:1px solid #ffffff18}.wd-filter{width:100%;background:#172126;color:#dce6e9;border:1px solid #45545b;padding:4px;border-radius:4px}.wd-status{margin-top:7px;color:#92a5ab;font:10px monospace}.wd-legend{margin-top:7px;color:#8fa1a7;font-size:9px;line-height:1.45}.wd-swatch{display:inline-block;width:9px;height:2px;margin:0 3px 2px 7px;vertical-align:middle}';document.head.appendChild(style);
  var b=document.createElement('button');b.id='worldDebugToggle';b.type='button';b.textContent='World Debug';b.onclick=function(){ui.panel.hidden=!ui.panel.hidden;b.classList.toggle('on',!ui.panel.hidden);if(!ui.panel.hidden){rebuildStatic(false);rebuildDynamic();updateStatus();}};document.body.appendChild(b);ui.button=b;
  var p=document.createElement('div');p.className='wd-panel';p.hidden=true;
  p.innerHTML='<div class="wd-head"><b>WORLD / NAV DEBUG</b><button class="wd-close" title="Close">×</button></div><div class="wd-grid"></div><div class="wd-sub"><select class="wd-filter" title="Limit soldier navigation lines and claimed cover slots"><option value="all">Soldiers: all</option><option value="us">Soldiers: US only</option><option value="ge">Soldiers: GER only</option></select></div><div class="wd-status"></div><div class="wd-legend"><b>Collision:</b> green hedge rectangles · red hard obstacles · white building walls. Green door rails show an OPEN portal corridor; there is deliberately no line across the threshold.<br><b>Clearance:</b> collision outline is the hard soldier-body envelope; committed paths use a larger route envelope and should visibly stay outside it.<br><b>Tactical:</b> blue hedge/cover outlines come from the same authoritative volume used for LOS and bullets.<br><b>Cover slots:</b> cyan free · yellow reserved · orange occupied. Rings show body space; ticks point outward from cover.<br><b>Wayfinding:</b><span class="wd-swatch" style="background:#2fbdff"></span>US rolling path<span class="wd-swatch" style="background:#ff7d33"></span>GER rolling path<span class="wd-swatch" style="background:#ffe026"></span>queued waypoint<span class="wd-swatch" style="background:#ff33c7"></span>final destination BODY ring. Cyan/purple crosses remain raw squad/fireteam intent.</div>';
  document.body.appendChild(p);ui.panel=p;ui.status=p.querySelector('.wd-status');ui.filter=p.querySelector('.wd-filter');ui.filter.onchange=function(){rebuildDynamic();updateStatus();};p.querySelector('.wd-close').onclick=function(){p.hidden=true;b.classList.remove('on');};var grid=p.querySelector('.wd-grid');
  checkboxRow(grid,'windows','Window slots','Reservable interior firing positions; cyan free, orange occupied');
  checkboxRow(grid,'buildings','Buildings','White walls, cyan windows, and green OPEN door portal rails');
  checkboxRow(grid,'obstacles','Hard obstacles','Hard physical footprint plus soldier body clearance');
  checkboxRow(grid,'hedges','Hedgerows','Authoritative terrain-following hedge prism projected to navigation plus body clearance');
  checkboxRow(grid,'cover','Cover / LOS volume','Tactical cover/LOS footprint; hedge geometry is shared with collision');
  checkboxRow(grid,'coverSlots','Cover slots','Reservable cover body positions and outward direction: cyan free, yellow reserved, orange occupied');
  checkboxRow(grid,'paths','Soldier paths','Rolling committed route queue the soldier is actually following');
  checkboxRow(grid,'waypoints','Waypoints','Future queued route points; active/current is larger');
  checkboxRow(grid,'destinations','Destinations','Final legalized soldier-body ring plus raw squad/fireteam intent crosses');
  checkboxRow(grid,'detours','Avoidance leg','Highlight immediate physical route leg when it differs from the final goal');
  var actions=document.createElement('div');actions.className='wd-actions';
  var all=document.createElement('button');all.type='button';all.className='wd-select-all';all.textContent='Select all';all.onclick=function(){setAll(true);};actions.appendChild(all);
  var none=document.createElement('button');none.type='button';none.className='wd-select-none';none.textContent='Select none';none.onclick=function(){setAll(false);};actions.appendChild(none);
  p.insertBefore(actions,grid);syncChecks();applyWindowSetting();updateStatus();
}
function clearAll(){disposePrefix('wd-static-');disposePrefix('wd-dyn-');staticSig='';coverCounts={occupied:0,reserved:0,total:0};}
function attach(sim){simRef=sim;staticSig='';nextDynamicAt=0;nextStaticCheckAt=0;applyWindowSetting();if(anyStatic())rebuildStatic(true);if(anyDynamic())rebuildDynamic();updateStatus();}

root.BattleModules.registerSystem('world-debug-overlay',{
  version:'50-m3c-authoritative-volumes',
  onBattleStart:function(sim){attach(sim);},
  beforeBattleRestart:function(){clearAll();},
  onBattleRestart:function(sim){attach(sim);},
  onSimulationStep:function(sim){simRef=sim;var t=nowMs();if(anyStatic()&&t>=nextStaticCheckAt){nextStaticCheckAt=t+650;rebuildStatic(false);}if(anyDynamic()&&t>=nextDynamicAt){nextDynamicAt=t+180;rebuildDynamic();}else if(ui.panel&&!ui.panel.hidden&&t>=nextStaticCheckAt-300)updateStatus();}
});
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUi,{once:true});else installUi();}
root.BattleWorldDebug={version:'50-m3c-authoritative-volumes',settings:settings,set:setSetting,setAll:setAll,refresh:function(){rebuildStatic(true);rebuildDynamic();},dispose:clearAll};
console.log('[WORLD-DEBUG] M3C authoritative volumes + body-sized destination rings loaded');
})(typeof window!=='undefined'?window:globalThis);

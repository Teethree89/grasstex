#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Minimal DOM/renderer stand-ins exercise the real checkbox/button event handlers without WebGL.
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.className='';this.value='';this.hidden=false;this.checked=false;this.textContent='';this.classList={toggle:(name,on)=>{const set=new Set(this.className.split(' ').filter(Boolean));if(on??!set.has(name))set.add(name);else set.delete(name);this.className=[...set].join(' ');},remove:name=>this.classList.toggle(name,false)};}
  appendChild(child){this.children.push(child);return child;}
  insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);return child;}
  querySelector(selector){return this.find(el=>selector[0]==='.'?el.className.split(' ').includes(selector.slice(1)):selector[0]==='#'?el.id===selector.slice(1):el.tagName===selector);}
  find(predicate){for(const child of this.children){if(predicate(child))return child;const nested=child.find(predicate);if(nested)return nested;}return null;}
  set innerHTML(html){const stack=[this];for(const m of html.matchAll(/<\/?([a-z]+)\b([^>]*)>|([^<]+)/gi)){if(m[3]){stack.at(-1).textContent+=m[3];continue;}if(m[0][1]==='/'){stack.pop();continue;}const el=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))el[a[1]==='class'?'className':a[1]]=a[2];stack.at(-1).appendChild(el);if(!['br','input'].includes(m[1]))stack.push(el);}}
}
class Vector3{constructor(x,y,z){Object.assign(this,{x,y,z});}}
class Color3{constructor(r,g,b){Object.assign(this,{r,g,b});}}
const source=fs.readFileSync(path.resolve(__dirname,'../../battle/modules/40-world-debug-overlay.js'),'utf8');
function boot(stored={}){
  const hooks={},meshes=[],writes=[],windowSettings=[],storage={...stored},document={readyState:'complete',head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag)},cover={calls:0,slots:[{id:'free',x:30,z:10,normalX:0,normalZ:1,status:'free',soldierId:null,faction:null,type:'hedge'},{id:'reserved',x:40,z:10,normalX:1,normalZ:0,status:'reserved',soldierId:1,faction:'us',type:'hedge'},{id:'occupied',x:50,z:10,normalX:-1,normalZ:0,status:'occupied',soldierId:2,faction:'ge',type:'rock'}]};
  const context={console:{log(){}},document,performance:{now:()=>1000},localStorage:{getItem:key=>storage[key]??null,setItem(key,value){storage[key]=value;writes.push(key);}},BattleModules:{registerSystem(id,api){hooks[id]=api;}},BattleNavigation:{version:1,walls:[{a:{x:0,z:0},b:{x:10,z:0},openings:[]}],firingStations:[]},BattleNavigationPhysicality:{setWindowDebug(value){windowSettings.push(value);storage.battleWindowSlotsVisible=value?'1':'0';},occupiedStations:()=>[],bodyRadius:.45,navMargin:.45,routeMargin:1.15},BABYLON:{Vector3,Color3,MeshBuilder:{CreateLineSystem(name,options){const mesh={name,lines:options.lines,dispose(){this.disposed=true;}};meshes.push(mesh);return mesh;}}}};
  context.BattleCoverPositions={snapshot(){cover.calls++;return cover.slots;}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return{context,hooks,meshes,writes,windowSettings,storage,document,cover};
}
const env=boot(),api=env.context.BattleWorldDebug,panel=env.document.body.querySelector('.wd-panel');
const sim={scene:{},heightAt:()=>0,obstacles:[{type:'hedge',x:3,z:3,radius:1},{type:'rock',x:7,z:7,radius:1}],_roster:{us:[{faction:'us',root:{position:{x:0,z:0}},destination:{x:8,z:9},orderDestination:{x:8,z:9},_fireteamDestination:{x:7,z:9},_physicalPath:{points:[{x:1,z:1},{x:8,z:9}],index:0,finalGoalX:8,finalGoalZ:9}}],ge:[]}};
env.hooks['world-debug-overlay'].onBattleStart(sim);
assert.equal(env.cover.calls,0,'disabled cover layer never requests a snapshot');
const all=panel.querySelector('.wd-select-all'),none=panel.querySelector('.wd-select-none');
assert.ok(all&&none,'debug panel provides Select all and Select none buttons');
assert.equal(all.textContent,'Select all');assert.equal(none.textContent,'Select none');
const grid=panel.querySelector('.wd-grid'),checks=()=>grid.children.map(row=>row.children[0]);
function resetCounts(){env.writes.length=0;env.windowSettings.length=0;}
resetCounts();all.onclick();
assert.ok(Object.values(api.settings).every(Boolean));assert.ok(checks().every(check=>check.checked));
assert.deepEqual(env.writes,['battleWorldDebugV1'],'bulk enable persists the complete settings once');assert.deepEqual(env.windowSettings,[true],'bulk enable synchronizes window overlay once');
assert.equal(env.storage.battleWindowSlotsVisible,'1');
const created=env.meshes.filter(mesh=>!mesh.disposed);assert.ok(created.length>3,'bulk enable actually builds static and dynamic layers');
assert.equal(new Set(created.map(mesh=>mesh.name)).size,env.meshes.length,'bulk enable rebuilds each visible layer once');
assert.equal(env.cover.calls,1,'bulk enable samples authoritative slots once');
assert.match(panel.querySelector('.wd-status').textContent,/cover 1 occupied \/ 1 reserved \/ 3 total/);
const active=name=>env.meshes.findLast(mesh=>mesh.name===name&&!mesh.disposed);
for(const slot of env.cover.slots){const mesh=active('wd-dyn-cover-slots-'+slot.status);assert.ok(mesh);assert.equal(mesh.lines.length,2,'each slot has one ring and one outward tick');assert.equal(mesh.lines[0][0].x,slot.x+.45,'slot ring reflects the physical body radius');assert.equal(mesh.lines[0][0].z,slot.z);assert.equal(mesh.lines[1][1].x,slot.x+slot.normalX*1.1);assert.equal(mesh.lines[1][1].z,slot.z+slot.normalZ*1.1);}
api.set('buildings',false);assert.equal(env.cover.calls,1,'status updates reuse the most recent cover snapshot');
const filter=panel.querySelector('.wd-filter');filter.value='us';filter.onchange();
assert.ok(active('wd-dyn-cover-slots-free')&&active('wd-dyn-cover-slots-reserved'));assert.ok(!active('wd-dyn-cover-slots-occupied'),'US filter excludes German claims');
filter.value='ge';filter.onchange();
assert.ok(active('wd-dyn-cover-slots-free')&&active('wd-dyn-cover-slots-occupied'));assert.ok(!active('wd-dyn-cover-slots-reserved'),'German filter excludes US claims');
filter.value='all';filter.onchange();
resetCounts();none.onclick();
assert.ok(Object.values(api.settings).every(value=>!value));assert.ok(checks().every(check=>!check.checked));
assert.ok(env.meshes.every(mesh=>mesh.disposed),'bulk disable removes every overlay mesh');
assert.deepEqual(env.writes,['battleWorldDebugV1']);assert.deepEqual(env.windowSettings,[false]);assert.equal(env.storage.battleWindowSlotsVisible,'0');
let saved=JSON.parse(env.storage.battleWorldDebugV1);assert.ok(Object.values(saved).every(value=>!value));
// Individual changes and reload still use the same persistence and checkbox synchronization.
const paths=grid.children.find(row=>row.children[1].textContent==='Soldier paths').children[0];paths.checked=true;paths.onchange();
assert.equal(api.settings.paths,true);assert.equal(api.settings.windows,false);assert.equal(JSON.parse(env.storage.battleWorldDebugV1).paths,true);
const reloaded=boot(env.storage);assert.equal(reloaded.context.BattleWorldDebug.settings.paths,true);assert.equal(reloaded.context.BattleWorldDebug.settings.windows,false);
all.onclick();env.hooks['world-debug-overlay'].beforeBattleRestart();assert.ok(env.meshes.every(mesh=>mesh.disposed));
env.hooks['world-debug-overlay'].onBattleRestart(sim);assert.ok(env.meshes.some(mesh=>!mesh.disposed),'selected layers restore after restart');
console.log('PASS world debug bulk controls, batching, mesh cleanup, window sync, persistence, individual changes and restart; authoritative cover slot geometry, claims, faction filter and lazy snapshots');

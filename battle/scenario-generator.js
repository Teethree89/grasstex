/* Battle Sim / ww2fps AI lab v20 seeded scenario generator.
   Data-only on purpose: generation can later move into ww2fps unchanged while renderers, units
   and trainers consume the same descriptor. Battlefield scale matches ww2fps: 100x60 map units
   at 20 metres per unit = 2000m x 1200m. */
(function(root){
  'use strict';

  var MAP_W=2000,MAP_D=1200;
  var FEATURE_KEYS=['buildingDensity','objectiveCount','settlementAspect','meanBuildingArea','openFraction','objectiveSpacing','laneSpread','urbanComplexity','doorDensity','windowDensity','roadComplexity','terrainRoughness'];
  var active=null;

  function hashSeed(s){s=String(s==null?'default':s);var h=1779033703^s.length;for(var i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^h>>>16)>>>0;}
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function rngFor(seed,salt){return mulberry32(hashSeed(String(seed)+'|'+String(salt||'')));}
  function rr(r,a,b){return a+r()*(b-a);}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function round(v,n){var p=Math.pow(10,n||0);return Math.round(v*p)/p;}
  function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
  function overlaps(a,b,pad){pad=pad||0;return Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;}

  function openingsFor(building,r){
    var sides=['north','south','east','west'],openings=[],windows=[];
    var doorSide=sides[Math.floor(r()*sides.length)],doorOffset=0;
    var doorLength=(doorSide==='north'||doorSide==='south')?building.w:building.d;
    doorOffset=rr(r,-doorLength*.18,doorLength*.18);
    openings.push({id:building.id+'-door-0',type:'door',side:doorSide,offset:round(doorOffset,2),width:1.35,bottom:0,top:2.2});
    for(var si=0;si<sides.length;si++){
      var side=sides[si],len=(side==='north'||side==='south')?building.w:building.d;
      var bays=Math.max(1,Math.floor((len-2.2)/4.0));
      for(var i=0;i<bays;i++){
        var off=-len/2+(i+1)*len/(bays+1);
        if(side===doorSide&&Math.abs(off-doorOffset)<1.7)continue;
        if(r()<.18)continue;
        var win={id:building.id+'-win-'+side+'-'+i,type:'window',side:side,offset:round(off,2),width:1.25,bottom:.92,top:2.08};
        openings.push(win);windows.push(win);
      }
    }
    /* A second door on larger structures prevents one-entry dead ends and makes indoor routing
       useful rather than decorative. */
    if(building.w*building.d>185&&r()>.28){
      var opposite={north:'south',south:'north',east:'west',west:'east'}[doorSide],len2=(opposite==='north'||opposite==='south')?building.w:building.d;
      openings.push({id:building.id+'-door-1',type:'door',side:opposite,offset:round(rr(r,-len2*.15,len2*.15),2),width:1.35,bottom:0,top:2.2});
    }
    building.openings=openings;building.windowCount=windows.length;building.doorCount=openings.filter(function(o){return o.type==='door';}).length;
  }

  function makeBuilding(id,x,z,w,d,r){
    var b={id:id,x:round(x,2),z:round(z,2),w:round(w,2),d:round(d,2),h:3.15,rot:r()>.5?0:Math.PI/2,openings:[]};
    openingsFor(b,r);return b;
  }

  function generateBuildings(r,cx,cz,spanX,spanZ,count){
    var out=[],attempts=0;
    while(out.length<count&&attempts<count*55){attempts++;
      var avenue=r()<.55,side=r()<.5?-1:1;
      var x,z;
      if(avenue){x=cx+side*rr(r,22,spanX*.44);z=cz+rr(r,-spanZ*.43,spanZ*.43);}
      else{x=cx+rr(r,-spanX*.43,spanX*.43);z=cz+side*rr(r,20,spanZ*.43);}
      x+=rr(r,-15,15);z+=rr(r,-15,15);
      var w=rr(r,11,22),d=rr(r,9,18),candidate={x:x,z:z,w:w,d:d};
      var ok=true;for(var i=0;i<out.length;i++)if(overlaps(candidate,out[i],7)){ok=false;break;}
      if(!ok)continue;
      out.push(makeBuilding('B'+(out.length+1),x,z,w,d,r));
    }
    return out;
  }

  function generateObjectives(r,cx,cz,spanX,spanZ,count){
    var out=[];
    /* Always include a central tactical objective, then distribute the rest through the settlement. */
    out.push({id:'obj-center',type:'capture-zone',x:round(cx,1),z:round(cz,1),radius:34,label:'Central strongpoint',value:1.35});
    for(var i=1;i<count;i++){
      var angle=(i-1)/(Math.max(1,count-1))*Math.PI*2+rr(r,-.32,.32),rad=rr(r,.22,.44);
      out.push({id:'obj-'+(i+1),type:'capture-zone',x:round(cx+Math.cos(angle)*spanX*rad,1),z:round(cz+Math.sin(angle)*spanZ*rad,1),radius:rr(r,28,40),label:'Objective '+(i+1),value:round(rr(r,.85,1.45),2)});
    }
    return out;
  }

  function averageSpacing(points){if(points.length<2)return 0;var sum=0,n=0;for(var i=0;i<points.length;i++)for(var j=i+1;j<points.length;j++){sum+=dist(points[i],points[j]);n++;}return sum/n;}
  function fingerprint(s){
    var settleArea=s.settlement.spanX*s.settlement.spanZ,foot=0,doors=0,windows=0,meanArea=0;
    s.buildings.forEach(function(b){var a=b.w*b.d;foot+=a;meanArea+=a;doors+=b.doorCount||0;windows+=b.windowCount||0;});
    meanArea/=Math.max(1,s.buildings.length);
    var f={
      buildingDensity:clamp(s.buildings.length/28,0,1),
      objectiveCount:clamp(s.objectives.length/7,0,1),
      settlementAspect:clamp(Math.min(s.settlement.spanX,s.settlement.spanZ)/Math.max(s.settlement.spanX,s.settlement.spanZ),0,1),
      meanBuildingArea:clamp(meanArea/360,0,1),
      openFraction:clamp(1-foot/Math.max(1,settleArea),0,1),
      objectiveSpacing:clamp(averageSpacing(s.objectives)/500,0,1),
      laneSpread:clamp((s.spawnZones.us.lanes[s.spawnZones.us.lanes.length-1]-s.spawnZones.us.lanes[0])/MAP_W,0,1),
      urbanComplexity:clamp((s.buildings.length+s.objectives.length*2)/42,0,1),
      doorDensity:clamp(doors/Math.max(1,s.buildings.length*2),0,1),
      windowDensity:clamp(windows/Math.max(1,s.buildings.length*14),0,1),
      roadComplexity:clamp(s.roads.length/6,0,1),
      terrainRoughness:clamp(s.terrain.roughness,0,1)
    };
    var vector=FEATURE_KEYS.map(function(k){return round(f[k],4);});
    return {version:1,keys:FEATURE_KEYS.slice(),vector:vector,features:f};
  }
  function similarity(a,b){
    var av=a&&a.vector||a,bv=b&&b.vector||b;if(!av||!bv)return 0;var n=Math.min(av.length,bv.length),sum=0,weight=0;
    for(var i=0;i<n;i++){var w=(i===0||i===4||i===5||i===7)?1.35:1,d=(+av[i]||0)-(+bv[i]||0);sum+=w*d*d;weight+=w;}
    return clamp(1-Math.sqrt(sum/Math.max(.0001,weight)),0,1);
  }

  function create(seed,opts){
    opts=opts||{};seed=String(seed==null?'default':seed);var r=rngFor(seed,'scenario');
    var spanX=rr(r,430,720),spanZ=rr(r,300,500),cx=rr(r,-180,180),cz=rr(r,-85,85);
    var buildingCount=Math.round(rr(r,12,28)),objectiveCount=Math.round(rr(r,3,6));
    var lanes=[-700,-350,0,350,700],spawnZ=MAP_D/2-90;
    var scenario={version:20,seed:seed,id:'scn-'+hashSeed(seed).toString(16),map:{width:MAP_W,depth:MAP_D,unitM:20,source:'ww2fps MAPW/MAPH'},
      terrain:{roughness:round(rr(r,.18,.78),3)},settlement:{cx:round(cx,1),cz:round(cz,1),spanX:round(spanX,1),spanZ:round(spanZ,1)},
      spawnZones:{us:{z:-spawnZ,lanes:lanes.slice()},ge:{z:spawnZ,lanes:lanes.slice()}},
      roads:[{id:'road-ns',ax:cx,az:cz-spanZ*.58,bx:cx,bz:cz+spanZ*.58,width:10},{id:'road-ew',ax:cx-spanX*.58,az:cz,bx:cx+spanX*.58,bz:cz,width:10}],
      buildings:[],objectives:[],metadata:{trainingSeed:opts.trainingSeed||null,scenarioIndex:opts.scenarioIndex==null?null:opts.scenarioIndex}}
    ;
    if(r()>.38)scenario.roads.push({id:'road-diag',ax:cx-spanX*.46,az:cz-spanZ*.38,bx:cx+spanX*.46,bz:cz+spanZ*.38,width:7});
    scenario.buildings=generateBuildings(r,cx,cz,spanX,spanZ,buildingCount);
    scenario.objectives=generateObjectives(r,cx,cz,spanX,spanZ,objectiveCount);
    scenario.sectors=scenario.objectives;scenario.center={x:cx,z:cz};scenario.radius=Math.max(spanX,spanZ)*.62;
    scenario.fingerprint=fingerprint(scenario);return scenario;
  }
  function activate(seed,opts){active=create(seed,opts);root.BATTLE_SCENARIO=active;return active;}
  function setActive(s){active=s||null;root.BATTLE_SCENARIO=active;return active;}
  function current(){return active||root.BATTLE_SCENARIO||null;}
  function newSeed(prefix){return String(prefix||'train')+'-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*0xffffff).toString(36);}

  root.BattleScenarioGenerator={MAP_W:MAP_W,MAP_D:MAP_D,FEATURE_KEYS:FEATURE_KEYS.slice(),hashSeed:hashSeed,rngFor:rngFor,create:create,activate:activate,setActive:setActive,current:current,newSeed:newSeed,fingerprint:fingerprint,similarity:similarity};
  console.log('[SCENARIO] generator v20 loaded; battlefield='+MAP_W+'x'+MAP_D+'m');
})(typeof window!=='undefined'?window:globalThis);

/* Battle Sim / ww2fps AI lab v20 Policy Genome v2.
   A genome contains numerical tactical parameters, force-allocation doctrine and constrained
   tactical rules. Structural mutation/crossover can invent combinations without executing
   arbitrary generated code. Scenario memory blends successful genomes from similar maps. */
(function(root){
  'use strict';

  var API_BASE=root.BATTLE_API_BASE||'/grasstex/',ENDPOINT=API_BASE+'battle_policy.php',LEARNING=API_BASE+'battle_learning.php';
  var DEFAULT_PARAMETERS={
    cohesionRadius:34,captainlessCohesion:26,regroupHold:.40,cornerHold:.80,cornerNoCaptainExtra:.35,supportDelay:20,
    sectorNeutralNeed:75,sectorEnemyNeed:110,sectorActiveBonus:18,sectorDistanceWeight:.55,routeArrivalRadius:8,finalRouteRadius:14,
    captureCommitRatio:.82,contactDistance:28,townBoundary:58,engagedRallyAdvance:.16,pressObjectiveMinDistance:7,pressEnemyClearance:35,
    scoutLead:4,gunnerTrail:3,objectiveHoldWin:35,decisionSnapshotSeconds:5
  };
  var RANGES={
    cohesionRadius:[22,50],captainlessCohesion:[18,38],regroupHold:[.15,1.2],cornerHold:[.2,1.8],cornerNoCaptainExtra:[0,1.2],supportDelay:[0,45],
    sectorNeutralNeed:[35,120],sectorEnemyNeed:[60,170],sectorActiveBonus:[0,40],sectorDistanceWeight:[.2,1.1],routeArrivalRadius:[5,14],finalRouteRadius:[8,24],
    captureCommitRatio:[.55,.98],contactDistance:[16,48],townBoundary:[45,95],engagedRallyAdvance:[.04,.34],pressObjectiveMinDistance:[3,14],pressEnemyClearance:[18,65],
    scoutLead:[0,10],gunnerTrail:[0,8],objectiveHoldWin:[20,60],decisionSnapshotSeconds:[3,12]
  };
  var TUNABLE=['cohesionRadius','captainlessCohesion','regroupHold','cornerHold','supportDelay','sectorNeutralNeed','sectorEnemyNeed','sectorActiveBonus','sectorDistanceWeight','routeArrivalRadius','finalRouteRadius','captureCommitRatio','contactDistance','engagedRallyAdvance','pressEnemyClearance','scoutLead','gunnerTrail'];
  var DEFAULT_DOCTRINE={reserveFraction:.16,localSuperiority:1.15,flankPreference:.42,defenseCommitment:.34,riskTolerance:.56,objectiveStrategy:'balanced'};
  var DOCTRINE_RANGES={reserveFraction:[0,.42],localSuperiority:[.75,2.1],flankPreference:[0,1],defenseCommitment:[0,1],riskTolerance:[0,1]};
  var STRATEGIES=['balanced','nearest','highest-value','weakest-pressure','sequential'];
  var CONDITIONS=['objectiveNeutral','objectiveEnemy','objectiveOwned','enemyNear','outnumbered','notOutnumbered','captainDead','supportRole','insideObjective','underPressure'];
  var ACTIONS=['assault','flank','defend','hold','regroup','support'];
  var DEFAULT_RULES=[
    {id:'press-neutral',when:['objectiveNeutral','notOutnumbered'],action:'assault',weight:.78},
    {id:'defend-pressure',when:['objectiveOwned','underPressure'],action:'defend',weight:.74},
    {id:'flank-strongpoint',when:['objectiveEnemy','outnumbered'],action:'flank',weight:.69},
    {id:'regroup-leaderless',when:['outnumbered','captainDead'],action:'regroup',weight:.64}
  ];

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rnd(){return Math.random();}
  function pick(a){return a[Math.floor(rnd()*a.length)];}
  function cleanRule(raw,index){
    raw=raw||{};var when=Array.isArray(raw.when)?raw.when.filter(function(x){return CONDITIONS.indexOf(x)>=0;}):[];
    if(!when.length)when=[pick(CONDITIONS)];if(when.length>4)when=when.slice(0,4);
    var action=ACTIONS.indexOf(raw.action)>=0?raw.action:'assault',weight=clamp(isFinite(+raw.weight)?+raw.weight:.5,.05,1);
    return{id:String(raw.id||('rule-'+index)).replace(/[^a-z0-9_.-]/gi,'-').slice(0,50),when:Array.from(new Set(when)),action:action,weight:+weight.toFixed(3)};
  }
  function normalizeParameters(src){var out=clone(DEFAULT_PARAMETERS);src=src||{};Object.keys(DEFAULT_PARAMETERS).forEach(function(k){if(src[k]==null||!isFinite(+src[k]))return;var r=RANGES[k],v=+src[k];out[k]=r?clamp(v,r[0],r[1]):v;});return out;}
  function normalizeDoctrine(src){var out=clone(DEFAULT_DOCTRINE);src=src||{};Object.keys(DOCTRINE_RANGES).forEach(function(k){if(src[k]!=null&&isFinite(+src[k]))out[k]=clamp(+src[k],DOCTRINE_RANGES[k][0],DOCTRINE_RANGES[k][1]);});out.objectiveStrategy=STRATEGIES.indexOf(src.objectiveStrategy)>=0?src.objectiveStrategy:DEFAULT_DOCTRINE.objectiveStrategy;return out;}
  function normalize(input){
    input=input&&input.genome?input.genome:(input&&input.policy?input.policy:input)||{};
    /* v19 flat policies are promoted to a v2 genome transparently. */
    var hasV2=input.version===2||input.parameters||input.doctrine||input.rules;
    var parameters=normalizeParameters(hasV2?input.parameters:input),doctrine=normalizeDoctrine(hasV2?input.doctrine:null),rawRules=hasV2&&Array.isArray(input.rules)?input.rules:DEFAULT_RULES;
    var rules=rawRules.slice(0,12).map(cleanRule);if(!rules.length)rules=clone(DEFAULT_RULES);
    return{version:2,parameters:parameters,doctrine:doctrine,rules:rules};
  }

  var persisted=root.BATTLE_AI_POLICY||null,current=normalize(persisted&&persisted.genome?persisted.genome:(persisted&&persisted.policy?persisted.policy:persisted)),revision=persisted&&persisted.revision||0;
  var memory=root.BATTLE_AI_MEMORY&&Array.isArray(root.BATTLE_AI_MEMORY.experiences)?root.BATTLE_AI_MEMORY.experiences.slice():[],adaptCache=Object.create(null);
  function get(){return clone(current);}
  function set(next,meta){current=normalize(next);adaptCache=Object.create(null);if(meta&&meta.revision!=null)revision=+meta.revision||0;return get();}

  function mutate(base,strength){
    var out=normalize(base),s=strength==null?.16:+strength;
    TUNABLE.forEach(function(k){var r=RANGES[k],span=r[1]-r[0],j=(rnd()+rnd()+rnd()-1.5)/1.5;out.parameters[k]=clamp(out.parameters[k]+j*span*s,r[0],r[1]);out.parameters[k]=+(Math.abs(out.parameters[k])>=1?out.parameters[k].toFixed(3):out.parameters[k].toFixed(4));});
    Object.keys(DOCTRINE_RANGES).forEach(function(k){var r=DOCTRINE_RANGES[k],span=r[1]-r[0],j=(rnd()+rnd()-1);out.doctrine[k]=+clamp(out.doctrine[k]+j*span*s*1.15,r[0],r[1]).toFixed(3);});
    if(rnd()<.23)out.doctrine.objectiveStrategy=pick(STRATEGIES);
    var structural=1+Math.floor(rnd()*3);
    for(var m=0;m<structural;m++){
      var op=rnd();
      if(op<.28&&out.rules.length<12){out.rules.push(cleanRule({id:'r-'+Date.now().toString(36)+'-'+Math.floor(rnd()*9999),when:[pick(CONDITIONS),pick(CONDITIONS)],action:pick(ACTIONS),weight:.35+rnd()*.6},out.rules.length));}
      else if(op<.45&&out.rules.length>2){out.rules.splice(Math.floor(rnd()*out.rules.length),1);}
      else{var rule=out.rules[Math.floor(rnd()*out.rules.length)];if(!rule)continue;var q=rnd();if(q<.33)rule.action=pick(ACTIONS);else if(q<.66){if(rnd()<.5&&rule.when.length<4)rule.when.push(pick(CONDITIONS));else if(rule.when.length>1)rule.when.splice(Math.floor(rnd()*rule.when.length),1);rule.when=Array.from(new Set(rule.when));}else rule.weight=+clamp(rule.weight+(rnd()-.5)*.4,.05,1).toFixed(3);}
    }
    return normalize(out);
  }
  function crossover(a,b){a=normalize(a);b=normalize(b);var out=normalize(a);
    TUNABLE.forEach(function(k){out.parameters[k]=rnd()<.5?a.parameters[k]:b.parameters[k];if(rnd()<.25)out.parameters[k]=(a.parameters[k]+b.parameters[k])/2;});
    Object.keys(DOCTRINE_RANGES).forEach(function(k){out.doctrine[k]=rnd()<.5?a.doctrine[k]:b.doctrine[k];});out.doctrine.objectiveStrategy=rnd()<.5?a.doctrine.objectiveStrategy:b.doctrine.objectiveStrategy;
    var pool=a.rules.concat(b.rules),rules=[];for(var i=0;i<pool.length;i++)if(rnd()<.5&&!rules.some(function(x){return x.id===pool[i].id;}))rules.push(clone(pool[i]));out.rules=(rules.length?rules:clone(DEFAULT_RULES)).slice(0,12);return normalize(out);
  }
  function distance(a,b){a=normalize(a);b=normalize(b);var sum=0,n=0;TUNABLE.forEach(function(k){var r=RANGES[k],span=r[1]-r[0];sum+=Math.pow((a.parameters[k]-b.parameters[k])/span,2);n++;});Object.keys(DOCTRINE_RANGES).forEach(function(k){var r=DOCTRINE_RANGES[k],span=r[1]-r[0];sum+=Math.pow((a.doctrine[k]-b.doctrine[k])/span,2);n++;});var A={};a.rules.forEach(function(r){A[r.action+'|'+r.when.slice().sort().join('+')]=1;});var union=0,inter=0;b.rules.forEach(function(r){var k=r.action+'|'+r.when.slice().sort().join('+');if(A[k])inter++;else union++;});union+=Object.keys(A).length;var ruleDistance=union?1-inter/union:0;return Math.sqrt(sum/Math.max(1,n))*.75+ruleDistance*.25;}

  function contextMatch(condition,c){if(condition==='notOutnumbered')return !c.outnumbered;return !!c[condition];}
  function decide(genome,context){genome=normalize(genome);var best=null;for(var i=0;i<genome.rules.length;i++){var r=genome.rules[i],ok=true;for(var j=0;j<r.when.length;j++)if(!contextMatch(r.when[j],context)){ok=false;break;}if(ok&&(!best||r.weight>best.weight))best=r;}return best?clone(best):null;}

  function recall(scenario,limit){limit=limit||3;if(!scenario||!scenario.fingerprint)return[];var out=[];for(var i=0;i<memory.length;i++){var e=memory[i];if(!e||!e.fingerprint||!(e.genome||e.policy))continue;var sim=root.BattleScenarioGenerator?root.BattleScenarioGenerator.similarity(scenario.fingerprint,e.fingerprint):0;if(sim<.20)continue;out.push({experience:e,similarity:sim,score:+e.score||0,genome:normalize(e.genome||e.policy)});}out.sort(function(a,b){return(b.similarity*(1+Math.max(0,b.score)/100))-(a.similarity*(1+Math.max(0,a.score)/100));});return out.slice(0,limit);}
  function blend(base,sources){base=normalize(base);if(!sources||!sources.length)return{genome:base,sources:[]};var out=normalize(base),baseW=1.5,total=baseW;
    var weighted=sources.map(function(s){var w=Math.pow(s.similarity,2)*(1+Math.max(0,s.score)/120);total+=w;return{s:s,w:w};});
    TUNABLE.forEach(function(k){var v=base.parameters[k]*baseW;weighted.forEach(function(x){v+=x.s.genome.parameters[k]*x.w;});out.parameters[k]=v/total;});
    Object.keys(DOCTRINE_RANGES).forEach(function(k){var v=base.doctrine[k]*baseW;weighted.forEach(function(x){v+=x.s.genome.doctrine[k]*x.w;});out.doctrine[k]=v/total;});
    var strategyScore={};strategyScore[base.doctrine.objectiveStrategy]=baseW;weighted.forEach(function(x){var st=x.s.genome.doctrine.objectiveStrategy;strategyScore[st]=(strategyScore[st]||0)+x.w;});out.doctrine.objectiveStrategy=Object.keys(strategyScore).sort(function(a,b){return strategyScore[b]-strategyScore[a];})[0];
    var ruleScore=Object.create(null),ruleMap=Object.create(null);function addRules(g,w){g.rules.forEach(function(r){var key=r.action+'|'+r.when.slice().sort().join('+');ruleScore[key]=(ruleScore[key]||0)+w*r.weight;if(!ruleMap[key])ruleMap[key]=clone(r);});}addRules(base,baseW);weighted.forEach(function(x){addRules(x.s.genome,x.w);});out.rules=Object.keys(ruleScore).sort(function(a,b){return ruleScore[b]-ruleScore[a];}).slice(0,8).map(function(k){var r=ruleMap[k];r.weight=clamp(ruleScore[k]/total,.08,1);return r;});
    return{genome:normalize(out),sources:sources.map(function(s){return{seed:s.experience.seed||null,scenarioId:s.experience.scenarioId||null,similarity:+s.similarity.toFixed(3),score:s.score,revision:s.experience.revision||null};})};
  }
  function adaptedForScenario(scenario){if(!scenario)return{genome:get(),sources:[]};var key=scenario.id+'|r'+revision;if(adaptCache[key])return clone(adaptCache[key]);var result=blend(current,recall(scenario,3));adaptCache[key]=result;return clone(result);}
  function genomeFor(sim,faction){if(sim&&sim.aiGenomes&&sim.aiGenomes[faction])return sim.aiGenomes[faction];var sc=sim&&sim.scene&&sim.scene.metadata&&sim.scene.metadata.battleScenario;return adaptedForScenario(sc).genome;}
  function policyFor(sim,faction){return genomeFor(sim,faction).parameters;}
  function setMatchPolicies(sim,us,ge){sim.aiGenomes={us:normalize(us||current),ge:normalize(ge||current)};return sim.aiGenomes;}
  function clearMatchPolicies(sim){if(sim)sim.aiGenomes=null;}

  function persist(next,meta){if(root.BATTLE_PREVIEW)return Promise.resolve({ok:false,preview:true,revision:revision}); /* branch previews never write production policy */var payload={genome:normalize(next),meta:meta||{},baseRevision:revision};return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j&&j.error||('policy save HTTP '+r.status));return j;});}).then(function(j){if(!j||!j.ok)throw new Error(j&&j.error||'policy save failed');current=normalize(j.genome||j.policy||payload.genome);revision=j.revision||revision;root.BATTLE_AI_POLICY=j;adaptCache=Object.create(null);console.log('[POLICY] Genome v2 persisted revision '+revision);return j;});}
  function refresh(){return fetch(ENDPOINT+'?ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.ok&&(j.genome||j.policy)){current=normalize(j.genome||j.policy);revision=j.revision||revision;root.BATTLE_AI_POLICY=j;adaptCache=Object.create(null);}return{genome:get(),revision:revision};});}
  function remember(experience){if(root.BATTLE_PREVIEW)return Promise.resolve({ok:false,preview:true});experience=experience||{};return fetch(LEARNING,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'experience',experience:experience}),cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.ok&&j.experience){memory.push(j.experience);if(memory.length>240)memory=memory.slice(-240);adaptCache=Object.create(null);}return j;}).catch(function(){return null;});}
  function memoryList(){return clone(memory);}

  root.BattleAIPolicy={version:2,defaults:normalize({version:2,parameters:DEFAULT_PARAMETERS,doctrine:DEFAULT_DOCTRINE,rules:DEFAULT_RULES}),ranges:clone(RANGES),tunable:TUNABLE.slice(),conditions:CONDITIONS.slice(),actions:ACTIONS.slice(),strategies:STRATEGIES.slice(),normalize:normalize,get:get,set:set,genomeFor:genomeFor,policyFor:policyFor,setMatchPolicies:setMatchPolicies,clearMatchPolicies:clearMatchPolicies,mutate:mutate,crossover:crossover,distance:distance,decide:decide,recall:recall,blend:blend,adaptedForScenario:adaptedForScenario,persist:persist,refresh:refresh,remember:remember,memory:memoryList,get revision(){return revision;}};
  console.log('[POLICY] Genome v2 runtime loaded; revision='+revision+' memories='+memory.length);
})(typeof window!=='undefined'?window:globalThis);

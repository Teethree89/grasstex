#!/usr/bin/env node
/* Each fireteam holds its own ground. The Squad Leader (16-squad-plan-stability.js) places every
   fireteam's order anchor at its own offset in the squad frame; when team anchors were averaged from
   interleaved per-man formation slots they collapsed onto each other and the teams walked through
   one another. Sampled from the published fireteam orders while squads march, deploy and fight. */
'use strict';
const H=require('./harness');
const SEED=+(process.env.HARNESS_SEED||12345),MIN_GAP=5;
let failures=0;
function check(name,ok,detail){if(ok)console.log('  PASS  '+name);else{failures++;console.log('  FAIL  '+name+(detail?'  ('+detail+')':''));}}
function sampleGaps(sq,out){
  const o=sq._fireteamOrders||{},keys=Object.keys(o).filter(k=>o[k]&&o[k].anchor&&sq.members.some(s=>!s.dead&&s._fireteamKey===k));
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const a=o[keys[i]].anchor,b=o[keys[j]].anchor,d=Math.hypot(a.x-b.x,a.z-b.z);
    out.samples++;if(d<MIN_GAP){out.close++;out.pairs[keys[i]+'/'+keys[j]+' '+(sq.formation||'?')]=(out.pairs[keys[i]+'/'+keys[j]+' '+(sq.formation||'?')]||0)+1;}
    out.min=Math.min(out.min,d);
  }
}
const forms={};
function scenario(name,gap,objectiveDist){
  H.resetIds();const root=H.bootstrap({}),battle=H.makeBattle(root,{obstacles:[],seed:SEED});
  const us=H.addSquad(root,battle,{id:'us-0',faction:'us',x:0,z:-gap/2,objective:{x:0,z:-gap/2+objectiveDist},facing:0,seed:SEED});
  if(gap<400)H.addSquad(root,battle,{id:'ge-0',faction:'ge',x:0,z:gap/2,objective:{x:0,z:-gap/2},facing:Math.PI,seed:SEED+1});
  const out={samples:0,close:0,min:Infinity,pairs:{}};
  H.run(root,battle,40,()=>{forms[us.formation]=1;if(battle.time>2)sampleGaps(us,out);});
  const rate=out.samples?out.close/out.samples:0;
  check(name+': fireteam anchors stay '+MIN_GAP+' m apart',out.samples>0&&rate<=0.02,
    (100*rate).toFixed(1)+'% of '+out.samples+' pair samples closer, min '+out.min.toFixed(1)+' m '+JSON.stringify(out.pairs));
}
console.log('\n== each fireteam holds its own ground (seed '+SEED+') ==');
scenario('march to a distant objective',1000,160);
scenario('deploy near the objective',1000,40);
scenario('firefight at 120 m',120,120);
check('the scenarios covered more than one formation',Object.keys(forms).length>=2,Object.keys(forms).join(','));
if(failures){console.log('\n'+failures+' fireteam frontage checks FAILED');process.exit(1);}
console.log('\nAll fireteam frontage checks passed.');

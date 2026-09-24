#!/usr/bin/env node
'use strict';
/* Voice must not change the simulation. Whether a callout plays depends on the voice modules and the
   audio manifest; squad-ai.js callout() used to draw its cooldown jitter from the combat RNG, so the
   same seed simulated a different battle with and without voice (e.g. a headless run with no audio
   manifest versus the browser). Two identical duels, one with voice cooldowns forced on every
   soldier, must stay identical. */
const assert=require('node:assert/strict'),H=require('./harness');
function duel(voiceBusy){
  H.resetIds();
  const root=H.bootstrap(),battle=H.makeBattle(root,{seed:777});
  const us=H.addSquad(root,battle,{id:'us-0',faction:'us',x:0,z:-35,objective:{x:0,z:35},facing:0,seed:777});
  const ge=H.addSquad(root,battle,{id:'ge-0',faction:'ge',x:0,z:35,objective:{x:0,z:-35},facing:Math.PI,seed:778});
  let draws=0;const random=battle.random;battle.random=function(){draws++;return random.call(this);};
  // A voice module speaking sets voiceCooldown (47-contextual-voice-behavior.js); simulate it being busy.
  H.run(root,battle,20,()=>{if(voiceBusy)for(const s of us.members.concat(ge.members))s.voiceCooldown=battle.time+1;});
  const state=us.members.concat(ge.members).map(s=>[s.id,+s.root.position.x.toFixed(4),+s.root.position.z.toFixed(4),s.hp,!!s.dead]);
  return{state,draws,callouts:battle.events.callouts.length};
}
const quiet=duel(true),talking=duel(false);
assert.ok(talking.callouts>quiet.callouts,'test setup: suppressing voice must change how many callouts play');
assert.equal(talking.draws,quiet.draws,'callouts must not draw from the combat RNG');
assert.deepEqual(talking.state,quiet.state,'the battle must be identical with and without voice');
console.log('PASS voice callouts ('+talking.callouts+' vs '+quiet.callouts+') leave the combat RNG and the battle unchanged');

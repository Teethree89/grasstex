'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const proposals = [];
const context = {
  console,
  Math,
  JSON,
  isFinite,
  BattleModules: { registerSystem() {} },
  BattleCommanderAI: {
    policyFor() { return {}; },
    chooseObjective() { return null; }
  },
  BattleObjectiveSystem: {
    get() { return null; },
    status() { return {}; }
  },
  BattleMovementResolver: {
    proposeOrder(soldier, destination) {
      proposals.push({ soldier: soldier.id, destination: { x: destination.x, z: destination.z } });
      soldier.orderDestination = { x: destination.x, z: destination.z };
    }
  },
  SquadAI: {
    SLOT_SPACING: 1.25,
    formationFor() { return 'line'; },
    // Keep the committed fireteam anchor constant. The regression is specifically whether a
    // still-valid fireteam commitment silently rotates its individual slots when the live
    // command ray jitters inside the same Meso command signature.
    formationSlot(_sq, soldier) {
      return { x: (+soldier.slotIndex || 0) * 0.2, z: 0 };
    }
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('battle/modules/16-squad-plan-stability.js', 'utf8'), context, {
  filename: 'battle/modules/16-squad-plan-stability.js'
});

function soldier(id, slotIndex, x) {
  return {
    id,
    slotIndex,
    role: 'rifleman',
    dead: false,
    target: null,
    root: { position: { x, y: 0, z: 0 } },
    orderDestination: null
  };
}

const sq = {
  id: 'regression-squad',
  faction: 'us',
  // Regroup freezes the squad anchor without activating defensive-post capture, so this test
  // isolates formation-frame churn rather than a legitimate formation -> defense-post handoff.
  commandPhase: 'regroup',
  targetObjective: 'objective-a',
  objective: { x: 1.9, z: 10 },
  home: { x: 0, z: 0 },
  rally: { x: 0, z: 0 },
  orderAnchor: { x: 0, z: 0 },
  formation: 'line',
  members: [
    soldier('a1', 2, -0.5),
    soldier('a2', 4, 0),
    soldier('a3', 5, 0.5)
  ]
};
const battle = { time: 0 };

context.SquadAI.updateSquad(sq, battle);
const firstProposalCount = proposals.length;
const firstDestinations = sq.members.map(s => ({ x: s._fireteamDestination.x, z: s._fireteamDestination.z }));
assert.strictEqual(firstProposalCount, 3, 'initial fireteam commitment should publish one destination per member');
assert.ok(sq._fireteamOrders.alpha, 'alpha fireteam commitment should exist');
const signature = sq._fireteamOrders.alpha.signature;

// Rotate the live command ray substantially while remaining inside the same quantized command
// signature. This is commander/anchor jitter, not a new Meso commitment.
sq.objective = { x: -1.9, z: 10 };
battle.time = 0.45;
context.SquadAI.updateSquad(sq, battle);

assert.strictEqual(sq._fireteamOrders.alpha.signature, signature, 'test setup must keep the same Meso commitment signature');
assert.strictEqual(
  proposals.length,
  firstProposalCount,
  'a valid fireteam commitment must not republish formation slots solely because the live command ray changed'
);
for (let i = 0; i < sq.members.length; i++) {
  assert.deepStrictEqual(
    { x: sq.members[i]._fireteamDestination.x, z: sq.members[i]._fireteamDestination.z },
    firstDestinations[i],
    `member ${sq.members[i].id} formation slot changed without a fireteam recommit`
  );
}

console.log('PASS: committed fireteam frame remains stable across same-signature command-ray jitter (Meso owner regression)');

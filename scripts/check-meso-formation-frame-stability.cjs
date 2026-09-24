'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const proposals = [];
// The real lease primitive (squad-ai.js); everything else the Captain touches is stubbed below.
const { BattleLeases, SquadAI: real } = require('../tools/ai-sim-harness/harness').bootstrap({ modules: false });
const context = {
  BattleLeases,
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
    // The Captain attaches as the squad's command owner; this stub simply installs it.
    extend(stage, id, fn) { if (stage === 'squadCommand') this.updateSquad = fn; },
    SLOT_SPACING: 1.25,
    leaderOf: real.leaderOf,
    isLeader: real.isLeader,
    establishment: real.establishment,
    retreatGoal: real.retreatGoal,
    formationFor() { return 'line'; },
    // A deterministic formation around the Captain-owned squad anchor. This keeps the test about
    // Meso commitment lifecycle rather than production formation geometry.
    formationSlot(sq, soldier) {
      const a = sq.orderAnchor || sq.rally || { x: 0, z: 0 };
      return { x: a.x + (+soldier.slotIndex || 0) * 0.2, z: a.z };
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

// Regression 1: the orientation of a valid commitment is part of the commitment. Live command-ray
// jitter inside the same command signature must not rotate the soldier slots.
const sq = {
  id: 'frame-regression-squad',
  faction: 'us',
  commandPhase: 'regroup',
  targetObjective: 'objective-a',
  objective: { x: 1.9, z: 10 },
  home: { x: 0, z: 0 },
  rally: { x: 0, z: 0 },
  orderAnchor: { x: 0, z: 0 },
  formation: 'line',
  members: [soldier('a1', 2, -0.5), soldier('a2', 4, 0), soldier('a3', 5, 0.5)]
};
const battle = { time: 0 };
context.SquadAI.updateSquad(sq, battle);
const firstProposalCount = proposals.length;
const firstDestinations = sq.members.map(s => ({ x: s._fireteamDestination.x, z: s._fireteamDestination.z }));
assert.strictEqual(firstProposalCount, 3, 'initial fireteam commitment should publish one destination per member');
assert.ok(sq._fireteamOrders.alpha, 'alpha fireteam commitment should exist');
const signature = sq._fireteamOrders.alpha.signature;
sq.objective = { x: -1.9, z: 10 };
battle.time = 0.45;
context.SquadAI.updateSquad(sq, battle);
assert.strictEqual(sq._fireteamOrders.alpha.signature, signature, 'test setup must keep the same Meso commitment signature');
assert.strictEqual(proposals.length, firstProposalCount, 'same-signature command-ray jitter must not republish formation slots');
for (let i = 0; i < sq.members.length; i++) {
  assert.deepStrictEqual({ x: sq.members[i]._fireteamDestination.x, z: sq.members[i]._fireteamDestination.z }, firstDestinations[i], `member ${sq.members[i].id} formation slot changed without a fireteam recommit`);
}

// Regression 2: a fireteam order is a commitment, not a moving target. If the squad anchor has
// advanced but this fireteam has merely begun moving toward its current slot, do not leapfrog its
// destination forward. Recommit only after the fireteam reaches the committed anchor (or the Meso
// command signature materially changes).
const sq2 = {
  id: 'moving-goal-regression-squad',
  faction: 'us',
  commandPhase: 'approach',
  targetObjective: 'objective-b',
  objective: { x: 100, z: 0 },
  home: { x: 0, z: 0 },
  rally: { x: 0, z: 0 },
  orderAnchor: { x: 0, z: 0 },
  formation: 'line',
  members: [soldier('b1', 2, -0.5), soldier('b2', 4, 0), soldier('b3', 5, 0.5)]
};
const battle2 = { time: 0 };
context.SquadAI.updateSquad(sq2, battle2);
const committed = sq2._fireteamOrders.alpha;
assert.ok(committed, 'moving-goal test needs an alpha commitment');
const committedAnchor = { x: committed.anchor.x, z: committed.anchor.z };
const committedSignature = committed.signature;
const alphaProposalCount = () => proposals.filter(p => /^b[123]$/.test(String(p.soldier))).length;
const beforeMovingProposalCount = alphaProposalCount();
const beforeMovingDestinations = sq2.members.map(s => ({ x: s._fireteamDestination.x, z: s._fireteamDestination.z }));

// Move the squad anchor >20m ahead while keeping the same objective/signature. Keep the fireteam
// well short of its committed anchor, but move it >2.5m from the origin that was recorded when the
// order was issued. The old producer treated that tiny amount of progress as permission to move
// the goal again.
sq2.orderAnchor.x += 30;
sq2.rally = { x: sq2.orderAnchor.x, z: sq2.orderAnchor.z };
const awayX = committed.origin.x <= committed.anchor.x ? -1 : 1;
for (const s of sq2.members) {
  s.root.position.x = committed.origin.x + awayX * 6;
  s.root.position.z = committed.origin.z;
  s.orderDestination = { x: 999, z: 999 }; // prevent the squad-wide cohesion gate advancing again
}
battle2.time = 0.45;
context.SquadAI.updateSquad(sq2, battle2);

assert.strictEqual(sq2._fireteamOrders.alpha.signature, committedSignature, 'moving-goal test must stay inside one Meso signature');
assert.deepStrictEqual({ x: sq2._fireteamOrders.alpha.anchor.x, z: sq2._fireteamOrders.alpha.anchor.z }, committedAnchor, 'fireteam anchor moved before the fireteam arrived');
assert.strictEqual(alphaProposalCount(), beforeMovingProposalCount, 'merely moving 2.5m+ toward a committed order must not publish a new moving goal');
for (let i = 0; i < sq2.members.length; i++) {
  assert.deepStrictEqual({ x: sq2.members[i]._fireteamDestination.x, z: sq2.members[i]._fireteamDestination.z }, beforeMovingDestinations[i], `member ${sq2.members[i].id} chased a moving formation goal before arrival`);
}

console.log('PASS: committed fireteam frame and destination remain stable until a real Meso recommit');

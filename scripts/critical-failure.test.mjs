import assert from "node:assert/strict";
import { isCriticalFailure, nextAutomaticFailureCount, rollDiceResults } from "../module/rules/critical-failure.mjs";

const doubleOnes = { dice:[{ results:[{ result:1, active:true }, { result:1, active:true }] }] };
const ordinaryRoll = { dice:[{ results:[{ result:1, active:true }, { result:2, active:true }] }] };
const discardedOne = { dice:[{ results:[{ result:1, active:true }, { result:1, active:false }, { result:4, active:true }] }] };

assert.deepEqual(rollDiceResults(doubleOnes), [1, 1]);
assert.equal(isCriticalFailure(doubleOnes), true);
assert.equal(isCriticalFailure(ordinaryRoll), false);
assert.equal(isCriticalFailure(discardedOne), false);
assert.equal(nextAutomaticFailureCount({ automaticFailureCount:3 }), 4);
assert.equal(nextAutomaticFailureCount({ automaticFailureCount:1, automaticFailures:[true, true, false] }), 3);

console.log("Critical-failure counter tests passed.");

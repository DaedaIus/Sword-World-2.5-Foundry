import assert from "node:assert/strict";
import { characterAbilityScore, characterAdventurerLevel, characterHPMaximum } from "../module/rules/resources.mjs";

const system = {
  abilityBases:{ body:9 },
  abilityAdjustments:{ d:{ growth:4, correction:2, temporary:-1 } },
  hp:{ max:999 }
};
const classes = [
  { type:"class", system:{ level:5 } },
  { type:"class", system:{ level:3 } },
  { type:"weapon", system:{ level:20 } }
];

assert.equal(characterAbilityScore(system, "body", "d"), 14);
assert.equal(characterAdventurerLevel(classes), 5);
assert.equal(characterHPMaximum(system, classes), 29);
assert.notEqual(characterHPMaximum(system, classes), 17, "HP must use Vitality itself, not its +2 modifier.");
assert.notEqual(characterHPMaximum(system, classes), system.hp.max, "A stale saved maximum must not override the formula.");

console.log("Character resource tests passed.");

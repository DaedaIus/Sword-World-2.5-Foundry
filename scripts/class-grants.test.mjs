import assert from "node:assert/strict";
import {
  isMartialArtistClass,
  martialArtistGrantDocuments,
  missingMartialArtistGrantDocuments
} from "../module/rules/class-grants.mjs";

assert.equal(isMartialArtistClass({ type:"class", name:"Martial Artist" }), true);
assert.equal(isMartialArtistClass({ type:"class", name:"gRaPpLeR" }), true);
assert.equal(isMartialArtistClass({ type:"class", name:"Fighter" }), false);

const grants = martialArtistGrantDocuments();
assert.deepEqual(grants.map(item => [item.name, item.type]), [["Chain Attack", "feat"], ["Throw", "weapon"]]);

const chainAttack = grants.find(item => item.name === "Chain Attack");
assert.equal(chainAttack.system.className, "Martial Artist");
assert.match(chainAttack.system.description, /additional melee attack/);

const throwingAttack = grants.find(item => item.name === "Throw");
assert.equal(throwingAttack.system.equipped, true);
assert.equal(throwingAttack.system.stance, "2H");
assert.equal(throwingAttack.system.accuracy, -1);
assert.equal(throwingAttack.system.power, 0);
assert.equal(throwingAttack.system.critical, 12);
assert.deepEqual(Object.values(throwingAttack.system.powerTable), [1, 1, 2, 3, 3, 4, 5, 5, 6, 7]);

assert.equal(missingMartialArtistGrantDocuments([]).length, 2);
assert.deepEqual(
  missingMartialArtistGrantDocuments([{ name:"Chain Attack", type:"feat", system:{} }]).map(item => item.name),
  ["Throw"]
);
assert.equal(missingMartialArtistGrantDocuments(grants).length, 0);

console.log("Class-grant regression tests passed.");

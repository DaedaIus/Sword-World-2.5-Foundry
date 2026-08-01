import assert from "node:assert/strict";
import { abilityBonus, isGunWeapon, isWarriorClass, weaponDamageParts } from "../module/rules/weapon-damage.mjs";

const classItem = (name, classType, level = 1) => ({ type: "class", name, system: { classType, level } });
assert.equal(isWarriorClass(classItem("Fighter", "Warrior")), true);
assert.equal(isWarriorClass(classItem("FIGHTER", "warrior")), true);
assert.equal(isWarriorClass(classItem("Artificer", "Wizard")), false);

assert.equal(isGunWeapon({ name: "Long Gun", system: {} }), true);
assert.equal(isGunWeapon({ name: "Sidearm", system: { category: "GUNS" } }), true);
assert.equal(isGunWeapon({ name: "Sword", system: { category: "Blade" } }), false);

const actorSystem = {
  abilityBases: { body: 12, mind: 15 },
  abilityAdjustments: {
    c: { growth: 2, correction: 4 },
    e: { growth: 1, correction: 2 }
  }
};
assert.equal(abilityBonus(actorSystem, "strength"), 3);
assert.equal(abilityBonus(actorSystem, "intelligence"), 3);

const sword = { name: "Sword", system: { category: "Sword", powerTable: { "7": 5 }, additionalDamage: 1 } };
assert.deepEqual(
  weaponDamageParts({ weapon: sword, actorSystem, attackingClass: classItem("Fighter", "Warrior", 2), diceTotal: 7 }),
  { gun: false, lookup: 7, tableValue: 5, classLevel: 2, ability: "strength", bonus: 3, additionalDamage: 1, total: 11 }
);

const gun = { name: "PISTOL", system: { category: "gUn", powerTable: { "8": 6 }, additionalDamage: 0 } };
assert.equal(
  weaponDamageParts({ weapon: gun, actorSystem, attackingClass: classItem("ARTIFICER", "Wizard", 4), diceTotal: 8 }).total,
  13
);

console.log("Weapon damage rules passed.");

import assert from "node:assert/strict";
import { parseClassSpecificItems, parseEquipmentTables } from "../module/importer/equipment-parser.mjs";
import { SW25Importer } from "../module/importer/sw25-importer.mjs";
import { magicHerbSystemPatch, recoveryPowerResult, recoveryResource } from "../module/rules/recovery-items.mjs";

const source = `### Camping Equipment
Name Stance Price Notes
Tableware Set-12 Cup, Plate, Bowl
Cooking Utensil Set 2H 50 Frypan, Pan, Cooking Spoon
Easy-to-use Cooking Set 2H 50 + 5 reputation Gives +1 for cooking-related Skill Checks.
Tent-250+250 for 4 people
* * *
### Clothing
Name Stance Price Notes
Casual Wear-6 – 8 Shirt 6G, Skirt 7G, Pants 8G
### Miscellaneous
Name Stance Price Notes
Paint 20+
Hourglass-120+3-minute measuring time.`;
const tables = parseEquipmentTables(source, "http://sw25.wikidot.com/items:general-equipment");
assert.equal(tables.length, 3);
assert.equal(tables[0].items[0].name, "Tableware Set");
assert.equal(tables[0].items[1].stance, "2H");
assert.equal(tables[0].items[2].reputationRequirement, 5);
assert.equal(tables[0].items[3].priceText, "250+");
assert.equal(tables[1].items[0].priceText, "6 – 8");
assert.equal(tables[2].items[0].name, "Paint");
assert.equal(tables[2].items[1].notes, "3-minute measuring time.");

const consumables = parseEquipmentTables(`Name Stance Price Notes
Potion Ball 1H 20 Allows throwing potion as a thrown weapon.
Sake Seeds (x10)-100 Turn water into sake
Guardian Stone-100+Reduces Magic Damage
Moonlight Charm-500/1,500/5,000 Bonus to Willpower.`, "http://sw25.wikidot.com/items:adventure-tools-consumable", {
  defaultCategory:"Adventure Tools (Consumable)", consumable:true
});
assert.equal(consumables.length, 1);
assert.equal(consumables[0].items.length, 4);
assert.equal(consumables[0].items[0].stance, "1H");
assert.equal(consumables[0].items[1].name, "Sake Seeds (x10)");
assert.equal(consumables[0].items[2].priceText, "100+");
assert.equal(consumables[0].items[3].priceText, "500/1,500/5,000");
assert.equal(consumables[0].items[3].consumable, true);

const accessories = parseEquipmentTables(`### Accessories: Face
Name Price Notes
Mask 2 Only covers the mouth and nose
Beard ornaments 3+Beads 3+, natural stones 6+
### Accessories: Back
Name Price Notes
Rangers' Cloak 1,000 + 20 reputation Requires Level 3 Ranger.`, "http://sw25.wikidot.com/items:accessories");
assert.equal(accessories.length, 2);
assert.equal(accessories[0].items[1].priceText, "3+");
assert.equal(accessories[1].items[0].category, "Accessories: Back");
assert.equal(accessories[1].items[0].reputationRequirement, 20);

const remedies = parseEquipmentTables(`### Herbs
Name Stance Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit Add'l Dmg Price Notes
Lifegrass-10 1 1 2 3 3 4 5 5 6 7 None-30 Restores Power 10 HP
Magic Herb-0 0 0 0 1 2 2 3 3 4 4 None-100 Restores Power 0 MP
### Potions
Name Stance Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit Add'l Dmg Price Notes
Healing Potion +1-20 1 2 3 4 5 6 7 8 9 10 None+1 200 Restores Power 20+1 HP
Magic Perfume-600 Restores MP using Ranger level and Intelligence modifier.
Name Stance Price Notes
Awake Potion-100 The same effect as an Awaken spell.
### Chemicals
Name Stance Price Notes
Smelling Salts 1H 20 Makes First Aid instant.`, "http://sw25.wikidot.com/items:herbs-potions-chemicals", { consumable:true });
assert.equal(remedies.length, 3);
assert.equal(remedies[0].items[0].name, "Lifegrass");
assert.equal(remedies[0].items[0].power, 10);
assert.equal(remedies[0].items[0].powerTable[3], 1);
assert.equal(remedies[0].items[0].powerTable[12], 7);
assert.equal(remedies[0].items[0].price, 30);
assert.equal(remedies[0].items[0].consumable, true);
assert.equal(remedies[0].items[1].name, "Magic Herb");
assert.equal(remedies[0].items[1].hasPowerTable, true);
assert.deepEqual(Object.values(remedies[0].items[1].powerTable), [0, 0, 0, 1, 2, 2, 3, 3, 4, 4]);
assert.equal(remedies[1].items[0].additionalDamage, 1);
assert.equal(remedies[1].items[1].name, "Magic Perfume");
assert.equal(remedies[1].items[1].hasPowerTable, false);
assert.equal(remedies[1].items[2].name, "Awake Potion");
assert.equal(remedies[2].items[0].stance, "1H");
assert.deepEqual(recoveryPowerResult(remedies[0].items[0], 8), { lookup:8, tableResult:4, additional:0, total:4 });
assert.deepEqual(recoveryPowerResult(remedies[1].items[0], 12), { lookup:12, tableResult:10, additional:1, total:11 });
assert.equal(recoveryResource({ name:"Magic Herb", system:{ notes:"Restores Power 0 MP" } }), "mp");
assert.equal(recoveryResource({ name:"Lifegrass", system:{ notes:"Restores Power 10 HP" } }), "hp");
const repairedMagicHerb = magicHerbSystemPatch({ name:"Magic Herb", type:"equipment", system:{} });
assert.equal(repairedMagicHerb["system.hasPowerTable"], true);
assert.equal(repairedMagicHerb["system.powerTable"]["12"], 4);

const adventurerSet = SW25Importer.equipmentDocuments({
  name:"Adventurer Set",
  category:"Camping Equipment",
  price:100,
  priceText:"100",
  notes:"Backpack, Waterskin, Blanket, 6 Torches, Tinderbox, 10m Rope, Small Knife",
  sourceUrl:"http://sw25.wikidot.com/items:general-equipment"
});
assert.equal(adventurerSet.length, 7);
assert.deepEqual(adventurerSet.map(item => item.name), ["Backpack", "Waterskin", "Blanket", "Torches", "Tinderbox", "10m Rope", "Small Knife"]);
assert.equal(adventurerSet.find(item => item.name === "Torches").system.quantity, 6);
assert.equal(adventurerSet.find(item => item.name === "Torches").system.consumable, true);
assert.equal(adventurerSet.find(item => item.name === "Backpack").system.price, 0);
assert.equal(parseEquipmentTables(`### Clothing
Name Stance Price Notes
Point Guard-100 Grappler only.`, "test")[0].items[0].notes, "Martial Artist only.");

const classSpecific = parseClassSpecificItems(`Name Stance Price Notes
Magical Implement 1H, 2H, R Hand, L Hand, Other 100 or weapon price + 100 Used to cast Truespeech Magic
Tiny Armor-2,120/6,120 Familiar's Defense +3/+6
Magisphere (Small)Any 200 Used to cast Magitech
Scout's Tools-100 Set of wire picks and skeleton keys
Famed Strategist Insignia Head, Neck, Back, R Hand, L Hand, Waist 3,000 + 50 reputation Insignia which maintains rank once
Staff of the Sacred Tree 1H or as staff 100 or staff price + 100 Implement to cast Nature Magic
Battle Banner As spear Spear + 2,000 + 30 reputation Flag attached to spear
※1: A footnote`, "http://sw25.wikidot.com/items:class-specific");
assert.equal(classSpecific.length, 1);
assert.equal(classSpecific[0].items.length, 7, JSON.stringify(classSpecific[0].items.map(item => item.name)));
assert.equal(classSpecific[0].items[0].name, "Magical Implement");
assert.equal(classSpecific[0].items[0].stance, "1H, 2H, R Hand, L Hand, Other");
assert.equal(classSpecific[0].items[0].priceText, "100 or weapon price + 100");
assert.equal(classSpecific[0].items[1].priceText, "2,120/6,120");
assert.equal(classSpecific[0].items[2].name, "Magisphere (Small)");
assert.equal(classSpecific[0].items[4].reputationRequirement, 50);
assert.equal(classSpecific[0].items[5].stance, "1H or as staff");
assert.equal(classSpecific[0].items[6].priceText, "Spear + 2,000 + 30 reputation");
console.log("Equipment importer tests passed.");

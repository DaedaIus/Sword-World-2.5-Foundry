import assert from "node:assert/strict";
import { SW25Importer } from "../module/importer/sw25-importer.mjs";
import { isNaturalPower, isNatureMagic, naturalPowerRemainder, resolveSpecialSpellDamage, specialDamageBands } from "../module/rules/spell-damage.mjs";
import { exhaustiveSuckingTotal, regenerationSpellData, regenerationStep } from "../module/rules/spell-effects.mjs";
import { defaultFeatureDefenseModifier, featureDefenseModifier } from "../module/rules/feature-defense.mjs";

assert.equal(SW25Importer.preferredClassName("Grappler"), "Martial Artist");
assert.equal(
  SW25Importer.readerTargets("https://sw25.wikidot.com/spell:healing-bullet")[0],
  "https://r.jina.ai/http%3A%2F%2Fsw25.wikidot.com%2Fspell%3Ahealing-bullet"
);
assert.deepEqual(SW25Importer.parseStartingClasses("Grappler + Scout"), ["Martial Artist", "Scout"]);
assert.deepEqual(SW25Importer.parseStartingClasses("Fighter or Grappler"), ["Fighter", "Martial Artist"]);

const mixedHumanBackgrounds = SW25Importer.parseBackgroundTablesMarkdown(`
#### Human Background Tables
##### Table 2
2d Background Starting Classes Skill/Body/Mind Experience
7 Mercenary Fighter or Grappler 7/10/4 2,000
##### Table 3
Background Starting Classes Skill/Body/Mind Experience
Daemon Tamer Daemonologist 6/6/9 2,000
Druid Druid 5/6/10 2,000
Jockey Rider 8/8/5 2,500
Alchemist Alchemist 7/6/8 2,500
##### Enhanced Racial Abilities
`, "Human");
assert.equal(mixedHumanBackgrounds.length, 2);
assert.equal(mixedHumanBackgrounds[0].entries[0].roll.label, "7");
assert.deepEqual(mixedHumanBackgrounds[0].entries[0].startingClasses, ["Fighter", "Martial Artist"]);
assert.equal(mixedHumanBackgrounds[1].entries.length, 4);
assert.equal(mixedHumanBackgrounds[1].entries[0].roll, null);
assert.equal(mixedHumanBackgrounds[1].entries[3].name, "Alchemist");

assert.equal(naturalPowerRemainder({ added:7, spent:3 }), 4);
assert.equal(naturalPowerRemainder({ added:7, spent:9 }), 0);
assert.equal(isNaturalPower({ name:"Natural Power II", system:{ sourceUrl:"http://sw25.wikidot.com/spell:natural-power-ii" } }), true);
assert.equal(isNatureMagic({ system:{ requirement:"Nature, Level 12" } }), true);
assert.equal(isNatureMagic({ system:{ requirement:"Truespeech, Level 12" } }), false);
const thornBashBands = specialDamageBands({ name:"Thorn Bash", system:{} });
assert.equal(resolveSpecialSpellDamage(thornBashBands, 5, 8).total, 12);
assert.equal(resolveSpecialSpellDamage(thornBashBands, 8, 8).total, 15);
assert.equal(resolveSpecialSpellDamage(thornBashBands, 11, 8).total, 21);
const kongSmashBands = specialDamageBands({ name:"Kong Smash", system:{} });
assert.equal(resolveSpecialSpellDamage(kongSmashBands, 5, 10).total, 22);
assert.equal(resolveSpecialSpellDamage(kongSmashBands, 8, 10).total, 25);
assert.equal(resolveSpecialSpellDamage(kongSmashBands, 11, 10).total, 28);
const boarRushBands = specialDamageBands({ name:"Boar Rush", system:{ sourceUrl:"http://sw25.wikidot.com/spell:bohr-rush" } });
assert.equal(resolveSpecialSpellDamage(boarRushBands, 5, 12).total, 25);
assert.equal(resolveSpecialSpellDamage(boarRushBands, 8, 12).total, 28);
assert.equal(resolveSpecialSpellDamage(boarRushBands, 11, 12).total, 31);
const marsavraSmashBands = specialDamageBands({ name:"Marsavra Smash", system:{} });
assert.equal(resolveSpecialSpellDamage(marsavraSmashBands, 5, 14).total, 32);
assert.equal(resolveSpecialSpellDamage(marsavraSmashBands, 8, 14).total, 35);
assert.equal(resolveSpecialSpellDamage(marsavraSmashBands, 11, 14).total, 38);
const lunarAttackBands = specialDamageBands({ name:"Lunar Attack", system:{} });
assert.equal(resolveSpecialSpellDamage(lunarAttackBands, 5, 16).total, 34);
assert.equal(resolveSpecialSpellDamage(lunarAttackBands, 8, 16).total, 37);
assert.equal(resolveSpecialSpellDamage(lunarAttackBands, 11, 16).total, 52);
const doubleStompBands = specialDamageBands({ name:"Double Stomp", system:{} });
assert.equal(resolveSpecialSpellDamage(doubleStompBands, 5, 18).total, 42);
assert.equal(resolveSpecialSpellDamage(doubleStompBands, 8, 18).total, 45);
assert.equal(resolveSpecialSpellDamage(doubleStompBands, 11, 18).total, 48);
assert.deepEqual(regenerationStep(8, 20, 6), { ended:false, healed:5, hp:13, turnsRemaining:5 });
assert.deepEqual(regenerationStep(18, 20, 1), { ended:true, healed:2, hp:20, turnsRemaining:0 });
assert.deepEqual(regenerationStep(0, 20, 6), { ended:true, healed:0, hp:0, turnsRemaining:0 });
assert.deepEqual(regenerationSpellData({ name:"Reproducer/Bloody Petal", system:{} }), { sourceKey:"reproducer-bloody-petal", healing:5, turns:6 });
assert.deepEqual(regenerationSpellData({ name:"Reproducer/Living Tree", system:{} }), { sourceKey:"reproducer-living-tree", healing:10, turns:6 });
assert.equal(exhaustiveSuckingTotal(17), 35);
assert.equal(defaultFeatureDefenseModifier("Scaly Hide"), 1);
assert.equal(defaultFeatureDefenseModifier("Scaley Hide"), 1);
assert.equal(featureDefenseModifier({ name:"Scaly Hide", system:{} }), 1);
assert.equal(featureDefenseModifier({ name:"Defensive Training", system:{ defenseModifier:2 } }), 2);
assert.equal(featureDefenseModifier({ name:"Unrelated Feat", system:{} }), 0);

const scalyHideFeat = SW25Importer.parseFeatMarkdown("# Scaly Hide\n\nLildrakens receive +1 Defense.", "http://example.test/feat:scaly-hide");
assert.equal(scalyHideFeat.defenseModifier, 1);

const fixedBackgrounds = SW25Importer.parseBackgroundTablesMarkdown(`Background Starting Classes Skill/Body/Mind Experience
Magitech Angel Fighter & Artificer & Sage & Scout 9/9/9 0`, "Magitech Angel");
assert.equal(fixedBackgrounds.length, 1);
assert.equal(fixedBackgrounds[0].fixed, true);
assert.equal(fixedBackgrounds[0].entries.length, 1);
assert.equal(fixedBackgrounds[0].entries[0].name, "Magitech Angel");
assert.deepEqual(fixedBackgrounds[0].entries[0].startingClasses, ["Fighter", "Artificer", "Sage", "Scout"]);
assert.deepEqual(
  [fixedBackgrounds[0].entries[0].skill, fixedBackgrounds[0].entries[0].body, fixedBackgrounds[0].entries[0].mind],
  [9, 9, 9]
);

const angelGear = SW25Importer.magitechAngelGearDocuments();
assert.equal(angelGear.length, 5);
assert.deepEqual(angelGear.filter(item => item.name === "Magitech Angel Spear").map(item => item.system.stance), ["1H†", "2H"]);
assert.equal(angelGear.find(item => item.name === "Magitech Angel Spear" && item.system.stance === "2H").system.power, 25);
assert.equal(angelGear.find(item => item.name === "Magitech Angel Armour").system.defence, 5);
assert.equal(angelGear.find(item => item.name === "Magitech Angel Shield").system.defence, 1);
assert.match(angelGear.find(item => item.name === "Angel Sphere").system.description, /Contractors cannot voluntarily terminate their contracts\./);

const featWithWikiHeading = SW25Importer.parseFeatMarkdown(`
Title: Sword World 2.5 Reference Wiki
Markdown Content:
# [**Sword World 2.5 Reference Wiki**](http://sw25.wikidot.com/)**
# Site Navigation
# Create a Page
Targeting
Prerequisite: None
Summary: Removes the ranged-attack penalty.
`, "https://sw25.wikidot.com/feat:targeting");
assert.equal(featWithWikiHeading.name, "Targeting");

const repeatedStrike = SW25Importer.parseFeatMarkdown(`
Title: Repeated Strike I - Sword World 2.5 Reference Wiki
Markdown Content:
# Sword World 2.5 Reference Wiki
# Repeated Strike I
This is SW2.0 content. While still fully compatible with Sword World 2.5, it has not been officially updated by Group SNE.

Prerequisite: None
Use: Fighter/Fencer/Battle Dancer class, 2H melee weapon

Application: 1 melee attack
Risk: None

This feat can be declared when performing a melee attack with a weapon with "Stance: 2H" and is valid for one attack.

If the declared attack is evaded, another melee attack can be made immediately afterward with the same weapon on the same target.

If multiple attacks are made simultaneously, another Accuracy check can be performed on all targets evading them. If either the first or second attack hits, a damage decision is made for each.

[dancer](http://sw25.wikidot.com/system:page-tags/tag/dancer#pages)[feat](http://sw25.wikidot.com/system:page-tags/tag/feat#pages)[feat-active](http://sw25.wikidot.com/system:page-tags/tag/feat-active#pages)[feat-selective](http://sw25.wikidot.com/system:page-tags/tag/feat-selective#pages)[fencer](http://sw25.wikidot.com/system:page-tags/tag/fencer#pages)[fighter](http://sw25.wikidot.com/system:page-tags/tag/fighter#pages)[fnopreq](http://sw25.wikidot.com/system:page-tags/tag/fnopreq#pages)
Help | Terms of Service | Privacy | Report a bug | Flag as objectionableHelp | Terms of Service | Privacy | Report a bug | Flag as objectionable | Update cookie settings|
`, "http://sw25.wikidot.com/feat:repeated-strike-i");
assert.equal(repeatedStrike.description, `This feat can be declared when performing a melee attack with a weapon with "Stance: 2H" and is valid for one attack.

If the declared attack is evaded, another melee attack can be made immediately afterward with the same weapon on the same target.

If multiple attacks are made simultaneously, another Accuracy check can be performed on all targets evading them. If either the first or second attack hits, a damage decision is made for each.`);

const spell = SW25Importer.parseClassFeature(`
Title: Dull Weapon - Sword World 2.5 Reference Wiki
Markdown Content:
# Sword World 2.5 Reference Wiki
# Dull Weapon
Truespeech Spell, Level 1 Sorcerer Required
MP: 2
Target: 1 character
Range/Area: 2 (30m) / Target
Duration: 3 minutes (18 rounds)
Resistance: Negates
Reduces the damage caused by the target's weapon.
`, "https://sw25.wikidot.com/spell:dull-weapon", {
  classId: "sorcerer-id", className: "Sorcerer", featureType: "spell"
});

assert.equal(spell.name, "Dull Weapon");
assert.equal(spell.type, "spell");
assert.equal(spell.classId, "sorcerer-id");
assert.equal(spell.requirement, "Truespeech Spell, Level 1 Sorcerer Required");
assert.equal(spell.mpCost, 2);
assert.match(spell.metadata, /Range\/Area: 2 \(30m\)/);
assert.match(spell.description, /Reduces the damage/);

const magitechList = SW25Importer.parseSpellList(`
### Level 1
[Flashlight](http://sw25.wikidot.com/spell:flashlight)
[Solid Bullet](/spell:solid-bullet)
### Level 2
[Critical Bullet](https://sw25.wikidot.com/spell:critical-bullet)
### Level 3
[Effect Weapon](https://sw25.wikidot.com/spell:effect-weapon)
`, "https://sw25.wikidot.com/spells:magitech", 2);
assert.deepEqual(magitechList, [
  { level:1, url:"https://sw25.wikidot.com/spell:flashlight" },
  { level:1, url:"https://sw25.wikidot.com/spell:solid-bullet" },
  { level:2, url:"https://sw25.wikidot.com/spell:critical-bullet" }
]);

const damagingSpell = SW25Importer.parseClassFeature(`
# Energy Bolt
Truespeech, Level 1
Cost: MP5
Summary: Deals Power 10 damage
Creates an arrow of mana.
Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit
10 1 1 2 3 3 4 5 5 6 7 ⑩
`, "https://sw25.wikidot.com/spell:energy-bolt", {
  classId: "sorcerer-id", className: "Sorcerer", featureType: "spell"
});
assert.equal(damagingSpell.mpCost, 5);
assert.equal(damagingSpell.hasPowerTable, true);
assert.equal(damagingSpell.power, 10);
assert.equal(damagingSpell.powerTable["3"], 1);
assert.equal(damagingSpell.powerTable["12"], 7);
assert.equal(damagingSpell.critical, 10);

const wolfsBite = SW25Importer.parseClassFeature(`
# Wolf's Bite
Druidic, Level 2
MP: 3
2d Damage
2-6 Sharp claws deal Magic Power points as physical damage.
7-9 Sharp teeth deal 3 + Magic Power points of physical damage.
10-12 A deep bite deals 6 + Magic Power points of physical damage.
`, "http://sw25.wikidot.com/spell:wolfs-bite", {
  classId:"druid-id", className:"Druid", featureType:"spell"
});
assert.deepEqual(wolfsBite.specialDamageBands.map(band => [band.min, band.max, band.bonus, band.damageType]), [
  [2, 6, 0, "physical"], [7, 9, 3, "physical"], [10, 12, 6, "physical"]
]);

const bulletSpell = SW25Importer.parseClassFeature(`
# Solid Bullet
Magitech, Level 1
Cost: MP1
Summary: Infuses a bullet with Power 20
Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit
20 1 2 3 4 5 6 7 8 9 10±0
`, "https://sw25.wikidot.com/spell:solid-bullet", {
  classId: "artificer-id", className: "Artificer", featureType: "spell"
});
assert.equal(bulletSpell.hasPowerTable, true);
assert.equal(bulletSpell.power, 20);
assert.equal(bulletSpell.powerTable["3"], 1);
assert.equal(bulletSpell.powerTable["12"], 10);
assert.equal(bulletSpell.criticalModifier, 0);

const criticalBullet = SW25Importer.parseClassFeature(`
# Critical Bullet
Magitech, Level 2
Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit
20 1 2 3 4 5 6 7 8 9 10-1
`, "https://sw25.wikidot.com/spell:critical-bullet", {
  classId: "artificer-id", className: "Artificer", featureType: "spell"
});
assert.equal(criticalBullet.hasPowerTable, true);
assert.equal(criticalBullet.criticalModifier, -1);

const evocation = SW25Importer.parseClassFeature(`
# Barkmail
Evocation, 1st Level Alchemist Required
Cards: Green x 1
Target: 1 character
Duration: 3 minutes (18 rounds)
The target's Defense is increased.
`, "https://sw25.wikidot.com/evocation:barkmail", {
  classId: "alchemist-id", className: "Alchemist", featureType: "evocation"
});

assert.equal(evocation.type, "ability");
assert.equal(evocation.cost, "Green x 1");
assert.equal(evocation.featureType, "evocation");
assert.equal(evocation.resourceData.suggestedCardColor, "green");
assert.equal(evocation.resourceData.cardCount, 1);

const aspect = SW25Importer.parseClassFeature(`
# Earthly Domain: Healing Earth
Aspect, 1st Level Geomancer Required
Cost: Earthly Qi 1 - 4
`, "https://sw25.wikidot.com/aspect:earthly-domain-healing-earth", { featureType: "aspect" });
assert.deepEqual(
  { type: aspect.resourceData.qiType, min: aspect.resourceData.qiMin, max: aspect.resourceData.qiMax },
  { type: "earthly", min: 1, max: 4 }
);

const spellsong = SW25Importer.parseClassFeature(`
# Ballad
Spellsong, Level 1 Bard Required
Base Rhythm: ⮯1
Extra Rhythm: ⮯1
`, "https://sw25.wikidot.com/spellsong:ballad", { featureType: "spellsong" });
assert.equal(spellsong.resourceData.baseRhythm.calming, 1);

const finale = SW25Importer.parseClassFeature(`
# Spring Breeze
Finale, Level 1 Bard Required
Rhythm Cost: ⮭2
`, "https://sw25.wikidot.com/finale:spring-breeze", { featureType: "finale" });
assert.equal(finale.resourceData.rhythmCost.uplifting, 2);

const weaving = SW25Importer.parseClassFeature(`
# Mind Binding Technique I
Essence Weaving, Level 1 Dark Hunter Required
Cost: 1dHP
`, "https://sw25.wikidot.com/weaving:mind-binding-technique-i", { featureType: "weaving" });
assert.equal(weaving.resourceData.hpCost, "1d");

const stratagem = SW25Importer.parseClassFeature(`
# Defiant Stand I
Stratagem, Level 1 Tactician Required
Edge Cost: None
Edge Accumulation: +1
`, "https://sw25.wikidot.com/stratagem:defiant-stand-i", { featureType: "stratagem" });
assert.equal(stratagem.resourceData.edgeAccumulation, 1);
assert.equal(stratagem.cost, "None");

const maneuver = SW25Importer.parseClassFeature(`
# Careful Guard I
Maneuver, Level 1 Tactician Required
Edge Cost: 3 Edge
`, "https://sw25.wikidot.com/maneuver:careful-guard-i", { featureType: "maneuver" });
assert.equal(maneuver.resourceData.edgeCost, 3);
assert.equal(maneuver.cost, "3 Edge");

console.log("Class feature importer tests passed.");

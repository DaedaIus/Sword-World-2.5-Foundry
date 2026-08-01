import assert from "node:assert/strict";
import { SW25Importer } from "../module/importer/sw25-importer.mjs";

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

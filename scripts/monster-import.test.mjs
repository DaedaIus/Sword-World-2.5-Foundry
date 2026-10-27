import assert from "node:assert/strict";
import { lootMatches, monsterDamageFormula, parseMonsterPage } from "../module/importer/monster-parser.mjs";

const sample = `Title: Goblin - Sword World 2.5 Reference Wiki
# Goblin
### Level 2 Barbarous
Intelligence: Low
Perception: Five Senses (Darkvision)
Disposition: Hostile
Soulscars: 2
Language: Barbaric, Youma
Habitat: Forest, Mountain, Cave
Reputation/Weakness: 5/10
Weak Point: Magic Damage +2
Initiative: 10
Movement Speed: 11/-
Fortitude: 3 (10)
Willpower: 3 (10)
Small and malicious humanoids.
Source: Core Rulebook I
| Fighting Style | Accuracy | Damage | Evasion | Defense | HP | MP |
| Weapon | 3 (10) | 2d+2 | 3 (10) | 2 | 16 | 10 |
#### Unique Skills
◯Night Vision
Can see in darkness.
| 2d | Loot |
| 2 - 7 | Crude Weapon (10G) |
| 8+ | Bag of Silver (30G) x 1d |`;

const parsed = parseMonsterPage(sample, "http://sw25.wikidot.com/monster:goblin");
assert.equal(parsed.name, "Goblin");
assert.equal(parsed.system.level, 2);
assert.equal(parsed.system.monsterType, "Barbarous");
assert.equal(parsed.system.combatStyles[0].style, "Weapon");
assert.equal(parsed.system.combatStyles[0].damage, "2d+2");
assert.equal(parsed.system.combatStyles[0].hp.max, 16);
assert.equal(parsed.system.uniqueSkills[0].title, "◯Night Vision");
assert.equal(parsed.system.lootTable.length, 2);
assert.equal(monsterDamageFormula("2d+7"), "2d6+7");
assert.equal(lootMatches("2 - 7", 7), true);
assert.equal(lootMatches("8+", 8), true);
assert.equal(lootMatches("Always", 2), true);

const flattened = `Title: Sword World 2.5 Reference Wiki
# Create a Page
Goblin
### Level 2 Barbarous
Intelligence: Low
Fighting Style Accuracy Damage Evasion Defense HP MP
Weapon 3 (10)2d+2 3 (10)2 16 12
#### Unique Skills
None.
2d Loot
2 - 3 Crude Weapon (10G)
10+High-quality Weapon (150G)`;
const flatParsed = parseMonsterPage(flattened, "http://sw25.wikidot.com/monster:goblin");
assert.equal(flatParsed.name, "Goblin");
assert.equal(flatParsed.system.combatStyles[0].damage, "2d+2");
assert.equal(flatParsed.system.combatStyles[0].mp.max, 12);
assert.equal(flatParsed.system.lootTable[1].roll, "10+");

const attachedAccuracy = `Title: Dinos - Sword World 2.5 Reference Wiki
### Level 4 Animal
Fighting Style Accuracy Damage Evasion Defense HP MP
Bite (Head)6 (13)2d+6 5 (12)3 26 9
Kick (Body)7 (14)2d+5 5 (12)4 34 13
#### Unique Skills`;
const dinos = parseMonsterPage(attachedAccuracy, "http://sw25.wikidot.com/monster:dinos");
assert.equal(dinos.system.combatStyles.length, 2);
assert.deepEqual(dinos.system.combatStyles.map(style => style.style), ["Bite (Head)", "Kick (Body)"]);
assert.equal(dinos.system.combatStyles[0].accuracy, "6 (13)");
assert.equal(dinos.system.combatStyles[1].damage, "2d+5");
assert.equal(dinos.system.combatStyles[1].hp.max, 34);

const dancingThornHtml = `<h3><span>Level 3 Plant</span></h3>
<table class="powertable monster">
<tr><td class="bbg">Fighting Style</td><td class="bbg">Accuracy</td><td class="bbg">Damage</td><td class="spacer">&nbsp;</td><td class="bbg">Evasion</td><td class="bbg">Defense</td><td class="spacer">&nbsp;</td><td class="bbg">HP</td><td class="bbg">MP</td></tr>
<tr><td>Slam</td><td>5 (12)</td><td>2d+4</td><td class="spacer">&nbsp;</td><td>4 (11)</td><td>2</td><td class="spacer">&nbsp;</td><td>23</td><td>4</td></tr>
</table><hr><h4><span>Unique Skills</span></h4>`;
const dancingThorn = parseMonsterPage(dancingThornHtml, "http://sw25.wikidot.com/monster:dancing-thorn");
assert.equal(dancingThorn.system.combatStyles.length, 1);
assert.deepEqual(dancingThorn.system.combatStyles[0], {
  style:"Slam", accuracy:"5 (12)", damage:"2d+4", evasion:"4 (11)", defense:2,
  hp:{ value:23, max:23 }, mp:{ value:4, max:4 }
});
console.log("Monster importer tests passed.");

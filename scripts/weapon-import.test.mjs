import assert from "node:assert/strict";
import { SW25Importer } from "../module/importer/sw25-importer.mjs";

const captured = `
### B-Rank Guns
Name Stance Min STR Max Magazine Accuracy Crit Add'l Dmg Range Price Notes
Matchlock 1H 1 3-â‘ª-1(10m)360
Jezail 2H 10 3-â‘©+1 2(50m)1,200

### A-Rank Guns
Name Stance Min STR Max Magazine Accuracy Crit Add'l Dmg Range Price Notes
Derringer 1H 1 2+1 â‘©-1(10m)600
Smart Carbine 2H 5 4-1 â‘©+2 2(30m)1,200â€»Details below
`;

const guns = SW25Importer.parseWeaponTables(captured, "https://sw25.wikidot.com/items:guns");
assert.equal(guns.length, 4);

const stavesSource = `### B-Rank Staves
Name Stance Min STR Acc.Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit Add'l Dmg Price Notes
Mage Staff![Image 1: hammericon.png](http://example/hammericon.png)2H 1+1 11 1 2 2 3 3 4 5 6 6 7 ⑫-110※Defense +1
Quarterstaff![Image 2: hammericon.png](http://example/hammericon.png)2H 4+1 14 1 2 3 4 4 4 5 6 7 8 ⑫-140※Defense +1`;
const staves = SW25Importer.parseWeaponTables(stavesSource, "https://sw25.wikidot.com/items:staves");
assert.equal(staves.length, 2);
assert.equal(staves[0].rank, "B");
assert.equal(staves[0].name, "Mage Staff");
assert.equal(staves[0].accuracy, 1);
assert.equal(staves[0].power, 11);
assert.equal(staves[0].critical, 12);
assert.equal(staves[0].price, 110);

const wrestlingSource = `### B-Rank Wrestling
Name Stance Min STR Acc.Power ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑫ Crit Add'l Dmg Price Notes
Throw![Image 3: hammericon.png](http://example/hammericon.png)2H 0-10 1 1 2 3 3 4 5 5 6 7 ⑫-※1`;
const wrestling = SW25Importer.parseWeaponTables(wrestlingSource, "https://sw25.wikidot.com/items:wrestling");
assert.equal(wrestling.length, 1);
assert.deepEqual(
  { name:wrestling[0].name, category:wrestling[0].category, rank:wrestling[0].rank, accuracy:wrestling[0].accuracy, power:wrestling[0].power },
  { name:"Throw", category:"wrestling", rank:"B", accuracy:-1, power:0 }
);

const stanceGroups = SW25Importer.groupWeaponStances([
  { name:"Long Sword", rank:"B", stance:"2H", minStrength:13 },
  { name:"Dagger", rank:"B", stance:"1H", minStrength:3 },
  { name:"Long Sword", rank:"B", stance:"1H", minStrength:13 }
]);
assert.equal(stanceGroups.length, 2);
assert.equal(stanceGroups[1][0].name, "Long Sword");
assert.deepEqual(stanceGroups[1].map(weapon => weapon.stance), ["1H", "2H"]);

const corrections = SW25Importer.parseCorrections(`Ability Scores
A 2d
B 1d+6
C 1d+6
D 2d
E 2d
F 2d
A later weapon entry has Power 25`);
assert.equal(corrections.a, "2d6");
assert.equal(corrections.b, "1d6+6");

const matchlock = guns.find(gun => gun.name === "Matchlock");
assert.deepEqual(
  {
    rank: matchlock.rank,
    magazine: matchlock.maxMagazine,
    accuracy: matchlock.accuracy,
    critical: matchlock.critical,
    additionalDamage: matchlock.additionalDamage,
    range: matchlock.range,
    price: matchlock.price,
    artificerPowered: matchlock.artificerPowered
  },
  { rank: "B", magazine: 3, accuracy: 0, critical: 11, additionalDamage: 0, range: "1(10m)", price: 360, artificerPowered: true }
);

const smartCarbine = guns.find(gun => gun.name === "Smart Carbine");
assert.equal(smartCarbine.accuracy, -1);
assert.equal(smartCarbine.additionalDamage, 2);
assert.equal(smartCarbine.notes, "");
assert.deepEqual(Object.values(smartCarbine.powerTable), Array(10).fill("-"));

console.log("Weapon importer tests passed.");

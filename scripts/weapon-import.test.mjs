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

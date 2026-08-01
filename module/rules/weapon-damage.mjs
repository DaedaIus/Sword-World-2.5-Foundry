const WARRIOR_CLASS_NAMES = new Set([
  "battle dancer", "fencer", "fighter", "grappler",
  "marksman", "martial artist",
]);

const normalize = value => String(value ?? "").trim().toLowerCase();

export function isWarriorClass(item) {
  if (!item || item.type !== "class") return false;
  const classType = normalize(item.system?.classType ?? item.system?.type)
    .replace(/-type\s+class$/, "")
    .trim();
  return classType === "warrior" || WARRIOR_CLASS_NAMES.has(normalize(item.name));
}

export function isGunWeapon(weapon) {
  if (!weapon) return false;
  if (Boolean(weapon.system?.artificerPowered)) return true;
  const searchable = [weapon.system?.category, weapon.system?.usage, weapon.system?.stance, weapon.name]
    .map(normalize)
    .join(" ");
  return /(?:^|\b)guns?(?:\b|$)/i.test(searchable);
}

export function abilityBonus(system, ability) {
  const map = { strength: ["body", "c"], intelligence: ["mind", "e"] };
  const [baseKey, adjustmentKey] = map[normalize(ability)] ?? [];
  if (!baseKey) return 0;
  const base = Number(system?.abilityBases?.[baseKey] ?? 0);
  const adjustment = system?.abilityAdjustments?.[adjustmentKey] ?? {};
  const score = base + Number(adjustment.growth ?? 0) + Number(adjustment.correction ?? 0);
  return Math.floor(score / 6);
}

export function weaponDamageParts({ weapon, actorSystem, attackingClass, diceTotal }) {
  const gun = isGunWeapon(weapon);
  const lookup = Math.min(12, Math.max(3, Number(diceTotal) || 0));
  const tableValue = Number(weapon?.system?.powerTable?.[String(lookup)] ?? 0);
  const classLevel = Number(attackingClass?.system?.level ?? 0);
  const ability = gun ? "intelligence" : "strength";
  const bonus = abilityBonus(actorSystem, ability);
  const additionalDamage = Number(weapon?.system?.additionalDamage ?? 0);
  return {
    gun, lookup, tableValue, classLevel, ability, bonus, additionalDamage,
    total: tableValue + classLevel + bonus + additionalDamage
  };
}

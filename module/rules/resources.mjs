export function characterAbilityScore(system = {}, baseName, letter) {
  const adjustment = system.abilityAdjustments?.[letter] || {};
  return Number(system.abilityBases?.[baseName] ?? 0)
    + Number(adjustment.growth ?? 0)
    + Number(adjustment.correction ?? 0)
    + Number(adjustment.temporary ?? 0);
}

export function characterAdventurerLevel(items = []) {
  return Array.from(items ?? [])
    .filter(item => item.type === "class")
    .reduce((highest, item) => Math.max(highest, Number(item.system?.level ?? 0)), 0);
}

export function characterHPMaximum(system = {}, items = []) {
  return characterAdventurerLevel(items) * 3 + characterAbilityScore(system, "body", "d");
}

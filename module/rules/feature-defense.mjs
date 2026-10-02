function normalizedFeatureName(value = "") {
  return String(value).trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function defaultFeatureDefenseModifier(name = "") {
  return ["scalyhide", "scaleyhide"].includes(normalizedFeatureName(name)) ? 1 : 0;
}

export function featureDefenseModifier(item = {}) {
  const explicit = Number(item.system?.defenseModifier ?? 0);
  return explicit || defaultFeatureDefenseModifier(item.name);
}

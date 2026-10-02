import { damageApplicationButton } from "../combat/damage-application.mjs";
import { criticalFailureHTML, isCriticalFailure, markCriticalFailure } from "./critical-failure.mjs";

const WOLFS_BITE_BANDS = [
  { min:2, max:6, bonus:0, damageType:"physical", text:"Magic Power points as physical damage." },
  { min:7, max:9, bonus:3, damageType:"physical", text:"3 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:6, damageType:"physical", text:"6 + Magic Power points of physical damage." }
];

const THORN_BASH_BANDS = [
  { min:2, max:6, bonus:4, damageType:"physical", text:"4 + Magic Power points of physical damage." },
  { min:7, max:9, bonus:7, damageType:"physical", text:"7 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:13, damageType:"physical", text:"13 + Magic Power points of physical damage." }
];

const KONG_SMASH_BANDS = [
  { min:2, max:6, bonus:12, damageType:"physical", text:"12 + Magic Power points of physical damage." },
  { min:7, max:9, bonus:15, damageType:"physical", text:"15 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:18, damageType:"physical", text:"18 + Magic Power points of physical damage." }
];

const BOAR_RUSH_BANDS = [
  { min:2, max:6, bonus:13, damageType:"physical", text:"13 + Magic Power points of physical damage." },
  { min:7, max:9, bonus:16, damageType:"physical", text:"16 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:19, damageType:"physical", text:"19 + Magic Power points of physical damage." }
];

const MARSAVRA_SMASH_BANDS = [
  { min:2, max:6, bonus:18, damageType:"physical", text:"18 + Magic Power points of physical damage." },
  { min:7, max:9, bonus:21, damageType:"physical", text:"21 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:24, damageType:"physical", text:"24 + Magic Power points of physical damage." }
];

const LUNAR_ATTACK_BANDS = [
  { min:2, max:6, bonus:18, damageType:"physical", text:"18 + Magic Power points of physical damage." },
  { min:7, max:9, bonus:21, damageType:"physical", text:"21 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:36, damageType:"physical", text:"36 + Magic Power points of physical damage." }
];

const DOUBLE_STOMP_BANDS = [
  { min:2, max:6, bonus:24, damageType:"physical", text:"24 + Magic Power points of physical damage." },
  { min:7, max:9, bonus:27, damageType:"physical", text:"27 + Magic Power points of physical damage." },
  { min:10, max:12, bonus:30, damageType:"physical", text:"30 + Magic Power points of physical damage." }
];

export function specialDamageBands(spell) {
  const stored = Array.isArray(spell?.system?.specialDamageBands) ? spell.system.specialDamageBands : [];
  if (stored.length) return stored;
  const source = String(spell?.system?.sourceUrl || "").toLowerCase();
  const name = String(spell?.name || "").trim().toLowerCase();
  if (source.includes("spell:wolfs-bite") || name === "wolf's bite" || name === "wolfs bite") return WOLFS_BITE_BANDS;
  if (source.includes("spell:thorn-bash") || name === "thorn bash") return THORN_BASH_BANDS;
  if (source.includes("spell:kong-smash") || name === "kong smash") return KONG_SMASH_BANDS;
  if (source.includes("spell:bohr-rush") || name === "boar rush" || name === "bohr rush") return BOAR_RUSH_BANDS;
  if (source.includes("spell:marsavra-smash") || name === "marsavra smash") return MARSAVRA_SMASH_BANDS;
  if (source.includes("spell:lunar-attack") || name === "lunar attack") return LUNAR_ATTACK_BANDS;
  if (source.includes("spell:double-stomp") || name === "double stomp") return DOUBLE_STOMP_BANDS;
  return [];
}

export function isDoubleStomp(spell) {
  const source = String(spell?.system?.sourceUrl || "").toLowerCase();
  const name = String(spell?.name || "").trim().toLowerCase();
  return source.includes("spell:double-stomp") || name === "double stomp";
}

export function isNaturalPower(spell) {
  const source = String(spell?.system?.sourceUrl || "").toLowerCase();
  const name = String(spell?.name || "").trim().toLowerCase().replace(/[’]/g, "'");
  return /spell:natural-power(?:-ii)?(?:$|[?#])/.test(source) || name === "natural power" || name === "natural power ii";
}

export function isNatureMagic(spell) {
  const details = [spell?.system?.requirement, spell?.system?.metadata, spell?.system?.school, spell?.system?.className].join(" ");
  return /\bnature\b|\bdruid\b/i.test(details);
}

export function naturalPowerRemainder(state) {
  return Math.max(0, (Number(state?.added) || 0) - (Number(state?.spent) || 0));
}

export async function trackNaturalPowerSpending(actor, amount, spell = null) {
  const spent = Math.max(0, Number(amount) || 0);
  const state = actor.getFlag("sword-world-25", "naturalPower");
  if (!state || !spent || !isNatureMagic(spell)) return;
  await actor.setFlag("sword-world-25", "naturalPower", { ...state, spent:(Number(state.spent) || 0) + spent });
}

export async function addNaturalPowerMP(actor, amount) {
  const gained = Math.max(0, Number(amount) || 0);
  if (!gained) return;
  const state = actor.getFlag("sword-world-25", "naturalPower") || { added:0, spent:0 };
  const currentMP = Number(actor.system.mp?.value ?? 0);
  await actor.update({ "system.mp.value":currentMP + gained });
  await actor.setFlag("sword-world-25", "naturalPower", {
    added:(Number(state.added) || 0) + gained,
    spent:Number(state.spent) || 0,
    combatId:game.combat?.id || "",
    round:Number(game.combat?.round || 0)
  });
}

export async function expireNaturalPower(actor) {
  const state = actor?.getFlag("sword-world-25", "naturalPower");
  if (!state) return 0;
  const remainder = naturalPowerRemainder(state);
  if (remainder) {
    const currentMP = Number(actor.system.mp?.value ?? 0);
    await actor.update({ "system.mp.value":Math.max(0, currentMP - remainder) });
  }
  await actor.unsetFlag("sword-world-25", "naturalPower");
  return remainder;
}

export async function rollNaturalPower({ actor, spell }) {
  const roll = await new Roll("2d6").evaluate();
  const diceTotal = Number(roll.total) || 0;
  const lookup = String(Math.min(12, Math.max(3, diceTotal)));
  const gained = Math.max(0, Number(spell.system.powerTable?.[lookup] ?? 0));
  const escape = value => foundry.utils.escapeHTML(String(value || ""));
  await roll.toMessage({
    speaker:ChatMessage.getSpeaker({ actor }),
    flavor:`<div class="sw25-chat-card sw25-natural-power-result"><h3>${escape(spell.name)}</h3><p><strong>Power-table roll:</strong> ${diceTotal} → ${gained} MP</p><p><strong>Unused MP gained from this spell is lost when this character ends their turn.</strong></p><button type="button" data-sw25-chat-action="add-natural-power" data-actor-id="${actor.id}" data-mp="${gained}"><i class="fas fa-plus"></i> Add ${gained} MP</button></div>`
  });
  return gained;
}

export function resolveSpecialSpellDamage(bands, diceTotal, magicPowerResult) {
  const roll = Number(diceTotal) || 0;
  const band = bands.find(entry => roll >= Number(entry.min) && roll <= Number(entry.max));
  if (!band) return null;
  const bonus = Number(band.bonus) || 0;
  return { band, bonus, total:(Number(magicPowerResult) || 0) + bonus };
}

export async function rememberMagicPowerRoll(actor, roll, classId = "") {
  await actor.setFlag("sword-world-25", "lastMagicPowerRoll", {
    total:Number(roll.total) || 0,
    classId:String(classId || ""),
    criticalFailure:isCriticalFailure(roll),
    timestamp:Date.now()
  });
}

export async function rollSpecialSpellDamage({ actor, spell, castingClass }) {
  const bands = specialDamageBands(spell);
  if (!bands.length) return false;
  const previous = actor.getFlag("sword-world-25", "lastMagicPowerRoll");
  if (!previous || !Number.isFinite(Number(previous.total))) {
    ui.notifications.warn(`Roll ${castingClass.name} Magic Power before casting ${spell.name}.`);
    return false;
  }
  if (previous.classId && String(previous.classId) !== String(castingClass.id)) {
    ui.notifications.warn(`The previous Magic Power roll was for another class. Roll ${castingClass.name} Magic Power first.`);
    return false;
  }
  if (previous.criticalFailure) return ui.notifications.warn("The previous Magic Power roll was a critical failure.");

  const roll = await new Roll("2d6").evaluate();
  const criticalFailure = await markCriticalFailure(actor, roll);
  if (criticalFailure) {
    await roll.toMessage({ speaker:ChatMessage.getSpeaker({ actor }), flavor:`<div class="sw25-chat-card"><h3>${foundry.utils.escapeHTML(spell.name)} Damage</h3>${criticalFailureHTML()}<p>No damage is dealt.</p></div>` });
    return false;
  }
  const resolved = resolveSpecialSpellDamage(bands, roll.total, previous.total);
  if (!resolved) return false;
  const type = String(resolved.band.damageType || "physical").toLowerCase() === "magical" ? "magical" : "physical";
  const escape = value => foundry.utils.escapeHTML(String(value || ""));
  await roll.toMessage({
    speaker:ChatMessage.getSpeaker({ actor }),
    flavor:`<div class="sw25-chat-card sw25-spell-power-result"><h3>${escape(spell.name)} Damage</h3><p><strong>Damage-table roll:</strong> ${Number(roll.total)} (${Number(resolved.band.min)}–${Number(resolved.band.max)})</p><p>${escape(resolved.band.text)}</p><p><strong>Previous Magic Power roll:</strong> ${Number(previous.total)}</p>${resolved.bonus ? `<p><strong>Table bonus:</strong> +${resolved.bonus}</p>` : ""}<p class="sw25-weapon-total"><strong>Total: ${resolved.total}</strong></p>${damageApplicationButton(resolved.total, type)}</div>`
  });
  return true;
}

export async function rollDoubleStompDamage({ actor, spell, castingClass, targets }) {
  const bands = specialDamageBands(spell);
  const previous = actor.getFlag("sword-world-25", "lastMagicPowerRoll");
  if (!previous || !Number.isFinite(Number(previous.total)) || (previous.classId && String(previous.classId) !== String(castingClass.id))) {
    ui.notifications.warn(`Roll ${castingClass.name} Magic Power before casting ${spell.name}.`);
    return false;
  }
  if (previous.criticalFailure) return ui.notifications.warn("The previous Magic Power roll was a critical failure.");
  for (const token of targets) {
    const target = token.actor;
    const roll = await new Roll("2d6").evaluate();
    const criticalFailure = await markCriticalFailure(actor, roll);
    if (criticalFailure) {
      await roll.toMessage({ speaker:ChatMessage.getSpeaker({ actor }), flavor:`<div class="sw25-chat-card"><h3>${foundry.utils.escapeHTML(spell.name)} — ${foundry.utils.escapeHTML(target?.name || "Target")}</h3>${criticalFailureHTML()}<p>No damage is dealt to this target.</p></div>` });
      continue;
    }
    const resolved = resolveSpecialSpellDamage(bands, roll.total, previous.total);
    if (!target || !resolved) continue;
    await roll.toMessage({
      speaker:ChatMessage.getSpeaker({ actor }),
      flavor:`<div class="sw25-chat-card sw25-spell-power-result"><h3>${foundry.utils.escapeHTML(spell.name)} — ${foundry.utils.escapeHTML(target.name)}</h3><p><strong>Damage-table roll:</strong> ${Number(roll.total)} (${Number(resolved.band.min)}–${Number(resolved.band.max)})</p><p><strong>Previous Magic Power roll:</strong> ${Number(previous.total)}</p><p><strong>Table bonus:</strong> +${resolved.bonus}</p><p class="sw25-weapon-total"><strong>Total: ${resolved.total} physical damage</strong></p><p><em>Select ${foundry.utils.escapeHTML(target.name)} before applying this result.</em></p>${damageApplicationButton(resolved.total, "physical", false)}</div>`
    });
  }
  return true;
}

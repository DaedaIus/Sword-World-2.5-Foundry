import { isGunWeapon, isWarriorClass, weaponDamageParts } from "./weapon-damage.mjs";
import { damageApplicationButton } from "../combat/damage-application.mjs";

export function resolveAttackingClass(actor, weapon, requestedClassId = "") {
  if (isGunWeapon(weapon)) {
    return actor.items.find(item =>
      item.type === "class" && /^(artificer|マギテック)$/i.test(String(item.name).trim())
    ) ?? null;
  }
  const selected = actor.items.get(requestedClassId || actor.system.combat?.offenseClassId);
  return isWarriorClass(selected) ? selected : null;
}

export async function rollWeaponDamage({ actor, weapon, attackingClass, accumulatedPower = 0 }) {
  const roll = await new Roll("2d6").evaluate();
  const diceTotal = Number(roll.total) || 0;
  const damage = weaponDamageParts({
    weapon,
    actorSystem: actor.system,
    attackingClass,
    diceTotal
  });
  const powerTotal = Number(accumulatedPower || 0) + damage.tableValue;
  const situationalDamage = Number(actor.system.combat?.additionalDamage ?? 0);
  const total = powerTotal + damage.classLevel + damage.bonus + damage.additionalDamage + situationalDamage;
  const criticalValue = Number(weapon.system.critical ?? 13);
  const critical = criticalValue <= 12 && diceTotal >= criticalValue;
  const criticalControl = critical ? `
    <div class="sw25-critical-prompt">
      <strong>CRITICAL</strong>
      <button type="button"
        data-sw25-chat-action="roll-critical-damage"
        data-actor-id="${actor.id}"
        data-item-id="${weapon.id}"
        data-class-id="${attackingClass?.id ?? ""}"
        data-accumulated-power="${powerTotal}">
        <i class="fas fa-dice-d6"></i> Roll Damage Again
      </button>
    </div>` : "";

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `
      <div class="sw25-weapon-roll">
        <h3>${foundry.utils.escapeHTML(weapon.name)}</h3>
        <p><strong>Power-table roll:</strong> ${diceTotal} → ${damage.tableValue}</p>
        ${accumulatedPower ? `<p><strong>Accumulated power-table damage:</strong> ${powerTotal}</p>` : ""}
        <p><strong>${foundry.utils.escapeHTML(attackingClass.name)} level:</strong> ${damage.classLevel}</p>
        <p><strong>${damage.gun ? "Intelligence" : "Strength"} bonus:</strong> ${damage.bonus >= 0 ? "+" : ""}${damage.bonus}</p>
        <p><strong>Weapon additional damage:</strong> ${damage.additionalDamage >= 0 ? "+" : ""}${damage.additionalDamage}</p>
        <p><strong>Additional damage:</strong> ${situationalDamage >= 0 ? "+" : ""}${situationalDamage}</p>
        <p class="sw25-weapon-total"><strong>Total damage: ${total}</strong></p>
        ${damageApplicationButton(total, "physical")}
        ${criticalControl}
      </div>`
  });
}

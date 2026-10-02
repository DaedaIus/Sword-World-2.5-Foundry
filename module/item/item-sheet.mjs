import { abilityBonus } from "../rules/weapon-damage.mjs";
import { isDoubleStomp, isNaturalPower, rollDoubleStompDamage, rollNaturalPower, rollSpecialSpellDamage, specialDamageBands, trackNaturalPowerSpending } from "../rules/spell-damage.mjs";
import { isExhaustiveSucking, regenerationSpellData, requestRegenerationSpell, resolveExhaustiveSucking } from "../rules/spell-effects.mjs";

export class SW25ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sw25", "sheet", "item"],
      width: 540,
      height: 560,
      resizable: true
    });
  }

  get template() {
    return "systems/sword-world-25/templates/item/item-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.item = this.item;
    context.system = this.item.system;
    context.isRace = this.item.type === "race";
    context.isClass = this.item.type === "class";
    context.isFeat = this.item.type === "feat";
    context.isAbility = this.item.type === "ability";
    context.isWeapon = this.item.type === "weapon";
    context.isArmour = this.item.type === "armour";
    context.isSkill = this.item.type === "skill";
    context.isSpell = this.item.type === "spell";
    context.isEquipment = this.item.type === "equipment";
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='cast-spell-from-item']").on("click", this._onCastSpell.bind(this));
  }

  async _onCastSpell(event) {
    event.preventDefault();
    const spell = this.item;
    const actor = spell.parent;
    if (!actor || actor.documentName !== "Actor") {
      return ui.notifications.warn("Open this spell from a character to cast it.");
    }
    const castingClass = actor.items.get(spell.system.classId) || [...actor.items].find(item =>
      item.type === "class" && item.name.toLowerCase() === String(spell.system.className || spell.system.school || "").toLowerCase()
    ) || actor.items.get(actor.system.combat?.magicClassId);
    if (!castingClass) return ui.notifications.warn(`${spell.name} is not assigned to a casting class.`);

    const doubleStomp = isDoubleStomp(spell);
    const doubleStompTargets = doubleStomp ? [...game.user.targets] : [];
    if (doubleStomp && (doubleStompTargets.length !== 2 || doubleStompTargets.some(token => !token.actor))) {
      return ui.notifications.warn("Target exactly two characters before casting Double Stomp.");
    }

    const regenerationSpell = regenerationSpellData(spell);
    const selectedTargets = regenerationSpell ? [...game.user.targets] : [];
    if (regenerationSpell && selectedTargets.length !== 1) return ui.notifications.warn(`Target exactly one character before casting ${spell.name}.`);
    const regenerationTarget = selectedTargets[0]?.actor;
    if (regenerationSpell && regenerationTarget?.type !== "character") return ui.notifications.warn(`${spell.name} requires a character target.`);
    const targetInCombat = regenerationSpell && [...(game.combat?.combatants || [])].some(combatant => combatant.actor?.uuid === regenerationTarget.uuid || combatant.actor?.id === regenerationTarget.id);
    if (regenerationSpell && !targetInCombat) return ui.notifications.warn(`The ${spell.name} target must be in the active combat encounter.`);
    if (regenerationSpell && !regenerationTarget.isOwner && !game.users.activeGM) return ui.notifications.error("An active GM is required to affect that target.");

    const hasSpecialDamage = specialDamageBands(spell).length > 0;
    const exhaustiveSucking = isExhaustiveSucking(spell);
    const needsPreviousMagicPower = hasSpecialDamage || exhaustiveSucking;
    const previousMagicPower = needsPreviousMagicPower ? actor.getFlag("sword-world-25", "lastMagicPowerRoll") : null;
    if (needsPreviousMagicPower && (!previousMagicPower || previousMagicPower.criticalFailure || (previousMagicPower.classId && String(previousMagicPower.classId) !== String(castingClass.id)))) {
      return ui.notifications.warn(`Roll ${castingClass.name} Magic Power before casting ${spell.name}.`);
    }

    const cost = Math.max(0, Number(spell.system.mpCost ?? 0));
    const currentMP = Number(actor.system.mp?.value ?? 0);
    if (currentMP < cost) return ui.notifications.warn(`${actor.name} does not have enough MP to cast ${spell.name}.`);
    if (this.isEditable) {
      await actor.update({ "system.mp.value": currentMP - cost });
      await trackNaturalPowerSpending(actor, cost, spell);
    }

    const escape = value => foundry.utils.escapeHTML(String(value || "")).replace(/\n/g, "<br>");
    const classLevel = Number(castingClass.system.level ?? 0);
    const magicPower = classLevel + abilityBonus(actor.system, "intelligence");
    const naturalPower = isNaturalPower(spell);
    const powerResult = spell.system.hasPowerTable && !naturalPower
      ? `<button type="button" data-sw25-chat-action="roll-spell-damage" data-actor-id="${actor.id}" data-item-id="${spell.id}" data-class-id="${castingClass.id}"><i class="fas fa-dice-d6"></i> Roll Damage</button>`
      : "";

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sw25-chat-card spell-card"><h3>${escape(spell.name)}</h3><p><strong>${escape(castingClass.name)} Magic Power:</strong> ${magicPower} &nbsp; <strong>MP:</strong> ${cost}</p>${spell.system.metadata ? `<p>${escape(spell.system.metadata)}</p>` : ""}${spell.system.description ? `<p>${escape(spell.system.description)}</p>` : ""}${powerResult}<p><em>${escape(actor.name)} spends ${cost} MP.</em></p></div>`
    });
    if (hasSpecialDamage && !doubleStomp) await rollSpecialSpellDamage({ actor, spell, castingClass });
    if (doubleStomp) await rollDoubleStompDamage({ actor, spell, castingClass, targets:doubleStompTargets });
    if (naturalPower) await rollNaturalPower({ actor, spell });
    if (regenerationSpell) await requestRegenerationSpell({ target:regenerationTarget, caster:actor, spell });
    if (exhaustiveSucking) await resolveExhaustiveSucking({ actor, spell, castingClass });
  }
}

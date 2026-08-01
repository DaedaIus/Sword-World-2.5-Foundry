import { SW25ActorSheet } from "./module/actor/actor-sheet.mjs";
import { SW25MonsterSheet } from "./module/actor/monster-sheet.mjs";
import { SW25ItemSheet } from "./module/item/item-sheet.mjs";
import { SW25Importer } from "./module/importer/sw25-importer.mjs";
import { resolveAttackingClass, rollWeaponDamage } from "./module/rules/weapon-roll.mjs";
import { abilityBonus } from "./module/rules/weapon-damage.mjs";
import { initializeSideInitiative } from "./module/combat/side-initiative.mjs";

Hooks.once("init", () => {
  game.sw25 = { importer: SW25Importer };
  console.log("Sword World 2.5 | Initializing");

  const stylesheetPath = "systems/sword-world-25/styles/sw25.css";
  const existingStylesheet = document.querySelector(`link[data-sw25-stylesheet]`);
  if (!existingStylesheet) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = stylesheetPath;
    stylesheet.dataset.sw25Stylesheet = "true";
    document.head.appendChild(stylesheet);
  }

  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["hp", "mp"],
      value: ["xp.total", "currency.gamels"]
    },
    monster: { bar: [], value: ["level", "initiative"] }
  };

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("sword-world-25", SW25ActorSheet, {
    types: ["character"],
    makeDefault: true
  });
  Actors.registerSheet("sword-world-25", SW25MonsterSheet, {
    types: ["monster"],
    makeDefault: true
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("sword-world-25", SW25ItemSheet, {
    types: ["race", "class", "feat", "ability", "weapon", "armour", "skill", "spell", "equipment"],
    makeDefault: true
  });
});

Hooks.once("ready", initializeSideInitiative);

Hooks.on("renderChatMessage", (message, html) => {
  html.find("[data-sw25-chat-action='roll-spell-damage']").on("click", async event => {
    event.preventDefault();
    const button = event.currentTarget;
    const actor = game.actors.get(button.dataset.actorId);
    const spell = actor?.items.get(button.dataset.itemId);
    const castingClass = actor?.items.get(button.dataset.classId);
    if (!actor || !spell || !castingClass) return ui.notifications.warn("The actor, spell, or casting class could not be found.");
    button.disabled = true;
    const roll = await new Roll("2d6").evaluate();
    const diceTotal = Number(roll.total ?? 0);
    const lookup = String(Math.min(12, Math.max(3, diceTotal)));
    const tableValue = Number(spell.system.powerTable?.[lookup] ?? 0);
    const magicPower = Number(castingClass.system.level ?? 0) + abilityBonus(actor.system, "intelligence");
    const total = tableValue + magicPower;
    const critical = Number(spell.system.critical ?? 0);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sw25-chat-card sw25-spell-power-result"><h3>${foundry.utils.escapeHTML(spell.name)} Damage</h3><p><strong>Power roll:</strong> ${diceTotal} → ${tableValue}</p><p><strong>Magic Power:</strong> ${magicPower}</p><p class="sw25-weapon-total"><strong>Total:</strong> ${total}</p>${critical && diceTotal >= critical ? '<p class="sw25-critical">CRITICAL</p>' : ""}</div>`
    });
  });

  html.find("[data-sw25-chat-action='roll-critical-damage']").on("click", async event => {
    event.preventDefault();
    const button = event.currentTarget;
    const actor = game.actors.get(button.dataset.actorId);
    const weapon = actor?.items.get(button.dataset.itemId);
    const attackingClass = actor && weapon
      ? resolveAttackingClass(actor, weapon, button.dataset.classId)
      : null;
    if (!actor || !weapon || !attackingClass) {
      ui.notifications.warn("The actor, weapon, or attacking class could not be found.");
      return;
    }
    if (weapon.system?.artificerPowered) return ui.notifications.info("Gun damage is rolled through its bullet spell.");
    button.disabled = true;
    await rollWeaponDamage({
      actor,
      weapon,
      attackingClass,
      accumulatedPower: Number(button.dataset.accumulatedPower ?? 0)
    });
  });

  html.find("[data-sw25-chat-action='roll-weapon-damage']").on("click", async event => {
    event.preventDefault();
    const card = event.currentTarget.closest(".sw25-chat-card");
    const actor = game.actors.get(card?.dataset.actorId);
    const weapon = actor?.items.get(card?.dataset.itemId);
    if (!actor || !weapon) {
      ui.notifications.warn("The weapon or actor could not be found.");
      return;
    }
    if (weapon.system?.artificerPowered) return ui.notifications.info("Gun damage is rolled through its bullet spell.");

    const formula = weapon.system.damageFormula || "2d6";
    try {
      const roll = await new Roll(formula).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${weapon.name} Damage — Power ${Number(weapon.system.power ?? 0)}, Critical ${Number(weapon.system.critical ?? 10)}`
      });
    } catch (error) {
      console.error("Invalid weapon damage formula", error);
      ui.notifications.error(`Invalid damage formula: ${formula}`);
    }
  });
});

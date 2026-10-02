import { abilityBonus } from "../rules/weapon-damage.mjs";
import { criticalFailureHTML, markCriticalFailure } from "../rules/critical-failure.mjs";

const FLAG_SCOPE = "sword-world-25";
const FLAG_KEY = "evasionChallenge";

export function staticAccuracy(value) {
  const match = String(value ?? "").match(/\(\s*(-?\d+)\s*\)/);
  return match ? Number(match[1]) : null;
}

export function characterEvasionModifier(actor) {
  const defenseClass = actor?.items?.get(actor.system.combat?.defenseClassId);
  const classLevel = Number(defenseClass?.system?.level ?? 0);
  const agility = abilityBonus(actor?.system, "agility");
  const situational = Number(actor?.system?.combat?.situationalEvasion ?? 0);
  const armour = [...(actor?.items || [])]
    .filter(item => item.type === "armour" && item.system.equipped)
    .reduce((sum, item) => sum + Number(item.system.evasion ?? 0), 0);
  return classLevel + agility + situational + armour;
}

export const evasionSucceeded = (total, target) => Number(total) >= Number(target);

function challengeActor() {
  const controlled = [...(canvas?.tokens?.controlled || [])]
    .map(token => token.actor)
    .filter(actor => actor?.type === "character" && actor.isOwner);
  if (controlled.length > 1) {
    ui.notifications.warn("Control exactly one character token before rolling Evasion.");
    return null;
  }
  if (controlled.length === 1) return controlled[0];
  const assigned = game.user.character;
  if (assigned?.type === "character" && assigned.isOwner) return assigned;
  ui.notifications.warn("Control one owned character token, or assign a character to your user, before rolling Evasion.");
  return null;
}

export function initializeEvasionChallenges() {
  Hooks.on("renderChatMessage", (message, html) => {
    const challenge = message.getFlag(FLAG_SCOPE, FLAG_KEY);
    if (!challenge) return;
    html.find("[data-sw25-chat-action='roll-evasion-challenge']").on("click", async event => {
      event.preventDefault();
      const actor = challengeActor();
      if (!actor) return;
      const modifier = characterEvasionModifier(actor);
      const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
      const criticalFailure = await markCriticalFailure(actor, roll);
      const success = !criticalFailure && evasionSucceeded(roll.total, challenge.target);
      await roll.toMessage({
        speaker:ChatMessage.getSpeaker({ actor }),
        flavor:`<div class="sw25-chat-card sw25-evasion-result"><h3>${foundry.utils.escapeHTML(actor.name)} — Evasion Check</h3><p><strong>Evasion total:</strong> ${Number(roll.total)}</p>${criticalFailure ? criticalFailureHTML() : ""}<p class="${success ? "sw25-evasion-success" : "sw25-evasion-failure"}"><strong>${success ? "EVADED" : "HIT"}</strong></p></div>`
      });
    });
  });
}

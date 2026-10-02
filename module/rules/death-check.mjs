import { abilityBonus } from "./weapon-damage.mjs";

export const deathCheckTarget = hp => Math.abs(Number(hp) || 0);

export function deathCheckModifier(actor) {
  const adventurerLevel = [...(actor?.items || [])]
    .filter(item => item.type === "class")
    .reduce((highest, item) => Math.max(highest, Number(item.system.level ?? 0)), 0);
  return adventurerLevel + abilityBonus(actor?.system, "vitality");
}

export function deathCheckOutcome(total, target, diceResults = []) {
  if (diceResults.length === 2 && diceResults.every(result => Number(result) === 6)) return "automatic";
  return Number(total) >= Number(target) ? "success" : "failure";
}

export async function rollDeathCheck(actor) {
  const hp = Number(actor.system.hp?.value ?? 0);
  if (hp > 0) return ui.notifications.warn("A Death Check is only required at 0 HP or below.");
  const target = deathCheckTarget(hp);
  const modifier = deathCheckModifier(actor);
  const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
  const diceResults = (roll.dice || []).flatMap(die =>
    (die.results || []).filter(result => result.active !== false).map(result => Number(result.result))
  );
  const outcome = deathCheckOutcome(roll.total, target, diceResults);
  if (outcome === "automatic") await actor.update({ "system.hp.value":1 });
  const result = outcome === "automatic"
    ? { css:"sw25-death-success", title:"AUTOMATIC SUCCESS", detail:"HP is restored to 1. The character regains consciousness." }
    : outcome === "success"
      ? { css:"sw25-death-success", title:"SUCCESS — ALIVE", detail:"The character remains unconscious but is alive." }
      : { css:"sw25-death-failure", title:"FAILURE — DEAD", detail:"The character has died." };
  await roll.toMessage({
    speaker:ChatMessage.getSpeaker({ actor }),
    flavor:`<div class="sw25-chat-card sw25-death-check"><h3>${foundry.utils.escapeHTML(actor.name)} — Death Check</h3><p><strong>Current HP:</strong> ${hp} &nbsp; <strong>Target Number:</strong> ${target}</p><p><strong>Adventurer Level + Vitality Modifier:</strong> ${modifier >= 0 ? "+" : ""}${modifier}</p><p class="${result.css}"><strong>${result.title}</strong></p><p>${result.detail}</p></div>`
  });
  return outcome;
}

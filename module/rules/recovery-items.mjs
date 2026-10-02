import { criticalFailureHTML, markCriticalFailure } from "./critical-failure.mjs";
import { characterAbilityScore, characterHPMaximum } from "./resources.mjs";

const FLAG_SCOPE = "sword-world-25";
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export function recoveryResource(item = {}) {
  const text = `${item.name || ""} ${item.system?.notes || ""} ${item.system?.description || ""}`;
  return /(?:restore|recover)[^.!\n]*\bMP\b/i.test(text) ? "mp" : "hp";
}

export function recoveryPowerResult(system = {}, diceTotal = 0) {
  const lookup = String(Math.min(12, Math.max(3, Number(diceTotal) || 0)));
  const tableResult = Number(system.powerTable?.[lookup] ?? 0);
  const additional = Number(system.additionalDamage ?? 0);
  return { lookup:Number(lookup), tableResult, additional, total:Math.max(0, tableResult + additional) };
}

export function magicHerbSystemPatch(item = {}) {
  const name = String(item.name ?? "").trim().toLowerCase();
  if (item.type !== "equipment" || name !== "magic herb") return null;
  return {
    "system.hasPowerTable":true,
    "system.power":0,
    "system.critical":0,
    "system.additionalDamage":0,
    "system.powerTable":{ "3":0, "4":0, "5":0, "6":1, "7":2, "8":2, "9":3, "10":3, "11":4, "12":4 },
    "system.notes":"Restores Power 0 MP"
  };
}

export function recoveryPowerTableHTML(item, actor) {
  if (item?.type !== "equipment" || !item.system?.hasPowerTable) return "";
  const cells = Array.from({ length:10 }, (_, index) => {
    const roll = index + 3;
    return `<span><strong>${roll}</strong><br>${Number(item.system.powerTable?.[String(roll)] ?? 0)}</span>`;
  }).join("");
  return `<div class="sw25-recovery-power-table">${cells}</div><button type="button" data-sw25-chat-action="roll-recovery-item" data-actor-id="${escape(actor.id)}" data-item-id="${escape(item.id)}"><i class="fas fa-dice-d6"></i> Roll Recovery</button>`;
}

function resourceMaximum(actor, resource) {
  if (resource === "hp") {
    return characterHPMaximum(actor.system, actor.items);
  }
  const stored = Number(actor.system.mp?.max ?? 0);
  if (stored > 0) return stored;
  const wizardLevels = actor.items
    .filter(item => item.type === "class" && /wizard/i.test(String(item.system.classType ?? "")))
    .reduce((total, item) => total + Number(item.system.level ?? 0) * 3, 0);
  return wizardLevels + characterAbilityScore(actor.system, "mind", "f");
}

function receivingActor() {
  const assigned = game.user.character;
  if (assigned?.type === "character" && assigned.isOwner) return assigned;
  const selected = [...(canvas?.tokens?.controlled || [])].filter(token => token.actor?.type === "character" && token.actor.isOwner);
  return selected.length === 1 ? selected[0].actor : null;
}

async function applyRecovery(button) {
  const actor = receivingActor();
  if (!actor) return ui.notifications.warn("Assign a character to your user, or select exactly one owned character token.");
  const resource = button.dataset.resource === "mp" ? "mp" : "hp";
  const amount = Math.max(0, Number(button.dataset.amount ?? 0));
  const current = Number(actor.system[resource]?.value ?? 0);
  const maximum = Math.max(0, resourceMaximum(actor, resource));
  const next = maximum > 0 ? Math.min(maximum, current + amount) : current + amount;
  const recovered = next - current;
  await actor.update({ [`system.${resource}.value`]:next });
  await ChatMessage.create({
    speaker:ChatMessage.getSpeaker({ actor }),
    content:`<div class="sw25-chat-card"><h3>${escape(actor.name)} Recovers</h3><p><strong>${recovered} ${resource.toUpperCase()}</strong> recovered. (${next}${maximum > 0 ? `/${maximum}` : ""})</p></div>`
  });
}

async function rollRecoveryItem(button) {
  const actor = game.actors.get(button.dataset.actorId);
  const item = actor?.items.get(button.dataset.itemId);
  if (!actor || !item?.system?.hasPowerTable) return ui.notifications.warn("The recovery item could not be found.");
  const roll = await new Roll("2d6").evaluate();
  const criticalFailure = await markCriticalFailure(actor, roll);
  if (criticalFailure) {
    await roll.toMessage({
      speaker:ChatMessage.getSpeaker({ actor }),
      flavor:`<div class="sw25-chat-card"><h3>${escape(item.name)} Recovery</h3>${criticalFailureHTML()}<p>No HP or MP is recovered.</p></div>`
    });
    return;
  }
  const resolved = recoveryPowerResult(item.system, roll.total);
  const resource = recoveryResource(item);
  await roll.toMessage({
    speaker:ChatMessage.getSpeaker({ actor }),
    flavor:`<div class="sw25-chat-card sw25-recovery-result"><h3>${escape(item.name)}</h3><p><strong>Power roll:</strong> ${Number(roll.total)} → ${resolved.tableResult}</p>${resolved.additional ? `<p><strong>Additional recovery:</strong> +${resolved.additional}</p>` : ""}<p class="sw25-weapon-total"><strong>Total: ${resolved.total} ${resource.toUpperCase()}</strong></p><button type="button" data-sw25-chat-action="apply-recovery" data-resource="${resource}" data-amount="${resolved.total}"><i class="fas fa-plus"></i> Add ${resolved.total} ${resource.toUpperCase()}</button></div>`
  });
}

export function initializeRecoveryItems() {
  if (game.user.isGM) {
    for (const actor of game.actors) {
      for (const item of actor.items) {
        const patch = magicHerbSystemPatch(item);
        const tableMissing = !item.system?.hasPowerTable || Number(item.system?.powerTable?.["12"] ?? 0) !== 4;
        if (patch && tableMissing) item.update(patch, { render:false });
      }
    }
  }
  Hooks.on("createItem", (item, _options, userId) => {
    if (userId !== game.user.id) return;
    const patch = magicHerbSystemPatch(item);
    if (patch && (!item.system?.hasPowerTable || Number(item.system?.powerTable?.["12"] ?? 0) !== 4)) {
      return item.update(patch);
    }
  });
  Hooks.on("renderChatMessage", (_message, html) => {
    html.find("[data-sw25-chat-action='roll-recovery-item']").on("click", event => {
      event.preventDefault();
      return rollRecoveryItem(event.currentTarget);
    });
    html.find("[data-sw25-chat-action='apply-recovery']").on("click", event => {
      event.preventDefault();
      return applyRecovery(event.currentTarget);
    });
  });
}

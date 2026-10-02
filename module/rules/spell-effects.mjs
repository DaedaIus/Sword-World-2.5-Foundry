import { damageApplicationButton } from "../combat/damage-application.mjs";

const FLAG_SCOPE = "sword-world-25";
const FLAG_KEY = "timedRegeneration";
const SOCKET = "system.sword-world-25";
const REGENERATION_SPECS = {
  "reproducer-bloody-petal":{ sourceKey:"reproducer-bloody-petal", healing:5, turns:6 },
  "reproducer-living-tree":{ sourceKey:"reproducer-living-tree", healing:10, turns:6 }
};

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export function regenerationSpellData(spell) {
  const source = String(spell?.system?.sourceUrl || "").toLowerCase();
  const name = String(spell?.name || "").toLowerCase();
  if (source.includes("spell:reproducer-bloody-petal") || name.includes("reproducer/bloody petal") || name.includes("bloody petal")) {
    return REGENERATION_SPECS["reproducer-bloody-petal"];
  }
  if (source.includes("spell:reproducer-living-tree") || name.includes("reproducer/living tree") || name.includes("living tree")) {
    return REGENERATION_SPECS["reproducer-living-tree"];
  }
  return null;
}

export function isExhaustiveSucking(spell) {
  const source = String(spell?.system?.sourceUrl || "").toLowerCase();
  const name = String(spell?.name || "").trim().toLowerCase();
  return source.includes("spell:exhaustive-sucking") || name === "exhaustive sucking";
}

export const exhaustiveSuckingTotal = magicPowerRoll => 18 + (Number(magicPowerRoll) || 0);

export async function resolveExhaustiveSucking({ actor, spell, castingClass }) {
  const previous = actor.getFlag(FLAG_SCOPE, "lastMagicPowerRoll");
  if (!previous || previous.criticalFailure || !Number.isFinite(Number(previous.total)) || (previous.classId && String(previous.classId) !== String(castingClass.id))) {
    ui.notifications.warn(`Roll ${castingClass.name} Magic Power before casting ${spell.name}.`);
    return false;
  }
  const total = exhaustiveSuckingTotal(previous.total);
  await ChatMessage.create({
    speaker:ChatMessage.getSpeaker({ actor }),
    content:`<div class="sw25-chat-card sw25-spell-power-result"><h3>${escape(spell.name)}</h3><p><strong>Previous Magic Power roll:</strong> ${Number(previous.total)}</p><p><strong>Damage:</strong> 18 + ${Number(previous.total)}</p><p class="sw25-weapon-total"><strong>Total: ${total} physical damage</strong></p>${damageApplicationButton(total, "physical", false)}<button type="button" data-sw25-chat-action="heal-exhaustive-sucking" data-actor-uuid="${escape(actor.uuid)}" data-healing="${total}"><i class="fas fa-heart"></i> Heal Caster ${total} HP</button><p><em>Do not apply the healing if the target has Poison Immunity.</em></p></div>`
  });
  return true;
}

export function regenerationStep(currentHP, maximumHP, turnsRemaining, healing = 5) {
  const current = Math.max(0, Number(currentHP) || 0);
  const maximum = Math.max(current, Number(maximumHP) || current);
  if (current <= 0 || Number(turnsRemaining) <= 0) return { ended:true, healed:0, hp:current, turnsRemaining:0 };
  const hp = Math.min(maximum, current + Math.max(0, Number(healing) || 0));
  const remaining = Math.max(0, Number(turnsRemaining) - 1);
  return { ended:remaining === 0, healed:hp - current, hp, turnsRemaining:remaining };
}

function effectButton(actor, effect) {
  return `<button type="button" data-sw25-chat-action="end-regeneration" data-actor-uuid="${escape(actor.uuid)}" data-effect-id="${escape(effect.id)}"><i class="fas fa-times"></i> End Effect Early</button>`;
}

async function storeEffects(actor, effects) {
  if (effects.length) await actor.setFlag(FLAG_SCOPE, FLAG_KEY, effects);
  else await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
}

async function beginRegeneration({ target, casterName, casterUuid = "", spellName, sourceKey, healing, turns }) {
  const current = target.getFlag(FLAG_SCOPE, FLAG_KEY);
  const effects = Array.isArray(current) ? [...current] : [];
  const effect = {
    id:foundry.utils.randomID(), sourceKey, spellName, casterName, casterUuid,
    healing:Number(healing), turnsRemaining:Number(turns), totalTurns:Number(turns),
    combatId:game.combat?.id || ""
  };
  const next = effects.filter(entry => entry.sourceKey !== sourceKey);
  next.push(effect);
  await storeEffects(target, next);
  await ChatMessage.create({
    content:`<div class="sw25-chat-card"><h3>${escape(spellName)}</h3><p><strong>${escape(target.name)}</strong> will recover ${Number(healing)} HP at the end of each of their next ${Number(turns)} turns.</p><p>The effect ends immediately if their HP reaches 0.</p>${effectButton(target, effect)}</div>`
  });
  return effect;
}

export async function requestRegenerationSpell({ target, caster, spell }) {
  const data = regenerationSpellData(spell);
  if (!data) return;
  const payload = { action:"begin-regeneration", targetUuid:target.uuid, casterUuid:caster.uuid, casterName:caster.name, spellName:spell.name, ...data };
  if (target.isOwner) return beginRegeneration({ target, casterName:caster.name, casterUuid:caster.uuid, spellName:spell.name, ...data });
  if (!game.users.activeGM) return ui.notifications.error(`An active GM is required to apply ${spell.name} to that target.`);
  game.socket.emit(SOCKET, payload);
  ui.notifications.info(`${spell.name} sent to the GM for ${target.name}.`);
}

export async function processRegenerationTurn(actor) {
  const stored = actor?.getFlag(FLAG_SCOPE, FLAG_KEY);
  if (!Array.isArray(stored) || !stored.length) return;
  const currentHP = Number(actor.system.hp?.value ?? 0);
  if (currentHP <= 0) return endRegenerationAtZero(actor);

  let hp = currentHP;
  const maximumHP = Number(actor.system.hp?.max ?? hp);
  const remaining = [];
  for (const effect of stored) {
    const step = regenerationStep(hp, maximumHP, effect.turnsRemaining, effect.healing);
    hp = step.hp;
    const updated = { ...effect, turnsRemaining:step.turnsRemaining };
    const turnNumber = Math.max(1, Number(effect.totalTurns || 6) - Number(effect.turnsRemaining || 6) + 1);
    await ChatMessage.create({
      content:`<div class="sw25-chat-card"><h3>${escape(effect.spellName)} — Regeneration</h3><p><strong>${escape(actor.name)}</strong> recovers <strong>${step.healed} HP</strong>. (${hp}/${maximumHP})</p><p>Turn ${turnNumber} of ${Number(effect.totalTurns || 6)}.</p>${step.ended ? "<p><em>The effect has ended.</em></p>" : effectButton(actor, updated)}</div>`
    });
    if (!step.ended) remaining.push(updated);
  }
  if (hp !== currentHP) await actor.update({ "system.hp.value":hp });
  await storeEffects(actor, remaining);
}

export async function endRegenerationAtZero(actor) {
  const effects = actor?.getFlag(FLAG_SCOPE, FLAG_KEY);
  if (!Array.isArray(effects) || !effects.length) return;
  await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
  await ChatMessage.create({ content:`<div class="sw25-chat-card"><h3>Regeneration Ended</h3><p>${escape(actor.name)} reached 0 HP. All regeneration effects end.</p></div>` });
}

async function cancelRegeneration(actor, effectId) {
  const stored = actor?.getFlag(FLAG_SCOPE, FLAG_KEY);
  if (!Array.isArray(stored)) return;
  const effect = stored.find(entry => entry.id === effectId);
  if (!effect) return ui.notifications.info("That regeneration effect has already ended.");
  await storeEffects(actor, stored.filter(entry => entry.id !== effectId));
  await ChatMessage.create({ content:`<div class="sw25-chat-card"><h3>${escape(effect.spellName)} Ended Early</h3><p>The regeneration effect on ${escape(actor.name)} was ended early.</p></div>` });
}

async function requestCancel(button) {
  const actor = await fromUuid(button.dataset.actorUuid);
  if (!actor) return ui.notifications.warn("The regeneration target could not be found.");
  const payload = { action:"end-regeneration", actorUuid:actor.uuid, effectId:button.dataset.effectId };
  if (actor.isOwner) return cancelRegeneration(actor, payload.effectId);
  if (!game.users.activeGM) return ui.notifications.error("An active GM is required to end that effect.");
  game.socket.emit(SOCKET, payload);
}

async function applyExhaustiveHealing(actor, amount, message) {
  if (message?.getFlag(FLAG_SCOPE, "exhaustiveHealingApplied")) return ui.notifications.info("This healing has already been applied.");
  const current = Number(actor.system.hp?.value ?? 0);
  const maximum = Math.max(current, Number(actor.system.hp?.max ?? current));
  const next = Math.min(maximum, current + Math.max(0, Number(amount) || 0));
  await actor.update({ "system.hp.value":next });
  if (message) await message.setFlag(FLAG_SCOPE, "exhaustiveHealingApplied", true);
  await ChatMessage.create({ content:`<div class="sw25-chat-card"><h3>Exhaustive Sucking Healing</h3><p><strong>${escape(actor.name)}</strong> recovers <strong>${next - current} HP</strong>. (${next}/${maximum})</p></div>` });
}

async function requestExhaustiveHealing(message, button) {
  const actor = await fromUuid(button.dataset.actorUuid);
  if (!actor) return ui.notifications.warn("The caster could not be found.");
  const amount = Number(button.dataset.healing || 0);
  if (actor.isOwner) return applyExhaustiveHealing(actor, amount, message);
  if (!game.users.activeGM) return ui.notifications.error("An active GM is required to heal that caster.");
  game.socket.emit(SOCKET, { action:"heal-exhaustive-sucking", actorUuid:actor.uuid, amount, messageId:message.id });
}

export function initializeSpellEffects() {
  Hooks.on("renderChatMessage", (message, html) => {
    html.find("[data-sw25-chat-action='end-regeneration']").on("click", event => {
      event.preventDefault();
      return requestCancel(event.currentTarget);
    });
    const healingButton = html.find("[data-sw25-chat-action='heal-exhaustive-sucking']");
    if (message.getFlag(FLAG_SCOPE, "exhaustiveHealingApplied")) healingButton.prop("disabled", true).html('<i class="fas fa-check"></i> Healing Applied');
    healingButton.on("click", event => {
      event.preventDefault();
      return requestExhaustiveHealing(message, event.currentTarget);
    });
  });
  Hooks.on("updateActor", actor => {
    if (!game.user.isGM || actor.type !== "character" || Number(actor.system.hp?.value ?? 1) > 0) return;
    endRegenerationAtZero(actor);
  });
  game.socket.on(SOCKET, async (payload, senderId) => {
    if (!game.user.isGM) return;
    const requestingUser = game.users.get(senderId);
    if (payload?.action === "begin-regeneration") {
      const target = await fromUuid(payload.targetUuid);
      const caster = await fromUuid(payload.casterUuid);
      const regeneration = REGENERATION_SPECS[payload.sourceKey];
      if (regeneration && requestingUser && target?.type === "character" && caster?.testUserPermission(requestingUser, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
        await beginRegeneration({ target, casterName:payload.casterName, casterUuid:payload.casterUuid, spellName:payload.spellName, ...regeneration });
      }
    }
    if (payload?.action === "end-regeneration") {
      const actor = await fromUuid(payload.actorUuid);
      const effects = actor?.getFlag(FLAG_SCOPE, FLAG_KEY);
      const effect = Array.isArray(effects) ? effects.find(entry => entry.id === payload.effectId) : null;
      const caster = effect?.casterUuid ? await fromUuid(effect.casterUuid) : null;
      const allowed = requestingUser && (actor?.testUserPermission(requestingUser, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) || caster?.testUserPermission(requestingUser, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
      if (allowed) await cancelRegeneration(actor, payload.effectId);
    }
    if (payload?.action === "heal-exhaustive-sucking") {
      const actor = await fromUuid(payload.actorUuid);
      const message = game.messages.get(payload.messageId);
      if (requestingUser && actor?.testUserPermission(requestingUser, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
        await applyExhaustiveHealing(actor, payload.amount, message);
      }
    }
  });
}

const SOCKET = "system.sword-world-25";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export function damageApplicationButton(total, damageType = "physical", includeHalf = true) {
  const type = damageType === "magical" ? "magical" : "physical";
  const label = type === "magical" ? "Magical" : "Physical";
  return `<div class="sw25-damage-actions"><button type="button" class="sw25-apply-damage" data-sw25-chat-action="apply-damage" data-damage="${Number(total) || 0}" data-damage-type="${type}" data-damage-factor="1"><i class="fas fa-heart-broken"></i> Apply ${label} Damage</button>${includeHalf ? `<button type="button" class="sw25-apply-damage" data-sw25-chat-action="apply-damage" data-damage="${Number(total) || 0}" data-damage-type="${type}" data-damage-factor="0.5"><i class="fas fa-divide"></i> Apply Half Damage</button>` : ""}</div>`;
}

function defenseFor(actor, damageType) {
  if (actor.type === "character") {
    const key = damageType === "magical" ? "magicalDefence" : "defence";
    return actor.items
      .filter(item => item.type === "armour" && item.system.equipped)
      .reduce((sum, item) => sum + Number(item.system[key] ?? 0), 0);
  }
  if (damageType === "magical") return 0;
  return Number(actor.system.combatStyles?.[0]?.defense ?? 0);
}

async function applyDamage({ actor, total, damageType, factor = 1 }) {
  const raw = Math.max(0, Math.ceil((Number(total) || 0) * (Number(factor) === 0.5 ? 0.5 : 1)));
  const defense = Math.max(0, defenseFor(actor, damageType));
  const applied = Math.max(0, raw - defense);
  if (actor.type === "monster") {
    const styles = foundry.utils.deepClone(Array.isArray(actor.system.combatStyles) ? actor.system.combatStyles : []);
    if (!styles.length) throw new Error(`${actor.name} has no combat-statistics row to receive damage.`);
    styles[0].hp ??= { value:0, max:0 };
    styles[0].hp.value = Math.max(0, Number(styles[0].hp.value ?? 0) - applied);
    await actor.update({ "system.combatStyles": styles });
  } else {
    const current = Number(actor.system.hp?.value ?? 0);
    await actor.update({ "system.hp.value": current - applied });
  }
  await ChatMessage.create({
    content: `<div class="sw25-chat-card"><h3>Damage Applied to ${escape(actor.name)}</h3><p><strong>Damage Applied:</strong> ${applied}</p></div>`
  });
}

async function requestDamage(button) {
  const selected = [...(canvas?.tokens?.controlled || [])];
  if (selected.length !== 1) return ui.notifications.warn("Select exactly one token before applying damage.");
  const actor = selected[0].actor;
  if (!actor) return ui.notifications.warn("The selected token has no actor.");
  const payload = {
    action:"apply-damage",
    actorUuid:actor.uuid,
    total:Number(button.dataset.damage ?? 0),
    damageType:button.dataset.damageType === "magical" ? "magical" : "physical",
    factor:Number(button.dataset.damageFactor) === 0.5 ? 0.5 : 1
  };
  if (actor.isOwner) return applyDamage({ actor, total:payload.total, damageType:payload.damageType, factor:payload.factor });
  if (!game.users.activeGM) return ui.notifications.error("An active GM is required to apply damage to that target.");
  game.socket.emit(SOCKET, payload);
  ui.notifications.info(`Damage sent to the GM for ${actor.name}.`);
}

export function initializeDamageApplication() {
  Hooks.on("renderChatMessage", (_message, html) => {
    html.find("[data-sw25-chat-action='apply-damage']").on("click", event => {
      event.preventDefault();
      return requestDamage(event.currentTarget);
    });
  });
  game.socket.on(SOCKET, async payload => {
    if (payload?.action !== "apply-damage" || !game.user.isGM) return;
    const actor = await fromUuid(payload.actorUuid);
    if (!actor) return ui.notifications.warn("The damage target could not be found.");
    try { await applyDamage({ actor, total:payload.total, damageType:payload.damageType, factor:payload.factor }); }
    catch (error) { ui.notifications.error(error.message || "Could not apply damage."); }
  });
}

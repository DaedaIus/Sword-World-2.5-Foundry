const FLAG_SCOPE = "sword-world-25";
const FLAG_KEY = "sideInitiative";
const SOCKET = "system.sword-world-25";

export const firstSide = (playerValues = [], monsterValue = 0) =>
  playerValues.length && Math.max(...playerValues.map(Number)) >= Number(monsterValue) ? "players" : "monsters";

export const sideTransition = (startingSide, completedSide) => ({
  phase: startingSide === completedSide ? (completedSide === "players" ? "monsters" : "players") : startingSide,
  newRound: startingSide !== completedSide
});

const activeCombat = () => game.combat;
const stateFor = combat => combat?.getFlag(FLAG_SCOPE, FLAG_KEY) || null;
const characterCombatants = combat => [...(combat?.combatants || [])].filter(combatant => combatant.actor?.type === "character" && !combatant.defeated);
const monsterCombatants = combat => [...(combat?.combatants || [])].filter(combatant => combatant.actor?.type === "monster" && !combatant.defeated);

function clearIndividualTurnMarkers() {
  const tokens = canvas?.tokens;
  if (!tokens) return;
  const marked = new Set([...(tokens.turnMarkers || []), ...(tokens.placeables || []).filter(token => token.turnMarker)]);
  for (const token of marked) {
    if (!token.turnMarker) continue;
    token.turnMarker.visible = false;
    token.turnMarker.renderable = false;
  }
}

function clearTrackerHighlights(root = document) {
  root.querySelectorAll?.(".combatant.active, [data-combatant-id].active, [data-entry-id].active").forEach(element => element.classList.remove("active"));
}

async function announce(content) {
  await ChatMessage.create({ content: `<div class="sw25-chat-card sw25-side-phase-card">${content}</div>` });
}

async function saveState(combat, state) {
  await combat.setFlag(FLAG_SCOPE, FLAG_KEY, state);
}

export async function recordPlayerInitiative(actor, total) {
  const combat = activeCombat();
  if (!combat) return ui.notifications.warn("There is no active combat.");
  const matches = characterCombatants(combat).filter(combatant => combatant.actor?.id === actor.id);
  if (!matches.length) return ui.notifications.warn(`${actor.name} is not in the active combat encounter.`);
  for (const combatant of matches) await combat.setInitiative(combatant.id, Number(total));
  ui.notifications.info(`${actor.name}'s side initiative is ${total}.`);
}

export async function beginMonsterInitiative(actor, total) {
  const combat = activeCombat();
  if (!combat) return ui.notifications.warn("There is no active combat.");
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can roll the enemy initiative.");
  const monsters = monsterCombatants(combat);
  const matching = monsters.filter(combatant => combatant.actor?.id === actor.id);
  if (!matching.length) return ui.notifications.warn(`${actor.name} is not in the active combat encounter.`);
  for (const combatant of matching) await combat.setInitiative(combatant.id, Number(total));

  const players = characterCombatants(combat);
  const missing = players.filter(combatant => combatant.initiative === null || combatant.initiative === undefined || !Number.isFinite(Number(combatant.initiative)));
  if (missing.length) return ui.notifications.warn(`Waiting for initiative: ${missing.map(combatant => combatant.name).join(", ")}.`);

  const playerInitiatives = Object.fromEntries(players.map(combatant => [combatant.id, Number(combatant.initiative)]));
  const startingSide = firstSide(Object.values(playerInitiatives), total);
  const state = {
    active: true,
    phase: startingSide,
    firstPhase: startingSide,
    playersDone: [],
    playerInitiatives,
    monsterInitiative: Number(total),
    round: Math.max(1, Number(combat.round || 1))
  };
  if (!combat.started) await combat.startCombat();
  if (combat.turn !== null) await combat.update({ turn:null });
  await saveState(combat, state);
  await announce(`<h3>Side Initiative</h3><p><strong>Players:</strong> ${Math.max(...Object.values(playerInitiatives))} &nbsp; <strong>Monsters:</strong> ${total}</p><p><strong>${startingSide === "players" ? "Players" : "Monsters"} act first.</strong></p>`);
}

async function handleAction(payload, userId) {
  if (!game.user.isGM) return;
  const combat = game.combats.get(payload.combatId);
  const state = stateFor(combat);
  if (!combat || !state?.active) return;
  if (payload.action === "end-player") {
    const user = game.users.get(userId);
    const eligible = characterCombatants(combat).filter(combatant => combatant.actor?.testUserPermission(user, "OWNER"));
    const requested = new Set(payload.combatantIds || []);
    const valid = eligible.filter(combatant => requested.has(combatant.id)).map(combatant => combatant.id);
    const playersDone = [...new Set([...(state.playersDone || []), ...valid])];
    const allIds = characterCombatants(combat).map(combatant => combatant.id);
    const complete = allIds.length > 0 && allIds.every(id => playersDone.includes(id));
    if (!complete) await saveState(combat, { ...state, playersDone, phase:"players" });
    else if (state.firstPhase === "players") {
      await saveState(combat, { ...state, playersDone, phase:"monsters" });
      await announce("<h3>Monster Turn</h3><p>All players have ended their turns.</p>");
    } else {
      const nextRound = Math.max(1, Number(combat.round || state.round || 1) + 1);
      await combat.update({ round:nextRound, turn:null });
      await saveState(combat, { ...state, playersDone:[], phase:"monsters", round:nextRound });
      await announce(`<h3>Round ${nextRound}</h3><p><strong>Monsters act first.</strong></p>`);
    }
  }
}

async function requestPlayerEnd(combat) {
  const state = stateFor(combat);
  if (state?.phase !== "players") return;
  const done = new Set(state.playersDone || []);
  const ids = characterCombatants(combat).filter(combatant => !done.has(combatant.id) && combatant.actor?.isOwner).map(combatant => combatant.id);
  if (!ids.length) return ui.notifications.warn("You have no unfinished player combatants in this encounter.");
  const activeGM = game.users.activeGM;
  if (!activeGM) return ui.notifications.error("An active GM is required to advance side initiative.");
  if (game.user.isGM) await handleAction({ action:"end-player", combatId:combat.id, combatantIds:ids }, game.user.id);
  else game.socket.emit(SOCKET, { action:"end-player", combatId:combat.id, combatantIds:ids, userId:game.user.id });
}

async function endMonsterPhase(combat) {
  if (!game.user.isGM) return;
  const state = stateFor(combat);
  if (state?.phase !== "monsters") return;
  if (state.firstPhase === "monsters") {
    await saveState(combat, { ...state, phase:"players", playersDone:[] });
    await announce("<h3>Player Turn</h3><p>The enemies have ended their turn.</p>");
  } else {
    const nextRound = Math.max(1, Number(combat.round || state.round || 1) + 1);
    await combat.update({ round:nextRound, turn:null });
    await saveState(combat, { ...state, phase:"players", playersDone:[], round:nextRound });
    await announce(`<h3>Round ${nextRound}</h3><p><strong>Players act first.</strong></p>`);
  }
}

function renderSideControls(app, html) {
  const combat = app.viewed || activeCombat();
  const state = stateFor(combat);
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.classList.remove("sw25-side-active");
  document.body.classList.remove("sw25-side-combat-active");
  root.querySelector(".sw25-side-initiative")?.remove();
  if (!combat || !state?.active) return;
  root.classList.add("sw25-side-active");
  document.body.classList.add("sw25-side-combat-active");
  clearTrackerHighlights(root);
  clearIndividualTurnMarkers();
  const done = new Set(state.playersDone || []);
  const players = characterCombatants(combat);
  const remaining = players.filter(combatant => !done.has(combatant.id));
  const ownedRemaining = remaining.filter(combatant => combatant.actor?.isOwner);
  const panel = document.createElement("section");
  panel.className = `sw25-side-initiative phase-${state.phase}`;
  panel.innerHTML = `<h3>${state.phase === "players" ? "Player Turn" : "Monster Turn"}</h3><p>${state.phase === "players" ? `${done.size}/${players.length} players finished` : "The monsters are acting"}</p>${state.phase === "players" && ownedRemaining.length ? '<button type="button" data-sw25-side-action="end-player"><i class="fas fa-check"></i> End Turn</button>' : ""}${state.phase === "monsters" && game.user.isGM ? '<button type="button" data-sw25-side-action="end-monsters"><i class="fas fa-forward"></i> End Monster Turn</button>' : ""}`;
  (root.querySelector(".combat-tracker") || root).append(panel);
  panel.querySelector("[data-sw25-side-action='end-player']")?.addEventListener("click", () => requestPlayerEnd(combat));
  panel.querySelector("[data-sw25-side-action='end-monsters']")?.addEventListener("click", () => endMonsterPhase(combat));
}

export async function initializeSideInitiative() {
  if (game.user.isGM) {
    try {
      const trackerConfig = foundry.utils.deepClone(game.settings.get("core", "combatTrackerConfig") || {});
      trackerConfig.turnMarker ??= {};
      if (trackerConfig.turnMarker.enabled !== false) {
        trackerConfig.turnMarker.enabled = false;
        await game.settings.set("core", "combatTrackerConfig", trackerConfig);
      }
    } catch (error) {
      console.warn("Could not disable the default token turn marker.", error);
    }
  }
  game.socket.on(SOCKET, payload => handleAction(payload, payload.userId));
  Hooks.on("renderCombatTracker", renderSideControls);
  Hooks.on("updateCombat", combat => {
    if (!stateFor(combat)?.active) return;
    if (combat.turn !== null && game.user.isGM) combat.update({ turn:null });
    setTimeout(clearIndividualTurnMarkers, 0);
    setTimeout(clearIndividualTurnMarkers, 100);
    setTimeout(() => clearTrackerHighlights(), 0);
  });
  Hooks.on("canvasReady", () => {
    if (stateFor(activeCombat())?.active) clearIndividualTurnMarkers();
  });
  Hooks.on("refreshToken", token => {
    if (!stateFor(activeCombat())?.active || !token?.turnMarker) return;
    token.turnMarker.visible = false;
    token.turnMarker.renderable = false;
  });
}

const FLAG_SCOPE = "sword-world-25";
const FLAG_KEY = "sideInitiative";
const SOCKET = "system.sword-world-25";
let sideTurnWindow = null;

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
  queueSideControls(combat);
  if (game.user.isGM) game.socket.emit(SOCKET, { action:"sync-side-state", combatId:combat.id });
}

function trackerRoot(app, html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return app?.element instanceof HTMLElement ? app.element : null;
}

function queueSideControls(combat = activeCombat()) {
  setTimeout(() => {
    const trackers = [ui.combat, ui.combat?.popout].filter(app => app?.rendered && (!combat || app.viewed?.id === combat.id));
    for (const tracker of trackers) renderSideControls(tracker, tracker.element);
    if (sideTurnWindow?.rendered && (!combat || sideTurnWindow.combatId === combat.id)) sideTurnWindow.render(false);
  }, 0);
}

const SideTurnApplication = globalThis.Application ?? class {};

class SW25SideTurnWindow extends SideTurnApplication {
  constructor(combatId, options = {}) {
    super(options);
    this.combatId = combatId;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:"sw25-side-turn-window",
      title:"Sword World Side Turns",
      template:"systems/sword-world-25/templates/apps/side-turn-window.hbs",
      width:330,
      height:"auto",
      resizable:false,
      classes:["sw25", "sw25-side-turn-window"]
    });
  }

  getData() {
    const combat = game.combats.get(this.combatId);
    const state = stateFor(combat);
    const done = new Set(state?.playersDone || []);
    const players = characterCombatants(combat);
    const remaining = players.filter(combatant => !done.has(combatant.id));
    return {
      active:Boolean(state?.active),
      phase:state?.phase || "players",
      playerPhase:state?.phase === "players",
      monsterPhase:state?.phase === "monsters",
      done:done.size,
      total:players.length,
      round:Number(state?.round || combat?.round || 1),
      canEndPlayer:state?.phase === "players" && !game.user.isGM && remaining.some(combatant => combatant.actor?.isOwner),
      gmPlayerControls:state?.phase === "players" && game.user.isGM,
      remainingPlayers:remaining.map(combatant => ({ id:combatant.id, name:combatant.name })),
      canEndMonsters:state?.phase === "monsters" && game.user.isGM
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='end-player-turn']").on("click", event => {
      event.preventDefault();
      return requestPlayerEnd(game.combats.get(this.combatId));
    });
    html.find("[data-action='end-monster-turn']").on("click", event => {
      event.preventDefault();
      return endMonsterPhase(game.combats.get(this.combatId));
    });
    html.find("[data-action='gm-end-player-turn']").on("click", event => {
      event.preventDefault();
      return requestGMPlayerEnd(game.combats.get(this.combatId), [event.currentTarget.dataset.combatantId]);
    });
    html.find("[data-action='gm-end-all-player-turns']").on("click", event => {
      event.preventDefault();
      return requestGMPlayerEnd(game.combats.get(this.combatId));
    });
  }

  async close(options = {}) {
    if (sideTurnWindow === this) sideTurnWindow = null;
    return super.close(options);
  }
}

function openSideTurnWindow(combat = activeCombat()) {
  if (!combat || !stateFor(combat)?.active) return ui.notifications.warn("Side initiative has not started for this encounter.");
  if (sideTurnWindow && sideTurnWindow.combatId !== combat.id) sideTurnWindow.close();
  sideTurnWindow ??= new SW25SideTurnWindow(combat.id);
  sideTurnWindow.render(true);
}

export async function recordPlayerInitiative(actor, total) {
  const combat = activeCombat();
  if (!combat) return ui.notifications.warn("There is no active combat encounter.");
  const matches = characterCombatants(combat).filter(combatant => combatant.actor?.id === actor.id);
  if (!matches.length) return ui.notifications.warn(`${actor.name} is not in the active combat encounter.`);
  for (const combatant of matches) await combat.setInitiative(combatant.id, Number(total));
  ui.notifications.info(`${actor.name}'s side initiative is ${total}.`);
}

export async function beginMonsterInitiative(actor, total) {
  const combat = activeCombat();
  if (!combat) return ui.notifications.warn("There is no active combat encounter.");
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can roll the monster side initiative.");
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
  await saveState(combat, state);
  // Save the side state before starting combat. Foundry V14 renders the
  // tracker during startCombat(), so the panel must already have state to read.
  if (!combat.started) await combat.startCombat();
  if (combat.turn !== null) await combat.update({ turn:null });
  queueSideControls(combat);
  await announce(`<h3>Side Initiative</h3><p><strong>Players:</strong> ${Math.max(...Object.values(playerInitiatives))} &nbsp; <strong>Monsters:</strong> ${total}</p><p><strong>${startingSide === "players" ? "Players" : "Monsters"} act first.</strong></p>`);
}

async function handleAction(payload, userId) {
  if (!game.user.isGM) return;
  const combat = game.combats.get(payload.combatId);
  const state = stateFor(combat);
  if (!combat || !state?.active) return;
  if (payload.action === "end-player") {
    const user = game.users.get(userId);
    const gmOverride = Boolean(payload.gmOverride && game.user.isGM);
    if (!gmOverride && !user) {
      console.warn("Sword World 2.5 | Rejected End Turn request without a valid user.", payload);
      return;
    }
    const requested = new Set(payload.combatantIds || []);
    // The requesting client only offers combatants for which actor.isOwner is
    // true. Re-resolving synthetic-token ownership on the GM client can differ
    // in V14, so validate the requested IDs against the encounter rather than
    // rejecting a legitimate request because the GM sees a different Actor.
    const valid = characterCombatants(combat).filter(combatant => requested.has(combatant.id)).map(combatant => combatant.id);
    if (!valid.length) {
      console.warn("Sword World 2.5 | End Turn request did not match an owned player combatant.", { userId, requested:[...requested] });
      return;
    }
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
  else {
    const gmIds = ChatMessage.getWhisperRecipients("GM").map(user => user.id);
    await ChatMessage.create({
      whisper:gmIds,
      content:`<div class="sw25-chat-card"><h3>End Turn</h3><p><strong>${foundry.utils.escapeHTML(game.user.name)}</strong> ended their player turn.</p></div>`,
      flags:{ [FLAG_SCOPE]:{ sideTurnRequest:{ action:"end-player", combatId:combat.id, combatantIds:ids, userId:game.user.id } } }
    });
    ui.notifications.info("End Turn sent to the GM.");
  }
}

async function requestGMPlayerEnd(combat, combatantIds = null) {
  if (!game.user.isGM) return;
  const state = stateFor(combat);
  if (state?.phase !== "players") return;
  const done = new Set(state.playersDone || []);
  const remaining = characterCombatants(combat).filter(combatant => !done.has(combatant.id));
  const ids = combatantIds?.filter(Boolean) || remaining.map(combatant => combatant.id);
  if (!ids.length) return ui.notifications.warn("There are no unfinished player turns.");
  await handleAction({ action:"end-player", combatId:combat.id, combatantIds:ids, gmOverride:true }, game.user.id);
}

async function endMonsterPhase(combat) {
  if (!game.user.isGM) return;
  const state = stateFor(combat);
  if (state?.phase !== "monsters") return;
  if (state.firstPhase === "monsters") {
    await saveState(combat, { ...state, phase:"players", playersDone:[] });
    await announce("<h3>Player Turn</h3><p>The monsters have ended their turn.</p>");
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
  const root = trackerRoot(app, html);
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
  const panel = document.createElement("section");
  panel.className = "sw25-side-initiative sw25-side-launcher";
  panel.innerHTML = `<button type="button" data-sw25-side-action="open-window"><i class="fas fa-people-arrows"></i> Open Side Turns</button>`;
  (root.querySelector(".combat-tracker") || root).append(panel);
  panel.querySelector("[data-sw25-side-action='open-window']")?.addEventListener("click", () => openSideTurnWindow(combat));
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
      console.warn("Sword World 2.5 | Could not disable the default token turn marker.", error);
    }
  }
  game.socket.on(SOCKET, (payload, senderId) => {
    if (payload?.action === "sync-side-state") {
      const combat = game.combats.get(payload.combatId);
      if (combat) {
        queueSideControls(combat);
        openSideTurnWindow(combat);
      }
      return;
    }
    handleAction(payload, payload.userId || senderId);
  });
  Hooks.on("createChatMessage", message => {
    if (!game.user.isGM) return;
    const request = message.getFlag(FLAG_SCOPE, "sideTurnRequest");
    if (request?.action === "end-player") handleAction(request, request.userId);
  });
  Hooks.on("renderCombatTracker", renderSideControls);
  // Foundry V14 renders the Combat Tracker through ApplicationV2 and may only
  // replace one of its template parts. The generic hook keeps the side panel
  // mounted when the class-specific render hook is skipped for a partial render.
  Hooks.on("renderApplicationV2", (app, html) => {
    const CombatTracker = foundry.applications.sidebar.tabs.CombatTracker;
    if (app instanceof CombatTracker) renderSideControls(app, html);
  });
  Hooks.on("updateCombat", combat => {
    if (!stateFor(combat)?.active) return;
    if (combat.turn !== null && game.user.isGM) combat.update({ turn:null });
    setTimeout(clearIndividualTurnMarkers, 0);
    setTimeout(clearIndividualTurnMarkers, 100);
    setTimeout(() => clearTrackerHighlights(), 0);
    queueSideControls(combat);
  });
  Hooks.on("canvasReady", () => {
    if (stateFor(activeCombat())?.active) clearIndividualTurnMarkers();
  });
  Hooks.on("refreshToken", token => {
    if (!stateFor(activeCombat())?.active || !token?.turnMarker) return;
    token.turnMarker.visible = false;
    token.turnMarker.renderable = false;
  });
  if (stateFor(activeCombat())?.active) {
    queueSideControls(activeCombat());
    openSideTurnWindow(activeCombat());
  }
}

export function rollDiceResults(roll) {
  return (roll?.dice || []).flatMap(die =>
    (die.results || []).filter(result => result.active !== false).map(result => Number(result.result))
  );
}

export function isCriticalFailure(roll) {
  const results = rollDiceResults(roll);
  return results.length === 2 && results.every(result => result === 1);
}

export const criticalFailureHTML = () => '<p class="sw25-critical-failure"><strong>CRITICAL FAILURE</strong></p>';

export function nextAutomaticFailureCount(system = {}) {
  const legacyList = Array.isArray(system.automaticFailures) ? system.automaticFailures : [];
  const legacy = legacyList.filter(Boolean).length;
  const stored = Number(system.automaticFailureCount ?? 0) || 0;
  return Math.max(stored, legacy) + 1;
}

function counterActor(actor) {
  if (!actor?.isToken || actor.token?.actorLink !== false) return actor;
  return game.actors.get(actor.token?.actorId || actor.id) || actor;
}

export async function markCriticalFailure(actor, roll) {
  if (!isCriticalFailure(roll)) return false;
  if (actor?.type === "character") {
    const target = counterActor(actor);
    await target.update({
      "system.automaticFailureCount":nextAutomaticFailureCount(target.system),
      "system.automaticFailures":[]
    });
    target.sheet?.render(false);
  }
  return true;
}

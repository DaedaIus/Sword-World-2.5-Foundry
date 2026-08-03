const plain = value => String(value ?? "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/[`*_~]/g, "")
  .replace(/[ \t]+/g, " ")
  .trim();

const numeric = value => Number(String(value ?? "").match(/-?\d+/)?.[0] ?? 0);

const tableCells = line => String(line).split("|").map(plain).filter((cell, index, cells) =>
  cell || (index > 0 && index < cells.length - 1)
);

export function parseMonsterPage(input = "", url = "") {
  const source = String(input ?? "").replace(/\r/g, "")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, " | ");
  const rawLines = source.split("\n").map(line => line.trim()).filter(Boolean);
  const lines = rawLines.map(plain).filter(Boolean);
  const slugName = (() => {
    try { return decodeURIComponent(new URL(url).pathname.split(":").pop() || "Monster").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
    catch { return "Monster"; }
  })();
  const readerTitle = plain(lines.find(line => /^Title:/i.test(line))?.replace(/^Title:\s*/i, "").replace(/\s+-\s+Sword World.*$/i, ""));
  const levelLine = lines.find(line => /^(?:#{1,6}\s*)?Level\s+\d+\b/i.test(line)) || "";
  const levelMatch = levelLine.match(/Level\s+(\d+)\s+(.+?)\s*$/i);
  const createAt = lines.findIndex(line => /^#{0,6}\s*Create a Page$/i.test(line));
  const pageName = createAt >= 0 ? lines.slice(createAt + 1).find(line => !/^Home\b|^#{1,6}/i.test(line)) : "";
  const heading = lines.find(line => /^#{1,3}\s+/.test(line) && !/Sword World|Level\s+\d+|Create a Page|Site Navigation/i.test(line));
  const usefulReaderTitle = /Sword World 2\.5 Reference Wiki/i.test(readerTitle) ? "" : readerTitle;
  const name = usefulReaderTitle || plain(pageName) || plain(String(heading || slugName).replace(/^#{1,6}\s+/, "")) || slugName;
  const field = label => {
    const match = lines.find(line => new RegExp(`^${label}\\s*:`, "i").test(line));
    return plain(match?.replace(/^[^:]+:\s*/, "") || "");
  };

  const reputationWeakness = field("Reputation\\s*\\/\\s*Weakness");
  const [reputation = "0", weakness = "0"] = reputationWeakness.split("/").map(value => value.trim());
  const combatHeader = rawLines.findIndex(line => /Accuracy/i.test(line) && /Damage/i.test(line) && /Evasion/i.test(line) && /Defense/i.test(line) && /\bHP\b/i.test(line));
  const combatStyles = [];
  if (combatHeader >= 0) {
    for (let index = combatHeader + 1; index < rawLines.length; index++) {
      const line = rawLines[index];
      if (/^(?:#{1,6}|\*\s*\*\s*\*)/.test(line) || /Unique Skills|\bLoot\b/i.test(line)) break;
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
      const cells = tableCells(line);
      if (/Accuracy|Fighting Style/i.test(cells.join(" "))) continue;
      let compact = cells.filter(cell => cell !== "");
      if (compact.length < 7) {
        const flatLine = plain(line);
        const flat = flatLine.match(/^(.+?)\s+(-?\d+\s*(?:\(\d+\))?)\s*(\d+d(?:6)?(?:\s*[+-]\s*\d+)?)\s+(-?\d+\s*(?:\(\d+\))?)\s*(-?\d+)\s+(-?\d+|-)\s+(-?\d+|-)$/i)
          || flatLine.match(/^(.+?)(-?\d+\s*\(\d+\))\s*(\d+d(?:6)?(?:\s*[+-]\s*\d+)?)\s+(-?\d+\s*(?:\(\d+\))?)\s*(-?\d+)\s+(-?\d+|-)\s+(-?\d+|-)$/i);
        if (!flat) continue;
        compact = flat.slice(1);
      }
      combatStyles.push({
        style: compact[0] || "Attack",
        accuracy: compact[1] || "0",
        damage: compact[2] || "2d",
        evasion: compact[3] || "0",
        defense: numeric(compact[4]),
        hp: { value: numeric(compact[5]), max: numeric(compact[5]) },
        mp: { value: numeric(compact[6]), max: numeric(compact[6]) }
      });
    }
  }

  const lootHeader = rawLines.findIndex(line => /\b2d\b/i.test(line) && /\bLoot\b/i.test(line));
  const lootTable = [];
  if (lootHeader >= 0) {
    for (let index = lootHeader + 1; index < rawLines.length; index++) {
      const line = rawLines[index];
      if (/^#{1,6}\s/.test(line)) break;
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
      let cells = tableCells(line).filter(Boolean);
      if (cells.length < 2) {
        const flat = plain(line).match(/^(Always|\d+\s*(?:[-–]\s*\d+|\+))\s*(.+)$/i);
        if (!flat) continue;
        cells = [flat[1], flat[2]];
      }
      const roll = cells[0];
      if (!/^(?:Always|\d+\s*(?:[-–]\s*\d+|\+)?)$/i.test(roll)) continue;
      lootTable.push({ roll, loot: cells.slice(1).join(" | ") });
    }
  }

  const uniqueStart = lines.findIndex(line => /^(?:#{1,6}\s*)?Unique Skills$/i.test(line));
  const uniqueEnd = lines.findIndex((line, index) => index > uniqueStart && /\b2d\b.*\bLoot\b/i.test(line));
  const uniqueSkills = [];
  if (uniqueStart >= 0) {
    const block = lines.slice(uniqueStart + 1, uniqueEnd > uniqueStart ? uniqueEnd : lines.length);
    let current = null;
    for (const line of block) {
      const headingLine = /^(?:#{4,6}\s+|[◯○▶►△⏩🗨])/.test(line);
      if (headingLine) {
        if (current) uniqueSkills.push(current);
        current = { title: plain(line.replace(/^#{1,6}\s+/, "")), description: "" };
      } else if (current && !/^Source:/i.test(line)) current.description += `${current.description ? "\n" : ""}${line}`;
    }
    if (current) uniqueSkills.push(current);
  }

  const descriptionStart = lines.findIndex(line => /^Willpower:/i.test(line));
  const descriptionEnd = lines.findIndex((line, index) => index > descriptionStart && (/^Source:/i.test(line) || /Accuracy.*Damage.*Evasion/i.test(line)));
  const description = descriptionStart >= 0
    ? lines.slice(descriptionStart + 1, descriptionEnd > descriptionStart ? descriptionEnd : combatHeader).filter(line => !/^#{1,6}/.test(line)).join("\n\n")
    : "";

  return {
    name,
    system: {
      revealed: false,
      sourceUrl: url,
      level: numeric(levelMatch?.[1]),
      monsterType: plain(levelMatch?.[2]),
      intelligence: field("Intelligence"), perception: field("Perception"), disposition: field("Disposition"),
      soulscars: numeric(field("Soulscars")), languages: field("Language"), habitat: field("Habitat"),
      reputation: numeric(reputation), weakness: numeric(weakness), weakPoint: field("Weak Point"),
      initiative: numeric(field("Initiative")), movementSpeed: field("Movement Speed"),
      fortitude: field("Fortitude"), willpower: field("Willpower"), source: field("Source"), description,
      combatStyles, uniqueSkills, lootTable
    }
  };
}

export function monsterDamageFormula(value = "2d") {
  return String(value || "2d").trim().replace(/(\d+)d(?!\d)/gi, "$1d6").replace(/\s+/g, "");
}

export function lootMatches(value, roll) {
  const label = String(value || "").trim();
  if (/^always$/i.test(label)) return true;
  const range = label.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return roll >= Number(range[1]) && roll <= Number(range[2]);
  const plus = label.match(/^(\d+)\s*\+$/);
  if (plus) return roll >= Number(plus[1]);
  return Number(label) === roll;
}

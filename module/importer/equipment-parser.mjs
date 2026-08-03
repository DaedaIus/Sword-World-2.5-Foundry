const clean = value => String(value ?? "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/[*_`]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const PRICE = String.raw`\d[\d,]*(?:\/[\d,]+)*(?:\s*[–â€“-]\s*\d[\d,]*)?\+?(?:\s*\+\s*\d+\s+reputation)?`;

const splitPrice = value => {
  const text = clean(value);
  const match = text.match(new RegExp(`^(${PRICE})(?:\\s+|(?=[A-Za-z+]))?(.*)$`, "i"));
  if (!match) return null;
  return { priceText:match[1].trim(), notes:match[2].trim() };
};

export function parseEquipmentTables(input = "", sourceUrl = "", options = {}) {
  const lines = String(input ?? "").replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean);
  const tables = [];
  let table = options.defaultCategory ? { name:options.defaultCategory, items:[] } : null;
  if (table) tables.push(table);
  let readingRows = false;

  for (const raw of lines) {
    const heading = raw.match(/^###\s+(.+)$/);
    if (heading) {
      const name = clean(heading[1]);
      if (/^General Equipment/i.test(name)) continue;
      table = { name, items:[] };
      tables.push(table);
      readingRows = false;
      continue;
    }
    if (/^#{1,2}\s+/.test(raw)) {
      table = null;
      readingRows = false;
      continue;
    }
    if (!table) continue;

    const line = clean(raw);
    if (/^Name(?:\s+Stance)?\s+Price\s+Notes$/i.test(line)) { readingRows = true; continue; }
    if (/^\*\s*\*\s*\*$/.test(raw) || /^#{4,6}\s/.test(raw)) { readingRows = false; continue; }
    if (!readingRows || !line) continue;

    let name = "";
    let stance = "-";
    let priceData = null;
    const stanceMatch = line.match(/^(.+?)\s+(1H|2H)\s+(.+)$/i);
    if (stanceMatch) {
      name = clean(stanceMatch[1]);
      stance = stanceMatch[2].toUpperCase();
      priceData = splitPrice(stanceMatch[3]);
    } else {
      const flatMatch = line.match(new RegExp(`^(.+?)-(${PRICE})(.*)$`, "i"));
      if (flatMatch) {
        name = clean(flatMatch[1]);
        priceData = { priceText:flatMatch[2].trim(), notes:clean(flatMatch[3]) };
      } else {
        const spacedMatch = line.match(new RegExp(`^(.+?)\\s+(${PRICE})(?:\\s+|(?=[A-Za-z+]))?(.*)$`, "i"));
        if (spacedMatch) {
          name = clean(spacedMatch[1]);
          priceData = { priceText:spacedMatch[2].trim(), notes:clean(spacedMatch[3]) };
        }
      }
    }
    if (!name || !priceData) continue;

    table.items.push({
      name,
      category:table.name,
      stance,
      consumable:Boolean(options.consumable),
      price:Number(priceData.priceText.replace(/,/g, "").match(/\d+/)?.[0] || 0),
      priceText:priceData.priceText,
      reputationRequirement:Number(priceData.priceText.match(/\+\s*(\d+)\s+reputation/i)?.[1] || 0),
      notes:priceData.notes,
      sourceUrl
    });
  }
  return tables.filter(entry => entry.items.length);
}

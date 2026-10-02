const clean = value => String(value ?? "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/[*_`]/g, "")
  .replace(/\bGrapplers\b/gi, "Martial Artists")
  .replace(/\bGrappler\b/gi, "Martial Artist")
  .replace(/\s+/g, " ")
  .trim();

const PRICE = String.raw`\d[\d,]*(?:\/[\d,]+)*(?:\s*[–â€“-]\s*\d[\d,]*)?\+?(?:\s*\+\s*\d+\s+reputation)?`;

const splitPrice = value => {
  const text = clean(value);
  const match = text.match(new RegExp(`^(${PRICE})(?:\\s+|(?=[A-Za-z+]))?(.*)$`, "i"));
  if (!match) return null;
  return { priceText:match[1].trim(), notes:match[2].trim() };
};

const CLASS_SPECIFIC_PRICE = String.raw`(?:\d[\d,]*(?:\/[\d,]+)*(?:\s*[–â€“-]\s*\d[\d,]*)?\+?(?:\s+per\s+point)?(?:\s+or\s+(?:weapon|staff)\s+price\s*\+\s*\d[\d,]*)?(?:\s*\+\s*\d+\s+reputation)?|(?:weapon(?:\s+price)?|spear|shield)\s*\+\s*\d[\d,]*(?:\s*\+\s*\d+\s+reputation)?)`;
const CLASS_SPECIFIC_STANCE = String.raw`(?:1H(?:\s+or\s+as\s+staff)?(?:\s*,\s*2H)?(?:\s*,\s*R Hand)?(?:\s*,\s*L Hand)?(?:\s*,\s*Other)?|2H(?:\s*,\s*Back)?|Any|Back(?:\s*,\s*Waist)?(?:\s*,\s*Feet)?(?:\s*,\s*Other)?|Feet(?:\s*,\s*Other)?|R Hand\s*,\s*L Hand\s*,\s*Waist\s*,\s*Other|Head\s*,\s*Neck\s*,\s*Back\s*,\s*R Hand\s*,\s*L Hand\s*,\s*Waist|As weapon|As spear|As shield)`;

export function parseClassSpecificItems(input = "", sourceUrl = "") {
  const rows = [];
  let readingRows = false;
  for (const raw of String(input ?? "").replace(/\r/g, "").split("\n")) {
    const line = clean(raw);
    if (/^Name\s+Stance\s+Price\s+Notes$/i.test(line)) {
      readingRows = true;
      continue;
    }
    if (!readingRows) continue;
    if (/^(?:※1:|#{1,6}\s|\*\s*\*\s*\*)/i.test(raw.trim())) break;
    if (!line) continue;

    let name = "";
    let stance = "-";
    let priceText = "";
    let notes = "";
    const withStance = line.match(new RegExp(`^(.+?)\\s*(${CLASS_SPECIFIC_STANCE})\\s+(${CLASS_SPECIFIC_PRICE})(?:\\s+|(?=[A-Za-z\"'])|$)(.*)$`, "i"));
    if (withStance) {
      name = clean(withStance[1]);
      stance = clean(withStance[2]);
      priceText = clean(withStance[3]);
      notes = clean(withStance[4]);
    } else {
      const flat = line.match(new RegExp(`^(.+?)-(${CLASS_SPECIFIC_PRICE})(?:\\s+|(?=[A-Za-z\"'])|$)(.*)$`, "i"));
      if (!flat) continue;
      name = clean(flat[1]);
      priceText = clean(flat[2]);
      notes = clean(flat[3]);
    }
    if (!name || !priceText) continue;
    rows.push({
      name,
      category:"Class-Specific Items",
      stance,
      consumable:false,
      price:Number(priceText.replace(/,/g, "").match(/\d+/)?.[0] || 0),
      priceText,
      reputationRequirement:Number(priceText.match(/\+\s*(\d+)\s+reputation/i)?.[1] || 0),
      notes,
      hasPowerTable:false,
      power:0,
      powerTable:{},
      critical:0,
      additionalDamage:0,
      sourceUrl
    });
  }
  return rows.length ? [{ name:"Class-Specific Items", items:rows }] : [];
}

export function parseEquipmentTables(input = "", sourceUrl = "", options = {}) {
  const lines = String(input ?? "").replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean);
  const tables = [];
  let table = options.defaultCategory ? { name:options.defaultCategory, items:[] } : null;
  if (table) tables.push(table);
  let readingRows = false;
  let rowFormat = "standard";

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
    if (/^Name(?:\s+Stance)?\s+Power\s+.+\s+Crit\s+Add'l Dmg\s+Price\s+Notes$/i.test(line)) {
      readingRows = true;
      rowFormat = "power";
      continue;
    }
    if (/^Name(?:\s+Stance)?\s+Price\s+Notes$/i.test(line)) {
      readingRows = true;
      rowFormat = "standard";
      continue;
    }
    if (/^\*\s*\*\s*\*$/.test(raw) || /^#{4,6}\s/.test(raw)) { readingRows = false; continue; }
    if (!readingRows || !line) continue;

    let name = "";
    let stance = "-";
    let priceData = null;
    let powerData = null;
    if (rowFormat === "power") {
      const powerMatch = line.match(new RegExp(`^(.+?)-(\\d+)\\s+(-?\\d+(?:\\s+-?\\d+){9})\\s+(None|\\d+)\\s*(None|\\+\\d+|-)\\s*(${PRICE})(?:\\s+|(?=[A-Za-z]))?(.*)$`, "i"));
      if (powerMatch) {
        name = clean(powerMatch[1]);
        const results = powerMatch[3].split(/\s+/).map(Number);
        powerData = {
          power:Number(powerMatch[2]),
          powerTable:Object.fromEntries(results.map((result, index) => [String(index + 3), result])),
          critical:/^none$/i.test(powerMatch[4]) ? 0 : Number(powerMatch[4]),
          additionalDamage:/^none$|^-$/i.test(powerMatch[5]) ? 0 : Number(powerMatch[5])
        };
        priceData = { priceText:powerMatch[6].trim(), notes:clean(powerMatch[7]) };
      }
    }
    const stanceMatch = line.match(/^(.+?)\s+(1H|2H)\s+(.+)$/i);
    if (!powerData && stanceMatch) {
      name = clean(stanceMatch[1]);
      stance = stanceMatch[2].toUpperCase();
      priceData = splitPrice(stanceMatch[3]);
    } else if (!powerData) {
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
      hasPowerTable:Boolean(powerData),
      power:powerData?.power ?? 0,
      powerTable:powerData?.powerTable ?? {},
      critical:powerData?.critical ?? 0,
      additionalDamage:powerData?.additionalDamage ?? 0,
      sourceUrl
    });
  }
  return tables.filter(entry => entry.items.length);
}

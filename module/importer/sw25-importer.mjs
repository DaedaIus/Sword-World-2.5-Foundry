import { parseMonsterPage } from "./monster-parser.mjs";
import { parseClassSpecificItems, parseEquipmentTables } from "./equipment-parser.mjs";
import { defaultFeatureDefenseModifier } from "../rules/feature-defense.mjs";

export class SW25Importer {
  static async open(actor = null) {
    const content = `
      <form class="sw25-import-form">
        <p>Paste a Sword World 2.5 Reference Wiki URL. Supports <strong>race, class, combat feat, armour, and shield pages</strong>.</p>
        <div class="form-group">
          <label>Page URL</label>
          <input type="url" name="url" placeholder="http://sw25.wikidot.com/race:grassrunner" autofocus>
        </div>
        <p class="notes">Imported data is stored locally. The source website is not needed afterward.</p>
      </form>`;

    return new Promise(resolve => {
      new Dialog({
        title: "Import Sword World Page",
        content,
        buttons: {
          import: {
            icon: '<i class="fas fa-file-import"></i>',
            label: "Import",
            callback: async html => {
              const url = String(html.find('[name="url"]').val() ?? '').trim();
              try {
                const result = await this.importUrl(url, actor);
                ui.notifications.info(`Imported ${result.name}.`);
                resolve(result);
              } catch (error) {
                console.error("Sword World 2.5 | Import failed", error);
                ui.notifications.error(error.message || "The page could not be imported.");
                resolve(null);
              }
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "import"
      }).render(true);
    });
  }

  static async openClassFeature(actor, options = {}) {
    const label = options.featureLabel || "Class Ability";
    const example = options.prefix ? `http://sw25.wikidot.com/${options.prefix}example` : "http://sw25.wikidot.com/";
    const content = `<form class="sw25-import-form">
      <p>Paste a Sword World 2.5 Reference Wiki URL for <strong>${foundry.utils.escapeHTML(label)}</strong>.</p>
      <div class="form-group"><label>Page URL</label><input type="url" name="url" placeholder="${foundry.utils.escapeHTML(example)}" autofocus></div>
    </form>`;
    return new Promise(resolve => new Dialog({
      title: `Import ${label}`,
      content,
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: async html => {
            try {
              const url = this.normalizeUrl(String(html.find('[name="url"]').val() || "").trim());
              const slug = decodeURIComponent(new URL(url).pathname.replace(/^\//, "")).toLowerCase();
              if (options.prefix && !slug.startsWith(options.prefix.toLowerCase())) {
                throw new Error(`${label} URLs must begin with ${options.prefix}`);
              }
              const fetched = await this.fetchPage(url);
              const parsed = this.parseClassFeature(fetched.text, url, options);
              const item = await this.createClassFeature(parsed, actor);
              ui.notifications.info(`Imported ${item.name}.`);
              resolve(item);
            } catch (error) {
              console.error("Sword World 2.5 | Class feature import failed", error);
              ui.notifications.error(error.message || `Could not import ${label}.`);
              resolve(null);
            }
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "import",
      close: () => resolve(null)
    }).render(true));
  }

  static parseClassFeature(input = "", url = "", options = {}) {
    const strip = value => String(value ?? "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[`*_~]/g, "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
    const allLines = String(input ?? "")
      .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/\r/g, "")
      .split("\n").map(strip).filter(Boolean);
    const slugName = decodeURIComponent(new URL(url).pathname.split(":").pop() || "")
      .replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
    const createPageAt = allLines.findIndex(line => /^#{1,6}\s*Create a Page$/i.test(line));
    const pageLines = createPageAt >= 0 ? allLines.slice(createPageAt + 1) : allLines;
    const footerAt = pageLines.findIndex(line => /^(?:Help|Terms of Service|Privacy Policy|Report a bug)(?:\b|\|)/i.test(line));
    const lines = footerAt >= 0 ? pageLines.slice(0, footerAt) : pageLines;
    const ignoredTitles = /^(?:title:|url source:|markdown content:|sword world 2\.5 reference wiki$|site navigation$|create a page$|home$)/i;
    const titleLine = allLines.find(line => /^Title:\s*/i.test(line));
    const readerTitle = strip(String(titleLine || "").replace(/^Title:\s*/i, "").replace(/\s+-\s+Sword World 2\.5 Reference Wiki.*$/i, ""));
    const firstPageLine = lines.find(line => !/^#{1,6}\s/.test(line) && !ignoredTitles.test(line));
    const heading = lines.find(line => /^#{1,6}\s+/.test(line) && !ignoredTitles.test(line.replace(/^#{1,6}\s+/, "")));
    const name = (readerTitle && !/^Sword World 2\.5 Reference Wiki$/i.test(readerTitle))
      ? readerTitle
      : strip((firstPageLine || heading || slugName).replace(/^#{1,6}\s+/, "")) || slugName;
    const valueFor = patterns => {
      const line = lines.find(candidate => patterns.some(pattern => pattern.test(candidate)));
      return line ? strip(line.replace(/^[^:]+:\s*/, "")) : "";
    };
    const requirement = valueFor([/^[^:]{0,50}(?:spell|evocation|spellsong|finale|essence weaving|weaving|technique|aspect|infusion|stunt|stratagem|maneuver),.*required/i, /^[^:]{0,40},\s*(?:\d+(?:st|nd|rd|th)?\s+)?level\b/i, /^(?:level|required class|requirement|prerequisite):/i]);
    const mp = valueFor([/^mp(?: cost)?:/i, /^cost:\s*mp/i]).replace(/^MP\s*/i, "");
    let cost = valueFor([/^cost:/i, /^cards?:/i, /^rhythm cost:/i]) || (mp ? `MP ${mp}` : "");
    const metadataPatterns = /^(?:target|range\/area|range|duration|resistance|type|rank|conditions|cards?|cost|mp(?: cost)?|singing|pet|effect condition|base rhythm|flourish value|extra rhythm|rhythm cost|edge cost|edge accumulation|prerequisite|requirement):/i;
    const metadata = lines.filter(line => metadataPatterns.test(line)).join("\n");
    const baseRhythm = valueFor([/^base rhythm:/i]);
    const extraRhythm = valueFor([/^extra rhythm:/i]);
    const rhythmCost = valueFor([/^rhythm cost:/i]);
    const edgeAccumulationText = valueFor([/^edge accumulation:/i]);
    const edgeCostText = valueFor([/^edge cost:/i]);
    if (["stratagem", "maneuver"].includes(String(options.featureType || "").toLowerCase())) cost = edgeCostText || "None";
    const cardsText = valueFor([/^cards?:/i]);
    const rhythmValues = value => ({
      uplifting: Number(String(value).match(/⮭\s*(\d+)/)?.[1] || 0),
      calming: Number(String(value).match(/⮯\s*(\d+)/)?.[1] || 0),
      enchanting: Number(String(value).match(/♡\s*(\d+)/)?.[1] || 0)
    });
    const qiMatch = cost.match(/^(Heavenly|Earthly|Spirit)\s+Qi\s+(\d+)(?:\s*-\s*(\d+))?/i);
    const resourceData = {
      baseRhythm: rhythmValues(baseRhythm),
      extraRhythm: rhythmValues(extraRhythm),
      rhythmCost: rhythmValues(rhythmCost),
      qiType: String(qiMatch?.[1] || "").toLowerCase(),
      qiMin: Number(qiMatch?.[2] || 0),
      qiMax: Number(qiMatch?.[3] || qiMatch?.[2] || 0),
      hpCost: /^\s*(?:\d+d|\d+)\s*HP\s*$/i.test(cost) ? cost.replace(/\s*HP\s*$/i, "") : "",
      cardCount: Number(cardsText.match(/x\s*(\d+)/i)?.[1] || 1),
      suggestedCardColor: String(cardsText.match(/Red|Green|Blue|White|Gold/i)?.[0] || "").toLowerCase(),
      edgeAccumulation: Number(edgeAccumulationText.match(/[+-]?\d+/)?.[0] || 0),
      edgeCost: /^none$/i.test(edgeCostText) ? 0 : Number(edgeCostText.match(/\d+/)?.[0] || 0)
    };
    const powerHeaderAt = lines.findIndex(line => /^Power\s+\S+(?:\s+\S+){9}\s+Crit(?:ical)?$/i.test(line));
    const powerRowPattern = new RegExp(
      "^\\s*(\\d+)\\s+" + Array(9).fill("(-?\\d+)\\s+").join("") + "(-?\\d+)(.*)$"
    );
    const powerMatch = powerHeaderAt >= 0 ? String(lines[powerHeaderAt + 1] || "").match(powerRowPattern) : null;
    const hasPowerTable = Boolean(powerMatch);
    const powerTable = {};
    if (hasPowerTable) for (let result = 3; result <= 12; result++) powerTable[String(result)] = Number(powerMatch[result - 1]) || 0;
    const criticalToken = hasPowerTable ? String(powerMatch[12] || "").trim() : "";
    const criticalModifierMatch = criticalToken.match(/^([+-]|±)(\d+)$/);
    const criticalModifier = criticalModifierMatch
      ? (criticalModifierMatch[1] === "-" ? -1 : criticalModifierMatch[1] === "+" ? 1 : 0) * Number(criticalModifierMatch[2])
      : 0;
    const criticalNumber = Number(criticalToken);
    const criticalSuffix = { "©": 10, "ª": 11, "«": 12 };
    const critical = criticalModifierMatch ? 0 : Number.isFinite(criticalNumber)
      ? criticalNumber
      : ({ "⑩": 10, "⑪": 11, "⑫": 12 }[criticalToken] ?? criticalSuffix[criticalToken.slice(-1)] ?? 0);
    const specialDamageBands = lines.map(line => {
      const match = line.match(/^\s*\|?\s*(\d+)\s*[-–]\s*(\d+)\s*\|?\s+(.+?)\s*\|?\s*$/i);
      if (!match || !/magic power/i.test(match[3]) || !/damage/i.test(match[3])) return null;
      const text = match[3].replace(/^\|\s*/, "").replace(/\s*\|$/, "").trim();
      const bonusMatch = text.match(/(\d+)\s*\+\s*Magic Power/i);
      return {
        min:Number(match[1]), max:Number(match[2]), bonus:Number(bonusMatch?.[1] || 0),
        damageType:/physical damage/i.test(text) ? "physical" : "magical",
        text
      };
    }).filter(Boolean);
    const description = lines.filter(line =>
      line !== name && line !== heading && line !== titleLine && !ignoredTitles.test(line) &&
      !/^#{1,6}\s+/.test(line) && !metadataPatterns.test(line) &&
      !/^(?:this is sw2\.0 content|source:|click here|return to list)/i.test(line) &&
      !new RegExp(`^(?:${options.featureType || "ability"}),`, "i").test(line)
    ).join("\n\n").trim();
    return {
      name,
      type: options.featureType === "spell" ? "spell" : "ability",
      classId: options.classId || "",
      className: options.className || "",
      featureType: options.featureType || "ability",
      requirement,
      cost,
      mpCost: Number(String(mp).match(/\d+/)?.[0] || 0),
      power: hasPowerTable ? Number(powerMatch[1]) : 0,
      powerTable,
      critical,
      criticalModifier,
      hasPowerTable,
      specialDamageBands,
      metadata,
      resourceData,
      description,
      sourceUrl: url
    };
  }

  static async createClassFeature(parsed, actor) {
    if (!actor) throw new Error("Class features must be imported onto a character.");
    const system = {
      source: "class",
      classId: parsed.classId,
      className: parsed.className,
      featureType: parsed.featureType,
      requirement: parsed.requirement,
      cost: parsed.cost,
      mpCost: parsed.mpCost,
      power: parsed.power,
      powerTable: parsed.powerTable,
      critical: parsed.critical,
      criticalModifier: parsed.criticalModifier,
      hasPowerTable: parsed.hasPowerTable,
      specialDamageBands: parsed.specialDamageBands || [],
      school: parsed.className,
      level: Number(String(parsed.requirement).match(/\d+/)?.[0] || 1),
      metadata: parsed.metadata,
      resourceData: parsed.resourceData,
      description: parsed.description,
      sourceUrl: parsed.sourceUrl
    };
    const existing = actor.items.find(item =>
      item.type === parsed.type && item.name.toLowerCase() === parsed.name.toLowerCase() &&
      String(item.system.classId || "") === String(parsed.classId || "")
    );
    if (existing) {
      await existing.update(Object.fromEntries(Object.entries(system).map(([key, value]) => [`system.${key}`, value])));
      return existing;
    }
    const [created] = await actor.createEmbeddedDocuments("Item", [{ name: parsed.name, type: parsed.type, system }]);
    return created;
  }

  static normalizeUrl(value) {
    if (!value) throw new Error("Enter a page URL.");
    let url;
    try { url = new URL(value); }
    catch { throw new Error("That is not a valid URL."); }
    if (!["sw25.wikidot.com", "www.sw25.wikidot.com"].includes(url.hostname.toLowerCase())) {
      throw new Error("This importer currently accepts sw25.wikidot.com pages only.");
    }
    url.protocol = "https:";
    return url.toString();
  }

  static readerTargets(url) {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const encodedPath = `${parsed.pathname.replace(/:/g, "%3A")}${parsed.search}`;
    const httpTarget = `http://${parsed.host}${path}`;
    const httpsTarget = `https://${parsed.host}${path}`;
    return [...new Set([
      // Wikidot's HTTPS endpoint is inconsistent behind the reader. The fully
      // encoded HTTP target is currently the most reliable form and was
      // previously missing from this list.
      `https://r.jina.ai/${encodeURIComponent(httpTarget)}`,
      // Jina Reader now rejects the older path-style form for some Wikidot
      // pages, but accepts the same URL when the complete target is encoded.
      `https://r.jina.ai/${encodeURIComponent(httpsTarget)}`,
      `https://r.jina.ai/https://${parsed.host}${path}`,
      `https://r.jina.ai/http://${parsed.host}${path}`,
      `https://r.jina.ai/https://${parsed.host}${encodedPath}`,
      `https://r.jina.ai/http://${parsed.host}${encodedPath}`
    ])];
  }

  static async fetchPage(url) {
    // Wikidot does not expose CORS headers. Fetch its original HTML through a
    // CORS-aware proxy first so imports do not depend on Jina's browser-facing
    // Cloudflare challenge. normalizeUrl restricts this to the SW25 wiki.
    const proxyUrl = `https://proxy.cors.dev/${url}`;
    const targets = this.readerTargets(url);

    const errors = [];
    try {
      const response = await fetch(proxyUrl, {
        credentials: "omit",
        headers: { Accept: "text/html, text/plain;q=0.9" }
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Proxy returned ${response.status}.`);
      if (text.length < 150 || !/<(?:html|body|table|div)[\s>]/i.test(text)) {
        throw new Error("Proxy returned an empty or invalid page.");
      }
      return { kind: "html", text, readerUrl: proxyUrl };
    } catch (error) {
      errors.push(`${proxyUrl}: ${error.message}`);
    }

    // Retain the reader variants as fallbacks for installations where the
    // proxy is unavailable or a page needs Reader's Markdown conversion.
    for (const readerUrl of targets) {
      try {
        const response = await fetch(readerUrl, {
          credentials: "omit",
          headers: { Accept: "text/plain, text/markdown, text/html" }
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`Reader returned ${response.status}.`);
        if (text.length < 150 || /^(?:internal server error|bad gateway|not found|forbidden)\s*$/i.test(text.trim())) {
          throw new Error("Reader returned an empty or error page.");
        }
        return { kind: /<table[\s>]/i.test(text) ? "html" : "markdown", text, readerUrl };
      } catch (error) {
        errors.push(`${readerUrl}: ${error.message}`);
      }
    }

    // This will usually be blocked by CORS, but is useful on installations
    // whose reverse proxy permits the wiki directly.
    try {
      const response = await fetch(url, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(`Wiki returned ${response.status}.`);
      return { kind: "html", text: await response.text(), readerUrl: url };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }

    throw new Error(`Could not download the page. ${errors.join(" | ")}`);
  }

  static async importUrl(value, actor = null) {
    const url = this.normalizeUrl(value);
    const slug = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    const fetched = await this.fetchPage(url);

    if (slug.startsWith("monster:")) {
      if (!actor || actor.type !== "monster") throw new Error("Monster pages must be imported onto a Monster actor.");
      const parsed = parseMonsterPage(fetched.text, url);
      await actor.update({ name: parsed.name, system: parsed.system });
      actor.sheet?.render(false);
      return actor;
    }

    if (slug.startsWith("race:")) {
      const parsed = fetched.kind === "html"
        ? this.parseRaceHtml(fetched.text, url)
        : this.parseRaceMarkdown(fetched.text, url);
      return this.createRace(parsed, actor);
    }

    if (slug.startsWith("class:")) {
      const parsed = fetched.kind === "html"
        ? this.parseClassHtml(fetched.text, url)
        : this.parseClassMarkdown(fetched.text, url);
      return this.createClass(parsed, actor);
    }

    if (slug.startsWith("feat:")) {
      const parsed = fetched.kind === "html"
        ? this.parseFeatHtml(fetched.text, url)
        : this.parseFeatMarkdown(fetched.text, url);
      return this.createFeat(parsed, actor);
    }

    if (slug.startsWith("items:")) {
      const category = this.weaponCategoryFromUrl(url);
      const weaponCategories = [
        "axes", "swords", "spears", "maces", "staves", "flails",
        "warhammers", "bows", "crossbows", "guns", "thrown", "wrestling"
      ];
      if (weaponCategories.includes(category.toLowerCase())) {
        globalThis.SW25_LAST_WEAPON_SOURCE = String(fetched.text ?? "");
        const parsed = this.parseWeaponTables(fetched.text, url);

        if (!parsed.length) {
          console.error("Sword World 2.5 | Weapon parse failed", {
            url,
            readerUrl: fetched.readerUrl,
            source: globalThis.SW25_LAST_WEAPON_SOURCE
          });

          try {
            const blob = new Blob(
              [globalThis.SW25_LAST_WEAPON_SOURCE],
              { type: "text/plain;charset=utf-8" }
            );
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `sw25-${category || "weapon"}-captured-source.txt`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
          } catch (downloadError) {
            console.warn(
              "Sword World 2.5 | Could not download captured weapon source",
              downloadError
            );
          }
        }

        const selected = await this.selectWeapons(parsed, category);
        if (!selected?.length) return [];
        return this.createWeapons(selected, actor);
      }
    }

    if (["items:metal-armor", "items:nonmetallic-armor", "items:shields"].includes(slug)) {
      if (!actor) throw new Error("Armour tables must be imported onto a character.");
      const tables = this.parseArmourTables(fetched.text);
      if (slug === "items:shields") {
        const expectedMinimums = new Map([
          ["b-rank shields", 10],
          ["a-rank shields", 11]
        ]);
        const counts = new Map(tables.map(table => [String(table.name).toLowerCase(), table.items?.length ?? 0]));
        const incomplete = [...expectedMinimums].filter(([name, count]) => (counts.get(name) ?? 0) < count);
        if (incomplete.length) {
          const captured = String(fetched.text ?? "");
          globalThis.SW25_LAST_SHIELD_SOURCE = captured;
          console.error("Sword World 2.5 | Incomplete shield parse", {
            counts: Object.fromEntries(counts),
            source: captured
          });

          try {
            const blob = new Blob([captured], { type: "text/plain;charset=utf-8" });
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = "sw25-shields-captured-source.txt";
            link.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
          } catch (downloadError) {
            console.warn("Sword World 2.5 | Could not download captured shield source", downloadError);
          }

          throw new Error(`Shield table parsing is incomplete (${incomplete.map(([name, expected]) => `${name}: ${counts.get(name) ?? 0}/${expected}`).join(", ")}). The captured source has been downloaded as sw25-shields-captured-source.txt.`);
        }
      }
      return this.chooseArmourTable(tables, actor, url);
    }

    const equipmentPages = {
      "items:general-equipment":{},
      "items:adventure-tools-consumable":{ defaultCategory:"Adventure Tools (Consumable)", consumable:true },
      "items:herbs-potions-chemicals":{ consumable:true },
      "items:accessories":{},
      "items:class-specific":{ classSpecific:true }
    };
    if (slug in equipmentPages) {
      if (!actor) throw new Error("Equipment tables must be imported onto a character.");
      const tables = equipmentPages[slug].classSpecific
        ? parseClassSpecificItems(fetched.text, url)
        : parseEquipmentTables(fetched.text, url, equipmentPages[slug]);
      if (!tables.length) throw new Error("No equipment tables could be read from this page.");
      const selected = await this.selectEquipment(tables);
      if (!selected) return null;
      return this.createEquipment(selected, actor);
    }

    throw new Error("This page type is not supported yet.");
  }

  static async selectEquipment(tables = []) {
    const categoryOptions = tables.map((table, index) => `<option value="${index}">${foundry.utils.escapeHTML(table.name)} (${table.items.length})</option>`).join("");
    const categoryIndex = await new Promise(resolve => new Dialog({
      title:"Choose Equipment Category",
      content:`<form><div class="form-group"><label>Category</label><select name="category">${categoryOptions}</select></div></form>`,
      buttons:{ next:{label:"Next",callback:html=>resolve(Number(html.find('[name="category"]').val()))}, cancel:{label:"Cancel",callback:()=>resolve(null)} },
      default:"next", close:()=>resolve(null)
    }).render(true));
    if (categoryIndex === null) return null;
    const table = tables[categoryIndex];
    const itemOptions = table.items.map((item, index) => `<option value="${index}">${foundry.utils.escapeHTML(`${item.name} — ${item.priceText}G${item.stance && item.stance !== "-" ? `, ${item.stance}` : ""}`)}</option>`).join("");
    const itemIndex = await new Promise(resolve => new Dialog({
      title:table.name,
      content:`<form><div class="form-group"><label>Equipment</label><select name="item">${itemOptions}</select></div></form>`,
      buttons:{ import:{label:"Import",callback:html=>resolve(Number(html.find('[name="item"]').val()))}, cancel:{label:"Cancel",callback:()=>resolve(null)} },
      default:"import", close:()=>resolve(null)
    }).render(true));
    return itemIndex === null ? null : table.items[itemIndex];
  }

  static async createEquipment(equipment, actor) {
    const documents = this.equipmentDocuments(equipment);
    const created = await actor.createEmbeddedDocuments("Item", documents);
    if (created.length === 1) return created[0];
    return { name:`${equipment.name} (${created.length} items)`, items:created };
  }

  static equipmentDocuments(equipment = {}) {
    const baseSystem = {
      quantity:1,
      equipped:false,
      consumable:Boolean(equipment.consumable),
      category:equipment.category,
      stance:equipment.stance,
      price:equipment.price,
      priceText:equipment.priceText,
      reputationRequirement:equipment.reputationRequirement,
      hasPowerTable:Boolean(equipment.hasPowerTable),
      power:Number(equipment.power ?? 0),
      powerTable:equipment.powerTable || {},
      critical:Number(equipment.critical ?? 0),
      additionalDamage:Number(equipment.additionalDamage ?? 0),
      notes:equipment.notes,
      description:equipment.notes,
      sourceUrl:equipment.sourceUrl
    };
    if (String(equipment.name || "").trim().toLowerCase() !== "adventurer set") {
      return [{ name:equipment.name, type:"equipment", system:baseSystem }];
    }

    const parts = [
      { name:"Backpack" },
      { name:"Waterskin" },
      { name:"Blanket" },
      { name:"Torches", quantity:6, consumable:true },
      { name:"Tinderbox" },
      { name:"10m Rope" },
      { name:"Small Knife" }
    ];
    return parts.map(part => ({
      name:part.name,
      type:"equipment",
      system:{
        ...baseSystem,
        quantity:part.quantity ?? 1,
        consumable:Boolean(part.consumable),
        category:"Adventurer Set",
        stance:"-",
        price:0,
        priceText:"Part of Adventurer Set",
        reputationRequirement:0,
        notes:"Part of Adventurer Set",
        description:"Part of Adventurer Set"
      }
    }));
  }


  static parseArmourTables(markdown = "") {
    const stripMagicIconMarkup = value => String(value ?? "")
      // Linked Markdown image: [![...](...magicicon.png...)](...)
      .replace(/\[\s*!\[[^\]]*\]\([^)]*magicicon\.png[^)]*\)\s*\]\([^)]*\)/gi, "")
      // Ordinary Markdown image.
      .replace(/!\[[^\]]*\]\([^)]*magicicon\.png[^)]*\)/gi, "")
      // Ordinary Markdown link whose label or destination contains the icon.
      .replace(/\[[^\]]*magicicon\.png[^\]]*\]\([^)]*\)/gi, "")
      .replace(/\[[^\]]*\]\([^)]*magicicon\.png[^)]*\)/gi, "")
      // Bare URL. Stop at table delimiters and closing Markdown punctuation so
      // the remaining cells on the row are never consumed.
      .replace(/https?:\/\/[^\s|)\]]*magicicon\.png[^\s|)\]]*/gi, "")
      .replace(/\bmagicicon\.png\b/gi, "");

    const source = stripMagicIconMarkup(String(markdown ?? "").replace(/\r/g, ""));
    const tables = [];

    const stripMarkdown = value => this.clean(stripMagicIconMarkup(String(value ?? ""))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[`*_~]/g, "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\(Details Below\)/ig, ""));

    const numberValue = value => {
      const cleaned = stripMarkdown(value)
        .replace(/[＋+]/g, "")
        .replace(/[−–—]/g, "-")
        .replace(/^[-—–]$/, "0")
        .replace(/[^0-9-]/g, "");
      return Number(cleaned) || 0;
    };

    const makeItem = (name, minStrength, evasion, defence, notes = "") => {
      const cleanName = stripMarkdown(name);
      return {
        name: cleanName,
        minStrength: numberValue(minStrength),
        evasion: numberValue(evasion),
        defence: numberValue(defence),
        notes: stripMarkdown(notes).replace(/\s*\(Details Below\)\s*/ig, " ").trim(),
        magicalDefence: ["combat maid/butler outfit", "astral guard"].includes(cleanName.toLowerCase()) ? 3 : 0
      };
    };

    // First handle genuine HTML tables. This also supports a reverse proxy
    // returning the original Wikidot page rather than reader Markdown.
    if (/<table[\s>]/i.test(source) && typeof DOMParser !== "undefined") {
      try {
        const document = new DOMParser().parseFromString(source, "text/html");
        for (const element of document.querySelectorAll("table")) {
          const rows = [...element.querySelectorAll("tr")].map(row =>
            [...row.querySelectorAll("th,td")].map(cell => stripMarkdown(cell.textContent))
          ).filter(row => row.length);
          if (!rows.length) continue;

          let headerAt = rows.findIndex(row => {
            const joined = row.join(" ").toLowerCase();
            return /\bname\b/.test(joined) && /\bevasion\b/.test(joined) && /\bdefen[cs]e\b/.test(joined) && /\b(?:min(?:imum)?\s*)?str(?:ength)?\b/.test(joined);
          });
          if (headerAt < 0) continue;
          const headers = rows[headerAt].map(value => value.toLowerCase().replace(/minimum/g, "min").replace(/strength/g, "str").replace(/[^a-z0-9]+/g, " ").trim());
          const indexOf = pattern => headers.findIndex(value => pattern.test(value));
          const nameIndex = indexOf(/^(?:item )?name$/);
          const minIndex = indexOf(/min.*str|required.*str/);
          const evasionIndex = indexOf(/evasion|^eva$/);
          const defenceIndex = indexOf(/defen[cs]e|^def$/);
          const notesIndex = indexOf(/notes?|remarks?|special/);
          if ([nameIndex, minIndex, evasionIndex, defenceIndex].some(index => index < 0)) continue;

          const heading = (() => {
            let node = element.previousElementSibling;
            while (node) {
              if (/^H[1-6]$/.test(node.tagName)) return stripMarkdown(node.textContent);
              node = node.previousElementSibling;
            }
            return `Defensive Gear Table ${tables.length + 1}`;
          })();
          const table = { name: heading, items: [] };
          for (const rawRow of rows.slice(headerAt + 1)) {
            const row = [...rawRow];
            while (row.length > headers.length && !row[0]) row.shift();
            while (row.length > headers.length && !row[row.length - 1]) row.pop();
            while (row.length > headers.length) {
              const emptyAt = row.findIndex(cell => !cell);
              if (emptyAt < 0) break;
              row.splice(emptyAt, 1);
            }
            if (!row[nameIndex] || !/\d/.test(row[minIndex] || "")) continue;
            table.items.push(makeItem(row[nameIndex], row[minIndex], row[evasionIndex], row[defenceIndex], notesIndex >= 0 ? row[notesIndex] : ""));
          }
          if (table.items.length) tables.push(table);
        }
      } catch (error) {
        console.warn("Sword World 2.5 | HTML armour parsing failed", error);
      }
    }

    const rawLines = source.split("\n");
    const splitRow = line => {
      let value = String(line ?? "").trim();
      if (!value.includes("|")) return [];
      if (value.startsWith("|")) value = value.slice(1);
      if (value.endsWith("|")) value = value.slice(0, -1);
      return value.split("|").map(cell => {
        const cleaned = stripMarkdown(cell);
        return /magicicon\.png/i.test(cleaned) ? "" : cleaned;
      });
    };
    // Wikidot inserts a decorative magic-item icon as its own table cell.
    // After the icon markup is removed, those rows contain an extra empty cell,
    // shifting Name/STR/Evasion/Defense one column to the right. Normalise each
    // data row back to the header width before reading indexed columns.
    const alignRowToHeaders = (cells, headerCount) => {
      const aligned = [...cells];
      while (aligned.length > headerCount && !aligned[0]) aligned.shift();
      while (aligned.length > headerCount && !aligned[aligned.length - 1]) aligned.pop();
      // Some reader variants preserve the icon cell in the middle immediately
      // before the item name. Remove empty surplus cells, left to right.
      while (aligned.length > headerCount) {
        const emptyAt = aligned.findIndex(cell => !cell);
        if (emptyAt < 0) break;
        aligned.splice(emptyAt, 1);
      }
      return aligned;
    };

    const isSeparator = cells => cells.length >= 3 && cells.every(cell => !cell || /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
    const normalizeHeader = value => stripMarkdown(value).toLowerCase().replace(/minimum/g, "min").replace(/strength/g, "str").replace(/[^a-z0-9]+/g, " ").trim();
    const findColumn = (headers, patterns) => headers.findIndex(header => patterns.some(pattern => pattern.test(header)));
    const nearestHeading = index => {
      for (let i = index - 1; i >= 0 && i >= index - 24; i--) {
        const line = rawLines[i].trim();
        if (!line) continue;
        const cleaned = stripMarkdown(line);
        if (/^(?:SS|S|A|B)[- ]?Rank\b.*(?:Armou?r|Shields?)/i.test(cleaned)) return cleaned;
        const heading = line.match(/^#{1,6}\s*(.+?)\s*#*$/);
        if (heading) return stripMarkdown(heading[1]);
      }
      return `Defensive Gear Table ${tables.length + 1}`;
    };

    // Standard Markdown pipe tables.
    for (let i = 0; i < rawLines.length; i++) {
      const headerCells = splitRow(rawLines[i]);
      if (headerCells.length < 4) continue;
      const headers = headerCells.map(normalizeHeader);
      const nameIndex = findColumn(headers, [/^name$/, /item name/, /^item$/]);
      const minIndex = findColumn(headers, [/^min str$/, /^required str$/, /min.*str/]);
      const evasionIndex = findColumn(headers, [/^evasion$/, /evasion modifier/, /^eva$/]);
      const defenceIndex = findColumn(headers, [/^defen[cs]e$/, /physical defen[cs]e/, /^def$/]);
      if ([nameIndex, minIndex, evasionIndex, defenceIndex].some(index => index < 0)) continue;
      let rowStart = i + 1;
      if (isSeparator(splitRow(rawLines[rowStart]))) rowStart++;
      const notesIndex = findColumn(headers, [/^notes?$/, /^remarks?$/, /^special$/]);
      const table = { name: nearestHeading(i), items: [] };
      for (let rowIndex = rowStart; rowIndex < rawLines.length; rowIndex++) {
        const line = rawLines[rowIndex];
        if (!line.trim() || /^#{1,6}\s+/.test(line.trim())) break;
        const rawCells = splitRow(line);
        if (rawCells.length < 4 || isSeparator(rawCells)) break;
        const cells = alignRowToHeaders(rawCells, headers.length);
        if (!cells[nameIndex] || !/\d/.test(cells[minIndex] || "")) continue;
        table.items.push(makeItem(cells[nameIndex], cells[minIndex], cells[evasionIndex], cells[defenceIndex], notesIndex >= 0 ? cells[notesIndex] : ""));
      }
      if (table.items.length) tables.push(table);
    }

    // Reader/plain-text format. Parse each rank section independently and
    // join wrapped lines until the numeric columns become recognizable.
    const plain = source
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ");
    const headingPattern = /^(?:#{1,6}\s*)?((?:SS|S|A|B)[-–— ]?Rank\s+(?:(?:Nonmetallic|Metal)\s+Armou?r|Shields?))\s*#*\s*$/gmi;
    const headings = [...plain.matchAll(headingPattern)];
    // Armour rows are: Name, Min STR, Evasion, Defense, Price/Notes.
    // Shield rows add a Stance column between Name and Min STR, commonly "1H".
    // Capture that column optionally so flattened Wikidot/Jina shield tables are
    // parsed using the same defensive-gear pipeline as armour tables.
    const rowPattern = /^(.+?)\s+(?:(1H|2H|1H#|1H投|1H両)\s+)?(\d+)\s+([+＋]?\d+|[-−–—]|-\d+)\s+(\d+(?:\/\d+)?)\s+([\d,]+|[-−–—])(?:\s+(.+))?$/i;

    for (let h = 0; h < headings.length; h++) {
      const sectionStart = headings[h].index + headings[h][0].length;
      const sectionEnd = h + 1 < headings.length ? headings[h + 1].index : plain.length;
      const lines = plain.slice(sectionStart, sectionEnd).split("\n").map(line => stripMarkdown(line)).filter(Boolean);
      const table = { name: stripMarkdown(headings[h][1]), items: [] };
      let pendingNotes = [];

      for (let i = 0; i < lines.length;) {
        const line = lines[i];
        if (
          /magicicon\.png/i.test(line) ||
          /^(?:min\s*)?name\b|^name\b|^str\b|^(?:min|minimum)\s*str/i.test(line) ||
          /^(?:stance|evasion|defen[cs]e|price|notes?|accuracy|power|crit(?:ical)?(?: value)?|add(?:itional|'l)? dmg)\b/i.test(line) ||
          /^(?:shields? usable as weapons?|return to list)\b/i.test(line) ||
          /^(?:part\s+\d+|\d{2,4})$/i.test(line)
        ) { i++; continue; }

        let match = null;
        let consumed = 1;
        for (let take = 1; take <= 4 && i + take <= lines.length; take++) {
          const joined = lines.slice(i, i + take).join(" ").replace(/\s+/g, " ").trim();
          const candidate = joined.match(rowPattern);
          if (candidate) { match = candidate; consumed = take; break; }
        }

        if (match) {
          if (table.items.length && pendingNotes.length) {
            table.items[table.items.length - 1].notes = stripMarkdown(`${table.items[table.items.length - 1].notes} ${pendingNotes.join(" ")}`);
          }
          pendingNotes = [];
          table.items.push(makeItem(match[1], match[3], match[4], match[5], match[7] || ""));
          i += consumed;
        } else {
          // Descriptive text after the actual table is not attached unless at
          // least one row has already been found and it looks like a wrap.
          if (table.items.length && !/^[A-Z][^:]{1,80}:/.test(line)) pendingNotes.push(line);
          i++;
        }
      }
      if (table.items.length && pendingNotes.length) {
        table.items[table.items.length - 1].notes = stripMarkdown(`${table.items[table.items.length - 1].notes} ${pendingNotes.join(" ")}`);
      }
      if (table.items.length) tables.push(table);
    }


    // The Wikidot reader flattens shield rows into ordinary text. There
    // are two compact forms:
    //
    //   Buckler 1H 1+1 0 60
    //     STR 1, Evasion +1, Defense 0, Price 60
    //
    //   Round Shield 1H 8-1 100
    //     STR 8, Evasion "-", Defense 1, Price 100
    //
    // Plus modifiers are followed by a space before Defense. A dash means no
    // Evasion modifier and is fused directly to the Defense value.
    const compactShieldTables = [];
    const compactRankPattern = /^###\s+((?:SS|S|A|B)-Rank Shields?)\s*$/gmi;
    const compactRankHeadings = [...source.matchAll(compactRankPattern)];

    const plusShieldRowPattern =
      /^(.*?)\s+(1H|2H|1H#|1H投|1H両)\s+(\d+)(\+\d+)\s+(\d+(?:\/\d+)?)\s+([\d,]+)(?:\s+(.+))?$/i;
    const dashShieldRowPattern =
      /^(.*?)\s+(1H|2H|1H#|1H投|1H両)\s+(\d+)-(\d+(?:\/\d+)?)\s+([\d,]+)(?:\s+(.+))?$/i;

    const parseCompactShieldRow = rawLine => {
      const line = stripMarkdown(rawLine).trim();
      if (
        !line ||
        /^Name\s+Stance\s+Min STR\s+Evasion\s+Defense\s+Price\s+Notes$/i.test(line) ||
        /^Name\s+Stance\s+Min STR\s+Acc\.Power/i.test(line) ||
        /^\*\*/.test(rawLine) ||
        /^#{1,6}\s/.test(rawLine) ||
        /^\[\]/.test(rawLine) ||
        /^\*\s*\*\s*\*$/.test(rawLine)
      ) return null;

      const plus = line.match(plusShieldRowPattern);
      if (plus) {
        const name = plus[1].trim();
        if (!name || /(?:swordicon|hammericon|magicicon)\.png/i.test(name)) return null;
        return makeItem(name, plus[3], plus[4], plus[5], (plus[7] || "").trim());
      }

      const dash = line.match(dashShieldRowPattern);
      if (dash) {
        const name = dash[1].trim();
        if (!name || /(?:swordicon|hammericon|magicicon)\.png/i.test(name)) return null;
        return makeItem(name, dash[3], "0", dash[4], (dash[6] || "").trim());
      }

      return null;
    };

    for (let h = 0; h < compactRankHeadings.length; h++) {
      const start = compactRankHeadings[h].index + compactRankHeadings[h][0].length;
      const end = h + 1 < compactRankHeadings.length
        ? compactRankHeadings[h + 1].index
        : source.length;
      const section = source.slice(start, end);
      const table = {
        name: stripMarkdown(compactRankHeadings[h][1]),
        items: []
      };

      for (const rawLine of section.split("\n")) {
        if (/^\*\*[^*]+:\*\*/.test(rawLine.trim())) break;
        if (/^Name\s+Stance\s+Min STR\s+Acc\.Power/i.test(stripMarkdown(rawLine))) break;

        const item = parseCompactShieldRow(rawLine);
        if (item) table.items.push(item);
      }

      const byName = new Map();
      for (const item of table.items) byName.set(item.name.toLowerCase(), item);
      table.items = [...byName.values()];
      if (table.items.length) compactShieldTables.push(table);
    }

    // Some reader responses collapse each rank into prose, with comma- or
    // semicolon-separated cells and the heading on the same line as the first
    // row. Parse that representation before the token-stream fallback.
    const delimitedShieldTables = [];
    const inlineShieldHeadingPattern = /((?:SS|S|A|B)[-–— ]?Rank\s+Shields?)\b/gi;
    const inlineShieldHeadings = [...source.matchAll(inlineShieldHeadingPattern)];
    const delimitedRowPattern = /(?:^|[;\n|])\s*(?:magicicon\.png\s*)?([^;\n|,]{2,80}?)\s*[,|]\s*(1H|2H|1H#|1H投|1H両)\s*[,|]\s*(\d+(?:\/\d+)?)\s*[,|]\s*([+＋]?\d+|[-−–—]|-\d+)\s*[,|]\s*(\d+(?:\/\d+)?)\s*[,|]\s*([\d,]+|[-−–—])(?:\s*[,|]\s*([^;\n|]+))?/gi;

    for (let h = 0; h < inlineShieldHeadings.length; h++) {
      const start = inlineShieldHeadings[h].index + inlineShieldHeadings[h][0].length;
      const end = h + 1 < inlineShieldHeadings.length ? inlineShieldHeadings[h + 1].index : source.length;
      const section = source.slice(start, end);
      const table = { name: stripMarkdown(inlineShieldHeadings[h][1]), items: [] };

      for (const match of section.matchAll(delimitedRowPattern)) {
        const name = stripMarkdown(match[1])
          .replace(/^(?:name|notes?|price|defen[cs]e|evasion|min(?:imum)?\s*str(?:ength)?|stance)\s*/i, "")
          .trim();
        if (!name || /magicicon\.png/i.test(name)) continue;
        table.items.push(makeItem(name, match[3], match[4], match[5], match[7] || ""));
      }

      const byName = new Map();
      for (const item of table.items) byName.set(item.name.toLowerCase(), item);
      table.items = [...byName.values()];
      if (table.items.length) delimitedShieldTables.push(table);
    }

    // Jina/Wikidot sometimes flattens a table into one cell per line instead
    // of returning either HTML or a Markdown pipe table. Rebuild shield rows
    // around the distinctive Stance cell. A valid row is:
    // Name | 1H/2H | Min STR | Evasion | Defense | Price | Notes.
    const flattenedShieldTables = [];
    const shieldHeadingPattern = /(?:^|\n|\s)(?:#{1,6}\s*)?((?:SS|S|A|B)[-–— ]?Rank\s+Shields?)\b/gi;
    const shieldHeadings = [...source.matchAll(shieldHeadingPattern)];
    const stancePattern = /^(?:1H|2H|1H#|1H投|1H両)$/i;
    const integerPattern = /^\d+$/;
    const modifierPattern = /^(?:[+＋]?\d+|[-−–—]|-\d+)$/;
    const defencePattern = /^\d+(?:\/\d+)?$/;
    const pricePattern = /^(?:[\d,]+|[-−–—])$/;
    const ignoredToken = token =>
      !token ||
      /magicicon\.png/i.test(token) ||
      /^:?-{3,}:?$/.test(token.replace(/\s/g, "")) ||
      /^(?:name|stance|min(?:imum)? str(?:ength)?|evasion|defen[cs]e|price|notes?)$/i.test(token) ||
      /^(?:return to list|shields? usable as weapons?)$/i.test(token);

    for (let h = 0; h < shieldHeadings.length; h++) {
      const headingOffset = shieldHeadings[h][0].lastIndexOf(shieldHeadings[h][1]);
      const start = shieldHeadings[h].index + headingOffset + shieldHeadings[h][1].length;
      const end = h + 1 < shieldHeadings.length ? shieldHeadings[h + 1].index : source.length;
      const section = source.slice(start, end);
      const tokens = [];

      for (const rawLine of section.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const cells = line.includes("|") ? splitRow(line) : [stripMarkdown(line)];
        for (const cell of cells) {
          const token = stripMarkdown(cell);
          if (!ignoredToken(token)) tokens.push(token);
        }
      }

      const table = { name: stripMarkdown(shieldHeadings[h][1]), items: [] };
      const usedStances = new Set();
      for (let i = 1; i < tokens.length - 4; i++) {
        if (!stancePattern.test(tokens[i]) || usedStances.has(i)) continue;

        const name = tokens[i - 1];
        const minStrength = tokens[i + 1];
        const evasion = tokens[i + 2];
        const defence = tokens[i + 3];
        const price = tokens[i + 4];
        if (!name || stancePattern.test(name)) continue;
        if (!integerPattern.test(minStrength)) continue;
        if (!modifierPattern.test(evasion)) continue;
        if (!defencePattern.test(defence)) continue;
        if (!pricePattern.test(price)) continue;

        // Notes continue until the next token immediately followed by a stance.
        const notes = [];
        for (let n = i + 5; n < tokens.length; n++) {
          if (n + 1 < tokens.length && stancePattern.test(tokens[n + 1])) break;
          if (/^(?:SS|S|A|B)[-–— ]?Rank\s+Shields?$/i.test(tokens[n])) break;
          notes.push(tokens[n]);
        }

        table.items.push(makeItem(name, minStrength, evasion, defence, notes.join(" ")));
        usedStances.add(i);
      }

      // Keep the most complete version of each item name.
      const byItemName = new Map();
      for (const item of table.items) byItemName.set(item.name.toLowerCase(), item);
      table.items = [...byItemName.values()];
      if (table.items.length) flattenedShieldTables.push(table);
    }

    // Add the reconstructed tables last. The rank merge below will prefer the
    // version containing the greatest number of entries.
    tables.push(...compactShieldTables, ...delimitedShieldTables, ...flattenedShieldTables);

    // Merge duplicate rank tables by name and retain the most complete parse.
    const bestTableByName = new Map();
    for (const table of tables.filter(table => table.items?.length)) {
      const key = String(table.name).toLowerCase();
      const existing = bestTableByName.get(key);
      if (!existing || table.items.length > existing.items.length) bestTableByName.set(key, table);
    }
    tables.length = 0;
    tables.push(...bestTableByName.values());

    const unique = [];
    const seen = new Set();
    for (const table of tables.filter(table => table.items.length)) {
      table.items = table.items.filter(item =>
        item?.name &&
        !/magicicon\.png/i.test(item.name) &&
        !/^magic(?:\s+item)?\s*icon$/i.test(item.name.trim())
      );
      if (!table.items.length) continue;
      const key = `${table.name.toLowerCase()}|${table.items.map(item => item.name.toLowerCase()).join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(table);
    }

    const expectedShieldCounts = {
      "b-rank shields": 10,
      "a-rank shields": 11,
      "s-rank shields": 6,
      "ss-rank shields": 4
    };

    const shieldTables = unique.filter(table => /(?:^|\s)(?:SS|S|A|B)[-–— ]?Rank Shields?$/i.test(table.name));
    if (shieldTables.length) {
      console.info(
        "Sword World 2.5 | Shield rank counts",
        Object.fromEntries(shieldTables.map(table => [table.name, table.items.length]))
      );
    }
    for (const table of unique) {
      const expected = expectedShieldCounts[table.name.toLowerCase()];
      if (expected && table.items.length !== expected) {
        console.warn(
          `Sword World 2.5 | ${table.name}: parsed ${table.items.length}, expected ${expected}.`,
          table.items
        );
      }
    }

    console.debug("Sword World 2.5 | Defensive gear source preview", source.slice(0, 1200));
    console.debug("Sword World 2.5 | Defensive gear tables detected", unique);
    return unique;
  }

  static armourFallbackTables(sourceUrl = "") {
    const slug = decodeURIComponent(new URL(sourceUrl).pathname.replace(/^\//, ""));

    const make = (name, minStrength, evasion, defence, notes = "") => ({
      name, minStrength, evasion, defence, notes,
      magicalDefence: ["combat maid/butler outfit", "astral guard"].includes(name.toLowerCase()) ? 3 : 0
    });

    if (slug === "items:metal-armor") return [
      { name: "B-Rank Metal Armor", items: [
        make("Splint Armor", 15, 0, 5),
        make("Chainmail", 18, -1, 6),
        make("Plate Armor", 21, -2, 7),
        make("Suit Armor", 24, -3, 8, "Cannot make Full Move. Dexterity -6"),
        make("Balzer's Magic Armor", 16, 0, 6, "It stores mana when the wielder is hit by the sword and recovers HP to 1 Character when it is released."),
        make("Dontrecia's Armor of Perseverance", 20, 0, 6, "Defense +2 for each physical damage.")
      ]},
      { name: "A-Rank Metal Armor", items: [
        make("Steel Guard", 12, 0, 5),
        make("Lamellar Armor", 15, 0, 6),
        make("Brigandine", 18, -1, 7),
        make("Coat of Plates", 24, -2, 8),
        make("Fortress", 27, -2, 9),
        make("Dontrecia’s Great Armor of Perseverance", 21, 0, 8, "Defense +2 for each physical damage.")
      ]},
      { name: "S-Rank Metal Armor", items: [
        make("Mithril Chain", 10, 0, 7, "Silvered"),
        make("Full-Metal Armor", 17, -1, 9),
        make("Mithril Plate", 24, -2, 11, "Silvered"),
        make("Powered Plates", 14, 0, 8, "Evasion check +1 after the fact by consuming 3 MP."),
        make("Dontrecia’s Stiff Armor of Perseverance", 22, 0, 10, "Defense +2 for each physical damage.")
      ]},
      { name: "SS-Rank Metal Armor", items: [
        make("Manatite Frame", 18, 0, 11),
        make("Anti-Arquebus", 23, 0, 12, "Gun damage reduced by -5."),
        make("Imperial", 30, -1, 14, "Magic damage -3.")
      ]}
    ];

    if (slug === "items:nonmetallic-armor") return [
      { name: "B-Rank Nonmetallic Armor", items: [
        make("Cloth Armor", 1, 0, 2, "Martial Artists may equip."),
        make("Point Guard", 1, 1, 0, "Martial Artist only."),
        make("Soft Leather", 7, 0, 3),
        make("Hard Leather", 13, 0, 4),
        make("Mana Coat", 1, 0, 0, "Defense is the Intelligence modifier of the wearer. Upper limit 6."),
        make("Mana Coat+", 1, 0, 0, "Defense is the Intelligence modifier of the wearer. Upper limit 8."),
        make("Mimore's Cloth Armor", 2, 0, 2, "Martial Artists may equip. Evasion check +2 when not holding anything in both hands."),
        make("Robe of Thorns", 2, 0, 2, "Deals 2d magic damage to anything approaching."),
        make("Combat Maid/Butler Outfit", 10, 1, 0, "Martial Artists may equip. Magic Damage -3.")
      ]},
      { name: "A-Rank Nonmetallic Armor", items: [
        make("Aramid Coat", 5, 1, 2, "Martial Artists may equip."),
        make("Breast Armor", 10, 0, 5),
        make("Bone Vest", 16, 0, 6),
        make("Mimore's Fine Cloth Armor", 6, 1, 2, "Martial Artists may equip. Evasion check +2 when not holding anything in both hands."),
        make("Windbreaker Surcoat", 12, 1, 3, "Can avoid wind-type damage once a day.")
      ]},
      { name: "S-Rank Nonmetallic Armor", items: [
        make("Fine Leather", 6, 1, 4),
        make("Lynx Vest", 8, 2, 3, "Martial Artist only."),
        make("Tiger Band", 10, 1, 5),
        make("Dragon Scale", 14, 1, 6),
        make("Mimore's Finest Cloth Armor", 6, 2, 2, "Martial Artists may equip. Evasion check +2 when not holding anything in both hands.")
      ]},
      { name: "SS-Rank Nonmetallic Armor", items: [
        make("Astral Guard", 6, 1, 7, "Magic Damage -3."),
        make("Silent Cloak", 11, 1, 8, "Hide checks +2."),
        make("Alabaster Shell", 14, 1, 9),
        make("Phoenix Cloak", 17, 2, 8, "Martial Artist only."),
        make("Divine Skin", 18, 1, 10, "Willpower +2.")
      ]}
    ];

    return [];
  }

  static async chooseArmourTable(tables, actor, sourceUrl) {
    const fallback = this.armourFallbackTables(sourceUrl);
    const parsed = Array.isArray(tables) ? tables.filter(table => Array.isArray(table.items) && table.items.length) : [];
    const byName = new Map(parsed.map(table => [String(table.name).toLowerCase(), table]));
    // The Wikidot reader frequently flattens wrapped rows into the wrong table.
    // For the two official armour index pages, the verified catalogue is
    // authoritative for each matching rank while live parsing remains available
    // for any additional tables on the page.
    for (const table of fallback) byName.set(table.name.toLowerCase(), table);
    tables = [...byName.values()];
    if (!tables.length) throw new Error("No armour or shield tables were found on this page.");
    const tableOptions=tables.map((t,i)=>`<option value="${i}">${t.name} (${t.items.length})</option>`).join("");
    const content=`<form><div class="form-group"><label>Armour Table</label><select name="table">${tableOptions}</select></div></form>`;
    const tableIndex=await new Promise(resolve=>new Dialog({title:"Choose Armour Table",content,buttons:{next:{label:"Next",callback:h=>resolve(Number(h.find('[name=table]').val()))},cancel:{label:"Cancel",callback:()=>resolve(null)}},default:"next",close:()=>resolve(null)}).render(true));
    if (tableIndex===null) return {name:"Armour import cancelled"};
    const table=tables[tableIndex];
    if (!table?.items?.length) throw new Error(`No armour or shield entries were found in ${table?.name || "the selected table"}.`);
    const rows=table.items.map((item,i)=>`<option value="${i}">${item.name} — Min STR ${item.minStrength}, Evasion ${item.evasion}, Defense ${item.defence}</option>`).join("");
    const chosen=await new Promise(resolve=>new Dialog({title:table.name,content:`<form><div class="form-group"><label>Armour</label><select name="item">${rows}</select></div></form>`,buttons:{import:{label:"Import",callback:h=>resolve(Number(h.find('[name=item]').val()))},cancel:{label:"Cancel",callback:()=>resolve(null)}},default:"import",close:()=>resolve(null)}).render(true));
    if (chosen===null) return {name:"Armour import cancelled"};
    const item=table.items[chosen];
    const [created]=await actor.createEmbeddedDocuments("Item",[{name:item.name,type:"armour",system:{minStrength:item.minStrength,evasion:item.evasion,defence:item.defence,magicalDefence:item.magicalDefence,notes:item.notes,description:item.notes,equipped:true,sourceUrl}}]);
    actor.sheet?.render(false); return created;
  }

  static clean(text = "") {
    return String(text)
      .replace(/\u00a0/g, " ")
      .replace(/\bGrapplers\b/gi, "Martial Artists")
      .replace(/\bGrappler\b/gi, "Martial Artist")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  static raceNameFromUrl(url) {
    const slug = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    const raw = slug.split(":").slice(1).join(":") || slug;
    return raw
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase())
      .trim();
  }

  static chooseRaceName(candidates, url) {
    const fallback = this.raceNameFromUrl(url);
    const target = fallback.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleaned = candidates
      .map(candidate => this.clean(candidate))
      .filter(candidate => candidate && !/sword world 2\.5 reference wiki/i.test(candidate));
    const matching = cleaned.find(candidate =>
      candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === target
    );
    return matching || fallback || cleaned[0] || "Imported Race";
  }


  static classNameFromUrl(url) {
    const slug = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    const raw = slug.split(":").slice(1).join(":") || slug;
    return raw
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase())
      .trim();
  }

  static chooseClassName(candidates, url) {
    const fallback = this.classNameFromUrl(url);
    const target = fallback.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleaned = candidates
      .map(candidate => this.clean(candidate).replace(/\s*\((?:Major|Minor)\)\s*$/i, ""))
      .filter(candidate => candidate && !/sword world 2\.5 reference wiki/i.test(candidate));
    const matching = cleaned.find(candidate =>
      candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === target
    );
    return matching || fallback || cleaned[0] || "Imported Class";
  }

  static parseClassCategory(text = "", title = "") {
    if (/\bminor class\b|\(minor\)/i.test(`${title}\n${text}`)) return "B";
    if (/\bmajor class\b|\(major\)/i.test(`${title}\n${text}`)) return "A";
    return this.classCategory(title);
  }

  static classField(text = "", labelPattern) {
    const lines = String(text).split("\n").map(line => this.clean(line)).filter(Boolean);
    const pattern = new RegExp(`^${labelPattern}\\s*:\s*(.+)$`, "i");
    const line = lines.find(value => pattern.test(value));
    return line ? this.clean(line.match(pattern)?.[1] || "") : "";
  }

  static classDescriptionFromText(text = "") {
    const lines = String(text).split("\n").map(line => this.clean(line)).filter(Boolean);
    const ignored = /^(?:this is sw2\.0 content|major class|minor class|(?:warrior|wizard|other|adventurer)-type class|weapon restrictions?|armor restrictions?|armour restrictions?|shield restrictions?|class features?|skill packages?)\b/i;
    const paragraphs = [];
    for (const line of lines) {
      if (ignored.test(line)) {
        if (paragraphs.length) break;
        continue;
      }
      if (/^(?:source|return to list|table of contents)\b/i.test(line)) continue;
      paragraphs.push(line);
      if (paragraphs.join(" ").length > 1200) break;
    }
    return this.clean(paragraphs.join("\n"));
  }

  static classType(name, fallback = "") {
    const key = this.clean(name).toLowerCase();
    const warriors = new Set(["battle dancer","fencer","fighter","martial artist","grappler","marksman"]);
    const wizards = new Set(["abyss gaer","artificer","bibliomancer","conjurer","daemonologist","druid","fairy tamer","priest","sorcerer"]);
    const others = new Set(["alchemist","bard","dark hunter","enhancer","geomancer","heritor","ranger","rider","sage","scout","tactician"]);
    if (warriors.has(key)) return "Warrior";
    if (wizards.has(key)) return "Wizard";
    if (others.has(key)) return "Other";
    return this.clean(fallback).replace(/-type Class/i, "").trim() || "Other";
  }

  static parseClassHtml(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const content = doc.querySelector("#page-content") ?? doc.querySelector(".page-content") ?? doc.body;
    content.querySelectorAll("script,style,.printuser,.page-tags").forEach(element => element.remove());
    const headings = [...content.querySelectorAll("h1,h2,h3")].map(heading => heading.textContent);
    const titleCandidates = [
      ...headings,
      doc.querySelector("#page-title")?.textContent,
      doc.querySelector("meta[property='og:title']")?.content,
      doc.title
    ];
    const name = this.chooseClassName(titleCandidates, url);
    const text = this.clean(content.innerText || content.textContent || "");
    const titleText = titleCandidates.map(value => this.clean(value || "")).join("\n");
    return {
      name,
      sourceUrl: url,
      category: this.parseClassCategory(text, titleText),
      classType: this.classType(name, this.matchLine(text, /((?:Warrior|Wizard|Other|Adventurer)-type Class)/i)),
      description: this.classDescriptionFromText(text),
      weaponRestrictions: this.classField(text, "Weapon Restrictions?"),
      armourRestrictions: this.classField(text, "(?:Armor|Armour) Restrictions?"),
      shieldRestrictions: this.classField(text, "Shield Restrictions?"),
      classFeatures: this.classField(text, "Class Features?"),
      skillPackages: this.classField(text, "Skill Packages?"),
      rawText: text
    };
  }

  static parseClassMarkdown(md, url) {
    const plain = String(md)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "");
    const text = this.clean(plain);
    const headings = [...String(md).matchAll(/^#{1,4}\s+(.+?)\s*$/gm)].map(match => match[1]);
    const name = this.chooseClassName(headings, url);
    return {
      name,
      sourceUrl: url,
      category: this.parseClassCategory(text, headings.join("\n")),
      classType: this.classType(name, this.matchLine(text, /((?:Warrior|Wizard|Other|Adventurer)-type Class)/i)),
      description: this.classDescriptionFromText(text),
      weaponRestrictions: this.classField(text, "Weapon Restrictions?"),
      armourRestrictions: this.classField(text, "(?:Armor|Armour) Restrictions?"),
      shieldRestrictions: this.classField(text, "Shield Restrictions?"),
      classFeatures: this.classField(text, "Class Features?"),
      skillPackages: this.classField(text, "Skill Packages?"),
      rawText: text
    };
  }

  static async createClass(parsed, actor) {
    const importedName = this.preferredClassName(parsed.name || "Imported Class");
    const system = {
      category: parsed.category || "A",
      sourceUrl: parsed.sourceUrl || "",
      classType: parsed.classType || "",
      description: parsed.description || "",
      weaponRestrictions: parsed.weaponRestrictions || "",
      armourRestrictions: parsed.armourRestrictions || "",
      shieldRestrictions: parsed.shieldRestrictions || "",
      classFeatures: parsed.classFeatures || "",
      skillPackages: parsed.skillPackages || "",
      rawText: parsed.rawText || ""
    };

    if (!actor) {
      return Item.create({ name: importedName, type: "class", system: { ...system, level: 1 } });
    }

    const key = value => {
      const normalized = this.clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
      return normalized === "grappler" ? "martialartist" : normalized;
    };
    const existing = actor.items.find(item => item.type === "class" && key(item.name) === key(importedName));
    let item;
    if (existing) {
      await existing.update({
        name: importedName,
        ...Object.fromEntries(Object.entries(system).map(([field, value]) => [`system.${field}`, value]))
      });
      item = existing;
      ui.notifications.info(`${importedName} was updated with imported class details.`);
    } else {
      [item] = await actor.createEmbeddedDocuments("Item", [{
        name: importedName,
        type: "class",
        system: { ...system, level: 1 }
      }]);
    }

    actor.sheet?.render(false);
    return item;
  }


  static featFallbackName(url = "") {
    try {
      const slug = decodeURIComponent(new URL(url).pathname.split("/").pop() || "")
        .replace(/^feat:/i, "")
        .replace(/[-_]+/g, " ");
      return slug.replace(/\b\w/g, letter => letter.toUpperCase()) || "Imported Combat Feat";
    } catch {
      return "Imported Combat Feat";
    }
  }

  static featField(text = "", label = "") {
    const source = String(text ?? "").replace(/\r/g, "");
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, "im"),
      new RegExp(`^\\s*\\*\\*${escaped}\\s*:\\*\\*\\s*(.+?)\\s*$`, "im"),
      new RegExp(`^\\s*${escaped}\\s*\\n+\\s*(.+?)\\s*$`, "im")
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) return this.clean(match[1]);
    }
    return "";
  }

  static featSummary(text = "") {
    const direct = this.featField(text, "Summary");
    if (direct) return direct;

    const source = String(text ?? "").replace(/\r/g, "");
    const fieldBlock = source.match(
      /(?:^|\n)\s*(?:\*\*)?Summary\s*:\s*(?:\*\*)?\s*([\s\S]*?)(?=\n\s*(?:\*\*)?(?:Prerequisite|Use|Type|Page|Source)\s*:|\n#{1,6}\s|\n{2,}|$)/i
    );
    return this.clean(fieldBlock?.[1] || "");
  }

  static featDescription(text = "") {
    const source = String(text ?? "")
      .replace(/\r/g, "")
      .replace(/^.*system:page-tags\/tag\/.*$/gmi, "Page Tags")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/^Title:\s*.*$/gmi, "")
      .replace(/^URL Source:\s*.*$/gmi, "")
      .replace(/^Markdown Content:\s*$/gmi, "")
      .replace(/[`*_~]/g, "");
    const lines = source.split("\n").map(line => line.trim());
    const fieldPattern = /^(?:Prerequisite|Use|Application|Risk|Summary|Type)\s*:/i;
    const fieldIndexes = lines.map((line, index) => fieldPattern.test(line) ? index : -1).filter(index => index >= 0);
    const start = fieldIndexes.length ? Math.max(...fieldIndexes) + 1 : 0;
    const description = [];
    for (const line of lines.slice(start)) {
      if (/^(?:Source|Page Tags|Site Navigation|Create a Page|Powered by|Unless otherwise stated)\s*:?/i.test(line)) break;
      if (/^Help\s*\|\s*Terms of Service\s*\|\s*Privacy\s*\|/i.test(line)) break;
      if (/^(?:feat|vfeat)(?:feat|[-\w])+$/i.test(line) && !/\s/.test(line)) break;
      if (/^#{1,6}\s+/.test(line) || /^-{3,}$/.test(line)) continue;
      description.push(line);
    }
    return this.clean(description.join("\n"));
  }

  static parseFeatMarkdown(markdown = "", url = "") {
    const raw = String(markdown ?? "").replace(/\r/g, "");
    const markdownTitle = [...raw.matchAll(/^#{1,3}\s+(.+?)\s*$/gm)]
      .map(match => this.clean(
        match[1]
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      ))
      .find(title =>
        title &&
        !/^(?:Home|Combat Feats?|Prerequisite|Use|Summary|Create a Page|Site Navigation)$/i.test(title) &&
        !/Sword World 2\.5 Reference Wiki/i.test(title)
      );

    const titleLine = this.clean(raw.match(/^Title:\s*(.+?)\s*$/mi)?.[1] || "")
      .replace(/\s*-\s*Sword World.*$/i, "");

    const safeTitleLine = /Sword World 2\.5 Reference Wiki/i.test(titleLine) ? "" : titleLine;
    const name = markdownTitle || safeTitleLine || this.featFallbackName(url);
    const plain = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/^#{1,6}\s+/gm, "");

    return {
      name,
      prerequisite: this.featField(plain, "Prerequisite") || "None",
      use: this.featField(plain, "Use"),
      summary: this.featSummary(plain),
      description: this.featDescription(raw),
      sourceUrl: url,
      rawText: this.clean(plain)
      ,defenseModifier: defaultFeatureDefenseModifier(name)
    };
  }

  static parseFeatHtml(html = "", url = "") {
    if (typeof DOMParser === "undefined") {
      return this.parseFeatMarkdown(html, url);
    }

    const document = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const content =
      document.querySelector("#page-content") ||
      document.querySelector(".page-content") ||
      document.querySelector("main") ||
      document.body;

    const heading =
      content?.querySelector("h1, h2, h3") ||
      document.querySelector("h1, h2, h3");

    const name = this.clean(heading?.textContent || "") || this.featFallbackName(url);
    const text = content?.innerText || content?.textContent || "";

    return {
      name,
      prerequisite: this.featField(text, "Prerequisite") || "None",
      use: this.featField(text, "Use"),
      summary: this.featSummary(text),
      description: this.featDescription(text),
      sourceUrl: url,
      rawText: this.clean(text)
      ,defenseModifier: defaultFeatureDefenseModifier(name)
    };
  }

  static async createFeat(parsed, actor = null) {
    const system = {
      category: "combat",
      prerequisite: parsed.prerequisite || "None",
      use: parsed.use || "",
      summary: parsed.summary || "",
      description: parsed.description || parsed.summary || "",
      sourceUrl: parsed.sourceUrl || "",
      rawText: parsed.rawText || ""
      ,defenseModifier: Number(parsed.defenseModifier ?? defaultFeatureDefenseModifier(parsed.name)) || 0
    };

    if (!actor) {
      return Item.create({
        name: parsed.name || "Imported Combat Feat",
        type: "feat",
        system
      });
    }

    const key = value => this.clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const existing = actor.items.find(
      item => item.type === "feat" && key(item.name) === key(parsed.name)
    );

    let item;
    if (existing) {
      await existing.update({
        name: parsed.name,
        ...Object.fromEntries(
          Object.entries(system).map(([field, value]) => [`system.${field}`, value])
        )
      });
      item = existing;
      ui.notifications.info(`${parsed.name} was updated with imported feat details.`);
    } else {
      [item] = await actor.createEmbeddedDocuments("Item", [{
        name: parsed.name || "Imported Combat Feat",
        type: "feat",
        system
      }]);
    }

    actor.sheet?.render(false);
    return item;
  }


  static weaponCategoryFromUrl(url = "") {
    try {
      const slug = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
      return slug.replace(/^items:/i, "").replace(/[-_]+/g, " ").trim();
    } catch {
      return "";
    }
  }

  static cleanWeaponNotes(value = "") {
    const cleaned = this.clean(value)
      .replace(/\(\s*details?(?:\s+below)?\s*\)/ig, "")
      .replace(/\[\s*details?(?:\s+below)?\s*\]/ig, "")
      .replace(/\bdetails?(?:\s+below)?\b[.!]?/ig, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned;
  }

  static parseWeaponTables(input = "", url = "") {
    const source = String(input ?? "").replace(/\r/g, "");
    const category = this.weaponCategoryFromUrl(url);
    const records = [];

    const circled = {
      "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7,
      "⑧": 8, "⑨": 9, "⑩": 10, "⑪": 11, "⑫": 12
    };

    const cleanLine = value => this.clean(
      String(value ?? "")
        // Remove image Markdown completely, leaving the surrounding text joined
        // exactly as it appears in the reader output.
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[`*_~]/g, "")
        .replace(/\s+/g, " ")
    ).trim();

    const rankFromLine = value => {
      const match = cleanLine(value).match(
        /(?:^|\b)(SS|S|A|B)\s*(?:-|‐|–|—)?\s*Rank\s+(?:Swords?|Axes?|Staves|Wrestling|Weapons?)/i
      );
      if (match) return match[1].toUpperCase();
      const gunMatch = cleanLine(value).match(/(?:^|\b)(SS|S|A|B)\s*[- ]?\s*Rank\s+Guns?/i);
      return gunMatch ? gunMatch[1].toUpperCase() : "";
    };

    const stancePattern =
      "(1H(?:両|投|拳|#|\\*|†|‡)?|2H(?:片|#|\\*|†|‡)?|1H\\/2H|特殊)";

    // Captured reader format:
    // Knife1H*1-1 0 0 0 1 2 3 3 3 4 4 ⑩-30
    //
    // Name may be absent on continuation rows:
    // 2H 13-23 2 2 3 5 6 7 7 8 9 10 ⑩-
    //
    // Fields after stance:
    // Min STR | Accuracy | Power | ten table values | Crit | Add'l Dmg |
    // optional Price | optional Notes
    const compactPattern = new RegExp(
      "^(.*?)" + stancePattern +
      "\\s*(\\d+)" +                 // Minimum Strength
      "([+＋-]\\d+|-)" +             // Accuracy, '-' means zero
      "\\s*(\\d+)" +                 // Power
      "\\s+(-?\\d+)" +               // 3
      "\\s+(-?\\d+)" +               // 4
      "\\s+(-?\\d+)" +               // 5
      "\\s+(-?\\d+)" +               // 6
      "\\s+(-?\\d+)" +               // 7
      "\\s+(-?\\d+)" +               // 8
      "\\s+(-?\\d+)" +               // 9
      "\\s+(-?\\d+)" +               // 10
      "\\s+(-?\\d+)" +               // 11
      "\\s+(-?\\d+)" +               // 12
      "\\s+([③④⑤⑥⑦⑧⑨⑩⑪⑫]|\\d+)" + // Critical
      "(-|[+＋-]\\d+)" +              // Additional Damage
      "\\s*([\\d,]+(?:\\s*\\(Not for Sale\\))?)?" + // Price
      "\\s*(.*)$",
      "i"
    );

    // Gun tables omit Power and the 3-12 Power Table because those values are
    // supplied by ammunition. Retain their magazine and range statistics and
    // initialise the editable power table to zeroes.
    const gunPattern = new RegExp(
      "^(.*?)" + stancePattern +
      "\\s*(\\d+)" +
      "\\s*(\\d+)" +
      "\\s*([+ï¼‹-]\\d+|-)" +
      "\\s*([â‘¢â‘£â‘¤â‘¥â‘¦â‘§â‘¨â‘©â‘ªâ‘«]|\\d+)" +
      "\\s*([+ï¼‹-]\\d+|-)" +
      "\\s*(\\d+\\s*\\(\\s*\\d+\\s*m\\s*\\))" +
      "\\s*([\\d,]+(?:\\s*\\(Not for Sale\\))?)?" +
      "\\s*(.*)$",
      "i"
    );

    const blankPowerTable = () => Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [String(index + 3), "-"])
    );

    const criticalValue = token => {
      if (circled[token] !== undefined) return circled[token];
      const numeric = Number(token);
      if (Number.isFinite(numeric)) return numeric;
      const unicodeIndex = "③④⑤⑥⑦⑧⑨⑩⑪⑫".indexOf(String(token));
      if (unicodeIndex >= 0) return unicodeIndex + 3;
      const mojibakeSuffix = { "¢": 3, "£": 4, "¤": 5, "¥": 6, "¦": 7, "§": 8, "¨": 9, "©": 10, "ª": 11, "«": 12 };
      return mojibakeSuffix[String(token).slice(-1)] ?? 10;
    };

    // ASCII delimiters in the captured reader text are stable even when its
    // circled critical glyphs have been decoded more than once.
    const capturedGunPattern = new RegExp(
      "^(.*?)" + stancePattern +
      "\\s*(\\d+)\\s*(\\d+)\\s*([+-]\\d+|-)" +
      "\\s*(\\S+)\\s*([+-]\\d+|-)" +
      "\\s*(\\d+\\s*\\(\\s*\\d+\\s*m\\s*\\))" +
      "\\s*([\\d,]+)?\\s*(.*)$",
      "i"
    );

    let currentRank = "";
    let previousName = "";

    for (const rawLine of source.split("\n")) {
      const rank = rankFromLine(rawLine);
      if (rank) {
        currentRank = rank;
        previousName = "";
        continue;
      }

      const line = cleanLine(rawLine);
      if (
        !line ||
        /^Name\s+Stance\s+Min STR\s+(?:Acc\.Power|Max Magazine)/i.test(line) ||
        /^#{1,6}\s/.test(rawLine) ||
        /^\*\*[^*]+:\*\*/.test(rawLine.trim())
      ) continue;

      const gunMatch = line.match(capturedGunPattern) || line.match(gunPattern);
      if (gunMatch && /(?:^|\b)guns?(?:\b|$)/i.test(category || rawLine || "")) {
        const name = cleanLine(gunMatch[1]);
        if (!name) continue;
        previousName = name;
        const accuracyToken = gunMatch[5];
        const additionalToken = gunMatch[7];
        const price = String(gunMatch[9] || "").replace(/,/g, "").replace(/\s*\(Not for Sale\)\s*/i, "").trim();

        records.push({
          name,
          category: category || "guns",
          rank: currentRank,
          stance: gunMatch[2],
          usage: gunMatch[2],
          minStrength: Number(gunMatch[3]) || 0,
          maxMagazine: Number(gunMatch[4]) || 0,
          accuracy: accuracyToken === "-" ? 0 : Number(accuracyToken.replace("ï¼‹", "+")) || 0,
          power: 0,
          powerTable: blankPowerTable(),
          critical: criticalValue(gunMatch[6]),
          additionalDamage: additionalToken === "-" ? 0 : Number(additionalToken.replace("ï¼‹", "+")) || 0,
          range: gunMatch[8].replace(/\s+/g, ""),
          price: Number(price) || 0,
          notes: this.cleanWeaponNotes(String(gunMatch[10] || "").replace(/^â€»\s*/, "")),
          artificerPowered: true,
          sourceUrl: url
        });
        continue;
      }

      const match = line.match(compactPattern);
      if (!match) continue;

      const capturedName = cleanLine(match[1]);
      const name = capturedName || previousName;
      if (!name) continue;
      previousName = name;

      const stance = match[2];
      const minStrength = Number(match[3]) || 0;
      const accuracy = match[4] === "-" ? 0 : Number(match[4].replace("＋", "+")) || 0;
      const power = Number(match[5]) || 0;

      const powerTable = {};
      for (let result = 3; result <= 12; result++) {
        powerTable[String(result)] = Number(match[result + 3]) || 0;
      }

      const criticalToken = match[16];
      const critical = circled[criticalToken] ?? Number(criticalToken) ?? 10;
      const additionalToken = match[17];
      const additionalDamage =
        additionalToken === "-"
          ? 0
          : Number(additionalToken.replace("＋", "+")) || 0;

      const price = String(match[18] || "")
        .replace(/,/g, "")
        .replace(/\s*\(Not for Sale\)\s*/i, "")
        .trim();

      const notes = this.cleanWeaponNotes(
        String(match[19] || "")
          .replace(/^※\s*/, "")
          .replace(/^\(Not for Sale\)\s*/i, "")
      );

      records.push({
        name,
        category,
        rank: currentRank,
        stance,
        usage: stance,
        minStrength,
        accuracy,
        power,
        powerTable,
        critical,
        additionalDamage,
        price: Number(price) || 0,
        notes,
        artificerPowered: /(?:^|\b)guns?(?:\b|$)/i.test(category),
        sourceUrl: url
      });
    }

    const unique = new Map();
    for (const record of records) {
      const key =
        `${record.rank}|${record.name}|${record.stance}|${record.minStrength}`
          .toLowerCase();
      unique.set(key, record);
    }

    return [...unique.values()];
  }


  static async selectWeapons(parsed = [], category = "Weapons") {
    if (!parsed.length) return [];

    const grouped = new Map();
    for (const weapon of parsed) {
      const rank = weapon.rank || "Unranked";
      if (!grouped.has(rank)) grouped.set(rank, []);
      grouped.get(rank).push(weapon);
    }

    const order = ["B", "A", "S", "SS", "Unranked"];
    const ranks = [...grouped.keys()].sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });

    const rankOptions = ranks
      .map((rank, index) => `<option value="${index}">${foundry.utils.escapeHTML(rank)}-Rank (${grouped.get(rank).length})</option>`)
      .join("");
    const rankIndex = await new Promise(resolve => new Dialog({
      title: "Choose Weapon Rank",
      content: `<form><div class="form-group"><label>Weapon Rank</label><select name="rank">${rankOptions}</select></div></form>`,
      buttons: {
        next: { label: "Next", callback: html => resolve(Number(html.find('[name="rank"]').val())) },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "next",
      close: () => resolve(null)
    }).render(true));
    if (rankIndex === null) return [];

    const rank = ranks[rankIndex];
    const weaponGroups = this.groupWeaponStances(grouped.get(rank));
    const weaponOptions = weaponGroups.map((stances, index) => {
      const weapon = stances[0];
      const stanceList = stances.map(entry => entry.stance).filter(Boolean).join(" / ");
      const stance = stanceList ? ` (${stanceList})` : "";
      const label = `${weapon.name}${stance} — ${stances.length > 1 ? `${stances.length} stances` : `Min STR ${weapon.minStrength}, Accuracy ${weapon.accuracy}, Power ${weapon.power}, Critical ${weapon.critical}`}`;
      return `<option value="${index}">${foundry.utils.escapeHTML(label)}</option>`;
    }).join("");
    const weaponIndex = await new Promise(resolve => new Dialog({
      title: `${category || "Weapons"}: ${rank}-Rank`,
      content: `<form><div class="form-group"><label>Weapon</label><select name="weapon">${weaponOptions}</select></div></form>`,
      buttons: {
        import: { label: "Import", callback: html => resolve(Number(html.find('[name="weapon"]').val())) },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "import",
      close: () => resolve(null)
    }).render(true));

    return weaponIndex === null ? [] : (weaponGroups[weaponIndex] || []);
  }

  static groupWeaponStances(weapons = []) {
    const groups = new Map();
    for (const weapon of weapons) {
      const key = `${weapon.rank || ""}|${weapon.name}`.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(weapon);
    }
    return [...groups.values()]
      .map(stances => stances.sort((a, b) => String(a.stance).localeCompare(String(b.stance))))
      .sort((a, b) => a[0].name.localeCompare(b[0].name));
  }

  static async createWeapons(parsed = [], actor = null) {
    const primaryKeys = new Set();
    const docs = parsed.map(weapon => {
      const groupKey = `${weapon.rank || ""}|${weapon.name}`.toLowerCase();
      const wrestling = String(weapon.category || "").trim().toLowerCase() === "wrestling"
        || /\/items:wrestling(?:$|[?#])/i.test(String(weapon.sourceUrl || ""));
      const inventoryPrimary = wrestling ? false : !primaryKeys.has(groupKey);
      primaryKeys.add(groupKey);
      return ({
      name: weapon.name,
      type: "weapon",
      system: {
        equipped: wrestling,
        category: weapon.category || "",
        rank: weapon.rank || "",
        inventoryPrimary,
        stance: weapon.stance || "",
        usage: weapon.usage || weapon.stance || "",
        minStrength: Number(weapon.minStrength) || 0,
        accuracy: Number(weapon.accuracy) || 0,
        power: Number(weapon.power) || 0,
        critical: Number(weapon.critical) || 10,
        additionalDamage: Number(weapon.additionalDamage) || 0,
        maxMagazine: Number(weapon.maxMagazine) || 0,
        range: weapon.range || "",
        notes: weapon.notes || "",
        price: Number(weapon.price) || 0,
        selectedClassId: "",
        artificerPowered: Boolean(weapon.artificerPowered),
        powerTable: weapon.powerTable || {},
        sourceUrl: weapon.sourceUrl || ""
      }
    });
    });

    if (!docs.length) {
      const captured = String(globalThis.SW25_LAST_WEAPON_SOURCE ?? "");
      throw new Error(
        captured
          ? "No weapon rows were found. The captured source is available in SW25_LAST_WEAPON_SOURCE."
          : "No weapon rows were found. The page loaded, but its table format was not recognized."
      );
    }

    if (actor) {
      const existing = new Map(
        actor.items
          .filter(item => item.type === "weapon")
          .map(item => [`${item.system.rank}|${item.name}|${item.system.stance || item.system.usage || ""}`.toLowerCase(), item])
      );
      const create = [];
      for (const doc of docs) {
        const key = `${doc.system.rank}|${doc.name}|${doc.system.stance || doc.system.usage || ""}`.toLowerCase();
        const old = existing.get(key);
        if (old) {
          await old.update({
            name: doc.name,
            ...Object.fromEntries(
              Object.entries(doc.system).map(([field, value]) => [`system.${field}`, value])
            )
          });
        } else create.push(doc);
      }
      if (create.length) await actor.createEmbeddedDocuments("Item", create);
      actor.sheet?.render(false);
      ui.notifications.info(`Imported ${docs.length} weapons.`);
      return docs;
    }

    return Item.createDocuments(docs);
  }

  static normalizeFormula(value = "") {
    let formula = this.clean(value)
      .replace(/[×x]/gi, "*")
      .replace(/\b(2d|1d)\b/gi, match => `${match.toLowerCase()}6`)
      .replace(/\s+/g, "")
      .replace(/[–—−]/g, "-");
    const match = formula.match(/(?:^|[^0-9])((?:1d6|2d6)(?:[+-]\d+)?|\d+)(?:$|[^0-9])/i);
    return match ? match[1].toLowerCase() : "";
  }

  static parseCorrectionRows(rows) {
    const result = { a: "", b: "", c: "", d: "", e: "", f: "" };
    for (const row of rows) {
      const cells = [...row.querySelectorAll("th,td")].map(cell => this.clean(cell.textContent));
      if (!cells.length) continue;
      const joined = cells.join(" | ");
      for (const letter of ["A", "B", "C", "D", "E", "F"]) {
        const index = cells.findIndex(cell => new RegExp(`^${letter}(?:\\b|\\s|:)`, "i").test(cell));
        if (index >= 0) {
          const candidates = [cells[index + 1], cells[index], joined].filter(Boolean);
          for (const candidate of candidates) {
            const formula = this.normalizeFormula(candidate);
            if (formula) { result[letter.toLowerCase()] = formula; break; }
          }
        }
      }
    }
    return result;
  }

  static parseCorrections(text = "") {
    const result = { a: "", b: "", c: "", d: "", e: "", f: "" };
    const lines = String(text).split("\n").map(line => this.clean(line)).filter(Boolean);
    for (const line of lines) {
      for (const letter of ["A", "B", "C", "D", "E", "F"]) {
        const patterns = [
          new RegExp(`(?:^|[|\\s])${letter}\\s*[|:]\\s*([^|\\n]+)`, "i"),
          new RegExp(`^${letter}\\s+(.+)$`, "i")
        ];
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (!match) continue;
          const formula = this.normalizeFormula(match[1]);
          if (formula && !result[letter.toLowerCase()]) result[letter.toLowerCase()] = formula;
        }
      }
    }
    return result;
  }

  static sectionFromHeading(heading, stopPattern = null) {
    if (!heading) return "";
    const parts = [];
    let node = heading.nextElementSibling;
    while (node) {
      if (/^H[1-4]$/.test(node.tagName)) {
        const headingText = this.clean(node.textContent);
        if (!stopPattern || stopPattern.test(headingText)) break;
        break;
      }
      parts.push(node.innerText || node.textContent || "");
      node = node.nextElementSibling;
    }
    return this.clean(parts.join("\n"));
  }

  static extractRacialAbilitySection(text = "") {
    const source = String(text)
      .replace(/\r/g, "")
      .replace(/\*\*/g, "");

    // Reader output is not consistent: a heading may include an edit label, end
    // with punctuation, or share a line with the first ability. Examine every
    // occurrence and prefer the one that is immediately followed by an ability.
    const heading = /Racial Abilit(?:y|ies)(?!\s*Table)/ig;
    const candidates = [...source.matchAll(heading)];
    for (const match of candidates) {
      // Never treat the phrase inside "Enhanced Racial Abilities" as the start.
      const prefix = source.slice(Math.max(0, (match.index ?? 0) - 20), match.index ?? 0);
      if (/Enhanced\s*$/i.test(prefix)) continue;

      let start = (match.index ?? 0) + match[0].length;
      const remainder = source.slice(start);
      const stopMatch = remainder.match(/Enhanced Racial Abilit(?:y|ies)/i);
      const section = stopMatch ? remainder.slice(0, stopMatch.index) : remainder;

      // Remove heading decoration without consuming an ability on the same line.
      const cleaned = section.replace(/^\s*(?:\[[^\]]*edit[^\]]*\]|[.:—-])?\s*/i, "");
      if (/\[[^\]\n]+\]\s*(?:\n\s*)?:/m.test(cleaned)) return this.clean(cleaned);
    }
    return "";
  }


  static extractKnownLanguages(text = "") {
    const catalog = ["Trade Common","Dwarven","Elvish","Grassrunner","Regional Dialect","Magitech","Dragonic","Lykant","Sylvan","Ancient Celestial","Daemonic","Barbaric","Miakisian","Arcana","Shadow","Soleilian","Giantish","Drakish","Youma","Centaurian","Vulcan","Androscorpion","Lycanthrope","Lizardman"];
    const source = String(text ?? "");
    const found = catalog.filter(name => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[^A-Za-z])${escaped}(?:$|[^A-Za-z])`, "i").test(source);
    });
    return found.map(name => {
      if (["Sylvan", "Daemonic", "Youma"].includes(name)) return `${name} (speak only)`;
      if (name === "Ancient Celestial") return `${name} (read only)`;
      return name;
    }).join(", ");
  }

  static parseRaceHtml(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const content = doc.querySelector("#page-content") ?? doc.querySelector(".page-content") ?? doc.body;
    content.querySelectorAll("script,style,.printuser,.page-tags").forEach(element => element.remove());

    const pageHeadings = [...content.querySelectorAll("h1,h2,h3")].map(heading => heading.textContent);
    const name = this.chooseRaceName([
      ...pageHeadings,
      doc.querySelector("#page-title")?.textContent,
      doc.querySelector("meta[property='og:title']")?.content,
      doc.title
    ], url);
    const text = this.clean(content.innerText);
    const headings = [...content.querySelectorAll("h1,h2,h3,h4")];
    const findHeading = pattern => headings.find(heading => pattern.test(this.clean(heading.textContent)));
    const section = pattern => this.sectionFromHeading(findHeading(pattern));

    const racialHeading = findHeading(/^racial abilit(?:y|ies)$/i);
    const abilitySection = this.extractRacialAbilitySection(content.innerText || content.textContent || "")
      || this.sectionFromHeading(racialHeading, /^enhanced racial abilit(?:y|ies)$/i);

    let corrections = { a: "", b: "", c: "", d: "", e: "", f: "" };
    const correctionHeading = findHeading(/ability scores?|corrections?/i);
    const candidateTables = correctionHeading
      ? [...content.querySelectorAll("table")].filter(table => correctionHeading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
      : [...content.querySelectorAll("table")];
    for (const table of candidateTables) {
      const parsed = this.parseCorrectionRows([...table.querySelectorAll("tr")]);
      for (const letter of Object.keys(corrections)) if (parsed[letter]) corrections[letter] = parsed[letter];
      if (Object.values(corrections).filter(Boolean).length === 6) break;
    }
    if (!Object.values(corrections).some(Boolean)) corrections = this.parseCorrections(text);

    const descriptionNodes = [];
    for (const child of [...content.children]) {
      if (/^H[1-4]$/.test(child.tagName)) break;
      if (child.tagName === "TABLE") continue;
      descriptionNodes.push(child.innerText || child.textContent || "");
    }

    return {
      name,
      sourceUrl: url,
      description: this.clean(descriptionNodes.join("\n")),
      languages: this.extractKnownLanguages(this.matchLine(text, /Starting Languages?\s*:\s*([^\n]+)/i) || text),
      restrictedClasses: this.matchLine(text, /Restricted Classes?\s*:\s*([^\n]+)/i),
      lifespan: this.matchLine(text, /(?:lifespan|live for|adulthood)[^\n.]*(?:\.|$)/i),
      soulscars: Number(this.matchLine(text, /([0-9]+)\s*soulscars?/i) || 0),
      corrections,
      backgrounds: section(/background tables?/i),
      backgroundTables: this.parseBackgroundTablesHtml(content, name),
      rawText: text,
      abilities: this.extractAbilities(abilitySection)
    };
  }

  static markdownSection(md, exactHeading) {
    const lines = md.split("\n");
    const start = lines.findIndex(line => {
      const match = line.match(/^#{1,4}\s+(.+?)\s*$/);
      return match && exactHeading.test(this.clean(match[1]));
    });
    if (start < 0) return "";
    const output = [];
    for (let index = start + 1; index < lines.length; index++) {
      const heading = lines[index].match(/^#{1,4}\s+(.+?)\s*$/);
      if (heading) break;
      output.push(lines[index]);
    }
    return this.clean(output.join("\n"));
  }

  static parseRaceMarkdown(md, url) {
    const plain = md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    const text = this.clean(plain);
    const markdownHeadings = [...md.matchAll(/^#{1,4}\s+(.+?)\s*$/gm)].map(match => match[1]);
    const title = this.chooseRaceName(markdownHeadings, url);

    const abilitiesText = this.extractRacialAbilitySection(md)
      || this.extractRacialAbilitySection(plain)
      || this.markdownSection(md, /^racial abilit(?:y|ies)$/i);
    let corrections = this.parseCorrections(this.markdownSection(md, /ability scores?|corrections?/i));
    if (!Object.values(corrections).some(Boolean)) corrections = this.parseCorrections(md);

    const description = this.clean(
      plain.split(/^#{1,4}\s+(?:Ability Scores?|Racial Abilities|Starting Languages?)/im)[0]
        .replace(/^Title:.*$/m, "")
        .replace(/^#\s+.*$/m, "")
    );

    return {
      name: title,
      sourceUrl: url,
      description,
      languages: this.extractKnownLanguages(this.matchLine(text, /Starting Languages?\s*:\s*([^\n]+)/i) || text),
      restrictedClasses: this.matchLine(text, /Restricted Classes?\s*:\s*([^\n]+)/i),
      lifespan: this.matchLine(text, /(?:reach adulthood|live for|lifespan)[^\n.]*(?:\.|$)/i),
      soulscars: Number(this.matchLine(text, /([0-9]+)\s*soulscars?/i) || 0),
      corrections,
      backgrounds: this.markdownSection(md, /background tables?/i),
      backgroundTables: this.parseBackgroundTablesMarkdown(md, title),
      rawText: text,
      abilities: this.extractAbilities(abilitiesText)
    };
  }

  static parseRollRange(value = "") {
    const cleaned = this.clean(value).replace(/[–—−]/g, "-");
    const range = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) return { min: Number(range[1]), max: Number(range[2]), label: cleaned };
    const single = cleaned.match(/^\d+$/);
    if (single) return { min: Number(cleaned), max: Number(cleaned), label: cleaned };
    return null;
  }

  static parseStatTriplet(value = "") {
    const match = this.clean(value).match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
    return match ? { skill: Number(match[1]), body: Number(match[2]), mind: Number(match[3]) } : null;
  }

  static parseExperience(value = "") {
    const match = this.clean(value).replace(/,/g, "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  static parseStartingClasses(value = "") {
    const cleaned = this.clean(value);
    if (!cleaned || /^(?:none|—|-)$/i.test(cleaned)) return [];
    return cleaned
      .split(/\s*(?:,|\+|&|\/|\band\b|\bor\b|\n)\s*/i)
      .map(part => this.preferredClassName(this.clean(part).replace(/\s+(?:level|lv\.?)[ ]*\d+$/i, "")))
      .filter(Boolean);
  }

  static preferredClassName(name = "") {
    const cleaned = this.clean(name);
    return /^grappler$/i.test(cleaned) ? "Martial Artist" : cleaned;
  }

  static classCategory(name = "") {
    const minor = new Set([
      "fencer", "shooter", "scout", "ranger", "sage", "enhancer", "bard",
      "rider", "alchemist", "geomancer", "warleader"
    ]);
    const key = this.clean(name).toLowerCase();
    return minor.has(key) ? "B" : "A";
  }

  static backgroundRowFromCells(cells) {
    if (cells.length < 4) return null;
    const possibleRoll = this.parseRollRange(cells[0]);
    const offset = possibleRoll ? 1 : 0;
    if (cells.length < offset + 4) return null;
    const stats = this.parseStatTriplet(cells[offset + 2]);
    if (!stats) return null;
    return {
      roll: possibleRoll,
      name: this.clean(cells[offset]),
      startingClasses: this.parseStartingClasses(cells[offset + 1]),
      startingClassesText: this.clean(cells[offset + 1]),
      skill: stats.skill,
      body: stats.body,
      mind: stats.mind,
      experience: this.parseExperience(cells[offset + 3])
    };
  }

  static parseBackgroundTablesHtml(content, raceName = "") {
    const headings = [...content.querySelectorAll("h1,h2,h3,h4,h5")];
    const startHeading = headings.find(heading => /background tables?/i.test(this.clean(heading.textContent)));
    if (!startHeading) return [];

    const tables = [];
    let tableNumber = 0;
    for (const table of [...content.querySelectorAll("table")]) {
      if (!(startHeading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;

      const nextMajorHeading = headings.find(heading =>
        (startHeading.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        (heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        /^H[12]$/.test(heading.tagName) &&
        !/(?:background tables?|^table\b)/i.test(this.clean(heading.textContent))
      );
      if (nextMajorHeading) break;

      const rows = [...table.querySelectorAll("tr")];
      const header = rows.length ? [...rows[0].querySelectorAll("th,td")].map(cell => this.clean(cell.textContent).toLowerCase()) : [];
      const headerText = header.join(" | ");
      if (!/background/.test(headerText) || !/(skill|body|mind)/.test(headerText) || !/experience/.test(headerText)) continue;

      let title = "";
      let node = table.previousElementSibling;
      while (node && !title) {
        if (/^H[1-5]$/.test(node.tagName)) title = this.clean(node.textContent);
        node = node.previousElementSibling;
      }
      tableNumber += 1;
      const entries = rows.slice(1)
        .map(row => [...row.querySelectorAll("th,td")].map(cell => this.clean(cell.innerText || cell.textContent)))
        .map(cells => this.backgroundRowFromCells(cells))
        .filter(Boolean);
      if (entries.length) tables.push({ name: title || `Table ${tableNumber}`, entries });
    }
    return tables;
  }

  static parseBackgroundTablesMarkdown(md, raceName = "") {
    const lines = String(md).split("\n");
    const start = lines.findIndex(line => /background tables?/i.test(line));
    if (start < 0) {
      const fixedHeader = lines.findIndex(line => {
        const cleaned = this.clean(line).toLowerCase();
        return /background/.test(cleaned) && /starting classes?/.test(cleaned) && /skill\s*\/\s*body\s*\/\s*mind/.test(cleaned) && /experience/.test(cleaned);
      });
      if (fixedHeader < 0) return [];
      for (const line of lines.slice(fixedHeader + 1)) {
        const entry = this.parseFixedBackgroundRow(line);
        if (entry) return [{ name:"Background", fixed:true, entries:[entry] }];
      }
      return [];
    }

    const tables = [];
    let currentTitle = "";
    let current = null;

    const finish = () => {
      if (current?.entries?.length) tables.push(current);
      current = null;
    };

    const beginTable = () => {
      finish();
      current = { name: currentTitle || `Table ${tables.length + 1}`, entries: [] };
    };

    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) continue;

      const heading = line.match(/^#{1,5}\s+(.+?)\s*$/);
      if (heading) {
        const title = this.clean(heading[1]);
        if (/enhanced racial abilities/i.test(title)) break;
        if (/background tables?/i.test(title)) continue;
        if (/^table\b/i.test(title)) {
          finish();
          currentTitle = title;
          continue;
        }
        if (current || tables.length) {
          finish();
          break;
        }
        continue;
      }

      // Standard Markdown table emitted by many reader services.
      if (line.includes("|")) {
        const cells = line.replace(/^\||\|$/g, "").split("|").map(cell => this.clean(cell));
        if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
        const joined = cells.join(" ").toLowerCase();
        if (/background/.test(joined) && /starting classes?/.test(joined) && /(skill|body|mind)/.test(joined) && /experience/.test(joined)) {
          beginTable();
          current.rollable = /\b2d\b/.test(joined);
          continue;
        }
        if (!current) continue;
        const entry = this.backgroundRowFromCells(cells);
        if (entry) current.entries.push(entry);
        continue;
      }

      // Some Wikidot/Jina responses flatten HTML tables into tab-separated or
      // multi-space columns instead of Markdown pipes.
      const columns = line
        .split(/\t+|\s{2,}/)
        .map(cell => this.clean(cell))
        .filter(Boolean);
      const joined = columns.join(" ").toLowerCase();
      if (/background/.test(joined) && /starting classes?/.test(joined) && /experience/.test(joined) && /(skill|body|mind)/.test(joined)) {
        beginTable();
        current.rollable = /\b2d\b/.test(joined);
        continue;
      }
      if (current && columns.length >= 5) {
        const entry = this.backgroundRowFromCells(columns);
        if (entry) {
          current.entries.push(entry);
          continue;
        }
      }

      // Last-resort parser for fully flattened rows such as:
      // 2-4 Scholar Sage 8/10/8 2,500
      if (current) {
        const flattened = current.rollable === false
          ? this.parseFixedBackgroundRow(line)
          : this.parseFlattenedBackgroundRow(line);
        if (flattened) current.entries.push(flattened);
      }
    }

    finish();
    return tables;
  }

  static parseFlattenedBackgroundRow(line = "") {
    const cleaned = this.clean(line).replace(/[–—−]/g, "-");
    const match = cleaned.match(/^(\d+(?:\s*-\s*\d+)?)\s+(.+?)\s+(\d+\s*\/\s*\d+\s*\/\s*\d+)\s+([\d,]+)(?:\s*XP)?$/i);
    if (!match) return null;

    const roll = this.parseRollRange(match[1]);
    const stats = this.parseStatTriplet(match[3]);
    if (!roll || !stats) return null;

    const middle = this.clean(match[2]);
    const knownClasses = [
      "Fairy Tamer", "Martial Artist", "Dark Hunter", "Battle Dancer",
      "Daemonologist", "Bibliomancer", "Abyss Gazer", "Artificer", "Conjurer",
      "Druid", "Fencer", "Fighter", "Grappler", "Marksman", "Priest",
      "Sorcerer", "Scout", "Ranger", "Sage", "Enhancer", "Bard", "Rider",
      "Alchemist", "Geomancer", "Tactician", "Warleader", "Heritor", "Shooter"
    ];
    const classPattern = new RegExp(`\\b(${knownClasses.join("|")})(?:\\s*(?:or|&|and|\\+)\\s*(${knownClasses.join("|")}))?$`, "i");
    const classMatch = middle.match(classPattern);
    if (!classMatch) return null;

    const classText = this.clean(classMatch[0]);
    const backgroundName = this.clean(middle.slice(0, classMatch.index));
    if (!backgroundName) return null;

    return {
      roll,
      name: backgroundName,
      startingClasses: this.parseStartingClasses(classText),
      startingClassesText: classText,
      skill: stats.skill,
      body: stats.body,
      mind: stats.mind,
      experience: this.parseExperience(match[4])
    };
  }

  static parseFixedBackgroundRow(line = "") {
    const cleaned = this.clean(line);
    const match = cleaned.match(/^(.+?)\s+(\d+\s*\/\s*\d+\s*\/\s*\d+)\s+([\d,]+)(?:\s*XP)?$/i);
    if (!match) return null;
    const stats = this.parseStatTriplet(match[2]);
    if (!stats) return null;

    const middle = this.clean(match[1]);
    const knownClasses = [
      "Fairy Tamer", "Martial Artist", "Dark Hunter", "Battle Dancer",
      "Daemonologist", "Bibliomancer", "Artificer", "Conjurer", "Druid",
      "Fencer", "Fighter", "Grappler", "Marksman", "Priest", "Sorcerer",
      "Scout", "Ranger", "Sage", "Enhancer", "Bard", "Rider", "Alchemist",
      "Geomancer", "Tactician", "Heritor", "Shooter"
    ];
    const className = `(?:${knownClasses.join("|")})`;
    const classMatch = middle.match(new RegExp(`(${className}(?:\\s*(?:,|&|and|\\+)\\s*${className})*)$`, "i"));
    if (!classMatch) return null;
    const backgroundName = this.clean(middle.slice(0, classMatch.index));
    const startingClassesText = this.clean(classMatch[1]);
    if (!backgroundName) return null;

    return {
      roll:null,
      fixed:true,
      name:backgroundName,
      startingClasses:this.parseStartingClasses(startingClassesText),
      startingClassesText,
      skill:stats.skill,
      body:stats.body,
      mind:stats.mind,
      experience:this.parseExperience(match[3])
    };
  }

  static async promptBackground(actor, raceName, tables = []) {
    if (!actor || !tables.length) {
      ui.notifications.warn(`No background tables were found for ${raceName}.`);
      return null;
    }

    const tableIndex = tables.length === 1 ? 0 : await new Promise(resolve => {
      const options = tables.map((table, index) =>
        `<option value="${index}">${foundry.utils.escapeHTML(table.name)} (${table.entries.length} entries)</option>`
      ).join("");
      new Dialog({
        title: `Choose ${raceName} Background Table`,
        content: `<form><div class="form-group"><label>Background Table</label><select name="table-index">${options}</select></div></form>`,
        buttons: {
          choose: { label: "Choose Table", callback: html => resolve(Number(html.find('[name="table-index"]').val())) },
          skip: { label: "Skip", callback: () => resolve(null) }
        },
        default: "choose",
        close: () => resolve(null)
      }).render(true);
    });
    if (tableIndex === null || tableIndex === undefined) return null;

    const table = tables[tableIndex];
    const fixed = Boolean(table.fixed || (table.entries.length === 1 && !table.entries[0].roll));
    const rollable = !fixed && table.entries.every(entry => entry.roll);
    return new Promise(resolve => {
      const rows = table.entries.map((entry, index) => `
        <label class="sw25-background-choice" data-index="${index}">
          <input type="radio" name="background-entry" value="${index}" ${fixed && index === 0 ? "checked" : ""}>
          <span>${foundry.utils.escapeHTML(entry.roll?.label || "Choice")}</span>
          <strong>${foundry.utils.escapeHTML(entry.name)}</strong>
          <span>${foundry.utils.escapeHTML(entry.startingClassesText || "—")}</span>
          <span>${entry.skill}/${entry.body}/${entry.mind}</span>
          <span>${entry.experience.toLocaleString()} XP</span>
        </label>`).join("");

      new Dialog({
        title: `${raceName}: ${table.name}`,
        content: `
          <div class="sw25-background-prompt">
            <p>${fixed ? "This race has one fixed background." : rollable ? "Choose a background directly, or roll 2d6 and use the matching row." : "Choose one of the backgrounds in this table."}</p>
            <div class="sw25-background-heading"><span>${rollable ? "2d" : "Type"}</span><span>Background</span><span>Starting Classes</span><span>Skill/Body/Mind</span><span>Experience</span></div>
            ${rows}
            ${rollable ? '<div class="sw25-background-roll-result"><button type="button" class="roll-background"><i class="fas fa-dice"></i> Roll 2d6</button><strong class="rolled-background-result"></strong></div>' : ""}
          </div>`,
        buttons: {
          apply: {
            icon: '<i class="fas fa-check"></i>',
            label: "Apply Background",
            callback: async html => {
              const selected = html.find('[name="background-entry"]:checked').val();
              if (selected === undefined) {
                ui.notifications.warn("Choose or roll a background first.");
                return false;
              }
              const entry = table.entries[Number(selected)];
              await this.applyBackground(actor, raceName, entry);
              resolve(entry);
            }
          },
          skip: { label: "Skip", callback: () => resolve(null) }
        },
        default: "apply",
        render: html => {
          html.find(".roll-background").on("click", async event => {
            event.preventDefault();
            const roll = await new Roll("2d6").evaluate();
            const index = table.entries.findIndex(entry => roll.total >= entry.roll.min && roll.total <= entry.roll.max);
            html.find(".sw25-background-choice").removeClass("rolled-selected");
            if (index >= 0) {
              html.find(`[name="background-entry"][value="${index}"]`).prop("checked", true);
              html.find(`.sw25-background-choice[data-index="${index}"]`).addClass("rolled-selected");
              html.find(".rolled-background-result").text(`${roll.total}: ${table.entries[index].name}`);
            } else {
              html.find(".rolled-background-result").text(`${roll.total}: no matching entry`);
            }
          });
        },
        close: () => resolve(null)
      }, { width: 760 }).render(true);
    });
  }

  static async applyBackground(actor, raceName, entry) {
    const oldClasses = actor.items.filter(item => item.type === "class" && item.system.backgroundImported);
    if (oldClasses.length) await actor.deleteEmbeddedDocuments("Item", oldClasses.map(item => item.id));

    const classData = entry.startingClasses.map(name => ({
      name,
      type: "class",
      system: {
        level: 1,
        category: this.classCategory(name),
        classType: this.classType(name),
        backgroundImported: true,
        sourceBackground: entry.name,
        sourceRace: raceName
      }
    }));
    if (classData.length) await actor.createEmbeddedDocuments("Item", classData);

    await actor.update({
      "system.background.name": entry.name,
      "system.background.experience": entry.experience,
      "system.background.sourceRace": raceName,
      "system.abilityBases.skill": entry.skill,
      "system.abilityBases.body": entry.body,
      "system.abilityBases.mind": entry.mind,
      // Sword World characters always begin with 3,000 total XP. The value
      // printed in a background row is the XP remaining after its starting
      // classes, not the character's total earned XP.
      "system.xp.total": 3000
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sw25-chat-card"><h3>${foundry.utils.escapeHTML(entry.name)}</h3><p><strong>Race:</strong> ${foundry.utils.escapeHTML(raceName)}</p><p><strong>Starting Classes:</strong> ${foundry.utils.escapeHTML(entry.startingClassesText || "None")}</p><p><strong>Skill/Body/Mind:</strong> ${entry.skill}/${entry.body}/${entry.mind}</p><p><strong>Experience:</strong> ${entry.experience.toLocaleString()} XP</p></div>`
    });
  }

  static matchLine(text, regex) {
    return this.clean((String(text).match(regex) || [])[1] || "");
  }

  static extractAbilities(section) {
    if (!section) return [];

    const source = String(section)
      .replace(/\r/g, "")
      .replace(/\*\*/g, "")
      .split(/Enhanced Racial Abilit(?:y|ies)/i)[0];

    const abilities = [];
    // Accept all observed reader/HTML shapes:
    // [Darkvision]: text
    // [Darkvision] : text
    // [Darkvision]\n: text
    // The next bracketed-name-and-colon marker ends the description.
    const marker = /(?:^|\n)\s*(?:[-*]\s*)?\[([^\]\n]+)\]\s*(?:\n\s*)?:\s*/gm;
    const matches = [...source.matchAll(marker)];

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      const name = this.clean(match[1]);
      if (!name) continue;

      const descriptionStart = (match.index ?? 0) + match[0].length;
      const descriptionEnd = index + 1 < matches.length
        ? matches[index + 1].index
        : source.length;
      const description = this.clean(source.slice(descriptionStart, descriptionEnd));
      abilities.push({ name, description });
    }

    return abilities;
  }

  static async promptCorrectionRolls(actor, raceName, corrections) {
    const entries = Object.entries(corrections ?? {}).filter(([, formula]) => formula);
    if (!actor || !entries.length) return null;

    const rows = entries.map(([letter, formula]) => `
      <div class="sw25-correction-prompt-row" data-letter="${letter}" data-formula="${foundry.utils.escapeHTML(formula)}">
        <strong>${letter.toUpperCase()}</strong>
        <span class="correction-formula">${foundry.utils.escapeHTML(formula)}</span>
        <button type="button" class="roll-one-correction"><i class="fas fa-dice-d6"></i> Roll</button>
        <input type="number" class="correction-result" name="result-${letter}" placeholder="—">
      </div>`).join("");

    return new Promise(resolve => {
      new Dialog({
        title: `Roll ${raceName} Ability Corrections`,
        content: `
          <div class="sw25-correction-prompt">
            <p>Roll each correction separately. You may reroll any row before applying the displayed results.</p>
            <div class="sw25-correction-prompt-heading">
              <strong>Ability</strong><strong>Dice</strong><strong>Roll</strong><strong>Result</strong>
            </div>
            ${rows}
          </div>`,
        buttons: {
          apply: {
            icon: '<i class="fas fa-check"></i>',
            label: "Apply Results",
            callback: async html => {
              const updates = {};
              const results = [];

              for (const [letter, formula] of entries) {
                const raw = html.find(`[name="result-${letter}"]`).val();
                if (raw === "" || raw === null || raw === undefined) {
                  ui.notifications.warn("Roll or enter a result for every correction before applying them.");
                  return false;
                }
                const value = Number(raw);
                updates[`system.abilityAdjustments.${letter}.correction`] = value;
                results.push(`<strong>${letter.toUpperCase()}</strong>: ${foundry.utils.escapeHTML(formula)} = <strong>${value}</strong>`);
              }

              await actor.update(updates);
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<div class="sw25-chat-card"><h3>${foundry.utils.escapeHTML(raceName)} Ability Corrections</h3><p>${results.join("<br>")}</p></div>`
              });
              resolve(updates);
            }
          },
          skip: { label: "Skip", callback: () => resolve(null) }
        },
        default: "apply",
        render: html => {
          html.find(".roll-one-correction").on("click", async event => {
            event.preventDefault();
            const row = event.currentTarget.closest("[data-letter]");
            const formula = row?.dataset.formula;
            if (!formula) return;

            const button = $(event.currentTarget);
            button.prop("disabled", true);
            try {
              const roll = await new Roll(formula).evaluate();
              $(row).find(".correction-result").val(roll.total).trigger("change");
              button.html('<i class="fas fa-dice-d6"></i> Reroll');
            } finally {
              button.prop("disabled", false);
            }
          });
        },
        close: () => resolve(null)
      }).render(true);
    });
  }

  static magitechAngelGearDocuments(sourceUrl = "http://sw25.wikidot.com/race:magitech-angel") {
    const powerTable = values => Object.fromEntries(values.map((value, index) => [String(index + 3), value]));
    const racialGearRace = "Magitech Angel";
    const weapon = (stance, accuracy, power, values, inventoryPrimary) => ({
      name:"Magitech Angel Spear",
      type:"weapon",
      system:{
        equipped:false, quantity:1, category:"spears", rank:"B", stance, usage:stance,
        minStrength:15, accuracy, power, critical:10, criticalModifier:0,
        additionalDamage:1, damageFormula:"2d6", inventoryPrimary,
        powerTable:powerTable(values), notes:"Cannot be traded. Exclusive to Magitech Angels.",
        sourceUrl, racialGearRace
      }
    });
    const angelSphereDescription = `A special Magisphere that contains a single Magitech Angel in a dormant state. The Magitech Angel itself can use this item as a [Magisphere (Small)](http://sw25.wikidot.com/items:class-specific) to cast [Magitech](http://sw25.wikidot.com/spells:magitech).

When someone else touches an Angel Sphere in an uncontracted state, the dormant Magitech Angel manifests. The manifested Magitech Angel seeks to form a contract with those nearby (with priority given to the person who touched it). Those who form a contract with this Magitech Angel become a Contractor.

Contractors gain the ability to release the Magitech Angel from its dormant state, making it manifest from the Angel Sphere on command. A Magitech Angel can have up to 6 contractors. However, a Magitech Angel that has already formed contracts cannot form new contracts with others unless all current Contractors agree. Contractors cannot voluntarily terminate their contracts.`;
    return [
      weapon("1H†", 0, 20, [1,2,3,4,5,6,7,8,9,10], true),
      weapon("2H", 1, 25, [2,3,4,5,6,7,8,8,9,10], false),
      { name:"Magitech Angel Armour", type:"armour", system:{ equipped:false, minStrength:15, evasion:0, defence:5, magicalDefence:0, quantity:1, notes:"Cannot be traded. Metal armour exclusive to Magitech Angels.", sourceUrl, racialGearRace } },
      { name:"Magitech Angel Shield", type:"armour", system:{ equipped:false, minStrength:15, evasion:0, defence:1, magicalDefence:0, quantity:1, notes:"Cannot be traded. Shield exclusive to Magitech Angels.", sourceUrl, racialGearRace } },
      { name:"Angel Sphere", type:"equipment", system:{ quantity:1, equipped:false, consumable:false, category:"Adventure Tools", stance:"-", price:0, priceText:"Cannot be Traded", reputationRequirement:0, notes:"Contains a single Magitech Angel.", description:angelSphereDescription, sourceUrl, racialGearRace } }
    ];
  }

  static async syncRacialGear(actor, raceName, sourceUrl) {
    if (!actor || String(raceName || "").trim().toLowerCase() !== "magitech angel") return [];
    const documents = this.magitechAngelGearDocuments(sourceUrl);
    const keyFor = document => `${document.type}|${document.name}|${document.system.stance || ""}`.toLowerCase();
    const existing = new Map(actor.items
      .filter(item => String(item.system.racialGearRace || "").toLowerCase() === "magitech angel")
      .map(item => [keyFor(item), item]));
    const create = [];
    const result = [];
    for (const document of documents) {
      const old = existing.get(keyFor(document));
      if (old) {
        await old.update({ name:document.name, ...Object.fromEntries(Object.entries(document.system).map(([field, value]) => [`system.${field}`, value])) });
        result.push(old);
      } else create.push(document);
    }
    if (create.length) result.push(...await actor.createEmbeddedDocuments("Item", create));
    return result;
  }

  static async createRace(parsed, actor) {
    const raceData = {
      name: parsed.name || "Imported Race",
      type: "race",
      system: {
        sourceUrl: parsed.sourceUrl,
        description: parsed.description,
        languages: parsed.languages,
        restrictedClasses: parsed.restrictedClasses,
        lifespan: parsed.lifespan,
        soulscars: parsed.soulscars,
        corrections: parsed.corrections,
        backgrounds: parsed.backgrounds,
        rawText: parsed.rawText
      }
    };

    let race;
    if (actor) {
      const existingRaces = actor.items.filter(item => item.type === "race");
      if (existingRaces.length) await actor.deleteEmbeddedDocuments("Item", existingRaces.map(item => item.id));

      const oldImportedAbilities = actor.items.filter(item =>
        item.type === "ability" && item.system.source === "racial" && item.system.sourceUrl
      );
      if (oldImportedAbilities.length) {
        await actor.deleteEmbeddedDocuments("Item", oldImportedAbilities.map(item => item.id));
      }

      [race] = await actor.createEmbeddedDocuments("Item", [raceData]);

      const importedLanguages = this.extractKnownLanguages(parsed.languages)
        .split(/[,;\n]+/)
        .map(value => value.trim())
        .filter(Boolean)
        .map(raw => {
          const name = raw.replace(/\s*\((?:speak|read) only\)\s*/ig, "").trim();
          const speakOnly = /speak only/i.test(raw) || ["Sylvan", "Daemonic", "Youma"].includes(name);
          const readOnly = /read only/i.test(raw) || name === "Ancient Celestial";
          return { name, talk: !readOnly, read: !speakOnly };
        });
      await actor.update({ "system.languages": importedLanguages, "system.languagesInitialized": true });

      const racialAbilities = parsed.abilities?.length
        ? parsed.abilities
        : this.extractAbilities(this.extractRacialAbilitySection(parsed.rawText));

      if (racialAbilities.length) {
        console.info(`Sword World 2.5 | Importing ${racialAbilities.length} racial abilities for ${parsed.name}.`, racialAbilities);
        await actor.createEmbeddedDocuments("Item", racialAbilities.map(ability => ({
          name: ability.name,
          type: "ability",
          system: {
            source: "racial",
            description: ability.description,
            sourceRace: parsed.name,
            sourceUrl: parsed.sourceUrl,
            defenseModifier: defaultFeatureDefenseModifier(ability.name)
          }
        })));
      } else {
        console.warn(`Sword World 2.5 | No racial abilities were parsed for ${parsed.name}.`, {
          sourceUrl: parsed.sourceUrl,
          racialSection: this.extractRacialAbilitySection(parsed.rawText)
        });
        ui.notifications.warn(`No racial abilities were found for ${parsed.name}.`);
      }

      if (Number(parsed.soulscars) > 0) {
        await actor.update({ "system.soulscars": Number(parsed.soulscars) });
      }

      await this.syncRacialGear(actor, parsed.name, parsed.sourceUrl);

      actor.sheet?.render(false);
      await this.promptCorrectionRolls(actor, parsed.name, parsed.corrections);
      await this.promptBackground(actor, parsed.name, parsed.backgroundTables ?? []);
      actor.sheet?.render(false);
    } else {
      race = await Item.create(raceData);
    }
    return race;
  }
}

const MARTIAL_ARTIST_NAMES = new Set(["martial artist", "grappler"]);

function normalizedName(value = "") {
  return String(value).trim().toLowerCase();
}

export function isMartialArtistClass(item) {
  return item?.type === "class" && MARTIAL_ARTIST_NAMES.has(normalizedName(item.name));
}

export function martialArtistGrantDocuments() {
  return [
    {
      name: "Chain Attack",
      type: "feat",
      system: {
        category: "automatic",
        className: "Martial Artist",
        prerequisite: "Martial Artist Level 1",
        use: "Martial Artist class, 1H Wrestling",
        summary: "Make an additional 1H Wrestling attack against the same target.",
        description: "When the user makes a melee attack with a wrestling weapon with \"Stance: 1H,\" they can make an additional melee attack on the same target with a wrestling weapon with \"Stance: 1H.\" The weapon used for the initial attack may be different from the weapon used for the additional attack.\n\nOnly one Chain Attack is allowed when two attacks are made with Dual Wielding. The Chain Attack may occur with either attack. This additional attack does not incur the -2 penalty to the Accuracy check.",
        sourceUrl: "http://sw25.wikidot.com/feat:chain-attack",
        rawText: "Gain: Martial Artist Level 1\nUse: Martial Artist class, 1H Wrestling"
      }
    },
    {
      name: "Throw",
      type: "weapon",
      system: {
        equipped: true,
        usage: "2H",
        stance: "2H",
        accuracy: -1,
        power: 0,
        critical: 12,
        description: "The standard throwing attack granted to Martial Artists.",
        damageFormula: "2d6",
        quantity: 1,
        consumable: false,
        minStrength: 0,
        additionalDamage: 0,
        maxMagazine: 0,
        range: "",
        category: "Wrestling",
        rank: "B",
        inventoryPrimary: false,
        notes: "Martial Artist only.",
        selectedClassId: "",
        artificerPowered: false,
        powerTable: { "3":1, "4":1, "5":2, "6":3, "7":3, "8":4, "9":5, "10":5, "11":6, "12":7 },
        sourceUrl: "http://sw25.wikidot.com/items:wrestling",
        price: 0
      }
    }
  ];
}

export function missingMartialArtistGrantDocuments(items = []) {
  const entries = Array.from(items ?? []);
  return martialArtistGrantDocuments().filter(grant => !entries.some(item => {
    if (item.type !== grant.type) return false;
    const sameName = normalizedName(item.name) === normalizedName(grant.name);
    const sameSource = grant.type === "feat"
      && String(item.system?.sourceUrl ?? "").replace(/^https:/, "http:") === grant.system.sourceUrl;
    return sameName || sameSource;
  }));
}

const grantingActors = new Set();

export async function grantMartialArtistStartingFeatures(actor) {
  if (!actor || actor.type !== "character" || grantingActors.has(actor.id)) return [];
  const hasClass = Array.from(actor.items ?? []).some(isMartialArtistClass);
  if (!hasClass) return [];

  const missing = missingMartialArtistGrantDocuments(actor.items);
  if (!missing.length) return [];

  grantingActors.add(actor.id);
  try {
    return await actor.createEmbeddedDocuments("Item", missing, { render:false, sw25ClassGrant:true });
  } finally {
    grantingActors.delete(actor.id);
  }
}

export function initializeClassGrants() {
  const considerItem = async (item, _options, userId) => {
    if (userId !== game.user.id || !isMartialArtistClass(item)) return;
    const created = await grantMartialArtistStartingFeatures(item.parent);
    if (created.length) {
      item.parent?.sheet?.render(false);
      ui.notifications.info(`Added ${created.map(entry => entry.name).join(" and ")} for Martial Artist.`);
    }
  };

  Hooks.on("createItem", considerItem);
  Hooks.on("updateItem", considerItem);
}

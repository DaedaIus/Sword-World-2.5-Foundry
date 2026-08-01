import { abilityBonus, isGunWeapon, isWarriorClass } from "../rules/weapon-damage.mjs";
import { resolveAttackingClass, rollWeaponDamage } from "../rules/weapon-roll.mjs";
import { recordPlayerInitiative } from "../combat/side-initiative.mjs";

export class SW25ActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sw25", "sheet", "actor"],
      width: 1120,
      height: 820,
      resizable: true,
      scrollY: [".tab-content"]
    });
  }

  get template() {
    return "systems/sword-world-25/templates/actor/character-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.actor = this.actor;
    context.system = this.actor.system;

    const soulscars = Number(this.actor.system.soulscars ?? 0);
    context.soulscarCircles = Array.from({ length: 5 }, (_, index) => ({
      value: index + 1,
      active: index < soulscars
    }));

    const byType = type => [...this.actor.items]
      .filter(item => item.type === type)
      .sort((a, b) => a.name.localeCompare(b.name));

    context.races = byType("race");
    context.race = context.races[0] ?? null;
    context.classes = byType("class").sort((a, b) =>
      Number(b.system.level ?? 0) - Number(a.system.level ?? 0) || a.name.localeCompare(b.name)
    );
    context.feats = byType("feat");
    context.racialAbilities = byType("ability").filter(item => item.system.source === "racial");
    context.classAbilities = byType("ability").filter(item => item.system.source === "class");
    context.weapons = byType("weapon");
    context.armour = byType("armour");
    context.skills = byType("skill");
    context.spells = byType("spell");
    context.equipment = byType("equipment");
    context.additionalItems = [...context.classAbilities, ...context.spells, ...context.feats];
    context.equippedGear = [...context.weapons, ...context.armour, ...context.equipment]
      .filter(item => item.system.equipped);
    context.equippedWeapons = context.weapons.filter(item => item.system.equipped);

    const system = this.actor.system;

    const classTypeForName = name => {
      const key = String(name ?? "").trim().toLowerCase();
      const warriors = new Set(["battle dancer","fencer","fighter","martial artist","grappler","marksman"]);
      const wizards = new Set(["abyss gaer","artificer","bibliomancer","conjurer","daemonologist","druid","fairy tamer","priest","sorcerer"]);
      const others = new Set(["alchemist","bard","dark hunter","enhancer","geomancer","heritor","ranger","rider","sage","scout","tactician"]);
      if (warriors.has(key)) return "Warrior";
      if (wizards.has(key)) return "Wizard";
      if (others.has(key)) return "Other";
      return "";
    };
    const base = system.abilityBases ?? {};
    const adj = system.abilityAdjustments ?? {};
    const score = (baseName, letter) =>
      Number(base[baseName] ?? 0) +
      Number(adj[letter]?.growth ?? 0) +
      Number(adj[letter]?.correction ?? 0);

    const xpCosts = {
      A: [0, 1000, 2000, 3500, 5000, 7000, 9500, 12500, 16500, 21500, 27500, 35000, 44000, 54500, 66500, 80000, 95000, 125000],
      B: [0, 500, 1500, 2500, 4000, 5500, 7500, 10000, 13000, 17000, 22000, 28000, 35500, 44500, 55000, 67000, 80500, 105500]
    };

    for (const item of context.classes) {
      const category = String(item.system.category ?? "A").toUpperCase() === "B" ? "B" : "A";
      const level = Math.max(0, Math.min(17, Number(item.system.level ?? 0)));
      item.xpCost = xpCosts[category][level] ?? 0;
      item.displayClassType = classTypeForName(item.name) || String(item.system.classType ?? "").replace(/-type Class/i, "").trim() || "Other";
    }

    const featureSections = {
      alchemist: [{ key: "evocation", label: "Evocations", prefix: "evocation:" }],
      bard: [{ key: "spellsong", label: "Spellsongs", prefix: "spellsong:" }, { key: "finale", label: "Finales", prefix: "finale:" }],
      "dark hunter": [{ key: "weaving", label: "Essence Weavings", prefix: "weaving:" }],
      enhancer: [{ key: "technique", label: "Techniques", prefix: "technique:" }],
      geomancer: [{ key: "aspect", label: "Aspects", prefix: "aspect:" }],
      heritor: [{ key: "infusion", label: "Infusions", prefix: "infusion:" }],
      rider: [{ key: "stunt", label: "Stunts", prefix: "stunt:" }],
      tactician: [{ key: "stratagem", label: "Stratagems", prefix: "stratagem:" }, { key: "maneuver", label: "Maneuvers", prefix: "maneuver:" }]
    };
    const excludedOtherTabs = new Set(["ranger", "sage", "scout"]);
    const importedFeatures = [...context.spells, ...context.classAbilities];
    context.classTabs = context.classes.flatMap(classItem => {
      const nameKey = classItem.name.trim().toLowerCase();
      const type = String(classItem.displayClassType).trim().toLowerCase();
      if (type === "warrior" || (type === "other" && excludedOtherTabs.has(nameKey))) return [];
      let sections = type === "wizard" ? [{ key: "spell", label: "Spells", prefix: "spell:" }] : featureSections[nameKey];
      if (!sections && type === "other") sections = [{ key: "ability", label: "Class Abilities", prefix: "" }];
      if (!sections) return [];
      return [{
        id: `class-${classItem.id}`,
        label: classItem.name,
        sections: sections.map(section => ({
          ...section,
          classId: classItem.id,
          className: classItem.name,
          items: importedFeatures.filter(item =>
            (String(item.system.classId || "") === classItem.id ||
              (!item.system.classId && String(item.system.className || item.system.school || "").toLowerCase() === nameKey)) &&
            String(item.system.featureType || (item.type === "spell" ? "spell" : "ability")).toLowerCase() === section.key
          ).map(item => {
            const featureType = String(item.system.featureType || "").toLowerCase();
            const edgeCost = String(item.system.metadata || "").match(/(?:^|\n)Edge Cost:\s*([^\n]+)/i)?.[1]?.trim();
            item.classFeatureCost = ["stratagem", "maneuver"].includes(featureType) ? (edgeCost || item.system.cost || "None") : item.system.cost;
            return item;
          })
        }))
      }];
    });

    const spentXP = context.classes.reduce((total, item) => total + Number(item.xpCost ?? 0), 0);
    const totalXP = Number(system.xp?.total ?? 0);

    const abilities = {
      dexterity: score("skill", "a"),
      agility: score("skill", "b"),
      strength: score("body", "c"),
      vitality: score("body", "d"),
      intelligence: score("mind", "e"),
      spirit: score("mind", "f")
    };
    const bonuses = Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, Math.floor(Number(value) / 6)]));

    context.calculated = {
      adventurerLevel: context.classes.reduce(
        (highest, item) => Math.max(highest, Number(item.system.level ?? 0)), 0
      ),
      totalXP,
      spentXP,
      remainingXP: totalXP - spentXP,
      abilities,
      bonuses,
      fullMove: Number(system.combat?.movement ?? 0) * 3
    };

    const classLevel = name => Number(context.classes.find(item => item.name.toLowerCase() === name.toLowerCase())?.system.level ?? 0);
    context.classLevels = {
      fighter: classLevel("Fighter"),
      fencer: classLevel("Fencer"),
      martialArtist: classLevel("Martial Artist"),
      marksman: classLevel("Marksman"),
      scout: classLevel("Scout"),
      sage: classLevel("Sage")
    };

    context.classChoices = context.classes.map(item => ({ value: item.id, label: `${item.name} (Lv ${Number(item.system.level ?? 0)})` }));
    context.defenseClassChoices = context.classChoices.map(c => ({...c, selected:c.value === String(system.combat?.defenseClassId ?? "")}));
    context.offenseClassChoices = context.classes
      .filter(isWarriorClass)
      .map(item => ({
        value: item.id,
        label: `${item.name} (Lv ${Number(item.system.level ?? 0)})`,
        selected: item.id === String(system.combat?.offenseClassId ?? "")
      }));
    const wizardClasses = context.classes.filter(item => String(item.displayClassType || item.system.classType || "").toLowerCase().includes("wizard"));
    const selectedMagicClassId = String(system.combat?.magicClassId || wizardClasses[0]?.id || "");
    context.magicClassChoices = wizardClasses.map(item => ({
      value: item.id,
      label: `${item.name} (Lv ${Number(item.system.level ?? 0)})`,
      selected: item.id === selectedMagicClassId
    }));
    const selectedClassLevel = id => Number(this.actor.items.get(id)?.system.level ?? 0);
    const adventurer = context.calculated.adventurerLevel;
    const formulaHP = adventurer * 3 + abilities.vitality;
    context.calculated.hpMax = Number(system.hp?.max ?? 0) || formulaHP;
    context.calculated.mpMax = context.classes
      .filter(item => /wizard/i.test(String(item.system.classType ?? "")))
      .reduce((sum, item) => sum + Number(item.system.level ?? 0) * 3, 0) + abilities.spirit;
    context.calculated.sageLevel = Number(system.combat?.sageLevel ?? context.classLevels.sage);
    context.calculated.scoutLevel = Number(system.combat?.scoutLevel ?? context.classLevels.scout);
    context.calculated.monsterKnowledge = context.calculated.sageLevel + bonuses.intelligence;
    context.calculated.initiative = context.calculated.scoutLevel + bonuses.agility;
    context.calculated.fortitude = adventurer + bonuses.vitality;
    context.calculated.willpower = adventurer + bonuses.spirit;
    const equippedArmour = context.armour.filter(item => item.system.equipped);
    context.calculated.defense = equippedArmour.reduce((sum,item)=>sum+Number(item.system.defence ?? 0),0);
    context.calculated.magicalDefense = equippedArmour.reduce((sum,item)=>sum+Number(item.system.magicalDefence ?? 0),0);
    context.calculated.armourEvasion = equippedArmour.reduce((sum,item)=>sum+Number(item.system.evasion ?? 0),0);
    context.calculated.defenseClassLevel = selectedClassLevel(system.combat?.defenseClassId);
    const offenseClass = this.actor.items.get(system.combat?.offenseClassId);
    context.calculated.offenseClassLevel = isWarriorClass(offenseClass) ? this._classLevel(offenseClass) : 0;
    context.calculated.situationalEvasion = Number(system.combat?.situationalEvasion ?? 0);
    context.calculated.evasion = context.calculated.defenseClassLevel + bonuses.agility + context.calculated.situationalEvasion + context.calculated.armourEvasion;
    context.calculated.accuracyMod = Number(system.combat?.accuracyMod ?? 0);
    context.calculated.accuracy = context.calculated.offenseClassLevel + bonuses.dexterity + context.calculated.accuracyMod;
    context.calculated.magicPower = Number(this.actor.items.get(selectedMagicClassId)?.system.level ?? 0) + bonuses.intelligence;
    for (const tab of context.classTabs) {
      const classItem = context.classes.find(item => `class-${item.id}` === tab.id);
      const nameKey = String(classItem?.name || "").trim().toLowerCase();
      tab.classId = classItem?.id || "";
      tab.classLevel = Number(classItem?.system.level ?? 0);
      tab.isWizard = tab.sections.some(section => section.key === "spell");
      tab.magicPower = tab.classLevel + bonuses.intelligence;
      tab.isGeomancer = nameKey === "geomancer";
      tab.isAlchemist = nameKey === "alchemist";
      tab.isBard = nameKey === "bard";
      tab.isDarkHunter = nameKey === "dark hunter";
      tab.isTactician = nameKey === "tactician";
      tab.mentalPower = tab.classLevel + bonuses.spirit;
      if (tab.isAlchemist) {
        const colors = ["red", "green", "blue", "white", "gold"];
        const ranks = [["b", "B"], ["a", "A"], ["s", "S"], ["ss", "SS"]];
        tab.materialCardRows = colors.map(color => ({
          label: color[0].toUpperCase() + color.slice(1),
          cells: ranks.map(([rankKey, rankLabel]) => ({
            rankLabel,
            path: `system.classResources.alchemist.cards.${color}.${rankKey}`,
            value: Number(system.classResources?.alchemist?.cards?.[color]?.[rankKey] ?? 0)
          }))
        }));
      }
    }
    context.accessoryRows = [
      ["head","Head"],["face","Face"],["ears","Ears"],["neck","Neck"],["back","Back"],
      ["rightHand","Right Hand"],["leftHand","Left Hand"],["waist","Waist"],["feet","Feet"],["other","Other"]
    ].map(([key,label])=>({key,label,value:system.accessories?.[key] ?? ""}));

    context.officialAbilities = [
      { group: "Skill", baseKey: "skill", base: Number(base.skill ?? 0), abilities: [
        { key: "a", name: "Dexterity", score: abilities.dexterity, bonus: bonuses.dexterity, growth: Number(adj.a?.growth ?? 0), correction: Number(adj.a?.correction ?? 0) },
        { key: "b", name: "Agility", score: abilities.agility, bonus: bonuses.agility, growth: Number(adj.b?.growth ?? 0), correction: Number(adj.b?.correction ?? 0) }
      ]},
      { group: "Body", baseKey: "body", base: Number(base.body ?? 0), abilities: [
        { key: "c", name: "Strength", score: abilities.strength, bonus: bonuses.strength, growth: Number(adj.c?.growth ?? 0), correction: Number(adj.c?.correction ?? 0) },
        { key: "d", name: "Vitality", score: abilities.vitality, bonus: bonuses.vitality, growth: Number(adj.d?.growth ?? 0), correction: Number(adj.d?.correction ?? 0) }
      ]},
      { group: "Mind", baseKey: "mind", base: Number(base.mind ?? 0), abilities: [
        { key: "e", name: "Intelligence", score: abilities.intelligence, bonus: bonuses.intelligence, growth: Number(adj.e?.growth ?? 0), correction: Number(adj.e?.correction ?? 0) },
        { key: "f", name: "Spirit", score: abilities.spirit, bonus: bonuses.spirit, growth: Number(adj.f?.growth ?? 0), correction: Number(adj.f?.correction ?? 0) }
      ]}
    ];

    const savedLanguages = Array.isArray(system.languages) ? system.languages : [];
    const languageCatalog = ["Trade Common","Dwarven","Elvish","Grassrunner","Regional Dialect","Magitech","Dragonic","Lykant","Sylvan","Ancient Celestial","Daemonic","Barbaric","Miakisian","Arcana","Shadow","Soleilian","Giantish","Drakish","Youma","Centaurian","Vulcan","Androscorpion","Lycanthrope","Lizardman"];
    context.languageCatalog = languageCatalog;
    const languageEntry = raw => {
      const cleaned = String(raw ?? "").replace(/\s*\((?:speak|read) only\)\s*/ig, "").trim();
      const canonical = languageCatalog.find(name => name.toLowerCase() === cleaned.toLowerCase()) || cleaned;
      const speakOnly = /speak only/i.test(String(raw)) || ["sylvan","daemonic","youma"].includes(canonical.toLowerCase());
      const readOnly = /read only/i.test(String(raw)) || canonical.toLowerCase() === "ancient celestial";
      return { name: canonical, talk: !readOnly, read: !speakOnly };
    };
    const importedText = String(context.race?.system.languages ?? "");
    const importedNames = languageCatalog.filter(name => {
      const pattern = new RegExp(`(?:^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z])`, "i");
      return pattern.test(importedText);
    });
    const languageOverride = Boolean(system.languagesInitialized);
    context.languages = languageOverride ? savedLanguages : importedNames.map(languageEntry);
    this._sheetLanguages = foundry.utils.deepClone(context.languages);
    context.consumables = [...context.equipment, ...context.weapons].filter(item => item.system.consumable);
    context.inventoryItems = [...context.equipment, ...context.weapons, ...context.armour].filter(item => !item.system.consumable);
    const automaticFailures = Array.isArray(system.automaticFailures) ? system.automaticFailures : [];
    context.automaticFeatureSlots = Array.from({ length: 10 }, (_, index) => ({ index, checked: Boolean(automaticFailures[index]) }));
    const workSkills = Array.isArray(system.workSkills) ? system.workSkills : [];
    context.workSkills = workSkills.map((skill, skillIndex) => ({
      ...skill,
      skillIndex,
      expanded: this._expandedWorkSkills?.has(skill.id),
      checks: (Array.isArray(skill.checks) ? skill.checks : []).map((check, checkIndex) => ({
        ...check,
        checkIndex,
        expanded: this._expandedWorkChecks?.has(`${skill.id}:${check.id}`),
        abilityOptions: ["dexterity", "agility", "strength", "vitality", "intelligence", "spirit"].map(ability => ({
          value: ability,
          label: `${ability[0].toUpperCase() + ability.slice(1)} (${Number(bonuses[ability] ?? 0) >= 0 ? "+" : ""}${Number(bonuses[ability] ?? 0)})`,
          selected: ability === check.ability
        }))
      }))
    }));

    const genericSkill = (name, time, ability, fixedClassName = "", fixedLevel = "") => {
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + ability;
      const savedClassId = system.skillClasses?.[key];
      const classId = savedClassId !== undefined ? String(savedClassId) : (fixedClassName === "Adventurer" ? "adventurer" : "");
      const workSkillId = classId.startsWith("work:") ? classId.slice(5) : "";
      const workSkill = workSkillId ? workSkills.find(skill => skill.id === workSkillId) : null;
      const level = workSkill ? Number(workSkill.level ?? 0) : (classId === "adventurer" ? context.calculated.adventurerLevel : selectedClassLevel(classId));
      const options = [{value:"",label:"—",selected:!classId},{value:"adventurer",label:"Adventurer",selected:classId==="adventurer"}, ...context.classes.map(item=>({value:item.id,label:item.name,selected:item.id===classId})), ...workSkills.map(skill=>({value:`work:${skill.id}`,label:`Work: ${skill.name}`,selected:`work:${skill.id}`===classId}))];
      const effectiveLevel = savedClassId !== undefined ? level : (fixedLevel || level);
      return { name, time, ability, key, classId, level: effectiveLevel, mod: Number(bonuses[ability] ?? 0) + Number(effectiveLevel), options };
    };
    context.skillsByAbility = {
      dexterity: [
        genericSkill("Concealment", "1 min", "dexterity"),
        genericSkill("Disable", "1 min", "dexterity"),
        genericSkill("Disguise", "1 min", "dexterity"),
        genericSkill("First Aid", "10 min", "dexterity"),
        genericSkill("Pickpocket", "10 sec", "dexterity"),
        genericSkill("Set Trap", "10 min", "dexterity")
      ],
      agility: [
        genericSkill("Acrobatics", "1 min", "agility"),
        genericSkill("Climb", "10 min", "agility"),
        genericSkill("Follow", "1 min", "agility"),
        genericSkill("Stealth", "1 min", "agility"),
        genericSkill("Jump", "10 sec", "agility", "Adventurer", context.calculated.adventurerLevel),
        genericSkill("Ride", "1 min", "agility", "Adventurer", context.calculated.adventurerLevel),
        genericSkill("Swim", "1 min", "agility", "Adventurer", context.calculated.adventurerLevel),
        genericSkill("Swim (Combat)", "10 sec", "agility", "Adventurer", context.calculated.adventurerLevel),
        genericSkill("Tumble", "Instant", "agility")
      ],
      strength: [
        genericSkill("Climb", "10 min", "strength", "Adventurer", context.calculated.adventurerLevel),
        genericSkill("Strength", "10 min", "strength", "Adventurer", context.calculated.adventurerLevel)
      ],
      intelligence: [
        genericSkill("Appraisal", "10 min", "intelligence"),
        genericSkill("Archaeology", "10 min", "intelligence"),
        genericSkill("Cartography", "10 min", "intelligence"),
        genericSkill("Evade Trap", "Instant", "intelligence"),
        genericSkill("Evocation", "Instant", "intelligence"),
        genericSkill("Herbology", "Instant", "intelligence"),
        genericSkill("Insight", "10 sec", "intelligence", "Adventurer", context.calculated.adventurerLevel),
        genericSkill("Investigation", "1 hour", "intelligence"),
        genericSkill("Knowledge", "Instant", "intelligence"),
        genericSkill("Listen", "10 sec", "intelligence"),
        genericSkill("Medicine", "10 min", "intelligence"),
        genericSkill("Perception", "Instant", "intelligence"),
        genericSkill("Reference", "10 min", "intelligence"),
        genericSkill("Search", "10 min", "intelligence"),
        genericSkill("Sense Danger", "Instant", "intelligence"),
        genericSkill("Track", "1 min", "intelligence"),
        genericSkill("Weakness", "Instant", "intelligence"),
        genericSkill("Weather", "10 min", "intelligence")
      ],
      spirit: [genericSkill("Performance", "Instant", "spirit")]
    };

    this._sheetCalculated = context.calculated;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="roll-weapon"]').on("click", this._onRollWeapon.bind(this));
    html.find('[data-action="delete-weapon"]').on("click", this._onDeleteWeapon.bind(this));


    const setActiveTab = tabName => {
      html.find(".tab-button").removeClass("active");
      html.find(".sheet-tab").removeClass("active");
      html.find(`.tab-button[data-tab="${tabName}"]`).addClass("active");
      html.find(`.sheet-tab[data-tab-panel="${tabName}"]`).addClass("active");
      this._activeTab = tabName;
    };

    setActiveTab(this._activeTab ?? "overview");

    html.find(".tab-button").on("click", event => {
      event.preventDefault();
      setActiveTab(event.currentTarget.dataset.tab);
    });

    html.find("[data-action='rest']").on("click", async event => {
      event.preventDefault();
      const hours = Number(event.currentTarget.dataset.hours);
      if (![3, 6].includes(hours)) return;
      const hpMax = Math.max(0, Number(this._sheetCalculated?.hpMax ?? this.actor.system.hp?.max ?? 0));
      const mpMax = Math.max(0, Number(this._sheetCalculated?.mpMax ?? this.actor.system.mp?.max ?? 0));
      const currentHP = Number(this.actor.system.hp?.value ?? 0);
      const currentMP = Number(this.actor.system.mp?.value ?? 0);
      const hpRecovered = Math.ceil(hpMax * (hours === 3 ? 0.1 : 0.2));
      const mpRecovered = hours === 3 ? Math.ceil(mpMax / 2) : mpMax;
      const nextHP = Math.min(hpMax, currentHP + hpRecovered);
      const nextMP = Math.min(mpMax, currentMP + mpRecovered);
      await this.actor.update({ "system.hp.value":nextHP, "system.mp.value":nextMP });
      ui.notifications.info(`${this.actor.name} completes a ${hours}-hour rest and recovers ${Math.max(0, nextHP - currentHP)} HP and ${Math.max(0, nextMP - currentMP)} MP.`);
    });

    html.find("[data-action='toggle-race']").on("click", event => {
      event.preventDefault();
      const panel = html.find(".race-character-panel");
      const expanded = panel.toggleClass("expanded").hasClass("expanded");
      panel.find("[data-action='toggle-race'] i").toggleClass("fa-chevron-right", !expanded).toggleClass("fa-chevron-down", expanded);
      this._raceExpanded = expanded;
    });

    html.find("[data-action='import-class-feature']").on("click", async event => {
      event.preventDefault();
      const button = event.currentTarget;
      await game.sw25.importer.openClassFeature(this.actor, {
        classId: button.dataset.classId,
        className: button.dataset.className,
        featureType: button.dataset.featureType,
        featureLabel: button.dataset.featureLabel,
        prefix: button.dataset.prefix
      });
    });

    html.find("[data-action='add-class-feature-manually']").on("click", async event => {
      event.preventDefault();
      const button = event.currentTarget;
      await this._openManualClassFeatureDialog({
        classId: button.dataset.classId,
        className: button.dataset.className,
        featureType: button.dataset.featureType,
        featureLabel: button.dataset.featureLabel
      });
    });

    html.find("[data-action='increase-all-qi']").on("click", async event => {
      event.preventDefault();
      const qi = this.actor.system.classResources?.geomancer ?? {};
      await this.actor.update({
        "system.classResources.geomancer.heavenly": Number(qi.heavenly ?? 0) + 1,
        "system.classResources.geomancer.earthly": Number(qi.earthly ?? 0) + 1,
        "system.classResources.geomancer.spirit": Number(qi.spirit ?? 0) + 1
      });
    });

    html.find("[data-action='increase-edge']").on("click", async event => {
      event.preventDefault();
      const edge = Number(this.actor.system.classResources?.tactician?.edge ?? 0);
      await this.actor.update({ "system.classResources.tactician.edge": edge + 1 });
    });

    html.find("[data-action='increase-rhythm']").on("click", async event => {
      event.preventDefault();
      const rhythm = event.currentTarget.dataset.rhythm;
      if (!["uplifting", "calming", "enchanting"].includes(rhythm)) return;
      const current = Number(this.actor.system.classResources?.bard?.[rhythm] ?? 0);
      await this.actor.update({ [`system.classResources.bard.${rhythm}`]: current + 1 });
    });

    html.find("[data-action='reset-qi']").on("click", async event => {
      event.preventDefault();
      await this.actor.update({
        "system.classResources.geomancer.heavenly": 0,
        "system.classResources.geomancer.earthly": 0,
        "system.classResources.geomancer.spirit": 0
      });
    });

    html.find("[data-action='post-class-feature']").on("click", this._onPostClassFeature.bind(this));

    const clonedWorkSkills = () => foundry.utils.deepClone(Array.isArray(this.actor.system.workSkills) ? this.actor.system.workSkills : []);
    this._expandedWorkSkills ??= new Set();
    this._expandedWorkChecks ??= new Set();
    html.find("[data-action='add-work-skill']").on("click", async event => {
      event.preventDefault();
      const skills = clonedWorkSkills();
      skills.push({ id: foundry.utils.randomID(), name: "New Work Skill", level: 1, xp: 0, description: "", checks: [] });
      await this.actor.update({ "system.workSkills": skills });
    });
    html.find("[data-action='delete-work-skill']").on("click", async event => {
      event.preventDefault();
      const skills = clonedWorkSkills();
      skills.splice(Number(event.currentTarget.dataset.skillIndex), 1);
      await this.actor.update({ "system.workSkills": skills });
    });
    html.find("[data-action='edit-work-skill']").on("change", async event => {
      const skills = clonedWorkSkills();
      const skill = skills[Number(event.currentTarget.dataset.skillIndex)];
      if (!skill) return;
      const field = event.currentTarget.dataset.field;
      skill[field] = event.currentTarget.type === "number" ? Number(event.currentTarget.value || 0) : String(event.currentTarget.value || "");
      await this.actor.update({ "system.workSkills": skills });
    });
    html.find("[data-action='toggle-work-skill']").on("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const entry = event.currentTarget.closest(".work-skill-entry");
      const id = entry?.dataset.workSkillId;
      const expanded = entry?.classList.toggle("expanded");
      if (id) expanded ? this._expandedWorkSkills.add(id) : this._expandedWorkSkills.delete(id);
    });
    html.find("[data-action='add-work-check']").on("click", async event => {
      event.preventDefault();
      const skills = clonedWorkSkills();
      const skill = skills[Number(event.currentTarget.dataset.skillIndex)];
      if (!skill) return;
      if (!Array.isArray(skill.checks)) skill.checks = [];
      skill.checks.push({ id: foundry.utils.randomID(), name: "New Check", time: "Instant", ability: "intelligence", description: "" });
      await this.actor.update({ "system.workSkills": skills });
    });
    html.find("[data-action='delete-work-check']").on("click", async event => {
      event.preventDefault();
      const skills = clonedWorkSkills();
      const skill = skills[Number(event.currentTarget.dataset.skillIndex)];
      if (!skill?.checks) return;
      skill.checks.splice(Number(event.currentTarget.dataset.checkIndex), 1);
      await this.actor.update({ "system.workSkills": skills });
    });
    html.find("[data-action='edit-work-check']").on("change", async event => {
      const skills = clonedWorkSkills();
      const check = skills[Number(event.currentTarget.dataset.skillIndex)]?.checks?.[Number(event.currentTarget.dataset.checkIndex)];
      if (!check) return;
      check[event.currentTarget.dataset.field] = String(event.currentTarget.value || "");
      await this.actor.update({ "system.workSkills": skills });
    });
    html.find("[data-action='toggle-work-check']").on("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const entry = event.currentTarget.closest(".work-check-entry");
      const key = entry?.dataset.workCheckKey;
      const expanded = entry?.classList.toggle("expanded");
      if (key) expanded ? this._expandedWorkChecks.add(key) : this._expandedWorkChecks.delete(key);
    });
    html.find("[data-action='roll-work-check']").on("click", async event => {
      event.preventDefault();
      const skill = this.actor.system.workSkills?.[Number(event.currentTarget.dataset.skillIndex)];
      const check = skill?.checks?.[Number(event.currentTarget.dataset.checkIndex)];
      if (!skill || !check) return;
      const modifier = Number(skill.level ?? 0) + Number(this._sheetCalculated?.bonuses?.[check.ability] ?? 0);
      const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${skill.name}: ${check.name} (${check.time || "Instant"})` });
    });

    html.find("[data-action='edit-language']").on("change", async event => {
      const index = Number(event.currentTarget.dataset.index);
      const field = event.currentTarget.dataset.field;
      const list = foundry.utils.deepClone(Array.isArray(this.actor.system.languages) ? this.actor.system.languages : []);
      if (!list[index]) return;
      list[index][field] = event.currentTarget.type === "checkbox" ? event.currentTarget.checked : String(event.currentTarget.value || "");
      await this.actor.update({"system.languages": list, "system.languagesInitialized": true});
    });

    html.find("[data-action='adjust-currency']").on("change", async event => {
      const field = event.currentTarget.dataset.currency;
      if (!["gamels", "debt"].includes(field)) return;
      const raw = String(event.currentTarget.value || "").trim().replace(/,/g, "");
      if (!/^[+-]?\d+$/.test(raw)) {
        event.currentTarget.value = "";
        return ui.notifications.warn("Enter a whole-number adjustment such as +100 or -100.");
      }
      const current = Number(this.actor.system.currency?.[field] ?? 0);
      await this.actor.update({ [`system.currency.${field}`]: current + Number(raw) });
      event.currentTarget.value = "";
    });

    html.find("[data-action='remove-language']").on("click", async event => {
      event.preventDefault();
      const index = Number(event.currentTarget.dataset.index);
      const stored = Array.isArray(this.actor.system.languages) && this.actor.system.languages.length
        ? this.actor.system.languages
        : (this._sheetLanguages ?? []);
      const list = foundry.utils.deepClone(stored);
      if (index < 0 || index >= list.length) return;
      list.splice(index, 1);
      await this.actor.update({"system.languages": list, "system.languagesInitialized": true});
    });

    html.find("[data-action='toggle-automatic-failure']").on("change", async event => {
      const index = Number(event.currentTarget.dataset.index);
      const list = foundry.utils.deepClone(Array.isArray(this.actor.system.automaticFailures) ? this.actor.system.automaticFailures : []);
      while (list.length < 10) list.push(false);
      list[index] = Boolean(event.currentTarget.checked);
      await this.actor.update({"system.automaticFailures": list});
    });

    html.find("[data-action='select-skill-class']").on("change", async event => {
      await this.actor.update({ [`system.skillClasses.${event.currentTarget.dataset.skillKey}`]: event.currentTarget.value });
    });

    html.find("[data-action='select-defense-class']").on("change", async event => this.actor.update({"system.combat.defenseClassId":event.currentTarget.value}));
    html.find("[data-action='select-offense-class']").on("change", async event => this.actor.update({"system.combat.offenseClassId":event.currentTarget.value}));
    html.find("[data-action='select-magic-class']").on("change", async event => this.actor.update({"system.combat.magicClassId":event.currentTarget.value}));

    html.find("[data-action='add-class']").on("click", async event => { event.preventDefault(); await this._openAddClassDialog(); });
    html.find("[data-action='add-inventory']").on("click", async event => { event.preventDefault(); await this._openAddInventoryDialog(); });
    html.find("[data-action='add-language']").on("click", async event => { event.preventDefault(); await this._openAddLanguageDialog(); });
    html.find("[data-action='add-armour']").on("click", async event => { event.preventDefault(); await this._openArmourDialog(); });
    html.find("[data-action='toggle-armour']").on("click", event => { event.preventDefault(); $(event.currentTarget).closest('.armour-entry').toggleClass('expanded'); });
    html.find("[data-action='toggle-armour-equipped']").on("change", async event => {
      const itemId = event.currentTarget.closest('.armour-entry')?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      await item.update({"system.equipped": event.currentTarget.checked});
    });
    html.find("[data-action='delete-armour']").on("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const itemId = event.currentTarget.closest('.armour-entry')?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      const confirmed = await Dialog.confirm({
        title: "Delete Armour",
        content: `<p>Delete <strong>${foundry.utils.escapeHTML(item.name)}</strong>?</p>`
      });
      if (confirmed) await item.delete();
    });
    html.find("[data-action='add-weapon']").on("click", async event => { event.preventDefault(); await this._openWeaponDialog(); });
    html.find("[data-action='add-feat']").on("click", async event => { event.preventDefault(); await this._openFeatDialog(); });
    html.find("[data-action='add-additional']").on("click", async event => { event.preventDefault(); await this._openAdditionalDialog(); });
    html.find("[data-action='import-race']").on("click", async event => { event.preventDefault(); await this._openRaceImportDialog(); });
    html.find("[data-action='edit-race-name']").on("change", async event => {
      const name = String(event.currentTarget.value || "").trim();
      const race = [...this.actor.items].find(i => i.type === "race");
      if (race) await race.update({name});
      else if (name) await this.actor.createEmbeddedDocuments("Item", [{name,type:"race"}]);
    });
    html.find("[data-direct-path]").on("change", async event => {
      const path = event.currentTarget.dataset.directPath;
      let value = event.currentTarget.value;
      if (event.currentTarget.type === "number") value = Number(value || 0);
      await this.actor.update({[path]: value});
    });
    html.find("[data-action='toggle-feat']").on("click", event => event.currentTarget.closest(".feat-entry")?.classList.toggle("expanded"));

    html.find("[data-action='edit-class-level']").on("change", async event => {
      const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) await item.update({"system.level": Number(event.currentTarget.value || 0)});
    });

    html.find("[data-action='edit-item']").on("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      this.actor.items.get(itemId)?.sheet.render(true);
    });

    html.find("[data-action='roll-skill']").on("click", async event => {
      event.preventDefault();
      const modifier = Number(event.currentTarget.dataset.mod ?? 0);
      const skillName = event.currentTarget.closest(".skill-line")?.querySelector(".skill-name-roll")?.textContent?.trim() || "Skill";
      const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${skillName} Check` });
    });

    html.find("[data-action='roll-check']").on("click", async event => {
      event.preventDefault();
      const check = event.currentTarget.dataset.check;
      const labels = {
        accuracy: "Accuracy Check",
        evasion: "Evasion Check",
        initiative: "Initiative Check",
        magicPower: "Magic Power Check",
        fortitude: "Fortitude Check",
        willpower: "Willpower Check",
        monsterKnowledge: "Monster Knowledge Check"
      };
      const dynamic = {
        monsterKnowledge: this._sheetCalculated?.monsterKnowledge, initiative: this._sheetCalculated?.initiative,
        fortitude: this._sheetCalculated?.fortitude, willpower: this._sheetCalculated?.willpower,
        evasion: this._sheetCalculated?.evasion, accuracy: this._sheetCalculated?.accuracy, magicPower: this._sheetCalculated?.magicPower
      };
      const modifier = Number(dynamic[check] ?? this.actor.system.combat?.[check] ?? 0);
      const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: labels[check] ?? "Check"
      });
      if (check === "initiative") await recordPlayerInitiative(this.actor, roll.total);
    });

    html.find("[data-action='roll-class-magic-power']").on("click", async event => {
      event.preventDefault();
      const classItem = this.actor.items.get(event.currentTarget.dataset.classId);
      if (!classItem) return ui.notifications.warn("The casting class could not be found.");
      const modifier = this._classLevel(classItem) + abilityBonus(this.actor.system, "intelligence");
      const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${classItem.name} Magic Power` });
    });

    html.find("[data-action='post-weapon']").on("click", async event => {
      event.preventDefault();
      const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const weapon = this.actor.items.get(itemId);
      if (!weapon) return;
      const formula = weapon.system.damageFormula || "2d6";
      const gun = isGunWeapon(weapon);
      const content = `
        <div class="sw25-chat-card" data-actor-id="${this.actor.id}" data-item-id="${weapon.id}">
          <h3>${foundry.utils.escapeHTML(weapon.name)}</h3>
          <p><strong>Usage:</strong> ${foundry.utils.escapeHTML(weapon.system.usage || "—")}</p>
          <p><strong>Accuracy:</strong> ${Number(weapon.system.accuracy ?? 0)} &nbsp; <strong>Power:</strong> ${Number(weapon.system.power ?? 0)} &nbsp; <strong>Critical:</strong> ${Number(weapon.system.critical ?? 10)}</p>
          ${gun
            ? "<p><strong>Damage:</strong> Determined by the bullet spell.</p>"
            : `<p><strong>Damage Formula:</strong> ${foundry.utils.escapeHTML(formula)}</p>
               <button type="button" data-sw25-chat-action="roll-weapon-damage"><i class="fas fa-dice-d6"></i> Roll Damage</button>`}
        </div>`;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content
      });
    });

    html.find("[data-action='cast-spell']").on("click", async event => {
      event.preventDefault();
      const spell = this.actor.items.get(event.currentTarget.closest("[data-item-id]")?.dataset.itemId);
      if (!spell) return;
      const castingClass = this.actor.items.get(spell.system.classId) || [...this.actor.items].find(item =>
        item.type === "class" && item.name.toLowerCase() === String(spell.system.className || spell.system.school || "").toLowerCase()
      ) || this.actor.items.get(this.actor.system.combat?.magicClassId);
      if (!castingClass) return ui.notifications.warn(`${spell.name} is not assigned to a casting class.`);

      const cost = Math.max(0, Number(spell.system.mpCost ?? 0));
      const currentMP = Number(this.actor.system.mp?.value ?? 0);
      if (currentMP < cost) return ui.notifications.warn(`${this.actor.name} does not have enough MP to cast ${spell.name}.`);
      if (this.isEditable) await this.actor.update({ "system.mp.value": currentMP - cost });

      const escape = value => foundry.utils.escapeHTML(String(value || "")).replace(/\n/g, "<br>");
      const magicPower = this._classLevel(castingClass) + abilityBonus(this.actor.system, "intelligence");
      const powerResult = spell.system.hasPowerTable
        ? `<button type="button" data-sw25-chat-action="roll-spell-damage" data-actor-id="${this.actor.id}" data-item-id="${spell.id}" data-class-id="${castingClass.id}"><i class="fas fa-dice-d6"></i> Roll Damage</button>`
        : "";

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="sw25-chat-card spell-card"><h3>${escape(spell.name)}</h3><p><strong>${escape(castingClass.name)} Magic Power:</strong> ${magicPower} &nbsp; <strong>MP:</strong> ${cost}</p>${spell.system.metadata ? `<p>${escape(spell.system.metadata)}</p>` : ""}${spell.system.description ? `<p>${escape(spell.system.description)}</p>` : ""}${powerResult}<p><em>${escape(this.actor.name)} spends ${cost} MP.</em></p></div>`
      });
    });

    html.find("[data-action='cast-spell-legacy']").on("click", async event => {
      event.preventDefault();
      const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const spell = this.actor.items.get(itemId);
      if (!spell) return;

      const cost = Math.max(0, Number(spell.system.mpCost ?? 0));
      const currentMP = Number(this.actor.system.mp?.value ?? 0);
      if (currentMP < cost) {
        ui.notifications.warn(`${this.actor.name} does not have enough MP to cast ${spell.name}.`);
        return;
      }

      if (this.isEditable) {
        await this.actor.update({ "system.mp.value": currentMP - cost });
      }

      const description = foundry.utils.escapeHTML(spell.system.description || "").replace(/\n/g, "<br>");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `
          <div class="sw25-chat-card spell-card">
            <h3>${foundry.utils.escapeHTML(spell.name)}</h3>
            <p><strong>School:</strong> ${foundry.utils.escapeHTML(spell.system.school || "—")} &nbsp; <strong>Level:</strong> ${Number(spell.system.level ?? 0)} &nbsp; <strong>MP:</strong> ${cost}</p>
            ${description ? `<p>${description}</p>` : ""}
            <p><em>${this.actor.name} spends ${cost} MP.</em></p>
          </div>`
      });
    });

    if (!this.isEditable) return;

    html.find("[data-action='set-soulscars']").on("click", async event => {
      event.preventDefault();
      const selected = Number(event.currentTarget.dataset.value);
      const current = Number(this.actor.system.soulscars ?? 0);
      const next = selected === current ? selected - 1 : selected;
      await this.actor.update({ "system.soulscars": Math.max(0, next) });
    });

    html.find("[data-action='create-item']").on("click", async event => {
      event.preventDefault();
      const type = event.currentTarget.dataset.type;
      const source = event.currentTarget.dataset.source;
      const labels = {
        class: "Class", feat: "Feat", ability: "Ability", weapon: "Weapon",
        armour: "Armour", skill: "Skill", spell: "Spell", equipment: "Equipment"
      };
      const data = { name: `New ${labels[type] ?? "Item"}`, type };
      if (type === "ability" && source) data.system = { source };
      const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
      item?.sheet.render(true);
    });

    html.find("[data-action='delete-item']").on("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      const confirmed = await Dialog.confirm({
        title: `Delete ${item.name}?`,
        content: `<p>Delete <strong>${item.name}</strong> from this character?</p>`
      });
      if (confirmed) await item.delete();
    });
  }

  async _openAddClassDialog() {
    const content = `<form><div class="form-group"><label>Name</label><input name="name"></div><div class="form-group"><label>Cost Type</label><select name="category"><option>A</option><option>B</option></select></div><div class="form-group"><label>Class Type</label><select name="classType"><option>Warrior</option><option>Wizard</option><option>Other</option></select></div><div class="form-group"><label>Level</label><input type="number" name="level" value="1" min="0"></div><hr><div class="form-group"><label>Import URL</label><input name="url" placeholder="http://sw25.wikidot.com/class:artificer"></div></form>`;
    new Dialog({title:"Add Class",content,buttons:{manual:{label:"Add Manually",callback:async h=>{await this.actor.createEmbeddedDocuments("Item",[{name:String(h.find('[name=name]').val()||'New Class'),type:'class',system:{category:h.find('[name=category]').val(),classType:h.find('[name=classType]').val(),level:Number(h.find('[name=level]').val()||1)}}]);}},import:{label:"Import Link",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(url) await game.sw25.importer.importUrl(url,this.actor);}}}}).render(true);
  }

  async _openAddInventoryDialog() {
    const content=`<form><div class="form-group"><label>Name</label><input name="name"></div><div class="form-group"><label>Type</label><select name="type"><option value="weapon">Weapon</option><option value="armour">Armour</option><option value="equipment" selected>Equipment</option></select></div><div class="form-group"><label>Quantity</label><input type="number" name="quantity" value="1" min="1"></div><label><input type="checkbox" name="consumable"> Consumable</label><hr><div class="form-group"><label>Import URL</label><input name="url" placeholder="http://sw25.wikidot.com/items:adventure-tools"></div></form>`;
    new Dialog({title:"Add Inventory Item",content,buttons:{manual:{label:"Add Manually",callback:async h=>{const type=h.find('[name=type]').val(); await this.actor.createEmbeddedDocuments("Item",[{name:String(h.find('[name=name]').val()||'New Item'),type,system:{quantity:Number(h.find('[name=quantity]').val()||1),consumable:h.find('[name=consumable]').is(':checked')}}]);}},import:{label:"Import Link",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(url){try{await game.sw25.importer.importUrl(url,this.actor);}catch(e){ui.notifications.warn('Item-page importing will be fleshed out next; add this item manually for now.');}}}}}}).render(true);
  }

  async _openAddLanguageDialog() {
    const languages = ["Trade Common","Dwarven","Elvish","Grassrunner","Regional Dialect","Magitech","Dragonic","Lykant","Sylvan","Ancient Celestial","Daemonic","Barbaric","Miakisian","Arcana","Shadow","Soleilian","Giantish","Drakish","Youma","Centaurian","Vulcan","Androscorpion","Lycanthrope","Lizardman"];
    const options = languages.map(name => `<option value="${name}">${name}</option>`).join("");
    const content=`<form><div class="form-group"><label>Language</label><select name="name">${options}</select></div><label><input type="checkbox" name="talk" checked> Talk</label><label><input type="checkbox" name="read" checked> Read</label></form>`;
    new Dialog({title:"Add Language",content,buttons:{add:{label:"Add",callback:async h=>{const list=Array.isArray(this.actor.system.languages)?foundry.utils.deepClone(this.actor.system.languages):[]; const name=String(h.find('[name=name]').val()||'Trade Common'); const speakOnly=["Sylvan","Daemonic","Youma"].includes(name); const readOnly=name==="Ancient Celestial"; list.push({name,talk:readOnly?false:h.find('[name=talk]').is(':checked'),read:speakOnly?false:h.find('[name=read]').is(':checked')}); await this.actor.update({'system.languages':list,'system.languagesInitialized':true});}}}}).render(true);
  }

  async _openSimpleItemDialog(type,label,example) {
    const content=`<form><div class="form-group"><label>${label} Name</label><input name="name"></div><div class="form-group"><label>Import URL</label><input name="url" placeholder="${example}"></div></form>`;
    new Dialog({title:`Add ${label}`,content,buttons:{manual:{label:"Add Manually",callback:async h=>this.actor.createEmbeddedDocuments('Item',[{name:String(h.find('[name=name]').val()||`New ${label}`),type}])},import:{label:"Import Link",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(url){try{await game.sw25.importer.importUrl(url,this.actor);}catch(e){ui.notifications.warn(`${label} importing will be fleshed out later; add it manually for now.`);}}}}}}).render(true);
  }


  async _onDeleteWeapon(event) {
    event.preventDefault();
    event.stopPropagation();

    const itemId =
      event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
    const weapon = this.actor.items.get(itemId);
    if (!weapon || weapon.type !== "weapon") return;

    const confirmed = await Dialog.confirm({
      title: `Delete ${weapon.name}?`,
      content:
        `<p>Delete <strong>${foundry.utils.escapeHTML(weapon.name)}</strong> ` +
        `from ${foundry.utils.escapeHTML(this.actor.name)}?</p>` +
        `<p>This removes only this character's copy of the weapon.</p>`
    });

    if (confirmed) {
      await weapon.delete();
      ui.notifications.info(`${weapon.name} was deleted.`);
    }
  }

  _abilityModifier(key) {
    return abilityBonus(this.actor.system, key === "int" ? "intelligence" : "strength");
  }

  _classLevel(item) {
    return Number(
      item?.system?.level ??
      item?.system?.classLevel ??
      item?.system?.value ??
      0
    ) || 0;
  }

  _warriorClasses() {
    return this.actor.items.filter(isWarriorClass);
  }

  _artificerClass() {
    return this.actor.items.find(item =>
      item.type === "class" &&
      /^(artificer|マギテック)$/i.test(item.name.trim())
    );
  }

  async _openManualClassFeatureDialog(options = {}) {
    const label = options.featureLabel || "Class Feature";
    const isSpell = options.featureType === "spell";
    const content = `<form><div class="form-group"><label>Name</label><input name="name" autofocus></div><div class="form-group"><label>Requirement</label><input name="requirement"></div><div class="form-group"><label>Cost</label><input name="cost" placeholder="${isSpell ? "MP 0" : "None"}"></div>${isSpell ? '<div class="form-group"><label>MP Cost</label><input type="number" name="mpCost" value="0" min="0"></div>' : ""}<div class="form-group"><label>Imported Details / Statistics</label><textarea name="metadata"></textarea></div><div class="form-group"><label>Effect</label><textarea name="description"></textarea></div></form>`;
    return new Promise(resolve => new Dialog({
      title: `Add ${label}`,
      content,
      buttons: {
        add: {
          label: `Add ${label}`,
          callback: async html => {
            const name = String(html.find('[name="name"]').val() || `New ${label}`).trim();
            const cost = String(html.find('[name="cost"]').val() || "").trim();
            const system = {
              source: "class", classId: options.classId || "", className: options.className || "",
              featureType: options.featureType || "ability", requirement: String(html.find('[name="requirement"]').val() || ""),
              cost, mpCost: isSpell ? Number(html.find('[name="mpCost"]').val() || 0) : 0,
              school: options.className || "", metadata: String(html.find('[name="metadata"]').val() || ""),
              description: String(html.find('[name="description"]').val() || ""), sourceUrl: ""
            };
            const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type: isSpell ? "spell" : "ability", system }]);
            resolve(item);
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      }, default: "add", close: () => resolve(null)
    }).render(true));
  }

  async _onPostClassFeature(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const featureType = String(item.system.featureType || "ability").toLowerCase();
    const storedResources = item.system.resourceData ?? {};
    const metadata = String(item.system.metadata || "");
    const labelled = label => metadata.match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`, "i"))?.[1]?.trim() || "";
    const rhythmValues = value => ({
      uplifting: Number(String(value).match(/⮭\s*(\d+)/)?.[1] || 0),
      calming: Number(String(value).match(/⮯\s*(\d+)/)?.[1] || 0),
      enchanting: Number(String(value).match(/♡\s*(\d+)/)?.[1] || 0)
    });
    const costText = String(item.system.cost || "");
    const qiMatch = costText.match(/^(Heavenly|Earthly|Spirit)\s+Qi\s+(\d+)(?:\s*-\s*(\d+))?/i);
    const cardsText = labelled("Cards?") || costText;
    const resources = {
      ...storedResources,
      baseRhythm: storedResources.baseRhythm ?? rhythmValues(labelled("Base Rhythm")),
      rhythmCost: storedResources.rhythmCost ?? rhythmValues(labelled("Rhythm Cost") || costText),
      qiType: storedResources.qiType || String(qiMatch?.[1] || "").toLowerCase(),
      qiMin: Number(storedResources.qiMin ?? qiMatch?.[2] ?? 0),
      qiMax: Number(storedResources.qiMax ?? qiMatch?.[3] ?? qiMatch?.[2] ?? 0),
      hpCost: storedResources.hpCost || (/^\s*(?:\d+d|\d+)\s*HP\s*$/i.test(costText) ? costText.replace(/\s*HP\s*$/i, "") : ""),
      cardCount: Number(storedResources.cardCount ?? cardsText.match(/x\s*(\d+)/i)?.[1] ?? 1),
      suggestedCardColor: storedResources.suggestedCardColor || String(cardsText.match(/Red|Green|Blue|White|Gold/i)?.[0] || "").toLowerCase(),
      edgeAccumulation: Number(storedResources.edgeAccumulation ?? labelled("Edge Accumulation").match(/[+-]?\d+/)?.[0] ?? 0),
      edgeCost: Number(storedResources.edgeCost ?? labelled("Edge Cost").match(/\d+/)?.[0] ?? 0)
    };
    const updates = {};
    const notices = [];

    if (featureType === "aspect") {
      const qiType = String(resources.qiType || "").toLowerCase();
      const min = Number(resources.qiMin ?? 0);
      const max = Number(resources.qiMax ?? min);
      if (qiType && max > 0) {
        let amount = min;
        if (max > min) {
          amount = await new Promise(resolve => new Dialog({
            title: `${item.name}: Qi Cost`,
            content: `<form><div class="form-group"><label>${qiType[0].toUpperCase() + qiType.slice(1)} Qi (${min}-${max})</label><input type="number" name="amount" value="${min}" min="${min}" max="${max}"></div></form>`,
            buttons: {
              use: { label: "Use Aspect", callback: html => resolve(Math.min(max, Math.max(min, Number(html.find('[name="amount"]').val()) || min))) },
              cancel: { label: "Cancel", callback: () => resolve(null) }
            },
            default: "use", close: () => resolve(null)
          }).render(true));
          if (amount === null) return;
        }
        const current = Number(this.actor.system.classResources?.geomancer?.[qiType] ?? 0);
        if (current < amount) return ui.notifications.warn(`Not enough ${qiType} Qi to use ${item.name}.`);
        updates[`system.classResources.geomancer.${qiType}`] = current - amount;
        notices.push(`${amount} ${qiType[0].toUpperCase() + qiType.slice(1)} Qi spent`);
      }
    }

    if (featureType === "evocation") {
      const count = Math.max(1, Number(resources.cardCount ?? 1));
      const suggested = String(resources.suggestedCardColor || "green");
      const selection = await new Promise(resolve => new Dialog({
        title: `${item.name}: Material Card`,
        content: `<form><div class="form-group"><label>Colour</label><select name="colour">${["red","green","blue","white","gold"].map(color => `<option value="${color}" ${color === suggested ? "selected" : ""}>${color[0].toUpperCase() + color.slice(1)}</option>`).join("")}</select></div><div class="form-group"><label>Rank</label><select name="rank"><option value="b">B-Rank</option><option value="a">A-Rank</option><option value="s">S-Rank</option><option value="ss">SS-Rank</option></select></div><p>${count} card${count === 1 ? "" : "s"} will be spent.</p></form>`,
        buttons: {
          use: { label: "Use Evocation", callback: html => resolve({ colour: String(html.find('[name="colour"]').val()), rank: String(html.find('[name="rank"]').val()) }) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        }, default: "use", close: () => resolve(null)
      }).render(true));
      if (!selection) return;
      const current = Number(this.actor.system.classResources?.alchemist?.cards?.[selection.colour]?.[selection.rank] ?? 0);
      if (current < count) return ui.notifications.warn(`Not enough ${selection.colour} ${selection.rank.toUpperCase()}-Rank cards.`);
      updates[`system.classResources.alchemist.cards.${selection.colour}.${selection.rank}`] = current - count;
      notices.push(`${count} ${selection.colour[0].toUpperCase() + selection.colour.slice(1)} ${selection.rank.toUpperCase()}-Rank card${count === 1 ? "" : "s"} spent`);
    }

    if (featureType === "spellsong" || featureType === "finale") {
      const source = featureType === "spellsong" ? resources.baseRhythm : resources.rhythmCost;
      const rhythm = this.actor.system.classResources?.bard ?? {};
      const labels = { uplifting: "Uplifting", calming: "Calming", enchanting: "Enchanting" };
      const symbols = { uplifting: "⮭", calming: "⮯", enchanting: "♡" };
      for (const key of Object.keys(labels)) {
        const amount = Number(source?.[key] ?? 0);
        if (!amount) continue;
        const current = Number(rhythm[key] ?? 0);
        if (featureType === "finale" && current < amount) return ui.notifications.warn(`Not enough ${labels[key]} Rhythm for ${item.name}.`);
        updates[`system.classResources.bard.${key}`] = featureType === "spellsong" ? current + amount : current - amount;
        notices.push(`${symbols[key]}${amount} ${featureType === "spellsong" ? "gained" : "spent"}`);
      }
    }

    if (featureType === "weaving" && resources.hpCost) {
      const costText = String(resources.hpCost).toLowerCase();
      const rollFormula = /^\d+d$/i.test(costText) ? `${costText}6` : costText;
      const hpRoll = /d/.test(costText) ? await new Roll(rollFormula).evaluate() : null;
      const hpCost = hpRoll ? Number(hpRoll.total ?? 0) : Number(costText) || 0;
      const currentHP = Number(this.actor.system.hp?.value ?? 0);
      updates["system.hp.value"] = Math.max(0, currentHP - hpCost);
      notices.push(`${hpCost} HP spent${hpRoll ? ` (${costText})` : ""}`);
    }

    if (featureType === "technique") {
      const currentMP = Number(this.actor.system.mp?.value ?? 0);
      if (currentMP < 3) return ui.notifications.warn(`Not enough MP to use ${item.name}.`);
      updates["system.mp.value"] = currentMP - 3;
      notices.push("3 MP spent");
    }

    if (featureType === "stratagem" || featureType === "maneuver") {
      const current = Number(this.actor.system.classResources?.tactician?.edge ?? 0);
      const gain = featureType === "stratagem" ? Number(resources.edgeAccumulation ?? 0) : 0;
      const cost = featureType === "maneuver" ? Number(resources.edgeCost ?? 0) : 0;
      if (current < cost) return ui.notifications.warn(`Not enough Edge to use ${item.name}.`);
      updates["system.classResources.tactician.edge"] = current - cost + gain;
      if (gain) notices.push(`${gain} Edge gained`);
      if (cost) notices.push(`${cost} Edge spent`);
    }

    if (Object.keys(updates).length) await this.actor.update(updates);
    const escape = value => foundry.utils.escapeHTML(String(value || "")).replace(/\n/g, "<br>");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="sw25-chat-card class-feature-card"><h3>${escape(item.name)}</h3>${item.system.metadata ? `<p>${escape(item.system.metadata)}</p>` : ""}${item.system.description ? `<p>${escape(item.system.description)}</p>` : ""}${notices.length ? `<p><em>${escape(notices.join("; "))}.</em></p>` : ""}</div>`
    });
  }

  async _onRollWeapon(event) {
    event.preventDefault();
    const row = event.currentTarget.closest("[data-item-id]");
    const weapon = this.actor.items.get(row?.dataset.itemId);
    if (!weapon) return;
    if (isGunWeapon(weapon)) {
      ui.notifications.info(`${weapon.name} damage is rolled through its bullet spell.`);
      return;
    }

    const attackingClass = resolveAttackingClass(this.actor, weapon);
    if (!attackingClass) {
      const requirement = isGunWeapon(weapon) ? "an Artificer class" : "a selected warrior-type Attacking Class";
      ui.notifications.warn(`${weapon.name} requires ${requirement}.`);
      return;
    }
    await rollWeaponDamage({ actor: this.actor, weapon, attackingClass });
  }

  async _openFeatDialog() {
    const content = `<form>
      <div class="form-group"><label>Title</label><input name="name"></div>
      <div class="form-group"><label>Prerequisite</label><input name="prerequisite" placeholder="None"></div>
      <div class="form-group"><label>Use</label><input name="use" placeholder="Shield"></div>
      <div class="form-group"><label>Summary</label><textarea name="summary"></textarea></div>
      <hr>
      <div class="form-group"><label>Import URL</label><input name="url" placeholder="http://sw25.wikidot.com/feat:dodge"></div>
    </form>`;

    new Dialog({
      title: "Add Combat Feat",
      content,
      buttons: {
        manual: {
          label: "Add Manually",
          callback: async html => {
            const summary = String(html.find('[name="summary"]').val() || "");
            await this.actor.createEmbeddedDocuments("Item", [{
              name: String(html.find('[name="name"]').val() || "New Feat"),
              type: "feat",
              system: {
                category: "combat",
                prerequisite: String(html.find('[name="prerequisite"]').val() || "None"),
                use: String(html.find('[name="use"]').val() || ""),
                summary,
                description: summary
              }
            }]);
          }
        },
        import: {
          label: "Import Link",
          callback: async html => {
            const url = String(html.find('[name="url"]').val() || "").trim();
            if (url) await game.sw25.importer.importUrl(url, this.actor);
          }
        }
      },
      default: "import"
    }).render(true);
  }

  async _openRaceImportDialog() {
    const content = `<form><div class="form-group"><label>Race URL</label><input name="url" placeholder="http://sw25.wikidot.com/race:tabbit"></div></form>`;
    new Dialog({title:"Import Race",content,buttons:{import:{label:"Import",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(url) await game.sw25.importer.importUrl(url,this.actor);}}}}).render(true);
  }

  async _openArmourDialog() {
    const content = `<form>
      <div class="form-group"><label>Armour</label><input name="name"></div>
      <div class="form-group"><label>Minimum Strength</label><input type="number" name="minStrength" value="0"></div>
      <div class="form-group"><label>Evasion</label><input type="number" name="evasion" value="0"></div>
      <div class="form-group"><label>Defense</label><input type="number" name="defence" value="0"></div>
      <div class="form-group"><label>Magical Defense</label><input type="number" name="magicalDefence" value="0"></div>
      <div class="form-group"><label>Notes</label><textarea name="description"></textarea></div>
      <hr><div class="form-group"><label>Import URL</label><input name="url" placeholder="http://sw25.wikidot.com/items:metal-armor"></div>
    </form>`;
    new Dialog({title:"Add Armour",content,buttons:{manual:{label:"Add Manually",callback:async h=>this.actor.createEmbeddedDocuments("Item",[{name:String(h.find('[name=name]').val()||'New Armour'),type:"armour",system:{minStrength:Number(h.find('[name=minStrength]').val()||0),evasion:Number(h.find('[name=evasion]').val()||0),defence:Number(h.find('[name=defence]').val()||0),magicalDefence:Number(h.find('[name=magicalDefence]').val()||0),description:String(h.find('[name=description]').val()||'')}}])},import:{label:"Import Link",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(url) await game.sw25.importer.importUrl(url,this.actor);}}}}).render(true);
  }

  async _openWeaponDialog() {
    const content = `<form>
      <div class="form-group"><label>Name</label><input name="name"></div>
      <div class="form-group"><label>Stance</label><select name="usage"><option>1H</option><option>2H</option></select></div>
      <div class="form-group"><label>Gun</label><input type="checkbox" name="isGun"></div>
      <div class="form-group"><label>Minimum Strength</label><input type="number" name="minStrength" value="0"></div>
      <div class="form-group"><label>Accuracy</label><input type="number" name="accuracy" value="0"></div>
      <div class="form-group"><label>Power</label><input type="number" name="power" value="0" min="0"></div>
      <div class="form-group"><label>Critical</label><input type="number" name="critical" value="10"></div>
      <div class="form-group"><label>Additional Damage</label><input type="number" name="additionalDamage" value="0"></div>
      <hr><div class="form-group"><label>Import URL</label><input name="url" placeholder="http://sw25.wikidot.com/items:swords"></div>
    </form>`;
    new Dialog({title:"Add Weapon",content,buttons:{manual:{label:"Add Manually",callback:async h=>{const gun=h.find('[name=isGun]').is(':checked'); return this.actor.createEmbeddedDocuments("Item",[{name:String(h.find('[name=name]').val()||'New Weapon'),type:"weapon",system:{usage:String(h.find('[name=usage]').val()||'1H'),minStrength:Number(h.find('[name=minStrength]').val()||0),accuracy:Number(h.find('[name=accuracy]').val()||0),power:Number(h.find('[name=power]').val()||0),critical:Number(h.find('[name=critical]').val()||10),additionalDamage:Number(h.find('[name=additionalDamage]').val()||0),category:gun?'Gun':'',artificerPowered:gun}}]);}},import:{label:"Import Link",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(url) await game.sw25.importer.importUrl(url,this.actor);}}}}).render(true);
  }

  async _openAdditionalDialog() {
    const content = `<form><div class="form-group"><label>Type</label><select name="type"><option value="ability">Ability</option><option value="spell">Spell</option><option value="feat">Feat</option></select></div><div class="form-group"><label>Title</label><input name="name"></div><div class="form-group"><label>Description</label><textarea name="description"></textarea></div><hr><div class="form-group"><label>Import URL</label><input name="url" placeholder="http://sw25.wikidot.com/"></div></form>`;
    new Dialog({title:"Add Ability, Spell, or Feat",content,buttons:{manual:{label:"Add Manually",callback:async h=>{const type=String(h.find('[name=type]').val()); const system={description:String(h.find('[name=description]').val()||'')}; if(type==='ability') system.source='class'; await this.actor.createEmbeddedDocuments('Item',[{name:String(h.find('[name=name]').val()||'New Entry'),type,system}]);}},import:{label:"Import Link",callback:async h=>{const url=String(h.find('[name=url]').val()||'').trim(); if(!url) return; try { await game.sw25.importer.importUrl(url,this.actor); } catch (error) { console.error(error); ui.notifications.warn("This page type is not supported by the importer yet."); }}}}}).render(true);
  }

}

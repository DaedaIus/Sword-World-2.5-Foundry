import { lootMatches, monsterDamageFormula } from "../importer/monster-parser.mjs";
import { beginMonsterInitiative } from "../combat/side-initiative.mjs";

export class SW25MonsterSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sw25", "sheet", "actor", "monster-sheet"],
      width: 850,
      height: 780,
      resizable: true,
      scrollY: [".monster-sheet-body"]
    });
  }

  get template() { return "systems/sword-world-25/templates/actor/monster-sheet.hbs"; }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.isGM = game.user.isGM;
    context.canRead = game.user.isGM || Boolean(this.actor.system.revealed);
    context.combatStyles = (Array.isArray(this.actor.system.combatStyles) ? this.actor.system.combatStyles : []).map((entry, index) => ({ ...entry, index }));
    context.uniqueSkills = (Array.isArray(this.actor.system.uniqueSkills) ? this.actor.system.uniqueSkills : []).map((entry, index) => ({ ...entry, index }));
    context.lootTable = (Array.isArray(this.actor.system.lootTable) ? this.actor.system.lootTable : []).map((entry, index) => ({ ...entry, index }));
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='import-monster']").on("click", event => {
      event.preventDefault();
      new Dialog({
        title: "Import Monster",
        content: `<form><div class="form-group"><label>Monster URL</label><input type="url" name="url" value="${foundry.utils.escapeHTML(this.actor.system.sourceUrl || "http://sw25.wikidot.com/monster:goblin")}"></div></form>`,
        buttons: { import: { label: "Import", callback: async dialogHtml => {
          const url = String(dialogHtml.find("[name='url']").val() || "").trim();
          try { await game.sw25.importer.importUrl(url, this.actor); ui.notifications.info(`Imported ${this.actor.name}.`); }
          catch (error) { console.error("Sword World 2.5 | Monster import failed", error); ui.notifications.error(error.message || "Monster import failed."); }
        } }, cancel: { label: "Cancel" } },
        default: "import"
      }).render(true);
    });

    html.find("[data-action='roll-monster-damage']").on("click", async event => {
      event.preventDefault();
      const index = Number(event.currentTarget.dataset.index);
      const style = this.actor.system.combatStyles?.[index];
      if (!style) return;
      try {
        const roll = await new Roll(monsterDamageFormula(style.damage)).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — ${style.style || "Attack"} Damage` });
      } catch (error) { ui.notifications.error(`Invalid monster damage formula: ${style.damage}`); }
    });

    html.find("[data-action='roll-monster-accuracy']").on("click", async event => {
      event.preventDefault();
      const style = this.actor.system.combatStyles?.[Number(event.currentTarget.dataset.index)];
      if (!style) return;
      const modifier = Number(String(style.accuracy || "0").match(/-?\d+/)?.[0] || 0);
      const roll = await new Roll(`2d6 + ${modifier}`).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — ${style.style || "Attack"} Accuracy` });
    });

    html.find("[data-action='roll-monster-initiative']").on("click", async event => {
      event.preventDefault();
      if (!game.user.isGM) return;
      const initiative = Number(this.actor.system.initiative ?? 0);
      await ChatMessage.create({ speaker:ChatMessage.getSpeaker({ actor:this.actor }), content:`<div class="sw25-chat-card"><h3>${foundry.utils.escapeHTML(this.actor.name)} Side Initiative</h3><p class="sw25-weapon-total"><strong>${initiative}</strong></p></div>` });
      await beginMonsterInitiative(this.actor, initiative);
    });

    html.find("[data-action='roll-monster-loot']").on("click", async event => {
      event.preventDefault();
      const roll = await new Roll("2d6").evaluate();
      const total = Number(roll.total || 0);
      const matches = (this.actor.system.lootTable || []).filter(entry => lootMatches(entry.roll, total));
      const rows = matches.length ? matches.map(entry => `<li><strong>${foundry.utils.escapeHTML(entry.roll)}:</strong> ${foundry.utils.escapeHTML(entry.loot)}</li>`).join("") : "<li>Nothing</li>";
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<div class="sw25-chat-card"><h3>${foundry.utils.escapeHTML(this.actor.name)} Loot</h3><p><strong>2d:</strong> ${total}</p><ul>${rows}</ul></div>`, rolls: [roll] });
    });

    html.find("[data-action='toggle-monster-reveal']").on("click", async event => {
      event.preventDefault();
      if (!game.user.isGM) return;
      const reveal = !Boolean(this.actor.system.revealed);
      const ownership = foundry.utils.deepClone(this.actor.ownership || {});
      ownership.default = reveal ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
      await this.actor.update({ "system.revealed": reveal, ownership });
      ui.notifications.info(reveal ? `${this.actor.name} is now readable by players.` : `${this.actor.name} is hidden from players.`);
    });

    const mutate = async (collection, callback) => {
      const list = foundry.utils.deepClone(Array.isArray(this.actor.system[collection]) ? this.actor.system[collection] : []);
      callback(list);
      await this.actor.update({ [`system.${collection}`]: list });
    };
    html.find("[data-action='add-monster-style']").on("click", event => { event.preventDefault(); return mutate("combatStyles", list => list.push({ style:"New Attack", accuracy:"0", damage:"2d", evasion:"0", defense:0, hp:{value:0,max:0}, mp:{value:0,max:0} })); });
    html.find("[data-action='delete-monster-style']").on("click", event => { event.preventDefault(); return mutate("combatStyles", list => list.splice(Number(event.currentTarget.dataset.index), 1)); });
    html.find("[data-action='add-monster-skill']").on("click", event => { event.preventDefault(); return mutate("uniqueSkills", list => list.push({ title:"New Ability", description:"" })); });
    html.find("[data-action='delete-monster-skill']").on("click", event => { event.preventDefault(); return mutate("uniqueSkills", list => list.splice(Number(event.currentTarget.dataset.index), 1)); });
    html.find("[data-action='add-monster-loot']").on("click", event => { event.preventDefault(); return mutate("lootTable", list => list.push({ roll:"2-12", loot:"New Loot" })); });
    html.find("[data-action='delete-monster-loot']").on("click", event => { event.preventDefault(); return mutate("lootTable", list => list.splice(Number(event.currentTarget.dataset.index), 1)); });
  }
}

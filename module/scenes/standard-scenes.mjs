const STANDARD_SCENES = [
  {
    name:"Combat A",
    width:1700,
    height:2200,
    src:"systems/sword-world-25/assets/maps/combat-a-map.png"
  },
  {
    name:"Combat B",
    width:3192,
    height:2242,
    src:"systems/sword-world-25/assets/maps/combat-b-map.jpg"
  }
];

export async function initializeStandardScenes() {
  if (!game.user.isGM) return;

  const created = [];
  const repaired = [];
  const applyBackground = async (document, scene) => {
    let level = document.firstLevel;
    if (!level) {
      [level] = await document.createEmbeddedDocuments("Level", [{
        name:"Ground",
        background:{ src:scene.src }
      }]);
    } else {
      await level.update({ "background.src":scene.src });
    }
    const thumbnail = await document.createThumbnail({ level });
    await document.update({
      width:scene.width,
      height:scene.height,
      padding:0,
      thumb:thumbnail.thumb
    });
  };

  for (const scene of STANDARD_SCENES) {
    const managed = game.scenes.find(candidate =>
      candidate.name.toLowerCase() === scene.name.toLowerCase() &&
      candidate.getFlag("sword-world-25", "standardCombatMap")
    );
    if (managed) {
      await applyBackground(managed, scene);
      repaired.push(scene.name);
      continue;
    }

    // Never overwrite a user's unrelated scene that happens to share the name.
    if (game.scenes.some(candidate => candidate.name.toLowerCase() === scene.name.toLowerCase())) continue;
    const [document] = await Scene.createDocuments([{
      name:scene.name,
      navigation:true,
      active:false,
      width:scene.width,
      height:scene.height,
      padding:0,
      levels:[{
        name:"Ground",
        background:{ src:scene.src }
      }],
      grid:{
        type:CONST.GRID_TYPES.GRIDLESS,
        size:100,
        distance:1,
        units:"m"
      },
      tokenVision:false,
      fogExploration:false,
      flags:{ "sword-world-25":{ standardCombatMap:true } }
    }]);
    if (document) {
      await applyBackground(document, scene);
      created.push(scene.name);
    }
  }

  if (created.length) ui.notifications.info(`Added ${created.join(" and ")} to the Scenes directory.`);
  else if (repaired.length && !game.settings.get("sword-world-25", "standardScenesCreated")) {
    ui.notifications.info(`Updated ${repaired.join(" and ")} with their bundled map images.`);
  }
  await game.settings.set("sword-world-25", "standardScenesCreated", true);
}

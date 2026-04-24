import { BattleEngine } from "./BattleEngine";
import { DialogManager } from "./managers/DialogManager";
import { RollManager } from "./managers/RollManager";
import { ActorManager } from "./managers/ActorManager";
import { StackDialog } from "./dialogs/StackDialog";

const MODULE_ID = "loa-battle-engine";

let engine: BattleEngine;

Hooks.once("init", () => {
  console.log("LOA Battle Engine | Initializing");

  const dialogManager = new DialogManager();
  const rollManager = new RollManager();
  const actorManager = new ActorManager();
  engine = BattleEngine.getInstance(dialogManager, rollManager, actorManager);
  dialogManager.register("stack", StackDialog, engine);
});

Hooks.once("ready", () => {
  console.log("LOA Battle Engine | Ready");

  loadTemplates(["modules/loa-battle-engine/templates/stack-dialog.hbs"]);

  engine.loadFromCombat();

  // API für Makros zugänglich machen
  (game.modules?.get(MODULE_ID) as any).api = engine;
});

Hooks.on("createCombat", () => {
  engine.initParticipants();
});

Hooks.on("updateCombat", (combat: Combat, changed: Record<string, unknown>) => {
  if (!("round" in changed)) return;
  engine.initParticipants();
});

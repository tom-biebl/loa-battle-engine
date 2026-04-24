import { BattleEngine } from "./BattleEngine";
import { DialogManager } from "./managers/DialogManager";
import { RollManager } from "./managers/RollManager";
import { ActorManager } from "./managers/ActorManager";
import { SpellManager } from "./managers/SpellManager";
import { StackDialog } from "./dialogs/StackDialog";
import { procReactionMacros } from "./utils/ReactionProc";
import "./styles/reaction-proc.scss";

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
  const mod = game.modules?.get(MODULE_ID) as any;
  mod.api = engine;
  mod.spells = SpellManager;

  // Socket-Handler
  game.socket?.on(`module.${MODULE_ID}`, async (data: any) => {
    // Reaction-Proc auf allen Clients animieren
    if (data.type === "procReactions") {
      procReactionMacros();
      return;
    }

    // GM-pflichtige Operationen — nur aktiver GM führt aus
    if (game.user !== (game.users as any)?.activeGM) return;

    if (data.type === "useAction") {
      await engine._useAction(data.action);
    } else if (data.type === "useBonusAction") {
      await engine._useBonusAction(data.bonusAction);
    } else if (data.type === "useReaction") {
      await engine._useReaction(data.reaction);
    } else if (data.type === "pushTokenAwayFrom") {
      await SpellManager._pushTokenAwayFromBy(data.tokenToMoveId, data.fromTokenId, data.distance);
    } else if (data.type === "applyEffect") {
      await SpellManager._applyEffect(data.targetTokenId, data.effectId);
    }
  });
});

Hooks.on("createCombat", () => {
  engine.initParticipants();
});

Hooks.on("updateCombat", (combat: Combat, changed: Record<string, unknown>) => {
  if ("round" in changed) {
    engine.initParticipants();
    return;
  }
  // Turn-Wechsel → Effekte des neuen aktiven Combatants ticken
  if ("turn" in changed) {
    engine.tickActiveEffects();
  }
  // Flag-Änderung → alle Clients synchronisieren
  if ((changed as any).flags?.["loa-battle-engine"]) {
    engine.loadFromCombat();
  }
});

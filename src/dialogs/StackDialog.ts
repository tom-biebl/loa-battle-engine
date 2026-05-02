import type { BattleEngine } from "../BattleEngine";
import "../styles/stack-dialog.scss";

const KIND_LABELS: Record<string, string> = {
  "action": "Aktion",
  "bonus-action": "Bonusaktion",
  "reaction": "Reaktion",
  "effect-apply": "Effect-Apply",
  "effect-tick": "Effect-Tick",
};

const SUBTYPE_LABELS: Record<string, string> = {
  "damage-roll": "AC-Wurf",
  "damage-fixed": "Auto-Hit",
  "damage-aoe": "AOE",
  "heal": "Heilung",
  "utility": "Utility",
  "movement": "Bewegung",
  "counter": "Counter",
  "interrupt": "Interrupt",
  "trigger-roll": "AC-Wurf (Reakt.)",
  "trigger-fixed": "Auto-Hit (Reakt.)",
  "dodge": "Dodge",
  "block": "Block",
};

const ROLL_MODE_LABELS: Record<string, string> = {
  "normal": "Normal",
  "advantage": "Vorteil",
  "disadvantage": "Nachteil",
};

const ROLL_MODE_CYCLE: Record<string, "normal" | "advantage" | "disadvantage"> = {
  "normal": "advantage",
  "advantage": "disadvantage",
  "disadvantage": "normal",
};

// Subtypes mit AC-Wurf — nur die brauchen einen Roll-Mode-Button
const AC_ROLL_SUBTYPES = new Set(["damage-roll", "trigger-roll"]);

export class StackDialog extends Application {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    super();
    this.engine = engine;
  }

  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "loa-stack-dialog",
      title: "Battle Stack",
      template: "modules/loa-battle-engine/templates/stack-dialog.hbs",
      width: 640,
      height: "auto",
      resizable: true,
    });
  }

  // Nur GM darf den Stack sehen
  override render(force = false, options = {}): this {
    if (!game.user?.isGM) return this;
    return super.render(force, options);
  }

  override getData(): object {
    return {
      stack: this.engine.getStack().map((item, index) => {
        const actorName = game.actors?.get(item.actorId)?.name ?? "?";
        const targetName = item.targetTokenId
          ? canvas?.tokens?.get(item.targetTokenId)?.name ?? "?"
          : null;
        const anyItem = item as any;
        const subtype = anyItem.subtype ?? "";
        const rollMode = (anyItem.rollMode ?? "normal") as "normal" | "advantage" | "disadvantage";
        return {
          ...item,
          index,
          kindLabel: KIND_LABELS[item.kind] ?? item.kind,
          subtypeLabel: SUBTYPE_LABELS[subtype] ?? subtype,
          actorDisplay: `${actorName} (${item.actorId})`,
          targetDisplay: targetName ? `${targetName} (${item.targetTokenId})` : "—",
          canRollMode: AC_ROLL_SUBTYPES.has(subtype),
          rollModeLabel: ROLL_MODE_LABELS[rollMode],
          rollModeClass: `stack-rollmode--${rollMode}`,
        };
      }),
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find(".stack-item__delete").on("click", (e) => {
      const index = Number($(e.currentTarget).data("index"));
      this.engine.removeFromStack(index);
      this.render(false);
    });

    html.find(".stack-item__rollmode").on("click", async (e) => {
      const index = Number($(e.currentTarget).attr("data-index"));
      const current = ($(e.currentTarget).attr("data-mode") as string) ?? "normal";
      const next = ROLL_MODE_CYCLE[current] ?? "normal";
      await this.engine.setRollMode(index, next);
    });

    html.find(".btn-resolve").on("click", async () => {
      await this.engine.resolveStack();
    });

    html.find(".btn-cancel").on("click", () => {
      this.engine.clearStack();
      this.close();
    });
  }
}

import type { BattleEngine } from "../BattleEngine";
import "../styles/stack-dialog.scss";

const KIND_LABELS: Record<string, string> = {
  "action": "Aktion",
  "bonus-action": "Bonusaktion",
  "reaction": "Reaktion",
};

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
      width: 480,
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
      stack: this.engine.getStack().map((item, index) => ({
        ...item,
        index,
        kindLabel: KIND_LABELS[item.kind] ?? item.kind,
      })),
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find(".stack-item__delete").on("click", (e) => {
      const index = Number($(e.currentTarget).data("index"));
      this.engine.removeFromStack(index);
      this.render(false);
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

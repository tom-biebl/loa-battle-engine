export type ResourceType = "action" | "bonusAction" | "reaction";

const MESSAGES: Record<ResourceType, string> = {
  action: "Keine Aktion mehr in dieser Runde.",
  bonusAction: "Keine Bonusaktion mehr in dieser Runde.",
  reaction: "Keine Reaktion mehr in dieser Runde.",
};

export class NoRessourceLeftDialog extends Application {
  private resourceType: ResourceType;

  constructor(resourceType: ResourceType) {
    super();
    this.resourceType = resourceType;
  }

  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "loa-no-resource-dialog",
      title: "Ressource aufgebraucht",
      width: 300,
      height: "auto",
    });
  }

  override async _renderInner(_data: object): Promise<JQuery> {
    return $(`<p style="padding: 8px">${MESSAGES[this.resourceType]}</p>`);
  }

  static show(resourceType: ResourceType): void {
    new NoRessourceLeftDialog(resourceType).render(true);
  }
}

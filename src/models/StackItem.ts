export type DamageType =
    | "physical"
    | "arcane"
    | "fire"
    | "earth"
    | "shadow"
    | "light"
    | "frost"
    | "blood"
    | "psychic"
    | "nature";

export type AttributeKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type SavingThrow = {
    formula: string;
    modifier: AttributeKey;
};

// --- Spell Effects ---

export type DotEffectType = "poison" | "burning" | "bleeding";
export type StatusEffectType = "stunned" | "slowed" | "prone";

export type DotEffect = {
    effectType: DotEffectType;
    effectDuration: number;
    damageFormulaPerRound: string;
    damageType: DamageType;
    effectIconId: string;
    name: string;
};

export type StatusEffect = {
    effectType: StatusEffectType;
    effectDuration: number;
    effectIconId: string;
    name: string;
};

export type SpellEffect = DotEffect | StatusEffect;

// Schaden der noch gewürfelt werden muss
export type RollableDamageFrame = {
    damageFormula: string;
    damageType: DamageType;
    resolvedAmount?: number;
};

// Schaden der bereits feststeht
export type FixedDamageFrame = {
    damageType: DamageType;
    resolvedAmount: number;
};

type StackItemBase = {
    id: string;
    name: string;
    // tokenId als primärer Identifier — deckt Linked und Unlinked (Synthetic Actors) ab
    tokenId: string;
    // actorId des Basis-Actors — nur für Linked Tokens zuverlässig
    actorId: string;
    targetTokenId?: string;
    targetActorId?: string;
    // Position im Stack bestimmt die Auflösungsreihenfolge (LIFO)
    stackIndex: number;
    status: "pending" | "resolved" | "countered";
    savingThrow?: SavingThrow;
    // Optional: an einen Spell angehängter Effekt (Gift, Brand, etc.)
    spellEffect?: SpellEffect;
};

// --- Action ---

type DamageRollAction = StackItemBase & {
    kind: "action";
    subtype: "damage-roll";
    acModifier: AttributeKey;
    damageFrame: RollableDamageFrame;
    consumes?: Item;
};

type DamageFixedAction = StackItemBase & {
    kind: "action";
    subtype: "damage-fixed";
    acModifier: AttributeKey;
    damageFrame: FixedDamageFrame;
    consumes?: Item;
};

type UtilityAction = StackItemBase & {
    kind: "action";
    subtype: "utility";
    acModifier: AttributeKey;
    dc: number;
    consumes?: Item;
    hasToBeRolled: boolean;
    
};

export type Action = DamageRollAction | DamageFixedAction | UtilityAction;

// --- BonusAction ---

type DamageRollBonusAction = StackItemBase & {
    kind: "bonus-action";
    subtype: "damage-roll";
    acModifier: AttributeKey;
    damageFrame: RollableDamageFrame;
    consumes?: Item;
};

type DamageFixedBonusAction = StackItemBase & {
    kind: "bonus-action";
    subtype: "damage-fixed";
    acModifier: AttributeKey;
    damageFrame: FixedDamageFrame;
    consumes?: Item;
};

type UtilityBonusAction = StackItemBase & {
    kind: "bonus-action";
    subtype: "utility";
    acModifier: AttributeKey;
    dc: number;
    consumes?: Item;
};

type MovementBonusAction = StackItemBase & {
    kind: "bonus-action";
    subtype: "movement";
    distance: number;
    destination?: { x: number; y: number };
};

export type BonusAction = DamageRollBonusAction | DamageFixedBonusAction | UtilityBonusAction | MovementBonusAction;

// --- Reaction ---

type CounterReaction = StackItemBase & {
    kind: "reaction";
    subtype: "counter";
    triggerItemId: string;
    consumes?: Item;
};

type InterruptReaction = StackItemBase & {
    kind: "reaction";
    subtype: "interrupt";
    triggerItemId: string;
    consumes?: Item;
};

type TriggerRollReaction = StackItemBase & {
    kind: "reaction";
    subtype: "trigger-roll";
    acModifier: AttributeKey;
    triggerItemId: string;
    damageFrame: RollableDamageFrame;
    consumes?: Item;
};

type TriggerFixedReaction = StackItemBase & {
    kind: "reaction";
    subtype: "trigger-fixed";
    acModifier: AttributeKey;
    triggerItemId: string;
    damageFrame: FixedDamageFrame;
    consumes?: Item;
};

export type Reaction = CounterReaction | InterruptReaction | TriggerRollReaction | TriggerFixedReaction;

// --- Effect Stack Items ---

type EffectApply = StackItemBase & {
    kind: "effect-apply";
    effect: SpellEffect;
};

type EffectTick = StackItemBase & {
    kind: "effect-tick";
    effect: SpellEffect;
};

export type StackItem = Action | BonusAction | Reaction | EffectApply | EffectTick;

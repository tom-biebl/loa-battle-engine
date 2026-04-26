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

// --- Resource Costs ---

// Beschreibt eine Änderung an einem CSB-Actor-Prop (z.B. -1 pc_default_bullets, +1 resonance_points_amount).
// Wird IMMER angewendet (Treffer oder nicht) — analog zur Action-Ressource.
export type ResourceCost = {
    propKey: string;       // Key in actor.system.props
    operator: "+" | "-";
    amount: number;
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

// --- Animations & Sound ---

export type SoundConfig = {
    file: string;
    volume?: number;
};

export type AnimationConfig = {
    file: string;
    scale?: number;
    belowTokens?: boolean;
    fadeOut?: number;
    sound?: SoundConfig;
};

// Projektil-Varianten je nach Entfernung (mindestens eine muss gesetzt sein)
export type ProjectileAnimationConfig = {
    "5ft"?: string;
    "15ft"?: string;
    "30ft"?: string;
    "60ft"?: string;
    "90ft"?: string;
    scale?: number;
    sound?: SoundConfig;
};

export type SpellAnimations = {
    caster?: AnimationConfig;     // auf Caster-Token
    projectile?: ProjectileAnimationConfig;  // Caster → Target
    target?: AnimationConfig;     // auf Target-Token / AOE-Zentrum
    sound?: SoundConfig;          // globaler Cast-Sound
};

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
    // Optional: Animationen die beim Resolve abgespielt werden
    animations?: SpellAnimations;
    // Optional: Caster wird auf Resolve vom Target/AOE-Center weggestoßen (Rückstoß)
    pushSelf?: { distance: number };
    // Optional: Target(s) werden auf Resolve vom Caster/AOE-Center weggestoßen
    pushTarget?: { distance: number };
    // Optional: CSB-Actor-Prop-Änderungen, werden bei Cast IMMER angewendet (Hit oder nicht)
    resourceCosts?: ResourceCost[];
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

type DamageAOEAction = StackItemBase & {
    kind: "action";
    subtype: "damage-aoe";
    damageFrame: RollableDamageFrame;
    affectedTokenIds: string[];
    aoeCenter: { x: number; y: number };
    aoeRadius: number; // in Fuß
    consumes?: Item;
};

export type Action = DamageRollAction | DamageFixedAction | UtilityAction | DamageAOEAction;

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

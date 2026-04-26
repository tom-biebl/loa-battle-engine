import { Action, AttributeKey, BonusAction, DamageType, ResourceCost, SpellAnimations, SpellEffect } from "../models/StackItem";
import { BattleEngine } from "../BattleEngine";
import { Notifications } from "../utils/Notifications";
import { pickAOELocation } from "../utils/AOEPicker";
import { pushTokenAwayFrom } from "../utils/TokenMovement";

const MODULE_ID = "loa-battle-engine";

type AttackKind = "action" | "bonus-action";

type PushOpt = { distance: number };

type MeleeOptions = {
    name: string;
    damageFormula: string;
    acModifier?: AttributeKey;
    damageType?: DamageType;
    kind?: AttackKind;
    spellEffect?: SpellEffect;
    animations?: SpellAnimations;
    pushSelf?: PushOpt;     // Caster wird auf Resolve weggestoßen
    pushTarget?: PushOpt;   // Target wird auf Resolve weggestoßen
    resourceCosts?: ResourceCost[];
};

type RangedOptions = {
    name: string;
    damageFormula: string;
    acModifier?: AttributeKey;
    damageType?: DamageType;
    kind?: AttackKind;
    spellEffect?: SpellEffect;
    animations?: SpellAnimations;
    pushSelf?: PushOpt;
    pushTarget?: PushOpt;
    resourceCosts?: ResourceCost[];
};

type TargetSpellOptions = {
    name: string;
    damageFormula: string;
    acModifier: AttributeKey;
    damageType: DamageType;
    kind?: AttackKind;
    spellEffect?: SpellEffect;
    animations?: SpellAnimations;
    pushSelf?: PushOpt;
    pushTarget?: PushOpt;
    resourceCosts?: ResourceCost[];
};

type AOESpellOptions = {
    name: string;
    damageFormula: string;
    damageType: DamageType;
    radius: number; // in Fuß
    spellEffect?: SpellEffect;
    animations?: SpellAnimations;
    pushSelf?: PushOpt;
    pushTarget?: PushOpt;
    resourceCosts?: ResourceCost[];
};

type Context = {
    tokenId: string;
    actorId: string;
    targetTokenId: string | undefined;
    engine: BattleEngine;
};

export class SpellManager {

    private static getContext(): Context | null {
        const token = canvas?.tokens?.controlled[0];
        if (!token) {
            Notifications.error("Kein Token ausgewählt!");
            return null;
        }
        if (!token.actor) {
            Notifications.error("Token hat keinen Actor!");
            return null;
        }

        const engine = (game.modules?.get(MODULE_ID) as any)?.api as BattleEngine | undefined;
        if (!engine) {
            Notifications.error("Battle Engine nicht geladen!");
            return null;
        }

        const target = [...(game.user?.targets ?? [])][0];
        return {
            tokenId: token.id,
            actorId: token.actor.id as string,
            targetTokenId: target?.id,
            engine,
        };
    }

    private static buildDamageRoll(
        ctx: Context,
        name: string,
        damageFormula: string,
        damageType: DamageType,
        acModifier: AttributeKey,
        kind: AttackKind,
        spellEffect?: SpellEffect,
        animations?: SpellAnimations,
        pushSelf?: PushOpt,
        pushTarget?: PushOpt,
        resourceCosts?: ResourceCost[],
    ): Action | BonusAction {
        return {
            id: foundry.utils.randomID(),
            kind,
            subtype: "damage-roll",
            name,
            tokenId: ctx.tokenId,
            actorId: ctx.actorId,
            targetTokenId: ctx.targetTokenId,
            acModifier,
            damageFrame: { damageFormula, damageType },
            stackIndex: Date.now(),
            status: "pending",
            spellEffect,
            animations,
            pushSelf,
            pushTarget,
            resourceCosts,
        } as Action | BonusAction;
    }

    private static async dispatch(item: Action | BonusAction, engine: BattleEngine): Promise<void> {
        if (item.kind === "bonus-action") {
            await engine.useBonusAction(item as BonusAction);
        } else {
            await engine.useAction(item as Action);
        }
    }

    // Nahkampf-Angriff — Default: Stärke, physisch, Action
    static async doMeleeAttack(opts: MeleeOptions): Promise<void> {
        const ctx = this.getContext();
        if (!ctx) return;

        const item = this.buildDamageRoll(
            ctx,
            opts.name,
            opts.damageFormula,
            opts.damageType ?? "physical",
            opts.acModifier ?? "str",
            opts.kind ?? "action",
            opts.spellEffect,
            opts.animations,
            opts.pushSelf,
            opts.pushTarget,
            opts.resourceCosts,
        );
        await this.dispatch(item, ctx.engine);
    }

    // Fernkampf-Angriff — Default: Geschicklichkeit, physisch, Action
    static async doRangedAttack(opts: RangedOptions): Promise<void> {
        const ctx = this.getContext();
        if (!ctx) return;

        const item = this.buildDamageRoll(
            ctx,
            opts.name,
            opts.damageFormula,
            opts.damageType ?? "physical",
            opts.acModifier ?? "dex",
            opts.kind ?? "action",
            opts.spellEffect,
            opts.animations,
            opts.pushSelf,
            opts.pushTarget,
            opts.resourceCosts,
        );
        await this.dispatch(item, ctx.engine);
    }

    // Einzelziel-Zauber — acModifier und damageType müssen gesetzt sein
    static async castTargetSpell(opts: TargetSpellOptions): Promise<void> {
        const ctx = this.getContext();
        if (!ctx) return;

        const item = this.buildDamageRoll(
            ctx,
            opts.name,
            opts.damageFormula,
            opts.damageType,
            opts.acModifier,
            opts.kind ?? "action",
            opts.spellEffect,
            opts.animations,
            opts.pushSelf,
            opts.pushTarget,
            opts.resourceCosts,
        );
        await this.dispatch(item, ctx.engine);
    }

    // AOE-Zauber — Player wählt Position per Cursor mit Radius-Kreis,
    // alle Tokens im Radius werden getroffen.
    static async castAOESpell(opts: AOESpellOptions): Promise<void> {
        const ctx = this.getContext();
        if (!ctx) return;

        Notifications.info(`Position für ${opts.name} wählen (Linksklick) — Rechtsklick zum Abbrechen`);
        const placement = await pickAOELocation(opts.radius);
        if (!placement) {
            Notifications.info("AOE abgebrochen.");
            return;
        }
        if (placement.affectedTokenIds.length === 0) {
            Notifications.warn("Keine Tokens im Radius getroffen.");
            return;
        }

        const item: Action = {
            id: foundry.utils.randomID(),
            kind: "action",
            subtype: "damage-aoe",
            name: opts.name,
            tokenId: ctx.tokenId,
            actorId: ctx.actorId,
            targetTokenId: undefined,
            damageFrame: { damageFormula: opts.damageFormula, damageType: opts.damageType },
            affectedTokenIds: placement.affectedTokenIds,
            aoeCenter: { x: placement.x, y: placement.y },
            aoeRadius: opts.radius,
            stackIndex: Date.now(),
            status: "pending",
            spellEffect: opts.spellEffect,
            animations: opts.animations,
            pushSelf: opts.pushSelf,
            pushTarget: opts.pushTarget,
            resourceCosts: opts.resourceCosts,
        } as Action;

        await ctx.engine.useAction(item);
    }

    // --- Bewegung / Effekte ---

    // Rückstoß — eigener Token wird vom Target weggestoßen (distance in Grid-Zellen)
    static async pushTokenBack(opts: { distance: number }): Promise<void> {
        const token = canvas?.tokens?.controlled[0];
        const target = [...(game.user?.targets ?? [])][0];
        if (!token) { Notifications.error("Kein Token ausgewählt!"); return; }
        if (!target) { Notifications.error("Kein Target als Richtungsreferenz!"); return; }

        // Eigener Token — Spieler hat Permission, direkt bewegen
        await pushTokenAwayFrom(token.id, { tokenId: target.id }, opts.distance);
    }

    // Stoß — Target wird vom eigenen Token weggestoßen (distance in Grid-Zellen)
    static async pushTargetBack(opts: { distance: number }): Promise<void> {
        const token = canvas?.tokens?.controlled[0];
        const target = [...(game.user?.targets ?? [])][0];
        if (!token) { Notifications.error("Kein Token ausgewählt!"); return; }
        if (!target) { Notifications.error("Kein Target!"); return; }

        if (game.user?.isGM) {
            await pushTokenAwayFrom(target.id, { tokenId: token.id }, opts.distance);
        } else {
            game.socket?.emit("module.loa-battle-engine", {
                type: "pushTokenAwayFrom",
                tokenToMoveId: target.id,
                fromTokenId: token.id,
                distance: opts.distance,
            });
        }
    }

    // Status-Effect (Foundry-Standard-Icon) auf Target anwenden
    static async applyEffectOnTarget(opts: { effectId: string }): Promise<void> {
        const target = [...(game.user?.targets ?? [])][0];
        if (!target?.actor) { Notifications.error("Kein Target mit Actor!"); return; }

        if (game.user?.isGM) {
            await this._applyEffect(target.id, opts.effectId);
        } else {
            game.socket?.emit("module.loa-battle-engine", {
                type: "applyEffect",
                targetTokenId: target.id,
                effectId: opts.effectId,
            });
        }
    }

    // Teleportiere eigenen Token auf Pixel-Koordinaten (wird auf Grid gesnappt)
    static async teleportPlayerTo(opts: { x: number; y: number }): Promise<void> {
        const token = canvas?.tokens?.controlled[0];
        if (!token) { Notifications.error("Kein Token ausgewählt!"); return; }

        const gridSize = canvas?.grid?.size ?? 100;
        const x = Math.round(opts.x / gridSize) * gridSize;
        const y = Math.round(opts.y / gridSize) * gridSize;

        if (!this.isInBounds(x, y)) {
            Notifications.error("Ziel-Koordinaten außerhalb der Map!");
            return;
        }
        await (token.document as any).update({ x, y });
    }

    // --- Socket-Callable Internals ---

    static async _pushTokenAwayFromBy(tokenToMoveId: string, fromTokenId: string, distance: number): Promise<void> {
        await pushTokenAwayFrom(tokenToMoveId, { tokenId: fromTokenId }, distance);
    }

    static async _applyEffect(targetTokenId: string, effectId: string): Promise<void> {
        const target = canvas?.tokens?.get(targetTokenId);
        if (!target?.actor) return;
        await (target.actor as any).toggleStatusEffect(effectId, { active: true });
    }

    // --- Private Helpers ---

    private static isInBounds(x: number, y: number): boolean {
        const scene = canvas?.scene;
        const dims = (scene as any)?.dimensions;
        if (!dims) return false;
        const gridSize = canvas?.grid?.size ?? 100;
        return x >= 0 && y >= 0 && x + gridSize <= dims.width && y + gridSize <= dims.height;
    }
}

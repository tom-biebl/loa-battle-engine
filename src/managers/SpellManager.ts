import { Action, AttributeKey, BonusAction, DamageType } from "../models/StackItem";
import { BattleEngine } from "../BattleEngine";
import { Notifications } from "../utils/Notifications";

const MODULE_ID = "loa-battle-engine";

type AttackKind = "action" | "bonus-action";

type MeleeOptions = {
    name: string;
    damageFormula: string;
    acModifier?: AttributeKey;
    damageType?: DamageType;
    kind?: AttackKind;
};

type RangedOptions = {
    name: string;
    damageFormula: string;
    acModifier?: AttributeKey;
    damageType?: DamageType;
    kind?: AttackKind;
};

type TargetSpellOptions = {
    name: string;
    damageFormula: string;
    acModifier: AttributeKey;
    damageType: DamageType;
    kind?: AttackKind;
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
        );
        await this.dispatch(item, ctx.engine);
    }
}

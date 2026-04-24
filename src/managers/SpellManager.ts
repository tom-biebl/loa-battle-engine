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

    // --- Bewegung / Effekte ---

    // Rückstoß — eigener Token wird vom Target weggestoßen (distance in Grid-Zellen)
    static async pushTokenBack(opts: { distance: number }): Promise<void> {
        const token = canvas?.tokens?.controlled[0];
        const target = [...(game.user?.targets ?? [])][0];
        if (!token) { Notifications.error("Kein Token ausgewählt!"); return; }
        if (!target) { Notifications.error("Kein Target als Richtungsreferenz!"); return; }

        // Eigener Token — Spieler hat Permission, direkt bewegen
        await this.pushTokenAwayFrom(token, target, opts.distance);
    }

    // Stoß — Target wird vom eigenen Token weggestoßen (distance in Grid-Zellen)
    static async pushTargetBack(opts: { distance: number }): Promise<void> {
        const token = canvas?.tokens?.controlled[0];
        const target = [...(game.user?.targets ?? [])][0];
        if (!token) { Notifications.error("Kein Token ausgewählt!"); return; }
        if (!target) { Notifications.error("Kein Target!"); return; }

        if (game.user?.isGM) {
            await this.pushTokenAwayFrom(target, token, opts.distance);
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
        const tokenToMove = canvas?.tokens?.get(tokenToMoveId);
        const fromToken = canvas?.tokens?.get(fromTokenId);
        if (!tokenToMove || !fromToken) return;
        await this.pushTokenAwayFrom(tokenToMove, fromToken, distance);
    }

    static async _applyEffect(targetTokenId: string, effectId: string): Promise<void> {
        const target = canvas?.tokens?.get(targetTokenId);
        if (!target?.actor) return;
        await (target.actor as any).toggleStatusEffect(effectId, { active: true });
    }

    // --- Private Helpers ---

    // Bewegt tokenToMove weg von fromToken (Richtung: fromToken → tokenToMove, dann weiter)
    // Stoppt bei Map-Grenze oder Kollision mit anderem Token.
    private static async pushTokenAwayFrom(tokenToMove: any, fromToken: any, distance: number): Promise<void> {
        const gridSize = canvas?.grid?.size ?? 100;

        const angle = Math.atan2(tokenToMove.y - fromToken.y, tokenToMove.x - fromToken.x);
        const dx = Math.round(Math.cos(angle));
        const dy = Math.round(Math.sin(angle));
        if (dx === 0 && dy === 0) return;

        let finalX = tokenToMove.x;
        let finalY = tokenToMove.y;

        for (let i = 1; i <= distance; i++) {
            const testX = tokenToMove.x + dx * gridSize * i;
            const testY = tokenToMove.y + dy * gridSize * i;

            if (!this.isInBounds(testX, testY)) break;
            if (this.hasTokenAt(testX, testY, tokenToMove.id)) break;

            finalX = testX;
            finalY = testY;
        }

        if (finalX !== tokenToMove.x || finalY !== tokenToMove.y) {
            await tokenToMove.document.update({ x: finalX, y: finalY });
        }
    }

    private static isInBounds(x: number, y: number): boolean {
        const scene = canvas?.scene;
        const dims = (scene as any)?.dimensions;
        if (!dims) return false;
        const gridSize = canvas?.grid?.size ?? 100;
        return x >= 0 && y >= 0 && x + gridSize <= dims.width && y + gridSize <= dims.height;
    }

    private static hasTokenAt(x: number, y: number, excludeTokenId: string): boolean {
        const gridSize = canvas?.grid?.size ?? 100;
        const tokens = canvas?.tokens?.placeables ?? [];
        return tokens.some((t: any) => {
            if (t.id === excludeTokenId) return false;
            const w = (t.document?.width ?? 1) * gridSize;
            const h = (t.document?.height ?? 1) * gridSize;
            return x >= t.x && x < t.x + w && y >= t.y && y < t.y + h;
        });
    }
}

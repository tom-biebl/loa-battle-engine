import { Action, AttributeKey, BonusAction, FixedDamageFrame, Reaction, RollableDamageFrame, StackItem } from "./models/StackItem";
import { ActionResources } from "./models/ActionResources";
import { DialogManager } from "./managers/DialogManager";
import { NoRessourceLeftDialog } from "./dialogs/NoRessourceLeftDialog";
import { RollManager } from "./managers/RollManager";
import { Notifications } from "./utils/Notifications";
import { ActorManager } from "./managers/ActorManager";
import { ChatManager } from "./managers/ChatManager";

const MODULE_ID = "loa-battle-engine";
const STACK_FLAG_KEY = "stack";
const PARTICIPANTS_FLAG_KEY = "participants";

declare global {
    interface FlagConfig {
        Combat: {
            "loa-battle-engine": {
                stack?: StackItem[];
                participants?: Record<string, ActionResources>;
            };
        };
    }
}

export class BattleEngine {
    private stack: StackItem[] = [];
    private participants: Map<string, ActionResources> = new Map();
    private static _instance: BattleEngine;
    private readonly dialogManager: DialogManager;
    private readonly rollManager: RollManager;
    private readonly actorManager: ActorManager;

    private constructor(dialogManager: DialogManager, rollManager: RollManager, actorManager: ActorManager) {
        this.dialogManager = dialogManager;
        this.rollManager = rollManager;
        this.actorManager = actorManager;
    }

    public static getInstance(dialogManager: DialogManager, rollManager: RollManager, actorManager: ActorManager): BattleEngine {
        if (!this._instance) {
            this._instance = new BattleEngine(dialogManager, rollManager, actorManager);
        }
        return this._instance;
    }

    // --- Public API ---

    public async useAction(action: Action): Promise<void> {
        if (!game.combat) return;

        const participant = this.getParticipant(action.actorId);
        if (!participant) return;

        if (!participant.hasAction) {
            NoRessourceLeftDialog.show("action");
            return;
        }

        participant.hasAction = false;
        this.persistParticipants();

        switch (action.subtype) {
            case "damage-roll": {
                const hit = await this.performAcRoll(action.tokenId, action.targetTokenId, action.acModifier, action.name);
                if (!hit) return;
                break;
            }
            case "damage-fixed": {
                if (!action.targetTokenId) {
                    Notifications.error("Kein Target selektiert!");
                    return;
                }
                break;
            }
            case "utility": {
                if (action.hasToBeRolled) {
                    const passed = await this.performDcRoll(action.tokenId, action.acModifier, action.dc, action.name);
                    if (!passed) return;
                }
                break;
            }
            default:
                console.error("Unbekannter action.subtype.");
                return;
        }

        this.pushItemToStack(action);
        this.dialogManager.open("stack");
    }

    public async useBonusAction(bonusAction: BonusAction): Promise<void> {
        if (!game.combat) return;

        const participant = this.getParticipant(bonusAction.actorId);
        if (!participant) return;

        if (!participant.hasBonusAction) {
            NoRessourceLeftDialog.show("bonusAction");
            return;
        }

        participant.hasBonusAction = false;
        this.persistParticipants();

        switch (bonusAction.subtype) {
            case "damage-roll": {
                const hit = await this.performAcRoll(bonusAction.tokenId, bonusAction.targetTokenId, bonusAction.acModifier, bonusAction.name);
                if (!hit) return;
                break;
            }
            case "damage-fixed": {
                if (!bonusAction.targetTokenId) {
                    Notifications.error("Kein Target selektiert!");
                    return;
                }
                break;
            }
            case "utility": {
                const passed = await this.performDcRoll(bonusAction.tokenId, bonusAction.acModifier, bonusAction.dc, bonusAction.name);
                if (!passed) return;
                break;
            }
            case "movement":
                break;
            default:
                console.error("Unbekannter bonusAction.subtype.");
                return;
        }

        this.pushItemToStack(bonusAction);
        this.dialogManager.refresh("stack");
    }

    public async useReaction(reaction: Reaction): Promise<void> {
        if (!game.combat) return;

        const participant = this.getParticipant(reaction.actorId);
        if (!participant) return;

        if (!participant.hasReaction) {
            NoRessourceLeftDialog.show("reaction");
            return;
        }

        participant.hasReaction = false;
        this.persistParticipants();

        switch (reaction.subtype) {
            case "counter":
            case "interrupt":
                break;
            case "trigger-roll": {
                const hit = await this.performAcRoll(reaction.tokenId, reaction.targetTokenId, reaction.acModifier, reaction.name);
                if (!hit) return;
                break;
            }
            case "trigger-fixed": {
                if (!reaction.targetTokenId) {
                    Notifications.error("Kein Target selektiert!");
                    return;
                }
                break;
            }
            default:
                console.error("Unbekannter reaction.subtype.");
                return;
        }

        this.pushItemToStack(reaction);
        this.dialogManager.refresh("stack");
    }

    public getStack(): readonly StackItem[] {
        return this.stack;
    }

    public removeFromStack(index: number): void {
        this.stack.splice(index, 1);
        this.persistStack();
    }

    public clearStack(): void {
        this.stack = [];
        this.persistStack();
    }

    public async resolveStack(): Promise<void> {
        if (this.stack.length === 0) return;

        const sorted = [...this.stack].sort((a, b) => b.stackIndex - a.stackIndex);

        // Pass 1 (LIFO): Counter-Checks — jedes Counter-Item cancelt gezielt sein triggerItemId
        for (const item of sorted) {
            if (item.kind !== "reaction" || item.subtype !== "counter") continue;
            if (item.status !== "pending") continue;

            const targeted = sorted.find(i => i.id === item.triggerItemId && i.status === "pending");
            if (!targeted) continue;

            targeted.status = "countered";
            item.status = "resolved";
            await ChatManager.countered(targeted.name);
        }

        // Pass 2 (LIFO): Damage-Resolution aller verbleibenden pending Items
        for (const item of sorted) {
            if (item.status !== "pending") continue;
            await this.resolveStackItem(item, sorted);
            item.status = "resolved";
        }

        this.clearStack();
        this.dialogManager.refresh("stack");
    }

    private async resolveStackItem(item: StackItem, sorted: StackItem[]): Promise<void> {
        switch (item.kind) {
            case "action":
            case "bonus-action":
                if (item.subtype === "damage-roll" || item.subtype === "damage-fixed") {
                    if (!item.targetTokenId) return;
                    await this.applyDamageFromFrame(item.tokenId, item.targetTokenId, item.damageFrame, item.name);
                }
                break;

            case "reaction":
                switch (item.subtype) {
                    case "trigger-roll":
                    case "trigger-fixed": {
                        const trigger = sorted.find(i => i.id === item.triggerItemId);
                        if (!trigger) return;
                        await this.applyDamageFromFrame(item.tokenId, trigger.tokenId, item.damageFrame, item.name);
                        break;
                    }
                    case "interrupt":
                        // Effekte — später
                        break;
                    case "counter":
                        // Bereits in Pass 1 behandelt
                        break;
                }
                break;
        }
    }

    private async applyDamageFromFrame(
        attackerTokenId: string,
        targetTokenId: string,
        damageFrame: RollableDamageFrame | FixedDamageFrame,
        name: string
    ): Promise<void> {
        const rawDamage = "damageFormula" in damageFrame
            ? await this.rollManager.roll(damageFrame.damageFormula, attackerTokenId)
            : damageFrame.resolvedAmount;

        const reduction = this.actorManager.getArmorDamageReduction(targetTokenId) ?? 0;
        const finalDamage = Math.max(0, rawDamage - reduction);

        await ChatManager.damage(name, rawDamage, finalDamage, damageFrame.damageType, this.getTokenName(targetTokenId));
        await this.actorManager.applyDamage(targetTokenId, finalDamage);
    }

    public async loadFromCombat(): Promise<void> {
        const combat = game.combat;
        if (!combat) return;

        const persistedStack = combat.getFlag(MODULE_ID, STACK_FLAG_KEY) as StackItem[] | undefined;
        this.stack = persistedStack ?? [];

        const persistedParticipants = combat.getFlag(MODULE_ID, PARTICIPANTS_FLAG_KEY) as Record<string, ActionResources> | undefined;
        this.participants = persistedParticipants
            ? new Map(Object.entries(persistedParticipants))
            : new Map();
    }

    public initParticipants(): void {
        const combat = game.combat;
        if (!combat) return;

        this.participants.clear();

        for (const combatant of combat.combatants) {
            if (!combatant.actorId) continue;
            this.participants.set(combatant.actorId, {
                hasAction: true,
                hasBonusAction: true,
                hasReaction: true,
            });
        }

        this.persistParticipants();
    }

    // --- Private Helpers ---

    private getParticipant(actorId: string): ActionResources | null {
        const participant = this.participants.get(actorId);
        if (!participant) {
            console.error(`Kein Participant fuer ActorID: ${actorId} gefunden.`);
            return null;
        }
        return participant;
    }

    // Führt einen AC-Wurf durch und schickt Hit/Miss in den Chat. Gibt true bei Treffer zurück.
    private async performAcRoll(tokenId: string, targetTokenId: string | undefined, acModifier: AttributeKey, actionName: string): Promise<boolean> {
        if (!targetTokenId) {
            Notifications.error("Kein Target selektiert!");
            return false;
        }

        const targetAC = this.actorManager.getArmorClass(targetTokenId);
        if (!targetAC) {
            Notifications.error(`Keine AC für Token ${targetTokenId} gefunden.`);
            return false;
        }

        const modifier = this.resolveModifier(tokenId, acModifier);
        if (modifier === null) return false;

        const roll = await this.rollManager.roll("d20", tokenId, modifier);
        const targetName = this.getTokenName(targetTokenId);

        if (roll < targetAC) {
            await ChatManager.miss(actionName, roll, targetName);
            return false;
        }

        await ChatManager.hit(actionName, roll, targetName);
        return true;
    }

    // Führt einen DC-Wurf durch und schickt Miss in den Chat bei Misserfolg. Gibt true bei Erfolg zurück.
    private async performDcRoll(tokenId: string, acModifier: AttributeKey, dc: number, actionName: string): Promise<boolean> {
        const modifier = this.resolveModifier(tokenId, acModifier);
        if (modifier === null) return false;

        const roll = await this.rollManager.roll("d20", tokenId, modifier);
        if (roll < dc) {
            await ChatManager.miss(actionName, roll, `DC ${dc}`);
            return false;
        }
        return true;
    }

    // Liest Bonus und Malus eines Attributs und gibt den kombinierten Modifier zurück.
    private resolveModifier(tokenId: string, attr: AttributeKey): number | null {
        const bonus = this.actorManager.getAttributeBonus(tokenId, attr);
        const malus = this.actorManager.getAttributeMalus(tokenId, attr);

        if (bonus === undefined) {
            Notifications.error(`${tokenId} hat kein Attributs-Bonus-Feld für "${attr}"!`);
            return null;
        }
        if (malus === undefined) {
            Notifications.error(`${tokenId} hat kein Attributs-Malus-Feld für "${attr}"!`);
            return null;
        }
        return bonus - malus;
    }

    private getTokenName(tokenId: string): string {
        return canvas?.tokens?.get(tokenId)?.name ?? tokenId;
    }

    private pushItemToStack(item: StackItem): void {
        this.stack.push(item);
        this.persistStack();
    }

    private async persistStack(): Promise<void> {
        const combat = game.combat;
        if (!combat) return;
        await combat.setFlag(MODULE_ID, STACK_FLAG_KEY, this.stack);
    }

    private async persistParticipants(): Promise<void> {
        const combat = game.combat;
        if (!combat) return;
        await combat.setFlag(MODULE_ID, PARTICIPANTS_FLAG_KEY, Object.fromEntries(this.participants));
    }
}

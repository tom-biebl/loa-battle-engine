import { Action, AttributeKey, BonusAction, FixedDamageFrame, Reaction, RollableDamageFrame, StackItem } from "./models/StackItem";
import { ActionResources } from "./models/ActionResources";
import { DialogManager } from "./managers/DialogManager";
import { NoRessourceLeftDialog } from "./dialogs/NoRessourceLeftDialog";
import { RollManager } from "./managers/RollManager";
import { Notifications } from "./utils/Notifications";
import { ActorManager } from "./managers/ActorManager";
import { ChatManager } from "./managers/ChatManager";
import { procReactionMacros } from "./utils/ReactionProc";
import { SequencerManager } from "./managers/SequencerManager";
import { pushTokenAwayFrom } from "./utils/TokenMovement";

const MODULE_ID = "loa-battle-engine";
const STACK_FLAG_KEY = "stack";
const PARTICIPANTS_FLAG_KEY = "participants";

const RESOURCE_LABELS: Record<string, string> = {
    resonance_points_amount: "Resonanzpunkte",
    pc_superiority_dice: "Superiority Dice",
    pc_default_bullets: "Kugeln",
};

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
        if (game.user?.isGM) {
            await this._useAction(action);
        } else {
            game.socket?.emit("module.loa-battle-engine", { type: "useAction", action });
        }
    }

    public async useBonusAction(bonusAction: BonusAction): Promise<void> {
        if (game.user?.isGM) {
            await this._useBonusAction(bonusAction);
        } else {
            game.socket?.emit("module.loa-battle-engine", { type: "useBonusAction", bonusAction });
        }
    }

    public async useReaction(reaction: Reaction): Promise<void> {
        if (game.user?.isGM) {
            await this._useReaction(reaction);
        } else {
            game.socket?.emit("module.loa-battle-engine", { type: "useReaction", reaction });
        }
    }

    // --- Internal Methods (called by socket handlers) ---

    public async _useAction(action: Action): Promise<void> {
        if (!game.combat) return;

        const participant = this.getParticipant(action.actorId);
        if (!participant) return;

        if (!participant.hasAction) {
            NoRessourceLeftDialog.show("action");
            return;
        }

        participant.hasAction = false;
        this.persistParticipants();
        await this.applyResourceCosts(action);

        if (!(await this.performStabilityCheckIfNeeded(action.tokenId))) return;

        switch (action.subtype) {
            case "damage-roll": {
                const result = await this.performAcRoll(action.tokenId, action.targetTokenId, action.acModifier, action.name);
                if (!result.hit) return;
                if (result.critical) action.isCritical = true;
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
            case "damage-aoe": {
                if (!action.affectedTokenIds?.length) {
                    Notifications.error("AOE ohne betroffene Tokens!");
                    return;
                }
                break;
            }
            case "heal": {
                if (!action.targetTokenId) {
                    Notifications.error("Kein Heilziel selektiert!");
                    return;
                }
                break;
            }
            default:
                console.error("Unbekannter action.subtype.");
                return;
        }

        this.pushItemToStack(action);
        this.maybePushEffectApply(action);
        this.dialogManager.open("stack");
    }

    public async _useBonusAction(bonusAction: BonusAction): Promise<void> {
        if (!game.combat) return;

        const participant = this.getParticipant(bonusAction.actorId);
        if (!participant) return;

        if (!participant.hasBonusAction) {
            NoRessourceLeftDialog.show("bonusAction");
            return;
        }

        participant.hasBonusAction = false;
        this.persistParticipants();
        await this.applyResourceCosts(bonusAction);

        if (!(await this.performStabilityCheckIfNeeded(bonusAction.tokenId))) return;

        switch (bonusAction.subtype) {
            case "damage-roll": {
                const result = await this.performAcRoll(bonusAction.tokenId, bonusAction.targetTokenId, bonusAction.acModifier, bonusAction.name);
                if (!result.hit) return;
                if (result.critical) bonusAction.isCritical = true;
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
            case "heal": {
                if (!bonusAction.targetTokenId) {
                    Notifications.error("Kein Heilziel selektiert!");
                    return;
                }
                break;
            }
            default:
                console.error("Unbekannter bonusAction.subtype.");
                return;
        }

        this.pushItemToStack(bonusAction);
        this.maybePushEffectApply(bonusAction);
        this.dialogManager.refresh("stack");
    }

    public async _useReaction(reaction: Reaction): Promise<void> {
        if (!game.combat) return;

        const participant = this.getParticipant(reaction.actorId);
        if (!participant) return;

        if (!participant.hasReaction) {
            NoRessourceLeftDialog.show("reaction");
            return;
        }

        participant.hasReaction = false;
        this.persistParticipants();
        await this.applyResourceCosts(reaction);

        if (!(await this.performStabilityCheckIfNeeded(reaction.tokenId))) return;

        switch (reaction.subtype) {
            case "counter":
            case "interrupt":
                break;
            case "trigger-roll": {
                const result = await this.performAcRoll(reaction.tokenId, reaction.targetTokenId, reaction.acModifier, reaction.name);
                if (!result.hit) return;
                if (result.critical) reaction.isCritical = true;
                break;
            }
            case "trigger-fixed": {
                if (!reaction.targetTokenId) {
                    Notifications.error("Kein Target selektiert!");
                    return;
                }
                break;
            }
            case "dodge": {
                if (!reaction.triggerItemId) {
                    Notifications.error("Dodge ohne Trigger-Item!");
                    return;
                }
                const modifier = this.resolveModifier(reaction.tokenId, reaction.acModifier);
                if (modifier === null) return;
                const roll = await this.rollManager.roll("d20", reaction.tokenId, modifier);
                const actorName = this.getTokenName(reaction.tokenId);
                const dodged = await this.askDodgeConfirm(actorName, roll);
                reaction.rollResult = roll;
                reaction.dodged = dodged;
                await ChatManager.dodgeRoll(actorName, roll, dodged);
                break;
            }
            default:
                console.error("Unbekannter reaction.subtype.");
                return;
        }

        this.pushItemToStack(reaction);
        this.maybePushEffectApply(reaction);
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

        // Pass 1 (LIFO): Counter-Checks — Counter und erfolgreiche Dodges cancelln ihren triggerItemId
        for (const item of sorted) {
            if (item.kind !== "reaction") continue;
            if (item.status !== "pending") continue;
            const cancels = item.subtype === "counter" || (item.subtype === "dodge" && item.dodged === true);
            if (!cancels) continue;

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
                    if (item.animations) {
                        await SequencerManager.playSpellSequence(item.tokenId, item.targetTokenId, item.animations);
                    }
                    await this.applyDamageFromFrame(item.tokenId, item.targetTokenId, item.damageFrame, item.name, item.isCritical);
                    // Pushes nach Damage anwenden
                    if (item.pushTarget) {
                        await pushTokenAwayFrom(item.targetTokenId, { tokenId: item.tokenId }, item.pushTarget.distance);
                    }
                    if (item.pushSelf) {
                        await pushTokenAwayFrom(item.tokenId, { tokenId: item.targetTokenId }, item.pushSelf.distance);
                    }
                } else if (item.kind === "action" && item.subtype === "damage-aoe") {
                    await this.resolveAOE(item);
                } else if (item.subtype === "heal") {
                    if (!item.targetTokenId) return;
                    if (item.animations) {
                        await SequencerManager.playSpellSequence(item.tokenId, item.targetTokenId, item.animations);
                    }
                    const amount = await this.rollManager.roll(item.healingFormula, item.tokenId);
                    await this.actorManager.applyHealing(item.targetTokenId, amount);
                    await ChatManager.healing(item.name, amount, this.getTokenName(item.targetTokenId));
                }
                break;

            case "reaction":
                switch (item.subtype) {
                    case "trigger-roll":
                    case "trigger-fixed": {
                        const trigger = sorted.find(i => i.id === item.triggerItemId);
                        if (!trigger) return;
                        if (item.animations) {
                            await SequencerManager.playSpellSequence(item.tokenId, trigger.tokenId, item.animations);
                        }
                        await this.applyDamageFromFrame(item.tokenId, trigger.tokenId, item.damageFrame, item.name, item.isCritical);
                        break;
                    }
                    case "interrupt":
                        // Effekte — später
                        break;
                    case "counter":
                    case "dodge":
                        // Bereits in Pass 1 behandelt
                        break;
                }
                break;

            case "effect-apply":
                await this.resolveEffectApply(item);
                break;

            case "effect-tick":
                await this.resolveEffectTick(item);
                break;
        }
    }

    private async resolveAOE(item: Extract<StackItem, { subtype: "damage-aoe" }>): Promise<void> {
        // AOE-Animation am Center
        if (item.animations) {
            await SequencerManager.playAOESequence(item.tokenId, item.aoeCenter, item.animations);
        }

        // Damage einmal würfeln, auf alle betroffenen Tokens anwenden
        const rawDamage = await this.rollManager.roll(item.damageFrame.damageFormula, item.tokenId);
        for (const targetId of item.affectedTokenIds) {
            const reduction = this.actorManager.getArmorDamageReduction(targetId) ?? 0;
            const finalDamage = Math.max(0, rawDamage - reduction);
            await ChatManager.damage(item.name, rawDamage, finalDamage, item.damageFrame.damageType, this.getTokenName(targetId));
            await this.actorManager.applyDamage(targetId, finalDamage);
        }

        // AOE-Pushes: alle betroffenen Tokens vom AOE-Center wegstoßen, optional auch Caster
        if (item.pushTarget) {
            for (const targetId of item.affectedTokenIds) {
                await pushTokenAwayFrom(targetId, item.aoeCenter, item.pushTarget.distance);
            }
        }
        if (item.pushSelf) {
            await pushTokenAwayFrom(item.tokenId, item.aoeCenter, item.pushSelf.distance);
        }
        // SpellEffect-Apply wird per maybePushEffectApply zu Push-Zeit gepusht (nicht hier).
    }

    private async applyDamageFromFrame(
        attackerTokenId: string,
        targetTokenId: string,
        damageFrame: RollableDamageFrame | FixedDamageFrame,
        name: string,
        isCritical?: boolean,
    ): Promise<void> {
        const rolledDamage = "damageFormula" in damageFrame
            ? await this.rollManager.roll(damageFrame.damageFormula, attackerTokenId)
            : damageFrame.resolvedAmount;

        // Crit verdoppelt den finalen Damage (kein Doppelwurf, einfach * 2)
        const rawDamage = isCritical ? rolledDamage * 2 : rolledDamage;

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
        // Nur der aktive GM darf den Combat updaten — Spieler-Clients syncen über den Flag-Hook.
        if (game.user !== (game.users as any)?.activeGM) return;
        const combat = game.combat;
        if (!combat) return;

        // activeEffects VOR dem Clear sichern — sonst würden DoT/Status-Effekte
        // beim Rundenwechsel gelöscht werden.
        const preservedEffects = new Map<string, ActionResources["activeEffects"]>();
        for (const [actorId, participant] of this.participants.entries()) {
            if (participant.activeEffects?.length) {
                preservedEffects.set(actorId, participant.activeEffects);
            }
        }

        this.participants.clear();

        for (const combatant of combat.combatants) {
            if (!combatant.actorId) continue;
            this.participants.set(combatant.actorId, {
                hasAction: true,
                hasBonusAction: true,
                hasReaction: true,
                activeEffects: preservedEffects.get(combatant.actorId) ?? [],
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
    private async performAcRoll(tokenId: string, targetTokenId: string | undefined, acModifier: AttributeKey, actionName: string): Promise<{ hit: boolean; critical: boolean }> {
        if (!targetTokenId) {
            Notifications.error("Kein Target selektiert!");
            return { hit: false, critical: false };
        }

        const targetAC = this.actorManager.getArmorClass(targetTokenId);
        if (!targetAC) {
            Notifications.error(`Keine AC für Token ${targetTokenId} gefunden.`);
            return { hit: false, critical: false };
        }

        const modifier = this.resolveModifier(tokenId, acModifier);
        if (modifier === null) return { hit: false, critical: false };
        const totalModifier = modifier + this.getResonanceBonus(tokenId);

        const roll = await this.rollManager.roll("d20", tokenId, totalModifier);
        const naturalRoll = roll - totalModifier;
        const critical = naturalRoll === 20;
        const targetName = this.getTokenName(targetTokenId);

        if (roll < targetAC && !critical) {
            await ChatManager.miss(actionName, roll, targetName);
            return { hit: false, critical: false };
        }

        if (critical) await ChatManager.criticalHit(actionName, roll, targetName);
        else await ChatManager.hit(actionName, roll, targetName);
        return { hit: true, critical };
    }

    // Führt einen DC-Wurf durch und schickt Miss in den Chat bei Misserfolg. Gibt true bei Erfolg zurück.
    private async performDcRoll(tokenId: string, acModifier: AttributeKey, dc: number, actionName: string): Promise<boolean> {
        const modifier = this.resolveModifier(tokenId, acModifier);
        if (modifier === null) return false;
        const totalModifier = modifier + this.getResonanceBonus(tokenId);

        const roll = await this.rollManager.roll("d20", tokenId, totalModifier);
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

    // Wendet alle ResourceCosts auf den Caster-Actor an. Wird IMMER aufgerufen,
    // direkt nach Verbrauch der Action-Ressource — ob die Aktion trifft oder nicht.
    // Schickt für bekannte Ressourcen einen Chat-Eintrag und prüft RP-Thresholds.
    private async applyResourceCosts(item: Action | BonusAction | Reaction): Promise<void> {
        if (!item.resourceCosts?.length) return;
        for (const cost of item.resourceCosts) {
            const delta = cost.operator === "+" ? cost.amount : -cost.amount;
            const result = await this.actorManager.modifyProp(item.tokenId, cost.propKey, delta);
            if (!result) continue;

            const label = RESOURCE_LABELS[cost.propKey] ?? cost.propKey;
            await ChatManager.resourceChanged(label, result.newValue);

            if (cost.propKey === "resonance_points_amount") {
                await this.notifyResonanceThreshold(result.oldValue, result.newValue, item.tokenId);
            }
        }
    }

    private async notifyResonanceThreshold(oldValue: number, newValue: number, tokenId: string): Promise<void> {
        const actorName = this.getTokenName(tokenId);
        if (oldValue < 15 && newValue >= 15) {
            await ChatManager.resonanceThreshold(
                `${actorName} hat <strong>15 Resonanzpunkte</strong> erreicht — Magie instabil! Stabilitätswurf vor jedem Cast, +3 auf Angriffswürfe.`
            );
        } else if (oldValue < 10 && newValue >= 10) {
            await ChatManager.resonanceThreshold(
                `${actorName} hat <strong>10 Resonanzpunkte</strong> erreicht — Magie verstärkt! +1 auf Angriffswürfe.`
            );
        }
    }

    // Resonanz-Bonus auf Angriffswürfe — automatisch je nach RP-Stand
    private getResonanceBonus(tokenId: string): number {
        const rp = this.actorManager.getResonancePoints(tokenId);
        if (rp === undefined) return 0;
        if (rp >= 15) return 3;
        if (rp >= 10) return 1;
        return 0;
    }

    // Stabilitätswurf — nur bei RP >= 15. Returns true wenn Cast weitergeht.
    private async performStabilityCheckIfNeeded(tokenId: string): Promise<boolean> {
        const rp = this.actorManager.getResonancePoints(tokenId);
        if (rp === undefined || rp < 15) return true;

        const roll = await this.rollManager.roll("d20", tokenId);
        const actorName = this.getTokenName(tokenId);
        const proceed = await this.askStabilityConfirm(actorName, roll);
        await ChatManager.stabilityRoll(actorName, roll, proceed);
        return proceed;
    }

    private askDodgeConfirm(actorName: string, roll: number): Promise<boolean> {
        return new Promise((resolve) => {
            const DialogCls = (globalThis as any).Dialog;
            new DialogCls({
                title: "Ausweichwurf",
                content: `<p><strong>${actorName}</strong> würfelt zum Ausweichen: <strong>${roll}</strong></p><p>Erfolgreich? (GM-Entscheidung — DC variiert)</p>`,
                buttons: {
                    yes: { label: "Ja — ausgewichen, kein Schaden", callback: () => resolve(true) },
                    no: { label: "Nein — Treffer", callback: () => resolve(false) },
                },
                default: "yes",
                close: () => resolve(false),
            }).render(true);
        });
    }

    private askStabilityConfirm(actorName: string, roll: number): Promise<boolean> {
        return new Promise((resolve) => {
            const DialogCls = (globalThis as any).Dialog;
            new DialogCls({
                title: "Stabilitätswurf",
                content: `<p><strong>${actorName}</strong> würfelt für Stabilität: <strong>${roll}</strong></p><p>Bewahrt der Caster die Stabilität? (GM-Entscheidung — DC variiert)</p>`,
                buttons: {
                    yes: { label: "Ja — Cast geht durch", callback: () => resolve(true) },
                    no: { label: "Nein — Cast schlägt fehl", callback: () => resolve(false) },
                },
                default: "yes",
                close: () => resolve(false),
            }).render(true);
        });
    }

    private pushItemToStack(item: StackItem): void {
        this.stack.push(item);
        this.persistStack();
        // Alle Nicht-Reaktionen proccen die [R]-Makros (Aktionen, BonusAktionen, Effekte)
        if (item.kind !== "reaction") {
            this.procReactions();
        }
    }

    // Wenn ein Action/BonusAction/Reaction einen SpellEffect angehängt hat,
    // wird ein effect-apply Item mit niedrigerem stackIndex gepusht (resolve NACH dem Parent).
    // Für AOE: ein effect-apply pro betroffenem Token — individuell counter-bar.
    private maybePushEffectApply(parent: Action | BonusAction | Reaction): void {
        if (!parent.spellEffect) return;

        if (parent.kind === "action" && parent.subtype === "damage-aoe") {
            for (const targetId of parent.affectedTokenIds) {
                const targetActor = canvas?.tokens?.get(targetId)?.actor;
                this.pushEffectApplyItem(parent, targetId, targetActor?.id as string | undefined);
            }
            return;
        }

        if (!parent.targetTokenId) return;
        const targetActor = canvas?.tokens?.get(parent.targetTokenId)?.actor;
        this.pushEffectApplyItem(parent, parent.targetTokenId, targetActor?.id as string | undefined);
    }

    private pushEffectApplyItem(parent: Action | BonusAction | Reaction, targetTokenId: string, targetActorId: string | undefined): void {
        if (!parent.spellEffect) return;
        this.pushItemToStack({
            id: foundry.utils.randomID(),
            name: `${parent.spellEffect.name} (Apply)`,
            tokenId: parent.tokenId,
            actorId: parent.actorId,
            targetTokenId,
            targetActorId,
            kind: "effect-apply",
            effect: parent.spellEffect,
            stackIndex: parent.stackIndex - 1,
            status: "pending",
        } as StackItem);
    }

    // Wird bei Turn-Wechsel aufgerufen — pusht effect-tick pro aktiver Wirkung für den aktiven Combatant
    public tickActiveEffects(): void {
        if (game.user !== (game.users as any)?.activeGM) return;
        const combat = game.combat;
        if (!combat) return;

        const combatant = (combat as any).combatant;
        const actorId = combatant?.actorId;
        const tokenId = combatant?.token?.id ?? combatant?.tokenId;
        if (!actorId || !tokenId) return;

        const participant = this.participants.get(actorId);
        if (!participant?.activeEffects?.length) return;

        let hasPushed = false;
        for (const effect of participant.activeEffects) {
            this.pushItemToStack({
                id: foundry.utils.randomID(),
                name: `${effect.name} (Tick)`,
                tokenId,
                actorId,
                targetTokenId: tokenId,
                targetActorId: actorId,
                kind: "effect-tick",
                effect: { ...effect },
                stackIndex: Date.now(),
                status: "pending",
            } as StackItem);
            hasPushed = true;
        }

        if (hasPushed) this.dialogManager.open("stack");
    }

    private async resolveEffectApply(item: Extract<StackItem, { kind: "effect-apply" }>): Promise<void> {
        if (!item.targetTokenId) return;
        const targetActor = canvas?.tokens?.get(item.targetTokenId)?.actor;
        if (!targetActor) return;
        const participant = this.participants.get(targetActor.id as string);
        if (!participant) return;

        if (!participant.activeEffects) participant.activeEffects = [];

        // Stacking: gleicher effectType → Duration aufaddieren, sonst neu hinzufügen
        const existing = participant.activeEffects.find(e => e.effectType === item.effect.effectType);
        if (existing) {
            existing.effectDuration += item.effect.effectDuration;
        } else {
            participant.activeEffects.push({ ...item.effect });
        }

        // Icon am Token setzen
        await (targetActor as any).toggleStatusEffect(item.effect.effectIconId, { active: true });

        // Apply zählt als Tick 1 → wenn DoT, direkt Damage + Duration dekrementieren
        if ("damageFormulaPerRound" in item.effect) {
            await this.applyDamageFromFrame(item.tokenId, item.targetTokenId, {
                damageFormula: item.effect.damageFormulaPerRound,
                damageType: item.effect.damageType,
            }, item.effect.name);
        }

        const stored = participant.activeEffects.find(e => e.effectType === item.effect.effectType);
        if (stored) {
            stored.effectDuration -= 1;
            if (stored.effectDuration <= 0) {
                participant.activeEffects = participant.activeEffects.filter(e => e.effectType !== item.effect.effectType);
                await (targetActor as any).toggleStatusEffect(item.effect.effectIconId, { active: false });
            }
        }
        this.persistParticipants();
    }

    private async resolveEffectTick(item: Extract<StackItem, { kind: "effect-tick" }>): Promise<void> {
        if (!item.targetTokenId) return;
        const targetActor = canvas?.tokens?.get(item.targetTokenId)?.actor;
        if (!targetActor) return;
        const participant = this.participants.get(targetActor.id as string);
        if (!participant?.activeEffects) return;

        const effect = participant.activeEffects.find(e => e.effectType === item.effect.effectType);
        if (!effect) return;

        if ("damageFormulaPerRound" in effect) {
            await this.applyDamageFromFrame(item.tokenId, item.targetTokenId, {
                damageFormula: effect.damageFormulaPerRound,
                damageType: effect.damageType,
            }, effect.name);
        }

        effect.effectDuration -= 1;
        if (effect.effectDuration <= 0) {
            participant.activeEffects = participant.activeEffects.filter(e => e.effectType !== effect.effectType);
            await (targetActor as any).toggleStatusEffect(effect.effectIconId, { active: false });
        }
        this.persistParticipants();
    }

    // Triggert die Glow-Animation auf [R]-Makros in der Hotbar bei allen Clients
    private procReactions(): void {
        game.socket?.emit("module.loa-battle-engine", { type: "procReactions" });
        procReactionMacros();
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

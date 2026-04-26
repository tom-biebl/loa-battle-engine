import { AttributeKey } from "../models/StackItem";

// Typisierung der CSB-spezifischen Actor-Properties
type CsbActorProps = {
    pc_gearscore: number;
    pc_armor_damage_reduction: number;
    resonance_points_amount?: number;
    pc_default_bullets?: number;
    pc_superiority_dice?: number;
} & {
    [K in AttributeKey as `${K}_bonus_attr`]?: number;
} & {
    [K in AttributeKey as `${K}_malus_attr`]?: number;
};

function extractProps(actor: Actor): CsbActorProps | null {
    return (actor.system as unknown as { props: CsbActorProps }).props ?? null;
}

// Gibt den korrekten Actor zurück — bei Unlinked Tokens den Synthetic Actor des Tokens,
// bei Linked Tokens den Actor aus game.actors.
function getActorByToken(tokenId: string): Actor | null {
    const token = canvas?.tokens?.get(tokenId);
    if (!token?.actor) {
        console.error(`ActorManager: Token ${tokenId} oder zugehöriger Actor nicht gefunden.`);
        return null;
    }
    return token.actor;
}

export class ActorManager {

    // AC des Charakters (Gearscore)
    getArmorClass(tokenId: string): number | null {
        const actor = getActorByToken(tokenId);
        return actor ? (extractProps(actor)?.pc_gearscore ?? null) : null;
    }

    // Schadensreduktion durch Rüstung
    getArmorDamageReduction(tokenId: string): number | null {
        const actor = getActorByToken(tokenId);
        return actor ? (extractProps(actor)?.pc_armor_damage_reduction ?? null) : null;
    }

    // Resonanzpunkte — undefined bei Nicht-Magie-Wirkern
    getResonancePoints(tokenId: string): number | undefined {
        const actor = getActorByToken(tokenId);
        return actor ? extractProps(actor)?.resonance_points_amount : undefined;
    }

    // Standard-Kugeln — undefined bei Nicht-Schusswaffennutzern
    getDefaultBullets(tokenId: string): number | undefined {
        const actor = getActorByToken(tokenId);
        return actor ? extractProps(actor)?.pc_default_bullets : undefined;
    }

    // Superiority Dice — undefined bei Nicht-Kriegern
    getSuperiorityDice(tokenId: string): number | undefined {
        const actor = getActorByToken(tokenId);
        return actor ? extractProps(actor)?.pc_superiority_dice : undefined;
    }

    // Attribut-Bonus (z.B. dex_bonus_attr)
    getAttributeBonus(tokenId: string, attr: AttributeKey): number | undefined {
        const actor = getActorByToken(tokenId);
        return actor ? extractProps(actor)?.[`${attr}_bonus_attr`] : undefined;
    }

    // Attribut-Malus (z.B. dex_malus_attr)
    getAttributeMalus(tokenId: string, attr: AttributeKey): number | undefined {
        const actor = getActorByToken(tokenId);
        return actor ? extractProps(actor)?.[`${attr}_malus_attr`] : undefined;
    }

    async applyDamage(tokenId: string, amount: number): Promise<void> {
        const actor = getActorByToken(tokenId);
        if (!actor) return;

        const currentHp = (actor.system as unknown as { props: { pc_hp?: number } }).props.pc_hp;
        if (currentHp === undefined) {
            console.error(`ActorManager: pc_hp nicht gefunden auf Token ${tokenId}.`);
            return;
        }

        await actor.update({ "system.props.pc_hp": Math.max(0, currentHp - amount) } as Parameters<typeof actor.update>[0]);
    }

    // Generische Prop-Änderung — addiert delta zum aktuellen Wert, clamped auf 0.
    // Verwendet für Resource-Kosten (Kugeln, Resonanzpunkte, Superiority Dice, etc.).
    async modifyProp(tokenId: string, propKey: string, delta: number): Promise<void> {
        const actor = getActorByToken(tokenId);
        if (!actor) return;

        const props = (actor.system as unknown as { props: Record<string, unknown> }).props;
        if (!props) {
            console.error(`ActorManager: keine props auf Token ${tokenId}.`);
            return;
        }

        const currentRaw = props[propKey];
        const current = typeof currentRaw === "number" ? currentRaw : 0;
        const newValue = Math.max(0, current + delta);

        await actor.update({ [`system.props.${propKey}`]: newValue } as Parameters<typeof actor.update>[0]);
    }
}

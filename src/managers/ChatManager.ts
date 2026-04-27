export class ChatManager {

    private static async send(content: string): Promise<void> {
        await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker() });
    }

    static async hit(actionName: string, roll: number, target: string): Promise<void> {
        await ChatManager.send(
            `<strong>${actionName}</strong> trifft <strong>${target}</strong> <em>(Wurf: ${roll})</em>`
        );
    }

    static async criticalHit(actionName: string, roll: number, target: string): Promise<void> {
        await ChatManager.send(
            `<strong style="color:#f80">⚡ KRITISCHER TREFFER</strong> — <strong>${actionName}</strong> auf <strong>${target}</strong> <em>(Wurf: ${roll})</em>`
        );
    }

    static async miss(actionName: string, roll: number, target: string): Promise<void> {
        await ChatManager.send(
            `<strong>${actionName}</strong> verfehlt <strong>${target}</strong> <em>(Wurf: ${roll})</em>`
        );
    }

    static async damage(actionName: string, rawDamage: number, finalDamage: number, damageType: string, target: string): Promise<void> {
        const reductionNote = rawDamage !== finalDamage ? ` <em>(${rawDamage} - ${rawDamage - finalDamage} Rüstung)</em>` : "";
        await ChatManager.send(
            `<strong>${actionName}</strong> trifft <strong>${target}</strong> für <strong>${finalDamage} ${damageType}</strong> Schaden${reductionNote}`
        );
    }

    static async healing(actionName: string, amount: number, target: string): Promise<void> {
        await ChatManager.send(
            `<strong style="color:#3a3">✚</strong> <strong>${actionName}</strong> heilt <strong>${target}</strong> für <strong>${amount} HP</strong>`
        );
    }

    static async countered(actionName: string): Promise<void> {
        await ChatManager.send(
            `<strong>${actionName}</strong> wurde <strong>gecountert</strong>.`
        );
    }

    static async resonancePointsChanged(oldPoints: number, newPoints: number): Promise<void> {
        const diff = newPoints - oldPoints;
        const sign = diff > 0 ? `+${diff}` : `${diff}`;
        await ChatManager.send(
            `Resonanzpunkte: <strong>${oldPoints}</strong> → <strong>${newPoints}</strong> <em>(${sign})</em>`
        );
    }

    // Generische Ressourcen-Änderung (z.B. neue Kugeln/Resonanz/Superiority Dice nach einem Spell)
    static async resourceChanged(label: string, newValue: number): Promise<void> {
        await ChatManager.send(`<strong>Neue ${label}:</strong> ${newValue}`);
    }

    // Threshold-Notification (10/15 RP erreicht)
    static async resonanceThreshold(message: string): Promise<void> {
        await ChatManager.send(`<em>⚠ ${message}</em>`);
    }

    // Stabilitätswurf-Resultat
    static async dodgeRoll(actorName: string, roll: number, success: boolean): Promise<void> {
        const status = success
            ? "<strong style='color:#3a3'>✓ ausgewichen</strong>"
            : "<strong style='color:#a33'>✗ getroffen</strong>";
        await ChatManager.send(
            `<strong>${actorName}</strong> Ausweichwurf: <strong>${roll}</strong> — ${status}`
        );
    }

    static async stabilityRoll(actorName: string, roll: number, success: boolean): Promise<void> {
        const status = success
            ? "<strong style='color:#3a3'>✓ bewahrt</strong>"
            : "<strong style='color:#a33'>✗ verloren</strong>";
        await ChatManager.send(
            `<strong>${actorName}</strong> Stabilitätswurf: <strong>${roll}</strong> — ${status}`
        );
    }
}

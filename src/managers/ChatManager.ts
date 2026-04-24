export class ChatManager {

    private static async send(content: string): Promise<void> {
        await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker() });
    }

    static async hit(actionName: string, roll: number, target: string): Promise<void> {
        await ChatManager.send(
            `<strong>${actionName}</strong> trifft <strong>${target}</strong> <em>(Wurf: ${roll})</em>`
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
}

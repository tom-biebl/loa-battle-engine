import { AnimationConfig, ProjectileAnimationConfig, SoundConfig, SpellAnimations } from "../models/StackItem";

// Distanz-Tiers in Fuß — muss zu ProjectileAnimationConfig-Keys passen
const PROJECTILE_TIERS: Array<{ feet: number; key: keyof ProjectileAnimationConfig }> = [
    { feet: 5, key: "5ft" },
    { feet: 15, key: "15ft" },
    { feet: 30, key: "30ft" },
    { feet: 60, key: "60ft" },
    { feet: 90, key: "90ft" },
];

export class SequencerManager {

    // Prüft ob Sequencer installiert und aktiv ist
    static isAvailable(): boolean {
        return typeof (window as any).Sequence !== "undefined";
    }

    // --- Low-Level API ---

    // Animation auf einem Token abspielen
    static async playOnToken(tokenId: string, config: AnimationConfig): Promise<void> {
        if (!this.isAvailable()) return;
        const token = canvas?.tokens?.get(tokenId);
        if (!token) return;

        const seq = new (window as any).Sequence();
        const effect = seq.effect().file(config.file).atLocation(token);
        if (config.scale !== undefined) effect.scale(config.scale);
        if (config.belowTokens) effect.belowTokens();
        if (config.fadeOut !== undefined) effect.fadeOut(config.fadeOut);

        if (config.sound) {
            seq.sound().file(config.sound.file).volume(config.sound.volume ?? 1);
        }
        await seq.play();
    }

    // Animation an einer beliebigen Position (Pixel-Koordinaten)
    static async playAtPosition(x: number, y: number, config: AnimationConfig): Promise<void> {
        if (!this.isAvailable()) return;

        const seq = new (window as any).Sequence();
        const effect = seq.effect().file(config.file).atLocation({ x, y });
        if (config.scale !== undefined) effect.scale(config.scale);
        if (config.belowTokens) effect.belowTokens();
        if (config.fadeOut !== undefined) effect.fadeOut(config.fadeOut);

        if (config.sound) {
            seq.sound().file(config.sound.file).volume(config.sound.volume ?? 1);
        }
        await seq.play();
    }

    // Projektil von Caster-Token zu Target-Token — wählt automatisch die passende Distanz-Variante
    static async playProjectile(fromTokenId: string, toTokenId: string, config: ProjectileAnimationConfig): Promise<void> {
        if (!this.isAvailable()) return;
        const fromToken = canvas?.tokens?.get(fromTokenId);
        const toToken = canvas?.tokens?.get(toTokenId);
        if (!fromToken || !toToken) return;

        const distFeet = this.getDistanceInFeet(fromToken, toToken);
        const file = this.selectProjectileFile(config, distFeet);
        if (!file) {
            console.warn("LOA | Kein Projektil-File für Distanz", distFeet);
            return;
        }

        const seq = new (window as any).Sequence();
        const effect = seq.effect().file(file).atLocation(fromToken).stretchTo(toToken);
        if (config.scale !== undefined) effect.scale(config.scale);
        if (config.sound) {
            seq.sound().file(config.sound.file).volume(config.sound.volume ?? 1);
        }
        await seq.play();
    }

    // Sound alleine abspielen
    static async playSound(config: SoundConfig): Promise<void> {
        if (!this.isAvailable()) return;
        const seq = new (window as any).Sequence();
        seq.sound().file(config.file).volume(config.volume ?? 1);
        await seq.play();
    }

    // --- High-Level API ---

    // Komplette Spell-Sequenz: Cast-Sound → Caster-Anim → Projektil → Target-Anim
    // Alle sequentiell über eine Sequence (Sequencer handled das Timing)
    static async playSpellSequence(casterId: string, targetId: string | undefined, anims: SpellAnimations): Promise<void> {
        if (!this.isAvailable()) return;
        const caster = canvas?.tokens?.get(casterId);
        if (!caster) return;
        const target = targetId ? canvas?.tokens?.get(targetId) : null;

        const seq = new (window as any).Sequence();

        if (anims.sound) {
            seq.sound().file(anims.sound.file).volume(anims.sound.volume ?? 1);
        }

        if (anims.caster) {
            const e = seq.effect().file(anims.caster.file).atLocation(caster);
            if (anims.caster.scale !== undefined) e.scale(anims.caster.scale);
            if (anims.caster.fadeOut !== undefined) e.fadeOut(anims.caster.fadeOut);
            e.waitUntilFinished(-500);
            if (anims.caster.sound) {
                seq.sound().file(anims.caster.sound.file).volume(anims.caster.sound.volume ?? 1);
            }
        }

        if (anims.projectile && target) {
            const distFeet = this.getDistanceInFeet(caster, target);
            const file = this.selectProjectileFile(anims.projectile, distFeet);
            if (file) {
                const e = seq.effect().file(file).atLocation(caster).stretchTo(target);
                if (anims.projectile.scale !== undefined) e.scale(anims.projectile.scale);
                e.waitUntilFinished();
                if (anims.projectile.sound) {
                    seq.sound().file(anims.projectile.sound.file).volume(anims.projectile.sound.volume ?? 1);
                }
            }
        }

        if (anims.target && target) {
            const e = seq.effect().file(anims.target.file).atLocation(target);
            if (anims.target.scale !== undefined) e.scale(anims.target.scale);
            if (anims.target.fadeOut !== undefined) e.fadeOut(anims.target.fadeOut);
            if (anims.target.sound) {
                seq.sound().file(anims.target.sound.file).volume(anims.target.sound.volume ?? 1);
            }
        }

        await seq.play();
    }

    // AOE-Sequenz: Cast-Sound → Caster-Anim → Impact-Anim an Position (kein Projektil)
    static async playAOESequence(casterId: string, aoePos: { x: number; y: number }, anims: SpellAnimations): Promise<void> {
        if (!this.isAvailable()) return;
        const caster = canvas?.tokens?.get(casterId);
        if (!caster) return;

        const seq = new (window as any).Sequence();

        if (anims.sound) {
            seq.sound().file(anims.sound.file).volume(anims.sound.volume ?? 1);
        }

        if (anims.caster) {
            const e = seq.effect().file(anims.caster.file).atLocation(caster);
            if (anims.caster.scale !== undefined) e.scale(anims.caster.scale);
            if (anims.caster.fadeOut !== undefined) e.fadeOut(anims.caster.fadeOut);
            e.waitUntilFinished(-500);
        }

        if (anims.target) {
            const e = seq.effect().file(anims.target.file).atLocation(aoePos);
            if (anims.target.scale !== undefined) e.scale(anims.target.scale);
            if (anims.target.fadeOut !== undefined) e.fadeOut(anims.target.fadeOut);
            if (anims.target.sound) {
                seq.sound().file(anims.target.sound.file).volume(anims.target.sound.volume ?? 1);
            }
        }

        await seq.play();
    }

    // --- Helpers ---

    static getDistanceInFeet(fromToken: any, toToken: any): number {
        const gridSize = canvas?.grid?.size ?? 100;
        const gridDist = (canvas?.grid as any)?.distance ?? 5;
        const dx = toToken.x - fromToken.x;
        const dy = toToken.y - fromToken.y;
        const pixelDist = Math.hypot(dx, dy);
        return (pixelDist / gridSize) * gridDist;
    }

    // Wählt das Projektil-File: kleinster Tier ≥ Distanz, Fallback größter verfügbarer
    static selectProjectileFile(config: ProjectileAnimationConfig, distFeet: number): string | null {
        for (const tier of PROJECTILE_TIERS) {
            if (tier.feet >= distFeet && config[tier.key]) return config[tier.key] as string;
        }
        for (const tier of [...PROJECTILE_TIERS].reverse()) {
            if (config[tier.key]) return config[tier.key] as string;
        }
        return null;
    }
}

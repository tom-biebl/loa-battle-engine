// Findet alle Hotbar-Makros mit "[R]"-Prefix und triggert die CSS-Glow-Animation.
export function procReactionMacros(): void {
    document.querySelectorAll("[data-macro-id]").forEach((slot: Element) => {
        const macroId = slot.getAttribute("data-macro-id");
        if (!macroId) return;

        const macro = (game.macros as any)?.get(macroId);
        if (!macro?.name?.startsWith("[R]")) return;

        slot.classList.add("loa-reaction-proc");
        setTimeout(() => slot.classList.remove("loa-reaction-proc"), 3000);
    });
}

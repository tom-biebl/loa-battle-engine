// Triggert die Glow-Animation auf allen sichtbaren Hotbar-Makros mit "[R]"-Prefix.
// Foundry hält alle 5 Hotbar-Seiten im DOM, inaktive sind aber 0x0 — daher Sichtbarkeits-Check.
export function procReactionMacros(): void {
    document.querySelectorAll("#hotbar [data-macro-id]").forEach((slot: Element) => {
        const name = slot.getAttribute("aria-label");
        if (!name?.startsWith("[R]")) return;

        const rect = (slot as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        slot.classList.add("loa-reaction-proc");
        setTimeout(() => slot.classList.remove("loa-reaction-proc"), 3000);
    });
}

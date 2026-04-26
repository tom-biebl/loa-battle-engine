// AOE-Picker: zeigt einen Radius-Kreis am Mauszeiger, Linksklick bestätigt, Rechtsklick bricht ab.
// Gibt Position und betroffene Token-IDs zurück.
export async function pickAOELocation(radiusFeet: number): Promise<{
    x: number;
    y: number;
    affectedTokenIds: string[];
} | null> {
    if (!canvas?.stage || !canvas.grid) return null;

    const gridSize = canvas.grid.size;
    const gridDist = (canvas.grid as any).distance ?? 5;
    const radiusPixels = (radiusFeet / gridDist) * gridSize;

    const stage: any = canvas.stage;
    const circle = new (window as any).PIXI.Graphics();
    stage.addChild(circle);

    const redraw = (x: number, y: number) => {
        circle.clear();
        circle.lineStyle(3, 0xffd700, 1);
        circle.beginFill(0xffd700, 0.2);
        circle.drawCircle(x, y, radiusPixels);
        circle.endFill();
    };

    return new Promise((resolve) => {
        const moveHandler = (event: any) => {
            const pos = event.data.getLocalPosition(stage);
            redraw(pos.x, pos.y);
        };
        const clickHandler = (event: any) => {
            const pos = event.data.getLocalPosition(stage);
            cleanup();
            const affected = findTokensInRadius(pos.x, pos.y, radiusPixels);
            resolve({ x: pos.x, y: pos.y, affectedTokenIds: affected });
        };
        const cancelHandler = () => {
            cleanup();
            resolve(null);
        };
        const cleanup = () => {
            stage.off("mousemove", moveHandler);
            stage.off("mousedown", clickHandler);
            stage.off("rightdown", cancelHandler);
            stage.removeChild(circle);
            circle.destroy();
        };

        stage.interactive = true;
        stage.on("mousemove", moveHandler);
        stage.on("mousedown", clickHandler);
        stage.on("rightdown", cancelHandler);
    });
}

function findTokensInRadius(centerX: number, centerY: number, radiusPixels: number): string[] {
    const gridSize = canvas?.grid?.size ?? 100;
    const tokens = canvas?.tokens?.placeables ?? [];
    return tokens
        .filter((t: any) => {
            const cx = t.x + ((t.document?.width ?? 1) * gridSize) / 2;
            const cy = t.y + ((t.document?.height ?? 1) * gridSize) / 2;
            return Math.hypot(cx - centerX, cy - centerY) <= radiusPixels;
        })
        .map((t: any) => t.id as string);
}

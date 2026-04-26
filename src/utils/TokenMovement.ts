// Bewegt einen Token weg von einem Bezugspunkt (Token oder Position) um N Grid-Zellen.
// Stoppt bei Map-Grenze oder Kollision mit einem anderen Token.
// Aufrufer muss die Permission haben (typischerweise GM während Resolve).
export async function pushTokenAwayFrom(
    tokenToMoveId: string,
    from: { x: number; y: number } | { tokenId: string },
    distanceCells: number,
): Promise<void> {
    const tokenToMove: any = canvas?.tokens?.get(tokenToMoveId);
    if (!tokenToMove) return;

    let fromX: number;
    let fromY: number;
    if ("tokenId" in from) {
        const fromToken: any = canvas?.tokens?.get(from.tokenId);
        if (!fromToken) return;
        fromX = fromToken.x;
        fromY = fromToken.y;
    } else {
        fromX = from.x;
        fromY = from.y;
    }

    const gridSize = canvas?.grid?.size ?? 100;
    const angle = Math.atan2(tokenToMove.y - fromY, tokenToMove.x - fromX);
    const dx = Math.round(Math.cos(angle));
    const dy = Math.round(Math.sin(angle));
    if (dx === 0 && dy === 0) return;

    const startX = tokenToMove.x;
    const startY = tokenToMove.y;
    let finalX = startX;
    let finalY = startY;

    for (let i = 1; i <= distanceCells; i++) {
        const testX = startX + dx * gridSize * i;
        const testY = startY + dy * gridSize * i;
        if (!isInBounds(testX, testY)) break;
        if (hasTokenAt(testX, testY, tokenToMoveId)) break;
        finalX = testX;
        finalY = testY;
    }

    if (finalX !== startX || finalY !== startY) {
        await tokenToMove.document.update({ x: finalX, y: finalY });
    }
}

function isInBounds(x: number, y: number): boolean {
    const scene: any = canvas?.scene;
    const dims = scene?.dimensions;
    if (!dims) return false;
    const gridSize = canvas?.grid?.size ?? 100;
    return x >= 0 && y >= 0 && x + gridSize <= dims.width && y + gridSize <= dims.height;
}

function hasTokenAt(x: number, y: number, excludeTokenId: string): boolean {
    const gridSize = canvas?.grid?.size ?? 100;
    const tokens: any[] = canvas?.tokens?.placeables ?? [];
    return tokens.some((t: any) => {
        if (t.id === excludeTokenId) return false;
        const w = (t.document?.width ?? 1) * gridSize;
        const h = (t.document?.height ?? 1) * gridSize;
        return x >= t.x && x < t.x + w && y >= t.y && y < t.y + h;
    });
}

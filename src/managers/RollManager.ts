type Dice3dApi = {
  showForRoll(
    roll: Roll,
    user?: User | null,
    synchronize?: boolean,
    whisper?: string[] | null,
    blind?: boolean
  ): Promise<boolean>;
};

function getDice3d(): Dice3dApi | undefined {
  return (game as unknown as { dice3d?: Dice3dApi }).dice3d;
}

// Findet den aktiven Spieler-User der diesen Actor besitzt.
// Fallback auf den aktiven GM falls kein Owner gefunden wird.
function getActorUser(actorId: string): User | null {
  const actor = game.actors?.get(actorId);
  if (!actor) return game.user ?? null;

  const owner = game.users?.find(
    (u) => !u.isGM && actor.testUserPermission(u, "OWNER")
  );

  return owner ?? game.users?.activeGM ?? game.user ?? null;
}

export class RollManager {

  public async roll(formula: string, actorId: string, modifier: number = 0): Promise<number> {
    const fullFormula = modifier !== 0
      ? `${formula}${modifier > 0 ? "+" : ""}${modifier}`
      : formula;

    const roll = new Roll(fullFormula);
    await roll.evaluate();

    const dice3d = getDice3d();
    if (dice3d) {
      await dice3d.showForRoll(roll, getActorUser(actorId), true, null, false);
    }

    return roll.total ?? 0;
  }
}

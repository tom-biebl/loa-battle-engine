import { SpellEffect } from "./StackItem";

export type ActionResources = {
  hasAction: boolean;
  hasBonusAction: boolean;
  hasReaction: boolean;
  activeEffects: SpellEffect[];
};

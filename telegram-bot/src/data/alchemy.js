/**
 * Рецепти алхімії: витрата ресурсів → реліквія.
 * id рецепта короткий для callback_data (до ~40 символів разом з префіксом).
 */

/** @typedef {{ id: string, name: string, emoji: string, consumes: Record<string, number>, relicId: string }} AlchemyRecipe */

/** @type {AlchemyRecipe[]} */
export const ALCHEMY_RECIPES = [
  {
    id: "ring_wanderer",
    name: "Кільце мандрівника",
    emoji: "💍",
    consumes: {
      glass_shard: 2,
      metal_scrap: 2,
      seaweed: 2,
      old_coin: 1,
    },
    relicId: "relic_ring_wanderer",
  },
];

const BY_ID = new Map(ALCHEMY_RECIPES.map((r) => [r.id, r]));

export function getAlchemyRecipe(recipeId) {
  return BY_ID.get(recipeId);
}

export function canCraft(recipe, inv) {
  for (const [resId, need] of Object.entries(recipe.consumes)) {
    if ((inv[resId] ?? 0) < need) return false;
  }
  return true;
}

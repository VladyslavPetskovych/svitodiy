/**
 * Рецепти алхімії: витрата ресурсів → реліквія або ресурс.
 * Рівно одне з полів relicId / resourceId.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   emoji: string,
 *   consumes: Record<string, number>,
 *   relicId?: string,
 *   resourceId?: string,
 *   outputAmount?: number,
 * }} AlchemyRecipe
 */

/** @type {AlchemyRecipe[]} */
export const ALCHEMY_RECIPES = [
  {
    id: "saw_planks",
    name: "Розпиляти колоду",
    emoji: "🪚",
    consumes: {
      log: 1,
    },
    resourceId: "plank",
    outputAmount: 2,
  },
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
  {
    id: "forge_silver_piece",
    name: "Виплавити срібло",
    emoji: "🤍",
    consumes: {
      metal_scrap: 4,
      old_coin: 2,
      seaweed: 1,
    },
    resourceId: "silver_piece",
  },
  {
    id: "hook_silver",
    name: "Срібний гачок",
    emoji: "🪝",
    consumes: {
      silver_piece: 3,
      metal_scrap: 1,
      fish_bone: 2,
      seaweed: 1,
    },
    relicId: "relic_hook_silver",
  },
  {
    id: "hook_gold",
    name: "Золотий гачок",
    emoji: "✨",
    consumes: {
      silver_piece: 2,
      old_coin: 8,
      glass_shard: 3,
      metal_scrap: 2,
    },
    relicId: "relic_hook_gold",
  },
  {
    id: "pearl_talisman",
    name: "Перламутровий талісман",
    emoji: "🦪",
    consumes: {
      shell: 6,
      seaweed: 3,
      old_coin: 2,
      fish_eye: 1,
    },
    relicId: "relic_pearl_talisman",
  },
  {
    id: "rustic_charm",
    name: "Амулет рибалки",
    emoji: "🧿",
    consumes: {
      twig: 4,
      fish_bone: 3,
      stone: 2,
      old_coin: 1,
    },
    relicId: "relic_angler_charm",
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

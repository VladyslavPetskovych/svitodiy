import {
  HOOK_FISH_SHIFT,
  TALISMAN_FISH_SHIFT,
  addFishToInventory,
  addRelicToInventory,
  addResourceToInventory,
  canCraft,
  consumeResources,
  getAlchemyRecipe,
  getFishMeta,
  getInventory,
  recordFishingCast,
  removeFishFromInventory,
  rollCastOutcome,
  rollCookDrops,
  sellFishUnits,
  setEquippedHook,
  setEquippedTalisman,
} from "../bot.js";
import { GAME_CONFIG } from "./catalog.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { takeCooldown } from "./keys.js";

/** Один закид — та сама таблиця шансів і бонуси спорядження, що в /fish у боті. */
export async function cast(userId) {
  if (!(await takeCooldown(userId, "cast", GAME_CONFIG.castCooldownMs))) {
    throw new GameError(429, "cooldown", "Вудка ще у воді — зачекай мить.");
  }

  const outcome = await rollCastOutcome(userId);
  await recordFishingCast(userId, outcome.kind);

  switch (outcome.kind) {
    case "fish":
      return { kind: "fish", id: outcome.fish.id, total: await addFishToInventory(userId, outcome.fish.id, 1) };
    case "resource":
      return {
        kind: "resource",
        id: outcome.resource.id,
        total: await addResourceToInventory(userId, outcome.resource.id, 1),
      };
    case "relic":
      return { kind: "relic", id: outcome.relic.id, total: await addRelicToInventory(userId, outcome.relic.id, 1) };
    default:
      return { kind: "miss", line: outcome.missLine };
  }
}

function requireFish(fishId) {
  if (typeof fishId !== "string" || !getFishMeta(fishId)) throw badRequest("Невідома риба.");
}

/** @param {number | "all"} count */
export async function sellFish(userId, fishId, count) {
  requireFish(fishId);
  let n = count;
  if (n === "all") n = (await getInventory(userId))[fishId] ?? 0;
  if (!Number.isInteger(n) || n < 1 || n > 100_000) throw badRequest("Некоректна кількість.");

  const res = await sellFishUnits(userId, fishId, n);
  if (res == null) throw conflict("not_enough", "Немає стільки цієї риби.");
  return { earned: res.earned, sold: res.sold };
}

/** Продати всю рибу з рюкзака одним запитом. */
export async function sellAllFish(userId) {
  const inv = await getInventory(userId);
  let earned = 0;
  let sold = 0;
  for (const [id, n] of Object.entries(inv)) {
    if (n < 1 || !getFishMeta(id)) continue;
    const res = await sellFishUnits(userId, id, n);
    if (res) {
      earned += res.earned;
      sold += res.sold;
    }
  }
  if (sold === 0) throw conflict("not_enough", "У рюкзаку немає риби.");
  return { earned, sold };
}

/** Приготувати 1 рибу → випадкові ресурси (cookDrops.js). */
export async function cookFish(userId, fishId) {
  requireFish(fishId);
  if (!(await removeFishFromInventory(userId, fishId, 1))) {
    throw conflict("not_enough", "Немає цієї риби.");
  }
  const drops = rollCookDrops();
  for (const [id, qty] of Object.entries(drops)) {
    await addResourceToInventory(userId, id, qty);
  }
  return { drops };
}

const SLOT_ITEMS = { hook: HOOK_FISH_SHIFT, talisman: TALISMAN_FISH_SHIFT };

/** @param {"hook" | "talisman"} slot @param {string | null} relicId null — зняти */
export async function equip(userId, slot, relicId) {
  const allowed = SLOT_ITEMS[slot];
  if (!allowed) throw badRequest("Невідомий слот.");
  const set = slot === "hook" ? setEquippedHook : setEquippedTalisman;

  if (relicId == null) {
    await set(userId, null);
    return {};
  }
  if (!(relicId in allowed)) throw badRequest("Цю річ не можна вдягнути в цей слот.");
  if (((await getInventory(userId))[relicId] ?? 0) < 1) {
    throw conflict("not_owned", "Цієї речі немає в рюкзаку.");
  }
  await set(userId, relicId);
  return {};
}

export async function craft(userId, recipeId) {
  const recipe = typeof recipeId === "string" ? getAlchemyRecipe(recipeId) : null;
  if (!recipe) throw badRequest("Невідомий рецепт.");
  if (!canCraft(recipe, await getInventory(userId)) || !(await consumeResources(userId, recipe.consumes))) {
    throw conflict("not_enough", "Не вистачає ресурсів.");
  }

  if (recipe.relicId) {
    await addRelicToInventory(userId, recipe.relicId, 1);
    return { output: { id: recipe.relicId, amount: 1 } };
  }
  const amount = Math.max(1, Number(recipe.outputAmount ?? 1));
  await addResourceToInventory(userId, recipe.resourceId, amount);
  return { output: { id: recipe.resourceId, amount } };
}

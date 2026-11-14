import { addResourceToInventory, consumeResources } from "../bot.js";
import { getCables } from "./cables.js";
import { getDecor } from "./decor.js";
import { drain, settleLocked, withEnergyLock, writeCharge } from "./energy.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { batteryCap, networksOf } from "./power.js";

/**
 * Електропіч (лише Mini App): переплавляє матеріали, беручи енергію з акумуляторів своєї мережі.
 * energy — Вт·год на один раз. Один вітряк у середньому дає ~20 Вт, тобто ~20 Вт·год на годину.
 */
export const FURNACE_RECIPES = [
  { id: "glass", name: "Скло", emoji: "🪟", in: { glass_shard: 3 }, out: { glass: 1 }, energy: 3 },
  { id: "copper", name: "Мідний злиточок", emoji: "🟧", in: { old_coin: 4 }, out: { copper_ingot: 1 }, energy: 5 },
  { id: "iron", name: "Залізний злиток", emoji: "🔩", in: { metal_scrap: 3 }, out: { iron_ingot: 1 }, energy: 4 },
];
const MAX_BATCH = 10;
const ITEM_ID = /^[a-z0-9]{6,16}$/;
const fmt = (v) => (Math.floor(v * 10) / 10).toString().replace(".", ",");

/** Переплавити recipe count разів у печі furnaceId. */
export async function smelt(userId, furnaceId, recipeId, count) {
  if (typeof furnaceId !== "string" || !ITEM_ID.test(furnaceId)) throw badRequest("Невідома піч.");
  const recipe = FURNACE_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) throw badRequest("Невідомий рецепт.");
  const n = Number(count ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) throw badRequest("Невірна кількість.");
  const { owner } = await homeOwner(userId);

  const result = await withEnergyLock(
    owner,
    async () => {
      const now = Date.now();
      const cells = await getCables(userId);
      const deco = await settleLocked(owner, await getDecor(userId), cells, now);
      if (!deco.some((d) => d.id === furnaceId && d.k === "furnace")) throw new GameError(404, "not_found", "Цієї печі вже немає.");
      const net = networksOf(cells, deco, now).networks.find((x) => x.devices.includes(furnaceId));
      if (!net) throw conflict("no_net", "🔥 Піч не під'єднана — протягни до неї кабель від акумулятора.");
      const batteries = deco.filter((d) => net.devices.includes(d.id) && batteryCap(d.k) > 0);
      if (!batteries.length) throw conflict("no_battery", "🔋 У мережі печі немає акумулятора.");
      const have = batteries.reduce((s, b) => s + Math.min(batteryCap(b.k), b.e ?? 0), 0);
      const need = recipe.energy * n;
      if (have + 1e-9 < need) throw conflict("no_energy", `⚡ Мало енергії: є ${fmt(have)}, треба ${need} Вт·год. Зачекай, поки вітряк зарядить акумулятор.`);

      const cost = Object.fromEntries(Object.entries(recipe.in).map(([id, k]) => [id, k * n]));
      if (!(await consumeResources(userId, cost))) throw conflict("not_enough", "Не вистачає матеріалів.");
      await writeCharge(owner, drain(batteries, need));
      /** @type {Record<string, number>} */
      const got = {};
      for (const [id, k] of Object.entries(recipe.out)) {
        got[id] = k * n;
        await addResourceToInventory(userId, id, k * n);
      }
      return { got, used: need, left: Math.round((have - need) * 100) / 100 };
    },
    { wait: true }
  );
  if (!result) throw new GameError(429, "cooldown", "Секунду — піч ще гріється.");
  return result;
}

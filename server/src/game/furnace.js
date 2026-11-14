import { addResourceToInventory, consumeResources } from "../bot.js";
import { getCables } from "./cables.js";
import { getDecor } from "./decor.js";
import { drain, settleLocked, withEnergyLock, writeCharge } from "./energy.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { batteryCap, networksOf } from "./power.js";

/**
 * Електричні машини (лише Mini App): електропіч і електроверстат. Обидві беруть енергію
 * з акумуляторів своєї мережі. energy — Вт·год на один раз. Один вітряк у середньому дає ~20 Вт,
 * тобто ~20 Вт·год на годину; сонячна панель удень — до 60.
 */
export const FURNACE_RECIPES = [
  { id: "glass", name: "Скло", emoji: "🪟", in: { glass_shard: 3 }, out: { glass: 1 }, energy: 3 },
  { id: "copper", name: "Мідний злиточок", emoji: "🟧", in: { old_coin: 4 }, out: { copper_ingot: 1 }, energy: 5 },
  { id: "iron", name: "Залізний злиток", emoji: "🔩", in: { metal_scrap: 3 }, out: { iron_ingot: 1 }, energy: 4 },
  // Кварц: камінь і уламки скла сплавляються в чистий кристал.
  { id: "quartz", name: "Кварц", emoji: "💠", in: { stone: 3, glass_shard: 1 }, out: { quartz: 1 }, energy: 6 },
  // Обсидіан: камінь розплавляють на лаву й гартують брилою льоду — вулканічне скло.
  { id: "obsidian", name: "Обсидіан", emoji: "🖤", in: { stone: 4, ice_block: 1 }, out: { obsidian: 1 }, energy: 10 },
];

/** Електроверстат: складніше за звичайний верстат — з плавленого в печі. */
export const E_BENCH_RECIPES = [
  { id: "silicon_wafer", name: "Кремнієва пластина", emoji: "🔲", in: { quartz: 2 }, out: { silicon_wafer: 1 }, energy: 8 },
  // Голий дріт у каучуковій оболонці (каучук — з гевеї).
  { id: "insulated_wire", name: "Ізольований дріт", emoji: "➿", in: { bare_wire: 2, rubber: 1 }, out: { insulated_wire: 2 }, energy: 2 },
  {
    id: "solar_panel",
    name: "Сонячна панель",
    emoji: "☀️",
    in: { silicon_wafer: 2, glass: 2, iron_ingot: 1, insulated_wire: 2 },
    out: { solar_panel: 1 },
    energy: 6,
  },
];

/** Машина за видом декору: рецепти й написи. */
export const MACHINES = {
  furnace: { recipes: FURNACE_RECIPES, emoji: "🔥", name: "Піч", busy: "Секунду — піч ще гріється." },
  e_bench: { recipes: E_BENCH_RECIPES, emoji: "⚙️", name: "Електроверстат", busy: "Секунду — верстат ще працює." },
};
const MAX_BATCH = 10;
const ITEM_ID = /^[a-z0-9]{6,16}$/;
const fmt = (v) => (Math.floor(v * 10) / 10).toString().replace(".", ",");

/** Переплавити recipe count разів у печі furnaceId. */
export const smelt = (userId, furnaceId, recipeId, count) => runMachine(userId, "furnace", furnaceId, recipeId, count);

/** Зробити recipe count разів на машині kind (furnace | e_bench), що стоїть під id deviceId. */
export async function runMachine(userId, kind, deviceId, recipeId, count) {
  const m = MACHINES[kind];
  if (!m) throw badRequest("Невідома машина.");
  if (typeof deviceId !== "string" || !ITEM_ID.test(deviceId)) throw badRequest("Невідома машина.");
  const recipe = m.recipes.find((r) => r.id === recipeId);
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
      if (!deco.some((d) => d.id === deviceId && d.k === kind)) throw new GameError(404, "not_found", `${m.emoji} ${m.name}: тут її вже немає.`);
      const net = networksOf(cells, deco, now).networks.find((x) => x.devices.includes(deviceId));
      if (!net) throw conflict("no_net", `${m.emoji} ${m.name} не під'єднано — протягни кабель від акумулятора.`);
      const batteries = deco.filter((d) => net.devices.includes(d.id) && batteryCap(d.k) > 0);
      if (!batteries.length) throw conflict("no_battery", `🔋 У мережі (${m.name.toLowerCase()}) немає акумулятора.`);
      const have = batteries.reduce((s, b) => s + Math.min(batteryCap(b.k), b.e ?? 0), 0);
      const need = recipe.energy * n;
      if (have + 1e-9 < need) throw conflict("no_energy", `⚡ Мало енергії: є ${fmt(have)}, треба ${need} Вт·год. Зачекай, поки вітряк чи панель зарядять акумулятор.`);

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
  if (!result) throw new GameError(429, "cooldown", m.busy);
  return result;
}

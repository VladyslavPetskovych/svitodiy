import { addResourceToInventory, consumeResources, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { decoKey, takeCooldown, toolsKey } from "./keys.js";

/**
 * Верстат: інструменти для виживання й прості заготовки. Лише Mini App.
 *
 * Інструменти особисті (як рюкзак): hash «інструмент → рівень». 0 — немає, тоді добуваєш руками
 * лише кущі, камінчики й дари моря. Сокира рубає дерева, кайло — каміння; залізні — валуни
 * й дають більше (server/src/game/nodes.js). Лопата копає замети на Острові Хуртовини —
 * під снігом трапляється брухт, скло, монети; залізна бере й великі замети.
 * Майструвати можна лише біля верстата — його ставлять у пісочниці (декор «workbench»).
 */
export const TOOLS = {
  axe: {
    emoji: "🪓",
    none: "Сокири немає",
    levels: [
      null,
      { name: "Кам'яна сокира", cost: { twig: 3, stone: 2 } },
      { name: "Залізна сокира", cost: { plank: 2, metal_scrap: 2 } },
    ],
  },
  pickaxe: {
    emoji: "⛏️",
    none: "Кайла немає",
    levels: [
      null,
      { name: "Кам'яне кайло", cost: { twig: 3, stone: 3 } },
      { name: "Залізне кайло", cost: { plank: 2, metal_scrap: 3 } },
    ],
  },
  shovel: {
    emoji: "🪏",
    none: "Лопати немає",
    levels: [
      null,
      { name: "Дерев'яна лопата", cost: { twig: 3, plank: 1 } },
      { name: "Залізна лопата", cost: { plank: 2, metal_scrap: 2 } },
    ],
  },
};

/** Назви інструментів за рівнем — для підказок «потрібна …». */
export const TOOL_NAMES = Object.fromEntries(Object.entries(TOOLS).map(([id, t]) => [id, t.levels.map((l) => l?.name ?? "")]));

/** Заготовки: з чого → що. */
export const RECIPES = [
  { id: "planks", name: "Дошки", emoji: "🪵", in: { log: 1 }, out: { plank: 2 } },
];

const MAX_BATCH = 20;

/** Рівні інструментів гравця: { axe, pickaxe, shovel }. */
export async function getTools(userId) {
  const h = await getRedis().hGetAll(toolsKey(userId));
  return Object.fromEntries(Object.keys(TOOLS).map((id) => [id, Math.max(0, Math.min(TOOLS[id].levels.length - 1, Number(h[id]) || 0))]));
}

/** Чи стоїть на острові верстат. */
async function hasWorkbench(userId) {
  const { owner } = await homeOwner(userId);
  const all = await getRedis().hVals(decoKey(owner));
  return all.some((raw) => {
    try {
      return JSON.parse(raw).k === "workbench";
    } catch {
      return false;
    }
  });
}

async function atBench(userId) {
  if (!(await takeCooldown(userId, "craft", 300))) throw new GameError(429, "cooldown", "Секунду — ще майструєш.");
  if (!(await hasWorkbench(userId))) throw conflict("no_bench", "Спершу постав верстат 🪚 (у будівництві, розділ «Виживання»).");
}

/** Змайструвати наступний рівень інструмента. */
export async function craftTool(userId, toolId) {
  const tool = typeof toolId === "string" ? TOOLS[toolId] : null;
  if (!tool) throw badRequest("Невідомий інструмент.");
  await atBench(userId);
  const have = (await getTools(userId))[toolId];
  const next = tool.levels[have + 1];
  if (!next) throw conflict("max", "Кращого інструмента поки не вигадали.");
  if (!(await consumeResources(userId, next.cost))) throw conflict("not_enough", "Не вистачає матеріалів.");
  await getRedis().hSet(toolsKey(userId), toolId, String(have + 1));
  return { tool: toolId, level: have + 1, name: next.name };
}

/** Заготовка (count разів). */
export async function craftRecipe(userId, recipeId, count) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) throw badRequest("Невідомий рецепт.");
  const n = Number(count ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) throw badRequest("Невірна кількість.");
  await atBench(userId);
  const cost = Object.fromEntries(Object.entries(recipe.in).map(([id, k]) => [id, k * n]));
  if (!(await consumeResources(userId, cost))) throw conflict("not_enough", "Не вистачає матеріалів.");
  /** @type {Record<string, number>} */
  const got = {};
  for (const [id, k] of Object.entries(recipe.out)) {
    got[id] = k * n;
    await addResourceToInventory(userId, id, k * n);
  }
  return { got };
}

/** Для каталогу. */
export function craftCatalog() {
  return {
    tools: Object.entries(TOOLS).map(([id, t]) => ({ id, emoji: t.emoji, none: t.none, levels: t.levels.slice(1) })),
    recipes: RECIPES,
  };
}

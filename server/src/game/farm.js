import {
  addBalance,
  addResourceToInventory,
  consumeResources,
  CROPS,
  cropKey,
  getBalance,
  getCrop,
  getInventory,
  getRedis,
  seedKey,
} from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { getHome } from "./homestead.js";
import { homeOwner } from "./household.js";
import { farmKey, takeCooldown } from "./keys.js";

/**
 * Город на рідному острові (лише Mini App) — як у Stardew Valley:
 * скопай грядку мотикою → посади насіння → полий. Кожен полив дає один ріст: за stageMin
 * хвилин рослина переходить на наступну стадію, а земля пересихає — поливай знову.
 *
 * Поле 5×3 біля хатинки; скільки грядок відкрито — залежить від рівня будівлі «Город».
 * На 3-му рівні з'являється дощувач: поливає сам, тож рослини ростуть без перерви.
 * У спільному домі поле спільне, а насіння й урожай — у рюкзаку того, хто садить і збирає.
 *
 * Зберігаємо лише скопані грядки: hash «№ грядки → JSON { c, g, w }»
 * (c — культура, g — стадія, w — коли полито, мс; 0 — суха). Ріст рахуємо ліниво при читанні.
 */

export const FIELD_PLOTS = 15;
/** Скільки грядок відкрито на рівні «Городу» 0…3. */
export const FIELD_UNLOCK = [6, 9, 12, 15];
export const SPRINKLER_LEVEL = 3;
/** Скільки тримається волога на порожній скопаній грядці. */
const EMPTY_WET_MS = 30 * 60_000;
const MAX_BUY = 99;

const stageMs = (crop) => crop.stageMin * 60_000;
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

/**
 * Стан грядки на мить now: скільки стадій виросло, поки земля була волога.
 * Та сама формула є на клієнті (miniapp/src/game/farm.js) — щоб поле жило без запитів.
 * @param {{ c?: string, g?: number, w?: number }} p
 */
export function advancePlot(p, now, auto) {
  const crop = p.c ? getCrop(p.c) : null;
  if (!crop) {
    const w = p.w && now - p.w < EMPTY_WET_MS ? p.w : 0;
    return { w };
  }
  let g = Math.max(0, Math.min(crop.stages, Number(p.g) || 0));
  let w = Number(p.w) || 0;
  const ms = stageMs(crop);
  while (w && g < crop.stages && now - w >= ms) {
    g++;
    w = auto && g < crop.stages ? w + ms : 0;
  }
  if (g >= crop.stages) w = 0;
  return { c: crop.id, g, w };
}

async function fieldOf(userId) {
  const [{ owner }, home] = await Promise.all([homeOwner(userId), getHome(userId)]);
  const level = Math.max(0, Math.min(3, home.levels.garden ?? 0));
  return { owner, level, unlocked: FIELD_UNLOCK[level], auto: level >= SPRINKLER_LEVEL };
}

function parsePlot(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Поле для стану гри: { plots: { [№]: { c?, g?, w } }, unlocked, auto, level }. */
export async function getFarm(userId) {
  const f = await fieldOf(userId);
  const h = await getRedis().hGetAll(farmKey(f.owner));
  const now = Date.now();
  /** @type {Record<string, object>} */
  const plots = {};
  for (const [i, raw] of Object.entries(h)) {
    const n = Number(i);
    if (Number.isInteger(n) && n >= 0 && n < FIELD_PLOTS) plots[n] = advancePlot(parsePlot(raw), now, f.auto);
  }
  return { plots, unlocked: f.unlocked, auto: f.auto, level: f.level };
}

/** Грядка для дії: перевірка номера, замок від подвійного тапу, поточний стан. */
async function plotFor(userId, plot) {
  const i = Number(plot);
  if (!Number.isInteger(i) || i < 0 || i >= FIELD_PLOTS) throw badRequest("Невідома грядка.");
  const f = await fieldOf(userId);
  if (i >= f.unlocked) throw conflict("locked", "Ця ділянка ще заросла бур'яном — покращ «Город», щоб її розчистити.");
  if (!(await takeCooldown(`${f.owner}:${i}`, "farm", 300))) {
    throw new GameError(429, "cooldown", "Секунду — ще працюєш на цій грядці.");
  }
  const raw = await getRedis().hGet(farmKey(f.owner), String(i));
  const now = Date.now();
  return { ...f, i, now, tilled: raw != null, p: raw == null ? null : advancePlot(parsePlot(raw), now, f.auto) };
}

const save = (f, p) => getRedis().hSet(farmKey(f.owner), String(f.i), JSON.stringify(p));

export async function tillPlot(userId, plot) {
  const f = await plotFor(userId, plot);
  if (f.tilled) throw conflict("tilled", "Тут уже скопано.");
  await save(f, { w: 0 });
  return { plot: f.i, action: "till" };
}

export async function plantPlot(userId, plot, cropId) {
  const crop = typeof cropId === "string" ? getCrop(cropId) : null;
  if (!crop) throw badRequest("Невідоме насіння.");
  const f = await plotFor(userId, plot);
  if (!f.tilled) throw conflict("untilled", "Спершу скопай грядку мотикою.");
  if (f.p.c) throw conflict("busy", "Тут уже щось росте.");
  if (!(await consumeResources(userId, { [seedKey(crop.id)]: 1 }))) {
    throw conflict("not_enough", `Немає насіння «${crop.name}» — купи в коморі городника.`);
  }
  // Посадив у вологу землю (або дощувач працює) — росте одразу.
  const w = f.auto || f.p.w ? f.now : 0;
  await save(f, { c: crop.id, g: 0, w });
  return { plot: f.i, action: "plant" };
}

export async function waterPlot(userId, plot) {
  const f = await plotFor(userId, plot);
  if (!f.tilled) throw conflict("untilled", "Спершу скопай грядку.");
  const crop = f.p.c ? getCrop(f.p.c) : null;
  if (crop && f.p.g >= crop.stages) throw conflict("ready", "Уже достигло — збирай!");
  if (f.p.w) throw conflict("wet", "Земля ще волога.");
  await save(f, { ...f.p, w: f.now });
  return { plot: f.i, action: "water" };
}

export async function harvestPlot(userId, plot) {
  const f = await plotFor(userId, plot);
  const crop = f.p?.c ? getCrop(f.p.c) : null;
  if (!crop) throw conflict("empty", "Тут нічого не росте.");
  if (f.p.g < crop.stages) throw conflict("growing", "Ще не достигло.");

  /** @type {Record<string, number>} */
  const got = { [cropKey(crop.id)]: randInt(crop.yield) };
  if (crop.bonusSeeds) {
    const s = randInt(crop.bonusSeeds);
    if (s > 0) got[seedKey(crop.id)] = s;
  }
  // Кущі, що плодоносять знову, лишаються на грядці; решта — грядка порожніє.
  const next = crop.regrow != null ? { c: crop.id, g: crop.regrow, w: f.auto ? f.now : 0 } : { w: 0 };
  await save(f, next);
  for (const [id, n] of Object.entries(got)) await addResourceToInventory(userId, id, n);
  return { plot: f.i, action: "harvest", got };
}

/** Викопати рослину (грядка лишається скопаною) або, якщо порожня, — заростити назад. */
export async function clearPlot(userId, plot) {
  const f = await plotFor(userId, plot);
  if (!f.tilled) throw conflict("empty", "Тут і так трава.");
  if (f.p.c) await save(f, { w: f.p.w });
  else await getRedis().hDel(farmKey(f.owner), String(f.i));
  return { plot: f.i, action: "clear" };
}

function countOf(raw, max) {
  const n = raw === "all" ? max : Number(raw ?? 1);
  if (!Number.isInteger(n) || n < 1) throw badRequest("Невірна кількість.");
  return Math.min(n, max);
}

export async function buySeeds(userId, cropId, count) {
  const crop = typeof cropId === "string" ? getCrop(cropId) : null;
  if (!crop) throw badRequest("Невідоме насіння.");
  const n = countOf(count, MAX_BUY);
  const { level } = await fieldOf(userId);
  if (crop.garden > level) throw conflict("locked", `Це насіння з'явиться, коли «Город» стане ${crop.garden}-го рівня.`);
  if (!(await takeCooldown(userId, "farmshop", 250))) throw new GameError(429, "cooldown", "Секунду…");
  const price = crop.seedPrice * n;
  if ((await getBalance(userId)) < price) throw conflict("not_enough", `Потрібно ${price} ✨.`);
  await addBalance(userId, -price);
  await addResourceToInventory(userId, seedKey(crop.id), n);
  return { got: { [seedKey(crop.id)]: n }, spent: price };
}

export async function sellCrops(userId, cropId, count) {
  const crop = typeof cropId === "string" ? getCrop(cropId) : null;
  if (!crop) throw badRequest("Невідомий урожай.");
  if (!(await takeCooldown(userId, "farmshop", 250))) throw new GameError(429, "cooldown", "Секунду…");
  const have = (await getInventory(userId))[cropKey(crop.id)] ?? 0;
  if (have < 1) throw conflict("not_enough", `У рюкзаку немає: ${crop.name}.`);
  const n = countOf(count, have);
  if (!(await consumeResources(userId, { [cropKey(crop.id)]: n }))) throw conflict("not_enough", "Не вистачає врожаю.");
  const earned = crop.sellPrice * n;
  await addBalance(userId, earned);
  return { sold: n, earned };
}

/** Для каталогу: культури й правила поля. */
export function farmCatalog() {
  return { crops: CROPS, plots: FIELD_PLOTS, unlock: FIELD_UNLOCK, sprinklerLevel: SPRINKLER_LEVEL, emptyWetMin: EMPTY_WET_MS / 60_000 };
}

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
import { RAIN_SINCE, firstRain, isRaining, lastRain } from "./weather.js";

/**
 * Город на рідному острові (лише Mini App) — як у Stardew Valley:
 * скопай грядку мотикою → посади насіння → полий. Кожен полив дає один ріст: за stageMin
 * хвилин рослина переходить на наступну стадію, а земля пересихає — поливай знову.
 *
 * Грядки гравець сам розставляє на острові (пісочниця, «Грядка») — одразу скопані: посадити,
 * поливати, збирати. Викопав рослину й прибрав порожню грядку — заростає, тоді знову скопати мотикою. Скільки грядок можна мати — залежить
 * від рівня будівлі «Город». На 3-му рівні — дощувач: поливає сам, тож рослини ростуть без перерви.
 * У спільному домі поле спільне, а насіння й урожай — у рюкзаку того, хто садить і збирає.
 *
 * Зберігаємо hash «№ грядки → JSON { x, y, t, c, g, w, d }»: x, y — де стоїть (якір — низ по центру,
 * 16×16), t — скопана, c — культура, g — стадія, w — коли полито, мс (0 — суха). Ріст рахуємо ліниво.
 */

export const FIELD_PLOTS = 15;
/** Скільки грядок можна мати на рівні «Городу» 0…3. */
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
 *
 * Дощ (weather.js) поливає сам: щойно суха грядка потрапляє під дощ, її ніби полили в ту мить.
 * d — коли грядка пересохла (щоб знати, з якого моменту шукати дощ); 0 — до оновлення з погодою.
 * @param {{ c?: string, g?: number, w?: number, d?: number }} p
 */
export function advancePlot(p, now, auto) {
  const crop = p.c ? getCrop(p.c) : null;
  if (!crop) {
    const wetAt = Math.max(Number(p.w) || 0, lastRain(now));
    return { w: wetAt && now - wetAt < EMPTY_WET_MS ? wetAt : 0 };
  }
  let g = Math.max(0, Math.min(crop.stages, Number(p.g) || 0));
  let w = Number(p.w) || 0;
  let d = Number(p.d) || 0;
  const ms = stageMs(crop);
  while (g < crop.stages) {
    if (!w) {
      w = firstRain(Math.max(d, RAIN_SINCE), now);
      if (!w) break;
    }
    if (now - w < ms) break;
    g++;
    d = w + ms;
    w = auto && g < crop.stages ? d : 0;
  }
  if (g >= crop.stages) w = 0;
  return w ? { c: crop.id, g, w } : { c: crop.id, g, w: 0, d };
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

/** Грядка на мить now: де стоїть, чи скопана і (якщо скопана) як росте. */
function bedNow(raw, now, auto) {
  const p = parsePlot(raw);
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return null;
  const at = { x: p.x, y: p.y };
  return p.t ? { ...at, t: 1, ...advancePlot(p, now, auto) } : at;
}

/** Поле для стану гри: { plots: { [№]: { x, y, t?, c?, g?, w } }, unlocked, auto, level }. */
export async function getFarm(userId) {
  const f = await fieldOf(userId);
  const h = await getRedis().hGetAll(farmKey(f.owner));
  const now = Date.now();
  /** @type {Record<string, object>} */
  const plots = {};
  for (const [i, raw] of Object.entries(h)) {
    const n = Number(i);
    const bed = Number.isInteger(n) && n >= 0 && n < FIELD_PLOTS ? bedNow(raw, now, f.auto) : null;
    if (bed) plots[n] = bed;
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
  const bed = raw == null ? null : bedNow(raw, now, f.auto);
  if (!bed) throw new GameError(404, "not_found", "Тут немає грядки — постав її в режимі будівництва.");
  const { x, y, t, ...p } = bed;
  return { ...f, i, now, at: { x, y }, tilled: !!t, p };
}

/** Зберегти стан грядки, не губляючи, де вона стоїть. */
const save = (f, p) => getRedis().hSet(farmKey(f.owner), String(f.i), JSON.stringify({ ...f.at, t: 1, ...p }));

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
  // Посадив у вологу землю (дощ, дощувач чи щойно полив) — росте одразу; суху — запам'ятаємо, відколи суха.
  const w = f.auto || f.p.w ? f.now : 0;
  await save(f, w ? { c: crop.id, g: 0, w } : { c: crop.id, g: 0, w: 0, d: f.now });
  return { plot: f.i, action: "plant" };
}

export async function waterPlot(userId, plot) {
  const f = await plotFor(userId, plot);
  if (!f.tilled) throw conflict("untilled", "Спершу скопай грядку.");
  const crop = f.p.c ? getCrop(f.p.c) : null;
  if (crop && f.p.g >= crop.stages) throw conflict("ready", "Уже достигло — збирай!");
  if (f.p.w) throw conflict("wet", isRaining(f.now) ? "Іде дощ — він уже полив грядку 🌧️" : "Земля ще волога.");
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
  const next = crop.regrow != null ? { c: crop.id, g: crop.regrow, w: f.auto ? f.now : 0, d: f.now } : { w: 0 };
  await save(f, next);
  for (const [id, n] of Object.entries(got)) await addResourceToInventory(userId, id, n);
  return { plot: f.i, action: "harvest", got };
}

/** Викопати рослину (грядка лишається скопаною) або, якщо порожня, — заростити назад. */
export async function clearPlot(userId, plot) {
  const f = await plotFor(userId, plot);
  if (!f.tilled) throw conflict("empty", "Тут і так трава.");
  if (f.p.c) await save(f, { w: f.p.w });
  else await getRedis().hSet(farmKey(f.owner), String(f.i), JSON.stringify(f.at)); // заростає — лишається ділянка
  return { plot: f.i, action: "clear" };
}

/* ───────── Грядки в пісочниці ───────── */

/** Межі мапи острова — як MAP у miniapp/src/game/walk/layout.js. */
const MAP_W = 512;
const MAP_H = 448;

function bedCoords(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 8 || y < 16 || x > MAP_W - 8 || y > MAP_H) throw badRequest("Сюди грядку не поставити.");
  return { x, y };
}

async function bedLock(owner) {
  if (!(await takeCooldown(owner, "beds", 250))) throw new GameError(429, "cooldown", "Секунду — ще копаєш попередню.");
}

/** Поставити нову ділянку під грядку на перше вільне місце в межах рівня «Городу». */
export async function placeBed(userId, x, y) {
  const at = bedCoords(x, y);
  const f = await fieldOf(userId);
  await bedLock(f.owner);
  const r = getRedis();
  const used = new Set(await r.hKeys(farmKey(f.owner)));
  const count = [...used].filter((k) => Number(k) < f.unlocked).length;
  if (count >= f.unlocked) {
    const more = FIELD_UNLOCK.findIndex((n) => n > f.unlocked);
    throw conflict(
      "full",
      more > 0 ? `Більше ${f.unlocked} грядок не доглянеш — покращ «Город» до ${more}-го рівня.` : `Уже ${f.unlocked} грядок — це максимум.`
    );
  }
  const i = Array.from({ length: f.unlocked }, (_, k) => k).find((k) => !used.has(String(k)));
  // Нова грядка — одразу скопана (суха земля): лишається посадити й полити.
  // hSetNX — двоє одночасно не займуть один номер.
  if (i == null || !(await r.hSetNX(farmKey(f.owner), String(i), JSON.stringify({ ...at, t: 1, w: 0 })))) throw conflict("busy", "Спробуй ще раз.");
  return { plot: i };
}

/** Перенести грядку разом з усім, що на ній росте. */
export async function moveBed(userId, plot, x, y) {
  const at = bedCoords(x, y);
  const i = Number(plot);
  if (!Number.isInteger(i) || i < 0 || i >= FIELD_PLOTS) throw badRequest("Невідома грядка.");
  const { owner } = await homeOwner(userId);
  await bedLock(owner);
  const r = getRedis();
  const raw = await r.hGet(farmKey(owner), String(i));
  if (raw == null) throw new GameError(404, "not_found", "Цієї грядки вже немає.");
  await r.hSet(farmKey(owner), String(i), JSON.stringify({ ...parsePlot(raw), ...at }));
  return { plot: i, x, y };
}

/** Прибрати грядку з острова (усе, що на ній росло, пропадає). */
export async function removeBed(userId, plot) {
  const i = Number(plot);
  if (!Number.isInteger(i) || i < 0 || i >= FIELD_PLOTS) throw badRequest("Невідома грядка.");
  const { owner } = await homeOwner(userId);
  await bedLock(owner);
  if ((await getRedis().hDel(farmKey(owner), String(i))) !== 1) throw new GameError(404, "not_found", "Цієї грядки вже немає.");
  return { plot: i };
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

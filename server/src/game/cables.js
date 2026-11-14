import { readFileSync } from "node:fs";
import { addResourceToInventory, consumeResources, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { cablesKey, takeCooldown } from "./keys.js";

/**
 * Кабелі під землею рідного острова (лише Mini App). Клієнт малює їх лише в режимі електрики,
 * у звичайній грі їх не видно. Зберігаються клітинками 8×8 px: hash «cx,cy» → «1».
 * Кожна клітинка коштує 1 дріт (bare_wire) з рюкзака; прибрав — дріт повертається.
 *
 * Сюди можна класти кабель лише на сушу: маску суші (island-walk.json) беремо з того ж атласу,
 * що й клієнт (miniapp/src/game/walk/atlas.json → walk).
 */
const WALK = JSON.parse(readFileSync(new URL("./island-walk.json", import.meta.url), "utf8"));
export const CABLE_CELL = WALK.cell;
const COLS = WALK.rows[0].length;
const ROWS = WALK.rows.length;
export const CABLE_MAX = 400;

/** Клітинка на суші (з маски острова). */
export const onLand = (x, y) => WALK.rows[y]?.[x] === "1";
/** За один запит — не більше стількох клітинок (довший маршрут клієнт шле шматками). */
const BATCH_MAX = 200;
const WIRE = "bare_wire";

/** @returns {Promise<[number, number][]>} клітинки з кабелем */
export async function getCables(userId) {
  const h = await getRedis().hKeys(await key(userId));
  return h.map((f) => f.split(",").map(Number));
}

async function key(userId) {
  return cablesKey((await homeOwner(userId)).owner);
}

/** Перевірити клітинки: цілі, на мапі, на суші, без повтору в запиті. */
function parseCells(list) {
  if (!Array.isArray(list) || !list.length) throw badRequest("Немає клітинок.");
  if (list.length > BATCH_MAX) throw badRequest("Забагато за раз.");
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!Array.isArray(c) || c.length !== 2) throw badRequest("Невідома клітинка.");
    const [x, y] = c;
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw badRequest("Невідома клітинка.");
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) throw badRequest("Це поза островом.");
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([x, y]);
  }
  return out;
}

async function lock(userId) {
  if (!(await takeCooldown((await homeOwner(userId)).owner, "cables", 150))) {
    throw new GameError(429, "cooldown", "Секунду — ще прокладаємо попереднє.");
  }
}

/**
 * Прокласти кабель по клітинках. Уже прокладені пропускаються; платиш лише за нові.
 * @returns {Promise<{ added: number, cells: [number, number][] }>}
 */
export async function layCables(userId, list) {
  // Вода — мимо: тягнеш смугу через море, кабель ляже лише на сушу.
  const cells = parseCells(list).filter(([x, y]) => onLand(x, y));
  await lock(userId);
  const r = getRedis();
  const k = await key(userId);
  if (!cells.length) return { added: 0, cells: await getCables(userId) };

  const present = new Set(await r.hKeys(k));
  const fresh = cells.filter(([x, y]) => !present.has(`${x},${y}`));
  if (!fresh.length) return { added: 0, cells: await getCables(userId) };
  if (present.size + fresh.length > CABLE_MAX) throw conflict("full", `На острові вже ${CABLE_MAX} м кабелю — більше не тягнеться.`);
  if (!(await consumeResources(userId, { [WIRE]: fresh.length }))) throw conflict("not_enough", "Не вистачає дроту.");

  const fields = Object.fromEntries(fresh.map(([x, y]) => [`${x},${y}`, "1"]));
  await r.hSet(k, fields);
  return { added: fresh.length, cells: await getCables(userId) };
}

/**
 * Зняти кабель з клітинок. Повертає дріт, що був на них (лише за справжні кабелі).
 * @returns {Promise<{ refund: number, cells: [number, number][] }>}
 */
export async function removeCables(userId, list) {
  const cells = parseCells(list);
  await lock(userId);
  const r = getRedis();
  const k = await key(userId);
  let refund = 0;
  for (const [x, y] of cells) {
    // hDel повертає 1 лише тому, хто справді прибрав — повторний запит не поверне дріт вдруге.
    if ((await r.hDel(k, `${x},${y}`)) === 1) refund++;
  }
  if (refund) await addResourceToInventory(userId, WIRE, refund);
  return { refund, cells: await getCables(userId) };
}


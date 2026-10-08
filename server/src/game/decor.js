import { randomBytes } from "node:crypto";
import { addResourceToInventory, consumeResources, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { decoKey, takeCooldown } from "./keys.js";

/**
 * Пісочниця рідного острова: гравець сам розставляє декор.
 * Лише Mini App. Ціна — ресурси з рюкзака; прибрав — повернули все, тож експериментувати не шкода.
 * Геометрія (скільки клітинок займає, чи це підлога) — на клієнті, miniapp/src/game/walk/decor.js.
 */
export const DECOR = [
  { id: "wildflowers", cat: "plants", name: "Польові квіти", emoji: "🌼", cost: {} },
  { id: "flower_bed", cat: "plants", name: "Клумба", emoji: "🌷", cost: { twig: 1 } },
  { id: "sunflowers", cat: "plants", name: "Соняшники", emoji: "🌻", cost: { seaweed: 1 } },
  { id: "bush", cat: "plants", name: "Кущ", emoji: "🌿", cost: { twig: 2 } },
  { id: "sapling", cat: "plants", name: "Деревце", emoji: "🌱", cost: { twig: 3 } },
  { id: "pine", cat: "plants", name: "Ялинка", emoji: "🌲", cost: { log: 2 } },
  { id: "pumpkins", cat: "plants", name: "Гарбузи", emoji: "🎃", cost: { seaweed: 2 } },
  { id: "stepping_stone", cat: "stone", name: "Плита", emoji: "🪨", cost: {} },
  { id: "cobble_tile", cat: "stone", name: "Бруківка", emoji: "🧱", cost: { stone: 1 } },
  { id: "rock", cat: "stone", name: "Валун", emoji: "🪨", cost: { stone: 1 } },
  { id: "stone_lantern", cat: "stone", name: "Кам'яний ліхтар", emoji: "🏮", cost: { stone: 3, glass_shard: 1 } },
  { id: "well", cat: "stone", name: "Криниця", emoji: "⛲", cost: { stone: 6, plank: 2 } },
  { id: "plank_floor", cat: "wood", name: "Настил", emoji: "🟫", cost: { plank: 1 } },
  { id: "fence", cat: "wood", name: "Тин", emoji: "🪵", cost: { twig: 2 } },
  { id: "bench", cat: "wood", name: "Лавка", emoji: "🪑", cost: { plank: 3 } },
  { id: "barrel", cat: "wood", name: "Бочка", emoji: "🛢", cost: { plank: 2 } },
  { id: "crates", cat: "wood", name: "Ящики", emoji: "📦", cost: { plank: 2 } },
  { id: "hay", cat: "wood", name: "Копиця", emoji: "🌾", cost: { twig: 3 } },
  { id: "signpost", cat: "wood", name: "Вказівник", emoji: "🪧", cost: { plank: 1 } },
  { id: "lamp_post", cat: "light", name: "Ліхтар", emoji: "💡", cost: { metal_scrap: 1, glass_shard: 1 } },
  { id: "campfire", cat: "light", name: "Вогнище", emoji: "🔥", cost: { log: 2, stone: 2 } },
];

export const DECOR_MAX = 150;

const BY_ID = new Map(DECOR.map((d) => [d.id, d]));
/** Межі мапи острова в пікселях арту — як MAP у walk/layout.js. */
const MAP_W = 512;
const MAP_H = 448;
const ITEM_ID = /^[a-z0-9]{6,16}$/;

/** @returns {Promise<{ id: string, k: string, x: number, y: number }[]>} */
export async function getDecor(userId) {
  const h = await getRedis().hGetAll(decoKey(userId));
  const out = [];
  for (const [id, raw] of Object.entries(h)) {
    try {
      const v = JSON.parse(raw);
      if (BY_ID.has(v.k)) out.push({ id, k: v.k, x: v.x, y: v.y });
    } catch {
      /* зіпсований запис — пропускаємо */
    }
  }
  return out;
}

function coords(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > MAP_W || y > MAP_H) {
    throw badRequest("Сюди поставити не вийде.");
  }
  return { x, y };
}

function itemId(id) {
  if (typeof id !== "string" || !ITEM_ID.test(id)) throw badRequest("Невідомий предмет.");
  return id;
}

/** Одна зміна за раз: подвійний тап не спише ресурси двічі. */
async function lock(userId) {
  if (!(await takeCooldown(userId, "deco", 250))) {
    throw new GameError(429, "cooldown", "Секунду — ще ставимо попереднє.");
  }
}

export async function placeDecor(userId, kind, x, y) {
  const def = typeof kind === "string" ? BY_ID.get(kind) : null;
  if (!def) throw badRequest("Невідомий декор.");
  const pos = coords(x, y);
  await lock(userId);

  const r = getRedis();
  const key = decoKey(userId);
  if ((await r.hLen(key)) >= DECOR_MAX) throw conflict("full", `На острові вже ${DECOR_MAX} прикрас — прибери щось.`);
  if (Object.keys(def.cost).length && !(await consumeResources(userId, def.cost))) {
    throw conflict("not_enough", "Не вистачає матеріалів.");
  }
  const id = randomBytes(6).toString("hex");
  await r.hSet(key, id, JSON.stringify({ k: def.id, ...pos }));
  return { item: { id, k: def.id, ...pos } };
}

export async function moveDecor(userId, id, x, y) {
  itemId(id);
  const pos = coords(x, y);
  await lock(userId);
  const r = getRedis();
  const raw = await r.hGet(decoKey(userId), id);
  if (!raw) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  const { k } = JSON.parse(raw);
  await r.hSet(decoKey(userId), id, JSON.stringify({ k, ...pos }));
  return { item: { id, k, ...pos } };
}

export async function removeDecor(userId, id) {
  itemId(id);
  await lock(userId);
  const r = getRedis();
  const raw = await r.hGet(decoKey(userId), id);
  if (!raw) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  // hDel повертає 1 лише першому — повторний запит не поверне ресурси вдруге.
  if ((await r.hDel(decoKey(userId), id)) !== 1) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  const def = BY_ID.get(JSON.parse(raw).k);
  const refund = def?.cost ?? {};
  for (const [res, n] of Object.entries(refund)) await addResourceToInventory(userId, res, n);
  return { refund };
}

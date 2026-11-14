import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { addResourceToInventory, consumeResources, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { decoKey, takeCooldown } from "./keys.js";
import { NET } from "./nodes.js";

/**
 * Пісочниця рідного острова: гравець сам розставляє декор.
 * Лише Mini App. Ціна — ресурси з рюкзака; прибрав — повернули все, тож експериментувати не шкода.
 * Геометрія (скільки клітинок займає, чи це підлога) — на клієнті, miniapp/src/game/walk/decor.js.
 * У спільному домі декор теж спільний: платить той, хто ставить, повертається тому, хто прибирає.
 */
export const DECOR = [
  // Виживання: з цим можна працювати (верстат — інструменти й дошки, комора — насіння й продаж урожаю).
  { id: "workbench", cat: "survival", name: "Верстат", emoji: "🪚", cost: { twig: 4, stone: 2 } },
  { id: "seed_stand", cat: "survival", name: "Комора городника", emoji: "🌱", cost: { twig: 3 } },
  { id: "sprinkler", cat: "survival", name: "Дощувач", emoji: "💦", cost: { plank: 2, metal_scrap: 2 } },
  // Сітка ставиться лише на мілину біля берега (water, «ніжки» foot у клітинках по 8 px) і приманює
  // на пляж корчі, мушлі й водорості (server/src/game/nodes.js → NET). Більше limit пляж не прогодує.
  {
    id: NET.kind,
    cat: "survival",
    name: "Сітка",
    emoji: "🥅",
    cost: { twig: 3, seaweed: 3 },
    water: true,
    foot: [3, 2],
    limit: NET.max,
    hint: "Став у воду біля пляжу — на берег частіше винесе корчі, мушлі й водорості.",
  },
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
/** Декор, що стоїть у воді, а не на суші. */
export const WATER_DECOR = new Set(DECOR.filter((d) => d.water).map((d) => d.id));

/**
 * Мілина біля берега, куди можна ставити сітки: рядки '0'/'1' по клітинках 8×8
 * (генерує miniapp/scripts/gen-island-art.mjs — та сама маска, що й atlas.shore у Mini App).
 */
const SHORE = JSON.parse(readFileSync(new URL("./island-shore.json", import.meta.url), "utf8"));

/** Чи всі клітинки під «ніжками» (якір — низ по центру) — мілина біля берега. */
function onShore(def, x, y) {
  const { cell, rows } = SHORE;
  const [fw, fh] = def.foot;
  const x0 = x - (fw * cell) / 2;
  const y0 = y - fh * cell;
  for (let cy = Math.floor(y0 / cell); cy <= Math.floor((y - 1) / cell); cy++)
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor((x0 + fw * cell - 1) / cell); cx++)
      if (rows[cy]?.[cx] !== "1") return false;
  return true;
}

/** Предмет у воді — лише на мілині; на суші — як і раніше, де завгодно в межах мапи. */
function checkSpot(def, x, y) {
  if (def.water && !onShore(def, x, y)) throw conflict("not_water", `${def.emoji} ${def.name}: став у воду біля берега.`);
}
/** Межі мапи острова в пікселях арту — як MAP у walk/layout.js. */
const MAP_W = 512;
const MAP_H = 448;
const ITEM_ID = /^[a-z0-9]{6,16}$/;

/** @returns {Promise<{ id: string, k: string, x: number, y: number }[]>} */
export async function getDecor(userId) {
  const h = await getRedis().hGetAll(await key(userId));
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

/** Ключ декору дому, де живе гравець (свого чи спільного). */
async function key(userId) {
  return decoKey((await homeOwner(userId)).owner);
}

/** Одна зміна за раз: подвійний тап не спише ресурси двічі. */
async function lock(userId) {
  if (!(await takeCooldown((await homeOwner(userId)).owner, "deco", 250))) {
    throw new GameError(429, "cooldown", "Секунду — ще ставимо попереднє.");
  }
}

export async function placeDecor(userId, kind, x, y) {
  const def = typeof kind === "string" ? BY_ID.get(kind) : null;
  if (!def) throw badRequest("Невідомий декор.");
  const pos = coords(x, y);
  await lock(userId);

  const r = getRedis();
  const k = await key(userId);
  if ((await r.hLen(k)) >= DECOR_MAX) throw conflict("full", `На острові вже ${DECOR_MAX} прикрас — прибери щось.`);
  checkSpot(def, pos.x, pos.y);
  if (def.limit) {
    const same = (await r.hVals(k)).filter((raw) => raw.includes(`"k":"${def.id}"`)).length;
    if (same >= def.limit) throw conflict("limit", `${def.emoji} Більше ${def.limit} сіток пляж не прогодує.`);
  }
  if (Object.keys(def.cost).length && !(await consumeResources(userId, def.cost))) {
    throw conflict("not_enough", "Не вистачає матеріалів.");
  }
  const id = randomBytes(6).toString("hex");
  await r.hSet(k, id, JSON.stringify({ k: def.id, ...pos }));
  return { item: { id, k: def.id, ...pos } };
}

export async function moveDecor(userId, id, x, y) {
  itemId(id);
  const pos = coords(x, y);
  await lock(userId);
  const r = getRedis();
  const hk = await key(userId);
  const raw = await r.hGet(hk, id);
  if (!raw) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  const { k } = JSON.parse(raw);
  if (BY_ID.has(k)) checkSpot(BY_ID.get(k), pos.x, pos.y);
  await r.hSet(hk, id, JSON.stringify({ k, ...pos }));
  return { item: { id, k, ...pos } };
}

export async function removeDecor(userId, id) {
  itemId(id);
  await lock(userId);
  const r = getRedis();
  const hk = await key(userId);
  const raw = await r.hGet(hk, id);
  if (!raw) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  // hDel повертає 1 лише першому — повторний запит не поверне ресурси вдруге.
  if ((await r.hDel(hk, id)) !== 1) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  const def = BY_ID.get(JSON.parse(raw).k);
  const refund = def?.cost ?? {};
  for (const [res, n] of Object.entries(refund)) await addResourceToInventory(userId, res, n);
  return { refund };
}

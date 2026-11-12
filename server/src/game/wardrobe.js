import { addBalance, consumeResources, getBalance, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { hasInteriorItem } from "./interior.js";
import { takeCooldown, wearKey } from "./keys.js";

/**
 * Одяг мандрівника. Лише Mini App.
 *
 * Одяг особистий (як рюкзак, а не як спільна хата): hash «wear:<userId>» —
 * own — що вже є (через кому), hat / top / bottom — що вдягнено (hat порожній — без капелюха).
 * Новий одяг шиють (craft — ресурси з рюкзака) або купують (price — ✨) біля шафи в хатинці
 * (річ із act 'closet' — miniapp/src/game/walk/interior.js). Що в мандрівника від початку — starter.
 * Арт: іконки — miniapp/scripts/sd-wardrobe.mjs, як сидить на мандрівникові — miniapp/scripts/hero-wear.mjs.
 */
export const WEAR_SLOTS = [
  { id: "hat", name: "Головний убір", emoji: "👒", optional: true },
  { id: "top", name: "Верх", emoji: "👕" },
  { id: "bottom", name: "Низ", emoji: "👖" },
];

export const WEAR = [
  // Головні убори
  { id: "straw_hat", slot: "hat", name: "Бриль", emoji: "👒", starter: true },
  { id: "flat_cap", slot: "hat", name: "Кашкет", emoji: "🧢", craft: { seaweed: 2, twig: 1 } },
  { id: "beanie", slot: "hat", name: "Шапка рибалки", emoji: "🧶", craft: { seaweed: 3 }, price: 25 },
  { id: "flower_wreath", slot: "hat", name: "Вінок", emoji: "🌻", craft: { crop_sunflower: 2, seaweed: 1 } },
  { id: "captain_cap", slot: "hat", name: "Капітанка", emoji: "⚓", price: 60 },
  // Верх
  { id: "vyshyvanka", slot: "top", name: "Вишиванка", emoji: "👕", starter: true },
  { id: "striped_shirt", slot: "top", name: "Тільник", emoji: "⛵", craft: { seaweed: 4, shell: 2 } },
  { id: "raincoat", slot: "top", name: "Дощовик", emoji: "🧥", craft: { seaweed: 3, fish_bone: 2 }, price: 45 },
  { id: "sweater", slot: "top", name: "Светр", emoji: "🧶", price: 35 },
  // Низ
  { id: "blue_pants", slot: "bottom", name: "Сині штани", emoji: "👖", starter: true },
  { id: "shorts", slot: "bottom", name: "Шорти", emoji: "🩳", craft: { seaweed: 2 } },
  { id: "sharovary", slot: "bottom", name: "Шаровари", emoji: "🟥", price: 40 },
];

const BY_ID = new Map(WEAR.map((w) => [w.id, w]));
const SLOT = new Map(WEAR_SLOTS.map((s) => [s.id, s]));
const STARTER = WEAR.filter((w) => w.starter).map((w) => w.id);
/** Речі в хатинці, біля яких можна перевдягнутися й пошити нове. */
const CLOSETS = ["closet", "wardrobe"];

/** Що є й що вдягнено: { hat, top, bottom, owned }. Невідоме (річ прибрали з гри) — на стартове. */
export async function getWear(userId) {
  const h = await getRedis().hGetAll(wearKey(userId));
  const owned = [...new Set([...STARTER, ...(h.own ?? "").split(",").filter((id) => BY_ID.has(id))])];
  const pick = (slot) => {
    const id = h[slot];
    if (id === "" && SLOT.get(slot).optional) return null;
    return id && owned.includes(id) && BY_ID.get(id).slot === slot ? id : STARTER.find((s) => BY_ID.get(s).slot === slot);
  };
  return { hat: pick("hat"), top: pick("top"), bottom: pick("bottom"), owned };
}

/** Одна дія за раз — подвійний тап не заплатить двічі. */
async function lock(userId) {
  if (!(await takeCooldown(userId, "wear", 300))) throw new GameError(429, "cooldown", "Секунду — ще перевдягаєшся.");
}

/** Пошити (how: 'craft') чи купити (how: 'buy') — і одразу вдягнути. */
export async function getWearItem(userId, itemId, how) {
  const def = typeof itemId === "string" ? BY_ID.get(itemId) : null;
  if (!def) throw badRequest("Невідомий одяг.");
  if (how !== "craft" && how !== "buy") throw badRequest("Пошити чи купити?");
  if (how === "craft" && !def.craft) throw badRequest("Це не пошиєш — лише купити.");
  if (how === "buy" && !def.price) throw badRequest("Це не купиш — лише пошити.");
  await lock(userId);
  if (!(await hasInteriorItem(userId, CLOSETS))) throw conflict("no_closet", "Спершу постав у хатинці шафу для одягу 👕");
  const cur = await getWear(userId);
  if (cur.owned.includes(def.id)) throw conflict("owned", "Це вже є в шафі.");
  if (how === "buy") {
    if ((await getBalance(userId)) < def.price) throw conflict("not_enough", `Потрібно ${def.price} ✨.`);
    await addBalance(userId, -def.price);
  } else if (!(await consumeResources(userId, def.craft))) throw conflict("not_enough", "Не вистачає матеріалів.");
  const owned = [...cur.owned, def.id];
  await getRedis().hSet(wearKey(userId), { own: owned.filter((id) => !STARTER.includes(id)).join(","), [def.slot]: def.id });
  return { item: def.id, how };
}

/** Вдягнути своє (або зняти капелюх: item null). */
export async function equipWear(userId, slot, itemId) {
  const s = typeof slot === "string" ? SLOT.get(slot) : null;
  if (!s) throw badRequest("Невідоме місце.");
  if (itemId == null) {
    if (!s.optional) throw badRequest("Без цього не можна.");
  } else {
    const def = typeof itemId === "string" ? BY_ID.get(itemId) : null;
    if (!def || def.slot !== slot) throw badRequest("Невідомий одяг.");
    if (!(await getWear(userId)).owned.includes(def.id)) throw conflict("not_owned", "Цього ще немає в шафі.");
  }
  await lock(userId);
  await getRedis().hSet(wearKey(userId), slot, itemId ?? "");
  return { slot, item: itemId ?? null };
}

/** Для каталогу. */
export function wearCatalog() {
  return { slots: WEAR_SLOTS, items: WEAR };
}

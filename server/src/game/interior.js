import { randomBytes } from "node:crypto";
import { addBalance, addResourceToInventory, consumeResources, getBalance, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { getHome } from "./homestead.js";
import { homeOwner } from "./household.js";
import { INTERIOR_DEFAULTS } from "./interiorDefaults.js";
import { interiorKey, takeCooldown } from "./keys.js";

/**
 * Пісочниця в хатинці: гравець сам розставляє меблі й вішає речі на стіни.
 * Ліжко, піч, стіл з ослінчиками, полиця й лежанка псів — постійні (з ними пов'язані дії),
 * решта — тут. Геометрія (розмір «ніжок», стіна чи підлога) — на клієнті, miniapp/src/game/walk/interior.js.
 *
 * Перше відкриття хати розставляє ті речі, що вже були на поточному рівні хатинки (безкоштовно,
 * тож і повернути за них нічого не можна). Далі гравець вільно їх пересуває, прибирає й докуповує.
 * Нові речі відкриваються з рівнем хатинки (level).
 *
 * Запис: hash «id → JSON»: { k, x, y } на підлозі або { k, w, a, h } на стіні
 * (w — 'back' | 'left' | 'right', a — де вздовж стіни, h — висота низу над підлогою); f: 1 — безкоштовна.
 */
export const INTERIOR = [
  // Меблі
  { id: "chest", cat: "furniture", name: "Скриня-посаг", emoji: "🧳", level: 1, cost: { plank: 4, metal_scrap: 1 } },
  { id: "bench", cat: "furniture", name: "Лава з подушками", emoji: "🪑", level: 1, cost: { plank: 3 } },
  { id: "boots", cat: "furniture", name: "Чоботи", emoji: "👢", level: 1, cost: { fish_bone: 1 } },
  { id: "washstand", cat: "furniture", name: "Умивальник", emoji: "🚰", level: 2, cost: { plank: 3, stone: 1 } },
  { id: "plant", cat: "furniture", name: "Вазон", emoji: "🪴", level: 2, cost: { twig: 2, stone: 1 } },
  { id: "armchair", cat: "furniture", name: "Крісло", emoji: "🛋", level: 3, cost: { plank: 4, balance: 30 } },
  { id: "spinning_wheel", cat: "furniture", name: "Прядка", emoji: "🧶", level: 3, cost: { plank: 3, twig: 4 } },
  { id: "aloe", cat: "furniture", name: "Алое", emoji: "🌵", level: 3, cost: { stone: 1, seaweed: 1 } },
  { id: "cat", cat: "furniture", name: "Котик", emoji: "🐈", level: 3, cost: { fish_bone: 3 } },
  // Кухня й комора
  { id: "water_barrel", cat: "kitchen", name: "Діжка з водою", emoji: "🛢", level: 1, cost: { plank: 2 } },
  { id: "oven_tools", cat: "kitchen", name: "Рогач і віник", emoji: "🧹", level: 1, cost: { twig: 3, metal_scrap: 1 } },
  { id: "firewood", cat: "kitchen", name: "Дрова", emoji: "🪵", level: 1, cost: { log: 2 } },
  { id: "pots", cat: "kitchen", name: "Макітра й глечик", emoji: "🏺", level: 1, cost: { stone: 2 } },
  { id: "sacks", cat: "kitchen", name: "Мішки з зерном", emoji: "🌾", level: 1, cost: { twig: 2 } },
  { id: "veg_crate", cat: "kitchen", name: "Скринька з городиною", emoji: "🥕", level: 1, cost: { plank: 1, twig: 1 } },
  { id: "basket", cat: "kitchen", name: "Кошик яблук", emoji: "🧺", level: 2, cost: { twig: 3 } },
  { id: "churn", cat: "kitchen", name: "Маслобійка", emoji: "🥛", level: 2, cost: { plank: 2 } },
  { id: "jars", cat: "kitchen", name: "Закрутки", emoji: "🫙", level: 2, cost: { glass_shard: 2 } },
  { id: "yoke", cat: "kitchen", name: "Коромисло з відрами", emoji: "🪣", level: 2, cost: { plank: 1, metal_scrap: 1 } },
  // Килими
  { id: "rag_rug", cat: "textile", name: "Кругла доріжка", emoji: "🟠", level: 1, cost: { twig: 2, seaweed: 2 } },
  { id: "rug", cat: "textile", name: "Вишитий килим", emoji: "🟥", level: 2, cost: { balance: 25 } },
  // На стіну
  { id: "herbs", cat: "wall", name: "Пучки трав", emoji: "🌿", level: 1, cost: { twig: 2 }, wall: true },
  { id: "rods", cat: "wall", name: "Вудки й тараня", emoji: "🎣", level: 1, cost: { twig: 3 }, wall: true },
  { id: "garlic", cat: "wall", name: "Вінок часнику", emoji: "🧄", level: 1, cost: { twig: 1 }, wall: true },
  { id: "peppers", cat: "wall", name: "Низка перцю", emoji: "🌶", level: 1, cost: { twig: 1 }, wall: true },
  { id: "hat_pegs", cat: "wall", name: "Кілочки з брилем", emoji: "👒", level: 1, cost: { plank: 1 }, wall: true },
  { id: "geraniums", cat: "wall", name: "Калачики", emoji: "🌺", level: 2, cost: { stone: 1, seaweed: 1 }, wall: true },
  { id: "mysnyk", cat: "wall", name: "Мисник", emoji: "🍽", level: 2, cost: { plank: 3, glass_shard: 1 }, wall: true },
  { id: "rushnyk", cat: "wall", name: "Рушник", emoji: "🧣", level: 2, cost: { balance: 10 }, wall: true },
  { id: "photos", cat: "wall", name: "Світлини", emoji: "🖼", level: 2, cost: { glass_shard: 1, plank: 1 }, wall: true },
  { id: "clock", cat: "wall", name: "Ходики", emoji: "🕰", level: 2, cost: { metal_scrap: 2, plank: 1 }, wall: true },
  { id: "icon", cat: "wall", name: "Покуть", emoji: "🕯", level: 3, cost: { old_coin: 1, balance: 20 }, wall: true },
  { id: "wreath", cat: "wall", name: "Віночок", emoji: "💐", level: 3, cost: { seaweed: 2, twig: 1 }, wall: true },
  { id: "kobza", cat: "wall", name: "Кобза", emoji: "🪕", level: 3, cost: { plank: 2, old_coin: 1 }, wall: true },
  { id: "mirror", cat: "wall", name: "Дзеркальце", emoji: "🪞", level: 3, cost: { glass_shard: 2, silver_piece: 1 }, wall: true },
  // Нові речі (аркуш home-decor.png)
  { id: "didukh", cat: "furniture", name: "Дідух", emoji: "🌾", level: 1, cost: { twig: 4 } },
  { id: "motanka", cat: "furniture", name: "Лялька-мотанка", emoji: "🪆", level: 1, cost: { twig: 1, seaweed: 1 } },
  { id: "cradle", cat: "furniture", name: "Колиска", emoji: "👶", level: 2, cost: { plank: 3, balance: 15 } },
  { id: "dresser", cat: "furniture", name: "Комод із вазою", emoji: "🗄", level: 2, cost: { plank: 5, metal_scrap: 1 } },
  { id: "rocking_chair", cat: "furniture", name: "Крісло-гойдалка", emoji: "🪑", level: 2, cost: { plank: 4 } },
  { id: "desk", cat: "furniture", name: "Письмовий стіл", emoji: "✒️", level: 2, cost: { plank: 4 } },
  { id: "lemon_tree", cat: "furniture", name: "Лимонне деревце", emoji: "🍋", level: 2, cost: { seaweed: 2, stone: 1, plank: 1 } },
  { id: "loom", cat: "furniture", name: "Ткацький верстат", emoji: "🧵", level: 3, cost: { plank: 6, twig: 6 } },
  { id: "wardrobe", cat: "furniture", name: "Розписна шафа", emoji: "🚪", level: 3, cost: { plank: 8, balance: 40 } },
  { id: "floor_clock", cat: "furniture", name: "Годинник із маятником", emoji: "🕰", level: 3, cost: { plank: 4, metal_scrap: 2, glass_shard: 1 } },
  { id: "gramophone", cat: "furniture", name: "Грамофон", emoji: "🎶", level: 3, cost: { metal_scrap: 3, old_coin: 1 } },
  { id: "sewing_machine", cat: "furniture", name: "Швейна машинка", emoji: "🪡", level: 3, cost: { metal_scrap: 4, plank: 2 } },
  { id: "yarn_basket", cat: "kitchen", name: "Кошик із клубками", emoji: "🧶", level: 1, cost: { twig: 2, seaweed: 1 } },
  { id: "runner", cat: "textile", name: "Смугаста доріжка", emoji: "🟨", level: 1, cost: { twig: 3 } },
  { id: "kilim", cat: "textile", name: "Гуцульський килим", emoji: "🟧", level: 2, cost: { balance: 30 } },
  { id: "plates", cat: "wall", name: "Розписні тарілки", emoji: "🍽", level: 1, cost: { stone: 2 }, wall: true },
  { id: "candle_shelf", cat: "wall", name: "Полиця зі свічками", emoji: "🕯", level: 1, cost: { plank: 1, twig: 1 }, wall: true },
  { id: "island_map", cat: "wall", name: "Мапа островів", emoji: "🗺", level: 1, cost: { twig: 1, shell: 1 }, wall: true },
  { id: "horseshoe", cat: "wall", name: "Підкова на щастя", emoji: "🧲", level: 1, cost: { metal_scrap: 1 }, wall: true },
  { id: "violin", cat: "wall", name: "Скрипка", emoji: "🎻", level: 2, cost: { plank: 2, fish_bone: 1 }, wall: true },
  { id: "embroidery", cat: "wall", name: "Вишивка в рамці", emoji: "🌹", level: 2, cost: { balance: 15 }, wall: true },
  { id: "pike_trophy", cat: "wall", name: "Трофей — щука", emoji: "🐟", level: 2, cost: { plank: 1, fish_bone: 2 }, wall: true },
  { id: "wall_lamp", cat: "wall", name: "Лампа-бра", emoji: "🪔", level: 2, cost: { metal_scrap: 1, glass_shard: 1 }, wall: true },
];

export const INTERIOR_MAX = 100;
const BY_ID = new Map(INTERIOR.map((d) => [d.id, d]));
/** Підлога й стіни кімнати — як FLOOR і WALL_H у miniapp/src/game/walk/home.js. */
const ROOM = { x0: 8, x1: 232, y0: 54, y1: 184, wallH: 54 };
const WALLS = new Set(["back", "left", "right"]);
const ITEM_ID = /^[a-z0-9]{6,16}$/;
const SEEDED = "~seeded";

const newId = () => randomBytes(6).toString("hex");

async function keyOf(userId) {
  return interiorKey((await homeOwner(userId)).owner);
}

async function houseLevel(userId) {
  return Math.max(1, (await getHome(userId)).levels.house ?? 1);
}

/** Запис → предмет для клієнта (або null, якщо зіпсований / невідомий). */
function toItem(id, raw) {
  try {
    const v = JSON.parse(raw);
    if (!BY_ID.has(v.k)) return null;
    const item = { id, k: v.k, free: v.f === 1 };
    if (v.w) Object.assign(item, { wall: v.w, at: v.a, h: v.h });
    else Object.assign(item, { x: v.x, y: v.y });
    return item;
  } catch {
    return null;
  }
}

/** Речі в хатинці; перше відкриття розставляє стандартні для поточного рівня. */
export async function getInterior(userId) {
  const r = getRedis();
  const k = await keyOf(userId);
  if (await r.hSetNX(k, SEEDED, "1")) {
    const lvl = await houseLevel(userId);
    const seed = {};
    for (const [from, to, kind, pos] of INTERIOR_DEFAULTS) {
      if (lvl < from || lvl > to) continue;
      seed[newId()] = JSON.stringify({ k: kind, ...pos, f: 1 });
    }
    if (Object.keys(seed).length) await r.hSet(k, seed);
  }
  const h = await r.hGetAll(k);
  const out = [];
  for (const [id, raw] of Object.entries(h)) {
    if (id === SEEDED) continue;
    const item = toItem(id, raw);
    if (item) out.push(item);
  }
  return out;
}

const int = (v) => Number.isInteger(v);

/** Перевірити місце: { x, y } для підлоги чи { wall, at, h } для стіни. */
function position(def, body) {
  if (def.wall) {
    const { wall, at, h } = body ?? {};
    const [lo, hi] = wall === "back" ? [ROOM.x0, ROOM.x1] : [ROOM.y0, ROOM.y1];
    if (!WALLS.has(wall) || !int(at) || !int(h) || at < lo || at > hi || h < 0 || h > ROOM.wallH) {
      throw badRequest("Сюди не повісиш.");
    }
    return { w: wall, a: at, h };
  }
  const { x, y } = body ?? {};
  if (!int(x) || !int(y) || x < ROOM.x0 || x > ROOM.x1 || y < ROOM.y0 || y > ROOM.y1 + 2) throw badRequest("Сюди не поставиш.");
  return { x, y };
}

function itemId(id) {
  if (typeof id !== "string" || !ITEM_ID.test(id)) throw badRequest("Невідома річ.");
  return id;
}

/** Одна зміна за раз — подвійний тап не спише ресурси двічі. */
async function lock(userId) {
  if (!(await takeCooldown((await homeOwner(userId)).owner, "interior", 250))) {
    throw new GameError(429, "cooldown", "Секунду — ще ставимо попереднє.");
  }
}

/** Оплата: ✨ (balance) і ресурси з рюкзака. */
async function pay(userId, cost) {
  const { balance = 0, ...res } = cost;
  if (balance && (await getBalance(userId)) < balance) throw conflict("not_enough", `Потрібно ${balance} ✨.`);
  if (Object.keys(res).length && !(await consumeResources(userId, res))) throw conflict("not_enough", "Не вистачає матеріалів.");
  if (balance) await addBalance(userId, -balance);
}

export async function placeInterior(userId, body) {
  const def = typeof body?.kind === "string" ? BY_ID.get(body.kind) : null;
  if (!def) throw badRequest("Невідома річ.");
  const pos = position(def, body);
  if (def.level > (await houseLevel(userId))) throw conflict("locked", `Відкриється, коли хатинка стане ${def.level}-го рівня.`);
  await lock(userId);
  const r = getRedis();
  const k = await keyOf(userId);
  if ((await r.hLen(k)) - 1 >= INTERIOR_MAX) throw conflict("full", `У хаті вже ${INTERIOR_MAX} речей — прибери щось.`);
  await pay(userId, def.cost);
  const id = newId();
  await r.hSet(k, id, JSON.stringify({ k: def.id, ...pos }));
  return { item: toItem(id, JSON.stringify({ k: def.id, ...pos })) };
}

export async function moveInterior(userId, id, body) {
  itemId(id);
  await lock(userId);
  const r = getRedis();
  const k = await keyOf(userId);
  const raw = await r.hGet(k, id);
  if (!raw) throw new GameError(404, "not_found", "Цієї речі вже немає.");
  const old = JSON.parse(raw);
  const pos = position(BY_ID.get(old.k), body);
  const next = { k: old.k, ...pos, ...(old.f ? { f: 1 } : {}) };
  await r.hSet(k, id, JSON.stringify(next));
  return { item: toItem(id, JSON.stringify(next)) };
}

export async function removeInterior(userId, id) {
  itemId(id);
  await lock(userId);
  const r = getRedis();
  const k = await keyOf(userId);
  const raw = await r.hGet(k, id);
  if (!raw) throw new GameError(404, "not_found", "Цієї речі вже немає.");
  if ((await r.hDel(k, id)) !== 1) throw new GameError(404, "not_found", "Цієї речі вже немає.");
  const v = JSON.parse(raw);
  // Стартові речі були подарунком — за них нічого не повертаємо (інакше їх можна було б «здавати»).
  const refund = v.f ? {} : (BY_ID.get(v.k)?.cost ?? {});
  for (const [res, n] of Object.entries(refund)) {
    if (res === "balance") await addBalance(userId, n);
    else await addResourceToInventory(userId, res, n);
  }
  return { refund };
}

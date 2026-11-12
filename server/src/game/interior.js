import { randomBytes } from "node:crypto";
import { addBalance, addResourceToInventory, consumeResources, getBalance, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { getHome } from "./homestead.js";
import { homeOwner } from "./household.js";
import { floorKey, interiorKey, takeCooldown } from "./keys.js";

/**
 * Пісочниця в хатинці: гравець сам розставляє меблі й вішає речі на стіни.
 * Хата починається порожньою, і все в ній — зокрема ліжко, піч, стіл і лежанка псів — можна
 * поставити, пересунути й прибрати. Дії (поспати, готувати, читати) — від самих речей, де б вони
 * не стояли. Геометрія (розмір «ніжок», стіна чи підлога) — на клієнті, miniapp/src/game/walk/interior.js.
 * Нові речі відкриваються з рівнем хатинки (level).
 *
 * Запис: hash «id → JSON»: { k, x, y } на підлозі або { k, w, a, h } на стіні
 * (w — 'back' | 'left' | 'right', a — де вздовж стіни, h — висота низу над підлогою); f: 1 — безкоштовна.
 */
export const INTERIOR = [
  // Основне (колись стояло в хаті завжди)
  { id: "bed", cat: "furniture", name: "Ліжко з периною", emoji: "🛏", level: 1, cost: { plank: 4, seaweed: 1 } },
  { id: "stove", cat: "kitchen", name: "Піч", emoji: "🔥", level: 1, cost: { stone: 6 } },
  { id: "table", cat: "furniture", name: "Стіл зі скатертиною", emoji: "🍞", level: 1, cost: { plank: 3 } },
  { id: "stool", cat: "furniture", name: "Ослінчик", emoji: "🪑", level: 1, cost: { plank: 1 } },
  { id: "dog_bed", cat: "furniture", name: "Лежанка для псів", emoji: "🐕", level: 1, cost: { twig: 2, seaweed: 1 } },
  { id: "shelf", cat: "furniture", name: "Полиця з книжками", emoji: "📖", level: 2, cost: { plank: 3 } },
  { id: "lamp_table", cat: "furniture", name: "Стіл із гасовою лампою", emoji: "🪔", level: 3, cost: { plank: 3, metal_scrap: 1, glass_shard: 1 } },
  // Меблі
  { id: "chest", cat: "furniture", name: "Скриня-посаг", emoji: "🧳", level: 1, cost: { plank: 4, metal_scrap: 1 } },
  // Шафа для одягу: біля неї перевдягаються й шиють новий одяг (wardrobe.js). Розписна шафа — теж.
  { id: "closet", cat: "furniture", name: "Шафа для одягу", emoji: "👕", level: 1, cost: { plank: 4, twig: 2 } },
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
  // Ще партія (намальована локальною моделлю — miniapp/scripts/sd-home-items.mjs)
  { id: "bookcase", cat: "furniture", name: "Книжкова шафа", emoji: "📚", level: 1, cost: { plank: 5 } },
  { id: "easel", cat: "furniture", name: "Мольберт", emoji: "🎨", level: 1, cost: { plank: 2, twig: 2 } },
  { id: "rocking_horse", cat: "furniture", name: "Коник-гойдалка", emoji: "🐴", level: 1, cost: { plank: 3 } },
  { id: "sofa", cat: "furniture", name: "Оксамитова канапа", emoji: "🛋", level: 2, cost: { plank: 3, seaweed: 3, balance: 20 } },
  { id: "aquarium", cat: "furniture", name: "Акваріум", emoji: "🐠", level: 2, cost: { glass_shard: 3, plank: 2 } },
  { id: "globe", cat: "furniture", name: "Глобус", emoji: "🌍", level: 2, cost: { plank: 2, metal_scrap: 1 } },
  { id: "birdcage", cat: "furniture", name: "Клітка з канаркою", emoji: "🐤", level: 2, cost: { metal_scrap: 2, twig: 1 } },
  { id: "piano", cat: "furniture", name: "Піаніно", emoji: "🎹", level: 3, cost: { plank: 8, metal_scrap: 2, balance: 40 } },
  { id: "telescope", cat: "furniture", name: "Підзорна труба", emoji: "🔭", level: 3, cost: { metal_scrap: 3, glass_shard: 2 } },
  { id: "tea_table", cat: "kitchen", name: "Столик із чаєм", emoji: "🫖", level: 1, cost: { plank: 2, stone: 1 } },
  { id: "round_rug", cat: "textile", name: "Плетений овальний килимок", emoji: "🔵", level: 1, cost: { twig: 2, seaweed: 2 } },
  { id: "ship_wheel", cat: "wall", name: "Штурвал", emoji: "☸️", level: 1, cost: { plank: 3 }, wall: true },
  { id: "life_ring", cat: "wall", name: "Рятувальний круг", emoji: "🛟", level: 1, cost: { seaweed: 2, twig: 1 }, wall: true },
  { id: "sea_painting", cat: "wall", name: "Картина з маяком", emoji: "🖼", level: 2, cost: { plank: 1, balance: 15 }, wall: true },
  { id: "ship_bottle", cat: "furniture", name: "Кораблик у пляшці", emoji: "⛵", level: 2, cost: { glass_shard: 1, plank: 1, twig: 1 } },
  // Сучасна колекція (miniapp/scripts/modern-art.mjs): лампи, екрани, неон і гірлянди світять у хаті.
  { id: "arc_lamp", cat: "modern", name: "Дугова лампа", emoji: "💡", level: 1, cost: { metal_scrap: 2, stone: 1, glass_shard: 1 } },
  { id: "side_lamp", cat: "modern", name: "Столик із лампою", emoji: "🛋", level: 1, cost: { plank: 2, glass_shard: 1 } },
  { id: "sconce", cat: "modern", name: "Бра-куля", emoji: "🔆", level: 1, cost: { metal_scrap: 1, glass_shard: 1 }, wall: true },
  { id: "fairy_lights", cat: "modern", name: "Гірлянда-лампочки", emoji: "✨", level: 1, cost: { glass_shard: 2, twig: 1 }, wall: true },
  { id: "sofa_modern", cat: "modern", name: "Канапа-букле", emoji: "🛋", level: 1, cost: { plank: 4, seaweed: 3, balance: 25 } },
  { id: "coffee_table", cat: "modern", name: "Журнальний столик", emoji: "☕", level: 1, cost: { plank: 3, metal_scrap: 1 } },
  { id: "monstera", cat: "modern", name: "Монстера", emoji: "🪴", level: 1, cost: { seaweed: 3, stone: 1 } },
  { id: "snake_plant", cat: "modern", name: "Сансев'єрія", emoji: "🌱", level: 1, cost: { seaweed: 1, stone: 1 } },
  { id: "bean_bag", cat: "modern", name: "Крісло-мішок", emoji: "🟡", level: 1, cost: { seaweed: 3, twig: 1 } },
  { id: "geo_rug", cat: "modern", name: "Берберський килим", emoji: "⬜", level: 1, cost: { twig: 3, seaweed: 2 } },
  { id: "shag_rug", cat: "modern", name: "Пухнастий килимок", emoji: "🩷", level: 1, cost: { seaweed: 3 } },
  { id: "abstract_art", cat: "modern", name: "Абстрактна картина", emoji: "🖼", level: 1, cost: { plank: 1, balance: 15 }, wall: true },
  { id: "clock_modern", cat: "modern", name: "Годинник-мінімалізм", emoji: "🕒", level: 1, cost: { metal_scrap: 1, glass_shard: 1 }, wall: true },
  { id: "macrame", cat: "modern", name: "Макраме", emoji: "🪢", level: 1, cost: { twig: 3, plank: 1 }, wall: true },
  { id: "platform_bed", cat: "modern", name: "Ліжко-платформа", emoji: "🛏", level: 2, cost: { plank: 6, seaweed: 3, balance: 30 } },
  { id: "kitchen", cat: "modern", name: "Сучасна кухня", emoji: "🍳", level: 2, cost: { plank: 5, stone: 4, metal_scrap: 2 } },
  { id: "fridge", cat: "modern", name: "Ретро-холодильник", emoji: "🧊", level: 2, cost: { metal_scrap: 4, glass_shard: 1 } },
  { id: "cube_shelf", cat: "modern", name: "Стелаж-куби", emoji: "📚", level: 2, cost: { plank: 6 } },
  { id: "dining_set", cat: "modern", name: "Обідній куточок", emoji: "🌷", level: 2, cost: { plank: 5, stone: 1 } },
  { id: "lounge_chair", cat: "modern", name: "Крісло-лаунж", emoji: "🪑", level: 2, cost: { plank: 3, fish_bone: 2, metal_scrap: 1 } },
  { id: "cat_tree", cat: "modern", name: "Котячий будиночок", emoji: "🐈", level: 2, cost: { plank: 3, twig: 4 } },
  { id: "record_player", cat: "modern", name: "Програвач платівок", emoji: "💿", level: 2, cost: { plank: 2, metal_scrap: 2, old_coin: 1 } },
  { id: "gallery", cat: "modern", name: "Галерея рамок", emoji: "🖼", level: 2, cost: { plank: 2, glass_shard: 2 }, wall: true },
  { id: "float_shelf", cat: "modern", name: "Навісна полиця з плющем", emoji: "🌿", level: 2, cost: { plank: 2, seaweed: 1 }, wall: true },
  { id: "round_mirror", cat: "modern", name: "Кругле дзеркало", emoji: "🪞", level: 2, cost: { glass_shard: 2, metal_scrap: 1 }, wall: true },
  { id: "neon_sign", cat: "modern", name: "Неонова вивіска", emoji: "💖", level: 2, cost: { glass_shard: 3, metal_scrap: 1 }, wall: true },
  { id: "tv_console", cat: "modern", name: "Тумба з телевізором", emoji: "📺", level: 3, cost: { plank: 4, metal_scrap: 3, glass_shard: 3 } },
  { id: "desk_setup", cat: "modern", name: "Робоче місце", emoji: "💻", level: 3, cost: { plank: 4, metal_scrap: 2, glass_shard: 2 } },
  { id: "fireplace", cat: "modern", name: "Сучасний камін", emoji: "🔥", level: 3, cost: { stone: 8, plank: 2, balance: 40 } },
  { id: "robot_vacuum", cat: "modern", name: "Робот-пилосос", emoji: "🤖", level: 3, cost: { metal_scrap: 3, silver_piece: 1 } },
];

export const INTERIOR_MAX = 100;

/**
 * Підлога хатинки: візерунок купується один раз (відкривається з рівнем хатинки), а колір
 * купленого візерунку міняється безкоштовно. Дошки є від початку. Арт і назви кольорів —
 * на клієнті (miniapp/src/game/walk/floors.js), FLOOR_COLORS — скільки там кольорів у візерунку.
 */
export const FLOORS = [
  { id: "boards", name: "Дошки", emoji: "🪵", level: 1, cost: {} },
  { id: "clay", name: "Глиняна доливка", emoji: "🟤", level: 1, cost: { stone: 3, seaweed: 2 } },
  { id: "flagstone", name: "Кам'яні плити", emoji: "🪨", level: 1, cost: { stone: 10 } },
  { id: "herringbone", name: "Паркет «ялинка»", emoji: "🟫", level: 2, cost: { plank: 8, balance: 20 } },
  { id: "checker", name: "Кахлі-шахівниця", emoji: "🏁", level: 2, cost: { stone: 6, glass_shard: 1 } },
  { id: "hex", name: "Шестикутна плитка", emoji: "🔶", level: 3, cost: { stone: 8, balance: 25 } },
];
export const FLOOR_COLORS = 4;
const FLOOR_BY_ID = new Map(FLOORS.map((f) => [f.id, f]));
const DEFAULT_FLOOR = { p: "boards", c: 0 };
const BY_ID = new Map(INTERIOR.map((d) => [d.id, d]));
/** Підлога й стіни кімнати — як FLOOR і WALL_H у miniapp/src/game/walk/home.js. */
const ROOM = { x0: 8, x1: 232, y0: 54, y1: 184, wallH: 54 };
const WALLS = new Set(["back", "left", "right"]);
const ITEM_ID = /^[a-z0-9]{6,16}$/;
/** Службові поля в hash (не речі): позначка, що стартові подарунки вже прибрано. */
const SEEDED = "~seeded";
const EMPTIED = "~emptied";
const isMeta = (field) => field.startsWith("~");

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

/**
 * Речі в хатинці. Раніше перше відкриття розставляло безкоштовні стартові речі (f: 1) — тепер хата
 * починається порожньою, тож ті подарунки один раз прибираємо (куплене гравцем лишається).
 */
export async function getInterior(userId) {
  const r = getRedis();
  const k = await keyOf(userId);
  let h = await r.hGetAll(k);
  if (!h[EMPTIED] && (await r.hSetNX(k, EMPTIED, "1"))) {
    const gifts = Object.entries(h)
      .filter(([id, raw]) => !isMeta(id) && raw.includes('"f":1'))
      .map(([id]) => id);
    if (gifts.length || h[SEEDED]) await r.hDel(k, [...gifts, SEEDED]);
    h = await r.hGetAll(k);
  }
  const out = [];
  for (const [id, raw] of Object.entries(h)) {
    if (isMeta(id)) continue;
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

/** Чи стоїть у хатинці хоч одна з речей kinds (наприклад шафа для одягу). */
export async function hasInteriorItem(userId, kinds) {
  const all = await getRedis().hVals(await keyOf(userId));
  return all.some((raw) => {
    try {
      return kinds.includes(JSON.parse(raw).k);
    } catch {
      return false;
    }
  });
}

export async function placeInterior(userId, body) {
  const def = typeof body?.kind === "string" ? BY_ID.get(body.kind) : null;
  if (!def) throw badRequest("Невідома річ.");
  const pos = position(def, body);
  if (def.level > (await houseLevel(userId))) throw conflict("locked", `Відкриється, коли хатинка стане ${def.level}-го рівня.`);
  await lock(userId);
  const r = getRedis();
  const k = await keyOf(userId);
  const count = (await r.hKeys(k)).filter((f) => !isMeta(f)).length;
  if (count >= INTERIOR_MAX) throw conflict("full", `У хаті вже ${INTERIOR_MAX} речей — прибери щось.`);
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

/** Підлога зараз і які візерунки вже куплено. */
export async function getFloor(userId) {
  const h = await getRedis().hGetAll(floorKey((await homeOwner(userId)).owner));
  const p = FLOOR_BY_ID.has(h.p) ? h.p : DEFAULT_FLOOR.p;
  const c = Number(h.c);
  const owned = new Set([DEFAULT_FLOOR.p, ...(h.own ?? "").split(",").filter((id) => FLOOR_BY_ID.has(id))]);
  return { p, c: Number.isInteger(c) && c >= 0 && c < FLOOR_COLORS ? c : 0, owned: [...owned] };
}

/** Постелити підлогу { pattern, color }: новий візерунок — купити, свій — лише змінити колір. */
export async function setFloor(userId, body) {
  const def = typeof body?.pattern === "string" ? FLOOR_BY_ID.get(body.pattern) : null;
  const color = body?.color;
  if (!def || !int(color) || color < 0 || color >= FLOOR_COLORS) throw badRequest("Невідома підлога.");
  await lock(userId);
  const k = floorKey((await homeOwner(userId)).owner);
  const cur = await getFloor(userId);
  const bought = !cur.owned.includes(def.id);
  if (bought) {
    if (def.level > (await houseLevel(userId))) throw conflict("locked", `Відкриється, коли хатинка стане ${def.level}-го рівня.`);
    await pay(userId, def.cost);
    cur.owned.push(def.id);
  }
  await getRedis().hSet(k, { p: def.id, c: String(color), own: cur.owned.join(",") });
  return { floor: { p: def.id, c: color, owned: cur.owned }, bought };
}

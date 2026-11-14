import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { addResourceToInventory, consumeResources, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { decoKey, takeCooldown } from "./keys.js";
import { NET } from "./nodes.js";
import { RUBBER, rubberReady } from "./rubber.js";
import { TREE, plantedTree } from "./trees.js";

/**
 * Пісочниця рідного острова: гравець сам розставляє декор.
 * Лише Mini App. Ціна — ресурси з рюкзака; прибрав — повернули все, тож експериментувати не шкода.
 * Геометрія (скільки клітинок займає, чи це підлога) — на клієнті, miniapp/src/game/walk/decor.js.
 * У спільному домі декор теж спільний: платить той, хто ставить, повертається тому, хто прибирає.
 */
/**
 * Розділи будівництва (cat): survival — робочі споруди (у Mini App — у «Будові» разом із будівлями),
 * power — електрика (генератори з watts), garden — посадки, що ростуть і дають ресурс,
 * decor — усе, що лише прикрашає острів.
 */
export const DECOR = [
  // Виживання: з цим можна працювати (верстат — інструменти й дошки, комора — насіння й продаж урожаю).
  { id: "workbench", cat: "survival", name: "Верстат", emoji: "🪚", cost: { twig: 4, stone: 2 } },
  { id: "seed_stand", cat: "survival", name: "Комора городника", emoji: "🌱", cost: { twig: 3 } },
  { id: "sprinkler", cat: "survival", name: "Дощувач", emoji: "💦", cost: { plank: 2, metal_scrap: 2 } },
  // Поміст: дощатий майданчик на воді. Ступається й на ньому ставлять усе, як на березі.
  // Кладеться у воду чи на пляж біля води, поруч із сушею або іншим помостом (checkPlatform).
  {
    id: "platform",
    cat: "survival",
    name: "Поміст",
    emoji: "🪵",
    cost: { plank: 2, twig: 2 },
    platform: true,
    foot: [2, 2],
    hint: "Став на воду чи пляж поруч із берегом чи іншим помостом — по ньому ходять і ставлять речі, як на суші.",
  },
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
  // Вітряк дає електрику (watts, server/src/game/power.js). Дріт тягнуть на верстаті з мідного злиточка.
  {
    id: "windmill",
    cat: "power",
    name: "Вітряк",
    emoji: "🌬️",
    cost: { plank: 6, log: 2, stone: 4, bare_wire: 4 },
    watts: 40,
    hint: "Крила крутить вітер — що 10 с від 0 до 40 Вт, як подме. Протягни кабель до акумулятора.",
  },
  // Акумулятор запасає енергію вітряків своєї мережі (energy.js); його роблять на верстаті (craft.js).
  {
    id: "battery",
    cat: "power",
    name: "Акумулятор",
    emoji: "🔋",
    cost: { battery: 1 },
    store: 50,
    hint: "Зроби на верстаті 🪚, потім став тут. Запасає до 50 Вт·год від вітряків своєї мережі — для печі.",
  },
  // Електропіч плавить скло, мідь і залізо, беручи енергію з акумуляторів своєї мережі (furnace.js).
  {
    id: "furnace",
    cat: "power",
    name: "Електропіч",
    emoji: "🔥",
    cost: { stone: 8, plank: 2, metal_scrap: 3, bare_wire: 3 },
    furnace: true,
    hint: "Плавить скло, мідь і залізо. Бере енергію з акумулятора в тій самій мережі.",
  },
  // Сонячна панель дає струм удень (solar.js: сонце над Києвом × погода). Саму панель роблять на електроверстаті.
  {
    id: "solar",
    cat: "power",
    name: "Сонячна панель",
    emoji: "☀️",
    cost: { solar_panel: 1 },
    watts: 60,
    solar: true,
    hint: "Зроби на електроверстаті ⚙️, потім став тут. Удень дає до 60 Вт (у хмари — менше, вночі — нічого).",
  },
  // Електроверстат: складні рецепти (пластини, ізольований дріт, сонячні панелі) за енергію мережі (furnace.js → MACHINES).
  {
    id: "e_bench",
    cat: "power",
    name: "Електроверстат",
    emoji: "⚙️",
    cost: { plank: 4, iron_ingot: 4, obsidian: 2, bare_wire: 4, glass: 1 },
    machine: true,
    hint: "Пластини, ізольований дріт і сонячні панелі. Бере енергію з акумулятора в тій самій мережі.",
  },
  // Посаджене дерево росте само й за TREE.growMs стає справжнім деревом (server/src/game/trees.js).
  {
    id: TREE.kind,
    cat: "garden",
    name: "Посадка",
    emoji: "🌰",
    cost: { tree_seed: 1 },
    grows: "tree",
    hint: `Насінина проросте й за ${TREE.growMs / 60_000} хв стане деревом, яке можна рубати.`,
  },
  // Гевея не рубається: доросла дає каучук, його збирають з чашки на стовбурі (server/src/game/rubber.js).
  {
    id: RUBBER.kind,
    cat: "garden",
    name: "Гевея",
    emoji: "🌳",
    cost: { rubber_seed: 1 },
    grows: "rubber",
    hint: `Каучукове дерево: росте ${RUBBER.growMs / 60_000} хв, потім дає ${RUBBER.perHour} каучуку щогодини — збирай з чашки.`,
  },
  { id: "wildflowers", cat: "decor", name: "Польові квіти", emoji: "🌼", cost: {} },
  { id: "flower_bed", cat: "decor", name: "Клумба", emoji: "🌷", cost: { twig: 1 } },
  { id: "sunflowers", cat: "decor", name: "Соняшники", emoji: "🌻", cost: { seaweed: 1 } },
  { id: "bush", cat: "decor", name: "Кущ", emoji: "🌿", cost: { twig: 2 } },
  { id: "sapling", cat: "decor", name: "Деревце", emoji: "🌱", cost: { twig: 3 } },
  { id: "pine", cat: "decor", name: "Ялинка", emoji: "🌲", cost: { log: 2 } },
  { id: "pumpkins", cat: "decor", name: "Гарбузи", emoji: "🎃", cost: { seaweed: 2 } },
  { id: "stepping_stone", cat: "decor", name: "Плита", emoji: "🪨", cost: {} },
  { id: "cobble_tile", cat: "decor", name: "Бруківка", emoji: "🧱", cost: { stone: 1 } },
  { id: "rock", cat: "decor", name: "Валун", emoji: "🪨", cost: { stone: 1 } },
  { id: "stone_lantern", cat: "decor", name: "Кам'яний ліхтар", emoji: "🏮", cost: { stone: 3, glass_shard: 1 } },
  { id: "well", cat: "decor", name: "Криниця", emoji: "⛲", cost: { stone: 6, plank: 2 } },
  { id: "plank_floor", cat: "decor", name: "Настил", emoji: "🟫", cost: { plank: 1 } },
  { id: "fence", cat: "decor", name: "Тин", emoji: "🪵", cost: { twig: 2 } },
  { id: "bench", cat: "decor", name: "Лавка", emoji: "🪑", cost: { plank: 3 } },
  { id: "barrel", cat: "decor", name: "Бочка", emoji: "🛢", cost: { plank: 2 } },
  { id: "crates", cat: "decor", name: "Ящики", emoji: "📦", cost: { plank: 2 } },
  { id: "hay", cat: "decor", name: "Копиця", emoji: "🌾", cost: { twig: 3 } },
  { id: "signpost", cat: "decor", name: "Вказівник", emoji: "🪧", cost: { plank: 1 } },
  { id: "lamp_post", cat: "decor", name: "Ліхтар", emoji: "💡", cost: { metal_scrap: 1, glass_shard: 1 } },
  { id: "campfire", cat: "decor", name: "Вогнище", emoji: "🔥", cost: { log: 2, stone: 2 } },
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
/** Суша острова — та сама маска, що atlas.walk у Mini App (клітинки 8×8). Помост ставлять лише у воду. */
const LAND = JSON.parse(readFileSync(new URL("./island-walk.json", import.meta.url), "utf8"));

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

/** Клітинки [cx, cy] під «ніжками» (як у onShore). */
function footCells(def, x, y) {
  const { cell } = LAND;
  const [fw, fh] = def.foot;
  const x0 = x - (fw * cell) / 2;
  const y0 = y - fh * cell;
  const out = [];
  for (let cy = Math.floor(y0 / cell); cy <= Math.floor((y - 1) / cell); cy++)
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor((x0 + fw * cell - 1) / cell); cx++) out.push([cx, cy]);
  return out;
}

/**
 * Помост: лише у воді, і або поруч із сушею, або поруч з іншим помостом — щоб до нього можна було дійти.
 * decor — поточний декор дому; selfId — сам помост, якщо його переносять (його не рахуємо).
 */
function checkPlatform(def, x, y, decor, selfId = null) {
  const { rows } = LAND;
  const inMap = (cx, cy) => cy >= 0 && cy < rows.length && cx >= 0 && cx < rows[0].length;
  const cells = footCells(def, x, y);
  if (cells.some(([cx, cy]) => !inMap(cx, cy))) throw badRequest("Сюди поставити не вийде.");
  // Можна у воду й на пляж: хоч одна клітинка — вода або межує з водою (не вглиб острова).
  const water = (cx, cy) => inMap(cx, cy) && rows[cy][cx] !== "1";
  const nearWater = cells.some(
    ([cx, cy]) => water(cx, cy) || water(cx + 1, cy) || water(cx - 1, cy) || water(cx, cy + 1) || water(cx, cy - 1)
  );
  if (!nearWater) throw conflict("not_water", `${def.emoji} ${def.name}: став у воду чи на пляж біля води.`);
  const deck = new Set();
  for (const d of decor) {
    if (d.id === selfId || !BY_ID.get(d.k)?.platform) continue;
    for (const [cx, cy] of footCells(def, d.x, d.y)) deck.add(`${cx},${cy}`);
  }
  if (cells.some(([cx, cy]) => deck.has(`${cx},${cy}`))) throw conflict("busy", `${def.emoji} ${def.name}: тут уже є помост.`);
  const walkable = (cx, cy) => (inMap(cx, cy) && rows[cy][cx] === "1") || deck.has(`${cx},${cy}`);
  const touches = cells.some(([cx, cy]) => walkable(cx, cy) || walkable(cx + 1, cy) || walkable(cx - 1, cy) || walkable(cx, cy + 1) || walkable(cx, cy - 1));
  if (!touches) throw conflict("not_connected", `${def.emoji} ${def.name}: став поруч із берегом чи іншим помостом.`);
}

/** Предмет у воді — лише на мілині; на суші — як і раніше, де завгодно в межах мапи. */
function checkSpot(def, x, y) {
  if (def.water && !onShore(def, x, y)) throw conflict("not_water", `${def.emoji} ${def.name}: став у воду біля берега.`);
}
/** Межі мапи острова в пікселях арту — як MAP у walk/layout.js. */
const MAP_W = 512;
const MAP_H = 448;
const ITEM_ID = /^[a-z0-9]{6,16}$/;

/** @returns {Promise<{ id: string, k: string, x: number, y: number, t?: number, sp?: string, c?: number, nc?: number }[]>} */
export async function getDecor(userId) {
  const h = await getRedis().hGetAll(await key(userId));
  const out = [];
  for (const [id, raw] of Object.entries(h)) {
    try {
      const v = JSON.parse(raw);
      // Посаджене дерево ще й пам'ятає, коли посадили (t) і що виросте (sp).
      // Гевея — ще й коли востаннє збирали каучук (c).
      // Сітка — ще nc: коли востаннє зарахували улов (nets.js). Акумулятор — e: скільки Вт·год у ньому (energy.js).
      if (BY_ID.has(v.k))
        out.push({ id, k: v.k, x: v.x, y: v.y, ...(v.t && { t: v.t }), ...(v.sp && { sp: v.sp }), ...(v.c && { c: v.c }), ...(v.nc && { nc: v.nc }), ...(v.e != null && { e: v.e }) });
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
  if (def.platform) checkPlatform(def, pos.x, pos.y, await getDecor(userId));
  if (def.limit) {
    const same = (await r.hVals(k)).filter((raw) => raw.includes(`"k":"${def.id}"`)).length;
    if (same >= def.limit) throw conflict("limit", `${def.emoji} Більше ${def.limit} сіток пляж не прогодує.`);
  }
  if (Object.keys(def.cost).length && !(await consumeResources(userId, def.cost))) {
    throw conflict("not_enough", "Не вистачає матеріалів.");
  }
  const id = randomBytes(6).toString("hex");
  const item = { k: def.id, ...pos, ...(def.grows === "tree" ? plantedTree() : def.grows ? { t: Date.now() } : {}), ...(def.id === NET.kind && { nc: Date.now() }) };
  await r.hSet(k, id, JSON.stringify(item));
  return { item: { id, ...item } };
}

export async function moveDecor(userId, id, x, y) {
  itemId(id);
  const pos = coords(x, y);
  await lock(userId);
  const r = getRedis();
  const hk = await key(userId);
  const raw = await r.hGet(hk, id);
  if (!raw) throw new GameError(404, "not_found", "Цієї прикраси вже немає.");
  // Переносимо разом з усім, що прикраса пам'ятає (посаджене дерево — коли посадили й що виросте).
  const old = JSON.parse(raw);
  if (BY_ID.has(old.k)) checkSpot(BY_ID.get(old.k), pos.x, pos.y);
  if (BY_ID.get(old.k)?.platform) checkPlatform(BY_ID.get(old.k), pos.x, pos.y, await getDecor(userId), id);
  const item = { ...old, ...pos };
  await r.hSet(hk, id, JSON.stringify(item));
  return { item: { id, ...item } };
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
  const old = JSON.parse(raw);
  const def = BY_ID.get(old.k);
  const refund = { ...(def?.cost ?? {}) };
  // Викопав гевею — каучук із чашки теж твій.
  if (old.k === RUBBER.kind) {
    const n = rubberReady(old);
    if (n > 0) refund.rubber = n;
  }
  for (const [res, n] of Object.entries(refund)) await addResourceToInventory(userId, res, n);
  return { refund };
}

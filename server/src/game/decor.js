import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { addResourceToInventory, consumeResources, getRedis } from "../bot.js";
import { pruneCables } from "./cables.js";
import { BELT_CRATE } from "./belt-def.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { FISH_HUT, hutRefund } from "./fishhut-def.js";
import { homeOwner } from "./household.js";
import { PLATFORM_REACH, onIsland } from "./island-bounds.js";
import { decoKey, takeCooldown } from "./keys.js";
import { NET } from "./nodes.js";
import { RUBBER, rubberReady } from "./rubber.js";
import { MINE, mineReady } from "./mine.js";
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
  // Шахта сама добуває камінь (server/src/game/mine.js): тапнув — забрав, що набралося.
  {
    id: MINE.kind,
    cat: "survival",
    name: "Шахта",
    emoji: "⛏️",
    cost: { plank: 6, log: 4, stone: 10 },
    port: MINE.port,
    hint: `Сама добуває камінь — по одному що ${MINE.everyMs / 1000} с, вміщає ${MINE.cap}. Тапни, щоб забрати, або підведи від жолоба праворуч конвеєр.`,
  },
  // Приймальна скриня: сюди конвеєр (belts.js) звозить рибу з хат і камінь із шахт. Тап — забрати все.
  {
    id: BELT_CRATE.kind,
    cat: "belt",
    name: "Скриня конвеєра",
    emoji: "📦",
    cost: { plank: 4, twig: 2 },
    foot: BELT_CRATE.foot,
    crate: true,
    cap: BELT_CRATE.cap,
    hint: `Кінець конвеєра: стрічка звозить сюди рибу з хати й камінь із шахти. Вміщає ${BELT_CRATE.cap}, тапни — забрати все.`,
  },
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
  // Рибальська хата: на березі чи помості біля води сама ловить рибу за енергію своєї мережі (fishhut.js).
  // Мотор для неї — з електроверстата. shoreline — хоч одна клітинка довкола «ніжок» має бути відкритою водою.
  {
    id: FISH_HUT.kind,
    cat: "power",
    name: "Рибальська хата",
    emoji: "🛖",
    cost: { plank: 8, log: 2, iron_ingot: 2, insulated_wire: 2, motor: 1 },
    foot: [6, 3],
    shoreline: true,
    hut: true,
    levels: FISH_HUT.levels.map((l) => ({ cap: l.cap, everyMin: l.everyMs / 60_000, cost: l.cost ?? null })),
    energy: FISH_HUT.energy,
    port: FISH_HUT.port,
    hint: `Став на березі чи помості біля води й протягни кабель від акумулятора. Ловить рибу сама — ${FISH_HUT.energy} Вт·год за рибу; вміщає ${FISH_HUT.levels[0].cap}, покращення — більше.`,
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

export const DECOR_MAX = 2500;

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
  // Помости кладуть і в море довкола мапи — до PLATFORM_REACH клітинок від краю (island-bounds.js).
  const R = PLATFORM_REACH;
  const inReach = (cx, cy) => cy >= -R && cy < rows.length + R && cx >= -R && cx < rows[0].length + R;
  const isLand = (cx, cy) => rows[cy]?.[cx] === "1"; // за межами мапи — море
  const cells = footCells(def, x, y);
  if (cells.some(([cx, cy]) => !inReach(cx, cy))) throw badRequest("Сюди поставити не вийде — задалеко від острова.");
  // Можна у воду й на пляж: хоч одна клітинка — вода або межує з водою (не вглиб острова).
  const water = (cx, cy) => inReach(cx, cy) && !isLand(cx, cy);
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
  const walkable = (cx, cy) => isLand(cx, cy) || deck.has(`${cx},${cy}`);
  const touches = cells.some(([cx, cy]) => walkable(cx, cy) || walkable(cx + 1, cy) || walkable(cx - 1, cy) || walkable(cx, cy + 1) || walkable(cx, cy - 1));
  if (!touches) throw conflict("not_connected", `${def.emoji} ${def.name}: став поруч із берегом чи іншим помостом.`);
}

/** Клітинки [cx, cy] під «ніжками» прикраси з декору (лише для тих, у кого в DECOR є foot). */
export function footCellsOf(d) {
  const def = BY_ID.get(d.k);
  return def?.foot ? footCells(def, d.x, d.y) : [];
}

/** Клітинки «cx,cy» під помостами з декору — там, як і на суші, можна ходити й класти кабель. */
export function deckCells(decor) {
  const deck = new Set();
  for (const d of decor) {
    const def = BY_ID.get(d.k);
    if (!def?.platform) continue;
    for (const [cx, cy] of footCells(def, d.x, d.y)) deck.add(`${cx},${cy}`);
  }
  return deck;
}

/** Предмет у воді — лише на мілині; на суші — як і раніше, де завгодно в межах мапи. */
function checkSpot(def, x, y) {
  if (def.water && !onShore(def, x, y)) throw conflict("not_water", `${def.emoji} ${def.name}: став у воду біля берега.`);
}

/**
 * Біля води (рибальська хата): «ніжки» на суші чи помості, а хоч одна клітинка поруч із ними
 * (по стороні) — відкрита вода: не суша й не поміст. decor — поточний декор (для помостів).
 */
function checkShoreline(def, x, y, decor, selfId = null) {
  const { rows } = LAND;
  const isLand = (cx, cy) => rows[cy]?.[cx] === "1";
  const deck = new Set();
  for (const d of decor) {
    if (d.id === selfId || !BY_ID.get(d.k)?.platform) continue;
    for (const [cx, cy] of footCells(BY_ID.get(d.k), d.x, d.y)) deck.add(`${cx},${cy}`);
  }
  const cells = footCells(def, x, y);
  const ground = (cx, cy) => isLand(cx, cy) || deck.has(`${cx},${cy}`);
  if (cells.some(([cx, cy]) => !ground(cx, cy))) throw conflict("not_ground", `${def.emoji} ${def.name}: став на березі чи на помості.`);
  const mine = new Set(cells.map(([cx, cy]) => `${cx},${cy}`));
  const wet = cells.some(([cx, cy]) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !mine.has(`${cx + dx},${cy + dy}`) && !ground(cx + dx, cy + dy))
  );
  if (!wet) throw conflict("not_shore", `${def.emoji} ${def.name}: став біля самої води — на краю берега чи помосту.`);
}
const ITEM_ID = /^[a-z0-9]{6,16}$/;

/** Зняти стрічку конвеєра над водою (belts.js імпортує цей модуль — тож беремо її, лише коли треба). */
async function pruneBelts(userId) {
  return (await import("./belts.js")).pruneBelts(userId);
}

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
      // Рибальська хата — lv (рівень), f (риба всередині) і fc (коли востаннє ловила, fishhut.js).
      if (BY_ID.has(v.k))
        out.push({
          id,
          k: v.k,
          x: v.x,
          y: v.y,
          ...(v.t && { t: v.t }),
          ...(v.sp && { sp: v.sp }),
          ...(v.c && { c: v.c }),
          ...(v.nc && { nc: v.nc }),
          ...(v.e != null && { e: v.e }),
          ...(v.k === FISH_HUT.kind && { lv: v.lv ?? 1, f: v.f ?? {}, ...(v.fc && { fc: v.fc }) }),
          // Конвеєр (belts.js): у джерела — розклад стрічки (cv), у скрині — що в ній (f).
          ...(v.cv && { cv: v.cv }),
          ...(v.k === BELT_CRATE.kind && { f: v.f ?? {} }),
        });
    } catch {
      /* зіпсований запис — пропускаємо */
    }
  }
  return out;
}

function coords(x, y) {
  // Мапа острова й море довкола, де стоять помости (на них ставлять усе, як на суші).
  if (!Number.isInteger(x) || !Number.isInteger(y) || !onIsland(x, y)) {
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
  if (def.shoreline) checkShoreline(def, pos.x, pos.y, await getDecor(userId));
  if (def.limit) {
    const same = (await r.hVals(k)).filter((raw) => raw.includes(`"k":"${def.id}"`)).length;
    if (same >= def.limit) throw conflict("limit", `${def.emoji} Більше ${def.limit} сіток пляж не прогодує.`);
  }
  if (Object.keys(def.cost).length && !(await consumeResources(userId, def.cost))) {
    throw conflict("not_enough", "Не вистачає матеріалів.");
  }
  const id = randomBytes(6).toString("hex");
  const item = { k: def.id, ...pos, ...(def.grows === "tree" ? plantedTree() : def.grows ? { t: Date.now() } : {}), ...(def.id === NET.kind && { nc: Date.now() }), ...(def.id === MINE.kind && { c: Date.now() }), ...(def.hut && { lv: 1, f: {}, fc: Date.now() }), ...(def.crate && { f: {} }) };
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
  if (BY_ID.get(old.k)?.shoreline) checkShoreline(BY_ID.get(old.k), pos.x, pos.y, await getDecor(userId));
  const item = { ...old, ...pos };
  await r.hSet(hk, id, JSON.stringify(item));
  // Переніс помост — кабель, що лишився над водою, знімаємо й повертаємо дріт.
  const wire = BY_ID.get(old.k)?.platform ? await pruneCables(userId) : 0;
  const belt = BY_ID.get(old.k)?.platform ? await pruneBelts(userId) : {};
  const refund = { ...(wire && { bare_wire: wire }) };
  for (const [res, n] of Object.entries(belt)) refund[res] = (refund[res] ?? 0) + n;
  return { item: { id, ...item }, ...(Object.keys(refund).length && { refund }) };
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
  // Розібрав шахту — накопаний камінь теж твій.
  if (old.k === MINE.kind) {
    const n = mineReady(old);
    if (n > 0) refund[MINE.res] = (refund[MINE.res] ?? 0) + n;
  }
  // Розібрав рибальську хату — вкладене в покращення й риба, що лежала в ній, теж твої.
  if (old.k === FISH_HUT.kind) for (const [res, n] of Object.entries(hutRefund(old))) refund[res] = (refund[res] ?? 0) + n;
  // Конвеєр: що лежало в скрині й що їхало стрічкою від цього джерела — теж твоє.
  if (old.k === BELT_CRATE.kind) for (const [res, n] of Object.entries(old.f ?? {})) if (n > 0) refund[res] = (refund[res] ?? 0) + n;
  for (const [, res] of old.cv?.fl ?? []) refund[res] = (refund[res] ?? 0) + 1;
  for (const [res, n] of Object.entries(refund)) await addResourceToInventory(userId, res, n);
  // Розібрав помост — кабель на ньому теж знімаємо (дріт повертає pruneCables).
  if (def?.platform) {
    const wire = await pruneCables(userId);
    if (wire) refund.bare_wire = (refund.bare_wire ?? 0) + wire;
    for (const [res, n] of Object.entries(await pruneBelts(userId))) refund[res] = (refund[res] ?? 0) + n;
  }
  return { refund };
}

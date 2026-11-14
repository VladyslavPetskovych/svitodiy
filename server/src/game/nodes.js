import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { addResourceToInventory, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { nodesKey, takeCooldown, winterNodesKey } from "./keys.js";
import { getTools, TOOL_NAMES } from "./craft.js";

/**
 * Ресурси, що самі виростають на рідному острові (виживання): дерева, каміння, кущі й дари моря.
 * Рубаєш, б'єш кайлом, збираєш руками → колоди, каміння, гілочки, мушлі. За якийсь час виростають нові.
 *
 * Місця, де можуть з'явитись, — island-slots.json (генерує miniapp/scripts/gen-island-art.mjs із землі острова):
 * grass — трава, sand — пісок біля води, rock — скелястий мис.
 * Зберігаємо hash «id → JSON { k, x, y, w — на якій землі виріс }» і поле _t — коли востаннє виросло нове.
 * У спільному домі ресурси теж спільні: хто зрубав, тому й колоди.
 *
 * Острів Хуртовини (сцена «winter» у Mini App) має свої ресурси: замети, крижані брили й хмиз
 * (місця — winter-slots.json, генерує miniapp/scripts/winter-art.mjs). Їх зберігаємо окремо (winterNodesKey),
 * але так само на дім: у спільному домі й замети спільні.
 *
 * tool — чим добувати (null — руками), tier — мінімальний рівень інструмента.
 * loot — { ресурс: [від, до] } або { ресурс: { chance, n } } — рідкісна знахідка.
 * max — скільки таких може бути одночасно (щоб острів не заріс тим, що ще нічим добути).
 * finds — що трапляється під снігом: rolls — скільки разів тягнути з таблиці, table — ресурс → вага
 * (як улов із вудки чи дроп із готування: брухт, скло, монети, кістки).
 * Кращий інструмент (tier вищий за потрібний) дає +1 до першого ресурсу (з finds — ще одну знахідку).
 */
export const NODES = {
  oak: { name: "Дуб", emoji: "🌳", where: "grass", weight: 4, tool: "axe", tier: 1, hits: 3, loot: { log: [1, 2], twig: [1, 2] } },
  birch: { name: "Береза", emoji: "🌳", where: "grass", weight: 3, tool: "axe", tier: 1, hits: 2, loot: { twig: [2, 3], log: [0, 1] } },
  pine: { name: "Ялинка", emoji: "🌲", where: "grass", weight: 3, tool: "axe", tier: 1, hits: 3, loot: { log: [2, 2] } },
  bush: { name: "Кущ", emoji: "🌿", where: "grass", weight: 4, tool: null, hits: 1, loot: { twig: [1, 2] } },
  berry_bush: {
    name: "Кущ із ягодами",
    emoji: "🫐",
    where: "grass",
    weight: 2,
    tool: null,
    hits: 1,
    loot: { twig: [1, 1], seed_radish: { chance: 0.35, n: 1 }, seed_carrot: { chance: 0.2, n: 1 } },
  },
  pebble: { name: "Камінчик", emoji: "🪨", where: "grass", weight: 3, tool: null, hits: 1, loot: { stone: [1, 1] } },
  rock: { name: "Камінь", emoji: "🪨", where: "grass", weight: 2, tool: "pickaxe", tier: 1, hits: 3, loot: { stone: [2, 3] } },
  boulder: {
    name: "Валун",
    emoji: "🪨",
    where: "rock",
    weight: 3,
    tool: "pickaxe",
    tier: 2,
    hits: 4,
    loot: { stone: [3, 4], metal_scrap: { chance: 0.35, n: 1 }, glass_shard: { chance: 0.2, n: 1 } },
  },
  // Море виносить на берег і насіння дерев: заплутане в корчах і водоростях (посадити — у будівництві).
  driftwood: {
    name: "Корч",
    emoji: "🪵",
    where: "sand",
    weight: 4,
    tool: null,
    hits: 1,
    loot: { twig: [1, 2], plank: { chance: 0.25, n: 1 }, tree_seed: { chance: 0.15, n: 1 }, rubber_seed: { chance: 0.06, n: 1 } },
  },
  shell: { name: "Мушля", emoji: "🐚", where: "sand", weight: 3, tool: null, hits: 1, loot: { shell: [1, 1] } },
  seaweed: { name: "Водорості", emoji: "🌿", where: "sand", weight: 3, tool: null, hits: 1, loot: { seaweed: [1, 2], tree_seed: { chance: 0.1, n: 1 } } },

  // Острів Хуртовини.
  snow_drift: {
    name: "Замет",
    emoji: "❄️",
    where: "snow",
    weight: 6,
    tool: "shovel",
    tier: 1,
    hits: 2,
    loot: {},
    finds: {
      rolls: [1, 2],
      table: { metal_scrap: 16, glass_shard: 15, fish_bone: 14, twig: 13, stone: 11, old_coin: 9, ice_block: 7, silver_piece: 1 },
    },
  },
  big_drift: {
    name: "Великий замет",
    emoji: "🏔️",
    where: "snow",
    weight: 2,
    tool: "shovel",
    tier: 2,
    hits: 3,
    max: 4,
    loot: {},
    finds: {
      rolls: [2, 3],
      table: { metal_scrap: 18, glass_shard: 14, old_coin: 14, fish_bone: 10, ice_block: 8, silver_piece: 4 },
    },
  },
  brushwood: { name: "Мерзлий хмиз", emoji: "🪵", where: "snow", weight: 2, tool: null, hits: 1, loot: { twig: [1, 2] } },
  ice_chunk: {
    name: "Крижана брила",
    emoji: "🧊",
    where: "ice",
    weight: 1,
    tool: "pickaxe",
    tier: 1,
    hits: 3,
    loot: { ice_block: [1, 2], glass_shard: { chance: 0.15, n: 1 } },
  },
};

/** Мінімум між двома зборами — цілий замах сокирою, а не автоклікер. */
const GATHER_COOLDOWN_MS = 500;

const readSlots = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const SLOTS = { ...readSlots("./island-slots.json"), ...readSlots("./winter-slots.json") };
const ID = /^[a-z0-9]{6,16}$/;

/**
 * Де ростуть ресурси: рідний острів і Острів Хуртовини.
 * target — скільки тримається одночасно (за типом землі), growMs — раз на скільки виростає новий.
 */
export const REALMS = {
  home: { key: nodesKey, target: { grass: 22, sand: 9, rock: 3 }, growMs: 4 * 60_000 },
  winter: { key: winterNodesKey, target: { snow: 18, ice: 5 }, growMs: 3 * 60_000 },
};

/**
 * Сітки в морі біля пляжу (декор fishing_net) приманюють дари моря: кожна (до max) —
 * +extra корчів, мушель і водоростей на пляжі одночасно й ще один новий за кожен крок росту.
 * Нові дари моря частіше (chance) виносить на пісок за r px від сітки.
 */
export const NET = { kind: "fishing_net", max: 3, extra: 3, r: 64, chance: 0.75 };
const realmOf = (id) => {
  const realm = REALMS[id];
  if (!realm) throw badRequest("Невідомий острів.");
  return realm;
};

/**
 * Що вже займає місце на острові — щоб нове дерево не виросло в будівлі чи на грядці.
 * Прямокутники [x, y, w, h] довкола всього, що там стоїть.
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 */
function blocked(x, y, taken) {
  // Ресурс займає приблизно 20×12 px над якорем.
  return taken.some(([bx, by, bw, bh]) => x + 10 > bx && x - 10 < bx + bw && y > by && y - 12 < by + bh);
}

function parse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && NODES[v.k] ? v : null;
  } catch {
    return null;
  }
}

const pickWeighted = (kinds) => {
  const total = kinds.reduce((s, k) => s + NODES[k].weight, 0);
  let r = Math.random() * total;
  for (const k of kinds) if ((r -= NODES[k].weight) < 0) return k;
  return kinds.at(-1);
};
const KINDS_BY_WHERE = Object.fromEntries(
  Object.keys(SLOTS).map((w) => [w, Object.keys(NODES).filter((k) => NODES[k].where === w)])
);
// Скелі малі — туди ж ростуть і звичайні камені з камінчиками.
KINDS_BY_WHERE.rock.push("rock", "pebble");

/**
 * Посадити до n нових ресурсів на вільні місця.
 * @param {Record<string, {k: string, x: number, y: number}>} nodes наявні
 * @param {number[][]} taken зайняті прямокутники (будівлі, декор, грядки)
 * @param {{ x: number, y: number }[]} lure точки, біля яких ростуть охочіше (сітки в морі)
 */
function sprout(nodes, taken, where, n, lure = []) {
  const fresh = {};
  const all = () => [...Object.values(nodes), ...Object.values(fresh)];
  const free = SLOTS[where].filter(([x, y]) => !blocked(x, y, taken) && !all().some((o) => Math.abs(o.x - x) < 14 && Math.abs(o.y - y) < 12));
  const lured = ([x, y]) => lure.some((p) => Math.hypot(p.x - x, p.y - y) <= NET.r);
  for (let i = 0; i < n && free.length; i++) {
    const near = lure.length && Math.random() < NET.chance ? free.map((s, j) => (lured(s) ? j : -1)).filter((j) => j >= 0) : [];
    const at = near.length ? near[Math.floor(Math.random() * near.length)] : Math.floor(Math.random() * free.length);
    const [x, y] = free.splice(at, 1)[0];
    if (all().some((o) => Math.abs(o.x - x) < 14 && Math.abs(o.y - y) < 12)) continue;
    // Види з лімітом (max) більше не ростуть, коли їх уже вдосталь.
    const kinds = KINDS_BY_WHERE[where].filter((k) => !NODES[k].max || all().filter((o) => o.k === k).length < NODES[k].max);
    if (!kinds.length) break;
    fresh[randomBytes(6).toString("hex")] = { k: pickWeighted(kinds), x, y, w: where };
  }
  return fresh;
}

/**
 * Ресурси острова на цю мить. Нові виростають ліниво — при читанні: раз на growMs по одному
 * на кожен тип землі, де їх менше за норму. Перше відкриття — острів одразу заростає.
 * @param {string} owner чий острів (homeOwner)
 * @param {number[][]} taken зайняті прямокутники
 * @param {keyof typeof REALMS} realmId рідний острів чи Хуртовина
 * @param {{ x: number, y: number }[]} nets сітки в морі (центри) — приманюють дари моря на пісок
 */
export async function growNodes(owner, taken, realmId = "home", nets = []) {
  const { key: keyOf, target: base, growMs } = realmOf(realmId);
  const lure = base.sand ? nets.slice(0, NET.max) : [];
  const target = lure.length ? { ...base, sand: base.sand + lure.length * NET.extra } : base;
  const r = getRedis();
  const key = keyOf(owner);
  const h = await r.hGetAll(key);
  const now = Date.now();
  const nodes = {};
  for (const [id, raw] of Object.entries(h)) {
    if (id === "_t") continue;
    const v = parse(raw);
    if (v) nodes[id] = v;
  }
  const last = Number(h._t) || 0;
  const steps = last ? Math.floor((now - last) / growMs) : Infinity;
  // Два паралельні запити стану не посадять ліс двічі.
  if (steps > 0 && (await takeCooldown(owner, realmId === "home" ? "nodegrow" : `nodegrow:${realmId}`, 1500))) {
    const fresh = {};
    for (const where of Object.keys(target)) {
      const have = Object.values(nodes).filter((n) => (n.w ?? NODES[n.k].where) === where).length;
      // Кожна сітка — ще один новий дар моря за крок.
      const perStep = where === "sand" ? 1 + lure.length : 1;
      const want = Math.min(target[where] - have, steps * perStep);
      if (want > 0) Object.assign(fresh, sprout({ ...nodes, ...fresh }, taken, where, want, where === "sand" ? lure : []));
    }
    // Відлік — від останнього «кроку», щоб частковий час не губився.
    const t = last ? last + steps * growMs : now;
    const tx = r.multi().hSet(key, "_t", String(Math.min(t, now)));
    for (const [id, n] of Object.entries(fresh)) tx.hSet(key, id, JSON.stringify(n));
    await tx.exec();
    Object.assign(nodes, fresh);
  }
  return Object.entries(nodes).map(([id, n]) => ({ id, k: n.k, x: n.x, y: n.y }));
}

/**
 * Ресурси для стану гри — уже з новими, що встигли вирости.
 * @param {{ k: string, x: number, y: number }[]} deco декор острова — сітки з нього приманюють дари моря
 */
export async function getNodes(userId, taken, realmId = "home", deco = []) {
  const { owner } = await homeOwner(userId);
  // Якір сітки — низ по центру, сама вона 24×16: центр — на 8 px вище.
  const nets = deco.filter((d) => d.k === NET.kind).map((d) => ({ x: d.x, y: d.y - 8 }));
  return growNodes(owner, taken, realmId, nets);
}

const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

/** Ресурс із таблиці «ресурс → вага». */
function pickFind(table) {
  const entries = Object.entries(table);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) if ((r -= w) < 0) return id;
  return entries.at(-1)[0];
}

/** Що випало з ресурсу: інструмент кращий за потрібний — +1 до першого (або ще одна знахідка). */
function rollLoot(def, tier) {
  /** @type {Record<string, number>} */
  const got = {};
  const better = def.tool && tier > def.tier;
  let first = !def.finds;
  for (const [id, spec] of Object.entries(def.loot)) {
    let n = Array.isArray(spec) ? randInt(spec) : Math.random() < spec.chance ? spec.n : 0;
    if (first && better) n += 1;
    first = false;
    if (n > 0) got[id] = n;
  }
  if (def.finds) {
    const rolls = randInt(def.finds.rolls) + (better ? 1 : 0);
    for (let k = 0; k < rolls; k++) {
      const id = pickFind(def.finds.table);
      got[id] = (got[id] ?? 0) + 1;
    }
  }
  return got;
}

/**
 * Зрубати / розбити / підняти / розкопати ресурс. Двоє одночасно — дістанеться тому, хто перший.
 * @param {keyof typeof REALMS} realmId рідний острів чи Хуртовина
 */
export async function gatherNode(userId, id, realmId = "home") {
  const realm = realmOf(realmId);
  if (typeof id !== "string" || !ID.test(id)) throw badRequest("Невідомий ресурс.");
  if (!(await takeCooldown(userId, "gather", GATHER_COOLDOWN_MS))) throw new GameError(429, "cooldown", "Секунду — ще замахуєшся.");
  const { owner } = await homeOwner(userId);
  const r = getRedis();
  const key = realm.key(owner);
  const node = parse(await r.hGet(key, id));
  if (!node) throw new GameError(404, "not_found", "Тут уже нічого немає.");
  const def = NODES[node.k];
  const tools = await getTools(userId);
  const tier = def.tool ? tools[def.tool] ?? 0 : 0;
  if (def.tool && tier < def.tier) {
    const need = TOOL_NAMES[def.tool][def.tier];
    throw conflict("no_tool", `${def.emoji} ${def.name}: потрібна ${need.toLowerCase()} — зроби її на верстаті.`);
  }
  // hDel повертає 1 лише першому — двоє не зрубають одне дерево двічі.
  if ((await r.hDel(key, id)) !== 1) throw new GameError(404, "not_found", "Тут уже нічого немає.");
  const got = rollLoot(def, tier);
  for (const [res, n] of Object.entries(got)) await addResourceToInventory(userId, res, n);
  return { node: { id, k: node.k, x: node.x, y: node.y }, got };
}

/** Чайки не частіше, ніж раз на стільки, цуплять дари моря з одного острова (мс). */
const GULL_COOLDOWN_MS = 45_000;

/**
 * Чайка понесла дар моря з пляжу (клієнт: miniapp/src/game/walk/gulls.js) — ресурс зникає, нікому не дістається.
 * Лише з піску рідного острова й не частіше за GULL_COOLDOWN_MS на острів: так клієнт не «з'їсть» острів запитами.
 */
export async function stealNode(userId, id) {
  if (typeof id !== "string" || !ID.test(id)) throw badRequest("Невідомий ресурс.");
  const { owner } = await homeOwner(userId);
  const r = getRedis();
  const key = REALMS.home.key(owner);
  const node = parse(await r.hGet(key, id));
  if (!node || NODES[node.k].where !== "sand") throw new GameError(404, "not_found", "Тут уже нічого немає.");
  if (!(await takeCooldown(owner, "gull", GULL_COOLDOWN_MS))) throw new GameError(429, "cooldown", "Чайки ще ситі.");
  if ((await r.hDel(key, id)) !== 1) throw new GameError(404, "not_found", "Тут уже нічого немає.");
  return { node: { id, k: node.k, x: node.x, y: node.y } };
}

/** Для каталогу: що де росте й чим добувати. finds — що трапляється під снігом, від найчастішого. */
export function nodesCatalog() {
  return Object.entries(NODES).map(([id, d]) => ({
    id,
    name: d.name,
    emoji: d.emoji,
    tool: d.tool,
    tier: d.tier ?? 0,
    hits: d.hits,
    loot: Object.keys(d.loot),
    ...(d.finds && { finds: Object.entries(d.finds.table).sort((a, b) => b[1] - a[1]).map(([res]) => res) }),
  }));
}

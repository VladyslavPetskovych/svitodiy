import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { addResourceToInventory, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { nodesKey, takeCooldown } from "./keys.js";
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
 * tool — чим добувати (null — руками), tier — мінімальний рівень інструмента.
 * loot — { ресурс: [від, до] } або { ресурс: { chance, n } } — рідкісна знахідка.
 * Кращий інструмент (tier вищий за потрібний) дає +1 до першого ресурсу.
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
  driftwood: { name: "Корч", emoji: "🪵", where: "sand", weight: 4, tool: null, hits: 1, loot: { twig: [1, 2], plank: { chance: 0.25, n: 1 } } },
  shell: { name: "Мушля", emoji: "🐚", where: "sand", weight: 3, tool: null, hits: 1, loot: { shell: [1, 1] } },
  seaweed: { name: "Водорості", emoji: "🌿", where: "sand", weight: 3, tool: null, hits: 1, loot: { seaweed: [1, 2] } },
};

/** Скільки ресурсів тримається на острові одночасно (за типом землі). */
const TARGET = { grass: 22, sand: 9, rock: 3 };
/** Раз на скільки виростає новий, поки острів не заповниться. */
const GROW_MS = 4 * 60_000;
/** Мінімум між двома зборами — цілий замах сокирою, а не автоклікер. */
const GATHER_COOLDOWN_MS = 500;

const SLOTS = JSON.parse(readFileSync(new URL("./island-slots.json", import.meta.url), "utf8"));
const ID = /^[a-z0-9]{6,16}$/;

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
  Object.keys(TARGET).map((w) => [w, Object.keys(NODES).filter((k) => NODES[k].where === w)])
);
// Скелі малі — туди ж ростуть і звичайні камені з камінчиками.
KINDS_BY_WHERE.rock.push("rock", "pebble");

/**
 * Посадити до n нових ресурсів на вільні місця.
 * @param {Record<string, {k: string, x: number, y: number}>} nodes наявні
 * @param {number[][]} taken зайняті прямокутники (будівлі, декор, грядки)
 */
function sprout(nodes, taken, where, n) {
  const fresh = {};
  const all = () => [...Object.values(nodes), ...Object.values(fresh)];
  const free = SLOTS[where].filter(([x, y]) => !blocked(x, y, taken) && !all().some((o) => Math.abs(o.x - x) < 14 && Math.abs(o.y - y) < 12));
  for (let i = 0; i < n && free.length; i++) {
    const [x, y] = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    if (all().some((o) => Math.abs(o.x - x) < 14 && Math.abs(o.y - y) < 12)) continue;
    fresh[randomBytes(6).toString("hex")] = { k: pickWeighted(KINDS_BY_WHERE[where]), x, y, w: where };
  }
  return fresh;
}

/**
 * Ресурси острова на цю мить. Нові виростають ліниво — при читанні: раз на GROW_MS по одному
 * на кожен тип землі, де їх менше за норму. Перше відкриття — острів одразу заростає.
 * @param {string} owner чий острів (homeOwner)
 * @param {number[][]} taken зайняті прямокутники
 */
export async function growNodes(owner, taken) {
  const r = getRedis();
  const key = nodesKey(owner);
  const h = await r.hGetAll(key);
  const now = Date.now();
  const nodes = {};
  for (const [id, raw] of Object.entries(h)) {
    if (id === "_t") continue;
    const v = parse(raw);
    if (v) nodes[id] = v;
  }
  const last = Number(h._t) || 0;
  const steps = last ? Math.floor((now - last) / GROW_MS) : Infinity;
  // Два паралельні запити стану не посадять ліс двічі.
  if (steps > 0 && (await takeCooldown(owner, "nodegrow", 1500))) {
    const fresh = {};
    for (const where of Object.keys(TARGET)) {
      const have = Object.values(nodes).filter((n) => (n.w ?? NODES[n.k].where) === where).length;
      const want = Math.min(TARGET[where] - have, steps);
      if (want > 0) Object.assign(fresh, sprout({ ...nodes, ...fresh }, taken, where, want));
    }
    // Відлік — від останнього «кроку», щоб частковий час не губився.
    const t = last ? last + steps * GROW_MS : now;
    const tx = r.multi().hSet(key, "_t", String(Math.min(t, now)));
    for (const [id, n] of Object.entries(fresh)) tx.hSet(key, id, JSON.stringify(n));
    await tx.exec();
    Object.assign(nodes, fresh);
  }
  return Object.entries(nodes).map(([id, n]) => ({ id, k: n.k, x: n.x, y: n.y }));
}

/** Ресурси для стану гри — уже з новими, що встигли вирости. */
export async function getNodes(userId, taken) {
  const { owner } = await homeOwner(userId);
  return growNodes(owner, taken);
}

const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

/** Що випало з ресурсу: інструмент кращий за потрібний — +1 до першого. */
function rollLoot(def, tier) {
  /** @type {Record<string, number>} */
  const got = {};
  let first = true;
  for (const [id, spec] of Object.entries(def.loot)) {
    let n = Array.isArray(spec) ? randInt(spec) : Math.random() < spec.chance ? spec.n : 0;
    if (first && def.tool && tier > def.tier) n += 1;
    first = false;
    if (n > 0) got[id] = n;
  }
  return got;
}

/** Зрубати / розбити / підняти ресурс. Двоє одночасно — дістанеться тому, хто перший. */
export async function gatherNode(userId, id) {
  if (typeof id !== "string" || !ID.test(id)) throw badRequest("Невідомий ресурс.");
  if (!(await takeCooldown(userId, "gather", GATHER_COOLDOWN_MS))) throw new GameError(429, "cooldown", "Секунду — ще замахуєшся.");
  const { owner } = await homeOwner(userId);
  const r = getRedis();
  const key = nodesKey(owner);
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

/** Для каталогу: що де росте й чим добувати. */
export function nodesCatalog() {
  return Object.entries(NODES).map(([id, d]) => ({
    id,
    name: d.name,
    emoji: d.emoji,
    tool: d.tool,
    tier: d.tier ?? 0,
    hits: d.hits,
    loot: Object.keys(d.loot),
  }));
}

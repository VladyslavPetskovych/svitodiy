import { DECOR } from "./decor.js";
import { CABLE_CELL } from "./cables.js";
import { solarEnergy, solarWatts } from "./solar.js";
import { windEnergy, windWatts } from "./wind.js";

/**
 * Електрика рідного острова (лише Mini App).
 *
 * Прилади — декор із розділу «power»: вітряк (генератор, watts — найбільше, що дає на сильному вітрі;
 * скільки саме зараз — wind.js), акумулятор (store — скільки Вт·год вміщає, заряд — у полі e, energy.js)
 * сонячна панель (генератор, що дає струм удень — solar.js), електропіч і електроверстат
 * (беруть енергію з акумуляторів своєї мережі, furnace.js).
 *
 * Кабелі лежать під землею: клітинка 8×8 px з кабелем. Прилад під'єднаний, якщо його клітинка
 * або сусідня (по стороні, не по діагоналі) має кабель. Мережа — зв'язна група кабельних клітинок.
 * Генератор дає струм лише своїй мережі: вітряк без дроту не рахується.
 */
const POWER = new Map(DECOR.filter((d) => d.cat === "power").map((d) => [d.id, d]));
const SIDE_STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Скільки Вт·год вміщає акумулятор. */
export const batteryCap = (kind) => POWER.get(kind)?.store ?? 0;
/** Чи генератор (вітряк, сонячна панель). */
export const isGenerator = (kind) => (POWER.get(kind)?.watts ?? 0) > 0;

/** Скільки Вт генератор d дає в мить now: вітряк — як дме (wind.js), панель — як світить (solar.js). */
export function genWatts(d, now) {
  const def = POWER.get(d.k);
  if (!def?.watts) return 0;
  return def.solar ? solarWatts(def.watts, now) : windWatts(d.id, now);
}

/** Скільки Вт·год генератор d дав за [from, to). */
export function genEnergy(d, from, to) {
  const def = POWER.get(d.k);
  if (!def?.watts) return 0;
  return def.solar ? solarEnergy(def.watts, from, to) : windEnergy(d.id, from, to);
}

/** Клітинка, в якій стоїть прикраса: якір — низ по центру, тож беремо піксель над ним. */
export function cellOfDeco(d) {
  return [Math.floor(d.x / CABLE_CELL), Math.floor((d.y - 1) / CABLE_CELL)];
}

/**
 * Зв'язні мережі кабелів і прилади, під'єднані до них.
 * gen — скільки Вт дають вітряки мережі просто зараз (now), max — на найсильнішому вітрі,
 * stored / capacity — заряд і місткість акумуляторів мережі, Вт·год.
 * @param {[number, number][]} cells клітинки з кабелем
 * @param {{ id: string, k: string, x: number, y: number, e?: number }[]} deco
 * @param {number} [now]
 */
export function networksOf(cells, deco, now = Date.now()) {
  const key = (x, y) => `${x},${y}`;
  const cellSet = new Set(cells.map(([x, y]) => key(x, y)));
  const comp = new Map(); // клітинка → номер зв'язного шматка кабелю
  const pieces = [];

  for (const [sx, sy] of cells) {
    if (comp.has(key(sx, sy))) continue;
    const id = pieces.length;
    const members = [];
    const stack = [[sx, sy]];
    comp.set(key(sx, sy), id);
    while (stack.length) {
      const [x, y] = stack.pop();
      members.push([x, y]);
      for (const [dx, dy] of SIDE_STEPS) {
        const k = key(x + dx, y + dy);
        if (!cellSet.has(k) || comp.has(k)) continue;
        comp.set(k, id);
        stack.push([x + dx, y + dy]);
      }
    }
    pieces.push(members);
  }

  // Прилад, до якого підходять кілька шматків кабелю, з'єднує їх: струм іде крізь нього.
  const parent = pieces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touching = [];
  for (const d of deco) {
    const def = POWER.get(d.k);
    if (!def) continue;
    const [cx, cy] = cellOfDeco(d);
    const ids = new Set();
    for (const [dx, dy] of [[0, 0], ...SIDE_STEPS]) {
      const c = comp.get(key(cx + dx, cy + dy));
      if (c !== undefined) ids.add(c);
    }
    if (!ids.size) continue;
    const [first, ...rest] = ids;
    for (const c of rest) parent[find(c)] = find(first);
    touching.push({ d, def, piece: first });
  }

  const index = new Map(); // корінь → номер мережі
  const networks = [];
  pieces.forEach((members, i) => {
    const root = find(i);
    if (!index.has(root)) {
      index.set(root, networks.length);
      networks.push({ id: networks.length, cells: [], devices: [], gen: 0, max: 0, sources: 0, stored: 0, capacity: 0 });
    }
    networks[index.get(root)].cells.push(...members);
  });

  const wired = new Set();
  for (const { d, def, piece } of touching) {
    wired.add(d.id);
    const n = networks[index.get(find(piece))];
    n.devices.push(d.id);
    if (def.watts) {
      n.gen += genWatts(d, now);
      n.max += def.watts;
      n.sources++;
    }
    if (def.store) {
      n.stored += Math.min(def.store, d.e ?? 0);
      n.capacity += def.store;
    }
  }
  return { networks, wired };
}

/**
 * Підсумок острова: gen — Вт просто зараз, max — на найсильнішому вітрі, stored / capacity — Вт·год в акумуляторах.
 * @param {{ id: string, k: string, x: number, y: number, e?: number }[]} deco
 * @param {[number, number][]} [cells]
 * @param {number} [now]
 */
export function powerOf(deco, cells = [], now = Date.now()) {
  const { networks } = networksOf(cells, deco, now);
  const sum = { gen: 0, max: 0, use: 0, sources: 0, stored: 0, capacity: 0, at: now };
  for (const n of networks) {
    sum.gen += n.gen;
    sum.max += n.max;
    sum.sources += n.sources;
    sum.stored += n.stored;
    sum.capacity += n.capacity;
  }
  sum.stored = Math.round(sum.stored * 100) / 100;
  return sum;
}

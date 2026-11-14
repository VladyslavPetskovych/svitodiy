import { DECOR } from "./decor.js";
import { CABLE_CELL } from "./cables.js";

/**
 * Електрика рідного острова (лише Mini App).
 *
 * Генератори — декор із полем watts (вітряк — 40 Вт). Струм дає лише той, хто під'єднаний
 * до кабельної мережі: вітряк без дроту не рахується, тож острів отримує 0 Вт.
 *
 * Кабелі лежать під землею: клітинка 8×8 px з кабелем. Пристрій під'єднаний, якщо його клітинка
 * або сусідня (по стороні, не по діагоналі) має кабель. Мережа — зв'язна група кабельних клітинок.
 *
 * Споживачів поки немає: use — на майбутнє (лампи, станки), щоб клієнт уже показував баланс.
 */
const WATTS = new Map(DECOR.filter((d) => d.watts > 0).map((d) => [d.id, d.watts]));
const SIDE_STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Клітинка, в якій стоїть прикраса: якір — низ по центру, тож беремо піксель над ним. */
export function cellOfDeco(d) {
  return [Math.floor(d.x / CABLE_CELL), Math.floor((d.y - 1) / CABLE_CELL)];
}

/**
 * Зв'язні мережі кабелів і пристрої, під'єднані до них.
 * @param {[number, number][]} cells клітинки з кабелем
 * @param {{ id: string, k: string, x: number, y: number }[]} deco
 * @returns {{ networks: { id: number, cells: [number, number][], devices: string[], gen: number, sources: number }[], wired: Set<string> }}
 */
export function networksOf(cells, deco) {
  const key = (x, y) => `${x},${y}`;
  const cellSet = new Set(cells.map(([x, y]) => key(x, y)));
  const owner = new Map(); // клітинка → номер мережі
  const networks = [];

  for (const [sx, sy] of cells) {
    if (owner.has(key(sx, sy))) continue;
    const id = networks.length;
    const members = [];
    const stack = [[sx, sy]];
    owner.set(key(sx, sy), id);
    while (stack.length) {
      const [x, y] = stack.pop();
      members.push([x, y]);
      for (const [dx, dy] of SIDE_STEPS) {
        const k = key(x + dx, y + dy);
        if (!cellSet.has(k) || owner.has(k)) continue;
        owner.set(k, id);
        stack.push([x + dx, y + dy]);
      }
    }
    networks.push({ id, cells: members, devices: [], gen: 0, sources: 0 });
  }

  const wired = new Set();
  for (const d of deco) {
    const [cx, cy] = cellOfDeco(d);
    const around = [[0, 0], ...SIDE_STEPS];
    let net;
    for (const [dx, dy] of around) {
      net = owner.get(key(cx + dx, cy + dy));
      if (net !== undefined) break;
    }
    if (net === undefined) continue;
    wired.add(d.id);
    const n = networks[net];
    n.devices.push(d.id);
    const w = WATTS.get(d.k);
    if (w) {
      n.gen += w;
      n.sources++;
    }
  }
  return { networks, wired };
}

/**
 * @param {{ id: string, k: string, x: number, y: number }[]} deco
 * @param {[number, number][]} [cells]
 * @returns {{ gen: number, use: number, sources: number }}
 */
export function powerOf(deco, cells = []) {
  const { networks } = networksOf(cells, deco);
  let gen = 0;
  let sources = 0;
  for (const n of networks) {
    gen += n.gen;
    sources += n.sources;
  }
  return { gen, use: 0, sources };
}

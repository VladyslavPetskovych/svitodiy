import { BUILDING_GEOM, DECO_GEOM, NODE_GEOM, decoFootprint, nodeFootprint } from './decor.js'

/**
 * Рідний острів «зсередини»: розміри мапи, рельєф і де що стоїть.
 * Спільне для генератора текстур (scripts/gen-island-art.mjs) і екрана IslandWalk.
 * Координати — у пікселях арту; якір спрайта — низ по центру.
 */

export const MAP = { w: 512, h: 448 }

/** Клітинка сітки прохідності, px. */
export const CELL = 8

/** Рельєф: суша (пісок), плато з травою й скелястий мис під маяк — еліпси, що зливаються. */
export const LAND = {
  shore: [
    { x: 256, y: 214, rx: 188, ry: 148 },
    { x: 92, y: 268, rx: 62, ry: 46 },
    { x: 350, y: 300, rx: 78, ry: 52 },
  ],
  plateau: [
    { x: 254, y: 186, rx: 166, ry: 106 },
    { x: 360, y: 214, rx: 78, ry: 58 },
    { x: 130, y: 236, rx: 70, ry: 44 },
  ],
  rocks: [{ x: 84, y: 262, rx: 40, ry: 30 }],
}

/**
 * Острів починається порожнім: стоїть лише хатинка, причал із човном і скриня.
 * Решту — будівлі, грядки, декор — гравець ставить і переносить сам, а дерева, каміння
 * й дари моря виростають самі (server/src/game/nodes.js).
 * Стежок і квітників у землі більше немає: генератор лишає траву й пісок чистими.
 */
export const PATH = { points: [], w: 0 }
export const TRAILS = []
export const BEDS = []

/** Утоптаний майданчик перед дверима хатинки. */
export const PLAZA = { x: 256, y: 160, r: 12 }

/** Причал — дощаті мостки у воду. */
export const PIER = { x: 256, y0: 338, y1: 428, w: 28 }

/** Те, що стоїть на своєму місці завжди (якір — низ по центру). */
export const SPOTS = {
  house: { x: 256, y: 150 },
  pier: { x: 256, y: 338 },
}

/**
 * Де світиться ліхтар маяка (від якоря спрайта, px) — для сяйва й променя в рушії.
 * Спрайти маяка намальовані окремо: public/game/buildings/lighthouse_0..3.png.
 */
export const LIGHTHOUSE_LAMP = { 1: [3, -60], 2: [-3, -80], 3: [0, -97] }

/** Місток для старої майстерні на палях — лише для генератора спрайтів. */
export const BOARDWALK = { x0: 404, x1: 442, y: 281, h: 14 }

/** Грядка з якорем (x, y) — низ по центру — займає 16×16. */
export const PLOT = 16

/** Прямокутник грядки [x, y, w, h]. */
export function plotRect(p) {
  return [p.x - PLOT / 2, p.y - PLOT, PLOT, PLOT]
}

/** Центр грядки. */
export function plotCenter(p) {
  return { x: p.x, y: p.y - PLOT / 2 }
}

export const CHEST = { x: 200, y: 336 }
export const BOAT = { x: 292, y: 392 }
export const START = { x: 256, y: 186 }

/**
 * Куди не ростуть дерева й каміння: двір перед хатинкою, дорога до причалу, скриня.
 * [x, y, w, h] — те саме знає генератор місць для ресурсів (island-slots.json на сервері).
 */
export const RESERVED = [
  [214, 70, 84, 112],
  [236, 182, 40, 160],
  [184, 318, 32, 26],
]

/**
 * Що стоїть на острові.
 * layer: 'floor' — під гравцем (мостки, грядки), 'obj' — сортується з гравцем за y.
 * blocks — прямокутники [x, y, w, h], куди не можна ступити; walk — куди можна попри воду.
 * uid / kind — для пісочниці: що це за предмет і як його вибрати («b:<будівля>» для будівель).
 * @param {{ levels: object, pos?: object }} home рівні будівель і де вони стоять
 * @returns {{ s: string, x: number, y: number, layer: 'floor'|'obj', blocks?: number[][], walk?: number[] }[]}
 */
export function placements(home, chestOpen, deco = [], nodes = []) {
  const { levels } = home
  const out = []
  const add = (s, x, y, extra = {}) => out.push({ s, x, y, layer: 'obj', ...extra })

  // Хатинка: завжди є, рівень 1..3.
  const h = SPOTS.house
  add(`house_${Math.max(1, levels.house)}`, h.x, h.y, { blocks: [[h.x - 34, h.y - 34, 68, 32]] })

  // Причал: мостки, на 2-му ліхтарі, на 3-му вітрильник.
  out.push({ s: 'pier', x: PIER.x, y: PIER.y1, layer: 'floor', walk: [PIER.x - PIER.w / 2, PIER.y0 - 6, PIER.w, PIER.y1 - PIER.y0] })
  if (levels.pier >= 2) {
    add('post_lantern', PIER.x - 15, 372)
    add('post_lantern', PIER.x + 15, 372)
  }
  add('boat', BOAT.x, BOAT.y, { layer: 'floor' })

  add(chestOpen ? 'chest_open' : 'chest', CHEST.x, CHEST.y, { blocks: [[CHEST.x - 7, CHEST.y - 6, 14, 6]] })

  // Будівлі, які гравець поставив сам.
  for (const [id, g] of Object.entries(BUILDING_GEOM)) {
    const p = home.pos?.[id]
    if (!p || !(levels[id] > 0)) continue
    const kind = `b:${id}`
    add(g.sprite(levels[id]), p.x, p.y, { uid: kind, kind, building: id, blocks: [decoFootprint(kind, p.x, p.y)] })
  }

  // Декор гравця з пісочниці. Підлога не заважає ходити, решта — так.
  for (const d of deco) {
    const g = DECO_GEOM[d.k]
    if (!g) continue
    out.push({ s: g.sprite, x: d.x, y: d.y, layer: g.floor ? 'floor' : 'obj', uid: d.id, kind: d.k, blocks: g.floor ? [] : [decoFootprint(d.k, d.x, d.y)] })
  }

  // Дерева, каміння, кущі й дари моря.
  for (const n of nodes) {
    const g = NODE_GEOM[n.k]
    if (!g) continue
    const fp = nodeFootprint(n.k, n.x, n.y)
    add(g.sprite, n.x, n.y, { node: n.id, nodeKind: n.k, blocks: fp ? [fp] : [] })
  }
  return out
}

/**
 * Сітка прохідності: суша з atlas.walk, мінус «ніжки» об'єктів, плюс мостки над водою.
 * @param {string[]} base рядки '0'/'1' з генератора
 * @returns {Uint8Array} 1 — можна стати; індекс cy * cols + cx
 */
export function walkGrid(base, list) {
  const cols = base[0].length
  const rows = base.length
  const grid = new Uint8Array(cols * rows)
  base.forEach((line, cy) => {
    for (let cx = 0; cx < cols; cx++) grid[cy * cols + cx] = line[cx] === '1' ? 1 : 0
  })
  const paint = ([x, y, w, h], v) => {
    for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h - 1) / CELL); cy++)
      for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w - 1) / CELL); cx++)
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) grid[cy * cols + cx] = v
  }
  for (const p of list) if (p.walk) paint(p.walk, 1)
  for (const p of list) for (const b of p.blocks ?? []) paint(b, 0)
  return grid
}

/**
 * Куди можна підійти й що там зробити — те, що стоїть завжди. Будівлі, верстат, комору
 * й ресурси рушій додає сам, бо вони стоять там, де їх поставив гравець.
 * near — точка, куди йде гравець; r — радіус «поруч»; box — область на екрані, тап по якій веде сюди.
 */
export const INTERACT = [
  { id: 'house', label: 'Хатинка', near: [256, 160], r: 18, box: [222, 84, 68, 70] },
  { id: 'chest', label: 'Скриня', near: [200, 324], r: 16, box: [188, 318, 24, 22] },
  { id: 'pier', label: 'Причал', near: [256, 352], r: 14, box: [240, 344, 32, 30] },
  { id: 'fishing', label: 'Рибалити', near: [256, 418], r: 14, box: [240, 396, 32, 34] },
  { id: 'boat', label: 'Човен', near: [264, 392], r: 18, box: [276, 372, 34, 20] },
]

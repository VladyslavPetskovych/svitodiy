import { DECO_GEOM, decoFootprint } from './decor.js'

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

/** Бруківка від дверей хатинки до причалу (ламана), ширина px. */
export const PATH = { points: [[256, 150], [256, 214], [250, 260], [256, 344]], w: 20 }

/** Майданчик із бруківки перед дверима хатинки. */
export const PLAZA = { x: 256, y: 160, r: 15 }

/** Протоптані стежки по траві: від бруківки до городу й до містка майстерні. */
export const TRAILS = [
  { points: [[258, 214], [292, 222], [330, 236], [372, 240]], w: 8 },
  { points: [[372, 240], [392, 252], [400, 268], [406, 282]], w: 7 },
]

/** Квітники обабіч дверей (запечені в землю, на них не стають). */
export const BEDS = [
  { x: 218, y: 150, w: 20, h: 7 },
  { x: 274, y: 150, w: 20, h: 7 },
]

/** Причал — дощаті мостки у воду. */
export const PIER = { x: 256, y0: 338, y1: 428, w: 28 }

/** Де стоять будівлі (якір — низ по центру). */
export const SPOTS = {
  house: { x: 256, y: 150 },
  garden: { x: 372, y: 222 },
  workshop: { x: 468, y: 300 },
  lighthouse: { x: 84, y: 270 },
  pier: { x: 256, y: 338 },
}

/**
 * Де світиться ліхтар маяка (від якоря спрайта, px) — для сяйва й променя в рушії.
 * Спрайти маяка намальовані окремо: public/game/buildings/lighthouse_0..3.png.
 */
export const LIGHTHOUSE_LAMP = { 1: [3, -60], 2: [-3, -80], 3: [0, -97] }

/** Місток із берега до майстерні на палях. */
export const BOARDWALK = { x0: 404, x1: 442, y: 281, h: 14 }

export const CHEST = { x: 200, y: 336 }
export const BOAT = { x: 300, y: 392 }
export const START = { x: 256, y: 186 }

/**
 * Прикраси: дерева, кущі, каміння, квіти.
 * block — ширина×висота «ніжок» під якорем, що не пускають; blocks — довільні [dx, dy, w, h] від якоря.
 */
export const DECOR = [
  { s: 'oak', x: 176, y: 146, block: [14, 8] },
  { s: 'oak', x: 150, y: 206, block: [14, 8] },
  { s: 'birch', x: 326, y: 124, block: [8, 6] },
  { s: 'birch', x: 120, y: 160, block: [8, 6] },
  { s: 'oak', x: 300, y: 98, block: [14, 8] },
  { s: 'clothesline', x: 322, y: 160, blocks: [[-24, -4, 4, 4], [20, -4, 4, 4]] },
  { s: 'bush', x: 206, y: 160, block: [14, 6] },
  { s: 'bush_berry', x: 308, y: 172, block: [14, 6] },
  { s: 'bush', x: 196, y: 250, block: [14, 6] },
  { s: 'bush_berry', x: 420, y: 186, block: [14, 6] },
  { s: 'bush', x: 230, y: 96, block: [14, 6] },
  { s: 'stump', x: 210, y: 210, block: [10, 6] },
  { s: 'rock', x: 140, y: 300, block: [10, 6] },
  { s: 'rock_big', x: 400, y: 340, block: [16, 8] },
  { s: 'rock', x: 330, y: 352, block: [10, 6] },
  { s: 'rock', x: 118, y: 96, block: [10, 6] },
  { s: 'rock_big', x: 410, y: 108, block: [16, 8] },
  { s: 'crates', x: 286, y: 344, block: [14, 6] },
  { s: 'barrel', x: 228, y: 340, block: [8, 4] },
  { s: 'flowers', x: 222, y: 182 },
  { s: 'flowers', x: 290, y: 196 },
  { s: 'flowers_w', x: 182, y: 226 },
  { s: 'flowers', x: 330, y: 260 },
  { s: 'flowers_w', x: 268, y: 236 },
  { s: 'flowers_p', x: 160, y: 254 },
  { s: 'flowers_p', x: 380, y: 160 },
  { s: 'tuft', x: 240, y: 230 },
  { s: 'tuft', x: 340, y: 186 },
  { s: 'tuft', x: 186, y: 190 },
  { s: 'tuft', x: 300, y: 270 },
  { s: 'tuft', x: 396, y: 250 },
  { s: 'tuft', x: 168, y: 120 },
  { s: 'shell', x: 190, y: 356 },
  { s: 'shell', x: 352, y: 334 },
]

/**
 * Що стоїть на острові при таких рівнях будівель.
 * layer: 'floor' — під гравцем (мостки, грядки), 'obj' — сортується з гравцем за y.
 * blocks — прямокутники [x, y, w, h], куди не можна ступити; walk — куди можна попри воду.
 * @returns {{ s: string, x: number, y: number, layer: 'floor'|'obj', blocks?: number[][], walk?: number[] }[]}
 */
export function placements(levels, chestOpen, deco = []) {
  const out = []
  const add = (s, x, y, extra = {}) => out.push({ s, x, y, layer: 'obj', ...extra })

  for (const d of DECOR) {
    const rel = d.blocks ?? (d.block ? [[-d.block[0] / 2, -d.block[1], ...d.block]] : [])
    add(d.s, d.x, d.y, { blocks: rel.map(([dx, dy, w, h]) => [d.x + dx, d.y + dy, w, h]) })
  }

  // Хатинка: завжди є, рівень 1..3.
  const h = SPOTS.house
  add(`house_${Math.max(1, levels.house)}`, h.x, h.y, { blocks: [[h.x - 34, h.y - 34, 68, 32]] })

  // Причал: мостки, на 2-му ліхтарі, на 3-му вітрильник.
  out.push({ s: 'pier', x: PIER.x, y: PIER.y1, layer: 'floor', walk: [PIER.x - PIER.w / 2, PIER.y0 - 6, PIER.w, PIER.y1 - PIER.y0] })
  if (levels.pier >= 2) {
    add('post_lantern', PIER.x - 15, 372)
    add('post_lantern', PIER.x + 15, 372)
  }
  if (levels.pier >= 3) add('sailboat', 196, 420)
  add('boat', BOAT.x, BOAT.y, { layer: 'floor' })

  // Город.
  const g = SPOTS.garden
  if (levels.garden > 0) add(`garden_${levels.garden}`, g.x, g.y, { blocks: [[g.x - 30, g.y - 34, 60, 32]] })
  else add('plot_grass', g.x, g.y, { blocks: [[g.x - 5, g.y - 6, 10, 6]] })

  // Майстерня на палях + місток.
  const w = SPOTS.workshop
  const bw = BOARDWALK
  out.push({ s: 'boardwalk', x: (bw.x0 + bw.x1) / 2, y: bw.y + bw.h / 2, layer: 'floor', walk: [bw.x0, bw.y - bw.h / 2, bw.x1 - bw.x0, bw.h] })
  // Поміст: дошки y 258..288, спереду — вільна смуга, куди можна стати.
  out.push({ s: 'deck', x: w.x, y: w.y + 4, layer: 'floor', walk: [w.x - 26, w.y - 32, 52, 20] })
  if (levels.workshop > 0) add(`workshop_${levels.workshop}`, w.x, w.y - 26, { blocks: [[w.x - 22, w.y - 40, 44, 10]] })
  else add('sign', w.x, w.y - 22, { blocks: [[w.x - 4, w.y - 26, 8, 4]] })

  // Маяк на скелях.
  const l = SPOTS.lighthouse
  // Маяк стоїть на власному кам'яному острівці — заступає і його.
  add(`lighthouse_${Math.max(0, levels.lighthouse)}`, l.x, l.y, { blocks: [[l.x - 24, l.y - 24, 48, 20]] })

  add(chestOpen ? 'chest_open' : 'chest', CHEST.x, CHEST.y, { blocks: [[CHEST.x - 7, CHEST.y - 6, 14, 6]] })

  // Декор гравця з пісочниці. Підлога не заважає ходити, решта — так.
  for (const d of deco) {
    const g = DECO_GEOM[d.k]
    if (!g) continue
    out.push({ s: g.sprite, x: d.x, y: d.y, layer: g.floor ? 'floor' : 'obj', uid: d.id, kind: d.k, blocks: g.floor ? [] : [decoFootprint(d.k, d.x, d.y)] })
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
 * Куди можна підійти й що там зробити. near — точка, куди йде гравець; r — радіус «поруч».
 * box — область на екрані, тап по якій веде сюди.
 */
export const INTERACT = [
  { id: 'house', label: 'Хатинка', near: [256, 160], r: 18, box: [222, 84, 68, 70] },
  { id: 'garden', label: 'Город', near: [372, 234], r: 20, box: [340, 176, 64, 50] },
  { id: 'workshop', label: 'Майстерня', near: [468, 282], r: 20, box: [436, 212, 64, 80] },
  { id: 'lighthouse', label: 'Маяк', near: [84, 284], r: 20, box: [50, 140, 68, 132] },
  { id: 'chest', label: 'Скриня', near: [200, 324], r: 16, box: [188, 318, 24, 22] },
  { id: 'pier', label: 'Причал', near: [256, 352], r: 14, box: [240, 344, 32, 30] },
  { id: 'fishing', label: 'Рибалити', near: [256, 418], r: 14, box: [240, 396, 32, 34] },
  { id: 'boat', label: 'Човен', near: [264, 392], r: 18, box: [280, 380, 40, 24] },
]

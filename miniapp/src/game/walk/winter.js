import { NODE_GEOM, nodeFootprint } from './decor.js'

/**
 * Острів Хуртовини «зсередини»: розміри мапи, рельєф, причал і те, що стоїть завжди.
 * Спільне для генератора (scripts/winter-art.mjs) і рушія (walk/engine.js, сцена «winter»).
 * Координати — у пікселях арту, якір спрайта — низ по центру (як і на рідному острові).
 *
 * Тут нічого не будують: острів дикий. Замети, лід і хмиз ростуть самі (server/src/game/nodes.js,
 * місця — winter-slots.json), а замети копають лопатою — під снігом трапляється всякий брухт.
 */

export const WINTER_MAP = { w: 448, h: 416 }

/**
 * Рельєф — еліпси, що зливаються (як LAND у layout.js).
 * snow — засніжена суша; floe — замерзле море біля берега (по ньому можна ходити);
 * pond — замерзле озерце посеред снігу.
 */
export const WINTER_LAND = {
  snow: [
    { x: 224, y: 196, rx: 166, ry: 116 },
    { x: 98, y: 150, rx: 64, ry: 58 },
    { x: 336, y: 252, rx: 72, ry: 50 },
    { x: 206, y: 112, rx: 92, ry: 60 },
  ],
  floe: [{ x: 360, y: 108, rx: 70, ry: 46 }],
  pond: [{ x: 136, y: 236, rx: 30, ry: 16 }],
}

/** Причал (той самий спрайт, що вдома) і човен, яким пливуть додому. */
export const WINTER_PIER = { x: 224, y0: 296, y1: 386, w: 28 }
export const WINTER_BOAT = { x: 268, y: 352 }

/** Де мандрівник стає, зійшовши з човна. */
export const WINTER_SPAWN = { x: 224, y: 300, dir: 'up' }

/** Вогнище біля причалу: гріє й світить уночі. */
export const WINTER_FIRE = { x: 190, y: 286 }
export const WINTER_SIGN = { x: 258, y: 284 }

/**
 * Декорації, що стоять завжди: засніжені ялини, скелі, сухе дерево, сніговик.
 * Їх не рубають — це рамка острова; «ніжки» не пускають мандрівника.
 */
export const WINTER_PROPS = [
  // Ялинник на півночі.
  { s: 'w_pine', x: 150, y: 74 },
  { s: 'w_pine_s', x: 128, y: 84 },
  { s: 'w_pine', x: 176, y: 66 },
  { s: 'w_pine_s', x: 200, y: 72 },
  { s: 'w_pine', x: 236, y: 70 },
  { s: 'w_pine_s', x: 262, y: 80 },
  // Західний гай.
  { s: 'w_pine', x: 52, y: 150 },
  { s: 'w_pine_s', x: 70, y: 124 },
  { s: 'w_pine', x: 62, y: 186 },
  { s: 'w_pine_s', x: 88, y: 200 },
  // Східний край і скелі.
  { s: 'w_rock', x: 384, y: 222 },
  { s: 'w_rock_s', x: 400, y: 248 },
  { s: 'w_pine_s', x: 370, y: 274 },
  { s: 'w_dead_tree', x: 300, y: 150 },
  { s: 'w_rock_s', x: 104, y: 266 },
  // Біля причалу.
  { s: 'w_snowman', x: 290, y: 284 },
  { s: 'deco_campfire', x: WINTER_FIRE.x, y: WINTER_FIRE.y },
  { s: 'deco_signpost', x: WINTER_SIGN.x, y: WINTER_SIGN.y },
  { s: 'barrel', x: 170, y: 300 },
  { s: 'crates', x: 152, y: 296 },
]

/** «Ніжки» декорацій [w, h] під якорем. */
const PROP_FOOT = {
  w_pine: [10, 6],
  w_pine_s: [8, 5],
  w_rock: [18, 7],
  w_rock_s: [12, 5],
  w_dead_tree: [8, 5],
  w_snowman: [10, 5],
  deco_campfire: [16, 6],
  deco_signpost: [6, 4],
  barrel: [10, 5],
  crates: [16, 6],
}

/** Прямокутник «ніжок» декорації [x, y, w, h]. */
export function propFootprint(p) {
  const [w, h] = PROP_FOOT[p.s] ?? [8, 4]
  return [p.x - w / 2, p.y - h, w, h]
}

/**
 * Куди не ростуть замети: висадка з причалу, вогнище, вказівник.
 * [x, y, w, h] — те саме знає генератор місць (winter-slots.json на сервері).
 */
export const WINTER_RESERVED = [
  [196, 256, 56, 48],
  [140, 266, 66, 40],
  [240, 262, 64, 32],
]

/**
 * Що стоїть на острові: причал, човен, декорації і ресурси (замети, лід, хмиз).
 * Формат — як placements() у layout.js.
 * @param {{ id: string, k: string, x: number, y: number }[]} nodes
 */
export function winterPlacements(nodes = []) {
  const out = []
  const P = WINTER_PIER
  out.push({ s: 'pier', x: P.x, y: P.y1, layer: 'floor', walk: [P.x - P.w / 2, P.y0 - 6, P.w, P.y1 - P.y0] })
  out.push({ s: 'boat', x: WINTER_BOAT.x, y: WINTER_BOAT.y, layer: 'floor' })
  for (const p of WINTER_PROPS) out.push({ s: p.s, x: p.x, y: p.y, layer: 'obj', blocks: [propFootprint(p)] })
  for (const n of nodes) {
    const g = NODE_GEOM[n.k]
    if (!g) continue
    const fp = nodeFootprint(n.k, n.x, n.y)
    out.push({ s: g.sprite, x: n.x, y: n.y, layer: 'obj', node: n.id, nodeKind: n.k, blocks: fp ? [fp] : [] })
  }
  return out
}

/** Куди підійти й що зробити — те, що стоїть завжди (ресурси рушій додає сам). */
export const WINTER_INTERACT = [
  // Стоїш на краю причалу поруч із човном (сам човен — на воді).
  { id: 'sail_home', label: 'Човен додому', near: [WINTER_PIER.x + 9, WINTER_BOAT.y - 8], r: 18, box: [WINTER_BOAT.x - 22, WINTER_BOAT.y - 22, 44, 26] },
  { id: 'winter_sign', label: 'Вказівник', near: [WINTER_SIGN.x, WINTER_SIGN.y + 8], r: 14, box: [WINTER_SIGN.x - 8, WINTER_SIGN.y - 20, 16, 22] },
  { id: 'winter_fire', label: 'Вогнище', near: [WINTER_FIRE.x, WINTER_FIRE.y + 9], r: 14, box: [WINTER_FIRE.x - 10, WINTER_FIRE.y - 12, 20, 14] },
]

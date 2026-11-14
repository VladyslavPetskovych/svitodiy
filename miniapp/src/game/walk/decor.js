import { CELL } from './layout.js'

/**
 * Геометрія всього, що гравець ставить на острові: декор, будівлі, грядки — і ресурси, що ростуть самі.
 * Який спрайт, скільки клітинок займає «ніжками», чи це підлога (по ній ходять, малюється під гравцем)
 * і чи світиться. Назви, ціни й категорії — з сервера (catalog.decor / buildings / nodes), тут лише те,
 * що потрібно рушію.
 */
export const DECO_GEOM = {
  wildflowers: { sprite: 'deco_wildflowers', fw: 1, fh: 1, floor: true },
  flower_bed: { sprite: 'deco_flower_bed', fw: 2, fh: 1 },
  sunflowers: { sprite: 'deco_sunflowers', fw: 1, fh: 1 },
  bush: { sprite: 'bush', fw: 2, fh: 1 },
  sapling: { sprite: 'deco_sapling', fw: 1, fh: 1 },
  pine: { sprite: 'deco_pine', fw: 2, fh: 1 },
  pumpkins: { sprite: 'deco_pumpkins', fw: 2, fh: 1 },
  stepping_stone: { sprite: 'deco_stepping_stone', fw: 1, fh: 1, floor: true },
  cobble_tile: { sprite: 'deco_cobble_tile', fw: 2, fh: 2, floor: true },
  rock: { sprite: 'rock_big', fw: 2, fh: 1 },
  stone_lantern: { sprite: 'deco_stone_lantern', fw: 1, fh: 1, light: { dy: -15, r: 14 } },
  well: { sprite: 'deco_well', fw: 3, fh: 2 },
  plank_floor: { sprite: 'deco_plank_floor', fw: 2, fh: 2, floor: true },
  fence: { sprite: 'deco_fence', fw: 2, fh: 1 },
  bench: { sprite: 'deco_bench', fw: 3, fh: 1 },
  barrel: { sprite: 'barrel', fw: 1, fh: 1 },
  crates: { sprite: 'crates', fw: 2, fh: 1 },
  hay: { sprite: 'deco_hay', fw: 2, fh: 1 },
  signpost: { sprite: 'deco_signpost', fw: 1, fh: 1 },
  lamp_post: { sprite: 'post_lantern', fw: 1, fh: 1, light: { dy: -15, r: 16 } },
  campfire: { sprite: 'deco_campfire', fw: 2, fh: 1, light: { dy: -6, r: 26 }, fire: true },
  // Споруди для виживання: з ними можна взаємодіяти (act — що відкриває тап).
  workbench: { sprite: 'workbench', fw: 3, fh: 1, act: 'workbench' },
  seed_stand: { sprite: 'seed_stand', fw: 3, fh: 1, act: 'farmshop' },
  // Дощувач поливає грядки довкола (радіус — catalog.farm.sprinklerR), бризкає водою.
  sprinkler: { sprite: 'sprinkler', fw: 1, fh: 1, spray: true },
}

/**
 * Будівлі з рівнями, які гравець ставить сам (хатинка й причал — на своїх місцях).
 * Розміри «ніжок» — ті самі, що в server/src/game/homestead.js (BUILDINGS[].foot).
 * smoke — димар відносно якоря (dx, висота).
 */
export const BUILDING_GEOM = {
  workshop: { fw: 6, fh: 3, sprite: (l) => `workshop_${l}`, smoke: [15, 64], smokeLevel: 2 },
  lighthouse: { fw: 6, fh: 3, sprite: (l) => `lighthouse_${l}` },
}

/** Скільки px від дощувача до центру грядки він поливає — як SPRINKLER_R у server/src/game/farm.js. */
export const SPRINKLER_R = 40

/** Грядка: клаптик землі 16×16, по ньому ходять. */
export const BED_GEOM = { sprite: 'soil_dry', fw: 2, fh: 2, floor: true }

/**
 * Ресурси, що самі з'являються на острові (server/src/game/nodes.js): дерева, каміння, кущі, дари моря.
 * block — «ніжки» [w, h] під якорем, що не пускають (0 — можна переступити).
 */
export const NODE_GEOM = {
  oak: { sprite: 'oak', block: [14, 8] },
  birch: { sprite: 'birch', block: [8, 6] },
  pine: { sprite: 'deco_pine', block: [10, 6] },
  bush: { sprite: 'bush', block: [14, 6] },
  berry_bush: { sprite: 'bush_berry', block: [14, 6] },
  rock: { sprite: 'rock', block: [10, 6] },
  boulder: { sprite: 'rock_big', block: [16, 8] },
  pebble: { sprite: 'pebble' },
  driftwood: { sprite: 'driftwood' },
  shell: { sprite: 'shell' },
  seaweed: { sprite: 'seaweed_pile' },
  // Острів Хуртовини (walk/winter.js): замети копають лопатою, брили б'ють кайлом.
  snow_drift: { sprite: 'w_drift', block: [12, 4] },
  big_drift: { sprite: 'w_drift_big', block: [24, 7] },
  ice_chunk: { sprite: 'w_ice', block: [14, 6] },
  brushwood: { sprite: 'w_brush' },
}

/**
 * Геометрія будь-чого, що можна поставити: декор за id, «b:<будівля>», «bed».
 * level — рівень будівлі (для спрайта привида, коли її переносять).
 */
export function geomOf(kind, level = 1) {
  if (DECO_GEOM[kind]) return DECO_GEOM[kind]
  if (kind === 'bed') return BED_GEOM
  if (kind?.startsWith('b:')) {
    const b = BUILDING_GEOM[kind.slice(2)]
    return b && { sprite: b.sprite(Math.max(1, level)), fw: b.fw, fh: b.fh }
  }
  return null
}

/** Прив'язати точку до сітки так, щоб «ніжки» лягали рівно на клітинки. Якір — низ по центру. */
export function snapDeco(kind, x, y) {
  const g = geomOf(kind)
  const half = (g.fw * CELL) / 2
  const sx = Math.round((x - half) / CELL) * CELL + half
  const sy = Math.round((y + (g.fh * CELL) / 2) / CELL) * CELL
  return { x: sx, y: sy }
}

/** Прямокутник «ніжок» [x, y, w, h]. */
export function decoFootprint(kind, x, y) {
  const g = geomOf(kind)
  return [x - (g.fw * CELL) / 2, y - g.fh * CELL, g.fw * CELL, g.fh * CELL]
}

/** «Ніжки» ресурсу або null, якщо через нього можна переступити. */
export function nodeFootprint(k, x, y) {
  const b = NODE_GEOM[k]?.block
  return b ? [x - b[0] / 2, y - b[1], b[0], b[1]] : null
}
